// =====================================================================
//  Procedural 3D models: ants (with walk cycles), brood, food, nature
// =====================================================================
'use strict';

class MeshB {
  constructor() { this.p = []; this.n = []; this.c = []; this.t = []; this.i = []; }
  get vcount() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, r, g, b, u = 0, w = 0) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); this.t.push(u, w); return this.vcount - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // ellipsoid; optional basis rotation (fwd/up) and per-vertex noise
  ellipsoid(cx, cy, cz, rx, ry, rz, col, o = {}) {
    const seg = o.seg || 14, ring = o.ring || 10, base = this.vcount, nz = o.noise ?? 0.08, seed = o.seed || 1;
    const rot = o.rot;  // function (x,y,z)->[x,y,z]
    for (let j = 0; j <= ring; j++) {
      const v = j / ring, th = v * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, ph = u * Math.PI * 2;
        let x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        let dx = x * rx, dy = y * ry, dz = z * rz;
        let nx = x / rx, ny = y / ry, nzz = z / rz;
        if (o.bump) { const b = 1 + (hash2(i * 7 + j, j * 13 + i, seed) - 0.5) * o.bump; dx *= b; dy *= b; dz *= b; }
        if (o.flatBottom !== undefined && dy < -o.flatBottom * ry) { dy = -o.flatBottom * ry; nx *= 0.3; nzz *= 0.3; ny = -1; }
        if (rot) { [dx, dy, dz] = rot(dx, dy, dz); [nx, ny, nzz] = rot(nx, ny, nzz); }
        const l = Math.hypot(nx, ny, nzz) || 1;
        const k = 1 - nz + 2 * nz * hash2(i + seed * 31, j + seed * 17, seed);
        const sh = o.shadeY ? 1 + o.shadeY * y : 1;
        this.v(cx + dx, cy + dy, cz + dz, nx / l, ny / l, nzz / l, col[0] * k * sh, col[1] * k * sh, col[2] * k * sh, u, v);
      }
    }
    for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + seg + 1;
      if (o.inside) { this.tri(a, b, a + 1); this.tri(a + 1, b, b + 1); }
      else { this.tri(a, a + 1, b); this.tri(a + 1, b + 1, b); }
    }
    return this;
  }
  // tapered tube between two points
  tube(p0, p1, r0, r1, col, o = {}) {
    const seg = o.seg || 6, base = this.vcount;
    const d = V3.sub(p1, p0), L = Math.hypot(...d) || 1, f = V3.scale(d, 1 / L);
    let up = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = V3.norm(V3.cross(f, up)), s2 = V3.cross(s1, f);
    const col1 = o.col1 || col;
    for (let e = 0; e < 2; e++) {
      const p = e ? p1 : p0, r = e ? r1 : r0, cc = e ? col1 : col;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, cx = Math.cos(a), sx = Math.sin(a);
        const n = [s1[0] * cx + s2[0] * sx, s1[1] * cx + s2[1] * sx, s1[2] * cx + s2[2] * sx];
        this.v(p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r, n[0], n[1], n[2], cc[0], cc[1], cc[2], i / seg, e);
      }
    }
    for (let i = 0; i < seg; i++) { const a = base + i, b = base + seg + 1 + i; this.tri(a, b, a + 1); this.tri(a + 1, b, b + 1); }
    if (o.cap) {   // round-ish end caps
      const c0 = this.v(p0[0] - f[0] * r0 * 0.5, p0[1] - f[1] * r0 * 0.5, p0[2] - f[2] * r0 * 0.5, -f[0], -f[1], -f[2], col[0], col[1], col[2]);
      const c1 = this.v(p1[0] + f[0] * r1 * 0.5, p1[1] + f[1] * r1 * 0.5, p1[2] + f[2] * r1 * 0.5, f[0], f[1], f[2], col1[0], col1[1], col1[2]);
      for (let i = 0; i < seg; i++) { this.tri(c0, base + i + 1, base + i); this.tri(c1, base + seg + 1 + i, base + seg + 2 + i); }
    }
    return this;
  }
  // polyline tube with joints
  limb(pts, r0, r1, col, o) {
    for (let k = 0; k < pts.length - 1; k++) {
      const ra = r0 + (r1 - r0) * k / (pts.length - 1), rb = r0 + (r1 - r0) * (k + 1) / (pts.length - 1);
      this.tube(pts[k], pts[k + 1], ra, rb, col, Object.assign({ cap: true }, o));
    }
    return this;
  }
  quadXZ(x0, z0, x1, z1, y, col, uv = [0, 0, 1, 1]) {
    const b = this.vcount;
    this.v(x0, y, z0, 0, 1, 0, ...col, uv[0], uv[1]); this.v(x1, y, z0, 0, 1, 0, ...col, uv[2], uv[1]);
    this.v(x1, y, z1, 0, 1, 0, ...col, uv[2], uv[3]); this.v(x0, y, z1, 0, 1, 0, ...col, uv[0], uv[3]);
    this.tri(b, b + 2, b + 1); this.tri(b, b + 3, b + 2);
    return this;
  }
  build() {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let k = 0; k < this.p.length; k += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], this.p[k + a]); mx[a] = Math.max(mx[a], this.p[k + a]); }
    return { pos: new Float32Array(this.p), nrm: new Float32Array(this.n), col: new Float32Array(this.c), uv: new Float32Array(this.t), idx: new Uint32Array(this.i), bounds: [mn, mx] };
  }
  static quad() {
    return { pos: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), idx: new Uint32Array([0, 1, 2, 0, 2, 3]) };
  }
}
const rgbf = hex => hexToRgb(hex).map(v => v / 255);

