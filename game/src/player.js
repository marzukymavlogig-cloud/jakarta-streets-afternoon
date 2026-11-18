// player.js — people. Mara Voss and every pedestrian, vendor and ojol rider
// are built from the same capsule figure: rounded torso, egg head, a face
// (eyes, brows, nose, mouth), knees that bend, arms that counter-swing the
// legs, and a walk that blends into a run instead of snapping. Plus the
// CJ-style arsenal, the ammo crates scattered around the city, and the crowd.
import * as THREE from 'three';
import { clamp, lerp, damp, pick, range, rangeInt, addFace, SKIN_TONES, resolveCircleOut, dist2 } from './util.js';

export const WEAPONS = {
  fists: { name: 'TINJU', mag: Infinity, damage: 12, rate: 0.4, range: 2.2, auto: false, pellets: 1 },
  pistol: { name: 'PISTOL', mag: 12, damage: 25, rate: 0.28, range: 42, auto: false, pellets: 1 },
  smg: { name: 'SMG', mag: 30, damage: 14, rate: 0.09, range: 36, auto: true, pellets: 1 },
  shotgun: { name: 'SHOTGUN', mag: 6, damage: 12, rate: 0.85, range: 24, auto: false, pellets: 6 },
  rifle: { name: 'SENAPAN', mag: 30, damage: 34, rate: 0.11, range: 65, auto: true, pellets: 1 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

const SHIRTS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xe67e22, 0x8e44ad, 0xf1c40f, 0xe8e8e8, 0x222222, 0x16a085, 0xd35400, 0x7a5a9a, 0x3a7a5a, 0xb03a5a, 0x5a7a9a];
const TROUSERS = [0x2c3e50, 0x333333, 0x5a4a3a, 0x1a3a5a, 0x4a4a4a, 0x6a3a3a, 0x2a4a3a, 0x7a7a7a];

// One human figure. opts: skin, shirt, trousers, hijab, cap, bun, glasses,
// moustache, lipstick, lashes, ojol (green jacket + helmet), backpack, build
// ('slim' | 'broad'), height.
export function buildPersonMesh(opts = {}) {
  const rng = opts.rng || Math.random;
  const skin = opts.skin ?? pick(rng, SKIN_TONES);
  const shirtC = opts.ojol ? 0x1faa59 : (opts.shirt ?? pick(rng, SHIRTS));
  const trouserC = opts.trousers ?? pick(rng, TROUSERS);
  const build = opts.build || (rng() < 0.5 ? 'slim' : 'broad');
  const hScale = opts.height ?? range(rng, 0.94, 1.06);
  const wScale = build === 'broad' ? 1.22 : 0.92;

  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtC, roughness: 0.85 });
  const trouserMat = new THREE.MeshStandardMaterial({ color: trouserC, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26 * wScale, 0.5, 4, 10), shirtMat);
  torso.position.y = 1.08; torso.castShadow = true;
  group.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42 * wScale, 0.22, 0.26), trouserMat);
  hips.position.y = 0.78; group.add(hips);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skinMat);
  head.position.y = 1.66; head.scale.set(0.92, 1.08, 0.95); head.castShadow = true;
  group.add(head);
  addFace(head, skin, {
    lipstick: !!opts.lipstick, lashes: !!opts.lashes,
    moustache: !!opts.moustache, glasses: !!opts.glasses,
  });
  if (opts.hijab) {
    const hijab = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshStandardMaterial({ color: opts.hijabColor ?? pick(rng, [0x8e44ad, 0x2e86c1, 0xc0392b, 0x27ae60, 0x333333]), roughness: 0.95 }));
    hijab.position.y = 1.68; group.add(hijab);
  } else if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: opts.capColor ?? pick(rng, [0x222222, 0xc0392b, 0x2e86c1, 0xf1c40f]), roughness: 0.9 }));
    cap.position.y = 1.72; group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.14), cap.material);
    brim.position.set(0, 1.72, 0.22); group.add(brim);
  } else if (opts.bun) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 }));
    bun.position.set(0, 1.88, -0.12); group.add(bun);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      bun.material);
    hair.position.y = 1.68; group.add(hair);
  } else if (rng() < 0.5) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 }));
    hair.position.y = 1.68; group.add(hair);
  }
  if (opts.ojol) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1faa59, roughness: 0.4 }));
    helmet.position.y = 1.7; group.add(helmet);
  }
  if (opts.backpack) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.16),
      new THREE.MeshStandardMaterial({ color: pick(rng, [0xc0392b, 0x2e86c1, 0x27ae60]), roughness: 0.9 }));
    pack.position.set(0, 1.1, -0.3); group.add(pack);
  }

  // Arms: shoulder pivots so they can swing, punch and dip on reload.
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.32 * wScale, 1.38, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.44, 4, 8), shirtMat);
    arm.position.y = -0.28; arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
    hand.position.y = -0.56; pivot.add(hand);
    group.add(pivot);
    return pivot;
  }
  // Legs: thigh pivot at the hip, shin pivot at the knee, so knees bend.
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.82, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 8), trouserMat);
    thigh.position.y = -0.22; thigh.castShadow = true;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 8), trouserMat);
    shin.position.y = -0.2; shin.castShadow = true;
    knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
    shoe.position.set(0, -0.42, 0.05); knee.add(shoe);
    hip.add(knee);
    group.add(hip);
    return { hip, knee };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  const legL = makeLeg(-1), legR = makeLeg(1);
  group.scale.setScalar(hScale);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return {
    group, parts: {
      body: group, torso, head, armL, armR,
      legL: legL.hip, legR: legR.hip, kneeL: legL.knee, kneeR: legR.knee,
    },
  };
}

