import React, { useState } from 'react';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { generatePersonalWave } from '../../../entities/track/lib/wave-algorithm';
import './WaveDeck.css';

export const WaveDeck: React.FC = () => {
  const { messages } = useTranslation();
  const { isPlaying, playTrack, togglePlayPause, isWaveMode, setWaveMode } = usePlayer();
  const { cachedTracks } = useCache();
  const { likedTracks, soundCloudTracks } = useLikes();

  const [isLoadingWave, setIsLoadingWave] = useState(false);

  const handleToggleWave = async () => {
    // If wave is already active, clicking toggles playback
    if (isWaveMode) {
      togglePlayPause();
      return;
    }

    try {
      setIsLoadingWave(true);
      const waveTracks = await generatePersonalWave('discover', likedTracks, cachedTracks, soundCloudTracks);

      if (waveTracks.length > 0) {
        await playTrack(waveTracks[0], waveTracks);
        setWaveMode(true);
      }
    } catch (err) {
      console.error('[WaveDeck] Failed to generate wave:', err);
    } finally {
      setIsLoadingWave(false);
    }
  };

  // Animated equalizer spectrum bar heights and delays
  const SPECTRUM_BARS = [
    { delay: '0.1s', dur: '0.9s' },
    { delay: '0.35s', dur: '1.2s' },
    { delay: '0.05s', dur: '0.8s' },
    { delay: '0.5s', dur: '1.3s' },
    { delay: '0.2s', dur: '1.0s' },
    { delay: '0.4s', dur: '1.1s' },
    { delay: '0.15s', dur: '0.85s' },
    { delay: '0.3s', dur: '1.15s' },
    { delay: '0.45s', dur: '0.95s' },
    { delay: '0.25s', dur: '1.25s' },
    { delay: '0.1s', dur: '0.9s' },
    { delay: '0.35s', dur: '1.05s' },
  ];

  return (
    <div className="animate-cascade wave-deck-card w-full" style={{ animationDelay: '50ms' }}>
      {/* Left side: Icon + Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0 text-white">
          <i className="ri-radar-line text-lg"></i>
        </div>
        <div className="flex flex-col min-w-0">
          <h2 className="font-headline-md text-base sm:text-lg text-white font-semibold tracking-tight truncate">
            {messages.wave.title}
          </h2>
          <span className="text-xs text-zinc-400 truncate">
            {messages.wave.badge}
          </span>
        </div>
      </div>

      {/* Right side: Tactile Waveform Spectrum & Play Trigger */}
      <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
        {/* Equalizer Spectrum Bars */}
        <div className="flex items-center gap-1 h-7 px-1">
          {SPECTRUM_BARS.map((bar, idx) => (
            <div
              key={idx}
              className={`spectrum-bar ${isPlaying && isWaveMode ? 'playing' : ''}`}
              style={{
                animationDelay: bar.delay,
                animationDuration: bar.dur,
              }}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleToggleWave}
          disabled={isLoadingWave}
          className="btn-launch-wave"
        >
          {isLoadingWave ? (
            <>
              <i className="ri-loader-4-line text-base animate-spin"></i>
              <span>{messages.wave.loading}</span>
            </>
          ) : isWaveMode && isPlaying ? (
            <>
              <i className="ri-pause-fill text-base"></i>
              <span>{messages.wave.pause}</span>
            </>
          ) : (
            <>
              <i className="ri-play-fill text-base"></i>
              <span>{isWaveMode ? messages.wave.resume : messages.wave.launch}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
