/* Altrove - props.js
 * Geometrie procedurali per tutto quello che sta sopra il terreno: alberi,
 * cespugli, sassi, erba, cactus, cristalli.
 *
 * Niente modelli da caricare. Ogni tipo e una funzione che, dato un generatore
 * casuale, costruisce una variante diversa: due abeti non hanno mai lo stesso
 * numero di palchi ne la stessa inclinazione.
 *
 * Due attributi oltre ai soliti:
 *   color  - colore gia cotto nel vertice, con la base piu scura della cima
 *            (una finta occlusione ambientale che costa zero)
 *   aFlex  - quanto quel vertice si piega al vento: 0 alla radice, 1 in punta
 */

import * as THREE from '../vendor/three.module.js';

/* ------------------------------------------------------------------ *
 * Costruttore di geometrie
 * Sfaccettato: ogni triangolo ha i suoi vertici e la sua normale. Costa il
 * triplo dei vertici ma da lo stacco netto delle facce, che su forme cosi
 * piccole legge meglio di una superficie levigata.
 * ------------------------------------------------------------------ */
export class Builder {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.f = [];
  }

  tri(a, b, c, ca, cb, cc, fa, fb, fc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
    this.f.push(fa, fb, fc);
  }

  /* Triangolo con normali imposte: serve alle chiome, dove una normale
   * gonfiata verso l esterno fa sembrare la massa fogliare tonda. */
  triN(a, b, c, na, nb, nc, ca, cb, cc, fa, fb, fc) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.c.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
    this.f.push(fa, fb, fc);
  }

  quad(a, b, c, d, ca, cb, cc, cd, fa, fb, fc, fd) {
    this.tri(a, b, c, ca, cb, cc, fa, fb, fc);
    this.tri(a, c, d, ca, cc, cd, fa, fc, fd);
  }

  get count() { return this.p.length / 3; }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.f, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------------------------------------------ *
 * Utilita di colore
 * ------------------------------------------------------------------ */
function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function lin(hex) {
  return [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)];
}
export function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function scale(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
export function jitterC(c, rnd, amt) {
  const k = 1 + (rnd() - 0.5) * amt;
  return [c[0] * k, c[1] * k * (1 + (rnd() - 0.5) * amt * 0.4), c[2] * k];
}

/* ------------------------------------------------------------------ *
 * Primitive
 * ------------------------------------------------------------------ */

/* Tronco affusolato, eventualmente curvo. Le facce laterali sono sfaccettate. */
export function trunk(B, opts) {
  const {
    r0 = 0.2, r1 = 0.08, h = 5, seg = 6, rings = 3,
    curve = [0, 0], colBot, colTop, flexTop = 0.25, x0 = 0, z0 = 0,
    bulge = 0, twist = 0
  } = opts;

  const ringPts = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const y = h * t;
    let r = r0 + (r1 - r0) * t;
    if (bulge) r *= 1 + bulge * Math.sin(t * Math.PI) * 0.5;
    // curvatura: lo spostamento cresce col quadrato dell altezza
    const cx = x0 + curve[0] * t * t;
    const cz = z0 + curve[1] * t * t;
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + twist * t;
      pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
    ringPts.push({ pts, t });
  }
  for (let k = 0; k < rings; k++) {
    const A = ringPts[k], Bb = ringPts[k + 1];
    const cA = mixc(colBot, colTop, A.t), cB = mixc(colBot, colTop, Bb.t);
    const fA = flexTop * A.t * A.t, fB = flexTop * Bb.t * Bb.t;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      // leggera variazione per faccia: il tronco non e un cilindro perfetto
      const shade = 0.86 + 0.14 * (0.5 + 0.5 * Math.cos((i / seg) * Math.PI * 2 + 0.8));
      B.quad(A.pts[i], A.pts[j], Bb.pts[j], Bb.pts[i],
        scale(cA, shade), scale(cA, shade), scale(cB, shade), scale(cB, shade),
        fA, fA, fB, fB);
    }
  }
  const top = ringPts[rings];
  return { top: [top.pts[0][0] * 0 + (opts.x0 || 0) + curve[0], h, (opts.z0 || 0) + curve[1]], ring: top.pts };
}

/* Massa organica: icosaedro deformato. Le normali puntano verso l esterno del
 * centro, non della faccia: da lontano sembra una chioma, non un poliedro. */
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
  [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
  [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1]
].map(v => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; });
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
];

function subdivide(verts, faces, times) {
  for (let s = 0; s < times; s++) {
    const nf = [];
    const mid = new Map();
    const getMid = (a, b) => {
      const key = a < b ? a + ',' + b : b + ',' + a;
      if (mid.has(key)) return mid.get(key);
      const va = verts[a], vb = verts[b];
      let m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
      const l = Math.hypot(...m) || 1;
      m = [m[0] / l, m[1] / l, m[2] / l];
      verts.push(m);
      mid.set(key, verts.length - 1);
      return verts.length - 1;
    };
    for (const f of faces) {
      const a = getMid(f[0], f[1]), b = getMid(f[1], f[2]), c = getMid(f[2], f[0]);
      nf.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]);
    }
    faces = nf;
  }
  return { verts, faces };
}

const SPHERE_CACHE = {};
export function unitSphere(level) {
  if (!SPHERE_CACHE[level]) {
    SPHERE_CACHE[level] = subdivide(ICO_V.map(v => v.slice()), ICO_F.map(f => f.slice()), level);
  }
  return SPHERE_CACHE[level];
}

export function blob(B, opts) {
  const {
    cx = 0, cy = 0, cz = 0, rx = 1, ry = 1, rz = 1,
    level = 1, rough = 0.22, rnd, colTop, colBot, flex = 1,
    freq = 2.2, squash = 1, roundNormals = true
  } = opts;
  const S = unitSphere(level);
  const ph = [rnd() * 10, rnd() * 10, rnd() * 10];
  const disp = (v) => {
    const d = 1 + rough * (
      Math.sin(v[0] * freq + ph[0]) * Math.sin(v[1] * freq * 1.3 + ph[1]) +
      Math.sin(v[2] * freq * 0.8 + ph[2]) * 0.7) * 0.5;
    return [v[0] * rx * d, v[1] * ry * d * squash, v[2] * rz * d];
  };
  const pos = S.verts.map(disp);
  for (const f of S.faces) {
    const a = pos[f[0]], b = pos[f[1]], c = pos[f[2]];
    const P = [
      [cx + a[0], cy + a[1], cz + a[2]],
      [cx + b[0], cy + b[1], cz + b[2]],
      [cx + c[0], cy + c[1], cz + c[2]]
    ];
    const cols = [f[0], f[1], f[2]].map(i => {
      const up = (S.verts[i][1] + 1) * 0.5;            // 0 sotto, 1 sopra
      return mixc(colBot, colTop, up * up * 0.85 + 0.15);
    });
    if (roundNormals) {
      const N = [f[0], f[1], f[2]].map(i => S.verts[i]);
      B.triN(P[0], P[1], P[2], N[0], N[1], N[2], cols[0], cols[1], cols[2], flex, flex, flex);
    } else {
      B.tri(P[0], P[1], P[2], cols[0], cols[1], cols[2], flex, flex, flex);
    }
  }
}

/* Lama: strisce affusolate e ricurve. Serve a erba, canne, fronde, felci. */
export function blade(B, opts) {
  const {
    x = 0, y = 0, z = 0, dir = 0, len = 0.6, wid = 0.035, seg = 4,
    bend = 0.5, lift = 0.9, colBase, colTip, flexMax = 1, twist = 0, taper = 1
  } = opts;
  const cd = Math.cos(dir), sd = Math.sin(dir);
  const pts = [];
  for (let k = 0; k <= seg; k++) {
    const t = k / seg;
    // la punta ricade in avanti
    const out = len * t * (0.35 + 0.65 * t) * bend;
    const up = len * lift * Math.sin(t * Math.PI * 0.52);
    const w = wid * Math.pow(1 - t, taper * 0.9) * (1 + twist * Math.sin(t * 3));
    pts.push({
      c: [x + cd * out, y + up, z + sd * out],
      w, t
    });
  }
  for (let k = 0; k < seg; k++) {
    const A = pts[k], C = pts[k + 1];
    const nx = -sd, nz = cd;
    const a0 = [A.c[0] - nx * A.w, A.c[1], A.c[2] - nz * A.w];
    const a1 = [A.c[0] + nx * A.w, A.c[1], A.c[2] + nz * A.w];
    const b0 = [C.c[0] - nx * C.w, C.c[1], C.c[2] - nz * C.w];
    const b1 = [C.c[0] + nx * C.w, C.c[1], C.c[2] + nz * C.w];
    const cA = mixc(colBase, colTip, A.t), cC = mixc(colBase, colTip, C.t);
    const fA = flexMax * A.t * A.t, fC = flexMax * C.t * C.t;
    if (C.w < 0.004) {
      B.tri(a0, a1, C.c, cA, cA, cC, fA, fA, fC);
    } else {
      B.quad(a0, a1, b1, b0, cA, cA, cC, cC, fA, fA, fC, fC);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Generatori: uno per tipo
 * Ricevono (rnd, tint) e restituiscono una BufferGeometry alta ~1 unita,
 * che lo scatter poi scala.
 * ------------------------------------------------------------------ */

const BARK_DARK = lin(0x3a2e22);
const BARK_LIGHT = lin(0x6b5540);

function conifer(rnd, tint) {
  const B = new Builder();
  const h = 5.5 + rnd() * 3.5;
  const bark = mixc(BARK_DARK, BARK_LIGHT, 0.3 + rnd() * 0.3);
  trunk(B, {
    r0: h * 0.030, r1: h * 0.010, h: h * 0.98, seg: 5, rings: 3,
    colBot: scale(bark, 0.6), colTop: bark, flexTop: 0.10,
    curve: [(rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.25]
  });
  const tips = 6 + Math.floor(rnd() * 4);
  const top = mixc(tint, [1, 1, 1], 0.14);
  const bot = scale(tint, 0.42);
  const startY = h * 0.16;
  for (let k = 0; k < tips; k++) {
    const t = k / (tips - 1);
    const y = startY + (h - startY) * t * 0.94;
    const r = h * 0.20 * (1 - t) * (1 - t * 0.30) + h * 0.016;
    const drop = h * 0.075 * (1 - t * 0.4);
    const seg = 7;
    const a0 = rnd() * 6.28;
    const ringA = [], ringB = [];
    for (let i = 0; i < seg; i++) {
      const a = a0 + (i / seg) * Math.PI * 2;
      const rr = r * (0.82 + 0.30 * ((i * 7919) % 13) / 13);
      ringA.push([Math.cos(a) * rr, y - drop, Math.sin(a) * rr]);
      ringB.push([Math.cos(a) * rr * 0.30, y + drop * 0.25, Math.sin(a) * rr * 0.30]);
    }
    const apex = [0, y + h * 0.085 * (1 - t * 0.5), 0];
    const cUp = mixc(bot, top, 0.25 + t * 0.65);
    const cDn = scale(cUp, 0.66);
    const fx = 0.28 + t * 0.5;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      B.tri(ringA[i], ringA[j], apex, cDn, cDn, cUp, fx, fx, fx * 1.15);
      B.tri(ringB[j], ringB[i], ringA[i], cUp, cUp, cDn, fx, fx, fx);
      B.tri(ringB[j], ringA[i], ringA[j], cUp, cDn, cDn, fx, fx, fx);
    }
  }
  return B.toGeometry();
}

function broadleaf(rnd, tint) {
  const B = new Builder();
  const h = 5 + rnd() * 4;
  const bark = mixc(BARK_DARK, BARK_LIGHT, 0.25 + rnd() * 0.4);
  const th = h * 0.52;
  trunk(B, {
    r0: h * 0.042, r1: h * 0.020, h: th, seg: 6, rings: 3,
    colBot: scale(bark, 0.55), colTop: bark, flexTop: 0.10,
    curve: [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4]
  });
  // rami
  const nb = 3 + Math.floor(rnd() * 2);
  const arms = [];
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * 6.28 + rnd() * 0.9;
    const reach = h * (0.16 + rnd() * 0.13);
    const up = h * (0.16 + rnd() * 0.10);
    trunk(B, {
      r0: h * 0.020, r1: h * 0.008, h: up, seg: 4, rings: 2,
      x0: 0, z0: 0,
      curve: [Math.cos(a) * reach, Math.sin(a) * reach],
      colBot: scale(bark, 0.75), colTop: bark, flexTop: 0.35
    });
    // il tronco parte da 0: alzo il ramo traslandone i vertici appena scritti
    arms.push({ x: Math.cos(a) * reach, z: Math.sin(a) * reach, y: th + up });
  }
  // sposta i rami in cima al tronco
  const startArms = B.p.length - nb * 4 * 2 * 6 * 3;
  for (let i = Math.max(0, startArms); i < B.p.length; i += 3) B.p[i + 1] += th * 0.92;

  const top = mixc(tint, [1, 1, 1], 0.20);
  const bot = scale(tint, 0.34);
  const cr = h * 0.30;
  blob(B, { cx: 0, cy: th + h * 0.30, cz: 0, rx: cr, ry: cr * 0.80, rz: cr, level: 1, rough: 0.30, rnd, colTop: top, colBot: bot, flex: 0.75 });
  for (const a of arms) {
    const r = cr * (0.55 + rnd() * 0.30);
    blob(B, {
      cx: a.x * 1.15, cy: a.y * 0.99 + h * 0.02, cz: a.z * 1.15,
      rx: r, ry: r * 0.82, rz: r, level: 1, rough: 0.34, rnd,
      colTop: jitterC(top, rnd, 0.16), colBot: bot, flex: 0.95
    });
  }
  return B.toGeometry();
}

function birch(rnd, tint) {
  const B = new Builder();
  const h = 6 + rnd() * 3;
  const bark = lin(0xd8d6cc);
  const th = h * 0.62;
  trunk(B, {
    r0: h * 0.022, r1: h * 0.012, h: th, seg: 6, rings: 4,
    colBot: scale(bark, 0.72), colTop: bark, flexTop: 0.14,
    curve: [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5]
  });
  const top = mixc(tint, [1, 1, 1], 0.24);
  const bot = scale(tint, 0.40);
  const n = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28, rr = h * (0.04 + rnd() * 0.13);
    const r = h * (0.13 + rnd() * 0.09);
    blob(B, {
      cx: Math.cos(a) * rr, cy: th + h * (0.06 + rnd() * 0.26), cz: Math.sin(a) * rr,
      rx: r, ry: r * 1.15, rz: r, level: 1, rough: 0.38, rnd,
      colTop: jitterC(top, rnd, 0.18), colBot: bot, flex: 1.0
    });
  }
  return B.toGeometry();
}

function swampTree(rnd, tint) {
  const B = new Builder();
  const h = 6 + rnd() * 4;
  const bark = mixc(BARK_DARK, lin(0x5a5040), 0.3 + rnd() * 0.3);
  // base allargata, come i cipressi calvi
  trunk(B, {
    r0: h * 0.11, r1: h * 0.030, h: h * 0.30, seg: 7, rings: 2,
    colBot: scale(bark, 0.45), colTop: scale(bark, 0.8), flexTop: 0.02
  });
  trunk(B, {
    r0: h * 0.030, r1: h * 0.014, h: h * 0.62, seg: 6, rings: 3,
    colBot: scale(bark, 0.8), colTop: bark, flexTop: 0.12,
    curve: [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4]
  });
  const startY = h * 0.30;
  for (let i = B.p.length - (6 * 3 * 2 * 3 * 3); i < B.p.length; i += 3) {
    if (i >= 0) B.p[i + 1] += 0;
  }
  const top = mixc(tint, [1, 1, 1], 0.16);
  const bot = scale(tint, 0.30);
  const n = 4 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28, rr = h * (0.05 + rnd() * 0.20);
    const r = h * (0.16 + rnd() * 0.10);
    blob(B, {
      cx: Math.cos(a) * rr, cy: startY + h * (0.42 + rnd() * 0.34), cz: Math.sin(a) * rr,
      rx: r * 1.25, ry: r * 0.5, rz: r * 1.25, level: 1, rough: 0.4, rnd,
      colTop: jitterC(top, rnd, 0.2), colBot: bot, flex: 1.0
    });
  }
  return B.toGeometry();
}

function palm(rnd, tint) {
  const B = new Builder();
  const h = 6 + rnd() * 4;
  const bark = mixc(lin(0x6b5a44), lin(0x8a7358), rnd());
  const lean = (rnd() - 0.5) * h * 0.30;
  const leanZ = (rnd() - 0.5) * h * 0.30;
  trunk(B, {
    r0: h * 0.032, r1: h * 0.020, h: h * 0.90, seg: 7, rings: 6,
    colBot: scale(bark, 0.6), colTop: bark, flexTop: 0.30,
    curve: [lean, leanZ], bulge: 0.12
  });
  const tx = lean, ty = h * 0.90, tz = leanZ;
  const nf = 8 + Math.floor(rnd() * 4);
  const top = mixc(tint, [1, 1, 1], 0.18);
  const bot = scale(tint, 0.40);
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * 6.28 + rnd() * 0.3;
    const len = h * (0.30 + rnd() * 0.14);
    // ogni fronda e una spina centrale con foglioline ai lati
    blade(B, {
      x: tx, y: ty, z: tz, dir: a, len, wid: h * 0.010, seg: 5,
      bend: 1.5, lift: 0.42, colBase: bot, colTip: top, flexMax: 1.0, taper: 0.7
    });
    const leaflets = 6;
    for (let i = 1; i <= leaflets; i++) {
      const t = i / (leaflets + 1);
      const out = len * t * (0.35 + 0.65 * t) * 1.5;
      const up = len * 0.42 * Math.sin(t * Math.PI * 0.52);
      for (const side of [-1, 1]) {
        blade(B, {
          x: tx + Math.cos(a) * out, y: ty + up, z: tz + Math.sin(a) * out,
          dir: a + side * (1.05 - t * 0.35),
          len: len * (0.30 + 0.24 * Math.sin(t * Math.PI)),
          wid: h * 0.0075, seg: 2, bend: 1.0, lift: 0.10,
          colBase: mixc(bot, top, t), colTip: top, flexMax: 1.0, taper: 1.2
        });
      }
    }
  }
  return B.toGeometry();
}

function acacia(rnd, tint) {
  const B = new Builder();
  const h = 5 + rnd() * 3;
  const bark = mixc(lin(0x4a3c2c), lin(0x7a6248), rnd());
  const th = h * 0.52;
  trunk(B, { r0: h * 0.075, r1: h * 0.038, h: th, seg: 7, rings: 3, colBot: scale(bark, 0.55), colTop: bark, flexTop: 0.05, curve: [(rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35] });
  const nb = 4;
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * 6.28 + rnd() * 0.7;
    const reach = h * (0.22 + rnd() * 0.12);
    trunk(B, {
      r0: h * 0.030, r1: h * 0.011, h: h * 0.22, seg: 5, rings: 2,
      x0: 0, z0: 0,
      curve: [Math.cos(a) * reach, Math.sin(a) * reach],
      colBot: bark, colTop: scale(bark, 1.1), flexTop: 0.28
    });
  }
  // la chioma ad ombrello: dischi appiattiti e sovrapposti
  const top = mixc(tint, [1, 1, 1], 0.18);
  const bot = scale(tint, 0.34);
  const cy = th + h * 0.22;
  const cr = h * 0.40;
  blob(B, { cx: 0, cy, cz: 0, rx: cr, ry: cr * 0.34, rz: cr, level: 1, rough: 0.30, rnd, colTop: top, colBot: bot, flex: 0.8 });
  for (let k = 0; k < 5; k++) {
    const a = rnd() * 6.28, rr = cr * (0.22 + rnd() * 0.48);
    const r = cr * (0.34 + rnd() * 0.30);
    blob(B, {
      cx: Math.cos(a) * rr, cy: cy + h * (rnd() * 0.11 - 0.02), cz: Math.sin(a) * rr,
      rx: r, ry: r * 0.40, rz: r, level: 1, rough: 0.34, rnd,
      colTop: jitterC(top, rnd, 0.16), colBot: bot, flex: 0.9
    });
  }
  return B.toGeometry();
}

