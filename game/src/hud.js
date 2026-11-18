// hud.js — the HUD: cash, health, wanted stars, speed, clock, weather,
// radio + DJ chatter, objective + mission progress bar, dialogue subtitle
// bar with a speaker portrait, weapon slots, toasts, and the circular
// minimap.
import { formatRp, clamp } from './util.js';
import { WEAPONS, WEAPON_ORDER } from './player.js';

export function makeHud(G) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    toast(msg, dur = 3500) {
      const el = $('hud-toast');
      if (!el) return;
      el.textContent = msg;
      el.style.opacity = '1';
      clearTimeout(hud._toastT);
      hud._toastT = setTimeout(() => { el.style.opacity = '0'; }, dur);
    },
    showDialogue(speaker, text, dur = 4) {
      const bar = $('hud-dialogue');
      if (!bar) return;
      $('hud-dialogue-portrait').textContent = (speaker || 'M')[0].toUpperCase();
      $('hud-dialogue-speaker').textContent = speaker || 'Mara';
      $('hud-dialogue-text').textContent = text;
      bar.style.display = 'flex';
      clearTimeout(hud._dlgT);
      hud._dlgT = setTimeout(() => { bar.style.display = 'none'; }, dur * 1000);
    },
    showScreen(name) {
      for (const s of ['title', 'pause', 'busted', 'wasted']) {
        const el = $(`screen-${s}`);
        if (el) el.style.display = s === name ? 'flex' : 'none';
      }
    },
    hideScreens() {
      for (const s of ['title', 'pause', 'busted', 'wasted']) {
        const el = $(`screen-${s}`);
        if (el) el.style.display = 'none';
      }
    },
  };
  G.hud = hud;
  return hud;
}

function stars(n) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
  return s;
}

let minimapTimer = 0;

