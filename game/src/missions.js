// missions.js — the story of Mara, who came home to Jakarta to save her
// brother's bengkel (auto repair shop), plus repeatable taxi and delivery
// gigs and a car dealership. All names, characters and jobs are original.
// EASY BY DESIGN (v2): forgiving timers, big markers, low police pressure
// during story jobs, generous checkpoints.
// v4 (benchmark): every job opens with a GTA-style dialogue subtitle
// (MARA: "...") at the bottom of the screen.
import * as THREE from 'three';
import { clamp, dist2D, formatRp } from './util.js';
import { CITY } from './city.js';
import { buildPersonMesh } from './player.js';
import { buildCarMesh } from './vehicles.js';
import { addWanted } from './police.js';

export const SPOTS = {
  garage: { x: -150, z: -150, label: 'Bengkel Mara' },
  diner: { x: 96, z: -110, label: 'Warung Kopi Senja' },
  docks: { x: CITY.half + 42, z: 90, label: 'Tanjung Priok' },
  dealer: { x: -64, z: 160, label: 'Mobil Bekas Mangga Dua' },
  stadium: { x: -CITY.half + 60, z: CITY.half - 60, label: 'Gelora Bung Karno' },
  plaza: { x: 20, z: 20, label: 'Monas' },
  beach: { x: CITY.half + 46, z: -140, label: 'Pantai Ancol' },
  motel: { x: 170, z: 150, label: 'Hotel Melati' },
};

const STORY = [
  {
    id: 'homecoming', title: '1 — Pulang Kampung',
    brief: 'Mara pulang ke Jakarta. Bengkel kakaknya nyaris tutup — datang ke Bengkel Mara dan lihat apa yang tersisa.',
    line: 'Akhirnya pulang. Bengkel kakak masih berdiri — nyaris.',
    steps: [{ text: 'Pergi ke Bengkel Mara', at: 'garage', radius: 16 }],
    reward: 100000,
  },
  {
    id: 'firstfare', title: '2 — Penumpang Pertama',
    brief: 'Bengkel butuh uang. Jemput penumpang di Warung Kopi Senja dan antar ke Gelora Bung Karno — santai saja, waktunya longgar.',
    line: 'Satu penumpang, satu jalan. Bengkel butuh uang, aku butuh jalan.',
    steps: [
      { text: 'Jemput penumpang di Warung Kopi Senja', at: 'diner', radius: 14, onArrive: 'pickup' },
      { text: 'Antar penumpang ke Gelora Bung Karno', at: 'stadium', radius: 15, timer: 240, onArrive: 'dropoff' },
    ],
    reward: 180000,
  },
  {
    id: 'package', title: '3 — Paket dari Priok',
    brief: 'Satu peti di Tanjung Priok, jangan banyak tanya. Ambil, lalu bawa pulang ke bengkel. Polisi pelabuhan mungkin cerewet — tapi santai, mereka lambat sore ini.',
    line: 'Jangan banyak tanya, katanya. Di Priok, itu justru yang bikin penasaran.',
    steps: [
      { text: 'Ambil peti di Tanjung Priok', at: 'docks', radius: 14, onArrive: 'hot' },
      { text: 'Bawa peti ke Bengkel Mara', at: 'garage', radius: 15, timer: 300, onArrive: 'deliver' },
    ],
    reward: 350000,
  },
  {
    id: 'heist', title: '4 — Comet Emas',
    brief: 'Sebuah Comet emas terparkir tanpa penjaga di Mobil Bekas Mangga Dua. Ambil. Polisi akan mengejar — tapi sore ini mereka cuma berdua, dan kamu lebih cepat.',
    line: 'Comet emas, tanpa penjaga. Jakarta memang suka menguji orang pulang kampung.',
    steps: [
      { text: 'Ambil Comet emas di Mangga Dua', at: 'dealer', radius: 24, onArrive: 'steal' },
      { text: 'Bawa Comet ke Bengkel Mara', at: 'garage', radius: 15, onArrive: 'deliver' },
    ],
    reward: 600000,
  },
  {
    id: 'sunsetrun', title: '5 — Balapan Senja',
    brief: 'Satu balapan keliling Jakarta di sore hari, lima checkpoint, santai tapi pasti. Menang dan bengkel selamat.',
    line: 'Lima checkpoint, satu matahari sore. Bengkel selamat atau tidak — sore ini yang menentukan.',
    steps: [
      { text: 'Checkpoint 1 — Monas', at: 'plaza', radius: 16 },
      { text: 'Checkpoint 2 — Hotel Melati', at: 'motel', radius: 16 },
      { text: 'Checkpoint 3 — Pantai Ancol', at: 'beach', radius: 16 },
      { text: 'Checkpoint 4 — Warung Kopi Senja', at: 'diner', radius: 16 },
      { text: 'Checkpoint 5 — Gelora Bung Karno', at: 'stadium', radius: 16, timer: 300 },
    ],
    reward: 1000000,
  },
];

