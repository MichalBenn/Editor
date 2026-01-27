# EditVoxel Data Format Specification

## Overview

EditVoxel uses a corner-based voxel representation where each voxel is defined by the 3D positions of its 8 corners. This allows for sub-voxel detail including bevels, slopes, and indentations.

## Voxel Structure

### Position

Each voxel has an integer grid position:

```json
{
  "x": 0,
  "y": 0,
  "z": 0
}
```

### Corners

Each voxel has 8 corners, stored as an array of [x, y, z] coordinates relative to the voxel center. Values range from -0.5 to +0.5.

#### Corner Indices

```
Corner Index    Name              Default Position
-------------------------------------------------
0               TopLeftFront      [-0.5,  0.5, -0.5]
1               TopRightFront     [ 0.5,  0.5, -0.5]
2               TopRightBack      [ 0.5,  0.5,  0.5]
3               TopLeftBack       [-0.5,  0.5,  0.5]
4               BottomLeftBack    [-0.5, -0.5,  0.5]
5               BottomRightBack   [ 0.5, -0.5,  0.5]
6               BottomRightFront  [ 0.5, -0.5, -0.5]
7               BottomLeftFront   [-0.5, -0.5, -0.5]
```

#### Visual Corner Layout

```
Top Face (Y = +0.5):          Bottom Face (Y = -0.5):

    3 -------- 2                  4 -------- 5
    |          |                  |          |
    |   TOP    |                  |  BOTTOM  |
    |          |                  |          |
    0 -------- 1                  7 -------- 6

    (Front at Z = -0.5)           (Front at Z = -0.5)
```

## Face Definitions

### Face Enum

```javascript
Face = {
  Top: 0,     // +Y direction
  Bottom: 1,  // -Y direction
  Front: 2,   // -Z direction
  Back: 3,    // +Z direction
  Left: 4,    // -X direction
  Right: 5    // +X direction
}
```

### Face Corner Mapping

Each face is defined by 4 corners in counter-clockwise winding order:

```javascript
FACE_CORNERS = {
  Top:    [0, 1, 2, 3],  // TopLeftFront, TopRightFront, TopRightBack, TopLeftBack
  Bottom: [7, 6, 5, 4],  // BottomLeftFront, BottomRightFront, BottomRightBack, BottomLeftBack
  Front:  [7, 0, 1, 6],  // BottomLeftFront, TopLeftFront, TopRightFront, BottomRightFront
  Back:   [5, 2, 3, 4],  // BottomRightBack, TopRightBack, TopLeftBack, BottomLeftBack
  Left:   [4, 3, 0, 7],  // BottomLeftBack, TopLeftBack, TopLeftFront, BottomLeftFront
  Right:  [6, 1, 2, 5]   // BottomRightFront, TopRightFront, TopRightBack, BottomRightBack
}
```

### Face Normals (Axis)

```javascript
FACE_AXIS = {
  Top:    [0,  1,  0],   // +Y
  Bottom: [0, -1,  0],   // -Y
  Front:  [0,  0, -1],   // -Z
  Back:   [0,  0,  1],   // +Z
  Left:   [-1, 0,  0],   // -X
  Right:  [1,  0,  0]    // +X
}
```

## Edge Definitions

### Edge Enum (Relative to Face)

```javascript
Edge = {
  None: 0,
  Front: 1,   // Edge toward front of face
  Back: 2,    // Edge toward back of face
  Left: 3,    // Edge toward left of face
  Right: 4    // Edge toward right of face
}
```

### Face Edge Corner Mapping

For each face, edges are defined by local corner indices [0-3]:

```javascript
FACE_EDGE_CORNERS = {
  Front: [0, 1],  // First edge of face
  Back:  [2, 3],  // Opposite edge
  Left:  [3, 0],  // Left edge
  Right: [1, 2]   // Right edge
}
```

## Serialization Format

### Single Voxel

