import { useRef, useEffect, useCallback } from 'react';
import type { LightPattern } from '../../stores/optogeneticsStore';

interface WaveformEditorProps {
  pattern: LightPattern;
  onChange: (pattern: LightPattern) => void;
  opsinColor?: string;
  width?: number;
  height?: number;
}

const PATTERN_TYPES: LightPattern['type'][] = ['continuous', 'pulse', 'ramp'];

export function WaveformEditor({
  pattern,
  onChange,
  opsinColor = 'cyan',
  width = 180,
  height = 60,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = 'rgba(6, 8, 18, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(80, 130, 200, 0.06)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < height; y += height / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Waveform
    ctx.strokeStyle = opsinColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = opsinColor;
    ctx.shadowBlur = 4;
    ctx.beginPath();

    const padding = 4;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;
    const baseY = height - padding;

    if (pattern.type === 'continuous') {
      const y = baseY - pattern.intensity * drawHeight;
      ctx.moveTo(padding, baseY);
      ctx.lineTo(padding, y);
      ctx.lineTo(padding + drawWidth, y);
      ctx.lineTo(padding + drawWidth, baseY);
    } else if (pattern.type === 'pulse') {
      const periodPx = drawWidth / Math.max(1, Math.min(pattern.frequency, 20));
      const onPx = periodPx * pattern.dutyCycle;
      const highY = baseY - pattern.intensity * drawHeight;
      let x = padding;

      ctx.moveTo(x, baseY);
      while (x < padding + drawWidth) {
        // Rising edge
        ctx.lineTo(x, highY);
        // On phase
        const onEnd = Math.min(x + onPx, padding + drawWidth);
        ctx.lineTo(onEnd, highY);
        // Falling edge
        ctx.lineTo(onEnd, baseY);
        // Off phase
        const offEnd = Math.min(x + periodPx, padding + drawWidth);
        ctx.lineTo(offEnd, baseY);
        x += periodPx;
      }
    } else if (pattern.type === 'ramp') {
      const highY = baseY - pattern.intensity * drawHeight;
      ctx.moveTo(padding, baseY);
      ctx.lineTo(padding + drawWidth, highY);
      ctx.lineTo(padding + drawWidth, baseY);
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill with translucent color
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = opsinColor;
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [pattern, opsinColor, width, height]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const update = (updates: Partial<LightPattern>) => {
    onChange({ ...pattern, ...updates });
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-label)',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: opsinColor,
  };

  const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: opsinColor,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Pattern type selector */}
      <div style={{ display: 'flex', gap: 2, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
        {PATTERN_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => update({ type: t })}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'capitalize',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              border: 'none',
              borderRadius: 0,
              background: pattern.type === t ? `${opsinColor}22` : 'transparent',
              color: pattern.type === t ? opsinColor : 'var(--text-label)',
              transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width,
          height,
          borderRadius: 6,
          border: '1px solid var(--border-subtle)',
        }}
      />

      {/* Labels below canvas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
        <span style={{ fontSize: 8, color: 'var(--text-label)' }}>
          {pattern.type === 'pulse' ? `${pattern.frequency}Hz` : pattern.type}
        </span>
        <span style={{ fontSize: 8, color: 'var(--text-label)' }}>
          {pattern.duration}ms
        </span>
      </div>

      {/* Intensity slider — always visible */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={labelStyle}>Intensity</span>
          <span style={valueStyle}>{Math.round(pattern.intensity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={pattern.intensity}
          onChange={(e) => update({ intensity: Number(e.target.value) })}
          style={sliderStyle}
        />
      </div>

      {/* Frequency slider — pulse only */}
      {pattern.type === 'pulse' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={labelStyle}>Frequency (Hz)</span>
            <span style={valueStyle}>{pattern.frequency}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={pattern.frequency}
            onChange={(e) => update({ frequency: Number(e.target.value) })}
            style={sliderStyle}
          />
        </div>
      )}

      {/* Duty cycle slider — pulse only */}
      {pattern.type === 'pulse' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={labelStyle}>Duty Cycle</span>
            <span style={valueStyle}>{Math.round(pattern.dutyCycle * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={pattern.dutyCycle}
            onChange={(e) => update({ dutyCycle: Number(e.target.value) })}
            style={sliderStyle}
          />
        </div>
      )}

      {/* Duration input */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={labelStyle}>Duration (ms)</span>
          <span style={valueStyle}>{pattern.duration}</span>
        </div>
        <input
          type="range"
          min={10}
          max={10000}
          step={10}
          value={pattern.duration}
          onChange={(e) => update({ duration: Number(e.target.value) })}
          style={sliderStyle}
        />
      </div>
    </div>
  );
}
