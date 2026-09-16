import React from 'react';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { useTranslation } from '../../../shared/lib/i18n';

export interface ArtistCardProps {
  artistName: string;
  trackCount?: number;
  avatarUrl?: string;
  weight?: number;
  isBlacklisted?: boolean;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({
  artistName,
  trackCount = 0,
  avatarUrl,
  weight: _weight = 0,
  isBlacklisted = false,
}) => {
  const { openArtist } = useArtist();
  const { messages } = useTranslation();

  return (
    <div
      onClick={() => openArtist(artistName)}
      className="neu-card-static group relative flex flex-col items-center p-4 cursor-pointer select-none rounded-2xl text-center hover:border-zinc-700/60 transition-colors"
    >
      {/* Recessed Circular Avatar Frame */}
      <div className="relative mb-3.5">
        <div className="neu-inset w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center p-1 relative overflow-hidden">
          {avatarUrl ? (
            <img
              src={avatarUrl.replace('-large.', '-t500x500.')}
              alt={artistName}
              className="w-full h-full object-cover rounded-full"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center bg-zinc-950 text-zinc-600">
              <i className="ri-user-voice-line text-3xl" />
            </div>
          )}
        </div>

        {/* Blacklist status indicator if blocked */}
        {isBlacklisted && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-red-950/90 text-red-300 border border-red-800/60 shadow-md flex items-center gap-1">
            <i className="ri-forbid-line text-[10px]" />
            <span>{messages.artist?.blacklisted || 'Блок'}</span>
          </div>
        )}
      </div>

      {/* Artist Name & Stats */}
      <h3
        className="font-headline-sm text-sm font-semibold text-white truncate max-w-full group-hover:text-amber-300 transition-colors duration-200"
        title={artistName}
      >
        {artistName}
      </h3>

      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
        <i className="ri-music-2-line text-zinc-500 text-xs" />
        <span>
          {trackCount} {messages.artist?.tracks?.toLowerCase() || 'треков'}
        </span>
      </div>
    </div>
  );
};
