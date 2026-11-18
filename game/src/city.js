// city.js — JAKARTA in the late afternoon: Monas at the centre, the wide
// Sudirman / MH Thamrin avenue, TransJakarta halte, angkot lanes, warung
// stalls, ruko shophouses, and a golden-hour sky with haze and wet roads
// after the rain. All original, built on Three.js primitives + canvas textures.
//
// v4: every building is a solid collider (no more driving through walls),
// the Monas plaza slab sits at road height (cars no longer sink 0.6 m),
// vendors and walking sellers have faces, and Sudirman gets billboards,
// neon signs and working traffic lights — Los Santos bustle, Jakarta soul.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, lerp, addFace } from './util.js';

export const CITY = {
  blocks: 9, block: 64, road: 14,
  get half() { return (this.blocks * (this.block + this.road)) / 2; },
};
export const ROAD_Y = 0.02;

/** Vendor stalls ringing Lapangan Merdeka + the Thamrin avenue (v3).
 *  Shared with player.js so the Monas crowd drifts stall to stall. */
export const PLAZA_STALLS = [
  { x: 56, z: 0, type: 'gerobak', label: 'BAKSO MALANG', color: '#c23b2e' },
  { x: -56, z: 0, type: 'tenda', label: 'NASI GORENG', color: '#e87a2e' },
  { x: 14, z: 54, type: 'gerobak', label: 'ES TEH MANIS', color: '#4fc2c2' },
  { x: -14, z: -54, type: 'tenda', label: 'SATE MADURA', color: '#3aa655' },
  { x: 54, z: 54, type: 'kakilima', label: 'GORENGAN', color: '#e8b93b' },
  { x: -54, z: 54, type: 'gerobak', label: 'BUAH POTONG', color: '#e87a2e' },
  { x: 54, z: -54, type: 'tenda', label: 'MIE AYAM', color: '#0b5fa5' },
  { x: -54, z: -54, type: 'kakilima', label: 'JAJAN PASAR', color: '#8a4fbf' },
  { x: 24, z: -64, type: 'gerobak', label: 'KOPI', color: '#6a4a2a' },
  { x: -24, z: 64, type: 'tenda', label: 'KETOPRAK', color: '#3aa655' },
  { x: 66, z: -20, type: 'kakilima', label: 'ES CAMPUR', color: '#c23b7a' },
  { x: -66, z: 20, type: 'gerobak', label: 'SOTO', color: '#e8b93b' },
  { x: 24, z: 64, type: 'tenda', label: 'PECEL LELE', color: '#c23b2e' },
];
/** Walking vendors (penjual keliling) circling the plaza. */
export const KELILING = [
  { label: 'JUS', color: '#e87a2e', radius: 62, speed: 0.022, phase: 0 },
  { label: 'ROKOK & PULSA', color: '#22242a', radius: 68, speed: -0.018, phase: 2.1 },
  { label: 'KACANG', color: '#8a4fbf', radius: 58, speed: 0.026, phase: 4.4 },
];
/** Kampung blocks (v3): dense informal housing, east side. Block centres
 *  (241/319, 85/163) — see createCity's building loop. */
export const KAMPUNG = { x0: 200, x1: 351, z0: 40, z1: 220 };

