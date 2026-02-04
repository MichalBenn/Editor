import * as THREE from 'three';

/**
 * Material types supported by the procedural system
 */
export const MaterialType = {
    Solid: 'solid',
    Gradient: 'gradient',
    Checker: 'checker',
    Noise: 'noise',
    Brick: 'brick',
    Wood: 'wood',
    Metal: 'metal',
    Fabric: 'fabric'
};

/**
 * Default material definitions for the library
 */
export const DefaultMaterials = {
    // Solid colors
    'solid-white': {
        id: 'solid-white',
        name: 'White',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#ffffff', roughness: 0.5, metalness: 0.0 }
    },
    'solid-gray': {
        id: 'solid-gray',
        name: 'Gray',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#888888', roughness: 0.5, metalness: 0.0 }
    },
    'solid-black': {
        id: 'solid-black',
        name: 'Black',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#222222', roughness: 0.5, metalness: 0.0 }
    },
    'solid-red': {
        id: 'solid-red',
        name: 'Red',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#e74c3c', roughness: 0.5, metalness: 0.0 }
    },
    'solid-orange': {
        id: 'solid-orange',
        name: 'Orange',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#e67e22', roughness: 0.5, metalness: 0.0 }
    },
    'solid-yellow': {
        id: 'solid-yellow',
        name: 'Yellow',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#f1c40f', roughness: 0.5, metalness: 0.0 }
    },
    'solid-green': {
        id: 'solid-green',
        name: 'Green',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#2ecc71', roughness: 0.5, metalness: 0.0 }
    },
    'solid-cyan': {
        id: 'solid-cyan',
        name: 'Cyan',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#4ecdc4', roughness: 0.5, metalness: 0.0 }
    },
    'solid-blue': {
        id: 'solid-blue',
        name: 'Blue',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#3498db', roughness: 0.5, metalness: 0.0 }
    },
    'solid-purple': {
        id: 'solid-purple',
        name: 'Purple',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#9b59b6', roughness: 0.5, metalness: 0.0 }
    },
    'solid-pink': {
        id: 'solid-pink',
        name: 'Pink',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#e91e63', roughness: 0.5, metalness: 0.0 }
    },
    'solid-brown': {
        id: 'solid-brown',
        name: 'Brown',
        type: MaterialType.Solid,
        category: 'solid',
        params: { color: '#8b4513', roughness: 0.6, metalness: 0.0 }
    },

    // Gradients
    'gradient-sunset': {
        id: 'gradient-sunset',
        name: 'Sunset',
        type: MaterialType.Gradient,
        category: 'gradient',
        params: {
            color1: '#ff6b6b',
            color2: '#feca57',
            direction: 'vertical',
            roughness: 0.4,
            metalness: 0.0
        }
    },
    'gradient-ocean': {
        id: 'gradient-ocean',
        name: 'Ocean',
        type: MaterialType.Gradient,
        category: 'gradient',
        params: {
            color1: '#0077b6',
            color2: '#90e0ef',
            direction: 'vertical',
            roughness: 0.3,
            metalness: 0.0
        }
    },
    'gradient-forest': {
        id: 'gradient-forest',
        name: 'Forest',
        type: MaterialType.Gradient,
        category: 'gradient',
        params: {
            color1: '#2d5a27',
            color2: '#90be6d',
            direction: 'vertical',
            roughness: 0.5,
            metalness: 0.0
        }
    },

    // Checker patterns
    'checker-classic': {
        id: 'checker-classic',
        name: 'Classic Checker',
        type: MaterialType.Checker,
        category: 'pattern',
        params: {
            color1: '#ffffff',
            color2: '#000000',
            scale: 2,
            roughness: 0.5,
            metalness: 0.0
        }
    },
    'checker-tiles': {
        id: 'checker-tiles',
        name: 'Floor Tiles',
        type: MaterialType.Checker,
        category: 'pattern',
        params: {
            color1: '#f5f5dc',
            color2: '#d2b48c',
            scale: 4,
            roughness: 0.3,
            metalness: 0.0
        }
    },

    // Noise/procedural
    'noise-marble': {
        id: 'noise-marble',
        name: 'Marble',
        type: MaterialType.Noise,
        category: 'pattern',
        params: {
            color1: '#ffffff',
            color2: '#a0a0a0',
            scale: 3,
            octaves: 4,
            roughness: 0.2,
            metalness: 0.0
        }
    },
    'noise-clouds': {
        id: 'noise-clouds',
        name: 'Clouds',
        type: MaterialType.Noise,
        category: 'pattern',
        params: {
            color1: '#ffffff',
            color2: '#87ceeb',
            scale: 2,
            octaves: 3,
            roughness: 0.6,
            metalness: 0.0
        }
    },

    // Brick
    'brick-red': {
        id: 'brick-red',
        name: 'Red Brick',
        type: MaterialType.Brick,
        category: 'pattern',
        params: {
            brickColor: '#8b4513',
            mortarColor: '#d3d3d3',
            brickWidth: 0.4,
            brickHeight: 0.2,
            mortarThickness: 0.02,
            roughness: 0.8,
            metalness: 0.0
        }
    },

    // Wood
    'wood-oak': {
        id: 'wood-oak',
        name: 'Oak Wood',
        type: MaterialType.Wood,
        category: 'pattern',
        params: {
            color1: '#8b4513',
            color2: '#d2691e',
            grainScale: 10,
            grainStrength: 0.5,
            roughness: 0.6,
            metalness: 0.0
        }
    },

    // Metal
    'metal-steel': {
        id: 'metal-steel',
        name: 'Brushed Steel',
        type: MaterialType.Metal,
        category: 'metal',
        params: {
            color: '#c0c0c0',
            roughness: 0.3,
            metalness: 0.9,
            brushDirection: 'horizontal',
            brushStrength: 0.2
        }
    },
    'metal-gold': {
        id: 'metal-gold',
        name: 'Gold',
        type: MaterialType.Metal,
        category: 'metal',
        params: {
            color: '#ffd700',
            roughness: 0.2,
            metalness: 1.0,
            brushDirection: 'none',
            brushStrength: 0.0
        }
    },
    'metal-copper': {
        id: 'metal-copper',
        name: 'Copper',
        type: MaterialType.Metal,
        category: 'metal',
        params: {
            color: '#b87333',
            roughness: 0.25,
            metalness: 0.95,
            brushDirection: 'none',
            brushStrength: 0.0
        }
    },

    // Fabric
    'fabric-cloth': {
        id: 'fabric-cloth',
        name: 'Cloth',
        type: MaterialType.Fabric,
        category: 'pattern',
        params: {
            color: '#4a4a4a',
            weaveScale: 20,
            roughness: 0.9,
            metalness: 0.0
        }
    }
};

