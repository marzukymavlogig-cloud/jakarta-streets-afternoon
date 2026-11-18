// player.js — Mara on foot in Jakarta, plus the pedestrians of the city:
// office workers, warung visitors and angkot passengers who stroll the
// sidewalks and flee from trouble.
//
// v3 — realistic smooth humans (as far as this low-poly WebGL engine goes):
// capsule limbs instead of boxes, so silhouettes are round, not square;
// separate thigh + shin with a real knee bend, arms that swing opposite the
// legs, a torso that bobs and leans, and idle breathing. Varied builds
// (slim/broad, tall/short), a wider Indonesian skin-tone range, varied
// trousers, and Jakarta street variety: hijab, caps, backpacks, buns.
// Honest note: still stylised low-poly — no faces, no fingers, no cloth
// simulation — but the walk reads as human, not as a sliding box.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, angleLerp, dist2D } from './util.js';
import { CITY, PLAZA_STALLS } from './city.js';

const SKINS = [0x8a5a3b, 0xc98d64, 0x6b4423, 0xe8b88a, 0x4a2f1d, 0xa06a42, 0x7a4a28, 0xd9a075];
const SHIRTS = [0xd84a4a, 0x3a7bd8, 0x3aa655, 0xe8b93b, 0x8a4fbf, 0xe8e4da, 0x22242a, 0xe87a2e,
  0x2e8f8f, 0xc23b7a, 0x5a6a3a, 0xd8c9a8, 0x4a6a8a, 0x7a3a5a];
const PANTS = [0x2e3a4a, 0x3a2e2a, 0x4a4a4a, 0x2a4a3a, 0x6a5a3a, 0x1e1e28, 0x3a4a6a, 0x5a3a2a];
const HIJABS = [0x8a4fbf, 0x3a7bd8, 0xd84a4a, 0x2a2a2a, 0xe8e4da, 0x3aa655, 0x5a3a5a, 0x8a6a2a];

