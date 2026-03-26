/**
 * ConsciousnessEffects — 3D visual effects driven by consciousness metrics.
 *
 * 1. Φ Pulse: Global brightness oscillation tied to integrated information
 * 2. Ignition Ripples: Expanding torus rings when Φ suddenly spikes
 * 3. Consciousness Aurora: Flowing light ribbons when Φ is high
 * 4. Dynamic Fog: Clarity responds to consciousness level
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';

// ── Ignition Ripple ──────────────────────────────────────────────
interface Ripple {
  age: number;
  lifetime: number;
  maxRadius: number;
}

function IgnitionRipples() {
  const meshRef = useRef<THREE.Mesh>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const lastPhiRef = useRef(0);
  const frame = useSimulationStore((s) => s.frame);

  const geometry = useMemo(() => new THREE.TorusGeometry(1, 0.003, 8, 64), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.0, 0.8, 1.0),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const dt = 1 / 60;

    // Detect ignition: sudden spike in activity (proxy for Φ spike)
    const nActive = frame?.n_active ?? 0;
    const nTotal = frame?.firing_rates?.length ?? 299;
    const activityRatio = nActive / Math.max(nTotal, 1);

    // Trigger ripple on high activity bursts
    if (activityRatio > 0.6 && lastPhiRef.current < 0.4) {
      ripplesRef.current.push({
        age: 0,
        lifetime: 1.5,
        maxRadius: 0.3 + activityRatio * 0.2,
      });
      // Keep max 3 ripples
      if (ripplesRef.current.length > 3) {
        ripplesRef.current.shift();
      }
    }
    lastPhiRef.current = activityRatio;

    // Update ripples
    const ripples = ripplesRef.current;
    if (ripples.length === 0) {
      meshRef.current.visible = false;
      return;
    }

    // Show the most recent ripple
    const ripple = ripples[ripples.length - 1];
    ripple.age += dt;

    if (ripple.age > ripple.lifetime) {
      ripples.pop();
      meshRef.current.visible = false;
      return;
    }

    const t = ripple.age / ripple.lifetime;
    const radius = t * ripple.maxRadius;
    const opacity = (1 - t) * 0.6;

    meshRef.current.visible = true;
    meshRef.current.scale.set(radius, radius, radius);
    meshRef.current.rotation.x = Math.PI / 2;
    meshRef.current.position.set(0.3, 0.02, 0);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    (meshRef.current.material as THREE.MeshBasicMaterial).color.setHSL(
      0.55 + t * 0.1, // Shift from cyan to blue
      1.0,
      0.5 + (1 - t) * 0.3
    );
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} visible={false} />;
}

// ── Consciousness Aurora ─────────────────────────────────────────
function ConsciousnessAurora() {
  const meshRef = useRef<THREE.Mesh>(null);
  const frame = useSimulationStore((s) => s.frame);

  const { geometry, material } = useMemo(() => {
    // Hemisphere shell above the brain
    const geo = new THREE.SphereGeometry(0.25, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        u_time: { value: 0 },
        u_intensity: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vPosition = position;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform float u_intensity;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          if (u_intensity < 0.01) discard;

          // Aurora wave pattern
          float wave1 = sin(vPosition.x * 15.0 - u_time * 1.5) * 0.5 + 0.5;
          float wave2 = sin(vPosition.z * 12.0 + u_time * 0.8) * 0.5 + 0.5;
          float wave3 = sin((vPosition.x + vPosition.z) * 8.0 - u_time * 2.0) * 0.5 + 0.5;

          float pattern = wave1 * wave2 * 0.7 + wave3 * 0.3;

          // Height-based color shift: green at base → cyan → purple at top
          float height = (vPosition.y + 0.1) / 0.25;
          vec3 color = mix(
            vec3(0.1, 1.0, 0.4),   // Green
            mix(vec3(0.0, 0.8, 1.0), vec3(0.6, 0.1, 1.0), height), // Cyan → Purple
            height
          );

          // Fresnel: stronger at edges
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);

          float alpha = pattern * fresnel * u_intensity * 0.35;
          gl_FragColor = vec4(color * (1.0 + pattern * 0.5), alpha);
        }
      `,
    });
    return { geometry: geo, material: mat };
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    const nActive = frame?.n_active ?? 0;
    const nTotal = frame?.firing_rates?.length ?? 299;
    const activityRatio = nActive / Math.max(nTotal, 1);

    // Aurora appears during high consciousness (high activity + synchrony proxy)
    const intensity = activityRatio > 0.3 ? (activityRatio - 0.3) / 0.7 : 0;

    material.uniforms.u_time.value = clock.elapsedTime;
    material.uniforms.u_intensity.value = intensity;
    meshRef.current.visible = intensity > 0.01;
    meshRef.current.position.set(0.3, 0.08, 0);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} visible={false} />;
}

// ── Dynamic Lighting ─────────────────────────────────────────────
function DynamicLighting() {
  const pointLightRef = useRef<THREE.PointLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const frame = useSimulationStore((s) => s.frame);

  useFrame(({ clock }) => {
    if (!pointLightRef.current) return;

    const nActive = frame?.n_active ?? 0;
    const nTotal = frame?.firing_rates?.length ?? 299;
    const activity = nActive / Math.max(nTotal, 1);

    // Pulsing point light synced to neural activity
    const pulse = Math.sin(clock.elapsedTime * (2 + activity * 6)) * 0.5 + 0.5;
    pointLightRef.current.intensity = 0.1 + activity * 0.8 + pulse * activity * 0.4;

    // Color shifts: blue at rest → cyan during activity → white during high activity
    const hue = 0.58 - activity * 0.08; // Blue → cyan
    const sat = 1.0 - activity * 0.3;
    const lum = 0.4 + activity * 0.3;
    pointLightRef.current.color.setHSL(hue, sat, lum);

    // Spot light: dramatic overhead that brightens with activity
    if (spotLightRef.current) {
      spotLightRef.current.intensity = 0.5 + activity * 1.5;
    }
  });

  return (
    <>
      <pointLight
        ref={pointLightRef}
        position={[0.3, 0.15, 0]}
        intensity={0.3}
        color="#00aaff"
        distance={1.5}
        decay={2}
      />
      <spotLight
        ref={spotLightRef}
        position={[0.3, 0.8, 0.2]}
        intensity={0.5}
        color="#4488ff"
        angle={0.6}
        penumbra={0.8}
        distance={3}
        decay={2}
      />
    </>
  );
}

// ── Main Export ───────────────────────────────────────────────────
export function ConsciousnessEffects() {
  return (
    <>
      <DynamicLighting />
      <IgnitionRipples />
      <ConsciousnessAurora />
    </>
  );
}
