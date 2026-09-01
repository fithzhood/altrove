/* Altrove - fauna.js
 * Animali.
 *
 * Un posto dove niente si muove sembra un plastico. Ma un animale fatto male e
 * peggio del vuoto, perche l occhio ci si aggrappa. Quattro cose lo tradiscono
 * subito, e sono quelle che questo file cerca di risolvere.
 *
 *  1. LA SAGOMA. Un uccello non e un ovale con due alette: e un corpo
 *     affusolato con l ala divisa in braccio e mano, le remiganti separate in
 *     punta e la coda aperta a ventaglio. E il profilo controluce a farlo
 *     riconoscere, non i dettagli.
 *
 *  2. LA SCALA. Va misurata sull asse giusto. Un uccello ad ali aperte e alto
 *     pochi centimetri e largo un metro: normalizzarlo sull altezza lo gonfia
 *     di tre volte e ne esce un condor. Ogni creatura dichiara qui su quale
 *     asse si misura.
 *
 *  3. LA ROTTA. Il modello guarda verso -Z, quindi la rotazione attorno a Y che
 *     lo punta verso (dx, dz) e atan2(dx, dz) piu mezzo giro. Sbagliare quel
 *     mezzo giro significa animali che camminano all indietro.
 *
 *  4. IL MOTO. Uno stormo non e un cerchio: sono separazione, allineamento e
 *     coesione, e la forma del gruppo viene da se. Chi vira si inclina, chi
 *     sale batte le ali, chi scende plana.
 *
 * Divisione del lavoro: la CPU muove gli agenti (poche centinaia), la GPU anima
 * le parti del corpo. Ogni vertice porta il numero della parte a cui appartiene
 * e il perno attorno a cui ruota. Nessuno scheletro, nessun fotogramma chiave.
 */

import * as THREE from '../vendor/three.module.js';
import { mulberry32, clamp, lerp } from './noise.js?v=15';
import { Builder, blob, blade, lin, mixc, scale as cscale } from './props.js?v=15';

/* Codici delle parti: il vertex shader li legge come numeri, quindi devono
 * restare identici fra geometria e shader. */
const P_BODY = 0, P_WING_L = 1, P_WING_R = 2;
const P_LEG_FL = 3, P_LEG_FR = 4, P_LEG_BL = 5, P_LEG_BR = 6;
const P_HEAD = 7, P_TAIL = 8;
const P_SHIN_FL = 9, P_SHIN_FR = 10, P_SHIN_BL = 11, P_SHIN_BR = 12;

/* ------------------------------------------------------------------ *
 * Impalcatura
 * ------------------------------------------------------------------ */
class Rig {
  constructor(bob, sway) {
    this.B = new Builder();
    this.part = []; this.pivot = [];
    this.bob = bob || 0; this.sway = sway || 0;
  }
  begin(part, pivot) {
    this._flush();
    this.curPart = part;
    this.curPivot = pivot || [0, 0, 0];
  }
  _flush() {
    const n = this.B.p.length / 3;
    while (this.part.length < n) {
      this.part.push(this.curPart === undefined ? 0 : this.curPart);
      const pv = this.curPivot || [0, 0, 0];
      this.pivot.push(pv[0], pv[1], pv[2]);
    }
  }
  toGeometry() {
    this._flush();
    const g = this.B.toGeometry();
    const n = this.part.length;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.pivot, 3));
    const rig = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { rig[i * 2] = this.bob; rig[i * 2 + 1] = this.sway; }
    g.setAttribute('aRig', new THREE.BufferAttribute(rig, 2));
    g.deleteAttribute('aFlex');
    return g;
  }
}

/* Tubo fra due punti: colli, code, zampe, proboscidi. */
function tube(B, a, b, ra, rb, colA, colB, seg) {
  seg = seg || 6;
  let ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len; ay /= len; az /= len;
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
      cscale(colA, sh), cscale(colA, sh), cscale(colB, sh), cscale(colB, sh), 0, 0, 0, 0);
  }
}
function chain(B, pts, r0, r1, colA, colB, seg) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
    tube(B, pts[i], pts[i + 1], lerp(r0, r1, t0), lerp(r0, r1, t1),
      mixc(colA, colB, t0), mixc(colA, colB, t1), seg || 6);
  }
}

/* Superficie chiusa costruita da due profili (bordo d attacco e bordo d uscita)
 * con una bombatura al centro. Un ala e questo, non un rettangolo. */
function membrane(B, lead, trail, colA, colB, camber) {
  const n = lead.length - 1;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + camber, (p[2] + q[2]) / 2];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const cA = mixc(colA, colB, t0), cB = mixc(colA, colB, t1);
    const m0 = mid(lead[i], trail[i]), m1 = mid(lead[i + 1], trail[i + 1]);
    // dorso
    B.quad(lead[i], lead[i + 1], m1, m0, cA, cB, cB, cA, 0, 0, 0, 0);
    B.quad(m0, m1, trail[i + 1], trail[i], cA, cB, cB, cA, 0, 0, 0, 0);
    // ventre, un po piu scuro
    const dA = cscale(cA, 0.62), dB = cscale(cB, 0.62);
    B.quad(m1, lead[i + 1], lead[i], m0, dB, dB, dA, dA, 0, 0, 0, 0);
    B.quad(trail[i], trail[i + 1], m1, m0, dA, dB, dB, dA, 0, 0, 0, 0);
  }
}

/* Penna: un fuso piatto. Serve alle remiganti e alle timoniere. */
function feather(B, root, tip, w, colA, colB) {
  const dx = tip[0] - root[0], dz = tip[2] - root[2];
  const l = Math.hypot(dx, dz) || 1;
  const px = -dz / l * w, pz = dx / l * w;
  const mx = (root[0] + tip[0]) / 2, my = (root[1] + tip[1]) / 2, mz = (root[2] + tip[2]) / 2;
  const a = [root[0], root[1], root[2]];
  const b = [mx + px, my, mz + pz];
  const c = [tip[0], tip[1], tip[2]];
  const d = [mx - px, my, mz - pz];
  B.quad(a, b, c, d, colA, colB, colB, colB, 0, 0, 0, 0);
  B.quad(d, c, b, a, colB, colB, colB, colA, 0, 0, 0, 0);
}

/* ------------------------------------------------------------------ *
 * UCCELLO — costruito su apertura alare unitaria
 * ------------------------------------------------------------------ */
