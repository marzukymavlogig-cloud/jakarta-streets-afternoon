// main.js — JAKARTA boot, game loop, camera, input, carjacking, combat,
// menus, day-night clock and the screenshot staging hook.
// Original code, written for this entry.
//
// v4: solid buildings (colliders from city.js), Mara's CJ-style arsenal
// (pistol/SMG/shotgun/rifle, 1–4 + R, muzzle flash, drive-by), weapon and
// ammo crates around the city, bump feedback (thud + shake + sparks), and
// Los Santos bustle (denser traffic + crowd, honking, city hum, traffic
// lights, billboards). Radio moved from R to T — R is reload now.
import * as THREE from 'three';
import { createCity, CITY, makeSignTexture } from './city.js';
import { createTraffic, updateTraffic, driveCar, buildCarMesh, CAR_COLORS } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, createPedestrians, updatePedestrians, animateWalk, WEAPONS, WEAPON_ORDER } from './player.js';
import { createPolice, updatePolice, addWanted, clearPolice } from './police.js';
import { createMissions, updateMissions, startNextStory, buyShopCar, SHOP_CARS, SPOTS } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { placeForShot, autopilotDrive, frameChase, SHOT_NAMES } from './shots.js';
import { clamp, lerp, angleLerp, dist2D, mulberry32, formatRp } from './util.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261118;
const rng = mulberry32(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Afternoon realism: filmic tone mapping + soft shadows for the low sun.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(80, 40, 140);

const city = createCity(scene, seed);
const player = createPlayer(scene, 60, 120);
const traffic = createTraffic(scene, seed, 26); // v4: busier streets (was 16)
const peds = createPedestrians(scene, seed, 64, 36); // v4: 36 roam + 28 crowd Monas (was 44)
const police = createPolice(scene);
const missions = createMissions(scene);
const audio = createAudio();
const save = createSave();

// The player's own starter car at the garage — B 1001 JKT, like the ref.
const starter = buildCarMesh(0x3aa655, 'sedan', false, 'B 1001 JKT');
starter.group.position.set(SPOTS.garage.x + 8, 0, SPOTS.garage.z + 18);
starter.group.rotation.y = Math.PI / 2;
scene.add(starter.group);
traffic.push({ mesh: starter.group, kind: 'sedan', speed: 0, heading: Math.PI / 2, driver: false, stolen: false, hp: 100, name: 'Sedan Bengkel', owned: true, steerWheels: starter.steerWheels, body: starter.body });

// Pistol pickup at the garage.
const pickup = new THREE.Group();
const pBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0x2e6fc2 }));
pBox.position.y = 1; pickup.add(pBox);
pickup.position.set(SPOTS.garage.x - 6, 0, SPOTS.garage.z + 8);
scene.add(pickup);

// v4: weapon + ammo crates scattered around Jakarta — walk over one to take
// it. SMG at Mangga Dua, shotgun at Tanjung Priok, rifle at Gelora Bung
// Karno; ammo crates at the garage, Monas, warung, hotel, Ancol, kampung,
// halte and the plaza's north edge.
const CRATES = [
  { kind: 'smg', label: 'SMG', x: -52, z: 148, color: 0x2e6fc2 },
  { kind: 'shotgun', label: 'SHOTGUN', x: 386, z: 84, color: 0x2e6fc2 },
  { kind: 'rifle', label: 'SENAPAN', x: -261, z: 291, color: 0x2e6fc2 },
  { kind: 'ammo', label: 'AMMO', x: -142, z: -140, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: 36, z: 30, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: 88, z: -102, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: 162, z: 142, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: 390, z: -132, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: 241, z: 120, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: 24, z: -60, color: 0x3aa655 },
  { kind: 'ammo', label: 'AMMO', x: -30, z: -40, color: 0x3aa655 },
];
for (const c of CRATES) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshLambertMaterial({ color: c.color }));
  box.position.y = 0.8; g.add(box);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(c.label, '#22242a', '#ffd23b', ''), side: THREE.DoubleSide }));
  sign.position.y = 2.1; g.add(sign);
  g.position.set(c.x, 0, c.z);
  scene.add(g);
  c.group = g; c.taken = false;
}

// v4: Mara's gun — a small dark pistol/SMG shape in her right hand when she
// is armed on foot — plus a muzzle flash at the barrel tip.
const gun = new THREE.Group();
const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55),
  new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
