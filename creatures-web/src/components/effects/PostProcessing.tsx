/**
 * PostProcessing is disabled due to a bug in @react-three/postprocessing@3.0.4
 * where the ChromaticAberration effect crashes with "Cannot read properties of
 * undefined (reading 'length')" during the React commit phase. The error boundary
 * catches it but produces noisy console errors.
 *
 * The scene compensates with emissive materials, additive blending on particles,
 * and the OrganismMaterial shader's built-in glow effects.
 *
 * Fix: upgrade @react-three/postprocessing to v3.1+ when available, or switch to
 * pmndrs/postprocessing v7 which resolves the internal array initialization bug.
 */
export function PostProcessing() {
  return null;
}
