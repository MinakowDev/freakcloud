import { STORAGE_KEYS, PLAYER_CONFIG } from '../../../shared/config';

export const LOUDNESS_NORM_EVENT = 'freakcloud_loudness_norm_updated';

const waveformGainCache = new Map<string, number>();

/**
 * Checks whether loudness normalization is enabled in user settings.
 * Defaults to true.
 */
export function isLoudnessNormEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.VOLUME_NORM) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Calculates loudness gain factor for a track based on its waveform data.
 * If normalization is disabled or waveform is unavailable, returns neutral gain 1.0.
 */
export async function getTrackLoudnessGain(waveformUrl?: string): Promise<number> {
  if (!isLoudnessNormEnabled()) {
    return 1.0;
  }

  if (!waveformUrl || typeof waveformUrl !== 'string') {
    return 1.0;
  }

  const cached = waveformGainCache.get(waveformUrl);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // SoundCloud waveform URLs may end in .png; the JSON representation is at the same path with .json
    const jsonUrl = waveformUrl.replace(/\.png(\?.*)?$/i, '.json$1');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(jsonUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      waveformGainCache.set(waveformUrl, 1.0);
      return 1.0;
    }

    const data = await response.json();
    const samples: number[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.samples)
      ? data.samples
      : [];

    if (!samples.length) {
      waveformGainCache.set(waveformUrl, 1.0);
      return 1.0;
    }

    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      const val = Number(samples[i]) || 0;
      sumSq += val * val;
    }

    const rms = Math.sqrt(sumSq / samples.length);
    if (rms <= 0 || !Number.isFinite(rms)) {
      waveformGainCache.set(waveformUrl, 1.0);
      return 1.0;
    }

    // Standardize volume around target RMS
    const rawGain = PLAYER_CONFIG.NORMALIZATION_TARGET_RMS / rms;
    const clampedGain = Math.max(
      PLAYER_CONFIG.NORMALIZATION_MIN_GAIN,
      Math.min(PLAYER_CONFIG.NORMALIZATION_MAX_GAIN, rawGain)
    );

    waveformGainCache.set(waveformUrl, clampedGain);
    return clampedGain;
  } catch {
    // Fall back smoothly without blocking playback
    waveformGainCache.set(waveformUrl, 1.0);
    return 1.0;
  }
}
