import type { CSSProperties } from 'react';
import { useEvolutionProgress } from '../../hooks/useEvolutionProgress';

const cellStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  padding: '4px 0',
};

const labelStyle: CSSProperties = {
  fontSize: 8, fontFamily: 'monospace', textTransform: 'uppercase',
  letterSpacing: '0.5px', color: 'rgba(140, 170, 200, 0.4)',
};

const valueStyle: CSSProperties = {
  fontSize: 14, fontFamily: 'monospace', fontWeight: 600,
  color: 'rgba(200, 215, 240, 0.9)',
};

export function ProgressIndicators() {
  const progress = useEvolutionProgress();

  return (
    <div style={{ marginBottom: 6 }}>
      {/* Progress bar */}
      <div style={{
        height: 3, borderRadius: 2, marginBottom: 6,
        background: 'rgba(40, 60, 100, 0.2)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${Math.min(100, progress.percentComplete)}%`,
          background: 'linear-gradient(90deg, #0066cc, #00ccff)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* 2x2 stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 2, textAlign: 'center',
      }}>
        <div style={cellStyle}>
          <span style={labelStyle}>Elapsed</span>
          <span style={valueStyle}>{progress.elapsedFormatted}</span>
        </div>
        <div style={cellStyle}>
          <span style={labelStyle}>ETA</span>
          <span style={valueStyle}>{progress.etaFormatted}</span>
        </div>
        <div style={cellStyle}>
          <span style={labelStyle}>Speed</span>
          <span style={valueStyle}>
            {progress.gensPerSecond > 0 ? `${progress.gensPerSecond.toFixed(1)}/s` : '--'}
          </span>
        </div>
        <div style={cellStyle}>
          <span style={labelStyle}>Progress</span>
          <span style={valueStyle}>
            {progress.currentGen}/{progress.totalGens}
          </span>
        </div>
      </div>
    </div>
  );
}
