import React, { useState } from 'react';
import { useSession } from '../../../entities/session/model/session-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { formatBytes } from '../../../entities/track/lib/format-time';
import { useTranslation } from '../../../shared/lib/i18n';
import { Switch } from '../../../shared/ui/Switch';
import { tauriApi } from '../../../shared/api/tauri-client';

export const SettingsPage: React.FC = () => {
  const { session, loginWithToken, openOAuthModal, logout, isLoading, error } = useSession();
  const { cacheStats, clearCache, autoCache, setAutoCache } = useCache();
  const { messages } = useTranslation();

  const [tokenInput, setTokenInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [discordRpc, setDiscordRpc] = useState(() => {
    return localStorage.getItem('discord_rpc_enabled') !== 'false';
  });

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
    setCacheMessage(messages.settings.cache_cleared);
    setTimeout(() => setCacheMessage(null), 3000);
  };

  return (
    <div className="flex flex-col gap-space-2xl max-w-3xl w-full select-none py-space-md">
      <h1 className="font-headline-md text-headline-md text-white tracking-tight pb-2 border-b border-zinc-900/80">
        {messages.settings.title}
      </h1>

      {/* 1. Account Section */}
      <section className="flex flex-col gap-space-md">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-user-3-line text-[16px]"></i>
          <span>{messages.settings.account_section}</span>
        </div>

        {session.is_authenticated && session.user ? (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-space-md">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                {session.user.avatar_url ? (
                  <img src={session.user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <i className="ri-user-smile-line text-zinc-400 text-xl"></i>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-body-md text-body-md text-white font-medium">
                  {session.user.username}
                </span>
                <span className="font-label-sm text-label-sm text-zinc-400">
                  {session.user.full_name || messages.settings.logged_in_as}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              disabled={isLoading}
              className="px-space-md py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-body-sm text-xs transition-colors border border-zinc-800/80 disabled:opacity-50"
            >
              {messages.settings.logout_btn}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-space-md py-1">
            <p className="font-body-sm text-body-sm text-zinc-400 max-w-xl leading-relaxed">
              {messages.settings.guest_desc}
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md py-2">
              <div className="flex flex-col gap-1">
                <span className="font-body-md text-white font-medium flex items-center gap-2">
                  <i className="ri-soundcloud-line text-lg text-[#ff5500]"></i>
                  {messages.settings.browser_login_btn}
                </span>
                <span className="font-label-sm text-xs text-zinc-500 max-w-md">
                  {messages.settings.browser_login_desc}
                </span>
              </div>

              <button
                onClick={openOAuthModal}
                disabled={isLoading}
                className="px-space-lg py-2 rounded bg-white text-black font-body-sm text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-sm flex-shrink-0 disabled:opacity-50"
              >
                {isLoading ? (
                  <i className="ri-loader-4-line text-base animate-spin"></i>
                ) : (
                  <i className="ri-external-link-line text-sm"></i>
                )}
                <span>{messages.settings.browser_login_btn}</span>
              </button>
            </div>

            {/* Toggleable Manual Token Input */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowManualInput(!showManualInput)}
                className="text-zinc-500 hover:text-white font-label-sm text-xs flex items-center gap-1.5 transition-colors"
              >
                <i className={`ri-arrow-${showManualInput ? 'down' : 'right'}-s-line text-sm`}></i>
                <span>{messages.settings.or_manual_token}</span>
              </button>

              {showManualInput && (
                <form onSubmit={handleLogin} className="flex flex-col gap-2 mt-3 pl-3 border-l border-zinc-900">
                  <label className="font-label-sm text-xs text-zinc-500">
                    {messages.settings.token_input_label}
                  </label>
                  <div className="flex gap-space-sm max-w-lg">
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder={messages.settings.token_placeholder}
                      className="flex-1 h-8 px-space-sm bg-zinc-950 border border-zinc-800 rounded text-white placeholder:text-zinc-600 font-body-sm text-xs focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !tokenInput.trim()}
                      className="px-space-md h-8 rounded bg-zinc-900 text-white font-body-sm text-xs font-medium hover:bg-zinc-800 transition-colors border border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <i className="ri-loader-4-line text-base animate-spin"></i>
                      ) : (
                        messages.settings.login_btn
                      )}
                    </button>
                  </div>
                  <span className="font-label-sm text-[11px] text-zinc-600">
                    {messages.settings.how_to_get_token}
                  </span>
                </form>
              )}
            </div>

            {error && (
              <span className="font-label-sm text-xs text-red-400 mt-1">{error}</span>
            )}
          </div>
        )}
      </section>

      <div className="h-[1px] w-full bg-zinc-900/80" />

      {/* 2. Offline Storage Section */}
      <section className="flex flex-col gap-space-md">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-hard-drive-2-line text-[16px]"></i>
          <span>{messages.settings.cache_section}</span>
        </div>

        {/* Auto-cache toggle row */}
        <div className="flex items-center justify-between py-2">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="font-body-md text-white font-medium text-sm">
              {messages.settings.auto_cache_title}
            </span>
            <span className="font-label-sm text-xs text-zinc-500 max-w-md">
              {messages.settings.auto_cache_desc}
            </span>
          </div>

          <Switch
            checked={autoCache}
            onChange={setAutoCache}
          />
        </div>

        <div className="h-[1px] w-full bg-zinc-900/40" />

        {/* Cache stats row */}
        <div className="flex items-center justify-between py-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-body-md text-white font-medium text-sm">
              {messages.settings.cache_stats_label}
            </span>
            <span className="font-label-sm text-xs text-zinc-500">
              {cacheStats.total_tracks} {messages.library.tracks_count} • {formatBytes(cacheStats.total_size_bytes)}
            </span>
          </div>

          <button
            onClick={handleClearCache}
            disabled={cacheStats.total_tracks === 0}
            className="px-space-md py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-body-sm text-xs transition-colors border border-zinc-800/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {messages.settings.clear_cache_btn}
          </button>
        </div>

        {cacheMessage && (
          <span className="font-label-sm text-xs text-zinc-400 mt-1">{cacheMessage}</span>
        )}
      </section>

      <div className="h-[1px] w-full bg-zinc-900/80" />

      {/* 3. Discord RPC Section */}
      <section className="flex flex-col gap-space-md">
        <div className="flex items-center gap-2 text-zinc-500 font-label-sm text-xs uppercase tracking-wider">
          <i className="ri-discord-line text-[16px]"></i>
          <span>{messages.settings.discord_section}</span>
        </div>

        <div className="flex items-center justify-between py-2">
          <div className="flex flex-col pr-4 gap-0.5">
            <span className="font-body-md text-white font-medium text-sm">
              {messages.settings.discord_rpc_title}
            </span>
            <span className="font-label-sm text-xs text-zinc-500 max-w-md">
              {messages.settings.discord_rpc_desc}
            </span>
          </div>

          <Switch
            checked={discordRpc}
            onChange={handleToggleDiscordRpc}
          />
        </div>
      </section>

      <div className="h-[1px] w-full bg-zinc-900/80" />

      {/* 4. About Section */}
      <section className="flex flex-col gap-1 text-zinc-500 py-1">
        <span className="font-body-md text-xs font-medium text-zinc-400">
          {messages.settings.app_name}
        </span>
        <span className="font-label-sm text-[11px] text-zinc-600">
          {messages.settings.version}
        </span>
      </section>
    </div>
  );
};
