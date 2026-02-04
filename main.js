import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { VoxelWorld } from './VoxelWorld.js?v=12';
import { VoxelEditor } from './VoxelEditor.js?v=8';
import { GameItemManager, PrimitiveType } from './GameItem.js';
import { ModelManager } from './ModelManager.js';
// Legacy material imports (kept for backward compatibility)
import { MaterialLibrary as LegacyMaterialLibrary, ProceduralMaterial, DefaultMaterials, MaterialType } from './ProceduralMaterial.js';
// New material system
import { MaterialManager, MaterialLibrary, LayeredMaterial, LayerType, BlendMode, LayerTypeDefinitions, MaterialCategory, MaterialMaker, updateElementThumbnail, ColorWheelPicker } from './materials/index.js';

// Matcap textures - using data URLs for common matcaps
const matcapData = {
    'matcap-clay': null,
    'matcap-metal': null,
    'matcap-shiny': null,
    'matcap-soft': null,
    'matcap-jade': null,
    'matcap-red': null
};

// Generate matcap textures procedurally
function createMatcapTexture(type) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    // Different color schemes for different matcaps
    let colors;
    switch (type) {
        case 'matcap-clay':
            colors = {
                highlight: '#ffffff',
                mid: '#c4a882',
                shadow: '#5a4632',
                rim: '#3d2817'
            };
            break;
        case 'matcap-metal':
            colors = {
                highlight: '#ffffff',
                mid: '#8899aa',
                shadow: '#2a3a4a',
                rim: '#111820'
            };
            break;
        case 'matcap-shiny':
            colors = {
                highlight: '#ffffff',
                mid: '#aaccff',
                shadow: '#3355aa',
                rim: '#112244'
            };
            break;
        case 'matcap-soft':
            colors = {
                highlight: '#ffffff',
                mid: '#e8e0d8',
                shadow: '#a89888',
                rim: '#786858'
            };
            break;
        case 'matcap-jade':
            colors = {
                highlight: '#e0ffee',
                mid: '#50aa80',
                shadow: '#205540',
                rim: '#0a2a1a'
            };
            break;
        case 'matcap-red':
            colors = {
                highlight: '#ffdddd',
                mid: '#cc5555',
                shadow: '#662222',
                rim: '#330a0a'
            };
            break;
        default:
            colors = {
                highlight: '#ffffff',
                mid: '#888888',
                shadow: '#333333',
                rim: '#111111'
            };
    }

    // Create radial gradient for base sphere look
    const gradient = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX, centerY, radius
    );
    gradient.addColorStop(0, colors.highlight);
    gradient.addColorStop(0.3, colors.mid);
    gradient.addColorStop(0.7, colors.shadow);
    gradient.addColorStop(1, colors.rim);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add highlight spot
    const highlightGradient = ctx.createRadialGradient(
        centerX - radius * 0.35, centerY - radius * 0.35, 0,
        centerX - radius * 0.35, centerY - radius * 0.35, radius * 0.4
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = highlightGradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// Pre-generate matcap textures
for (const key of Object.keys(matcapData)) {
    matcapData[key] = createMatcapTexture(key);
}

// Scene setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
// Gradient background (top to bottom: #00d2ff -> #3a47d5)
const canvas = document.createElement('canvas');
canvas.width = 2;
canvas.height = 512;
const ctx = canvas.getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 0, 512);
gradient.addColorStop(0, '#00d2ff');
gradient.addColorStop(1, '#3a47d5');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 2, 512);
const backgroundTexture = new THREE.CanvasTexture(canvas);
scene.background = backgroundTexture;

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(3, 4, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0);
directionalLight.position.set(-5, 11, -7);  // Light from upper-left-back for natural shadows
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -30;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = -30;
directionalLight.shadow.bias = -0.005;  // Prevent shadow acne (self-shadowing artifacts)
scene.add(directionalLight);

// Secondary fill light - subtle from opposite side
const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
fillLight.position.set(5, 2, 5);
scene.add(fillLight);

// Custom circular fading grid with segmented lines for smooth fade
function createFadingGrid(size, divisions, centerX, centerZ) {
    const group = new THREE.Group();
    const step = size / divisions;
    const halfSize = size / 2;
    const maxRadius = halfSize * 0.85; // Radius where fade reaches zero
    const segments = 10; // Segments per line for smooth gradient

    function getAlpha(x, z) {
        const dist = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
        // Fade OUT from center: full opacity at center, zero at edges
        const normalizedDist = Math.min(1, dist / maxRadius);
        return Math.max(0, 1 - normalizedDist);
    }

    // Create individual line segments with varying opacity
    function addSegment(x1, z1, x2, z2) {
        const alpha = (getAlpha(x1, z1) + getAlpha(x2, z2)) / 2;
        if (alpha < 0.01) return; // Skip invisible segments

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([x1, 0, z1, x2, 0, z2], 3));

        const material = new THREE.LineBasicMaterial({
            color: 0x334455,
            transparent: true,
            opacity: alpha * 0.7,
            depthWrite: false
        });

        group.add(new THREE.LineSegments(geometry, material));
    }

    // Grid lines along X axis (horizontal lines)
    for (let i = 0; i <= divisions; i++) {
        const z = -halfSize + i * step;

        for (let s = 0; s < segments; s++) {
            const x1 = -halfSize + (s / segments) * size;
            const x2 = -halfSize + ((s + 1) / segments) * size;
            addSegment(x1, z, x2, z);
        }
    }

    // Grid lines along Z axis (vertical lines)
    for (let i = 0; i <= divisions; i++) {
        const x = -halfSize + i * step;

        for (let s = 0; s < segments; s++) {
            const z1 = -halfSize + (s / segments) * size;
            const z2 = -halfSize + ((s + 1) / segments) * size;
            addSegment(x, z1, x, z2);
        }
    }

    return group;
}

// Grid plane - positioned at bottom of voxel space (Y = -0.5)
// Centered around origin with offset for voxel alignment
const gridHelper = createFadingGrid(30, 30, 0, 0);
gridHelper.position.set(0.5, -0.5, 0.5);
scene.add(gridHelper);

// Ground plane for shadows - larger than grid to catch all shadows
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.501; // Just below grid
ground.receiveShadow = true;
scene.add(ground);

// Orbit controls - right click for orbit
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.mouseButtons = {
    LEFT: null, // We handle left click for editing
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE
};

// Initialize voxel world and editor
const voxelWorld = new VoxelWorld(scene);
const voxelEditor = new VoxelEditor(voxelWorld, camera, renderer.domElement);

// Expose for debugging
window.voxelWorld = voxelWorld;
window.voxelEditor = voxelEditor;

// Initialize the new material system
const materialManager = new MaterialManager(voxelWorld);

// Wire up MaterialManager to VoxelWorld and VoxelEditor
voxelWorld.materialManager = materialManager;
voxelEditor.materialManager = materialManager;
// Note: modelManager.materialManager is set after modelManager is created below

// Initialize Material Maker UI
const materialMaker = new MaterialMaker(materialManager);
materialMaker.onMaterialCreated = (inventoryId, material) => {
    console.log('Material created:', inventoryId, material.name);
    refreshMaterialsUI();
    selectMaterial(inventoryId);
};
materialMaker.onMaterialUpdated = (inventoryId, material) => {
    console.log('Material updated:', inventoryId, material.name);
    materialManager.refreshMaterialVoxels(inventoryId);
    refreshMaterialsUI();
};
// Load any saved custom materials from IndexedDB
materialMaker.loadSavedMaterials().then(() => {
    console.log('Loaded saved custom materials');
    refreshMaterialsUI();
});

// Add initial voxel on top of the grid (Y=0, mesh offset makes bottom at Y=0)
const initialVoxel = voxelWorld.addVoxel(0, 0, 0);
// Apply default material to initial voxel
materialManager.applyBuildMaterial(initialVoxel);
voxelWorld.updateVoxelMesh(initialVoxel);

// Initialize game item manager
const gameItemManager = new GameItemManager(scene);

// Initialize model manager for editable voxel models
const modelManager = new ModelManager(scene);
modelManager.materialManager = materialManager;

// Track whether we're editing a model vs world
let isEditingModel = false;
let currentEditingModel = null;

// Model placement mode - for placing new models
let isPlacingModel = false;
let modelPlacementGhost = null;  // Ghost cube indicator

/**
 * Create the ghost cube for model placement visualization
 */
function createModelPlacementGhost() {
    if (modelPlacementGhost) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
        color: 0x4ecdc4,
        transparent: true,
        opacity: 0.5,
        wireframe: false
    });

    // Create a group with solid ghost and wireframe outline
    modelPlacementGhost = new THREE.Group();

    const solidMesh = new THREE.Mesh(geometry, material);
    modelPlacementGhost.add(solidMesh);

    // Add wireframe outline
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });
    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    modelPlacementGhost.add(wireframe);

    modelPlacementGhost.visible = false;
    scene.add(modelPlacementGhost);
}

/**
 * Enter model placement mode - shows ghost cube for user to choose position
 */
function enterModelPlacementMode() {
    isPlacingModel = true;

    // Create ghost cube if not exists
    createModelPlacementGhost();
    modelPlacementGhost.visible = true;

    // Position initially at origin
    modelPlacementGhost.position.set(0, 0.5, 0);

    // Change cursor to indicate placement mode
    renderer.domElement.style.cursor = 'crosshair';

    console.log('Entered model placement mode - click to place');
}

/**
 * Exit model placement mode without creating a model
 */
function cancelModelPlacement() {
    isPlacingModel = false;
    if (modelPlacementGhost) {
        modelPlacementGhost.visible = false;
    }
    renderer.domElement.style.cursor = '';
    console.log('Model placement cancelled');
}

/**
 * Finalize model placement - create model at ghost position
 */
function finalizeModelPlacement() {
    if (!isPlacingModel || !modelPlacementGhost) return;

    const position = {
        x: modelPlacementGhost.position.x,
        y: modelPlacementGhost.position.y,
        z: modelPlacementGhost.position.z
    };

    // Exit placement mode
    isPlacingModel = false;
    modelPlacementGhost.visible = false;
    renderer.domElement.style.cursor = '';

    // Create the model at this position
    const model = modelManager.createModel(position, true);

    // Set the model's material type to match the current world render mode
    if (voxelWorld.materialType === 'matcap' && voxelWorld.matcapMaterial) {
        model.setMaterialType('matcap', voxelWorld.matcapMaterial);
    }

    // Enter edit mode for the new model
    enterModelEdit(model);

    console.log('Model created at', position);
    return model;
}

/**
 * Update ghost cube position based on mouse position
 */
function updateModelPlacementGhost(event) {
    if (!isPlacingModel || !modelPlacementGhost) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // First, try to hit existing voxels to place on top of them
    const worldMeshes = voxelWorld.getMeshes();
    const modelMeshes = modelManager.getAllMeshes();
    const allMeshes = [...worldMeshes, ...modelMeshes];

    const intersects = raycaster.intersectObjects(allMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const normal = hit.face.normal.clone();
        const voxelPos = hit.object.position.clone();

        // Place ghost adjacent to the hit face (exactly on top of the face)
        // Voxel mesh positions are at integer coordinates, geometry is centered
        const newPos = voxelPos.clone().add(normal);
        modelPlacementGhost.position.set(
            Math.round(newPos.x),
            Math.round(newPos.y),  // No offset - voxels are centered at integer coords
            Math.round(newPos.z)
        );
    } else {
        // Fallback: raycast to grid plane (Y=-0.5, where the visual grid is)
        const gridPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5); // Plane at y=-0.5
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(gridPlane, intersection)) {
            // Snap to integer grid coordinates
            // Voxels at y=0 have bottom at y=-0.5, sitting on the grid
            modelPlacementGhost.position.set(
                Math.round(intersection.x),
                0,  // Voxel at y=0 sits on the grid (bottom at y=-0.5)
                Math.round(intersection.z)
            );
        }
    }
}

// Transform controls for game items
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value; // Disable orbit controls while dragging
    voxelEditor.enabled = !event.value; // Disable voxel editing while dragging
});
scene.add(transformControls);

// Snap to grid settings (active by default)
let snapEnabled = true;
const SNAP_TRANSLATE = 1;  // 1 grid unit
const SNAP_ROTATE = Math.PI / 4;  // 45 degrees
const SNAP_SCALE = 0.25;  // 25% increments

function applySnapSettings() {
    if (snapEnabled) {
        transformControls.setTranslationSnap(SNAP_TRANSLATE);
        transformControls.setRotationSnap(SNAP_ROTATE);
        transformControls.setScaleSnap(SNAP_SCALE);
    } else {
        transformControls.setTranslationSnap(null);
        transformControls.setRotationSnap(null);
        transformControls.setScaleSnap(null);
    }
}

// Apply snap settings on init
applySnapSettings();

// Selection bounding box wireframe (faint outline when model is selected)
let selectionBoxHelper = null;
let selectionBoxMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthTest: false,
    linewidth: 1
});

// Pivot helper for centering gizmo on model content
let gizmoPivot = new THREE.Object3D();
scene.add(gizmoPivot);

/**
 * Update selection box to match model bounds
 */
function updateSelectionBox(model) {
    // Remove existing box
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
        selectionBoxHelper.geometry.dispose();
        selectionBoxHelper = null;
    }

    if (!model || !model.voxelGroup) return;

    // Ensure world matrices are up to date
    model.meshGroup.updateMatrixWorld(true);

    // Compute bounding box in MODEL-LOCAL space (not world space)
    // This way the box rotates with the model
    const box = new THREE.Box3();
    const inverseModelMatrix = new THREE.Matrix4().copy(model.meshGroup.matrixWorld).invert();

    model.voxelGroup.traverse((child) => {
        if (child.isMesh) {
            child.geometry.computeBoundingBox();
            if (child.geometry.boundingBox) {
                const childBox = child.geometry.boundingBox.clone();
                // Transform to world space, then back to model-local space
                childBox.applyMatrix4(child.matrixWorld);
                childBox.applyMatrix4(inverseModelMatrix);
                box.union(childBox);
            }
        }
    });

    if (box.isEmpty()) return;

    // Create wireframe box in local space
    const size = new THREE.Vector3();
    const localCenter = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(localCenter);

    // Add small padding
    size.addScalar(0.05);

    const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(boxGeom);
    selectionBoxHelper = new THREE.LineSegments(edges, selectionBoxMaterial);

    // Position the box at local center, then apply model's transform
    selectionBoxHelper.position.copy(localCenter);

    // Apply model's world transform to the selection box
    selectionBoxHelper.applyMatrix4(model.meshGroup.matrixWorld);

    selectionBoxHelper.renderOrder = 999;
    scene.add(selectionBoxHelper);

    // Calculate world-space center for gizmo pivot
    const worldCenter = localCenter.clone().applyMatrix4(model.meshGroup.matrixWorld);

    // Update gizmo pivot to center of model (in world space)
    gizmoPivot.position.copy(worldCenter);
    gizmoPivot.rotation.copy(model.meshGroup.rotation);
    gizmoPivot.userData.modelOffset = localCenter.clone();
    gizmoPivot.userData.attachedModel = model;
}

