/**
 * MaterialStorage - IndexedDB storage layer for custom materials
 *
 * Provides persistent storage for user-created materials with support for:
 * - Full material definitions with all PBR properties
 * - Pattern/layer configurations
 * - Automatic versioning and migration
 */

const DB_NAME = 'EditVoxelMaterials';
const DB_VERSION = 1;
const STORE_NAME = 'materials';

export class MaterialStorage {
    constructor() {
        this.db = null;
        this.isReady = false;
        this._readyPromise = null;
    }

    /**
     * Initialize the IndexedDB connection
     * @returns {Promise<void>}
     */
    async init() {
        if (this._readyPromise) {
            return this._readyPromise;
        }

        this._readyPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to open database', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                console.log('MaterialStorage: Database opened successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create the materials store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

                    // Create indexes for efficient querying
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });

                    console.log('MaterialStorage: Created materials store');
                }
            };
        });

        return this._readyPromise;
    }

    /**
     * Ensure the database is ready before operations
     */
    async _ensureReady() {
        if (!this.isReady) {
            await this.init();
        }
    }

    /**
     * Save a material to storage
     * @param {Object} material - Material data to save
     * @returns {Promise<string>} The material ID
     */
    async saveMaterial(material) {
        await this._ensureReady();

        const now = Date.now();
        const materialData = {
            id: material.id || `custom_${now}_${Math.random().toString(36).substr(2, 9)}`,
            name: material.name || 'Custom Material',
            category: material.category || 'custom',

            // Base PBR properties
            base: {
                color: material.base?.color || '#888888',
                roughness: material.base?.roughness ?? 0.5,
                metalness: material.base?.metalness ?? 0.0,
                clearcoat: material.base?.clearcoat ?? 0.0,
                // Extended properties
                emissive: material.base?.emissive || '#000000',
                emissiveIntensity: material.base?.emissiveIntensity ?? 0.0,
                opacity: material.base?.opacity ?? 1.0,
                transparent: material.base?.transparent ?? false,
                normalScale: material.base?.normalScale ?? 1.0
            },

            // Pattern layers
            layers: (material.layers || []).map(layer => ({
                type: layer.type,
                params: { ...layer.params },
                blend: layer.blend || 'multiply',
                opacity: layer.opacity ?? 1.0,
                enabled: layer.enabled !== false
            })),

            // Metadata
            createdAt: material.createdAt || now,
            updatedAt: now,
            version: material.version || 1
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(materialData);

            request.onsuccess = () => {
                console.log('MaterialStorage: Saved material', materialData.id);
                resolve(materialData.id);
            };

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to save material', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get a material by ID
     * @param {string} id - Material ID
     * @returns {Promise<Object|null>}
     */
    async getMaterial(id) {
        await this._ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to get material', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get all materials
     * @returns {Promise<Object[]>}
     */
    async getAllMaterials() {
        await this._ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to get all materials', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get materials by category
     * @param {string} category - Category name
     * @returns {Promise<Object[]>}
     */
    async getMaterialsByCategory(category) {
        await this._ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('category');
            const request = index.getAll(category);

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to get materials by category', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Delete a material
     * @param {string} id - Material ID
     * @returns {Promise<void>}
     */
    async deleteMaterial(id) {
        await this._ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log('MaterialStorage: Deleted material', id);
                resolve();
            };

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to delete material', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Clear all materials from storage
     * @returns {Promise<void>}
     */
    async clearAll() {
        await this._ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('MaterialStorage: Cleared all materials');
                resolve();
            };

            request.onerror = (event) => {
                console.error('MaterialStorage: Failed to clear materials', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Export all materials as JSON
     * @returns {Promise<string>}
     */
    async exportToJSON() {
        const materials = await this.getAllMaterials();
        return JSON.stringify({
            version: DB_VERSION,
            exportedAt: Date.now(),
            materials
        }, null, 2);
    }

    /**
     * Import materials from JSON
     * @param {string} jsonString - JSON string with materials data
     * @param {boolean} replace - If true, clear existing materials first
     * @returns {Promise<number>} Number of materials imported
     */
    async importFromJSON(jsonString, replace = false) {
        const data = JSON.parse(jsonString);

        if (!data.materials || !Array.isArray(data.materials)) {
            throw new Error('Invalid materials data format');
        }

        if (replace) {
            await this.clearAll();
        }

        let count = 0;
        for (const material of data.materials) {
            await this.saveMaterial(material);
            count++;
        }

        return count;
    }

    /**
     * Get storage statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const materials = await this.getAllMaterials();
        const categories = {};

        for (const mat of materials) {
            const cat = mat.category || 'custom';
            categories[cat] = (categories[cat] || 0) + 1;
        }

        return {
            totalMaterials: materials.length,
            byCategory: categories,
            oldestMaterial: materials.length > 0
                ? Math.min(...materials.map(m => m.createdAt))
                : null,
            newestMaterial: materials.length > 0
                ? Math.max(...materials.map(m => m.updatedAt))
                : null
        };
    }
}

// Singleton instance
let storageInstance = null;

export function getMaterialStorage() {
    if (!storageInstance) {
        storageInstance = new MaterialStorage();
    }
    return storageInstance;
}
