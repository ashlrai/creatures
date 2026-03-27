/** Centralized API configuration — single source of truth */
const RAILWAY_API = 'https://creatures-production.up.railway.app';

const isProduction = typeof window !== 'undefined' && window.location.hostname === 'neurevo.dev';

// In production, ALWAYS use RAILWAY_API. VITE_API_URL only for local dev override.
export const API_BASE = isProduction ? RAILWAY_API : (import.meta.env.VITE_API_URL || '');

export const WS_HOST = isProduction
  ? 'creatures-production.up.railway.app'
  : (typeof window !== 'undefined' ? window.location.host : 'localhost:5173');

export const WS_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${WS_HOST}`
  : 'ws://localhost:5173';
