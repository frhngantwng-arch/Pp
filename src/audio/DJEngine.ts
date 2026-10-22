/**
 * DJEngine - Comprehensive Web Audio API Real-time DJ Mixing & Synthesizer Engine
 * Supports dual decks, crossfader, 3-band EQs, filter sweeps, beat repeater,
 * interactive vinyl scratches, AI synth generation, hot cues, loops, stem vocal isolator,
 * multi-FX processor, and live recording.
 */

export interface DJPattern {
  kick: number[];
  snare: number[];
  clap: number[];
  hihat: number[];
  percussion: number[];
}

export interface DJTrackPlan {
  title: string;
  genre: string;
  bpm: number;
  key: string;
  synthStyle: string;
  bassStyle: string;
  sidechainIntensity: number;
  drumPattern: DJPattern;
  melodyNotes: number[];
  basslineNotes: number[];
  chords?: number[][];
  djShoutout?: string;
  mashupTips?: string;
  mashupCueTime?: number;
  dropTimingSeconds?: number;
}

export type FXType = 'none' | 'echo' | 'flanger' | 'reverb' | 'bitcrush';

export class DJEngine {
  public ctx: AudioContext | null = null;

  // Master Bus
  private masterGain!: GainNode;
  private masterCompressor!: DynamicsCompressorNode;
  public masterAnalyser!: AnalyserNode;
  private mediaDest!: MediaStreamAudioDestinationNode;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  // Crossfader
  private crossfaderGainA!: GainNode;
  private crossfaderGainB!: GainNode;
  public crossfaderVal = 0; // -1 (Deck A) to 1 (Deck B)

  // DECK A (AI DJ Beat & Synths)
  private deckAGainNode!: GainNode;
  public deckATrimGain!: GainNode;
  public deckAEqLow!: BiquadFilterNode;
  public deckAEqMid!: BiquadFilterNode;
  public deckAEqHigh!: BiquadFilterNode;
  public deckAFilterNode!: BiquadFilterNode;
  public deckAAnalyser!: AnalyserNode;
  private deckASynthBusGain!: GainNode;
  public hotCuesA: (number | null)[] = [null, null, null, null];
  public fxTypeA: FXType = 'none';
  public fxWetA = 0;
  private delayNodeA!: DelayNode;
  private delayFeedbackA!: GainNode;

  // DECK B (Uploaded Track)
  private deckBGainNode!: GainNode;
  public deckBTrimGain!: GainNode;
  public deckBEqLow!: BiquadFilterNode;
  public deckBEqMid!: BiquadFilterNode;
  public deckBEqHigh!: BiquadFilterNode;
  public deckBFilterNode!: BiquadFilterNode;
  public deckBAnalyser!: AnalyserNode;
  private deckBSourceNode: AudioBufferSourceNode | null = null;
  public deckBBuffer: AudioBuffer | null = null;
  public deckBDuration = 0;
  private deckBStartTime = 0;
  private deckBPauseOffset = 0;
  public isDeckBPlaying = false;
  public deckBOriginalBpm = 130;
  public deckBPitchBend = 1.0;
  public deckBKeyShift = 0; // semitones (-6 to +6)
  public isDeckBSynced = true;
  public hotCuesB: (number | null)[] = [null, null, null, null];

  // Vocal Isolator / Stem Acapella Mode (Deck B)
  public isVocalIsolatorActive = false;
  private stemLowCutFilter!: BiquadFilterNode;
  private stemHighCutFilter!: BiquadFilterNode;
  private stemVocalPresenceFilter!: BiquadFilterNode;
  private stemDryGain!: GainNode;
  private stemWetGain!: GainNode;

  // FX Unit B
  public fxTypeB: FXType = 'none';
  public fxWetB = 0;
  private delayNodeB!: DelayNode;
  private delayFeedbackB!: GainNode;

  // Loops & Beat Repeaters
  public isLoopActiveB = false;
  public loopStartB = 0;
  public loopEndB = 0;
  public loopBeatsB = 4;
  private loopCheckInterval: any = null;

  // Stutter / Loop Roll on Deck B
  private isStuttering = false;
  private stutterInterval: any = null;

  // Master Sequencer State
  public bpm = 138;
  public isDeckAPlaying = false;
  public isJedagJedugBoost = true;
  private current16thStep = 0;
  private nextStepTime = 0;
  private scheduleAheadTime = 0.1; // seconds
  private lookaheadMs = 25; // polling interval
  private timerId: any = null;

  // Current DJ Plan
  public currentPlan: DJTrackPlan | null = null;

  // AI MC Voice Drop buffer
  public voiceDropBuffer: AudioBuffer | null = null;

  // Angguk-Angguk Drop State
  public anggukBuffer: AudioBuffer | null = null;
  public isAnggukPlaying = false;
  public anggukDuration = 3.4;
  private anggukSourceNode: AudioBufferSourceNode | null = null;
  private anggukTimeoutId: any = null;
  private anggukSavedState: {
    wasDeckAPlaying: boolean;
    wasDeckBPlaying: boolean;
    savedDeckBTime: number;
    startTime: number;
  } | null = null;

  // Scratch simulation
  public isScratching = false;

  constructor() {}

