import { useRef, useMemo } from 'react';
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
        color="#2244aa"
        size={0.008}
        sizeAttenuation
        transparent
        opacity={0.08}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0.44, 0.25, 0.8], fov: 36, near: 0.005, far: 10 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)',
      }}
    >
      {/* Lighting — key, fill, rim */}
      <ambientLight intensity={0.2} color="#1a2545" />
      <directionalLight position={[1, 2, 1]} intensity={0.4} color="#6699cc" />
      <pointLight position={[0.44, 0.2, 0.15]} intensity={0.35} color="#4488bb" distance={2} decay={2} />
      <pointLight position={[0.44, 0.05, -0.1]} intensity={0.2} color="#6655aa" distance={1.5} decay={2} />
      {/* Rim light from behind for depth separation */}
      <directionalLight position={[-0.5, 0.3, -1]} intensity={0.25} color="#4466aa" />
      <pointLight position={[0.44, 0.1, -0.25]} intensity={0.15} color="#335588" distance={1.5} decay={2} />

      {/* Ground with grid */}
      <GroundPlane />

      {/* Particles — small sparkles + large ambient drifters */}
      <Sparkles count={40} size={0.18} speed={0.04} opacity={0.08} color="#3366aa" scale={[1.5, 0.4, 1]} position={[0.44, 0.1, 0]} />
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
    </Canvas>
  );
}
