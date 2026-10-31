import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import {
  tauriApi,
  type ExternalPlaylistMeta,
} from '../../../shared/api/tauri-client';
import { SourceIcon } from '../../../shared/ui/SourceIcon';
import { useImport } from '../../../shared/lib/import-context';

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPlaylist?: (playlistId: number) => void;
}

type ImportStep = 'input' | 'preview';

export const ImportPlaylistModal: React.FC<ImportPlaylistModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { startImport } = useImport();

  const [step, setStep] = useState<ImportStep>('input');

  // Input state
  const [urlInput, setUrlInput] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  // Preview state
  const [previewData, setPreviewData] = useState<ExternalPlaylistMeta | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Сброс при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setUrlInput('');
      setCustomTitle('');
      setPreviewData(null);
      setPreviewError(null);
    }
  }, [isOpen]);

  // Закрытие по клавише Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Распознавание сервиса по URL
  const detectedService = (() => {
    const val = urlInput.toLowerCase();
    if (val.includes('music.yandex.')) return 'yandex';
    if (val.includes('spotify.com')) return 'spotify';
    return null;
  })();

  // Загрузка предпросмотра
  const handleFetchPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewError(null);

    const input = urlInput.trim();
    if (!input) {
      setPreviewError(t('import.error_empty'));
      return;
    }

    try {
      setIsLoadingPreview(true);
      const meta = await tauriApi.previewExternalPlaylist(
        input,
        customTitle.trim() || undefined,
      );
      setPreviewData(meta);
      setStep('preview');
    } catch (err: unknown) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Запуск фонового импорта
  const handleStartImport = () => {
    if (!previewData) return;
    startImport(previewData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="neu-card-static relative w-full max-w-lg bg-[#15171c] border border-white/10 rounded-2xl p-6 shadow-2xl z-10 flex flex-col gap-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center">
              <i className="ri-download-cloud-2-line text-xl" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {t('import.modal_title')}
              </h3>
              <p className="text-xs text-white/40 mt-0.5">
                {t('import.modal_subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        {/* Step 1: Input Form */}
        {step === 'input' && (
          <form onSubmit={handleFetchPreview} className="flex flex-col gap-4">
            {/* URL Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                {t('import.url_label')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={t('import.url_placeholder')}
                  autoFocus
                  className="w-full pl-3.5 pr-28 py-2.5 text-sm rounded-md bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 text-white placeholder:text-zinc-600 outline-none focus:outline-none focus:border-orange-500 transition-colors shadow-sm"
                />
                {detectedService && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-orange-400 flex items-center gap-1.5">
                    {detectedService === 'spotify' ? (
                      <>
                        <i className="ri-spotify-fill text-green-400 text-sm" />
                        <span className="text-zinc-300 text-xs">{t('import.service_spotify')}</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-music-fill text-yellow-400 text-sm" />
                        <span className="text-zinc-300 text-xs">{t('import.service_yandex')}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {t('import.url_hint')}
              </p>
            </div>

            {/* Optional Custom Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-400">
                {t('import.playlist_name_label')}
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={t('import.playlist_name_placeholder')}
                className="w-full px-3.5 py-2.5 text-xs rounded-md bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 text-white placeholder:text-zinc-600 outline-none focus:outline-none focus:border-orange-500 transition-colors shadow-sm"
              />
            </div>

            {/* Error message */}
            {previewError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
                <i className="ri-error-warning-line text-sm shrink-0 mt-0.5" />
                <span>{previewError}</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="neu-button px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isLoadingPreview || !urlInput.trim()}
                className="neu-button-primary px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
              >
                {isLoadingPreview ? (
                  <i className="ri-loader-4-line text-sm animate-spin" />
                ) : (
                  <i className="ri-search-eye-line text-sm" />
                )}
                <span>{t('import.preview_btn')}</span>
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Preview Metadata */}
        {step === 'preview' && previewData && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-black/40 border border-white/5">
              {previewData.cover_url ? (
                <img
                  src={previewData.cover_url}
                  alt={previewData.title}
                  className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 shrink-0">
                  <i className="ri-music-2-line text-2xl" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
                  <SourceIcon source={previewData.service} size="xs" />
                  <span className="capitalize">
                    {previewData.service === 'yandex' ? t('import.service_yandex') : t('import.service_spotify')}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white truncate">
                  {previewData.title}
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {previewData.tracks.length} {t('import.tracks_count')}
                </p>
              </div>
            </div>

            {/* Tracklist Preview */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-zinc-400">
                {t('import.preview_title')} ({previewData.tracks.length}):
              </span>
              <div className="max-h-48 overflow-y-auto rounded-xl bg-black/30 border border-white/5 p-2 flex flex-col gap-1">
                {previewData.tracks.slice(0, 50).map((tr, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="text-zinc-600 font-mono text-[10px] w-5 shrink-0 text-right">
                        {idx + 1}
                      </span>
                      <span className="text-white truncate">{tr.title}</span>
                      {tr.artist && (
                        <span className="text-zinc-500 truncate">- {tr.artist}</span>
                      )}
                    </div>
                    {tr.duration_ms && (
                      <span className="text-zinc-500 text-[10px] font-mono shrink-0">
                        {Math.floor(tr.duration_ms / 60000)}:
                        {String(Math.floor((tr.duration_ms % 60000) / 1000)).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                ))}
                {previewData.tracks.length > 50 && (
                  <div className="text-center py-1 text-[11px] text-zinc-500 italic">
                    + еще {previewData.tracks.length - 50} треков
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setStep('input')}
                className="neu-button px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={handleStartImport}
                className="neu-button-primary px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
              >
                <i className="ri-download-line text-sm" />
                <span>{t('import.start_import_btn')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
