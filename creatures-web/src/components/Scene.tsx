import { useRef, useState } from 'react';
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

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.002, 0]} receiveShadow>
      <planeGeometry args={[6, 6]} />
      <meshStandardMaterial color="#060610" roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

export function Scene() {
  const [canvasError, setCanvasError] = useState(false);

  if (canvasError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        3D rendering unavailable. Try refreshing.
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0.44, 0.25, 0.55], fov: 45, near: 0.005, far: 10 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, #0c1228 0%, #050510 55%, #020206 100%)',
      }}
      onCreated={({ gl }) => {
        console.log('Three.js canvas created', gl.info);
      }}
    >
      {/* Lighting — moody but visible */}
      <ambientLight intensity={0.25} color="#1a2545" />
      <pointLight position={[0.55, 0.4, 0.2]} intensity={0.6} color="#4499dd" distance={3} decay={2} />
      <pointLight position={[0.3, 0.1, -0.2]} intensity={0.3} color="#7755bb" distance={2} decay={2} />
      <spotLight position={[0.44, 0.8, 0.1]} angle={0.6} penumbra={0.9} intensity={0.4} color="#ffffff" distance={4} />

      {/* Ground */}
      <GroundPlane />

      {/* Particles */}
      <Sparkles count={40} size={0.2} speed={0.06} opacity={0.08} color="#4488aa" scale={[2, 0.6, 1.5]} position={[0.44, 0.15, 0]} />

      {/* Organism + Neural Network */}
      <WormBody />
      <NeuralNetwork3D />
      <ConnectomeGraph3D />
      <SpikeParticles />

      {/* Camera */}
      <SmoothCamera />

      {/* Post-processing (optional — fails gracefully) */}
      <PostProcessing />
    </Canvas>
  );
}
