/* Altrove - water.js
 * Mare, laghi, palude e colate di lava: la stessa superficie con parametri
 * diversi.
 *
 * Tre cose fanno la differenza fra acqua e un piano azzurro:
 *  1. Fresnel. Guardando in giu si vede il fondo, guardando lontano si vede il
 *     cielo riflesso. Il riflesso arriva dalla stessa LUT del cielo, quindi al
 *     tramonto l acqua diventa arancione da sola.
 *  2. Profondita. Una mappa dell altezza del fondo attorno al giocatore dice
 *     dove l acqua e bassa: li il colore vira al turchese e nasce la schiuma.
 *  3. Onde di Gerstner. I vertici non salgono e basta, si spostano anche in
 *     orizzontale verso la cresta: e quello che rende il profilo appuntito
 *     sopra e largo sotto, invece che una sinusoide.
 *
 * La griglia e polare e segue la camera: fitta sotto i piedi, larghissima
 * all orizzonte.
 */

import * as THREE from '../vendor/three.module.js';
import { GLSL_NOISE } from './noise.js?v=1';
import { GLSL_FOG_DECL } from './fog.js?v=1';

const DEPTH_RES = 128;
const DEPTH_SPAN = 620;      // metri coperti dalla mappa di profondita

export const WATER_KINDS = {
  sea: {
    deep: [0.010, 0.055, 0.085], shallow: [0.06, 0.42, 0.42], foam: [0.90, 0.97, 1.0],
    waveAmp: 0.36, waveLen: 26, choppy: 0.72, reflect: 1.0, rough: 0.020,
    depthFade: 7.0, foamWidth: 2.6, glow: 0, speed: 1.0, opacityDeep: 1.0
  },
  lake: {
    deep: [0.014, 0.045, 0.055], shallow: [0.07, 0.22, 0.20], foam: [0.85, 0.92, 0.95],
    waveAmp: 0.075, waveLen: 9, choppy: 0.45, reflect: 1.0, rough: 0.014,
    depthFade: 3.6, foamWidth: 1.1, glow: 0, speed: 0.7, opacityDeep: 1.0
  },
  swamp: {
    deep: [0.012, 0.024, 0.011], shallow: [0.045, 0.075, 0.030], foam: [0.30, 0.36, 0.20],
    waveAmp: 0.030, waveLen: 5, choppy: 0.3, reflect: 0.78, rough: 0.055,
    depthFade: 1.6, foamWidth: 0.8, glow: 0, speed: 0.45, opacityDeep: 1.0
  },
  ice: {
    deep: [0.30, 0.44, 0.52], shallow: [0.52, 0.68, 0.76], foam: [0.94, 0.97, 1.0],
    waveAmp: 0.008, waveLen: 40, choppy: 0.1, reflect: 0.9, rough: 0.10,
    depthFade: 5.0, foamWidth: 2.2, glow: 0, speed: 0.15, opacityDeep: 1.0
  },
  cloudsea: {
    deep: [0.42, 0.46, 0.52], shallow: [0.86, 0.89, 0.95], foam: [1.0, 1.0, 1.0],
    waveAmp: 1.6, waveLen: 90, choppy: 0.25, reflect: 0.10, rough: 0.85,
    depthFade: 40.0, foamWidth: 14.0, glow: 0, speed: 0.16, opacityDeep: 1.0
  },
  emerald: {
    deep: [0.020, 0.075, 0.055], shallow: [0.10, 0.40, 0.26], foam: [0.86, 1.0, 0.90],
    waveAmp: 0.10, waveLen: 11, choppy: 0.45, reflect: 1.0, rough: 0.016,
    depthFade: 4.0, foamWidth: 1.3, glow: 0, speed: 0.7, opacityDeep: 1.0
  },
  mirror: {
    deep: [0.30, 0.32, 0.36], shallow: [0.72, 0.74, 0.78], foam: [1.0, 1.0, 1.0],
    waveAmp: 0.006, waveLen: 26, choppy: 0.05, reflect: 1.0, rough: 0.004,
    depthFade: 0.35, foamWidth: 0.18, glow: 0, speed: 0.25, opacityDeep: 1.0
  },
  hotspring: {
    deep: [0.03, 0.22, 0.26], shallow: [0.30, 0.86, 0.80], foam: [0.95, 0.92, 0.70],
    waveAmp: 0.030, waveLen: 5, choppy: 0.30, reflect: 0.92, rough: 0.020,
    depthFade: 1.8, foamWidth: 1.4, glow: 0, speed: 0.45, opacityDeep: 1.0
  },
  lava: {
    deep: [0.045, 0.008, 0.003], shallow: [1.0, 0.28, 0.03], foam: [1.0, 0.72, 0.20],
    waveAmp: 0.11, waveLen: 15, choppy: 0.35, reflect: 0.22, rough: 0.28,
    depthFade: 2.2, foamWidth: 1.6, glow: 1.0, speed: 0.16, opacityDeep: 1.0
  }
};

