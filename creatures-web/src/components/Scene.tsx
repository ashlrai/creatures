import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './organism/WormBody';
import { FlyBody3D } from './organism/FlyBody3D';
import { ZebraFishBody3D } from './organism/ZebraFishBody3D';
import { NeuralNetwork3D } from './organism/NeuralNetwork3D';
import { ConnectomeGraph3D } from './organism/ConnectomeGraph3D';
import { SpikeParticles } from './organism/SpikeParticles';
import { PostProcessing } from './effects/PostProcessing';
import { ConsciousnessEffects } from './effects/ConsciousnessEffects';
import { PerformanceMonitor } from './ui/PerformanceMonitor';
import { PerformanceStats } from './ui/PerformanceStats';
import { EnvironmentBackground } from './environment/EnvironmentBackground';
import { useSimulationStore } from '../stores/simulationStore';

function SmoothCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.45, 0.015, 0));
  const hasSnapped = useRef(false);

  useFrame(({ camera }) => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, z + 0.02, -y);

    if (!hasSnapped.current) {
      // Snap camera to organism with consistent framing angle
      targetRef.current.copy(desired);
      controlsRef.current.target.copy(desired);

      // Per-organism camera offsets (zebrafish is ~4x bigger)
      const organism = experiment?.organism ?? 'c_elegans';
      let yOff = 0.025;
      let zOff = 0.2;
      if (organism === 'zebrafish') {
        yOff = 0.04;
        zOff = 0.35;
      }

      camera.position.set(
        desired.x,
        desired.y + yOff,
        desired.z + zOff,
      );
      hasSnapped.current = true;
    } else {
      // Safety valve: reject outlier frames to prevent camera shake
      if (desired.distanceTo(targetRef.current) > 0.005) return;
      targetRef.current.lerp(desired, 0.05);
      controlsRef.current.target.copy(targetRef.current);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.45, 0.04, 0]}
      minDistance={0.08}
      maxDistance={1.5}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      enablePan={true}
      panSpeed={0.3}
      autoRotate
      autoRotateSpeed={0.08}
    />
  );
}

/** Renders the appropriate body based on the current organism */
function OrganismBody() {
  const experiment = useSimulationStore((s) => s.experiment);
  const organism = experiment?.organism ?? 'c_elegans';

  if (organism === 'drosophila') {
    return <FlyBody3D />;
  }
  if (organism === 'zebrafish') {
    return <ZebraFishBody3D />;
  }
  return <WormBody />;
}

export interface SceneProps {
  /** World type for environment theming. undefined = default dark simulation space. */
  worldType?: string;
}

export function Scene({ worldType }: SceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0.45, 0.06, 0.15], fov: 55, near: 0.005, far: 15 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      flat={false}
      style={{
        background: 'linear-gradient(180deg, #1a2a3a 0%, #0d1a2a 40%, #0a1520 100%)',
      }}
    >
      {/* Natural 3-point lighting rig */}
      <ambientLight intensity={0.3} color="#2a3040" />
      <directionalLight
        position={[2, 3, 1]}
        intensity={1.8}
        color="#ffe8d0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.1}
        shadow-camera-far={10}
      />
      <directionalLight position={[-1, 2, -2]} intensity={0.5} color="#4488cc" />
      <pointLight position={[0.4, -0.1, 0]} intensity={0.2} color="#ffaa66" distance={1} />
      <directionalLight position={[0, -1, -2]} intensity={0.3} color="#88ccff" />

      <ContactShadows
        position={[0.4, -0.01, 0]}
        opacity={0.4}
        scale={2}
        blur={2}
        far={1}
        color="#102030"
      />

      {/* Atmospheric fog for depth */}
      <fog attach="fog" args={['#0a1520', 0.5, 4]} />

      {/* Environment: background color, fog, lighting, ground, particles */}
      <EnvironmentBackground worldType={worldType} />

      {/* Organism body — switch renderer based on organism type */}
      <OrganismBody />
      <NeuralNetwork3D />
      <ConnectomeGraph3D />
      <SpikeParticles />

      {/* Consciousness-driven visual effects */}
      <ConsciousnessEffects />

      {/* Camera */}
      <SmoothCamera />

      {/* Post-processing: bloom, glow */}
      <PostProcessing />

      {/* FPS warning — only visible when performance drops below 30fps */}
      <PerformanceMonitor />

      {/* Detailed performance stats — visible in research mode or via F3 */}
      <PerformanceStats />
    </Canvas>
  );
}
