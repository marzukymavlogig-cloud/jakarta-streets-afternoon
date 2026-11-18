// main.js — JAKARTA: Streets of the Afternoon. Boots the renderer, the
// golden-hour sky, the city, traffic, peds, police, missions and HUD, and
// runs the game loop. The whole game state lives on G (window.__jakarta).
import * as THREE from 'three';
import { clamp, lerp, rand, pick, resolveCircleOut, dist2D, glowTexture } from './util.js';
import { buildCity, updateCity } from './city.js';
import { buildTraffic, updateTraffic, updateCarPhysics, nearestCar, makeCar } from './vehicles.js';
import { buildPersonMesh, makePlayer, updatePlayer, fireWeapon, reloadWeapon, switchWeapon, animateWalk, SKIN_TONES } from './player.js';
import { makePolice, updatePolice, addHeat } from './police.js';
import { makeMissions, startStory, updateMissions } from './missions.js';
import { makeHud, updateHUD } from './hud.js';
import { makeAudio, updateAudio } from './audio.js';
import { makeSave } from './save.js';
import { stageShot, finishChaseStaging } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8a05a, 170, 780);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a3a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 900;
scene.add(sun);
scene.add(sun.target);

// Golden-hour sky dome (shader gradient + sun glow).
const skyUniforms = {
  topColor: { value: new THREE.Color(0x2a4a7a) },
  horizonColor: { value: new THREE.Color(0xffc46a) },
  sunDir: { value: new THREE.Vector3(0, 0.3, -1) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.75, 0.35) * pow(s, 90.0) * 1.4;
        col += vec3(1.0, 0.6, 0.25) * pow(s, 8.0) * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }),
);
scene.add(sky);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
sunSprite.scale.set(180, 180, 1);
scene.add(sunSprite);

// --- Game state -------------------------------------------------------------
const G = {
  scene, camera, renderer,
  mode: 'title',
  hour: 17.0,
  weather: 'clear',
  weatherTimer: 100,
  camYaw: Math.PI * 0.75,
  camPitch: 0.32,
  camDist: 7,
  shake: 0,
  enterAnim: null,
  shotDone: false,
  shotCam: null,
  shotLookY: null,
  shotCamH: null,
  keys: {},
  traffic: [],
  peds: [],
  crates: [],
  dealerCars: [],
  specialCars: [],
  time: 0,
};
window.__jakarta = G;
window.__gameError = null;
window.addEventListener('error', (e) => { window.__gameError = String(e.message || e.error); });

buildCity(G);
G.player = makePlayer(G);
G.traffic = buildTraffic(G);
G.police = makePolice(G);
G.missions = makeMissions(G);
makeHud(G);
makeAudio(G);
makeSave(G);

// --- Pedestrians: 64 (36 roam + 28 Monas crowd, 6 ojol hijau) ---------------
function makePed(kind, x, z, ojol) {
  const opts = {
    skin: pick(SKIN_TONES),
    hijab: Math.random() < 0.4,
    cap: Math.random() < 0.25,
    glasses: Math.random() < 0.15,
    moustache: Math.random() < 0.25,
    backpack: Math.random() < 0.3,
    build: pick(['slim', 'broad', 'normal']),
  };
  if (ojol) { opts.shirt = 0x1faa59; opts.ojol = true; opts.hijab = false; opts.cap = false; }
  const { group, parts } = buildPersonMesh(opts);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    mesh: group, parts,
    targetX: x, targetZ: z, pause: rand(0, 3),
    speed: rand(1.1, 2.0),
    hurt: 0, fleeing: 0, hp: 100,
    walkPhase: { phase: rand(6) },
    heading: rand(Math.PI * 2),
    kind,
  };
}
for (let i = 0; i < 36; i++) {
  const ojol = i < 6;
  const x = rand(-320, 320), z = rand(-320, 320);
  const ped = makePed('roam', x, z, ojol);
  G.peds.push(ped);
}
for (let i = 0; i < 28; i++) {
  let x, z;
  do { x = rand(-45, 45); z = rand(-45, 45); } while (Math.abs(x) < 16 && Math.abs(z) < 16);
  G.peds.push(makePed('crowd', x, z, false));
}

