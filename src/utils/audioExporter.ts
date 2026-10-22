/**
 * Audio Exporter for DJ MixStudio AI
 * Renders the uploaded track with the Angguk-Angguk drop cuts and DJ beats
 * into a downloadable high-quality 16-bit 44.1kHz Stereo WAV file.
 */

// Helper to convert AudioBuffer to WAV ArrayBuffer
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length * numChannels * bytesPerSample;
  const bufferArray = new ArrayBuffer(44 + length);
  const view = new DataView(bufferArray);

  // Write RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  // Interleave channel samples and convert float32 to int16
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] || 0));
      // Convert to 16-bit signed integer
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export interface RenderRemixOptions {
  userSongBuffer: AudioBuffer;
  anggukBuffer: AudioBuffer;
  dropPoints: number[]; // seconds where each drop occurs
  dropDuration?: number; // e.g. 3.4 seconds
  isPureAnggukOnly: boolean; // if true, no synthetic DJ drums, only song + cuts + angguk
  cutMode: 'skip' | 'pause'; // 'skip' = cuts 3.4s forward, 'pause' = preserves song audio
  bpm: number;
}

/**
 * Offline rendering of the complete remixed track with exact cut points
 */
export async function renderRemixWav(options: RenderRemixOptions): Promise<Blob> {
  const {
    userSongBuffer,
    anggukBuffer,
    dropPoints,
    dropDuration = 3.4,
    cutMode = 'skip',
  } = options;

  const sampleRate = userSongBuffer.sampleRate;
  const numChannels = 2;

  // Calculate total duration based on cutMode and drops
  // If 'skip': song length is same as original (portions are replaced by drops)
  // If 'pause': total length increases by dropDuration * dropPoints.length
  const totalDuration = cutMode === 'skip'
    ? userSongBuffer.duration
    : userSongBuffer.duration + dropPoints.length * dropDuration;

  const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtxClass(
    numChannels,
    Math.ceil(sampleRate * Math.max(1, totalDuration)),
    sampleRate
  );

  // 1. Render User Song with Mute / Cut segments during drops
  if (cutMode === 'skip') {
    // Single continuous buffer source with gain envelope dropping to 0 at each drop point
    const songSource = offlineCtx.createBufferSource();
    songSource.buffer = userSongBuffer;
    const songGain = offlineCtx.createGain();

    songGain.gain.setValueAtTime(1.0, 0);

    // Sort drop points
    const sortedDrops = [...dropPoints].sort((a, b) => a - b);
    for (const dropStart of sortedDrops) {
      const dropEnd = dropStart + dropDuration;
      // Quick 5ms ramp down to prevent click
      songGain.gain.setValueAtTime(1.0, Math.max(0, dropStart - 0.005));
      songGain.gain.linearRampToValueAtTime(0.0, dropStart);
      // Silence during drop
      songGain.gain.setValueAtTime(0.0, dropEnd);
      // Quick ramp up after drop
      songGain.gain.linearRampToValueAtTime(1.0, dropEnd + 0.005);
    }

    songSource.connect(songGain);
    songGain.connect(offlineCtx.destination);
    songSource.start(0);
  } else {
    // Cut & pause mode: slice into segments
    let currentRenderTime = 0;
    let songOffset = 0;
    const sortedDrops = [...dropPoints].sort((a, b) => a - b);

    for (const dropStart of sortedDrops) {
      const segmentDur = Math.max(0, dropStart - songOffset);
      if (segmentDur > 0) {
        const segSource = offlineCtx.createBufferSource();
        segSource.buffer = userSongBuffer;
        segSource.connect(offlineCtx.destination);
        segSource.start(currentRenderTime, songOffset, segmentDur);
        currentRenderTime += segmentDur;
        songOffset += segmentDur;
      }
      currentRenderTime += dropDuration; // gap for drop
    }

    // Remaining tail
    const remainingDur = userSongBuffer.duration - songOffset;
    if (remainingDur > 0) {
      const tailSource = offlineCtx.createBufferSource();
      tailSource.buffer = userSongBuffer;
      tailSource.connect(offlineCtx.destination);
      tailSource.start(currentRenderTime, songOffset, remainingDur);
    }
  }

  // 2. Render Angguk-Angguk drop clips at each drop point
  let anggukOffsetTimeline = 0;
  const sortedDrops = [...dropPoints].sort((a, b) => a - b);

  for (let idx = 0; idx < sortedDrops.length; idx++) {
    const dropStart = sortedDrops[idx];
    const triggerTime = cutMode === 'skip' ? dropStart : dropStart + anggukOffsetTimeline;
    if (cutMode === 'pause') {
      anggukOffsetTimeline += dropDuration;
    }

    const anggukSource = offlineCtx.createBufferSource();
    anggukSource.buffer = anggukBuffer;
    const anggukGain = offlineCtx.createGain();
    anggukGain.gain.setValueAtTime(1.2, triggerTime); // slightly boosted for punchy club sound
    anggukSource.connect(anggukGain);
    anggukGain.connect(offlineCtx.destination);
    anggukSource.start(triggerTime);
  }

  // Render the audio graph
  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWav(renderedBuffer);
}
