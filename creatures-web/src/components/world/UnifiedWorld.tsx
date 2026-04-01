import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '../../stores/worldStore';
import { API_BASE, WS_HOST } from '../../config';
import { SemanticZoomController } from './SemanticZoomController';
import {
  OrganismInstances,
  OrganismTrails,
  FoodInstances,
  TerrainArena,
  AmbientParticles,
  DensityHeatmap,
  LineageRivers,
  SpeciesTerritories,
} from './PopulationLayer';
import { ColonyLayer } from './ColonyLayer';
import { ProceduralOrganismInstances } from './ProceduralOrganism';
import { OrganismFocus } from './OrganismFocus';
import { ContextSidebar } from './ContextSidebar';
import { WorldCreator } from '../ui/WorldCreator';
import { EvolutionTimeline } from '../ui/EvolutionTimeline';
import { GodChat } from '../ui/GodChat';
import { AITicker } from './AITicker';
import { AINotifications } from './AINotifications';
import { AIHighlighter } from './AIHighlighter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ARENA_RADIUS = 25;

// ---------------------------------------------------------------------------
// Scene contents (inside Canvas)
// ---------------------------------------------------------------------------

function SceneContents() {
  const organisms = useWorldStore((s) => s.organisms);
  const neuralStats = useWorldStore((s) => s.neuralStats);
  const worldType = useWorldStore((s) => s.worldType);
  const colorMode = useWorldStore((s) => s.colorMode);
  const food = useWorldStore((s) => s.food);
  const selectedOrganismIndex = useWorldStore((s) => s.selectedOrganismIndex);
  const selectedOrganism = useWorldStore((s) => s.selectedOrganism);
  const highlightedIndices = useWorldStore((s) => s.highlightedOrganismIndices);
  const zoomBand = useWorldStore((s) => s.zoomBand);
  const selectOrganism = useWorldStore((s) => s.selectOrganism);

  // Compute arena radius from organism positions
  const arenaRadius = useMemo(() => {
    if (organisms.length === 0) return DEFAULT_ARENA_RADIUS;
    const maxCoord = organisms.reduce(
      (max, o) => Math.max(max, Math.abs(o.x), Math.abs(o.y)),
      0,
    );
    return Math.max(DEFAULT_ARENA_RADIUS, Math.ceil(maxCoord * 1.3));
  }, [organisms.length]);

  const isEmpty = organisms.length === 0;

  return (
    <>
      <SemanticZoomController />

      {/* Lighting — hemisphere + directional shadows + subtle point glow */}
      <hemisphereLight args={['#334466', '#1a0f08', 0.5]} />
      <directionalLight
        position={[20, 20, 30]}
        intensity={0.7}
        color="#fff8ee"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[0, 0, 10]} intensity={0.25} color="#00d4ff" distance={50} />

      {/* Sky dome — gradient from dark horizon to darker zenith */}
      <mesh>
        <sphereGeometry args={[120, 32, 16]} />
        <meshBasicMaterial color="#050510" side={THREE.BackSide} />
      </mesh>

      {/* Camera controls */}
      <OrbitControls
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        maxPolarAngle={Math.PI / 2}
        minDistance={2}
        maxDistance={80}
        makeDefault
      />

      {/* Environment — terrain + ambient particles */}
      <TerrainArena worldType={worldType} arenaRadius={arenaRadius} />
      <AmbientParticles arenaRadius={arenaRadius} />

      {isEmpty ? (
        <EmptyScene />
      ) : (
        <>
          {/* Population Layer — always visible (instanced dots) */}
          <OrganismInstances
            organisms={organisms}
            neuralStats={neuralStats}
            colorMode={colorMode}
            onSelectOrganism={selectOrganism}
            selectedIndex={selectedOrganismIndex}
            highlightedIndices={highlightedIndices}
          />

          {/* Movement trails */}
          <OrganismTrails organisms={organisms} />

          {/* Food */}
          <FoodInstances
            organismCount={organisms.length}
            arenaRadius={arenaRadius}
            food={food}
          />

          {/* Population overlays — visible at population zoom */}
          {zoomBand === 'population' && (
            <>
              <DensityHeatmap organisms={organisms} arenaRadius={arenaRadius} />
              <SpeciesTerritories organisms={organisms} />
              <LineageRivers organisms={organisms} />
            </>
          )}

          {/* Colony Layer — simplified meshes at mid zoom */}
          <ColonyLayer
            organisms={organisms}
            visible={zoomBand === 'colony'}
          />

          {/* Procedural Organisms — unique 3D bodies at organism zoom */}
          <ProceduralOrganismInstances
            organisms={organisms.slice(0, 20)}
            visible={zoomBand === 'organism'}
          />

          {/* Organism Focus — visible when zoomed into a specific organism */}
          {selectedOrganism && zoomBand === 'organism' && (
            <OrganismFocus organism={selectedOrganism} visible={true} />
          )}
        </>
      )}
    </>
  );
}

