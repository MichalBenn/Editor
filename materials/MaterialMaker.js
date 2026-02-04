/**
 * MaterialMaker - UI component for creating and editing materials
 *
 * Provides a modal interface for:
 * - Setting base PBR properties (color, roughness, metalness, clearcoat)
 * - Extended properties (emissive, opacity, normal)
 * - Adding procedural pattern layers
 * - Live preview of material changes
 */

import * as THREE from 'three';
import { LayeredMaterial } from './LayeredMaterial.js';
import { LayerType, LayerTypeDefinitions, BlendMode, createLayer } from './LayerTypes.js';
import { getMaterialStorage } from './MaterialStorage.js';
import { ColorWheelPicker } from './ColorWheelPicker.js';

export class MaterialMaker {
    constructor(materialManager) {
        this.materialManager = materialManager;
        this.storage = getMaterialStorage();

        // Current material being edited
        this.currentMaterial = null;
        this.isNewMaterial = false;

        // UI elements
        this.modal = null;

        // 3D Preview rendering
        this.previewRenderer = null;
        this.previewScene = null;
        this.previewCamera = null;
        this.previewSphere = null;
        this.previewLight = null;
        this.previewAmbient = null;

        // Color wheel pickers
        this.baseColorPicker = null;
        this.emissiveColorPicker = null;

        // Callbacks
        this.onMaterialCreated = null;
        this.onMaterialUpdated = null;

        this._createModal();
        this._initStorage();
        this._initPreviewRenderer();
        this._initColorPickers();
    }

    async _initStorage() {
        try {
            await this.storage.init();
            console.log('MaterialMaker: Storage initialized');
        } catch (error) {
            console.error('MaterialMaker: Failed to initialize storage', error);
        }
    }

