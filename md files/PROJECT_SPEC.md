# EditVoxel - Sub-Voxel Editor

## Overview

EditVoxel is a browser-based 3D sub-voxel editor built with Three.js. Unlike traditional voxel editors that work with whole blocks, EditVoxel allows manipulation of individual faces, edges, and corners within each voxel unit, enabling smooth bevels, slopes, and detailed geometry.

## Core Concepts

### Sub-Voxel Editing

Each voxel is defined by 8 corner vertices that can be independently positioned within a 1x1x1 unit space. This allows for:

- **Face indentation**: Push faces inward in 4 discrete steps (0.25 units each)
- **Edge beveling**: Create slopes and chamfers by moving edge pairs
- **Shape inheritance**: New voxels inherit the shape of adjacent faces when extruding

### Coordinate System

- Y-axis is up
- Voxels are positioned at integer coordinates (x, y, z)
- Corner positions range from -0.5 to +0.5 relative to voxel center
- Grid plane sits at Y = -0.5 (bottom of voxel space)

## Features

### Editing Operations

| Operation | Input | Description |
|-----------|-------|-------------|
| Face drag | Left click + drag on face | Push/pull face in 0.25 unit steps |
| Edge drag | Left click + drag near edge | Bevel edge in 0.25 unit steps |
| Click-to-extrude | Click on boundary face | Create new voxel in empty neighbor space |
| Click-to-extend | Click on indented face | Push face to voxel boundary |
| Auto-indent | Drag face inward past collapse | Continue indenting into next voxel |

### Shape Inheritance

When extruding a voxel, the new voxel inherits:
- Face indentations from perpendicular faces
- Edge bevels from the source voxel
- Proper corner positioning for seamless geometry

### Mirror Mode

Symmetrical editing across a mirror plane:

- **Mirror with Cleanup**: Deletes geometry on mirrored side, mirrors from source
- **Start Clean Model**: Creates fresh model with mirror enabled
- **Disable Mirror**: Converts mirrored geometry to real editable voxels
- Extrusion automatically stops at mirror boundary

### Visual Feedback

- **Hover indicators**: Green overlay shows face/edge/corner under cursor
- **Pulsing effect**: Indicators pulse for visibility
- **Fade on drag**: Indicators fade when editing begins
- **Mirror plane**: Semi-transparent plane shows mirror boundary

## Controls

| Input | Action |
|-------|--------|
| Left click + drag | Edit face/edge |
| Right click + drag | Orbit camera |
| Middle click + drag | Pan camera |
| Scroll wheel | Zoom |
| Space | Fly camera up |
| C | Fly camera down |
| M | Toggle mirror mode |

## Technical Architecture

### File Structure

```
EditVoxel/
├── index.html          # Main HTML with UI elements
├── main.js             # Scene setup, controls, animation loop
├── Voxel.js            # Voxel data structure and manipulation
├── VoxelWorld.js       # World management, rendering, mirroring
├── VoxelEditor.js      # Input handling, editing operations
└── VoxelGeometryBuilder.js  # Geometry generation from voxel data
```

### Key Classes

#### Voxel
- Stores 8 corner positions
- Handles face/edge movement with boundary detection
- Calculates volume for collapse detection
- Serialization/deserialization support

#### VoxelWorld
- Manages collection of voxels (Map by coordinate key)
- Handles mesh creation and updates
- Mirror mode rendering and management
- Material management

#### VoxelEditor
- Raycasting for hit detection
- Drag handling with step snapping
- Extension and indentation logic
- Hover indicator system

#### VoxelGeometryBuilder
- Converts voxel corner data to Three.js geometry
- Handles triangulation of non-planar faces
- Stores face ID attribute for proper face detection on beveled surfaces

## Rendering

### Materials

- MeshPhysicalMaterial for main voxels
- Configurable roughness and clearcoat
- Flat shading for faceted look
- Shadow casting and receiving

### Lighting

- Directional light (main, configurable)
- Ambient light (configurable)
- Fill light (subtle blue tint)
- All parameters adjustable via UI sliders

### Background

- Gradient from cyan (#00d2ff) to purple-blue (#3a47d5)
- Top to bottom gradient using canvas texture

## Future Considerations

- Corner editing (visual indicator exists, editing not implemented)
- Multiple material/color support
- Undo/redo system
- Export to common 3D formats
- Touch/mobile support
