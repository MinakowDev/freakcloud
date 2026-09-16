import React, { useMemo } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { useArtist } from '../../../entities/artist/model/artist-context';
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
  const { openArtist } = useArtist();

  const profile = useMemo(() => {
    const graph = loadTasteGraph();
    return computeProfile(graph);
  }, []);

  return (
    <div className="neu-card-static flex flex-col gap-4 p-5 rounded-2xl h-full select-none">
      {/* Header */}
      <div
        className="flex items-center justify-between pb-3 border-b border-white/[0.06] group cursor-pointer"
        onClick={onOpenTasteGraph}
        title={m.open_taste_graph || 'Открыть граф вкусов'}
      >
        <div className="flex items-center gap-2.5">
          <div className="neu-button w-8 h-8 rounded-lg flex items-center justify-center text-amber-400">
            <i className="ri-node-tree text-base" />
          </div>
          <div className="flex flex-col">
            <h3 className="font-headline-sm text-sm text-white font-bold tracking-tight group-hover:text-amber-300 transition-colors">
              {m.title}
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono">
              {profile.tracksInMemory > 0 ? `${profile.tracksInMemory} треков в анализе` : m.subtitle}
            </span>
          </div>
        </div>
        <div className="neu-button w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
          <i className="ri-arrow-right-up-line text-sm" />
        </div>
      </div>

      {!profile.hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500 py-6 gap-2">
          <i className="ri-compass-discover-line text-2xl text-zinc-600" />
          <p className="text-xs text-zinc-400 max-w-xs">{m.not_enough_data}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 flex-1">
          {/* Top genres bars */}
          {profile.topGenres.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                {m.top_genres}
              </span>
              <div className="flex flex-col gap-2.5">
                {profile.topGenres.map((g) => (
                  <div key={g.name} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-300 w-24 truncate font-medium">
                      {g.name}
                    </span>
                    <div className="neu-inset flex-1 h-2 rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-300 transition-all duration-500"
                        style={{ width: `${g.pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400 w-9 text-right font-semibold">
                      {g.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top artist */}
          {profile.topArtist && (
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                {m.top_artist}
              </span>
              <button
                type="button"
                onClick={() => openArtist(profile.topArtist!)}
                className="text-xs text-amber-300 font-semibold truncate max-w-[180px] hover:text-white transition-colors focus:outline-none flex items-center gap-1"
                title={messages.artist?.open_card_hint || 'Открыть карточку артиста'}
              >
                <span>{profile.topArtist}</span>
                <i className="ri-arrow-right-s-line text-xs" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tactile Action Button */}
      <button
        type="button"
        className="neu-button w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-between transition-colors mt-auto"
        onClick={onOpenTasteGraph}
      >
        <span>{m.open_taste_graph}</span>
        <i className="ri-arrow-right-line text-xs text-zinc-400" />
      </button>
    </div>
  );
};
