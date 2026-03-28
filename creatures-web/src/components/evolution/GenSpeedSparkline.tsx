import { useEvolutionProgress } from '../../hooks/useEvolutionProgress';

const WIDTH = 180;
const HEIGHT = 28;

export function GenSpeedSparkline() {
  const { speedHistory } = useEvolutionProgress();

  if (speedHistory.length < 2) return null;

  const maxVal = Math.max(...speedHistory, 1);
  const minVal = Math.min(...speedHistory, 0);
  const range = Math.max(maxVal - minVal, 1);

  const points = speedHistory.map((v, i) => {
    const x = (i / (speedHistory.length - 1)) * WIDTH;
    const y = HEIGHT - ((v - minVal) / range) * (HEIGHT - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '2px 0',
    }}>
      <span style={{
        fontSize: 8, fontFamily: 'monospace', textTransform: 'uppercase',
        color: 'rgba(140, 170, 200, 0.35)', letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
      }}>
        Gen Speed
      </span>
      <svg width={WIDTH} height={HEIGHT} style={{ display: 'block' }}>
        <polyline
          points={points}
          fill="none"
          stroke="#00cc66"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
