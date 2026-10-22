/**
 * Procedural Demo Song Generator
 * Generates rich, melodic sample tracks directly into an AudioBuffer
 * so users can immediately test mixing even without having an audio file ready.
 */

export interface SampleSong {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  genre: string;
  duration: number;
  generate: (ctx: AudioContext) => AudioBuffer;
}

export const SAMPLE_SONGS: SampleSong[] = [
  {
    id: 'indie_vocal_hook',
    name: 'Midnight Melodi (Vocal & Chords)',
    artist: 'Luna Vibe',
    bpm: 130,
    genre: 'Melodic Pop / Vocal',
    duration: 32,
    generate: (ctx: AudioContext) => {
      const sampleRate = ctx.sampleRate;
      const duration = 32; // 32 seconds loop
      const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const bpm = 130;
      const beatSec = 60 / bpm;
      const chordProgression = [
        [220.0, 261.63, 329.63], // Am
        [174.61, 220.0, 261.63], // F
        [261.63, 329.63, 392.0],  // C
        [196.0, 246.94, 293.66], // G
      ];

      const vocalMelody = [
        440, 523.25, 440, 392, 329.63, 392, 440, 0,
        523.25, 587.33, 659.25, 587.33, 523.25, 440, 392, 329.63,
      ];

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const currentBeat = (t / beatSec);
        const chordIndex = Math.floor(currentBeat / 4) % chordProgression.length;
        const chord = chordProgression[chordIndex];

        // Synthesize electric piano chords with chorus
        let chordSignal = 0;
        for (const freq of chord) {
          const detune = Math.sin(t * 1.5) * 0.003;
          chordSignal += Math.sin(2 * Math.PI * freq * (1 + detune) * t) * 0.12;
          chordSignal += Math.sin(4 * Math.PI * freq * t) * 0.04;
        }

        // Synthesize warm vocal formant synth
        const melodyStep = Math.floor(currentBeat * 2) % vocalMelody.length;
        const vocalFreq = vocalMelody[melodyStep];
        let vocalSignal = 0;
        if (vocalFreq > 0) {
          const stepFrac = (currentBeat * 2) % 1;
          const envelope = Math.sin(stepFrac * Math.PI) * Math.min(1, stepFrac * 10);
          // Dual formant filter approximation (Ah/Oh sound)
          vocalSignal = (Math.sin(2 * Math.PI * vocalFreq * t) +
            0.5 * Math.sin(2 * Math.PI * (vocalFreq * 1.5) * t) +
            0.3 * Math.sin(2 * Math.PI * 800 * t)) * envelope * 0.25;
        }

        // Sub bass layer for the song
        const bassFreq = chord[0] / 2;
        const bassSignal = Math.sin(2 * Math.PI * bassFreq * t) * 0.15;

        // Acoustic guitar-like arpeggio tick
        const arpStep = Math.floor(currentBeat * 4) % 4;
        const arpFreq = chord[arpStep % chord.length] * 2;
        const arpFrac = (currentBeat * 4) % 1;
        const arpSignal = Math.sin(2 * Math.PI * arpFreq * t) * Math.exp(-arpFrac * 6) * 0.08;

        const combined = chordSignal + vocalSignal + bassSignal + arpSignal;
        left[i] = Math.max(-1, Math.min(1, combined * 0.8));
        right[i] = Math.max(-1, Math.min(1, (combined + (vocalSignal * 0.2 - chordSignal * 0.1)) * 0.8));
      }

      return buffer;
    },
  },
  {
    id: 'cyber_synth_riff',
    name: 'Cyberwave Synth Anthem',
    artist: 'Neon Rider',
    bpm: 128,
    genre: 'Synthwave / Retro Club',
    duration: 30,
    generate: (ctx: AudioContext) => {
      const sampleRate = ctx.sampleRate;
      const duration = 30;
      const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const bpm = 128;
      const beatSec = 60 / bpm;

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const currentBeat = (t / beatSec);
        
        // 16th note synth arpeggio
        const arpNotes = [130.81, 155.56, 196.0, 261.63, 311.13, 392.0, 523.25, 392.0];
        const noteIndex = Math.floor(currentBeat * 4) % arpNotes.length;
        const freq = arpNotes[noteIndex];
        const stepFrac = (currentBeat * 4) % 1;
        const env = Math.exp(-stepFrac * 5);

        // Sawtooth wave
        const phase = (t * freq) % 1;
        const saw = (phase * 2 - 1) * env * 0.25;

        // Pad underneath
        const padFreq = 130.81;
        const pad = (Math.sin(2 * Math.PI * padFreq * t) + Math.sin(2 * Math.PI * (padFreq * 1.5) * t)) * 0.1;

        const val = saw + pad;
        left[i] = Math.max(-1, Math.min(1, val));
        right[i] = Math.max(-1, Math.min(1, val * 0.95));
      }

      return buffer;
    },
  },
  {
    id: 'dangdut_acoustic_loop',
    name: 'Suling & Akustik Nusantara',
    artist: 'Batik Sound',
    bpm: 135,
    genre: 'Traditional / Pop Indo',
    duration: 28,
    generate: (ctx: AudioContext) => {
      const sampleRate = ctx.sampleRate;
      const duration = 28;
      const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const bpm = 135;
      const beatSec = 60 / bpm;
      // Pelog/Slendro inspired pentatonic notes: D, Eb, G, A, Bb
      const sulingScale = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33];

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        const currentBeat = (t / beatSec);
        const noteIdx = Math.floor(currentBeat) % sulingScale.length;
        const freq = sulingScale[noteIdx];
        const vibrato = Math.sin(2 * Math.PI * 5 * t) * 8;

        // Flute / Suling breathy tone
        const flute = Math.sin(2 * Math.PI * (freq + vibrato) * t) * 0.25 +
                      (Math.random() * 2 - 1) * 0.015;

        // Mandolin strum
        const strumFrac = (currentBeat * 2) % 1;
        const mandolin = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-strumFrac * 12) * 0.15;

        left[i] = Math.max(-1, Math.min(1, flute + mandolin));
        right[i] = Math.max(-1, Math.min(1, flute * 0.9 + mandolin * 1.1));
      }

      return buffer;
    },
  },
];
