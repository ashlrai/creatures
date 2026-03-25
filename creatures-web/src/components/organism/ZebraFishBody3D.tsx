import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

/**
 * 3D Zebrafish larva renderer.
 *
 * Renders a transparent zebrafish larva with visible neural tube,
 * large eye, yolk sac, and undulating tail — like fluorescence
 * microscopy of a living specimen.
 */

// Body palette — transparent aquatic blues
const BODY_COLOR = new THREE.Color(0.06, 0.18, 0.25);
const BODY_EMISSIVE = new THREE.Color(0.01, 0.04, 0.06);
const NEURAL_TUBE_COLOR = new THREE.Color(0.05, 0.4, 0.5);
const NEURAL_TUBE_ACTIVE = new THREE.Color(0.1, 0.8, 1.0);
const YOLK_COLOR = new THREE.Color(0.7, 0.45, 0.1);
const EYE_COLOR = new THREE.Color(0.02, 0.02, 0.04);
const FLASH_COLOR = new THREE.Color(0.6, 0.9, 1.0);

export function ZebraFishBody3D() {
  const frame = useSimulationStore((s) => s.frame);

  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Mesh>(null);
  const neuralTubeRef = useRef<THREE.Mesh>(null);
  const yolkRef = useRef<THREE.Mesh>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<number>(0);
  const prevSpikeCount = useRef<number>(0);

  // Body — elongated ellipsoid (torpedo shape)
  const bodyGeometry = useMemo(
    () => new THREE.SphereGeometry(1, 24, 16),
    []
  );

  const bodyMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: BODY_COLOR.clone(),
      emissive: BODY_EMISSIVE.clone(),
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.05,
      transmission: 0.4,
      thickness: 0.8,
      clearcoat: 0.7,
      clearcoatRoughness: 0.1,
      iridescence: 0.3,
      iridescenceIOR: 1.3,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    }),
    []
  );

  // Eye — large, dark, reflective
  const eyeGeometry = useMemo(
    () => new THREE.SphereGeometry(1, 16, 12),
    []
  );

  const eyeMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: EYE_COLOR.clone(),
      emissive: new THREE.Color(0.0, 0.0, 0.01),
      emissiveIntensity: 0.5,
      roughness: 0.05,
      metalness: 0.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
    []
  );

  // Yolk sac — warm translucent sphere
  const yolkGeometry = useMemo(
    () => new THREE.SphereGeometry(1, 16, 12),
    []
  );

  const yolkMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: YOLK_COLOR.clone(),
      emissive: new THREE.Color(0.15, 0.08, 0.01),
      emissiveIntensity: 1.2,
      roughness: 0.35,
      metalness: 0.05,
      transmission: 0.2,
      thickness: 0.5,
      transparent: true,
      opacity: 0.85,
    }),
    []
  );

  // Neural tube — glowing dorsal line
  const neuralTubeGeometry = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      points.push(new THREE.Vector3(
        -0.02 + t * 0.08,  // runs along body length
        0.006,              // dorsal (top)
        0
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, 32, 0.0015, 8, false);
  }, []);

  const neuralTubeMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: NEURAL_TUBE_COLOR.clone(),
      emissive: NEURAL_TUBE_COLOR.clone(),
      emissiveIntensity: 2.0,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    }),
    []
  );

  // Tail — tapered tube
  const tailGeometry = useMemo(() => {
    const points = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      points.push(new THREE.Vector3(t * 0.06, 0, 0));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    // Tapered: wider at base, thin at tip
    return new THREE.TubeGeometry(curve, 32, 0.004, 8, false);
  }, []);

  const tailMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.05, 0.15, 0.22),
      emissive: new THREE.Color(0.01, 0.03, 0.05),
      emissiveIntensity: 1.0,
      roughness: 0.25,
      metalness: 0.05,
      transmission: 0.3,
      thickness: 0.3,
      clearcoat: 0.5,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    }),
    []
  );

  // Tail fin — flat transparent membrane
  const finGeometry = useMemo(
    () => new THREE.PlaneGeometry(0.06, 0.012, 16, 4),
    []
  );

  const finMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.06, 0.2, 0.3),
      emissive: new THREE.Color(0.01, 0.04, 0.06),
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.0,
      transmission: 0.5,
      thickness: 0.1,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    const t = clock.getElapsedTime();
    const rates = frame?.firing_rates ?? [];
    const spikes = frame?.spikes ?? [];
    const nNeurons = rates.length;

    // Position the group at center of mass or default
    if (frame?.center_of_mass) {
      const [x, y, z] = frame.center_of_mass;
      groupRef.current.position.lerp(
        new THREE.Vector3(x, z + 0.015, -y), 0.05
      );
    } else {
      groupRef.current.position.lerp(
        new THREE.Vector3(0.44, 0.015, 0), 0.05
      );
    }

    // Gentle body sway — idle swimming motion
    groupRef.current.rotation.y = Math.sin(t * 0.8) * 0.05;
    groupRef.current.rotation.z = Math.sin(t * 1.2 + 0.5) * 0.02;

    // Body breathing
    if (bodyRef.current) {
      const breathe = 1.0 + Math.sin(t * 2.0) * 0.02;
      bodyRef.current.scale.set(0.035, 0.012 * breathe, 0.01 * breathe);
    }

    // Compute average neural activity
    let avgRate = 0;
    let maxRate = 0;
    for (let i = 0; i < nNeurons; i++) {
      avgRate += rates[i] || 0;
      maxRate = Math.max(maxRate, rates[i] || 0);
    }
    avgRate = nNeurons > 0 ? avgRate / nNeurons : 0;
    const avgActivity = Math.min(avgRate / 100, 1);
    const peakActivity = Math.min(maxRate / 120, 1);

    // Detect escape reflex (sudden burst of spikes = Mauthner cell)
    const spikeCount = spikes.length;
    if (spikeCount > prevSpikeCount.current + 5) {
      flashRef.current = 1.0; // C-start flash
    }
    prevSpikeCount.current = spikeCount;

    // Decay flash
    flashRef.current *= 0.92;
    const flash = flashRef.current;

    // Body flash on escape reflex
    if (bodyRef.current) {
      const mat = bodyRef.current.material as THREE.MeshPhysicalMaterial;
      if (flash > 0.05) {
        mat.emissive.lerpColors(BODY_EMISSIVE, FLASH_COLOR, flash);
        mat.emissiveIntensity = 1.0 + flash * 6.0;
      } else {
        mat.emissive.copy(BODY_EMISSIVE);
        mat.emissiveIntensity = 1.0 + avgActivity * 1.5;
      }
    }

    // Neural tube glow tracks overall activity
    if (neuralTubeRef.current) {
      const mat = neuralTubeRef.current.material as THREE.MeshPhysicalMaterial;
      const intensity = Math.max(avgActivity, flash);
      mat.emissive.lerpColors(NEURAL_TUBE_COLOR, NEURAL_TUBE_ACTIVE, intensity);
      mat.emissiveIntensity = 2.0 + intensity * 6.0;

      // Pulse
      const pulse = Math.sin(t * 4.0) * 0.3;
      mat.emissiveIntensity += pulse * avgActivity;
    }

    // Eye — subtle glint
    if (eyeRef.current) {
      const eyeMat = eyeRef.current.material as THREE.MeshPhysicalMaterial;
      eyeMat.emissive.setRGB(0.0, flash * 0.05, flash * 0.08 + 0.01);
    }

    // Yolk sac gentle pulse
    if (yolkRef.current) {
      const breathe = 1.0 + Math.sin(t * 1.5) * 0.03;
      yolkRef.current.scale.set(0.01 * breathe, 0.008 * breathe, 0.008 * breathe);
    }

    // Tail undulation — speed increases with motor neuron activity
    if (tailRef.current) {
      // Motor activity from second half of neurons (tail/motor region)
      let motorActivity = 0;
      const motorStart = Math.floor(nNeurons * 0.5);
      for (let i = motorStart; i < nNeurons; i++) {
        motorActivity += rates[i] || 0;
      }
      motorActivity = nNeurons > 0 ? Math.min(motorActivity / Math.max(nNeurons - motorStart, 1) / 80, 1) : 0;

      const undulationSpeed = 3.0 + motorActivity * 6.0;
      const undulationAmplitude = 0.03 + motorActivity * 0.05;

      // C-start: sharp bend on flash
      const cStartBend = flash * 0.3;

      tailRef.current.rotation.y = Math.sin(t * undulationSpeed) * undulationAmplitude + cStartBend;
      tailRef.current.rotation.z = Math.sin(t * undulationSpeed * 0.7 + 1.0) * undulationAmplitude * 0.3;

      // Tail emissive based on motor activity
      const tMat = tailRef.current.material as THREE.MeshPhysicalMaterial;
      tMat.emissiveIntensity = 1.0 + motorActivity * 2.0 + flash * 4.0;
    }

    // Animate fin membrane vertices for wave effect
    // (PlaneGeometry vertex displacement for organic membrane look)
  });

  return (
    <group ref={groupRef} position={[0.44, 0.015, 0]}>
      {/* Main body — torpedo ellipsoid */}
      <mesh
        ref={bodyRef}
        geometry={bodyGeometry}
        material={bodyMaterial}
        scale={[0.035, 0.012, 0.01]}
      />

      {/* Eye — proportionally large */}
      <mesh
        ref={eyeRef}
        geometry={eyeGeometry}
        material={eyeMaterial}
        position={[-0.028, 0.004, 0.005]}
        scale={[0.005, 0.005, 0.004]}
      />

      {/* Yolk sac — ventral protrusion */}
      <mesh
        ref={yolkRef}
        geometry={yolkGeometry}
        material={yolkMaterial}
        position={[-0.005, -0.006, 0]}
        scale={[0.01, 0.008, 0.008]}
      />

      {/* Neural tube — glowing dorsal line */}
      <mesh
        ref={neuralTubeRef}
        geometry={neuralTubeGeometry}
        material={neuralTubeMaterial}
      />

      {/* Tail — tapered tube with undulation */}
      <group position={[0.033, 0, 0]}>
        <mesh
          ref={tailRef}
          geometry={tailGeometry}
          material={tailMaterial}
        />
        {/* Tail fin membrane */}
        <mesh
          geometry={finGeometry}
          material={finMaterial}
          position={[0.03, 0, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </group>
    </group>
  );
}
