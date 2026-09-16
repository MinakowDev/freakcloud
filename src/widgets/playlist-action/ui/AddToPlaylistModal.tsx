import React, { useState, useMemo } from 'react';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { PlaylistCover } from '../../playlist-card/ui/PlaylistCover';

export const AddToPlaylistModal: React.FC = () => {
  const {
    trackToAddToPlaylist,
    closeAddToPlaylist,
    savedPlaylists,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    createCustomPlaylist,
  } = usePlaylists();
  const { t } = useTranslation();

  const [filterQuery, setFilterQuery] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [busyPlaylistId, setBusyPlaylistId] = useState<number | null>(null);

  if (!trackToAddToPlaylist) return null;

  const customPlaylists = savedPlaylists.filter((p) => !p.is_album);

  const filteredPlaylists = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return customPlaylists;
    return customPlaylists.filter((p) => p.title.toLowerCase().includes(q));
  }, [customPlaylists, filterQuery]);

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isCreating) return;
    try {
      setIsCreating(true);
      const newPlaylist = await createCustomPlaylist(newTitle.trim());
      await addTrackToPlaylist(newPlaylist.id, trackToAddToPlaylist);
      setNewTitle('');
      setShowCreateInput(false);
    } catch (err) {
      console.error('Failed to create and add to playlist:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleTrack = async (playlistId: number, isAlreadyIn: boolean) => {
    if (busyPlaylistId === playlistId) return;
    try {
      setBusyPlaylistId(playlistId);
      if (isAlreadyIn) {
        await removeTrackFromPlaylist(playlistId, trackToAddToPlaylist.id);
      } else {
        await addTrackToPlaylist(playlistId, trackToAddToPlaylist);
      }
    } catch (err) {
      console.error('Failed to toggle track in playlist:', err);
    } finally {
      setBusyPlaylistId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={closeAddToPlaylist}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md rounded-2xl p-6 neu-card-static border border-white/10 bg-[#16181d] shadow-2xl z-10 flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center">
              <i className="ri-play-list-add-line text-lg" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                {t('settings.add_to_playlist')}
              </h2>
              <p className="text-xs text-white/40">Выберите плейлист для сохранения</p>
            </div>
          </div>
          <button
            onClick={closeAddToPlaylist}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        {/* Selected Track Preview Banner */}
        <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
          <img
            src={
              trackToAddToPlaylist.artwork_url ||
              'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80'
            }
            alt=""
            className="w-11 h-11 rounded-lg object-cover bg-black/40 border border-white/10 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-white truncate">
              {trackToAddToPlaylist.title}
            </h4>
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {trackToAddToPlaylist.artist}
            </p>
          </div>
        </div>

        {/* Action / Filter Bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
            <i className="ri-search-line text-xs text-white/40" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Поиск по вашим плейлистам..."
              className="bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none w-full"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCreateInput(!showCreateInput)}
            className="px-3 py-1.5 rounded-xl neu-button text-xs font-semibold flex items-center gap-1.5 text-zinc-300 hover:text-white shrink-0"
          >
            <i className={showCreateInput ? 'ri-close-line' : 'ri-add-line'} />
            <span>Новый</span>
          </button>
        </div>

        {/* Quick Create New Playlist Input */}
        {showCreateInput && (
          <form onSubmit={handleCreateAndAdd} className="mt-2.5 flex gap-2 animate-fade-in">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('library.new_playlist_name')}
              autoFocus
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-black/50 border border-orange-500/40 text-white placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTitle.trim() || isCreating}
              className="neu-button-primary px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 disabled:opacity-40"
            >
              {isCreating ? (
                <i className="ri-loader-4-line animate-spin" />
              ) : (
                <i className="ri-check-line text-sm" />
              )}
              <span>Создать</span>
            </button>
          </form>
        )}

        {/* Playlists List */}
        <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar min-h-[160px]">
          {filteredPlaylists.length === 0 ? (
            <div className="py-10 text-center text-white/40 text-xs flex flex-col items-center gap-2">
              <i className="ri-folder-music-line text-2xl opacity-40" />
              <p>
                {filterQuery
                  ? `Плейлисты по запросу «${filterQuery}» не найдены`
                  : t('library.playlists_empty')}
              </p>
            </div>
          ) : (
            filteredPlaylists.map((p) => {
              const isAlreadyIn = (p.tracks || []).some((t) => t.id === trackToAddToPlaylist.id);
              const isBusy = busyPlaylistId === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => handleToggleTrack(p.id, isAlreadyIn)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                    isAlreadyIn
                      ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/5 flex-shrink-0">
                      <PlaylistCover playlist={p} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {p.title}
                      </div>
                      <div className="text-[11px] text-white/40">
                        {p.track_count || 0} {t('library.tracks')}
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {isBusy ? (
                      <i className="ri-loader-4-line animate-spin text-orange-400 text-base" />
                    ) : isAlreadyIn ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <i className="ri-check-line" />
                        {t('settings.already_in_playlist')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/60 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-full border border-white/10 transition-colors">
                        <i className="ri-add-line" />
                        {t('library.add_playlist')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
