/**
 * MaterialLibrary - Manages material definitions and user inventory
 *
 * This class handles:
 * - Immutable material definitions (templates)
 * - User's material inventory (configured instances)
 * - Material instance caching for performance
 */

import { DefaultMaterialDefinitions, MaterialCategory, getAllCategories } from './MaterialDefinitions.js';
import { LayeredMaterial } from './LayeredMaterial.js';

export class MaterialLibrary {
    constructor() {
        // Immutable definitions (templates from defaults + custom)
        this.definitions = new Map();

        // User's material inventory (LayeredMaterial instances)
        this.inventory = new Map();

        // Shared material instances (for voxels using same material)
        this.sharedInstances = new Map();

        // Event callbacks
        this.onInventoryChanged = null;
        this.onDefinitionsChanged = null;

        // Load defaults
        this._loadDefaults();
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Load default material definitions
     */
    _loadDefaults() {
        for (const [id, def] of Object.entries(DefaultMaterialDefinitions)) {
            // Freeze the definition to prevent modification
            this.definitions.set(id, Object.freeze(def));
        }
    }

    /**
     * Initialize with a default inventory
     * Call this when starting a new project
     *
     * NOTE: We no longer pre-load materials. Users create all materials
     * through the "Create Material" flow. A basic gray material is created
     * by MaterialManager as the default for new voxels.
     */
    initializeDefaultInventory() {
        this.inventory.clear();
        this.sharedInstances.clear();

        // No pre-loaded materials - users create all materials via Create Material flow
        this._notifyInventoryChanged();
    }

    // ═══════════════════════════════════════════════════════════════
    // DEFINITIONS (Templates)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get a material definition by ID
     */
    getDefinition(id) {
        return this.definitions.get(id) || null;
    }

    /**
     * Get all definitions
     */
    getAllDefinitions() {
        return Array.from(this.definitions.values());
    }

    /**
     * Get definitions by category
     */
    getDefinitionsByCategory(category) {
        return this.getAllDefinitions().filter(d => d.category === category);
    }

    /**
     * Get all categories with their definitions
     */
    getDefinitionCategories() {
        const categories = {};
        for (const def of this.definitions.values()) {
            if (!categories[def.category]) {
                categories[def.category] = [];
            }
            categories[def.category].push(def);
        }
        return categories;
    }

    /**
     * Add a custom definition (for user-created materials saved as templates)
     */
    addCustomDefinition(definition) {
        const id = definition.id || `custom_${Date.now()}`;
        const def = {
            ...definition,
            id,
            category: definition.category || MaterialCategory.Custom
        };
        this.definitions.set(id, Object.freeze(def));
        this._notifyDefinitionsChanged();
        return id;
    }

    /**
     * Remove a custom definition
     */
    removeCustomDefinition(id) {
        const def = this.definitions.get(id);
        if (def && def.category === MaterialCategory.Custom) {
            this.definitions.delete(id);
            this._notifyDefinitionsChanged();
            return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════════════
    // INVENTORY (User's Materials)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Add a material to the user's inventory from a definition
     * @param {string} definitionId - ID of the definition to instantiate
     * @param {string} customName - Optional custom name
     * @returns {string} Inventory ID of the new material
     */
    addToInventory(definitionId, customName = null) {
        const def = this.definitions.get(definitionId);
        if (!def) {
            console.warn(`MaterialLibrary: Definition '${definitionId}' not found`);
            return null;
        }

        const material = new LayeredMaterial(def);
        if (customName) {
            material.name = customName;
        }

        const inventoryId = material.instanceId;
        this.inventory.set(inventoryId, material);

        this._notifyInventoryChanged();
        return inventoryId;
    }

    /**
     * Add a LayeredMaterial instance directly to inventory
     */
    addMaterialToInventory(material) {
        const inventoryId = material.instanceId;
        this.inventory.set(inventoryId, material);
        this._notifyInventoryChanged();
        return inventoryId;
    }

    /**
     * Remove a material from inventory
     */
    removeFromInventory(inventoryId) {
        const material = this.inventory.get(inventoryId);
        if (material) {
            material.dispose();
            this.inventory.delete(inventoryId);
            this.sharedInstances.delete(inventoryId);
            this._notifyInventoryChanged();
            return true;
        }
        return false;
    }

    /**
     * Get a material from inventory
     */
    getFromInventory(inventoryId) {
        return this.inventory.get(inventoryId) || null;
    }

    /**
     * Get all materials in inventory
     */
    getAllInventory() {
        return Array.from(this.inventory.values());
    }

    /**
     * Get inventory materials by category
     */
    getInventoryByCategory() {
        const categories = {};
        for (const mat of this.inventory.values()) {
            const cat = mat.category || 'custom';
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push(mat);
        }
        return categories;
    }

    /**
     * Check if a material is in inventory
     */
    hasInInventory(inventoryId) {
        return this.inventory.has(inventoryId);
    }

    /**
     * Get inventory size
     */
    get inventorySize() {
        return this.inventory.size;
    }

    // ═══════════════════════════════════════════════════════════════
    // SHARED INSTANCES (For Voxels)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get a shared material instance for a voxel
     * This ensures all voxels with the same material share the THREE.Material
     */
    getSharedInstance(inventoryId) {
        // First check cache
        if (this.sharedInstances.has(inventoryId)) {
            return this.sharedInstances.get(inventoryId);
        }

        // Get from inventory
        const material = this.inventory.get(inventoryId);
        if (material) {
            this.sharedInstances.set(inventoryId, material);
            return material;
        }

        return null;
    }

    /**
     * Get the THREE.Material for rendering a voxel
     */
    getThreeMaterial(inventoryId) {
        const material = this.getSharedInstance(inventoryId);
        return material ? material.material : null;
    }

    /**
     * Clear shared instance cache (call when materials are modified)
     */
    clearSharedCache() {
        this.sharedInstances.clear();
    }

    /**
     * Refresh a specific shared instance
     */
    refreshSharedInstance(inventoryId) {
        const material = this.inventory.get(inventoryId);
        if (material) {
            material.recompile();
            this.sharedInstances.set(inventoryId, material);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // CUSTOM MATERIAL CREATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Create a new custom material from scratch
     */
    createCustomMaterial(name, base = null, layers = []) {
        const material = new LayeredMaterial();
        material.name = name;
        material.category = MaterialCategory.Custom;

        if (base) {
            material.base = { ...material.base, ...base };
        }

        for (const layer of layers) {
            material.layers.push({
                type: layer.type,
                params: { ...layer.params },
                blend: layer.blend,
                opacity: layer.opacity,
                enabled: layer.enabled !== false
            });
        }

        material.markDirty();
        return this.addMaterialToInventory(material);
    }

    /**
     * Duplicate a material in inventory
     */
    duplicateMaterial(inventoryId) {
        const original = this.inventory.get(inventoryId);
        if (!original) return null;

        const cloned = original.clone();
        return this.addMaterialToInventory(cloned);
    }

    // ═══════════════════════════════════════════════════════════════
    // SERIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Serialize the library state (inventory + custom definitions)
     */
    serialize() {
        // Serialize inventory
        const inventory = {};
        for (const [id, mat] of this.inventory) {
            inventory[id] = mat.serialize();
        }

        // Serialize custom definitions
        const customDefinitions = {};
        for (const [id, def] of this.definitions) {
            if (def.category === MaterialCategory.Custom) {
                customDefinitions[id] = def;
            }
        }

        return {
            version: '2.0',
            inventory,
            customDefinitions
        };
    }

    /**
     * Deserialize library state
     */
    deserialize(data) {
        if (!data) return;

        // Clear current state
        this.inventory.clear();
        this.sharedInstances.clear();

        // Remove old custom definitions
        for (const [id, def] of this.definitions) {
            if (def.category === MaterialCategory.Custom) {
                this.definitions.delete(id);
            }
        }

        // Load custom definitions
        if (data.customDefinitions) {
            for (const [id, def] of Object.entries(data.customDefinitions)) {
                this.definitions.set(id, Object.freeze(def));
            }
        }

        // Load inventory
        if (data.inventory) {
            for (const [id, matData] of Object.entries(data.inventory)) {
                const material = LayeredMaterial.deserialize(matData);
                this.inventory.set(id, material);
            }
        }

        this._notifyInventoryChanged();
        this._notifyDefinitionsChanged();
    }

    /**
     * Export just the inventory for a save file
     */
    serializeInventory() {
        const inventory = {};
        for (const [id, mat] of this.inventory) {
            inventory[id] = mat.serialize();
        }
        return inventory;
    }

    /**
     * Import inventory from a save file
     */
    deserializeInventory(inventoryData) {
        if (!inventoryData) return;

        this.inventory.clear();
        this.sharedInstances.clear();

        for (const [id, matData] of Object.entries(inventoryData)) {
            const material = LayeredMaterial.deserialize(matData);
            this.inventory.set(id, material);
        }

        this._notifyInventoryChanged();
    }

    // ═══════════════════════════════════════════════════════════════
    // LEGACY SUPPORT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get a material by old-style definition ID (for backward compatibility)
     * Creates an inventory entry if needed
     */
    getOrCreateFromDefinition(definitionId) {
        // Check if we have this in inventory already
        for (const [invId, mat] of this.inventory) {
            if (mat.definitionId === definitionId && !mat._modified) {
                return invId;
            }
        }

        // Create new inventory entry
        return this.addToInventory(definitionId);
    }

    /**
     * Migrate from old material system
     * Takes an array of voxels and updates their materialId references
     */
    migrateOldMaterials(voxels, oldMaterialIdMap) {
        // oldMaterialIdMap: { oldId: newInventoryId }
        for (const voxel of voxels) {
            if (voxel.materialId && oldMaterialIdMap[voxel.materialId]) {
                voxel.materialId = oldMaterialIdMap[voxel.materialId];
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    _notifyInventoryChanged() {
        if (this.onInventoryChanged) {
            this.onInventoryChanged(this.getAllInventory());
        }
    }

    _notifyDefinitionsChanged() {
        if (this.onDefinitionsChanged) {
            this.onDefinitionsChanged(this.getAllDefinitions());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITY
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get category display name
     */
    static getCategoryName(category) {
        const names = {
            [MaterialCategory.Solid]: 'Solid Colors',
            [MaterialCategory.Pattern]: 'Patterns',
            [MaterialCategory.Metal]: 'Metals',
            [MaterialCategory.Natural]: 'Natural',
            [MaterialCategory.Custom]: 'Custom'
        };
        return names[category] || category;
    }

    /**
     * Dispose all materials
     */
    dispose() {
        for (const material of this.inventory.values()) {
            material.dispose();
        }
        this.inventory.clear();
        this.sharedInstances.clear();
    }
}