export function updateHUD(G, dt) {
  const $ = (id) => document.getElementById(id);
  const p = G.player;
  const cash = $('hud-cash');
  if (cash) cash.textContent = formatRp(p.cash);
  const hp = $('hud-health-fill');
  if (hp) hp.style.width = `${clamp(p.hp, 0, 100)}%`;
  const hpText = $('hud-health-text');
  if (hpText) hpText.textContent = `${Math.max(0, Math.round(p.hp))}`;
  const st = $('hud-stars');
  if (st) {
    st.textContent = stars(G.police.wanted);
    st.style.color = G.police.wanted > 0 ? '#ffd23c' : '#888888';
  }
  const speed = $('hud-speed');
  if (speed) {
    const kmh = p.inCar ? Math.abs(p.inCar.speed) * 3.6 : Math.abs(p.speed) * 3.6;
    speed.textContent = `${Math.round(kmh)}`;
  }
  const clock = $('hud-clock');
  if (clock) {
    const h = Math.floor(G.hour);
    const m = Math.floor((G.hour - h) * 60);
    clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const weather = $('hud-weather');
  if (weather) weather.textContent = G.weather === 'rain' ? '☂ Hujan' : G.weather === 'fog' ? '☁ Kabut' : '☀ Cerah';
  const radio = $('hud-radio');
  if (radio) radio.textContent = `♪ ${G.audio.stations[G.audio.station].name}`;
  const dj = $('hud-dj');
  if (dj) dj.textContent = G.audio.djLineText || '';
  // Objective + mission progress bar.
  const obj = $('hud-objective-text');
  const bar = $('hud-mission-bar');
  if (G.missions.active) {
    const job = G.missions.active.job;
    const step = job.steps[G.missions.active.step];
    if (obj) obj.textContent = `${job.name}: ${step.text}`;
    if (bar) {
      bar.style.display = 'block';
      const pct = Math.round(clamp(G.missions.progress, 0, 1) * 100);
      $('hud-mission-fill').style.width = `${pct}%`;
      $('hud-mission-pct').textContent = `${pct}%`;
      const t = Math.max(0, Math.ceil(G.missions.active.timeLeft));
      $('hud-mission-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
  } else {
    if (obj) {
      obj.textContent = G.missions.storyIndex < 5
        ? `Tekan M untuk misi: ${['Pulang Kampung', 'First Fare', 'The Package', 'Dustline Heist', 'Sunset Run'][G.missions.storyIndex]}`
        : 'Cerita selesai — gigs masih tersedia';
    }
    if (bar) bar.style.display = 'none';
  }
  // Weapon line + slots.
  const wLine = $('hud-weapon');
  if (wLine) {
    const w = WEAPONS[p.weapon];
    const slot = p.arsenal[p.weapon];
    wLine.textContent = p.weapon === 'fists' ? 'TINJU' : `${w.name}  ${slot ? slot.mag : 0} / ${slot ? slot.reserve : 0}`;
  }
  const slots = document.querySelectorAll('#hud-slots .slot');
  slots.forEach((el, i) => {
    const name = WEAPON_ORDER[i];
    const owned = !!p.arsenal[name];
    el.classList.toggle('owned', owned);
    el.classList.toggle('active', p.weapon === name);
    el.style.opacity = owned ? '1' : '0.35';
  });
  // Minimap redraws are throttled: a full 2D redraw every frame is wasted
  // work in software rendering.
  minimapTimer += dt;
  if (minimapTimer > 0.2) {
    minimapTimer = 0;
    drawMinimap(G);
  }
}

function drawMinimap(G) {
  const cv = document.getElementById('minimap');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  const cx = S / 2, cy = S / 2;
  const scale = S / 720;
  ctx.clearRect(0, 0, S, S);
  // Round frame.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, S / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#20241f';
  ctx.fillRect(0, 0, S, S);
  // Roads.
  ctx.strokeStyle = '#555550';
  ctx.lineWidth = 2;
  for (const rx of [-312, -234, -156, -78, 0, 78, 156, 234, 312]) {
    ctx.beginPath(); ctx.moveTo(cx + rx * scale, 0); ctx.lineTo(cx + rx * scale, S); ctx.stroke();
  }
  for (const rz of [-266, -188, -110, -32, 46, 124, 202, 280]) {
    ctx.beginPath(); ctx.moveTo(0, cy + rz * scale); ctx.lineTo(S, cy + rz * scale); ctx.stroke();
  }
  // Plaza + river.
  ctx.fillStyle = '#8a7a5a';
  ctx.fillRect(cx - 48 * scale, cy - 48 * scale, 96 * scale, 96 * scale);
  ctx.fillStyle = '#2a6a8a';
  ctx.fillRect(cx + 304 * scale, 0, 36 * scale, S);
  // Mission marker.
  if (G.missions.marker.group.visible) {
    const mx = cx + G.missions.marker.group.position.x * scale;
    const mz = cy + G.missions.marker.group.position.z * scale;
    ctx.fillStyle = '#ffc21a';
    ctx.beginPath(); ctx.arc(mx, mz, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffc21a';
    ctx.beginPath(); ctx.arc(mx, mz, 8 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  // Traffic dots.
  ctx.fillStyle = '#bbbbbb';
  for (const c of G.traffic) {
    ctx.fillRect(cx + c.mesh.position.x * scale - 1, cy + c.mesh.position.z * scale - 1, 2, 2);
  }
  // Cops + heli.
  ctx.fillStyle = '#ff4444';
  for (const c of G.police.cars) {
    ctx.beginPath(); ctx.arc(cx + c.mesh.position.x * scale, cy + c.mesh.position.z * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (G.police.heli) {
    ctx.fillStyle = '#ff8844';
    ctx.beginPath(); ctx.arc(cx + G.police.heli.mesh.position.x * scale, cy + G.police.heli.mesh.position.z * scale, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const px = cx + G.player.pos.x * scale;
  const pz = cy + G.player.pos.z * scale;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.PI - G.player.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // Rim.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, S / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
}
