import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '../../../entities/session/model/session-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { formatBytes } from '../../../entities/track/lib/format-time';
import { useTranslation } from '../../../shared/lib/i18n';
import { useConfirm } from '../../../shared/lib/confirm-context';
import { Switch } from '../../../shared/ui/Switch';
import { tauriApi } from '../../../shared/api/tauri-client';
import { entityCache } from '../../../shared/lib/entity-cache';
import { loadTasteGraph, resetTasteGraph, clearTasteBlacklist } from '../../../entities/track/lib/taste-graph';
import { ImportPlaylistModal } from '../../../widgets/import-playlist';
import { DeduplicatorModal } from '../../../widgets/deduplicator';
import { windowsMediaControls } from '../../../entities/player/lib/windows-media-controls';

import { STORAGE_KEYS } from '../../../shared/config';
import { LOUDNESS_NORM_EVENT } from '../../../entities/player/lib/loudness';
import type { Track } from '../../../entities/track/model/types';
import {
  getLocalTracks,
  saveLocalTracks,
  getLocalMusicDir,
  saveLocalMusicDir,
} from '../../../entities/playlist/lib/smart-playlists';

export const SettingsPage: React.FC = () => {
  const { session, loginWithToken, openOAuthModal, logout, isLoading, error } = useSession();
  const { cacheStats, clearCache, autoCache, setAutoCache } = useCache();
  const { isWaveMode, setWaveMode } = usePlayer();
  const { locale, setLocale, t } = useTranslation();
  const confirm = useConfirm();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeduplicatorOpen, setIsDeduplicatorOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [tasteMessage, setTasteMessage] = useState<string | null>(null);

  // Audio settings
  const [audioQuality, setAudioQuality] = useState<'original' | 'hq' | 'standard'>(() => {
    return (localStorage.getItem(STORAGE_KEYS.AUDIO_QUALITY) as 'original' | 'hq' | 'standard') || 'original';
  });
  const [volumeNorm, setVolumeNorm] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.VOLUME_NORM) !== 'false';
  });
  const [globalShortcuts, setGlobalShortcuts] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.GLOBAL_SHORTCUTS) !== 'false';
  });

  // Windows Media Controls (SMTC)
  const [windowsMediaControlsState, setWindowsMediaControlsState] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.WINDOWS_MEDIA_CONTROLS) !== 'false';
  });

  // Tray Mini-Player Widget
  const [trayWidgetEnabled, setTrayWidgetEnabledState] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.TRAY_WIDGET_ENABLED) !== 'false';
  });

  // Discord RPC
  const [discordRpc, setDiscordRpc] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.DISCORD_RPC_ENABLED) !== 'false';
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
    localStorage.setItem(STORAGE_KEYS.AUDIO_QUALITY, q);
  };

  const handleVolumeNormChange = (enabled: boolean) => {
    setVolumeNorm(enabled);
    localStorage.setItem(STORAGE_KEYS.VOLUME_NORM, String(enabled));
    window.dispatchEvent(new CustomEvent(LOUDNESS_NORM_EVENT));
  };

  const handleToggleGlobalShortcuts = async (enabled: boolean) => {
    setGlobalShortcuts(enabled);
    localStorage.setItem(STORAGE_KEYS.GLOBAL_SHORTCUTS, String(enabled));
    if (tauriApi.isTauri()) {
      await tauriApi.setGlobalShortcutsEnabled(enabled);
    }
  };

  const handleToggleWindowsMediaControls = (enabled: boolean) => {
    setWindowsMediaControlsState(enabled);
    windowsMediaControls.setEnabled(enabled);
  };

  const handleToggleTrayWidget = async (enabled: boolean) => {
    setTrayWidgetEnabledState(enabled);
    localStorage.setItem(STORAGE_KEYS.TRAY_WIDGET_ENABLED, String(enabled));
    if (tauriApi.isTauri()) {
      await tauriApi.setTrayWidgetEnabled(enabled);
    }
  };

  const handleToggleDiscordRpc = async (enabled: boolean) => {
    setDiscordRpc(enabled);
    localStorage.setItem(STORAGE_KEYS.DISCORD_RPC_ENABLED, String(enabled));
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
    const ok = await confirm({
      title: t('settings.clear_cache_title'),
      message: t('settings.clear_cache_desc'),
      confirmText: t('common.clear'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });
    if (ok) {
      await clearCache();
      setCacheMessage(t('settings.cache_cleared'));
      setTimeout(() => setCacheMessage(null), 3000);
    }
  };

  const handleClearMetadataCache = async () => {
    const ok = await confirm({
      title: t('settings.clear_metadata_title'),
      message: t('settings.clear_metadata_desc'),
      confirmText: t('common.clear'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });
    if (ok) {
      entityCache.clearEntityCache();
      setEntityStats(entityCache.getEntityCacheStats());
      setMetadataMessage(t('settings.metadata_cleared'));
      setTimeout(() => setMetadataMessage(null), 3000);
    }
  };

  const handleResetTasteGraph = async () => {
    const ok = await confirm({
      title: t('settings.taste_reset_title'),
      message: t('settings.taste_reset_desc'),
      confirmText: t('common.reset'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });
    if (ok) {
      resetTasteGraph();
      refreshTasteStats();
      setTasteMessage(t('settings.taste_reset_success'));
      setTimeout(() => setTasteMessage(null), 3000);
    }
  };

  const handleClearBlacklist = async () => {
    const ok = await confirm({
      title: t('settings.clear_blacklist_title'),
      message: t('settings.clear_blacklist_desc'),
      confirmText: t('common.clear'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });
    if (ok) {
      clearTasteBlacklist();
      refreshTasteStats();
      setTasteMessage(t('settings.blacklist_cleared'));
      setTimeout(() => setTasteMessage(null), 3000);
    }
  };

  const handleOpenLogs = async () => {
    if (tauriApi.isTauri()) {
      await tauriApi.openLogDir();
    }
  };

  // Local Music Files
  const [localMusicDir, setLocalMusicDir] = useState<string | null>(() => getLocalMusicDir());
  const [localTracks, setLocalTracks] = useState<Track[]>(() => getLocalTracks());
  const [isScanning, setIsScanning] = useState(false);
  const [localScanMessage, setLocalScanMessage] = useState<string | null>(null);

  const handlePickFolder = async () => {
    try {
      const selected = await tauriApi.pickLocalMusicFolder();
      if (!selected) return;
      saveLocalMusicDir(selected);
      setLocalMusicDir(selected);
      setIsScanning(true);
      setLocalScanMessage(null);
      const scanned = await tauriApi.scanLocalFolder(selected);
      saveLocalTracks(scanned);
      setLocalTracks(scanned);
      setLocalScanMessage(t('settings.local_scan_success').replace('{count}', String(scanned.length)));
      setTimeout(() => setLocalScanMessage(null), 4000);
    } catch (err) {
      console.error('[Settings] Failed to scan local folder:', err);
      setLocalScanMessage(String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleRescanFolder = async () => {
    if (!localMusicDir || isScanning) return;
    try {
      setIsScanning(true);
      setLocalScanMessage(null);
      const scanned = await tauriApi.scanLocalFolder(localMusicDir);
      saveLocalTracks(scanned);
      setLocalTracks(scanned);
      setLocalScanMessage(t('settings.local_scan_success').replace('{count}', String(scanned.length)));
      setTimeout(() => setLocalScanMessage(null), 4000);
    } catch (err) {
      console.error('[Settings] Failed to rescan local folder:', err);
      setLocalScanMessage(String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveFolder = async () => {
    const ok = await confirm({
      title: t('settings.remove_folder_confirm_title'),
      message: t('settings.remove_folder_confirm_desc'),
      confirmText: t('common.remove'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });
    if (ok) {
      saveLocalMusicDir(null);
      saveLocalTracks([]);
      setLocalMusicDir(null);
      setLocalTracks([]);
      setLocalScanMessage(null);
    }
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
                  className="neu-button-primary px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-2 flex-shrink-0 disabled:opacity-50"
                >
                  {isLoading ? (
                    <i className="ri-loader-4-line text-base animate-spin"></i>
                  ) : (
                    <i className="ri-puzzle-line text-sm"></i>
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

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Logs & Diagnostics */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('settings.logs_title')}
              </span>
              <span className="text-xs text-zinc-400">
                {t('settings.logs_desc')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenLogs}
              className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-300 hover:text-white text-xs font-semibold"
            >
              {t('settings.open_logs_btn')}
            </button>
          </div>

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Import Music */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('import.modal_title')}
              </span>
              <span className="text-xs text-zinc-400">
                {t('import.modal_subtitle')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <i className="ri-download-cloud-2-line text-sm text-orange-400" />
              <span>{t('import.import_action')}</span>
            </button>
          </div>

          <div className="h-[1px] w-full bg-zinc-900/60" />

          {/* Deduplicator / Clean Duplicates */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-white">
                {t('deduplicator.settings_title')}
              </span>
              <span className="text-xs text-zinc-400">
                {t('deduplicator.settings_desc')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsDeduplicatorOpen(true)}
              className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <i className="ri-file-copy-2-line text-sm text-orange-400" />
              <span>{t('deduplicator.settings_btn')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 6. Local Music Files Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-folder-music-line text-base text-sky-400"></i>
          <span>{t('settings.local_music_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1 max-w-lg">
              <span className="text-sm font-semibold text-white">
                {t('settings.local_music_title')}
              </span>
              <span className="text-xs text-zinc-400">
                {t('settings.local_music_desc')}
              </span>
              {localMusicDir ? (
                <div className="flex items-center gap-1.5 text-xs text-sky-400 font-mono mt-1 break-all">
                  <i className="ri-folder-line text-sm shrink-0" />
                  <span>{localMusicDir}</span>
                </div>
              ) : (
                <span className="text-xs text-zinc-500 italic mt-0.5">
                  {t('settings.local_folder_not_selected')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handlePickFolder}
                disabled={isScanning}
                className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-200 hover:text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
              >
                <i className="ri-folder-open-line text-sm" />
                <span>{localMusicDir ? t('settings.change_folder_btn') : t('settings.choose_folder_btn')}</span>
              </button>

              {localMusicDir && (
                <>
                  <button
                    type="button"
                    onClick={handleRescanFolder}
                    disabled={isScanning}
                    className="neu-button px-3.5 py-1.5 rounded-xl text-zinc-200 hover:text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                    title={t('settings.rescan_folder_btn')}
                  >
                    {isScanning ? (
                      <i className="ri-loader-4-line text-sm animate-spin" />
                    ) : (
                      <i className="ri-refresh-line text-sm" />
                    )}
                    <span>{t('settings.rescan_folder_btn')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveFolder}
                    disabled={isScanning}
                    className="neu-button px-3 py-1.5 rounded-xl text-red-400 hover:text-red-300 border-red-500/20 text-xs font-medium"
                    title={t('settings.remove_folder_btn')}
                  >
                    <i className="ri-delete-bin-line text-sm" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Local tracks stats row */}
          <div className="flex items-center justify-between text-xs text-zinc-400 pt-3 border-t border-zinc-900/60 font-mono">
            <span>{localTracks.length} {t('library.tracks')}</span>
            {localScanMessage && (
              <span className="text-emerald-400 font-sans">{localScanMessage}</span>
            )}
          </div>
        </div>
      </section>

      {/* 7. Discord RPC Section */}
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

      {/* 7. Keyboard Shortcuts & Global Media Keys */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-keyboard-line text-base text-amber-400"></i>
          <span>{t('settings.shortcuts_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="text-sm font-semibold text-white">
              {t('settings.global_shortcuts_title')}
            </span>
            <span className="text-xs text-zinc-400 max-w-md">
              {t('settings.global_shortcuts_desc')}
            </span>
          </div>

          <Switch checked={globalShortcuts} onChange={handleToggleGlobalShortcuts} />
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_play_pause')}</span>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                Space
              </kbd>
              <span className="text-zinc-600 text-xs">/</span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                Ctrl + Alt + Space
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-zinc-900">
            <span className="text-xs text-zinc-300">{t('settings.shortcut_next_prev')}</span>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                Alt + → / ←
              </kbd>
              <span className="text-zinc-600 text-xs">/</span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                Ctrl+Alt+→
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

      {/* 9. Windows Media Controls (SMTC) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-windows-fill text-base text-sky-400"></i>
          <span>{t('settings.windows_media_section')}</span>
        </div>

        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="text-sm font-semibold text-white">
              {t('settings.windows_media_title')}
            </span>
            <span className="text-xs text-zinc-400 max-w-md">
              {t('settings.windows_media_desc')}
            </span>
          </div>

          <Switch checked={windowsMediaControlsState} onChange={handleToggleWindowsMediaControls} />
        </div>

        {/* Tray Mini-Player Widget Switch */}
        <div className="neu-card-static p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="text-sm font-semibold text-white">
              {t('settings.tray_widget_title')}
            </span>
            <span className="text-xs text-zinc-400 max-w-md">
              {t('settings.tray_widget_desc')}
            </span>
          </div>

          <Switch checked={trayWidgetEnabled} onChange={handleToggleTrayWidget} />
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

      {/* Import Playlist Modal */}
      <ImportPlaylistModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Deduplicator Modal */}
      <DeduplicatorModal
        isOpen={isDeduplicatorOpen}
        onClose={() => setIsDeduplicatorOpen(false)}
      />
    </div>
  );
};
