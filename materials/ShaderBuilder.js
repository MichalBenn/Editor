/**
 * ShaderBuilder - Generates combined shaders for layered materials
 *
 * Takes a base color and array of pattern layers, outputs a THREE.ShaderMaterial
 * that properly integrates with Three.js lighting.
 */

import * as THREE from 'three';
import { LayerType, BlendMode } from './LayerTypes.js';

/**
 * Common shader chunks
 */
const ShaderChunks = {
    // Vertex shader - passes necessary data to fragment
    // Uses flat interpolation for normals to avoid UV flickering on voxel faces
    // Includes Three.js shadow map support
    vertexShader: `
        #include <common>
        #include <shadowmap_pars_vertex>

        varying vec2 vUv;
        flat varying vec3 vFlatWorldNormal;
        flat varying vec3 vFlatLocalNormal;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;
        varying vec3 vViewPosition;

        void main() {
            vUv = uv;
            // Local-space position for pattern mapping (stays fixed to the mesh)
            vLocalPosition = position;
            // Local-space normal for face detection
            vFlatLocalNormal = normal;

            // World-space normals for lighting (flat for face detection, smooth for general use)
            vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vFlatWorldNormal = worldNormal;
            vWorldNormal = worldNormal;

            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;

            gl_Position = projectionMatrix * mvPosition;

            // Shadow map calculations - need transformedNormal for shadowmap_vertex
            #if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_SHADOWS > 0 )
                vec3 transformedNormal = worldNormal;
            #endif
            #include <shadowmap_vertex>
        }
    `,

    // Simplex noise function
    noiseFunction: `
        // Simplex 3D noise
        vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
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

            i = mod(i, 289.0);
            vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 1.0/7.0;
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

        float fbm(vec3 p, int octaves) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            for (int i = 0; i < 4; i++) {
                if (i >= octaves) break;
                value += amplitude * snoise(p * frequency);
                amplitude *= 0.5;
                frequency *= 2.0;
            }
            return value;
        }
    `,

    // Blend mode functions
    blendFunctions: `
        vec3 blendMultiply(vec3 base, vec3 blend, float opacity) {
            return mix(base, base * blend, opacity);
        }

        vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
            return mix(base, min(base + blend, vec3(1.0)), opacity);
        }

        vec3 blendScreen(vec3 base, vec3 blend, float opacity) {
            return mix(base, vec3(1.0) - (vec3(1.0) - base) * (vec3(1.0) - blend), opacity);
        }

        vec3 blendOverlay(vec3 base, vec3 blend, float opacity) {
            vec3 result;
            result.r = base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r));
            result.g = base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g));
            result.b = base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b));
            return mix(base, result, opacity);
        }

        vec3 blendReplace(vec3 base, vec3 blend, float opacity) {
            return mix(base, blend, opacity);
        }

        vec3 blendMix(vec3 base, vec3 blend, float opacity) {
            return mix(base, blend, opacity);
        }
    `,

    // Get UV coordinates based on face normal (triplanar-like mapping)
    // Uses LOCAL coordinates so patterns stay fixed to mesh faces when rotating
    faceUV: `
        vec2 getFaceUV(vec3 localPos, vec3 localNormal) {
            vec3 absNormal = abs(localNormal);
            vec2 uv;

            // Choose UV based on dominant normal axis in LOCAL space
            if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                // Top/bottom face - use XZ
                uv = localPos.xz;
            } else if (absNormal.x > absNormal.z) {
                // Left/right face - use ZY
                uv = localPos.zy;
            } else {
                // Front/back face - use XY
                uv = localPos.xy;
            }

            return uv;
        }
    `,

    // PBR-like lighting that uses scene light uniforms (supports main light + fill light)
    lighting: `
        vec3 calculateLighting(vec3 color, vec3 normal, vec3 viewDir, float roughness, float metalness,
                               vec3 lightDirection, vec3 lightColor, float lightIntensity,
                               vec3 fillLightDir, vec3 fillLightCol, float fillLightInt,
                               vec3 ambientColor) {
            // Ambient from scene - ensure minimum ambient to prevent pure black shadows
            vec3 effectiveAmbient = max(ambientColor, vec3(0.1));
            vec3 ambient = effectiveAmbient * color;

            // Main directional light
            vec3 lightDir = normalize(lightDirection);
            float NdotL = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = NdotL * color * lightColor * lightIntensity;

            // Specular for main light (Blinn-Phong approximation)
            vec3 halfDir = normalize(lightDir + viewDir);
            float specPower = mix(16.0, 128.0, 1.0 - roughness);
            float spec = pow(max(dot(normal, halfDir), 0.0), specPower);
            vec3 specColor = mix(vec3(0.04), color, metalness);
            vec3 specular = spec * specColor * lightColor * lightIntensity * (1.0 - roughness) * 0.25;

            // Fill light (second directional light for softer shadows)
            vec3 fillDir = normalize(fillLightDir);
            float fillNdotL = max(dot(normal, fillDir), 0.0);
            vec3 fillDiffuse = fillNdotL * color * fillLightCol * fillLightInt;

            // Combine all light contributions
            vec3 result = ambient + diffuse + specular + fillDiffuse;

            return result;
        }
    `
};

