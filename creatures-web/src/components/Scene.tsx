import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './organism/WormBody';
import { FlyBody3D } from './organism/FlyBody3D';
import { ZebraFishBody3D } from './organism/ZebraFishBody3D';
import { NeuralNetwork3D } from './organism/NeuralNetwork3D';
import { ConnectomeGraph3D } from './organism/ConnectomeGraph3D';
import { SpikeParticles } from './organism/SpikeParticles';
import { PostProcessing } from './effects/PostProcessing';
import { PerformanceMonitor } from './ui/PerformanceMonitor';
import { EnvironmentBackground } from './environment/EnvironmentBackground';
import { useSimulationStore } from '../stores/simulationStore';

function SmoothCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.44, 0.015, 0));

  useFrame(() => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, z + 0.005, -y);
    targetRef.current.lerp(desired, 0.035);
    controlsRef.current.target.copy(targetRef.current);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.44, 0.015, 0]}
      minDistance={0.08}
      maxDistance={3}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      autoRotate
      autoRotateSpeed={0.15}
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
      camera={{ position: [0.44, 0.2, 0.6], fov: 34, near: 0.005, far: 15 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)',
      }}
    >
      {/* Environment: background color, fog, lighting, ground, particles */}
      <EnvironmentBackground worldType={worldType} />

      {/* Organism body — switch renderer based on organism type */}
      <OrganismBody />
      <NeuralNetwork3D />
      <ConnectomeGraph3D />
      <SpikeParticles />

      {/* Camera */}
      <SmoothCamera />

      {/* Post-processing */}
      <PostProcessing />

      {/* FPS warning — only visible when performance drops below 30fps */}
      <PerformanceMonitor />
    </Canvas>
  );
}
