// ============================================================================
// Knowledge Graph Type Definitions
// The content model for Neurevo's experiential encyclopedia
// Pattern: mirrors Ye Universe's discography.ts entity-relationship model
// ============================================================================

// -- Domains (categories of knowledge) ----------------------------------------

export interface Domain {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export const DOMAINS: Domain[] = [
  { id: 'art', name: 'Art & Culture', icon: '\u{1F3A8}', color: '#E74C3C', description: 'Visual arts, literature, music, architecture, and cultural movements' },
  { id: 'science', name: 'Science', icon: '\u{1F52C}', color: '#3498DB', description: 'Natural sciences, mathematics, and the scientific method' },
  { id: 'politics', name: 'Politics & Power', icon: '\u{1F3DB}', color: '#9B59B6', description: 'Governance, empires, revolutions, and political thought' },
  { id: 'philosophy', name: 'Philosophy', icon: '\u{1F4AD}', color: '#F39C12', description: 'Ideas about existence, knowledge, ethics, and meaning' },
  { id: 'technology', name: 'Technology', icon: '\u{2699}\u{FE0F}', color: '#1ABC9C', description: 'Inventions, engineering, and tools that changed civilization' },
  { id: 'exploration', name: 'Exploration', icon: '\u{1F30D}', color: '#2ECC71', description: 'Voyages, discoveries, and the mapping of the world' },
  { id: 'war', name: 'War & Conflict', icon: '\u{2694}\u{FE0F}', color: '#E67E22', description: 'Battles, strategies, and the consequences of conflict' },
  { id: 'religion', name: 'Religion & Spirituality', icon: '\u{2728}', color: '#8E44AD', description: 'Faith, theology, and spiritual movements' },
  { id: 'medicine', name: 'Medicine', icon: '\u{2695}\u{FE0F}', color: '#E91E63', description: 'Healing, anatomy, disease, and the pursuit of health' },
  { id: 'economics', name: 'Economics & Trade', icon: '\u{1F4B0}', color: '#00BCD4', description: 'Commerce, finance, and economic systems' },
];

// -- Eras (top-level time containers) -----------------------------------------

export interface Era {
  id: string;
  name: string;
  subtitle: string;
  years: [number, number]; // [start, end]
  region: string;
  color: string;
  description: string;
  domainIds: string[];
  keyEventIds: string[];
  keyPersonIds: string[];
  themes: string[];
  wing: 'history' | 'science';
  precededBy: string[];
  followedBy: string[];
}

// -- Historical Events (the atomic content unit — equivalent to "Song") -------

export type Significance = 'defining' | 'major' | 'notable' | 'minor';

export interface Location {
  name: string;
  lat?: number;
  lng?: number;
}

export interface HistoricalEvent {
  id: string;
  title: string;
  date: string;          // "1440" | "1440-03" | "1440-03-15"
  dateYear: number;       // numeric year for sorting/filtering
  eraId: string;
  domainIds: string[];
  location: Location;
  description: string;    // 2-4 sentences, factual
  significance: Significance;
  whyItMatters: string;   // the "meaning" — like Ye Universe's song meanings
  personIds: string[];
  artifactIds: string[];
  conceptIds: string[];
  causedBy: string[];     // event IDs — causal chain
  ledTo: string[];        // event IDs — consequences
  tags: string[];
}

// -- Historical People (equivalent to "Producer") -----------------------------

export interface PersonConnection {
  personId: string;
  relationship: 'mentor' | 'rival' | 'contemporary' | 'student' | 'patron' | 'collaborator' | 'opponent' | 'family';
  description?: string;
}

export interface HistoricalPerson {
  id: string;
  name: string;
  born: string;           // "1452-04-15" or "1452"
  bornYear: number;
  died?: string;
  diedYear?: number;
  eraIds: string[];
  domainIds: string[];
  nationality: string;
  roles: string[];        // "painter", "inventor", "anatomist"
  description: string;    // 2-3 sentences
  eventIds: string[];
  artifactIds: string[];
  connections: PersonConnection[];
  portraitUrl?: string;
  isPlayable: boolean;    // has a character profile for AI chat
}

// -- Artifacts (tangible evidence — equivalent to "Sample") -------------------

export type ArtifactType = 'artwork' | 'document' | 'invention' | 'building' | 'scientific-work' | 'text' | 'instrument' | 'map';

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  date: string;
  dateYear: number;
  creatorIds: string[];
  eraId: string;
  domainIds: string[];
  description: string;
  significance: string;
  currentLocation?: string;  // "Louvre, Paris"
  imageUrl?: string;
  conceptIds: string[];
}