export const SHOP_CARS = [
  { name: 'Dune Runner', color: 0xe87a2e, kind: 'pickup', price: 800000 },
  { name: 'Falcon GT', color: 0x2e6fc2, kind: 'sedan', price: 2200000 },
  { name: 'Comet S', color: 0xc23b2e, kind: 'sedan', price: 5000000 },
];

export function createMarker(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 45; g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc93b, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.8),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  gem.position.y = 7; g.add(gem);
  g.visible = false;
  scene.add(g);
  return { group: g, beam, ring, gem, spin: 0 };
}

export function createMissions(scene) {
  return {
    storyIndex: 0, stepIndex: 0, active: null, timer: 0,
    gig: null, gigCd: 30, passenger: null, heistCar: null,
    marker: createMarker(scene),
    storyDone: false,
    owned: [], // bought cars
  };
}

function stepTarget(m, step) {
  const s = SPOTS[step.at];
  return { x: s.x, z: s.z, label: s.label };
}

export function startStoryMission(G, index) {
  const m = G.missions;
  const def = STORY[index];
  m.active = { def, kind: 'story' };
  m.stepIndex = 0; m.timer = 0;
  G.police.storyMode = true; // easy: police go gentle during story jobs
  G.hud.setObjective(`${def.title}: ${def.steps[0].text}`);
  G.hud.toast(def.title, def.brief);
  if (def.line) G.hud.subtitle('MARA', def.line); // v4: dialogue subtitle
  G.audio.blip(660);
  placeMarkerForStep(G);
}

function placeMarkerForStep(G) {
  const m = G.missions;
  if (!m.active) { m.marker.group.visible = false; return; }
  const step = m.active.def.steps[m.stepIndex];
  const t = stepTarget(m, step);
  m.marker.group.position.set(t.x, 0, t.z);
  m.marker.group.visible = true;
  if (step.timer) m.timer = step.timer;
}

function finishMission(G, reward, text) {
  const m = G.missions;
  const wasStory = m.active && m.active.kind === 'story';
  G.player.cash += reward;
  G.hud.toast('JOB DONE', `${text}  +${formatRp(reward)}`);
  G.hud.setObjective('Jalan-jalan — cari marker gig, atau mampir ke Mangga Dua.');
  G.audio.fanfare();
  m.marker.group.visible = false;
  G.police.storyMode = false;
  if (m.passenger) { G.scene.remove(m.passenger.mesh); m.passenger = null; }
  if (m.active && m.active.kind === 'gig') m.gigCd = 6;
  m.active = null; m.timer = 0;
  if (wasStory) {
    m.storyIndex += 1;
    if (m.storyIndex >= STORY.length) {
      m.storyDone = true;
      G.hud.toast('CERITA SELESAI', 'Mara menyelamatkan bengkel. Jakarta milikmu — gig, dealer, dan kota tetap terbuka.');
      G.mode = G.mode; // stay in play
      G.save.save(G);
    } else {
      G.hud.setObjective(`Job berikutnya siap — tekan M untuk mulai: ${STORY[m.storyIndex].title}`);
    }
  }
  G.save.save(G);
}

