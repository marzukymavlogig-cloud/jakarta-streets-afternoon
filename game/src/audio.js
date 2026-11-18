// audio.js — all sound is procedural WebAudio, no audio files. Three
// Indonesian radio stations (pop, dangdut koplo, keroncong talk) with rotating
// DJ chatter, an engine hum that follows speed, a two-tone police siren,
// per-weapon gunshots, thuds, honks and a city hum.
import { pick } from './util.js';

const STATIONS = [
  {
    name: 'KOTA FM 98 — Pop Indonesia', tempo: 112, wave: 'triangle',
    bass: [55, 55, 65.4, 49], melody: [220, 261.6, 329.6, 392, 329.6, 261.6, 220, 196],
    dj: [
      'Selamat sore, Jakarta! Macet di Sudirman, tapi lagu tetap jalan.',
      'Ini Kota FM, teman sore kamu di tengah kota.',
      'Cuaca sore ini cerah — pas buat jalan-jalan ke Monas.',
      'Buat yang lagi di angkot, lagu ini buat kamu.',
    ],
  },
  {
    name: 'SENJA DANGDUT 88 — Koplo Sore', tempo: 132, wave: 'square',
    bass: [49, 49, 58.3, 65.4], melody: [261.6, 311.1, 392, 466.2, 392, 311.1, 261.6, 233.1],
    dj: [
      'Koplo sore! Goyang dulu, macet belakangan.',
      'Dangdut 88 — dari kampung sampai Sudirman, semua goyang.',
      'Buat abang ojol di lampu merah, ini lagu kamu!',
    ],
  },
  {
    name: 'SUARA JAKARTA 101 — Obrolan & Keroncong', tempo: 84, wave: 'sine',
    bass: [65.4, 58.3, 49, 58.3], melody: [329.6, 392, 440, 392, 329.6, 293.7, 261.6, 293.7],
    dj: [
      'Suara Jakarta — obrolan santai sambil keroncong sore.',
      'Dulu Monas sepi, sekarang ramai. Jakarta memang berubah.',
      'Sambil nunggu buka puasa... eh, sambil nunggu senja, dengerin ini.',
    ],
  },
];

