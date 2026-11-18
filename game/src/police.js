// police.js — the wanted system. Heat 0–100 maps to 0–5 stars; crimes add
// heat, it cools over time, and PD cars chase and ram while a helicopter
// circles at 3+ stars. Story jobs are deliberately forgiving: heat gains
// x0.6, at most 2 cops, slower rams, a longer bust timer. Busted costs a
// fine; wasted costs cash and a hospital trip.
import * as THREE from 'three';
import { clamp, lerp, damp, pick, range, resolveCircleOut, dist2 } from './util.js';
import { buildCar } from './vehicles.js';

export function createPolice(scene, rng) {
  return {
    heat: 0, wanted: 0, spawnCd: 0, bustTimer: 0,
    cops: [], heli: null, storyMode: false, frozen: false,
    scene, rng,
  };
}

export function wantedFromHeat(heat) {
  return clamp(Math.floor(heat / 20), 0, 5);
}

export function addHeat(police, amount) {
  if (police.storyMode) amount *= 0.6;
  police.heat = clamp(police.heat + amount, 0, 100);
  police.wanted = wantedFromHeat(police.heat);
}

export function spawnCopForShot(police, x, z) {
  const cop = makeCopCar(police, x, z);
  cop.maxSpeed = 22;
  return cop;
}

function makeCopCar(police, x, z) {
  const car = buildCar('sedan', 0xf2f2f2, police.rng, { heading: 0 });
  // black doors + light bar + POLISI sign
  const doors = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.4, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
  doors.position.y = 0.62; car.body.add(doors);
  const bar = new THREE.Group();
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  red.position.x = -0.3; bar.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
  blue.position.x = 0.3; bar.add(blue);
  bar.position.y = 1.55;
  car.body.add(bar);
  car.lightBar = bar;
  car.lightRed = red; car.lightBlue = blue;
  car.mesh.position.set(x, 0, z);
  car.maxSpeed = police.storyMode ? 19 : 25;
  car.isCop = true;
  police.scene.add(car.mesh);
  return car;
}

