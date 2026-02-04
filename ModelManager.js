import * as THREE from 'three';
import { VoxelModel } from './VoxelModel.js';

/**
 * ModelManager - Manages all voxel models in the scene
 * Similar to GameItemManager but for editable voxel models
 */
export class ModelManager {
    constructor(scene) {
        this.scene = scene;
        this.models = new Map(); // id -> VoxelModel
        this.selectedModel = null;
        this.editingModel = null; // Currently being edited

        // Material manager reference (set externally)
        this.materialManager = null;

        // Container group for all model meshGroups
        this.modelGroup = new THREE.Group();
        this.modelGroup.name = 'VoxelModels';
        this.scene.add(this.modelGroup);

        // For generating unique IDs
        this.modelCounter = 0;
    }

    /**
     * Generate unique model ID
     */
    generateId() {
        this.modelCounter++;
        return `model_${Date.now()}_${this.modelCounter}`;
    }

    /**
     * Create a new voxel model
     * @param {Object} position - World position {x, y, z}
     * @param {boolean} withDefaultVoxel - Whether to add a default voxel
     * @returns {VoxelModel}
     */
    createModel(position = { x: 0, y: 0.5, z: 0 }, withDefaultVoxel = true) {
        const id = this.generateId();
        const model = new VoxelModel(id, position);

        // Set material manager reference
        if (this.materialManager) {
            model.materialManager = this.materialManager;
        }

        // Add default voxel at model origin
        if (withDefaultVoxel) {
            model.addVoxel(0, 0, 0);
        }

        this.models.set(id, model);
        this.modelGroup.add(model.meshGroup);

        return model;
    }

    /**
     * Remove a model
     * @param {string} id - Model ID
     */
    removeModel(id) {
        const model = this.models.get(id);
        if (!model) return;

        // Clear selection if this model was selected
        if (this.selectedModel === model) {
            this.selectedModel = null;
        }

        // Stop editing if this model was being edited
        if (this.editingModel === model) {
            this.editingModel = null;
        }

        // Remove from scene
        this.modelGroup.remove(model.meshGroup);

        // Dispose resources
        model.dispose();

        this.models.delete(id);
    }

    /**
     * Get model by ID
     * @param {string} id
     * @returns {VoxelModel|undefined}
     */
    getModel(id) {
        return this.models.get(id);
    }

    /**
     * Get model from a mesh (via userData)
     * @param {THREE.Mesh} mesh
     * @returns {VoxelModel|null}
     */
    getModelFromMesh(mesh) {
        if (!mesh) return null;

        // Check if mesh is a model voxel
        if (mesh.userData.modelId) {
            return this.models.get(mesh.userData.modelId);
        }

        // Check parent (meshGroup)
        let parent = mesh.parent;
        while (parent) {
            if (parent.userData && parent.userData.modelId) {
                return this.models.get(parent.userData.modelId);
            }
            parent = parent.parent;
        }

        return null;
    }

    /**
     * Select a model
     * @param {VoxelModel} model
     */
    selectModel(model) {
        this.selectedModel = model;
    }

    /**
     * Clear model selection
     */
    clearSelection() {
        this.selectedModel = null;
    }

    /**
     * Start editing a model
     * @param {VoxelModel} model
     */
    startEditing(model) {
        this.editingModel = model;
        this.selectedModel = model;
    }

    /**
     * Stop editing current model
     */
    stopEditing() {
        this.editingModel = null;
    }

    /**
     * Check if currently editing a model
     * @returns {boolean}
     */
    isEditing() {
        return this.editingModel !== null;
    }

    /**
     * Get all meshes for raycasting (returns all voxel meshes from all models)
     * @returns {THREE.Mesh[]}
     */
    getMeshesForRaycast() {
        const meshes = [];
        for (const model of this.models.values()) {
            meshes.push(...model.getMeshesForRaycast());
        }
        return meshes;
    }

