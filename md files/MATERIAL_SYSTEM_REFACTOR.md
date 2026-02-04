# Material System Refactor Plan

## Overview

This document outlines the architecture for a refactored material system that supports:
- Base color with per-material surface properties (roughness, metalness, clearcoat)
- Multiple pattern layers (e.g., brick pattern + noise overlay)
- Proper material inventory with creation, editing, and deletion
- Clean separation of concerns

---

## Current Problems

1. **Global Surface Properties**: Roughness/clearcoat are controlled by global sliders, not per-material
2. **No Layer Support**: Materials are single-type only (solid OR brick OR noise)
3. **Tight Coupling**: Material logic scattered across main.js, VoxelEditor.js, VoxelWorld.js
4. **Shader Lighting**: Procedural materials use hardcoded lighting, ignoring scene lights
5. **Redundant Instances**: Same material creates new ProceduralMaterial for every voxel
6. **Incomplete Serialization**: Custom material edits are lost on save/load

---

## New Architecture

### Core Concepts

```
MaterialDefinition (immutable template)
    ↓ instantiate
LayeredMaterial (configured instance with layers)
    ↓ compile
THREE.Material (GPU-ready material)
```

### 1. MaterialDefinition

The base template for a material. Stored in the library, never modified directly.

```javascript
// MaterialDefinition - stored in library
{
    id: 'red-brick',
    name: 'Red Brick',
    category: 'pattern',

    // Base layer (always present)
    base: {
        color: '#c0392b',
        roughness: 0.8,
        metalness: 0.0,
        clearcoat: 0.0
    },

    // Pattern layers (optional, stackable)
    layers: [
        {
            type: 'brick',
            params: {
                mortarColor: '#888888',
                mortarThickness: 0.02,
                brickScale: [4, 8],
                offset: 0.5
            },
            blend: 'multiply',  // or 'overlay', 'add', 'replace'
            opacity: 1.0
        }
    ]
}
```

### 2. LayeredMaterial Class

A configured instance of a material, potentially with user modifications.

```javascript
class LayeredMaterial {
    constructor(definition) {
        this.id = definition.id;
        this.definitionId = definition.id;  // Reference to source
        this.name = definition.name;

        // Cloned base properties (can be modified)
        this.base = { ...definition.base };

        // Cloned layers (can be added/removed/modified)
        this.layers = definition.layers.map(l => ({ ...l, params: { ...l.params } }));

        // Compiled THREE.Material (lazily created)
        this._material = null;
        this._dirty = true;
    }

    // Get the compiled THREE.Material
    get material() {
        if (this._dirty) {
            this._compile();
        }
        return this._material;
    }

    // Modify base properties
    setBaseProperty(key, value) {
        this.base[key] = value;
        this._dirty = true;
    }

    // Add a pattern layer
    addLayer(layerDef) {
        this.layers.push({ ...layerDef, params: { ...layerDef.params } });
        this._dirty = true;
    }

    // Remove a layer by index
    removeLayer(index) {
        this.layers.splice(index, 1);
        this._dirty = true;
    }

    // Modify layer parameters
    setLayerParam(layerIndex, key, value) {
        this.layers[layerIndex].params[key] = value;
        this._dirty = true;
    }

    // Compile to THREE.Material
    _compile() {
        // Generate shader or use MeshPhysicalMaterial based on layers
        if (this.layers.length === 0) {
            // Simple solid - use MeshPhysicalMaterial
            this._material = new THREE.MeshPhysicalMaterial({
                color: this.base.color,
                roughness: this.base.roughness,
                metalness: this.base.metalness,
                clearcoat: this.base.clearcoat,
                flatShading: true,
                side: THREE.DoubleSide
            });
        } else {
            // Has layers - generate combined shader
            this._material = this._buildLayeredShader();
        }
        this._dirty = false;
    }

    _buildLayeredShader() {
        // Generate GLSL that combines base color with all layers
        // Each layer contributes to the final color based on blend mode
        // ...
    }

    // Serialize for save
    serialize() {
        return {
            definitionId: this.definitionId,
            base: { ...this.base },
            layers: this.layers.map(l => ({ ...l, params: { ...l.params } }))
        };
    }

    // Deserialize from save
    static deserialize(data, library) {
        const def = library.getDefinition(data.definitionId);
        const mat = new LayeredMaterial(def || { id: data.definitionId, base: data.base, layers: [] });
        mat.base = { ...data.base };
        mat.layers = data.layers.map(l => ({ ...l, params: { ...l.params } }));
        mat._dirty = true;
        return mat;
    }
}
```

