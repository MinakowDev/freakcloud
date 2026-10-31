import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  tauriApi,
  type ExternalPlaylistMeta,
  type ImportProgressPayload,
  type ImportSummary,
} from '../api/tauri-client';
import { usePlaylists } from '../../entities/playlist/model/playlist-context';

interface ImportContextValue {
  isImporting: boolean;
  activeMeta: ExternalPlaylistMeta | null;
  progress: ImportProgressPayload | null;
  summary: ImportSummary | null;
  error: string | null;
  isToastVisible: boolean;
  isCancelling: boolean;
  startImport: (meta: ExternalPlaylistMeta) => Promise<void>;
  cancelImport: () => Promise<void>;
  dismissToast: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export const ImportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { refreshSavedPlaylists } = usePlaylists();

  const [isImporting, setIsImporting] = useState(false);
  const [activeMeta, setActiveMeta] = useState<ExternalPlaylistMeta | null>(null);
  const [progress, setProgress] = useState<ImportProgressPayload | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const unlistenRef = useRef<(() => void) | undefined>(undefined);

  const dismissToast = useCallback(() => {
    setIsToastVisible(false);
  }, []);

  const cancelImport = useCallback(async () => {
    if (!isImporting) return;
    try {
      setIsCancelling(true);
      await tauriApi.cancelImportPlaylist();
    } catch (err) {
      console.error('Failed to cancel import:', err);
    }
  }, [isImporting]);

  const startImport = useCallback(
    async (meta: ExternalPlaylistMeta) => {
      // Сброс предыдущего состояния
      setActiveMeta(meta);
      setProgress({
        current: 0,
        total: meta.tracks.length,
        matched: 0,
        current_track: meta.tracks[0]?.title || '',
      });
      setSummary(null);
      setError(null);
      setIsCancelling(false);
      setIsImporting(true);
      setIsToastVisible(true);

      // Очищаем старый слушатель, если остался
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = undefined;
      }

      try {
        const unlisten = await tauriApi.onImportProgress((payload) => {
          setProgress(payload);
        });
        unlistenRef.current = unlisten;

        const result = await tauriApi.importExternalPlaylist(meta);
        setSummary(result);
        setIsImporting(false);
        setIsCancelling(false);

        // Обновляем плейлисты в библиотеке
        await refreshSavedPlaylists();
      } catch (err: unknown) {
        const msg =
          typeof err === 'string'
            ? err
            : err instanceof Error
            ? err.message
            : String(err);
        setError(msg);
        setIsImporting(false);
        setIsCancelling(false);
      } finally {
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = undefined;
        }
      }
    },
    [refreshSavedPlaylists],
  );

  return (
    <ImportContext.Provider
      value={{
        isImporting,
        activeMeta,
        progress,
        summary,
        error,
        isToastVisible,
        isCancelling,
        startImport,
        cancelImport,
        dismissToast,
      }}
    >
      {children}
    </ImportContext.Provider>
  );
};

export const useImport = (): ImportContextValue => {
  const context = useContext(ImportContext);
  if (!context) {
    throw new Error('useImport must be used within an ImportProvider');
  }
  return context;
};
