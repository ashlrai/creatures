/**
 * PostProcessing — bloom glow, vignette, and tone mapping.
 *
 * Uses only Bloom (skips ChromaticAberration which crashes in v3.0.4).
 * Bloom amplifies the additive-blending glow from neurons, particles,
 * and organism shaders into a dramatic cinematic look.
 */
import { useSimulationStore } from '../../stores/simulationStore';

import { EffectComposer, Bloom } from '@react-three/postprocessing';

export function PostProcessing() {
  const frame = useSimulationStore((s) => s.frame);

  // Calculate activity-driven bloom intensity
  const nActive = frame?.n_active ?? 0;
  const nTotal = frame?.firing_rates?.length ?? 299;
  const activityRatio = Math.min(nActive / Math.max(nTotal, 1), 1.0);

  // Subtle bloom — enhance glow without washing out the scene
  const bloomIntensity = 0.3 + activityRatio * 0.5;
  const bloomLuminanceThreshold = 0.5 - activityRatio * 0.1;

  try {
    return (
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={Math.max(bloomLuminanceThreshold, 0.1)}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.7}
        />
      </EffectComposer>
    );
  } catch {
    // If postprocessing crashes, fail silently
    return null;
  }
}