function saguaro(rnd, tint) {
  const B = new Builder();
  const h = 4 + rnd() * 3;
  const top = mixc(tint, [1, 1, 1], 0.12);
  const bot = scale(tint, 0.55);
  const col = (r) => ({ colBot: bot, colTop: top });
  trunk(B, { r0: h * 0.075, r1: h * 0.055, h, seg: 9, rings: 4, ...col(), flexTop: 0.06, bulge: 0.06 });
  // cupola in cima
  blob(B, { cx: 0, cy: h, cz: 0, rx: h * 0.055, ry: h * 0.045, rz: h * 0.055, level: 1, rough: 0.06, rnd, colTop: top, colBot: mixc(bot, top, 0.6), flex: 0.05 });
  const arms = Math.floor(rnd() * 3);
  for (let k = 0; k < arms; k++) {
    const a = rnd() * 6.28;
    const y0 = h * (0.34 + rnd() * 0.28);
    const armH = h * (0.24 + rnd() * 0.20);
    const out = h * (0.12 + rnd() * 0.07);
    // gomito: prima fuori, poi su
    const seg = 6, rr = h * 0.045;
    const pts = [];
    const N = 7;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const bendT = Math.min(1, t * 1.7);
      const px = Math.cos(a) * out * Math.sin(bendT * Math.PI * 0.5);
      const pz = Math.sin(a) * out * Math.sin(bendT * Math.PI * 0.5);
      const py = y0 + armH * t * t * 0.9 + armH * 0.25 * t;
      pts.push([px, py, pz]);
    }
    for (let i = 0; i < N; i++) {
      const r0 = rr * (1 - i / N * 0.15), r1 = rr * (1 - (i + 1) / N * 0.15);
      for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg;
        const A0 = (s / seg) * 6.28, A1 = (s2 / seg) * 6.28;
        const shade = 0.85 + 0.15 * (0.5 + 0.5 * Math.cos(A0));
        const p0 = [pts[i][0] + Math.cos(A0) * r0, pts[i][1], pts[i][2] + Math.sin(A0) * r0];
        const p1 = [pts[i][0] + Math.cos(A1) * r0, pts[i][1], pts[i][2] + Math.sin(A1) * r0];
        const p2 = [pts[i + 1][0] + Math.cos(A1) * r1, pts[i + 1][1], pts[i + 1][2] + Math.sin(A1) * r1];
        const p3 = [pts[i + 1][0] + Math.cos(A0) * r1, pts[i + 1][1], pts[i + 1][2] + Math.sin(A0) * r1];
        const c = scale(mixc(bot, top, i / N), shade);
        B.quad(p0, p1, p2, p3, c, c, c, c, 0.02, 0.02, 0.03, 0.03);
      }
    }
    blob(B, { cx: pts[N][0], cy: pts[N][1], cz: pts[N][2], rx: rr * 0.95, ry: rr * 0.8, rz: rr * 0.95, level: 1, rough: 0.05, rnd, colTop: top, colBot: mixc(bot, top, 0.6), flex: 0.03 });
  }
  return B.toGeometry();
}

function barrelCactus(rnd, tint) {
  const B = new Builder();
  const r = 0.35 + rnd() * 0.3;
  const top = mixc(tint, [1, 1, 1], 0.14), bot = scale(tint, 0.5);
  const ribs = 10;
  const rings = 5;
  const H = r * (1.4 + rnd() * 0.7);
  for (let k = 0; k < rings; k++) {
    const t0 = k / rings, t1 = (k + 1) / rings;
    const y0 = H * t0, y1 = H * t1;
    const rr0 = r * Math.sin(Math.acos(Math.min(1, t0 * 1.9 - 0.9))) * 1.02 + r * 0.05;
    const rr1 = r * Math.sin(Math.acos(Math.min(1, t1 * 1.9 - 0.9))) * 1.02 + r * 0.05;
    for (let i = 0; i < ribs; i++) {
      const a0 = (i / ribs) * 6.28, a1 = ((i + 0.5) / ribs) * 6.28, a2 = ((i + 1) / ribs) * 6.28;
      const o = 1.0, inn = 0.86;
      const P = (a, rr, y, k2) => [Math.cos(a) * rr * k2, y, Math.sin(a) * rr * k2];
      const c0 = mixc(bot, top, t0), c1 = mixc(bot, top, t1);
      B.quad(P(a0, rr0, y0, o), P(a1, rr0, y0, inn), P(a1, rr1, y1, inn), P(a0, rr1, y1, o), c0, scale(c0, 0.7), scale(c1, 0.7), c1, 0.02, 0.02, 0.03, 0.03);
      B.quad(P(a1, rr0, y0, inn), P(a2, rr0, y0, o), P(a2, rr1, y1, o), P(a1, rr1, y1, inn), scale(c0, 0.7), c0, c1, scale(c1, 0.7), 0.02, 0.02, 0.03, 0.03);
    }
  }
  return B.toGeometry();
}

function bush(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.20), bot = scale(tint, 0.30);
  const n = 3 + Math.floor(rnd() * 3);
  const s = 0.5 + rnd() * 0.45;
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28, rr = s * rnd() * 0.55;
    const r = s * (0.35 + rnd() * 0.3);
    blob(B, {
      cx: Math.cos(a) * rr, cy: r * 0.85 + s * rnd() * 0.35, cz: Math.sin(a) * rr,
      rx: r, ry: r * 0.85, rz: r, level: 1, rough: 0.36, rnd,
      colTop: jitterC(top, rnd, 0.18), colBot: bot, flex: 0.8
    });
  }
  return B.toGeometry();
}

function dryBush(rnd, tint) {
  const B = new Builder();
  const col = tint, colT = mixc(tint, [1, 1, 1], 0.3);
  const n = 12 + Math.floor(rnd() * 10);
  const s = 0.45 + rnd() * 0.4;
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28;
    blade(B, {
      x: (rnd() - 0.5) * s * 0.25, y: 0, z: (rnd() - 0.5) * s * 0.25,
      dir: a, len: s * (0.5 + rnd() * 0.7), wid: 0.016, seg: 3,
      bend: 0.9 + rnd() * 0.7, lift: 0.75,
      colBase: scale(col, 0.6), colTip: colT, flexMax: 1.0, taper: 1.4
    });
  }
  return B.toGeometry();
}

function fern(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.22), bot = scale(tint, 0.35);
  const n = 5 + Math.floor(rnd() * 4);
  const s = 0.5 + rnd() * 0.4;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.28 + rnd() * 0.5;
    const len = s * (0.7 + rnd() * 0.4);
    blade(B, { x: 0, y: 0, z: 0, dir: a, len, wid: s * 0.030, seg: 4, bend: 1.15, lift: 0.85, colBase: bot, colTip: mixc(bot, top, 0.7), flexMax: 1.0, taper: 0.8 });
    const lf = 5;
    for (let i = 1; i <= lf; i++) {
      const t = i / (lf + 1);
      const out = len * t * (0.35 + 0.65 * t) * 1.15;
      const up = len * 0.85 * Math.sin(t * Math.PI * 0.52);
      for (const side of [-1, 1]) {
        blade(B, {
          x: Math.cos(a) * out, y: up, z: Math.sin(a) * out,
          dir: a + side * 1.15, len: len * 0.26 * (1 - t * 0.4), wid: s * 0.020, seg: 2,
          bend: 0.9, lift: 0.35, colBase: mixc(bot, top, 0.5), colTip: top, flexMax: 1.0, taper: 1.0
        });
      }
    }
  }
  return B.toGeometry();
}

function grassTuft(rnd, tint) {
  const B = new Builder();
  /* Molte lame strette invece di poche larghe. Con poche e larghe il ciuffo
   * legge come un mazzo di schegge di carta; con molte e strette le silhouette
   * si sovrappongono e da un metro sembra erba. Anche la base non va scurita
   * troppo, o il prato si riempie di buchi neri. */
  const top = mixc(tint, [1, 1, 1], 0.15), bot = scale(tint, 0.74);
  const n = 13 + Math.floor(rnd() * 6);
  const s = 0.30;
  for (let k = 0; k < n; k++) {
    blade(B, {
      x: (rnd() - 0.5) * 0.22, y: 0, z: (rnd() - 0.5) * 0.22,
      dir: rnd() * 6.28, len: s * (0.72 + rnd() * 0.52), wid: 0.020 + rnd() * 0.013,
      seg: 3, bend: 0.35 + rnd() * 0.45, lift: 0.97,
      colBase: bot, colTip: jitterC(top, rnd, 0.13), flexMax: 1.0, taper: 1.0
    });
  }
  return B.toGeometry();
}

function tallGrass(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.13), bot = scale(tint, 0.70);
  const n = 14 + Math.floor(rnd() * 7);
  const s = 0.9;
  for (let k = 0; k < n; k++) {
    blade(B, {
      x: (rnd() - 0.5) * 0.26, y: 0, z: (rnd() - 0.5) * 0.26,
      dir: rnd() * 6.28, len: s * (0.78 + rnd() * 0.44), wid: 0.021 + rnd() * 0.012,
      seg: 4, bend: 0.35 + rnd() * 0.4, lift: 0.97,
      colBase: bot, colTip: jitterC(top, rnd, 0.15), flexMax: 1.0, taper: 1.1
    });
  }
  return B.toGeometry();
}

function reed(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.13), bot = scale(tint, 0.40);
  const n = 5 + Math.floor(rnd() * 4);
  const s = 1.6;
  for (let k = 0; k < n; k++) {
    const dir = rnd() * 6.28;
    const len = s * (0.85 + rnd() * 0.4);
    blade(B, {
      x: (rnd() - 0.5) * 0.12, y: 0, z: (rnd() - 0.5) * 0.12,
      dir, len, wid: 0.019, seg: 4, bend: 0.22, lift: 0.99,
      colBase: bot, colTip: top, flexMax: 1.0, taper: 1.3
    });
    if (rnd() > 0.45) {
      // pannocchia in cima
      const bx = (rnd() - 0.5) * 0.12, bz = (rnd() - 0.5) * 0.12;
      const out = len * 0.22 * 0.9;
      blob(B, {
        cx: bx + Math.cos(dir) * out, cy: len * 0.99 * Math.sin(Math.PI * 0.52) + 0.02, cz: bz + Math.sin(dir) * out,
        rx: 0.022, ry: 0.09, rz: 0.022, level: 0, rough: 0.1, rnd,
        colTop: lin(0x6b4a2c), colBot: lin(0x4a3320), flex: 1.0
      });
    }
  }
  return B.toGeometry();
}

function rockGeo(rnd, tint, sharp) {
  const B = new Builder();
  const S = unitSphere(sharp ? 0 : 1);
  const ph = [rnd() * 10, rnd() * 10, rnd() * 10];
  const sx = 0.7 + rnd() * 0.6, sy = 0.45 + rnd() * 0.5, sz = 0.7 + rnd() * 0.6;
  const rough = sharp ? 0.42 : 0.30;
  const pos = S.verts.map(v => {
    const d = 1 + rough * (Math.sin(v[0] * 3.1 + ph[0]) * Math.sin(v[1] * 2.4 + ph[1]) + Math.sin(v[2] * 2.9 + ph[2]) * 0.8) * 0.5;
    return [v[0] * sx * d, Math.max(v[1] * sy * d, -sy * 0.15), v[2] * sz * d];
  });
  const top = mixc(tint, [1, 1, 1], 0.14), bot = scale(tint, 0.42);
  for (const f of S.faces) {
    const P = [pos[f[0]], pos[f[1]], pos[f[2]]].map(p => [p[0], p[1] + sy * 0.55, p[2]]);
    const cols = [f[0], f[1], f[2]].map(i => {
      const up = (S.verts[i][1] + 1) * 0.5;
      return mixc(bot, top, 0.20 + up * 0.80);
    });
    B.tri(P[0], P[1], P[2], cols[0], cols[1], cols[2], 0, 0, 0);
  }
  return B.toGeometry();
}
const rock = (rnd, tint) => rockGeo(rnd, tint, false);
const boulder = (rnd, tint) => rockGeo(rnd, tint, false);
const iceRock = (rnd, tint) => rockGeo(rnd, tint, true);
const lavaRock = (rnd, tint) => rockGeo(rnd, tint, true);

function crystal(rnd, tint) {
  const B = new Builder();
  const n = 3 + Math.floor(rnd() * 4);
  const top = mixc(tint, [1, 1, 1], 0.42), bot = scale(tint, 0.30);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28;
    const rr = rnd() * 0.30;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const h = 0.5 + rnd() * 1.1;
    const r = 0.07 + rnd() * 0.12;
    const tilt = (rnd() - 0.5) * 0.5;
    const tdir = rnd() * 6.28;
    const tx = bx + Math.cos(tdir) * tilt * h, tz = bz + Math.sin(tdir) * tilt * h;
    const seg = 6;
    const ring = [], ring2 = [];
    for (let i = 0; i < seg; i++) {
      const ang = (i / seg) * 6.28 + a;
      ring.push([bx + Math.cos(ang) * r, 0, bz + Math.sin(ang) * r]);
      ring2.push([tx + Math.cos(ang) * r * 0.55, h * 0.80, tz + Math.sin(ang) * r * 0.55]);
    }
    const apex = [tx, h, tz];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const sh = 0.78 + 0.32 * (0.5 + 0.5 * Math.cos((i / seg) * 6.28 + 1.1));
      B.quad(ring[i], ring[j], ring2[j], ring2[i], scale(bot, sh), scale(bot, sh), scale(top, sh), scale(top, sh), 0, 0, 0, 0);
      B.tri(ring2[i], ring2[j], apex, scale(top, sh), scale(top, sh), mixc(top, [1, 1, 1], 0.4), 0, 0, 0);
    }
  }
  return B.toGeometry();
}

function termiteMound(rnd, tint) {
  const B = new Builder();
  const h = 1.2 + rnd() * 1.4;
  const r = h * (0.28 + rnd() * 0.14);
  const seg = 8, rings = 5;
  const top = mixc(tint, [1, 1, 1], 0.14), bot = scale(tint, 0.45);
  const ph = rnd() * 10;
  for (let k = 0; k < rings; k++) {
    const t0 = k / rings, t1 = (k + 1) / rings;
    const r0 = r * Math.pow(1 - t0, 1.5), r1 = r * Math.pow(1 - t1, 1.5);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * 6.28, a1 = ((i + 1) / seg) * 6.28;
      const w0 = 1 + 0.20 * Math.sin(a0 * 3 + ph), w1 = 1 + 0.20 * Math.sin(a1 * 3 + ph);
      const P = (a, rr, w, y) => [Math.cos(a) * rr * w, y, Math.sin(a) * rr * w];
      const c0 = mixc(bot, top, t0), c1 = mixc(bot, top, t1);
      B.quad(P(a0, r0, w0, h * t0), P(a1, r0, w1, h * t0), P(a1, r1, w1, h * t1), P(a0, r1, w0, h * t1), c0, c0, c1, c1, 0, 0, 0, 0);
    }
  }
  return B.toGeometry();
}

function deadTree(rnd, tint) {
  const B = new Builder();
  const h = 4 + rnd() * 3;
  const bark = tint;
  trunk(B, { r0: h * 0.038, r1: h * 0.012, h: h * 0.8, seg: 5, rings: 3, colBot: scale(bark, 0.5), colTop: bark, flexTop: 0.10, curve: [(rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7] });
  const nb = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < nb; k++) {
    const a = rnd() * 6.28;
    const y0 = h * (0.35 + rnd() * 0.42);
    const reach = h * (0.14 + rnd() * 0.20);
    const up = h * (0.08 + rnd() * 0.18);
    const seg = 4, N = 3;
    const rr = h * 0.011;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const p0 = [Math.cos(a) * reach * t0, y0 + up * t0 * t0, Math.sin(a) * reach * t0];
      const p1 = [Math.cos(a) * reach * t1, y0 + up * t1 * t1, Math.sin(a) * reach * t1];
      const r0 = rr * (1 - t0 * 0.8), r1 = rr * (1 - t1 * 0.8);
      for (let s = 0; s < seg; s++) {
        const A0 = (s / seg) * 6.28, A1 = ((s + 1) / seg) * 6.28;
        const q0 = [p0[0] + Math.cos(A0) * r0, p0[1], p0[2] + Math.sin(A0) * r0];
        const q1 = [p0[0] + Math.cos(A1) * r0, p0[1], p0[2] + Math.sin(A1) * r0];
        const q2 = [p1[0] + Math.cos(A1) * r1, p1[1], p1[2] + Math.sin(A1) * r1];
        const q3 = [p1[0] + Math.cos(A0) * r1, p1[1], p1[2] + Math.sin(A0) * r1];
        const c = scale(bark, 0.8 + 0.3 * t0);
        const fx = 0.25 + t0 * 0.4;
        B.quad(q0, q1, q2, q3, c, c, c, c, fx, fx, fx, fx);
      }
    }
  }
  return B.toGeometry();
}

function stump(rnd, tint) {
  const B = new Builder();
  const r = 0.28 + rnd() * 0.22, h = 0.35 + rnd() * 0.4;
  const bark = tint, inner = mixc(tint, lin(0xc4a878), 0.55);
  const seg = 8;
  const ring0 = [], ring1 = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * 6.28;
    const w = 1 + 0.12 * Math.sin(a * 3);
    ring0.push([Math.cos(a) * r * w * 1.12, 0, Math.sin(a) * r * w * 1.12]);
    const hh = h * (0.82 + 0.30 * ((i * 7) % 5) / 5);
    ring1.push([Math.cos(a) * r * w, hh, Math.sin(a) * r * w]);
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const sh = 0.82 + 0.20 * (0.5 + 0.5 * Math.cos((i / seg) * 6.28));
    B.quad(ring0[i], ring0[j], ring1[j], ring1[i], scale(bark, sh * 0.6), scale(bark, sh * 0.6), scale(bark, sh), scale(bark, sh), 0, 0, 0, 0);
    B.tri(ring1[i], ring1[j], [0, h * 0.92, 0], inner, inner, mixc(inner, [1, 1, 1], 0.15), 0, 0, 0);
  }
  return B.toGeometry();
}

function log(rnd, tint) {
  const B = new Builder();
  const len = 1.6 + rnd() * 1.8, r = 0.14 + rnd() * 0.13;
  const seg = 7, N = 3;
  const bark = tint, inner = mixc(tint, lin(0xbfa07a), 0.5);
  const dir = rnd() * 6.28;
  const cd = Math.cos(dir), sd = Math.sin(dir);
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cx = cd * len * (t - 0.5), cz = sd * len * (t - 0.5);
    const rr = r * (0.82 + 0.30 * Math.sin(t * 2.3 + 1));
    const pts = [];
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * 6.28;
      pts.push([cx + Math.cos(a) * rr * 0.9 - sd * 0, r + Math.sin(a) * rr, cz + Math.sin(a) * 0 + Math.cos(a) * 0 + (-sd) * Math.cos(a) * rr * 0.9 * 0]);
    }
    // costruisco l anello nel piano perpendicolare all asse
    const px = -sd, pz = cd;
    pts.length = 0;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * 6.28;
      const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      pts.push([cx + px * ca, r + sa, cz + pz * ca]);
    }
    rings.push({ pts, t, rr, cx, cz });
  }
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < seg; s++) {
      const j = (s + 1) % seg;
      const sh = 0.80 + 0.24 * (0.5 + 0.5 * Math.sin((s / seg) * 6.28));
      const c = scale(bark, sh);
      B.quad(rings[i].pts[s], rings[i].pts[j], rings[i + 1].pts[j], rings[i + 1].pts[s], c, c, c, c, 0, 0, 0, 0);
    }
  }
  for (const end of [0, N]) {
    const R = rings[end];
    const cen = [R.cx, r, R.cz];
    for (let s = 0; s < seg; s++) {
      const j = (s + 1) % seg;
      B.tri(cen, R.pts[s], R.pts[j], mixc(inner, [1, 1, 1], 0.2), inner, inner, 0, 0, 0);
    }
  }
  return B.toGeometry();
}

function mushroom(rnd, tint) {
  const B = new Builder();
  const h = 0.10 + rnd() * 0.16;
  const capR = h * (0.65 + rnd() * 0.5);
  const stemC = lin(0xd8cdb4), capC = tint;
  trunk(B, { r0: h * 0.16, r1: h * 0.13, h, seg: 5, rings: 1, colBot: scale(stemC, 0.6), colTop: stemC, flexTop: 0.05 });
  const seg = 8;
  const rim = [], apex = [0, h + capR * 0.75, 0];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * 6.28;
    rim.push([Math.cos(a) * capR, h + capR * 0.10, Math.sin(a) * capR]);
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const sh = 0.82 + 0.22 * (0.5 + 0.5 * Math.cos((i / seg) * 6.28 + 0.6));
    B.tri(rim[i], rim[j], apex, scale(capC, sh), scale(capC, sh), mixc(capC, [1, 1, 1], 0.25), 0, 0, 0);
    B.tri(rim[j], rim[i], [0, h + capR * 0.05, 0], scale(capC, 0.35), scale(capC, 0.35), scale(capC, 0.28), 0, 0, 0);
  }
  return B.toGeometry();
}

