import { useEffect, useRef } from 'react';
import {
  isShareStateRoute,
  extractSharePayload,
  decodeState,
  type ShareableState,
} from '../utils/shareableState';

/**
 * Hash-based routing for shareable URLs.
 *
 * Patterns:
 *   #/app/sim/c_elegans        — simulation mode, C. elegans
 *   #/app/sim/drosophila       — simulation mode, fruit fly
 *   #/app/evo                  — evolution mode
 *   #/app/evo/compare          — evolution mode + connectome comparison
 *   #/app/share/{encoded}      — shareable experiment state
 *
 * The root hash (#/ or empty) is reserved for the marketing homepage.
 */

export interface HashState {
  mode: 'sim' | 'evo';
  organism: string;
  compare: boolean;
}

function parseHash(hash: string): HashState | null {
  const path = hash.replace(/^#\/?/, '');
  if (!path) return null;

  // Share state routes are handled separately via onShareState callback
  if (isShareStateRoute(hash)) return null;

  // Strip /app prefix if present
  const stripped = path.startsWith('app/') ? path.slice(4) : path;
  if (!stripped) return null;

  const parts = stripped.split('/');

  if (parts[0] === 'evo') {
    return { mode: 'evo', organism: 'c_elegans', compare: parts[1] === 'compare' };
  }
  if (parts[0] === 'sim' && parts[1]) {
    return { mode: 'sim', organism: parts[1], compare: false };
  }
  return null;
}

function buildHash(state: HashState): string {
  if (state.mode === 'evo') {
    return state.compare ? '#/app/evo/compare' : '#/app/evo';
  }
  return `#/app/sim/${state.organism}`;
}

/** Try to decode a share-state URL and invoke the callback. Returns true if handled. */
function tryHandleShareRoute(
  hash: string,
  onShareState?: (state: ShareableState) => void,
): boolean {
  if (!onShareState || !isShareStateRoute(hash)) return false;
  const payload = extractSharePayload(hash);
  if (!payload) return false;
  const decoded = decodeState(payload);
  if (!decoded) return false;
  onShareState(decoded);
  return true;
}

export function useHashRouter(
  currentState: HashState,
  onHashChange: (state: HashState) => void,
  onShareState?: (state: ShareableState) => void,
) {
  const suppressRef = useRef(0);

  // On mount: read hash and push state to app
  useEffect(() => {
    const hash = window.location.hash;
    if (tryHandleShareRoute(hash, onShareState)) return;

    // Don't override eco/museum mode from hash
    const path = hash.replace(/^#\/?/, '');
    if (path.startsWith('app/eco') || path === 'eco') return;
    if (path.startsWith('app/museum') || path === 'museum') return;

    const initial = parseHash(hash);
    if (initial) {
      onHashChange(initial);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When app state changes, update the hash (suppress the resulting hashchange)
  useEffect(() => {
    // Don't overwrite a share state URL while it's being applied
    if (isShareStateRoute(window.location.hash)) return;

    // Don't overwrite eco/museum hashes — those modes manage their own hashes
    const currentHash = window.location.hash.replace(/^#\/?/, '');
    if (currentHash.startsWith('app/eco') || currentHash === 'eco') return;
    if (currentHash.startsWith('app/museum') || currentHash === 'museum') return;

    const newHash = buildHash(currentState);
    if (window.location.hash !== newHash) {
      suppressRef.current += 1;
      window.location.hash = newHash;
    }
  }, [currentState.mode, currentState.organism, currentState.compare]);

  // Listen for user/browser navigation (back/forward)
  useEffect(() => {
    const handler = () => {
      if (suppressRef.current > 0) {
        suppressRef.current -= 1;
        return;
      }

      const hash = window.location.hash;
      if (tryHandleShareRoute(hash, onShareState)) return;

      const parsed = parseHash(hash);
      if (parsed) onHashChange(parsed);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [onHashChange, onShareState]);
}