/**
 * Layer pattern generators
 */
const LayerPatterns = {
    [LayerType.Brick]: (index) => `
        vec3 getBrickPattern${index}(vec3 localPos, vec3 localNormal, vec3 baseColor) {
            vec3 mortarColor = layer${index}_mortarColor;
            float mortarThickness = layer${index}_mortarThickness;
            float brickW = layer${index}_brickWidth;
            float brickH = layer${index}_brickHeight;
            float rowOffset = layer${index}_offset;

            vec2 faceCoord = getFaceUV(localPos, localNormal);
            vec2 uv = faceCoord * vec2(brickW, brickH);

            // Offset every other row
            float row = floor(uv.y);
            if (mod(row, 2.0) == 1.0) {
                uv.x += rowOffset;
            }

            // Get brick cell position
            vec2 brick = fract(uv);

            // Mortar lines
            float mortarX = step(brick.x, mortarThickness) + step(1.0 - mortarThickness, brick.x);
            float mortarY = step(brick.y, mortarThickness) + step(1.0 - mortarThickness, brick.y);
            float isMortar = max(mortarX, mortarY);

            return mix(baseColor, mortarColor, isMortar);
        }
    `,

    [LayerType.Checker]: (index) => `
        vec3 getCheckerPattern${index}(vec3 localPos, vec3 localNormal, vec3 baseColor) {
            vec3 color2 = layer${index}_color2;
            float scale = layer${index}_scale;

            vec2 faceCoord = getFaceUV(localPos, localNormal);
            vec2 uv = faceCoord * scale;
            float checker = mod(floor(uv.x) + floor(uv.y), 2.0);

            return mix(baseColor, color2, checker);
        }
    `,

    [LayerType.Noise]: (index) => `
        vec3 getNoisePattern${index}(vec3 localPos, vec3 normal, vec3 baseColor) {
            vec3 color2 = layer${index}_color2;
            float scale = layer${index}_scale;
            float contrast = layer${index}_contrast;
            int octaves = int(layer${index}_octaves);

            // Noise uses local 3D coordinates so it stays fixed to the mesh
            float n = fbm(localPos * scale, octaves);
            n = (n + 1.0) * 0.5; // Normalize to 0-1
            n = pow(n, contrast);

            return mix(baseColor, color2, n);
        }
    `,

    [LayerType.Gradient]: (index) => `
        vec3 getGradientPattern${index}(vec3 localPos, vec3 localNormal, vec3 baseColor) {
            vec3 color2 = layer${index}_color2;
            float direction = layer${index}_direction;
            float midpoint = layer${index}_midpoint;

            // Gradient uses face-aware coordinates
            vec2 faceCoord = getFaceUV(localPos, localNormal);
            float t;
            if (direction < 0.5) {
                // Vertical (along face Y)
                t = faceCoord.y + 0.5;
            } else if (direction < 1.5) {
                // Horizontal (along face X)
                t = faceCoord.x + 0.5;
            } else {
                // Diagonal
                t = (faceCoord.x + faceCoord.y) * 0.5 + 0.5;
            }

            // Apply midpoint adjustment
            t = smoothstep(0.0, 1.0, (t - 0.5) / midpoint + 0.5);

            return mix(baseColor, color2, clamp(t, 0.0, 1.0));
        }
    `,

    [LayerType.WoodGrain]: (index) => `
        vec3 getWoodGrainPattern${index}(vec3 localPos, vec3 normal, vec3 baseColor) {
            vec3 grainColor = layer${index}_grainColor;
            float grainScale = layer${index}_grainScale;
            float grainStrength = layer${index}_grainStrength;
            float ringScale = layer${index}_ringScale;

            // Wood grain uses local 3D coordinates so it stays fixed to the mesh
            float grain = sin((localPos.x * ringScale + snoise(localPos * grainScale * 0.5) * 0.3) * 3.14159 * grainScale);
            grain = (grain + 1.0) * 0.5;
            grain = pow(grain, 2.0);

            // Add some noise variation
            float noise = snoise(localPos * grainScale * 2.0) * 0.1;

            return mix(baseColor, grainColor, grain * grainStrength + noise);
        }
    `,

    [LayerType.Weave]: (index) => `
        vec3 getWeavePattern${index}(vec3 localPos, vec3 localNormal, vec3 baseColor) {
            vec3 color2 = layer${index}_color2;
            float scale = layer${index}_scale;
            float threadWidth = layer${index}_threadWidth;

            vec2 faceCoord = getFaceUV(localPos, localNormal);
            vec2 uv = faceCoord * scale;
            float warpThread = step(fract(uv.x), threadWidth);
            float weftThread = step(fract(uv.y), threadWidth);

            // Weave pattern - threads go over/under
            float overUnder = mod(floor(uv.x) + floor(uv.y), 2.0);
            float pattern = mix(warpThread, weftThread, overUnder);

            return mix(baseColor, color2, pattern * 0.5);
        }
    `,

    [LayerType.Stripes]: (index) => `
        vec3 getStripesPattern${index}(vec3 localPos, vec3 localNormal, vec3 baseColor) {
            vec3 color2 = layer${index}_color2;
            float scale = layer${index}_scale;
            float thickness = layer${index}_thickness;
            float direction = layer${index}_direction;

            vec2 faceCoord = getFaceUV(localPos, localNormal);
            float coord;
            if (direction < 0.5) {
                coord = faceCoord.y; // Horizontal stripes
            } else if (direction < 1.5) {
                coord = faceCoord.x; // Vertical stripes
            } else {
                coord = (faceCoord.x + faceCoord.y) * 0.707; // Diagonal
            }

            float stripe = step(fract(coord * scale), thickness);

            return mix(baseColor, color2, stripe);
        }
    `,

    [LayerType.Dots]: (index) => `
        vec3 getDotsPattern${index}(vec3 localPos, vec3 localNormal, vec3 baseColor) {
            vec3 color2 = layer${index}_color2;
            float scale = layer${index}_scale;
            float dotSize = layer${index}_dotSize;

            vec2 faceCoord = getFaceUV(localPos, localNormal);
            vec2 uv = faceCoord * scale;
            vec2 cell = fract(uv) - 0.5;
            float dist = length(cell);
            float dot = 1.0 - smoothstep(dotSize * 0.4, dotSize * 0.5, dist);

            return mix(baseColor, color2, dot);
        }
    `
};

