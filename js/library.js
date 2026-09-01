/* Altrove - library.js
 * La Biblioteca.
 *
 * Galleria esagonale, quattro pareti di scaffali e due corridoi opposti che
 * portano alla galleria successiva, identica. Il pavimento e piatto, il
 * soffitto chiude sopra la testa: qui non esiste un cielo, e la nebbia decide
 * quanto lontano si arriva a vedere. Camminando non si esce mai, perche le
 * celle si generano attorno al giocatore all infinito.
 *
 * I libri non sono geometria: sono una griglia calcolata nel fragment shader
 * sulla parete, dove ogni dorso prende altezza e colore da un hash della sua
 * cella. Costerebbero milioni di triangoli, e non servirebbero a niente.
 */

import * as THREE from '../vendor/three.module.js';
import { hash2i, mulberry32, lerp } from './noise.js?v=18';
import { GLSL_NOISE } from './noise.js?v=18';
import { lin } from './props.js?v=18';

/* Geometria del reticolo esagonale. R e il raggio del centro-vertice. */
export const HEX = { R: 8.2, H: 5.4, wall: 0.55, door: 3.0 };

/* Assi del reticolo esagonale "pointy-top" */
function hexCenter(q, r) {
  const s = HEX.R * 1.732050808;      // distanza fra centri
  return [s * (q + r * 0.5), s * r * 0.8660254];
}
function hexRound(x, z) {
  const s = HEX.R * 1.732050808;
  const r = z / (s * 0.8660254);
  const q = x / s - r * 0.5;
  // arrotondamento in coordinate cubiche
  let rx = Math.round(q), ry = Math.round(-q - r), rz = Math.round(r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry - (-q - r)), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, rz];
}