gunBarrel.position.set(0, 0, 0.22); gun.add(gunBarrel);
const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1),
  new THREE.MeshLambertMaterial({ color: 0x2a2a2e }));
gunGrip.position.set(0, -0.1, -0.02); gun.add(gunGrip);
const gunFlash = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.75, 6),
  new THREE.MeshBasicMaterial({ color: 0xffd23b }));
gunFlash.rotation.x = Math.PI / 2;
gunFlash.position.set(0, 0, 0.72); gunFlash.visible = false;
gun.add(gunFlash);
gun.position.set(0.36, 1.32, 0.28);
gun.visible = false;
player.parts.body.add(gun);

// v4: impact sparks — a few bright shards that fly and fade after a crash
// or a bullet hit.
const sparkGeo = new THREE.TetrahedronGeometry(0.2);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
const sparks = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Mesh(sparkGeo, sparkMat);
  s.visible = false; scene.add(s);
  sparks.push({ mesh: s, vel: new THREE.Vector3(), life: 0 });
}
function spawnSparks(x, y, z) {
  for (const s of sparks) {
    s.mesh.position.set(x, y, z);
    s.vel.set((Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 8);
    s.life = 0.35 + Math.random() * 0.25;
    s.mesh.visible = true;
  }
}

const G = {
  scene, camera, renderer, city, player, traffic, peds, police, missions,
  hud: null, audio, save, now: 0, hour: 17.0, weather: 'clear', // golden hour (v4.1: 17:00 — lower, warmer sun like ref 2)
  mode: 'title', camYaw: Math.PI * 0.8, camPitch: 0.32, camDist: 13,
  camMode: 'follow', weatherTimer: 90, shot: shotName,
  shake: 0, honkCd: 3, flashUntil: 0, // v4: bump shake, horn throttle, muzzle flash
  shotFrontCam: false, shotDriveStraight: false, shotFlash: false, // v4 staged shots
  enterAnim: null, // v4.1: car enter/exit walk transition (null when not animating)
};
G.hud = createHud(G);
window.__jakarta = G; // debug handle for playtesting (read-only inspection)
window.__solmara = G; // v1 alias, kept so old tooling keeps working

// ---- Input ----
const keys = new Set();
let mouseDown = false, lastMX = 0, lastMY = 0;
const input = { forward: false, back: false, left: false, right: false, run: false, handbrake: false, firing: false };
function readKeys() {
  input.forward = keys.has('KeyW') || keys.has('ArrowUp');
  input.back = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.handbrake = keys.has('Space');
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) {
    // Held F keeps an automatic weapon firing (SMG / rifle).
    if (e.code === 'KeyF') input.firing = true;
    return;
  }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') startNextStory(G);
  if (e.code === 'KeyT') G.hud.setRadio(audio.cycleStation()); // v4: radio moved to T (R is reload)
  if (e.code === 'KeyR') reloadWeapon();
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 4) switchWeapon(n - 1);
  }
  if (e.code === 'KeyC') G.camDist = G.camDist > 12 ? 9 : 16;
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyF') { input.firing = true; fireWeapon(); }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyF') input.firing = false;
});
canvas.addEventListener('mousedown', (e) => {
  mouseDown = true; lastMX = e.clientX; lastMY = e.clientY; audio.ensure();
  if (G.mode === 'play') input.firing = true; // hold mouse = keep an auto weapon firing
});
window.addEventListener('mouseup', () => { mouseDown = false; input.firing = false; });
window.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  G.camYaw -= (e.clientX - lastMX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - lastMY) * 0.004, 0.05, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});
canvas.addEventListener('click', () => { audio.ensure(); if (G.mode === 'play') punchOrShoot(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Interaction: enter/exit cars, pickups, dealership ----
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const car of traffic) {
    if (car === player.inCar) continue;
    const d = dist2D(player.pos.x, player.pos.z, car.mesh.position.x, car.mesh.position.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function tryInteract() {
  if (G.mode !== 'play' || G.enterAnim) return;
  audio.ensure();
  if (player.inCar) {
    const car = player.inCar;
    startEnterAnim('out', car);
    G.hud.toast('JALAN KAKI', 'Kamu turun dari mobil.');
    return;
  }
  // Pistol pickup: Mara's first gun — a full clip plus 12 spare rounds.
  if (dist2D(player.pos.x, player.pos.z, pickup.position.x, pickup.position.z) < 3 && !player.arsenal.pistol) {
    player.arsenal.pistol = { mag: WEAPONS.pistol.mag, reserve: 12 };
    player.weapon = 'pistol'; player.ammo = 24;
    pickup.visible = false;
    G.hud.toast('PISTOL', 'F untuk menembak. 1–4 ganti senjata, R isi ulang. Polisi akan datang.');
    return;
  }
  // Dealership.
  if (dist2D(player.pos.x, player.pos.z, SPOTS.dealer.x, SPOTS.dealer.z) < 12) {
    openShop();
    return;
  }
  const car = nearestCar(4.5);
  if (car) {
    if (car.driver) {
      car.driver = false;
      addWanted(police, 20, G.now);
      G.hud.toast('BAJAK MOBIL', `Kamu mengambil ${car.name}. Pemiliknya lapor polisi.`);
      audio.thud();
    }
    if (car.gold) G.hud.toast('COMET EMAS', 'Gaspol — satu Jakarta lagi nonton.');
    startEnterAnim('in', car);
  }
}
/** v4.1: getting in or out of a car is a short staged walk, not a teleport.
 *  Mara walks to the driver door (right-hand drive, like Jakarta), then
 *  sits down — or steps out and walks clear. The world keeps moving while
 *  she does it; stepWorld finishes the transition. */
function doorPos(car) {
  const h = car.heading;
  return { x: car.mesh.position.x - Math.cos(h) * 2.2, z: car.mesh.position.z + Math.sin(h) * 2.2 };
}
function startEnterAnim(kind, car) {
  if (kind === 'in') {
    // Park it while Mara walks over — a stolen car must not drive away.
    car.maxSpeed = 0;
    car.speed = 0;
  } else {
    car.speed = 0;
  }
  const door = doorPos(car);
  G.enterAnim = {
    t: 0, dur: 0.55, kind, car,
    fromX: player.pos.x, fromZ: player.pos.z, toX: door.x, toZ: door.z,
  };
}
function stepEnterAnim(dt) {
  const a = G.enterAnim;
  a.t += dt;
  const k = clamp(a.t / a.dur, 0, 1);
  // Walk to the door (or out of it) with the walk cycle playing.
  player.pos.x = lerp(a.fromX, a.toX, k);
  player.pos.z = lerp(a.fromZ, a.toZ, k);
  player.heading = angleLerp(player.heading,
    Math.atan2(a.toX - a.fromX, a.toZ - a.fromZ), clamp(dt * 8, 0, 1));
  player.mesh.rotation.y = player.heading;
  player.mesh.position.copy(player.pos);
  player.walkPhase += dt * 4;
  animateWalk(player.parts, player.walkPhase, 0.7, G.now);
  player.mesh.visible = true;
  if (a.t >= a.dur) {
    if (a.kind === 'in') {
      player.inCar = a.car;
      player.mesh.visible = false;
      a.car.speed = 0;
      G.camYaw = a.car.heading;
    } else {
      player.inCar = null;
      player.pos.set(a.toX, 0, a.toZ);
      player.mesh.position.copy(player.pos);
    }
    G.enterAnim = null;
  }
}
// ---- v4: the arsenal (CJ-style) ----
function switchWeapon(i) {
  if (G.mode !== 'play') return;
  const key = WEAPON_ORDER[i];
  if (!key) return;
  if (!player.arsenal[key]) {
    G.hud.toast('BELUM PUNYA', `Belum ada ${WEAPONS[key].name} — cari peti senjatanya di kota.`);
    return;
  }
  player.weapon = key;
  const s = player.arsenal[key];
  audio.blip(520);
  G.hud.toast(WEAPONS[key].name, `${s.mag} / ${s.reserve} peluru. F menembak, R isi ulang.`);
}
function reloadWeapon() {
  if (G.mode !== 'play') return;
  const p = player;
  if (p.weapon === 'fists' || !p.arsenal[p.weapon] || p.reloadCd > 0) return;
  const w = WEAPONS[p.weapon], s = p.arsenal[p.weapon];
  if (s.mag >= w.mag) return;
  if (s.reserve <= 0) {
    G.hud.toast('PELURU HABIS', `Tidak ada cadangan ${w.name}. Cari peti AMMO hijau.`);
    return;
  }
  const take = Math.min(w.mag - s.mag, s.reserve);
  s.mag += take; s.reserve -= take;
  p.reloadCd = 0.8; p.fireCd = Math.max(p.fireCd, 0.8);
  audio.blip(440);
  G.hud.toast('ISI ULANG', `${w.name} ${s.mag}/${s.reserve}`);
}
function giveWeapon(kind) {
  const w = WEAPONS[kind];
  player.arsenal[kind] = { mag: w.mag, reserve: kind === 'shotgun' ? 12 : w.mag };
  player.weapon = kind;
  G.hud.toast(w.name, `Senjata baru! ${w.mag} peluru di magasin. Tekan ${WEAPON_ORDER.indexOf(kind) + 1} untuk memilih.`);
  audio.fanfare();
}
function giveAmmo() {
  // +30 spare rounds for every gun Mara owns (or a pistol if she has none).
  if (!Object.keys(player.arsenal).length) {
    player.arsenal.pistol = { mag: WEAPONS.pistol.mag, reserve: 12 };
    player.weapon = 'pistol';
    G.hud.toast('PISTOL', 'Peti AMMO — pistol + 24 peluru.');
    audio.blip(660);
    return;
  }
  for (const key of Object.keys(player.arsenal)) {
    const s = player.arsenal[key];
    s.reserve = Math.min(240, s.reserve + 30);
  }
  G.hud.toast('AMMO', '+30 peluru cadangan untuk semua senjata.');
  audio.blip(660);
}
/** One shot (or one pellet spread for the shotgun). Works on foot and as a
 *  drive-by from the car — same ammo, same heat. */
function fireWeapon() {
  const p = player;
  if (G.mode !== 'play' || p.reloadCd > 0 || p.fireCd > 0) return;
  const w = WEAPONS[p.weapon];
  if (!w || !p.arsenal[p.weapon]) { punchOrShoot(); return; } // fists: punch instead
  const state = p.arsenal[p.weapon];
  if (state.mag <= 0) {
    if (state.reserve > 0) { reloadWeapon(); return; }
    p.weapon = 'fists';
    G.hud.toast('PELURU HABIS', 'Senjata kosong — balik ke tangan kosong.');
    return;
  }
  p.fireCd = w.rate;
  state.mag -= 1;
  p.lastShotAt = G.now;
  audio.ensure(); audio.shot(p.weapon);
  // Muzzle flash at the barrel tip (or at the car window on a drive-by).
  G.flashUntil = G.now + 0.07;
  if (p.inCar) {
    gunFlash.visible = false;
  } else {
    gunFlash.visible = true;
  }
  const ox = p.pos.x, oz = p.pos.z;
  const heading = p.inCar ? p.inCar.heading : p.heading;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  let hitAny = false;
  for (let pellet = 0; pellet < w.pellets; pellet++) {
    // Hit the nearest ped or cop in front within range (spread widens the lane).
    let best = null, bd = w.range;
    const sideTol = 2.5 + w.spread * w.range;
    const targets = [...peds.map((pd) => ({ x: pd.mesh.position.x, z: pd.mesh.position.z, ped: pd })),
      ...police.cops.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z, cop: c }))];
    for (const t of targets) {
      const dx = t.x - ox, dz = t.z - oz;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bd && side < sideTol) { bd = along; best = t; }
    }
    if (best) {
      hitAny = true;
      spawnSparks(best.x, 1.4, best.z);
      if (best.ped) {
        best.ped.fleeing = 4;
        best.ped.hurt = 0.5; // v4.1: the hit ped flinches before fleeing
        const knock = p.weapon === 'shotgun' ? 6 : 3;
        best.ped.mesh.position.x += fx * knock; best.ped.mesh.position.z += fz * knock;
      }
      if (best.cop) best.cop.speed = 0;
    }
  }
  if (hitAny) {
    addWanted(police, 15, G.now);
    G.hud.toast('TEMBAKAN', 'Polisi sedang menuju ke sini.');
  }
  if (state.mag === 0 && state.reserve > 0) {
    G.hud.toast('MAGASIN KOSONG', 'Tekan R untuk isi ulang.');
  }
}
function punchOrShoot() {
  if (G.mode !== 'play' || player.punchCd > 0) return;
  // Armed on foot or in the car: F fires the gun. Fists: punch.
  if (player.weapon !== 'fists' && player.arsenal[player.weapon]) { fireWeapon(); return; }
  if (player.inCar) return; // no punching out of a car window
  player.punchCd = 0.45;
  audio.ensure();
  // Punch.
  let hit = false;
  for (const ped of peds) {
    if (dist2D(player.pos.x, player.pos.z, ped.mesh.position.x, ped.mesh.position.z) < 2.6) {
      ped.fleeing = 3;
      ped.hurt = 0.5; // v4.1: the punched ped flinches before fleeing
      ped.mesh.position.x += Math.sin(player.heading) * 2.5;
      ped.mesh.position.z += Math.cos(player.heading) * 2.5;
      hit = true;
    }
  }
  if (hit) { audio.thud(); addWanted(police, 10, G.now); }
}

