import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  Zap,
  Radio,
  Flame,
  VolumeX,
  Play,
  RotateCcw,
  Sparkles,
  Headphones,
  Sliders,
} from 'lucide-react';
import { djEngine, FXType } from '../audio/DJEngine';

interface CenterMixerProps {
  bpm: number;
  onBpmChange: (newBpm: number) => void;
  crossfader: number;
  onCrossfaderChange: (val: number) => void;
  jedagBoost: boolean;
  onToggleJedagBoost: () => void;
  hasVoiceDrop: boolean;
  onOpenVoiceDropModal: () => void;
  onAutoMashupTransition: () => void;
  isDeckAPlaying: boolean;
  isDeckBPlaying: boolean;
  isAnggukPlaying: boolean;
  onTriggerAngguk: () => void;
  anggukDuration?: number;
}

export const CenterMixer: React.FC<CenterMixerProps> = ({
  bpm,
  onBpmChange,
  crossfader,
  onCrossfaderChange,
  jedagBoost,
  onToggleJedagBoost,
  hasVoiceDrop,
  onOpenVoiceDropModal,
  onAutoMashupTransition,
  isDeckAPlaying,
  isDeckBPlaying,
  isAnggukPlaying,
  onTriggerAngguk,
  anggukDuration = 3.4,
}) => {
  const [masterVol, setMasterVol] = useState(0.9);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [activeStutter, setActiveStutter] = useState<number | null>(null);
  const [selectedFx, setSelectedFx] = useState<FXType>('echo');
  const [fxDryWet, setFxDryWet] = useState(0);

  // VU Meters & Phase Match Canvas
  const vuCanvasRef = useRef<HTMLCanvasElement>(null);
  const phaseCanvasRef = useRef<HTMLCanvasElement>(null);

  // Dual Master VU meters loop
  useEffect(() => {
    let animId: number;
    const canvas = vuCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = djEngine.masterAnalyser;
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const drawVU = () => {
      animId = requestAnimationFrame(drawVU);
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      const normalizedLevel = Math.min(1, avg / 140);

      const numSegments = 16;
      const barHeight = 4;
      const gap = 2;

      const drawChannelBar = (x: number, level: number) => {
        const activeSegments = Math.round(level * numSegments);

        for (let s = 0; s < numSegments; s++) {
          const y = canvas.height - 10 - s * (barHeight + gap);
          let color = '#22c55e';
          if (s >= 10) color = '#eab308';
          if (s >= 14) color = '#ef4444';

          ctx.fillStyle = s < activeSegments ? color : '#262626';
          ctx.fillRect(x, y, 10, barHeight);
        }
      };

      drawChannelBar(14, normalizedLevel);
      drawChannelBar(28, Math.min(1, normalizedLevel * 1.05));
    };

    drawVU();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Scrolling Phase Beat-Matching Meter Loop
  useEffect(() => {
    let animId: number;
    const canvas = phaseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = performance.now();

    const drawPhase = (now: number) => {
      animId = requestAnimationFrame(drawPhase);
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const center = width / 2;

      // Draw Center Sync Target Marker
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center, 0);
      ctx.lineTo(center, height);
      ctx.stroke();

      const beatDurationSec = 60 / bpm;
      const elapsedSec = (now - startTime) / 1000;

      // Draw Deck A Scrolling Beats (Top lane, Amber)
      if (isDeckAPlaying) {
        ctx.fillStyle = '#f59e0b';
        const phaseProgressA = (elapsedSec % beatDurationSec) / beatDurationSec;
        for (let b = -2; b <= 2; b++) {
          const x = center + (b - phaseProgressA) * (width / 4);
          if (x >= 0 && x <= width) {
            ctx.fillRect(x - 2, 2, 4, (height / 2) - 3);
          }
        }
      }

      // Draw Deck B Scrolling Beats (Bottom lane, Cyan)
      if (isDeckBPlaying) {
        ctx.fillStyle = '#06b6d4';
        const phaseProgressB = (elapsedSec % beatDurationSec) / beatDurationSec;
        for (let b = -2; b <= 2; b++) {
          const x = center + (b - phaseProgressB) * (width / 4);
          if (x >= 0 && x <= width) {
            ctx.fillRect(x - 2, (height / 2) + 1, 4, (height / 2) - 3);
          }
        }
      }
    };

    drawPhase(startTime);
    return () => cancelAnimationFrame(animId);
  }, [bpm, isDeckAPlaying, isDeckBPlaying]);

  // Tap tempo
  const handleTap = () => {
    const now = performance.now();
    const newTimes = [...tapTimes.slice(-3), now];
    setTapTimes(newTimes);

    if (newTimes.length >= 2) {
      const diffs = [];
      for (let i = 1; i < newTimes.length; i++) {
        diffs.push(newTimes[i] - newTimes[i - 1]);
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const detectedBpm = Math.round(60000 / avgDiff);
      if (detectedBpm >= 70 && detectedBpm <= 180) {
        onBpmChange(detectedBpm);
      }
    }
  };

  const handleMasterVolChange = (val: number) => {
    setMasterVol(val);
    djEngine.setMasterVolume(val);
  };

  const handleStutter = (division: 4 | 8 | 16, active: boolean) => {
    if (active) {
      setActiveStutter(division);
      djEngine.triggerStutter(division, true);
    } else {
      setActiveStutter(null);
      djEngine.triggerStutter(division, false);
    }
  };

  const handleFxChange = (type: FXType, wet: number) => {
    setSelectedFx(type);
    setFxDryWet(wet);
    djEngine.setFx('A', type, wet);
    djEngine.setFx('B', type, wet);
  };

  return (
    <div className="flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl justify-between gap-3.5">
      {/* Beat Phase Alignment Display */}
      <div className="bg-neutral-950 p-2 rounded-xl border border-neutral-800 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-neutral-400 font-medium">
          <span className="text-amber-400 font-bold">BEAT MATCH PHASE</span>
          <span className="text-cyan-400 font-bold">TARGET ALIGNED</span>
        </div>
        <canvas ref={phaseCanvasRef} width={220} height={26} className="w-full h-6 block rounded" />
      </div>

      {/* Master VU Meter & Master Volume & BPM */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="bg-neutral-950 p-1.5 rounded-lg border border-neutral-800 shadow-inner">
            <canvas ref={vuCanvasRef} width={52} height={100} className="block rounded" />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold text-neutral-400 tracking-wider">MASTER</span>
            <div className="text-xs font-mono-numbers text-neutral-300">
              {Math.round(masterVol * 100)}%
            </div>
            <input
              type="range"
              min="0"
              max="1.2"
              step="0.05"
              value={masterVol}
              onChange={(e) => handleMasterVolChange(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Master BPM & Tap */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] text-neutral-400 font-medium">MASTER BPM</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onBpmChange(bpm - 1)}
              className="w-6 h-6 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-bold text-xs flex items-center justify-center cursor-pointer"
            >
              -
            </button>
            <span className="font-mono-numbers text-lg font-bold text-amber-400 tracking-tight">
              {bpm}
            </span>
            <button
              type="button"
              onClick={() => onBpmChange(bpm + 1)}
              className="w-6 h-6 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-bold text-xs flex items-center justify-center cursor-pointer"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleTap}
            className="text-[10px] font-bold uppercase tracking-wider bg-neutral-800 hover:bg-neutral-700 active:bg-amber-500 active:text-neutral-950 text-neutral-300 px-2.5 py-0.5 rounded transition-all cursor-pointer shadow-sm"
          >
            TAP TEMPO
          </button>
        </div>
      </div>

      {/* ANGGUK-ANGGUK DROP BUTTON (Plays 3s drop audio, cuts main music, then auto-resumes 3s forward) */}
      <button
        type="button"
        onClick={onTriggerAngguk}
        className={`w-full py-2.5 px-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer shadow-lg select-none ${
          isAnggukPlaying
            ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.9)] animate-pulse'
            : 'bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-cyan-500/15 border-amber-500/40 hover:border-amber-400 text-neutral-100'
        }`}
      >
        <div className="flex items-center gap-2.5 text-left min-w-0">
          <span className={`text-xl shrink-0 ${isAnggukPlaying ? 'animate-bounce' : ''}`}>
            🕺
          </span>
          <div className="min-w-0">
            <div className="text-xs font-black tracking-wider flex items-center gap-1.5 truncate">
              ANGGUK-ANGGUK
              {isAnggukPlaying && (
                <span className="text-[9px] bg-neutral-950 text-rose-300 font-bold px-1.5 py-0.2 rounded font-mono-numbers animate-pulse">
                  PLAYING ({anggukDuration.toFixed(1)}s)
                </span>
              )}
            </div>
            <div className="text-[10px] text-neutral-400 truncate">
              {isAnggukPlaying
                ? 'Lagu di-cut & skip otomatis setelah drop...'
                : 'Pause lagu & putar drop 3 detik, otomatis lanjut'}
            </div>
          </div>
        </div>

        <Zap
          className={`w-4 h-4 shrink-0 ${
            isAnggukPlaying ? 'text-yellow-300 fill-current animate-spin-slow' : 'text-amber-400'
          }`}
        />
      </button>

      {/* Jedag Jedug Bass Boost & Auto Mashup Transition */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onToggleJedagBoost}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer shadow-sm ${
            jedagBoost
              ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
              : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <Flame className={`w-4 h-4 ${jedagBoost ? 'text-rose-400 animate-bounce' : ''}`} />
            JEDAG JEDUG
          </div>
          <span className="text-[10px] opacity-80 mt-0.5">808 Bass Boost</span>
        </button>

        <button
          type="button"
          onClick={onAutoMashupTransition}
          className="p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 flex flex-col items-center justify-center text-center transition-all cursor-pointer shadow-sm"
        >
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin-slow" />
            AUTO MASHUP
          </div>
          <span className="text-[10px] opacity-80 mt-0.5">Drop & Blend</span>
        </button>
      </div>

      {/* MULTI-FX UNIT */}
      <div className="space-y-1.5 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-2.5">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span className="font-semibold">BEAT FX UNIT</span>
          <span className="font-mono-numbers text-[10px]">
            {Math.round(fxDryWet * 100)}% WET
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {(['none', 'echo', 'flanger', 'bitcrush'] as FXType[]).map((fx) => (
            <button
              key={fx}
              type="button"
              onClick={() => handleFxChange(fx, fx === 'none' ? 0 : 0.6)}
              className={`h-6 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                selectedFx === fx
                  ? 'bg-amber-500 text-neutral-950'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              {fx}
            </button>
          ))}
        </div>

        {selectedFx !== 'none' && (
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={fxDryWet}
            onChange={(e) => handleFxChange(selectedFx, parseFloat(e.target.value))}
            className="w-full h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-500 mt-1"
          />
        )}
      </div>

      {/* Performance Pads: Beat Stutter & Tape Stop */}
      <div className="space-y-1.5 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-2.5">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span className="font-semibold">DECK B ROLL / STUTTER</span>
          <span className="text-[10px] text-neutral-500">Hold pad</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[4, 8, 16].map((div) => (
            <button
              key={div}
              type="button"
              onPointerDown={() => handleStutter(div as any, true)}
              onPointerUp={() => handleStutter(div as any, false)}
              onPointerLeave={() => handleStutter(div as any, false)}
              className={`h-8 rounded-lg font-bold text-xs transition-all cursor-pointer select-none ${
                activeStutter === div
                  ? 'bg-cyan-500 text-neutral-950 shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
              }`}
            >
              1/{div}
            </button>
          ))}
          <button
            type="button"
            onClick={() => djEngine.triggerVinylBrake(1.2)}
            className="h-8 rounded-lg font-bold text-[10px] bg-neutral-800 hover:bg-rose-500/20 hover:text-rose-300 text-neutral-200 transition-all cursor-pointer"
          >
            BRAKE
          </button>
        </div>
      </div>

      {/* DJ FX Soundboard Buttons */}
      <div className="space-y-1.5 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-2.5">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span className="font-semibold">DJ SOUNDBOARD FX</span>
          <button
            type="button"
            onClick={onOpenVoiceDropModal}
            className="text-[10px] text-amber-400 hover:underline cursor-pointer"
          >
            + AI Voice Drop
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => djEngine.triggerAirhorn()}
            className="h-8 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            AIRHORN
          </button>
          <button
            type="button"
            onClick={() => djEngine.triggerSiren()}
            className="h-8 bg-neutral-800 hover:bg-cyan-500 hover:text-neutral-950 text-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            SIREN
          </button>
          <button
            type="button"
            onClick={() => djEngine.triggerLaser()}
            className="h-8 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            LASER
          </button>
          <button
            type="button"
            onClick={() => djEngine.triggerVinylSpinback()}
            className="h-8 bg-neutral-800 hover:bg-violet-500 hover:text-white text-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            SPINBACK
          </button>
          <button
            type="button"
            onClick={() => djEngine.triggerSubBoom()}
            className="h-8 bg-neutral-800 hover:bg-rose-500 hover:text-white text-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            808 BOOM
          </button>
          <button
            type="button"
            onClick={() => {
              if (hasVoiceDrop) {
                djEngine.triggerVoiceDrop();
              } else {
                onOpenVoiceDropModal();
              }
            }}
            className={`h-8 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
              hasVoiceDrop
                ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
            }`}
          >
            MC DROP
          </button>
        </div>
      </div>

      {/* Crossfader Section */}
      <div className="space-y-2 pt-2 border-t border-neutral-800">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <button
            type="button"
            onClick={() => onCrossfaderChange(-1)}
            className="hover:text-amber-400 font-bold transition-colors cursor-pointer"
          >
            DECK A
          </button>
          <button
            type="button"
            onClick={() => onCrossfaderChange(0)}
            className="font-mono-numbers text-[11px] hover:text-neutral-200 px-2 py-0.5 rounded bg-neutral-800 transition-colors cursor-pointer"
          >
            CENTER
          </button>
          <button
            type="button"
            onClick={() => onCrossfaderChange(1)}
            className="hover:text-cyan-400 font-bold transition-colors cursor-pointer"
          >
            DECK B
          </button>
        </div>

        <div className="relative py-1">
          <input
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={crossfader}
            onChange={(e) => onCrossfaderChange(parseFloat(e.target.value))}
            className="w-full h-3 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-400 border border-neutral-800 shadow-inner"
          />
        </div>
      </div>
    </div>
  );
};
