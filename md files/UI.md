# EditVoxel UI Design System

This document describes the unified UI design system used throughout EditVoxel.

---

## Color Palette

### Primary Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Accent | `#4ecdc4` | Primary buttons, highlights, active states |
| Accent Hover | `#5fded5` | Hover states for accent elements |
| Background Dark | `#1a1a2e` | Main app background |
| Panel Background | `rgba(26, 26, 46, 0.95)` | Panels, modals, dialogs |

### Text Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Primary Text | `#fff` | Headings, important text |
| Secondary Text | `#888` | Labels, descriptions |
| Muted Text | `#666` | Hints, placeholders |

### UI Element Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Border Light | `rgba(255, 255, 255, 0.1)` | Input borders, dividers |
| Border Focus | `#4ecdc4` | Focused input borders |
| Input Background | `rgba(0, 0, 0, 0.3)` | Form inputs, selects |
| Button Secondary | `rgba(255, 255, 255, 0.1)` | Secondary buttons |

---

## Typography

- **Font Family**: `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`
- **Base Size**: 14px for body text
- **Labels**: 11px, uppercase, letter-spacing 0.5px
- **Section Titles**: 10px, uppercase, letter-spacing 1px

---

## Panels & Modals

### Base Panel Style (`.ui-panel`)
All panels and modals share these properties:
```css
.ui-panel {
    background: rgba(26, 26, 46, 0.95);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### Panel Header (`.ui-panel-header`)
```css
.ui-panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
```

### Modal Overlay (`.modal-overlay`)
```css
.modal-overlay {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
}
```

### Modal Animation
Modals use a subtle slide-in animation:
```css
@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}
```

---

## Buttons

### Primary Button (`.ui-btn-primary`, `.modal-btn-primary`)
- Background: `#4ecdc4`
- Text: `#1a1a2e`
- Hover: `#5fded5`, slight lift (`translateY(-1px)`)

### Secondary Button (`.ui-btn-secondary`, `.modal-btn-secondary`)
- Background: `rgba(255, 255, 255, 0.1)`
- Text: `#fff`
- Hover: `rgba(255, 255, 255, 0.15)`

### Ghost Button (`.ui-btn-ghost`, `.modal-btn-cancel`)
- Background: transparent
- Border: `1px solid rgba(255, 255, 255, 0.15)`
- Text: `#888`
- Hover: slight background, lighter text

### Button Sizing
```css
.ui-btn, .modal-btn {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
}
```

---

## Form Elements

### Input Fields (`.ui-input`)
```css
.ui-input {
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 13px;
}

.ui-input:focus {
    border-color: #4ecdc4;
    box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.15);
}
```

### Select Dropdowns (`.ui-select`)
Same styling as inputs, with custom appearance for consistency.

### Textarea (`.ui-textarea`)
Same as inputs, with `resize: vertical` and `min-height: 80px`.

### Labels (`.ui-label`)
```css
.ui-label {
    color: #888;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
}
```

### Range Sliders
```css
input[type="range"] {
    height: 4px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 2px;
}

input[type="range"]::-webkit-slider-thumb {
    width: 14px;
    height: 14px;
    background: #4ecdc4;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(78, 205, 196, 0.4);
}
```

---

## Hotkey Guide

Located at bottom-left of the screen, the hotkey guide displays keyboard shortcuts.

### Structure
```html
<div id="info">
    <div class="control-row">
        <span class="key-icon">🖱</span>
        <span class="control-label">Edit</span>
    </div>
    <!-- More controls... -->
    <div class="controls-advanced">
        <!-- Hidden by default, shown with Tab -->
    </div>
</div>
```

### Key Icon Style (`.key-icon`)
```css
.key-icon {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 600;
    min-width: 40px;
    text-align: center;
    backdrop-filter: blur(4px);
}
```

### Control Row (`.control-row`)
```css
.control-row {
    display: flex;
    align-items: center;
    margin: 12px 0;
}

.control-label {
    font-size: 16px;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
```

### Show More/Less Toggle
- Press `Tab` to toggle between basic and advanced controls
- Basic controls: Edit, Orbit, Zoom, Fly Up, Fly Down
- Advanced controls: Mirror Mode, Export OBJ, Flip Edge, Generate Image

---

## Specific Components

### Settings Panel (`#settings`)
- Position: Top-right corner
- Collapsible via header click
- Contains: Material settings, lighting controls, background settings

### Mirror Mode Dialog (`#mirrorDialog`)
- Centered modal
- Options: Mirror with Cleanup, Start Clean Model, Cancel

### Generate Dialog (`#generateDialog`)
- Position: Bottom-center (above capture frame)
- Transparent overlay (allows seeing the 3D view)
- Contains: Prompt input, settings gear toggle, progress indicator

### Gallery Panel (`#galleryPanel`)
- Slide-in panel from right
- Grid layout for generated images
- Hover effects for image actions

### Music Player (`#musicPlayer`)
- Position: Bottom-right
- Pill-shaped white background
- Teal play button (`#4ecdc4`)

### Gallery Button (`#galleryBtn`)
- Position: Bottom-right (above music player)
- Matching white pill style
- Badge shows image count

---

## Animation Guidelines

### Transitions
- Standard duration: `0.2s`
- Easing: `ease` or `ease-out`
- Common properties: `transform`, `opacity`, `background`, `border-color`

### Hover Effects
- Buttons: Slight lift or scale
- Inputs: Border color change with glow
- Images: Scale up slightly

### Panel Animations
- Settings panel collapse: Smooth content hide
- Modal appearance: Slide + fade in
- Gallery panel: Slide from right

---

## Z-Index Layers

| Layer | Z-Index | Components |
|-------|---------|------------|
| Base UI | 150 | Settings, info panel, bottom controls |
| Capture Frame | 100 | Image generation frame overlay |
| Resize Handles | 1000 | Capture frame handles |
| Modals | 1000 | All modal overlays |
| Gallery Panel | 200 | Slide-in gallery |

---

## Accessibility Notes

- All interactive elements have visible focus states
- Sufficient color contrast for text readability
- Keyboard navigation supported for dialogs
- Tooltips provided for icon-only buttons

---

## File Structure

```
index.html          - Main HTML with inline CSS
main.js             - Application logic
VoxelWorld.js       - 3D voxel rendering
VoxelEditor.js      - Editor interaction
UI.md               - This documentation
```