// Procedural walk: legs counter-swing, knees bend on the swing-through,
// arms swing opposite the legs, torso bobs and leans forward when running,
// breathes when idle. `phase` advances with distance walked; `blend` (0..1)
// is the walk->run blend — speed and stride follow it, never snap.
export function animateWalk(parts, phase, speed01, dt, opts = {}) {
  const swing = 0.55 * speed01 + 0.15;
  const s = Math.sin(phase), c = Math.sin(phase + Math.PI);
  parts.legL.rotation.x = s * swing;
  parts.legR.rotation.x = c * swing;
  parts.kneeL.rotation.x = Math.max(0, -c) * swing * 1.4;
  parts.kneeR.rotation.x = Math.max(0, -s) * swing * 1.4;
  const armSwing = opts.hurt ? -2.1 : (opts.aim ? -1.2 : s * swing * 0.8);
  parts.armL.rotation.x = opts.hurt ? -2.1 : c * swing * 0.8;
  parts.armR.rotation.x = armSwing;
  parts.armL.rotation.z = opts.hurt ? 0.5 : 0.12;
  parts.armR.rotation.z = opts.hurt ? -0.5 : -0.12;
  if (opts.reloadBlend > 0.05) {
    parts.armR.rotation.x = lerp(parts.armR.rotation.x, -0.34, opts.reloadBlend);
    parts.armL.rotation.x = lerp(parts.armL.rotation.x, -0.9, opts.reloadBlend);
  }
  if (opts.punchBlend > 0.05) {
    parts.armR.rotation.x = lerp(parts.armR.rotation.x, -1.81, opts.punchBlend);
  }
  parts.torso.rotation.x = 0.06 + speed01 * 0.14;
  parts.torso.position.y = 1.08 + Math.abs(Math.cos(phase)) * 0.045 * speed01 + Math.sin(performance.now() * 0.0016) * 0.008;
  parts.head.rotation.x = -0.04 - speed01 * 0.08;
}

// Mara Voss: 27, back in Jakarta to save her brother's bengkel. Teal jacket,
// hair in a bun, lipstick and lashes — the one face the player will know.
export function createPlayer(scene, rng) {
  const built = buildPersonMesh({
    rng, skin: 0xd9a066, shirt: 0x1a7a6a, trousers: 0x2c3e50,
    bun: true, lipstick: true, lashes: true, backpack: true, height: 1.0,
  });
  built.group.position.set(0, 0, 90);
  scene.add(built.group);
  return {
    mesh: built.group, parts: built.parts,
    pos: built.group.position, heading: Math.PI, speed: 0,
    hp: 100, cash: 250000, weapon: 'pistol',
    arsenal: { pistol: { mag: 12, reserve: 24 } },
    inCar: null, fireCd: 0, reloadCd: 0, reloadBlend: 0, punchBlend: 0, punchCd: 0,
    walkPhase: 0, hurt: 0, dead: false, wanted: 0,
  };
}

// ------------------------------------------------------------ ammo crates
// 11 crates: 3 named weapon pickups + 8 AMMO boxes. Walking over one adds
// +30 reserve to every owned weapon.
export function createCrates(scene, rng) {
  const defs = [
    { x: -220, z: -90, label: 'SMG', gun: 'smg' },
    { x: 260, z: -260, label: 'SHOTGUN', gun: 'shotgun' },
    { x: -260, z: 180, label: 'SENAPAN', gun: 'rifle' },
    { x: 36, z: 30, label: 'AMMO' }, { x: -60, z: 120, label: 'AMMO' },
    { x: 120, z: -120, label: 'AMMO' }, { x: -180, z: 60, label: 'AMMO' },
    { x: 180, z: 180, label: 'AMMO' }, { x: -40, z: -200, label: 'AMMO' },
    { x: 240, z: 60, label: 'AMMO' }, { x: 80, z: -220, label: 'AMMO' },
  ];
  const crates = [];
  for (const d of defs) {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    const boxM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 0.8 }));
    boxM.position.y = 0.4; boxM.castShadow = true;
    g.add(boxM);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1a4a22 }));
    lid.position.y = 0.85; g.add(lid);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    label.position.set(0, 1.3, 0); label.rotation.y = Math.PI / 4;
    // simple text via canvas is overkill here: a gold band reads as a label
    g.add(label);
    scene.add(g);
    crates.push({ ...d, group: g, taken: false, respawn: 0, gun: d.gun || null });
  }
  return crates;
}