// Sync model transforms when gizmo pivot moves
transformControls.addEventListener('objectChange', () => {
    // Sync item data from mesh after transform
    if (gameItemManager.selectedItem) {
        // Snap game item position to grid if snap is enabled
        if (snapEnabled && currentTransformMode === 'translate') {
            const mesh = gameItemManager.selectedItem.mesh;
            mesh.position.x = Math.round(mesh.position.x);
            mesh.position.y = Math.round(mesh.position.y);
            mesh.position.z = Math.round(mesh.position.z);
        }
        gameItemManager.selectedItem.syncFromMesh();
    }
    // Sync model data from gizmo pivot after transform
    if (gizmoPivot.userData.attachedModel && !isEditingModel) {
        const model = gizmoPivot.userData.attachedModel;
        const offset = gizmoPivot.userData.modelOffset;
        if (offset) {
            // Sync rotation to model
            model.meshGroup.rotation.copy(gizmoPivot.rotation);

            // Calculate new position accounting for rotation around center
            const rotatedOffset = offset.clone().applyEuler(gizmoPivot.rotation);
            model.meshGroup.position.copy(gizmoPivot.position).sub(rotatedOffset);

            // Snap model position to grid if snap is enabled
            if (snapEnabled && currentTransformMode === 'translate') {
                model.meshGroup.position.x = Math.round(model.meshGroup.position.x);
                model.meshGroup.position.y = Math.round(model.meshGroup.position.y);
                model.meshGroup.position.z = Math.round(model.meshGroup.position.z);
            }

            model.syncFromMesh();

            // Recalculate pivot position to stay centered on model
            if (snapEnabled && currentTransformMode === 'translate') {
                gizmoPivot.position.copy(model.meshGroup.position).add(rotatedOffset);
            }

            // Update selection box
            if (selectionBoxHelper) {
                selectionBoxHelper.position.copy(gizmoPivot.position);
                selectionBoxHelper.rotation.copy(gizmoPivot.rotation);
            }
        }
    }
});

// Track current transform mode
let currentTransformMode = 'translate'; // 'translate' or 'rotate'

// ==========================================
// Tool Mode System
// ==========================================
// Tool modes: 'build', 'delete', 'paint'
let currentTool = 'build';
let paintMaterialId = 'solid-gray'; // Default paint material
let paintMaterial = null; // ProceduralMaterial instance for painting

// ==========================================
// Model Editing Mode System
// ==========================================

/**
 * Enter model edit mode - switch editor context to a VoxelModel
 * @param {VoxelModel} model - The model to edit
 */
function enterModelEdit(model) {
    if (!model) return;

    isEditingModel = true;
    currentEditingModel = model;

    // Detach transform controls when entering edit mode
    transformControls.detach();

    // Hide selection bounding box during model editing
    if (selectionBoxHelper) {
        selectionBoxHelper.visible = false;
    }

    // Hide transform mode panel during model editing
    showTransformModePanel(false);

    // Hide world voxels completely
    setWorldVisible(false);

    // Hide all other models - only show the one being edited
    modelManager.models.forEach(m => {
        if (m !== model) {
            m.meshGroup.visible = false;
        }
    });

    // Set camera orbit target to model center
    const modelCenter = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(model.meshGroup);
    box.getCenter(modelCenter);
    controls.target.copy(modelCenter);
    controls.update();

    // Switch editor context to the model
    voxelEditor.setEditingContext(model, model);

    // Start editing in ModelManager
    modelManager.startEditing(model);

    // Update UI to show model edit mode
    updateModelEditUI(true);

    console.log('Entered model edit mode:', model.name);
}

/**
 * Exit model edit mode - return to world editing
 */
function exitModelEdit() {
    if (!isEditingModel) return;

    const model = currentEditingModel;

    // Restore world visibility
    setWorldVisible(true);

    // Show all models again
    modelManager.models.forEach(m => {
        m.meshGroup.visible = true;
    });

    // Reset camera orbit target to world center
    controls.target.set(0, 0, 0);
    controls.update();

    // Return editor to world context
    voxelEditor.setEditingContext(voxelWorld, null);

    // Stop editing in ModelManager
    modelManager.stopEditing();

    // Clear editing flags BEFORE selecting so selectModel sees correct state
    isEditingModel = false;
    currentEditingModel = null;

    // If model exists, select it with proper gizmo centering
    if (model) {
        selectModel(model);
    }

    // Update UI to show world edit mode
    updateModelEditUI(false);

    console.log('Exited model edit mode');
}

/**
 * Set world voxels visibility (hide when editing model)
 * @param {boolean} visible - Whether world voxels should be visible
 */
function setWorldVisible(visible) {
    // Hide/show all world voxel meshes
    for (const mesh of voxelWorld.meshes.values()) {
        mesh.visible = visible;
    }
    // Hide/show edge lines
    if (voxelWorld.edgeGroup) {
        voxelWorld.edgeGroup.visible = visible;
    }
    // Hide/show mirror meshes
    if (voxelWorld.mirrorGroup) {
        voxelWorld.mirrorGroup.visible = visible;
    }
    if (voxelWorld.mirrorEdgeGroup) {
        voxelWorld.mirrorEdgeGroup.visible = visible;
    }
    // Hide/show the main voxel group
    if (voxelWorld.voxelGroup) {
        voxelWorld.voxelGroup.visible = visible;
    }
}

/**
 * Update UI to reflect model edit state
 * @param {boolean} editing - Whether we're in model edit mode
 */
function updateModelEditUI(editing) {
    const modelEditIndicator = document.getElementById('model-edit-indicator');
    if (modelEditIndicator) {
        modelEditIndicator.style.display = editing ? 'flex' : 'none';
        if (editing && currentEditingModel) {
            const nameSpan = modelEditIndicator.querySelector('.model-name');
            if (nameSpan) {
                nameSpan.textContent = currentEditingModel.name;
            }
        }
    }

    // Update toolbar visibility if needed
    const modelToolbar = document.getElementById('model-toolbar');
    if (modelToolbar) {
        modelToolbar.style.display = editing ? 'flex' : 'none';
    }
}

/**
 * Start model creation - enters placement mode for user to choose position
 */
function createNewModel() {
    // Disable mirror mode if active before creating a new model
    if (voxelWorld.mirrorEnabled) {
        voxelWorld.disableMirror();
        hideMirrorModeLabel();
        document.getElementById('toolMirrorMode')?.classList.remove('active');
    }

    // Enter placement mode instead of immediately creating
    enterModelPlacementMode();
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lighting settings controls
// Light distance from origin (for spherical coordinates)
const LIGHT_DISTANCE = 15;

/**
 * Update light position from spherical coordinates (azimuth + elevation)
 * Azimuth: 0° = +Z (front), 90° = +X (right), 180° = -Z (back), 270° = -X (left)
 * Elevation: 0° = horizon, 90° = directly above
 */
function updateLightPosition(light, azimuthDeg, elevationDeg, distance = LIGHT_DISTANCE) {
    const azimuth = azimuthDeg * Math.PI / 180;
    const elevation = elevationDeg * Math.PI / 180;

    // Convert spherical to cartesian
    const y = Math.sin(elevation) * distance;
    const horizontalDist = Math.cos(elevation) * distance;
    const x = Math.sin(azimuth) * horizontalDist;
    const z = Math.cos(azimuth) * horizontalDist;

    light.position.set(x, y, z);
}

// Current light angles (for persistence)
let mainLightAzimuth = 225;  // Upper-left-back
let mainLightElevation = 60;
let fillLightAzimuth = 45;   // Front-right
let fillLightElevation = 20;

// Initialize light positions
updateLightPosition(directionalLight, mainLightAzimuth, mainLightElevation);
updateLightPosition(fillLight, fillLightAzimuth, fillLightElevation, 10);

function setupLightingControls() {
    // Main light intensity
    const mainIntensity = document.getElementById('mainIntensity');
    const mainIntensityVal = document.getElementById('mainIntensityVal');
    mainIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        directionalLight.intensity = value;
        mainIntensityVal.textContent = value.toFixed(1);
    });

    // Get all color picker elements upfront (needed for cross-referencing toggle behavior)
    const mainLightColorContainer = document.getElementById('mainLightColorWheel');
    const mainLightColorHex = document.getElementById('mainLightColorHex');
    const mainLightColorSwatch = document.getElementById('mainLightColorSwatch');
    const mainLightColorPanel = document.getElementById('mainLightColorPanel');
    const fillLightColorContainer = document.getElementById('fillLightColorWheel');
    const fillLightColorHex = document.getElementById('fillLightColorHex');
    const fillLightColorSwatch = document.getElementById('fillLightColorSwatch');
    const fillLightColorPanel = document.getElementById('fillLightColorPanel');

    let mainLightColorPicker = null;
    let fillLightColorPicker = null;

    // Main light color - collapsible ColorWheelPicker
    if (mainLightColorContainer) {
        mainLightColorPicker = new ColorWheelPicker(mainLightColorContainer, {
            size: 120,
            wheelWidth: 15,
            initialColor: '#ffffff',
            onChange: (color) => {
                directionalLight.color.set(color);
                mainLightColorHex.value = color;
                mainLightColorSwatch.style.backgroundColor = color;
            }
        });
    }

    // Toggle main light color panel on swatch click
    mainLightColorSwatch?.addEventListener('click', () => {
        const isExpanded = mainLightColorPanel.classList.contains('expanded');
        mainLightColorPanel.classList.toggle('expanded');
        mainLightColorSwatch.classList.toggle('active');

        // Close fill light panel if opening main light panel
        if (!isExpanded) {
            fillLightColorPanel?.classList.remove('expanded');
            fillLightColorSwatch?.classList.remove('active');
        }
    });

    // Hex input listener for main light
    mainLightColorHex?.addEventListener('input', (e) => {
        const color = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            mainLightColorPicker?.setColor(color);
            directionalLight.color.set(color);
            mainLightColorSwatch.style.backgroundColor = color;
        }
    });

    // Main light azimuth (horizontal angle)
    const mainAzimuth = document.getElementById('mainAzimuth');
    const mainAzimuthVal = document.getElementById('mainAzimuthVal');
    mainAzimuth.addEventListener('input', (e) => {
        mainLightAzimuth = parseFloat(e.target.value);
        updateLightPosition(directionalLight, mainLightAzimuth, mainLightElevation);
        mainAzimuthVal.textContent = mainLightAzimuth + '°';
    });

    // Main light elevation (vertical angle)
    const mainElevation = document.getElementById('mainElevation');
    const mainElevationVal = document.getElementById('mainElevationVal');
    mainElevation.addEventListener('input', (e) => {
        mainLightElevation = parseFloat(e.target.value);
        updateLightPosition(directionalLight, mainLightAzimuth, mainLightElevation);
        mainElevationVal.textContent = mainLightElevation + '°';
    });

    // Ambient light intensity
    const ambientIntensity = document.getElementById('ambientIntensity');
    const ambientIntensityVal = document.getElementById('ambientIntensityVal');
    ambientIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        ambientLight.intensity = value;
        ambientIntensityVal.textContent = value.toFixed(1);
    });

    // Fill light intensity
    const fillIntensity = document.getElementById('fillIntensity');
    const fillIntensityVal = document.getElementById('fillIntensityVal');
    fillIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        fillLight.intensity = value;
        fillIntensityVal.textContent = value.toFixed(2);
    });

    // Fill light color - collapsible ColorWheelPicker
    if (fillLightColorContainer) {
        fillLightColorPicker = new ColorWheelPicker(fillLightColorContainer, {
            size: 120,
            wheelWidth: 15,
            initialColor: '#4488ff',
            onChange: (color) => {
                fillLight.color.set(color);
                fillLightColorHex.value = color;
                fillLightColorSwatch.style.backgroundColor = color;
            }
        });
    }

    // Toggle fill light color panel on swatch click
    fillLightColorSwatch?.addEventListener('click', () => {
        const isExpanded = fillLightColorPanel.classList.contains('expanded');
        fillLightColorPanel.classList.toggle('expanded');
        fillLightColorSwatch.classList.toggle('active');

        // Close main light panel if opening fill light panel
        if (!isExpanded) {
            mainLightColorPanel?.classList.remove('expanded');
            mainLightColorSwatch?.classList.remove('active');
        }
    });

    // Hex input listener for fill light
    fillLightColorHex?.addEventListener('input', (e) => {
        const color = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            fillLightColorPicker?.setColor(color);
            fillLight.color.set(color);
            fillLightColorSwatch.style.backgroundColor = color;
        }
    });

    // Fill light azimuth
    const fillAzimuth = document.getElementById('fillAzimuth');
    const fillAzimuthVal = document.getElementById('fillAzimuthVal');
    fillAzimuth.addEventListener('input', (e) => {
        fillLightAzimuth = parseFloat(e.target.value);
        updateLightPosition(fillLight, fillLightAzimuth, fillLightElevation, 10);
        fillAzimuthVal.textContent = fillLightAzimuth + '°';
    });

    // Fill light elevation
    const fillElevation = document.getElementById('fillElevation');
    const fillElevationVal = document.getElementById('fillElevationVal');
    fillElevation.addEventListener('input', (e) => {
        fillLightElevation = parseFloat(e.target.value);
        updateLightPosition(fillLight, fillLightAzimuth, fillLightElevation, 10);
        fillElevationVal.textContent = fillLightElevation + '°';
    });

}

setupLightingControls();

// Material type switching
const materialTypeSelect = document.getElementById('materialType');
const physicalSettings = document.getElementById('physicalSettings');

materialTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;

    if (type === 'physical') {
        // Switch back to physical material
        physicalSettings.style.display = 'block';
        voxelWorld.setMaterialType('physical');

        // Update all models to physical mode
        modelManager.models.forEach(model => {
            model.setMaterialType('physical');
        });

        // Re-enable paint tool button
        if (toolPaint) {
            toolPaint.disabled = false;
            toolPaint.classList.remove('disabled');
        }
    } else {
        // Switch to matcap
        physicalSettings.style.display = 'none';
        const matcapTexture = matcapData[type];
        voxelWorld.setMaterialType('matcap', matcapTexture);

        // Update all models to matcap mode
        modelManager.models.forEach(model => {
            model.setMaterialType('matcap', voxelWorld.matcapMaterial);
        });

        // Disable paint tool button (paint doesn't make sense in matcap mode)
        if (toolPaint) {
            toolPaint.disabled = true;
            toolPaint.classList.add('disabled');
        }

        // If paint tool is active, switch to build
        if (currentTool === 'paint') {
            setTool('build');
        }
    }
});

// Keyboard controls for flying
const flySpeed = 0.1;
const keysPressed = {};

// Track if a dialog is open (to disable hotkeys)
let dialogOpen = false;

window.addEventListener('keydown', (e) => {
    // Skip hotkeys if a dialog is open or if user is typing in an input/textarea
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT'
    );

    if (dialogOpen || isTyping) {
        // Escape is handled by separate listener
        return;
    }

    keysPressed[e.code] = true;

    // Prevent space from scrolling page
    if (e.code === 'Space') {
        e.preventDefault();
    }

    // Toggle mirror mode with M key
    if (e.code === 'KeyM') {
        if (voxelWorld.mirrorEnabled) {
            // Disable mirror mode - convert mirrors to real voxels
            voxelWorld.disableMirror();
            hideMirrorModeLabel();
            document.getElementById('toolMirrorMode')?.classList.remove('active');
        } else {
            // Show dialog to choose how to enable mirror mode
            showMirrorDialog();
        }
    }

    // Create new model with N key
    if (e.code === 'KeyN' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        createNewModel();
    }

    // Export with E key
    if (e.code === 'KeyE') {
        exportModel();
    }

    // Flip face diagonal with F key
    if (e.code === 'KeyF') {
        voxelEditor.flipHoveredFaceDiagonal();
    }

    // Generate image with G key
    if (e.code === 'KeyG') {
        showGenerateDialog();
    }

    // Toggle Fill Extrude with Q key
    if (e.code === 'KeyQ') {
        toggleFillExtrude();
    }

    // Toggle controls with Tab key
    if (e.code === 'Tab') {
        e.preventDefault();
        toggleControlsInfo();
    }

    // Toggle game items panel with P key
    if (e.code === 'KeyP') {
        gameItemsPanel.classList.toggle('visible');
        materialsPanel.classList.remove('visible'); // Close materials if open
    }

    // Toggle materials panel with T key
    if (e.code === 'KeyT') {
        materialsPanel.classList.toggle('visible');
        gameItemsPanel.classList.remove('visible'); // Close game items if open
    }

    // Tool shortcuts: 1=Build, 2=Delete, 3=Paint
    if (e.code === 'Digit1') {
        setTool('build');
    }
    if (e.code === 'Digit2') {
        setTool('delete');
    }
    if (e.code === 'Digit3') {
        setTool('paint');
    }

    // Save model with Ctrl+S
    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveModel();
    }

    // Load model with Ctrl+O
    if (e.code === 'KeyO' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        loadModel();
    }

    // Undo with Ctrl+Z
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        voxelWorld.undo();
    }

    // Redo with Ctrl+Shift+Z or Ctrl+Y
    if ((e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
        (e.code === 'KeyY' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        voxelWorld.redo();
    }
});

// Controls info toggle
const infoPanel = document.getElementById('info');
const showMoreBtn = document.getElementById('showMoreBtn');
const showLessBtn = document.getElementById('showLessBtn');

function toggleControlsInfo() {
    infoPanel.classList.toggle('expanded');
}

showMoreBtn.addEventListener('click', toggleControlsInfo);
showLessBtn.addEventListener('click', toggleControlsInfo);

// Fill Extrude toggle (used by Q keyboard shortcut)
function toggleFillExtrude() {
    const enabled = !voxelEditor.fillExtrudeEnabled;
    voxelEditor.setFillExtrudeEnabled(enabled);
    // Update toolbar button state
    const toolFillExtrudeBtn = document.getElementById('toolFillExtrude');
    if (toolFillExtrudeBtn) {
        toolFillExtrudeBtn.classList.toggle('active', enabled);
    }
    // When enabling fill extrude, also switch to build mode
    if (enabled) {
        setTool('build');
    }
}

// Mirror mode dialog handling
const mirrorDialog = document.getElementById('mirrorDialog');
const mirrorCleanupBtn = document.getElementById('mirrorCleanup');
const mirrorCleanBtn = document.getElementById('mirrorClean');
const mirrorCancelBtn = document.getElementById('mirrorCancel');

function showMirrorDialog() {
    mirrorDialog.classList.add('visible');
    dialogOpen = true;
}

function hideMirrorDialog() {
    mirrorDialog.classList.remove('visible');
    dialogOpen = false;
}

// Mirror mode label
const mirrorModeLabel = document.getElementById('mirrorModeLabel');

function showMirrorModeLabel() {
    if (mirrorModeLabel) {
        mirrorModeLabel.classList.remove('hidden');
    }
}

function hideMirrorModeLabel() {
    if (mirrorModeLabel) {
        mirrorModeLabel.classList.add('hidden');
    }
}

// Exit mirror mode button
const exitMirrorBtn = document.getElementById('exitMirrorBtn');
if (exitMirrorBtn) {
    exitMirrorBtn.addEventListener('click', () => {
        voxelWorld.disableMirror();
        hideMirrorModeLabel();
        document.getElementById('toolMirrorMode')?.classList.remove('active');
    });
}

mirrorCleanupBtn.addEventListener('click', () => {
    hideMirrorDialog();
    voxelWorld.enableMirrorWithCleanup('x', 0); // Mirror at x=0
    showMirrorModeLabel();
    document.getElementById('toolMirrorMode')?.classList.add('active');
});

mirrorCleanBtn.addEventListener('click', () => {
    hideMirrorDialog();
    voxelWorld.enableMirrorClean('x', 0); // Mirror at x=0
    showMirrorModeLabel();
    document.getElementById('toolMirrorMode')?.classList.add('active');
});

mirrorCancelBtn.addEventListener('click', () => {
    hideMirrorDialog();
});

// Extrude Input Dialog - shown when pressing 'I' with faces selected
// Uses the same UI style as the Generate dialog (from UI.md design system)
let extrudeInputDialog = null;
let extrudeInputField = null;

function createExtrudeInputDialog() {
    if (extrudeInputDialog) return;

    extrudeInputDialog = document.createElement('div');
    extrudeInputDialog.className = 'modal-overlay transparent-bg';
    extrudeInputDialog.innerHTML = `
        <div class="modal-dialog generate-dialog" style="max-width: 320px; padding: 16px;">
            <p id="extrudeInfo" style="margin: 0 0 12px 0; color: #888; font-size: 12px; text-align: center;"></p>
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="number" id="extrudeCountInput"
                       placeholder="Count (e.g. 5 or -3)"
                       style="flex: 1; padding: 12px 14px; border-radius: 8px; background: rgba(0, 0, 0, 0.3); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); font-size: 14px; font-family: inherit; transition: border-color 0.2s, box-shadow 0.2s; outline: none;">
                <button id="extrudeConfirmBtn" class="modal-btn modal-btn-primary" style="padding: 12px 18px; margin: 0;">
                    ⬆
                </button>
            </div>
            <button id="extrudeCancelBtn" style="width: 100%; margin-top: 10px; padding: 10px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #888; font-size: 13px; cursor: pointer; transition: all 0.2s;">
                Cancel
            </button>
        </div>
    `;
    document.body.appendChild(extrudeInputDialog);

    extrudeInputField = document.getElementById('extrudeCountInput');
    const confirmBtn = document.getElementById('extrudeConfirmBtn');
    const cancelBtn = document.getElementById('extrudeCancelBtn');

    // Add focus styles for input
    extrudeInputField.addEventListener('focus', () => {
        extrudeInputField.style.borderColor = '#4ecdc4';
        extrudeInputField.style.boxShadow = '0 0 0 3px rgba(78, 205, 196, 0.15)';
    });
    extrudeInputField.addEventListener('blur', () => {
        extrudeInputField.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        extrudeInputField.style.boxShadow = 'none';
    });

    // Add hover styles for cancel button
    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        cancelBtn.style.color = '#aaa';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.color = '#888';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });

    confirmBtn.addEventListener('click', () => {
        const count = parseInt(extrudeInputField.value, 10);
        if (!isNaN(count) && count !== 0) {
            voxelEditor.extrudeSelectionByCount(count);
            voxelEditor.clearFaceSelection(); // Clear selection after extrusion
        }
        hideExtrudeInputDialog();
    });

    cancelBtn.addEventListener('click', () => {
        voxelEditor.clearFaceSelection(); // Clear selection on cancel
        hideExtrudeInputDialog();
    });

    extrudeInputField.addEventListener('keydown', (e) => {
        if (e.code === 'Enter') {
            e.preventDefault();
            const count = parseInt(extrudeInputField.value, 10);
            if (!isNaN(count) && count !== 0) {
                voxelEditor.extrudeSelectionByCount(count);
                voxelEditor.clearFaceSelection(); // Clear selection after extrusion
            }
            hideExtrudeInputDialog();
        } else if (e.code === 'Escape') {
            voxelEditor.clearFaceSelection(); // Clear selection on escape
            hideExtrudeInputDialog();
        }
    });
}

function showExtrudeInputDialog() {
    createExtrudeInputDialog();

    const info = voxelEditor.getSelectionInfo();
    const infoEl = document.getElementById('extrudeInfo');
    if (info) {
        const faceNames = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'];
        const faceName = info.face === 'mixed' ? 'Mixed directions' : faceNames[info.face] || info.face;
        infoEl.textContent = `${info.count} face${info.count > 1 ? 's' : ''} selected (${faceName})`;
    }

    extrudeInputDialog.classList.add('visible');
    extrudeInputField.value = '';
    extrudeInputField.focus();
    dialogOpen = true;
}

function hideExtrudeInputDialog() {
    if (extrudeInputDialog) {
        extrudeInputDialog.classList.remove('visible');
    }
    dialogOpen = false;
}

// Auto-show extrude dialog when Shift+click selects a face
voxelEditor.onFaceSelected = (faceCount) => {
    // Show extrude dialog automatically when a face is selected
    showExtrudeInputDialog();
};

// Music Player
const musicSelect = document.getElementById('musicSelect');
const playBtn = document.getElementById('playBtn');
let audioPlayer = null;

function loadTrack(src) {
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer = null;
    }
    playBtn.classList.remove('playing');

    if (!src) return;

    audioPlayer = new Audio(src);
    audioPlayer.loop = true;
    audioPlayer.volume = 0.5;

    audioPlayer.addEventListener('ended', () => {
        // Loop is enabled, but just in case
        playBtn.classList.remove('playing');
    });
}

function togglePlay() {
    if (!audioPlayer) {
        // Auto-select first track if none selected
        if (!musicSelect.value && musicSelect.options.length > 1) {
            musicSelect.value = musicSelect.options[1].value;
            loadTrack(musicSelect.value);
        }
        if (!audioPlayer) return;
    }

    if (audioPlayer.paused) {
        audioPlayer.play();
        playBtn.classList.add('playing');
    } else {
        audioPlayer.pause();
        playBtn.classList.remove('playing');
    }
}

musicSelect.addEventListener('change', () => {
    const wasPlaying = audioPlayer && !audioPlayer.paused;
    loadTrack(musicSelect.value);
    if (wasPlaying && audioPlayer) {
        audioPlayer.play();
        playBtn.classList.add('playing');
    }
});

playBtn.addEventListener('click', togglePlay);

// Export dialog handling
const exportDialog = document.getElementById('exportDialog');
const exportInfo = document.getElementById('exportInfo');
const exportOkBtn = document.getElementById('exportOk');

function exportModel() {
    // Get export stats
    const voxelCount = voxelWorld.voxels.size;
    let totalVoxels = voxelCount;

    // Count mirrored voxels if mirror mode is on
    if (voxelWorld.mirrorEnabled) {
        for (const voxel of voxelWorld.voxels.values()) {
            const mirrorPos = voxelWorld.getMirroredPosition(voxel.x, voxel.y, voxel.z);
            if (mirrorPos.x !== voxel.x || mirrorPos.y !== voxel.y || mirrorPos.z !== voxel.z) {
                totalVoxels++;
            }
        }
    }

    // Perform export
    voxelWorld.downloadOBJ('voxel_model.obj');

    // Show confirmation dialog
    let info = `Your model has been exported as <strong>voxel_model.obj</strong><br><br>`;
    info += `Voxels: ${totalVoxels}`;
    if (voxelWorld.mirrorEnabled) {
        info += ` (${voxelCount} + ${totalVoxels - voxelCount} mirrored)`;
    }

    exportInfo.innerHTML = info;
    showExportDialog();
}

function showExportDialog() {
    exportDialog.classList.add('visible');
    dialogOpen = true;
}

function hideExportDialog() {
    exportDialog.classList.remove('visible');
    dialogOpen = false;
}

exportOkBtn.addEventListener('click', hideExportDialog);

// ==========================================
// Game Items Panel
// ==========================================

const gameItemsPanel = document.getElementById('gameItemsPanel');
const gameItemsBtn = document.getElementById('gameItemsBtn');
const closeGameItemsBtn = document.getElementById('closeGameItems');
const gameItemsCountBadge = document.getElementById('gameItemsCount');
const itemCountSpan = document.getElementById('itemCount');
const placedItemsList = document.getElementById('placedItemsList');
const transformTranslateBtn = document.getElementById('transformTranslate');
const transformRotateBtn = document.getElementById('transformRotate');
const deleteGameItemBtn = document.getElementById('deleteGameItem');

// Toggle game items panel
gameItemsBtn.addEventListener('click', () => {
    gameItemsPanel.classList.toggle('visible');
});

