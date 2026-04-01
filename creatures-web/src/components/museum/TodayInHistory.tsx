// ============================================================================
// TodayInHistory — floating daily discovery card for the Neurevo museum
// Shows a historical event matching today's date (or a random major event)
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { getTodayInHistory, getTodayDismissKey } from '../../utils/todayInHistory';
import { useMuseumStore } from '../../stores/museumStore';

// ── Styles ──────────────────────────────────────────────────────────────────

const AMBER = '#d4a017';
const AMBER_GLOW = 'rgba(212, 160, 23, 0.12)';
const AMBER_BORDER = 'rgba(212, 160, 23, 0.35)';
const AMBER_FAINT = 'rgba(212, 160, 23, 0.06)';

const styles = {
  wrapper: {
    position: 'fixed' as const,
    bottom: 24,
    left: 24,
    zIndex: 100,
    maxWidth: 360,
    animation: 'todaySlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
  },
  card: {
    background: 'rgba(14, 13, 18, 0.92)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: 14,
    border: `1px solid ${AMBER_BORDER}`,
    boxShadow: `0 0 40px ${AMBER_FAINT}, 0 8px 32px rgba(0,0,0,0.5)`,
    padding: '16px 18px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  glowStripe: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: `linear-gradient(90deg, transparent, ${AMBER}, transparent)`,
    opacity: 0.7,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: AMBER,
    background: AMBER_GLOW,
    padding: '3px 8px',
    borderRadius: 6,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.25)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 4px',
    borderRadius: 4,
    lineHeight: 1,
    transition: 'color 0.15s',
    fontFamily: 'inherit',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e8e6e3',
    lineHeight: 1.35,
    letterSpacing: '-0.01em',
  },
  date: {
    fontSize: 11,
    color: 'rgba(212, 160, 23, 0.7)',
    fontWeight: 500,
  },
  excerpt: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.5)',
    display: '-webkit-box' as const,
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exploreBtn: {
    background: AMBER_GLOW,
    border: `1px solid ${AMBER_BORDER}`,
    color: AMBER,
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'inherit',
    letterSpacing: '0.02em',
  },
  significance: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.2)',
    fontStyle: 'italic' as const,
  },
};

// ── Keyframes (injected once) ───────────────────────────────────────────────

let keyframesInjected = false;
function injectKeyframes() {
  if (keyframesInjected) return;
  keyframesInjected = true;
  const sheet = document.createElement('style');
  sheet.textContent = `
    @keyframes todaySlideIn {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(sheet);
}

// ── Format date for display ─────────────────────────────────────────────────

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 1) return parts[0]; // year only
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const year = parts[0];
  const month = months[parseInt(parts[1], 10) - 1] ?? parts[1];
  if (parts.length === 2) return `${month} ${year}`;
  return `${month} ${parseInt(parts[2], 10)}, ${year}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function TodayInHistory() {
  injectKeyframes();

  const navigate = useMuseumStore(s => s.navigate);
  const dismissKey = getTodayDismissKey();

  // Check localStorage to see if already dismissed today
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey) === '1';
    } catch {
      return false;
    }
  });

  const event = useMemo(() => getTodayInHistory(), []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey, '1');
    } catch { /* localStorage may be unavailable */ }
  }, [dismissKey]);

  const handleExplore = useCallback(() => {
    navigate('event', event.id);
  }, [navigate, event.id]);

  if (dismissed) return null;

  const isExactDateMatch = event.date.includes('-') && event.date.split('-').length === 3;

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {/* Amber glow stripe at top */}
        <div style={styles.glowStripe} />

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.badge}>
            <span style={{ fontSize: 12 }}>{'\u2726'}</span>
            {isExactDateMatch ? 'On This Day' : 'Daily Discovery'}
          </div>
          <button
            style={styles.dismissBtn}
            onClick={handleDismiss}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.25)'; }}
            aria-label="Dismiss"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Title + Date */}
        <div>
          <div style={styles.title}>{event.title}</div>
          <div style={styles.date}>{formatDisplayDate(event.date)}</div>
        </div>

        {/* Excerpt */}
        <div style={styles.excerpt}>{event.description}</div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            style={styles.exploreBtn}
            onClick={handleExplore}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.background = 'rgba(212, 160, 23, 0.22)';
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.background = AMBER_GLOW;
            }}
          >
            Explore {'\u2192'}
          </button>
          <span style={styles.significance}>
            {event.significance} event
          </span>
        </div>
      </div>
    </div>
  );
}
