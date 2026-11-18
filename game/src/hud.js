// hud.js — every pixel of interface: cash, health, wanted stars, speed,
// clock, weather, radio + DJ line, objective + mission progress bar with %,
// dialogue subtitle bar with a speaker portrait badge, weapon slots row,
// circular minimap, toasts, and the title / pause / busted / wasted screens.
import { formatRp, fmtClock, clamp } from './util.js';
import { WEAPONS } from './player.js';

const STAR_ON = '★', STAR_OFF = '☆';

export function createHud(G) {
  const root = document.getElementById('hud');
  root.innerHTML = `
  <div id="hud-top-left">
    <div id="hud-cash">Rp250.000</div>
    <div id="hud-stars">☆☆☆☆☆</div>
    <div id="hud-objective"><span id="hud-objective-text">Tekan M untuk job pertama.</span></div>
    <div id="hud-mission-bar" style="display:none"><div id="hud-mission-fill"></div><span id="hud-mission-pct">0%</span></div>
    <div id="hud-timer"></div>
  </div>
  <div id="hud-top-right">
    <canvas id="hud-minimap" width="180" height="180"></canvas>
    <div id="hud-health-wrap"><div id="hud-health-fill"></div><span id="hud-health-text">100</span></div>
  </div>
  <div id="hud-bottom-left">
    <div id="hud-radio">KOTA FM 98 — Pop Indonesia</div>
    <div id="hud-dj"></div>
    <div id="hud-weapon">PISTOL 12/24</div>
    <div id="hud-slots">
      <span class="slot" data-w="pistol">1 PISTOL</span>
      <span class="slot" data-w="smg">2 SMG</span>
      <span class="slot" data-w="shotgun">3 SHOTGUN</span>
      <span class="slot" data-w="rifle">4 SENAPAN</span>
    </div>
  </div>
  <div id="hud-bottom-right">
    <div id="hud-speed">0</div>
    <div id="hud-speed-unit">km/jam</div>
    <div id="hud-clock">17:00</div>
    <div id="hud-weather">Cerah</div>
  </div>
  <div id="hud-dialogue" style="display:none">
    <div id="hud-portrait">M</div>
    <div><div id="hud-dialogue-speaker">MARA</div><div id="hud-dialogue-text"></div></div>
  </div>
  <div id="hud-toasts"></div>
  <div id="hud-hint">WASD jalan &nbsp;·&nbsp; E masuk/keluar mobil &nbsp;·&nbsp; F tembak/pukul &nbsp;·&nbsp; R isi ulang &nbsp;·&nbsp; 1–4 senjata &nbsp;·&nbsp; M job &nbsp;·&nbsp; Esc jeda &nbsp;·&nbsp; Q ganti radio</div>
  <div id="hud-title" class="screen">
    <h1>JAKARTA</h1>
    <h2>Streets of the Afternoon</h2>
    <p>Mara Voss pulang ke Jakarta untuk menyelamatkan bengkel kakaknya.
       Jelajahi kota di sore hari, curi mobil, kerjakan job, dan jangan sampai
       ditangkap polisi.</p>
    <p class="controls">WASD gerak &nbsp;·&nbsp; Mouse putar kamera &nbsp;·&nbsp; E mobil &nbsp;·&nbsp; F serang &nbsp;·&nbsp; M job &nbsp;·&nbsp; Esc jeda</p>
    <button id="btn-new">MULAI BARU</button>
    <button id="btn-continue">LANJUTKAN</button>
    <div class="fine">Game orisinal — bukan GTA. Semua kota, karakter, dan musik dibuat sendiri.</div>
  </div>
  <div id="hud-pause" class="screen" style="display:none">
    <h1>JEDA</h1>
    <p>Jakarta menunggu. Kopi di Warung Senja masih hangat.</p>
    <button id="btn-resume">LANJUTKAN</button>
    <button id="btn-save">SIMPAN</button>
    <button id="btn-restart">MULAI BARU</button>
    <button id="btn-quit-title">MENU UTAMA</button>
  </div>
  <div id="hud-busted" class="screen" style="display:none">
    <h1>DITANGKAP!</h1>
    <p>Polisi menangkapmu. Denda Rp150.000.</p>
    <button id="btn-busted-ok">BEBAS DENGAN JAMINAN</button>
  </div>
  <div id="hud-wasted" class="screen" style="display:none">
    <h1>TERLUKA PARAH</h1>
    <p>Kamu dirawat di rumah sakit. Biaya Rp100.000.</p>
    <button id="btn-wasted-ok">BANGUN LAGI</button>
  </div>`;

  const el = (id) => document.getElementById(id);
  const minimap = el('hud-minimap').getContext('2d');

  const hud = {
    toast(msg, kind = 'info') {
      const t = document.createElement('div');
      t.className = 'toast ' + kind;
      t.textContent = msg;
      el('hud-toasts').appendChild(t);
      setTimeout(() => t.remove(), 4200);
      while (el('hud-toasts').children.length > 4) el('hud-toasts').firstChild.remove();
    },
    objective(text) { el('hud-objective-text').textContent = text; },
    missionProgress(p, timeLeft) {
      const bar = el('hud-mission-bar');
      if (G.missions.active) {
        bar.style.display = 'block';
        el('hud-mission-fill').style.width = Math.round(p * 100) + '%';
        el('hud-mission-pct').textContent = Math.round(p * 100) + '%';
        el('hud-timer').textContent = timeLeft > 0 ? `⏱ ${Math.ceil(timeLeft)} dtk` : '';
      } else {
        bar.style.display = 'none';
        el('hud-timer').textContent = '';
      }
    },
    setRadio(name, djLine) {
      el('hud-radio').textContent = name;
      el('hud-dj').textContent = djLine || '';
    },
    showTitle(show) { el('hud-title').style.display = show ? 'flex' : 'none'; },
    showPause(show) { el('hud-pause').style.display = show ? 'flex' : 'none'; },
    showBusted(show) { el('hud-busted').style.display = show ? 'flex' : 'none'; },
    showWasted(show) { el('hud-wasted').style.display = show ? 'flex' : 'none'; },
    update(dt) {
      const P = G.player;
      el('hud-cash').textContent = formatRp(P.cash);
      el('hud-stars').textContent = STAR_ON.repeat(G.police.wanted) + STAR_OFF.repeat(5 - G.police.wanted);
      el('hud-stars').style.color = G.police.wanted > 0 ? '#ff4444' : '#ffd700';
      const hp = Math.max(0, Math.round(P.hp));
      el('hud-health-fill').style.width = hp + '%';
      el('hud-health-fill').style.background = hp > 50 ? '#37c978' : hp > 25 ? '#ffaa22' : '#ff4444';
      el('hud-health-text').textContent = String(hp);
      const speed = P.inCar ? Math.abs(P.inCar.speed) * 3.6 : Math.abs(P.speed) * 3.6;
      el('hud-speed').textContent = String(Math.round(speed));
      el('hud-clock').textContent = fmtClock(G.hour);
      el('hud-weather').textContent = G.weather === 'rain' ? '🌧 Hujan' : G.weather === 'fog' ? '🌫 Kabut' : '☀ Cerah';
      // weapon line + slots
      const w = P.weapon;
      const def = WEAPONS[w];
      const slot = P.arsenal[w];
      el('hud-weapon').textContent = w === 'fists'
        ? 'TINJU'
        : `${def.name} ${slot ? slot.mag : 0}/${slot ? slot.reserve : 0}${P.reloadCd > 0 ? ' — ISI ULANG…' : ''}`;
      for (const s of document.querySelectorAll('#hud-slots .slot')) {
        const owned = s.dataset.w === 'pistol' || !!P.arsenal[s.dataset.w];
        s.classList.toggle('owned', owned);
        s.classList.toggle('active', s.dataset.w === w);
      }
      // dialogue subtitle bar with portrait badge
      const dlg = G.missions.dialogue;
      el('hud-dialogue').style.display = dlg ? 'flex' : 'none';
      if (dlg) {
        el('hud-dialogue-speaker').textContent = dlg.speaker;
        el('hud-dialogue-text').textContent = dlg.text;
        el('hud-portrait').textContent = dlg.speaker[0];
      }
      drawMinimap(minimap, G);
    },
  };
  return hud;
}

