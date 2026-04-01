import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorldStore, type ColorMode } from '../../stores/worldStore';
import type { MassiveOrganism, MassiveNeuralStats } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ORGANISMS = 2048;
const MAX_TRAIL_ORGANISMS = 20;
const MAX_TRAIL_LENGTH = 10;
const MAX_TRAIL_VERTS = MAX_TRAIL_ORGANISMS * (MAX_TRAIL_LENGTH - 1) * 2;
const MAX_CHASE_LINES = 50;  // max chase pairs to render
const MAX_CHASE_VERTS = MAX_CHASE_LINES * 2;
const MAX_FOOD = 256;

const HEATMAP_RESOLUTION = 48;

// Shared temp objects — avoid per-frame allocation
const _obj = new THREE.Object3D();
const _color = new THREE.Color();

/** Hash a string to a numeric value for lineage coloring */
function hashStringToNumber(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// Organism Instances (instanced mesh rendering)
// ---------------------------------------------------------------------------

export function OrganismInstances({
  organisms,
  neuralStats,
  colorMode,
  onSelectOrganism,
  selectedIndex,
  highlightedIndices,
}: {
  organisms: MassiveOrganism[];
  neuralStats: MassiveNeuralStats | null;
  colorMode: ColorMode;
  onSelectOrganism?: (index: number, org: MassiveOrganism) => void;
  selectedIndex?: number | null;
  highlightedIndices?: Set<number>;
}) {
  const elegansRef = useRef<THREE.InstancedMesh>(null);
  const drosophilaRef = useRef<THREE.InstancedMesh>(null);

  const elegansColors = useMemo(() => new Float32Array(MAX_ORGANISMS * 3), []);
  const drosophilaColors = useMemo(() => new Float32Array(MAX_ORGANISMS * 3), []);

  // Map from instance index back to organism array index
  const elegansIndexMap = useRef<number[]>([]);
  const drosophilaIndexMap = useRef<number[]>([]);

  useFrame(({ clock }) => {
    const eMesh = elegansRef.current;
    const dMesh = drosophilaRef.current;
    if (!eMesh || !dMesh) return;

    const t = clock.getElapsedTime();
    const firingGlow = neuralStats
      ? Math.min(1, neuralStats.mean_firing_rate / 0.3)
      : 0;

    let eIdx = 0;
    let dIdx = 0;
    elegansIndexMap.current.length = 0;
    drosophilaIndexMap.current.length = 0;

    for (let i = 0; i < organisms.length; i++) {
      const org = organisms[i];
      const isCelegans = org.species === 0;

      const normalizedEnergy = Math.min(1, Math.max(0, org.energy / 200));
      const glowBoost =
        firingGlow * 0.15 * (0.7 + 0.3 * Math.sin(t * 6 + org.x * 0.4 + org.y * 0.4));
      const e = Math.min(1, normalizedEnergy + glowBoost);

      // Dead organisms: scale to 0
      if (e < 0.01) {
        _obj.scale.set(0, 0, 0);
        _obj.updateMatrix();
        if (isCelegans) {
          eMesh.setMatrixAt(eIdx, _obj.matrix);
          elegansColors[eIdx * 3] = 0;
          elegansColors[eIdx * 3 + 1] = 0;
          elegansColors[eIdx * 3 + 2] = 0;
          elegansIndexMap.current.push(i);
          eIdx++;
        } else {
          dMesh.setMatrixAt(dIdx, _obj.matrix);
          drosophilaColors[dIdx * 3] = 0;
          drosophilaColors[dIdx * 3 + 1] = 0;
          drosophilaColors[dIdx * 3 + 2] = 0;
          drosophilaIndexMap.current.push(i);
          dIdx++;
        }
        continue;
      }

      // Predators are larger and more imposing; prey are smaller, elongated
      const baseScale = isCelegans ? 0.25 : 0.4;
      const scale = baseScale * (0.4 + e * 0.8);
      const heading =
        Math.atan2(org.y, org.x + 0.001) + Math.sin(t * 2 + i * 1.7) * 0.3;

      // 3D position: use z from backend + energy elevation
      const orgZ = (org.z ?? 0) + 0.05 + e * 0.3;
      _obj.position.set(org.x, org.y, orgZ);

      // Selected organism pulses larger
      const isSelected = selectedIndex === i;
      const isHighlighted = highlightedIndices?.has(i) ?? false;
      const selectionScale = isSelected
        ? 1.5 + 0.2 * Math.sin(t * 4)
        : isHighlighted
          ? 1.3 + 0.15 * Math.sin(t * 3)
          : 1;

      // Body scale from morphology (if available)
      const bodyLength = org.body_length ?? (isCelegans ? 2.8 : 1.4);
      const bodyWidth = org.body_width ?? 1.0;
      _obj.scale.set(
        scale * bodyLength * selectionScale,
        scale * bodyWidth * selectionScale,
        scale * (org.body_height ?? 1.0) * selectionScale,
      );
      _obj.rotation.set(0, 0, heading);
      _obj.updateMatrix();

      // Color calculation
      const generation = org.generation ?? 0;
      const genFactor = Math.min(generation / 50, 1);

      let r: number, g: number, b: number;

      if (colorMode === 'lineage') {
        const lineageHash = hashStringToNumber(org.lineage_id ?? `${i}`);
        const hue = (lineageHash * 137.508) % 360;
        const lightness = 0.5 + e * 0.2;
        _color.setHSL(hue / 360, 0.7, lightness);
        r = _color.r;
        g = _color.g;
        b = _color.b;
      } else if (org.color_hue !== undefined) {
        // Evolved color from morphology with species tinting
        // Predators: warm bias (hue rotated toward red/orange), higher saturation
        // Prey: cool bias (hue rotated toward blue/cyan), softer
        const hueBase = org.color_hue / 360;
        const hue = isCelegans
          ? (hueBase * 0.4 + 0.5) % 1.0   // prey: blue-cyan-green range
          : (hueBase * 0.3 + 0.0) % 1.0;  // predators: red-orange-yellow range
        const sat = isCelegans ? 0.5 : 0.75;
        _color.setHSL(hue, sat, 0.3 + e * 0.4);
        r = _color.r;
        g = _color.g;
        b = _color.b;
      } else {
        // Fallback to species-based colors
        const dyingR = 0.7, dyingG = 0.08, dyingB = 0.05;
        const thriveR = 1.4, thriveG = 1.3, thriveB = 0.9;
        const baseR = isCelegans ? 0.15 : 0.9;
        const baseG = isCelegans ? 0.75 : 0.55;
        const baseB = isCelegans ? 1.0 : 0.1;

        if (e < 0.3) {
          const f = e / 0.3;
          r = dyingR * (1 - f) + baseR * f;
          g = dyingG * (1 - f) + baseG * f;
          b = dyingB * (1 - f) + baseB * f;
        } else if (e > 0.7) {
          const f = (e - 0.7) / 0.3;
          r = baseR * (1 - f) + thriveR * f;
          g = baseG * (1 - f) + thriveG * f;
          b = baseB * (1 - f) + thriveB * f;
        } else {
          r = baseR;
          g = baseG;
          b = baseB;
        }
        r = r * (1 - genFactor * 0.3) + 1.0 * genFactor * 0.3;
        g = g * (1 - genFactor * 0.3) + 0.85 * genFactor * 0.3;
        b = b * (1 - genFactor * 0.3) + 0.15 * genFactor * 0.3;
      }

      // Highlighted organisms get brighter ring
      if (isHighlighted || isSelected) {
        r = Math.min(r * 1.5, 1.5);
        g = Math.min(g * 1.5, 1.5);
        b = Math.min(b * 1.5, 1.5);
      }

      _color.setRGB(r, g, b);

      if (isCelegans) {
        eMesh.setMatrixAt(eIdx, _obj.matrix);
        elegansColors[eIdx * 3] = _color.r;
        elegansColors[eIdx * 3 + 1] = _color.g;
        elegansColors[eIdx * 3 + 2] = _color.b;
        elegansIndexMap.current.push(i);
        eIdx++;
      } else {
        dMesh.setMatrixAt(dIdx, _obj.matrix);
        drosophilaColors[dIdx * 3] = _color.r;
        drosophilaColors[dIdx * 3 + 1] = _color.g;
        drosophilaColors[dIdx * 3 + 2] = _color.b;
        drosophilaIndexMap.current.push(i);
        dIdx++;
      }
    }

    // Hide unused
    _obj.scale.set(0, 0, 0);
    _obj.updateMatrix();
    for (let j = eIdx; j < MAX_ORGANISMS; j++) eMesh.setMatrixAt(j, _obj.matrix);
    for (let j = dIdx; j < MAX_ORGANISMS; j++) dMesh.setMatrixAt(j, _obj.matrix);

    eMesh.count = eIdx;
    dMesh.count = dIdx;
    eMesh.instanceMatrix.needsUpdate = true;
    dMesh.instanceMatrix.needsUpdate = true;

    // Update colors
    const eColorAttr = eMesh.geometry.getAttribute('color') as THREE.InstancedBufferAttribute | null;
    if (eColorAttr) {
      (eColorAttr.array as Float32Array).set(elegansColors);
      eColorAttr.needsUpdate = true;
    }
    const dColorAttr = dMesh.geometry.getAttribute('color') as THREE.InstancedBufferAttribute | null;
    if (dColorAttr) {
      (dColorAttr.array as Float32Array).set(drosophilaColors);
      dColorAttr.needsUpdate = true;
    }
  });

  const elegansGeom = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.8, 1.2, 4, 8);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', attr);
    return g;
  }, []);

  const drosophilaGeom = useMemo(() => {
    // Predators: wider, spikier shape — visually threatening
    const g = new THREE.SphereGeometry(1.2, 6, 5);
    g.scale(1.3, 0.9, 1.1);  // wider and flatter — aggressive silhouette
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', attr);
    return g;
  }, []);

  const elegansMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0x88ccff),
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.15,
        toneMapped: false,
      }),
    [],
  );

  const drosophilaMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0xff6622),  // aggressive orange-red glow
        emissiveIntensity: 1.0,
        roughness: 0.3,
        metalness: 0.25,
        toneMapped: false,
      }),
    [],
  );

  const handleClick = (species: 'elegans' | 'drosophila', instanceId: number | undefined) => {
    if (instanceId === undefined || !onSelectOrganism) return;
    const map = species === 'elegans' ? elegansIndexMap.current : drosophilaIndexMap.current;
    const orgIndex = map[instanceId];
    if (orgIndex !== undefined && organisms[orgIndex]) {
      onSelectOrganism(orgIndex, organisms[orgIndex]);
    }
  };

  return (
    <>
      <instancedMesh
        ref={elegansRef}
        args={[elegansGeom, elegansMat, MAX_ORGANISMS]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          handleClick('elegans', e.instanceId);
        }}
      />
      <instancedMesh
        ref={drosophilaRef}
        args={[drosophilaGeom, drosophilaMat, MAX_ORGANISMS]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          handleClick('drosophila', e.instanceId);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Organism Movement Trails
// ---------------------------------------------------------------------------

export function OrganismTrails({ organisms }: { organisms: MassiveOrganism[] }) {
  const trailsRef = useRef<Map<string, Array<[number, number]>>>(new Map());
  const frameCountRef = useRef(0);
  const lineRef = useRef<THREE.LineSegments>(null);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_VERTS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_VERTS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame(() => {
    frameCountRef.current++;
    if (frameCountRef.current % 12 === 0) {
      const topOrgs = [...organisms]
        .sort((a, b) => b.energy - a.energy)
        .slice(0, MAX_TRAIL_ORGANISMS);

      topOrgs.forEach((org, i) => {
        const key = org.lineage_id ?? `idx-${i}`;
        const trail = trailsRef.current.get(key) ?? [];
        trail.push([org.x, org.y]);
        if (trail.length > MAX_TRAIL_LENGTH) trail.shift();
        trailsRef.current.set(key, trail);
      });

      const activeKeys = new Set(
        topOrgs.map((o, i) => o.lineage_id ?? `idx-${i}`),
      );
      for (const key of trailsRef.current.keys()) {
        if (!activeKeys.has(key)) trailsRef.current.delete(key);
      }
    }

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    let vertIdx = 0;

    const topOrgs = [...organisms]
      .sort((a, b) => b.energy - a.energy)
      .slice(0, MAX_TRAIL_ORGANISMS);

    topOrgs.forEach((org, i) => {
      const key = org.lineage_id ?? `idx-${i}`;
      const trail = trailsRef.current.get(key);
      if (!trail || trail.length < 2) return;

      const isCelegans = org.species === 0;
      const baseR = isCelegans ? 0.15 : 0.9;
      const baseG = isCelegans ? 0.75 : 0.55;
      const baseB = isCelegans ? 1.0 : 0.1;

      for (let j = 0; j < trail.length - 1; j++) {
        if (vertIdx >= MAX_TRAIL_VERTS) break;
        const age = j / (trail.length - 1);
        const fade = 0.2 + age * 0.8;

        posArr[vertIdx * 3] = trail[j][0];
        posArr[vertIdx * 3 + 1] = trail[j][1];
        posArr[vertIdx * 3 + 2] = 0.03;
        colArr[vertIdx * 3] = baseR * fade;
        colArr[vertIdx * 3 + 1] = baseG * fade;
        colArr[vertIdx * 3 + 2] = baseB * fade;
        vertIdx++;

        posArr[vertIdx * 3] = trail[j + 1][0];
        posArr[vertIdx * 3 + 1] = trail[j + 1][1];
        posArr[vertIdx * 3 + 2] = 0.03;
        colArr[vertIdx * 3] = baseR * fade;
        colArr[vertIdx * 3 + 1] = baseG * fade;
        colArr[vertIdx * 3 + 2] = baseB * fade;
        vertIdx++;
      }
    });

    for (let k = vertIdx * 3; k < posArr.length; k++) {
      posArr[k] = 0;
      colArr[k] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geom.setDrawRange(0, vertIdx);
  });

  return <lineSegments ref={lineRef} geometry={geom} material={mat} />;
}

// ---------------------------------------------------------------------------
// Chase Lines (predator-prey pursuit visualization)
// ---------------------------------------------------------------------------

export function ChaseLines() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const chases = useWorldStore((s) => s.chases);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CHASE_VERTS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_CHASE_VERTS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
        linewidth: 1,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    let vertIdx = 0;

    const t = clock.getElapsedTime();
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);  // pulsing chase lines

    for (const chase of chases) {
      if (vertIdx >= MAX_CHASE_VERTS) break;

      // Predator end (red/orange)
      posArr[vertIdx * 3] = chase.px;
      posArr[vertIdx * 3 + 1] = chase.py;
      posArr[vertIdx * 3 + 2] = 0.15;
      colArr[vertIdx * 3] = 1.0;
      colArr[vertIdx * 3 + 1] = 0.2 * pulse;
      colArr[vertIdx * 3 + 2] = 0.05;
      vertIdx++;

      // Prey end (yellow/white — danger)
      posArr[vertIdx * 3] = chase.vx;
      posArr[vertIdx * 3 + 1] = chase.vy;
      posArr[vertIdx * 3 + 2] = 0.15;
      colArr[vertIdx * 3] = 1.0;
      colArr[vertIdx * 3 + 1] = 0.8 * pulse;
      colArr[vertIdx * 3 + 2] = 0.2 * pulse;
      vertIdx++;
    }

    // Zero out unused vertices
    for (let k = vertIdx * 3; k < posArr.length; k++) {
      posArr[k] = 0;
      colArr[k] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geom.setDrawRange(0, vertIdx);
  });

  return <lineSegments ref={lineRef} geometry={geom} material={mat} />;
}

