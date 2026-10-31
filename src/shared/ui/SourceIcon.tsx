import React from 'react';

export type MusicSource = 'spotify' | 'yandex' | 'soundcloud' | 'text' | string;

export interface SourceMeta {
  id: 'spotify' | 'yandex' | 'soundcloud' | 'text';
  name: string;
  icon: string;
  color: string;
}

export function resolveSource(source?: string | null, fallbackText?: string | null): SourceMeta {
  const s = (source || fallbackText || '').toLowerCase();

  if (s.includes('spotify')) {
    return {
      id: 'spotify',
      name: 'Spotify',
      icon: 'ri-spotify-fill',
      color: 'text-[#1ed760]',
    };
  }

  if (s.includes('yandex') || s.includes('яндекс')) {
    return {
      id: 'yandex',
      name: 'Яндекс Музыка',
      icon: 'ri-music-fill',
      color: 'text-[#ffcc00]',
    };
  }

  if (s.includes('text') || s.includes('текст')) {
    return {
      id: 'text',
      name: 'Текстовый список',
      icon: 'ri-file-list-2-line',
      color: 'text-zinc-400',
    };
  }

  return {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: 'ri-soundcloud-fill',
    color: 'text-[#ff5500]',
  };
}

interface SourceIconProps {
  source?: string | null;
  fallbackText?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'base' | 'lg';
  showLabel?: boolean;
}

export const SourceIcon: React.FC<SourceIconProps> = ({
  source,
  fallbackText,
  className = '',
  size = 'sm',
  showLabel = false,
}) => {
  const meta = resolveSource(source, fallbackText);

  const sizeClass =
    size === 'xs'
      ? 'text-[11px]'
      : size === 'sm'
      ? 'text-xs'
      : size === 'base'
      ? 'text-sm'
      : 'text-base';

  return (
    <span
      className={`inline-flex items-center gap-1.5 select-none ${className}`}
      title={`Источник: ${meta.name}`}
    >
      <i className={`${meta.icon} ${meta.color} ${sizeClass} shrink-0`} />
      {showLabel && (
        <span className="text-xs text-zinc-400 font-medium tracking-tight">
          {meta.name}
        </span>
      )}
    </span>
  );
};
