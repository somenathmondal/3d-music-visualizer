import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { demoSong, shapeOfYouSong, hedwigSong, initAudio, playSynthNote, setTrackMute } from './audio.js';

// --- ENGINE STATE ---
let scene, camera, renderer, composer, controls;
let activeSong = demoSong;
let isEnginePlaying = false;
let audioInitialized = false;

// Physics and Timeline Settings
const SLIDE_DURATION = 1.0;      // Time spent sliding down the rail (seconds)
const FLIGHT_DURATION = 1.2;     // Time spent flying through the air (seconds)
const TOTAL_DURATION = SLIDE_DURATION + FLIGHT_DURATION; // Total time from spawn to impact
const H_SPAWN = 8.5;             // Height offset for rail nozzle endpoint above pad center of mass

// Dynamic Settings (controlled via UI)
let gravityVal = 12.0;            // Gravity acceleration (units/s^2)
let activeFilter = 'all';
let bloomEnabled = true;
let trailsEnabled = true;
let railsVisible = true;
let ballSizeMultiplier = 1.0;
let cameraMode = 'auto';         // 'auto', 'orbit', 'follow'
let cameraAngle = 0;             // used for auto-orbiting

// Registry and Pools
const padRegistry = new Map();   // Key: "noteName", Value: { mesh, outerMesh, position, track, flashProgress, innerMaterial, outerMaterial }
let activeBalls = [];            // Array of: { mesh, trailMesh, trailGeometry, trailPositions, note, track, tSpawn, tImpact, startPos, endPos, isBouncing, bounceProgress, velocity, railCurve }
let ripples = [];                // Array of: { mesh, age, maxAge }
let overheadLaunchers = {};      // Key: track, Value: Vector3 position
const trackRailCurves = {};      // Key: track, Value: CatmullRomCurve3

// Timing synchronization
let lastTime = 0;
let clock = new THREE.Clock();

// --- NOTE TO MIDI UTILITY ---
function noteToMidi(note) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const key = match[1];
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + notes.indexOf(key);
}

