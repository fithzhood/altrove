/* Altrove - scatter.js
 * Distribuisce la vegetazione sul terreno.
 *
 * Il mondo e infinito, quindi non esiste un elenco di alberi. La posizione di
 * ogni pianta viene da un hash delle coordinate: la stessa cella restituisce
 * sempre lo stesso albero, e si puo ricalcolare quando serve invece di
 * ricordarla.
 *
 * L unita di lavoro e la tessera. Muovendosi si generano solo le tessere nuove,
 * quelle vecchie restano in cache. Ogni fotogramma le tessere attive vengono
 * ricompattate negli InstancedMesh: un disegno per variante, non per pianta.
 */

import * as THREE from '../vendor/three.module.js';
import { hash2i, clamp, lerp, saturate, mulberry32 } from './noise.js?v=14';
import { buildProp, PROP_HEIGHT, lin } from './props.js?v=14';
import { GLSL_NOISE } from './noise.js?v=14';
import { CITY } from './world.js?v=14';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _nrm = new THREE.Vector3();

const FOLIAGE_TYPES = new Set([
  'conifer', 'broadleaf', 'birch', 'swampTree', 'palm', 'acacia',
  'bush', 'dryBush', 'fern', 'grassTuft', 'tallGrass', 'reed', 'flower',
  'saguaro', 'barrelCactus', 'mushroom',
  'twistedTree', 'glowMushroom', 'giantMushroom', 'fairyTree', 'ajisaTree', 'bamboo', 'cycad',
  'coral', 'kelp', 'anemone'
]);

export class Scatter {
  constructor(world, fog, biome, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.biome = biome;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.qualityMul = opts.quality || 1;
    this.seasonId = opts.season || 'estate';
    this.variants = opts.variants || 3;

    this.uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
      uWindAmp: { value: 0.12 },
      uWindSpeed: { value: 1.0 },
      uSnow: { value: 0 },
      uSnowColor: { value: new THREE.Color(0.88, 0.92, 1.0) },
      uWetness: { value: 0 },
      uSeasonTint: { value: new THREE.Vector3(1, 1, 1) }
    };

    this.matCache = new Map();
    this.rules = [];
    this.tiles = new Map();
    this.queue = [];
    this.dirty = true;
    this.lastKey = null;
    this.stats = { instances: 0, tiles: 0, draws: 0 };

