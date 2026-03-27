export function CTASection() {
  return (
    <section className="hp-cta" aria-labelledby="hp-cta-heading">
      <div className="hp-cta__inner">
        <h2 id="hp-cta-heading" className="hp-cta__heading">
          Start Simulating
        </h2>
        <p className="hp-cta__subtext">
          Launch the Neurevo platform and explore biological neural networks in real time.
        </p>
        <div className="hp-cta__actions">
          <a href="#/app/sim/c_elegans" className="hp-cta__primary">
            Launch Neurevo
          </a>
          <a href="https://github.com/ashlrai/creatures" className="hp-cta__secondary" target="_blank" rel="noopener noreferrer">
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
