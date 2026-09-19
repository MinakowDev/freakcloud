import { tauriApi } from '../../../shared/api/tauri-client';

export type AudioEngineStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface AudioEngineListeners {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onStatusChange?: (status: AudioEngineStatus) => void;
  onTrackEnded?: () => void;
  onError?: (err: unknown) => void;
}

export class AudioEngine {
  private listeners: AudioEngineListeners = {};
  private currentTime = 0;
  private duration = 0;
  private masterVolume = 0.8;
  private isMuted = false;
  private unlisteners: Array<() => void> = [];

  // Fallback HTML5 audio for non-Tauri browser environments
  private fallbackAudio: HTMLAudioElement | null = null;

  constructor() {
    if (tauriApi.isTauri()) {
      this.initTauriListeners();
    } else {
      this.initFallbackAudio();
    }
  }

  public setListeners(listeners: AudioEngineListeners) {
    this.listeners = listeners;
  }

  private async initTauriListeners() {
    try {
      const unTime = await tauriApi.onPlayerTime(({ current_time, duration }) => {
        this.currentTime = current_time;
        this.duration = duration;
        this.listeners.onTimeUpdate?.(current_time, duration);
      });
      if (unTime) this.unlisteners.push(unTime);

      const unStatus = await tauriApi.onPlayerStatus((status) => {
        const mappedStatus: AudioEngineStatus =
          status === 'playing'
            ? 'playing'
            : status === 'paused'
            ? 'paused'
            : status === 'buffering'
            ? 'buffering'
            : status === 'ended'
            ? 'ended'
            : 'idle';
        this.listeners.onStatusChange?.(mappedStatus);
      });
      if (unStatus) this.unlisteners.push(unStatus);

      const unEnded = await tauriApi.onPlayerEnded(() => {
        this.listeners.onStatusChange?.('ended');
        this.listeners.onTrackEnded?.();
      });
      if (unEnded) this.unlisteners.push(unEnded);
    } catch (err) {
      console.warn('[AudioEngine] Failed to bind Tauri player events:', err);
    }
  }

  private initFallbackAudio() {
    this.fallbackAudio = new Audio();
    this.fallbackAudio.preload = 'auto';

    this.fallbackAudio.addEventListener('timeupdate', () => {
      if (!this.fallbackAudio) return;
      this.currentTime = this.fallbackAudio.currentTime;
      this.duration = this.fallbackAudio.duration || 0;
      this.listeners.onTimeUpdate?.(this.currentTime, this.duration);
    });

    this.fallbackAudio.addEventListener('playing', () => {
      this.listeners.onStatusChange?.('playing');
    });

    this.fallbackAudio.addEventListener('pause', () => {
      if (!this.fallbackAudio?.ended) {
        this.listeners.onStatusChange?.('paused');
      }
    });

    this.fallbackAudio.addEventListener('waiting', () => {
      this.listeners.onStatusChange?.('buffering');
    });

    this.fallbackAudio.addEventListener('ended', () => {
      this.listeners.onStatusChange?.('ended');
      this.listeners.onTrackEnded?.();
    });

    this.fallbackAudio.addEventListener('error', () => {
      this.listeners.onStatusChange?.('error');
      this.listeners.onError?.(this.fallbackAudio?.error ?? null);
    });
  }

  /**
   * Loads a track and starts playback immediately without fade in / fade out.
   */
  public async load(url: string, isLocal = false): Promise<void> {
    this.currentTime = 0;

    if (tauriApi.isTauri()) {
      try {
        this.listeners.onStatusChange?.('buffering');
        await tauriApi.playerLoadAndPlay(url, isLocal);
        this.listeners.onStatusChange?.('playing');
      } catch (err) {
        console.error('[AudioEngine] Rust playback error:', err);
        this.listeners.onStatusChange?.('error');
        this.listeners.onError?.(err);
      }
      return;
    }

    if (this.fallbackAudio) {
      this.fallbackAudio.src = url;
      this.fallbackAudio.volume = this.effectiveVolume();
      this.fallbackAudio.load();
      try {
        await this.fallbackAudio.play();
      } catch (err) {
        console.warn('[AudioEngine] Playback blocked or failed:', err);
      }
    }
  }

  public async play(): Promise<void> {
    if (tauriApi.isTauri()) {
      try {
        await tauriApi.playerPlay();
        this.listeners.onStatusChange?.('playing');
      } catch (err) {
        console.warn('[AudioEngine] play error:', err);
      }
      return;
    }

    try {
      await this.fallbackAudio?.play();
    } catch (err) {
      console.warn('[AudioEngine] Fallback play error:', err);
    }
  }

  public pause(): void {
    if (tauriApi.isTauri()) {
      tauriApi.playerPause().catch((err) => console.warn('[AudioEngine] pause error:', err));
      this.listeners.onStatusChange?.('paused');
      return;
    }

    this.fallbackAudio?.pause();
  }

  public seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.currentTime = Math.max(0, seconds);

    if (tauriApi.isTauri()) {
      tauriApi.playerSeek(seconds).catch((err) => console.warn('[AudioEngine] seek error:', err));
      return;
    }

    if (this.fallbackAudio) {
      this.fallbackAudio.currentTime = Math.max(
        0,
        Math.min(seconds, this.fallbackAudio.duration || seconds)
      );
    }
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(volume, 1));

    if (tauriApi.isTauri()) {
      tauriApi
        .playerSetVolume(this.masterVolume)
        .catch((err) => console.warn('[AudioEngine] setVolume error:', err));
      return;
    }

    if (this.fallbackAudio) {
      this.fallbackAudio.volume = this.effectiveVolume();
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;

    if (tauriApi.isTauri()) {
      tauriApi
        .playerSetMuted(muted)
        .catch((err) => console.warn('[AudioEngine] setMuted error:', err));
      return;
    }

    if (this.fallbackAudio) {
      this.fallbackAudio.muted = muted;
    }
  }

  private effectiveVolume(): number {
    return this.isMuted ? 0 : this.masterVolume;
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getDuration(): number {
    return this.duration;
  }

  public destroy(): void {
    for (const un of this.unlisteners) {
      un();
    }
    this.unlisteners = [];

    if (tauriApi.isTauri()) {
      tauriApi.playerStop().catch(() => {});
    }

    if (this.fallbackAudio) {
      this.fallbackAudio.pause();
      this.fallbackAudio.removeAttribute('src');
      this.fallbackAudio.load();
    }
  }
}