// ---------------------------------------------------------------------------
// Kill Effects (death particle bursts at predation sites)
// ---------------------------------------------------------------------------

const MAX_KILL_PARTICLES = 200;  // 10 particles per kill × 20 kills

export function KillEffects() {
  const kills = useWorldStore((s) => s.kills);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geom = useMemo(() => new THREE.SphereGeometry(0.06, 4, 4), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  // Each kill event spawns 8 particles with random velocities
  const particlesRef = useRef<Array<{
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    born: number;
  }>>([]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const now = clock.getElapsedTime() * 1000;

    // Spawn particles for new kills
    for (const kill of kills) {
      // Only spawn once per kill (check if we already have particles near this position)
      const age = Date.now() - kill.time;
      if (age > 200) continue;  // only spawn for kills < 200ms old
      if (age < 0) continue;

      // Check if we already spawned for this kill
      const already = particlesRef.current.some(
        (p) => Math.abs(p.x - kill.x) < 0.1 && Math.abs(p.y - kill.y) < 0.1 && now - p.born < 300,
      );
      if (already) continue;

      // Spawn 8 particles radiating outward
      for (let j = 0; j < 8; j++) {
        const angle = (j / 8) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 0.8 + Math.random() * 1.2;
        particlesRef.current.push({
          x: kill.x, y: kill.y, z: 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          vz: 0.5 + Math.random() * 0.5,
          born: now,
        });
      }
    }

    // Update and render particles
    let idx = 0;
    const toKeep: typeof particlesRef.current = [];

    for (const p of particlesRef.current) {
      const age = (now - p.born) / 1000;  // seconds
      if (age > 0.8 || idx >= MAX_KILL_PARTICLES) continue;

      // Physics: expand + gravity
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age;
      const z = Math.max(0, p.z + p.vz * age - 2.0 * age * age);

      // Fade out
      const fade = 1.0 - age / 0.8;
      const scale = 0.5 + age * 2.0;

      _obj.position.set(x, y, z);
      _obj.scale.setScalar(scale * fade);
      _obj.updateMatrix();
      mesh.setMatrixAt(idx, _obj.matrix);
      idx++;
      toKeep.push(p);
    }

    particlesRef.current = toKeep;

    // Hide unused instances
    for (let i = idx; i < MAX_KILL_PARTICLES; i++) {
      _obj.position.set(0, -999, 0);
      _obj.scale.setScalar(0);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = MAX_KILL_PARTICLES;

    // Pulse the material color between red and orange
    const t = clock.getElapsedTime();
    const r = 1.0;
    const g = 0.1 + 0.2 * Math.sin(t * 8);
    (mat as THREE.MeshBasicMaterial).color.setRGB(r, g, 0.0);
    (mat as THREE.MeshBasicMaterial).opacity = 0.85;
  });

  return (
    <instancedMesh ref={meshRef} args={[geom, mat, MAX_KILL_PARTICLES]} frustumCulled={false} />
  );
}

// ---------------------------------------------------------------------------
// Food Instances
// ---------------------------------------------------------------------------

export function FoodInstances({
  organismCount,
  arenaRadius,
  food,
}: {
  organismCount: number;
  arenaRadius: number;
  food?: { x: number; y: number }[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const hasRealFood = food && food.length > 0;
  const foodCount = hasRealFood
    ? Math.min(MAX_FOOD, food.length)
    : Math.min(MAX_FOOD, Math.max(12, Math.floor(organismCount * 0.15)));

  const fallbackPositions = useMemo(() => {
    const pos: [number, number][] = [];
    const count = Math.min(MAX_FOOD, Math.max(12, Math.floor(organismCount * 0.15)));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + i * 2.39996;
      const r = Math.sqrt((i + 1) / (count + 1)) * arenaRadius * 0.85;
      pos.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    return pos;
  }, [organismCount, arenaRadius]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < foodCount; i++) {
      const pulse = 0.3 + 0.1 * Math.sin(t * 2.5 + i * 1.3);
      const fx = hasRealFood ? food[i].x : fallbackPositions[i]?.[0] ?? 0;
      const fy = hasRealFood ? food[i].y : fallbackPositions[i]?.[1] ?? 0;
      _obj.position.set(fx, fy, 0.02);
      _obj.scale.set(pulse, pulse, pulse);
      _obj.rotation.set(0, 0, 0);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
    }
    _obj.scale.set(0, 0, 0);
    _obj.updateMatrix();
    for (let j = foodCount; j < MAX_FOOD; j++) {
      mesh.setMatrixAt(j, _obj.matrix);
    }
    mesh.count = foodCount;
    mesh.instanceMatrix.needsUpdate = true;
  });

  const geom = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x44ff88,
        emissive: new THREE.Color(0x44ff88),
        emissiveIntensity: 2.0,
        roughness: 0.2,
        toneMapped: false,
      }),
    [],
  );

  return (
    <instancedMesh ref={meshRef} args={[geom, mat, MAX_FOOD]} frustumCulled={false} />
  );
}

