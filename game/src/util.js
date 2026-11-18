// util.js — small shared helpers for JAKARTA: maths, rupiah, canvas signs,
// faces, and the solid-city circle-vs-AABB collision used by feet, cars,
// peds and cops alike.
import * as THREE from 'three';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a = 1, b) {
  if (b === undefined) { b = a; a = 0; }
  return a + Math.random() * (b - a);
}
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Deterministic seeded rng (mulberry32) so staged screenshots reproduce.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Indonesian rupiah: 250000 -> "Rp250.000".
export function formatRp(n) {
  const v = Math.round(n);
  return 'Rp' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Canvas texture with centred text — street signs, shop boards, plates.
export function textTexture(text, opts = {}) {
  const w = opts.w || 512;
  const h = opts.h || 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = opts.bg || '#1d3a24';
  x.fillRect(0, 0, w, h);
  if (opts.border) {
    x.strokeStyle = opts.border; x.lineWidth = 10;
    x.strokeRect(6, 6, w - 12, h - 12);
  }
  x.fillStyle = opts.fg || '#ffffff';
  x.font = `bold ${opts.font || 64}px Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const lh = (opts.font || 64) * 1.15;
  const y0 = h / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((ln, i) => x.fillText(ln, w / 2, y0 + i * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A soft radial-gradient canvas texture (used for the sun glow sprite).
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,230,160,1)');
  g.addColorStop(0.4, 'rgba(255,190,90,0.55)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Shared materials for faces. Pupils use one exact colour (0x14100c) so
// tests can count eye meshes across the whole scene.
export const PUPIL_MAT = new THREE.MeshBasicMaterial({ color: 0x14100c });
export const EYE_WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xf5f2ea });
const BROW_MAT = new THREE.MeshBasicMaterial({ color: 0x241a12 });
const NOSE_MAT = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.9 });
const LIP_MAT = new THREE.MeshStandardMaterial({ color: 0xb03a4a, roughness: 0.6 });
const MOUTH_MAT = new THREE.MeshStandardMaterial({ color: 0x6e2f28, roughness: 0.8 });

// Add a face to a head group. The head is a sphere of radius ~0.16 centred
// at the group's origin; local +z is the front of the face.
export function addFace(head, opts = {}) {
  const skin = opts.skin || 0xc98e6b;
  const noseMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.9 });
  const parts = {};
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), EYE_WHITE_MAT);
    white.position.set(side * 0.058, 0.025, 0.135);
    white.scale.set(1, 1.15, 0.6);
    head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), PUPIL_MAT);
    pupil.position.set(side * 0.058, 0.025, 0.158);
    head.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.011, 0.012), BROW_MAT);
    brow.position.set(side * 0.058, 0.075, 0.148);
    brow.rotation.z = side * -0.08;
    head.add(brow);
    if (opts.lashes) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.008),
        new THREE.MeshBasicMaterial({ color: 0x14100c }));
      lash.position.set(side * 0.058, 0.055, 0.152);
      head.add(lash);
    }
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), noseMat);
  nose.position.set(0, -0.015, 0.155);
  nose.rotation.x = Math.PI / 2.4;
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.011, 0.01),
    opts.lipstick ? LIP_MAT : MOUTH_MAT);
  mouth.position.set(0, -0.082, 0.146);
  head.add(mouth);
  if (opts.moustache) {
    const mo = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.012), BROW_MAT);
    mo.position.set(0, -0.055, 0.15);
    head.add(mo);
  }
  if (opts.glasses) {
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, 6, 14),
        new THREE.MeshBasicMaterial({ color: 0x222222 }));
      rim.position.set(side * 0.058, 0.025, 0.15);
      head.add(rim);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.006),
      new THREE.MeshBasicMaterial({ color: 0x222222 }));
    bridge.position.set(0, 0.025, 0.15);
    head.add(bridge);
  }
  return parts;
}

// --- Solid city: circle vs axis-aligned boxes ---------------------------
// Colliders are { x, z, hx, hz } (half extents). Returns the collider hit
// by a circle of radius r at (x, z), or null.
export function circleHitsColliders(x, z, r, colliders) {
  for (const c of colliders) {
    const dx = Math.abs(x - c.x) - c.hx;
    const dz = Math.abs(z - c.z) - c.hz;
    if (dx < r && dz < r) {
      // Circle centre inside the expanded box, or close enough on a corner.
      if (dx <= 0 || dz <= 0) return c;
      if (dx * dx + dz * dz < r * r) return c;
    }
  }
  return null;
}

// Push a position vector (with .x/.z) out of every collider it overlaps,
// axis by axis so characters slide along walls instead of sticking.
// Returns the first collider hit, or null.
export function resolveCircleOut(pos, r, colliders) {
  let hit = null;
  for (const c of colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const ox = c.hx + r - Math.abs(dx);
    const oz = c.hz + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (!hit) hit = c;
      if (ox < oz) pos.x = c.x + Math.sign(dx || 1) * (c.hx + r);
      else pos.z = c.z + Math.sign(dz || 1) * (c.hz + r);
    }
  }
  return hit;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