function birdMesh(rnd, tint, opts = {}) {
  const R = new Rig(0.008, 0);
  const B = R.B;
  const S = 1.0;
  const body = tint, dark = cscale(tint, 0.50), light = mixc(tint, [1, 1, 1], 0.30);
  const bodyL = S * 0.34;

  /* corpo: petto pieno, coda affusolata */
  R.begin(P_BODY);
  chain(B, [[0, S * 0.010, -bodyL * 0.52], [0, S * 0.020, -bodyL * 0.16]], S * 0.030, S * 0.060, light, body, 8);
  chain(B, [[0, S * 0.020, -bodyL * 0.16], [0, S * 0.012, bodyL * 0.22]], S * 0.060, S * 0.042, body, body, 8);
  chain(B, [[0, S * 0.012, bodyL * 0.22], [0, 0, bodyL * 0.52]], S * 0.038, S * 0.014, body, dark, 8);

  /* collo e testa, protesi in avanti come in volo */
  R.begin(P_HEAD, [0, S * 0.014, -bodyL * 0.48]);
  chain(B, [[0, S * 0.014, -bodyL * 0.48], [0, S * 0.030, -bodyL * 0.74]], S * 0.030, S * 0.026, body, light, 6);
  blob(B, {
    cx: 0, cy: S * 0.034, cz: -bodyL * 0.88, rx: S * 0.027, ry: S * 0.027, rz: S * 0.036,
    level: 1, rough: 0.05, rnd, colTop: light, colBot: body, flex: 0
  });
  const beak = opts.beak || lin(0xd8a848);
  chain(B, [[0, S * 0.032, -bodyL * 0.94], [0, S * 0.028, -bodyL * (1.06 + (opts.beakLen || 0))]],
    S * 0.015, S * 0.002, beak, cscale(beak, 0.75), 5);

  /* coda a ventaglio: penne separate */
  R.begin(P_TAIL, [0, 0, bodyL * 0.46]);
  const nT = 7, tailLen = S * 0.175 * (opts.tailLen || 1);
  for (let i = 0; i < nT; i++) {
    const t = (i / (nT - 1)) * 2 - 1;
    const a = t * 0.58;
    feather(B,
      [t * S * 0.008, S * 0.002, bodyL * 0.46],
      [Math.sin(a) * tailLen, -Math.abs(t) * S * 0.012, bodyL * 0.46 + Math.cos(a) * tailLen],
      S * 0.017, mixc(body, dark, 0.3), dark);
  }

  /* ali: braccio + mano, poi le remiganti in punta */
  for (const side of [-1, 1]) {
    const sh = [side * S * 0.042, S * 0.020, -bodyL * 0.12];
    R.begin(side < 0 ? P_WING_L : P_WING_R, sh);
    const half = S * 0.5;
    const st = [0.09, 0.40, 0.66, 0.84];
    const chord = [0.215, 0.190, 0.140, 0.078].map(v => v * S * (opts.chord || 1));
    const sweep = [-0.020, -0.008, 0.026, 0.070].map(v => v * S);
    // diedro leggero: le ali stanno un filo sopra l orizzontale, non a squadra
    const rise = [0.020, 0.034, 0.038, 0.036].map(v => v * S);
    const lead = [], trail = [];
    for (let i = 0; i < st.length; i++) {
      const x = side * half * st[i];
      const z0 = -bodyL * 0.18 + sweep[i];
      lead.push([x, rise[i], z0]);
      trail.push([x, rise[i] * 0.80, z0 + chord[i]]);
    }
    membrane(B, lead, trail, mixc(body, light, 0.22), body, S * 0.011);
    chain(B, lead, S * 0.015, S * 0.006, body, dark, 5);

    // remiganti primarie: quattro, divaricate
    const nP = 5;
    for (let i = 0; i < nP; i++) {
      const t = i / (nP - 1);
      const root = [
        lerp(lead[3][0], trail[3][0], 0.10 + t * 0.55),
        lerp(lead[3][1], trail[3][1], 0.10 + t * 0.55),
        lerp(lead[3][2], trail[3][2], 0.10 + t * 0.55)
      ];
      /* Le primarie si aprono a ventaglio: la prima punta quasi in avanti,
       * l ultima quasi all indietro. E questa divaricazione a fare la mano
       * dell ala contro il cielo. */
      const tip = [
        side * half * (0.99 - t * 0.10),
        rise[3] * (1 - t * 0.35),
        -bodyL * 0.18 + sweep[3] + chord[3] * (0.10 + t * 0.35) + S * (0.055 + t * 0.135)
      ];
      feather(B, root, tip, S * 0.015, mixc(body, dark, 0.25), dark);
    }
  }
  return R.toGeometry();
}

function raptorMesh(rnd, tint) {
  return birdMesh(rnd, tint, { tailLen: 0.78, chord: 1.25, beak: lin(0xd8c060), beakLen: 0.02 });
}

/* Pterosauro: membrana tesa fra un dito lunghissimo e il fianco */
function pterosaurMesh(rnd, tint) {
  const R = new Rig(0.006, 0);
  const B = R.B;
  const S = 1.0;
  const body = tint, dark = cscale(tint, 0.48), light = mixc(tint, [1, 1, 1], 0.25);
  const memb = mixc(tint, [0.52, 0.40, 0.38], 0.5);
  const bodyL = S * 0.22;

  R.begin(P_BODY);
  chain(B, [[0, 0, -bodyL * 0.55], [0, S * 0.014, 0], [0, S * 0.004, bodyL * 0.70]],
    S * 0.030, S * 0.014, body, dark, 7);

  R.begin(P_HEAD, [0, S * 0.010, -bodyL * 0.52]);
  chain(B, [[0, S * 0.012, -bodyL * 0.55], [0, S * 0.020, -bodyL * 1.00], [0, S * 0.012, -bodyL * 1.80]],
    S * 0.026, S * 0.003, body, light, 6);
  const cr = [
    [0, S * 0.028, -bodyL * 0.70], [0, S * 0.110, -bodyL * 1.00],
    [0, S * 0.096, -bodyL * 1.28], [0, S * 0.024, -bodyL * 1.16]
  ];
  B.quad(cr[0], cr[1], cr[2], cr[3], dark, mixc(body, [1, 1, 1], 0.3), body, dark, 0, 0, 0, 0);
  B.quad(cr[3], cr[2], cr[1], cr[0], dark, body, mixc(body, [1, 1, 1], 0.3), dark, 0, 0, 0, 0);

  R.begin(P_TAIL, [0, 0, bodyL * 0.62]);
  chain(B, [[0, S * 0.004, bodyL * 0.62], [0, -S * 0.004, bodyL * 1.05]], S * 0.011, S * 0.003, body, dark, 5);

  for (const side of [-1, 1]) {
    R.begin(side < 0 ? P_WING_L : P_WING_R, [side * S * 0.028, S * 0.008, -bodyL * 0.18]);
    const half = S * 0.5;
    const st = [0.08, 0.36, 0.66, 0.95];
    const sweep = [-0.015, -0.050, -0.020, 0.070].map(v => v * S);
    const rise = [0.010, 0.030, 0.026, 0.008].map(v => v * S);
    const lead = [], trail = [];
    for (let i = 0; i < st.length; i++) {
      const x = side * half * st[i];
      lead.push([x, rise[i], sweep[i]]);
      // il bordo d uscita rientra verso il fianco: e questo a fare la membrana
      trail.push([x, rise[i] * 0.55, lerp(bodyL * 0.60, S * 0.09, st[i])]);
    }
    membrane(B, lead, trail, memb, cscale(memb, 0.78), S * 0.009);
    chain(B, lead, S * 0.013, S * 0.004, body, dark, 5);
  }
  return R.toGeometry();
}

