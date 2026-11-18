// main.js — JAKARTA — Streets of the Afternoon. Boot, the fixed-step loop,
// input, third-person camera, on-foot movement, car entering (a staged
// 0.55 s walk to the driver door, never a teleport), driving, combat,
// carjacking, crates, sparks, rain, and the shot-staging entry point.
// The whole game state lives on window.__jakarta so playtests (and the
// staged screenshots) can drive it with real keys.
import * as THREE from 'three';
import { clamp, lerp, damp, angleLerp, mulberry32, resolveCircleOut, dist2, formatRp } from './util.js';
import { buildCity, updateVendors, updateTrafficLights, updateSky } from './city.js';
import { spawnTraffic, driveCar, updateTraffic } from './vehicles.js';
import { buildPersonMesh, animateWalk, createPlayer, createCrates, spawnPeds, updatePeds, WEAPONS, WEAPON_ORDER } from './player.js';
import { createPolice, updatePolice, addHeat, wantedFromHeat } from './police.js';
import { createMissions, updateMissions, startStory, startGig, say } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadSave, applySave, hasSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

const rng = mulberry32(seed);
const city = buildCity(scene, rng);
const traffic = spawnTraffic(scene, rng);
const peds = spawnPeds(scene, rng, city);
const crates = createCrates(scene, rng);
const player = createPlayer(scene, rng);
const police = createPolice(scene, rng);
const missions = createMissions(scene, rng);
const audio = createAudio();

const G = {
  scene, camera, renderer, city, traffic, peds, crates, player, police, missions,
  rng, seed, hour: 17, weather: 'clear', time: 0, mode: 'title',
  camYaw: Math.PI, camPitch: 0.32, camDist: 8, shake: 0,
  keys: {}, enterAnim: null, autoInput: null, autoFire: false,
  muzzleFlash: 0, shotDone: false, shotCam: null, busted: false, wasted: false,
  staging: false, mouseDown: false, saveGame: null, hud: null, audio,
};
window.__jakarta = G;
window.__gameError = null;

const hud = createHud(G);
G.hud = hud;
G.saveGame = () => saveGame(G);

// muzzle flash light + a spark burst pool for wall bumps
const flashLight = new THREE.PointLight(0xffcc66, 0, 18);
scene.add(flashLight);
const sparks = [];
const sparkGeo = new THREE.SphereGeometry(0.06, 6, 4);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
function spawnSparks(x, y, z) {
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(sparkGeo, sparkMat);
    s.position.set(x, y, z);
    s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6);
    s.userData.life = 0.5;
    scene.add(s);
    sparks.push(s);
  }
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.userData.life -= dt;
    s.position.addScaledVector(s.userData.v, dt);
    s.userData.v.y -= 12 * dt;
    if (s.userData.life <= 0) { scene.remove(s); sparks.splice(i, 1); }
  }
}

// rain: a points cloud that follows the camera, visible only when raining
const RAIN_N = 500;
const rainPos = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) {
  rainPos[i * 3] = (Math.random() - 0.5) * 90;
  rainPos[i * 3 + 1] = Math.random() * 30;
  rainPos[i * 3 + 2] = (Math.random() - 0.5) * 90;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.18, transparent: true, opacity: 0.6 }));
