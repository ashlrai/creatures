import { useRef, useEffect, useCallback } from 'react';
import { useTransportStore } from '../../stores/transportStore';
import { useSimulationStore } from '../../stores/simulationStore';

/* ── inline styles ─────────────────────────────────────────────── */

const S = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    height: '100%',
    fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
    fontSize: 11,
    color: 'rgba(160, 190, 220, 0.7)',
    userSelect: 'none' as const,
    position: 'relative' as const,
  },
  btn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 4,
    color: 'rgba(200, 220, 240, 0.8)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    flexShrink: 0,
    transition: 'background 0.15s, border-color 0.15s',
  },
  btnHover: {
    background: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  btnActive: {
    background: 'rgba(0, 212, 255, 0.12)',
    borderColor: 'rgba(0, 212, 255, 0.5)',
    color: '#00d4ff',
  },
  scrubberWrap: {
    flex: 1,
    position: 'relative' as const,
    height: 36,
    minWidth: 120,
    display: 'flex',
    alignItems: 'center',
  },
  canvas: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    borderRadius: 4,
    pointerEvents: 'none' as const,
  },
  rangeTimeline: {
    width: '100%',
    height: 36,
    cursor: 'pointer',
    position: 'relative' as const,
    zIndex: 2,
    opacity: 0,
  },
  speedWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  speedSlider: {
    width: 60,
    height: 4,
    cursor: 'pointer',
    accentColor: '#00d4ff',
  },
  speedLabel: {
    width: 34,
    textAlign: 'right' as const,
    fontSize: 10,
    color: 'rgba(0, 212, 255, 0.7)',
    fontVariantNumeric: 'tabular-nums',
  },
  liveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.5,
    flexShrink: 0,
    transition: 'background 0.15s, border-color 0.15s',
  },
  liveDot: (live: boolean) => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: live ? '#00ff88' : 'rgba(160,190,220,0.3)',
    boxShadow: live ? '0 0 8px #00ff88' : 'none',
    transition: 'all 0.2s',
  }),
} as const;

/* ── SVG icons (12x12) ─────────────────────────────────────────── */

const Icon = {
  SkipStart: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="2" width="2" height="8" rx="0.5" fill="currentColor" />
      <path d="M11 2L6 6L11 10V2Z" fill="currentColor" />
    </svg>
  ),
  StepBack: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M10 2L5 6L10 10V2Z" fill="currentColor" />
      <rect x="2" y="2" width="1.5" height="8" rx="0.5" fill="currentColor" />
    </svg>
  ),
  Play: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 1.5L10.5 6L3 10.5V1.5Z" fill="currentColor" />
    </svg>
  ),
  Pause: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="1.5" width="3" height="9" rx="0.75" fill="currentColor" />
      <rect x="7" y="1.5" width="3" height="9" rx="0.75" fill="currentColor" />
    </svg>
  ),
  StepForward: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2L7 6L2 10V2Z" fill="currentColor" />
      <rect x="8.5" y="2" width="1.5" height="8" rx="0.5" fill="currentColor" />
    </svg>
  ),
  SkipEnd: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 2L6 6L1 10V2Z" fill="currentColor" />
      <rect x="8" y="2" width="2" height="8" rx="0.5" fill="currentColor" />
    </svg>
  ),
  Loop: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M9 3H4C2.9 3 2 3.9 2 5V5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 9H8C9.1 9 10 8.1 10 7V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7.5 1.5L9.5 3L7.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 7.5L2.5 9L4.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/* ── component ─────────────────────────────────────────────────── */

