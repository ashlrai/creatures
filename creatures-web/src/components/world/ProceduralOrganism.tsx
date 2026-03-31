import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MassiveOrganism } from '../ecosystem/EcosystemView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProceduralOrganismProps {
  organism: MassiveOrganism;
  position: [number, number, number];
  heading: number;
  scale?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value between min and max. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Build a CatmullRom spline curve for the organism body.
 * Control points are spaced along the X axis; the radius function
 * produces a thorax bulge (wider in the middle, tapered at ends).
 */
function buildBodyCurve(nSegments: number, bodyLength: number): THREE.CatmullRomCurve3 {
  const n = clamp(Math.round(nSegments), 3, 12);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 .. 1
    // Slight vertical undulation for organic feel
    const yOff = Math.sin(t * Math.PI) * 0.04 * bodyLength;
    points.push(new THREE.Vector3(t * bodyLength - bodyLength / 2, yOff, 0));
  }
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}

/**
 * Compute a radius at parameter t (0..1) along the body.
 * Widest at ~0.4 (thorax), tapered at both ends.
 */
function bodyRadiusAt(t: number, bodyWidth: number, bodyHeight: number): number {
  const baseRadius = (bodyWidth + bodyHeight) / 4; // average half-extent
  // Smooth taper: sin^0.6 gives a nice biological shape
  const taper = Math.pow(Math.sin(t * Math.PI), 0.6);
  // Slight thorax bias — peak at 40% rather than 50%
  const thoraxBias = 1 + 0.15 * Math.exp(-((t - 0.4) ** 2) / 0.04);
  return baseRadius * taper * thoraxBias;
}

// ---------------------------------------------------------------------------
// ProceduralOrganism — single organism with unique body + limbs + glow
// ---------------------------------------------------------------------------

/**
 * ProceduralOrganism — generates a unique 3D mesh from morphology genes.
 *
 * Each organism's body is a CatmullRom spline tube with variable radius,
 * plus cylindrical limb appendages. Color comes from the evolved color_hue
 * gene with energy-based brightness.
 *
 * Used at colony zoom level when organisms are close enough to see detail.
 */