### 3. MaterialLibrary Refactor

```javascript
class MaterialLibrary {
    constructor() {
        // Immutable definitions (templates)
        this.definitions = new Map();

        // User's material inventory (configured instances)
        this.inventory = new Map();

        // Material instance cache (for sharing)
        this.instanceCache = new Map();
    }

    // Load default definitions
    loadDefaults() {
        for (const [id, def] of Object.entries(DefaultMaterialDefinitions)) {
            this.definitions.set(id, Object.freeze(def));
        }
    }

    // Get a definition (template)
    getDefinition(id) {
        return this.definitions.get(id);
    }

    // Add to user's inventory (creates a LayeredMaterial)
    addToInventory(definitionId, customName = null) {
        const def = this.definitions.get(definitionId);
        if (!def) return null;

        const material = new LayeredMaterial(def);
        if (customName) material.name = customName;

        const inventoryId = this._generateInventoryId();
        this.inventory.set(inventoryId, material);
        return inventoryId;
    }

    // Get from inventory
    getFromInventory(inventoryId) {
        return this.inventory.get(inventoryId);
    }

    // Create custom material from scratch
    createCustom(name, base, layers = []) {
        const def = {
            id: this._generateDefinitionId(),
            name,
            category: 'custom',
            base,
            layers
        };
        this.definitions.set(def.id, def);
        return this.addToInventory(def.id);
    }

    // Get or create shared instance (for voxels)
    getSharedInstance(inventoryId) {
        if (this.instanceCache.has(inventoryId)) {
            return this.instanceCache.get(inventoryId);
        }
        const material = this.inventory.get(inventoryId);
        if (material) {
            this.instanceCache.set(inventoryId, material);
        }
        return material;
    }

    // Serialize inventory
    serializeInventory() {
        const data = {};
        for (const [id, mat] of this.inventory) {
            data[id] = mat.serialize();
        }
        return data;
    }

    // Deserialize inventory
    deserializeInventory(data) {
        this.inventory.clear();
        this.instanceCache.clear();
        for (const [id, matData] of Object.entries(data)) {
            this.inventory.set(id, LayeredMaterial.deserialize(matData, this));
        }
    }
}
```

### 4. Layer Types

Each layer type has specific parameters:

```javascript
const LayerTypes = {
    brick: {
        name: 'Brick',
        params: {
            mortarColor: { type: 'color', default: '#888888' },
            mortarThickness: { type: 'range', min: 0.01, max: 0.1, default: 0.02 },
            brickWidth: { type: 'range', min: 1, max: 10, default: 4 },
            brickHeight: { type: 'range', min: 1, max: 10, default: 8 },
            offset: { type: 'range', min: 0, max: 1, default: 0.5 }
        }
    },
    checker: {
        name: 'Checker',
        params: {
            color2: { type: 'color', default: '#ffffff' },
            scale: { type: 'range', min: 1, max: 20, default: 4 }
        }
    },
    noise: {
        name: 'Noise',
        params: {
            color2: { type: 'color', default: '#ffffff' },
            scale: { type: 'range', min: 0.5, max: 10, default: 2 },
            contrast: { type: 'range', min: 0, max: 2, default: 1 }
        }
    },
    gradient: {
        name: 'Gradient',
        params: {
            color2: { type: 'color', default: '#000000' },
            direction: { type: 'select', options: ['vertical', 'horizontal'], default: 'vertical' }
        }
    },
    woodGrain: {
        name: 'Wood Grain',
        params: {
            grainColor: { type: 'color', default: '#5a3d2b' },
            grainScale: { type: 'range', min: 1, max: 20, default: 8 },
            grainStrength: { type: 'range', min: 0, max: 1, default: 0.5 }
        }
    },
    weave: {
        name: 'Weave/Fabric',
        params: {
            color2: { type: 'color', default: '#333333' },
            scale: { type: 'range', min: 5, max: 50, default: 20 }
        }
    }
};

const BlendModes = {
    replace: 'Replace base color completely',
    multiply: 'Darken (multiply colors)',
    overlay: 'Overlay blend',
    add: 'Lighten (add colors)',
    mix: 'Linear interpolation by opacity'
};
```

### 5. Voxel Material Storage

