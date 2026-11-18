// vehicles.js — cars, buses, angkot, bajaj and food trucks, plus the arcade
// driving model: throttle, handbrake, steering that yaws the front wheels,
// body roll on turns, nose dive under the handbrake and suspension bob.
// Traffic cars cruise the grid roads; the player's car is solid against the
// city (resolveCircleOut) and takes damage on hard bumps.
import * as THREE from 'three';
import { clamp, lerp, damp, pick, range, rangeInt, signTexture, resolveCircleOut } from './util.js';

export function makePlate(rng) {
  const n = rangeInt(rng, 100, 9999);
  return `B ${n} ${pick(rng, ['JKT', 'BGR', 'BDG', 'SBY'])}`;
}

function wheelMesh(r = 0.36) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.95 }));
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.26, 8),
    new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.7, roughness: 0.35 }));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  return g;
}

function plateMesh(text, rng) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28),
    new THREE.MeshBasicMaterial({ map: signTexture(text, '#f2f2f2', '#111111') }));
  return m;
}

// Build one vehicle. Returns { kind, mesh, body, steerWheels, speed, heading,
// maxSpeed, hp, plate, owned, color }.
export function buildCar(kind, color, rng, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.6 });
  const steerWheels = [];
  let len = 4.4, wid = 1.9, bodyH = 0.75, bodyY = 0.62, cabH = 0.6;

  if (kind === 'bus') { len = 11; wid = 2.5; bodyH = 2.2; bodyY = 1.5; cabH = 0; }
  else if (kind === 'angkot') { len = 4.6; wid = 1.9; bodyH = 1.5; bodyY = 1.0; cabH = 0.5; }
  else if (kind === 'van' || kind === 'foodtruck') { len = 5.4; wid = 2.1; bodyH = 1.7; bodyY = 1.1; cabH = 0.5; }
  else if (kind === 'pickup') { len = 4.8; wid = 2.0; bodyH = 0.8; bodyY = 0.7; cabH = 0.55; }
  else if (kind === 'bajaj') { len = 2.6; wid = 1.4; bodyH = 1.0; bodyY = 0.75; cabH = 0.7; }

  const main = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paint);
  main.position.y = bodyY; main.castShadow = true;
  body.add(main);
  if (cabH > 0) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.88, cabH, len * 0.45), glass);
    cab.position.set(0, bodyY + bodyH / 2 + cabH / 2 - 0.05, -len * 0.08);
    cab.castShadow = true;
    body.add(cab);
  }
  if (kind === 'bus') {
    // yellow stripe + big windows
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.04, 0.35, len), new THREE.MeshStandardMaterial({ color: 0xffcc22 }));
    stripe.position.y = 1.1; body.add(stripe);
    const win = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.06, 0.7, len * 0.85), glass);
    win.position.y = 2.0; body.add(win);
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.6),
      new THREE.MeshBasicMaterial({ map: signTexture(opts.route || 'TRANSJAKARTA', '#111111', '#ffcc22') }));
    dest.position.set(0, 2.4, len / 2 + 0.03); body.add(dest);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffcc22 }));
    sign.position.set(0, bodyY + bodyH / 2 + cabH + 0.12, 0); body.add(sign);
  }
  if (kind === 'foodtruck') {
    const awning = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.5, 0.12, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
    awning.position.set(0, 2.1, 0.4); awning.rotation.x = 0.18; body.add(awning);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8),
      new THREE.MeshBasicMaterial({ map: signTexture(opts.menu || 'SATE 88', '#7a2e1d', '#ffe9b0') }));
    menu.position.set(0, 1.5, wid / 2 + 0.03); menu.rotation.y = Math.PI / 2; body.add(menu);
  }
  if (kind === 'bajaj') {
    // blue three-wheeler: one front wheel, two rear, open cabin
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.18, len * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x2e86c1 }));
    canopy.position.y = 1.85; body.add(canopy);
  }
  // headlights + taillights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), lightMat);
    hl.position.set(sx * (wid / 2 - 0.25), bodyY, len / 2 + 0.02); body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.06), tailMat);
    tl.position.set(sx * (wid / 2 - 0.25), bodyY, -len / 2 - 0.02); body.add(tl);
  }
  // wheels: front pair steers, rear pair fixed. Bajaj gets one front wheel.
  const wheelY = 0.36;
  const wheelPos = kind === 'bajaj'
    ? [[0, len / 2 - 0.5, true], [-wid / 2 + 0.2, -len / 2 + 0.5, false], [wid / 2 - 0.2, -len / 2 + 0.5, false]]
    : [[-wid / 2 + 0.15, len / 2 - 0.7, true], [wid / 2 - 0.15, len / 2 - 0.7, true],
       [-wid / 2 + 0.15, -len / 2 + 0.7, false], [wid / 2 - 0.15, -len / 2 + 0.7, false]];
  for (const [wx, wz, steers] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, wheelY, wz);
    const w = wheelMesh(kind === 'bajaj' ? 0.3 : 0.36);
    pivot.add(w);
    body.add(pivot);
    if (steers) steerWheels.push(pivot);
  }
  const plate = opts.plate || makePlate(rng);
  const plateM = plateMesh(plate, rng);
  plateM.position.set(0, bodyY - 0.15, len / 2 + 0.05);
  body.add(plateM);
  const plateBack = plateMesh(plate, rng);
  plateBack.position.set(0, bodyY - 0.15, -len / 2 - 0.05);
  plateBack.rotation.y = Math.PI;
  body.add(plateBack);
  g.userData.plate = plate;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const car = {
    kind, mesh: g, body, steerWheels,
    speed: 0, heading: opts.heading ?? 0, steerAngle: 0,
    maxSpeed: kind === 'bus' ? 14 : kind === 'bajaj' ? 16 : kind === 'foodtruck' ? 13 : range(rng, 17, 24),
    hp: 100, plate, owned: !!opts.owned, color,
    road: null, roadCoord: 0, dir: 1, cruise: 0, honkCd: 0, bumpCd: 0,
    length: len, width: wid,
  };
  g.rotation.y = car.heading;
  return car;
}