/* ------------------------------------------------------------------ *
 * FARFALLA — quattro ali con il diedro
 * ------------------------------------------------------------------ */
function butterflyMesh(rnd, tint) {
  const R = new Rig(0, 0);
  const B = R.B;
  const S = 1.0;
  const bodyC = lin(0x181410);
  R.begin(P_BODY);
  chain(B, [[0, 0, -S * 0.15], [0, 0, 0], [0, 0, S * 0.19]], S * 0.018, S * 0.009, bodyC, bodyC, 5);
  for (const s of [-1, 1]) {
    chain(B, [[s * S * 0.005, 0, -S * 0.14], [s * S * 0.045, S * 0.045, -S * 0.26]], S * 0.0035, S * 0.0015, bodyC, bodyC, 4);
  }
  const light = mixc(tint, [1, 1, 1], 0.40), dark = cscale(tint, 0.40);
  const dih = 0.28;
  for (const side of [-1, 1]) {
    R.begin(side < 0 ? P_WING_L : P_WING_R, [0, 0, 0]);
    const Y = (x) => Math.abs(x) * dih;
    const fw = [
      [0, 0, -S * 0.12],
      [side * S * 0.22, Y(S * 0.22), -S * 0.25],
      [side * S * 0.45, Y(S * 0.45), -S * 0.09],
      [side * S * 0.29, Y(S * 0.29), S * 0.04],
      [0, 0, S * 0.02]
    ];
    for (let i = 1; i < fw.length - 1; i++) {
      B.tri(fw[0], fw[i], fw[i + 1], tint, light, dark, 0, 0, 0);
      B.tri(fw[i + 1], fw[i], fw[0], dark, light, tint, 0, 0, 0);
    }
    const hw = [
      [0, 0, S * 0.02],
      [side * S * 0.25, Y(S * 0.25), S * 0.06],
      [side * S * 0.30, Y(S * 0.30), S * 0.23],
      [side * S * 0.11, Y(S * 0.11), S * 0.27]
    ];
    for (let i = 1; i < hw.length - 1; i++) {
      B.tri(hw[0], hw[i], hw[i + 1], dark, tint, light, 0, 0, 0);
      B.tri(hw[i + 1], hw[i], hw[0], light, tint, dark, 0, 0, 0);
    }
  }
  return R.toGeometry();
}

/* ------------------------------------------------------------------ *
 * QUADRUPEDE — zampe a due segmenti
 * ------------------------------------------------------------------ */
