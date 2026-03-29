import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MassiveOrganism } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max organisms rendered at colony (mid) detail */
const MAX_COLONY_ORGANISMS = 64;

/** Camera distance within which organisms get colony-level detail */
const COLONY_RADIUS = 20;

/** Simplified worm: elongated capsule with 4 neural dots */
const WORM_SEGMENTS = 6;

// Shared temps
const _obj = new THREE.Object3D();
const _color = new THREE.Color();
const _camTarget = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Spatial hash for finding nearby organisms
// ---------------------------------------------------------------------------

function findNearbyOrganisms(
  organisms: MassiveOrganism[],
  centerX: number,
  centerY: number,
  radius: number,
  maxCount: number,
): { index: number; org: MassiveOrganism; dist: number }[] {
  const radiusSq = radius * radius;
  const candidates: { index: number; org: MassiveOrganism; dist: number }[] = [];

  for (let i = 0; i < organisms.length; i++) {
    const org = organisms[i];
    const dx = org.x - centerX;
    const dy = org.y - centerY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq && org.energy > 1) {
      candidates.push({ index: i, org, dist: Math.sqrt(distSq) });
    }
  }

  // Sort by distance, take closest
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, maxCount);
}

// ---------------------------------------------------------------------------
// ColonyLayer — simplified biological meshes for nearby organisms
// ---------------------------------------------------------------------------

