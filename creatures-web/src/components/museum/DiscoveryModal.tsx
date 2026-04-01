import React, { useEffect, useState } from 'react';
import type { AlchemyElement } from '../../data/knowledge-graph';
import { ALCHEMY_BY_ID } from '../../data/alchemy';
import { TIER_COLORS } from './ElementCard';

// ============================================================================
// DiscoveryModal — the celebration moment when you discover something new
// Animated entrance, golden glow, particle effects, the whole nine yards.
// This is where the magic happens.
// ============================================================================

// Inject keyframe animations once
const STYLE_ID = 'alchemy-discovery-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes alch-modal-enter {
      0% { opacity: 0; transform: scale(0.3) translateY(40px); }
      50% { opacity: 1; transform: scale(1.05) translateY(-5px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes alch-backdrop-enter {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes alch-icon-pulse {
      0% { transform: scale(1); filter: drop-shadow(0 0 20px var(--glow-color)); }
      50% { transform: scale(1.08); filter: drop-shadow(0 0 40px var(--glow-color)); }
      100% { transform: scale(1); filter: drop-shadow(0 0 20px var(--glow-color)); }
    }
    @keyframes alch-sparkle {
      0% { opacity: 0; transform: translate(0, 0) scale(0); }
      20% { opacity: 1; transform: translate(var(--dx), var(--dy)) scale(1); }
      100% { opacity: 0; transform: translate(calc(var(--dx) * 2.5), calc(var(--dy) * 2.5)) scale(0); }
    }
    @keyframes alch-ring-expand {
      0% { opacity: 0.8; transform: scale(0.3); }
      100% { opacity: 0; transform: scale(2.5); }
    }
    @keyframes alch-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes alch-text-reveal {
      0% { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

interface DiscoveryModalProps {
  element: AlchemyElement;
  ingredientA: AlchemyElement;
  ingredientB: AlchemyElement;
  onClose: () => void;
  onNavigateToEvent?: (eventId: string) => void;
  onTalkToCharacter?: (characterId: string) => void;
}

// Sparkle positions — pre-computed for CSS var injection
const SPARKLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const r = 60 + Math.random() * 40;
  return {
    dx: Math.cos(angle) * r,
    dy: Math.sin(angle) * r,
    delay: Math.random() * 0.6,
    char: ['✦', '✧', '⋆', '✵', '✶', '⊹'][Math.floor(Math.random() * 6)],
  };
});

export function DiscoveryModal({ element, ingredientA, ingredientB, onClose, onNavigateToEvent, onTalkToCharacter }: DiscoveryModalProps) {
  const [visible, setVisible] = useState(false);
  const tierColor = TIER_COLORS[element.tier] ?? '#F1C40F';

  useEffect(() => {
    ensureKeyframes();
    // Slight delay to trigger CSS animations
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Discover-by info
  const discovererName = element.discoveredBy
    ? ALCHEMY_BY_ID.get(element.discoveredBy)?.name ?? element.discoveredBy.replace(/-/g, ' ')
    : null;

  // Unlocks info
  const unlocks: string[] = [];
  if (element.unlocksCharacterId) unlocks.push(`Character: ${element.unlocksCharacterId.replace(/-/g, ' ')}`);
  if (element.unlocksEventId) unlocks.push(`Event: ${element.unlocksEventId.replace(/-/g, ' ')}`);
  if (element.unlocksSimulation) unlocks.push(`Simulation: ${element.unlocksSimulation.replace(/-/g, ' ')}`);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(12px)',
        animation: 'alch-backdrop-enter 0.3s ease-out',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 420,
          maxWidth: '92vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: `linear-gradient(170deg, rgba(25,20,35,0.98), rgba(12,10,18,0.99))`,
          border: `1px solid ${tierColor}44`,
          borderRadius: 20,
          padding: '40px 32px 28px',
          animation: visible ? 'alch-modal-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : 'none',
          boxShadow: `
            0 0 60px ${tierColor}33,
            0 0 120px ${tierColor}11,
            0 20px 60px rgba(0,0,0,0.6),
            inset 0 1px 0 rgba(255,255,255,0.06)
          `,
        }}
      >
        {/* Expanding ring effects */}
        {[0, 0.3, 0.6].map((delay, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 100,
            height: 100,
            marginTop: -90,
            marginLeft: -50,
            borderRadius: '50%',
            border: `2px solid ${tierColor}44`,
            animation: `alch-ring-expand 1.5s ease-out ${delay}s infinite`,
            pointerEvents: 'none',
          }} />
        ))}

        {/* Sparkle particles */}
        <div style={{
          position: 'absolute',
          top: 80,
          left: '50%',
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}>
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                fontSize: 14,
                color: tierColor,
                ['--dx' as any]: `${s.dx}px`,
                ['--dy' as any]: `${s.dy}px`,
                animation: `alch-sparkle 1.4s ease-out ${s.delay}s infinite`,
              }}
            >
              {s.char}
            </span>
          ))}
        </div>

        {/* Recipe display: A + B = Result */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 8,
          animation: 'alch-text-reveal 0.4s ease-out 0.2s both',
        }}>
          <span style={{ fontSize: 28 }}>{ingredientA.icon}</span>
          <span style={{ fontSize: 18, color: 'rgba(200,220,240,0.3)', fontWeight: 300 }}>+</span>
          <span style={{ fontSize: 28 }}>{ingredientB.icon}</span>
          <span style={{ fontSize: 18, color: 'rgba(200,220,240,0.3)', fontWeight: 300 }}>=</span>
        </div>

        {/* Main icon */}
        <div style={{
          textAlign: 'center',
          marginBottom: 16,
          ['--glow-color' as any]: tierColor,
          animation: 'alch-icon-pulse 2s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 72, lineHeight: 1 }}>{element.icon}</span>
        </div>

        {/* Name */}
        <h2 style={{
          textAlign: 'center',
          margin: '0 0 4px',
          fontSize: 26,
          fontWeight: 700,
          color: '#F0F0F0',
          letterSpacing: '0.02em',
          animation: 'alch-text-reveal 0.5s ease-out 0.3s both',
          background: `linear-gradient(90deg, ${tierColor}, #fff, ${tierColor})`,
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animationName: 'alch-shimmer',
          animationDuration: '3s',
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          animationDelay: '0.6s',
        }}>
          {element.name}
        </h2>

        {/* Tier + Category */}
        <div style={{
          textAlign: 'center',
          marginBottom: 16,
          animation: 'alch-text-reveal 0.5s ease-out 0.35s both',
        }}>
          <span style={{
            fontSize: 10,
            color: tierColor,
            background: `${tierColor}18`,
            padding: '3px 10px',
            borderRadius: 8,
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Tier {element.tier} &middot; {element.category}
          </span>
        </div>

        {/* Description */}
        <p style={{
          margin: '0 0 16px',
          fontSize: 14,
          lineHeight: 1.65,
          color: 'rgba(200,215,235,0.85)',
          textAlign: 'center',
          animation: 'alch-text-reveal 0.5s ease-out 0.45s both',
        }}>
          {element.description}
        </p>

        {/* Discovered by */}
        {(discovererName || element.year) && (
          <div style={{
            textAlign: 'center',
            marginBottom: 14,
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.05)',
            animation: 'alch-text-reveal 0.5s ease-out 0.55s both',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(200,220,240,0.5)' }}>
              {discovererName && (
                <>
                  Discovered by{' '}
                  <span style={{ color: tierColor, fontWeight: 600 }}>
                    {discovererName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </span>
                </>
              )}
              {discovererName && element.year && ' in '}
              {!discovererName && element.year && 'Year: '}
              {element.year && (
                <span style={{ color: 'rgba(200,220,240,0.8)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {element.year}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Unlocks — now clickable */}
        {(element.unlocksCharacterId || element.unlocksEventId || element.unlocksSimulation) && (
          <div style={{
            marginBottom: 20,
            padding: '12px 16px',
            background: `linear-gradient(135deg, ${tierColor}0A, ${tierColor}05)`,
            borderRadius: 10,
            border: `1px solid ${tierColor}22`,
            animation: 'alch-text-reveal 0.5s ease-out 0.65s both',
          }}>
            <div style={{
              fontSize: 9,
              color: tierColor,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              Unlocked
            </div>
            {element.unlocksCharacterId && (
              <button
                onClick={() => { onTalkToCharacter?.(element.unlocksCharacterId!); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 12px', marginBottom: 4,
                  background: 'rgba(200,160,80,0.1)', border: '1px solid rgba(200,160,80,0.2)',
                  borderRadius: 6, color: '#d4b868', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <span>&#x1F4AC;</span>
                <span>Talk to {element.unlocksCharacterId.replace(/-/g, ' ')}</span>
              </button>
            )}
            {element.unlocksEventId && (
              <button
                onClick={() => { onNavigateToEvent?.(element.unlocksEventId!); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 12px', marginBottom: 4,
                  background: 'rgba(100,140,200,0.1)', border: '1px solid rgba(100,140,200,0.2)',
                  borderRadius: 6, color: '#8ab4d8', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <span>&#x1F4CD;</span>
                <span>Visit: {element.unlocksEventId.replace(/-/g, ' ')}</span>
              </button>
            )}
            {element.unlocksSimulation && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', fontSize: 12,
                color: 'rgba(100,200,150,0.7)',
              }}>
                <span>&#x26A1;</span>
                <span>Simulation unlocked: {element.unlocksSimulation.replace(/-/g, ' ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleClose}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 24px',
            background: `linear-gradient(135deg, ${tierColor}33, ${tierColor}1A)`,
            border: `1px solid ${tierColor}55`,
            borderRadius: 10,
            color: '#F0F0F0',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.03em',
            transition: 'all 0.2s ease',
            animation: 'alch-text-reveal 0.5s ease-out 0.75s both',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${tierColor}55, ${tierColor}33)`;
            e.currentTarget.style.boxShadow = `0 0 20px ${tierColor}33`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${tierColor}33, ${tierColor}1A)`;
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Continue Exploring
        </button>
      </div>
    </div>
  );
}