// ---- Menus ----
const $ = (id) => document.getElementById(id);
function showScreen(name) {
  for (const s of ['title', 'pause', 'dead', 'shop']) $(`screen-${s}`).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', name === 'title' || name === 'shop');
}
function startGame(fresh) {
  audio.ensure();
  if (fresh) {
    save.clear();
    player.cash = 250000; player.health = 100; // Rp250.000 to start the afternoon
    missions.storyIndex = 0; missions.storyDone = false; missions.owned = [];
    player.weapon = 'fists'; player.arsenal = {}; player.ammo = 0; // v4: arsenal resets
    player.pos.set(60, 0, 120); player.heading = 0;
    clearPolice(scene, police);
  } else {
    const data = save.load();
    if (data) {
      player.cash = data.cash; player.health = data.health;
      missions.storyIndex = data.storyIndex || 0;
      missions.storyDone = !!data.storyDone;
      G.hour = data.hour ?? 16.5; G.weather = data.weather || 'clear';
      player.arsenal = data.arsenal || {}; // v4: guns survive a reload
      player.weapon = (data.weapon && player.arsenal[data.weapon]) ? data.weapon : 'fists';
      player.pos.set(data.x ?? 60, 0, data.z ?? 120);
      player.mesh.position.copy(player.pos);
    }
  }
  G.mode = 'play';
  showScreen(null);
  G.hud.setRadio(audio.stationName());
  G.hud.setWeather(G.weather);
  G.hud.setObjective(missions.storyDone ? 'Jalan-jalan — gig, dealer, dan kota milikmu.'
    : 'Tekan M untuk mulai job cerita berikutnya. Marker kuning adalah gig.');
  G.hud.toast('JAKARTA', 'Mara pulang. Selamatkan bengkel — atau kuasai kota ini.');
}
$('btn-new').addEventListener('click', () => startGame(true));
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-freeroam').addEventListener('click', () => startGame(true));
$('btn-resume').addEventListener('click', togglePause);
$('btn-save').addEventListener('click', () => { save.save(G); G.hud.toast('TERSIMPAN', 'Progress tersimpan di browser ini.'); });
$('btn-restart').addEventListener('click', () => { startGame(true); });
$('btn-dead').addEventListener('click', () => {
  player.health = 100; player.cash = Math.max(0, player.cash - 100000);
  clearPolice(scene, police);
  player.pos.set(SPOTS.garage.x, 0, SPOTS.garage.z);
  player.mesh.position.copy(player.pos);
  player.mesh.visible = true; player.inCar = null;
  G.mode = 'play'; showScreen(null);
});
$('btn-shop-close').addEventListener('click', () => { showScreen(null); G.mode = 'play'; });
function togglePause() {
  if (G.mode === 'play') { G.mode = 'paused'; showScreen('pause'); }
  else if (G.mode === 'paused') { G.mode = 'play'; showScreen(null); }
}
function openShop() {
  G.mode = 'shop';
  showScreen('shop');
  const list = $('shop-list');
  list.innerHTML = '';
  SHOP_CARS.forEach((car, i) => {
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `<span class="swatch" style="background:#${car.color.toString(16).padStart(6, '0')}"></span>
      <b>${car.name}</b><span>${formatRp(car.price)}</span>
      <button data-i="${i}">${missions.owned.includes(car.name) ? 'PUNYA' : 'BELI'}</button>`;
    row.querySelector('button').addEventListener('click', (e) => {
      const msg = buyShopCar(G, Number(e.target.dataset.i));
      $('shop-msg').textContent = msg;
      G.hud.setObjective(`Uang ${formatRp(player.cash)} — ${msg}`);
      openShop();
    });
    list.appendChild(row);
  });
  $('shop-cash').textContent = `Uang kamu: ${formatRp(player.cash)}`;
  $('shop-msg').textContent = '';
}