export class Water {
  constructor(world, fog, kind, level, opts = {}) {
    this.world = world;
    this.fog = fog;
    this.level = level;
    this.k = WATER_KINDS[kind] || WATER_KINDS.lake;
    this.radius = opts.radius || 2400;

    /* --- mappa di profondita del fondo --- */
    this.depthData = new Float32Array(DEPTH_RES * DEPTH_RES);
    this.depthTex = new THREE.DataTexture(
      this.depthData, DEPTH_RES, DEPTH_RES, THREE.RedFormat, THREE.FloatType
    );
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.wrapS = this.depthTex.wrapT = THREE.ClampToEdgeWrapping;
    this.depthTex.needsUpdate = true;
    this.depthCenter = new THREE.Vector2(1e9, 1e9);

    this.uniforms = {
      uTime: { value: 0 },
      uLevel: { value: level },
      uDeep: { value: new THREE.Vector3(...this.k.deep) },
      uShallow: { value: new THREE.Vector3(...this.k.shallow) },
      uFoamCol: { value: new THREE.Vector3(...this.k.foam) },
      uWaveAmp: { value: this.k.waveAmp },
      uWaveLen: { value: this.k.waveLen },
      uChoppy: { value: this.k.choppy },
      uReflect: { value: this.k.reflect },
      uRough: { value: this.k.rough },
      uDepthFade: { value: this.k.depthFade },
      uFoamWidth: { value: this.k.foamWidth },
      uGlow: { value: this.k.glow },
      uSpeed: { value: this.k.speed },
      uWindDir: { value: new THREE.Vector2(0.86, 0.5) },
      uWindAmp: { value: 1.0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uSkyLut: { value: null },
      uDepthMap: { value: this.depthTex },
      uDepthCenter: { value: new THREE.Vector2() },
      uDepthSpan: { value: DEPTH_SPAN },
      uWetSpec: { value: 1 },
      uBottom: { value: new THREE.Vector3(0.35, 0.30, 0.20) }
    };
    for (const key in this.fog.u) this.uniforms[key] = this.fog.u[key];

    this.material = this._makeMaterial();
    this.mesh = new THREE.Mesh(this._makeGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
  }

  /* Griglia polare: gli anelli si allargano col quadrato, cosi la risoluzione
   * segue la prospettiva senza sprecare vertici all orizzonte. */
  _makeGeometry() {
    const N = 84, M = 108;
    const R = this.radius;
    const verts = (N + 1) * M + 1;
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    // centro
    pos[0] = 0; pos[1] = 0; pos[2] = 0;
    let v = 1;
    for (let i = 0; i <= N; i++) {
      const t = (i + 1) / (N + 1);
      const r = R * Math.pow(t, 2.6) + 0.6;
      for (let j = 0; j < M; j++) {
        const a = (j / M) * Math.PI * 2;
        pos[v * 3] = Math.cos(a) * r;
        pos[v * 3 + 1] = 0;
        pos[v * 3 + 2] = Math.sin(a) * r;
        uv[v * 2] = t; uv[v * 2 + 1] = j / M;
        v++;
      }
    }
    const tris = M + N * M * 2;
    const idx = new Uint32Array(tris * 3);
    let t2 = 0;
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      idx[t2++] = 0; idx[t2++] = 1 + j; idx[t2++] = 1 + j2;
    }
    for (let i = 0; i < N; i++) {
      const a0 = 1 + i * M, a1 = 1 + (i + 1) * M;
      for (let j = 0; j < M; j++) {
        const j2 = (j + 1) % M;
        idx[t2++] = a0 + j; idx[t2++] = a1 + j; idx[t2++] = a0 + j2;
        idx[t2++] = a0 + j2; idx[t2++] = a1 + j; idx[t2++] = a1 + j2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R * 1.2);
    return g;
  }

  _makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec3 vAltWorld;
        varying vec3 vWNormal;
        varying float vDist;
        varying float vCrest;
        uniform float uTime, uLevel, uWaveAmp, uWaveLen, uChoppy, uSpeed, uWindAmp;
        uniform float altCurve;
        uniform vec2 uWindDir;

        /* Onda di Gerstner: il vertice non sale soltanto, scivola anche verso
         * la cresta. Da qui il profilo appuntito sopra e largo sotto. */
        void gerstner(vec2 p, vec2 dir, float len, float amp, float steep, float t,
                      inout vec3 disp, inout vec3 tang, inout vec3 bin){
          float k = 6.2831853 / len;
          float c = sqrt(9.81 / k);
          float f = k * dot(dir, p) - c * t;
          float a = amp;
          float q = steep / (k * a * 4.0 + 1e-4);
          q = min(q, 1.0);
          float sf = sin(f), cf = cos(f);
          disp.xz += q * a * dir * cf;
          disp.y  += a * sf;
          tang.x += -q * dir.x * dir.x * k * a * sf;
          tang.y += dir.x * k * a * cf;
          tang.z += -q * dir.x * dir.y * k * a * sf;
          bin.x  += -q * dir.x * dir.y * k * a * sf;
          bin.y  += dir.y * k * a * cf;
          bin.z  += -q * dir.y * dir.y * k * a * sf;
        }

        void main(){
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          wp.y = uLevel;
          vec2 p = wp.xz;
          float t = uTime * uSpeed;

          float amp = uWaveAmp * uWindAmp;
          vec3 disp = vec3(0.0);
          vec3 tang = vec3(1.0, 0.0, 0.0);
          vec3 bin  = vec3(0.0, 0.0, 1.0);

          vec2 d0 = normalize(uWindDir);
          vec2 d1 = normalize(d0 + vec2(-0.55, 0.62));
          vec2 d2 = normalize(d0 + vec2(0.72, -0.38));
          vec2 d3 = normalize(d0 + vec2(0.12, 0.95));

          /* Il dettaglio fine si spegne con la distanza: a duecento metri una
           * cresta di venti centimetri sta sotto il pixel e diventa brulichio. */
          float dcam = length(wp.xz - cameraPosition.xz);
          float fine = 1.0 - smoothstep(30.0, 260.0, dcam);

          gerstner(p, d0, uWaveLen,        amp,        uChoppy, t, disp, tang, bin);
          gerstner(p, d1, uWaveLen * 0.55, amp * 0.55, uChoppy, t * 1.17, disp, tang, bin);
          gerstner(p, d2, uWaveLen * 0.31, amp * 0.30 * fine, uChoppy * 0.8, t * 1.44, disp, tang, bin);
          gerstner(p, d3, uWaveLen * 0.13, amp * 0.13 * fine, uChoppy * 0.6, t * 1.9, disp, tang, bin);

          wp += disp;
          vCrest = clamp(disp.y / max(amp * 1.6, 1e-3), -1.0, 1.0);
          vWNormal = normalize(cross(bin, tang));
          if (vWNormal.y < 0.0) vWNormal = -vWNormal;

          vAltWorld = wp;
          vDist = dcam;
          vec4 mvp = viewMatrix * vec4(wp, 1.0);
          mvp.y -= mvp.z * mvp.z * altCurve;
          gl_Position = projectionMatrix * mvp;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vAltWorld;
        varying vec3 vWNormal;
        varying float vDist;
        varying float vCrest;
        uniform float uTime, uLevel, uReflect, uRough, uDepthFade, uFoamWidth, uGlow, uDepthSpan, uSpeed;
        uniform vec3 uDeep, uShallow, uFoamCol, uSunDir, uSunColor, uBottom;
        uniform sampler2D uSkyLut, uDepthMap;
        uniform vec2 uDepthCenter;
        ${GLSL_NOISE}
        ${GLSL_FOG_DECL}

        float bedHeight(vec2 p){
          vec2 uv = (p - uDepthCenter) / uDepthSpan + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return -999.0;
          return texture2D(uDepthMap, uv).r;
        }

        void main(){
          vec3 V = normalize(cameraPosition - vAltWorld);
          vec3 N = normalize(vWNormal);

          /* Increspatura fine sulla normale: le onde geometriche danno la forma
           * grande, questa da il luccichio. */
          vec2 rp = vAltWorld.xz;
          float tt = uTime * uSpeed;
          float e = 0.35;
          float detail = 1.0 - smoothstep(8.0, 130.0, vDist);
          if (detail > 0.01){
            float n0 = alt_fbm2(rp * 0.9 + vec2(tt * 0.5, tt * 0.31), 3);
            float nx = alt_fbm2((rp + vec2(e, 0.0)) * 0.9 + vec2(tt * 0.5, tt * 0.31), 3);
            float nz = alt_fbm2((rp + vec2(0.0, e)) * 0.9 + vec2(tt * 0.5, tt * 0.31), 3);
            N = normalize(N + vec3(-(nx - n0), 0.0, -(nz - n0)) * (0.55 * detail / e));
          }

          float bed = bedHeight(vAltWorld.xz);
          float depth = bed < -900.0 ? 40.0 : max(0.0, uLevel - bed);
          float dfac = 1.0 - exp(-depth / uDepthFade);

          /* Colore per trasmissione. In acqua bassa si vede il fondo, e nel
            * profondo resta solo il colore dell acqua: e questa transizione,
            * piu del riflesso, a far leggere una laguna come una laguna. */
          vec3 body = mix(uShallow, uDeep, dfac);
          float seeThrough = exp(-depth / (uDepthFade * 0.45));
          body = mix(body, uBottom * 0.85, seeThrough * 0.72);

          // Fresnel di Schlick
          float ndv = max(dot(N, V), 0.0);
          float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
          F *= uReflect;

          vec3 R = reflect(-V, N);
          R.y = abs(R.y) * 0.98 + 0.02;             // mai sotto l orizzonte
          vec3 refl = alt_sampleSky(uSkyLut, R);

          // riflesso speculare del sole
          vec3 H = normalize(V + uSunDir);
          float spec = pow(max(dot(N, H), 0.0), mix(900.0, 55.0, uRough));
          vec3 sunSpec = uSunColor * spec * (0.35 + 0.65 * uReflect);

          vec3 col = mix(body * (0.25 + 0.75 * max(uSunColor.g * 0.10, 0.02)), refl, F);
          col += sunSpec;

          /* Schiuma: dove il fondo sale e sulle creste piu alte. Un po di
           * rumore rompe il bordo, altrimenti sembra una linea disegnata. */
          float fn = alt_fbm2(rp * 1.6 + vec2(tt * 0.8, -tt * 0.5), 3);
          float shore = 1.0 - smoothstep(0.0, uFoamWidth, depth);
          shore *= 0.55 + 0.9 * fn;
          float crest = smoothstep(0.55, 0.95, vCrest) * smoothstep(0.25, 0.6, fn) * 0.7;
          float foam = clamp(max(shore, crest), 0.0, 1.0);
          col = mix(col, uFoamCol * (0.35 + 0.75 * max(uSunColor.g * 0.12, 0.05)), foam * 0.85);

          // lava: emette luce propria, con la crosta piu scura sulle creste
          if (uGlow > 0.001){
            float crust = smoothstep(0.35, 0.85, alt_fbm2(rp * 0.35 + vec2(tt * 0.08, tt * 0.05), 4));
            vec3 hot = mix(uShallow, vec3(1.0, 0.85, 0.35), 0.35 + 0.4 * fn);
            col = mix(hot * 2.2, uDeep * 0.5, crust * 0.85);
            col += hot * (1.0 - crust) * 1.6;
          }

          gl_FragColor = vec4(altApplyFogAt(col, vAltWorld, cameraPosition), 1.0);
        }`
    });
  }

  /* Ricalcola la mappa del fondo attorno al giocatore. Costa qualche decina di
   * millisecondi, quindi si rifa solo quando ci si e spostati parecchio. */
  updateDepth(cx, cz, force) {
    const move = Math.hypot(cx - this.depthCenter.x, cz - this.depthCenter.y);
    if (!force && move < DEPTH_SPAN * 0.12) return false;
    this.depthCenter.set(cx, cz);
    this.world.fillHeightField(cx, cz, DEPTH_SPAN, DEPTH_RES, this.depthData);
    this.depthTex.needsUpdate = true;
    this.uniforms.uDepthCenter.value.set(cx, cz);
    return true;
  }

  update(camera, time, sunDir, sunColor, skyLut, windAmp, dt) {
    this.uniforms.uTime.value = time;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSkyLut.value = skyLut;
    this.uniforms.uWindAmp.value = 0.45 + windAmp * 1.1;
    // la superficie segue la camera, cosi il disco non finisce mai
    this.mesh.position.set(camera.position.x, 0, camera.position.z);
    this.mesh.updateMatrix();
    this.mesh.updateMatrixWorld(true);
    this.updateDepth(camera.position.x, camera.position.z, false);
  }

  setLevel(l) { this.level = l; this.uniforms.uLevel.value = l; }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.depthTex.dispose();
  }
}
