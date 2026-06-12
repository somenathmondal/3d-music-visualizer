import * as Tone from 'tone';

// Tone.js Synth definitions
let synths = {};
let isMuted = { lead: false, alto: false, bass: false };

// --- SONG 1: DEFAULT DEMO SONG ---
export const demoSong = {
  bpm: 125,
  tracks: {
    lead: {
      color: '#00ffff', // Cyan
      notes: [
        { note: 'E5', time: 0.0, duration: 0.15 },
        { note: 'A5', time: 0.5, duration: 0.15 },
        { note: 'B5', time: 1.0, duration: 0.15 },
        { note: 'C6', time: 1.25, duration: 0.15 },
        { note: 'B5', time: 1.5, duration: 0.15 },
        { note: 'A5', time: 2.0, duration: 0.15 },
        { note: 'E5', time: 2.5, duration: 0.15 },
        { note: 'D5', time: 3.0, duration: 0.15 },
        { note: 'E5', time: 3.5, duration: 0.15 },
        
        { note: 'E5', time: 4.0, duration: 0.15 },
        { note: 'A5', time: 4.5, duration: 0.15 },
        { note: 'B5', time: 5.0, duration: 0.15 },
        { note: 'C6', time: 5.25, duration: 0.15 },
        { note: 'E6', time: 5.5, duration: 0.15 },
        { note: 'D6', time: 6.0, duration: 0.15 },
        { note: 'C6', time: 6.5, duration: 0.15 },
        { note: 'B5', time: 7.0, duration: 0.15 },
        { note: 'A5', time: 7.5, duration: 0.15 },

        { note: 'F5', time: 8.0, duration: 0.15 },
        { note: 'A5', time: 8.5, duration: 0.15 },
        { note: 'C6', time: 9.0, duration: 0.15 },
        { note: 'D6', time: 9.25, duration: 0.15 },
        { note: 'C6', time: 9.5, duration: 0.15 },
        { note: 'A5', time: 10.0, duration: 0.15 },
        { note: 'F5', time: 10.5, duration: 0.15 },
        { note: 'G5', time: 11.0, duration: 0.15 },
        { note: 'A5', time: 11.5, duration: 0.15 },

        { note: 'E5', time: 12.0, duration: 0.15 },
        { note: 'G5', time: 12.5, duration: 0.15 },
        { note: 'B5', time: 13.0, duration: 0.15 },
        { note: 'C6', time: 13.25, duration: 0.15 },
        { note: 'B5', time: 13.5, duration: 0.15 },
        { note: 'G5', time: 14.0, duration: 0.15 },
        { note: 'E5', time: 14.5, duration: 0.15 },
        { note: 'F#5', time: 15.0, duration: 0.15 },
        { note: 'G#5', time: 15.5, duration: 0.15 }
      ]
    },
    alto: {
      color: '#ff00ff', // Magenta
      notes: [
        { note: 'A3', time: 0.0, duration: 0.8 },
        { note: 'C4', time: 0.0, duration: 0.8 },
        { note: 'E4', time: 0.0, duration: 0.8 },
        { note: 'A3', time: 1.0, duration: 0.8 },
        { note: 'C4', time: 1.0, duration: 0.8 },
        { note: 'E4', time: 1.0, duration: 0.8 },
        
        { note: 'D3', time: 2.0, duration: 0.8 },
        { note: 'F3', time: 2.0, duration: 0.8 },
        { note: 'A3', time: 2.0, duration: 0.8 },
        { note: 'D3', time: 3.0, duration: 0.8 },
        { note: 'F3', time: 3.0, duration: 0.8 },
        { note: 'A3', time: 3.0, duration: 0.8 },

        { note: 'A3', time: 4.0, duration: 0.8 },
        { note: 'C4', time: 4.0, duration: 0.8 },
        { note: 'E4', time: 4.0, duration: 0.8 },
        { note: 'A3', time: 5.0, duration: 0.8 },
        { note: 'C4', time: 5.0, duration: 0.8 },
        { note: 'E4', time: 5.0, duration: 0.8 },

        { note: 'E3', time: 6.0, duration: 0.8 },
        { note: 'G#3', time: 6.0, duration: 0.8 },
        { note: 'B3', time: 6.0, duration: 0.8 },
        { note: 'E3', time: 7.0, duration: 0.8 },
        { note: 'G#3', time: 7.0, duration: 0.8 },
        { note: 'D4', time: 7.0, duration: 0.8 },

        { note: 'F3', time: 8.0, duration: 0.8 },
        { note: 'A3', time: 8.0, duration: 0.8 },
        { note: 'C4', time: 8.0, duration: 0.8 },
        { note: 'F3', time: 9.0, duration: 0.8 },
        { note: 'A3', time: 9.0, duration: 0.8 },
        { note: 'C4', time: 9.0, duration: 0.8 },

        { note: 'G3', time: 10.0, duration: 0.8 },
        { note: 'B3', time: 10.0, duration: 0.8 },
        { note: 'D4', time: 10.0, duration: 0.8 },
        { note: 'G3', time: 11.0, duration: 0.8 },
        { note: 'B3', time: 11.0, duration: 0.8 },
        { note: 'D4', time: 11.0, duration: 0.8 },

        { note: 'C3', time: 12.0, duration: 0.8 },
        { note: 'E3', time: 12.0, duration: 0.8 },
        { note: 'G3', time: 12.0, duration: 0.8 },
        { note: 'E3', time: 14.0, duration: 0.8 },
        { note: 'G#3', time: 14.0, duration: 0.8 },
        { note: 'B3', time: 14.0, duration: 0.8 }
      ]
    },
    bass: {
      color: '#ffff00', // Yellow
      notes: [
        { note: 'A2', time: 0.0, duration: 0.4 },
        { note: 'E2', time: 0.5, duration: 0.4 },
        { note: 'A2', time: 1.0, duration: 0.4 },
        { note: 'C3', time: 1.5, duration: 0.4 },
        
        { note: 'D2', time: 2.0, duration: 0.4 },
        { note: 'A2', time: 2.5, duration: 0.4 },
        { note: 'D3', time: 3.0, duration: 0.4 },
        { note: 'F2', time: 3.5, duration: 0.4 },

        { note: 'A2', time: 4.0, duration: 0.4 },
        { note: 'E2', time: 4.5, duration: 0.4 },
        { note: 'A2', time: 5.0, duration: 0.4 },
        { note: 'C3', time: 5.5, duration: 0.4 },

        { note: 'E2', time: 6.0, duration: 0.4 },
        { note: 'B1', time: 6.5, duration: 0.4 },
        { note: 'E2', time: 7.0, duration: 0.4 },
        { note: 'G#2', time: 7.5, duration: 0.4 },

        { note: 'F2', time: 8.0, duration: 0.4 },
        { note: 'C2', time: 8.5, duration: 0.4 },
        { note: 'F2', time: 9.0, duration: 0.4 },
        { note: 'A2', time: 9.5, duration: 0.4 },

        { note: 'G2', time: 10.0, duration: 0.4 },
        { note: 'D2', time: 10.5, duration: 0.4 },
        { note: 'G2', time: 11.0, duration: 0.4 },
        { note: 'B2', time: 11.5, duration: 0.4 },

        { note: 'C2', time: 12.0, duration: 0.4 },
        { note: 'G2', time: 12.5, duration: 0.4 },
        { note: 'C3', time: 13.0, duration: 0.4 },
        { note: 'G2', time: 13.5, duration: 0.4 },

        { note: 'E2', time: 14.0, duration: 0.4 },
        { note: 'B1', time: 14.5, duration: 0.4 },
        { note: 'E3', time: 15.0, duration: 0.4 },
        { note: 'E2', time: 15.5, duration: 0.4 }
      ]
    }
  }
};