// ---------------------------------------------------------------------------
// Arena Environment — Terrain-based
// ---------------------------------------------------------------------------

const BOUNDARY_COLORS: Record<string, number> = {
  soil: 0x5a3820,
  pond: 0x2848a0,
  lab_plate: 0x606060,
  abstract: 0x284678,
};

/** Height function for procedural terrain */
function terrainHeight(x: number, y: number): number {
  return 0.5 * Math.sin(x * 0.3) * Math.cos(y * 0.2) + 0.3 * Math.sin(x * 0.5 + y * 0.3);
}

/** Normalize terrain height to 0..1 range for coloring */
function normalizedHeight(h: number): number {
  // terrainHeight range is roughly -0.8..+0.8, map to 0..1
  return Math.max(0, Math.min(1, (h + 0.8) / 1.6));
}

/** Get vertex color based on world type and normalized height */
function getTerrainColor(worldType: string, t: number, color: THREE.Color): void {
  switch (worldType) {
    case 'pond': {
      // deep blue (low) -> teal (mid) -> sandy (high)
      if (t < 0.5) {
        const f = t / 0.5;
        color.setRGB(0.02 + f * 0.02, 0.06 + f * 0.2, 0.15 + f * 0.2);
      } else {
        const f = (t - 0.5) / 0.5;
        color.setRGB(0.04 + f * 0.45, 0.26 + f * 0.35, 0.35 - f * 0.1);
      }
      break;
    }
    case 'soil': {
      // dark brown (low) -> warm brown (mid) -> green (high)
      if (t < 0.5) {
        const f = t / 0.5;
        color.setRGB(0.08 + f * 0.1, 0.04 + f * 0.06, 0.02 + f * 0.02);
      } else {
        const f = (t - 0.5) / 0.5;
        color.setRGB(0.18 - f * 0.06, 0.1 + f * 0.18, 0.04 + f * 0.02);
      }
      break;
    }
    case 'lab_plate': {
      // uniform gray with subtle variation
      const base = 0.1 + t * 0.04;
      color.setRGB(base, base, base * 1.05);
      break;
    }
    default: {
      // abstract: dark purple -> blue -> cyan
      if (t < 0.5) {
        const f = t / 0.5;
        color.setRGB(0.04 + f * 0.01, 0.02 + f * 0.04, 0.08 + f * 0.12);
      } else {
        const f = (t - 0.5) / 0.5;
        color.setRGB(0.05 - f * 0.02, 0.06 + f * 0.12, 0.2 + f * 0.15);
      }
      break;
    }
  }
}

