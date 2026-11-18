// city.js — Solmara, a sun-baked river city in a desert valley.
// Grid streets, a downtown tower cluster, low suburbs, a river with a bridge,
// a highway ring, palms, lamps and a full day-night sky. All original.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, lerp } from './util.js';

export const CITY = {
  blocks: 9, block: 64, road: 14,
  get half() { return (this.blocks * (this.block + this.road)) / 2; },
};
export const ROAD_Y = 0.02;

function roadCoord(i) {
  // Centre of the i-th road line (0..blocks).
  return -CITY.half + i * (CITY.block + CITY.road) + CITY.road / 2 - CITY.road / 2;
}
export function nearestRoadCoord(v) {
  const step = CITY.block + CITY.road;
  const idx = Math.round((v + CITY.half - CITY.road / 2) / step);
  return -CITY.half + idx * step;
}
export function isOnRoad(x, z) {
  const step = CITY.block + CITY.road;
  const fx = ((x + CITY.half) % step + step) % step;
  const fz = ((z + CITY.half) % step + step) % step;
  return fx < CITY.road || fz < CITY.road;
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'SolmaraCity';
  scene.add(group);
  const half = CITY.half;
  const step = CITY.block + CITY.road;

  // Ground: desert sand beyond the city, asphalt grid inside.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 4, half * 4),
    new THREE.MeshLambertMaterial({ color: 0xc98f4e }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  group.add(ground);
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 40, half * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x33363d }),
  );
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0;
  group.add(asphalt);

  // Roads: dark strips + centre dashes, drawn as thin boxes for the minimap's sake.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2e35 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const roadGeo = new THREE.BoxGeometry(half * 2 + 40, 0.06, CITY.road);
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -half + i * step;
    const rx = new THREE.Mesh(roadGeo, roadMat);
    rx.position.set(0, 0.03, c + CITY.road / 2); group.add(rx);
    const rz = new THREE.Mesh(roadGeo, roadMat);
    rz.rotation.y = Math.PI / 2; rz.position.set(c + CITY.road / 2, 0.03, 0); group.add(rz);
    for (let d = -half; d < half; d += 12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 0.5), dashMat);
      dash.position.set(d, 0.05, c + CITY.road / 2); group.add(dash);
      const dash2 = dash.clone();
      dash2.rotation.y = Math.PI / 2;
      dash2.position.set(c + CITY.road / 2, 0.05, d); group.add(dash2);
    }
  }
  // Sidewalk blocks.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  const walkGeo = new THREE.BoxGeometry(CITY.block, 0.3, CITY.block);
  for (let ix = 0; ix < CITY.blocks; ix++) {
    for (let iz = 0; iz < CITY.blocks; iz++) {
      const w = new THREE.Mesh(walkGeo, walkMat);
      w.position.set(-half + CITY.road + ix * step + CITY.block / 2, 0.15,
        -half + CITY.road + iz * step + CITY.block / 2);
      group.add(w);
    }
  }

  // River along the east edge + bridge + beach.
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(120, half * 2 + 400),
    new THREE.MeshLambertMaterial({ color: 0x2f7fa8 }),
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(half + 110, 0.1, 0);
  group.add(river);
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(150, 1.2, 26),
    new THREE.MeshLambertMaterial({ color: 0xb8452f }),
  );
  bridge.position.set(half + 55, 1.4, 0);
  group.add(bridge);
  const bridgeDeck = new THREE.Mesh(
    new THREE.BoxGeometry(150, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x2b2e35 }),
  );
  bridgeDeck.position.set(half + 55, 2.1, 0);
  group.add(bridgeDeck);

  // Buildings: instanced boxes, downtown tall, suburbs low. Facade texture + tint.
  const facade = makeFacade(rng);
  const bMat = new THREE.MeshLambertMaterial({ map: facade });
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const spots = [];
  for (let ix = 0; ix < CITY.blocks; ix++) {
    for (let iz = 0; iz < CITY.blocks; iz++) {
      const cx = -half + CITY.road + ix * step + CITY.block / 2;
      const cz = -half + CITY.road + iz * step + CITY.block / 2;
      const dc = Math.max(Math.abs(cx), Math.abs(cz)) / half; // 0 downtown -> 1 edge
      const n = dc < 0.25 ? 2 : (rng() < 0.6 ? 2 : 1);
      for (let k = 0; k < n; k++) {
        const w = rand(rng, 16, 26), d = rand(rng, 16, 26);
        const h = dc < 0.25 ? rand(rng, 55, 130)
          : dc < 0.55 ? rand(rng, 18, 48) : rand(rng, 7, 16);
        const ox = (k === 0 ? -12 : 12) * (n === 2 ? 1 : 0);
        const oz = (k === 0 ? 10 : -10) * (n === 2 ? 1 : 0);
        spots.push({ x: cx + ox, z: cz + oz, w, d, h, dc });
      }
    }
  }
  const inst = new THREE.InstancedMesh(bGeo, bMat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const palette = [0xd8b48a, 0xc9a06a, 0xb98d5f, 0x9fb4c4, 0x7e94a8, 0xd8c9a8, 0xa88a7a, 0x8a9a8a];
  spots.forEach((b, i) => {
    p.set(b.x, 0.3, b.z); s.set(b.w, b.h, b.d);
    m4.compose(p, q, s); inst.setMatrixAt(i, m4);
    col.setHex(pick(rng, palette));
    if (b.dc < 0.25) col.offsetHSL(0.55, 0.12, -0.04); // glassy downtown
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
  // Rooftop beacons downtown.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  spots.filter((b) => b.h > 70).forEach((b) => {
    const bk = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), beaconMat);
    bk.position.set(b.x, 0.3 + b.h + 1, b.z); group.add(bk);
  });

  // Palms along boulevards + street lamps.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
  const leafGeo = new THREE.ConeGeometry(2.4, 2.8, 7);
  const palmCount = 130;
  const palms = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palmCount);
  for (let i = 0; i < palmCount; i++) {
    const along = rand(rng, -half, half);
    const lane = pick(rng, [-1, 1]) * (CITY.road / 2 + 2);
    const vertical = rng() < 0.5;
    const x = vertical ? along : pick(rng, [-half, half]) + (rng() < 0.5 ? -1 : 1) * (CITY.block / 2);
    const z = vertical ? lane + Math.floor(rand(rng, 0, CITY.blocks)) * step - half : along;
    p.set(x, 4.8, z); s.set(1, 1, 1); m4.compose(p, q, s);
    palms.setMatrixAt(i, m4);
    p.y = 9.9; m4.compose(p, q, s); leaves.setMatrixAt(i, m4);
  }
  group.add(palms); group.add(leaves);
  // Lamps.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x44484f });
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampCount = 90;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 6), bulbMat, lampCount);
  for (let i = 0; i < lampCount; i++) {
    const gx = -half + Math.floor(rand(rng, 0, CITY.blocks + 1)) * step;
    const gz = rand(rng, -half, half);
    p.set(gx, 3.5, gz); s.set(1, 1, 1); m4.compose(p, q, s); lamps.setMatrixAt(i, m4);
    p.y = 7.1; m4.compose(p, q, s); bulbs.setMatrixAt(i, m4);
  }
  group.add(lamps); group.add(bulbs);

  // Landmarks: the Sol Tower (downtown), the old water tower, the stadium bowl.
  const solTower = new THREE.Mesh(
    new THREE.BoxGeometry(30, 170, 30),
    new THREE.MeshLambertMaterial({ map: facade, color: 0x9fd8e8 }),
  );
  solTower.position.set(0, 0.3, 0); group.add(solTower);
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 14, 22, 4),
    new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  );
  crown.position.set(0, 182, 0); crown.rotation.y = Math.PI / 4; group.add(crown);
  const stadium = new THREE.Mesh(
    new THREE.CylinderGeometry(42, 46, 14, 24, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8, side: THREE.DoubleSide }),
  );
  stadium.position.set(-half + 60, 7, half - 60); group.add(stadium);

  // Sky: big gradient dome + sun + moon + stars, driven by updateSky.
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x87b8dd, side: THREE.BackSide, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 16), skyMat);
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(60, 24),
    new THREE.MeshBasicMaterial({ color: 0xffdf8a, fog: false }),
  );
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a4a, 0.9);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffe0b0, 1.6);
  scene.add(sunLight); scene.add(sunLight.target);
  scene.fog = new THREE.Fog(0xcfd8e0, 220, 900);

  // Rain: one Points cloud, toggled by weather.
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    rainPos[i * 3] = rand(rng, -120, 120);
    rainPos[i * 3 + 1] = rand(rng, 0, 60);
    rainPos[i * 3 + 2] = rand(rng, -120, 120);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9fb8cc, size: 0.55, transparent: true, opacity: 0.7,
  }));
  rain.visible = false; rain.frustumCulled = false;
  scene.add(rain);

  return {
    group, sky, skyMat, sun, sunLight, hemi, rain,
    /** hour 0..24, weather 'clear'|'rain'|'fog'. Drives light, sky and fog. */
    updateSky(hour, weather) {
      const t = (hour - 6) / 12; // 0 at dawn, 1 at dusk
      const day = clamp(Math.sin(Math.PI * clamp(t, 0, 1)), 0, 1);
      const dusk = clamp(1 - Math.min(t, 1 - t) * 4, 0, 1) * (t > 0 && t < 1 ? 1 : 0);
      const sunA = Math.PI * clamp(t, 0, 1);
      const sx = Math.cos(sunA) * 1200, sy = Math.sin(sunA) * 900 + 40;
      sun.position.set(sx, Math.max(sy, 30), -700);
      sun.lookAt(0, 60, 0);
      sun.material.color.setHex(day > 0.15 ? 0xffdf8a : 0xff9a5a);
      sunLight.position.set(sx, Math.max(sy, 60), -400);
      sunLight.intensity = 0.25 + day * 1.5;
      sunLight.color.setHex(dusk > 0.5 ? 0xffb070 : 0xffe0b0);
      hemi.intensity = 0.25 + day * 0.7;
      const skyCol = new THREE.Color();
      if (day < 0.12) skyCol.setHex(0x1a2340); // night
      else if (dusk > 0.45) skyCol.setHex(0xe8734a); // sunset
      else skyCol.setHex(0x87b8dd); // day
      if (dusk > 0.2 && dusk <= 0.45) skyCol.lerp(new THREE.Color(0xe8734a), dusk);
      if (weather === 'fog') skyCol.lerp(new THREE.Color(0xb8bcc0), 0.55);
      if (weather === 'rain') skyCol.lerp(new THREE.Color(0x5a6a7a), 0.5);
      skyMat.color.copy(skyCol);
      scene.fog.color.copy(skyCol);
      scene.fog.near = weather === 'fog' ? 60 : 220;
      scene.fog.far = weather === 'fog' ? 320 : (weather === 'rain' ? 600 : 950);
      rain.visible = weather === 'rain';
      return { day, dusk };
    },
    updateRain(px, pz, dt) {
      if (!rain.visible) return;
      const pos = rainGeo.attributes.position;
      for (let i = 0; i < 900; i++) {
        let y = pos.getY(i) - dt * 55;
        if (y < 0) { y = 60; pos.setX(i, px + rand(rng, -120, 120)); pos.setZ(i, pz + rand(rng, -120, 120)); }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      rain.position.set(0, 0, 0);
    },
  };
}

function makeFacade(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b8a894'; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 18) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rng() < 0.4;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#9fd8ff') : '#232833';
      g.fillRect(x, y, 11, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