function flower(rnd, tint) {
  const B = new Builder();
  const h = 0.18 + rnd() * 0.22;
  const stem = lin(0x4a6b28);
  blade(B, { x: 0, y: 0, z: 0, dir: rnd() * 6.28, len: h, wid: 0.008, seg: 3, bend: 0.25, lift: 0.98, colBase: scale(stem, 0.6), colTip: stem, flexMax: 1, taper: 1.2 });
  const top = [0, h * 0.96, 0];
  const petals = 5;
  const pr = 0.028 + rnd() * 0.022;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * 6.28;
    const p0 = [top[0], top[1], top[2]];
    const p1 = [top[0] + Math.cos(a) * pr, top[1] + pr * 0.35, top[2] + Math.sin(a) * pr];
    const p2 = [top[0] + Math.cos(a + 1.25) * pr, top[1] + pr * 0.35, top[2] + Math.sin(a + 1.25) * pr];
    B.tri(p0, p1, p2, mixc(tint, [1, 1, 1], 0.35), tint, tint, 1, 1, 1);
  }
  return B.toGeometry();
}


/* ------------------------------------------------------------------ *
 * Luoghi immaginari
 * ------------------------------------------------------------------ */

/* Albero contorto: tronco che si avvita, rami spezzati, poca chioma. La
 * curvatura marcata e la torsione fanno tutto il lavoro. */
function twistedTree(rnd, tint) {
  const B = new Builder();
  const h = 6 + rnd() * 4;
  const bark = mixc(lin(0x241f1c), lin(0x4a4038), rnd() * 0.7);
  const lean = (rnd() - 0.5) * h * 0.30;
  const leanZ = (rnd() - 0.5) * h * 0.30;
  trunk(B, {
    r0: h * 0.055, r1: h * 0.016, h: h * 0.66, seg: 7, rings: 5,
    colBot: scale(bark, 0.45), colTop: bark, flexTop: 0.16,
    curve: [lean, leanZ], twist: 1.5 + rnd() * 1.6, bulge: 0.22
  });
  const tx = lean, tz = leanZ, ty = h * 0.66;
  const nb = 4 + Math.floor(rnd() * 4);
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * 6.28 + rnd() * 1.0;
    const reach = h * (0.16 + rnd() * 0.22);
    const up = h * (0.10 + rnd() * 0.24);
    const N = 4, seg = 4;
    const rr = h * 0.016;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      // il ramo serpeggia invece di andare dritto
      const wob0 = Math.sin(t0 * 5 + k) * 0.22, wob1 = Math.sin(t1 * 5 + k) * 0.22;
      const p0 = [tx + Math.cos(a + wob0) * reach * t0, ty + up * Math.pow(t0, 0.7), tz + Math.sin(a + wob0) * reach * t0];
      const p1 = [tx + Math.cos(a + wob1) * reach * t1, ty + up * Math.pow(t1, 0.7), tz + Math.sin(a + wob1) * reach * t1];
      const r0 = rr * (1 - t0 * 0.85), r1 = rr * (1 - t1 * 0.85);
      for (let s = 0; s < seg; s++) {
        const A0 = (s / seg) * 6.28, A1 = ((s + 1) / seg) * 6.28;
        const q0 = [p0[0] + Math.cos(A0) * r0, p0[1], p0[2] + Math.sin(A0) * r0];
        const q1 = [p0[0] + Math.cos(A1) * r0, p0[1], p0[2] + Math.sin(A1) * r0];
        const q2 = [p1[0] + Math.cos(A1) * r1, p1[1], p1[2] + Math.sin(A1) * r1];
        const q3 = [p1[0] + Math.cos(A0) * r1, p1[1], p1[2] + Math.sin(A0) * r1];
        const c = scale(bark, 0.8 + 0.35 * t0);
        const fx = 0.20 + t0 * 0.5;
        B.quad(q0, q1, q2, q3, c, c, c, c, fx, fx, fx, fx);
      }
    }
    if (rnd() > 0.45) {
      const top = mixc(tint, [1, 1, 1], 0.12), bot = scale(tint, 0.28);
      const r = h * (0.07 + rnd() * 0.06);
      blob(B, {
        cx: tx + Math.cos(a) * reach * 1.05, cy: ty + up * 1.02, cz: tz + Math.sin(a) * reach * 1.05,
        rx: r * 1.5, ry: r * 0.55, rz: r * 1.5, level: 1, rough: 0.5, rnd,
        colTop: top, colBot: bot, flex: 1.0
      });
    }
  }
  return B.toGeometry();
}

/* Fungo luminoso: gambo chiaro, cappella accesa. L emissivo moltiplica il
 * colore del vertice, quindi basta che la cappella sia satura. */
function glowMushroom(rnd, tint) {
  const B = new Builder();
  const h = 0.22 + rnd() * 0.30;
  const capR = h * (0.45 + rnd() * 0.35);
  const stemC = mixc(lin(0xbfc8d4), tint, 0.30);
  trunk(B, { r0: h * 0.10, r1: h * 0.075, h, seg: 6, rings: 2, colBot: scale(stemC, 0.5), colTop: stemC, flexTop: 0.08 });
  const seg = 9;
  const rim = [], apex = [0, h + capR * 0.95, 0];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * 6.28;
    rim.push([Math.cos(a) * capR, h + capR * 0.16, Math.sin(a) * capR]);
  }
  const capC = tint, glow = mixc(tint, [1, 1, 1], 0.55);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    B.tri(rim[i], rim[j], apex, capC, capC, mixc(capC, [1, 1, 1], 0.20), 0.2, 0.2, 0.25);
    // le lamelle sotto sono la parte che brilla di piu
    B.tri(rim[j], rim[i], [0, h + capR * 0.06, 0], glow, glow, mixc(glow, [1, 1, 1], 0.3), 0.2, 0.2, 0.15);
  }
  return B.toGeometry();
}

/* Fungo gigante: alto come un albero, cappella larga, lamelle accese sotto */
function giantMushroom(rnd, tint) {
  const B = new Builder();
  const h = 4 + rnd() * 3.5;
  const capR = h * (0.42 + rnd() * 0.22);
  const stemC = mixc(lin(0xcbd2dc), tint, 0.22);
  trunk(B, {
    r0: h * 0.075, r1: h * 0.055, h: h * 0.82, seg: 8, rings: 4,
    colBot: scale(stemC, 0.42), colTop: stemC, flexTop: 0.10,
    curve: [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9], bulge: 0.16
  });
  const cx = 0, cz = 0, cy = h * 0.82;
  const seg = 14;
  const rim = [], apex = [cx, cy + capR * 0.62, cz];
  const under = [cx, cy + capR * 0.02, cz];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * 6.28;
    const w = 1 + 0.10 * Math.sin(a * 4 + rnd() * 0.1);
    rim.push([cx + Math.cos(a) * capR * w, cy + capR * 0.10, cz + Math.sin(a) * capR * w]);
  }
  const capC = tint, glow = mixc(tint, [1, 1, 1], 0.62);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const sh = 0.86 + 0.20 * (0.5 + 0.5 * Math.cos((i / seg) * 6.28 + 0.7));
    B.tri(rim[i], rim[j], apex, scale(capC, sh), scale(capC, sh), mixc(capC, [1, 1, 1], 0.18), 0.35, 0.35, 0.4);
    B.tri(rim[j], rim[i], under, glow, glow, scale(glow, 0.7), 0.35, 0.35, 0.2);
  }
  return B.toGeometry();
}

/* Albero fatato: fusto chiaro e slanciato, chioma che emette luce */
function fairyTree(rnd, tint) {
  const B = new Builder();
  const h = 9 + rnd() * 6;
  const bark = mixc(lin(0xd6cfe0), lin(0x8f86a8), rnd() * 0.6);
  const th = h * 0.58;
  trunk(B, {
    r0: h * 0.026, r1: h * 0.012, h: th, seg: 7, rings: 5,
    colBot: scale(bark, 0.55), colTop: bark, flexTop: 0.10,
    curve: [(rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8], twist: 0.6
  });
  const top = mixc(tint, [1, 1, 1], 0.35), bot = scale(tint, 0.30);
  const n = 5 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28, rr = h * (0.03 + rnd() * 0.16);
    const r = h * (0.11 + rnd() * 0.09);
    blob(B, {
      cx: Math.cos(a) * rr, cy: th + h * (0.05 + rnd() * 0.36), cz: Math.sin(a) * rr,
      rx: r, ry: r * 0.9, rz: r, level: 1, rough: 0.30, rnd,
      colTop: jitterC(top, rnd, 0.20), colBot: bot, flex: 1.0
    });
  }
  // festoni pendenti
  const nf = 6 + Math.floor(rnd() * 6);
  for (let k = 0; k < nf; k++) {
    const a = rnd() * 6.28, rr = h * (0.06 + rnd() * 0.14);
    blade(B, {
      x: Math.cos(a) * rr, y: th + h * (0.10 + rnd() * 0.18), z: Math.sin(a) * rr,
      dir: a, len: h * (0.10 + rnd() * 0.14), wid: 0.020, seg: 3,
      bend: 0.2, lift: -0.85, colBase: top, colTip: mixc(top, [1, 1, 1], 0.4),
      flexMax: 1.0, taper: 1.2
    });
  }
  return B.toGeometry();
}

/* Guglia a spirale: prismi impilati che ruotano. Roccia che non esiste sulla
 * Terra, ed e proprio questo il punto. */
function spiralRock(rnd, tint) {
  const B = new Builder();
  const h = 3 + rnd() * 5;
  const rings = 9;
  const seg = 6;
  const top = mixc(tint, [1, 1, 1], 0.18), bot = scale(tint, 0.40);
  const twist = (rnd() > 0.5 ? 1 : -1) * (1.6 + rnd() * 2.2);
  const lean = (rnd() - 0.5) * h * 0.22;
  const leanZ = (rnd() - 0.5) * h * 0.22;
  let prev = null;
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const y = h * t;
    const r = h * 0.16 * (1 - t * 0.82) * (1 + 0.22 * Math.sin(t * 9));
    const cx = lean * t * t, cz = leanZ * t * t;
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * 6.28 + twist * t;
      pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
    if (prev) {
      const cA = mixc(bot, top, (k - 1) / rings), cB = mixc(bot, top, t);
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const sh = 0.80 + 0.28 * (0.5 + 0.5 * Math.cos((i / seg) * 6.28 + 1.2));
        B.quad(prev[i], prev[j], pts[j], pts[i], scale(cA, sh), scale(cA, sh), scale(cB, sh), scale(cB, sh), 0, 0, 0, 0);
      }
    }
    prev = pts;
  }
  const apex = [lean, h * 1.06, leanZ];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    B.tri(prev[i], prev[j], apex, top, top, mixc(top, [1, 1, 1], 0.2), 0, 0, 0);
  }
  return B.toGeometry();
}

/* Albero del mondo di smeraldo: fusto sottile e grappoli sferici in cima */
function ajisaTree(rnd, tint) {
  const B = new Builder();
  const h = 7 + rnd() * 5;
  const bark = mixc(lin(0x6a5f4a), lin(0x9a8c6c), rnd());
  const th = h * 0.70;
  trunk(B, {
    r0: h * 0.022, r1: h * 0.013, h: th, seg: 6, rings: 4,
    colBot: scale(bark, 0.55), colTop: bark, flexTop: 0.12,
    curve: [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5]
  });
  const top = mixc(tint, [1, 1, 1], 0.22), bot = scale(tint, 0.34);
  const n = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.28 + rnd() * 0.6;
    const reach = h * (0.06 + rnd() * 0.14);
    const up = h * (0.06 + rnd() * 0.20);
    trunk(B, {
      r0: h * 0.011, r1: h * 0.006, h: up, seg: 4, rings: 2,
      curve: [Math.cos(a) * reach, Math.sin(a) * reach],
      colBot: bark, colTop: bark, flexTop: 0.4
    });
    const r = h * (0.10 + rnd() * 0.05);
    blob(B, {
      cx: Math.cos(a) * reach, cy: th + up + r * 0.5, cz: Math.sin(a) * reach,
      rx: r, ry: r * 0.92, rz: r, level: 1, rough: 0.18, rnd,
      colTop: jitterC(top, rnd, 0.14), colBot: bot, flex: 0.9
    });
  }
  // ciuffo centrale
  const r0 = h * 0.13;
  blob(B, { cx: 0, cy: th + r0 * 0.6, cz: 0, rx: r0, ry: r0 * 0.9, rz: r0, level: 1, rough: 0.20, rnd, colTop: top, colBot: bot, flex: 0.8 });
  return B.toGeometry();
}

/* Blocco squadrato: per le isole volanti e le rovine */
function slabRock(rnd, tint) {
  const B = new Builder();
  const sx = 0.6 + rnd() * 0.8, sy = 0.35 + rnd() * 0.7, sz = 0.6 + rnd() * 0.8;
  const S = unitSphere(0);
  const ph = [rnd() * 10, rnd() * 10, rnd() * 10];
  const pos = S.verts.map(v => {
    const d = 1 + 0.30 * Math.sin(v[0] * 2.2 + ph[0]) * Math.sin(v[2] * 1.9 + ph[1]);
    // schiacciato e squadrato: i vertici vengono spinti verso gli spigoli
    const q = (a) => Math.sign(a) * Math.pow(Math.abs(a), 0.55);
    return [q(v[0]) * sx * d, Math.max(q(v[1]) * sy * d, -sy * 0.2), q(v[2]) * sz * d];
  });
  const top = mixc(tint, [1, 1, 1], 0.18), bot = scale(tint, 0.35);
  for (const f of S.faces) {
    const P = [pos[f[0]], pos[f[1]], pos[f[2]]].map(p => [p[0], p[1] + sy * 0.5, p[2]]);
    const cols = [f[0], f[1], f[2]].map(i => mixc(bot, top, 0.18 + (S.verts[i][1] + 1) * 0.41));
    B.tri(P[0], P[1], P[2], cols[0], cols[1], cols[2], 0, 0, 0);
  }
  return B.toGeometry();
}


/* Bambu: canne a nodi, alte e sottili. La forma la fanno gli anelli, non le
 * foglie: senza i nodi sembrano tubi di plastica. */
function bamboo(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.16), bot = scale(tint, 0.55);
  const n = 5 + Math.floor(rnd() * 5);
  for (let k = 0; k < n; k++) {
    const h = 7 + rnd() * 4;
    const r = 0.050 + rnd() * 0.022;
    const bx = (rnd() - 0.5) * 1.0, bz = (rnd() - 0.5) * 1.0;
    const lean = (rnd() - 0.5) * h * 0.06, leanZ = (rnd() - 0.5) * h * 0.06;
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const rr0 = r * (1 - t0 * 0.42), rr1 = r * (1 - t1 * 0.42);
      const seg = 5;
      const c0 = mixc(bot, top, t0), c1 = mixc(bot, top, t1);
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * 6.28, a1 = ((s + 1) / seg) * 6.28;
        const P = (a, rr, t) => [
          bx + lean * t * t + Math.cos(a) * rr,
          h * t,
          bz + leanZ * t * t + Math.sin(a) * rr
        ];
        const sh = 0.82 + 0.24 * (0.5 + 0.5 * Math.cos(a0 + 0.9));
        B.quad(P(a0, rr0, t0), P(a1, rr0, t0), P(a1, rr1, t1), P(a0, rr1, t1),
          scale(c0, sh), scale(c0, sh), scale(c1, sh), scale(c1, sh),
          t0 * t0 * 0.5, t0 * t0 * 0.5, t1 * t1 * 0.5, t1 * t1 * 0.5);
      }
      // nodo: un anello leggermente piu largo
      if (i < segs - 1) {
        const rr = r * (1 - t1 * 0.42) * 1.22;
        const seg2 = 5;
        const cN = scale(mixc(bot, top, t1), 0.78);
        for (let s = 0; s < seg2; s++) {
          const a0 = (s / seg2) * 6.28, a1 = ((s + 1) / seg2) * 6.28;
          const P = (a, y) => [bx + lean * t1 * t1 + Math.cos(a) * rr, y, bz + leanZ * t1 * t1 + Math.sin(a) * rr];
          B.quad(P(a0, h * t1 - 0.035), P(a1, h * t1 - 0.035), P(a1, h * t1 + 0.035), P(a0, h * t1 + 0.035),
            cN, cN, cN, cN, t1 * t1 * 0.5, t1 * t1 * 0.5, t1 * t1 * 0.5, t1 * t1 * 0.5);
        }
      }
    }
    // foglie lanceolate nella parte alta
    const nl = 5 + Math.floor(rnd() * 5);
    for (let i = 0; i < nl; i++) {
      const t = 0.55 + rnd() * 0.45;
      blade(B, {
        x: bx + lean * t * t, y: h * t, z: bz + leanZ * t * t,
        dir: rnd() * 6.28, len: 0.55 + rnd() * 0.5, wid: 0.030, seg: 3,
        bend: 1.1, lift: 0.35, colBase: mixc(bot, top, 0.4), colTip: top,
        flexMax: 1.0, taper: 1.1
      });
    }
  }
  return B.toGeometry();
}

/* Colonna spezzata: base, fusto scanalato, rottura a quota casuale */
function ruinPillar(rnd, tint) {
  const B = new Builder();
  const h = 2.5 + rnd() * 4;
  const r = 0.34 + rnd() * 0.16;
  const top = mixc(tint, [1, 1, 1], 0.14), bot = scale(tint, 0.55);
  const flutes = 10;
  // plinto
  B.quad([-r * 1.5, 0, -r * 1.5], [r * 1.5, 0, -r * 1.5], [r * 1.5, 0, r * 1.5], [-r * 1.5, 0, r * 1.5],
    scale(bot, 0.7), scale(bot, 0.7), scale(bot, 0.7), scale(bot, 0.7), 0, 0, 0, 0);
  const bh = 0.28;
  for (let s = 0; s < 4; s++) {
    const a0 = s * Math.PI / 2 + Math.PI / 4, a1 = (s + 1) * Math.PI / 2 + Math.PI / 4;
    const R = r * 2.12;
    const p0 = [Math.cos(a0) * R, 0, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, 0, Math.sin(a1) * R];
    const q0 = [p0[0], bh, p0[2]], q1 = [p1[0], bh, p1[2]];
    B.quad(p0, p1, q1, q0, scale(bot, 0.8), scale(bot, 0.8), bot, bot, 0, 0, 0, 0);
    B.tri(q0, q1, [0, bh, 0], mixc(bot, top, 0.4), mixc(bot, top, 0.4), top, 0, 0, 0);
  }
  // fusto scanalato, con la cima spezzata di sbieco
  const rings = 5;
  const tiltA = rnd() * 6.28, tiltAmt = 0.35 + rnd() * 0.5;
  for (let k = 0; k < rings; k++) {
    const t0 = k / rings, t1 = (k + 1) / rings;
    const y0 = bh + h * t0, y1 = bh + h * t1;
    for (let i = 0; i < flutes; i++) {
      const a0 = (i / flutes) * 6.28, am = ((i + 0.5) / flutes) * 6.28, a1 = ((i + 1) / flutes) * 6.28;
      const P = (a, y, k2) => {
        // la rottura: la quota massima varia con l angolo
        const cut = (t) => Math.min(t, 1);
        return [Math.cos(a) * r * k2, y, Math.sin(a) * r * k2];
      };
      const brk = (a) => 1 - tiltAmt * Math.max(0, Math.cos(a - tiltA)) * (t1 > 0.75 ? 1 : 0);
      const yy1 = bh + h * t1 * brk(am);
      const c0 = mixc(bot, top, t0 * 0.8 + 0.1), c1 = mixc(bot, top, t1 * 0.8 + 0.1);
      B.quad(P(a0, y0, 1.0), P(am, y0, 0.88), P(am, yy1, 0.88), P(a0, yy1, 1.0),
        c0, scale(c0, 0.72), scale(c1, 0.72), c1, 0, 0, 0, 0);
      B.quad(P(am, y0, 0.88), P(a1, y0, 1.0), P(a1, yy1, 1.0), P(am, yy1, 0.88),
        scale(c0, 0.72), c0, c1, scale(c1, 0.72), 0, 0, 0, 0);
      if (k === rings - 1) {
        B.tri(P(a0, yy1, 1.0), P(am, yy1, 0.88), [0, bh + h * 0.9, 0], scale(top, 0.7), scale(top, 0.7), scale(top, 0.6), 0, 0, 0);
      }
    }
  }
  return B.toGeometry();
}