function quadrupedMesh(rnd, tint, opts = {}) {
  const R = new Rig(opts.bob !== undefined ? opts.bob : 0.020, opts.sway || 0.006);
  const B = R.B;
  const H = 1.0;
  const body = tint, dark = cscale(tint, 0.55), light = mixc(tint, [1, 1, 1], 0.26);
  const legC = cscale(tint, opts.legDark || 0.46);
  const bodyY = H * (opts.bodyY || 0.62);
  const bodyR = H * (opts.bodyR || 0.19);
  const bodyL = H * (opts.bodyL || 0.58);

  R.begin(P_BODY);
  blob(B, { cx: 0, cy: bodyY, cz: 0, rx: bodyR, ry: bodyR * 0.98, rz: bodyL, level: 1, rough: 0.08, rnd, colTop: body, colBot: dark, flex: 0 });
  if (opts.hump) {
    blob(B, {
      cx: 0, cy: bodyY + bodyR * opts.hump, cz: -bodyL * 0.26,
      rx: bodyR * 0.84, ry: bodyR * 0.62, rz: bodyL * 0.48, level: 0, rough: 0.17, rnd,
      colTop: light, colBot: body, flex: 0
    });
  } else {
    blob(B, { cx: 0, cy: bodyY + H * 0.025, cz: bodyL * 0.40, rx: bodyR * 0.90, ry: bodyR * 0.84, rz: bodyL * 0.36, level: 0, rough: 0.10, rnd, colTop: body, colBot: dark, flex: 0 });
  }

  const neckBase = [0, bodyY + H * 0.02, -bodyL * 0.60];
  R.begin(P_HEAD, neckBase);
  const nk = opts.neck || 0.30, nf = opts.neckFwd || 0.45;
  const headP = [0, bodyY + H * nk, -bodyL * (0.60 + nf)];
  chain(B, [neckBase, [0, bodyY + H * nk * 0.62, -bodyL * (0.60 + nf * 0.55)], headP],
    H * (opts.neckR || 0.072), H * (opts.neckR || 0.072) * 0.74, dark, body, 7);
  blob(B, {
    cx: 0, cy: headP[1] + H * 0.015, cz: headP[2] - H * 0.04,
    rx: H * (opts.headR || 0.066), ry: H * (opts.headR || 0.070), rz: H * (opts.headR || 0.066) * 1.9,
    level: 1, rough: 0.07, rnd, colTop: light, colBot: body, flex: 0
  });
  for (const s of [-1, 1]) {
    B.tri([s * H * 0.050, headP[1] + H * 0.065, headP[2] + H * 0.010],
      [s * H * 0.110, headP[1] + H * 0.135, headP[2] + H * 0.045],
      [s * H * 0.042, headP[1] + H * 0.105, headP[2] - H * 0.035], light, body, body, 0, 0, 0);
  }
  if (opts.antlers) {
    const ac = lin(0x8a7050);
    for (const s of [-1, 1]) {
      let p = [s * H * 0.042, headP[1] + H * 0.085, headP[2] + H * 0.02];
      for (let i = 0; i < 3; i++) {
        const q = [p[0] + s * H * (0.052 + i * 0.028), p[1] + H * (0.110 - i * 0.018), p[2] + H * (0.032 + i * 0.018)];
        chain(B, [p, q], H * (0.015 - i * 0.003), H * (0.011 - i * 0.003), ac, ac, 4);
        chain(B, [q, [q[0] + s * H * 0.055, q[1] + H * 0.065, q[2] - H * 0.018]], H * 0.009, H * 0.004, ac, ac, 4);
        p = q;
      }
    }
  }

  if (opts.trunk) {
    R.begin(P_TAIL, [0, headP[1] - H * 0.02, headP[2] - H * 0.09]);
    const tr = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      tr.push([0, headP[1] - H * (0.02 + t * 0.50 - t * t * 0.11), headP[2] - H * (0.09 + t * 0.15)]);
    }
    chain(B, tr, H * 0.050, H * 0.017, body, dark, 6);
    const tusk = lin(0xd8cdb0);
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, a = t * 2.5;
        pts.push([s * (H * 0.052 + Math.sin(a) * H * 0.155),
        headP[1] - H * 0.055 - Math.sin(a * 0.8) * H * 0.135 + t * H * 0.085,
        headP[2] - H * (0.15 + t * 0.28)]);
      }
      chain(B, pts, H * 0.027, H * 0.008, tusk, mixc(tusk, [1, 1, 1], 0.3), 5);
    }
  } else {
    R.begin(P_TAIL, [0, bodyY + H * 0.05, bodyL * 0.86]);
    const tl = opts.tail === undefined ? 0.18 : opts.tail;
    if (tl > 0.01) {
      const pts = [];
      const n = tl > 0.5 ? 6 : 2;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([0, bodyY + H * (0.05 - t * tl * (tl > 0.5 ? 0.30 : 1.0)), bodyL * 0.86 + H * tl * t * (tl > 0.5 ? 1.6 : 0.6)]);
      }
      chain(B, pts, H * (opts.tailR || 0.026), H * (opts.tailR || 0.026) * 0.18, body, light, 6);
    }
  }

  const hipY = bodyY - bodyR * 0.45;
  const kneeY = H * (opts.knee || 0.30);
  /* Un teropode cammina su due zampe e tiene la coda come contrappeso: le
   * anteriori diventano due braccia corte, non zampe. */
  const legs = opts.bipedal ? [
    [P_LEG_BL, P_SHIN_BL, -bodyR * 0.60, bodyL * 0.10],
    [P_LEG_BR, P_SHIN_BR, bodyR * 0.60, bodyL * 0.10]
  ] : [
    [P_LEG_FL, P_SHIN_FL, -bodyR * 0.62, -bodyL * 0.52],
    [P_LEG_FR, P_SHIN_FR, bodyR * 0.62, -bodyL * 0.52],
    [P_LEG_BL, P_SHIN_BL, -bodyR * 0.66, bodyL * 0.54],
    [P_LEG_BR, P_SHIN_BR, bodyR * 0.66, bodyL * 0.54]
  ];
  if (opts.bipedal) {
    for (const s of [-1, 1]) {
      R.begin(s < 0 ? P_LEG_FL : P_LEG_FR, [s * bodyR * 0.55, bodyY - bodyR * 0.10, -bodyL * 0.42]);
      chain(B, [
        [s * bodyR * 0.55, bodyY - bodyR * 0.10, -bodyL * 0.42],
        [s * bodyR * 0.85, bodyY - bodyR * 0.60, -bodyL * 0.58],
        [s * bodyR * 0.80, bodyY - bodyR * 0.95, -bodyL * 0.42]
      ], H * 0.028, H * 0.013, cscale(tint, 0.62), cscale(tint, 0.5), 5);
    }
  }
  const r0 = H * (opts.legR || 0.046), r1 = r0 * 0.64;
  for (const [up, lo, lx, lz] of legs) {
    R.begin(up, [lx, hipY, lz]);
    tube(B, [lx, hipY, lz], [lx, kneeY, lz], r0, r1 * 1.15, legC, cscale(legC, 0.9), 6);
    R.begin(lo, [lx, kneeY, lz]);
    tube(B, [lx, kneeY, lz], [lx, H * 0.045, lz], r1 * 1.15, r1 * 0.82, cscale(legC, 0.9), cscale(legC, 0.72), 6);
    tube(B, [lx, H * 0.048, lz], [lx, 0, lz - H * 0.012], r1 * 0.92, r1 * 0.8, cscale(legC, 0.5), cscale(legC, 0.35), 6);
  }
  return R.toGeometry();
}

/* ------------------------------------------------------------------ *
 * PESCE — tutto il corpo sul canale dell onda, perno sul muso
 * ------------------------------------------------------------------ */
function fishMesh(rnd, tint) {
  const R = new Rig(0, 0);
  const B = R.B;
  const L = 1.0;
  const body = tint, belly = mixc(tint, [1, 1, 1], 0.52), dark = cscale(tint, 0.42);
  const nose = [0, 0, -L * 0.50];
  R.begin(P_TAIL, nose);
  blob(B, { cx: 0, cy: 0, cz: -L * 0.12, rx: L * 0.095, ry: L * 0.17, rz: L * 0.33, level: 1, rough: 0.06, rnd, colTop: dark, colBot: belly, flex: 0 });
  chain(B, [[0, 0, L * 0.14], [0, 0, L * 0.40]], L * 0.070, L * 0.020, body, dark, 7);
  B.tri([0, L * 0.15, -L * 0.17], [0, L * 0.32, L * 0.01], [0, L * 0.13, L * 0.17], dark, body, dark, 0, 0, 0);
  B.tri([0, L * 0.13, L * 0.17], [0, L * 0.32, L * 0.01], [0, L * 0.15, -L * 0.17], dark, body, dark, 0, 0, 0);
  for (const s of [-1, 1]) {
    B.tri([s * L * 0.075, -L * 0.02, -L * 0.17], [s * L * 0.21, -L * 0.085, 0], [s * L * 0.075, -L * 0.075, L * 0.02], body, belly, body, 0, 0, 0);
    B.tri([s * L * 0.075, -L * 0.075, L * 0.02], [s * L * 0.21, -L * 0.085, 0], [s * L * 0.075, -L * 0.02, -L * 0.17], body, belly, body, 0, 0, 0);
  }
  const c0 = [0, 0, L * 0.40];
  B.tri(c0, [0, L * 0.23, L * 0.60], [0, -L * 0.21, L * 0.58], dark, body, body, 0, 0, 0);
  B.tri([0, -L * 0.21, L * 0.58], [0, L * 0.23, L * 0.60], c0, body, body, dark, 0, 0, 0);
  return R.toGeometry();
}