export function createAudio() {
  const A = {
    ctx: null, master: null, musicGain: null, engineOsc: null, engineOsc2: null,
    engineGain: null, sirenOsc: null, sirenGain: null, humGain: null,
    station: 0, djIndex: 0, djTimer: 18, nextNoteT: 0, noteStep: 0,
    noiseBuf: null, enabled: false, weather: 'clear',
  };

  A.init = function init() {
    if (A.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain(); A.master.gain.value = 0.5; A.master.connect(A.ctx.destination);
      A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0.16; A.musicGain.connect(A.master);
      // engine: two detuned saws through a lowpass, pitch follows speed
      A.engineOsc = A.ctx.createOscillator(); A.engineOsc.type = 'sawtooth'; A.engineOsc.frequency.value = 55;
      A.engineOsc2 = A.ctx.createOscillator(); A.engineOsc2.type = 'sawtooth'; A.engineOsc2.frequency.value = 82;
      const engineFilter = A.ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
      A.engineGain = A.ctx.createGain(); A.engineGain.gain.value = 0;
      A.engineOsc.connect(engineFilter); A.engineOsc2.connect(engineFilter);
      engineFilter.connect(A.engineGain); A.engineGain.connect(A.master);
      A.engineOsc.start(); A.engineOsc2.start();
      // siren: alternating two-tone
      A.sirenOsc = A.ctx.createOscillator(); A.sirenOsc.type = 'sine'; A.sirenOsc.frequency.value = 700;
      A.sirenGain = A.ctx.createGain(); A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      // city hum: looped filtered noise, very quiet
      const len = A.ctx.sampleRate * 2;
      A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const data = A.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const humSrc = A.ctx.createBufferSource();
      humSrc.buffer = A.noiseBuf; humSrc.loop = true;
      const humFilter = A.ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 220;
      A.humGain = A.ctx.createGain(); A.humGain.gain.value = 0.02;
      humSrc.connect(humFilter); humFilter.connect(A.humGain); A.humGain.connect(A.master);
      humSrc.start();
      A.enabled = true;
    } catch (e) { A.enabled = false; }
  };

  A.stationName = () => STATIONS[A.station].name;
  A.djLine = () => STATIONS[A.station].dj[A.djIndex % STATIONS[A.station].dj.length];
  A.nextStation = function nextStation() {
    A.station = (A.station + 1) % STATIONS.length;
    A.noteStep = 0;
    return A.stationName();
  };

  function playTone(freq, dur, type, vol, when = 0) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + when;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(A.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  A.update = function update(dt, G) {
    if (!A.ctx) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    // music sequencer: bass on the beat, melody eighth-notes
    const st = STATIONS[A.station];
    const stepDur = 60 / st.tempo / 2;
    A.nextNoteT -= dt;
    if (A.nextNoteT <= 0) {
      A.nextNoteT = stepDur;
      const i = A.noteStep;
      playTone(st.bass[i % st.bass.length], stepDur * 1.8, 'sine', 0.5);
      playTone(st.melody[i % st.melody.length], stepDur * 0.9, st.wave, 0.22);
      if (i % 2 === 0) playTone(st.melody[(i + 3) % st.melody.length] * 2, stepDur * 0.5, st.wave, 0.08);
      A.noteStep += 1;
    }
    // DJ chatter rotates ~every 20 s
    A.djTimer -= dt;
    if (A.djTimer <= 0) {
      A.djTimer = 20;
      A.djIndex = (A.djIndex + 1) % 4;
      if (G.hud) G.hud.setRadio(A.stationName(), A.djLine());
    }
    // engine follows speed
    const speed = G.player.inCar ? Math.abs(G.player.inCar.speed) : 0;
    const target = G.player.inCar ? 0.05 + speed * 0.004 : 0;
    A.engineGain.gain.value += (target - A.engineGain.gain.value) * Math.min(1, dt * 6);
    A.engineOsc.frequency.value = 50 + speed * 6;
    A.engineOsc2.frequency.value = 75 + speed * 9;
    // siren while wanted
    const sirenTarget = G.police.wanted > 0 ? 0.05 : 0;
    A.sirenGain.gain.value += (sirenTarget - A.sirenGain.gain.value) * Math.min(1, dt * 4);
    if (sirenTarget > 0) A.sirenOsc.frequency.value = (Math.floor(performance.now() / 450) % 2 === 0) ? 700 : 950;
    // rain raises the hum
    A.humGain.gain.value = G.weather === 'rain' ? 0.06 : 0.02;
  };

  function burst(dur, vol, freq) {
    if (!A.ctx) return;
    const src = A.ctx.createBufferSource();
    src.buffer = A.noiseBuf;
    const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(); src.stop(A.ctx.currentTime + dur);
  }

  A.gunshot = function gunshot(weapon) {
    if (!A.ctx) return;
    if (weapon === 'shotgun') burst(0.28, 0.5, 900);
    else if (weapon === 'rifle') burst(0.16, 0.4, 1400);
    else if (weapon === 'smg') burst(0.08, 0.3, 1800);
    else burst(0.12, 0.35, 1200);
    playTone(weapon === 'shotgun' ? 90 : 140, 0.1, 'square', 0.12);
  };
  A.thud = function thud() { burst(0.2, 0.4, 300); playTone(70, 0.18, 'sine', 0.3); };
  A.blip = function blip() { playTone(660, 0.12, 'sine', 0.25); playTone(880, 0.16, 'sine', 0.25, 0.1); };
  A.fanfare = function fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => playTone(f, 0.3, 'triangle', 0.25, i * 0.12));
  };
  A.honk = function honk() {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    for (const f of [370, 440]) {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.08, t);
      g.gain.setValueAtTime(0.08, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.32);
    }
  };
  A.punch = function punch() { burst(0.08, 0.3, 600); };
  return A;
}
