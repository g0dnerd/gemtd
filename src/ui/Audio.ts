const STORAGE_KEY = 'gemtd:music-muted';

let audio: HTMLAudioElement | null = null;
let muted = localStorage.getItem(STORAGE_KEY) === '1';
let started = false;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/bgm.ogg');
    audio.loop = true;
    audio.volume = 0.45;
    audio.muted = muted;
  }
  return audio;
}

export function startMusic(): void {
  if (started) return;
  started = true;
  // The bgm is ~3.8 MB and constructing the <audio> eagerly fetches it (browsers
  // default preload to "auto"); doing that at title-mount competes with the JS
  // bundle on first load. Autoplay is blocked before a user gesture anyway, so we
  // defer creating + loading the element until the first interaction — the moment
  // it could actually start playing.
  const begin = () => {
    document.removeEventListener('pointerdown', begin);
    document.removeEventListener('keydown', begin);
    ensureAudio()
      .play()
      .catch(() => {});
  };
  document.addEventListener('pointerdown', begin, { once: true });
  document.addEventListener('keydown', begin, { once: true });
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  if (audio) audio.muted = muted;
  return muted;
}

export function isMuted(): boolean {
  return muted;
}
