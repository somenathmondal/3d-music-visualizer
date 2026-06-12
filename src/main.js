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
let scene, camera, renderer, composer, controls, bloomPass;
let lightAmbient, lightHemi, lightCenter, lightFill, lightDir, lightRim;
let activeSong = hedwigSong;
let isEnginePlaying = false;
let audioInitialized = false;

// Physics and Timeline Settings
const SLIDE_DURATION = 1.0;      // Time spent sliding down the rail (seconds)
const FLIGHT_DURATION = 1.2;     // Time spent flying from nozzle to Pad 1 (seconds)
const TOTAL_DURATION = SLIDE_DURATION + FLIGHT_DURATION;
const PATH_SPACING = 1.6;        // Equal spacing between consecutive pads in a phrase path

// Dynamic Settings (controlled via UI)
let gravityVal = 12.0;            // Gravity acceleration (units/s^2)
let activeFilter = 'all';
let bloomEnabled = true;
let trailsEnabled = true;
let railsVisible = true;
let ballSizeMultiplier = 1.0;
let cameraMode = 'auto';         // 'auto' = free orbit + autoRotate, 'orbit' = manual only, 'follow' = ball track
let cameraAngle = 0;             // used for auto-orbiting

// Registry and Pools
const padRegistry = new Map();   // Key: "phraseId_noteIndex", Value: { mesh, outerMesh, position, flashProgress, innerMaterial, outerMaterial, noteName }
let activeBalls = [];            // Array of active ball objects
let ripples = [];                // Array of: { mesh, age, maxAge }
const trackRailCurves = {};      // Key: phraseId, Value: CatmullRomCurve3
const overheadLaunchers = {};      // Key: phraseId, Value: Vector3 position

// Phrase Scheduler State
let activeSongPhrases = [];      // Grouped note arrays scheduled to run

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
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.02);

  // Camera
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 11, 20);

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
  controls.maxDistance = 55;
  controls.target.set(0, 3, 0);
  controls.autoRotate = true;        // Default: gentle auto-rotate
  controls.autoRotateSpeed = 0.6;   // Slow, cinematic drift
  controls.enabled = true;          // Always allow manual grab

  // Lighting — Rich multi-source rig for full scene visibility
  lightAmbient = new THREE.AmbientLight(0x332222, 1.2); 
  scene.add(lightAmbient);

  // Hemisphere light: warm sky + cool ground fill
  lightHemi = new THREE.HemisphereLight(0xffeedd, 0x331a1a, 0.8);
  scene.add(lightHemi);

  // Center point light — illuminates hub and nearby pads
  lightCenter = new THREE.PointLight(0xffffff, 3.0, 50); 
  lightCenter.position.set(0, 8, 0);
  scene.add(lightCenter);

  // Fill point light from below — catches undersides of pads/rails
  lightFill = new THREE.PointLight(0xff9966, 1.0, 40);
  lightFill.position.set(0, -1, 0);
  scene.add(lightFill);

  // Key directional light — strong top-down angled illumination
  lightDir = new THREE.DirectionalLight(0xffffff, 1.2); 
  lightDir.position.set(-15, 25, 10);
  scene.add(lightDir);

  // Rim directional from opposite side for depth
  lightRim = new THREE.DirectionalLight(0xffccaa, 0.5);
  lightRim.position.set(12, 15, -8);
  scene.add(lightRim);

  // Grid floor
  const gridHelper = new THREE.GridHelper(60, 60, 0x221111, 0x110505);
  gridHelper.position.y = -0.1;
  scene.add(gridHelper);

  // Central Hub Column (Visual origin for all rails)
  const hubGeo = new THREE.CylinderGeometry(0.5, 0.7, 12, 16);
  hubGeo.translate(0, 6, 0);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x5a3030,      // Visible dark red-brown (not black)
    metalness: 0.75,
    roughness: 0.35,
    emissive: 0x2a1010,   // Subtle self-illumination so bloom doesn't swallow it
    emissiveIntensity: 0.4
  });
  const hubMesh = new THREE.Mesh(hubGeo, hubMat);
  hubMesh.name = "rail-center-hub";
  scene.add(hubMesh);

  // Glowing accent ring at hub top
  const hubRingGeo = new THREE.TorusGeometry(0.6, 0.06, 8, 32);
  const hubRingMat = new THREE.MeshStandardMaterial({
    color: 0xff4422,
    emissive: 0xff2200,
    emissiveIntensity: 2.0,
    roughness: 0.2,
    metalness: 0.5
  });
  const hubRingMesh = new THREE.Mesh(hubRingGeo, hubRingMat);
  hubRingMesh.position.set(0, 12, 0);
  hubRingMesh.rotation.x = Math.PI / 2;
  scene.add(hubRingMesh);

  // Mid-hub band for visual interest
  const hubBandGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 32);
  const hubBandMat = new THREE.MeshStandardMaterial({
    color: 0xcc3311,
    emissive: 0xaa2200,
    emissiveIntensity: 1.2,
    roughness: 0.3
  });
  const hubBandMesh = new THREE.Mesh(hubBandGeo, hubBandMat);
  hubBandMesh.position.set(0, 6, 0);
  hubBandMesh.rotation.x = Math.PI / 2;
  scene.add(hubBandMesh);

  // Post-Processing (Bloom Pass Filter)
  const renderPass = new RenderPass(scene, camera);
  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.7,  // strength (halved from 1.4)
    0.45, // radius
    0.15  // threshold
  );
  composer.addPass(bloomPass);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// --- MELODY PHRASE GROUPING LOGIC ---