// --- INITIALIZE THREE.JS SCENE ---
function initThree() {
  const container = document.getElementById('canvas-container');
  
  // Scene
  scene = new THREE.Scene();
  // Deep space-like void background
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.02);

  // Camera
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 19);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Orbit Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 45;
  controls.target.set(0, 3, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x1a1212, 0.4); 
  scene.add(ambientLight);

  const centerLight = new THREE.PointLight(0xffffff, 2.0, 30); // Center highlighting light
  centerLight.position.set(0, 6, 0);
  scene.add(centerLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6); // Reflected highlights on rails
  dirLight.position.set(-15, 25, 10);
  scene.add(dirLight);

  // Grid floor (faint wireframe)
  const gridHelper = new THREE.GridHelper(50, 50, 0x221111, 0x110505);
  gridHelper.position.y = -0.1;
  scene.add(gridHelper);

  // Post-Processing (Bloom Pass Filter)
  const renderPass = new RenderPass(scene, camera);
  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,  // strength
    0.45, // radius
    0.15  // threshold
  );
  composer.addPass(bloomPass);

  // Resize listener
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// --- PROCEDURAL DRUM PADS AND MECHANICAL RAILS LAYOUT ---
function buildVisualLayout(song) {
  // Clear existing items in registry
  padRegistry.forEach(pad => {
    scene.remove(pad.mesh);
    pad.mesh.geometry.dispose();
    pad.innerMaterial.dispose();
    pad.outerMaterial.dispose();
    if (pad.outerMesh) {
      scene.remove(pad.outerMesh);
      pad.outerMesh.geometry.dispose();
    }
  });
  padRegistry.clear();

  // Remove existing rails and launcher nodes
  const launchersToRemove = [];
  scene.traverse(child => {
    if (child.name && (child.name.startsWith('launcher-') || child.name.startsWith('rail-'))) {
      launchersToRemove.push(child);
    }
  });
  launchersToRemove.forEach(child => {
    scene.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
    if (child.children) {
      child.children.forEach(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
  });

  // Extract unique notes
  const uniqueNotes = new Set();
  const noteTracks = new Map();
  
  for (const trackName in song.tracks) {
    song.tracks[trackName].notes.forEach(n => {
      uniqueNotes.add(n.note);
      noteTracks.set(n.note, trackName);
    });
  }

  // Sort notes by pitch
  const sortedNotes = Array.from(uniqueNotes).sort((a, b) => noteToMidi(a) - noteToMidi(b));
  const totalNotes = sortedNotes.length;

  // Step-spiral layout
  sortedNotes.forEach((noteName, i) => {
    const track = noteTracks.get(noteName);
    const colorHex = song.tracks[track].color;

    const theta = i * 0.38; 
    const radius = 2.5 + i * (13.0 / totalNotes); 
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    const y = i * (4.2 / totalNotes); 

    const position = new THREE.Vector3(x, y, z);

    // Create pad meshes (flat cylinder)
    const padRadius = 0.45;
    const padHeight = 0.12;
    
    // Outer metallic structural ring
    const outerGeo = new THREE.CylinderGeometry(padRadius + 0.06, padRadius + 0.06, padHeight, 24);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x3d2b2b, 
      roughness: 0.2,
      metalness: 0.9
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.position.copy(position);
    scene.add(outerMesh);

    // Inner glowing face
    const innerGeo = new THREE.CylinderGeometry(padRadius, padRadius, padHeight + 0.02, 24);
    const innerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.8,
      roughness: 0.4
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.copy(position);
    scene.add(innerMesh);

    // Register pad
    padRegistry.set(noteName, {
      mesh: innerMesh,
      outerMesh: outerMesh,
      position: position.clone(),
      track: track,
      flashProgress: 0,
      innerMaterial: innerMat,
      outerMaterial: outerMat
    });
  });

  // Calculate overhead rails and launcher nodes
  for (const trackName in song.tracks) {
    const trackPads = [];
    padRegistry.forEach((pad, note) => {
      if (pad.track === trackName) {
        trackPads.push(pad.position);
      }
    });

    if (trackPads.length === 0) continue;

    // Center of mass
    const center = new THREE.Vector3();
    trackPads.forEach(p => center.add(p));
    center.divideScalar(trackPads.length);

    // Launcher end nozzle position (above track center of mass)
    const launcherPos = new THREE.Vector3(center.x, center.y + H_SPAWN, center.z);
    overheadLaunchers[trackName] = launcherPos;

    // Nozzle Group
    const nozzleGroup = new THREE.Group();
    nozzleGroup.name = `launcher-${trackName}`;
    nozzleGroup.position.copy(launcherPos);

    // Core cylinder nozzle pointing downwards
    const nozzleGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.8, 16);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x261919,
      metalness: 0.9,
      roughness: 0.15
    });
    const nozzleMesh = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzleGroup.add(nozzleMesh);

    // Neon emissive ring
    const glowRingGeo = new THREE.TorusGeometry(0.24, 0.05, 8, 20);
    glowRingGeo.rotateX(Math.PI / 2);
    glowRingGeo.translate(0, -0.4, 0);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(song.tracks[trackName].color),
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    nozzleGroup.add(glowRing);
    nozzleGroup.visible = railsVisible;
    scene.add(nozzleGroup);

    // --- PROCEDURAL 3D DOUBLE-PIPE SLIDE RAILS ---
    // Make rails wind in from high and far out to nozzle end
    const pEndRail = launcherPos.clone();
    const pMidRail = new THREE.Vector3(launcherPos.x - 3.5, launcherPos.y + 3.0, launcherPos.z - 4.5);
    const pStartRail = new THREE.Vector3(launcherPos.x - 7.5, launcherPos.y + 6.5, launcherPos.z - 9.0);

    const railCurve = new THREE.CatmullRomCurve3([pStartRail, pMidRail, pEndRail]);
    trackRailCurves[trackName] = railCurve;

    // Sample curve points to build parallel pipe geometry
    const curveSamples = railCurve.getPoints(32);
    const leftPipePoints = [];
    const rightPipePoints = [];

    for (let j = 0; j < curveSamples.length; j++) {
      const p = curveSamples[j];
      const t = railCurve.getTangentAt(j / (curveSamples.length - 1)).normalize();
      
      // Horizontal normal vector
      const up = new THREE.Vector3(0, 1, 0);
      const norm = new THREE.Vector3().crossVectors(t, up).normalize();

      // Offset left & right
      const leftPt = p.clone().addScaledVector(norm, 0.14);
      const rightPt = p.clone().addScaledVector(norm, -0.14);

      leftPipePoints.push(leftPt);
      rightPipePoints.push(rightPt);
    }

    const leftSpline = new THREE.CatmullRomCurve3(leftPipePoints);
    const rightSpline = new THREE.CatmullRomCurve3(rightPipePoints);

    // Draw pipes (Tubes)
    const leftTubeGeo = new THREE.TubeGeometry(leftSpline, 32, 0.035, 6, false);
    const rightTubeGeo = new THREE.TubeGeometry(rightSpline, 32, 0.035, 6, false);

    const railMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(song.tracks[trackName].color),
      roughness: 0.15,
      metalness: 0.85,
      emissive: new THREE.Color(song.tracks[trackName].color),
      emissiveIntensity: 0.25
    });

    const leftRail = new THREE.Mesh(leftTubeGeo, railMat);
    leftRail.name = `rail-${trackName}-left`;
    leftRail.visible = railsVisible;
    scene.add(leftRail);

    const rightRail = new THREE.Mesh(rightTubeGeo, railMat);
    rightRail.name = `rail-${trackName}-right`;
    rightRail.visible = railsVisible;
    scene.add(rightRail);

    // Cross-ties connecting pipes
    const tiesGroup = new THREE.Group();
    tiesGroup.name = `rail-${trackName}-ties`;
    
    const tieGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.28, 8);
    tieGeo.rotateZ(Math.PI / 2);
    const tieMat = new THREE.MeshStandardMaterial({
      color: 0x3d2b2b,
      metalness: 0.8,
      roughness: 0.3
    });

    for (let k = 0; k < leftPipePoints.length; k += 2) {
      const lp = leftPipePoints[k];
      const rp = rightPipePoints[k];

      const tie = new THREE.Mesh(tieGeo, tieMat);
      tie.position.addVectors(lp, rp).multiplyScalar(0.5);
      tie.lookAt(rp);
      tie.rotateY(Math.PI / 2); // align cylinders sideways
      tiesGroup.add(tie);
    }
    tiesGroup.visible = railsVisible;
    scene.add(tiesGroup);
  }
}

