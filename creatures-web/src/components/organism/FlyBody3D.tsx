import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D Drosophila body renderer.
 *
 * Renders a recognizable fly: ellipsoid thorax, head with eyes,
 * tapered abdomen, 6 articulated legs, and wing stubs.
 * Body segments are colored by neural activity.
 */

const FLY_AMBER = new THREE.Color(0.6, 0.35, 0.08);
const FLY_ACTIVE = new THREE.Color(0.8, 0.6, 0.15);
const FLY_HOT = new THREE.Color(1.0, 0.85, 0.3);
const FLY_EMISSIVE_REST = new THREE.Color(0.08, 0.04, 0.01);
const FLY_EMISSIVE_ACTIVE = new THREE.Color(0.3, 0.15, 0.02);
const FLY_EMISSIVE_HOT = new THREE.Color(0.5, 0.3, 0.05);

const LEG_COLOR = new THREE.Color(0.25, 0.15, 0.05);
const WING_COLOR = new THREE.Color(0.3, 0.5, 0.7);
const EYE_COLOR = new THREE.Color(0.8, 0.1, 0.1);

export function FlyBody3D() {
  const frame = useSimulationStore((s) => s.frame);
  const groupRef = useRef<THREE.Group>(null);
  const thoraxRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const abdomenRef = useRef<THREE.Mesh>(null);
  const eyeLRef = useRef<THREE.Mesh>(null);
  const eyeRRef = useRef<THREE.Mesh>(null);
  const wingLRef = useRef<THREE.Mesh>(null);
  const wingRRef = useRef<THREE.Mesh>(null);
  const legRefs = useRef<(THREE.Line | null)[]>([]);

  // Materials
  const bodyMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: FLY_AMBER.clone(),
    emissive: FLY_EMISSIVE_REST.clone(),
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    iridescence: 0.3,
    iridescenceIOR: 1.4,
  }), []);

  const headMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.45, 0.25, 0.06),
    emissive: FLY_EMISSIVE_REST.clone(),
    emissiveIntensity: 1.0,
    roughness: 0.25,
    metalness: 0.2,
    clearcoat: 0.7,
  }), []);

  const eyeMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: EYE_COLOR,
    emissive: new THREE.Color(0.4, 0.02, 0.02),
    emissiveIntensity: 1.5,
    roughness: 0.1,
    metalness: 0.6,
    clearcoat: 1.0,
  }), []);

  const wingMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: WING_COLOR,
    emissive: new THREE.Color(0.05, 0.1, 0.15),
    emissiveIntensity: 0.5,
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.25,
    clearcoat: 0.8,
    side: THREE.DoubleSide,
  }), []);

  const legMat = useMemo(() => new THREE.LineBasicMaterial({
    color: LEG_COLOR,
    linewidth: 1,
    transparent: true,
    opacity: 0.6,
  }), []);

  // Leg geometries (6 legs, each with 3 segments)
  const legGeometries = useMemo(() => {
    const legs: THREE.BufferGeometry[] = [];
    const legConfigs = [
      // [baseX, baseZ, angles...] for LF, LM, LH, RF, RM, RH
      { x: -0.02, z: 0.025, dir: 1 },   // LF
      { x: 0, z: 0.03, dir: 1 },         // LM
      { x: 0.02, z: 0.025, dir: 1 },     // LH
      { x: -0.02, z: -0.025, dir: -1 },  // RF
      { x: 0, z: -0.03, dir: -1 },       // RM
      { x: 0.02, z: -0.025, dir: -1 },   // RH
    ];
    for (const leg of legConfigs) {
      const pts = new Float32Array([
        leg.x, 0, leg.z * leg.dir,
        leg.x + 0.01, -0.02, (leg.z + 0.02) * leg.dir,
        leg.x + 0.005, -0.04, (leg.z + 0.04) * leg.dir,
        leg.x, -0.05, (leg.z + 0.05) * leg.dir,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      legs.push(geo);
    }
    return legs;
  }, []);

  useFrame(({ clock }) => {
    if (!frame?.body_positions?.length || !groupRef.current) return;

    const positions = frame.body_positions;
    const rates = frame.firing_rates ?? [];
    const nNeurons = rates.length;
    const t = clock.getElapsedTime();

    // Compute overall neural activity
    let totalRate = 0;
    for (const r of rates) totalRate += r;
    const avgActivity = Math.min((totalRate / Math.max(nNeurons, 1)) / 100, 1);

    // Position the fly group at the center of mass
    if (frame.center_of_mass) {
      const [cx, cy, cz] = frame.center_of_mass;
      groupRef.current.position.lerp(new THREE.Vector3(cx, cz + 0.02, -cy), 0.15);
    }

    // Subtle breathing animation
    const breath = 1.0 + Math.sin(t * 2.0) * 0.02;
    groupRef.current.scale.set(breath, breath, breath);

    // Wing flap animation (faster when more active)
    const flapSpeed = 8 + avgActivity * 20;
    const flapAngle = Math.sin(t * flapSpeed) * 0.3;
    if (wingLRef.current) {
      wingLRef.current.rotation.z = 0.2 + flapAngle;
    }
    if (wingRRef.current) {
      wingRRef.current.rotation.z = -(0.2 + flapAngle);
    }

    // Color body based on neural activity
    const actColor = avgActivity < 0.3
      ? FLY_AMBER.clone().lerp(FLY_ACTIVE, avgActivity / 0.3)
      : FLY_ACTIVE.clone().lerp(FLY_HOT, (avgActivity - 0.3) / 0.7);
    bodyMat.color.copy(actColor);

    const emColor = avgActivity < 0.3
      ? FLY_EMISSIVE_REST.clone().lerp(FLY_EMISSIVE_ACTIVE, avgActivity / 0.3)
      : FLY_EMISSIVE_ACTIVE.clone().lerp(FLY_EMISSIVE_HOT, (avgActivity - 0.3) / 0.7);
    bodyMat.emissive.copy(emColor);
    bodyMat.emissiveIntensity = 1.0 + avgActivity * 3.0;

    // Eye glow pulses with activity
    if (eyeMat) {
      eyeMat.emissiveIntensity = 1.5 + avgActivity * 3.0;
    }

    // Leg animation — slight movement based on activity
    for (let i = 0; i < 6; i++) {
      const line = legRefs.current[i];
      if (!line) continue;
      const legPhase = t * (3 + avgActivity * 5) + i * Math.PI / 3;
      line.rotation.x = Math.sin(legPhase) * 0.1 * (1 + avgActivity);
    }
  });

  return (
    <group ref={groupRef} position={[0.3, 0.05, 0]}>
      {/* Thorax — main body */}
      <mesh ref={thoraxRef} material={bodyMat}>
        <sphereGeometry args={[0.025, 16, 12]} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[-0.035, 0.005, 0]} material={headMat}>
        <sphereGeometry args={[0.015, 12, 10]} />
      </mesh>

      {/* Compound eyes */}
      <mesh ref={eyeLRef} position={[-0.045, 0.012, 0.01]} material={eyeMat}>
        <sphereGeometry args={[0.006, 8, 8]} />
      </mesh>
      <mesh ref={eyeRRef} position={[-0.045, 0.012, -0.01]} material={eyeMat}>
        <sphereGeometry args={[0.006, 8, 8]} />
      </mesh>

      {/* Abdomen — tapered */}
      <mesh ref={abdomenRef} position={[0.04, -0.005, 0]} rotation={[0, 0, -0.15]} material={bodyMat}>
        <coneGeometry args={[0.02, 0.06, 12]} />
      </mesh>

      {/* Wings */}
      <mesh ref={wingLRef} position={[-0.005, 0.02, 0.015]} rotation={[0.3, 0, 0.2]} material={wingMat}>
        <planeGeometry args={[0.05, 0.02]} />
      </mesh>
      <mesh ref={wingRRef} position={[-0.005, 0.02, -0.015]} rotation={[-0.3, 0, -0.2]} material={wingMat}>
        <planeGeometry args={[0.05, 0.02]} />
      </mesh>

      {/* 6 Legs */}
      {legGeometries.map((geo, i) => (
        <lineSegments
          key={i}
          ref={(el: any) => { legRefs.current[i] = el; }}
          geometry={geo}
          material={legMat}
        />
      ))}
    </group>
  );
}
