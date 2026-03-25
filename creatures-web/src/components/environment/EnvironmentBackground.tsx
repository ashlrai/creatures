import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentBackgroundProps {
  worldType?: string; // "soil", "pond", "lab_plate", "abstract", or undefined (default)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Create a Float32Array of random particle positions within a box. */
function makeParticlePositions(
  count: number,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = cx + (Math.random() - 0.5) * sx;
    arr[i * 3 + 1] = cy + (Math.random() - 0.5) * sy;
    arr[i * 3 + 2] = cz + (Math.random() - 0.5) * sz;
  }
  return arr;
}

function makeParticleVelocities(
  count: number,
  vx: number, vy: number, vz: number,
): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (Math.random() - 0.5) * vx;
    arr[i * 3 + 1] = (Math.random() - 0.5) * vy;
    arr[i * 3 + 2] = (Math.random() - 0.5) * vz;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// DEFAULT — Dark space (current look)
// ---------------------------------------------------------------------------

function DefaultParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 60;

  const { positions, velocities } = useMemo(() => ({
    positions: makeParticlePositions(count, 0.44, 0.3, 0, 2.0, 0.6, 1.5),
    velocities: makeParticleVelocities(count, 0.004, 0.003, 0.004),
  }), []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities[i * 3];
      arr[i * 3 + 1] += velocities[i * 3 + 1] * 0.5 + 0.0005;
      arr[i * 3 + 2] += velocities[i * 3 + 2];
      if (arr[i * 3 + 1] > 0.7) arr[i * 3 + 1] = -0.05;
      if (Math.abs(arr[i * 3] - 0.44) > 1.5) arr[i * 3] = 0.44 + (Math.random() - 0.5) * 1.0;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
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

function DefaultGroundPlane() {
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(40, 60, 100, 0.12)';
    ctx.lineWidth = 1;
    const gridSpacing = size / 32;
    for (let i = 0; i <= 32; i++) {
      const pos = i * gridSpacing;
      ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(50, 80, 130, 0.18)';
    ctx.lineWidth = 1.5;
    const majorSpacing = size / 8;
    for (let i = 0; i <= 8; i++) {
      const pos = i * majorSpacing;
      ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
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
      <meshStandardMaterial map={texture} color="#080a10" roughness={0.95} metalness={0.05} transparent opacity={0.9} />
    </mesh>
  );
}

function DefaultEnvironment() {
  return (
    <>
      <color attach="background" args={['#020210']} />
      <fog attach="fog" args={['#020210', 3, 12]} />

      {/* Lighting */}
      <ambientLight intensity={0.15} color="#1a2a4a" />
      <directionalLight position={[5, 8, 3]} intensity={0.8} color="#88ccff" castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.3} color="#ff8844" />
      <pointLight position={[0.44, 0.3, 0.2]} intensity={0.5} color="#00d4ff" distance={5} decay={2} />
      <pointLight position={[0.44, 0.05, -0.1]} intensity={0.3} color="#6655aa" distance={2} decay={2} />
      <directionalLight position={[-0.5, 0.3, -1]} intensity={0.35} color="#4466aa" />
      <pointLight position={[0.44, 0.1, -0.25]} intensity={0.2} color="#335588" distance={2} decay={2} />
      <pointLight position={[0.44, -0.1, 0.05]} intensity={0.15} color="#ff6633" distance={1.5} decay={2} />

      {/* Ground */}
      <DefaultGroundPlane />
      <gridHelper args={[4, 40, '#0a1525', '#0a1525']} position={[0.44, -0.01, 0]} />

      {/* Particles */}
      <Sparkles count={60} size={0.35} speed={0.06} opacity={0.15} color="#4488dd" scale={[2.0, 0.6, 1.5]} position={[0.44, 0.15, 0]} />
      <DefaultParticles />
    </>
  );
}

// ---------------------------------------------------------------------------
// SOIL — Warm earth tones, drifting soil particles, root structures
// ---------------------------------------------------------------------------

function SoilGroundPlane() {
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base earth fill
    ctx.fillStyle = '#0d0804';
    ctx.fillRect(0, 0, size, size);

    // Procedural soil noise — random small dots of varying brown tones
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 2.5 + 0.5;
      const lightness = 8 + Math.random() * 12;
      const hue = 20 + Math.random() * 15;
      ctx.fillStyle = `hsla(${hue}, 50%, ${lightness}%, ${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Darker patches
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 10 + Math.random() * 30;
      ctx.fillStyle = `rgba(5, 3, 1, ${0.2 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.003, 0]}>
      <planeGeometry args={[5, 5]} />
      <meshStandardMaterial map={texture} color="#1a0e06" roughness={1} metalness={0} />
    </mesh>
  );
}