/**
 * Build uniforms for a layer
 */
function buildLayerUniforms(layer, index) {
    const uniforms = {};
    const prefix = `layer${index}_`;

    // Add all params as uniforms
    for (const [key, value] of Object.entries(layer.params)) {
        if (typeof value === 'string' && value.startsWith('#')) {
            // Color
            uniforms[prefix + key] = { value: new THREE.Color(value) };
        } else if (key === 'direction') {
            // Convert direction to numeric
            const dirMap = { vertical: 0, horizontal: 1, diagonal: 2 };
            uniforms[prefix + key] = { value: dirMap[value] || 0 };
        } else {
            uniforms[prefix + key] = { value: value };
        }
    }

    // Add blend and opacity
    uniforms[prefix + 'opacity'] = { value: layer.opacity };

    return uniforms;
}

/**
 * Build uniform declarations for a layer
 */
function buildLayerUniformDeclarations(layer, index) {
    const lines = [];
    const prefix = `layer${index}_`;

    for (const [key, value] of Object.entries(layer.params)) {
        if (typeof value === 'string' && value.startsWith('#')) {
            lines.push(`uniform vec3 ${prefix}${key};`);
        } else {
            lines.push(`uniform float ${prefix}${key};`);
        }
    }

    lines.push(`uniform float ${prefix}opacity;`);

    return lines.join('\n');
}

/**
 * Get the blend function call for a layer
 */