const TERRAIN_SUBDIVISIONS = 64;

export function TerrainArena({ worldType, arenaRadius }: { worldType: string; arenaRadius: number }) {
  const boundaryColor = BOUNDARY_COLORS[worldType] ?? BOUNDARY_COLORS.abstract;
  const waterRef = useRef<THREE.Mesh>(null);

  // Build terrain geometry with height map and vertex colors
  const terrainGeom = useMemo(() => {
    const size = arenaRadius * 2;
    const geom = new THREE.PlaneGeometry(size, size, TERRAIN_SUBDIVISIONS, TERRAIN_SUBDIVISIONS);
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tempColor = new THREE.Color();
    const radiusSq = arenaRadius * arenaRadius;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const distSq = x * x + y * y;

      // Apply height — scale to 0-2 units
      let h = terrainHeight(x, y);
      // Fade height to 0 at arena boundary for clean edge
      const edgeFade = Math.max(0, 1 - distSq / radiusSq);
      h *= edgeFade;
      // Scale height to 0-2 range (the raw function gives roughly -0.8..0.8)
      const scaledH = (h + 0.8) * (2 / 1.6);
      pos.setZ(i, scaledH * edgeFade);

      // Vertex color based on normalized height
      const nh = normalizedHeight(h);
      getTerrainColor(worldType, nh, tempColor);

      // Darken vertices outside the arena circle
      if (distSq > radiusSq * 0.95) {
        const fade = Math.max(0, 1 - (distSq - radiusSq * 0.95) / (radiusSq * 0.05));
        tempColor.multiplyScalar(fade);
      }

      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }, [worldType, arenaRadius]);

  const terrainMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Water plane material for pond worlds
  const waterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x1a5588,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        metalness: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Animate water opacity
  useFrame(({ clock }) => {
    if (waterRef.current && worldType === 'pond') {
      const mat = waterRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.3 + 0.05 * Math.sin(clock.getElapsedTime() * 0.5);
    }
  });

  return (
    <>
      {/* Terrain mesh */}
      <mesh geometry={terrainGeom} material={terrainMat} position={[0, 0, -0.5]} />

      {/* Water plane for pond worlds */}
      {worldType === 'pond' && (
        <mesh ref={waterRef} position={[0, 0, 0.1]} material={waterMat}>
          <circleGeometry args={[arenaRadius * 0.98, 64]} />
        </mesh>
      )}

      {/* Subtle boundary ring */}
      <mesh position={[0, 0, 0.05]}>
        <ringGeometry args={[arenaRadius - 0.12, arenaRadius, 64]} />
        <meshBasicMaterial color={boundaryColor} opacity={0.15} transparent depthWrite={false} />
      </mesh>
    </>
  );
}

