import React, { useMemo } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import {
  loadTasteGraph,
  getEffectiveWeight,
  GENRE_STOPWORDS,
  type TasteGraphData,
} from '../../../entities/track/lib/taste-graph';
import './TasteProfileCard.css';

interface TasteProfileCardProps {
  onOpenTasteGraph?: () => void;
}

interface GenreBar {
  name: string;
  pct: number;
}

function computeProfile(graph: TasteGraphData): {
  topGenres: GenreBar[];
  topArtist: string | null;
  tracksInMemory: number;
  hasData: boolean;
} {
  const genreEntries = Object.entries(graph.genres)
    .filter(([name]) => !graph.blacklist?.genres.includes(name.toLowerCase()))
    .map(([name, node]) => ({ name, score: getEffectiveWeight(node) }))
    .filter((g) => g.score > 0.4 && !GENRE_STOPWORDS.has(g.name.toLowerCase().trim()))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const artistEntries = Object.entries(graph.artists)
    .filter(([name]) => !graph.blacklist?.artists.includes(name.toLowerCase()))
    .map(([name, node]) => ({ name, score: getEffectiveWeight(node) }))
    .filter((a) => a.score > 0.4)
    .sort((a, b) => b.score - a.score);

  const maxScore = genreEntries[0]?.score ?? 1;
  const topGenres: GenreBar[] = genreEntries.map((g) => ({
    name: g.name
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    pct: Math.max(8, Math.round((g.score / maxScore) * 100)),
  }));

  return {
    topGenres,
    topArtist: artistEntries[0]?.name ?? null,
    tracksInMemory: graph.recentPlayedIds.length,
    hasData: genreEntries.length > 0 || artistEntries.length > 0,
  };
}

export const TasteProfileCard: React.FC<TasteProfileCardProps> = ({ onOpenTasteGraph }) => {
  const { messages } = useTranslation();
  const m = messages.taste_profile;

  const profile = useMemo(() => {
    const graph = loadTasteGraph();
    return computeProfile(graph);
  }, []);

  return (
    <div className="taste-profile-card">
      {/* Header */}
      <div
        className="taste-profile-card__header group cursor-pointer"
        onClick={onOpenTasteGraph}
        title="Открыть граф вкусов"
      >
        <div className="flex items-center gap-2">
          <i className="ri-node-tree text-white text-[16px]" />
          <h3 className="font-headline-sm text-sm text-white font-semibold tracking-tight">
            {m.title}
          </h3>
        </div>
        <i className="ri-arrow-right-up-line text-zinc-500 group-hover:text-white text-sm transition-colors ml-auto" />
      </div>

      {!profile.hasData ? (
        <p className="taste-profile-card__empty">{m.not_enough_data}</p>
      ) : (
        <div className="flex flex-col gap-4 flex-1">
          {/* Top genres bars (flat, precision meters) */}
          {profile.topGenres.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                {m.top_genres}
              </span>
              <div className="flex flex-col gap-2">
                {profile.topGenres.map((g) => (
                  <div key={g.name} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-300 w-24 truncate font-medium">
                      {g.name}
                    </span>
                    <div className="flex-1 h-[2px] bg-[#1a1a1a]">
                      <div
                        className="h-full bg-white transition-all duration-500"
                        style={{ width: `${g.pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500 w-9 text-right">
                      {g.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top artist (flat direct metadata) */}
          {profile.topArtist && (
            <div className="flex items-baseline justify-between pt-1 border-t border-[#161616]">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                {m.top_artist}
              </span>
              <span className="text-xs text-white font-medium truncate max-w-[180px]">
                {profile.topArtist}
              </span>
            </div>
          )}

          {/* Memory counter */}
          {profile.tracksInMemory > 0 && (
            <div className="flex items-center justify-between font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
              <span>ПРОАНАЛИЗИРОВАНО</span>
              <span>{profile.tracksInMemory} ТРЕКОВ</span>
            </div>
          )}
        </div>
      )}

      {/* Industrial Action Button */}
      <button
        type="button"
        className="taste-profile-card__btn"
        onClick={onOpenTasteGraph}
      >
        <span>{m.open_taste_graph}</span>
        <i className="ri-arrow-right-line text-xs" />
      </button>
    </div>
  );
};
