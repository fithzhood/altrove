/* Altrove - terrain.js
 * Terreno a livelli di dettaglio concentrici (clipmap).
 *
 * Attorno alla camera stanno 4x4 chunk fitti; ogni anello successivo ha chunk
 * larghi il doppio e il buco centrale coincide esattamente con l area coperta
 * dall anello piu fine. Cosi la densita di triangoli segue la distanza e il
 * mondo arriva a due chilometri con circa settantamila vertici.
 *
 * La condizione che tiene insieme tutto: height(x,z) non dipende dal livello.
 * Due chunk adiacenti di livello diverso calcolano la stessa quota sugli stessi
 * punti, quindi combaciano. Le gonne sui bordi coprono il resto, cioe le crepe
 * di un pixel dove la risoluzione cambia.
 */

import * as THREE from '../vendor/three.module.js';
import { GLSL_NOISE } from './noise.js?v=16';

const DIV = 32;          // celle per lato di un chunk
const LEVELS = 5;

export class Terrain {
  constructor(world, fog, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.baseSize = opts.baseSize || 64;
    this.levels = opts.levels || LEVELS;
    this.div = opts.div || DIV;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;

    this.cache = new Map();     // key -> {mesh, geo}
    this.wanted = new Map();    // key -> {ox, oz, size, level}
    this.queue = [];
    this.lastCx = null; this.lastCz = null;
    this.stats = { chunks: 0, built: 0, verts: 0 };

    this.material = this._makeMaterial(opts);
    this.ready = false;
  }

  get radius() {
    // meta lato coperto dall anello piu esterno
    return this.baseSize * Math.pow(2, this.levels - 1) * 2;
  }

