import * as THREE from 'three';
import { Voxel, Face, Edge, FACE_AXIS, FACE_CORNERS, FACE_EDGE_CORNERS, OPPOSITE_FACE } from './Voxel.js';
import { VoxelWorld } from './VoxelWorld.js';

/**
 * VoxelEditor handles mouse interaction for editing voxels
 * Matches the C# implementation's approach to face/edge editing
 */
export class VoxelEditor {
    constructor(voxelWorld, camera, domElement) {
        this.world = voxelWorld;
        this.camera = camera;
        this.domElement = domElement;

        // Raycaster for mouse picking
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Drag state
        this.isDragging = false;
        this.dragVoxel = null;
        this.dragFace = null;
        this.dragEdge = Edge.None;
        this.dragCorner = -1; // Corner local index (0-3) or -1 for no corner
        this.dragAxis = [0, 0, 0];
        this.dragPlane = new THREE.Plane();
        this.dragStartPoint = new THREE.Vector3();
        this.lastDragDelta = 0;

        // Track if current voxel was just created by extension (prevent immediate collapse)
        this.justExtended = false;

        // Step size for discrete movements (4 steps across 1 unit = 0.25 per step)
        this.stepSize = 0.25;

        // Edge detection threshold
        this.edgeThreshold = 0.15;

        // Corner detection threshold
        this.cornerThreshold = 0.12;

        // Grid plane for placing voxels on empty space
        // The visual grid is at Y=-0.5, so the plane should be there too
        this.gridPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5); // Y=-0.5 plane (normal·point + d = 0, so d=0.5 for y=-0.5)
        this.gridSize = 10; // Grid extends from -10 to 10

        // Grid placement indicator (separate from voxel hover indicator)
        this.gridIndicator = null;

        // Hover indicator
        this.hoverIndicator = null;
        this.hoverType = null; // 'face', 'edge', or 'corner'
        this.indicatorOpacity = 0;
        this.indicatorTargetOpacity = 0;
        this.indicatorPulsePhase = 0;
        this.createIndicatorMaterials();

        // Track current hover target for keyboard actions
        this.hoveredVoxelKey = null;
        this.hoveredFace = null;
        this.hoveredGridCell = null;

        // Editing enabled state
        this.enabled = true;

        // Fill Extrude mode - extrudes all connected coplanar faces together
        this.fillExtrudeEnabled = false;

        // Track connected faces for fill extrude drag
        this.fillExtrudeFaces = null; // Array of {voxel, face} for fill drag
        this.fillExtrudeBaseFaces = null; // Array of {voxel, face} for the ORIGINAL base layer (to restore when collapsing back)
        this.fillExtrudePartialVoxels = null; // Array of partial voxels being grown (during extension)
        this.fillExtrudeGrowing = false; // True when we have partial voxels being grown
        this.fillExtrudeGrowingFromIndent = false; // True if partial voxels were created by indent (not extension)

        // Shift+click face selection mode
        this.selectedFaces = []; // Array of {voxel, face} for selected faces
        this.selectionIndicators = []; // Three.js meshes for selection highlights
        // Note: selectionMaterial is created in createIndicatorMaterials()