/**
 * ProceduralMaterial - Generates Three.js materials from JSON definitions
 */
export class ProceduralMaterial {
    constructor(definition) {
        this.definition = { ...definition };
        this.id = definition.id || ProceduralMaterial.generateId();
        this.name = definition.name || 'Custom Material';
        this.type = definition.type || MaterialType.Solid;
        this.params = { ...definition.params };
        this.animated = definition.animated || false;
        this.animationParams = definition.animationParams || {};

        this.material = null;
        this.uniforms = {};
        this.texture = null;

        this.build();
    }

    static generateId() {
        return 'mat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Build the Three.js material from the definition
     */
    build() {
        switch (this.type) {
            case MaterialType.Solid:
                this.buildSolidMaterial();
                break;
            case MaterialType.Gradient:
                this.buildGradientMaterial();
                break;
            case MaterialType.Checker:
                this.buildCheckerMaterial();
                break;
            case MaterialType.Noise:
                this.buildNoiseMaterial();
                break;
            case MaterialType.Brick:
                this.buildBrickMaterial();
                break;
            case MaterialType.Wood:
                this.buildWoodMaterial();
                break;
            case MaterialType.Metal:
                this.buildMetalMaterial();
                break;
            case MaterialType.Fabric:
                this.buildFabricMaterial();
                break;
            default:
                this.buildSolidMaterial();
        }
    }

    /**
     * Solid color material
     */
    buildSolidMaterial() {
        const { color, roughness, metalness } = this.params;

        this.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            roughness: roughness ?? 0.5,
            metalness: metalness ?? 0.0,
            flatShading: true,
            side: THREE.DoubleSide
        });
    }

    /**
     * Gradient material using shader
     */
    buildGradientMaterial() {
        const { color1, color2, direction, roughness, metalness } = this.params;

        this.uniforms = {
            color1: { value: new THREE.Color(color1) },
            color2: { value: new THREE.Color(color2) },
            direction: { value: direction === 'horizontal' ? 0 : 1 },
            roughness: { value: roughness ?? 0.5 },
            metalness: { value: metalness ?? 0.0 },
            time: { value: 0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vViewPosition;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float direction;
                uniform float roughness;
                uniform float metalness;
                uniform float time;

                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vViewPosition;

                void main() {
                    float t = direction > 0.5 ? vUv.y : vUv.x;
                    vec3 color = mix(color1, color2, t);

                    // Simple lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = 0.3 * color;
                    vec3 diffuse = 0.7 * diff * color;

                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
    }

    /**
     * Checker pattern material
     */
    buildCheckerMaterial() {
        const { color1, color2, scale, roughness, metalness } = this.params;

        this.uniforms = {
            color1: { value: new THREE.Color(color1) },
            color2: { value: new THREE.Color(color2) },
            scale: { value: scale ?? 2 },
            roughness: { value: roughness ?? 0.5 },
            metalness: { value: metalness ?? 0.0 },
            time: { value: 0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float scale;
                uniform float time;

                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    // Use world position for consistent pattern across faces
                    vec3 pos = vWorldPosition * scale;
                    float checker = mod(floor(pos.x) + floor(pos.y) + floor(pos.z), 2.0);
                    vec3 color = mix(color1, color2, checker);

                    // Simple lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = 0.3 * color;
                    vec3 diffuse = 0.7 * diff * color;

                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
    }

    /**
     * Noise/procedural material
     */
    buildNoiseMaterial() {
        const { color1, color2, scale, octaves, roughness, metalness } = this.params;

        this.uniforms = {
            color1: { value: new THREE.Color(color1) },
            color2: { value: new THREE.Color(color2) },
            scale: { value: scale ?? 3 },
            octaves: { value: octaves ?? 4 },
            roughness: { value: roughness ?? 0.5 },
            metalness: { value: metalness ?? 0.0 },
            time: { value: 0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float scale;
                uniform float octaves;
                uniform float time;

                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                // Simplex noise functions
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

                    vec3 i  = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);

                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);

                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;

                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;

                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);

                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);

                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);

                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));

                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);

                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;

                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }

                float fbm(vec3 p, int oct) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    for(int i = 0; i < 8; i++) {
                        if(i >= oct) break;
                        value += amplitude * snoise(p * frequency);
                        amplitude *= 0.5;
                        frequency *= 2.0;
                    }
                    return value;
                }

                void main() {
                    vec3 pos = vWorldPosition * scale;
                    float n = fbm(pos, int(octaves)) * 0.5 + 0.5;
                    vec3 color = mix(color1, color2, n);

                    // Simple lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = 0.3 * color;
                    vec3 diffuse = 0.7 * diff * color;

                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
    }

    /**
     * Brick pattern material
     */
    buildBrickMaterial() {
        const { brickColor, mortarColor, brickWidth, brickHeight, mortarThickness, roughness } = this.params;

        this.uniforms = {
            brickColor: { value: new THREE.Color(brickColor) },
            mortarColor: { value: new THREE.Color(mortarColor) },
            brickWidth: { value: brickWidth ?? 0.4 },
            brickHeight: { value: brickHeight ?? 0.2 },
            mortarThickness: { value: mortarThickness ?? 0.02 },
            time: { value: 0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 brickColor;
                uniform vec3 mortarColor;
                uniform float brickWidth;
                uniform float brickHeight;
                uniform float mortarThickness;

                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vec2 pos = vWorldPosition.xy;

                    // Offset every other row
                    float row = floor(pos.y / brickHeight);
                    if(mod(row, 2.0) > 0.5) {
                        pos.x += brickWidth * 0.5;
                    }

                    vec2 brick = mod(pos, vec2(brickWidth, brickHeight));

                    // Check if we're in mortar
                    float inMortar = 0.0;
                    if(brick.x < mortarThickness || brick.x > brickWidth - mortarThickness ||
                       brick.y < mortarThickness || brick.y > brickHeight - mortarThickness) {
                        inMortar = 1.0;
                    }

                    vec3 color = mix(brickColor, mortarColor, inMortar);

                    // Simple lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = 0.3 * color;
                    vec3 diffuse = 0.7 * diff * color;

                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
    }

    /**
     * Wood grain material
     */
    buildWoodMaterial() {
        const { color1, color2, grainScale, grainStrength, roughness } = this.params;

        this.uniforms = {
            color1: { value: new THREE.Color(color1) },
            color2: { value: new THREE.Color(color2) },
            grainScale: { value: grainScale ?? 10 },
            grainStrength: { value: grainStrength ?? 0.5 },
            time: { value: 0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float grainScale;
                uniform float grainStrength;

                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                        f.y
                    );
                }

                void main() {
                    vec2 pos = vWorldPosition.xy * grainScale;

                    // Wood grain pattern
                    float grain = sin(pos.y * 20.0 + noise(pos) * 10.0) * 0.5 + 0.5;
                    grain = pow(grain, 2.0);

                    // Add some variation
                    grain += noise(pos * 0.5) * grainStrength;
                    grain = clamp(grain, 0.0, 1.0);

                    vec3 color = mix(color1, color2, grain);

                    // Simple lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = 0.3 * color;
                    vec3 diffuse = 0.7 * diff * color;

                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
    }

    /**
     * Metal material (uses standard PBR)
     */
    buildMetalMaterial() {
        const { color, roughness, metalness } = this.params;

        this.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            roughness: roughness ?? 0.3,
            metalness: metalness ?? 0.9,
            flatShading: true,
            side: THREE.DoubleSide,
            envMapIntensity: 1.0
        });
    }

    /**
     * Fabric weave material
     */
    buildFabricMaterial() {
        const { color, weaveScale, roughness } = this.params;

        this.uniforms = {
            baseColor: { value: new THREE.Color(color) },
            weaveScale: { value: weaveScale ?? 20 },
            time: { value: 0 }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
                uniform float weaveScale;

                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vWorldPosition;

                void main() {
                    vec2 pos = vWorldPosition.xy * weaveScale;

                    // Weave pattern
                    float weaveX = sin(pos.x * 3.14159) * 0.5 + 0.5;
                    float weaveY = sin(pos.y * 3.14159) * 0.5 + 0.5;
                    float weave = weaveX * weaveY;

                    vec3 color = baseColor * (0.8 + weave * 0.2);

                    // Simple lighting with more diffuse for fabric
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = 0.4 * color;
                    vec3 diffuse = 0.6 * diff * color;

                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
    }

    /**
     * Update animated uniforms
     */
    update(deltaTime) {
        if (this.uniforms.time) {
            this.uniforms.time.value += deltaTime;
        }
    }

    /**
     * Clone this material
     */
    clone() {
        return new ProceduralMaterial({
            ...this.definition,
            id: ProceduralMaterial.generateId(),
            name: this.name + ' Copy'
        });
    }

    /**
     * Update a parameter
     */
    setParam(key, value) {
        this.params[key] = value;
        this.definition.params[key] = value;

        // Update uniform if it exists
        if (this.uniforms[key]) {
            if (key.includes('color') || key.includes('Color')) {
                this.uniforms[key].value = new THREE.Color(value);
            } else {
                this.uniforms[key].value = value;
            }
        }

        // For standard materials, update property directly
        if (this.material instanceof THREE.MeshPhysicalMaterial) {
            if (key === 'color') {
                this.material.color = new THREE.Color(value);
            } else if (key === 'roughness') {
                this.material.roughness = value;
            } else if (key === 'metalness') {
                this.material.metalness = value;
            }
        }
    }

    /**
     * Get Three.js material
     */
    getMaterial() {
        return this.material;
    }

    /**
     * Serialize to JSON
     */
    serialize() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            category: this.definition.category,
            params: { ...this.params },
            animated: this.animated,
            animationParams: { ...this.animationParams }
        };
    }

    /**
     * Create from serialized data
     */
    static deserialize(data) {
        return new ProceduralMaterial(data);
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.material) {
            this.material.dispose();
        }
        if (this.texture) {
            this.texture.dispose();
        }
    }
}

