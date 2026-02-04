/**
 * Default Material Definitions
 *
 * These are immutable templates that users can add to their inventory.
 * Each definition has:
 * - id: Unique identifier
 * - name: Display name
 * - category: For organization (solid, pattern, metal, custom)
 * - base: Base surface properties (color, roughness, metalness, clearcoat)
 * - layers: Array of pattern layers to apply on top
 */

import { LayerType, BlendMode } from './LayerTypes.js';

export const MaterialCategory = {
    Solid: 'solid',
    Pattern: 'pattern',
    Metal: 'metal',
    Natural: 'natural',
    Custom: 'custom'
};

/**
 * Default material definitions
 */
export const DefaultMaterialDefinitions = {
    // ═══════════════════════════════════════════════════════════════
    // SOLID COLORS
    // ═══════════════════════════════════════════════════════════════

    'solid-white': {
        id: 'solid-white',
        name: 'White',
        category: MaterialCategory.Solid,
        base: { color: '#ffffff', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-gray': {
        id: 'solid-gray',
        name: 'Gray',
        category: MaterialCategory.Solid,
        base: { color: '#888888', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-darkgray': {
        id: 'solid-darkgray',
        name: 'Dark Gray',
        category: MaterialCategory.Solid,
        base: { color: '#444444', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-black': {
        id: 'solid-black',
        name: 'Black',
        category: MaterialCategory.Solid,
        base: { color: '#222222', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-red': {
        id: 'solid-red',
        name: 'Red',
        category: MaterialCategory.Solid,
        base: { color: '#e74c3c', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-orange': {
        id: 'solid-orange',
        name: 'Orange',
        category: MaterialCategory.Solid,
        base: { color: '#e67e22', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-yellow': {
        id: 'solid-yellow',
        name: 'Yellow',
        category: MaterialCategory.Solid,
        base: { color: '#f1c40f', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-green': {
        id: 'solid-green',
        name: 'Green',
        category: MaterialCategory.Solid,
        base: { color: '#2ecc71', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-teal': {
        id: 'solid-teal',
        name: 'Teal',
        category: MaterialCategory.Solid,
        base: { color: '#4ecdc4', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-blue': {
        id: 'solid-blue',
        name: 'Blue',
        category: MaterialCategory.Solid,
        base: { color: '#3498db', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-purple': {
        id: 'solid-purple',
        name: 'Purple',
        category: MaterialCategory.Solid,
        base: { color: '#9b59b6', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-pink': {
        id: 'solid-pink',
        name: 'Pink',
        category: MaterialCategory.Solid,
        base: { color: '#e91e63', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-brown': {
        id: 'solid-brown',
        name: 'Brown',
        category: MaterialCategory.Solid,
        base: { color: '#795548', roughness: 0.6, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },
    'solid-beige': {
        id: 'solid-beige',
        name: 'Beige',
        category: MaterialCategory.Solid,
        base: { color: '#d4c4a8', roughness: 0.5, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    },

    // ═══════════════════════════════════════════════════════════════
    // PATTERN MATERIALS
    // ═══════════════════════════════════════════════════════════════

    'red-brick': {
        id: 'red-brick',
        name: 'Red Brick',
        category: MaterialCategory.Pattern,
        base: { color: '#b74a3a', roughness: 0.85, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Brick,
                params: {
                    mortarColor: '#888888',
                    mortarThickness: 0.03,
                    brickWidth: 4,
                    brickHeight: 2,
                    offset: 0.5
                },
                blend: BlendMode.Multiply,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'gray-brick': {
        id: 'gray-brick',
        name: 'Gray Brick',
        category: MaterialCategory.Pattern,
        base: { color: '#666666', roughness: 0.8, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Brick,
                params: {
                    mortarColor: '#444444',
                    mortarThickness: 0.025,
                    brickWidth: 4,
                    brickHeight: 2,
                    offset: 0.5
                },
                blend: BlendMode.Multiply,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'stone-block': {
        id: 'stone-block',
        name: 'Stone Block',
        category: MaterialCategory.Pattern,
        base: { color: '#9e9e9e', roughness: 0.9, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Brick,
                params: {
                    mortarColor: '#666666',
                    mortarThickness: 0.02,
                    brickWidth: 2,
                    brickHeight: 2,
                    offset: 0.5
                },
                blend: BlendMode.Multiply,
                opacity: 1.0,
                enabled: true
            },
            {
                type: LayerType.Noise,
                params: {
                    color2: '#787878',
                    scale: 3,
                    contrast: 0.5,
                    octaves: 2
                },
                blend: BlendMode.Overlay,
                opacity: 0.3,
                enabled: true
            }
        ]
    },
    'checker-bw': {
        id: 'checker-bw',
        name: 'Checkerboard',
        category: MaterialCategory.Pattern,
        base: { color: '#ffffff', roughness: 0.3, metalness: 0.0, clearcoat: 0.2 },
        layers: [
            {
                type: LayerType.Checker,
                params: {
                    color2: '#222222',
                    scale: 4
                },
                blend: BlendMode.Replace,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'floor-tiles': {
        id: 'floor-tiles',
        name: 'Floor Tiles',
        category: MaterialCategory.Pattern,
        base: { color: '#d4c4a8', roughness: 0.4, metalness: 0.0, clearcoat: 0.1 },
        layers: [
            {
                type: LayerType.Checker,
                params: {
                    color2: '#8b7355',
                    scale: 2
                },
                blend: BlendMode.Replace,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'marble': {
        id: 'marble',
        name: 'Marble',
        category: MaterialCategory.Pattern,
        base: { color: '#f0f0f0', roughness: 0.2, metalness: 0.0, clearcoat: 0.3 },
        layers: [
            {
                type: LayerType.Noise,
                params: {
                    color2: '#a0a0a0',
                    scale: 2,
                    contrast: 1.2,
                    octaves: 3
                },
                blend: BlendMode.Multiply,
                opacity: 0.6,
                enabled: true
            }
        ]
    },
    'concrete': {
        id: 'concrete',
        name: 'Concrete',
        category: MaterialCategory.Pattern,
        base: { color: '#b0b0b0', roughness: 0.9, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Noise,
                params: {
                    color2: '#888888',
                    scale: 4,
                    contrast: 0.4,
                    octaves: 2
                },
                blend: BlendMode.Overlay,
                opacity: 0.5,
                enabled: true
            }
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // NATURAL MATERIALS
    // ═══════════════════════════════════════════════════════════════

    'oak-wood': {
        id: 'oak-wood',
        name: 'Oak Wood',
        category: MaterialCategory.Natural,
        base: { color: '#8b6914', roughness: 0.6, metalness: 0.0, clearcoat: 0.15 },
        layers: [
            {
                type: LayerType.WoodGrain,
                params: {
                    grainColor: '#5a4510',
                    grainScale: 8,
                    grainStrength: 0.5,
                    ringScale: 2
                },
                blend: BlendMode.Multiply,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'dark-wood': {
        id: 'dark-wood',
        name: 'Dark Wood',
        category: MaterialCategory.Natural,
        base: { color: '#4a3728', roughness: 0.5, metalness: 0.0, clearcoat: 0.2 },
        layers: [
            {
                type: LayerType.WoodGrain,
                params: {
                    grainColor: '#2a1f18',
                    grainScale: 10,
                    grainStrength: 0.6,
                    ringScale: 2.5
                },
                blend: BlendMode.Multiply,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'pine-wood': {
        id: 'pine-wood',
        name: 'Pine Wood',
        category: MaterialCategory.Natural,
        base: { color: '#c9a86c', roughness: 0.55, metalness: 0.0, clearcoat: 0.1 },
        layers: [
            {
                type: LayerType.WoodGrain,
                params: {
                    grainColor: '#9e7b4a',
                    grainScale: 6,
                    grainStrength: 0.4,
                    ringScale: 1.5
                },
                blend: BlendMode.Multiply,
                opacity: 1.0,
                enabled: true
            }
        ]
    },
    'grass': {
        id: 'grass',
        name: 'Grass',
        category: MaterialCategory.Natural,
        base: { color: '#4a7c23', roughness: 0.8, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Noise,
                params: {
                    color2: '#2d5016',
                    scale: 5,
                    contrast: 0.8,
                    octaves: 2
                },
                blend: BlendMode.Overlay,
                opacity: 0.5,
                enabled: true
            }
        ]
    },
    'sand': {
        id: 'sand',
        name: 'Sand',
        category: MaterialCategory.Natural,
        base: { color: '#e6d5a8', roughness: 0.95, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Noise,
                params: {
                    color2: '#c4b48a',
                    scale: 8,
                    contrast: 0.3,
                    octaves: 2
                },
                blend: BlendMode.Overlay,
                opacity: 0.4,
                enabled: true
            }
        ]
    },
    'dirt': {
        id: 'dirt',
        name: 'Dirt',
        category: MaterialCategory.Natural,
        base: { color: '#6b4423', roughness: 0.95, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Noise,
                params: {
                    color2: '#4a2f18',
                    scale: 4,
                    contrast: 0.6,
                    octaves: 2
                },
                blend: BlendMode.Overlay,
                opacity: 0.5,
                enabled: true
            }
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // METAL MATERIALS
    // ═══════════════════════════════════════════════════════════════

    'steel': {
        id: 'steel',
        name: 'Steel',
        category: MaterialCategory.Metal,
        base: { color: '#8a9a9a', roughness: 0.25, metalness: 0.95, clearcoat: 0.0 },
        layers: []
    },
    'brushed-steel': {
        id: 'brushed-steel',
        name: 'Brushed Steel',
        category: MaterialCategory.Metal,
        base: { color: '#9aacac', roughness: 0.4, metalness: 0.9, clearcoat: 0.0 },
        layers: []  // Stripes pattern removed - use Material Creator to add patterns
    },
    'gold': {
        id: 'gold',
        name: 'Gold',
        category: MaterialCategory.Metal,
        base: { color: '#ffd700', roughness: 0.2, metalness: 0.95, clearcoat: 0.0 },
        layers: []
    },
    'copper': {
        id: 'copper',
        name: 'Copper',
        category: MaterialCategory.Metal,
        base: { color: '#b87333', roughness: 0.3, metalness: 0.9, clearcoat: 0.0 },
        layers: []
    },
    'bronze': {
        id: 'bronze',
        name: 'Bronze',
        category: MaterialCategory.Metal,
        base: { color: '#cd7f32', roughness: 0.35, metalness: 0.85, clearcoat: 0.0 },
        layers: []
    },
    'chrome': {
        id: 'chrome',
        name: 'Chrome',
        category: MaterialCategory.Metal,
        base: { color: '#e8e8e8', roughness: 0.05, metalness: 1.0, clearcoat: 0.0 },
        layers: []
    },
    'rusted-metal': {
        id: 'rusted-metal',
        name: 'Rusted Metal',
        category: MaterialCategory.Metal,
        base: { color: '#8b4513', roughness: 0.85, metalness: 0.4, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Noise,
                params: {
                    color2: '#5a3510',
                    scale: 3,
                    contrast: 1.0,
                    octaves: 3
                },
                blend: BlendMode.Overlay,
                opacity: 0.6,
                enabled: true
            }
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // FABRIC MATERIALS
    // ═══════════════════════════════════════════════════════════════

    'fabric-red': {
        id: 'fabric-red',
        name: 'Red Fabric',
        category: MaterialCategory.Pattern,
        base: { color: '#c0392b', roughness: 0.9, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Weave,
                params: {
                    color2: '#8b2a20',
                    scale: 30,
                    threadWidth: 0.5
                },
                blend: BlendMode.Overlay,
                opacity: 0.3,
                enabled: true
            }
        ]
    },
    'fabric-blue': {
        id: 'fabric-blue',
        name: 'Blue Fabric',
        category: MaterialCategory.Pattern,
        base: { color: '#2980b9', roughness: 0.9, metalness: 0.0, clearcoat: 0.0 },
        layers: [
            {
                type: LayerType.Weave,
                params: {
                    color2: '#1a5276',
                    scale: 30,
                    threadWidth: 0.5
                },
                blend: BlendMode.Overlay,
                opacity: 0.3,
                enabled: true
            }
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // SPECIAL MATERIALS
    // ═══════════════════════════════════════════════════════════════

    'glass': {
        id: 'glass',
        name: 'Glass',
        category: MaterialCategory.Solid,
        base: { color: '#a8d8ea', roughness: 0.0, metalness: 0.0, clearcoat: 1.0 },
        layers: []
    },
    'plastic-glossy': {
        id: 'plastic-glossy',
        name: 'Glossy Plastic',
        category: MaterialCategory.Solid,
        base: { color: '#e74c3c', roughness: 0.1, metalness: 0.0, clearcoat: 0.8 },
        layers: []
    },
    'rubber': {
        id: 'rubber',
        name: 'Rubber',
        category: MaterialCategory.Solid,
        base: { color: '#2c3e50', roughness: 0.95, metalness: 0.0, clearcoat: 0.0 },
        layers: []
    }
};

/**
 * Get materials by category
 */
export function getMaterialsByCategory(category) {
    return Object.values(DefaultMaterialDefinitions).filter(m => m.category === category);
}

/**
 * Get all categories with their materials
 */
export function getAllCategories() {
    const categories = {};
    for (const material of Object.values(DefaultMaterialDefinitions)) {
        if (!categories[material.category]) {
            categories[material.category] = [];
        }
        categories[material.category].push(material);
    }
    return categories;
}

/**
 * Get a material definition by ID
 */
export function getMaterialDefinition(id) {
    return DefaultMaterialDefinitions[id] || null;
}
