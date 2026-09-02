/* Altrove - waterfall.js
 * Cascate.
 *
 * Non sono piazzate a mano: il sistema cerca i salti di quota. Su una griglia
 * attorno al giocatore prova dei punti, misura quanto scende il terreno nei
 * dieci metri a valle e, dove il salto e abbastanza netto, fa partire l acqua.
 * Poi la lascia scorrere seguendo la pendenza finche il pendio non si addolcisce
 * o finche non incontra il pelo dell acqua.
 *
 * Il velo d acqua e una striscia di quadrilateri con una coordinata che cresce
 * lungo la caduta: nello shader quella coordinata scorre nel tempo, e il rumore
 * che ci scorre sopra fa le vene e la schiuma. Sotto, un anello di nebbia.
 */

import * as THREE from '../vendor/three.module.js';
import { hash2i, clamp, lerp, smoothstep } from './noise.js?v=27';
import { GLSL_NOISE } from './noise.js?v=27';
import { GLSL_FOG_DECL } from './fog.js?v=27';

export class Waterfalls {
  constructor(world, fog, cfg, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.cfg = Object.assign({
      radius: 420, cell: 70, minDrop: 14, maxSteps: 46, step: 2.6,
      width: [3.5, 11], chance: 0.42, mist: true
    }, cfg || {});
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;

    this.uniforms = {
      uTime: { value: 0 },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: new THREE.Vector3(0.3, 0.4, 0.5) },
      uDeep: { value: new THREE.Vector3(0.35, 0.55, 0.62) }
    };
    for (const k in this.fog.u) this.uniforms[k] = this.fog.u[k];