// --- AUDIO TIMELINE SYNCHRONIZATION ---
function loadSongTimeline(song) {
  Tone.Transport.stop();
  Tone.Transport.cancel();

  // Reset note spawn states
  for (const trackName in song.tracks) {
    song.tracks[trackName].notes.forEach(note => {
      note.spawned = false;
    });
  }

  // Set BPM
  Tone.Transport.bpm.value = song.bpm;

  // Schedule notes
  let maxTime = 0;

  for (const trackName in song.tracks) {
    song.tracks[trackName].notes.forEach(note => {
      if (note.time > maxTime) maxTime = note.time;

      Tone.Transport.schedule((time) => {
        playSynthNote(trackName, note.note, note.duration, time);
        Tone.Draw.schedule(() => {
          triggerPadFlash(note.note, trackName);
        }, time);
      }, note.time);
    });
  }

  Tone.Transport.loop = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = maxTime + 2.5; // Pad for final note trail
}

// --- VISUAL EFFECT: FLASHER AND RIPPLES ---
function triggerPadFlash(noteName, trackName) {
  const pad = padRegistry.get(noteName);
  if (pad) {
    pad.flashProgress = 1.0;
    
    // Update diagnostic playing note
    const diagNote = document.getElementById('diag-note');
    diagNote.innerText = noteName;
    diagNote.style.color = activeSong.tracks[trackName].color;

    // Ripple
    createRipple(pad.position, activeSong.tracks[trackName].color);
  }
}

function createRipple(position, colorHex) {
  const ringGeo = new THREE.RingGeometry(0.35, 0.42, 32);
  ringGeo.rotateX(-Math.PI / 2);
  
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });

  const rippleMesh = new THREE.Mesh(ringGeo, ringMat);
  rippleMesh.position.copy(position);
  rippleMesh.position.y += 0.08; 
  
  scene.add(rippleMesh);

  ripples.push({
    mesh: rippleMesh,
    age: 0,
    maxAge: 0.35
  });
}

function updateRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    const progress = r.age / r.maxAge;

    if (progress >= 1.0) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      ripples.splice(i, 1);
    } else {
      const scale = 1.0 + progress * 3.5;
      r.mesh.scale.set(scale, scale, 1);
      r.mesh.material.opacity = 0.8 * (1.0 - progress);
    }
  }
}