// ---- Camera ----
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (G.camMode === 'cinematic' || G.mode === 'title') {
    const t = G.now * 0.05;
    camera.position.set(Math.sin(t) * 300, 135 + Math.sin(t * 0.6) * 15, Math.cos(t) * 300);
    camera.lookAt(0, 30, 0);
    return;
  }
  // v4 staged shot: the camera stands in FRONT of Mara so her face (and the
  // NPC faces beside her) reads in the frame.
  if (G.shotFrontCam) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    camera.position.set(player.pos.x + fx * G.camDist, 2.4, player.pos.z + fz * G.camDist);
    camera.lookAt(player.pos.x, 1.7, player.pos.z);
    return;
  }
  const inCar = player.inCar;
  const speed = inCar ? Math.abs(inCar.speed) : player.speed;
  const dist = G.camDist + speed * 0.12;
  const height = 4.5 + speed * 0.05 + (G.shotCamH ?? 0);
  let yaw;
  if (inCar) {
    G.camYaw = angleLerp(G.camYaw, inCar.heading, clamp(dt * 1.2, 0, 1));
    yaw = G.camYaw;
  } else yaw = G.camYaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const px = player.pos.x, pz = player.pos.z;
  camTarget.set(px - fx * dist, height + (inCar ? 1.5 : 0), pz - fz * dist);
  camera.position.lerp(camTarget, clamp(dt * 5, 0, 1));
  // v3: a staged shot may look up at a monument (shotLookY) instead of at
  // the player's head height.
  camera.lookAt(px + fx * 4, G.shotLookY ?? (inCar ? 2.2 : 1.6), pz + fz * 4);
  // v4: bump shake — a hard hit rattles the camera briefly, then settles.
  if (G.shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.6;
    G.shake = Math.max(0, G.shake - dt * 1.8);
  }
}

