import type { Track } from '../../track/model/types';

export type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'recovering'
  | 'replenishing'
  | 'error';

export type PlayerState =
  | { status: 'idle'; track: null; errorType: null; errorMessage: null }
  | { status: 'loading'; track: Track; errorType: null; errorMessage: null }
  | { status: 'playing'; track: Track; errorType: null; errorMessage: null }
  | { status: 'paused'; track: Track; errorType: null; errorMessage: null }
  | { status: 'buffering'; track: Track; errorType: null; errorMessage: null }
  | { status: 'recovering'; track: Track; errorType: 'drm' | 'stream'; errorMessage: string; attempt: number }
  | { status: 'replenishing'; track: Track | null; errorType: null; errorMessage: null }
  | { status: 'error'; track: Track | null; errorType: 'drm' | 'stream' | 'network'; errorMessage: string };

export type PlayerEvent =
  | { type: 'LOAD_TRACK'; track: Track }
  | { type: 'TRACK_READY' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'BUFFERING_START' }
  | { type: 'BUFFERING_END' }
  | { type: 'STREAM_ERROR'; errorType: 'drm' | 'stream'; message: string; canAutoRecover: boolean; attempt: number }
  | { type: 'RECOVER_NEXT' }
  | { type: 'REPLENISH_START' }
  | { type: 'REPLENISH_SUCCESS'; nextTrack?: Track }
  | { type: 'REPLENISH_FAILED'; message?: string }
  | { type: 'STOP' }
  | { type: 'CLEAR_ERROR' };

export const initialPlayerState: PlayerState = {
  status: 'idle',
  track: null,
  errorType: null,
  errorMessage: null,
};

/**
 * Pure transition function for the Player State Machine.
 * Guarantees deterministic state changes and prevents invalid intermediate states.
 */
export function playerTransition(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case 'LOAD_TRACK':
      return {
        status: 'loading',
        track: event.track,
        errorType: null,
        errorMessage: null,
      };

    case 'TRACK_READY':
      if (state.track) {
        return {
          status: 'playing',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return state;

    case 'PLAY':
      if (state.track) {
        return {
          status: 'playing',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return state;

    case 'PAUSE':
      if (state.track && (state.status === 'playing' || state.status === 'buffering')) {
        return {
          status: 'paused',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return state;

    case 'BUFFERING_START':
      if (state.track && state.status === 'playing') {
        return {
          status: 'buffering',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return state;

    case 'BUFFERING_END':
      if (state.track && state.status === 'buffering') {
        return {
          status: 'playing',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return state;

    case 'STREAM_ERROR':
      if (event.canAutoRecover && state.track) {
        return {
          status: 'recovering',
          track: state.track,
          errorType: event.errorType,
          errorMessage: event.message,
          attempt: event.attempt,
        };
      }
      return {
        status: 'error',
        track: state.track,
        errorType: event.errorType,
        errorMessage: event.message,
      };

    case 'RECOVER_NEXT':
      if (state.status === 'recovering') {
        return {
          status: 'loading',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return state;

    case 'REPLENISH_START':
      return {
        status: 'replenishing',
        track: state.track,
        errorType: null,
        errorMessage: null,
      };

    case 'REPLENISH_SUCCESS':
      if (event.nextTrack) {
        return {
          status: 'loading',
          track: event.nextTrack,
          errorType: null,
          errorMessage: null,
        };
      }
      if (state.track) {
        return {
          status: 'playing',
          track: state.track,
          errorType: null,
          errorMessage: null,
        };
      }
      return initialPlayerState;

    case 'REPLENISH_FAILED':
      return {
        status: 'idle',
        track: null,
        errorType: null,
        errorMessage: null,
      };

    case 'CLEAR_ERROR':
      if (state.status === 'error') {
        if (state.track) {
          return {
            status: 'paused',
            track: state.track,
            errorType: null,
            errorMessage: null,
          };
        }
        return initialPlayerState;
      }
      return state;

    case 'STOP':
      return initialPlayerState;

    default:
      return state;
  }
}

// Selectors
export const isPlayingState = (state: PlayerState): boolean => state.status === 'playing';

export const isBufferingState = (state: PlayerState): boolean =>
  state.status === 'loading' ||
  state.status === 'buffering' ||
  state.status === 'recovering' ||
  state.status === 'replenishing';

export const getPlaybackError = (state: PlayerState): string | null => state.errorType;
