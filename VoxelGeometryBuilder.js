import * as THREE from 'three';
import { Face, FACE_CORNERS, FACE_AXIS } from './Voxel.js';

/**
 * Builds Three.js geometry for voxels with corner-based representation
 *
 * Key insight: When bevels bring corners together, a quad becomes a triangle.
 * We must detect this and render a single triangle instead of two overlapping ones.
 */
export class VoxelGeometryBuilder {
    constructor() {
        this.EPSILON = 0.001;
    }

    /**
     * Build geometry for a single voxel
     *
     * IMPORTANT: We add a custom 'faceId' attribute so that raycasting can determine
     * which logical face was hit, even for beveled triangular surfaces where the
     * geometric normal points diagonally.
     */
    buildVoxelGeometry(voxel) {
        if (voxel.isCollapsed()) {
            return new THREE.BufferGeometry();
        }

        const positions = [];
        const normals = [];
        const faceIds = [];  // Custom attribute: which face (0-5) each vertex belongs to
        const indices = [];

        for (let face = 0; face < 6; face++) {
            const faceFlag = 1 << face;
            if ((voxel.hiddenSides & faceFlag) !== 0) {
                continue;
            }

            this.buildFace(voxel, face, positions, normals, faceIds, indices);
        }

        const geometry = new THREE.BufferGeometry();

        if (positions.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('faceId', new THREE.Float32BufferAttribute(faceIds, 1));
            geometry.setIndex(indices);
        }

        return geometry;
    }

