import React, { useMemo } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { getTopTasteSeeds, extractGenresFromTrack } from '../../../entities/track/lib/taste-graph';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import './TasteVibes.css';

interface Vibe {
  label: string;
  icon: string;
  query: string;
}

const FALLBACK_VIBES: Vibe[] = [
  { label: 'Witch House', icon: 'ri-ghost-line', query: 'witch house' },
  { label: 'Liquid DnB', icon: 'ri-drop-line', query: 'liquid dnb' },
  { label: 'UK Garage', icon: 'ri-disc-line', query: 'uk garage 2step' },
  { label: 'Breakcore', icon: 'ri-flashlight-line', query: 'breakcore' },
  { label: 'Pluggnb', icon: 'ri-sparkling-fill', query: 'pluggnb' },
  { label: 'Wave', icon: 'ri-soundwave-line', query: 'hardwave wave' },
  { label: 'Drift Phonk', icon: 'ri-steering-2-line', query: 'drift phonk' },
  { label: 'Rage / Opium', icon: 'ri-fire-line', query: 'rage beat' },
  { label: 'Shoegaze', icon: 'ri-cloud-windy-line', query: 'shoegaze dreampop' },
  { label: 'Hyperpop', icon: 'ri-magic-line', query: 'hyperpop' },
  { label: 'Dark Ambient', icon: 'ri-moon-foggy-line', query: 'dark ambient' },
  { label: 'Cyberpunk', icon: 'ri-cpu-line', query: 'cyberpunk darksynth' },
];

const GENRE_LABELS: Record<string, string> = {
  'liquid dnb': 'Liquid DnB',
  dnb: 'DnB',
  'drum and bass': 'Drum & Bass',
  ukg: 'UK Garage',
  'uk garage': 'UK Garage',
  'witch house': 'Witch House',
  'drift phonk': 'Drift Phonk',
  phonk: 'Phonk',
  hardwave: 'Hardwave',
  wave: 'Wave',
  pluggnb: 'Pluggnb',
  rage: 'Rage',
  'cloud rap': 'Cloud Rap',
  drill: 'Drill',
  'trap metal': 'Trap Metal',
  'memphis rap': 'Memphis Rap',
  'emo rap': 'Emo Rap',
  'boom bap': 'Boom Bap',
  'jersey club': 'Jersey Club',
  hyperpop: 'Hyperpop',
  'future bass': 'Future Bass',
  cyberpunk: 'Cyberpunk',
  synthwave: 'Synthwave',
  'melodic techno': 'Melodic Techno',
  'deep house': 'Deep House',
  techno: 'Techno',
  hardstyle: 'Hardstyle',
  riddim: 'Riddim',
  'dark ambient': 'Dark Ambient',
  ambient: 'Ambient',
  shoegaze: 'Shoegaze',
  'midwest emo': 'Midwest Emo',
  'post-punk': 'Post-Punk',
  darkwave: 'Darkwave',
  'lo-fi': 'Lo-Fi',
  vaporwave: 'Vaporwave',
  downtempo: 'Downtempo',
  chillstep: 'Chillstep',
  'math rock': 'Math Rock',
  'nu-metal': 'Nu-Metal',
  'post-rock': 'Post-Rock',
};

const GENRE_ICONS: Record<string, string> = {
  'witch house': 'ri-ghost-line',
  darkwave: 'ri-contrast-2-line',
  'post-punk': 'ri-git-commit-line',
  'uk garage': 'ri-disc-line',
  ukg: 'ri-disc-line',
  breakcore: 'ri-flashlight-line',
  'liquid dnb': 'ri-drop-line',
  dnb: 'ri-speed-up-line',
  'drum and bass': 'ri-speed-up-line',
  breakbeat: 'ri-equalizer-line',
  'drift phonk': 'ri-steering-2-line',
  phonk: 'ri-skull-line',
  hardwave: 'ri-soundwave-line',
  wave: 'ri-soundwave-line',
  synthwave: 'ri-pulse-line',
  retrowave: 'ri-pulse-line',
  pluggnb: 'ri-sparkling-fill',
  rage: 'ri-fire-line',
  'cloud rap': 'ri-cloud-line',
  drill: 'ri-sword-line',
  'trap metal': 'ri-alarm-warning-line',
  'memphis rap': 'ri-mic-line',
  'emo rap': 'ri-heart-crack-line',
  'boom bap': 'ri-disc-fill',
  'jersey club': 'ri-run-line',
  hyperpop: 'ri-magic-line',
  'future bass': 'ri-space-shuttle-line',
  cyberpunk: 'ri-cpu-line',
  'melodic techno': 'ri-bubble-chart-line',
  'deep house': 'ri-water-flash-line',
  techno: 'ri-radar-line',
  hardstyle: 'ri-flashlight-fill',
  riddim: 'ri-heavy-showers-line',
  'dark ambient': 'ri-moon-foggy-line',
  ambient: 'ri-cloudy-line',
  shoegaze: 'ri-cloud-windy-line',
  'midwest emo': 'ri-heart-line',
  'lo-fi': 'ri-leaf-line',
  lofi: 'ri-leaf-line',
  vaporwave: 'ri-sun-foggy-line',
  downtempo: 'ri-contrast-drop-line',
  chillstep: 'ri-windy-line',
  'math rock': 'ri-calculator-line',
  'nu-metal': 'ri-flame-line',
  'post-rock': 'ri-infinity-line',
};

