// audio.js — all sound is synthesised live with WebAudio: engine hum,
// sirens, impacts, and three procedural Indonesian radio stations with
// DJ chatter text. No audio files.
export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineGain = null;
  let radioNodes = null, station = 0, sirenNodes = null;
  const STATIONS = [
    'Kota FM 98 — Pop Indonesia',
    'Senja Dangdut 88 — Koplo Sore',
    'Suara Jakarta 101 — Obrolan & Keroncong',
  ];
  // Indonesian DJ chatter, rotated on the HUD while a station plays.
  const DJ_LINES = [
    [
      'Selamat sore, Jakarta! Macet di Sudirman, tapi lagu tetap jalan.',
      'Dari Monas sampai Ancol — ini Kota FM, teman sore kamu.',
      'Buat yang lagi di angkot: sabar, bentar lagi sampai.',
    ],
    [
      'Goyang dulu, Jakarta! Dangdut koplo menemani macet sore.',
      'Request lagu? Kirim salam buat yang lagi nunggu di halte.',
      'Sore-sore begini enaknya dengerin koplo sambil makan gorengan.',
    ],
    [
      'Suara Jakarta — obrolan sore dari warung kopi sampai Monas.',
      'Keroncong sore hari, buat yang kangen Jakarta tempo dulu.',
      'Hujan reda, jalanan basah, Jakarta tetap bernyanyi.',
    ],
  ];
  let djIdx = 0;
  const audio = {
    stationName: () => STATIONS[station],
    djLine() {
      const lines = DJ_LINES[station];
      const line = lines[djIdx % lines.length];
      djIdx += 1;
      return '🎙 ' + line;
    },
    ensure() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.4; master.connect(ctx.destination);
        engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
        engineGain = ctx.createGain(); engineGain.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
        audio.startRadio();
      } catch { ctx = null; }
    },
    setEngine(speed01, on) {
      if (!ctx) return;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.08);
    },
    blip(freq = 660) {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.2);
    },
    thud() {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.18);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.22);
    },
    shot() {
      if (!ctx) return;
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.35;
      n.connect(g); g.connect(master); n.start();
    },
    fanfare() {
      if (!ctx) return;
      [523, 659, 784, 1046].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        const t = ctx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.45);
      });
    },
    siren() {
      if (!ctx || sirenNodes) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; g.gain.value = 0.05;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.5;
      const lg = ctx.createGain(); lg.gain.value = 320;
      lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 900;
      o.connect(g); g.connect(master); o.start(); lfo.start();
      sirenNodes = { o, lfo, g };
      setTimeout(() => audio.stopSiren(), 9000);
    },
    stopSiren() {
      if (!sirenNodes || !ctx) return;
      try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    },
    cycleStation() {
      station = (station + 1) % STATIONS.length;
      audio.startRadio();
      return STATIONS[station];
    },
    startRadio() {
      if (!ctx) return;
      audio.stopRadio();
      // A tiny step sequencer: bass + hats, different roots per station.
      // Station 2 (dangdut) gets a bouncier off-beat pattern.
      const roots = [110, 98, 82.4];
      const root = roots[station];
      const tempo = [112, 126, 78][station];
      const stepDur = 60 / tempo / 2;
      let step = 0;
      const timer = setInterval(() => {
        if (!ctx) { clearInterval(timer); return; }
        const t = ctx.currentTime;
        const bassNotes = station === 1 ? [0, 0, 7, 5, 0, 7, 10, 7] : [0, 0, 7, 0, 5, 0, 7, 10];
        const n = bassNotes[step % 8];
        if (step % 2 === 0) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = station === 2 ? 'sine' : 'triangle';
          o.frequency.value = root * Math.pow(2, n / 12);
          g.gain.setValueAtTime(0.14, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
          o.connect(g); g.connect(master); o.start(t); o.stop(t + stepDur * 2);
        }
        if (step % 2 === 1) {
          const nb = ctx.createBufferSource();
          const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          nb.buffer = buf;
          const g = ctx.createGain(); g.gain.value = 0.04;
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
          nb.connect(hp); hp.connect(g); g.connect(master); nb.start(t);
        }
        step++;
      }, stepDur * 1000);
      radioNodes = { timer };
    },
    stopRadio() {
      if (radioNodes) { clearInterval(radioNodes.timer); radioNodes = null; }
    },
  };
  return audio;
}