// --- Ammo crates (11): SMG Mangga Dua, shotgun Tanjung Priok, rifle GBK ---
function makeCrate(x, z, weapon) {
  const mesh = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: weapon === 'ammo' ? 0x2a6a2a : 0x8a6a1a, roughness: 0.6 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), boxMat);
  b.position.y = 0.3;
  b.castShadow = true;
  mesh.add(b);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.95),
    new THREE.MeshBasicMaterial({ color: 0xffe98a }));
  glow.position.y = 0.62;
  mesh.add(glow);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { x, z, weapon, mesh, taken: false };
}
G.crates = [
  makeCrate(-260, 105, 'smg'),
  makeCrate(250, -250, 'shotgun'),
  makeCrate(-260, 185, 'rifle'),
  makeCrate(36, 30, 'ammo'),
  makeCrate(-100, 100, 'ammo'),
  makeCrate(100, -100, 'ammo'),
  makeCrate(150, 150, 'ammo'),
  makeCrate(-200, -50, 'ammo'),
  makeCrate(50, -200, 'ammo'),
  makeCrate(200, 80, 'ammo'),
  makeCrate(-50, 250, 'ammo'),
];

// --- Dealership: 3 cars for sale at Mangga Dua -------------------------------
const dealerDefs = [
  { name: 'Comet Sport', price: 5000000, color: 0xffc21a, x: -255, z: 132 },
  { name: 'Sedan Turbo', price: 2200000, color: 0x2e6fb0, x: -245, z: 130 },
  { name: 'City Car', price: 800000, color: 0x1faa59, x: -235, z: 133 },
];
for (const d of dealerDefs) {
  const car = makeCar(G, 'sedan', { x: d.x, z: d.z, heading: Math.PI / 2, color: d.color, name: d.name, price: d.price });
  G.dealerCars.push(car);
}
// The gold Comet for the Dustline Heist, parked at GBK.
const comet = makeCar(G, 'sedan', { x: -260, z: 185, heading: 0, color: 0xffc21a, name: 'Comet Emas', plate: 'B 7777 JKT' });
G.specialCars.push(comet);

// --- Effects: sparks + rain ---------------------------------------------------
const sparkPool = [];
for (let i = 0; i < 24; i++) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  scene.add(s);
  sparkPool.push({ mesh: s, life: 0, vx: 0, vy: 0, vz: 0 });
}
G.effects = {
  sparks(x, y, z) {
    let n = 0;
    for (const s of sparkPool) {
      if (s.life > 0) continue;
      s.life = 0.5;
      s.mesh.position.set(x, y, z);
      s.vx = rand(-4, 4); s.vy = rand(1, 5); s.vz = rand(-4, 4);
      s.mesh.material.opacity = 1;
      if (++n >= 6) break;
    }
  },
};
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(800 * 3);
for (let i = 0; i < 800; i++) {
  rainPos[i * 3] = rand(-100, 100);
  rainPos[i * 3 + 1] = rand(0, 40);
  rainPos[i * 3 + 2] = rand(-100, 100);
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9ab8d8, size: 0.35, transparent: true, opacity: 0.6 }));
rain.visible = false;
scene.add(rain);

// Muzzle flash on Mara's gun.
const muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
  new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
muzzle.position.set(0.32, 1.32, 0.55);
muzzle.visible = false;
G.player.mesh.add(muzzle);
G.player.muzzle = muzzle;

// --- Input ---------------------------------------------------------------------
const input = { keys: G.keys, mouseDown: false };
let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0, fWasDown = false;

addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  G.audio.ensure();
  if (e.code === 'Escape') {
    if (G.mode === 'play') { G.mode = 'pause'; G.hud.showScreen('pause'); }
    else if (G.mode === 'pause') { G.mode = 'play'; G.hud.hideScreens(); }
  }
  if (G.mode !== 'play') return;
  if (e.code === 'KeyE') tryEnterOrExit();
  if (e.code === 'KeyM') startStory(G);
  if (e.code === 'KeyR') reloadWeapon(G);
  if (e.code === 'KeyF') {
    fireWeapon(G);
    input.fPressHandled = true; // the loop must not fire again for this press
  }
  if (e.code === 'KeyQ') G.audio.cycleStation();
  if (e.code === 'Digit1') switchWeapon(G, 'pistol');
  if (e.code === 'Digit2') switchWeapon(G, 'smg');
  if (e.code === 'Digit3') switchWeapon(G, 'shotgun');
  if (e.code === 'Digit4') switchWeapon(G, 'rifle');
});
addEventListener('keyup', (e) => {
  G.keys[e.code] = false;
  if (e.code === 'KeyF') input.fPressHandled = false;
});
addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
  input.mouseDown = true;
  G.audio.ensure();
});
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - lastY) * 0.003, 0.08, 0.9);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', (e) => {
  dragging = false;
  input.mouseDown = false;
  // A click (not a drag) fires the weapon — unless the loop already fired
  // for this press (slow headless frames can miss a quick click entirely,
  // so the click handler is the backstop, not a second shot).
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && G.mode === 'play' && !input.mouseFired) fireWeapon(G);
  input.mouseFired = false;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function doorPos(car) {
  // Right-hand drive: the driver door is on the car's right side.
  const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
  return { x: car.mesh.position.x + rx * 1.7, z: car.mesh.position.z + rz * 1.7 };
}

