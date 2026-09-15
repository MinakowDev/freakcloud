import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../../entities/session/model/session-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { tauriApi } from '../../../shared/api/tauri-client';

const BOOKMARKLET_SCRIPT = `javascript:(function(){const m=document.cookie.match(/oauth_token=([^;]+)/);if(m){window.location.href='http://127.0.0.1:49281/login?token='+encodeURIComponent(m[1]);}else{alert('Сначала войдите в аккаунт на soundcloud.com!');}})();`;

export const LoginModal: React.FC = () => {
  const { isOAuthModalOpen, closeOAuthModal, openDirectLogin, loginWithToken, isLoading, error } = useSession();
  const { messages } = useTranslation();

  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute('href', BOOKMARKLET_SCRIPT);
    }
  }, [isOAuthModalOpen]);

  if (!isOAuthModalOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleOpenBrowser = async () => {
    await tauriApi.openExternal('https://soundcloud.com');
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setManualError(null);
    const ok = await loginWithToken(manualToken.trim());
    if (!ok) {
      setManualError(messages.auth.failed);
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLAnchorElement>) => {
    e.dataTransfer.setData('text/uri-list', BOOKMARKLET_SCRIPT);
    e.dataTransfer.setData('text/plain', BOOKMARKLET_SCRIPT);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center">
              <i className="ri-soundcloud-line text-lg"></i>
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-4">
          {/* Step 1: Drag or copy bookmarklet */}
          <div className="flex flex-col gap-2 p-3.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-xs flex items-center justify-center font-bold">
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
              <a
                ref={bookmarkletRef}
                draggable
                onDragStart={handleDragStart}
                onClick={(e) => e.preventDefault()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs cursor-grab active:cursor-grabbing hover:bg-zinc-200 transition-all shadow-sm"
                title="Перетащите эту кнопку на панель закладок браузера"
              >
                <i className="ri-bookmark-3-fill text-sm"></i>
                <span>{messages.auth.bookmarklet_label}</span>
              </a>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition-colors"
              >
                <i className={copied ? "ri-check-line text-green-400 text-xs" : "ri-file-copy-line text-xs"}></i>
                <span>{copied ? messages.auth.copied : messages.auth.copy_code}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Open browser and transfer */}
          <div className="flex flex-col gap-2 p-3.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 font-mono text-xs flex items-center justify-center font-bold">
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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm"
              >
                <i className="ri-external-link-line text-sm"></i>
                <span>{messages.auth.open_browser_btn}</span>
              </button>
            </div>
          </div>

          {/* Waiting status indicator */}
          <div className="flex items-center justify-center gap-2.5 py-1 text-zinc-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-300"></span>
            </span>
            <span className="font-body-sm text-xs text-zinc-400">
              {messages.auth.waiting_browser}
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Collapsible Manual / Fallback */}
        <div className="pt-2 border-t border-zinc-900 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowManual((prev) => !prev)}
              className="font-label-sm text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
            >
              <i className={showManual ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"}></i>
              <span>{messages.auth.or_token}</span>
            </button>

            <button
              type="button"
              onClick={openDirectLogin}
              className="font-label-sm text-[11px] text-zinc-600 hover:text-zinc-400 underline underline-offset-2 transition-colors"
            >
              {messages.auth.fallback_window}
            </button>
          </div>

          {showManual && (
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-2 pt-1 animate-in fade-in duration-100">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder={messages.auth.token_placeholder}
                  className="flex-1 h-8 px-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isLoading || !manualToken.trim()}
                  className="px-4 h-8 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                  {isLoading ? (
                    <i className="ri-loader-4-line text-sm animate-spin"></i>
                  ) : (
                    messages.auth.save_token
                  )}
                </button>
              </div>
              <span className="font-label-sm text-[11px] text-zinc-500">
                {messages.auth.token_help}
              </span>
              {manualError && (
                <span className="font-label-sm text-xs text-red-400">{manualError}</span>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-zinc-900">
          <button
            type="button"
            onClick={closeOAuthModal}
            className="px-4 py-1.5 rounded-lg text-zinc-400 hover:text-white font-body-sm text-xs hover:bg-zinc-900 transition-colors"
          >
            {messages.auth.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
