import * as THREE from 'three';

/**
 * ShaderMaterial for animated synapse flow lines — particles traveling along
 * neural connections to visualize signal transmission between neurons.
 *
 * Uses additive blending with no depth writes for clean compositing inside
 * the translucent organism body.
 *
 * Animated uniforms (update each frame):
 *   material.uniforms.u_time.value     = elapsedTime;
 *   material.uniforms.u_activity.value = neuralActivity;  // 0-1
 *   material.uniforms.u_speed.value    = flowSpeed;       // default 1.0
 */
export function createSynapseFlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0.0 },
      u_speed: { value: 1.0 },
      u_color: { value: new THREE.Vector3(0.0, 0.5, 0.9) },
      u_activity: { value: 0.0 },
    },

    vertexShader: /* glsl */ `
      varying float vLinePosition;
      varying vec3 vWorldPos;

      void main() {
        // Normalized line position: use local x-axis as arc-length proxy.
        // For tube/line geometries built from CatmullRomCurve3, the x-axis
        // is uniformly sampled, making this a reasonable 0-1 parameter.
        vLinePosition = position.x;

        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,

    fragmentShader: /* glsl */ `
      uniform float u_time;
      uniform float u_speed;
      uniform vec3  u_color;
      uniform float u_activity;

      varying float vLinePosition;
      varying vec3 vWorldPos;

      void main() {
        // --- Fade at line endpoints ---
        // Smooth falloff at both ends so dots don't pop in/out abruptly.
        float endFade = smoothstep(0.0, 0.1, vLinePosition)
                      * smoothstep(1.0, 0.9, vLinePosition);

        // --- Moving dot pattern ---
        // Multiple dots at different phases create a "flowing data" look.
        // Each layer has a slightly different frequency and phase offset
        // for visual richness.
        float t = u_time * u_speed;

        // Primary dots — large, spaced apart
        float dot1 = smoothstep(0.45, 0.5, fract(vLinePosition * 3.0 - t));
        float dot1b = smoothstep(0.5, 0.45, fract(vLinePosition * 3.0 - t + 0.02));
        float primaryDots = dot1 * dot1b;

        // Secondary dots — smaller, faster, offset phase
        float dot2 = smoothstep(0.46, 0.5, fract(vLinePosition * 5.0 - t * 1.3 + 0.33));
        float dot2b = smoothstep(0.5, 0.46, fract(vLinePosition * 5.0 - t * 1.3 + 0.35));
        float secondaryDots = dot2 * dot2b * 0.5;

        // Tertiary dots — finest layer, subtle
        float dot3 = smoothstep(0.47, 0.5, fract(vLinePosition * 8.0 - t * 0.7 + 0.66));
        float dot3b = smoothstep(0.5, 0.47, fract(vLinePosition * 8.0 - t * 0.7 + 0.68));
        float tertiaryDots = dot3 * dot3b * 0.25;

        float dots = primaryDots + secondaryDots + tertiaryDots;

        // --- Continuous flow glow underneath ---
        // A subtle sine wave provides a soft "stream" even between dots.
        float flowGlow = (sin(vLinePosition * 20.0 - t * 2.0) * 0.5 + 0.5) * 0.15;

        // --- Combine ---
        float intensity = (dots + flowGlow) * endFade;

        // Brightness scales with activity — dormant synapses are nearly invisible,
        // active ones light up with flowing particles.
        float activityScale = 0.1 + u_activity * 0.9;
        intensity *= activityScale;

        // Color shifts slightly warmer at high activity
        vec3 warmShift = vec3(0.15, 0.05, -0.1) * smoothstep(0.6, 1.0, u_activity);
        vec3 finalColor = (u_color + warmShift) * intensity;

        // Alpha also tracks intensity so dim parts are truly transparent
        float alpha = intensity * (0.6 + u_activity * 0.4);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,

    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
}
