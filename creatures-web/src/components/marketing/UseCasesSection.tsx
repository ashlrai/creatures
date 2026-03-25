import { useState } from 'react';

interface TabContent {
  id: string;
  label: string;
  description: string;
  bullets: string[];
}

const TABS: TabContent[] = [
  {
    id: 'researchers',
    label: 'For Researchers',
    description: 'Explore neural circuit dynamics with biologically accurate models.',
    bullets: [
      'Record virtual electrophysiology from any neuron',
      'Test lesion hypotheses with instant neural surgery',
      'Export spike trains, firing rates, and connectome data',
      'Reproduce published experimental protocols',
    ],
  },
  {
    id: 'pharma',
    label: 'For Pharma & Biotech',
    description: 'Screen compounds against biologically accurate neural circuits.',
    bullets: [
      'Dose-response curves with Hill equation pharmacology',
      'Batch drug screening across multiple organisms',
      'Quantify neural effects without animal models',
      'Export results in standard analytical formats',
    ],
  },
  {
    id: 'education',
    label: 'For Education',
    description: 'Interactive neuroscience lab for the next generation.',
    bullets: [
      'Students manipulate living neural networks in real time',
      'Visual neural activity \u2014 see every spike, every synapse',
      'Guided experiments with built-in protocols',
      'No setup required \u2014 runs entirely in the browser',
    ],
  },
];

export function UseCasesSection() {
  const [activeTab, setActiveTab] = useState(0);
  const current = TABS[activeTab];

  return (
    <section id="use-cases" className="hp-uc" aria-labelledby="hp-uc-heading">
      <div className="hp-uc__inner">
        <h2 id="hp-uc-heading" className="hp-uc__heading">
          Use Cases
        </h2>

        <div className="hp-uc__tabs" role="tablist" aria-label="Use case categories">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              role="tab"
              id={`hp-uc-tab-${tab.id}`}
              aria-selected={i === activeTab}
              aria-controls={`hp-uc-panel-${tab.id}`}
              className={`hp-uc__tab${i === activeTab ? ' hp-uc__tab--active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`hp-uc-panel-${current.id}`}
          aria-labelledby={`hp-uc-tab-${current.id}`}
          className="hp-uc__panel"
        >
          <p className="hp-uc__desc">{current.description}</p>
          <ul className="hp-uc__bullets">
            {current.bullets.map((bullet) => (
              <li key={bullet} className="hp-uc__bullet">
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