/**
 * MaterialLibrary - Manages all materials in the editor
 */
export class MaterialLibrary {
    constructor() {
        this.materials = new Map();
        this.customMaterials = new Map();

        // Load default materials
        this.loadDefaults();
    }

    loadDefaults() {
        for (const [id, def] of Object.entries(DefaultMaterials)) {
            const mat = new ProceduralMaterial(def);
            this.materials.set(id, mat);
        }
    }

    /**
     * Get material by ID
     */
    get(id) {
        return this.materials.get(id) || this.customMaterials.get(id);
    }

    /**
     * Add custom material
     */
    addCustom(material) {
        this.customMaterials.set(material.id, material);
    }

    /**
     * Remove custom material
     */
    removeCustom(id) {
        const mat = this.customMaterials.get(id);
        if (mat) {
            mat.dispose();
            this.customMaterials.delete(id);
        }
    }

    /**
     * Get all materials grouped by category
     */
    getByCategory() {
        const categories = {
            solid: [],
            gradient: [],
            pattern: [],
            metal: [],
            custom: []
        };

        for (const mat of this.materials.values()) {
            const cat = mat.definition.category || 'custom';
            if (categories[cat]) {
                categories[cat].push(mat);
            }
        }

        for (const mat of this.customMaterials.values()) {
            categories.custom.push(mat);
        }

        return categories;
    }

    /**
     * Serialize custom materials
     */
    serializeCustom() {
        return Array.from(this.customMaterials.values()).map(m => m.serialize());
    }

    /**
     * Load custom materials
     */
    deserializeCustom(dataArray) {
        for (const data of dataArray) {
            const mat = ProceduralMaterial.deserialize(data);
            this.customMaterials.set(mat.id, mat);
        }
    }
}
