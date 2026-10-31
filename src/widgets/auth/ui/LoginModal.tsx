import React, { useState } from 'react';
import { useSession } from '../../../entities/session/model/session-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { tauriApi } from '../../../shared/api/tauri-client';
import { APP_LINKS } from '../../../shared/config';

const EXTENSION_REPO_URL = APP_LINKS.EXTENSION_REPO;

export const LoginModal: React.FC = () => {
  const { isOAuthModalOpen, closeOAuthModal, loginWithToken, isLoading, error } = useSession();
  const { messages } = useTranslation();

  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  if (!isOAuthModalOpen) return null;

  const handleOpenExtension = async () => {
    try {
      await tauriApi.openExternal(EXTENSION_REPO_URL);
    } catch (err) {
      console.error('Failed to open extension repository:', err);
    }
  };

  const handleOpenBrowser = async () => {
    try {
      await tauriApi.openExternal('https://soundcloud.com');
    } catch (err) {
      console.error('Failed to open soundcloud.com:', err);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = manualToken.trim();
    if (!cleanToken) return;

    setManualError(null);
    const ok = await loginWithToken(cleanToken);
    if (!ok) {
      setManualError(messages.auth.failed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-[#080808] border border-[#1a1a1a] rounded-lg p-6 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-white text-black flex items-center justify-center">
              <i className="ri-puzzle-line text-lg"></i>
            </div>
            <div>
              <h2 className="font-headline-sm text-base text-white font-semibold leading-tight">
                {messages.auth.login_title}
              </h2>
              <p className="font-body-sm text-xs text-zinc-400">
                {messages.auth.login_desc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeOAuthModal}
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Guest Mode Notice */}
        <div className="p-3 bg-[#0d0d0d] border border-[#1f1f23] rounded-md flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <i className="ri-information-line text-zinc-400"></i>
            <span>{messages.auth.guest_notice_title}</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {messages.auth.guest_notice_desc}
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3">
          {/* Step 1: Install extension */}
          <div className="flex flex-col gap-2 p-3.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-zinc-900 text-zinc-300 font-mono text-xs flex items-center justify-center font-bold">
                1
              </span>
              <span className="font-label-md text-sm text-zinc-200 font-medium">
                {messages.auth.step_1_title}
              </span>
            </div>
            <p className="font-body-sm text-xs text-zinc-400 pl-7">
              {messages.auth.step_1_desc}
            </p>

            <div className="flex items-center gap-2.5 pl-7 pt-1">
              <button
                type="button"
                onClick={handleOpenExtension}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#141414] hover:bg-[#1f1f23] text-zinc-200 text-xs font-medium border border-[#27272a] transition-colors"
              >
                <i className="ri-github-fill text-sm"></i>
                <span>{messages.auth.open_extension_page}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Open browser and sync */}
          <div className="flex flex-col gap-2 p-3.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-md">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-zinc-900 text-zinc-300 font-mono text-xs flex items-center justify-center font-bold">
                2
              </span>
              <span className="font-label-md text-sm text-zinc-200 font-medium">
                {messages.auth.step_2_title}
              </span>
            </div>
            <p className="font-body-sm text-xs text-zinc-400 pl-7">
              {messages.auth.step_2_desc}
            </p>

            <div className="pl-7 pt-1">
              <button
                type="button"
                onClick={handleOpenBrowser}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors"
              >
                <i className="ri-external-link-line text-sm"></i>
                <span>{messages.auth.open_browser_btn}</span>
              </button>
            </div>
          </div>

          {/* Listening status indicator */}
          <div className="flex flex-col items-center justify-center gap-1 py-1">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[11px] text-zinc-300">
                {messages.auth.server_status_listening}
              </span>
            </div>
            <span className="text-[11px] text-zinc-500">
              {messages.auth.waiting_browser}
            </span>
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-red-950/40 border border-red-800/60 text-red-300 text-xs text-center">
              {error}
            </div>
          )}
        </div>

        {/* Collapsible Manual Token Input */}
        <div className="pt-2 border-t border-[#1a1a1a] flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowManual((prev) => !prev)}
            className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors self-start"
          >
            <i className={showManual ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'}></i>
            <span>{messages.auth.or_token}</span>
          </button>

          {showManual && (
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-2 pt-1 animate-in fade-in duration-100">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder={messages.auth.token_placeholder}
                  className="flex-1 h-8 px-3 bg-[#0d0d0d] border border-[#1f1f23] rounded-md text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isLoading || !manualToken.trim()}
                  className="px-3.5 h-8 rounded-md bg-white text-black font-semibold text-xs hover:bg-zinc-200 disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                  {isLoading ? (
                    <i className="ri-loader-4-line text-sm animate-spin"></i>
                  ) : (
                    messages.auth.save_token
                  )}
                </button>
              </div>
              <span className="text-[11px] text-zinc-500">
                {messages.auth.token_help}
              </span>
              {manualError && (
                <span className="text-xs text-red-400">{manualError}</span>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-[#1a1a1a]">
          <button
            type="button"
            onClick={closeOAuthModal}
            className="px-4 py-1.5 rounded-md text-zinc-400 hover:text-white text-xs hover:bg-zinc-900 transition-colors"
          >
            {messages.auth.return_to_music}
          </button>
        </div>
      </div>
    </div>
  );
};
