/**
 * Voxel class using corner-based representation (matching C# implementation)
 *
 * Corner indices (same as C#):
 * 0: TopLeftFront     (-X, +Y, -Z)
 * 1: TopRightFront    (+X, +Y, -Z)
 * 2: TopRightBack     (+X, +Y, +Z)
 * 3: TopLeftBack      (-X, +Y, +Z)
 * 4: BottomLeftBack   (-X, -Y, +Z)
 * 5: BottomRightBack  (+X, -Y, +Z)
 * 6: BottomRightFront (+X, -Y, -Z)
 * 7: BottomLeftFront  (-X, -Y, -Z)
 *
 * Face enum:
 * Top = 0, Bottom = 1, Front = 2, Back = 3, Left = 4, Right = 5
 *
 * Edge enum (relative to face):
 * None = 0, Front = 1, Back = 2, Left = 3, Right = 4
 */

export const Face = {
    Top: 0,
    Bottom: 1,
    Front: 2,
    Back: 3,
    Left: 4,
    Right: 5
};

export const Edge = {
    None: 0,
    Front: 1,
    Back: 2,
    Left: 3,
    Right: 4
};

// Face normals (pointing outward)
export const FACE_AXIS = {
    [Face.Top]: [0, 1, 0],
    [Face.Bottom]: [0, -1, 0],
    [Face.Front]: [0, 0, -1],
    [Face.Back]: [0, 0, 1],
    [Face.Left]: [-1, 0, 0],
    [Face.Right]: [1, 0, 0]
};

// Opposite face mapping
export const OPPOSITE_FACE = {
    [Face.Top]: Face.Bottom,
    [Face.Bottom]: Face.Top,
    [Face.Front]: Face.Back,
    [Face.Back]: Face.Front,
    [Face.Left]: Face.Right,
    [Face.Right]: Face.Left
};

// Identity corners for a unit cube centered at origin
// Each corner is [x, y, z] ranging from -0.5 to 0.5
export const IDENTITY_CORNERS = [
    [-0.5, 0.5, -0.5],   // 0: TopLeftFront
    [0.5, 0.5, -0.5],    // 1: TopRightFront
    [0.5, 0.5, 0.5],     // 2: TopRightBack
    [-0.5, 0.5, 0.5],    // 3: TopLeftBack
    [-0.5, -0.5, 0.5],   // 4: BottomLeftBack
    [0.5, -0.5, 0.5],    // 5: BottomRightBack
    [0.5, -0.5, -0.5],   // 6: BottomRightFront
    [-0.5, -0.5, -0.5]   // 7: BottomLeftFront
];

// Face corner indices (4 corners per face, in order for rendering)
export const FACE_CORNERS = {
    [Face.Top]: [0, 1, 2, 3],      // TopLeftFront, TopRightFront, TopRightBack, TopLeftBack
    [Face.Bottom]: [4, 5, 6, 7],   // BottomLeftBack, BottomRightBack, BottomRightFront, BottomLeftFront
    [Face.Front]: [7, 6, 1, 0],    // BottomLeftFront, BottomRightFront, TopRightFront, TopLeftFront
    [Face.Back]: [5, 4, 3, 2],     // BottomRightBack, BottomLeftBack, TopLeftBack, TopRightBack
    [Face.Left]: [4, 7, 0, 3],     // BottomLeftBack, BottomLeftFront, TopLeftFront, TopLeftBack
    [Face.Right]: [6, 5, 2, 1]     // BottomRightFront, BottomRightBack, TopRightBack, TopRightFront
};

// Edge corner indices relative to face (which 2 corners form each edge)
// Order: [startCornerIndex, endCornerIndex] within face's 4 corners
export const FACE_EDGE_CORNERS = {
    [Edge.Front]: [0, 1],  // faceCorners[0] to faceCorners[1]
    [Edge.Back]: [2, 3],   // faceCorners[2] to faceCorners[3]
    [Edge.Left]: [3, 0],   // faceCorners[3] to faceCorners[0]
    [Edge.Right]: [1, 2]   // faceCorners[1] to faceCorners[2]
};