/* --- medusa --- */
function jellyMesh(rnd, tint) {
  const R = new Rig(0, 0);
  const B = R.B;
  const top = mixc(tint, [1, 1, 1], 0.45), bot = cscale(tint, 0.5);
  R.begin(P_BODY);
  const seg = 14, rim = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * 6.28318;
    const w = 1 + 0.10 * Math.sin(a * 4);
    rim.push([Math.cos(a) * 0.32 * w, 0, Math.sin(a) * 0.32 * w]);
  }
  const apex = [0, 0.34, 0];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    B.tri(rim[i], rim[j], apex, bot, bot, top, 0, 0, 0);
    B.tri(rim[j], rim[i], [0, 0.07, 0], top, top, cscale(top, 1.15), 0, 0, 0);
  }
  R.begin(P_TAIL, [0, 0, 0]);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * 6.28318 + rnd();
    blade(B, {
      x: Math.cos(a) * 0.22, y: 0, z: Math.sin(a) * 0.22,
      dir: a, len: 0.55 + rnd() * 0.45, wid: 0.014, seg: 4,
      bend: 0.10, lift: -0.96, colBase: top, colTip: mixc(top, [1, 1, 1], 0.45),
      flexMax: 1, taper: 1.2
    });
  }
  return R.toGeometry();
}

/* ------------------------------------------------------------------ *
 * Registro. axis dice su quale asse si normalizza la taglia:
 * 'span' apertura alare (X), 'len' lunghezza (Z), 'h' altezza (Y).
 * ------------------------------------------------------------------ */
export const CREATURES = {
  bird: { build: birdMesh, size: 0.50, axis: 'span', mode: 'flock', flap: 0.72, gait: 9.5, speed: [6, 10], glideBias: 0.18 },
  raptor: { build: raptorMesh, size: 1.60, axis: 'span', mode: 'flock', flap: 0.46, gait: 2.0, speed: [7, 12], glideBias: 0.82 },
  pterosaur: { build: pterosaurMesh, size: 4.6, axis: 'span', mode: 'flock', flap: 0.40, gait: 1.5, speed: [8, 13], glideBias: 0.72 },
  butterfly: { build: butterflyMesh, size: 0.085, axis: 'span', mode: 'flutter', flap: 1.20, gait: 12.0 },
  fish: { build: fishMesh, size: 0.34, axis: 'len', mode: 'water', flap: 0.30, gait: 5.5 },
  bigFish: { build: fishMesh, size: 1.9, axis: 'len', mode: 'water', flap: 0.20, gait: 2.4 },
  jelly: { build: jellyMesh, size: 1.4, axis: 'h', mode: 'drift', flap: 0.40, gait: 1.2 },

  deer: {
    build: (r, t) => quadrupedMesh(r, t, { antlers: true, neck: 0.30, neckFwd: 0.42, tail: 0.14 }),
    size: 1.40, axis: 'h', mode: 'ground', flap: 0.60, gait: 4.4
  },
  antelope: {
    build: (r, t) => quadrupedMesh(r, t, { neck: 0.24, neckFwd: 0.38, tail: 0.16, legR: 0.042, bodyR: 0.175 }),
    size: 1.20, axis: 'h', mode: 'ground', flap: 0.66, gait: 5.0
  },
  sauropod: {
    build: (r, t) => quadrupedMesh(r, t, {
      neck: 1.45, neckFwd: 1.25, neckR: 0.090, headR: 0.052, tail: 1.05, tailR: 0.105,
      bodyR: 0.325, bodyL: 0.62, bodyY: 0.52, legR: 0.115, knee: 0.26, bob: 0.008, sway: 0.010
    }), size: 12.0, axis: 'h', mode: 'ground', flap: 0.18, gait: 1.3
  },
  biped: {
    build: (r, t) => quadrupedMesh(r, t, {
      bipedal: true,
      neck: 0.16, neckFwd: 0.68, neckR: 0.078, headR: 0.090,
      bodyR: 0.215, bodyL: 0.44, bodyY: 0.68,
      legR: 0.105, knee: 0.34, tail: 1.05, tailR: 0.100, bob: 0.030
    }), size: 3.8, axis: 'h', mode: 'ground', flap: 0.46, gait: 3.0
  },
  mammoth: {
    build: (r, t) => quadrupedMesh(r, t, {
      trunk: true, hump: 0.82, neck: 0.20, neckFwd: 0.26, neckR: 0.108, headR: 0.125,
      bodyR: 0.27, bodyL: 0.44, bodyY: 0.60, legR: 0.088, knee: 0.30, bob: 0.012, sway: 0.012
    }), size: 3.5, axis: 'h', mode: 'ground', flap: 0.22, gait: 1.9
  }
};

/* ------------------------------------------------------------------ *
 * Fauna
 * ------------------------------------------------------------------ */
export class Fauna {
  constructor(world, fog, biome, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.biome = biome;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.qualityMul = opts.quality || 1;

    this.uniforms = {
      uTime: { value: 0 },
      uSnow: { value: 0 },
      uSnowColor: { value: new THREE.Color(0.9, 0.93, 1.0) },
      uWetness: { value: 0 }
    };
    this.matCache = new Map();
    this.kinds = [];
    this.stats = { agents: 0 };
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._build(opts);
  }

