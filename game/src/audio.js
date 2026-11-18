// audio.js — all sound is synthesised live with WebAudio: engine hum,
// sirens, impacts, and three procedural Indonesian radio stations with
// DJ chatter text. No audio files.
// v4: per-weapon gunshots, a bump crunch, traffic horns, and a low city hum.
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
        audio.startCityHum(); // v4: low street ambience under everything
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
    shot(kind = 'pistol') {
      // v4: each weapon sounds different — pistol crack, SMG chatter, shotgun
      // boom, rifle crack. Kinds: pistol | smg | shotgun | rifle.
      if (!ctx) return;
      const cfg = {
        pistol: { dur: 0.12, gain: 0.35, low: 900 },
        smg: { dur: 0.08, gain: 0.25, low: 1200 },
        shotgun: { dur: 0.28, gain: 0.5, low: 300 },
        rifle: { dur: 0.16, gain: 0.4, low: 700 },
      }[kind] ?? { dur: 0.12, gain: 0.35, low: 900 };
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * cfg.dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = buf;
      const g = ctx.createGain(); g.gain.value = cfg.gain;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.low * 4;
      n.connect(lp); lp.connect(g); g.connect(master); n.start();
    },
    bump() {
      // v4: the dull crunch of a car (or a running Mara) hitting a wall.
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.22);
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.26);
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
      n.buffer = buf;
      const ng = ctx.createGain(); ng.gain.value = 0.25;
      n.connect(ng); ng.connect(master); n.start();
    },
    honk(pitch = 1) {
      // v4: a Jakarta traffic horn — two-tone, short. Called throttled.
      if (!ctx) return;
      const t = ctx.currentTime;
      [370 * pitch, 466 * pitch].forEach((f) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
      });
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
    startCityHum() {
      // v4: Los Santos bustle you can hear — a low looped street wash
      // (filtered noise) that sits under the radio and the engine.
      if (!ctx || audio._hum) return;
      try {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02; // brown-ish
          d[i] = last * 3.5;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
        const g = ctx.createGain(); g.gain.value = 0.05;
        src.connect(lp); lp.connect(g); g.connect(master); src.start();
        audio._hum = src;
      } catch { /* ambience is optional */ }
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