// --- KINEMATIC & PHYSICAL BALL SYSTEM ---
function spawnBall(note, track) {
  const pad = padRegistry.get(note.note);
  if (!pad) return;

  const colorHex = activeSong.tracks[track].color;

  // Ball Mesh
  const ballRadius = 0.16 * ballSizeMultiplier;
  const ballGeo = new THREE.SphereGeometry(ballRadius, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    emissive: new THREE.Color(colorHex),
    emissiveIntensity: 1.8,
    roughness: 0.15,
    metalness: 0.2
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);

  const startPos = overheadLaunchers[track].clone();
  ballMesh.position.copy(trackRailCurves[track].getPointAt(0)); // Start at top of rail
  scene.add(ballMesh);

  // Trail System
  let trailMesh = null;
  let trailGeometry = null;
  if (trailsEnabled) {
    trailGeometry = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0.65,
      linewidth: 2
    });
    
    const positions = new Float32Array(30); // 10 points
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    trailMesh = new THREE.Line(trailGeometry, trailMat);
    scene.add(trailMesh);
  }

  // Queue active ball
  activeBalls.push({
    mesh: ballMesh,
    trailMesh: trailMesh,
    trailGeometry: trailGeometry,
    trailPositions: [],
    note: note,
    track: track,
    tSpawn: note.time - TOTAL_DURATION,
    tImpact: note.time,
    startPos: startPos,
    endPos: pad.position.clone(),
    isBouncing: false,
    bounceProgress: 0,
    velocity: new THREE.Vector3(), // Calculated at transition
    railCurve: trackRailCurves[track]
  });
}

function updateActiveBalls(currentTime, dt) {
  for (let i = activeBalls.length - 1; i >= 0; i--) {
    const ball = activeBalls[i];
    
    const isFilteredOut = activeFilter !== 'all' && ball.track !== activeFilter;
    ball.mesh.visible = !isFilteredOut;
    if (ball.trailMesh) ball.trailMesh.visible = !isFilteredOut && trailsEnabled;

    const tau = currentTime - ball.tSpawn; // Total elapsed time

    if (ball.isBouncing) {
      // Bounce Phase (Numerical physics integration)
      ball.bounceProgress += dt;
      
      // Accelerate under gravity
      ball.velocity.y -= gravityVal * dt;
      ball.mesh.position.addScaledVector(ball.velocity, dt);

      // Bounce-out limits (shrink and fade, then remove)
      if (ball.mesh.position.y < -3.0 || ball.bounceProgress > 2.0) {
        scene.remove(ball.mesh);
        ball.mesh.geometry.dispose();
        ball.mesh.material.dispose();
        
        if (ball.trailMesh) {
          scene.remove(ball.trailMesh);
          ball.trailGeometry.dispose();
          ball.trailMesh.material.dispose();
        }
        
        activeBalls.splice(i, 1);
        continue;
      }

      // Shrink ball as it drops into void
      const t = ball.bounceProgress;
      if (t > 0.8) {
        const shrink = Math.max(0, 1.0 - (t - 0.8) / 1.2);
        ball.mesh.scale.set(shrink, shrink, shrink);
        ball.mesh.material.emissiveIntensity = 1.8 * shrink;
      }

      if (trailsEnabled && ball.trailMesh) {
        updateTrailPositions(ball, ball.mesh.position.clone());
      }

    } else {
      // Pre-impact phases
      if (tau < 0) continue; // Not spawned yet

      if (tau >= TOTAL_DURATION) {
        // --- NOTE IMPACT TRIGGERS ---
        ball.isBouncing = true;
        ball.bounceProgress = 0;
        
        // Exact snapping on strike frame
        ball.mesh.position.copy(ball.endPos);

        // Calculate pre-impact horizontal velocity
        const vx = (ball.endPos.x - ball.startPos.x) / FLIGHT_DURATION;
        const vz = (ball.endPos.z - ball.startPos.z) / FLIGHT_DURATION;

        // Calculate pre-impact vertical velocity (v_y = v0_y - g*t)
        // v0_y = (endPos.y - startPos.y)/D + 0.5*g*D
        const v0_y = (ball.endPos.y - ball.startPos.y) / FLIGHT_DURATION + 0.5 * gravityVal * FLIGHT_DURATION;
        const vy_impact = v0_y - gravityVal * FLIGHT_DURATION;

        // Bouncing restitution and friction physics
        const restitution = 0.55; 
        const friction = 0.7;

        ball.velocity.set(
          vx * friction + (Math.random() - 0.5) * 0.4,
          -vy_impact * restitution, 
          vz * friction + (Math.random() - 0.5) * 0.4
        );
        continue;
      }

      if (tau < SLIDE_DURATION) {
        // --- PHASE 1: RAIL SLIDE ---
        const u = tau / SLIDE_DURATION;
        const posOnRail = ball.railCurve.getPointAt(u);
        ball.mesh.position.copy(posOnRail);

      } else {
        // --- PHASE 2: PARABOLIC FLIGHT ---
        const tFlight = tau - SLIDE_DURATION; // Time in flight
        const ratio = tFlight / FLIGHT_DURATION;

        // Horizontal linear interpolation
        const x = THREE.MathUtils.lerp(ball.startPos.x, ball.endPos.x, ratio);
        const z = THREE.MathUtils.lerp(ball.startPos.z, ball.endPos.z, ratio);

        // Vertical Parabolic motion
        const v0_y = (ball.endPos.y - ball.startPos.y) / FLIGHT_DURATION + 0.5 * gravityVal * FLIGHT_DURATION;
        const y = ball.startPos.y + v0_y * tFlight - 0.5 * gravityVal * tFlight * tFlight;

        ball.mesh.position.set(x, y, z);
      }

      if (trailsEnabled && ball.trailMesh) {
        updateTrailPositions(ball, ball.mesh.position.clone());
      }
    }
  }
}

