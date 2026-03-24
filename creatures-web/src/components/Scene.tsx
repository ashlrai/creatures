import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './organism/WormBody';
import { NeuralNetwork3D } from './organism/NeuralNetwork3D';
import { ConnectomeGraph3D } from './organism/ConnectomeGraph3D';
import { SpikeParticles } from './organism/SpikeParticles';
import { PostProcessing } from './effects/PostProcessing';
import { useSimulationStore } from '../stores/simulationStore';

function SmoothCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.44, 0.015, 0));

  useFrame(() => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, z + 0.005, -y);
    targetRef.current.lerp(desired, 0.02);
    controlsRef.current.target.copy(targetRef.current);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.44, 0.015, 0]}
      minDistance={0.08}
      maxDistance={3}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
    />
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.44, 0.2, 0.6], fov: 40, near: 0.005, far: 10 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)',
      }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.15} color="#1a2545" />
      <directionalLight position={[1, 2, 1]} intensity={0.35} color="#6699cc" />
      <pointLight position={[0.44, 0.2, 0.15]} intensity={0.3} color="#4488bb" distance={2} decay={2} />
      <pointLight position={[0.44, 0.05, -0.1]} intensity={0.15} color="#6655aa" distance={1.5} decay={2} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.003, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#050508" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Particles */}
      <Sparkles count={30} size={0.15} speed={0.04} opacity={0.06} color="#3366aa" scale={[1.5, 0.4, 1]} position={[0.44, 0.1, 0]} />

      {/* Organism + Neural Network */}
      <WormBody />
      <NeuralNetwork3D />
      <ConnectomeGraph3D />
      <SpikeParticles />

      {/* Camera */}
      <SmoothCamera />

      {/* Post-processing */}
      <PostProcessing />
    </Canvas>
  );
}
