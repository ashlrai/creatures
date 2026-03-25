import { type ReactNode, useCallback } from 'react';
import { useUIPreferencesStore } from '../../stores/uiPreferencesStore';

interface CollapsiblePanelProps {
  id: string;
  label: string;
  badge?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function CollapsiblePanel({ id, label, badge, defaultExpanded = false, children }: CollapsiblePanelProps) {
  const expandedPanels = useUIPreferencesStore((s) => s.expandedPanels);
  const setPanelExpanded = useUIPreferencesStore((s) => s.setPanelExpanded);

  const expanded = expandedPanels[id] ?? defaultExpanded;

  const toggle = useCallback(() => {
    setPanelExpanded(id, !expanded);
  }, [id, expanded, setPanelExpanded]);

  return (
    <div className="collapsible-panel glass-panel" style={{ overflow: 'hidden' }}>
      <button
        className="collapsible-panel-header"
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-primary, #ccd)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textAlign: 'left',
        }}
        aria-expanded={expanded}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          &#9654;
        </span>
        <span style={{ flex: 1 }}>{label}</span>
        {badge && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--accent-cyan, #0ff)',
              color: '#000',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </span>
        )}
      </button>
      <div
        style={{
          maxHeight: expanded ? 2000 : 0,
          opacity: expanded ? 1 : 0,
          transition: 'max-height 0.3s ease, opacity 0.2s ease',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '4px 12px 12px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
