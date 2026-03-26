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

export function useHashRouter(
  currentState: HashState,
  onHashChange: (state: HashState) => void,
  onShareState?: (state: ShareableState) => void,
) {
  const suppressRef = useRef(0);

  // On mount: read hash and push state to app
  useEffect(() => {
    const hash = window.location.hash;

    // Check for shareable state route first
    if (isShareStateRoute(hash) && onShareState) {
      const payload = extractSharePayload(hash);
      if (payload) {
        const decoded = decodeState(payload);
        if (decoded) {
          onShareState(decoded);
          return;
        }
      }
    }

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

      // Handle share state routes
      if (isShareStateRoute(hash) && onShareState) {
        const payload = extractSharePayload(hash);
        if (payload) {
          const decoded = decodeState(payload);
          if (decoded) {
            onShareState(decoded);
            return;
          }
        }
      }

      const parsed = parseHash(hash);
      if (parsed) onHashChange(parsed);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [onHashChange, onShareState]);
}