// The starter sedan Mara owns: orange, parked by the bengkel.
export function createStarterCar(rng) {
  const car = buildCar('sedan', 0xd86a2a, rng, { owned: true, plate: 'B 1001 JKT', heading: Math.PI / 2 });
  car.mesh.position.set(-141, 0, -128);
  car.maxSpeed = 30;
  car.road = null;
  return car;
}

// 29 traffic cars in all (starter included): buses, sedans, angkot, vans,
// taxis, a pickup, a food truck and five blue bajaj.
export function spawnTraffic(scene, rng) {
  const traffic = [];
  const roads = [-312, -234, -156, -78, 78, 156, 234, 312];
  const specs = [];
  for (let i = 0; i < 5; i++) specs.push(['bus', pick(rng, [0xc0392b, 0xd35400])]);
  for (let i = 0; i < 9; i++) specs.push(['sedan', pick(rng, [0x888888, 0x222222, 0xe8e8e8, 0x2e86c1, 0x27ae60, 0xc0392b, 0x8e44ad])]);
  for (let i = 0; i < 2; i++) specs.push(['angkot', pick(rng, [0x1faa8a, 0x27ae60, 0xf1c40f])]);
  for (let i = 0; i < 2; i++) specs.push(['van', pick(rng, [0xdddddd, 0x5a6a7a])]);
  for (let i = 0; i < 3; i++) specs.push(['taxi', 0xf1c40f]);
  specs.push(['pickup', 0x7a4a2a]);
  specs.push(['foodtruck', 0xe8e4d8]);
  for (let i = 0; i < 5; i++) specs.push(['bajaj', 0x2e86c1]);
  const starter = createStarterCar(rng);
  scene.add(starter.mesh);
  traffic.push(starter);
  for (const [kind, color] of specs) {
    const car = buildCar(kind, color, rng, { route: pick(rng, ['TRANSJAKARTA', 'KOTA', 'BLOK M', 'CILANDAK']), menu: pick(rng, ['SATE 88', 'BAKSO 88', 'NASI GORENG']) });
    const horizontal = rng() < 0.5;
    const roadCoord = pick(rng, roads);
    const along = range(rng, -320, 320);
    car.road = horizontal ? 'z' : 'x';
    car.roadCoord = roadCoord;
    car.dir = rng() < 0.5 ? 1 : -1;
    car.cruise = range(rng, 0.55, 0.95);
    if (horizontal) {
      car.mesh.position.set(along, 0, roadCoord + (car.dir > 0 ? 3.5 : -3.5));
      car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.mesh.position.set(roadCoord + (car.dir > 0 ? 3.5 : -3.5), 0, along);
      car.heading = car.dir > 0 ? 0 : Math.PI;
    }
    car.mesh.rotation.y = car.heading;
    car.speed = car.maxSpeed * car.cruise * 0.7;
    scene.add(car.mesh);
    traffic.push(car);
  }
  return traffic;
}

