// vehicles.js — cars of Jakarta: boxy original builds, arcade driving,
// and traffic that follows the street grid — sedans, pickups, TransJakarta
// buses and teal angkot minivans. All original.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, lerp, angleLerp, angleDiff, dist2D } from './util.js';
import { CITY, nearestRoadCoord, isOnRoad } from './city.js';

export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3aa655, 0xe8e4da, 0x22242a, 0x8a4fbf, 0xe87a2e, 0x4fc2c2];
export const CAR_NAMES = ['Comet', 'Dune', 'Vagabond', 'Falcon', 'Pinto', 'Cruiser', 'Lowrider', 'Pickup', 'Van'];
export const BUS_COLORS = [0xe87a2e, 0xc23b2e]; // TransJakarta orange-red
export const ANGKOT_COLORS = [0x2e8f8f, 0x3aa655, 0xe8b93b]; // teal / green / yellow minivans

/** Build a stylised vehicle from boxes. `police` adds a light bar. Kinds:
 *  sedan | pickup | van | bus (long TransJakarta) | angkot (small minivan). */
export function buildCarMesh(color, kind = 'sedan', police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
  const len = kind === 'bus' ? 8.4 : kind === 'angkot' ? 3.6 : kind === 'van' ? 5.2 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, kind === 'bus' ? 1.5 : 0.65, len), bodyMat);
  body.position.y = kind === 'bus' ? 1.35 : 0.65; g.add(body);
  if (kind === 'bus') {
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
    : [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]];
  const wheels = [];
  for (const [wx, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, kind === 'bus' ? 0.5 : 0.38, wz); g.add(w); wheels.push(w);
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
  return { group: g, wheels, lightBar };
}

export function createTraffic(scene, seed, count = 16) {
  const rng = mulberry32(seed ^ 0x9e37);
  const half = CITY.half;
  const cars = [];
  for (let i = 0; i < count; i++) {
    // Jakarta traffic: mostly sedans, plus TransJakarta buses and angkot.
    const roll = rng();
    const kind = roll < 0.14 ? 'bus' : roll < 0.34 ? 'angkot' : pick(rng, ['sedan', 'sedan', 'sedan', 'pickup', 'van']);
    const color = kind === 'bus' ? pick(rng, BUS_COLORS)
      : kind === 'angkot' ? pick(rng, ANGKOT_COLORS) : pick(rng, CAR_COLORS);
    const { group } = buildCarMesh(color, kind);
    const vertical = rng() < 0.5;
    const lane = (rng() < 0.5 ? -1 : 1) * 3.2;
    const road = -half + Math.floor(rand(rng, 0, CITY.blocks + 1)) * (CITY.block + CITY.road);
    const along = rand(rng, -half, half);
    const maxSpeed = kind === 'bus' ? rand(rng, 7, 10) : kind === 'angkot' ? rand(rng, 8, 12) : rand(rng, 9, 14);
    const car = {
      mesh: group, kind, speed: rand(rng, 6, 11), maxSpeed,
      heading: vertical ? (lane > 0 ? 0 : Math.PI) : (lane > 0 ? Math.PI / 2 : -Math.PI / 2),
      vertical, lane, road, along, driver: true, stolen: false, hp: 100,
      name: kind === 'bus' ? 'TransJakarta' : kind === 'angkot' ? 'Angkot' : pick(rng, CAR_NAMES),
    };
    car.mesh.position.set(vertical ? road + lane : along, 0, vertical ? along : road + lane);
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
      const oldX = car.vertical ? car.road + car.lane : car.along;
      const oldZ = car.vertical ? car.along : car.road + car.lane;
      car.vertical = !car.vertical;
      car.road = clamp(nearestRoadCoord(car.vertical ? oldZ : oldX), -half, half);
      car.along = car.vertical ? oldZ : oldX;
      car.lane = (Math.random() < 0.5 ? -1 : 1) * 3.2;
      car.heading = car.vertical ? (car.lane > 0 ? 0 : Math.PI) : (car.lane > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (car.along > half) car.along = -half + 10;
    if (car.along < -half) car.along = half - 10;
    car.mesh.position.set(car.vertical ? car.road + car.lane : car.along, 0, car.vertical ? car.along : car.road + car.lane);
    car.mesh.rotation.y = angleLerp(car.mesh.rotation.y, car.heading, clamp(dt * 4, 0, 1));
  }
}

/** Arcade driving for the player's car. Returns speed in m/s. */
export function driveCar(car, input, dt) {
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
  car.mesh.position.x = clamp(nx, -half - 20, half + 60);
  car.mesh.position.z = clamp(nz, -half - 20, half + 20);
  if (car.mesh.position.x > half + 6 && Math.abs(car.mesh.position.z) > 14) {
    // Kali Ciliwung: only the bridge (z near 0) crosses.
    car.mesh.position.x = half + 6;
    car.speed *= 0.4;
  }
  car.mesh.rotation.y = car.heading;
  const tilt = clamp(steer * car.speed * 0.004, -0.08, 0.08);
  car.mesh.rotation.z = lerp(car.mesh.rotation.z, tilt, clamp(dt * 6, 0, 1));
  car.mesh.rotation.x = lerp(car.mesh.rotation.x, clamp(-accel * 0.004, -0.05, 0.05), clamp(dt * 6, 0, 1));
  return Math.abs(car.speed);
}
