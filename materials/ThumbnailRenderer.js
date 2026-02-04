/**
 * ThumbnailRenderer - Generates material preview thumbnails using THREE.js
 *
 * Creates small rendered images of materials showing their full appearance
 * including base color, patterns, emissive, metalness, etc.
 */

import * as THREE from 'three';

// Singleton renderer shared across all thumbnails
let sharedRenderer = null;
let sharedScene = null;
let sharedCamera = null;
let sharedCube = null;
let sharedLight = null;
let sharedAmbient = null;

const THUMBNAIL_SIZE = 64;

/**
 * Initialize the shared rendering resources
 */
function initSharedRenderer() {
    if (sharedRenderer) return;

    // Create renderer
    sharedRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
    });
    sharedRenderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sharedRenderer.toneMappingExposure = 1.0;

    // Create scene
    sharedScene = new THREE.Scene();
    sharedScene.background = new THREE.Color(0x2a2a3a);

    // Create camera
    sharedCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    sharedCamera.position.set(0, 0, 2.5);
    sharedCamera.lookAt(0, 0, 0);

    // Create cube geometry
    const geometry = new THREE.BoxGeometry(1.0, 1.0, 1.0);
    sharedCube = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    // Tilt the cube at an angle for better 3D view
    sharedCube.rotation.x = 0.4;
    sharedCube.rotation.y = 0.6;
    sharedScene.add(sharedCube);

    // Add lights
    sharedLight = new THREE.DirectionalLight(0xffffff, 2);
    sharedLight.position.set(2, 2, 2);
    sharedScene.add(sharedLight);

    sharedAmbient = new THREE.AmbientLight(0xffffff, 0.4);
    sharedScene.add(sharedAmbient);
}

/**
 * Render a material thumbnail and return as data URL
 * @param {LayeredMaterial} material - The material to render
 * @returns {string} Data URL of the rendered thumbnail
 */
export function renderThumbnail(material) {
    initSharedRenderer();

    // Get the THREE.js material from the LayeredMaterial
    // LayeredMaterial uses a getter 'material' to access the THREE material
    const threeMaterial = material.material;

    if (!threeMaterial) {
        throw new Error('Material has no THREE.js material');
    }

    // Apply material to sphere
    sharedCube.material = threeMaterial;

    // Render
    sharedRenderer.render(sharedScene, sharedCamera);

    // Get data URL
    return sharedRenderer.domElement.toDataURL('image/png');
}

/**
 * Render a thumbnail directly to a canvas element
 * @param {LayeredMaterial} material - The material to render
 * @param {HTMLCanvasElement} canvas - Target canvas
 */
export function renderThumbnailToCanvas(material, canvas) {
    const dataUrl = renderThumbnail(material);
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
}

/**
 * Create a thumbnail image element for a material
 * @param {LayeredMaterial} material - The material to render
 * @returns {HTMLImageElement} Image element with the thumbnail
 */
export function createThumbnailImage(material) {
    const img = new Image();
    img.width = THUMBNAIL_SIZE;
    img.height = THUMBNAIL_SIZE;
    img.src = renderThumbnail(material);
    return img;
}

/**
 * Update an existing element's background with a material thumbnail
 * @param {LayeredMaterial} material - The material to render
 * @param {HTMLElement} element - Element to update
 */
export function updateElementThumbnail(material, element) {
    const dataUrl = renderThumbnail(material);
    element.style.backgroundImage = `url(${dataUrl})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
}

/**
 * Batch render multiple thumbnails efficiently
 * @param {LayeredMaterial[]} materials - Array of materials to render
 * @returns {Map<string, string>} Map of material instanceId to data URL
 */
export function renderThumbnailBatch(materials) {
    initSharedRenderer();

    const results = new Map();

    for (const material of materials) {
        const threeMaterial = material.getThreeMaterial();
        sharedCube.material = threeMaterial;
        sharedRenderer.render(sharedScene, sharedCamera);
        results.set(material.instanceId, sharedRenderer.domElement.toDataURL('image/png'));
    }

    return results;
}

/**
 * Clean up shared renderer resources
 */
export function disposeThumbnailRenderer() {
    if (sharedRenderer) {
        sharedRenderer.dispose();
        sharedRenderer = null;
    }
    if (sharedCube) {
        sharedCube.geometry.dispose();
        sharedCube = null;
    }
    sharedScene = null;
    sharedCamera = null;
    sharedLight = null;
    sharedAmbient = null;
}
