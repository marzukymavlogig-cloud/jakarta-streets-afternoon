// shots.js — staged screenshots. Each shot sets up a real gameplay state
// (a real car driving, a real 4-star chase, Mara's real face) and the main
// loop then runs a short fixed sim before window.__shotReady fires.
// The title screen stays visible only for the start shot; every other shot
// hides all screens so the game itself fills the frame.
import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { ensureHeli } from './police.js';
import { setMarker } from './missions.js';

export const SHOT_NAMES = ['start', 'play', 'chase', 'mission', 'face', 'collision', 'busy', 'weapons', 'golden', 'monas', 'vendors', 'kampung'];

function putPlayerInCar(G, car, x, z, heading) {
  const p = G.player;
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.mesh.rotation.y = heading;
  car.speed = 0;
  p.inCar = car;
  p.mesh.visible = false;
  p.pos.set(x, 0, z);
  p.heading = heading;
  G.enterAnim = null;
}

function putPlayerOnFoot(G, x, z, heading) {
  const p = G.player;
  if (p.inCar) { p.inCar = null; }
  p.mesh.visible = true;
  p.pos.set(x, 0, z);
  p.mesh.position.copy(p.pos);
  p.heading = heading;
  p.mesh.rotation.y = heading;
  G.enterAnim = null;
}