    this.material = this._makeMaterial(false);
    this.mistMat = this._makeMaterial(true);
    this.mesh = null;
    this.mist = null;
    this.lastKey = null;
    this.stats = { falls: 0 };
  }

  _makeMaterial(isMist) {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */`
        attribute vec3 aFall;     // s lungo la caduta, larghezza -1..1, velocita
        varying vec2 vF;
        varying float vSpeed;
        varying vec3 vAltWorld;
        uniform float altCurve;
        void main(){
          vF = aFall.xy;
          vSpeed = aFall.z;
          vAltWorld = position;
          vec4 mv = viewMatrix * vec4(position, 1.0);
          mv.y -= mv.z * mv.z * altCurve;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vF;
        varying float vSpeed;
        varying vec3 vAltWorld;
        uniform float uTime;
        uniform vec3 uSunColor, uAmbient, uDeep;
        ${GLSL_NOISE}
        ${GLSL_FOG_DECL}

        void main(){
          float s = vF.x;               // 0 in cima, 1 in fondo
          float w = vF.y;               // -1..1 attraverso il velo
          ${isMist ? `
          /* Nebbia alla base: una nuvola tondeggiante che sale e svanisce. */
          float d = dot(vec2(w, s * 2.0 - 1.0), vec2(w, s * 2.0 - 1.0));
          float n = alt_fbm2(vec2(w * 2.5, s * 3.0) + vec2(uTime * 0.25, -uTime * 0.4), 4);
          float a = smoothstep(1.0, 0.05, d) * (0.25 + 0.75 * n) * 0.32;
          vec3 col = (uAmbient * 2.4 + uSunColor * 0.06);
          ` : `
          /* Velo d acqua: il rumore scorre verso il basso piu in fretta man mano
           * che si accelera, e verso il fondo si sfrangia in schiuma. */
          float t = uTime * (1.6 + vSpeed * 2.2);
          float v = s * 5.0 - t;
          float n1 = alt_fbm2(vec2(w * 3.2, v), 4);
          float n2 = alt_fbm2(vec2(w * 9.0 + 5.0, v * 2.3 - t * 0.7), 3);
          float vein = 0.45 + 0.75 * n1 * (0.55 + 0.45 * n2);
          // i bordi si assottigliano, il fondo si apre in spruzzo
          float edge = 1.0 - smoothstep(0.55, 1.0, abs(w));
          float bottom = smoothstep(0.55, 1.0, s);
          float a = edge * (0.62 + 0.55 * vein) * (0.70 + 0.60 * bottom);
          a *= smoothstep(0.0, 0.07, s);
          a = clamp(a, 0.0, 0.97);
          vec3 white = (uAmbient * 3.2 + uSunColor * 0.16);
          vec3 col = mix(uDeep * (uAmbient.g * 3.0 + 0.2), white, clamp(vein * 0.8 + bottom * 0.5, 0.0, 1.0));
          `}
          if (a < 0.004) discard;
          col = altApplyFogAt(col, vAltWorld, cameraPosition);
          gl_FragColor = vec4(col, a);
        }`
    });
  }

  /* Cerca i punti in cui il terreno precipita. */
  _findLips(camX, camZ) {
    const w = this.world;
    const C = this.cfg;
    const out = [];
    const wl = w.hasWater ? w.waterLevel : -1e9;
    const n = Math.ceil(C.radius / C.cell);
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const gx = Math.floor(camX / C.cell) + i;
        const gz = Math.floor(camZ / C.cell) + j;
        if (hash2i(gx, gz, 91) > C.chance) continue;
        const x = (gx + hash2i(gx, gz, 17)) * C.cell;
        const z = (gz + hash2i(gx, gz, 19)) * C.cell;
        const dx = x - camX, dz = z - camZ;
        if (dx * dx + dz * dz > C.radius * C.radius) continue;

        const h0 = w.height(x, z);
        if (h0 < wl + 3) continue;
        // direzione di massima pendenza
        const e = 4;
        const hx = w.height(x + e, z) - w.height(x - e, z);
        const hz = w.height(x, z + e) - w.height(x, z - e);
        const gl = Math.hypot(hx, hz);
        if (gl < 1e-3) continue;
        const dxn = -hx / gl, dzn = -hz / gl;
        // quanto si scende in dieci metri
        const drop = h0 - w.height(x + dxn * 10, z + dzn * 10);
        if (drop < C.minDrop) continue;
        out.push({ x, z, h: h0, dx: dxn, dz: dzn,
          w: lerp(C.width[0], C.width[1], hash2i(gx, gz, 23)) });
        if (out.length >= 14) return out;
      }
    }
    return out;
  }

  /* Segue la pendenza costruendo la striscia. */
  _traceFall(lip) {
    const w = this.world;
    const C = this.cfg;
    const wl = w.hasWater ? w.waterLevel : -1e9;
    const pts = [];
    let x = lip.x, z = lip.z, dx = lip.dx, dz = lip.dz;
    let s = 0;
    for (let k = 0; k < C.maxSteps; k++) {
      const h = w.height(x, z);
      if (h < wl + 0.2) { pts.push({ x, z, h: Math.max(h, wl), s, dx, dz }); break; }
      pts.push({ x, z, h, s, dx, dz });
      // ricalcola la discesa a ogni passo: cosi la cascata gira dove gira la roccia
      const e = 3;
      const hx = w.height(x + e, z) - w.height(x - e, z);
      const hz = w.height(x, z + e) - w.height(x, z - e);
      const gl = Math.hypot(hx, hz) || 1;
      let ndx = -hx / gl, ndz = -hz / gl;
      // un po di inerzia, altrimenti il filo d acqua zigzaga
      dx = dx * 0.55 + ndx * 0.45; dz = dz * 0.55 + ndz * 0.45;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const nx = x + dx * C.step, nz = z + dz * C.step;
      const nh = w.height(nx, nz);
      const slope = (h - nh) / C.step;
      if (k > 4 && slope < 0.22) break;      // il pendio si e addolcito: finisce qui
      s += C.step;
      x = nx; z = nz;
    }
    // meno di sei passi non e una cascata, e una pozzanghera in pendenza
    return pts.length >= 6 ? pts : null;
  }

  _build(camX, camZ) {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (this.mist) { this.group.remove(this.mist); this.mist.geometry.dispose(); this.mist = null; }

    const lips = this._findLips(camX, camZ);
    const pos = [], fall = [], idx = [];
    const mpos = [], mfall = [], midx = [];
    let base = 0, mbase = 0;

    for (const lip of lips) {
      const pts = this._traceFall(lip);
      if (!pts) continue;
      const total = pts[pts.length - 1].s || 1;
      const start = base;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        // perpendicolare alla discesa
        const px = -p.dz, pz = p.dx;
        const t = p.s / total;
        // il velo si allarga scendendo
        const hw = lip.w * (0.5 + t * 0.65) * 0.5;
        const lift = 0.25;
        for (const side of [-1, 1]) {
          pos.push(p.x + px * hw * side, p.h + lift, p.z + pz * hw * side);
          fall.push(t, side, clamp(t, 0, 1));
        }
      }
      for (let k = 0; k < pts.length - 1; k++) {
        const a = start + k * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      base += pts.length * 2;

      // nebbia alla base
      if (this.cfg.mist) {
        const end = pts[pts.length - 1];
        const nP = 3;
        for (let m = 0; m < nP; m++) {
          const r = lip.w * (0.9 + m * 0.5);
          const yy = end.h + 0.6 + m * 1.4;
          const px = -end.dz, pz = end.dx;
          const q = [
            [end.x - px * r, yy - r * 0.5, end.z - pz * r],
            [end.x + px * r, yy - r * 0.5, end.z + pz * r],
            [end.x + px * r, yy + r * 0.5, end.z + pz * r],
            [end.x - px * r, yy + r * 0.5, end.z - pz * r]
          ];
          for (let v = 0; v < 4; v++) {
            mpos.push(q[v][0], q[v][1], q[v][2]);
            mfall.push(v === 0 || v === 3 ? -1 : 1, v < 2 ? 0 : 1, 0);
          }
          midx.push(mbase, mbase + 1, mbase + 2, mbase, mbase + 2, mbase + 3);
          mbase += 4;
        }
      }
    }

    this.stats.falls = lips.length;
    if (!pos.length) return;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);

    if (mpos.length) {
      const gm = new THREE.BufferGeometry();
      gm.setAttribute('position', new THREE.Float32BufferAttribute(mpos, 3));
      gm.setAttribute('aFall', new THREE.Float32BufferAttribute(mfall, 3));
      gm.setIndex(midx);
      gm.computeBoundingSphere();
      this.mist = new THREE.Mesh(gm, this.mistMat);
      this.mist.frustumCulled = false;
      this.mist.renderOrder = 7;
      this.group.add(this.mist);
    }
  }

  update(camX, camZ, time, sunColor, ambient) {
    this.uniforms.uTime.value = time;
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uAmbient.value.copy(ambient);
    const key = Math.floor(camX / 60) + '|' + Math.floor(camZ / 60);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this._build(camX, camZ);
    }
  }

  dispose() {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    if (this.mist) { this.group.remove(this.mist); this.mist.geometry.dispose(); }
    this.material.dispose();
    this.mistMat.dispose();
  }
}
