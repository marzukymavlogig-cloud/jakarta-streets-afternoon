// police.js — the Solmara PD wanted system: stars, patrol cars that ram
// and box the player in, and a helicopter once the heat reaches three stars.
import * as THREE from 'three';
import { clamp, lerp, angleLerp, angleDiff, dist2D } from './util.js';
import { CITY } from './city.js';
import { buildCarMesh } from './vehicles.js';

export function createPolice(scene) {
  return {
    wanted: 0, heat: 0, // heat 0..100, stars = ceil(heat/20)
    cops: [], heli: null, heliActive: false,
    bustTimer: 0, sirenPhase: 0,
    spawnCd: 0, lastCrimeAt: -999,
  };
}

export function addWanted(police, amount, now) {
  police.heat = clamp(police.heat + amount, 0, 100);
  police.wanted = Math.ceil(police.heat / 20);
  police.lastCrimeAt = now;
}

function spawnCop(scene, police, x, z) {
  const { group, lightBar } = buildCarMesh(0x1a2a44, 'sedan', true);
  group.position.set(x, 0, z);
  scene.add(group);
  const cop = {
    mesh: group, lightBar, speed: 0, heading: 0, hp: 100,
    ramCd: 0, stuck: 0,
  };
  police.cops.push(cop);
  return cop;
}

function spawnHeli(scene, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a6a8a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 5), bodyMat);
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff }));
  glass.position.set(0, 0.2, 1.9); g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5), bodyMat);
  tail.position.set(0, 0.3, -4); g.add(tail);
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x111214 });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), rotorMat);
  rotor.position.y = 1.1; g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.4), rotorMat);
  tailRotor.position.set(0.4, 0.4, -6); g.add(tailRotor);
  const spot = new THREE.SpotLight(0xfff2b0, 60, 90, 0.35, 0.5, 1.2);
  spot.position.set(0, -0.8, 0);
  const target = new THREE.Object3D();
  target.position.set(0, -40, 0);
  g.add(target); spot.target = target; g.add(spot);
  scene.add(g);
  police.heli = { mesh: g, rotor, spot, target, angle: 0, height: 55 };
  police.heliActive = true;
}

function removeHeli(scene, police) {
  if (!police.heli) return;
  scene.remove(police.heli.mesh);
  police.heli = null; police.heliActive = false;
}

/** Wanted logic + pursuit. Returns 'busted' | 'wasted' | null. */
export function updatePolice(police, scene, player, playerCar, now, dt) {
  const px = player.pos.x, pz = player.pos.z;
  const speed = playerCar ? Math.abs(playerCar.speed) : player.speed;
  // Heat cools off when the player is slow and out of sight of cops.
  if (now - police.lastCrimeAt > 12 && speed < 3 && police.cops.length === 0) {
    police.heat = Math.max(0, police.heat - dt * 2.5);
    police.wanted = Math.ceil(police.heat / 20);
  }
  const wantCops = police.wanted === 0 ? 0 : police.wanted === 1 ? 1 : police.wanted === 2 ? 2
    : police.wanted === 3 ? 3 : police.wanted === 4 ? 4 : 5;
  police.spawnCd -= dt;
  if (police.cops.length < wantCops && police.spawnCd <= 0) {
    police.spawnCd = 2.5;
    const a = Math.random() * Math.PI * 2;
    spawnCop(scene, police, clamp(px + Math.sin(a) * 70, -CITY.half, CITY.half),
      clamp(pz + Math.cos(a) * 70, -CITY.half, CITY.half));
  }
  if (police.wanted >= 3 && !police.heliActive) spawnHeli(scene, police);
  if (police.wanted < 3 && police.heliActive) removeHeli(scene, police);

  // Cop pursuit: steer toward the player, ram, and slow them down.
  police.sirenPhase += dt * 6;
  if (police.frozen) return null;
  for (let i = police.cops.length - 1; i >= 0; i--) {
    const cop = police.cops[i];
    const cx = cop.mesh.position.x, cz = cop.mesh.position.z;
    const d = dist2D(cx, cz, px, pz);
    const want = Math.atan2(px - cx, pz - cz);
    cop.heading = angleLerp(cop.heading, want, clamp(dt * 1.6, 0, 1));
    const targetSpeed = d > 60 ? 30 : d > 25 ? 26 : 20;
    cop.speed = lerp(cop.speed, targetSpeed, clamp(dt, 0, 1));
    cop.mesh.position.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.mesh.position.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.mesh.rotation.y = cop.heading;
    if (cop.lightBar) cop.lightBar.visible = Math.sin(police.sirenPhase) > 0;
    // Ram: shove the player car and damage the player on foot.
    if (d < 4.5) {
      if (playerCar) {
        playerCar.speed *= 0.86;
        playerCar.mesh.position.x += Math.sin(cop.heading) * 2.2;
        playerCar.mesh.position.z += Math.cos(cop.heading) * 2.2;
        addWanted(police, 0, now);
      } else if (player.hurtCd <= 0) {
        player.health -= 8; player.hurtCd = 0.6;
      }
      cop.speed *= 0.5;
    }
    if (d > 260) { scene.remove(cop.mesh); police.cops.splice(i, 1); }
  }
  // Helicopter circles overhead and keeps the spotlight on the player.
  if (police.heli) {
    const h = police.heli;
    h.angle += dt * 0.35;
    h.mesh.position.set(px + Math.sin(h.angle) * 26, h.height, pz + Math.cos(h.angle) * 26);
    h.mesh.rotation.y = Math.atan2(px - h.mesh.position.x, pz - h.mesh.position.z);
    h.rotor.rotation.y += dt * 22;
    h.target.position.set(px - h.mesh.position.x, -h.height, pz - h.mesh.position.z);
    h.spot.target = h.target;
  }
  // Busted: a cop stays on top of a slow player on foot.
  if (!playerCar && police.wanted > 0 && speed < 1) {
    let near = false;
    for (const cop of police.cops) {
      if (dist2D(cop.mesh.position.x, cop.mesh.position.z, px, pz) < 5) near = true;
    }
    police.bustTimer = near ? police.bustTimer + dt : 0;
    if (police.bustTimer > 2.5) {
      police.wanted = 0; police.heat = 0; police.bustTimer = 0;
      return 'busted';
    }
  } else police.bustTimer = 0;
  if (player.health <= 0) return 'wasted';
  return null;
}

export function clearPolice(scene, police) {
  for (const cop of police.cops) scene.remove(cop.mesh);
  police.cops = [];
  removeHeli(scene, police);
  police.wanted = 0; police.heat = 0;
}
