import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './organism/WormBody';
import { NeuralNetwork3D } from './organism/NeuralNetwork3D';
import { ConnectomeGraph3D } from './organism/ConnectomeGraph3D';
import { SpikeParticles } from './organism/SpikeParticles';
import { PostProcessing } from './effects/PostProcessing';
import { PerformanceMonitor } from './ui/PerformanceMonitor';
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

/** Subtle grid ground plane */
function GroundPlane() {
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill background
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, size, size);

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.12)';
    ctx.lineWidth = 1;
    const gridSpacing = size / 32;
    for (let i = 0; i <= 32; i++) {
      const pos = i * gridSpacing;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Major grid lines every 4 cells
    ctx.strokeStyle = 'rgba(50, 80, 130, 0.18)';
    ctx.lineWidth = 1.5;
    const majorSpacing = size / 8;
    for (let i = 0; i <= 8; i++) {
      const pos = i * majorSpacing;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.003, 0]}>
      <planeGeometry args={[4, 4]} />
      <meshStandardMaterial
        map={texture}
        color="#080a10"
        roughness={0.95}
        metalness={0.05}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

/** Large slow-drifting ambient particles for depth and atmosphere */
function AmbientParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 60;

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.3) * 2.0 + 0.44;
      pos[i * 3 + 1] = Math.random() * 0.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      vel[i * 3] = (Math.random() - 0.5) * 0.002;
      vel[i * 3 + 1] = Math.random() * 0.001 + 0.0005;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
    }
    return { positions: pos, velocities: vel };
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities[i * 3];
      arr[i * 3 + 1] += velocities[i * 3 + 1];
      arr[i * 3 + 2] += velocities[i * 3 + 2];

      // Wrap around if drifted too far
      if (arr[i * 3 + 1] > 0.7) {
        arr[i * 3 + 1] = -0.05;
      }
      if (Math.abs(arr[i * 3] - 0.44) > 1.5) {
        arr[i * 3] = 0.44 + (Math.random() - 0.5) * 1.0;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#3366cc"
        size={0.012}
        sizeAttenuation
        transparent
        opacity={0.15}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.44, 0.2, 0.6], fov: 34, near: 0.005, far: 15 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)',
      }}
    >
      {/* Scene background and fog for atmospheric depth */}
      <color attach="background" args={['#020210']} />
      <fog attach="fog" args={['#020210', 3, 12]} />

      {/* Lighting — dramatic key, fill, rim, accent */}
      <ambientLight intensity={0.15} color="#1a2a4a" />
      <directionalLight position={[5, 8, 3]} intensity={0.8} color="#88ccff" castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.3} color="#ff8844" />
      <pointLight position={[0.44, 0.3, 0.2]} intensity={0.5} color="#00d4ff" distance={5} decay={2} />
      <pointLight position={[0.44, 0.05, -0.1]} intensity={0.3} color="#6655aa" distance={2} decay={2} />
      {/* Rim light from behind for depth separation */}
      <directionalLight position={[-0.5, 0.3, -1]} intensity={0.35} color="#4466aa" />
      <pointLight position={[0.44, 0.1, -0.25]} intensity={0.2} color="#335588" distance={2} decay={2} />
      {/* Warm accent from below for drama */}
      <pointLight position={[0.44, -0.1, 0.05]} intensity={0.15} color="#ff6633" distance={1.5} decay={2} />

      {/* Ground with grid */}
      <GroundPlane />
      <gridHelper args={[4, 40, '#0a1525', '#0a1525']} position={[0.44, -0.01, 0]} />

      {/* Particles — small sparkles + large ambient drifters */}
      <Sparkles count={60} size={0.35} speed={0.06} opacity={0.15} color="#4488dd" scale={[2.0, 0.6, 1.5]} position={[0.44, 0.15, 0]} />
      <AmbientParticles />

      {/* Organism + Neural Network */}
      <WormBody />
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