function EmptyScene() {
  return (
    <mesh position={[0, 0, 0.5]}>
      <planeGeometry args={[10, 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// HUD Overlay (HTML)
// ---------------------------------------------------------------------------

function HudOverlay() {
  const organisms = useWorldStore((s) => s.organisms);
  const neuralStats = useWorldStore((s) => s.neuralStats);
  const populationStats = useWorldStore((s) => s.populationStats);
  const emergentEvents = useWorldStore((s) => s.emergentEvents);
  const zoomBand = useWorldStore((s) => s.zoomBand);
  const selectedOrganism = useWorldStore((s) => s.selectedOrganism);
  const colorMode = useWorldStore((s) => s.colorMode);
  const toggleColorMode = useWorldStore((s) => s.toggleColorMode);
  const speed = useWorldStore((s) => s.speed);
  const chemotaxisIndex = useWorldStore((s) => s.chemotaxisIndex);
  const approachingFraction = useWorldStore((s) => s.approachingFraction);
  const relativeChemotaxis = useWorldStore((s) => s.relativeChemotaxis);
  const worldType = useWorldStore((s) => s.worldType);
  const selectOrganism = useWorldStore((s) => s.selectOrganism);
  const connectionMode = useWorldStore((s) => s.connectionMode);

  // Birth/death tracking
  const [birthCount, setBirthCount] = useState(0);
  const [deathCount, setDeathCount] = useState(0);
  const prevCountRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const prev = prevCountRef.current;
    const curr = organisms.length;
    prevCountRef.current = curr;
    if (prev === 0 && curr === 0) return;
    const delta = curr - prev;
    if (delta > 0) setBirthCount((c) => c + delta);
    else if (delta < 0) setDeathCount((c) => c + Math.abs(delta));
  }, [organisms.length]);

  useEffect(() => {
    const iv = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, []);

  // Narrative events from emergent behaviors
  const [narratives, setNarratives] = useState<
    { text: string; icon: string; time: number }[]
  >([]);
  const prevEventsLen = useRef(0);

  useEffect(() => {
    if (emergentEvents.length <= prevEventsLen.current) {
      prevEventsLen.current = emergentEvents.length;
      return;
    }
    const newEvents = emergentEvents.slice(prevEventsLen.current);
    prevEventsLen.current = emergentEvents.length;

    for (const ev of newEvents) {
      const label = ev.behavior_type.replace(/_/g, ' ');
      const conf = (ev.confidence * 100).toFixed(0);
      setNarratives((prev) =>
        [
          { text: `${label} detected (${conf}%)`, icon: '\u{1F52C}', time: Date.now() },
          ...prev,
        ].slice(0, 5),
      );
    }
  }, [emergentEvents]);

  // Auto-remove stale narratives
  useEffect(() => {
    const iv = setInterval(() => {
      const cutoff = Date.now() - 12000;
      setNarratives((prev) => prev.filter((n) => n.time > cutoff));
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const fontFamily = '"SF Mono", "Fira Code", monospace';

  const worldLabels: Record<string, string> = {
    soil: 'SOIL',
    pond: 'POND',
    lab_plate: 'LAB PLATE',
    abstract: 'ABSTRACT',
  };

  // Population trend
  const trend =
    organisms.length > prevCountRef.current
      ? 'up'
      : organisms.length < prevCountRef.current
        ? 'down'
        : 'stable';

  return (
    <>
      {/* Stats HUD — top left */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 10px',
          borderRadius: 4,
          fontFamily,
          fontSize: 10,
          lineHeight: '14px',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      >
        <div style={{ color: 'rgba(140,170,200,0.5)' }}>
          {connectionMode === 'local' ? 'BRAIN-WORLD LOCAL' : 'BRAIN-WORLD LIVE'}
        </div>
        <div
          style={{
            color: speed > 5 ? 'rgba(255,180,80,0.9)' : 'rgba(0,255,136,0.8)',
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {speed.toFixed(1)}x SPEED
        </div>
        <div
          style={{
            color:
              trend === 'down' ? '#ff4444' : 'rgba(0,212,255,0.7)',
          }}
        >
          Pop: {organisms.length}
          {trend === 'up' && (
            <span style={{ color: 'rgba(0,255,136,0.8)', marginLeft: 4 }}>{'\u2191'}</span>
          )}
          {trend === 'down' && (
            <span style={{ color: '#ff4444', marginLeft: 4 }}>{'\u2193'}</span>
          )}
        </div>
        {/* Species breakdown */}
        {organisms.length > 0 && (() => {
          const ce = organisms.filter(o => o.species === 0).length;
          const dm = organisms.length - ce;
          return (
            <div style={{ fontSize: 9, display: 'flex', gap: 8 }}>
              <span style={{ color: '#00d4ff' }}>Ce: {ce}</span>
              <span style={{ color: '#ffaa22' }}>Dm: {dm}</span>
            </div>
          );
        })()}
        <div style={{ color: 'rgba(0,255,136,0.65)' }}>Births: {birthCount}</div>
        <div
          style={{
            color: deathCount > 0 ? '#ff4444' : 'rgba(255,100,100,0.65)',
            fontWeight: deathCount > 0 ? 600 : 400,
          }}
        >
          Deaths: {deathCount}
        </div>
        <div style={{ color: 'rgba(160,160,200,0.5)', fontSize: 9 }}>
          Elapsed: {Math.floor(elapsed / 60)}m {Math.floor(elapsed % 60)}s
        </div>
        {neuralStats && (
          <>
            <div style={{ color: 'rgba(180,140,255,0.7)' }}>
              Neurons: {neuralStats.total_neurons.toLocaleString()}
            </div>
            <div style={{ color: 'rgba(0,255,136,0.7)' }}>
              Fired: {neuralStats.total_fired.toLocaleString()}
            </div>
            <div style={{ color: 'rgba(255,200,100,0.6)' }}>
              Rate: {neuralStats.mean_firing_rate.toFixed(3)}
            </div>
          </>
        )}
        {populationStats?.max_generation > 0 && (
          <div
            style={{
              marginTop: 8,
              borderTop: '1px solid rgba(80,130,200,0.1)',
              paddingTop: 6,
            }}
          >
            <div
              style={{
                fontSize: 8,
                color: 'rgba(140,170,200,0.4)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Evolution
            </div>
            <div>
              Generation:{' '}
              <span style={{ color: '#ffcc88' }}>
                {populationStats.max_generation}
              </span>
            </div>
            <div>
              Lineages:{' '}
              <span style={{ color: '#88ffcc' }}>
                {populationStats.n_lineages}
              </span>
            </div>
            <div>
              Avg food:{' '}
              <span style={{ color: '#ff8888' }}>
                {populationStats.mean_lifetime_food?.toFixed(1)}
              </span>
            </div>
          </div>
        )}

        {/* Chemotaxis — relative to random walk (key scientific metric) */}
        {(chemotaxisIndex > 0 || relativeChemotaxis !== 0) && (
          <div
            style={{
              marginTop: 8,
              borderTop: '1px solid rgba(80,130,200,0.1)',
              paddingTop: 6,
            }}
          >
            <div
              style={{
                fontSize: 8,
                color: 'rgba(140,170,200,0.4)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Chemotaxis
            </div>
            <div>
              Rel CI:{' '}
              <span
                style={{
                  color:
                    relativeChemotaxis > 0.1
                      ? '#00ff88'
                      : relativeChemotaxis > 0.0
                        ? '#ffcc88'
                        : '#ff6666',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {relativeChemotaxis > 0 ? '+' : ''}{relativeChemotaxis.toFixed(3)}
              </span>
              <span style={{ color: 'rgba(140,170,200,0.3)', fontSize: 9, marginLeft: 4 }}>
                (0 = random walk)
              </span>
            </div>
            {/* Mini relative CI bar — centered at 0 */}
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 8, color: 'rgba(140,170,200,0.3)' }}>-1</span>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                {/* Center line (0 = random walk) */}
                <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.2)' }} />
                {/* Current relative CI */}
                <div style={{
                  position: 'absolute',
                  left: relativeChemotaxis >= 0 ? '50%' : `${(0.5 + relativeChemotaxis * 0.5) * 100}%`,
                  width: `${Math.abs(relativeChemotaxis) * 50}%`,
                  height: '100%',
                  background: relativeChemotaxis > 0 ? '#00ff88' : '#ff6666',
                  borderRadius: 2,
                  transition: 'all 0.5s',
                }} />
              </div>
              <span style={{ fontSize: 8, color: 'rgba(140,170,200,0.3)' }}>+1</span>
            </div>
          </div>
        )}

        {/* Zoom band indicator */}
        <div
          style={{
            marginTop: 8,
            borderTop: '1px solid rgba(80,130,200,0.1)',
            paddingTop: 4,
            fontSize: 9,
            color: 'rgba(100,180,255,0.6)',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {zoomBand === 'population'
            ? 'Population View'
            : zoomBand === 'colony'
              ? 'Colony View'
              : 'Organism View'}
        </div>

        <button
          onClick={toggleColorMode}
          style={{
            background: 'rgba(100, 130, 200, 0.1)',
            border: '1px solid rgba(100, 130, 200, 0.15)',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 9,
            color: '#88aacc',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            marginTop: 4,
            display: 'block',
          }}
        >
          Color: {colorMode === 'energy' ? 'Energy' : 'Lineage'}
        </button>
      </div>

      {/* World type label — bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          fontFamily,
          fontSize: 9,
          color: 'rgba(100,130,170,0.35)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {worldLabels[worldType] ?? worldType.toUpperCase()}
      </div>

      {/* Emergent behavior badges — top right */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          textAlign: 'right',
          fontFamily,
          fontSize: 9,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div style={{ color: connectionMode === 'local' ? 'rgba(255,180,80,0.7)' : 'rgba(0,255,136,0.5)', marginBottom: 4 }}>
          {connectionMode === 'local' ? 'LOCAL' : 'LIVE'}
        </div>
      </div>

      {/* Narrative event feed — bottom left */}
      {narratives.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 150,
            left: 16,
            maxWidth: 380,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: 6,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {narratives.slice(0, 3).map((n, i) => (
            <div
              key={n.time}
              style={{
                background: 'rgba(6, 8, 18, 0.92)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(100, 160, 255, 0.2)',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: i === 0 ? 13 : 11,
                fontWeight: i === 0 ? 600 : 400,
                color:
                  i === 0
                    ? 'rgba(220, 235, 255, 0.95)'
                    : 'rgba(180, 200, 220, 0.75)',
                fontFamily,
                opacity: 1 - i * 0.2,
              }}
            >
              <span style={{ marginRight: 8, fontSize: i === 0 ? 15 : 12 }}>
                {n.icon}
              </span>
              {n.text}
            </div>
          ))}
        </div>
      )}

      {/* Selected organism inspect card */}
      {selectedOrganism && (() => {
        const energy = Math.min(1, Math.max(0, selectedOrganism.energy / 200));
        const energyColor = energy > 0.5 ? '#00cc66' : energy > 0.2 ? '#ffaa22' : '#ff4444';
        const speciesColor = selectedOrganism.species === 0 ? '#00d4ff' : '#ffaa22';
        return (
          <div
            style={{
              position: 'absolute',
              top: 60,
              left: 12,
              zIndex: 25,
              background: 'rgba(6, 8, 18, 0.92)',
              backdropFilter: 'blur(16px)',
              border: `1px solid ${speciesColor}30`,
              borderRadius: 12,
              padding: '12px 16px',
              maxWidth: 220,
              fontFamily: '"SF Mono", "Fira Code", monospace',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: speciesColor }}>
                {selectedOrganism.species === 0 ? 'C. elegans' : 'Drosophila'}
              </span>
              <button
                onClick={() => selectOrganism(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(140,170,200,0.5)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
              >
                {'\u00d7'}
              </button>
            </div>

            {/* Energy bar */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(140,170,200,0.4)', marginBottom: 3 }}>
                <span>Energy</span>
                <span style={{ color: energyColor }}>{selectedOrganism.energy.toFixed(0)}</span>
              </div>
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${energy * 100}%`, height: '100%', background: energyColor, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10, color: 'rgba(160,180,210,0.7)' }}>
              <div>Gen <span style={{ color: '#ffcc88' }}>{selectedOrganism.generation ?? 0}</span></div>
              <div>Age <span style={{ color: 'rgba(220,235,255,0.9)' }}>{(selectedOrganism.age ?? 0).toFixed(0)}</span></div>
              <div>Food <span style={{ color: '#88ccff' }}>{(selectedOrganism.lifetime_food_eaten ?? 0).toFixed(0)}</span></div>
              <div>Lin <span style={{ color: '#88ffcc' }}>{(selectedOrganism.lineage_id ?? '?').toString().slice(0, 6)}</span></div>
            </div>

            {/* Hint to open sidebar */}
            <div style={{ marginTop: 8, fontSize: 8, color: 'rgba(100,130,170,0.3)', textAlign: 'center' }}>
              Open sidebar for neural detail {'\u2192'}
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ---------------------------------------------------------------------------
// Zoom Breadcrumb — shows current zoom level with visual indicator
// ---------------------------------------------------------------------------

function ZoomBreadcrumb() {
  const zoomLevel = useWorldStore((s) => s.zoomLevel);
  const zoomBand = useWorldStore((s) => s.zoomBand);
  const selectedOrganism = useWorldStore((s) => s.selectedOrganism);

  const labels = [
    { band: 'population' as const, label: 'Population', color: '#00d4ff', range: [0, 0.3] },
    { band: 'colony' as const, label: 'Colony', color: '#ffaa22', range: [0.3, 0.7] },
    { band: 'organism' as const, label: 'Organism', color: '#ff4488', range: [0.7, 1.0] },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'rgba(6,8,18,0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(80,130,200,0.1)',
        borderRadius: 20,
        padding: '3px 6px',
        zIndex: 15,
        pointerEvents: 'none',
      }}
    >
      {labels.map((l, i) => {
        const isActive = zoomBand === l.band;
        return (
          <div key={l.band} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {i > 0 && (
              <div style={{
                width: 12, height: 1,
                background: `rgba(80,130,200,${isActive || labels[i - 1].band === zoomBand ? 0.3 : 0.08})`,
              }} />
            )}
            <div
              style={{
                fontSize: 9,
                fontFamily: '"SF Mono", "Fira Code", monospace',
                color: isActive ? l.color : 'rgba(140,170,200,0.3)',
                fontWeight: isActive ? 600 : 400,
                padding: '2px 8px',
                borderRadius: 12,
                background: isActive ? `${l.color}10` : 'transparent',
                border: isActive ? `1px solid ${l.color}30` : '1px solid transparent',
                transition: 'all 0.3s ease',
                letterSpacing: 0.5,
              }}
            >
              {l.label}
              {isActive && l.band === 'organism' && selectedOrganism && (
                <span style={{ marginLeft: 4, opacity: 0.6 }}>
                  #{selectedOrganism.species === 0 ? 'Ce' : 'Dm'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speed Control
// ---------------------------------------------------------------------------

function SpeedControl({
  sendCommand,
}: {
  sendCommand: (cmd: Record<string, unknown>) => void;
}) {
  const speed = useWorldStore((s) => s.speed);
  const setSpeed = useWorldStore((s) => s.setSpeed);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      setSpeed(value);
      sendCommand({ type: 'speed', value });
    },
    [sendCommand, setSpeed],
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 168,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(6,8,18,0.8)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(80,130,200,0.12)',
        borderRadius: 8,
        padding: '4px 12px',
        zIndex: 10,
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: 'rgba(140,170,200,0.4)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        0.1x
      </span>
      <input
        type="range"
        min={0.1}
        max={20}
        step={0.1}
        value={speed}
        onChange={handleChange}
        style={{ width: 120, accentColor: '#00d4ff', cursor: 'pointer' }}
      />
      <span
        style={{
          fontSize: 9,
          color: 'rgba(140,170,200,0.4)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        20x
      </span>
      <span
        style={{
          fontSize: 10,
          color: speed > 5 ? 'rgba(255,180,80,0.8)' : 'rgba(0,212,255,0.7)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          minWidth: 32,
          textAlign: 'right',
        }}
      >
        {speed.toFixed(1)}x
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left Sidebar — Divine Interventions (always-visible icon strip)
// ---------------------------------------------------------------------------

function LeftSidebar({
  massiveId,
  notify,
}: {
  massiveId: string;
  notify?: (msg: string, duration?: number) => void;
}) {
  const [mutationRate, setMutationRate] = useState(0.02);
  const [hovered, setHovered] = useState(false);
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const triggerEvent = useCallback(
    async (eventType: string, label: string) => {
      setActiveBtn(eventType);
      try {
        await fetch(`${API_BASE}/api/ecosystem/${massiveId}/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: eventType }),
        });
        notify?.(`${label} triggered`);
      } catch {
        notify?.(`${label} (local only)`);
      } finally {
        setTimeout(() => setActiveBtn(null), 600);
      }
    },
    [massiveId, notify],
  );

  const fastForward = useCallback(async () => {
    setActiveBtn('fast_forward');
    try {
      await fetch(
        `${API_BASE}/api/ecosystem/massive/${massiveId}/step?steps=1000`,
        { method: 'POST' },
      );
      notify?.('Fast-forwarded 1000 steps');
    } catch {
      notify?.('Fast-forward unavailable');
    } finally {
      setTimeout(() => setActiveBtn(null), 600);
    }
  }, [massiveId, notify]);

  const downloadData = useCallback(async () => {
    setActiveBtn('download');
    try {
      const res = await fetch(
        `${API_BASE}/api/ecosystem/massive/${massiveId}`,
      );
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecosystem-${massiveId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify?.('Ecosystem data downloaded');
    } catch {
      notify?.('Download failed');
    } finally {
      setTimeout(() => setActiveBtn(null), 600);
    }
  }, [massiveId, notify]);

  const interventions = [
    { key: 'food_scarcity', icon: '\u{1F3DC}\uFE0F', label: 'Famine', desc: 'Remove 50% food' },
    { key: 'predator_surge', icon: '\u{1F480}', label: 'Predator Surge', desc: 'Cull weakest 20%' },
    { key: 'mutation_burst', icon: '\u{1F9EC}', label: 'Mutation Burst', desc: 'Increase variation' },
    { key: 'climate_shift', icon: '\u{1F30A}', label: 'Climate Shift', desc: 'Relocate resources' },
  ];

  const sidebarWidth = hovered ? 200 : 48;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 24,
        width: sidebarWidth,
        background: 'rgba(6, 8, 18, 0.85)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(80, 130, 200, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: hovered ? 'stretch' : 'center',
        paddingTop: 12,
        gap: 4,
        zIndex: 30,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        fontFamily: '"SF Mono", "Fira Code", monospace',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 8,
          color: 'rgba(140, 170, 200, 0.4)',
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          textAlign: 'center',
          marginBottom: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {hovered ? 'DIVINE INTERVENTIONS' : '\u2726'}
      </div>

      {/* Intervention buttons */}
      {interventions.map((item) => {
        const isActive = activeBtn === item.key;
        return (
          <button
            key={item.key}
            onClick={() => triggerEvent(item.key, item.label)}
            title={!hovered ? `${item.label} — ${item.desc}` : undefined}
            style={{
              background: isActive
                ? 'rgba(0, 212, 255, 0.15)'
                : 'rgba(100, 130, 200, 0.06)',
              border: `1px solid ${isActive ? 'rgba(0, 212, 255, 0.3)' : 'rgba(100, 130, 200, 0.08)'}`,
              borderRadius: 8,
              padding: hovered ? '8px 10px' : '8px 0',
              margin: '0 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: isActive ? '#00d4ff' : 'rgba(200, 215, 235, 0.8)',
              fontSize: 12,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
              justifyContent: hovered ? 'flex-start' : 'center',
              minHeight: 36,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: 'center' }}>
              {item.icon}
            </span>
            {hovered && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: 9, color: 'rgba(140, 170, 200, 0.4)' }}>
                  {item.desc}
                </span>
              </div>
            )}
          </button>
        );
      })}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'rgba(80, 130, 200, 0.1)',
          margin: '6px 8px',
        }}
      />

      {/* Fast-forward button */}
      <button
        onClick={fastForward}
        title={!hovered ? 'Fast-Forward 1000 Steps' : undefined}
        style={{
          background:
            activeBtn === 'fast_forward'
              ? 'rgba(255, 180, 80, 0.15)'
              : 'rgba(255, 180, 80, 0.06)',
          border: `1px solid ${activeBtn === 'fast_forward' ? 'rgba(255, 180, 80, 0.3)' : 'rgba(255, 180, 80, 0.1)'}`,
          borderRadius: 8,
          padding: hovered ? '8px 10px' : '8px 0',
          margin: '0 4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: activeBtn === 'fast_forward' ? '#ffb450' : 'rgba(255, 200, 140, 0.8)',
          fontSize: 12,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          justifyContent: hovered ? 'flex-start' : 'center',
          minHeight: 36,
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: 'center' }}>
          {'\u23E9'}
        </span>
        {hovered && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Fast-Forward</span>
            <span style={{ fontSize: 9, color: 'rgba(140, 170, 200, 0.4)' }}>
              +1000 steps
            </span>
          </div>
        )}
      </button>

      {/* Mutation rate slider */}
      <div
        style={{
          margin: '6px 4px 0',
          padding: hovered ? '8px 8px' : '8px 4px',
          background: 'rgba(100, 130, 200, 0.04)',
          borderRadius: 8,
          border: '1px solid rgba(100, 130, 200, 0.06)',
          overflow: 'hidden',
        }}
      >
        {hovered ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 9, color: 'rgba(140, 170, 200, 0.5)' }}>
                Mutation Rate
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: '#ffcc88',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                {mutationRate.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min={0.001}
              max={0.1}
              step={0.001}
              value={mutationRate}
              onChange={(e) => setMutationRate(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ffcc88', cursor: 'pointer' }}
            />
          </>
        ) : (
          <div
            title={`Mutation Rate: ${mutationRate.toFixed(3)}`}
            style={{
              fontSize: 14,
              textAlign: 'center',
              color: 'rgba(255, 204, 136, 0.7)',
            }}
          >
            {'\u{1F52C}'}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Download button at bottom */}
      <button
        onClick={downloadData}
        title={!hovered ? 'Download Ecosystem Data' : undefined}
        style={{
          background:
            activeBtn === 'download'
              ? 'rgba(0, 255, 136, 0.15)'
              : 'rgba(0, 255, 136, 0.04)',
          border: `1px solid ${activeBtn === 'download' ? 'rgba(0, 255, 136, 0.3)' : 'rgba(0, 255, 136, 0.08)'}`,
          borderRadius: 8,
          padding: hovered ? '8px 10px' : '8px 0',
          margin: '0 4px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: activeBtn === 'download' ? '#00ff88' : 'rgba(0, 255, 136, 0.7)',
          fontSize: 12,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          justifyContent: hovered ? 'flex-start' : 'center',
          minHeight: 36,
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: 'center' }}>
          {'\u{1F4BE}'}
        </span>
        {hovered && (
          <span style={{ fontSize: 11, fontWeight: 600 }}>Download Data</span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Exported Component
// ---------------------------------------------------------------------------

export function UnifiedWorld({
  notify,
}: {
  notify?: (msg: string, duration?: number) => void;
}) {
  const massiveId = useWorldStore((s) => s.massiveId);
  const setMassiveId = useWorldStore((s) => s.setMassiveId);
  const setWorldType = useWorldStore((s) => s.setWorldType);
  const worldType = useWorldStore((s) => s.worldType);
  const isCreating = useWorldStore((s) => s.isCreating);
  const setIsCreating = useWorldStore((s) => s.setIsCreating);
  const updateFromWs = useWorldStore((s) => s.updateFromWs);
  const population = useWorldStore((s) => s.population);
  const neuralStats = useWorldStore((s) => s.neuralStats);
  const storeConnectionMode = useWorldStore((s) => s.connectionMode);
  const localWsUrl = useWorldStore((s) => s.localWsUrl);
  const setConnectionMode = useWorldStore((s) => s.setConnectionMode);
  const setLocalWsUrl = useWorldStore((s) => s.setLocalWsUrl);

  const selectedOrganismIndex = useWorldStore((s) => s.selectedOrganismIndex);
  const selectOrganism = useWorldStore((s) => s.selectOrganism);
  const fetchOrganismDetail = useWorldStore((s) => s.fetchOrganismDetail);

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);

  // Local connection UI state
  const [localConnStatus, setLocalConnStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [localUrlInput, setLocalUrlInput] = useState('ws://localhost:8765');

  // --- URL parameter auto-connect (?ws=<url>) ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wsParam = params.get('ws');
    if (wsParam) {
      setLocalUrlInput(wsParam);
      setLocalWsUrl(wsParam);
      // Auto-connect after a tick to let component mount
      setTimeout(() => {
        connectLocal(wsParam);
      }, 100);
    }
    // Run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Connect to a local WebSocket ---
  const connectLocal = useCallback(
    (url?: string) => {
      const wsUrl = url || localWsUrl;
      setLocalConnStatus('connecting');
      setConnectionMode('local');
      setLocalWsUrl(wsUrl);

      // Close any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[UnifiedWorld] Local WebSocket connected to', wsUrl);
        setLocalConnStatus('connected');
        // Set massiveId to 'local' so the world view renders
        setMassiveId('local');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ecosystem_state') {
            updateFromWs(msg);
          } else if (msg.type === 'organism_detail') {
            useWorldStore.setState({
              organismDetail: msg,
              organismDetailLoading: false,
            });
          }
        } catch (e) {
          console.error('[UnifiedWorld] Failed to parse local message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[UnifiedWorld] Local WebSocket error:', err);
        setLocalConnStatus('failed');
      };

      ws.onclose = () => {
        console.log('[UnifiedWorld] Local WebSocket disconnected');
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      };

      wsRef.current = ws;
    },
    [localWsUrl, setConnectionMode, setLocalWsUrl, setMassiveId, updateFromWs],
  );

  // Auto-refresh organism detail via WebSocket every 2 seconds while selected
  useEffect(() => {
    if (selectedOrganismIndex === null || !massiveId) return;

    // Initial fetch via REST (in case WebSocket isn't ready)
    fetchOrganismDetail(selectedOrganismIndex);

    // Periodic refresh via WebSocket for real-time updates
    const iv = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'focus_organism', org_idx: selectedOrganismIndex }),
        );
      } else {
        // Fallback to REST if WebSocket is not open
        fetchOrganismDetail(selectedOrganismIndex);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [selectedOrganismIndex, massiveId, fetchOrganismDetail]);

  // Keyboard shortcuts for World view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        selectOrganism(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectOrganism]);

  // --- WebSocket connection (cloud mode only) ---
  useEffect(() => {
    // Skip cloud WS when in local mode — local WS is managed by connectLocal()
    if (storeConnectionMode === 'local') return;

    if (!massiveId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const wsProtocol =
      window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${WS_HOST}/api/ecosystem/massive/ws/${massiveId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () =>
      console.log('[UnifiedWorld] WebSocket connected to', massiveId);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ecosystem_state') {
          updateFromWs(msg);
        } else if (msg.type === 'organism_detail') {
          // Real-time organism detail from WebSocket focus command
          useWorldStore.setState({
            organismDetail: msg,
            organismDetailLoading: false,
          });
        }
      } catch (e) {
        console.error('[UnifiedWorld] Failed to parse message:', e);
      }
    };

    ws.onerror = (err) =>
      console.error('[UnifiedWorld] WebSocket error:', err);
    ws.onclose = () => {
      console.log('[UnifiedWorld] WebSocket disconnected');
      wsRef.current = null;
    };

    wsRef.current = ws;
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [massiveId, updateFromWs, storeConnectionMode]);

  // --- Send command via WebSocket ---
  const sendCommand = useCallback((cmd: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  // --- Create brain-world ---
  const createWorld = useCallback(
    async (type: string, nOrganisms = 500, neuronsPerOrg = 50) => {
      setIsCreating(true);
      try {
        const res = await fetch(`${API_BASE}/api/ecosystem/massive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            n_organisms: nOrganisms,
            neurons_per: neuronsPerOrg,
            world_type: type,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setMassiveId(data.id ?? null);
          setWorldType(type);
          notify?.(`Brain-world created (${nOrganisms} organisms)`);
        } else {
          notify?.('API unavailable — check server', 5000);
        }
      } catch {
        notify?.('API unavailable — check server', 5000);
      } finally {
        setIsCreating(false);
      }
    },
    [setIsCreating, setMassiveId, setWorldType, notify],
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#030308',
        overflow: 'hidden',
      }}
    >
      {/* World Creator overlay — shown when no world exists yet */}
      {!massiveId && (
        <>
          <WorldCreator
            onCreateWorld={(type, nOrg, _enableAI) =>
              createWorld(type, nOrg)
            }
            loading={isCreating}
          />

          {/* Local simulation connection panel — overlaid on WorldCreator */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 25,
              background: 'rgba(6, 8, 18, 0.92)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(80, 130, 200, 0.15)',
              borderRadius: 14,
              padding: '14px 20px',
              fontFamily: '"SF Mono", "Fira Code", monospace',
              minWidth: 380,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: 'rgba(140, 170, 200, 0.4)',
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              Or connect to a local simulation
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, justifyContent: 'center' }}>
              {(['cloud', 'local'] as const).map((mode) => {
                const isActive =
                  (mode === 'local' && localConnStatus !== 'idle') ||
                  (mode === 'cloud' && localConnStatus === 'idle');
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      if (mode === 'cloud') {
                        setLocalConnStatus('idle');
                      }
                    }}
                    style={{
                      padding: '4px 14px',
                      fontSize: 10,
                      fontWeight: isActive ? 600 : 400,
                      background: isActive
                        ? mode === 'local'
                          ? 'rgba(255, 180, 80, 0.12)'
                          : 'rgba(0, 212, 255, 0.1)'
                        : 'rgba(100, 130, 200, 0.04)',
                      border: `1px solid ${
                        isActive
                          ? mode === 'local'
                            ? 'rgba(255, 180, 80, 0.3)'
                            : 'rgba(0, 212, 255, 0.2)'
                          : 'rgba(80, 130, 200, 0.08)'
                      }`,
                      borderRadius: 8,
                      color: isActive
                        ? mode === 'local'
                          ? '#ffb450'
                          : '#00d4ff'
                        : 'rgba(140, 170, 200, 0.5)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            {/* URL input + connect */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={localUrlInput}
                onChange={(e) => setLocalUrlInput(e.target.value)}
                placeholder="ws://localhost:8765"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(80, 130, 200, 0.15)',
                  borderRadius: 6,
                  color: '#dce4ec',
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') connectLocal(localUrlInput);
                }}
              />
              <button
                onClick={() => connectLocal(localUrlInput)}
                disabled={localConnStatus === 'connecting'}
                style={{
                  padding: '6px 16px',
                  fontSize: 11,
                  fontWeight: 600,
                  background:
                    localConnStatus === 'connected'
                      ? 'rgba(0, 255, 136, 0.12)'
                      : localConnStatus === 'failed'
                        ? 'rgba(255, 80, 80, 0.12)'
                        : 'rgba(255, 180, 80, 0.12)',
                  border: `1px solid ${
                    localConnStatus === 'connected'
                      ? 'rgba(0, 255, 136, 0.3)'
                      : localConnStatus === 'failed'
                        ? 'rgba(255, 80, 80, 0.3)'
                        : 'rgba(255, 180, 80, 0.3)'
                  }`,
                  borderRadius: 6,
                  color:
                    localConnStatus === 'connected'
                      ? '#00ff88'
                      : localConnStatus === 'failed'
                        ? '#ff5050'
                        : '#ffb450',
                  cursor:
                    localConnStatus === 'connecting' ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {localConnStatus === 'connecting'
                  ? 'Connecting...'
                  : localConnStatus === 'connected'
                    ? 'Connected'
                    : localConnStatus === 'failed'
                      ? 'Retry'
                      : 'Connect'}
              </button>
            </div>

            {/* Connection status hint */}
            <div
              style={{
                fontSize: 9,
                color:
                  localConnStatus === 'connected'
                    ? 'rgba(0, 255, 136, 0.5)'
                    : localConnStatus === 'failed'
                      ? 'rgba(255, 80, 80, 0.5)'
                      : 'rgba(140, 170, 200, 0.3)',
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              {localConnStatus === 'idle' &&
                'Connect to a simulation running on your machine'}
              {localConnStatus === 'connecting' &&
                'Opening WebSocket connection...'}
              {localConnStatus === 'connected' &&
                'Streaming from local simulation'}
              {localConnStatus === 'failed' &&
                'Connection failed. Is the simulation running?'}
            </div>
          </div>
        </>
      )}

      {/* 3D Canvas — always present */}
      <Canvas
        camera={{
          fov: 50,
          near: 0.1,
          far: 300,
          position: [0, -15, 45],
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#030308']} />
        <fog attach="fog" args={['#030308', 30, 100]} />
        <SceneContents />
      </Canvas>

      {/* HTML overlays */}
      {massiveId && (
        <>
          <HudOverlay />
          <ZoomBreadcrumb />
          <SpeedControl sendCommand={sendCommand} />

          {/* Divine Interventions — left sidebar */}
          <LeftSidebar massiveId={massiveId} notify={notify} />

          {/* Context-sensitive sidebar */}
          <ContextSidebar
            massiveId={massiveId}
            sendCommand={sendCommand}
            notify={notify}
          />

          {/* AI Integration Layer */}
          <AIHighlighter />
          <AINotifications />
          <AITicker />

          {/* God Agent chat */}
          <GodChat bwId={massiveId} />

          {/* Evolution timeline — positioned above AI ticker and status bar */}
          <div
            style={{
              position: 'absolute',
              bottom: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <EvolutionTimeline width={340} height={100} />
          </div>
        </>
      )}

      {/* Status bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 24,
          background: 'rgba(3,3,8,0.9)',
          borderTop: '1px solid rgba(80,130,200,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontSize: 10,
          fontFamily: '"SF Mono", "Fira Code", monospace',
          color: 'rgba(100,130,170,0.5)',
          zIndex: 10,
        }}
      >
        {massiveId ? (
          <>
            <span>
              {storeConnectionMode === 'local' ? 'BRAIN-WORLD LOCAL' : 'BRAIN-WORLD LIVE'}
              {' '}&mdash; {population.toLocaleString()} organisms
            </span>
            {neuralStats && (
              <span>
                &mdash; {neuralStats.total_neurons.toLocaleString()} neurons
              </span>
            )}
            {storeConnectionMode === 'local' && (
              <span style={{ color: 'rgba(255, 180, 80, 0.5)' }}>
                &mdash; {localWsUrl}
              </span>
            )}
          </>
        ) : (
          <span>Create a brain-world to begin</span>
        )}
      </div>
    </div>
  );
}