// -- Concepts (abstract ideas — equivalent to "Theme") ------------------------

export interface Concept {
  id: string;
  name: string;
  domainIds: string[];
  description: string;
  relatedConceptIds: string[];
  firstAppearedInEventId?: string;
  keyPersonIds: string[];
}

// -- Cross-entity Connections -------------------------------------------------

export type ConnectionStrength = 'direct' | 'indirect' | 'thematic';

export interface KnowledgeConnection {
  id: string;
  fromId: string;
  fromType: 'event' | 'person' | 'artifact' | 'concept' | 'era';
  toId: string;
  toType: 'event' | 'person' | 'artifact' | 'concept' | 'era';
  relationship: string;   // "influenced", "preceded", "contradicted", "built-upon", "inspired"
  description: string;
  strength: ConnectionStrength;
}

// -- Character System (for AI living characters) ------------------------------

export interface CharacterLifeStage {
  id: string;
  label: string;                  // "Leonardo in Milan (1495)"
  yearRange: [number, number];
  location: string;
  currentWork: string[];
  mood: string;
  concerns: string[];
  knowledgeState: string;         // what they know at this point
  recentEvents: string[];
}

export interface CharacterProfile {
  personId: string;
  voiceDescription: string;
  speechPatterns: string[];
  knowledgeBoundary: string;      // "Knows nothing after May 1519"
  personality: string[];
  quirks: string[];
  perspectives: string[];
  emotionalCore: string;
  lifeStages: CharacterLifeStage[];
}

// -- Alchemy Engine -----------------------------------------------------------

export interface AlchemyElement {
  id: string;
  name: string;
  icon: string;
  tier: number;                   // 0 = base, 1-5+ = increasingly complex
  recipe: [string, string] | null; // null for base elements
  discoveredBy?: string;          // person ID
  year?: string;
  description: string;
  unlocksEventId?: string;
  unlocksCharacterId?: string;
  unlocksSimulation?: string;     // simulation ID for interactive sims
  category: 'element' | 'material' | 'force' | 'concept' | 'invention' | 'theory' | 'organism' | 'phenomenon';
}

// -- Exploration Paths (equivalent to Ye Universe's "Listening Paths") --------

export interface ExplorationPath {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  icon: string;
  entityIds: string[];            // ordered sequence of events/people/artifacts
  entityTypes: ('event' | 'person' | 'artifact')[];
  estimatedMinutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

// -- Trivia -------------------------------------------------------------------

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  eraId?: string;
  domainIds: string[];
  relatedEntityId?: string;
  relatedEntityType?: 'event' | 'person' | 'artifact' | 'concept';
}

// -- Battles (historical matchups) --------------------------------------------

export interface HistoricalBattle {
  id: string;
  entityA: string;
  entityAType: 'event' | 'person' | 'artifact' | 'concept' | 'era';
  entityB: string;
  entityBType: 'event' | 'person' | 'artifact' | 'concept' | 'era';
  category: string;               // "Clash of Titans", "Turning Points", "What If?"
  prompt: string;                  // "Who changed the world more?"
}

// -- Explorer Archetypes (taste profiles) -------------------------------------

export interface ExplorerArchetype {
  id: string;
  name: string;
  icon: string;
  description: string;
  primaryDomains: string[];
  favoriteEras: string[];
  pathIds: string[];
}

