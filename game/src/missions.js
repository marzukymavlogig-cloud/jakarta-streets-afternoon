// missions.js — the story of Mara Voss, a courier who came home to Solmara
// to save her brother's garage, plus repeatable taxi and delivery gigs and
// a car dealership. All names, characters and jobs are original.
import * as THREE from 'three';
import { clamp, dist2D } from './util.js';
import { CITY } from './city.js';
import { buildPersonMesh } from './player.js';
import { buildCarMesh } from './vehicles.js';
import { addWanted } from './police.js';

export const SPOTS = {
  garage: { x: -150, z: -150, label: 'Voss Garage' },
  diner: { x: 96, z: -110, label: 'Desert Rose Diner' },
  docks: { x: CITY.half + 42, z: 90, label: 'Solmara Docks' },
  dealer: { x: -64, z: 160, label: 'Sunset Motors' },
  stadium: { x: -CITY.half + 60, z: CITY.half - 60, label: 'Sol Bowl Stadium' },
  plaza: { x: 20, z: 20, label: 'Sol Plaza' },
  beach: { x: CITY.half + 46, z: -140, label: 'East Beach' },
  motel: { x: 170, z: 150, label: 'Cactus Motel' },
};

const STORY = [
  {
    id: 'homecoming', title: '1 — Homecoming',
    brief: 'Mara is back in Solmara. Get to Voss Garage and see what is left of it.',
    steps: [{ text: 'Go to Voss Garage', at: 'garage', radius: 10 }],
    reward: 100,
  },
  {
    id: 'firstfare', title: '2 — First Fare',
    brief: 'The garage needs cash. Pick up a fare at the Desert Rose Diner and drive them to the Sol Bowl — fast, they are late for the game.',
    steps: [
      { text: 'Pick up the fare at the Diner', at: 'diner', radius: 9, onArrive: 'pickup' },
      { text: 'Drive the fare to the Sol Bowl', at: 'stadium', radius: 10, timer: 90, onArrive: 'dropoff' },
    ],
    reward: 180,
  },
  {
    id: 'package', title: '3 — The Package',
    brief: 'A crate at the docks, no questions asked. Grab it — the port police will not like it — and bring it to the garage.',
    steps: [
      { text: 'Collect the crate at the Docks', at: 'docks', radius: 9, onArrive: 'hot' },
      { text: 'Deliver the crate to Voss Garage — lose the heat', at: 'garage', radius: 10, timer: 110, onArrive: 'deliver' },
    ],
    reward: 350,
  },
  {
    id: 'heist', title: '4 — Dustline Heist',
    brief: 'A gold Comet sits unguarded at Sunset Motors. Take it. The whole PD will be on you — get it to the garage.',
    steps: [
      { text: 'Steal the gold Comet at Sunset Motors', at: 'dealer', radius: 20, onArrive: 'steal' },
      { text: 'Bring the Comet to Voss Garage', at: 'garage', radius: 10, onArrive: 'deliver' },
    ],
    reward: 600,
  },
  {
    id: 'sunsetrun', title: '5 — Sunset Run',
    brief: 'One race across Solmara at dusk, five checkpoints, no shortcuts through the river. Win it and the garage is saved.',
    steps: [
      { text: 'Checkpoint 1 — Sol Plaza', at: 'plaza', radius: 11 },
      { text: 'Checkpoint 2 — Cactus Motel', at: 'motel', radius: 11 },
      { text: 'Checkpoint 3 — East Beach', at: 'beach', radius: 11 },
      { text: 'Checkpoint 4 — Desert Rose Diner', at: 'diner', radius: 11 },
      { text: 'Checkpoint 5 — Sol Bowl Stadium', at: 'stadium', radius: 11, timer: 150 },
    ],
    reward: 1000,
  },
];

export const SHOP_CARS = [
  { name: 'Dune Runner', color: 0xe87a2e, kind: 'pickup', price: 800 },
  { name: 'Falcon GT', color: 0x2e6fc2, kind: 'sedan', price: 2200 },
  { name: 'Comet S', color: 0xc23b2e, kind: 'sedan', price: 5000 },
];

export function createMarker(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30; g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc93b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffc93b }));
  gem.position.y = 6; g.add(gem);
  g.visible = false;
  scene.add(g);
  return { group: g, beam, ring, gem, spin: 0 };
}

