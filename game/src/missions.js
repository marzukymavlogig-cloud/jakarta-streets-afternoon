// missions.js — the story of Mara Voss and the gig economy around it.
// Five story jobs with generous timers, plus repeatable taxi and delivery
// gigs. Each job is a chain of steps with a gold beam marker, a progress
// bar, and dialogue in the subtitle bar. M starts the next job (cancelling
// a gig); reaching a step's radius advances it; the timer is a soft fail —
// the job can be retried with M.
import * as THREE from 'three';
import { clamp, formatRp } from './util.js';
import { buildCar } from './vehicles.js';

export const STORY_JOBS = [
  {
    id: 1, title: 'Pulang Kampung', reward: 100000, timer: 240,
    intro: ['MARA', 'Akhirnya pulang. Bengkel Budi tidak boleh tutup.'],
    steps: [
      { x: -150, z: -155, r: 16, text: 'Pergi ke Bengkel Mara' },
    ],
    outro: ['BUDI', 'Mara! Kau pulang juga. Bengkel ini butuh tanganmu.'],
  },
  {
    id: 2, title: 'First Fare', reward: 150000, timer: 300,
    intro: ['BUDI', 'Taksi pertama hari ini. Jemput penumpang di halte.'],
    steps: [
      { x: 60, z: 40, r: 10, text: 'Jemput penumpang di Halte TransJakarta' },
      { x: 0, z: 60, r: 14, text: 'Antar penumpang ke Monas' },
    ],
    outro: ['PENUMPANG', 'Terima kasih, Mbak! Tarifnya pas, jalannya halus.'],
  },
  {
    id: 3, title: 'The Package', reward: 250000, timer: 300,
    intro: ['SUARA TAK DIKENAL', 'Paket di Tanjung Priok. Jangan buka. Jangan telat.'],
    steps: [
      { x: 0, z: -280, r: 14, text: 'Ambil paket di Tanjung Priok', heat: 15 },
      { x: -234, z: -78, r: 14, text: 'Antar paket ke Mangga Dua' },
    ],
    outro: ['MARA', 'Paket sampai. Uangnya cukup buat sewa bengkel sebulan.'],
  },
  {
    id: 4, title: 'Dustline Heist', reward: 500000, timer: 300,
    intro: ['BUDI', 'Comet emas itu parkir di GBK. Ambil, bawa ke Ancol. Cepat.'],
    steps: [
      { x: -234, z: 156, r: 12, text: 'Curi Comet emas di GBK', heat: 20, spawnGold: true },
      { x: 280, z: -280, r: 16, text: 'Bawa Comet ke Pantai Ancol' },
    ],
    outro: ['MARA', 'Comet emas sudah di tangan. Bengkel selamat... untuk sekarang.'],
  },
  {
    id: 5, title: 'Sunset Run', reward: 1000000, timer: 300,
    intro: ['BUDI', 'Balapan terakhir, Mara. Menang, dan bengkel ini milik kita lagi.'],
    steps: [
      { x: 0, z: 156, r: 14, text: 'Checkpoint 1: Jl. Sudirman' },
      { x: 234, z: 0, r: 14, text: 'Checkpoint 2: Kampung Melayu' },
      { x: -234, z: -156, r: 14, text: 'Checkpoint 3: Mangga Dua' },
      { x: 0, z: 60, r: 14, text: 'Finish: Monas' },
    ],
    outro: ['MARA', 'Kita menang! Bengkel Mara tetap buka. Jakarta, aku pulang.'],
  },
];

const GIG_TARGETS = [
  { x: 0, z: 60, name: 'Monas' }, { x: 78, z: 78, name: 'Bundaran HI' },
  { x: -273, z: 195, name: 'GBK' }, { x: 273, z: -273, name: 'Pantai Ancol' },
  { x: -234, z: -78, name: 'Mangga Dua' }, { x: 60, z: -100, name: 'Warung Kopi Senja' },
  { x: -150, z: -155, name: 'Bengkel Mara' }, { x: 0, z: -280, name: 'Tanjung Priok' },
];

export function createMissions(scene, rng) {
  // the gold mission beam: a tall translucent column + a ground ring
  const group = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 90, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 45;
  group.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.25, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd700 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
  group.add(ring);
  group.visible = false;
  scene.add(group);
  return {
    storyIndex: 0, active: null, gig: null, gigTimer: 30,
    marker: { group, beam, ring },
    dialogue: null, dialogueT: 0, heistCar: null,
    scene, rng,
  };
}

function setMarker(missions, x, z) {
  missions.marker.group.position.set(x, 0, z);
  missions.marker.group.visible = true;
}

export function say(missions, speaker, text, dur = 4) {
  missions.dialogue = { speaker, text };
  missions.dialogueT = dur;
}

export function startStory(G) {
  const m = G.missions;
  if (m.storyIndex >= STORY_JOBS.length) {
    if (G.hud) G.hud.toast('Semua job cerita selesai! Gigs masih tersedia.', 'info');
    return false;
  }
  if (m.gig) { m.gig = null; m.marker.group.visible = false; }
  const job = STORY_JOBS[m.storyIndex];
  m.active = { job, step: 0, timeLeft: job.timer, progress: 0 };
  G.police.storyMode = true;
  const s = job.steps[0];
  setMarker(m, s.x, s.z);
  say(m, job.intro[0], job.intro[1], 5);
  if (G.hud) G.hud.toast(`Job ${job.id} — ${job.title} dimulai`, 'info');
  if (G.audio) G.audio.blip();
  return true;
}

