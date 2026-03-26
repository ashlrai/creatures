import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../../stores/simulationStore';
import { useCircuitModificationStore } from '../../stores/circuitModificationStore';
import { createOrganismMaterial } from '../../shaders/OrganismMaterial';
import { createNeuralInteriorMaterial } from '../../shaders/NeuralInteriorMaterial';

/**
 * Drosophila anatomical body with neural overlay.
 *
 * Renders a stylized, semi-transparent fruit fly with visible neural
 * circuits firing inside the thorax. The body includes head with compound
 * eyes, translucent thorax, striped abdomen, six articulated legs, and
 * iridescent wings — all driven by real-time simulation data.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENSORY_COLOR = new THREE.Color(0.1, 0.9, 0.4);
const INTER_COLOR = new THREE.Color(0.2, 0.5, 1.0);
const MOTOR_COLOR = new THREE.Color(1.0, 0.2, 0.3);

const N_NEURAL_POINTS = 200;
const N_SYNAPSE_LINES = 100;

// Thorax center (neurons live here)
const THORAX_X = 0;
const THORAX_Y = 0;
const THORAX_Z = 0;

// Body segment offsets (relative to group origin)
const HEAD_OFFSET: [number, number, number] = [0.055, 0.005, 0];
const ABDOMEN_OFFSET: [number, number, number] = [-0.065, -0.005, 0];

// Leg attachment points (coxa positions on thorax surface), 3 per side
const LEG_ATTACHMENTS: [number, number, number][] = [
  // Right legs (positive Z)
  [0.015, -0.025, 0.030],
  [0.000, -0.028, 0.032],
  [-0.018, -0.025, 0.030],
  // Left legs (negative Z)
  [0.015, -0.025, -0.030],
  [0.000, -0.028, -0.032],
  [-0.018, -0.025, -0.030],
];

// Wing attachment points
const WING_ATTACHMENTS: [number, number, number][] = [
  [0.005, 0.030, 0.020],   // right wing
  [0.005, 0.030, -0.020],  // left wing
];

// ---------------------------------------------------------------------------
// Geometry helpers (created once, reused)
// ---------------------------------------------------------------------------

/** Generate a teardrop wing shape as a BufferGeometry */
function createWingGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Teardrop: wide at base, tapers to tip
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.015, 0.01, 0.04, 0.015, 0.06, 0.005);
  shape.bezierCurveTo(0.065, 0.0, 0.06, -0.005, 0.04, -0.008);
  shape.bezierCurveTo(0.02, -0.01, 0.01, -0.005, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 8);
  return geo;
}

/** Build a leg as a TubeGeometry from 3 control points */
function createLegGeometry(
  coxa: THREE.Vector3,
  joint: THREE.Vector3,
  foot: THREE.Vector3,
): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([coxa, joint, foot]);
  return new THREE.TubeGeometry(curve, 6, 0.001, 4, false);
}

/** Layout ~200 neurons in a compact ellipsoid fitting inside the thorax */
function layoutThoraxNeurons(n: number): Float32Array {
  const pos = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Fibonacci sphere, compressed to fit thorax inner volume
    const y = 1 - 2 * t; // -1..1
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = golden * i;

    // Fit inside thorax: semi-axes smaller than thorax geometry
    const rx = 0.030;
    const ry = 0.024;
    const rz = 0.024;

    pos[i * 3] = THORAX_X + Math.cos(theta) * radiusAtY * rx;
    pos[i * 3 + 1] = THORAX_Y + y * ry;
    pos[i * 3 + 2] = THORAX_Z + Math.sin(theta) * radiusAtY * rz;
  }
  return pos;
}

/** Assign base colors by neuron type index */
function assignNeuronColors(n: number): Float32Array {
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let c: THREE.Color;
    if (t < 0.15) c = SENSORY_COLOR;
    else if (t < 0.80) c = INTER_COLOR;
    else c = MOTOR_COLOR;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return colors;
}

/** Assign base sizes — central-complex neurons (middle 10%) are larger */
function assignNeuronSizes(n: number): Float32Array {
  const sizes = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Central complex: indices 40-60% are slightly larger
    const isCentral = t >= 0.40 && t <= 0.60;
    sizes[i] = isCentral ? 0.005 : 0.003;
  }
  return sizes;
}

