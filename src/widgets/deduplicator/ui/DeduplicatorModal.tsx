import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Track } from '../../../entities/track/model/types';
import {
  findDuplicateClusters,
  type DuplicateCluster,
} from '../../../entities/track/lib/deduplicator';
import { useLikes } from '../../../entities/track/model/likes-context';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { getRecentPlayedTracks } from '../../../entities/track/lib/taste-graph';
import { getLocalTracks, saveLocalTracks } from '../../../entities/playlist/lib/smart-playlists';
import { useConfirm } from '../../../shared/lib/confirm-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { formatDurationMs } from '../../../entities/track/lib/format-time';
import { STORAGE_KEYS } from '../../../shared/config';

type DeduplicatorScope = 'likes' | 'playlist' | 'history' | 'local';

interface DeduplicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: DeduplicatorScope;
  initialPlaylistId?: number;
}

export const DeduplicatorModal: React.FC<DeduplicatorModalProps> = ({
  isOpen,
  onClose,
  initialScope = 'likes',
  initialPlaylistId,
}) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { likedTracks, unlikeTrack } = useLikes();
  const { savedPlaylists, savePlaylist } = usePlaylists();

  const [scope, setScope] = useState<DeduplicatorScope>(initialScope);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number>(() => {
    if (initialPlaylistId) return initialPlaylistId;
    const custom = savedPlaylists.filter((p) => !p.is_album);
    return custom.length > 0 ? custom[0].id : 0;
  });

  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<number>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const customPlaylists = useMemo(
    () => savedPlaylists.filter((p) => !p.is_album),
    [savedPlaylists]
  );

  // Determine track pool based on active scope
  const targetTracks = useMemo<Track[]>(() => {
    switch (scope) {
      case 'likes':
        return likedTracks;
      case 'playlist': {
        const pl = customPlaylists.find((p) => p.id === selectedPlaylistId);
        return pl?.tracks || [];
      }
      case 'history':
        return getRecentPlayedTracks();
      case 'local':
        return getLocalTracks();
      default:
        return [];
    }
  }, [scope, likedTracks, customPlaylists, selectedPlaylistId]);

  // Scan handler
  const handleScan = useCallback(() => {
    setIsScanning(true);
    setSuccessMessage(null);

    // Subtle timeout to allow smooth UI transition
    setTimeout(() => {
      const found = findDuplicateClusters(targetTracks);
      setClusters(found);

      // By default select all found duplicate IDs
      const allDupIds = new Set<number>();
      found.forEach((c) => {
        c.duplicates.forEach((d) => allDupIds.add(d.id));
      });
      setSelectedDuplicateIds(allDupIds);

      setIsScanning(false);
      setHasScanned(true);
    }, 150);
  }, [targetTracks]);

  // Reset scan state on scope change or open
  useEffect(() => {
    if (isOpen) {
      setHasScanned(false);
      setClusters([]);
      setSelectedDuplicateIds(new Set());
      setSuccessMessage(null);
    }
  }, [isOpen, scope, selectedPlaylistId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleDuplicateSelection = (id: number) => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const totalDups = clusters.reduce((acc, c) => acc + c.duplicates.length, 0);
    if (selectedDuplicateIds.size === totalDups) {
      setSelectedDuplicateIds(new Set());
    } else {
      const next = new Set<number>();
      clusters.forEach((c) => {
        c.duplicates.forEach((d) => next.add(d.id));
      });
      setSelectedDuplicateIds(next);
    }
  };

  const handleCleanDuplicates = async () => {
    if (selectedDuplicateIds.size === 0) return;

    const ok = await confirm({
      title: t('deduplicator.confirm_title'),
      message: t('deduplicator.confirm_desc').replace('{count}', String(selectedDuplicateIds.size)),
      confirmText: t('deduplicator.clean_btn'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });

    if (!ok) return;

    const toRemove = selectedDuplicateIds;

    if (scope === 'likes') {
      for (const id of Array.from(toRemove)) {
        await unlikeTrack(id);
      }
    } else if (scope === 'playlist') {
      const pl = customPlaylists.find((p) => p.id === selectedPlaylistId);
      if (pl && pl.tracks) {
        const updatedTracks = pl.tracks.filter((t) => !toRemove.has(t.id));
        await savePlaylist({
          ...pl,
          tracks: updatedTracks,
          track_count: updatedTracks.length,
        });
      }
    } else if (scope === 'history') {
      const currentHistory = getRecentPlayedTracks();
      const updatedHistory = currentHistory.filter((t) => !toRemove.has(t.id));
      localStorage.setItem(STORAGE_KEYS.RECENT_TRACKS, JSON.stringify(updatedHistory));
      window.dispatchEvent(new Event('freakcloud_history_updated'));
    } else if (scope === 'local') {
      const currentLocal = getLocalTracks();
      const updatedLocal = currentLocal.filter((t) => !toRemove.has(t.id));
      saveLocalTracks(updatedLocal);
    }

    setSuccessMessage(
      t('deduplicator.success_cleaned').replace('{count}', String(toRemove.size))
    );
    setClusters([]);
    setSelectedDuplicateIds(new Set());
    setHasScanned(false);
  };

  const totalDuplicatesCount = clusters.reduce((acc, c) => acc + c.duplicates.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      <div className="neu-card-static relative w-full max-w-3xl max-h-[85vh] bg-[#14161a] border border-white/10 flex flex-col overflow-hidden rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <i className="ri-file-copy-2-line text-lg" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-base font-semibold text-white tracking-tight">
                {t('deduplicator.modal_title')}
              </h2>
              <p className="text-xs text-zinc-400">
                {t('deduplicator.modal_subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title={t('common.cancel')}
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Scope Selector Toolbar */}
        <div className="p-4 border-b border-white/5 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setScope('likes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                scope === 'likes'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {t('deduplicator.scope_likes')} ({likedTracks.length})
            </button>

            {customPlaylists.length > 0 && (
              <button
                type="button"
                onClick={() => setScope('playlist')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                  scope === 'playlist'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {t('deduplicator.scope_playlist')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setScope('history')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                scope === 'history'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {t('deduplicator.scope_history')}
            </button>

            <button
              type="button"
              onClick={() => setScope('local')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                scope === 'local'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {t('deduplicator.scope_local')}
            </button>
          </div>

          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning || targetTracks.length < 2}
            className="neu-button px-4 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            {isScanning ? (
              <i className="ri-loader-4-line text-sm animate-spin" />
            ) : (
              <i className="ri-search-eye-line text-sm" />
            )}
            <span>{t('deduplicator.scan_btn')}</span>
          </button>
        </div>

        {/* Playlist selection sub-toolbar if scope === 'playlist' */}
        {scope === 'playlist' && customPlaylists.length > 0 && (
          <div className="px-4 py-2.5 bg-zinc-950/40 border-b border-white/5 flex items-center gap-3">
            <span className="text-xs text-zinc-400">{t('deduplicator.select_playlist')}:</span>
            <select
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(Number(e.target.value))}
              className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-700"
            >
              {customPlaylists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.title} ({pl.tracks?.length || 0} треков)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[260px]">
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 font-mono">
              <i className="ri-checkbox-circle-line text-sm" />
              <span>{successMessage}</span>
            </div>
          )}

          {!hasScanned && !isScanning && !successMessage && (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center">
                <i className="ri-file-search-line text-2xl" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <p className="text-sm font-semibold text-white">
                  {t('deduplicator.ready_title')}
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {t('deduplicator.ready_desc').replace('{count}', String(targetTracks.length))}
                </p>
              </div>
            </div>
          )}

          {isScanning && (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-3">
              <i className="ri-loader-4-line text-3xl animate-spin text-orange-400" />
              <p className="text-xs text-zinc-400 font-mono">
                {t('deduplicator.analyzing')}
              </p>
            </div>
          )}

          {hasScanned && clusters.length === 0 && !isScanning && (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <i className="ri-check-double-line text-2xl" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <p className="text-sm font-semibold text-white">
                  {t('deduplicator.no_duplicates_title')}
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {t('deduplicator.no_duplicates_desc')}
                </p>
              </div>
            </div>
          )}

          {hasScanned && clusters.length > 0 && !isScanning && (
            <div className="space-y-3.5">
              {/* Toolbar above cluster list */}
              <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <span>{t('deduplicator.found_clusters')}: {clusters.length}</span>
                  <span>•</span>
                  <span>{t('deduplicator.duplicates_total')}: {totalDuplicatesCount}</span>
                </div>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {selectedDuplicateIds.size === totalDuplicatesCount
                    ? t('deduplicator.deselect_all')
                    : t('deduplicator.select_all')}
                </button>
              </div>

              {/* Cluster items */}
              {clusters.map((cluster) => {
                const canon = cluster.canonicalTrack;

                return (
                  <div
                    key={cluster.id}
                    className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-3"
                  >
                    {/* Canonical Track */}
                    <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-zinc-800/60">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-zinc-950 overflow-hidden shrink-0 border border-zinc-800">
                          {canon.artwork_url ? (
                            <img
                              src={canon.artwork_url}
                              alt={canon.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <i className="ri-music-2-line text-sm" />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-semibold text-white truncate">
                            {canon.title}
                          </span>
                          <span className="text-[11px] text-zinc-400 truncate">
                            {canon.artist}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-emerald-400 font-mono">
                          {t('deduplicator.keep_original')}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          {formatDurationMs(canon.duration_ms || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Duplicates in this cluster */}
                    <div className="pl-4 space-y-2 border-l-2 border-orange-500/30">
                      {cluster.duplicates.map((dup) => {
                        const isSelected = selectedDuplicateIds.has(dup.id);

                        return (
                          <div
                            key={dup.id}
                            onClick={() => toggleDuplicateSelection(dup.id)}
                            className={`p-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors border ${
                              isSelected
                                ? 'bg-orange-500/10 border-orange-500/30 text-zinc-200'
                                : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-400 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDuplicateSelection(dup.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-orange-500 cursor-pointer"
                              />

                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs text-zinc-300 truncate">
                                  {dup.title}
                                </span>
                                <span className="text-[11px] text-zinc-500 truncate">
                                  {dup.artist}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-orange-400/80 font-mono">
                                {Math.round(cluster.confidence * 100)}% {t('deduplicator.match')}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">
                                {formatDurationMs(dup.duration_ms || 0)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/5 bg-zinc-950/60 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 font-mono">
            {hasScanned && (
              <span>
                {t('deduplicator.selected_to_remove')}: {selectedDuplicateIds.size}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>

            {hasScanned && clusters.length > 0 && (
              <button
                type="button"
                onClick={handleCleanDuplicates}
                disabled={selectedDuplicateIds.size === 0}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <i className="ri-delete-bin-line text-sm" />
                <span>
                  {t('deduplicator.clean_btn')} ({selectedDuplicateIds.size})
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
