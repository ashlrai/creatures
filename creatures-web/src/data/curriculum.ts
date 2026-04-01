import type { Epoch, Quest } from './knowledge-graph';

// ============================================================================
// The Guided Experiential Curriculum
// Structured like a video game campaign: Epochs → Quests → Objectives
// Each quest combines exploration, conversation, discovery, and challenge
// to teach through EXPERIENCE, not lecture.
// ============================================================================

// =========================================================================
// EPOCHS — Major Campaign Chapters
// Each epoch is a self-contained narrative arc that teaches a coherent
// chunk of history/science. Completing an epoch unlocks the next.
// =========================================================================

export const EPOCHS: Epoch[] = [

  // ── EPOCH 1: THE RENAISSANCE (Beginner — everyone starts here) ─────────

  {
    id: 'epoch-renaissance-awakening',
    title: 'The Awakening',
    subtitle: 'Florence, 1400s — Where the Modern World Was Born',
    description: 'Step into Renaissance Florence and discover how a handful of artists, thinkers, and bankers ignited a revolution in human thought. You\'ll meet Leonardo in his workshop, witness Gutenberg\'s first print, and discover why the rediscovery of ancient knowledge changed everything.',
    eraIds: ['renaissance'],
    questIds: [
      'quest-first-steps',
      'quest-medici-florence',
      'quest-leonardos-workshop',
      'quest-printing-revolution',
      'quest-art-of-seeing',
      'quest-renaissance-rivals',
      'quest-machiavelli-power',
      'quest-northern-renaissance',
      'quest-renaissance-synthesis',
    ],
    prerequisiteEpochIds: [],
    rewardDescription: 'Unlock the Scientific Revolution epoch and 5 new alchemy elements',
    difficulty: 'beginner',
    estimatedHours: 3,
    color: '#E74C3C',
    icon: '\u{1F3DB}\u{FE0F}',
  },

  // ── EPOCH 2: THE SCIENTIFIC REVOLUTION ──────────────────────────────────

  {
    id: 'epoch-scientific-revolution',
    title: 'The Great Disruption',
    subtitle: 'Europe, 1550-1700 — When Humanity Learned to Question Everything',
    description: 'The Church said the Earth was the center. Scholars said books held all truth. Then a few brave souls decided to look for themselves — through telescopes, microscopes, and prisms. Meet Galileo on trial, watch Newton decode gravity, and discover the method that powers all modern science.',
    eraIds: ['scientific-revolution'],
    questIds: [
      'quest-copernican-revolution',
      'quest-galileos-telescope',
      'quest-scientific-method',
      'quest-newtons-universe',
      'quest-microscopic-world',
      'quest-chemistry-from-alchemy',
      'quest-scientific-revolution-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-renaissance-awakening'],
    rewardDescription: 'Unlock the Age of Exploration epoch, advanced alchemy, and live simulations',
    difficulty: 'intermediate',
    estimatedHours: 3,
    color: '#3498DB',
    icon: '\u{1F52D}',
  },

  // ── EPOCH 3: THE AGE OF EXPLORATION ────────────────────────────────────

  {
    id: 'epoch-age-of-exploration',
    title: 'The World Expands',
    subtitle: 'Oceans Unknown, 1400-1600 — When Continents Collided',
    description: 'Tiny wooden ships, primitive compasses, and unimaginable courage. Follow Portuguese caravels down the African coast, sail with Columbus into the unknown, and witness the Columbian Exchange — the most consequential biological event since the extinction of the dinosaurs.',
    eraIds: ['age-of-exploration'],
    questIds: [
      'quest-portuguese-pioneers',
      'quest-columbus-voyage',
      'quest-circumnavigation',
      'quest-columbian-exchange',
      'quest-zheng-he',
      'quest-exploration-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-renaissance-awakening'],
    rewardDescription: 'Unlock the Science Wing and trade network simulation',
    difficulty: 'intermediate',
    estimatedHours: 2.5,
    color: '#2ECC71',
    icon: '\u{1F30D}',
  },

  // ── EPOCH 4: ELEMENTS & MATTER (Science Wing) ──────────────────────────

  {
    id: 'epoch-elements-matter',
    title: 'What Is Everything Made Of?',
    subtitle: 'From Four Elements to the Higgs Boson',
    description: 'Humanity\'s deepest question: what is stuff? Begin with the ancient Greeks arguing about atoms, journey through medieval alchemy, watch Mendeleev organize the elements, and end at CERN smashing particles at the speed of light. The alchemy engine is your lab.',
    eraIds: ['elements-matter'],
    questIds: [
      'quest-greek-elements',
      'quest-alchemy-to-chemistry',
      'quest-atomic-world',
      'quest-periodic-table',
      'quest-inside-the-atom',
      'quest-quantum-realm',
      'quest-elements-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-scientific-revolution'],
    rewardDescription: 'Unlock advanced alchemy tiers and the particle physics simulation',
    difficulty: 'intermediate',
    estimatedHours: 3,
    color: '#9B59B6',
    icon: '\u{269B}\u{FE0F}',
  },

  // ── EPOCH 5: LIFE & EVOLUTION (Science Wing) ───────────────────────────

  {
    id: 'epoch-life-evolution',
    title: 'The Tree of Life',
    subtitle: 'From Primordial Soup to CRISPR',
    description: 'How did life begin? How did a single cell become a human brain? Board the Beagle with Darwin, peer through van Leeuwenhoek\'s microscope at the first microbes, crack the genetic code with Watson and Franklin, and watch evolution happen in real-time in the Hall of Life.',
    eraIds: ['life-evolution'],
    questIds: [
      'quest-microscopic-life',
      'quest-darwins-voyage',
      'quest-origin-of-species',
      'quest-mendels-garden',
      'quest-dna-double-helix',
      'quest-hall-of-life-live',
      'quest-life-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-scientific-revolution'],
    rewardDescription: 'Full access to the Hall of Life simulation and CRISPR alchemy',
    difficulty: 'intermediate',
    estimatedHours: 3,
    color: '#27AE60',
    icon: '\u{1F9EC}',
  },

  // ── EPOCH 6: STARS & COSMOS (Science Wing) ─────────────────────────────

  {
    id: 'epoch-stars-cosmos',
    title: 'The Cosmic Perspective',
    subtitle: 'From Flat Earth to the Multiverse',
    description: 'Look up. The story of astronomy is the story of humanity getting smaller — and the universe getting unimaginably bigger. Stand with Galileo as he first sees Jupiter\'s moons, ride the expanding universe with Hubble, and listen to the echo of the Big Bang.',
    eraIds: ['stars-cosmos'],
    questIds: [
      'quest-ancient-sky-watchers',
      'quest-copernican-shift',
      'quest-newtons-gravity',
      'quest-einsteins-universe',
      'quest-expanding-universe',
      'quest-space-exploration',
      'quest-cosmos-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-scientific-revolution'],
    rewardDescription: 'Unlock gravitational wave simulation and the complete alchemy tree',
    difficulty: 'advanced',
    estimatedHours: 3,
    color: '#2C3E50',
    icon: '\u{1F30C}',
  },

  // ── EPOCH 7: THE ANCIENT WORLD ────────────────────────────────────────

  {
    id: 'epoch-ancient-world',
    title: 'Empires of Antiquity',
    subtitle: 'From the Nile to the Forum — 3000 BC to 500 AD',
    description: 'Walk among the pyramids of Giza, debate Socrates in the Athenian agora, march with Alexander across Persia, and watch the Roman Republic tear itself apart. Over three millennia, civilizations rose and fell like waves — each one leaving ideas, laws, and monuments that still shape our world today.',
    eraIds: ['ancient-world'],
    questIds: [
      'quest-land-of-pharaohs',
      'quest-greek-golden-age',
      'quest-trial-of-socrates',
      'quest-alexanders-empire',
      'quest-rise-and-fall-of-rome',
      'quest-ancient-world-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-renaissance-awakening'],
    rewardDescription: 'Unlock the Medieval World epoch, ancient alchemy elements, and the philosophy debate arena',
    difficulty: 'intermediate',
    estimatedHours: 3,
    color: '#B8860B',
    icon: '\u{1F3DB}\u{FE0F}',
  },

  // ── EPOCH 8: THE MEDIEVAL WORLD ───────────────────────────────────────

  {
    id: 'epoch-medieval-world',
    title: 'Swords, Silk, and Scholarship',
    subtitle: 'The Middle Ages — 500 to 1350 AD',
    description: 'Far from a "Dark Age," the medieval world blazed with invention and ambition. Viking longships crossed the Atlantic. Islamic scholars preserved and advanced Greek knowledge. Genghis Khan forged the largest land empire in history. Cathedrals rose like prayers in stone. This is the age that forged the modern world in fire and faith.',
    eraIds: ['medieval-world'],
    questIds: [
      'quest-house-of-wisdom',
      'quest-viking-voyagers',
      'quest-genghis-khan-rises',
      'quest-crusader-kingdoms',
      'quest-mali-golden-empire',
      'quest-medieval-world-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-ancient-world'],
    rewardDescription: 'Unlock the Modern Era epoch, medieval alchemy tiers, and the Silk Road trade simulation',
    difficulty: 'intermediate',
    estimatedHours: 3,
    color: '#7B4B2A',
    icon: '\u{2694}\u{FE0F}',
  },

  // ── EPOCH 9: THE MODERN ERA ───────────────────────────────────────────

  {
    id: 'epoch-modern-era',
    title: 'Revolution and Industry',
    subtitle: 'The World Remade — 1700 to 1900',
    description: 'In two violent, exhilarating centuries, humanity broke every chain it could find — and forged terrible new ones. American colonists defied an empire. French revolutionaries toppled a king. Steam engines devoured the countryside and birthed the factory. Enslaved people fought for freedom across the Atlantic. By 1900, the old world was unrecognizable.',
    eraIds: ['modern-era'],
    questIds: [
      'quest-birth-of-a-nation',
      'quest-napoleon-emperor',
      'quest-engines-of-change',
      'quest-breaking-chains',
      'quest-nations-forged-in-blood',
      'quest-modern-era-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-medieval-world'],
    rewardDescription: 'Unlock the Twentieth Century epoch, industrial alchemy, and the revolution simulation engine',
    difficulty: 'advanced',
    estimatedHours: 3.5,
    color: '#4A6741',
    icon: '\u{1F3ED}',
  },

  // ── EPOCH 10: THE TWENTIETH CENTURY ───────────────────────────────────

  {
    id: 'epoch-twentieth-century',
    title: 'The Century of Extremes',
    subtitle: 'Total War, Liberation, and the Digital Dawn — 1900 to 2000',
    description: 'The most violent, innovative, and transformative hundred years in human history. Two world wars killed over a hundred million people. Totalitarian nightmares consumed nations. Yet humanity also split the atom, walked on the Moon, decoded DNA, tore down the Berlin Wall, and connected the planet through digital networks. This century began with horse-drawn carriages and ended with the internet.',
    eraIds: ['era-twentieth-century'],
    questIds: [
      'quest-war-to-end-all-wars',
      'quest-darkest-hour',
      'quest-cold-war-shadow',
      'quest-dream-of-equality',
      'quest-one-giant-leap',
      'quest-digital-dawn',
      'quest-twentieth-century-synthesis',
    ],
    prerequisiteEpochIds: ['epoch-modern-era'],
    rewardDescription: 'Complete the History Wing, unlock Master Historian title and the full alchemy tree',
    difficulty: 'advanced',
    estimatedHours: 4,
    color: '#B71C1C',
    icon: '\u{1F30D}',
  },
];

// =========================================================================
// QUESTS — Individual Missions
// Each quest is a structured learning experience with clear objectives,
// narrative framing, and rewards. Quests combine multiple interaction
// types to keep engagement varied.
// =========================================================================