function makeHeli(police, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.4, metalness: 0.4 }));
  body.rotation.z = Math.PI / 2; body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.1, metalness: 0.7 }));
  glass.position.set(1.6, -0.2, 0); g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2a4a6a }));
  tail.position.set(-2.6, 0.3, 0); g.add(tail);
  const rotor = new THREE.Group();
  rotor.position.y = 1.0;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rotor.add(blade);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rotor.add(blade2);
  const blur = new THREE.Mesh(new THREE.CircleGeometry(4.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2; blur.position.y = 1.05;
  g.add(blur);
  g.add(rotor);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  skidL.position.set(0, -1.2, 0.7); g.add(skidL);
  const skidR = skidL.clone(); skidR.position.z = -0.7; g.add(skidR);
  g.position.set(x, 55, z);
  police.scene.add(g);
  return { mesh: g, rotor, blur, angle: 0 };
}

export function updatePolice(police, G, dt, now) {
  if (police.frozen) return;
  const player = G.player;
  // heat cools; twice as fast during a story job
  police.heat = Math.max(0, police.heat - dt * (police.storyMode ? 2.4 : 1.2));
  police.wanted = wantedFromHeat(police.heat);
  player.wanted = police.wanted;

  // --- spawn cops up to the cap
  const cap = police.storyMode ? 2 : Math.min(1 + police.wanted, 4);
  police.spawnCd -= dt;
  if (police.wanted > 0 && police.cops.length < cap && police.spawnCd <= 0) {
    police.spawnCd = 4;
    const a = range(police.rng, 0, Math.PI * 2);
    const cop = makeCopCar(police,
      player.pos.x + Math.sin(a) * 55, player.pos.z + Math.cos(a) * 55);
    police.cops.push(cop);
  }
  // --- heli at 3+ stars; once up it stays until the heat is fully gone.
  // The 55 threshold (not 60) gives the spawn a frame of grace while the
  // heat is cooling from a fresh 3-star bust.
  if (police.heat >= 55 && !police.heli) police.heli = makeHeli(police, player.pos.x, player.pos.z - 40);
  if (police.wanted === 0 && police.heli) {
    police.scene.remove(police.heli.mesh);
    police.heli = null;
  }

  // --- cop behaviour: chase and ram the player, or run them down on foot
  const px = player.inCar ? player.inCar.mesh.position.x : player.pos.x;
  const pz = player.inCar ? player.inCar.mesh.position.z : player.pos.z;
  for (let i = police.cops.length - 1; i >= 0; i--) {
    const cop = police.cops[i];
    const dx = px - cop.mesh.position.x, dz = pz - cop.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let dh = want - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += clamp(dh, -1.8 * dt, 1.8 * dt);
    cop.mesh.rotation.y = cop.heading;
    const speed = police.storyMode ? cop.maxSpeed * 0.75 : cop.maxSpeed;
    const step = clamp(d * 0.5, 0, speed) * dt;
    const res = resolveCircleOut(cop.mesh.position.x, cop.mesh.position.z, 1.7,
      Math.sin(cop.heading) * step, Math.cos(cop.heading) * step, G.city.colliders);
    cop.mesh.position.x = res.x; cop.mesh.position.z = res.z;
    cop.speed = step / Math.max(dt, 1e-6);
    cop.body.rotation.z = damp(cop.body.rotation.z, clamp(-dh * 0.05, -0.05, 0.05), 4, dt);
    // light bar strobes
    const on = Math.floor(now * 6) % 2 === 0;
    cop.lightRed.material.color.setHex(on ? 0xff2222 : 0x550000);
    cop.lightBlue.material.color.setHex(on ? 0x111144 : 0x2244ff);
    // ram: touching the player's car damages it and adds a little heat
    if (player.inCar && d < 3.4) {
      cop.bumpCd = (cop.bumpCd || 0) - dt;
      if (cop.bumpCd <= 0) {
        cop.bumpCd = 1.2;
        player.inCar.hp = Math.max(0, player.inCar.hp - (police.storyMode ? 4 : 8));
        G.shake = Math.max(G.shake, 0.5);
        if (G.audio) G.audio.thud();
      }
    }
    // on foot: a cop close by starts the bust timer
    if (!player.inCar && d < 3.2) {
      police.bustTimer += dt;
      if (G.hud) G.hud.toast('Polisi mengejar! Lari!', 'warn');
    } else {
      police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
    }
    // despawn far-away cops once the heat is gone
    if (police.wanted === 0 && d > 120) {
      police.scene.remove(cop.mesh);
      police.cops.splice(i, 1);
    }
  }
  if (police.wanted === 0) {
    for (const cop of police.cops) police.scene.remove(cop.mesh);
    police.cops.length = 0;
  }

  // --- heli: circle the player, rotor spinning, body swaying and banking
  if (police.heli) {
    const h = police.heli;
    h.angle += dt * 0.35;
    const r = 34;
    h.mesh.position.set(
      px + Math.sin(h.angle) * r,
      55 + Math.sin(now * 0.8) * 0.9,
      pz + Math.cos(h.angle) * r);
    h.mesh.rotation.y = h.angle + Math.PI / 2;
    h.mesh.rotation.z = lerp(h.mesh.rotation.z, -0.14, dt * 0.8);
    h.rotor.rotation.y += dt * 28;
    h.blur.rotation.y += dt * 3;
  }

  // --- busted / wasted
  const bustLimit = police.storyMode ? 4 : 2.5;
  if (police.bustTimer > bustLimit && !player.inCar) {
    police.bustTimer = 0;
    G.busted = true;
  }
  if (player.hp <= 0 && !player.dead) {
    player.dead = true;
    G.wasted = true;
  }
}
