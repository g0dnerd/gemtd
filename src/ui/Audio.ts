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
  const el = ensureAudio();
  el.play().catch(() => {
    const resume = () => {
      el.play();
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  });
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
