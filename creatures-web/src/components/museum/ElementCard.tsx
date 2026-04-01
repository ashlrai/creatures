import React from 'react';
import type { AlchemyElement } from '../../data/knowledge-graph';

// ============================================================================
// ElementCard — reusable card for alchemy elements
// States: discovered (full color), undiscovered (grayscale), selected (glow)
// ============================================================================

const TIER_COLORS: Record<number, string> = {
  0: '#8B7355',   // base — earthy bronze
  1: '#5B8C5A',   // simple — mossy green
  2: '#4A7FB5',   // materials — steel blue
  3: '#9B59B6',   // tools — violet
  4: '#E67E22',   // scientific — amber
  5: '#E74C3C',   // advanced — crimson
  6: '#F1C40F',   // cutting-edge — gold
};

const TIER_LABELS: Record<number, string> = {
  0: 'Base',
  1: 'Simple',
  2: 'Material',
  3: 'Tool',
  4: 'Theory',
  5: 'Advanced',
  6: 'Frontier',
};

const CATEGORY_ICONS: Record<string, string> = {
  element: '🜁',
  material: '⬡',
  force: '⚛',
  concept: '◈',
  invention: '⚙',
  theory: '∞',
  organism: '🧬',
  phenomenon: '◎',
};

interface ElementCardProps {
  element: AlchemyElement;
  discovered: boolean;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function ElementCard({
  element,
  discovered,
  selected = false,
  compact = true,
  onClick,
  disabled = false,
}: ElementCardProps) {
  const tierColor = TIER_COLORS[element.tier] ?? '#666';
  const canInteract = discovered && !disabled;

  if (compact) {
    return (
      <button
        onClick={canInteract ? onClick : undefined}
        title={discovered ? `${element.name} — Tier ${element.tier}` : '???'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          width: 72,
          height: 72,
          padding: 6,
          background: discovered
            ? selected
              ? `linear-gradient(135deg, ${tierColor}33, ${tierColor}18)`
              : 'rgba(255,255,255,0.04)'
            : 'rgba(255,255,255,0.015)',
          border: selected
            ? `2px solid ${tierColor}`
            : discovered
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px dashed rgba(255,255,255,0.06)',
          borderRadius: 10,
          cursor: canInteract ? 'pointer' : 'default',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          outline: 'none',
          fontFamily: 'inherit',
          filter: discovered ? 'none' : 'grayscale(1) brightness(0.3)',
          opacity: discovered ? 1 : 0.4,
          boxShadow: selected
            ? `0 0 20px ${tierColor}44, 0 0 40px ${tierColor}22, inset 0 0 15px ${tierColor}11`
            : discovered
              ? '0 2px 8px rgba(0,0,0,0.3)'
              : 'none',
        }}
        onMouseEnter={(e) => {
          if (canInteract) {
            e.currentTarget.style.background = `linear-gradient(135deg, ${tierColor}22, ${tierColor}11)`;
            e.currentTarget.style.borderColor = `${tierColor}88`;
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
            e.currentTarget.style.boxShadow = `0 4px 16px ${tierColor}33`;
          }
        }}
        onMouseLeave={(e) => {
          if (canInteract) {
            e.currentTarget.style.background = selected
              ? `linear-gradient(135deg, ${tierColor}33, ${tierColor}18)`
              : 'rgba(255,255,255,0.04)';
            e.currentTarget.style.borderColor = selected ? tierColor : 'rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = selected
              ? `0 0 20px ${tierColor}44, 0 0 40px ${tierColor}22, inset 0 0 15px ${tierColor}11`
              : '0 2px 8px rgba(0,0,0,0.3)';
          }
        }}
      >
        {/* Tier dot */}
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: discovered ? tierColor : 'rgba(255,255,255,0.1)',
        }} />

        <span style={{ fontSize: discovered ? 24 : 18, lineHeight: 1 }}>
          {discovered ? element.icon : '?'}
        </span>
        <span style={{
          fontSize: 9,
          color: discovered ? 'rgba(200,220,240,0.8)' : 'rgba(200,220,240,0.2)',
          textAlign: 'center',
          lineHeight: 1.1,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {discovered ? element.name : '???'}
        </span>
      </button>
    );
  }

  // Expanded mode — for the workbench slots
  return (
    <div
      onClick={canInteract ? onClick : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: 140,
        height: 160,
        padding: 16,
        background: discovered
          ? `linear-gradient(160deg, ${tierColor}22, rgba(15,18,30,0.9))`
          : 'rgba(255,255,255,0.02)',
        border: selected
          ? `2px solid ${tierColor}`
          : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        cursor: canInteract ? 'pointer' : 'default',
        position: 'relative',
        transition: 'all 0.3s ease',
        boxShadow: selected
          ? `0 0 30px ${tierColor}55, 0 0 60px ${tierColor}22`
          : '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Tier badge */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        fontSize: 8,
        color: tierColor,
        background: `${tierColor}18`,
        padding: '2px 6px',
        borderRadius: 4,
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        {TIER_LABELS[element.tier] ?? `T${element.tier}`}
      </div>

      {/* Category sigil */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: 10,
        fontSize: 10,
        color: 'rgba(200,220,240,0.25)',
      }}>
        {CATEGORY_ICONS[element.category] ?? '◇'}
      </div>

      <span style={{
        fontSize: 42,
        lineHeight: 1,
        filter: discovered ? 'none' : 'grayscale(1) brightness(0.2)',
      }}>
        {discovered ? element.icon : '?'}
      </span>

      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: discovered ? 'rgba(220,230,245,0.95)' : 'rgba(200,220,240,0.2)',
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        {discovered ? element.name : '???'}
      </span>

      {discovered && element.year && (
        <span style={{
          fontSize: 10,
          color: `${tierColor}BB`,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {element.year}
        </span>
      )}
    </div>
  );
}

export { TIER_COLORS, TIER_LABELS };