    /**
     * Build a single face - handles both quads and degenerate triangles
     *
     * IMPORTANT: We store the logical face ID (0-5) as a custom attribute on each vertex.
     * This allows raycasting to determine which face was clicked even when the geometric
     * normal of a beveled triangle points diagonally.
     */
    buildFace(voxel, face, positions, normals, faceIds, indices) {
        const cornerIndices = FACE_CORNERS[face];
        const faceVertices = cornerIndices.map(i => voxel.corners[i]);

        // Get the polygon (removes coincident vertices while preserving winding order)
        const polygon = this.getPolygon(faceVertices);

        if (polygon.length < 3) {
            return; // Degenerate - line or point
        }

        // Use the EXPECTED face axis as normal - this is the "logical" face direction
        // regardless of how beveled the actual geometry is
        const faceAxis = FACE_AXIS[face];
        const normal = [faceAxis[0], faceAxis[1], faceAxis[2]];

        // Calculate geometric normal for winding order determination
        const geoNormal = this.calculateFaceNormal(faceVertices);
        const geoNormalLen = Math.sqrt(geoNormal[0] ** 2 + geoNormal[1] ** 2 + geoNormal[2] ** 2);
        if (geoNormalLen < 0.0001) {
            return; // Degenerate face
        }

        const baseIndex = positions.length / 3;

        // Add vertices with the EXPECTED face normal AND the face ID
        for (const v of polygon) {
            positions.push(v[0], v[1], v[2]);
            normals.push(normal[0], normal[1], normal[2]);
            faceIds.push(face);  // Store which face (0-5) this vertex belongs to
        }

        if (polygon.length === 3) {
            // Triangle - need to determine correct winding based on geometric normal
            const triNormal = this.calculateTriangleNormal(polygon[0], polygon[1], polygon[2]);
            const dot = geoNormal[0] * triNormal[0] + geoNormal[1] * triNormal[1] + geoNormal[2] * triNormal[2];

            if (dot >= 0) {
                // Normal matches expected direction - use this winding
                indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2);
            } else {
                // Normal is flipped - reverse winding
                indices.push(baseIndex + 0, baseIndex + 2, baseIndex + 1);
            }
        } else {
            // Quad - need to triangulate properly
            // Check if this face has a flipped diagonal
            const flipped = voxel.faceFlipped ? voxel.faceFlipped[face] : false;
            this.triangulateQuad(polygon, geoNormal, baseIndex, indices, flipped);
        }
    }

    /**
     * Get polygon vertices by removing ALL coincident vertices while preserving order
     * This handles cases where non-adjacent vertices become coincident due to bevels
     */
    getPolygon(vertices) {
        const result = [];
        const resultIndices = [];

        for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i];
            let isDuplicate = false;

            // Check against ALL vertices already in result
            for (let j = 0; j < result.length; j++) {
                if (this.verticesEqual(v, result[j])) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                result.push(v);
                resultIndices.push(i);
            }
        }

        return result;
    }

    /**
     * Check if two vertices are coincident
     */
    verticesEqual(a, b) {
        return Math.abs(a[0] - b[0]) < this.EPSILON &&
               Math.abs(a[1] - b[1]) < this.EPSILON &&
               Math.abs(a[2] - b[2]) < this.EPSILON;
    }

    /**
     * Triangulate a quad - choose the diagonal based on distance or manual flip
     * @param {boolean} forceFlip - If true, use alternate diagonal regardless of distance
     */
    triangulateQuad(vertices, normal, baseIndex, indices, forceFlip = false) {
        // For a quad with vertices [0,1,2,3] in CCW order (as seen from outside),
        // we can split along diagonal 0-2 or diagonal 1-3
        //
        // Diagonal 0-2: triangles (0,2,1) and (0,3,2)
        // Diagonal 1-3: triangles (0,3,1) and (1,3,2)

        const d02 = this.distanceSquared(vertices[0], vertices[2]);
        const d13 = this.distanceSquared(vertices[1], vertices[3]);

        // Default: use shorter diagonal. If flipped, use the other one.
        let useDiagonal02 = d02 <= d13;
        if (forceFlip) {
            useDiagonal02 = !useDiagonal02;
        }

        if (useDiagonal02) {
            // Use diagonal 0-2
            indices.push(
                baseIndex + 0, baseIndex + 2, baseIndex + 1,
                baseIndex + 0, baseIndex + 3, baseIndex + 2
            );
        } else {
            // Use diagonal 1-3
            indices.push(
                baseIndex + 0, baseIndex + 3, baseIndex + 1,
                baseIndex + 1, baseIndex + 3, baseIndex + 2
            );
        }
    }

    /**
     * Calculate squared distance between two vertices
     */
    distanceSquared(a, b) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Calculate triangle normal from 3 vertices (cross product method)
     */
    calculateTriangleNormal(v0, v1, v2) {
        const ax = v1[0] - v0[0];
        const ay = v1[1] - v0[1];
        const az = v1[2] - v0[2];
        const bx = v2[0] - v0[0];
        const by = v2[1] - v0[1];
        const bz = v2[2] - v0[2];

        // Cross product a × b
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0.0001) {
            return [nx / len, ny / len, nz / len];
        }
        return [0, 0, 0];
    }

    /**
     * Calculate face normal using Newell's method
     */
    calculateFaceNormal(vertices) {
        let nx = 0, ny = 0, nz = 0;

        for (let i = 0; i < vertices.length; i++) {
            const curr = vertices[i];
            const next = vertices[(i + 1) % vertices.length];

            nx += (curr[1] - next[1]) * (curr[2] + next[2]);
            ny += (curr[2] - next[2]) * (curr[0] + next[0]);
            nz += (curr[0] - next[0]) * (curr[1] + next[1]);
        }

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0.0001) {
            nx /= len;
            ny /= len;
            nz /= len;
        }

        return [nx, ny, nz];
    }

    /**
     * Build geometry for multiple voxels (batched for performance)
     */
    buildWorldGeometry(voxels, offset = { x: 0, y: 0, z: 0 }) {
        const positions = [];
        const normals = [];
        const indices = [];

        for (const voxel of voxels) {
            this.addVoxelToArrays(voxel, positions, normals, indices, offset);
        }

        const geometry = new THREE.BufferGeometry();

        if (positions.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setIndex(indices);
        }

        return geometry;
    }

    /**
     * Add a voxel's geometry to existing arrays
     * Uses EXPECTED face axis as normal for proper face detection on beveled surfaces
     */
    addVoxelToArrays(voxel, positions, normals, indices, offset) {
        for (let face = 0; face < 6; face++) {
            const faceFlag = 1 << face;
            if ((voxel.hiddenSides & faceFlag) !== 0) {
                continue;
            }

            const cornerIndices = FACE_CORNERS[face];
            const faceVertices = cornerIndices.map(i => [
                voxel.corners[i][0] + voxel.x + offset.x,
                voxel.corners[i][1] + voxel.y + offset.y,
                voxel.corners[i][2] + voxel.z + offset.z
            ]);

            // Get the polygon (removes coincident vertices)
            const polygon = this.getPolygon(faceVertices);

            if (polygon.length < 3) {
                continue;
            }

            // Use EXPECTED face axis as normal
            const faceAxis = FACE_AXIS[face];
            const normal = [faceAxis[0], faceAxis[1], faceAxis[2]];

            // Calculate geometric normal for winding/degenerate check
            const geoNormal = this.calculateFaceNormal(faceVertices);
            const geoNormalLen = Math.sqrt(geoNormal[0] ** 2 + geoNormal[1] ** 2 + geoNormal[2] ** 2);
            if (geoNormalLen < 0.0001) {
                continue;
            }

            const baseIndex = positions.length / 3;

            for (const v of polygon) {
                positions.push(v[0], v[1], v[2]);
                normals.push(normal[0], normal[1], normal[2]);
            }

            if (polygon.length === 3) {
                // Triangle - determine correct winding based on geometric normal
                const triNormal = this.calculateTriangleNormal(polygon[0], polygon[1], polygon[2]);
                const dot = geoNormal[0] * triNormal[0] + geoNormal[1] * triNormal[1] + geoNormal[2] * triNormal[2];

                if (dot >= 0) {
                    indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2);
                } else {
                    indices.push(baseIndex + 0, baseIndex + 2, baseIndex + 1);
                }
            } else {
                this.triangulateQuad(polygon, geoNormal, baseIndex, indices);
            }
        }
    }
}