export class Voxel {
    constructor(x, y, z, corners = null) {
        this.x = x;
        this.y = y;
        this.z = z;

        // 8 corners, each with [x, y, z]
        if (corners) {
            this.corners = corners.map(c => [...c]);
        } else {
            this.corners = IDENTITY_CORNERS.map(c => [...c]);
        }

        // Per-face materials (for future use)
        this.faceMaterials = [0, 0, 0, 0, 0, 0];

        // Per-face diagonal flip flags (for manual edge control)
        // false = default diagonal (0-2), true = alternate diagonal (1-3)
        this.faceFlipped = [false, false, false, false, false, false];

        // Cached flags for optimization
        this.unIndentedSides = 0x3F; // All sides unindented initially
        this.hiddenSides = 0;
    }

    /**
     * Toggle the diagonal flip for a face
     */
    toggleFaceDiagonal(face) {
        this.faceFlipped[face] = !this.faceFlipped[face];
        return this.faceFlipped[face];
    }

    /**
     * Get the key for this voxel's position
     */
    getKey() {
        return `${this.x},${this.y},${this.z}`;
    }

    /**
     * Clone this voxel
     */
    clone() {
        const cloned = new Voxel(this.x, this.y, this.z, this.corners);
        cloned.faceMaterials = [...this.faceMaterials];
        cloned.faceFlipped = [...this.faceFlipped];
        cloned.unIndentedSides = this.unIndentedSides;
        cloned.hiddenSides = this.hiddenSides;
        return cloned;
    }

    /**
     * Get face vertices (4 corners of a face)
     */
    getFaceVertices(face) {
        const cornerIndices = FACE_CORNERS[face];
        return cornerIndices.map(i => [...this.corners[i]]);
    }

    /**
     * Set face vertices
     */
    setFaceVertices(face, vertices) {
        const cornerIndices = FACE_CORNERS[face];
        for (let i = 0; i < 4; i++) {
            this.corners[cornerIndices[i]] = [...vertices[i]];
        }
        this.updateFlags();
    }

    /**
     * Get edge vertices (2 corners of an edge on a face)
     */
    getEdgeVertices(face, edge) {
        const faceCornerIndices = FACE_CORNERS[face];
        const edgeIndices = FACE_EDGE_CORNERS[edge];
        return [
            [...this.corners[faceCornerIndices[edgeIndices[0]]]],
            [...this.corners[faceCornerIndices[edgeIndices[1]]]]
        ];
    }

    /**
     * Set edge vertices
     */
    setEdgeVertices(face, edge, vertices) {
        const faceCornerIndices = FACE_CORNERS[face];
        const edgeIndices = FACE_EDGE_CORNERS[edge];
        this.corners[faceCornerIndices[edgeIndices[0]]] = [...vertices[0]];
        this.corners[faceCornerIndices[edgeIndices[1]]] = [...vertices[1]];
        this.updateFlags();
    }

    /**
     * Move a face by delta along an axis
     * Returns out-of-bound state: 'within', 'add', or 'remove'
     */
    moveFace(face, delta, axis) {
        const faceVertices = this.getFaceVertices(face);
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        // Store original position for logging
        const originalPos = faceVertices[0][axisIndex];

        // Add delta to all face vertices
        for (let i = 0; i < 4; i++) {
            faceVertices[i][0] += delta * axis[0];
            faceVertices[i][1] += delta * axis[1];
            faceVertices[i][2] += delta * axis[2];
        }

        const targetPos = faceVertices[0][axisIndex];

        // Check if any vertex went out of bounds (before clamping)
        const wentOutOfBounds = this.anyVertexOutOfBounds(faceVertices);

        // Clamp vertices to cube bounds
        for (let i = 0; i < 4; i++) {
            faceVertices[i] = this.clampVertex(faceVertices[i]);
        }

        // Check if this would collapse the voxel BEFORE applying
        // Save current corners, apply change, check, then restore if collapsed
        const savedCorners = this.corners.map(c => [...c]);

        // Apply the change
        this.setFaceVertices(face, faceVertices);

        // Check for collapse (voxel fully flattened)
        if (this.isCollapsed()) {
            // Restore corners - don't allow the collapse to be applied directly
            this.corners = savedCorners;
            this.updateFlags();

            // If we went out of bounds while pushing outward, we should extend
            if (wentOutOfBounds) {
                // Re-apply the change (up to the boundary) since we need to extend
                for (let i = 0; i < 4; i++) {
                    faceVertices[i] = this.clampVertex(faceVertices[i]);
                }
                this.setFaceVertices(face, faceVertices);
                return 'add';
            }

            // If we're pushing INWARD (indenting) and would collapse, signal removal
            // delta < 0 means pushing inward (indenting) - face moves toward center of voxel
            // delta > 0 means pushing outward (extending) - face moves away from center
            if (delta < 0) {
                return 'remove';
            }

            return 'within'; // Block the move - don't collapse
        }

        // Check if went out of bounds (need to extend)
        if (wentOutOfBounds) {
            return 'add';
        }

        return 'within';
    }

