import { Component, type ReactNode, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ToneMapping, ChromaticAberration } from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction } from 'postprocessing';

class EffectErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.warn('PostProcessing failed:', error.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

type QualityLevel = 'high' | 'medium' | 'low';

function AdaptiveQuality({ children }: { children: (quality: QualityLevel) => ReactNode }) {
  const frameTimes = useRef<number[]>([]);
  const [quality, setQuality] = useState<QualityLevel>('high');
  const stableRef = useRef(0);
  const lastChangeRef = useRef(0);

  useFrame((_, delta) => {
    frameTimes.current.push(delta * 1000);
    if (frameTimes.current.length > 90) frameTimes.current.shift();
    if (frameTimes.current.length < 90) return;

    const avg = frameTimes.current.reduce((a, b) => a + b, 0) / 90;
    const now = performance.now();
    if (now - lastChangeRef.current < 3000) return;

    if (avg > 22 && quality !== 'low') {
      setQuality('low'); lastChangeRef.current = now; stableRef.current = 0;
    } else if (avg > 14 && quality === 'high') {
      setQuality('medium'); lastChangeRef.current = now; stableRef.current = 0;
    } else if (avg <= 14 && quality !== 'high') {
      stableRef.current++;
      if (stableRef.current >= 120) {
        setQuality(quality === 'low' ? 'medium' : 'high');
        lastChangeRef.current = now; stableRef.current = 0;
      }
    }
  });

  return <>{children(quality)}</>;
}

export function PostProcessing() {
  return (
    <EffectErrorBoundary>
      <AdaptiveQuality>
        {(quality) => (
          <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
            <Bloom
              intensity={quality === 'low' ? 1.2 : 1.8}
              luminanceThreshold={0.2}
              luminanceSmoothing={0.7}
              radius={quality === 'low' ? 0.8 : 1.2}
              mipmapBlur
            />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette eskil={false} offset={0.12} darkness={quality === 'low' ? 0.5 : 0.65} />
            <ChromaticAberration
              blendFunction={BlendFunction.NORMAL}
              offset={[quality === 'low' ? 0 : 0.0006, quality === 'low' ? 0 : 0.0006] as any}
            />
          </EffectComposer>
        )}
      </AdaptiveQuality>
    </EffectErrorBoundary>
  );
}