// Keep Arena as an alias for backward compatibility
export const Arena = TerrainArena;

// ---------------------------------------------------------------------------
// Ambient Particles — floating spores / energy motes
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 200;

export function AmbientParticles({ arenaRadius }: { arenaRadius: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  // Initialize particle positions and per-particle phase offsets
  const { positions, phases } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const ph = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * arenaRadius * 0.9;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = Math.sin(angle) * r;
      pos[i * 3 + 2] = Math.random() * 4 + 0.5;
      ph[i] = Math.random() * Math.PI * 2;
    }
    return { positions: pos, phases: ph };
  }, [arenaRadius]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: 0x44ffaa,
        size: 0.1,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const t = clock.getElapsedTime();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Gentle upward drift with sinusoidal variation
      arr[i * 3 + 2] += 0.01 * Math.sin(t + phases[i]);

      // Reset particles that drift too high
      if (arr[i * 3 + 2] > 6) {
        arr[i * 3 + 2] = 0.5;
      }

      // Subtle horizontal sway
      arr[i * 3] += 0.003 * Math.sin(t * 0.7 + phases[i] * 2);
      arr[i * 3 + 1] += 0.003 * Math.cos(t * 0.5 + phases[i] * 3);
    }

    posAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geom} material={mat} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Density Heatmap (rendered as a textured plane beneath organisms)
