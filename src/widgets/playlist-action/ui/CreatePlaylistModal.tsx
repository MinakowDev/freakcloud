import React, { useState, useEffect } from 'react';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { useTranslation } from '../../../shared/lib/i18n';
import type { Playlist } from '../../../entities/playlist/model/types';

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSuccess: (newPlaylist: Playlist) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  isOpen,
  onClose,
  onCreateSuccess,
}) => {
  const { createCustomPlaylist } = usePlaylists();
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const newPlaylist = await createCustomPlaylist(trimmed);
      onCreateSuccess(newPlaylist);
      onClose();
    } catch (err) {
      console.error('Failed to create custom playlist:', err);
    } finally {
      setIsSubmitting(false);
    }
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
        className="neu-card-static relative w-full max-w-md bg-[#15171c] border border-white/10 rounded-2xl p-6 shadow-2xl z-10 flex flex-col gap-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center">
              <i className="ri-folder-add-line text-xl" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {t('library.create_playlist')}
              </h3>
              <p className="text-xs text-white/40 mt-0.5">
                Создайте плейлист для вашей коллекции
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              {t('library.new_playlist_name')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Любимый фонк, Ночной чилл..."
              autoFocus
              className="px-3.5 py-2.5 text-sm rounded-xl bg-black/50 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors shadow-inner"
            />
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            После создания плейлист сразу откроется, и вы сможете быстро найти и добавить в него первые треки.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="neu-button px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="neu-button-primary px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <i className="ri-loader-4-line text-sm animate-spin" />
              ) : (
                <i className="ri-check-line text-sm" />
              )}
              <span>{t('library.create_playlist')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
