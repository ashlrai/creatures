import { Component, type ReactNode } from 'react';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

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
          intensity={1.2}
          luminanceThreshold={0.4}
          luminanceSmoothing={0.75}
          radius={0.85}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.12} darkness={0.5} />
      </EffectComposer>
    </EffectErrorBoundary>
  );
}