function updateTrailPositions(ball, newPos) {
  ball.trailPositions.unshift(newPos);
  if (ball.trailPositions.length > 10) {
    ball.trailPositions.pop();
  }

  const positions = ball.trailGeometry.attributes.position.array;
  
  for (let i = 0; i < 10; i++) {
    const point = ball.trailPositions[i] || ball.trailPositions[ball.trailPositions.length - 1] || newPos;
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }

  ball.trailGeometry.attributes.position.needsUpdate = true;
}

function updatePadsDecay() {
  padRegistry.forEach(pad => {
    const isFilteredOut = activeFilter !== 'all' && pad.track !== activeFilter;
    pad.mesh.visible = !isFilteredOut;
    pad.outerMesh.visible = !isFilteredOut;

    if (pad.flashProgress > 0) {
      pad.flashProgress -= 0.05; 
      if (pad.flashProgress < 0) pad.flashProgress = 0;

      // Emissive decay
      const intensity = 0.8 + pad.flashProgress * 7.5; 
      pad.innerMaterial.emissiveIntensity = intensity;

      // Size pulse
      const scaleVal = 1.0 + pad.flashProgress * 0.12;
      pad.mesh.scale.set(scaleVal, scaleVal, scaleVal);
      pad.outerMesh.scale.set(scaleVal, scaleVal, scaleVal);
    }
  });
}

function resetNoteSpawnStates() {
  for (const trackName in activeSong.tracks) {
    activeSong.tracks[trackName].notes.forEach(note => {
      note.spawned = false;
    });
  }
}

// --- LOOK-AHEAD SCHEDULER TICK LOOP ---
function schedulerTick() {
  if (!isEnginePlaying) return;

  const currentTime = Tone.Transport.seconds;

  // Sync timeline loop resets
  if (currentTime < lastTime) {
    resetNoteSpawnStates();
  }
  lastTime = currentTime;

  // Update diagnostic text on HUD (t=16.6 format)
  document.getElementById('diag-time').innerText = `t=${currentTime.toFixed(1)}`;

  // Look-Ahead Schedule
  for (const trackName in activeSong.tracks) {
    if (activeFilter !== 'all' && trackName !== activeFilter) continue;

    activeSong.tracks[trackName].notes.forEach(note => {
      if (!note.spawned && currentTime >= (note.time - TOTAL_DURATION)) {
        spawnBall(note, trackName);
        note.spawned = true;
      }
    });
  }
}

