// player.js — Mara and every other human in Jakarta: smooth capsule
// people with real faces, walk/run blending, the CJ-style arsenal, the
// staged 0.55 s enter/exit-car walk, punching, and ammo crates.
import * as THREE from 'three';
import { clamp, lerp, rand, pick, addFace, resolveCircleOut, dist2D } from './util.js';

export const SKIN_TONES = [0xc98e6b, 0xb57748, 0x8a5a34, 0xd9a986, 0x6e4426, 0xe8b98f, 0xa06a42, 0x7c4f2c];
export const SHIRT_COLORS = [0x2e6fb0, 0xc23b3b, 0xe8a13c, 0x7a4fa3, 0x3aa7a3, 0xd9577e, 0x8a8f96, 0x4a7c2e, 0xb03060, 0x2b2b2b, 0xf2e6c9, 0x5b8dd9, 0xe05e2b];
export const PANTS_COLORS = [0x2b3a4a, 0x3a3a3a, 0x5b4636, 0x1f2a24, 0x4a4a55, 0x6b3f2a, 0x2e4a6b, 0x333333];

// The arsenal, CJ-style. fists are always owned; the rest come from crates.
export const WEAPONS = {
  fists: { name: 'TINJU', mag: Infinity, reserve: Infinity, damage: 12, rate: 0.45, range: 2.2, auto: false, sound: 'punch' },
  pistol: { name: 'PISTOL', mag: 12, reserve: 24, damage: 25, rate: 0.22, range: 55, auto: false, sound: 'pistol' },
  smg: { name: 'SMG', mag: 30, reserve: 60, damage: 14, rate: 0.09, range: 45, auto: true, sound: 'smg' },
  shotgun: { name: 'SHOTGUN', mag: 6, reserve: 12, damage: 13, rate: 0.85, range: 26, auto: false, pellets: 6, sound: 'shotgun' },
  rifle: { name: 'SENAPAN', mag: 30, reserve: 60, damage: 34, rate: 0.13, range: 90, auto: true, sound: 'rifle' },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

function capsuleMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
}

// Build one smooth low-poly person. Capsule torso, egg head, thigh+shin
// legs so knees bend, counter-swinging arms. opts: skin, shirt, pants,
// hijab, cap, bun, glasses, moustache, lipstick, lashes, backpack, ojol,
// scale, build ('slim'|'broad').
// Returns { group, parts } where parts.body is the root group.
export function buildPersonMesh(opts = {}) {
  const skin = opts.skin ?? pick(SKIN_TONES);
  const shirt = opts.shirt ?? pick(SHIRT_COLORS);
  const pants = opts.pants ?? pick(PANTS_COLORS);
  const scale = opts.scale ?? rand(0.94, 1.06);
  const broad = opts.build === 'broad' ? 1.18 : opts.build === 'slim' ? 0.88 : 1;
  const g = new THREE.Group();
  const parts = { body: g };
  const skinMat = capsuleMat(skin);
  const shirtMat = capsuleMat(shirt);
  const pantsMat = capsuleMat(pants);
  const shoeMat = capsuleMat(0x1c1c1c);

  // Torso (capsule) + hips.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21 * broad, 0.42, 6, 12), shirtMat);
  torso.position.y = 1.02;
  torso.scale.x = broad;
  g.add(torso);
  parts.torso = torso;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36 * broad, 0.16, 0.22), pantsMat);
  hips.position.y = 0.72;
  g.add(hips);

  // Head group at neck height; face on +z.
  const head = new THREE.Group();
  head.position.y = 1.52;
  g.add(head);
  parts.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 14), skinMat);
  skull.scale.set(0.92, 1.08, 0.96);
  head.add(skull);
  addFace(head, opts);
  // Hair / headwear.
  if (opts.hijab) {
    const hijabMat = capsuleMat(opts.hijabColor ?? pick([0x8a2f5c, 0x2f5c8a, 0x3a3a3a, 0x7a4a2b, 0x4a6b3a]));
    const hijab = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hijabMat);
    hijab.position.y = 0.02;
    head.add(hijab);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.34, 12, 1, true), hijabMat);
    drape.position.y = -0.14;
    head.add(drape);
  } else if (opts.cap) {
    const capMat = capsuleMat(opts.capColor ?? pick([0xc23b3b, 0x2e6fb0, 0x222222, 0xe8a13c]));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
    cap.position.y = 0.03;
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12), capMat);
    brim.position.set(0, 0.07, 0.17);
    head.add(brim);
  } else if (opts.ojol) {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      capsuleMat(0x1faa59));
    helm.position.y = 0.02;
    head.add(helm);
  } else {
    const hairMat = capsuleMat(opts.hairColor ?? pick([0x1a1210, 0x2b1a10, 0x3a2a1a, 0x111111]));
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 0.035;
    head.add(hair);
    if (opts.bun) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), hairMat);
      bun.position.set(0, 0.16, -0.1);
      head.add(bun);
    }
  }
  if (opts.backpack) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14),
      capsuleMat(pick([0x8a2f2f, 0x2f4a8a, 0x3a5c2f, 0x555555])));
    pack.position.set(0, 1.05, -0.26);
    g.add(pack);
  }

  // Arms: shoulder pivots so they swing; forearm is a child capsule.
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.26 * broad, 1.28, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), shirtMat);
    upper.position.y = -0.18;
    pivot.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    hand.position.y = -0.38;
    pivot.add(hand);
    g.add(pivot);
    return pivot;
  }
  parts.armL = makeArm(-1);
  parts.armR = makeArm(1);

  // Legs: thigh pivot at the hip, shin pivot at the knee — knees bend.
  function makeLeg(side) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.11, 0.68, 0);
    const thighMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 8), pantsMat);
    thighMesh.position.y = -0.2;
    thigh.add(thighMesh);
    const shin = new THREE.Group();
    shin.position.y = -0.38;
    const shinMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), pantsMat);
    shinMesh.position.y = -0.18;
    shin.add(shinMesh);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), shoeMat);
    shoe.position.set(0, -0.38, 0.04);
    shin.add(shoe);
    thigh.add(shin);
    g.add(thigh);
    return { thigh, shin };
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  parts.legL = legL.thigh; parts.legR = legR.thigh;
  parts.shinL = legL.shin; parts.shinR = legR.shin;

  g.scale.setScalar(scale);
  // Only the torso casts a shadow: 81 people x ~26 meshes would otherwise
  // triple the shadow pass and tank SwiftShader to under 1 fps.
  torso.castShadow = true;
  return { group: g, parts };
}

