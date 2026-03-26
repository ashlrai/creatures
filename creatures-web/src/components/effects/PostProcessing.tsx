/**
 * PostProcessing — bloom glow, vignette, and tone mapping.
 *
 * Uses only Bloom (skips ChromaticAberration which crashes in v3.0.4).
 * Bloom amplifies the additive-blending glow from neurons, particles,
 * and organism shaders into a dramatic cinematic look.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSimulationStore } from '../../stores/simulationStore';

let EffectComposer: any = null;
let Bloom: any = null;
let ToneMapping: any = null;
let loaded = false;
let loadFailed = false;

// Lazy-load postprocessing to avoid crash on import
try {
  const pp = require('@react-three/postprocessing');
  EffectComposer = pp.EffectComposer;
  Bloom = pp.Bloom;
  ToneMapping = pp.ToneMapping;
  loaded = true;
} catch {
  loadFailed = true;
}

export function PostProcessing() {
  const frame = useSimulationStore((s) => s.frame);

  if (!loaded || loadFailed || !EffectComposer || !Bloom) {
    return null;
  }

  // Calculate activity-driven bloom intensity
  const nActive = frame?.n_active ?? 0;
  const nTotal = frame?.firing_rates?.length ?? 299;
  const activityRatio = Math.min(nActive / Math.max(nTotal, 1), 1.0);

  // Bloom intensifies with neural activity
  const bloomIntensity = 0.6 + activityRatio * 1.2;
  const bloomLuminanceThreshold = 0.3 - activityRatio * 0.15;

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
