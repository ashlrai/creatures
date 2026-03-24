import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { WormBody } from './WormBody';

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.5, 0.3, 0.5], fov: 50 }}
      style={{ background: '#0a0a0a' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
      <pointLight position={[0, 0.5, 0]} intensity={0.3} color="#4488ff" />

      <WormBody />

      <Grid
        args={[4, 4]}
        cellSize={0.05}
        cellThickness={0.5}
        cellColor="#1a1a2e"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#16213e"
        fadeDistance={3}
        infiniteGrid
      />

      <OrbitControls
        target={[0.44, 0.02, 0]}
        minDistance={0.1}
        maxDistance={3}
        enableDamping
      />
    </Canvas>
  );
}