// ---------------------------------------------------------------------------

export function DensityHeatmap({
  organisms,
  arenaRadius,
}: {
  organisms: MassiveOrganism[];
  arenaRadius: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const frameCountRef = useRef(0);

  const texture = useMemo(() => {
    const size = HEATMAP_RESOLUTION;
    const data = new Uint8Array(size * size * 4);
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useFrame(() => {
    frameCountRef.current++;
    // Update heatmap every 30 frames for performance
    if (frameCountRef.current % 30 !== 0 || organisms.length === 0) return;

    const size = HEATMAP_RESOLUTION;
    const data = texture.image.data as Uint8Array;
    const grid = new Float32Array(size * size);

    // Accumulate organism positions into grid
    for (const org of organisms) {
      const gx = Math.floor(((org.x + arenaRadius) / (arenaRadius * 2)) * size);
      const gy = Math.floor(((org.y + arenaRadius) / (arenaRadius * 2)) * size);
      if (gx >= 0 && gx < size && gy >= 0 && gy < size) {
        grid[gy * size + gx] += 1;
      }
    }

    // 5x5 Gaussian blur for smooth appearance
    // Approximate Gaussian kernel weights (sigma ~1.0)
    const kernel = [
      1, 4, 7, 4, 1,
      4, 16, 26, 16, 4,
      7, 26, 41, 26, 7,
      4, 16, 26, 16, 4,
      1, 4, 7, 4, 1,
    ];
    const kernelSum = 273;
    const blurred = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let ky = -2; ky <= 2; ky++) {
          for (let kx = -2; kx <= 2; kx++) {
            const nx = x + kx;
            const ny = y + ky;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              sum += grid[ny * size + nx] * kernel[(ky + 2) * 5 + (kx + 2)];
            }
          }
        }
        blurred[y * size + x] = sum / kernelSum;
      }
    }

    // Find max for normalization
    let maxDensity = 0;
    for (let i = 0; i < blurred.length; i++) {
      if (blurred[i] > maxDensity) maxDensity = blurred[i];
    }
    if (maxDensity === 0) maxDensity = 1;

    // Write to texture: deep blue → teal/cyan → warm white/gold gradient
    for (let i = 0; i < size * size; i++) {
      const d = blurred[i] / maxDensity;
      const idx = i * 4;

      if (d < 0.01) {
        // Transparent where empty
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      } else {
        // Deep blue (0,20,80) → teal (0,160,200) → warm gold (255,220,140)
        let r: number, g: number, b: number;
        if (d < 0.5) {
          // Low → medium: deep blue to teal
          const t = d * 2; // 0..1
          r = Math.floor(0);
          g = Math.floor(20 + t * 140);
          b = Math.floor(80 + t * 120);
        } else {
          // Medium → high: teal to warm gold
          const t = (d - 0.5) * 2; // 0..1
          r = Math.floor(t * 255);
          g = Math.floor(160 + t * 60);
          b = Math.floor(200 - t * 60);
        }
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.floor(d * 70); // More visible
      }
    }

    texture.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.003]} rotation={[0, 0, 0]}>
      <planeGeometry args={[arenaRadius * 2, arenaRadius * 2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Lineage Rivers — connect organisms sharing the same lineage
// ---------------------------------------------------------------------------

const MAX_LINEAGE_LINES = 2000;

export function LineageRivers({ organisms }: { organisms: MassiveOrganism[] }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const frameCountRef = useRef(0);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINEAGE_LINES * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_LINEAGE_LINES * 6), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame(() => {
    frameCountRef.current++;
    // Update every 20 frames for perf
    if (frameCountRef.current % 20 !== 0) return;

    // Group organisms by lineage
    const lineageMap = new Map<string, number[]>();
    for (let i = 0; i < organisms.length; i++) {
      const lid = organisms[i].lineage_id;
      if (!lid) continue;
      if (!lineageMap.has(lid)) lineageMap.set(lid, []);
      lineageMap.get(lid)!.push(i);
    }

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    let vertIdx = 0;

    for (const [lid, indices] of lineageMap) {
      if (indices.length < 2 || vertIdx >= MAX_LINEAGE_LINES * 2) break;

      // Hash lineage to a color
      const hash = hashStringToNumber(lid);
      const hue = (hash * 137.508) % 360;
      _color.setHSL(hue / 360, 0.5, 0.4);

      // Connect nearest neighbors within lineage (max 3 connections per organism)
      for (let i = 0; i < Math.min(indices.length, 20); i++) {
        const a = organisms[indices[i]];
        // Find nearest sibling
        let minDist = Infinity;
        let nearestIdx = -1;
        for (let j = i + 1; j < Math.min(indices.length, 20); j++) {
          const b = organisms[indices[j]];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = dx * dx + dy * dy;
          if (d < minDist) {
            minDist = d;
            nearestIdx = j;
          }
        }

        if (nearestIdx >= 0 && minDist < 400) {
          // Max line length ~20 units
          const b = organisms[indices[nearestIdx]];
          if (vertIdx >= MAX_LINEAGE_LINES * 2) break;

          posArr[vertIdx * 3] = a.x;
          posArr[vertIdx * 3 + 1] = a.y;
          posArr[vertIdx * 3 + 2] = 0.015;
          colArr[vertIdx * 3] = _color.r;
          colArr[vertIdx * 3 + 1] = _color.g;
          colArr[vertIdx * 3 + 2] = _color.b;
          vertIdx++;

          posArr[vertIdx * 3] = b.x;
          posArr[vertIdx * 3 + 1] = b.y;
          posArr[vertIdx * 3 + 2] = 0.015;
          colArr[vertIdx * 3] = _color.r;
          colArr[vertIdx * 3 + 1] = _color.g;
          colArr[vertIdx * 3 + 2] = _color.b;
          vertIdx++;
        }
      }
    }

    // Zero unused
    for (let k = vertIdx * 3; k < posArr.length; k++) {
      posArr[k] = 0;
      colArr[k] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geom.setDrawRange(0, vertIdx);
  });

  return <lineSegments ref={lineRef} geometry={geom} material={mat} />;
}

// ---------------------------------------------------------------------------
// Species Territory Boundaries — convex hull outlines per species
// ---------------------------------------------------------------------------

const MAX_HULL_VERTS = 256;

/** Simple convex hull using gift wrapping (Jarvis march) */
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;

  // Find leftmost point
  let leftIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < points[leftIdx][0]) leftIdx = i;
  }

  const hull: [number, number][] = [];
  let current = leftIdx;
  const n = points.length;

  do {
    hull.push(points[current]);
    let next = 0;
    for (let i = 1; i < n; i++) {
      if (next === current) {
        next = i;
        continue;
      }
      const cross =
        (points[i][0] - points[current][0]) * (points[next][1] - points[current][1]) -
        (points[i][1] - points[current][1]) * (points[next][0] - points[current][0]);
      if (cross < 0) next = i;
    }
    current = next;
  } while (current !== leftIdx && hull.length < 100);

  return hull;
}