function groupNotesIntoPhrases(notes, trackName) {
  if (notes.length === 0) return [];
  
  const phrases = [];
  let currentPhrase = [];
  
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    
    if (currentPhrase.length === 0) {
      currentPhrase.push(note);
    } else {
      const lastNote = currentPhrase[currentPhrase.length - 1];
      const gap = note.time - lastNote.time;
      
      // Group consecutive note steps. Chord notes (gap = 0.0) form separate phrases.
      if (gap > 0.1 && gap <= 2.2 && currentPhrase.length < 5) {
        currentPhrase.push(note);
      } else {
        phrases.push({ track: trackName, notes: currentPhrase, spawned: false });
        currentPhrase = [note];
      }
    }
  }
  
  if (currentPhrase.length > 0) {
    phrases.push({ track: trackName, notes: currentPhrase, spawned: false });
  }
  
  return phrases;
}

// --- PROCEDURAL DYNAMIC MELODY-PATH LAYOUT ---
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

  // Remove existing rails, nozzles, and hub meshes
  const launchersToRemove = [];
  scene.traverse(child => {
    if (child.name && (child.name.startsWith('launcher-') || child.name.startsWith('rail-')) && child.name !== 'rail-center-hub') {
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

  // Re-group notes of song into phrases
  activeSongPhrases = [];
  for (const trackName in song.tracks) {
    const trackPhrases = groupNotesIntoPhrases(song.tracks[trackName].notes, trackName);
    activeSongPhrases.push(...trackPhrases);
  }

  // Find overall MIDI pitch range to map rainbow spectrum colors AND Y-height
  let minMidi = 127;
  let maxMidi = 0;
  for (const trackName in song.tracks) {
    song.tracks[trackName].notes.forEach(n => {
      const midi = noteToMidi(n.note);
      if (midi < minMidi) minMidi = midi;
      if (midi > maxMidi) maxMidi = midi;
    });
  }
  if (maxMidi === minMidi) {
    maxMidi = minMidi + 12;
    minMidi = minMidi - 12;
  }

  // Pitch-to-Y mapping: low notes near floor, high notes elevated
  // Creates multi-plane layout for natural bounce arcs
  const Y_FLOOR = 0.6;   // Lowest pad height (deepest bass)
  const Y_CEIL  = 5.5;   // Highest pad height (highest treble)
  const midiRange = maxMidi - minMidi;
  function midiToY(midi) {
    const ratio = (midi - minMidi) / midiRange;
    return Y_FLOOR + ratio * (Y_CEIL - Y_FLOOR);
  }

  // Distribute phrases into tracks
  const leadPhrases = activeSongPhrases.filter(p => p.track === 'lead');
  const altoPhrases = activeSongPhrases.filter(p => p.track === 'alto');
  const bassPhrases = activeSongPhrases.filter(p => p.track === 'bass');

  // Map each phrase to a dedicated radial spoke angle grouped by track
  const assignRadialSpokes = (phrases, startAngle, endAngle, trackName) => {
    const count = phrases.length;
    phrases.forEach((phrase, idx) => {
      phrase.phraseId = `phrase_${trackName}_${idx}`;
      
      // Calculate angular direction of the spoke path
      const angle = startAngle + (idx / Math.max(1, count)) * (endAngle - startAngle);
      phrase.angle = angle;
      
      const trackColorHex = song.tracks[trackName].color;

      // Create sequential pads along this phrase spoke
      phrase.notes.forEach((noteObj, k) => {
        const midi = noteToMidi(noteObj.note);

        // Rainbow pitch HSL mapping: Low = Red/Orange, High = Violet
        const colorRatio = (midi - minMidi) / (maxMidi - minMidi);
        const hue = colorRatio * 285; 
        const padColor = new THREE.Color().setHSL(hue / 360, 0.95, 0.5);

        // Radial coordinate mapping: distance increases outwards
        // Y is driven by MIDI pitch — high notes sit high, low notes sit low
        const radius = 3.5 + k * PATH_SPACING;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const y = midiToY(midi);

        const position = new THREE.Vector3(x, y, z);

        // Pads geometries
        const padRadius = 0.42;
        const padHeight = 0.12;

        const outerGeo = new THREE.CylinderGeometry(padRadius + 0.05, padRadius + 0.05, padHeight, 20);
        const outerMat = new THREE.MeshStandardMaterial({ color: 0x2b1b1b, metalness: 0.85, roughness: 0.25 });
        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.position.copy(position);
        scene.add(outerMesh);

        const innerGeo = new THREE.CylinderGeometry(padRadius, padRadius, padHeight + 0.02, 20);
        const innerMat = new THREE.MeshStandardMaterial({
          color: padColor,
          emissive: padColor,
          emissiveIntensity: 0.8,
          roughness: 0.35
        });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        innerMesh.position.copy(position);
        scene.add(innerMesh);

        // Register pad with unique phrase_index key
        const padKey = `${phrase.phraseId}_${k}`;
        padRegistry.set(padKey, {
          mesh: innerMesh,
          outerMesh: outerMesh,
          position: position.clone(),
          track: trackName,
          flashProgress: 0,
          innerMaterial: innerMat,
          outerMaterial: outerMat,
          noteName: noteObj.note
        });
      });

      // --- SECOND PASS: Tilt each pad using gravity-corrected impact velocity ---
      // The ball's actual velocity at impact is dominated by gravity's pull downward,
      // making the face normal point mostly UPWARD (not inward toward shaft).
      const nozzleRadius = 3.5 - 1.2;
      const nozzleY = Math.max(
        padRegistry.get(`${phrase.phraseId}_0`).position.y + 2.5,
        Y_CEIL + 1.5
      );
      const approxNozzlePos = new THREE.Vector3(
        nozzleRadius * Math.cos(angle), nozzleY, nozzleRadius * Math.sin(angle)
      );

      const upAxis = new THREE.Vector3(0, 1, 0);
      const GRAV = 12.0;
      const MAX_TILT = Math.PI * 0.14; // 25° max — drums stay mostly upright

      phrase.notes.forEach((noteObj, k) => {
        const padKey = `${phrase.phraseId}_${k}`;
        const pad = padRegistry.get(padKey);

        // Compute actual impact velocity using parabolic physics (same as ball motion)
        let vx, vyImpact, vz;
        if (k === 0) {
          const dt = Math.max(0.05, FLIGHT_DURATION);
          const d = new THREE.Vector3().subVectors(pad.position, approxNozzlePos);
          vx = d.x / dt; vz = d.z / dt;
          const v0y = d.y / dt + 0.5 * GRAV * dt;
          vyImpact = v0y - GRAV * dt; // velocity Y at moment of impact
        } else {
          const prevPad = padRegistry.get(`${phrase.phraseId}_${k - 1}`);
          const dt = Math.max(0.05, phrase.notes[k].time - phrase.notes[k - 1].time);
          const d = new THREE.Vector3().subVectors(pad.position, prevPad.position);
          vx = d.x / dt; vz = d.z / dt;
          const v0y = d.y / dt + 0.5 * GRAV * dt;
          vyImpact = v0y - GRAV * dt;
        }

        // If ball arrives going upward (rising note with short travel time),
        // keep drum flat — it's receiving from below and would face downward otherwise
        if (vyImpact >= -0.5) {
          pad.mesh.quaternion.identity();
          pad.outerMesh.quaternion.identity();
          return;
        }

        // Gravity makes vyImpact large and negative → impact velocity is steep downward
        // So faceNormal = -impactVel is steep UPWARD → drum faces up, not the shaft
        const impactVel = new THREE.Vector3(vx, vyImpact, vz).normalize();
        const faceNormal = impactVel.clone().negate();

        const angleBetween = Math.acos(Math.max(-1, Math.min(1, upAxis.dot(faceNormal))));
        const clampedAngle = Math.min(angleBetween, MAX_TILT);

        const rotAxis = new THREE.Vector3().crossVectors(upAxis, faceNormal);
        if (rotAxis.lengthSq() < 0.001) {
          pad.mesh.quaternion.identity();
          pad.outerMesh.quaternion.identity();
          return;
        }
        rotAxis.normalize();

        const tiltQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, clampedAngle);
        pad.mesh.quaternion.copy(tiltQuat);
        pad.outerMesh.quaternion.copy(tiltQuat);
      });

      // Nozzle emitter position — elevated above first pad's pitch-based Y
      const firstPadPos = padRegistry.get(`${phrase.phraseId}_0`).position;
      const nozzlePos = new THREE.Vector3(
        nozzleRadius * Math.cos(angle),
        nozzleY,
        nozzleRadius * Math.sin(angle)
      );
      overheadLaunchers[phrase.phraseId] = nozzlePos;

      // Nozzle Mesh
      const nozzleGroup = new THREE.Group();
      nozzleGroup.name = `launcher-${phrase.phraseId}`;
      nozzleGroup.position.copy(nozzlePos);

      const nozzleGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.6, 12);
      nozzleGeo.rotateX(Math.PI / 2);
      const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x211414, metalness: 0.9, roughness: 0.2 });
      const nozzleMesh = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzleGroup.add(nozzleMesh);

      const glowRingGeo = new THREE.TorusGeometry(0.2, 0.04, 8, 16);
      glowRingGeo.rotateX(Math.PI / 2);
      glowRingGeo.translate(0, -0.3, 0);
      const glowRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(trackColorHex) });
      const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
      nozzleGroup.add(glowRing);
      
      nozzleGroup.visible = railsVisible;
      scene.add(nozzleGroup);

      // --- PROCEDURAL 3D DOUBLE-PIPE SLIDE RAILS FROM CENTRAL HUB ---
      const pStartRail = new THREE.Vector3(0, 11.0, 0); // Origin at central column hub
      const pMidRail = new THREE.Vector3(
        (nozzleRadius * 0.4) * Math.cos(angle),
        nozzlePos.y + 1.8,
        (nozzleRadius * 0.4) * Math.sin(angle)
      );
      const pEndRail = nozzlePos.clone();

      const railCurve = new THREE.CatmullRomCurve3([pStartRail, pMidRail, pEndRail]);
      trackRailCurves[phrase.phraseId] = railCurve;

      // Generate parallel curves for pipes
      const curveSamples = railCurve.getPoints(24);
      const leftPipePoints = [];
      const rightPipePoints = [];

      for (let j = 0; j < curveSamples.length; j++) {
        const p = curveSamples[j];
        const t = railCurve.getTangentAt(j / (curveSamples.length - 1)).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const norm = new THREE.Vector3().crossVectors(t, up).normalize();

        const leftPt = p.clone().addScaledVector(norm, 0.12);
        const rightPt = p.clone().addScaledVector(norm, -0.12);

        leftPipePoints.push(leftPt);
        rightPipePoints.push(rightPt);
      }

      const leftSpline = new THREE.CatmullRomCurve3(leftPipePoints);
      const rightSpline = new THREE.CatmullRomCurve3(rightPipePoints);

      const leftTubeGeo = new THREE.TubeGeometry(leftSpline, 24, 0.03, 6, false);
      const rightTubeGeo = new THREE.TubeGeometry(rightSpline, 24, 0.03, 6, false);

      const railMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(trackColorHex),
        roughness: 0.15,
        metalness: 0.85,
        emissive: new THREE.Color(trackColorHex),
        emissiveIntensity: 0.2
      });

      const leftRail = new THREE.Mesh(leftTubeGeo, railMat);
      leftRail.name = `rail-${phrase.phraseId}-left`;
      leftRail.visible = railsVisible;
      scene.add(leftRail);

      const rightRail = new THREE.Mesh(rightTubeGeo, railMat);
      rightRail.name = `rail-${phrase.phraseId}-right`;
      rightRail.visible = railsVisible;
      scene.add(rightRail);

      // Spacers / cross-ties
      const tiesGroup = new THREE.Group();
      tiesGroup.name = `rail-${phrase.phraseId}-ties`;
      const tieGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8);
      tieGeo.rotateZ(Math.PI / 2);
      const tieMat = new THREE.MeshStandardMaterial({ color: 0x2b1b1b, metalness: 0.8, roughness: 0.3 });

      for (let k = 0; k < leftPipePoints.length; k += 3) {
        const lp = leftPipePoints[k];
        const rp = rightPipePoints[k];
        const tie = new THREE.Mesh(tieGeo, tieMat);
        tie.position.addVectors(lp, rp).multiplyScalar(0.5);
        tie.lookAt(rp);
        tie.rotateY(Math.PI / 2);
        tiesGroup.add(tie);
      }
      tiesGroup.visible = railsVisible;
      scene.add(tiesGroup);
    });
  };

  // Divide spokes evenly into sections: Lead (0 to 120deg), Alto (120 to 240deg), Bass (240 to 360deg)
  assignRadialSpokes(leadPhrases, 0.05, (2 * Math.PI) / 3 - 0.05, 'lead');
  assignRadialSpokes(altoPhrases, (2 * Math.PI) / 3 + 0.05, (4 * Math.PI) / 3 - 0.05, 'alto');
  assignRadialSpokes(bassPhrases, (4 * Math.PI) / 3 + 0.05, 2 * Math.PI - 0.05, 'bass');
}