closeGameItemsBtn.addEventListener('click', () => {
    gameItemsPanel.classList.remove('visible');
});

// Transform mode buttons
transformTranslateBtn.addEventListener('click', () => {
    setTransformMode('translate');
});

transformRotateBtn.addEventListener('click', () => {
    setTransformMode('rotate');
});

// Delete selected item
deleteGameItemBtn.addEventListener('click', () => {
    deleteSelectedGameItem();
});

function deleteSelectedGameItem() {
    if (gameItemManager.selectedItem) {
        transformControls.detach();
        gameItemManager.removeItem(gameItemManager.selectedItem.id);
        updateGameItemsUI();
    }
}

function deleteSelectedModel() {
    if (modelManager.selectedModel && !isEditingModel) {
        transformControls.detach();
        // Clear selection box
        if (selectionBoxHelper) {
            scene.remove(selectionBoxHelper);
            selectionBoxHelper.geometry.dispose();
            selectionBoxHelper = null;
        }
        // Remove the model
        modelManager.removeModel(modelManager.selectedModel.id);
        // Hide transform mode panel
        showTransformModePanel(false);
    }
}

// Primitive buttons
document.querySelectorAll('.primitive-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        addGameItem(type);
    });
});

function addGameItem(type) {
    // Place in front of camera
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const position = {
        x: Math.round(camera.position.x + direction.x * 3),
        y: 0.5,
        z: Math.round(camera.position.z + direction.z * 3)
    };

    const item = gameItemManager.addItem(type, position);
    selectGameItem(item);
    updateGameItemsUI();
}

function selectGameItem(item) {
    // Clear model selection state
    gizmoPivot.userData.attachedModel = null;
    gizmoPivot.userData.modelOffset = null;
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
        selectionBoxHelper.geometry.dispose();
        selectionBoxHelper = null;
    }

    gameItemManager.selectItem(item);

    if (item) {
        transformControls.attach(item.mesh);
        transformControls.setMode(currentTransformMode);
    } else {
        transformControls.detach();
    }

    updatePlacedItemsList();
}

function updateGameItemsUI() {
    const count = gameItemManager.count;
    gameItemsCountBadge.textContent = count;
    itemCountSpan.textContent = count;
    updatePlacedItemsList();
}

function updatePlacedItemsList() {
    if (gameItemManager.count === 0) {
        placedItemsList.innerHTML = '<div class="empty-message">No items placed yet</div>';
        return;
    }

    const icons = {
        cube: '⬜',
        sphere: '⚪',
        cylinder: '🔷',
        cone: '🔺',
        torus: '⭕',
        capsule: '💊'
    };

    let html = '';
    for (const item of gameItemManager.items.values()) {
        const isSelected = gameItemManager.selectedItem === item;
        const pos = `${item.position.x.toFixed(1)}, ${item.position.y.toFixed(1)}, ${item.position.z.toFixed(1)}`;
        html += `
            <div class="placed-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <span class="item-icon">${icons[item.type] || '📦'}</span>
                <div class="item-info">
                    <div class="item-name">${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</div>
                    <div class="item-pos">${pos}</div>
                </div>
            </div>
        `;
    }
    placedItemsList.innerHTML = html;

    // Add click handlers
    placedItemsList.querySelectorAll('.placed-item').forEach(el => {
        el.addEventListener('click', () => {
            const item = gameItemManager.getItem(el.dataset.id);
            if (item) {
                selectGameItem(item);
            }
        });
    });
}

// Handle clicking on game items in the scene
function handleGameItemClick(event) {
    if (event.button !== 0) return;
    if (!voxelEditor.enabled) return; // Don't interfere with transform controls

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const meshes = gameItemManager.getMeshes();
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        const item = gameItemManager.getItemFromMesh(intersects[0].object);
        if (item) {
            selectGameItem(item);
            return true;
        }
    }

    return false;
}

// Handle clicking on voxel models in the scene (when not in model edit mode)
function handleModelClick(event) {
    if (event.button !== 0) return false;
    if (!voxelEditor.enabled) return false; // Don't interfere with transform controls
    if (isEditingModel) return false; // Don't select models while editing one

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Use ModelManager's raycast to find clicked model
    const hit = modelManager.raycast(raycaster);

    if (hit && hit.model) {
        selectModel(hit.model);
        return true;
    }

    return false;
}

// Select a voxel model
function selectModel(model) {
    // Clear game item selection
    if (gameItemManager.selectedItem) {
        selectGameItem(null);
    }

    // Clear previous selection state
    gizmoPivot.userData.attachedModel = null;
    gizmoPivot.userData.modelOffset = null;

    modelManager.selectModel(model);

    if (model && !isEditingModel) {
        // Update selection box and center gizmo on model
        updateSelectionBox(model);

        // Sync pivot rotation with model
        gizmoPivot.rotation.copy(model.meshGroup.rotation);

        // Attach transform controls to the centered pivot
        transformControls.attach(gizmoPivot);
        transformControls.setMode(currentTransformMode);

        // Show transform mode panel
        showTransformModePanel(true);
    } else {
        transformControls.detach();
        // Clear selection box when deselecting
        if (selectionBoxHelper) {
            scene.remove(selectionBoxHelper);
            selectionBoxHelper.geometry.dispose();
            selectionBoxHelper = null;
        }
        // Hide transform mode panel
        showTransformModePanel(false);
    }
}

// Intercept clicks to check for game items and models first
renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button === 0 && event.shiftKey === false) {
        // Check if we're in model placement mode first
        if (isPlacingModel) {
            finalizeModelPlacement();
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        // Check if we clicked on a game item first
        if (handleGameItemClick(event)) {
            event.stopPropagation();
            return;
        }
        // Check if we clicked on a model (when not editing)
        if (!isEditingModel && handleModelClick(event)) {
            event.stopPropagation();
            return;
        }

        // If we didn't click on a game item or model, deselect any selected model
        // This happens when clicking on empty space, grid, or world voxels
        // But don't deselect if clicking on the transform gizmo (axis is set when hovering gizmo)
        if (!isEditingModel && modelManager.selectedModel && !transformControls.axis) {
            selectModel(null);
            // Stop propagation so clicking to deselect doesn't also place a block
            event.stopPropagation();
            return;
        }
    }
}, true);

// Mouse move for model placement ghost
renderer.domElement.addEventListener('mousemove', (event) => {
    if (isPlacingModel) {
        updateModelPlacementGhost(event);
    }
});

// Double-click to enter model edit mode
renderer.domElement.addEventListener('dblclick', (event) => {
    if (event.button === 0 && !isEditingModel) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        // Use ModelManager's raycast to find clicked model
        const hit = modelManager.raycast(raycaster);

        if (hit && hit.model) {
            enterModelEdit(hit.model);
        }
    }
});

// Keyboard shortcuts for game items
window.addEventListener('keydown', (e) => {
    // Only when not typing in an input
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
    }

    // G key - toggle to translate mode (or switch if already in rotate)
    if (e.code === 'KeyG' && !e.ctrlKey && gameItemManager.selectedItem) {
        e.preventDefault();
        setTransformMode('translate');
    }

    // R key - rotate mode (when game item selected)
    if (e.code === 'KeyR' && gameItemManager.selectedItem) {
        e.preventDefault();
        setTransformMode('rotate');
    }

    // Delete or Backspace - delete selected game item or model
    if (e.code === 'Delete' || e.code === 'Backspace') {
        if (gameItemManager.selectedItem) {
            e.preventDefault();
            deleteSelectedGameItem();
        } else if (modelManager.selectedModel && !isEditingModel) {
            e.preventDefault();
            deleteSelectedModel();
        }
    }

    // Escape - cancel placement mode OR deselect game item OR exit model edit mode
    if (e.code === 'Escape') {
        if (isPlacingModel) {
            // Cancel model placement mode first
            cancelModelPlacement();
        } else if (isEditingModel) {
            // Exit model edit mode
            exitModelEdit();
        } else if (gameItemManager.selectedItem) {
            selectGameItem(null);
        } else if (modelManager.selectedModel) {
            // Deselect model and detach transform controls
            transformControls.detach();
            modelManager.clearSelection();
        }
    }

    // G key - translate mode for selected model or game item
    if (e.code === 'KeyG' && !e.ctrlKey && modelManager.selectedModel && !isEditingModel) {
        e.preventDefault();
        transformControls.setMode('translate');
        currentTransformMode = 'translate';
    }

    // R key - rotate mode for selected model
    if (e.code === 'KeyR' && modelManager.selectedModel && !isEditingModel) {
        e.preventDefault();
        transformControls.setMode('rotate');
        currentTransformMode = 'rotate';
    }

    // Enter - enter edit mode for selected model
    if (e.code === 'Enter' && modelManager.selectedModel && !isEditingModel) {
        e.preventDefault();
        enterModelEdit(modelManager.selectedModel);
    }
});

window.addEventListener('keyup', (e) => {
    keysPressed[e.code] = false;
});

// ==========================================
// Toolbar - Tool Mode System
// ==========================================

const toolBuild = document.getElementById('toolBuild');
const toolDelete = document.getElementById('toolDelete');
const toolPaint = document.getElementById('toolPaint');
const paintColorIndicator = document.getElementById('paintColorIndicator');

/**
 * Set the current tool mode
 */
function setTool(toolName) {
    // Prevent selecting paint tool when matcap mode is active
    if (toolName === 'paint' && voxelWorld.materialType === 'matcap') {
        return; // Do nothing, paint is disabled in matcap mode
    }

    currentTool = toolName;

    // Update toolbar button states (only for tool buttons, not toggle buttons)
    document.querySelectorAll('.tool-btn:not(.toggle-btn)').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    // Update voxel editor mode
    voxelEditor.setToolMode(toolName);

    // Update cursor style
    const canvas = renderer.domElement;
    switch (toolName) {
        case 'build':
            canvas.style.cursor = 'crosshair';
            break;
        case 'delete':
            canvas.style.cursor = 'not-allowed';
            break;
        case 'paint':
            canvas.style.cursor = 'cell';
            break;
        default:
            canvas.style.cursor = 'default';
    }

    // If switching to paint, open materials panel and disable fill extrude
    if (toolName === 'paint') {
        materialsPanel.classList.add('visible');
        // Disable fill extrude when entering paint mode
        if (voxelEditor.fillExtrudeEnabled) {
            voxelEditor.setFillExtrudeEnabled(false);
            const toolFillExtrudeBtn = document.getElementById('toolFillExtrude');
            if (toolFillExtrudeBtn) {
                toolFillExtrudeBtn.classList.remove('active');
            }
        }
    }
}

// Toolbar button click handlers
toolBuild.addEventListener('click', () => setTool('build'));
toolDelete.addEventListener('click', () => setTool('delete'));
toolPaint.addEventListener('click', () => setTool('paint'));

// Fill Extrude toggle button
const toolFillExtrude = document.getElementById('toolFillExtrude');
if (toolFillExtrude) {
    toolFillExtrude.addEventListener('click', () => {
        const enabled = !voxelEditor.fillExtrudeEnabled;
        voxelEditor.setFillExtrudeEnabled(enabled);
        toolFillExtrude.classList.toggle('active', enabled);
        // When enabling fill extrude, also switch to build mode
        if (enabled) {
            setTool('build');
        }
    });
}

// Render panel toggle button
const toolRender = document.getElementById('toolRender');
const renderPanel = document.getElementById('renderPanel');
if (toolRender && renderPanel) {
    toolRender.addEventListener('click', () => {
        renderPanel.classList.toggle('visible');
        toolRender.classList.toggle('active', renderPanel.classList.contains('visible'));
    });
}

// Close render panel button
const closeRenderPanel = document.getElementById('closeRenderPanel');
if (closeRenderPanel && renderPanel) {
    closeRenderPanel.addEventListener('click', () => {
        renderPanel.classList.remove('visible');
        toolRender?.classList.remove('active');
    });
}

// Mirror Mode toggle button
const toolMirrorMode = document.getElementById('toolMirrorMode');
if (toolMirrorMode) {
    toolMirrorMode.addEventListener('click', () => {
        if (voxelWorld.mirrorEnabled) {
            voxelWorld.disableMirror();
            hideMirrorModeLabel();
            toolMirrorMode.classList.remove('active');
        } else {
            showMirrorDialog();
        }
    });
}

// Generate Image button
const toolGenerateImage = document.getElementById('toolGenerateImage');
if (toolGenerateImage) {
    toolGenerateImage.addEventListener('click', () => {
        showGenerateDialog();
    });
}

// Create Model button
const toolCreateModel = document.getElementById('toolCreateModel');
if (toolCreateModel) {
    toolCreateModel.addEventListener('click', () => {
        createNewModel();
    });
}

// Exit Model button
const exitModelBtn = document.getElementById('exitModelBtn');
if (exitModelBtn) {
    exitModelBtn.addEventListener('click', () => {
        exitModelEdit();
    });
}

// Transform Mode Panel
const transformModePanel = document.getElementById('transformModePanel');
const btnTranslate = document.getElementById('btnTranslate');
const btnRotate = document.getElementById('btnRotate');
const btnScale = document.getElementById('btnScale');

/**
 * Show or hide the transform mode panel
 */
function showTransformModePanel(show) {
    if (transformModePanel) {
        transformModePanel.classList.toggle('hidden', !show);
    }
}

/**
 * Set the transform mode and update UI
 */
function setTransformMode(mode) {
    currentTransformMode = mode;
    transformControls.setMode(mode);

    // Update button states
    if (btnTranslate) btnTranslate.classList.toggle('active', mode === 'translate');
    if (btnRotate) btnRotate.classList.toggle('active', mode === 'rotate');
    if (btnScale) btnScale.classList.toggle('active', mode === 'scale');
}

// Transform mode button handlers
if (btnTranslate) {
    btnTranslate.addEventListener('click', () => setTransformMode('translate'));
}
if (btnRotate) {
    btnRotate.addEventListener('click', () => setTransformMode('rotate'));
}
if (btnScale) {
    btnScale.addEventListener('click', () => setTransformMode('scale'));
}

// Snap toggle button
const btnSnap = document.getElementById('btnSnap');

function updateSnapButton() {
    if (btnSnap) {
        btnSnap.classList.toggle('active', snapEnabled);
    }
}

function toggleSnap() {
    snapEnabled = !snapEnabled;
    applySnapSettings();
    updateSnapButton();
}