// ---- One fixed step of the world ----
function stepWorld(dt) {
  G.now += dt;
  G.hour = (G.hour + dt * (24 / 360)) % 24; // a full day every 6 minutes
  G.weatherTimer -= dt;
  if (G.weatherTimer <= 0) {
    G.weatherTimer = 75 + Math.random() * 60;
    G.weather = Math.random() < 0.6 ? 'clear' : (Math.random() < 0.5 ? 'rain' : 'fog');
    G.hud.setWeather(G.weather);
  }
  city.updateSky(G.hour, G.weather);
  city.updateRain(player.pos.x, player.pos.z, dt);
  city.updateCityLife(dt, G.now); // v4: traffic lights + neon flicker
  readKeys();
  if (G.shot && player.inCar) {
    // v4: a staged shot may drive straight into a wall (collision test)
    // instead of autopiloting toward the marker.
    if (G.shotDriveStraight) { input.forward = true; input.left = false; input.right = false; input.handbrake = false; }
    else autopilotDrive(G, input, dt);
  }
  // v4.1: while Mara is walking to or from the car door, the transition
  // owns her movement — the normal drive/walk step is skipped.
  if (G.enterAnim) stepEnterAnim(dt);
  else if (player.inCar) {
    driveCar(player.inCar, input, dt, city.colliders);
    // v4: bump feedback — thud, camera shake, sparks at the nose, HP loss.
    if (player.inCar.bump) {
      player.inCar.bump = false;
      audio.bump(); G.shake = 0.55;
      const fx = Math.sin(player.inCar.heading), fz = Math.cos(player.inCar.heading);
      spawnSparks(player.inCar.mesh.position.x + fx * 2.4, 1.0, player.inCar.mesh.position.z + fz * 2.4);
      if (player.inCar.hp <= 25 && !player.inCar.warned) {
        player.inCar.warned = true;
        G.hud.toast('MOBIL RUSAK', 'Bodi penyok parah — hati-hati nabrak gedung.');
      }
    }
    player.pos.copy(player.inCar.mesh.position);
    player.heading = player.inCar.heading;
  } else {
    updatePlayerOnFoot(player, input, G.camYaw, dt, G.now, city.colliders);
    // v4: running into a wall on foot thuds softly and shakes the camera.
    if (player.bump) {
      player.bump = false;
      audio.bump(); G.shake = Math.max(G.shake, 0.25);
    }
    // v4: hold F / mouse to keep an automatic weapon firing.
    if (input.firing && WEAPONS[player.weapon]?.auto) fireWeapon();
    // v4.1: poses BLEND — aim, reload dip, punch swing and the hurt flinch
    // all lerp toward their targets instead of snapping, so Mara never pops
    // between poses. (animateWalk set the arms just above; we bend from
    // those values, so the walk cycle and the pose mix instead of fighting.)
    const armed = player.weapon !== 'fists' && !!player.arsenal[player.weapon];
    gun.visible = armed;
    player.aimBlend = lerp(player.aimBlend ?? 0, armed ? 1 : 0, clamp(dt * 8, 0, 1));
    player.reloadBlend = lerp(player.reloadBlend ?? 0, player.reloadCd > 0 ? 1 : 0, clamp(dt * 8, 0, 1));
    player.punchBlend = lerp(player.punchBlend ?? 0, player.punchCd > 0.25 ? 1 : 0, clamp(dt * 16, 0, 1));
    player.hurtBlend = lerp(player.hurtBlend ?? 0, player.hurtCd > 0 ? 1 : 0, clamp(dt * 10, 0, 1));
    const walkArmR = player.parts.armR.rotation.x;
    const walkArmL = player.parts.armL.rotation.x;
    if (player.punchBlend > 0.01) {
      // Punch: the right arm swings forward-down fast, then recovers.
      player.parts.armR.rotation.x = lerp(walkArmR, -1.9, player.punchBlend);
      player.parts.armR.rotation.z = lerp(player.parts.armR.rotation.z, 0.05, player.punchBlend);
    } else if (player.reloadBlend > 0.01) {
      // Reload: the gun dips toward the chest, the left hand reaches for the mag.
      player.parts.armR.rotation.x = lerp(walkArmR, -0.45, player.reloadBlend);
      player.parts.armL.rotation.x = lerp(walkArmL, -0.95, player.reloadBlend);
      gun.rotation.x = player.reloadBlend * 0.9;
    } else if (player.aimBlend > 0.01) {
      // Aim: right arm forward, left hand steadies the gun.
      player.parts.armR.rotation.x = lerp(walkArmR, -1.35, player.aimBlend);
      player.parts.armR.rotation.z = 0.08;
      player.parts.armL.rotation.x = lerp(walkArmL, -0.5, player.aimBlend);
      gun.rotation.x = 0;
    } else {
      gun.rotation.x = 0;
    }
    if (player.hurtBlend > 0.01) {
      // Hurt: Mara flinches back, hands half up.
      player.parts.body.rotation.x = lerp(player.parts.body.rotation.x, -0.28, player.hurtBlend);
      player.parts.armL.rotation.x = lerp(player.parts.armL.rotation.x, -1.6, player.hurtBlend);
    }
  }
  updateTraffic(traffic.filter((c) => c !== player.inCar), player.pos, dt);
  // v4: gunfire scares peds for a moment after the last shot, like a fight.
  const danger = police.wanted > 0 || player.punchCd > 0.3 || (G.now - player.lastShotAt) < 1.5
    ? { x: player.pos.x, z: player.pos.z } : null;
  updatePedestrians(peds, danger, dt, G.now, city.colliders);
  city.updateVendors(dt, G.now, peds); // stall vendors call out, keliling vendors walk, food steams
  const result = updatePolice(police, scene, player, player.inCar, G.now, dt, city.colliders);
  // v4: the muzzle flash only lives for one frame after a shot (staged shots
  // may hold it with G.shotFlash); sparks fly and fade.
  gunFlash.visible = (!player.inCar && player.weapon !== 'fists' && (G.shotFlash || G.now < G.flashUntil));
  for (const s of sparks) {
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.life -= dt;
    s.mesh.position.x += s.vel.x * dt;
    s.mesh.position.y += s.vel.y * dt;
    s.mesh.position.z += s.vel.z * dt;
    s.vel.y -= 12 * dt;
    if (s.life <= 0) s.mesh.visible = false;
  }
  // v4: Jakarta honks — a nearby car stuck in traffic leans on its horn,
  // and now and then a distant horn answers from somewhere down the avenue.
  G.honkCd -= dt;
  if (G.honkCd <= 0) {
    const jammed = traffic.find((c) => c.maxSpeed && c.speed < c.maxSpeed * 0.6
      && dist2D(c.mesh.position.x, c.mesh.position.z, player.pos.x, player.pos.z) < 45);
    if (jammed) { audio.honk(0.9 + Math.random() * 0.3); G.honkCd = 1.5 + Math.random() * 2.5; }
    else if (Math.random() < 0.3) { audio.honk(0.85 + Math.random() * 0.4); G.honkCd = 5 + Math.random() * 4; }
    else G.honkCd = 2;
  }
  if (result === 'busted') {
    player.cash = Math.max(0, player.cash - 150000);
    player.pos.set(SPOTS.garage.x, 0, SPOTS.garage.z);
    player.mesh.position.copy(player.pos);
    player.mesh.visible = true; player.inCar = null;
    G.mode = 'dead'; $('dead-title').textContent = 'KETANGKAP';
    $('dead-text').textContent = 'Polisi Jakarta mengambil Rp150.000 dan mengantarmu ke bengkel.';
    showScreen('dead');
  } else if (result === 'wasted') {
    G.mode = 'dead'; $('dead-title').textContent = 'TEWAS';
    $('dead-text').textContent = 'Mara tumbang. Bengkel masih menunggu.';
    showScreen('dead');
  }
  updateMissions(G, dt);
  pickup.rotation.y += dt;
  pickup.position.y = Math.sin(G.now * 2) * 0.15;
  // v4: crates bob and spin; walk over one on foot to collect it.
  for (const c of CRATES) {
    if (c.taken) continue;
    c.group.rotation.y += dt * 0.8;
    c.group.position.y = Math.sin(G.now * 2 + c.x) * 0.12;
    if (!player.inCar && dist2D(player.pos.x, player.pos.z, c.x, c.z) < 3) {
      c.taken = true; c.group.visible = false;
      if (c.kind === 'ammo') giveAmmo();
      else giveWeapon(c.kind);
    }
  }
  audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) / 34 : player.speed / 9, !!player.inCar || player.speed > 0.5);
  if (G.mode === 'play') G.hud.update();
}

