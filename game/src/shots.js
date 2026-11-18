// shots.js — staging for the four screenshots. Each shot is the real game
// running: the same world, the same rules, steered by a small autopilot
// that drives toward the mission marker and keeps off the sidewalks.
// ?shot=start|play|chase|mission (with &seed=N) stages that scene,
// paints it twice and sets window.__shotReady.
import { dist2D, angleDiff } from './util.js';
import { addWanted } from './police.js';
import { startStoryMission } from './missions.js';

export const SHOT_NAMES = ['start', 'play', 'chase', 'mission'];

/** Place the world for a shot: time of day, weather, wanted level, story. */
export function placeForShot(G, name) {
  const p = G.player;
  if (name === 'start') {
    G.hour = 18.4; G.weather = 'clear';
    p.pos.set(60, 0, 120); p.heading = Math.PI * 0.75;
    G.camMode = 'cinematic';
    return { seconds: 0 };
  }
  if (name === 'mission') {
    G.hour = 17.6; G.weather = 'clear';
    p.pos.set(-120, 0, -118); p.heading = Math.PI * 0.25;
    p.inCar = null; p.mesh.visible = true;
    startStoryMission(G, 0);
    G.camMode = 'follow';
    return { seconds: 1.5 };
  }
  if (name === 'chase') {
    G.hour = 18.6; G.weather = 'clear';
    // Put Mara in a fast car on the central boulevard, cops already on her.
    const car = G.traffic[0];
    enterCar(G, car);
    car.mesh.position.set(-40, 0, 100); car.heading = 0; car.speed = 22;
    addWanted(G.police, 65, 0);
    G.police.spawnCd = 0;
    G.camMode = 'chase';
    return { seconds: 7 };
  }
  // play: midday drive downtown with traffic, a gig marker ahead.
  G.hour = 10.5; G.weather = 'clear';
  const car = G.traffic[1] || G.traffic[0];
  enterCar(G, car);
  car.mesh.position.set(-90, 0, 20); car.heading = Math.PI / 2; car.speed = 14;
  G.camMode = 'chase';
  return { seconds: 6 };
}

function enterCar(G, car) {
  const p = G.player;
  car.driver = true;
  p.inCar = car;
  p.mesh.visible = false;
  p.pos.copy(car.mesh.position);
}

/** Autopilot: drive the player's car toward the mission marker (or straight
 *  down the road when there is none), steering gently, braking for turns. */
export function autopilotDrive(G, input, dt) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  const m = G.missions.marker;
  let tx = car.mesh.position.x + Math.sin(car.heading) * 60;
  let tz = car.mesh.position.z + Math.cos(car.heading) * 60;
  if (m.group.visible) { tx = m.group.position.x; tz = m.group.position.z; }
  const want = Math.atan2(tx - car.mesh.position.x, tz - car.mesh.position.z);
  const diff = angleDiff(car.heading, want);
  input.forward = true;
  input.back = false;
  input.left = diff > 0.12;
  input.right = diff < -0.12;
  input.handbrake = Math.abs(diff) > 0.9;
  const d = dist2D(car.mesh.position.x, car.mesh.position.z, tx, tz);
  if (d < 12) input.forward = false;
}