if (btnSnap) {
    btnSnap.addEventListener('click', toggleSnap);
}

// Initialize snap button state
updateSnapButton();

// Listen for material picked event (from color picker tool)
renderer.domElement.addEventListener('materialPicked', (event) => {
    const { materialId } = event.detail;
    if (materialId && materialLibrary.get(materialId)) {
        selectMaterial(materialId);
        // Switch to paint tool after picking
        setTool('paint');
    }
});

/**
 * Update paint material for the Paint tool
 */
function setPaintMaterial(materialId) {
    paintMaterialId = materialId;

    const matDef = materialLibrary.get(materialId);
    if (matDef) {
        paintMaterial = new ProceduralMaterial(matDef);
        voxelEditor.setPaintMaterial(paintMaterial);

        // Update paint color indicator
        paintColorIndicator.style.background = getSwatchPreviewStyle(matDef);
        // activeMaterialPreview removed - was for bottom-right materials button = getSwatchPreviewStyle(matDef);
    }
}

// ==========================================
// Materials Panel
// ==========================================

const materialsPanel = document.getElementById('materialsPanel');
const closeMaterialsBtn = document.getElementById('closeMaterials');
const materialEditor = document.getElementById('materialEditor');
const editorMaterialName = document.getElementById('editorMaterialName');
const editorProperties = document.getElementById('editorProperties');
const closeEditorBtn = document.getElementById('closeEditor');

// Initialize material library (using new system via materialManager)
// Legacy materialLibrary for backward compatibility with old code
const materialLibrary = new LegacyMaterialLibrary();
let selectedMaterialId = 'solid-white';
let currentProceduralMaterial = null;

// Get the new material library from materialManager
const newMaterialLibrary = materialManager.getLibrary();

closeMaterialsBtn.addEventListener('click', () => {
    materialsPanel.classList.remove('visible');
});

// Close material editor
closeEditorBtn.addEventListener('click', () => {
    materialEditor.style.display = 'none';
});

// Category collapse/expand
document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', () => {
        header.closest('.material-category').classList.toggle('collapsed');
    });
});

// Add "Create Material" button to materials panel
const materialsContent = document.querySelector('.materials-content');
const addMaterialBtn = document.createElement('button');
addMaterialBtn.className = 'add-material-btn';
addMaterialBtn.innerHTML = '+ Create Material';
addMaterialBtn.addEventListener('click', () => {
    materialMaker.create();
});
materialsContent.appendChild(addMaterialBtn);

/**
 * Refresh the materials UI (called after material changes)
 */
function refreshMaterialsUI() {
    populateMaterialSwatches();
}

/**
 * Populate material swatches in the panel
 * Uses the new MaterialManager inventory
 */
function populateMaterialSwatches() {
    // Use new material system
    const inventory = materialManager.getInventory();
    const byCategory = {};

    // Group by category
    for (const mat of inventory) {
        const cat = mat.category || 'custom';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(mat);
    }

    // Map new categories to old container IDs
    const categoryContainerMap = {
        'solid': 'solidMaterials',
        'pattern': 'patternMaterials',
        'metal': 'metalMaterials',
        'natural': 'patternMaterials', // Put natural in pattern for now
        'custom': 'customMaterials'    // User-created materials
    };

    // Clear all containers first
    for (const containerId of Object.values(categoryContainerMap)) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
    }

    // Populate
    for (const [category, materials] of Object.entries(byCategory)) {
        const containerId = categoryContainerMap[category] || 'patternMaterials';
        const container = document.getElementById(containerId);
        if (!container) continue;

        for (const mat of materials) {
            const swatch = createMaterialSwatchNew(mat);
            container.appendChild(swatch);
        }
    }

    // Show/hide the "My Materials" section based on whether there are custom materials
    const customSection = document.getElementById('customMaterialsSection');
    if (customSection) {
        customSection.style.display = byCategory['custom']?.length > 0 ? 'block' : 'none';
    }

    // Also populate with legacy materials if new system is empty
    if (inventory.length === 0) {
        const categories = materialLibrary.getByCategory();
        for (const [category, materials] of Object.entries(categories)) {
            const container = document.getElementById(`${category}Materials`);
            if (!container) continue;

            container.innerHTML = '';

            for (const mat of materials) {
                const swatch = createMaterialSwatch(mat);
                container.appendChild(swatch);
            }
        }
    }
}

/**
 * Create a material swatch for the new material system
 */
function createMaterialSwatchNew(material) {
    const swatch = document.createElement('div');
    swatch.className = 'material-swatch';
    swatch.dataset.materialId = material.instanceId;

    if (material.instanceId === materialManager.buildMaterialId) {
        swatch.classList.add('selected');
    }

    // Create preview
    const preview = document.createElement('div');
    preview.className = 'swatch-preview';

    // For custom materials with layers or special properties, render a proper thumbnail
    const isCustom = material.category === 'custom';
    const hasLayers = material.layers && material.layers.length > 0;
    const hasEmissive = material.base.emissiveIntensity > 0;
    const hasMetal = material.base.metalness > 0.3;

    if (isCustom || hasLayers || hasEmissive || hasMetal) {
        // Use 3D rendered thumbnail for complex materials
        try {
            updateElementThumbnail(material, preview);
        } catch (e) {
            console.warn('Failed to render thumbnail, using fallback color', e);
            preview.style.background = material.getPreviewColor();
        }
    } else {
        // Use simple color for basic solid materials
        preview.style.background = material.getPreviewColor();
    }

    const name = document.createElement('div');
    name.className = 'swatch-name';
    name.textContent = material.name;

    swatch.appendChild(preview);
    swatch.appendChild(name);

    // Click to select
    swatch.addEventListener('click', () => {
        selectMaterial(material.instanceId);
    });

    // Double-click to open editor
    swatch.addEventListener('dblclick', () => {
        openMaterialEditorNew(material.instanceId);
    });

    return swatch;
}

/**
 * Create a single material swatch element
 */
function createMaterialSwatch(materialDef) {
    const swatch = document.createElement('div');
    swatch.className = 'material-swatch';
    swatch.dataset.materialId = materialDef.id;

    if (materialDef.id === selectedMaterialId) {
        swatch.classList.add('selected');
    }

    // Create preview (simple colored div for now)
    const preview = document.createElement('div');
    preview.className = 'swatch-preview';
    preview.style.background = getSwatchPreviewStyle(materialDef);

    const name = document.createElement('div');
    name.className = 'swatch-name';
    name.textContent = materialDef.name;

    swatch.appendChild(preview);
    swatch.appendChild(name);

    // Click to select
    swatch.addEventListener('click', () => {
        selectMaterial(materialDef.id);
    });

    // Double-click to open editor
    swatch.addEventListener('dblclick', () => {
        openMaterialEditor(materialDef.id);
    });

    return swatch;
}

/**
 * Get CSS background for swatch preview based on material type
 */
function getSwatchPreviewStyle(materialDef) {
    const params = materialDef.params;

    switch (materialDef.type) {
        case MaterialType.Solid:
        case MaterialType.Metal:
        case MaterialType.Fabric:
            return params.color || '#ffffff';

        case MaterialType.Gradient:
            const dir = params.direction || 'vertical';
            const angle = dir === 'vertical' ? '180deg' : dir === 'horizontal' ? '90deg' : '135deg';
            return `linear-gradient(${angle}, ${params.colorTop || params.color1 || '#ffffff'}, ${params.colorBottom || params.color2 || '#000000'})`;

        case MaterialType.Checker:
            const c1 = params.color1 || '#ffffff';
            const c2 = params.color2 || '#000000';
            return `repeating-conic-gradient(${c1} 0% 25%, ${c2} 0% 50%) 50% / 20px 20px`;

        case MaterialType.Noise:
            // Approximate noise with gradient
            const nc = params.color || '#888888';
            return `radial-gradient(circle at 30% 30%, ${nc}, #333)`;

        case MaterialType.Brick:
            return `linear-gradient(90deg, ${params.brickColor || '#8B4513'} 0%, ${params.brickColor || '#8B4513'} 90%, ${params.mortarColor || '#cccccc'} 90%)`;

        case MaterialType.Wood:
            return `linear-gradient(90deg, ${params.color1 || '#8B5A2B'}, ${params.color2 || '#D2691E'}, ${params.color1 || '#8B5A2B'})`;

        default:
            return '#ffffff';
    }
}

/**
 * Select a material (for Paint and Build tools)
 * @param {string} materialId - Can be either old definition ID or new inventory ID
 */
function selectMaterial(materialId) {
    selectedMaterialId = materialId;

    // Update swatch selection UI
    document.querySelectorAll('.material-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.materialId === materialId);
    });

    // Try new material system first
    const mat = materialManager.getMaterial(materialId);
    if (mat) {
        // It's a new system inventory ID
        materialManager.setActiveMaterial(materialId);

        // Update UI indicators
        if (mat) {
            paintColorIndicator.style.background = mat.getPreviewColor();
            // activeMaterialPreview removed - was for bottom-right materials button = mat.getPreviewColor();
        }
    } else {
        // Legacy: try old definition ID
        // First check if we need to add it to inventory
        const def = newMaterialLibrary.getDefinition(materialId);
        if (def) {
            const inventoryId = newMaterialLibrary.addToInventory(materialId);
            materialManager.setActiveMaterial(inventoryId);

            // Update UI
            paintColorIndicator.style.background = def.base.color;
            // activeMaterialPreview removed - was for bottom-right materials button = def.base.color;
        } else {
            // Fallback to old system
            setPaintMaterial(materialId);

            const matDef = materialLibrary.get(materialId);
            if (matDef) {
                const buildMaterial = new ProceduralMaterial(matDef);
                voxelEditor.setBuildMaterial(buildMaterial, materialId);
            }
        }
    }
}

/**
 * Open the material editor for a specific material
 */
