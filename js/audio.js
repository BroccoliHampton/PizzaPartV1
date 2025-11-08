// js/audio.js
import * as State from './state.js';

// --- Private Module Variables ---
let waltzBass, waltzChords, violinMelody, operaVoice;
let bassSequence, chordSequence, violinSequence, operaSequence;
let isMusicPlaying = false;
let isAudioInitialized = false;
let purchaseSound, cuteClickSound;

// --- Private Functions ---

/**
 * Initializes all Tone.js instruments and sequences.
 * This is called automatically the first time audio is needed.
 */
function initAudio() {
    if (isAudioInitialized) return;

    // --- Setup Waltz Time ---
    Tone.Transport.bpm.value = 120; // A classic waltz tempo
    Tone.Transport.timeSignature = [3, 4]; // 3 beats per measure
    const limiter = new Tone.Limiter(-12).toDestination();

    // --- Instruments ---

    // 1. "Oom" - The Bass on beat 1
    waltzBass = new Tone.MonoSynth({
        oscillator: { type: 'pulse', width: 0.6 },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.3 },
        filter: { Q: 2, type: 'lowpass', cutoff: 400 }
    }).connect(limiter);

    // 2. "Pah-Pah" - Accordion/Strings on beats 2 & 3
    waltzChords = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.05, decay: 0.2, sustain: 0, release: 0.1 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
    }).connect(limiter);
    waltzChords.volume.value = -8;

    // 3. "Violin" - Prominent Melody
    const violinVibrato = new Tone.LFO("6hz", -5, 5).start(); // 6Hz vibrato
    violinMelody = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' }, // Sawtooth is good for strings
        filter: { Q: 1, type: 'lowpass', cutoff: 3000 },
        envelope: { attack: 0.1, decay: 0.3, sustain: 0.2, release: 0.8 }
    }).connect(limiter);
    violinVibrato.connect(violinMelody.filter.frequency); // Vibrato affects the filter
    violinMelody.volume.value = -4;

    // 4. "Mock Opera Voice" - Soaring counter-melody
    const operaVibrato = new Tone.LFO("5hz", 8, 12).start(); // Faster, wider vibrato
    operaVoice = new Tone.MonoSynth({
        portamento: 0.1, // Glide between notes
        oscillator: { type: 'sine' },
        filter: { Q: 5, type: 'bandpass', cutoff: 2000, gain: 10 },
        envelope: { attack: 0.2, decay: 0.2, sustain: 0.3, release: 0.5 }
    }).connect(limiter);
    operaVibrato.connect(operaVoice.detune); // Vibrato affects the pitch
    operaVoice.volume.value = -6;


    // --- Sequences (The Music) ---

    // Measures are 3 beats long. "4n" = quarter note. "2m" = 2 measures.
    // A classic I-V-IV-I progression (G - D - C - G)

    // Bass ("Oom")
    bassSequence = new Tone.Sequence((time, note) => {
        waltzBass.triggerAttackRelease(note, '4n', time);
    }, ['G2', null, null, 'D2', null, null, 'C2', null, null, 'G2', null, null], '4n');

    // Chords ("Pah-Pah")
    chordSequence = new Tone.Sequence((time, chord) => {
        waltzChords.triggerAttackRelease(chord, '8n', time);
    }, [
        null, ['B3', 'D4'], ['B3', 'D4'], // G Major
        null, ['A3', 'C#4'], ['A3', 'C#4'], // D Major
        null, ['C4', 'E4'], ['C4', 'E4'], // C Major
        null, ['B3', 'D4'], ['B3', 'D4']  // G Major
    ], '4n');

    // Violin Melody
    violinSequence = new Tone.Sequence((time, note) => {
        violinMelody.triggerAttackRelease(note, '4n', time);
    }, [
        'G4', 'B4', 'D5',
        'C5', 'B4', 'A4',
        'A4', 'G4', 'F#4',
        'G4', null, null,
        'G4', 'B4', 'D5',
        'C5', 'B4', 'A4',
        'B4', 'C5', 'A4',
        'G4', null, null
    ], '4n');

    // Opera Voice (comes in on the 2nd half)
    operaSequence = new Tone.Sequence((time, note) => {
        operaVoice.triggerAttackRelease(note, '2n', time); // Long, soaring notes
    }, [
        null, null, null, null, null, null, null, null, null, null, null, null, // Rest for 4 measures
        'D5', null, null, // "O..."
        'E5', null, null, // "...so..."
        'C5', null, null, // "...le..."
        'B4', null, null, // "...mi..."
        'D5', null, null, null, null, null, // "O..."
        'C5', null, null, // "...pi..."
        'B4', null, null, // "...zza..."
        'A4', null, null, // "...pi..."
        'G4', null, null  // "...zza!"
    ], '4n');


    // --- Sound Effects (Unchanged, but useful) ---
    cuteClickSound = new Tone.FMSynth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.1 },
        harmonicity: 0.5,
        modulationIndex: 2
    }).connect(limiter);
    
    purchaseSound = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 }
    }).connect(limiter);

    isAudioInitialized = true;
}

// --- Exported Functions ---

/**
 * Plays a sound effect if SFX are not muted.
 * @param {string} sound - The name of the sound to play ('click' or 'purchase').
 */
export function playSoundEffect(sound) {
    if (State.uiState.isSfxMuted) return;

    if (Tone.context.state !== 'running') {
        Tone.start();
    }
    
    if (!isAudioInitialized) {
        initAudio();
    }
    
    const now = Tone.now(); 
    const offset = 0.001;

    if (sound === 'click') { // Renamed from 'crunch'
        cuteClickSound.triggerAttackRelease('C6', '32n', now + offset);
    }
    if (sound === 'purchase') {
        purchaseSound.triggerAttackRelease('C5', '16n', now + offset);
        purchaseSound.triggerAttackRelease('E5', '16n', now + 0.05 + offset);
        purchaseSound.triggerAttackRelease('G5', '16n', now + 0.1 + offset);
    }
}

/**
 * Toggles sound effects on or off.
 * @param {object} dom - The cached DOM elements object.
 */
export function toggleSfx(dom) {
    State.uiState.isSfxMuted = !State.uiState.isSfxMuted;
    dom.sfxToggleButton.textContent = State.uiState.isSfxMuted ? '🔇' : '🔊';
    if (!State.uiState.isSfxMuted) {
        playSoundEffect('click'); // Renamed from 'crunch'
    }
}

/**
 * Toggles background music on or off.
 * @param {object} dom - The cached DOM elements object.
 */
export function toggleMusic(dom) {
    if (Tone.context.state !== 'running') {
        Tone.start();
    }

    if (!isAudioInitialized) {
        initAudio();
    }

    if (isMusicPlaying) {
        Tone.Transport.stop();
        dom.musicToggleButton.textContent = '🔇';
        // Stop all sequences
        if (bassSequence) bassSequence.stop(0);
        if (chordSequence) chordSequence.stop(0);
        if (violinSequence) violinSequence.stop(0);
        if (operaSequence) operaSequence.stop(0);
    } else {
        Tone.Transport.start();
        // Start all sequences
        if (bassSequence && bassSequence.state === 'stopped') bassSequence.start(0);
        if (chordSequence && chordSequence.state === 'stopped') chordSequence.start(0);
        if (violinSequence && violinSequence.state === 'stopped') violinSequence.start(0);
        if (operaSequence && operaSequence.state === 'stopped') operaSequence.start(0);
        dom.musicToggleButton.textContent = '🎵';
    }
    isMusicPlaying = !isMusicPlaying;
}