export function ColonyLayer({
  organisms,
  visible,
}: {
  organisms: MassiveOrganism[];
  visible: boolean;
}) {
  const { camera } = useThree();

  // Refs for instanced meshes
  const wormMeshRef = useRef<THREE.InstancedMesh>(null);
  const flyMeshRef = useRef<THREE.InstancedMesh>(null);
  const energyRingRef = useRef<THREE.InstancedMesh>(null);
  const frameCountRef = useRef(0);

  // Track which organisms are shown at colony detail (for PopulationLayer to hide them)
  const nearbyRef = useRef<Set<number>>(new Set());

  // Pre-allocated color buffers
  const wormColors = useMemo(() => new Float32Array(MAX_COLONY_ORGANISMS * 3), []);
  const flyColors = useMemo(() => new Float32Array(MAX_COLONY_ORGANISMS * 3), []);
  const ringColors = useMemo(() => new Float32Array(MAX_COLONY_ORGANISMS * 3), []);

  // Geometries
  const wormGeom = useMemo(() => {
    // Simplified worm: elongated capsule
    const g = new THREE.CapsuleGeometry(0.15, 0.6, 4, 8);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_COLONY_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', attr);
    return g;
  }, []);

  const flyGeom = useMemo(() => {
    // Simplified fly: ellipsoid body + wings as a single merged geometry
    const body = new THREE.SphereGeometry(0.2, 8, 6);
    body.scale(1.2, 0.8, 1);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_COLONY_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    body.setAttribute('color', attr);
    return body;
  }, []);

  const ringGeom = useMemo(() => {
    // Energy ring around each organism
    const g = new THREE.RingGeometry(0.8, 0.9, 16);
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_COLONY_ORGANISMS * 3), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', attr);
    return g;
  }, []);

  // Materials
  const wormMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0x44aacc),
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      }),
    [],
  );

  const flyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(0xcc8844),
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      }),
    [],
  );

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!visible) return;

    const wMesh = wormMeshRef.current;
    const fMesh = flyMeshRef.current;
    const rMesh = energyRingRef.current;
    if (!wMesh || !fMesh || !rMesh) return;

    frameCountRef.current++;
    const t = clock.getElapsedTime();

    // Get camera look target (center of view)
    _camTarget.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const lookX = camera.position.x + _camTarget.x * 30;
    const lookY = camera.position.y + _camTarget.y * 30;

    // Find nearby organisms (update every 6 frames for perf)
    let nearby: ReturnType<typeof findNearbyOrganisms>;
    if (frameCountRef.current % 6 === 0 || nearbyRef.current.size === 0) {
      nearby = findNearbyOrganisms(organisms, lookX, lookY, COLONY_RADIUS, MAX_COLONY_ORGANISMS);
      nearbyRef.current = new Set(nearby.map((n) => n.index));
    } else {
      // Reuse previous frame's nearby set but re-fetch data
      nearby = [];
      for (const idx of nearbyRef.current) {
        if (organisms[idx]) {
          const org = organisms[idx];
          const dx = org.x - lookX;
          const dy = org.y - lookY;
          nearby.push({ index: idx, org, dist: Math.sqrt(dx * dx + dy * dy) });
        }
      }
    }

    let wIdx = 0;
    let fIdx = 0;
    let rIdx = 0;

    for (const { org } of nearby) {
      const e = Math.min(1, Math.max(0, org.energy / 200));
      if (e < 0.01) continue;

      const isCelegans = org.species === 0;
      const heading = Math.atan2(org.y, org.x + 0.001) + Math.sin(t * 2 + org.x * 0.5) * 0.3;

      // Organism body
      const bodyScale = 0.8 + e * 0.4;
      _obj.position.set(org.x, org.y, 0.1 + e * 0.3);
      _obj.rotation.set(0, 0, heading);

      if (isCelegans) {
        _obj.scale.set(bodyScale * 1.8, bodyScale, bodyScale);
        _obj.updateMatrix();
        wMesh.setMatrixAt(wIdx, _obj.matrix);

        // Color: translucent cyan with energy brightness
        _color.setRGB(0.1 + e * 0.2, 0.5 + e * 0.4, 0.7 + e * 0.3);
        wormColors[wIdx * 3] = _color.r;
        wormColors[wIdx * 3 + 1] = _color.g;
        wormColors[wIdx * 3 + 2] = _color.b;
        wIdx++;
      } else {
        _obj.scale.set(bodyScale, bodyScale * 0.8, bodyScale);
        _obj.updateMatrix();
        fMesh.setMatrixAt(fIdx, _obj.matrix);

        _color.setRGB(0.7 + e * 0.3, 0.4 + e * 0.2, 0.05 + e * 0.1);
        flyColors[fIdx * 3] = _color.r;
        flyColors[fIdx * 3 + 1] = _color.g;
        flyColors[fIdx * 3 + 2] = _color.b;
        fIdx++;
      }

      // Energy ring
      const ringScale = 1.0 + (1 - e) * 0.5;
      _obj.position.set(org.x, org.y, 0.08);
      _obj.scale.set(ringScale, ringScale, 1);
      _obj.rotation.set(0, 0, 0);
      _obj.updateMatrix();
      rMesh.setMatrixAt(rIdx, _obj.matrix);

      // Ring color: green (high energy) → red (low energy)
      if (e > 0.5) {
        _color.setRGB(0, 0.8 * e, 0.4 * e);
      } else {
        _color.setRGB(0.8 * (1 - e), 0.3 * e, 0);
      }
      ringColors[rIdx * 3] = _color.r;
      ringColors[rIdx * 3 + 1] = _color.g;
      ringColors[rIdx * 3 + 2] = _color.b;
      rIdx++;
    }

    // Hide unused instances
    _obj.scale.set(0, 0, 0);
    _obj.updateMatrix();
    for (let i = wIdx; i < MAX_COLONY_ORGANISMS; i++) wMesh.setMatrixAt(i, _obj.matrix);
    for (let i = fIdx; i < MAX_COLONY_ORGANISMS; i++) fMesh.setMatrixAt(i, _obj.matrix);
    for (let i = rIdx; i < MAX_COLONY_ORGANISMS; i++) rMesh.setMatrixAt(i, _obj.matrix);

    wMesh.count = wIdx;
    fMesh.count = fIdx;
    rMesh.count = rIdx;

    wMesh.instanceMatrix.needsUpdate = true;
    fMesh.instanceMatrix.needsUpdate = true;
    rMesh.instanceMatrix.needsUpdate = true;

    // Update color attributes
    const updateColors = (mesh: THREE.InstancedMesh, colors: Float32Array) => {
      const attr = mesh.geometry.getAttribute('color') as THREE.InstancedBufferAttribute | null;
      if (attr) {
        (attr.array as Float32Array).set(colors);
        attr.needsUpdate = true;
      }
    };
    updateColors(wMesh, wormColors);
    updateColors(fMesh, flyColors);
    updateColors(rMesh, ringColors);
  });

  if (!visible) return null;

  return (
    <group>
      <instancedMesh
        ref={wormMeshRef}
        args={[wormGeom, wormMat, MAX_COLONY_ORGANISMS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={flyMeshRef}
        args={[flyGeom, flyMat, MAX_COLONY_ORGANISMS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={energyRingRef}
        args={[ringGeom, ringMat, MAX_COLONY_ORGANISMS]}
        frustumCulled={false}
      />
    </group>
  );
}