// ============================================================================
// GUIDED EXPERIENTIAL CURRICULUM
// The "campaign mode" — structured learning that feels like a video game.
// Users progress through Epochs (acts), complete Quests (missions),
// earn Mastery (XP/levels), and unlock new content.
// ============================================================================

// -- Epochs (major campaign chapters — like game acts) ------------------------

export interface Epoch {
  id: string;
  title: string;                   // "The Awakening of Reason"
  subtitle: string;                // "Ancient Greece to the Fall of Rome"
  description: string;             // 2-3 sentences setting the scene
  eraIds: string[];                // which eras this epoch covers
  questIds: string[];              // quests in order
  prerequisiteEpochIds: string[];  // must complete before unlocking
  unlockCondition?: string;        // human-readable unlock condition
  rewardDescription: string;       // what you earn for completing
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'master';
  estimatedHours: number;
  color: string;
  icon: string;
}

// -- Quests (individual missions within an epoch) -----------------------------

export type QuestObjectiveType =
  | 'visit_event'              // navigate to a specific event
  | 'talk_to_character'        // have a conversation with a historical figure
  | 'answer_question'          // answer a trivia/comprehension question
  | 'discover_alchemy'         // discover an element in the alchemy engine
  | 'complete_path'            // follow an exploration path
  | 'find_connection'          // discover a link between two entities
  | 'watch_simulation'         // observe a live simulation
  | 'solve_challenge'          // solve a historical puzzle/scenario
  | 'cast_battle_vote'         // participate in a historical matchup
  | 'explore_era'              // visit N entities within an era
  | 'debate_character';        // challenge a character's ideas

export interface QuestObjective {
  id: string;
  type: QuestObjectiveType;
  description: string;            // "Ask Leonardo about his flying machine designs"
  targetEntityId?: string;        // which entity to interact with
  targetAlchemyId?: string;       // which alchemy element to discover
  completionCriteria?: string;    // flexible text for complex objectives
  optional: boolean;              // bonus objectives
  xpReward: number;
}

export interface Quest {
  id: string;
  epochId: string;
  title: string;                  // "The Workshop of Genius"
  subtitle: string;               // "Meet Leonardo da Vinci in his Milan studio"
  description: string;            // narrative setup — like a quest briefing
  narratorIntro: string;          // what the showrunner says when this quest begins
  objectives: QuestObjective[];
  prerequisiteQuestIds: string[];
  estimatedMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'challenge';
  xpReward: number;               // total for completing
  unlocks: QuestReward[];
  tags: string[];                 // for categorization
}

export interface QuestReward {
  type: 'character' | 'event' | 'artifact' | 'alchemy_element' | 'simulation' | 'epoch' | 'title' | 'badge';
  entityId: string;
  description: string;
}

// -- Mastery System (XP, levels, and progression) -----------------------------

export interface MasteryLevel {
  level: number;
  title: string;                   // "Curious Visitor" → "Time Traveler" → "Master Historian"
  xpRequired: number;
  perks: string[];                 // what unlocks at this level
  badge: string;
}

