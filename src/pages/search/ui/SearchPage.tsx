import React from 'react';
import type { Track } from '../../../entities/track/model/types';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { useTranslation } from '../../../shared/lib/i18n';

interface SearchPageProps {
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  searchQuery,
  searchResults,
  isSearching,
}) => {
  const { messages } = useTranslation();

  return (
    <div className="flex flex-col gap-space-lg max-w-6xl w-full">
      <div className="animate-cascade flex items-center justify-between" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center gap-space-sm">
          <h1 className="font-headline-md text-headline-md text-white tracking-tight">
            {searchQuery ? `${messages.search.results_title}: "${searchQuery}"` : messages.search.results_title}
          </h1>
          {isSearching && (
            <i className="ri-loader-4-line text-zinc-400 text-[20px] animate-spin"></i>
          )}
        </div>
      </div>

      {!searchQuery && searchResults.length === 0 ? (
        <div className="animate-cascade py-20 flex flex-col items-center justify-center text-center text-zinc-400 gap-space-md bg-zinc-950 rounded-xl p-space-xl border border-zinc-800" style={{ animationDelay: '60ms' }}>
          <i className="ri-search-line text-[42px] text-zinc-600"></i>
          <p className="font-body-md text-body-md max-w-sm text-zinc-400">{messages.search.start_search}</p>
        </div>
      ) : (
        <TrackTable tracks={searchResults} emptyMessage={messages.search.no_results} />
      )}
    </div>
  );
};
