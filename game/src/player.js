// player.js — Mara on foot in Jakarta, plus the pedestrians of the city:
// office workers, warung visitors and angkot passengers who stroll the
// sidewalks and flee from trouble.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, angleLerp, dist2D } from './util.js';
import { CITY } from './city.js';

const SKINS = [0x8a5a3b, 0xc98d64, 0x6b4423, 0xe8b88a, 0x4a2f1d];
const SHIRTS = [0xd84a4a, 0x3a7bd8, 0x3aa655, 0xe8b93b, 0x8a4fbf, 0xe8e4da, 0x22242a, 0xe87a2e];

export function buildPersonMesh(shirt, skin, scale = 1) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2e3a4a });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.62; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
  hair.position.y = 1.66; g.add(hair);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.08; g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pantsMat);
  legL.position.set(-0.16, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirtMat);
  armL.position.set(-0.42, 1.1, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.scale.setScalar(scale);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
  return { group: g, legL, legR, armL, armR, head };
}

export function createPlayer(scene, x, z) {
  // Mara: red jacket, Jakarta afternoon. Her brother runs Bengkel Mara.
  const parts = buildPersonMesh(0xd84a4a, 0xc98d64, 1.05);
  parts.group.position.set(x, 0, z);
  scene.add(parts.group);
  return {
    parts, mesh: parts.group,
    pos: parts.group.position,
    heading: 0, speed: 0, health: 100,
    cash: 250000, inCar: null, weapon: 'fists', ammo: 0, // Rp250.000 from the start
    punchCd: 0, hurtCd: 0, walkPhase: 0,
  };
}

/** WASD on foot, relative to the camera yaw. Space jumps a little, Shift runs. */
export function updatePlayerOnFoot(player, input, camYaw, dt) {
  const run = input.run ? 9 : 5;
  let fx = 0, fz = 0;
  if (input.forward) { fx += Math.sin(camYaw); fz += Math.cos(camYaw); }
  if (input.back) { fx -= Math.sin(camYaw); fz -= Math.cos(camYaw); }
  if (input.left) { fx -= Math.cos(camYaw); fz += Math.sin(camYaw); }
  if (input.right) { fx += Math.cos(camYaw); fz -= Math.sin(camYaw); }
  const len = Math.hypot(fx, fz);
  if (len > 0.01) {
    fx /= len; fz /= len;
    player.heading = angleLerp(player.heading, Math.atan2(fx, fz), clamp(dt * 10, 0, 1));
    player.speed = lerp(player.speed, run, clamp(dt * 8, 0, 1));
    player.walkPhase += dt * player.speed * 1.6;
  } else {
    player.speed = lerp(player.speed, 0, clamp(dt * 10, 0, 1));
  }
  player.pos.x = clamp(player.pos.x + Math.sin(player.heading) * player.speed * dt, -CITY.half - 20, CITY.half + 55);
  player.pos.z = clamp(player.pos.z + Math.cos(player.heading) * player.speed * dt, -CITY.half - 20, CITY.half + 20);
  if (player.pos.x > CITY.half + 6 && Math.abs(player.pos.z) > 14) player.pos.x = CITY.half + 6;
  player.mesh.rotation.y = player.heading;
  const sw = Math.sin(player.walkPhase) * clamp(player.speed / 9, 0, 1) * 0.6;
  player.parts.legL.rotation.x = sw; player.parts.legR.rotation.x = -sw;
  player.parts.armL.rotation.x = -sw * 0.8; player.parts.armR.rotation.x = sw * 0.8;
  player.punchCd = Math.max(0, player.punchCd - dt);
  player.hurtCd = Math.max(0, player.hurtCd - dt);
}
function lerp(a, b, t) { return a + (b - a) * t; }

export function createPedestrians(scene, seed, count = 26) {
  const rng = mulberry32(seed ^ 0x51ab);
  const half = CITY.half;
  const peds = [];
  for (let i = 0; i < count; i++) {
    const parts = buildPersonMesh(pick(rng, SHIRTS), pick(rng, SKINS), rand(rng, 0.92, 1.08));
    const x = rand(rng, -half, half), z = rand(rng, -half, half);
    parts.group.position.set(x, 0, z);
    scene.add(parts.group);
    peds.push({
      parts, mesh: parts.group, heading: rand(rng, 0, Math.PI * 2),
      speed: rand(rng, 1.2, 2.2), walkPhase: rand(rng, 0, 6),
      targetX: x, targetZ: z, fleeing: 0, state: 'walk',
    });
  }
  return peds;
}

/** Peds stroll between sidewalk points; they run from gunfire, fights and police. */
export function updatePedestrians(peds, danger, dt) {
  const half = CITY.half;
  for (const p of peds) {
    if (p.fleeing > 0) p.fleeing -= dt;
    let tx = p.targetX, tz = p.targetZ;
    if (danger && p.fleeing <= 0 && dist2D(p.mesh.position.x, p.mesh.position.z, danger.x, danger.z) < 18) {
      p.fleeing = 3;
    }
    if (p.fleeing > 0) {
      const dx = p.mesh.position.x - danger.x, dz = p.mesh.position.z - danger.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.mesh.position.x + (dx / d) * 30; tz = p.mesh.position.z + (dz / d) * 30;
      p.speed = 5.5;
    } else {
      p.speed = 1.6;
      if (dist2D(p.mesh.position.x, p.mesh.position.z, tx, tz) < 3) {
        p.targetX = clamp(p.mesh.position.x + rand(Math.random, -60, 60), -half, half);
        p.targetZ = clamp(p.mesh.position.z + rand(Math.random, -60, 60), -half, half);
      }
    }
    const dx = tx - p.mesh.position.x, dz = tz - p.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      const want = Math.atan2(dx, dz);
      p.heading = angleLerp(p.heading, want, clamp(dt * 4, 0, 1));
      p.mesh.position.x += Math.sin(p.heading) * p.speed * dt;
      p.mesh.position.z += Math.cos(p.heading) * p.speed * dt;
      p.walkPhase += dt * p.speed * 1.8;
    }
    p.mesh.rotation.y = p.heading;
    const sw = Math.sin(p.walkPhase) * 0.5;
    p.parts.legL.rotation.x = sw; p.parts.legR.rotation.x = -sw;
    p.parts.armL.rotation.x = -sw * 0.7; p.parts.armR.rotation.x = sw * 0.7;
  }
}
