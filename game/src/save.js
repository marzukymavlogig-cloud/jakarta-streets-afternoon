// save.js — localStorage saves for JAKARTA (key jakarta-save-v1).
// Autosaves after every finished job; the pause menu saves on demand.
export const SAVE_KEY = 'jakarta-save-v1';

export function makeSave(G) {
  const save = {
    saveGame(G) {
      try {
        const p = G.player;
        const data = {
          v: 1,
          cash: p.cash,
          hp: p.hp,
          storyIndex: G.missions.storyIndex,
          arsenal: p.arsenal,
          weapon: p.weapon,
          pos: [p.pos.x, p.pos.z],
          hour: G.hour,
          ownedCars: G.traffic.filter((c) => c.owned).map((c) => c.name),
          savedAt: Date.now(),
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        G.hud.toast('Tersimpan.');
        return true;
      } catch (e) {
        return false;
      }
    },
    loadGame(G) {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.v !== 1) return null;
        const p = G.player;
        p.cash = data.cash ?? 250000;
        p.hp = data.hp ?? 100;
        G.missions.storyIndex = data.storyIndex ?? 0;
        if (data.arsenal) p.arsenal = data.arsenal;
        if (data.weapon && p.arsenal[data.weapon]) p.weapon = data.weapon;
        if (data.pos) {
          p.pos.set(data.pos[0], 0, data.pos[1]);
          p.mesh.position.copy(p.pos);
        }
        if (data.hour) G.hour = data.hour;
        return data;
      } catch (e) {
        return null;
      }
    },
    hasSave() {
      try {
        return !!localStorage.getItem(SAVE_KEY);
      } catch (e) {
        return false;
      }
    },
  };
  G.save = save;
  return save;
}
