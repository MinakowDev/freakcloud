import React from 'react';
import type { Playlist } from '../../../entities/playlist/model/types';

interface PlaylistCoverProps {
  playlist: Playlist;
  className?: string;
}

export const PlaylistCover: React.FC<PlaylistCoverProps> = ({ playlist, className = '' }) => {
  const tracks = playlist.tracks || [];

  // 1. Direct playlist artwork
  if (playlist.artwork_url && !playlist.artwork_url.includes('placeholder')) {
    return (
      <img
        src={playlist.artwork_url.replace('-large.', '-t500x500.')}
        alt={playlist.title}
        className={`w-full h-full object-cover select-none ${className}`}
        loading="lazy"
      />
    );
  }

  // 2. Extract unique artworks from tracks
  const trackArtworks: string[] = [];
  for (const track of tracks) {
    if (track.artwork_url && !trackArtworks.includes(track.artwork_url)) {
      trackArtworks.push(track.artwork_url);
      if (trackArtworks.length === 4) break;
    }
  }

  // 3. 2x2 Collage if 4 or more unique artworks exist
  if (trackArtworks.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 w-full h-full overflow-hidden select-none bg-black/40 ${className}`}>
        {trackArtworks.slice(0, 4).map((art, idx) => (
          <img
            key={`${art}-${idx}`}
            src={art.replace('-large.', '-t300x300.')}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ))}
      </div>
    );
  }

  // 4. Single artwork from first available track
  if (trackArtworks.length > 0) {
    return (
      <img
        src={trackArtworks[0].replace('-large.', '-t500x500.')}
        alt={playlist.title}
        className={`w-full h-full object-cover select-none ${className}`}
        loading="lazy"
      />
    );
  }

  // 5. Rich gradient placeholder for empty custom playlist
  const initial = playlist.title ? playlist.title.trim().charAt(0).toUpperCase() : 'P';

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-[#181a20] to-zinc-950 border border-white/5 relative overflow-hidden select-none ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/70 shadow-inner mb-1">
        {playlist.is_album ? (
          <i className="ri-disc-line text-2xl text-amber-400/80" />
        ) : (
          <span className="font-bold text-lg font-headline-sm text-zinc-300">
            {initial}
          </span>
        )}
      </div>
      <span className="text-[10px] font-mono tracking-widest uppercase text-white/30">
        {playlist.is_album ? 'Альбом' : 'Плейлист'}
      </span>
    </div>
  );
};
