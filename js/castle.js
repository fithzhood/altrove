/* Altrove - castle.js
 * Il castello del collegio: torri, mura merlate, sala grande, ponte.
 *
 * Non e un modello: e una composizione di prismi generata dal seme. Cambiando
 * seme cambiano numero di torri, altezze e proporzioni, ma la pianta resta
 * riconoscibile - un cortile murato con le torri agli angoli e la sala grande
 * sul lato del lago.
 *
 * Il terreno sotto viene spianato da world.js: un castello su una collina
 * ondulata galleggerebbe da una parte e sprofonderebbe dall altra.
 */

import * as THREE from '../vendor/three.module.js';
import { mulberry32 } from './noise.js?v=28';
import { GLSL_NOISE } from './noise.js?v=28';
import { lin } from './props.js?v=28';

/* Costruttore: prismi a N lati, scatole, tetti conici e piramidali.
 * kind: 0 muro con finestre, 1 tetto, 2 pietra liscia, 3 emissivo */
class Keep {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; }

  tri(a, b, c, col, kind, nrm) {
    let nx, ny, nz;
    if (nrm) { [nx, ny, nz] = nrm; }
    else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    this.k.push(kind, kind, kind);
  }
  quad(a, b, c, d, col, kind, nrm) { this.tri(a, b, c, col, kind, nrm); this.tri(a, c, d, col, kind, nrm); }

  box(x0, y0, z0, x1, y1, z1, col, roofCol, kind) {
    const V = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    const F = [
      { i: [4, 5, 6, 7], n: [0, 1, 0], c: roofCol, k: 1, s: 1.05 },
      { i: [0, 1, 5, 4], n: [0, 0, -1], c: col, k: kind, s: 0.80 },
      { i: [2, 3, 7, 6], n: [0, 0, 1], c: col, k: kind, s: 0.80 },
      { i: [1, 2, 6, 5], n: [1, 0, 0], c: col, k: kind, s: 0.92 },
      { i: [3, 0, 4, 7], n: [-1, 0, 0], c: col, k: kind, s: 0.92 }
    ];
    for (const f of F) {
      const c2 = [f.c[0] * f.s, f.c[1] * f.s, f.c[2] * f.s];
      const q = f.i.map(ix => V[ix]);
      this.quad(q[0], q[1], q[2], q[3], c2, f.k, f.n);
    }
  }

  /* Prisma verticale a N lati, con o senza rastremazione */
  prism(cx, cz, r0, r1, y0, y1, seg, col, kind, twist = 0) {
    const A = [], B = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      A.push([cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0]);
      B.push([cx + Math.cos(a + twist) * r1, y1, cz + Math.sin(a + twist) * r1]);
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const sh = 0.78 + 0.26 * (0.5 + 0.5 * Math.cos((i / seg) * Math.PI * 2 + 0.9));
      const c2 = [col[0] * sh, col[1] * sh, col[2] * sh];
      this.quad(A[i], A[j], B[j], B[i], c2, kind);
    }
    return B;
  }

  cone(cx, cz, r, y0, h, seg, col) {
    const apex = [cx, y0 + h, cz];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const sh = 0.74 + 0.32 * (0.5 + 0.5 * Math.cos(a0 + 0.7));
      this.tri(p0, p1, apex, [col[0] * sh, col[1] * sh, col[2] * sh], 1);
    }
  }

  /* Tetto a due falde */
  gable(x0, z0, x1, z1, y0, h, col, alongX) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (alongX) {
      const rA = [x0, y0 + h, cz], rB = [x1, y0 + h, cz];
      this.quad([x0, y0, z0], [x1, y0, z0], rB, rA, [col[0] * 0.92, col[1] * 0.92, col[2] * 0.92], 1);
      this.quad([x1, y0, z1], [x0, y0, z1], rA, rB, [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78], 1);
      this.tri([x0, y0, z0], rA, [x0, y0, z1], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], 2);
      this.tri([x1, y0, z1], rB, [x1, y0, z0], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], 2);
    } else {
      const rA = [cx, y0 + h, z0], rB = [cx, y0 + h, z1];
      this.quad([x0, y0, z0], [x0, y0, z1], rB, rA, [col[0] * 0.92, col[1] * 0.92, col[2] * 0.92], 1);
      this.quad([x1, y0, z1], [x1, y0, z0], rA, rB, [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78], 1);
      this.tri([x0, y0, z0], rA, [x1, y0, z0], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], 2);
      this.tri([x1, y0, z1], rB, [x0, y0, z1], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], 2);
    }
  }

  /* Merli: la dentellatura che rende una muraglia una muraglia */
  crenels(x0, z0, x1, z1, y, h, t, col, rnd) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(2, Math.round(len / 2.2));
    const ux = dx / n, uz = dz / n;
    const px = -dz / len * t * 0.5, pz = dx / len * t * 0.5;
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const ax = x0 + ux * i, az = z0 + uz * i;
      const bx = x0 + ux * (i + 1), bz = z0 + uz * (i + 1);
      const q0 = [ax - px, y, az - pz], q1 = [bx - px, y, bz - pz];
      const q2 = [bx + px, y, bz + pz], q3 = [ax + px, y, az + pz];
      const up = (p) => [p[0], p[1] + h, p[2]];
      this.quad(q0, q1, q2, q3, col, 2, [0, -1, 0]);
      this.quad(up(q0), up(q3), up(q2), up(q1), [col[0] * 1.05, col[1] * 1.05, col[2] * 1.05], 2, [0, 1, 0]);
      this.quad(q0, up(q0), up(q1), q1, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85], 2);
      this.quad(q1, up(q1), up(q2), q2, [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9], 2);
      this.quad(q2, up(q2), up(q3), q3, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85], 2);
      this.quad(q3, up(q3), up(q0), q0, [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9], 2);
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.k, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export class Castle {
  constructor(world, fog, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.uniforms = {
      uNight: { value: 0 },
      uTime: { value: 0 },
      uWetness: { value: 0 },
      uSnow: { value: 0 },
      uSnowColor: { value: new THREE.Color(0.9, 0.93, 1.0) }
    };
    this.material = this._makeMaterial();
    this.mesh = new THREE.Mesh(this._build(), this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.group.add(this.mesh);

    // qualche fuoco alle finestre principali
    this.lights = [];
    for (const p of this.lightSpots.slice(0, 5)) {
      const l = new THREE.PointLight(0xffb066, 0, 40, 2);
      l.position.set(p[0], p[1], p[2]);
      this.group.add(l);
      this.lights.push(l);
    }
  }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.90, metalness: 0.0, side: THREE.DoubleSide
    });
    mat.shadowSide = THREE.FrontSide;
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      for (const k in U) shader.uniforms[k] = U[k];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          in float aKind;
          out float vKind;
          out vec3 vCNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vKind = aKind;
          vCNrm = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in float vKind;
          in vec3 vCNrm;
          uniform float uNight, uTime, uWetness, uSnow;
          uniform vec3 uSnowColor;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 keepEmit = vec3(0.0);
          {
            // pietra: variazione per conci, altrimenti e cartone
            float stone = alt_fbm2(vAltWorld.xz * 0.55 + vAltWorld.y * 0.35, 3);
            float course = 0.85 + 0.15 * step(0.5, fract(vAltWorld.y * 1.35));
            diffuseColor.rgb *= (0.86 + 0.28 * stone) * course;

            if (vKind < 0.5){
              vec3 n = normalize(vCNrm);
              vec2 fuv = abs(n.x) > abs(n.z) ? vec2(vAltWorld.z, vAltWorld.y)
                                             : vec2(vAltWorld.x, vAltWorld.y);
              float fl = 4.4, ww = 4.0;
              vec2 cell = vec2(floor(fuv.x / ww), floor(fuv.y / fl));
              vec2 f = vec2(fuv.x / ww - cell.x, fuv.y / fl - cell.y);
              // finestra ad arco: rettangolo con la cima tonda
              float wx = smoothstep(0.36, 0.42, f.x) * smoothstep(0.64, 0.58, f.x);
              float wy = smoothstep(0.26, 0.31, f.y) * smoothstep(0.74, 0.66, f.y);
              float arch = 1.0 - smoothstep(0.0, 0.09, length(vec2((f.x - 0.5) * 1.6, max(0.0, f.y - 0.60))) - 0.075);
              float win = clamp(max(wx * wy, arch * wx), 0.0, 1.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.020, 0.018, 0.016), win * 0.95);
              float r = alt_hash12(cell + 5.5);
              float on = step(r, 0.55);
              float flick = 0.80 + 0.20 * sin(uTime * (2.4 + r * 5.0) + r * 30.0);
              keepEmit += vec3(1.0, 0.62, 0.26) * win * on * uNight * 0.30 * flick;
            }
            float up = clamp(normalize(vCNrm).y, 0.0, 1.0);
            float sn = clamp(uSnow * 1.35 - 0.1, 0.0, 1.0) * pow(up, 3.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, sn * 0.9);
            diffuseColor.rgb *= mix(1.0, 0.75, uWetness * 0.5 * (1.0 - sn));
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += keepEmit;`);
    };
    mat.customProgramCacheKey = () => 'altrove-castle';
    this.fog.apply(mat);
    return mat;
  }

  _build() {
    const world = this.world;
    const rnd = mulberry32(world.seed * 7919 + 4242);
    const K = new Keep();
    this.lightSpots = [];

    const cx = 0, cz = 0;
    const y = world.height(0, 0);       // world.js ha spianato qui
    const stone = lin(0x6e6a62);
    const stoneDark = lin(0x54514b);
    const roof = lin(0x3a4550);
    const roofB = lin(0x2d3742);

    /* --- cinta muraria --- */
    const W = 40 + rnd() * 8, D = 34 + rnd() * 8;
    const wallH = 9 + rnd() * 2;
    const t = 2.2;
    const corners = [[-W, -D], [W, -D], [W, D], [-W, D]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const ax = cx + a[0], az = cz + a[1], bx = cx + b[0], bz = cz + b[1];
      // il lato verso il lago (z negativo) resta aperto sul cortile
      const isGate = i === 2;
      if (a[0] === b[0]) {
        K.box(Math.min(ax, bx) - t / 2, y, Math.min(az, bz), Math.max(ax, bx) + t / 2, y + wallH, Math.max(az, bz), stone, stoneDark, 0);
      } else {
        if (isGate) {
          const gw = 5.5;
          K.box(Math.min(ax, bx), y, az - t / 2, cx - gw, y + wallH, az + t / 2, stone, stoneDark, 0);
          K.box(cx + gw, y, az - t / 2, Math.max(ax, bx), y + wallH, az + t / 2, stone, stoneDark, 0);
          // architrave sopra il passaggio
          K.box(cx - gw, y + 7.0, az - t / 2 - 0.4, cx + gw, y + wallH + 1.6, az + t / 2 + 0.4, stone, stoneDark, 2);
        } else {
          K.box(Math.min(ax, bx), y, az - t / 2, Math.max(ax, bx), y + wallH, az + t / 2, stone, stoneDark, 0);
        }
      }
      K.crenels(ax, az, bx, bz, y + wallH, 1.5, t + 0.5, stoneDark, rnd);
    }

    /* --- torri d angolo --- */
    for (const c of corners) {
      const tx = cx + c[0], tz = cz + c[1];
      const r = 4.4 + rnd() * 1.2;
      const h = 15 + rnd() * 9;
      K.prism(tx, tz, r, r * 0.94, y - 1, y + h, 9, stone, 0);
      K.prism(tx, tz, r + 0.6, r + 0.6, y + h, y + h + 1.1, 9, stoneDark, 2);
      K.cone(tx, tz, r + 0.9, y + h + 1.1, 6 + rnd() * 3, 9, roof);
      this.lightSpots.push([tx, y + h * 0.6, tz]);
    }

    /* --- sala grande, sul lato del lago --- */
    const hw = 11, hd = 20;
    const hh = 13;
    K.box(cx - hw, y, cz - hd - 4, cx + hw, y + hh, cz - 4, stone, stoneDark, 0);
    K.gable(cx - hw - 0.8, cz - hd - 4.8, cx + hw + 0.8, cz - 3.2, y + hh, 7.5, roof, false);
    // contrafforti
    for (let i = -2; i <= 2; i++) {
      const bz2 = cz - 12 + i * 5.5;
      K.box(cx - hw - 1.6, y, bz2 - 0.9, cx - hw, y + hh * 0.78, bz2 + 0.9, stoneDark, stoneDark, 2);
      K.box(cx + hw, y, bz2 - 0.9, cx + hw + 1.6, y + hh * 0.78, bz2 + 0.9, stoneDark, stoneDark, 2);
    }
    this.lightSpots.push([cx, y + 8, cz - 14]);

    /* --- torre maestra --- */
    const keepR = 7.5;
    const keepH = 34 + rnd() * 12;
    K.prism(cx - 6, cz + 8, keepR, keepR * 0.90, y - 1, y + keepH, 10, stone, 0);
    K.prism(cx - 6, cz + 8, keepR + 0.8, keepR + 0.8, y + keepH, y + keepH + 1.4, 10, stoneDark, 2);
    K.cone(cx - 6, cz + 8, keepR + 1.1, y + keepH + 1.4, 11, 10, roofB);
    this.lightSpots.push([cx - 6, y + keepH * 0.75, cz + 8]);

    /* --- torri minori sparse nel cortile --- */
    const nT = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < nT; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = 12 + rnd() * 16;
      const tx = cx + Math.cos(a) * rr, tz = cz + 6 + Math.sin(a) * rr * 0.6;
      const r = 2.8 + rnd() * 1.8;
      const h = 12 + rnd() * 16;
      K.prism(tx, tz, r, r * 0.92, y - 1, y + h, 8, stone, 0);
      K.cone(tx, tz, r + 0.7, y + h, 4 + rnd() * 4, 8, roof);
      if (i < 2) this.lightSpots.push([tx, y + h * 0.6, tz]);
    }

    /* --- ponte verso il lago --- */
    const bz0 = cz - D - 2;
    // le pile scendono fino sotto il pelo dell acqua, altrimenti il ponte
    // resta appeso al vuoto una ventina di metri sopra il lago
    const wl = (world.waterLevel !== null && world.waterLevel !== undefined) ? world.waterLevel : y - 30;
    for (let i = 0; i < 9; i++) {
      const z1 = bz0 - i * 6;
      const pierTop = y - 0.6;
      const pierBottom = Math.min(world.height(cx, z1 - 2.8), wl) - 2.5;
      K.box(cx - 3.2, pierBottom, z1 - 5.6, cx + 3.2, pierTop, z1, stoneDark, stoneDark, 2);
      K.box(cx - 3.6, y - 0.6, z1 - 5.8, cx + 3.6, y + 0.2, z1 + 0.2, stone, stone, 2);
      // parapetto
      K.box(cx - 3.8, y + 0.2, z1 - 5.8, cx - 3.0, y + 1.2, z1 + 0.2, stoneDark, stoneDark, 2);
      K.box(cx + 3.0, y + 0.2, z1 - 5.8, cx + 3.8, y + 1.2, z1 + 0.2, stoneDark, stoneDark, 2);
    }

    /* Scala finale: e piu semplice progettare la pianta in unita comode e
     * ingrandire tutto alla fine che ritoccare quaranta numeri. */
    const S = 1.45;
    for (let i = 0; i < K.p.length; i += 3) {
      K.p[i] = cx + (K.p[i] - cx) * S;
      K.p[i + 1] = y + (K.p[i + 1] - y) * S;
      K.p[i + 2] = cz + (K.p[i + 2] - cz) * S;
    }
    for (const p2 of this.lightSpots) {
      p2[0] = cx + (p2[0] - cx) * S;
      p2[1] = y + (p2[1] - y) * S;
      p2[2] = cz + (p2[2] - cz) * S;
    }
    const g = K.toGeometry();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, y + 36, cz), 190);
    return g;
  }

  update(night, time, wetness, snow) {
    this.uniforms.uNight.value = night;
    this.uniforms.uTime.value = time;
    this.uniforms.uWetness.value = wetness;
    this.uniforms.uSnow.value = snow;
    for (const l of this.lights) {
      l.intensity = 55 * night;
      l.visible = night > 0.03;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