    /**
     * Alias for getMeshesForRaycast - returns all meshes from all models
     * @returns {THREE.Mesh[]}
     */
    getAllMeshes() {
        return this.getMeshesForRaycast();
    }

    /**
     * Get model mesh groups for selection raycasting
     * This is used to select models as a whole (not individual voxels)
     * @returns {THREE.Group[]}
     */
    getModelGroups() {
        return Array.from(this.models.values()).map(model => model.meshGroup);
    }

    /**
     * Raycast against all models to find which model was clicked
     * @param {THREE.Raycaster} raycaster
     * @returns {{ model: VoxelModel, voxel: Voxel, face: number, point: THREE.Vector3 }|null}
     */
    raycast(raycaster) {
        const meshes = this.getMeshesForRaycast();
        if (meshes.length === 0) return null;

        const intersects = raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const mesh = hit.object;
            const model = this.getModelFromMesh(mesh);

            if (model && mesh.userData.voxel) {
                return {
                    model: model,
                    voxel: mesh.userData.voxel,
                    face: this.determineFaceFromNormal(hit.face.normal),
                    point: hit.point,
                    distance: hit.distance
                };
            }
        }

        return null;
    }

    /**
     * Determine face index from intersection normal
     * @param {THREE.Vector3} normal
     * @returns {number}
     */
    determineFaceFromNormal(normal) {
        // Face indices: 0=Right(+X), 1=Left(-X), 2=Top(+Y), 3=Bottom(-Y), 4=Back(+Z), 5=Front(-Z)
        const abs = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
        const maxIndex = abs.indexOf(Math.max(...abs));

        switch (maxIndex) {
            case 0: return normal.x > 0 ? 0 : 1; // Right or Left
            case 1: return normal.y > 0 ? 2 : 3; // Top or Bottom
            case 2: return normal.z > 0 ? 4 : 5; // Back or Front
            default: return 2; // Default to Top
        }
    }

    /**
     * Set opacity for all models (for fading when editing world)
     * @param {number} opacity - 0 to 1
     */
    setAllModelsOpacity(opacity) {
        for (const model of this.models.values()) {
            this.setModelOpacity(model, opacity);
        }
    }

    /**
     * Set opacity for a specific model
     * @param {VoxelModel} model
     * @param {number} opacity
     */
    setModelOpacity(model, opacity) {
        for (const mesh of model.meshes.values()) {
            if (mesh.material) {
                mesh.material.transparent = opacity < 1;
                mesh.material.opacity = opacity;
                mesh.material.needsUpdate = true;
            }
        }
    }

    /**
     * Serialize all models for saving
     * @returns {Object[]}
     */
    serialize() {
        return Array.from(this.models.values()).map(model => model.serialize());
    }

    /**
     * Deserialize and load models
     * @param {Object[]} dataArray
     */
    deserialize(dataArray) {
        // Clear existing models
        for (const model of this.models.values()) {
            this.modelGroup.remove(model.meshGroup);
            model.dispose();
        }
        this.models.clear();
        this.selectedModel = null;
        this.editingModel = null;

        // Load models
        for (const data of dataArray) {
            const model = VoxelModel.deserialize(data, this.materialManager);
            this.models.set(model.id, model);
            this.modelGroup.add(model.meshGroup);
        }

        // Update counter to avoid ID collisions
        if (dataArray.length > 0) {
            this.modelCounter = dataArray.length + 1;
        }
    }

    /**
     * Get model count
     * @returns {number}
     */
    get count() {
        return this.models.size;
    }

    /**
     * Get all models as array
     * @returns {VoxelModel[]}
     */
    getAllModels() {
        return Array.from(this.models.values());
    }

    /**
     * Update a model's name
     * @param {string} id
     * @param {string} name
     */
    renameModel(id, name) {
        const model = this.models.get(id);
        if (model) {
            model.name = name;
        }
    }
}
