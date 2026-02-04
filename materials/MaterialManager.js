/**
 * MaterialManager - Centralizes all material operations
 *
 * This class is the single point of interaction between the voxel system
 * and the material system. It handles:
 * - Active material selection (build/paint)
 * - Applying materials to voxels
 * - Material inheritance during operations
 * - Coordinating with VoxelWorld for rendering
 */

import { MaterialLibrary } from './MaterialLibrary.js';
import { LayeredMaterial } from './LayeredMaterial.js';
import { buildSolidMaterial } from './ShaderBuilder.js';

export class MaterialManager {
    /**
     * Create a MaterialManager
     * @param {VoxelWorld} voxelWorld - The voxel world instance
     */
    constructor(voxelWorld) {
        this.world = voxelWorld;
        this.library = new MaterialLibrary();

        // Currently active materials
        this.buildMaterialId = null;   // For Build tool (placing new voxels)
        this.paintMaterialId = null;   // For Paint tool (painting existing voxels)

        // Default material for voxels without assigned material
        this._defaultMaterial = null;
        this._createDefaultMaterial();

        // Event callbacks
        this.onBuildMaterialChanged = null;
        this.onPaintMaterialChanged = null;
        this.onMaterialApplied = null;

        // Initialize default inventory
        this.library.initializeDefaultInventory();

        // Set initial build/paint materials
        this._setInitialMaterials();
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Create the default material for voxels without assignment
     */
    _createDefaultMaterial() {
        this._defaultMaterial = buildSolidMaterial({
            color: '#888888',
            roughness: 0.5,
            metalness: 0.0,
            clearcoat: 0.0
        });
    }

    /**
     * Set initial build/paint materials from inventory
     * Creates a default gray material if inventory is empty
     */
    _setInitialMaterials() {
        let inventory = this.library.getAllInventory();

        // If inventory is empty, create a default gray material
        if (inventory.length === 0) {
            const grayId = this.library.createCustomMaterial(
                'Gray',
                { color: '#888888', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
                [] // No layers - plain solid color
            );
            // Update the created material's category
            const grayMat = this.library.getFromInventory(grayId);
            if (grayMat) {
                grayMat.category = 'solid';
            }
            inventory = this.library.getAllInventory();
        }

        // Use first available material (should be our gray)
        if (inventory.length > 0) {
            this.buildMaterialId = inventory[0].instanceId;
            this.paintMaterialId = inventory[0].instanceId;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTIVE MATERIAL SELECTION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set the active material for the Build tool
     */
    setBuildMaterial(inventoryId) {
        if (!this.library.hasInInventory(inventoryId)) {
            console.warn(`MaterialManager: Material '${inventoryId}' not in inventory`);
            return false;
        }

        this.buildMaterialId = inventoryId;

        if (this.onBuildMaterialChanged) {
            this.onBuildMaterialChanged(inventoryId, this.getBuildMaterial());
        }

        return true;
    }

    /**
     * Set the active material for the Paint tool
     */
    setPaintMaterial(inventoryId) {
        if (!this.library.hasInInventory(inventoryId)) {
            console.warn(`MaterialManager: Material '${inventoryId}' not in inventory`);
            return false;
        }

        this.paintMaterialId = inventoryId;

        if (this.onPaintMaterialChanged) {
            this.onPaintMaterialChanged(inventoryId, this.getPaintMaterial());
        }

        return true;
    }

    /**
     * Set both build and paint to the same material
     */
    setActiveMaterial(inventoryId) {
        this.setBuildMaterial(inventoryId);
        this.setPaintMaterial(inventoryId);
    }

    /**
     * Get the current build material
     */
    getBuildMaterial() {
        return this.library.getFromInventory(this.buildMaterialId);
    }

    /**
     * Get the current paint material
     */
    getPaintMaterial() {
        return this.library.getFromInventory(this.paintMaterialId);
    }

    /**
     * Get the THREE.Material for the build tool
     */
    getBuildThreeMaterial() {
        const mat = this.getBuildMaterial();
        return mat ? mat.material : this._defaultMaterial;
    }

    /**
     * Get the THREE.Material for the paint tool
     */
    getPaintThreeMaterial() {
        const mat = this.getPaintMaterial();
        return mat ? mat.material : this._defaultMaterial;
    }

    // ═══════════════════════════════════════════════════════════════
    // VOXEL MATERIAL OPERATIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Apply the paint material to a voxel
     */
    paintVoxel(voxel) {
        if (!this.paintMaterialId) return false;

        voxel.materialId = this.paintMaterialId;
        this._updateVoxelMesh(voxel);

        if (this.onMaterialApplied) {
            this.onMaterialApplied(voxel, this.paintMaterialId);
        }

        return true;
    }

    /**
     * Apply the build material to a newly created voxel
     */
    applyBuildMaterial(voxel) {
        if (this.buildMaterialId) {
            voxel.materialId = this.buildMaterialId;
        }
        return voxel;
    }

    /**
     * Inherit material from source voxel (for extrusion)
     * Falls back to build material if source has none
     */
    inheritMaterial(sourceVoxel, newVoxel) {
        if (sourceVoxel.materialId) {
            newVoxel.materialId = sourceVoxel.materialId;
        } else if (this.buildMaterialId) {
            newVoxel.materialId = this.buildMaterialId;
        }
        return newVoxel;
    }

    /**
     * Pick material from a voxel (for color picker tool)
     * Adds to inventory if needed and sets as active
     */
    pickMaterialFromVoxel(voxel) {
        if (!voxel.materialId) {
            return null;
        }

        // Check if material is in inventory
        if (this.library.hasInInventory(voxel.materialId)) {
            this.setActiveMaterial(voxel.materialId);
            return voxel.materialId;
        }

        // Material not in inventory - this shouldn't happen normally
        console.warn(`MaterialManager: Voxel has unknown material '${voxel.materialId}'`);
        return null;
    }

    /**
     * Get the THREE.Material for rendering a voxel
     */
    getMaterialForVoxel(voxel) {
        if (voxel.materialId) {
            const threeMat = this.library.getThreeMaterial(voxel.materialId);
            if (threeMat) return threeMat;
        }
        return this._defaultMaterial;
    }

    /**
     * Get the default material
     */
    getDefaultMaterial() {
        return this._defaultMaterial;
    }

    /**
     * Update a voxel's mesh with its current material
     */
    _updateVoxelMesh(voxel) {
        const mesh = this.world.meshes.get(voxel.getKey());
        if (mesh) {
            mesh.material = this.getMaterialForVoxel(voxel);
        }
    }

    /**
     * Refresh all voxels with a specific material
     * Call after editing a material
     */
    refreshMaterialVoxels(inventoryId) {
        // Recompile the material
        this.library.refreshSharedInstance(inventoryId);

        // Update all voxels using this material
        const threeMaterial = this.library.getThreeMaterial(inventoryId);
        if (!threeMaterial) return;

        for (const [key, voxel] of this.world.voxels) {
            if (voxel.materialId === inventoryId) {
                const mesh = this.world.meshes.get(key);
                if (mesh) {
                    mesh.material = threeMaterial;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // LIBRARY DELEGATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get material library
     */
    getLibrary() {
        return this.library;
    }

    /**
     * Get all materials in inventory
     */
    getInventory() {
        return this.library.getAllInventory();
    }

    /**
     * Get material from inventory by ID
     */
    getMaterial(inventoryId) {
        return this.library.getFromInventory(inventoryId);
    }

    /**
     * Add material from definition to inventory
     */
    addMaterialFromDefinition(definitionId) {
        return this.library.addToInventory(definitionId);
    }

    /**
     * Remove material from inventory
     */
    removeMaterial(inventoryId) {
        // Don't allow removing active materials
        if (inventoryId === this.buildMaterialId || inventoryId === this.paintMaterialId) {
            console.warn('Cannot remove active material');
            return false;
        }

        return this.library.removeFromInventory(inventoryId);
    }

    /**
     * Create a new custom material
     */
    createCustomMaterial(name, base, layers = []) {
        return this.library.createCustomMaterial(name, base, layers);
    }

    /**
     * Duplicate a material
     */
    duplicateMaterial(inventoryId) {
        return this.library.duplicateMaterial(inventoryId);
    }

    /**
     * Get all definitions (for "Add from Library" UI)
     */
    getAllDefinitions() {
        return this.library.getAllDefinitions();
    }

    /**
     * Get definitions by category
     */
    getDefinitionsByCategory() {
        return this.library.getDefinitionCategories();
    }

    // ═══════════════════════════════════════════════════════════════
    // SERIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Serialize material state for saving
     */
    serialize() {
        return {
            library: this.library.serialize(),
            buildMaterialId: this.buildMaterialId,
            paintMaterialId: this.paintMaterialId
        };
    }

    /**
     * Deserialize material state
     */
    deserialize(data) {
        if (!data) return;

        if (data.library) {
            this.library.deserialize(data.library);
        }

        // Restore active materials
        if (data.buildMaterialId && this.library.hasInInventory(data.buildMaterialId)) {
            this.buildMaterialId = data.buildMaterialId;
        } else {
            this._setInitialMaterials();
        }

        if (data.paintMaterialId && this.library.hasInInventory(data.paintMaterialId)) {
            this.paintMaterialId = data.paintMaterialId;
        } else {
            this.paintMaterialId = this.buildMaterialId;
        }
    }

    /**
     * Restore voxel materials after loading
     * Call after voxels are loaded to assign proper materials
     */
    restoreVoxelMaterials() {
        for (const [key, voxel] of this.world.voxels) {
            if (voxel.materialId) {
                // Ensure material is in inventory
                if (!this.library.hasInInventory(voxel.materialId)) {
                    // Try to recreate from definition ID
                    const defId = this._extractDefinitionId(voxel.materialId);
                    if (defId && this.library.getDefinition(defId)) {
                        const newId = this.library.addToInventory(defId);
                        voxel.materialId = newId;
                    }
                }

                // Update mesh
                this._updateVoxelMesh(voxel);
            }
        }
    }

    /**
     * Try to extract definition ID from an inventory ID
     * (for legacy migration)
     */
    _extractDefinitionId(inventoryId) {
        // If the inventory ID looks like a definition ID, return it
        if (this.library.getDefinition(inventoryId)) {
            return inventoryId;
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // LEGACY MIGRATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Migrate voxels from old material system
     * Old system stored definition IDs directly on voxels
     */
    migrateFromOldSystem(voxels) {
        const migrationMap = {};

        for (const voxel of voxels) {
            if (voxel.materialId) {
                // Check if this looks like an old definition ID
                const def = this.library.getDefinition(voxel.materialId);
                if (def) {
                    // Create inventory entry if we don't have one mapped yet
                    if (!migrationMap[voxel.materialId]) {
                        migrationMap[voxel.materialId] = this.library.addToInventory(voxel.materialId);
                    }
                    voxel.materialId = migrationMap[voxel.materialId];
                }
            }
        }

        return migrationMap;
    }

    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════

    /**
     * Dispose resources
     */
    dispose() {
        this.library.dispose();
        if (this._defaultMaterial) {
            this._defaultMaterial.dispose();
        }
    }
}
