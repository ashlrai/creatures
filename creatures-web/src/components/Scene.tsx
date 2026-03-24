import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sparkles, MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './organism/WormBody';
import { NeuralNetwork3D } from './organism/NeuralNetwork3D';
import { ConnectomeGraph3D } from './organism/ConnectomeGraph3D';
import { PostProcessing } from './effects/PostProcessing';
import { useSimulationStore } from '../stores/simulationStore';

function SmoothCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.44, 0.02, 0));

  useFrame(() => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, z + 0.01, -y);
    targetRef.current.lerp(desired, 0.025);
    controlsRef.current.target.copy(targetRef.current);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.44, 0.02, 0]}
      minDistance={0.05}
      maxDistance={2}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
    />
  );
}

function ReflectiveGround() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.001, 0]}>
      <planeGeometry args={[6, 6]} />
      <MeshReflectorMaterial
        blur={[300, 80]}
        resolution={512}
        mixBlur={15}
        mixStrength={0.35}
        roughness={0.85}
        depthScale={1.2}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#080812"
        metalness={0.15}
        mirror={0.25}
      />
    </mesh>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.55, 0.18, 0.32], fov: 48, near: 0.005 }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, #0c1228 0%, #050510 55%, #020206 100%)',
      }}
    >
      {/* Atmospheric fog */}
      <fogExp2 attach="fog" args={['#050510', 0.55]} />

      {/* Moody lighting */}
      <ambientLight intensity={0.1} color="#182040" />
      <pointLight position={[0.55, 0.35, 0.15]} intensity={0.45} color="#3388cc" distance={2.5} decay={2} />
      <pointLight position={[0.3, 0.08, -0.2]} intensity={0.2} color="#6644aa" distance={1.8} decay={2} />
      <spotLight
        position={[0.44, 0.7, 0.05]}
        angle={0.5}
        penumbra={0.95}
        intensity={0.25}
        color="#ffffff"
        distance={3}
      />

      {/* Environment */}
      <ReflectiveGround />
      <Sparkles
        count={50}
        size={0.25}
        speed={0.08}
        opacity={0.1}
        color="#4488aa"
        scale={[2, 0.8, 1.5]}
        position={[0.44, 0.15, 0]}
      />

      {/* Organism */}
      <WormBody />
      <NeuralNetwork3D />
      <ConnectomeGraph3D />

      {/* Camera */}
      <SmoothCamera />

      {/* Post-processing */}
      <PostProcessing />
    </Canvas>
  );
}