// --- CORE RENDER LOOP ---
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  schedulerTick();

  // Physics updates
  updateActiveBalls(Tone.Transport.seconds, dt);
  updateRipples(dt);
  updatePadsDecay();

  // Camera views
  if (cameraMode === 'auto') {
    cameraAngle += 0.0018;
    camera.position.x = Math.cos(cameraAngle) * 19;
    camera.position.z = Math.sin(cameraAngle) * 19;
    camera.position.y = 8 + Math.sin(cameraAngle * 0.4) * 3.0;
    camera.lookAt(0, 3, 0);
  } else if (cameraMode === 'follow' && activeBalls.length > 0) {
    const targetBall = activeBalls[activeBalls.length - 1];
    const targetPos = new THREE.Vector3();
    targetBall.mesh.getWorldPosition(targetPos);
    
    controls.target.lerp(targetPos, 0.06);
    camera.lookAt(controls.target);
  }

  controls.update();

  if (bloomEnabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

// --- AUDIO PLAYBACK CONTROL ---
function playVisualizer() {
  if (!audioInitialized) {
    Tone.start();
    initAudio();
    audioInitialized = true;
  }
  
  Tone.Transport.start();
  isEnginePlaying = true;
  document.getElementById('diag-audio-status').innerText = "audio: running";
  document.getElementById('play-pause-btn').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clip-rule="evenodd" />
    </svg>
  `;
}

function pauseVisualizer() {
  Tone.Transport.pause();
  isEnginePlaying = false;
  document.getElementById('diag-audio-status').innerText = "audio: paused";
  document.getElementById('play-pause-btn').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path fill-rule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd" />
    </svg>
  `;
}

function resetVisualizer() {
  Tone.Transport.stop();
  resetNoteSpawnStates();
  lastTime = 0;
  
  // Clear active elements
  activeBalls.forEach(b => {
    scene.remove(b.mesh);
    b.mesh.geometry.dispose();
    b.mesh.material.dispose();
    if (b.trailMesh) {
      scene.remove(b.trailMesh);
      b.trailGeometry.dispose();
      b.trailMesh.material.dispose();
    }
  });
  activeBalls = [];

  ripples.forEach(r => {
    scene.remove(r.mesh);
    r.mesh.geometry.dispose();
    r.mesh.material.dispose();
  });
  ripples = [];

  document.getElementById('diag-time').innerText = "t=0.0";
  document.getElementById('diag-note').innerText = "--";

  if (isEnginePlaying) {
    Tone.Transport.start();
  }
}

// --- INTERACTIVE EVENT LISTENERS & SETUP ---
function setupUIListeners() {
  // Start overlay click
  const startBtn = document.getElementById('start-btn');
  const startOverlay = document.getElementById('start-overlay');
  const hudContainer = document.getElementById('hud-container');

  startBtn.addEventListener('click', () => {
    startOverlay.classList.add('overlay-hidden');
    hudContainer.classList.remove('hud-hidden');
    playVisualizer();
  });

  // Play / Pause Button
  const playPauseBtn = document.getElementById('play-pause-btn');
  playPauseBtn.addEventListener('click', () => {
    if (isEnginePlaying) pauseVisualizer();
    else playVisualizer();
  });

  // Reset Button
  document.getElementById('reset-btn').addEventListener('click', resetVisualizer);

  // Settings Slide Panel Toggles
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsCloseBtn = document.getElementById('settings-close-btn');

  settingsToggleBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
  });

  settingsCloseBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
  });

  // Filter pill menu
  const pills = ['all', 'lead', 'alto', 'bass'];
  pills.forEach(p => {
    const btn = document.getElementById(p === 'all' ? 'filter-all' : `filter-${p}`);
    btn.addEventListener('click', () => {
      pills.forEach(x => {
        const otherBtn = document.getElementById(x === 'all' ? 'filter-all' : `filter-${x}`);
        otherBtn.classList.remove('active');
      });
      btn.classList.add('active');
      
      activeFilter = p;

      // Mute audio
      if (p === 'all') {
        setTrackMute('lead', false);
        setTrackMute('alto', false);
        setTrackMute('bass', false);
      } else {
        setTrackMute('lead', p !== 'lead');
        setTrackMute('alto', p !== 'alto');
        setTrackMute('bass', p !== 'bass');
      }
    });
  });

  // Camera Mode Select
  const cameraSelect = document.getElementById('camera-select');
  cameraSelect.addEventListener('change', (e) => {
    cameraMode = e.target.value;
    if (cameraMode === 'orbit') {
      controls.enabled = true;
    } else {
      controls.enabled = false;
    }
  });

  // Bloom checkbox
  document.getElementById('toggle-bloom').addEventListener('change', (e) => {
    bloomEnabled = e.target.checked;
  });

  // Trails checkbox
  document.getElementById('toggle-trails').addEventListener('change', (e) => {
    trailsEnabled = e.target.checked;
    if (!trailsEnabled) {
      activeBalls.forEach(b => {
        if (b.trailMesh) {
          scene.remove(b.trailMesh);
          b.trailGeometry.dispose();
          b.trailMesh.material.dispose();
          b.trailMesh = null;
        }
      });
    }
  });

  // Show rails checkbox
  document.getElementById('toggle-rails-vis').addEventListener('change', (e) => {
    railsVisible = e.target.checked;
    scene.traverse(child => {
      if (child.name && (child.name.startsWith('rail-') || child.name.startsWith('launcher-'))) {
        child.visible = railsVisible;
      }
    });
  });

  // Ball size slider
  document.getElementById('slider-ball-size').addEventListener('input', (e) => {
    ballSizeMultiplier = parseFloat(e.target.value);
  });

  // Gravity slider
  document.getElementById('slider-gravity').addEventListener('input', (e) => {
    gravityVal = parseFloat(e.target.value);
  });

  // Load Demo Song button
  document.getElementById('load-demo-btn').addEventListener('click', () => {
    activeSong = demoSong;
    buildVisualLayout(demoSong);
    loadSongTimeline(demoSong);
    resetVisualizer();
  });

  // Load Shape of You button
  document.getElementById('load-shape-of-you-btn').addEventListener('click', () => {
    activeSong = shapeOfYouSong;
    buildVisualLayout(shapeOfYouSong);
    loadSongTimeline(shapeOfYouSong);
    resetVisualizer();
  });

  // Load Hedwig Theme button
  document.getElementById('load-hedwig-theme-btn').addEventListener('click', () => {
    activeSong = hedwigSong;
    buildVisualLayout(hedwigSong);
    loadSongTimeline(hedwigSong);
    resetVisualizer();
  });

  // Custom MIDI Upload
  const setupMidiLoader = (fileInputId) => {
    const fileInput = document.getElementById(fileInputId);
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleMidiFile(file);
    });
  };

  setupMidiLoader('midi-file-input');
  setupMidiLoader('midi-file-input-hud');

  document.getElementById('midi-select-btn').addEventListener('click', () => {
    document.getElementById('midi-file-input').click();
  });

  // Drag & drop
  const dropZone = document.querySelector('.midi-upload-box');
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.mid') || file.name.endsWith('.midi'))) {
      handleMidiFile(file);
    }
  });
}