/** Slowly drifting soil particles — tiny amber/brown specks. */
function SoilParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 120;

  const { positions, velocities, colors } = useMemo(() => {
    const pos = makeParticlePositions(count, 0.44, 0.15, 0, 2.5, 0.5, 2.0);
    const vel = makeParticleVelocities(count, 0.002, 0.001, 0.002);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Warm brown to amber palette
      const t = Math.random();
      col[i * 3] = 0.35 + t * 0.25;     // R
      col[i * 3 + 1] = 0.18 + t * 0.12; // G
      col[i * 3 + 2] = 0.06 + t * 0.04; // B
    }
    return { positions: pos, velocities: vel, colors: col };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const time = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      // Slow brownian drift with gentle sine wobble
      arr[idx] += velocities[idx] + Math.sin(time * 0.3 + i) * 0.0002;
      arr[idx + 1] += velocities[idx + 1] * 0.3;
      arr[idx + 2] += velocities[idx + 2] + Math.cos(time * 0.2 + i * 0.5) * 0.0002;
      // Wrap
      if (arr[idx + 1] > 0.5) arr[idx + 1] = -0.02;
      if (arr[idx + 1] < -0.03) arr[idx + 1] = 0.45;
      if (Math.abs(arr[idx] - 0.44) > 1.8) arr[idx] = 0.44 + (Math.random() - 0.5) * 1.5;
      if (Math.abs(arr[idx + 2]) > 1.3) arr[idx + 2] = (Math.random() - 0.5) * 1.0;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={colors} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.008}
        sizeAttenuation
        transparent
        opacity={0.35}
        vertexColors
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/** Background root-like curved lines in the soil. */
function SoilRoots() {
  const roots = useMemo(() => {
    const result: THREE.Vector3[][] = [];
    for (let r = 0; r < 8; r++) {
      const points: THREE.Vector3[] = [];
      const startX = 0.44 + (Math.random() - 0.5) * 3;
      const startZ = (Math.random() - 0.5) * 2;
      let x = startX;
      let y = -0.002;
      let z = startZ;
      const segments = 8 + Math.floor(Math.random() * 8);
      const angle = Math.random() * Math.PI * 2;
      for (let s = 0; s < segments; s++) {
        points.push(new THREE.Vector3(x, y, z));
        x += Math.cos(angle + Math.sin(s * 0.5) * 0.8) * 0.06;
        y -= 0.002 + Math.random() * 0.003;
        z += Math.sin(angle + Math.cos(s * 0.3) * 0.5) * 0.04;
      }
      result.push(points);
    }
    return result;
  }, []);

  return (
    <group>
      {roots.map((pts, i) => {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.003 + Math.random() * 0.003, 4, false);
        return (
          <mesh key={i} geometry={tubeGeo}>
            <meshStandardMaterial color="#1a0d04" roughness={1} transparent opacity={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

function SoilEnvironment() {
  return (
    <>
      <color attach="background" args={['#0a0604']} />
      <fog attach="fog" args={['#0a0604', 2, 8]} />

      {/* Warm earth lighting */}
      <ambientLight intensity={0.12} color="#2a1a0a" />
      <directionalLight position={[4, 6, 2]} intensity={0.6} color="#cc8844" castShadow />
      <directionalLight position={[-2, 3, -1]} intensity={0.25} color="#664422" />
      <pointLight position={[0.44, 0.25, 0.15]} intensity={0.4} color="#dd9944" distance={4} decay={2} />
      <pointLight position={[0.44, 0.05, -0.1]} intensity={0.25} color="#8b5e3c" distance={2} decay={2} />
      {/* Warm rim light */}
      <directionalLight position={[-0.5, 0.2, -0.8]} intensity={0.2} color="#664433" />
      {/* Amber accent from below */}
      <pointLight position={[0.44, -0.08, 0.05]} intensity={0.15} color="#cc6622" distance={1.5} decay={2} />

      <SoilGroundPlane />
      <SoilRoots />
      <SoilParticles />

      {/* Subtle warm sparkles */}
      <Sparkles count={40} size={0.25} speed={0.03} opacity={0.1} color="#cc8844" scale={[2.0, 0.4, 1.5]} position={[0.44, 0.1, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// POND — Underwater blue-green, caustics, plankton, god rays
// ---------------------------------------------------------------------------

function PondGroundPlane() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Sandy/muddy bottom
    ctx.fillStyle = '#060d0f';
    ctx.fillRect(0, 0, size, size);

    // Sandy particles
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 2 + 0.3;
      const l = 6 + Math.random() * 10;
      ctx.fillStyle = `hsla(${180 + Math.random() * 30}, 30%, ${l}%, ${0.2 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  // Caustic overlay texture — animated UV offset
  const causticTex = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, size, size);

    // Create caustic-like light blobs
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 5 + Math.random() * 20;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(100, 220, 200, ${0.08 + Math.random() * 0.1})`);
      grad.addColorStop(0.5, `rgba(60, 180, 160, ${0.03 + Math.random() * 0.04})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }, []);

  // Animate caustic UV offset
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    causticTex.offset.x = Math.sin(t * 0.08) * 0.3;
    causticTex.offset.y = Math.cos(t * 0.06) * 0.3;
  });

  return (
    <group>
      {/* Main ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.003, 0]}>
        <planeGeometry args={[5, 5]} />
        <meshStandardMaterial ref={matRef} map={texture} color="#0a1518" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Caustic overlay — slightly above ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.001, 0]}>
        <planeGeometry args={[5, 5]} />
        <meshStandardMaterial
          map={causticTex}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/** Plankton — tiny green dots drifting upward, with some sideways current. */
function PondPlankton() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 100;

  const { positions, velocities, colors } = useMemo(() => {
    const pos = makeParticlePositions(count, 0.44, 0.15, 0, 2.5, 0.6, 2.0);
    const vel = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Upward drift + sideways current
      vel[i * 3] = 0.0005 + Math.random() * 0.001; // rightward current
      vel[i * 3 + 1] = 0.0003 + Math.random() * 0.0008; // upward
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.0004;
      // Green to cyan palette
      const t = Math.random();
      col[i * 3] = 0.05 + t * 0.1;
      col[i * 3 + 1] = 0.4 + t * 0.35;
      col[i * 3 + 2] = 0.2 + t * 0.3;
    }
    return { positions: pos, velocities: vel, colors: col };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const time = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      arr[idx] += velocities[idx] + Math.sin(time * 0.5 + i * 0.7) * 0.0003;
      arr[idx + 1] += velocities[idx + 1];
      arr[idx + 2] += velocities[idx + 2] + Math.cos(time * 0.4 + i * 0.3) * 0.0002;
      // Wrap
      if (arr[idx + 1] > 0.6) { arr[idx + 1] = -0.02; arr[idx] = 0.44 + (Math.random() - 0.5) * 2; }
      if (Math.abs(arr[idx] - 0.44) > 1.8) arr[idx] = 0.44 - 1.2 + Math.random() * 0.3;
      if (Math.abs(arr[idx + 2]) > 1.3) arr[idx + 2] = (Math.random() - 0.5) * 0.8;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={colors} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.006}
        sizeAttenuation
        transparent
        opacity={0.45}
        vertexColors
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/** God-ray cone from above — a simple translucent cone mesh. */
function GodRays() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    // Subtle sway and breathing
    meshRef.current.rotation.z = Math.sin(t * 0.15) * 0.04;
    meshRef.current.rotation.x = Math.cos(t * 0.1) * 0.02;
    const s = 0.95 + Math.sin(t * 0.3) * 0.05;
    meshRef.current.scale.set(s, 1, s);
  });

  return (
    <group>
      {/* Primary ray */}
      <mesh ref={meshRef} position={[0.44, 0.7, -0.1]} rotation={[0, 0, 0.05]}>
        <coneGeometry args={[0.6, 1.8, 16, 1, true]} />
        <meshBasicMaterial
          color="#1a5566"
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Secondary offset ray */}
      <mesh position={[0.7, 0.65, 0.2]} rotation={[0.05, 0, -0.08]}>
        <coneGeometry args={[0.4, 1.5, 12, 1, true]} />
        <meshBasicMaterial
          color="#1a6655"
          transparent
          opacity={0.025}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function PondEnvironment() {
  return (
    <>
      <color attach="background" args={['#020a0d']} />
      <fog attach="fog" args={['#020a0d', 2, 7]} />

      {/* Underwater lighting */}
      <ambientLight intensity={0.1} color="#0a2a2a" />
      <directionalLight position={[2, 8, 1]} intensity={0.5} color="#44aaaa" castShadow />
      <directionalLight position={[-2, 5, -1]} intensity={0.2} color="#226655" />
      <pointLight position={[0.44, 0.4, 0.1]} intensity={0.35} color="#00ccaa" distance={5} decay={2} />
      <pointLight position={[0.44, 0.05, -0.15]} intensity={0.2} color="#225566" distance={2} decay={2} />
      {/* Surface light from above */}
      <spotLight
        position={[0.44, 2.5, 0]}
        angle={0.5}
        penumbra={0.8}
        intensity={0.6}
        color="#3399aa"
        distance={6}
        decay={2}
        target-position={[0.44, 0, 0]}
      />
      {/* Deep accent */}
      <pointLight position={[0.44, -0.1, 0]} intensity={0.1} color="#003344" distance={2} decay={2} />

      <PondGroundPlane />
      <GodRays />
      <PondPlankton />

      {/* Tiny water sparkles */}
      <Sparkles count={50} size={0.2} speed={0.04} opacity={0.12} color="#44ccaa" scale={[2.0, 0.5, 1.5]} position={[0.44, 0.12, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// LAB PLATE — Clean, bright, clinical
// ---------------------------------------------------------------------------

function LabPlateGround() {
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Clean white-grey lab surface
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, 0, size, size);

    // Very subtle cross-hatch pattern like microscope grid
    ctx.strokeStyle = 'rgba(60, 70, 90, 0.08)';
    ctx.lineWidth = 0.5;
    const spacing = size / 64;
    for (let i = 0; i <= 64; i++) {
      const pos = i * spacing;
      ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }, []);

  // E. coli lawn — subtle yellow-green textured disc in center
  const lawnTexture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, size, size);

    // Circular lawn gradient
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.45);
    grad.addColorStop(0, 'rgba(80, 90, 30, 0.15)');
    grad.addColorStop(0.7, 'rgba(60, 70, 20, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Small bacterial colony dots
    for (let i = 0; i < 400; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * size * 0.4;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const r = 0.5 + Math.random() * 1.5;
      ctx.fillStyle = `rgba(90, 100, 35, ${0.1 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  return (
    <group>
      {/* Lab surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.005, 0]}>
        <planeGeometry args={[5, 5]} />
        <meshStandardMaterial map={texture} color="#0e1018" roughness={0.7} metalness={0.15} />
      </mesh>

      {/* Petri dish — circular rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.003, 0]}>
        <ringGeometry args={[0.9, 0.95, 64]} />
        <meshStandardMaterial color="#334455" roughness={0.3} metalness={0.4} transparent opacity={0.6} />
      </mesh>

      {/* Petri dish inner surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.004, 0]}>
        <circleGeometry args={[0.9, 64]} />
        <meshStandardMaterial color="#0d1018" roughness={0.8} metalness={0.05} />
      </mesh>

      {/* E. coli lawn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.44, -0.002, 0]}>
        <circleGeometry args={[0.7, 48]} />
        <meshStandardMaterial
          map={lawnTexture}
          transparent
          opacity={0.6}
          roughness={1}
          metalness={0}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
}

function LabPlateEnvironment() {
  return (
    <>
      <color attach="background" args={['#0a0c10']} />
      <fog attach="fog" args={['#0a0c10', 4, 14]} />

      {/* Bright clinical lighting — like a microscope lamp */}
      <ambientLight intensity={0.25} color="#c0c8d0" />
      <directionalLight position={[0, 10, 0]} intensity={1.0} color="#dde4ee" castShadow />
      <directionalLight position={[3, 6, 2]} intensity={0.3} color="#aabbcc" />
      <pointLight position={[0.44, 0.5, 0]} intensity={0.6} color="#eef2ff" distance={4} decay={2} />
      {/* Subtle cool fill */}
      <directionalLight position={[-2, 3, -1]} intensity={0.15} color="#8899bb" />
      {/* Microscope spotlight from directly above */}
      <spotLight
        position={[0.44, 2.0, 0]}
        angle={0.35}
        penumbra={0.6}
        intensity={0.8}
        color="#f0f4ff"
        distance={5}
        decay={2}
      />

      <LabPlateGround />

      {/* Very minimal particles — just a few floating dust specks in the light */}
      <Sparkles count={20} size={0.15} speed={0.02} opacity={0.08} color="#8899aa" scale={[1.5, 0.4, 1.0]} position={[0.44, 0.15, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// ABSTRACT — Digital/matrix/synthwave
// ---------------------------------------------------------------------------

function AbstractGrid() {
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  useFrame((state) => {
    if (!matRef.current) return;
    const t = state.clock.elapsedTime;
    // Subtle pulse in the grid opacity
    matRef.current.opacity = 0.15 + Math.sin(t * 0.5) * 0.05;
  });

  return (
    <group position={[0.44, -0.003, 0]}>
      <gridHelper args={[4, 40, '#00cccc', '#005566']} />
      {/* Additional finer grid on top */}
      <gridHelper args={[4, 80, '#003344', '#002233']} position={[0, 0.001, 0]} />
    </group>
  );
}

/** Floating geometric obstacles. */
function AbstractShapes() {
  const groupRef = useRef<THREE.Group>(null);
  const shapesData = useMemo(() => {
    const data: { pos: [number, number, number]; rot: [number, number, number]; scale: number; type: 'cube' | 'ico'; color: string }[] = [];
    for (let i = 0; i < 12; i++) {
      data.push({
        pos: [
          0.44 + (Math.random() - 0.5) * 3,
          0.05 + Math.random() * 0.5,
          (Math.random() - 0.5) * 2,
        ],
        rot: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
        scale: 0.015 + Math.random() * 0.03,
        type: Math.random() > 0.5 ? 'cube' : 'ico',
        color: Math.random() > 0.5 ? '#00ffdd' : '#ff44aa',
      });
    }
    return data;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      child.rotation.x += 0.003 + i * 0.0005;
      child.rotation.y += 0.002 + i * 0.0003;
      child.position.y += Math.sin(t * 0.5 + i * 1.2) * 0.0001;
    });
  });

  return (
    <group ref={groupRef}>
      {shapesData.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} scale={s.scale}>
          {s.type === 'cube' ? <boxGeometry args={[1, 1, 1]} /> : <icosahedronGeometry args={[1, 0]} />}
          <meshStandardMaterial
            color={s.color}
            wireframe
            transparent
            opacity={0.35}
            emissive={s.color}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Neon-colored drifting particles. */
function AbstractParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 80;

  const { positions, velocities, colors } = useMemo(() => {
    const pos = makeParticlePositions(count, 0.44, 0.2, 0, 3.0, 0.6, 2.0);
    const vel = makeParticleVelocities(count, 0.003, 0.002, 0.003);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      if (Math.random() > 0.5) {
        // Cyan
        col[i * 3] = 0; col[i * 3 + 1] = 0.8 + Math.random() * 0.2; col[i * 3 + 2] = 0.9;
      } else {
        // Magenta
        col[i * 3] = 0.9 + Math.random() * 0.1; col[i * 3 + 1] = 0.1; col[i * 3 + 2] = 0.6 + Math.random() * 0.2;
      }
    }
    return { positions: pos, velocities: vel, colors: col };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const time = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      arr[idx] += velocities[idx] + Math.sin(time + i * 2) * 0.0003;
      arr[idx + 1] += velocities[idx + 1] * 0.5;
      arr[idx + 2] += velocities[idx + 2];
      if (arr[idx + 1] > 0.6) arr[idx + 1] = 0;
      if (arr[idx + 1] < -0.05) arr[idx + 1] = 0.55;
      if (Math.abs(arr[idx] - 0.44) > 2) arr[idx] = 0.44 + (Math.random() - 0.5) * 1.5;
      if (Math.abs(arr[idx + 2]) > 1.5) arr[idx + 2] = (Math.random() - 0.5) * 1;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={colors} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.01}
        sizeAttenuation
        transparent
        opacity={0.5}
        vertexColors
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function AbstractEnvironment() {
  return (
    <>
      <color attach="background" args={['#010108']} />
      <fog attach="fog" args={['#010108', 3, 10]} />

      {/* Synthwave lighting — neon accents */}
      <ambientLight intensity={0.08} color="#0a0a20" />
      <directionalLight position={[4, 6, 2]} intensity={0.4} color="#00dddd" castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.3} color="#ff44aa" />
      <pointLight position={[0.44, 0.3, 0.2]} intensity={0.4} color="#00ffcc" distance={5} decay={2} />
      <pointLight position={[0.44, 0.05, -0.15]} intensity={0.3} color="#cc44ff" distance={3} decay={2} />
      {/* Neon rim */}
      <directionalLight position={[-0.5, 0.3, -1]} intensity={0.25} color="#ff00aa" />
      <pointLight position={[0.44, -0.08, 0]} intensity={0.15} color="#0066ff" distance={2} decay={2} />

      <AbstractGrid />
      <AbstractShapes />
      <AbstractParticles />

      {/* Neon sparkles */}
      <Sparkles count={40} size={0.3} speed={0.05} opacity={0.18} color="#00ffcc" scale={[2.5, 0.5, 1.5]} position={[0.44, 0.15, 0]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function EnvironmentBackground({ worldType }: EnvironmentBackgroundProps) {
  switch (worldType) {
    case 'soil':
      return <SoilEnvironment />;
    case 'pond':
      return <PondEnvironment />;
    case 'lab_plate':
      return <LabPlateEnvironment />;
    case 'abstract':
      return <AbstractEnvironment />;
    default:
      return <DefaultEnvironment />;
  }
}
