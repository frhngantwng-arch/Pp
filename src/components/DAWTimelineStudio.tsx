import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  Scissors,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Download,
  Sparkles,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sliders,
  Music,
  Disc,
  Upload,
  Check,
  ChevronRight,
  Headphones,
  Maximize2,
  Layers,
  Flame,
} from 'lucide-react';
import { djEngine, DJTrackPlan } from '../audio/DJEngine';
import { renderRemixWav } from '../utils/audioExporter';

interface DropMarker {
  id: string;
  startTime: number; // in seconds
  duration: number; // in seconds, default ~3.4s
  name: string;
}

interface DAWTimelineStudioProps {
  userSongBuffer: AudioBuffer | null;
  userSongTitle: string;
  songBpm: number;
  songDuration: number;
  currentPlan: DJTrackPlan | null;
  onUploadSong: (file: File) => void;
  onBackToConsole: () => void;
}

export const DAWTimelineStudio: React.FC<DAWTimelineStudioProps> = ({
  userSongBuffer,
  userSongTitle,
  songBpm,
  songDuration,
  currentPlan,
  onUploadSong,
  onBackToConsole,
}) => {
  // Mode selection: "Cuma Angguk-Angguk" vs "Full DJ Jedag-Jedug"
  const [djMode, setDjMode] = useState<'pure_angguk' | 'full_dj'>('pure_angguk');
  // Cut Mode: "skip" (lagu dipotong maju 3 detik) vs "pause" (lagu ditunda/di-pause)
  const [cutMode, setCutMode] = useState<'skip' | 'pause'>('skip');
  // Snapping: 'free' | 'beat' | 'bar'
  const [snapMode, setSnapMode] = useState<'free' | 'beat' | 'bar'>('bar');
  // Zoom level: 1x to 4x (pixels per second)
  const [zoom, setZoom] = useState<number>(1.2);

  // Drop Markers (where the Angguk-Angguk drop sits)
  const [drops, setDrops] = useState<DropMarker[]>([
    { id: 'drop-1', startTime: 15.0, duration: 3.4, name: 'DJ Angguk Drop #1' },
  ]);
  const [activeDropId, setActiveDropId] = useState<string>('drop-1');

  // Track Mixer settings (Mute, Solo, Volume)
  const [track1Vol, setTrack1Vol] = useState<number>(1.0);
  const [track1Mute, setTrack1Mute] = useState<boolean>(false);
  const [track1Solo, setTrack1Solo] = useState<boolean>(false);

  const [track2Vol, setTrack2Vol] = useState<number>(1.2);
  const [track2Mute, setTrack2Mute] = useState<boolean>(false);
  const [track2Solo, setTrack2Solo] = useState<boolean>(false);

  const [track3Vol, setTrack3Vol] = useState<number>(0.9);
  const [track3Mute, setTrack3Mute] = useState<boolean>(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadTime, setPlayheadTime] = useState<number>(0);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Dragging state
  const [draggingDropId, setDraggingDropId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragInitialStartTime, setDragInitialStartTime] = useState<number>(0);

  // References
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const playheadAnchorTimeRef = useRef<number>(0);

  // Web Audio preview nodes
  const activeSourcesRef = useRef<{
    songSource: AudioBufferSourceNode | null;
    songGain: GainNode | null;
    anggukSources: AudioBufferSourceNode[];
  }>({
    songSource: null,
    songGain: null,
    anggukSources: [],
  });

  const duration = Math.max(songDuration || 180, 60);
  const pxPerSec = 35 * zoom;
  const totalTimelineWidth = Math.max(800, duration * pxPerSec);

  // Calculate downsampled peaks for the user's song waveform
  const songPeaks = useMemo(() => {
    if (!userSongBuffer) return [];
    const channelData = userSongBuffer.getChannelData(0);
    const numBars = Math.floor(duration * 10); // 10 bars per second
    const blockSize = Math.floor(channelData.length / numBars) || 1;
    const peaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j += 8) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(Math.min(1, max));
    }
    return peaks;
  }, [userSongBuffer, duration]);

  // Calculate synthetic peaks for the Angguk-Angguk clip
  const anggukPeaks = useMemo(() => {
    const bars = 34; // 3.4 seconds * 10
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      // Energetic dance drop curve
      const p = 0.5 + 0.5 * Math.sin((i / bars) * Math.PI * 4) * Math.exp(-((i % 4) * 0.2));
      peaks.push(Math.max(0.2, Math.min(1, p)));
    }
    return peaks;
  }, []);

  const activeDrop = drops.find((d) => d.id === activeDropId) || drops[0];

  // Snapping helper function
  const applySnap = useCallback(
    (timeInSec: number): number => {
      if (snapMode === 'free') {
        return Math.max(0, Math.min(duration - 4, timeInSec));
      }
      const secondsPerBeat = 60 / (songBpm || 138);
      const step = snapMode === 'bar' ? secondsPerBeat * 4 : secondsPerBeat;
      const snapped = Math.round(timeInSec / step) * step;
      return Math.max(0, Math.min(duration - 4, snapped));
    },
    [snapMode, songBpm, duration]
  );

  // Stop all active preview audio nodes
  const stopAudioPreview = useCallback(() => {
    try {
      if (activeSourcesRef.current.songSource) {
        activeSourcesRef.current.songSource.stop();
        activeSourcesRef.current.songSource.disconnect();
      }
    } catch {}
    activeSourcesRef.current.songSource = null;

    activeSourcesRef.current.anggukSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    });
    activeSourcesRef.current.anggukSources = [];

    // Also stop DJEngine Deck A if running
    if (djEngine.isDeckAPlaying) {
      djEngine.stopDeckA();
    }
  }, []);

  // Play audio preview from a specific timeline timestamp
  const startAudioPreview = useCallback(
    async (fromTime: number) => {
      await djEngine.ensureRunning();
      if (!djEngine.ctx || !userSongBuffer) return;

      stopAudioPreview();
      const ctx = djEngine.ctx;
      const now = ctx.currentTime;

      // Ensure Angguk buffer is ready
      if (!djEngine.anggukBuffer) {
        await djEngine.preloadAnggukAudio().catch(() => {});
      }
      const anggukBuf = djEngine.anggukBuffer;

      // Setup User Song Source with gain automation for cuts
      const songSource = ctx.createBufferSource();
      songSource.buffer = userSongBuffer;
      const songGain = ctx.createGain();

      const finalTrack1Vol = track1Mute || (track2Solo && !track1Solo) ? 0 : track1Vol;
      songGain.gain.setValueAtTime(finalTrack1Vol, now);

      // Automated Cuts / Mutes during every drop point
      const sortedDrops = [...drops].sort((a, b) => a.startTime - b.startTime);
      for (const d of sortedDrops) {
        const dropStartRelative = d.startTime - fromTime;
        const dropEndRelative = dropStartRelative + d.duration;

        if (dropEndRelative > 0) {
          const cutStartAudioTime = now + Math.max(0, dropStartRelative);
          const cutEndAudioTime = now + Math.max(0, dropEndRelative);

          // Quick ramp to 0 gain when hitting drop
          songGain.gain.setValueAtTime(finalTrack1Vol, Math.max(now, cutStartAudioTime - 0.005));
          songGain.gain.linearRampToValueAtTime(0, Math.max(now, cutStartAudioTime));
          // Restore gain right when drop concludes!
          songGain.gain.setValueAtTime(0, cutEndAudioTime);
          songGain.gain.linearRampToValueAtTime(finalTrack1Vol, cutEndAudioTime + 0.005);
        }
      }

      songSource.connect(songGain);
      songGain.connect(djEngine.masterAnalyser || ctx.destination);

      if (fromTime < userSongBuffer.duration) {
        songSource.start(now, fromTime);
      }
      activeSourcesRef.current.songSource = songSource;
      activeSourcesRef.current.songGain = songGain;

      // Schedule Angguk-Angguk drop clips
      if (anggukBuf && (!track2Mute || (track1Solo && !track2Solo))) {
        const finalTrack2Vol = track2Mute ? 0 : track2Vol;
        for (const d of sortedDrops) {
          const dropStartRelative = d.startTime - fromTime;
          if (dropStartRelative >= -0.1 && dropStartRelative < userSongBuffer.duration) {
            const anggukSource = ctx.createBufferSource();
            anggukSource.buffer = anggukBuf;
            const anggukGain = ctx.createGain();
            anggukGain.gain.setValueAtTime(finalTrack2Vol, now);
            anggukSource.connect(anggukGain);
            anggukGain.connect(djEngine.masterAnalyser || ctx.destination);

            const triggerTime = now + Math.max(0, dropStartRelative);
            const offset = dropStartRelative < 0 ? Math.abs(dropStartRelative) : 0;
            anggukSource.start(triggerTime, offset);
            activeSourcesRef.current.anggukSources.push(anggukSource);
          }
        }
      }

      // If full DJ mode is active and not muted, start DJEngine Deck A beat synthesizer
      if (djMode === 'full_dj' && !track3Mute) {
        djEngine.startDeckA();
      }

      playStartTimeRef.current = now;
      playheadAnchorTimeRef.current = fromTime;
      setIsPlaying(true);
    },
    [
      userSongBuffer,
      drops,
      track1Vol,
      track1Mute,
      track1Solo,
      track2Vol,
      track2Mute,
      track2Solo,
      track3Mute,
      djMode,
      stopAudioPreview,
    ]
  );

  // Playhead animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const update = () => {
      if (!djEngine.ctx) return;
      const elapsed = djEngine.ctx.currentTime - playStartTimeRef.current;
      const current = playheadAnchorTimeRef.current + elapsed;

      if (current >= duration) {
        setIsPlaying(false);
        setPlayheadTime(0);
        stopAudioPreview();
        return;
      }

      setPlayheadTime(current);
      animFrameRef.current = requestAnimationFrame(update);
    };

    animFrameRef.current = requestAnimationFrame(update);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, duration, stopAudioPreview]);

  // Clean up audio preview when unmounting
  useEffect(() => {
    return () => {
      stopAudioPreview();
    };
  }, [stopAudioPreview]);

  // Toggle Play / Pause
  const handleTogglePlay = () => {
    if (isPlaying) {
      stopAudioPreview();
      setIsPlaying(false);
    } else {
      startAudioPreview(playheadTime);
    }
  };

  // Stop and return playhead to zero
  const handleStop = () => {
    stopAudioPreview();
    setIsPlaying(false);
    setPlayheadTime(0);
  };

  // Click on Timeline ruler/track to seek playhead
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingDropId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = Math.max(0, Math.min(duration, clickX / pxPerSec));
    setPlayheadTime(newTime);

    if (isPlaying) {
      startAudioPreview(newTime);
    }
  };

  // Dragging the Angguk-Angguk Drop block along Track 2
  const handleDropMouseDown = (e: React.MouseEvent, dropId: string) => {
    e.stopPropagation();
    const d = drops.find((item) => item.id === dropId);
    if (!d) return;

    setActiveDropId(dropId);
    setDraggingDropId(dropId);
    setDragStartX(e.clientX);
    setDragInitialStartTime(d.startTime);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingDropId) return;
      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX / pxPerSec;
      const rawNewTime = dragInitialStartTime + deltaTime;
      const snappedTime = applySnap(rawNewTime);

      setDrops((prev) =>
        prev.map((d) => (d.id === draggingDropId ? { ...d, startTime: snappedTime } : d))
      );
    };

    const handleMouseUp = () => {
      if (draggingDropId) {
        setDraggingDropId(null);
        // If playing, restart preview at current playhead to sync new cut points
        if (isPlaying) {
          startAudioPreview(playheadTime);
        }
      }
    };

    if (draggingDropId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingDropId, dragStartX, dragInitialStartTime, pxPerSec, applySnap, isPlaying, playheadTime, startAudioPreview]);

  // Micro-nudge active drop left/right
  const handleNudge = (deltaSec: number) => {
    if (!activeDrop) return;
    const newTime = Math.max(0, Math.min(duration - 4, activeDrop.startTime + deltaSec));
    setDrops((prev) =>
      prev.map((d) => (d.id === activeDrop.id ? { ...d, startTime: newTime } : d))
    );
    if (isPlaying) {
      startAudioPreview(playheadTime);
    }
  };

  // Quick Align preset drop points
  const handleQuickPresetDrop = (targetSec: number) => {
    if (!activeDrop) return;
    const snapped = applySnap(targetSec);
    setDrops((prev) =>
      prev.map((d) => (d.id === activeDrop.id ? { ...d, startTime: snapped } : d))
    );
    setPlayheadTime(Math.max(0, snapped - 2));
    if (isPlaying) {
      startAudioPreview(Math.max(0, snapped - 2));
    }
  };

  // Add another Angguk Drop marker
  const handleAddDropMarker = () => {
    const newStart = Math.min(duration - 4, playheadTime + 2);
    const newDrop: DropMarker = {
      id: `drop-${Date.now()}`,
      startTime: applySnap(newStart),
      duration: 3.4,
      name: `DJ Angguk Drop #${drops.length + 1}`,
    };
    setDrops([...drops, newDrop]);
    setActiveDropId(newDrop.id);
  };

  // Delete active drop marker (if more than 1)
  const handleDeleteDrop = (id: string) => {
    if (drops.length <= 1) return;
    setDrops((prev) => prev.filter((d) => d.id !== id));
    setActiveDropId(drops[0].id);
  };

  // Audition / Test the Drop Point: Plays 2.5 seconds before the drop, hears the cut and Angguk drop, and resumes!
  const handleAuditionDrop = () => {
    if (!activeDrop) return;
    setIsAuditioning(true);
    const auditionStart = Math.max(0, activeDrop.startTime - 2.5);
    setPlayheadTime(auditionStart);
    startAudioPreview(auditionStart);

    setTimeout(() => {
      setIsAuditioning(false);
    }, 7500); // 2.5s buildup + 3.4s drop + 1.6s resume
  };

  // Render & Export WAV Remix with exact cut points
  const handleExportRemix = async () => {
    if (!userSongBuffer) {
      alert('Silakan upload atau muat lagu terlebih dahulu.');
      return;
    }

    setIsExporting(true);
    setExportNotice('Memproses potongan lagu & merender hasil remix WAV berkualitas tinggi...');

    try {
      await djEngine.preloadAnggukAudio().catch(() => {});
      const anggukBuf = djEngine.anggukBuffer || (djEngine as any).createFallbackAnggukBuffer();

      const blob = await renderRemixWav({
        userSongBuffer,
        anggukBuffer: anggukBuf,
        dropPoints: drops.map((d) => d.startTime),
        dropDuration: 3.4,
        isPureAnggukOnly: djMode === 'pure_angguk',
        cutMode,
        bpm: songBpm,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${userSongTitle.replace(/\s+/g, '_')}_Angguk_DJ_Remix.wav`;
      a.click();
      URL.revokeObjectURL(url);

      setExportNotice('Remix berhasil diexport dan diunduh!');
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor audio. Coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  // Format time (MM:SS.ms)
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Bar and Beat format (Bar.Beat)
  const formatBarBeat = (sec: number) => {
    const secondsPerBeat = 60 / (songBpm || 138);
    const totalBeats = Math.floor(sec / secondsPerBeat);
    const bar = Math.floor(totalBeats / 4) + 1;
    const beat = (totalBeats % 4) + 1;
    return `BAR ${bar}.${beat}`;
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col select-none">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadSong(file);
        }}
        className="hidden"
      />

      {/* TOP TRANSPORT BAR (Logic Pro / GarageBand Style) */}
      <div className="bg-neutral-950 border-b border-neutral-800 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Window Dots & Navigation */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToConsole}
            className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Meja DJ
          </button>

          <div className="h-4 w-px bg-neutral-800 hidden sm:block" />

          {/* Mode Selector */}
          <div className="flex items-center bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setDjMode('pure_angguk');
                if (isPlaying) startAudioPreview(playheadTime);
              }}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                djMode === 'pure_angguk'
                  ? 'bg-amber-500 text-neutral-950 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              Lagu DJ Cuma Angguk-Angguk
            </button>
            <button
              type="button"
              onClick={() => {
                setDjMode('full_dj');
                if (isPlaying) startAudioPreview(playheadTime);
              }}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                djMode === 'full_dj'
                  ? 'bg-amber-500 text-neutral-950 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              Full DJ Jedag-Jedug
            </button>
          </div>
        </div>

        {/* Center: LCD Counter Display */}
        <div className="bg-neutral-900 border border-neutral-800/80 px-4 py-1.5 rounded-xl flex items-center gap-4 text-center shadow-inner">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Bar / Beat</div>
            <div className="font-mono-numbers text-xs font-bold text-amber-400">
              {formatBarBeat(playheadTime)}
            </div>
          </div>
          <div className="w-px h-6 bg-neutral-800" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Waktu Lagu</div>
            <div className="font-mono-numbers text-sm font-bold text-neutral-100">
              {formatTime(playheadTime)}
            </div>
          </div>
          <div className="w-px h-6 bg-neutral-800" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Tempo Sync</div>
            <div className="font-mono-numbers text-xs font-bold text-cyan-400">
              {songBpm} BPM
            </div>
          </div>
        </div>

        {/* Right: Transport Controls (Play, Pause, Stop, Audition, Export) */}
        <div className="flex items-center gap-2">
          {/* Stop Button */}
          <button
            type="button"
            onClick={handleStop}
            className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 flex items-center justify-center text-neutral-300 transition-colors cursor-pointer"
            title="Stop & Reset ke Awal"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className={`px-4 h-9 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer ${
              isPlaying
                ? 'bg-amber-500 text-neutral-950 shadow-amber-500/20 ring-2 ring-amber-400/50'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play Timeline</span>
              </>
            )}
          </button>

          {/* Test / Audition Drop Point Button */}
          <button
            type="button"
            onClick={handleAuditionDrop}
            className={`px-3.5 h-9 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isAuditioning
                ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.5)]'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20'
            }`}
            title="Dengarkan 2.5s sebelum drop sampai setelah drop untuk mencocokkan beat"
          >
            <Flame className="w-4 h-4" />
            <span>Tes Drop (Preview)</span>
          </button>

          {/* Export WAV Button */}
          <button
            type="button"
            onClick={handleExportRemix}
            disabled={isExporting}
            className="px-3.5 h-9 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Merender...' : 'Download Remix (WAV)'}
          </button>
        </div>
      </div>

      {/* SUB-HEADER TOOLBAR: Grid Snapping, Drop Alignment Buttons, Zoom */}
      <div className="bg-neutral-950/70 border-b border-neutral-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Quick Drop Points & Nudge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-400 font-semibold flex items-center gap-1">
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            Titik Potong Lagu:
          </span>

          <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
            <button
              type="button"
              onClick={() => handleNudge(-1.0)}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-numbers text-[11px] cursor-pointer"
              title="Geser Kiri 1 Detik"
            >
              ◀ -1s
            </button>
            <button
              type="button"
              onClick={() => handleNudge(-0.1)}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-mono-numbers text-[11px] cursor-pointer"
              title="Geser Kiri Halus (0.1 Detik)"
            >
              ◀ -0.1s
            </button>
            <span className="px-2 font-mono-numbers font-bold text-amber-400 text-xs">
              {activeDrop ? `${activeDrop.startTime.toFixed(1)}s` : '0s'}
            </span>
            <button
              type="button"
              onClick={() => handleNudge(0.1)}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-mono-numbers text-[11px] cursor-pointer"
              title="Geser Kanan Halus (0.1 Detik)"
            >
              +0.1s ▶
            </button>
            <button
              type="button"
              onClick={() => handleNudge(1.0)}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-numbers text-[11px] cursor-pointer"
              title="Geser Kanan 1 Detik"
            >
              +1s ▶
            </button>
          </div>

          {/* Quick preset positions */}
          <div className="flex items-center gap-1">
            {[
              { label: 'Intro (15s)', sec: 15 },
              { label: 'Reff/Chorus (30s)', sec: 30 },
              { label: 'Drop 45s', sec: 45 },
              { label: 'Menit 1 (60s)', sec: 60 },
            ].map((p) => (
              <button
                key={p.sec}
                type="button"
                onClick={() => handleQuickPresetDrop(p.sec)}
                className="px-2 py-1 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-[11px] rounded transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddDropMarker}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3 h-3" />
            + Tambah Drop Baru
          </button>
        </div>

        {/* Right: Snapping & Zoom controls */}
        <div className="flex items-center gap-3">
          {/* Snapping Mode */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500 text-[11px]">Snap:</span>
            <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
              {(['free', 'beat', 'bar'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSnapMode(m)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                    snapMode === m
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {m === 'free' ? 'Bebas' : m === 'beat' ? '1 Beat' : '1 Bar'}
                </button>
              ))}
            </div>
          </div>

          {/* Cut Mode Switcher */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500 text-[11px]">Model Potong:</span>
            <button
              type="button"
              onClick={() => setCutMode(cutMode === 'skip' ? 'pause' : 'skip')}
              className="px-2 py-0.5 bg-neutral-900 border border-neutral-800 rounded text-[11px] font-semibold text-neutral-300 hover:text-neutral-100 cursor-pointer"
            >
              {cutMode === 'skip' ? '✂️ Potong Maju 3s (TikTok Style)' : '⏸️ Pause & Lanjut'}
            </button>
          </div>

          {/* Zoom Slider */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
              className="p-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono-numbers text-[11px] text-neutral-400 w-8 text-center">
              {zoom.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
              className="p-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {exportNotice && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 px-4 py-2 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* MAIN DAW WORKSPACE (Tracks on Left, Timeline on Right) */}
      <div className="flex flex-1 overflow-hidden min-h-[420px]">
        {/* LEFT PANEL: Track Headers (Logic Pro / GarageBand Style) */}
        <div className="w-64 bg-neutral-950/90 border-r border-neutral-800 shrink-0 flex flex-col divide-y divide-neutral-800/80">
          {/* Top Corner Spacer (aligns with ruler) */}
          <div className="h-8 px-3 flex items-center justify-between text-[11px] font-bold text-neutral-500 bg-neutral-950">
            <span>DAFTAR TRACK</span>
            <span>VOL / M / S</span>
          </div>

          {/* TRACK 1 HEADER: Lagu Sendiri */}
          <div className="h-32 p-3 flex flex-col justify-between bg-neutral-900/40">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  <span className="text-xs font-bold text-neutral-200 truncate">
                    {userSongTitle || 'Lagu Sendiri (Vocal Demo)'}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  Lagu Utama · {songBpm} BPM
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-400 cursor-pointer"
                title="Ganti Lagu"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Track 1 Controls: Volume, Mute, Solo */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTrack1Mute(!track1Mute)}
                  className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                    track1Mute ? 'bg-rose-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Mute Track"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => setTrack1Solo(!track1Solo)}
                  className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                    track1Solo ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Solo Track"
                >
                  S
                </button>
                <div className="flex-1 flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-neutral-500" />
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={track1Vol}
                    onChange={(e) => setTrack1Vol(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>
              </div>
              <div className="text-[10px] text-cyan-400/80 font-mono-numbers">
                ✂️ {drops.length} titik potong otomatis
              </div>
            </div>
          </div>

          {/* TRACK 2 HEADER: DJ Angguk-Angguk Drop */}
          <div className="h-32 p-3 flex flex-col justify-between bg-amber-950/10 border-l-2 border-l-amber-500">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
                  <span className="text-xs font-bold text-amber-300 truncate">
                    DJ Angguk-Angguk Drop
                  </span>
                </div>
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  Sound DJ Drop · 3.4 Detik
                </div>
              </div>

              <button
                type="button"
                onClick={handleAuditionDrop}
                className="p-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 cursor-pointer"
                title="Dengarkan Drop"
              >
                <Flame className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Track 2 Controls: Volume, Mute, Solo */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTrack2Mute(!track2Mute)}
                  className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                    track2Mute ? 'bg-rose-500 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Mute Track"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => setTrack2Solo(!track2Solo)}
                  className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                    track2Solo ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Solo Track"
                >
                  S
                </button>
                <div className="flex-1 flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-neutral-500" />
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={track2Vol}
                    onChange={(e) => setTrack2Vol(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>
              </div>
              <div className="text-[10px] text-amber-400 font-mono-numbers">
                Posisi: {activeDrop?.startTime.toFixed(1)}s (Bisa digeser)
              </div>
            </div>
          </div>

          {/* TRACK 3 HEADER: Beat DJ Jedag-Jedug (Deck A AI Synthesizer) */}
          <div
            className={`h-28 p-3 flex flex-col justify-between transition-opacity ${
              djMode === 'pure_angguk' ? 'opacity-40 bg-neutral-950' : 'bg-emerald-950/10'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span className="text-xs font-bold text-neutral-300 truncate">
                  Beat DJ Jedag-Jedug
                </span>
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5">
                {djMode === 'pure_angguk'
                  ? 'Muted (Mode Cuma Angguk-Angguk Aktif)'
                  : 'Deck A Drum Synthesizer & 808'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTrack3Mute(!track3Mute)}
                className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                  track3Mute || djMode === 'pure_angguk'
                    ? 'bg-rose-500 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
                title="Mute Track"
              >
                M
              </button>
              <div className="flex-1 flex items-center gap-1.5">
                <Volume2 className="w-3 h-3 text-neutral-500" />
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={track3Vol}
                  disabled={djMode === 'pure_angguk'}
                  onChange={(e) => setTrack3Vol(parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 h-1 bg-neutral-800 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Scrollable Multi-track Timeline */}
        <div
          ref={timelineScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden bg-[#121214] relative cursor-crosshair"
          onClick={handleTimelineClick}
        >
          {/* Scrollable Timeline Container */}
          <div
            style={{ width: `${totalTimelineWidth}px` }}
            className="h-full relative flex flex-col divide-y divide-neutral-800/80"
          >
            {/* TOP MEASURE RULER (Bars & Seconds) */}
            <div className="h-8 bg-neutral-950/80 border-b border-neutral-800 sticky top-0 z-20 flex items-center relative pointer-events-none">
              {Array.from({ length: Math.ceil(duration / 4) }).map((_, barIdx) => {
                const barTime = barIdx * 4;
                const xPos = barTime * pxPerSec;
                return (
                  <div
                    key={barIdx}
                    style={{ left: `${xPos}px` }}
                    className="absolute top-0 bottom-0 border-l border-neutral-800 flex items-center pl-1 text-[10px] font-mono-numbers text-neutral-500"
                  >
                    <span>{barIdx + 1}</span>
                    <span className="text-[9px] text-neutral-600 ml-1">({barTime}s)</span>
                  </div>
                );
              })}
            </div>

            {/* TRACK 1 LANE: User Song Waveform with Cutout Gap */}
            <div className="h-32 relative bg-neutral-950/40 overflow-hidden flex items-center">
              {/* Grid vertical lines */}
              {Array.from({ length: Math.ceil(duration / 4) }).map((_, i) => (
                <div
                  key={i}
                  style={{ left: `${i * 4 * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 border-l border-neutral-800/40 pointer-events-none"
                />
              ))}

              {/* Waveform Bars */}
              <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                {songPeaks.map((peak, idx) => {
                  const barTime = idx * 0.1;
                  const x = barTime * pxPerSec;

                  // Check if this bar falls inside ANY cut drop zone
                  const isInsideCut = drops.some(
                    (d) => barTime >= d.startTime && barTime <= d.startTime + d.duration
                  );

                  const barHeight = Math.max(3, peak * 90);

                  return (
                    <div
                      key={idx}
                      style={{
                        left: `${x}px`,
                        height: `${barHeight}px`,
                        width: `${Math.max(1, pxPerSec * 0.08)}px`,
                      }}
                      className={`absolute rounded-full transition-colors ${
                        isInsideCut
                          ? 'bg-rose-500/20'
                          : barTime <= playheadTime
                          ? 'bg-cyan-400'
                          : 'bg-neutral-600'
                      }`}
                    />
                  );
                })}
              </div>

              {/* VISIBLE CUTOUT / GAP ZONES (where Angguk-Angguk sits) */}
              {drops.map((d) => {
                const cutX = d.startTime * pxPerSec;
                const cutWidth = d.duration * pxPerSec;

                return (
                  <div
                    key={`cut-${d.id}`}
                    style={{
                      left: `${cutX}px`,
                      width: `${cutWidth}px`,
                    }}
                    className="absolute top-1 bottom-1 bg-rose-950/50 border-2 border-dashed border-rose-500/80 rounded-xl z-10 flex flex-col items-center justify-center shadow-lg shadow-rose-950/40 backdrop-blur-[1px] pointer-events-none animate-pulse"
                  >
                    <div className="flex items-center gap-1.5 text-rose-300 font-bold text-xs bg-rose-950/90 px-2 py-0.5 rounded-md border border-rose-500/50">
                      <Scissors className="w-3.5 h-3.5 text-rose-400" />
                      <span>POTONG LAGU ({d.duration.toFixed(1)}s)</span>
                    </div>
                    <span className="text-[10px] text-rose-200 mt-1 font-medium">
                      Lagu berhenti di sini ➔ Suara DJ Angguk berbunyi
                    </span>
                  </div>
                );
              })}
            </div>

            {/* TRACK 2 LANE: Draggable DJ Angguk-Angguk Clip Block */}
            <div className="h-32 relative bg-amber-950/5 overflow-hidden flex items-center">
              {/* Grid vertical lines */}
              {Array.from({ length: Math.ceil(duration / 4) }).map((_, i) => (
                <div
                  key={i}
                  style={{ left: `${i * 4 * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 border-l border-neutral-800/40 pointer-events-none"
                />
              ))}

              {/* RENDER THE DRAGGABLE CLIPS */}
              {drops.map((d) => {
                const clipX = d.startTime * pxPerSec;
                const clipWidth = Math.max(90, d.duration * pxPerSec);
                const isSelected = d.id === activeDropId;

                return (
                  <div
                    key={d.id}
                    style={{
                      left: `${clipX}px`,
                      width: `${clipWidth}px`,
                    }}
                    onMouseDown={(e) => handleDropMouseDown(e, d.id)}
                    className={`absolute top-2 bottom-2 rounded-xl border-2 cursor-grab active:cursor-grabbing z-10 flex flex-col justify-between p-2.5 transition-all shadow-xl ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/40 via-rose-500/30 to-amber-500/40 border-amber-400 shadow-amber-500/30 ring-2 ring-amber-400/40'
                        : 'bg-neutral-900/90 border-amber-500/50 hover:border-amber-400'
                    }`}
                  >
                    {/* Header inside clip */}
                    <div className="flex items-center justify-between text-neutral-100">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="font-bold text-xs truncate text-amber-200">
                          {d.name}
                        </span>
                      </div>

                      {drops.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDrop(d.id);
                          }}
                          className="text-neutral-400 hover:text-rose-400 p-0.5 cursor-pointer"
                          title="Hapus Drop Ini"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Angguk Waveform Graphic inside clip */}
                    <div className="flex items-center justify-center gap-0.5 h-7 my-auto">
                      {anggukPeaks.map((p, pIdx) => (
                        <div
                          key={pIdx}
                          style={{ height: `${p * 26}px` }}
                          className="w-1 bg-amber-400 rounded-full"
                        />
                      ))}
                    </div>

                    {/* Footer inside clip */}
                    <div className="flex items-center justify-between text-[10px] font-mono-numbers text-amber-300">
                      <span className="font-bold">Geser: {d.startTime.toFixed(1)}s</span>
                      <span className="bg-amber-950/80 px-1.5 py-0.5 rounded text-[9px] border border-amber-500/40">
                        {d.duration.toFixed(1)}s DROP
                      </span>
                    </div>

                    {/* Drag indicator hint */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-neutral-950 px-2 py-0.5 rounded text-[10px] font-bold shadow opacity-0 group-hover:opacity-100 pointer-events-none">
                      Tahan & Geser Kiri / Kanan
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TRACK 3 LANE: Beat DJ Jedag-Jedug (Continuous Loop) */}
            <div
              className={`h-28 relative overflow-hidden flex items-center transition-opacity ${
                djMode === 'pure_angguk' ? 'opacity-30 bg-neutral-950' : 'bg-emerald-950/5'
              }`}
            >
              {Array.from({ length: Math.ceil(duration / 4) }).map((_, i) => (
                <div
                  key={i}
                  style={{ left: `${i * 4 * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 border-l border-neutral-800/40 pointer-events-none"
                />
              ))}

              {/* Render synthetic 4/4 drum blocks */}
              <div className="absolute inset-0 flex items-center px-1 pointer-events-none">
                {Array.from({ length: Math.ceil(duration * 2) }).map((_, beatIdx) => {
                  const x = beatIdx * 0.5 * pxPerSec;
                  const isKick = beatIdx % 2 === 0;
                  return (
                    <div
                      key={beatIdx}
                      style={{
                        left: `${x}px`,
                        height: isKick ? '44px' : '22px',
                        width: `${Math.max(2, pxPerSec * 0.25)}px`,
                      }}
                      className={`absolute rounded-sm ${
                        djMode === 'pure_angguk'
                          ? 'bg-neutral-800'
                          : isKick
                          ? 'bg-emerald-500/80'
                          : 'bg-emerald-700/60'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* VERTICAL MOVING PLAYHEAD (Spans across all tracks) */}
            <div
              style={{ left: `${playheadTime * pxPerSec}px` }}
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none shadow-[0_0_10px_rgba(6,182,212,0.9)]"
            >
              {/* Playhead Head Marker */}
              <div className="absolute -top-1 -left-2 w-4 h-4 bg-cyan-400 rounded-sm rotate-45 shadow flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-neutral-950 rounded-full" />
              </div>
              {/* Playhead Time Badge */}
              <div className="absolute top-4 -left-7 bg-cyan-500 text-neutral-950 font-mono-numbers font-bold text-[9px] px-1 rounded shadow">
                {playheadTime.toFixed(1)}s
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER BAR: Instructional hints for the user */}
      <div className="bg-neutral-950 border-t border-neutral-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold">💡 Cara Pakai:</span>
          <span>
            Klik dan <strong>geser kotak oranye DJ Angguk-Angguk</strong> ke kiri/kanan. Lagu di atasnya akan <strong>otomatis terpotong</strong> pada detik tersebut. Tekan tombol <strong>"Tes Drop (Preview)"</strong> untuk mendengar hasilnya langsung pas atau tidak.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportRemix}
            className="text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download File Audio Lagu (+ Potongan Angguk)
          </button>
        </div>
      </div>
    </div>
  );
};
