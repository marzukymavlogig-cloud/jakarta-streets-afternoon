// audio.js — all sound is synthesized with WebAudio: three procedural
// Indonesian radio stations, engine hum, sirens, gunshots and UI blips.
// No audio files, nothing fetched. Everything is guarded so a missing or
// suspended AudioContext never breaks the game.
import { pick } from './util.js';

export const STATIONS = [
  { name: 'Kota FM 98 — Pop Indonesia', bpm: 96, scale: [0, 2, 4, 7, 9], root: 220, wave: 'triangle' },
  { name: 'Senja Dangdut 88 — Koplo Sore', bpm: 132, scale: [0, 3, 5, 7, 10], root: 196, wave: 'sawtooth' },
  { name: 'Suara Jakarta 101 — Obrolan & Keroncong', bpm: 78, scale: [0, 4, 5, 7, 11], root: 247, wave: 'sine' },
];

const DJ_LINES = [
  'DJ Rani: "Sore-sore gini enaknya dengerin lagu sambil macet di Sudirman, ya?"',
  'DJ Budi: "Buat yang lagi di jalan, hati-hati, jangan ngebut!"',
  'DJ Rani: "Request lagu? Kirim ke Kota FM, nanti diputerin."',
  'DJ Budi: "Macet di Thamrin? Sabar, bentar lagi sampai."',
  'DJ Sari: "Selamat sore Jakarta! Tetap semangat pulang kampung."',
  'DJ Budi: "Yang lagi nyetir bajaj, klaksonnya jangan kenceng-kenceng."',
  'DJ Rani: "Lagu ini buat Mara, yang lagi berjuang buat bengkel Abang."',
  'DJ Sari: "Hujan gerimis di Ancol, tapi hati tetap hangat."',
];

