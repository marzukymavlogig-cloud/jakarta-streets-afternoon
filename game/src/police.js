// police.js — the wanted system: heat 0-100, stars 0-5, PD cars that ram,
// a helicopter at 3+ stars, and busted/wasted. Story jobs are forgiving:
// heat gains x0.6, at most 2 cops, slower rams, a longer bust timer.
import * as THREE from 'three';
import { clamp, lerp, rand, pick } from './util.js';
import { makeCar } from './vehicles.js';

export function wantedFromHeat(heat) {
  if (heat >= 90) return 5;
  if (heat >= 70) return 4;
  if (heat >= 55) return 3;
  if (heat >= 35) return 2;
  if (heat >= 15) return 1;
  return 0;
}

export function makePolice(G) {
  const pol = {
    heat: 0,
    wanted: 0,
    cars: [],
    heli: null,
    spawnCd: 0,
    storyMode: false,
    frozen: false,
    bustTimer: 0,
    flashT: 0,
  };
  // Bound so other modules can call G.police.addHeat(G, n).
  pol.addHeat = (g, n) => addHeat(g, n);
  return pol;
}

export function addHeat(G, n) {
  const pol = G.police;
  const gain = pol.storyMode ? n * 0.6 : n;
  pol.heat = clamp(pol.heat + gain, 0, 100);
  pol.wanted = wantedFromHeat(pol.heat);
}

function spawnPdCar(G) {
  const p = G.player;
  const angle = rand(Math.PI * 2);
  const x = clamp(p.pos.x + Math.cos(angle) * 45, -330, 330);
  const z = clamp(p.pos.z + Math.sin(angle) * 45, -330, 330);
  const car = makeCar(G, 'police', {
    x, z, heading: Math.atan2(p.pos.x - x, p.pos.z - z),
    name: 'Polisi Jakarta',
  });
  car.maxSpeed = G.police.storyMode ? car.maxSpeed * 0.75 : car.maxSpeed;
  G.police.cars.push(car);
  G.hud.toast('Polisi datang!');
  G.audio.sfx('siren');
}

export function ensureHeli(G) {
  if (!G.police.heli) spawnHeli(G);
}

function spawnHeli(G) {
  const heliGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.8, 2.2), bodyMat);
  heliGroup.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 0.6), bodyMat);
  tail.position.set(-3.8, 0.3, 0);
  heliGroup.add(tail);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 2), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.1, metalness: 0.8 }));
  glass.position.set(2.2, 0.2, 0);
  heliGroup.add(glass);
  const rotor = new THREE.Group();
  rotor.position.y = 1.4;
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.4), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.4, 24),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.1;
  rotor.add(disc);
  heliGroup.add(rotor);
  const skid = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x111111 }));
  skid.position.y = -1.1;
  heliGroup.add(skid);
  heliGroup.position.set(G.player.pos.x + 20, 55, G.player.pos.z + 20);
  G.scene.add(heliGroup);
  const spot = new THREE.PointLight(0xffffff, 60, 40);
  spot.position.y = -2;
  heliGroup.add(spot);
  G.police.heli = { mesh: heliGroup, rotor, angle: 0, swayT: 0 };
  G.hud.toast('Helikopter polisi di atasmu!');
}

