/**
 * Layer Types for the Material System
 *
 * Each layer type defines a pattern that can be applied on top of a base color.
 * Layers can be stacked and blended together.
 */

export const LayerType = {
    Brick: 'brick',
    Checker: 'checker',
    Noise: 'noise',
    Gradient: 'gradient',
    WoodGrain: 'woodGrain',
    Weave: 'weave',
    Stripes: 'stripes',
    Dots: 'dots'
};

export const BlendMode = {
    Replace: 'replace',     // Replace base color completely
    Multiply: 'multiply',   // Darken (multiply colors)
    Overlay: 'overlay',     // Overlay blend
    Add: 'add',             // Lighten (add colors)
    Mix: 'mix',             // Linear interpolation by opacity
    Screen: 'screen'        // Inverse multiply (lighten)
};

/**
 * Layer type definitions with their parameters
 * Each param has: type, default, and optionally min/max/options
 */
export const LayerTypeDefinitions = {
    [LayerType.Brick]: {
        name: 'Brick',
        description: 'Brick pattern with mortar lines',
        params: {
            mortarColor: { type: 'color', default: '#666666', label: 'Mortar Color' },
            mortarThickness: { type: 'range', min: 0.005, max: 0.15, step: 0.005, default: 0.03, label: 'Mortar Width' },
            brickWidth: { type: 'range', min: 1, max: 10, step: 0.5, default: 4, label: 'Brick Width' },
            brickHeight: { type: 'range', min: 1, max: 10, step: 0.5, default: 2, label: 'Brick Height' },
            offset: { type: 'range', min: 0, max: 1, step: 0.1, default: 0.5, label: 'Row Offset' }
        }
    },

    [LayerType.Checker]: {
        name: 'Checker',
        description: 'Checkerboard pattern',
        params: {
            color2: { type: 'color', default: '#ffffff', label: 'Second Color' },
            scale: { type: 'range', min: 1, max: 20, step: 1, default: 4, label: 'Scale' }
        }
    },

    [LayerType.Noise]: {
        name: 'Noise',
        description: 'Procedural noise pattern',
        params: {
            color2: { type: 'color', default: '#ffffff', label: 'Second Color' },
            scale: { type: 'range', min: 0.5, max: 10, step: 0.5, default: 2, label: 'Scale' },
            contrast: { type: 'range', min: 0, max: 2, step: 0.1, default: 1, label: 'Contrast' },
            octaves: { type: 'range', min: 1, max: 4, step: 1, default: 2, label: 'Detail' }
        }
    },

    [LayerType.Gradient]: {
        name: 'Gradient',
        description: 'Color gradient blend',
        params: {
            color2: { type: 'color', default: '#000000', label: 'End Color' },
            direction: { type: 'select', options: ['vertical', 'horizontal', 'diagonal'], default: 'vertical', label: 'Direction' },
            midpoint: { type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Midpoint' }
        }
    },

    [LayerType.WoodGrain]: {
        name: 'Wood Grain',
        description: 'Wood grain pattern',
        params: {
            grainColor: { type: 'color', default: '#5a3d2b', label: 'Grain Color' },
            grainScale: { type: 'range', min: 1, max: 20, step: 1, default: 8, label: 'Grain Scale' },
            grainStrength: { type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Grain Strength' },
            ringScale: { type: 'range', min: 0.5, max: 5, step: 0.5, default: 2, label: 'Ring Scale' }
        }
    },

    [LayerType.Weave]: {
        name: 'Weave',
        description: 'Fabric weave pattern',
        params: {
            color2: { type: 'color', default: '#333333', label: 'Thread Color' },
            scale: { type: 'range', min: 5, max: 50, step: 5, default: 20, label: 'Scale' },
            threadWidth: { type: 'range', min: 0.3, max: 0.7, step: 0.05, default: 0.5, label: 'Thread Width' }
        }
    },

    [LayerType.Stripes]: {
        name: 'Stripes',
        description: 'Stripe pattern',
        params: {
            color2: { type: 'color', default: '#ffffff', label: 'Stripe Color' },
            scale: { type: 'range', min: 1, max: 20, step: 1, default: 4, label: 'Scale' },
            thickness: { type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.5, label: 'Stripe Width' },
            direction: { type: 'select', options: ['horizontal', 'vertical', 'diagonal'], default: 'horizontal', label: 'Direction' }
        }
    },

    [LayerType.Dots]: {
        name: 'Dots',
        description: 'Polka dot pattern',
        params: {
            color2: { type: 'color', default: '#ffffff', label: 'Dot Color' },
            scale: { type: 'range', min: 2, max: 20, step: 1, default: 6, label: 'Scale' },
            dotSize: { type: 'range', min: 0.1, max: 0.8, step: 0.05, default: 0.4, label: 'Dot Size' }
        }
    }
};

/**
 * Get default parameters for a layer type
 */
export function getDefaultLayerParams(layerType) {
    const typeDef = LayerTypeDefinitions[layerType];
    if (!typeDef) return {};

    const params = {};
    for (const [key, paramDef] of Object.entries(typeDef.params)) {
        params[key] = paramDef.default;
    }
    return params;
}

/**
 * Create a new layer with defaults
 */
export function createLayer(layerType, overrides = {}) {
    return {
        type: layerType,
        params: { ...getDefaultLayerParams(layerType), ...overrides },
        blend: BlendMode.Multiply,
        opacity: 1.0,
        enabled: true
    };
}

/**
 * Validate layer parameters
 */
export function validateLayerParams(layerType, params) {
    const typeDef = LayerTypeDefinitions[layerType];
    if (!typeDef) return params;

    const validated = {};
    for (const [key, paramDef] of Object.entries(typeDef.params)) {
        let value = params[key] ?? paramDef.default;

        // Clamp range values
        if (paramDef.type === 'range') {
            value = Math.max(paramDef.min, Math.min(paramDef.max, value));
        }

        // Validate select values
        if (paramDef.type === 'select' && !paramDef.options.includes(value)) {
            value = paramDef.default;
        }

        validated[key] = value;
    }

    return validated;
}
