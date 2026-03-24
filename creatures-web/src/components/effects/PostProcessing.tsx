import { Component, type ReactNode } from 'react';
import { EffectComposer, Bloom, Vignette, DepthOfField } from '@react-three/postprocessing';

class EffectErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.warn('PostProcessing failed:', error.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

export function PostProcessing() {
  return (
    <EffectErrorBoundary>
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.0}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.8}
          radius={0.85}
          mipmapBlur
        />
        <DepthOfField
          focusDistance={0.02}
          focalLength={0.06}
          bokehScale={1.5}
        />
        <Vignette eskil={false} offset={0.15} darkness={0.55} />
      </EffectComposer>
    </EffectErrorBoundary>
  );
}
