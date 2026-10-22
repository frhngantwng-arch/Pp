import React, { useState, useEffect, useRef } from 'react';
import {
  Disc,
  Upload,
  Sparkles,
  Music,
  Radio,
  Flame,
  Download,
  CheckCircle2,
  Sliders,
  Volume2,
  RefreshCw,
  FolderOpen,
  Headphones,
  Mic,
} from 'lucide-react';
import { djEngine, DJTrackPlan } from './audio/DJEngine';
import { estimateBPMFromAudioBuffer } from './utils/beatDetector';
import { SAMPLE_SONGS } from './utils/sampleTracks';
import { TurntableDeck } from './components/TurntableDeck';
import { WaveformDisplay } from './components/WaveformDisplay';
import { StepSequencerView } from './components/StepSequencerView';
import { CenterMixer } from './components/CenterMixer';
import { AIAssistantModal } from './components/AIAssistantModal';

export default function App() {
  // Master Engine State
  const [bpm, setBpm] = useState(138);
  const [crossfader, setCrossfader] = useState(0);
  const [jedagBoost, setJedagBoost] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [activeView, setActiveView] = useState<'mixer' | 'sequencer' | 'guide'>('mixer');

  // Deck A (AI DJ Beat) State
  const [deckAPlaying, setDeckAPlaying] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<DJTrackPlan | null>(null);
  const [deckAPitchBend, setDeckAPitchBend] = useState(1.0);

  // Deck B (Uploaded Song) State
  const [deckBPlaying, setDeckBPlaying] = useState(false);
  const [uploadedTrackName, setUploadedTrackName] = useState<string>('Midnight Melodi (Vocal Demo)');
  const [deckBDuration, setDeckBDuration] = useState(0);
  const [deckBBuffer, setDeckBBuffer] = useState<AudioBuffer | null>(null);
  const [deckBDetectedBpm, setDeckBDetectedBpm] = useState<number>(130);
  const [deckBPitchBend, setDeckBPitchBend] = useState(1.0);
  const [deckBKeyShift, setDeckBKeyShift] = useState(0);
  const [isVocalIsolatorActive, setIsVocalIsolatorActive] = useState(false);
  const [isSyncActive, setIsSyncActive] = useState(true);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);

  // Angguk-Angguk Drop State
  const [isAnggukPlaying, setIsAnggukPlaying] = useState(false);
  const [anggukDuration, setAnggukDuration] = useState(3.4);

  // Modals & Panels
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [transitionStatus, setTransitionStatus] = useState<string | null>(null);

  // Hidden File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize DJ Engine with default Jedag-Jedug plan & load demo song
  useEffect(() => {
    fetch('/api/dj/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre: 'jedag_jedug' }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.plan) {
          setCurrentPlan(data.plan);
          setBpm(data.plan.bpm || 138);
          djEngine.setPlan(data.plan);
        }
      })
      .catch((err) => console.error('Failed to load initial DJ plan:', err));

    const loadDefaultDemo = async () => {
      djEngine.init();
      if (djEngine.ctx) {
        const demo = SAMPLE_SONGS[0];
        const buffer = demo.generate(djEngine.ctx);
        setDeckBBuffer(buffer);
        setDeckBDuration(buffer.duration);
        setUploadedTrackName(demo.name);
        setDeckBDetectedBpm(demo.bpm);
        await djEngine.loadDeckBAudio(buffer, demo.bpm);
      }
      djEngine.preloadAnggukAudio().catch(() => {});
    };

    loadDefaultDemo();
  }, []);

  // Recording timer
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Master BPM change
  const handleBpmChange = (newBpm: number) => {
    setBpm(newBpm);
    djEngine.setMasterBpm(newBpm);
  };

  // Crossfader change
  const handleCrossfaderChange = (val: number) => {
    setCrossfader(val);
    djEngine.updateCrossfader(val);
  };

  // Toggle Jedag Jedug 808 Boost
  const handleToggleJedagBoost = () => {
    const next = !jedagBoost;
    setJedagBoost(next);
    djEngine.isJedagJedugBoost = next;
  };

  // Deck A Play / Pause
  const handleToggleDeckA = async () => {
    await djEngine.ensureRunning();
    if (deckAPlaying) {
      djEngine.stopDeckA();
      setDeckAPlaying(false);
    } else {
      djEngine.startDeckA();
      setDeckAPlaying(true);
    }
  };

  const handleCueDeckA = () => {
    djEngine.stopDeckA();
    setDeckAPlaying(false);
  };

  // Deck B Play / Pause
  const handleToggleDeckB = async () => {
    await djEngine.ensureRunning();
    if (deckBPlaying) {
      djEngine.pauseDeckB();
      setDeckBPlaying(false);
    } else {
      djEngine.playDeckB();
      setDeckBPlaying(true);
    }
  };

  const handleCueDeckB = () => {
    djEngine.stopDeckB();
    djEngine.seekDeckB(0);
    setDeckBPlaying(false);
  };

  const handleDeckBSeek = (timeSec: number) => {
    djEngine.seekDeckB(timeSec);
  };

  const handleDeckBPitchChange = (pitch: number) => {
    setDeckBPitchBend(pitch);
    djEngine.deckBPitchBend = pitch;
    djEngine.updateDeckBPlaybackRate();
  };

  const handleDeckBKeyShiftChange = (semitones: number) => {
    setDeckBKeyShift(semitones);
    djEngine.setKeyShift(semitones);
  };

  const handleToggleVocalIsolator = () => {
    const active = djEngine.toggleVocalIsolator();
    setIsVocalIsolatorActive(active);
    setTransitionStatus(
      active
        ? 'Acapella Vocal Isolator Aktif: Drum & Bass lagu dipotong agar menyatu dengan beat DJ!'
        : 'Vocal Isolator Nonaktif: Lagu dimainkan normal full-range.'
    );
    setTimeout(() => setTransitionStatus(null), 4000);
  };

  const handleToggleSync = () => {
    const next = !isSyncActive;
    setIsSyncActive(next);
    djEngine.isDeckBSynced = next;
    djEngine.updateDeckBPlaybackRate();
  };

  // Load song to Deck B (called by file upload or AI Generator modal)
  const handleLoadSongToDeckB = async (buffer: AudioBuffer, title: string, detectedBpm: number) => {
    setDeckBBuffer(buffer);
    setDeckBDuration(buffer.duration);
    setUploadedTrackName(title);
    setDeckBDetectedBpm(detectedBpm);
    await djEngine.loadDeckBAudio(buffer, detectedBpm);
  };

  // Handle User File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingAudio(true);
    try {
      await djEngine.ensureRunning();
      if (!djEngine.ctx) return;

      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await djEngine.ctx.decodeAudioData(arrayBuffer);
      const detectedBpm = estimateBPMFromAudioBuffer(decodedBuffer);
      const title = file.name.replace(/\.[^/.]+$/, '');

      await handleLoadSongToDeckB(decodedBuffer, title, detectedBpm);

      // Analyze track with Gemini in background for mashup advice
      fetch('/api/dj/analyze-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          estimatedBpm: detectedBpm,
          duration: decodedBuffer.duration,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.analysis) {
            setTransitionStatus(
              `AI Advice: ${data.analysis.eqTips || 'Gunakan Vocal Isolator atau Bass Kill saat drop.'}`
            );
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error('Error decoding audio:', err);
      alert('Gagal membaca file audio. Pastikan format file adalah MP3, WAV, AAC, atau OGG.');
    } finally {
      setIsDecodingAudio(false);
    }
  };

  // Load a demo track
  const handleSelectDemoTrack = async (demoId: string) => {
    const demo = SAMPLE_SONGS.find((s) => s.id === demoId);
    if (!demo) return;
    await djEngine.ensureRunning();
    if (!djEngine.ctx) return;

    const buffer = demo.generate(djEngine.ctx);
    await handleLoadSongToDeckB(buffer, demo.name, demo.bpm);
  };

  // Apply new DJ Plan from AI Modal
  const handleApplyPlan = (plan: DJTrackPlan) => {
    setCurrentPlan(plan);
    setBpm(plan.bpm || bpm);
    djEngine.setPlan(plan);
  };

  // Quick Preset switch
  const handleSelectPreset = async (genreKey: string) => {
    try {
      const res = await fetch('/api/dj/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: genreKey,
          songTitle: uploadedTrackName,
          bpm,
        }),
      });
      const data = await res.json();
      if (data.plan) {
        handleApplyPlan(data.plan);
      }
    } catch (err) {
      console.error('Failed to change preset:', err);
    }
  };

  // Live Mix Recording Toggle
  const handleToggleRecording = () => {
    if (!isRecording) {
      const started = djEngine.startRecording();
      if (started) {
        setIsRecording(true);
      } else {
        alert('Browser tidak mendukung MediaRecorder untuk Web Audio stream.');
      }
    } else {
      const blob = djEngine.stopRecording();
      setIsRecording(false);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DJ_Remix_${new Date().toISOString().slice(0, 10)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  // Automated Mashup Transition Sequence
  const handleAutoMashupTransition = async () => {
    await djEngine.ensureRunning();
    setTransitionStatus('Build-up: Menyapu filter lagu & mengaktifkan roll tension...');

    if (!deckAPlaying) {
      djEngine.startDeckA();
      setDeckAPlaying(true);
    }
    if (!deckBPlaying) {
      djEngine.playDeckB();
      setDeckBPlaying(true);
    }

    // High-pass filter sweep on Deck B over 3 seconds
    let sweep = 0;
    const sweepInterval = setInterval(() => {
      sweep += 0.15;
      if (sweep <= 0.85) {
        djEngine.setFilter('B', sweep);
      } else {
        clearInterval(sweepInterval);
      }
    }, 150);

    // Stutter roll tension at 2.4s
    setTimeout(() => {
      setTransitionStatus('Roll Tension: 1/8 Stutter roll aktif...');
      djEngine.triggerStutter(8, true);
    }, 2400);

    // THE DROP at 4.0s!
    setTimeout(() => {
      djEngine.triggerStutter(8, false);
      djEngine.setFilter('B', 0);
      djEngine.setEq('B', 'low', -24); // Cut bass on Deck B so AI 808 hits hard!
      handleCrossfaderChange(0); // Center crossfader

      if (djEngine.voiceDropBuffer) {
        djEngine.triggerVoiceDrop();
      } else {
        djEngine.triggerAirhorn();
        djEngine.triggerSubBoom();
      }

      setTransitionStatus('DROP! Jedag Jedug Sub 808 meledak bersama vokal lagu!');
      setTimeout(() => setTransitionStatus(null), 5000);
    }, 4000);
  };

  // Angguk-Angguk Drop Trigger: Immediately pauses music, plays 3s drop audio, then automatically resumes with 3s elapsed
  const handleTriggerAngguk = async () => {
    await djEngine.ensureRunning();
    if (isAnggukPlaying) {
      djEngine.cancelAnggukAngguk(() => {
        setIsAnggukPlaying(false);
        setDeckAPlaying(djEngine.isDeckAPlaying);
        setDeckBPlaying(djEngine.isDeckBPlaying);
        setTransitionStatus(null);
      });
      return;
    }

    setIsAnggukPlaying(true);
    setTransitionStatus('🕺 ANGGUK-ANGGUK DROP! Lagu dipotong & di-pause...');

    await djEngine.triggerAnggukAngguk(
      (dur) => {
        setAnggukDuration(dur);
        setDeckAPlaying(false);
        setDeckBPlaying(false);
      },
      () => {
        setIsAnggukPlaying(false);
        setDeckAPlaying(djEngine.isDeckAPlaying);
        setDeckBPlaying(djEngine.isDeckBPlaying);
        setTransitionStatus('⚡ Selesai! Lagu otomatis hidup kembali (terpotong 3 detik).');
        setTimeout(() => setTransitionStatus(null), 4000);
      }
    );
  };

  const formatRecordingTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* Hidden Audio File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Bar Contract (Brand Zone - Nav Links - Primary Action) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-neutral-950 shadow-md shadow-amber-500/20">
            <Disc className="w-5 h-5 animate-spin-slow" />
          </div>
          <span className="text-base font-bold tracking-tight text-neutral-100">
            DJ MixStudio AI
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-neutral-400">
          <button
            type="button"
            onClick={() => setActiveView('mixer')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'mixer' ? 'text-amber-400' : 'hover:text-neutral-200'
            }`}
          >
            Meja DJ Console
          </button>
          <button
            type="button"
            onClick={() => setActiveView('sequencer')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'sequencer' ? 'text-amber-400' : 'hover:text-neutral-200'
            }`}
          >
            Drum Sequencer
          </button>
          <button
            type="button"
            onClick={() => setActiveView('guide')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'guide' ? 'text-amber-400' : 'hover:text-neutral-200'
            }`}
          >
            Tips Remix Lagu
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleToggleRecording}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              isRecording
                ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {isRecording ? `REC (${formatRecordingTime(recordingSeconds)})` : 'Record Mix'}
          </button>

          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-bold text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-all cursor-pointer shadow-md shadow-amber-500/20 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Remix Generator
          </button>
        </div>
      </header>

      {/* Hero Strip / Track Status Banner */}
      <div className="border-b border-neutral-800/60 bg-neutral-900/40 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Deck A Status */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-amber-400 font-bold">DECK A (AI Beat DJ):</span>
            <span className="text-neutral-200 truncate max-w-xs font-medium">
              {currentPlan?.title || 'Jedag Jedug Mengkane'}
            </span>
            <span className="text-neutral-500 font-mono-numbers">· {bpm} BPM</span>
          </div>

          {/* Angguk-Angguk Active Banner */}
          {isAnggukPlaying && (
            <div className="bg-rose-500/20 border border-rose-500/60 text-rose-200 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse">
              <span className="text-base animate-bounce">🕺</span>
              <span>ANGGUK-ANGGUK DROP ({anggukDuration.toFixed(1)}s): Lagu dipause & otomatis lanjut 3s ke depan!</span>
            </div>
          )}

          {/* Transition Feedback Alert */}
          {!isAnggukPlaying && transitionStatus && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 py-1 rounded-lg text-xs font-medium animate-pulse">
              {transitionStatus}
            </div>
          )}

          {/* Deck B Status */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-cyan-400 font-bold">DECK B (Lagu Anda):</span>
            <span className="text-neutral-200 truncate max-w-xs font-medium">
              {uploadedTrackName}
            </span>
            <span className="text-neutral-500 font-mono-numbers">· {deckBDetectedBpm} BPM</span>
            <button
              type="button"
              onClick={() => setIsAiModalOpen(true)}
              className="text-amber-400 hover:underline font-semibold ml-1 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              Remix Lagu Ini dengan AI
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeView === 'mixer' && (
          <div className="space-y-6">
            {/* Top DJ Quick Presets & Upload Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 p-3 rounded-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-neutral-400">DJ Style:</span>
                {[
                  { key: 'jedag_jedug', label: 'Jedag Jedug' },
                  { key: 'koplo_kendang', label: 'Koplo Kendang' },
                  { key: 'funkot_breakbeat', label: 'Funkot Kota' },
                  { key: 'slow_bass_santai', label: 'Slow Bass' },
                  { key: 'club_edm', label: 'Festival EDM' },
                  { key: 'cyber_club', label: 'Cyber Phonk' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectPreset(item.key)}
                    className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-amber-500 active:text-neutral-950 text-xs text-neutral-200 font-medium transition-colors cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Upload Song Action Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDecodingAudio}
                  className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-cyan-600/20"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isDecodingAudio ? 'Memuat Lagu...' : 'Upload Lagu (MP3/WAV)'}
                </button>
              </div>
            </div>

            {/* DUAL DECK STAGE + CENTER MIXER */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* DECK A: AI DJ Beat Generator */}
              <div className="lg:col-span-5 flex flex-col">
                <TurntableDeck
                  deckId="A"
                  title={currentPlan?.title || 'Jedag Jedug DJ Beat'}
                  subtitle={currentPlan?.genre || 'AI Electronic Synthesizer'}
                  isPlaying={deckAPlaying}
                  onPlayPause={handleToggleDeckA}
                  onCue={handleCueDeckA}
                  bpm={bpm}
                  pitchBend={deckAPitchBend}
                  onPitchBendChange={setDeckAPitchBend}
                  accentColor="amber"
                />
              </div>

              {/* CENTER CONSOLE: VU Meters, Scrolling Phase Meter, Crossfader, FX */}
              <div className="lg:col-span-2 flex flex-col">
                <CenterMixer
                  bpm={bpm}
                  onBpmChange={handleBpmChange}
                  crossfader={crossfader}
                  onCrossfaderChange={handleCrossfaderChange}
                  jedagBoost={jedagBoost}
                  onToggleJedagBoost={handleToggleJedagBoost}
                  hasVoiceDrop={Boolean(djEngine.voiceDropBuffer)}
                  onOpenVoiceDropModal={() => setIsAiModalOpen(true)}
                  onAutoMashupTransition={handleAutoMashupTransition}
                  isDeckAPlaying={deckAPlaying}
                  isDeckBPlaying={deckBPlaying}
                  isAnggukPlaying={isAnggukPlaying}
                  onTriggerAngguk={handleTriggerAngguk}
                  anggukDuration={anggukDuration}
                />
              </div>

              {/* DECK B: Uploaded Song Deck with Hot Cues & Vocal Isolator */}
              <div className="lg:col-span-5 flex flex-col space-y-3">
                <TurntableDeck
                  deckId="B"
                  title={uploadedTrackName}
                  subtitle={isSyncActive ? `BPM Synced (${bpm})` : `Original ${deckBDetectedBpm} BPM`}
                  isPlaying={deckBPlaying}
                  onPlayPause={handleToggleDeckB}
                  onCue={handleCueDeckB}
                  bpm={isSyncActive ? bpm : deckBDetectedBpm}
                  pitchBend={deckBPitchBend}
                  onPitchBendChange={handleDeckBPitchChange}
                  accentColor="cyan"
                  isVocalIsolatorActive={isVocalIsolatorActive}
                  onToggleVocalIsolator={handleToggleVocalIsolator}
                  keyShift={deckBKeyShift}
                  onKeyShiftChange={handleDeckBKeyShiftChange}
                />

                {/* Deck B Sync Toggle & Demo Song Picker */}
                <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-2.5 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={handleToggleSync}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      isSyncActive
                        ? 'bg-cyan-500 text-neutral-950 shadow-sm'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    SYNC TEMPO: {isSyncActive ? 'ON' : 'OFF'}
                  </button>

                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                    <span>Lagu Demo:</span>
                    {SAMPLE_SONGS.map((demo) => (
                      <button
                        key={demo.id}
                        type="button"
                        onClick={() => handleSelectDemoTrack(demo.id)}
                        className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors cursor-pointer"
                      >
                        {demo.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* WAVEFORM & STEP SEQUENCER STRIP */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Deck A 16-Step Drum Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                  <span className="font-semibold text-amber-400">Deck A · Beat Sequencer & Kendang</span>
                  <span>Drum Matrix</span>
                </div>
                {currentPlan && (
                  <StepSequencerView
                    pattern={currentPlan.drumPattern}
                    onPatternChange={(newPattern) => {
                      const updated = { ...currentPlan, drumPattern: newPattern };
                      setCurrentPlan(updated);
                      djEngine.setPlan(updated);
                    }}
                    isPlaying={deckAPlaying}
                    bpm={bpm}
                  />
                )}
              </div>

              {/* Deck B Waveform & Scrub Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                  <span className="font-semibold text-cyan-400">Deck B · Waveform Audio & Drop Point</span>
                  <span>Scrub Playhead</span>
                </div>
                <WaveformDisplay
                  buffer={deckBBuffer}
                  isPlaying={deckBPlaying}
                  onSeek={handleDeckBSeek}
                  accentColor="cyan"
                  dropTiming={currentPlan?.dropTimingSeconds || 15}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP SEQUENCER EXPANDED VIEW */}
        {activeView === 'sequencer' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-100">
                  Drum Machine & Kendang Step Sequencer
                </h3>
                <p className="text-xs text-neutral-400">
                  Sequencer audio sintetis untuk Deck A dengan 808 Sub kick, acoustic snare, clap, hi-hat, dan kendang tak/tung.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleDeckA}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                {deckAPlaying ? 'Pause Beat' : 'Play Beat'}
              </button>
            </div>

            {currentPlan && (
              <StepSequencerView
                pattern={currentPlan.drumPattern}
                onPatternChange={(newPattern) => {
                  const updated = { ...currentPlan, drumPattern: newPattern };
                  setCurrentPlan(updated);
                  djEngine.setPlan(updated);
                }}
                isPlaying={deckAPlaying}
                bpm={bpm}
              />
            )}
          </div>
        )}

        {/* MASHUP GUIDE & TUTORIAL VIEW */}
        {activeView === 'guide' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div className="pb-4 border-b border-neutral-800">
              <h3 className="text-base font-bold text-neutral-100">
                Solusi Mengapa Lagu Biasa "Ga Cocok" Dimix DJ & Cara Mengatasinya
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Lagu pop/dangdut/indie asli sudah memiliki drum dan bass bawaan. Jika ditumpuk langsung dengan beat DJ tanpa perlakuan khusus, ketukannya akan bertabrakan dan suaranya menjadi berantakan. Berikut solusinya:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <span className="text-cyan-400 font-bold text-xs">01. Vocal Isolator (Acapella)</span>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Aktifkan tombol <span className="font-semibold text-cyan-300">VOCAL ISOLATOR</span> di Deck B untuk memotong drum & bass lagu asli agar tidak bertabrakan dengan beat DJ.
                </p>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <span className="text-amber-400 font-bold text-xs">02. AI Track Sync & Upload</span>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Buka <span className="font-semibold text-amber-300">AI Remix Generator</span> dan upload lagu langsung di sana. AI mendeteksi BPM & key untuk merancang beat DJ yang pas.
                </p>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <span className="text-rose-400 font-bold text-xs">03. BASS KILL & Auto Mashup</span>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Klik <span className="font-semibold text-amber-300">AUTO MASHUP</span> untuk transisi otomatis: menyapu filter sweep, memutar 1/8 roll, dan meledakkan drop sub 808.
                </p>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                <span className="text-emerald-400 font-bold text-xs">04. Tombol Angguk-Angguk (3s Cut)</span>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Saat ditekan, lagu yang sedang berputar langsung berhenti dan lagu <span className="font-semibold text-emerald-300">Angguk-Angguk</span> berputar selama 3 detik. Begitu selesai, lagu otomatis lanjut 3 detik ke depan!
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* AI Generator & Voice Drop Modal */}
      <AIAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onApplyPlan={handleApplyPlan}
        currentSongTitle={uploadedTrackName}
        songDuration={deckBDuration}
        currentBpm={bpm}
        onLoadSongToDeckB={handleLoadSongToDeckB}
      />
    </div>
  );
}
