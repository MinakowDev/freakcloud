import React, { useState, useEffect } from 'react';
import { isTauri } from '../../../shared/api/tauri-client';

export const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      appWindow.isMaximized().then(setIsMaximized).catch(() => {});

      appWindow.onResized(() => {
        appWindow.isMaximized().then(setIsMaximized).catch(() => {});
      }).then((fn) => {
        unlisten = fn;
      }).catch(() => {});
    }).catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = async () => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (err) {
      console.warn('Minimize window error:', err);
    }
  };

  const handleToggleMaximize = async () => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.toggleMaximize();
      const max = await win.isMaximized();
      setIsMaximized(max);
    } catch (err) {
      console.warn('Toggle maximize window error:', err);
    }
  };

  const handleClose = async () => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (err) {
      console.warn('Close window error:', err);
    }
  };

  if (!isTauri()) {
    return null;
  }

  return (
    <div className="flex items-center h-14 select-none shrink-0" data-tauri-drag-region="false">
      {/* Minimize */}
      <button
        type="button"
        onClick={handleMinimize}
        className="w-12 h-14 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title="Свернуть"
        aria-label="Свернуть"
      >
        <i className="ri-subtract-line text-sm"></i>
      </button>

      {/* Maximize / Restore */}
      <button
        type="button"
        onClick={handleToggleMaximize}
        className="w-12 h-14 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title={isMaximized ? 'Восстановить' : 'Развернуть'}
        aria-label={isMaximized ? 'Восстановить' : 'Развернуть'}
      >
        {isMaximized ? (
          <i className="ri-file-copy-line text-xs"></i>
        ) : (
          <i className="ri-checkbox-blank-line text-[11px]"></i>
        )}
      </button>

      {/* Close */}
      <button
        type="button"
        onClick={handleClose}
        className="w-12 h-14 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-colors"
        title="Закрыть"
        aria-label="Закрыть"
      >
        <i className="ri-close-line text-base"></i>
      </button>
    </div>
  );
};