  _material(emissive) {
    const key = emissive > 0 ? emissive.toFixed(2) : '0';
    if (this.matCache.has(key)) return this.matCache.get(key);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide
    });
    mat.shadowSide = THREE.FrontSide;
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      for (const k in U) shader.uniforms[k] = U[k];
      shader.uniforms.uEmissive = { value: emissive || 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          in float aPart;
          in vec3 aPivot;
          in vec2 aRig;       // ondeggio verticale, ondeggio laterale
          in vec4 aAnim;      // fase, frequenza, ampiezza, planata
          out vec3 vFaunaNrm;
          uniform float uTime;

          /* Rotazione di Rodrigues attorno a un perno: e tutto lo scheletro che
           * serve. Nessun osso, nessun fotogramma chiave. */
          vec3 altRot(vec3 p, vec3 pivot, vec3 axis, float ang){
            vec3 v = p - pivot;
            float c = cos(ang), s = sin(ang);
            return pivot + v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
          }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float t = uTime * aAnim.y + aAnim.x;
            float amp = aAnim.z;
            float glide = aAnim.w;

            if (aPart > 0.5 && aPart < 2.5){
              /* Ala. La battuta non e una sinusoide: la discesa e rapida e
               * potente, la risalita lenta. In planata l ala resta ferma su un
               * diedro leggero. E la punta arriva dopo la spalla, per questo
               * c e una torsione proporzionale alla distanza dal corpo. */
              float sgn = aPart < 1.5 ? 1.0 : -1.0;
              float w = sin(t);
              w = w > 0.0 ? pow(w, 0.62) : -pow(-w, 1.55);
              float ang = amp * w * (1.0 - glide) + glide * 0.14;
              float span = abs(transformed.x - aPivot.x);
              ang += amp * 0.40 * (1.0 - glide) * sin(t - 1.0) * span * 1.8;
              transformed = altRot(transformed, aPivot, vec3(0.0, 0.0, 1.0), sgn * ang);
            } else if (aPart > 2.5 && aPart < 6.5){
              // femore: le diagonali vanno in fase, come nel passo vero
              float k = aPart - 3.0;
              float ph = (k < 0.5 || k > 2.5) ? 0.0 : 3.14159265;
              transformed = altRot(transformed, aPivot, vec3(1.0, 0.0, 0.0), amp * sin(t + ph));
            } else if (aPart > 8.5){
              /* Tibia: contro-ruota rispetto al femore e sfasata. E quello che
               * tiene il piede quasi orizzontale invece di farlo calciare come
               * la lancetta di un compasso. */
              float k = aPart - 9.0;
              float ph = (k < 0.5 || k > 2.5) ? 0.0 : 3.14159265;
              float th = t + ph;
              float bend = amp * (0.5 * sin(th) - 0.8 * max(0.0, sin(th - 1.5)));
              transformed = altRot(transformed, aPivot, vec3(1.0, 0.0, 0.0), -bend);
            } else if (aPart > 6.5 && aPart < 7.5){
              // testa: contro-oscilla rispetto al corpo e si guarda intorno
              transformed = altRot(transformed, aPivot, vec3(1.0, 0.0, 0.0), -0.10 * amp * sin(t * 2.0));
              transformed = altRot(transformed, aPivot, vec3(0.0, 1.0, 0.0), 0.06 * sin(t * 0.31));
            } else if (aPart > 7.5){
              // coda, proboscide, tentacoli, corpo del pesce: onda che scorre
              float d = length(transformed - aPivot);
              transformed = altRot(transformed, aPivot, vec3(0.0, 1.0, 0.0),
                                   amp * 0.85 * sin(t * 1.25 - d * 2.0));
            }

            // ondeggio dell intero animale, sincronizzato col passo
            transformed.y += aRig.x * amp * sin(t * 2.0);
            transformed.x += aRig.y * amp * sin(t);
          }
          #ifdef USE_INSTANCING
            vFaunaNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          #else
            vFaunaNrm = normalize(mat3(modelMatrix) * objectNormal);
          #endif`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in vec3 vFaunaNrm;
          uniform float uSnow, uWetness, uEmissive;
          uniform vec3 uSnowColor;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float up = clamp(vFaunaNrm.y * 0.5 + 0.5, 0.0, 1.0);
            float sn = clamp(uSnow * 1.1 - 0.35, 0.0, 1.0) * pow(up, 3.5);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, sn * 0.55);
            diffuseColor.rgb *= mix(1.0, 0.80, uWetness * 0.5);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * uEmissive * 0.9;`);
    };
    mat.customProgramCacheKey = () => 'altrove-fauna2|' + key;
    this.fog.apply(mat);
    this.matCache.set(key, mat);
    return mat;
  }

  _build(opts) {
    const list = this.biome.fauna || [];
    const rnd = mulberry32((this.world.seed * 31337 + 7) >>> 0);
    for (const rule of list) {
      const def = CREATURES[rule.type];
      if (!def) continue;
      const count = Math.max(1, Math.round(rule.count * this.qualityMul));
      const nVar = rule.variants || 2;
      const meshes = [], geos = [];
      const mat = this._material(rule.emissive || 0);
      const tintA = lin(rule.tint[0]), tintB = lin(rule.tint[1]);

      for (let v = 0; v < nVar; v++) {
        const t = nVar === 1 ? 0.5 : v / (nVar - 1);
        const tint = [lerp(tintA[0], tintB[0], t), lerp(tintA[1], tintB[1], t), lerp(tintA[2], tintB[2], t)];
        const geo = def.build(rnd, tint);

        /* Normalizzazione sull asse dichiarato. Misurare un uccello ad ali
         * aperte sull altezza e il modo piu rapido per ottenere un condor. */
        const pos = geo.attributes.position.array;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < pos.length; i += 3) {
          if (pos[i] < minX) minX = pos[i]; if (pos[i] > maxX) maxX = pos[i];
          if (pos[i + 1] < minY) minY = pos[i + 1]; if (pos[i + 1] > maxY) maxY = pos[i + 1];
          if (pos[i + 2] < minZ) minZ = pos[i + 2]; if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
        }
        const cur = def.axis === 'span' ? (maxX - minX)
          : def.axis === 'len' ? (maxZ - minZ) : (maxY - minY);
        const k = cur > 1e-5 ? def.size / cur : 1;
        const pv = geo.attributes.aPivot.array;
        const rig = geo.attributes.aRig.array;
        for (let i = 0; i < pos.length; i++) pos[i] *= k;
        for (let i = 0; i < pv.length; i++) pv[i] *= k;
        for (let i = 0; i < rig.length; i++) rig[i] *= k;
        if (def.mode === 'ground') {
          const off = -minY * k;
          for (let i = 1; i < pos.length; i += 3) pos[i] += off;
          for (let i = 1; i < pv.length; i += 3) pv[i] += off;
        }
        geo.computeBoundingSphere();

        const per = Math.ceil(count / nVar) + 2;
        const im = new THREE.InstancedMesh(geo, mat, per);
        im.count = 0;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = !!rule.shadow;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.matrixAutoUpdate = false;
        im.renderOrder = 1;
        const anim = new THREE.InstancedBufferAttribute(new Float32Array(per * 4), 4);
        anim.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', anim);
        this.group.add(im);
        meshes.push(im); geos.push(geo);
      }

      const agents = [];
      for (let i = 0; i < count; i++) {
        agents.push({
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
          hd: rnd() * 6.28318, pitch: 0, bank: 0, sp: 0,
          phase: rnd() * 6.28318, v: Math.floor(rnd() * nVar),
          sc: lerp(rule.scale[0], rule.scale[1], rnd()),
          tx: 0, tz: 0, timer: rnd() * 5, state: 0, hOff: rnd(),
          cx: 0, cz: 0, orbA: rnd() * 6.28318, orbR: 6, orbit: 0.6 + rnd() * 0.8,
          glide: 0, alive: false
        });
      }
      this.kinds.push({ rule, def, meshes, geos, agents, nVar, count });
    }
  }

  /* ------------------------------------------------------------------ */
  update(camera, dt, time, waterLevel) {
    this.uniforms.uTime.value = time;
    dt = Math.min(dt, 0.05);
    const cx = camera.position.x, cz = camera.position.z;
    let total = 0;

    for (const K of this.kinds) {
      const mode = K.rule.mode || K.def.mode;
      for (const a of K.agents) if (!a.alive) this._spawn(a, K, cx, cz, mode, waterLevel);
      if (mode === 'flock') this._flock(K, dt, time, cx, cz);
      else for (const a of K.agents) { if (a.alive) this._simple(a, K, mode, dt, time, waterLevel); }

      const R = K.rule.radius;
      for (const a of K.agents) {
        const dx = a.x - cx, dz = a.z - cz;
        if (dx * dx + dz * dz > R * R * 1.3) a.alive = false;
      }
      total += this._pack(K);
    }
    this.stats.agents = total;
  }

  /* Boids. Tre regole e nient altro: stai lontano dai vicini, vai nella loro
   * stessa direzione, resta vicino al gruppo. La forma dello stormo, le virate
   * collettive e le code che si staccano vengono da se. */
  _flock(K, dt, time, camX, camZ) {
    const rule = K.rule, def = K.def;
    const list = K.agents;
    const spd = rule.speed || def.speed || [6, 10];
    const sepR = rule.sep || def.size * 4.0;
    const sepR2 = sepR * sepR;
    const nearR2 = (sepR * 5) * (sepR * 5);

    K.wa = (K.wa || 0) + dt * 0.13;
    const tx = camX + Math.cos(K.wa * 0.8) * rule.radius * 0.34 + Math.cos(K.wa * 2.3) * rule.radius * 0.12;
    const tz = camZ + Math.sin(K.wa * 0.62) * rule.radius * 0.34 + Math.sin(K.wa * 1.9) * rule.radius * 0.12;

    for (const a of list) {
      if (!a.alive) continue;
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0, n = 0;
      for (const b of list) {
        if (b === a || !b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > nearR2 || d2 < 1e-6) continue;
        if (d2 < sepR2) { const w = 1 / d2; sx -= dx * w; sy -= dy * w; sz -= dz * w; }
        ax += b.vx; ay += b.vy; az += b.vz;
        gx += b.x; gy += b.y; gz += b.z;
        n++;
      }
      let fx = 0, fy = 0, fz = 0;
      if (n > 0) {
        const inv = 1 / n;
        fx += sx * 14; fy += sy * 14; fz += sz * 14;
        fx += (ax * inv - a.vx) * 1.5; fy += (ay * inv - a.vy) * 1.5; fz += (az * inv - a.vz) * 1.5;
        fx += (gx * inv - a.x) * 0.36; fy += (gy * inv - a.y) * 0.36; fz += (gz * inv - a.z) * 0.36;
      }
      fx += (tx - a.x) * 0.10;
      fz += (tz - a.z) * 0.10;
      const wantY = this.world.height(a.x, a.z) + lerp(rule.y[0], rule.y[1], a.hOff);
      fy += (wantY - a.y) * 0.60;
      // un po di capriccio, se no volano su binari
      fx += Math.sin(time * 0.7 + a.phase) * 1.8;
      fz += Math.cos(time * 0.53 + a.phase * 1.7) * 1.8;
      fy += Math.sin(time * 0.9 + a.phase * 2.1) * 0.9;

      a.vx += fx * dt; a.vy += fy * dt; a.vz += fz * dt;
      const sp = Math.hypot(a.vx, a.vy, a.vz) || 1e-4;
      const want = clamp(sp, spd[0], spd[1]);
      const kk = want / sp;
      a.vx *= kk; a.vy *= kk; a.vz *= kk;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;

      const prev = a.hd;
      a.hd = Math.atan2(a.vx, a.vz);
      let turn = a.hd - prev;
      while (turn > Math.PI) turn -= 6.28318;
      while (turn < -Math.PI) turn += 6.28318;
      // chi vira si inclina: senza rollio sembra un aeroplanino di carta
      const wantBank = clamp(turn / Math.max(dt, 1e-3) * 0.20, -1.0, 1.0);
      a.bank += (wantBank - a.bank) * (1 - Math.exp(-dt * 5));
      a.pitch += (clamp(-a.vy / want, -0.5, 0.5) * 0.65 - a.pitch) * (1 - Math.exp(-dt * 4));
      a.sp = want;

      /* Battuta e planata. Un passero batte quasi sempre, una poiana quasi
       * mai: la differenza sta tutta in questo scarto, non nella forma. */
      const bias = def.glideBias !== undefined ? def.glideBias : 0.35;
      const climb = clamp(a.vy * 0.5 + (1 - bias), 0, 1);
      a.glide += ((1 - climb) - a.glide) * (1 - Math.exp(-dt * 2.4));
    }
  }

  _simple(a, K, mode, dt, time, waterLevel) {
    const rule = K.rule;
    const world = this.world;

    if (mode === 'ground') {
      a.timer -= dt;
      if (a.state === 0) {
        const dx = a.tx - a.x, dz = a.tz - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.6 || a.timer <= 0) { a.state = 1; a.timer = 4 + Math.random() * 9; }
        else {
          const want = Math.atan2(dx, dz);
          let diff = want - a.hd;
          while (diff > Math.PI) diff -= 6.28318;
          while (diff < -Math.PI) diff += 6.28318;
          const turn = clamp(diff, -1.5 * dt, 1.5 * dt);
          a.hd += turn;
          a.bank += (clamp(turn / Math.max(dt, 1e-3) * 0.08, -0.22, 0.22) - a.bank) * (1 - Math.exp(-dt * 4));
          const target = rule.speed ? lerp(rule.speed[0], rule.speed[1], a.hOff) : 1.5;
          a.sp += (target - a.sp) * (1 - Math.exp(-dt * 1.8));
          a.x += Math.sin(a.hd) * a.sp * dt;
          a.z += Math.cos(a.hd) * a.sp * dt;
        }
      } else {
        a.sp *= Math.exp(-dt * 2.6);
        a.bank *= Math.exp(-dt * 3);
        if (a.timer <= 0) {
          a.state = 0; a.timer = 10 + Math.random() * 16;
          const ang = Math.random() * 6.28318, rr = 10 + Math.random() * 55;
          a.tx = a.x + Math.cos(ang) * rr;
          a.tz = a.z + Math.sin(ang) * rr;
        }
      }
      const g = world.height(a.x, a.z);
      a.y += (g - a.y) * (1 - Math.exp(-dt * 12));

    } else if (mode === 'flutter') {
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = 0.5 + Math.random() * 1.3;
        a.hd = Math.random() * 6.28318;
        a.sp = 0.5 + Math.random() * 1.5;
      }
      a.x += Math.sin(a.hd) * a.sp * dt;
      a.z += Math.cos(a.hd) * a.sp * dt;
      const g = world.height(a.x, a.z);
      a.y = g + lerp(rule.y[0], rule.y[1], a.hOff) + Math.sin(time * 2.4 + a.phase) * 0.30;
      a.bank = Math.sin(time * 3.1 + a.phase) * 0.35;

    } else if (mode === 'water') {
      a.orbA += dt * a.orbit * 0.34;
      const nx = a.cx + Math.cos(a.orbA) * a.orbR;
      const nz = a.cz + Math.sin(a.orbA) * a.orbR;
      a.hd = Math.atan2(nx - a.x, nz - a.z);
      a.x = nx; a.z = nz;
      const bed = world.height(a.x, a.z);
      const wl = (waterLevel !== null && waterLevel !== undefined) ? waterLevel : 0;
      const depth = wl - bed;
      if (depth < 0.6) { a.alive = false; return; }
      a.y = clamp(bed + depth * (0.25 + 0.55 * a.hOff) + Math.sin(time * 0.6 + a.phase) * 0.35, bed + 0.3, wl - 0.35);
      a.bank = 0.14 * Math.sin(time * 0.8 + a.phase);
      a.sp = 2;

    } else if (mode === 'drift') {
      a.hd += (Math.random() - 0.5) * dt * 0.5;
      a.x += Math.sin(a.hd) * 0.30 * dt;
      a.z += Math.cos(a.hd) * 0.30 * dt;
      const g = world.height(a.x, a.z);
      a.y = g + lerp(rule.y[0], rule.y[1], a.hOff) + Math.sin(time * 0.32 + a.phase) * 1.8;
      a.sp = 0.4;
    }
  }

  _spawn(a, K, cx, cz, mode, waterLevel) {
    const world = this.world;
    const R = K.rule.radius;
    for (let att = 0; att < 24; att++) {
      const ang = Math.random() * 6.28318;
      const rr = (mode === 'flock' || mode === 'drift') ? (0.15 + Math.random() * 0.6) * R
        : (0.30 + Math.random() * 0.65) * R;
      const x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr;
      const h = world.height(x, z);
      const wl = (waterLevel !== null && waterLevel !== undefined) ? waterLevel : -1e9;

      if (mode === 'water') {
        if (wl - h < 1.5) continue;
        a.cx = x; a.cz = z;
        a.orbR = 4 + Math.random() * 16;
        a.orbA = Math.random() * 6.28318;
      } else if (mode === 'ground' && world.hasWater && h < wl + 0.4) {
        continue;
      }
      if (world.blocked && world.blocked(x, z)) continue;

      a.x = x; a.z = z;
      a.y = (mode === 'flock') ? h + lerp(K.rule.y[0], K.rule.y[1], a.hOff) : h;
      a.tx = x; a.tz = z;
      const sp0 = K.rule.speed || K.def.speed || [6, 10];
      const s0 = lerp(sp0[0], sp0[1], Math.random());
      a.hd = Math.random() * 6.28318;
      a.vx = Math.sin(a.hd) * s0; a.vz = Math.cos(a.hd) * s0; a.vy = 0;
      a.timer = Math.random() * 4;
      a.state = 1;
      a.alive = true;
      return;
    }
    a.alive = false;
  }

  _pack(K) {
    const m = this._m, q = this._q, e = this._e, p = this._p, s = this._s;
    const ground = (K.rule.mode || K.def.mode) === 'ground';
    let n = 0;
    for (let v = 0; v < K.nVar; v++) {
      const im = K.meshes[v];
      const arr = im.instanceMatrix.array;
      const anim = im.geometry.attributes.aAnim.array;
      let k = 0;
      for (const a of K.agents) {
        if (!a.alive || a.v !== v) continue;
        if (k >= im.instanceMatrix.count) break;
        p.set(a.x, a.y, a.z);
        /* Il modello guarda verso -Z: per puntarlo lungo (sin hd, cos hd) serve
         * mezzo giro in piu. Sbagliare qui significa animali che vanno
         * all indietro, ed e esattamente quello che succedeva prima. */
        e.set(a.pitch || 0, a.hd + Math.PI, a.bank || 0, 'YXZ');
        q.setFromEuler(e);
        s.setScalar(a.sc);
        m.compose(p, q, s);
        m.toArray(arr, k * 16);

        const spN = ground ? clamp(a.sp / 1.6, 0, 2.0) : 1.0;
        anim[k * 4] = a.phase;
        anim[k * 4 + 1] = K.def.gait * (ground ? Math.max(0.22, spN) : 1.0);
        anim[k * 4 + 2] = K.def.flap * (ground ? clamp(spN, 0.0, 1.3) : 1.0);
        anim[k * 4 + 3] = a.glide || 0;
        k++;
      }
      im.count = k;
      im.instanceMatrix.needsUpdate = true;
      im.geometry.attributes.aAnim.needsUpdate = true;
      n += k;
    }
    return n;
  }

  setSnow(v, color) { this.uniforms.uSnow.value = v; if (color) this.uniforms.uSnowColor.value.copy(color); }
  setWetness(v) { this.uniforms.uWetness.value = v; }

  dispose() {
    for (const K of this.kinds) {
      K.meshes.forEach(m => { this.group.remove(m); m.dispose(); });
      K.geos.forEach(g => g.dispose());
    }
    this.matCache.forEach(m => m.dispose());
    this.kinds = [];
  }
}