// ---------------------------------------------------------------------
//  Model cache
// ---------------------------------------------------------------------
const Models = {
  cache: new Map(),
  get(key, fn) { let m = this.cache.get(key); if (!m) { m = GL3D.mesh(fn().build()); this.cache.set(key, m); } return m; },
  ant(species, caste, frame) { return this.get(`ant|${species}|${caste}|${frame % ANT3D_FRAMES}`, () => buildAnt(species, caste, frame % ANT3D_FRAMES)); },
};
const ANT3D_FRAMES = 8;

// Ant: length ~1 along +x, standing on y=0, +z to its right
function buildAnt(species, caste, frame) {
  const look = SPECIES[species].look, cs = CASTE_SHAPE[caste];
  const L = cs.len * look.size;
  const b = new MeshB();
  const hc = rgbf(look.head), tc = rgbf(look.thorax), gc = rgbf(look.gaster), lc = rgbf(look.legs);
  const headR = 0.11 * cs.head * look.headSize * L;
  const gasR = 0.17 * cs.gaster * look.gasterSize * L;
  const bodyY = 0.15 * L * (cs.queen ? 1.15 : 1) * (cs.leg > 1.2 ? 1.15 : 1);
  const gx = -0.3 * L - (gasR - 0.17 * L) * 0.8, hx = 0.2 * L + headR * 0.7;
  const phase = frame / ANT3D_FRAMES * Math.PI * 2;
  const tilt = (ang) => (x, y, z) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang), z];
  // gaster (raised slightly, tilted down at the back)
  if (cs.replete) b.ellipsoid(gx - gasR * 0.3, bodyY + gasR * 0.4, 0, gasR * 1.05, gasR * 0.95, gasR * 0.95, [0.86, 0.6, 0.22], { seg: 18, ring: 12, noise: 0.03 });
  else b.ellipsoid(gx, bodyY + gasR * 0.15, 0, gasR * (cs.queen ? 1.25 : 1.05), gasR * 0.82, gasR * 0.86, gc, { seg: 16, ring: 12, rot: tilt(0.18), noise: 0.06, seed: 3 });
  // segment bands as slightly darker thin rings
  if (!cs.replete) for (let k = 1; k <= 2; k++) {
    const bx = gx + gasR * (0.45 - k * 0.42);
    b.ellipsoid(bx, bodyY + gasR * 0.15 + (gx - bx) * 0.18, 0, gasR * 0.07, gasR * 0.8, gasR * 0.84, gc.map(v => v * (look.stripes ? 1.6 : 0.7)), { seg: 14, ring: 6, noise: 0 });
  }
  // petiole
  b.ellipsoid(-0.135 * L, bodyY - 0.01 * L, 0, 0.045 * L, 0.055 * L, 0.04 * L, tc, { seg: 8, ring: 6 });
  if (species === 'fire' || species === 'leafcutter') b.ellipsoid(-0.09 * L, bodyY - 0.01 * L, 0, 0.04 * L, 0.045 * L, 0.035 * L, tc, { seg: 8, ring: 6 });
  // thorax (mesosoma) slightly arched
  const thR = (cs.queen ? 0.2 : 0.165) * L;
  b.ellipsoid(0, bodyY + 0.01 * L, 0, thR, 0.085 * L * (cs.queen ? 1.3 : 1), 0.075 * L * (cs.queen ? 1.3 : 1), tc, { seg: 14, ring: 10, rot: tilt(-0.12), seed: 5 });
  if (look.spines) for (const s of [-1, 1]) for (const ox of [-0.08, 0.05]) b.tube([ox * L, bodyY + 0.07 * L, s * 0.03 * L], [(ox - 0.04) * L, bodyY + 0.14 * L, s * 0.06 * L], 0.012 * L, 0.002 * L, tc.map(v => v * 0.8), { seg: 4 });
  // head
  const hy = bodyY + 0.03 * L;
  b.ellipsoid(hx, hy, 0, headR * 1.05, headR * 0.88, headR * 0.95, hc, { seg: 16, ring: 12, rot: tilt(-0.25), seed: 9 });
  for (const s of [-1, 1]) {
    b.ellipsoid(hx + headR * 0.25, hy + headR * 0.25, s * headR * 0.82, headR * 0.2, headR * 0.17, headR * 0.12, [0.03, 0.03, 0.03], { seg: 8, ring: 6, noise: 0 });
    // mandibles
    const mL = headR * 1.0 * cs.mand * look.mand, open = 0.38 + Math.sin(phase * 2) * 0.05;
    const mx = hx + headR * 0.85, my = hy - headR * 0.35;
    if (look.hooked && (caste === 'soldier' || caste === 'major')) {
      const pts = [[mx, my, s * headR * 0.35]];
      for (let k = 1; k <= 4; k++) { const t = k / 4; pts.push([mx + mL * 1.4 * t, my - mL * 0.1 * t, s * headR * 0.35 + s * Math.sin(open) * mL * (0.8 - t * 1.2) * t * 1.6]); }
      b.limb(pts, 0.03 * L * cs.mand, 0.008 * L, [0.9, 0.84, 0.66], { seg: 5 });
    } else {
      const tip = [mx + Math.cos(open) * mL, my - 0.02 * L, s * (headR * 0.3 + Math.sin(open) * mL * 0.6)];
      const bend = [mx + mL * 0.55, my, s * (headR * 0.45 + mL * 0.25)];
      b.limb([[mx, my, s * headR * 0.35], bend, tip], 0.03 * L * cs.mand, 0.008 * L, hc.map(v => v * 0.55), { seg: 5 });
    }
    // antennae: scape up-forward, funiculus forward-out
    const wig = Math.sin(phase + (s > 0 ? 1.3 : 0)) * 0.12;
    const sc = 0.17 * L * (caste === 'scout' ? 1.3 : 1);
    const a0 = [hx + headR * 0.6, hy + headR * 0.55, s * headR * 0.4];
    const a1 = [a0[0] + sc * 0.45, a0[1] + sc * 0.75, a0[2] + s * sc * (0.45 + wig)];
    const a2 = [a1[0] + sc * 1.05, a1[1] - sc * 0.15, a1[2] + s * sc * (0.35 - wig)];
    b.limb([a0, a1, a2], 0.012 * L, 0.009 * L, lc.map(v => v * 0.85), { seg: 4 });
    b.ellipsoid(a2[0], a2[1], a2[2], 0.016 * L, 0.014 * L, 0.014 * L, lc.map(v => v * 0.7), { seg: 6, ring: 4 });
  }
  // legs (tripod gait)
  const legL = 0.36 * L * cs.leg * look.legLen;
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const tri = (k + (side > 0 ? 1 : 0)) % 2;
    const sw = Math.sin(phase + tri * Math.PI) * 0.35, lift = Math.max(0, Math.cos(phase + tri * Math.PI)) * 0.12 * L;
    const ax = (0.07 - k * 0.07) * L, ay = bodyY - 0.03 * L, az = side * 0.035 * L;
    const yawA = [0.75, 0.0, -0.75][k] + sw;                    // forward / sideways / backward
    const fem = legL * [0.5, 0.48, 0.6][k], tib = legL * [0.62, 0.62, 0.8][k];
    const dirx = Math.sin(yawA), dirz = Math.cos(yawA) * side;
    const knee = [ax + dirx * fem * 0.85, ay + 0.07 * L + lift * 0.5, az + dirz * fem * 0.95];
    const foot = [knee[0] + dirx * tib * 0.9, Math.max(0.005, lift * 0.6), knee[2] + dirz * tib * 0.75];
    b.limb([[ax, ay, az], knee, foot], 0.026 * L * (caste === 'major' ? 1.3 : 1), 0.012 * L, lc, { seg: 5 });
  }
  if (cs.queen) for (const s of [-1, 1]) b.ellipsoid(-0.02 * L, bodyY + 0.09 * L, s * 0.07 * L, 0.035 * L, 0.012 * L, 0.02 * L, [0.1, 0.06, 0.03], { seg: 6, ring: 4 });
  return b;
}

