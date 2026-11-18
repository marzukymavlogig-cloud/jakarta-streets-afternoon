// hud.js — the JAKARTA heads-up display: rupiah cash, health, wanted stars,
// speed, clock, radio + DJ chatter, objective, toasts, and the 2D minimap
// canvas (roads, Monas, marker, cops, heli, traffic).
import { clamp, formatRp } from './util.js';
import { CITY } from './city.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const els = {
    cash: $('hud-cash'), health: $('hud-health'), healthBar: $('health-fill'),
    stars: $('hud-stars'), speed: $('hud-speed'), clock: $('hud-clock'),
    radio: $('hud-radio'), dj: $('hud-dj'), objective: $('hud-objective'), timer: $('hud-timer'),
    toast: $('toast'), toastTitle: $('toast-title'), toastText: $('toast-text'),
    minimap: $('minimap'), hint: $('hud-hint'), weather: $('hud-weather'),
  };
  const ctx = els.minimap.getContext('2d');
  let toastUntil = 0;
  let djUntil = 0;
  const hud = {
    setObjective(text) { els.objective.textContent = text; },
    setTimer(sec) {
      els.timer.textContent = sec > 0 ? `⏱ ${Math.ceil(sec)}s` : '';
    },
    toast(title, text) {
      els.toastTitle.textContent = title;
      els.toastText.textContent = text;
      els.toast.classList.add('show');
      toastUntil = performance.now() + 4200;
    },
    setRadio(name) {
      els.radio.textContent = '♪ ' + name;
      els.dj.textContent = G.audio.djLine();
      djUntil = performance.now() + 20000;
    },
    setWeather(w) {
      els.weather.textContent = w === 'rain' ? '🌧 Hujan' : w === 'fog' ? '🌫 Berkabut' : '☀ Cerah';
    },
    update() {
      const p = G.player;
      els.cash.textContent = formatRp(p.cash);
      els.healthBar.style.width = clamp(p.health, 0, 100) + '%';
      els.health.textContent = Math.ceil(p.health) + '';
      els.stars.textContent = '★'.repeat(G.police.wanted) + '☆'.repeat(5 - G.police.wanted);
      els.stars.classList.toggle('hot', G.police.wanted > 0);
      const kmh = p.inCar ? Math.abs(p.inCar.speed) * 3.6 : p.speed * 3.6;
      els.speed.textContent = Math.round(kmh) + ' km/h';
      const h = Math.floor(G.hour), mi = Math.floor((G.hour - h) * 60);
      els.clock.textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      if (toastUntil && performance.now() > toastUntil) {
        els.toast.classList.remove('show'); toastUntil = 0;
      }
      // Rotate the DJ chatter line every ~20 s while driving around Jakarta.
      if (djUntil && performance.now() > djUntil) {
        els.dj.textContent = G.audio.djLine();
        djUntil = performance.now() + 20000;
      }
      hud.drawMinimap(ctx);
    },
    drawMinimap(c) {
      const S = 168, half = CITY.half;
      const toMap = (x, z) => [S / 2 + (x / (half + 30)) * (S / 2), S / 2 + (z / (half + 30)) * (S / 2)];
      c.clearRect(0, 0, S, S);
      c.fillStyle = '#10141c'; c.fillRect(0, 0, S, S);
      // Kali Ciliwung (river).
      c.fillStyle = '#2f6a7a';
      const [rx] = toMap(half + 60, 0);
      c.fillRect(rx, 0, S - rx, S);
      // Roads.
      c.strokeStyle = '#3a3f4a'; c.lineWidth = 3;
      const step = CITY.block + CITY.road;
      for (let i = 0; i <= CITY.blocks; i++) {
        const v = -half + i * step;
        const [x1, y1] = toMap(v, -half - 20);
        const [x2, y2] = toMap(v, half + 20);
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        const [hx1, hy1] = toMap(-half - 20, v);
        const [hx2, hy2] = toMap(half + 20, v);
        c.beginPath(); c.moveTo(hx1, hy1); c.lineTo(hx2, hy2); c.stroke();
      }
      // Monas: gold dot at the centre of the map.
      const [mx0, my0] = toMap(0, 0);
      c.fillStyle = '#ffc93b';
      c.beginPath(); c.arc(mx0, my0, 4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffc93b'; c.lineWidth = 1;
      c.beginPath(); c.arc(mx0, my0, 7, 0, Math.PI * 2); c.stroke();
      // Mission marker.
      const m = G.missions.marker;
      if (m.group.visible) {
        const [mx, my] = toMap(m.group.position.x, m.group.position.z);
        c.fillStyle = '#ffc93b';
        c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ffc93b'; c.lineWidth = 2;
        c.beginPath(); c.arc(mx, my, 9, 0, Math.PI * 2); c.stroke();
      }
      // Cops.
      c.fillStyle = '#4a90ff';
      for (const cop of G.police.cops) {
        const [cx, cy] = toMap(cop.mesh.position.x, cop.mesh.position.z);
        c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
      }
      if (G.police.heliActive && G.police.heli) {
        const [hx, hy] = toMap(G.police.heli.mesh.position.x, G.police.heli.mesh.position.z);
        c.fillStyle = '#ff4444';
        c.beginPath(); c.arc(hx, hy, 4, 0, Math.PI * 2); c.fill();
      }
      // Traffic dots.
      c.fillStyle = '#e8e4da';
      for (const car of G.traffic) {
        if (car === G.player.inCar) continue;
        const [cx, cy] = toMap(car.mesh.position.x, car.mesh.position.z);
        c.fillRect(cx - 1, cy - 1, 2, 2);
      }
      // Player arrow.
      const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
      c.save();
      c.translate(px, py);
      c.rotate(-G.player.heading + Math.PI);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
      c.restore();
      // North tick.
      c.fillStyle = '#ffffff'; c.font = 'bold 11px sans-serif';
      c.fillText('N', S / 2 - 4, 12);
    },
  };
  return hud;
}
