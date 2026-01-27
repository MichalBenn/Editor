import * as THREE from 'three';

/**
 * Built-in primitive types for game items
 */
export const PrimitiveType = {
    Cube: 'cube',
    Sphere: 'sphere',
    Cylinder: 'cylinder',
    Cone: 'cone',
    Torus: 'torus',
    Capsule: 'capsule'
};

/**
 * GameItem - A placeable mesh object that can be positioned and rotated
 * but not edited like voxels
 */
export class GameItem {
    constructor(type, position = { x: 0, y: 0, z: 0 }) {
        this.id = GameItem.generateId();
        this.type = type;
        this.position = { ...position };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1 };
        this.mesh = null;
        this.color = 0x6a9fb5; // Nice blue-gray default

        this.createMesh();
    }

    static generateId() {
        return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Create the Three.js mesh based on primitive type
     */
    createMesh() {
        let geometry;

        switch (this.type) {
            case PrimitiveType.Cube:
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case PrimitiveType.Sphere:
                geometry = new THREE.SphereGeometry(0.5, 32, 32);
                break;
            case PrimitiveType.Cylinder:
                geometry = new THREE.CylinderGeometry(0.4, 0.4, 1, 32);
                break;
            case PrimitiveType.Cone:
                geometry = new THREE.ConeGeometry(0.5, 1, 32);
                break;
            case PrimitiveType.Torus:
                geometry = new THREE.TorusGeometry(0.4, 0.15, 16, 48);
                break;
            case PrimitiveType.Capsule:
                geometry = new THREE.CapsuleGeometry(0.3, 0.5, 8, 16);
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        const material = new THREE.MeshPhysicalMaterial({
            color: this.color,
            roughness: 0.4,
            metalness: 0.1,
            clearcoat: 0.1,
            flatShading: false
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.gameItemId = this.id;
        this.mesh.userData.isGameItem = true;

        this.updateTransform();
    }

    /**
     * Update mesh transform from stored values
     */
    updateTransform() {
        if (!this.mesh) return;

        this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        this.mesh.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
        this.mesh.scale.set(this.scale.x, this.scale.y, this.scale.z);
    }

    /**
     * Sync stored values from mesh (after gizmo manipulation)
     */
    syncFromMesh() {
        if (!this.mesh) return;

        this.position.x = this.mesh.position.x;
        this.position.y = this.mesh.position.y;
        this.position.z = this.mesh.position.z;

        this.rotation.x = this.mesh.rotation.x;
        this.rotation.y = this.mesh.rotation.y;
        this.rotation.z = this.mesh.rotation.z;

        this.scale.x = this.mesh.scale.x;
        this.scale.y = this.mesh.scale.y;
        this.scale.z = this.mesh.scale.z;
    }

    /**
     * Set color
     */
    setColor(color) {
        this.color = color;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setHex(color);
        }
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }

    /**
     * Serialize for saving
     */
    serialize() {
        return {
            id: this.id,
            type: this.type,
            position: { ...this.position },
            rotation: { ...this.rotation },
            scale: { ...this.scale },
            color: this.color
        };
    }

    /**
     * Deserialize from saved data
     */
    static deserialize(data) {
        const item = new GameItem(data.type, data.position);
        item.id = data.id;
        item.rotation = { ...data.rotation };
        item.scale = data.scale ? { ...data.scale } : { x: 1, y: 1, z: 1 };
        item.setColor(data.color || 0x6a9fb5);
        item.updateTransform();
        return item;
    }
}

/**
 * GameItemManager - Manages all game items in the scene
 */
export class GameItemManager {
    constructor(scene) {
        this.scene = scene;
        this.items = new Map(); // id -> GameItem
        this.selectedItem = null;

        // Container group for all game items
        this.itemGroup = new THREE.Group();
        this.itemGroup.name = 'GameItems';
        this.scene.add(this.itemGroup);
    }

    /**
     * Add a new game item
     */
    addItem(type, position = { x: 0, y: 0.5, z: 0 }) {
        const item = new GameItem(type, position);
        this.items.set(item.id, item);
        this.itemGroup.add(item.mesh);
        return item;
    }

    /**
     * Remove a game item
     */
    removeItem(id) {
        const item = this.items.get(id);
        if (!item) return;

        if (this.selectedItem === item) {
            this.selectedItem = null;
        }

        this.itemGroup.remove(item.mesh);
        item.dispose();
        this.items.delete(id);
    }

    /**
     * Get item by ID
     */
    getItem(id) {
        return this.items.get(id);
    }

    /**
     * Get item from mesh
     */
    getItemFromMesh(mesh) {
        if (!mesh || !mesh.userData.gameItemId) return null;
        return this.items.get(mesh.userData.gameItemId);
    }

    /**
     * Select an item
     */
    selectItem(item) {
        this.selectedItem = item;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedItem = null;
    }

    /**
     * Get all meshes for raycasting
     */
    getMeshes() {
        return Array.from(this.items.values()).map(item => item.mesh);
    }

    /**
     * Serialize all items
     */
    serialize() {
        return Array.from(this.items.values()).map(item => item.serialize());
    }

    /**
     * Deserialize and load items
     */
    deserialize(dataArray) {
        // Clear existing items
        for (const item of this.items.values()) {
            this.itemGroup.remove(item.mesh);
            item.dispose();
        }
        this.items.clear();
        this.selectedItem = null;

        // Load new items
        for (const data of dataArray) {
            const item = GameItem.deserialize(data);
            this.items.set(item.id, item);
            this.itemGroup.add(item.mesh);
        }
    }

    /**
     * Get item count
     */
    get count() {
        return this.items.size;
    }
}