// Procedural walk/run: legs counter-swing, knees bend on the swing-through,
// arms oppose the legs, torso bobs and leans forward with speed. `phase`
// advances with distance so the cycle never snaps when speed changes.
export function animateWalk(parts, speed, dt, state) {
  const moving = Math.min(1, speed / 5);
  state.phase = (state.phase || 0) + dt * (2.2 + speed * 1.35);
  const ph = state.phase;
  const stride = 0.35 + Math.min(0.55, speed * 0.06);
  const s = Math.sin(ph) * stride * moving;
  const c = Math.cos(ph) * stride * moving;
  parts.legL.rotation.x = s;
  parts.legR.rotation.x = -s;
  parts.shinL.rotation.x = Math.max(0, -c) * 1.4 * moving;
  parts.shinR.rotation.x = Math.max(0, c) * 1.4 * moving;
  parts.armL.rotation.x = -s * 0.85;
  parts.armR.rotation.x = s * 0.85;
  // Breathing idle + forward lean when running.
  const t = performance.now() / 1000;
  parts.torso.position.y = 1.02 + Math.abs(Math.cos(ph)) * 0.035 * moving + Math.sin(t * 2) * 0.006;
  parts.body.rotation.x = Math.min(0.22, speed * 0.018) * moving;
}

// --- The player -----------------------------------------------------------
export function makePlayer(G) {
  const { group, parts } = buildPersonMesh({
    skin: 0xc98e6b, shirt: 0x8a2f2f, pants: 0x2b3a4a,
    bun: true, lipstick: true, lashes: true, build: 'slim', scale: 1.0,
  });
  G.scene.add(group);
  const player = {
    pos: new THREE.Vector3(-132, 0, -128),
    heading: Math.PI * 0.75,
    speed: 0,
    walkPhase: { phase: 0 },
    mesh: group,
    parts,
    cash: 250000,
    hp: 100,
    weapon: 'pistol',
    arsenal: { pistol: { mag: 12, reserve: 24 } },
    fireCd: 0, reloadCd: 0, punchCd: 0,
    punchBlend: 0, reloadBlend: 0, aimBlend: 0,
    inCar: null,
    hurtCd: 0,
    muzzle: null,
  };
  group.position.copy(player.pos);
  group.rotation.y = player.heading;
  return player;
}

export function switchWeapon(G, name) {
  const p = G.player;
  if (name === 'fists' || p.arsenal[name]) {
    p.weapon = name;
    p.reloadCd = 0;
    G.hud?.toast?.(`${WEAPONS[name].name}`);
    return true;
  }
  return false;
}

