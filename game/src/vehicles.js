// vehicles.js — Jakarta traffic: sedans, TransJakarta buses, angkot,
// bajaj, taxis, vans, pickups and food trucks, plus arcade driving physics
// (steering-wheel yaw, body roll, handbrake nose-dive, suspension bob) and
// Jakarta plates on every car.
import * as THREE from 'three';
import { clamp, lerp, rand, pick, textTexture, resolveCircleOut } from './util.js';

export const CAR_KINDS = {
  sedan: { len: 4.4, wid: 1.9, h: 1.35, maxSpeed: 30, accel: 15, color: [0xc23b2e, 0x2e6fb0, 0xd8d8d8, 0x222831, 0xe8a13c, 0x3a6b4a] },
  bus: { len: 11.5, wid: 2.6, h: 3.1, maxSpeed: 19, accel: 8, color: [0xd84a1f] },
  angkot: { len: 4.2, wid: 1.9, h: 2.0, maxSpeed: 22, accel: 11, color: [0x1faa8a, 0x7ab51f, 0xe8c31f] },
  van: { len: 5.2, wid: 2.1, h: 2.2, maxSpeed: 24, accel: 11, color: [0xd8d8d8, 0x5b6b7a] },
  taxi: { len: 4.4, wid: 1.9, h: 1.4, maxSpeed: 28, accel: 14, color: [0xf2c230] },
  pickup: { len: 4.8, wid: 2.0, h: 1.7, maxSpeed: 26, accel: 13, color: [0x7a4a2b, 0x4a5b6b] },
  foodtruck: { len: 6.0, wid: 2.4, h: 2.6, maxSpeed: 17, accel: 8, color: [0xe05e2b, 0x1faa59] },
  bajaj: { len: 2.6, wid: 1.5, h: 1.7, maxSpeed: 17, accel: 12, color: [0x2e6fb0] },
  police: { len: 4.6, wid: 2.0, h: 1.45, maxSpeed: 34, accel: 17, color: [0xf2f2f2] },
};

let plateSeq = 1000;
export function genPlate() {
  plateSeq = 1000 + Math.floor(Math.random() * 8999);
  return `B ${plateSeq} JKT`;
}

function plateTexture(plate) {
  return textTexture(plate, { w: 256, h: 64, bg: '#f2f2f2', fg: '#111111', font: 44 });
}

function wheelMesh(r = 0.36) {
  const w = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  );
  w.rotation.z = Math.PI / 2;
  w.castShadow = true;
  return w;
}

