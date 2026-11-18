// vehicles.js — cars of Jakarta: boxy original builds, arcade driving,
// and traffic that follows the street grid — sedans, pickups, TransJakarta
// buses and teal angkot minivans. All original.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, lerp, angleLerp, angleDiff, dist2D, circleHitsColliders, resolveCircleOut } from './util.js';
import { CITY, nearestRoadCoord, isOnRoad } from './city.js';

export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3aa655, 0xe8e4da, 0x22242a, 0x8a4fbf, 0xe87a2e, 0x4fc2c2];
export const CAR_NAMES = ['Comet', 'Dune', 'Vagabond', 'Falcon', 'Pinto', 'Cruiser', 'Lowrider', 'Pickup', 'Van'];
export const BUS_COLORS = [0xe87a2e, 0xc23b2e]; // TransJakarta orange-red
export const ANGKOT_COLORS = [0x2e8f8f, 0x3aa655, 0xe8b93b]; // teal / green / yellow minivans
// v4.1 (ref 2): Jakarta plates — the hero car wears B 1001 JKT.
const PLATES = ['B 2045 JKT', 'B 7788 JKT', 'B 1234 JKT', 'B 5678 JKT', 'B 9012 JKT', 'B 3456 JKT'];
const plateTexCache = {};
function plateTexture(text) {
  if (plateTexCache[text]) return plateTexCache[text];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 40px sans-serif'; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  plateTexCache[text] = tex;
  return tex;
}

/** Build a stylised vehicle from boxes. `police` adds a light bar. Kinds:
 *  sedan | pickup | van | bus (long TransJakarta) | angkot (small minivan)
 *  | taxi (yellow, roof sign) | foodtruck (bright kitchen truck, v4)
 *  | bajaj (blue three-wheel auto-rickshaw, v4.1). */