/* Cicade: tronco tozzo e squamoso, corona di fronde rigide. Non e una palma:
 * il fusto e corto e grosso, ed e questo a datare il paesaggio. */
function cycad(rnd, tint) {
  const B = new Builder();
  const h = 2.0;
  const bark = mixc(lin(0x40321f), lin(0x6b5638), rnd());
  trunk(B, {
    r0: h * 0.17, r1: h * 0.14, h: h * 0.50, seg: 9, rings: 4,
    colBot: scale(bark, 0.48), colTop: bark, flexTop: 0.04, bulge: 0.18
  });
  // scaglie del fusto
  for (let k = 0; k < 14; k++) {
    const a = rnd() * 6.28, y = h * 0.50 * rnd();
    const r = h * 0.155;
    const p = [Math.cos(a) * r, y, Math.sin(a) * r];
    B.tri(p, [p[0] * 1.16, y + h * 0.045, p[2] * 1.16], [p[0] * 1.10, y - h * 0.02, p[2] * 1.10],
      scale(bark, 0.7), scale(bark, 1.1), scale(bark, 0.6), 0, 0, 0);
  }
  const top = mixc(tint, [1, 1, 1], 0.07), bot = scale(tint, 0.52);
  const nf = 10 + Math.floor(rnd() * 5);
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * 6.28 + rnd() * 0.35;
    const len = h * (0.52 + rnd() * 0.28);
    /* La fronda deve inarcarsi e ricadere, non aprirsi a raggiera: con
     * lift alto la corona diventa un riccio di mare. */
    blade(B, {
      x: 0, y: h * 0.50, z: 0, dir: a, len, wid: h * 0.042, seg: 4,
      bend: 1.60, lift: 0.26, colBase: bot, colTip: top, flexMax: 1.0, taper: 0.85
    });
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const out = len * t * (0.35 + 0.65 * t) * 1.60;
      const up = len * 0.26 * Math.sin(t * Math.PI * 0.52);
      for (const s of [-1, 1]) {
        blade(B, {
          x: Math.cos(a) * out, y: h * 0.50 + up, z: Math.sin(a) * out,
          dir: a + s * 1.35, len: len * 0.155, wid: h * 0.020, seg: 2,
          bend: 0.55, lift: -0.20, colBase: mixc(bot, top, 0.5), colTip: top,
          flexMax: 1.0, taper: 1.1
        });
      }
    }
  }
  return B.toGeometry();
}


/* Tubo fra due punti nello spazio: serve ai coralli ramificati. */
function tube(B, a, b, ra, rb, colA, colB, seg, flexA, flexB) {
  seg = seg || 5;
  let ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len; ay /= len; az /= len;
  // due assi perpendicolari all asse del tubo
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(ay) > 0.9) { ux = 1; uy = 0; }
  let px = uy * az - uz * ay, py = uz * ax - ux * az, pz = ux * ay - uy * ax;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * 6.28318, t1 = ((i + 1) / seg) * 6.28318;
    const P = (p, r, t) => [
      p[0] + (Math.cos(t) * px + Math.sin(t) * qx) * r,
      p[1] + (Math.cos(t) * py + Math.sin(t) * qy) * r,
      p[2] + (Math.cos(t) * pz + Math.sin(t) * qz) * r
    ];
    const sh = 0.80 + 0.26 * (0.5 + 0.5 * Math.cos(t0 + 0.7));
    B.quad(P(a, ra, t0), P(a, ra, t1), P(b, rb, t1), P(b, rb, t0),
      scale(colA, sh), scale(colA, sh), scale(colB, sh), scale(colB, sh),
      flexA || 0, flexA || 0, flexB || 0, flexB || 0);
  }
}

/* Corallo ramificato: la ricorsione fa tutto, come in un albero vero. */
function coral(rnd, tint) {
  const B = new Builder();
  /* Poco bianco nelle punte: sott acqua la luce e gia diffusa e schiarisce da
   * se, sommando i due effetti i coralli diventano ossa sbiancate. */
  const top = mixc(tint, [1, 1, 1], 0.16), bot = scale(tint, 0.55);
  const grow = (p, dir, len, r, depth) => {
    const q = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    const t = 1 - depth / 4;
    tube(B, p, q, r, r * 0.72, mixc(bot, top, t), mixc(bot, top, t + 0.25), 5, t * 0.4, (t + 0.25) * 0.5);
    if (depth <= 0) return;
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, spread = 0.5 + rnd() * 0.6;
      let d = [
        dir[0] + Math.cos(a) * spread,
        dir[1] * (0.55 + rnd() * 0.5) + 0.25,
        dir[2] + Math.sin(a) * spread
      ];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      d = [d[0] / l, d[1] / l, d[2] / l];
      grow(q, d, len * (0.62 + rnd() * 0.22), r * 0.70, depth - 1);
    }
  };
  const n0 = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n0; i++) {
    const a = (i / n0) * 6.28 + rnd();
    grow([Math.cos(a) * 0.10, 0, Math.sin(a) * 0.10],
      [Math.cos(a) * 0.28, 0.96, Math.sin(a) * 0.28], 0.32, 0.055, 3);
  }
  return B.toGeometry();
}

/* Corallo cerebriforme: cupola con i solchi */
function brainCoral(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.12), bot = scale(tint, 0.52);
  const S = unitSphere(2);
  const ph = rnd() * 10;
  const rx = 0.5 + rnd() * 0.35, ry = 0.36 + rnd() * 0.22, rz = 0.5 + rnd() * 0.35;
  const pos = S.verts.map(v => {
    // i solchi: una modulazione stretta lungo una direzione
    const g = Math.sin(v[0] * 11 + ph) * Math.sin(v[2] * 7 + ph * 0.5);
    const d = 1 + 0.10 * g;
    return [v[0] * rx * d, Math.max(v[1] * ry * d, -ry * 0.1), v[2] * rz * d];
  });
  for (const f of S.faces) {
    const P = [pos[f[0]], pos[f[1]], pos[f[2]]].map(p => [p[0], p[1] + ry * 0.35, p[2]]);
    const cols = [f[0], f[1], f[2]].map(i => mixc(bot, top, 0.25 + (S.verts[i][1] + 1) * 0.38));
    B.tri(P[0], P[1], P[2], cols[0], cols[1], cols[2], 0, 0, 0);
  }
  return B.toGeometry();
}

/* Alga: nastri lunghi che ondeggiano con la corrente (usa il canale del vento) */
function kelp(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.22), bot = scale(tint, 0.45);
  const n = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    blade(B, {
      x: (rnd() - 0.5) * 0.3, y: 0, z: (rnd() - 0.5) * 0.3,
      dir: rnd() * 6.28, len: 2.4 + rnd() * 1.6, wid: 0.075 + rnd() * 0.05,
      seg: 6, bend: 0.30, lift: 0.97, colBase: bot, colTip: top,
      flexMax: 1.0, taper: 0.55
    });
  }
  return B.toGeometry();
}

/* Anemone: corolla di tentacoli */
function anemone(rnd, tint) {
  const B = new Builder();
  const top = mixc(tint, [1, 1, 1], 0.22), bot = scale(tint, 0.55);
  blob(B, {
    cx: 0, cy: 0.10, cz: 0, rx: 0.20, ry: 0.14, rz: 0.20, level: 1, rough: 0.15,
    rnd, colTop: bot, colBot: scale(bot, 0.7), flex: 0
  });
  const n = 16 + Math.floor(rnd() * 10);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28, rr = rnd() * 0.16;
    blade(B, {
      x: Math.cos(a) * rr, y: 0.16, z: Math.sin(a) * rr,
      dir: a, len: 0.28 + rnd() * 0.28, wid: 0.022, seg: 3,
      bend: 0.55, lift: 0.85, colBase: bot, colTip: top, flexMax: 1.0, taper: 1.3
    });
  }
  return B.toGeometry();
}


/* Vaporatore: colonna con alette di condensa. Un oggetto costruito in mezzo al
 * nulla dice piu di mille rocce che quel deserto e abitato. */
function vaporator(rnd, tint) {
  const B = new Builder();
  const h = 2.6;
  const metal = mixc(lin(0x6e6a60), lin(0x9a948a), rnd());
  const dark = scale(metal, 0.55);
  trunk(B, { r0: h * 0.10, r1: h * 0.085, h: h * 0.86, seg: 8, rings: 3, colBot: dark, colTop: metal, flexTop: 0.0 });
  // alette verticali
  const nf = 6;
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * 6.28;
    const r0 = h * 0.09, r1 = h * 0.20;
    const y0 = h * 0.18, y1 = h * 0.78;
    const P = (r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    B.quad(P(r0, y0), P(r1, y0), P(r1, y1), P(r0, y1), dark, metal, metal, dark, 0, 0, 0, 0);
    B.quad(P(r0, y1), P(r1, y1), P(r1, y0), P(r0, y0), dark, metal, metal, dark, 0, 0, 0, 0);
  }
  // cupola
  blob(B, { cx: 0, cy: h * 0.86, cz: 0, rx: h * 0.13, ry: h * 0.10, rz: h * 0.13, level: 1, rough: 0.04, rnd, colTop: mixc(metal, [1, 1, 1], 0.2), colBot: dark, flex: 0 });
  // base
  B.quad([-h * 0.16, 0, -h * 0.16], [h * 0.16, 0, -h * 0.16], [h * 0.16, h * 0.05, h * 0.16], [-h * 0.16, h * 0.05, h * 0.16], dark, dark, metal, metal, 0, 0, 0, 0);
  return B.toGeometry();
}

/* ------------------------------------------------------------------ *
 * Registro
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * Costruito dall uomo (o dal mezzuomo)
 *
 * Questi non sono cespugli: hanno una facciata, e la facciata deve guardare
 * da qualche parte. La convenzione e la stessa della fauna — il davanti e
 * verso -Z — cosi il seminatore puo puntarli a valle con una rotazione sola.
 * ------------------------------------------------------------------ */

/* Cupola a base piatta. Una sfera schiacciata scenderebbe sotto lo zero e su
 * un pendio si vedrebbe spuntare la pancia dal lato a valle: qui la meta
 * inferiore non esiste proprio, e sotto c e una gonna svasata che si perde
 * nel terreno. */
function dome(B, opts) {
  const {
    cx = 0, cy = 0, cz = 0, rx = 1, ry = 1, rz = 1,
    seg = 18, rings = 8, colTop, colBot, flex = 0, rough = 0, rnd,
    skirt = 0.5, colSkirt, tail = 0
  } = opts;
  /* La coda abbassa e allunga la meta posteriore. Serve a non ottenere un
   * igloo: una casa scavata nel fianco di una collina non e una semiellisse
   * appoggiata sull erba, e a monte deve sparire dentro il pendio. La stessa
   * deformazione va applicata a tutto cio che si posa sulla cupola, o il
   * comignolo resta a mezz aria. */
  const coda = (x, y, z) => {
    if (tail <= 0) return [x, y, z];
    const t = Math.max(0, z / rz);
    return [x, y * (1 - tail * t * t), z * (1 + tail * 1.5 * t)];
  };
  const ph = rnd ? [rnd() * 9, rnd() * 9] : [0, 0];
  const bump = (a, p) => rough
    ? 1 + rough * (Math.sin(a * 3.1 + ph[0]) * 0.6 + Math.sin(p * 4.3 + a * 1.7 + ph[1]) * 0.4)
    : 1;

  const P = (p, a) => {
    const d = bump(a, p);
    const q = coda(Math.cos(p) * Math.cos(a) * rx * d,
                   Math.sin(p) * ry * d,
                   Math.cos(p) * Math.sin(a) * rz * d);
    return [cx + q[0], cy + q[1], cz + q[2]];
  };
  // normale della superficie: la direzione sulla sfera unitaria, non della faccia
  const N = (p, a) => {
    const nx = Math.cos(p) * Math.cos(a) / rx, ny = Math.sin(p) / ry, nz = Math.cos(p) * Math.sin(a) / rz;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const col = (p) => mixc(colBot, colTop, Math.pow(Math.sin(p), 0.7) * 0.8 + 0.2);
  /* Chiazze: una superficie grande di colore unico legge come plastica, per
   * quanto sia tornita la forma. Basta una variazione per faccia — qualche
   * punto percentuale — perche l occhio ci legga dell erba. */
  const chiazza = (i, j) => {
    const h = Math.sin(i * 12.9898 + j * 78.233 + (ph[0] || 0)) * 43758.5453;
    return 0.88 + (h - Math.floor(h)) * 0.24;
  };

  for (let j = 0; j < rings; j++) {
    const p0 = (j / rings) * Math.PI / 2, p1 = ((j + 1) / rings) * Math.PI / 2;
    const cc0 = col(p0), cc1 = col(p1);
    for (let i = 0; i < seg; i++) {
      const k = chiazza(i, j);
      const c0 = scale(cc0, k), c1 = scale(cc1, k);
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const A = P(p0, a0), Bp = P(p0, a1), C = P(p1, a1), D = P(p1, a0);
      const nA = N(p0, a0), nB = N(p0, a1), nC = N(p1, a1), nD = N(p1, a0);
      /* L ordine dei vertici decide quale faccia e il davanti: questi
       * materiali disegnano una faccia sola, e avvolti al contrario la cupola
       * si vedrebbe solo da dentro. */
      B.triN(A, C, Bp, nA, nC, nB, c0, c1, c0, flex, flex, flex);
      B.triN(A, D, C, nA, nD, nC, c0, c1, c1, flex, flex, flex);
    }
  }
  // gonna: scende sotto il livello zero e allarga, per sparire nell erba
  if (skirt > 0) {
    const cs = colSkirt || scale(colBot, 0.72);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const d0 = bump(a0, 0), d1 = bump(a1, 0);
      const q = (a, k, y) => {
        const v = coda(Math.cos(a) * rx * k, 0, Math.sin(a) * rz * k);
        return [cx + v[0], cy + y, cz + v[2]];
      };
      const A = q(a0, d0, 0), Bp = q(a1, d1, 0);
      const C = q(a1, 1.16 * d1, -skirt), D = q(a0, 1.16 * d0, -skirt);
      B.quad(A, Bp, C, D, colBot, colBot, cs, cs, flex, flex, flex, flex);
    }
  }
}

/* Base ortogonale attorno a una direzione: serve a posare dischi e anelli su
 * una superficie curva senza che affondino da un lato. */
function basis(n) {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const N = [n[0] / l, n[1] / l, n[2] / l];
  const up = Math.abs(N[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let tx = up[1] * N[2] - up[2] * N[1];
  let ty = up[2] * N[0] - up[0] * N[2];
  let tz = up[0] * N[1] - up[1] * N[0];
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;
  const bx = N[1] * tz - N[2] * ty;
  const by = N[2] * tx - N[0] * tz;
  const bz = N[0] * ty - N[1] * tx;
  return { N, T: [tx, ty, tz], Bv: [bx, by, bz] };
}

function discO(B, c, n, r, colC, colE, flex, seg) {
  const { N, T, Bv } = basis(n);
  seg = seg || 20;
  const pt = (a, rr) => [
    c[0] + (T[0] * Math.cos(a) + Bv[0] * Math.sin(a)) * rr,
    c[1] + (T[1] * Math.cos(a) + Bv[1] * Math.sin(a)) * rr,
    c[2] + (T[2] * Math.cos(a) + Bv[2] * Math.sin(a)) * rr
  ];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    B.triN(c, pt(a0, r), pt(a1, r), N, N, N, colC, colE, colE, flex, flex, flex);
  }
}

function ringO(B, c, n, r0, r1, col0, col1, flex, seg) {
  const { N, T, Bv } = basis(n);
  seg = seg || 20;
  const pt = (a, rr) => [
    c[0] + (T[0] * Math.cos(a) + Bv[0] * Math.sin(a)) * rr,
    c[1] + (T[1] * Math.cos(a) + Bv[1] * Math.sin(a)) * rr,
    c[2] + (T[2] * Math.cos(a) + Bv[2] * Math.sin(a)) * rr
  ];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    B.quad(pt(a0, r1), pt(a1, r1), pt(a1, r0), pt(a0, r0), col1, col1, col0, col0, flex, flex, flex, flex);
  }
}

/* Casa hobbit. Il dettaglio che la rende riconoscibile non e il tumulo: e la
 * porta tonda col pomello in mezzo, non di lato. Sbagliare quello e come
 * disegnare un uccello con le ali attaccate al collo. */
