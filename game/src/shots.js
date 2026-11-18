// shots.js — staging for the four screenshots, all in the Jakarta
// golden hour (16:30–17:30). Each shot is the real game running: the same
// world, the same rules, steered by a small autopilot that drives toward
// the mission marker and keeps off the sidewalks.
// ?shot=start|play|chase|mission (with &seed=N) stages that scene,
// paints it twice and sets window.__shotReady.
import { dist2D, angleDiff } from './util.js';
import { addWanted } from './police.js';
import { startStoryMission } from './missions.js';

export const SHOT_NAMES = ['start', 'play', 'chase', 'mission', 'monas', 'vendors', 'kampung'];

/** Place the world for a shot: golden-hour time, weather, wanted level, story. */
export function placeForShot(G, name) {
  const p = G.player;
  G.missions.gigCd = 999; // no random gig spawns during a staged shot
  if (name === 'start') {
    G.hour = 16.6; G.weather = 'clear'; // golden hour over Monas
    p.pos.set(60, 0, 120); p.heading = Math.PI * 0.75;
    G.camMode = 'cinematic';
    return { seconds: 0 };
  }
  if (name === 'mission') {
    G.hour = 16.4; G.weather = 'clear';
    // Mara walks up to the bengkel with the marker dead ahead.
    p.pos.set(-138, 0, -196); p.heading = -0.26;
    p.inCar = null; p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    startStoryMission(G, 0);
    // Pull the marker to the bengkel forecourt so its beam reads over the roofs.
    G.missions.marker.group.position.set(-150, 0, -181);
    G.camMode = 'follow';
    G.camYaw = -0.26;
    return { seconds: 1.0 };
  }
  if (name === 'monas') {
    // v3: Mara on foot on the plaza's south edge, Monas ahead, the crowd and
    // the vendor ring all around her.
    G.hour = 16.3; G.weather = 'clear';
    p.pos.set(0, 0, 40); p.heading = Math.PI;
    p.inCar = null; p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    G.missions.marker.group.visible = false;
    G.camMode = 'follow';
    G.camYaw = Math.PI;
    G.camDist = 18; G.shotLookY = 12; G.shotCamH = 3; // crowd in frame, Monas shaft rising above
    G.hud.setObjective('Monas — sore di Lapangan Merdeka, kaki lima di mana-mana');
    return { seconds: 2.5 };
  }
  if (name === 'vendors') {
    // v3: Mara on the Thamrin sidewalk among the gerobak and warung tenda,
    // the halte and the avenue behind her.
    G.hour = 16.4; G.weather = 'clear';
    p.pos.set(18, 0, -60); p.heading = 2.16;
    p.inCar = null; p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    G.missions.marker.group.visible = false;
    G.camMode = 'follow';
    G.camYaw = 2.16; G.camDist = 9;
    G.hud.setObjective('Kaki lima Jl. Thamrin — bakso, sate, es teh');
    return { seconds: 2.5 };
  }
  if (name === 'kampung') {
    // v3: Mara inside the kampung — dense houses, corrugated roofs, laundry
    // lines and tangled wires down a narrow alley.
    G.hour = 16.5; G.weather = 'clear';
    p.pos.set(241, 0, 150); p.heading = 0.7;
    p.inCar = null; p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    G.missions.marker.group.visible = false;
    G.camMode = 'follow';
    G.camYaw = 0.7;
    G.hud.setObjective('Kampung Melayu — gang sempit, jemuran, kabel semrawut');
    return { seconds: 1.5 };
  }
  if (name === 'chase') {
    G.hour = 16.5; G.weather = 'clear';
    // Mara in a fast sedan on the central boulevard (road z = 46), cops on her.
    const car = G.traffic.find((c) => c.kind === 'sedan') || G.traffic[0];
    enterCar(G, car);
    car.mesh.position.set(-60, 0, 42.8); car.heading = Math.PI / 2; car.speed = 24;
    car.mesh.rotation.y = car.heading;
    addWanted(G.police, 65, 0);
    G.police.spawnCd = 0;
    G.missions.marker.group.visible = false;
    G.hud.setObjective('DICARI ★★★★ — kabur dari polisi Jakarta!');
    G.camMode = 'chase';
    return { seconds: 7 };
  }
  // play: golden-hour drive down Jl. Sudirman to a marker, past the halte.
  G.hour = 16.2; G.weather = 'clear';
  const car = G.traffic.find((c) => c.kind === 'sedan') || G.traffic[1] || G.traffic[0];
  enterCar(G, car);
  car.mesh.position.set(-140, 0, 42.8); car.heading = Math.PI / 2; car.speed = 14;
  car.mesh.rotation.y = car.heading;
  G.missions.active = null;
  G.missions.marker.group.position.set(190, 0, 46);
  G.missions.marker.group.visible = true;
  G.hud.setObjective('Gig: Jemput penumpang di Monas — ikuti marker');
  G.camMode = 'chase';
  return { seconds: 6 }; // 6 s puts the car just past the Monas plaza slab (which
  // covers the road at |x|<48); shorter stops the car sunk in the plaza
}

function enterCar(G, car) {
  const p = G.player;
  car.driver = true;
  p.inCar = car;
  p.mesh.visible = false;
  p.pos.copy(car.mesh.position);
}

/** After the chase sim, pull the pursuit into the camera frame: a police
 *  roadblock ahead of the player and the helicopter overhead in view. */
export function frameChase(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const px = car.mesh.position.x, pz = car.mesh.position.z;
  G.police.cops.forEach((cop, i) => {
    const side = i % 2 === 0 ? 6 : -6;
    const ahead = 18 + i * 6;
    cop.mesh.position.set(px + fx * ahead - fz * side, 0, pz + fz * ahead + fx * side);
    cop.heading = car.heading + Math.PI;
    cop.mesh.rotation.y = cop.heading;
    cop.speed = 0;
    if (cop.lightBar) cop.lightBar.visible = true; // flashing bars on for the shot
  });
  if (G.police.heli) {
    const h = G.police.heli;
    // Over the road corridor (open sky), so no building occludes it.
    h.mesh.position.set(px + fx * 40, 18, pz + fz * 40);
    h.mesh.scale.setScalar(1.0);
    h.mesh.rotation.y = Math.atan2(px - h.mesh.position.x, pz - h.mesh.position.z);
  }
  G.police.frozen = true; // hold the staged pursuit for the screenshot
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
