import { useEvolutionStore } from '../../stores/evolutionStore';
import { CHALLENGE_PRESETS } from '../../data/challengePresets';

const difficultyColors: Record<string, string> = {
  beginner: '#00cc66',
  intermediate: '#ffaa22',
  advanced: '#ff4466',
};

export function ChallengeSelector() {
  const selectedChallenge = useEvolutionStore((s) => s.selectedChallenge);
  const setSelectedChallenge = useEvolutionStore((s) => s.setSelectedChallenge);
  const status = useEvolutionStore((s) => s.currentRun?.status);

  // During active evolution, show compact badge instead of full selector
  if (status === 'running' || status === 'paused') {
    const active = CHALLENGE_PRESETS.find((p) => p.id === (selectedChallenge ?? 'open-field'));
    if (!active) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', marginBottom: 6,
        background: 'rgba(0, 180, 255, 0.06)',
        border: '1px solid rgba(0, 180, 255, 0.15)',
        borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
      }}>
        <span style={{ fontSize: 14 }}>{active.icon}</span>
        <span style={{ color: '#00ccff' }}>{active.name}</span>
        <span style={{ color: 'rgba(140, 170, 200, 0.4)', fontSize: 9 }}>{active.evolutionaryPressure}</span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'rgba(140, 170, 200, 0.5)',
        marginBottom: 6, paddingLeft: 2,
      }}>
        Challenge Environment
      </div>
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
        scrollbarWidth: 'thin',
      }}>
        {CHALLENGE_PRESETS.map((preset) => {
          const isSelected = (selectedChallenge ?? 'open-field') === preset.id;
          const diffColor = difficultyColors[preset.difficulty] ?? '#888';
          return (
            <button
              key={preset.id}
              onClick={() => setSelectedChallenge(preset.id)}
              style={{
                flex: '0 0 140px',
                padding: '8px 10px',
                background: isSelected
                  ? 'rgba(0, 180, 255, 0.1)'
                  : 'rgba(20, 30, 50, 0.5)',
                border: isSelected
                  ? '1px solid rgba(0, 180, 255, 0.4)'
                  : '1px solid rgba(60, 80, 120, 0.2)',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                boxShadow: isSelected
                  ? '0 0 12px rgba(0, 180, 255, 0.15)'
                  : 'none',
              }}
            >
              {/* Icon and name */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4,
              }}>
                <span style={{ fontSize: 16 }}>{preset.icon}</span>
                <span style={{
                  fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
                  color: isSelected ? '#00ccff' : 'rgba(200, 210, 230, 0.8)',
                }}>
                  {preset.name}
                </span>
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <span style={{
                  fontSize: 8, fontFamily: 'monospace', textTransform: 'uppercase',
                  padding: '1px 4px', borderRadius: 3,
                  background: `${diffColor}22`, color: diffColor,
                  letterSpacing: '0.3px',
                }}>
                  {preset.difficulty}
                </span>
                <span style={{
                  fontSize: 8, fontFamily: 'monospace',
                  padding: '1px 4px', borderRadius: 3,
                  background: 'rgba(100, 140, 200, 0.1)',
                  color: 'rgba(140, 170, 200, 0.6)',
                }}>
                  {preset.evolutionaryPressure}
                </span>
              </div>

              {/* Description */}
              <div style={{
                fontSize: 9, fontFamily: 'monospace',
                color: 'rgba(140, 170, 200, 0.4)',
                lineHeight: '1.3',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {preset.description}
              </div>

              {/* Recommended settings */}
              <div style={{
                marginTop: 4, fontSize: 8, fontFamily: 'monospace',
                color: 'rgba(140, 170, 200, 0.3)',
              }}>
                {preset.recommendedPopulation} pop / {preset.recommendedGenerations} gen
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
