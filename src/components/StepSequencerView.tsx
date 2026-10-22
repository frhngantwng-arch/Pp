import React, { useEffect, useState } from 'react';
import { djEngine, DJPattern } from '../audio/DJEngine';

interface StepSequencerViewProps {
  pattern: DJPattern;
  onPatternChange: (newPattern: DJPattern) => void;
  isPlaying: boolean;
  bpm: number;
}

export const StepSequencerView: React.FC<StepSequencerViewProps> = ({
  pattern,
  onPatternChange,
  isPlaying,
  bpm,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  // Sync visual step indicator with master sequencer
  useEffect(() => {
    let animId: number;
    let startTime = performance.now();

    const loop = (now: number) => {
      if (isPlaying) {
        const beatSec = 60 / bpm;
        const stepSec = beatSec / 4;
        const elapsed = (now - startTime) / 1000;
        const step = Math.floor(elapsed / stepSec) % 16;
        setActiveStep(step);
      } else {
        setActiveStep(-1);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, bpm]);

  const toggleStep = (instrument: keyof DJPattern, index: number) => {
    const updated = {
      ...pattern,
      [instrument]: pattern[instrument].map((val, i) => (i === index ? (val === 1 ? 0 : 1) : val)),
    };
    onPatternChange(updated);
  };

  const instruments: Array<{ key: keyof DJPattern; label: string; color: string }> = [
    { key: 'kick', label: 'KICK (808)', color: 'bg-rose-500' },
    { key: 'snare', label: 'SNARE', color: 'bg-amber-500' },
    { key: 'clap', label: 'CLAP', color: 'bg-yellow-400' },
    { key: 'hihat', label: 'HI-HAT', color: 'bg-emerald-400' },
    { key: 'percussion', label: 'DONK / PERC', color: 'bg-cyan-400' },
  ];

  return (
    <div className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-300">16-Step DJ Beat Sequencer</span>
        <span className="text-[11px] text-neutral-500">Click steps to remix drums live</span>
      </div>

      <div className="space-y-1.5 overflow-x-auto pb-1">
        {instruments.map((inst) => {
          const row = pattern[inst.key] || [];
          return (
            <div key={inst.key} className="flex items-center gap-1.5 min-w-[340px]">
              <span className="w-20 text-[10px] font-bold text-neutral-400 truncate tracking-wider shrink-0">
                {inst.label}
              </span>

              <div className="grid grid-cols-16 gap-1 flex-1">
                {Array.from({ length: 16 }).map((_, stepIdx) => {
                  const isActive = row[stepIdx] === 1;
                  const isCurrent = activeStep === stepIdx;
                  const isBeatQuarter = stepIdx % 4 === 0;

                  return (
                    <button
                      key={stepIdx}
                      type="button"
                      onClick={() => toggleStep(inst.key, stepIdx)}
                      className={`h-6 rounded-sm transition-all cursor-pointer relative ${
                        isActive
                          ? `${inst.color} shadow-sm opacity-95`
                          : isBeatQuarter
                          ? 'bg-neutral-800 hover:bg-neutral-700'
                          : 'bg-neutral-900 hover:bg-neutral-800'
                      } ${
                        isCurrent
                          ? 'ring-2 ring-white ring-offset-1 ring-offset-neutral-950 scale-105 z-10'
                          : ''
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
