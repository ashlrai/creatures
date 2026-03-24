import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';

const chromaticOffset = new Vector2(0.0004, 0.0004);

export function PostProcessing() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={1.4}
        luminanceThreshold={0.15}
        luminanceSmoothing={0.9}
        radius={0.85}
        mipmapBlur
      />
      <ChromaticAberration
        offset={chromaticOffset}
        radialModulation
        modulationOffset={0.15}
      />
      <Vignette eskil={false} offset={0.12} darkness={0.85} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.1} />
    </EffectComposer>
  );
}