// --- SONG 2: ED SHEERAN - SHAPE OF YOU ---
const buildShapeOfYou = () => {
  const bpm = 96;
  const beatTime = 60 / bpm;

  const leadNotes = [];
  const altoNotes = [];
  const bassNotes = [];

  const marimbaLoop = [
    { note: 'C#4', beat: 0.0 }, { note: 'E4', beat: 0.0 },
    { note: 'C#4', beat: 0.75 }, { note: 'E4', beat: 0.75 },
    { note: 'E4', beat: 1.5 }, { note: 'G#4', beat: 1.5 },
    { note: 'E4', beat: 2.0 }, { note: 'G#4', beat: 2.0 },
    { note: 'E4', beat: 2.75 }, { note: 'G#4', beat: 2.75 },
    { note: 'E4', beat: 3.5 }, { note: 'G#4', beat: 3.5 },

    { note: 'F#4', beat: 4.0 }, { note: 'A4', beat: 4.0 },
    { note: 'F#4', beat: 4.75 }, { note: 'A4', beat: 4.75 },
    { note: 'F#4', beat: 5.5 }, { note: 'A4', beat: 5.5 },
    { note: 'F#4', beat: 6.0 }, { note: 'A4', beat: 6.0 },
    { note: 'F#4', beat: 6.75 }, { note: 'A4', beat: 6.75 },
    { note: 'F#4', beat: 7.5 }, { note: 'A4', beat: 7.5 },

    { note: 'A4', beat: 8.0 }, { note: 'C#5', beat: 8.0 },
    { note: 'A4', beat: 8.75 }, { note: 'C#5', beat: 8.75 },
    { note: 'A4', beat: 9.5 }, { note: 'C#5', beat: 9.5 },
    { note: 'A4', beat: 10.0 }, { note: 'C#5', beat: 10.0 },
    { note: 'A4', beat: 10.75 }, { note: 'C#5', beat: 10.75 },
    { note: 'A4', beat: 11.5 }, { note: 'C#5', beat: 11.5 },

    { note: 'B4', beat: 12.0 }, { note: 'D#5', beat: 12.0 },
    { note: 'B4', beat: 12.75 }, { note: 'D#5', beat: 12.75 },
    { note: 'B4', beat: 13.5 }, { note: 'D#5', beat: 13.5 },
    { note: 'B4', beat: 14.0 }, { note: 'D#5', beat: 14.0 },
    { note: 'B4', beat: 14.75 }, { note: 'D#5', beat: 14.75 },
    { note: 'B4', beat: 15.5 }, { note: 'D#5', beat: 15.5 }
  ];

  for (let loop = 0; loop < 2; loop++) {
    const offsetBeats = loop * 16;
    marimbaLoop.forEach(item => {
      altoNotes.push({
        note: item.note,
        time: (item.beat + offsetBeats) * beatTime,
        duration: 0.18
      });
    });
  }

  const bassPattern = [
    { note: 'C#3', beat: 0.0 }, { note: 'C#3', beat: 1.5 }, { note: 'C#3', beat: 2.5 },
    { note: 'F#2', beat: 4.0 }, { note: 'F#2', beat: 5.5 }, { note: 'F#2', beat: 6.5 },
    { note: 'A2', beat: 8.0 }, { note: 'A2', beat: 9.5 }, { note: 'A2', beat: 10.5 },
    { note: 'B2', beat: 12.0 }, { note: 'B2', beat: 13.5 }, { note: 'B2', beat: 14.5 }
  ];

  for (let loop = 0; loop < 2; loop++) {
    const offsetBeats = loop * 16;
    bassPattern.forEach(item => {
      bassNotes.push({
        note: item.note,
        time: (item.beat + offsetBeats) * beatTime,
        duration: 0.45
      });
    });
  }

  const chorusVocal = [
    { note: 'G#4', beat: 0.0 }, { note: 'G#4', beat: 0.5 },
    { note: 'G#4', beat: 1.0 }, { note: 'G#4', beat: 1.5 }, { note: 'G#4', beat: 2.0 },
    { note: 'F#4', beat: 2.5 }, { note: 'E4', beat: 3.0 }, { note: 'C#4', beat: 3.5 },

    { note: 'G#4', beat: 4.0 }, { note: 'G#4', beat: 4.5 },
    { note: 'G#4', beat: 5.0 }, { note: 'G#4', beat: 5.5 }, { note: 'G#4', beat: 6.0 },
    { note: 'F#4', beat: 6.5 }, { note: 'E4', beat: 7.0 }, { note: 'C#4', beat: 7.5 },

    { note: 'G#4', beat: 8.0 }, { note: 'G#4', beat: 8.5 },
    { note: 'G#4', beat: 9.0 }, { note: 'G#4', beat: 9.5 }, { note: 'G#4', beat: 10.0 },
    { note: 'F#4', beat: 10.5 }, { note: 'E4', beat: 11.0 }, { note: 'C#4', beat: 11.5 },

    { note: 'C#4', beat: 12.0 }, { note: 'E4', beat: 12.5 }, { note: 'G#4', beat: 13.0 },
    { note: 'F#4', beat: 13.5 }, { note: 'E4', beat: 14.0 }, { note: 'C#4', beat: 14.5 },

    { note: 'G#4', beat: 16.0 }, { note: 'G#4', beat: 16.5 },
    { note: 'G#4', beat: 17.0 }, { note: 'G#4', beat: 17.5 }, { note: 'G#4', beat: 18.0 },
    { note: 'F#4', beat: 18.5 }, { note: 'E4', beat: 19.0 }, { note: 'C#4', beat: 19.5 },

    { note: 'G#4', beat: 20.0 }, { note: 'G#4', beat: 20.5 },
    { note: 'G#4', beat: 21.0 }, { note: 'G#4', beat: 21.5 }, { note: 'G#4', beat: 22.0 },
    { note: 'F#4', beat: 22.5 }, { note: 'E4', beat: 23.0 }, { note: 'C#4', beat: 23.5 },

    { note: 'G#4', beat: 24.0 }, { note: 'G#4', beat: 24.5 },
    { note: 'G#4', beat: 25.0 }, { note: 'G#4', beat: 25.5 }, { note: 'G#4', beat: 26.0 },
    { note: 'F#4', beat: 26.5 }, { note: 'E4', beat: 27.0 }, { note: 'C#4', beat: 27.5 },

    { note: 'C#4', beat: 28.0 }, { note: 'E4', beat: 28.5 }, { note: 'G#4', beat: 29.0 },
    { note: 'F#4', beat: 29.5 }, { note: 'E4', beat: 30.0 }, { note: 'C#4', beat: 30.5 }
  ];

  chorusVocal.forEach(item => {
    leadNotes.push({
      note: item.note,
      time: item.beat * beatTime,
      duration: 0.35
    });
  });

  return {
    bpm: bpm,
    tracks: {
      lead: { color: '#00ffff', notes: leadNotes },
      alto: { color: '#ff00ff', notes: altoNotes },
      bass: { color: '#ffff00', notes: bassNotes }
    }
  };
};