class Box {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; }
  /* kind: 0 scaffale (libri), 1 pavimento/soffitto, 2 legno liscio, 3 lampada */
  box(x0, y0, z0, x1, y1, z1, col, kind, faces) {
    const V = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    const F = [
      { i: [4, 5, 6, 7], n: [0, 1, 0], s: 1.02, f: 'up' },
      { i: [0, 3, 2, 1], n: [0, -1, 0], s: 0.42, f: 'down' },
      { i: [0, 1, 5, 4], n: [0, 0, -1], s: 0.84, f: 'z0' },
      { i: [2, 3, 7, 6], n: [0, 0, 1], s: 0.84, f: 'z1' },
      { i: [1, 2, 6, 5], n: [1, 0, 0], s: 0.94, f: 'x1' },
      { i: [3, 0, 4, 7], n: [-1, 0, 0], s: 0.94, f: 'x0' }
    ];
    for (const f of F) {
      if (faces && faces.indexOf(f.f) < 0) continue;
      const c = [col[0] * f.s, col[1] * f.s, col[2] * f.s];
      const q = f.i.map(ix => V[ix]);
      this._quad(q[0], q[1], q[2], q[3], f.n, c, kind);
    }
  }
  _quad(a, b, c, d, n, col, k) { this._tri(a, b, c, n, col, k); this._tri(a, c, d, n, col, k); }
  _tri(a, b, c, n, col, k) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    this.c.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    this.k.push(k, k, k);
  }
  /* Muro fra due punti, con eventuale porta al centro */
  wall(ax, az, bx, bz, y0, y1, t, col, kind, door) {
    let dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const px = -dz * t * 0.5, pz = dx * t * 0.5;
    const segs = door ? [[0, (L - HEX.door) * 0.5], [(L + HEX.door) * 0.5, L]] : [[0, L]];
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.05) continue;
      const p0 = [ax + dx * s0, az + dz * s0], p1 = [ax + dx * s1, az + dz * s1];
      const A = [p0[0] - px, y0, p0[1] - pz], B = [p1[0] - px, y0, p1[1] - pz];
      const C = [p1[0] + px, y0, p1[1] + pz], D = [p0[0] + px, y0, p0[1] + pz];
      const up = (q) => [q[0], y1, q[2]];
      this._quad(A, B, up(B), up(A), [-dz, 0, dx], col, kind);
      this._quad(C, D, up(D), up(C), [dz, 0, -dx], col, kind);
      this._quad(up(A), up(B), up(C), up(D), [0, 1, 0], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], 2);
      // spalle della porta
      this._quad(B, C, up(C), up(B), [dx, 0, dz], [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], 2);
      this._quad(D, A, up(A), up(D), [-dx, 0, -dz], [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], 2);
    }
    if (door) {
      // architrave
      const mid = (L) / 2;
      const A = [ax + dx * (mid - HEX.door / 2) - px, y1 - 1.1, az + dz * (mid - HEX.door / 2) - pz];
      const B = [ax + dx * (mid + HEX.door / 2) - px, y1 - 1.1, az + dz * (mid + HEX.door / 2) - pz];
      const C = [B[0] + px * 2, B[1], B[2] + pz * 2];
      const D = [A[0] + px * 2, A[1], A[2] + pz * 2];
      const up = (q) => [q[0], y1, q[2]];
      this._quad(A, B, up(B), up(A), [-dz, 0, dx], col, 2);
      this._quad(C, D, up(D), up(C), [dz, 0, -dx], col, 2);
      this._quad(B, A, D, C, [0, -1, 0], [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5], 2);
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

export class Library {
  constructor(world, fog, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.radius = opts.radius || 130;
    this.cells = new Map();
    this.uniforms = {
      uTime: { value: 0 },
      uLamp: { value: 1 }
    };
    this.material = this._makeMaterial();
    this.stats = { cells: 0 };
    this.lights = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffcf90, 0, 26, 2);
      this.group.add(l);
      this.lights.push(l);
    }
    this.lampSpots = [];
  }

  _makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      /* Doppia faccia: qui si sta dentro, e il soffitto va visto da sotto. Con
       * il culling in avanti sparirebbe e si vedrebbe il cielo, che in una
       * biblioteca infinita e proprio la cosa da non far vedere. */
      vertexColors: true, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide
    });
    mat.shadowSide = THREE.FrontSide;
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      for (const k in U) shader.uniforms[k] = U[k];
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          in float aKind;
          out float vKind;
          out vec3 vLibNrm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vKind = aKind;
          vLibNrm = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in float vKind;
          in vec3 vLibNrm;
          uniform float uTime, uLamp;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 libEmit = vec3(0.0);
          if (vKind < 0.5){
            /* Scaffale. Griglia di dorsi: ogni libro prende larghezza, altezza
             * e colore da un hash della sua cella. Sono milioni di volumi che
             * non costano un solo triangolo. */
            vec3 n = normalize(vLibNrm);
            vec2 fuv = abs(n.x) > abs(n.z) ? vec2(vAltWorld.z, vAltWorld.y)
                                           : vec2(vAltWorld.x, vAltWorld.y);
            float shelfH = 0.62;
            float shelf = floor(fuv.y / shelfH);
            float sy = fuv.y / shelfH - shelf;

            // il ripiano di legno fra una fila e l altra
            float plank = smoothstep(0.0, 0.055, sy) * smoothstep(0.115, 0.060, sy);
            float wood = 1.0 - smoothstep(0.055, 0.075, sy);

            // larghezza variabile dei dorsi
            float row = alt_hash12(vec2(shelf, 3.0));
            float bw = 0.048 + 0.030 * row;
            float bi = floor(fuv.x / bw);
            float bx = fuv.x / bw - bi;
            float h = alt_hash12(vec2(bi, shelf));
            float top = 0.16 + 0.72 * (0.55 + 0.45 * h);
            float gap = step(0.94, alt_hash12(vec2(bi + 7.0, shelf)));   // buchi

            float inBook = step(0.10, sy) * step(sy, top) * (1.0 - gap)
                         * smoothstep(0.02, 0.10, bx) * smoothstep(0.98, 0.90, bx);

            float hue = alt_hash12(vec2(bi * 1.7, shelf * 2.3));
            vec3 spine = hue < 0.28 ? vec3(0.16, 0.055, 0.040)
                       : hue < 0.50 ? vec3(0.055, 0.075, 0.040)
                       : hue < 0.68 ? vec3(0.035, 0.055, 0.10)
                       : hue < 0.84 ? vec3(0.14, 0.10, 0.045)
                                    : vec3(0.085, 0.075, 0.065);
            spine *= 0.7 + 0.6 * alt_hash12(vec2(bi, shelf + 11.0));
            // filetto dorato del titolo
            float band = smoothstep(top * 0.62, top * 0.66, sy) * smoothstep(top * 0.74, top * 0.70, sy);
            spine = mix(spine, vec3(0.32, 0.24, 0.09), band * 0.7);

            vec3 shelfWood = diffuseColor.rgb * (0.55 + 0.5 * alt_hash12(vec2(bi * 0.3, shelf)));
            diffuseColor.rgb = mix(shelfWood * 0.35, spine, inBook);
            diffuseColor.rgb = mix(diffuseColor.rgb, shelfWood * 1.25, plank + wood * 0.6);
          } else if (vKind > 2.5){
            // lampada
            libEmit += vec3(1.0, 0.78, 0.44) * uLamp * 0.42;
          } else if (vKind > 0.5 && vKind < 1.5){
            // pavimento e soffitto: pietra con la fuga fra le lastre
            vec2 t = vAltWorld.xz / 1.35;
            vec2 f = abs(fract(t) - 0.5);
            float joint = smoothstep(0.46, 0.50, max(f.x, f.y));
            float grain = alt_fbm2(vAltWorld.xz * 1.4, 3);
            diffuseColor.rgb *= (0.82 + 0.30 * grain) * (1.0 - joint * 0.45);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += libEmit;`);
    };
    mat.customProgramCacheKey = () => 'altrove-library';
    this.fog.apply(mat);
    return mat;
  }

  _buildCell(q, r) {
    const B = new Box();
    const [cx, cz] = hexCenter(q, r);
    const R = HEX.R, H = HEX.H;
    const wood = lin(0x4a3524), woodDark = lin(0x33241a);
    const stone = lin(0x6a6055);

    // pavimento e soffitto esagonali
    const V = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      V.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
    /* Il pavimento sta cinque centimetri sopra il terreno: complanari
     * sfarfallavano a bande. */
    const FY = 0.05;
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      B._tri([cx, FY, cz], [V[i][0], FY, V[i][1]], [V[j][0], FY, V[j][1]], [0, 1, 0], stone, 1);
      B._tri([V[j][0], H, V[j][1]], [V[i][0], H, V[i][1]], [cx, H, cz], [0, -1, 0],
        [stone[0] * 0.55, stone[1] * 0.55, stone[2] * 0.55], 1);
    }

    /* Due corridoi opposti, orientati diversamente da cella a cella: cosi la
     * pianta non e una griglia ma un labirinto. */
    const off = Math.floor(hash2i(q, r, 5) * 3);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const isDoor = (i % 3) === off;
      B.wall(V[i][0], V[i][1], V[j][0], V[j][1], 0, H, HEX.wall, isDoor ? wood : woodDark, isDoor ? 2 : 0, isDoor);
    }

    // tavolo e lampada al centro
    B.box(cx - 1.15, 0.72, cz - 0.75, cx + 1.15, 0.80, cz + 0.75, wood, 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.box(cx + sx * 1.0 - 0.05, 0, cz + sz * 0.6 - 0.05, cx + sx * 1.0 + 0.05, 0.72, cz + sz * 0.6 + 0.05, woodDark, 2);
    }
    B.box(cx - 0.26, H - 0.55, cz - 0.26, cx + 0.26, H - 0.22, cz + 0.26, [1, 0.85, 0.6], 3);
    B.box(cx - 0.05, H - 0.22, cz - 0.05, cx + 0.05, H, cz + 0.05, woodDark, 2);
    this.lampSpots.push([cx, H - 0.7, cz]);

    const g = B.toGeometry();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, H * 0.5, cz), R * 1.3 + 1);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return { mesh, geo: g, cx, cz };
  }

  update(camX, camZ, budget = 2) {
    const s = HEX.R * 1.732050808;
    const n = Math.ceil(this.radius / s) + 1;
    const [q0, r0] = hexRound(camX, camZ);
    const want = new Set();
    const pending = [];
    this.lampSpots.length = 0;

    for (let dr = -n; dr <= n; dr++) {
      for (let dq = -n; dq <= n; dq++) {
        const q = q0 + dq, r = r0 + dr;
        const [cx, cz] = hexCenter(q, r);
        const dx = cx - camX, dz = cz - camZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > this.radius * this.radius) continue;
        const key = q + '|' + r;
        want.add(key);
        const c = this.cells.get(key);
        if (!c) pending.push({ key, q, r, d2 });
        else this.lampSpots.push([c.cx, HEX.H - 0.7, c.cz, d2]);
      }
    }
    pending.sort((a, b) => a.d2 - b.d2);
    let built = 0;
    for (const it of pending) {
      if (built >= budget) break;
      const c = this._buildCell(it.q, it.r);
      this.cells.set(it.key, c);
      this.group.add(c.mesh);
      built++;
    }
    for (const [key, c] of this.cells) {
      if (!want.has(key)) { this.group.remove(c.mesh); c.geo.dispose(); this.cells.delete(key); }
    }
    this.stats.cells = this.cells.size;

    // le poche luci vere vanno alle lampade piu vicine
    this.lampSpots.sort((a, b) => (a[3] || 0) - (b[3] || 0));
    for (let i = 0; i < this.lights.length; i++) {
      const p = this.lampSpots[i];
      const L = this.lights[i];
      if (p) { L.position.set(p[0], p[1], p[2]); L.intensity = 9; L.visible = true; }
      else { L.visible = false; L.intensity = 0; }
    }
    return pending.length > built;
  }

  setTime(t) { this.uniforms.uTime.value = t; }

  dispose() {
    for (const [, c] of this.cells) { this.group.remove(c.mesh); c.geo.dispose(); }
    this.cells.clear();
    this.material.dispose();
  }
}