  _makeMaterial(opts) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      dithering: true
    });
    mat.shadowSide = THREE.FrontSide;

    this.uniforms = {
      uSnow: { value: 0 },
      uSnowColor: { value: new THREE.Color(0.86, 0.90, 0.98) },
      uWetness: { value: 0 },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color(1.0, 0.30, 0.05) },
      uTime: { value: 0 },
      uDetail: { value: 1 },
      uSeasonTint: { value: new THREE.Vector3(1, 1, 1) },
      uCity: { value: 0 },
      uCityBlock: { value: 92 },
      uCityRoad: { value: 8.5 },
      uCityAvenue: { value: 5.0 }
    };
    const U = this.uniforms;

    mat.onBeforeCompile = (shader) => {
      for (const k in U) shader.uniforms[k] = U[k];

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          in vec4 aTerrain;
          out vec4 vTerrain;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTerrain = aTerrain;`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in vec4 vTerrain;
          uniform float uSnow, uWetness, uGlow, uTime, uDetail;
          uniform float uCity, uCityBlock, uCityRoad, uCityAvenue;
          uniform vec3 uSnowColor, uGlowColor, uSeasonTint;

          /* Distanza con segno dal bordo della carreggiata piu vicina: la
           * stessa formula di world.js, ricopiata qui perche la segnaletica
           * serve a risoluzione di pixel, non di vertice. */
          float cityRoadDist(vec2 p, out vec2 axisDist, out vec2 halfW){
            vec2 idx = floor(p / uCityBlock + 0.5);
            axisDist = abs(p - idx * uCityBlock);
            halfW = vec2(uCityRoad, uCityRoad);
            if (mod(abs(idx.x), 4.0) < 0.5) halfW.x += uCityAvenue;
            if (mod(abs(idx.y), 4.0) < 0.5) halfW.y += uCityAvenue;
            return min(axisDist.x - halfW.x, axisDist.y - halfW.y);
          }
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float dist = length(vAltWorld - cameraPosition);
            float near = 1.0 - smoothstep(20.0, 170.0, dist);

            /* Screziatura ravvicinata: senza, a due metri il terreno e una
             * campitura piatta e si vede che e finto. */
            float d0 = alt_fbm2(vAltWorld.xz * 0.055, 4);
            float d1 = alt_fbm2(vAltWorld.xz * 0.62, 3);
            float d2 = alt_fbm2(vAltWorld.xz * 3.1 + 17.0, 3);
            diffuseColor.rgb *= 1.0 + (d0 - 0.5) * 0.22 * uDetail
                                    + (d1 - 0.5) * 0.15 * uDetail
                                    + (d2 - 0.5) * 0.10 * near * uDetail;

            diffuseColor.rgb *= uSeasonTint;

            if (uCity > 0.5){
              vec2 ad, hw;
              float rd = cityRoadDist(vAltWorld.xz, ad, hw);
              float onRoad = step(rd, -0.05);
              // dentro un incrocio non si disegna la mezzeria
              float inter = step(ad.x, hw.x) * step(ad.y, hw.y);
              float paint = 0.0;
              // mezzeria tratteggiata sull asse piu vicino
              float alongX = step(ad.y - hw.y, ad.x - hw.x);
              float centerX = 1.0 - smoothstep(0.06, 0.13, ad.x);
              float centerZ = 1.0 - smoothstep(0.06, 0.13, ad.y);
              float dashX = step(0.5, fract(vAltWorld.z / 5.0));
              float dashZ = step(0.5, fract(vAltWorld.x / 5.0));
              paint = max(centerX * dashX * (1.0 - alongX), centerZ * dashZ * alongX);
              paint *= (1.0 - inter);
              // linea continua al bordo
              float edgeX = smoothstep(0.20, 0.10, abs(ad.x - hw.x + 0.55));
              float edgeZ = smoothstep(0.20, 0.10, abs(ad.y - hw.y + 0.55));
              paint = max(paint, max(edgeX, edgeZ) * (1.0 - inter));
              // strisce pedonali appena prima dell incrocio
              float nearX = smoothstep(hw.y + 5.5, hw.y + 1.5, ad.y) * step(ad.x, hw.x);
              float zebra = step(0.55, fract(vAltWorld.x / 1.35)) * nearX;
              float nearZ = smoothstep(hw.x + 5.5, hw.x + 1.5, ad.x) * step(ad.y, hw.y);
              zebra = max(zebra, step(0.55, fract(vAltWorld.z / 1.35)) * nearZ);
              paint = max(paint, zebra);
              // la vernice e consumata
              paint *= onRoad * (0.55 + 0.45 * alt_fbm2(vAltWorld.xz * 2.5, 2));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.60, 0.54), clamp(paint, 0.0, 1.0) * 0.85);
            }

            /* Neve: si posa dove il vertice dice che puo posarsi (piatto e in
             * quota) e cresce nel tempo quando nevica. */
            float snowAmt = clamp(uSnow * vTerrain.x * 1.45 - 0.02, 0.0, 1.0);
            snowAmt *= 0.72 + 0.28 * alt_fbm2(vAltWorld.xz * 0.35 + 91.0, 3) * 2.0;
            snowAmt = clamp(snowAmt, 0.0, 1.0);
            vec3 snowC = uSnowColor * (0.90 + 0.20 * alt_fbm2(vAltWorld.xz * 3.0, 2));
            diffuseColor.rgb = mix(diffuseColor.rgb, snowC, snowAmt);

            /* Bagnato: scurisce e lucida. Le pozze stanno dove e piatto. */
            float wet = uWetness * vTerrain.z * (1.0 - snowAmt);
            float puddle = wet * smoothstep(0.52, 0.78, alt_fbm2(vAltWorld.xz * 0.7 + 43.0, 3));
            diffuseColor.rgb *= mix(1.0, 0.55, wet * 0.75 + puddle * 0.25);
            vTerrainWet = max(wet * 0.6, puddle);
            vTerrainSnow = snowAmt;
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.70, vTerrainSnow);
          roughnessFactor = mix(roughnessFactor, 0.075, vTerrainWet);`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          {
            /* Micro-rilievo: perturbo la normale con il gradiente di un rumore.
             * Si spegne con la distanza, altrimenti diventa brulichio. */
            float dist = length(vAltWorld - cameraPosition);
            float amt = (1.0 - smoothstep(8.0, 55.0, dist)) * uDetail * (1.0 - vTerrainWet * 0.8);
            if (amt > 0.004){
              /* Due scale: le gobbe larghe danno il rilievo del terreno, quelle
               * fini la grana. L ampiezza va tenuta bassa, altrimenti la
               * normale si stacca dalla geometria e il suolo sembra fuso. */
              vec2 p = vAltWorld.xz;
              float e = 0.35;
              float a0 = alt_fbm2(p * 0.85, 4);
              float ax = alt_fbm2((p + vec2(e, 0.0)) * 0.85, 4);
              float az = alt_fbm2((p + vec2(0.0, e)) * 0.85, 4);
              vec3 g = vec3(-(ax - a0), 0.0, -(az - a0)) * (0.55 * amt / e);

              float fine = 1.0 - smoothstep(2.0, 14.0, dist);
              if (fine > 0.01){
                float b0 = alt_fbm2(p * 6.5, 3);
                float bx = alt_fbm2((p + vec2(0.06, 0.0)) * 6.5, 3);
                float bz = alt_fbm2((p + vec2(0.0, 0.06)) * 6.5, 3);
                g += vec3(-(bx - b0), 0.0, -(bz - b0)) * (0.020 * amt * fine / 0.06);
              }
              normal = normalize(normal + g);
            }
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          /* Braci: il fattore deve restare basso. L emissivo entra nell HDR
           * prima della mappatura tonale, e a 1.0 una collina intera diventa
           * una macchia bianca. */
          totalEmissiveRadiance += uGlowColor * pow(vTerrain.w, 2.0) * uGlow * 0.16
                                 * (0.68 + 0.32 * sin(uTime * 1.7 + vAltWorld.x * 0.12 + vAltWorld.z * 0.09));`);

      // due varying di servizio usate fra i chunk sopra
      shader.fragmentShader = shader.fragmentShader
        .replace('in vec4 vTerrain;', 'in vec4 vTerrain;\n          float vTerrainWet = 0.0;\n          float vTerrainSnow = 0.0;');
    };
    mat.customProgramCacheKey = () => 'altrove-terrain';
    this.fog.apply(mat);
    return mat;
  }

  /* ------------------------------------------------------------------ *
   * Costruzione di un chunk
   * ------------------------------------------------------------------ */
  _buildChunk(ox, oz, size, level) {
    const N = this.div;
    const cell = size / N;
    const world = this.world;

    /* Campiono una griglia con un anello in piu su ogni lato: serve a calcolare
     * le normali per differenze centrali anche sul bordo, cosi due chunk
     * adiacenti dello stesso livello hanno la stessa normale e non si vede la
     * cucitura nell illuminazione. */
    const G = N + 3;
    const H = new Float32Array(G * G);
    for (let j = 0; j < G; j++) {
      const z = oz + (j - 1) * cell;
      for (let i = 0; i < G; i++) {
        H[j * G + i] = world.height(ox + (i - 1) * cell, z);
      }
    }

    const V = (N + 1) * (N + 1);
    const skirtCount = 4 * (N + 1);
    const total = V + skirtCount;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const ter = new Float32Array(total * 4);
    const surf = [0, 0, 0, 0, 0, 0, 0];

    const inv2c = 1 / (2 * cell);
    let minY = Infinity, maxY = -Infinity;

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const vi = j * (N + 1) + i;
        const gi = (j + 1) * G + (i + 1);
        const h = H[gi];
        const x = ox + i * cell, z = oz + j * cell;
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;

        pos[vi * 3] = i * cell;
        pos[vi * 3 + 1] = h;
        pos[vi * 3 + 2] = j * cell;

        const hL = H[gi - 1], hR = H[gi + 1], hD = H[gi - G], hU = H[gi + G];
        let nx = (hL - hR) * inv2c, ny = 1, nz = (hD - hU) * inv2c;
        const il = 1 / Math.hypot(nx, ny, nz);
        nx *= il; ny *= il; nz *= il;
        nrm[vi * 3] = nx; nrm[vi * 3 + 1] = ny; nrm[vi * 3 + 2] = nz;

        world.surface(x, z, h, ny, surf);
        col[vi * 3] = surf[0]; col[vi * 3 + 1] = surf[1]; col[vi * 3 + 2] = surf[2];
        ter[vi * 4] = surf[3]; ter[vi * 4 + 1] = surf[4];
        ter[vi * 4 + 2] = surf[5]; ter[vi * 4 + 3] = surf[6];
      }
    }

    // gonne: copia del bordo abbassata, per tappare le crepe fra livelli
    const drop = Math.max(cell * 2.5, 1.5);
    let sk = V;
    const edges = [];
    for (let i = 0; i <= N; i++) edges.push(0 * (N + 1) + i);          // j=0
    for (let i = 0; i <= N; i++) edges.push(N * (N + 1) + i);          // j=N
    for (let j = 0; j <= N; j++) edges.push(j * (N + 1) + 0);          // i=0
    for (let j = 0; j <= N; j++) edges.push(j * (N + 1) + N);          // i=N
    for (let k = 0; k < edges.length; k++) {
      const src = edges[k], dst = sk + k;
      pos[dst * 3] = pos[src * 3];
      pos[dst * 3 + 1] = pos[src * 3 + 1] - drop;
      pos[dst * 3 + 2] = pos[src * 3 + 2];
      nrm[dst * 3] = nrm[src * 3]; nrm[dst * 3 + 1] = nrm[src * 3 + 1]; nrm[dst * 3 + 2] = nrm[src * 3 + 2];
      col[dst * 3] = col[src * 3]; col[dst * 3 + 1] = col[src * 3 + 1]; col[dst * 3 + 2] = col[src * 3 + 2];
      ter[dst * 4] = ter[src * 4]; ter[dst * 4 + 1] = ter[src * 4 + 1];
      ter[dst * 4 + 2] = ter[src * 4 + 2]; ter[dst * 4 + 3] = ter[src * 4 + 3];
    }

    const triCount = N * N * 2 + 4 * N * 2;
    const idx = (total > 65535) ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
    let t = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + (N + 1), d = c + 1;
        idx[t++] = a; idx[t++] = c; idx[t++] = b;
        idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
    }
    // quattro strisce di gonna (materiale a doppia faccia: l orientamento non conta)
    for (let e = 0; e < 4; e++) {
      const base = V + e * (N + 1);
      for (let i = 0; i < N; i++) {
        const top0 = edges[e * (N + 1) + i], top1 = edges[e * (N + 1) + i + 1];
        const bot0 = base + i, bot1 = base + i + 1;
        idx[t++] = top0; idx[t++] = bot0; idx[t++] = top1;
        idx[t++] = top1; idx[t++] = bot0; idx[t++] = bot1;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aTerrain', new THREE.BufferAttribute(ter, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(size * 0.5, (minY + maxY) * 0.5, size * 0.5),
      Math.hypot(size * 0.71, (maxY - minY) * 0.5 + drop) + 1
    );

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(ox, 0, oz);
    mesh.castShadow = level <= 1;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = 0;
    return { mesh, geo, verts: total };
  }

  /* ------------------------------------------------------------------ *
   * Quali chunk servono, dato dove sta la camera
   * ------------------------------------------------------------------ */
  _computeWanted(camX, camZ) {
    const W = this.wanted;
    W.clear();
    const S0 = this.baseSize;
    const o0x = Math.floor(camX / S0) * S0;
    const o0z = Math.floor(camZ / S0) * S0;

    // livello 0: 4x4 chunk centrati sulla camera
    let coverX = o0x - 2 * S0;
    let coverZ = o0z - 2 * S0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const ox = coverX + i * S0, oz = coverZ + j * S0;
        W.set(`0|${ox}|${oz}`, { ox, oz, size: S0, level: 0 });
      }
    }

    // livelli superiori: anello di 12 chunk, il buco centrale coincide con la
    // copertura del livello precedente
    for (let L = 1; L < this.levels; L++) {
      const S = S0 * Math.pow(2, L);
      const holeX = coverX, holeZ = coverZ;
      for (let j = -1; j <= 2; j++) {
        for (let i = -1; i <= 2; i++) {
          if (i >= 0 && i <= 1 && j >= 0 && j <= 1) continue;   // il buco
          const ox = holeX + i * S, oz = holeZ + j * S;
          W.set(`${L}|${ox}|${oz}`, { ox, oz, size: S, level: L });
        }
      }
      coverX = holeX - S;
      coverZ = holeZ - S;
    }
  }

  /* budget = quanti chunk costruire al massimo in questo fotogramma */
  update(camX, camZ, budget = 2) {
    const cx = Math.floor(camX / this.baseSize);
    const cz = Math.floor(camZ / this.baseSize);
    if (cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx; this.lastCz = cz;
      this._computeWanted(camX, camZ);

      // butta via quello che non serve piu
      for (const [key, entry] of this.cache) {
        if (!this.wanted.has(key)) {
          this.group.remove(entry.mesh);
          entry.geo.dispose();
          this.cache.delete(key);
        }
      }
      // coda di costruzione: prima i livelli fini, poi per distanza
      this.queue = [];
      for (const [key, w] of this.wanted) {
        if (!this.cache.has(key)) {
          const dx = w.ox + w.size * 0.5 - camX;
          const dz = w.oz + w.size * 0.5 - camZ;
          this.queue.push({ key, w, d: w.level * 1e6 + dx * dx + dz * dz });
        }
      }
      this.queue.sort((a, b) => a.d - b.d);
    }

    let built = 0;
    while (this.queue.length && built < budget) {
      const item = this.queue.shift();
      if (this.cache.has(item.key)) continue;
      const c = this._buildChunk(item.w.ox, item.w.oz, item.w.size, item.w.level);
      this.cache.set(item.key, c);
      this.group.add(c.mesh);
      built++;
      this.stats.built++;
    }
    this.stats.chunks = this.cache.size;
    if (!this.queue.length) this.ready = true;
    return this.queue.length;
  }

  /* Costruisce tutto subito: usato al primo caricamento, dietro la schermata
   * di attesa, perche il mondo appaia gia completo. */
  buildAll(camX, camZ) {
    this.lastCx = null;
    this.update(camX, camZ, 1e9);
    this.ready = true;
  }

  dispose() {
    for (const [, e] of this.cache) { this.group.remove(e.mesh); e.geo.dispose(); }
    this.cache.clear();
    this.material.dispose();
  }
}