Simplified voxel storage:

```javascript
class Voxel {
    constructor(x, y, z, corners = null) {
        // ... existing properties ...

        // Material reference (just the inventory ID)
        this.materialId = null;
    }

    serialize() {
        return {
            x: this.x, y: this.y, z: this.z,
            corners: this.corners.map(c => [...c]),
            flipped: [...this.faceFlipped],
            materialId: this.materialId
        };
    }
}
```

### 6. MaterialManager (New Class)

Centralizes all material operations:

```javascript
class MaterialManager {
    constructor(voxelWorld, library) {
        this.world = voxelWorld;
        this.library = library;

        // Current active materials
        this.buildMaterialId = null;   // For Build tool
        this.paintMaterialId = null;   // For Paint tool

        // Event emitter for UI updates
        this.onMaterialChanged = null;
    }

    // Set the active material for building
    setBuildMaterial(inventoryId) {
        this.buildMaterialId = inventoryId;
        this.onMaterialChanged?.('build', inventoryId);
    }

    // Set the active material for painting
    setPaintMaterial(inventoryId) {
        this.paintMaterialId = inventoryId;
        this.onMaterialChanged?.('paint', inventoryId);
    }

    // Apply material to a voxel
    applyMaterialToVoxel(voxel, inventoryId = null) {
        const id = inventoryId || this.paintMaterialId;
        if (!id) return;

        voxel.materialId = id;
        const material = this.library.getSharedInstance(id);
        this.world.updateVoxelMesh(voxel, material);
    }

    // Get material for rendering a voxel
    getMaterialForVoxel(voxel) {
        if (voxel.materialId) {
            const material = this.library.getSharedInstance(voxel.materialId);
            if (material) return material.material;
        }
        // Fallback to default
        return this.world.defaultMaterial;
    }

    // Create material for new voxel (Build tool)
    createVoxelWithMaterial(x, y, z) {
        const voxel = this.world.addVoxel(x, y, z);
        if (this.buildMaterialId) {
            voxel.materialId = this.buildMaterialId;
        }
        return voxel;
    }

    // Inherit material from source (Extrusion)
    inheritMaterial(sourceVoxel, newVoxel) {
        if (sourceVoxel.materialId) {
            newVoxel.materialId = sourceVoxel.materialId;
        } else if (this.buildMaterialId) {
            newVoxel.materialId = this.buildMaterialId;
        }
    }
}
```

---

## UI Changes

### 1. Remove Global Roughness/Clearcoat Sliders

The current sliders in Settings should be removed. Surface properties are now per-material.

### 2. Material Panel Redesign

```
┌─────────────────────────────────┐
│ MATERIALS           [+] [gear] │
├─────────────────────────────────┤
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ │
│ │   │ │   │ │   │ │   │ │   │ │  ← Inventory swatches
│ └───┘ └───┘ └───┘ └───┘ └───┘ │
│                                 │
│ ─── Add from Library ───       │
│ [Solids ▼]  [Patterns ▼]       │
│ [Metals ▼]  [Custom ▼]         │
└─────────────────────────────────┘
```

### 3. Material Editor (on double-click)

```
┌─────────────────────────────────────┐
│ Edit Material: Red Brick    [×]    │
├─────────────────────────────────────┤
│ BASE PROPERTIES                     │
│ Color:      [#c0392b] [picker]     │
│ Roughness:  ═══════●═══  0.80      │
│ Metalness:  ●═══════════  0.00     │
│ Clearcoat:  ●═══════════  0.00     │
├─────────────────────────────────────┤
│ PATTERN LAYERS                      │
│ ┌─────────────────────────────────┐ │
│ │ [≡] Brick Pattern        [🗑]  │ │
│ │   Mortar: [#888] Thick: 0.02  │ │
│ │   Scale: 4×8  Offset: 0.5     │ │
│ │   Blend: [Multiply ▼] Op: 1.0 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [+ Add Layer]                       │
├─────────────────────────────────────┤
│ [Cancel]              [Save Copy]   │
│                       [Apply]       │
└─────────────────────────────────────┘
```

### 4. Add Layer Dialog

```
┌───────────────────────────────┐
│ Add Pattern Layer             │
├───────────────────────────────┤
│ ○ Brick                       │
│ ○ Checker                     │
│ ○ Noise                       │
│ ○ Gradient                    │
│ ○ Wood Grain                  │
│ ○ Weave                       │
├───────────────────────────────┤
│ [Cancel]        [Add Layer]   │
└───────────────────────────────┘
```

