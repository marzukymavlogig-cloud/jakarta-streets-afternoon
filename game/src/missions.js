// missions.js — Mara's story: five jobs across Jakarta, plus repeatable
// taxi and delivery gigs. Timers are generous, steps are wide, and M always
// starts the next story job (cancelling a gig first).
import * as THREE from 'three';
import { formatRp } from './util.js';

export const STORY = [
  {
    id: 1, name: 'Pulang Kampung', reward: 100000, time: 240,
    intro: 'Mara: "Akhirnya pulang. Bengkel Abang butuh aku."',
    steps: [
      { text: 'Pergi ke Bengkel Mara', x: -150, z: -155, r: 15 },
      { text: 'Temui Abang di dalam bengkel', x: -146, z: -151, r: 12 },
    ],
  },
  {
    id: 2, name: 'First Fare', reward: 150000, time: 300,
    intro: 'Penumpang pertama: antar ke Monas, jangan ngebut!',
    steps: [
      { text: 'Jemput penumpang di Halte TransJakarta', x: -20, z: 35, r: 12 },
      { text: 'Antar penumpang ke Monas', x: 0, z: 30, r: 14 },
      { text: 'Terima ongkos di Lapangan Merdeka', x: 0, z: 30, r: 10 },
    ],
  },
  {
    id: 3, name: 'The Package', reward: 300000, time: 300,
    intro: 'Paket misterius. Jangan dibuka. Jangan ditanya.',
    heat: 15,
    steps: [
      { text: 'Ambil paket di Tanjung Priok', x: 260, z: -260, r: 14 },
      { text: 'Antar paket ke Mangga Dua', x: -273, z: 117, r: 14 },
      { text: 'Serahkan paket, lalu pergi', x: -260, z: 105, r: 10 },
    ],
  },
  {
    id: 4, name: 'Dustline Heist', reward: 1000000, time: 300,
    intro: 'Comet emas itu milik kita malam ini. Bawa pulang!',
    heat: 20,
    steps: [
      { text: 'Curi Comet emas di Gelora Bung Karno', x: -273, z: 195, r: 16 },
      { text: 'Kabur ke Pantai Ancol', x: 0, z: -320, r: 16 },
      { text: 'Sembunyikan mobil di bengkel', x: -150, z: -155, r: 14 },
    ],
  },
  {
    id: 5, name: 'Sunset Run', reward: 500000, time: 300,
    intro: 'Balapan terakhir saat matahari terbenam. Menang!',
    steps: [
      { text: 'Checkpoint 1 — Bundaran HI', x: 60, z: 60, r: 14 },
      { text: 'Checkpoint 2 — Monas', x: 0, z: 30, r: 14 },
      { text: 'Checkpoint 3 — Tanjung Priok', x: 260, z: -260, r: 14 },
      { text: 'Finis — Bengkel Mara', x: -150, z: -155, r: 14 },
    ],
  },
];

const GIG_SPOTS = [
  { name: 'Monas', x: 0, z: 30 },
  { name: 'Bundaran HI', x: 60, z: 60 },
  { name: 'Tanjung Priok', x: 260, z: -260 },
  { name: 'Mangga Dua', x: -273, z: 117 },
  { name: 'Gelora Bung Karno', x: -273, z: 195 },
  { name: 'Pantai Ancol', x: 0, z: -320 },
  { name: 'Hotel Melati', x: 195, z: -117 },
  { name: 'Wisma 46', x: -195, z: -195 },
];

export function makeMissions(G) {
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffc21a, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 90, 16, 1, true), beamMat);
  beam.position.y = 45;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(4, 5.5, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  const group = new THREE.Group();
  group.add(beam);
  group.add(ring);
  group.visible = false;
  G.scene.add(group);
  return {
    storyIndex: 0,
    active: null, // { kind: 'story'|'gig', job, step, timeLeft }
    marker: { group, beam, ring },
    gigTimer: 30,
    progress: 0,
  };
}

export function setMarker(G, x, z) {
  const m = G.missions.marker;
  m.group.position.set(x, 0, z);
  m.group.visible = true;
}

export function hideMarker(G) {
  G.missions.marker.group.visible = false;
}

