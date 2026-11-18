// city.js — Jakarta itself: a 9x9-grid city (~700 m) at golden hour.
// Monas on Lapangan Merdeka, Wisma 46, Bundaran HI, Sudirman glass towers,
// ruko shophouses, a kampung of corrugated houses, the Ciliwung river, GBK
// stadium, Tanjung Priok, Mangga Dua, Ancol beach, Hotel Melati, and the
// kaki lima stalls that ring the plaza. Everything solid: every building,
// tower, kampung house, stall and the Monas base registers an AABB collider
// so feet, cars, peds and cops slide along walls instead of passing through.
import * as THREE from 'three';
import { clamp, lerp, dist2, pick, range, rangeInt, signTexture, facadeTexture, asphaltTexture, pavingTexture, addFace, SKIN_TONES } from './util.js';

const ROADS = [-312, -234, -156, -78, 0, 78, 156, 234, 312];
const BLOCKS = [-273, -195, -117, -39, 39, 117, 195, 273];

const STALL_DEFS = [
  { name: 'BAKSO MALANG', kind: 'gerobak', x: 56, z: 0 },
  { name: 'SATE MADURA', kind: 'gerobak', x: -56, z: 0 },
  { name: 'NASI GORENG', kind: 'tenda', x: 14, z: 56 },
  { name: 'ES TEH MANIS', kind: 'tenda', x: 0, z: -56 },
  { name: 'GORENGAN', kind: 'kaki', x: 40, z: 60 },
  { name: 'SATE AYAM', kind: 'tenda', x: -40, z: 60 },
  { name: 'MIE AYAM', kind: 'gerobak', x: 40, z: -40 },
  { name: 'JAJAN PASAR', kind: 'kaki', x: -40, z: -40 },
  { name: 'KOPI SENJA', kind: 'gerobak', x: 18, z: -60 },
  { name: 'KETOPRAK', kind: 'tenda', x: -18, z: 60 },
  { name: 'ES CAMPUR', kind: 'kaki', x: 60, z: 18 },
  { name: 'SOTO AYAM', kind: 'tenda', x: -60, z: -18 },
  { name: 'PECEL LELE', kind: 'tenda', x: 24, z: 64 },
];

