// shots.js — staged screenshots. Each shot sets up a real gameplay state
// (a fresh world, a real position, real traffic, real wanted level), plays
// it forward in fixed 1/60 s steps with a simple autopilot, then freezes it
// (police.frozen + G.shotDone) so the frame the screenshot grabs is the
// frame the game actually reached. Same seed -> same frame.
import { WEAPONS } from './player.js';
import { addHeat, spawnCopForShot } from './police.js';
import { startStory } from './missions.js';

const STEP = 1 / 60;

function runSim(G, seconds, input) {
  G.autoInput = input || null;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) G.stepWorld(STEP);
  G.autoInput = null;
}

function putPlayer(G, x, z, heading) {
  const P = G.player;
  P.pos.set(x, 0, z);
  P.mesh.position.copy(P.pos);
  P.heading = heading;
  P.mesh.rotation.y = heading;
  P.speed = 0;
  G.camYaw = heading;
}

function putPlayerInCar(G, car, x, z, heading) {
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.mesh.rotation.y = heading;
  car.speed = 0;
  G.player.inCar = car;
  G.player.mesh.visible = false;
  G.player.pos.set(x, 0, z);
  G.camYaw = heading;
}

export function stageShot(name, G) {
  const P = G.player;
  G.hour = 17;
  G.weather = 'clear';
  G.shotDone = false;
  G.police.frozen = false;
  G.police.heat = 0; G.police.wanted = 0;
  G.mode = 'play';
  G.shotCam = null;

  if (name === 'start') {
    G.mode = 'title';
    G.hour = 17.1;
    putPlayer(G, 0, 60, Math.PI);
    G.shotCam = { pos: [95, 26, 165], look: [0, 42, 0] };
    runSim(G, 2.5, null);
  } else if (name === 'play') {
    const car = G.traffic.find((c) => c.owned);
    putPlayerInCar(G, car, -100, 42.8, Math.PI / 2);
    G.shotCam = null; // chase camera follows the car
    runSim(G, 6, { up: true });
  } else if (name === 'chase') {
    // down the Sudirman avenue, into a PD roadblock: the car drives east
    // for 2 s, then three PD cars are framed ahead across the avenue with
    // the helicopter overhead, and the frame freezes
    const car = G.traffic.find((c) => c.owned);
    putPlayerInCar(G, car, -60, 42.8, Math.PI / 2);
    addHeat(G.police, 95);
    G.police.spawnCd = 99; // no extra auto-spawned cops during the short sim
    runSim(G, 2, { up: true });
    const cx = car.mesh.position.x;
    for (const [x, z] of [[cx + 22, 42.8], [cx + 30, 38], [cx + 30, 47.5]]) {
      const cop = spawnCopForShot(G.police, x, z);
      cop.heading = -Math.PI / 2; cop.mesh.rotation.y = cop.heading;
      G.police.cops.push(cop);
    }
    G.police.spawnCd = 0;
  } else if (name === 'mission') {
    startStory(G);
    putPlayer(G, -130, -130, Math.PI * 0.75);
    G.shotCam = { pos: [-118, 4.5, -112], look: [-142, 1.5, -148] };
    runSim(G, 1.5, null);
  } else if (name === 'face') {
    // Mara faces south, toward the camera; Monas and the crowd are behind her
    putPlayer(G, 0, 30, 0);
    // crowd gathers around Mara so the close-up has the city behind her
    for (let i = 0; i < 8; i++) {
      const ped = G.peds[36 + i];
      if (ped) {
        ped.mesh.position.set(-8 + i * 2.2, 0, 20 + (i % 3) * 2);
        ped.heading = 0; ped.mesh.rotation.y = 0;
        ped.pause = 6;
      }
    }
    G.shotCam = { pos: [0, 1.7, 32.6], look: [0, 1.55, 30] };
    runSim(G, 1.2, null);
  } else if (name === 'collision') {
    const car = G.traffic.find((c) => c.owned);
    putPlayerInCar(G, car, 0, 40, Math.PI);
    G.shotCam = { pos: [6, 3.5, 52], look: [0, 1, 20] };
    runSim(G, 3, { up: true });
  } else if (name === 'busy') {
    const car = G.traffic.find((c) => c.owned);
    putPlayerInCar(G, car, -100, 42.8, Math.PI / 2);
    // pack the avenue: pull nearby traffic onto the Sudirman road
    let placed = 0;
    for (const t of G.traffic) {
      if (t.owned || !t.road) continue;
      if (placed >= 8) break;
      t.road = 'z'; t.roadCoord = 46; t.dir = placed % 2 === 0 ? 1 : -1;
      t.mesh.position.set(-60 + placed * 18, 0, 46 + (t.dir > 0 ? 3.5 : -3.5));
      t.heading = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      t.mesh.rotation.y = t.heading;
      placed++;
    }
    G.shotCam = { pos: [-118, 5, 58], look: [-60, 1.5, 44] };
    runSim(G, 2, { up: true });
  } else if (name === 'weapons') {
    P.arsenal = {
      pistol: { mag: 12, reserve: 24 },
      smg: { mag: 30, reserve: 60 },
      shotgun: { mag: 6, reserve: 12 },
      rifle: { mag: 30, reserve: 60 },
    };
    P.weapon = 'rifle';
    putPlayer(G, 0, 70, 0);
    // a ped ahead of Mara to flinch and flee
    const ped = G.peds[0];
    ped.mesh.position.set(2, 0, 56);
    ped.heading = Math.PI; ped.mesh.rotation.y = Math.PI;
    ped.pause = 9;
    G.shotCam = { pos: [-4, 3.2, 80], look: [0, 1.4, 60] };
    G.autoFire = true;
    runSim(G, 1.5, null);
    G.autoFire = false;
    G.muzzleFlash = 0.25;
  } else if (name === 'golden') {
    G.hour = 17.6;
    putPlayer(G, 30, 30, Math.PI * 0.8);
    // a browsing buyer at the BAKSO MALANG cart so the vendor serves
    const ped = G.peds[36];
    ped.mesh.position.set(54, 0, 2);
    ped.targetX = 54; ped.targetZ = 2; ped.pause = 8;
    G.shotCam = { pos: [18, 3.5, 52], look: [48, 1.5, 6] };
    runSim(G, 2, null);
  } else {
    // unknown name -> start shot
    G.mode = 'title';
    G.shotCam = { pos: [95, 26, 165], look: [0, 42, 0] };
    runSim(G, 2, null);
  }

  G.police.frozen = true;
  G.shotDone = true;
  // only the start shot shows the title screen; every other shot is pure gameplay
  if (G.hud) {
    G.hud.showTitle(name === 'start');
    G.hud.showPause(false); G.hud.showBusted(false); G.hud.showWasted(false);
  }
  return { mode: G.mode };
}
