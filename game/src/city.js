// city.js — JAKARTA in the late afternoon: Monas at the centre, the wide
// Sudirman / MH Thamrin avenue, TransJakarta halte, angkot lanes, warung
// stalls, ruko shophouses, and a golden-hour sky with haze and wet roads
// after the rain. All original, built on Three.js primitives + canvas textures.
import * as THREE from 'three';
import { mulberry32, rand, pick, clamp, lerp } from './util.js';

export const CITY = {
  blocks: 9, block: 64, road: 14,
  get half() { return (this.blocks * (this.block + this.road)) / 2; },
};
export const ROAD_Y = 0.02;

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
  g.fillStyle = '#45484f'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 58 + Math.floor(rng() * 42);
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
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9a938a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${rng() * 0.12})`;
    g.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glassFacade(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7e94a8'); grad.addColorStop(1, '#5a6e80');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 16) {
    for (let x = 8; x < 120; x += 14) {
      const lit = rng() < 0.45;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#bfe6ff') : '#1d2733';
      g.fillRect(x, y, 9, 11);
    }
  }
  // Warm sunset reflection band across the glass.
  g.fillStyle = 'rgba(255,170,90,0.28)';
  g.fillRect(0, 60, 128, 34);
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

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'JakartaCity';
  scene.add(group);
  const half = CITY.half;
  const step = CITY.block + CITY.road;

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
  const roadMat = new THREE.MeshPhongMaterial({ color: 0x4a4e57, shininess: 80, specular: 0x667788 });
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
  const glass = glassFacade(rng);
  const ruko = rukoFacade(rng);
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const spots = [];
  for (let ix = 0; ix < CITY.blocks; ix++) {
    for (let iz = 0; iz < CITY.blocks; iz++) {
      const cx = -half + CITY.road + ix * step + CITY.block / 2;
      const cz = -half + CITY.road + iz * step + CITY.block / 2;
      if (Math.abs(cx) < 45 && Math.abs(cz) < 45) continue; // Monas plaza stays open
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
  fillInstanced(glassSpots, new THREE.MeshLambertMaterial({ map: glass }),
    [0xd8b48a, 0xc9a06a, 0xb98d5f, 0x9fb4c4, 0x7e94a8, 0xd8c9a8, 0xa88a7a, 0x8a9a8a], true);
  fillInstanced(rukoSpots, new THREE.MeshLambertMaterial({ map: ruko }),
    [0xe8dcc0, 0xd8c9a8, 0xc9b48a, 0xd8d8d8, 0xc9a06a], false);
  // Rooftop beacons downtown.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  spots.filter((b) => b.h > 70).forEach((b) => {
    const bk = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), beaconMat);
    bk.position.set(b.x, 0.3 + b.h + 1, b.z); group.add(bk);
  });

  // ---- MONAS: the National Monument at the centre of Lapangan Merdeka ----
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(96, 0.6, 96),
    new THREE.MeshLambertMaterial({ map: sidewalkTexture(rng) }),
  );
  plaza.position.set(0, 0.3, 0); plaza.receiveShadow = true; group.add(plaza);
  const monasBase = new THREE.Mesh(
    new THREE.BoxGeometry(26, 14, 26),
    new THREE.MeshLambertMaterial({ color: 0xd8cfc0 }),
  );
  monasBase.position.set(0, 7, 0); monasBase.castShadow = true; group.add(monasBase);
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

  // ---- Warung stalls on sidewalk blocks (block-centre coords, never on a road) ----
  const warungSpots = [
    [-71, -71, 'WARUNG KOPI', '#c23b2e'], [85, 85, 'NASI GORENG', '#e87a2e'],
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
  }

  // Trees: trembesi canopies along the avenue + palms kept near the river.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x5aa844 });
  const treeCount = 150;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.6, 7, 6), trunkMat, treeCount);
  const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(3.2, 8, 6), leafMat, treeCount);
  const canopies2 = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 8, 6), leafMat2, treeCount);
  for (let i = 0; i < treeCount; i++) {
    const along = rand(rng, -half, half);
    const lane = pick(rng, [-1, 1]) * (CITY.road / 2 + 2);
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
    group, sky, skyMat, sun, sunLight, hemi, rain,
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
