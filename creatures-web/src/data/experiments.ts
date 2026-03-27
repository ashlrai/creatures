export interface ExperimentStep {
  title: string;
  explanation: string;
  action: 'poke' | 'apply_drug' | 'lesion' | 'wait' | 'observe';
  actionParams?: Record<string, any>;
  highlightNeurons?: string[];
  durationMs: number;
}

export interface GuidedExperimentDef {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  difficulty: 'beginner' | 'intermediate';
  steps: ExperimentStep[];
}

export const GUIDED_EXPERIMENTS: GuidedExperimentDef[] = [
  {
    id: 'escape_reflex',
    title: 'The Escape Reflex',
    subtitle: 'How a worm detects and escapes from danger',
    icon: '⚡',
    difficulty: 'beginner',
    steps: [
      {
        title: 'Touch the tail',
        explanation: 'We\'ll poke the posterior body to trigger mechanosensory neurons. PLM neurons express the mec-4 touch receptor channel.',
        action: 'poke',
        actionParams: { segment: 'seg_8' },
        highlightNeurons: ['PLML', 'PLMR'],
        durationMs: 2000,
      },
      {
        title: 'Signal cascade begins',
        explanation: 'PLM sensory neurons activate AVD and AVA command interneurons via direct synaptic connections. This is the decision point — should the worm move forward or reverse?',
        action: 'wait',
        highlightNeurons: ['AVDL', 'AVDR', 'AVAL', 'AVAR'],
        durationMs: 2500,
      },
      {
        title: 'Motor neurons fire',
        explanation: 'AVA activates DA and VA motor neurons, which drive dorsal and ventral body wall muscles. The worm contracts and moves away from the stimulus.',
        action: 'observe',
        highlightNeurons: ['DA01', 'VA01', 'DA02', 'VA02'],
        durationMs: 2500,
      },
      {
        title: 'Circuit complete',
        explanation: 'You just observed one of the best-studied neural circuits in biology: PLM → AVD/AVA → DA/VA → muscle contraction. This escape reflex was characterized by Chalfie et al. (1985), earning a Nobel Prize.',
        action: 'observe',
        durationMs: 4000,
      },
    ],
  },
  {
    id: 'block_inhibition',
    title: 'Block Inhibition',
    subtitle: 'What happens when the brain loses its brakes',
    icon: '💊',
    difficulty: 'intermediate',
    steps: [
      {
        title: 'Observe baseline activity',
        explanation: 'Watch the neural activity for a few seconds. GABA-releasing neurons (DD and VD classes) provide reciprocal inhibition — when dorsal muscles contract, ventral muscles relax, and vice versa. This coordination enables smooth undulation.',
        action: 'wait',
        highlightNeurons: ['DD01', 'DD02', 'VD01', 'VD02'],
        durationMs: 3000,
      },
      {
        title: 'Apply Picrotoxin',
        explanation: 'Picrotoxin blocks GABA-A chloride channels, disabling inhibitory synapses. Without inhibition, excitatory neurons fire unchecked — like removing the brakes from a car.',
        action: 'apply_drug',
        actionParams: { drug: 'picrotoxin', dose: 0.8 },
        durationMs: 2000,
      },
      {
        title: 'Observe the chaos',
        explanation: 'Notice the dramatic increase in neural firing. Without GABA inhibition, the network enters a hyperactive state. In real animals, this causes seizure-like convulsions. The mean firing rate has likely increased 50-200%.',
        action: 'observe',
        highlightNeurons: ['DD01', 'VD01', 'DD02', 'VD02'],
        durationMs: 4000,
      },
      {
        title: 'Clinical relevance',
        explanation: 'This mechanism is central to epilepsy research. Many anti-seizure drugs work by enhancing GABA signaling — the opposite of what Picrotoxin does. You\'ve just demonstrated why balanced excitation and inhibition is critical for brain function.',
        action: 'observe',
        durationMs: 4000,
      },
    ],
  },
  {
    id: 'lesion_command',
    title: 'Lesion a Command Neuron',
    subtitle: 'Remove the brain\'s locomotion coordinator',
    icon: '✂️',
    difficulty: 'intermediate',
    steps: [
      {
        title: 'Meet AVAL',
        explanation: 'AVAL is one of the most connected neurons in the C. elegans brain — a command interneuron that coordinates forward locomotion. It receives input from sensory neurons and drives motor neurons.',
        action: 'observe',
        highlightNeurons: ['AVAL'],
        durationMs: 3000,
      },
      {
        title: 'Lesion AVAL',
        explanation: 'We\'ll permanently silence AVAL by removing all its synaptic connections. This simulates what happens in ablation experiments, where researchers use a laser to destroy individual neurons.',
        action: 'lesion',
        actionParams: { neuronId: 'AVAL' },
        highlightNeurons: ['AVAL'],
        durationMs: 2000,
      },
      {
        title: 'Observe the deficit',
        explanation: 'The worm can no longer sustain coordinated forward movement. Notice that DA/VA motor neurons fire less coherently — without AVAL\'s command signal, they lack synchronization.',
        action: 'poke',
        actionParams: { segment: 'seg_8' },
        durationMs: 3000,
      },
      {
        title: 'Redundancy and recovery',
        explanation: 'In real C. elegans, AVAR (the bilateral partner) partially compensates for AVAL loss. The nervous system has built-in redundancy — but not enough to fully recover. This demonstrates why command neurons are evolutionary bottlenecks.',
        action: 'observe',
        highlightNeurons: ['AVAR'],
        durationMs: 4000,
      },
    ],
  },
];