export function updatePolice(G, dt) {
  const pol = G.police;
  const p = G.player;
  if (pol.frozen) {
    // Staged screenshots: the heli still spins, but nobody moves.
    if (pol.heli) pol.heli.rotor.rotation.y += dt * 18;
    return;
  }
  // Heat cools over time; twice as fast during story jobs.
  const cool = (pol.storyMode ? 2.4 : 1.2) * dt;
  pol.heat = clamp(pol.heat - cool, 0, 100);
  const prevWanted = pol.wanted;
  pol.wanted = wantedFromHeat(pol.heat);
  if (pol.wanted < prevWanted && pol.wanted < 3 && pol.heli) {
    G.scene.remove(pol.heli.mesh);
    pol.heli = null;
  }
  // Spawn PD cars.
  const maxCops = pol.storyMode ? 2 : 4;
  pol.spawnCd -= dt;
  if (pol.wanted >= 1 && pol.cars.length < Math.min(maxCops, pol.wanted) && pol.spawnCd <= 0) {
    spawnPdCar(G);
    pol.spawnCd = 6;
  }
  // PD cars chase and ram the player.
  const target = p.inCar ? p.inCar.mesh.position : p.pos;
  for (const car of [...pol.cars]) {
    const dx = target.x - car.mesh.position.x;
    const dz = target.z - car.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let dh = desired - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
    car.speed = lerp(car.speed, Math.min(car.maxSpeed, d > 30 ? car.maxSpeed : car.maxSpeed * 0.8), Math.min(1, dt * 2));
    car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
    car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.rotation.y = car.heading;
    // Suspension bob + light-bar flash.
    const t = performance.now() / 1000;
    car.mesh.position.y = Math.sin(t * 11 + car.bobPhase) * 0.02;
    pol.flashT += dt;
    const on = Math.floor(pol.flashT * 4) % 2 === 0;
    if (car.mesh.userData.lightBar) {
      car.mesh.userData.lightBar[0].material.color.setHex(on ? 0xff2222 : 0x441111);
      car.mesh.userData.lightBar[1].material.color.setHex(on ? 0x2244ff : 0x111144);
    }
    if (d < 3.2) {
      // Ram!
      if (p.inCar) {
        p.inCar.hp -= 2;
        p.inCar.speed *= 0.6;
        G.shake = 0.35;
        G.audio.sfx('thud');
      } else if (p.hurtCd <= 0) {
        p.hp -= pol.storyMode ? 4 : 8;
        p.hurtCd = 0.8;
        G.shake = 0.4;
        G.audio.sfx('thud');
        G.hud.toast('Polisi menangkapmu!');
      }
      car.speed *= 0.4;
    }
    if (d > 400) {
      G.scene.remove(car.mesh);
      pol.cars.splice(pol.cars.indexOf(car), 1);
    }
  }
  // Helicopter at 3+ stars (heat >= 55).
  if (pol.wanted >= 3 && !pol.heli) spawnHeli(G);
  if (pol.heli) {
    const h = pol.heli;
    h.swayT += dt;
    h.angle += dt * 0.25;
    const hx = target.x + Math.cos(h.angle) * 24;
    const hz = target.z + Math.sin(h.angle) * 24;
    h.mesh.position.x = lerp(h.mesh.position.x, hx, Math.min(1, dt * 1.5));
    h.mesh.position.z = lerp(h.mesh.position.z, hz, Math.min(1, dt * 1.5));
    h.mesh.position.y = 55 + Math.sin(h.swayT * 1.4) * 0.6;
    h.mesh.rotation.y = Math.atan2(target.x - h.mesh.position.x, target.z - h.mesh.position.z);
    h.rotor.rotation.y += dt * 18;
    // Banks into its orbit.
    h.mesh.rotation.z = lerp(h.mesh.rotation.z, -0.14, Math.min(1, dt * 2));
  }
  // Busted: a cop stands next to Mara on foot for the bust timer.
  if (!p.inCar && pol.wanted >= 1) {
    const near = pol.cars.some((c) => Math.hypot(c.mesh.position.x - p.pos.x, c.mesh.position.z - p.pos.z) < 4);
    if (near) {
      pol.bustTimer += dt;
      const limit = pol.storyMode ? 4 : 2.5;
      if (pol.bustTimer > limit) {
        busted(G);
        return;
      }
    } else pol.bustTimer = 0;
  } else pol.bustTimer = 0;
  if (p.hp <= 0) wasted(G);
}

function busted(G) {
  const p = G.player;
  const fine = 150000;
  p.cash = Math.max(0, p.cash - fine);
  G.police.heat = 0;
  G.police.wanted = 0;
  for (const c of G.police.cars) G.scene.remove(c.mesh);
  G.police.cars = [];
  if (G.police.heli) { G.scene.remove(G.police.heli.mesh); G.police.heli = null; }
  if (p.inCar) { p.inCar = null; p.mesh.visible = true; }
  p.pos.set(-20, 0, 60);
  p.mesh.position.copy(p.pos);
  p.hp = 100;
  G.mode = 'busted';
  G.hud.showScreen('busted');
  G.hud.toast(`Tertangkap! Denda Rp150.000`);
  G.audio.sfx('busted');
}

function wasted(G) {
  const p = G.player;
  p.cash = Math.max(0, p.cash - 100000);
  G.police.heat = 0;
  G.police.wanted = 0;
  if (p.inCar) { p.inCar = null; p.mesh.visible = true; }
  p.pos.set(-20, 0, 60);
  p.mesh.position.copy(p.pos);
  p.hp = 100;
  G.mode = 'wasted';
  G.hud.showScreen('wasted');
  G.hud.toast('Kamu pingsan. Biaya rumah sakit Rp100.000');
  G.audio.sfx('wasted');
}