function roadCoord(i) {
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

/** Canvas texture with painted text — street signs, warung boards, halte signs. */
export function makeSignTexture(text, bg = '#0b5fa5', fg = '#ffffff', sub = '') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = sub ? 192 : 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 64px sans-serif';
  g.fillText(text, c.width / 2, sub ? c.height / 2 - 34 : c.height / 2);
  if (sub) { g.font = 'bold 40px sans-serif'; g.fillText(sub, c.width / 2, c.height / 2 + 52); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphaltTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#565a63'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 78 + Math.floor(rng() * 42);
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  // Faint tyre-wear bands where traffic runs.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(60, 0, 34, 256); g.fillRect(162, 0, 34, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sidewalkTexture(rng) {
  // v4 (benchmark): warm terracotta-and-cream tiles like a downtown Jakarta
  // plaza — the reference's patterned paving, not plain grey slabs.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const tiles = ['#b0705a', '#d8c0a8', '#a8664f', '#cdb294'];
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      g.fillStyle = tiles[(tx + ty) % 4];
      g.fillRect(tx * 32, ty * 32, 32, 32);
    }
  }
  g.strokeStyle = 'rgba(60,30,20,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${rng() * 0.1})`;
    g.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glassFacade(rng) {
  // v4 (benchmark): a fine lit-window grid on blue-green glass, like the
  // reference towers — 256x512 canvas, small windows, most of them lit in
  // the afternoon, with a warm sunset reflection band.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#6a9a9a'); grad.addColorStop(0.5, '#4a7a8a'); grad.addColorStop(1, '#3a5a6e');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
  for (let y = 8; y < 500; y += 14) {
    for (let x = 6; x < 248; x += 12) {
      const lit = rng() < 0.55;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#cfeef5') : '#16222e';
      g.fillRect(x, y, 8, 9);
    }
  }
  // Vertical mullions between the window columns.
  g.fillStyle = 'rgba(220,235,240,0.35)';
  for (let x = 0; x < 256; x += 12) g.fillRect(x, 0, 1, 512);
  // Warm sunset reflection band across the glass.
  g.fillStyle = 'rgba(255,170,90,0.28)';
  g.fillRect(0, 120, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** v4 (benchmark): ground-floor retail — a shopfront band with readable
 *  Jakarta shop signs and glass doors, for the podium under each tall tower. */
function shopfrontTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const shops = [
    ['KOPI SENJA', '#6a3a1a'], ['SATE 88', '#c23b2e'], ['NASI GORENG', '#e87a2e'],
    ['ES TEH', '#0b7a7a'], ['PULSA', '#8a4fbf'], ['WARTEG', '#3aa655'],
  ];
  shops.forEach(([name, bg], i) => {
    const x = i * 86;
    g.fillStyle = bg; g.fillRect(x, 0, 86, 34);
    g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
    g.fillText(name, x + 43, 23);
  });
  // Glass doors + shop windows below the sign band.
  g.fillStyle = '#9fc4d8'; g.fillRect(0, 34, 512, 94);
  g.fillStyle = '#2a2e35';
  for (let x = 8; x < 512; x += 43) g.fillRect(x, 40, 4, 82);
  for (let x = 20; x < 512; x += 86) {
    g.fillStyle = '#1d2733'; g.fillRect(x, 46, 52, 70); // door glass
    g.fillStyle = 'rgba(255,217,138,0.5)'; g.fillRect(x + 4, 50, 44, 20); // lit interior
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rukoFacade(rng) {
  // Two-storey shophouse: shopfront + sign band + windows above.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = pick(rng, ['#e8d8a8', '#d8b48a', '#c9d8c9', '#e8c9c9', '#b8c9d8']);
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = pick(rng, ['#c23b2e', '#0b5fa5', '#3aa655', '#e87a2e', '#8a4fbf']);
  g.fillRect(0, 0, 128, 26); // sign band
  g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
  g.fillText(pick(rng, ['TOKO', 'WARUNG', 'BENGKEL', 'FOTOKOPI', 'LAUNDRY']), 64, 18);
  g.fillStyle = '#2e3a4a';
  g.fillRect(10, 44, 34, 40); g.fillRect(84, 44, 34, 40); // shop windows
  g.fillStyle = '#6a4a2a'; g.fillRect(52, 44, 24, 52); // door
  for (let x = 10; x < 118; x += 28) {
    g.fillStyle = rng() < 0.4 ? '#ffd98a' : '#232833';
    g.fillRect(x, 96, 18, 20);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function corrugatedTexture(rng, base) {
  // Weathered corrugated-iron roof/wall: vertical ribs + rust streaks.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, 0, 2, 128);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 4, 0, 2, 128);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(120,60,20,${0.08 + rng() * 0.16})`;
    const x = rng() * 128, y = rng() * 128;
    g.fillRect(x, y, 3 + rng() * 5, 12 + rng() * 30);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripedTexture(colorA, colorB) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = (x / 16) % 2 === 0 ? colorA : colorB;
    g.fillRect(x, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blueGlassFacade(rng) {
  // Sudirman blue-glass tower: vertical mullions + sky reflection.
  // v4 (benchmark): same fine lit-window grid as glassFacade, deeper blue.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#4a7a9a'); grad.addColorStop(0.5, '#2e5a7a'); grad.addColorStop(1, '#1d3a52');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
  for (let x = 8; x < 256; x += 12) {
    g.fillStyle = 'rgba(200,225,245,0.5)'; g.fillRect(x, 0, 2, 512);
  }
  for (let y = 8; y < 500; y += 14) {
    for (let x = 10; x < 248; x += 12) {
      const lit = rng() < 0.5;
      g.fillStyle = lit ? '#ffd98a' : 'rgba(10,20,30,0.7)';
      g.fillRect(x, y, 8, 9);
    }
  }
  g.fillStyle = 'rgba(255,190,110,0.25)';
  g.fillRect(0, 80, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'JakartaCity';
  scene.add(group);
  const half = CITY.half;
  const step = CITY.block + CITY.road;
  // v4: solid-city colliders — one AABB per building, stall, kiosk and the
  // Monas base, shared with feet, cars, peds and police (util.js resolves
  // circles against them). The stadium bowl is left out on purpose: its
  // open cylinder straddles a road, so a box there would block traffic.
  const colliders = [];

  // Ground: built-up Jakarta grey-green beyond the grid, textured asphalt inside.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 4, half * 4),
    new THREE.MeshLambertMaterial({ color: 0x6a7a5a }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  group.add(ground);
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 40, half * 2 + 40),
    new THREE.MeshPhongMaterial({ map: asphaltTexture(rng), shininess: 90, specular: 0x778899 }),
  );
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Roads: dark strips + centre dashes + zebra crossings on the Sudirman axis.
  // v4: the asphalt reads lighter in the afternoon sun (the old road went
  // near-black in tower shadow).
  const roadMat = new THREE.MeshPhongMaterial({ color: 0x5a5e68, shininess: 80, specular: 0x667788 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const roadGeo = new THREE.BoxGeometry(half * 2 + 40, 0.06, CITY.road);
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -half + i * step;
    const rx = new THREE.Mesh(roadGeo, roadMat);
    rx.position.set(0, 0.03, c + CITY.road / 2); rx.receiveShadow = true; group.add(rx);
    const rz = new THREE.Mesh(roadGeo, roadMat);
    rz.rotation.y = Math.PI / 2; rz.position.set(c + CITY.road / 2, 0.03, 0); rz.receiveShadow = true; group.add(rz);
    for (let d = -half; d < half; d += 12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 0.5), dashMat);
      dash.position.set(d, 0.05, c + CITY.road / 2); group.add(dash);
      const dash2 = dash.clone();
      dash2.rotation.y = Math.PI / 2;
      dash2.position.set(c + CITY.road / 2, 0.05, d); group.add(dash2);
    }
  }
  // Zebra crossings where the avenue meets the cross streets.
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (let i = 1; i < CITY.blocks; i++) {
    const c = -half + i * step + CITY.road / 2;
    for (let k = -5; k <= 5; k++) {
      const z = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 3.4), zebraMat);
      z.position.set(k * 2.4, 0.06, c); group.add(z);
    }
  }
  // Sidewalk blocks with paving texture.
  const walkMat = new THREE.MeshLambertMaterial({ map: sidewalkTexture(rng) });
  const walkGeo = new THREE.BoxGeometry(CITY.block, 0.3, CITY.block);
  for (let ix = 0; ix < CITY.blocks; ix++) {
    for (let iz = 0; iz < CITY.blocks; iz++) {
      const w = new THREE.Mesh(walkGeo, walkMat);
      w.position.set(-half + CITY.road + ix * step + CITY.block / 2, 0.15,
        -half + CITY.road + iz * step + CITY.block / 2);
      w.receiveShadow = true;
      group.add(w);
    }
  }

  // Kali Ciliwung along the east edge + bridge to Tanjung Priok.
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(120, half * 2 + 400),
    new THREE.MeshPhongMaterial({ color: 0x2f6a7a, shininess: 140, specular: 0xffc080 }),
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

  // Buildings: glass towers downtown, ruko shophouses mid-city, low houses at the edge.
  // v3: three landmark setback towers on Sudirman, blue-glass for the tallest
  // towers, three ruko facade variants — and the kampung blocks are left to
  // the informal-housing builder below instead of getting normal buildings.
  const glass = glassFacade(rng);
  const blueGlass = blueGlassFacade(rng);
  const rukoTexs = [rukoFacade(rng), rukoFacade(rng), rukoFacade(rng)];
  const LANDMARKS = [[-71, -71], [85, -71], [-71, 85]];
  const isLandmark = (cx, cz) => LANDMARKS.some(([lx, lz]) => lx === cx && lz === cz);
  const isKampung = (cx, cz) => cx >= KAMPUNG.x0 && cx <= KAMPUNG.x1 && cz >= KAMPUNG.z0 && cz <= KAMPUNG.z1;
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const spots = [];
  for (let ix = 0; ix < CITY.blocks; ix++) {
    for (let iz = 0; iz < CITY.blocks; iz++) {
      const cx = -half + CITY.road + ix * step + CITY.block / 2;
      const cz = -half + CITY.road + iz * step + CITY.block / 2;
      if (Math.abs(cx) < 45 && Math.abs(cz) < 45) continue; // Monas plaza stays open
      if (isLandmark(cx, cz) || isKampung(cx, cz)) continue;
      const dc = Math.max(Math.abs(cx), Math.abs(cz)) / half;
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
  const glassSpots = spots.filter((b) => b.dc < 0.55);
  const rukoSpots = spots.filter((b) => b.dc >= 0.55);
  // v4: every building is solid — feet, cars, peds and cops all bounce off.
  for (const b of spots) colliders.push({ x: b.x, z: b.z, hx: b.w / 2 + 0.3, hz: b.d / 2 + 0.3 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  function fillInstanced(list, mat, palette, glassy) {
    const inst = new THREE.InstancedMesh(bGeo, mat, list.length);
    inst.castShadow = true; inst.receiveShadow = true;
    list.forEach((b, i) => {
      p.set(b.x, 0.3, b.z); s.set(b.w, b.h, b.d);
      m4.compose(p, q, s); inst.setMatrixAt(i, m4);
      col.setHex(pick(rng, palette));
      if (glassy && b.dc < 0.25) col.offsetHSL(0.55, 0.12, -0.04);
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
    return inst;
  }
  // Tallest downtown towers get the blue Sudirman glass; the rest warm glass.
  fillInstanced(glassSpots.filter((b) => b.h > 70), new THREE.MeshLambertMaterial({ map: blueGlass }),
    [0x9fb4c4, 0x7e94a8, 0x8aa8c0, 0x6a8aa8], true);
  fillInstanced(glassSpots.filter((b) => b.h <= 70), new THREE.MeshLambertMaterial({ map: glass }),
    [0xd8b48a, 0xc9a06a, 0xb98d5f, 0x9fb4c4, 0x7e94a8, 0xd8c9a8, 0xa88a7a, 0x8a9a8a], true);
  // Ruko shophouses in three facade variants so the streets don't repeat.
  const rukoPalettes = [
    [0xe8dcc0, 0xd8c9a8, 0xc9b48a], [0xd8d8d8, 0xc9a06a, 0xe8dcc0], [0xc9b48a, 0xd8c9a8, 0xb8c9d8],
  ];
  for (let v = 0; v < 3; v++) {
    const sub = rukoSpots.filter((_, i) => i % 3 === v);
    if (sub.length) fillInstanced(sub, new THREE.MeshLambertMaterial({ map: rukoTexs[v] }), rukoPalettes[v], false);
  }
  // Landmark setback towers on Sudirman: stacked slabs + spire, like the
  // real skyline — each one reads as a different building, not a clone.
  const landmarkDefs = [
    { x: -71, z: -71, h: 185, tint: 0x7e94a8, tex: blueGlass },
    { x: 85, z: -71, h: 150, tint: 0xd8b48a, tex: glass, curved: true }, // v4.1: Wisma 46 — curved glass tower
    { x: -71, z: 85, h: 165, tint: 0x9fb4c4, tex: blueGlass },
  ];
  for (const lm of landmarkDefs) {
    const lmMat = new THREE.MeshLambertMaterial({ map: lm.tex, color: lm.tint });
    const tiers = [[26, lm.h * 0.55, 0], [20, lm.h * 0.3, lm.h * 0.55], [13, lm.h * 0.15, lm.h * 0.85]];
    for (const [w, h, y0] of tiers) {
      // v4.1: the curved tower is built from cylinders, not boxes — its
      // round glass shaft reads as Wisma 46 from the avenue.
      const tier = lm.curved
        ? new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 20), lmMat)
        : new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lmMat);
      tier.position.set(lm.x, 0.3 + y0 + h / 2, lm.z);
      tier.castShadow = true; tier.receiveShadow = true;
      group.add(tier);
    }
    if (lm.curved) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.2),
        new THREE.MeshBasicMaterial({ map: makeSignTexture('WISMA 46', '#1a2a44', '#9fd8ff', ''), side: THREE.DoubleSide }));
      sign.position.set(lm.x, 32, lm.z + 13.4); // south face, toward the avenue
      group.add(sign);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 16, 6),
      new THREE.MeshLambertMaterial({ color: 0x44484f }));
    spire.position.set(lm.x, 0.3 + lm.h + 8, lm.z); group.add(spire);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.4, 6, 6), beaconMat0());
    crown.position.set(lm.x, 0.3 + lm.h + 17, lm.z); group.add(crown);
    colliders.push({ x: lm.x, z: lm.z, hx: 13.5, hz: 13.5 }); // landmark base tier is solid
  }
  function beaconMat0() { return new THREE.MeshBasicMaterial({ color: 0xff4444 }); }
  // v4 (benchmark): ground-floor retail podiums — every tall downtown tower
  // and each landmark sits on a shopfront podium (KOPI SENJA, SATE 88, ...)
  // so the street level reads like the reference's CAFE SOL / TACOS row,
  // not a blank wall meeting the sidewalk.
  {
    const shopTex = shopfrontTexture();
    const shopMat = new THREE.MeshLambertMaterial({ map: shopTex });
    const podiumTops = new THREE.MeshLambertMaterial({ color: 0x8a7f72 });
    const podiums = [
      ...glassSpots.filter((b) => b.h > 70).map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
      ...landmarkDefs.map((lm) => ({ x: lm.x, z: lm.z, w: 26, d: 26 })),
    ];
    for (const pd of podiums) {
      const pw = pd.w + 4, pz = pd.d + 4;
      const base = new THREE.Mesh(new THREE.BoxGeometry(pw, 6, pz), shopMat);
      base.position.set(pd.x, 0.3 + 3, pd.z);
      base.castShadow = true; base.receiveShadow = true;
      group.add(base);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.6, 0.5, pz + 0.6), podiumTops);
      cap.position.set(pd.x, 0.3 + 6.2, pd.z);
      group.add(cap);
      colliders.push({ x: pd.x, z: pd.z, hx: pw / 2 + 0.3, hz: pz / 2 + 0.3 });
    }
  }
  // ---- KAMPUNG (v3): dense informal housing on the east side ----
  // Tiny houses crammed along narrow alleys, corrugated-iron roofs in rust
  // and faded paint, laundry lines strung between them, wires tangled
  // overhead. Two instanced meshes keep it cheap; laundry + wires are one
  // small set of meshes on top.
  {
    const kampungBlocks = [[241, 85], [319, 85], [241, 163], [319, 163]];
    const houses = [];
    for (const [bx, bz] of kampungBlocks) {
      for (let gx = -2; gx <= 2; gx++) {
        for (let gz = -2; gz <= 2; gz++) {
          if (Math.abs(gx) === 2 && Math.abs(gz) === 2 && rng() < 0.5) continue; // corner gaps
          const hx = bx + gx * 11 + rand(rng, -3, 3);
          const hz = bz + gz * 11 + rand(rng, -3, 3);
          // Leave the cross alleys walkable: no house on the centre lanes.
          if (Math.abs(hx - bx) < 2.5 || Math.abs(hz - bz) < 2.5) continue;
          houses.push({
            x: hx, z: hz, w: rand(rng, 5, 8.5), d: rand(rng, 5, 7.5),
            h: rand(rng, 3, 4.6) + (rng() < 0.25 ? 2.6 : 0),
            rot: (rng() < 0.5 ? 0 : Math.PI / 2) + rand(rng, -0.12, 0.12),
          });
        }
      }
    }
    const wallTex = corrugatedTexture(rng, '#b8a888');
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    wallGeo.translate(0, 0.5, 0);
    const walls = new THREE.InstancedMesh(wallGeo,
      new THREE.MeshLambertMaterial({ map: wallTex }), houses.length);
    walls.castShadow = true; walls.receiveShadow = true;
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    roofGeo.rotateX(Math.PI / 2); // triangular prism, axis along z = gable roof
    roofGeo.rotateZ(Math.PI); // flat side down
    const roofs = new THREE.InstancedMesh(roofGeo,
      new THREE.MeshLambertMaterial({ map: corrugatedTexture(rng, '#8a4a3a') }), houses.length);
    roofs.castShadow = true;
    const roofCols = [0x8a4a3a, 0x6a6a6a, 0x4a6a5a, 0xa85a2a, 0x7a7a7a, 0x5a5a6a];
    const wallCols = [0xd8c9a8, 0xc9b48a, 0xb8c9d8, 0xe8d8c9, 0x9a8a6a, 0x7a9a8a, 0xd8b8a8];
    const rq = new THREE.Quaternion(), eul = new THREE.Euler();
    houses.forEach((hs, i) => {
      colliders.push({ x: hs.x, z: hs.z, hx: hs.w / 2 + 0.2, hz: hs.d / 2 + 0.2 });
      eul.set(0, hs.rot, 0); rq.setFromEuler(eul);
      p.set(hs.x, 0.3, hs.z); s.set(hs.w, hs.h, hs.d);
      m4.compose(p, rq, s); walls.setMatrixAt(i, m4);
      col.setHex(pick(rng, wallCols)); walls.setColorAt(i, col);
      // Gable roof: prism scaled to the house footprint, ridge along the long side.
      const ridge = hs.w >= hs.d ? hs.w : hs.d;
      const span = hs.w >= hs.d ? hs.d : hs.w;
      p.set(hs.x, 0.3 + hs.h + span * 0.2, hs.z);
      // Prism axis is z: z-scale is the ridge length, x/y the cross-section.
      s.set(span * 0.55, span * 0.45, ridge * 0.55);
      eul.set(0, hs.rot + (hs.w >= hs.d ? Math.PI / 2 : 0), 0); rq.setFromEuler(eul);
      m4.compose(p, rq, s); roofs.setMatrixAt(i, m4);
      col.setHex(pick(rng, roofCols)); roofs.setColorAt(i, col);
    });
    walls.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    group.add(walls); group.add(roofs);
    // Laundry lines between houses + tangled wires overhead.
    const clothCols = [0xe8e4da, 0xd84a4a, 0x3a7bd8, 0xe8b93b, 0x3aa655, 0x8a4fbf, 0xe87a2e];
    const clothGeo = new THREE.PlaneGeometry(0.9, 1.1);
    const clothMat = clothCols.map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    const wirePts = [];
    let laundry = 0;
    for (let i = 0; i < houses.length - 1 && laundry < 16; i += 2) {
      const a = houses[i], b = houses[i + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 16) continue;
      const y = Math.min(a.h, b.h) + 0.8;
      for (let k = 0; k < 3; k++) {
        const t = 0.25 + k * 0.25;
        const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
        const cloth = new THREE.Mesh(clothGeo, clothMat[Math.floor(rng() * clothMat.length)]);
        cloth.position.set(cx, y - 0.6, cz);
        cloth.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
        cloth.rotation.z = rand(rng, -0.08, 0.08);
        group.add(cloth);
      }
      wirePts.push(new THREE.Vector3(a.x, 0.3 + y, a.z),
        new THREE.Vector3((a.x + b.x) / 2, 0.3 + y - 0.7, (a.z + b.z) / 2),
        new THREE.Vector3((a.x + b.x) / 2, 0.3 + y - 0.7, (a.z + b.z) / 2),
        new THREE.Vector3(b.x, 0.3 + y, b.z));
      laundry += 1;
    }
    // Extra tangled wires criss-crossing the alleys.
    for (let i = 0; i < 10; i++) {
      const a = houses[Math.floor(rng() * houses.length)];
      const b = houses[Math.floor(rng() * houses.length)];
      const y = 5 + rng() * 2;
      wirePts.push(new THREE.Vector3(a.x, y, a.z),
        new THREE.Vector3((a.x + b.x) / 2, y - 1.2, (a.z + b.z) / 2),
        new THREE.Vector3((a.x + b.x) / 2, y - 1.2, (a.z + b.z) / 2),
        new THREE.Vector3(b.x, y, b.z));
    }
    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
    group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
    // A couple of water tanks on the tallest roofs.
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x2a4a6a });
    houses.filter((h) => h.h > 5).slice(0, 3).forEach((h) => {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 8), tankMat);
      tank.position.set(h.x, 0.3 + h.h + 2.2, h.z); group.add(tank);
    });
  }
  addSign('KAMPUNG MELAYU', 'Gang Sempit — RT 04', 208, 60, Math.PI / 2, 13, '#3aa655');

  // ---- VENDORS (v3): kaki lima, gerobak, warung tenda, penjual keliling ----
  // Shared geometries/materials so ~15 stalls stay cheap.
  const vendorAnim = [];
  // v4.1 (ref 2): smoke over the food carts — sate, bakso and pecel lele
  // steam in the evening air. Each puff rises, grows and fades in a loop.
  const smokePuffs = [];
  function addSmoke(parent, x, y, z) {
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.3 });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat);
      puff.position.set(x, y, z);
      parent.add(puff);
      smokePuffs.push({ mesh: puff, mat, baseY: y, phase: i / 4 });
    }
  }
  const goodGeos = {
    sphere: new THREE.SphereGeometry(0.16, 8, 6),
    box: new THREE.BoxGeometry(0.3, 0.22, 0.3),
    cyl: new THREE.CylinderGeometry(0.11, 0.11, 0.32, 8),
    stick: new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5),
  };
  const goodMats = {
    orange: new THREE.MeshLambertMaterial({ color: 0xe87a2e }),
    green: new THREE.MeshLambertMaterial({ color: 0x3aa655 }),
    tan: new THREE.MeshLambertMaterial({ color: 0xd8b48a }),
    white: new THREE.MeshLambertMaterial({ color: 0xf2ead8 }),
    red: new THREE.MeshLambertMaterial({ color: 0xc23b2e }),
    brown: new THREE.MeshLambertMaterial({ color: 0x6a4a2a }),
  };
  const goodKinds = ['sphere', 'box', 'cyl'];
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const darkMatV = new THREE.MeshLambertMaterial({ color: 0x2e2a26 });
  function addGoods(stall, n, y, spread) {
    for (let i = 0; i < n; i++) {
      const kind = pick(rng, goodKinds);
      const mat = pick(rng, [goodMats.orange, goodMats.green, goodMats.tan, goodMats.white, goodMats.red]);
      const good = new THREE.Mesh(goodGeos[kind], mat);
      good.position.set(rand(rng, -spread, spread), y + (kind === 'cyl' ? 0.16 : 0.1), rand(rng, -spread * 0.6, spread * 0.6));
      stall.add(good);
    }
  }
  function vendorFigure(shirtHex, skinHex, hijabHex) {
    // Vendor behind a counter: head + torso + waving arm only (legs hidden).
    // v4: a face — eyes, brows, nose, mouth — so the vendor reads as a
    // person when Mara walks up to the stall. The hijab is flattened at the
    // front (z-scale 0.85) so the face sits proud of the scarf, not inside it.
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: shirtHex });
    const skin = new THREE.MeshLambertMaterial({ color: skinHex });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.38, 4, 10), shirt);
    torso.position.y = 1.24; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 10), skin);
    head.position.y = 1.79; g.add(head);
    if (hijabHex) {
      const hj = new THREE.Mesh(new THREE.SphereGeometry(0.295, 12, 10),
        new THREE.MeshLambertMaterial({ color: hijabHex }));
      hj.position.y = 1.8; hj.scale.set(1, 1.05, 0.85); g.add(hj);
      var face = addFace(g, { z: 0.26, skinMat: skin });
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
      hair.position.y = 1.82; g.add(hair);
      var face = addFace(g, { z: 0.205, skinMat: skin });
    }
    const armPivot = new THREE.Group();
    armPivot.position.set(0.33, 1.52, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 8), shirt);
    arm.position.y = -0.26; armPivot.add(arm);
    g.add(armPivot);
    const arm2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 8), shirt);
    arm2.position.set(-0.33, 1.26, 0); g.add(arm2);
    return { group: g, armPivot, head, face };
  }
  function addStallSign(stall, label, bg) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(label, '#22242a', '#ffd23b', ''), side: THREE.DoubleSide }));
    board.position.set(0, 3.4, 0); stall.add(board);
  }
  for (const sp of PLAZA_STALLS) {
    const stall = new THREE.Group();
    const face = Math.atan2(-sp.x, -sp.z); // face Monas
    if (sp.type === 'gerobak') {
      // Pushcart: wooden box on two wheels, goods on top, big umbrella.
      const cart = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.1), woodMat);
      cart.position.y = 0.9; stall.add(cart);
      for (const wx of [-0.95, 0.95]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10), darkMatV);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.42, 0); stall.add(wheel);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), darkMatV);
      pole.position.y = 2.4; stall.add(pole);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 10),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(sp.color) }));
      umb.position.y = 3.7; stall.add(umb);
      addGoods(stall, 7, 1.32, 0.7);
      const v = vendorFigure(pick(rng, [0xd84a4a, 0x3a7bd8, 0x3aa655, 0xe87a2e]), pick(rng, [0x8a5a3b, 0xc98d64, 0x6b4423]), rng() < 0.4 ? 0x8a4fbf : null);
      v.group.position.set(0, 0, -1.1); v.group.rotation.y = Math.PI;
      stall.add(v.group); vendorAnim.push(v);
    } else if (sp.type === 'tenda') {
      // Warung tenda: striped canopy on four poles, counter, goods, sign.
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 3.4),
        new THREE.MeshLambertMaterial({ map: stripedTexture(sp.color, '#f2ead8') }));
      canopy.position.y = 2.9; canopy.rotation.x = 0.08; stall.add(canopy);
      for (const [px, pz] of [[-2.1, -1.5], [2.1, -1.5], [-2.1, 1.5], [2.1, 1.5]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.9, 5), darkMatV);
        post.position.set(px, 1.45, pz); stall.add(post);
      }
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.6), woodMat);
      counter.position.set(0, 0.55, 0.6); stall.add(counter);
      addGoods(stall, 8, 1.12, 1.7);
      // A low stove with a steaming pot for the food stalls.
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.35, 10), darkMatV);
      pot.position.set(1.4, 1.3, 0.6); stall.add(pot);
      const v = vendorFigure(pick(rng, [0xe8b93b, 0x3aa655, 0xc23b7a, 0x2e8f8f]), pick(rng, [0x8a5a3b, 0xc98d64, 0xe8b88a]), rng() < 0.5 ? pick(rng, [0x3a7bd8, 0xd84a4a, 0x2a2a2a]) : null);
      v.group.position.set(0, 0, -0.7); v.group.rotation.y = Math.PI;
      stall.add(v.group); vendorAnim.push(v);
    } else {
      // Kaki lima: mat on the ground, low table, baskets of goods.
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4),
        new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
      mat.rotation.x = -Math.PI / 2; mat.position.y = 0.32; stall.add(mat);
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.4), woodMat);
      table.position.y = 0.6; stall.add(table);
      addGoods(stall, 8, 0.88, 1.0);
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.5, 8),
        new THREE.MeshLambertMaterial({ color: 0xa88a5a }));
      basket.position.set(1.5, 0.55, 0); stall.add(basket);
      const v = vendorFigure(pick(rng, [0x5a6a3a, 0xd84a4a, 0x8a4fbf]), pick(rng, [0x6b4423, 0xc98d64, 0xa06a42]), rng() < 0.4 ? 0x3aa655 : null);
      v.group.position.set(0, 0, -1.2); v.group.rotation.y = Math.PI;
      stall.add(v.group); vendorAnim.push(v);
    }
    addStallSign(stall, sp.label, sp.color);
    // v4.1 (ref 2): the food carts steam — smoke over the sate grill, the
    // bakso pot and the pecel lele stove.
    if (sp.label === 'SATE MADURA' || sp.label === 'PECEL LELE') addSmoke(stall, 1.4, 1.7, 0.6);
    if (sp.label === 'BAKSO MALANG') addSmoke(stall, 0, 1.6, 0);
    // v4: the plaza slab now sits at road height (top 0.06, was 0.6 — cars
    // used to sink into it), so stalls sit at 0.06 too, and every stall is
    // solid: nobody walks or drives through a gerobak.
    stall.position.set(sp.x, 0.06, sp.z);
    stall.rotation.y = face;
    group.add(stall);
    colliders.push({ x: sp.x, z: sp.z, hx: 2.4, hz: 2.2 });
  }
  // Penjual keliling: walking vendors with a shoulder basket, circling the plaza.
  const kelilingFigs = [];
  for (const k of KELILING) {
    const fig = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: new THREE.Color(k.color) });
    const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.38, 4, 10), shirt);
    torso.position.y = 1.24; fig.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 10), skin);
    head.position.y = 1.79; fig.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0x22242a }));
    cap.position.y = 1.94; fig.add(cap);
    // v4: the walking sellers have faces too.
    addFace(fig, { z: 0.205, skinMat: skin });
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 8), shirt);
      arm.position.set(0.33 * side, 1.26, 0); fig.add(arm);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.34, 4, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e3a4a }));
      thigh.position.set(0.13 * side, 0.76, 0); fig.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.36, 4, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e3a4a }));
      shin.position.set(0.13 * side, 0.28, 0); fig.add(shin);
    }
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0xa88a5a }));
    basket.position.set(0.3, 1.05, -0.32); fig.add(basket);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(k.label, '#22242a', '#ffd23b', ''), side: THREE.DoubleSide }));
    board.position.set(0, 2.5, 0); fig.add(board);
    group.add(fig);
    kelilingFigs.push({ fig, def: k, angle: k.phase, bob: 0 });
  }
  /** Vendors call out and serve: when a pedestrian browses a stall, the
   *  vendor reaches out to them instead of waving at the crowd. */
  function updateVendors(dt, now, peds) {
    // Stall vendors call out: one arm waves, head turns to the crowd.
    vendorAnim.forEach((v, i) => {
      const sp = PLAZA_STALLS[i];
      // v4.1: a buyer browsing this stall gets served, not waved at.
      let buyer = null;
      if (peds && sp) {
        let bd = 4.5;
        for (const p of peds) {
          const d = Math.hypot(p.mesh.position.x - sp.x, p.mesh.position.z - sp.z);
          if (d < bd) { bd = d; buyer = p; }
        }
      }
      if (buyer) {
        v.armPivot.rotation.x = lerp(v.armPivot.rotation.x, -1.5, clamp(dt * 6, 0, 1));
        v.armPivot.rotation.z = 0.1;
        v.head.rotation.y = Math.sin(now * 1.3 + i) * 0.35;
        if (v.face) v.face.rotation.y = v.head.rotation.y;
      } else {
        v.armPivot.rotation.x = -1.1 + Math.sin(now * 2.2 + i * 1.7) * 0.45;
        v.armPivot.rotation.z = 0.25;
        v.head.rotation.y = Math.sin(now * 0.7 + i * 2.3) * 0.5;
        if (v.face) v.face.rotation.y = v.head.rotation.y; // the face turns with the head
      }
    });
    // v4.1: food smoke rises, grows and fades, one puff after another.
    for (const s of smokePuffs) {
      const p = (now * 0.35 + s.phase) % 1;
      s.mesh.position.y = s.baseY + p * 2.0;
      const sc = 0.6 + p * 1.1;
      s.mesh.scale.set(sc, sc, sc);
      s.mat.opacity = 0.32 * (1 - p);
    }
    // Keliling vendors walk their slow circle around the plaza.
    for (const k of kelilingFigs) {
      k.angle += k.def.speed * dt;
      const x = Math.cos(k.angle) * k.def.radius;
      const z = Math.sin(k.angle) * k.def.radius;
      k.fig.position.set(x, 0.06 + Math.abs(Math.sin(now * 5 + k.angle * 10)) * 0.05, z);
      k.fig.rotation.y = Math.atan2(-Math.sin(k.angle) * Math.sign(k.def.speed), Math.cos(k.angle) * Math.sign(k.def.speed));
    }
  }

  // Rooftop beacons downtown.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  spots.filter((b) => b.h > 70).forEach((b) => {
    const bk = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), beaconMat);
    bk.position.set(b.x, 0.3 + b.h + 1, b.z); group.add(bk);
  });
  landmarkDefs.forEach((lm) => {
    const bk = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), beaconMat);
    bk.position.set(lm.x, 0.3 + lm.h + 1, lm.z); group.add(bk);
  });

  // ---- MONAS: the National Monument at the centre of Lapangan Merdeka ----
  // v4: the plaza slab is a thin plate at road height (top 0.06, flush with
  // the road strips) — the old 0.6 m box swallowed cars crossing the avenue.
  // The Monas base is solid: cars and feet stop at its marble wall.
  // v4 fix: the base is no longer a blank beige box — fluted marble, a gold
  // MONAS band, a gold trim ring and front steps, so it reads as a monument
  // instead of a void in the collision/weapons shots.
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(96, 0.12, 96),
    new THREE.MeshLambertMaterial({ map: sidewalkTexture(rng) }),
  );
  plaza.position.set(0, 0, 0); plaza.receiveShadow = true; group.add(plaza);
  // v4.1 (ref 2): Bundaran HI — a round fountain plaza on the south-east
  // corner of Lapangan Merdeka, with the Selamat Datang figure on top.
  // Solid, like everything else in v4: cars and feet stop at its rim.
  {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.5, 20),
      new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    rim.position.set(36, 0.31, 36); group.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.2, 20),
      new THREE.MeshPhongMaterial({ color: 0x4a90c8, shininess: 120, specular: 0xffe9a8 }));
    water.rotation.x = -Math.PI / 2; water.position.set(36, 0.58, 36); group.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 5, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    column.position.set(36, 3, 36); group.add(column);
    const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x3aa655 }));
    figure.position.set(36, 6.6, 36); group.add(figure);
    const figHead = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xc98d64 }));
    figHead.position.set(36, 7.8, 36); group.add(figHead);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8),
      new THREE.MeshBasicMaterial({ map: makeSignTexture('BUNDARAN HI', '#1a2a44', '#ffd23b', ''), side: THREE.DoubleSide }));
    sign.position.set(36, 1.6, 42.6); group.add(sign);
    colliders.push({ x: 36, z: 36, hx: 6.5, hz: 6.5 });
  }
  colliders.push({ x: 0, z: 0, hx: 13.3, hz: 16.8 }); // Monas base + front steps
  const monasTexC = document.createElement('canvas');
  monasTexC.width = 512; monasTexC.height = 256;
  {
    const g2 = monasTexC.getContext('2d');
    g2.fillStyle = '#d8cfc0'; g2.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 16) {
      g2.fillStyle = (x / 16) % 2 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)';
      g2.fillRect(x, 40, 8, 216);
    }
    g2.fillStyle = '#c9a227'; g2.fillRect(0, 0, 512, 40); // gold band at the top
    g2.fillStyle = '#3a2a00'; g2.font = 'bold 30px sans-serif'; g2.textAlign = 'center';
    g2.fillText('M O N A S', 256, 29);
    g2.fillStyle = 'rgba(0,0,0,0.25)'; g2.fillRect(0, 250, 512, 6);
  }
  const monasTex = new THREE.CanvasTexture(monasTexC);
  monasTex.colorSpace = THREE.SRGBColorSpace;
  const monasBase = new THREE.Mesh(
    new THREE.BoxGeometry(26, 14, 26),
    new THREE.MeshLambertMaterial({ map: monasTex }),
  );
  monasBase.position.set(0, 7, 0); monasBase.castShadow = true; group.add(monasBase);
  const monasTrim = new THREE.Mesh(new THREE.BoxGeometry(27, 0.8, 27),
    new THREE.MeshLambertMaterial({ color: 0xc9a227 }));
  monasTrim.position.set(0, 13.8, 0); group.add(monasTrim);
  // Front steps on the south face, ascending toward the base.
  const stepMat = new THREE.MeshLambertMaterial({ color: 0xc9bfa8 });
  [[30, 0.25, 16.4], [28, 0.5, 15.2], [26, 0.75, 14.1]].forEach(([w, h, z]) => {
    const st = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.6), stepMat);
    st.position.set(0, 0.06 + h / 2, z); st.receiveShadow = true; group.add(st);
  });
  const obelisk = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 9, 118, 4, 1),
    new THREE.MeshLambertMaterial({ color: 0xf2ead8 }),
  );
  obelisk.position.set(0, 14 + 59, 0);
  obelisk.rotation.y = Math.PI / 4;
  obelisk.castShadow = true;
  group.add(obelisk);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 14, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc93b }),
  );
  flame.position.set(0, 14 + 118 + 7, 0); group.add(flame);
  const flameCore = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe98a }),
  );
  flameCore.position.set(0, 14 + 118 + 1, 0); group.add(flameCore);
  // Red-white flags around the plaza.
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  for (const [fx, fz] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 16, 5), flagMat);
    pole.position.set(fx, 8, fz); group.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.1), redMat);
    flag.position.set(fx + 2.6, 14, fz); group.add(flag);
    const flagW = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    flagW.position.set(fx + 2.6, 11.4, fz); group.add(flagW);
  }

  // ---- Street signs: Sudirman / Thamrin avenue, Monas, bengkel, halte ----
  function addSign(text, sub, x, z, ry, w = 12, bg = '#0b5fa5') {
    const tex = makeSignTexture(text, bg, '#ffffff', sub);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(w, sub ? w * 0.375 : w * 0.25),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 5),
      new THREE.MeshLambertMaterial({ color: 0x44484f }));
    pole.position.set(x, 3.5, z); group.add(pole);
    board.position.set(x, 7.2, z); board.rotation.y = ry; group.add(board);
  }
  addSign('JL. SUDIRMAN', '', -8, -120, Math.PI / 2);
  addSign('JL. MH THAMRIN', '', 8, 120, -Math.PI / 2);
  addSign('MONAS', 'Lapangan Merdeka', -52, 8, Math.PI / 2, 13, '#3aa655');
  addSign('BENGKEL MARA', 'Jl. Raya Bogor', -142, -128, Math.PI / 4, 13, '#c23b2e');
  addSign('HALTE TRANSJAKARTA', 'Koridor 1 — Blok M–Kota', 10, -46, Math.PI / 2, 14, '#e87a2e');
  addSign('DILARANG PARKIR', '', 52, 96, 0, 11, '#c23b2e');
  addSign('SATU ARAH', '', -96, 52, Math.PI / 2, 10, '#0b5fa5');

  // ---- TransJakarta halte (bus shelter) on the Sudirman avenue ----
  const halte = new THREE.Group();
  const halteRoof = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: 0xe87a2e }));
  halteRoof.position.y = 4.4; halte.add(halteRoof);
  const halteGlass = new THREE.Mesh(new THREE.BoxGeometry(20, 3.4, 0.2),
    new THREE.MeshPhongMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.4 }));
  halteGlass.position.y = 2.4; halte.add(halteGlass);
  for (const hx of [-9, 9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x44484f }));
    post.position.set(hx, 2.2, 0); halte.add(post);
  }
  const halteSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('TRANSJAKARTA', '#e87a2e', '#ffffff', ''), side: THREE.DoubleSide }));
  halteSign.position.set(0, 5.6, 0); halte.add(halteSign);
  halte.position.set(12, 0, -52);
  group.add(halte);
  colliders.push({ x: 12, z: -52, hx: 10.5, hz: 3.5 }); // halte shelter is solid

  // ---- Warung stalls on sidewalk blocks (block-centre coords, never on a road) ----
  const warungSpots = [
    [-227, -71, 'WARUNG KOPI', '#c23b2e'], [85, 85, 'NASI GORENG', '#e87a2e'],
    [-149, 163, 'SATE AYAM', '#3aa655'], [163, -71, 'BAKSO', '#0b5fa5'],
    [85, -149, 'GORENGAN', '#e8b93b'], [-149, 85, 'ES TEH', '#4fc2c2'],
  ];
  for (const [wx, wz, label, awn] of warungSpots) {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x7a5a38 }));
    counter.position.y = 0.6; stall.add(counter);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 3.2),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(awn) }));
    awning.position.y = 2.6; awning.rotation.x = 0.12; stall.add(awning);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(label, '#22242a', '#ffd23b', ''), side: THREE.DoubleSide }));
    board.position.set(0, 3.4, 0); stall.add(board);
    for (const px of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 5),
        new THREE.MeshLambertMaterial({ color: 0x44484f }));
      post.position.set(px, 1.3, 1.2); stall.add(post);
    }
    stall.position.set(wx, 0.3, wz);
    stall.rotation.y = (wx + wz) % 2 === 0 ? 0 : Math.PI / 2;
    group.add(stall);
    colliders.push({ x: wx, z: wz, hx: 2.5, hz: 2.0 }); // warung counter is solid
  }

  // ---- v4: LOS SANTOS BUSTLE, JAKARTA SOUL ----
  // Big billboards on the Sudirman towers + one freestanding roadside board,
  // neon shop signs on street corners, and working traffic lights at four
  // busy intersections. All fictional brands — the bustle is the reference,
  // not a setting change: Monas, kampung, warung and rupiah stay.
  const BILLBOARDS = [
    { text: 'KOPI SENJA', sub: 'Nikmatnya sore Jakarta', bg: '#6a3a1a', x: -71, y: 42, z: -57.6, ry: 0 },
    { text: 'SATE 88', sub: 'Buka sampai tengah malam', bg: '#c23b2e', x: 71.6, y: 38, z: -71, ry: -Math.PI / 2 },
    { text: 'NASI GORENG', sub: 'Pedasnya nendang', bg: '#e87a2e', x: -71, y: 46, z: 71.6, ry: Math.PI },
    { text: 'PULSA MURAH', sub: 'Semua operator — 24 jam', bg: '#0b5fa5', x: 76, y: 9, z: 96, ry: Math.PI },
  ];
  for (const b of BILLBOARDS) {
    // v4: the freestanding board is smaller (16 m) and set back from the
    // avenue so it no longer covers the HUD cash in the driving shots.
    // v4.1: set back to z=96, deep in the block — even its corner no longer
    // intrudes into the chase camera's frame on the avenue.
    const bw = b.x === 76 ? 16 : 22, bh = b.x === 76 ? 6 : 8.25;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(b.text, b.bg, '#ffffff', b.sub), side: THREE.DoubleSide }));
    board.position.set(b.x, b.y, b.z); board.rotation.y = b.ry; group.add(board);
    if (b.x === 76) {
      // Freestanding board: two posts down to the sidewalk.
      for (const px of [-7, 7]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 6),
          new THREE.MeshLambertMaterial({ color: 0x44484f }));
        post.position.set(b.x + px, 4, b.z); group.add(post);
      }
    }
  }
  // Neon signs: bright unlit planes that read as glowing shop signs at dusk.
  const NEON = [
    { text: 'KOPI', bg: '#ff2e88', x: -32, z: 40, ry: 0 },
    { text: 'SATE', bg: '#ff7a00', x: 52, z: -32, ry: Math.PI / 2 },
    { text: '24 JAM', bg: '#00c2c2', x: -110, z: 52, ry: 0 },
    { text: 'PULSA', bg: '#b83bff', x: 124, z: -38, ry: -Math.PI / 2 },
    { text: 'ES TEH', bg: '#37c978', x: 40, z: 124, ry: Math.PI },
    { text: 'DANGDUT', bg: '#ffd23b', x: -38, z: -116, ry: Math.PI / 2 },
  ];
  const neonMats = [];
  for (const n of NEON) {
    const mat = new THREE.MeshBasicMaterial({
      map: makeSignTexture(n.text, n.bg, '#ffffff', ''), side: THREE.DoubleSide,
      transparent: true, opacity: 1,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), mat);
    sign.position.set(n.x, 6.2, n.z); sign.rotation.y = n.ry; group.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.2, 5),
      new THREE.MeshLambertMaterial({ color: 0x44484f }));
    pole.position.set(n.x, 3.1, n.z); group.add(pole);
    neonMats.push(mat);
  }
  // Traffic lights at four intersections: one head each, cycling green →
  // yellow → red on a 12 s loop (opposite phases on the two axes).
  const LIGHTS = [
    { x: -27, z: 51, ry: Math.PI }, { x: -27, z: -105, ry: 0 },
    { x: 129, z: 51, ry: Math.PI }, { x: 129, z: -27, ry: Math.PI / 2 },
  ];
  const trafficLights = [];
  const bulbOn = { red: 0xff2a2a, yellow: 0xffc93b, green: 0x37e06a };
  const bulbOff = { red: 0x3a0d0d, yellow: 0x3a2d0d, green: 0x0d2a16 };
  for (const L of LIGHTS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x22242a }));
    pole.position.set(L.x, 3.2, L.z); group.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.8, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x111214 }));
    box.position.set(L.x, 6.6, L.z); box.rotation.y = L.ry; group.add(box);
    const bulbs = {};
    for (const [key, dy] of [['red', 1], ['yellow', 0], ['green', -1]]) {
      const mat = new THREE.MeshBasicMaterial({ color: bulbOff[key] });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat);
      bulb.position.set(L.x, 6.6 + dy * 0.85, L.z);
      // Push the bulb just out of the box face it points to.
      bulb.position.x += Math.sin(L.ry) * 0.4;
      bulb.position.z += Math.cos(L.ry) * 0.4;
      group.add(bulb);
      bulbs[key] = mat;
    }
    trafficLights.push(bulbs);
  }
  /** v4 city life, called every step: traffic-light cycle + neon flicker. */
  function updateCityLife(dt, now) {
    const t = now % 12;
    const phase = t < 5 ? 'green' : t < 6 ? 'yellow' : 'red';
    for (const bulbs of trafficLights) {
      for (const key of ['red', 'yellow', 'green']) {
        bulbs[key].color.setHex(phase === key ? bulbOn[key] : bulbOff[key]);
      }
    }
    neonMats.forEach((mat, i) => {
      // One sign buzzes: a soft flicker, never fully dark.
      mat.opacity = 0.82 + 0.18 * Math.sin(now * 2.6 + i * 2.1);
    });
  }

  // Trees: trembesi canopies along the avenue + palms kept near the river.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x5aa844 });
  const treeCount = 150;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.6, 7, 6), trunkMat, treeCount);
  const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(2.8, 8, 6), leafMat, treeCount);
  const canopies2 = new THREE.InstancedMesh(new THREE.SphereGeometry(2.0, 8, 6), leafMat2, treeCount);
  for (let i = 0; i < treeCount; i++) {
    const along = rand(rng, -half, half);
    // v4.1: trees sit 13 m off the road centre (was 9, then 11) — deep
    // enough on the sidewalk that neither trunk nor canopy fills the chase
    // camera's frame when it drives the avenue; canopies are smaller too.
    const lane = pick(rng, [-1, 1]) * (CITY.road / 2 + 6);
    const vertical = rng() < 0.5;
    const x = vertical ? along : pick(rng, [-half, half]) + (rng() < 0.5 ? -1 : 1) * (CITY.block / 2);
    const z = vertical ? lane + Math.floor(rand(rng, 0, CITY.blocks)) * step - half : along;
    p.set(x, 3.8, z); s.set(1, 1, 1); m4.compose(p, q, s);
    trunks.setMatrixAt(i, m4);
    p.y = 8.2; m4.compose(p, q, s); canopies.setMatrixAt(i, m4);
    p.set(x + 1.6, 7.2, z + 0.8); m4.compose(p, q, s); canopies2.setMatrixAt(i, m4);
  }
  trunks.castShadow = true; canopies.castShadow = true;
  group.add(trunks); group.add(canopies); group.add(canopies2);
  // Lamps.
  // v4.1: lamps stand mid-block on the sidewalk (road centre ± 11), never
  // at a corner on the avenue strip — the old corner placement put a pole
  // 3 m from the chase camera in the driving shots.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x44484f });
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampCount = 90;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 6), bulbMat, lampCount);
  for (let i = 0; i < lampCount; i++) {
    const gx = -half + Math.floor(rand(rng, 0, CITY.blocks + 1)) * step + CITY.road / 2
      + pick(rng, [-1, 1]) * (CITY.road / 2 + 4);
    const gz = -half + Math.floor(rand(rng, 0, CITY.blocks)) * step + CITY.road + 10 + rand(rng, 0, CITY.block - 20);
    p.set(gx, 3.5, gz); s.set(1, 1, 1); m4.compose(p, q, s); lamps.setMatrixAt(i, m4);
    p.y = 7.1; m4.compose(p, q, s); bulbs.setMatrixAt(i, m4);
  }
  group.add(lamps); group.add(bulbs);

  // Landmark: Gelora Bung Karno stadium bowl (south-west) + Monas is at the centre.
  const stadium = new THREE.Mesh(
    new THREE.CylinderGeometry(42, 46, 14, 24, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8, side: THREE.DoubleSide }),
  );
  stadium.position.set(-half + 60, 7, half - 60); group.add(stadium);

  // Wet-road puddles left by the afternoon rain: glossy, sun-catching ellipses.
  const puddleMat = new THREE.MeshPhongMaterial({
    color: 0x9aa8b8, transparent: true, opacity: 0.5, shininess: 160, specular: 0xffd9a0,
  });
  for (let i = 0; i < 26; i++) {
    const vertical = rng() < 0.5;
    const road = -half + Math.floor(rand(rng, 0, CITY.blocks + 1)) * step + CITY.road / 2;
    const along = rand(rng, -half + 20, half - 20);
    const pud = new THREE.Mesh(new THREE.CircleGeometry(rand(rng, 2.5, 5.5), 14), puddleMat);
    pud.rotation.x = -Math.PI / 2;
    pud.scale.set(1.6, 1, 1);
    pud.position.set(vertical ? road + rand(rng, -3, 3) : along, 0.07, vertical ? along : road + rand(rng, -3, 3));
    group.add(pud);
  }

  // Sky: gradient dome (shader) + low golden sun + haze fog.
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x5a90c8) },
    horizonColor: { value: new THREE.Color(0xffb070) },
    sunDir: { value: new THREE.Vector3(-0.8, 0.25, -0.4).normalize() },
    sunColor: { value: new THREE.Color(0xffd9a0) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide, fog: false, depthWrite: false,
    vertexShader: `varying vec3 vDir; void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 topColor; uniform vec3 horizonColor;
      uniform vec3 sunDir; uniform vec3 sunColor;
      void main() {
        float h = clamp(vDir.y * 1.6 + 0.12, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.75));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 10.0) * 0.30);
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 16), skyMat);
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(55, 24),
    new THREE.MeshBasicMaterial({ color: 0xffdf8a, fog: false }),
  );
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x8a6a4a, 0.9);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffc080, 1.9);
  sunLight.castShadow = true; // long afternoon shadows
  sunLight.shadow.mapSize.set(1024, 1024); // 1024 keeps SwiftShader headless renders fast
  sunLight.shadow.camera.left = -260; sunLight.shadow.camera.right = 260;
  sunLight.shadow.camera.top = 260; sunLight.shadow.camera.bottom = -260;
  sunLight.shadow.camera.near = 10; sunLight.shadow.camera.far = 1600;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight); scene.add(sunLight.target);
  scene.fog = new THREE.Fog(0xd8a06a, 200, 850);

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
    group, sky, skyMat, sun, sunLight, hemi, rain, updateVendors, updateCityLife,
    vendorAnim, // v4.1: exposed so the playtest can watch the serve gesture
    colliders, // v4: solid-city AABBs for feet, cars, peds and police
    /** hour 0..24, weather 'clear'|'rain'|'fog'. Golden-hour afternoon by default. */
    updateSky(hour, weather) {
      const t = (hour - 6) / 12; // 0 at dawn, 1 at dusk (sunset ~18:00)
      const day = clamp(Math.sin(Math.PI * clamp(t, 0, 1)), 0, 1);
      // Sharper dusk falloff: 16:30–17:00 still reads as afternoon, true
      // sunset colours only arrive after ~17:30.
      const dusk = clamp(1 - Math.min(t, 1 - t) * 6, 0, 1) * (t > 0 && t < 1 ? 1 : 0);
      const sunA = Math.PI * clamp(t, 0, 1);
      const sx = Math.cos(sunA) * 1200, sy = Math.sin(sunA) * 900 + 40;
      sun.position.set(sx, Math.max(sy, 30), -700);
      sun.lookAt(0, 60, 0);
      sun.material.color.setHex(day > 0.15 ? 0xffdf8a : 0xff9a5a);
      // Low warm sun: long shadows in the afternoon, softer at noon.
      // Afternoon stays bright: the sun is low but the sky is still up.
      sunLight.position.set(sx, Math.max(sy, 60), -400);
      sunLight.intensity = 0.7 + day * 1.8;
      sunLight.color.setHex(dusk > 0.6 ? 0xff9a50 : (hour >= 15 && hour <= 18.5 ? 0xffc080 : 0xffe0b0));
      hemi.intensity = 0.55 + day * 0.6;
      const top = new THREE.Color(), hor = new THREE.Color();
      if (day < 0.12) { top.setHex(0x141c33); hor.setHex(0x2a2440); } // night
      else if (dusk > 0.6) { top.setHex(0x4a6a9a); hor.setHex(0xff7a3a); } // sunset
      else if (hour >= 15 && hour <= 18.5) { top.setHex(0x6a9fd0); hor.setHex(0xffc070); } // golden afternoon
      else { top.setHex(0x87b8dd); hor.setHex(0xcfd8e0); } // midday
      if (dusk > 0.2 && dusk <= 0.45) hor.lerp(new THREE.Color(0xff7a3a), dusk);
      if (weather === 'fog') { top.lerp(new THREE.Color(0xb8bcc0), 0.55); hor.lerp(new THREE.Color(0xc8b8a8), 0.55); }
      if (weather === 'rain') { top.lerp(new THREE.Color(0x5a6a7a), 0.5); hor.lerp(new THREE.Color(0x8a7a6a), 0.5); }
      skyUniforms.topColor.value.copy(top);
      skyUniforms.horizonColor.value.copy(hor);
      skyUniforms.sunDir.value.set(sx, Math.max(sy, 30), -700).normalize();
      // Warm Jakarta haze: closer and thicker than the old desert fog.
      scene.fog.color.copy(hor).lerp(top, 0.35);
      scene.fog.near = weather === 'fog' ? 55 : (hour >= 15 && hour <= 18.5 ? 170 : 220);
      scene.fog.far = weather === 'fog' ? 300 : (weather === 'rain' ? 550 : (hour >= 15 && hour <= 18.5 ? 780 : 950));
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