// --- AUDIO TIMELINE SYNCHRONIZATION ---
function loadSongTimeline(song) {
  Tone.Transport.stop();
  Tone.Transport.cancel();

  buildVisualLayout(song);

  // Set BPM
  Tone.Transport.bpm.value = song.bpm;

  // Schedule notes by phrase blocks
  let maxTime = 0;

  activeSongPhrases.forEach(phraseObj => {
    const phraseId = phraseObj.phraseId;
    const track = phraseObj.track;

    phraseObj.notes.forEach((note, noteIdx) => {
      if (note.time > maxTime) maxTime = note.time;

      Tone.Transport.schedule((time) => {
        playSynthNote(track, note.note, note.duration, time);
        Tone.Draw.schedule(() => {
          triggerPadFlash(phraseId, noteIdx);
        }, time);
      }, note.time);
    });
  });

  Tone.Transport.loop = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = maxTime + 2.5; 
}

// --- VISUAL EFFECT: FLASHER AND RIPPLES ---
function triggerPadFlash(phraseId, noteIndex) {
  const padKey = `${phraseId}_${noteIndex}`;
  const pad = padRegistry.get(padKey);
  if (pad) {
    pad.flashProgress = 1.0;
    
    // Update diagnostic playing note
    const diagNote = document.getElementById('diag-note');
    diagNote.innerText = pad.noteName;
    diagNote.style.color = '#' + pad.innerMaterial.color.getHexString();

    createRipple(pad.position, pad.innerMaterial.color);
  }
}

