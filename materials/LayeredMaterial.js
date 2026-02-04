/**
 * LayeredMaterial - A configured material instance with base properties and pattern layers
 *
 * This class represents a material that can be applied to voxels. It holds:
 * - Base surface properties (color, roughness, metalness, clearcoat)
 * - Pattern layers that modify the appearance
 * - A compiled THREE.Material for rendering
 */

import { buildMaterial, updateShaderUniforms, buildSolidMaterial, updateLightingUniforms } from './ShaderBuilder.js';
import { validateLayerParams, createLayer } from './LayerTypes.js';

let materialIdCounter = 0;

export class LayeredMaterial {
    /**
     * Create a new LayeredMaterial
     * @param {Object} definition - Material definition from library
     */
    constructor(definition = null) {
        // Generate unique instance ID
        this.instanceId = `mat_${Date.now()}_${++materialIdCounter}`;

        // Reference to source definition (if from library)
        this.definitionId = definition?.id || null;

        // Display name
        this.name = definition?.name || 'Custom Material';

        // Category for organization
        this.category = definition?.category || 'custom';

        // Base surface properties (cloned)
        this.base = definition?.base
            ? { ...definition.base }
            : { color: '#888888', roughness: 0.5, metalness: 0.0, clearcoat: 0.0, emissive: '#000000', emissiveIntensity: 0, opacity: 1 };

        // Pattern layers (deep cloned)
        this.layers = definition?.layers
            ? definition.layers.map(l => ({
                type: l.type,
                params: { ...l.params },
                blend: l.blend,
                opacity: l.opacity,
                enabled: l.enabled !== false
            }))
            : [];

        // Compiled THREE.Material (lazily created)
        this._material = null;
        this._dirty = true;

        // Track if this material has been modified from its definition
        this._modified = false;
    }

    /**
     * Get the compiled THREE.Material
     * Lazily compiles on first access or when dirty
     */
    get material() {
        if (this._dirty || !this._material) {
            this._compile();
        }
        return this._material;
    }

    /**
     * Check if this material has layers
     */
    get hasLayers() {
        return this.layers.some(l => l.enabled !== false);
    }

    /**
     * Mark the material as needing recompilation
     */
    markDirty() {
        this._dirty = true;
        this._modified = true;
    }

    // ═══════════════════════════════════════════════════════════════
    // BASE PROPERTY METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set a base property (color, roughness, metalness, clearcoat)
     */
    setBaseProperty(key, value) {
        if (this.base[key] !== value) {
            this.base[key] = value;
            this._updateMaterial();
        }
    }

    /**
     * Set the base color
     */
    setColor(color) {
        this.setBaseProperty('color', color);
    }

    /**
     * Set roughness (0-1)
     */
    setRoughness(value) {
        this.setBaseProperty('roughness', Math.max(0, Math.min(1, value)));
    }

    /**
     * Set metalness (0-1)
     */
    setMetalness(value) {
        this.setBaseProperty('metalness', Math.max(0, Math.min(1, value)));
    }

    /**
     * Set clearcoat (0-1)
     */
    setClearcoat(value) {
        this.setBaseProperty('clearcoat', Math.max(0, Math.min(1, value)));
    }

    /**
     * Set all base properties at once
     */
    setBase(base) {
        this.base = { ...this.base, ...base };
        this._updateMaterial();
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Add a new pattern layer
     * @param {string} layerType - Type from LayerType enum
     * @param {Object} params - Optional parameter overrides
     * @returns {number} Index of the new layer
     */
    addLayer(layerType, params = {}) {
        const layer = createLayer(layerType, params);
        this.layers.push(layer);
        this.markDirty();
        return this.layers.length - 1;
    }

    /**
     * Remove a layer by index
     */
    removeLayer(index) {
        if (index >= 0 && index < this.layers.length) {
            this.layers.splice(index, 1);
            this.markDirty();
        }
    }

    /**
     * Move a layer to a new position
     */
    moveLayer(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.layers.length) return;
        if (toIndex < 0 || toIndex >= this.layers.length) return;

        const [layer] = this.layers.splice(fromIndex, 1);
        this.layers.splice(toIndex, 0, layer);
        this.markDirty();
    }

    /**
     * Get a layer by index
     */
    getLayer(index) {
        return this.layers[index] || null;
    }

    /**
     * Set a layer parameter
     */
    setLayerParam(layerIndex, key, value) {
        const layer = this.layers[layerIndex];
        if (layer && layer.params[key] !== value) {
            layer.params[key] = value;
            this._updateMaterial();
        }
    }

    /**
     * Set layer blend mode
     */
    setLayerBlend(layerIndex, blendMode) {
        const layer = this.layers[layerIndex];
        if (layer && layer.blend !== blendMode) {
            layer.blend = blendMode;
            this.markDirty(); // Blend mode change requires recompile
        }
    }

    /**
     * Set layer opacity
     */
    setLayerOpacity(layerIndex, opacity) {
        const layer = this.layers[layerIndex];
        if (layer) {
            layer.opacity = Math.max(0, Math.min(1, opacity));
            this._updateMaterial();
        }
    }

    /**
     * Enable/disable a layer
     */
    setLayerEnabled(layerIndex, enabled) {
        const layer = this.layers[layerIndex];
        if (layer && layer.enabled !== enabled) {
            layer.enabled = enabled;
            this.markDirty(); // Enabling/disabling requires recompile
        }
    }

