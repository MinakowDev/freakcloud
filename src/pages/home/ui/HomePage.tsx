import React, { useCallback } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { useCache } from '../../../entities/track/model/cache-context';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { WaveDeck } from '../../../widgets/wave-deck/ui/WaveDeck';
import { DynamicGreeting } from '../../../widgets/greeting/ui/DynamicGreeting';
import { TasteVibes } from '../../../widgets/taste-vibes/ui/TasteVibes';
import { TasteProfileCard } from '../../../widgets/taste-profile/ui/TasteProfileCard';
import { AlbumRecommendations } from '../../../widgets/album-recommendations/ui/AlbumRecommendations';
import { PlaylistRecommendations } from '../../../widgets/playlist-recommendations/ui/PlaylistRecommendations';
import { SupportBanner } from '../../../widgets/support-banner/ui/SupportBanner';
import type { PageView } from '../../../widgets/sidebar/ui/Sidebar';

interface HomePageProps {
  onNavigate?: (page: PageView) => void;
  onSelectQuery?: (query: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onSelectQuery }) => {
  const { messages } = useTranslation();
  const { cachedTracks } = useCache();

  const handleSelectVibe = useCallback((query: string) => {
    if (onSelectQuery) {
      onSelectQuery(query);
    } else if (onNavigate) {
      onNavigate('search');
    }
  }, [onSelectQuery, onNavigate]);

  const handleOpenTasteGraph = useCallback(() => {
    if (onNavigate) {
      onNavigate('taste-graph');
    }
  }, [onNavigate]);

  return (
    <div className="flex flex-col gap-space-xl max-w-6xl w-full">
      {/* 1. Dynamic Greeting */}
      <DynamicGreeting />

      {/* 2. Taste Vibes chips */}
      <TasteVibes onSelectVibe={handleSelectVibe} />

      {/* 3. Personal Wave Deck */}
      <WaveDeck />

      {/* 4. Album Recommendations */}
      <AlbumRecommendations />

      {/* 5. Two-column: Taste Profile + Recent Tracks */}
      <div className="home-bottom-grid">
        {/* Left: Taste Profile Card */}
        <TasteProfileCard onOpenTasteGraph={handleOpenTasteGraph} />

        {/* Right: Recent / Cached Tracks */}
        <section className="animate-cascade flex flex-col gap-space-sm" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-space-xs pb-space-xs">
            <i className="ri-music-2-line text-zinc-400 text-[20px]" />
            <h2 className="font-headline-sm text-headline-sm text-white tracking-tight">
              {cachedTracks.length > 0 ? messages.library.offline_tab : messages.home.recent_tracks}
            </h2>
          </div>
          <TrackTable
            tracks={cachedTracks.slice(0, 10)}
            emptyMessage={messages.home.empty_recent}
          />
        </section>
      </div>

      {/* 6. Curated Playlist Recommendations */}
      <PlaylistRecommendations />

      {/* 7. GitHub Support Banner */}
      <SupportBanner />
    </div>
  );
};