function openMaterialEditor(materialId) {
    const matDef = materialLibrary.get(materialId);
    if (!matDef) return;

    editorMaterialName.textContent = matDef.name;
    editorProperties.innerHTML = '';

    // Create property controls based on material type
    const params = matDef.params;

    // Common properties
    if (params.color !== undefined) {
        addColorProperty('Color', params.color, (value) => {
            params.color = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.color1 !== undefined) {
        addColorProperty('Color 1', params.color1, (value) => {
            params.color1 = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.color2 !== undefined) {
        addColorProperty('Color 2', params.color2, (value) => {
            params.color2 = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.colorTop !== undefined) {
        addColorProperty('Top Color', params.colorTop, (value) => {
            params.colorTop = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.colorBottom !== undefined) {
        addColorProperty('Bottom Color', params.colorBottom, (value) => {
            params.colorBottom = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.roughness !== undefined) {
        addSliderProperty('Roughness', params.roughness, 0, 1, 0.05, (value) => {
            params.roughness = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.metalness !== undefined) {
        addSliderProperty('Metalness', params.metalness, 0, 1, 0.05, (value) => {
            params.metalness = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.scale !== undefined) {
        addSliderProperty('Scale', params.scale, 0.1, 10, 0.1, (value) => {
            params.scale = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.noiseScale !== undefined) {
        addSliderProperty('Noise Scale', params.noiseScale, 0.5, 20, 0.5, (value) => {
            params.noiseScale = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.intensity !== undefined) {
        addSliderProperty('Intensity', params.intensity, 0, 2, 0.1, (value) => {
            params.intensity = value;
            updateMaterialFromEditor(materialId);
        });
    }

    // Brick-specific
    if (params.brickColor !== undefined) {
        addColorProperty('Brick Color', params.brickColor, (value) => {
            params.brickColor = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.mortarColor !== undefined) {
        addColorProperty('Mortar Color', params.mortarColor, (value) => {
            params.mortarColor = value;
            updateMaterialFromEditor(materialId);
        });
    }

    if (params.mortarWidth !== undefined) {
        addSliderProperty('Mortar Width', params.mortarWidth, 0.01, 0.2, 0.01, (value) => {
            params.mortarWidth = value;
            updateMaterialFromEditor(materialId);
        });
    }

    materialEditor.style.display = 'block';
}

/**
 * Add a color property control to the editor
 */
function addColorProperty(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'property-row';
    row.innerHTML = `
        <div class="property-label">
            <span>${label}</span>
        </div>
        <input type="color" value="${value}">
    `;

    const input = row.querySelector('input');
    input.addEventListener('input', (e) => {
        onChange(e.target.value);
    });

    editorProperties.appendChild(row);
}

/**
 * Add a slider property control to the editor
 */
function addSliderProperty(label, value, min, max, step, onChange) {
    const row = document.createElement('div');
    row.className = 'property-row';
    row.innerHTML = `
        <div class="property-label">
            <span>${label}</span>
            <span class="property-value">${value.toFixed(2)}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    `;

    const input = row.querySelector('input');
    const valueDisplay = row.querySelector('.property-value');

    input.addEventListener('input', (e) => {
        const newValue = parseFloat(e.target.value);
        valueDisplay.textContent = newValue.toFixed(2);
        onChange(newValue);
    });

    editorProperties.appendChild(row);
}

/**
 * Update material after editor changes
 */
function updateMaterialFromEditor(materialId) {
    const matDef = materialLibrary.get(materialId);
    if (!matDef) return;

    // Recreate the procedural material with updated params
    if (materialId === selectedMaterialId) {
        currentProceduralMaterial = new ProceduralMaterial(matDef);
        voxelWorld.setProceduralMaterial(currentProceduralMaterial);

        // Update preview
        // activeMaterialPreview removed - was for bottom-right materials button = getSwatchPreviewStyle(matDef);
    }

    // Update swatch preview
    const swatch = document.querySelector(`.material-swatch[data-material-id="${materialId}"]`);
    if (swatch) {
        const preview = swatch.querySelector('.swatch-preview');
        if (preview) {
            preview.style.background = getSwatchPreviewStyle(matDef);
        }
    }
}

/**
 * Open material editor for new system materials
 */
function openMaterialEditorNew(inventoryId) {
    const material = materialManager.getMaterial(inventoryId);
    if (!material) return;

    editorMaterialName.textContent = material.name;
    editorProperties.innerHTML = '';

    // Base properties section
    const baseHeader = document.createElement('div');
    baseHeader.className = 'editor-section-header';
    baseHeader.textContent = 'BASE PROPERTIES';
    editorProperties.appendChild(baseHeader);

    // Color
    addColorProperty('Color', material.base.color, (value) => {
        material.setColor(value);
        materialManager.refreshMaterialVoxels(inventoryId);
        updateSwatchPreview(inventoryId);
    });

    // Roughness
    addSliderProperty('Roughness', material.base.roughness, 0, 1, 0.05, (value) => {
        material.setRoughness(value);
        materialManager.refreshMaterialVoxels(inventoryId);
    });

    // Metalness
    addSliderProperty('Metalness', material.base.metalness, 0, 1, 0.05, (value) => {
        material.setMetalness(value);
        materialManager.refreshMaterialVoxels(inventoryId);
    });

    // Clearcoat
    addSliderProperty('Clearcoat', material.base.clearcoat, 0, 1, 0.05, (value) => {
        material.setClearcoat(value);
        materialManager.refreshMaterialVoxels(inventoryId);
    });

    // Layers section (if has layers)
    if (material.layers.length > 0) {
        const layerHeader = document.createElement('div');
        layerHeader.className = 'editor-section-header';
        layerHeader.textContent = 'PATTERN LAYERS';
        editorProperties.appendChild(layerHeader);

        material.layers.forEach((layer, index) => {
            const layerDiv = document.createElement('div');
            layerDiv.className = 'layer-editor';

            const typeDef = LayerTypeDefinitions[layer.type];
            if (!typeDef) return;

            const layerTitle = document.createElement('div');
            layerTitle.className = 'layer-title';
            layerTitle.textContent = typeDef.name;
            layerDiv.appendChild(layerTitle);

            // Layer params
            for (const [paramKey, paramDef] of Object.entries(typeDef.params)) {
                const value = layer.params[paramKey];

                if (paramDef.type === 'color') {
                    addLayerColorProperty(layerDiv, paramDef.label, value, (newValue) => {
                        material.setLayerParam(index, paramKey, newValue);
                        materialManager.refreshMaterialVoxels(inventoryId);
                    });
                } else if (paramDef.type === 'range') {
                    addLayerSliderProperty(layerDiv, paramDef.label, value, paramDef.min, paramDef.max, paramDef.step, (newValue) => {
                        material.setLayerParam(index, paramKey, newValue);
                        materialManager.refreshMaterialVoxels(inventoryId);
                    });
                }
            }

            // Layer opacity
            addLayerSliderProperty(layerDiv, 'Opacity', layer.opacity, 0, 1, 0.05, (newValue) => {
                material.setLayerOpacity(index, newValue);
                materialManager.refreshMaterialVoxels(inventoryId);
            });

            editorProperties.appendChild(layerDiv);
        });
    }

    materialEditor.style.display = 'block';
}

/**
 * Add color property to a layer editor
 */
function addLayerColorProperty(container, label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'property-row';
    row.innerHTML = `
        <div class="property-label"><span>${label}</span></div>
        <input type="color" value="${value}">
    `;

    const input = row.querySelector('input');
    input.addEventListener('input', (e) => onChange(e.target.value));

    container.appendChild(row);
}

/**
 * Add slider property to a layer editor
 */
function addLayerSliderProperty(container, label, value, min, max, step, onChange) {
    const row = document.createElement('div');
    row.className = 'property-row';
    row.innerHTML = `
        <div class="property-label">
            <span>${label}</span>
            <span class="property-value">${value.toFixed(2)}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    `;

    const input = row.querySelector('input');
    const valueDisplay = row.querySelector('.property-value');

    input.addEventListener('input', (e) => {
        const newValue = parseFloat(e.target.value);
        valueDisplay.textContent = newValue.toFixed(2);
        onChange(newValue);
    });

    container.appendChild(row);
}

/**
 * Update swatch preview after material edit
 */
function updateSwatchPreview(inventoryId) {
    const material = materialManager.getMaterial(inventoryId);
    if (!material) return;

    const swatch = document.querySelector(`.material-swatch[data-material-id="${inventoryId}"]`);
    if (swatch) {
        const preview = swatch.querySelector('.swatch-preview');
        if (preview) {
            preview.style.background = material.getPreviewColor();
        }
    }

    // Update active preview if this is the selected material
    if (inventoryId === materialManager.buildMaterialId) {
        // activeMaterialPreview removed - was for bottom-right materials button = material.getPreviewColor();
        paintColorIndicator.style.background = material.getPreviewColor();
    }
}

// Initialize materials panel
populateMaterialSwatches();

// Select the initial material from inventory
// Find solid-gray in the inventory
const initialInventory = materialManager.getInventory();
const grayMaterial = initialInventory.find(m => m.definitionId === 'solid-gray');
if (grayMaterial) {
    selectMaterial(grayMaterial.instanceId);
} else if (initialInventory.length > 0) {
    selectMaterial(initialInventory[0].instanceId);
}

// Set initial tool to Build
setTool('build');

function handleFlyControls() {
    if (keysPressed['Space']) {
        camera.position.y += flySpeed;
        controls.target.y += flySpeed;
    }
    if (keysPressed['KeyC']) {
        camera.position.y -= flySpeed;
        controls.target.y -= flySpeed;
    }
}

// Modified animation loop with fly controls
function animate() {
    requestAnimationFrame(animate);
    handleFlyControls();
    controls.update();
    voxelEditor.update();
    renderer.render(scene, camera);
}

animate();

// ==========================================
// Image Generation Dialog
// ==========================================

const generateDialog = document.getElementById('generateDialog');
const previewCanvas = document.getElementById('previewCanvas');
const generatePrompt = document.getElementById('generatePrompt');
const numVariations = document.getElementById('numVariations');
// AI Generation elements (now in generate dialog)
const aiApiKey = document.getElementById('genAiApiKey');
const aiProviderSelect = document.getElementById('genAiProvider');
const genSystemPrompt = document.getElementById('genSystemPrompt');
const genSettingsToggle = document.getElementById('genSettingsToggle');
const genSettingsPanel = document.getElementById('genSettingsPanel');
const generateBtn = document.getElementById('generateBtn');
const generateCancel = document.getElementById('generateCancel');
const generateProgress = document.getElementById('generateProgress');
const generateStatus = document.getElementById('generateStatus');
const generateResults = document.getElementById('generateResults');
const resultsGrid = document.getElementById('resultsGrid');

// Load saved settings from localStorage
const savedApiKey = localStorage.getItem('aiApiKey');
const savedProvider = localStorage.getItem('aiProvider');
const savedSystemPrompt = localStorage.getItem('aiSystemPrompt');

if (savedApiKey) {
    aiApiKey.value = savedApiKey;
}
if (savedProvider && aiProviderSelect) {
    aiProviderSelect.value = savedProvider;
}
if (savedSystemPrompt) {
    genSystemPrompt.value = savedSystemPrompt;
}

// Toggle settings panel in generate dialog
genSettingsToggle.addEventListener('click', () => {
    genSettingsPanel.classList.toggle('visible');
    genSettingsToggle.classList.toggle('active');
});

// Save settings when changed
aiApiKey.addEventListener('change', () => {
    const key = aiApiKey.value.trim();
    if (key) {
        localStorage.setItem('aiApiKey', key);
    }
});

aiProviderSelect.addEventListener('change', () => {
    localStorage.setItem('aiProvider', aiProviderSelect.value);
});

genSystemPrompt.addEventListener('change', () => {
    localStorage.setItem('aiSystemPrompt', genSystemPrompt.value);
});

// Capture frame elements
const captureFrame = document.getElementById('captureFrame');
const frameBorder = document.getElementById('frameBorder');
const frameLabelText = document.getElementById('frameLabelText');
const dimTop = document.getElementById('dimTop');
const dimBottom = document.getElementById('dimBottom');
const dimLeft = document.getElementById('dimLeft');
const dimRight = document.getElementById('dimRight');
const handleBottom = document.getElementById('handleBottom');
const handleRight = document.getElementById('handleRight');

// Gallery elements
const galleryBtn = document.getElementById('galleryBtn');
const galleryPanel = document.getElementById('galleryPanel');
const galleryGrid = document.getElementById('galleryGrid');
const galleryEmpty = document.getElementById('galleryEmpty');
const galleryCount = document.getElementById('galleryCount');
const closeGalleryBtn = document.getElementById('closeGallery');

// Gallery data - persisted images
let galleryImages = [];

// File System Access API - for saving to gallery folder
let galleryFolderHandle = null;

/**
 * Check if File System Access API is supported
 */
function isFileSystemAccessSupported() {
    return 'showDirectoryPicker' in window;
}

/**
 * Request access to gallery folder
 */
async function selectGalleryFolder() {
    if (!isFileSystemAccessSupported()) {
        alert('Your browser does not support saving directly to folders. Images will be downloaded instead.');
        return false;
    }

    try {
        galleryFolderHandle = await window.showDirectoryPicker({
            id: 'gallery-folder',
            mode: 'readwrite',
            startIn: 'documents'
        });

        // Save the folder name for display
        localStorage.setItem('galleryFolderName', galleryFolderHandle.name);

        return true;
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Failed to select folder:', e);
        }
        return false;
    }
}

/**
 * Save image to gallery folder
 */
async function saveImageToGalleryFolder(imageDataUrl, prompt) {
    // Generate filename
    const sanitizedPrompt = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 30)
        .replace(/_+$/, '');

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    const filename = `${sanitizedPrompt || 'generated'}_${timestamp}.png`;

    // If we have folder access, save directly
    if (galleryFolderHandle) {
        try {
            // Verify we still have permission
            const permission = await galleryFolderHandle.queryPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                const request = await galleryFolderHandle.requestPermission({ mode: 'readwrite' });
                if (request !== 'granted') {
                    throw new Error('Permission denied');
                }
            }

            // Convert data URL to blob
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();

            // Create file in gallery folder
            const fileHandle = await galleryFolderHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            console.log(`Saved: ${filename}`);
            return true;
        } catch (e) {
            console.error('Failed to save to folder:', e);
            // Fall through to download
        }
    }

    // Fallback: download the file
    downloadImage(imageDataUrl, filename);
    return false;
}

// Load gallery from localStorage on startup
function loadGallery() {
    try {
        const saved = localStorage.getItem('generatedImages');
        if (saved) {
            galleryImages = JSON.parse(saved);
            updateGalleryUI();
        }
    } catch (e) {
        galleryImages = [];
    }
}

// Save gallery metadata to localStorage (not the full images anymore)
function saveGalleryMetadata() {
    try {
        // Only save metadata (id, prompt, date, filename) not the full image data
        const metadata = galleryImages.map(img => ({
            id: img.id,
            prompt: img.prompt,
            date: img.date,
            filename: img.filename
        }));
        localStorage.setItem('galleryMetadata', JSON.stringify(metadata));
    } catch (e) {
        console.error('Failed to save gallery metadata:', e);
    }
}

// Save gallery to localStorage (keeping for backward compatibility)
function saveGallery() {
    try {
        // Keep only last 50 images to avoid storage limits
        if (galleryImages.length > 50) {
            galleryImages = galleryImages.slice(-50);
        }
        localStorage.setItem('generatedImages', JSON.stringify(galleryImages));
    } catch (e) {
        // Storage full - remove oldest images
        galleryImages = galleryImages.slice(-20);
        try {
            localStorage.setItem('generatedImages', JSON.stringify(galleryImages));
        } catch (e2) {}
    }
}

// Add image to gallery
async function addToGallery(imageDataUrl, prompt) {
    // Generate filename for reference
    const sanitizedPrompt = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 30)
        .replace(/_+$/, '');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    const filename = `${sanitizedPrompt || 'generated'}_${timestamp}.png`;

    const entry = {
        id: Date.now(),
        image: imageDataUrl,
        prompt: prompt,
        date: new Date().toISOString(),
        filename: filename
    };

    galleryImages.push(entry);
    saveGallery();
    updateGalleryUI();

    // Also save to gallery folder if available
    await saveImageToGalleryFolder(imageDataUrl, prompt);
}

// Update gallery UI
function updateGalleryUI() {
    const count = galleryImages.length;
    galleryCount.textContent = count;
    galleryBtn.style.display = count > 0 ? 'flex' : 'none';

    if (count === 0) {
        galleryEmpty.style.display = 'block';
        galleryGrid.innerHTML = '';
        return;
    }

    galleryEmpty.style.display = 'none';
    galleryGrid.innerHTML = '';

    // Show newest first
    const reversed = [...galleryImages].reverse();
    for (const item of reversed) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `
            <img src="${item.image}" alt="Generated image">
            <div class="item-overlay">
                <div class="item-prompt">${item.prompt || 'No prompt'}</div>
            </div>
        `;
        div.onclick = () => {
            // Open full size in new tab
            const win = window.open();
            win.document.write(`<img src="${item.image}" style="max-width:100%;max-height:100vh;">`);
        };
        galleryGrid.appendChild(div);
    }
}

// Gallery panel toggle
galleryBtn.addEventListener('click', () => {
    galleryPanel.classList.add('visible');
});

closeGalleryBtn.addEventListener('click', () => {
    galleryPanel.classList.remove('visible');
});

// Gallery folder selection
const selectGalleryFolderBtn = document.getElementById('selectGalleryFolderBtn');
const galleryFolderStatus = document.getElementById('galleryFolderStatus');
const galleryFolderBar = document.getElementById('galleryFolderBar');

selectGalleryFolderBtn.addEventListener('click', async () => {
    const success = await selectGalleryFolder();
    if (success) {
        updateGalleryFolderStatus();
    }
});

function updateGalleryFolderStatus() {
    if (galleryFolderHandle) {
        galleryFolderStatus.textContent = `📁 Saving to: ${galleryFolderHandle.name}`;
        galleryFolderBar.classList.add('has-folder');
        selectGalleryFolderBtn.textContent = 'Change';
    } else {
        const savedName = localStorage.getItem('galleryFolderName');
        if (savedName) {
            galleryFolderStatus.textContent = `📁 Previously: ${savedName} (click to reconnect)`;
        } else {
            galleryFolderStatus.textContent = '💾 Images saved to downloads';
        }
        galleryFolderBar.classList.remove('has-folder');
        selectGalleryFolderBtn.textContent = 'Select Folder';
    }
}

// Load gallery on startup
loadGallery();
updateGalleryFolderStatus();

// Custom capture frame bounds (null = use default centered)
let customFrameBounds = null;
const MIN_FRAME_SIZE = 200; // Minimum dimension in pixels
const MIN_ASPECT_RATIO = 0.5; // Minimum aspect ratio (width/height or height/width)

/**
 * Calculate the capture frame bounds
 */
function getCaptureFrameBounds() {
    if (customFrameBounds) {
        return { ...customFrameBounds };
    }

    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    // Use 75% of the smaller dimension for the frame (default square)
    const frameSize = Math.min(viewWidth, viewHeight) * 0.75;

    const left = (viewWidth - frameSize) / 2;
    const top = (viewHeight - frameSize) / 2;

    return {
        left: left,
        top: top,
        width: frameSize,
        height: frameSize,
        right: left + frameSize,
        bottom: top + frameSize
    };
}

/**
 * Set custom frame bounds with validation
 */
function setCustomFrameBounds(left, top, width, height) {
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    // Enforce minimum dimensions
    width = Math.max(MIN_FRAME_SIZE, width);
    height = Math.max(MIN_FRAME_SIZE, height);

    // Enforce aspect ratio constraints (prevent very thin frames)
    const aspect = width / height;
    if (aspect < MIN_ASPECT_RATIO) {
        width = height * MIN_ASPECT_RATIO;
    } else if (aspect > 1 / MIN_ASPECT_RATIO) {
        height = width * MIN_ASPECT_RATIO;
    }

    // Keep frame within viewport bounds
    left = Math.max(20, Math.min(left, viewWidth - width - 20));
    top = Math.max(40, Math.min(top, viewHeight - height - 100)); // Leave space for dialog

    customFrameBounds = {
        left: left,
        top: top,
        width: width,
        height: height,
        right: left + width,
        bottom: top + height
    };

    updateCaptureFrame();
}

// Resize handle dragging
let resizeHandle = null;
let resizeStartBounds = null;
let resizeStartMouse = null;

function initFrameResize() {
    const handles = document.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            resizeHandle = handle.dataset.handle;
            resizeStartBounds = getCaptureFrameBounds();
            resizeStartMouse = { x: e.clientX, y: e.clientY };

            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeEnd);
        });
    });
}

function onResizeMove(e) {
    if (!resizeHandle || !resizeStartBounds) return;

    const dx = e.clientX - resizeStartMouse.x;
    const dy = e.clientY - resizeStartMouse.y;

    let { left, top, width, height } = resizeStartBounds;

    // Calculate center of the original frame (this stays fixed)
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    // Calculate max sizes based on center position and viewport
    const maxWidth = Math.min(centerX - 20, window.innerWidth - centerX - 20) * 2;
    const maxHeight = Math.min(centerY - 40, window.innerHeight - centerY - 100) * 2;

    // Mirrored resize from center
    if (resizeHandle === 'bottom') {
        // Bottom handle: adjust height symmetrically (drag down = taller)
        height += dy * 2;
    } else if (resizeHandle === 'right') {
        // Right handle: adjust width symmetrically (drag right = wider)
        width += dx * 2;
    }

    // Clamp dimensions BEFORE calculating position
    width = Math.max(MIN_FRAME_SIZE, Math.min(width, maxWidth));
    height = Math.max(MIN_FRAME_SIZE, Math.min(height, maxHeight));

    // Enforce aspect ratio constraints
    const aspect = width / height;
    if (aspect < MIN_ASPECT_RATIO) {
        width = height * MIN_ASPECT_RATIO;
    } else if (aspect > 1 / MIN_ASPECT_RATIO) {
        height = width * MIN_ASPECT_RATIO;
    }

    // Recalculate position to keep centered at original center
    left = centerX - width / 2;
    top = centerY - height / 2;

    // Update custom bounds directly (bypass setCustomFrameBounds to avoid double clamping)
    customFrameBounds = {
        left: left,
        top: top,
        width: width,
        height: height,
        right: left + width,
        bottom: top + height
    };

    updateCaptureFrame();

    // Update label to show dimensions while resizing
    frameLabelText.textContent = `📷 ${Math.round(width)} × ${Math.round(height)}`;
}

function onResizeEnd() {
    resizeHandle = null;
    resizeStartBounds = null;
    resizeStartMouse = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);

    // Reset label after a short delay
    setTimeout(() => {
        frameLabelText.textContent = '📷 Capture Area - Drag corners to resize';
    }, 1500);
}

// Initialize resize handlers when DOM is ready
initFrameResize();

/**
 * Update the capture frame overlay position
 */
function updateCaptureFrame() {
    const bounds = getCaptureFrameBounds();

    // Position the frame border
    frameBorder.style.left = bounds.left + 'px';
    frameBorder.style.top = bounds.top + 'px';
    frameBorder.style.width = bounds.width + 'px';
    frameBorder.style.height = bounds.height + 'px';

    // Position resize handles at bottom-center and right-center
    handleBottom.style.left = (bounds.left + bounds.width / 2) + 'px';
    handleBottom.style.top = bounds.bottom + 'px';
    handleRight.style.left = bounds.right + 'px';
    handleRight.style.top = (bounds.top + bounds.height / 2) + 'px';

    // Position dim overlays
    dimTop.style.left = '0';
    dimTop.style.top = '0';
    dimTop.style.width = '100vw';
    dimTop.style.height = bounds.top + 'px';

    dimBottom.style.left = '0';
    dimBottom.style.top = bounds.bottom + 'px';
    dimBottom.style.width = '100vw';
    dimBottom.style.height = (window.innerHeight - bounds.bottom) + 'px';

    dimLeft.style.left = '0';
    dimLeft.style.top = bounds.top + 'px';
    dimLeft.style.width = bounds.left + 'px';
    dimLeft.style.height = bounds.height + 'px';

    dimRight.style.left = bounds.right + 'px';
    dimRight.style.top = bounds.top + 'px';
    dimRight.style.width = (window.innerWidth - bounds.right) + 'px';
    dimRight.style.height = bounds.height + 'px';
}

/**
 * Capture the view within the frame bounds as base64 PNG
 */
function captureCanvasView() {
    // Render once to ensure fresh frame
    renderer.render(scene, camera);

    const bounds = getCaptureFrameBounds();
    const canvas = renderer.domElement;

    // Calculate aspect ratio and output dimensions
    // Max output dimension is 1024, scale to maintain aspect ratio
    const aspect = bounds.width / bounds.height;
    let outWidth, outHeight;
    if (aspect >= 1) {
        outWidth = 1024;
        outHeight = Math.round(1024 / aspect);
    } else {
        outHeight = 1024;
        outWidth = Math.round(1024 * aspect);
    }

    // Create a temporary canvas for the cropped capture
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = outWidth;
    tempCanvas.height = outHeight;
    const ctx = tempCanvas.getContext('2d');

    // Calculate the source region from the WebGL canvas
    // The bounds are in screen coordinates, canvas might have different pixel ratio
    const pixelRatio = window.devicePixelRatio || 1;
    const srcX = bounds.left * pixelRatio;
    const srcY = bounds.top * pixelRatio;
    const srcW = bounds.width * pixelRatio;
    const srcH = bounds.height * pixelRatio;

    // Draw the cropped region to the temp canvas
    ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, outWidth, outHeight);

    return tempCanvas.toDataURL('image/png');
}

/**
 * Show the generate dialog with frame overlay
 */
function showGenerateDialog() {
    generateDialog.classList.add('visible');
    captureFrame.classList.add('visible');
    dialogOpen = true;
    generateProgress.style.display = 'none';
    generateResults.style.display = 'none';
    generateBtn.disabled = false;

    // Disable editing and hide visual helpers
    voxelEditor.setEnabled(false);
    voxelWorld.setMirrorPlaneVisible(false);
    voxelWorld.clearSelection();
    gridHelper.visible = false;

    // Update frame position
    updateCaptureFrame();

    // Update frame on window resize
    window.addEventListener('resize', updateCaptureFrame);

    // Focus the prompt textarea
    setTimeout(() => generatePrompt.focus(), 100);
}

/**
 * Hide the generate dialog
 */
function hideGenerateDialog() {
    generateDialog.classList.remove('visible');
    captureFrame.classList.remove('visible');
    dialogOpen = false;
    customFrameBounds = null; // Reset to default for next time
    window.removeEventListener('resize', updateCaptureFrame);

    // Re-enable editing and restore visual helpers
    voxelEditor.setEnabled(true);
    gridHelper.visible = true;
    if (voxelWorld.mirrorEnabled) {
        voxelWorld.setMirrorPlaneVisible(true);
    }
}

/**
 * Generate images using selected AI provider
 */
async function generateImages() {
    const apiKey = aiApiKey.value.trim();
    const prompt = generatePrompt.value.trim();
    const variations = parseInt(numVariations.value);
    const provider = aiProviderSelect.value;

    if (!apiKey) {
        // Open settings panel and highlight API key field
        genSettingsPanel.classList.add('visible');
        genSettingsToggle.classList.add('active');
        aiApiKey.focus();
        alert('Please enter your API key (click the gear icon to configure)');
        return;
    }

    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    // Show progress
    generateBtn.disabled = true;
    generateProgress.style.display = 'block';
    generateResults.style.display = 'none';
    resultsGrid.innerHTML = '';

    // Capture the current view
    const viewImageBase64 = captureCanvasView().split(',')[1]; // Remove data URL prefix

    const generatedImages = [];

    try {
        for (let i = 0; i < variations; i++) {
            generateStatus.textContent = `Generating image ${i + 1} of ${variations}...`;

            let imageData;
            if (provider === 'stability') {
                imageData = await callStabilityImageGeneration(apiKey, prompt, viewImageBase64, i);
            } else if (provider === 'openai') {
                imageData = await callOpenAIImageGeneration(apiKey, prompt, viewImageBase64, i);
            } else {
                imageData = await callGeminiImageGeneration(apiKey, prompt, viewImageBase64, i);
            }

            if (imageData) {
                generatedImages.push(imageData);
                // Display results as they come in (don't add to gallery yet - wait for all)
                displayGeneratedImages(generatedImages, null);
            }

            // Add delay between requests to avoid rate limiting
            if (i < variations - 1) {
                generateStatus.textContent = `Generated ${i + 1}/${variations}. Waiting before next request...`;
                await sleep(1000);
            }
        }

        // Final display - add to gallery now
        resultsGrid.innerHTML = ''; // Clear to avoid duplicates in gallery
        displayGeneratedImages(generatedImages, prompt);
        generateProgress.style.display = 'none';

    } catch (error) {
        // Show any images we did manage to generate
        if (generatedImages.length > 0) {
            resultsGrid.innerHTML = '';
            displayGeneratedImages(generatedImages, prompt);
            generateStatus.textContent = `Generated ${generatedImages.length} image(s). Error on remaining: ${error.message}`;
            generateProgress.style.display = 'block';
        } else {
            generateStatus.textContent = `Error: ${error.message}`;
        }

        setTimeout(() => {
            generateProgress.style.display = 'none';
            generateBtn.disabled = false;
        }, 4000);
    }
}

/**
 * Sleep helper for delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Stability AI API for image-to-image generation
 * This actually sends the image and transforms it based on the prompt
 */
async function callStabilityImageGeneration(apiKey, prompt, imageBase64, variationIndex) {
    // Use the Stable Diffusion img2img endpoint
    const url = 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image';

    // Build the full prompt with Unreal Engine aesthetic
    const fullPrompt = `${prompt}, low-poly style with subtle detail, polished Unreal Engine look, cinematic lighting, crisp materials, modern shading, clean uncluttered background`;

    // Convert base64 to blob for FormData
    const imageBlob = await fetch(`data:image/png;base64,${imageBase64}`).then(r => r.blob());

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('init_image', imageBlob, 'screenshot.png');
    formData.append('init_image_mode', 'IMAGE_STRENGTH');
    formData.append('image_strength', '0.35'); // How much to follow the original (0.35 = follow closely)
    formData.append('text_prompts[0][text]', fullPrompt);
    formData.append('text_prompts[0][weight]', '1');
    formData.append('text_prompts[1][text]', 'blurry, low quality, distorted, watermark, text, ui elements');
    formData.append('text_prompts[1][weight]', '-1'); // Negative prompt
    formData.append('cfg_scale', '7');
    formData.append('samples', '1');
    formData.append('steps', '30');
    formData.append('seed', variationIndex > 0 ? Math.floor(Math.random() * 2147483647) : 0);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();

        let errorDetail = '';
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.message || errorJson.name || '';
        } catch (e) {}

        if (response.status === 401) {
            throw new Error('Invalid Stability AI API key. Please check your key in Settings.');
        } else if (response.status === 402) {
            throw new Error('Insufficient credits. Please add credits to your Stability AI account.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait and try again.');
        }

        throw new Error(`Stability AI error ${response.status}: ${errorDetail || 'Unknown error'}`);
    }

    const data = await response.json();

    // Extract image from response
    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
        return `data:image/png;base64,${data.artifacts[0].base64}`;
    }

    return null;
}

// Get the system prompt from the settings panel (dynamic)
function getSystemPrompt() {
    return genSystemPrompt.value.trim();
}

/**
 * Call OpenAI DALL-E API for image generation
 */
async function callOpenAIImageGeneration(apiKey, prompt, imageBase64, variationIndex) {
    // Build the full prompt with system constraints + user prompt
    const systemPrompt = getSystemPrompt();
    const fullPrompt = `${systemPrompt} ${prompt}

Style notes: Render as a high-quality 3D model with the described materials and lighting. Keep the background clean and simple.
${variationIndex > 0 ? `Create variation ${variationIndex + 1} with subtle differences in lighting or material details.` : ''}`;

    // DALL-E 3 doesn't support image-to-image directly, so we describe the view in the prompt
    // For true img2img, we'd need to use the edits endpoint with DALL-E 2
    const url = 'https://api.openai.com/v1/images/generations';

    const requestBody = {
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "b64_json"
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();

        let errorDetail = '';
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.error?.message || '';
        } catch (e) {}

        if (response.status === 401) {
            throw new Error('Invalid OpenAI API key. Please check your key in Settings.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait and try again.');
        } else if (response.status === 400) {
            throw new Error(`Request error: ${errorDetail || 'Invalid request'}`);
        }

        throw new Error(`OpenAI API error ${response.status}: ${errorDetail || 'Unknown error'}`);
    }

    const data = await response.json();

    // Extract image from response
    if (data.data && data.data[0] && data.data[0].b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
    }

    return null;
}

/**
 * Call Gemini API for image generation with retry logic
 */
async function callGeminiImageGeneration(apiKey, prompt, imageBase64, variationIndex, retryCount = 0) {
    const maxRetries = 2;

    // Use Gemini 3 Pro Image Preview (codename "Nano Banana Pro") for best quality
    // Alternative: 'gemini-2.5-flash-image' for faster/cheaper, 'gemini-2.0-flash-exp' for legacy
    const selectedModel = 'gemini-3-pro-image-preview';

    // Use selected Gemini model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    // Build the full prompt with system constraints + user prompt
    const systemPrompt = getSystemPrompt();
    const fullPrompt = `${systemPrompt} ${prompt}
${variationIndex > 0 ? `\nThis is variation ${variationIndex + 1} - use slightly different lighting or material accent.` : ''}`;

    const requestBody = {
        contents: [{
            parts: [
                {
                    inline_data: {
                        mime_type: "image/png",
                        data: imageBase64
                    }
                },
                {
                    text: fullPrompt
                }
            ]
        }],
        generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Try to parse error for more details
        let errorDetail = '';
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.error?.message || errorJson.message || '';
        } catch (e) {
            // Not JSON
        }

        // Handle rate limiting with retry
        if (response.status === 429 && retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount + 1) * 2000; // Exponential backoff: 4s, 8s, 16s
            generateStatus.textContent = `Rate limited. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`;
            await sleep(waitTime);
            return callGeminiImageGeneration(apiKey, prompt, imageBase64, variationIndex, retryCount + 1);
        }

        // Provide helpful error messages
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a minute and try again, or reduce the number of variations.');
        } else if (response.status === 400) {
            throw new Error(`Invalid request: ${errorDetail || 'The model may not support image generation, or the prompt was blocked.'}`);
        } else if (response.status === 403) {
            throw new Error('API key invalid or does not have permission for image generation.');
        } else if (response.status === 404) {
            throw new Error(`Model "${selectedModel}" not found. Try a different model in Settings.`);
        }

        throw new Error(`API error ${response.status}: ${errorDetail || response.statusText}`);
    }

    const data = await response.json();

    // Extract generated image from response
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const parts = data.candidates[0].content.parts;
        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }

    return null;
}

