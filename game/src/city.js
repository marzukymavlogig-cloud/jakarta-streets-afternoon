// city.js — Jakarta itself: a 9x9-grid city (~700 m) around Lapangan
// Merdeka, with Monas, Wisma 46, Sudirman towers, the kampung, Kali
// Ciliwung, GBK, 13 vendor stalls, and ~214 solid colliders so feet, cars,
// peds and cops slide along walls instead of passing through.
import * as THREE from 'three';
import { clamp, lerp, rand, pick, textTexture, mulberry32 } from './util.js';
import { buildPersonMesh, SKIN_TONES } from './player.js';

export const ROAD_X = [-312, -234, -156, -78, 0, 78, 156, 234, 312];
export const ROAD_Z = [-266, -188, -110, -32, 46, 124, 202, 280];

const FACADE_COLORS = [0x8a7a68, 0x6b7a8a, 0x9a8a7a, 0x7a6b5a, 0x5a6b7a, 0x8a6b5a, 0xa89a80];
const GLASS_COLORS = [0x3a6a8a, 0x2a5a7a, 0x4a7a9a, 0x35586e];
const RUKO_SIGNS = ['TOKO', 'WARUNG', 'BENGKEL', 'FOTOKOPI', 'LAUNDRY', 'PULSA', 'WARTEG', 'KOPI SENJA'];

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3d3d44';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${50 + Math.random() * 45},${50 + Math.random() * 45},${55 + Math.random() * 45},0.5)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  // Tyre-wear bands along the driving direction.
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(60, 0, 22, 256);
  x.fillRect(174, 0, 22, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function facadeTexture(base, sign, glass) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 256);
  if (glass) {
    x.fillStyle = 'rgba(90,160,200,0.85)';
    for (let r = 0; r < 12; r++) {
      for (let col = 0; col < 4; col++) {
        x.fillStyle = Math.random() < 0.5 ? 'rgba(120,190,230,0.9)' : 'rgba(40,70,100,0.9)';
        x.fillRect(8 + col * 30, 30 + r * 18, 24, 12);
      }
    }
  } else {
    x.fillStyle = 'rgba(255,230,150,0.85)';
    for (let r = 0; r < 10; r++) {
      for (let col = 0; col < 4; col++) {
        if (Math.random() < 0.55) x.fillRect(10 + col * 30, 34 + r * 21, 20, 13);
      }
    }
  }
  if (sign) {
    x.fillStyle = '#1d3a24';
    x.fillRect(0, 0, 128, 26);
    x.fillStyle = '#ffffff';
    x.font = 'bold 17px Arial';
    x.textAlign = 'center';
    x.fillText(sign, 64, 18);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildCity(G) {
  const rng = mulberry32(20261118);
  const group = new THREE.Group();
  G.scene.add(group);
  const colliders = [];
  const vendorAnim = [];
  const stalls = [];
  const trafficLights = [];
  const smoke = [];
  const addCollider = (x, z, hx, hz) => {
    colliders.push({ x, z, hx, hz });
    return colliders[colliders.length - 1];
  };

  // --- Ground + roads -----------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760),
    new THREE.MeshStandardMaterial({ color: 0x4a5244, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const roadTex = groundTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.55, metalness: 0.25 });
  for (const rx of ROAD_X) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(14, 760), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(rx, 0.01, 0);
    r.material.map = roadTex.clone();
    r.material.map.repeat.set(1, 24);
    r.material.map.needsUpdate = true;
    r.receiveShadow = true;
    group.add(r);
  }
  for (const rz of ROAD_Z) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(760, 14), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.012, rz);
    r.material.map = roadTex.clone();
    r.material.map.repeat.set(24, 1);
    r.material.map.needsUpdate = true;
    r.receiveShadow = true;
    group.add(r);
  }
  // Sidewalks: lighter strips flanking the two main avenues.
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95 });
  for (const rz of [46, -32]) {
    for (const s of [-11, 11]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(760, 3.4), walkMat);
      w.rotation.x = -Math.PI / 2;
      w.position.set(0, 0.015, rz + s);
      w.receiveShadow = true;
      group.add(w);
    }
  }
  // Zebra crossings on the avenue.
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  for (const [cx, cz] of [[0, 46], [78, 46], [-78, 46], [0, -32]]) {
    for (let i = -3; i <= 3; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 12), zebraMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(cx + i * 2, 0.02, cz);
      group.add(s);
    }
  }
  // Wet-road puddles (26), sun-catching.
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.08, metalness: 0.9 });
  for (let i = 0; i < 26; i++) {
    const road = pick(ROAD_Z);
    const p = new THREE.Mesh(new THREE.CircleGeometry(rand(1.2, 2.6), 12), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(rand(-320, 320), 0.02, road + rand(-4, 4));
    group.add(p);
  }

  // --- Lapangan Merdeka + Monas -------------------------------------------
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.9 });
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(96, 0.12, 96), plazaMat);
  plaza.position.set(0, -0.08, 0); // top at -0.02: below the road planes (y 0.01), so the avenue reads as asphalt where it crosses the plaza
  plaza.receiveShadow = true;
  group.add(plaza);
  // Monas pedestal (solid, front face z = 13.3) + obelisk + gold flame.
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
  const base = box(26.6, 3, 26.6, whiteMat, 0, 1.5, 0, group);
  addCollider(0, 0, 13.3, 13.3);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 4.2, 66, 8),
    whiteMat);
  shaft.position.set(0, 36, 0);
  shaft.castShadow = true;
  group.add(shaft);
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.25, metalness: 0.9, emissive: 0x664400 });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), flameMat);
  flame.position.set(0, 71.5, 0);
  flame.scale.y = 1.5;
  group.add(flame);
  const flameCore = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe98a }));
  flameCore.position.set(0, 71.5, 0);
  group.add(flameCore);
  // 4 red-white flags around the plaza.
  for (const [fx, fz] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole.position.set(fx, 4.5, fz);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4, 1, 1),
      new THREE.MeshBasicMaterial({ map: textTexture('', { w: 64, h: 32, bg: '#cc2222', fg: '#ffffff' }), side: THREE.DoubleSide }));
    flag.position.set(fx + 1.3, 7.8, fz);
    group.add(flag);
    const flagW = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    flagW.position.set(fx + 1.3, 7.1, fz);
    group.add(flagW);
  }

  // --- Wisma 46: curved glass cylinder tower -------------------------------
  const wismaMat = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.15, metalness: 0.7 });
  const wisma = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 150, 24), wismaMat);
  wisma.position.set(-195, 75, -195);
  wisma.castShadow = true;
  group.add(wisma);
  const wismaSign = new THREE.Mesh(new THREE.PlaneGeometry(26, 5),
    new THREE.MeshBasicMaterial({ map: textTexture('WISMA 46', { w: 512, h: 96, bg: '#0a2a44', fg: '#9fd8ff', font: 64 }) }));
  wismaSign.position.set(-195, 118, -195 + 17.2);
  group.add(wismaSign);
  addCollider(-195, -195, 17, 17);

  // --- Sudirman setback towers --------------------------------------------
  const towerSpots = [[39, -117, 185], [117, -39, 160], [-39, 117, 150]];
  for (const [tx, tz, th] of towerSpots) {
    const glass = pick(GLASS_COLORS);
    const mat = new THREE.MeshStandardMaterial({ color: glass, roughness: 0.2, metalness: 0.6 });
    const w = rand(24, 30), d = rand(24, 30);
    let y = 0;
    let ww = w, dd = d;
    for (let s = 0; s < 3; s++) {
      const h = th / 3;
      const slab = box(ww, h, dd, mat, tx, y + h / 2, tz, group);
      slab.castShadow = true;
      y += h;
      ww *= 0.82; dd *= 0.82;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 14, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    spire.position.set(tx, y + 7, tz);
    group.add(spire);
    addCollider(tx, tz, w / 2 + 0.5, d / 2 + 0.5);
    // Retail podium under the tower.
    const podium = box(w + 8, 7, d + 8,
      new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.8 }), tx, 3.5, tz, group);
    const podSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2),
      new THREE.MeshBasicMaterial({ map: textTexture(pick(RUKO_SIGNS), { w: 512, h: 112, bg: '#202020', fg: '#ffd23c', font: 64 }) }));
    podSign.position.set(tx, 5.5, tz + d / 2 + 4.2);
    group.add(podSign);
  }

  // --- Bundaran HI fountain, plaza south-east ------------------------------
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8, 1.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.7 }));
  rim.position.set(60, 0.6, 60);
  rim.castShadow = true;
  group.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.8, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a9ac8, roughness: 0.1, metalness: 0.4 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(60, 1.15, 60);
  group.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 7, 10),
    new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }));
  column.position.set(60, 4.5, 60);
  group.add(column);
  const figure = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.8, roughness: 0.3 }));
  figure.position.set(60, 8.6, 60);
  group.add(figure);
  const hiSign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8),
    new THREE.MeshBasicMaterial({ map: textTexture('BUNDARAN HI', { w: 512, h: 100, bg: '#0a2a44', fg: '#ffffff', font: 64 }) }));
  hiSign.position.set(60, 3.2, 60 + 8.2);
  group.add(hiSign);
  addCollider(60, 60, 6.5, 6.5);

  // --- Named places ---------------------------------------------------------
  function namedBuilding(x, z, w, h, d, label, color) {
    const m = box(w, h, d, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }), x, h / 2, z, group);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(24, w * 0.9), 3),
      new THREE.MeshBasicMaterial({ map: textTexture(label, { w: 512, h: 64, bg: '#1d3a24', fg: '#ffffff', font: 44 }) }));
    sign.position.set(x, h * 0.75, z + d / 2 + 0.2);
    group.add(sign);
    addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
    return m;
  }
  namedBuilding(-150, -155, 30, 10, 22, 'BENGKEL MARA', 0x7a4a2b); // garage
  namedBuilding(-273, 195, 90, 16, 60, 'GELORA BUNG KARNO', 0x8a8a8a); // stadium bowl (no collider? keep one: stands are solid)
  namedBuilding(195, -117, 26, 22, 20, 'HOTEL MELATI', 0xb89a6a);
  namedBuilding(-273, 117, 34, 9, 24, 'MANGGA DUA', 0x5a6b7a); // dealer
  namedBuilding(260, -260, 40, 12, 26, 'TANJUNG PRIOK', 0x4a5a6a);
  // Pantai Ancol: sand strip + sign on the north edge.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(200, 26),
    new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, -338);
  group.add(sand);
  const ancolSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3),
    new THREE.MeshBasicMaterial({ map: textTexture('PANTAI ANCOL', { w: 512, h: 96, bg: '#0a5a7a', fg: '#ffffff', font: 56 }) }));
  ancolSign.position.set(0, 4, -326);
  group.add(ancolSign);
  // Kali Ciliwung: river strip on the east edge + bridge.
  const river = new THREE.Mesh(new THREE.PlaneGeometry(36, 720),
    new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.2, metalness: 0.3 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(322, 0.02, 0);
  group.add(river);
  const bridge = box(40, 1.2, 20, new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.8 }), 322, 0.6, 46, group);
  // Kampung sign.
  const kampungSign = new THREE.Mesh(new THREE.PlaneGeometry(18, 3),
    new THREE.MeshBasicMaterial({ map: textTexture('KAMPUNG MELAYU — Gang Sempit RT 04', { w: 1024, h: 128, bg: '#5a1f1f', fg: '#ffe9a8', font: 56 }) }));
  kampungSign.position.set(200, 5, 40);
  kampungSign.rotation.y = Math.PI / 2;
  group.add(kampungSign);

  // --- Generic buildings in the blocks ------------------------------------
  const blockX = [-273, -195, -117, -39, 39, 117, 195, 273];
  const blockZ = [-227, -149, -71, 7, 85, 163, 241];
  const inPlaza = (x, z) => Math.abs(x) < 62 && Math.abs(z) < 62;
  const inKampung = (x, z) => x > 195 && x < 352 && z > 38 && z < 222;
  const inRiver = (x) => x > 298;
  const nearNamed = (x, z) => {
    for (const [nx, nz, r] of [[-150, -155, 26], [-273, 195, 55], [195, -117, 22], [-273, 117, 26], [260, -260, 28], [-195, -195, 24], [60, 60, 12]]) {
      if (Math.hypot(x - nx, z - nz) < r) return true;
    }
    return false;
  };
  for (const bx of blockX) {
    for (const bz of blockZ) {
      if (inPlaza(bx, bz) || inKampung(bx, bz) || inRiver(bx) || nearNamed(bx, bz)) continue;
      const downtown = Math.abs(bx) < 170 && Math.abs(bz) < 170;
      const n = downtown ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const jx = bx + (rng() - 0.5) * 30;
        const jz = bz + (rng() - 0.5) * 30;
        if (inPlaza(jx, jz) || inKampung(jx, jz) || nearNamed(jx, jz)) continue;
        const w = 14 + rng() * 14, d = 14 + rng() * 14;
        const h = downtown ? 30 + rng() * 80 : 10 + rng() * 18;
        const ruko = !downtown && rng() < 0.6;
        const mat = new THREE.MeshStandardMaterial({
          map: facadeTexture(
            '#' + pick(FACADE_COLORS).toString(16).padStart(6, '0'),
            ruko ? pick(RUKO_SIGNS) : null,
            downtown && rng() < 0.6,
          ),
          roughness: 0.85,
        });
        const b = box(w, h, d, mat, jx, h / 2, jz, group);
        addCollider(jx, jz, w / 2 + 0.4, d / 2 + 0.4);
      }
    }
  }

  // --- Kampung: ~70 corrugated houses on narrow alleys ---------------------
  const kampungMats = [0x8a5a3a, 0x6b6b6b, 0x4a6b4a, 0x7a3a3a, 0x5a5a5a].map((c) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.35 }));
  const roofMats = [0xa83c2a, 0x7a2a2a, 0x5a5a5a, 0x8a6a3a].map((c) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  let houseCount = 0;
  const wirePts = [];
  const laundryPts = [];
  for (let cx = 0; cx < 7; cx++) {
    for (let cz = 0; cz < 10; cz++) {
      const hx = 208 + cx * 20 + (rng() - 0.5) * 6;
      const hz = 48 + cz * 18 + (rng() - 0.5) * 5;
      const w = 7 + rng() * 3, d = 6 + rng() * 3, h = 3.2 + rng() * 1.6;
      const house = box(w, h, d, kampungMats[Math.floor(rng() * kampungMats.length)], hx, h / 2, hz, group);
      // Gable roof: two sloped slabs.
      const roofMat = roofMats[Math.floor(rng() * roofMats.length)];
      for (const s of [-1, 1]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.14, d * 0.62), roofMat);
        slab.position.set(hx, h + 0.75, hz + s * d * 0.26);
        slab.rotation.x = s * 0.62;
        group.add(slab);
      }
      addCollider(hx, hz, w / 2 + 0.3, d / 2 + 0.3);
      houseCount++;
      if (rng() < 0.3) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 8),
          new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.7 }));
        tank.position.set(hx + w / 3, h + 1.6, hz);
        group.add(tank);
      }
      // Laundry line to the next house, and a sagging wire.
      if (cx < 6) {
        const nx = hx + 20;
        laundryPts.push(hx, h + 1.2, hz, nx, h + 1.2, hz);
        for (let i = 0; i < 3; i++) {
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1),
            new THREE.MeshStandardMaterial({ color: pick([0xe8e8e8, 0xd9577e, 0x5b8dd9, 0xe8a13c]), side: THREE.DoubleSide }));
          cloth.position.set(hx + 5 + i * 5, h + 0.7, hz);
          group.add(cloth);
        }
      }
      if (cz < 9) wirePts.push(hx, h + 2.2, hz, hx, h + 2.2, hz + 18);
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x111111 })));
  const laundryGeo = new THREE.BufferGeometry();
  laundryGeo.setAttribute('position', new THREE.Float32BufferAttribute(laundryPts, 3));
  group.add(new THREE.LineSegments(laundryGeo, new THREE.LineBasicMaterial({ color: 0xdddddd })));

  // --- Vendor stalls (13) ---------------------------------------------------
  const STALLS = [
    { name: 'BAKSO MALANG', type: 'gerobak', x: 56, z: 0, smoke: true },
    { name: 'NASI GORENG', type: 'tenda', x: 14, z: 56, smoke: true },
    { name: 'SATE AYAM', type: 'gerobak', x: -40, z: 60, smoke: true },
    { name: 'GORENGAN', type: 'kaki', x: 40, z: 60, smoke: false },
    { name: 'ES TEH MANIS', type: 'gerobak', x: -56, z: 0, smoke: false },
    { name: 'MIE AYAM', type: 'tenda', x: 0, z: -56, smoke: true },
    { name: 'KOPI', type: 'gerobak', x: 14, z: -54, smoke: false },
    { name: 'SOTO', type: 'tenda', x: -14, z: -54, smoke: true },
    { name: 'BUAH POTONG', type: 'kaki', x: 54, z: 14, smoke: false },
    { name: 'JAJAN PASAR', type: 'kaki', x: -54, z: 14, smoke: false },
    { name: 'KETOPRAK', type: 'gerobak', x: 54, z: -14, smoke: false },
    { name: 'ES CAMPUR', type: 'gerobak', x: -54, z: -14, smoke: false },
    { name: 'PECEL LELE', type: 'tenda', x: 24, z: 64, smoke: true },
  ];
  const umbrellaCols = [0xc23b3b, 0x2e6fb0, 0xe8a13c, 0x1faa59];
  for (const s of STALLS) {
    const stall = new THREE.Group();
    stall.position.set(s.x, 0, s.z);
    // Face the plaza centre so vendors look at the crowd.
    stall.rotation.y = Math.atan2(-s.x, -s.z);
    group.add(stall);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
    if (s.type === 'gerobak') {
      const cart = box(2.2, 0.8, 1.4, wood, 0, 0.7, 0, stall);
      for (const wx of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12),
          new THREE.MeshStandardMaterial({ color: 0x222222 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx * 1.1, 0.42, 0);
        stall.add(wheel);
      }
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: pick(umbrellaCols), roughness: 0.7 }));
      umb.position.y = 2.6;
      stall.add(umb);
      const poleU = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888 }));
      poleU.position.y = 1.9;
      stall.add(poleU);
    } else if (s.type === 'tenda') {
      const counter = box(3, 1, 1.6, wood, 0, 0.5, 0, stall);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 2.4),
        new THREE.MeshStandardMaterial({ color: pick([0xc23b3b, 0x2e6fb0, 0xe8a13c]), roughness: 0.7 }));
      canopy.position.y = 2.4;
      canopy.rotation.z = 0.08;
      stall.add(canopy);
      for (const [px, pz] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x888888 }));
        pole.position.set(px, 1.2, pz);
        stall.add(pole);
      }
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 }));
      pot.position.set(0.7, 1.2, 0);
      stall.add(pot);
    } else {
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 1, side: THREE.DoubleSide }));
      mat.rotation.x = -Math.PI / 2;
      mat.position.y = 0.06;
      stall.add(mat);
      const table = box(1.4, 0.5, 1.0, wood, 0, 0.25, 0, stall);
      for (let i = 0; i < 3; i++) {
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.25, 8),
          new THREE.MeshStandardMaterial({ color: 0xa8834a, roughness: 0.9 }));
        basket.position.set(-0.4 + i * 0.4, 0.62, 0);
        stall.add(basket);
      }
    }
    // Goods on the counter.
    for (let i = 0; i < 4; i++) {
      const good = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
        new THREE.MeshStandardMaterial({ color: pick([0xe8a13c, 0xc23b3b, 0x1faa59, 0xf2e6c9]) }));
      good.position.set(-0.7 + i * 0.45, 1.15, 0.2);
      stall.add(good);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7),
      new THREE.MeshBasicMaterial({ map: textTexture(s.name, { w: 512, h: 140, bg: '#202020', fg: '#ffe9a8', font: 72 }) }));
    sign.position.set(0, 2.1, 0.6);
    stall.add(sign);
    // Vendor figure behind the counter, facing the crowd.
    const vOpts = {
      skin: pick(SKIN_TONES),
      hijab: Math.random() < 0.45,
      cap: Math.random() < 0.25,
      glasses: Math.random() < 0.2,
      moustache: Math.random() < 0.3,
    };
    const { group: vMesh, parts } = buildPersonMesh(vOpts);
    vMesh.position.set(0, 0, -1.1);
    vMesh.rotation.y = 0;
    stall.add(vMesh);
    vendorAnim.push({
      armPivot: parts.armR, armL: parts.armL, vendor: vMesh, stall: s,
      phase: rng() * Math.PI * 2, serving: false,
    });
    stalls.push({ ...s, mesh: stall });
    addCollider(s.x, s.z, 1.8, 1.4);
    if (s.smoke) {
      for (let i = 0; i < 3; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.45 }));
        puff.position.set(s.x, 1.6 + i * 0.7, s.z);
        puff.userData.baseY = 1.6 + i * 0.7;
        puff.userData.off = i * 0.33;
        group.add(puff);
        smoke.push(puff);
      }
    }
  }

  // --- 3 penjual keliling (walking sellers) ---------------------------------
  const keliling = [];
  for (const [name, x, z] of [['JUS', 20, 30], ['ROKOK & PULSA', -20, -30], ['KACANG', 30, -20]]) {
    const { group: km, parts } = buildPersonMesh({ skin: pick(SKIN_TONES), cap: true });
    km.position.set(x, 0, z);
    group.add(km);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 }));
    basket.position.set(0.35, 1.0, 0);
    km.add(basket);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3),
      new THREE.MeshBasicMaterial({ map: textTexture(name, { w: 256, h: 80, bg: '#202020', fg: '#ffffff', font: 44 }) }));
    sign.position.set(0, 1.85, 0.1);
    km.add(sign);
    keliling.push({ mesh: km, parts, angle: Math.atan2(z, x), r: Math.hypot(x, z), phase: 0 });
  }

  // --- TransJakarta halte shelter on the avenue ------------------------------
  const halte = new THREE.Group();
  halte.position.set(-20, 0, 35);
  group.add(halte);
  const shelter = box(10, 0.25, 3, new THREE.MeshStandardMaterial({ color: 0xd84a1f, roughness: 0.5 }), 0, 2.6, 0, halte);
  for (const [px, pz] of [[-4.5, -1.2], [4.5, -1.2], [-4.5, 1.2], [4.5, 1.2]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x666666 }));
    pole.position.set(px, 1.3, pz);
    halte.add(pole);
  }
  const bench = box(8, 0.5, 0.8, new THREE.MeshStandardMaterial({ color: 0x5a4a3a }), 0, 0.5, 0.6, halte);
  const hSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4),
    new THREE.MeshBasicMaterial({ map: textTexture('HALTE TRANSJAKARTA', { w: 512, h: 112, bg: '#d84a1f', fg: '#ffffff', font: 56 }) }));
  hSign.position.set(0, 3.4, 0);
  halte.add(hSign);
  addCollider(-20, 35, 5.2, 1.8);

  // --- Street signs -----------------------------------------------------------
  const signDefs = [
    ['JL. SUDIRMAN', 4, 54], ['JL. MH THAMRIN', -4, 54], ['MONAS', 8, -8],
    ['BENGKEL MARA', -142, -132], ['DILARANG PARKIR', 12, 54], ['SATU ARAH', -12, 38],
  ];
  for (const [text, sx, sz] of signDefs) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole.position.set(sx, 1.6, sz);
    group.add(pole);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: textTexture(text, { w: 512, h: 128, bg: '#1d3a24', fg: '#ffffff', font: 56 }), side: THREE.DoubleSide }));
    sg.position.set(sx, 3.1, sz);
    group.add(sg);
  }

  // --- Billboards + neon signs -------------------------------------------------
  const billboards = [
    ['KOPI SENJA', 39, -100, 0], ['SATE 88', -100, 39, Math.PI / 2],
    ['NASI GORENG', 100, -39, -Math.PI / 2], ['PULSA MURAH', 96, 96, Math.PI],
  ];
  for (const [text, bx, bz, ry] of billboards) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 5),
      new THREE.MeshBasicMaterial({ map: textTexture(text, { w: 512, h: 180, bg: '#202020', fg: '#ffd23c', font: 84 }) }));
    b.position.set(bx, 26, bz);
    b.rotation.y = ry;
    group.add(b);
    addCollider(bx, bz, 0.6, 0.6);
  }
  const neonDefs = [
    ['WARTEG 24 JAM', -60, 60], ['KOPI SENJA', 60, -60], ['ES TEH', -100, -60],
    ['SATE MADURA', 100, 60], ['PULSA', -60, -100], ['BAKSO', 60, 100],
  ];
  const neonMeshes = [];
  for (const [text, nx, nz] of neonDefs) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4),
      new THREE.MeshBasicMaterial({ map: textTexture(text, { w: 512, h: 112, bg: '#111111', fg: pick(['#ff5a8a', '#4ad9ff', '#ffd23c']), font: 64 }) }));
    n.position.set(nx, 8, nz);
    n.rotation.y = Math.atan2(-nx, -nz);
    group.add(n);
    neonMeshes.push(n);
  }

  // --- Traffic lights (12 s cycle) at 4 intersections -------------------------
  for (const [lx, lz] of [[0, 46], [78, 46], [-78, 46], [0, -32]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(lx + 7.5, 2.75, lz + 7.5);
    group.add(pole);
    const housing = box(0.7, 1.6, 0.5, new THREE.MeshStandardMaterial({ color: 0x111111 }), lx + 7.5, 5.2, lz + 7.5, group);
    const mk = (color, y) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color }));
      m.position.set(lx + 7.5, y, lz + 7.78);
      group.add(m);
      return m;
    };
    trafficLights.push({
      red: mk(0xff2222, 5.7), yellow: mk(0x442200, 5.2), green: mk(0x113311, 4.7),
      phase: 0,
    });
  }

  // --- Trees (13 m off the road centre) + lamps --------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a6b2e, roughness: 1 });
  let treeN = 0;
  for (const rz of ROAD_Z) {
    for (let i = 0; i < 6; i++) {
      const tx = -280 + i * 110 + (rng() - 0.5) * 40;
      const tz = rz + 13;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 6), trunkMat);
      trunk.position.set(tx, 1.7, tz);
      trunk.castShadow = true;
      group.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(rand(1.8, 2.6), 10, 8), leafMat);
      canopy.position.set(tx, 4.4, tz);
      canopy.scale.y = 0.75;
      canopy.castShadow = true;
      group.add(canopy);
      addCollider(tx, tz, 0.5, 0.5);
      treeN++;
    }
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.5 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rz of [46, -32, 124]) {
    for (let i = 0; i < 8; i++) {
      const lx = -280 + i * 80;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), lampMat);
      pole.position.set(lx, 3, rz + 11);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampGlow);
      head.position.set(lx, 6.1, rz + 11);
      group.add(head);
    }
  }
  // Plaza benches, on the diagonals so the x=0 / z=0 driving lines stay clear.
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    const bx = Math.cos(a) * 34, bz = Math.sin(a) * 34;
    box(2.4, 0.5, 0.8, new THREE.MeshStandardMaterial({ color: 0x5a4a3a }), bx, 0.35, bz, group);
    addCollider(bx, bz, 1.3, 0.5);
  }

  G.city = {
    group, colliders, vendorAnim, stalls, trafficLights, smoke, keliling,
    neonMeshes, houseCount,
  };
  return G.city;
}

