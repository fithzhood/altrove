/* Altrove - city.js
 * Edifici, lampioni, auto e segnaletica.
 *
 * L isolato e l unita di generazione: dato l indice (bx, bz) l hash decide
 * quanti lotti, che altezza, che colore. Nessuna lista salvata, come per la
 * vegetazione, quindi la citta si estende quanto si vuole camminare.
 *
 * Le finestre non sono geometria ne texture: sono una griglia calcolata nel
 * fragment shader a partire dalla posizione sulla facciata. Di notte una
 * frazione si accende, e quali si accendano dipende da un hash della cella,
 * cosi restano ferme mentre ci si muove.
 */

import * as THREE from '../vendor/three.module.js';
import { hash2i, mulberry32, clamp, lerp, saturate } from './noise.js?v=23';
import { GLSL_NOISE } from './noise.js?v=23';
import { CITY } from './world.js?v=23';
import { lin } from './props.js?v=23';

const P = CITY.block;

function walkHalfFor(i) {
  return CITY.walkHalf + (Math.abs(i) % CITY.avenueEvery === 0 ? CITY.avenueExtra : 0);
}

/* ------------------------------------------------------------------ *
 * Costruttore di scatole con colori per faccia
 * ------------------------------------------------------------------ */
class BoxBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; }

  /* kind: 0 muro, 1 tetto, 2 dettaglio senza finestre */
  box(x0, y0, z0, x1, y1, z1, colWall, colRoof, kind) {
    const P8 = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]
    ];
    const faces = [
      { i: [4, 5, 6, 7], n: [0, 1, 0], c: colRoof, k: 1 },       // tetto
      { i: [0, 3, 2, 1], n: [0, -1, 0], c: colRoof, k: 2 },      // sotto
      { i: [0, 1, 5, 4], n: [0, 0, -1], c: colWall, k: kind },
      { i: [2, 3, 7, 6], n: [0, 0, 1], c: colWall, k: kind },
      { i: [1, 2, 6, 5], n: [1, 0, 0], c: colWall, k: kind },
      { i: [3, 0, 4, 7], n: [-1, 0, 0], c: colWall, k: kind }
    ];
    for (const f of faces) {
      const [a, b, c2, d] = f.i.map(ix => P8[ix]);
      // ombreggiatura per orientamento: da profondita anche senza texture
      const sh = f.n[1] > 0.5 ? 1.06 : f.n[1] < -0.5 ? 0.45
        : (f.n[0] !== 0 ? 0.90 : 0.78);
      const col = [f.c[0] * sh, f.c[1] * sh, f.c[2] * sh];
      this._quad(a, b, c2, d, f.n, col, f.k);
    }
  }

  _quad(a, b, c, d, n, col, kind) {
    this._tri(a, b, c, n, col, kind);
    this._tri(a, c, d, n, col, kind);
  }
  _tri(a, b, c, n, col, kind) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    this.c.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    this.k.push(kind, kind, kind);
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

const FACADE_COLORS = [
  0x8f8a80, 0x7d7a74, 0xa39a8c, 0x6e6b66, 0x9a8f80,
  0x8a6f5c, 0x6f7378, 0xb0a898, 0x5d6166, 0x93856f
];

/* ------------------------------------------------------------------ *
 * Auto e lampione: geometrie condivise
 * ------------------------------------------------------------------ */
function carGeometry() {
  const B = new BoxBuilder();
  const body = [1, 1, 1], dark = [0.06, 0.06, 0.07], glass = [0.10, 0.13, 0.16];
  B.box(-0.88, 0.34, -2.10, 0.88, 0.94, 2.10, body, body, 2);
  B.box(-0.76, 0.94, -0.95, 0.76, 1.42, 0.85, glass, glass, 2);
  for (const sx of [-1, 1]) for (const sz of [-1.42, 1.42]) {
    B.box(sx * 0.78 - 0.10, 0.06, sz - 0.30, sx * 0.78 + 0.10, 0.62, sz + 0.30, dark, dark, 2);
  }
  return B.toGeometry();
}