export const shapeOfYouSong = buildShapeOfYou();

// --- SONG 3: HEDWIG'S THEME (HARRY POTTER) ---
const buildHedwigTheme = () => {
  const bpm = 132;
  const beatTime = 60 / bpm; // Time in seconds for 1 beat

  const leadNotes = [];
  const altoNotes = [];
  const bassNotes = [];

  // Famous main chime melody (lead)
  const melodyPattern = [
    { note: 'B4', beat: 0.0 },
    { note: 'E5', beat: 1.0 }, { note: 'G5', beat: 2.5 }, { note: 'F#5', beat: 3.0 },
    { note: 'E5', beat: 4.0 }, { note: 'B5', beat: 6.0 },
    { note: 'A5', beat: 7.0 },
    { note: 'F#5', beat: 10.0 },
    { note: 'E5', beat: 13.0 }, { note: 'G5', beat: 14.5 }, { note: 'F#5', beat: 15.0 },
    { note: 'D#5', beat: 16.0 }, { note: 'F5', beat: 18.0 },
    { note: 'B4', beat: 19.0 },
    
    // Part B
    { note: 'B4', beat: 22.0 },
    { note: 'E5', beat: 23.0 }, { note: 'G5', beat: 24.5 }, { note: 'F#5', beat: 25.0 },
    { note: 'E5', beat: 26.0 }, { note: 'B5', beat: 28.0 },
    { note: 'D6', beat: 29.0 }, { note: 'C#6', beat: 31.0 },
    { note: 'C6', beat: 32.0 }, { note: 'G#5', beat: 34.0 },
    { note: 'C6', beat: 35.0 }, { note: 'B5', beat: 36.5 }, { note: 'A#5', beat: 37.0 },
    { note: 'F#5', beat: 38.0 }, { note: 'G5', beat: 40.0 },
    { note: 'E5', beat: 41.0 }
  ];

  melodyPattern.forEach(item => {
    leadNotes.push({
      note: item.note,
      time: item.beat * beatTime,
      duration: 0.5
    });
  });

  // Orchestral harmony backing (alto)
  const harmonyPattern = [
    { notes: ['E3', 'G3', 'B3'], beat: 1.0 },
    { notes: ['E3', 'G3', 'B3'], beat: 4.0 },
    { notes: ['A3', 'C4', 'E4'], beat: 7.0 },
    { notes: ['B3', 'D#4', 'F#4'], beat: 10.0 },
    { notes: ['E3', 'G3', 'B3'], beat: 13.0 },
    { notes: ['B3', 'D#4', 'F#4'], beat: 16.0 },
    { notes: ['E3', 'G3', 'B3'], beat: 19.0 },
    
    { notes: ['E3', 'G3', 'B3'], beat: 23.0 },
    { notes: ['E3', 'G3', 'B3'], beat: 26.0 },
    { notes: ['G3', 'B3', 'D4'], beat: 29.0 },
    { notes: ['C3', 'E3', 'G3'], beat: 32.0 },
    { notes: ['A3', 'C4', 'E4'], beat: 35.0 },
    { notes: ['B3', 'D#4', 'F#4'], beat: 38.0 },
    { notes: ['E3', 'G3', 'B3'], beat: 41.0 }
  ];

  harmonyPattern.forEach(item => {
    item.notes.forEach(noteName => {
      altoNotes.push({
        note: noteName,
        time: item.beat * beatTime,
        duration: 1.8 * beatTime
      });
    });
  });

  // Deep orchestral bass pedal (bass)
  const bassPattern = [
    { note: 'E2', beat: 1.0 },
    { note: 'E2', beat: 4.0 },
    { note: 'A2', beat: 7.0 },
    { note: 'B2', beat: 10.0 },
    { note: 'E2', beat: 13.0 },
    { note: 'B2', beat: 16.0 },
    { note: 'E2', beat: 19.0 },
    
    { note: 'E2', beat: 23.0 },
    { note: 'E2', beat: 26.0 },
    { note: 'G2', beat: 29.0 },
    { note: 'C2', beat: 32.0 },
    { note: 'A2', beat: 35.0 },
    { note: 'B2', beat: 38.0 },
    { note: 'E2', beat: 41.0 }
  ];

  bassPattern.forEach(item => {
    bassNotes.push({
      note: item.note,
      time: item.beat * beatTime,
      duration: 2.2 * beatTime
    });
  });

  return {
    bpm: bpm,
    tracks: {
      lead: { color: '#00ffff', notes: leadNotes },
      alto: { color: '#ff00ff', notes: altoNotes },
      bass: { color: '#ffff00', notes: bassNotes }
    }
  };
};