function hobbitHole(rnd, tint) {
  const Bd = new Builder();
  /* Piu larga che profonda: la coda allunga il tumulo all indietro, e la
   * normalizzazione avviene sull ingombro maggiore — con rx e rz uguali la
   * facciata finiva per rimpicciolirsi. Una casa nel fianco di una collina
   * mostra un fronte largo, non un muso. */
  const rx = 5.6, ry = 3.35, rz = 4.10;
  const erbaAlta = mixc(tint, lin(0x8fbe52), 0.25);
  const erbaBassa = scale(mixc(tint, lin(0x2f5c1c), 0.45), 0.92);

  dome(Bd, {
    cx: 0, cy: 0, cz: 0, rx, ry, rz, seg: 20, rings: 9,
    colTop: erbaAlta, colBot: erbaBassa, rough: 0.055, rnd, flex: 0, skirt: 0.7,
    tail: 0.42
  });

  // --- il vano della porta: un collare che sporge dal fianco della collina
  const yc = 1.05;                // centro della porta: il bordo basso a terra
  /* Dove passa davvero la superficie della cupola all altezza della porta.
   * Prendere una frazione fissa di rz e l errore che sotterra tutto il vano:
   * a un metro da terra l ellissoide e ancora quasi al suo raggio pieno, non
   * all 86 per cento. La facciata deve sporgere di trenta centimetri da li. */
  const zSup = -rz * Math.sqrt(Math.max(0.04, 1 - (yc * yc) / (ry * ry)));
  const zf = zSup - 0.30;
  const rColl = 1.29, rPorta = 1.05;   // cornice sottile, non un oblo
  const pietra = mixc(lin(0x9a9182), lin(0xb8b0a0), rnd() * 0.6);
  const pietraScura = scale(pietra, 0.66);

  const segC = 22;
  for (let i = 0; i < segC; i++) {
    const a0 = (i / segC) * Math.PI * 2, a1 = ((i + 1) / segC) * Math.PI * 2;
    const p = (a, z) => [Math.cos(a) * rColl, yc + Math.sin(a) * rColl, z];
    // fianchi del collare, dal fianco della collina fino alla facciata
    // il collare entra nel fianco della collina e sporge davanti
    Bd.quad(p(a0, zf + 2.4), p(a1, zf + 2.4), p(a1, zf), p(a0, zf),
            pietraScura, pietraScura, pietra, pietra, 0, 0, 0, 0);
  }
  // muro della facciata: anello fra il collare e la porta
  /* La cornice deve SOVRAPPORSI alla porta, non sfiorarla: lasciando un
   * anello scoperto fra le due si vede l interno del collare, e sulla porta
   * compare una falce nera. */
  ringO(Bd, [0, yc, zf], [0, 0, -1], rPorta * 0.96, rColl, pietra, pietraScura, 0, 24);

  // --- la porta
  /* Tinte chiare. Una porta verde scuro, messa in una facciata che guarda a
   * valle e quindi spesso in ombra, si legge come un buco nero: il colore va
   * scelto pensando alla luce in cui stara, non su fondo bianco. */
  const vernici = [0x58a866, 0x4e9c5e, 0xc08a44, 0xb8564a, 0x4e8cb4];
  const legno = lin(vernici[Math.floor(rnd() * vernici.length)]);
  const legnoScuro = scale(legno, 0.70);
  const zp = zf - 0.10;
  discO(Bd, [0, yc, zp], [0, 0, -1], rPorta, legno, legnoScuro, 0, 22);
  /* Doghe verticali, come su una porta vera. A raggiera sembrava una ruota
   * di carro: il fascio di linee che converge al centro e la cosa che piu
   * tradisce una geometria fatta col compasso. */
  for (let i = 1; i < 6; i++) {
    const x = -rPorta + (i / 6) * rPorta * 2;
    const yh = Math.sqrt(Math.max(0, rPorta * rPorta - x * x)) * 0.985;
    const c = scale(legno, 0.86);
    Bd.quad([x - 0.012, yc - yh, zp - 0.010], [x + 0.012, yc - yh, zp - 0.010],
            [x + 0.012, yc + yh, zp - 0.010], [x - 0.012, yc + yh, zp - 0.010],
            c, c, c, c, 0, 0, 0, 0);
  }
  // due traverse orizzontali
  for (const yy of [-0.52, 0.52]) {
    const yh = Math.sqrt(Math.max(0, rPorta * rPorta - yy * yy)) * 0.97;
    const c = scale(legno, 0.70);
    Bd.quad([-yh, yc + yy - 0.075, zp - 0.016], [yh, yc + yy - 0.075, zp - 0.016],
            [yh, yc + yy + 0.075, zp - 0.016], [-yh, yc + yy + 0.075, zp - 0.016],
            c, c, c, c, 0, 0, 0, 0);
  }
  // cornice
  ringO(Bd, [0, yc, zp - 0.02], [0, 0, -1], rPorta, rPorta * 1.10, legnoScuro, pietraScura, 0, 22);
  // pomello: in mezzo, non di lato
  const ottone = lin(0xd8b45c);
  blob(Bd, { cx: 0, cy: yc, cz: zp - 0.16, rx: 0.14, ry: 0.14, rz: 0.14,
             level: 1, rough: 0, rnd, colTop: ottone, colBot: scale(ottone, 0.5), flex: 0 });

  // --- finestre tonde, posate sulla superficie della cupola
  const vetro = lin(0xffdca8);
  const telaio = mixc(legnoScuro, pietraScura, 0.4);
  for (const sx of [-1, 1]) {
    const x = sx * 2.30, y = 1.45;
    const q = 1 - (x * x) / (rx * rx) - (y * y) / (ry * ry);
    if (q <= 0.02) continue;
    const z = -rz * Math.sqrt(q);
    const n = [x / (rx * rx), y / (ry * ry), z / (rz * rz)];
    const l = Math.hypot(n[0], n[1], n[2]);
    const nn = [n[0] / l, n[1] / l, n[2] / l];
    const c = [x + nn[0] * 0.10, y + nn[1] * 0.10, z + nn[2] * 0.10];
    /* aFlex = 1 solo sul vetro: e la maschera che di notte accende le finestre
     * e lascia spento il resto della casa. */
    discO(Bd, c, nn, 0.44, vetro, scale(vetro, 0.82), 1, 16);
    ringO(Bd, [c[0] - nn[0] * 0.02, c[1] - nn[1] * 0.02, c[2] - nn[2] * 0.02], nn,
          0.44, 0.56, telaio, scale(telaio, 0.7), 0, 16);
    // croce dei vetri
    const { T, Bv } = basis(nn);
    const negT = [-T[0], -T[1], -T[2]];
    /* La seconda sbarra va costruita su (Bv, -T) e non su (Bv, T): con la
     * coppia diretta il prodotto vettore esce all indietro e la sbarra
     * sparisce vista di fronte. */
    for (const [u, v] of [[T, Bv], [Bv, negT]]) {
      const w = 0.035;
      Bd.quad(
        [c[0] - u[0] * 0.44 - v[0] * w + nn[0] * 0.01, c[1] - u[1] * 0.44 - v[1] * w + nn[1] * 0.01, c[2] - u[2] * 0.44 - v[2] * w + nn[2] * 0.01],
        [c[0] + u[0] * 0.44 - v[0] * w + nn[0] * 0.01, c[1] + u[1] * 0.44 - v[1] * w + nn[1] * 0.01, c[2] + u[2] * 0.44 - v[2] * w + nn[2] * 0.01],
        [c[0] + u[0] * 0.44 + v[0] * w + nn[0] * 0.01, c[1] + u[1] * 0.44 + v[1] * w + nn[1] * 0.01, c[2] + u[2] * 0.44 + v[2] * w + nn[2] * 0.01],
        [c[0] - u[0] * 0.44 + v[0] * w + nn[0] * 0.01, c[1] - u[1] * 0.44 + v[1] * w + nn[1] * 0.01, c[2] - u[2] * 0.44 + v[2] * w + nn[2] * 0.01],
        telaio, telaio, telaio, telaio, 0, 0, 0, 0);
    }
  }

  // --- comignolo, spostato di lato e leggermente inclinato
  const mattone = lin(0x8a6a52);
  const cxx = (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 0.9);
  const czz = 0.6 + rnd() * 1.1;
  /* Il comignolo va posato sulla superficie DEFORMATA, non su quella
   * dell ellissoide di partenza: la coda ha abbassato il dorso, e senza
   * questa correzione il camino resterebbe sospeso sopra il tetto. */
  const TAIL = 0.42;
  const czzRaw = czz / (1 + TAIL * 1.5 * (czz / rz));
  const qy = 1 - (cxx * cxx) / (rx * rx) - (czzRaw * czzRaw) / (rz * rz);
  const tCoda = Math.max(0, czzRaw / rz);
  const cy0 = ry * Math.sqrt(Math.max(0.05, qy)) * (1 - TAIL * tCoda * tCoda) - 0.12;
  /* trunk() costruisce sempre a partire da y = 0, e il comignolo deve
   * partire dal dorso della cupola. Si segna dove finisce il buffer prima di
   * costruirlo e si alza esattamente quel tratto: cercare i vertici per
   * posizione funzionerebbe finche non ce n e un altro li vicino. */
  const i0 = Bd.p.length;
  trunk(Bd, { r0: 0.26, r1: 0.22, h: 1.05, seg: 6, rings: 2,
              colBot: scale(mattone, 0.7), colTop: mattone, flexTop: 0, x0: cxx, z0: czz });
  for (let i = i0; i < Bd.p.length; i += 3) Bd.p[i + 1] += cy0;
  ringO(Bd, [cxx, cy0 + 1.05 + 0.05, czz], [0, 1, 0], 0.16, 0.34,
        scale(mattone, 0.85), scale(mattone, 0.55), 0, 8);

  // --- soglia e vialetto
  const lastra = mixc(pietra, lin(0x7a736a), 0.5);
  /* Muretto del terrazzino: un arco basso di pietra chiara davanti a casa.
   * Il tumulo e verde come il prato e da cinquanta metri sparisce; questo e
   * l unico pezzo chiaro, ed e quello che fa leggere «paese» invece che
   * «collina». Scende di mezzo metro sotto lo zero per non restare per aria
   * sul lato a valle. */
  {
    const rw = 3.15, hw = 0.58, seg = 18;
    /* Il davanti e verso -Z, cioe l angolo 3pi/2: l arco va centrato li. Fra
     * 0,62pi e 1,38pi si finisce sul fianco sinistro della casa, che e dove
     * stava prima e dove non serve a niente. */
    const a0 = Math.PI * 1.12, a1 = Math.PI * 1.88;
    const pw = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    for (let i = 0; i < seg; i++) {
      const b0 = a0 + (a1 - a0) * (i / seg), b1 = a0 + (a1 - a0) * ((i + 1) / seg);
      const k = 0.92 + 0.16 * ((i * 7) % 3) / 2;
      const c = scale(lastra, k), cs = scale(lastra, k * 0.68);
      // faccia esterna
      /* Scende fino a -1,7: la casa guarda a valle, e li il terreno e piu
       * basso di un metro abbondante. Un muretto che si ferma a -0,5
       * resterebbe sospeso proprio dal lato da cui lo si guarda. */
      Bd.quad(pw(b0, rw, -1.7), pw(b1, rw, -1.7), pw(b1, rw, hw), pw(b0, rw, hw), cs, cs, c, c, 0, 0, 0, 0);
      // faccia interna
      Bd.quad(pw(b1, rw - 0.26, -1.7), pw(b0, rw - 0.26, -1.7), pw(b0, rw - 0.26, hw), pw(b1, rw - 0.26, hw), cs, cs, c, c, 0, 0, 0, 0);
      // coronamento
      Bd.quad(pw(b0, rw - 0.26, hw), pw(b1, rw - 0.26, hw), pw(b1, rw, hw), pw(b0, rw, hw),
              mixc(c, [1, 1, 1], 0.12), mixc(c, [1, 1, 1], 0.12), c, c, 0, 0, 0, 0);
    }
  }

  /* Solo la soglia. Un vialetto di lastre a quota costante su un pendio si
   * sotterra da un lato e resta per aria dall altro: meglio niente che una
   * fila di pietre che galleggiano. */
  const w = rPorta * 1.15;
  const z0 = zf - 0.04, z1 = zf - 0.78;
  Bd.quad([-w, 0.10, z0], [w, 0.10, z0], [w, 0.02, z1], [-w, 0.02, z1],
          lastra, lastra, scale(lastra, 0.86), scale(lastra, 0.86), 0, 0, 0, 0);
  Bd.quad([-w, 0.10, z0], [-w, 0.02, z1], [-w, -0.30, z1], [-w, -0.30, z0],
          scale(lastra, 0.7), scale(lastra, 0.7), scale(lastra, 0.5), scale(lastra, 0.5), 0, 0, 0, 0);
  Bd.quad([w, 0.02, z1], [w, 0.10, z0], [w, -0.30, z0], [w, -0.30, z1],
          scale(lastra, 0.7), scale(lastra, 0.7), scale(lastra, 0.5), scale(lastra, 0.5), 0, 0, 0, 0);
  return Bd.toGeometry();
}

/* Staccionata bassa: tre metri di steccato con due traverse. Messa in filari
 * dal seminatore diventa un recinto. */
function fence(rnd, tint) {
  const B = new Builder();
  const legno = mixc(tint, lin(0x8a7050), 0.5);
  const scuro = scale(legno, 0.62);
  const L = 3.0, h = 1.05;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * (L / n);
    const hh = h * (0.88 + rnd() * 0.2);
    const w = 0.055, t = 0.03;
    // asse con la punta
    B.quad([x - w, 0, -t], [x + w, 0, -t], [x + w, hh - 0.14, -t], [x - w, hh - 0.14, -t], scuro, scuro, legno, legno, 0, 0, 0, 0);
    B.quad([x + w, 0, t], [x - w, 0, t], [x - w, hh - 0.14, t], [x + w, hh - 0.14, t], scuro, scuro, legno, legno, 0, 0, 0, 0);
    B.tri([x - w, hh - 0.14, -t], [x + w, hh - 0.14, -t], [x, hh, -t], legno, legno, legno, 0, 0, 0);
    B.tri([x + w, hh - 0.14, t], [x - w, hh - 0.14, t], [x, hh, t], legno, legno, legno, 0, 0, 0);
  }
  for (const y of [h * 0.34, h * 0.68]) {
    B.quad([-L / 2, y - 0.045, -0.045], [L / 2, y - 0.045, -0.045],
           [L / 2, y + 0.045, -0.045], [-L / 2, y + 0.045, -0.045], scuro, scuro, legno, legno, 0, 0, 0, 0);
    B.quad([L / 2, y - 0.045, 0.045], [-L / 2, y - 0.045, 0.045],
           [-L / 2, y + 0.045, 0.045], [L / 2, y + 0.045, 0.045], scuro, scuro, legno, legno, 0, 0, 0, 0);
  }
  return B.toGeometry();
}

/* Orto: zolle rialzate e file di cavoli. Non e decorazione — e il motivo per
 * cui un prato sembra abitato invece che solo verde. */
function gardenPatch(rnd, tint) {
  const B = new Builder();
  const terra = lin(0x6b5238), terraCh = lin(0x8a6c4a);
  const W = 2.8, D = 2.0;
  const nf = 4;
  for (let i = 0; i < nf; i++) {
    const z0 = -D / 2 + (i / nf) * D + 0.06, z1 = -D / 2 + ((i + 1) / nf) * D - 0.06;
    const y = 0.10 + rnd() * 0.03;
    B.quad([-W / 2, y, z0], [W / 2, y, z0], [W / 2, y, z1], [-W / 2, y, z1],
           terraCh, terraCh, terra, terra, 0, 0, 0, 0);
    B.quad([-W / 2, 0, z0], [W / 2, 0, z0], [W / 2, y, z0], [-W / 2, y, z0], terra, terra, terraCh, terraCh, 0, 0, 0, 0);
    B.quad([W / 2, 0, z1], [-W / 2, 0, z1], [-W / 2, y, z1], [W / 2, y, z1], terra, terra, terraCh, terraCh, 0, 0, 0, 0);
    const nc = 4;
    for (let j = 0; j < nc; j++) {
      const x = -W / 2 + (j + 0.5) * (W / nc) + (rnd() - 0.5) * 0.14;
      const z = (z0 + z1) * 0.5;
      const r = 0.17 + rnd() * 0.08;
      const verde = mixc(tint, lin(0x6ea83c), 0.4 + rnd() * 0.3);
      dome(B, { cx: x, cy: y, cz: z, rx: r, ry: r * 0.78, rz: r,
                seg: 8, rings: 3, colTop: verde, colBot: scale(verde, 0.6),
                rough: 0.18, rnd, flex: 0.25, skirt: 0 });
    }
  }
  return B.toGeometry();
}

/* Covone: un cono di paglia attorno a un palo. */
function haystack(rnd, tint) {
  const B = new Builder();
  const paglia = mixc(tint, lin(0xd8b45c), 0.55);
  const scuro = scale(paglia, 0.55);
  const h = 2.5 * (0.85 + rnd() * 0.3), r = 1.05;
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const d0 = 0.9 + 0.2 * Math.sin(a0 * 3 + 1), d1 = 0.9 + 0.2 * Math.sin(a1 * 3 + 1);
    B.tri([Math.cos(a0) * r * d0, 0, Math.sin(a0) * r * d0],
          [Math.cos(a1) * r * d1, 0, Math.sin(a1) * r * d1],
          [0, h, 0], scuro, scuro, paglia, 0, 0, 0);
    // ciocche sporgenti a meta altezza
    const am = (a0 + a1) * 0.5;
    const ym = h * (0.25 + 0.4 * ((i % 3) / 3));
    const rm = r * (1 - ym / h) * 1.16;
    B.tri([Math.cos(am) * rm, ym, Math.sin(am) * rm],
          [Math.cos(am + 0.2) * rm * 0.7, ym - 0.28, Math.sin(am + 0.2) * rm * 0.7],
          [Math.cos(am - 0.2) * rm * 0.7, ym - 0.24, Math.sin(am - 0.2) * rm * 0.7],
          paglia, scuro, scuro, 0.3, 0.1, 0.1);
  }
  trunk(B, { r0: 0.05, r1: 0.04, h: h + 0.3, seg: 4, rings: 1,
             colBot: lin(0x4a3826), colTop: lin(0x6a5238), flexTop: 0 });
  return B.toGeometry();
}

/* Palo indicatore: due tavolette che puntano da parti diverse. */
function signpost(rnd, tint) {
  const B = new Builder();
  const legno = mixc(tint, lin(0x7a6248), 0.5);
  const scuro = scale(legno, 0.6);
  const chiaro = mixc(legno, lin(0xd8c8a8), 0.45);
  const h = 2.1;
  trunk(B, { r0: 0.075, r1: 0.06, h, seg: 5, rings: 2, colBot: scuro, colTop: legno, flexTop: 0 });
  for (let i = 0; i < 2; i++) {
    const y = h * (0.92 - i * 0.24);
    const a = rnd() * Math.PI * 2;
    const dir = i ? -1 : 1;
    const L = 0.9, w = 0.145;
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = (u, v, yy) => [ca * u - sa * v, yy, sa * u + ca * v];
    const x0 = 0.06 * dir, x1 = (0.06 + L) * dir;
    for (const zz of [-0.022, 0.022]) {
      B.quad(p(x0, zz, y - w), p(x1 * 0.82, zz, y - w * 0.72),
             p(x1 * 0.82, zz, y + w * 0.72), p(x0, zz, y + w),
             scuro, chiaro, chiaro, scuro, 0, 0, 0, 0);
    }
    // la punta
    B.tri(p(x1 * 0.82, 0, y - w * 0.72), p(x1, 0, y), p(x1 * 0.82, 0, y + w * 0.72),
          chiaro, chiaro, chiaro, 0, 0, 0);
  }
  return B.toGeometry();
}

/* ------------------------------------------------------------------ *
 * Le firme dei luoghi immaginari
 *
 * Un paesaggio si riconosce dalla forma del terreno e dalla flora; un LUOGO
 * si riconosce da cosa ci hanno costruito sopra. Tatooine senza le cupole
 * della fattoria d umidita e solo un deserto, e Namecc senza le case tonde e
 * solo una prateria verde con il cielo strano.
 *
 * Convenzione: il davanti e verso -Z, come per la fauna e per le case della
 * Contea, cosi il seminatore puo puntare tutto a valle con una sola
 * rotazione.
 * ------------------------------------------------------------------ */

/* Faccia piana con normale verso l esterno. L ordine dei vertici e (c-u-v,
 * c+u-v, c+u+v, c-u+v) e la normale che ne esce e u x v: passando u e v nel
 * verso giusto non si sbaglia mai il lato, che e l errore che fa sparire meta
 * di un edificio. */
function face(B, c, u, v, colA, colB) {
  const p = (su, sv) => [c[0] + u[0] * su + v[0] * sv,
                         c[1] + u[1] * su + v[1] * sv,
                         c[2] + u[2] * su + v[2] * sv];
  B.quad(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), colA, colA, colB, colB, 0, 0, 0, 0);
}

/* Parallelepipedo con le sei facce girate bene. */
function box(B, c, hx, hy, hz, colBot, colTop) {
  const X = [hx, 0, 0], Y = [0, hy, 0], Z = [0, 0, hz];
  const neg = (a) => [-a[0], -a[1], -a[2]];
  const at = (d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
  face(B, at(X), Z, Y, colBot, colTop);           // +X
  face(B, at(neg(X)), neg(Z), Y, colBot, colTop); // -X
  face(B, at(Z), neg(X), Y, colBot, colTop);      // +Z
  face(B, at(neg(Z)), X, Y, colBot, colTop);      // -Z
  face(B, at(Y), X, neg(Z), colTop, colTop);      // +Y
  face(B, at(neg(Y)), X, Z, colBot, colBot);      // -Y
}

/* Prisma a N lati, rastremato: torri, guglie, menhir. */
function prism(B, opts) {
  const { cx = 0, cz = 0, y0 = 0, y1 = 1, r0 = 1, r1 = 1, seg = 6,
          colBot, colTop, twist = 0, lean = [0, 0], jag } = opts;
  const P = (i, t) => {
    const a = (i / seg) * Math.PI * 2 + twist * t;
    const r = (r0 + (r1 - r0) * t) * (jag ? jag(i, t) : 1);
    return [cx + Math.cos(a) * r + lean[0] * t, y0 + (y1 - y0) * t, cz + Math.sin(a) * r + lean[1] * t];
  };
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const sh = 0.82 + 0.20 * (0.5 + 0.5 * Math.cos((i / seg) * Math.PI * 2 + 0.9));
    B.quad(P(i, 0), P(j, 0), P(j, 1), P(i, 1),
      scale(colBot, sh), scale(colBot, sh), scale(colTop, sh), scale(colTop, sh), 0, 0, 0, 0);
  }
  // coperchio
  const cTop = [cx + lean[0], y1, cz + lean[1]];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    B.tri(cTop, P(i, 1), P(j, 1), colTop, colTop, colTop, 0, 0, 0);
  }
  return cTop;
}

/* --- CUPOLA ABITATA -------------------------------------------------
 * Serve a due posti lontanissimi fra loro: la fattoria d umidita di Tatooine
 * e le case di Namecc. E la stessa forma — mezza sfera di intonaco con una
 * porta ad arco e un oblo — e cambia solo la tinta. */