// Simple objects -------------------------------------------------------
function buildRock(seed, col = [0.52, 0.5, 0.47]) {
  return new MeshB().ellipsoid(0, 0.3, 0, 1, 0.62, 0.85, col, { seg: 12, ring: 9, bump: 0.45, noise: 0.15, seed, flatBottom: 0.5, shadeY: 0.15 });
}
function buildMound(colorHex, outpost) {
  const b = new MeshB(), c = outpost ? [0.42, 0.31, 0.2] : [0.38, 0.27, 0.17];
  b.ellipsoid(0, 0, 0, 1, outpost ? 0.5 : 0.62, 1, c, { seg: 34, ring: 18, bump: 0.18, noise: 0.45, seed: outpost ? 4 : 2, flatBottom: 0.02 });
  // entrance crater
  b.ellipsoid(0.1, outpost ? 0.48 : 0.6, 0.1, 0.2, 0.05, 0.16, [0.05, 0.03, 0.02], { seg: 12, ring: 6, noise: 0 });
  // twigs / needles on the mound
  const r = mulberry32(outpost ? 9 : 7);
  for (let i = 0; i < 40; i++) {
    const a = r() * 6.28, rr = Math.sqrt(r()) * 0.85, y = Math.sqrt(Math.max(0, 1 - rr * rr)) * (outpost ? 0.5 : 0.62);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, t = r() * 6.28;
    b.tube([x, y, z], [x + Math.cos(t) * 0.18, y + 0.02, z + Math.sin(t) * 0.18], 0.012, 0.01, r() < 0.5 ? [0.35, 0.24, 0.14] : [0.72, 0.58, 0.38], { seg: 3 });
  }
  // banner pole + flag in colony colour
  const fc = rgbf(colorHex);
  b.tube([0.75, 0.1, -0.35], [0.75, 1.6, -0.35], 0.02, 0.015, [0.3, 0.2, 0.1], { seg: 5 });
  const fb = b.vcount;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 1; j++) b.v(0.75 + i * 0.12, 1.55 - j * 0.32 - i * 0.02, -0.35 + Math.sin(i * 1.3) * 0.04, 0, 0, 1, fc[0], fc[1], fc[2], i / 4, j);
  for (let i = 0; i < 4; i++) { const a = fb + i * 2; b.tri(a, a + 1, a + 2); b.tri(a + 1, a + 3, a + 2); }
  return b;
}
function buildStump(seed) {
  const b = new MeshB(), r = mulberry32(seed);
  const R = 0.7 + r() * 0.3;
  for (let i = 0; i < 6; i++) {    // buttress roots
    const a = i / 6 * 6.28 + r() * 0.5, l = R * (1.6 + r() * 0.8);
    const p0 = [Math.cos(a) * R * 0.5, 0.6, Math.sin(a) * R * 0.5], p1 = [Math.cos(a) * R * 1.1, 0.25, Math.sin(a) * R * 1.1], p2 = [Math.cos(a + 0.2) * l, 0.02, Math.sin(a + 0.2) * l];
    b.limb([p0, p1, p2], 0.32 * R, 0.06, [0.36, 0.26, 0.17], { seg: 7 });
  }
  // trunk with ridged bark
  const seg = 18, base = b.vcount, Ht = 2.6 + r() * 1.2;
  for (let j = 0; j <= 6; j++) for (let i = 0; i <= seg; i++) {
    const a = i / seg * 6.28, ridge = 1 + 0.07 * Math.sin(a * 9 + j) + 0.04 * (hash2(i, j, seed) - 0.5);
    const y = j / 6 * Ht, rr = R * ridge * (1 + (j === 0 ? 0.2 : 0));
    const k = 0.8 + 0.4 * hash2(i * 3, j * 5, seed);
    b.v(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a), 0, Math.sin(a), 0.38 * k, 0.28 * k, 0.18 * k);
  }
  for (let j = 0; j < 6; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, c = a + seg + 1; b.tri(a, c, a + 1); b.tri(a + 1, c, c + 1); }
  // jagged broken top with moss
  const top = b.v(0, Ht + 0.1, 0, 0, 1, 0, 0.3, 0.4, 0.15);
  for (let i = 0; i < seg; i++) b.tri(top, base + 6 * (seg + 1) + i + 1, base + 6 * (seg + 1) + i);
  b.ellipsoid(R * 0.3, Ht * 0.6, R * 0.85, R * 0.4, R * 0.25, R * 0.2, [0.32, 0.45, 0.16], { seg: 8, ring: 6, bump: 0.4 });
  return b;
}
function buildGrassBlade() {
  const b = new MeshB();
  // a slightly curved tapered blade made of 3 segments; vertices carry height for wind
  const pts = [[0, 0], [0.04, 0.35], [0.12, 0.7], [0.24, 1.0]], w = [0.045, 0.036, 0.022, 0.0];
  const base = b.vcount;
  pts.forEach(([x, y], i) => {
    const g = 0.45 + y * 0.55;
    b.v(x, y, -w[i], 0, 0.3, 1, 0.22 * g, 0.42 * g, 0.12 * g);
    b.v(x, y, w[i], 0, 0.3, 1, 0.26 * g, 0.48 * g, 0.14 * g);
  });
  for (let i = 0; i < 3; i++) { const a = base + i * 2; b.tri(a, a + 1, a + 2); b.tri(a + 1, a + 3, a + 2); }
  return b;
}
function buildFlower(col) {
  const b = new MeshB();
  b.tube([0, 0, 0], [0.02, 0.55, 0], 0.012, 0.01, [0.22, 0.42, 0.14], { seg: 4 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; b.ellipsoid(Math.cos(a) * 0.07, 0.56, Math.sin(a) * 0.07, 0.065, 0.015, 0.04, col, { seg: 8, ring: 4, noise: 0.02, rot: (x, y, z) => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)] }); }
  b.ellipsoid(0, 0.57, 0, 0.035, 0.025, 0.035, [0.92, 0.66, 0.12], { seg: 8, ring: 5 });
  return b;
}
function buildLeaf() {
  const b = new MeshB(), base = b.vcount, N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = (t - 0.5) * 2, wdt = Math.sin(t * Math.PI) * 0.42, curl = Math.sin(t * Math.PI) * 0.06;
    for (const s of [-1, 0, 1]) b.v(x, 0.02 + curl + Math.abs(s) * 0.04, s * wdt, 0, 1, 0, s === 0 ? 0.75 : 1, s === 0 ? 0.75 : 1, s === 0 ? 0.75 : 1);
  }
  for (let i = 0; i < N; i++) { const a = base + i * 3; b.tri(a, a + 1, a + 3); b.tri(a + 1, a + 4, a + 3); b.tri(a + 1, a + 2, a + 4); b.tri(a + 2, a + 5, a + 4); }
  return b;
}
function buildMushroom(col) {
  const b = new MeshB();
  b.tube([0, 0, 0], [0, 0.45, 0], 0.07, 0.06, [0.88, 0.84, 0.74], { seg: 7 });
  b.ellipsoid(0, 0.48, 0, 0.26, 0.14, 0.26, col, { seg: 14, ring: 8, flatBottom: 0.1, noise: 0.06 });
  if (col[0] > 0.6 && col[1] < 0.4) { const r = mulberry32(3); for (let i = 0; i < 7; i++) { const a = r() * 6.28, rr = r() * 0.18; b.ellipsoid(Math.cos(a) * rr, 0.6 - rr * 0.35, Math.sin(a) * rr, 0.025, 0.012, 0.025, [0.98, 0.96, 0.9], { seg: 6, ring: 3, noise: 0 }); } }
  return b;
}
function buildBerry() {
  const b = new MeshB().ellipsoid(0, 0.4, 0, 0.42, 0.4, 0.42, [0.62, 0.06, 0.1], { seg: 20, ring: 14, noise: 0.03 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; b.ellipsoid(Math.cos(a) * 0.08, 0.8, Math.sin(a) * 0.08, 0.1, 0.02, 0.04, [0.22, 0.4, 0.12], { seg: 6, ring: 3, rot: (x, y, z) => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)] }); }
  return b;
}
function buildBeetle() {
  const b = new MeshB();
  b.ellipsoid(0, 0.12, 0, 0.5, 0.18, 0.34, [0.12, 0.26, 0.18], { seg: 16, ring: 10, noise: 0.04 });
  b.ellipsoid(0.55, 0.1, 0, 0.16, 0.1, 0.16, [0.08, 0.12, 0.08], { seg: 10, ring: 6 });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.limb([[0.2 - k * 0.2, 0.15, s * 0.25], [0.25 - k * 0.25, 0.32, s * 0.55], [0.3 - k * 0.3, 0.38, s * 0.62]], 0.03, 0.015, [0.08, 0.06, 0.05], { seg: 4 });
  return b;
}
function buildSeedPile(n, seed) {
  const b = new MeshB(), r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, rr = Math.sqrt(r()) * 0.45, h = (1 - rr / 0.5) * 0.15;
    const col = r() < 0.5 ? [0.58, 0.42, 0.22] : [0.76, 0.66, 0.4];
    const yaw = r() * 3;
    b.ellipsoid(Math.cos(a) * rr, 0.05 + h + r() * 0.05, Math.sin(a) * rr, 0.09, 0.05, 0.06, col, { seg: 8, ring: 5, rot: (x, y, z) => [x * Math.cos(yaw) - z * Math.sin(yaw), y, x * Math.sin(yaw) + z * Math.cos(yaw)] });
  }
  return b;
}
function buildCrumbs(n, seed) {
  const b = new MeshB(), r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const s = 0.12 + r() * 0.18;
    b.ellipsoid((r() - 0.5) * 0.9, s * 0.4, (r() - 0.5) * 0.8, s, s * 0.7, s * 0.9, [0.85 + r() * 0.1, 0.66 + r() * 0.1, 0.36], { seg: 7, ring: 5, bump: 0.6, seed: i + seed, noise: 0.15 });
  }
  return b;
}
function buildAphidStem(n) {
  const b = new MeshB();
  b.limb([[0, 0, 0], [0.05, 0.4, 0.02], [0.12, 0.85, 0], [0.22, 1.2, -0.05]], 0.04, 0.02, [0.26, 0.46, 0.14], { seg: 5 });
  for (let i = 0; i < n; i++) {
    const t = 0.2 + i / n * 0.7, y = t * 1.2, x = t * 0.18 + Math.sin(i * 2.3) * 0.05, z = Math.cos(i * 2.3) * 0.06;
    b.ellipsoid(x + 0.05, y, z, 0.06, 0.045, 0.05, [0.6, 0.82, 0.3], { seg: 8, ring: 5, noise: 0.03 });
  }
  return b;
}
function buildRing() {   // flat torus for selection & swarm markers
  const b = new MeshB(), seg = 40, base = b.vcount;
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * 6.28;
    for (const rr of [0.9, 1.0]) b.v(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, 1, 0, 1, 1, 1);
  }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; b.tri(a, a + 2, a + 1); b.tri(a + 1, a + 2, a + 3); }
  return b;
}
function buildDisc() {
  const b = new MeshB(), seg = 32, c = b.v(0, 0, 0, 0, 1, 0, 1, 1, 1);
  for (let i = 0; i <= seg; i++) { const a = i / seg * 6.28; b.v(Math.cos(a), 0, Math.sin(a), 0, 1, 0, 1, 1, 1); }
  for (let i = 0; i < seg; i++) b.tri(c, c + i + 2, c + i + 1);
  return b;
}
// brood & stores (colony)
const buildEgg = () => new MeshB().ellipsoid(0, 0.06, 0, 0.07, 0.05, 0.05, [0.96, 0.94, 0.86], { seg: 10, ring: 6, noise: 0.01 });
const buildPupa = () => new MeshB().ellipsoid(0, 0.08, 0, 0.16, 0.075, 0.08, [0.82, 0.71, 0.52], { seg: 12, ring: 8, noise: 0.08 });
function buildLarva() {
  const b = new MeshB();
  for (let i = 0; i < 7; i++) { const a = 0.4 + i * 0.36; b.ellipsoid(Math.cos(a) * 0.1, 0.07 + Math.sin(a) * 0.06, 0, 0.055, 0.055, 0.055, [0.97, 0.95, 0.9], { seg: 8, ring: 6, noise: 0.01 }); }
  return b;
}
function buildFungus(seed) {
  const b = new MeshB(), r = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const s = 0.09 + r() * 0.14, x = (r() - 0.5) * 1.6, z = (r() - 0.5) * 0.9;
    b.ellipsoid(x, s * 0.8 + r() * 0.15, z, s, s * 0.85, s, [0.86 - r() * 0.1, 0.84 - r() * 0.1, 0.76 - r() * 0.12], { seg: 8, ring: 6, bump: 0.5, noise: 0.18, seed: i + seed });
  }
  return b;
}