export function startGig(G) {
  const m = G.missions;
  if (m.active) return false;
  const t = GIG_TARGETS[Math.floor(m.rng() * GIG_TARGETS.length)];
  const isTaxi = m.rng() < 0.5;
  m.gig = {
    kind: isTaxi ? 'taxi' : 'delivery',
    x: t.x, z: t.z, name: t.name,
    reward: isTaxi ? 50000 : 75000, timeLeft: 240,
  };
  setMarker(m, t.x, t.z);
  if (G.hud) G.hud.toast(`${isTaxi ? 'Taksi' : 'Antar paket'}: ke ${t.name} — ${formatRp(m.gig.reward)}`, 'info');
  return true;
}

function completeJob(G) {
  const m = G.missions;
  const job = m.active.job;
  G.player.cash += job.reward;
  say(m, job.outro[0], job.outro[1], 5);
  if (G.hud) {
    G.hud.toast(`Job selesai! +${formatRp(job.reward)}`, 'good');
    G.hud.objective(`Job ${job.id} — ${job.title} selesai. Tekan M untuk job berikutnya.`);
  }
  m.storyIndex += 1;
  m.active = null;
  m.marker.group.visible = false;
  G.police.storyMode = false;
  if (G.audio) G.audio.fanfare();
  if (G.saveGame) G.saveGame();
}

function failJob(G, reason) {
  const m = G.missions;
  if (!m.active) return;
  if (G.hud) G.hud.toast(`Job gagal: ${reason}. Tekan M untuk coba lagi.`, 'warn');
  say(m, 'MARA', 'Gagal... tapi aku tidak menyerah. Coba lagi.', 4);
  m.active = null;
  m.marker.group.visible = false;
  G.police.storyMode = false;
}

export function updateMissions(G, dt) {
  const m = G.missions;
  if (m.dialogueT > 0) m.dialogueT -= dt;
  else if (m.dialogue) m.dialogue = null;
  // gigs appear after the first 30 s of free play
  if (!m.active && !m.gig) {
    m.gigTimer -= dt;
    if (m.gigTimer <= 0) startGig(G);
  }
  const px = G.player.inCar ? G.player.inCar.mesh.position.x : G.player.pos.x;
  const pz = G.player.inCar ? G.player.inCar.mesh.position.z : G.player.pos.z;

  if (m.active) {
    const a = m.active;
    a.timeLeft -= dt;
    if (a.timeLeft <= 0) { failJob(G, 'waktu habis'); return; }
    const step = a.job.steps[a.step];
    const dx = px - step.x, dz = pz - step.z;
    if (dx * dx + dz * dz < step.r * step.r) {
      if (step.heat && G.police) {
        // heat via the police module's rule (story-mode softened)
        G.police.heat = clamp(G.police.heat + step.heat * (G.police.storyMode ? 0.6 : 1), 0, 100);
      }
      if (step.spawnGold && !m.heistCar) {
        const gold = buildCar('sedan', 0xffd700, m.rng, { heading: Math.PI / 2 });
        gold.mesh.position.set(-228, 0, 150);
        gold.maxSpeed = 32;
        m.scene.add(gold.mesh);
        G.traffic.push(gold);
        m.heistCar = gold;
        if (G.hud) G.hud.toast('Comet emas terparkir di GBK — curi mobilnya (E)!', 'info');
      }
      a.step += 1;
      a.progress = a.step / a.job.steps.length;
      if (a.step >= a.job.steps.length) { completeJob(G); return; }
      const next = a.job.steps[a.step];
      setMarker(m, next.x, next.z);
      if (G.audio) G.audio.blip();
    }
    // objective text + progress
    if (G.hud) {
      const s2 = a.job.steps[a.step];
      G.hud.objective(`${a.job.id} — ${a.job.title}: ${s2.text}`);
      G.hud.missionProgress(a.progress, a.timeLeft);
    }
  } else if (m.gig) {
    const g = m.gig;
    g.timeLeft -= dt;
    if (g.timeLeft <= 0) { m.gig = null; m.marker.group.visible = false; m.gigTimer = 45; return; }
    const dx = px - g.x, dz = pz - g.z;
    if (dx * dx + dz * dz < 14 * 14) {
      G.player.cash += g.reward;
      if (G.hud) G.hud.toast(`Gig selesai! +${formatRp(g.reward)}`, 'good');
      if (G.audio) G.audio.blip();
      m.gig = null;
      m.marker.group.visible = false;
      m.gigTimer = 45;
      if (G.saveGame) G.saveGame();
    } else if (G.hud) {
      G.hud.objective(`Gig ${g.kind === 'taxi' ? 'taksi' : 'antar paket'}: ke ${g.name} — ${formatRp(g.reward)}`);
    }
  } else if (G.hud) {
    G.hud.objective(m.storyIndex < STORY_JOBS.length
      ? `Tekan M untuk job ${m.storyIndex + 1} — ${STORY_JOBS[m.storyIndex].title}`
      : 'Jelajahi Jakarta — gigs muncul berkala. Tekan M untuk job.');
    G.hud.missionProgress(0, 0);
  }
  // beam pulse
  if (m.marker.group.visible) {
    const t = performance.now() * 0.002;
    m.marker.beam.material.opacity = 0.28 + Math.sin(t) * 0.1;
    m.marker.ring.scale.setScalar(1 + Math.sin(t) * 0.08);
  }
}
