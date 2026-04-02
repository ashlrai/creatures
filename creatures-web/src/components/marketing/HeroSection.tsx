import { Suspense, lazy } from 'react';

const HeroVisualization = lazy(() =>
  import('./HeroVisualization').then((m) => ({ default: m.HeroVisualization }))
);

export function HeroSection() {
  return (
    <section className="hp-hero">
      <div className="hp-hero__content">
        <div className="hp-hero__eyebrow">An Interactive Journey Through Time</div>
        <h1 className="hp-hero__headline">
          Night at
          <br />
          the Museum
        </h1>
        <p className="hp-hero__sub">
          Walk through 13.8 billion years of history — from the Big Bang to the digital age.
          AI-powered characters, living dioramas, and hands-on experiments, all running in your browser.
        </p>
        <div className="hp-hero__actions">
          <a href="#/app/museum" className="hp-hero__btn-primary">
            Enter the Museum
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <button className="hp-hero__btn-secondary" onClick={() => {
            document.getElementById('science')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Read the Science
          </button>
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
