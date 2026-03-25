const STATS = [
  {
    value: '302',
    label: 'Neurons in C. elegans',
    sublabel: 'Complete connectome from White et al.',
  },
  {
    value: '7,000+',
    label: 'Mapped Synapses',
    sublabel: 'Published wiring diagram',
  },
  {
    value: '500+',
    label: 'Drosophila Circuits',
    sublabel: 'FlyWire v783 connectome data',
  },
] as const;

export function ScienceSection() {
  return (
    <section id="science" className="hp-sci" aria-labelledby="hp-sci-heading">
      <div className="hp-sci__inner">
        <h2 id="hp-sci-heading" className="hp-sci__heading">
          Built on Real Science
        </h2>
        <p className="hp-sci__subheading">
          Every simulation is grounded in published neuroscience data and validated computational
          models.
        </p>
        <div className="hp-sci__stats">
          {STATS.map((stat) => (
            <div key={stat.label} className="hp-sci__stat">
              <span className="hp-sci__stat-value">{stat.value}</span>
              <span className="hp-sci__stat-label">{stat.label}</span>
              <span className="hp-sci__stat-sublabel">{stat.sublabel}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
