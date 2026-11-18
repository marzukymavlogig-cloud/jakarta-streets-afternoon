// util.js — small shared helpers for JAKARTA — Streets of the Afternoon.
// Seeded randomness (so staged screenshots are reproducible), math helpers,
// rupiah formatting, canvas textures, faces, and the solid-city collision
// primitives every moving thing in the game uses.
import * as THREE from 'three';

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

// Mulberry32: a tiny deterministic PRNG. Same seed -> same city, same traffic,
// same crowd, so a screenshot staged with &seed=1 always frames the same way.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, a, b) { return a + rng() * (b - a); }
export function rangeInt(rng, a, b) { return Math.floor(range(rng, a, b + 1)); }

// Rupiah: Rp250.000 — Indonesian grouping with dots, no decimals.
export function formatRp(n) {
  const v = Math.max(0, Math.round(n));
  return 'Rp' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
export function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ---------------------------------------------------------------- textures
// All art is procedural canvas textures — no image files, no network.
export function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

export function signTexture(text, bg = '#1c4d8f', fg = '#ffffff', sub = '') {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) { g.font = 'bold 30px sans-serif'; g.fillText(sub, w / 2, h / 2 + 34); }
  });
}

export function facadeTexture(base, windows, lit) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // faint grime at the base and a lighter band at the top
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 16; y += 28) {
      for (let x = 12; x < w - 16; x += 30) {
        const on = ((x * 7 + y * 13) % 10) < lit;
        g.fillStyle = on ? '#ffd98a' : '#2c3542';
        g.fillRect(x, y, 20, 16);
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.fillRect(x, y, 20, 3);
      }
    }
  });
}

export function asphaltTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // tyre-wear bands where wheels run
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(52, 0, 26, h); g.fillRect(178, 0, 26, h);
    // centre dashes
    g.fillStyle = '#c8b25a';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y + 8, 6, 34);
  }, 1, 6);
}

export function pavingTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9a6f52'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  }, 8, 8);
}

// ------------------------------------------------------------------- faces
// Every character gets a face: eyes (sclera + dark pupils), brows, a nose
// bump and a mouth. Built from tiny meshes so they read at gameplay distance
// and in a close-up. Mara's face adds lipstick and lashes.
const FACE_MATS = {};
function faceMat(hex) {
  if (!FACE_MATS[hex]) FACE_MATS[hex] = new THREE.MeshBasicMaterial({ color: hex });
  return FACE_MATS[hex];
}
const SKIN_TONES = [0xc68642, 0x8d5524, 0xe0ac69, 0xf1c27d, 0xa0662e, 0x6f3f1d, 0xd9a066, 0xb97a4a];
export { SKIN_TONES };

export function addFace(head, skinHex, opts = {}) {
  const g = new THREE.Group();
  const eyeWhite = faceMat(0xf5f2ea);
  const pupil = faceMat(0x14100c);
  const browM = faceMat(0x241a12);
  const noseM = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.8 });
  const mouthM = faceMat(opts.lipstick ? 0xb03050 : 0x7a3b2e);
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const pupilGeo = new THREE.SphereGeometry(0.017, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeWhite);
    eye.position.set(side * 0.075, 0.02, 0.155);
    eye.scale.set(1, 1.25, 0.5);
    g.add(eye);
    const pu = new THREE.Mesh(pupilGeo, pupil);
    pu.position.set(side * 0.075, 0.02, 0.185);
    g.add(pu);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), browM);
    brow.position.set(side * 0.075, 0.085, 0.16);
    brow.rotation.z = side * (opts.browTilt ?? 0.08);
    g.add(brow);
    if (opts.lashes) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), pupil);
      lash.position.set(side * 0.075, 0.055, 0.175);
      g.add(lash);
    }
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.04), noseM);
  nose.position.set(0, -0.02, 0.17);
  g.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(opts.lipstick ? 0.11 : 0.08, 0.018, 0.015), mouthM);
  mouth.position.set(0, -0.095, 0.155);
  g.add(mouth);
  if (opts.moustache) {
    const mo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), browM);
    mo.position.set(0, -0.07, 0.16);
    g.add(mo);
  }
  if (opts.glasses) {
    const frame = faceMat(0x222222);
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 16), frame);
      ring.position.set(side * 0.075, 0.02, 0.175);
      g.add(ring);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), frame);
    bridge.position.set(0, 0.02, 0.175);
    g.add(bridge);
  }
  head.add(g);
  return g;
}

// --------------------------------------------------------------- collision
// The city is solid: every building, tower, kampung house, stall and the
// Monas base is an axis-aligned box {x, z, hx, hz}. Feet, cars, peds and
// cops are circles; axis-separated resolution makes them slide along walls
// instead of sticking or passing through.
export function circleHitsColliders(x, z, r, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (Math.abs(x - c.x) < c.hx + r && Math.abs(z - c.z) < c.hz + r) return c;
  }
  return null;
}

// Move a circle from (x,z) by (dx,dz) with wall sliding. Returns the new
// position and the collider hit (or null). X is resolved first, then Z.
export function resolveCircleOut(x, z, r, dx, dz, colliders) {
  let hit = null;
  let nx = x + dx;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (Math.abs(nx - c.x) < c.hx + r && Math.abs(z - c.z) < c.hz + r) {
      nx = x < c.x ? c.x - c.hx - r : c.x + c.hx + r;
      hit = c;
    }
  }
  let nz = z + dz;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (Math.abs(nx - c.x) < c.hx + r && Math.abs(nz - c.z) < c.hz + r) {
      nz = z < c.z ? c.z - c.hz - r : c.z + c.hz + r;
      hit = c;
    }
  }
  return { x: nx, z: nz, hit };
}

export function pointInCollider(x, z, c, r = 0) {
  return Math.abs(x - c.x) < c.hx + r && Math.abs(z - c.z) < c.hz + r;
}
