// save.js — localStorage saves. Autosave after every job and gig, plus the
// pause-menu Save button. A save holds cash, health, story progress, the
// arsenal, Mara's position and the hour; loading restores them and offers
// Continue on the title screen.
export const SAVE_KEY = 'jakarta-save-v1';

export function saveGame(G) {
  try {
    const P = G.player;
    const data = {
      version: 1,
      cash: Math.round(P.cash),
      hp: Math.round(P.hp),
      storyIndex: G.missions.storyIndex,
      arsenal: P.arsenal,
      weapon: P.weapon,
      pos: { x: P.pos.x, z: P.pos.z },
      hour: G.hour,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(G, data) {
  const P = G.player;
  P.cash = data.cash ?? 250000;
  P.hp = data.hp ?? 100;
  P.weapon = data.weapon || 'pistol';
  if (data.arsenal) P.arsenal = data.arsenal;
  if (data.pos) {
    P.pos.set(data.pos.x, 0, data.pos.z);
    P.mesh.position.copy(P.pos);
  }
  if (data.hour) G.hour = data.hour;
  G.missions.storyIndex = data.storyIndex ?? 0;
}