export function makeAudio(G) {
  const audio = {
    ctx: null,
    master: null,
    station: 0,
    stations: STATIONS,
    djLineText: DJ_LINES[0],
    djIndex: 0,
    djTimer: 0,
    nextNoteT: 0,
    step: 0,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenT: 0,
    ensure() {
      if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.5;
        audio.master.connect(audio.ctx.destination);
        // Engine hum.
        audio.engineOsc = audio.ctx.createOscillator();
        audio.engineOsc.type = 'sawtooth';
        audio.engineOsc.frequency.value = 55;
        audio.engineGain = audio.ctx.createGain();
        audio.engineGain.gain.value = 0;
        const lp = audio.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 320;
        audio.engineOsc.connect(lp);
        lp.connect(audio.engineGain);
        audio.engineGain.connect(audio.master);
        audio.engineOsc.start();
        // Siren.
        audio.sirenOsc = audio.ctx.createOscillator();
        audio.sirenOsc.type = 'sine';
        audio.sirenOsc.frequency.value = 700;
        audio.sirenGain = audio.ctx.createGain();
        audio.sirenGain.gain.value = 0;
        audio.sirenOsc.connect(audio.sirenGain);
        audio.sirenGain.connect(audio.master);
        audio.sirenOsc.start();
      } catch (e) {
        audio.ctx = null;
      }
    },
    djLine() {
      audio.djIndex = (audio.djIndex + 1) % DJ_LINES.length;
      audio.djLineText = DJ_LINES[audio.djIndex];
      return audio.djLineText;
    },
    cycleStation() {
      audio.station = (audio.station + 1) % STATIONS.length;
      audio.step = 0;
      G.hud.toast(`Radio: ${STATIONS[audio.station].name}`);
    },
    sfx(name) {
      if (!audio.ctx || audio.ctx.state !== 'running') return;
      try {
        const t = audio.ctx.currentTime;
        if (name === 'pistol' || name === 'smg' || name === 'rifle' || name === 'shotgun') {
          const dur = name === 'shotgun' ? 0.22 : 0.12;
          const buf = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
          const src = audio.ctx.createBufferSource();
          src.buffer = buf;
          const f = audio.ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = name === 'shotgun' ? 900 : 1800;
          const g = audio.ctx.createGain();
          g.gain.value = name === 'shotgun' ? 0.5 : 0.3;
          src.connect(f); f.connect(g); g.connect(audio.master);
          src.start(t);
        } else if (name === 'punch' || name === 'thud') {
          const o = audio.ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(120, t);
          o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
          const g = audio.ctx.createGain();
          g.gain.setValueAtTime(0.5, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
          o.connect(g); g.connect(audio.master);
          o.start(t); o.stop(t + 0.2);
        } else if (name === 'pickup' || name === 'step' || name === 'mission' || name === 'complete') {
          const o = audio.ctx.createOscillator();
          o.type = 'sine';
          const base = name === 'complete' ? 660 : 520;
          o.frequency.setValueAtTime(base, t);
          o.frequency.setValueAtTime(base * 1.25, t + 0.09);
          const g = audio.ctx.createGain();
          g.gain.setValueAtTime(0.25, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
          o.connect(g); g.connect(audio.master);
          o.start(t); o.stop(t + 0.3);
        } else if (name === 'dryfire') {
          const o = audio.ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = 180;
          const g = audio.ctx.createGain();
          g.gain.setValueAtTime(0.12, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
          o.connect(g); g.connect(audio.master);
          o.start(t); o.stop(t + 0.08);
        } else if (name === 'fail' || name === 'busted' || name === 'wasted') {
          const o = audio.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(220, t);
          o.frequency.exponentialRampToValueAtTime(110, t + 0.5);
          const g = audio.ctx.createGain();
          g.gain.setValueAtTime(0.2, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.55);
          o.connect(g); g.connect(audio.master);
          o.start(t); o.stop(t + 0.6);
        } else if (name === 'siren') {
          // One short whoop; the loop is handled in updateAudio.
        }
      } catch (e) { /* never break the game for a sound */ }
    },
  };
  G.audio = audio;
  return audio;
}

export function updateAudio(G, dt) {
  const a = G.audio;
  if (!a.ctx || a.ctx.state !== 'running') return;
  // DJ chatter rotates about every 20 s.
  a.djTimer += dt;
  if (a.djTimer > 20) {
    a.djTimer = 0;
    a.djLine();
  }
  // Engine hum follows speed.
  try {
    const speed = G.player.inCar ? Math.abs(G.player.inCar.speed) : Math.abs(G.player.speed);
    a.engineGain.gain.value = G.player.inCar ? 0.05 + speed * 0.004 : 0.012;
    a.engineOsc.frequency.value = 55 + speed * 4;
    // Siren wail while wanted >= 2.
    if (G.police.wanted >= 2) {
      a.sirenT += dt;
      a.sirenOsc.frequency.value = 650 + Math.sin(a.sirenT * 2.4) * 220;
      a.sirenGain.gain.value = 0.045;
    } else {
      a.sirenGain.gain.value = 0;
    }
    // Radio sequencer: schedule a note when the beat comes due.
    const st = STATIONS[a.station];
    const beat = 60 / st.bpm / 2;
    a.nextNoteT -= dt;
    if (a.nextNoteT <= 0) {
      a.nextNoteT = beat;
      const scale = st.scale;
      const deg = scale[a.step % scale.length] + 12 * Math.floor(a.step / scale.length) % 24;
      const freq = st.root * Math.pow(2, deg / 12);
      const t = a.ctx.currentTime;
      const o = a.ctx.createOscillator();
      o.type = st.wave;
      o.frequency.value = freq;
      const g = a.ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.95);
      o.connect(g); g.connect(a.master);
      o.start(t); o.stop(t + beat);
      // Dangdut gets a bouncy bass on the off-beat.
      if (a.station === 1 && a.step % 2 === 0) {
        const b = a.ctx.createOscillator();
        b.type = 'sine';
        b.frequency.value = st.root / 2;
        const bg = a.ctx.createGain();
        bg.gain.setValueAtTime(0.14, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
        b.connect(bg); bg.connect(a.master);
        b.start(t); b.stop(t + beat);
      }
      a.step += 1;
    }
  } catch (e) { /* audio must never break the game */ }
}
