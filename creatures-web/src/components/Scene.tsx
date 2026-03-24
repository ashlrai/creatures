import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { WormBody } from './WormBody';
import { useSimulationStore } from '../stores/simulationStore';

function AutoCamera() {
  const frame = useSimulationStore((s) => s.frame);
  // Camera target follows the worm's center of mass
  const target: [number, number, number] = frame?.center_of_mass
    ? [frame.center_of_mass[0], frame.center_of_mass[2], -frame.center_of_mass[1]]
    : [0.44, 0.02, 0];

  return (
    <OrbitControls
      target={target}
      minDistance={0.05}
      maxDistance={3}
      enableDamping
      dampingFactor={0.1}
    />
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.5, 0.15, 0.3], fov: 50, near: 0.001 }}
      style={{ background: '#060610' }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 3, 1]} intensity={0.7} color="#ffffff" />
      <directionalLight position={[-1, 2, -1]} intensity={0.3} color="#4488ff" />
      <pointLight position={[0.44, 0.1, 0]} intensity={0.2} color="#ff8844" distance={0.5} />

      <WormBody />

      <Grid
        args={[4, 4]}
        cellSize={0.02}
        cellThickness={0.5}
        cellColor="#111122"
        sectionSize={0.1}
        sectionThickness={1}
        sectionColor="#1a1a3e"
        fadeDistance={2}
        infiniteGrid
        position={[0.44, 0, 0]}
      />

      <AutoCamera />
    </Canvas>
  );
}
