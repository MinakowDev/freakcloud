import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Playlist } from '../../../entities/playlist/model/types';
import {
  generateSmartPlaylists,
  getLocalTracks,
  getLocalMusicDir,
  type SmartPlaylist,
} from '../../../entities/playlist/lib/smart-playlists';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { getRecentPlayedTracks } from '../../../entities/track/lib/taste-graph';
import { useTranslation } from '../../../shared/lib/i18n';

interface SmartPlaylistsSectionProps {
  onOpenDetails: (playlist: Playlist) => void;
  onNavigateToSettings?: () => void;
}

export const SmartPlaylistsSection: React.FC<SmartPlaylistsSectionProps> = ({
  onOpenDetails,
  onNavigateToSettings,
}) => {
  const { likedTracks } = useLikes();
  const { cachedTracks } = useCache();
  const { playTrack } = usePlayer();
  const { t } = useTranslation();

  const [historyTracks, setHistoryTracks] = useState(() => getRecentPlayedTracks());
  const [localTracks, setLocalTracks] = useState(() => getLocalTracks());
  const [localMusicDir, setLocalMusicDir] = useState(() => getLocalMusicDir());
  const [tasteCounter, setTasteCounter] = useState(0);

  const refreshHistory = useCallback(() => {
    setHistoryTracks(getRecentPlayedTracks());
  }, []);

  const refreshLocal = useCallback(() => {
    setLocalTracks(getLocalTracks());
    setLocalMusicDir(getLocalMusicDir());
  }, []);

  const refreshTaste = useCallback(() => {
    setTasteCounter((prev) => prev + 1);
  }, []);

  useEffect(() => {
    window.addEventListener('freakcloud_history_updated', refreshHistory);
    window.addEventListener('freakcloud_local_tracks_updated', refreshLocal);
    window.addEventListener('freakcloud_taste_updated', refreshTaste);

    return () => {
      window.removeEventListener('freakcloud_history_updated', refreshHistory);
      window.removeEventListener('freakcloud_local_tracks_updated', refreshLocal);
      window.removeEventListener('freakcloud_taste_updated', refreshTaste);
    };
  }, [refreshHistory, refreshLocal, refreshTaste]);

  const smartPlaylists = useMemo<SmartPlaylist[]>(() => {
    // tasteCounter is a dependency to re-calculate taste radar on updates
    void tasteCounter;
    return generateSmartPlaylists({
      likedTracks,
      historyTracks,
      cachedTracks,
      localTracks,
      t,
    });
  }, [likedTracks, historyTracks, cachedTracks, localTracks, tasteCounter, t]);

  const handlePlayNow = async (e: React.MouseEvent, pl: SmartPlaylist) => {
    e.stopPropagation();
    if (pl.tracks && pl.tracks.length > 0) {
      await playTrack(pl.tracks[0], pl.tracks);
    }
  };

  const formatTotalTime = (durationMs: number) => {
    const totalMinutes = Math.floor(durationMs / 1000 / 60);
    return `${totalMinutes} ${t('common.min') || 'мин'}`;
  };

  return (
    <div className="flex flex-col gap-3.5 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="ri-sparkling-fill text-amber-400 text-base" />
          <h2 className="text-sm font-semibold text-white tracking-tight">
            {t('smart_playlists.section_title')}
          </h2>
        </div>
        <span className="text-xs text-zinc-500 font-mono">
          {smartPlaylists.length} {t('smart_playlists.auto_mixes')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {smartPlaylists.map((pl) => {
          const trackCount = pl.tracks?.length || 0;
          const isLocal = pl.source === 'local';
          const hasNoLocalDir = isLocal && !localMusicDir;

          return (
            <div
              key={pl.id}
              onClick={() => onOpenDetails(pl)}
              className="group relative flex flex-col justify-between p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90 transition-colors duration-200 cursor-pointer select-none min-h-[148px]"
            >
              {/* Header inside card: Icon and Quick Play */}
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-800/80 border border-zinc-700/60 ${pl.accentColor}`}
                >
                  <i className={`${pl.icon} text-lg`} />
                </div>

                {trackCount > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => handlePlayNow(e, pl)}
                    className="w-8 h-8 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors flex items-center justify-center cursor-pointer shadow-sm"
                    title={t('smart_playlists.play_now')}
                  >
                    <i className="ri-play-fill text-base ml-0.5" />
                  </button>
                ) : hasNoLocalDir && onNavigateToSettings ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToSettings();
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                    title={t('smart_playlists.configure_folder')}
                  >
                    {t('smart_playlists.configure_folder')}
                  </button>
                ) : null}
              </div>

              {/* Title & Description */}
              <div className="flex flex-col gap-1 mt-3">
                <h3 className="text-sm font-semibold text-white tracking-tight truncate">
                  {pl.title}
                </h3>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {pl.description}
                </p>
              </div>

              {/* Footer: Track count and duration */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mt-3 pt-2.5 border-t border-zinc-800/60">
                <span>{trackCount} {t('library.tracks')}</span>
                {trackCount > 0 && (
                  <span>{formatTotalTime(pl.duration_ms)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
