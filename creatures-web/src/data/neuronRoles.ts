/**
 * Key C. elegans neurons with plain-English descriptions.
 * Based on published connectomics data (White et al. 1986, WormAtlas,
 * Cook et al. 2019) and functional studies.
 */

export interface NeuronRole {
  role: string;        // One-sentence plain-English description
  pathway: string;     // Signal flow: "sensory → inter → motor"
  significance: string; // Why this neuron matters
}

export const NEURON_ROLES: Record<string, NeuronRole> = {
  // ── Command interneurons ──────────────────────────────────────────
  AVAL: {
    role: 'Command interneuron for forward locomotion',
    pathway: 'sensory → AVA → DA/VA motor neurons',
    significance: 'Most connected interneuron. Lesioning disrupts directed forward movement.',
  },
  AVAR: {
    role: 'Command interneuron for forward locomotion (right)',
    pathway: 'sensory → AVA → DA/VA motor neurons',
    significance: 'Works with AVAL to coordinate forward crawling.',
  },
  AVBL: {
    role: 'Command interneuron for backward locomotion',
    pathway: 'sensory → AVB → DB/VB motor neurons',
    significance: 'Drives backward crawling. Antagonistic to AVA circuit.',
  },
  AVBR: {
    role: 'Command interneuron for backward locomotion (right)',
    pathway: 'sensory → AVB → DB/VB motor neurons',
    significance: 'Works with AVBL for reverse movement.',
  },
  AVDL: {
    role: 'Posterior touch response interneuron',
    pathway: 'PLM → AVD → AVA → motor',
    significance: 'Relays tail touch signals to locomotion command circuit.',
  },
  AVDR: {
    role: 'Posterior touch response interneuron (right)',
    pathway: 'PLM → AVD → AVA → motor',
    significance: 'Part of the escape reflex pathway.',
  },

  // ── Sensory neurons ───────────────────────────────────────────────
  PLML: {
    role: 'Posterior lateral touch sensor (left)',
    pathway: 'PLM → AVD/AVA → motor',
    significance: 'Detects tail touch. Expresses mec-4 mechanosensory channel. Key to escape reflex.',
  },
  PLMR: {
    role: 'Posterior lateral touch sensor (right)',
    pathway: 'PLM → AVD/AVA → motor',
    significance: 'Bilateral pair with PLML for tail mechanosensation.',
  },
  ALML: {
    role: 'Anterior lateral touch sensor (left)',
    pathway: 'ALM → AVD → AVA → motor',
    significance: 'Detects head touch. Triggers backward movement.',
  },
  ALMR: {
    role: 'Anterior lateral touch sensor (right)',
    pathway: 'ALM → AVD → AVA → motor',
    significance: 'Bilateral pair with ALML.',
  },
  ASEL: {
    role: 'Left amphid chemosensory neuron',
    pathway: 'ASE → AIY/AIZ → motor',
    significance: 'Detects water-soluble attractants (Na+, Cl-). Key to chemotaxis.',
  },
  ASER: {
    role: 'Right amphid chemosensory neuron',
    pathway: 'ASE → AIY/AIZ → motor',
    significance: 'Detects different chemical gradients than ASEL. Asymmetric function.',
  },
  AWCL: {
    role: 'Amphid wing C chemosensory (left)',
    pathway: 'AWC → AIY → motor',
    significance: 'Detects volatile odors (benzaldehyde, butanone).',
  },
  AWCR: {
    role: 'Amphid wing C chemosensory (right)',
    pathway: 'AWC → AIY → motor',
    significance: 'Asymmetric with AWCL — different odor specificity.',
  },
  ASHL: {
    role: 'Amphid nociceptor (left)',
    pathway: 'ASH → AVA/AVD → motor',
    significance: 'Detects harmful stimuli (high osmolarity, nose touch). Drives avoidance.',
  },
  ASHR: {
    role: 'Amphid nociceptor (right)',
    pathway: 'ASH → AVA/AVD → motor',
    significance: 'Polymodal sensory neuron — responds to multiple danger signals.',
  },

  // ── Interneurons ──────────────────────────────────────────────────
  AIYL: {
    role: 'First-layer interneuron (left)',
    pathway: 'ASE/AWC → AIY → AIZ/RIA',
    significance: 'Integration hub for chemosensory signals. Promotes forward runs during chemotaxis.',
  },
  AIYR: {
    role: 'First-layer interneuron (right)',
    pathway: 'ASE/AWC → AIY → AIZ/RIA',
    significance: 'Key node in the chemotaxis decision circuit.',
  },
  AIZL: {
    role: 'Second-layer interneuron (left)',
    pathway: 'AIY → AIZ → motor',
    significance: 'Promotes turning behavior. Antagonistic to AIY (run vs. turn).',
  },
  AIZR: {
    role: 'Second-layer interneuron (right)',
    pathway: 'AIY → AIZ → motor',
    significance: 'Part of the run-and-tumble navigation strategy.',
  },
  RIAL: {
    role: 'Ring interneuron A (left)',
    pathway: 'AIY → RIA → SMD/RMD',
    significance: 'Controls head movement direction. Part of navigation circuit.',
  },
  RIAR: {
    role: 'Ring interneuron A (right)',
    pathway: 'AIY → RIA → SMD/RMD',
    significance: 'Bilateral with RIAL for head steering.',
  },
  RIML: {
    role: 'Ring interneuron M (left)',
    pathway: 'command → RIM → motor',
    significance: 'Modulates locomotion speed. Tyramine-releasing.',
  },
  RIMR: {
    role: 'Ring interneuron M (right)',
    pathway: 'command → RIM → motor',
    significance: 'Bilateral pair for speed modulation.',
  },

  // ── Motor neurons (representative) ────────────────────────────────
  DA01: {
    role: 'Dorsal A-type motor neuron (anterior)',
    pathway: 'AVA → DA → dorsal muscles',
    significance: 'Drives dorsal body wall contraction for forward locomotion.',
  },
  VA01: {
    role: 'Ventral A-type motor neuron (anterior)',
    pathway: 'AVA → VA → ventral muscles',
    significance: 'Drives ventral contraction for forward locomotion.',
  },
  DB01: {
    role: 'Dorsal B-type motor neuron (anterior)',
    pathway: 'AVB → DB → dorsal muscles',
    significance: 'Drives dorsal contraction for backward locomotion.',
  },
  VB01: {
    role: 'Ventral B-type motor neuron (anterior)',
    pathway: 'AVB → VB → ventral muscles',
    significance: 'Drives ventral contraction for backward locomotion.',
  },
  DD01: {
    role: 'Dorsal D-type inhibitory motor neuron',
    pathway: 'VA/VB → DD → dorsal muscles',
    significance: 'GABA-releasing. Provides reciprocal inhibition for coordinated undulation.',
  },
  VD01: {
    role: 'Ventral D-type inhibitory motor neuron',
    pathway: 'DA/DB → VD → ventral muscles',
    significance: 'GABA-releasing. Inhibits ventral muscles when dorsal contracts.',
  },

  // ── Head motor neurons ────────────────────────────────────────────
  SMDVL: {
    role: 'Head motor neuron (sublateral dorsal-ventral, left)',
    pathway: 'RIA → SMD → head muscles',
    significance: 'Controls head bending for navigation and foraging.',
  },
  SMDVR: {
    role: 'Head motor neuron (sublateral dorsal-ventral, right)',
    pathway: 'RIA → SMD → head muscles',
    significance: 'Bilateral pair for head movement.',
  },
  SMDDL: {
    role: 'Head motor neuron (sublateral dorsal, left)',
    pathway: 'RIA → SMD → head muscles',
    significance: 'Dorsal head bending.',
  },
  SMDDR: {
    role: 'Head motor neuron (sublateral dorsal, right)',
    pathway: 'RIA → SMD → head muscles',
    significance: 'Bilateral pair for dorsal head movement.',
  },
  RMDVL: {
    role: 'Ring motor neuron (dorsal-ventral, left)',
    pathway: 'command → RMD → head muscles',
    significance: 'Head oscillation motor. Part of foraging pattern generator.',
  },
  RMDVR: {
    role: 'Ring motor neuron (dorsal-ventral, right)',
    pathway: 'command → RMD → head muscles',
    significance: 'Bilateral pair for head oscillation.',
  },

  // ── Pharyngeal ────────────────────────────────────────────────────
  M1: {
    role: 'Pharyngeal motor neuron',
    pathway: 'MC → M1 → pharyngeal muscles',
    significance: 'Controls pharyngeal pumping (feeding). Critical for survival.',
  },
  MC: {
    role: 'Pharyngeal interneuron (marginal cell)',
    pathway: 'sensory → MC → M1/M2',
    significance: 'Master regulator of feeding rhythm.',
  },
};
