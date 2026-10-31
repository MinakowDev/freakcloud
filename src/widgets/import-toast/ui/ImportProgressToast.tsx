import React from 'react';
import { useImport } from '../../../shared/lib/import-context';
import { SourceIcon } from '../../../shared/ui/SourceIcon';
import { useTranslation } from '../../../shared/lib/i18n';

interface ImportProgressToastProps {
  onOpenPlaylist?: (playlistId: number) => void;
}

export const ImportProgressToast: React.FC<ImportProgressToastProps> = ({ onOpenPlaylist }) => {
  const { t } = useTranslation();
  const {
    isImporting,
    activeMeta,
    progress,
    summary,
    error,
    isToastVisible,
    isCancelling,
    cancelImport,
    dismissToast,
  } = useImport();

  if (!isToastVisible || !activeMeta) return null;

  const total = progress?.total || activeMeta.tracks.length || 1;
  const current = progress?.current || 0;
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="fixed bottom-24 right-6 z-40 w-84 max-w-[calc(100vw-3rem)] pointer-events-auto">
      <div className="neu-card-static bg-[#15171c]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-2.5 text-white animate-in fade-in slide-in-from-bottom-3 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <SourceIcon source={activeMeta.service} size="sm" />
            <span className="text-xs font-bold text-white truncate">
              {activeMeta.title}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isImporting ? (
              <button
                type="button"
                onClick={cancelImport}
                disabled={isCancelling}
                className="px-2 py-0.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1 disabled:opacity-50"
                title={t('import.toast_cancel_btn')}
              >
                {isCancelling ? (
                  <>
                    <i className="ri-loader-4-line text-xs animate-spin" />
                    <span>{t('import.toast_cancelling')}</span>
                  </>
                ) : (
                  <>
                    <i className="ri-close-circle-line text-xs" />
                    <span>{t('import.toast_cancel_btn')}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={dismissToast}
                className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title={t('common.close')}
              >
                <i className="ri-close-line text-sm" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar & Current Track (when importing) */}
        {isImporting && (
          <div className="flex flex-col gap-1.5">
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 gap-2">
              <span className="truncate text-zinc-400">
                {progress?.current_track || t('import.progress_status')}
              </span>
              <span className="font-mono text-zinc-400 shrink-0">
                {current} / {total}
              </span>
            </div>
          </div>
        )}

        {/* Completed / Cancelled Result */}
        {!isImporting && summary && (
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="flex items-center gap-2 text-xs">
              {summary.cancelled ? (
                <>
                  <i className="ri-alert-line text-amber-400 text-sm shrink-0" />
                  <span className="text-amber-300 font-medium">
                    {t('import.toast_cancelled')}: {summary.matched_tracks} / {summary.total_tracks}
                  </span>
                </>
              ) : (
                <>
                  <i className="ri-checkbox-circle-fill text-green-400 text-sm shrink-0" />
                  <span className="text-green-300 font-medium">
                    {t('import.toast_completed')}: {summary.matched_tracks} / {summary.total_tracks}
                  </span>
                </>
              )}
            </div>

            {summary.playlist_id && onOpenPlaylist && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (summary.playlist_id) {
                      onOpenPlaylist(summary.playlist_id);
                      dismissToast();
                    }
                  }}
                  className="neu-button-primary px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <i className="ri-play-list-2-line text-xs" />
                  <span>{t('import.open_playlist_btn')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {!isImporting && error && (
          <div className="flex items-start gap-2 text-xs text-red-300 pt-0.5">
            <i className="ri-error-warning-line text-sm shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
