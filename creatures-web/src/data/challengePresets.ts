import type { ChallengePreset } from '../types/evolution';

/**
 * 7 curated challenge environments for evolution mode.
 * Entity positions are normalized to [-0.5, 0.5] and mapped to the arena radius at render time.
 */
export const CHALLENGE_PRESETS: ChallengePreset[] = [
  // ─── Open Field (default / baseline) ──────────────────────────────
  {
    id: 'open-field',
    name: 'Open Field',
    description: 'Classic arena with scattered food and sparse obstacles. A balanced starting point for evolution.',
    difficulty: 'beginner',
    icon: '\u26AA', // ⚪
    evolutionaryPressure: 'Baseline',
    entities: [
      { type: 'food', x: 0.25, y: -0.15, radius: 0.04, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: -0.3, y: 0.2, radius: 0.04, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: 0.1, y: 0.35, radius: 0.04, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: -0.15, y: -0.3, radius: 0.04, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: 0.35, y: 0.15, radius: 0.04, intensity: 0.8, color: '#00ff88' },
      { type: 'obstacle', x: 0.0, y: 0.0, radius: 0.08, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: -0.2, y: -0.1, radius: 0.06, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.15, y: 0.2, radius: 0.07, intensity: 1, color: '#556677' },
    ],
    fitnessWeights: { w_distance: 1.0, w_food: 2.0, w_efficiency: 0.5, w_collision_penalty: 0.3, w_toxin_penalty: 0, w_survival: 0.2 },
    recommendedGenerations: 100,
    recommendedPopulation: 150,
  },

  // ─── Gauntlet (navigation) ────────────────────────────────────────
  {
    id: 'gauntlet',
    name: 'Gauntlet',
    description: 'Navigate a narrow corridor of obstacles to reach food at the far end. Tests precise locomotion and steering.',
    difficulty: 'intermediate',
    icon: '\u2694\uFE0F', // ⚔️
    evolutionaryPressure: 'Navigation',
    entities: [
      // Corridor walls — two staggered rows of obstacles
      { type: 'obstacle', x: -0.25, y: -0.15, radius: 0.07, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: -0.1, y: 0.12, radius: 0.07, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.05, y: -0.18, radius: 0.07, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.2, y: 0.1, radius: 0.07, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.32, y: -0.12, radius: 0.06, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: -0.35, y: 0.08, radius: 0.06, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: -0.15, y: -0.32, radius: 0.05, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.12, y: 0.28, radius: 0.06, intensity: 1, color: '#556677' },
      // Food at the far end
      { type: 'food', x: 0.4, y: 0.0, radius: 0.06, intensity: 1.0, color: '#00ff88' },
      // Chemical gradient guiding toward food
      { type: 'chemical_gradient', x: 0.4, y: 0.0, radius: 0.35, intensity: 0.6, color: '#4488ff', params: { chemical_type: 'attractant' } },
    ],
    fitnessWeights: { w_distance: 3.0, w_food: 3.0, w_efficiency: 0.3, w_collision_penalty: 2.0, w_toxin_penalty: 0, w_survival: 0.5 },
    recommendedGenerations: 150,
    recommendedPopulation: 150,
  },

  // ─── Scattered Feast (foraging efficiency) ────────────────────────
  {
    id: 'scattered-feast',
    name: 'Scattered Feast',
    description: 'Twelve food sources spread across a wide open arena. Evolve efficient foraging and area coverage strategies.',
    difficulty: 'beginner',
    icon: '\uD83C\uDF3F', // 🌿
    evolutionaryPressure: 'Foraging',
    entities: [
      // 12 food sources in a grid-like pattern
      { type: 'food', x: -0.35, y: -0.35, radius: 0.03, intensity: 0.6, color: '#00ff88' },
      { type: 'food', x: -0.12, y: -0.35, radius: 0.03, intensity: 0.6, color: '#00ff88' },
      { type: 'food', x: 0.12, y: -0.35, radius: 0.03, intensity: 0.6, color: '#00ff88' },
      { type: 'food', x: 0.35, y: -0.35, radius: 0.03, intensity: 0.6, color: '#00ff88' },
      { type: 'food', x: -0.35, y: 0.0, radius: 0.03, intensity: 0.7, color: '#00ff88' },
      { type: 'food', x: -0.12, y: 0.0, radius: 0.03, intensity: 0.7, color: '#00ff88' },
      { type: 'food', x: 0.12, y: 0.0, radius: 0.03, intensity: 0.7, color: '#00ff88' },
      { type: 'food', x: 0.35, y: 0.0, radius: 0.03, intensity: 0.7, color: '#00ff88' },
      { type: 'food', x: -0.35, y: 0.35, radius: 0.03, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: -0.12, y: 0.35, radius: 0.03, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: 0.12, y: 0.35, radius: 0.03, intensity: 0.8, color: '#00ff88' },
      { type: 'food', x: 0.35, y: 0.35, radius: 0.03, intensity: 0.8, color: '#00ff88' },
    ],
    fitnessWeights: { w_distance: 0.5, w_food: 4.0, w_efficiency: 2.0, w_collision_penalty: 0.1, w_toxin_penalty: 0, w_survival: 0.3 },
    recommendedGenerations: 100,
    recommendedPopulation: 200,
  },

  // ─── Toxic Minefield (hazard avoidance) ───────────────────────────
  {
    id: 'toxic-minefield',
    name: 'Toxic Minefield',
    description: 'Deadly toxic zones between rare food sources. Organisms must sense and avoid danger while foraging.',
    difficulty: 'advanced',
    icon: '\u2622\uFE0F', // ☢️
    evolutionaryPressure: 'Hazard Avoidance',
    entities: [
      // 6 toxic zones of varying size
      { type: 'toxic_zone', x: -0.2, y: -0.2, radius: 0.1, intensity: 0.9, color: '#ff2244' },
      { type: 'toxic_zone', x: 0.15, y: -0.1, radius: 0.12, intensity: 1.0, color: '#ff2244' },
      { type: 'toxic_zone', x: -0.05, y: 0.25, radius: 0.08, intensity: 0.8, color: '#ff2244' },
      { type: 'toxic_zone', x: 0.3, y: 0.2, radius: 0.09, intensity: 0.85, color: '#ff2244' },
      { type: 'toxic_zone', x: -0.35, y: 0.1, radius: 0.07, intensity: 0.7, color: '#ff2244' },
      { type: 'toxic_zone', x: 0.05, y: -0.35, radius: 0.1, intensity: 0.9, color: '#ff2244' },
      // 3 food sources in the gaps
      { type: 'food', x: -0.35, y: -0.35, radius: 0.05, intensity: 1.0, color: '#00ff88' },
      { type: 'food', x: 0.35, y: -0.3, radius: 0.05, intensity: 1.0, color: '#00ff88' },
      { type: 'food', x: 0.0, y: 0.0, radius: 0.04, intensity: 0.8, color: '#00ff88' },
    ],
    fitnessWeights: { w_distance: 0.5, w_food: 2.0, w_efficiency: 0.3, w_collision_penalty: 0.5, w_toxin_penalty: 5.0, w_survival: 3.0 },
    recommendedGenerations: 200,
    recommendedPopulation: 150,
  },

  // ─── Maze Runner (spatial memory) ─────────────────────────────────
  {
    id: 'maze-runner',
    name: 'Maze Runner',
    description: 'Navigate through obstacle walls forming a maze to reach the exit. Tests wall-following and spatial reasoning.',
    difficulty: 'advanced',
    icon: '\uD83C\uDFDB\uFE0F', // 🏛️
    evolutionaryPressure: 'Spatial Memory',
    entities: [
      // Maze walls — arranged as interconnected barriers with gaps
      // Outer ring walls
      { type: 'obstacle', x: -0.3, y: -0.3, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: -0.15, y: -0.3, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: 0.0, y: -0.3, radius: 0.05, intensity: 1, color: '#667788' },
      // Gap at (0.15, -0.3) — entrance
      { type: 'obstacle', x: 0.3, y: -0.3, radius: 0.05, intensity: 1, color: '#667788' },
      // Right wall
      { type: 'obstacle', x: 0.3, y: -0.15, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: 0.3, y: 0.0, radius: 0.05, intensity: 1, color: '#667788' },
      // Gap at (0.3, 0.15)
      { type: 'obstacle', x: 0.3, y: 0.3, radius: 0.05, intensity: 1, color: '#667788' },
      // Inner walls
      { type: 'obstacle', x: -0.1, y: -0.1, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: 0.05, y: -0.1, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: 0.05, y: 0.05, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: 0.05, y: 0.2, radius: 0.05, intensity: 1, color: '#667788' },
      { type: 'obstacle', x: -0.15, y: 0.15, radius: 0.05, intensity: 1, color: '#667788' },
      // Food at maze exit
      { type: 'food', x: -0.35, y: 0.35, radius: 0.06, intensity: 1.0, color: '#00ff88' },
      // Light zone marking the exit area
      { type: 'light_zone', x: -0.35, y: 0.35, radius: 0.15, intensity: 0.4, color: '#ffdd44' },
    ],
    fitnessWeights: { w_distance: 3.0, w_food: 4.0, w_efficiency: 0.2, w_collision_penalty: 1.5, w_toxin_penalty: 0, w_survival: 0.5 },
    recommendedGenerations: 200,
    recommendedPopulation: 150,
  },

  // ─── Oasis (long-range chemotaxis) ────────────────────────────────
  {
    id: 'oasis',
    name: 'Oasis',
    description: 'A single rich food source behind obstacles with a long chemical gradient. Evolve precise gradient-following behavior.',
    difficulty: 'intermediate',
    icon: '\uD83C\uDFDD\uFE0F', // 🏝️
    evolutionaryPressure: 'Chemotaxis',
    entities: [
      // The oasis — large food with long-range gradient
      { type: 'food', x: 0.38, y: 0.0, radius: 0.08, intensity: 1.0, color: '#00ff88' },
      { type: 'chemical_gradient', x: 0.38, y: 0.0, radius: 0.45, intensity: 0.8, color: '#4488ff', params: { chemical_type: 'attractant' } },
      // Barrier obstacles in the middle
      { type: 'obstacle', x: 0.0, y: -0.2, radius: 0.08, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.0, y: 0.05, radius: 0.09, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: 0.0, y: 0.25, radius: 0.07, intensity: 1, color: '#556677' },
      { type: 'obstacle', x: -0.15, y: -0.05, radius: 0.06, intensity: 1, color: '#556677' },
      // Small food on the starting side as a distraction
      { type: 'food', x: -0.35, y: -0.25, radius: 0.03, intensity: 0.3, color: '#00ff88' },
      { type: 'food', x: -0.35, y: 0.25, radius: 0.03, intensity: 0.3, color: '#00ff88' },
    ],
    fitnessWeights: { w_distance: 2.0, w_food: 4.0, w_efficiency: 0.5, w_collision_penalty: 1.0, w_toxin_penalty: 0, w_survival: 0.3 },
    recommendedGenerations: 150,
    recommendedPopulation: 150,
  },

  // ─── Predator Arena (escape + forage) ─────────────────────────────
  {
    id: 'predator-arena',
    name: 'Predator Arena',
    description: 'Moving toxic "predators" hunt organisms while food sits at the edges. Balance survival with foraging.',
    difficulty: 'advanced',
    icon: '\uD83D\uDC32', // 🐲
    evolutionaryPressure: 'Escape + Forage',
    entities: [
      // 2 predator toxic zones (will move dynamically toward organism clusters)
      { type: 'toxic_zone', x: -0.1, y: -0.1, radius: 0.12, intensity: 1.0, color: '#ff4466', params: { predator: true } },
      { type: 'toxic_zone', x: 0.1, y: 0.1, radius: 0.12, intensity: 1.0, color: '#ff4466', params: { predator: true } },
      // 4 food at edges
      { type: 'food', x: -0.4, y: 0.0, radius: 0.05, intensity: 0.9, color: '#00ff88' },
      { type: 'food', x: 0.4, y: 0.0, radius: 0.05, intensity: 0.9, color: '#00ff88' },
      { type: 'food', x: 0.0, y: -0.4, radius: 0.05, intensity: 0.9, color: '#00ff88' },
      { type: 'food', x: 0.0, y: 0.4, radius: 0.05, intensity: 0.9, color: '#00ff88' },
      // Pheromone safe-zone decoy in center
      { type: 'pheromone_source', x: 0.0, y: 0.0, radius: 0.06, intensity: 0.5, color: '#aa66ff' },
    ],
    fitnessWeights: { w_distance: 0.5, w_food: 2.0, w_efficiency: 0.3, w_collision_penalty: 0.5, w_toxin_penalty: 4.0, w_survival: 5.0 },
    dynamics: { type: 'predator', speed: 0.3 },
    recommendedGenerations: 200,
    recommendedPopulation: 150,
  },
];

export function getChallengeById(id: string): ChallengePreset | undefined {
  return CHALLENGE_PRESETS.find((p) => p.id === id);
}