rain.visible = false;
scene.add(rain);
function updateRain(dt) {
  rain.visible = G.weather === 'rain';
  if (!rain.visible) return;
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3 + 1] -= dt * 22;
    if (rainPos[i * 3 + 1] < 0) {
      rainPos[i * 3 + 1] = 25 + Math.random() * 5;
      rainPos[i * 3] = cx + (Math.random() - 0.5) * 90;
      rainPos[i * 3 + 2] = cz + (Math.random() - 0.5) * 90;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ------------------------------------------------------------ input
const keys = G.keys;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  audio.init();
  if (e.code === 'KeyM' && G.mode === 'play') startStory(G);
  if (e.code === 'KeyE' && G.mode === 'play') tryEnterExit();
  if (e.code === 'KeyR' && G.mode === 'play') reloadWeapon();
  if (e.code === 'KeyQ' && G.mode === 'play') {
    const name = audio.nextStation();
    hud.setRadio(name, audio.djLine());
    hud.toast(name, 'info');
  }
  if (e.code === 'KeyV' && G.mode === 'play') {
    G.weather = G.weather === 'clear' ? 'rain' : G.weather === 'rain' ? 'fog' : 'clear';
    hud.toast(G.weather === 'rain' ? 'Hujan turun di Jakarta.' : G.weather === 'fog' ? 'Kabut pagi menyelimuti kota.' : 'Langit cerah lagi.', 'info');
  }
  if (e.code === 'Escape') {
    if (G.mode === 'play') { G.mode = 'paused'; hud.showPause(true); }
    else if (G.mode === 'paused') { G.mode = 'play'; hud.showPause(false); }
  }
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 4 && G.mode === 'play') switchWeapon(WEAPON_ORDER[n - 1]);
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  G.mouseDown = true; audio.init();
});
window.addEventListener('mouseup', () => { dragging = false; G.mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - lastY) * 0.004, -0.1, 0.9);
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------ buttons
document.getElementById('btn-new').addEventListener('click', () => {
  audio.init();
  newGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  audio.init();
  const data = loadSave();
  if (data) { newGame(); applySave(G, data); hud.toast('Save dimuat — selamat datang kembali.', 'good'); }
  else hud.toast('Belum ada save.', 'warn');
});
document.getElementById('btn-resume').addEventListener('click', () => { G.mode = 'play'; hud.showPause(false); });
document.getElementById('btn-restart').addEventListener('click', () => { hud.showPause(false); newGame(); });
document.getElementById('btn-quit-title').addEventListener('click', () => { hud.showPause(false); G.mode = 'title'; hud.showTitle(true); });
document.getElementById('btn-save').addEventListener('click', () => {
  if (saveGame(G)) hud.toast('Game tersimpan.', 'good');
  else hud.toast('Gagal menyimpan.', 'warn');
});
document.getElementById('btn-busted-ok').addEventListener('click', () => {
  G.busted = false; hud.showBusted(false);
  player.cash = Math.max(0, player.cash - 150000);
  police.heat = 0; police.wanted = 0; police.bustTimer = 0;
  for (const cop of police.cops) scene.remove(cop.mesh);
  police.cops.length = 0;
  player.hp = 100;
  player.pos.set(0, 0, 90); player.mesh.position.copy(player.pos);
  G.mode = 'play';
});
document.getElementById('btn-wasted-ok').addEventListener('click', () => {
  G.wasted = false; hud.showWasted(false);
  player.cash = Math.max(0, player.cash - 100000);
  player.hp = 100; player.dead = false;
  police.heat = 0; police.wanted = 0;
  player.pos.set(0, 0, 90); player.mesh.position.copy(player.pos);
  G.mode = 'play';
});
document.getElementById('btn-continue').style.display = hasSave() ? 'inline-block' : 'none';

function newGame() {
  player.cash = 250000; player.hp = 100; player.dead = false;
  player.weapon = 'pistol';
  player.arsenal = { pistol: { mag: 12, reserve: 24 } };
  player.inCar = null; player.mesh.visible = true;
  player.pos.set(0, 0, 90); player.mesh.position.copy(player.pos);
  player.heading = Math.PI;
  missions.storyIndex = 0; missions.active = null; missions.gig = null; missions.gigTimer = 30;
  missions.marker.group.visible = false;
  police.heat = 0; police.wanted = 0; police.cops.length = 0; police.bustTimer = 0;
  if (police.heli) { scene.remove(police.heli.mesh); police.heli = null; }
  G.hour = 17; G.weather = 'clear'; G.mode = 'play';
  G.camYaw = Math.PI; G.camPitch = 0.32;
  hud.showTitle(false); hud.showPause(false);
  hud.objective('Tekan M untuk job 1 — Pulang Kampung.');
  hud.setRadio(audio.stationName(), audio.djLine());
  hud.toast('Selamat datang di Jakarta, Mara.', 'info');
}

