import * as THREE from 'three';
import { Voxel, Face, Edge, FACE_AXIS, OPPOSITE_FACE } from './Voxel.js';
import { VoxelGeometryBuilder } from './VoxelGeometryBuilder.js';

/**
 * VoxelWorld manages all voxels and their visual representation
 */
export class VoxelWorld {
    constructor(scene) {
        this.scene = scene;
        this.voxels = new Map(); // key: "x,y,z" -> Voxel

        // Materials - using MeshPhysicalMaterial as default
        this.physicalMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x888888,
            roughness: 0.35,
            metalness: 0.0,
            clearcoat: 0.0,
            clearcoatRoughness: 0.2,
            flatShading: true,
            side: THREE.DoubleSide
        });

        // Matcap material (created when needed)
        this.matcapMaterial = null;

        // Current active material
        this.defaultMaterial = this.physicalMaterial;
        this.materialType = 'physical';

        // Selected material is same as default (no red highlight)
        this.selectedMaterial = this.defaultMaterial;

        // Edge line material - subtle dark lines
        this.edgeLineMaterial = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.3
        });

        // Container for all voxel meshes
        this.voxelGroup = new THREE.Group();
        this.scene.add(this.voxelGroup);

        // Container for edge lines
        this.edgeGroup = new THREE.Group();
        this.scene.add(this.edgeGroup);

        // Geometry builder
        this.geometryBuilder = new VoxelGeometryBuilder();

        // Track meshes by voxel key
        this.meshes = new Map();

        // Track edge lines by voxel key
        this.edgeLines = new Map();

        // Currently selected element
        this.selectedVoxelKey = null;
        this.selectedFace = null;
        this.selectedEdge = null;

        // Mirror mode
        this.mirrorEnabled = false;
        this.mirrorAxis = 'x'; // 'x', 'y', or 'z'
        this.mirrorPosition = 0; // Position of mirror plane along axis
        this.mirrorGroup = new THREE.Group();
        this.mirrorEdgeGroup = new THREE.Group();
        this.scene.add(this.mirrorGroup);
        this.scene.add(this.mirrorEdgeGroup);

        // Mirror plane visual indicator
        this.mirrorPlane = null;
        this.createMirrorPlane();

        // Undo/Redo system
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoLevels = 50; // Limit memory usage
    }

    /**
     * Create the visual mirror plane indicator (1 block high, fades at top)
     */
    createMirrorPlane() {
        // Create a plane that spans the grid width and is 1 unit tall
        // with vertex colors that fade from solid at bottom to transparent at top
        const width = 20;
        const height = 1;
        const segments = 1;

        const geometry = new THREE.PlaneGeometry(width, height, 1, 1);

        // Set vertex colors - bottom vertices opaque, top vertices transparent
        const colors = [];
        const positions = geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i);
            // y goes from -0.5 to 0.5 in local space
            // We want bottom (y=-0.5) to be opaque, top (y=0.5) to be transparent
            const alpha = 0.5 - y; // 1.0 at bottom, 0.0 at top
            colors.push(0.3, 0.9, 0.7, alpha * 0.4); // Greenish tint like in the image
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.mirrorPlane = new THREE.Mesh(geometry, material);
        this.mirrorPlane.visible = false;
        this.scene.add(this.mirrorPlane);

        this.updateMirrorPlanePosition();
    }

    /**
     * Set material type (physical or matcap)
     * @param {string} type - 'physical' or 'matcap'
     * @param {THREE.Texture} matcapTexture - matcap texture (required if type is 'matcap')
     */
    setMaterialType(type, matcapTexture = null) {
        this.materialType = type;

        if (type === 'physical') {
            this.defaultMaterial = this.physicalMaterial;
        } else if (type === 'matcap' && matcapTexture) {
            // Create or update matcap material
            if (!this.matcapMaterial) {
                this.matcapMaterial = new THREE.MeshMatcapMaterial({
                    matcap: matcapTexture,
                    flatShading: true,
                    side: THREE.DoubleSide
                });
            } else {
                this.matcapMaterial.matcap = matcapTexture;
                this.matcapMaterial.needsUpdate = true;
            }
            this.defaultMaterial = this.matcapMaterial;
        }

        this.selectedMaterial = this.defaultMaterial;

        // Update all existing meshes
        for (const mesh of this.meshes.values()) {
            mesh.material = this.defaultMaterial;
        }

        // Update mirror meshes
        for (const child of this.mirrorGroup.children) {
            if (child.isMesh) {
                child.material = this.defaultMaterial;
            }
        }
    }

    /**
     * Update mirror plane visual position
     */
    updateMirrorPlanePosition() {
        if (!this.mirrorPlane) return;

        // Position the plane at mirror boundary
        // For X axis mirror at position 1, the plane should be at x=0.5 (between voxel 0 and 1)
        const planeX = this.mirrorAxis === 'x' ? this.mirrorPosition - 0.5 : 0.5;
        const planeZ = this.mirrorAxis === 'z' ? this.mirrorPosition - 0.5 : 0.5;

        // Position at y=0 so bottom is at y=-0.5 (grid level) and top at y=0.5
        this.mirrorPlane.position.set(planeX, 0, planeZ);

        // Rotate to face the correct direction
        this.mirrorPlane.rotation.set(0, 0, 0);
        if (this.mirrorAxis === 'x') {
            this.mirrorPlane.rotation.y = Math.PI / 2;
        } else if (this.mirrorAxis === 'y') {
            this.mirrorPlane.rotation.x = Math.PI / 2;
        }
        // Z axis - default orientation
    }

    /**
     * Toggle mirror mode
     */
    setMirrorMode(enabled, axis = 'x', position = 0) {
        this.mirrorEnabled = enabled;
        this.mirrorAxis = axis;
        this.mirrorPosition = position;

        this.mirrorPlane.visible = enabled;
        this.updateMirrorPlanePosition();

        if (enabled) {
            this.updateAllMirrors();
        } else {
            this.clearMirrors();
        }
    }

    /**
     * Show or hide the mirror plane indicator (without changing mirror mode)
     */
    setMirrorPlaneVisible(visible) {
        if (this.mirrorPlane) {
            this.mirrorPlane.visible = visible && this.mirrorEnabled;
        }
    }

    /**
     * Clear all mirrored meshes
     */
    clearMirrors() {
        while (this.mirrorGroup.children.length > 0) {
            const child = this.mirrorGroup.children[0];
            this.mirrorGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
        }
        while (this.mirrorEdgeGroup.children.length > 0) {
            const child = this.mirrorEdgeGroup.children[0];
            this.mirrorEdgeGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
        }
    }

    /**
     * Update all mirrored meshes
     */
    updateAllMirrors() {
        this.clearMirrors();

        if (!this.mirrorEnabled) return;

        for (const voxel of this.voxels.values()) {
            this.updateMirrorMesh(voxel);
        }
    }

    /**
     * Update mirrored mesh for a single voxel
     */
    updateMirrorMesh(voxel) {
        if (!this.mirrorEnabled) return;

        // Calculate mirrored position
        const mirrorPos = this.getMirroredPosition(voxel.x, voxel.y, voxel.z);

        // Don't create mirror if it would overlap with original
        if (mirrorPos.x === voxel.x && mirrorPos.y === voxel.y && mirrorPos.z === voxel.z) {
            return;
        }

        // Create mirrored voxel geometry with mirrored corners
        const mirroredCorners = this.getMirroredCorners(voxel.corners);
        const mirroredVoxel = new Voxel(mirrorPos.x, mirrorPos.y, mirrorPos.z, mirroredCorners);

        // Copy and mirror the faceFlipped states
        // When mirroring, faces perpendicular to the mirror axis swap
        for (let f = 0; f < 6; f++) {
            const mirroredFace = this.getMirroredFace(f);
            mirroredVoxel.faceFlipped[mirroredFace] = voxel.faceFlipped[f];
        }

        // Build geometry
        const geometry = this.geometryBuilder.buildVoxelGeometry(mirroredVoxel);

        // Create mesh with slightly transparent material to indicate it's a mirror
        const mesh = new THREE.Mesh(geometry, this.defaultMaterial);
        mesh.position.set(mirrorPos.x, mirrorPos.y, mirrorPos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isMirror = true;
        mesh.userData.sourceKey = voxel.getKey();

        this.mirrorGroup.add(mesh);

        // Create edge lines for mirror
        const edgeGeometry = this.buildEdgeGeometry(mirroredVoxel);
        if (edgeGeometry) {
            const edgeLines = new THREE.LineSegments(edgeGeometry, this.edgeLineMaterial);
            edgeLines.position.set(mirrorPos.x, mirrorPos.y, mirrorPos.z);
            this.mirrorEdgeGroup.add(edgeLines);
        }
    }

    /**
     * Get mirrored position across the mirror plane
     */
    getMirroredPosition(x, y, z) {
        const result = { x, y, z };
        const axisIndex = this.mirrorAxis === 'x' ? 'x' : (this.mirrorAxis === 'y' ? 'y' : 'z');

        // Mirror across the plane: new_pos = 2 * mirror_pos - old_pos - 1
        // The -1 accounts for voxel being 1 unit wide
        result[axisIndex] = 2 * this.mirrorPosition - result[axisIndex] - 1;

        return result;
    }

    /**
     * Get mirrored corners for a voxel
     */
    getMirroredCorners(corners) {
        const axisIndex = this.mirrorAxis === 'x' ? 0 : (this.mirrorAxis === 'y' ? 1 : 2);

        return corners.map(corner => {
            const mirrored = [...corner];
            mirrored[axisIndex] = -mirrored[axisIndex];
            return mirrored;
        });
    }

    /**
     * Check if a position would cross the mirror boundary
     */
    wouldCrossMirror(x, y, z) {
        if (!this.mirrorEnabled) return false;

        const axisIndex = this.mirrorAxis === 'x' ? 'x' : (this.mirrorAxis === 'y' ? 'y' : 'z');
        const pos = { x, y, z };

        // Check if this position would be at or past the mirror plane
        return pos[axisIndex] < this.mirrorPosition;
    }

    /**
     * Check if a voxel is on the source side (editable side) of the mirror
     */
    isOnSourceSide(x, y, z) {
        const axisKey = this.mirrorAxis;
        const pos = { x, y, z };
        return pos[axisKey] >= this.mirrorPosition;
    }

    /**
     * Check if a voxel is on the mirrored side
     */
    isOnMirroredSide(x, y, z) {
        const axisKey = this.mirrorAxis;
        const pos = { x, y, z };
        return pos[axisKey] < this.mirrorPosition;
    }

    /**
     * Enable mirror mode with cleanup - delete mirrored side, keep source side
     */
    enableMirrorWithCleanup(axis = 'x', position = 0) {
        this.mirrorAxis = axis;
        this.mirrorPosition = position;

        // Remove voxels on the mirrored side
        const keysToRemove = [];
        for (const [key, voxel] of this.voxels) {
            if (this.isOnMirroredSide(voxel.x, voxel.y, voxel.z)) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            const { x, y, z } = VoxelWorld.parseKey(key);
            this.removeVoxel(x, y, z);
        }

        // Enable mirror mode
        this.mirrorEnabled = true;
        this.mirrorPlane.visible = true;
        this.updateMirrorPlanePosition();
        this.updateAllMirrors();

    }

    /**
     * Enable mirror mode with a clean model - clear everything and start fresh
     */
    enableMirrorClean(axis = 'x', position = 0) {
        this.mirrorAxis = axis;
        this.mirrorPosition = position;

        // Remove all voxels
        const keysToRemove = Array.from(this.voxels.keys());
        for (const key of keysToRemove) {
            const { x, y, z } = VoxelWorld.parseKey(key);
            this.removeVoxel(x, y, z);
        }

        // Add a single starter voxel on the source side
        this.addVoxel(position, 0, 0);

        // Enable mirror mode
        this.mirrorEnabled = true;
        this.mirrorPlane.visible = true;
        this.updateMirrorPlanePosition();
        this.updateAllMirrors();

    }

    /**
     * Disable mirror mode - convert mirrored geometry to real voxels
     */
    disableMirror() {
        if (!this.mirrorEnabled) return;

        // Convert all mirrored meshes to real voxels
        const voxelsToAdd = [];

        for (const voxel of this.voxels.values()) {
            const mirrorPos = this.getMirroredPosition(voxel.x, voxel.y, voxel.z);

            // Don't create if it would overlap with existing
            if (mirrorPos.x === voxel.x && mirrorPos.y === voxel.y && mirrorPos.z === voxel.z) {
                continue;
            }

            // Don't create if a voxel already exists there
            if (this.hasVoxel(mirrorPos.x, mirrorPos.y, mirrorPos.z)) {
                continue;
            }

            // Create mirrored corners
            const mirroredCorners = this.getMirroredCorners(voxel.corners);
            voxelsToAdd.push({
                x: mirrorPos.x,
                y: mirrorPos.y,
                z: mirrorPos.z,
                corners: mirroredCorners
            });
        }

        // Add all the mirrored voxels as real voxels
        for (const v of voxelsToAdd) {
            this.addVoxel(v.x, v.y, v.z, v.corners);
        }

        // Disable mirror mode
        this.mirrorEnabled = false;
        this.mirrorPlane.visible = false;
        this.clearMirrors();

    }

    /**
     * Get voxel key from coordinates
     */
    static getKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    /**
     * Parse key to coordinates
     */
    static parseKey(key) {
        const [x, y, z] = key.split(',').map(Number);
        return { x, y, z };
    }

    /**
     * Get voxel at position
     */
    getVoxel(x, y, z) {
        return this.voxels.get(VoxelWorld.getKey(x, y, z));
    }

    /**
     * Check if position has a voxel
     */
    hasVoxel(x, y, z) {
        return this.voxels.has(VoxelWorld.getKey(x, y, z));
    }

    /**
     * Add a new voxel
     */
    addVoxel(x, y, z, corners = null) {
        const key = VoxelWorld.getKey(x, y, z);

        if (this.voxels.has(key)) {
            return this.voxels.get(key);
        }

        const voxel = new Voxel(x, y, z, corners);
        this.voxels.set(key, voxel);
        this.updateVoxelMesh(voxel);

        return voxel;
    }

    /**
     * Add a collapsed voxel (for extending)
     */
    addCollapsedVoxel(x, y, z, fromFace) {
        const key = VoxelWorld.getKey(x, y, z);

        if (this.voxels.has(key)) {
            return this.voxels.get(key);
        }

        const voxel = Voxel.createCollapsed(x, y, z, fromFace);
        this.voxels.set(key, voxel);
        this.updateVoxelMesh(voxel);

        return voxel;
    }

    /**
     * Remove a voxel
     */
    removeVoxel(x, y, z) {
        const key = VoxelWorld.getKey(x, y, z);
        const voxel = this.voxels.get(key);

        if (!voxel) return;

        // Remove mesh
        const mesh = this.meshes.get(key);
        if (mesh) {
            this.voxelGroup.remove(mesh);
            mesh.geometry.dispose();
            this.meshes.delete(key);
        }

        // Remove edge lines
        const edgeLines = this.edgeLines.get(key);
        if (edgeLines) {
            this.edgeGroup.remove(edgeLines);
            edgeLines.geometry.dispose();
            this.edgeLines.delete(key);
        }

        this.voxels.delete(key);

        // Clear selection if this voxel was selected
        if (this.selectedVoxelKey === key) {
            this.clearSelection();
        }

        // Update mirrors if enabled
        if (this.mirrorEnabled) {
            this.updateAllMirrors();
        }
    }

    /**
     * Update mesh for a voxel
     */
    updateVoxelMesh(voxel) {
        const key = voxel.getKey();

        // Remove existing mesh
        const existingMesh = this.meshes.get(key);
        if (existingMesh) {
            this.voxelGroup.remove(existingMesh);
            existingMesh.geometry.dispose();
        }

        // Remove existing edge lines
        const existingEdges = this.edgeLines.get(key);
        if (existingEdges) {
            this.edgeGroup.remove(existingEdges);
            existingEdges.geometry.dispose();
        }

        // Build new geometry
        const geometry = this.geometryBuilder.buildVoxelGeometry(voxel);

        // Determine material
        const isSelected = key === this.selectedVoxelKey;
        const material = isSelected ? this.selectedMaterial : this.defaultMaterial;

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(voxel.x, voxel.y, voxel.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.voxelKey = key;

        this.voxelGroup.add(mesh);
        this.meshes.set(key, mesh);

        // Create edge lines
        const edgeGeometry = this.buildEdgeGeometry(voxel);
        if (edgeGeometry) {
            const edgeLines = new THREE.LineSegments(edgeGeometry, this.edgeLineMaterial);
            edgeLines.position.set(voxel.x, voxel.y, voxel.z);
            this.edgeGroup.add(edgeLines);
            this.edgeLines.set(key, edgeLines);
        }

        // Update mirror if enabled
        if (this.mirrorEnabled) {
            this.updateAllMirrors(); // Rebuild all mirrors (simpler than tracking individual)
        }
    }

    /**
     * Build edge line geometry for a voxel
     */
    buildEdgeGeometry(voxel) {
        if (voxel.isCollapsed()) {
            return null;
        }

        const positions = [];

        // Get the 12 edges of the voxel (connecting 8 corners)
        const edgeIndices = [
            [0, 1], [1, 2], [2, 3], [3, 0], // Top face edges
            [4, 5], [5, 6], [6, 7], [7, 4], // Bottom face edges
            [0, 7], [1, 6], [2, 5], [3, 4]  // Vertical edges (connecting top to bottom)
        ];

        for (const [i, j] of edgeIndices) {
            const c1 = voxel.corners[i];
            const c2 = voxel.corners[j];
            positions.push(c1[0], c1[1], c1[2]);
            positions.push(c2[0], c2[1], c2[2]);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return geometry;
    }

    /**
     * Set selection
     */
    setSelection(voxelKey, face, edge = Edge.None) {
        // Clear previous selection
        if (this.selectedVoxelKey && this.selectedVoxelKey !== voxelKey) {
            const prevMesh = this.meshes.get(this.selectedVoxelKey);
            if (prevMesh) {
                prevMesh.material = this.defaultMaterial;
            }
        }

        this.selectedVoxelKey = voxelKey;
        this.selectedFace = face;
        this.selectedEdge = edge;

        // Apply selection material
        const mesh = this.meshes.get(voxelKey);
        if (mesh) {
            mesh.material = this.selectedMaterial;
        }
    }

    /**
     * Clear selection
     */
    clearSelection() {
        if (this.selectedVoxelKey) {
            const mesh = this.meshes.get(this.selectedVoxelKey);
            if (mesh) {
                mesh.material = this.defaultMaterial;
            }
        }

        // Also clear fill group selection
        this.clearFillGroupSelection();

        this.selectedVoxelKey = null;
        this.selectedFace = null;
        this.selectedEdge = null;
    }

    /**
     * Set fill group selection (highlights multiple voxels)
     */
    setFillGroupSelection(voxelKeys) {
        // Clear previous fill group selection
        this.clearFillGroupSelection();

        this.fillGroupKeys = voxelKeys || [];

        // Apply selection material to all voxels in the group
        for (const key of this.fillGroupKeys) {
            const mesh = this.meshes.get(key);
            if (mesh) {
                mesh.material = this.selectedMaterial;
            }
        }
    }

    /**
     * Clear fill group selection
     */
    clearFillGroupSelection() {
        if (this.fillGroupKeys) {
            for (const key of this.fillGroupKeys) {
                // Don't clear the main selected voxel
                if (key !== this.selectedVoxelKey) {
                    const mesh = this.meshes.get(key);
                    if (mesh) {
                        mesh.material = this.defaultMaterial;
                    }
                }
            }
        }
        this.fillGroupKeys = null;
    }

    /**
     * Get selected voxel
     */
    getSelectedVoxel() {
        if (!this.selectedVoxelKey) return null;
        return this.voxels.get(this.selectedVoxelKey);
    }

    /**
     * Check if neighbor position is empty
     */
    isNeighborEmpty(voxel, face) {
        const pos = voxel.getNeighborPosition(face);
        return !this.hasVoxel(pos.x, pos.y, pos.z);
    }

    /**
     * Get all voxel meshes for raycasting
     */
    getMeshes() {
        return Array.from(this.meshes.values());
    }

    /**
     * Serialize world state
     */
    serialize() {
        const voxelData = [];

        for (const voxel of this.voxels.values()) {
            voxelData.push(voxel.serialize());
        }

        return { voxels: voxelData };
    }

    /**
     * Load world from serialized data
     */
    deserialize(data) {
        // Clear existing
        for (const key of this.voxels.keys()) {
            const { x, y, z } = VoxelWorld.parseKey(key);
            this.removeVoxel(x, y, z);
        }

        // Load voxels
        for (const voxelData of data.voxels) {
            const voxel = Voxel.deserialize(voxelData);
            this.voxels.set(voxel.getKey(), voxel);
            this.updateVoxelMesh(voxel);
        }
    }

    // ==================== UNDO/REDO SYSTEM ====================

    /**
     * Save current state to undo stack
     * Call this after each complete action (mouse up, click, etc.)
     */
    saveUndoState() {
        const state = this.serialize();
        this.undoStack.push(state);

        // Clear redo stack when new action is performed
        this.redoStack = [];

        // Limit stack size
        if (this.undoStack.length > this.maxUndoLevels) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo the last action
     * @returns {boolean} True if undo was performed
     */
    undo() {
        if (this.undoStack.length === 0) {
            console.log('[Undo] Nothing to undo');
            return false;
        }

        // Save current state to redo stack
        const currentState = this.serialize();
        this.redoStack.push(currentState);

        // Pop and restore previous state
        const previousState = this.undoStack.pop();
        this.restoreState(previousState);

        console.log('[Undo] Restored state, undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
        return true;
    }

    /**
     * Redo the last undone action
     * @returns {boolean} True if redo was performed
     */
    redo() {
        if (this.redoStack.length === 0) {
            console.log('[Redo] Nothing to redo');
            return false;
        }

        // Save current state to undo stack
        const currentState = this.serialize();
        this.undoStack.push(currentState);

        // Pop and restore redo state
        const redoState = this.redoStack.pop();
        this.restoreState(redoState);

        console.log('[Redo] Restored state, undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
        return true;
    }

    /**
     * Restore world state from serialized data (without triggering mirror updates per voxel)
     * @param {object} state - Serialized state from serialize()
     */
    restoreState(state) {
        // Temporarily disable mirror updates during bulk restore
        const wasMirrorEnabled = this.mirrorEnabled;
        this.mirrorEnabled = false;

        // Clear all existing voxels
        const keysToRemove = Array.from(this.voxels.keys());
        for (const key of keysToRemove) {
            const { x, y, z } = VoxelWorld.parseKey(key);
            this.removeVoxel(x, y, z);
        }

        // Restore voxels
        for (const voxelData of state.voxels) {
            const voxel = Voxel.deserialize(voxelData);
            this.voxels.set(voxel.getKey(), voxel);
            this.updateVoxelMesh(voxel);
        }

        // Re-enable mirrors and update
        this.mirrorEnabled = wasMirrorEnabled;
        if (this.mirrorEnabled) {
            this.updateAllMirrors();
        }
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear undo/redo history
     */
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Export model to OBJ format using geometry builder for full detail
     * Culls truly internal faces where both adjacent voxels have flush boundaries
     * @returns {string} OBJ file content
     */
    exportToOBJ() {
        let obj = '# Voxel Model Export\n';
        obj += '# Generated by EditVoxel\n\n';

        // Build complete voxel map including mirrors
        const allVoxels = new Map();

        for (const voxel of this.voxels.values()) {
            if (voxel.isCollapsed()) continue;
            allVoxels.set(voxel.getKey(), voxel);
        }

        // Add mirrored voxels if enabled
        if (this.mirrorEnabled) {
            for (const voxel of this.voxels.values()) {
                if (voxel.isCollapsed()) continue;

                const mirrorPos = this.getMirroredPosition(voxel.x, voxel.y, voxel.z);
                const mirrorKey = `${mirrorPos.x},${mirrorPos.y},${mirrorPos.z}`;

                if (mirrorPos.x === voxel.x && mirrorPos.y === voxel.y && mirrorPos.z === voxel.z) {
                    continue;
                }

                if (!allVoxels.has(mirrorKey)) {
                    const mirroredCorners = this.getMirroredCorners(voxel.corners);
                    const mirroredVoxel = new Voxel(mirrorPos.x, mirrorPos.y, mirrorPos.z, mirroredCorners);
                    allVoxels.set(mirrorKey, mirroredVoxel);
                }
            }
        }

        // Neighbor offsets for each face
        const NEIGHBOR_OFFSET = {
            0: [0, 1, 0],     // Top
            1: [0, -1, 0],    // Bottom
            2: [0, 0, -1],    // Front
            3: [0, 0, 1],     // Back
            4: [-1, 0, 0],    // Left
            5: [1, 0, 0]      // Right
        };

        // Determine which faces to skip for each voxel (truly internal faces)
        const skipFaces = new Map(); // voxelKey -> Set of face indices to skip

        for (const voxel of allVoxels.values()) {
            const skip = new Set();

            for (let face = 0; face < 6; face++) {
                const offset = NEIGHBOR_OFFSET[face];
                const neighborKey = `${voxel.x + offset[0]},${voxel.y + offset[1]},${voxel.z + offset[2]}`;
                const neighbor = allVoxels.get(neighborKey);

                if (neighbor) {
                    const oppositeFace = [1, 0, 3, 2, 5, 4][face];
                    const thisFaceAtBoundary = this.isFaceAtBoundary(voxel, face);
                    const neighborFaceAtBoundary = this.isFaceAtBoundary(neighbor, oppositeFace);

                    // Only skip if BOTH faces are flush at the shared boundary
                    if (thisFaceAtBoundary && neighborFaceAtBoundary) {
                        skip.add(face);
                    }
                }
            }

            skipFaces.set(voxel.getKey(), skip);
        }

        // Collect all geometry
        const vertices = [];
        const normals = [];
        const faces = [];
        const vertexMap = new Map();
        const normalMap = new Map();

        const getVertexIndex = (x, y, z) => {
            const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
            if (vertexMap.has(key)) {
                return vertexMap.get(key);
            }
            vertices.push([x, y, z]);
            const index = vertices.length;
            vertexMap.set(key, index);
            return index;
        };

        const getNormalIndex = (nx, ny, nz) => {
            const key = `${nx.toFixed(4)},${ny.toFixed(4)},${nz.toFixed(4)}`;
            if (normalMap.has(key)) {
                return normalMap.get(key);
            }
            normals.push([nx, ny, nz]);
            const index = normals.length;
            normalMap.set(key, index);
            return index;
        };

        // Process each voxel using geometry builder
        for (const voxel of allVoxels.values()) {
            const skip = skipFaces.get(voxel.getKey());

            // Build geometry for this voxel
            const geometry = this.geometryBuilder.buildVoxelGeometry(voxel);

            if (!geometry.attributes.position) {
                continue;
            }

            const positions = geometry.attributes.position.array;
            const geomNormals = geometry.attributes.normal.array;
            const faceIds = geometry.attributes.faceId ? geometry.attributes.faceId.array : null;
            const index = geometry.index ? geometry.index.array : null;

            // Process triangles (handling indexed geometry)
            if (index) {
                // Indexed geometry
                for (let i = 0; i < index.length; i += 3) {
                    const i0 = index[i];
                    const i1 = index[i + 1];
                    const i2 = index[i + 2];

                    // Get face ID from first vertex of triangle
                    let faceId = -1;
                    if (faceIds) {
                        faceId = faceIds[i0];
                    }

                    // Skip if this face should be hidden
                    if (faceId >= 0 && faceId < 6 && skip.has(faceId)) {
                        continue;
                    }

                    // Get world positions
                    const p0 = [
                        positions[i0 * 3] + voxel.x,
                        positions[i0 * 3 + 1] + voxel.y,
                        positions[i0 * 3 + 2] + voxel.z
                    ];
                    const p1 = [
                        positions[i1 * 3] + voxel.x,
                        positions[i1 * 3 + 1] + voxel.y,
                        positions[i1 * 3 + 2] + voxel.z
                    ];
                    const p2 = [
                        positions[i2 * 3] + voxel.x,
                        positions[i2 * 3 + 1] + voxel.y,
                        positions[i2 * 3 + 2] + voxel.z
                    ];

                    // Get normal from first vertex
                    const n = [
                        geomNormals[i0 * 3],
                        geomNormals[i0 * 3 + 1],
                        geomNormals[i0 * 3 + 2]
                    ];

                    // Get OBJ indices
                    const vi0 = getVertexIndex(p0[0], p0[1], p0[2]);
                    const vi1 = getVertexIndex(p1[0], p1[1], p1[2]);
                    const vi2 = getVertexIndex(p2[0], p2[1], p2[2]);
                    const ni = getNormalIndex(n[0], n[1], n[2]);

                    faces.push({ v: [vi0, vi1, vi2], n: ni });
                }
            } else {
                // Non-indexed geometry - process as direct triangles
                for (let i = 0; i < positions.length / 3; i += 3) {
                    let faceId = -1;
                    if (faceIds) {
                        faceId = faceIds[i];
                    }

                    if (faceId >= 0 && faceId < 6 && skip.has(faceId)) {
                        continue;
                    }

                    const p0 = [
                        positions[i * 3] + voxel.x,
                        positions[i * 3 + 1] + voxel.y,
                        positions[i * 3 + 2] + voxel.z
                    ];
                    const p1 = [
                        positions[(i + 1) * 3] + voxel.x,
                        positions[(i + 1) * 3 + 1] + voxel.y,
                        positions[(i + 1) * 3 + 2] + voxel.z
                    ];
                    const p2 = [
                        positions[(i + 2) * 3] + voxel.x,
                        positions[(i + 2) * 3 + 1] + voxel.y,
                        positions[(i + 2) * 3 + 2] + voxel.z
                    ];

                    const n = [
                        geomNormals[i * 3],
                        geomNormals[i * 3 + 1],
                        geomNormals[i * 3 + 2]
                    ];

                    const vi0 = getVertexIndex(p0[0], p0[1], p0[2]);
                    const vi1 = getVertexIndex(p1[0], p1[1], p1[2]);
                    const vi2 = getVertexIndex(p2[0], p2[1], p2[2]);
                    const ni = getNormalIndex(n[0], n[1], n[2]);

                    faces.push({ v: [vi0, vi1, vi2], n: ni });
                }
            }

            geometry.dispose();
        }

        // Write vertices
        for (const v of vertices) {
            obj += `v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}\n`;
        }

        obj += '\n';

        // Write normals
        for (const n of normals) {
            obj += `vn ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}\n`;
        }

        obj += '\n';

        // Write faces
        for (const f of faces) {
            obj += `f ${f.v[0]}//${f.n} ${f.v[1]}//${f.n} ${f.v[2]}//${f.n}\n`;
        }

        return obj;
    }

    /**
     * Get face vertices in world coordinates
     */
    getFaceVerticesWorld(voxel, face) {
        const FACE_CORNERS = {
            0: [0, 1, 2, 3],      // Top
            1: [4, 5, 6, 7],      // Bottom
            2: [7, 6, 1, 0],      // Front
            3: [5, 4, 3, 2],      // Back
            4: [4, 7, 0, 3],      // Left
            5: [6, 5, 2, 1]       // Right
        };

        const cornerIndices = FACE_CORNERS[face];
        return cornerIndices.map(ci => {
            const c = voxel.corners[ci];
            return [c[0] + voxel.x, c[1] + voxel.y, c[2] + voxel.z];
        });
    }

    /**
     * Check if a voxel's face is at the default boundary position (not indented)
     */
    isFaceAtBoundary(voxel, face) {
        const FACE_CORNERS = {
            0: [0, 1, 2, 3],      // Top
            1: [4, 5, 6, 7],      // Bottom
            2: [7, 6, 1, 0],      // Front
            3: [5, 4, 3, 2],      // Back
            4: [4, 7, 0, 3],      // Left
            5: [6, 5, 2, 1]       // Right
        };

        // Which axis this face is on and its expected boundary value
        const FACE_AXIS_INFO = {
            0: { axis: 1, value: 0.5 },    // Top: Y = 0.5
            1: { axis: 1, value: -0.5 },   // Bottom: Y = -0.5
            2: { axis: 2, value: -0.5 },   // Front: Z = -0.5
            3: { axis: 2, value: 0.5 },    // Back: Z = 0.5
            4: { axis: 0, value: -0.5 },   // Left: X = -0.5
            5: { axis: 0, value: 0.5 }     // Right: X = 0.5
        };

        const cornerIndices = FACE_CORNERS[face];
        const { axis, value } = FACE_AXIS_INFO[face];
        const tolerance = 0.001;

        // Check if all corners of this face are at the expected boundary
        for (const ci of cornerIndices) {
            const corner = voxel.corners[ci];
            if (Math.abs(corner[axis] - value) > tolerance) {
                return false; // This corner is not at the boundary
            }
        }
        return true;
    }

    /**
     * Calculate face normal from vertices using Newell's method
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
            return [nx / len, ny / len, nz / len];
        }
        return [0, 1, 0]; // Fallback
    }

    /**
     * Download OBJ file
     */
    downloadOBJ(filename = 'voxel_model.obj') {
        const objContent = this.exportToOBJ();
        const blob = new Blob([objContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Flip the diagonal of a face on a voxel
     * This changes which diagonal is used for triangulation
     * Also flips the corresponding face on the mirrored voxel when mirror mode is enabled
     * @param {string} voxelKey - The key of the voxel
     * @param {number} face - The face index (0-5)
     * @returns {boolean} The new flipped state
     */
    flipFaceDiagonal(voxelKey, face) {
        const voxel = this.voxels.get(voxelKey);
        if (!voxel) return false;

        const newState = voxel.toggleFaceDiagonal(face);
        this.updateVoxelMesh(voxel);

        // If mirror mode is enabled, also flip the corresponding face on the mirrored voxel
        if (this.mirrorEnabled) {
            const mirrorPos = this.getMirroredPosition(voxel.x, voxel.y, voxel.z);

            // Don't flip if mirror position is the same as original (voxel is on mirror plane)
            if (mirrorPos.x !== voxel.x || mirrorPos.y !== voxel.y || mirrorPos.z !== voxel.z) {
                const mirrorKey = VoxelWorld.getKey(mirrorPos.x, mirrorPos.y, mirrorPos.z);
                const mirrorVoxel = this.voxels.get(mirrorKey);

                if (mirrorVoxel) {
                    // For mirrored voxels, we need to flip the corresponding face
                    // The face mapping depends on the mirror axis
                    const mirroredFace = this.getMirroredFace(face);
                    mirrorVoxel.faceFlipped[mirroredFace] = newState;
                    this.updateVoxelMesh(mirrorVoxel);
                }
            }

            // Update mirror meshes (for visual mirrors, not real voxels)
            this.updateAllMirrors();
        }

        return newState;
    }

    /**
     * Get the corresponding face on a mirrored voxel
     * When mirroring across an axis, faces perpendicular to that axis swap
     * @param {number} face - The original face index
     * @returns {number} The mirrored face index
     */
    getMirroredFace(face) {
        // Face indices: Top=0, Bottom=1, Front=2, Back=3, Left=4, Right=5
        // When mirroring across X axis: Left(4) <-> Right(5)
        // When mirroring across Y axis: Top(0) <-> Bottom(1)
        // When mirroring across Z axis: Front(2) <-> Back(3)

        if (this.mirrorAxis === 'x') {
            if (face === 4) return 5; // Left -> Right
            if (face === 5) return 4; // Right -> Left
        } else if (this.mirrorAxis === 'y') {
            if (face === 0) return 1; // Top -> Bottom
            if (face === 1) return 0; // Bottom -> Top
        } else if (this.mirrorAxis === 'z') {
            if (face === 2) return 3; // Front -> Back
            if (face === 3) return 2; // Back -> Front
        }

        // For faces parallel to the mirror axis, they stay the same
        return face;
    }
}