function startJob(G, kind, job) {
  const m = G.missions;
  m.active = { kind, job, step: 0, timeLeft: job.time };
  m.progress = 0;
  G.police.storyMode = kind === 'story';
  const s = job.steps[0];
  setMarker(G, s.x, s.z);
  G.hud.showDialogue(job.introSpeaker || 'Mara', job.intro, 5);
  G.hud.toast(`${job.id ? job.id + ' — ' : ''}${job.name}: ${s.text}`);
  G.audio.sfx('mission');
}

export function startStory(G) {
  const m = G.missions;
  if (m.storyIndex >= STORY.length) {
    G.hud.toast('Semua misi cerita selesai! Gigs masih tersedia.');
    return false;
  }
  if (m.active) cancelActive(G, true);
  const job = STORY[m.storyIndex];
  startJob(G, 'story', job);
  return true;
}

export function startGig(G, type) {
  const m = G.missions;
  if (m.active) return false;
  const spot = GIG_SPOTS[Math.floor(Math.random() * GIG_SPOTS.length)];
  const taxi = type === 'taxi';
  const job = {
    name: taxi ? 'Taksi: antar penumpang' : 'Antar paket',
    reward: taxi ? 75000 : 60000,
    time: 240,
    intro: taxi ? `Penumpang mau ke ${spot.name}. Gas!` : `Antar paket ke ${spot.name}.`,
    steps: [{ text: `Pergi ke ${spot.name}`, x: spot.x, z: spot.z, r: 14 }],
  };
  startJob(G, 'gig', job);
  return true;
}

export function cancelActive(G, silent) {
  const m = G.missions;
  if (!m.active) return;
  m.active = null;
  m.progress = 0;
  G.police.storyMode = false;
  hideMarker(G);
  if (!silent) G.hud.toast('Misi dibatalkan.');
}

export function updateMissions(G, dt) {
  const m = G.missions;
  const p = G.player;
  // Gigs trickle in after the first 30 s, one at a time.
  if (!m.active && m.storyIndex < STORY.length) {
    m.gigTimer -= dt;
    if (m.gigTimer <= 0) {
      startGig(G, Math.random() < 0.5 ? 'taxi' : 'delivery');
      m.gigTimer = 45;
    }
  }
  if (!m.active) return;
  const job = m.active.job;
  m.active.timeLeft -= dt;
  if (m.active.timeLeft <= 0) {
    G.hud.toast(`Waktu habis: ${job.name} gagal. Tekan M untuk coba lagi.`);
    G.audio.sfx('fail');
    cancelActive(G, true);
    return;
  }
  const step = job.steps[m.active.step];
  const px = p.inCar ? p.inCar.mesh.position.x : p.pos.x;
  const pz = p.inCar ? p.inCar.mesh.position.z : p.pos.z;
  const d = Math.hypot(px - step.x, pz - step.z);
  m.progress = (m.active.step + Math.max(0, 1 - d / 120)) / job.steps.length;
  // Marker pulse.
  m.marker.beam.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.12;
  if (d < step.r) {
    m.active.step += 1;
    G.audio.sfx('step');
    if (m.active.step >= job.steps.length) {
      // Job complete.
      p.cash += job.reward;
      G.hud.toast(`${job.name} selesai! +${formatRp(job.reward)}`);
      G.hud.showDialogue('Mara', `Selesai. ${formatRp(job.reward)} masuk.`, 4);
      G.audio.sfx('complete');
      if (m.active.kind === 'story') {
        m.storyIndex += 1;
        if (job.heat) G.police.addHeat(G, job.heat);
        if (m.storyIndex < STORY.length) {
          G.hud.toast(`Misi berikutnya: ${STORY[m.storyIndex].name} — tekan M`);
        } else {
          G.hud.toast('Cerita selesai! Kamu menyelamatkan bengkel Abang.');
        }
      }
      m.active = null;
      m.progress = 1;
      hideMarker(G);
      G.police.storyMode = false;
      G.save.saveGame(G);
    } else {
      const next = job.steps[m.active.step];
      setMarker(G, next.x, next.z);
      G.hud.toast(next.text);
      m.progress = m.active.step / job.steps.length;
    }
  }
}
