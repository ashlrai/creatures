/**
 * Shareable experiment state encoding/decoding.
 *
 * Encodes the current experiment configuration into a URL-safe base64 string
 * that can be shared and restored via the hash router.
 */

export interface ShareableState {
  organism: string;
  modifications: Array<{ type: string; neuronIds: string[] }>;
  parameters: { tau_m?: number; tau_syn?: number; weight_scale?: number };
  drugState: { compound?: string; dose?: number } | null;
  appMode: 'sim' | 'evo' | 'eco' | 'museum';
  researchMode: boolean;
}

/**
 * Encode a ShareableState into a URL-safe base64 string.
 * Uses standard base64 with URL-safe character replacements (+/= -> -_.).
 */
export function encodeState(state: ShareableState): string {
  const json = JSON.stringify(state);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  // Make URL-safe: replace +, /, = with -, _, .
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.');
}

/**
 * Decode a URL-safe base64 string back into a ShareableState.
 * Returns null if decoding or parsing fails.
 */
export function decodeState(encoded: string): ShareableState | null {
  try {
    // Reverse URL-safe replacements
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '=');
    const json = decodeURIComponent(escape(atob(base64)));
    const parsed = JSON.parse(json);

    // Validate essential fields
    if (!parsed || typeof parsed.organism !== 'string') return null;
    if (!['sim', 'evo', 'eco'].includes(parsed.appMode)) return null;

    return {
      organism: parsed.organism,
      modifications: Array.isArray(parsed.modifications) ? parsed.modifications : [],
      parameters: parsed.parameters && typeof parsed.parameters === 'object' ? parsed.parameters : {},
      drugState: parsed.drugState || null,
      appMode: parsed.appMode,
      researchMode: !!parsed.researchMode,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a full shareable URL for the given state.
 */
export function generateShareUrl(state: ShareableState): string {
  const encoded = encodeState(state);
  return `${window.location.origin}${window.location.pathname}#/app/share/${encoded}`;
}

/**
 * Check if a hash string is a shareable state route.
 */
export function isShareStateRoute(hash: string): boolean {
  const path = hash.replace(/^#\/?/, '');
  return path.startsWith('app/share/');
}

/**
 * Extract the encoded state string from a share route hash.
 */
export function extractSharePayload(hash: string): string | null {
  const path = hash.replace(/^#\/?/, '');
  if (!path.startsWith('app/share/')) return null;
  const encoded = path.slice('app/share/'.length);
  return encoded || null;
}

/**
 * Build a human-readable summary of the shareable state.
 */
export function summarizeState(state: ShareableState): string {
  const parts: string[] = [];

  // Organism name
  const orgNames: Record<string, string> = {
    c_elegans: 'C. elegans',
    drosophila: 'Drosophila',
    zebrafish: 'Zebrafish',
  };
  parts.push(orgNames[state.organism] ?? state.organism);

  // Modifications
  if (state.modifications.length > 0) {
    const lesions = state.modifications.filter((m) => m.type === 'lesion').length;
    const stims = state.modifications.filter((m) => m.type === 'stimulate').length;
    const silenced = state.modifications.filter((m) => m.type === 'silence').length;
    if (lesions > 0) parts.push(`${lesions} lesion${lesions > 1 ? 's' : ''}`);
    if (stims > 0) parts.push(`${stims} stimulation${stims > 1 ? 's' : ''}`);
    if (silenced > 0) parts.push(`${silenced} silenced`);
  }

  // Drug state
  if (state.drugState?.compound) {
    parts.push(`${state.drugState.compound} ${state.drugState.dose ?? 1}x`);
  }

  // Parameters
  const paramKeys = Object.keys(state.parameters);
  if (paramKeys.length > 0) {
    parts.push(`${paramKeys.length} param${paramKeys.length > 1 ? 's' : ''} modified`);
  }

  // Mode
  const modeLabels: Record<string, string> = { sim: 'Simulation', evo: 'Evolution', eco: 'Ecosystem' };
  parts.push(modeLabels[state.appMode] ?? state.appMode);

  if (state.researchMode) parts.push('Research mode');

  return parts.join(', ');
}