export function SpeciesTerritories({ organisms }: { organisms: MassiveOrganism[] }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const frameCountRef = useRef(0);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_HULL_VERTS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_HULL_VERTS * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        toneMapped: false,
        linewidth: 1,
      }),
    [],
  );

  useFrame(() => {
    frameCountRef.current++;
    // Update every 60 frames (once per second at 60fps)
    if (frameCountRef.current % 60 !== 0) return;

    // Separate species
    const elegansPoints: [number, number][] = [];
    const drosophilaPoints: [number, number][] = [];

    // Subsample for performance
    const step = Math.max(1, Math.floor(organisms.length / 200));
    for (let i = 0; i < organisms.length; i += step) {
      const org = organisms[i];
      if (org.energy < 1) continue;
      if (org.species === 0) elegansPoints.push([org.x, org.y]);
      else drosophilaPoints.push([org.x, org.y]);
    }

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    let vertIdx = 0;

    const drawHull = (
      points: [number, number][],
      r: number,
      g: number,
      b: number,
    ) => {
      if (points.length < 3) return;
      const hull = convexHull(points);
      if (hull.length < 3) return;

      for (let i = 0; i < hull.length; i++) {
        const next = (i + 1) % hull.length;
        if (vertIdx >= MAX_HULL_VERTS - 1) break;

        posArr[vertIdx * 3] = hull[i][0];
        posArr[vertIdx * 3 + 1] = hull[i][1];
        posArr[vertIdx * 3 + 2] = 0.01;
        colArr[vertIdx * 3] = r;
        colArr[vertIdx * 3 + 1] = g;
        colArr[vertIdx * 3 + 2] = b;
        vertIdx++;

        posArr[vertIdx * 3] = hull[next][0];
        posArr[vertIdx * 3 + 1] = hull[next][1];
        posArr[vertIdx * 3 + 2] = 0.01;
        colArr[vertIdx * 3] = r;
        colArr[vertIdx * 3 + 1] = g;
        colArr[vertIdx * 3 + 2] = b;
        vertIdx++;
      }
    };

    // C. elegans territory — cyan
    drawHull(elegansPoints, 0.0, 0.6, 0.8);
    // Drosophila territory — amber
    drawHull(drosophilaPoints, 0.8, 0.5, 0.1);

    // Zero unused
    for (let k = vertIdx * 3; k < posArr.length; k++) {
      posArr[k] = 0;
      colArr[k] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geom.setDrawRange(0, vertIdx);
  });

  return <lineSegments ref={lineRef} geometry={geom} material={mat} />;
}