function lampGeometry() {
  const B = new BoxBuilder();
  const pole = [0.10, 0.105, 0.11];
  B.box(-0.075, 0, -0.075, 0.075, 5.4, 0.075, pole, pole, 2);
  B.box(-0.075, 5.25, -0.075, 0.075, 5.55, 1.45, pole, pole, 2);
  // testa luminosa: colore alto, si accende dall emissivo
  const head = [1, 0.86, 0.62];
  B.box(-0.24, 5.05, 1.10, 0.24, 5.30, 1.72, head, head, 3);
  return B.toGeometry();
}

/* ------------------------------------------------------------------ *
 * City
 * ------------------------------------------------------------------ */
export class City {
  constructor(world, fog, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.radius = opts.radius || 620;
    this.blocks = new Map();
    this.uniforms = {
      uNight: { value: 0 },
      uTime: { value: 0 },
      uWetness: { value: 0 },
      uSnow: { value: 0 },
      uSnowColor: { value: new THREE.Color(0.9, 0.93, 1.0) },
      uNeon: { value: 0 }
    };
    this.neon = !!opts.neon;
    this.tallMul = opts.tallMul || 1;
    this.material = this._makeMaterial();
    this.uniforms.uNeon.value = this.neon ? 1 : 0;
    this.stats = { blocks: 0, lamps: 0, cars: 0 };

    this._initInstanced();
    this._initLights(opts.lights === undefined ? 6 : opts.lights);
  }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, metalness: 0.02, side: THREE.FrontSide
    });
    mat.shadowSide = THREE.FrontSide;
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      for (const k in U) shader.uniforms[k] = U[k];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          in float aKind;
          out float vKind;
          out vec3 vCityNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vKind = aKind;
          #ifdef USE_INSTANCING
            vCityNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          #else
            vCityNrm = normalize(mat3(modelMatrix) * objectNormal);
          #endif`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in float vKind;
          in vec3 vCityNrm;
          uniform float uNight, uTime, uWetness, uSnow, uNeon;
          uniform vec3 uSnowColor;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 cityEmit = vec3(0.0);
          if (vKind < 0.5){
            /* Facciata. Le coordinate della griglia vengono dalla posizione nel
             * mondo proiettata sul piano del muro: niente UV da cucire, e due
             * edifici affiancati non ripetono lo stesso disegno. */
            vec3 n = normalize(vCityNrm);
            vec2 fuv = abs(n.x) > abs(n.z) ? vec2(vAltWorld.z, vAltWorld.y)
                                           : vec2(vAltWorld.x, vAltWorld.y);
            float floorH = 3.55;
            float winW = 3.15;
            vec2 cell = vec2(floor(fuv.x / winW), floor(fuv.y / floorH));
            vec2 f = vec2(fuv.x / winW - cell.x, fuv.y / floorH - cell.y);

            // marcapiano
            float band = smoothstep(0.06, 0.10, f.y) * smoothstep(0.98, 0.92, f.y);
            diffuseColor.rgb *= mix(0.78, 1.0, band);

            // vetro: rettangolo dentro la cella
            float wx = smoothstep(0.16, 0.22, f.x) * smoothstep(0.84, 0.78, f.x);
            float wy = smoothstep(0.26, 0.32, f.y) * smoothstep(0.86, 0.80, f.y);
            float win = wx * wy;
            // il piano terra e vetrina, non finestre
            float ground = step(fuv.y, floorH * 1.05);
            win = mix(win, wx * smoothstep(0.10, 0.18, f.y) * smoothstep(0.92, 0.84, f.y), ground);

            vec3 glass = vec3(0.045, 0.055, 0.070) * (0.6 + 0.8 * alt_hash12(cell + 3.1));
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.92);

            /* Di notte una parte si accende. La stessa cella deve restare accesa
             * mentre il giocatore cammina, quindi la sorte viene da un hash
             * della cella, non dal tempo. */
            float lot = alt_hash12(cell * 0.031 + 17.0);
            float r = alt_hash12(cell + vec2(0.5, 11.0));
            float on = step(r, 0.34 + 0.22 * lot);
            float flick = 0.88 + 0.12 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
            vec3 warm = mix(vec3(1.0, 0.72, 0.40), vec3(0.85, 0.90, 1.0), step(0.72, r));
            /* Insegne: nella versione al neon le finestre virano su tinte
             * sature e certi piani diventano fasce luminose continue. */
            if (uNeon > 0.5){
              float hue = alt_hash12(cell * vec2(0.13, 0.07) + 21.0);
              vec3 neon = hue < 0.25 ? vec3(1.0, 0.15, 0.55)
                        : hue < 0.5  ? vec3(0.15, 0.95, 1.0)
                        : hue < 0.75 ? vec3(0.55, 0.25, 1.0)
                                     : vec3(1.0, 0.62, 0.10);
              warm = mix(warm, neon, 0.88);
              on = max(on, step(alt_hash12(cell + 41.0), 0.55));
              float bandRow = step(alt_hash12(vec2(cell.y, 3.0)), 0.16);
              float strip = bandRow * smoothstep(0.02, 0.09, f.y) * smoothstep(0.24, 0.17, f.y);
              cityEmit += neon * strip * uNight * 0.42;
            }
            cityEmit += warm * win * on * uNight * (uNeon > 0.5 ? 0.26 : 0.16) * flick;
          } else if (vKind > 2.5){
            // testa del lampione
            cityEmit += vec3(1.0, 0.80, 0.52) * uNight * 0.75;
          }

          // neve sui tetti e sui davanzali
          float up = clamp(normalize(vCityNrm).y, 0.0, 1.0);
          float sn = clamp(uSnow * 1.4 - 0.1, 0.0, 1.0) * pow(up, 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, sn * 0.9);
          diffuseColor.rgb *= mix(1.0, 0.72, uWetness * 0.55 * (1.0 - sn));`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.16, uWetness * 0.7);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += cityEmit;`);
    };
    mat.customProgramCacheKey = () => 'altrove-city';
    this.fog.apply(mat);
    return mat;
  }

  _initInstanced() {
    const MAXL = 900, MAXC = 700;
    this.lampMesh = new THREE.InstancedMesh(lampGeometry(), this.material, MAXL);
    this.lampMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXL * 3).fill(1), 3);
    this.lampMesh.count = 0;
    this.lampMesh.castShadow = true;
    this.lampMesh.receiveShadow = true;
    this.lampMesh.frustumCulled = false;
    this.lampMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.lampMesh);

    this.carMesh = new THREE.InstancedMesh(carGeometry(), this.material, MAXC);
    this.carMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 3).fill(1), 3);
    this.carMesh.count = 0;
    this.carMesh.castShadow = true;
    this.carMesh.receiveShadow = true;
    this.carMesh.frustumCulled = false;
    this.carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.carMesh);
  }

  /* Qualche lampione vero, i piu vicini. Il resto e solo emissivo: senza
   * almeno un paio di pozze di luce a terra la notte in citta non convince. */
  _initLights(n) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffb877, 0, 26, 2);
      l.castShadow = false;
      this.group.add(l);
      this.lights.push(l);
    }
    this.lampPositions = [];
  }

  /* ------------------------------------------------------------------ *
   * Generazione di un isolato
   * ------------------------------------------------------------------ */
  _buildBlock(bx, bz) {
    const B = new BoxBuilder();
    const world = this.world;
    const rnd = mulberry32((bx * 73856093) ^ (bz * 19349663) ^ (world.seed * 83492791));

    const x0 = bx * P + walkHalfFor(bx);
    const x1 = (bx + 1) * P - walkHalfFor(bx + 1);
    const z0 = bz * P + walkHalfFor(bz);
    const z1 = (bz + 1) * P - walkHalfFor(bz + 1);
    if (x1 - x0 < 8 || z1 - z0 < 8) return null;

    /* Quartieri: un rumore a bassa frequenza decide dove si costruisce alto.
     * Senza, la citta e una scacchiera uniforme e non ha centro. */
    const dn = world.nd.fbm2(bx * 0.10, bz * 0.10, 3) * 0.5 + 0.5;
    const density = Math.pow(dn, 1.3);
    const tallness = (0.25 + density * 1.9) * this.tallMul;

    // un isolato su dieci resta parco
    if (hash2i(bx, bz, 991) < 0.09) {
      return { geo: null, park: true, x0, z0, x1, z1 };
    }

    // suddivisione ricorsiva in lotti
    const lots = [];
    const split = (a, b, c, d, depth) => {
      const w = c - a, h = d - b;
      const minLot = 9 + rnd() * 7;
      if (depth > 4 || (w < minLot * 2 && h < minLot * 2)) {
        lots.push([a, b, c, d]);
        return;
      }
      if (w >= h) {
        const t = 0.35 + rnd() * 0.3;
        split(a, b, a + w * t, d, depth + 1);
        split(a + w * t, b, c, d, depth + 1);
      } else {
        const t = 0.35 + rnd() * 0.3;
        split(a, b, c, b + h * t, depth + 1);
        split(a, b + h * t, c, d, depth + 1);
      }
    };
    split(x0, z0, x1, z1, 0);

    const lamps = [], cars = [];
    let minY = 1e9, maxY = -1e9;

    for (const lot of lots) {
      const [a, b, c, d] = lot;
      const inset = 0.4 + rnd() * 1.6;
      const ax = a + inset, az = b + inset, cx2 = c - inset, cz2 = d - inset;
      if (cx2 - ax < 5 || cz2 - az < 5) continue;

      const gx = (ax + cx2) * 0.5, gz = (az + cz2) * 0.5;
      const ground = world.height(gx, gz);
      const floors = Math.max(2, Math.round((2 + rnd() * 6) * tallness + rnd() * 3));
      const fh = 3.55;
      let h = floors * fh;

      const cIdx = Math.floor(rnd() * FACADE_COLORS.length);
      const wall = lin(FACADE_COLORS[cIdx]);
      const roof = lin(0x4a4a48);

      // corpo principale, con la base sotto il piano di calpestio
      B.box(ax, ground - 3, az, cx2, ground + h, cz2, wall, roof, 0);
      minY = Math.min(minY, ground - 3); maxY = Math.max(maxY, ground + h + 4);

      // parapetto
      const pr = 0.35;
      B.box(ax, ground + h, az, cx2, ground + h + 0.8, az + pr, roof, roof, 2);
      B.box(ax, ground + h, cz2 - pr, cx2, ground + h + 0.8, cz2, roof, roof, 2);
      B.box(ax, ground + h, az, ax + pr, ground + h + 0.8, cz2, roof, roof, 2);
      B.box(cx2 - pr, ground + h, az, cx2, ground + h + 0.8, cz2, roof, roof, 2);

      // arretramento per gli edifici alti
      if (floors > 7 && rnd() > 0.3) {
        const s = 2.5 + rnd() * 3;
        const h2 = (1 + Math.floor(rnd() * 4)) * fh;
        if (cx2 - ax > s * 2.5 && cz2 - az > s * 2.5) {
          B.box(ax + s, ground + h, az + s, cx2 - s, ground + h + h2, cz2 - s, wall, roof, 0);
          maxY = Math.max(maxY, ground + h + h2 + 3);
          h += h2;
        }
      }

      // volumi tecnici sul tetto
      const nT = Math.floor(rnd() * 3);
      for (let i = 0; i < nT; i++) {
        const tw = 1.2 + rnd() * 2.6, td = 1.2 + rnd() * 2.6;
        const tx = ax + 1 + rnd() * Math.max(0.1, (cx2 - ax) - tw - 2);
        const tz = az + 1 + rnd() * Math.max(0.1, (cz2 - az) - td - 2);
        B.box(tx, ground + h, tz, tx + tw, ground + h + 0.8 + rnd() * 1.8, tz + td, roof, roof, 2);
      }
    }

    /* Lampioni lungo i marciapiedi e auto in sosta al bordo strada */
    const step = 26;
    for (const side of [0, 1]) {
      // lato lungo x
      const zz = side === 0 ? bz * P + CITY.roadHalf + 2.2 : (bz + 1) * P - CITY.roadHalf - 2.2;
      for (let x = x0 + 6; x < x1 - 4; x += step) {
        const jx = x + hash2i(Math.round(x), bz * 7 + side, 3) * 6;
        if (jx > x1 - 4) continue;
        lamps.push([jx, world.height(jx, zz), zz, side === 0 ? 0 : Math.PI]);
      }
      const xx = side === 0 ? bx * P + CITY.roadHalf + 2.2 : (bx + 1) * P - CITY.roadHalf - 2.2;
      for (let z = z0 + 14; z < z1 - 4; z += step) {
        const jz = z + hash2i(Math.round(z), bx * 11 + side, 5) * 6;
        if (jz > z1 - 4) continue;
        lamps.push([xx, world.height(xx, jz), jz, side === 0 ? Math.PI / 2 : -Math.PI / 2]);
      }
    }

    const carStep = 7.2;
    for (const side of [0, 1]) {
      const zz = side === 0 ? bz * P + CITY.roadHalf - 2.0 : (bz + 1) * P - CITY.roadHalf + 2.0;
      for (let x = x0 + 3; x < x1 - 3; x += carStep) {
        if (hash2i(Math.round(x * 3), bz * 17 + side, 7) > 0.55) continue;
        cars.push([x, world.height(x, zz), zz, Math.PI / 2, hash2i(Math.round(x * 5), bz + side, 9)]);
      }
      const xx = side === 0 ? bx * P + CITY.roadHalf - 2.0 : (bx + 1) * P - CITY.roadHalf + 2.0;
      for (let z = z0 + 3; z < z1 - 3; z += carStep) {
        if (hash2i(Math.round(z * 3), bx * 23 + side, 11) > 0.55) continue;
        cars.push([xx, world.height(xx, z), z, 0, hash2i(Math.round(z * 5), bx + side, 13)]);
      }
    }

    const geo = B.p.length ? B.toGeometry() : null;
    if (geo) {
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((x0 + x1) * 0.5, (minY + maxY) * 0.5, (z0 + z1) * 0.5),
        Math.hypot((x1 - x0) * 0.71, (maxY - minY) * 0.5) + 6
      );
    }
    return { geo, lamps, cars, x0, z0, x1, z1 };
  }

  /* ------------------------------------------------------------------ */
  update(camX, camZ, budget = 2) {
    const R = this.radius;
    const b0x = Math.floor((camX - R) / P), b1x = Math.floor((camX + R) / P);
    const b0z = Math.floor((camZ - R) / P), b1z = Math.floor((camZ + R) / P);

    let built = 0;
    const want = new Set();
    const pending = [];
    for (let bz = b0z; bz <= b1z; bz++) {
      for (let bx = b0x; bx <= b1x; bx++) {
        const cx = (bx + 0.5) * P - camX, cz = (bz + 0.5) * P - camZ;
        const d2 = cx * cx + cz * cz;
        if (d2 > (R + P) * (R + P)) continue;
        const key = bx + '|' + bz;
        want.add(key);
        if (!this.blocks.has(key)) pending.push({ key, bx, bz, d2 });
      }
    }
    pending.sort((a, b) => a.d2 - b.d2);
    for (const item of pending) {
      if (built >= budget) break;
      const blk = this._buildBlock(item.bx, item.bz);
      if (blk && blk.geo) {
        blk.mesh = new THREE.Mesh(blk.geo, this.material);
        blk.mesh.castShadow = true;
        blk.mesh.receiveShadow = true;
        blk.mesh.matrixAutoUpdate = false;
        this.group.add(blk.mesh);
      }
      this.blocks.set(item.key, blk || { empty: true, lamps: [], cars: [] });
      built++;
    }

    for (const [key, blk] of this.blocks) {
      if (!want.has(key)) {
        if (blk.mesh) { this.group.remove(blk.mesh); blk.geo.dispose(); }
        this.blocks.delete(key);
      }
    }

    this._repack(camX, camZ);
    this.stats.blocks = this.blocks.size;
    return pending.length > built;
  }

  _repack(camX, camZ) {
    const lm = this.lampMesh, cm = this.carMesh;
    const la = lm.instanceMatrix.array, ca = cm.instanceMatrix.array;
    const lc = lm.instanceColor.array, cc = cm.instanceColor.array;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
    let li = 0, ci = 0;
    this.lampPositions.length = 0;

    for (const [, blk] of this.blocks) {
      if (blk.lamps) for (const L of blk.lamps) {
        if (li >= 900) break;
        pos.set(L[0], L[1], L[2]);
        e.set(0, L[3], 0); q.setFromEuler(e);
        m.compose(pos, q, scl); m.toArray(la, li * 16);
        lc[li * 3] = 1; lc[li * 3 + 1] = 1; lc[li * 3 + 2] = 1;
        const dx = L[0] - camX, dz = L[2] - camZ;
        this.lampPositions.push({ x: L[0], y: L[1] + 5.2, z: L[2], d: dx * dx + dz * dz });
        li++;
      }
      if (blk.cars) for (const C of blk.cars) {
        if (ci >= 700) break;
        pos.set(C[0], C[1], C[2]);
        e.set(0, C[3], 0); q.setFromEuler(e);
        m.compose(pos, q, scl); m.toArray(ca, ci * 16);
        const t = C[4];
        // tinte plausibili: molto grigio e bianco, ogni tanto un colore
        let r, g, b;
        if (t < 0.5) { const v = 0.10 + t * 1.1; r = v; g = v; b = v * 1.02; }
        else if (t < 0.66) { r = 0.30; g = 0.05; b = 0.06; }
        else if (t < 0.80) { r = 0.05; g = 0.10; b = 0.28; }
        else if (t < 0.90) { r = 0.05; g = 0.16; b = 0.09; }
        else { r = 0.42; g = 0.30; b = 0.05; }
        cc[ci * 3] = r; cc[ci * 3 + 1] = g; cc[ci * 3 + 2] = b;
        ci++;
      }
    }
    lm.count = Math.min(li, 900);
    cm.count = Math.min(ci, 700);
    lm.instanceMatrix.needsUpdate = true;
    lm.instanceColor.needsUpdate = true;
    cm.instanceMatrix.needsUpdate = true;
    cm.instanceColor.needsUpdate = true;
    this.stats.lamps = lm.count;
    this.stats.cars = cm.count;
  }

  /* Assegna le poche luci reali ai lampioni piu vicini */
  updateLights(camX, camZ, night) {
    this.lampPositions.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      const p = this.lampPositions[i];
      if (p && night > 0.03) {
        L.position.set(p.x, p.y, p.z);
        L.intensity = 9.0 * night;
        L.distance = 24;
        L.visible = true;
      } else {
        L.visible = false;
        L.intensity = 0;
      }
    }
  }

  setNight(v) { this.uniforms.uNight.value = v; }
  setTime(t) { this.uniforms.uTime.value = t; }
  setWetness(v) { this.uniforms.uWetness.value = v; }
  setSnow(v) { this.uniforms.uSnow.value = v; }

  buildAll(camX, camZ) {
    let guard = 0;
    while (this.update(camX, camZ, 40) && guard++ < 80);
  }

  dispose() {
    for (const [, blk] of this.blocks) {
      if (blk.mesh) { this.group.remove(blk.mesh); blk.geo.dispose(); }
    }
    this.blocks.clear();
    this.lampMesh.geometry.dispose();
    this.carMesh.geometry.dispose();
    this.group.remove(this.lampMesh);
    this.group.remove(this.carMesh);
    this.material.dispose();
  }
}
