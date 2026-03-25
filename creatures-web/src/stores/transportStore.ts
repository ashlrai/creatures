import { create } from 'zustand';
import type { SimulationFrame } from '../types/simulation';

interface TransportState {
  isPlaying: boolean;
  speed: number;           // 0.1 to 10
  loopMode: boolean;
  frameBuffer: SimulationFrame[];
  bufferIndex: number;     // -1 = live, >= 0 = scrubbing
  maxBufferSize: number;

  setPlaying: (v: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (v: number) => void;
  toggleLoop: () => void;
  pushFrame: (f: SimulationFrame) => void;
  seekTo: (index: number) => void;
  stepForward: () => void;
  stepBack: () => void;
  goLive: () => void;
  getDisplayFrame: () => SimulationFrame | null;
}

export const useTransportStore = create<TransportState>((set, get) => ({
  isPlaying: true,
  speed: 1,
  loopMode: false,
  frameBuffer: [],
  bufferIndex: -1,
  maxBufferSize: 2000,

  setPlaying: (v) => set({ isPlaying: v }),

  togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),

  setSpeed: (v) => set({ speed: Math.max(0.1, Math.min(10, v)) }),

  toggleLoop: () => set((s) => ({ loopMode: !s.loopMode })),

  pushFrame: (f) => {
    const { frameBuffer, maxBufferSize } = get();
    const next = [...frameBuffer, f];
    if (next.length > maxBufferSize) {
      next.splice(0, next.length - maxBufferSize);
    }
    set({ frameBuffer: next });
  },

  seekTo: (index) => {
    const { frameBuffer } = get();
    if (frameBuffer.length === 0) return;
    const clamped = Math.max(0, Math.min(index, frameBuffer.length - 1));
    set({ bufferIndex: clamped });
  },

  stepForward: () => {
    const { bufferIndex, frameBuffer } = get();
    if (frameBuffer.length === 0) return;
    const current = bufferIndex === -1 ? frameBuffer.length - 1 : bufferIndex;
    const next = Math.min(current + 1, frameBuffer.length - 1);
    set({ bufferIndex: next, isPlaying: false });
  },

  stepBack: () => {
    const { bufferIndex, frameBuffer } = get();
    if (frameBuffer.length === 0) return;
    const current = bufferIndex === -1 ? frameBuffer.length - 1 : bufferIndex;
    const prev = Math.max(current - 1, 0);
    set({ bufferIndex: prev, isPlaying: false });
  },

  goLive: () => set({ bufferIndex: -1, isPlaying: true }),

  getDisplayFrame: () => {
    const { bufferIndex, frameBuffer } = get();
    if (bufferIndex === -1) return null;
    return frameBuffer[bufferIndex] ?? null;
  },
}));
