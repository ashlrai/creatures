import * as THREE from 'three';

export interface OrganismMaterialOptions {
  baseColor?: THREE.Color;
  transmission?: number;
  thickness?: number;
  clearcoat?: number;
  ior?: number;
  iridescence?: number;
}

const DEFAULTS = {
  transmission: 0.4,
  thickness: 0.8,
  clearcoat: 0.6,
  ior: 1.4,
  iridescence: 0.3,
} as const;

/**
 * Creates a semi-transparent organism body material with advanced visual effects:
 *
 * - Subsurface scattering simulation (fake SSS via view-to-light dot product)
 * - Neural pulse wave traveling along the body axis
 * - Fresnel rim glow highlighting the organism silhouette
 * - Activity-modulated emissive breathing
 * - Sheen for a soft tissue appearance
 *
 * After creation, update the uniforms each frame via:
 *   material.userData.uniforms.u_avgActivity.value = activity;
 *   material.userData.uniforms.u_time.value = elapsedTime;
 *   material.userData.uniforms.u_pulseOrigin.value.set(x, y, z);  // optional
 */
export function createOrganismMaterial(
  opts: OrganismMaterialOptions = {},
): THREE.MeshPhysicalMaterial {
  const uniforms = {
    u_avgActivity: { value: 0.0 },
    u_time: { value: 0.0 },
    u_pulseOrigin: { value: new THREE.Vector3(0, 0, 0) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: opts.baseColor ?? new THREE.Color(0.04, 0.2, 0.3),
    emissive: new THREE.Color(0.01, 0.06, 0.1),
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0,
    transmission: opts.transmission ?? DEFAULTS.transmission,
    thickness: opts.thickness ?? DEFAULTS.thickness,
    clearcoat: opts.clearcoat ?? DEFAULTS.clearcoat,
    clearcoatRoughness: 0.08,
    ior: opts.ior ?? DEFAULTS.ior,
    iridescence: opts.iridescence ?? DEFAULTS.iridescence,
    iridescenceIOR: 1.3,
    sheen: 0.3,
    sheenColor: new THREE.Color(0.1, 0.2, 0.3),
    sheenRoughness: 0.3,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    // Inject custom uniforms
    shader.uniforms.u_avgActivity = uniforms.u_avgActivity;
    shader.uniforms.u_time = uniforms.u_time;
    shader.uniforms.u_pulseOrigin = uniforms.u_pulseOrigin;

    // --- Vertex shader: inject vWorldPos varying ---
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      /* glsl */ `varying vec3 vWorldPos;
      void main() {`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );

    // --- Fragment shader: declare uniforms and varying ---
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      /* glsl */ `
      uniform float u_avgActivity;
      uniform float u_time;
      uniform vec3  u_pulseOrigin;
      varying vec3  vWorldPos;
      void main() {`,
    );

    // --- Fragment shader: inject SSS, pulse wave, and fresnel after emissive ---
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
      #include <emissivemap_fragment>

      // Base activity-modulated emissive breathing
      totalEmissiveRadiance += vec3(0.02, 0.08, 0.12) * u_avgActivity * (0.8 + 0.2 * sin(u_time * 2.0));

      // --- Subsurface scattering simulation ---
      // Fake SSS: light passes through thin tissue. Surfaces facing away
      // from the camera pick up a warm orange-teal glow as if light is
      // transmitting through translucent flesh.
      vec3 viewDir = normalize(vViewPosition);
      float sss = pow(max(0.0, dot(viewDir, vec3(0.3, 0.6, 0.2))), 3.0) * 0.15;
      totalEmissiveRadiance += vec3(0.08, 0.12, 0.15) * sss * (1.0 + u_avgActivity * 2.0);

      // --- Neural pulse wave ---
      // A traveling wave of brightness along the body axis, giving the
      // impression of neural signals rippling across the organism surface.
      float wave = sin(vWorldPos.x * 15.0 - u_time * 4.0) * 0.5 + 0.5;
      float pulseStrength = smoothstep(0.0, 1.0, u_avgActivity) * 0.08;
      totalEmissiveRadiance += vec3(0.0, 0.15, 0.2) * wave * pulseStrength;

      // --- Directional pulse from origin ---
      // Secondary radial pulse emanating from u_pulseOrigin for localized
      // neural burst effects (e.g. sensory input region).
      float distFromOrigin = length(vWorldPos - u_pulseOrigin);
      float radialPulse = sin(distFromOrigin * 10.0 - u_time * 6.0) * 0.5 + 0.5;
      float radialFade = exp(-distFromOrigin * 1.5);
      totalEmissiveRadiance += vec3(0.05, 0.1, 0.15) * radialPulse * radialFade * u_avgActivity * 0.06;

      // --- Fresnel rim glow ---
      // Highlights the organism silhouette with a cool-tinted rim light
      // that intensifies with neural activity.
      float fresnel = pow(1.0 - max(0.0, dot(normalize(normal), viewDir)), 3.0);
      totalEmissiveRadiance += vec3(0.02, 0.08, 0.12) * fresnel * (0.5 + u_avgActivity * 1.5);
      `,
    );
  };

  // Expose uniforms so callers can drive the effects each frame
  material.userData.uniforms = uniforms;

  return material;
}
