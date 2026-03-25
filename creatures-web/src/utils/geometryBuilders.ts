import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared scratch vectors — allocated once, reused across every update call to
// avoid per-frame GC pressure.
// ---------------------------------------------------------------------------
const _tangent = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _binormal = new THREE.Vector3();
const _vec = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _next = new THREE.Vector3();

// ---------------------------------------------------------------------------
// buildSegmentedTube
// ---------------------------------------------------------------------------

/**
 * Build a segmented tube with variable radius along its length.
 * Returns a pre-allocated BufferGeometry **and** an `updatePositions`
 * function that mutates vertex positions in place — no new geometry
 * allocations on subsequent calls.
 *
 * @param points         Array of 3D positions along the spine
 * @param radiusFn       (t: 0-1) => radius at that point
 * @param radialSegments Segments around the circumference (default 16)
 */
export function buildSegmentedTube(
  points: THREE.Vector3[],
  radiusFn: (t: number) => number,
  radialSegments = 16,
): { geometry: THREE.BufferGeometry; updatePositions: (newPoints: THREE.Vector3[]) => void } {
  const segCount = points.length;

  // Total vertices: segCount rings * (radialSegments + 1) verts each
  // (+1 per ring for UV seam closure)
  const vertsPerRing = radialSegments + 1;
  const totalVerts = segCount * vertsPerRing;

  const posArr = new Float32Array(totalVerts * 3);
  const normArr = new Float32Array(totalVerts * 3);
  const uvArr = new Float32Array(totalVerts * 2);

  // Index buffer: two triangles per quad between adjacent rings
  const quads = (segCount - 1) * radialSegments;
  const indices = new Uint32Array(quads * 6);

  // Build index buffer (topology never changes)
  let idx = 0;
  for (let i = 0; i < segCount - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * vertsPerRing + j;
      const b = i * vertsPerRing + j + 1;
      const c = (i + 1) * vertsPerRing + j + 1;
      const d = (i + 1) * vertsPerRing + j;
      indices[idx++] = a;
      indices[idx++] = d;
      indices[idx++] = b;
      indices[idx++] = b;
      indices[idx++] = d;
      indices[idx++] = c;
    }
  }

  // Build UV coordinates (static)
  for (let i = 0; i < segCount; i++) {
    const v = i / Math.max(segCount - 1, 1);
    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const vi = (i * vertsPerRing + j) * 2;
      uvArr[vi] = u;
      uvArr[vi + 1] = v;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(posArr, 3);
  const normAttr = new THREE.BufferAttribute(normArr, 3);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', normAttr);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  /**
   * Compute Frenet-like frames for an array of spine samples and write
   * ring vertices + normals into the pre-allocated position / normal arrays.
   */
  function fillVertices(spine: THREE.Vector3[]): void {
    const n = spine.length;

    for (let i = 0; i < n; i++) {
      const t = i / Math.max(n - 1, 1);
      const radius = radiusFn(t);

      // --- Approximate tangent via finite differences ---
      if (i === 0) {
        _tangent.subVectors(spine[1], spine[0]);
      } else if (i === n - 1) {
        _tangent.subVectors(spine[n - 1], spine[n - 2]);
      } else {
        _tangent.subVectors(spine[i + 1], spine[i - 1]);
      }
      _tangent.normalize();

      // --- Stable normal frame ---
      // Choose an initial reference vector that is not parallel to the tangent.
      if (i === 0) {
        if (Math.abs(_tangent.x) < 0.9) {
          _normal.set(1, 0, 0);
        } else {
          _normal.set(0, 1, 0);
        }
        _normal.cross(_tangent).normalize();
        _binormal.crossVectors(_tangent, _normal).normalize();
      } else {
        // Propagate the previous frame by re-orthogonalizing against
        // the new tangent (rotation-minimizing approximation).
        _binormal.crossVectors(_tangent, _normal).normalize();
        _normal.crossVectors(_binormal, _tangent).normalize();
      }

      // --- Generate ring vertices ---
      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Point on the ring
        _vec
          .copy(_normal)
          .multiplyScalar(cos * radius)
          .addScaledVector(_binormal, sin * radius);

        const vi = (i * vertsPerRing + j) * 3;
        posArr[vi] = spine[i].x + _vec.x;
        posArr[vi + 1] = spine[i].y + _vec.y;
        posArr[vi + 2] = spine[i].z + _vec.z;

        // Normal is just the radial direction (unit vector from spine to vertex)
        _vec.normalize();
        normArr[vi] = _vec.x;
        normArr[vi + 1] = _vec.y;
        normArr[vi + 2] = _vec.z;
      }
    }
  }

  // Initial vertex fill
  fillVertices(points);
  posAttr.needsUpdate = true;
  normAttr.needsUpdate = true;

  // ------------------------------------------------------------------
  // updatePositions — call each frame with the new spine points.
  // Resamples via CatmullRomCurve3 to match the original segment count,
  // then writes vertices in place with zero allocation.
  // ------------------------------------------------------------------
  const _curve = new THREE.CatmullRomCurve3([], false, 'catmullrom', 0.5);
  const _sampledSpine: THREE.Vector3[] = Array.from(
    { length: segCount },
    () => new THREE.Vector3(),
  );

  function updatePositions(newPoints: THREE.Vector3[]): void {
    // Feed new control points into the curve (reuses the array reference)
    _curve.points = newPoints;

    // Sample the curve at the fixed segment count
    for (let i = 0; i < segCount; i++) {
      const t = i / Math.max(segCount - 1, 1);
      _curve.getPoint(t, _sampledSpine[i]);
    }

    fillVertices(_sampledSpine);
    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;

    geometry.computeBoundingSphere();
  }

  return { geometry, updatePositions };
}

// ---------------------------------------------------------------------------
// buildLatheBody
// ---------------------------------------------------------------------------

/**
 * Build a body of revolution (lathe geometry) from a 2D profile.
 * Suitable for axially symmetric organism parts — fly thorax, head, abdomen,
 * or any radially-symmetric body segment.
 *
 * The profile is defined in the xz plane: each Vector2's x component maps to
 * the radial distance from the axis, and y maps to the height along the axis.
 *
 * @param profile  Array of Vector2 defining the half-profile
 * @param segments Number of angular segments (default 24)
 */
export function buildLatheBody(
  profile: THREE.Vector2[],
  segments = 24,
): THREE.BufferGeometry {
  // THREE.LatheGeometry rotates the profile around the Y axis.
  // It expects Vector2(radius, height).
  const geometry = new THREE.LatheGeometry(profile, segments);

  // LatheGeometry computes normals, but recomputing ensures consistency
  // after any future manipulation of positions.
  geometry.computeVertexNormals();

  return geometry;
}
