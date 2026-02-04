/**
 * Material System - Main Exports
 *
 * This module provides a complete material system for the voxel editor:
 *
 * - LayerTypes: Pattern layer definitions (brick, noise, checker, etc.)
 * - MaterialDefinitions: Default material templates
 * - LayeredMaterial: Material instance class with base + layers
 * - MaterialLibrary: Manages definitions and user inventory
 * - MaterialManager: Centralizes all material operations
 * - ShaderBuilder: Generates combined shaders for layered materials
 */

// Layer system
export { LayerType, BlendMode, LayerTypeDefinitions, getDefaultLayerParams, createLayer, validateLayerParams } from './LayerTypes.js';

// Material definitions
export { DefaultMaterialDefinitions, MaterialCategory, getMaterialsByCategory, getAllCategories, getMaterialDefinition } from './MaterialDefinitions.js';

// Core classes
export { LayeredMaterial } from './LayeredMaterial.js';
export { MaterialLibrary } from './MaterialLibrary.js';
export { MaterialManager } from './MaterialManager.js';

// Shader building
export { buildMaterial, buildSolidMaterial, buildLayeredShader, updateShaderUniforms } from './ShaderBuilder.js';

// Material Maker (UI component)
export { MaterialMaker } from './MaterialMaker.js';

// Color Wheel Picker (reusable color picker component)
export { ColorWheelPicker } from './ColorWheelPicker.js';

// Storage
export { MaterialStorage, getMaterialStorage } from './MaterialStorage.js';

// Thumbnail rendering
export { renderThumbnail, renderThumbnailToCanvas, createThumbnailImage, updateElementThumbnail, renderThumbnailBatch } from './ThumbnailRenderer.js';