    _initPreviewRenderer() {
        // Wait for modal to be in DOM
        setTimeout(() => {
            const container = this.modal.querySelector('#previewSphere');
            if (!container) return;

            // Create renderer
            this.previewRenderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true
            });
            this.previewRenderer.setSize(160, 160);
            this.previewRenderer.setPixelRatio(window.devicePixelRatio);
            this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
            this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.previewRenderer.toneMappingExposure = 1.0;

            // Replace the div with the canvas
            container.innerHTML = '';
            container.appendChild(this.previewRenderer.domElement);
            this.previewRenderer.domElement.style.borderRadius = '8px';

            // Create scene
            this.previewScene = new THREE.Scene();
            this.previewScene.background = new THREE.Color(0x2a2a3a);

            // Create camera - closer for larger cube in frame
            this.previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
            this.previewCamera.position.set(0, 0, 2.2);
            this.previewCamera.lookAt(0, 0, 0);

            // Create cube (renamed from previewSphere but keeping variable name for compatibility)
            const geometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
            this.previewSphere = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
            // Tilt the cube at an angle for better 3D view
            this.previewSphere.rotation.x = 0.4;
            this.previewSphere.rotation.y = 0.6;
            this.previewScene.add(this.previewSphere);

            // Start rotation animation
            this._startPreviewAnimation();

            // Add lights
            this.previewLight = new THREE.DirectionalLight(0xffffff, 2);
            this.previewLight.position.set(2, 2, 2);
            this.previewScene.add(this.previewLight);

            this.previewAmbient = new THREE.AmbientLight(0xffffff, 0.4);
            this.previewScene.add(this.previewAmbient);

            console.log('MaterialMaker: 3D preview initialized');
        }, 100);
    }

    _initColorPickers() {
        // Wait for modal to be in DOM
        setTimeout(() => {
            // Base color picker
            const baseContainer = this.modal.querySelector('#baseColorWheel');
            if (baseContainer) {
                this.baseColorPicker = new ColorWheelPicker(baseContainer, {
                    size: 180,
                    wheelWidth: 22,
                    initialColor: '#888888',
                    onChange: (color) => {
                        this.modal.querySelector('#makerColorHex').value = color;
                        this._updateBase('color', color);
                    }
                });
            }

            // Emissive color picker
            const emissiveContainer = this.modal.querySelector('#emissiveColorWheel');
            if (emissiveContainer) {
                this.emissiveColorPicker = new ColorWheelPicker(emissiveContainer, {
                    size: 180,
                    wheelWidth: 22,
                    initialColor: '#000000',
                    onChange: (color) => {
                        this.modal.querySelector('#makerEmissiveHex').value = color;
                        this._updateBase('emissive', color);
                    }
                });
            }

            // Hex input listeners
            this.modal.querySelector('#makerColorHex')?.addEventListener('input', (e) => {
                const color = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    this.baseColorPicker?.setColor(color);
                    this._updateBase('color', color);
                }
            });

            this.modal.querySelector('#makerEmissiveHex')?.addEventListener('input', (e) => {
                const color = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    this.emissiveColorPicker?.setColor(color);
                    this._updateBase('emissive', color);
                }
            });

            console.log('MaterialMaker: Color pickers initialized');
        }, 150);
    }

    _createModal() {
        // Create modal overlay
        this.modal = document.createElement('div');
        this.modal.className = 'modal-overlay material-maker-overlay';
        this.modal.innerHTML = `
            <div class="modal-dialog material-maker-dialog">
                <div class="maker-header">
                    <h2 id="makerTitle">Create Material</h2>
                    <button class="ui-panel-close" id="closeMaker">×</button>
                </div>

                <div class="maker-content">
                    <!-- Left: Preview -->
                    <div class="maker-preview">
                        <div class="preview-sphere" id="previewSphere"></div>
                        <input type="text" class="material-name-input" id="materialName" placeholder="Material Name" value="Custom Material">
                    </div>

                    <!-- Right: Properties -->
                    <div class="maker-properties">
                        <!-- Tabs -->
                        <div class="maker-tabs">
                            <button class="maker-tab active" data-tab="base">Base</button>
                            <button class="maker-tab" data-tab="extended">Extended</button>
                            <button class="maker-tab" data-tab="patterns">Patterns</button>
                        </div>

                        <!-- Tab Content -->
                        <div class="maker-tab-content">
                            <!-- Base Properties Tab -->
                            <div class="tab-panel active" id="tabBase">
                                <div class="property-group color-picker-group">
                                    <label class="property-label">
                                        <span>Base Color</span>
                                        <input type="text" id="makerColorHex" class="color-hex-input" value="#888888" maxlength="7">
                                    </label>
                                    <div id="baseColorWheel" class="color-wheel-container"></div>
                                </div>

                                <div class="property-group">
                                    <label class="property-label">
                                        <span>Roughness</span>
                                        <span class="property-value" id="makerRoughnessVal">0.5</span>
                                    </label>
                                    <input type="range" id="makerRoughness" min="0" max="1" step="0.05" value="0.5">
                                </div>

                                <div class="property-group">
                                    <label class="property-label">
                                        <span>Metalness</span>
                                        <span class="property-value" id="makerMetalnessVal">0.0</span>
                                    </label>
                                    <input type="range" id="makerMetalness" min="0" max="1" step="0.05" value="0.0">
                                </div>

                                <div class="property-group">
                                    <label class="property-label">
                                        <span>Clearcoat</span>
                                        <span class="property-value" id="makerClearcoatVal">0.0</span>
                                    </label>
                                    <input type="range" id="makerClearcoat" min="0" max="1" step="0.05" value="0.0">
                                </div>
                            </div>

                            <!-- Extended Properties Tab -->
                            <div class="tab-panel" id="tabExtended">
                                <div class="property-group color-picker-group">
                                    <label class="property-label">
                                        <span>Emissive Color</span>
                                        <input type="text" id="makerEmissiveHex" class="color-hex-input" value="#000000" maxlength="7">
                                    </label>
                                    <div id="emissiveColorWheel" class="color-wheel-container"></div>
                                </div>

                                <div class="property-group">
                                    <label class="property-label">
                                        <span>Emissive Intensity</span>
                                        <span class="property-value" id="makerEmissiveIntensityVal">0.0</span>
                                    </label>
                                    <input type="range" id="makerEmissiveIntensity" min="0" max="2" step="0.1" value="0.0">
                                </div>

                                <div class="property-group">
                                    <label class="property-label">
                                        <span>Opacity</span>
                                        <span class="property-value" id="makerOpacityVal">1.0</span>
                                    </label>
                                    <input type="range" id="makerOpacity" min="0" max="1" step="0.05" value="1.0">
                                </div>

                                <div class="property-group">
                                    <label class="property-label">
                                        <span>Normal Strength</span>
                                        <span class="property-value" id="makerNormalScaleVal">1.0</span>
                                    </label>
                                    <input type="range" id="makerNormalScale" min="0" max="2" step="0.1" value="1.0">
                                </div>
                            </div>

                            <!-- Patterns Tab -->
                            <div class="tab-panel" id="tabPatterns">
                                <div class="patterns-header">
                                    <span>Pattern Layers</span>
                                    <button class="add-layer-btn" id="addLayerBtn">+ Add Layer</button>
                                </div>

                                <div class="layers-list" id="layersList">
                                    <div class="empty-layers">No pattern layers. Click "Add Layer" to get started.</div>
                                </div>

                                <!-- Layer Type Selector (hidden by default) -->
                                <div class="layer-selector" id="layerSelector" style="display: none;">
                                    <div class="layer-selector-header">
                                        <span>Select Pattern Type</span>
                                        <button class="close-selector" id="closeSelector">×</button>
                                    </div>
                                    <div class="layer-options" id="layerOptions"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="maker-footer">
                    <button class="ui-btn ui-btn-ghost" id="cancelMaker">Cancel</button>
                    <button class="ui-btn ui-btn-primary" id="saveMaker">Save Material</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this._bindEvents();
        this._populateLayerOptions();
    }

    _bindEvents() {
        // Close buttons
        this.modal.querySelector('#closeMaker').addEventListener('click', () => this.close());
        this.modal.querySelector('#cancelMaker').addEventListener('click', () => this.close());

        // Save button
        this.modal.querySelector('#saveMaker').addEventListener('click', () => this.save());

        // Tab switching
        this.modal.querySelectorAll('.maker-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this._switchTab(e.target.dataset.tab));
        });

        // Base properties
        this._bindSlider('makerRoughness', 'makerRoughnessVal', (v) => this._updateBase('roughness', v));
        this._bindSlider('makerMetalness', 'makerMetalnessVal', (v) => this._updateBase('metalness', v));
        this._bindSlider('makerClearcoat', 'makerClearcoatVal', (v) => this._updateBase('clearcoat', v));

        // Color picker event handlers are set up in _initColorPickers

        // Extended properties
        this._bindSlider('makerEmissiveIntensity', 'makerEmissiveIntensityVal', (v) => this._updateBase('emissiveIntensity', v));
        this._bindSlider('makerOpacity', 'makerOpacityVal', (v) => this._updateBase('opacity', v));
        this._bindSlider('makerNormalScale', 'makerNormalScaleVal', (v) => this._updateBase('normalScale', v));

        // Layer management
        this.modal.querySelector('#addLayerBtn').addEventListener('click', () => this._showLayerSelector());
        this.modal.querySelector('#closeSelector').addEventListener('click', () => this._hideLayerSelector());

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
    }

    _bindSlider(sliderId, valueId, callback) {
        const slider = this.modal.querySelector(`#${sliderId}`);
        const valueEl = this.modal.querySelector(`#${valueId}`);

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            valueEl.textContent = value.toFixed(2);
            callback(value);
        });
    }

    _switchTab(tabId) {
        // Update tab buttons
        this.modal.querySelectorAll('.maker-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Update tab panels
        this.modal.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        });
    }

    _populateLayerOptions() {
        const container = this.modal.querySelector('#layerOptions');
        container.innerHTML = '';

        for (const [type, def] of Object.entries(LayerTypeDefinitions)) {
            const option = document.createElement('button');
            option.className = 'layer-option';
            option.dataset.type = type;
            option.innerHTML = `
                <span class="layer-option-name">${def.name}</span>
                <span class="layer-option-desc">${def.description}</span>
            `;
            option.addEventListener('click', () => this._addLayer(type));
            container.appendChild(option);
        }
    }

    _showLayerSelector() {
        this.modal.querySelector('#layerSelector').style.display = 'block';
    }

    _hideLayerSelector() {
        this.modal.querySelector('#layerSelector').style.display = 'none';
    }

    _addLayer(layerType) {
        if (!this.currentMaterial) return;

        const layer = createLayer(layerType);
        this.currentMaterial.layers.push(layer);
        this.currentMaterial.markDirty();

        this._hideLayerSelector();
        this._renderLayers();
        this._updatePreview();
    }

    _removeLayer(index) {
        if (!this.currentMaterial) return;

        this.currentMaterial.layers.splice(index, 1);
        this.currentMaterial.markDirty();
        this._renderLayers();
        this._updatePreview();
    }

    _renderLayers() {
        const container = this.modal.querySelector('#layersList');

        if (!this.currentMaterial || this.currentMaterial.layers.length === 0) {
            container.innerHTML = '<div class="empty-layers">No pattern layers. Click "Add Layer" to get started.</div>';
            return;
        }

        container.innerHTML = '';

        this.currentMaterial.layers.forEach((layer, index) => {
            const def = LayerTypeDefinitions[layer.type];
            if (!def) return;

            const layerEl = document.createElement('div');
            layerEl.className = 'layer-item';
            layerEl.innerHTML = `
                <div class="layer-header">
                    <span class="layer-name">${def.name}</span>
                    <div class="layer-controls">
                        <button class="layer-toggle ${layer.enabled ? 'active' : ''}" data-index="${index}" title="Toggle layer">
                            ${layer.enabled ? '👁' : '👁‍🗨'}
                        </button>
                        <button class="layer-delete" data-index="${index}" title="Remove layer">×</button>
                    </div>
                </div>
                <div class="layer-params" id="layerParams${index}"></div>
            `;

            // Render parameters
            const paramsContainer = layerEl.querySelector(`#layerParams${index}`);
            this._renderLayerParams(paramsContainer, layer, index, def);

            container.appendChild(layerEl);
        });

        // Bind layer controls
        container.querySelectorAll('.layer-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.currentMaterial.layers[idx].enabled = !this.currentMaterial.layers[idx].enabled;
                this.currentMaterial.markDirty();
                this._renderLayers();
                this._updatePreview();
            });
        });

        container.querySelectorAll('.layer-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this._removeLayer(idx);
            });
        });
    }

    _renderLayerParams(container, layer, layerIndex, def) {
        for (const [key, paramDef] of Object.entries(def.params)) {
            const value = layer.params[key] ?? paramDef.default;
            const paramEl = document.createElement('div');
            paramEl.className = 'layer-param';

            if (paramDef.type === 'color') {
                paramEl.innerHTML = `
                    <label>${paramDef.label}</label>
                    <input type="color" value="${value}" data-layer="${layerIndex}" data-param="${key}">
                `;
                paramEl.querySelector('input').addEventListener('input', (e) => {
                    this._updateLayerParam(layerIndex, key, e.target.value);
                });
            } else if (paramDef.type === 'range') {
                paramEl.innerHTML = `
                    <label>${paramDef.label} <span class="param-value">${value}</span></label>
                    <input type="range" min="${paramDef.min}" max="${paramDef.max}" step="${paramDef.step}" value="${value}" data-layer="${layerIndex}" data-param="${key}">
                `;
                const slider = paramEl.querySelector('input[type="range"]');
                const valueEl = paramEl.querySelector('.param-value');
                slider.addEventListener('input', (e) => {
                    const v = parseFloat(e.target.value);
                    valueEl.textContent = v;
                    this._updateLayerParam(layerIndex, key, v);
                });
            } else if (paramDef.type === 'select') {
                paramEl.innerHTML = `
                    <label>${paramDef.label}</label>
                    <select data-layer="${layerIndex}" data-param="${key}">
                        ${paramDef.options.map(opt => `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                `;
                paramEl.querySelector('select').addEventListener('change', (e) => {
                    this._updateLayerParam(layerIndex, key, e.target.value);
                });
            }

            container.appendChild(paramEl);
        }

        // Blend mode and opacity
        const blendEl = document.createElement('div');
        blendEl.className = 'layer-param layer-blend';
        blendEl.innerHTML = `
            <label>Blend Mode</label>
            <select data-layer="${layerIndex}" data-blend="true">
                ${Object.entries(BlendMode).map(([name, value]) =>
                    `<option value="${value}" ${value === layer.blend ? 'selected' : ''}>${name}</option>`
                ).join('')}
            </select>
            <label>Opacity <span class="param-value">${layer.opacity.toFixed(2)}</span></label>
            <input type="range" min="0" max="1" step="0.05" value="${layer.opacity}" data-layer="${layerIndex}" data-opacity="true">
        `;

        blendEl.querySelector('select').addEventListener('change', (e) => {
            this.currentMaterial.layers[layerIndex].blend = e.target.value;
            this.currentMaterial.markDirty();
            this._updatePreview();
        });

        const opacitySlider = blendEl.querySelector('input[type="range"]');
        const opacityValue = blendEl.querySelectorAll('.param-value')[1] || blendEl.querySelector('.param-value');
        opacitySlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (opacityValue) opacityValue.textContent = v.toFixed(2);
            this.currentMaterial.layers[layerIndex].opacity = v;
            this._updatePreview();
        });

        container.appendChild(blendEl);
    }

    _updateLayerParam(layerIndex, key, value) {
        if (!this.currentMaterial || !this.currentMaterial.layers[layerIndex]) return;

        this.currentMaterial.layers[layerIndex].params[key] = value;
        this._updatePreview();
    }

    _updateBase(key, value) {
        if (!this.currentMaterial) return;

        this.currentMaterial.base[key] = value;
        this.currentMaterial.markDirty();
        this._updatePreview();
    }

    _updatePreview() {
        if (!this.currentMaterial) return;

        // Use 3D renderer if available
        if (this.previewRenderer && this.previewSphere && this.previewScene && this.previewCamera) {
            try {
                // Recompile the material to get updated THREE.js material
                this.currentMaterial.recompile();

                // Get the THREE.js material using the 'material' getter
                const threeMaterial = this.currentMaterial.material;
                if (threeMaterial) {
                    this.previewSphere.material = threeMaterial;
                    // Render
                    this.previewRenderer.render(this.previewScene, this.previewCamera);
                }
            } catch (e) {
                console.warn('MaterialMaker: Failed to render 3D preview', e);
                // Fallback to simple color
                const previewEl = this.modal.querySelector('#previewSphere');
                if (previewEl && !this.previewRenderer) {
                    previewEl.style.background = this.currentMaterial.base.color;
                }
            }
        } else {
            // Fallback: simple color preview
            const previewEl = this.modal.querySelector('#previewSphere');
            if (previewEl) {
                previewEl.style.background = this.currentMaterial.base.color;
            }
        }
    }

    _startPreviewAnimation() {
        if (this._animationFrameId) return; // Already running

        const animate = () => {
            if (!this.previewSphere || !this.previewRenderer) {
                this._animationFrameId = null;
                return;
            }

            // Slow rotation around Y axis
            this.previewSphere.rotation.y += 0.008;

            // Render the scene
            if (this.previewScene && this.previewCamera) {
                this.previewRenderer.render(this.previewScene, this.previewCamera);
            }

            this._animationFrameId = requestAnimationFrame(animate);
        };

        animate();
    }

    _stopPreviewAnimation() {
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
    }

    _loadMaterialToUI(material) {
        // Base properties - use color pickers
        const baseColor = material.base.color || '#888888';
        this.modal.querySelector('#makerColorHex').value = baseColor;
        if (this.baseColorPicker) {
            this.baseColorPicker.setColor(baseColor);
        }

        this.modal.querySelector('#makerRoughness').value = material.base.roughness;
        this.modal.querySelector('#makerRoughnessVal').textContent = material.base.roughness.toFixed(2);
        this.modal.querySelector('#makerMetalness').value = material.base.metalness;
        this.modal.querySelector('#makerMetalnessVal').textContent = material.base.metalness.toFixed(2);
        this.modal.querySelector('#makerClearcoat').value = material.base.clearcoat;
        this.modal.querySelector('#makerClearcoatVal').textContent = material.base.clearcoat.toFixed(2);

        // Extended properties - use color picker for emissive
        const emissiveColor = material.base.emissive || '#000000';
        this.modal.querySelector('#makerEmissiveHex').value = emissiveColor;
        if (this.emissiveColorPicker) {
            this.emissiveColorPicker.setColor(emissiveColor);
        }

        this.modal.querySelector('#makerEmissiveIntensity').value = material.base.emissiveIntensity || 0;
        this.modal.querySelector('#makerEmissiveIntensityVal').textContent = (material.base.emissiveIntensity || 0).toFixed(2);
        this.modal.querySelector('#makerOpacity').value = material.base.opacity ?? 1;
        this.modal.querySelector('#makerOpacityVal').textContent = (material.base.opacity ?? 1).toFixed(2);
        this.modal.querySelector('#makerNormalScale').value = material.base.normalScale ?? 1;
        this.modal.querySelector('#makerNormalScaleVal').textContent = (material.base.normalScale ?? 1).toFixed(2);

        // Name
        this.modal.querySelector('#materialName').value = material.name;

        // Layers
        this._renderLayers();
        this._updatePreview();
    }

    /**
     * Open the Material Maker to create a new material
     */
    create() {
        this.isNewMaterial = true;
        this.currentMaterial = new LayeredMaterial();
        this.currentMaterial.name = 'Custom Material';
        this.currentMaterial.category = 'custom';

        this.modal.querySelector('#makerTitle').textContent = 'Create Material';
        this._loadMaterialToUI(this.currentMaterial);
        this._switchTab('base');

        this.modal.classList.add('visible');
    }

    /**
     * Open the Material Maker to edit an existing material
     * @param {LayeredMaterial} material
     */
    edit(material) {
        this.isNewMaterial = false;
        this.currentMaterial = material.clone();

        this.modal.querySelector('#makerTitle').textContent = 'Edit Material';
        this._loadMaterialToUI(this.currentMaterial);
        this._switchTab('base');

        this.modal.classList.add('visible');
    }

    /**
     * Close the Material Maker
     */
    close() {
        this.modal.classList.remove('visible');
        this.currentMaterial = null;
    }

    /**
     * Save the current material
     */
    async save() {
        if (!this.currentMaterial) return;

        // Update name
        this.currentMaterial.name = this.modal.querySelector('#materialName').value || 'Custom Material';

        // Save to IndexedDB
        try {
            const storageData = {
                id: this.currentMaterial.instanceId,
                name: this.currentMaterial.name,
                category: this.currentMaterial.category,
                base: { ...this.currentMaterial.base },
                layers: this.currentMaterial.layers.map(l => ({
                    type: l.type,
                    params: { ...l.params },
                    blend: l.blend,
                    opacity: l.opacity,
                    enabled: l.enabled
                }))
            };

            await this.storage.saveMaterial(storageData);
            console.log('MaterialMaker: Saved to storage', storageData.id);
        } catch (error) {
            console.error('MaterialMaker: Failed to save to storage', error);
        }

        // Add to material library
        if (this.isNewMaterial) {
            const inventoryId = this.materialManager.getLibrary().addMaterialToInventory(this.currentMaterial);
            if (this.onMaterialCreated) {
                this.onMaterialCreated(inventoryId, this.currentMaterial);
            }
        } else {
            // Update existing material in library
            this.currentMaterial.recompile();
            if (this.onMaterialUpdated) {
                this.onMaterialUpdated(this.currentMaterial.instanceId, this.currentMaterial);
            }
        }

        this.close();
    }

    /**
     * Load saved custom materials from IndexedDB into the library
     */
    async loadSavedMaterials() {
        try {
            const savedMaterials = await this.storage.getAllMaterials();
            console.log('MaterialMaker: Loading', savedMaterials.length, 'saved materials');

            for (const data of savedMaterials) {
                // Check if already in library
                if (this.materialManager.getLibrary().hasInInventory(data.id)) {
                    continue;
                }

                // Create LayeredMaterial from stored data
                const material = new LayeredMaterial({
                    id: data.id,
                    name: data.name,
                    category: data.category,
                    base: data.base,
                    layers: data.layers
                });

                // Override instanceId to match stored ID
                material.instanceId = data.id;

                this.materialManager.getLibrary().addMaterialToInventory(material);
            }
        } catch (error) {
            console.error('MaterialMaker: Failed to load saved materials', error);
        }
    }
}
