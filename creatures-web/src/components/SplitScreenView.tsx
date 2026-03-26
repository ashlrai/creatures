/**
 * SplitScreenView — dual-canvas layout showing organism + brain side by side.
 *
 * LEFT:  World View — organism moving through a realistic environment
 * RIGHT: Brain View — neural network activity, connectome, consciousness
 *
 * Both canvases share the same simulation state via Zustand stores.
 */
import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Text } from '@react-three/drei';
import * as THREE from 'three';
import { WormBody } from './organism/WormBody';
import { FlyBody3D } from './organism/FlyBody3D';
import { ZebraFishBody3D } from './organism/ZebraFishBody3D';
import { NeuralNetwork3D } from './organism/NeuralNetwork3D';
import { ConnectomeGraph3D } from './organism/ConnectomeGraph3D';
import { SpikeParticles } from './organism/SpikeParticles';
import { PostProcessing } from './effects/PostProcessing';
import { ConsciousnessEffects } from './effects/ConsciousnessEffects';
import { useSimulationStore } from '../stores/simulationStore';

// ── World View Camera ────────────────────────────────────────────
function WorldCamera() {
  const frame = useSimulationStore((s) => s.frame);
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0.3, 0.02, 0));
  const hasSnapped = useRef(false);

  useFrame(({ camera }) => {
    if (!controlsRef.current) return;

    if (frame?.center_of_mass) {
      const [x, y, z] = frame.center_of_mass;
      const desired = new THREE.Vector3(x, z + 0.02, -y);

      if (!hasSnapped.current) {
        targetRef.current.copy(desired);
        controlsRef.current.target.copy(desired);
        camera.position.set(desired.x + 0.1, desired.y + 0.1, desired.z + 0.2);
        hasSnapped.current = true;
      } else {
        targetRef.current.lerp(desired, 0.04);
        controlsRef.current.target.copy(targetRef.current);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0.3, 0.02, 0]}
      minDistance={0.08}
      maxDistance={3}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.4}
      autoRotate
      autoRotateSpeed={0.12}
      maxPolarAngle={Math.PI * 0.48}
    />
  );
}

// ── World Environment ────────────────────────────────────────────
function WorldEnvironment({ worldType }: { worldType: string }) {
  const groundColor = useMemo(() => {
    switch (worldType) {
      case 'soil': return '#2a1a0a';
      case 'pond': return '#0a1828';
      case 'garden': return '#1a2a0a';
      case 'lab_plate': return '#1a1a1a';
      default: return '#0a0f18';
    }
  }, [worldType]);

  const fogColor = useMemo(() => {
    switch (worldType) {
      case 'soil': return '#1a0f08';
      case 'pond': return '#061828';
      case 'garden': return '#0a1a05';
      default: return '#060810';
    }
  }, [worldType]);

  return (
    <>
      {/* Fog for depth */}
      <fog attach="fog" args={[fogColor, 0.5, 4]} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.3, -0.01, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={groundColor} roughness={0.9} metalness={0.0} />
      </mesh>

      {/* Subtle grid for scale reference */}
      <gridHelper args={[3, 30, '#0a1520', '#060c15']} position={[0.3, -0.009, 0]} />

      {/* Environment-specific elements */}
      {worldType === 'garden' && <GardenElements />}
      {worldType === 'pond' && <PondElements />}
      {worldType === 'soil' && <SoilElements />}

      {/* Atmospheric particles */}
      <EnvironmentParticles worldType={worldType} />
    </>
  );
}