function getBlendCall(blendMode, index) {
    const opacity = `layer${index}_opacity`;
    switch (blendMode) {
        case BlendMode.Multiply:
            return `blendMultiply(color, layerColor, ${opacity})`;
        case BlendMode.Add:
            return `blendAdd(color, layerColor, ${opacity})`;
        case BlendMode.Screen:
            return `blendScreen(color, layerColor, ${opacity})`;
        case BlendMode.Overlay:
            return `blendOverlay(color, layerColor, ${opacity})`;
        case BlendMode.Replace:
            return `blendReplace(color, layerColor, ${opacity})`;
        case BlendMode.Mix:
        default:
            return `blendMix(color, layerColor, ${opacity})`;
    }
}

/**
 * Build a complete shader material from base properties and layers
 */
export function buildLayeredShader(base, layers, sceneLights = null) {
    const opacity = base.opacity ?? 1;
    const isTransparent = opacity < 1;

    // Default light values (will be updated by scene)
    const defaultLightDir = new THREE.Vector3(0.5, 1.0, 0.3).normalize();
    const defaultLightColor = new THREE.Color(1.0, 0.98, 0.95);
    // Default ambient - should be overwritten by onBeforeRender if scene has ambient light
    const defaultAmbientColor = new THREE.Color(0.4, 0.4, 0.4);

    // Base uniforms including lighting
    const uniforms = {
        baseColor: { value: new THREE.Color(base.color) },
        roughness: { value: base.roughness },
        metalness: { value: base.metalness },
        clearcoat: { value: base.clearcoat },
        emissiveColor: { value: new THREE.Color(base.emissive || '#000000') },
        emissiveIntensity: { value: base.emissiveIntensity || 0 },
        materialOpacity: { value: opacity },
        // Scene lighting uniforms - main light
        lightDirection: { value: defaultLightDir },
        lightColor: { value: defaultLightColor },
        lightIntensity: { value: 1.0 },
        // Fill light (second directional light)
        fillLightDirection: { value: new THREE.Vector3(-0.5, 0.3, 0.5).normalize() },
        fillLightColor: { value: new THREE.Color(0.5, 0.6, 0.8) },
        fillLightIntensity: { value: 0.3 },
        // Ambient
        ambientColor: { value: defaultAmbientColor },
        // Custom shadow map uniforms
        customShadowMap: { value: null },
        customShadowMatrix: { value: new THREE.Matrix4() },
        customShadowBias: { value: 0.005 },
        customShadowMapSize: { value: new THREE.Vector2(1024, 1024) },
        hasShadowMap: { value: false }
    };

    // Collect layer uniforms and code
    // Note: customShadowMap, customShadowMatrix, etc. are declared in the fragment shader directly
    const uniformDeclarations = [
        'uniform vec3 baseColor;',
        'uniform float roughness;',
        'uniform float metalness;',
        'uniform float clearcoat;',
        'uniform vec3 emissiveColor;',
        'uniform float emissiveIntensity;',
        'uniform float materialOpacity;',
        'uniform vec3 lightDirection;',
        'uniform vec3 lightColor;',
        'uniform float lightIntensity;',
        'uniform vec3 fillLightDirection;',
        'uniform vec3 fillLightColor;',
        'uniform float fillLightIntensity;',
        'uniform vec3 ambientColor;'
    ];
    const patternFunctions = [];
    const patternCalls = [];

    const enabledLayers = layers.filter(l => l.enabled !== false);

    enabledLayers.forEach((layer, index) => {
        // Add uniforms
        Object.assign(uniforms, buildLayerUniforms(layer, index));

        // Add declarations
        uniformDeclarations.push(buildLayerUniformDeclarations(layer, index));

        // Add pattern function
        const patternGenerator = LayerPatterns[layer.type];
        if (patternGenerator) {
            patternFunctions.push(patternGenerator(index));
        }

        // Add pattern call with blending
        const funcName = `get${layer.type.charAt(0).toUpperCase() + layer.type.slice(1)}Pattern${index}`;
        patternCalls.push(`
            layerColor = ${funcName}(vLocalPosition, localNormal, color);
            color = ${getBlendCall(layer.blend, index)};
        `);
    });

    // Build fragment shader with shadow support
    // We use a custom shadow sampling approach that works with Three.js shadow maps
    // but doesn't rely on the preprocessor defines being set correctly
    const fragmentShader = `
        #include <common>
        #include <packing>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>

        ${uniformDeclarations.join('\n')}

        // Custom shadow map uniforms - we'll set these manually
        uniform sampler2D customShadowMap;
        uniform mat4 customShadowMatrix;
        uniform float customShadowBias;
        uniform vec2 customShadowMapSize;
        uniform bool hasShadowMap;

        varying vec2 vUv;
        flat varying vec3 vFlatWorldNormal;
        flat varying vec3 vFlatLocalNormal;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;
        varying vec3 vViewPosition;

        ${ShaderChunks.noiseFunction}
        ${ShaderChunks.blendFunctions}
        ${ShaderChunks.faceUV}
        ${patternFunctions.join('\n')}
        ${ShaderChunks.lighting}

        // Custom shadow sampling function
        float sampleShadow(sampler2D shadowMap, vec4 shadowCoord, float bias, vec2 mapSize) {
            // Perspective divide
            vec3 projCoords = shadowCoord.xyz / shadowCoord.w;

            // Check if we're outside the shadow map bounds
            // Note: projCoords should be in [0,1] range for valid shadow map lookup
            if (projCoords.x < 0.0 || projCoords.x > 1.0 ||
                projCoords.y < 0.0 || projCoords.y > 1.0 ||
                projCoords.z < 0.0 || projCoords.z > 1.0) {
                return 1.0; // Not in shadow if outside shadow map bounds
            }

            // Get depth from shadow map
            float closestDepth = unpackRGBAToDepth(texture2D(shadowMap, projCoords.xy));
            float currentDepth = projCoords.z;

            // Shadow test with bias (use absolute value since Three.js uses negative bias)
            float absBias = abs(bias) + 0.001;
            float shadow = currentDepth - absBias > closestDepth ? 0.0 : 1.0;

            // Simple PCF for softer shadows
            float texelSize = 1.0 / mapSize.x;
            float shadowSum = 0.0;
            for (int x = -1; x <= 1; x++) {
                for (int y = -1; y <= 1; y++) {
                    vec2 offset = vec2(float(x), float(y)) * texelSize;
                    float depth = unpackRGBAToDepth(texture2D(shadowMap, projCoords.xy + offset));
                    shadowSum += currentDepth - absBias > depth ? 0.0 : 1.0;
                }
            }

            return shadowSum / 9.0;
        }

        void main() {
            vec3 color = baseColor;
            vec3 layerColor;
            // Use flat LOCAL normal for pattern UV mapping (stays fixed to mesh)
            vec3 localNormal = normalize(vFlatLocalNormal);
            // Use flat WORLD normal for lighting calculations
            vec3 faceNormal = normalize(vFlatWorldNormal);
            vec3 viewDir = normalize(vViewPosition);

            // Pattern calls use localNormal for consistent UV mapping on each face
            ${patternCalls.join('\n')}

            // Calculate shadow factor using our custom shadow sampling
            float shadowFactor = 1.0;
            if (hasShadowMap) {
                vec4 shadowCoord = customShadowMatrix * vec4(vWorldPosition, 1.0);
                shadowFactor = sampleShadow(customShadowMap, shadowCoord, customShadowBias, customShadowMapSize);
            }

            // Apply lighting using scene light uniforms (use faceNormal for proper flat shading)
            vec3 litColor = calculateLighting(color, faceNormal, viewDir, roughness, metalness,
                                              lightDirection, lightColor, lightIntensity * shadowFactor,
                                              fillLightDirection, fillLightColor, fillLightIntensity,
                                              ambientColor);

            // Apply clearcoat (simple approximation)
            if (clearcoat > 0.0) {
                float fresnel = pow(1.0 - max(dot(faceNormal, viewDir), 0.0), 3.0);
                litColor += clearcoat * fresnel * vec3(0.5);
            }

            // Apply emissive
            litColor += emissiveColor * emissiveIntensity;

            gl_FragColor = vec4(litColor, materialOpacity);
        }
    `;

    // Merge our uniforms with Three.js shadow map uniforms
    const mergedUniforms = THREE.UniformsUtils.merge([
        THREE.UniformsLib.lights,
        uniforms
    ]);

    const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: mergedUniforms,
        vertexShader: ShaderChunks.vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        flatShading: false,
        transparent: isTransparent,
        lights: true  // Enable Three.js light uniforms (needed for shadow maps)
    });

    // Force shadow map support - Three.js will set NUM_DIR_LIGHT_SHADOWS based on scene
    // but we need to signal that this material CAN receive shadows
    shaderMaterial.defines = shaderMaterial.defines || {};
    shaderMaterial.defines.USE_SHADOWMAP = '';

    // Add onBeforeRender callback to sync lighting and shadow uniforms with scene lights
    shaderMaterial.onBeforeRender = function(renderer, scene, camera, geometry, object, group) {
        // Find all lights in scene
        const directionalLights = [];
        let ambientLight = null;

        scene.traverse((obj) => {
            if (obj.isDirectionalLight) {
                directionalLights.push(obj);
            }
            if (obj.isAmbientLight && !ambientLight) {
                ambientLight = obj;
            }
        });

        // Main light (first directional light, usually the brightest/main one)
        if (directionalLights.length > 0 && this.uniforms.lightDirection) {
            const mainLight = directionalLights[0];
            const lightDir = new THREE.Vector3();
            if (mainLight.target) {
                lightDir.subVectors(mainLight.position, mainLight.target.position).normalize();
            } else {
                lightDir.copy(mainLight.position).normalize();
            }

            this.uniforms.lightDirection.value.copy(lightDir);
            this.uniforms.lightColor.value.copy(mainLight.color);
            this.uniforms.lightIntensity.value = mainLight.intensity;

            // Sync shadow map from the main directional light
            // Note: shadow.map is only available after at least one render pass with shadows
            const shadow = mainLight.shadow;
            if (mainLight.castShadow && shadow && shadow.map && shadow.map.texture && object.receiveShadow) {
                // Debug: log once per material
                if (!this._shadowDebugLogged) {
                    console.log('Shadow map synced:', {
                        hasShadowMap: true,
                        mapSize: [shadow.mapSize.width, shadow.mapSize.height],
                        bias: shadow.bias,
                        matrixElements: shadow.matrix.elements.slice(0, 4)
                    });
                    this._shadowDebugLogged = true;
                }

                this.uniforms.hasShadowMap.value = true;
                this.uniforms.customShadowMap.value = shadow.map.texture;
                this.uniforms.customShadowBias.value = shadow.bias;
                this.uniforms.customShadowMapSize.value.set(
                    shadow.mapSize.width,
                    shadow.mapSize.height
                );

                // Build shadow matrix: bias * projectionMatrix * viewMatrix
                // where bias converts from clip space [-1,1] to texture space [0,1]
                // Use Three.js's built-in shadow matrix which is already computed correctly
                this.uniforms.customShadowMatrix.value.copy(shadow.matrix);
            } else {
                this.uniforms.hasShadowMap.value = false;
                // Debug: log why shadow isn't working
                if (!this._shadowFailDebugLogged) {
                    console.log('Shadow map NOT synced:', {
                        castShadow: mainLight.castShadow,
                        hasShadow: !!shadow,
                        hasMap: !!shadow?.map,
                        hasTexture: !!shadow?.map?.texture,
                        receiveShadow: object.receiveShadow
                    });
                    this._shadowFailDebugLogged = true;
                }
            }
        }

        // Fill light (second directional light)
        if (directionalLights.length > 1 && this.uniforms.fillLightDirection) {
            const fillLight = directionalLights[1];
            const fillDir = new THREE.Vector3();
            if (fillLight.target) {
                fillDir.subVectors(fillLight.position, fillLight.target.position).normalize();
            } else {
                fillDir.copy(fillLight.position).normalize();
            }

            this.uniforms.fillLightDirection.value.copy(fillDir);
            this.uniforms.fillLightColor.value.copy(fillLight.color);
            this.uniforms.fillLightIntensity.value = fillLight.intensity;
        } else if (this.uniforms.fillLightIntensity) {
            // No fill light - set intensity to 0
            this.uniforms.fillLightIntensity.value = 0;
        }

        // Update ambient light uniforms
        if (this.uniforms.ambientColor) {
            if (ambientLight) {
                const ambientContrib = ambientLight.color.clone().multiplyScalar(ambientLight.intensity);
                this.uniforms.ambientColor.value.copy(ambientContrib);
            } else {
                // Fallback ambient if no ambient light found
                this.uniforms.ambientColor.value.set(0.3, 0.3, 0.3);
            }
        }
    };

    return shaderMaterial;
}

