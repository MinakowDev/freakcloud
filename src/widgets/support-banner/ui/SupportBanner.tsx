import React, { useState } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import './SupportBanner.css';

const DISMISSED_KEY = 'freakcloud_github_star_dismissed';
const GITHUB_URL = 'https://github.com/MinakowDev/freakcloud';

function openExternalUrl(url: string): void {
  import('@tauri-apps/plugin-opener')
    .then((m) => m.openUrl(url))
    .catch(() => window.open(url, '_blank'));
}

export const SupportBanner: React.FC = () => {
  const { messages } = useTranslation();
  const m = messages.support;

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div className="support-banner animate-cascade" style={{ animationDelay: '150ms' }}>
      <div className="support-banner__star-glow" aria-hidden="true" />

      <div className="support-banner__body">
        <div className="support-banner__icon">⭐</div>
        <div className="support-banner__text">
          <p className="support-banner__title">{m.title}</p>
          <p className="support-banner__desc">{m.desc}</p>
        </div>
      </div>

      <div className="support-banner__actions">
        <button
          type="button"
          className="support-banner__star-btn"
          onClick={() => openExternalUrl(GITHUB_URL)}
        >
          {m.star_button}
        </button>
        <button
          type="button"
          className="support-banner__dismiss-btn"
          onClick={handleDismiss}
          title={m.dismiss}
          aria-label={m.dismiss}
        >
          <i className="ri-close-line" />
        </button>
      </div>
    </div>
  );
};