const RUKO_SIGNS = ['TOKO', 'WARUNG', 'BENGKEL', 'FOTOKOPI', 'LAUNDRY', 'WARTEG', 'PULSA', 'KOPI SENJA', 'SATE 88', 'NASI GORENG', 'ES TEH'];
const STREET_SIGNS = [
  { t: 'JL. SUDIRMAN', x: -100, z: 40 }, { t: 'JL. MH THAMRIN', x: 100, z: -40 },
  { t: 'MONAS', x: -20, z: 52 }, { t: 'BENGKEL MARA', x: -150, z: -140 },
  { t: 'HALTE TRANSJAKARTA', x: 60, z: 40 }, { t: 'DILARANG PARKIR', x: 120, z: 46 },
  { t: 'SATU ARAH', x: -60, z: -46 }, { t: 'KAMPUNG MELAYU', x: 230, z: 120, sub: 'Gang Sempit RT 04' },
];

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function mat(color, rough = 0.9, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

// A tiny standing figure for vendors: capsule body, egg head, face, one
// waving/serving arm on a pivot the city update swings.
function makeVendorFigure(rng, skinHex) {
  const g = new THREE.Group();
  const shirt = mat(pick(rng, [0xc0392b, 0x2e86c1, 0x27ae60, 0xe67e22, 0x8e44ad, 0xf1c40f]));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 10), shirt);
  body.position.y = 1.0; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.7 }));
  head.position.y = 1.62; head.scale.set(0.92, 1.08, 0.95); head.castShadow = true;
  g.add(head);
  addFace(head, skinHex, { moustache: rng() < 0.4 });
  if (rng() < 0.45) { // cap or hijab
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(pick(rng, [0x222222, 0xc0392b, 0x2e86c1])));
    cap.position.y = 1.68; g.add(cap);
  }
  const armPivot = new THREE.Group();
  armPivot.position.set(0.3, 1.32, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), shirt);
  arm.position.y = -0.26; arm.castShadow = true;
  armPivot.add(arm);
  g.add(armPivot);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), shirt);
  armL.position.set(-0.3, 1.05, 0); armL.rotation.z = 0.25;
  g.add(armL);
  g.userData.armPivot = armPivot;
  return g;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const vendorAnim = [];
  const stalls = [];
  const smokePuffs = [];
  const trafficLights = [];
  const city = { colliders, vendorAnim, stalls, smokePuffs, trafficLights, rng };

  // ------------------------------------------------------------ sky + light
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x3d5a8f) },
    horizonColor: { value: new THREE.Color(0xf7b267) },
    sunDir: { value: new THREE.Vector3(0.4, 0.35, -0.8).normalize() },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.62));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.75, 0.4) * pow(s, 90.0) * 1.4;   // sun disc glow
        col += vec3(1.0, 0.6, 0.25) * pow(s, 8.0) * 0.28;   // wide haze
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 16), skyMat);
  scene.add(sky);
  city.skyMat = skyMat; city.skyUniforms = skyUniforms;

  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(320, 260, -420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -380; sun.shadow.camera.right = 380;
  sun.shadow.camera.top = 380; sun.shadow.camera.bottom = -380;
  sun.shadow.camera.far = 1400; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  city.sun = sun;
  const hemi = new THREE.HemisphereLight(0x9db8e8, 0x8a6f52, 0.85);
  scene.add(hemi);
  city.hemi = hemi;
  scene.fog = new THREE.Fog(0xe8b07a, 170, 780);

  // ------------------------------------------------------------ ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(780, 780),
    new THREE.MeshStandardMaterial({ map: pavingTexture(), color: 0xb99c86, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  // Roads: dark asphalt strips along every grid line, with zebra crossings.
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), color: 0x9aa0a8, roughness: 0.55, metalness: 0.15 });
  for (const c of ROADS) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(780, 16), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, c); h.receiveShadow = true;
    scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(16, 780), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.02, 0); v.receiveShadow = true;
    scene.add(v);
  }
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d8 });
  for (const [zx, zz] of [[-78, 46], [78, -46], [-156, 78], [156, -78], [0, 156], [0, -156]]) {
    for (let i = -2; i <= 2; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6), zebraMat);
      s.rotation.x = -Math.PI / 2; s.position.set(zx + i * 3, 0.04, zz);
      scene.add(s);
    }
  }
  // Kali Ciliwung: a river strip along the east edge, with a bridge.
  const river = new THREE.Mesh(new THREE.PlaneGeometry(40, 780),
    new THREE.MeshStandardMaterial({ color: 0x2e6b7a, roughness: 0.25, metalness: 0.4 }));
  river.rotation.x = -Math.PI / 2; river.position.set(360, 0.03, 0);
  scene.add(river);
  const bridge = box(60, 1, 20, mat(0x8a8f96), 340, 0.5, 78);
  scene.add(bridge);

  // Wet-road puddles that catch the low sun.
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0xbfd4e6, roughness: 0.08, metalness: 0.7 });
  for (let i = 0; i < 26; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(range(rng, 1.2, 3.2), 14), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(pick(rng, ROADS) + range(rng, -5, 5), 0.05, pick(rng, ROADS) + range(rng, -5, 5));
    scene.add(p);
  }

  // ------------------------------------------------------------ Monas plaza
  const plaza = box(96, 0.12, 96, mat(0xd8d2c4, 0.95), 0, 0.06, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);
  // Monas: white tapered obelisk, gold flame + core, stepped base, 4 flags.
  const base = box(26.6, 3, 26.6, mat(0xe8e4da), 0, 1.5, 0);
  scene.add(base);
  colliders.push({ x: 0, z: 0, hx: 13.3, hz: 13.3 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 5.5, 118, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }));
  shaft.position.set(0, 62, 0); shaft.castShadow = true;
  scene.add(shaft);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(3.4, 9, 8),
    new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.25, metalness: 0.9, emissive: 0x664400 }));
  flame.position.set(0, 125, 0);
  scene.add(flame);
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.2, emissive: 0x553300 }));
  core.position.set(0, 120, 0);
  scene.add(core);
  city.monasFlame = flame;
  for (const [fx, fz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 9, 6), mat(0xcccccc, 0.4, 0.6));
    pole.position.set(fx, 4.5, fz); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xcc1122, side: THREE.DoubleSide }));
    flag.position.set(fx + 1.3, 8, fz); scene.add(flag);
    const flagW = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    flagW.position.set(fx + 1.3, 7.2, fz); scene.add(flagW);
  }

  // Bundaran HI fountain on the (78,78) roundabout: rim, water, column,
  // Selamat Datang figure, sign. Solid.
  const fount = new THREE.Group();
  fount.position.set(78, 0, 78);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.7, 10, 28), mat(0xcfc8b8));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; rim.castShadow = true;
  fount.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x3f9db5, roughness: 0.15, metalness: 0.5 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.7;
  fount.add(water);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 7, 10), mat(0xe8e4da));
  col.position.y = 4; col.castShadow = true;
  fount.add(col);
  const figure = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mat(0xd8b25a, 0.4, 0.8));
  figure.position.y = 8.2; fount.add(figure);
  const fsign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2),
    new THREE.MeshBasicMaterial({ map: signTexture('BUNDARAN HI', '#0d5c46', '#ffffff', 'SELAMAT DATANG') }));
  fsign.position.set(0, 2.2, 7.6); fount.add(fsign);
  scene.add(fount);
  colliders.push({ x: 78, z: 78, hx: 6.5, hz: 6.5 });
  city.fountain = fount;

  // ------------------------------------------------------------ towers
  // Wisma 46: a curved glass cylinder tower with its sign on the south face.
  const wisma = new THREE.Group();
  wisma.position.set(-117, 0, -195);
  const wismaBody = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, 150, 24),
    new THREE.MeshStandardMaterial({ color: 0x5a7fa8, roughness: 0.25, metalness: 0.55 }));
  wismaBody.position.y = 75; wismaBody.castShadow = true;
  wisma.add(wismaBody);
  const wismaTop = new THREE.Mesh(new THREE.CylinderGeometry(16, 13, 12, 24), mat(0x3a5a7a, 0.4, 0.4));
  wismaTop.position.y = 156; wisma.add(wismaTop);
  const wismaSign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.5),
    new THREE.MeshBasicMaterial({ map: signTexture('WISMA 46', '#123a5c', '#ffd700') }));
  wismaSign.position.set(0, 96, 17.2); wisma.add(wismaSign);
  scene.add(wisma);
  colliders.push({ x: -117, z: -195, hx: 19, hz: 19 });

  // Sudirman landmark setback towers: stacked slabs + spire, blue glass.
  const towerDefs = [
    { x: -39, z: -117, h: 185, w: 26 }, { x: 39, z: -117, h: 150, w: 24 },
    { x: -117, z: -39, h: 165, w: 25 },
  ];
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x4a7fb5, roughness: 0.2, metalness: 0.6 });
  for (const t of towerDefs) {
    const g = new THREE.Group();
    g.position.set(t.x, 0, t.z);
    let y = 0, w = t.w;
    for (let s = 0; s < 3; s++) {
      const slabH = t.h * (s === 0 ? 0.55 : s === 1 ? 0.3 : 0.15);
      const slab = box(w, slabH, w, s === 0 ? glassMat : mat(0x6a8fb5, 0.35, 0.4), 0, y + slabH / 2, 0);
      g.add(slab);
      y += slabH; w *= 0.78;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 18, 8), mat(0xdddddd, 0.4, 0.7));
    spire.position.y = y + 9; g.add(spire);
    // retail podium at the foot: KOPI SENJA / SATE 88 / NASI GORENG ...
    const podium = box(t.w + 8, 6, t.w + 8, mat(0xc9a06a), 0, 3, 0);
    g.add(podium);
    const psign = new THREE.Mesh(new THREE.PlaneGeometry(t.w, 2.4),
      new THREE.MeshBasicMaterial({ map: signTexture(pick(rng, ['KOPI SENJA', 'SATE 88', 'NASI GORENG', 'ES TEH', 'PULSA', 'WARTEG']), '#7a2e1d', '#ffe9b0') }));
    psign.position.set(0, 4.6, (t.w + 8) / 2 + 0.1); g.add(psign);
    scene.add(g);
    colliders.push({ x: t.x, z: t.z, hx: (t.w + 8) / 2, hz: (t.w + 8) / 2 });
  }

  // ------------------------------------------------------------ blocks
  // Ordinary blocks get 2 ruko shophouses or mid-rise slabs each; the four
  // east blocks are kampung; a few blocks are landmarks instead.
  const kampungBlocks = new Set(['195,117', '273,117', '195,195', '273,195']);
  const specialBlocks = {
    '-273,195': 'stadium', '273,-273': 'ancol', '0,-273': 'priok',
    '-273,-117': 'dealer', '195,-273': 'hotel', '-39,-39': 'plazaEdge',
  };
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      const key = `${bx},${bz}`;
      if (bx === -39 || bx === 39) { if (bz === -39 || bz === 39) continue; } // plaza block
      if (kampungBlocks.has(key)) continue;
      if (specialBlocks[key]) continue;
      // two buildings per block, offset so a sidewalk gap stays between them
      const n = rangeInt(rng, 2, 3);
      for (let i = 0; i < n; i++) {
        const ox = bx + (i % 2 === 0 ? -14 : 14) + range(rng, -4, 4);
        const oz = bz + (i === 2 ? 16 : -12) + range(rng, -4, 4);
        const w = range(rng, 16, 24), d = range(rng, 14, 22);
        const h = range(rng, 9, 34);
        const downtown = Math.abs(bx) < 160 && Math.abs(bz) < 160;
        const isRuko = h < 16;
        const tex = isRuko
          ? facadeTexture(pick(rng, ['#d8b25a', '#c97e4a', '#a8b8a0', '#d8c8a8', '#b56a5a']), 8, 3)
          : facadeTexture(pick(rng, ['#5a6a7a', '#7a8a9a', '#4a5a6a', '#8a7a5a']), 16, 6);
        const bmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        if (downtown && h > 22) bmat.metalness = 0.35;
        const b = box(w, h, d, bmat, ox, h / 2, oz);
        scene.add(b);
        colliders.push({ x: ox, z: oz, hx: w / 2, hz: d / 2 });
        // ruko sign band
        if (isRuko) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 2, 14), 2.2),
            new THREE.MeshBasicMaterial({ map: signTexture(pick(rng, RUKO_SIGNS), pick(rng, ['#7a2e1d', '#1c4d8f', '#2e6b34', '#8a5a1d']), '#ffffff') }));
          s.position.set(ox, Math.min(h - 1.5, 7), oz + d / 2 + 0.1);
          scene.add(s);
        }
        // flat roof slab + a water tank on some roofs
        const roof = box(w + 0.6, 0.5, d + 0.6, mat(0x5a5148), ox, h + 0.25, oz);
        scene.add(roof);
        if (rng() < 0.35) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 10), mat(0x3a3a3a, 0.6, 0.3));
          tank.position.set(ox + w / 4, h + 1.4, oz); tank.castShadow = true;
          scene.add(tank);
        }
      }
    }
  }

  // ------------------------------------------------------------ kampung
  // ~70 tiny corrugated houses on narrow cross alleys, laundry lines and
  // sagging wires between them. Houses are instanced for cheap rendering,
  // but each one still gets its own solid collider.
  const kampungMats = [0x8a5a3a, 0x6a6a6a, 0x4a6a4a, 0x9a7a5a, 0x7a4a4a].map((c) => mat(c, 0.95));
  const roofMats = [0xa03a2a, 0x5a5a5a, 0x3a5a3a, 0x8a2a2a].map((c) => mat(c, 0.9));
  const houseGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.CylinderGeometry(0.01, 1, 1, 4); // pyramid roof
  const houses = new THREE.InstancedMesh(houseGeo, kampungMats[0], 80);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMats[0], 80);
  houses.castShadow = true; roofs.castShadow = true;
  const dummy = new THREE.Object3D();
  const wirePts = [];
  let houseCount = 0;
  for (const bx of [195, 273]) {
    for (const bz of [117, 195]) {
      for (let i = 0; i < 18 && houseCount < 72; i++) {
        const hx = bx + range(rng, -30, 30);
        const hz = bz + range(rng, -30, 30);
        const hw = range(rng, 6, 9), hd = range(rng, 5, 8), hh = range(rng, 3.2, 5);
        dummy.position.set(hx, hh / 2, hz);
        dummy.scale.set(hw, hh, hd);
        dummy.rotation.y = (rng() < 0.5 ? 0 : Math.PI / 2) + range(rng, -0.08, 0.08);
        dummy.updateMatrix();
        houses.setMatrixAt(houseCount, dummy.matrix);
        houses.setColorAt(houseCount, new THREE.Color(pick(rng, [0x8a5a3a, 0x6a6a6a, 0x4a6a4a, 0x9a7a5a, 0x7a4a4a])));
        dummy.position.set(hx, hh + 0.9, hz);
        dummy.scale.set(hw * 0.78, 1.8, hd * 0.78);
        dummy.updateMatrix();
        roofs.setMatrixAt(houseCount, dummy.matrix);
        roofs.setColorAt(houseCount, new THREE.Color(pick(rng, [0xa03a2a, 0x5a5a5a, 0x3a5a3a, 0x8a2a2a])));
        colliders.push({ x: hx, z: hz, hx: hw / 2, hz: hd / 2 });
        // laundry line to the next house, and a sagging wire
        if (houseCount % 3 === 0) {
          const lx = hx + range(rng, 6, 10), lz = hz + range(rng, -4, 4);
          const line = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.06), mat(0x222222));
          line.position.set((hx + lx) / 2, 2.6, (hz + lz) / 2);
          line.rotation.y = Math.atan2(lz - hz, lx - hx);
          scene.add(line);
          for (let k = 0; k < 3; k++) {
            const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1),
              new THREE.MeshStandardMaterial({ color: pick(rng, [0xe8e4d8, 0xc0392b, 0x2e86c1, 0xf1c40f]), side: THREE.DoubleSide }));
            cloth.position.set(hx + (lx - hx) * (k + 1) / 4, 2.1, hz + (lz - hz) * (k + 1) / 4);
            scene.add(cloth);
          }
          wirePts.push(new THREE.Vector3(hx, 4.4, hz), new THREE.Vector3(hx + 4, 3.4, hz + 3), new THREE.Vector3(lx, 4.2, lz));
        }
        houseCount++;
      }
    }
  }
  houses.count = houseCount; roofs.count = houseCount;
  houses.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true;
  if (houses.instanceColor) houses.instanceColor.needsUpdate = true;
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  scene.add(houses); scene.add(roofs);
  city.kampungHouses = houseCount;
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts.length ? wirePts : [new THREE.Vector3(200, 4, 120), new THREE.Vector3(210, 4, 130)]);
  scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  const kampungSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('KAMPUNG MELAYU', '#5a3a1a', '#ffe9b0', 'Gang Sempit RT 04') }));
  kampungSign.position.set(232, 4, 96); kampungSign.rotation.y = Math.PI / 2;
  scene.add(kampungSign);

  // ------------------------------------------------------------ landmarks
  // Gelora Bung Karno stadium: ring stands, open bowl, floodlights.
  const stad = new THREE.Group();
  stad.position.set(-273, 0, 195);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 14, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.8, side: THREE.DoubleSide }));
  bowl.position.y = 7; bowl.castShadow = true; stad.add(bowl);
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(36, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 1 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.2; stad.add(pitch);
  for (const [lx, lz] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 26, 8), mat(0x888888, 0.5, 0.5));
    pole.position.set(lx, 13, lz); stad.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 1), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    lamp.position.set(lx, 26, lz); stad.add(lamp);
  }
  const stadSign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('GELORA BUNG KARNO', '#7a1d1d', '#ffffff') }));
  stadSign.position.set(0, 15, 46); stad.add(stadSign);
  scene.add(stad);
  colliders.push({ x: -273, z: 195, hx: 8, hz: 8 }); // gatehouse only; the bowl is open

  // Tanjung Priok: stacked shipping containers at the north edge.
  const contColors = [0xc0392b, 0x2e86c1, 0x27ae60, 0xe67e22, 0x8e44ad];
  for (let i = 0; i < 8; i++) {
    const cx = -60 + i * 16, cz = -300 + (i % 2) * 14;
    const c = box(12, 3, 3, mat(contColors[i % contColors.length], 0.7, 0.2), cx, 1.5 + (i % 3) * 3.1, cz);
    scene.add(c);
    if (i % 2 === 0) colliders.push({ x: cx, z: cz, hx: 6, hz: 1.6 });
  }
  // Mangga Dua dealer (Mobil Bekas) + Hotel Melati + Ancol sand.
  const dealer = box(30, 8, 20, new THREE.MeshStandardMaterial({ map: facadeTexture('#d8a05a', 8, 4), roughness: 0.85 }), -273, 4, -117);
  scene.add(dealer);
  colliders.push({ x: -273, z: -117, hx: 15, hz: 10 });
  const dsign = new THREE.Mesh(new THREE.PlaneGeometry(18, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('MOBIL BEKAS MANGGA DUA', '#1c4d8f', '#ffffff') }));
  dsign.position.set(-273, 9, -106); scene.add(dsign);
  const hotel = box(22, 26, 18, new THREE.MeshStandardMaterial({ map: facadeTexture('#c9a0a0', 10, 5), roughness: 0.85 }), 195, 13, -273);
  scene.add(hotel);
  colliders.push({ x: 195, z: -273, hx: 11, hz: 9 });
  const hotSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4),
    new THREE.MeshBasicMaterial({ map: signTexture('HOTEL MELATI', '#7a2e5a', '#ffe9b0') }));
  hotSign.position.set(195, 27, -263); scene.add(hotSign);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 60),
    new THREE.MeshStandardMaterial({ color: 0xd8c090, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(273, 0.04, -273);
  scene.add(sand);
  // Bengkel Mara: the garage Mara is saving, south-west, with its sign.
  const bengkel = box(24, 7, 16, new THREE.MeshStandardMaterial({ map: facadeTexture('#5a7a5a', 6, 3), roughness: 0.85 }), -150, 3.5, -155);
  scene.add(bengkel);
  colliders.push({ x: -150, z: -155, hx: 12, hz: 8 });
  const bsign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.6),
    new THREE.MeshBasicMaterial({ map: signTexture('BENGKEL MARA', '#2e6b34', '#ffffff') }));
  bsign.position.set(-150, 8, -146); scene.add(bsign);
  // Warung Kopi Senja near the plaza.
  const warung = box(14, 5, 10, new THREE.MeshStandardMaterial({ map: facadeTexture('#8a5a3a', 6, 4), roughness: 0.9 }), 60, 2.5, -100);
  scene.add(warung);
  colliders.push({ x: 60, z: -100, hx: 7, hz: 5 });

  // ------------------------------------------------------------ halte + stalls
  // TransJakarta halte shelter on the avenue.
  const halte = new THREE.Group();
  halte.position.set(60, 0, 40);
  const hroof = box(16, 0.4, 5, mat(0xc0392b), 0, 3.4, 0);
  halte.add(hroof);
  for (const px of [-7, 7]) {
    const post = box(0.3, 3.4, 0.3, mat(0x888888, 0.5, 0.5), px, 1.7, 0);
    halte.add(post);
  }
  const bench = box(10, 0.5, 1.2, mat(0x6a4a2a), 0, 0.8, -1);
  halte.add(bench);
  const hsign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8),
    new THREE.MeshBasicMaterial({ map: signTexture('HALTE TRANSJAKARTA', '#c0392b', '#ffffff') }));
  hsign.position.set(0, 2.6, 2.6); halte.add(hsign);
  scene.add(halte);
  colliders.push({ x: 60, z: 40, hx: 8, hz: 2.5 });

  // The 13 kaki lima stalls: gerobak pushcarts (wheels + umbrella), warung
  // tenda (striped canopy + steaming pot) and kaki lima mats. Each has a
  // sign board, goods, a vendor figure behind the counter, and a collider.
  const stallSignColors = ['#7a2e1d', '#1c4d8f', '#2e6b34', '#8a5a1d', '#5a2e7a'];
  for (let i = 0; i < STALL_DEFS.length; i++) {
    const def = STALL_DEFS[i];
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);
    g.rotation.y = Math.atan2(-def.x, -def.z); // face the plaza centre
    const counterMat = mat(pick(rng, [0x8a5a3a, 0x6a4a2a, 0x7a3a2a]));
    if (def.kind === 'gerobak') {
      const cart = box(2.4, 0.9, 1.4, counterMat, 0, 0.7, 0);
      g.add(cart);
      for (const wx of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12), mat(0x222222));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(wx * 0.9, 0.35, 0.75);
        g.add(wheel);
      }
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 10),
        new THREE.MeshStandardMaterial({ color: pick(rng, [0xc0392b, 0x2e86c1, 0xe67e22]), side: THREE.DoubleSide }));
      umb.position.y = 2.6; g.add(umb);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), mat(0x888888));
      pole.position.y = 1.9; g.add(pole);
    } else if (def.kind === 'tenda') {
      const counter = box(3, 1, 1.6, counterMat, 0, 0.5, 0);
      g.add(counter);
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide }));
      canopy.rotation.x = -Math.PI / 2 + 0.25; canopy.position.y = 2.5;
      g.add(canopy);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
      stripe.position.set(0, 2.15, 1.05); stripe.rotation.x = 0.25; g.add(stripe);
      for (const [px, pz] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat(0x888888));
        post.position.set(px, 1.2, pz); g.add(post);
      }
      // steaming pot
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.4, 10), mat(0x333333, 0.5, 0.6));
      pot.position.set(0.7, 1.2, 0); g.add(pot);
    } else {
      const mat0 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2), mat(0x9a7a4a));
      mat0.rotation.x = -Math.PI / 2; mat0.position.y = 0.08; g.add(mat0);
      const table = box(1.6, 0.5, 1, counterMat, 0, 0.35, 0);
      g.add(table);
    }
    // goods on the counter
    for (let k = 0; k < 4; k++) {
      const good = box(0.35, 0.25, 0.35, mat(pick(rng, [0xe67e22, 0x27ae60, 0xc0392b, 0xf1c40f, 0x8e44ad])), -0.8 + k * 0.55, 1.25, 0);
      g.add(good);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9),
      new THREE.MeshBasicMaterial({ map: signTexture(def.name, stallSignColors[i % stallSignColors.length], '#ffffff') }));
    sign.position.set(0, 2.1, 0.9); g.add(sign);
    // vendor figure behind the counter, waving arm on a pivot
    const vendor = makeVendorFigure(rng, pick(rng, SKIN_TONES));
    vendor.position.set(0, 0, -1.4);
    vendor.rotation.y = Math.PI;
    g.add(vendor);
    scene.add(g);
    colliders.push({ x: def.x, z: def.z, hx: 1.9, hz: 1.9 });
    vendorAnim.push({ armPivot: vendor.userData.armPivot, vendor, stall: def, phase: rng() * Math.PI * 2, serving: false });
    stalls.push({ name: def.name, x: def.x, z: def.z, kind: def.kind, group: g });
    // smoke puffs over the two smoking carts
    if (def.name === 'SATE MADURA' || def.name === 'BAKSO MALANG') {
      for (let s = 0; s < 3; s++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 }));
        puff.position.set(def.x, 2 + s * 0.8, def.z);
        scene.add(puff);
        smokePuffs.push({ mesh: puff, baseX: def.x, baseZ: def.z, phase: s * 2.1 });
      }
    }
  }
  city.stallCount = STALL_DEFS.length;

  // ------------------------------------------------------------ street life
  // Lamps mid-block (never on a corner, never in a camera line) and trees
  // 13 m off the road centre with small canopies.
  const lampMat = mat(0x333333, 0.5, 0.5);
  for (const rx of [-234, -78, 78, 234]) {
    for (const rz of [-156, 0, 156]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), lampMat);
      pole.position.set(rx + 11, 3.5, rz); pole.castShadow = true; scene.add(pole);
      const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      lampHead.position.set(rx + 11, 7.1, rz); scene.add(lampHead);
      const pole2 = pole.clone(); pole2.position.set(rx - 11, 3.5, rz + 39); scene.add(pole2);
    }
  }
  const trunkMat = mat(0x5a3a22);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const tx = pick(rng, ROADS) + (rng() < 0.5 ? -13 : 13);
    const tz = range(rng, -300, 300);
    if (Math.abs(tx) < 55 && Math.abs(tz) < 55) continue; // keep the plaza clear
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 6), trunkMat);
    trunk.position.set(tx, 1.2, tz); trunk.castShadow = true; scene.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 1.6, 2.4), 8, 6), leafMat);
    canopy.position.set(tx, 3.4, tz); canopy.scale.y = 0.75; canopy.castShadow = true;
    scene.add(canopy);
  }

  // Billboards + neon signs.
  const billboards = [
    { t: 'KOPI SENJA', x: -78, z: 96, c: '#5a2e1d' }, { t: 'SATE 88', x: 156, z: -78, c: '#7a1d1d' },
    { t: 'NASI GORENG', x: -156, z: 156, c: '#2e6b34' }, { t: 'PULSA MURAH', x: 96, z: 96, c: '#1c4d8f' },
  ];
  for (const b of billboards) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 6),
      new THREE.MeshBasicMaterial({ map: signTexture(b.t, b.c, '#ffe9b0') }));
    board.position.set(b.x, 12, b.z); board.rotation.y = Math.PI / 4;
    scene.add(board);
    const legs = box(0.6, 9, 0.6, lampMat, b.x, 4.5, b.z);
    scene.add(legs);
  }
  const neonDefs = [
    { t: 'KOPI', c: 0xff5533, x: -40, z: -100 }, { t: 'SATE', c: 0xffcc33, x: 120, z: 40 },
    { t: 'WARTEG', c: 0x33ff88, x: -120, z: 120 }, { t: 'ES TEH', c: 0x33ccff, x: 40, z: 200 },
    { t: 'PULSA', c: 0xff33aa, x: 200, z: -120 }, { t: 'BAKSO', c: 0xff8833, x: -200, z: 40 },
  ];
  city.neon = [];
  for (const n of neonDefs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8),
      new THREE.MeshBasicMaterial({ map: signTexture(n.t, '#111111', '#ffffff') }));
    m.position.set(n.x, 9, n.z);
    scene.add(m);
    const glow = new THREE.PointLight(n.c, 12, 22);
    glow.position.set(n.x, 9, n.z + 2);
    scene.add(glow);
    city.neon.push(m);
  }

  // Street signs on posts.
  for (const s of STREET_SIGNS) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), lampMat);
    post.position.set(s.x, 1.7, s.z); scene.add(post);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.4),
      new THREE.MeshBasicMaterial({ map: signTexture(s.t, '#1c4d8f', '#ffffff', s.sub || '') }));
    board.position.set(s.x, 3.4, s.z); board.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
    scene.add(board);
  }

  // Traffic lights on a 12 s cycle at four intersections.
  for (const [lx, lz] of [[-78, -78], [78, 78], [-78, 156], [156, -78]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.5, 6), lampMat);
    pole.position.set(lx + 8, 2.75, lz + 8); scene.add(pole);
    const housing = box(0.7, 1.8, 0.7, mat(0x222222), lx + 8, 5.6, lz + 8);
    scene.add(housing);
    const lights = [];
    for (let k = 0; k < 3; k++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x330000 }));
      lamp.position.set(lx + 8, 6.1 - k * 0.55, lz + 8.4);
      scene.add(lamp);
      lights.push(lamp);
    }
    trafficLights.push({ x: lx, z: lz, lights, phase: (lx + lz) % 12 });
  }

  city.colliderCount = colliders.length;
  return city;
}