// Build one car. kind from CAR_KINDS. opts: color, plate, owned, price,
// inTraffic, road ('x'|'z'), roadPos, dir.
export function makeCar(G, kind, opts = {}) {
  const spec = CAR_KINDS[kind];
  const color = opts.color ?? pick(spec.color);
  const mesh = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Group();
  mesh.add(body);
  const L = spec.len, W = spec.wid, H = spec.h;

  if (kind === 'bajaj') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, L * 0.8), bodyMat);
    shell.position.y = 0.75;
    shell.castShadow = true;
    body.add(shell);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.1, L * 0.85),
      new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
    roof.position.y = 1.35;
    body.add(roof);
    const win = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.5, 0.06), glassMat);
    win.position.set(0, 0.95, L * 0.38);
    body.add(win);
    // Three wheels: one front, two rear.
    const wf = wheelMesh(0.3); wf.position.set(0, 0.3, L * 0.36); body.add(wf);
    const wl = wheelMesh(0.3); wl.position.set(-W / 2 + 0.05, 0.3, -L * 0.32); body.add(wl);
    const wr = wheelMesh(0.3); wr.position.set(W / 2 - 0.05, 0.3, -L * 0.32); body.add(wr);
  } else {
    const lower = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.45, L), bodyMat);
    lower.position.y = 0.55 + H * 0.1;
    lower.castShadow = true;
    body.add(lower);
    const cabinH = kind === 'bus' || kind === 'foodtruck' ? H * 0.55 : H * 0.4;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, cabinH, L * (kind === 'bus' ? 0.92 : 0.55)), glassMat);
    cabin.position.set(0, 0.55 + H * 0.32 + cabinH / 2, kind === 'bus' ? 0 : -L * 0.06);
    cabin.castShadow = true;
    body.add(cabin);
    if (kind === 'bus') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.22, L * 0.98),
        new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }));
      stripe.position.y = 1.15;
      body.add(stripe);
      const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4),
        new THREE.MeshBasicMaterial({ map: textTexture('TRANSJAKARTA', { w: 512, h: 128, bg: '#111111', fg: '#ffd23c', font: 72 }) }));
      dest.position.set(0, 2.2, L / 2 + 0.01);
      body.add(dest);
    }
    if (kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.4 }));
      sign.position.set(0, 0.55 + H * 0.32 + cabinH + 0.1, -L * 0.06);
      body.add(sign);
    }
    if (kind === 'foodtruck') {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7),
        new THREE.MeshBasicMaterial({ map: textTexture(opts.sign || 'SATE 88', { w: 512, h: 160, bg: '#7a1f1f', fg: '#ffe9a8', font: 84 }) }));
      sign.position.set(0, 1.9, L / 2 + 0.02);
      body.add(sign);
    }
    // Headlights + taillights.
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), lightMat);
      hl.position.set(s * (W / 2 - 0.35), 0.75, L / 2 + 0.01);
      body.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xaa1a1a }));
      tl.position.set(s * (W / 2 - 0.35), 0.75, -L / 2 - 0.01);
      body.add(tl);
    }
    // Wheels: front two steer.
    const steerWheels = [];
    const wheelY = 0.36;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (W / 2 - 0.08), wheelY, sz * (L / 2 - 0.75));
      const w = wheelMesh();
      pivot.add(w);
      body.add(pivot);
      if (sz > 0) steerWheels.push(pivot);
    }
    mesh.userData.steerWheels = steerWheels;
    if (kind === 'police') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
      bar.position.set(0, 0.55 + H * 0.32 + cabinH + 0.08, -L * 0.06);
      body.add(bar);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.32),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.set(-0.28, 0.55 + H * 0.32 + cabinH + 0.16, -L * 0.06);
      body.add(red);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.32),
        new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      blue.position.set(0.28, 0.55 + H * 0.32 + cabinH + 0.16, -L * 0.06);
      body.add(blue);
      mesh.userData.lightBar = [red, blue];
    }
  }

  // Jakarta plate, front and rear.
  const plate = opts.plate || genPlate();
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTexture(plate) });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.21), plateMat);
  pf.position.set(0, 0.42, L / 2 + 0.02);
  body.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.21), plateMat);
  pr.position.set(0, 0.42, -L / 2 - 0.02);
  pr.rotation.y = Math.PI;
  body.add(pr);

  mesh.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  G.scene.add(mesh);
  const car = {
    kind, mesh, body,
    spec,
    speed: 0,
    heading: opts.heading ?? 0,
    maxSpeed: spec.maxSpeed,
    accel: spec.accel,
    hp: 100,
    color,
    plate,
    steerAngle: 0,
    steerWheels: mesh.userData.steerWheels || [],
    inTraffic: !!opts.inTraffic,
    road: opts.road || 'x',
    roadPos: opts.roadPos ?? 46,
    lane: opts.lane ?? 3.5,
    dir: opts.dir ?? 1,
    owned: !!opts.owned,
    price: opts.price || 0,
    name: opts.name || kind,
    bobPhase: rand(Math.PI * 2),
    brakeT: 0,
  };
  mesh.position.set(opts.x ?? 0, 0, opts.z ?? 0);
  mesh.rotation.y = car.heading;
  mesh.userData.plate = plate;
  return car;
}

// --- Traffic: 29 cars on the roads ----------------------------------------
export function buildTraffic(G) {
  const cars = [];
  const zRoads = [-266, -188, -110, -32, 46, 124, 202, 280];
  const xRoads = [-312, -234, -156, -78, 0, 78, 156, 234, 312];
  const plan = [
    ['sedan', 9], ['bus', 5], ['angkot', 2], ['van', 2], ['taxi', 3],
    ['pickup', 1], ['foodtruck', 1], ['bajaj', 5],
  ];
  let i = 0;
  for (const [kind, n] of plan) {
    for (let k = 0; k < n; k++) {
      const onZ = i % 2 === 0;
      const roadPos = onZ ? pick(zRoads) : pick(xRoads);
      const along = rand(-320, 320);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = dir > 0 ? 3.5 : -3.5;
      const car = makeCar(G, kind, {
        x: onZ ? along : roadPos + lane,
        z: onZ ? roadPos + lane : along,
        heading: onZ ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
        inTraffic: true, road: onZ ? 'x' : 'z', roadPos, lane, dir,
      });
      car.speed = car.maxSpeed * rand(0.4, 0.8);
      cars.push(car);
      i++;
    }
  }
  // The starter: Mara's bengkel sedan, parked by the garage.
  const starter = makeCar(G, 'sedan', {
    x: -140, z: -132, heading: Math.PI * 0.75,
    owned: true, name: 'Sedan Bengkel', plate: 'B 1001 JKT', color: 0xc23b2e,
  });
  cars.push(starter);
  G.starterCar = starter;
  return cars;
}