function domeHut(rnd, tint) {
  const Bd = new Builder();
  const rx = 2.75, ry = 2.30, rz = 2.70;
  const muro = mixc(tint, lin(0xe8dcc4), 0.55);
  const muroScuro = scale(muro, 0.66);

  dome(Bd, {
    cx: 0, cy: 0, cz: 0, rx, ry, rz, seg: 20, rings: 8,
    colTop: mixc(muro, [1, 1, 1], 0.10), colBot: muroScuro, rough: 0.02, rnd,
    flex: 0, skirt: 0.55
  });

  // porta ad arco, sporgente dalla superficie (l errore gia pagato in Contea)
  const yc = 0.92, rP = 0.72;
  const zSup = -rz * Math.sqrt(Math.max(0.04, 1 - (yc * yc) / (ry * ry)));
  const zf = zSup - 0.22;
  const seg = 18;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, z) => [Math.cos(a) * (rP * 1.28), yc + Math.sin(a) * (rP * 1.28), z];
    Bd.quad(p(a0, zf + 1.4), p(a1, zf + 1.4), p(a1, zf), p(a0, zf),
      muroScuro, muroScuro, muro, muro, 0, 0, 0, 0);
  }
  ringO(Bd, [0, yc, zf], [0, 0, -1], rP * 0.96, rP * 1.28, muro, muroScuro, 0, 20);
  const vano = scale(muroScuro, 0.30);
  discO(Bd, [0, yc, zf - 0.06], [0, 0, -1], rP, vano, scale(vano, 0.7), 0, 20);

  // oblo laterale
  for (const sx of [-1, 1]) {
    const x = sx * 1.55, y = 1.35;
    const q = 1 - (x * x) / (rx * rx) - (y * y) / (ry * ry);
    if (q <= 0.02) continue;
    const z = -rz * Math.sqrt(q);
    const n = [x / (rx * rx), y / (ry * ry), z / (rz * rz)];
    const l = Math.hypot(n[0], n[1], n[2]);
    const nn = [n[0] / l, n[1] / l, n[2] / l];
    const c = [x + nn[0] * 0.06, y + nn[1] * 0.06, z + nn[2] * 0.06];
    discO(Bd, c, nn, 0.30, lin(0xffe2b0), lin(0xd8b070), 1, 14);
    ringO(Bd, c, nn, 0.30, 0.40, muroScuro, scale(muroScuro, 0.7), 0, 14);
  }

  // camino di sfiato
  const met = lin(0x8a8478);
  const i0 = Bd.p.length;
  trunk(Bd, { r0: 0.17, r1: 0.14, h: 0.70, seg: 6, rings: 1,
    colBot: scale(met, 0.7), colTop: met, flexTop: 0, x0: 0.85, z0: 0.55 });
  const qy = 1 - (0.85 * 0.85) / (rx * rx) - (0.55 * 0.55) / (rz * rz);
  const cy0 = ry * Math.sqrt(Math.max(0.05, qy)) - 0.10;
  for (let i = i0; i < Bd.p.length; i += 3) Bd.p[i + 1] += cy0;

  return Bd.toGeometry();
}

/* --- CASA DI FUNGO --------------------------------------------------
 * Bosco fatato. Non e un fungo con una porta disegnata sopra: il gambo e
 * l edificio, e il cappello e il tetto. */
function mushroomHouse(rnd, tint) {
  const B = new Builder();
  /* Il gambo e l edificio: se il cappello lo strapiomba di due volte e mezzo,
   * da fuori non si vedono piu ne la porta ne le finestre, e resta un fungo
   * gigante invece di una casa. */
  const gamboH = 3.7;
  const crema = mixc(lin(0xe8dcc0), tint, 0.14);
  const cremaScura = scale(crema, 0.62);
  trunk(B, { r0: 1.36, r1: 1.16, h: gamboH, seg: 14, rings: 4,
    colBot: cremaScura, colTop: crema, flexTop: 0, bulge: 0.16 });

  // cappello
  const capH = 1.70, capR = 1.72;
  const rossi = [0xc03a2e, 0xb8562e, 0x8a3a5e, 0xc07a2a];
  const cap = lin(rossi[Math.floor(rnd() * rossi.length)]);
  const capScuro = scale(cap, 0.55);
  const seg = 18, rings = 6;
  for (let j = 0; j < rings; j++) {
    const t0 = j / rings, t1 = (j + 1) / rings;
    const R = (t) => capR * Math.sqrt(Math.max(0, 1 - t * t * 0.92));
    const Y = (t) => gamboH - 0.25 + capH * t;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const P = (a, t) => [Math.cos(a) * R(t), Y(t), Math.sin(a) * R(t)];
      const c0 = mixc(capScuro, cap, t0), c1 = mixc(capScuro, cap, t1);
      B.quad(P(a0, t0), P(a1, t0), P(a1, t1), P(a0, t1), c0, c0, c1, c1, 0, 0, 0, 0);
    }
  }
  // sotto il cappello: lamelle
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const lam = scale(crema, 0.72);
    B.tri([Math.cos(a1) * capR, gamboH - 0.25, Math.sin(a1) * capR],
      [Math.cos(a0) * capR, gamboH - 0.25, Math.sin(a0) * capR],
      [0, gamboH - 0.42, 0], lam, lam, cremaScura, 0, 0, 0);
  }
  // pallini bianchi
  for (let k = 0; k < 9; k++) {
    const a = rnd() * Math.PI * 2, t = 0.15 + rnd() * 0.55;
    const R = capR * Math.sqrt(Math.max(0, 1 - t * t * 0.92));
    blob(B, {
      cx: Math.cos(a) * R * 0.94, cy: gamboH - 0.25 + capH * t + 0.05, cz: Math.sin(a) * R * 0.94,
      rx: 0.20 + rnd() * 0.10, ry: 0.07, rz: 0.20 + rnd() * 0.10,
      level: 1, rough: 0.10, rnd, colTop: lin(0xf4efe2), colBot: lin(0xcfc7b4), flex: 0
    });
  }

  // porta e finestre nel gambo
  /* La porta su un portico sporgente, non spiaccicata sul gambo: un disco
   * piatto appoggiato a un cilindro sporge nel vuoto ai lati, e sembra un
   * adesivo che si stacca. */
  const yc = 0.95, rP = 0.55;
  const zf = -1.62;
  const legno = lin(0x6a4a2a);
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * Math.PI * 2, a1 = ((i + 1) / 18) * Math.PI * 2;
    const p = (a, z) => [Math.cos(a) * rP * 1.26, yc + Math.sin(a) * rP * 1.26, z];
    B.quad(p(a0, zf + 1.1), p(a1, zf + 1.1), p(a1, zf), p(a0, zf),
      scale(cremaScura, 0.85), scale(cremaScura, 0.85), crema, crema, 0, 0, 0, 0);
  }
  ringO(B, [0, yc, zf], [0, 0, -1], rP * 0.96, rP * 1.26, cremaScura, scale(cremaScura, 0.7), 0, 18);
  discO(B, [0, yc, zf - 0.05], [0, 0, -1], rP, legno, scale(legno, 0.7), 0, 18);
  blob(B, { cx: 0.26, cy: yc, cz: zf - 0.12, rx: 0.06, ry: 0.06, rz: 0.06,
    level: 0, rough: 0, rnd, colTop: lin(0xd8b45c), colBot: lin(0x8a7038), flex: 0 });
  for (const [x, y] of [[-0.86, 2.35], [0.88, 2.30]]) {
    const R = 1.24;
    const zz = -Math.sqrt(Math.max(0.01, R * R - x * x)) - 0.03;
    const nn = [x / R, 0, zz / R];
    const l = Math.hypot(nn[0], nn[2]) || 1;
    const n2 = [nn[0] / l, 0, nn[2] / l];
    const c = [x + n2[0] * 0.05, y, zz + n2[2] * 0.05];
    discO(B, c, n2, 0.26, lin(0xffe0a8), lin(0xe0b070), 1, 14);
    ringO(B, c, n2, 0.26, 0.34, cremaScura, scale(cremaScura, 0.7), 0, 14);
  }
  return B.toGeometry();
}

/* --- MENHIR ---------------------------------------------------------
 * Bosco stregato. Una pietra piantata dritta e la cosa piu semplice che dice
 * «qualcuno e stato qui, e non di recente». */
function standingStone(rnd, tint) {
  const B = new Builder();
  const h = 3.2 * (0.85 + rnd() * 0.4);
  const pietra = mixc(tint, lin(0x6e6a62), 0.75);
  const scura = scale(pietra, 0.58);
  const seg = 5 + Math.floor(rnd() * 3);
  const jag = (i) => 0.82 + 0.30 * ((i * 7 + 3) % 5) / 4;
  prism(B, {
    y0: 0, y1: h, r0: 0.98 * (0.85 + rnd() * 0.35), r1: 0.62, seg,
    colBot: scura, colTop: pietra, twist: (rnd() - 0.5) * 0.5,
    lean: [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5], jag
  });
  // fasce incise
  for (let k = 0; k < 3; k++) {
    const y = h * (0.30 + k * 0.18);
    const r = 0.98 + (0.62 - 0.98) * (y / h);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const P = (a, yy) => [Math.cos(a) * r * jag(i) * 1.02, yy, Math.sin(a) * r * jag(i) * 1.02];
      B.quad(P(a0, y - 0.045), P(a1, y - 0.045), P(a1, y + 0.045), P(a0, y + 0.045),
        scura, scura, scale(scura, 0.7), scale(scura, 0.7), 0, 0, 0, 0);
    }
  }
  return B.toGeometry();
}

/* --- ARCO IN ROVINA -------------------------------------------------
 * Atlantide e Terre desolate. Una colonna dice «rovina»; un arco spezzato
 * dice «qui c era un edificio», che e molto di piu. */
function archRuin(rnd, tint) {
  const B = new Builder();
  const pietra = mixc(tint, lin(0x8a8478), 0.7);
  const scura = scale(pietra, 0.60);
  const hp = 3.2, sp = 1.55, rp = 0.34;
  for (const s of [-1, 1]) {
    // basamento
    box(B, [s * sp, 0.18, 0], rp * 1.5, 0.18, rp * 1.5, scura, pietra);
    prism(B, { cx: s * sp, y0: 0.36, y1: hp, r0: rp, r1: rp * 0.88, seg: 8, colBot: pietra, colTop: pietra });
  }
  // arco: due quarti di cerchio, quello di destra rotto a meta
  const rot = 0.45 + rnd() * 0.35;
  for (const s of [-1, 1]) {
    const fine = s < 0 ? 1.0 : rot;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * fine, t1 = ((i + 1) / n) * fine;
      const A = (t) => {
        const a = (Math.PI / 2) * t;
        return [s * sp * Math.cos(a), hp + sp * Math.sin(a) * 0.86, 0];
      };
      const p0 = A(t0), p1 = A(t1);
      const c = mixc(pietra, scura, t0 * 0.4);
      box(B, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0],
        Math.max(0.16, Math.abs(p1[0] - p0[0]) / 2 + 0.14),
        Math.max(0.16, Math.abs(p1[1] - p0[1]) / 2 + 0.14), rp * 0.95, scura, c);
    }
  }
  // un blocco caduto ai piedi
  const bx = (rnd() - 0.5) * 2.4;
  box(B, [bx, 0.26, -0.9 - rnd() * 0.8], 0.42, 0.26, 0.34, scura, pietra);
  return B.toGeometry();
}

/* --- TORRE DI GUARDIA -----------------------------------------------
 * Terra d ombra. Tozza, nera, con i merli: si legge in controluce, che e il
 * modo in cui la si vedra quasi sempre. */
function watchTower(rnd, tint) {
  const B = new Builder();
  const h = 11.0;
  const pietra = mixc(tint, lin(0x3a3630), 0.72);
  const scura = scale(pietra, 0.52);
  prism(B, { y0: 0, y1: h * 0.86, r0: 2.05, r1: 1.55, seg: 8, colBot: scura, colTop: pietra });
  // cornicione
  prism(B, { y0: h * 0.86, y1: h * 0.93, r0: 1.95, r1: 1.95, seg: 8, colBot: pietra, colTop: pietra });
  // merli
  const nm = 8;
  for (let i = 0; i < nm; i++) {
    const a = (i / nm) * Math.PI * 2 + Math.PI / nm;
    box(B, [Math.cos(a) * 1.62, h * 0.93 + 0.42, Math.sin(a) * 1.62], 0.34, 0.42, 0.34, pietra, scale(pietra, 1.1));
  }
  // feritoie
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 0.9;
    const y = h * (0.42 + (k % 2) * 0.20);
    const r = 1.55 + (2.05 - 1.55) * (1 - y / (h * 0.86));
    const nn = [Math.cos(a), 0, Math.sin(a)];
    const c = [nn[0] * r * 1.01, y, nn[2] * r * 1.01];
    const u = [-nn[2] * 0.10, 0, nn[0] * 0.10], v = [0, 0.42, 0];
    face(B, c, u, v, lin(0x140f0c), lin(0x241c16));
  }
  // porta
  const nn = [0, 0, -1];
  face(B, [0, 0.85, -2.02], [-0.42, 0, 0], [0, 0.85, 0], lin(0x140f0c), lin(0x241c16));
  return B.toGeometry();
}

/* --- GUGLIA NERA ----------------------------------------------------
 * Monte Fato. Non serve che sia dettagliata: si vede solo il profilo contro
 * il cielo rosso, e da lontano. Serve che sia ALTA. */
function darkSpire(rnd, tint) {
  const B = new Builder();
  const h = 34;
  const nera = mixc(tint, lin(0x1e1a1e), 0.8);
  const chiara = scale(nera, 1.7);
  prism(B, { y0: 0, y1: h * 0.30, r0: 3.6, r1: 2.5, seg: 6, colBot: nera, colTop: nera });
  prism(B, { y0: h * 0.28, y1: h * 0.66, r0: 2.4, r1: 1.5, seg: 6, colBot: nera, colTop: nera, twist: 0.35 });
  prism(B, { y0: h * 0.64, y1: h * 0.90, r0: 1.6, r1: 0.55, seg: 6, colBot: nera, colTop: chiara, twist: 0.6 });
  // contrafforti
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    prism(B, {
      cx: Math.cos(a) * 3.0, cz: Math.sin(a) * 3.0,
      y0: 0, y1: h * (0.24 + (i % 3) * 0.10), r0: 0.85, r1: 0.28, seg: 5,
      colBot: nera, colTop: nera, lean: [Math.cos(a) * 0.6, Math.sin(a) * 0.6]
    });
  }
  // la punta: una fessura che brucia
  const fuoco = lin(0xff8830);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = [Math.cos(a) * 0.50, h * 0.905, Math.sin(a) * 0.50];
    const u = [-Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22], v = [0, 0.65, 0];
    face(B, c, u, v, fuoco, scale(fuoco, 0.6));
  }
  prism(B, { y0: h * 0.94, y1: h, r0: 0.55, r1: 0.06, seg: 6, colBot: nera, colTop: nera });
  return B.toGeometry();
}

/* --- LAMPIONE -------------------------------------------------------
 * Il pianetino: un lampione in mezzo al niente e il dettaglio che trasforma
 * una palla d erba nel pianeta di qualcuno. Il vetro e su aFlex = 1, cosi di
 * notte si accende solo quello. */
function lamppost(rnd, tint) {
  const B = new Builder();
  const h = 4.0;
  const ferro = mixc(tint, lin(0x2a2822), 0.75);
  const chiaro = scale(ferro, 1.5);
  prism(B, { y0: 0, y1: 0.28, r0: 0.26, r1: 0.14, seg: 8, colBot: scale(ferro, 0.7), colTop: ferro });
  trunk(B, { r0: 0.085, r1: 0.055, h: h * 0.80, seg: 8, rings: 2, colBot: ferro, colTop: chiaro, flexTop: 0 });
  // braccio ricurvo
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push([-Math.sin(t * 1.5) * 0.62, h * 0.80 + Math.sin(t * 1.1) * 0.34, 0]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    tube(B, pts[i], pts[i + 1], 0.048, 0.042, ferro, chiaro, 6, 0, 0);
  }
  const capo = pts[pts.length - 1];
  /* Lanterna: quattro vetri, i montanti agli spigoli, tettuccio e fondo. Con
   * i soli vetri restava un cartoncino bianco appeso a un palo. */
  const gy = capo[1] - 0.44, rl = 0.24, hl = 0.42;
  const vetro = lin(0xffe8b8);
  const nVetro = B.f.length;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const nn = [Math.cos(a), 0, Math.sin(a)];
    face(B, [capo[0] + nn[0] * rl, gy + hl / 2, nn[2] * rl],
      [-nn[2] * rl, 0, nn[0] * rl], [0, hl / 2, 0], vetro, scale(vetro, 0.88));
  }
  // solo i vetri si accendono: aFlex = 1 e la maschera dell emissivo
  for (let i = nVetro; i < B.f.length; i++) B.f[i] = 1;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const px = capo[0] + Math.cos(a) * rl * 1.42, pz = Math.sin(a) * rl * 1.42;
    tube(B, [px, gy - 0.03, pz], [px, gy + hl + 0.03, pz], 0.032, 0.032, ferro, chiaro, 4, 0, 0);
  }
  prism(B, { cx: capo[0], y0: gy + hl, y1: gy + hl + 0.32, r0: 0.36, r1: 0.05, seg: 4, colBot: ferro, colTop: chiaro });
  prism(B, { cx: capo[0], y0: gy - 0.14, y1: gy, r0: 0.31, r1: 0.27, seg: 4, colBot: ferro, colTop: ferro });
  return B.toGeometry();
}

/* --- MODULO LUNARE --------------------------------------------------
 * La Luna. Polvere grigia e crateri li ha anche Mercurio: quello che rende la
 * Luna «la Luna» e che ci siamo stati. */
function lander(rnd, tint) {
  const B = new Builder();
  const oro = lin(0xd8a834), oroScuro = lin(0x8a6a1e);
  const grigio = lin(0x9a968e), scuro = lin(0x4a4842);
  // corpo inferiore, ottagonale e dorato
  prism(B, { y0: 0.95, y1: 1.85, r0: 1.30, r1: 1.24, seg: 8, colBot: oroScuro, colTop: oro });
  // stadio di risalita
  prism(B, { y0: 1.85, y1: 2.85, r0: 1.05, r1: 0.85, seg: 8, colBot: grigio, colTop: scale(grigio, 1.15) });
  prism(B, { y0: 2.85, y1: 3.20, r0: 0.55, r1: 0.34, seg: 6, colBot: grigio, colTop: grigio });
  // oblo
  discO(B, [0, 2.35, -0.98], [0, 0, -1], 0.26, lin(0x101418), lin(0x2a3038), 0, 12);
  // zampe
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a), cz = Math.sin(a);
    tube(B, [cx * 1.05, 1.30, cz * 1.05], [cx * 2.25, 0.12, cz * 2.25], 0.09, 0.06, grigio, scuro, 6, 0, 0);
    tube(B, [cx * 1.10, 0.95, cz * 1.10], [cx * 2.05, 0.35, cz * 2.05], 0.05, 0.04, scuro, scuro, 5, 0, 0);
    // piattello
    prism(B, { cx: cx * 2.28, cz: cz * 2.28, y0: 0, y1: 0.12, r0: 0.38, r1: 0.34, seg: 8, colBot: scuro, colTop: grigio });
  }
  // ugello
  prism(B, { y0: 0.30, y1: 0.95, r0: 0.52, r1: 0.26, seg: 8, colBot: scuro, colTop: scale(scuro, 1.4) });
  // bandiera
  const ast = 2.9;
  tube(B, [ast, 0, 1.3], [ast, 2.1, 1.3], 0.035, 0.030, grigio, grigio, 5, 0, 0);
  const rosso = lin(0xc03a34), bianco = lin(0xeeeae2), blu = lin(0x2a3f7a);
  face(B, [ast + 0.45, 1.80, 1.3], [0.45, 0, 0], [0, 0.28, 0], rosso, bianco);
  face(B, [ast + 0.45, 1.80, 1.3], [-0.45, 0, 0], [0, 0.28, 0], rosso, bianco);
  face(B, [ast + 0.22, 1.93, 1.298], [0.22, 0, 0], [0, 0.15, 0], blu, blu);
  face(B, [ast + 0.22, 1.93, 1.302], [-0.22, 0, 0], [0, 0.15, 0], blu, blu);
  return B.toGeometry();
}

/* --- MULINO ---------------------------------------------------------
 * Isole nel cielo. Sopra un isola sospesa il vento e l unica cosa che c e in
 * abbondanza. */
function windmill(rnd, tint) {
  const B = new Builder();
  const h = 6.2;
  const muro = mixc(tint, lin(0xd8cdb4), 0.6);
  const muroScuro = scale(muro, 0.62);
  const legno = lin(0x6a4e30);
  prism(B, { y0: 0, y1: h, r0: 1.55, r1: 1.05, seg: 10, colBot: muroScuro, colTop: muro });
  // tetto conico
  prism(B, { y0: h, y1: h + 1.5, r0: 1.25, r1: 0.08, seg: 10, colBot: scale(legno, 0.8), colTop: legno });
  // porta e finestrella
  face(B, [0, 0.85, -1.42], [-0.38, 0, 0], [0, 0.85, 0], lin(0x3a2a1c), lin(0x5a4430));
  discO(B, [0.0, h * 0.62, -1.20], [0, 0, -1], 0.24, lin(0xffe0a8), lin(0xd8b070), 1, 12);
  // pale
  const zz = -1.35;
  tube(B, [0, h * 0.86, zz + 0.30], [0, h * 0.86, zz - 0.25], 0.13, 0.11, legno, legno, 8, 0, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.35;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = 2.9, w = 0.34;
    const c = [ca * L * 0.55, h * 0.86 + sa * L * 0.55, zz - 0.28];
    const u = [ca * L * 0.45, sa * L * 0.45, 0];
    const v = [-sa * w, ca * w, 0];
    face(B, c, u, v, legno, mixc(legno, [1, 1, 1], 0.25));
    face(B, [c[0], c[1], c[2] - 0.02], [-u[0], -u[1], 0], v, legno, mixc(legno, [1, 1, 1], 0.25));
  }
  return B.toGeometry();
}