// stageShot returns { simSeconds, autoDrive } — how long the main loop
// should simulate (and whether to hold W) before freezing the frame.
export function stageShot(G, name) {
  const p = G.player;
  G.mode = 'play';
  G.hour = 17.0;
  G.weather = 'clear';
  G.police.heat = 0;
  G.police.wanted = 0;
  G.police.frozen = false;
  G.shotDone = false;
  G.shotCam = null;
  G.shotLookY = null;
  G.shotCamH = null;
  if (name !== 'start') G.hud.hideScreens();
  const sedan = G.traffic.find((c) => c.owned) || G.starterCar;

  switch (name) {
    case 'start': {
      G.mode = 'title';
      G.hud.showScreen('title');
      G.shotCam = { pos: new THREE.Vector3(150, 70, 210), look: new THREE.Vector3(0, 25, 0) };
      return { simSeconds: 0.5, autoDrive: false };
    }
    case 'play': {
      // Golden-hour drive down Jl. Sudirman, gold beam ahead. The staged
      // sim is 4.5 s: the car still reaches full speed (~108 km/h), and the
      // frame is ready well inside the shot tool's 30 s wait.
      putPlayerInCar(G, sedan, -100, 42.8, Math.PI / 2);
      setMarker(G, 120, 42.8);
      G.camDist = 11;
      return { simSeconds: 4.5, autoDrive: true };
    }
    case 'chase': {
      // 4-star chase: drive east 2 s, then a 3-PD roadblock ahead + heli.
      G.police.heat = 75;
      G.police.wanted = 4;
      ensureHeli(G);
      putPlayerInCar(G, sedan, -100, 42.8, Math.PI / 2);
      G.camDist = 12;
      return { simSeconds: 2, autoDrive: true, then: 'chaseRoadblock' };
    }
    case 'collision': {
      // Straight at the Monas base: the car must stop at the wall, not pass it.
      putPlayerInCar(G, sedan, 0, 60, Math.PI);
      G.camDist = 10;
      return { simSeconds: 3.2, autoDrive: true };
    }
    case 'face': {
      // Mara faces south toward the camera, close enough that her face
      // (eyes, brows, nose, lipstick) reads; Monas + Wisma 46 behind her.
      putPlayerOnFoot(G, 0, 34, 0);
      G.shotCam = { pos: new THREE.Vector3(0, 1.6, 38.2), look: new THREE.Vector3(0, 1.45, 34) };
      // Crowd behind her, facing the camera too.
      G.peds.slice(36, 44).forEach((ped, i) => {
        ped.mesh.position.set(-6 + i * 1.6, 0, 24 + (i % 3) * 2);
        ped.heading = 0;
        ped.mesh.rotation.y = 0;
        ped.pause = 9;
      });
      return { simSeconds: 1.5, autoDrive: false };
    }
    case 'mission': {
      putPlayerOnFoot(G, -120, -120, Math.PI * 0.75);
      setMarker(G, -150, -155);
      G.camDist = 9;
      return { simSeconds: 1.5, autoDrive: false };
    }
    case 'busy': {
      putPlayerInCar(G, sedan, -40, 42.8, Math.PI / 2);
      G.shotCam = { pos: new THREE.Vector3(30, 9, 95), look: new THREE.Vector3(-20, 2, 42) };
      return { simSeconds: 2, autoDrive: true };
    }
    case 'weapons': {
      putPlayerOnFoot(G, 0, 60, Math.PI);
      p.arsenal = {
        pistol: { mag: 12, reserve: 24 },
        smg: { mag: 30, reserve: 60 },
        shotgun: { mag: 6, reserve: 12 },
        rifle: { mag: 30, reserve: 60 },
      };
      p.weapon = 'rifle';
      p.fireCd = 0;
      // Peds ahead of Mara, flinching and fleeing.
      G.peds.slice(0, 5).forEach((ped, i) => {
        ped.mesh.position.set(-6 + i * 3, 0, 48 - i);
        ped.hurt = 0.5;
        ped.fleeing = 5;
      });
      G.camDist = 8;
      return { simSeconds: 1.5, autoDrive: false };
    }
    case 'golden': {
      G.hour = 17.65;
      putPlayerOnFoot(G, 18, 58, Math.PI * 0.9);
      // A browsing buyer at the PECEL LELE tent so the vendor serves.
      const ped = G.peds[36];
      ped.mesh.position.set(24, 0, 61);
      ped.pause = 8;
      G.shotCam = { pos: new THREE.Vector3(34, 3.2, 76), look: new THREE.Vector3(20, 1.5, 60) };
      return { simSeconds: 1.5, autoDrive: false };
    }
    case 'monas': {
      putPlayerOnFoot(G, 0, 40, Math.PI);
      G.shotCam = { pos: new THREE.Vector3(0, 2, 62), look: new THREE.Vector3(0, 42, 0) };
      G.shotLookY = 42;
      G.peds.slice(36, 54).forEach((ped, i) => {
        ped.mesh.position.set(-14 + (i % 8) * 4, 0, 30 + Math.floor(i / 8) * 4);
        ped.pause = 9;
      });
      return { simSeconds: 1.5, autoDrive: false };
    }
    case 'vendors': {
      putPlayerOnFoot(G, 18, -60, Math.PI * 0.15);
      G.camDist = 9;
      return { simSeconds: 1.5, autoDrive: false };
    }
    case 'kampung': {
      putPlayerOnFoot(G, 241, 150, Math.PI * 0.5);
      G.camDist = 10;
      return { simSeconds: 1.5, autoDrive: false };
    }
    default: {
      return { simSeconds: 1, autoDrive: false };
    }
  }
}

// Called after the staged sim finishes: place the chase roadblock.
export function finishChaseStaging(G) {
  const car = G.player.inCar;
  if (!car) return;
  const cx = car.mesh.position.x;
  const cz = car.mesh.position.z;
  const spots = [[cx + 24, cz - 4], [cx + 24, cz + 4], [cx + 32, cz]];
  for (const [x, z] of spots) {
    const pd = makeCar(G, 'police', { x, z, heading: -Math.PI / 2, name: 'Polisi Jakarta' });
    G.police.cars.push(pd);
  }
  const h = G.police.heli;
  if (h) {
    // Low over the roadblock, inside the chase camera's frame.
    h.mesh.position.set(cx + 30, 20, cz - 8);
    h.rotor.rotation.y = 21;
  }
  // Stage the camera high and back so the roadblock, the heli and the
  // player car are all in frame; snap it (no lerp) — the world freezes now.
  G.shotCam = {
    pos: new THREE.Vector3(cx - 26, 10, cz + 13),
    look: new THREE.Vector3(cx + 16, 3, cz - 2),
  };
  G.camera.position.copy(G.shotCam.pos);
  G.police.frozen = true;
  G.shotDone = true;
}
