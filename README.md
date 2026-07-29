# Interactive Portfolio

A Bruno Simon-inspired interactive portfolio where visitors drive a car to explore your profile.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Architecture

This project follows Bruno Simon's architectural patterns:

```
src/
├── core/
│   ├── Game.js      # Singleton orchestrator
│   └── Ticker.js    # Ordered game loop system
├── systems/
│   ├── Renderer.js  # Three.js WebGL renderer
│   ├── Camera.js    # Third-person camera follow
│   ├── Physics.js   # Rapier.js physics wrapper
│   └── Inputs.js    # Keyboard/touch input handling
├── world/
│   ├── World.js     # Ground, obstacles, decorations
│   ├── Vehicle.js   # Drivable car with physics
│   └── ZoneManager.js # Content trigger zones
├── ui/
│   └── UI.js        # HTML overlays and minimap
├── styles.css       # All styling
└── main.js          # Entry point
```

## Customizing Your Portfolio

### 1. Edit Content Zones

Open `src/world/ZoneManager.js` and modify the `zoneConfigs` array:

```javascript
const zoneConfigs = [
  {
    id: 'about',
    x: 0,              // X position in world
    z: -20,            // Z position in world
    radius: 10,        // Trigger radius
    title: 'ABOUT',    // Label shown in world
    color: 0x4facfe,   // Zone color (hex)
    content: {
      title: 'About Me',
      body: `<p>Your HTML content here</p>`
    }
  },
  // Add more zones...
]
```

### 2. Customize the Vehicle

Edit `src/world/Vehicle.js` to change:
- Colors and materials in `createMesh()`
- Physics parameters in `this.params`
- Wheel appearance in `createWheels()`

### 3. Modify the World

Edit `src/world/World.js` to:
- Change ground color/texture
- Add/remove obstacles and decorations
- Adjust lighting

### 4. Style the UI

Edit `src/styles.css` to customize:
- Panel appearance
- Color scheme
- Fonts and typography

## Controls

- **WASD / Arrow Keys**: Drive
- **Shift**: Boost
- **Space**: Brake

On mobile, drag anywhere to steer (virtual joystick).

## Key Concepts from Bruno Simon

1. **Ordered Ticker System**: Events fire in priority order (0-100)
2. **Physics-Visual Separation**: Physics bodies are separate from Three.js meshes
3. **Zone Trigger System**: Cylindrical collision areas trigger content
4. **Singleton Game Class**: Central orchestrator accessed via `Game.getInstance()`

## Next Steps

1. **Add 3D Models**: Replace box geometry with GLTF models
2. **Add Sounds**: Use Howler.js for engine/ambient sounds
3. **Improve Physics**: Implement proper wheel suspension
4. **Add Animations**: GSAP for smooth transitions
5. **Mobile Touch Controls**: Add virtual joystick UI

## Technologies

- [Three.js](https://threejs.org/) - 3D rendering
- [Rapier.js](https://rapier.rs/) - Physics engine
- [Vite](https://vitejs.dev/) - Build tool

## Credits

Inspired by [Bruno Simon's Portfolio](https://bruno-simon.com) and his [Three.js Journey](https://threejs-journey.com) course.