/* --- COLOSSO SPEZZATO -----------------------------------------------
 * Atlantide. Due gambe e un torso caduto raccontano una citta senza doverla
 * costruire. */
function statueRuin(rnd, tint) {
  const B = new Builder();
  const marmo = mixc(tint, lin(0xb8b2a2), 0.72);
  const scuro = scale(marmo, 0.58);
  // basamento
  box(B, [0, 0.30, 0], 1.35, 0.30, 1.05, scuro, marmo);
  /* Gambe grosse e un bacino sopra: due colonnine su una lastra non dicono
   * «statua», dicono «due colonnine». Serve che la meta rimasta in piedi si
   * legga come un corpo troncato. */
  for (const s of [-1, 1]) {
    const alt = s < 0 ? 2.5 : 1.6 + rnd() * 0.7;
    prism(B, { cx: s * 0.46, y0: 0.60, y1: 0.60 + alt, r0: 0.56, r1: 0.46, seg: 8, colBot: marmo, colTop: marmo });
    // piede, che sporge dal basamento
    box(B, [s * 0.46, 0.66, -0.42], 0.44, 0.14, 0.42, scuro, marmo);
  }
  // bacino: si appoggia sulla gamba intera e finisce di netto
  box(B, [-0.16, 3.24, 0], 0.95, 0.42, 0.62, marmo, scuro);
  const tx = 1.7 + rnd() * 0.9, tz = -1.1 - rnd() * 0.7;
  const rotY = rnd() * Math.PI;
  const i0 = B.p.length;
  prism(B, { y0: 0, y1: 2.2, r0: 0.72, r1: 0.52, seg: 8, colBot: marmo, colTop: scuro });
  blob(B, { cx: 0, cy: 2.5, cz: 0, rx: 0.42, ry: 0.48, rz: 0.42, level: 1, rough: 0.10, rnd, colTop: marmo, colBot: scuro, flex: 0 });
  /* Lo si costruisce in piedi e poi lo si corica: ruotare i vertici e molto
   * piu semplice che riscrivere la geometria orizzontale. */
  for (let i = i0; i < B.p.length; i += 3) {
    const x = B.p[i], y = B.p[i + 1], z = B.p[i + 2];
    // coricato sul fianco: y diventa -z
    let X = x, Y = z + 0.55, Z = -y;
    const c = Math.cos(rotY), sn = Math.sin(rotY);
    B.p[i] = tx + X * c - Z * sn;
    B.p[i + 1] = Y;
    B.p[i + 2] = tz + X * sn + Z * c;
  }
  /* Le normali dopo una rotazione non sono piu quelle: si ricalcolano dalla
   * faccia, che per una forma sfaccettata come questa e esatto. */
  for (let i = i0; i < B.p.length; i += 9) {
    const ax = B.p[i + 3] - B.p[i], ay = B.p[i + 4] - B.p[i + 1], az = B.p[i + 5] - B.p[i + 2];
    const bx = B.p[i + 6] - B.p[i], by = B.p[i + 7] - B.p[i + 1], bz = B.p[i + 8] - B.p[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { B.n[i + k * 3] = nx; B.n[i + k * 3 + 1] = ny; B.n[i + k * 3 + 2] = nz; }
  }
  return B.toGeometry();
}

/* ------------------------------------------------------------------ *
 * Il passato, e qualche mondo che non c e mai stato
 * ------------------------------------------------------------------ */

/* LICOPODE (Lepidodendron). L albero del Carbonifero non e un albero: e una
 * felce cresciuta trenta metri. Il fusto e nudo e coperto di cicatrici a
 * rombo dove sono cadute le foglie, e si biforca solo in cima, in una corona
 * a Y che non somiglia a nessuna chioma moderna. E la silhouette a dire
 * «trecento milioni di anni fa», non il colore. */
function lycopod(rnd, tint) {
  const B = new Builder();
  const h = 20 * (0.8 + rnd() * 0.5);
  const corteccia = mixc(lin(0x6a5a3e), tint, 0.20);
  const cortecciaScura = scale(corteccia, 0.58);
  const fronda = mixc(tint, lin(0x4a7a2a), 0.55);
  const frondaChiara = mixc(fronda, lin(0xa8c85a), 0.45);

  /* trunk() restituisce { top, ring }, non un array: usarlo come array da
   * undefined, e da li NaN in tutta la corona. */
  const cima = trunk(B, {
    r0: h * 0.045, r1: h * 0.020, h: h * 0.74, seg: 9, rings: 5,
    colBot: cortecciaScura, colTop: corteccia, flexTop: 0.05,
    curve: [(rnd() - 0.5) * h * 0.05, (rnd() - 0.5) * h * 0.05]
  });

  /* Le cicatrici a rombo: file sfalsate di losanghe scure sul fusto. Da
   * lontano non si distinguono una per una, ma danno al tronco una tessitura
   * che nessun albero di oggi ha. */
  for (let k = 0; k < 26; k++) {
    const t = 0.06 + (k / 26) * 0.66;
    const y = h * 0.74 * t;
    const r = (h * 0.045 + (h * 0.020 - h * 0.045) * t) * 1.02;
    const a = k * 2.399 + (k % 2) * 0.3;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const s = h * 0.011;
    const nx = Math.cos(a), nz = Math.sin(a);
    const tx = -nz, tz = nx;
    const c = scale(cortecciaScura, 0.8);
    B.quad([cx, y + s, cz], [cx + tx * s, y, cz + tz * s],
           [cx, y - s, cz], [cx - tx * s, y, cz - tz * s], c, c, c, c, 0, 0, 0, 0);
  }

  /* Corona: biforcazioni ripetute. Ogni ramo si divide in due, e ogni volta
   * l angolo si stringe — e il modo in cui cresce davvero una licopodiale. */
  const rami = [{ p: [cima.top[0], h * 0.74, cima.top[2]], d: [0, 1, 0], len: h * 0.13, r: h * 0.016 }];
  for (let liv = 0; liv < 4; liv++) {
    const nuovi = [];
    for (const R of rami) {
      const q = [R.p[0] + R.d[0] * R.len, R.p[1] + R.d[1] * R.len, R.p[2] + R.d[2] * R.len];
      tube(B, R.p, q, R.r, R.r * 0.72, cortecciaScura, corteccia, 6, 0, 0);
      if (liv < 3) {
        const a = rnd() * Math.PI * 2;
        const ap = 0.58 - liv * 0.10;
        for (const s of [-1, 1]) {
          const dx = R.d[0] + Math.cos(a) * ap * s;
          const dz = R.d[2] + Math.sin(a) * ap * s;
          const dy = R.d[1] * (1 - ap * 0.30);
          const l = Math.hypot(dx, dy, dz) || 1;
          nuovi.push({ p: q, d: [dx / l, dy / l, dz / l], len: R.len * 0.72, r: R.r * 0.66 });
        }
      } else {
        // ciuffi di foglie strette in punta
        for (let f = 0; f < 9; f++) {
          blade(B, {
            x: q[0], y: q[1], z: q[2], dir: (f / 9) * 6.283 + rnd(),
            len: h * 0.055 * (0.7 + rnd() * 0.6), wid: h * 0.0030,
            seg: 3, bend: 0.9, lift: 0.55, colBase: fronda, colTip: frondaChiara,
            flexMax: 1, taper: 1.2
          });
        }
      }
    }
    if (!nuovi.length) break;
    rami.length = 0; rami.push(...nuovi);
  }
  return B.toGeometry();
}

/* CALAMITE: l equiseto gigante. Fusto a canne, segnato da nodi netti, e a
 * ogni nodo una raggiera di aghi. Sta nell acqua bassa, in boschetti fitti. */
function calamite(rnd, tint) {
  const B = new Builder();
  const h = 7.0 * (0.75 + rnd() * 0.5);
  const stelo = mixc(tint, lin(0x6a8a3a), 0.5);
  const steloScuro = scale(stelo, 0.62);
  const ago = mixc(tint, lin(0x8ab04a), 0.6);
  const nodi = 7;
  for (let k = 0; k < nodi; k++) {
    const y0 = h * (k / nodi), y1 = h * ((k + 1) / nodi);
    const r0 = h * 0.030 * (1 - k / nodi * 0.55);
    const r1 = h * 0.030 * (1 - (k + 1) / nodi * 0.55);
    trunk(B, { r0, r1, h: y1 - y0, seg: 8, rings: 1, colBot: stelo, colTop: stelo,
               flexTop: 0, x0: 0, z0: 0 });
    // alza il segmento appena costruito
    const n = B.p.length;
    for (let i = n - 8 * 6 * 3; i < n; i += 3) B.p[i + 1] += y0;
    // nodo
    ringO(B, [0, y1, 0], [0, 1, 0], r1 * 0.9, r1 * 1.35, steloScuro, steloScuro, 0, 8);
    // raggiera di aghi
    if (k > 0) {
      const na = 16;
      for (let i = 0; i < na; i++) {
        blade(B, {
          x: 0, y: y1, z: 0, dir: (i / na) * 6.283 + k * 0.4,
          len: h * 0.24 * (1 - k / nodi * 0.35), wid: h * 0.0055,
          seg: 3, bend: 1.30, lift: 0.30, colBase: steloScuro, colTip: ago,
          flexMax: 1, taper: 1.1
        });
      }
    }
  }
  return B.toGeometry();
}

/* NUVOLA SOLIDA. In un mondo fatto di nuvole il vapore e terreno: serve una
 * massa che legga come cumulo — gobbe tonde in cima, base piatta — e non come
 * una palla bianca. La base piatta e tutto: e quella che dice «nuvola». */
function cloudPuff(rnd, tint) {
  const B = new Builder();
  const bianco = mixc(tint, lin(0xf4f2ee), 0.75);
  const ombra = mixc(bianco, lin(0x8ea0be), 0.45);
  const R = 3.4;
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const d = i === 0 ? 0 : R * (0.35 + rnd() * 0.55);
    const rr = R * (i === 0 ? 0.72 : 0.34 + rnd() * 0.30);
    blob(B, {
      cx: Math.cos(a) * d, cy: rr * (0.55 + rnd() * 0.35), cz: Math.sin(a) * d * 0.8,
      rx: rr * 1.15, ry: rr * 0.92, rz: rr * 1.10,
      level: 2, rough: 0.16, rnd, colTop: bianco, colBot: ombra, flex: 0
    });
  }
  // base piatta: un disco d ombra che chiude il fondo
  discO(B, [0, 0.06, 0], [0, -1, 0], R * 0.95, ombra, scale(ombra, 0.8), 0, 18);
  return B.toGeometry();
}

/* ------------------------------------------------------------------ *
 * L antichita costruita
 *
 * Qui il punto non e inventare: e ricordarsi com erano *prima*. Le piramidi
 * non erano gradoni di pietra gialla, erano lisce e bianche; il Partenone era
 * dipinto; un tempio romano aveva il tetto di coppi rossi. Il luogo comune
 * visivo e quasi sempre la rovina, non l originale.
 * ------------------------------------------------------------------ */

/* PIRAMIDE, come era finita. Rivestimento di calcare di Tura levigato — da
 * lontano un solido bianco quasi accecante — e il cuspide dorato in punta.
 *
 * Il dettaglio che quasi nessuno mette: le quattro facce non sono piane. Sono
 * leggermente incavate lungo la mediana, di circa mezzo grado; si vede solo
 * dall alto e con la luce radente, ed e la ragione per cui la Grande Piramide
 * sembra avere otto facce invece di quattro. */
function pyramid(rnd, tint) {
  const B = new Builder();
  const h = 146, b = 115;                 // Cheope: 146 m di altezza, 230 di base
  const incavo = b * 0.009;               // mezzo grado di rientranza sulla mediana
  const calcare = mixc(tint, lin(0xf0ead8), 0.80);
  const calcareOmbra = scale(calcare, 0.80);
  const zoccolo = mixc(calcare, lin(0xcfc4a8), 0.55);

  // basamento
  box(B, [0, 1.4, 0], b * 1.045, 1.4, b * 1.045, scale(zoccolo, 0.78), zoccolo);

  const T = [0, h, 0];
  const ang = [
    [[-b, 2.8, b], [b, 2.8, b]],          // faccia +Z
    [[b, 2.8, b], [b, 2.8, -b]],          // +X
    [[b, 2.8, -b], [-b, 2.8, -b]],        // -Z
    [[-b, 2.8, -b], [-b, 2.8, b]]         // -X
  ];
  for (let i = 0; i < 4; i++) {
    const A = ang[i][0], C = ang[i][1];
    // mediana tirata verso il centro
    const mx = (A[0] + C[0]) / 2, mz = (A[2] + C[2]) / 2;
    const l = Math.hypot(mx, mz) || 1;
    const M = [mx - mx / l * incavo, 2.8, mz - mz / l * incavo];
    /* Ogni faccia in tre fasce orizzontali, cosi il colore puo schiarire
     * verso l alto: una superficie di quindicimila metri quadri di tinta
     * unica legge come cartone. */
    const nf = 3;
    for (let k = 0; k < nf; k++) {
      const t0 = k / nf, t1 = (k + 1) / nf;
      const P = (Q, t) => [Q[0] + (T[0] - Q[0]) * t, Q[1] + (T[1] - Q[1]) * t, Q[2] + (T[2] - Q[2]) * t];
      const c0 = mixc(calcareOmbra, calcare, t0 * 0.9 + 0.1);
      const c1 = mixc(calcareOmbra, calcare, t1 * 0.9 + 0.1);
      // meta sinistra e meta destra, separate dalla mediana incavata
      for (const [X, Y] of [[A, M], [M, C]]) {
        const x0 = P(X, t0), y0 = P(Y, t0), x1 = P(X, t1), y1 = P(Y, t1);
        B.quad(x0, y0, y1, x1, c0, c0, c1, c1, 0, 0, 0, 0);
      }
    }
  }
  // cuspide dorata
  const oro = lin(0xe8c05a);
  const hc = h * 0.965;
  const bc = b * (1 - hc / h);
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + Math.PI / 4, a1 = (i + 1) * Math.PI / 2 + Math.PI / 4;
    const r = bc * Math.SQRT2;
    B.tri([Math.cos(a0) * r, hc, Math.sin(a0) * r],
          [Math.cos(a1) * r, hc, Math.sin(a1) * r], T, scale(oro, 0.7), scale(oro, 0.7), oro, 0, 0, 0);
  }
  return B.toGeometry();
}

/* SFINGE. Scolpita in un affioramento di roccia, quindi squadrata e massiccia:
 * il corpo e un blocco, le zampe due prismi che escono avanti, la testa e piu
 * piccola del corpo (lo e anche l originale, e non e un errore di scala).
 * Guarda verso -Z, come tutto il resto. */
function sphinx(rnd, tint) {
  const B = new Builder();
  const pietra = mixc(tint, lin(0xd8bf94), 0.75);
  const ombra = scale(pietra, 0.66);
  const chiaro = mixc(pietra, lin(0xf0e4c8), 0.45);

  /* Settantatre metri di lunghezza per venti di altezza: e lunga tre volte e
   * mezzo quanto e alta, e sbagliare questo rapporto la trasforma in uno
   * sfinge-cane seduto. La testa e piccola rispetto al corpo — lo e anche
   * nell originale, e non e un errore di scala. */
  // corpo, dal petto alla groppa
  box(B, [0, 5.0, 7], 5.4, 5.0, 15, ombra, pietra);
  // dorso arrotondato, appena piu largo del corpo cosi lo chiude
  blob(B, { cx: 0, cy: 9.4, cz: 8, rx: 5.7, ry: 2.3, rz: 14, level: 1, rough: 0.05, rnd,
            colTop: chiaro, colBot: pietra, flex: 0 });
  // zampe anteriori distese
  for (const s of [-1, 1]) {
    box(B, [s * 3.5, 2.5, -20], 1.9, 2.5, 12.5, ombra, pietra);
    box(B, [s * 3.5, 1.1, -33], 2.2, 1.1, 2.0, ombra, chiaro);
  }
  // petto
  box(B, [0, 5.2, -9.5], 4.6, 5.2, 2.8, ombra, pietra);

  // testa
  const yT = 15.2, zT = -10.6;
  box(B, [0, yT, zT], 2.7, 3.2, 2.6, pietra, chiaro);
  /* Il nemes: e la sagoma a dire «sfinge» a duecento metri, molto piu della
   * faccia — due ali di stoffa che scendono dalle tempie sulle spalle. */
  const nem = mixc(pietra, lin(0xc8a878), 0.4);
  for (const s of [-1, 1]) {
    const A = [s * 2.7, yT + 3.0, zT + 2.4], Bp = [s * 2.7, yT + 3.0, zT - 2.4];
    const C = [s * 5.6, yT - 4.4, zT - 1.9], D = [s * 5.6, yT - 4.4, zT + 1.9];
    if (s > 0) B.quad(A, Bp, C, D, chiaro, chiaro, nem, nem, 0, 0, 0, 0);
    else B.quad(D, C, Bp, A, nem, nem, chiaro, chiaro, 0, 0, 0, 0);
    if (s > 0) B.quad(D, C, Bp, A, nem, nem, chiaro, chiaro, 0, 0, 0, 0);
    else B.quad(A, Bp, C, D, chiaro, chiaro, nem, nem, 0, 0, 0, 0);
  }
  // calotta sopra la fronte
  box(B, [0, yT + 2.9, zT - 0.2], 2.9, 1.0, 2.8, nem, chiaro);
  // ureo
  box(B, [0, yT + 2.0, zT - 2.8], 0.34, 0.9, 0.32, scale(nem, 0.8), chiaro);
  // barba cerimoniale, spezzata (lo e davvero)
  box(B, [0, yT - 2.9, zT - 2.1], 0.9, 1.6, 0.85, ombra, pietra);
  // stele fra le zampe
  box(B, [0, 2.6, -29], 1.6, 2.6, 0.4, ombra, chiaro);
  return B.toGeometry();
}

/* TEMPIO ROMANO. Podio alto, scalinata su un lato solo (e la differenza dal
 * tempio greco, che ha i gradini su tutti e quattro), colonne, trabeazione,
 * frontone, e i coppi rossi. Il fronte guarda verso -Z. */
