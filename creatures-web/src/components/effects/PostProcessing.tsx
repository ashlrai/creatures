import { Component, type ReactNode } from 'react';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

class EffectErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('PostProcessing failed (non-fatal):', error.message);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function PostProcessing() {
  return (
    <EffectErrorBoundary>
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.2}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          radius={0.8}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.12} darkness={0.7} />
      </EffectComposer>
    </EffectErrorBoundary>
  );
}
