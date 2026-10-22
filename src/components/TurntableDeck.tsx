import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sliders,
  Mic,
  Repeat,
  FastForward,
  Rewind,
  Sparkles,
  Zap,
} from 'lucide-react';
import { djEngine, FXType } from '../audio/DJEngine';

interface TurntableDeckProps {
  deckId: 'A' | 'B';
  title: string;
  subtitle: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onCue: () => void;
  bpm: number;
  pitchBend?: number;
  onPitchBendChange?: (val: number) => void;
  accentColor: string; // 'amber' | 'cyan'
  isVocalIsolatorActive?: boolean;
  onToggleVocalIsolator?: () => void;
  keyShift?: number;
  onKeyShiftChange?: (semitones: number) => void;
}

export const TurntableDeck: React.FC<TurntableDeckProps> = ({
  deckId,
  title,
  subtitle,
  isPlaying,
  onPlayPause,
  onCue,
  bpm,
  pitchBend = 1.0,
  onPitchBendChange,
  accentColor,
  isVocalIsolatorActive = false,
  onToggleVocalIsolator,
  keyShift = 0,
  onKeyShiftChange,
}) => {
  const vinylRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const isDraggingScratch = useRef(false);
  const lastAngle = useRef(0);

  // EQ & Filter states
  const [trim, setTrim] = useState(0);
  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);
  const [filter, setFilter] = useState(0);
  const [lowKill, setLowKill] = useState(false);

  // Hot Cues
  const [hotCues, setHotCues] = useState<(number | null)[]>([null, null, null, null]);

  // Loops & FX
  const [activeLoop, setActiveLoop] = useState<number | null>(null);
  const [fxType, setFxType] = useState<FXType>('none');
  const [fxWet, setFxWet] = useState(0);

  // Rotation animation
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (isPlaying && !isDraggingScratch.current) {
        const speed = (bpm / 130) * 200 * pitchBend;
        setRotation((prev) => (prev + speed * dt) % 360);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, bpm, pitchBend]);

  // Oscilloscope
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = deckId === 'A' ? djEngine.deckAAnalyser : djEngine.deckBAnalyser;
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      if (!analyser || !isPlaying) {
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#262626';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = accentColor === 'amber' ? '#f59e0b' : '#06b6d4';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, deckId, accentColor]);

  // Vinyl scratching
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingScratch.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    djEngine.ensureRunning();
    djEngine.isScratching = true;

    const rect = vinylRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    lastAngle.current = Math.atan2(e.clientY - centerY, e.clientX - centerX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingScratch.current || !vinylRef.current) return;
    const rect = vinylRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);

    let deltaAngle = currentAngle - lastAngle.current;
    if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

    lastAngle.current = currentAngle;
    const degDelta = (deltaAngle * 180) / Math.PI;
    setRotation((prev) => prev + degDelta);

    const scratchVelocity = degDelta / 15;
    djEngine.handleScratch(scratchVelocity);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingScratch.current) {
      isDraggingScratch.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      djEngine.endScratch();
    }
  };

  // EQ, Trim & Filter handlers
  const handleTrimChange = (val: number) => {
    setTrim(val);
    djEngine.setTrim(deckId, val);
  };

  const handleEqChange = (band: 'low' | 'mid' | 'high', val: number) => {
    if (band === 'low') {
      setEqLow(val);
      djEngine.setEq(deckId, 'low', lowKill ? -30 : val);
    } else if (band === 'mid') {
      setEqMid(val);
      djEngine.setEq(deckId, 'mid', val);
    } else {
      setEqHigh(val);
      djEngine.setEq(deckId, 'high', val);
    }
  };

  const toggleLowKill = () => {
    const next = !lowKill;
    setLowKill(next);
    djEngine.setEq(deckId, 'low', next ? -30 : eqLow);
  };

  const handleFilterChange = (val: number) => {
    setFilter(val);
    djEngine.setFilter(deckId, val);
  };

  // Hot Cues
  const handleHotCueClick = (index: number) => {
    djEngine.ensureRunning();
    djEngine.jumpHotCue(deckId, index);
    const updated = deckId === 'A' ? [...djEngine.hotCuesA] : [...djEngine.hotCuesB];
    setHotCues(updated);
  };

  const handleClearHotCue = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    djEngine.clearHotCue(deckId, index);
    const updated = deckId === 'A' ? [...djEngine.hotCuesA] : [...djEngine.hotCuesB];
    setHotCues(updated);
  };

  // Loop handlers
  const handleAutoLoopClick = (beats: number) => {
    if (activeLoop === beats) {
      djEngine.toggleLoop();
      setActiveLoop(null);
    } else {
      djEngine.setAutoLoop(beats);
      setActiveLoop(beats);
    }
  };

  const handleBeatJump = (beats: number) => {
    djEngine.beatJump(beats);
  };

  // FX Handlers
  const handleFxTypeChange = (type: FXType) => {
    setFxType(type);
    djEngine.setFx(deckId, type, fxWet);
  };

  const handleFxWetChange = (wet: number) => {
    setFxWet(wet);
    djEngine.setFx(deckId, fxType, wet);
  };

  return (
    <div className="flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-2xl relative overflow-hidden space-y-4">
      {/* Deck Header: ID, Title, BPM, Gain Trim */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-md shrink-0 ${
              accentColor === 'amber'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
            }`}
          >
            DECK {deckId}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-neutral-100 truncate">{title}</h3>
            <p className="text-xs text-neutral-400 truncate">{subtitle}</p>
          </div>
        </div>

        {/* Trim & Key Shift */}
        <div className="flex items-center gap-3 shrink-0">
          {deckId === 'B' && onKeyShiftChange && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-neutral-400 font-medium">KEY SHIFT</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onKeyShiftChange(Math.max(-6, keyShift - 1))}
                  className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-bold flex items-center justify-center cursor-pointer"
                >
                  -
                </button>
                <span className="font-mono-numbers text-xs font-bold text-cyan-400 w-6 text-center">
                  {keyShift > 0 ? `+${keyShift}` : keyShift}
                </span>
                <button
                  type="button"
                  onClick={() => onKeyShiftChange(Math.min(6, keyShift + 1))}
                  className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-bold flex items-center justify-center cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col items-end">
            <span className="text-[10px] text-neutral-400 font-medium">TRIM</span>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min="-6"
                max="6"
                step="0.5"
                value={trim}
                onChange={(e) => handleTrimChange(parseFloat(e.target.value))}
                className="w-14 h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
              />
              <span className="font-mono-numbers text-[10px] text-neutral-400 w-8 text-right">
                {trim > 0 ? `+${trim}` : trim}dB
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Turntable Stage + EQ & FX Unit */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Turntable Vinyl Platter */}
        <div className="md:col-span-8 flex flex-col items-center justify-center">
          <div
            ref={vinylRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-52 h-52 sm:w-60 sm:h-60 rounded-full relative cursor-grab active:cursor-grabbing shadow-[0_0_40px_rgba(0,0,0,0.85)] border-4 border-neutral-950 flex items-center justify-center select-none touch-none transition-transform"
            style={{
              background:
                'radial-gradient(circle, #262626 0%, #171717 35%, #0a0a0a 65%, #000000 100%)',
            }}
          >
            {/* Vinyl Grooves */}
            <div className="absolute inset-2 rounded-full border border-neutral-800/40 pointer-events-none" />
            <div className="absolute inset-5 rounded-full border border-neutral-700/20 pointer-events-none" />
            <div className="absolute inset-9 rounded-full border border-neutral-800/50 pointer-events-none" />
            <div className="absolute inset-14 rounded-full border border-neutral-700/30 pointer-events-none" />
            <div className="absolute inset-20 rounded-full border border-neutral-800/60 pointer-events-none" />

            {/* Needle tonearm indicator */}
            <div className="absolute -top-2 -right-2 w-14 h-24 pointer-events-none opacity-80 hidden sm:block">
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-400 absolute top-0 right-0 shadow" />
              <div className="w-1 h-20 bg-neutral-500 absolute top-2 right-1 rotate-12 origin-top rounded-full" />
              <div className="w-3 h-4 bg-neutral-300 absolute bottom-1 right-5 rotate-45 rounded-sm shadow-md" />
            </div>

            {/* Rotating Center Label with Notch */}
            <div
              className="w-24 h-24 sm:w-26 sm:h-26 rounded-full relative flex items-center justify-center shadow-inner pointer-events-none"
              style={{
                transform: `rotate(${rotation}deg)`,
                background:
                  accentColor === 'amber'
                    ? 'radial-gradient(circle, #d97706 0%, #b45309 60%, #78350f 100%)'
                    : 'radial-gradient(circle, #0891b2 0%, #0e7490 60%, #155e75 100%)',
              }}
            >
              <div className="absolute top-1 w-2.5 h-6 bg-white rounded-full shadow-sm" />
              <div className="w-5 h-5 rounded-full bg-neutral-950 border border-neutral-700 shadow" />
              <span className="absolute bottom-2.5 text-[10px] font-bold text-neutral-900 tracking-wider">
                DECK {deckId}
              </span>
            </div>
          </div>

          {/* Mini Oscilloscope */}
          <div className="w-full mt-3 bg-neutral-950 border border-neutral-800/80 rounded-lg p-1 overflow-hidden">
            <canvas ref={canvasRef} width={260} height={24} className="w-full h-6 block rounded" />
          </div>
        </div>

        {/* 3-Band EQ & Pitch Controls */}
        <div className="md:col-span-4 flex flex-col gap-2.5 bg-neutral-950/60 border border-neutral-800/70 p-3 rounded-xl">
          {/* Pitch Slider with fine Nudge buttons */}
          {onPitchBendChange && (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs text-neutral-400">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-neutral-500" /> Pitch
                </span>
                <button
                  type="button"
                  onClick={() => onPitchBendChange(1.0)}
                  title="Click to reset pitch to 0%"
                  className="font-mono-numbers text-[11px] hover:text-neutral-200 transition-colors cursor-pointer"
                >
                  {((pitchBend - 1.0) * 100).toFixed(1)}%
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onPitchBendChange(Math.max(0.84, pitchBend - 0.01))}
                  className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[10px] font-bold flex items-center justify-center cursor-pointer"
                  title="Pitch Nudge -"
                >
                  -
                </button>
                <input
                  type="range"
                  min="0.84"
                  max="1.16"
                  step="0.005"
                  value={pitchBend}
                  onChange={(e) => onPitchBendChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <button
                  type="button"
                  onClick={() => onPitchBendChange(Math.min(1.16, pitchBend + 0.01))}
                  className="w-5 h-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[10px] font-bold flex items-center justify-center cursor-pointer"
                  title="Pitch Nudge +"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* 3-Band EQ Knobs */}
          <div className="space-y-2 pt-1 border-t border-neutral-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-400">EQUALIZER</span>
              <button
                type="button"
                onClick={toggleLowKill}
                className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${
                  lowKill
                    ? 'bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.6)] animate-pulse'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                BASS KILL
              </button>
            </div>

            {/* HI */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>HI</span>
                <span className="font-mono-numbers">{eqHigh > 0 ? `+${eqHigh}` : eqHigh}dB</span>
              </div>
              <input
                type="range"
                min="-24"
                max="6"
                step="1"
                value={eqHigh}
                onChange={(e) => handleEqChange('high', parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
              />
            </div>

            {/* MID */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>MID</span>
                <span className="font-mono-numbers">{eqMid > 0 ? `+${eqMid}` : eqMid}dB</span>
              </div>
              <input
                type="range"
                min="-24"
                max="6"
                step="1"
                value={eqMid}
                onChange={(e) => handleEqChange('mid', parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300"
              />
            </div>

            {/* LOW */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span className={lowKill ? 'text-rose-400 font-bold' : ''}>LOW</span>
                <span className="font-mono-numbers">
                  {lowKill ? 'KILL' : eqLow > 0 ? `+${eqLow}dB` : `${eqLow}dB`}
                </span>
              </div>
              <input
                type="range"
                min="-24"
                max="6"
                step="1"
                disabled={lowKill}
                value={eqLow}
                onChange={(e) => handleEqChange('low', parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-300 disabled:opacity-40"
              />
            </div>

            {/* FILTER (HP / LP) */}
            <div className="space-y-0.5 pt-1 border-t border-neutral-800/80">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>FILTER (LP/HP)</span>
                <span className="font-mono-numbers">
                  {filter < -0.05 ? 'LP' : filter > 0.05 ? 'HP' : 'OFF'}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={filter}
                onChange={(e) => handleFilterChange(parseFloat(e.target.value))}
                onDoubleClick={() => handleFilterChange(0)}
                className={`w-full h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer ${
                  accentColor === 'amber' ? 'accent-amber-500' : 'accent-cyan-500'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* VOCAL ISOLATOR (ACAPELLA STEM MODE) - Special feature for Deck B! */}
      {deckId === 'B' && onToggleVocalIsolator && (
        <div className="bg-neutral-950/80 border border-cyan-500/30 rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-neutral-100 flex items-center gap-1.5">
                Vocal Isolator (Acapella Mode)
                {isVocalIsolatorActive && (
                  <span className="text-[10px] bg-cyan-500 text-neutral-950 font-bold px-1.5 py-0.2 rounded">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400">
                Memotong drum & bass lagu asli agar vokal menyatu mulus di atas beat DJ!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleVocalIsolator}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shadow-sm ${
              isVocalIsolatorActive
                ? 'bg-cyan-500 text-neutral-950 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
          >
            {isVocalIsolatorActive ? 'ISOLASI ON' : 'AKTIFKAN'}
          </button>
        </div>
      )}

      {/* PERFORMANCE PADS: HOT CUES & AUTO LOOPS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950/60 border border-neutral-800/80 p-2.5 rounded-xl">
        {/* Hot Cues 1-4 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span className="font-semibold">HOT CUES (1-4)</span>
            <span className="text-[10px] text-neutral-500">Klik to jump / set</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((idx) => {
              const cuePos = hotCues[idx];
              const isSet = cuePos !== null && cuePos !== undefined;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleHotCueClick(idx)}
                  className={`h-8 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all cursor-pointer relative shadow-sm ${
                    isSet
                      ? accentColor === 'amber'
                        ? 'bg-amber-500 text-neutral-950 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                        : 'bg-cyan-500 text-neutral-950 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
                  }`}
                >
                  <span>CUE {idx + 1}</span>
                  {isSet && (
                    <span
                      onClick={(e) => handleClearHotCue(e, idx)}
                      title="Clear Hot Cue"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-neutral-950 text-neutral-400 hover:text-rose-400 rounded-full text-[8px] flex items-center justify-center border border-neutral-700"
                    >
                      ×
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Auto Loops & Beat Jump */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span className="font-semibold">AUTO LOOP & BEAT JUMP</span>
            <span className="text-[10px] text-neutral-500">Beats</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 4, 8].map((beats) => (
              <button
                key={beats}
                type="button"
                onClick={() => handleAutoLoopClick(beats)}
                className={`h-8 rounded-lg font-bold text-xs transition-all cursor-pointer shadow-sm ${
                  activeLoop === beats
                    ? 'bg-emerald-500 text-neutral-950 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                }`}
              >
                {beats} BAR
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transport Buttons: CUE, BEAT JUMPS, PLAY/PAUSE */}
      <div className="grid grid-cols-12 gap-2 pt-2 border-t border-neutral-800">
        <button
          type="button"
          onClick={onCue}
          className="col-span-3 h-11 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 font-bold text-xs rounded-xl transition-all cursor-pointer shadow border border-neutral-700/60"
        >
          <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
          CUE
        </button>

        <button
          type="button"
          onClick={() => handleBeatJump(-4)}
          className="col-span-2 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs rounded-xl transition-all cursor-pointer border border-neutral-700/60"
          title="Jump 4 beats back"
        >
          <Rewind className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => handleBeatJump(4)}
          className="col-span-2 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs rounded-xl transition-all cursor-pointer border border-neutral-700/60"
          title="Jump 4 beats forward"
        >
          <FastForward className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onPlayPause}
          className={`col-span-5 h-11 flex items-center justify-center gap-2 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg ${
            isPlaying
              ? accentColor === 'amber'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                : 'bg-cyan-500 text-neutral-950 shadow-[0_0_20px_rgba(6,182,212,0.5)]'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4 fill-current" /> PAUSE
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" /> PLAY
            </>
          )}
        </button>
      </div>
    </div>
  );
};