        // Bind event handlers
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        // Add event listeners
        this.domElement.addEventListener('mousedown', this.onMouseDown);
        this.domElement.addEventListener('mousemove', this.onMouseMove);
        this.domElement.addEventListener('mouseup', this.onMouseUp);
    }

    /**
     * Update mouse position from event
     */
    updateMouse(event) {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * Perform raycast and determine what's under the cursor
     *
     * IMPORTANT: For beveled/triangular faces, the geometric normal points diagonally.
     * We use the custom 'faceId' attribute stored in the geometry to determine the
     * LOGICAL face that was clicked, not the geometric face.
     */
    raycast() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const meshes = this.world.getMeshes();
        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length === 0) {
            return null;
        }

        const hit = intersects[0];
        const voxelKey = hit.object.userData.voxelKey;
        const voxel = this.world.voxels.get(voxelKey);

        if (!voxel) return null;

        // Get local hit point (relative to voxel center)
        const localPoint = hit.point.clone().sub(hit.object.position);

        // Determine which face was hit using the faceId attribute (NOT the geometric normal)
        // This is critical for beveled triangular surfaces where the geometric normal is diagonal
        let face = this.getFaceFromHit(hit);
        if (face === null) {
            // Fallback to normal-based detection if faceId not available
            face = this.getFaceFromNormal(hit.face.normal);
        }
        if (face === null) return null;

        // Check if we're near a corner of this face (corners take priority)
        const cornerResult = this.getCornerFromPoint(voxel, face, localPoint);

        // Check if we're near an edge of this face
        const edgeResult = this.getEdgeFromPoint(voxel, face, localPoint);

        return {
            voxel,
            voxelKey,
            face,
            edge: cornerResult.corner === -1 ? edgeResult.edge : Edge.None,
            corner: cornerResult.corner,
            point: hit.point,
            localPoint,
            normal: hit.face.normal
        };
    }

    /**
     * Raycast onto the grid plane (Y=0) when no voxel is hit
     * Returns the grid cell position or null if outside grid bounds
     */
    raycastGrid() {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersection = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.gridPlane, intersection)) {
            return null;
        }

        // Check if within grid bounds
        if (Math.abs(intersection.x) > this.gridSize || Math.abs(intersection.z) > this.gridSize) {
            return null;
        }

        // Snap to grid cell (voxels are centered at integer coordinates)
        const gridX = Math.floor(intersection.x + 0.5);
        const gridZ = Math.floor(intersection.z + 0.5);
        const gridY = 0; // Place on ground level

        return {
            x: gridX,
            y: gridY,
            z: gridZ,
            point: intersection
        };
    }

    /**
     * Determine if hit point is near a corner of the face
     */
    getCornerFromPoint(voxel, face, localPoint) {
        const faceVertices = voxel.getFaceVertices(face);

        let closestCorner = -1;
        let closestDist = this.cornerThreshold;

        for (let i = 0; i < 4; i++) {
            const v = faceVertices[i];
            const dist = Math.sqrt(
                (localPoint.x - v[0]) ** 2 +
                (localPoint.y - v[1]) ** 2 +
                (localPoint.z - v[2]) ** 2
            );

            if (dist < closestDist) {
                closestDist = dist;
                closestCorner = i;
            }
        }

        return { corner: closestCorner, distance: closestDist };
    }

    /**
     * Get face enum from hit intersection using the faceId attribute
     * This reads the custom attribute we stored in the geometry
     */
    getFaceFromHit(hit) {
        const geometry = hit.object.geometry;
        const faceIdAttr = geometry.getAttribute('faceId');

        if (!faceIdAttr) {
            return null; // No faceId attribute, use fallback
        }

        // Get the vertex indices of the hit triangle
        const indices = geometry.index;
        if (!indices) {
            return null;
        }

        // hit.faceIndex is the index of the triangle (each triangle has 3 vertices)
        const triangleIndex = hit.faceIndex;
        const vertexIndex = indices.getX(triangleIndex * 3); // First vertex of triangle

        // Get the face ID from the attribute
        const faceId = Math.round(faceIdAttr.getX(vertexIndex));

        // Validate face ID
        if (faceId >= 0 && faceId <= 5) {
            return faceId;
        }

        return null;
    }

    /**
     * Get face enum from normal vector
     * Uses dominant axis detection to handle beveled faces where normals are angled
     */
    getFaceFromNormal(normal) {
        // Find the dominant axis (largest absolute component)
        const absX = Math.abs(normal.x);
        const absY = Math.abs(normal.y);
        const absZ = Math.abs(normal.z);

        // Use a minimum threshold to avoid degenerate cases
        const minThreshold = 0.3;

        if (absY >= absX && absY >= absZ && absY > minThreshold) {
            return normal.y > 0 ? Face.Top : Face.Bottom;
        }
        if (absZ >= absX && absZ >= absY && absZ > minThreshold) {
            return normal.z < 0 ? Face.Front : Face.Back;
        }
        if (absX >= absY && absX >= absZ && absX > minThreshold) {
            return normal.x < 0 ? Face.Left : Face.Right;
        }

        return null;
    }

    /**
     * Determine if hit point is near an edge of the face
     */
    getEdgeFromPoint(voxel, face, localPoint) {
        const faceVertices = voxel.getFaceVertices(face);

        // Calculate face dimensions to make edge threshold proportional
        // Find the minimum edge length of the face
        let minEdgeLength = Infinity;
        for (let i = 0; i < 4; i++) {
            const v0 = faceVertices[i];
            const v1 = faceVertices[(i + 1) % 4];
            const dx = v1[0] - v0[0];
            const dy = v1[1] - v0[1];
            const dz = v1[2] - v0[2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len > 0.01) { // Ignore degenerate edges
                minEdgeLength = Math.min(minEdgeLength, len);
            }
        }

        // Edge threshold should be proportional to face size
        // Use 20% of the smallest edge, but cap it
        const dynamicThreshold = Math.min(this.edgeThreshold, minEdgeLength * 0.2);

        // Get the edges of this face
        const edges = [Edge.Front, Edge.Back, Edge.Left, Edge.Right];
        let closestEdge = Edge.None;
        let closestDist = dynamicThreshold;

        for (const edge of edges) {
            // Get the two vertices of this edge
            const edgeIndices = this.getEdgeVertexIndices(edge);
            const v0 = faceVertices[edgeIndices[0]];
            const v1 = faceVertices[edgeIndices[1]];

            // Distance from point to line segment
            const dist = this.pointToLineDistance(
                [localPoint.x, localPoint.y, localPoint.z],
                v0, v1
            );

            if (dist < closestDist) {
                closestDist = dist;
                closestEdge = edge;
            }
        }

        return { edge: closestEdge, distance: closestDist };
    }

    /**
     * Get vertex indices for edge (matching FACE_EDGE_CORNERS)
     */
    getEdgeVertexIndices(edge) {
        switch (edge) {
            case Edge.Front: return [0, 1];
            case Edge.Back: return [2, 3];
            case Edge.Left: return [3, 0];
            case Edge.Right: return [1, 2];
            default: return [0, 1];
        }
    }

    /**
     * Calculate distance from point to line segment
     */
    pointToLineDistance(p, v0, v1) {
        const dx = v1[0] - v0[0];
        const dy = v1[1] - v0[1];
        const dz = v1[2] - v0[2];

        const t = Math.max(0, Math.min(1,
            ((p[0] - v0[0]) * dx + (p[1] - v0[1]) * dy + (p[2] - v0[2]) * dz) /
            (dx * dx + dy * dy + dz * dz + 0.0001)
        ));

        const closestX = v0[0] + t * dx;
        const closestY = v0[1] + t * dy;
        const closestZ = v0[2] + t * dz;

        return Math.sqrt(
            (p[0] - closestX) ** 2 +
            (p[1] - closestY) ** 2 +
            (p[2] - closestZ) ** 2
        );
    }

    /**
     * Handle mouse down - start drag
     */
    onMouseDown(event) {
        if (event.button !== 0) return; // Only left click
        if (!this.enabled) return; // Editing disabled

        // Save undo state before any action
        this.world.saveUndoState();

        this.updateMouse(event);
        const hit = this.raycast();

        // Shift+click: face selection mode (disabled when Fill Extrude is active)
        if (event.shiftKey && !this.fillExtrudeEnabled && hit && hit.edge === Edge.None && (hit.corner === undefined || hit.corner === -1)) {
            event.stopPropagation();
            this.toggleFaceSelection(hit.voxel, hit.face);
            return;
        }

        // Click without Shift: clear selection (if any)
        if (!event.shiftKey && this.selectedFaces.length > 0) {
            this.clearFaceSelection();
        }

        if (!hit) {
            // No voxel hit - try to place on grid
            const gridHit = this.raycastGrid();
            if (gridHit) {
                // Check if there's already a voxel at this position
                const key = VoxelWorld.getKey(gridHit.x, gridHit.y, gridHit.z);
                if (!this.world.voxels.has(key)) {
                    // Prevent orbit controls
                    event.stopPropagation();

                    // Create new voxel at grid position
                    const newVoxel = this.world.addVoxel(gridHit.x, gridHit.y, gridHit.z);

                    // Handle mirror mode
                    if (this.world.mirrorEnabled) {
                        this.world.updateAllMirrors();
                    }

                    // Select the new voxel's top face
                    this.world.setSelection(key, Face.Top, Edge.None);

                    // Hide indicator
                    this.hideIndicator();
                    return;
                }
            }

            this.world.clearSelection();
            return;
        }

        // Prevent orbit controls
        event.stopPropagation();

        // Start drag
        this.isDragging = true;
        this.dragVoxel = hit.voxel;
        this.dragFace = hit.face;
        this.dragEdge = hit.edge;
        this.dragCorner = hit.corner;

        // Capture connected faces for Fill Extrude drag (only for face drags, not edge/corner)
        // Allow Fill Extrude on non-beveled faces, even if not at boundary (for partial voxels)
        console.log('[FillExtrude] onMouseDown - enabled:', this.fillExtrudeEnabled, 'edge:', hit.edge, 'corner:', hit.corner);
        console.log('[FillExtrude] isFaceBeveled:', this.isFaceBeveled(hit.voxel, hit.face), 'isFaceAtBoundary:', this.isFaceAtBoundary(hit.voxel, hit.face));

        if (this.fillExtrudeEnabled &&
            hit.edge === Edge.None &&
            (hit.corner === undefined || hit.corner === -1) &&
            !this.isFaceBeveled(hit.voxel, hit.face)) {

            const atBoundary = this.isFaceAtBoundary(hit.voxel, hit.face);
            this.fillExtrudeFaces = this.findConnectedCoplanarFaces(hit.voxel, hit.face);
            console.log('[FillExtrude] Found', this.fillExtrudeFaces.length, 'connected faces, atBoundary:', atBoundary);

            // If faces are not at boundary, we're continuing to grow partial voxels
            if (!atBoundary && this.fillExtrudeFaces.length > 0) {
                // Convert to partial voxel tracking format
                this.fillExtrudePartialVoxels = this.fillExtrudeFaces.map(({ voxel, face }) => ({
                    voxel,
                    face,
                    sourceVoxel: voxel // For partial voxels, source is itself
                }));
                this.fillExtrudeGrowing = true;

                // Find the base layer voxels (the full voxels below these partials)
                // so we can restore them if we shrink back
                const oppositeFace = OPPOSITE_FACE[hit.face];
                const baseFaces = [];
                console.log('[FillExtrude] Looking for base faces, oppositeFace:', oppositeFace, 'clickedFace:', hit.face);
                for (const { voxel, face: voxelFace } of this.fillExtrudeFaces) {
                    const behindPos = voxel.getNeighborPosition(oppositeFace);
                    const behindKey = VoxelWorld.getKey(behindPos.x, behindPos.y, behindPos.z);
                    const behindVoxel = this.world.voxels.get(behindKey);
                    console.log('[FillExtrude] Checking behind', voxel.getKey(), '-> behindPos:', behindKey, 'exists:', !!behindVoxel);
                    if (behindVoxel) {
                        const atBoundary = this.isFaceAtBoundary(behindVoxel, voxelFace);
                        console.log('[FillExtrude] behindVoxel', behindKey, 'face', voxelFace, 'atBoundary:', atBoundary);
                        if (atBoundary) {
                            baseFaces.push({ voxel: behindVoxel, face: voxelFace });
                        }
                    }
                }
                if (baseFaces.length > 0) {
                    this.fillExtrudeBaseFaces = baseFaces;
                    console.log('[FillExtrude] Partial voxel mode - saved base faces:', baseFaces.length);
                } else {
                    console.log('[FillExtrude] WARNING: No base faces found!');
                }

                console.log('[FillExtrude] Partial voxel mode - growing:', this.fillExtrudeGrowing);
            } else {
                this.fillExtrudePartialVoxels = null;
                this.fillExtrudeGrowing = false;
                console.log('[FillExtrude] Full voxel mode');
            }
        } else {
            this.fillExtrudeFaces = null;
            this.fillExtrudePartialVoxels = null;
            this.fillExtrudeGrowing = false;
            console.log('[FillExtrude] Disabled for this drag');
        }

        // Hide the hover indicator when dragging starts
        this.hideIndicator();

        // Get drag axis (face normal direction)
        this.dragAxis = FACE_AXIS[hit.face];

        // Set up drag plane perpendicular to camera direction
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        this.dragPlane.setFromNormalAndCoplanarPoint(cameraDir, hit.point);
        this.dragStartPoint.copy(hit.point);
        this.lastDragDelta = 0;

        // Set selection
        this.world.setSelection(hit.voxelKey, hit.face, hit.edge);

        // If fill extrude is active, highlight all voxels in the group
        if (this.fillExtrudeFaces && this.fillExtrudeFaces.length > 1) {
            const groupKeys = this.fillExtrudeFaces.map(({ voxel }) => voxel.getKey());
            this.world.setFillGroupSelection(groupKeys);
        }
    }

    /**
     * Handle mouse move - drag operation
     */
    onMouseMove(event) {
        this.updateMouse(event);

        if (!this.enabled) {
            this.hideIndicator();
            return;
        }

        if (this.isDragging) {
            this.handleDrag();
        } else {
            this.handleHover();
        }
    }

    /**
     * Handle drag operation
     */
    handleDrag() {
        if (!this.dragVoxel) return;

        // Raycast onto drag plane
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersection = new THREE.Vector3();

        if (!this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
            return;
        }

        // Calculate movement along drag axis
        const movement = intersection.clone().sub(this.dragStartPoint);
        const dragAmount = movement.x * this.dragAxis[0] +
                          movement.y * this.dragAxis[1] +
                          movement.z * this.dragAxis[2];

        // Snap to step size
        const snappedDelta = Math.round(dragAmount / this.stepSize) * this.stepSize;

        // Only process if changed
        if (Math.abs(snappedDelta - this.lastDragDelta) < 0.001) {
            return;
        }

        const deltaDiff = snappedDelta - this.lastDragDelta;
        this.lastDragDelta = snappedDelta;

        if (this.dragEdge !== Edge.None) {
            this.handleEdgeDrag(deltaDiff);
        } else if (this.fillExtrudeFaces && this.fillExtrudeFaces.length > 0) {
            // Fill Extrude drag - move all connected faces together
            this.handleFillExtrudeDrag(deltaDiff);
        } else {
            this.handleFaceDrag(deltaDiff);
        }
    }

    /**
     * Handle face drag
     */
    handleFaceDrag(delta) {
        const voxel = this.dragVoxel;
        const face = this.dragFace;
        const axis = this.dragAxis;
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        // Get current face position before move
        // For beveled faces, vertices may be at different positions - find the outermost one
        const faceVertices = voxel.getFaceVertices(face);
        let currentFacePos;
        if (axis[axisIndex] > 0) {
            // Positive direction face - find the maximum position (outermost)
            currentFacePos = Math.max(...faceVertices.map(v => v[axisIndex]));
        } else {
            // Negative direction face - find the minimum position (outermost)
            currentFacePos = Math.min(...faceVertices.map(v => v[axisIndex]));
        }

        // Calculate where the face WOULD go
        const targetFacePos = currentFacePos + delta * axis[axisIndex];

        // Boundary in the direction we're moving
        const boundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const result = voxel.moveFace(face, delta, axis);

        if (result === 'remove') {
            // Voxel collapsed from indenting
            this.world.removeVoxel(voxel.x, voxel.y, voxel.z);

            // Continue indenting into the next voxel behind this one
            // Don't apply any indent yet - just switch to the next voxel
            // The next mouse move will naturally continue the indent
            this.handleFaceIndentation(face, 0);
        } else if (result === 'add') {
            // Face pushed out of bounds - but we only extend when pushing OUTWARD
            // (in the direction of the face's normal axis)
            //
            // For positive axis faces (Right/Top/Back): extend when delta > 0, overflow past +0.5
            // For negative axis faces (Left/Bottom/Front): extend when delta > 0, overflow past -0.5
            //
            // If delta < 0, we're pushing inward - that might go out of bounds on the
            // opposite side but we should NOT extend in that case

            // Only extend when pushing in the OUTWARD direction
            if (delta <= 0) {
                this.world.updateVoxelMesh(voxel);
            } else {
                // Calculate overflow - how far past the boundary in the extension direction
                let overflow;
                if (axis[axisIndex] > 0) {
                    // Positive direction face (Right, Top, Back) - boundary at +0.5
                    overflow = targetFacePos - 0.5;
                } else {
                    // Negative direction face (Left, Bottom, Front) - boundary at -0.5
                    overflow = -0.5 - targetFacePos;
                }

                this.justExtended = false;
                this.world.updateVoxelMesh(voxel); // Update the current voxel first

                if (overflow > 0.001) {
                    this.handleFaceExtension(overflow);
                }
            }
        } else {
            // Normal update
            this.justExtended = false;
            this.world.updateVoxelMesh(voxel);
        }
    }

    /**
     * Handle Fill Extrude drag - move all connected coplanar faces together
     * Supports smooth 0.25 step increments like regular face drag
     */
    handleFillExtrudeDrag(delta) {
        console.log('[FillExtrude] drag delta:', delta, 'faces:', this.fillExtrudeFaces?.length, 'growing:', this.fillExtrudeGrowing);

        if (!this.fillExtrudeFaces || this.fillExtrudeFaces.length === 0) {
            console.log('[FillExtrude] No faces, returning');
            return;
        }

        if (delta > 0) {
            // Extending outward
            this.handleFillExtrudeExtend(delta);
        } else if (delta < 0) {
            // Collapsing inward
            this.handleFillExtrudeIndent(delta);
        }
    }

    /**
     * Handle Fill Extrude extension with 0.25 step support
     * Creates partial voxels and grows them incrementally
     */
    handleFillExtrudeExtend(delta) {
        const face = this.dragFace;
        const axis = this.dragAxis;

        console.log('[FillExtrudeExtend] delta:', delta, 'growing:', this.fillExtrudeGrowing, 'partialVoxels:', this.fillExtrudePartialVoxels?.length);

        // If we're currently growing partial voxels, continue growing them
        if (this.fillExtrudeGrowing && this.fillExtrudePartialVoxels) {
            console.log('[FillExtrudeExtend] Growing partial voxels');
            this.growFillExtrudePartialVoxels(delta);
            return;
        }

        // Check if all faces are at boundary (can extend)
        let canExtend = true;
        console.log('[FillExtrudeExtend] Checking boundary for', this.fillExtrudeFaces.length, 'faces, face:', face);
        for (const { voxel, face: voxelFace } of this.fillExtrudeFaces) {
            const atBoundary = this.isFaceAtBoundary(voxel, voxelFace);
            const facePos = this.getFacePosition(voxel, voxelFace);
            if (!atBoundary) {
                canExtend = false;
                console.log('[FillExtrudeExtend] Voxel', voxel.getKey(), 'face', voxelFace, 'not at boundary, facePos:', facePos);
                break;
            }
        }

        if (!canExtend) {
            console.log('[FillExtrudeExtend] Cannot extend - not at boundary');
            return;
        }

        // Create new partial voxels for each face that has empty neighbor space
        const newVoxels = [];
        for (const { voxel, face: voxelFace } of this.fillExtrudeFaces) {
            const neighborPos = voxel.getNeighborPosition(voxelFace);
            const wouldCrossMirror = this.world.wouldCrossMirror(neighborPos.x, neighborPos.y, neighborPos.z);
            const isEmpty = this.world.isNeighborEmpty(voxel, voxelFace);

            if (!isEmpty || wouldCrossMirror) {
                continue;
            }

            // Create new partial voxel with the initial delta size
            const newVoxel = this.createExtendedVoxel(
                voxel,
                neighborPos.x,
                neighborPos.y,
                neighborPos.z,
                voxelFace,
                Math.min(Math.abs(delta), 1.0)
            );

            if (newVoxel && !newVoxel.isCollapsed()) {
                this.world.updateVoxelMesh(newVoxel);
                newVoxels.push({ voxel: newVoxel, face: voxelFace, sourceVoxel: voxel });
            } else if (newVoxel) {
                this.world.removeVoxel(newVoxel.x, newVoxel.y, newVoxel.z);
            }
        }

        if (newVoxels.length > 0) {
            // Save the current base faces before updating (so we can restore when collapsing back)
            if (!this.fillExtrudeBaseFaces) {
                this.fillExtrudeBaseFaces = [...this.fillExtrudeFaces];
                console.log('[FillExtrudeExtend] Saved base faces:', this.fillExtrudeBaseFaces.length);
            }

            // Check if any voxel is already at boundary (full size)
            const anyAtBoundary = newVoxels.some(({ voxel, face: voxelFace }) =>
                this.isFaceAtBoundary(voxel, voxelFace)
            );

            if (anyAtBoundary) {
                // All voxels reached full size, transition to new layer
                this.fillExtrudeFaces = newVoxels.map(({ voxel, face }) => ({ voxel, face }));
                this.fillExtrudePartialVoxels = null;
                this.fillExtrudeGrowing = false;
                // Clear base faces since we've committed to a new layer
                this.fillExtrudeBaseFaces = null;
                console.log('[FillExtrudeExtend] Transitioned to new layer, cleared base faces');

                // Update fill group selection to highlight new layer voxels
                if (this.fillExtrudeFaces.length > 1) {
                    const groupKeys = this.fillExtrudeFaces.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            } else {
                // Store partial voxels for continued growing
                this.fillExtrudePartialVoxels = newVoxels;
                this.fillExtrudeGrowing = true;
                this.fillExtrudeGrowingFromIndent = false; // These are from extension, not indent

                // Update fill group selection to highlight partial voxels
                if (newVoxels.length > 1) {
                    const groupKeys = newVoxels.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            }

            this.dragVoxel = newVoxels[0].voxel;
            this.justExtended = true;
        }

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Continue growing partial voxels created during fill extrude
     */
    growFillExtrudePartialVoxels(delta) {
        const face = this.dragFace;
        const axis = this.dragAxis;
        let allAtBoundary = true;

        console.log('[FillExtrudeGrow] Growing', this.fillExtrudePartialVoxels.length, 'voxels by', delta);

        for (const { voxel, face: voxelFace, sourceVoxel } of this.fillExtrudePartialVoxels) {
            // Move the face outward
            const result = voxel.moveFace(voxelFace, delta, axis);
            console.log('[FillExtrudeGrow] Voxel', voxel.getKey(), 'result:', result);

            if (result === 'add') {
                // Face reached boundary - this voxel is now full
                // Clamp it to boundary
                voxel.moveFace(voxelFace, -delta, axis); // Undo the overflow
                this.extendFaceToBoundary(voxel, voxelFace); // Snap to boundary
                console.log('[FillExtrudeGrow] Snapped to boundary');
            }

            this.world.updateVoxelMesh(voxel);

            const atBoundary = this.isFaceAtBoundary(voxel, voxelFace);
            if (!atBoundary) {
                allAtBoundary = false;
            }
            console.log('[FillExtrudeGrow] Voxel', voxel.getKey(), 'atBoundary:', atBoundary);
        }

        // Update fill group selection to keep partial voxels highlighted
        if (this.fillExtrudePartialVoxels.length > 1) {
            const groupKeys = this.fillExtrudePartialVoxels.map(({ voxel }) => voxel.getKey());
            this.world.setFillGroupSelection(groupKeys);
        }

        console.log('[FillExtrudeGrow] allAtBoundary:', allAtBoundary);

        if (allAtBoundary) {
            if (this.fillExtrudeGrowingFromIndent) {
                // Partial voxels were created by indent - returning to full state (same layer)
                // Just restore the base faces and exit growing mode
                if (this.fillExtrudeBaseFaces && this.fillExtrudeBaseFaces.length > 0) {
                    this.fillExtrudeFaces = [...this.fillExtrudeBaseFaces];
                    this.fillExtrudeBaseFaces = null;
                }
                this.fillExtrudePartialVoxels = null;
                this.fillExtrudeGrowing = false;
                this.fillExtrudeGrowingFromIndent = false;
                console.log('[FillExtrudeGrow] Returned to full state after indent (same layer)');

                // Update fill group selection
                if (this.fillExtrudeFaces && this.fillExtrudeFaces.length > 1) {
                    const groupKeys = this.fillExtrudeFaces.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            } else {
                // Partial voxels were created by extension - transition to new layer
                this.fillExtrudeFaces = this.fillExtrudePartialVoxels.map(({ voxel, face }) => ({ voxel, face }));
                this.fillExtrudePartialVoxels = null;
                this.fillExtrudeGrowing = false;
                // Clear base faces since we've committed to a new layer
                this.fillExtrudeBaseFaces = null;
                console.log('[FillExtrudeGrow] Transitioned to new layer, cleared base faces');

                // Update fill group selection to highlight new voxels
                if (this.fillExtrudeFaces.length > 1) {
                    const groupKeys = this.fillExtrudeFaces.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            }
        }

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Handle Fill Extrude indent (collapse) with 0.25 step support
     * Shrinks voxels incrementally and removes them when collapsed
     */
    handleFillExtrudeIndent(delta) {
        const face = this.dragFace;
        const axis = this.dragAxis;
        const oppositeFace = OPPOSITE_FACE[face];

        // If we were growing partial voxels from EXTENSION, shrink them back
        // But if partials are from INDENT, we continue indenting them (not shrinking)
        if (this.fillExtrudeGrowing && this.fillExtrudePartialVoxels && !this.fillExtrudeGrowingFromIndent) {
            console.log('[FillExtrudeIndent] Shrinking partials from extension');
            this.shrinkFillExtrudePartialVoxels(delta);
            return;
        }

        // If partials are from indent, continue indenting them
        if (this.fillExtrudeGrowing && this.fillExtrudeGrowingFromIndent) {
            console.log('[FillExtrudeIndent] Continuing indent on partials from indent');
            // Clear growing mode - we'll re-enter it if voxels are still partial after this indent
            this.fillExtrudeGrowing = false;
            this.fillExtrudeGrowingFromIndent = false;
            this.fillExtrudePartialVoxels = null;
            // Fall through to normal indent code
        }

        // If we just returned to the base layer after shrinking partials, don't indent further
        // This prevents accidentally modifying the original voxels when collapsing partial extrusion
        console.log('[FillExtrudeIndent] Indenting', this.fillExtrudeFaces.length, 'base voxels');

        // Move faces inward on all tracked voxels
        const voxelsToRemove = [];
        const nextFaces = [];
        const survivingVoxels = [];

        for (const { voxel, face: voxelFace } of this.fillExtrudeFaces) {
            const result = voxel.moveFace(voxelFace, delta, axis);

            if (result === 'remove') {
                // Voxel collapsed - mark for removal
                voxelsToRemove.push(voxel);

                // Find the voxel behind this one to continue collapsing
                const behindPos = voxel.getNeighborPosition(oppositeFace);
                const behindKey = VoxelWorld.getKey(behindPos.x, behindPos.y, behindPos.z);
                const behindVoxel = this.world.voxels.get(behindKey);

                if (behindVoxel) {
                    const atBoundary = this.isFaceAtBoundary(behindVoxel, voxelFace);
                    const isBeveled = this.isFaceBeveled(behindVoxel, voxelFace);

                    if (atBoundary && !isBeveled) {
                        nextFaces.push({ voxel: behindVoxel, face: voxelFace });
                    }
                }
            } else {
                // Voxel still exists, update its mesh
                this.world.updateVoxelMesh(voxel);
                survivingVoxels.push({ voxel, face: voxelFace });
            }
        }

        // Remove collapsed voxels
        for (const voxel of voxelsToRemove) {
            this.world.removeVoxel(voxel.x, voxel.y, voxel.z);
        }

        // If any voxels were removed, check if we need to update the tracked faces
        if (voxelsToRemove.length > 0) {
            // Filter out removed voxels from fillExtrudeFaces
            this.fillExtrudeFaces = this.fillExtrudeFaces.filter(
                ({ voxel }) => !voxelsToRemove.includes(voxel)
            );

            // Add the next layer faces
            for (const nextFace of nextFaces) {
                // Check if this face is already tracked
                const alreadyTracked = this.fillExtrudeFaces.some(
                    ({ voxel }) => voxel === nextFace.voxel
                );
                if (!alreadyTracked) {
                    this.fillExtrudeFaces.push(nextFace);
                }
            }

            if (this.fillExtrudeFaces.length > 0) {
                this.dragVoxel = this.fillExtrudeFaces[0].voxel;

                // Update fill group selection for the new layer
                if (this.fillExtrudeFaces.length > 1) {
                    const groupKeys = this.fillExtrudeFaces.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            }
        }

        // Check if surviving voxels now have faces NOT at boundary (they became partial)
        // If so, enter "growing" mode so extending can grow them back
        if (survivingVoxels.length > 0) {
            const anyNotAtBoundary = survivingVoxels.some(
                ({ voxel, face: voxelFace }) => !this.isFaceAtBoundary(voxel, voxelFace)
            );
            if (anyNotAtBoundary) {
                // Save the base faces before entering growing mode (so we can restore when shrinking back)
                if (!this.fillExtrudeBaseFaces) {
                    this.fillExtrudeBaseFaces = [...this.fillExtrudeFaces];
                    console.log('[FillExtrudeIndent] Saved base faces:', this.fillExtrudeBaseFaces.length);
                }

                // Convert to partial voxel tracking
                this.fillExtrudePartialVoxels = survivingVoxels.map(({ voxel, face }) => ({
                    voxel,
                    face,
                    sourceVoxel: voxel
                }));
                this.fillExtrudeGrowing = true;
                this.fillExtrudeGrowingFromIndent = true; // Mark that these partials came from indent
                console.log('[FillExtrudeIndent] Voxels became partial, entering growing mode (from indent)');

                // Update fill group selection to highlight surviving voxels
                if (survivingVoxels.length > 1) {
                    const groupKeys = survivingVoxels.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            }
        }

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Shrink partial voxels that were being grown (when user drags back)
     */
    shrinkFillExtrudePartialVoxels(delta) {
        const face = this.dragFace;
        const axis = this.dragAxis;
        const voxelsToRemove = [];

        for (const partialInfo of this.fillExtrudePartialVoxels) {
            const { voxel, face: voxelFace, sourceVoxel } = partialInfo;
            const result = voxel.moveFace(voxelFace, delta, axis);

            if (result === 'remove' || voxel.isCollapsed()) {
                // Partial voxel collapsed - remove it
                voxelsToRemove.push(partialInfo);
                this.world.removeVoxel(voxel.x, voxel.y, voxel.z);
            } else {
                this.world.updateVoxelMesh(voxel);
            }
        }

        // Remove collapsed partial voxels from tracking
        if (voxelsToRemove.length > 0) {
            this.fillExtrudePartialVoxels = this.fillExtrudePartialVoxels.filter(
                info => !voxelsToRemove.includes(info)
            );

            // Update fill group selection for remaining partial voxels
            if (this.fillExtrudePartialVoxels.length > 1) {
                const groupKeys = this.fillExtrudePartialVoxels.map(({ voxel }) => voxel.getKey());
                this.world.setFillGroupSelection(groupKeys);
            }
        }

        // If all partial voxels are gone, we're back to the original layer
        if (this.fillExtrudePartialVoxels.length === 0) {
            this.fillExtrudePartialVoxels = null;
            this.fillExtrudeGrowing = false;

            // Restore the original base faces so extending can work again
            if (this.fillExtrudeBaseFaces && this.fillExtrudeBaseFaces.length > 0) {
                this.fillExtrudeFaces = [...this.fillExtrudeBaseFaces];
                this.fillExtrudeBaseFaces = null;
                console.log('[FillExtrudeShrink] Restored base faces:', this.fillExtrudeFaces.length,
                    'keys:', this.fillExtrudeFaces.map(({voxel, face}) => voxel.getKey() + ':' + face));

                // Update fill group selection to highlight restored base voxels
                if (this.fillExtrudeFaces.length > 1) {
                    const groupKeys = this.fillExtrudeFaces.map(({ voxel }) => voxel.getKey());
                    this.world.setFillGroupSelection(groupKeys);
                }
            }

            console.log('[FillExtrudeShrink] Returned to base layer');
            if (this.fillExtrudeFaces.length > 0) {
                this.dragVoxel = this.fillExtrudeFaces[0].voxel;
            }
        }

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Handle extending face into neighbor space
     * Creates full voxels for any complete units, then a partial voxel for remainder
     * New voxels inherit the shape of the source voxel (perpendicular faces stay the same)
     */
    handleFaceExtension(delta) {
        let currentVoxel = this.dragVoxel;
        const face = this.dragFace;
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        // Store the original voxel to copy shape from
        const sourceVoxel = this.dragVoxel;

        let remainingExtension = Math.abs(delta);

        // Keep creating voxels until we've used up all the extension
        while (remainingExtension > 0.001) {
            // Check if neighbor space is empty
            const neighborPos = currentVoxel.getNeighborPosition(face);
            const neighborEmpty = this.world.isNeighborEmpty(currentVoxel, face);

            if (!neighborEmpty) {
                break;
            }

            // Check if this would cross the mirror boundary
            if (this.world.wouldCrossMirror(neighborPos.x, neighborPos.y, neighborPos.z)) {
                break;
            }

            // Create the new voxel by copying shape from source
            // This properly handles beveled faces by starting with the source's shape
            const newVoxel = this.createExtendedVoxel(
                sourceVoxel,
                neighborPos.x,
                neighborPos.y,
                neighborPos.z,
                face,
                Math.min(remainingExtension, 1.0)
            );

            if (!newVoxel) {
                break;
            }

            remainingExtension -= Math.min(remainingExtension, 1.0);

            // Check if the new voxel has volume
            if (newVoxel.isCollapsed()) {
                this.world.removeVoxel(newVoxel.x, newVoxel.y, newVoxel.z);
                break;
            }

            this.world.updateVoxelMesh(newVoxel);

            // Move to this voxel for next iteration
            currentVoxel = newVoxel;
        }

        // Switch drag to the final voxel (only if we created one)
        if (currentVoxel !== sourceVoxel) {
            this.dragVoxel = currentVoxel;
            this.dragFace = face;
            this.dragAxis = FACE_AXIS[face];

            // Mark as just extended to prevent immediate collapse on mouse jitter
            this.justExtended = true;

            // Update selection
            this.world.setSelection(currentVoxel.getKey(), face, Edge.None);
        }
    }

    /**
     * Handle indenting through voxels
     * When a voxel is fully indented (collapsed), continue indenting into the next voxel behind it
     *
     * @param {number} face - The face being indented
     * @param {number} remainingIndent - How much more to indent (positive value)
     */
    handleFaceIndentation(face, remainingIndent) {
        const axis = FACE_AXIS[face];
        const oppositeFace = OPPOSITE_FACE[face];

        // The next voxel to indent is in the OPPOSITE direction from the face
        // e.g., if indenting Front face (which points -Z), next voxel is at +Z (Back direction)
        const nextVoxelPos = {
            x: this.dragVoxel ? this.dragVoxel.x : 0,
            y: this.dragVoxel ? this.dragVoxel.y : 0,
            z: this.dragVoxel ? this.dragVoxel.z : 0
        };

        // Move in the opposite direction of the face normal
        // oppositeFace's axis points toward where we want to go
        const oppositeAxis = FACE_AXIS[oppositeFace];
        nextVoxelPos.x += oppositeAxis[0];
        nextVoxelPos.y += oppositeAxis[1];
        nextVoxelPos.z += oppositeAxis[2];

        const nextKey = VoxelWorld.getKey(nextVoxelPos.x, nextVoxelPos.y, nextVoxelPos.z);
        const nextVoxel = this.world.voxels.get(nextKey);

        if (!nextVoxel) {
            // No more voxels to indent into - stop dragging
            this.isDragging = false;
            this.dragVoxel = null;
            this.world.clearSelection();
            return;
        }

        // Switch drag to this voxel and continue indenting the SAME face
        this.dragVoxel = nextVoxel;
        this.dragFace = face;
        this.dragAxis = axis;
        this.world.setSelection(nextKey, face, Edge.None);

        // Don't apply any indent now - the continued mouse drag will naturally
        // apply the next step. This prevents the "jump" of applying an extra step.
    }

    /**
     * Create an extended voxel that properly inherits shape from source
     * This handles beveled faces correctly by building the new voxel's corners
     * based on the source's extending face shape
     */
    createExtendedVoxel(sourceVoxel, x, y, z, extensionFace, extensionAmount) {
        const key = VoxelWorld.getKey(x, y, z);

        if (this.world.voxels.has(key)) {
            return this.world.voxels.get(key);
        }

        const axis = FACE_AXIS[extensionFace];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const touchingFace = OPPOSITE_FACE[extensionFace];

        // Get the source's extending face corners - this is the shape we need to match
        const sourceFaceCorners = FACE_CORNERS[extensionFace];
        const touchingFaceCorners = FACE_CORNERS[touchingFace];

        // Create new voxel with identity corners
        const newVoxel = new Voxel(x, y, z);

        // Build corner mapping from new voxel's touching face to source's extending face
        const cornerMapping = this.buildCornerMapping(extensionFace, touchingFace);

        // Step 1: Set the touching face corners to match the source's extending face
        // These corners start at the boundary between the two voxels
        const boundaryValue = -axis[axisIndex] * 0.5; // Opposite to extension direction

        for (const touchingCornerIdx of touchingFaceCorners) {
            const sourceCornerIdx = cornerMapping[touchingCornerIdx];
            if (sourceCornerIdx !== undefined) {
                // Copy perpendicular positions from source
                for (let a = 0; a < 3; a++) {
                    if (a === axisIndex) {
                        // On the extension axis, touching face starts at boundary
                        newVoxel.corners[touchingCornerIdx][a] = boundaryValue;
                    } else {
                        // Copy perpendicular position from source's extending face
                        newVoxel.corners[touchingCornerIdx][a] = sourceVoxel.corners[sourceCornerIdx][a];
                    }
                }
            }
        }

        // Step 2: Set the extending face corners
        // These start at boundary and extend outward by extensionAmount
        const extendedValue = boundaryValue + axis[axisIndex] * extensionAmount;
        const clampedExtendedValue = Math.max(-0.5, Math.min(0.5, extendedValue));

        for (const extCornerIdx of sourceFaceCorners) {
            // Copy perpendicular positions from source (same shape)
            for (let a = 0; a < 3; a++) {
                if (a === axisIndex) {
                    // On extension axis, extend outward
                    newVoxel.corners[extCornerIdx][a] = clampedExtendedValue;
                } else {
                    // Copy perpendicular position from source
                    newVoxel.corners[extCornerIdx][a] = sourceVoxel.corners[extCornerIdx][a];
                }
            }
        }

        newVoxel.updateFlags();

        // Add to world
        this.world.voxels.set(key, newVoxel);

        return newVoxel;
    }

    /**
     * Copy shape from source voxel to new voxel when extending
     *
     * For each perpendicular axis, check if the source has a FACE indentation (all 4 corners same)
     * or an EDGE bevel (only 2 corners different).
     * - Face indentation: copy to all new voxel corners
     * - Edge bevel: only copy to touching face corners
     */
    copyPerpendicularShape(sourceVoxel, newVoxel, extensionFace) {
        const extAxis = FACE_AXIS[extensionFace];
        const extAxisIndex = extAxis[0] !== 0 ? 0 : (extAxis[1] !== 0 ? 1 : 2);

        // The opposite face on the new voxel (where it touches the source)
        const touchingFace = OPPOSITE_FACE[extensionFace];
        const touchingFaceCorners = FACE_CORNERS[touchingFace];

        // Build a mapping from new voxel's touching face corners to source's extending face corners
        const cornerMapping = this.buildCornerMapping(extensionFace, touchingFace);

        // For each axis that is NOT the extension axis
        for (let a = 0; a < 3; a++) {
            if (a === extAxisIndex) continue;

            // Find the two faces perpendicular to this axis
            // Axis 0 (X): Left (-X) and Right (+X) faces
            // Axis 1 (Y): Bottom (-Y) and Top (+Y) faces
            // Axis 2 (Z): Front (-Z) and Back (+Z) faces
            const negativeFace = a === 0 ? Face.Left : (a === 1 ? Face.Bottom : Face.Front);
            const positiveFace = a === 0 ? Face.Right : (a === 1 ? Face.Top : Face.Back);

            const negFaceCorners = FACE_CORNERS[negativeFace];
            const posFaceCorners = FACE_CORNERS[positiveFace];

            // Check if the NEGATIVE face is uniformly positioned (face indentation vs edge bevel)
            const negPositions = negFaceCorners.map(ci => sourceVoxel.corners[ci][a]);
            const negIsUniform = negPositions.every(p => Math.abs(p - negPositions[0]) < 0.001);

            // Check if the POSITIVE face is uniformly positioned
            const posPositions = posFaceCorners.map(ci => sourceVoxel.corners[ci][a]);
            const posIsUniform = posPositions.every(p => Math.abs(p - posPositions[0]) < 0.001);

            // Apply to new voxel based on whether each face is uniform or beveled
            if (negIsUniform && posIsUniform) {
                // Both faces are uniform - this is a face indentation, copy to all corners
                for (const ci of negFaceCorners) {
                    newVoxel.corners[ci][a] = negPositions[0];
                }
                for (const ci of posFaceCorners) {
                    newVoxel.corners[ci][a] = posPositions[0];
                }
            } else {
                // At least one face has a bevel
                // Copy touching face corners from source's extending face (via mapping)
                // Copy extending face corners from source's extending face directly (same shape)
                const extFaceCorners = FACE_CORNERS[extensionFace];

                // Copy exact positions to touching face corners (via mapping)
                for (const ci of touchingFaceCorners) {
                    const sourceCornerIdx = cornerMapping[ci];
                    if (sourceCornerIdx !== undefined) {
                        newVoxel.corners[ci][a] = sourceVoxel.corners[sourceCornerIdx][a];
                    }
                }

                // Copy extending face corners directly from source (same indices, same shape)
                for (const ci of extFaceCorners) {
                    newVoxel.corners[ci][a] = sourceVoxel.corners[ci][a];
                }
            }
        }
    }

    /**
     * Build a mapping from new voxel's touching face corners to source voxel's extension face corners
     * Corners are matched by their perpendicular position (ignoring the extension axis)
     */
    buildCornerMapping(extensionFace, touchingFace) {
        const extAxis = FACE_AXIS[extensionFace];
        const extAxisIndex = extAxis[0] !== 0 ? 0 : (extAxis[1] !== 0 ? 1 : 2);

        const sourceFaceCorners = FACE_CORNERS[extensionFace];
        const touchingFaceCorners = FACE_CORNERS[touchingFace];

        // Map from new voxel corner index to source voxel corner index
        const mapping = {};

        // Get identity positions to match corners by their perpendicular coordinates
        const IDENTITY_CORNERS = [
            [-0.5, 0.5, -0.5],   // 0: TopLeftFront
            [0.5, 0.5, -0.5],    // 1: TopRightFront
            [0.5, 0.5, 0.5],     // 2: TopRightBack
            [-0.5, 0.5, 0.5],    // 3: TopLeftBack
            [-0.5, -0.5, 0.5],   // 4: BottomLeftBack
            [0.5, -0.5, 0.5],    // 5: BottomRightBack
            [0.5, -0.5, -0.5],   // 6: BottomRightFront
            [-0.5, -0.5, -0.5]   // 7: BottomLeftFront
        ];

        for (const newCornerIdx of touchingFaceCorners) {
            const newCornerPos = IDENTITY_CORNERS[newCornerIdx];

            // Find matching source corner (same perpendicular position)
            for (const srcCornerIdx of sourceFaceCorners) {
                const srcCornerPos = IDENTITY_CORNERS[srcCornerIdx];

                // Check if perpendicular coordinates match
                let match = true;
                for (let a = 0; a < 3; a++) {
                    if (a === extAxisIndex) continue;
                    if (Math.abs(newCornerPos[a] - srcCornerPos[a]) > 0.001) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    mapping[newCornerIdx] = srcCornerIdx;
                    break;
                }
            }
        }

        return mapping;
    }

    /**
     * Handle edge drag
     */
    handleEdgeDrag(delta) {
        const voxel = this.dragVoxel;
        const face = this.dragFace;
        const edge = this.dragEdge;
        const axis = this.dragAxis;

        const result = voxel.moveEdge(face, edge, delta, axis);

        if (result === 'addEdge') {
            // Edge went out of bounds - extend to neighbor
            this.world.updateVoxelMesh(voxel);
            this.handleEdgeExtension(delta);
        } else {
            this.world.updateVoxelMesh(voxel);
        }
    }

    /**
     * Handle extending an edge into neighbor space
     */
    handleEdgeExtension(delta) {
        const voxel = this.dragVoxel;
        const face = this.dragFace;
        const edge = this.dragEdge;

        // Check if neighbor space is empty
        if (!this.world.isNeighborEmpty(voxel, face)) {
            return; // Blocked by neighbor
        }

        // Create new voxel at neighbor position
        const neighborPos = voxel.getNeighborPosition(face);
        const newVoxel = this.world.addCollapsedVoxel(
            neighborPos.x,
            neighborPos.y,
            neighborPos.z,
            face
        );

        // Copy perpendicular shape (face indentations only, not edge bevels)
        this.copyPerpendicularShape(voxel, newVoxel, face);

        // The new voxel starts collapsed - all corners on the touching face plane
        // We only want to extend the EDGE corners, not the whole face
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        // Get the edge corners on the extending face
        const faceCornerIndices = FACE_CORNERS[face];
        const edgeLocalIndices = FACE_EDGE_CORNERS[edge]; // [0,1], [2,3], [3,0], or [1,2]

        // Only extend the two corners that form this edge
        const extensionAmount = Math.abs(delta);
        for (const localIdx of edgeLocalIndices) {
            const cornerIdx = faceCornerIndices[localIdx];
            newVoxel.corners[cornerIdx][axisIndex] += axis[axisIndex] * extensionAmount;
            newVoxel.corners[cornerIdx][axisIndex] = Math.max(-0.5,
                Math.min(0.5, newVoxel.corners[cornerIdx][axisIndex]));
        }

        newVoxel.updateFlags();
        this.world.updateVoxelMesh(newVoxel);

        // Switch to dragging the new voxel's same edge on the same face
        this.dragVoxel = newVoxel;
        this.dragFace = face;
        this.dragEdge = edge;
        this.justExtended = true;

        this.world.setSelection(newVoxel.getKey(), face, edge);
    }

    /**
     * Get the corresponding edge on the opposite face when extending
     */
    getCorrespondingEdge(fromFace, edge) {
        // When extending, the edge on the new voxel's opposite face
        // corresponds to the same edge direction
        // Edge.Front (1), Edge.Back (2), Edge.Left (3), Edge.Right (4)

        // For Top/Bottom faces extending to each other:
        // Front edge on Top -> Front edge on Bottom (same)
        // For Front/Back faces:
        // Left edge on Front -> Left edge on Back (same)
        // etc.

        // The edge directions are relative to each face, so when extending
        // from one face to its opposite, the edge mapping is:
        // Front <-> Back, Left <-> Right

        switch (edge) {
            case Edge.Front: return Edge.Back;
            case Edge.Back: return Edge.Front;
            case Edge.Left: return Edge.Right;
            case Edge.Right: return Edge.Left;
            default: return edge;
        }
    }

    /**
     * Handle hover - update cursor and indicator
     */
    handleHover() {
        const voxelHit = this.raycast();
        const gridHit = this.raycastGrid();

        // Determine which is closer to the camera
        let useGrid = false;

        if (gridHit) {
            const key = VoxelWorld.getKey(gridHit.x, gridHit.y, gridHit.z);
            const gridIsEmpty = !this.world.voxels.has(key);

            if (gridIsEmpty) {
                if (!voxelHit) {
                    // No voxel hit, use grid
                    useGrid = true;
                } else {
                    // Both hit - compare distances to camera
                    const camPos = this.camera.position;
                    const gridDist = camPos.distanceTo(gridHit.point);
                    const voxelDist = camPos.distanceTo(voxelHit.point);

                    // Use grid if it's closer (with small tolerance)
                    if (gridDist < voxelDist - 0.01) {
                        useGrid = true;
                    }
                }
            }
        }

        if (useGrid) {
            // Hovering over empty grid cell
            this.domElement.style.cursor = 'pointer';
            this.hideIndicator();
            this.hoveredGridCell = gridHit;
            this.updateGridIndicator(gridHit);
        } else if (voxelHit) {
            // Hovering over voxel
            this.domElement.style.cursor = 'pointer';
            this.updateHoverIndicator(voxelHit);
            this.hideGridIndicator();
            this.hoveredGridCell = null;
        } else {
            // Hovering over nothing
            this.domElement.style.cursor = 'default';
            this.hideIndicator();
            this.hideGridIndicator();
            this.hoveredGridCell = null;
        }
    }

    /**
     * Update the grid placement indicator (separate from voxel hover indicator)
     */
    updateGridIndicator(gridHit) {
        if (!this.gridIndicator) {
            this.createGridIndicator();
        }

        // Position at grid cell (on the visual grid at Y=-0.5, slightly above to avoid z-fighting)
        this.gridIndicator.position.set(gridHit.x, -0.48, gridHit.z);
        this.gridIndicator.visible = true;
    }

    /**
     * Hide the grid indicator
     */
    hideGridIndicator() {
        if (this.gridIndicator) {
            this.gridIndicator.visible = false;
        }
    }

    /**
     * Create a simple grid indicator (square on the ground)
     */
    createGridIndicator() {
        const geometry = new THREE.PlaneGeometry(0.9, 0.9);
        const material = new THREE.MeshBasicMaterial({
            color: 0x4ecdc4,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.gridIndicator = new THREE.Mesh(geometry, material);
        this.gridIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
        this.gridIndicator.renderOrder = 999;
        this.gridIndicator.visible = false;
        this.world.scene.add(this.gridIndicator);
    }

    /**
     * Handle mouse up - end drag or click actions
     */
    onMouseUp(event) {
        if (event.button !== 0) return;

        // Check for click actions: if we didn't drag
        if (this.isDragging && this.dragVoxel && Math.abs(this.lastDragDelta) < 0.001) {
            // No drag occurred - this was a click
            // If the face is beveled, clicking anywhere on it (corner, edge, or face) unfolds it
            if (this.isFaceBeveled(this.dragVoxel, this.dragFace)) {
                // Face has beveled corners - unfold the entire face
                this.extendFaceToBoundary(this.dragVoxel, this.dragFace);
            } else if (this.dragCorner !== undefined && this.dragCorner !== -1) {
                // Corner click on non-beveled face - no action for now
            } else if (this.dragEdge !== Edge.None) {
                // Edge click on non-beveled face - no action for now
            } else {
                // Face click on non-beveled face
                if (this.isFaceAtBoundary(this.dragVoxel, this.dragFace)) {
                    // Face is at boundary - check if we can extrude to neighbor
                    const neighborPos = this.dragVoxel.getNeighborPosition(this.dragFace);
                    const wouldCrossMirror = this.world.wouldCrossMirror(neighborPos.x, neighborPos.y, neighborPos.z);

                    if (this.world.isNeighborEmpty(this.dragVoxel, this.dragFace) && !wouldCrossMirror) {
                        // Use fill extrude if enabled, otherwise single extrude
                        if (this.fillExtrudeEnabled) {
                            this.fillExtrude(this.dragVoxel, this.dragFace);
                        } else {
                            this.createClickExtrudedVoxel(this.dragVoxel, this.dragFace);
                        }
                    }
                } else {
                    // Face is NOT at boundary (indented) - push it to boundary
                    this.extendFaceToBoundary(this.dragVoxel, this.dragFace);
                }
            }
        }

        this.isDragging = false;
        this.dragVoxel = null;
        this.dragFace = null;
        this.dragEdge = Edge.None;
        this.dragCorner = -1;
        this.justExtended = false;
        this.fillExtrudeFaces = null;
        this.fillExtrudeBaseFaces = null;
        this.fillExtrudePartialVoxels = null;
        this.fillExtrudeGrowing = false;
        this.fillExtrudeGrowingFromIndent = false;
        this.fillExtrudeAccumulator = 0;

        // Clear fill group selection
        this.world.clearFillGroupSelection();
    }

    /**
     * Check if a corner of a face is beveled (indented inward from boundary)
     */
    isCornerBeveled(voxel, face, cornerLocalIndex) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const boundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const faceCornerIndices = FACE_CORNERS[face];
        const corner = voxel.corners[faceCornerIndices[cornerLocalIndex]];

        // Check if corner is NOT at boundary (beveled inward)
        return Math.abs(corner[axisIndex] - boundary) > 0.001;
    }

    /**
     * Unfold a beveled corner by moving it back to the face boundary
     */
    unfoldCorner(voxel, face, cornerLocalIndex) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const boundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const faceCornerIndices = FACE_CORNERS[face];
        const cornerIdx = faceCornerIndices[cornerLocalIndex];

        voxel.corners[cornerIdx][axisIndex] = boundary;

        voxel.updateFlags();
        this.world.updateVoxelMesh(voxel);

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Check if a face has any beveled corners (any corner not at boundary)
     */
    isFaceBeveled(voxel, face) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        const faceCornerIndices = FACE_CORNERS[face];

        // A face is "beveled" if its corners are at DIFFERENT positions along the axis
        // (i.e., not all corners are coplanar on this face)
        // A uniform partial face (all corners at same non-boundary position) is NOT beveled
        const firstCorner = voxel.corners[faceCornerIndices[0]];
        const firstPos = firstCorner[axisIndex];

        for (let i = 1; i < faceCornerIndices.length; i++) {
            const corner = voxel.corners[faceCornerIndices[i]];
            if (Math.abs(corner[axisIndex] - firstPos) > 0.001) {
                return true; // Corners are at different positions - face is beveled
            }
        }
        return false; // All corners at same position - face is flat (not beveled)
    }

    /**
     * Check if an edge of a face is beveled (indented while other parts of face are at boundary)
     * An edge is beveled if its 2 corners are NOT at the face boundary
     */
    isEdgeBeveled(voxel, face, edge) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const boundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const faceCornerIndices = FACE_CORNERS[face];
        const edgeLocalIndices = FACE_EDGE_CORNERS[edge];

        // Get the two edge corners
        const corner0 = voxel.corners[faceCornerIndices[edgeLocalIndices[0]]];
        const corner1 = voxel.corners[faceCornerIndices[edgeLocalIndices[1]]];

        // Check if both corners are NOT at boundary (beveled inward)
        const corner0Indented = Math.abs(corner0[axisIndex] - boundary) > 0.001;
        const corner1Indented = Math.abs(corner1[axisIndex] - boundary) > 0.001;

        return corner0Indented || corner1Indented;
    }

    /**
     * Unfold a beveled edge by moving its corners back to the face boundary
     * This is the reverse of edge beveling
     */
    unfoldEdge(voxel, face, edge) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const boundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const faceCornerIndices = FACE_CORNERS[face];
        const edgeLocalIndices = FACE_EDGE_CORNERS[edge];

        // Move both edge corners to the boundary
        const cornerIdx0 = faceCornerIndices[edgeLocalIndices[0]];
        const cornerIdx1 = faceCornerIndices[edgeLocalIndices[1]];

        voxel.corners[cornerIdx0][axisIndex] = boundary;
        voxel.corners[cornerIdx1][axisIndex] = boundary;

        voxel.updateFlags();
        this.world.updateVoxelMesh(voxel);

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Extend an indented/beveled face to the voxel boundary
     * This pushes ALL face corners outward to the boundary
     */
    extendFaceToBoundary(voxel, face) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const boundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const faceCornerIndices = FACE_CORNERS[face];

        // Check if any corner needs to move
        let needsUpdate = false;
        for (const cornerIdx of faceCornerIndices) {
            if (Math.abs(voxel.corners[cornerIdx][axisIndex] - boundary) > 0.001) {
                needsUpdate = true;
                break;
            }
        }

        if (!needsUpdate) {
            return;
        }

        // Move all face corners to the boundary
        for (const cornerIdx of faceCornerIndices) {
            voxel.corners[cornerIdx][axisIndex] = boundary;
        }

        voxel.updateFlags();
        this.world.updateVoxelMesh(voxel);

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }
    }

    /**
     * Check if a face is flat and at the voxel boundary (not indented)
     */
    isFaceAtBoundary(voxel, face) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const expectedBoundary = axis[axisIndex] * 0.5; // +0.5 or -0.5

        const faceVertices = voxel.getFaceVertices(face);

        // Check if ALL corners are at the boundary (flat face, not beveled or indented)
        for (const v of faceVertices) {
            if (Math.abs(v[axisIndex] - expectedBoundary) > 0.001) {
                return false; // Not at boundary
            }
        }
        return true;
    }

    /**
     * Create a new full voxel adjacent to the clicked face (click-to-extrude)
     * Uses createExtendedVoxel to properly inherit shape from neighboring voxels
     */
    createClickExtrudedVoxel(sourceVoxel, face) {
        const neighborPos = sourceVoxel.getNeighborPosition(face);

        // Use the same createExtendedVoxel method that drag-extrude uses
        // This ensures proper shape inheritance from the source voxel
        const newVoxel = this.createExtendedVoxel(
            sourceVoxel,
            neighborPos.x,
            neighborPos.y,
            neighborPos.z,
            face,
            1.0  // Full voxel extension
        );

        if (!newVoxel) {
            return;
        }

        // Check if the new voxel is valid
        if (newVoxel.isCollapsed()) {
            this.world.removeVoxel(newVoxel.x, newVoxel.y, newVoxel.z);
            return;
        }

        this.world.updateVoxelMesh(newVoxel);

        // Select the new voxel's opposite face (the face pointing back toward the source)
        const oppositeFace = OPPOSITE_FACE[face];
        const key = VoxelWorld.getKey(neighborPos.x, neighborPos.y, neighborPos.z);
        this.world.setSelection(key, oppositeFace, Edge.None);
    }

    /**
     * Fill Extrude - extrude all connected coplanar faces together
     * Only works on unbeveled faces at boundary
     */
    fillExtrude(startVoxel, face) {
        // Find all connected coplanar faces
        const connectedFaces = this.findConnectedCoplanarFaces(startVoxel, face);

        if (connectedFaces.length === 0) {
            return;
        }

        // Extrude each face
        let lastNewVoxel = null;
        for (const { voxel, face: voxelFace } of connectedFaces) {
            const neighborPos = voxel.getNeighborPosition(voxelFace);

            // Check if neighbor space is empty and won't cross mirror
            const wouldCrossMirror = this.world.wouldCrossMirror(neighborPos.x, neighborPos.y, neighborPos.z);
            if (!this.world.isNeighborEmpty(voxel, voxelFace) || wouldCrossMirror) {
                continue;
            }

            // Create new voxel
            const newVoxel = this.createExtendedVoxel(
                voxel,
                neighborPos.x,
                neighborPos.y,
                neighborPos.z,
                voxelFace,
                1.0
            );

            if (newVoxel && !newVoxel.isCollapsed()) {
                this.world.updateVoxelMesh(newVoxel);
                lastNewVoxel = newVoxel;
            } else if (newVoxel) {
                this.world.removeVoxel(newVoxel.x, newVoxel.y, newVoxel.z);
            }
        }

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }

        // Select the last created voxel
        if (lastNewVoxel) {
            const oppositeFace = OPPOSITE_FACE[face];
            const key = lastNewVoxel.getKey();
            this.world.setSelection(key, oppositeFace, Edge.None);
        }
    }

    /**
     * Find all connected coplanar faces starting from a given voxel face
     * Uses flood-fill to find neighbors that share the same plane
     */
    findConnectedCoplanarFaces(startVoxel, face) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);

        // Get the actual face position of the start voxel (may not be at boundary for partial voxels)
        const startFacePos = this.getFacePosition(startVoxel, face);

        const result = [];
        const visited = new Set();
        const queue = [{ voxel: startVoxel, face }];

        while (queue.length > 0) {
            const current = queue.shift();
            const key = current.voxel.getKey() + ':' + current.face;

            if (visited.has(key)) {
                continue;
            }
            visited.add(key);

            // Check if this face is not beveled (all corners at same position on this axis)
            if (this.isFaceBeveled(current.voxel, current.face)) {
                continue;
            }

            // Get the actual face position (works for partial voxels too)
            const currentFacePos = this.getFacePosition(current.voxel, current.face);

            // Check if face is coplanar (same actual face position)
            if (Math.abs(currentFacePos - startFacePos) > 0.001) {
                continue;
            }

            result.push(current);

            // Find neighboring voxels that share an edge with this face
            // The 4 neighbors are in the perpendicular directions
            const neighbors = this.getFaceNeighborVoxels(current.voxel, current.face);

            for (const neighbor of neighbors) {
                if (neighbor && !visited.has(neighbor.getKey() + ':' + face)) {
                    queue.push({ voxel: neighbor, face });
                }
            }
        }

        return result;
    }

    /**
     * Get the actual position of a face (accounting for partial voxels)
     * Returns the position along the face's axis
     */
    getFacePosition(voxel, face) {
        const axis = FACE_AXIS[face];
        const axisIndex = axis[0] !== 0 ? 0 : (axis[1] !== 0 ? 1 : 2);
        const faceVertices = voxel.getFaceVertices(face);

        // For non-beveled faces, all corners should be at the same position
        // Use the first vertex's position on the axis
        return faceVertices[0][axisIndex];
    }

    /**
     * Get the 4 neighboring voxels that share an edge with the given face
     * (neighbors in the perpendicular plane)
     */
    getFaceNeighborVoxels(voxel, face) {
        const neighbors = [];
        const axis = FACE_AXIS[face];

        // Find the two perpendicular axes
        const perpAxes = [];
        if (axis[0] === 0) perpAxes.push([1, 0, 0], [-1, 0, 0]);
        else perpAxes.push([0, 1, 0], [0, -1, 0]);

        if (axis[1] === 0) {
            if (!perpAxes.some(a => a[1] !== 0)) {
                perpAxes.push([0, 1, 0], [0, -1, 0]);
            }
        }
        if (axis[2] === 0) {
            if (!perpAxes.some(a => a[2] !== 0)) {
                perpAxes.push([0, 0, 1], [0, 0, -1]);
            }
        }

        // Get 4 perpendicular directions
        const directions = [];
        if (axis[0] !== 0) {
            // Face is on X axis, neighbors are in Y and Z
            directions.push([0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]);
        } else if (axis[1] !== 0) {
            // Face is on Y axis, neighbors are in X and Z
            directions.push([1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]);
        } else {
            // Face is on Z axis, neighbors are in X and Y
            directions.push([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]);
        }

        for (const dir of directions) {
            const nx = voxel.x + dir[0];
            const ny = voxel.y + dir[1];
            const nz = voxel.z + dir[2];
            const key = VoxelWorld.getKey(nx, ny, nz);
            const neighbor = this.world.voxels.get(key);
            if (neighbor) {
                neighbors.push(neighbor);
            }
        }

        return neighbors;
    }

    /**
     * Toggle fill extrude mode
     */
    setFillExtrudeEnabled(enabled) {
        this.fillExtrudeEnabled = enabled;
    }

    /**
     * Create materials for hover indicators
     */
    createIndicatorMaterials() {
        // Face indicator - green/yellow tint like in the reference
        this.faceIndicatorMaterial = new THREE.MeshBasicMaterial({
            color: 0x9acd32, // Yellow-green
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
        });

        // Edge indicator - slightly different tint
        this.edgeIndicatorMaterial = new THREE.MeshBasicMaterial({
            color: 0x7cb342, // Darker green
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
        });

        // Corner indicator
        this.cornerIndicatorMaterial = new THREE.MeshBasicMaterial({
            color: 0x8bc34a, // Light green
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
        });

        // Selection indicator - bright cyan for Shift+click selected faces
        this.selectionMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff, // Bright cyan
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
        });

        // Rejection indicator - red flash for invalid selections (e.g., mixed axes)
        this.rejectionMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3333, // Bright red
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
        });
    }

    /**
     * Create or update the hover indicator based on what's being hovered
     */
    updateHoverIndicator(hit) {
        if (!hit) {
            this.indicatorTargetOpacity = 0;
            this.hoveredVoxelKey = null;
            this.hoveredFace = null;
            return;
        }

        const voxel = hit.voxel;
        const face = hit.face;
        const edge = hit.edge;
        const corner = hit.corner;

        // Track hover target for keyboard actions (like 'F' to flip diagonal)
        this.hoveredVoxelKey = hit.voxelKey;
        this.hoveredFace = face;

        // Determine indicator type and get vertices
        let material, type;
        let isMultiFace = false;

        if (corner !== undefined && corner !== -1) {
            // Corner indicator
            material = this.cornerIndicatorMaterial;
            type = 'corner';
        } else if (edge !== Edge.None) {
            // Edge indicator
            material = this.edgeIndicatorMaterial;
            type = 'edge';
        } else {
            // Face indicator
            material = this.faceIndicatorMaterial;
            type = 'face';

            // Check if Fill Extrude should show multiple faces
            if (this.fillExtrudeEnabled &&
                this.isFaceAtBoundary(voxel, face) &&
                !this.isFaceBeveled(voxel, face)) {
                isMultiFace = true;
                type = 'fillFace';
            }
        }

        // Remove old indicator if type changed
        if (this.hoverIndicator && this.hoverType !== type) {
            this.world.scene.remove(this.hoverIndicator);
            this.hoverIndicator.geometry.dispose();
            this.hoverIndicator = null;
        }

        // Build geometry based on type
        let geometry;
        if (isMultiFace) {
            // Get all connected coplanar faces and build combined geometry
            geometry = this.createFillExtrudeIndicatorGeometry(voxel, face);
        } else {
            let vertices;
            if (corner !== undefined && corner !== -1) {
                vertices = this.getCornerIndicatorVertices(voxel, face, corner);
            } else if (edge !== Edge.None) {
                vertices = this.getEdgeIndicatorVertices(voxel, face, edge);
            } else {
                vertices = this.getFaceIndicatorVertices(voxel, face);
            }

            if (!vertices || vertices.length === 0) {
                this.indicatorTargetOpacity = 0;
                return;
            }
            geometry = this.createIndicatorGeometry(vertices);
        }

        // Create or update indicator mesh
        if (!this.hoverIndicator) {
            this.hoverIndicator = new THREE.Mesh(geometry, material);
            this.hoverIndicator.renderOrder = 999;
            this.world.scene.add(this.hoverIndicator);
            this.hoverType = type;
        } else {
            // Update geometry
            this.hoverIndicator.geometry.dispose();
            this.hoverIndicator.geometry = geometry;
            this.hoverIndicator.material = material;
        }

        // Position indicator at origin for multi-face (vertices are in world space)
        // or at voxel position for single face
        if (isMultiFace) {
            this.hoverIndicator.position.set(0, 0, 0);
        } else {
            this.hoverIndicator.position.set(voxel.x, voxel.y, voxel.z);
        }

        // Show indicator
        this.indicatorTargetOpacity = 1;
    }

    /**
     * Create geometry for Fill Extrude indicator showing all connected coplanar faces
     */
    createFillExtrudeIndicatorGeometry(startVoxel, face) {
        const connectedFaces = this.findConnectedCoplanarFaces(startVoxel, face);
        const axis = FACE_AXIS[face];
        const offset = 0.002;

        const positions = [];
        const indices = [];
        let vertexOffset = 0;

        for (const { voxel, face: voxelFace } of connectedFaces) {
            const faceVerts = voxel.getFaceVertices(voxelFace);

            // Add vertices in world space (voxel position + local vertex)
            for (const v of faceVerts) {
                positions.push(
                    voxel.x + v[0] + axis[0] * offset,
                    voxel.y + v[1] + axis[1] * offset,
                    voxel.z + v[2] + axis[2] * offset
                );
            }

            // Add triangles for this quad
            indices.push(
                vertexOffset + 0, vertexOffset + 1, vertexOffset + 2,
                vertexOffset + 0, vertexOffset + 2, vertexOffset + 3
            );
            vertexOffset += 4;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }

    /**
     * Get vertices for face indicator (full face quad)
     */
    getFaceIndicatorVertices(voxel, face) {
        const faceVerts = voxel.getFaceVertices(face);
        // Offset slightly outward to prevent z-fighting
        const axis = FACE_AXIS[face];
        const offset = 0.002;
        return faceVerts.map(v => [
            v[0] + axis[0] * offset,
            v[1] + axis[1] * offset,
            v[2] + axis[2] * offset
        ]);
    }

    /**
     * Get vertices for edge indicator (strip along edge)
     */
    getEdgeIndicatorVertices(voxel, face, edge) {
        const faceVerts = voxel.getFaceVertices(face);
        const edgeIndices = this.getEdgeVertexIndices(edge);
        const axis = FACE_AXIS[face];
        const offset = 0.002;

        // Get the two edge vertices
        const v0 = faceVerts[edgeIndices[0]];
        const v1 = faceVerts[edgeIndices[1]];

        // Calculate edge direction
        const edgeDir = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const edgeLen = Math.sqrt(edgeDir[0]**2 + edgeDir[1]**2 + edgeDir[2]**2);
        if (edgeLen < 0.001) return null;

        // Normalize edge direction
        edgeDir[0] /= edgeLen;
        edgeDir[1] /= edgeLen;
        edgeDir[2] /= edgeLen;

        // Calculate inward direction (perpendicular to edge, pointing toward face center)
        // Get face center to determine correct inward direction
        const faceCenter = [
            (faceVerts[0][0] + faceVerts[1][0] + faceVerts[2][0] + faceVerts[3][0]) / 4,
            (faceVerts[0][1] + faceVerts[1][1] + faceVerts[2][1] + faceVerts[3][1]) / 4,
            (faceVerts[0][2] + faceVerts[1][2] + faceVerts[2][2] + faceVerts[3][2]) / 4
        ];

        // Edge midpoint
        const edgeMid = [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2, (v0[2] + v1[2]) / 2];

        // Direction from edge midpoint to face center (this is the true inward direction)
        const toCenter = [
            faceCenter[0] - edgeMid[0],
            faceCenter[1] - edgeMid[1],
            faceCenter[2] - edgeMid[2]
        ];
        const toCenterLen = Math.sqrt(toCenter[0]**2 + toCenter[1]**2 + toCenter[2]**2);
        if (toCenterLen < 0.001) return null;

        const inward = [
            toCenter[0] / toCenterLen,
            toCenter[1] / toCenterLen,
            toCenter[2] / toCenterLen
        ];

        // Edge strip width (about 20% of face or 0.15 units)
        const stripWidth = Math.min(0.15, edgeLen * 0.25);

        // Create quad for edge strip
        return [
            [v0[0] + axis[0] * offset, v0[1] + axis[1] * offset, v0[2] + axis[2] * offset],
            [v1[0] + axis[0] * offset, v1[1] + axis[1] * offset, v1[2] + axis[2] * offset],
            [v1[0] + axis[0] * offset + inward[0] * stripWidth, v1[1] + axis[1] * offset + inward[1] * stripWidth, v1[2] + axis[2] * offset + inward[2] * stripWidth],
            [v0[0] + axis[0] * offset + inward[0] * stripWidth, v0[1] + axis[1] * offset + inward[1] * stripWidth, v0[2] + axis[2] * offset + inward[2] * stripWidth]
        ];
    }

    /**
     * Get vertices for corner indicator (small quad at corner)
     */
    getCornerIndicatorVertices(voxel, face, cornerLocalIndex) {
        const faceVerts = voxel.getFaceVertices(face);
        const axis = FACE_AXIS[face];
        const offset = 0.002;

        // Get the corner vertex
        const corner = faceVerts[cornerLocalIndex];

        // Get adjacent vertices to determine directions
        const prevIdx = (cornerLocalIndex + 3) % 4;
        const nextIdx = (cornerLocalIndex + 1) % 4;
        const prev = faceVerts[prevIdx];
        const next = faceVerts[nextIdx];

        // Directions toward adjacent vertices
        const toPrev = [prev[0] - corner[0], prev[1] - corner[1], prev[2] - corner[2]];
        const toNext = [next[0] - corner[0], next[1] - corner[1], next[2] - corner[2]];

        // Normalize
        const lenPrev = Math.sqrt(toPrev[0]**2 + toPrev[1]**2 + toPrev[2]**2);
        const lenNext = Math.sqrt(toNext[0]**2 + toNext[1]**2 + toNext[2]**2);
        if (lenPrev < 0.001 || lenNext < 0.001) return null;

        toPrev[0] /= lenPrev; toPrev[1] /= lenPrev; toPrev[2] /= lenPrev;
        toNext[0] /= lenNext; toNext[1] /= lenNext; toNext[2] /= lenNext;

        // Corner indicator size
        const size = Math.min(0.12, lenPrev * 0.3, lenNext * 0.3);

        // Create small quad at corner
        return [
            [corner[0] + axis[0] * offset, corner[1] + axis[1] * offset, corner[2] + axis[2] * offset],
            [corner[0] + axis[0] * offset + toNext[0] * size, corner[1] + axis[1] * offset + toNext[1] * size, corner[2] + axis[2] * offset + toNext[2] * size],
            [corner[0] + axis[0] * offset + toNext[0] * size + toPrev[0] * size, corner[1] + axis[1] * offset + toNext[1] * size + toPrev[1] * size, corner[2] + axis[2] * offset + toNext[2] * size + toPrev[2] * size],
            [corner[0] + axis[0] * offset + toPrev[0] * size, corner[1] + axis[1] * offset + toPrev[1] * size, corner[2] + axis[2] * offset + toPrev[2] * size]
        ];
    }

    /**
     * Create geometry from quad vertices
     */
    createIndicatorGeometry(vertices) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const indices = [];

        // Add vertices
        for (const v of vertices) {
            positions.push(v[0], v[1], v[2]);
        }

        // Triangulate quad (0,1,2) and (0,2,3)
        if (vertices.length >= 3) {
            indices.push(0, 1, 2);
            if (vertices.length >= 4) {
                indices.push(0, 2, 3);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }

    /**
     * Hide indicator (e.g., when dragging starts or hovering grid)
     */
    hideIndicator() {
        this.indicatorTargetOpacity = 0;
        this.indicatorOpacity = 0;
        // Also immediately remove the mesh from scene
        if (this.hoverIndicator) {
            this.hoverIndicator.visible = false;
            this.world.scene.remove(this.hoverIndicator);
            this.hoverIndicator.geometry.dispose();
            this.hoverIndicator = null;
            this.hoverType = null;
        }
        this.hoveredVoxelKey = null;
        this.hoveredFace = null;
    }

    /**
     * Enable or disable editing
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.hideIndicator();
            this.isDragging = false;
            this.dragVoxel = null;
        }
    }

    /**
     * Update loop (called each frame)
     */
    update() {
        // Animate indicator opacity
        const fadeSpeed = 0.15;
        if (this.indicatorOpacity < this.indicatorTargetOpacity) {
            this.indicatorOpacity = Math.min(this.indicatorTargetOpacity, this.indicatorOpacity + fadeSpeed);
        } else if (this.indicatorOpacity > this.indicatorTargetOpacity) {
            this.indicatorOpacity = Math.max(this.indicatorTargetOpacity, this.indicatorOpacity - fadeSpeed);
        }

        // Pulse effect
        this.indicatorPulsePhase += 0.08;
        const pulse = 0.7 + 0.3 * Math.sin(this.indicatorPulsePhase);

        // Apply opacity to indicator
        if (this.hoverIndicator) {
            const baseOpacity = this.hoverType === 'corner' ? 0.8 : (this.hoverType === 'edge' ? 0.7 : 0.6);
            this.hoverIndicator.material.opacity = this.indicatorOpacity * baseOpacity * pulse;
            this.hoverIndicator.visible = this.indicatorOpacity > 0.01;
        }

        // Remove indicator if fully faded
        if (this.indicatorOpacity < 0.01 && this.hoverIndicator) {
            this.world.scene.remove(this.hoverIndicator);
            this.hoverIndicator.geometry.dispose();
            this.hoverIndicator = null;
            this.hoverType = null;
        }
    }

    /**
     * Flip the diagonal of the currently hovered face
     * Called when user presses 'F' key
     * @returns {boolean} True if a diagonal was flipped
     */
    flipHoveredFaceDiagonal() {
        if (!this.hoveredVoxelKey || this.hoveredFace === null) {
            return false;
        }

        this.world.flipFaceDiagonal(this.hoveredVoxelKey, this.hoveredFace);
        return true;
    }

    /**
     * Cleanup
     */
    dispose() {
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.domElement.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('mouseup', this.onMouseUp);

        // Clean up grid indicator
        if (this.gridIndicator) {
            this.world.scene.remove(this.gridIndicator);
            this.gridIndicator.geometry.dispose();
            this.gridIndicator.material.dispose();
        }
    }

    // ==================== SHIFT+CLICK FACE SELECTION ====================

    /**
     * Toggle selection of a face (Shift+click)
     * Only allows selecting faces on the same axis as existing selection
     */
    toggleFaceSelection(voxel, face) {
        const key = voxel.getKey() + ':' + face;
        const existingIndex = this.selectedFaces.findIndex(
            sf => sf.voxel.getKey() === voxel.getKey() && sf.face === face
        );

        if (existingIndex >= 0) {
            // Already selected - deselect it
            this.selectedFaces.splice(existingIndex, 1);
            console.log('[Selection] Deselected face', key);
            this.updateSelectionIndicators();
        } else {
            // Check if this face is on the same axis as existing selection
            if (this.selectedFaces.length > 0) {
                const existingFace = this.selectedFaces[0].face;
                // Faces 0,1 are X axis; 2,3 are Y axis; 4,5 are Z axis
                const existingAxis = Math.floor(existingFace / 2);
                const newAxis = Math.floor(face / 2);

                if (existingAxis !== newAxis) {
                    // Different axis - show rejection flash and don't add
                    console.log('[Selection] Rejected - different axis. Existing:', existingAxis, 'New:', newAxis);
                    this.showRejectionFlash(voxel, face);
                    return;
                }
            }

            // Same axis or first selection - add to selection
            this.selectedFaces.push({ voxel, face });
            console.log('[Selection] Selected face', key, 'total:', this.selectedFaces.length);
            this.updateSelectionIndicators();
        }
    }

    /**
     * Show a brief red flash on a face to indicate rejection
     */
    showRejectionFlash(voxel, face) {
        const mesh = this.createSelectionIndicatorMesh(voxel, face, this.rejectionMaterial);
        if (!mesh) return;

        this.world.scene.add(mesh);

        // Animate the flash - fade out over 300ms
        let opacity = 0.9;
        const fadeInterval = setInterval(() => {
            opacity -= 0.15;
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                this.world.scene.remove(mesh);
                mesh.geometry.dispose();
            } else {
                mesh.material.opacity = opacity;
            }
        }, 50);
    }

    /**
     * Clear all face selections
     */
    clearFaceSelection() {
        this.selectedFaces = [];
        this.updateSelectionIndicators();
        console.log('[Selection] Cleared');
    }

    /**
     * Check if there are selected faces
     */
    hasSelection() {
        return this.selectedFaces.length > 0;
    }

    /**
     * Get selection info for display
     */
    getSelectionInfo() {
        if (this.selectedFaces.length === 0) return null;

        // Check if all faces have the same direction
        const firstFace = this.selectedFaces[0].face;
        const allSameFace = this.selectedFaces.every(sf => sf.face === firstFace);

        return {
            count: this.selectedFaces.length,
            face: allSameFace ? firstFace : 'mixed',
            faces: this.selectedFaces
        };
    }

    /**
     * Update visual indicators for selected faces
     */
    updateSelectionIndicators() {
        console.log('[Selection] Updating indicators for', this.selectedFaces.length, 'faces');

        // Remove old indicators
        for (const indicator of this.selectionIndicators) {
            this.world.scene.remove(indicator);
            indicator.geometry.dispose();
        }
        this.selectionIndicators = [];

        // Create new indicators for each selected face
        for (const { voxel, face } of this.selectedFaces) {
            const mesh = this.createSelectionIndicatorMesh(voxel, face);
            if (mesh) {
                this.world.scene.add(mesh);
                this.selectionIndicators.push(mesh);
                console.log('[Selection] Created indicator for', voxel.getKey(), 'face', face);
            }
        }
    }

    /**
     * Create a selection indicator mesh - a small square in the center of the face
     * @param {Voxel} voxel - The voxel
     * @param {number} face - The face index
     * @param {THREE.Material} [material] - Optional material (defaults to selectionMaterial)
     */
    createSelectionIndicatorMesh(voxel, face, material = null) {
        const faceVerts = voxel.getFaceVertices(face);
        const axis = FACE_AXIS[face];
        const offset = 0.01; // Offset from face to prevent z-fighting

        // Calculate face center in local coords
        const center = [
            (faceVerts[0][0] + faceVerts[1][0] + faceVerts[2][0] + faceVerts[3][0]) / 4,
            (faceVerts[0][1] + faceVerts[1][1] + faceVerts[2][1] + faceVerts[3][1]) / 4,
            (faceVerts[0][2] + faceVerts[1][2] + faceVerts[2][2] + faceVerts[3][2]) / 4
        ];

        // Create a smaller square (35% of face size) centered on the face
        const scale = 0.35;
        const smallVerts = faceVerts.map(v => [
            center[0] + (v[0] - center[0]) * scale + axis[0] * offset,
            center[1] + (v[1] - center[1]) * scale + axis[1] * offset,
            center[2] + (v[2] - center[2]) * scale + axis[2] * offset
        ]);

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            smallVerts[0][0], smallVerts[0][1], smallVerts[0][2],
            smallVerts[1][0], smallVerts[1][1], smallVerts[1][2],
            smallVerts[2][0], smallVerts[2][1], smallVerts[2][2],
            smallVerts[3][0], smallVerts[3][1], smallVerts[3][2]
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        // Create mesh with provided material or default selection material
        // For rejection flash, clone the material so we can animate opacity independently
        const useMaterial = material ? material.clone() : this.selectionMaterial;
        const mesh = new THREE.Mesh(geometry, useMaterial);
        mesh.position.set(voxel.x, voxel.y, voxel.z);
        mesh.renderOrder = 999;

        return mesh;
    }

    /**
     * Extrude selected faces by a specific count
     * @param {number} count - Positive to extend, negative to indent
     */
    extrudeSelectionByCount(count) {
        if (this.selectedFaces.length === 0) {
            console.log('[ExtrudeSelection] No faces selected');
            return false;
        }

        if (count === 0) {
            console.log('[ExtrudeSelection] Count is 0, nothing to do');
            return false;
        }

        // Save undo state before extrusion
        this.world.saveUndoState();

        // Check if all selected faces have the same direction
        const firstFace = this.selectedFaces[0].face;
        const allSameFace = this.selectedFaces.every(sf => sf.face === firstFace);

        if (!allSameFace) {
            console.log('[ExtrudeSelection] Mixed face directions - cannot extrude');
            return false;
        }

        const face = firstFace;
        const isExtend = count > 0;
        const absCount = Math.abs(count);

        console.log('[ExtrudeSelection]', isExtend ? 'Extending' : 'Indenting',
            this.selectedFaces.length, 'faces by', absCount);

        // Work with a copy of the selection that we'll update as we go
        let workingFaces = this.selectedFaces.map(sf => ({ voxel: sf.voxel, face: sf.face }));

        for (let i = 0; i < absCount; i++) {
            if (isExtend) {
                // Check if all faces are at boundary
                let canExtend = true;
                for (const { voxel, face: voxelFace } of workingFaces) {
                    if (!this.isFaceAtBoundary(voxel, voxelFace)) {
                        canExtend = false;
                        console.log('[ExtrudeSelection] Face not at boundary:', voxel.getKey());
                        break;
                    }
                }

                if (!canExtend) {
                    console.log('[ExtrudeSelection] Cannot extend - not all faces at boundary');
                    break;
                }

                // Create new voxels
                const newFaces = [];
                for (const { voxel, face: voxelFace } of workingFaces) {
                    const neighborPos = voxel.getNeighborPosition(voxelFace);
                    const wouldCrossMirror = this.world.wouldCrossMirror(neighborPos.x, neighborPos.y, neighborPos.z);

                    if (!this.world.isNeighborEmpty(voxel, voxelFace) || wouldCrossMirror) {
                        continue;
                    }

                    const newVoxel = this.createExtendedVoxel(
                        voxel,
                        neighborPos.x,
                        neighborPos.y,
                        neighborPos.z,
                        voxelFace,
                        1.0
                    );

                    if (newVoxel && !newVoxel.isCollapsed()) {
                        this.world.updateVoxelMesh(newVoxel);
                        newFaces.push({ voxel: newVoxel, face: voxelFace });
                    }
                }

                if (newFaces.length > 0) {
                    workingFaces = newFaces;
                } else {
                    break;
                }
            } else {
                // Indent - remove voxels
                const voxelsToRemove = [];
                const nextFaces = [];

                for (const { voxel, face: voxelFace } of workingFaces) {
                    voxelsToRemove.push(voxel);

                    const oppositeFace = OPPOSITE_FACE[voxelFace];
                    const behindPos = voxel.getNeighborPosition(oppositeFace);
                    const behindKey = VoxelWorld.getKey(behindPos.x, behindPos.y, behindPos.z);
                    const behindVoxel = this.world.voxels.get(behindKey);

                    if (behindVoxel && this.isFaceAtBoundary(behindVoxel, voxelFace)) {
                        nextFaces.push({ voxel: behindVoxel, face: voxelFace });
                    }
                }

                for (const voxel of voxelsToRemove) {
                    this.world.removeVoxel(voxel.x, voxel.y, voxel.z);
                }

                if (nextFaces.length > 0) {
                    workingFaces = nextFaces;
                } else {
                    console.log('[ExtrudeSelection] No more voxels to indent');
                    break;
                }
            }
        }

        // Handle mirror mode
        if (this.world.mirrorEnabled) {
            this.world.updateAllMirrors();
        }

        // Update selection to the new faces
        this.selectedFaces = workingFaces;
        this.updateSelectionIndicators();

        return true;
    }
}
