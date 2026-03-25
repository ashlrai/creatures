import { Suspense, lazy } from 'react';

const HeroVisualization = lazy(() =>
  import('./HeroVisualization').then((m) => ({ default: m.HeroVisualization }))
);

export function HeroSection() {
  return (
    <section className="hp-hero">
      <div className="hp-hero__content">
        <div className="hp-hero__eyebrow">Connectome-Driven Simulation</div>
        <h1 className="hp-hero__headline">
          Simulate Real
          <br />
          Biological Brains
        </h1>
        <p className="hp-hero__sub">
          Virtual organisms powered by published neural wiring data. Spiking networks,
          synaptic plasticity, and evolutionary algorithms — running live in your browser.
        </p>
        <div className="hp-hero__actions">
          <a href="#/app/sim/c_elegans" className="hp-hero__btn-primary">
            Launch Platform
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <a href="#science" className="hp-hero__btn-secondary">
            Read the Science
          </a>
        </div>
      </div>
      <div className="hp-hero__viz" style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0a1628 0%, #040810 60%, #020408 100%)',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
      }}>
        <Suspense fallback={
          <div style={{
            width: '100%',
            height: '100%',
            minHeight: 400,
            borderRadius: 24,
            background: 'radial-gradient(ellipse at 50% 40%, #0a1628 0%, #040810 60%, #020408 100%)',
          }} />
        }>
          <HeroVisualization />
        </Suspense>
      </div>
    </section>
  );
}
