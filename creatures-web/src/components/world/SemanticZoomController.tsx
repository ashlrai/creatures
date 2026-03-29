import { useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorldStore } from '../../stores/worldStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Camera distances defining the zoom range */
const FAR_DISTANCE = 80; // zoomed all the way out → zoomLevel 0
const CLOSE_DISTANCE = 2; // zoomed all the way in → zoomLevel 1

/** Animation duration for click-to-focus transitions (ms) */
const TRANSITION_DURATION = 600;

// Reusable vectors to avoid per-frame allocation
const _targetPos = new THREE.Vector3();
const _lerpPos = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reads camera distance each frame and writes a normalized zoomLevel (0–1)
 * to the world store. Also handles smooth camera transitions when an
 * organism is selected.
 *
 * Must be placed inside a React Three Fiber <Canvas>.
 */
export function SemanticZoomController() {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  // Transition state
  const transitionRef = useRef<{
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endPos: THREE.Vector3;
    endTarget: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null>(null);

  // Subscribe to store selectively
  const setZoom = useWorldStore((s) => s.setZoom);

  useFrame(({ clock }) => {
    // --- Compute zoom level from camera distance ---
    const dist = camera.position.length(); // distance from origin (world center)
    const t = 1 - (dist - CLOSE_DISTANCE) / (FAR_DISTANCE - CLOSE_DISTANCE);
    const zoomLevel = Math.max(0, Math.min(1, t));
    setZoom(zoomLevel);

    // --- Handle smooth camera transitions ---
    const transition = transitionRef.current;
    if (transition) {
      const elapsed = clock.getElapsedTime() * 1000 - transition.startTime;
      const progress = Math.min(1, elapsed / transition.duration);

      // Ease-in-out cubic
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Lerp camera position
      _lerpPos.copy(transition.startPos).lerp(transition.endPos, ease);
      camera.position.copy(_lerpPos);

      // Lerp look target (for OrbitControls)
      if (controlsRef.current?.target) {
        _targetPos
          .copy(transition.startTarget)
          .lerp(transition.endTarget, ease);
        controlsRef.current.target.copy(_targetPos);
      }

      camera.updateProjectionMatrix();

      if (progress >= 1) {
        transitionRef.current = null;
        useWorldStore.getState().setTransitioning(false);
      }
    }
  });

  // Expose focus function via the store's selectOrganism action
  // The UnifiedWorld component will call this when an organism is clicked

  return null;
}

/**
 * Initiate a smooth camera fly-to animation toward a world position.
 * Called externally when an organism is clicked.
 */
export function flyToPosition(
  camera: THREE.Camera,
  controls: any,
  target: THREE.Vector3,
  distance: number = 5,
  duration: number = TRANSITION_DURATION,
): Promise<void> {
  return new Promise((resolve) => {
    const startPos = camera.position.clone();
    const startTarget = controls?.target?.clone() ?? new THREE.Vector3();
    const endTarget = target.clone();
    const endPos = target.clone().add(new THREE.Vector3(0, 0, distance));

    const startTime = performance.now();

    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      camera.position.lerpVectors(startPos, endPos, ease);

      if (controls?.target) {
        controls.target.lerpVectors(startTarget, endTarget, ease);
        controls.update?.();
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(animate);
  });
}
