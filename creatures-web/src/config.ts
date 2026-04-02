/** Centralized API configuration — single source of truth */

// API_BASE: local dev server or user-provided URL (e.g., local M5 Max engine).
// In production (Vercel), there is no backend — sim modes fall back to demo mode.
export const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

// WebSocket host: derived from API_BASE when set, otherwise same-origin (for local dev).
const apiHost = API_BASE ? new URL(API_BASE).host : (typeof window !== 'undefined' ? window.location.host : 'localhost:8420');
export const WS_HOST = apiHost;

export const WS_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${WS_HOST}`
  : 'ws://localhost:8420';