export const QUESTS: Quest[] = [

  // ── EPOCH 1: RENAISSANCE QUESTS ────────────────────────────────────────

  {
    id: 'quest-first-steps',
    epochId: 'epoch-renaissance-awakening',
    title: 'First Steps into the Museum',
    subtitle: 'Welcome to Neurevo — your journey through time begins',
    description: 'The museum awaits. Before you travel through centuries of human achievement, let\'s learn how to navigate. You\'ll explore the timeline, visit your first historical event, and discover your first alchemy element.',
    narratorIntro: 'Welcome, traveler. This is Neurevo — a living museum where history breathes, science evolves, and knowledge builds on itself. Your first steps will take you to Renaissance Florence, where the modern world was born. But first, let me show you around...',
    objectives: [
      { id: 'obj-navigate-timeline', type: 'explore_era', description: 'Navigate the Timeline River — zoom from the universe scale down to the Renaissance era', targetEntityId: 'renaissance', optional: false, xpReward: 15 },
      { id: 'obj-visit-first-event', type: 'visit_event', description: 'Visit your first historical event: the fall of Constantinople (1453)', targetEntityId: 'fall-of-constantinople', optional: false, xpReward: 15 },
      { id: 'obj-first-alchemy', type: 'discover_alchemy', description: 'Discover your first element in the Alchemy Engine — combine Fire + Earth', targetAlchemyId: 'metal', optional: false, xpReward: 20 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 10,
    difficulty: 'easy',
    xpReward: 75,
    unlocks: [
      { type: 'character', entityId: 'lorenzo-de-medici', description: 'Unlock Lorenzo de Medici as a character' },
    ],
    tags: ['tutorial', 'onboarding'],
  },

  {
    id: 'quest-medici-florence',
    epochId: 'epoch-renaissance-awakening',
    title: 'The Medici Effect',
    subtitle: 'How one family funded a revolution in human thought',
    description: 'Florence wasn\'t just a city — it was an experiment. The Medici family used their banking fortune to patron artists, scholars, and architects. Meet Lorenzo de Medici, who survived an assassination that killed his brother and turned grief into the greatest cultural flowering in history.',
    narratorIntro: 'Florence, 1478. Blood on the cathedral floor. Lorenzo de Medici has just survived the Pazzi conspiracy — his brother Giuliano lies dead beside him. In his grief, Lorenzo will pour the Medici fortune into art, philosophy, and beauty. From this tragedy, the Renaissance will reach its peak...',
    objectives: [
      { id: 'obj-meet-lorenzo', type: 'talk_to_character', description: 'Speak with Lorenzo de Medici about the Pazzi conspiracy', targetEntityId: 'lorenzo-de-medici', optional: false, xpReward: 25 },
      { id: 'obj-visit-pazzi', type: 'visit_event', description: 'Visit the Pazzi conspiracy event', targetEntityId: 'pazzi-conspiracy', optional: false, xpReward: 15 },
      { id: 'obj-visit-platonic-academy', type: 'visit_event', description: 'Visit the founding of the Platonic Academy', targetEntityId: 'platonic-academy-founded', optional: false, xpReward: 15 },
      { id: 'obj-medici-question', type: 'answer_question', description: 'Answer: Why did the Medici invest so heavily in art?', optional: false, xpReward: 20 },
      { id: 'obj-find-medici-connection', type: 'find_connection', description: 'Discover the connection between Medici patronage and at least 3 Renaissance artists', optional: true, xpReward: 30 },
    ],
    prerequisiteQuestIds: ['quest-first-steps'],
    estimatedMinutes: 15,
    difficulty: 'easy',
    xpReward: 125,
    unlocks: [
      { type: 'character', entityId: 'leonardo-da-vinci', description: 'Unlock Leonardo da Vinci as a character' },
    ],
    tags: ['politics', 'patronage', 'florence'],
  },

  {
    id: 'quest-leonardos-workshop',
    epochId: 'epoch-renaissance-awakening',
    title: 'The Workshop of Genius',
    subtitle: 'Meet Leonardo da Vinci — artist, inventor, scientist',
    description: 'Enter Leonardo\'s cluttered Milan workshop. Half-finished paintings lean against walls covered in mirror-written notes. A dissected corpse lies on a table next to designs for a flying machine. Ask him anything — but be prepared for him to answer with questions of his own.',
    narratorIntro: 'Milan, 1495. In a converted stable near Santa Maria delle Grazie, a man works by candlelight on a mural that will become the most famous painting of the Last Supper. But that\'s just what he does between breakfast and lunch. The rest of his day involves flight, anatomy, hydraulics, and the nature of light itself...',
    objectives: [
      { id: 'obj-talk-leonardo', type: 'talk_to_character', description: 'Ask Leonardo about his flying machine designs', targetEntityId: 'leonardo-da-vinci', optional: false, xpReward: 25 },
      { id: 'obj-visit-last-supper', type: 'visit_event', description: 'Visit The Last Supper in progress', targetEntityId: 'last-supper-painted', optional: false, xpReward: 15 },
      { id: 'obj-discover-perspective', type: 'discover_alchemy', description: 'Discover Linear Perspective in the Alchemy Engine', targetAlchemyId: 'perspective-art', optional: false, xpReward: 25 },
      { id: 'obj-challenge-leonardo', type: 'debate_character', description: 'Challenge Leonardo: is painting really a science?', targetEntityId: 'leonardo-da-vinci', optional: true, xpReward: 35 },
      { id: 'obj-leonardo-anatomy', type: 'visit_event', description: 'Visit Leonardo\'s anatomical studies', targetEntityId: 'leonardo-anatomical-studies', optional: true, xpReward: 20 },
    ],
    prerequisiteQuestIds: ['quest-medici-florence'],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 150,
    unlocks: [
      { type: 'character', entityId: 'michelangelo-buonarroti', description: 'Unlock Michelangelo as a character' },
      { type: 'badge', entityId: 'first-conversation', description: 'Achievement: First Words' },
    ],
    tags: ['art', 'science', 'leonardo', 'invention'],
  },

  {
    id: 'quest-printing-revolution',
    epochId: 'epoch-renaissance-awakening',
    title: 'Words Set Free',
    subtitle: 'How Gutenberg\'s press changed the world forever',
    description: 'In a Mainz workshop, a goldsmith is about to make monks obsolete. Johannes Gutenberg has spent years perfecting movable metal type, oil-based ink, and a modified wine press. The result will cut the cost of books by 80% and unleash the Reformation, the Scientific Revolution, and mass literacy.',
    narratorIntro: 'Before Gutenberg, a single book took a monk months to copy by hand. After Gutenberg, that same book could be printed in hours. By 1500, there were 20 million volumes in print across Europe. Ideas that once traveled at the speed of a horse now traveled at the speed of a press...',
    objectives: [
      { id: 'obj-meet-gutenberg', type: 'talk_to_character', description: 'Meet Gutenberg in his workshop — ask about the challenges of the press', targetEntityId: 'johannes-gutenberg', optional: false, xpReward: 25 },
      { id: 'obj-discover-press', type: 'discover_alchemy', description: 'Discover the Printing Press in the Alchemy Engine (Metal + Ink)', targetAlchemyId: 'printing-press', optional: false, xpReward: 25 },
      { id: 'obj-visit-gutenberg-bible', type: 'visit_event', description: 'Visit the printing of the Gutenberg Bible', targetEntityId: 'gutenberg-printing-press', optional: false, xpReward: 15 },
      { id: 'obj-press-question', type: 'answer_question', description: 'Answer: What made Gutenberg\'s press different from earlier printing in China?', optional: false, xpReward: 20 },
      { id: 'obj-press-impact', type: 'find_connection', description: 'Find 3 events that were direct consequences of the printing press', optional: true, xpReward: 30 },
    ],
    prerequisiteQuestIds: ['quest-first-steps'],
    estimatedMinutes: 15,
    difficulty: 'easy',
    xpReward: 140,
    unlocks: [
      { type: 'alchemy_element', entityId: 'humanism', description: 'Unlock Humanism in the Alchemy Engine' },
    ],
    tags: ['technology', 'printing', 'information'],
  },

  {
    id: 'quest-art-of-seeing',
    epochId: 'epoch-renaissance-awakening',
    title: 'The Art of Seeing',
    subtitle: 'How perspective, anatomy, and observation transformed art into science',
    description: 'Renaissance artists didn\'t just paint — they STUDIED. Brunelleschi cracked perspective with mirrors and geometry. Leonardo dissected 30 corpses to understand muscle. Michelangelo worked from live models obsessively. Art became a form of scientific inquiry.',
    narratorIntro: 'Look at any painting before 1420. The figures are flat, symbolic, spiritual. Now look at a painting from 1500. The figures breathe. They have weight, shadow, depth. In 80 years, artists learned to see the world as it actually is — and that revolution in observation would later power science itself...',
    objectives: [
      { id: 'obj-visit-brunelleschi', type: 'visit_event', description: 'Visit Brunelleschi\'s perspective demonstration', targetEntityId: 'brunelleschi-perspective', optional: false, xpReward: 20 },
      { id: 'obj-visit-sistine', type: 'visit_event', description: 'Visit the Sistine Chapel ceiling', targetEntityId: 'sistine-chapel-ceiling', optional: false, xpReward: 20 },
      { id: 'obj-discover-lens', type: 'discover_alchemy', description: 'Discover the Lens in the Alchemy Engine', targetAlchemyId: 'lens', optional: false, xpReward: 20 },
      { id: 'obj-art-science-connection', type: 'find_connection', description: 'Find the connection between Renaissance art techniques and later scientific instruments', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-medici-florence'],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 120,
    unlocks: [],
    tags: ['art', 'science', 'perspective', 'anatomy'],
  },

  {
    id: 'quest-renaissance-rivals',
    epochId: 'epoch-renaissance-awakening',
    title: 'Clash of Titans',
    subtitle: 'Leonardo vs. Michelangelo — the greatest rivalry in art history',
    description: 'They were opposites in every way. Leonardo: gentle, curious, always starting, never finishing. Michelangelo: fierce, tormented, relentless. They despised each other — and their rivalry produced the greatest art in human history.',
    narratorIntro: 'Florence, 1504. The city has commissioned two murals for the Hall of the Five Hundred — one from Leonardo, one from Michelangelo. All of Florence is watching. It is the artistic equivalent of a heavyweight championship fight...',
    objectives: [
      { id: 'obj-talk-michelangelo', type: 'talk_to_character', description: 'Meet Michelangelo while he carves the David', targetEntityId: 'michelangelo-buonarroti', optional: false, xpReward: 25 },
      { id: 'obj-ask-about-rivalry', type: 'talk_to_character', description: 'Ask Leonardo what he thinks of Michelangelo', targetEntityId: 'leonardo-da-vinci', optional: false, xpReward: 25 },
      { id: 'obj-visit-david', type: 'visit_event', description: 'Visit the completion of the David', targetEntityId: 'david-completed', optional: false, xpReward: 15 },
      { id: 'obj-battle-vote', type: 'cast_battle_vote', description: 'Cast your vote: Leonardo or Michelangelo?', optional: false, xpReward: 15 },
      { id: 'obj-debate-sculpture', type: 'debate_character', description: 'Debate Michelangelo: is sculpture really superior to painting?', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-leonardos-workshop'],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 150,
    unlocks: [
      { type: 'badge', entityId: 'debate-master', description: 'Progress toward Debate Champion achievement' },
    ],
    tags: ['art', 'rivalry', 'leonardo', 'michelangelo'],
  },

  {
    id: 'quest-machiavelli-power',
    epochId: 'epoch-renaissance-awakening',
    title: 'The Rules of Power',
    subtitle: 'Machiavelli — the man who told the truth about politics',
    description: 'Exiled, tortured, and desperate to return to political life, Niccol\u00F2 Machiavelli wrote the most dangerous book in history. The Prince isn\'t a manual for tyrants — it\'s a brutally honest analysis of how power actually works.',
    narratorIntro: 'A farm outside Florence, 1513. A disgraced diplomat puts on his finest robes, sits at his desk, and begins a letter to a Medici prince. "I have composed a little work," he writes. That "little work" will shock, scandalize, and influence every leader who reads it for the next 500 years...',
    objectives: [
      { id: 'obj-meet-machiavelli', type: 'talk_to_character', description: 'Meet Machiavelli in exile — ask why he wrote The Prince', targetEntityId: 'niccolo-machiavelli', optional: false, xpReward: 25 },
      { id: 'obj-visit-prince', type: 'visit_event', description: 'Visit the writing of The Prince', targetEntityId: 'the-prince-written', optional: false, xpReward: 15 },
      { id: 'obj-debate-machiavelli', type: 'debate_character', description: 'Challenge Machiavelli: do the ends really justify the means?', targetEntityId: 'niccolo-machiavelli', optional: false, xpReward: 35 },
      { id: 'obj-borgia-question', type: 'answer_question', description: 'Answer: Why did Machiavelli admire Cesare Borgia?', optional: false, xpReward: 20 },
    ],
    prerequisiteQuestIds: ['quest-medici-florence'],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 120,
    unlocks: [],
    tags: ['politics', 'philosophy', 'power'],
  },

  {
    id: 'quest-northern-renaissance',
    epochId: 'epoch-renaissance-awakening',
    title: 'Beyond Italy',
    subtitle: 'Erasmus, D\u00FCrer, and the Renaissance that crossed the Alps',
    description: 'The Renaissance wasn\'t just Italian. Gutenberg\'s press carried new ideas north, where they mixed with local traditions. Erasmus challenged the Church with scholarship. D\u00FCrer brought Italian techniques to German art. Thomas More imagined an ideal society.',
    narratorIntro: 'Ideas are like seeds — they grow differently in different soil. The printing press carried Renaissance humanism across the Alps into Germany, the Netherlands, and England. There, it took root in entirely new ways...',
    objectives: [
      { id: 'obj-visit-erasmus', type: 'visit_event', description: 'Visit Erasmus publishing In Praise of Folly', targetEntityId: 'erasmus-praise-of-folly', optional: false, xpReward: 20 },
      { id: 'obj-discover-humanism', type: 'discover_alchemy', description: 'Discover Humanism in the Alchemy Engine', targetAlchemyId: 'humanism', optional: false, xpReward: 20 },
      { id: 'obj-northern-question', type: 'answer_question', description: 'Answer: How did the Northern Renaissance differ from the Italian Renaissance?', optional: false, xpReward: 20 },
      { id: 'obj-find-press-connection', type: 'find_connection', description: 'Find the connection between the printing press and the Northern Renaissance', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-printing-revolution'],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 110,
    unlocks: [],
    tags: ['culture', 'humanism', 'northern-europe'],
  },

  {
    id: 'quest-renaissance-synthesis',
    epochId: 'epoch-renaissance-awakening',
    title: 'The Thread of Progress',
    subtitle: 'Connect the dots — how the Renaissance made the modern world possible',
    description: 'The Renaissance wasn\'t just about pretty paintings. It was the moment humanity decided that observation, reason, and individual genius could improve the world. Every quest you\'ve completed is connected. Now find those connections.',
    narratorIntro: 'You\'ve walked through Florence with Lorenzo, argued with Machiavelli, watched Leonardo dream of flight. Now step back and see the bigger picture. The Renaissance wasn\'t one story — it was a web of ideas, people, and events that together created the foundation for everything that came after...',
    objectives: [
      { id: 'obj-find-5-connections', type: 'find_connection', description: 'Discover 5 cross-entity connections within the Renaissance', optional: false, xpReward: 50 },
      { id: 'obj-synthesis-question', type: 'answer_question', description: 'Answer: What single idea most defines the Renaissance? Defend your answer.', optional: false, xpReward: 30 },
      { id: 'obj-explore-all', type: 'explore_era', description: 'Visit at least 20 events in the Renaissance era', targetEntityId: 'renaissance', optional: false, xpReward: 30 },
      { id: 'obj-alchemy-chain', type: 'discover_alchemy', description: 'Discover the Scientific Method in the Alchemy Engine', targetAlchemyId: 'scientific-method', optional: true, xpReward: 30 },
    ],
    prerequisiteQuestIds: ['quest-renaissance-rivals', 'quest-machiavelli-power', 'quest-northern-renaissance'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 200,
    unlocks: [
      { type: 'epoch', entityId: 'epoch-scientific-revolution', description: 'Unlock The Great Disruption epoch' },
      { type: 'epoch', entityId: 'epoch-age-of-exploration', description: 'Unlock The World Expands epoch' },
      { type: 'title', entityId: 'renaissance-graduate', description: 'Earn the title: Renaissance Graduate' },
    ],
    tags: ['synthesis', 'connections', 'capstone'],
  },

  // ── EPOCH 2: SCIENTIFIC REVOLUTION QUESTS ──────────────────────────────

  {
    id: 'quest-copernican-revolution',
    epochId: 'epoch-scientific-revolution',
    title: 'The Earth Moves',
    subtitle: 'Copernicus dares to rearrange the cosmos',
    description: 'For 1,400 years, everyone knew the Earth was the center of the universe. Copernicus knew it wasn\'t. Meet the man who was so afraid of his own discovery that he delayed publication for 30 years.',
    narratorIntro: 'A cathedral tower in northern Poland. A quiet canon makes observations with crude instruments. His mathematics say something impossible: the Earth is not the center. The Sun is. He will wait three decades to publish — and hold the first printed copy on his deathbed...',
    objectives: [
      { id: 'obj-meet-copernicus', type: 'talk_to_character', description: 'Meet Copernicus — ask why he delayed publication for 30 years', targetEntityId: 'copernicus', optional: false, xpReward: 25 },
      { id: 'obj-discover-heliocentric', type: 'discover_alchemy', description: 'Discover the Heliocentric Model in the Alchemy Engine', targetAlchemyId: 'heliocentric-model', optional: false, xpReward: 30 },
      { id: 'obj-visit-de-rev', type: 'visit_event', description: 'Visit the publication of De Revolutionibus', targetEntityId: 'copernicus-de-revolutionibus', optional: false, xpReward: 15 },
      { id: 'obj-copernicus-question', type: 'answer_question', description: 'Answer: Why was the heliocentric model so threatening to the Church?', optional: false, xpReward: 20 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 120,
    unlocks: [
      { type: 'character', entityId: 'galileo-galilei', description: 'Unlock Galileo as a character' },
    ],
    tags: ['astronomy', 'copernicus', 'heliocentrism'],
  },

  {
    id: 'quest-galileos-telescope',
    epochId: 'epoch-scientific-revolution',
    title: 'Look Through the Lens',
    subtitle: 'Galileo sees what no human has seen — and the Church tries to silence him',
    description: 'In 1609, Galileo heard about a Dutch invention that made distant things appear close. Within months, he built a better version and aimed it at the sky. What he saw — mountains on the Moon, moons around Jupiter, phases of Venus — demolished 2,000 years of cosmology.',
    narratorIntro: 'Padua, 1610. A mathematics professor has just published a slim book called Sidereus Nuncius — The Starry Messenger. It contains the most revolutionary observations in the history of astronomy. Within a year, he will be famous. Within two decades, he will be on trial...',
    objectives: [
      { id: 'obj-meet-galileo', type: 'talk_to_character', description: 'Meet Galileo in 1610 — ask him what he saw through the telescope', targetEntityId: 'galileo-galilei', optional: false, xpReward: 30 },
      { id: 'obj-discover-telescope', type: 'discover_alchemy', description: 'Discover the Telescope in the Alchemy Engine (Lens + Air)', targetAlchemyId: 'telescope', optional: false, xpReward: 25 },
      { id: 'obj-visit-observations', type: 'visit_event', description: 'Visit Galileo\'s telescope observations of 1610', targetEntityId: 'galileo-telescope-observations', optional: false, xpReward: 15 },
      { id: 'obj-visit-trial', type: 'visit_event', description: 'Visit Galileo\'s trial before the Inquisition (1633)', targetEntityId: 'galileo-trial', optional: false, xpReward: 20 },
      { id: 'obj-debate-galileo', type: 'debate_character', description: 'Ask Galileo (1633): was it worth it?', targetEntityId: 'galileo-galilei', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-copernican-revolution'],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 160,
    unlocks: [
      { type: 'character', entityId: 'isaac-newton', description: 'Unlock Isaac Newton as a character' },
    ],
    tags: ['astronomy', 'galileo', 'telescope', 'church'],
  },

  {
    id: 'quest-scientific-method',
    epochId: 'epoch-scientific-revolution',
    title: 'The Method',
    subtitle: 'How Francis Bacon taught humanity to think',
    description: 'Before the scientific method, knowledge came from authority — Aristotle said it, the Church confirmed it, end of story. Bacon proposed something radical: observe, hypothesize, experiment, conclude. Test everything. Trust nothing that hasn\'t been tested.',
    narratorIntro: 'What if everything you were taught was wrong? What if the only way to know the truth was to test it yourself? Francis Bacon asked these questions in 1620 — and the answer he gave created modern science...',
    objectives: [
      { id: 'obj-visit-novum-organum', type: 'visit_event', description: 'Visit the publication of Novum Organum (1620)', targetEntityId: 'bacon-novum-organum', optional: false, xpReward: 20 },
      { id: 'obj-discover-method', type: 'discover_alchemy', description: 'Discover the Scientific Method in the Alchemy Engine', targetAlchemyId: 'scientific-method', optional: false, xpReward: 25 },
      { id: 'obj-method-question', type: 'answer_question', description: 'Answer: What is the difference between deduction and induction?', optional: false, xpReward: 20 },
      { id: 'obj-apply-method', type: 'solve_challenge', description: 'Use the scientific method to evaluate a historical claim: did the Earth really change position?', optional: true, xpReward: 40 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 130,
    unlocks: [],
    tags: ['method', 'bacon', 'epistemology'],
  },

  {
    id: 'quest-newtons-universe',
    epochId: 'epoch-scientific-revolution',
    title: 'The Laws of Everything',
    subtitle: 'Newton decodes the universe with mathematics',
    description: 'In 1687, a reclusive Cambridge professor published a book that explained the motion of everything — from falling apples to orbiting planets. Meet Isaac Newton at the height of his power, and discover why the Principia is considered the greatest scientific work ever written.',
    narratorIntro: 'Legend says an apple fell on his head. The truth is stranger: a solitary genius, during a plague year, invented calculus, decoded light, and discovered gravity — then kept it secret for 20 years until a friend convinced him to publish...',
    objectives: [
      { id: 'obj-meet-newton', type: 'talk_to_character', description: 'Meet Newton in 1687 — ask about the Principia', targetEntityId: 'isaac-newton', optional: false, xpReward: 30 },
      { id: 'obj-discover-gravity', type: 'discover_alchemy', description: 'Discover Gravity in the Alchemy Engine', targetAlchemyId: 'gravity', optional: false, xpReward: 25 },
      { id: 'obj-discover-calculus', type: 'discover_alchemy', description: 'Discover Calculus in the Alchemy Engine', targetAlchemyId: 'calculus', optional: false, xpReward: 25 },
      { id: 'obj-visit-principia', type: 'visit_event', description: 'Visit the publication of the Principia', targetEntityId: 'principia-published', optional: false, xpReward: 15 },
      { id: 'obj-newton-leibniz', type: 'answer_question', description: 'Answer: Why did Newton and Leibniz feud over calculus?', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-galileos-telescope'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 160,
    unlocks: [
      { type: 'character', entityId: 'albert-einstein', description: 'Unlock Einstein as a character' },
    ],
    tags: ['physics', 'newton', 'gravity', 'calculus'],
  },

  {
    id: 'quest-microscopic-world',
    epochId: 'epoch-scientific-revolution',
    title: 'The Invisible Kingdom',
    subtitle: 'Van Leeuwenhoek discovers a world teeming with life',
    description: 'A Dutch cloth merchant with no formal education built the world\'s most powerful microscope — and discovered that every drop of water is alive with creatures invisible to the naked eye. The implications were staggering.',
    narratorIntro: 'Delft, 1674. A man who should be inspecting fabric threads is instead peering through a tiny glass bead at pond water. What he sees astonishes him: "very many little animalcules." He has just discovered the microbial world...',
    objectives: [
      { id: 'obj-discover-microscope', type: 'discover_alchemy', description: 'Discover the Microscope in the Alchemy Engine (Lens + Water)', targetAlchemyId: 'microscope', optional: false, xpReward: 25 },
      { id: 'obj-visit-leeuwenhoek', type: 'visit_event', description: 'Visit van Leeuwenhoek\'s discovery of microorganisms', targetEntityId: 'leeuwenhoek-microorganisms', optional: false, xpReward: 20 },
      { id: 'obj-cell-theory', type: 'discover_alchemy', description: 'Discover Cell Theory in the Alchemy Engine', targetAlchemyId: 'cell-theory', optional: false, xpReward: 25 },
      { id: 'obj-micro-question', type: 'answer_question', description: 'Answer: How did the microscope change our understanding of disease?', optional: true, xpReward: 20 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 115,
    unlocks: [],
    tags: ['biology', 'microscope', 'cells'],
  },

  {
    id: 'quest-chemistry-from-alchemy',
    epochId: 'epoch-scientific-revolution',
    title: 'From Alchemy to Chemistry',
    subtitle: 'How the search for gold accidentally discovered science',
    description: 'Medieval alchemists never turned lead into gold. But their centuries of experiments — heating, dissolving, distilling, combining — built the foundation for modern chemistry. When Boyle defined elements and Lavoisier identified oxygen, alchemy finally became science.',
    narratorIntro: 'For a thousand years, alchemists searched for the philosopher\'s stone — the secret of transmutation. They failed. But in failing, they invented laboratory techniques, discovered acids and gases, and asked the question that would birth chemistry: what is matter really made of?',
    objectives: [
      { id: 'obj-discover-chemistry', type: 'discover_alchemy', description: 'Discover Chemistry in the Alchemy Engine (Fire + Philosophy)', targetAlchemyId: 'chemistry', optional: false, xpReward: 25 },
      { id: 'obj-visit-lavoisier', type: 'visit_event', description: 'Visit Lavoisier\'s oxygen experiments', targetEntityId: 'lavoisier-oxygen', optional: false, xpReward: 20 },
      { id: 'obj-alchemy-question', type: 'answer_question', description: 'Answer: What is the key difference between alchemy and chemistry?', optional: false, xpReward: 20 },
      { id: 'obj-discover-atomic', type: 'discover_alchemy', description: 'Discover Atomic Theory in the Alchemy Engine', targetAlchemyId: 'atomic-theory', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 115,
    unlocks: [],
    tags: ['chemistry', 'alchemy', 'elements'],
  },

  {
    id: 'quest-scientific-revolution-synthesis',
    epochId: 'epoch-scientific-revolution',
    title: 'The New Philosophy',
    subtitle: 'How observation replaced authority as the source of truth',
    description: 'The Scientific Revolution wasn\'t just about discoveries — it was about a new way of knowing. Authority gave way to evidence. Tradition gave way to experiment. In 150 years, humanity developed a method for reliably discovering truth. This quest asks you to see the revolution as a whole.',
    narratorIntro: 'Step back from the details and see the pattern. Copernicus questioned Ptolemy. Galileo questioned the Church. Bacon questioned all authority. Newton synthesized everything into mathematical law. Together, they didn\'t just discover facts — they discovered how to discover facts...',
    objectives: [
      { id: 'obj-find-sci-rev-connections', type: 'find_connection', description: 'Find 5 causal connections within the Scientific Revolution', optional: false, xpReward: 50 },
      { id: 'obj-synthesis-question', type: 'answer_question', description: 'Answer: What was more revolutionary — the discoveries or the method?', optional: false, xpReward: 30 },
      { id: 'obj-explore-sci-rev', type: 'explore_era', description: 'Visit at least 15 events in the Scientific Revolution', targetEntityId: 'scientific-revolution', optional: false, xpReward: 30 },
    ],
    prerequisiteQuestIds: ['quest-newtons-universe', 'quest-microscopic-world', 'quest-chemistry-from-alchemy'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 200,
    unlocks: [
      { type: 'epoch', entityId: 'epoch-elements-matter', description: 'Unlock the Elements & Matter epoch' },
      { type: 'epoch', entityId: 'epoch-life-evolution', description: 'Unlock the Life & Evolution epoch' },
      { type: 'epoch', entityId: 'epoch-stars-cosmos', description: 'Unlock the Stars & Cosmos epoch' },
      { type: 'title', entityId: 'natural-philosopher', description: 'Earn the title: Natural Philosopher' },
    ],
    tags: ['synthesis', 'capstone', 'method'],
  },

  // ── EPOCH 7: ANCIENT WORLD QUESTS ──────────────────────────────────────

  {
    id: 'quest-land-of-pharaohs',
    epochId: 'epoch-ancient-world',
    title: 'Land of the Pharaohs',
    subtitle: 'Egypt — where civilization learned to write, build, and endure',
    description: 'Before Greece, before Rome, there was Egypt. For three thousand years, pharaohs ruled a civilization of staggering ambition. They built mountains of stone, invented writing, and mapped the afterlife with obsessive precision. Stand at the base of the Great Pyramid and feel the weight of eternity.',
    narratorIntro: 'Giza, 2560 BC. The Great Pyramid is under construction. Tens of thousands of workers haul limestone blocks across the desert — not as slaves, as the myths claim, but as organized labor crews who take pride in their work. Pharaoh Khufu watches from his throne. He is building a staircase to the stars...',
    objectives: [
      { id: 'obj-visit-great-pyramid', type: 'visit_event', description: 'Visit the construction of the Great Pyramid of Giza', targetEntityId: 'evt-aw-construction-great-pyramid', optional: false, xpReward: 20 },
      { id: 'obj-visit-hieroglyphs', type: 'visit_event', description: 'Witness the invention of hieroglyphic writing', targetEntityId: 'evt-aw-invention-hieroglyphs', optional: false, xpReward: 15 },
      { id: 'obj-talk-cleopatra', type: 'talk_to_character', description: 'Speak with Cleopatra about ruling Egypt in the shadow of Rome', targetEntityId: 'per-aw-cleopatra', optional: false, xpReward: 25 },
      { id: 'obj-egypt-question', type: 'answer_question', description: 'Answer: Why did Egyptian civilization last over 3,000 years when most empires collapse in centuries?', optional: false, xpReward: 20 },
      { id: 'obj-find-egypt-connections', type: 'find_connection', description: 'Find 3 connections between Egyptian innovations and later civilizations', optional: true, xpReward: 30 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'easy',
    xpReward: 135,
    unlocks: [
      { type: 'character', entityId: 'per-aw-socrates', description: 'Unlock Socrates as a character' },
    ],
    tags: ['egypt', 'pyramids', 'civilization', 'writing'],
  },

  {
    id: 'quest-greek-golden-age',
    epochId: 'epoch-ancient-world',
    title: 'The Glory of Athens',
    subtitle: 'Democracy, philosophy, and the birth of the Western mind',
    description: 'In a single century, a city smaller than modern Omaha invented democracy, theater, philosophy, and history — then lost it all in a catastrophic war. Athens in the 5th century BC was the most creative society in human history. Walk through the Agora and feel ideas being born.',
    narratorIntro: 'Athens, 450 BC. The Parthenon gleams white and gold on the Acropolis above you. In the marketplace below, a barefoot stonemason is asking uncomfortable questions of every important person he meets. His name is Socrates, and his questions will change the world — then get him killed...',
    objectives: [
      { id: 'obj-visit-athenian-democracy', type: 'visit_event', description: 'Visit the founding of Athenian democracy', targetEntityId: 'evt-aw-athenian-democracy', optional: false, xpReward: 20 },
      { id: 'obj-visit-parthenon', type: 'visit_event', description: 'Visit the construction of the Parthenon', targetEntityId: 'evt-aw-construction-parthenon', optional: false, xpReward: 15 },
      { id: 'obj-talk-pericles', type: 'talk_to_character', description: 'Speak with Pericles about what makes Athens great', targetEntityId: 'per-aw-pericles', optional: false, xpReward: 25 },
      { id: 'obj-visit-marathon', type: 'visit_event', description: 'Witness the Battle of Marathon — where 10,000 Greeks defeated a Persian army', targetEntityId: 'evt-aw-battle-marathon', optional: false, xpReward: 15 },
      { id: 'obj-debate-pericles', type: 'debate_character', description: 'Challenge Pericles: can a democracy also be an empire?', targetEntityId: 'per-aw-pericles', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-land-of-pharaohs'],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 140,
    unlocks: [
      { type: 'character', entityId: 'per-aw-alexander', description: 'Unlock Alexander the Great as a character' },
    ],
    tags: ['greece', 'democracy', 'athens', 'philosophy'],
  },

  {
    id: 'quest-trial-of-socrates',
    epochId: 'epoch-ancient-world',
    title: 'The Trial of Socrates',
    subtitle: 'When Athens sentenced its greatest mind to death',
    description: 'He wrote nothing. He owned nothing. He claimed to know nothing. And yet Socrates was the most dangerous man in Athens — because he taught people to think. In 399 BC, the world\'s first democracy voted to execute its greatest philosopher. The trial raises a question we still haven\'t answered: can free speech survive democracy?',
    narratorIntro: 'The courtroom holds 501 jurors. The charge: corrupting the youth. The accused: a 70-year-old man who has spent his entire life asking questions in the marketplace. Socrates could beg for mercy. He could flee. Instead, he will make the most famous defense speech in history — and then drink the hemlock...',
    objectives: [
      { id: 'obj-talk-socrates', type: 'talk_to_character', description: 'Speak with Socrates on the morning of his trial — ask why he won\'t flee', targetEntityId: 'per-aw-socrates', optional: false, xpReward: 30 },
      { id: 'obj-visit-death-socrates', type: 'visit_event', description: 'Witness the death of Socrates', targetEntityId: 'evt-aw-death-socrates', optional: false, xpReward: 20 },
      { id: 'obj-debate-socrates', type: 'debate_character', description: 'Debate Socrates: is an examined life really the only life worth living?', targetEntityId: 'per-aw-socrates', optional: false, xpReward: 35 },
      { id: 'obj-visit-plato-academy', type: 'visit_event', description: 'Visit Plato founding the Academy — Socrates\' legacy lives on', targetEntityId: 'evt-aw-plato-founds-academy', optional: false, xpReward: 15 },
      { id: 'obj-socrates-question', type: 'answer_question', description: 'Answer: Was Athens right to execute Socrates? Defend your position.', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-greek-golden-age'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 160,
    unlocks: [
      { type: 'badge', entityId: 'philosopher-friend', description: 'Achievement: Friend of Philosophy' },
    ],
    tags: ['philosophy', 'socrates', 'trial', 'democracy', 'free-speech'],
  },

  {
    id: 'quest-alexanders-empire',
    epochId: 'epoch-ancient-world',
    title: 'The World-Conqueror',
    subtitle: 'Alexander the Great — from Macedonia to the edge of the world',
    description: 'He was tutored by Aristotle, worshipped Achilles, and conquered the known world by age 30. Alexander the Great carved an empire from Greece to India — then died in Babylon at 32, leaving a legacy that fused Greek and Eastern civilization forever. Was he a visionary or a monster?',
    narratorIntro: 'Gaugamela, 331 BC. The Persian army stretches to the horizon — a quarter million men. Alexander commands barely 47,000. His generals urge caution. Alexander laughs, charges straight at the Persian king, and in a single afternoon destroys an empire that had stood for two centuries...',
    objectives: [
      { id: 'obj-talk-alexander', type: 'talk_to_character', description: 'Speak with Alexander after Gaugamela — ask him where he\'ll stop', targetEntityId: 'per-aw-alexander', optional: false, xpReward: 30 },
      { id: 'obj-visit-gaugamela', type: 'visit_event', description: 'Witness the Battle of Gaugamela', targetEntityId: 'evt-aw-battle-gaugamela', optional: false, xpReward: 20 },
      { id: 'obj-visit-alexandria', type: 'visit_event', description: 'Visit the founding of Alexandria — Alexander\'s greatest city', targetEntityId: 'evt-aw-founding-alexandria', optional: false, xpReward: 15 },
      { id: 'obj-visit-death-alexander', type: 'visit_event', description: 'Witness Alexander\'s death in Babylon at age 32', targetEntityId: 'evt-aw-death-alexander', optional: false, xpReward: 15 },
      { id: 'obj-debate-alexander', type: 'debate_character', description: 'Debate Alexander: was your empire a force for unity or destruction?', targetEntityId: 'per-aw-alexander', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-greek-golden-age'],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 150,
    unlocks: [
      { type: 'character', entityId: 'per-aw-julius-caesar', description: 'Unlock Julius Caesar as a character' },
    ],
    tags: ['alexander', 'conquest', 'hellenism', 'empire'],
  },

  {
    id: 'quest-rise-and-fall-of-rome',
    epochId: 'epoch-ancient-world',
    title: 'The Eternal City',
    subtitle: 'Rome — republic, empire, and the fall that echoes forever',
    description: 'Rome began as a village of shepherds and ended as master of the Mediterranean. Along the way, it invented law, engineering, and a republic that inspired the American founders. Then Caesar crossed the Rubicon, and the republic died. The empire that replaced it endured for centuries — until it didn\'t.',
    narratorIntro: 'The Ides of March, 44 BC. Julius Caesar enters the Senate. He has been warned. He ignores the warnings. Twenty-three senators draw their daggers. In the blood pooling on the Senate floor, the Roman Republic breathes its last — and the age of emperors begins...',
    objectives: [
      { id: 'obj-visit-rubicon', type: 'visit_event', description: 'Watch Caesar cross the Rubicon — the point of no return', targetEntityId: 'evt-aw-crossing-rubicon', optional: false, xpReward: 20 },
      { id: 'obj-talk-caesar', type: 'talk_to_character', description: 'Speak with Caesar on the eve of the Rubicon — ask why he\'ll risk civil war', targetEntityId: 'per-aw-julius-caesar', optional: false, xpReward: 30 },
      { id: 'obj-visit-assassination', type: 'visit_event', description: 'Witness the assassination of Caesar', targetEntityId: 'evt-aw-assassination-caesar', optional: false, xpReward: 20 },
      { id: 'obj-talk-marcus-aurelius', type: 'talk_to_character', description: 'Speak with Marcus Aurelius about ruling a declining empire', targetEntityId: 'per-aw-marcus-aurelius', optional: false, xpReward: 25 },
      { id: 'obj-visit-fall-rome', type: 'visit_event', description: 'Witness the fall of Western Rome in 476 AD', targetEntityId: 'evt-aw-fall-western-rome', optional: false, xpReward: 20 },
    ],
    prerequisiteQuestIds: ['quest-alexanders-empire'],
    estimatedMinutes: 25,
    difficulty: 'hard',
    xpReward: 165,
    unlocks: [
      { type: 'epoch', entityId: 'epoch-medieval-world', description: 'Unlock the Medieval World epoch' },
    ],
    tags: ['rome', 'republic', 'empire', 'caesar', 'fall'],
  },

  {
    id: 'quest-ancient-world-synthesis',
    epochId: 'epoch-ancient-world',
    title: 'The Foundations of Civilization',
    subtitle: 'Connect the threads — from the Nile to the fall of Rome',
    description: 'You\'ve walked with pharaohs, debated Socrates, marched with Alexander, and watched Rome fall. Now step back and see the arc. What patterns connect these civilizations? Why do empires rise and fall? What survived the collapse?',
    narratorIntro: 'Three thousand years. Dozens of empires. Millions of lives. And yet certain themes echo across every civilization you\'ve visited — the tension between liberty and order, the rise of law, the power of ideas to outlast the empires that birthed them. Find the threads that connect it all...',
    objectives: [
      { id: 'obj-find-ancient-connections', type: 'find_connection', description: 'Discover 5 cross-civilization connections within the Ancient World', optional: false, xpReward: 50 },
      { id: 'obj-ancient-synthesis-question', type: 'answer_question', description: 'Answer: What is the single most important idea the ancient world gave to the modern world?', optional: false, xpReward: 30 },
      { id: 'obj-explore-ancient-world', type: 'explore_era', description: 'Visit at least 20 events across the Ancient World era', targetEntityId: 'ancient-world', optional: false, xpReward: 30 },
      { id: 'obj-debate-aristotle', type: 'debate_character', description: 'Debate Aristotle: is democracy the best form of government?', targetEntityId: 'per-aw-aristotle', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-trial-of-socrates', 'quest-rise-and-fall-of-rome'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 200,
    unlocks: [
      { type: 'title', entityId: 'classical-scholar', description: 'Earn the title: Classical Scholar' },
    ],
    tags: ['synthesis', 'capstone', 'ancient-world'],
  },

  // ── EPOCH 8: MEDIEVAL WORLD QUESTS ────────────────────────────────────

  {
    id: 'quest-house-of-wisdom',
    epochId: 'epoch-medieval-world',
    title: 'The House of Wisdom',
    subtitle: 'Baghdad and the Islamic Golden Age of science and scholarship',
    description: 'While Europe stumbled through its darkest centuries, Baghdad blazed with intellectual fire. The Abbasid caliphs built the House of Wisdom — a library, translation center, and research institute that preserved Greek knowledge and advanced mathematics, medicine, and optics far beyond anything the ancients achieved.',
    narratorIntro: 'Baghdad, 830 AD. The greatest library since Alexandria hums with activity. Scholars from Persia, India, and Greece translate every text they can find into Arabic. Al-Khwarizmi is inventing algebra. Ibn Sina is writing the medical textbook that will be used for 600 years. This is the Islamic Golden Age — and it will save civilization...',
    objectives: [
      { id: 'obj-visit-house-wisdom', type: 'visit_event', description: 'Visit the founding of the House of Wisdom in Baghdad', targetEntityId: 'evt-house-of-wisdom', optional: false, xpReward: 20 },
      { id: 'obj-talk-ibn-sina', type: 'talk_to_character', description: 'Speak with Ibn Sina about his Canon of Medicine', targetEntityId: 'per-ibn-sina', optional: false, xpReward: 25 },
      { id: 'obj-visit-algebra', type: 'visit_event', description: 'Visit al-Khwarizmi inventing algebra', targetEntityId: 'evt-al-khwarizmi-algebra', optional: false, xpReward: 20 },
      { id: 'obj-visit-optics', type: 'visit_event', description: 'Visit Ibn al-Haytham\'s revolutionary work on optics', targetEntityId: 'evt-ibn-al-haytham-optics', optional: false, xpReward: 15 },
      { id: 'obj-golden-age-question', type: 'answer_question', description: 'Answer: How did the Islamic Golden Age preserve and extend Greek knowledge?', optional: false, xpReward: 20 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 130,
    unlocks: [
      { type: 'character', entityId: 'per-genghis-khan', description: 'Unlock Genghis Khan as a character' },
    ],
    tags: ['islam', 'science', 'baghdad', 'golden-age', 'scholarship'],
  },

  {
    id: 'quest-viking-voyagers',
    epochId: 'epoch-medieval-world',
    title: 'Raiders and Explorers',
    subtitle: 'The Vikings — from Lindisfarne to Vinland',
    description: 'They were not just raiders. The Norse were explorers, traders, state-builders, and the first Europeans to reach North America. From the terror of Lindisfarne to the founding of Russia and the discovery of Vinland, the Vikings reshaped the medieval world.',
    narratorIntro: 'Lindisfarne, 793 AD. A monastery on a windswept English island. The monks are at prayer when the dragon-prowed ships appear on the horizon. It is the beginning of the Viking Age — three centuries of raiding, trading, and exploration that will take Norsemen from Baghdad to Newfoundland...',
    objectives: [
      { id: 'obj-visit-lindisfarne', type: 'visit_event', description: 'Witness the Viking raid on Lindisfarne — the shock that started an age', targetEntityId: 'evt-lindisfarne-raid', optional: false, xpReward: 20 },
      { id: 'obj-talk-leif-erikson', type: 'talk_to_character', description: 'Speak with Leif Erikson about reaching Vinland 500 years before Columbus', targetEntityId: 'per-leif-erikson', optional: false, xpReward: 25 },
      { id: 'obj-visit-vinland', type: 'visit_event', description: 'Visit Leif Erikson\'s landing at Vinland', targetEntityId: 'evt-leif-erikson-vinland', optional: false, xpReward: 20 },
      { id: 'obj-visit-founding-rus', type: 'visit_event', description: 'Visit the Viking founding of Rus — the origin of Russia', targetEntityId: 'evt-viking-founding-rus', optional: false, xpReward: 15 },
      { id: 'obj-viking-question', type: 'answer_question', description: 'Answer: Were the Vikings primarily raiders, traders, or explorers?', optional: true, xpReward: 20 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 125,
    unlocks: [],
    tags: ['vikings', 'exploration', 'norse', 'trade'],
  },

  {
    id: 'quest-genghis-khan-rises',
    epochId: 'epoch-medieval-world',
    title: 'The Wrath of the Steppe',
    subtitle: 'Genghis Khan forges the largest land empire in history',
    description: 'Born as Temujin, an orphaned outcast on the Mongolian steppe, he united warring nomadic tribes and built an army that conquered more territory than any force in history. The Mongol Empire connected East and West, spread plague and trade, and destroyed civilizations that had stood for centuries.',
    narratorIntro: 'The Mongolian steppe, 1206. A man who was once a starving fugitive stands before a gathering of every nomadic tribe. They proclaim him Genghis Khan — "Universal Ruler." Within two decades, his horsemen will shatter empires from China to Persia. The world will never be the same...',
    objectives: [
      { id: 'obj-talk-genghis', type: 'talk_to_character', description: 'Speak with Genghis Khan about how a starving orphan became ruler of the world', targetEntityId: 'per-genghis-khan', optional: false, xpReward: 30 },
      { id: 'obj-visit-empire-founded', type: 'visit_event', description: 'Witness the founding of the Mongol Empire', targetEntityId: 'evt-mongol-empire-founded', optional: false, xpReward: 20 },
      { id: 'obj-visit-sack-baghdad', type: 'visit_event', description: 'Witness the Mongol sack of Baghdad — the end of the Islamic Golden Age', targetEntityId: 'evt-mongol-sack-baghdad', optional: false, xpReward: 20 },
      { id: 'obj-debate-genghis', type: 'debate_character', description: 'Debate Genghis Khan: does your empire justify its cost in human life?', targetEntityId: 'per-genghis-khan', optional: false, xpReward: 35 },
      { id: 'obj-find-mongol-connections', type: 'find_connection', description: 'Find 3 ways the Mongol Empire connected East and West', optional: true, xpReward: 30 },
    ],
    prerequisiteQuestIds: ['quest-house-of-wisdom'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 170,
    unlocks: [
      { type: 'character', entityId: 'per-saladin', description: 'Unlock Saladin as a character' },
    ],
    tags: ['mongols', 'genghis-khan', 'conquest', 'empire', 'steppe'],
  },

  {
    id: 'quest-crusader-kingdoms',
    epochId: 'epoch-medieval-world',
    title: 'The Wars of the Cross',
    subtitle: 'The Crusades — faith, blood, and the clash of civilizations',
    description: 'In 1095, Pope Urban II called on Christendom to reclaim Jerusalem. What followed was two centuries of religious warfare that left deep scars on both sides — but also forced an exchange of ideas, technology, and culture between Europe and the Islamic world.',
    narratorIntro: 'Jerusalem, 1187. Saladin\'s army surrounds the city. Inside, the Crusader garrison knows it is doomed. But Saladin is not the monster the Crusaders expected. He will offer generous terms, spare civilians, and show a chivalry that shames his enemies. In the bloody story of the Crusades, Saladin stands as the noblest figure on any side...',
    objectives: [
      { id: 'obj-visit-first-crusade', type: 'visit_event', description: 'Visit the launch of the First Crusade in 1096', targetEntityId: 'evt-first-crusade', optional: false, xpReward: 20 },
      { id: 'obj-talk-saladin', type: 'talk_to_character', description: 'Speak with Saladin after retaking Jerusalem — ask about mercy in war', targetEntityId: 'per-saladin', optional: false, xpReward: 30 },
      { id: 'obj-visit-saladin-jerusalem', type: 'visit_event', description: 'Witness Saladin\'s recapture of Jerusalem in 1187', targetEntityId: 'evt-saladin-jerusalem', optional: false, xpReward: 20 },
      { id: 'obj-talk-richard', type: 'talk_to_character', description: 'Speak with Richard the Lionheart — his rival and reluctant admirer', targetEntityId: 'per-richard-lionheart', optional: false, xpReward: 25 },
      { id: 'obj-crusades-question', type: 'answer_question', description: 'Answer: Did the Crusades ultimately benefit or harm European civilization?', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-house-of-wisdom'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 155,
    unlocks: [],
    tags: ['crusades', 'saladin', 'jerusalem', 'religion', 'war'],
  },

  {
    id: 'quest-mali-golden-empire',
    epochId: 'epoch-medieval-world',
    title: 'The Golden King',
    subtitle: 'Mansa Musa and the wealth of medieval Africa',
    description: 'When Mansa Musa made his pilgrimage to Mecca in 1324, he brought so much gold that he crashed the economy of every city he passed through. The Mali Empire was one of the richest and most sophisticated states in the medieval world — yet it remains one of the least known. Time to change that.',
    narratorIntro: 'Cairo, 1324. A caravan stretches as far as the eye can see — 60,000 people, 12,000 servants, 80 camels each carrying 300 pounds of gold. The man at its head is Mansa Musa, ruler of Mali, and he is about to become the richest person in recorded history. His generosity will bankrupt Egypt for a decade...',
    objectives: [
      { id: 'obj-talk-mansa-musa', type: 'talk_to_character', description: 'Speak with Mansa Musa about the wealth and culture of Mali', targetEntityId: 'per-mansa-musa', optional: false, xpReward: 30 },
      { id: 'obj-visit-musa-hajj', type: 'visit_event', description: 'Witness Mansa Musa\'s legendary pilgrimage to Mecca', targetEntityId: 'evt-mansa-musa-hajj', optional: false, xpReward: 20 },
      { id: 'obj-visit-timbuktu', type: 'visit_event', description: 'Visit Timbuktu at its height — a center of learning rivaling any in Europe', targetEntityId: 'evt-timbuktu-learning', optional: false, xpReward: 20 },
      { id: 'obj-mali-question', type: 'answer_question', description: 'Answer: Why is the Mali Empire so little known compared to European kingdoms of the same era?', optional: false, xpReward: 25 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 120,
    unlocks: [],
    tags: ['africa', 'mali', 'mansa-musa', 'trade', 'gold'],
  },

  {
    id: 'quest-medieval-world-synthesis',
    epochId: 'epoch-medieval-world',
    title: 'The Web of the World',
    subtitle: 'Connect the medieval threads — from Baghdad to Timbuktu to Canterbury',
    description: 'The medieval world was far more connected than most people imagine. Silk Road caravans linked China to Italy. Viking longships sailed from Scandinavia to Constantinople. Islamic scholars translated Greek texts that European monks would later rediscover. Find the hidden network.',
    narratorIntro: 'Step back and see the medieval world as it truly was: not a collection of isolated kingdoms, but a vast web of trade routes, holy wars, and intellectual exchange. The House of Wisdom preserved Aristotle. Marco Polo connected Kublai Khan to Venice. Mansa Musa\'s gold funded European trade. Every thread connects...',
    objectives: [
      { id: 'obj-find-medieval-connections', type: 'find_connection', description: 'Discover 5 cross-civilization connections within the Medieval World', optional: false, xpReward: 50 },
      { id: 'obj-medieval-synthesis-question', type: 'answer_question', description: 'Answer: Was the "Dark Ages" label for medieval Europe fair? Why or why not?', optional: false, xpReward: 30 },
      { id: 'obj-explore-medieval-world', type: 'explore_era', description: 'Visit at least 20 events across the Medieval World era', targetEntityId: 'medieval-world', optional: false, xpReward: 30 },
      { id: 'obj-visit-marco-polo', type: 'visit_event', description: 'Visit Marco Polo\'s travels along the Silk Road', targetEntityId: 'evt-marco-polo-travels', optional: true, xpReward: 20 },
    ],
    prerequisiteQuestIds: ['quest-genghis-khan-rises', 'quest-crusader-kingdoms', 'quest-mali-golden-empire'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 200,
    unlocks: [
      { type: 'epoch', entityId: 'epoch-modern-era', description: 'Unlock the Modern Era epoch' },
      { type: 'title', entityId: 'medieval-master', description: 'Earn the title: Medieval Master' },
    ],
    tags: ['synthesis', 'capstone', 'medieval-world'],
  },

  // ── EPOCH 9: MODERN ERA QUESTS ────────────────────────────────────────

  {
    id: 'quest-birth-of-a-nation',
    epochId: 'epoch-modern-era',
    title: 'The Shot Heard Round the World',
    subtitle: 'Washington, Jefferson, and the American experiment',
    description: 'Thirteen colonies. Three million people. One audacious idea: that ordinary citizens could govern themselves without a king. The American Revolution was part military campaign, part philosophical experiment. It nearly failed a dozen times — and its success changed the meaning of freedom forever.',
    narratorIntro: 'Philadelphia, July 4, 1776. In a sweltering room above a horse stable, delegates sign a document that declares, with breathtaking audacity, that all men are created equal. Outside, a war rages that they are losing. George Washington\'s army is ragged, starving, and outnumbered. The revolution should not succeed. But it will...',
    objectives: [
      { id: 'obj-visit-declaration', type: 'visit_event', description: 'Visit the signing of the Declaration of Independence', targetEntityId: 'evt-declaration-independence', optional: false, xpReward: 20 },
      { id: 'obj-talk-washington', type: 'talk_to_character', description: 'Speak with George Washington about the burden of command', targetEntityId: 'per-washington', optional: false, xpReward: 30 },
      { id: 'obj-talk-franklin', type: 'talk_to_character', description: 'Ask Benjamin Franklin what "all men are created equal" really means', targetEntityId: 'per-franklin', optional: false, xpReward: 25 },
      { id: 'obj-visit-yorktown', type: 'visit_event', description: 'Witness the Battle of Yorktown — the victory that won independence', targetEntityId: 'evt-battle-yorktown', optional: false, xpReward: 15 },
      { id: 'obj-debate-jefferson', type: 'debate_character', description: 'Challenge Jefferson: how can you write "all men are created equal" while owning slaves?', targetEntityId: 'per-jefferson', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 20,
    difficulty: 'medium',
    xpReward: 160,
    unlocks: [
      { type: 'character', entityId: 'per-napoleon', description: 'Unlock Napoleon as a character' },
    ],
    tags: ['revolution', 'america', 'democracy', 'washington', 'jefferson'],
  },

  {
    id: 'quest-napoleon-emperor',
    epochId: 'epoch-modern-era',
    title: 'The Emperor of Europe',
    subtitle: 'Napoleon — revolutionary hero turned imperial tyrant',
    description: 'He rose from a minor Corsican noble to master of Europe in barely a decade. Napoleon was a military genius, a legal reformer, and ultimately a cautionary tale about the corruption of power. His Napoleonic Code still underpins the law in dozens of countries. His wars killed millions.',
    narratorIntro: 'Austerlitz, December 2, 1805. Napoleon stands on a hilltop watching the combined armies of Russia and Austria march into his trap. By nightfall, he will have won the most brilliant victory in military history. He is 36 years old, emperor of France, and master of half of Europe. But the seeds of his destruction are already planted...',
    objectives: [
      { id: 'obj-talk-napoleon', type: 'talk_to_character', description: 'Speak with Napoleon after Austerlitz — ask if there are limits to his ambition', targetEntityId: 'per-napoleon', optional: false, xpReward: 30 },
      { id: 'obj-visit-austerlitz', type: 'visit_event', description: 'Witness the Battle of Austerlitz — Napoleon\'s masterpiece', targetEntityId: 'evt-battle-austerlitz', optional: false, xpReward: 20 },
      { id: 'obj-visit-napoleonic-code', type: 'visit_event', description: 'Visit the creation of the Napoleonic Code', targetEntityId: 'evt-napoleonic-code', optional: false, xpReward: 15 },
      { id: 'obj-visit-waterloo', type: 'visit_event', description: 'Witness the Battle of Waterloo — the end of Napoleon\'s empire', targetEntityId: 'evt-battle-waterloo', optional: false, xpReward: 20 },
      { id: 'obj-debate-napoleon', type: 'debate_character', description: 'Debate Napoleon: did you save or betray the French Revolution?', targetEntityId: 'per-napoleon', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: ['quest-birth-of-a-nation'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 155,
    unlocks: [],
    tags: ['napoleon', 'france', 'war', 'empire', 'law'],
  },

  {
    id: 'quest-engines-of-change',
    epochId: 'epoch-modern-era',
    title: 'Engines of Change',
    subtitle: 'The Industrial Revolution — when machines transformed humanity',
    description: 'It began with steam and iron in the English Midlands and remade the entire world. Factories replaced farms. Cities swelled with workers. Children labored in mines. Fortunes were made and lives destroyed. The Industrial Revolution was the most disruptive economic transformation in history — and we are still living with its consequences.',
    narratorIntro: 'Manchester, 1830. The world\'s first intercity railway has just opened. A steam locomotive hurtles across the English countryside at the terrifying speed of 30 miles per hour. In the factories below, children as young as six work 14-hour shifts. This is the future — brilliant, brutal, and unstoppable...',
    objectives: [
      { id: 'obj-visit-steam-engine', type: 'visit_event', description: 'Visit James Watt perfecting the steam engine', targetEntityId: 'evt-steam-engine-watt', optional: false, xpReward: 20 },
      { id: 'obj-talk-watt', type: 'talk_to_character', description: 'Speak with James Watt about the power of steam', targetEntityId: 'per-watt', optional: false, xpReward: 25 },
      { id: 'obj-visit-first-railway', type: 'visit_event', description: 'Witness the opening of the first railway', targetEntityId: 'evt-first-railway', optional: false, xpReward: 15 },
      { id: 'obj-visit-child-labor', type: 'visit_event', description: 'Visit the child labor investigations — the dark side of industry', targetEntityId: 'evt-child-labor-investigations', optional: false, xpReward: 20 },
      { id: 'obj-industry-question', type: 'answer_question', description: 'Answer: Was the Industrial Revolution worth its human cost?', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 130,
    unlocks: [],
    tags: ['industry', 'steam', 'factories', 'railways', 'labor'],
  },

  {
    id: 'quest-breaking-chains',
    epochId: 'epoch-modern-era',
    title: 'Breaking Chains',
    subtitle: 'The fight to abolish slavery across the Atlantic world',
    description: 'The abolition of slavery was not inevitable. It was won through decades of relentless struggle — by enslaved people who risked everything to escape, by activists who demanded justice, and by a civil war that killed 750,000 Americans. Frederick Douglass, Harriet Tubman, and Abraham Lincoln each fought in different ways for the same cause.',
    narratorIntro: 'The hold of a slave ship, the Atlantic Ocean, date unknown. Hundreds of human beings lie chained in darkness, in their own filth, dying of disease and despair. This is the Middle Passage — and it carried 12 million Africans to slavery in the Americas. The story of abolition begins here, in the deepest darkness, where the demand for freedom first took root...',
    objectives: [
      { id: 'obj-talk-douglass', type: 'talk_to_character', description: 'Speak with Frederick Douglass about escaping slavery and fighting for abolition', targetEntityId: 'per-douglass', optional: false, xpReward: 30 },
      { id: 'obj-visit-british-abolition', type: 'visit_event', description: 'Visit the abolition of slavery in the British Empire', targetEntityId: 'evt-abolition-british-slavery', optional: false, xpReward: 20 },
      { id: 'obj-talk-lincoln', type: 'talk_to_character', description: 'Speak with Lincoln on the eve of the Emancipation Proclamation', targetEntityId: 'per-lincoln', optional: false, xpReward: 25 },
      { id: 'obj-visit-emancipation', type: 'visit_event', description: 'Witness the Emancipation Proclamation', targetEntityId: 'evt-emancipation-proclamation', optional: false, xpReward: 20 },
      { id: 'obj-debate-lincoln', type: 'debate_character', description: 'Challenge Lincoln: why did it take a war to end slavery?', targetEntityId: 'per-lincoln', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 165,
    unlocks: [
      { type: 'badge', entityId: 'justice-seeker', description: 'Achievement: Seeker of Justice' },
    ],
    tags: ['slavery', 'abolition', 'douglass', 'lincoln', 'civil-war'],
  },

  {
    id: 'quest-nations-forged-in-blood',
    epochId: 'epoch-modern-era',
    title: 'Nations Forged in Blood',
    subtitle: 'Nationalism, unification, and the revolutionary wave of 1848',
    description: 'The 19th century was the age of nation-building. Bolivar liberated South America. Bismarck unified Germany through "blood and iron." Italy was stitched together from a patchwork of kingdoms. And in 1848, revolutions erupted across Europe like a chain of firecrackers.',
    narratorIntro: 'Europe, spring 1848. In Paris, Berlin, Vienna, Milan, and Budapest, barricades go up on the same day. Students, workers, and intellectuals demand constitutions, national unity, and freedom. It is the most widespread revolutionary wave in European history — and nearly all of the revolutions will fail. But the ideas behind them will triumph within a generation...',
    objectives: [
      { id: 'obj-visit-revolutions-1848', type: 'visit_event', description: 'Witness the revolutions of 1848 sweeping across Europe', targetEntityId: 'evt-revolutions-1848', optional: false, xpReward: 20 },
      { id: 'obj-talk-bismarck', type: 'talk_to_character', description: 'Speak with Bismarck about unifying Germany through "blood and iron"', targetEntityId: 'per-bismarck', optional: false, xpReward: 25 },
      { id: 'obj-visit-german-unification', type: 'visit_event', description: 'Witness the unification of Germany in 1871', targetEntityId: 'evt-german-unification', optional: false, xpReward: 20 },
      { id: 'obj-talk-bolivar', type: 'talk_to_character', description: 'Speak with Bolivar about liberating South America from Spanish rule', targetEntityId: 'per-bolivar', optional: false, xpReward: 25 },
      { id: 'obj-nationalism-question', type: 'answer_question', description: 'Answer: Is nationalism a force for liberation or a force for destruction?', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-birth-of-a-nation'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 150,
    unlocks: [],
    tags: ['nationalism', 'unification', 'revolution', '1848', 'bismarck'],
  },

  {
    id: 'quest-modern-era-synthesis',
    epochId: 'epoch-modern-era',
    title: 'The Age of Upheaval',
    subtitle: 'Connect the revolutions — political, industrial, and moral',
    description: 'The Modern Era was shaped by three great revolutions: political (America, France, 1848), industrial (steam, railways, factories), and moral (abolition, women\'s rights). Together they shattered the old world and built a new one — imperfect, unfinished, but recognizably modern.',
    narratorIntro: 'Two centuries. Three revolutions. One transformed question: who gets to be free? The American Revolution said citizens could govern themselves. The Industrial Revolution said machines could outwork humans. The abolition movement said no human being could own another. Together, these upheavals created the modern world — for better and for worse...',
    objectives: [
      { id: 'obj-find-modern-connections', type: 'find_connection', description: 'Discover 5 cross-domain connections within the Modern Era', optional: false, xpReward: 50 },
      { id: 'obj-modern-synthesis-question', type: 'answer_question', description: 'Answer: Which of the three great revolutions — political, industrial, or moral — had the greatest lasting impact?', optional: false, xpReward: 30 },
      { id: 'obj-explore-modern-era', type: 'explore_era', description: 'Visit at least 20 events across the Modern Era', targetEntityId: 'modern-era', optional: false, xpReward: 30 },
      { id: 'obj-talk-marx', type: 'talk_to_character', description: 'Speak with Karl Marx about whether capitalism can be reformed', targetEntityId: 'per-marx', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-napoleon-emperor', 'quest-breaking-chains', 'quest-nations-forged-in-blood'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 200,
    unlocks: [
      { type: 'epoch', entityId: 'epoch-twentieth-century', description: 'Unlock the Twentieth Century epoch' },
      { type: 'title', entityId: 'modern-historian', description: 'Earn the title: Modern Historian' },
    ],
    tags: ['synthesis', 'capstone', 'modern-era'],
  },

  // ── EPOCH 10: TWENTIETH CENTURY QUESTS ────────────────────────────────

  {
    id: 'quest-war-to-end-all-wars',
    epochId: 'epoch-twentieth-century',
    title: 'The War to End All Wars',
    subtitle: 'World War I — how a single assassination destroyed a civilization',
    description: 'In the summer of 1914, a teenager shot an archduke in Sarajevo. Six weeks later, the entire world was at war. Four empires would collapse. Ten million soldiers would die. An entire generation would be scarred forever. And the peace treaty would plant the seeds of an even worse war.',
    narratorIntro: 'The trenches of the Western Front, 1916. You are standing in a ditch six feet deep, stretching from the English Channel to Switzerland. On both sides, millions of men live like rats in the mud, dying by the thousands for yards of ground. This is industrialized slaughter — and it is only the beginning...',
    objectives: [
      { id: 'obj-visit-assassination', type: 'visit_event', description: 'Witness the assassination of Archduke Franz Ferdinand', targetEntityId: 'evt-20c-assassination-franz-ferdinand', optional: false, xpReward: 20 },
      { id: 'obj-visit-trenches', type: 'visit_event', description: 'Visit the trenches of WWI — modern war at its most brutal', targetEntityId: 'evt-20c-trench-warfare', optional: false, xpReward: 20 },
      { id: 'obj-talk-churchill-wwi', type: 'talk_to_character', description: 'Speak with Churchill about Gallipoli — his greatest failure', targetEntityId: 'per-20c-churchill', optional: false, xpReward: 25 },
      { id: 'obj-visit-versailles', type: 'visit_event', description: 'Visit the Treaty of Versailles — the peace that failed', targetEntityId: 'evt-20c-treaty-versailles', optional: false, xpReward: 15 },
      { id: 'obj-wwi-question', type: 'answer_question', description: 'Answer: How did the Treaty of Versailles make World War II inevitable?', optional: false, xpReward: 25 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 140,
    unlocks: [
      { type: 'character', entityId: 'per-20c-fdr', description: 'Unlock FDR as a character' },
    ],
    tags: ['wwi', 'trenches', 'versailles', 'assassination'],
  },

  {
    id: 'quest-darkest-hour',
    epochId: 'epoch-twentieth-century',
    title: 'The Darkest Hour',
    subtitle: 'World War II — the fight against fascism and the shadow of the Holocaust',
    description: 'The most destructive conflict in human history killed over 70 million people, including 6 million Jews murdered in the Holocaust. It was also the moment when ordinary people chose to fight, at unimaginable cost, against the worst ideology humanity has ever produced.',
    narratorIntro: 'London, 1940. France has fallen. The Luftwaffe rains bombs on the city every night. Britain stands alone against Nazi Germany. In a bunker beneath Whitehall, Winston Churchill broadcasts to the nation: "We shall fight on the beaches... we shall never surrender." The fate of civilization hangs on the courage of a battered island...',
    objectives: [
      { id: 'obj-talk-churchill-wwii', type: 'talk_to_character', description: 'Speak with Churchill during the Blitz — ask how he keeps the nation fighting', targetEntityId: 'per-20c-churchill', optional: false, xpReward: 30 },
      { id: 'obj-visit-battle-britain', type: 'visit_event', description: 'Witness the Battle of Britain', targetEntityId: 'evt-20c-battle-britain', optional: false, xpReward: 20 },
      { id: 'obj-visit-d-day', type: 'visit_event', description: 'Witness D-Day — the largest amphibious invasion in history', targetEntityId: 'evt-20c-d-day', optional: false, xpReward: 20 },
      { id: 'obj-visit-holocaust', type: 'visit_event', description: 'Visit the Holocaust — humanity\'s darkest chapter (content warning)', targetEntityId: 'evt-20c-holocaust', optional: false, xpReward: 15 },
      { id: 'obj-talk-fdr', type: 'talk_to_character', description: 'Speak with FDR about the decision to enter the war', targetEntityId: 'per-20c-fdr', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: ['quest-war-to-end-all-wars'],
    estimatedMinutes: 25,
    difficulty: 'hard',
    xpReward: 160,
    unlocks: [],
    tags: ['wwii', 'churchill', 'holocaust', 'd-day', 'fascism'],
  },

  {
    id: 'quest-cold-war-shadow',
    epochId: 'epoch-twentieth-century',
    title: 'The Shadow of the Bomb',
    subtitle: 'The Cold War — when two superpowers held the world hostage',
    description: 'For 45 years, the United States and the Soviet Union pointed enough nuclear weapons at each other to destroy civilization several times over. The Cold War was fought in proxy wars, spy games, and a terrifying standoff that came within minutes of annihilation during the Cuban Missile Crisis.',
    narratorIntro: 'October 27, 1962. A Soviet submarine, depth-charged by American destroyers, prepares to launch a nuclear torpedo. Only one officer — Vasili Arkhipov — refuses to authorize the launch. One man\'s decision prevents nuclear war. This is how close the Cold War came to ending everything...',
    objectives: [
      { id: 'obj-visit-cold-war-begins', type: 'visit_event', description: 'Visit the beginning of the Cold War', targetEntityId: 'evt-20c-cold-war-begins', optional: false, xpReward: 20 },
      { id: 'obj-visit-cuban-missile', type: 'visit_event', description: 'Witness the Cuban Missile Crisis — 13 days on the brink', targetEntityId: 'evt-20c-cuban-missile-crisis', optional: false, xpReward: 25 },
      { id: 'obj-talk-jfk', type: 'talk_to_character', description: 'Speak with JFK during the Cuban Missile Crisis', targetEntityId: 'per-20c-jfk', optional: false, xpReward: 30 },
      { id: 'obj-visit-berlin-wall-built', type: 'visit_event', description: 'Witness the construction of the Berlin Wall', targetEntityId: 'evt-20c-berlin-wall-built', optional: false, xpReward: 15 },
      { id: 'obj-visit-wall-falls', type: 'visit_event', description: 'Witness the fall of the Berlin Wall in 1989', targetEntityId: 'evt-20c-fall-berlin-wall', optional: false, xpReward: 20 },
    ],
    prerequisiteQuestIds: ['quest-darkest-hour'],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 150,
    unlocks: [],
    tags: ['cold-war', 'nuclear', 'cuban-missile-crisis', 'berlin-wall'],
  },

  {
    id: 'quest-dream-of-equality',
    epochId: 'epoch-twentieth-century',
    title: 'The Dream',
    subtitle: 'The civil rights movement — from Montgomery to the march on Washington',
    description: 'In a nation founded on the principle that "all men are created equal," millions of Black Americans were denied basic rights for a century after slavery ended. The civil rights movement changed that — through courage, nonviolence, and the moral force of people who refused to accept injustice.',
    narratorIntro: 'Washington, D.C., August 28, 1963. A quarter million people stand before the Lincoln Memorial. A Baptist preacher from Atlanta steps to the microphone. "I have a dream," he begins — and the words will echo through history. But the dream was built on decades of quiet courage: a seamstress who refused to give up her bus seat, students who sat at lunch counters while mobs screamed, children who faced fire hoses and police dogs...',
    objectives: [
      { id: 'obj-talk-mlk', type: 'talk_to_character', description: 'Speak with Dr. Martin Luther King Jr. about nonviolent resistance', targetEntityId: 'per-20c-mlk', optional: false, xpReward: 30 },
      { id: 'obj-visit-march-washington', type: 'visit_event', description: 'Witness the March on Washington and "I Have a Dream"', targetEntityId: 'evt-20c-march-washington', optional: false, xpReward: 20 },
      { id: 'obj-visit-montgomery', type: 'visit_event', description: 'Visit the Montgomery Bus Boycott — where it began', targetEntityId: 'evt-20c-montgomery-bus-boycott', optional: false, xpReward: 20 },
      { id: 'obj-visit-civil-rights-act', type: 'visit_event', description: 'Witness the passage of the Civil Rights Act of 1964', targetEntityId: 'evt-20c-civil-rights-act', optional: false, xpReward: 20 },
      { id: 'obj-talk-gandhi', type: 'talk_to_character', description: 'Speak with Gandhi about the philosophy of nonviolence that inspired MLK', targetEntityId: 'per-20c-gandhi', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 155,
    unlocks: [
      { type: 'badge', entityId: 'voice-for-justice', description: 'Achievement: Voice for Justice' },
    ],
    tags: ['civil-rights', 'mlk', 'equality', 'nonviolence', 'gandhi'],
  },

  {
    id: 'quest-one-giant-leap',
    epochId: 'epoch-twentieth-century',
    title: 'One Giant Leap',
    subtitle: 'The Space Race — from Sputnik to the Moon',
    description: 'Born from Cold War rivalry, the Space Race became humanity\'s greatest adventure. In just 12 years, we went from launching a beeping metal sphere into orbit to putting a human being on the Moon. It remains the single most ambitious thing our species has ever done.',
    narratorIntro: 'The Sea of Tranquility, July 20, 1969. Neil Armstrong descends the ladder of the lunar module. Six hundred million people on Earth watch on flickering television screens. His boot touches the surface. "That\'s one small step for man, one giant leap for mankind." For one shining moment, all of humanity is united in wonder...',
    objectives: [
      { id: 'obj-visit-space-race', type: 'visit_event', description: 'Visit the beginning of the Space Race', targetEntityId: 'evt-20c-space-race', optional: false, xpReward: 15 },
      { id: 'obj-visit-gagarin', type: 'visit_event', description: 'Witness Yuri Gagarin becoming the first human in space', targetEntityId: 'evt-20c-gagarin', optional: false, xpReward: 20 },
      { id: 'obj-visit-moon-landing', type: 'visit_event', description: 'Witness the Apollo 11 Moon landing', targetEntityId: 'evt-20c-moon-landing', optional: false, xpReward: 25 },
      { id: 'obj-talk-armstrong', type: 'talk_to_character', description: 'Speak with Neil Armstrong about what it felt like to walk on the Moon', targetEntityId: 'per-20c-armstrong', optional: false, xpReward: 30 },
      { id: 'obj-space-question', type: 'answer_question', description: 'Answer: Was the Moon landing worth its enormous cost, or should the money have been spent on Earth?', optional: true, xpReward: 25 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 15,
    difficulty: 'medium',
    xpReward: 145,
    unlocks: [],
    tags: ['space', 'moon', 'apollo', 'nasa', 'exploration'],
  },

  {
    id: 'quest-digital-dawn',
    epochId: 'epoch-twentieth-century',
    title: 'The Digital Dawn',
    subtitle: 'From Turing to the World Wide Web',
    description: 'In 1943, a brilliant mathematician cracked Nazi codes with a primitive computer. Fifty years later, a physicist at CERN created the World Wide Web. Between those two moments, humanity invented a technology that would change civilization more profoundly than the printing press: the digital computer.',
    narratorIntro: 'Bletchley Park, 1943. Alan Turing stares at a wall of spinning rotors. He is trying to crack the Enigma code — and in doing so, he is inventing the theoretical foundations of every computer that will ever exist. From this wartime code-breaking effort, a revolution will grow that connects every human on Earth...',
    objectives: [
      { id: 'obj-visit-enigma', type: 'visit_event', description: 'Visit Turing cracking the Enigma code at Bletchley Park', targetEntityId: 'evt-20c-turing-enigma', optional: false, xpReward: 20 },
      { id: 'obj-talk-turing', type: 'talk_to_character', description: 'Speak with Alan Turing about whether machines can think', targetEntityId: 'per-20c-turing', optional: false, xpReward: 30 },
      { id: 'obj-visit-first-computer', type: 'visit_event', description: 'Visit the first electronic computer', targetEntityId: 'evt-20c-first-computer', optional: false, xpReward: 15 },
      { id: 'obj-visit-www', type: 'visit_event', description: 'Witness the invention of the World Wide Web', targetEntityId: 'evt-20c-world-wide-web', optional: false, xpReward: 20 },
      { id: 'obj-debate-turing', type: 'debate_character', description: 'Debate Turing: will machines ever truly think, or only simulate thinking?', targetEntityId: 'per-20c-turing', optional: true, xpReward: 35 },
    ],
    prerequisiteQuestIds: [],
    estimatedMinutes: 20,
    difficulty: 'hard',
    xpReward: 155,
    unlocks: [],
    tags: ['computing', 'turing', 'internet', 'digital', 'web'],
  },

  {
    id: 'quest-twentieth-century-synthesis',
    epochId: 'epoch-twentieth-century',
    title: 'The Century in Full',
    subtitle: 'Connect the extremes — destruction and creation, tyranny and liberation',
    description: 'The twentieth century was the best of times and the worst of times — simultaneously. The same technology that put humans on the Moon built nuclear weapons. The same century that produced the Holocaust produced the Universal Declaration of Human Rights. Find the threads that connect the century\'s greatest horrors and highest achievements.',
    narratorIntro: 'Stand at the end of the century and look back. You have witnessed trenches and Moon landings, death camps and civil rights marches, the splitting of the atom and the sequencing of the genome. No century in human history packed more destruction and more progress into a single span. Now find the pattern — because the 21st century inherits all of it...',
    objectives: [
      { id: 'obj-find-20c-connections', type: 'find_connection', description: 'Discover 5 cross-domain connections within the Twentieth Century', optional: false, xpReward: 50 },
      { id: 'obj-20c-synthesis-question', type: 'answer_question', description: 'Answer: What is the most important lesson the twentieth century teaches the twenty-first?', optional: false, xpReward: 30 },
      { id: 'obj-explore-20c', type: 'explore_era', description: 'Visit at least 25 events across the Twentieth Century', targetEntityId: 'era-twentieth-century', optional: false, xpReward: 35 },
      { id: 'obj-talk-mandela', type: 'talk_to_character', description: 'Speak with Nelson Mandela about forgiveness after 27 years in prison', targetEntityId: 'per-20c-mandela', optional: true, xpReward: 30 },
      { id: 'obj-talk-einstein', type: 'talk_to_character', description: 'Speak with Einstein about the moral responsibility of scientists', targetEntityId: 'per-20c-einstein', optional: true, xpReward: 30 },
    ],
    prerequisiteQuestIds: ['quest-darkest-hour', 'quest-cold-war-shadow', 'quest-dream-of-equality', 'quest-one-giant-leap', 'quest-digital-dawn'],
    estimatedMinutes: 25,
    difficulty: 'challenge',
    xpReward: 250,
    unlocks: [
      { type: 'title', entityId: 'master-historian', description: 'Earn the title: Master Historian' },
      { type: 'badge', entityId: 'history-wing-complete', description: 'Achievement: History Wing Complete' },
    ],
    tags: ['synthesis', 'capstone', 'twentieth-century'],
  },
];

// ============================================================================
// Helpers
// ============================================================================

export const EPOCHS_BY_ID = new Map(EPOCHS.map(e => [e.id, e]));
export const QUESTS_BY_ID = new Map(QUESTS.map(q => [q.id, q]));

export function getQuestsForEpoch(epochId: string): Quest[] {
  return QUESTS.filter(q => q.epochId === epochId);
}

export function getAvailableQuests(completedQuestIds: Set<string>): Quest[] {
  return QUESTS.filter(q =>
    !completedQuestIds.has(q.id) &&
    q.prerequisiteQuestIds.every(id => completedQuestIds.has(id))
  );
}

export function getAvailableEpochs(completedEpochIds: Set<string>): Epoch[] {
  return EPOCHS.filter(e =>
    !completedEpochIds.has(e.id) &&
    e.prerequisiteEpochIds.every(id => completedEpochIds.has(id))
  );
}

export function calculateLevel(totalXp: number): { level: number; title: string; nextLevelXp: number; progress: number } {
  const { MASTERY_LEVELS } = require('./knowledge-graph');
  let currentLevel = MASTERY_LEVELS[0];
  for (const ml of MASTERY_LEVELS) {
    if (totalXp >= ml.xpRequired) currentLevel = ml;
    else break;
  }
  const nextLevel = MASTERY_LEVELS.find((ml: any) => ml.level === currentLevel.level + 1);
  const nextXp = nextLevel ? nextLevel.xpRequired : currentLevel.xpRequired;
  const progress = nextLevel
    ? (totalXp - currentLevel.xpRequired) / (nextXp - currentLevel.xpRequired)
    : 1;
  return { level: currentLevel.level, title: currentLevel.title, nextLevelXp: nextXp, progress };
}