// ------------------------------------------------------------ enter / exit
// A staged 0.55 s walk to the driver door — Mara walks there, then the car
// takes her. No teleport: the animation is visible mid-transition.
function tryEnterExit() {
  if (G.enterAnim) return;
  const P = player;
  if (P.inCar) {
    const car = P.inCar;
    const doorX = car.mesh.position.x + Math.cos(car.heading) * 1.6;
    const doorZ = car.mesh.position.z - Math.sin(car.heading) * 1.6;
    G.enterAnim = { kind: 'exit', t: 0, dur: 0.55, car, fromX: P.pos.x, fromZ: P.pos.z, toX: doorX, toZ: doorZ };
    return;
  }
  let best = null, bestD = 4.2;
  for (const car of traffic) {
    const d = Math.hypot(car.mesh.position.x - P.pos.x, car.mesh.position.z - P.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) { hud.toast('Tidak ada mobil di dekat sini.', 'warn'); return; }
  const doorX = best.mesh.position.x + Math.cos(best.heading) * 1.6;
  const doorZ = best.mesh.position.z - Math.sin(best.heading) * 1.6;
  G.enterAnim = { kind: 'enter', t: 0, dur: 0.55, car: best, fromX: P.pos.x, fromZ: P.pos.z, toX: doorX, toZ: doorZ };
}

function updateEnterAnim(dt) {
  const a = G.enterAnim;
  if (!a) return;
  a.t += dt;
  const k = clamp(a.t / a.dur, 0, 1);
  player.pos.x = lerp(a.fromX, a.toX, k);
  player.pos.z = lerp(a.fromZ, a.toZ, k);
  player.mesh.position.copy(player.pos);
  player.walkPhase += dt * 6;
  animateWalk(player.parts, player.walkPhase, 0.6, dt, {});
  player.heading = Math.atan2(a.toX - a.fromX, a.toZ - a.fromZ);
  player.mesh.rotation.y = player.heading;
  if (a.t >= a.dur) {
    if (a.kind === 'enter') {
      player.inCar = a.car;
      a.car.owned = true;
      a.car.road = null; // a stolen car leaves the traffic flow
      player.mesh.visible = false;
      hud.toast(a.car.kind === 'bus' ? 'Kamu membajak bus TransJakarta!' : 'Mobil dicuri. Polisi mungkin melihat.', 'info');
      if (!a.car.wasOwned) addHeat(police, 8);
      a.car.wasOwned = true;
    } else {
      player.inCar = null;
      player.mesh.visible = true;
      player.pos.set(a.toX, 0, a.toZ);
      player.mesh.position.copy(player.pos);
    }
    G.enterAnim = null;
  }
}

// ------------------------------------------------------------ combat
function switchWeapon(name) {
  if (!WEAPONS[name]) return;
  if (name !== 'fists' && name !== 'pistol' && !player.arsenal[name]) {
    hud.toast(`${WEAPONS[name].name} belum dimiliki — cari crate ${WEAPONS[name].name}.`, 'warn');
    return;
  }
  player.weapon = name;
  player.reloadCd = 0; player.reloadBlend = 0;
}

function reloadWeapon() {
  const P = player;
  if (P.weapon === 'fists' || P.reloadCd > 0) return;
  const slot = P.arsenal[P.weapon];
  const def = WEAPONS[P.weapon];
  if (!slot || slot.mag >= def.mag || slot.reserve <= 0) return;
  // ammo moves now (so a fast reload check sees the full mag); the
  // reloadCd keeps the dip animation and the fire block honest.
  const need = def.mag - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take; slot.reserve -= take;
  P.reloadCd = 1.0;
  P.reloadBlend = 1;
}

function nearestTarget(range, maxAngle) {
  const P = player;
  const ox = P.inCar ? P.inCar.mesh.position.x : P.pos.x;
  const oz = P.inCar ? P.inCar.mesh.position.z : P.pos.z;
  const heading = P.inCar ? P.inCar.heading : P.heading;
  let best = null, bestD = range;
  const consider = (x, z, obj, kind) => {
    const dx = x - ox, dz = z - oz;
    const d = Math.hypot(dx, dz);
    if (d > bestD) return;
    let ang = Math.atan2(dx, dz) - heading;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) > maxAngle) return;
    bestD = d; best = { obj, kind, d };
  };
  for (const ped of peds) consider(ped.mesh.position.x, ped.mesh.position.z, ped, 'ped');
  for (const cop of police.cops) consider(cop.mesh.position.x, cop.mesh.position.z, cop, 'cop');
  return best;
}

