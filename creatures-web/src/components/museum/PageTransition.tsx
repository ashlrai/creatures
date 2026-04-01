// ============================================================================
// PageTransition — lightweight CSS fade+slide wrapper for museum view changes
// Uses injected keyframes (same pattern as DiscoveryModal.tsx)
// ============================================================================

import { useEffect, type ReactNode } from 'react';

const STYLE_ID = 'museum-page-transition-styles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes museum-page-enter {
      0% { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

interface PageTransitionProps {
  /** Change this to trigger a remount + animation (e.g. view + entityId) */
  transitionKey: string;
  children: ReactNode;
}

export function PageTransition({ transitionKey, children }: PageTransitionProps) {
  useEffect(() => {
    ensureStyles();
  }, []);

  return (
    <div
      key={transitionKey}
      style={{
        animation: 'museum-page-enter 300ms ease-out both',
        willChange: 'opacity, transform',
        height: '100%',
      }}
    >
      {children}
    </div>
  );
}