function tryEnterOrExit() {
  const p = G.player;
  if (G.enterAnim) return;
  if (p.inCar) {
    const d = doorPos(p.inCar);
    G.enterAnim = { kind: 'exit', t: 0, dur: 0.55, from: { x: p.inCar.mesh.position.x, z: p.inCar.mesh.position.z }, to: d, car: p.inCar };
    return;
  }
  const car = nearestCar(G, p.pos.x, p.pos.z, 4.5);
  if (car) {
    const d = doorPos(car);
    G.enterAnim = { kind: 'enter', t: 0, dur: 0.55, from: { x: p.pos.x, z: p.pos.z }, to: d, car };
    G.audio.sfx('pickup');
    return;
  }
  // Dealership: buy a parked car with E.
  for (const dc of G.dealerCars) {
    if (Math.hypot(dc.mesh.position.x - p.pos.x, dc.mesh.position.z - p.pos.z) < 4.5) {
      if (p.cash >= dc.price) {
        p.cash -= dc.price;
        dc.owned = true;
        G.dealerCars.splice(G.dealerCars.indexOf(dc), 1);
        G.traffic.push(dc);
        G.hud.toast(`${dc.name} dibeli! ${dc.price.toLocaleString('id-ID')} — tekan E untuk naik.`);
        G.audio.sfx('complete');
      } else {
        G.hud.toast(`${dc.name}: Rp${dc.price.toLocaleString('id-ID')} — uangmu kurang.`);
      }
      return;
    }
  }
}

// --- Buttons -------------------------------------------------------------------
document.getElementById('btn-new').addEventListener('click', () => {
  G.audio.ensure();
  const p = G.player;
  p.cash = 250000; p.hp = 100;
  p.arsenal = { pistol: { mag: 12, reserve: 24 } };
  p.weapon = 'pistol';
  G.missions.storyIndex = 0;
  G.missions.active = null;
  G.police.heat = 0; G.police.wanted = 0;
  p.pos.set(-132, 0, -128);
  p.mesh.position.copy(p.pos);
  p.inCar = null;
  p.mesh.visible = true;
  G.mode = 'play';
  G.hud.hideScreens();
  G.hud.showDialogue('Mara', 'Akhirnya pulang ke Jakarta. Bengkel Abang butuh aku — tekan M untuk mulai.', 6);
});
document.getElementById('btn-continue').addEventListener('click', () => {
  G.audio.ensure();
  const loaded = G.save.loadGame(G);
  G.mode = 'play';
  G.hud.hideScreens();
  G.hud.toast(loaded ? 'Save dimuat. Selamat datang kembali!' : 'Tidak ada save — mulai baru.');
});
document.getElementById('btn-save').addEventListener('click', () => G.save.saveGame(G));
document.getElementById('btn-resume').addEventListener('click', () => {
  G.mode = 'play';
  G.hud.hideScreens();
});
for (const id of ['btn-retry-busted', 'btn-retry-wasted']) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', () => {
    G.mode = 'play';
    G.hud.hideScreens();
  });
}
if (!G.save.hasSave()) {
  const bc = document.getElementById('btn-continue');
  if (bc) bc.style.opacity = '0.4';
}