function fireWeapon() {
  const P = player;
  if (P.fireCd > 0 || P.reloadCd > 0 || P.punchCd > 0) return;
  const def = WEAPONS[P.weapon];
  if (P.weapon === 'fists') {
    P.punchCd = 0.4; P.punchBlend = 1;
    audio.punch();
    const t = nearestTarget(2.4, 0.9);
    if (t && t.kind === 'ped') {
      t.obj.hurt = 0.5; t.obj.fleeing = 5;
      addHeat(police, 6);
    }
    return;
  }
  const slot = P.arsenal[P.weapon];
  if (!slot || slot.mag <= 0) {
    if (slot && slot.reserve > 0) reloadWeapon();
    else hud.toast('Amunisi habis — cari crate AMMO.', 'warn');
    return;
  }
  slot.mag -= 1;
  P.fireCd = def.rate;
  audio.gunshot(P.weapon);
  // muzzle flash at the gun, in front of Mara / the car window
  const ox = P.inCar ? P.inCar.mesh.position.x : P.pos.x;
  const oz = P.inCar ? P.inCar.mesh.position.z : P.pos.z;
  const heading = P.inCar ? P.inCar.heading : P.heading;
  flashLight.position.set(ox + Math.sin(heading) * 1.2, 1.5, oz + Math.cos(heading) * 1.2);
  flashLight.intensity = 6;
  G.muzzleFlash = 0.12;
  G.shake = Math.max(G.shake, 0.08);
  for (let p = 0; p < def.pellets; p++) {
    const t = nearestTarget(def.range, 0.45);
    if (!t) break;
    if (t.kind === 'ped') {
      t.obj.hurt = 0.5; t.obj.fleeing = 5;
      addHeat(police, 5);
    } else if (t.kind === 'cop') {
      t.obj.hp = Math.max(0, t.obj.hp - def.damage);
      addHeat(police, 10);
    }
  }
  if (!P.inCar) addHeat(police, 2);
}

