export function CTASection() {
  return (
    <section className="hp-cta" aria-labelledby="hp-cta-heading">
      <div className="hp-cta__inner">
        <h2 id="hp-cta-heading" className="hp-cta__heading">
          Explore History
        </h2>
        <p className="hp-cta__subtext">
          Step inside the Museum and journey through 13.8 billion years of cosmic and human history.
        </p>
        <div className="hp-cta__actions">
          <a href="#/app/museum" className="hp-cta__primary">
            Enter the Museum
          </a>
          <a href="https://github.com/ashlrai/creatures" className="hp-cta__secondary" target="_blank" rel="noopener noreferrer">
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