/**
 * Build a simple solid material (no layers)
 */
export function buildSolidMaterial(base) {
    const opacity = base.opacity ?? 1;
    const isTransparent = opacity < 1;

    return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(base.color),
        roughness: base.roughness,
        metalness: base.metalness,
        clearcoat: base.clearcoat,
        clearcoatRoughness: 0.1,
        emissive: new THREE.Color(base.emissive || '#000000'),
        emissiveIntensity: base.emissiveIntensity || 0,
        opacity: opacity,
        transparent: isTransparent,
        flatShading: true,
        side: THREE.DoubleSide
    });
}

/**
 * Main build function - decides which approach to use
 */
export function buildMaterial(base, layers) {
    const enabledLayers = layers.filter(l => l.enabled !== false);

    if (enabledLayers.length === 0) {
        // No layers - use simple MeshPhysicalMaterial
        return buildSolidMaterial(base);
    } else {
        // Has layers - use custom shader
        return buildLayeredShader(base, enabledLayers);
    }
}

/**
 * Update uniforms on an existing shader material
 */
export function updateShaderUniforms(material, base, layers) {
    if (!material.uniforms) return;

    // Update base uniforms
    if (material.uniforms.baseColor) {
        material.uniforms.baseColor.value.set(base.color);
    }
    if (material.uniforms.roughness) {
        material.uniforms.roughness.value = base.roughness;
    }
    if (material.uniforms.metalness) {
        material.uniforms.metalness.value = base.metalness;
    }
    if (material.uniforms.clearcoat) {
        material.uniforms.clearcoat.value = base.clearcoat;
    }
    if (material.uniforms.emissiveColor) {
        material.uniforms.emissiveColor.value.set(base.emissive || '#000000');
    }
    if (material.uniforms.emissiveIntensity) {
        material.uniforms.emissiveIntensity.value = base.emissiveIntensity || 0;
    }
    if (material.uniforms.materialOpacity) {
        material.uniforms.materialOpacity.value = base.opacity ?? 1;
    }

    // Update layer uniforms
    const enabledLayers = layers.filter(l => l.enabled !== false);
    enabledLayers.forEach((layer, index) => {
        const prefix = `layer${index}_`;

        for (const [key, value] of Object.entries(layer.params)) {
            const uniformKey = prefix + key;
            if (material.uniforms[uniformKey]) {
                if (typeof value === 'string' && value.startsWith('#')) {
                    material.uniforms[uniformKey].value.set(value);
                } else if (key === 'direction') {
                    const dirMap = { vertical: 0, horizontal: 1, diagonal: 2 };
                    material.uniforms[uniformKey].value = dirMap[value] || 0;
                } else {
                    material.uniforms[uniformKey].value = value;
                }
            }
        }

        const opacityKey = prefix + 'opacity';
        if (material.uniforms[opacityKey]) {
            material.uniforms[opacityKey].value = layer.opacity;
        }
    });

    material.needsUpdate = true;
}