// Traffic cruise: follow the road line, wrap at the city edge, slow for the
// car ahead, lean gently into the (rare) turn at the wrap.
export function updateTraffic(traffic, dt, now, onHonk) {
  for (const car of traffic) {
    if (!car.road || !car.maxSpeed) continue; // parked / special cars sit still
    const target = car.maxSpeed * car.cruise;
    // slow for the car ahead on the same lane
    let ahead = null, aheadD = 1e9;
    for (const o of traffic) {
      if (o === car || o.road !== car.road || o.roadCoord !== car.roadCoord || o.dir !== car.dir) continue;
      const d = car.road === 'z' ? (o.mesh.position.x - car.mesh.position.x) * car.dir : (o.mesh.position.z - car.mesh.position.z) * car.dir;
      if (d > 0 && d < aheadD) { aheadD = d; ahead = o; }
    }
    let want = target;
    if (ahead && aheadD < 14) want = Math.min(want, ahead.speed * 0.9);
    if (ahead && aheadD < 7) {
      want = 0;
      car.honkCd -= dt;
      if (car.honkCd <= 0) { car.honkCd = 4 + Math.random() * 3; if (onHonk) onHonk(car); }
    }
    car.speed = damp(car.speed, want, 1.2, dt);
    const step = car.speed * car.dir * dt;
    if (car.road === 'z') {
      car.mesh.position.x += step;
      if (car.mesh.position.x > 340) car.mesh.position.x = -340;
      if (car.mesh.position.x < -340) car.mesh.position.x = 340;
    } else {
      car.mesh.position.z += step;
      if (car.mesh.position.z > 340) car.mesh.position.z = -340;
      if (car.mesh.position.z < -340) car.mesh.position.z = 340;
    }
    // gentle body roll with speed changes, wheels straight ahead
    car.body.rotation.z = damp(car.body.rotation.z, clamp(-(car.speed - target) * 0.004, -0.03, 0.03), 4, dt);
    car.body.position.y = Math.sin(now * 2 + car.mesh.position.x * 0.05) * 0.015;
  }
}

// Arcade driving for the player's car. `input` is {up, down, left, right,
// handbrake}. Returns {hit, impact} when a wall was met this step.
export function driveCar(car, input, dt, colliders, now) {
  const prevSpeed = car.speed;
  const accel = input.up ? 15 : 0;
  const brake = input.down ? 18 : 0;
  if (input.up) car.speed = Math.min(car.speed + accel * dt, car.maxSpeed);
  else if (input.down) car.speed = Math.max(car.speed - brake * dt, -8);
  else car.speed = damp(car.speed, 0, input.handbrake ? 4.5 : 0.7, dt);
  if (input.handbrake) car.speed = damp(car.speed, 0, 3.2, dt);

  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerAmount = steerTarget * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.steerAngle = damp(car.steerAngle, steerAmount * 0.55, 8, dt);
  car.heading += car.steerAngle * (car.speed / 7) * dt * 1.6;
  car.mesh.rotation.y = car.heading;
  for (const w of car.steerWheels) w.rotation.y = car.steerAngle * 0.9;

  const dx = Math.sin(car.heading) * car.speed * dt;
  const dz = Math.cos(car.heading) * car.speed * dt;
  const res = resolveCircleOut(car.mesh.position.x, car.mesh.position.z, 1.7, dx, dz, colliders);
  let hit = null, impact = 0;
  if (res.hit) {
    impact = Math.abs(prevSpeed);
    hit = res.hit;
    car.speed = impact > 6 ? -prevSpeed * 0.12 : 0;
    car.bumpCd -= dt;
    if (impact > 4 && car.bumpCd <= 0) {
      car.hp = Math.max(0, car.hp - Math.min(12, Math.round(impact * 0.6)));
      car.bumpCd = 1.5;
    }
  }
  car.mesh.position.x = res.x;
  car.mesh.position.z = res.z;
  // body roll outward on turns, nose dive on the handbrake, suspension bob
  const rollTarget = clamp(-car.steerAngle * car.speed * 0.012, -0.06, 0.06);
  car.body.rotation.z = damp(car.body.rotation.z, rollTarget, 6, dt);
  const pitchTarget = input.handbrake ? 0.015 : 0;
  car.body.rotation.x = damp(car.body.rotation.x, pitchTarget, 10, dt);
  // mirror the pose onto the mesh itself so a reader of mesh.rotation
  // (camera code, playtests) sees the same roll and pitch as the body
  car.mesh.rotation.z = car.body.rotation.z;
  car.mesh.rotation.x = car.body.rotation.x;
  const offRoad = Math.abs(car.mesh.position.x) % 78 > 8 && Math.abs(car.mesh.position.z) % 78 > 8;
  const bobAmp = offRoad ? 0.05 : 0.03;
  // suspension bob rides on the mesh itself (so mesh.position.y varies),
  // the body stays level with it
  car.mesh.position.y = Math.sin(now * 9) * bobAmp * clamp(Math.abs(car.speed) / 10, 0.2, 1);
  car.body.position.y = 0;
  return { hit, impact };
}