// --- Peds ------------------------------------------------------------------------
function updatePeds(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.hurt > 0) {
      ped.hurt = Math.max(0, ped.hurt - dt * 0.5);
      // Flinch: hands up, body back.
      ped.parts.armL.rotation.x = lerp(ped.parts.armL.rotation.x, -2.1, Math.min(1, dt * 8));
      ped.parts.armR.rotation.x = lerp(ped.parts.armR.rotation.x, -2.1, Math.min(1, dt * 8));
      ped.parts.body.rotation.x = -0.18;
    } else {
      ped.parts.body.rotation.x = 0;
    }
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      const dx = ped.mesh.position.x - p.pos.x;
      const dz = ped.mesh.position.z - p.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.mesh.position.x += (dx / d) * 5.5 * dt;
      ped.mesh.position.z += (dz / d) * 5.5 * dt;
      ped.heading = Math.atan2(dx, dz);
      ped.mesh.rotation.y = ped.heading;
      animateWalk(ped.parts, 5.5, dt, ped.walkPhase);
      // A hurt ped flees with hands up, even while running.
      if (ped.hurt > 0) {
        ped.parts.armL.rotation.x = lerp(ped.parts.armL.rotation.x, -2.1, Math.min(1, dt * 8));
        ped.parts.armR.rotation.x = lerp(ped.parts.armR.rotation.x, -2.1, Math.min(1, dt * 8));
      }
      resolveCircleOut(ped.mesh.position, 0.5, G.city.colliders);
      continue;
    }
    if (ped.pause > 0) {
      ped.pause -= dt;
      animateWalk(ped.parts, 0, dt, ped.walkPhase);
      continue;
    }
    const dx = ped.targetX - ped.mesh.position.x;
    const dz = ped.targetZ - ped.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      if (ped.kind === 'crowd') {
        ped.pause = rand(3, 7);
        // 65% of new crowd targets are a vendor stall.
        if (Math.random() < 0.65) {
          const s = pick(G.city.stalls);
          ped.targetX = s.x + rand(-2, 2);
          ped.targetZ = s.z + rand(-2, 2);
        } else {
          ped.targetX = rand(-45, 45);
          ped.targetZ = rand(-45, 45);
        }
      } else {
        ped.pause = rand(1, 4);
        ped.targetX = rand(-320, 320);
        ped.targetZ = rand(-320, 320);
      }
    } else {
      const sp = ped.speed;
      ped.mesh.position.x += (dx / d) * sp * dt;
      ped.mesh.position.z += (dz / d) * sp * dt;
      ped.heading = Math.atan2(dx, dz);
      ped.mesh.rotation.y = ped.heading;
      animateWalk(ped.parts, sp, dt, ped.walkPhase);
      resolveCircleOut(ped.mesh.position, 0.5, G.city.colliders);
    }
    ped.mesh.position.x = clamp(ped.mesh.position.x, -350, 350);
    ped.mesh.position.z = clamp(ped.mesh.position.z, -350, 350);
  }
}

// --- Sky / sun / weather ----------------------------------------------------------
function updateSky(G, dt) {
  G.hour += dt / 15; // a full day in 6 minutes
  if (G.hour >= 24) G.hour -= 24;
  const h = G.hour;
  // Dusk peaks at dawn/dusk only; 17:00 is still afternoon.
  const dusk = Math.pow(clamp(1 - Math.abs(h - 18.2) / 1.8, 0, 1), 6)
    + Math.pow(clamp(1 - Math.abs(h - 5.8) / 1.8, 0, 1), 6);
  const d = clamp(dusk, 0, 1);
  const top = new THREE.Color(0x2a4a7a).lerp(new THREE.Color(0x6a2a3a), d);
  const horizon = new THREE.Color(0xffc46a).lerp(new THREE.Color(0xff5a2a), d);
  skyUniforms.topColor.value.copy(top);
  skyUniforms.horizonColor.value.copy(horizon);
  const ang = ((h - 6) / 12) * Math.PI;
  const sd = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.9 + 0.12, -0.45).normalize();
  skyUniforms.sunDir.value.copy(sd);
  sun.position.copy(sd).multiplyScalar(420);
  sun.target.position.set(0, 0, 0);
  sun.intensity = 2.8 - d * 0.9;
  sun.color.setHSL(0.09 + d * 0.02, 0.7, 0.62 - d * 0.08);
  hemi.intensity = 1.25 - d * 0.3;
  sunSprite.position.copy(sd).multiplyScalar(820);
  const fogCol = horizon.clone().lerp(new THREE.Color(0x2a3a5a), 0.35);
  if (G.weather === 'fog') {
    scene.fog.near = 60; scene.fog.far = 320;
    scene.fog.color.setHex(0x9a9a9a);
  } else {
    scene.fog.near = 170; scene.fog.far = 780;
    scene.fog.color.copy(fogCol);
  }
  // Weather cycle.
  G.weatherTimer -= dt;
  if (G.weatherTimer <= 0) {
    G.weatherTimer = 100;
    G.weather = G.weather === 'clear' ? 'rain' : G.weather === 'rain' ? 'fog' : 'clear';
    rain.visible = G.weather === 'rain';
    if (G.weather === 'rain') G.hud.toast('Hujan turun — jalan licin!');
  }
  if (rain.visible) {
    const pos = rainGeo.attributes.position;
    for (let i = 0; i < 800; i++) {
      let y = pos.getY(i) - dt * 45;
      if (y < 0) y = 40;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    rain.position.set(G.player.pos.x, 0, G.player.pos.z);
  }
}

