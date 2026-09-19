const LOGIN_SFX_FILES = [
  '/sfx/jevil_byebye.mp3',
  '/sfx/jevil_chaos.mp3',
  '/sfx/jevil_laugh1.mp3',
  '/sfx/jevil_laugh2.mp3',
  '/sfx/jevil_laugh3.mp3',
  '/sfx/jevil_metamorphosis.mp3',
] as const;

export const playRandomLoginSfx = (volume = 0.17): HTMLAudioElement | null => {
  try {
    const randomIndex = Math.floor(Math.random() * LOGIN_SFX_FILES.length);
    const soundFile = LOGIN_SFX_FILES[randomIndex];
    const audio = new Audio(soundFile);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch((err) => {
      console.warn('[SFX] Audio playback failed or was blocked by browser policy:', err);
    });
    return audio;
  } catch (err) {
    console.error('[SFX] Failed to initialize Audio:', err);
    return null;
  }
};
