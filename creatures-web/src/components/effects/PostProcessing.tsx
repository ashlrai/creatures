/**
 * PostProcessing — temporarily disabled due to @react-three/postprocessing
 * compatibility issue with postprocessing@6.39.0. The EffectComposer Bloom
 * effect throws "Cannot read properties of undefined (reading 'length')"
 * during commit phase. The scene uses emissive materials + additive blending
 * for glow instead.
 *
 * To re-enable: upgrade @react-three/postprocessing to latest or downgrade
 * postprocessing to ~6.35.0.
 */
export function PostProcessing() {
  return null;
}