// --- MIDI PARSING AND SONG INGESTION ---
async function handleMidiFile(file) {
  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target.result;
      const midi = new Midi(arrayBuffer);

      const customSong = {
        bpm: Math.round(midi.header.tempos[0]?.bpm || 120),
        tracks: {
          lead: { color: '#00ffff', notes: [] },
          alto: { color: '#ff00ff', notes: [] },
          bass: { color: '#ffff00', notes: [] }
        }
      };

      const seenNotes = new Set();
      
      midi.tracks.forEach(track => {
        track.notes.forEach(note => {
          const time = Math.round(note.time * 100) / 100;
          const key = `${note.midi}_${time}`;
          if (seenNotes.has(key)) return;
          seenNotes.add(key);

          const noteData = {
            note: note.name,
            time: note.time,
            duration: note.duration
          };

          if (note.midi < 53) {
            customSong.tracks.bass.notes.push(noteData);
          } else if (note.midi < 72) {
            customSong.tracks.alto.notes.push(noteData);
          } else {
            customSong.tracks.lead.notes.push(noteData);
          }
        });
      });

      customSong.tracks.bass.notes.sort((a, b) => a.time - b.time);
      customSong.tracks.alto.notes.sort((a, b) => a.time - b.time);
      customSong.tracks.lead.notes.sort((a, b) => a.time - b.time);

      activeSong = customSong;
      buildVisualLayout(activeSong);
      loadSongTimeline(activeSong);
      resetVisualizer();

      const startOverlay = document.getElementById('start-overlay');
      if (!startOverlay.classList.contains('overlay-hidden')) {
        startOverlay.classList.add('overlay-hidden');
        document.getElementById('hud-container').classList.remove('hud-hidden');
        playVisualizer();
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    console.error("MIDI parsing failure: ", err);
    alert("Could not parse this MIDI file. Please try another standard format.");
  }
}

// --- RUN BOILERPLATE SETUP ---
function main() {
  initThree();
  buildVisualLayout(activeSong);
  loadSongTimeline(activeSong);
  setupUIListeners();
  animate();
}

main();