    /**
     * Move an edge by delta along an axis
     */
    moveEdge(face, edge, delta, axis) {
        const edgeVertices = this.getEdgeVertices(face, edge);

        // Add delta to edge vertices
        edgeVertices[0][0] += delta * axis[0];
        edgeVertices[0][1] += delta * axis[1];
        edgeVertices[0][2] += delta * axis[2];
        edgeVertices[1][0] += delta * axis[0];
        edgeVertices[1][1] += delta * axis[1];
        edgeVertices[1][2] += delta * axis[2];

        // Check if out of bounds before clamping
        const wentOutOfBounds = this.anyVertexOutOfBounds(edgeVertices);

        if (wentOutOfBounds) {
            if (this.isFaceBoxSideAligned(face)) {
                return 'addEdge';
            }
            // Clamp and apply anyway
        }

        // Clamp vertices
        edgeVertices[0] = this.clampVertex(edgeVertices[0]);
        edgeVertices[1] = this.clampVertex(edgeVertices[1]);

        // Apply the change
        this.setEdgeVertices(face, edge, edgeVertices);
        return 'within';
    }

    /**
     * Move a single vertex of an edge
     */
    moveVertex(face, edge, vertexIndex, delta, axis) {
        const edgeVertices = this.getEdgeVertices(face, edge);

        edgeVertices[vertexIndex][0] += delta * axis[0];
        edgeVertices[vertexIndex][1] += delta * axis[1];
        edgeVertices[vertexIndex][2] += delta * axis[2];

        edgeVertices[vertexIndex] = this.clampVertex(edgeVertices[vertexIndex]);

        // Update the vertex
        const faceCornerIndices = FACE_CORNERS[face];
        const edgeIndices = FACE_EDGE_CORNERS[edge];
        this.corners[faceCornerIndices[edgeIndices[vertexIndex]]] = edgeVertices[vertexIndex];
        this.updateFlags();
        return 'within';
    }

    /**
     * Clamp a vertex to cube bounds
     */
    clampVertex(v) {
        return [
            Math.max(-0.5, Math.min(0.5, Math.round(v[0] * 1000) / 1000)),
            Math.max(-0.5, Math.min(0.5, Math.round(v[1] * 1000) / 1000)),
            Math.max(-0.5, Math.min(0.5, Math.round(v[2] * 1000) / 1000))
        ];
    }