export function reloadWeapon(G) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  const slot = p.arsenal[p.weapon];
  if (!w || !slot || p.reloadCd > 0) return false;
  const need = w.mag - slot.mag;
  if (need <= 0 || slot.reserve <= 0) return false;
  p.reloadCd = 0.8;
  p.reloadBlend = 0;
  return true;
}

function finishReload(G) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  const slot = p.arsenal[p.weapon];
  if (!w || !slot) return;
  const take = Math.min(w.mag - slot.mag, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
}

// Fire the current weapon. Returns true if a shot went off.
export function fireWeapon(G) {
  const p = G.player;
  if (p.fireCd > 0 || p.reloadCd > 0 || p.punchCd > 0) return false;
  const w = WEAPONS[p.weapon];
  if (p.weapon === 'fists') {
    p.punchCd = 0.7;
    p.punchBlend = 0;
    punchHit(G);
    G.audio?.sfx?.('punch');
    return true;
  }
  const slot = p.arsenal[p.weapon];
  if (!slot || slot.mag <= 0) {
    G.audio?.sfx?.('dryfire');
    p.fireCd = 0.3;
    return false;
  }
  slot.mag -= 1;
  p.fireCd = w.rate;
  p.muzzleT = 0.07;
  G.audio?.sfx?.(w.sound);
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) shootHit(G, w);
  if (!p.inCar) G.police?.addHeat?.(G, 2);
  return true;
}

function forwardOf(G) {
  const p = G.player;
  if (p.inCar) return { x: Math.sin(p.inCar.heading), z: Math.cos(p.inCar.heading) };
  return { x: Math.sin(p.heading), z: Math.cos(p.heading) };
}

function shootHit(G, w) {
  const p = G.player;
  const f = forwardOf(G);
  const ox = p.inCar ? p.inCar.mesh.position.x : p.pos.x;
  const oz = p.inCar ? p.inCar.mesh.position.z : p.pos.z;
  let best = null, bestD = w.range;
  const targets = [...G.peds, ...G.police.cars.map((c) => ({ mesh: c.mesh, isCop: true, hp: 100 }))];
  for (const t of targets) {
    const dx = t.mesh.position.x - ox;
    const dz = t.mesh.position.z - oz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > w.range || d < 0.5) continue;
    const dot = (dx * f.x + dz * f.z) / d;
    if (dot < 0.86) continue;
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best) {
    if (best.isCop) {
      G.police.addHeat(G, 6);
    } else {
      best.hurt = 0.5;
      best.fleeing = 6;
      best.hp = (best.hp ?? 100) - w.damage;
      G.police.addHeat(G, 4);
    }
    G.effects?.sparks?.(ox + f.x * bestD, 1.2, oz + f.z * bestD);
  }
}

function punchHit(G) {
  const p = G.player;
  for (const ped of G.peds) {
    const d = dist2D(p.pos.x, p.pos.z, ped.mesh.position.x, ped.mesh.position.z);
    if (d < 2.2) {
      ped.hurt = 0.5;
      ped.fleeing = 5;
      ped.hp = (ped.hp ?? 100) - 12;
      G.police.addHeat(G, 2);
      return;
    }
  }
}