// Traffic lights: one colour lit at a time, 12 s cycle, offset per corner.
export function updateTrafficLights(city, t) {
  const cols = [0xff2222, 0xffcc22, 0x22cc44];
  for (const tl of city.trafficLights) {
    const phase = Math.floor(((t + tl.phase) % 12) / 4);
    for (let k = 0; k < 3; k++) {
      tl.lights[k].material.color.setHex(k === phase ? cols[k] : 0x330000);
    }
  }
}

// Vendors wave one arm to call the crowd; when a ped is browsing close by
// they hold the arm out in a serving pose instead. Smoke puffs rise and loop.
export function updateVendors(city, dt, now, peds) {
  for (const v of city.vendorAnim) {
    let serving = false;
    if (peds) {
      for (const p of peds) {
        if (p.pause > 0.5 && dist2(p.mesh.position.x, p.mesh.position.z, v.stall.x, v.stall.z) < 25) { serving = true; break; }
      }
    }
    v.serving = serving;
    const target = serving ? -1.5 : Math.sin(now * 2.2 + v.phase) * 0.9 - 0.4;
    v.armPivot.rotation.x = lerp(v.armPivot.rotation.x, target, Math.min(1, dt * 6));
    v.vendor.rotation.y = Math.PI + Math.sin(now * 0.5 + v.phase) * 0.4;
  }
  for (const s of city.smokePuffs) {
    const cyc = (now * 0.35 + s.phase) % 3;
    s.mesh.position.y = 2 + cyc * 1.1;
    s.mesh.position.x = s.baseX + Math.sin(now + s.phase) * 0.3 * cyc;
    s.mesh.material.opacity = 0.5 * (1 - cyc / 3);
    const sc = 1 + cyc * 0.5;
    s.mesh.scale.set(sc, sc, sc);
  }
}

// Golden-hour sun: lower and warmer as the hour approaches 18:00.
export function updateSky(city, hour) {
  const t = clamp((hour - 16) / 2.5, 0, 1); // 0 at 16:00, 1 at 18:30
  const top = new THREE.Color(0x3d5a8f).lerp(new THREE.Color(0x2a2a55), t);
  const horizon = new THREE.Color(0xf7b267).lerp(new THREE.Color(0xe85a3a), t);
  city.skyUniforms.topColor.value.copy(top);
  city.skyUniforms.horizonColor.value.copy(horizon);
  const el = lerp(0.42, 0.12, t);
  city.sun.position.set(Math.cos(el) * 500, Math.sin(el) * 500, -420);
  city.sun.intensity = lerp(2.4, 1.9, t);
  city.hemi.intensity = lerp(0.85, 0.6, t);
  if (city.monasFlame) city.monasFlame.rotation.y += 0.01;
}
