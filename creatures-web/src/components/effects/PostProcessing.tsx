import { Component, type ReactNode } from 'react';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

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
          intensity={1.8}
          luminanceThreshold={0.3}
          luminanceSmoothing={0.7}
          radius={0.9}
          mipmapBlur
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.15} darkness={0.6} />
      </EffectComposer>
    </EffectErrorBoundary>
  );
}