    /**
     * Replace a layer's parameters entirely
     */
    setLayerParams(layerIndex, params) {
        const layer = this.layers[layerIndex];
        if (layer) {
            layer.params = validateLayerParams(layer.type, params);
            this._updateMaterial();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // COMPILATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Compile the material (internal)
     */
    _compile() {
        // Dispose old material if exists
        if (this._material) {
            this._material.dispose();
        }

        // Build new material
        this._material = buildMaterial(this.base, this.layers);
        this._dirty = false;
    }

    /**
     * Update material without full recompile (for uniform changes)
     */
    _updateMaterial() {
        this._modified = true;

        if (!this._material) {
            this._dirty = true;
            return;
        }

        // If it's a shader material, we can update uniforms
        if (this._material.uniforms) {
            updateShaderUniforms(this._material, this.base, this.layers);
        } else if (this._material.isMeshPhysicalMaterial) {
            // Update MeshPhysicalMaterial properties directly
            this._material.color.set(this.base.color);
            this._material.roughness = this.base.roughness;
            this._material.metalness = this.base.metalness;
            this._material.clearcoat = this.base.clearcoat;
            // Update emissive properties
            if (this.base.emissive) {
                this._material.emissive.set(this.base.emissive);
            }
            this._material.emissiveIntensity = this.base.emissiveIntensity || 0;
            // Update opacity
            const opacity = this.base.opacity ?? 1;
            this._material.opacity = opacity;
            this._material.transparent = opacity < 1;
            this._material.needsUpdate = true;
        } else {
            // Unknown material type, force recompile
            this._dirty = true;
        }
    }

    /**
     * Force a full recompile
     */
    recompile() {
        this.markDirty();
        return this.material;
    }

    // ═══════════════════════════════════════════════════════════════
    // CLONING & SERIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Create a deep clone of this material
     */
    clone() {
        const cloned = new LayeredMaterial();
        cloned.definitionId = this.definitionId;
        cloned.name = this.name + ' (Copy)';
        cloned.category = this.category;
        cloned.base = { ...this.base };
        cloned.layers = this.layers.map(l => ({
            type: l.type,
            params: { ...l.params },
            blend: l.blend,
            opacity: l.opacity,
            enabled: l.enabled
        }));
        cloned._dirty = true;
        return cloned;
    }

    /**
     * Serialize to JSON-compatible object
     */
    serialize() {
        return {
            instanceId: this.instanceId,
            definitionId: this.definitionId,
            name: this.name,
            category: this.category,
            base: { ...this.base },
            layers: this.layers.map(l => ({
                type: l.type,
                params: { ...l.params },
                blend: l.blend,
                opacity: l.opacity,
                enabled: l.enabled
            })),
            modified: this._modified
        };
    }

    /**
     * Create from serialized data
     */
    static deserialize(data) {
        const mat = new LayeredMaterial();
        mat.instanceId = data.instanceId || mat.instanceId;
        mat.definitionId = data.definitionId;
        mat.name = data.name;
        mat.category = data.category || 'custom';
        mat.base = { ...data.base };
        mat.layers = (data.layers || []).map(l => ({
            type: l.type,
            params: { ...l.params },
            blend: l.blend,
            opacity: l.opacity,
            enabled: l.enabled !== false
        }));
        mat._dirty = true;
        mat._modified = data.modified || false;
        return mat;
    }

    /**
     * Reset to original definition (if has one)
     */
    resetToDefinition(library) {
        if (!this.definitionId || !library) return false;

        const def = library.getDefinition(this.definitionId);
        if (!def) return false;

        this.base = { ...def.base };
        this.layers = (def.layers || []).map(l => ({
            type: l.type,
            params: { ...l.params },
            blend: l.blend,
            opacity: l.opacity,
            enabled: l.enabled !== false
        }));
        this._modified = false;
        this.markDirty();
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get a preview color for UI swatches
     * Returns the base color (layers aren't easily previewable)
     */
    getPreviewColor() {
        return this.base.color;
    }

    /**
     * Check if this material matches a definition
     */
    matchesDefinition(definition) {
        if (!definition) return false;

        // Check base properties
        if (this.base.color !== definition.base.color) return false;
        if (this.base.roughness !== definition.base.roughness) return false;
        if (this.base.metalness !== definition.base.metalness) return false;
        if (this.base.clearcoat !== definition.base.clearcoat) return false;

        // Check layers
        const defLayers = definition.layers || [];
        if (this.layers.length !== defLayers.length) return false;

        for (let i = 0; i < this.layers.length; i++) {
            const a = this.layers[i];
            const b = defLayers[i];
            if (a.type !== b.type) return false;
            if (a.blend !== b.blend) return false;
            if (a.opacity !== b.opacity) return false;

            // Check params
            const aKeys = Object.keys(a.params);
            const bKeys = Object.keys(b.params);
            if (aKeys.length !== bKeys.length) return false;
            for (const key of aKeys) {
                if (a.params[key] !== b.params[key]) return false;
            }
        }

        return true;
    }

    /**
     * Dispose of Three.js resources
     */
    dispose() {
        if (this._material) {
            this._material.dispose();
            this._material = null;
        }
    }

    /**
     * Sync material lighting uniforms with scene lights
     * Call this when scene lights change or when material is applied to mesh
     * @param {THREE.Scene} scene - The scene containing lights
     */
    syncWithSceneLights(scene) {
        if (this._material && this._material.uniforms) {
            updateLightingUniforms(this._material, scene);
        }
    }
}