// ------------------------------------------------------------ the world step
function stepWorld(dt) {
  G.time += dt;
  G.hour += dt / 15; // a full day in 6 minutes
  if (G.hour >= 24) G.hour -= 24;
  const P = player;
  P.fireCd = Math.max(0, P.fireCd - dt);
  P.reloadCd = Math.max(0, P.reloadCd - dt);
  P.punchCd = Math.max(0, P.punchCd - dt);
  P.reloadBlend = P.reloadCd > 0 ? clamp(P.reloadCd, 0, 1) : damp(P.reloadBlend, 0, 6, dt);
  P.punchBlend = P.punchCd > 0 ? 1 : damp(P.punchBlend, 0, 5, dt);
  P.hurt = Math.max(0, P.hurt - dt);
  G.muzzleFlash = Math.max(0, G.muzzleFlash - dt);
  flashLight.intensity = G.muzzleFlash > 0 ? 6 : 0;
  G.shake = damp(G.shake, 0, 5, dt);

  const input = G.autoInput || {
    up: !!keys['KeyW'] || !!keys['ArrowUp'],
    down: !!keys['KeyS'] || !!keys['ArrowDown'],
    left: !!keys['KeyA'] || !!keys['ArrowLeft'],
    right: !!keys['KeyD'] || !!keys['ArrowRight'],
    handbrake: !!keys['Space'],
  };
  const wantFire = G.autoFire || G.mouseDown || !!keys['KeyF'];

  updateEnterAnim(dt);

  if (G.mode === 'play' || G.staging) {
    if (P.inCar && !G.enterAnim) {
      const res = driveCar(P.inCar, input, dt, city.colliders, G.time);
      if (res.hit && res.impact > 4) {
        audio.thud();
        G.shake = Math.max(G.shake, 0.6);
        spawnSparks(P.inCar.mesh.position.x + Math.sin(P.inCar.heading) * 2, 0.8,
          P.inCar.mesh.position.z + Math.cos(P.inCar.heading) * 2);
        if (P.inCar.hp <= 25) hud.toast(`Mobil rusak! HP ${P.inCar.hp}`, 'warn');
        if (P.inCar.hp <= 0) {
          hud.toast('Mobilmu hancur!', 'warn');
          P.hp = Math.max(1, P.hp - 20);
          const car = P.inCar;
          P.inCar = null; P.mesh.visible = true;
          P.pos.set(car.mesh.position.x + 3, 0, car.mesh.position.z);
          P.mesh.position.copy(P.pos);
        }
      }
      P.pos.copy(P.inCar.mesh.position);
      // firing from the car window
      if (wantFire) fireWeapon();
    } else if (!P.inCar && !G.enterAnim && G.mode === 'play') {
      // on foot: WASD relative to the camera, Shift to run
      const fwdX = Math.sin(G.camYaw), fwdZ = Math.cos(G.camYaw);
      const rightX = Math.cos(G.camYaw), rightZ = -Math.sin(G.camYaw);
      let mx = 0, mz = 0;
      if (input.up) { mx += fwdX; mz += fwdZ; }
      if (input.down) { mx -= fwdX; mz -= fwdZ; }
      if (input.right) { mx += rightX; mz += rightZ; }
      if (input.left) { mx -= rightX; mz -= rightZ; }
      const moving = mx !== 0 || mz !== 0;
      const running = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
      const targetSpeed = moving ? (running ? 9 : 5) : 0;
      P.speed = damp(P.speed, targetSpeed, 8, dt);
      if (moving) {
        const wantHeading = Math.atan2(mx, mz);
        P.heading = angleLerp(P.heading, wantHeading, Math.min(1, dt * 10));
        P.mesh.rotation.y = P.heading;
        const step = P.speed * dt;
        const res = resolveCircleOut(P.pos.x, P.pos.z, 0.45,
          Math.sin(P.heading) * step, Math.cos(P.heading) * step, city.colliders);
        if (res.hit && P.speed > 4) { audio.thud(); G.shake = Math.max(G.shake, 0.25); }
        P.pos.x = res.x; P.pos.z = res.z;
        P.mesh.position.copy(P.pos);
        P.walkPhase += dt * P.speed * 2.2;
      }
      const speed01 = clamp(P.speed / 9, 0, 1);
      animateWalk(P.parts, P.walkPhase, speed01, dt, {
        reloadBlend: P.reloadBlend, punchBlend: P.punchBlend,
        aim: P.weapon !== 'fists',
      });
      if (wantFire) fireWeapon();
    } else if (!P.inCar && !G.enterAnim) {
      // staging on foot (shot mode): idle breathing animation
      animateWalk(P.parts, P.walkPhase, 0, dt, {});
    }

    // ammo crates: walk over to collect
    for (const crate of crates) {
      if (crate.taken) {
        crate.respawn -= dt;
        if (crate.respawn <= 0) { crate.taken = false; crate.group.visible = true; }
        continue;
      }
      const d2 = dist2(P.pos.x, P.pos.z, crate.x, crate.z);
      if (d2 < 4) {
        crate.taken = true; crate.respawn = 90; crate.group.visible = false;
        if (crate.gun && !P.arsenal[crate.gun]) {
          P.arsenal[crate.gun] = { mag: WEAPONS[crate.gun].mag, reserve: 30 };
          hud.toast(`${WEAPONS[crate.gun].name} didapat! Tekan ${WEAPON_ORDER.indexOf(crate.gun) + 1} untuk pakai.`, 'good');
        } else {
          for (const k of Object.keys(P.arsenal)) P.arsenal[k].reserve += 30;
          hud.toast('+30 amunisi untuk semua senjata.', 'good');
        }
        audio.blip();
      }
    }

    updateTraffic(traffic, dt, G.time, (car) => audio.honk());
    updatePeds(peds, dt, city.colliders, G.time, rng, P.pos);
    updatePolice(police, G, dt, G.time);
    updateMissions(G, dt);
    updateVendors(city, dt, G.time, peds);
    updateTrafficLights(city, G.time);
    updateSky(city, G.hour);
    updateSparks(dt);
    updateRain(dt);
    audio.update(dt, G);
    if (G.busted) { G.mode = 'busted'; hud.showBusted(true); }
    if (G.wasted) { G.mode = 'wasted'; hud.showWasted(true); }
  } else {
    // title screen: the city lives on behind the menu
    updateTraffic(traffic, dt, G.time, null);
    updatePeds(peds, dt, city.colliders, G.time, rng, P.pos);
    updateVendors(city, dt, G.time, peds);
    updateTrafficLights(city, G.time);
    updateSky(city, G.hour);
  }
  // fog follows the weather
  if (G.weather === 'fog') scene.fog.near = 60, scene.fog.far = 320;
  else if (G.weather === 'rain') scene.fog.near = 120, scene.fog.far = 600;
  else scene.fog.near = 170, scene.fog.far = 780;
}
G.stepWorld = stepWorld;