// Shared geometries: one set for every person in the city (cheap to render).
const GEO = {
  torso: new THREE.CapsuleGeometry(0.26, 0.38, 4, 10),
  head: new THREE.SphereGeometry(0.235, 12, 10),
  hair: new THREE.SphereGeometry(0.245, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hijab: new THREE.SphereGeometry(0.295, 12, 10),
  hijabDrape: new THREE.CylinderGeometry(0.26, 0.34, 0.42, 10),
  arm: new THREE.CapsuleGeometry(0.085, 0.42, 4, 8),
  thigh: new THREE.CapsuleGeometry(0.105, 0.34, 4, 8),
  shin: new THREE.CapsuleGeometry(0.088, 0.36, 4, 8),
  cap: new THREE.CylinderGeometry(0.24, 0.25, 0.1, 10),
  brim: new THREE.BoxGeometry(0.32, 0.035, 0.22),
  bun: new THREE.SphereGeometry(0.11, 8, 6),
  pack: new THREE.BoxGeometry(0.36, 0.44, 0.16),
};

/** Build one smooth low-poly person. Returns pivots the walk cycle drives:
 *  legL/legR are thigh pivots at the hip, shinL/shinR knee pivots, armL/armR
 *  shoulder pivots, torso is the chest capsule, body is the inner group
 *  (bob + lean + breathing live here, the shadow stays on the ground). */
export function buildPersonMesh(shirt, skin, scale = 1, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: opts.pants ?? 0x2e3a4a });
  const build = opts.build ?? 1; // 0.9 slim … 1.15 broad

  // Torso: rounded capsule, slightly wider than deep.
  const torso = new THREE.Mesh(GEO.torso, shirtMat);
  torso.position.y = 1.24;
  torso.scale.set(build, 1, 0.88);
  body.add(torso);
  // Head, a touch egg-shaped, on a short neck.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), skinMat);
  neck.position.y = 1.62; body.add(neck);
  const head = new THREE.Mesh(GEO.head, skinMat);
  head.position.y = 1.79; head.scale.set(0.94, 1.08, 0.98);
  body.add(head);
  const variant = opts.variant ?? 'hair';
  if (variant === 'hijab') {
    const hijabMat = new THREE.MeshLambertMaterial({ color: opts.hijab ?? pick(Math.random, HIJABS) });
    const hijab = new THREE.Mesh(GEO.hijab, hijabMat);
    hijab.position.y = 1.8; hijab.scale.set(0.96, 1.1, 1.0);
    body.add(hijab);
    const drape = new THREE.Mesh(GEO.hijabDrape, hijabMat);
    drape.position.y = 1.5; body.add(drape);
    // Face stays visible: a skin disc on the front of the scarf.
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skinMat);
    face.position.set(0, 1.78, 0.1); face.scale.set(0.95, 1.05, 0.7);
    body.add(face);
  } else if (variant === 'cap') {
    const capMat = new THREE.MeshLambertMaterial({ color: opts.capColor ?? 0x22242a });
    const cap = new THREE.Mesh(GEO.cap, capMat);
    cap.position.y = 1.94; body.add(cap);
    const brim = new THREE.Mesh(GEO.brim, capMat);
    brim.position.set(0, 1.9, 0.28); body.add(brim);
    const hair = new THREE.Mesh(GEO.hair, new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
    hair.position.y = 1.82; hair.scale.set(0.98, 0.9, 0.98); body.add(hair);
  } else {
    const hair = new THREE.Mesh(GEO.hair, new THREE.MeshLambertMaterial({ color: opts.hairColor ?? 0x1c1410 }));
    hair.position.y = 1.82; body.add(hair);
    if (variant === 'bun') {
      const bun = new THREE.Mesh(GEO.bun, new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
      bun.position.set(0, 1.95, -0.2); body.add(bun);
    }
  }
  if (opts.backpack) {
    const pack = new THREE.Mesh(GEO.pack, new THREE.MeshLambertMaterial({ color: opts.packColor ?? 0x3a4a5a }));
    pack.position.set(0, 1.28, -0.3); body.add(pack);
  }
  // Arms: single smooth capsules on shoulder pivots, hands skin-tipped.
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.33 * build * side, 1.52, 0);
    const a = new THREE.Mesh(GEO.arm, shirtMat);
    a.position.y = -0.26; pivot.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), skinMat);
    hand.position.y = -0.55; pivot.add(hand);
    pivot.rotation.z = side * -0.07;
    body.add(pivot);
    return pivot;
  }
  const armL = arm(-1), armR = arm(1);
  // Legs: thigh pivot at the hip, shin pivot at the knee (real knee bend).
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.13 * side, 0.98, 0);
    const thigh = new THREE.Mesh(GEO.thigh, pantsMat);
    thigh.position.y = -0.22; hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.48; hip.add(knee);
    const shin = new THREE.Mesh(GEO.shin, pantsMat);
    shin.position.y = -0.22; knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
    shoe.position.set(0, -0.44, 0.05); knee.add(shoe);
    body.add(hip);
    return { hip, knee };
  }
  const lL = leg(-1), lR = leg(1);
  g.scale.setScalar(scale);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
  return {
    group: g, body, legL: lL.hip, legR: lR.hip, shinL: lL.knee, shinR: lR.knee,
    armL, armR, head, torso,
  };
}

/** One smooth walk cycle: thigh swing, knee bend on the swing-through,
 *  opposite arm swing, torso bob + forward lean, idle breathing when still.
 *  phase advances with distance walked; sf 0 (idle) … 1 (full run). */
export function animateWalk(parts, phase, sf, t) {
  const sw = Math.sin(phase);
  const sw2 = Math.sin(phase + Math.PI);
  parts.legL.rotation.x = sw * 0.62 * sf;
  parts.legR.rotation.x = sw2 * 0.62 * sf;
  // Knees bend most as the leg lifts through, a little even at rest.
  parts.shinL.rotation.x = (0.12 + Math.max(0, Math.sin(phase + 2.4)) * 0.85) * sf;
  parts.shinR.rotation.x = (0.12 + Math.max(0, Math.sin(phase + Math.PI + 2.4)) * 0.85) * sf;
  parts.armL.rotation.x = sw2 * 0.5 * sf;
  parts.armR.rotation.x = sw * 0.5 * sf;
  parts.armL.rotation.z = -0.07 - 0.06 * sf;
  parts.armR.rotation.z = 0.07 + 0.06 * sf;
  parts.body.position.y = Math.abs(Math.cos(phase)) * 0.045 * sf + Math.sin(t * 2) * 0.006 * (1 - sf);
  parts.body.rotation.x = 0.07 * sf;
  parts.body.rotation.z = Math.sin(phase) * 0.02 * sf;
  parts.head.rotation.x = -0.04 * sf;
}