/**
 * Update lighting uniforms from scene lights
 * Call this when scene lights change
 */
export function updateLightingUniforms(material, scene) {
    if (!material.uniforms) return;

    // Find directional light in scene
    let directionalLight = null;
    let ambientLight = null;

    scene.traverse((obj) => {
        if (obj.isDirectionalLight && !directionalLight) {
            directionalLight = obj;
        }
        if (obj.isAmbientLight && !ambientLight) {
            ambientLight = obj;
        }
    });

    // Update directional light uniforms
    if (directionalLight && material.uniforms.lightDirection) {
        // Get light direction (from light position toward origin, or use target)
        const lightDir = new THREE.Vector3();
        if (directionalLight.target) {
            lightDir.subVectors(directionalLight.position, directionalLight.target.position).normalize();
        } else {
            lightDir.copy(directionalLight.position).normalize();
        }
        material.uniforms.lightDirection.value.copy(lightDir);
    }

    if (directionalLight && material.uniforms.lightColor) {
        material.uniforms.lightColor.value.copy(directionalLight.color);
    }

    if (directionalLight && material.uniforms.lightIntensity) {
        material.uniforms.lightIntensity.value = directionalLight.intensity;
    }

    // Update ambient light uniforms
    if (ambientLight && material.uniforms.ambientColor) {
        const ambientContrib = ambientLight.color.clone().multiplyScalar(ambientLight.intensity);
        material.uniforms.ambientColor.value.copy(ambientContrib);
    }
}

/**
 * Sync all shader materials in a mesh with scene lights
 */
export function syncMaterialsWithSceneLights(mesh, scene) {
    if (!mesh || !scene) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    materials.forEach(material => {
        if (material && material.uniforms) {
            updateLightingUniforms(material, scene);
        }
    });
}