// ------------------------------------------------------------ camera
function updateCamera(dt) {
  if (G.shotCam) {
    camera.position.set(G.shotCam.pos[0], G.shotCam.pos[1], G.shotCam.pos[2]);
    camera.lookAt(G.shotCam.look[0], G.shotCam.look[1], G.shotCam.look[2]);
    return;
  }
  const target = player.inCar ? player.inCar.mesh.position : player.pos;
  const dist = player.inCar ? 11 : 8;
  const height = player.inCar ? 4.2 : 3.2;
  const cx = target.x - Math.sin(G.camYaw) * dist;
  const cz = target.z - Math.cos(G.camYaw) * dist;
  const shakeX = (Math.random() - 0.5) * G.shake * 0.5;
  const shakeY = (Math.random() - 0.5) * G.shake * 0.3;
  camera.position.set(cx + shakeX, height + shakeY, cz);
  camera.lookAt(target.x, (player.inCar ? 1.2 : 1.6), target.z);
}

// ------------------------------------------------------------ main loop
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  if (G.mode !== 'paused' && !G.shotDone) {
    while (acc >= STEP) { stepWorld(STEP); acc -= STEP; }
  } else {
    acc = 0;
  }
  if (G.mode !== 'paused') updateCamera(1 / 60);
  renderer.render(scene, camera);
  hud.update(1 / 60);
}

// ------------------------------------------------------------ boot
try {
  hud.setRadio(audio.stationName(), audio.djLine());
  if (shotName) {
    // staged screenshot: build the scene, freeze it, signal readiness
    G.staging = true;
    G.mode = 'play';
    stageShot(shotName, G);
    G.staging = false;
    let painted = 0;
    function paintShot() {
      updateCamera(1 / 60);
      renderer.render(scene, camera);
      hud.update(1 / 60);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paintShot);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paintShot);
  } else {
    hud.showTitle(true);
    requestAnimationFrame(frame);
  }
} catch (err) {
  window.__gameError = String(err && err.stack || err);
  throw err;
}
