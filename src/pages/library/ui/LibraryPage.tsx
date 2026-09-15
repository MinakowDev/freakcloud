import React, { useState } from 'react';
import { useCache } from '../../../entities/track/model/cache-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useSession } from '../../../entities/session/model/session-context';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { useTranslation } from '../../../shared/lib/i18n';
import './LibraryGlider.css';

type LibraryTab = 'cached' | 'likes';

export const LibraryPage: React.FC = () => {
  const { cachedTracks, refreshCache } = useCache();
  const { likedTracks, isLoading: isLoadingLikes, error: likesError, refreshLikes } = useLikes();
  const { session, openOAuthModal } = useSession();
  const { messages } = useTranslation();

  const [activeTab, setActiveTab] = useState<LibraryTab>('cached');

  return (
    <div className="flex flex-col gap-space-lg max-w-6xl w-full">
      {/* Top Bar: Centered Switcher + Refresh */}
      <div className="animate-cascade relative flex items-center justify-center pb-space-sm border-b border-zinc-900 w-full min-h-[36px]" style={{ animationDelay: '0ms' }}>
        {/* Glass Radio Group with Spring Glider */}
        <div className="glass-radio-group">
          <input
            type="radio"
            name="library-tab"
            id="library-tab-cached"
            checked={activeTab === 'cached'}
            onChange={() => setActiveTab('cached')}
          />
          <label htmlFor="library-tab-cached">
            <i className="ri-hard-drive-2-line text-xs"></i>
            <span>{messages.library.offline_tab}</span>
          </label>

          <input
            type="radio"
            name="library-tab"
            id="library-tab-likes"
            checked={activeTab === 'likes'}
            onChange={() => setActiveTab('likes')}
          />
          <label htmlFor="library-tab-likes">
            <i className="ri-heart-3-line text-xs"></i>
            <span>{messages.library.likes_tab}</span>
          </label>

          <div className="glass-glider" />
        </div>

        {/* Refresh button */}
        <div className="absolute right-0 flex items-center gap-2">
          {activeTab === 'cached' ? (
            <button
              type="button"
              onClick={refreshCache}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors"
              title="Обновить кэш"
            >
              <i className="ri-refresh-line text-[16px]"></i>
            </button>
          ) : session.is_authenticated ? (
            <button
              type="button"
              onClick={refreshLikes}
              disabled={isLoadingLikes}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors disabled:opacity-50"
              title="Обновить лайки"
            >
              <i className={`ri-refresh-line text-[16px] ${isLoadingLikes ? 'animate-spin' : ''}`}></i>
            </button>
          ) : null}
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'cached' ? (
        <TrackTable tracks={cachedTracks} emptyMessage={messages.library.empty_offline} />
      ) : !session.is_authenticated ? (
        /* Guest prompt for likes */
        <div className="animate-cascade p-8 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col items-center text-center gap-4 my-6 max-w-lg mx-auto" style={{ animationDelay: '60ms' }}>
          <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
            <i className="ri-heart-3-line text-2xl"></i>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-headline-sm text-base text-white font-semibold">
              {messages.library.guest_likes_title}
            </h3>
            <p className="font-body-sm text-xs text-zinc-400 leading-relaxed max-w-sm">
              {messages.library.guest_likes_desc}
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
      ) : isLoadingLikes && likedTracks.length === 0 ? (
        <div className="animate-cascade flex flex-col items-center justify-center py-20 text-zinc-500 gap-3" style={{ animationDelay: '60ms' }}>
          <i className="ri-loader-4-line text-3xl animate-spin text-zinc-400"></i>
          <span className="font-body-sm text-sm">{messages.library.loading_likes}</span>
        </div>
      ) : likesError && likedTracks.length === 0 ? (
        <div className="animate-cascade p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-red-300 text-xs flex items-center justify-between" style={{ animationDelay: '60ms' }}>
          <span>{likesError}</span>
          <button
            type="button"
            onClick={refreshLikes}
            className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-medium transition-colors"
          >
            Повторить
          </button>
        </div>
      ) : (
        <TrackTable tracks={likedTracks} emptyMessage={messages.library.empty_likes} />
      )}
    </div>
  );
};