export function TransportControls() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const speed = useTransportStore((s) => s.speed);
  const loopMode = useTransportStore((s) => s.loopMode);
  const bufferIndex = useTransportStore((s) => s.bufferIndex);
  const frameBuffer = useTransportStore((s) => s.frameBuffer);
  const history = useSimulationStore((s) => s.frameHistory);

  const isLive = bufferIndex === -1;
  const bufferLen = frameBuffer.length;
  const scrubPos = isLive ? bufferLen - 1 : bufferIndex;

  // Format speed label
  const speedLabel = speed < 1 ? speed.toFixed(1) + 'x' : speed.toFixed(speed >= 10 ? 0 : 1) + 'x';

  // Speed slider uses log scale: slider 0..1 maps to 0.1..10
  const speedToSlider = (s: number) => Math.log10(s * 10) / 2; // 0.1->0, 1->0.5, 10->1
  const sliderToSpeed = (v: number) => Math.pow(10, v * 2) / 10; // inverse

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useTransportStore.getState().setSpeed(sliderToSpeed(parseFloat(e.target.value)));
  }, []);

  const handleTimelineChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useTransportStore.getState().seekTo(parseInt(e.target.value, 10));
  }, []);

  // Draw mini waveform in background of scrubber
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Dark bg with subtle border
    ctx.fillStyle = 'rgba(5, 5, 13, 0.6)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 4);
    ctx.fill();

    // Grid
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.12)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += h / 3) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw last 100 frames of n_active
    const data = history.slice(-100);
    if (data.length < 2) return;

    const maxActive = Math.max(60, ...data.map(d => d.n_active));

    // Fill area
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < data.length; i++) {
      const x = (i / 100) * w;
      const y = h - (data[i].n_active / maxActive) * h * 0.8 - h * 0.05;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(((data.length - 1) / 100) * w, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 212, 255, 0.06)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < data.length; i++) {
      const x = (i / 100) * w;
      const y = h - (data[i].n_active / maxActive) * h * 0.8 - h * 0.05;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Playhead position indicator
    if (bufferLen > 0) {
      const pct = bufferLen <= 1 ? 0.5 : scrubPos / (bufferLen - 1);
      const px = pct * w;
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, 2); ctx.lineTo(px, h - 2); ctx.stroke();

      // Small triangle at top
      ctx.fillStyle = 'rgba(0, 212, 255, 0.7)';
      ctx.beginPath();
      ctx.moveTo(px - 3, 0);
      ctx.lineTo(px + 3, 0);
      ctx.lineTo(px, 5);
      ctx.closePath();
      ctx.fill();
    }
  }, [history, bufferIndex, bufferLen, scrubPos]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ts = useTransportStore.getState();
      switch (e.key) {
        case 'k':
          ts.togglePlaying();
          e.preventDefault();
          break;
        case 'j':
          ts.stepBack();
          e.preventDefault();
          break;
        case 'l':
          ts.stepForward();
          e.preventDefault();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            ts.seekTo(0);
          } else {
            ts.stepBack();
          }
          e.preventDefault();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            ts.seekTo(ts.frameBuffer.length - 1);
          } else {
            ts.stepForward();
          }
          e.preventDefault();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={S.root}>
      {/* Transport buttons */}
      <button
        style={S.btn}
        title="Skip to start (Shift+Left)"
        onClick={() => useTransportStore.getState().seekTo(0)}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, S.btnHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: S.btn.background, borderColor: S.btn.border })}
      >
        <Icon.SkipStart />
      </button>

      <button
        style={S.btn}
        title="Step back (J / Left)"
        onClick={() => useTransportStore.getState().stepBack()}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, S.btnHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: S.btn.background, borderColor: S.btn.border })}
      >
        <Icon.StepBack />
      </button>

      <button
        style={{ ...S.btn, ...(isPlaying ? {} : S.btnActive) }}
        title="Play / Pause (K)"
        onClick={() => useTransportStore.getState().togglePlaying()}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, S.btnHover)}
        onMouseLeave={(e) => {
          const base = isPlaying ? S.btn : { ...S.btn, ...S.btnActive };
          Object.assign(e.currentTarget.style, { background: base.background, borderColor: (base as Record<string, unknown>).borderColor ?? 'transparent' });
        }}
      >
        {isPlaying ? <Icon.Pause /> : <Icon.Play />}
      </button>

      <button
        style={S.btn}
        title="Step forward (L / Right)"
        onClick={() => useTransportStore.getState().stepForward()}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, S.btnHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: S.btn.background, borderColor: S.btn.border })}
      >
        <Icon.StepForward />
      </button>

      <button
        style={S.btn}
        title="Skip to end (Shift+Right)"
        onClick={() => useTransportStore.getState().seekTo(bufferLen - 1)}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, S.btnHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: S.btn.background, borderColor: S.btn.border })}
      >
        <Icon.SkipEnd />
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

      {/* Timeline scrubber with waveform background */}
      <div style={S.scrubberWrap}>
        <canvas ref={canvasRef} style={S.canvas} />
        <input
          type="range"
          min={0}
          max={Math.max(0, bufferLen - 1)}
          value={scrubPos >= 0 ? scrubPos : 0}
          onChange={handleTimelineChange}
          style={S.rangeTimeline}
          title={`Frame ${scrubPos + 1} / ${bufferLen}`}
        />
        {/* Frame counter overlay */}
        <div style={{
          position: 'absolute',
          bottom: 2,
          right: 6,
          fontSize: 9,
          color: 'rgba(160, 190, 220, 0.35)',
          pointerEvents: 'none',
          zIndex: 3,
        }}>
          {bufferLen > 0 ? `${scrubPos + 1} / ${bufferLen}` : '---'}
        </div>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

      {/* Speed control */}
      <div style={S.speedWrap}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={speedToSlider(speed)}
          onChange={handleSpeedChange}
          style={S.speedSlider}
          title={`Speed: ${speedLabel}`}
        />
        <span style={S.speedLabel}>{speedLabel}</span>
      </div>

      {/* Loop toggle */}
      <button
        style={{ ...S.btn, ...(loopMode ? S.btnActive : {}) }}
        title="Loop mode"
        onClick={() => useTransportStore.getState().toggleLoop()}
      >
        <Icon.Loop />
      </button>

      {/* LIVE indicator */}
      <button
        style={{
          ...S.liveBtn,
          borderColor: isLive ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255,255,255,0.08)',
          background: isLive ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255,255,255,0.04)',
          color: isLive ? '#00ff88' : 'rgba(160, 190, 220, 0.5)',
        }}
        onClick={() => useTransportStore.getState().goLive()}
        title="Go to live"
      >
        <div style={S.liveDot(isLive)} />
        LIVE
      </button>
    </div>
  );
}