export function buildCarMesh(color, kind = 'sedan', police = false, plate = null) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
  const len = kind === 'bus' ? 8.4 : kind === 'foodtruck' ? 5.6 : kind === 'angkot' ? 3.6
    : kind === 'bajaj' ? 2.6 : kind === 'van' ? 5.2 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(kind === 'bajaj' ? 1.5 : 2.1,
    kind === 'bus' || kind === 'foodtruck' ? 1.5 : kind === 'bajaj' ? 0.9 : 0.65, len), bodyMat);
  body.position.y = kind === 'bus' || kind === 'foodtruck' ? 1.35 : kind === 'bajaj' ? 0.6 : 0.65; g.add(body);
  if (kind === 'bajaj') {
    // v4.1 (ref 2): blue auto-rickshaw — yellow canopy roof, open sides,
    // one front wheel, two at the back.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xe8b93b }));
    roof.position.y = 1.55; g.add(roof);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.08), darkMat);
    shield.position.set(0, 1.15, 1.15); g.add(shield);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.8), darkMat);
    seat.position.set(0, 0.95, -0.3); g.add(seat);
  } else if (kind === 'foodtruck') {
    // v4 (benchmark): a kitchen truck — serving window, awning stripe, roof sign.
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.7, 3.2), darkMat);
    win.position.y = 1.7; g.add(win);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 5.6),
      new THREE.MeshLambertMaterial({ color: 0xe8b93b }));
    awn.position.y = 2.25; g.add(awn);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xf2ead8 }));
    sign.position.set(0, 2.5, 0); g.add(sign);
  } else if (kind === 'taxi') {
    // v4 (benchmark): yellow cab — black band + white roof sign, GTA-style.
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.14, len),
      new THREE.MeshLambertMaterial({ color: 0x111214 }));
    band.position.y = 0.95; g.add(band);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xf2ead8 }));
    sign.position.set(0, 1.55, 0.1); g.add(sign);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), darkMat);
    cabin.position.set(0, 1.15, 0.1); g.add(cabin);
  } else if (kind === 'bus') {
    // TransJakarta: big windows band + orange stripe, "TRANSJAKARTA" feel via stripe.
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.9, len - 1), darkMat);
    glass.position.y = 2.2; g.add(glass);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.3, len),
      new THREE.MeshLambertMaterial({ color: 0xffd23b }));
    stripe.position.y = 1.35; g.add(stripe);
  } else if (kind === 'angkot') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 2.6), darkMat);
    cabin.position.set(0, 1.3, 0); g.add(cabin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.22, 3.6),
      new THREE.MeshLambertMaterial({ color: 0xffd23b }));
    stripe.position.y = 0.95; g.add(stripe);
  } else {
    const cabinH = kind === 'van' ? 1.0 : 0.55;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, cabinH, kind === 'van' ? 3.4 : 2.2), darkMat);
    cabin.position.set(0, 1.15, kind === 'pickup' ? -0.7 : 0.1); g.add(cabin);
  }
  if (kind === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.6), bodyMat);
    bed.position.set(0, 1.0, 1.3); g.add(bed);
  }
  const wheelGeo = new THREE.CylinderGeometry(kind === 'bus' ? 0.5 : 0.38, kind === 'bus' ? 0.5 : 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });
  const wheelPos = kind === 'bus'
    ? [[-0.95, -3.2], [0.95, -3.2], [-0.95, 0.6], [0.95, 0.6], [-0.95, 3.2], [0.95, 3.2]]
    : kind === 'bajaj'
      ? [[0, 1.0], [-0.62, -0.9], [0.62, -0.9]]
      : [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]];
  const wheels = [];
  // v4.1: front wheels sit on steer pivots so they yaw with the steering
  // (driveCar sets pivot.rotation.y); rear wheels stay fixed.
  const steerWheels = [];
  for (const [wx, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, kind === 'bus' ? 0.5 : kind === 'bajaj' ? 0.32 : 0.38, wz);
    if (wz > 0) {
      const pivot = new THREE.Group();
      pivot.position.copy(w.position);
      w.position.set(0, 0, 0);
      pivot.add(w); g.add(pivot); steerWheels.push(pivot);
    } else { g.add(w); }
    wheels.push(w);
  }
  // v4.1 (ref 2): Jakarta plates, front and rear.
  const plateText = plate ?? PLATES[Math.floor(Math.random() * PLATES.length)];
  g.userData.plate = plateText;
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTexture(plateText) });
  for (const pz of [len / 2 + 0.03, -len / 2 - 0.03]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18), plateMat);
    pl.position.set(0, kind === 'bus' ? 1.1 : 0.55, pz);
    if (pz < 0) pl.rotation.y = Math.PI;
    g.add(pl);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const front = len / 2 + 0.02;
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    hl.position.set(sx, kind === 'bus' ? 1.1 : 0.75, front); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tl.position.set(sx, kind === 'bus' ? 1.1 : 0.75, -front); g.add(tl);
  }
  let lightBar = null;
  if (police) {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    r.position.x = -0.35; bar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    b.position.x = 0.35; bar.add(b);
    bar.position.set(0, 1.55, 0.1); g.add(bar); lightBar = bar;
    const star = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    star.position.y = 0.99; g.add(star);
  }
  // Blob shadow: cheap grounding without a shadow map.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(kind === 'bus' ? 3.4 : 2.2, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, kind === 'bus' ? 2.6 : 1.9, 1); shadow.position.y = 0.03;
  g.add(shadow);
  return { group: g, wheels, steerWheels, body, lightBar, plate: plateText };
}

export function createTraffic(scene, seed, count = 16) {
  const rng = mulberry32(seed ^ 0x9e37);
  const half = CITY.half;
  const cars = [];
  for (let i = 0; i < count; i++) {
    // Jakarta traffic: mostly sedans, plus TransJakarta buses, angkot — and
    // v4: yellow taxis (benchmark) in the mix; v4.1: blue bajaj (ref 2).
    const roll = rng();
    const kind = roll < 0.10 ? 'bajaj' : roll < 0.22 ? 'bus' : roll < 0.38 ? 'angkot' : roll < 0.53 ? 'taxi'
      : pick(rng, ['sedan', 'sedan', 'sedan', 'pickup', 'van']);
    const color = kind === 'bus' ? pick(rng, BUS_COLORS)
      : kind === 'angkot' ? pick(rng, ANGKOT_COLORS)
      : kind === 'taxi' ? 0xe8b93b
      : kind === 'bajaj' ? 0x2e6fc2 : pick(rng, CAR_COLORS);
    const { group, steerWheels, body } = buildCarMesh(color, kind);
    const vertical = rng() < 0.5;
    const lane = (rng() < 0.5 ? -1 : 1) * 3.2;
    const road = -half + Math.floor(rand(rng, 0, CITY.blocks + 1)) * (CITY.block + CITY.road);
    const along = rand(rng, -half, half);
    const maxSpeed = kind === 'bus' ? rand(rng, 7, 10) : kind === 'angkot' ? rand(rng, 8, 12)
      : kind === 'bajaj' ? rand(rng, 8, 12)
      : kind === 'taxi' ? rand(rng, 10, 15) : rand(rng, 9, 14);
    const car = {
      mesh: group, kind, speed: rand(rng, 6, 11), maxSpeed, steerWheels, body,
      heading: vertical ? (lane > 0 ? 0 : Math.PI) : (lane > 0 ? Math.PI / 2 : -Math.PI / 2),
      vertical, lane, road, along, driver: true, stolen: false, hp: 100,
      name: kind === 'bus' ? 'TransJakarta' : kind === 'angkot' ? 'Angkot'
        : kind === 'bajaj' ? 'Bajaj' : kind === 'taxi' ? 'Taksi' : pick(rng, CAR_NAMES),
    };
    car.mesh.position.set(vertical ? road + 7 + lane : along, 0, vertical ? along : road + 7 + lane);
    car.mesh.rotation.y = car.heading;
    scene.add(group);
    cars.push(car);
  }
  // v4 (benchmark): two food trucks cruising the Sudirman avenue slowly.
  for (const [along, lane] of [[-80, 3.2], [60, -3.2]]) {
    const { group } = buildCarMesh(pick(rng, [0x3aa655, 0xc23b2e]), 'foodtruck');
    const car = {
      mesh: group, kind: 'foodtruck', speed: 6, maxSpeed: 7,
      heading: lane > 0 ? Math.PI / 2 : -Math.PI / 2,
      vertical: false, lane, road: 39, along, driver: true, stolen: false, hp: 100,
      name: 'Food Truck',
    };
    car.mesh.position.set(along, 0, 46 + lane);
    car.mesh.rotation.y = car.heading;
    scene.add(group);
    cars.push(car);
  }
  return cars;
}

