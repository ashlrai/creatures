const CAPABILITIES = [
  {
    icon: (
      <svg className="hp-cap__icon" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="#0891b2" opacity="0.15" />
        <circle cx="20" cy="20" r="8" fill="#0891b2" />
      </svg>
    ),
    title: 'Living Organisms',
    description:
      'Simulated bodies driven by spiking neural networks. Watch C. elegans, Drosophila, and zebrafish move, sense, and respond in real time.',
  },
  {
    icon: (
      <svg className="hp-cap__icon" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="8" y="8" width="24" height="24" rx="6" fill="#6366f1" opacity="0.15" />
        <rect x="14" y="14" width="12" height="12" rx="3" fill="#6366f1" />
      </svg>
    ),
    title: 'Real Connectomes',
    description:
      'Built on published connectome data from OpenWorm and FlyWire. Every neuron, every synapse \u2014 mapped from real science.',
  },
  {
    icon: (
      <svg className="hp-cap__icon" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <polygon points="20,4 36,36 4,36" fill="#10b981" opacity="0.15" />
        <polygon points="20,14 28,32 12,32" fill="#10b981" />
      </svg>
    ),
    title: 'Pharmacology',
    description:
      'Test neurotransmitter manipulations in real time. Dose-response curves, receptor modeling, and drug interaction analysis.',
  },
  {
    icon: (
      <svg className="hp-cap__icon" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="4" y="4" width="32" height="32" rx="4" fill="#f59e0b" opacity="0.15" transform="rotate(45 20 20)" />
        <rect x="12" y="12" width="16" height="16" rx="2" fill="#f59e0b" transform="rotate(45 20 20)" />
      </svg>
    ),
    title: 'Evolutionary Pressure',
    description:
      'Run evolutionary experiments across generations. NEAT speciation, fitness landscapes, AI-guided mutation and selection.',
  },
] as const;

export function CapabilitiesSection() {
  return (
    <section id="platform" className="hp-cap" aria-labelledby="hp-cap-heading">
      <div className="hp-cap__inner">
        <h2 id="hp-cap-heading" className="hp-cap__heading">
          Platform Capabilities
        </h2>
        <div className="hp-cap__grid">
          {CAPABILITIES.map((cap) => (
            <article key={cap.title} className="hp-cap__card">
              {cap.icon}
              <h3 className="hp-cap__title">{cap.title}</h3>
              <p className="hp-cap__desc">{cap.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
