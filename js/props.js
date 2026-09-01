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
export const PROPS = {
  conifer, broadleaf, birch, swampTree, palm, acacia,
  saguaro, barrelCactus, bush, dryBush, fern,
  grassTuft, tallGrass, reed,
  rock, boulder, iceRock, lavaRock, crystal,
  termiteMound, deadTree, stump, log, mushroom, flower,
  // luoghi immaginari
  twistedTree, glowMushroom, giantMushroom, fairyTree, spiralRock, ajisaTree, slabRock,
  bamboo, ruinPillar, cycad,
  coral, brainCoral, kelp, anemone, vaporator
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
  coral: 1.3, brainCoral: 0.9, kelp: 3.4, anemone: 0.55, vaporator: 2.8
};

/* Su quale asse si misura. Un tronco caduto e lungo, non alto: normalizzarlo
 * sull altezza lo farebbe diventare un obelisco coricato. */
const PROP_AXIS = { log: 'xz' };

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