function romanTemple(rnd, tint) {
  const B = new Builder();
  const marmo = mixc(tint, lin(0xe4dcc8), 0.75);
  const marmoOmbra = scale(marmo, 0.74);
  const coppo = lin(0xa8482e);
  const coppoScuro = scale(coppo, 0.68);
  const W = 8.4, D = 12.5, hPod = 2.4;

  // podio
  box(B, [0, hPod / 2, 0], W, hPod / 2, D, marmoOmbra, marmo);
  // scalinata davanti
  for (let i = 0; i < 6; i++) {
    const y = hPod * (i + 1) / 7;
    box(B, [0, y / 2, -D - 0.35 - i * 0.42], W * 0.62, y / 2, 0.42,
        scale(marmo, 0.82), marmo);
  }

  const hCol = 6.2, rCol = 0.44;
  const colonna = (cx, cz) => {
    // base
    prism(B, { cx, cz, y0: hPod, y1: hPod + 0.22, r0: rCol * 1.32, r1: rCol * 1.22, seg: 10, colBot: marmoOmbra, colTop: marmo });
    // fusto scanalato: dodici lati, che a distanza leggono come scanalature
    prism(B, { cx, cz, y0: hPod + 0.22, y1: hPod + hCol - 0.42, r0: rCol, r1: rCol * 0.86, seg: 12, colBot: marmo, colTop: marmo });
    // capitello
    prism(B, { cx, cz, y0: hPod + hCol - 0.42, y1: hPod + hCol - 0.12, r0: rCol * 0.90, r1: rCol * 1.30, seg: 10, colBot: marmo, colTop: marmo });
    box(B, [cx, hPod + hCol - 0.06, cz], rCol * 1.45, 0.10, rCol * 1.45, marmo, mixc(marmo, [1, 1, 1], 0.2));
  };
  const nx = 6, nz = 9;
  for (let i = 0; i < nx; i++) {
    const cx = -W * 0.80 + (i / (nx - 1)) * W * 1.60;
    colonna(cx, -D * 0.86);
    colonna(cx, D * 0.86);
  }
  for (let j = 1; j < nz - 1; j++) {
    const cz = -D * 0.86 + (j / (nz - 1)) * D * 1.72;
    colonna(-W * 0.80, cz);
    colonna(W * 0.80, cz);
  }
  // cella
  box(B, [0, hPod + hCol * 0.5, D * 0.10], W * 0.56, hCol * 0.5, D * 0.56, marmoOmbra, marmo);
  // porta
  face(B, [0, hPod + 1.5, -D * 0.46 - 0.02], [-1.1, 0, 0], [0, 1.5, 0], lin(0x2a2018), lin(0x4a3a28));

  // trabeazione
  const yTr = hPod + hCol;
  box(B, [0, yTr + 0.55, 0], W * 0.92, 0.55, D * 0.96, marmo, mixc(marmo, [1, 1, 1], 0.15));
  // frontoni (davanti e dietro)
  const yF = yTr + 1.10, hF = 2.3;
  for (const sz of [-1, 1]) {
    const z = sz * D * 0.96;
    const A = [-W * 0.92, yF, z], C = [W * 0.92, yF, z], Tp = [0, yF + hF, z];
    if (sz < 0) B.tri(A, C, Tp, marmoOmbra, marmoOmbra, marmo, 0, 0, 0);
    else B.tri(C, A, Tp, marmoOmbra, marmoOmbra, marmo, 0, 0, 0);
  }
  // tetto a due falde, di coppi
  for (const s of [-1, 1]) {
    B.quad([0, yF + hF, -D * 0.96], [0, yF + hF, D * 0.96],
           [s * W * 0.99, yF - 0.12, D * 0.96], [s * W * 0.99, yF - 0.12, -D * 0.96],
           coppo, coppo, coppoScuro, coppoScuro, 0, 0, 0, 0);
    // file di coppi
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      const x = s * W * 0.99 * t, y = yF + hF - (hF + 0.12) * t;
      B.quad([x, y + 0.05, -D * 0.96], [x, y + 0.05, D * 0.96],
             [x, y - 0.02, D * 0.96], [x, y - 0.02, -D * 0.96],
             coppoScuro, coppoScuro, coppoScuro, coppoScuro, 0, 0, 0, 0);
    }
  }
  return B.toGeometry();
}

/* INSULA: il condominio romano. Quattro piani, bottega al pianterreno con
 * l arco, finestrelle piccole e irregolari, intonaco che cade a chiazze. E
 * questo, non i templi, che riempiva davvero una citta romana. */
function insula(rnd, tint) {
  const B = new Builder();
  const W = 6.5, D = 5.4;
  const piani = 3 + Math.floor(rnd() * 2);
  const hP = 3.1;
  const H = piani * hP;
  const intonaco = mixc(tint, lin(0xd8c0a0), 0.6);
  const mattone = mixc(lin(0x9a5a44), tint, 0.20);
  const scuro = scale(intonaco, 0.70);

  // pianterreno in mattoni, piani alti intonacati
  box(B, [0, hP / 2, 0], W, hP / 2, D, scale(mattone, 0.8), mattone);
  box(B, [0, hP + (H - hP) / 2, 0], W * 0.985, (H - hP) / 2, D * 0.985, intonaco, mixc(intonaco, [1, 1, 1], 0.12));

  // archi delle botteghe sul fronte (-Z)
  const vano = lin(0x241c14);
  for (let i = 0; i < 2; i++) {
    const cx = (i - 0.5) * W * 0.95;
    face(B, [cx, 1.15, -D - 0.02], [-0.85, 0, 0], [0, 1.15, 0], vano, scale(vano, 1.5));
    // arco a tutto sesto
    for (let k = 0; k < 8; k++) {
      const a0 = Math.PI * (k / 8), a1 = Math.PI * ((k + 1) / 8);
      const r = 0.85;
      B.tri([cx + Math.cos(a0) * r, 2.30 + Math.sin(a0) * r, -D - 0.02],
            [cx + Math.cos(a1) * r, 2.30 + Math.sin(a1) * r, -D - 0.02],
            [cx, 2.30, -D - 0.02], vano, vano, scale(vano, 1.6), 0, 0, 0);
    }
  }
  // finestre: file irregolari, e su tutti e quattro i lati
  const luce = lin(0x3a2e22);
  for (let p = 1; p < piani; p++) {
    const y = hP * p + hP * 0.55;
    for (let i = 0; i < 3; i++) {
      const cx = (i - 1) * W * 0.58 + (rnd() - 0.5) * 0.3;
      face(B, [cx, y, -D - 0.03], [-0.42, 0, 0], [0, 0.58, 0], luce, scale(luce, 1.4));
      face(B, [cx, y, D + 0.03], [0.42, 0, 0], [0, 0.58, 0], luce, scale(luce, 1.4));
    }
    for (let i = 0; i < 2; i++) {
      const cz = (i - 0.5) * D * 0.9;
      face(B, [-W - 0.03, y, cz], [0, 0, 0.42], [0, 0.58, 0], luce, scale(luce, 1.4));
      face(B, [W + 0.03, y, cz], [0, 0, -0.42], [0, 0.58, 0], luce, scale(luce, 1.4));
    }
  }
  // cornicione e tetto piano di coppi
  box(B, [0, H + 0.18, 0], W * 1.06, 0.18, D * 1.06, scuro, intonaco);
  box(B, [0, H + 0.55, 0], W * 0.96, 0.20, D * 0.96, lin(0x8a4030), lin(0xa8543a));
  return B.toGeometry();
}

/* TRILITE. Due piedritti e un architrave: l unita di Stonehenge. La pietra e
 * sarsen, grigio-bruna, e i blocchi sono sbozzati a mano — nessuna faccia e
 * davvero piana, ed e quello a farli sembrare pietra invece che cemento. */
function trilithon(rnd, tint) {
  const B = new Builder();
  const sarsen = mixc(tint, lin(0x8a8578), 0.75);
  const scuro = scale(sarsen, 0.62);
  const h = 6.4 * (0.9 + rnd() * 0.2);
  const sep = 1.55;
  const jag = (i) => 0.88 + 0.24 * ((i * 5 + 2) % 4) / 3;
  for (const s of [-1, 1]) {
    prism(B, {
      cx: s * sep, y0: 0, y1: h, r0: 1.05, r1: 0.90, seg: 5,
      colBot: scuro, colTop: sarsen, twist: (rnd() - 0.5) * 0.3,
      lean: [(rnd() - 0.5) * 0.22, (rnd() - 0.5) * 0.22], jag
    });
    // tenone: il perno che tiene l architrave
    prism(B, { cx: s * sep, y0: h, y1: h + 0.22, r0: 0.20, r1: 0.17, seg: 6, colBot: sarsen, colTop: sarsen });
  }
  // architrave
  const hl = 0.85;
  box(B, [0, h + hl / 2 + 0.10, 0], sep + 1.15, hl / 2, 0.78, scuro, sarsen);
  // sbozzatura: qualche scheggia sugli spigoli
  for (let k = 0; k < 6; k++) {
    const s = k % 2 ? 1 : -1;
    const y = h + 0.10 + rnd() * hl;
    B.tri([s * (sep + 1.15), y, -0.78 + rnd() * 1.5],
          [s * (sep + 0.95), y + 0.22, -0.4],
          [s * (sep + 1.15), y - 0.2, 0.2], scuro, sarsen, scuro, 0, 0, 0);
  }
  return B.toGeometry();
}

/* STATUA INTERA, su plinto. Serve alle citta vive (Roma) come statueRuin
 * serve a quelle morte. Non ha faccia: a dieci metri non si vede, e provarci
 * la farebbe sembrare un pupazzo. */
function statue(rnd, tint) {
  const B = new Builder();
  const marmo = mixc(tint, lin(0xdad4c4), 0.78);
  const ombra = scale(marmo, 0.66);
  const H = 1.0;
  // plinto
  box(B, [0, 0.55, 0], 0.72, 0.55, 0.66, ombra, marmo);
  box(B, [0, 1.16, 0], 0.62, 0.08, 0.56, marmo, mixc(marmo, [1, 1, 1], 0.2));
  const y0 = 1.24;
  // gambe: una portante e una rilassata, come in ogni statua classica
  for (const s of [-1, 1]) {
    const av = s < 0 ? 0.10 : -0.06;
    tube(B, [s * 0.16, y0, av], [s * 0.19, y0 + 0.92, av * 0.4], 0.15, 0.13, ombra, marmo, 7, 0, 0);
  }
  // panneggio: un tronco di cono, che e come si legge una toga da lontano
  prism(B, { y0: y0 + 0.55, y1: y0 + 1.62, r0: 0.30, r1: 0.26, seg: 9, colBot: ombra, colTop: marmo });
  // torace e spalle
  blob(B, { cx: 0, cy: y0 + 1.72, cz: 0, rx: 0.30, ry: 0.24, rz: 0.20, level: 1, rough: 0.06, rnd,
            colTop: marmo, colBot: ombra, flex: 0 });
  // braccio destro alzato, sinistro lungo il fianco
  tube(B, [0.26, y0 + 1.78, 0], [0.58, y0 + 2.16, -0.12], 0.085, 0.070, marmo, marmo, 6, 0, 0);
  tube(B, [-0.26, y0 + 1.76, 0], [-0.30, y0 + 1.10, 0.05], 0.085, 0.070, marmo, ombra, 6, 0, 0);
  // testa
  blob(B, { cx: 0, cy: y0 + 2.06, cz: -0.02, rx: 0.135, ry: 0.155, rz: 0.135, level: 1, rough: 0.05, rnd,
            colTop: mixc(marmo, [1, 1, 1], 0.12), colBot: ombra, flex: 0 });
  return B.toGeometry();
}

/* VULCANO DA TASCA. Sul pianeta del Piccolo Principe i vulcani sono alti al
 * ginocchio: ci si scalda la colazione e si spazzano col ramazzo. La cosa che
 * li rende loro non e la forma — un cono lo fa chiunque — e la TAGLIA. */
function volcanoCone(rnd, tint) {
  const B = new Builder();
  const h = 1.45 * (0.85 + rnd() * 0.35);
  /* Cono, non torre di raffreddamento: la base a 0,62 dell altezza e il
   * cratere a 0,26 davano una forma piu larga che alta. */
  const r0 = h * 0.46, r1 = h * 0.13;
  const roccia = mixc(tint, lin(0x6a5240), 0.55);
  const scura = scale(roccia, 0.58);
  const seg = 11;
  const jag = (i) => 0.90 + 0.20 * ((i * 7 + 3) % 5) / 4;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const P = (a, rr, y) => [Math.cos(a) * rr * jag(i), y, Math.sin(a) * rr * jag(i)];
    /* Dal basso verso l alto l avvolgimento esce all indietro e il cono si
     * vede solo da dentro: va percorso dall alto. */
    B.quad(P(a0, r1, h), P(a1, r1, h), P(a1, r0, 0), P(a0, r0, 0),
      roccia, roccia, scura, scura, 0, 0, 0, 0);
  }
  // cratere: labbro chiaro e gola scura
  ringO(B, [0, h, 0], [0, 1, 0], r1 * 0.55, r1, mixc(roccia, [1, 1, 1], 0.18), roccia, 0, 11);
  const gola = scale(scura, 0.35);
  for (let i = 0; i < 11; i++) {
    const a0 = (i / 11) * Math.PI * 2, a1 = ((i + 1) / 11) * Math.PI * 2;
    const p = (a, rr, y) => [Math.cos(a) * rr, y, Math.sin(a) * rr];
    // la gola si guarda da dentro: qui la normale deve puntare verso l asse
    B.quad(p(a1, r1 * 0.55, h), p(a0, r1 * 0.55, h),
           p(a0, r1 * 0.30, h - 0.22), p(a1, r1 * 0.30, h - 0.22),
           roccia, roccia, gola, gola, 0, 0, 0, 0);
  }
  discO(B, [0, h - 0.22, 0], [0, 1, 0], r1 * 0.30, gola, scale(gola, 0.7), 0, 11);
  return B.toGeometry();
}

/* LA ROSA. Una sola, e vanitosa. Non e un fiore fra i tanti: e il motivo per
 * cui il Piccolo Principe torna. Va costruita a corolla vera — petali su piu
 * giri, sfalsati — perche un disco rosso su uno stelo non e una rosa. */
function rose(rnd, tint) {
  const B = new Builder();
  const H = 0.85;
  const stelo = lin(0x3a6a2a), steloScuro = scale(stelo, 0.62);
  const foglia = mixc(stelo, lin(0x6aa83a), 0.5);
  const rossi = [0xc8283c, 0xd8384a, 0xb82038, 0xe04858];
  const petalo = lin(rossi[Math.floor(rnd() * rossi.length)]);
  const petaloScuro = scale(petalo, 0.55);

  trunk(B, { r0: 0.020, r1: 0.014, h: H * 0.72, seg: 6, rings: 3,
             colBot: steloScuro, colTop: stelo, flexTop: 0.35,
             curve: [(rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05] });
  // foglie
  for (let i = 0; i < 4; i++) {
    const a = i * 1.9 + rnd() * 0.4, y = H * (0.20 + i * 0.11);
    blade(B, { x: 0, y, z: 0, dir: a, len: H * 0.20, wid: H * 0.045,
               seg: 3, bend: 1.0, lift: 0.45, colBase: steloScuro, colTip: foglia,
               flexMax: 1, taper: 0.7 });
  }
  // sepali e corolla
  const yc = H * 0.76;
  blob(B, { cx: 0, cy: yc - 0.03, cz: 0, rx: 0.045, ry: 0.035, rz: 0.045,
            level: 1, rough: 0.10, rnd, colTop: foglia, colBot: steloScuro, flex: 0.2 });
  /* Tre giri di petali che formano una COPPA: i piu interni stanno quasi
   * dritti e si chiudono, i piu esterni si aprono e ricadono. A raggiera
   * piatta viene una margherita, non una rosa — la differenza sta tutta
   * nell inclinazione, non nel colore ne nel numero. */
  const GIRI = [
    { n: 5, r: 0.032, su: 0.075, fuori: 0.20, largo: 1.15 },
    { n: 6, r: 0.055, su: 0.042, fuori: 0.72, largo: 1.05 },
    { n: 7, r: 0.075, su: -0.008, fuori: 1.15, largo: 0.95 }
  ];
  for (let g = 0; g < GIRI.length; g++) {
    const G = GIRI[g];
    for (let i = 0; i < G.n; i++) {
      const a = (i / G.n) * Math.PI * 2 + g * 0.62;
      const ca = Math.cos(a), sa = Math.sin(a);
      const y0 = yc + 0.010;
      const base = [ca * G.r * 0.30, y0, sa * G.r * 0.30];
      const rp = G.r * (1 + G.fuori);
      // punta smussata: due vertici invece di uno, o il petalo diventa un ago
      const w = G.r * G.largo * 0.55;
      const p1 = [ca * rp - sa * w * 0.55, y0 + G.su, sa * rp + ca * w * 0.55];
      const p2 = [ca * rp + sa * w * 0.55, y0 + G.su, sa * rp - ca * w * 0.55];
      const m1 = [ca * G.r * 0.9 - sa * w, y0 + G.su * 0.55, sa * G.r * 0.9 + ca * w];
      const m2 = [ca * G.r * 0.9 + sa * w, y0 + G.su * 0.55, sa * G.r * 0.9 - ca * w];
      const cB = mixc(petaloScuro, petalo, 0.25 + g * 0.22);
      const cP = mixc(petalo, [1, 1, 1], 0.06 + g * 0.10);
      // dritto e rovescio: un petalo si vede da tutte e due le parti
      for (const inv of [false, true]) {
        const q = (A, B2, C, D) => inv ? B.quad(D, C, B2, A, cP, cP, cB, cB, 0, 0, 0, 0)
                                       : B.quad(A, B2, C, D, cB, cP, cP, cB, 0, 0, 0, 0);
        q(base, m1, p1, p2);
        q(base, p2, p1, m2);
      }
    }
  }
  return B.toGeometry();
}

export const PROPS = {
  conifer, broadleaf, birch, swampTree, palm, acacia,
  saguaro, barrelCactus, bush, dryBush, fern,
  grassTuft, tallGrass, reed,
  rock, boulder, iceRock, lavaRock, crystal,
  termiteMound, deadTree, stump, log, mushroom, flower,
  // luoghi immaginari
  twistedTree, glowMushroom, giantMushroom, fairyTree, spiralRock, ajisaTree, slabRock,
  bamboo, ruinPillar, cycad,
  coral, brainCoral, kelp, anemone, vaporator,
  // costruito
  hobbitHole, fence, gardenPatch, haystack, signpost,
  // firme dei luoghi immaginari
  domeHut, mushroomHouse, standingStone, archRuin, watchTower,
  darkSpire, lamppost, lander, windmill, statueRuin,
  // passato e mondi nuovi
  lycopod, calamite, cloudPuff,
  // antichita costruita
  pyramid, sphinx, romanTemple, insula, trilithon, statue,
  volcanoCone, rose
};

/* Altezza naturale in metri, prima della scala del bioma.
 * Non e una stima: dopo la costruzione ogni geometria viene RIPORTATA a questa
 * altezza. I generatori possono quindi variare la forma quanto vogliono senza
 * che la dimensione finale scappi, che era il difetto della prima versione:
 * altezza casuale nel generatore per scala casuale nel bioma dava erba alta
 * come un uomo. */
export const PROP_HEIGHT = {
  conifer: 9.0, broadleaf: 8.0, birch: 7.0, swampTree: 8.0, palm: 8.0, acacia: 6.0,
  saguaro: 5.0, barrelCactus: 0.55, bush: 0.9, dryBush: 0.75, fern: 0.7,
  grassTuft: 0.32, tallGrass: 0.9, reed: 1.8,
  rock: 0.5, boulder: 1.5, iceRock: 1.1, lavaRock: 0.7, crystal: 1.4,
  termiteMound: 2.0, deadTree: 6.0, stump: 0.7, log: 3.0, mushroom: 0.18, flower: 0.3,
  twistedTree: 8.0, glowMushroom: 0.35, giantMushroom: 5.0, fairyTree: 13.0,
  spiralRock: 5.0, ajisaTree: 9.0, slabRock: 1.4,
  bamboo: 8.0, ruinPillar: 4.0, cycad: 2.6,
  coral: 1.3, brainCoral: 0.9, kelp: 3.4, anemone: 0.55, vaporator: 2.8,
  hobbitHole: 11.0, fence: 3.0, gardenPatch: 3.2, haystack: 2.6, signpost: 2.2,
  domeHut: 6.4, mushroomHouse: 6.8, standingStone: 3.3, archRuin: 5.4,
  watchTower: 12.0, darkSpire: 38.0, lamppost: 4.2, lander: 5.5,
  windmill: 8.5, statueRuin: 5.0,
  lycopod: 22.0, calamite: 7.5, cloudPuff: 9.0,
  pyramid: 146.0, sphinx: 73.0, romanTemple: 12.5, insula: 13.0,
  trilithon: 7.4, statue: 3.6,
  volcanoCone: 1.5, rose: 0.9
};

/* Su quale asse si misura. Un tronco caduto e lungo, non alto: normalizzarlo
 * sull altezza lo farebbe diventare un obelisco coricato. */
/* Misurati sulla larghezza, non sull altezza: un tumulo e largo dieci metri
 * e alto tre, e normalizzarlo in altezza lo gonfierebbe a dismisura. */
const PROP_AXIS = { log: 'xz', hobbitHole: 'xz', fence: 'xz', gardenPatch: 'xz',
                    domeHut: 'xz', cloudPuff: 'xz',
                    /* Misurate sulla lunghezza: la Sfinge e lunga settantatre metri
                     * e alta venti, e normalizzarla in altezza la triplicherebbe. */
                    sphinx: 'xz' };

export function buildProp(type, rnd, tint) {
  const fn = PROPS[type];
  if (!fn) throw new Error('tipo sconosciuto: ' + type);
  const g = fn(rnd, tint);

  const target = PROP_HEIGHT[type] * (0.86 + rnd() * 0.28);
  const pos = g.attributes.position.array;
  let minY = Infinity, maxY = -Infinity, maxXZ = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const ex = Math.max(Math.abs(pos[i]), Math.abs(pos[i + 2]));
    if (ex > maxXZ) maxXZ = ex;
  }
  const cur = PROP_AXIS[type] === 'xz' ? maxXZ * 2 : (maxY - Math.min(0, minY));
  if (cur > 1e-4) {
    const k = target / cur;
    for (let i = 0; i < pos.length; i++) pos[i] *= k;
    g.attributes.position.needsUpdate = true;
    g.computeBoundingSphere();
  }
  return g;
}
