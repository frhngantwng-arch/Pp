/**
 * BPM & Transient Energy Detection Utility
 * Uses energy onset autocorrelation and peak interval estimation
 * to detect the tempo of any loaded AudioBuffer in real-time.
 */

export function estimateBPMFromAudioBuffer(buffer: AudioBuffer): number {
  try {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    
    // Sample a 30-second window (or full buffer if shorter) around the most energetic part
    const maxDuration = Math.min(buffer.duration, 40);
    const startIndex = Math.floor(Math.max(0, (buffer.duration / 2) - 15) * sampleRate);
    const length = Math.floor(maxDuration * sampleRate);
    const endIndex = Math.min(channelData.length, startIndex + length);

    // Downsample to ~2000Hz for faster onset calculation
    const downsampleFactor = Math.floor(sampleRate / 2000);
    const downsampledLength = Math.floor((endIndex - startIndex) / downsampleFactor);
    const energy = new Float32Array(downsampledLength);

    for (let i = 0; i < downsampledLength; i++) {
      let sum = 0;
      const base = startIndex + i * downsampleFactor;
      for (let j = 0; j < downsampleFactor; j++) {
        const val = channelData[base + j] || 0;
        sum += val * val;
      }
      energy[i] = Math.sqrt(sum / downsampleFactor);
    }

    // Compute localized energy variance / onset peaks
    const windowSize = 25; // ~12ms window
    const onsets = new Float32Array(downsampledLength);
    for (let i = windowSize; i < downsampledLength - windowSize; i++) {
      let localAvg = 0;
      for (let j = -windowSize; j <= windowSize; j++) {
        localAvg += energy[i + j];
      }
      localAvg /= (windowSize * 2 + 1);
      onsets[i] = Math.max(0, energy[i] - localAvg * 1.3);
    }

    // Autocorrelation over BPM range 70 to 180 BPM
    const effectiveSampleRate = sampleRate / downsampleFactor;
    const minLag = Math.floor((effectiveSampleRate * 60) / 180); // 180 BPM
    const maxLag = Math.floor((effectiveSampleRate * 60) / 75);  // 75 BPM

    let bestLag = minLag;
    let maxCorr = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      const testLength = Math.min(downsampledLength - lag, 4000);
      for (let i = 0; i < testLength; i++) {
        corr += onsets[i] * onsets[i + lag];
      }
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    let estimatedBpm = Math.round((effectiveSampleRate * 60) / bestLag);

    // Normalize into standard electronic music ranges (120 - 160) if it detects half-time
    if (estimatedBpm < 90) {
      estimatedBpm *= 2;
    } else if (estimatedBpm > 180) {
      estimatedBpm = Math.round(estimatedBpm / 2);
    }

    return Math.max(70, Math.min(180, estimatedBpm));
  } catch (err) {
    console.warn('Error during BPM detection, falling back to 130:', err);
    return 130;
  }
}
