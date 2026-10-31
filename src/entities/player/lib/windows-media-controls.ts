import type { Track } from '../../track/model/types';
import { STORAGE_KEYS } from '../../../shared/config';

export interface WindowsMediaControlsCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (positionSeconds: number) => void;
}

/**
 * Creates a valid 5-second PCM 8-bit mono silent WAV Blob URL.
 * Having real duration (5 seconds) prevents Chromium WebMediaPlayer
 * from entering an unthrottled infinite loop on ended/seek, preventing
 * massive CPU spikes (30%) and multi-gigabyte memory leaks.
 */
function createSilentWavBlobUrl(durationSeconds = 5, sampleRate = 8000): string {
  const numSamples = durationSeconds * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate, true); // Byte rate (8-bit mono = sampleRate)
  view.setUint16(32, 1, true); // Block align
  view.setUint16(34, 8, true); // 8 bits per sample
  writeString(36, 'data');
  view.setUint32(40, numSamples, true);

  // Fill audio data with 128 (PCM 8-bit unsigned silence)
  const bytes = new Uint8Array(buffer, 44, numSamples);
  bytes.fill(128);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export class WindowsMediaControlsService {
  private silentAudio: HTMLAudioElement | null = null;
  private silentAudioUrl: string | null = null;
  private isEnabled: boolean = true;
  private currentTrack: Track | null = null;
  private isPlaying: boolean = false;
  private callbacks: WindowsMediaControlsCallbacks | null = null;
  private lastPositionUpdateTime: number = 0;
  private lastReportedPosition: number = -1;

  constructor() {
    this.isEnabled = this.loadStoredPreference();
    this.ensureSilentAudio();
  }

  private loadStoredPreference(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.WINDOWS_MEDIA_CONTROLS) !== 'false';
    } catch {
      return true;
    }
  }

  private ensureSilentAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (this.silentAudio) return this.silentAudio;

    try {
      if (!this.silentAudioUrl) {
        this.silentAudioUrl = createSilentWavBlobUrl(5, 8000);
      }
      this.silentAudio = new Audio(this.silentAudioUrl);
      this.silentAudio.loop = true;
      // Inaudible non-zero volume allows Chromium/WebView2 to register active media session with Windows SMTC
      this.silentAudio.volume = 0.001;
    } catch (err) {
      console.warn('[WindowsMediaControls] Failed to init silent audio element:', err);
    }
    return this.silentAudio;
  }

  public setCallbacks(callbacks: WindowsMediaControlsCallbacks) {
    this.callbacks = callbacks;
    this.ensureSilentAudio();
    this.bindMediaSessionActions();
  }

  private bindMediaSessionActions() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.callbacks?.onPlay();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        this.callbacks?.onPause();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.callbacks?.onPrevious();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this.callbacks?.onNext();
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        this.callbacks?.onPause();
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          this.callbacks?.onSeek(details.seekTime);
        }
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        if (this.currentTrack) {
          this.callbacks?.onSeek(Math.max(0, (details.seekTime || 0) - offset));
        }
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const offset = details.seekOffset || 10;
        if (this.currentTrack) {
          this.callbacks?.onSeek((details.seekTime || 0) + offset);
        }
      });
    } catch (err) {
      console.warn('[WindowsMediaControls] Failed to bind mediaSession action handlers:', err);
    }
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEYS.WINDOWS_MEDIA_CONTROLS, String(enabled));
    } catch {}

    if (!enabled) {
      this.clearSession();
    } else {
      this.updateMetadata(this.currentTrack);
      this.updatePlaybackState(this.isPlaying);
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public updateMetadata(track: Track | null) {
    this.currentTrack = track;
    if (!this.isEnabled) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      const artwork: MediaImage[] = [];
      if (track.artwork_url) {
        artwork.push(
          { src: track.artwork_url, sizes: '96x96', type: 'image/jpeg' },
          { src: track.artwork_url, sizes: '128x128', type: 'image/jpeg' },
          { src: track.artwork_url, sizes: '256x256', type: 'image/jpeg' },
          { src: track.artwork_url, sizes: '512x512', type: 'image/jpeg' }
        );
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'Freakcloud',
        artwork,
      });
    } catch (err) {
      console.warn('[WindowsMediaControls] Failed to set MediaMetadata:', err);
    }
  }

  public updatePlaybackState(isPlaying: boolean) {
    this.isPlaying = isPlaying;
    if (!this.isEnabled) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      const audio = this.ensureSilentAudio();
      if (isPlaying) {
        audio?.play().catch(() => {});
      } else {
        audio?.pause();
      }
    } catch (err) {
      console.warn('[WindowsMediaControls] Failed to update playback state:', err);
    }
  }

  public updatePositionState(currentTime: number, duration: number, force = false) {
    if (!this.isEnabled) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!('setPositionState' in navigator.mediaSession)) return;
    if (duration <= 0 || isNaN(duration)) return;

    const now = Date.now();
    // Throttle position updates: W3C Media Session specifies that user agents extrapolate position.
    // Only update on force (seek or track transition), significant drift (>= 2s), or every 5 seconds.
    if (!force && this.lastPositionUpdateTime > 0) {
      const elapsedSec = (now - this.lastPositionUpdateTime) / 1000;
      const expectedPos = this.lastReportedPosition + elapsedSec;
      const drift = Math.abs(currentTime - expectedPos);
      if (drift < 2.0 && now - this.lastPositionUpdateTime < 5000) {
        return;
      }
    }

    try {
      const safeDuration = Math.max(0, duration);
      const safePos = Math.min(Math.max(0, currentTime), safeDuration);

      navigator.mediaSession.setPositionState({
        duration: safeDuration,
        playbackRate: 1.0,
        position: safePos,
      });
      this.lastPositionUpdateTime = now;
      this.lastReportedPosition = safePos;
    } catch {
      // Ignore transient position state errors if duration changed mid-seek
    }
  }

  private clearSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      this.silentAudio?.pause();
    } catch {}
  }

  public destroy() {
    this.clearSession();
    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio.removeAttribute('src');
      this.silentAudio.load();
      this.silentAudio = null;
    }
    if (this.silentAudioUrl) {
      URL.revokeObjectURL(this.silentAudioUrl);
      this.silentAudioUrl = null;
    }
    this.callbacks = null;
  }
}

// Global instance
export const windowsMediaControls = new WindowsMediaControlsService();