export function ProceduralOrganism({
  organism,
  position,
  heading,
  scale: scaleProp = 1,
}: ProceduralOrganismProps) {
  const groupRef = useRef<THREE.Group>(null);
  const limbRefs = useRef<THREE.Mesh[]>([]);
  const glowRef = useRef<THREE.Points>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // --- Morphology genes (with defaults) ---
  const bodyLength = clamp(organism.body_length ?? 1.0, 0.5, 3.0);
  const bodyWidth = clamp(organism.body_width ?? 0.4, 0.1, 1.5);
  const bodyHeight = clamp(organism.body_height ?? 0.3, 0.1, 1.5);
  const nSegments = clamp(organism.n_segments ?? 6, 3, 12);
  const limbCount = clamp(organism.limb_count ?? 0, 0, 12);
  const colorHue = organism.color_hue ?? 200;
  const energy = clamp(organism.energy / 200, 0, 1); // normalise to 0..1
  const limbLength = bodyLength * 0.3;

  // --- Memo key: morphology fingerprint ---
  const morphKey = `${bodyLength.toFixed(2)}_${bodyWidth.toFixed(2)}_${bodyHeight.toFixed(2)}_${nSegments}_${limbCount}_${colorHue}`;

  // --- Body tube geometry (only rebuild when morphology changes) ---
  const bodyGeom = useMemo(() => {
    const curve = buildBodyCurve(nSegments, bodyLength);
    const tubularSegments = Math.max(16, nSegments * 4);
    const radialSegments = 8;

    // TubeGeometry doesn't natively support variable radius, so we build
    // one at max radius then deform the vertices to get the taper.
    const maxRadius = (bodyWidth + bodyHeight) / 4;
    const tube = new THREE.TubeGeometry(curve, tubularSegments, maxRadius, radialSegments, false);

    // Deform: scale each ring of vertices by the radius function
    const pos = tube.attributes.position;
    const ringSize = radialSegments + 1; // vertices per ring
    const nRings = tubularSegments + 1;

    for (let ring = 0; ring < nRings; ring++) {
      const t = ring / (nRings - 1);
      const desiredR = bodyRadiusAt(t, bodyWidth, bodyHeight);
      const scaleFactor = desiredR / maxRadius;

      // Centre of this ring: average of all verts in the ring
      let cx = 0, cy = 0, cz = 0;
      for (let v = 0; v < ringSize; v++) {
        const idx = ring * ringSize + v;
        cx += pos.getX(idx);
        cy += pos.getY(idx);
        cz += pos.getZ(idx);
      }
      cx /= ringSize;
      cy /= ringSize;
      cz /= ringSize;

      // Scale verts radially from the ring centre
      for (let v = 0; v < ringSize; v++) {
        const idx = ring * ringSize + v;
        const dx = pos.getX(idx) - cx;
        const dy = pos.getY(idx) - cy;
        const dz = pos.getZ(idx) - cz;
        // Apply asymmetric scaling: width (Y) vs height (Z)
        const widthScale = scaleFactor * (bodyWidth / ((bodyWidth + bodyHeight) / 2));
        const heightScale = scaleFactor * (bodyHeight / ((bodyWidth + bodyHeight) / 2));
        pos.setXYZ(idx, cx + dx * widthScale, cy + dy * widthScale, cz + dz * heightScale);
      }
    }

    pos.needsUpdate = true;
    tube.computeVertexNormals();
    return tube;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphKey]);

  // --- Limb geometries and attachment data ---
  const limbData = useMemo(() => {
    if (limbCount === 0) return [];

    const curve = buildBodyCurve(nSegments, bodyLength);
    const limbs: {
      geom: THREE.CylinderGeometry;
      attachPoint: THREE.Vector3;
      side: number; // +1 right, -1 left
      attachT: number;
    }[] = [];

    for (let i = 0; i < limbCount; i++) {
      // Evenly space limbs along the middle 80% of the body
      const t = 0.1 + (0.8 * (i + 0.5)) / limbCount;
      const point = curve.getPointAt(t);
      const side = i % 2 === 0 ? 1 : -1;
      const radius = limbLength * 0.08;
      const geom = new THREE.CylinderGeometry(radius, radius * 0.6, limbLength, 4);
      // Shift geometry so pivot is at the top (attachment point)
      geom.translate(0, -limbLength / 2, 0);

      limbs.push({ geom, attachPoint: point, side, attachT: t });
    }

    return limbs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphKey]);

  // --- Neural glow point cloud ---
  const glowGeom = useMemo(() => {
    const count = 24;
    const positions = new Float32Array(count * 3);
    // Scatter points inside the body volume
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const x = (t - 0.5) * bodyLength * 0.8;
      const r = bodyRadiusAt(t, bodyWidth, bodyHeight) * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const rr = Math.random() * r;
      positions[i * 3] = x;
      positions[i * 3 + 1] = Math.cos(angle) * rr;
      positions[i * 3 + 2] = Math.sin(angle) * rr;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphKey]);

  const glowMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.06,
        color: new THREE.Color().setHSL(colorHue / 360, 0.9, 0.7),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [morphKey],
  );

  // --- Body material (created once per morph, animated each frame) ---
  const bodyMat = useMemo(() => {
    const hsl = { h: colorHue / 360, s: 0.7, l: 0.3 + energy * 0.4 };
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l),
      emissive: new THREE.Color().setHSL(hsl.h, 0.8, 0.15),
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8,
      toneMapped: false,
    });
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphKey]);

  const limbMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(colorHue / 360, 0.5, 0.25 + energy * 0.3),
      emissive: new THREE.Color().setHSL(colorHue / 360, 0.6, 0.1),
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.05,
      transparent: true,
      opacity: 0.8,
      toneMapped: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphKey]);

  // --- Per-frame animation ---
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Update body color brightness based on current energy
    if (bodyMatRef.current) {
      const e = clamp(organism.energy / 200, 0, 1);
      const l = 0.3 + e * 0.4;
      bodyMatRef.current.color.setHSL(colorHue / 360, 0.7, l);
      // Neural activity emissive pulse
      const pulse = 0.3 + 0.3 * Math.sin(t * 3 + colorHue * 0.1);
      bodyMatRef.current.emissiveIntensity = pulse * e;
    }

    // Limb swing animation (locomotion)
    for (let i = 0; i < limbRefs.current.length; i++) {
      const mesh = limbRefs.current[i];
      if (!mesh) continue;
      const limb = limbData[i];
      if (!limb) continue;

      // Alternating phase for left/right pairs — creates walking gait
      const phase = limb.side * Math.sin(t * 4 + i * 1.2) * 0.35;
      // Swing around attachment point
      mesh.rotation.z = phase;
      mesh.rotation.x = Math.sin(t * 3 + i * 0.8) * 0.15;
    }

    // Neural glow pulse
    if (glowRef.current) {
      const e = clamp(organism.energy / 200, 0, 1);
      const glowPulse = 0.3 + 0.5 * e * (0.5 + 0.5 * Math.sin(t * 5 + colorHue * 0.05));
      (glowRef.current.material as THREE.PointsMaterial).opacity = glowPulse;
      (glowRef.current.material as THREE.PointsMaterial).size = 0.04 + 0.04 * e * (0.5 + 0.5 * Math.sin(t * 7));
    }
  });

  // Collect limb refs via callback
  const setLimbRef = (index: number) => (el: THREE.Mesh | null) => {
    if (el) limbRefs.current[index] = el;
  };

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, 0, heading]}
      scale={scaleProp}
    >
      {/* Body tube */}
      <mesh geometry={bodyGeom} material={bodyMat}>
        <primitive object={bodyMat} ref={bodyMatRef} attach="material" />
      </mesh>

      {/* Limb appendages */}
      {limbData.map((limb, i) => {
        const sideOffset = limb.side * bodyRadiusAt(limb.attachT, bodyWidth, bodyHeight) * 1.1;
        return (
          <mesh
            key={i}
            ref={setLimbRef(i)}
            geometry={limb.geom}
            material={limbMat}
            position={[limb.attachPoint.x, limb.attachPoint.y + sideOffset, limb.attachPoint.z]}
          />
        );
      })}

      {/* Neural glow point cloud */}
      <points ref={glowRef} geometry={glowGeom} material={glowMat} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// ProceduralOrganismInstances — renders multiple unique organisms
// ---------------------------------------------------------------------------

/**
 * Renders a set of ProceduralOrganism components for colony-zoom viewing.
 * Each organism has unique geometry derived from its morphology genes.
 * NOT instanced — each mesh is distinct because each body plan differs.
 */
export function ProceduralOrganismInstances({
  organisms,
  visible = true,
}: {
  organisms: MassiveOrganism[];
  visible?: boolean;
}) {
  if (!visible || organisms.length === 0) return null;

  return (
    <group>
      {organisms.map((org, i) => {
        const heading = Math.atan2(org.y, org.x + 0.001);
        return (
          <ProceduralOrganism
            key={`${i}_${org.lineage_id ?? i}`}
            organism={org}
            position={[org.x, org.y, org.z ?? 0.1]}
            heading={heading}
          />
        );
      })}
    </group>
  );
}
