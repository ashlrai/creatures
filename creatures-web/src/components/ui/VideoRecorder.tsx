import { useEffect, useRef, useCallback } from 'react';
import { useRecordingStore } from '../../stores/recordingStore';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * Compact video recording control for the Three.js canvas.
 * Captures the <canvas> element via captureStream + MediaRecorder,
 * and simultaneously buffers SimulationFrame data for a sidecar JSON export.
 *
 * Keyboard shortcut: Ctrl+Shift+R to toggle recording.
 */
export function VideoRecorder() {
  const isRecording = useRecordingStore((s) => s.isRecording);
  const elapsed = useRecordingStore((s) => s.elapsed);
  const warning = useRecordingStore((s) => s.warning);
  const store = useRecordingStore;
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Format elapsed ms as mm:ss
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Buffer simulation frames while recording
  useEffect(() => {
    if (!isRecording) return;
    const unsub = useSimulationStore.subscribe((state) => {
      if (state.frame) {
        store.getState().pushFrame(state.frame);
      }
    });
    return unsub;
  }, [isRecording]);

  // Tick timer while recording
  useEffect(() => {
    if (isRecording) {
      tickRef.current = setInterval(() => {
        store.getState().tick();
      }, 250);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRecording]);

  const startRecording = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    // Start the store
    store.getState().startRecording();

    try {
      const stream = canvas.captureStream(30);

      // Determine best available codec
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      const mimeType = mimeTypes.find((mt) => MediaRecorder.isTypeSupported(mt)) || 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          store.getState()._pushChunk(e.data);
        }
      };

      recorder.onstop = () => {
        const { chunks, frameBuffer } = store.getState();
        const timestamp = Date.now();

        // Download video
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `neurevo-recording-${timestamp}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        // Offer sidecar JSON download if there are buffered frames
        if (frameBuffer.length > 0) {
          const sidecar = {
            recorded_at: new Date(timestamp).toISOString(),
            frame_count: frameBuffer.length,
            frames: frameBuffer,
          };
          const jsonBlob = new Blob([JSON.stringify(sidecar)], { type: 'application/json' });
          const jsonUrl = URL.createObjectURL(jsonBlob);
          const b = document.createElement('a');
          b.href = jsonUrl;
          b.download = `neurevo-recording-${timestamp}-neural-data.json`;
          document.body.appendChild(b);
          b.click();
          document.body.removeChild(b);
          URL.revokeObjectURL(jsonUrl);
        }

        store.getState()._reset();
      };

      store.getState()._setMediaRecorder(recorder);
      recorder.start(1000); // collect data every second
    } catch (err) {
      console.warn('Failed to start recording:', err);
      store.getState()._reset();
    }
  }, []);

  const stopRecording = useCallback(() => {
    store.getState().stopRecording();
  }, []);

  const toggleRecording = useCallback(() => {
    if (store.getState().isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  // Keyboard shortcut: Ctrl+Shift+R
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        toggleRecording();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleRecording]);

  const styles = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 8px',
      borderRadius: 7,
      background: isRecording ? 'rgba(255, 40, 60, 0.08)' : 'rgba(255, 255, 255, 0.04)',
      border: `1px solid ${isRecording ? 'rgba(255, 40, 60, 0.2)' : 'var(--border-subtle)'}`,
      transition: 'all 0.2s',
    } as React.CSSProperties,
    recordBtn: {
      width: 24,
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      borderRadius: 4,
      transition: 'background 0.15s',
    } as React.CSSProperties,
    timer: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: isRecording ? 'rgba(255, 100, 120, 0.9)' : 'var(--text-label)',
      letterSpacing: '0.02em',
      minWidth: 38,
      textAlign: 'center' as const,
    } as React.CSSProperties,
    stopBtn: {
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(255, 40, 60, 0.15)',
      border: '1px solid rgba(255, 40, 60, 0.25)',
      borderRadius: 4,
      cursor: 'pointer',
      padding: 0,
      transition: 'all 0.15s',
    } as React.CSSProperties,
    warning: {
      fontSize: 9,
      color: 'var(--accent-amber)',
      maxWidth: 120,
      lineHeight: 1.2,
    } as React.CSSProperties,
  };

  return (
    <div style={styles.container} title="Ctrl+Shift+R to toggle recording">
      {!isRecording ? (
        <button
          style={styles.recordBtn}
          onClick={startRecording}
          title="Start recording"
        >
          {/* Red filled circle icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" fill="#ff2244" opacity="0.85" />
          </svg>
        </button>
      ) : (
        <>
          {/* Pulsing red dot */}
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#ff2244',
            boxShadow: '0 0 8px rgba(255, 34, 68, 0.6)',
            animation: 'recPulse 1.2s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={styles.timer}>{formatTime(elapsed)}</span>
          <button
            style={styles.stopBtn}
            onClick={stopRecording}
            title="Stop recording and download"
          >
            {/* Stop icon (square) */}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1" fill="#ff4466" />
            </svg>
          </button>
        </>
      )}
      {warning && <span style={styles.warning}>{warning}</span>}

      {/* Keyframe animation for pulsing dot */}
      <style>{`
        @keyframes recPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