export function createMissions(scene) {
  return {
    storyIndex: 0, stepIndex: 0, active: null, timer: 0,
    gig: null, gigCd: 0, passenger: null, heistCar: null,
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
  G.hud.setObjective(`${def.title}: ${def.steps[0].text}`);
  G.hud.toast(def.title, def.brief);
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
  G.hud.toast('JOB DONE', `${text}  +$${reward}`);
  G.hud.setObjective('Free roam — find a gig marker, or visit Sunset Motors.');
  G.audio.fanfare();
  m.marker.group.visible = false;
  if (m.passenger) { G.scene.remove(m.passenger.mesh); m.passenger = null; }
  if (m.active && m.active.kind === 'gig') m.gigCd = 6;
  m.active = null; m.timer = 0;
  if (wasStory) {
    m.storyIndex += 1;
    if (m.storyIndex >= STORY.length) {
      m.storyDone = true;
      G.hud.toast('STORY COMPLETE', 'Mara saved the garage. Solmara is yours — free roam, gigs and the dealership remain open.');
      G.mode = G.mode; // stay in play
      G.save.save(G);
    } else {
      G.hud.setObjective(`Next job ready — press M to start: ${STORY[m.storyIndex].title}`);
    }
  }
  G.save.save(G);
}

/** Start the next story job on demand (M key) so the player controls the pace. */
export function startNextStory(G) {
  const m = G.missions;
  if (m.active || m.storyDone || m.storyIndex >= STORY.length) return false;
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
      title: taxi ? 'Taxi gig' : 'Delivery gig',
      steps: [
        { text: taxi ? `Pick up the passenger at ${SPOTS[a].label}` : `Collect the parcel at ${SPOTS[a].label}`, at: a, radius: 9 },
        { text: taxi ? `Drop them at ${SPOTS[b].label}` : `Deliver to ${SPOTS[b].label}`, at: b, radius: 10, timer: 100 },
      ],
    },
  };
  m.stepIndex = 0;
  G.hud.setObjective(`Gig: ${m.active.def.steps[0].text}`);
  G.hud.toast('NEW GIG', taxi ? 'A passenger needs a ride. Yellow marker.' : 'A parcel needs a courier. Yellow marker.');
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
    G.hud.toast('PASSENGER IN', 'They are in a hurry — drive smooth, drive fast.');
  }
  if (kind === 'hot') {
    addWanted(G.police, 40, G.now);
    G.hud.toast('HEAT!', 'Port security called it in. The PD is coming.');
    G.audio.siren();
  }
  if (kind === 'steal') {
    // The gold Comet appears at the dealership; entering it triggers the chase.
    const { group } = buildCarMesh(0xe8b93b, 'sedan');
    group.position.set(SPOTS.dealer.x + 14, 0, SPOTS.dealer.z + 6);
    group.rotation.y = Math.PI / 2;
    G.scene.add(group);
    const car = { mesh: group, kind: 'sedan', speed: 0, heading: Math.PI / 2, driver: false, stolen: true, hp: 100, name: 'Comet (stolen)', gold: true };
    G.traffic.push(car);
    m.heistCar = car;
    G.hud.toast('THE COMET', 'Get in the gold Comet — then run.');
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
      G.hud.toast('TOO LATE', 'The job timed out. Another will come.');
      G.hud.setTimer(0);
      m.active = null; m.marker.group.visible = false;
      if (m.passenger) { G.scene.remove(m.passenger.mesh); m.passenger = null; }
      m.gigCd = 8;
      return;
    }
  } else G.hud.setTimer(0);
  // Heist special: wait until the player is driving the gold car.
  if (m.heistCar && m.stepIndex === 0 && step.onArrive === 'steal') {
    if (p.inCar === m.heistCar) {
      addWanted(G.police, 60, G.now);
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
        : Math.round(60 + d * 0 + 40 + Math.random() * 80);
      const label = isStory ? m.active.def.title : (m.active.def.title + ' paid');
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
  if (!car) return 'No such car.';
  if (G.player.cash < car.price) return `Need $${car.price} — you have $${G.player.cash}. Do gigs first.`;
  if (G.missions.owned.includes(car.name)) return 'You already own that one — it is parked at the garage.';
  G.player.cash -= car.price;
  G.missions.owned.push(car.name);
  const { group } = buildCarMesh(car.color, car.kind);
  const spots = G.missions.owned.length;
  group.position.set(SPOTS.garage.x + 12 + spots * 7, 0, SPOTS.garage.z + 12);
  group.rotation.y = Math.PI / 2;
  G.scene.add(group);
  G.traffic.push({ mesh: group, kind: car.kind, speed: 0, heading: Math.PI / 2, driver: false, stolen: false, hp: 100, name: car.name, owned: true });
  G.hud.toast('NEW CAR', `${car.name} is parked at Voss Garage.`);
  G.save.save(G);
  return `${car.name} bought for $${car.price}. Parked at the garage.`;
}
