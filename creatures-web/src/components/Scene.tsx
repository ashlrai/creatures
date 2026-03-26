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
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.3, 0.02, 0));
  const hasSnapped = useRef(false);

  useFrame(({ camera }) => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, z + 0.02, -y);

    if (!hasSnapped.current) {
      // Snap camera directly to the organism on first frame
      targetRef.current.copy(desired);
      controlsRef.current.target.copy(desired);
      camera.position.set(desired.x, desired.y + 0.06, desired.z + 0.2);
      hasSnapped.current = true;
    } else {
      targetRef.current.lerp(desired, 0.05);
      controlsRef.current.target.copy(targetRef.current);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.45, 0.015, 0]}
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
      camera={{ position: [0.45, 0.035, 0.2], fov: 50, near: 0.005, far: 15 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      flat={false}
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)',
      }}
    >
      {/* Professional 3-point lighting rig */}
      <ambientLight intensity={0.15} color="#1a2a40" />
      <directionalLight
        position={[2, 3, 1]}
        intensity={1.2}
        color="#c8d8ff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.1}
        shadow-camera-far={10}
      />
      <directionalLight position={[-1, 2, -2]} intensity={0.4} color="#4488cc" />
      <pointLight position={[0, -0.5, 0]} intensity={0.3} color="#0066ff" distance={2} decay={2} />
      <hemisphereLight args={['#1a2a40', '#000510', 0.5]} />

      <ContactShadows
        position={[0.4, -0.01, 0]}
        opacity={0.25}
        scale={2}
        blur={2}
        far={1}
        color="#001020"
      />

      <gridHelper args={[4, 40, '#0a1525', '#060c18']} position={[0.4, -0.01, 0]} />

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