/**
 * Call Imagen API (different endpoint format)
 */
async function callImagenAPI(apiKey, prompt, imageBase64, variationIndex, modelName) {
    // Imagen uses a different API structure - generateImages endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateImages?key=${apiKey}`;

    const fullPrompt = `Transform this 3D voxel model: ${prompt}. Keep the same camera angle and composition.${variationIndex > 0 ? ` Variation ${variationIndex + 1}.` : ''}`;

    const requestBody = {
        prompt: fullPrompt,
        referenceImages: [{
            referenceImage: {
                bytesBase64Encoded: imageBase64
            },
            referenceType: "REFERENCE_TYPE_STYLE"
        }],
        config: {
            numberOfImages: 1
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();

        let errorDetail = '';
        try {
            const errorJson = JSON.parse(errorText);
            errorDetail = errorJson.error?.message || '';
        } catch (e) {}

        throw new Error(`Imagen API error ${response.status}: ${errorDetail || 'Unknown error'}`);
    }

    const data = await response.json();

    // Extract image from Imagen response
    if (data.generatedImages && data.generatedImages[0]) {
        const img = data.generatedImages[0];
        if (img.image && img.image.bytesBase64Encoded) {
            return `data:image/png;base64,${img.image.bytesBase64Encoded}`;
        }
    }

    return null;
}

/**
 * Display generated images in the results grid
 */
function displayGeneratedImages(images, prompt) {
    generateProgress.style.display = 'none';
    generateBtn.disabled = false;

    if (images.length === 0) {
        generateStatus.textContent = 'No images were generated. Please try again.';
        generateProgress.style.display = 'block';
        return;
    }

    generateResults.style.display = 'block';
    resultsGrid.innerHTML = '';

    images.forEach((imgSrc, index) => {
        const item = document.createElement('div');
        item.className = 'result-item';

        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = `Generated image ${index + 1}`;
        img.onclick = () => openImageFullscreen(imgSrc);

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'download-btn';
        downloadBtn.textContent = '⬇ Save';
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            downloadImage(imgSrc, `generated_${Date.now()}_${index + 1}.png`);
        };

        item.appendChild(img);
        item.appendChild(downloadBtn);
        resultsGrid.appendChild(item);

        // Add to gallery only on final display (when prompt is provided)
        if (prompt) {
            addToGallery(imgSrc, prompt);
        }
    });
}