```json
{
  "x": 0,
  "y": 0,
  "z": 0,
  "corners": [
    [-0.5,  0.5, -0.5],
    [ 0.5,  0.5, -0.5],
    [ 0.5,  0.5,  0.5],
    [-0.5,  0.5,  0.5],
    [-0.5, -0.5,  0.5],
    [ 0.5, -0.5,  0.5],
    [ 0.5, -0.5, -0.5],
    [-0.5, -0.5, -0.5]
  ]
}
```

### World State

```json
{
  "voxels": [
    {
      "x": 0,
      "y": 0,
      "z": 0,
      "corners": [...]
    },
    {
      "x": 1,
      "y": 0,
      "z": 0,
      "corners": [...]
    }
  ]
}
```

## Examples

### Default Unit Cube

All corners at their default positions (-0.5 or +0.5):

```json
{
  "x": 0, "y": 0, "z": 0,
  "corners": [
    [-0.5,  0.5, -0.5],
    [ 0.5,  0.5, -0.5],
    [ 0.5,  0.5,  0.5],
    [-0.5,  0.5,  0.5],
    [-0.5, -0.5,  0.5],
    [ 0.5, -0.5,  0.5],
    [ 0.5, -0.5, -0.5],
    [-0.5, -0.5, -0.5]
  ]
}
```

### Top Face Indented by 0.25

Top face corners (0,1,2,3) have Y reduced from 0.5 to 0.25:

```json
{
  "x": 0, "y": 0, "z": 0,
  "corners": [
    [-0.5,  0.25, -0.5],
    [ 0.5,  0.25, -0.5],
    [ 0.5,  0.25,  0.5],
    [-0.5,  0.25,  0.5],
    [-0.5, -0.5,   0.5],
    [ 0.5, -0.5,   0.5],
    [ 0.5, -0.5,  -0.5],
    [-0.5, -0.5,  -0.5]
  ]
}
```

### Front Edge of Top Face Beveled

Only front edge corners (0,1) of top face have Y reduced:

```json
{
  "x": 0, "y": 0, "z": 0,
  "corners": [
    [-0.5,  0.25, -0.5],
    [ 0.5,  0.25, -0.5],
    [ 0.5,  0.5,   0.5],
    [-0.5,  0.5,   0.5],
    [-0.5, -0.5,   0.5],
    [ 0.5, -0.5,   0.5],
    [ 0.5, -0.5,  -0.5],
    [-0.5, -0.5,  -0.5]
  ]
}
```

### Collapsed Voxel (Zero Volume)

When extending, voxels start collapsed with all face corners at the boundary:

```json
{
  "x": 1, "y": 0, "z": 0,
  "corners": [
    [-0.5,  0.5, -0.5],
    [-0.5,  0.5, -0.5],
    [-0.5,  0.5,  0.5],
    [-0.5,  0.5,  0.5],
    [-0.5, -0.5,  0.5],
    [-0.5, -0.5,  0.5],
    [-0.5, -0.5, -0.5],
    [-0.5, -0.5, -0.5]
  ]
}
```

(All right-side corners collapsed to X = -0.5)

## Validation Rules

1. **Corner bounds**: All corner coordinates must be in range [-0.5, 0.5]
2. **Positive volume**: Non-collapsed voxels must have positive volume
3. **No self-intersection**: Corner positions should not cause face intersections
4. **Grid alignment**: Voxel positions (x, y, z) should be integers

## Volume Calculation

Volume is calculated using tetrahedron decomposition from the centroid:

```javascript
calculateVolume() {
  const centroid = this.getCentroid();
  let volume = 0;

  for (each face) {
    const vertices = this.getFaceVertices(face);
    // Triangulate face and sum tetrahedron volumes
    for (each triangle in face) {
      volume += tetrahedronVolume(centroid, v0, v1, v2);
    }
  }

  return volume;
}
```

A voxel is considered "collapsed" when volume < 0.001.
