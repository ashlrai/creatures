// ============================================================================
// Today in History — utility for finding historical events matching today's date
// ============================================================================

import type { HistoricalEvent } from '../data/knowledge-graph';
import { ALL_EVENTS } from '../data/halls';

/**
 * Returns a historical event that matches today's month-day, or a random
 * "defining"/"major" event if no exact match exists. Uses a daily seed so
 * the same event is shown all day but changes the next day.
 */
export function getTodayInHistory(): HistoricalEvent {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayMD = `-${month}-${day}`;

  // 1. Look for events whose date string ends with today's month-day
  const exactMatches = ALL_EVENTS.filter(e => e.date.endsWith(todayMD));

  if (exactMatches.length > 0) {
    // If multiple matches, pick one deterministically per day
    const seed = dailySeed(now);
    return exactMatches[seed % exactMatches.length];
  }

  // 2. Fallback: pick a random "defining" or "major" event, seeded by day
  const majorEvents = ALL_EVENTS.filter(
    e => e.significance === 'defining' || e.significance === 'major',
  );
  const pool = majorEvents.length > 0 ? majorEvents : ALL_EVENTS;
  const seed = dailySeed(now);
  return pool[seed % pool.length];
}

/**
 * Returns a stable integer seed for a given calendar date (year-month-day).
 * Changes once per day so the feature feels like a "daily discovery".
 */
function dailySeed(date: Date): number {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  // Simple hash combining year, month, day
  let h = (y * 367 + m * 31 + d) & 0x7fffffff;
  // Bit mixing for better distribution
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return Math.abs(h);
}

/**
 * Key used to persist dismissal state in localStorage.
 * Includes today's date so it resets daily.
 */
export function getTodayDismissKey(): string {
  const now = new Date();
  return `neurevo-today-dismissed-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