  public init() {
    if (this.ctx) return;
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtxClass();

    // Master bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    // Compressor/Limiter for punchy, distortion-free mixing
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-3, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(6, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(8, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    this.mediaDest = this.ctx.createMediaStreamDestination();

    // Crossfader nodes
    this.crossfaderGainA = this.ctx.createGain();
    this.crossfaderGainB = this.ctx.createGain();
    this.updateCrossfader(0);

    // --- DECK A AUDIO GRAPH ---
    this.deckATrimGain = this.ctx.createGain();
    this.deckATrimGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.deckAGainNode = this.ctx.createGain();
    this.deckAGainNode.gain.setValueAtTime(0.95, this.ctx.currentTime);

    this.deckAEqLow = this.ctx.createBiquadFilter();
    this.deckAEqLow.type = 'lowshelf';
    this.deckAEqLow.frequency.setValueAtTime(250, this.ctx.currentTime);
    this.deckAEqLow.gain.setValueAtTime(0, this.ctx.currentTime);

    this.deckAEqMid = this.ctx.createBiquadFilter();
    this.deckAEqMid.type = 'peaking';
    this.deckAEqMid.frequency.setValueAtTime(1200, this.ctx.currentTime);
    this.deckAEqMid.Q.setValueAtTime(1.0, this.ctx.currentTime);
    this.deckAEqMid.gain.setValueAtTime(0, this.ctx.currentTime);

    this.deckAEqHigh = this.ctx.createBiquadFilter();
    this.deckAEqHigh.type = 'highshelf';
    this.deckAEqHigh.frequency.setValueAtTime(4500, this.ctx.currentTime);
    this.deckAEqHigh.gain.setValueAtTime(0, this.ctx.currentTime);

    this.deckAFilterNode = this.ctx.createBiquadFilter();
    this.deckAFilterNode.type = 'allpass';
    this.deckAFilterNode.frequency.setValueAtTime(1000, this.ctx.currentTime);

    this.deckAAnalyser = this.ctx.createAnalyser();
    this.deckAAnalyser.fftSize = 256;

    this.deckASynthBusGain = this.ctx.createGain();

    // Deck A FX (Beat Delay/Echo)
    this.delayNodeA = this.ctx.createDelay(2.0);
    this.delayNodeA.delayTime.setValueAtTime((60 / this.bpm) * 0.75, this.ctx.currentTime);
    this.delayFeedbackA = this.ctx.createGain();
    this.delayFeedbackA.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.delayNodeA.connect(this.delayFeedbackA);
    this.delayFeedbackA.connect(this.delayNodeA);

    // Wire Deck A
    this.deckASynthBusGain
      .connect(this.deckATrimGain)
      .connect(this.deckAEqLow)
      .connect(this.deckAEqMid)
      .connect(this.deckAEqHigh)
      .connect(this.deckAFilterNode)
      .connect(this.deckAGainNode)
      .connect(this.deckAAnalyser)
      .connect(this.crossfaderGainA);

    // --- DECK B AUDIO GRAPH ---
    this.deckBTrimGain = this.ctx.createGain();
    this.deckBTrimGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.deckBGainNode = this.ctx.createGain();
    this.deckBGainNode.gain.setValueAtTime(0.95, this.ctx.currentTime);

    this.deckBEqLow = this.ctx.createBiquadFilter();
    this.deckBEqLow.type = 'lowshelf';
    this.deckBEqLow.frequency.setValueAtTime(250, this.ctx.currentTime);
    this.deckBEqLow.gain.setValueAtTime(0, this.ctx.currentTime);

    this.deckBEqMid = this.ctx.createBiquadFilter();
    this.deckBEqMid.type = 'peaking';
    this.deckBEqMid.frequency.setValueAtTime(1200, this.ctx.currentTime);
    this.deckBEqMid.Q.setValueAtTime(1.0, this.ctx.currentTime);
    this.deckBEqMid.gain.setValueAtTime(0, this.ctx.currentTime);

    this.deckBEqHigh = this.ctx.createBiquadFilter();
    this.deckBEqHigh.type = 'highshelf';
    this.deckBEqHigh.frequency.setValueAtTime(4500, this.ctx.currentTime);
    this.deckBEqHigh.gain.setValueAtTime(0, this.ctx.currentTime);

    this.deckBFilterNode = this.ctx.createBiquadFilter();
    this.deckBFilterNode.type = 'allpass';
    this.deckBFilterNode.frequency.setValueAtTime(1000, this.ctx.currentTime);

    this.deckBAnalyser = this.ctx.createAnalyser();
    this.deckBAnalyser.fftSize = 256;

    // Vocal Isolator / Acapella Stem Extraction Filter
    this.stemLowCutFilter = this.ctx.createBiquadFilter();
    this.stemLowCutFilter.type = 'highpass';
    this.stemLowCutFilter.frequency.setValueAtTime(280, this.ctx.currentTime); // Cut clashing drums/bass
    this.stemLowCutFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.stemHighCutFilter = this.ctx.createBiquadFilter();
    this.stemHighCutFilter.type = 'lowpass';
    this.stemHighCutFilter.frequency.setValueAtTime(6500, this.ctx.currentTime); // Cut harsh cymbals

    this.stemVocalPresenceFilter = this.ctx.createBiquadFilter();
    this.stemVocalPresenceFilter.type = 'peaking';
    this.stemVocalPresenceFilter.frequency.setValueAtTime(1800, this.ctx.currentTime); // Vocal clarity
    this.stemVocalPresenceFilter.Q.setValueAtTime(1.4, this.ctx.currentTime);
    this.stemVocalPresenceFilter.gain.setValueAtTime(4.0, this.ctx.currentTime);

    this.stemDryGain = this.ctx.createGain();
    this.stemDryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.stemWetGain = this.ctx.createGain();
    this.stemWetGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    // Deck B FX (Beat Delay/Echo)
    this.delayNodeB = this.ctx.createDelay(2.0);
    this.delayNodeB.delayTime.setValueAtTime((60 / this.bpm) * 0.75, this.ctx.currentTime);
    this.delayFeedbackB = this.ctx.createGain();
    this.delayFeedbackB.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.delayNodeB.connect(this.delayFeedbackB);
    this.delayFeedbackB.connect(this.delayNodeB);

    // Connect Stem Branch
    this.stemLowCutFilter
      .connect(this.stemHighCutFilter)
      .connect(this.stemVocalPresenceFilter)
      .connect(this.stemWetGain);

    // Wire Deck B EQs & filters
    this.deckBTrimGain.connect(this.deckBEqLow);
    this.deckBEqLow
      .connect(this.deckBEqMid)
      .connect(this.deckBEqHigh)
      .connect(this.deckBFilterNode)
      .connect(this.deckBGainNode)
      .connect(this.deckBAnalyser)
      .connect(this.crossfaderGainB);

    // Master sum
    this.crossfaderGainA.connect(this.masterCompressor);
    this.crossfaderGainB.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.masterAnalyser);
    this.masterGain.connect(this.mediaDest);
  }

  public async ensureRunning(): Promise<void> {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // --- CROSSFADER ---
  public updateCrossfader(value: number) {
    this.crossfaderVal = Math.max(-1, Math.min(1, value));
    if (!this.ctx) return;
    const x = (this.crossfaderVal + 1) / 2; // 0 to 1
    const gainA = Math.cos(x * 0.5 * Math.PI);
    const gainB = Math.sin(x * 0.5 * Math.PI);
    this.crossfaderGainA.gain.setTargetAtTime(gainA, this.ctx.currentTime, 0.01);
    this.crossfaderGainB.gain.setTargetAtTime(gainB, this.ctx.currentTime, 0.01);
  }

  // --- MASTER & CHANNEL CONTROLS ---
  public setMasterVolume(val: number) {
    if (!this.ctx) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, val)), this.ctx.currentTime, 0.01);
  }

  public setDeckAVolume(val: number) {
    if (!this.ctx) return;
    this.deckAGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1.2, val)), this.ctx.currentTime, 0.01);
  }

  public setDeckBVolume(val: number) {
    if (!this.ctx) return;
    this.deckBGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1.2, val)), this.ctx.currentTime, 0.01);
  }

  public setTrim(deck: 'A' | 'B', db: number) {
    if (!this.ctx) return;
    const gainNode = deck === 'A' ? this.deckATrimGain : this.deckBTrimGain;
    const linear = Math.pow(10, db / 20);
    gainNode.gain.setTargetAtTime(linear, this.ctx.currentTime, 0.02);
  }

  public setMasterBpm(newBpm: number) {
    this.bpm = Math.max(70, Math.min(185, Math.round(newBpm)));
    if (this.isDeckBPlaying) {
      this.updateDeckBPlaybackRate();
    }
    if (this.delayNodeA && this.delayNodeB && this.ctx) {
      const delayTime = (60 / this.bpm) * 0.75;
      this.delayNodeA.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.02);
      this.delayNodeB.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.02);
    }
  }

  // --- 3-BAND EQ & FILTER CONTROLS ---
  public setEq(deck: 'A' | 'B', band: 'low' | 'mid' | 'high', gainDb: number) {
    if (!this.ctx) return;
    const targetEq = deck === 'A'
      ? (band === 'low' ? this.deckAEqLow : band === 'mid' ? this.deckAEqMid : this.deckAEqHigh)
      : (band === 'low' ? this.deckBEqLow : band === 'mid' ? this.deckBEqMid : this.deckBEqHigh);
    targetEq.gain.setTargetAtTime(Math.max(-30, Math.min(12, gainDb)), this.ctx.currentTime, 0.02);
  }

  public setFilter(deck: 'A' | 'B', sweepValue: number) {
    if (!this.ctx) return;
    const filterNode = deck === 'A' ? this.deckAFilterNode : this.deckBFilterNode;
    if (sweepValue < -0.05) {
      filterNode.type = 'lowpass';
      const factor = (sweepValue + 0.05) / -0.95;
      const freq = 12000 * Math.pow(150 / 12000, factor);
      filterNode.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
      filterNode.Q.setTargetAtTime(3.0, this.ctx.currentTime, 0.02);
    } else if (sweepValue > 0.05) {
      filterNode.type = 'highpass';
      const factor = (sweepValue - 0.05) / 0.95;
      const freq = 30 * Math.pow(4000 / 30, factor);
      filterNode.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
      filterNode.Q.setTargetAtTime(3.0, this.ctx.currentTime, 0.02);
    } else {
      filterNode.type = 'allpass';
    }
  }

  // --- VOCAL ISOLATOR / STEM ACAPELLA MODE ---
  public toggleVocalIsolator(active?: boolean): boolean {
    this.isVocalIsolatorActive = active !== undefined ? active : !this.isVocalIsolatorActive;
    if (!this.ctx) return this.isVocalIsolatorActive;

    const now = this.ctx.currentTime;
    if (this.isVocalIsolatorActive) {
      // Engage vocal bandpass and boost
      this.stemDryGain.gain.setTargetAtTime(0.0, now, 0.03);
      this.stemWetGain.gain.setTargetAtTime(1.4, now, 0.03);
    } else {
      // Normal full-spectrum
      this.stemDryGain.gain.setTargetAtTime(1.0, now, 0.03);
      this.stemWetGain.gain.setTargetAtTime(0.0, now, 0.03);
    }
    return this.isVocalIsolatorActive;
  }

  // --- DECK B (UPLOADED AUDIO) CONTROLS ---
  public async loadDeckBAudio(audioBuffer: AudioBuffer, detectedBpm?: number) {
    await this.ensureRunning();
    this.deckBBuffer = audioBuffer;
    this.deckBDuration = audioBuffer.duration;
    if (detectedBpm && detectedBpm > 60 && detectedBpm < 200) {
      this.deckBOriginalBpm = detectedBpm;
    }
    this.deckBPauseOffset = 0;
    this.hotCuesB = [null, null, null, null];
    if (this.isDeckBPlaying) {
      this.stopDeckB();
      this.playDeckB();
    }
  }

  public playDeckB(startOffset?: number) {
    if (!this.deckBBuffer || !this.ctx) return;
    this.stopDeckB();

    const source = this.ctx.createBufferSource();
    source.buffer = this.deckBBuffer;
    source.loop = !this.isLoopActiveB;

    const syncRatio = this.isDeckBSynced ? (this.bpm / this.deckBOriginalBpm) : 1.0;
    const semitoneRatio = Math.pow(2, this.deckBKeyShift / 12);
    const targetRate = syncRatio * this.deckBPitchBend * semitoneRatio;
    source.playbackRate.setValueAtTime(targetRate, this.ctx.currentTime);

    // Route through Vocal Isolator split
    source.connect(this.stemDryGain).connect(this.deckBTrimGain);
    source.connect(this.stemLowCutFilter);
    this.stemWetGain.connect(this.deckBTrimGain);

    const offset = startOffset !== undefined ? startOffset : this.deckBPauseOffset;
    this.deckBStartTime = this.ctx.currentTime - (offset / source.playbackRate.value);
    source.start(0, offset % this.deckBDuration);

    this.deckBSourceNode = source;
    this.isDeckBPlaying = true;
    this.startLoopMonitor();
  }

  public pauseDeckB() {
    if (!this.isDeckBPlaying || !this.ctx) return;
    this.deckBPauseOffset = this.getDeckBCurrentTime();
    this.stopDeckB();
  }

  public stopDeckB() {
    if (this.deckBSourceNode) {
      try {
        this.deckBSourceNode.stop();
        this.deckBSourceNode.disconnect();
      } catch {}
      this.deckBSourceNode = null;
    }
    this.isDeckBPlaying = false;
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval);
      this.loopCheckInterval = null;
    }
  }

  public seekDeckB(timeSec: number) {
    this.deckBPauseOffset = Math.max(0, Math.min(this.deckBDuration, timeSec));
    if (this.isDeckBPlaying) {
      this.playDeckB(this.deckBPauseOffset);
    }
  }

  public getDeckBCurrentTime(): number {
    if (!this.ctx || !this.isDeckBPlaying || !this.deckBSourceNode) {
      return this.deckBPauseOffset;
    }
    const elapsed = (this.ctx.currentTime - this.deckBStartTime) * this.deckBSourceNode.playbackRate.value;
    return this.deckBDuration > 0 ? (elapsed % this.deckBDuration) : 0;
  }

  public updateDeckBPlaybackRate() {
    if (!this.deckBSourceNode || !this.ctx) return;
    const syncRatio = this.isDeckBSynced ? (this.bpm / this.deckBOriginalBpm) : 1.0;
    const semitoneRatio = Math.pow(2, this.deckBKeyShift / 12);
    const targetRate = syncRatio * this.deckBPitchBend * semitoneRatio;
    this.deckBSourceNode.playbackRate.setTargetAtTime(
      Math.max(0.4, Math.min(2.5, targetRate)),
      this.ctx.currentTime,
      0.03
    );
  }

  public setKeyShift(semitones: number) {
    this.deckBKeyShift = Math.max(-6, Math.min(6, semitones));
    this.updateDeckBPlaybackRate();
  }

  // --- HOT CUES (DECK A & DECK B) ---
  public setHotCue(deck: 'A' | 'B', index: number) {
    const currentPos = deck === 'A' ? 0 : this.getDeckBCurrentTime();
    if (deck === 'A') {
      this.hotCuesA[index] = currentPos;
    } else {
      this.hotCuesB[index] = currentPos;
    }
  }

  public jumpHotCue(deck: 'A' | 'B', index: number) {
    const cuePos = deck === 'A' ? this.hotCuesA[index] : this.hotCuesB[index];
    if (cuePos === null || cuePos === undefined) {
      this.setHotCue(deck, index);
      return;
    }

    if (deck === 'B') {
      this.seekDeckB(cuePos);
      if (!this.isDeckBPlaying) this.playDeckB(cuePos);
    } else {
      this.startDeckA();
    }
  }

  public clearHotCue(deck: 'A' | 'B', index: number) {
    if (deck === 'A') this.hotCuesA[index] = null;
    else this.hotCuesB[index] = null;
  }

  // --- AUTO LOOPS & BEAT JUMPS ---
  public setAutoLoop(beats: number) {
    if (!this.isDeckBPlaying || !this.deckBBuffer) return;
    const current = this.getDeckBCurrentTime();
    const beatDuration = 60 / this.bpm;
    const loopLen = beats * beatDuration;

    this.loopBeatsB = beats;
    this.loopStartB = current;
    this.loopEndB = Math.min(this.deckBDuration, current + loopLen);
    this.isLoopActiveB = true;
    this.startLoopMonitor();
  }

  public toggleLoop() {
    this.isLoopActiveB = !this.isLoopActiveB;
    if (this.isLoopActiveB) {
      if (this.loopEndB <= this.loopStartB) {
        this.setAutoLoop(this.loopBeatsB || 4);
      } else {
        this.startLoopMonitor();
      }
    } else {
      if (this.loopCheckInterval) clearInterval(this.loopCheckInterval);
    }
  }

  public halveLoop() {
    if (this.loopBeatsB > 0.5) {
      this.setAutoLoop(this.loopBeatsB / 2);
    }
  }

  public doubleLoop() {
    if (this.loopBeatsB < 32) {
      this.setAutoLoop(this.loopBeatsB * 2);
    }
  }

  private startLoopMonitor() {
    if (this.loopCheckInterval) clearInterval(this.loopCheckInterval);
    if (!this.isLoopActiveB) return;

    this.loopCheckInterval = setInterval(() => {
      if (!this.isLoopActiveB || !this.isDeckBPlaying) {
        clearInterval(this.loopCheckInterval);
        return;
      }
      const nowPos = this.getDeckBCurrentTime();
      if (nowPos >= this.loopEndB) {
        this.seekDeckB(this.loopStartB);
      }
    }, 20);
  }

  public beatJump(beats: number) {
    if (!this.isDeckBPlaying) return;
    const beatSec = 60 / this.bpm;
    const delta = beats * beatSec;
    const current = this.getDeckBCurrentTime();
    this.seekDeckB(Math.max(0, Math.min(this.deckBDuration, current + delta)));
  }

  // --- PERFORMANCE FX: STUTTER & TAPE STOP ---
  public triggerStutter(division: 4 | 8 | 16 | 32, active: boolean) {
    if (!this.ctx || !this.isDeckBPlaying || !this.deckBBuffer) return;

    if (!active) {
      if (this.stutterInterval) clearInterval(this.stutterInterval);
      this.isStuttering = false;
      return;
    }

    this.isStuttering = true;
    const beatSec = 60 / this.bpm;
    const repeatDuration = (beatSec * 4) / division;
    const capturePoint = this.getDeckBCurrentTime();

    if (this.stutterInterval) clearInterval(this.stutterInterval);
    this.stutterInterval = setInterval(() => {
      if (!this.isStuttering || !this.isDeckBPlaying) {
        clearInterval(this.stutterInterval);
        return;
      }
      this.seekDeckB(capturePoint);
    }, repeatDuration * 1000);
  }

  public triggerVinylBrake(duration = 1.0) {
    if (!this.ctx || !this.isDeckBPlaying || !this.deckBSourceNode) return;
    const currentRate = this.deckBSourceNode.playbackRate.value;
    this.deckBSourceNode.playbackRate.cancelScheduledValues(this.ctx.currentTime);
    this.deckBSourceNode.playbackRate.setValueAtTime(currentRate, this.ctx.currentTime);
    this.deckBSourceNode.playbackRate.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    setTimeout(() => {
      this.pauseDeckB();
      if (this.deckBSourceNode) {
        this.updateDeckBPlaybackRate();
      }
    }, duration * 1000);
  }

  // --- INTERACTIVE TURNTABLE SCRATCH ---
  public handleScratch(deltaVelocity: number) {
    if (!this.ctx) return;
    this.ensureRunning();

    const now = this.ctx.currentTime;
    const scratchRate = deltaVelocity * 3.5;

    if (this.deckBSourceNode) {
      this.deckBSourceNode.playbackRate.cancelScheduledValues(now);
      this.deckBSourceNode.playbackRate.setTargetAtTime(
        Math.max(-2.5, Math.min(3.5, scratchRate)),
        now,
        0.015
      );
    }

    if (Math.abs(deltaVelocity) > 0.05) {
      this.synthesizeScratchClick(Math.abs(deltaVelocity));
    }
  }

  public endScratch() {
    this.isScratching = false;
    if (this.isDeckBPlaying) {
      this.updateDeckBPlaybackRate();
    }
  }

  private synthesizeScratchClick(intensity: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300 + intensity * 600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.04);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    gain.gain.setValueAtTime(Math.min(0.3, intensity * 0.2), this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(filter).connect(gain).connect(this.masterCompressor);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.045);
  }

  // --- MULTI-FX PROCESSOR ---
  public setFx(deck: 'A' | 'B', type: FXType, wet: number) {
    if (deck === 'A') {
      this.fxTypeA = type;
      this.fxWetA = Math.max(0, Math.min(1, wet));
      if (this.delayFeedbackA && this.ctx) {
        this.delayFeedbackA.gain.setTargetAtTime(type === 'echo' ? this.fxWetA * 0.7 : 0, this.ctx.currentTime, 0.02);
      }
    } else {
      this.fxTypeB = type;
      this.fxWetB = Math.max(0, Math.min(1, wet));
      if (this.delayFeedbackB && this.ctx) {
        this.delayFeedbackB.gain.setTargetAtTime(type === 'echo' ? this.fxWetB * 0.7 : 0, this.ctx.currentTime, 0.02);
      }
    }
  }

  // --- DECK A: AI DJ SEQUENCER & SYNTHESIS ---
  public setPlan(plan: DJTrackPlan) {
    this.currentPlan = plan;
    this.bpm = plan.bpm || this.bpm;
    if (this.isDeckBPlaying) {
      this.updateDeckBPlaybackRate();
    }
  }

  public startDeckA() {
    this.ensureRunning();
    if (this.isDeckAPlaying) return;
    this.isDeckAPlaying = true;
    this.current16thStep = 0;
    this.nextStepTime = this.ctx ? this.ctx.currentTime : 0;
    this.scheduler();
  }

  public stopDeckA() {
    this.isDeckAPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduler = () => {
    if (!this.isDeckAPlaying || !this.ctx) return;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.current16thStep, this.nextStepTime);
      this.advanceStep();
    }
    this.timerId = setTimeout(this.scheduler, this.lookaheadMs);
  };

  private advanceStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPer16th = secondsPerBeat / 4.0;
    this.nextStepTime += secondsPer16th;
    this.current16thStep = (this.current16thStep + 1) % 16;
  }

  private scheduleStep(step: number, time: number) {
    if (!this.ctx || !this.currentPlan) return;
    const pattern = this.currentPlan.drumPattern;

    const isKick = pattern?.kick?.[step] === 1;
    const isSnare = pattern?.snare?.[step] === 1;
    const isClap = pattern?.clap?.[step] === 1;
    const isHiHat = pattern?.hihat?.[step] === 1;
    const isPerc = pattern?.percussion?.[step] === 1;

    if (isKick) {
      this.playKick(time, this.isJedagJedugBoost);
    }
    if (isSnare) {
      this.playSnare(time);
    }
    if (isClap) {
      this.playClap(time);
    }
    if (isHiHat) {
      this.playHiHat(time, step % 4 === 2);
    }
    if (isPerc) {
      // Check if it's Koplo/Jedag kendang groove
      if (this.currentPlan.genre.includes('Koplo') || this.currentPlan.genre.includes('Kendang')) {
        this.playKendangTakTung(time, step % 2 === 0);
      } else {
        this.playPerc(time);
      }
    }

    // Melodic Synth Voice
    const melodyFreq = this.currentPlan.melodyNotes?.[step];
    if (melodyFreq && melodyFreq > 50) {
      this.playLeadSynth(time, melodyFreq, (60 / this.bpm) / 4);
    }

    // Bassline Synth Voice
    const bassFreq = this.currentPlan.basslineNotes?.[step];
    if (bassFreq && bassFreq > 30) {
      this.playBassline(time, bassFreq, (60 / this.bpm) / 4);
    }
  }

  // --- SOUND SYNTHESIS ENGINES ---

  // 1. Heavy 808 / Jedag Jedug Sub Kick
  private playKick(time: number, jedagBoost: boolean) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (this.currentPlan) {
      const duckAmt = jedagBoost ? 0.85 : 0.6;
      this.deckASynthBusGain.gain.cancelScheduledValues(time);
      this.deckASynthBusGain.gain.setValueAtTime(1.0 - duckAmt, time);
      this.deckASynthBusGain.gain.exponentialRampToValueAtTime(1.0, time + 0.18);
    }

    osc.type = 'sine';
    const startPitch = jedagBoost ? 170 : 130;
    const endPitch = jedagBoost ? 36 : 45;

    osc.frequency.setValueAtTime(startPitch, time);
    osc.frequency.exponentialRampToValueAtTime(endPitch, time + 0.08);

    const kickVolume = jedagBoost ? 1.3 : 1.0;
    gain.gain.setValueAtTime(kickVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (jedagBoost ? 0.4 : 0.28));

    // Punch transient click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(450, time);
    clickOsc.frequency.exponentialRampToValueAtTime(60, time + 0.015);
    clickGain.gain.setValueAtTime(0.4, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    clickOsc.connect(clickGain).connect(this.deckASynthBusGain);
    clickOsc.start(time);
    clickOsc.stop(time + 0.025);

    osc.connect(gain).connect(this.deckASynthBusGain);
    osc.start(time);
    osc.stop(time + 0.42);
  }

  // 2. Snare / Rimshot
  private playSnare(time: number) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(900, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    noise.connect(noiseFilter).connect(noiseGain).connect(this.deckASynthBusGain);
    noise.start(time);
    noise.stop(time + 0.15);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.08);
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    osc.connect(gain).connect(this.deckASynthBusGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  // 3. Electro Clap
  private playClap(time: number) {
    if (!this.ctx) return;
    const clapTimes = [0, 0.012, 0.024];
    clapTimes.forEach((delay, idx) => {
      const bufferSize = this.ctx!.sampleRate * 0.06;
      const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, time + delay);
      filter.Q.setValueAtTime(3.0, time + delay);

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(idx === 2 ? 0.45 : 0.25, time + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, time + delay + (idx === 2 ? 0.15 : 0.03));

      src.connect(filter).connect(gain).connect(this.deckASynthBusGain);
      src.start(time + delay);
      src.stop(time + delay + 0.16);
    });
  }

  // 4. Hi-Hat
  private playHiHat(time: number, isOpen: boolean) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * (isOpen ? 0.18 : 0.04);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isOpen ? 0.28 : 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (isOpen ? 0.16 : 0.035));

    src.connect(filter).connect(gain).connect(this.deckASynthBusGain);
    src.start(time);
    src.stop(time + (isOpen ? 0.18 : 0.04));
  }

  // 5. Percussion / Funkot Donk
  private playPerc(time: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, time);
    osc.frequency.exponentialRampToValueAtTime(140, time + 0.04);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain).connect(this.deckASynthBusGain);
    osc.start(time);
    osc.stop(time + 0.055);
  }

  // 5b. Authentic Indonesian Kendang (Tak & Tung)
  private playKendangTakTung(time: number, isTak: boolean) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isTak) {
      // Kendang "Tak" - High crisp slap
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, time);
      osc.frequency.exponentialRampToValueAtTime(180, time + 0.035);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
    } else {
      // Kendang "Tung" - Round deep acoustic resonance
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, time);
      osc.frequency.exponentialRampToValueAtTime(85, time + 0.12);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    }

    osc.connect(gain).connect(this.deckASynthBusGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  // 6. Lead Melodic Synth
  private playLeadSynth(time: number, freq: number, duration: number) {
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.006, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, time);
    filter.frequency.exponentialRampToValueAtTime(800, time + duration);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.95);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.deckASynthBusGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }

  // 7. Bassline Synth
  private playBassline(time: number, freq: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, time);
    filter.Q.setValueAtTime(2.0, time);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.9);

    osc.connect(filter).connect(gain).connect(this.deckASynthBusGain);
    osc.start(time);
    osc.stop(time + duration);
  }

  // --- SOUNDBOARD FX ---
  public triggerAirhorn() {
    this.ensureRunning();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const hornFrequencies = [466.16, 554.37, 622.25, 740];

    for (let blast = 0; blast < 3; blast++) {
      const blastTime = now + blast * 0.16;
      hornFrequencies.forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, blastTime);
        osc.frequency.linearRampToValueAtTime(freq * 1.02, blastTime + 0.12);

        gain.gain.setValueAtTime(0.12, blastTime);
        gain.gain.exponentialRampToValueAtTime(0.001, blastTime + 0.13);

        osc.connect(gain).connect(this.masterCompressor);
        osc.start(blastTime);
        osc.stop(blastTime + 0.14);
      });
    }
  }

  public triggerSiren() {
    this.ensureRunning();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(950, now + 0.6);
    osc.frequency.linearRampToValueAtTime(400, now + 1.2);
    osc.frequency.linearRampToValueAtTime(1100, now + 1.8);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

    osc.connect(gain).connect(this.masterCompressor);
    osc.start(now);
    osc.stop(now + 2.3);
  }

  public triggerLaser() {
    this.ensureRunning();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc.connect(gain).connect(this.masterCompressor);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public triggerSubBoom() {
    this.ensureRunning();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 1.2);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc.connect(gain).connect(this.masterCompressor);
    osc.start(now);
    osc.stop(now + 1.6);
  }

  public triggerVinylSpinback() {
    this.ensureRunning();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(4500, now + 0.4);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.8);
    filter.Q.setValueAtTime(5.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    noise.connect(filter).connect(gain).connect(this.masterCompressor);
    noise.start(now);
    noise.stop(now + 0.9);
  }

  public setVoiceDropAudio(audioBuffer: AudioBuffer) {
    this.voiceDropBuffer = audioBuffer;
  }

  public triggerVoiceDrop() {
    this.ensureRunning();
    if (!this.ctx || !this.voiceDropBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.voiceDropBuffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.1, this.ctx.currentTime);

    src.connect(gain).connect(this.masterCompressor);
    src.start();
  }

  // --- ANGGUK-ANGGUK DROP FEATURE ---
  public async preloadAnggukAudio(): Promise<boolean> {
    try {
      await this.ensureRunning();
      if (!this.ctx) return false;
      if (this.anggukBuffer) return true;

      // Try local cached audio endpoint first, then direct file
      const res = await fetch('/api/dj/angguk-audio').catch(() => fetch('/audio/angguk-angguk.mp3'));
      if (!res.ok) throw new Error('Failed to fetch angguk audio');
      const arrayBuffer = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arrayBuffer);
      this.anggukBuffer = decoded;
      this.anggukDuration = decoded.duration;
      return true;
    } catch (err) {
      console.warn('Could not preload angguk audio from network, creating procedural drop backup:', err);
      // Create high-energy procedural fallback if network fails
      if (this.ctx) {
        this.anggukBuffer = this.createFallbackAnggukBuffer();
        this.anggukDuration = this.anggukBuffer.duration;
        return true;
      }
      return false;
    }
  }

  public async triggerAnggukAngguk(
    onStart?: (duration: number) => void,
    onEnd?: () => void
  ): Promise<void> {
    await this.ensureRunning();
    if (!this.ctx) return;

    // If already playing, cancel immediately and resume
    if (this.isAnggukPlaying) {
      this.cancelAnggukAngguk(onEnd);
      return;
    }

    if (!this.anggukBuffer) {
      await this.preloadAnggukAudio();
    }

    if (!this.anggukBuffer) {
      console.warn('Angguk buffer still unavailable');
      return;
    }

    this.isAnggukPlaying = true;
    const wasDeckAPlaying = this.isDeckAPlaying;
    const wasDeckBPlaying = this.isDeckBPlaying;
    const savedDeckBTime = this.getDeckBCurrentTime();
    const dropDuration = this.anggukBuffer.duration;
    this.anggukDuration = dropDuration;

    this.anggukSavedState = {
      wasDeckAPlaying,
      wasDeckBPlaying,
      savedDeckBTime,
      startTime: this.ctx.currentTime,
    };

    // 1. Immediately pause/stop current music on both decks
    if (wasDeckAPlaying) {
      this.stopDeckA();
    }
    if (wasDeckBPlaying) {
      this.pauseDeckB();
    }

    // 2. Play the Angguk-Angguk audio clip
    const src = this.ctx.createBufferSource();
    src.buffer = this.anggukBuffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.2, this.ctx.currentTime);
    src.connect(gain).connect(this.masterCompressor);
    src.start();
    this.anggukSourceNode = src;

    if (onStart) onStart(dropDuration);

    // 3. Exactly when the angguk audio ends (e.g. 3.4 seconds), resume song with the elapsed time skipped!
    if (this.anggukTimeoutId) clearTimeout(this.anggukTimeoutId);
    this.anggukTimeoutId = setTimeout(() => {
      if (!this.isAnggukPlaying) return;
      this.isAnggukPlaying = false;
      this.anggukSourceNode = null;

      // Resume Deck B: Advance time by dropDuration so the song continues seamlessly as if 3 seconds were cut
      if (wasDeckBPlaying && this.deckBBuffer && this.deckBDuration > 0) {
        const newPos = (savedDeckBTime + dropDuration) % this.deckBDuration;
        this.seekDeckB(newPos);
        this.playDeckB(newPos);
      }

      // Resume Deck A (AI DJ Beat)
      if (wasDeckAPlaying) {
        this.startDeckA();
      }

      if (onEnd) onEnd();
    }, dropDuration * 1000);
  }

  public cancelAnggukAngguk(onEnd?: () => void) {
    if (!this.isAnggukPlaying || !this.ctx) return;
    if (this.anggukTimeoutId) clearTimeout(this.anggukTimeoutId);
    if (this.anggukSourceNode) {
      try {
        this.anggukSourceNode.stop();
        this.anggukSourceNode.disconnect();
      } catch {}
      this.anggukSourceNode = null;
    }

    const elapsed = this.anggukSavedState ? this.ctx.currentTime - this.anggukSavedState.startTime : 0;
    const wasDeckAPlaying = this.anggukSavedState?.wasDeckAPlaying ?? false;
    const wasDeckBPlaying = this.anggukSavedState?.wasDeckBPlaying ?? false;
    const savedDeckBTime = this.anggukSavedState?.savedDeckBTime ?? 0;

    this.isAnggukPlaying = false;
    this.anggukSavedState = null;

    if (wasDeckBPlaying && this.deckBBuffer && this.deckBDuration > 0) {
      const newPos = (savedDeckBTime + elapsed) % this.deckBDuration;
      this.seekDeckB(newPos);
      this.playDeckB(newPos);
    }
    if (wasDeckAPlaying) {
      this.startDeckA();
    }

    if (onEnd) onEnd();
  }

  private createFallbackAnggukBuffer(): AudioBuffer {
    const sampleRate = this.ctx?.sampleRate || 44100;
    const duration = 3.0; // 3 seconds fallback
    const buffer = this.ctx!.createBuffer(2, sampleRate * duration, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < left.length; i++) {
      const t = i / sampleRate;
      // Synthesize high-energy club vocal chop chant: "Angguk-angguk, geleng-geleng!"
      const beat = (t / 0.25) % 1;
      const kick = Math.sin(2 * Math.PI * (140 - t * 40) * t) * Math.exp(-beat * 8);
      const siren = Math.sin(2 * Math.PI * (600 + Math.sin(t * 15) * 200) * t) * 0.2;
      const val = Math.max(-1, Math.min(1, (kick * 0.6 + siren * 0.4)));
      left[i] = val;
      right[i] = val;
    }
    return buffer;
  }

  // --- LIVE RECORDING ---
  public startRecording(): boolean {
    if (!this.ctx) this.init();
    if (!this.mediaDest) return false;

    this.recordedChunks = [];
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    let supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaDest.stream, supportedMime ? { mimeType: supportedMime } : {});
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      this.mediaRecorder.start(250);
      return true;
    } catch (err) {
      console.error('MediaRecorder start failed:', err);
      return false;
    }
  }

  public stopRecording(): Blob | null {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return null;
    this.mediaRecorder.stop();
    const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
    this.mediaRecorder = null;
    return blob;
  }
}

export const djEngine = new DJEngine();
