// Shared helpers for JAKARTA — Streets of the Afternoon: seeded random,
// math, rupiah formatting, tiny vector utilities, face features (v4: every
// character gets a face) and circle-vs-building collision (v4: solid city).
// Every module in this game is original code written for this entry.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (rng, a, b) => a + rng() * (b - a);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
export function angleDiff(a, b) {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
/** Distance on the ground plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
/** Rupiah: 250000 -> "Rp250.000". Cash is stored in whole rupiah. */
export function formatRp(n) {
  return 'Rp' + Math.floor(n).toLocaleString('id-ID');
}

// ---- v4: faces ----
// One shared set of face geometries/materials for every person in the city,
// so a face costs draw calls but no new textures. Features sit proud of the
// head sphere (head centre y=1.79, radius ~0.23): eyes, brows, a nose and a
// mouth that read at gameplay distance without microscopic detail.
const FACE_GEO = {
  eyeWhite: new THREE.SphereGeometry(0.042, 8, 6),
  pupil: new THREE.SphereGeometry(0.026, 8, 6),
  brow: new THREE.BoxGeometry(0.085, 0.018, 0.02),
  lash: new THREE.BoxGeometry(0.07, 0.012, 0.015),
  nose: new THREE.BoxGeometry(0.05, 0.08, 0.06),
  mouth: new THREE.BoxGeometry(0.11, 0.022, 0.03),
  lips: new THREE.BoxGeometry(0.13, 0.03, 0.03),
  mustache: new THREE.BoxGeometry(0.11, 0.025, 0.02),
  lens: new THREE.TorusGeometry(0.05, 0.009, 6, 12),
  bridge: new THREE.BoxGeometry(0.05, 0.012, 0.012),
};
const FACE_MAT = {
  eyeWhite: new THREE.MeshBasicMaterial({ color: 0xf2ead8 }),
  pupil: new THREE.MeshBasicMaterial({ color: 0x14100c }),
  brow: new THREE.MeshBasicMaterial({ color: 0x1c1410 }),
  mouth: new THREE.MeshBasicMaterial({ color: 0x6a2a22 }),
  lips: new THREE.MeshBasicMaterial({ color: 0xb03030 }),
  mustache: new THREE.MeshBasicMaterial({ color: 0x1c1410 }),
  glasses: new THREE.MeshBasicMaterial({ color: 0x111214 }),
};
/** Add a face to a person `body` group (head centre y=1.79, facing +z).
 *  opts: { z } eye-plane depth (0.205 bare head, ~0.26 inside a hijab),
 *  { skinMat } for the nose, { glasses, mustache, mara } variants.
 *  Mara gets lipstick + lashes so she reads as distinct at a glance. */
export function addFace(body, opts = {}) {
  const z = opts.z ?? 0.205;
  const skinMat = opts.skinMat ?? FACE_MAT.brow;
  // One group per face, so a vendor's face can turn with her head.
  // v4 fix: features sit PROUD of the head sphere (the first pass buried
  // the mouth inside it) — white sclera + dark pupil so eyes read at 5 m.
  const face = new THREE.Group();
  body.add(face);
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(FACE_GEO.eyeWhite, FACE_MAT.eyeWhite);
    white.position.set(0.082 * side, 1.845, z);
    white.scale.set(1, 1.2, 0.5);
    face.add(white);
    const pupil = new THREE.Mesh(FACE_GEO.pupil, FACE_MAT.pupil);
    pupil.position.set(0.082 * side, 1.845, z + 0.012);
    pupil.scale.set(1, 1.2, 0.5);
    face.add(pupil);
    const brow = new THREE.Mesh(FACE_GEO.brow, FACE_MAT.brow);
    brow.position.set(0.082 * side, 1.905, z + 0.008);
    brow.rotation.z = -0.1 * side;
    face.add(brow);
    if (opts.mara) {
      const lash = new THREE.Mesh(FACE_GEO.lash, FACE_MAT.pupil);
      lash.position.set(0.082 * side, 1.878, z + 0.014);
      face.add(lash);
    }
    if (opts.glasses) {
      const lens = new THREE.Mesh(FACE_GEO.lens, FACE_MAT.glasses);
      lens.position.set(0.082 * side, 1.845, z + 0.02);
      face.add(lens);
    }
  }
  if (opts.glasses) {
    const bridge = new THREE.Mesh(FACE_GEO.bridge, FACE_MAT.glasses);
    bridge.position.set(0, 1.845, z + 0.02);
    face.add(bridge);
  }
  const nose = new THREE.Mesh(FACE_GEO.nose, skinMat);
  nose.position.set(0, 1.795, z + 0.012);
  face.add(nose);
  const mouth = new THREE.Mesh(opts.mara ? FACE_GEO.lips : FACE_GEO.mouth,
    opts.mara ? FACE_MAT.lips : FACE_MAT.mouth);
  mouth.position.set(0, 1.715, z + 0.016);
  face.add(mouth);
  if (opts.mustache) {
    const mo = new THREE.Mesh(FACE_GEO.mustache, FACE_MAT.mustache);
    mo.position.set(0, 1.752, z + 0.018);
    face.add(mo);
  }
  return face;
}

// ---- v4: solid buildings ----
// A collider is an axis-aligned box on the ground: { x, z, hx, hz } (centre
// + half extents). Circle-vs-box, used by feet, cars, peds and police so
// nobody passes through a building, a wall, a stall or Monas.
export function circleHitsColliders(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return c;
  }
  return null;
}
/** Push a circle out of every overlapping box. Returns true if it hit
 *  anything (and writes the push-out normal of the first hit into `out`). */
export function resolveCircleOut(pos, r, colliders, out) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz));
    let dx = pos.x - cx, dz = pos.z - cz;
    let d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 1e-8) {
      // Centre inside the box: push out along the smallest penetration axis.
      const px = c.hx + r - Math.abs(pos.x - c.x);
      const pz = c.hz + r - Math.abs(pos.z - c.z);
      if (px < pz) { dx = pos.x < c.x ? -1 : 1; dz = 0; d2 = 1; pos.x += dx * px; }
      else { dx = 0; dz = pos.z < c.z ? -1 : 1; d2 = 1; pos.z += dz * pz; }
    } else {
      const d = Math.sqrt(d2);
      dx /= d; dz /= d;
      pos.x = cx + dx * r; pos.z = cz + dz * r;
    }
    if (out) { out.x = dx; out.z = dz; }
  }
  return hit;
}
/** A canvas texture with a lit-window facade, tinted per building by instance color. */
export function makeFacadeTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a7f72'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#9fd8ff') : '#20242e';
      g.fillRect(x, y, 10, 11);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
