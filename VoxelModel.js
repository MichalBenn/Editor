import * as THREE from 'three';
import { Voxel, Face, Edge, FACE_AXIS, OPPOSITE_FACE } from './Voxel.js';
import { VoxelGeometryBuilder } from './VoxelGeometryBuilder.js';

/**
 * VoxelModel represents an independent voxel object that can be transformed in the world.
 * Each model has its own voxel storage and can be edited separately from the main world.
 */
export class VoxelModel {
    constructor(id, position = { x: 0, y: 0, z: 0 }) {
        this.id = id;
        this.name = `Model ${id.split('_')[1] || '1'}`;

        // World-space transform
        this.position = { ...position };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1 };

        // Voxel storage (local coordinates relative to model origin)
        this.voxels = new Map(); // key: "x,y,z" -> Voxel

        // Material Manager reference (set externally)
        this.materialManager = null;

        // Matcap render mode support
        this.materialType = 'physical';
        this.matcapMaterial = null;

        // Legacy material fallback
        this.defaultMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x888888,
            roughness: 0.35,
            metalness: 0.0,
            flatShading: true,
            side: THREE.DoubleSide
        });

        // Edge line material
        this.edgeLineMaterial = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.3
        });

        // THREE.Group containing all model meshes (for world transform)
        this.meshGroup = new THREE.Group();
        this.meshGroup.userData.isVoxelModel = true;
        this.meshGroup.userData.modelId = this.id;

        // Container for voxel meshes within the group
        this.voxelGroup = new THREE.Group();
        this.meshGroup.add(this.voxelGroup);

        // Container for edge lines
        this.edgeGroup = new THREE.Group();
        this.meshGroup.add(this.edgeGroup);

        // Geometry builder
        this.geometryBuilder = new VoxelGeometryBuilder();

        // Track meshes by voxel key
        this.meshes = new Map();
        this.edgeLines = new Map();

        // Selection state (for VoxelEditor compatibility)
        this.selectedVoxelKey = null;
        this.selectedFace = null;
        this.selectedEdge = null;

        // Fill group selection for multi-face operations
        this.fillGroupKeys = null;

        // Mirror mode (local to model)
        this.mirrorEnabled = false;
        this.mirrorAxis = 'x';
        this.mirrorPosition = 0;

        // Undo/Redo system (per model)
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoLevels = 50;

        // Apply initial transform
        this.updateTransform();
    }

    /**
     * Get voxel key string
     */
    static getKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    /**
     * Update the meshGroup transform from position/rotation/scale properties
     */
    updateTransform() {
        this.meshGroup.position.set(this.position.x, this.position.y, this.position.z);
        this.meshGroup.rotation.set(
            THREE.MathUtils.degToRad(this.rotation.x),
            THREE.MathUtils.degToRad(this.rotation.y),
            THREE.MathUtils.degToRad(this.rotation.z)
        );
        this.meshGroup.scale.set(this.scale.x, this.scale.y, this.scale.z);
    }

    /**
     * Sync position/rotation/scale from meshGroup (after gizmo manipulation)
     */
    syncFromMesh() {
        this.position.x = this.meshGroup.position.x;
        this.position.y = this.meshGroup.position.y;
        this.position.z = this.meshGroup.position.z;

        this.rotation.x = THREE.MathUtils.radToDeg(this.meshGroup.rotation.x);
        this.rotation.y = THREE.MathUtils.radToDeg(this.meshGroup.rotation.y);
        this.rotation.z = THREE.MathUtils.radToDeg(this.meshGroup.rotation.z);

        this.scale.x = this.meshGroup.scale.x;
        this.scale.y = this.meshGroup.scale.y;
        this.scale.z = this.meshGroup.scale.z;
    }

    /**
     * Set material type (physical or matcap) - syncs with world render mode
     * @param {string} type - 'physical' or 'matcap'
     * @param {THREE.Material} matcapMaterial - matcap material (required if type is 'matcap')
     */
    setMaterialType(type, matcapMaterial = null) {
        this.materialType = type;

        if (type === 'matcap' && matcapMaterial) {
            this.matcapMaterial = matcapMaterial;
        }

        // Update all existing meshes
        for (const [key, mesh] of this.meshes) {
            const voxel = this.voxels.get(key);
            if (mesh && voxel) {
                mesh.material = this.getMaterialForVoxel(voxel);
            }
        }
    }

    /**
     * Get the appropriate material for a voxel, respecting matcap render mode
     * @param {Voxel} voxel - The voxel to get material for
     * @returns {THREE.Material} The material to use
     */
    getMaterialForVoxel(voxel) {
        // Matcap mode overrides everything
        if (this.materialType === 'matcap' && this.matcapMaterial) {
            return this.matcapMaterial.clone();
        }

        // Normal material resolution - clone to avoid sharing
        let material = this.defaultMaterial.clone();
        if (this.materialManager && voxel && voxel.materialId) {
            const srcMaterial = this.materialManager.getMaterialForVoxel(voxel);
            if (srcMaterial && srcMaterial.clone) {
                material = srcMaterial.clone();
            }
        } else if (voxel && voxel.material && voxel.material.clone) {
            material = voxel.material.clone();
        }

        // Ensure model voxels are never transparent
        material.transparent = false;
        material.opacity = 1.0;

        return material;
    }

    /**
     * Add a voxel at the given local coordinates
     */
    addVoxel(x, y, z, corners = null, material = null, materialId = null) {
        const key = VoxelModel.getKey(x, y, z);

        if (this.voxels.has(key)) {
            return this.voxels.get(key);
        }

        const voxel = new Voxel(x, y, z, corners);

        // Apply material
        if (materialId && this.materialManager) {
            voxel.materialId = materialId;
        } else if (material) {
            voxel.material = material;
            voxel.materialId = materialId;
        }

        this.voxels.set(key, voxel);
        this.createVoxelMesh(voxel);

        return voxel;
    }

    /**
     * Remove a voxel at the given coordinates
     */
    removeVoxel(x, y, z) {
        const key = VoxelModel.getKey(x, y, z);
        const voxel = this.voxels.get(key);

        if (!voxel) return false;

        // Remove mesh
        const mesh = this.meshes.get(key);
        if (mesh) {
            this.voxelGroup.remove(mesh);
            mesh.geometry.dispose();
            this.meshes.delete(key);
        }

        // Remove edge lines
        const edgeLine = this.edgeLines.get(key);
        if (edgeLine) {
            this.edgeGroup.remove(edgeLine);
            edgeLine.geometry.dispose();
            this.edgeLines.delete(key);
        }

        this.voxels.delete(key);
        return true;
    }

    /**
     * Create mesh for a voxel
     */
    createVoxelMesh(voxel) {
        const key = voxel.getKey();

        // Remove existing mesh if any
        const existingMesh = this.meshes.get(key);
        if (existingMesh) {
            this.voxelGroup.remove(existingMesh);
            existingMesh.geometry.dispose();
        }

        // Get material (respects matcap render mode)
        const material = this.getMaterialForVoxel(voxel);

        // Build geometry
        const geometry = this.geometryBuilder.buildVoxelGeometry(voxel);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(voxel.x, voxel.y, voxel.z);
        mesh.userData.voxel = voxel;
        mesh.userData.voxelKey = key;
        mesh.userData.isModelVoxel = true;
        mesh.userData.modelId = this.id;

        // Enable shadows
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.voxelGroup.add(mesh);
        this.meshes.set(key, mesh);

        // Create edge lines
        this.createEdgeLines(voxel);

        return mesh;
    }

    /**
     * Update mesh for a voxel (after editing)
     */
    updateVoxelMesh(voxel) {
        this.createVoxelMesh(voxel);
    }

    /**
     * Create edge lines for a voxel
     */
    createEdgeLines(voxel) {
        const key = voxel.getKey();

        // Remove existing
        const existing = this.edgeLines.get(key);
        if (existing) {
            this.edgeGroup.remove(existing);
            existing.geometry.dispose();
        }

        const geometry = this.buildEdgeGeometry(voxel);
        if (geometry) {
            const line = new THREE.LineSegments(geometry, this.edgeLineMaterial);
            line.position.set(voxel.x, voxel.y, voxel.z);
            this.edgeGroup.add(line);
            this.edgeLines.set(key, line);
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
     * Check if neighbor position is empty
     */
    isNeighborEmpty(voxel, face) {
        const neighborPos = voxel.getNeighborPosition(face);
        const key = VoxelModel.getKey(neighborPos.x, neighborPos.y, neighborPos.z);
        return !this.voxels.has(key);
    }

    /**
     * Set selection state
     */
    setSelection(voxelKey, face, edge) {
        this.selectedVoxelKey = voxelKey;
        this.selectedFace = face;
        this.selectedEdge = edge;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedVoxelKey = null;
        this.selectedFace = null;
        this.selectedEdge = null;
    }

    /**
     * Set fill group selection (for multi-face operations)
     */
    setFillGroupSelection(keys) {
        this.fillGroupKeys = keys;
    }

    /**
     * Clear fill group selection
     */
    clearFillGroupSelection() {
        this.fillGroupKeys = null;
    }

    /**
     * Get meshes for raycasting
     */
    getMeshesForRaycast() {
        return Array.from(this.meshes.values());
    }

    /**
     * Get meshes (alias for getMeshesForRaycast for VoxelWorld API compatibility)
     */
    getMeshes() {
        return this.getMeshesForRaycast();
    }

    /**
     * Save current state for undo
     */
    saveUndoState() {
        const state = this.serializeVoxels();
        this.undoStack.push(state);
        this.redoStack = []; // Clear redo on new action

        // Limit stack size
        while (this.undoStack.length > this.maxUndoLevels) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) return false;

        // Save current state to redo
        this.redoStack.push(this.serializeVoxels());

        // Restore previous state
        const state = this.undoStack.pop();
        this.deserializeVoxels(state);

        return true;
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) return false;

        // Save current state to undo
        this.undoStack.push(this.serializeVoxels());

        // Restore redo state
        const state = this.redoStack.pop();
        this.deserializeVoxels(state);

        return true;
    }

    /**
     * Serialize just the voxels (for undo/redo)
     */
    serializeVoxels() {
        const voxels = [];
        for (const voxel of this.voxels.values()) {
            voxels.push({
                x: voxel.x,
                y: voxel.y,
                z: voxel.z,
                corners: voxel.corners.map(c => [...c]),
                flipped: voxel.flipped,
                materialId: voxel.materialId
            });
        }
        return JSON.stringify(voxels);
    }

    /**
     * Deserialize voxels (for undo/redo)
     */
    deserializeVoxels(json) {
        const data = JSON.parse(json);

        // Clear existing voxels
        for (const key of this.voxels.keys()) {
            const [x, y, z] = key.split(',').map(Number);
            this.removeVoxel(x, y, z);
        }

        // Restore voxels
        for (const v of data) {
            const voxel = this.addVoxel(v.x, v.y, v.z, v.corners, null, v.materialId);
            if (voxel) {
                voxel.flipped = v.flipped || false;
                this.updateVoxelMesh(voxel);
            }
        }
    }

    /**
     * Serialize entire model (for save/load)
     */
    serialize() {
        const voxels = [];
        for (const voxel of this.voxels.values()) {
            voxels.push({
                x: voxel.x,
                y: voxel.y,
                z: voxel.z,
                corners: voxel.corners.map(c => [...c]),
                flipped: voxel.flipped,
                materialId: voxel.materialId
            });
        }

        return {
            id: this.id,
            name: this.name,
            position: { ...this.position },
            rotation: { ...this.rotation },
            scale: { ...this.scale },
            voxels: voxels
        };
    }

    /**
     * Deserialize model from saved data
     */
    static deserialize(data, materialManager = null) {
        const model = new VoxelModel(data.id, data.position);
        model.name = data.name || model.name;
        model.rotation = { ...data.rotation };
        model.scale = { ...data.scale };
        model.materialManager = materialManager;
        model.updateTransform();

        // Load voxels
        for (const v of data.voxels) {
            const voxel = model.addVoxel(v.x, v.y, v.z, v.corners, null, v.materialId);
            if (voxel) {
                voxel.flipped = v.flipped || false;
                model.updateVoxelMesh(voxel);
            }
        }

        return model;
    }

    /**
     * Check if position would cross mirror boundary
     */
    wouldCrossMirror(x, y, z) {
        if (!this.mirrorEnabled) return false;

        switch (this.mirrorAxis) {
            case 'x': return x < this.mirrorPosition;
            case 'y': return y < this.mirrorPosition;
            case 'z': return z < this.mirrorPosition;
            default: return false;
        }
    }

    /**
     * Get mirrored position
     */
    getMirroredPosition(x, y, z) {
        if (!this.mirrorEnabled) return null;

        switch (this.mirrorAxis) {
            case 'x': return { x: 2 * this.mirrorPosition - x - 1, y, z };
            case 'y': return { x, y: 2 * this.mirrorPosition - y - 1, z };
            case 'z': return { x, y, z: 2 * this.mirrorPosition - z - 1 };
            default: return null;
        }
    }

    /**
     * Update all mirror meshes (for compatibility with VoxelWorld API)
     * In VoxelModel, mirroring is handled per-voxel during creation
     */
    updateAllMirrors() {
        // VoxelModel handles mirroring differently - no global mirror mesh system
        // This is a no-op for API compatibility
    }

    /**
     * Flip a face's diagonal triangulation
     * @param {string} voxelKey - The voxel key
     * @param {number} face - Face index to flip
     * @returns {boolean} New flipped state
     */
    flipFaceDiagonal(voxelKey, face) {
        const voxel = this.voxels.get(voxelKey);
        if (!voxel) return false;

        const newState = voxel.toggleFaceDiagonal(face);
        this.updateVoxelMesh(voxel);

        return newState;
    }

    /**
     * Add a collapsed voxel (for extrusion operations)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} fromFace - The face from which the voxel is being extruded
     * @returns {Voxel}
     */
    addCollapsedVoxel(x, y, z, fromFace) {
        const key = VoxelModel.getKey(x, y, z);

        if (this.voxels.has(key)) {
            return this.voxels.get(key);
        }

        const voxel = Voxel.createCollapsed(x, y, z, fromFace);

        // Apply material if available
        if (this.materialManager) {
            // Use default material ID if available
        }

        this.voxels.set(key, voxel);
        this.createVoxelMesh(voxel);

        return voxel;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Dispose all meshes
        for (const mesh of this.meshes.values()) {
            mesh.geometry.dispose();
        }

        // Dispose all edge lines
        for (const line of this.edgeLines.values()) {
            line.geometry.dispose();
        }

        // Dispose materials
        this.defaultMaterial.dispose();
        this.edgeLineMaterial.dispose();

        // Clear maps
        this.meshes.clear();
        this.edgeLines.clear();
        this.voxels.clear();
    }
}
