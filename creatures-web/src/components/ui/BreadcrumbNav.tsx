import { useNavigationStore, type ZoomLevel } from '../../stores/navigationStore';

const LEVEL_ICONS: Record<ZoomLevel, string> = {
  ecosystem: '🌍',
  organism: '🧬',
  circuit: '🔗',
  neuron: '⚡',
};

export function BreadcrumbNav() {
  const breadcrumbs = useNavigationStore((s) => s.breadcrumbs);
  const currentLevel = useNavigationStore((s) => s.currentLevel);
  const goToLevel = useNavigationStore((s) => s.goToLevel);
  const goBack = useNavigationStore((s) => s.goBack);

  if (breadcrumbs.length <= 1) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '4px 12px',
      background: 'rgba(6, 8, 18, 0.85)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
      minHeight: 28,
    }}>
      <button
        onClick={goBack}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(200, 220, 240, 0.5)',
          cursor: 'pointer',
          padding: '2px 8px 2px 0',
          fontSize: 13,
          fontFamily: 'inherit',
        }}
        title="Go back"
      >
        ←
      </button>

      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1;
        const isCurrent = crumb.level === currentLevel;
        return (
          <span key={`${crumb.level}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && (
              <span style={{ color: 'rgba(200, 220, 240, 0.2)', padding: '0 6px' }}>›</span>
            )}
            <button
              onClick={() => !isLast && goToLevel(i)}
              style={{
                background: isCurrent ? 'rgba(0, 212, 255, 0.08)' : 'none',
                border: isCurrent ? '1px solid rgba(0, 212, 255, 0.15)' : '1px solid transparent',
                borderRadius: 4,
                color: isCurrent ? 'rgba(0, 212, 255, 0.9)' : 'rgba(200, 220, 240, 0.5)',
                cursor: isLast ? 'default' : 'pointer',
                padding: '2px 8px',
                fontSize: 11,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              disabled={isLast}
            >
              {LEVEL_ICONS[crumb.level]} {crumb.label}
              {crumb.entityId && (
                <span style={{ color: 'rgba(200, 220, 240, 0.3)', marginLeft: 4 }}>
                  {crumb.entityId.length > 12 ? crumb.entityId.slice(0, 12) + '…' : crumb.entityId}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </div>
  );
}