export const hedwigSong = buildHedwigTheme();

// Initialize synths
export function initAudio() {
  // Lead Synth: Celestial, metallic glockenspiel-like chime
  synths.lead = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: 'sine'
    },
    envelope: {
      attack: 0.002,
      decay: 0.35,
      sustain: 0.05,
      release: 0.6
    }
  });
  
  const leadFilter = new Tone.Filter({
    type: 'lowpass',
    frequency: 3000,
    Q: 1.0
  }).toDestination();
  
  // High reverb for magical spatial environment
  const leadReverb = new Tone.Reverb({
    roomSize: 0.85,
    wet: 0.38
  }).connect(leadFilter);

  const leadDelay = new Tone.PingPongDelay({
    delayTime: '4n.',
    feedback: 0.3,
    wet: 0.22
  }).connect(leadReverb);
  
  synths.lead.connect(leadDelay);

  // Alto Synth: Mellow warm poly synth for backing chords
  synths.alto = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: 'triangle'
    },
    envelope: {
      attack: 0.08,
      decay: 0.5,
      sustain: 0.4,
      release: 0.6
    }
  });
  
  const altoFilter = new Tone.Filter({
    type: 'lowpass',
    frequency: 1000,
    Q: 1.0
  }).toDestination();
  
  synths.alto.connect(altoFilter);

  // Bass Synth: Deep cello-like warm string bass
  synths.bass = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: {
      type: 'sawtooth'
    },
    filter: {
      Q: 1.0,
      type: 'lowpass',
      frequency: 120
    },
    envelope: {
      attack: 0.08,
      decay: 0.3,
      sustain: 0.4,
      release: 0.8
    }
  }).toDestination();
}

// Play a single note programmatically
export function playSynthNote(track, noteName, duration, time) {
  if (isMuted[track] || !synths[track]) return;
  
  if (track === 'bass') {
    synths.bass.triggerAttackRelease(noteName, duration, time);
  } else {
    synths[track].triggerAttackRelease(noteName, duration, time);
  }
}

// Set track mute state
export function setTrackMute(track, muted) {
  isMuted[track] = muted;
}

// Get mute state
export function getTrackMute(track) {
  return isMuted[track];
}
