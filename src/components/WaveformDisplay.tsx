import React, { useRef, useEffect, useState, useMemo } from 'react';
import { djEngine } from '../audio/DJEngine';

interface WaveformDisplayProps {
  buffer: AudioBuffer | null;
  isPlaying: boolean;
  onSeek: (timeSec: number) => void;
  accentColor?: string;
  dropTiming?: number;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  buffer,
  isPlaying,
  onSeek,
  accentColor = 'cyan',
  dropTiming,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Pre-calculate downsampled peaks for the waveform
  const peaks = useMemo(() => {
    if (!buffer) return [];
    const channelData = buffer.getChannelData(0);
    const numBars = 160;
    const blockSize = Math.floor(channelData.length / numBars);
    const calculatedPeaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j += 4) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      calculatedPeaks.push(Math.min(1, max));
    }
    return calculatedPeaks;
  }, [buffer]);

  // Playhead update animation loop
  useEffect(() => {
    let animId: number;
    const updatePlayhead = () => {
      if (isPlaying) {
        setCurrentTime(djEngine.getDeckBCurrentTime());
      }
      animId = requestAnimationFrame(updatePlayhead);
    };
    animId = requestAnimationFrame(updatePlayhead);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Render waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const totalBars = peaks.length;
    const barWidth = width / totalBars;
    const duration = buffer ? buffer.duration : 1;
    const playProgress = duration > 0 ? currentTime / duration : 0;

    // Draw background grid lines
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 1;
    for (let b = 1; b < 16; b++) {
      const x = (b / 16) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw waveform bars
    peaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = Math.max(3, peak * (height - 8));
      const y = (height - barHeight) / 2;
      const barProgress = i / totalBars;

      if (barProgress <= playProgress) {
        // Played section color
        ctx.fillStyle = accentColor === 'amber' ? '#f59e0b' : '#06b6d4';
      } else {
        // Unplayed section color
        ctx.fillStyle = '#404040';
      }

      ctx.fillRect(x + 1, y, Math.max(1, barWidth - 1.5), barHeight);
    });

    // Draw Playhead line
    const playheadX = playProgress * width;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Draw Drop cue marker if provided
    if (dropTiming && dropTiming > 0 && dropTiming < duration) {
      const dropX = (dropTiming / duration) * width;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(dropX, 0);
      ctx.lineTo(dropX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = '#ef4444';
      ctx.font = '9px sans-serif';
      ctx.fillText('DROP', dropX + 3, 11);
    }
  }, [peaks, currentTime, buffer, accentColor, dropTiming]);

  // Handle Seek by clicking or dragging
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!buffer || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = ratio * buffer.duration;
    setCurrentTime(targetSec);
    onSeek(targetSec);
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const duration = buffer ? buffer.duration : 0;

  return (
    <div className="w-full bg-neutral-950/90 border border-neutral-800 rounded-xl p-3 select-none">
      <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5 font-mono-numbers">
        <span>PLAYHEAD: {formatTime(currentTime)}</span>
        <span className="text-neutral-500">TOTAL: {formatTime(duration)}</span>
      </div>

      <div
        ref={containerRef}
        onClick={handleSeekClick}
        className="relative h-16 w-full bg-neutral-950 rounded-lg cursor-pointer overflow-hidden border border-neutral-800/80 group"
      >
        {buffer ? (
          <canvas ref={canvasRef} width={600} height={64} className="w-full h-full block" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
            No audio loaded. Upload a track or pick a demo song below.
          </div>
        )}

        {/* Hover scrub hint */}
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>
    </div>
  );
};
