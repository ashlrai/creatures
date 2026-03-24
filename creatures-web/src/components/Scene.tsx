import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './WormBody';
import { useSimulationStore } from '../stores/simulationStore';

function SmoothCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.44, 0.02, 0));

  useFrame(() => {
    if (!frame?.center_of_mass || !controlsRef.current) return;
    const [x, y, z] = frame.center_of_mass;
    const desired = new THREE.Vector3(x, z, -y);
    targetRef.current.lerp(desired, 0.03); // smooth follow
    controlsRef.current.target.copy(targetRef.current);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.44, 0.02, 0]}
      minDistance={0.05}
      maxDistance={3}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.5, 0.15, 0.3], fov: 50, near: 0.005 }}
      style={{ background: '#060610' }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[2, 4, 1]} intensity={0.6} color="#ffffff" />
      <directionalLight position={[-1, 2, -1]} intensity={0.25} color="#6688ff" />

      <WormBody />

      <Grid
        args={[4, 4]}
        cellSize={0.02}
        cellThickness={0.4}
        cellColor="#0d0d1a"
        sectionSize={0.1}
        sectionThickness={0.8}
        sectionColor="#151530"
        fadeDistance={1.5}
        infiniteGrid
        position={[0.44, 0, 0]}
      />

      <SmoothCamera />
    </Canvas>
  );
}