function formatLabel(genre: string): string {
  const normalized = genre.toLowerCase().trim();
  if (GENRE_LABELS[normalized]) {
    return GENRE_LABELS[normalized];
  }
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getIcon(genre: string): string {
  return GENRE_ICONS[genre.toLowerCase().trim()] ?? 'ri-music-line';
}

interface TasteVibesProps {
  onSelectVibe: (query: string) => void;
}

export const TasteVibes: React.FC<TasteVibesProps> = ({ onSelectVibe }) => {
  const { messages } = useTranslation();
  const { likedTracks, soundCloudTracks } = useLikes();
  const { cachedTracks } = useCache();

  const vibes = useMemo<Vibe[]>(() => {
    const counts = new Map<string, number>();

    // 1. Blend genres from Taste Graph
    const tasteSeeds = getTopTasteSeeds(10, 10);
    tasteSeeds.genres.forEach((g, idx) => {
      counts.set(g, (counts.get(g) || 0) + (10 - idx) * 1.5);
    });

    // 2. Extract microgenres from user's internal liked tracks (highest weight)
    likedTracks.forEach((track, idx) => {
      const weight = Math.max(1.5, 6 - idx * 0.15);
      const extracted = extractGenresFromTrack(track);
      extracted.forEach((g) => {
        counts.set(g, (counts.get(g) || 0) + weight);
      });
    });

    // 3. Extract microgenres from user's cached tracks
    cachedTracks.forEach((track) => {
      const extracted = extractGenresFromTrack(track);
      extracted.forEach((g) => {
        counts.set(g, (counts.get(g) || 0) + 1.2);
      });
    });

    // 4. Extract microgenres from SoundCloud library tracks
    soundCloudTracks.forEach((track) => {
      const extracted = extractGenresFromTrack(track);
      extracted.forEach((g) => {
        counts.set(g, (counts.get(g) || 0) + 1.0);
      });
    });

    // Sort by combined affinity score
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre);

    if (sorted.length >= 3) {
      const selected = sorted.slice(0, 10).map((g) => ({
        label: formatLabel(g),
        icon: getIcon(g),
        query: g,
      }));

      // If fewer than 8, blend with distinct fallback vibes avoiding duplicates
      if (selected.length < 8) {
        const existingQueries = new Set(selected.map((v) => v.query.toLowerCase()));
        for (const fb of FALLBACK_VIBES) {
          if (!existingQueries.has(fb.query.toLowerCase())) {
            selected.push(fb);
            if (selected.length >= 8) break;
          }
        }
      }

      return selected;
    }

    return FALLBACK_VIBES;
  }, [likedTracks, cachedTracks, soundCloudTracks]);

  return (
    <section className="taste-vibes animate-cascade" style={{ animationDelay: '60ms' }}>
      <span className="taste-vibes__label">{messages.taste_vibes.title}</span>
      <div className="taste-vibes__scroll">
        {vibes.map((vibe) => (
          <button
            key={vibe.query}
            type="button"
            className="taste-vibes__chip"
            onClick={() => onSelectVibe(vibe.query)}
            title={`${messages.taste_vibes.launch_vibe}: ${vibe.label}`}
          >
            <i className={`${vibe.icon} taste-vibes__chip-icon`} />
            <span>{vibe.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
