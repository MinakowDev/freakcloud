import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { TrackTable } from '../../track-list/ui/TrackTable';
import { PlaylistCard } from '../../playlist-card/ui/PlaylistCard';
import { PlaylistDetailModal } from '../../playlist-detail/ui/PlaylistDetailModal';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useTranslation } from '../../../shared/lib/i18n';
import {
  loadTasteGraph,
  getEffectiveWeight,
  boostNode,
  dampenNode,
  blacklistNode,
  unblacklistNode,
} from '../../../entities/track/lib/taste-graph';
import type { Track } from '../../../entities/track/model/types';
import type { Playlist } from '../../../entities/playlist/model/types';
import { entityCache } from '../../../shared/lib/entity-cache';

export const ArtistDetailModal: React.FC = () => {
  const { selectedArtist, isOpen, closeArtist } = useArtist();
  const { messages } = useTranslation();
  const { playTrack, setWaveMode } = usePlayer();
  const { likedTracks, soundCloudTracks } = useLikes();
  const { cachedTracks } = useCache();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Playlist[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Playlist | null>(null);
  const [artistTab, setArtistTab] = useState<'tracks' | 'albums'>('tracks');
  const [isLoading, setIsLoading] = useState(false);
  const [tasteRefresh, setTasteRefresh] = useState(0);

  // Taste status for current artist
  const tasteInfo = useMemo(() => {
    if (!selectedArtist) return null;
    const graph = loadTasteGraph();
    const clean = selectedArtist.trim().toLowerCase();
    const isBlacklisted = (graph.blacklist?.artists || []).some(
      (a) => a.toLowerCase() === clean
    );
    const node = graph.artists[clean];
    const weight = node ? getEffectiveWeight(node) : 0;
    return {
      isBlacklisted,
      weight,
      listenCount: node?.listenCount || 0,
      likeCount: node?.likeCount || 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArtist, tasteRefresh]);

  // Load tracks and albums when opened
  useEffect(() => {
    if (!isOpen || !selectedArtist) {
      setTracks([]);
      setAlbums([]);
      setArtistTab('tracks');
      setSelectedAlbum(null);
      return;
    }

    // 0. Check in-memory entity cache (0ms instant lookup)
    const cachedArtist = entityCache.getCachedArtist(selectedArtist);
    if (cachedArtist) {
      setTracks(cachedArtist.tracks);
      setAlbums(cachedArtist.albums);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const cleanArtist = selectedArtist.trim().toLowerCase();

    // 1. Collect relevant local tracks first
    const allUserTracks = [...likedTracks, ...soundCloudTracks, ...cachedTracks];
    const localMatches = allUserTracks.filter(
      (t: Track) => t && t.artist && t.artist.trim().toLowerCase() === cleanArtist
    );

    // Initial local pool deduplicated
    const trackMap = new Map<number, Track>();
    localMatches.forEach((t: Track) => trackMap.set(t.id, t));

    Promise.allSettled([
      tauriApi.searchTracks(selectedArtist, 40),
      tauriApi.searchAlbums(selectedArtist, 12),
    ])
      .then(([tracksResult, albumsResult]) => {
        if (!isMounted) return;

        let finalTracks: Track[] = Array.from(trackMap.values());
        let finalAlbums: Playlist[] = [];

        if (tracksResult.status === 'fulfilled') {
          const remoteTracks = tracksResult.value;
          remoteTracks.forEach((t) => {
            if (!trackMap.has(t.id)) {
              trackMap.set(t.id, t);
            }
          });
          finalTracks = Array.from(trackMap.values());
          finalTracks.sort((a, b) => {
            const aExact = a.artist?.trim().toLowerCase() === cleanArtist ? 1 : 0;
            const bExact = b.artist?.trim().toLowerCase() === cleanArtist ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            return (b.playback_count || 0) - (a.playback_count || 0);
          });
        }

        if (albumsResult.status === 'fulfilled') {
          finalAlbums = albumsResult.value;
        }

        setTracks(finalTracks);
        setAlbums(finalAlbums);

        // Store in entity cache
        entityCache.setCachedArtist(selectedArtist, {
          tracks: finalTracks,
          albums: finalAlbums,
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to fetch artist details:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedArtist, likedTracks, soundCloudTracks, cachedTracks]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeArtist();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeArtist]);

  const handlePlayAll = useCallback(async () => {
    if (tracks.length > 0) {
      await playTrack(tracks[0], tracks);
    }
  }, [tracks, playTrack]);

  const handleStartWave = useCallback(async () => {
    if (tracks.length > 0) {
      setWaveMode(true);
      await playTrack(tracks[0], tracks);
    }
  }, [tracks, playTrack, setWaveMode]);

  const handleBoost = () => {
    if (!selectedArtist) return;
    boostNode('artist', selectedArtist);
    setTasteRefresh((r) => r + 1);
  };

  const handleDampen = () => {
    if (!selectedArtist) return;
    dampenNode('artist', selectedArtist);
    setTasteRefresh((r) => r + 1);
  };

  const handleToggleBlacklist = () => {
    if (!selectedArtist) return;
    if (tasteInfo?.isBlacklisted) {
      unblacklistNode('artist', selectedArtist);
    } else {
      blacklistNode('artist', selectedArtist);
    }
    setTasteRefresh((r) => r + 1);
  };

  const handleOpenSoundCloud = () => {
    if (!selectedArtist) return;
    const url = `https://soundcloud.com/search?q=${encodeURIComponent(selectedArtist)}`;
    tauriApi.openExternal(url);
  };

  if (!isOpen || !selectedArtist) return null;

  // Best artwork candidate
  const artworkCandidate = tracks.find((t) => t.artwork_url)?.artwork_url;
  const avatarUrl = artworkCandidate
    ? artworkCandidate.replace('-large.', '-t500x500.')
    : undefined;

  const totalDurationMinutes = Math.floor(
    tracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0) / 1000 / 60
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-none"
      onClick={closeArtist}
    >
      <div
        className="neu-card-static relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800/90 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-900/80 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-5 min-w-0">
            {/* Avatar in Recessed Neumorphic Frame */}
            <div className="neu-inset w-24 h-24 sm:w-28 sm:h-28 rounded-full shrink-0 overflow-hidden relative flex items-center justify-center p-1">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={selectedArtist}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center text-zinc-600 bg-zinc-950">
                  <i className="ri-user-voice-line text-3xl" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Blacklisted Badge if blocked */}
                {tasteInfo?.isBlacklisted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-red-950/60 text-red-300 border border-red-800/50">
                    <i className="ri-forbid-line text-xs" />
                    {messages.artist?.blacklisted || 'В чёрном списке'}
                  </span>
                )}

                <span className="text-xs text-zinc-500 font-mono">
                  {tracks.length} {messages.artist?.tracks.toLowerCase() || 'треков'}
                  {totalDurationMinutes > 0 && ` • ${totalDurationMinutes} мин`}
                </span>
              </div>

              <h2
                className="font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight truncate"
                title={selectedArtist}
              >
                {selectedArtist}
              </h2>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0}
                  className="neu-button-primary px-4 py-2 font-semibold text-xs flex items-center gap-2 rounded-xl disabled:opacity-50"
                  title={messages.artist?.play_all || 'Воспроизвести всё'}
                >
                  <i className="ri-play-fill text-base" />
                  <span>{messages.artist?.play_all || 'Воспроизвести всё'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartWave}
                  disabled={tracks.length === 0}
                  className="neu-button px-3.5 py-2 text-white font-medium text-xs flex items-center gap-2 rounded-xl disabled:opacity-50"
                  title={messages.artist?.start_wave || 'Волна артиста'}
                >
                  <i className="ri-radio-2-line text-sm text-cyan-400" />
                  <span>{messages.artist?.start_wave || 'Волна артиста'}</span>
                </button>

                {/* Taste tuning buttons */}
                <div className="flex items-center gap-1.5 ml-1 border-l border-zinc-800/80 pl-2.5">
                  <button
                    type="button"
                    onClick={handleBoost}
                    className="neu-button w-8 h-8 rounded-lg text-zinc-400 hover:text-emerald-400 flex items-center justify-center"
                    title={messages.artist?.boost || 'Усилить в графе вкусов'}
                  >
                    <i className="ri-thumb-up-line text-xs" />
                  </button>

                  <button
                    type="button"
                    onClick={handleDampen}
                    className="neu-button w-8 h-8 rounded-lg text-zinc-400 hover:text-amber-400 flex items-center justify-center"
                    title={messages.artist?.dampen || 'Ослабить в графе вкусов'}
                  >
                    <i className="ri-thumb-down-line text-xs" />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleBlacklist}
                    className={`neu-button w-8 h-8 rounded-lg flex items-center justify-center ${
                      tasteInfo?.isBlacklisted
                        ? 'text-red-400 bg-red-950/50 border-red-800/60'
                        : 'text-zinc-400 hover:text-red-400'
                    }`}
                    title={
                      tasteInfo?.isBlacklisted
                        ? messages.artist?.unblacklist || 'Разблокировать'
                        : messages.artist?.blacklist || 'В чёрный список'
                    }
                  >
                    <i className="ri-forbid-line text-xs" />
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenSoundCloud}
                    className="neu-button w-8 h-8 rounded-lg text-zinc-400 hover:text-orange-400 flex items-center justify-center ml-1"
                    title={messages.artist?.open_soundcloud || 'SoundCloud профиль'}
                  >
                    <i className="ri-external-link-line text-xs" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={closeArtist}
            className="neu-button w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white self-end sm:self-start shrink-0"
            title={messages.artist?.close || 'Закрыть'}
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Navigation / Filter Tabs */}
        <div className="px-6 pt-3 pb-2.5 border-b border-zinc-900 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setArtistTab('tracks')}
              className={`neu-button px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                artistTab === 'tracks'
                  ? 'text-white border-zinc-600 bg-zinc-800/90'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <i className="ri-music-2-line text-xs" />
              <span>{messages.artist?.tracks || 'Треки'}</span>
              <span className="font-mono text-[10px] opacity-75">({tracks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setArtistTab('albums')}
              className={`neu-button px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                artistTab === 'albums'
                  ? 'text-amber-300 border-amber-600/40 bg-zinc-800/90'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <i className="ri-disc-line text-xs" />
              <span>{messages.artist?.albums || 'Альбомы'}</span>
              <span className="font-mono text-[10px] opacity-75">({albums.length})</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 bg-black/40">
          {artistTab === 'tracks' ? (
            isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
                <i className="ri-loader-4-line text-3xl animate-spin text-zinc-400" />
                <span className="font-mono text-xs">
                  {messages.artist?.loading_tracks || 'Загрузка треков артиста...'}
                </span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-zinc-600 text-center">
                <i className="ri-music-2-line text-3xl text-zinc-700" />
                <span className="font-body-md text-sm text-zinc-400">
                  {messages.artist?.no_tracks || 'Треки артиста не найдены'}
                </span>
              </div>
            ) : (
              <TrackTable tracks={tracks} />
            )
          ) : albums.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-zinc-600 text-center">
              <i className="ri-disc-line text-3xl text-zinc-700" />
              <span className="font-body-md text-sm text-zinc-400">
                {messages.artist?.no_albums || 'Альбомы артиста не найдены'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {albums.map((album) => (
                <PlaylistCard
                  key={album.id}
                  playlist={album}
                  onOpenDetails={setSelectedAlbum}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedAlbum && (
        <PlaylistDetailModal
          playlist={selectedAlbum}
          isOpen={Boolean(selectedAlbum)}
          onClose={() => setSelectedAlbum(null)}
        />
      )}
    </div>
  );
};