function createRipple(position, color) {
  const ringGeo = new THREE.RingGeometry(0.35, 0.42, 32);
  ringGeo.rotateX(-Math.PI / 2);
  
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
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

// Update Expanding Ripples
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

// --- DYNAMIC MULTI-BOUNCE KINEMATIC & PHYSICAL BALL SYSTEM ---
function spawnBallForPhrase(phraseObj) {
  const notes = phraseObj.notes;
  if (notes.length === 0) return;

  const phraseId = phraseObj.phraseId;
  const firstNote = notes[0];
  const firstPadKey = `${phraseId}_0`;
  const firstPad = padRegistry.get(firstPadKey);
  if (!firstPad) return;

  const track = phraseObj.track;

  // Ball Mesh
  const ballRadius = 0.16 * ballSizeMultiplier;
  const ballGeo = new THREE.SphereGeometry(ballRadius, 16, 16);
  // Ball starts with glowing white base
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.8,
    roughness: 0.15,
    metalness: 0.2
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);

  const startPos = overheadLaunchers[phraseId].clone();
  ballMesh.position.copy(trackRailCurves[phraseId].getPointAt(0)); 
  scene.add(ballMesh);

  // Trail System
  let trailMesh = null;
  let trailGeometry = null;
  if (trailsEnabled) {
    trailGeometry = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      linewidth: 2
    });
    
    const positions = new Float32Array(30); 
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    trailMesh = new THREE.Line(trailGeometry, trailMat);
    scene.add(trailMesh);
  }

  // Setup Initial Segment: Launcher -> Pad 1
  const ball = {
    mesh: ballMesh,
    trailMesh: trailMesh,
    trailGeometry: trailGeometry,
    trailPositions: [],
    phrase: notes,
    phraseId: phraseId,
    track: track,
    tSpawn: firstNote.time - TOTAL_DURATION,
    currentNoteIndex: 0,
    isBouncingOut: false,
    bounceProgress: 0,
    velocity: new THREE.Vector3(),
    railCurve: trackRailCurves[phraseId],
    
    // Segment bounds — initial arc from nozzle to first pad
    segmentStartPos: startPos,
    segmentEndPos: firstPad.position.clone(),
    segmentStartTime: firstNote.time - FLIGHT_DURATION,
    segmentEndTime: firstNote.time,
    segmentDuration: FLIGHT_DURATION,
    // Compute v0y so ball arcs cleanly from nozzle to first pad
    segmentV0y: (firstPad.position.y - startPos.y) / FLIGHT_DURATION + 0.5 * 12.0 * FLIGHT_DURATION
  };

  activeBalls.push(ball);

  // Pulse the launcher nozzle
  const launcherNode = scene.getObjectByName(`launcher-${phraseId}`);
  if (launcherNode) {
    launcherNode.scale.set(1.3, 1.3, 1.3);
    setTimeout(() => {
      if (launcherNode) launcherNode.scale.set(1.0, 1.0, 1.0);
    }, 150);
  }
}