// --- Camera -----------------------------------------------------------------------
function updateCamera(G, dt) {
  const p = G.player;
  if (G.shotCam) {
    camera.position.lerp(G.shotCam.pos, Math.min(1, dt * 3));
    camera.lookAt(G.shotCam.look);
    return;
  }
  const target = p.inCar ? p.inCar.mesh.position : p.pos;
  const dist = p.inCar ? 11 : 7;
  const height = p.inCar ? 4.2 : 3.2;
  const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
  const cx = target.x - fx * dist;
  const cz = target.z - fz * dist;
  const cy = height + G.camPitch * 6;
  camera.position.x = lerp(camera.position.x, cx, Math.min(1, dt * 6));
  camera.position.y = lerp(camera.position.y, cy, Math.min(1, dt * 6));
  camera.position.z = lerp(camera.position.z, cz, Math.min(1, dt * 6));
  if (G.shake > 0) {
    camera.position.x += rand(-1, 1) * G.shake * 0.4;
    camera.position.y += rand(-1, 1) * G.shake * 0.4;
    G.shake = Math.max(0, G.shake - dt * 1.5);
  }
  camera.lookAt(target.x, target.y + 1.6, target.z);
}

// --- Main step ----------------------------------------------------------------------
function stepWorld(G, dt) {
  const p = G.player;
  updatePlayer(G, dt, input);
  if (p.inCar) updateCarPhysics(G, p.inCar, dt, input);
  // Hold F / mouse for autofire weapons; semi-auto fires on the fresh press
  // (the keydown handler already fired once for this press; fireCd blocks a
  // double shot, and fPressHandled blocks the loop's edge-fire).
  const firing = G.keys['KeyF'] || input.mouseDown;
  const w = p.weapon;
  const auto = w === 'smg' || w === 'rifle';
  if (firing && (auto || (!fWasDown && !input.fPressHandled))) {
    fireWeapon(G);
    if (input.mouseDown) input.mouseFired = true;
  }
  fWasDown = firing;
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateMissions(G, dt);
  updateCity(G, dt, G.time);
  updateAudio(G, dt);
  updateSky(G, dt);
  updateHUD(G, dt);
  // Sparks fade.
  for (const s of sparkPool) {
    if (s.life <= 0) continue;
    s.life -= dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.vy -= 12 * dt;
    s.mesh.material.opacity = Math.max(0, s.life * 2);
    if (s.life <= 0) s.mesh.material.opacity = 0;
  }
}

// --- Shot staging ---------------------------------------------------------------------
let shotState = null;
if (SHOT) {
  const cfg = stageShot(G, SHOT);
  shotState = { t: 0, dur: cfg.simSeconds, autoDrive: cfg.autoDrive, then: cfg.then || null, done: false };
  if (SHOT === 'start') G.mode = 'title';
  else G.mode = 'play';
}

// --- Loop -----------------------------------------------------------------------------
const clock = new THREE.Clock();
camera.position.set(-160, 40, -160);
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.25);
  G.time += dt;
  if (G.mode === 'play') {
    if (shotState && !shotState.done) {
      if (shotState.autoDrive) G.keys['KeyW'] = true;
      shotState.t += dt;
      if (shotState.t >= shotState.dur) {
        if (shotState.autoDrive) G.keys['KeyW'] = false;
        if (shotState.then === 'chaseRoadblock') finishChaseStaging(G);
        else {
          G.police.frozen = true;
          G.shotDone = true;
        }
        shotState.done = true;
        window.__shotReady = true;
      }
    }
    // Once a staged shot is done, the world freezes: the captured frame
    // stays exactly as staged (no coasting, no wandering peds).
    if (!G.shotDone) stepWorld(G, dt);
  } else if (G.mode === 'title') {
    if (shotState && !shotState.done) {
      shotState.t += dt;
      if (shotState.t >= shotState.dur) {
        shotState.done = true;
        window.__shotReady = true;
      }
    }
    // Slow orbit over the city behind the title.
    const a = G.time * 0.03;
    camera.position.set(Math.cos(a) * 200, 70, Math.sin(a) * 200);
    camera.lookAt(0, 25, 0);
    updateSky(G, dt);
    updateCity(G, dt, G.time);
  }
  if (G.mode === 'play' || G.shotCam) updateCamera(G, dt);
  renderer.render(scene, camera);
}
loop();
