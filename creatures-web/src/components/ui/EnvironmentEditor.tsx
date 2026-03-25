import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { CollapsiblePanel } from './CollapsiblePanel';
import {
  useEnvironmentStore,
  ENTITY_DEFAULTS,
  ENVIRONMENT_PRESETS,
  type EntityType,
  type EnvironmentEntity,
} from '../../stores/environmentStore';
import { useSimulationStore } from '../../stores/simulationStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_SIZE = 280;
const HALF = CANVAS_SIZE / 2;
const GRID_STEP = 20; // px between grid lines

const ENTITY_TYPE_META: Record<
  EntityType,
  { label: string; icon: string; color: string; iconBg: string }
> = {
  food: { label: 'Food', icon: '\u25CF', color: '#00ff88', iconBg: 'rgba(0,255,136,0.15)' },
  chemical_gradient: {
    label: 'Chemical',
    icon: '\u25CE',
    color: '#2288ff',
    iconBg: 'rgba(34,136,255,0.15)',
  },
  obstacle: { label: 'Obstacle', icon: '\u25A0', color: '#667788', iconBg: 'rgba(102,119,136,0.15)' },
  light_zone: {
    label: 'Light',
    icon: '\u2600',
    color: '#ffdd44',
    iconBg: 'rgba(255,221,68,0.15)',
  },
  toxic_zone: {
    label: 'Toxic',
    icon: '\u2623',
    color: '#ff3344',
    iconBg: 'rgba(255,51,68,0.15)',
  },
  pheromone_source: {
    label: 'Pheromone',
    icon: '\u223F',
    color: '#bb44ff',
    iconBg: 'rgba(187,68,255,0.15)',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert normalized [-0.5, 0.5] coords to canvas px */
function toCanvasX(x: number): number {
  return HALF + x * CANVAS_SIZE;
}
function toCanvasY(y: number): number {
  return HALF - y * CANVAS_SIZE; // flip Y
}

/** Convert canvas px to normalized coords */
function fromCanvasX(px: number): number {
  return (px - HALF) / CANVAS_SIZE;
}
function fromCanvasY(py: number): number {
  return -(py - HALF) / CANVAS_SIZE;
}

/** Clamp a value between min and max */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single palette button */
function PaletteButton({
  entityType,
  active,
  onClick,
}: {
  entityType: EntityType;
  active: boolean;
  onClick: () => void;
}) {
  const meta = ENTITY_TYPE_META[entityType];
  return (
    <button
      onClick={onClick}
      title={meta.label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        border: active ? `1.5px solid ${meta.color}` : '1px solid var(--border-subtle)',
        background: active ? meta.iconBg : 'rgba(255,255,255,0.03)',
        color: meta.color,
        fontSize: 15,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        boxShadow: active ? `0 0 10px ${meta.color}33` : 'none',
      }}
    >
      {meta.icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Canvas entity renderers (SVG)
// ---------------------------------------------------------------------------

function RenderEntity({
  entity,
  selected,
  onMouseDown,
  animTime,
}: {
  entity: EnvironmentEntity;
  selected: boolean;
  onMouseDown: (e: MouseEvent) => void;
  animTime: number;
}) {
  const cx = toCanvasX(entity.x);
  const cy = toCanvasY(entity.y);
  const r = entity.radius * CANVAS_SIZE;
  const opacity = 0.3 + entity.intensity * 0.5;

  const selectionRing = selected ? (
    <circle
      cx={cx}
      cy={cy}
      r={r + 4}
      fill="none"
      stroke="var(--accent-cyan)"
      strokeWidth={1.5}
      strokeDasharray="4 2"
      opacity={0.8}
    />
  ) : null;

  // Resize handle (bottom-right of bounding box)
  const resizeHandle = selected ? (
    <rect
      x={cx + r - 3}
      y={cy + r - 3}
      width={6}
      height={6}
      rx={1}
      fill="var(--accent-cyan)"
      opacity={0.9}
      style={{ cursor: 'se-resize' }}
      data-resize={entity.id}
    />
  ) : null;

  switch (entity.type) {
    case 'food':
      return (
        <g onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          {selectionRing}
          <circle cx={cx} cy={cy} r={r} fill={entity.color} opacity={opacity} />
          {/* Glow */}
          <circle cx={cx} cy={cy} r={r * 1.5} fill={entity.color} opacity={opacity * 0.15} />
          {resizeHandle}
        </g>
      );

    case 'chemical_gradient':
      return (
        <g onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          {selectionRing}
          {/* Concentric rings fading outward */}
          {[1, 0.75, 0.5, 0.25].map((f, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r * f}
              fill="none"
              stroke={entity.color}
              strokeWidth={1}
              opacity={opacity * f}
            />
          ))}
          <circle cx={cx} cy={cy} r={r * 0.15} fill={entity.color} opacity={opacity * 0.6} />
          {resizeHandle}
        </g>
      );

    case 'obstacle':
      return (
        <g onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          {selected && (
            <rect
              x={cx - r - 4}
              y={cy - r - 4}
              width={(r + 4) * 2}
              height={(r + 4) * 2}
              rx={2}
              fill="none"
              stroke="var(--accent-cyan)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.8}
            />
          )}
          <rect
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            rx={2}
            fill={entity.color}
            opacity={opacity}
          />
          {resizeHandle}
        </g>
      );

    case 'light_zone':
      return (
        <g onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          {selectionRing}
          <circle cx={cx} cy={cy} r={r} fill={entity.color} opacity={opacity * 0.3} />
          <circle cx={cx} cy={cy} r={r * 0.6} fill={entity.color} opacity={opacity * 0.15} />
          {resizeHandle}
        </g>
      );

    case 'toxic_zone':
      return (
        <g onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          {selectionRing}
          <circle cx={cx} cy={cy} r={r} fill={entity.color} opacity={opacity * 0.35} />
          {/* Hazard pattern: inner cross */}
          <line
            x1={cx - r * 0.4}
            y1={cy - r * 0.4}
            x2={cx + r * 0.4}
            y2={cy + r * 0.4}
            stroke={entity.color}
            strokeWidth={1.5}
            opacity={opacity * 0.6}
          />
          <line
            x1={cx + r * 0.4}
            y1={cy - r * 0.4}
            x2={cx - r * 0.4}
            y2={cy + r * 0.4}
            stroke={entity.color}
            strokeWidth={1.5}
            opacity={opacity * 0.6}
          />
          {resizeHandle}
        </g>
      );

    case 'pheromone_source': {
      // Animated expanding rings
      const phase = (animTime * 0.8) % 1;
      return (
        <g onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          {selectionRing}
          {[0, 0.33, 0.66].map((offset, i) => {
            const t = (phase + offset) % 1;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r * 0.2 + r * 0.8 * t}
                fill="none"
                stroke={entity.color}
                strokeWidth={1}
                opacity={opacity * (1 - t) * 0.6}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={r * 0.12} fill={entity.color} opacity={opacity * 0.7} />
          {resizeHandle}
        </g>
      );
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Property Editor
// ---------------------------------------------------------------------------

function PropertyEditor({
  entity,
  onUpdate,
  onRemove,
}: {
  entity: EnvironmentEntity;
  onUpdate: (updates: Partial<EnvironmentEntity>) => void;
  onRemove: () => void;
}) {
  const meta = ENTITY_TYPE_META[entity.type];

  const sliderRow = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-label)', width: 80, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: meta.color, height: 3 }}
      />
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );

  const selectRow = (label: string, value: string, options: string[], onChange: (v: string) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-label)', width: 80, flexShrink: 0 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          color: 'var(--text-primary)',
          fontSize: 10,
          padding: '3px 6px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ background: '#111' }}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div
      style={{
        padding: '8px 0',
        borderTop: '1px solid var(--border-subtle)',
        marginTop: 6,
      }}
    >
      {/* Type badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            background: meta.iconBg,
            color: meta.color,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {meta.label}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-label)', fontFamily: 'var(--font-mono)' }}>
          ({entity.x.toFixed(2)}, {entity.y.toFixed(2)})
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onRemove}
          title="Delete entity"
          style={{
            background: 'rgba(255,50,68,0.15)',
            border: '1px solid rgba(255,50,68,0.2)',
            borderRadius: 4,
            color: '#ff5544',
            fontSize: 10,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      {/* Common sliders */}
      {sliderRow('Radius', entity.radius, 0.01, 1.0, 0.01, (v) => onUpdate({ radius: v }))}
      {sliderRow('Intensity', entity.intensity, 0, 1.0, 0.01, (v) => onUpdate({ intensity: v }))}

      {/* Type-specific params */}
      {entity.type === 'food' &&
        sliderRow('Nutrition', (entity.params.nutritional_value as number) ?? 5, 0, 10, 0.5, (v) =>
          onUpdate({ params: { ...entity.params, nutritional_value: v } }),
        )}

      {entity.type === 'chemical_gradient' && (
        <>
          {sliderRow('Diffusion', (entity.params.diffusion_rate as number) ?? 0.5, 0, 1, 0.01, (v) =>
            onUpdate({ params: { ...entity.params, diffusion_rate: v } }),
          )}
          {selectRow(
            'Chemical',
            (entity.params.chemical_type as string) ?? 'attractant',
            ['attractant', 'repellent'],
            (v) => onUpdate({ params: { ...entity.params, chemical_type: v } }),
          )}
        </>
      )}

      {entity.type === 'obstacle' && (
        <>
          {sliderRow('Width', (entity.params.width as number) ?? 0.12, 0.02, 0.5, 0.01, (v) =>
            onUpdate({ params: { ...entity.params, width: v } }),
          )}
          {sliderRow('Height', (entity.params.height as number) ?? 0.12, 0.02, 0.5, 0.01, (v) =>
            onUpdate({ params: { ...entity.params, height: v } }),
          )}
        </>
      )}

      {entity.type === 'light_zone' &&
        selectRow(
          'Wavelength',
          (entity.params.wavelength as string) ?? 'blue',
          ['blue', 'green', 'red'],
          (v) => onUpdate({ params: { ...entity.params, wavelength: v } }),
        )}

      {entity.type === 'toxic_zone' &&
        sliderRow('Damage Rate', (entity.params.damage_rate as number) ?? 0.3, 0, 1, 0.01, (v) =>
          onUpdate({ params: { ...entity.params, damage_rate: v } }),
        )}

      {entity.type === 'pheromone_source' &&
        selectRow(
          'Signal',
          (entity.params.signal_type as string) ?? 'food',
          ['alarm', 'food', 'mating'],
          (v) => onUpdate({ params: { ...entity.params, signal_type: v } }),
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presets Panel
// ---------------------------------------------------------------------------

function PresetsPanel() {
  const loadPreset = useEnvironmentStore((s) => s.loadPreset);

  return (
    <CollapsiblePanel id="env-presets" label="Presets">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ENVIRONMENT_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => loadPreset(preset)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-primary)',
              textAlign: 'left',
              transition: 'all 0.15s',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-active)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600 }}>{preset.name}</span>
            <span style={{ fontSize: 9, color: 'var(--text-label)' }}>{preset.description}</span>
          </button>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

function ExportImportRow() {
  const exportConfig = useEnvironmentStore((s) => s.exportConfig);
  const importConfig = useEnvironmentStore((s) => s.importConfig);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const json = exportConfig();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neurevo-environment.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportConfig]);

  const handleImport = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          importConfig(reader.result);
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be re-imported
      e.target.value = '';
    },
    [importConfig],
  );

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
      <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10, padding: '4px 8px' }} onClick={handleExport}>
        Export JSON
      </button>
      <button className="btn btn-ghost" style={{ flex: 1, fontSize: 10, padding: '4px 8px' }} onClick={handleImport}>
        Import JSON
      </button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EnvironmentEditor({
  sendCommand,
}: {
  sendCommand?: (cmd: Record<string, unknown>) => void;
}) {
  const entities = useEnvironmentStore((s) => s.entities);
  const selectedEntityId = useEnvironmentStore((s) => s.selectedEntityId);
  const isEditing = useEnvironmentStore((s) => s.isEditing);
  const gridSnap = useEnvironmentStore((s) => s.gridSnap);
  const addEntity = useEnvironmentStore((s) => s.addEntity);
  const removeEntity = useEnvironmentStore((s) => s.removeEntity);
  const updateEntity = useEnvironmentStore((s) => s.updateEntity);
  const moveEntity = useEnvironmentStore((s) => s.moveEntity);
  const selectEntity = useEnvironmentStore((s) => s.selectEntity);
  const setEditing = useEnvironmentStore((s) => s.setEditing);
  const toggleGridSnap = useEnvironmentStore((s) => s.toggleGridSnap);
  const clearAll = useEnvironmentStore((s) => s.clearAll);

  const frame = useSimulationStore((s) => s.frame);

  // Currently selected palette tool (null = selection mode)
  const [placingType, setPlacingType] = useState<EntityType | null>(null);

  // Drag state
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startR: number; startDist: number } | null>(null);

  // Animation time for pheromone rings
  const [animTime, setAnimTime] = useState(0);
  const animRef = useRef<number>(0);
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setAnimTime((t) => t + 0.016);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);

  const selectedEntity = selectedEntityId ? entities.find((e) => e.id === selectedEntityId) ?? null : null;

  // Get mouse position relative to SVG
  const getCanvasPos = useCallback((e: MouseEvent): { px: number; py: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }, []);

  // -- Canvas click: place new entity or deselect --
  const handleCanvasClick = useCallback(
    (e: MouseEvent) => {
      if (!isEditing) return;
      if (dragging || resizing) return; // was a drag, not a click

      const pos = getCanvasPos(e);
      if (!pos) return;

      // Check if clicking on a resize handle (data-resize attribute)
      const target = e.target as SVGElement;
      if (target.dataset?.resize) return;

      if (placingType) {
        const defaults = ENTITY_DEFAULTS[placingType];
        addEntity({
          type: placingType,
          x: fromCanvasX(pos.px),
          y: fromCanvasY(pos.py),
          radius: defaults.radius,
          intensity: defaults.intensity,
          color: defaults.color,
          params: { ...defaults.params },
        });
        setPlacingType(null);
      }
    },
    [isEditing, placingType, dragging, resizing, addEntity, getCanvasPos],
  );

  // -- Canvas double-click: deselect --
  const handleCanvasDblClick = useCallback(() => {
    selectEntity(null);
    setPlacingType(null);
  }, [selectEntity]);

  // -- Entity mousedown: start drag or select --
  const handleEntityMouseDown = useCallback(
    (entityId: string, e: MouseEvent) => {
      if (!isEditing) return;
      e.stopPropagation();

      // Check if this is a resize handle
      const target = e.target as SVGElement;
      if (target.dataset?.resize) {
        const ent = entities.find((en) => en.id === entityId);
        if (!ent) return;
        const pos = getCanvasPos(e);
        if (!pos) return;
        const cx = toCanvasX(ent.x);
        const cy = toCanvasY(ent.y);
        const dist = Math.sqrt((pos.px - cx) ** 2 + (pos.py - cy) ** 2);
        setResizing({ id: entityId, startR: ent.radius, startDist: dist });
        selectEntity(entityId);
        return;
      }

      selectEntity(entityId);
      const ent = entities.find((en) => en.id === entityId);
      if (!ent) return;
      const pos = getCanvasPos(e);
      if (!pos) return;
      setDragging({
        id: entityId,
        offsetX: pos.px - toCanvasX(ent.x),
        offsetY: pos.py - toCanvasY(ent.y),
      });
    },
    [isEditing, entities, selectEntity, getCanvasPos],
  );

  // -- Mouse move: drag or resize --
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const pos = getCanvasPos(e);
      if (!pos) return;

      if (dragging) {
        const nx = fromCanvasX(pos.px - dragging.offsetX);
        const ny = fromCanvasY(pos.py - dragging.offsetY);
        moveEntity(dragging.id, clamp(nx, -0.48, 0.48), clamp(ny, -0.48, 0.48));
      }

      if (resizing) {
        const ent = entities.find((en) => en.id === resizing.id);
        if (!ent) return;
        const cx = toCanvasX(ent.x);
        const cy = toCanvasY(ent.y);
        const dist = Math.sqrt((pos.px - cx) ** 2 + (pos.py - cy) ** 2);
        const ratio = dist / resizing.startDist;
        const newR = clamp(resizing.startR * ratio, 0.01, 1.0);
        updateEntity(resizing.id, { radius: newR });
      }
    },
    [dragging, resizing, entities, moveEntity, updateEntity, getCanvasPos],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  // -- Keyboard: delete selected --
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEntityId && isEditing) {
        // Don't delete if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        removeEntity(selectedEntityId);
      }
      if (e.key === 'Escape') {
        selectEntity(null);
        setPlacingType(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedEntityId, isEditing, removeEntity, selectEntity]);

  // -- Apply to simulation --
  const handleApply = useCallback(() => {
    if (!sendCommand) return;
    const serialized = entities.map((e) => ({
      type: e.type,
      x: e.x,
      y: e.y,
      radius: e.radius,
      intensity: e.intensity,
      params: e.params,
    }));
    sendCommand({ type: 'set_environment', entities: serialized });
  }, [entities, sendCommand]);

  // Organism position from simulation frame
  const orgX = frame?.center_of_mass?.[0] ?? null;
  const orgY = frame?.center_of_mass?.[1] ?? null;

  // Build grid lines for canvas
  const gridLines: JSX.Element[] = [];
  if (gridSnap) {
    for (let i = 0; i <= CANVAS_SIZE; i += GRID_STEP) {
      gridLines.push(
        <line key={`h${i}`} x1={0} y1={i} x2={CANVAS_SIZE} y2={i} stroke="rgba(80,130,200,0.06)" strokeWidth={0.5} />,
        <line key={`v${i}`} x1={i} y1={0} x2={i} y2={CANVAS_SIZE} stroke="rgba(80,130,200,0.06)" strokeWidth={0.5} />,
      );
    }
  }

  const toolbarBtnStyle: CSSProperties = {
    fontSize: 9,
    padding: '4px 8px',
    borderRadius: 5,
    border: '1px solid var(--border-subtle)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontWeight: 600,
  };

  return (
    <CollapsiblePanel id="env-editor" label="Environment Editor" badge="NEW" defaultExpanded>
      {/* === Toolbar === */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6, alignItems: 'center' }}>
        {/* Entity palette */}
        {(Object.keys(ENTITY_TYPE_META) as EntityType[]).map((type) => (
          <PaletteButton
            key={type}
            entityType={type}
            active={placingType === type}
            onClick={() => setPlacingType(placingType === type ? null : type)}
          />
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Grid snap */}
        <button
          onClick={toggleGridSnap}
          title="Grid snap"
          style={{
            ...toolbarBtnStyle,
            borderColor: gridSnap ? 'var(--accent-cyan)' : undefined,
            color: gridSnap ? 'var(--accent-cyan)' : undefined,
          }}
        >
          Grid
        </button>

        {/* Edit mode toggle */}
        <button
          onClick={() => setEditing(!isEditing)}
          title={isEditing ? 'Lock (disable editing)' : 'Unlock (enable editing)'}
          style={{
            ...toolbarBtnStyle,
            borderColor: isEditing ? 'var(--accent-green)' : undefined,
            color: isEditing ? 'var(--accent-green)' : undefined,
          }}
        >
          {isEditing ? 'Editing' : 'Locked'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Clear all */}
        <button
          onClick={clearAll}
          style={{
            ...toolbarBtnStyle,
            borderColor: 'rgba(255,50,68,0.2)',
            color: '#ff5544',
          }}
        >
          Clear
        </button>
      </div>

      {/* Placing hint */}
      {placingType && (
        <div
          style={{
            fontSize: 10,
            color: ENTITY_TYPE_META[placingType].color,
            marginBottom: 4,
            padding: '3px 6px',
            background: ENTITY_TYPE_META[placingType].iconBg,
            borderRadius: 4,
            textAlign: 'center',
          }}
        >
          Click on canvas to place {ENTITY_TYPE_META[placingType].label.toLowerCase()}
        </div>
      )}

      {/* === Arena Canvas === */}
      <div
        style={{
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          margin: '0 auto',
          borderRadius: 8,
          border: '1px solid var(--border-subtle)',
          background: '#060810',
          position: 'relative',
          overflow: 'hidden',
          cursor: placingType ? 'crosshair' : isEditing ? 'default' : 'not-allowed',
        }}
      >
        <svg
          ref={svgRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{ display: 'block' }}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDblClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid */}
          {gridLines}

          {/* Arena boundary circle */}
          <circle
            cx={HALF}
            cy={HALF}
            r={HALF - 4}
            fill="none"
            stroke="rgba(80,130,200,0.12)"
            strokeWidth={1}
          />

          {/* Subtle crosshair at center */}
          <line x1={HALF - 6} y1={HALF} x2={HALF + 6} y2={HALF} stroke="rgba(80,130,200,0.08)" strokeWidth={0.5} />
          <line x1={HALF} y1={HALF - 6} x2={HALF} y2={HALF + 6} stroke="rgba(80,130,200,0.08)" strokeWidth={0.5} />

          {/* Entities */}
          {entities.map((entity) => (
            <RenderEntity
              key={entity.id}
              entity={entity}
              selected={entity.id === selectedEntityId}
              onMouseDown={(e) => handleEntityMouseDown(entity.id, e)}
              animTime={animTime}
            />
          ))}

          {/* Organism position marker */}
          {orgX !== null && orgY !== null && (
            <>
              <circle
                cx={toCanvasX(orgX * 0.02)} // scale down from world coords to normalized
                cy={toCanvasY(orgY * 0.02)}
                r={4}
                fill="white"
                opacity={0.8}
              />
              <circle
                cx={toCanvasX(orgX * 0.02)}
                cy={toCanvasY(orgY * 0.02)}
                r={7}
                fill="none"
                stroke="white"
                strokeWidth={0.5}
                opacity={0.3}
              />
            </>
          )}
        </svg>
      </div>

      {/* Entity count */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
          padding: '0 2px',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--text-label)', fontFamily: 'var(--font-mono)' }}>
          {entities.length} entit{entities.length === 1 ? 'y' : 'ies'}
        </span>
        {sendCommand && (
          <button
            className="btn btn-primary"
            style={{ fontSize: 10, padding: '4px 12px' }}
            onClick={handleApply}
          >
            Apply to Simulation
          </button>
        )}
      </div>

      {/* === Property Editor === */}
      {selectedEntity && (
        <PropertyEditor
          entity={selectedEntity}
          onUpdate={(updates) => updateEntity(selectedEntity.id, updates)}
          onRemove={() => removeEntity(selectedEntity.id)}
        />
      )}

      {/* === Presets === */}
      <div style={{ marginTop: 8 }}>
        <PresetsPanel />
      </div>

      {/* === Export / Import === */}
      <ExportImportRow />
    </CollapsiblePanel>
  );
}
