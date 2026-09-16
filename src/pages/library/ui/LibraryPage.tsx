import React, { useState } from 'react';
import { useCache } from '../../../entities/track/model/cache-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useSession } from '../../../entities/session/model/session-context';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import type { Playlist } from '../../../entities/playlist/model/types';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { PlaylistCard } from '../../../widgets/playlist-card/ui/PlaylistCard';
import { PlaylistDetailModal } from '../../../widgets/playlist-detail/ui/PlaylistDetailModal';
import { useTranslation } from '../../../shared/lib/i18n';
import './LibraryGlider.css';

type LibraryTab = 'soundcloud' | 'my-likes' | 'cached' | 'playlists';

export const LibraryPage: React.FC = () => {
  const { cachedTracks, refreshCache } = useCache();
  const {
    likedTracks,
    soundCloudTracks,
    isLoadingSoundCloud,
    soundCloudError,
    refreshSoundCloud,
  } = useLikes();
  const { session, openOAuthModal } = useSession();
  const { savedPlaylists, isLoading: isLoadingPlaylists, refreshSavedPlaylists, createCustomPlaylist } = usePlaylists();
  const { messages } = useTranslation();

  const [activeTab, setActiveTab] = useState<LibraryTab>('soundcloud');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleOpenDetails = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setIsModalOpen(true);
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const created = await createCustomPlaylist(newTitle.trim());
      setNewTitle('');
      setIsCreating(false);
      setSelectedPlaylist(created);
      setIsModalOpen(true);
    } catch (err) {
      console.error('Failed to create custom playlist:', err);
    }
  };

  return (
    <div className="flex flex-col gap-space-lg max-w-6xl w-full">
      {/* Top Bar: Centered Switcher + Refresh */}
      <div className="animate-cascade relative flex items-center justify-center pb-space-sm border-b border-zinc-900 w-full min-h-[36px]" style={{ animationDelay: '0ms' }}>
        {/* Glass Radio Group with Spring Glider (Order: soundcloud, my-likes, cached, playlists) */}
        <div className="glass-radio-group">
          {/* 1. SoundCloud */}
          <input
            type="radio"
            name="library-tab"
            id="library-tab-soundcloud"
            checked={activeTab === 'soundcloud'}
            onChange={() => setActiveTab('soundcloud')}
          />
          <label htmlFor="library-tab-soundcloud">
            <i className="ri-soundcloud-line text-xs"></i>
            <span>{messages.library.soundcloud_tab || 'SoundCloud'}</span>
          </label>

          {/* 2. Мои лайки */}
          <input
            type="radio"
            name="library-tab"
            id="library-tab-my-likes"
            checked={activeTab === 'my-likes'}
            onChange={() => setActiveTab('my-likes')}
          />
          <label htmlFor="library-tab-my-likes">
            <i className="ri-heart-3-line text-xs"></i>
            <span>{messages.library.my_likes_tab || 'Мои лайки'}</span>
          </label>

          {/* 3. Сохраненки */}
          <input
            type="radio"
            name="library-tab"
            id="library-tab-cached"
            checked={activeTab === 'cached'}
            onChange={() => setActiveTab('cached')}
          />
          <label htmlFor="library-tab-cached">
            <i className="ri-hard-drive-2-line text-xs"></i>
            <span>{messages.library.saved_tab || messages.library.offline_tab || 'Сохраненки'}</span>
          </label>

          {/* 4. Плейлисты */}
          <input
            type="radio"
            name="library-tab"
            id="library-tab-playlists"
            checked={activeTab === 'playlists'}
            onChange={() => setActiveTab('playlists')}
          />
          <label htmlFor="library-tab-playlists">
            <i className="ri-play-list-2-line text-xs"></i>
            <span>{messages.library.playlists_tab || 'Плейлисты'}</span>
          </label>

          <div className="glass-glider" />
        </div>

        {/* Refresh button */}
        <div className="absolute right-0 flex items-center gap-2">
          {activeTab === 'soundcloud' && session.is_authenticated ? (
            <button
              type="button"
              onClick={refreshSoundCloud}
              disabled={isLoadingSoundCloud}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors disabled:opacity-50"
              title="Обновить SoundCloud"
            >
              <i className={`ri-refresh-line text-[16px] ${isLoadingSoundCloud ? 'animate-spin' : ''}`}></i>
            </button>
          ) : activeTab === 'cached' ? (
            <button
              type="button"
              onClick={refreshCache}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors"
              title="Обновить кэш"
            >
              <i className="ri-refresh-line text-[16px]"></i>
            </button>
          ) : activeTab === 'playlists' ? (
            <button
              type="button"
              onClick={refreshSavedPlaylists}
              disabled={isLoadingPlaylists}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors disabled:opacity-50"
              title="Обновить плейлисты"
            >
              <i className={`ri-refresh-line text-[16px] ${isLoadingPlaylists ? 'animate-spin' : ''}`}></i>
            </button>
          ) : null}
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'soundcloud' ? (
        !session.is_authenticated ? (
          /* Guest prompt for SoundCloud */
          <div className="animate-cascade p-8 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col items-center text-center gap-4 my-6 max-w-lg mx-auto" style={{ animationDelay: '60ms' }}>
            <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <i className="ri-soundcloud-line text-2xl"></i>
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-headline-sm text-base text-white font-semibold">
                {messages.library.guest_soundcloud_title || messages.library.guest_likes_title}
              </h3>
              <p className="font-body-sm text-xs text-zinc-400 leading-relaxed max-w-sm">
                {messages.library.guest_soundcloud_desc || messages.library.guest_likes_desc}
              </p>
            </div>
            <button
              type="button"
              onClick={openOAuthModal}
              className="mt-2 px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <i className="ri-soundcloud-line text-base"></i>
              <span>{messages.auth.login_btn}</span>
            </button>
          </div>
        ) : isLoadingSoundCloud && soundCloudTracks.length === 0 ? (
          <div className="animate-cascade flex flex-col items-center justify-center py-20 text-zinc-500 gap-3" style={{ animationDelay: '60ms' }}>
            <i className="ri-loader-4-line text-3xl animate-spin text-zinc-400"></i>
            <span className="font-body-sm text-sm">{messages.library.loading_soundcloud || messages.library.loading_likes}</span>
          </div>
        ) : soundCloudError && soundCloudTracks.length === 0 ? (
          <div className="animate-cascade p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-red-300 text-xs flex items-center justify-between" style={{ animationDelay: '60ms' }}>
            <span>{soundCloudError}</span>
            <button
              type="button"
              onClick={refreshSoundCloud}
              className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-medium transition-colors"
            >
              Повторить
            </button>
          </div>
        ) : (
          <TrackTable tracks={soundCloudTracks} emptyMessage={messages.library.empty_soundcloud || messages.library.empty_likes} />
        )
      ) : activeTab === 'my-likes' ? (
        /* Мои лайки: Freakcloud internal likes */
        <TrackTable tracks={likedTracks} emptyMessage={messages.library.empty_my_likes || messages.library.empty_likes} />
      ) : activeTab === 'cached' ? (
        /* Сохраненки: Offline cached tracks */
        <TrackTable tracks={cachedTracks} emptyMessage={messages.library.empty_saved || messages.library.empty_offline} />
      ) : (
        /* Плейлисты */
        <div className="flex flex-col gap-4 animate-cascade" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-base text-white font-semibold">
                {messages.library.playlists_title || 'Ваши сохранённые плейлисты'}
              </span>
              <span className="text-xs text-zinc-500 font-mono">({savedPlaylists.length})</span>
            </div>

            <button
              type="button"
              onClick={() => setIsCreating(!isCreating)}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <i className={isCreating ? 'ri-close-line' : 'ri-add-line'}></i>
              <span>{isCreating ? 'Отмена' : (messages.library.create_playlist || 'Создать плейлист')}</span>
            </button>
          </div>

          {/* New Playlist Form */}
          {isCreating && (
            <form onSubmit={handleCreatePlaylist} className="p-4 bg-zinc-950 border border-zinc-800 flex items-center gap-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Название нового плейлиста..."
                autoFocus
                className="flex-1 bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="px-4 py-1.5 bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                Создать
              </button>
            </form>
          )}

          {/* Playlists Grid or Empty State */}
          {savedPlaylists.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center text-zinc-400 gap-3 bg-zinc-950 p-8 border border-zinc-800">
              <i className="ri-play-list-2-line text-4xl text-zinc-600"></i>
              <p className="font-headline-sm text-base text-white font-medium">
                {messages.library.empty_playlists_title || 'Нет сохраненных плейлистов'}
              </p>
              <p className="font-body-sm text-xs max-w-sm text-zinc-500">
                {messages.library.empty_playlists_desc || 'Вы можете искать интересные плейлисты через поиск и сохранять их в медиатеку в один клик.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {savedPlaylists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  onOpenDetails={handleOpenDetails}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Playlist Details Modal */}
      <PlaylistDetailModal
        playlist={selectedPlaylist}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