---

## Migration Path

### Phase 1: Core Classes
1. Create `LayeredMaterial.js` with the new class
2. Create `MaterialManager.js`
3. Update `MaterialLibrary` to use new structure
4. Define `DefaultMaterialDefinitions` in new format

### Phase 2: Integration
1. Update `VoxelWorld.updateVoxelMesh()` to use MaterialManager
2. Update `VoxelEditor` to use MaterialManager for all operations
3. Remove global roughness/clearcoat from `main.js`
4. Simplify Voxel class (just store `materialId`)

### Phase 3: UI
1. Build new Material Editor modal
2. Add layer management UI
3. Update material panel with inventory management
4. Add "Add from Library" dropdown menus

### Phase 4: Shader System
1. Implement layer blending in GLSL
2. Integrate with Three.js lighting properly
3. Support multiple layer types in a single shader

### Phase 5: Testing & Polish
1. Test save/load with new format
2. Test all layer combinations
3. Migrate default materials to new format
4. Performance optimization (material caching)

---

## Default Material Definitions (New Format)

```javascript
const DefaultMaterialDefinitions = {
    // Solids
    'solid-white': {
        id: 'solid-white',
        name: 'White',
        category: 'solid',
        base: { color: '#ffffff', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-gray': {
        id: 'solid-gray',
        name: 'Gray',
        category: 'solid',
        base: { color: '#888888', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    // ... other solids ...

    // Patterns
    'red-brick': {
        id: 'red-brick',
        name: 'Red Brick',
        category: 'pattern',
        base: { color: '#c0392b', roughness: 0.8, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: 'brick',
                params: { mortarColor: '#888888', mortarThickness: 0.02, brickWidth: 4, brickHeight: 8, offset: 0.5 },
                blend: 'multiply',
                opacity: 1.0
            }
        ]
    },
    'oak-wood': {
        id: 'oak-wood',
        name: 'Oak Wood',
        category: 'pattern',
        base: { color: '#8b5a2b', roughness: 0.6, metalness: 0.0, clearcoat: 0.2 },
        layers: [
            {
                type: 'woodGrain',
                params: { grainColor: '#5a3d2b', grainScale: 8, grainStrength: 0.5 },
                blend: 'multiply',
                opacity: 1.0
            }
        ]
    },

    // Metals
    'polished-steel': {
        id: 'polished-steel',
        name: 'Polished Steel',
        category: 'metal',
        base: { color: '#c0c0c0', roughness: 0.2, metalness: 0.95, clearcoat: 0.0 },
        layers: []
    },
    'brushed-gold': {
        id: 'brushed-gold',
        name: 'Brushed Gold',
        category: 'metal',
        base: { color: '#ffd700', roughness: 0.4, metalness: 0.9, clearcoat: 0.0 },
        layers: [
            {
                type: 'noise',
                params: { color2: '#daa520', scale: 0.5, contrast: 0.3 },
                blend: 'overlay',
                opacity: 0.3
            }
        ]
    }
};
```

---

## File Structure After Refactor

```
EditVoxel/
├── materials/
│   ├── LayeredMaterial.js      # New - material instance class
│   ├── MaterialManager.js      # New - centralized material operations
│   ├── MaterialLibrary.js      # Refactored - definitions + inventory
│   ├── MaterialDefinitions.js  # New - default material templates
│   ├── LayerTypes.js           # New - layer type definitions
│   └── ShaderBuilder.js        # New - generates combined shaders
├── VoxelWorld.js               # Simplified material handling
├── VoxelEditor.js              # Uses MaterialManager
├── Voxel.js                    # Simplified (just materialId)
├── main.js                     # UI logic, uses MaterialManager
└── index.html                  # Updated UI
```

---

## Summary

This refactor provides:

1. **Per-material properties**: Each material has its own roughness, metalness, clearcoat
2. **Layer stacking**: Base color + any number of pattern layers
3. **Clean architecture**: MaterialManager centralizes all operations
4. **Efficient sharing**: Materials are instantiated once, shared across voxels
5. **Full serialization**: Complete material state saved, not just IDs
6. **Extensible**: Easy to add new layer types

The key insight is separating:
- **Definitions** (immutable templates in library)
- **Instances** (configured materials in inventory)
- **References** (voxels just store inventory ID)