/** One traffic step: follow the lane, turn at intersections, avoid the car ahead. */
export function updateTraffic(cars, playerPos, dt) {
  const half = CITY.half;
  const step = CITY.block + CITY.road;
  for (const car of cars) {
    if (!car.maxSpeed) continue; // parked / owned cars stay put
    // Slow for the player / a car ahead on the same lane.
    let target = car.maxSpeed;
    for (const other of cars) {
      if (other === car) continue;
      if (Math.abs(other.road - car.road) > 2 || other.vertical !== car.vertical) continue;
      const ahead = car.vertical
        ? (car.heading === 0 ? other.along - car.along : car.along - other.along)
        : (car.heading === Math.PI / 2 ? other.along - car.along : car.along - other.along);
      if (ahead > 0 && ahead < 14) target = Math.min(target, 2.5);
    }
    if (playerPos) {
      const d = dist2D(car.mesh.position.x, car.mesh.position.z, playerPos.x, playerPos.z);
      if (d < 12) target = Math.min(target, 4);
    }
    car.speed = lerp(car.speed, target, clamp(dt * 1.5, 0, 1));
    const dir = (car.heading === 0 || car.heading === Math.PI / 2) ? 1 : -1;
    car.along += car.speed * dt * dir;
    // Turn at a random intersection instead of leaving town.
    const stepPos = ((car.along + half) % step + step) % step;
    const atJunction = stepPos < 1.5 || stepPos > step - 1.5;
    if ((car.along > half - 8 || car.along < -half + 8) || (atJunction && Math.random() < dt * 0.35)) {
      const oldX = car.vertical ? car.road + 7 + car.lane : car.along;
      const oldZ = car.vertical ? car.along : car.road + 7 + car.lane;
      car.vertical = !car.vertical;
      car.road = clamp(nearestRoadCoord(car.vertical ? oldZ : oldX), -half, half);
      car.along = car.vertical ? oldZ : oldX;
      car.lane = (Math.random() < 0.5 ? -1 : 1) * 3.2;
      car.heading = car.vertical ? (car.lane > 0 ? 0 : Math.PI) : (car.lane > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (car.along > half) car.along = -half + 10;
    if (car.along < -half) car.along = half - 10;
    // v4: lanes sit on the road centre (road + 7), not the strip edge —
    // the old +lane from the edge put half the traffic on the sidewalk.
    car.mesh.position.set(car.vertical ? car.road + 7 + car.lane : car.along, 0, car.vertical ? car.along : car.road + 7 + car.lane);
    // v4.1: traffic leans into its turns — the body roll follows the
    // heading change, so a bus or bajaj visibly banks at intersections.
    // (Outward lean, like the player car's roll in driveCar.)
    const turnRate = angleDiff(car.heading, car.mesh.rotation.y);
    car.mesh.rotation.y = angleLerp(car.mesh.rotation.y, car.heading, clamp(dt * 4, 0, 1));
    car.mesh.rotation.z = lerp(car.mesh.rotation.z, clamp(-turnRate * 0.35, -0.06, 0.06), clamp(dt * 4, 0, 1));
  }
}

/** Arcade driving for the player's car. Returns speed in m/s.
 *  v4: SOLID buildings — the car moves axis by axis and stops at walls
 *  instead of passing through them. A hard hit bounces the car back a
 *  little, costs a few HP, and sets car.bump (main.js turns it into a
 *  thud, a camera shake and sparks). Traffic never needs this: it follows
 *  the road grid by construction, so it cannot enter a block. */
export function driveCar(car, input, dt, colliders) {
  const accel = input.forward ? 16 : input.back ? -10 : 0;
  const top = input.back ? -12 : 34;
  car.speed = clamp(car.speed + accel * dt, -12, top);
  if (!input.forward && !input.back) car.speed = lerp(car.speed, 0, clamp(dt * 1.2, 0, 1));
  if (input.handbrake) car.speed = lerp(car.speed, 0, clamp(dt * 5, 0, 1));
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  // Wet Jakarta roads after the rain: a little less grip off the asphalt.
  const grip = isOnRoad(car.mesh.position.x, car.mesh.position.z) ? 1 : 0.45;
  car.heading += steer * clamp(Math.abs(car.speed) / 12, 0, 1) * 1.9 * dir * grip * dt;
  const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
  // Soft city bounds + river block.
  const half = CITY.half;
  let px = clamp(nx, -half - 20, half + 60);
  let pz = clamp(nz, -half - 20, half + 20);
  if (px > half + 6 && Math.abs(pz) > 14) {
    // Kali Ciliwung: only the bridge (z near 0) crosses.
    px = half + 6;
    car.speed *= 0.4;
  }
  if (colliders) {
    // Axis-separated so the car slides along a wall; a blocked axis stops
    // the car dead instead of letting it sink into the building.
    const R = 1.7; // car footprint radius vs building boxes
    let hit = false;
    if (!circleHitsColliders(px, car.mesh.position.z, R, colliders)) {
      car.mesh.position.x = px;
    } else hit = true;
    if (!circleHitsColliders(car.mesh.position.x, pz, R, colliders)) {
      car.mesh.position.z = pz;
    } else hit = true;
    if (hit) {
      const impact = Math.abs(car.speed);
      car.bumpCd = Math.max(0, (car.bumpCd ?? 0) - dt);
      if (impact > 4 && car.bumpCd <= 0) {
        car.bump = true; car.bumpCd = 0.5;
        car.hp = Math.max(0, (car.hp ?? 100) - Math.min(12, Math.round(impact * 0.5)));
        car.speed = -car.speed * 0.25; // bounce back off the wall
      } else {
        car.speed = 0;
      }
      // A spawn inside a wall (or a shove) gets pushed back out.
      resolveCircleOut(car.mesh.position, R, colliders);
    }
  } else {
    car.mesh.position.x = px;
    car.mesh.position.z = pz;
  }
  car.mesh.rotation.y = car.heading;
  // v4.1: the front wheels yaw with the steering, and the body leans into
  // the turn (roll) and dives when braking (pitch) — all lerped, so the car
  // never snaps between poses.
  const steerAngle = steer * 0.42 * clamp(Math.abs(car.speed) / 12, 0, 1);
  car.steerAngle = lerp(car.steerAngle ?? 0, steerAngle, clamp(dt * 10, 0, 1));
  if (car.steerWheels) for (const p of car.steerWheels) p.rotation.y = car.steerAngle;
  const tilt = clamp(steer * car.speed * 0.004, -0.08, 0.08);
  car.mesh.rotation.z = lerp(car.mesh.rotation.z, tilt, clamp(dt * 6, 0, 1));
  // v4.1: nose dive — hard braking (or the handbrake) pitches the nose down.
  const braking = input.handbrake && Math.abs(car.speed) > 2 ? 0.06 : 0;
  car.mesh.rotation.x = lerp(car.mesh.rotation.x,
    clamp(-accel * 0.004, -0.05, 0.05) + braking, clamp(dt * 6, 0, 1));
  // v4.1: suspension — the whole car breathes over the road, more off the
  // asphalt (bumpy kampung / sidewalk) than on it.
  car.suspPhase = (car.suspPhase ?? 0) + dt * (4 + Math.abs(car.speed));
  const offRoad = isOnRoad(car.mesh.position.x, car.mesh.position.z) ? 1 : 2.2;
  car.mesh.position.y = 0.025 * Math.sin(car.suspPhase) * Math.min(1, Math.abs(car.speed) / 15) * offRoad
    + 0.012 * Math.sin(car.suspPhase * 2.7) * offRoad;
  return Math.abs(car.speed);
}
