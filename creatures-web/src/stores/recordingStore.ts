import { create } from 'zustand';
import type { SimulationFrame } from '../types/simulation';

const MAX_RECORDING_MS = 5 * 60 * 1000; // 5 minutes

interface RecordingState {
  isRecording: boolean;
  startTime: number | null;
  elapsed: number;
  frameBuffer: Array<{ t_ms: number; data: SimulationFrame }>;
  mediaRecorder: MediaRecorder | null;
  chunks: Blob[];
  /** Set when approaching max recording time */
  warning: string | null;

  startRecording: () => void;
  stopRecording: () => void;
  tick: () => void;
  pushFrame: (frame: SimulationFrame) => void;
  _setMediaRecorder: (recorder: MediaRecorder | null) => void;
  _pushChunk: (chunk: Blob) => void;
  _reset: () => void;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  isRecording: false,
  startTime: null,
  elapsed: 0,
  frameBuffer: [],
  mediaRecorder: null,
  chunks: [],
  warning: null,

  startRecording: () => {
    set({
      isRecording: true,
      startTime: Date.now(),
      elapsed: 0,
      frameBuffer: [],
      chunks: [],
      warning: null,
    });
  },

  stopRecording: () => {
    const { mediaRecorder } = get();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    set({ isRecording: false });
  },

  tick: () => {
    const { startTime, isRecording } = get();
    if (!isRecording || !startTime) return;
    const elapsed = Date.now() - startTime;

    // Auto-stop at max recording time
    if (elapsed >= MAX_RECORDING_MS) {
      get().stopRecording();
      set({ warning: 'Maximum recording time (5 min) reached. Recording saved.' });
      return;
    }

    // Warn at 4:30
    const warning = elapsed >= MAX_RECORDING_MS - 30_000
      ? 'Recording will auto-stop in ' + Math.ceil((MAX_RECORDING_MS - elapsed) / 1000) + 's'
      : null;

    set({ elapsed, warning });
  },

  pushFrame: (frame) => {
    const { isRecording, startTime, frameBuffer } = get();
    if (!isRecording || !startTime) return;
    const t_ms = Date.now() - startTime;
    // Cap buffer at ~18000 frames (5 min * 60fps)
    const next = frameBuffer.length > 18000
      ? [...frameBuffer.slice(-17000), { t_ms, data: frame }]
      : [...frameBuffer, { t_ms, data: frame }];
    set({ frameBuffer: next });
  },

  _setMediaRecorder: (recorder) => set({ mediaRecorder: recorder }),
  _pushChunk: (chunk) => set((s) => ({ chunks: [...s.chunks, chunk] })),
  _reset: () => set({
    isRecording: false,
    startTime: null,
    elapsed: 0,
    frameBuffer: [],
    mediaRecorder: null,
    chunks: [],
    warning: null,
  }),
}));