function GardenElements() {
  return (
    <group position={[0.3, 0, 0]}>
      {/* Scattered food sources — small, worm-scale */}
      {[
        [-0.15, 0.005, 0.1, 0.008, '#88cc44'],
        [0.2, 0.004, -0.08, 0.006, '#aacc22'],
        [-0.08, 0.006, -0.15, 0.01, '#cc8844'],
        [0.12, 0.005, 0.12, 0.007, '#66aa33'],
        [-0.2, 0.004, 0.05, 0.005, '#ccaa33'],
      ].map(([x, y, z, r, color], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
          <sphereGeometry args={[r as number, 8, 8]} />
          <meshStandardMaterial
            color={color as string}
            roughness={0.6}
            emissive={color as string}
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}
      {/* Leaf debris on ground */}
      {Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2 + 0.3;
        const r = 0.1 + Math.random() * 0.15;
        return (
          <mesh key={`leaf-${i}`} position={[Math.cos(angle) * r, 0.001, Math.sin(angle) * r]}
            rotation={[-Math.PI / 2 + 0.05, angle + 0.5, 0]}>
            <planeGeometry args={[0.02 + Math.random() * 0.02, 0.03 + Math.random() * 0.02]} />
            <meshStandardMaterial color="#2a4a1a" roughness={0.8} side={THREE.DoubleSide}
              transparent opacity={0.6} />
          </mesh>
        );
      })}
      {/* Tiny rocks for texture */}
      {Array.from({ length: 10 }, (_, i) => {
        const x = (Math.random() - 0.5) * 0.4;
        const z = (Math.random() - 0.5) * 0.4;
        return (
          <mesh key={`rock-${i}`} position={[x, -0.003, z]}
            rotation={[Math.random(), Math.random(), 0]}>
            <dodecahedronGeometry args={[0.003 + Math.random() * 0.004, 0]} />
            <meshStandardMaterial color="#3a3a2a" roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

function PondElements() {
  const waterRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!waterRef.current) return;
    (waterRef.current.material as THREE.MeshStandardMaterial).opacity =
      0.3 + Math.sin(clock.elapsedTime * 0.5) * 0.05;
  });

  return (
    <group>
      {/* Water surface */}
      <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial
          color="#1a4466"
          transparent
          opacity={0.3}
          roughness={0.1}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Pebbles */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 0.3 + Math.random() * 0.5;
        return (
          <mesh key={i} position={[Math.cos(angle) * r, -0.005, Math.sin(angle) * r]}>
            <sphereGeometry args={[0.01 + Math.random() * 0.015, 6, 6]} />
            <meshStandardMaterial color="#4a4a3a" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function SoilElements() {
  return (
    <group>
      {/* Small rocks/debris */}
      {Array.from({ length: 12 }, (_, i) => {
        const x = (Math.random() - 0.5) * 1.5;
        const z = (Math.random() - 0.5) * 1.5;
        return (
          <mesh key={i} position={[x, -0.005, z]} rotation={[Math.random(), Math.random(), 0]}>
            <dodecahedronGeometry args={[0.008 + Math.random() * 0.01, 0]} />
            <meshStandardMaterial color="#3a2a1a" roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

function EnvironmentParticles({ worldType }: { worldType: string }) {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 200;

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 1] = Math.random() * 1.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3;

      const brightness = 0.1 + Math.random() * 0.15;
      if (worldType === 'pond') {
        col[i * 3] = brightness * 0.5;
        col[i * 3 + 1] = brightness * 0.8;
        col[i * 3 + 2] = brightness;
      } else if (worldType === 'garden') {
        col[i * 3] = brightness * 0.8;
        col[i * 3 + 1] = brightness;
        col[i * 3 + 2] = brightness * 0.5;
      } else {
        col[i * 3] = brightness;
        col[i * 3 + 1] = brightness * 0.9;
        col[i * 3 + 2] = brightness * 0.7;
      }
    }
    return { positions: pos, colors: col };
  }, [worldType]);

  useFrame(({ clock }) => {
    if (!particlesRef.current) return;
    const pos = particlesRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const t = clock.elapsedTime * 0.1;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += Math.sin(t + i * 0.3) * 0.0002;
      // Wrap particles
      if (arr[i * 3 + 1] > 1.5) arr[i * 3 + 1] = 0;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.004}
        vertexColors
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ── Brain View Camera ────────────────────────────────────────────
function BrainCamera() {
  return (
    <OrbitControls
      target={[0.3, 0.02, 0]}
      minDistance={0.1}
      maxDistance={2}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      autoRotate
      autoRotateSpeed={0.05}
    />
  );
}

// ── Organism Body Selector ───────────────────────────────────────
function OrganismBody() {
  const experiment = useSimulationStore((s) => s.experiment);
  const organism = experiment?.organism ?? 'c_elegans';

  if (organism === 'drosophila') return <FlyBody3D />;
  if (organism === 'zebrafish') return <ZebraFishBody3D />;
  return <WormBody />;
}

// ── View Label Overlay ───────────────────────────────────────────
function ViewLabel({ text }: { text: string }) {
  return (
    <div style={{
      position: 'absolute', top: 6, left: 8, zIndex: 10,
      fontSize: 9, fontFamily: 'monospace', letterSpacing: '1px',
      textTransform: 'uppercase',
      color: 'rgba(140, 170, 200, 0.5)',
      pointerEvents: 'none',
    }}>
      {text}
    </div>
  );
}

// ── Main Split Screen Component ──────────────────────────────────
interface SplitScreenViewProps {
  worldType?: string;
}

export function SplitScreenView({ worldType: initialWorldType = 'garden' }: SplitScreenViewProps) {
  const [activeWorld, setActiveWorld] = useState(initialWorldType);

  const canvasProps = {
    gl: { antialias: true, alpha: false, powerPreference: 'high-performance' as const },
    dpr: [1, 1.5] as [number, number],
    flat: false,
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `1fr 2px 1fr`,
      width: '100%',
      height: '100%',
      background: '#020305',
    }}>
      {/* LEFT: World View — organism in environment */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
        <ViewLabel text="World View" />
        {/* Environment selector */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 10,
          display: 'flex', gap: 3,
        }}>
          {(['garden', 'soil', 'pond', 'lab_plate'] as const).map((env) => (
            <button key={env} onClick={() => setActiveWorld(env)} style={{
              padding: '2px 6px', fontSize: 8, fontFamily: 'monospace',
              background: activeWorld === env ? 'rgba(0,180,255,0.25)' : 'rgba(10,15,25,0.6)',
              color: activeWorld === env ? '#00ccff' : 'rgba(140,170,200,0.5)',
              border: activeWorld === env ? '1px solid rgba(0,180,255,0.4)' : '1px solid rgba(80,120,200,0.15)',
              borderRadius: 3, cursor: 'pointer', textTransform: 'capitalize',
            }}>
              {env.replace('_', ' ')}
            </button>
          ))}
        </div>
        <Canvas
          shadows
          camera={{ position: [0.1, 0.08, 0.25], fov: 45, near: 0.005, far: 15 }}
          {...canvasProps}
          style={{ background: '#050808' }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.2} color="#1a2a40" />
          <directionalLight
            position={[2, 3, 1]} intensity={1.0} color="#e8d8c8"
            castShadow shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-1, 2, -2]} intensity={0.3} color="#4488cc" />
          <hemisphereLight args={['#2a3a50', '#0a0510', 0.4]} />

          {/* Environment */}
          <WorldEnvironment worldType={activeWorld} />

          {/* Organism */}
          <OrganismBody />

          {/* Subtle contact shadow */}
          <ContactShadows
            position={[0, -0.008, 0]} opacity={0.3}
            scale={1.5} blur={2} far={0.5} color="#001020"
          />

          {/* Camera */}
          <WorldCamera />

          {/* Consciousness effects (subtle) */}
          <ConsciousnessEffects />
          <PostProcessing />
        </Canvas>
      </div>

      {/* Divider */}
      <div style={{ background: 'rgba(80,120,200,0.2)', width: 2 }} />

      {/* RIGHT: Brain View — neural activity */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
        <ViewLabel text="Brain View" />
        <Canvas
          camera={{ position: [0.44, 0.06, 0.35], fov: 42, near: 0.005, far: 15 }}
          {...canvasProps}
          style={{
            background: 'radial-gradient(ellipse at 50% 40%, #0a0f20 0%, #040408 60%, #010102 100%)',
          }}
        >
          {/* Minimal lighting for brain view */}
          <ambientLight intensity={0.15} color="#1a2a40" />
          <directionalLight position={[1, 2, 1]} intensity={0.8} color="#aaccff" />
          <pointLight position={[0.3, 0.1, 0]} intensity={0.4} color="#0088ff" distance={1} />

          {/* Neural network visualization */}
          <NeuralNetwork3D />
          <ConnectomeGraph3D />
          <SpikeParticles />

          {/* Camera */}
          <BrainCamera />

          {/* Bloom for brain view */}
          <PostProcessing />
        </Canvas>
      </div>
    </div>
  );
}