// ---- Main loop ----
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function loop(now) {
  requestAnimationFrame(loop);
  let frame = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (G.mode === 'play' || G.mode === 'title') {
    if (!G.shotDone) {
      acc += frame;
      let n = 0;
      while (acc >= STEP && n < 5) { stepWorld(STEP); acc -= STEP; n += 1; }
    }
  }
  updateCamera(frame);
  renderer.render(scene, camera);
}

// ---- Shot staging ----
function runShot(name) {
  const plan = placeForShot(G, name);
  if (name === 'start') {
    // The cover: the title screen over the city at dusk.
    G.mode = 'title';
    showScreen('title');
    city.updateSky(G.hour, G.weather);
    updateCamera(1);
    renderer.render(scene, camera);
    G.shotDone = true;
    requestAnimationFrame(() => {
      updateCamera(1);
      renderer.render(scene, camera);
      window.__shotReady = true;
    });
    return;
  }
  G.mode = 'play';
  showScreen(null);
  G.hud.setRadio(audio.stationName());
  // Simulate the staged seconds at fixed steps so the frame is deterministic.
  const steps = Math.round(plan.seconds / STEP);
  for (let i = 0; i < steps; i++) stepWorld(STEP);
  if (name === 'chase') frameChase(G);
  if (name === 'collision' && player.inCar) {
    // Fresh sparks at the nose for the frozen frame (the impact sparks
    // from the sim itself have faded by now) — two bursts, one at each
    // front corner, so they read from the chase camera behind the car.
    const car = player.inCar;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const px = car.mesh.position.x, pz = car.mesh.position.z;
    spawnSparks(px + fx * 2.4 - fz * 1, 1.0, pz + fz * 2.4 + fx * 1);
    spawnSparks(px + fx * 2.4 + fz * 1, 1.0, pz + fz * 2.4 - fx * 1);
    G.shake = 0.4;
  }
  G.shotDone = true; // freeze the staged frame: no more sim before the screenshot
  city.updateSky(G.hour, G.weather);
  updateCamera(1);
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    updateCamera(1);
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
}

// ---- Boot ----
window.addEventListener('error', (e) => { window.__gameError = String(e.message || e.error); });
if (save.has()) $('btn-continue').disabled = false;
if (shotName && SHOT_NAMES.includes(shotName)) {
  runShot(shotName);
} else {
  showScreen('title');
  G.mode = 'title';
}
requestAnimationFrame(loop);
