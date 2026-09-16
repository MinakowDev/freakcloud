import React from 'react';
import type { Track } from '../../../entities/track/model/types';
import { TrackRow } from '../../../entities/track/ui/TrackRow';
import { useTranslation } from '../../../shared/lib/i18n';

interface TrackTableProps {
  tracks: Track[];
  emptyMessage?: string;
  onRemoveTrack?: (trackId: number) => void;
}

export const TrackTable: React.FC<TrackTableProps> = ({ tracks, emptyMessage, onRemoveTrack }) => {
  const { messages } = useTranslation();

  if (tracks.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-space-sm bg-zinc-900/40 rounded-xl p-space-lg border border-zinc-800">
        <i className="ri-folder-music-line text-[32px] text-zinc-600"></i>
        <p className="font-body-md text-body-md max-w-md">{emptyMessage || messages.search.no_results}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {/* Table Header matching TrackRow grid */}
      <div className="grid grid-cols-[40px_1fr_auto_64px] items-center px-space-md py-space-xs font-label-sm text-label-sm text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80 gap-2">
        <div className="text-center w-10">{messages.table.number}</div>
        <div className="min-w-0 pr-space-sm">{messages.table.title}</div>
        <div className="text-center min-w-[124px]">{messages.table.actions}</div>
        <div className="text-right w-16">{messages.table.duration}</div>
      </div>

      {/* Table Rows */}
      <div className="flex flex-col gap-0.5 mt-1">
        {tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx}
            queueList={tracks}
            onRemove={onRemoveTrack ? () => onRemoveTrack(track.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
};