// ------------------------------------------------------------ pedestrians
// 64 peds: 36 roam the city, 28 form the Monas crowd (they drift stall to
// stall and pause to browse). 6 of the roamers are ojol hijau riders.
export function spawnPeds(scene, rng, city) {
  const peds = [];
  const stallSpots = city.stalls.map((s) => ({ x: s.x, z: s.z }));
  for (let i = 0; i < 64; i++) {
    const crowd = i >= 36;
    const ojol = !crowd && i < 6;
    const opts = { rng };
    if (ojol) opts.ojol = true;
    else if (rng() < 0.35) { opts.hijab = true; }
    else if (rng() < 0.25) opts.cap = true;
    else if (rng() < 0.15) opts.glasses = true;
    else if (rng() < 0.2) opts.moustache = true;
    if (rng() < 0.2) opts.backpack = true;
    const built = buildPersonMesh(opts);
    let x, z;
    if (crowd) { x = range(rng, -42, 42); z = range(rng, -42, 42); }
    else { x = range(rng, -300, 300); z = range(rng, -300, 300); }
    built.group.position.set(x, 0, z);
    built.group.rotation.y = range(rng, 0, Math.PI * 2);
    scene.add(built.group);
    peds.push({
      mesh: built.group, parts: built.parts,
      heading: built.group.rotation.y, speed: 0,
      targetX: x, targetZ: z, pause: range(rng, 0, 4),
      hurt: 0, fleeing: 0, crowd, ojol,
      walkPhase: range(rng, 0, 6), walkSpeed: range(rng, 1.2, 2.2),
      stallSpots,
    });
  }
  return peds;
}

function pedNewTarget(ped, rng) {
  if (ped.crowd && rng() < 0.65 && ped.stallSpots.length) {
    const s = pick(rng, ped.stallSpots);
    ped.targetX = s.x + range(rng, -3, 3);
    ped.targetZ = s.z + range(rng, -3, 3);
  } else if (ped.crowd) {
    ped.targetX = range(rng, -42, 42);
    ped.targetZ = range(rng, -42, 42);
  } else {
    ped.targetX = clamp(ped.mesh.position.x + range(rng, -90, 90), -320, 320);
    ped.targetZ = clamp(ped.mesh.position.z + range(rng, -90, 90), -320, 320);
  }
}

export function updatePeds(peds, dt, colliders, now, rng, playerPos) {
  for (const p of peds) {
    p.hurt = Math.max(0, p.hurt - dt * 0.5); // flinch lasts ~1 s, readable on screen
    p.fleeing = Math.max(0, p.fleeing - dt);
    if (p.hurt > 0) {
      // flinch: hands up, body back, frozen in place
      animateWalk(p.parts, p.walkPhase, 0, dt, { hurt: true });
      continue;
    }
    let tx = p.targetX, tz = p.targetZ, speed = p.walkSpeed;
    if (p.fleeing > 0 && playerPos) {
      const dx = p.mesh.position.x - playerPos.x, dz = p.mesh.position.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.mesh.position.x + (dx / d) * 30;
      tz = p.mesh.position.z + (dz / d) * 30;
      speed = 5.5;
    }
    if (p.pause > 0) {
      p.pause -= dt;
      animateWalk(p.parts, p.walkPhase, 0, dt, {});
      if (p.pause <= 0) pedNewTarget(p, rng);
      continue;
    }
    const dx = tx - p.mesh.position.x, dz = tz - p.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      p.pause = p.crowd ? range(rng, 3, 7) : range(rng, 1, 4);
      continue;
    }
    const want = Math.atan2(dx, dz);
    let dh = want - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
    p.mesh.rotation.y = p.heading;
    const step = speed * dt;
    const res = resolveCircleOut(p.mesh.position.x, p.mesh.position.z, 0.45,
      Math.sin(p.heading) * step, Math.cos(p.heading) * step, colliders);
    p.mesh.position.x = res.x; p.mesh.position.z = res.z;
    if (res.hit) { pedNewTarget(p, rng); continue; }
    p.walkPhase += dt * speed * 3.2;
    animateWalk(p.parts, p.walkPhase, clamp(speed / 5.5, 0.25, 1), dt, {});
  }
}