    this._buildRules();
  }

  /* ------------------------------------------------------------------ */
  _material(foliage, emissive) {
    const key = (foliage ? 'f' : 's') + '|' + (emissive > 0 ? emissive.toFixed(2) : '0');
    if (this.matCache.has(key)) return this.matCache.get(key);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: foliage ? 0.88 : 0.92,
      metalness: 0,
      side: foliage ? THREE.DoubleSide : THREE.FrontSide
    });
    mat.shadowSide = THREE.FrontSide;
    const U = this.uniforms;
    const emi = emissive || 0;

    mat.onBeforeCompile = (shader) => {
      for (const k in U) shader.uniforms[k] = U[k];
      shader.uniforms.uEmissive = { value: emi };
      shader.uniforms.uTranslucency = { value: foliage ? 1.0 : 0.0 };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          in float aFlex;
          out float vFlex;
          out vec3 vWorldNrm;
          uniform float uTime, uWindAmp, uWindSpeed;
          uniform vec2 uWindDir;
          ${GLSL_NOISE}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFlex = aFlex;
          #ifdef USE_INSTANCING
            vWorldNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          #else
            vWorldNrm = normalize(mat3(modelMatrix) * objectNormal);
          #endif
          {
            /* Il vento e coerente nello spazio del mondo: due cespugli vicini
             * si piegano insieme, uno lontano e sfasato. La fase viene dalla
             * posizione dell istanza, non da quella del vertice, cosi la pianta
             * non si deforma su se stessa. */
            #ifdef USE_INSTANCING
              vec3 iw = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            #else
              vec3 iw = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            #endif
            float t = uTime * uWindSpeed;
            float ph = dot(iw.xz, vec2(0.055, 0.041)) + t * 0.9;
            // raffiche: un inviluppo lento sopra l oscillazione veloce
            float gust = 0.55 + 0.45 * alt_noise2(iw.xz * 0.010 + vec2(t * 0.12, 0.0));
            float sway = sin(ph) * 0.6 + sin(ph * 2.31 + 1.7) * 0.26 + sin(ph * 0.57) * 0.30;
            float flutter = sin(ph * 6.3 + iw.x * 0.7) * 0.16;
            float amt = uWindAmp * gust * (sway + flutter);
            float w = aFlex * aFlex;
            transformed.xz += uWindDir * amt * w;
            transformed.y -= abs(amt) * w * 0.18;   // piegandosi si abbassa
          }`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in float vFlex;
          in vec3 vWorldNrm;
          uniform float uSnow, uWetness, uEmissive, uTranslucency;
          uniform vec3 uSnowColor, uSeasonTint;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            diffuseColor.rgb *= uSeasonTint;
            /* La neve si posa sulle facce rivolte in su. Serve la normale nello
             * spazio del mondo: vNormal e in spazio vista e girerebbe con la
             * testa del giocatore. */
            float upness = clamp(vWorldNrm.y * 0.5 + 0.5, 0.0, 1.0);
            float sn = clamp(uSnow * 1.5 - 0.15, 0.0, 1.0) * pow(upness, 2.2);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, sn * 0.92);
            diffuseColor.rgb *= mix(1.0, 0.68, uWetness * 0.7 * (1.0 - sn));
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.35, uWetness * 0.6);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * uEmissive * 0.85;
          if (uTranslucency > 0.01){
            /* Una foglia e sottile: parte della luce la attraversa invece di
             * fermarsi. Senza questo termine la faccia in ombra di ogni filo
             * d erba viene quasi nera e il prato si riempie di puntini scuri.
             * In controluce il verde si accende, come succede davvero. */
            vec3 V = normalize(cameraPosition - vAltWorld);
            float back = pow(max(0.0, dot(-V, altSunDir)), 3.0);
            float wrap = max(0.0, dot(normalize(vWorldNrm), altSunDir) * 0.5 + 0.5);
            totalEmissiveRadiance += diffuseColor.rgb * altSunColor
                                   * (0.032 * wrap + 0.115 * back) * uTranslucency;
          }`);
    };
    mat.customProgramCacheKey = () => 'altrove-prop|' + key;
    this.fog.apply(mat);
    this.matCache.set(key, mat);
    return mat;
  }

  /* ------------------------------------------------------------------ *
   * Prepara regole, geometrie e InstancedMesh
   * ------------------------------------------------------------------ */
  _buildRules() {
    const biome = this.biome;
    const qm = this.qualityMul;

    biome.scatter.forEach((rule, ri) => {
      if (rule.season && !rule.season.includes(this.seasonId)) return;

      const radius = rule.radius * (rule.grass ? Math.min(1, 0.6 + qm * 0.4) : 1);
      const density = rule.density * qm * (rule.grass ? 1 : 1);
      const tile = clamp(radius / 4, 22, 110);
      const cell = Math.max(0.55, 1 / Math.sqrt(Math.max(density, 1e-5)));
      const nVar = rule.grass || PROP_HEIGHT[rule.type] < 1.5 ? 2 : this.variants;

      const tintA = lin(rule.tint[0]), tintB = lin(rule.tint[1]);
      const geos = [];
      const meshes = [];
      const rnd = mulberry32(0xA17 + ri * 7919 + this.world.seed);
      const mat = this._material(FOLIAGE_TYPES.has(rule.type), rule.emissive || 0);

      // stima del numero massimo di istanze in vista
      const area = Math.PI * radius * radius;
      const maxInst = Math.min(90000, Math.ceil(area * density * 1.45) + 32);
      const perVar = Math.ceil(maxInst / nVar) + 16;

      for (let v = 0; v < nVar; v++) {
        const t = nVar === 1 ? 0.5 : v / (nVar - 1);
        const tint = [
          lerp(tintA[0], tintB[0], t), lerp(tintA[1], tintB[1], t), lerp(tintA[2], tintB[2], t)
        ];
        const geo = buildProp(rule.type, rnd, tint);
        geos.push(geo);
        const im = new THREE.InstancedMesh(geo, mat, perVar);
        // variazione di tinta per istanza: due cespugli identici si notano
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perVar * 3).fill(1), 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        im.count = 0;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = !!rule.shadow;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.matrixAutoUpdate = false;
        im.renderOrder = 1;
        this.group.add(im);
        meshes.push(im);
      }

      this.rules.push({
        ri, rule, radius, density, tile, cell, nVar, meshes, geos, perVar,
        buf: meshes.map(() => ({ n: 0 }))
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Generazione di una tessera
   * ------------------------------------------------------------------ */
  _makeTile(R, tx, tz) {
    const { rule, cell, tile, nVar } = R;
    const world = this.world;
    const ox = tx * tile, oz = tz * tile;
    const n = Math.max(1, Math.round(tile / cell));
    const step = tile / n;

    const hmin = rule.height[0], hmax = rule.height[1];
    const smin = rule.slope[0], smax = rule.slope[1];
    const mmin = rule.moisture[0], mmax = rule.moisture[1];
    const sc0 = rule.scale[0], sc1 = rule.scale[1];
    const tilt = rule.tilt || 0;
    const wl = world.hasWater ? world.waterLevel : -1e9;
    const buried = PROP_HEIGHT[rule.type] * 0.02;

    const out = [];
    for (let v = 0; v < nVar; v++) out.push([]);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gx = tx * 10007 + i, gz = tz * 10009 + j;
        const h0 = hash2i(gx, gz, R.ri * 131 + 7);
        // diradamento: non tutte le celle producono qualcosa
        if (h0 > 0.86) continue;
        const jx = hash2i(gx, gz, R.ri * 131 + 11);
        const jz = hash2i(gx, gz, R.ri * 131 + 13);
        const x = ox + (i + 0.5 + (jx - 0.5) * 0.92) * step;
        const z = oz + (j + 0.5 + (jz - 0.5) * 0.92) * step;

        if (world.blocked && world.blocked(x, z)) continue;
        const h = world.height(x, z);
        if (h < hmin || h > hmax) continue;
        if (!rule.underwater && h < wl + 0.12 && rule.type !== 'reed' && rule.type !== 'swampTree') continue;

        /* Filari: la coltivazione non e casuale. Tenendo solo i punti
         * vicini a una retta ogni N metri, il campo si allinea. */
        if (rule.rows) {
          const ca = Math.cos(rule.rows.angle), sa = Math.sin(rule.rows.angle);
          const u = (x * ca + z * sa) / rule.rows.period;
          if (Math.abs(u - Math.round(u)) > rule.rows.width) continue;
        }
        if (rule.avoidRoads && world.isCity) {
          const rd = world.roadDistance(x, z);
          if (rd < 2.2) continue;
          /* In citta gli alberi stanno sul marciapiede, non dentro i palazzi:
           * senza questa fascia crescerebbero in mezzo agli isolati. */
          if (rule.roadBand && rd > rule.roadBand) continue;
        }

        // pendenza con differenze in avanti: due chiamate invece di quattro
        const e = 1.4;
        const hx = world.height(x + e, z), hz = world.height(x, z + e);
        let nx = (h - hx) / e, nz = (h - hz) / e;
        const ny = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        const slope = 1 - ny;
        if (slope < smin || slope > smax) continue;

        const m = world.moisture(x, z, h);
        if (m < mmin || m > mmax) continue;

        // probabilita finale modulata dall umidita: i bordi si sfrangiano
        const p = hash2i(gx, gz, R.ri * 131 + 17);
        const fit = saturate((m - mmin) / 0.18) * saturate((mmax - m) / 0.18 + 0.4);
        if (p > 0.30 + 0.70 * fit) continue;

        const v = nVar === 1 ? 0 : Math.floor(hash2i(gx, gz, R.ri * 131 + 19) * nVar) % nVar;
        const sc = lerp(sc0, sc1, hash2i(gx, gz, R.ri * 131 + 23));
        const rot = hash2i(gx, gz, R.ri * 131 + 29) * Math.PI * 2;
        const tiltX = (hash2i(gx, gz, R.ri * 131 + 31) - 0.5) * 2 * tilt;
        const tiltZ = (hash2i(gx, gz, R.ri * 131 + 37) - 0.5) * 2 * tilt;

        // i sassi si coricano sul pendio, le piante restano dritte
        let ax = tiltX, az = tiltZ;
        if (!FOLIAGE_TYPES.has(rule.type)) {
          ax += Math.atan2(nz, 1) * 0.75;
          az += -Math.atan2(nx, 1) * 0.75;
        }

        /* Quota aggiuntiva: serve alle rocce sospese, che devono stare in
         * aria e non appoggiate al suolo. */
        let yExtra = 0;
        if (rule.yOffset) {
          yExtra = rule.yOffset[0] + hash2i(gx, gz, R.ri * 131 + 47) * (rule.yOffset[1] - rule.yOffset[0]);
        }
        const cj = hash2i(gx, gz, R.ri * 131 + 41);
        const cj2 = hash2i(gx, gz, R.ri * 131 + 43);
        out[v].push(x, h - buried * sc + yExtra, z, rot, ax, az, sc,
          0.84 + cj * 0.32, 0.86 + cj2 * 0.28, 0.84 + (1 - cj) * 0.30);
      }
    }
    return out.map(a => new Float32Array(a));
  }

  /* ------------------------------------------------------------------ *
   * Aggiornamento
   * ------------------------------------------------------------------ */
  update(camX, camZ, budget = 3) {
    let built = 0;
    let anyNew = false;

    for (const R of this.rules) {
      const t = R.tile;
      const r = R.radius;
      const tx0 = Math.floor((camX - r) / t), tx1 = Math.floor((camX + r) / t);
      const tz0 = Math.floor((camZ - r) / t), tz1 = Math.floor((camZ + r) / t);

      R.active = R.active || [];
      const active = [];
      let missing = null;
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          // scarta le tessere fuori dal cerchio
          const cx = (tx + 0.5) * t - camX, cz = (tz + 0.5) * t - camZ;
          if (cx * cx + cz * cz > (r + t * 0.71) * (r + t * 0.71)) continue;
          const key = R.ri + '|' + tx + '|' + tz;
          let tile = this.tiles.get(key);
          if (!tile) {
            if (built < budget) {
              tile = this._makeTile(R, tx, tz);
              this.tiles.set(key, tile);
              built++;
              anyNew = true;
            } else {
              if (!missing) missing = true;
              continue;
            }
          }
          active.push(tile);
        }
      }
      R.activeTiles = active;
      R.pending = !!missing;
    }

    // scarta le tessere lontane
    if (anyNew && this.tiles.size > 3000) {
      for (const [key] of this.tiles) {
        const p = key.split('|');
        const R = this.rules.find(r => r.ri === +p[0]);
        if (!R) { this.tiles.delete(key); continue; }
        const cx = (+p[1] + 0.5) * R.tile - camX, cz = (+p[2] + 0.5) * R.tile - camZ;
        const lim = R.radius * 1.6;
        if (cx * cx + cz * cz > lim * lim) this.tiles.delete(key);
      }
    }

    this._repack();
    return this.rules.some(R => R.pending);
  }

  /* Ricompatta le tessere attive nei buffer degli InstancedMesh. Con qualche
   * decina di migliaia di istanze e una copia di memoria, non un ciclo di
   * disegno per pianta. */
  _repack() {
    let total = 0, draws = 0, tiles = 0;
    for (const R of this.rules) {
      const acts = R.activeTiles || [];
      tiles += acts.length;
      for (let v = 0; v < R.nVar; v++) {
        const im = R.meshes[v];
        const arr = im.instanceMatrix.array;
        const carr = im.instanceColor ? im.instanceColor.array : null;
        let k = 0;
        for (const tile of acts) {
          const d = tile[v];
          for (let p = 0; p < d.length; p += 10) {
            if (k >= R.perVar) break;
            _pos.set(d[p], d[p + 1], d[p + 2]);
            _e.set(d[p + 4], d[p + 3], d[p + 5], 'YXZ');
            _q.setFromEuler(_e);
            _scl.setScalar(d[p + 6]);
            _m4.compose(_pos, _q, _scl);
            _m4.toArray(arr, k * 16);
            if (carr) { carr[k * 3] = d[p + 7]; carr[k * 3 + 1] = d[p + 8]; carr[k * 3 + 2] = d[p + 9]; }
            k++;
          }
          if (k >= R.perVar) break;
        }
        im.count = k;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        total += k;
        if (k > 0) draws++;
      }
    }
    this.stats.instances = total;
    this.stats.draws = draws;
    this.stats.tiles = tiles;
  }

  /* Prima costruzione: niente budget, si vuole il mondo gia pieno. */
  buildAll(camX, camZ) {
    let guard = 0;
    while (this.update(camX, camZ, 400) && guard++ < 60);
  }

  setWind(dirAngle, strength) {
    this.uniforms.uWindDir.value.set(Math.cos(dirAngle), Math.sin(dirAngle));
    this.uniforms.uWindAmp.value = 0.035 + strength * 0.42;
    this.uniforms.uWindSpeed.value = 0.6 + strength * 2.4;
  }

  setTime(t) { this.uniforms.uTime.value = t; }
  setSnow(v, color) {
    this.uniforms.uSnow.value = v;
    if (color) this.uniforms.uSnowColor.value.copy(color);
  }
  setWetness(v) { this.uniforms.uWetness.value = v; }
  setSeasonTint(t) { this.uniforms.uSeasonTint.value.set(t[0], t[1], t[2]); }

  dispose() {
    for (const R of this.rules) {
      R.meshes.forEach(m => { this.group.remove(m); m.dispose(); });
      R.geos.forEach(g => g.dispose());
    }
    this.matCache.forEach(m => m.dispose());
    this.rules = [];
    this.tiles.clear();
  }
}