/** Build synapse line geometry connecting nearby neuron pairs */
function buildSynapseGeometry(
  neuronPos: Float32Array,
  nNeurons: number,
  nLines: number,
): THREE.BufferGeometry {
  const verts = new Float32Array(nLines * 6);
  const cols = new Float32Array(nLines * 6);

  let idx = 0;
  for (let s = 0; s < nLines; s++) {
    // Pick a pre neuron, then find a nearby post neuron
    const pre = Math.floor(Math.random() * nNeurons);
    const post = Math.min(
      pre + 1 + Math.floor(Math.random() * (nNeurons * 0.15)),
      nNeurons - 1,
    );

    const i6 = s * 6;
    verts[i6] = neuronPos[pre * 3];
    verts[i6 + 1] = neuronPos[pre * 3 + 1];
    verts[i6 + 2] = neuronPos[pre * 3 + 2];
    verts[i6 + 3] = neuronPos[post * 3];
    verts[i6 + 4] = neuronPos[post * 3 + 1];
    verts[i6 + 5] = neuronPos[post * 3 + 2];

    // Faint blue
    cols[i6] = 0.1;  cols[i6 + 1] = 0.25; cols[i6 + 2] = 0.6;
    cols[i6 + 3] = 0.1; cols[i6 + 4] = 0.25; cols[i6 + 5] = 0.6;
    idx++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// ---------------------------------------------------------------------------
// Abdomen vertex-color stripes
// ---------------------------------------------------------------------------
function applyAbdomenStripes(geo: THREE.SphereGeometry): void {
  const posAttr = geo.getAttribute('position');
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  const dark = new THREE.Color(0x1e2a38);
  const light = new THREE.Color(0x3a4e5c);

  for (let i = 0; i < count; i++) {
    // Stripe by local Y position
    const y = posAttr.getY(i);
    const stripe = Math.sin(y * 300) > 0 ? light : dark;
    colors[i * 3] = stripe.r;
    colors[i * 3 + 1] = stripe.g;
    colors[i * 3 + 2] = stripe.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FlyBody3D() {
  const frame = useSimulationStore((s) => s.frame);
  const lesionedNeurons = useCircuitModificationStore((s) => s.lesionedNeurons);
  const stimulatedNeurons = useCircuitModificationStore((s) => s.stimulatedNeurons);
  const recordedNeurons = useCircuitModificationStore((s) => s.recordedNeurons);

  // Refs for animated meshes
  const groupRef = useRef<THREE.Group>(null);
  const thoraxRef = useRef<THREE.Mesh>(null);
  const neuronPointsRef = useRef<THREE.Points>(null);
  const neuronGlowRef = useRef<THREE.Points>(null);
  const synapseLinesRef = useRef<THREE.LineSegments>(null);
  const wingRefs = useRef<(THREE.Mesh | null)[]>([null, null]);
  const legRefs = useRef<(THREE.Mesh | null)[]>(new Array(6).fill(null));

  // Previous center_of_mass for velocity & orientation
  const prevCom = useRef<number[]>([0, 0, 0]);
  const smoothPos = useRef<number[]>([0, 0, 0]);
  const smoothYaw = useRef(0);

  // -----------------------------------------------------------------------
  // Memoised geometry & data
  // -----------------------------------------------------------------------

  const neuronPositions = useMemo(() => layoutThoraxNeurons(N_NEURAL_POINTS), []);
  const baseColors = useMemo(() => assignNeuronColors(N_NEURAL_POINTS), []);
  const baseSizes = useMemo(() => assignNeuronSizes(N_NEURAL_POINTS), []);
  const animColors = useMemo(() => new Float32Array(baseColors), [baseColors]);
  const animSizes = useMemo(() => new Float32Array(baseSizes), [baseSizes]);
  const glowColors = useMemo(() => new Float32Array(N_NEURAL_POINTS * 3), []);

  const synapseGeo = useMemo(
    () => buildSynapseGeometry(neuronPositions, N_NEURAL_POINTS, N_SYNAPSE_LINES),
    [neuronPositions],
  );

  const wingGeo = useMemo(() => createWingGeometry(), []);

  // Abdomen sphere with stripes
  const abdomenGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 20, 14);
    applyAbdomenStripes(geo);
    return geo;
  }, []);

  // Leg geometries — static poses, animated via mesh rotation later
  const legGeometries = useMemo(() => {
    return LEG_ATTACHMENTS.map((coxa, i) => {
      const side = i < 3 ? 1 : -1; // Z direction
      const coxaV = new THREE.Vector3(...coxa);
      const jointV = new THREE.Vector3(
        coxa[0],
        coxa[1] - 0.025,
        coxa[2] + side * 0.020,
      );
      const footV = new THREE.Vector3(
        coxa[0] - 0.005,
        coxa[1] - 0.050,
        coxa[2] + side * 0.035,
      );
      return createLegGeometry(coxaV, jointV, footV);
    });
  }, []);

  // Click target sphere geometry for neuron selection
  const clickTargetGeo = useMemo(() => new THREE.SphereGeometry(0.004, 6, 4), []);
  const clickTargetMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);

  const handleNeuronClick = (neuronIndex: number, e: React.PointerEvent) => {
    e.stopPropagation();
    useCircuitModificationStore.getState().toggleNeuronSelection(`neuron_${neuronIndex}`, e.shiftKey);
  };

  // -----------------------------------------------------------------------
  // Materials (memoised to prevent GC)
  // -----------------------------------------------------------------------

  const headMat = useMemo(
    () =>
      createOrganismMaterial({
        baseColor: new THREE.Color('#334455'),
        transmission: 0.3,
        clearcoat: 0.5,
        iridescence: 0.2,
      }),
    [],
  );

  const eyeMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x882200,
        roughness: 0.2,
        metalness: 0.3,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );

  const thoraxMat = useMemo(
    () =>
      createOrganismMaterial({
        baseColor: new THREE.Color('#2a3848'),
        transmission: 0.5,
        clearcoat: 0.5,
        iridescence: 0.2,
      }),
    [],
  );

  const abdomenMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 0.25,
        roughness: 0.5,
        metalness: 0.0,
        transparent: true,
        opacity: 0.75,
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const legMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x1a2530,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );

  const wingMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x88aacc,
        transmission: 0.7,
        roughness: 0.1,
        metalness: 0.0,
        iridescence: 0.8,
        iridescenceIOR: 1.5,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  const synapseMat = useMemo(() => createNeuralInteriorMaterial(), []);

  // -----------------------------------------------------------------------
  // useFrame — animation loop
  // -----------------------------------------------------------------------

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const rates = frame?.firing_rates ?? [];
    const spikes = new Set(frame?.spikes ?? []);
    const com = frame?.center_of_mass ?? null;
    let movementSpeed = 0;

    // -- Position & orientation interpolation --
    if (groupRef.current) {
      if (com && com.length >= 3) {
        // Smooth position
        const lerpFactor = 0.08;
        smoothPos.current[0] += (com[0] - smoothPos.current[0]) * lerpFactor;
        smoothPos.current[1] += (com[1] - smoothPos.current[1]) * lerpFactor;
        smoothPos.current[2] += (com[2] - smoothPos.current[2]) * lerpFactor;

        // Match camera coordinate convention: x stays, y↔z swap, z negated
        groupRef.current.position.set(
          smoothPos.current[0],
          smoothPos.current[2] + 0.03,
          -smoothPos.current[1],
        );

        // Yaw from movement direction (cache prev for wing flap later)
        const prevComSnap = prevCom.current;
        const dx = com[0] - prevComSnap[0];
        const dz = com[2] - prevComSnap[2];
        movementSpeed = Math.sqrt(dx * dx + dz * dz);
        if (movementSpeed > 1e-6) {
          const targetYaw = Math.atan2(dz, dx);
          smoothYaw.current += (targetYaw - smoothYaw.current) * 0.05;
          groupRef.current.rotation.y = -smoothYaw.current;
        }

        prevCom.current = [...com];
      } else {
        // Default: slight hover
        groupRef.current.position.set(0.4, 0.03, 0);
      }
    }

    // -- Neural activity metrics --
    let avgActivity = 0;
    const nRates = Math.min(rates.length, N_NEURAL_POINTS);
    for (let i = 0; i < nRates; i++) {
      avgActivity += rates[i];
    }
    avgActivity = nRates > 0 ? avgActivity / nRates / 80 : 0; // normalise ~0..1

    // -- Thorax emissive glow driven by avg neural activity --
    if (thoraxRef.current) {
      const mat = thoraxRef.current.material as THREE.MeshPhysicalMaterial;
      const glow = 0.2 + avgActivity * 0.8;
      mat.emissive.setRGB(
        0.05 + avgActivity * 0.15,
        0.10 + avgActivity * 0.30,
        0.20 + avgActivity * 0.50,
      );
      mat.emissiveIntensity = glow;

      // Drive organism shader uniforms
      if (mat.userData.uniforms) {
        mat.userData.uniforms.u_avgActivity.value = avgActivity;
        mat.userData.uniforms.u_time.value = t;
      }
    }

    // -- Head shader uniforms --
    if (headMat.userData.uniforms) {
      headMat.userData.uniforms.u_avgActivity.value = avgActivity;
      headMat.userData.uniforms.u_time.value = t;
    }

    // -- Synapse line shader uniforms --
    if (synapseMat.uniforms) {
      synapseMat.uniforms.u_time.value = t;
      synapseMat.uniforms.u_activity.value = avgActivity;
    }

    // -- Update neuron point visuals --
    if (neuronPointsRef.current) {
      for (let i = 0; i < N_NEURAL_POINTS; i++) {
        // Map neuron index to firing_rates index (scale to available data)
        const rateIdx = Math.floor((i / N_NEURAL_POINTS) * rates.length);
        const rate = rateIdx < rates.length ? rates[rateIdx] : 0;
        const activity = Math.min(rate / 80, 1);

        // Check if any mapped neuron is spiking
        const isSpiking = spikes.has(rateIdx);

        if (isSpiking) {
          animColors[i * 3] = 1.0;
          animColors[i * 3 + 1] = 1.0;
          animColors[i * 3 + 2] = 1.0;
          animSizes[i] = baseSizes[i] * 3.5;
        } else if (activity > 0.05) {
          // Brighten towards cyan proportional to activity
          const a = activity;
          animColors[i * 3] = baseColors[i * 3] + (0.3 - baseColors[i * 3]) * a;
          animColors[i * 3 + 1] = baseColors[i * 3 + 1] + (0.95 - baseColors[i * 3 + 1]) * a;
          animColors[i * 3 + 2] = baseColors[i * 3 + 2] + (1.0 - baseColors[i * 3 + 2]) * a;
          animSizes[i] = baseSizes[i] * (1 + a * 2);
        } else {
          // Decay back to base
          animColors[i * 3] += (baseColors[i * 3] - animColors[i * 3]) * 0.12;
          animColors[i * 3 + 1] += (baseColors[i * 3 + 1] - animColors[i * 3 + 1]) * 0.12;
          animColors[i * 3 + 2] += (baseColors[i * 3 + 2] - animColors[i * 3 + 2]) * 0.12;
          animSizes[i] += (baseSizes[i] - animSizes[i]) * 0.12;
        }
      }

      // Circuit modification visual state overrides
      for (let i = 0; i < N_NEURAL_POINTS; i++) {
        const neuronId = `neuron_${i}`;
        if (lesionedNeurons.has(neuronId)) {
          animColors[i * 3] = 0.1;
          animColors[i * 3 + 1] = 0.1;
          animColors[i * 3 + 2] = 0.1;
          animSizes[i] = baseSizes[i] * 0.6;
        } else if (stimulatedNeurons.has(neuronId)) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 8);
          animColors[i * 3] = 0.1 + pulse * 0.3;
          animColors[i * 3 + 1] = 0.5 + pulse * 0.3;
          animColors[i * 3 + 2] = 0.8 + pulse * 0.2;
          animSizes[i] = baseSizes[i] * (2.0 + pulse * 2.0);
        } else if (recordedNeurons.has(neuronId)) {
          // Keep computed colors but add red tint for recording indicator
          animColors[i * 3] = Math.min(1, animColors[i * 3] + 0.15);
          animSizes[i] = Math.max(animSizes[i], baseSizes[i] * 1.5);
        }
      }

      // Push to GPU
      const cAttr = neuronPointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
      (cAttr.array as Float32Array).set(animColors);
      cAttr.needsUpdate = true;

      const sAttr = neuronPointsRef.current.geometry.getAttribute('size') as THREE.BufferAttribute;
      (sAttr.array as Float32Array).set(animSizes);
      sAttr.needsUpdate = true;
    }

    // Copy colors to glow layer
    if (neuronGlowRef.current) {
      const gc = neuronGlowRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
      (gc.array as Float32Array).set(animColors);
      gc.needsUpdate = true;
    }

    // -- Wing flap animation (use movementSpeed from yaw calc above) --
    const flapAmplitude = 0.3 + Math.min(movementSpeed * 500, 0.7); // 0.3..1.0
    const wingAngle = Math.sin(t * 25) * flapAmplitude;

    wingRefs.current.forEach((wing, i) => {
      if (!wing) return;
      // Right wing (i=0): flap up, Left wing (i=1): mirror
      const sign = i === 0 ? 1 : -1;
      wing.rotation.x = wingAngle * sign;
      // Slight forward sweep
      wing.rotation.z = Math.sin(t * 25 + 0.5) * 0.05;
    });

    // -- Leg tripod gait --
    // Group A: legs 0,2,4 (right-front, right-rear, left-middle)
    // Group B: legs 1,3,5
    const gaitFreq = 4;
    const gaitAmp = 0.08;
    legRefs.current.forEach((leg, i) => {
      if (!leg) return;
      const isGroupA = i === 0 || i === 2 || i === 4;
      const phase = isGroupA ? 0 : Math.PI;
      const swing = Math.sin(t * gaitFreq + phase) * gaitAmp;
      leg.rotation.x = swing;
      // Subtle lateral sway
      leg.rotation.z = Math.sin(t * gaitFreq + phase + 0.3) * gaitAmp * 0.3;
    });
  });

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  return (
    <group ref={groupRef} position={[0.4, 0.03, 0]} scale={3}>
      {/* ============ HEAD ============ */}
      <mesh
        position={HEAD_OFFSET}
        scale={[0.025, 0.02, 0.022]}
        material={headMat}
      >
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>

      {/* Compound eye — right */}
      <mesh
        position={[HEAD_OFFSET[0] + 0.008, HEAD_OFFSET[1] + 0.006, 0.015]}
        scale={[0.010, 0.012, 0.010]}
        material={eyeMat}
      >
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>
      {/* Compound eye — left */}
      <mesh
        position={[HEAD_OFFSET[0] + 0.008, HEAD_OFFSET[1] + 0.006, -0.015]}
        scale={[0.010, 0.012, 0.010]}
        material={eyeMat}
      >
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>

      {/* ============ THORAX ============ */}
      <mesh
        ref={thoraxRef}
        position={[THORAX_X, THORAX_Y, THORAX_Z]}
        scale={[0.04, 0.035, 0.035]}
        material={thoraxMat}
      >
        <sphereGeometry args={[1, 20, 16]} />
      </mesh>

      {/* ============ ABDOMEN ============ */}
      <mesh
        position={ABDOMEN_OFFSET}
        scale={[0.035, 0.03, 0.03]}
        material={abdomenMat}
        geometry={abdomenGeo}
      />

      {/* ============ NEURAL INTERIOR (inside thorax) ============ */}
      {/* Synapse lines */}
      <lineSegments ref={synapseLinesRef} geometry={synapseGeo} material={synapseMat} />

      {/* Neuron points */}
      <points ref={neuronPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={neuronPositions}
            count={N_NEURAL_POINTS}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={animColors}
            count={N_NEURAL_POINTS}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-size"
            array={animSizes}
            count={N_NEURAL_POINTS}
            itemSize={1}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.005}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Neuron glow halo (larger, softer) */}
      <points ref={neuronGlowRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={neuronPositions}
            count={N_NEURAL_POINTS}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={glowColors}
            count={N_NEURAL_POINTS}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.014}
          sizeAttenuation
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* ============ NEURON CLICK TARGETS (invisible spheres) ============ */}
      {Array.from({ length: N_NEURAL_POINTS }, (_, i) => (
        <mesh
          key={`click-${i}`}
          geometry={clickTargetGeo}
          material={clickTargetMat}
          position={[
            neuronPositions[i * 3],
            neuronPositions[i * 3 + 1],
            neuronPositions[i * 3 + 2],
          ]}
          onPointerDown={(e) => handleNeuronClick(i, e as unknown as React.PointerEvent)}
        />
      ))}

      {/* ============ WINGS ============ */}
      {WING_ATTACHMENTS.map((pos, i) => (
        <mesh
          key={`wing-${i}`}
          ref={(el) => { wingRefs.current[i] = el; }}
          position={pos}
          rotation={[0, 0, i === 1 ? Math.PI : 0]} // mirror left wing
          material={wingMat}
          geometry={wingGeo}
        />
      ))}

      {/* ============ LEGS ============ */}
      {legGeometries.map((geo, i) => (
        <mesh
          key={`leg-${i}`}
          ref={(el) => { legRefs.current[i] = el; }}
          geometry={geo}
          material={legMat}
        />
      ))}
    </group>
  );
}
