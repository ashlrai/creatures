/**
 * Animated skeleton placeholders for loading states.
 * Used in sidebar panels while demo data is loading.
 */

interface SkeletonProps {
  width?: string | number;
  height?: number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

function SkeletonBar({ width = '100%', height = 14, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div
      className="skeleton-bar"
      style={{
        width,
        height,
        borderRadius,
        background: 'rgba(80, 130, 200, 0.06)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        className="skeleton-shimmer"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(80, 130, 200, 0.08) 50%, transparent 100%)',
          animation: 'skeletonShimmer 1.8s ease-in-out infinite',
        }}
      />
    </div>
  );
}

/** A stat row skeleton: short label on left, value placeholder on right */
function SkeletonStatRow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
      <SkeletonBar width={70} height={11} />
      <SkeletonBar width={36} height={15} borderRadius={3} />
    </div>
  );
}

/** Skeleton for the Neural Activity panel */
export function NeuralActivitySkeleton() {
  return (
    <div className="glass">
      <div className="glass-label">Neural Activity</div>
      <SkeletonStatRow />
      <SkeletonStatRow />
      <SkeletonStatRow />
      <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', gap: 1, marginTop: 8 }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <SkeletonBar
            key={i}
            width={undefined}
            height={4 + Math.random() * 28}
            borderRadius={1}
            style={{ flex: 1, minHeight: 1 }}
          />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the Interaction panel */
export function InteractionSkeleton() {
  return (
    <div className="glass">
      <div className="glass-label">Interaction</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <SkeletonBar height={34} borderRadius={7} style={{ flex: 1 }} />
        <SkeletonBar height={34} borderRadius={7} style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <SkeletonBar height={34} borderRadius={7} style={{ flex: 1 }} />
        <SkeletonBar height={34} borderRadius={7} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

/** Skeleton for the Connectome Explorer panel */
export function ConnectomeSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <div className="glass" style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative', minHeight: 200 }}>
        <div className="glass-label" style={{ position: 'absolute', top: 8, left: 10, zIndex: 2 }}>
          Connectome Explorer
        </div>
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" />
            <div style={{ fontSize: 10, color: 'rgba(140, 170, 200, 0.4)', marginTop: 8 }}>
              Loading connectome...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the Waveform / bottom bar */
export function WaveformSkeleton() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      {Array.from({ length: 80 }).map((_, i) => (
        <SkeletonBar
          key={i}
          width={undefined}
          height={6 + Math.sin(i * 0.3) * 12 + Math.random() * 8}
          borderRadius={1}
          style={{ flex: 1, maxWidth: 4, opacity: 0.5 }}
        />
      ))}
    </div>
  );
}