export const MASTERY_LEVELS: MasteryLevel[] = [
  { level: 1, title: 'Curious Visitor', xpRequired: 0, perks: ['Access to Renaissance Hall', 'Basic alchemy (4 elements)'], badge: '\u{1F3DF}\u{FE0F}' },
  { level: 2, title: 'Apprentice Explorer', xpRequired: 100, perks: ['Unlock 2 character conversations', 'Tier 1-2 alchemy'], badge: '\u{1F9ED}' },
  { level: 3, title: 'Scholar', xpRequired: 300, perks: ['Access to Scientific Revolution Hall', 'Daily trivia unlocked'], badge: '\u{1F4DA}' },
  { level: 4, title: 'Natural Philosopher', xpRequired: 600, perks: ['Unlock character debates', 'Tier 3 alchemy'], badge: '\u{1F52C}' },
  { level: 5, title: 'Polymath', xpRequired: 1000, perks: ['Access to Age of Exploration Hall', 'Exploration paths unlocked'], badge: '\u{1F30D}' },
  { level: 6, title: 'Enlightened Mind', xpRequired: 1500, perks: ['Science Wing access', 'Tier 4 alchemy', 'Simulations unlocked'], badge: '\u{2728}' },
  { level: 7, title: 'Time Traveler', xpRequired: 2500, perks: ['All halls accessible', 'Tier 5 alchemy', '"What if?" scenarios'], badge: '\u{231A}' },
  { level: 8, title: 'Sage', xpRequired: 4000, perks: ['Community curator tools', 'Tier 6 alchemy', 'All characters unlocked'], badge: '\u{1F9D9}' },
  { level: 9, title: 'Architect of Knowledge', xpRequired: 6000, perks: ['Submit new connections', 'Advanced simulations', 'Custom exploration paths'], badge: '\u{1F3DB}\u{FE0F}' },
  { level: 10, title: 'Master of the Museum', xpRequired: 10000, perks: ['Everything unlocked', 'Contributor badge', 'Name in credits'], badge: '\u{1F451}' },
];

// -- Skill Trees (domain-specific mastery) ------------------------------------

export interface SkillNode {
  id: string;
  domain: string;                  // 'science', 'art', 'politics', etc.
  name: string;                    // "Renaissance Art Fundamentals"
  description: string;
  prerequisiteIds: string[];
  questIds: string[];              // quests that contribute to this skill
  xpRequired: number;
  level: number;                   // position in the skill tree
}

// -- Achievements / Badges ----------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: string;               // human-readable unlock condition
  secret: boolean;                 // hidden until unlocked?
  xpReward: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-conversation', name: 'First Words', description: 'Have your first conversation with a historical figure', icon: '\u{1F4AC}', condition: 'Talk to any character', secret: false, xpReward: 25 },
  { id: 'first-discovery', name: 'Eureka!', description: 'Discover your first element in the Alchemy Engine', icon: '\u{1F4A1}', condition: 'Combine two elements successfully', secret: false, xpReward: 25 },
  { id: 'polymath-path', name: 'Renaissance Soul', description: 'Visit events in Art, Science, Politics, and Philosophy in one session', icon: '\u{1F3A8}', condition: 'Visit 4 different domain events in one session', secret: false, xpReward: 100 },
  { id: 'time-paradox', name: 'Time Paradox', description: 'Ask a historical figure about something that hasn\'t happened yet', icon: '\u{231A}', condition: 'Ask a character about a future event', secret: true, xpReward: 50 },
  { id: 'debate-master', name: 'Debate Champion', description: 'Challenge 5 different historical figures\' ideas', icon: '\u{2694}\u{FE0F}', condition: 'Use debate mode with 5 characters', secret: false, xpReward: 150 },
  { id: 'connection-maker', name: 'The Connector', description: 'Discover 10 cross-era connections', icon: '\u{1F310}', condition: 'Find 10 connections between different eras', secret: false, xpReward: 200 },
  { id: 'alchemist', name: 'Master Alchemist', description: 'Discover 50 elements in the Alchemy Engine', icon: '\u{2697}\u{FE0F}', condition: 'Discover 50 alchemy elements', secret: false, xpReward: 300 },
  { id: 'hall-of-life', name: 'Witness to Evolution', description: 'Watch organisms evolve new behaviors in the Hall of Life', icon: '\u{1F9EC}', condition: 'Observe 10 generations in the Hall of Life', secret: false, xpReward: 100 },
  { id: 'completionist', name: 'Master of the Museum', description: 'Complete all epochs and discover all alchemy elements', icon: '\u{1F451}', condition: 'Complete 100% of content', secret: true, xpReward: 1000 },
  { id: 'what-if', name: 'Alternate Historian', description: 'Explore your first "What If?" simulation', icon: '\u{1F52E}', condition: 'Launch a what-if simulation', secret: false, xpReward: 75 },
];
