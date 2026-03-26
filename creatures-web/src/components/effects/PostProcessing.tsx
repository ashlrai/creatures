/**
 * PostProcessing is disabled.
 *
 * @react-three/postprocessing v3.0.4 has a fatal bug where EffectComposer
 * crashes with "Cannot read properties of undefined (reading 'length')"
 * when the scene changes (e.g., switching organisms). This crashes the
 * entire 3D canvas, making the app unusable.
 *
 * The scene compensates with:
 * - Emissive materials (OrganismMaterial shader)
 * - Additive blending on particles and neural effects
 * - Dynamic lighting from ConsciousnessEffects
 *
 * TODO: Upgrade to @react-three/postprocessing v3.1+ when available.
 */
export function PostProcessing() {
  return null;
}
