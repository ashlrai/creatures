import * as THREE from 'three';

/**
 * A custom ShaderMaterial for rendering neural circuit lines / tubes visible
 * inside the translucent organism body. Features:
 *
 * - Signal propagation with sharp leading edge and exponential fade-out trail
 * - Activity-dependent color shift: deep blue -> cyan -> white-hot
 * - Activity-dependent line thickness expansion
 * - High-frequency sparkle noise for visual interest
 *
 * Animated uniforms (update each frame):
 *   material.uniforms.u_time.value     = elapsedTime;
 *   material.uniforms.u_activity.value = neuralActivity;  // 0-1
 */
export function createNeuralInteriorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0.0 },
      u_activity: { value: 0.0 },
      u_baseColor: { value: new THREE.Vector3(0.0, 0.6, 0.8) },
      u_lineThicknessScale: { value: 1.0 },
    },

    vertexShader: /* glsl */ `
      uniform float u_activity;
      uniform float u_time;

      varying float vLinePosition;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        // Encode position along the local x-axis as a 0-1 proxy for
        // "distance along the neural line".
        vLinePosition = position.x;
        vNormal = normalize(normalMatrix * normal);

        // --- Activity-dependent line thickness ---
        // Expand vertices outward along their normal when activity is high,
        // making active neural lines visually thicker / more prominent.
        float thicknessBoost = 1.0 + u_activity * 0.6;
        vec3 expanded = position + normal * (thicknessBoost - 1.0) * 0.02;

        // Small oscillation gives lines a "humming" feel at high activity
        float hum = sin(position.x * 20.0 + u_time * 8.0) * u_activity * 0.003;
        expanded += normal * hum;

        vec4 worldPos = modelMatrix * vec4(expanded, 1.0);
        vWorldPos = worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,

    fragmentShader: /* glsl */ `
      uniform float u_time;
      uniform float u_activity;
      uniform vec3  u_baseColor;

      varying float vLinePosition;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        // --- Signal propagation with sharp leading edge ---
        // smoothstep creates a crisp wavefront; the exponential trail
        // gives the impression of a signal packet traveling along the axon.
        float signal = smoothstep(0.0, 0.15, sin(vLinePosition * 12.0 - u_time * 5.0));
        float trailArg = max(0.0, vLinePosition * 8.0 - u_time * 4.0);
        float trail = exp(-trailArg * 2.0);
        float propagation = signal * trail;

        // --- Activity-dependent color shift ---
        // Low activity  = deep blue  (0.05, 0.15, 0.4)
        // Mid activity  = cyan       (0.0, 0.6, 0.8)
        // High activity = white-hot  (0.8, 0.95, 1.0)
        vec3 lowColor  = vec3(0.05, 0.15, 0.4);
        vec3 midColor  = vec3(0.0, 0.6, 0.8);
        vec3 highColor = vec3(0.8, 0.95, 1.0);
        vec3 activityColor = mix(
          mix(lowColor, midColor, u_activity),
          highColor,
          smoothstep(0.7, 1.0, u_activity)
        );

        // Base brightness: always slightly visible so circuit structure reads
        float brightness = u_activity * 0.7 + 0.3;

        // Combine propagation wave with base brightness
        float pulseBoost = propagation * 0.5 * u_activity;
        vec3 color = activityColor * (brightness + pulseBoost);

        // --- Sparkle / noise ---
        // High-frequency pseudo-random sparkle for visual interest.
        // Only visible at higher activity levels so resting circuits look calm.
        float sparkle = fract(sin(dot(vWorldPos.xy, vec2(12.9898, 78.233))) * 43758.5453);
        // Animate sparkle by mixing in a time-dependent seed
        float sparkleAnim = fract(sin(dot(
          vWorldPos.xy + vec2(u_time * 0.7, u_time * 1.3),
          vec2(12.9898, 78.233)
        )) * 43758.5453);
        float sparkleMask = step(0.97, sparkleAnim) * u_activity;
        color += vec3(0.6, 0.8, 1.0) * sparkleMask * 0.8;

        // --- Secondary fast pulse for high-activity bursts ---
        float fastPulse = sin(vLinePosition * 25.0 - u_time * 12.0) * 0.5 + 0.5;
        float burstMask = smoothstep(0.6, 1.0, u_activity);
        color += highColor * fastPulse * burstMask * 0.15;

        float alpha = 0.4 + u_activity * 0.5;

        gl_FragColor = vec4(color, alpha);
      }
    `,

    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
}