// Circular minimap: roads, plaza, river, mission marker, cops, heli, traffic
// and the player arrow. North is up.
function drawMinimap(ctx, G) {
  const S = 180, C = S / 2, R = 84;
  const toMap = (x, z) => [C + (x / 360) * R, C + (z / 360) * R];
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(20, 26, 34, 0.85)'; ctx.fillRect(0, 0, S, S);
  // river
  ctx.fillStyle = '#2e6b7a';
  ctx.fillRect(C + (340 / 360) * R, 0, 20, S);
  // roads
  ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 3;
  for (const c of [-312, -234, -156, -78, 0, 78, 156, 234, 312]) {
    const [x] = toMap(c, 0); const [, y] = toMap(0, c);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  // plaza
  ctx.fillStyle = '#d8d2c4';
  const [px, py] = toMap(0, 0);
  ctx.fillRect(px - 12, py - 12, 24, 24);
  // mission marker
  if (G.missions.marker.group.visible) {
    const [mx, my] = toMap(G.missions.marker.group.position.x, G.missions.marker.group.position.z);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
  }
  // traffic
  ctx.fillStyle = '#bbbbbb';
  for (const car of G.traffic) {
    if (car.owned) continue;
    const [cx, cy] = toMap(car.mesh.position.x, car.mesh.position.z);
    ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  }
  // cops + heli
  ctx.fillStyle = '#4488ff';
  for (const cop of G.police.cops) {
    const [cx, cy] = toMap(cop.mesh.position.x, cop.mesh.position.z);
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  if (G.police.heli) {
    const [hx, hy] = toMap(G.police.heli.mesh.position.x, G.police.heli.mesh.position.z);
    ctx.fillStyle = '#ff8844';
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
  }
  // player arrow
  const [ux, uy] = toMap(G.player.inCar ? G.player.inCar.mesh.position.x : G.player.pos.x,
    G.player.inCar ? G.player.inCar.mesh.position.z : G.player.pos.z);
  const heading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
  ctx.save();
  ctx.translate(ux, uy); ctx.rotate(heading);
  ctx.fillStyle = '#37c978';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  // ring
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke();
}