/** Start the next story job on demand (M key) so the player controls the pace.
 *  A running gig is cancelled first — the story always wins. */
export function startNextStory(G) {
  const m = G.missions;
  if (m.storyDone || m.storyIndex >= STORY.length) return false;
  if (m.active && m.active.kind === 'story') return false;
  if (m.active && m.active.kind === 'gig') {
    if (m.passenger) { G.scene.remove(m.passenger.mesh); m.passenger = null; }
    m.active = null; m.gigCd = 45;
    G.hud.toast('GIG DIBATALKAN', 'Cerita dulu, gig belakangan.');
  }
  startStoryMission(G, m.storyIndex);
  return true;
}

function spawnGig(G) {
  const m = G.missions;
  const spots = ['diner', 'plaza', 'motel', 'beach', 'stadium'];
  const a = spots[Math.floor(Math.random() * spots.length)];
  let b = spots[Math.floor(Math.random() * spots.length)];
  if (b === a) b = 'garage';
  const taxi = Math.random() < 0.55;
  m.gig = { kind: 'gig', taxi, from: a, to: b, phase: 'pickup', timer: 0 };
  m.active = {
    kind: 'gig',
    def: {
      title: taxi ? 'Gig taksi' : 'Gig antar paket',
      steps: [
        { text: taxi ? `Jemput penumpang di ${SPOTS[a].label}` : `Ambil paket di ${SPOTS[a].label}`, at: a, radius: 14 },
        { text: taxi ? `Antar ke ${SPOTS[b].label}` : `Antar ke ${SPOTS[b].label}`, at: b, radius: 15, timer: 240 },
      ],
    },
  };
  m.stepIndex = 0;
  G.hud.setObjective(`Gig: ${m.active.def.steps[0].text}`);
  G.hud.toast('GIG BARU', taxi ? 'Ada penumpang butuh tumpangan. Ikuti marker kuning.' : 'Ada paket butuh kurir. Ikuti marker kuning.');
  placeMarkerForStep(G);
}

function onStepArrive(G, step) {
  const m = G.missions;
  const kind = step.onArrive;
  if (kind === 'pickup') {
    const parts = buildPersonMesh(0x3aa655, 0xe8b88a, 1);
    parts.group.position.set(G.player.pos.x + 2, 0, G.player.pos.z + 2);
    G.scene.add(parts.group);
    m.passenger = { mesh: parts.group, parts };
    G.hud.toast('PENUMPANG NAIK', 'Mereka buru-buru — tapi santai, waktunya longgar.');
  }
  if (kind === 'hot') {
    // Easy: a little heat only, and story mode keeps the pursuit gentle.
    addWanted(G.police, 15, G.now);
    G.hud.toast('AWAS!', 'Satpam pelabuhan melapor. Polisi datang — tapi cuma sedikit.');
    G.audio.siren();
  }
  if (kind === 'steal') {
    // The gold Comet appears at the dealership; entering it triggers the chase.
    const { group } = buildCarMesh(0xe8b93b, 'sedan');
    group.position.set(SPOTS.dealer.x + 14, 0, SPOTS.dealer.z + 6);
    group.rotation.y = Math.PI / 2;
    G.scene.add(group);
    const car = { mesh: group, kind: 'sedan', speed: 0, heading: Math.PI / 2, driver: false, stolen: true, hp: 100, name: 'Comet (curian)', gold: true };
    G.traffic.push(car);
    m.heistCar = car;
    G.hud.toast('COMET EMAS', 'Naik ke Comet emas — lalu kabur.');
    m.marker.group.visible = false;
    return 'wait-car';
  }
  if (kind === 'dropoff' || kind === 'deliver') {
    const reward = m.active.def === STORY[m.storyIndex]?.def ? 0 : 0;
    void reward;
  }
  return null;
}

