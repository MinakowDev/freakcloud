import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '../../../entities/session/model/session-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { formatBytes } from '../../../entities/track/lib/format-time';
import { useTranslation } from '../../../shared/lib/i18n';
import { Switch } from '../../../shared/ui/Switch';
import { tauriApi } from '../../../shared/api/tauri-client';
import { entityCache } from '../../../shared/lib/entity-cache';
import { loadTasteGraph, resetTasteGraph, clearTasteBlacklist } from '../../../entities/track/lib/taste-graph';

export const SettingsPage: React.FC = () => {
  const { session, loginWithToken, openOAuthModal, logout, isLoading, error } = useSession();
  const { cacheStats, clearCache, autoCache, setAutoCache } = useCache();
  const { isWaveMode, setWaveMode } = usePlayer();
  const { locale, setLocale, t } = useTranslation();

  const [tokenInput, setTokenInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [tasteMessage, setTasteMessage] = useState<string | null>(null);

  // Audio settings
  const [audioQuality, setAudioQuality] = useState<'original' | 'hq' | 'standard'>(() => {
    return (localStorage.getItem('freakcloud_audio_quality') as 'original' | 'hq' | 'standard') || 'original';
  });
  const [volumeNorm, setVolumeNorm] = useState(() => {
    return localStorage.getItem('freakcloud_volume_norm') === 'true';
  });

  // Discord RPC
  const [discordRpc, setDiscordRpc] = useState(() => {
    return localStorage.getItem('discord_rpc_enabled') !== 'false';
  });

  // Entity cache stats
  const [entityStats, setEntityStats] = useState(() => entityCache.getEntityCacheStats());

  // Taste graph stats
  const [tasteStats, setTasteStats] = useState(() => {
    const graph = loadTasteGraph();
    return {
      artistsCount: Object.keys(graph.artists || {}).length,
      genresCount: Object.keys(graph.genres || {}).length,
      blacklistCount: (graph.blacklist?.artists || []).length + (graph.blacklist?.genres || []).length,
    };
  });

  const refreshTasteStats = useCallback(() => {
    const graph = loadTasteGraph();
    setTasteStats({
      artistsCount: Object.keys(graph.artists || {}).length,
      genresCount: Object.keys(graph.genres || {}).length,
      blacklistCount: (graph.blacklist?.artists || []).length + (graph.blacklist?.genres || []).length,
    });
  }, []);

  useEffect(() => {
    const handler = () => refreshTasteStats();
    window.addEventListener('freakcloud_taste_updated', handler);
    return () => window.removeEventListener('freakcloud_taste_updated', handler);
  }, [refreshTasteStats]);

  const handleAudioQualityChange = (q: 'original' | 'hq' | 'standard') => {
    setAudioQuality(q);
    localStorage.setItem('freakcloud_audio_quality', q);
  };

  const handleVolumeNormChange = (enabled: boolean) => {
    setVolumeNorm(enabled);
    localStorage.setItem('freakcloud_volume_norm', String(enabled));
  };

  const handleToggleDiscordRpc = async (enabled: boolean) => {
    setDiscordRpc(enabled);
    localStorage.setItem('discord_rpc_enabled', String(enabled));
    if (tauriApi.isTauri()) {
      await tauriApi.setDiscordRpcEnabled(enabled);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    const ok = await loginWithToken(tokenInput.trim());
    if (ok) {
      setTokenInput('');
    }
  };

  const handleClearCache = async () => {
    await clearCache();
    setCacheMessage(t('settings.cache_cleared'));
    setTimeout(() => setCacheMessage(null), 3000);
  };

  const handleClearMetadataCache = () => {
    entityCache.clearEntityCache();
    setEntityStats(entityCache.getEntityCacheStats());
    setMetadataMessage(t('settings.metadata_cleared'));
    setTimeout(() => setMetadataMessage(null), 3000);
  };

  const handleResetTasteGraph = () => {
    if (window.confirm('Сбросить профиль вкусов? Анализ прослушиваний начнётся заново.')) {
      resetTasteGraph();
      refreshTasteStats();
      setTasteMessage(t('settings.taste_reset_success'));
      setTimeout(() => setTasteMessage(null), 3000);
    }
  };

  const handleClearBlacklist = () => {
    clearTasteBlacklist();
    refreshTasteStats();
    setTasteMessage(t('settings.blacklist_cleared'));
    setTimeout(() => setTasteMessage(null), 3000);
  };

  return (
    <div className="flex flex-col gap-8 max-w-3xl w-full select-none py-4">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-900/80">
        <h1 className="font-headline-md text-2xl text-white tracking-tight font-bold">
          {t('settings.title')}
        </h1>
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Precision Audio Engine
        </span>
      </div>

      {/* 1. Interface & Language Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-global-line text-base text-amber-400"></i>
          <span>{t('settings.appearance_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="text-sm font-semibold text-white">
              {t('settings.language_title')}
            </span>
            <span className="text-xs text-zinc-400">
              Русский / English interface localization
            </span>
          </div>

          <div className="flex items-center bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setLocale('ru')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                locale === 'ru'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              RU • Русский
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                locale === 'en'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              EN • English
            </button>
          </div>
        </div>
      </section>

      {/* 2. Playback & Sound Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-sound-module-line text-base text-orange-400"></i>
          <span>{t('settings.audio_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex flex-col gap-4">
          {/* Audio Quality */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col pr-4 gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.audio_quality_title')}
              </span>
              <span className="text-xs text-zinc-400">
                {t('settings.audio_quality_desc')}
              </span>
            </div>

            <div className="flex items-center bg-zinc-900/80 p-1 rounded-xl border border-zinc-800 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => handleAudioQualityChange('original')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  audioQuality === 'original'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Автоматический захват 320 kbps MP3 / FLAC / WAV оригинала автора"
              >
                320k • Original
              </button>
              <button
                type="button"
                onClick={() => handleAudioQualityChange('hq')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  audioQuality === 'hq'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                HQ (256 kbps)
              </button>
              <button
                type="button"
                onClick={() => handleAudioQualityChange('standard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  audioQuality === 'standard'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                128 kbps
              </button>
            </div>
          </div>

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Volume Normalization */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col pr-4 gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.volume_norm_title')}
              </span>
              <span className="text-xs text-zinc-400 max-w-md">
                {t('settings.volume_norm_desc')}
              </span>
            </div>

            <Switch checked={volumeNorm} onChange={handleVolumeNormChange} />
          </div>

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Endless Wave */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col pr-4 gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.autoplay_wave_title')}
              </span>
              <span className="text-xs text-zinc-400 max-w-md">
                {t('settings.autoplay_wave_desc')}
              </span>
            </div>

            <Switch checked={isWaveMode} onChange={setWaveMode} />
          </div>
        </div>
      </section>

      {/* 3. Account Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-user-3-line text-base text-cyan-400"></i>
          <span>{t('settings.account_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
          {session.is_authenticated && session.user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                  {session.user.avatar_url ? (
                    <img src={session.user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <i className="ri-user-smile-line text-zinc-400 text-xl"></i>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-white font-semibold">
                    {session.user.username}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {session.user.full_name || t('settings.logged_in_as')}
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl neu-button text-zinc-300 hover:text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {t('settings.logout_btn')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                {t('settings.guest_desc')}
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-white font-semibold flex items-center gap-2">
                    <i className="ri-soundcloud-line text-lg text-[#ff5500]"></i>
                    {t('settings.browser_login_btn')}
                  </span>
                  <span className="text-xs text-zinc-400 max-w-md">
                    {t('settings.browser_login_desc')}
                  </span>
                </div>

                <button
                  onClick={openOAuthModal}
                  disabled={isLoading}
                  className="neu-button-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 flex-shrink-0 disabled:opacity-50"
                >
                  {isLoading ? (
                    <i className="ri-loader-4-line text-base animate-spin"></i>
                  ) : (
                    <i className="ri-external-link-line text-sm"></i>
                  )}
                  <span>{t('settings.browser_login_btn')}</span>
                </button>
              </div>

              {/* Toggleable Manual Token Input */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-zinc-500 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
                >
                  <i className={`ri-arrow-${showManualInput ? 'down' : 'right'}-s-line text-sm`}></i>
                  <span>{t('settings.or_manual_token')}</span>
                </button>

                {showManualInput && (
                  <form onSubmit={handleLogin} className="flex flex-col gap-2 mt-3 pl-3 border-l border-zinc-800">
                    <label className="text-xs text-zinc-400">
                      {t('settings.token_input_label')}
                    </label>
                    <div className="flex gap-2 max-w-lg">
                      <input
                        type="password"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder={t('settings.token_placeholder')}
                        className="flex-1 h-9 px-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 text-xs focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !tokenInput.trim()}
                        className="neu-button px-4 h-9 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {isLoading ? (
                          <i className="ri-loader-4-line text-base animate-spin"></i>
                        ) : (
                          t('settings.login_btn')
                        )}
                      </button>
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {t('settings.how_to_get_token')}
                    </span>
                  </form>
                )}
              </div>

              {error && (
                <span className="text-xs text-red-400">{error}</span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 4. Taste Profile & Recommendations Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-radar-line text-base text-purple-400"></i>
          <span>{t('settings.taste_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.taste_stats_label')}
              </span>
              <span className="text-xs text-zinc-400">
                {tasteStats.artistsCount} артистов • {tasteStats.genresCount} микро-жанров
                {tasteStats.blacklistCount > 0 && ` • ${tasteStats.blacklistCount} в черном списке`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {tasteStats.blacklistCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearBlacklist}
                  className="neu-button px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white text-xs font-medium"
                  title={t('settings.clear_blacklist_btn')}
                >
                  {t('settings.clear_blacklist_btn')}
                </button>
              )}
              <button
                type="button"
                onClick={handleResetTasteGraph}
                className="neu-button px-3 py-1.5 rounded-xl text-red-400 hover:text-red-300 border-red-500/20 text-xs font-medium"
                title={t('settings.taste_reset_desc')}
              >
                {t('settings.taste_reset_btn')}
              </button>
            </div>
          </div>

          {tasteMessage && (
            <span className="text-xs text-emerald-400 font-mono">{tasteMessage}</span>
          )}
        </div>
      </section>

      {/* 5. Caches Section (Audio Storage & Metadata Cache) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-hard-drive-2-line text-base text-emerald-400"></i>
          <span>{t('settings.cache_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex flex-col gap-4">
          {/* Auto-cache */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col pr-4 gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.auto_cache_title')}
              </span>
              <span className="text-xs text-zinc-400 max-w-md">
                {t('settings.auto_cache_desc')}
              </span>
            </div>

            <Switch checked={autoCache} onChange={setAutoCache} />
          </div>

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Audio Storage */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.cache_stats_label')}
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                {cacheStats.total_tracks} {t('library.tracks')} • {formatBytes(cacheStats.total_size_bytes)}
              </span>
            </div>

            <button
              onClick={handleClearCache}
              disabled={cacheStats.total_tracks === 0}
              className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-300 hover:text-white text-xs font-semibold disabled:opacity-40"
            >
              {t('settings.clear_cache_btn')}
            </button>
          </div>

          {cacheMessage && (
            <span className="text-xs text-emerald-400 font-mono">{cacheMessage}</span>
          )}

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Metadata & Cards Cache */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.metadata_cache_title')}
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                {entityStats.playlistsCount} плейлистов/альбомов • {entityStats.artistsCount} артистов в памяти
              </span>
            </div>

            <button
              onClick={handleClearMetadataCache}
              disabled={entityStats.playlistsCount === 0 && entityStats.artistsCount === 0}
              className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-300 hover:text-white text-xs font-semibold disabled:opacity-40"
            >
              {t('settings.clear_metadata_btn')}
            </button>
          </div>

          {metadataMessage && (
            <span className="text-xs text-emerald-400 font-mono">{metadataMessage}</span>
          )}
        </div>
      </section>

      {/* 6. Discord RPC Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-discord-line text-base text-indigo-400"></i>
          <span>{t('settings.discord_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="text-sm font-semibold text-white">
              {t('settings.discord_rpc_title')}
            </span>
            <span className="text-xs text-zinc-400 max-w-md">
              {t('settings.discord_rpc_desc')}
            </span>
          </div>

          <Switch checked={discordRpc} onChange={handleToggleDiscordRpc} />
        </div>
      </section>

      {/* 7. Keyboard Shortcuts Cheatsheet */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-keyboard-line text-base text-amber-400"></i>
          <span>{t('settings.shortcuts_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_play_pause')}</span>
            <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
              Space
            </kbd>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_next_prev')}</span>
            <div className="flex gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                Alt + →
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                Alt + ←
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_mute')}</span>
            <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
              M
            </kbd>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_like')}</span>
            <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
              L
            </kbd>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900 sm:col-span-2">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_close')}</span>
            <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
              Esc
            </kbd>
          </div>
        </div>
      </section>

      {/* 8. About Section */}
      <section className="flex flex-col gap-1 text-zinc-500 pt-2 border-t border-zinc-900">
        <span className="text-xs font-semibold text-zinc-400">
          {t('settings.app_name')}
        </span>
        <span className="text-[11px] text-zinc-600 font-mono">
          {t('settings.version')}
        </span>
      </section>
    </div>
  );
};
