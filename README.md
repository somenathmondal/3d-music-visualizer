# 3D Kinematic Music Visualizer (RedSands Theme)

A high-performance, browser-based 3D generative music visualizer built with **Three.js** and **Tone.js**. The application mimics the precise, deterministic mechanical aesthetics of classic *Animusic* animations.

## Key Features

1. **Procedural Instrument & Layout**:
   - **Step-Spiral Percussion Grid**: Drum pads are dynamically arranged in an ascending spiral based on note pitch/frequency.
   - **Mechanical Construction**: Drum pads are built as cylinders with outer structural metallic rings and inner neon glowing faces.
   - **Overhead Instrument Launchers**: Tracks have glowing emitter nozzles suspended overhead (at height $H_{spawn} = 8.5$), connected by faint wireframe lines representing physical structures.

2. **Timing Engine (Pure Kinematic Math)**:
   - Trajectories are pre-calculated backwards from the impact time ($t_{impact}$).
   - Spheres spawn at $t_{spawn} = t_{impact} - D$ (where travel duration $D = 1.2$ seconds).
   - In flight, the ball position matches linear interpolation on the horizontal plane ($X, Z$) and a parabolic arc on the vertical axis ($Y$):
     $$Y(\tau) = P_{start}.y + (P_{end}.y - P_{start}.y) \times \frac{\tau}{D} + 4 \times H_{peak} \times \frac{\tau}{D} \times \left(1 - \frac{\tau}{D}\right)$$
   - This mathematical formulation guarantees perfect audio-visual synchronization regardless of frame rate drops.

3. **Visual Effects (Neon Glow & Bloom)**:
   - **Post-Processing Bloom**: Features an `EffectComposer` with `RenderPass` and `UnrealBloomPass` (strength = 1.5, radius = 0.4, threshold = 0.15) for high-intensity glow.
   - **Active Trails**: The balls leave behind smooth, fading neon trails calculated using dynamic `THREE.BufferGeometry` over their last 10 frames.
   - **Impact Ripples**: Striking a pad triggers expanding flat ring ripples (`THREE.RingGeometry`) that fade out over 0.35 seconds.
   - **Decay Flash**: Strike impacts trigger a dramatic exponential emissive intensity flash on pads and a brief size expansion.
   - **Bounce Dynamics**: Balls bounce away horizontally and fade out after striking.

4. **Tone.js Sound Architecture**:
   - **Synth Timbres**: 3 distinct tracks (`lead` plucky synth, `alto` warm chords, `bass` mono synth) running on a polyphonic/monophonic synthesized backend.
   - **Catchy Demo Soundtrack**: Includes a pre-bundled 16-second Animusic-style melody containing chord progressions, arpeggios, and baseline counterpoints.
   - **Midi Parser**: Supports dragging and dropping (or selecting) any `.mid` file. The notes are dynamically parsed via `@tonejs/midi`, categorized into the three frequency registers, and a new customized spiral 3D instrument layout is created in real-time.

5. **Aesthetics & UI**:
   - Implements the custom **'RedSands'** theme featuring a deep reddish-brown void background (`#3B1E1E` / `#1A0D0D`) and high-contrast bright white text (`#FFFFFF`) on glassmorphic panels.
   - Diagnostic HUD showing playback time, transport BPM, and the note currently being triggered.
   - Camera modes: **Auto Orbiting** (smooth rotation around spiral), **Free Orbit Controls** (manual rotation/zoom), and **Follow Ball Focus** (targets active kinematic trajectories).

---

## Technical Stack

- **Core**: Vanilla JavaScript
- **Bundler**: Vite
- **3D Engine**: Three.js
- **Audio Engine**: Tone.js
- **MIDI Parsing**: `@tonejs/midi`

---

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the address displayed in the terminal (usually `http://localhost:5173/`).