export function updateMissions(G, dt) {
  const m = G.missions;
  const p = G.player;
  // Marker spin.
  m.marker.spin += dt * 2;
  m.marker.gem.rotation.y = m.marker.spin;
  m.marker.gem.position.y = 6 + Math.sin(m.marker.spin) * 0.8;
  // Passenger rides along.
  if (m.passenger) {
    if (p.inCar) {
      m.passenger.mesh.visible = false;
    } else {
      m.passenger.mesh.visible = true;
      m.passenger.mesh.position.set(p.pos.x + 1.5, 0, p.pos.z + 1.5);
    }
  }
  // Idle gig spawn.
  if (!m.active && !m.storyDone) { m.gigCd -= dt; if (m.gigCd <= 0) spawnGig(G); }
  if (!m.active) return;
  const step = m.active.def.steps[m.stepIndex];
  if (!step) return;
  if (step.timer) {
    m.timer -= dt;
    G.hud.setTimer(Math.max(0, m.timer));
    if (m.timer <= 0) {
      G.hud.toast('KEHABISAN WAKTU', 'Job-nya lewat. Tenang, job lain akan datang — tekan M lagi.');
      G.hud.setTimer(0);
      m.active = null; m.marker.group.visible = false;
      G.police.storyMode = false;
      if (m.passenger) { G.scene.remove(m.passenger.mesh); m.passenger = null; }
      m.gigCd = 8;
      return;
    }
  } else G.hud.setTimer(0);
  // Heist special: wait until the player is driving the gold car.
  if (m.heistCar && m.stepIndex === 0 && step.onArrive === 'steal') {
    if (p.inCar === m.heistCar) {
      // Easy: only 1 star of heat for the heist getaway.
      addWanted(G.police, 20, G.now);
      G.audio.siren();
      m.stepIndex = 1; placeMarkerForStep(G);
      G.hud.setObjective(`${m.active.def.title}: ${m.active.def.steps[1].text}`);
    }
    return;
  }
  const t = stepTarget(m, step);
  const d = dist2D(p.pos.x, p.pos.z, t.x, t.z);
  if (d < step.radius) {
    const wait = onStepArrive(G, step);
    if (wait === 'wait-car') return;
    const last = m.stepIndex === m.active.def.steps.length - 1;
    if (last) {
      const isStory = m.active.kind === 'story';
      const reward = isStory ? m.active.def.reward
        : Math.round(60000 + Math.random() * 80000);
      const label = isStory ? m.active.def.title : (m.active.def.title + ' dibayar');
      finishMission(G, reward, label);
    } else {
      m.stepIndex += 1;
      G.audio.blip(880);
      placeMarkerForStep(G);
      G.hud.setObjective(`${m.active.def.title}: ${m.active.def.steps[m.stepIndex].text}`);
    }
  }
}

/** Dealership: buy a car with cash; it waits at the garage. */
export function buyShopCar(G, index) {
  const car = SHOP_CARS[index];
  if (!car) return 'Tidak ada mobil itu.';
  if (G.player.cash < car.price) return `Butuh ${formatRp(car.price)} — kamu punya ${formatRp(G.player.cash)}. Kerjakan gig dulu.`;
  if (G.missions.owned.includes(car.name)) return 'Sudah punya — mobilnya parkir di bengkel.';
  G.player.cash -= car.price;
  G.missions.owned.push(car.name);
  const { group } = buildCarMesh(car.color, car.kind);
  const spots = G.missions.owned.length;
  group.position.set(SPOTS.garage.x + 12 + spots * 7, 0, SPOTS.garage.z + 12);
  group.rotation.y = Math.PI / 2;
  G.scene.add(group);
  G.traffic.push({ mesh: group, kind: car.kind, speed: 0, heading: Math.PI / 2, driver: false, stolen: false, hp: 100, name: car.name, owned: true });
  G.hud.toast('MOBIL BARU', `${car.name} parkir di Bengkel Mara.`);
  G.save.save(G);
  return `${car.name} dibeli ${formatRp(car.price)}. Parkir di bengkel.`;
}
