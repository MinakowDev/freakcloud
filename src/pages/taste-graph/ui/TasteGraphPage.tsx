import React, { useMemo, useState } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import {
  loadTasteGraph,
  getEffectiveWeight,
  unblacklistNode,
  boostNode,
  dampenNode,
  blacklistNode,
} from '../../../entities/track/lib/taste-graph';
import { InteractiveTasteGraph } from '../../../widgets/interactive-graph/ui/InteractiveTasteGraph';
import './TasteGraphPage.css';

type PageViewMode = 'graph' | 'list' | 'blacklist';
type ListSubTab = 'genres' | 'artists';

interface RankedItem {
  name: string;
  score: number;
  listenCount: number;
  likeCount: number;
  skipCount: number;
  pct: number;
}

interface TasteGraphPageProps {
  onNavigate?: (page: 'home' | 'search' | 'library' | 'taste-graph' | 'settings') => void;
}

export const TasteGraphPage: React.FC<TasteGraphPageProps> = ({ onNavigate }) => {
  const { messages } = useTranslation();
  const m = messages.taste_profile;

  const [viewMode, setViewMode] = useState<PageViewMode>('graph');
  const [listTab, setListTab] = useState<ListSubTab>('genres');
  const [refreshKey, setRefreshKey] = useState(0);

  const { genres, artists, blacklist, totalTracks } = useMemo(() => {
    const graph = loadTasteGraph();

    const mapEntries = (
      entries: [string, { weight: number; listenCount: number; likeCount: number; skipCount: number; lastInteractedAt: number }][]
    ): RankedItem[] => {
      const ranked = entries
        .map(([name, node]) => ({
          name,
          score: getEffectiveWeight(node),
          listenCount: node.listenCount,
          likeCount: node.likeCount,
          skipCount: node.skipCount,
          pct: 0,
        }))
        .filter((n) => n.score > 0.3)
        .sort((a, b) => b.score - a.score);

      const maxScore = ranked[0]?.score ?? 1;
      return ranked.map((n) => ({ ...n, pct: Math.round((n.score / maxScore) * 100) }));
    };

    return {
      genres: mapEntries(Object.entries(graph.genres)),
      artists: mapEntries(Object.entries(graph.artists)),
      blacklist: graph.blacklist || { artists: [], genres: [] },
      totalTracks: graph.recentPlayedIds.length,
    };
  }, [refreshKey]);

  const handleUnblacklist = (type: 'artist' | 'genre', name: string) => {
    unblacklistNode(type, name);
    setRefreshKey((k) => k + 1);
  };

  const handleListBoost = (type: 'artist' | 'genre', name: string) => {
    boostNode(type, name);
    setRefreshKey((k) => k + 1);
  };

  const handleListDampen = (type: 'artist' | 'genre', name: string) => {
    dampenNode(type, name);
    setRefreshKey((k) => k + 1);
  };

  const handleListBlacklist = (type: 'artist' | 'genre', name: string) => {
    blacklistNode(type, name);
    setRefreshKey((k) => k + 1);
  };

  const items = listTab === 'genres' ? genres : artists;

  return (
    <div className="tg-page max-w-5xl w-full">
      {/* Top Header */}
      <div className="tg-header">
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="w-7 h-7 rounded-[2px] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#141414] border border-[#1a1a1a] transition-colors"
              title={m.back_to_home || 'На главную'}
            >
              <i className="ri-arrow-left-line text-sm" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <i className="ri-node-tree text-white text-[18px]" />
            <div>
              <h1 className="font-headline-sm text-base text-white font-semibold leading-tight tracking-tight">
                {messages.nav.taste_graph || 'Граф вкусов'}
              </h1>
              <p className="font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
                {totalTracks > 0
                  ? `${totalTracks} ${m.tracks_in_memory} // СТУДИЙНАЯ СИМУЛЯЦИЯ`
                  : 'Слушайте музыку для построения графа'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Switcher: Glass Radio Group with Spring Glider */}
      <div className="flex items-center">
        <div className="tg-glass-radio-group">
          {/* 1. Graph */}
          <input
            type="radio"
            name="tg-view-mode"
            id="tg-tab-graph"
            checked={viewMode === 'graph'}
            onChange={() => setViewMode('graph')}
          />
          <label htmlFor="tg-tab-graph">
            <i className="ri-node-tree text-xs" />
            <span>{m.tab_graph || 'Интерактивный граф'}</span>
          </label>

          {/* 2. List */}
          <input
            type="radio"
            name="tg-view-mode"
            id="tg-tab-list"
            checked={viewMode === 'list'}
            onChange={() => setViewMode('list')}
          />
          <label htmlFor="tg-tab-list">
            <i className="ri-list-ordered-2 text-xs" />
            <span>{m.tab_list || 'Рейтинг вкусов'}</span>
          </label>

          {/* 3. Blacklist */}
          <input
            type="radio"
            name="tg-view-mode"
            id="tg-tab-blacklist"
            checked={viewMode === 'blacklist'}
            onChange={() => setViewMode('blacklist')}
          />
          <label htmlFor="tg-tab-blacklist">
            <i className="ri-forbid-line text-xs" />
            <span>{m.tab_blacklist || 'Чёрный список'}</span>
            {(blacklist.artists.length > 0 || blacklist.genres.length > 0) && (
              <span className="font-mono text-[10px] ml-1 text-zinc-400">
                [{blacklist.artists.length + blacklist.genres.length}]
              </span>
            )}
          </label>

          <div className="tg-glass-glider" />
        </div>
      </div>

      {/* Mode 1: Interactive Canvas Graph */}
      {viewMode === 'graph' && (
        <div className="flex flex-col gap-3">
          <InteractiveTasteGraph />
        </div>
      )}

      {/* Mode 2: Ranked Flat List */}
      {viewMode === 'list' && (
        <div className="flex flex-col gap-4">
          {/* Sub-tabs */}
          <div className="tg-tabs">
            <button
              type="button"
              className={`tg-tab ${listTab === 'genres' ? 'tg-tab--active' : ''}`}
              onClick={() => setListTab('genres')}
            >
              {m.top_genres} [{genres.length}]
            </button>
            <button
              type="button"
              className={`tg-tab ${listTab === 'artists' ? 'tg-tab--active' : ''}`}
              onClick={() => setListTab('artists')}
            >
              Исполнители [{artists.length}]
            </button>
          </div>

          <div className="tg-list">
            {items.length === 0 ? (
              <div className="tg-empty">
                <p className="tg-empty__hint">Данных пока нет. Послушайте треки, чтобы сформировать список.</p>
              </div>
            ) : (
              items.map((item, i) => (
                <div key={item.name} className="tg-row group">
                  <span className="tg-row__rank">{String(i + 1).padStart(2, '0')}</span>

                  <div className="tg-row__info">
                    <div className="flex items-center gap-3">
                      <span className="tg-row__name">{item.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleListBoost(listTab === 'genres' ? 'genre' : 'artist', item.name)}
                          className="w-5 h-5 rounded-[2px] flex items-center justify-center text-zinc-500 hover:text-white hover:bg-[#141414]"
                          title="Буст (+)"
                        >
                          <i className="ri-arrow-up-line text-xs" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleListDampen(listTab === 'genres' ? 'genre' : 'artist', item.name)}
                          className="w-5 h-5 rounded-[2px] flex items-center justify-center text-zinc-500 hover:text-white hover:bg-[#141414]"
                          title="Снизить (-)"
                        >
                          <i className="ri-arrow-down-line text-xs" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleListBlacklist(listTab === 'genres' ? 'genre' : 'artist', item.name)}
                          className="w-5 h-5 rounded-[2px] flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-[#141414]"
                          title="В черный список"
                        >
                          <i className="ri-forbid-line text-xs" />
                        </button>
                      </div>
                    </div>

                    <div className="tg-row__bar-track">
                      <div
                        className="tg-row__bar-fill"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="tg-row__meta">
                    {item.listenCount > 0 && (
                      <span>TRK: {item.listenCount}</span>
                    )}
                    {item.likeCount > 0 && (
                      <span className="text-white">LIKES: {item.likeCount}</span>
                    )}
                    {item.skipCount > 0 && (
                      <span>SKIPS: {item.skipCount}</span>
                    )}
                    <span className="tg-row__score">{item.pct}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mode 3: Blacklist Management */}
      {viewMode === 'blacklist' && (
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
            // ЗАБЛОКИРОВАННЫЕ ЭЛЕМЕНТЫ ИСКЛЮЧАЮТСЯ ИЗ МОЕЙ ВОЛНЫ И РЕКОМЕНДАЦИЙ
          </p>

          {blacklist.artists.length === 0 && blacklist.genres.length === 0 ? (
            <div className="py-16 text-center text-zinc-600 bg-[#080808] border border-[#141414] rounded-[2px] flex flex-col items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider">
                {m.empty_blacklist || 'Чёрный список пуст'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {blacklist.genres.length > 0 && (
                <div className="flex flex-col gap-3">
                  <span className="font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    НАПРАВЛЕНИЯ [{blacklist.genres.length}]
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {blacklist.genres.map((g) => (
                      <div key={g} className="px-2.5 py-1 bg-[#0d0d0d] border border-[#1a1a1a] rounded-[2px] text-xs text-zinc-300 flex items-center gap-2">
                        <span className="capitalize">{g}</span>
                        <button
                          type="button"
                          onClick={() => handleUnblacklist('genre', g)}
                          className="text-zinc-600 hover:text-white transition-colors"
                          title={m.unblacklist || 'Разблокировать'}
                        >
                          <i className="ri-close-line text-sm" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {blacklist.artists.length > 0 && (
                <div className="flex flex-col gap-3">
                  <span className="font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    ИСПОЛНИТЕЛИ [{blacklist.artists.length}]
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {blacklist.artists.map((a) => (
                      <div key={a} className="px-2.5 py-1 bg-[#0d0d0d] border border-[#1a1a1a] rounded-[2px] text-xs text-zinc-300 flex items-center gap-2">
                        <span>{a}</span>
                        <button
                          type="button"
                          onClick={() => handleUnblacklist('artist', a)}
                          className="text-zinc-600 hover:text-white transition-colors"
                          title={m.unblacklist || 'Разблокировать'}
                        >
                          <i className="ri-close-line text-sm" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
