// ============================================================================
// EraNode — a single era node on the Timeline River
// Glowing sphere with accent-color aura, floating text label, hover/click
// interaction, and a subtle energy ring orbiting the node.
// ============================================================================

import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Era } from '../../data/knowledge-graph';

interface EraNodeProps {
  era: Era;
  position: [number, number, number];
  onNavigate: (eraId: string) => void;
  onFocus: (position: [number, number, number]) => void;
}

// Energy ring — a ring of small particles orbiting the node
function EnergyRing({ color, radius }: { color: string; radius: number }) {
  const ringRef = useRef<THREE.Group>(null!);
  const SEGMENTS = 48;

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    return pts;
  }, [radius]);

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 0.3;
      ringRef.current.rotation.x = Math.sin(Date.now() * 0.0005) * 0.3;
    }
  });

  return (
    <group ref={ringRef}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.3} linewidth={1} />
      </line>
    </group>
  );
}

export function EraNode({ era, position, onNavigate, onFocus }: EraNodeProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const color = useMemo(() => new THREE.Color(era.color), [era.color]);
  const targetScale = hovered ? 1.25 : 1;

  const yearLabel = `${era.years[0]} - ${era.years[1]}`;
  const wingLabel = era.wing === 'history' ? 'History Wing' : 'Science Wing';

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const clampedDelta = Math.min(delta, 0.05);

    // Smooth scale
    const s = groupRef.current.scale.x;
    const newScale = THREE.MathUtils.lerp(s, targetScale, clampedDelta * 6);
    groupRef.current.scale.setScalar(newScale);

    // Floating bob
    groupRef.current.position.y = position[1] + Math.sin(Date.now() * 0.001 + position[0]) * 0.15;

    // Glow pulse
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      const pulse = 0.15 + Math.sin(Date.now() * 0.002 + position[0] * 0.5) * 0.08;
      mat.opacity = hovered ? pulse + 0.15 : pulse;
    }

    // Core rotation
    if (coreRef.current) {
      coreRef.current.rotation.y += clampedDelta * 0.2;
    }
  });

  const handlePointerOver = useCallback(() => {
    setHovered(true);
    setShowTooltip(true);
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    setShowTooltip(false);
    document.body.style.cursor = 'auto';
  }, []);

  // Track pointer movement to distinguish click from drag (OrbitControls fix)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: any) => {
    pointerDownPos.current = { x: e.clientX ?? e.point?.x ?? 0, y: e.clientY ?? e.point?.y ?? 0 };
  }, []);

  const handleClick = useCallback((e: any) => {
    // Only navigate if the pointer didn't move much (not a drag/orbit)
    if (pointerDownPos.current) {
      const dx = Math.abs((e.clientX ?? e.point?.x ?? 0) - pointerDownPos.current.x);
      const dy = Math.abs((e.clientY ?? e.point?.y ?? 0) - pointerDownPos.current.y);
      if (dx > 5 || dy > 5) {
        pointerDownPos.current = null;
        return; // This was a drag, not a click
      }
    }
    pointerDownPos.current = null;
    e.stopPropagation();
    onFocus(position);
    setTimeout(() => onNavigate(era.id), 800);
  }, [era.id, position, onNavigate, onFocus]);

  return (
    <group ref={groupRef} position={position}>
      {/* Outer glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.5, 32, 16]} />
        <meshBasicMaterial
          color={era.color}
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Invisible hitbox — much larger than visual sphere for easy clicking */}
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <sphereGeometry args={[2.0, 16, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Core sphere (visual only) */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.7, 32, 16]} />
        <meshStandardMaterial
          color={era.color}
          emissive={era.color}
          emissiveIntensity={hovered ? 1.2 : 0.6}
          roughness={0.2}
          metalness={0.4}
          toneMapped={false}
        />
      </mesh>

      {/* Inner bright core */}
      <mesh>
        <sphereGeometry args={[0.2, 16, 8]} />
        <meshBasicMaterial color="white" transparent opacity={0.7} />
      </mesh>

      {/* Point light emanating from node */}
      <pointLight
        color={era.color}
        intensity={hovered ? 3 : 1.2}
        distance={8}
        decay={2}
      />

      {/* Energy ring */}
      <EnergyRing color={era.color} radius={1.1} />

      {/* Era name — always visible */}
      <Text
        position={[0, 1.5, 0]}
        fontSize={0.35}
        color="white"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="black"
        font={undefined}
        maxWidth={6}
      >
        {era.name}
      </Text>

      {/* Year range */}
      <Text
        position={[0, 1.1, 0]}
        fontSize={0.2}
        color={era.color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.01}
        outlineColor="black"
        font={undefined}
      >
        {yearLabel}
      </Text>

      {/* Wing indicator */}
      <Text
        position={[0, -0.9, 0]}
        fontSize={0.14}
        color="rgba(255,255,255,0.4)"
        anchorX="center"
        anchorY="top"
        font={undefined}
      >
        {wingLabel}
      </Text>

      {/* Tooltip on hover */}
      {showTooltip && (
        <Html position={[0, 2.2, 0]} center distanceFactor={12} zIndexRange={[100, 0]}>
          <div
            style={{
              background: 'rgba(10, 10, 20, 0.95)',
              border: `1px solid ${era.color}44`,
              borderRadius: 12,
              padding: '14px 18px',
              maxWidth: 280,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: `0 0 30px ${era.color}22, 0 4px 20px rgba(0,0,0,0.6)`,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: era.color,
              marginBottom: 4,
              fontFamily: "'Inter', sans-serif",
            }}>
              {era.name}
            </div>
            <div style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              marginBottom: 8,
              fontFamily: "'Inter', sans-serif",
            }}>
              {yearLabel} — {era.region}
            </div>
            <div style={{
              fontSize: 12,
              lineHeight: '1.5',
              color: 'rgba(255,255,255,0.75)',
              fontFamily: "'Inter', sans-serif",
            }}>
              {era.description.slice(0, 180)}...
            </div>
            <div style={{
              fontSize: 10,
              color: era.color,
              marginTop: 8,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
            }}>
              Click to explore
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
