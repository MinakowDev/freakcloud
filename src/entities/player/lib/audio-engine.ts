export type AudioEngineStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface AudioEngineListeners {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onStatusChange?: (status: AudioEngineStatus) => void;
  onTrackEnded?: () => void;
  onApproachingEnd?: () => void;
  onError?: (err: MediaError | null) => void;
}

export class AudioEngine {
  private primaryAudio: HTMLAudioElement;
  private secondaryAudio: HTMLAudioElement;
  private listeners: AudioEngineListeners = {};

  private masterVolume = 0.8;
  private isMuted = false;
  private crossfadeDuration = 3.5; // seconds
  private approachingEndTriggered = false;
  private crossfadeTimer: number | null = null;

  constructor() {
    this.primaryAudio = new Audio();
    this.secondaryAudio = new Audio();
    this.primaryAudio.preload = 'auto';
    this.secondaryAudio.preload = 'auto';
    this.bindEvents(this.primaryAudio);
  }

  public setListeners(listeners: AudioEngineListeners) {
    this.listeners = listeners;
  }

  public setCrossfadeDuration(seconds: number) {
    this.crossfadeDuration = Math.max(0, Math.min(seconds, 12));
  }

  public getCrossfadeDuration(): number {
    return this.crossfadeDuration;
  }

  private bindEvents(audio: HTMLAudioElement) {
    audio.addEventListener('timeupdate', () => {
      if (audio !== this.primaryAudio) return;
      const cur = audio.currentTime;
      const dur = audio.duration || 0;
      this.listeners.onTimeUpdate?.(cur, dur);

      // Check if approaching end for Spotify-style automatic crossfade
      if (
        this.crossfadeDuration > 0 &&
        dur > 10 &&
        cur >= dur - this.crossfadeDuration &&
        !this.approachingEndTriggered
      ) {
        this.approachingEndTriggered = true;
        this.listeners.onApproachingEnd?.();
      }
    });

    audio.addEventListener('playing', () => {
      if (audio === this.primaryAudio) {
        this.listeners.onStatusChange?.('playing');
      }
    });

    audio.addEventListener('pause', () => {
      if (audio === this.primaryAudio && !audio.ended && this.crossfadeTimer === null) {
        this.listeners.onStatusChange?.('paused');
      }
    });

    audio.addEventListener('waiting', () => {
      if (audio === this.primaryAudio) {
        this.listeners.onStatusChange?.('buffering');
      }
    });

    audio.addEventListener('ended', () => {
      if (audio === this.primaryAudio) {
        this.listeners.onStatusChange?.('ended');
        this.listeners.onTrackEnded?.();
      }
    });

    audio.addEventListener('error', () => {
      if (audio === this.primaryAudio) {
        this.listeners.onStatusChange?.('error');
        this.listeners.onError?.(audio.error);
      }
    });
  }

  /**
   * Loads a new track directly, optionally with crossfade if audio is already playing.
   */
  public async load(url: string, autoPlay = true, enableCrossfade = true): Promise<void> {
    this.clearCrossfadeTimer();
    this.approachingEndTriggered = false;

    const isCurrentlyPlaying = !this.primaryAudio.paused && this.primaryAudio.currentTime > 0;
    const duration = this.crossfadeDuration;

    if (enableCrossfade && isCurrentlyPlaying && duration > 0.5) {
      await this.crossfadeTo(url, duration);
      return;
    }

    // Direct switch with smooth micro-fade
    this.primaryAudio.src = url;
    this.primaryAudio.volume = this.effectiveVolume();
    this.primaryAudio.load();

    if (autoPlay) {
      try {
        await this.primaryAudio.play();
      } catch (err) {
        console.warn('[AudioEngine] Playback blocked or failed:', err);
      }
    }
  }

  /**
   * Performs smooth dual-channel crossfade: fades out primary, fades in secondary, then swaps.
   */
  public async crossfadeTo(newUrl: string, durationSeconds = 3.5): Promise<void> {
    this.clearCrossfadeTimer();
    this.approachingEndTriggered = false;

    const fadeOutAudio = this.primaryAudio;
    const fadeInAudio = this.secondaryAudio;

    fadeInAudio.src = newUrl;
    fadeInAudio.volume = 0;
    fadeInAudio.load();

    try {
      await fadeInAudio.play();
    } catch (err) {
      console.warn('[AudioEngine] Crossfade fadeIn failed, falling back:', err);
      this.primaryAudio.src = newUrl;
      this.primaryAudio.volume = this.effectiveVolume();
      this.primaryAudio.play().catch(() => {});
      return;
    }

    // Prepare swap of primary listener target
    this.primaryAudio = fadeInAudio;
    this.secondaryAudio = fadeOutAudio;
    this.bindEvents(this.primaryAudio);

    const startTime = performance.now();
    const durationMs = durationSeconds * 1000;
    const targetVol = this.effectiveVolume();

    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Equal-power crossfade curve for smooth sound energy
      const inVol = targetVol * Math.sin(progress * (Math.PI / 2));
      const outVol = targetVol * Math.cos(progress * (Math.PI / 2));

      fadeInAudio.volume = Math.max(0, Math.min(1, inVol));
      fadeOutAudio.volume = Math.max(0, Math.min(1, outVol));

      if (progress < 1) {
        this.crossfadeTimer = window.setTimeout(step, 40);
      } else {
        this.crossfadeTimer = null;
        fadeOutAudio.pause();
        fadeOutAudio.removeAttribute('src');
        fadeOutAudio.load();
        fadeInAudio.volume = targetVol;
      }
    };

    step();
  }

  public async play(): Promise<void> {
    try {
      await this.primaryAudio.play();
    } catch (err) {
      console.warn('[AudioEngine] Play error:', err);
    }
  }

  public pause(): void {
    this.primaryAudio.pause();
  }

  public seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.primaryAudio.currentTime = Math.max(
        0,
        Math.min(seconds, this.primaryAudio.duration || seconds)
      );
    }
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(volume, 1));
    this.primaryAudio.volume = this.effectiveVolume();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.primaryAudio.muted = muted;
    this.secondaryAudio.muted = muted;
  }

  private effectiveVolume(): number {
    return this.isMuted ? 0 : this.masterVolume;
  }

  public getCurrentTime(): number {
    return this.primaryAudio.currentTime;
  }

  public getDuration(): number {
    return this.primaryAudio.duration || 0;
  }

  private clearCrossfadeTimer() {
    if (this.crossfadeTimer !== null) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
      this.secondaryAudio.pause();
      this.secondaryAudio.removeAttribute('src');
      this.secondaryAudio.load();
    }
  }

  public destroy(): void {
    this.clearCrossfadeTimer();
    this.primaryAudio.pause();
    this.primaryAudio.removeAttribute('src');
    this.primaryAudio.load();
    this.secondaryAudio.pause();
    this.secondaryAudio.removeAttribute('src');
    this.secondaryAudio.load();
  }
}
