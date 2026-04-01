// ============================================================================
// HallOfLife — Museum wrapper around the UnifiedWorld organism simulation
// Renders the live neural evolution simulation with a museum-styled overlay
// ============================================================================

import React from 'react';
import { UnifiedWorld } from '../world/UnifiedWorld';
import { useMuseumStore } from '../../stores/museumStore';

const styles = {
  container: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: 'linear-gradient(180deg, rgba(10,10,15,0.85) 0%, rgba(10,10,15,0.4) 80%, transparent 100%)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    pointerEvents: 'auto' as const,
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    background: 'linear-gradient(135deg, #00e5ff, #76ff03)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: 400,
  },
  backButton: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    flexShrink: 0,
  },
};

export function HallOfLife() {
  const navigate = useMuseumStore((s) => s.navigate);

  return (
    <div style={styles.container}>
      {/* Museum-styled header overlay */}
      <div style={styles.overlay}>
        <div style={styles.titleSection}>
          <div style={styles.title}>Hall of Living Evolution</div>
          <div style={styles.subtitle}>
            Organisms with real neural networks evolve, hunt, and adapt in real time
          </div>
        </div>
        <button
          style={styles.backButton}
          onClick={() => navigate('timeline')}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
          }}
        >
          Back to Museum
        </button>
      </div>

      {/* The actual simulation */}
      <UnifiedWorld notify={(msg: string) => console.log('[Hall of Life]', msg)} />
    </div>
  );
}