function updateActiveBalls(currentTime, dt) {
  for (let i = activeBalls.length - 1; i >= 0; i--) {
    const ball = activeBalls[i];
    
    const isFilteredOut = activeFilter !== 'all' && ball.track !== activeFilter;
    ball.mesh.visible = !isFilteredOut;
    if (ball.trailMesh) ball.trailMesh.visible = !isFilteredOut && trailsEnabled;

    const tau = currentTime - ball.tSpawn;

    if (ball.isBouncingOut) {
      // --- BOUNCE OUT PHASE (Drop off the final pad into void) ---
      ball.bounceProgress += dt;
      ball.velocity.y -= gravityVal * dt;
      ball.mesh.position.addScaledVector(ball.velocity, dt);

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

      // Shrink and fade
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
      // --- SLIDE & MELODY BOUNCING PHASES ---
      if (tau < 0) continue; // Waiting for spawn

      if (tau < SLIDE_DURATION) {
        // --- PHASE 1: RAIL SLIDE ---
        const u = tau / SLIDE_DURATION;
        const posOnRail = ball.railCurve.getPointAt(u);
        ball.mesh.position.copy(posOnRail);

        // Color shifts to match Pad 1 pitch HSL
        const firstPad = padRegistry.get(`${ball.phraseId}_0`);
        if (firstPad) {
          ball.mesh.material.color.copy(firstPad.innerMaterial.color);
          ball.mesh.material.emissive.copy(firstPad.innerMaterial.color);
          if (ball.trailMesh) ball.trailMesh.material.color.copy(firstPad.innerMaterial.color);
        }

      } else {
        // --- PHASE 2 & 3: INTER-PAD MELODY BOUNCING ---
        // Impact Check
        if (currentTime >= ball.segmentEndTime) {
          const noteObj = ball.phrase[ball.currentNoteIndex];
          const currentPadKey = `${ball.phraseId}_${ball.currentNoteIndex}`;
          
          // Sound and pad flash
          playSynthNote(ball.track, noteObj.note, noteObj.duration, Tone.now());
          triggerPadFlash(ball.phraseId, ball.currentNoteIndex);

          if (ball.currentNoteIndex === ball.phrase.length - 1) {
            // Hit final note in phrase -> Bounce off into abyss
            ball.isBouncingOut = true;
            ball.bounceProgress = 0;
            ball.mesh.position.copy(ball.segmentEndPos);

            // Compute post-collision final ejection velocity
            const vx = (ball.segmentEndPos.x - ball.segmentStartPos.x) / ball.segmentDuration;
            const vz = (ball.segmentEndPos.z - ball.segmentStartPos.z) / ball.segmentDuration;
            const vy_impact = ball.segmentV0y - gravityVal * ball.segmentDuration;

            const restitution = 0.55;
            const friction = 0.7;

            ball.velocity.set(
              vx * friction + (Math.random() - 0.5) * 0.4,
              -vy_impact * restitution,
              vz * friction + (Math.random() - 0.5) * 0.4
            );
            continue;
          } else {
            // Transition to NEXT pad bounce segment!
            ball.currentNoteIndex++;
            
            const prevPadPos = ball.segmentEndPos.clone();
            const nextPadKey = `${ball.phraseId}_${ball.currentNoteIndex}`;
            const nextPad = padRegistry.get(nextPadKey);
            const nextNote = ball.phrase[ball.currentNoteIndex];
            
            ball.segmentStartPos.copy(prevPadPos);
            ball.segmentEndPos.copy(nextPad.position);
            ball.segmentStartTime = ball.segmentEndTime;
            ball.segmentEndTime = nextNote.time;
            // Clamp duration: chords / near-simultaneous notes get a minimum flight time
            ball.segmentDuration = Math.max(0.05, ball.segmentEndTime - ball.segmentStartTime);

            // Recalculate vertical velocity v0_y
            ball.segmentV0y = (ball.segmentEndPos.y - ball.segmentStartPos.y) / ball.segmentDuration + 0.5 * gravityVal * ball.segmentDuration;
          }
        }

        // Analytical parabolic interpolation for the current bounce segment
        const tSegment = currentTime - ball.segmentStartTime;
        // Guard: if tSegment is negative (e.g. after a loop reset), clamp to 0
        const tClamped = Math.max(0, tSegment);
        const ratio = Math.min(1.0, tClamped / ball.segmentDuration);

        // Linear interpolation on X and Z
        const x = THREE.MathUtils.lerp(ball.segmentStartPos.x, ball.segmentEndPos.x, ratio);
        const z = THREE.MathUtils.lerp(ball.segmentStartPos.z, ball.segmentEndPos.z, ratio);

        // Parabolic arc Y(t) = start.y + v0_y*t - 0.5*g*t^2
        const y = ball.segmentStartPos.y + ball.segmentV0y * tClamped - 0.5 * gravityVal * tClamped * tClamped;

        ball.mesh.position.set(x, y, z);

        // Color shifts dynamically to match the upcoming target pad
        const nextPadKey = `${ball.phraseId}_${ball.currentNoteIndex}`;
        const nextPad = padRegistry.get(nextPadKey);
        if (nextPad) {
          ball.mesh.material.color.lerp(nextPad.innerMaterial.color, 0.08);
          ball.mesh.material.emissive.lerp(nextPad.innerMaterial.color, 0.08);
          if (ball.trailMesh) ball.trailMesh.material.color.lerp(nextPad.innerMaterial.color, 0.08);
        }
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
  activeSongPhrases.forEach(phrase => {
    phrase.spawned = false;
  });
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
  activeSongPhrases.forEach(phraseObj => {
    if (activeFilter !== 'all' && phraseObj.track !== activeFilter) return;

    const spawnTime = phraseObj.notes[0].time - TOTAL_DURATION;
    if (!phraseObj.spawned && currentTime >= spawnTime) {
      spawnBallForPhrase(phraseObj);
      phraseObj.spawned = true;
    }
  });
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
  if (cameraMode === 'follow' && activeBalls.length > 0) {
    const targetBall = activeBalls[activeBalls.length - 1];
    const targetPos = new THREE.Vector3();
    targetBall.mesh.getWorldPosition(targetPos);
    controls.target.lerp(targetPos, 0.06);
  }
  // autoRotate is handled natively by controls.update() below

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
    if (cameraMode === 'auto') {
      controls.autoRotate = true;
      controls.enabled = true;
    } else if (cameraMode === 'orbit') {
      controls.autoRotate = false;
      controls.enabled = true;
    } else if (cameraMode === 'follow') {
      controls.autoRotate = false;
      controls.enabled = true;
    }
  });

  // Bloom checkbox
  document.getElementById('toggle-bloom').addEventListener('change', (e) => {
    bloomEnabled = e.target.checked;
  });

  // Bloom strength/radius/threshold sliders
  document.getElementById('slider-bloom-strength').addEventListener('input', (e) => {
    if (bloomPass) bloomPass.strength = parseFloat(e.target.value);
  });
  document.getElementById('slider-bloom-radius').addEventListener('input', (e) => {
    if (bloomPass) bloomPass.radius = parseFloat(e.target.value);
  });
  document.getElementById('slider-bloom-threshold').addEventListener('input', (e) => {
    if (bloomPass) bloomPass.threshold = parseFloat(e.target.value);
  });

  // Lighting sliders
  document.getElementById('slider-light-ambient').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (lightAmbient) lightAmbient.intensity = v;
    if (lightHemi) lightHemi.intensity = v * 0.67; // scale hemi proportionally
  });
  document.getElementById('slider-light-center').addEventListener('input', (e) => {
    if (lightCenter) lightCenter.intensity = parseFloat(e.target.value);
  });
  document.getElementById('slider-light-dir').addEventListener('input', (e) => {
    if (lightDir) lightDir.intensity = parseFloat(e.target.value);
  });
  document.getElementById('slider-light-fill').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (lightFill) lightFill.intensity = v;
    if (lightRim) lightRim.intensity = v * 0.5;
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