// Traffic cars cruise their road, wrap around the city edge, and bob.
export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    if (!car.inTraffic || !car.maxSpeed) continue; // parked/owned cars stay put
    const along = car.road === 'x' ? car.mesh.position.x : car.mesh.position.z;
    const next = along + car.dir * car.speed * dt;
    if (next > 340 || next < -340) {
      // Wrap to the other end of the same road.
      const wrapped = next > 340 ? -340 : 340;
      if (car.road === 'x') car.mesh.position.x = wrapped;
      else car.mesh.position.z = wrapped;
    } else if (car.road === 'x') car.mesh.position.x = next;
    else car.mesh.position.z = next;
    car.mesh.rotation.y = car.heading;
    // Gentle suspension bob + slight body roll in the flow.
    const t = performance.now() / 1000;
    car.mesh.position.y = Math.sin(t * 9 + car.bobPhase) * 0.012 * (0.5 + car.speed / car.maxSpeed);
    car.mesh.rotation.z = Math.sin(t * 0.7 + car.bobPhase) * 0.008;
    car.mesh.rotation.x = 0;
  }
}

// --- Arcade driving for the player's car ----------------------------------
export function updateCarPhysics(G, car, dt, input) {
  const keys = input.keys;
  const fwd = keys['KeyW'] ? 1 : keys['KeyS'] ? -0.6 : 0;
  const handbrake = !!keys['Space'];
  if (fwd > 0) car.speed += car.accel * fwd * dt;
  else if (fwd < 0) car.speed += car.accel * fwd * dt * 0.8;
  else car.speed = lerp(car.speed, 0, Math.min(1, dt * 0.8));
  if (handbrake) car.speed = lerp(car.speed, 0, Math.min(1, dt * 3.2));
  car.speed = clamp(car.speed, -10, car.maxSpeed);
  if (Math.abs(car.speed) < 0.05 && !fwd) car.speed = 0;

  const steerIn = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
  const targetSteer = steerIn * 0.5;
  car.steerAngle = lerp(car.steerAngle, targetSteer, Math.min(1, dt * 6));
  for (const w of car.steerWheels) w.rotation.y = car.steerAngle;
  if (Math.abs(car.speed) > 0.2) {
    car.heading += car.steerAngle * (car.speed / car.maxSpeed) * dt * 1.9 * Math.sign(car.speed);
  }
  const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.mesh.position.x, z: car.mesh.position.z };
  car.mesh.position.x = nx;
  car.mesh.position.z = nz;
  const hit = resolveCircleOut(car.mesh.position, 1.7, G.city.colliders);
  car.bumpCd = Math.max(0, (car.bumpCd || 0) - dt);
  if (hit) {
    const impact = Math.abs(car.speed);
    // Only a real hit damages the car; parking-speed nudges do not.
    if (impact > 8 && car.bumpCd <= 0) {
      car.hp -= Math.min(12, impact * 0.6);
      car.bumpCd = 1.2;
      G.shake = Math.min(0.6, impact * 0.03);
      G.audio.sfx('thud');
      G.effects.sparks(car.mesh.position.x, 0.6, car.mesh.position.z);
      if (car.hp <= 25) G.hud.toast('Mobil hampir rusak! Cari bengkel.');
    }
    car.speed *= 0.25;
    car.mesh.position.x = clamp(car.mesh.position.x, -350, 350);
    car.mesh.position.z = clamp(car.mesh.position.z, -350, 350);
  }
  car.mesh.position.x = clamp(car.mesh.position.x, -350, 350);
  car.mesh.position.z = clamp(car.mesh.position.z, -350, 350);
  car.mesh.rotation.y = car.heading;
  // Body roll outward on turns, nose dive on the handbrake, suspension bob.
  const t = performance.now() / 1000;
  const rollTarget = -car.steerAngle * Math.min(1, Math.abs(car.speed) / 12) * 0.09;
  car.mesh.rotation.z = lerp(car.mesh.rotation.z, rollTarget, Math.min(1, dt * 5));
  const pitchTarget = handbrake ? 0.015 : (fwd > 0 ? -0.008 : 0);
  car.mesh.rotation.x = lerp(car.mesh.rotation.x, pitchTarget, Math.min(1, dt * 5));
  const bobAmp = 0.025 * (0.35 + Math.min(1, Math.abs(car.speed) / 20));
  car.mesh.position.y = Math.sin(t * 11 + car.bobPhase) * bobAmp;
  if (car.hp <= 0) {
    G.hud.toast('Mobilmu hancur! Keluar dan cari yang lain.');
    G.player.inCar = null;
    G.player.mesh.visible = true;
    G.player.pos.set(car.mesh.position.x + 2, 0, car.mesh.position.z + 2);
    G.player.mesh.position.copy(G.player.pos);
    car.hp = 40;
  }
}

// Nearest car to a point, within range metres.
export function nearestCar(G, x, z, range = 4.5) {
  let best = null, bestD = range;
  for (const c of G.traffic) {
    const d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  for (const c of G.police.cars) {
    const d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
