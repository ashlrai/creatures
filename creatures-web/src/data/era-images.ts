// ============================================================================
// Era Visual Theming — gradients, symbols, and color palettes for each era
// Gives each museum gallery its own visual identity
// ============================================================================

export interface EraVisualTheme {
  /** CSS gradient for the hero banner */
  gradient: string;
  /** Secondary gradient (subtle, for cards/accents) */
  accentGradient: string;
  /** Unicode symbol representing the era */
  symbol: string;
  /** Thematic color palette */
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    glow: string;       // for box-shadow / radial highlights
    text: string;       // high-contrast text on gradient
  };
  /** Decorative pattern — CSS background for subtle texture */
  pattern?: string;
  /** Tagline shown in the hero */
  tagline: string;
}

export const ERA_THEMES: Record<string, EraVisualTheme> = {
  // ── Ancient World ──────────────────────────────────────────────────────────
  'ancient-world': {
    gradient: 'linear-gradient(135deg, #8B6914 0%, #C9956B 25%, #D4A574 45%, #2C1810 70%, #1a0a2e 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(201,149,107,0.15) 0%, rgba(44,24,16,0.25) 100%)',
    symbol: '\u2302',
    palette: {
      primary: '#C9956B',
      secondary: '#8B6914',
      accent: '#D4A574',
      glow: 'rgba(201,149,107,0.3)',
      text: '#F5E6D3',
    },
    pattern: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(201,149,107,0.03) 35px, rgba(201,149,107,0.03) 70px)',
    tagline: 'Where Civilization Began',
  },

  // ── Medieval World ─────────────────────────────────────────────────────────
  'medieval-world': {
    gradient: 'linear-gradient(135deg, #1a3a1a 0%, #2d5016 25%, #4a6741 40%, #8B7D3C 60%, #1a1a0a 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(45,80,22,0.15) 0%, rgba(139,125,60,0.2) 100%)',
    symbol: '\u2694',
    palette: {
      primary: '#4a6741',
      secondary: '#8B7D3C',
      accent: '#C9B458',
      glow: 'rgba(139,125,60,0.3)',
      text: '#E8E0C8',
    },
    pattern: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(139,125,60,0.02) 40px, rgba(139,125,60,0.02) 80px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(139,125,60,0.02) 40px, rgba(139,125,60,0.02) 80px)',
    tagline: 'Faith, Feudalism & Fortitude',
  },

  // ── Renaissance ────────────────────────────────────────────────────────────
  'era-renaissance': {
    gradient: 'linear-gradient(135deg, #8B4513 0%, #C4721A 20%, #DAA520 40%, #B8860B 55%, #6B1A1A 75%, #2a0a0a 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(196,114,26,0.15) 0%, rgba(107,26,26,0.2) 100%)',
    symbol: '\u269B',
    palette: {
      primary: '#DAA520',
      secondary: '#C4721A',
      accent: '#E8C547',
      glow: 'rgba(218,165,32,0.3)',
      text: '#FFF8E7',
    },
    pattern: 'radial-gradient(circle at 20% 50%, rgba(218,165,32,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(196,114,26,0.04) 0%, transparent 50%)',
    tagline: 'The Rebirth of Human Genius',
  },

  // ── Age of Exploration ─────────────────────────────────────────────────────
  'era-age-of-exploration': {
    gradient: 'linear-gradient(135deg, #0a2e4a 0%, #1565C0 25%, #0288D1 40%, #26A69A 55%, #E65100 75%, #4A1500 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(21,101,192,0.15) 0%, rgba(230,81,0,0.15) 100%)',
    symbol: '\u2693',
    palette: {
      primary: '#0288D1',
      secondary: '#E65100',
      accent: '#4FC3F7',
      glow: 'rgba(2,136,209,0.3)',
      text: '#E3F2FD',
    },
    pattern: 'repeating-linear-gradient(-45deg, transparent, transparent 50px, rgba(2,136,209,0.02) 50px, rgba(2,136,209,0.02) 100px)',
    tagline: 'Charting the Unknown World',
  },

  // ── Scientific Revolution ──────────────────────────────────────────────────
  'era-scientific-revolution': {
    gradient: 'linear-gradient(135deg, #0a0a2e 0%, #1a237E 25%, #283593 40%, #5C6BC0 55%, #E8EAF6 80%, #f5f5ff 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(26,35,126,0.2) 0%, rgba(92,107,192,0.15) 100%)',
    symbol: '\u2609',
    palette: {
      primary: '#5C6BC0',
      secondary: '#1a237E',
      accent: '#9FA8DA',
      glow: 'rgba(92,107,192,0.3)',
      text: '#E8EAF6',
    },
    pattern: 'radial-gradient(circle at 50% 0%, rgba(232,234,246,0.06) 0%, transparent 50%)',
    tagline: 'Reason Illuminates the Cosmos',
  },

  // ── Modern Era ─────────────────────────────────────────────────────────────
  'modern-era': {
    gradient: 'linear-gradient(135deg, #1a1a1a 0%, #37474F 20%, #546E7A 35%, #78909C 50%, #B71C1C 70%, #4a0a0a 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(84,110,122,0.15) 0%, rgba(183,28,28,0.15) 100%)',
    symbol: '\u2699',
    palette: {
      primary: '#78909C',
      secondary: '#B71C1C',
      accent: '#EF5350',
      glow: 'rgba(183,28,28,0.25)',
      text: '#ECEFF1',
    },
    pattern: 'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(183,28,28,0.02) 60px, rgba(183,28,28,0.02) 120px)',
    tagline: 'Industry, Revolution & Empire',
  },

  // ── Twentieth Century ──────────────────────────────────────────────────────
  'era-twentieth-century': {
    gradient: 'linear-gradient(135deg, #000000 0%, #0D0D0D 20%, #1A1A2E 35%, #16213E 50%, #0F3460 65%, #00E5FF 90%, #00FFFF 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(15,52,96,0.2) 0%, rgba(0,229,255,0.1) 100%)',
    symbol: '\u2622',
    palette: {
      primary: '#0F3460',
      secondary: '#00E5FF',
      accent: '#00BCD4',
      glow: 'rgba(0,229,255,0.25)',
      text: '#E0F7FA',
    },
    pattern: 'radial-gradient(circle at 80% 20%, rgba(0,229,255,0.04) 0%, transparent 40%), radial-gradient(circle at 20% 80%, rgba(15,52,96,0.06) 0%, transparent 40%)',
    tagline: 'The Century That Changed Everything',
  },

  // ── Stars & Cosmos ─────────────────────────────────────────────────────────
  'stars-cosmos': {
    gradient: 'linear-gradient(135deg, #000005 0%, #0a0020 20%, #1a0040 35%, #2d1060 50%, #6A1B9A 65%, #AB47BC 80%, #CE93D8 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(26,0,64,0.2) 0%, rgba(171,71,188,0.1) 100%)',
    symbol: '\u2604',
    palette: {
      primary: '#6A1B9A',
      secondary: '#AB47BC',
      accent: '#CE93D8',
      glow: 'rgba(171,71,188,0.3)',
      text: '#F3E5F5',
    },
    pattern: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.3) 0%, transparent 100%), radial-gradient(1px 1px at 60% 70%, rgba(255,255,255,0.2) 0%, transparent 100%), radial-gradient(1px 1px at 80% 20%, rgba(255,255,255,0.25) 0%, transparent 100%), radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.15) 0%, transparent 100%), radial-gradient(1px 1px at 10% 60%, rgba(255,255,255,0.2) 0%, transparent 100%)',
    tagline: 'Peering into the Infinite',
  },

  // ── Elements & Matter ──────────────────────────────────────────────────────
  'elements-matter': {
    gradient: 'linear-gradient(135deg, #004D40 0%, #00695C 20%, #00897B 35%, #26A69A 50%, #00BFA5 65%, #00E5FF 85%, #84FFFF 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(0,77,64,0.2) 0%, rgba(0,229,255,0.1) 100%)',
    symbol: '\u2697',
    palette: {
      primary: '#00897B',
      secondary: '#00E5FF',
      accent: '#00BFA5',
      glow: 'rgba(0,191,165,0.3)',
      text: '#E0F2F1',
    },
    pattern: 'repeating-conic-gradient(rgba(0,191,165,0.02) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px',
    tagline: 'The Architecture of Reality',
  },

  // ── Life & Evolution ───────────────────────────────────────────────────────
  'life-evolution': {
    gradient: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 20%, #388E3C 35%, #4CAF50 50%, #8BC34A 65%, #FFC107 80%, #FFB300 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(27,94,32,0.2) 0%, rgba(255,193,7,0.1) 100%)',
    symbol: '\u2618',
    palette: {
      primary: '#388E3C',
      secondary: '#FFC107',
      accent: '#8BC34A',
      glow: 'rgba(56,142,60,0.3)',
      text: '#E8F5E9',
    },
    pattern: 'radial-gradient(circle at 30% 70%, rgba(76,175,80,0.04) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(255,193,7,0.04) 0%, transparent 50%)',
    tagline: 'From First Cell to Endless Forms',
  },
};

/** Look up theme for an era, with sensible fallback */
export function getEraTheme(eraId: string): EraVisualTheme {
  return ERA_THEMES[eraId] ?? {
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    accentGradient: 'linear-gradient(135deg, rgba(15,33,62,0.2) 0%, rgba(26,26,46,0.2) 100%)',
    symbol: '\u25C6',
    palette: {
      primary: '#7c4dff',
      secondary: '#536DFE',
      accent: '#b388ff',
      glow: 'rgba(124,77,255,0.25)',
      text: '#E8EAF6',
    },
    tagline: 'Explore the Past',
  };
}