export function createPlayer(scene, x, z) {
  // Mara: red jacket, hair in a bun, Jakarta afternoon. Her brother runs Bengkel Mara.
  const parts = buildPersonMesh(0xd84a4a, 0xc98d64, 1.05, { variant: 'bun', pants: 0x2e3a4a });
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
export function updatePlayerOnFoot(player, input, camYaw, dt, now) {
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
  animateWalk(player.parts, player.walkPhase, clamp(player.speed / 9, 0, 1), now);
  player.punchCd = Math.max(0, player.punchCd - dt);
  player.hurtCd = Math.max(0, player.hurtCd - dt);
}
function lerp(a, b, t) { return a + (b - a) * t; }

/** Pedestrians: the first `roam` stroll the whole city; the rest are the
 *  Monas crowd — they stay on Lapangan Merdeka, drift between the vendor
 *  stalls, and often pause to browse (stand, look at the goods). */
export function createPedestrians(scene, seed, count = 44, roam = 26) {
  const rng = mulberry32(seed ^ 0x51ab);
  const half = CITY.half;
  const peds = [];
  for (let i = 0; i < count; i++) {
    const plaza = i >= roam;
    const variant = rng() < 0.3 ? 'hijab' : (rng() < 0.18 ? 'cap' : (rng() < 0.12 ? 'bun' : 'hair'));
    const parts = buildPersonMesh(pick(rng, SHIRTS), pick(rng, SKINS), rand(rng, 0.92, 1.08), {
      variant, pants: pick(rng, PANTS), build: rand(rng, 0.9, 1.15),
      backpack: rng() < 0.22, hijab: pick(rng, HIJABS),
    });
    let x, z;
    if (plaza) {
      const a = rand(rng, 0, Math.PI * 2), r = rand(rng, 18, 44);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } else {
      x = rand(rng, -half, half); z = rand(rng, -half, half);
    }
    parts.group.position.set(x, 0, z);
    scene.add(parts.group);
    peds.push({
      parts, mesh: parts.group, heading: rand(rng, 0, Math.PI * 2),
      speed: rand(rng, 1.2, 2.2), walkPhase: rand(rng, 0, 6),
      targetX: x, targetZ: z, fleeing: 0, state: 'walk', pause: 0,
      plaza, baseSpeed: plaza ? rand(rng, 0.9, 1.6) : rand(rng, 1.2, 2.2),
    });
  }
  return peds;
}

/** Peds stroll between sidewalk points; they run from gunfire, fights and police.
 *  Plaza peds browse: they drift stall to stall and pause to look at the goods. */
export function updatePedestrians(peds, danger, dt, now) {
  const half = CITY.half;
  for (const p of peds) {
    if (p.fleeing > 0) p.fleeing -= dt;
    if (p.pause > 0) {
      p.pause -= dt;
      p.speed = lerp(p.speed, 0, clamp(dt * 8, 0, 1));
      animateWalk(p.parts, p.walkPhase, clamp(p.speed / 5, 0, 1), now);
      p.mesh.rotation.y = p.heading;
      continue;
    }
    let tx = p.targetX, tz = p.targetZ;
    if (danger && p.fleeing <= 0 && dist2D(p.mesh.position.x, p.mesh.position.z, danger.x, danger.z) < 18) {
      p.fleeing = 3;
    }
    if (p.fleeing > 0) {
      const dx = p.mesh.position.x - danger.x, dz = p.mesh.position.z - danger.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.mesh.position.x + (dx / d) * 30; tz = p.mesh.position.z + (dz / d) * 30;
      p.speed = lerp(p.speed, 5.5, clamp(dt * 6, 0, 1));
    } else {
      p.speed = lerp(p.speed, p.baseSpeed, clamp(dt * 2, 0, 1));
      if (dist2D(p.mesh.position.x, p.mesh.position.z, tx, tz) < 3) {
        if (p.plaza) {
          // Drift to a vendor stall to browse, or elsewhere on the plaza.
          if (Math.random() < 0.65 && PLAZA_STALLS.length) {
            const s = PLAZA_STALLS[Math.floor(Math.random() * PLAZA_STALLS.length)];
            p.targetX = clamp(s.x + rand(Math.random, -7, 7), -54, 54);
            p.targetZ = clamp(s.z + rand(Math.random, -7, 7), -54, 54);
          } else {
            const a = rand(Math.random, 0, Math.PI * 2), r = rand(Math.random, 16, 44);
            p.targetX = Math.cos(a) * r; p.targetZ = Math.sin(a) * r;
          }
          // Often stop and browse the goods for a while.
          if (Math.random() < 0.45) p.pause = rand(Math.random, 3, 7);
        } else {
          p.targetX = clamp(p.mesh.position.x + rand(Math.random, -60, 60), -half, half);
          p.targetZ = clamp(p.mesh.position.z + rand(Math.random, -60, 60), -half, half);
        }
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
    animateWalk(p.parts, p.walkPhase, clamp(p.speed / 5.5, 0, 1), now);
  }
}
