# Implementation Plan: Model Layer System

## Overview

Add a new layer system that allows users to create independent voxel models that can be edited, then placed/moved/rotated/scaled in the world.

## Core Concepts

- **World Layer**: Current terrain/world voxels (default editing context)
- **Model Layer**: Independent voxel objects that can be transformed
- **Model Edit Mode**: Dedicated state for editing a specific model's voxels
- **World Edit Mode**: Default state for editing terrain

## Architecture

### New Files

#### 1. `VoxelModel.js` - Model class
```javascript
class VoxelModel {
    constructor(id, position, materialManager) {
        this.id = id;
        this.position = position;  // World position
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1 };

        // Each model has its own VoxelWorld for voxel storage
        this.voxelWorld = new VoxelWorld(scene, materialManager);

        // THREE.Group for world-space transform
        this.meshGroup = new THREE.Group();

        // Start with one default voxel at origin
        this.voxelWorld.addVoxel(0, 0, 0);
    }

    // Sync mesh group transform from properties
    updateTransform() { ... }

    // Sync properties from mesh group (after gizmo manipulation)
    syncFromMesh() { ... }

    // Serialization
    serialize() { ... }
    static deserialize(data, materialManager) { ... }
}
```

#### 2. `ModelManager.js` - Manages all models
```javascript
class ModelManager {
    constructor(scene) {
        this.models = new Map();  // id -> VoxelModel
        this.selectedModel = null;
        this.modelGroup = new THREE.Group();  // Contains all model meshes
        scene.add(this.modelGroup);
    }

    createModel(position) { ... }
    deleteModel(id) { ... }
    selectModel(model) { ... }
    deselectModel() { ... }

    // For raycasting model selection
    getSelectableMeshes() { ... }

    serialize() { ... }
    deserialize(data) { ... }
}
```

### Modified Files

#### 3. `VoxelEditor.js` - Add editing context
```javascript
// New properties
this.editingContext = this.world;  // Points to active VoxelWorld
this.isEditingModel = false;
this.currentModel = null;

// New method to switch context
setEditingContext(voxelWorld, model = null) {
    this.editingContext = voxelWorld;
    this.isEditingModel = model !== null;
    this.currentModel = model;
    this.clearFaceSelection();
}

// Update all operations to use this.editingContext instead of this.world
// Example: this.world.addVoxel() -> this.editingContext.addVoxel()
```

#### 4. `main.js` - UI and mode switching
```javascript
// Initialize ModelManager
const modelManager = new ModelManager(scene);

// Edit mode management
function enterModelEdit(model) {
    // Fade world voxels
    setWorldOpacity(0.15);

    // Set editor context to model's voxelWorld
    voxelEditor.setEditingContext(model.voxelWorld, model);

    // Update UI
    showModelEditUI();
}

function exitModelEdit() {
    // Restore world opacity
    setWorldOpacity(1.0);

    // Return to world editing
    voxelEditor.setEditingContext(voxelWorld, null);

    // Attach transform controls to model
    if (modelManager.selectedModel) {
        transformControls.attach(modelManager.selectedModel.meshGroup);
    }

    // Update UI
    hideModelEditUI();
}
```

#### 5. `index.html` - UI elements
- Add "Create Model" button to toolbar (after Fill Extrude)
- Add Models panel (similar to Items panel)
- Add model edit toolbar with "Exit Model" button

## Visual Behavior

### When Editing World (default)
- World voxels at full opacity
- Models visible as solid objects
- Click model to select it
- Use gizmo to transform selected model
- Double-click model to enter Model Edit mode

### When Editing Model
- World voxels faded to 15% opacity (reference only)
- Active model at full opacity
- All editor tools work on model's voxels
- Model rendered at world position (can see where it will be)
- "Exit Model" button visible

## UI Components

### Toolbar Addition
```
[Build] [Delete] [Paint] [Picker] [FillExtrude] | [CreateModel] [Settings]
```

### Models Panel (right side, like Items)
```
┌─────────────────────┐
│ 🧊 Models           │
├─────────────────────┤
│ ┌─────┐ Model 1  ✎ │
│ └─────┘            🗑│
│ ┌─────┐ Model 2  ✎ │
│ └─────┘            🗑│
│                     │
│ [+ Create Model]    │
└─────────────────────┘
```
- Thumbnail preview
- Edit button (✎) to enter model edit
- Delete button (🗑)

### Model Edit Mode UI
- Show "Editing: Model X" indicator
- Show "Exit Model" button prominently
- Hide/disable model-related controls

## Keyboard Shortcuts

- `M` - Create new model at cursor position
- `Enter` or `Double-click` - Enter model edit mode (when model selected)
- `Escape` - Exit model edit mode (returns to world)
- `G` - Translate mode (for selected model)
- `R` - Rotate mode (for selected model)
- `S` - Scale mode (for selected model)

## Data Flow

### Creating a Model
1. User clicks "Create Model"
2. `modelManager.createModel(position)` creates VoxelModel
3. Model added to scene with one default voxel
4. Automatically enter Model Edit mode

### Editing a Model
1. User enters Model Edit mode
2. `voxelEditor.editingContext` set to `model.voxelWorld`
3. All editor operations (build, delete, paint, etc.) affect model
4. Undo/redo works within model's own stack

### Exiting Model Edit
1. User clicks "Exit Model" or presses Escape
2. `voxelEditor.editingContext` returns to main `voxelWorld`
3. TransformControls attached to model's meshGroup
4. World opacity restored

### Transforming a Model
1. Model selected in world view
2. TransformControls attached to `model.meshGroup`
3. User drags gizmo
4. `model.syncFromMesh()` updates position/rotation/scale

## Serialization

```javascript
// Save format includes models
{
    voxels: [...],  // World voxels (existing)
    models: [       // New: Model data
        {
            id: "model_1234",
            name: "Model 1",
            position: { x: 5, y: 0, z: 3 },
            rotation: { x: 0, y: 45, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            voxels: [...]  // Model's internal voxels
        }
    ]
}
```

## Implementation Phases

### Phase 1: Core Classes
1. Create `VoxelModel.js` class
2. Create `ModelManager.js` class
3. Test model creation and basic rendering

### Phase 2: Editor Integration
1. Add `editingContext` to VoxelEditor
2. Update all `this.world` references to `this.editingContext`
3. Add `setEditingContext()` method
4. Test editing works in both contexts

### Phase 3: Mode Switching
1. Implement `enterModelEdit()` / `exitModelEdit()` in main.js
2. Add world opacity fading
3. Connect TransformControls for model manipulation
4. Add keyboard shortcuts

### Phase 4: UI
1. Add "Create Model" button to toolbar
2. Create Models panel
3. Add model edit indicator/exit button
4. Style all new UI elements

### Phase 5: Serialization
1. Extend save/load to include models
2. Test round-trip serialization
3. Handle backward compatibility (files without models)

## Estimates

- Phase 1: ~200 lines (new files)
- Phase 2: ~100 lines (editor changes)
- Phase 3: ~150 lines (mode switching)
- Phase 4: ~200 lines (HTML/CSS/JS for UI)
- Phase 5: ~50 lines (serialization)

**Total: ~700 lines of new/modified code**
