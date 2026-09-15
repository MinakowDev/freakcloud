import React from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { useCache } from '../../../entities/track/model/cache-context';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { WaveDeck } from '../../../widgets/wave-deck/ui/WaveDeck';
import type { PageView } from '../../../widgets/sidebar/ui/Sidebar';

interface HomePageProps {
  onNavigate?: (page: PageView) => void;
}

export const HomePage: React.FC<HomePageProps> = () => {
  const { messages } = useTranslation();
  const { cachedTracks } = useCache();

  return (
    <div className="flex flex-col gap-space-xl max-w-6xl w-full">
      {/* 1. Greeting */}
      <section className="animate-cascade flex flex-col gap-space-sm" style={{ animationDelay: '0ms' }}>
        <h1 className="font-headline-md text-headline-md text-white tracking-tight">
          {messages.home.greeting}
        </h1>
      </section>

      {/* 2. Personal Stream Deck */}
      <WaveDeck />

      {/* 3. Recent or Cached Tracks Section */}
      <section className="animate-cascade flex flex-col gap-space-sm" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between pb-space-xs">
          <div className="flex items-center gap-space-xs">
            <i className="ri-music-2-line text-zinc-400 text-[20px]"></i>
            <h2 className="font-headline-sm text-headline-sm text-white tracking-tight">
              {cachedTracks.length > 0 ? messages.library.offline_tab : messages.home.recent_tracks}
            </h2>
          </div>
        </div>

        <TrackTable
          tracks={cachedTracks.slice(0, 10)}
          emptyMessage={messages.home.empty_recent}
        />
      </section>
    </div>
  );
};
