const KEY = "gemtd:last-seen-version";

export interface VersionStatus {
  isNewPlayer: boolean;
  hasUnseenUpdate: boolean;
  previousVersion: string | null;
}

export function checkVersion(): VersionStatus {
  let prev: string | null = null;
  try {
    prev = localStorage.getItem(KEY);
  } catch { /* private browsing */ }

  const current = __GAME_VERSION__;

  try {
    localStorage.setItem(KEY, current);
  } catch { /* private browsing */ }

  return {
    isNewPlayer: prev === null,
    hasUnseenUpdate: prev !== null && prev !== current,
    previousVersion: prev,
  };
}
