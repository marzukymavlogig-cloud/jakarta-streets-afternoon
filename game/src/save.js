// save.js — localStorage save for SOLMARA: cash, health, story progress,
// owned cars, garage, and the time of day. Save early, save often.
export const SAVE_KEY = 'solmara-save-v1';

export function createSave() {
  return {
    save(G) {
      try {
        const data = {
          cash: Math.floor(G.player.cash),
          health: Math.floor(G.player.health),
          storyIndex: G.missions.storyIndex,
          storyDone: G.missions.storyDone,
          owned: G.missions.owned,
          hour: G.hour,
          weather: G.weather,
          x: G.player.pos.x, z: G.player.pos.z,
          savedAt: Date.now(),
        };
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
      } catch { return false; }
    },
    load() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    },
    has() {
      try { return !!window.localStorage.getItem(SAVE_KEY); } catch { return false; }
    },
    clear() {
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    },
  };
}