// Vendors wave to the crowd; when a ped browses at their stall they hold
// the arm out serving instead.
export function updateVendors(G, dt, t) {
  for (const v of G.city.vendorAnim) {
    let serving = false;
    for (const ped of G.peds) {
      if (Math.hypot(ped.mesh.position.x - v.stall.x, ped.mesh.position.z - v.stall.z) < 3.5 && ped.pause > 0.5) {
        serving = true;
        break;
      }
    }
    v.serving = serving;
    const target = serving ? -1.5 : -0.5 + Math.sin(t * 2 + v.phase) * 0.45;
    v.armPivot.rotation.x = lerp(v.armPivot.rotation.x, target, Math.min(1, dt * 4));
    v.armL.rotation.x = lerp(v.armL.rotation.x, serving ? -0.4 : 0, Math.min(1, dt * 4));
  }
}

export function updateCity(G, dt, t) {
  updateVendors(G, dt, t);
  // Traffic lights: 12 s cycle, green 5 s / yellow 1 s / red 5 s / yellow 1 s.
  for (const tl of G.city.trafficLights) {
    tl.phase = (tl.phase + dt) % 12;
    const p = tl.phase;
    const green = p < 5, yellow = (p >= 5 && p < 6) || (p >= 11), red = p >= 6 && p < 11;
    tl.green.material.color.setHex(green ? 0x22ff44 : 0x113311);
    tl.yellow.material.color.setHex(yellow ? 0xffcc22 : 0x442200);
    tl.red.material.color.setHex(red ? 0xff2222 : 0x441111);
  }
  // Smoke puffs rise and loop.
  for (const puff of G.city.smoke) {
    puff.userData.off += dt * 0.25;
    const k = puff.userData.off % 1;
    puff.position.y = puff.userData.baseY + k * 2.4;
    puff.material.opacity = 0.45 * (1 - k);
    puff.scale.setScalar(0.7 + k * 1.1);
  }
  // Keliling sellers walk slow circles around the plaza.
  for (const k of G.city.keliling) {
    k.angle += dt * 0.03;
    k.phase += dt * 4;
    const x = Math.cos(k.angle) * k.r;
    const z = Math.sin(k.angle) * k.r;
    k.mesh.position.set(x, 0, z);
    k.mesh.rotation.y = Math.atan2(-Math.sin(k.angle), -Math.cos(k.angle)) + Math.PI;
    k.parts.legL.rotation.x = Math.sin(k.phase) * 0.4;
    k.parts.legR.rotation.x = -Math.sin(k.phase) * 0.4;
    k.parts.armL.rotation.x = -Math.sin(k.phase) * 0.3;
  }
  // Neon flicker.
  for (let i = 0; i < G.city.neonMeshes.length; i++) {
    const n = G.city.neonMeshes[i];
    n.visible = Math.sin(t * 3 + i * 1.7) > -0.85;
  }
}