    /**
     * Check if any vertex is out of bounds
     */
    anyVertexOutOfBounds(vertices) {
        for (const v of vertices) {
            for (let i = 0; i < 3; i++) {
                if (v[i] < -0.5 - 0.001 || v[i] > 0.5 + 0.001) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if face is aligned with cube boundary
     */
    isFaceBoxSideAligned(face) {
        const faceVertices = this.getFaceVertices(face);
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const expectedValue = axis[axisIndex] * 0.5;

        for (const v of faceVertices) {
            if (Math.abs(v[axisIndex] - expectedValue) > 0.001) {
                return false;
            }
        }
        return true;
    }

    /**
     * Check if cube is collapsed (has no volume)
     * Uses convex hull volume calculation - a voxel is collapsed if volume is near zero
     *
     * A voxel with minimum dimension 0.25 (one step) should have volume ~0.0625
     * (if other dimensions are also minimum). So threshold must be well below this.
     */
    isCollapsed() {
        // Calculate approximate volume using tetrahedron decomposition
        const volume = this.calculateVolume();

        // Threshold must be much smaller than minimum valid volume
        // Minimum valid voxel: 0.25 x 0.25 x 0.25 = 0.015625
        // Use a threshold well below this
        const VOLUME_THRESHOLD = 0.001;
        return volume < VOLUME_THRESHOLD;
    }

    /**
     * Calculate the volume of the voxel using tetrahedron decomposition
     * The voxel is a hexahedron - we decompose it into 5 tetrahedra
     */
    calculateVolume() {
        // Decompose hexahedron into 5 tetrahedra
        // Using corners: 0,1,2,3 (top), 4,5,6,7 (bottom)
        // Tetrahedra: (0,1,2,5), (0,2,3,5), (0,3,4,5), (0,4,7,5), (0,5,6,7) - wait, that's not right

        // Better approach: decompose into 6 tetrahedra from center
        // Or use the signed volume method for each face

        // Simpler: Calculate using 5 tetrahedra decomposition
        // Tetra 1: 0,1,3,4
        // Tetra 2: 1,2,3,4
        // Tetra 3: 2,3,4,5
        // Tetra 4: 1,4,5,6
        // Tetra 5: 1,2,5,6

        // Actually, let's use a standard decomposition:
        // Split into 5 tetrahedra using diagonal
        const c = this.corners;

        let totalVolume = 0;

        // Decomposition into 5 tetrahedra (one standard way)
        totalVolume += this.tetrahedronVolume(c[0], c[1], c[3], c[4]);
        totalVolume += this.tetrahedronVolume(c[1], c[2], c[3], c[4]);
        totalVolume += this.tetrahedronVolume(c[2], c[4], c[5], c[3]);
        totalVolume += this.tetrahedronVolume(c[1], c[4], c[6], c[5]);
        totalVolume += this.tetrahedronVolume(c[1], c[4], c[5], c[2]);

        return Math.abs(totalVolume);
    }

    /**
     * Calculate signed volume of tetrahedron formed by 4 points
     * Volume = |det([b-a, c-a, d-a])| / 6
     */
    tetrahedronVolume(a, b, c, d) {
        // Vectors from a
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];

        // Scalar triple product (determinant)
        const det = ab[0] * (ac[1] * ad[2] - ac[2] * ad[1])
                  - ab[1] * (ac[0] * ad[2] - ac[2] * ad[0])
                  + ab[2] * (ac[0] * ad[1] - ac[1] * ad[0]);

        return det / 6.0;
    }

    /**
     * Get 3 non-collinear points from corners
     */
    getPlaneVertices() {
        // Get unique corners
        const unique = [];
        for (const c of this.corners) {
            let found = false;
            for (const u of unique) {
                if (Math.abs(c[0] - u[0]) < 0.001 &&
                    Math.abs(c[1] - u[1]) < 0.001 &&
                    Math.abs(c[2] - u[2]) < 0.001) {
                    found = true;
                    break;
                }
            }
            if (!found) unique.push(c);
        }

        if (unique.length < 3) return null;

        // Find 3 non-collinear points
        const p0 = unique[0];
        const p1 = unique[1];
        const baseDir = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const baseLen = Math.sqrt(baseDir[0] ** 2 + baseDir[1] ** 2 + baseDir[2] ** 2);
        if (baseLen < 0.001) return null;
        baseDir[0] /= baseLen;
        baseDir[1] /= baseLen;
        baseDir[2] /= baseLen;

        for (let i = 2; i < unique.length; i++) {
            const dir = [unique[i][0] - p0[0], unique[i][1] - p0[1], unique[i][2] - p0[2]];
            const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
            if (len < 0.001) continue;
            dir[0] /= len;
            dir[1] /= len;
            dir[2] /= len;

            const dot = baseDir[0] * dir[0] + baseDir[1] * dir[1] + baseDir[2] * dir[2];
            if (Math.abs(dot) < 0.99) {
                return [p0, p1, unique[i]];
            }
        }

        return null;
    }

    /**
     * Check if corner configuration is legal (all face normals point outward)
     */
    isLegal(corners = null) {
        corners = corners || this.corners;

        for (let face = 0; face < 6; face++) {
            const cornerIndices = FACE_CORNERS[face];
            const faceVerts = cornerIndices.map(i => corners[i]);

            // Calculate face normal using Newell's method
            let normal = [0, 0, 0];
            for (let i = 0; i < 4; i++) {
                const curr = faceVerts[i];
                const next = faceVerts[(i + 1) % 4];
                normal[0] += (curr[1] - next[1]) * (curr[2] + next[2]);
                normal[1] += (curr[2] - next[2]) * (curr[0] + next[0]);
                normal[2] += (curr[0] - next[0]) * (curr[1] + next[1]);
            }

            const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
            if (len > 0.0001) {
                normal[0] /= len;
                normal[1] /= len;
                normal[2] /= len;
            }

            const faceAxis = FACE_AXIS[face];
            const dot = normal[0] * faceAxis[0] + normal[1] * faceAxis[1] + normal[2] * faceAxis[2];

            if (dot < -0.0001) {
                return false;
            }
        }

        return true;
    }

    /**
     * Update cached flags
     */
    updateFlags() {
        this.unIndentedSides = 0;

        // Check which corners are at identity positions
        const isCornerTouched = [];
        let touchedCount = 0;
        for (let i = 0; i < 8; i++) {
            const id = IDENTITY_CORNERS[i];
            const c = this.corners[i];
            const touched = Math.abs(c[0] - id[0]) > 0.001 ||
                           Math.abs(c[1] - id[1]) > 0.001 ||
                           Math.abs(c[2] - id[2]) > 0.001;
            isCornerTouched.push(touched);
            if (touched) touchedCount++;
        }

        // If no corners touched, all sides are unindented
        if (touchedCount === 0) {
            this.unIndentedSides = 0x3F;
            return;
        }

        // If 4+ corners touched, no sides are fully unindented
        if (touchedCount >= 4) {
            this.unIndentedSides = 0;
            return;
        }

        // Check each face
        const faceFlags = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20]; // Top, Bottom, Front, Back, Left, Right

        for (let face = 0; face < 6; face++) {
            const corners = FACE_CORNERS[face];
            let allTouched = true;
            for (const c of corners) {
                if (!isCornerTouched[c]) {
                    allTouched = false;
                    break;
                }
            }
            if (!allTouched) {
                this.unIndentedSides |= faceFlags[face];
            }
        }
    }

    /**
     * Un-indent a face (restore to boundary)
     */
    unIndentFace(face) {
        const faceVertices = this.getFaceVertices(face);
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const targetValue = axis[axisIndex] * 0.5;

        for (const v of faceVertices) {
            v[axisIndex] = targetValue;
        }

        this.setFaceVertices(face, faceVertices);
    }

    /**
     * Get neighbor position in given direction
     */
    getNeighborPosition(face) {
        const axis = FACE_AXIS[face];
        return {
            x: this.x + axis[0],
            y: this.y + axis[1],
            z: this.z + axis[2]
        };
    }

    /**
     * Create a collapsed voxel (for extending into neighbor space)
     * fromFace: the face of the ORIGINAL voxel that was pushed out
     * The new voxel should be collapsed at the face touching the original
     */
    static createCollapsed(x, y, z, fromFace) {
        const voxel = new Voxel(x, y, z);

        // The face touching the original voxel is OPPOSITE to fromFace
        // e.g., if original's Top was pushed up, new voxel's Bottom touches it
        const touchingFace = OPPOSITE_FACE[fromFace];
        const axis = FACE_AXIS[touchingFace];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        // All corners collapse to the touching face's position
        // touchingFace axis points OUTWARD from that face
        // So the boundary is at axis[axisIndex] * 0.5
        const collapseValue = axis[axisIndex] * 0.5;

        // Move all corners to the collapsed position
        for (let i = 0; i < 8; i++) {
            voxel.corners[i][axisIndex] = collapseValue;
        }

        return voxel;
    }

    /**
     * Serialize for storage
     */
    serialize() {
        return {
            x: this.x,
            y: this.y,
            z: this.z,
            corners: this.corners.map(c => [...c]),
            materials: [...this.faceMaterials],
            flipped: [...this.faceFlipped]
        };
    }

    /**
     * Deserialize from storage
     */
    static deserialize(data) {
        const voxel = new Voxel(data.x, data.y, data.z, data.corners);
        if (data.materials) {
            voxel.faceMaterials = [...data.materials];
        }
        if (data.flipped) {
            voxel.faceFlipped = [...data.flipped];
        }
        voxel.updateFlags();
        return voxel;
    }
}
