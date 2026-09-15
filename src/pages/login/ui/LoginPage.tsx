import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../../../entities/session/model/session-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { tauriApi } from '../../../shared/api/tauri-client';
import { playRandomLoginSfx } from '../../../shared/lib/sfx';
import './LoginPage.css';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onGuestContinue?: () => void;
}

const EXTENSION_PATH = 'd:\\Sys\\Dev\\freackcloud\\extension';

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onGuestContinue }) => {
  const { session, loginWithToken, isLoading } = useSession();
  const { messages } = useTranslation();

  const [isSuccess, setIsSuccess] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Prevent multiple success triggers
  const hasTriggeredSuccess = useRef(false);

  // When session becomes authenticated (via loopback_server or token), trigger the success animation & SFX
  useEffect(() => {
    if (session.is_authenticated && !hasTriggeredSuccess.current) {
      hasTriggeredSuccess.current = true;
      setIsSuccess(true);
      playRandomLoginSfx();

      const timer = setTimeout(() => {
        onLoginSuccess();
      }, 1600);

      return () => clearTimeout(timer);
    }
  }, [session.is_authenticated, onLoginSuccess]);

  // Handler for SoundCloud button: open soundcloud in default browser
  const handleOpenSoundCloud = async () => {
    try {
      await tauriApi.openExternal('https://soundcloud.com');
    } catch (err) {
      console.error('Failed to open SoundCloud:', err);
    }
  };

  // Handler for copying extension folder path
  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(EXTENSION_PATH);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  // Handler for manual token submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();
    if (!cleanToken) return;

    setErrorMessage(null);
    const ok = await loginWithToken(cleanToken);
    if (!ok) {
      setErrorMessage(messages.auth.failed);
    }
  };

  return (
    <div className="login-page-container">
      {/* Background ambient lighting */}
      <div className={`login-ambient-orb ${isSuccess ? 'orb-expanded' : ''}`} />

      {/* Center Brand Header: Logo + Title */}
      <div className="login-brand-header">
        <div className={`login-logo-wrapper ${isSuccess ? 'logo-expanded' : ''}`}>
          <img
            src="/logo.png"
            alt="FreackCloud Logo"
            className="login-logo-img"
          />
        </div>

        <h1 className="login-title">{messages.login_page.title}</h1>
        <p className="login-subtitle">{messages.login_page.subtitle}</p>
      </div>

      {/* Entrance animated login instructions & buttons */}
      <div className={`login-form-container ${isSuccess ? 'form-exit' : ''}`}>
        <div className="login-card">
          {/* Badge & Instructions */}
          <div className="flex flex-col gap-1.5 text-center">
            <div className="inline-flex items-center justify-center gap-1.5 self-center px-2.5 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-xs font-mono">
              <i className="ri-shield-keyhole-line text-xs"></i>
              <span>{messages.login_page.instruction_badge}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed px-2">
              {messages.login_page.instruction_text}
            </p>
          </div>

          {/* Action buttons: Open SoundCloud in browser */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleOpenSoundCloud}
              className="btn-soundcloud"
            >
              <i className="ri-soundcloud-fill text-lg"></i>
              <span>{messages.login_page.open_soundcloud}</span>
            </button>
          </div>

          {/* Extension Setup Guide Toggle & Box */}
          <div className="flex flex-col gap-2 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setShowExtensionGuide((prev) => !prev)}
              className="flex items-center justify-between text-xs text-zinc-300 hover:text-white font-medium transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <i className="ri-puzzle-line text-sm text-zinc-400"></i>
                <span>{messages.login_page.extension_guide_btn}</span>
              </span>
              <i className={showExtensionGuide ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}></i>
            </button>

            {showExtensionGuide && (
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 leading-relaxed animate-in fade-in duration-150">
                <p>{messages.login_page.extension_step_1}</p>
                <p>{messages.login_page.extension_step_2}</p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition-colors"
                  >
                    <i className={pathCopied ? 'ri-check-line text-green-400' : 'ri-file-copy-line'}></i>
                    <span>{pathCopied ? messages.login_page.path_copied : messages.login_page.copy_path}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Waiting status indicator */}
          {!isSuccess && (
            <div className="flex items-center justify-center gap-2 py-0.5 text-zinc-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-300"></span>
              </span>
              <span className="text-xs text-zinc-400">
                {messages.login_page.waiting_browser}
              </span>
            </div>
          )}

          {/* Error display */}
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs text-center">
              {errorMessage}
            </div>
          )}

          {/* Manual Token Collapsible */}
          <div className="pt-2 border-t border-zinc-800/60 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowManual((prev) => !prev)}
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1 transition-colors"
            >
              <i className={showManual ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'}></i>
              <span>{messages.login_page.manual_token}</span>
            </button>

            {showManual && (
              <form onSubmit={handleManualSubmit} className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder={messages.login_page.token_placeholder}
                    className="flex-1 h-8 px-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !tokenInput.trim()}
                    className="px-3.5 h-8 rounded-lg bg-zinc-200 hover:bg-white text-black font-semibold text-xs disabled:opacity-50 transition-colors"
                  >
                    {messages.login_page.submit_token}
                  </button>
                </div>
                <span className="text-[11px] text-zinc-500 text-center">
                  {messages.login_page.token_hint}
                </span>
              </form>
            )}
          </div>

          {/* Guest Mode option */}
          {onGuestContinue && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={onGuestContinue}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-4"
              >
                {messages.login_page.guest_mode}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
