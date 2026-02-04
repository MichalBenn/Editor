/**
 * ColorWheelPicker - A visual HSV color wheel picker
 *
 * Features:
 * - Circular hue wheel with rainbow gradient
 * - Central saturation/value square
 * - Draggable selectors
 * - Real-time preview
 */

export class ColorWheelPicker {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            size: options.size || 200,
            wheelWidth: options.wheelWidth || 25,
            onChange: options.onChange || (() => {}),
            initialColor: options.initialColor || '#ff0000'
        };

        // HSV values (0-1 range)
        this.hue = 0;
        this.saturation = 1;
        this.value = 1;

        // State
        this.isDraggingWheel = false;
        this.isDraggingSquare = false;

        this._create();
        this.setColor(this.options.initialColor);
    }

    _create() {
        const size = this.options.size;
        const wheelWidth = this.options.wheelWidth;

        // Create container
        this.element = document.createElement('div');
        this.element.className = 'color-wheel-picker';
        this.element.style.cssText = `
            position: relative;
            width: ${size}px;
            height: ${size}px;
            user-select: none;
        `;

        // Create canvas for the wheel
        this.canvas = document.createElement('canvas');
        this.canvas.width = size;
        this.canvas.height = size;
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            cursor: crosshair;
        `;
        this.ctx = this.canvas.getContext('2d');

        // Create hue selector (on the wheel)
        this.hueSelector = document.createElement('div');
        this.hueSelector.className = 'hue-selector';
        this.hueSelector.style.cssText = `
            position: absolute;
            width: ${wheelWidth}px;
            height: ${wheelWidth}px;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 3px rgba(0,0,0,0.5), inset 0 0 2px rgba(0,0,0,0.3);
            pointer-events: none;
            transform: translate(-50%, -50%);
            box-sizing: border-box;
        `;

        // Create SV selector (in the square)
        this.svSelector = document.createElement('div');
        this.svSelector.className = 'sv-selector';
        this.svSelector.style.cssText = `
            position: absolute;
            width: 16px;
            height: 16px;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
            pointer-events: none;
            transform: translate(-50%, -50%);
            box-sizing: border-box;
        `;

        // Color preview
        this.preview = document.createElement('div');
        this.preview.className = 'color-preview';
        this.preview.style.cssText = `
            position: absolute;
            bottom: -35px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 25px;
            border-radius: 4px;
            border: 2px solid rgba(255,255,255,0.3);
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;

        this.element.appendChild(this.canvas);
        this.element.appendChild(this.hueSelector);
        this.element.appendChild(this.svSelector);
        this.element.appendChild(this.preview);
        this.container.appendChild(this.element);

        this._drawWheel();
        this._bindEvents();
    }

    _drawWheel() {
        const ctx = this.ctx;
        const size = this.options.size;
        const wheelWidth = this.options.wheelWidth;
        const center = size / 2;
        const outerRadius = size / 2 - 2;
        const innerRadius = outerRadius - wheelWidth;

        ctx.clearRect(0, 0, size, size);

        // Draw hue wheel
        for (let angle = 0; angle < 360; angle += 0.5) {
            const startAngle = (angle - 1) * Math.PI / 180;
            const endAngle = (angle + 1) * Math.PI / 180;

            ctx.beginPath();
            ctx.moveTo(
                center + innerRadius * Math.cos(startAngle),
                center + innerRadius * Math.sin(startAngle)
            );
            ctx.arc(center, center, outerRadius, startAngle, endAngle);
            ctx.arc(center, center, innerRadius, endAngle, startAngle, true);
            ctx.closePath();

            ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
            ctx.fill();
        }

        // Draw SV square
        this._drawSVSquare();
    }

    _drawSVSquare() {
        const ctx = this.ctx;
        const size = this.options.size;
        const wheelWidth = this.options.wheelWidth;
        const center = size / 2;
        const innerRadius = size / 2 - wheelWidth - 8;

        // Calculate square size to fit inside the wheel
        const squareSize = innerRadius * Math.sqrt(2) * 0.95;
        const squareX = center - squareSize / 2;
        const squareY = center - squareSize / 2;

        // Store square bounds for hit testing
        this.squareBounds = {
            x: squareX,
            y: squareY,
            size: squareSize
        };

        // Draw the saturation/value gradient
        // First, fill with the current hue at full saturation
        const hueColor = `hsl(${this.hue * 360}, 100%, 50%)`;
        ctx.fillStyle = hueColor;
        ctx.fillRect(squareX, squareY, squareSize, squareSize);

        // White to transparent gradient (saturation)
        const whiteGradient = ctx.createLinearGradient(squareX, squareY, squareX + squareSize, squareY);
        whiteGradient.addColorStop(0, 'rgba(255,255,255,1)');
        whiteGradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = whiteGradient;
        ctx.fillRect(squareX, squareY, squareSize, squareSize);

        // Black to transparent gradient (value)
        const blackGradient = ctx.createLinearGradient(squareX, squareY, squareX, squareY + squareSize);
        blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
        blackGradient.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = blackGradient;
        ctx.fillRect(squareX, squareY, squareSize, squareSize);

        // Draw border
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(squareX, squareY, squareSize, squareSize);
    }

    _bindEvents() {
        const canvas = this.canvas;

        const getMousePos = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        const handleStart = (e) => {
            e.preventDefault();
            const pos = getMousePos(e.touches ? e.touches[0] : e);

            if (this._isInWheel(pos.x, pos.y)) {
                this.isDraggingWheel = true;
                this._updateHue(pos.x, pos.y);
            } else if (this._isInSquare(pos.x, pos.y)) {
                this.isDraggingSquare = true;
                this._updateSV(pos.x, pos.y);
            }
        };

        const handleMove = (e) => {
            if (!this.isDraggingWheel && !this.isDraggingSquare) return;
            e.preventDefault();

            const pos = getMousePos(e.touches ? e.touches[0] : e);

            if (this.isDraggingWheel) {
                this._updateHue(pos.x, pos.y);
            } else if (this.isDraggingSquare) {
                this._updateSV(pos.x, pos.y);
            }
        };

        const handleEnd = () => {
            this.isDraggingWheel = false;
            this.isDraggingSquare = false;
        };

        canvas.addEventListener('mousedown', handleStart);
        canvas.addEventListener('touchstart', handleStart, { passive: false });

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('touchmove', handleMove, { passive: false });

        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchend', handleEnd);
    }

    _isInWheel(x, y) {
        const size = this.options.size;
        const wheelWidth = this.options.wheelWidth;
        const center = size / 2;
        const outerRadius = size / 2 - 2;
        const innerRadius = outerRadius - wheelWidth;

        const dx = x - center;
        const dy = y - center;
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist >= innerRadius && dist <= outerRadius;
    }

    _isInSquare(x, y) {
        if (!this.squareBounds) return false;
        const { x: sx, y: sy, size } = this.squareBounds;
        return x >= sx && x <= sx + size && y >= sy && y <= sy + size;
    }

    _updateHue(x, y) {
        const size = this.options.size;
        const center = size / 2;

        const angle = Math.atan2(y - center, x - center);
        this.hue = ((angle * 180 / Math.PI) + 360) % 360 / 360;

        this._redrawSVSquare();
        this._updateSelectors();
        this._emitChange();
    }

    _updateSV(x, y) {
        if (!this.squareBounds) return;

        const { x: sx, y: sy, size } = this.squareBounds;

        // Clamp to square bounds
        const clampedX = Math.max(sx, Math.min(sx + size, x));
        const clampedY = Math.max(sy, Math.min(sy + size, y));

        this.saturation = (clampedX - sx) / size;
        this.value = 1 - (clampedY - sy) / size;

        this._updateSelectors();
        this._emitChange();
    }

    _redrawSVSquare() {
        // Clear and redraw the entire canvas
        this._drawWheel();
    }

    _updateSelectors() {
        const size = this.options.size;
        const wheelWidth = this.options.wheelWidth;
        const center = size / 2;
        const wheelRadius = size / 2 - wheelWidth / 2 - 2;

        // Update hue selector position
        const hueAngle = this.hue * 2 * Math.PI;
        const hueX = center + wheelRadius * Math.cos(hueAngle);
        const hueY = center + wheelRadius * Math.sin(hueAngle);
        this.hueSelector.style.left = `${hueX}px`;
        this.hueSelector.style.top = `${hueY}px`;
        this.hueSelector.style.backgroundColor = `hsl(${this.hue * 360}, 100%, 50%)`;

        // Update SV selector position
        if (this.squareBounds) {
            const { x: sx, y: sy, size: sqSize } = this.squareBounds;
            const svX = sx + this.saturation * sqSize;
            const svY = sy + (1 - this.value) * sqSize;
            this.svSelector.style.left = `${svX}px`;
            this.svSelector.style.top = `${svY}px`;
        }

        // Update preview
        const color = this.getColor();
        this.preview.style.backgroundColor = color;
    }

    _emitChange() {
        this.options.onChange(this.getColor(), {
            hue: this.hue,
            saturation: this.saturation,
            value: this.value
        });
    }

    // Convert HSV to RGB hex
    getColor() {
        const h = this.hue;
        const s = this.saturation;
        const v = this.value;

        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }

        const toHex = (c) => {
            const hex = Math.round(c * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // Set color from hex string
    setColor(hex) {
        // Parse hex color
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return;

        const r = parseInt(result[1], 16) / 255;
        const g = parseInt(result[2], 16) / 255;
        const b = parseInt(result[3], 16) / 255;

        // Convert RGB to HSV
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;

        this.value = max;
        this.saturation = max === 0 ? 0 : d / max;

        if (max === min) {
            this.hue = 0;
        } else {
            switch (max) {
                case r: this.hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: this.hue = ((b - r) / d + 2) / 6; break;
                case b: this.hue = ((r - g) / d + 4) / 6; break;
            }
        }

        this._redrawSVSquare();
        this._updateSelectors();
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}
