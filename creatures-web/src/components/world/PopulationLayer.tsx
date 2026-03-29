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

      const baseScale = isCelegans ? 0.3 : 0.25;
      const scale = baseScale * (0.4 + e * 0.8);
      const heading =
        Math.atan2(org.y, org.x + 0.001) + Math.sin(t * 2 + i * 1.7) * 0.3;

      // Fitness elevation: thriving organisms float slightly higher
      const zElevation = e * 0.3;

      _obj.position.set(org.x, org.y, 0.05 + zElevation);

      // Selected organism pulses larger
      const isSelected = selectedIndex === i;
      const isHighlighted = highlightedIndices?.has(i) ?? false;
      const selectionScale = isSelected
        ? 1.5 + 0.2 * Math.sin(t * 4)
        : isHighlighted
          ? 1.3 + 0.15 * Math.sin(t * 3)
          : 1;

      if (isCelegans) {
        _obj.scale.set(scale * 2.8 * selectionScale, scale * selectionScale, scale * selectionScale);
      } else {
        _obj.scale.set(scale * 1.4 * selectionScale, scale * selectionScale, scale * selectionScale);
      }
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
      } else {
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
    const g = new THREE.SphereGeometry(1, 8, 6);
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
        emissive: new THREE.Color(0xffcc66),
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.15,
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
// Arena Environment
// ---------------------------------------------------------------------------

const GRID_DIVISIONS = 20;

const GROUND_COLORS: Record<string, string> = {
  soil: '#1a0f08',
  pond: '#061828',
  lab_plate: '#1a1a1a',
  abstract: '#080810',
};

const GRID_STYLES: Record<string, { color: number; opacity: number; divisions: number }> = {
  soil: { color: 0x3a2510, opacity: 0.06, divisions: GRID_DIVISIONS },
  pond: { color: 0x1e3260, opacity: 0.1, divisions: GRID_DIVISIONS },
  lab_plate: { color: 0x404040, opacity: 0.15, divisions: GRID_DIVISIONS * 2 },
  abstract: { color: 0x1e3250, opacity: 0.08, divisions: GRID_DIVISIONS },
};

const BOUNDARY_COLORS: Record<string, number> = {
  soil: 0x5a3820,
  pond: 0x2848a0,
  lab_plate: 0x606060,
  abstract: 0x284678,
};

export function Arena({ worldType, arenaRadius }: { worldType: string; arenaRadius: number }) {
  const groundColor = GROUND_COLORS[worldType] ?? GROUND_COLORS.abstract;
  const gridStyle = GRID_STYLES[worldType] ?? GRID_STYLES.abstract;
  const boundaryColor = BOUNDARY_COLORS[worldType] ?? BOUNDARY_COLORS.abstract;

  return (
    <>
      <mesh rotation={[0, 0, 0]} position={[0, 0, -0.01]}>
        <circleGeometry args={[arenaRadius, 64]} />
        <meshStandardMaterial color={groundColor} roughness={1} />
      </mesh>

      <gridHelper
        args={[arenaRadius * 2, gridStyle.divisions, gridStyle.color, gridStyle.color]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.001]}
      >
        <meshBasicMaterial
          attach="material"
          color={gridStyle.color}
          opacity={gridStyle.opacity}
          transparent
          depthWrite={false}
        />
      </gridHelper>

      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[arenaRadius - 0.08, arenaRadius, 64]} />
        <meshBasicMaterial color={boundaryColor} opacity={0.35} transparent depthWrite={false} />
      </mesh>
    </>
  );
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
