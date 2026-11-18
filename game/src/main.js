// main.js — JAKARTA boot, game loop, camera, input, carjacking, combat,
// menus, day-night clock and the screenshot staging hook.
// Original code, written for this entry.
import * as THREE from 'three';
import { createCity, CITY } from './city.js';
import { createTraffic, updateTraffic, driveCar, buildCarMesh, CAR_COLORS } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, createPedestrians, updatePedestrians } from './player.js';
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
const traffic = createTraffic(scene, seed, 16);
const peds = createPedestrians(scene, seed, 26);
const police = createPolice(scene);
const missions = createMissions(scene);
const audio = createAudio();
const save = createSave();

// The player's own starter car at the garage.
const starter = buildCarMesh(0x3aa655, 'sedan');
starter.group.position.set(SPOTS.garage.x + 8, 0, SPOTS.garage.z + 18);
starter.group.rotation.y = Math.PI / 2;
scene.add(starter.group);
traffic.push({ mesh: starter.group, kind: 'sedan', speed: 0, heading: Math.PI / 2, driver: false, stolen: false, hp: 100, name: 'Sedan Bengkel', owned: true });

// Pistol pickup at the garage.
const pickup = new THREE.Group();
const pBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0x2e6fc2 }));
pBox.position.y = 1; pickup.add(pBox);
pickup.position.set(SPOTS.garage.x - 6, 0, SPOTS.garage.z + 8);
scene.add(pickup);

const G = {
  scene, camera, renderer, city, player, traffic, peds, police, missions,
  hud: null, audio, save, now: 0, hour: 16.5, weather: 'clear', // golden hour
  mode: 'title', camYaw: Math.PI * 0.8, camPitch: 0.32, camDist: 13,
  camMode: 'follow', weatherTimer: 90, shot: shotName,
};
G.hud = createHud(G);
window.__jakarta = G; // debug handle for playtesting (read-only inspection)
window.__solmara = G; // v1 alias, kept so old tooling keeps working

// ---- Input ----
const keys = new Set();
let mouseDown = false, lastMX = 0, lastMY = 0;
const input = { forward: false, back: false, left: false, right: false, run: false, handbrake: false };
function readKeys() {
  input.forward = keys.has('KeyW') || keys.has('ArrowUp');
  input.back = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.handbrake = keys.has('Space');
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') startNextStory(G);
  if (e.code === 'KeyR') G.hud.setRadio(audio.cycleStation());
  if (e.code === 'KeyC') G.camDist = G.camDist > 12 ? 9 : 16;
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyF') punchOrShoot();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('mousedown', (e) => { mouseDown = true; lastMX = e.clientX; lastMY = e.clientY; audio.ensure(); });
window.addEventListener('mouseup', () => { mouseDown = false; });
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
  if (G.mode !== 'play') return;
  audio.ensure();
  if (player.inCar) {
    const car = player.inCar;
    car.speed = 0;
    player.inCar = null;
    player.pos.set(car.mesh.position.x + 3, 0, car.mesh.position.z + 1);
    player.mesh.visible = true;
    player.mesh.position.copy(player.pos);
    G.hud.toast('JALAN KAKI', 'Kamu turun dari mobil.');
    return;
  }
  // Pistol pickup.
  if (dist2D(player.pos.x, player.pos.z, pickup.position.x, pickup.position.z) < 3 && player.weapon === 'fists') {
    player.weapon = 'pistol'; player.ammo = 24;
    pickup.visible = false;
    G.hud.toast('PISTOL', 'F untuk menembak. 24 peluru. Polisi akan datang.');
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
    player.inCar = car;
    player.mesh.visible = false;
    car.speed = 0;
    G.camYaw = car.heading;
  }
}
function punchOrShoot() {
  if (G.mode !== 'play' || player.inCar || player.punchCd > 0) return;
  player.punchCd = 0.45;
  audio.ensure();
  if (player.weapon === 'pistol' && player.ammo > 0) {
    player.ammo -= 1;
    audio.shot();
    // Hit the nearest ped or cop in front within 30 m.
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let best = null, bd = 30;
    const targets = [...peds.map((p) => ({ x: p.mesh.position.x, z: p.mesh.position.z, ped: p })),
      ...police.cops.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z, cop: c }))];
    for (const t of targets) {
      const dx = t.x - player.pos.x, dz = t.z - player.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bd && side < 2.5) { bd = along; best = t; }
    }
    if (best) {
      addWanted(police, 15, G.now);
      if (best.ped) {
        best.ped.fleeing = 4;
        best.ped.mesh.position.x += fx * 3; best.ped.mesh.position.z += fz * 3;
      }
      if (best.cop) best.cop.speed = 0;
      G.hud.toast('TEMBAKAN', 'Polisi sedang menuju ke sini.');
    }
    if (player.ammo === 0) { player.weapon = 'fists'; G.hud.toast('PELURU HABIS', 'Balik ke tangan kosong.'); }
    return;
  }
  // Punch.
  let hit = false;
  for (const ped of peds) {
    if (dist2D(player.pos.x, player.pos.z, ped.mesh.position.x, ped.mesh.position.z) < 2.6) {
      ped.fleeing = 3;
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
    player.pos.set(60, 0, 120); player.heading = 0;
    clearPolice(scene, police);
  } else {
    const data = save.load();
    if (data) {
      player.cash = data.cash; player.health = data.health;
      missions.storyIndex = data.storyIndex || 0;
      missions.storyDone = !!data.storyDone;
      G.hour = data.hour ?? 16.5; G.weather = data.weather || 'clear';
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
  const inCar = player.inCar;
  const speed = inCar ? Math.abs(inCar.speed) : player.speed;
  const dist = G.camDist + speed * 0.12;
  const height = 4.5 + speed * 0.05;
  let yaw;
  if (inCar) {
    G.camYaw = angleLerp(G.camYaw, inCar.heading, clamp(dt * 1.2, 0, 1));
    yaw = G.camYaw;
  } else yaw = G.camYaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const px = player.pos.x, pz = player.pos.z;
  camTarget.set(px - fx * dist, height + (inCar ? 1.5 : 0), pz - fz * dist);
  camera.position.lerp(camTarget, clamp(dt * 5, 0, 1));
  camera.lookAt(px + fx * 4, inCar ? 2.2 : 1.6, pz + fz * 4);
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
  readKeys();
  if (G.shot && player.inCar) autopilotDrive(G, input, dt);
  if (player.inCar) {
    driveCar(player.inCar, input, dt);
    player.pos.copy(player.inCar.mesh.position);
    player.heading = player.inCar.heading;
  } else {
    updatePlayerOnFoot(player, input, G.camYaw, dt);
  }
  updateTraffic(traffic.filter((c) => c !== player.inCar), player.pos, dt);
  const danger = police.wanted > 0 || player.punchCd > 0.3 ? { x: player.pos.x, z: player.pos.z } : null;
  updatePedestrians(peds, danger, dt);
  const result = updatePolice(police, scene, player, player.inCar, G.now, dt);
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