/**
 * Open image in fullscreen overlay
 */
function openImageFullscreen(imgSrc) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 2000;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
    `;
    overlay.onclick = () => overlay.remove();

    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';

    overlay.appendChild(img);
    document.body.appendChild(overlay);
}

/**
 * Download image
 */
function downloadImage(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Event listeners for generate dialog
generateCancel.addEventListener('click', hideGenerateDialog);
generateBtn.addEventListener('click', generateImages);

// Allow Enter key to generate (with Ctrl/Cmd for newline)
generatePrompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateImages();
    }
});

// Escape key closes dialogs
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (generateDialog.classList.contains('visible')) {
            hideGenerateDialog();
        }
        if (galleryPanel.classList.contains('visible')) {
            galleryPanel.classList.remove('visible');
        }
        if (saveDialog && saveDialog.classList.contains('visible')) {
            hideSaveDialog();
        }
        hideMirrorDialog();
        hideExportDialog();
    }
});

// ========================================
// SAVE / LOAD MODEL FUNCTIONALITY
// ========================================

let saveDialog = null;
let saveFilenameInput = null;
let lastSavedFilename = 'my_model'; // Remember last used name

/**
 * Create save dialog (uses UI.md design system)
 */
function createSaveDialog() {
    if (saveDialog) return;

    saveDialog = document.createElement('div');
    saveDialog.className = 'modal-overlay transparent-bg';
    saveDialog.innerHTML = `
        <div class="modal-dialog generate-dialog" style="max-width: 360px; padding: 20px;">
            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 16px; font-weight: 600; text-align: center;">Save Model</h3>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <input type="text" id="saveFilenameInput"
                       placeholder="Enter model name..."
                       style="flex: 1; padding: 12px 14px; border-radius: 8px; background: rgba(0, 0, 0, 0.3); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); font-size: 14px; font-family: inherit; transition: border-color 0.2s, box-shadow 0.2s; outline: none;">
                <span style="color: #666; font-size: 13px;">.json</span>
            </div>
            <p id="saveLocation" style="margin: 0 0 16px 0; color: #666; font-size: 11px; text-align: center;">
                Saves to your Downloads folder
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="saveCancelBtn" style="flex: 1; padding: 12px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #888; font-size: 13px; cursor: pointer; transition: all 0.2s;">
                    Cancel
                </button>
                <button id="saveConfirmBtn" class="modal-btn modal-btn-primary" style="flex: 1; padding: 12px; margin: 0;">
                    💾 Save
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(saveDialog);

    saveFilenameInput = document.getElementById('saveFilenameInput');
    const confirmBtn = document.getElementById('saveConfirmBtn');
    const cancelBtn = document.getElementById('saveCancelBtn');

    // Add focus styles for input
    saveFilenameInput.addEventListener('focus', () => {
        saveFilenameInput.style.borderColor = '#4ecdc4';
        saveFilenameInput.style.boxShadow = '0 0 0 3px rgba(78, 205, 196, 0.15)';
    });
    saveFilenameInput.addEventListener('blur', () => {
        saveFilenameInput.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        saveFilenameInput.style.boxShadow = 'none';
    });

    // Add hover styles for cancel button
    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        cancelBtn.style.color = '#aaa';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.color = '#888';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });

    confirmBtn.addEventListener('click', () => {
        performSave();
    });

    cancelBtn.addEventListener('click', () => {
        hideSaveDialog();
    });

    saveFilenameInput.addEventListener('keydown', (e) => {
        if (e.code === 'Enter') {
            e.preventDefault();
            performSave();
        } else if (e.code === 'Escape') {
            hideSaveDialog();
        }
    });
}

/**
 * Show save dialog
 */
function showSaveDialog() {
    createSaveDialog();
    saveDialog.classList.add('visible');
    saveFilenameInput.value = lastSavedFilename;
    saveFilenameInput.focus();
    saveFilenameInput.select();
    dialogOpen = true;
}

/**
 * Hide save dialog
 */
function hideSaveDialog() {
    if (saveDialog) {
        saveDialog.classList.remove('visible');
    }
    dialogOpen = false;
}

/**
 * Perform the actual save operation
 */
function performSave() {
    let filename = saveFilenameInput.value.trim();
    if (!filename) {
        filename = 'untitled';
    }

    // Sanitize filename (remove invalid characters)
    filename = filename.replace(/[<>:"/\\|?*]/g, '_');

    // Remember for next time
    lastSavedFilename = filename;

    const data = voxelWorld.serialize();

    // Add metadata - include new material system data
    const saveData = {
        version: '2.1',
        name: filename,
        createdAt: new Date().toISOString(),
        mirrorEnabled: voxelWorld.mirrorEnabled,
        mirrorAxis: voxelWorld.mirrorAxis,
        gameItems: gameItemManager.serialize(),
        // Voxel models
        models: modelManager.serialize(),
        // New material system
        materials: materialManager.serialize(),
        // Legacy support
        selectedMaterial: selectedMaterialId,
        materialDefinition: materialLibrary.get(selectedMaterialId) || null,
        ...data
    };

    const json = JSON.stringify(saveData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const fullFilename = `${filename}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fullFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hideSaveDialog();
    showSaveConfirmation(fullFilename);
}

/**
 * Trigger save dialog (called by Ctrl+S)
 */
function saveModel() {
    showSaveDialog();
}

/**
 * Show save confirmation toast
 */
function showSaveConfirmation(filename) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.innerHTML = `<span class="toast-icon">💾</span> Saved as <strong>${filename}</strong>`;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/**
 * Restore per-voxel materials after loading a model
 * Now uses the new MaterialManager system
 */
function restoreVoxelMaterials(loadedData = null) {
    // If we have new-format material data, load it first
    if (loadedData && loadedData.materials) {
        materialManager.deserialize(loadedData.materials);
        populateMaterialSwatches();
    }

    // Use MaterialManager to restore voxel materials
    materialManager.restoreVoxelMaterials();

    // Legacy fallback for old save files
    for (const voxel of voxelWorld.voxels.values()) {
        if (voxel.materialId && !materialManager.getMaterial(voxel.materialId)) {
            // Old-style definition ID - try to migrate
            const matDef = materialLibrary.get(voxel.materialId);
            if (matDef) {
                // Create legacy ProceduralMaterial
                voxel.material = new ProceduralMaterial(matDef);
                const key = voxel.getKey();
                const mesh = voxelWorld.meshes.get(key);
                if (mesh) {
                    mesh.material = voxel.material.material;
                }
            }
        }
    }
}

/**
 * Load model from a .json file
 */
function loadModel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);

                // Validate it's a voxel model file
                if (!data.voxels || !Array.isArray(data.voxels)) {
                    throw new Error('Invalid model file format');
                }

                // Load the model
                voxelWorld.deserialize(data);

                // Restore mirror mode if it was saved
                if (data.mirrorEnabled) {
                    voxelWorld.mirrorEnabled = true;
                    voxelWorld.mirrorAxis = data.mirrorAxis || 'x';
                    voxelWorld.setMirrorPlaneVisible(true);
                    voxelWorld.updateAllMirrors();
                }

                // Load game items if present
                if (data.gameItems && Array.isArray(data.gameItems)) {
                    gameItemManager.deserialize(data.gameItems);
                    updateGameItemsUI();
                    selectGameItem(null); // Clear selection
                }

                // Load voxel models if present
                if (data.models && Array.isArray(data.models)) {
                    modelManager.deserialize(data.models);
                    // Clear any model selection/editing state
                    if (isEditingModel) {
                        exitModelEdit();
                    }
                    transformControls.detach();
                    modelManager.clearSelection();
                }

                // Restore material selection if present
                if (data.selectedMaterial && materialLibrary.get(data.selectedMaterial)) {
                    selectMaterial(data.selectedMaterial);
                }

                // Restore per-voxel materials (pass the full data for new format)
                restoreVoxelMaterials(data);

                // Reposition camera to frame the model
                repositionCameraToModel();

                // Show confirmation
                showLoadConfirmation(file.name);

            } catch (err) {
                alert(`Failed to load model: ${err.message}`);
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

/**
 * Reposition camera to nicely frame the loaded model
 * Creates an isometric-like view from above-right-front
 */
function repositionCameraToModel() {
    // Calculate bounding box of all voxels
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const voxel of voxelWorld.voxels.values()) {
        minX = Math.min(minX, voxel.x - 0.5);
        minY = Math.min(minY, voxel.y - 0.5);
        minZ = Math.min(minZ, voxel.z - 0.5);
        maxX = Math.max(maxX, voxel.x + 0.5);
        maxY = Math.max(maxY, voxel.y + 0.5);
        maxZ = Math.max(maxZ, voxel.z + 0.5);
    }

    // If no voxels, use default position
    if (!isFinite(minX)) {
        camera.position.set(3, 4, 5);
        controls.target.set(0, 0, 0);
        controls.update();
        return;
    }

    // Calculate center and size of model
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    // Position camera at a nice isometric-like angle
    // Distance based on model size (with some padding)
    const distance = maxSize * 1.8 + 2;

    // Camera position: above, to the right, and in front
    // Similar to the chair image view
    camera.position.set(
        centerX + distance * 0.6,
        centerY + distance * 0.5,
        centerZ + distance * 0.7
    );

    // Look at the center of the model (slightly below center for better framing)
    controls.target.set(centerX, centerY - 0.2, centerZ);
    controls.update();
}

/**
 * Show load confirmation toast
 */
function showLoadConfirmation(filename) {
    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.innerHTML = `<span class="toast-icon">📂</span> Loaded <strong>${filename}</strong>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/**
 * Auto-save generated image to downloads
 */
function autoSaveGeneratedImage(dataUrl, prompt) {
    // Generate filename from prompt (sanitized) + timestamp
    const sanitizedPrompt = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 30)
        .replace(/_+$/, '');

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    const filename = `${sanitizedPrompt || 'generated'}_${timestamp}.png`;

    downloadImage(dataUrl, filename);
}