// --- Per-frame player update ----------------------------------------------
export function updatePlayer(G, dt, input) {
  const p = G.player;
  const keys = input.keys;
  p.fireCd = Math.max(0, p.fireCd - dt);
  const reloading = p.reloadCd > 0;
  p.reloadCd = Math.max(0, p.reloadCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  if (reloading && p.reloadCd === 0) finishReload(G);
  // Reload completes when the timer runs out.
  if (p.reloadCd > 0) {
    p.reloadBlend = lerp(p.reloadBlend, 1, Math.min(1, dt * 6));
  } else if (p.reloadBlend > 0) {
    p.reloadBlend = lerp(p.reloadBlend, 0, Math.min(1, dt * 6));
  }
  if (p.punchCd > 0) p.punchBlend = lerp(p.punchBlend, 1, Math.min(1, dt * 10));
  else p.punchBlend = lerp(p.punchBlend, 0, Math.min(1, dt * 4));

  // Muzzle flash fades.
  if (p.muzzleT > 0) {
    p.muzzleT -= dt;
    if (p.muzzle) p.muzzle.visible = p.muzzleT > 0;
  }

  // --- Enter / exit car staging (0.55 s walk to the door) ---
  if (G.enterAnim) {
    const a = G.enterAnim;
    a.t += dt;
    const k = clamp(a.t / a.dur, 0, 1);
    p.pos.x = lerp(a.from.x, a.to.x, k);
    p.pos.z = lerp(a.from.z, a.to.z, k);
    p.mesh.position.set(p.pos.x, 0, p.pos.z);
    p.heading = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
    p.mesh.rotation.y = p.heading;
    animateWalk(p.parts, 3, dt, p.walkPhase);
    if (k >= 1) {
      if (a.kind === 'enter') {
        p.inCar = a.car;
        p.mesh.visible = false;
        p.pos.set(a.car.mesh.position.x, 0, a.car.mesh.position.z);
      } else {
        p.inCar = null;
        p.mesh.visible = true;
        p.pos.set(a.to.x, 0, a.to.z);
        p.mesh.position.copy(p.pos);
      }
      G.enterAnim = null;
    }
    return;
  }

  if (p.inCar) {
    // Driving is handled by vehicles.updateCarPhysics; keep Mara hidden.
    p.pos.set(p.inCar.mesh.position.x, 0, p.inCar.mesh.position.z);
    p.heading = p.inCar.heading;
    return;
  }

  // --- On foot ---
  const run = keys['ShiftLeft'] || keys['ShiftRight'];
  const targetSpeed = run ? 9 : 5;
  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyA']) mx -= 1;
  if (keys['KeyD']) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  // Camera-relative movement: forward is where the camera looks.
  const cy = G.camYaw;
  const sin = Math.sin(cy), cos = Math.cos(cy);
  let dx = 0, dz = 0;
  if (moving) {
    dx = sin * mz + cos * mx;
    dz = cos * mz - sin * mx;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    p.heading = Math.atan2(dx, dz);
  }
  p.speed = lerp(p.speed, moving ? targetSpeed : 0, Math.min(1, dt * (moving ? 5 : 8)));
  if (p.speed > 0.05) {
    const nx = p.pos.x + dx * p.speed * dt;
    const nz = p.pos.z + dz * p.speed * dt;
    const before = { x: p.pos.x, z: p.pos.z };
    p.pos.x = nx; p.pos.z = nz;
    const hit = resolveCircleOut(p.pos, 0.55, G.city.colliders);
    if (hit) {
      // Bumped a wall: stop most of the slide, small shake feedback.
      if (Math.abs(p.pos.x - before.x) < 0.01 && Math.abs(p.pos.z - before.z) < 0.01) p.speed *= 0.4;
    }
    p.pos.x = clamp(p.pos.x, -350, 350);
    p.pos.z = clamp(p.pos.z, -350, 350);
  }
  p.mesh.position.set(p.pos.x, 0, p.pos.z);
  p.mesh.rotation.y = p.heading;

  // Pose: walk cycle, punch swing, reload dip, hurt flinch.
  animateWalk(p.parts, p.speed, dt, p.walkPhase);
  const baseArmR = p.parts.armR.rotation.x;
  if (p.punchBlend > 0.05) {
    p.parts.armR.rotation.x = lerp(baseArmR, -1.81, p.punchBlend);
  } else if (p.reloadBlend > 0.05 && p.weapon !== 'fists') {
    p.parts.armR.rotation.x = lerp(baseArmR, -0.34, p.reloadBlend);
    p.parts.armL.rotation.x = lerp(p.parts.armL.rotation.x, -0.5, p.reloadBlend);
  }
  if (p.hurtCd > 0) {
    p.parts.body.rotation.x = 0.25;
  }

  // Ammo crates: walk over one to collect.
  for (const crate of G.crates) {
    if (crate.taken) continue;
    if (dist2D(p.pos.x, p.pos.z, crate.x, crate.z) < 2.5) {
      crate.taken = true;
      crate.mesh.visible = false;
      const give = crate.weapon === 'ammo' ? p.weapon : crate.weapon;
      if (give === 'ammo' || !p.arsenal[give]) {
        if (!p.arsenal.pistol) p.arsenal.pistol = { mag: 12, reserve: 0 };
        p.arsenal[p.weapon].reserve += 30;
      } else {
        if (!p.arsenal[give]) p.arsenal[give] = { mag: WEAPONS[give].mag, reserve: 0 };
        p.arsenal[give].reserve += 30;
        if (give !== 'ammo') p.arsenal[give].mag = WEAPONS[give].mag;
      }
      if (crate.weapon !== 'ammo' && crate.weapon !== p.weapon) {
        p.arsenal[crate.weapon] = { mag: WEAPONS[crate.weapon].mag, reserve: 30 };
        G.hud.toast(`${WEAPONS[crate.weapon].name} didapat! Tekan ${WEAPON_ORDER.indexOf(crate.weapon) + 1}`);
      } else {
        G.hud.toast('+30 amunisi');
      }
      G.audio.sfx('pickup');
    }
  }
}
