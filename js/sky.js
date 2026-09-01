/* Altrove - sky.js
 * Il cielo non e un gradiente: e scattering atmosferico integrato lungo il
 * raggio di vista. Rayleigh per il blu e il rosso del tramonto, Mie per la
 * foschia e l alone attorno al sole.
 *
 * Il calcolo e caro, quindi gira una volta per fotogramma su una piccola
 * texture equirettangolare (la LUT). Da li lo pescano tre clienti:
 *   - la passata di cielo a schermo intero, che ci aggiunge sole, luna,
 *     stelle, nuvole e aurora ad alta frequenza
 *   - la nebbia di tutti i materiali, che cosi assume il colore del cielo
 *     nella direzione giusta (prospettiva aerea vera)
 *   - le luci della scena, che vengono dalla stessa formula ricalcolata in JS
 *
 * Se cielo e luci divergono, l immagine sembra finta. Per questo la matematica
 * e scritta due volte, GLSL e JS, ma e la stessa.
 */

import * as THREE from '../vendor/three.module.js';
import { GLSL_NOISE } from './noise.js?v=18';

/* ------------------------------------------------------------------ *
 * Costanti fisiche condivise
 * ------------------------------------------------------------------ */
const PLANET_R = 6371000.0;
const ATMO_R = 6471000.0;
const BETA_R = [5.802e-6, 13.558e-6, 33.1e-6];
const BETA_M = 21e-6;
const H_R = 8000.0;
const H_M = 1200.0;

export const SUN_INTENSITY = 22.0;

/* ------------------------------------------------------------------ *
 * Posizione di sole e luna
 * ------------------------------------------------------------------ */

const DEG = Math.PI / 180;

/* Modello solare standard: declinazione dal giorno dell anno, angolo orario
 * dall ora locale, poi altezza e azimut dalla latitudine. */
export function sunDirection(hour, latitudeDeg, dayOfYear, out) {
  out = out || new THREE.Vector3();
  const decl = 23.44 * DEG * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
  const H = (hour - 12) * 15 * DEG;
  const lat = latitudeDeg * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz = (Math.sin(decl) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(alt) + 1e-6);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (H > 0) az = 2 * Math.PI - az;             // pomeriggio: a ovest
  // az = 0 a nord, cresce verso est. Assi: +Z sud, +X est, +Y alto.
  out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
  return out.normalize();
}

/* La luna e trattata come un secondo sole in ritardo di fase. A luna piena e
 * opposta al sole, per questo d inverno sta alta e d estate radente. */
export function moonDirection(hour, latitudeDeg, dayOfYear, phase, out) {
  out = out || new THREE.Vector3();
  const declS = 23.44 * DEG * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
  const decl = -declS * 0.86;
  const H = (hour - 12) * 15 * DEG + phase * 2 * Math.PI;
  const lat = latitudeDeg * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz = (Math.sin(decl) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(alt) + 1e-6);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(H) > 0) az = 2 * Math.PI - az;
  out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
  return out.normalize();
}

/* ------------------------------------------------------------------ *
 * Scattering: versione GLSL
 * ------------------------------------------------------------------ */

export const GLSL_ATMOSPHERE = /* glsl */`
const float PLANET_R = 6371000.0;
const float ATMO_R   = 6471000.0;
const vec3  BETA_R   = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float BETA_M   = 21.0e-6;
const float H_R = 8000.0;
const float H_M = 1200.0;

float alt_raySphereFar(vec3 o, vec3 d, float r){
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  return -b + sqrt(disc);
}

vec3 alt_atmosphere(float camAlt, vec3 rd, vec3 sunDir,
                    float rayleighMul, float mieMul, float mieG, float sunI){
  const int N = 24;
  const int M = 8;
  vec3 ro = vec3(0.0, PLANET_R + max(camAlt, 1.0), 0.0);

  /* Sotto l orizzonte si continua a estrapolare il colore del cielo invece di
   * annerire: serve alla nebbia, che guarda anche verso il basso. Il limite
   * deve pero restare SOPRA l orizzonte geometrico, altrimenti il raggio entra
   * nel pianeta, la densita cresce come exp(+h/H) e il risultato e NaN. */
  rd.y = max(rd.y, 0.0022);
  rd = normalize(rd);

  float tMax = alt_raySphereFar(ro, rd, ATMO_R);
  if (tMax <= 0.0) return vec3(0.0);

  float mu = dot(rd, sunDir);
  float phaseR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
  float g2 = mieG * mieG;
  float phaseM = 3.0 / (8.0 * 3.14159265) * ((1.0 - g2) * (1.0 + mu * mu)) /
                 ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * mieG * mu, 1e-4), 1.5));

  float segLen = tMax / float(N);
  float t = segLen * 0.5;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;

  for (int i = 0; i < N; i++){
    vec3 p = ro + rd * t;
    float h = max(length(p) - PLANET_R, 0.0);
    float hr = exp(-h / H_R) * segLen;
    float hm = exp(-h / H_M) * segLen;
    odR += hr; odM += hm;

    float tl = alt_raySphereFar(p, sunDir, ATMO_R);
    float lseg = tl / float(M);
    float odRL = 0.0, odML = 0.0;
    float tl0 = lseg * 0.5;
    bool lit = true;
    for (int j = 0; j < M; j++){
      vec3 pl = p + sunDir * tl0;
      float hl = length(pl) - PLANET_R;
      if (hl < -600.0) { lit = false; break; }   // il pianeta fa ombra
      hl = max(hl, 0.0);
      odRL += exp(-hl / H_R) * lseg;
      odML += exp(-hl / H_M) * lseg;
      tl0 += lseg;
    }
    if (lit){
      vec3 tau = BETA_R * rayleighMul * (odR + odRL) + BETA_M * mieMul * 1.1 * (odM + odML);
      vec3 att = exp(-tau);
      sumR += hr * att;
      sumM += hm * att;
    }
    t += segLen;
  }
  return (sumR * BETA_R * rayleighMul * phaseR + sumM * BETA_M * mieMul * phaseM) * sunI;
}

// Quanto sole arriva a terra dopo l attraversamento dell atmosfera
vec3 alt_transmittance(float camAlt, vec3 sunDir, float rayleighMul, float mieMul){
  const int M = 12;
  vec3 ro = vec3(0.0, PLANET_R + max(camAlt, 1.0), 0.0);
  float tl = alt_raySphereFar(ro, sunDir, ATMO_R);
  float lseg = tl / float(M);
  float odR = 0.0, odM = 0.0, t = lseg * 0.5;
  for (int j = 0; j < M; j++){
    float hl = length(ro + sunDir * t) - PLANET_R;
    if (hl < 0.0) return vec3(0.0);
    odR += exp(-hl / H_R) * lseg;
    odM += exp(-hl / H_M) * lseg;
    t += lseg;
  }
  return exp(-(BETA_R * rayleighMul * odR + BETA_M * mieMul * 1.1 * odM));
}
`;

/* ------------------------------------------------------------------ *
 * Scattering: versione JS (per le luci della scena)
 * ------------------------------------------------------------------ */

function raySphereFarJS(oy, dx, dy, dz, r) {
  const b = oy * dy;
  const c = oy * oy - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b + Math.sqrt(disc);
}

const _out3 = [0, 0, 0];

export function atmosphereJS(camAlt, dx, dy, dz, sx, sy, sz, rayleighMul, mieMul, mieG, sunI, out) {
  out = out || _out3;
  const N = 14, M = 6;
  const oy = PLANET_R + Math.max(camAlt, 1);
  // stesso vincolo della versione GLSL: mai sotto l orizzonte geometrico
  if (dy < 0.0022) {
    const s = Math.hypot(dx, dy, dz) || 1;
    const hx = dx / s, hz = dz / s;
    const hl = Math.hypot(hx, hz) || 1;
    const k = Math.sqrt(Math.max(0, 1 - 0.0022 * 0.0022));
    dx = hx / hl * k; dy = 0.0022; dz = hz / hl * k;
  }
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;

  const tMax = raySphereFarJS(oy, dx, dy, dz, ATMO_R);
  if (tMax <= 0) { out[0] = out[1] = out[2] = 0; return out; }

  const mu = dx * sx + dy * sy + dz * sz;
  const phaseR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const g2 = mieG * mieG;
  const phaseM = 3 / (8 * Math.PI) * ((1 - g2) * (1 + mu * mu)) /
    ((2 + g2) * Math.pow(Math.max(1 + g2 - 2 * mieG * mu, 1e-4), 1.5));

  const segLen = tMax / N;
  let t = segLen * 0.5;
  let sR0 = 0, sR1 = 0, sR2 = 0, sM0 = 0, sM1 = 0, sM2 = 0;
  let odR = 0, odM = 0;

  for (let i = 0; i < N; i++) {
    const px = dx * t, py = oy + dy * t, pz = dz * t;
    const pr = Math.hypot(px, py, pz);
    const h = Math.max(pr - PLANET_R, 0);
    const hr = Math.exp(-h / H_R) * segLen;
    const hm = Math.exp(-h / H_M) * segLen;
    odR += hr; odM += hm;

    // raggio verso il sole a partire da questo punto
    const b = px * sx + py * sy + pz * sz;
    const c = pr * pr - ATMO_R * ATMO_R;
    const disc = b * b - c;
    let lit = true, odRL = 0, odML = 0;
    if (disc >= 0) {
      const tl = -b + Math.sqrt(disc);
      const lseg = tl / M;
      let tl0 = lseg * 0.5;
      for (let j = 0; j < M; j++) {
        const lx = px + sx * tl0, ly = py + sy * tl0, lz = pz + sz * tl0;
        let hl = Math.hypot(lx, ly, lz) - PLANET_R;
        if (hl < -600) { lit = false; break; }
        if (hl < 0) hl = 0;
        odRL += Math.exp(-hl / H_R) * lseg;
        odML += Math.exp(-hl / H_M) * lseg;
        tl0 += lseg;
      }
    } else lit = false;

    if (lit) {
      const mR = rayleighMul, mM = mieMul * 1.1;
      const a0 = Math.exp(-(BETA_R[0] * mR * (odR + odRL) + BETA_M * mM * (odM + odML)));
      const a1 = Math.exp(-(BETA_R[1] * mR * (odR + odRL) + BETA_M * mM * (odM + odML)));
      const a2 = Math.exp(-(BETA_R[2] * mR * (odR + odRL) + BETA_M * mM * (odM + odML)));
      sR0 += hr * a0; sR1 += hr * a1; sR2 += hr * a2;
      sM0 += hm * a0; sM1 += hm * a1; sM2 += hm * a2;
    }
    t += segLen;
  }

  out[0] = (sR0 * BETA_R[0] * rayleighMul * phaseR + sM0 * BETA_M * mieMul * phaseM) * sunI;
  out[1] = (sR1 * BETA_R[1] * rayleighMul * phaseR + sM1 * BETA_M * mieMul * phaseM) * sunI;
  out[2] = (sR2 * BETA_R[2] * rayleighMul * phaseR + sM2 * BETA_M * mieMul * phaseM) * sunI;
  return out;
}

export function transmittanceJS(camAlt, sx, sy, sz, rayleighMul, mieMul, out) {
  out = out || [0, 0, 0];
  const M = 12;
  const oy = PLANET_R + Math.max(camAlt, 1);
  const tl = raySphereFarJS(oy, sx, sy, sz, ATMO_R);
  if (tl <= 0) { out[0] = out[1] = out[2] = 0; return out; }
  const lseg = tl / M;
  let odR = 0, odM = 0, t = lseg * 0.5;
  for (let j = 0; j < M; j++) {
    const lx = sx * t, ly = oy + sy * t, lz = sz * t;
    const hl = Math.hypot(lx, ly, lz) - PLANET_R;
    if (hl < 0) { out[0] = out[1] = out[2] = 0; return out; }
    odR += Math.exp(-hl / H_R) * lseg;
    odM += Math.exp(-hl / H_M) * lseg;
    t += lseg;
  }
  const mM = mieMul * 1.1;
  out[0] = Math.exp(-(BETA_R[0] * rayleighMul * odR + BETA_M * mM * odM));
  out[1] = Math.exp(-(BETA_R[1] * rayleighMul * odR + BETA_M * mM * odM));
  out[2] = Math.exp(-(BETA_R[2] * rayleighMul * odR + BETA_M * mM * odM));
  return out;
}

/* ------------------------------------------------------------------ *
 * Mappatura direzione <-> LUT equirettangolare
 * La radice quadrata su y concentra i texel vicino all orizzonte, dove il
 * gradiente cambia in fretta.
 * ------------------------------------------------------------------ */

export const GLSL_SKY_LUT = /* glsl */`
vec2 alt_dirToLut(vec3 d){
  float u = atan(d.z, d.x) * 0.15915494 + 0.5;
  float sy = sqrt(abs(d.y)) * sign(d.y);
  return vec2(u, sy * 0.5 + 0.5);
}
vec3 alt_lutToDir(vec2 uv){
  float az = (uv.x - 0.5) * 6.28318531;
  float sy = uv.y * 2.0 - 1.0;
  float y = sy * sy * sign(sy);
  float r = sqrt(max(0.0, 1.0 - y * y));
  return vec3(cos(az) * r, y, sin(az) * r);
}
vec3 alt_sampleSky(sampler2D lut, vec3 d){
  return texture2D(lut, alt_dirToLut(normalize(d))).rgb;
}
`;

export function dirToLutJS(dx, dy, dz) {
  const u = Math.atan2(dz, dx) * 0.15915494 + 0.5;
  const sy = Math.sqrt(Math.abs(dy)) * Math.sign(dy);
  return [u, sy * 0.5 + 0.5];
}

/* piccola utilita condivisa */
export const GLSL_LUMA = /* glsl */`
float luminanceApprox(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/* ------------------------------------------------------------------ *
 * SkySystem
 * ------------------------------------------------------------------ */

const LUT_W = 192, LUT_H = 96;

export class SkySystem {
  constructor(renderer) {
    this.renderer = renderer;

    this.lut = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    });
    this.lut.texture.wrapS = THREE.RepeatWrapping;

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.BufferGeometry();
    // triangolo a schermo intero: un vertice in meno e nessuna cucitura in diagonale
    this.quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quadGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

    this.lutScene = new THREE.Scene();
    this.lutMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uCamAlt: { value: 100 },
        uRayleigh: { value: 1 },
        uMie: { value: 1 },
        uMieG: { value: 0.78 },
        uSunI: { value: SUN_INTENSITY },
        uMoonI: { value: 0 },
        uNightSky: { value: new THREE.Vector3(0.0008, 0.0013, 0.0026) },
        uLightPollution: { value: 0 },
        uSkyTint: { value: new THREE.Vector3(1, 1, 1) }
      },
      vertexShader: `
        in vec3 position; in vec2 uv; out vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform vec3 uSunDir, uMoonDir, uNightSky;
        uniform float uCamAlt, uRayleigh, uMie, uMieG, uSunI, uMoonI, uLightPollution;
        uniform vec3 uSkyTint;
        ${GLSL_ATMOSPHERE}
        ${GLSL_SKY_LUT}
        void main(){
          vec3 d = alt_lutToDir(vUv);
          vec3 col = alt_atmosphere(uCamAlt, d, uSunDir, uRayleigh, uMie, uMieG, uSunI);
          // La luna e un sole debolissimo: stessa formula, altra intensita.
          if (uMoonI > 0.0){
            col += alt_atmosphere(uCamAlt, d, uMoonDir, uRayleigh, uMie, uMieG, uSunI * uMoonI);
          }
          // fondo cielo notturno: airglow + luce zodiacale approssimata
          float horizon = 1.0 - abs(d.y);
          col += uNightSky * (0.55 + 0.45 * horizon * horizon);
          // inquinamento luminoso: cupola arancione sull orizzonte
          col += vec3(1.0, 0.52, 0.20) * uLightPollution * pow(max(0.0, horizon), 5.0) * 0.9;
          fragColor = vec4(max(col * uSkyTint, vec3(0.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false
    });
    this.lutScene.add(new THREE.Mesh(this.quadGeo, this.lutMat));

    /* ---- passata visibile del cielo ---- */
    this.skyScene = new THREE.Scene();
    this.skyMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uLut: { value: this.lut.texture },
        uInvVP: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunColor: { value: new THREE.Vector3(1, 1, 1) },
        uSunDiskI: { value: 1 },
        uMoonI: { value: 0 },
        uTime: { value: 0 },
        uStars: { value: 1 },
        uCloudCover: { value: 0.2 },
        uCloudDensity: { value: 1 },
        uCloudHeight: { value: 2400 },
        uCloudWind: { value: new THREE.Vector2(1, 0.3) },
        uCloudScroll: { value: new THREE.Vector2(0, 0) },
        uAurora: { value: 0 },
        uAuroraColor: { value: new THREE.Vector3(0.15, 1.0, 0.45) },
        uHazeColor: { value: new THREE.Vector3(1, 1, 1) },
        uDustAmount: { value: 0 },
        uLightning: { value: 0 },
        uPlanetDir: { value: new THREE.Vector3(0, -1, 0) },
        uPlanetSize: { value: 0.09 },
        uPlanetColor: { value: new THREE.Vector3(0.25, 0.45, 0.75) },
        uPlanetOn: { value: 0 },
        uPlanetRing: { value: 0 },
        uSunAngle: { value: 0.0047 },
        uSun2: { value: new THREE.Vector3(0, -1, 0) },
        uSun3: { value: new THREE.Vector3(0, -1, 0) },
        uExtraSuns: { value: 0 }
      },
      vertexShader: `
        in vec3 position; in vec2 uv; out vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D uLut;
        uniform mat4 uInvVP;
        uniform vec3 uCamPos, uSunDir, uMoonDir, uSunColor, uAuroraColor, uHazeColor;
        uniform vec3 uSun2, uSun3, uPlanetDir, uPlanetColor;
        uniform float uExtraSuns, uPlanetSize, uPlanetOn, uPlanetRing, uSunAngle;
        uniform float uTime, uStars, uCloudCover, uCloudDensity, uCloudHeight;
        uniform float uAurora, uSunDiskI, uMoonI, uDustAmount, uLightning;
        uniform vec2 uCloudWind, uCloudScroll;
        ${GLSL_NOISE}
        ${GLSL_SKY_LUT}
        ${GLSL_LUMA}

        /* ---------------- stelle ----------------
         * La direzione viene proiettata sulla faccia dominante di un cubo e
         * poi discretizzata in celle 2D: ogni cella puo ospitare una stella,
         * con posizione, magnitudine e temperatura di colore dall hash.
         * Niente texture, niente tabella di stelle. */
        vec3 starField(vec3 d){
          vec3 ad = abs(d);
          vec2 fuv; float face;
          if (ad.x >= ad.y && ad.x >= ad.z){ fuv = d.zy / ad.x; face = d.x > 0.0 ? 0.0 : 1.0; }
          else if (ad.y >= ad.z)           { fuv = d.xz / ad.y; face = d.y > 0.0 ? 2.0 : 3.0; }
          else                             { fuv = d.xy / ad.z; face = d.z > 0.0 ? 4.0 : 5.0; }

          vec2 p = fuv * 88.0;
          vec2 id = floor(p);
          vec2 f = fract(p) - 0.5;
          vec3 col = vec3(0.0);

          /* Una stella e un punto: se la campiono con una gaussiana stretta in
           * unita di cella, a schermo cade fra due pixel e sparisce. La
           * larghezza va quindi legata a quanto misura un pixel in celle. */
          float cellsPerPx = length(fwidth(d)) * 88.0 * 1.2;
          float sig = max(cellsPerPx * 0.55, 0.022);
          float invS = 1.0 / (sig * sig);

          for (int i = -1; i <= 1; i++)
          for (int j = -1; j <= 1; j++){
            vec2 o = vec2(float(i), float(j));
            vec3 cid = vec3(id + o, face * 37.0);
            float h = alt_hash13(cid);
            if (h < 0.955) continue;            // quasi tutte le celle sono vuote
            vec2 jit = vec2(alt_hash13(cid + 11.3), alt_hash13(cid + 27.7)) - 0.5;
            vec2 delta = f - o - jit * 0.78;
            float dist2 = dot(delta, delta);
            if (dist2 > 0.09) continue;

            float mag = pow(fract(h * 91.7), 2.6);
            float tw = 0.70 + 0.30 * sin(uTime * (1.3 + fract(h * 311.0) * 3.2) + h * 60.0);
            float core = exp(-dist2 * invS) * mag * tw;
            core += exp(-dist2 * invS * 0.09) * mag * mag * 0.30 * tw;  // alone delle piu luminose

            float ct = fract(h * 53.3);
            vec3 tint = mix(vec3(1.0, 0.70, 0.48), vec3(0.68, 0.80, 1.0), ct);
            tint = mix(vec3(1.0), tint, 0.8);
            col += core * tint * 6.5;
          }
          return col;
        }

        /* Via Lattea: banda di rumore attorno a un piano galattico inclinato */
        vec3 milkyWay(vec3 d){
          vec3 gn = normalize(vec3(0.42, 0.62, -0.66));
          float band = abs(dot(d, gn));
          float m = exp(-band * band * 26.0);
          if (m < 0.002) return vec3(0.0);
          vec3 q = d * 7.0;
          float n = alt_fbm3(q, 5);
          float n2 = alt_fbm3(q * 2.7 + 13.0, 4);
          float dust = smoothstep(0.30, 0.72, n2);
          float bright = smoothstep(0.32, 0.85, n) * dust;
          vec3 c = mix(vec3(0.42, 0.46, 0.66), vec3(0.85, 0.80, 0.72), bright);
          return c * m * bright * 0.16;
        }

        /* ---------------- luna ----------------
         * Sfera vera illuminata dal sole vero: le fasi vengono da sole. */
        vec3 moonDisk(vec3 d, out float mask){
          mask = 0.0;
          float ang = 0.0049;                     // raggio angolare
          float cd = dot(d, uMoonDir);
          if (cd < cos(ang * 3.2)) return vec3(0.0);
          // coordinate sul disco
          vec3 up = abs(uMoonDir.y) > 0.95 ? vec3(1,0,0) : vec3(0,1,0);
          vec3 tx = normalize(cross(up, uMoonDir));
          vec3 ty = cross(uMoonDir, tx);
          vec2 uvm = vec2(dot(d, tx), dot(d, ty)) / ang;
          float r2 = dot(uvm, uvm);
          vec3 col = vec3(0.0);
          if (r2 <= 1.0){
            mask = 1.0;
            vec3 n = normalize(uMoonDir * sqrt(max(0.0, 1.0 - r2)) + tx * uvm.x + ty * uvm.y);
            float lam = max(0.0, dot(n, uSunDir));
            // i mari lunari
            float craters = alt_fbm3(n * 9.0, 5);
            float mare = smoothstep(0.42, 0.62, alt_fbm3(n * 2.4 + 5.0, 4));
            float alb = mix(0.94, 0.58, mare) * (0.86 + 0.28 * craters);
            // la luna ha retrodiffusione: il bordo non si spegne come una sfera lambertiana
            float back = pow(lam, 0.55);
            col = vec3(1.0, 0.97, 0.92) * alb * back * 5.2;
            col *= smoothstep(1.0, 0.985, r2);
          }
          // alone
          float halo = exp(-(sqrt(r2) - 1.0) * 1.6) * 0.10;
          if (r2 > 1.0) col += vec3(0.72, 0.80, 1.0) * halo * clamp(uMoonI * 40000.0, 0.0, 1.0);
          return col;
        }

        /* Un pianeta appeso in cielo: sfera illuminata dal sole vero, con le
         * sue fasi e un po di macchie. Da solo cambia il posto in cui sei. */
        vec3 planetDisk(vec3 d){
          if (uPlanetOn < 0.5) return vec3(0.0);
          float cd = dot(d, uPlanetDir);
          if (cd < cos(uPlanetSize * 1.3)) return vec3(0.0);
          vec3 up = abs(uPlanetDir.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 tx = normalize(cross(up, uPlanetDir));
          vec3 ty = cross(uPlanetDir, tx);
          vec2 uvp = vec2(dot(d, tx), dot(d, ty)) / uPlanetSize;
          float r2 = dot(uvp, uvp);
          if (r2 > 1.0) return vec3(0.0);
          vec3 nrm = normalize(uPlanetDir * sqrt(max(0.0, 1.0 - r2)) + tx * uvp.x + ty * uvp.y);
          float lam = max(0.0, dot(nrm, uSunDir));
          float cont = alt_fbm3(nrm * 2.6, 5);
          float band = alt_fbm3(nrm * vec3(1.2, 7.0, 1.2) + 3.0, 3);
          vec3 c = mix(uPlanetColor, uPlanetColor * vec3(1.55, 1.42, 1.15), smoothstep(0.44, 0.66, cont));
          c = mix(c, vec3(1.0), smoothstep(0.62, 0.86, band) * 0.35);
          vec3 col = c * (0.02 + 0.95 * pow(lam, 0.85));
          col *= smoothstep(1.0, 0.988, r2);
          return col;
        }

        /* Anelli: un anello circolare visto di taglio si proietta in un ellisse.
         * La meta davanti passa sopra il pianeta, quella dietro ci sparisce
         * sotto: basta questo a farli leggere come anelli e non come un alone. */
        vec3 planetRing(vec3 d){
          if (uPlanetOn < 0.5 || uPlanetRing < 0.5) return vec3(0.0);
          float cd = dot(d, uPlanetDir);
          if (cd < cos(uPlanetSize * 3.2)) return vec3(0.0);
          vec3 up = abs(uPlanetDir.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 tx = normalize(cross(up, uPlanetDir));
          vec3 ty = cross(uPlanetDir, tx);
          vec2 uvp = vec2(dot(d, tx), dot(d, ty)) / uPlanetSize;
          float r2 = dot(uvp, uvp);
          float tilt = 0.26;
          float rr = length(vec2(uvp.x, uvp.y / tilt));
          if (rr < 1.35 || rr > 2.25) return vec3(0.0);
          // dietro al pianeta l anello e nascosto
          if (r2 < 1.0 && uvp.y > 0.0) return vec3(0.0);
          float band = smoothstep(1.35, 1.44, rr) * smoothstep(2.25, 2.10, rr);
          // divisione fra gli anelli
          band *= 1.0 - 0.75 * smoothstep(0.06, 0.0, abs(rr - 1.78));
          band *= 0.55 + 0.45 * sin(rr * 34.0);
          float lam = max(0.15, dot(uPlanetDir, uSunDir) * 0.5 + 0.5);
          return uPlanetColor * vec3(1.7, 1.6, 1.4) * band * lam * 0.55;
        }

        /* ---------------- nuvole ----------------
         * Strato piatto a quota fissa. Il raggio lo interseca e piu si guarda
         * verso l orizzonte piu il campionamento si allunga: la prospettiva
         * converge da sola, come nel cielo vero. */
        vec4 clouds(vec3 rd, vec3 sunDir, vec3 sunCol, vec3 skyCol){
          if (rd.y < 0.008) return vec4(0.0);
          if (uCloudCover < 0.005) return vec4(0.0);
          float t = uCloudHeight / rd.y;
          if (t > 240000.0) return vec4(0.0);
          vec2 p = uCamPos.xz + rd.xz * t;
          vec2 uv = p * 0.00023 + uCloudScroll;

          float shape = alt_fbm2(uv * 1.0, 5);
          // domain warp: i bordi diventano frastagliati invece che tondi
          vec2 w = vec2(alt_fbm2(uv * 2.1 + 5.2, 3), alt_fbm2(uv * 2.1 - 3.7, 3)) - 0.5;
          shape = alt_fbm2(uv + w * 0.55, 5);
          float detail = alt_fbm2(uv * 5.5 + uCloudScroll * 2.3, 4);
          float cov = uCloudCover;
          float d = shape + detail * 0.22 - (1.0 - cov) * 0.92;
          d = smoothstep(0.0, 0.30, d) * uCloudDensity;
          if (d <= 0.001) return vec4(0.0);

          // dissolvenza all orizzonte: lo strato finisce sempre nella foschia
          float horizonFade = smoothstep(0.008, 0.10, rd.y);
          d *= horizonFade;

          /* Auto-ombra: campiono la densita un po piu in la verso il sole.
           * Non e un integrale vero, ma da il volume alle nubi. */
          vec2 sunStep = normalize(sunDir.xz + 1e-4) * 0.55;
          float occ = 0.0;
          for (int i = 1; i <= 3; i++){
            float s = float(i);
            float sh = alt_fbm2(uv + w * 0.55 + sunStep * s * 0.28, 4);
            occ += max(0.0, sh - (1.0 - cov) * 0.92);
          }
          occ = clamp(occ * 0.55, 0.0, 1.0);
          float lit = exp(-occ * 2.6 * uCloudDensity);

          // forward scattering: il bordo verso il sole si accende
          float mu = dot(rd, sunDir);
          float silver = pow(max(0.0, mu), 14.0) * (1.0 - occ) * 1.6;

          /* sunCol e irradianza solare: la radianza di una nube e circa
           * quella per albedo diviso pi greco. Senza questo fattore le nuvole
           * escono trenta volte piu luminose del cielo e bruciano tutto. */
          vec3 top = sunCol * 0.135 * (0.35 + 0.65 * lit) + skyCol * 0.75;
          vec3 base = mix(skyCol * 0.62, sunCol * 0.030, 0.45);
          vec3 col = mix(base, top, lit);
          col += sunCol * silver * 0.075;
          col += vec3(1.0, 0.95, 0.9) * uLightning * (0.3 + 0.7 * d) * 2.5;

          float alpha = clamp(d * 1.35, 0.0, 1.0);
          return vec4(col, alpha);
        }

        /* ---------------- aurora ---------------- */
        vec3 aurora(vec3 rd){
          if (uAurora < 0.001 || rd.y < 0.02) return vec3(0.0);
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 10; i++){
            float hgt = 70000.0 + float(i) * 9000.0;
            float t = hgt / rd.y;
            if (t > 900000.0) break;
            vec2 p = (uCamPos.xz + rd.xz * t) * 0.0000135;
            float curtain = alt_fbm2(vec2(p.x * 2.4 + uTime * 0.012, p.y * 0.55), 4);
            float ribbon = smoothstep(0.52, 0.80, curtain);
            // striature verticali dentro il drappo
            float fine = alt_fbm2(vec2(p.x * 22.0 + uTime * 0.05, p.y * 3.0 + float(i) * 0.4), 3);
            ribbon *= 0.45 + 0.55 * fine;
            float vFade = 1.0 - float(i) / 10.0;
            vec3 c = mix(uAuroraColor, vec3(0.72, 0.22, 0.95), pow(1.0 - vFade, 1.8));
            acc += c * ribbon * vFade * 0.06;
          }
          return acc * uAurora * smoothstep(0.02, 0.20, rd.y);
        }

        void main(){
          vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec4 wp = uInvVP * ndc;
          vec3 rd = normalize(wp.xyz / wp.w - uCamPos);

          vec3 sky = alt_sampleSky(uLut, rd);
          vec3 col = sky;

          // stelle e Via Lattea, spente man mano che il cielo si accende
          float night = clamp(1.0 - luminanceApprox(sky) * 170.0, 0.0, 1.0);
          if (uStars > 0.001 && night > 0.001 && rd.y > -0.06){
            float above = smoothstep(-0.06, 0.06, rd.y);
            col += (starField(rd) + milkyWay(rd)) * night * uStars * above * 0.055;
            col += aurora(rd) * night;
          }

          // luna
          float moonMask;
          vec3 mc = moonDisk(rd, moonMask);
          col += mc * clamp(uMoonI * 32000.0, 0.0, 1.4) * (0.25 + 0.75 * night);

          // disco solare con oscuramento al bordo
          float cs = dot(rd, uSunDir);
          float sunAng = uSunAngle;
          if (cs > cos(sunAng * 6.0)){
            float ang = acos(clamp(cs, -1.0, 1.0));
            float r = ang / sunAng;
            float disk = smoothstep(1.02, 0.97, r);
            float limb = sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
            disk *= 0.42 + 0.58 * pow(limb, 0.42);
            col += uSunColor * disk * uSunDiskI;
            // alone attorno al disco
            col += uSunColor * exp(-(r - 1.0) * 0.55) * 0.035 * uSunDiskI * step(1.0, r);
          }

          /* Soli in piu: dischi veri, non decalcomanie. Non contribuiscono
            * allo scattering (sarebbe un altro giro di LUT), ma bastano a dire
            * che questo cielo non e il nostro. */
          if (uExtraSuns > 0.5){
            for (int i = 0; i < 2; i++){
              vec3 sd = i == 0 ? uSun2 : uSun3;
              if (i == 1 && uExtraSuns < 1.5) break;
              float cs2 = dot(rd, sd);
              float ang2 = 0.0030;
              if (cs2 > cos(ang2 * 7.0)){
                float aa = acos(clamp(cs2, -1.0, 1.0));
                float rr = aa / ang2;
                float dk = smoothstep(1.04, 0.96, rr);
                col += uSunColor * dk * uSunDiskI * 0.42;
                col += uSunColor * exp(-(rr - 1.0) * 0.7) * 0.014 * uSunDiskI * step(1.0, rr);
              }
            }
          }

          col += planetDisk(rd) * 1.1;
          col += planetRing(rd) * 1.1;

          // nuvole
          vec4 cl = clouds(rd, uSunDir, uSunColor, sky);
          col = mix(col, cl.rgb, cl.a);

          // velo di polvere in tempesta di sabbia
          if (uDustAmount > 0.001){
            float dz = smoothstep(0.55, -0.05, rd.y);
            vec3 dustC = uHazeColor;
            float dn = alt_fbm2(rd.xz * 5.0 / max(rd.y + 0.25, 0.06) + uCloudScroll * 6.0, 4);
            col = mix(col, dustC * (0.55 + 0.65 * dn) * (0.25 + luminanceApprox(sky) * 4.0),
                      clamp(uDustAmount * (0.35 + 0.65 * dz), 0.0, 0.96));
          }

          // lampo: illumina tutta la volta
          col += vec3(0.72, 0.78, 1.0) * uLightning * 0.35;

          fragColor = vec4(max(col, vec3(0.0)), 1.0);
        }`,
      depthTest: false, depthWrite: false
    });
    this.skyMesh = new THREE.Mesh(this.quadGeo, this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.skyScene.add(this.skyMesh);

    this.cloudScroll = new THREE.Vector2(0, 0);
  }

  /* Aggiorna la LUT. Va chiamata quando cambia sole, luna o atmosfera. */
  renderLUT(params) {
    const u = this.lutMat.uniforms;
    u.uSunDir.value.copy(params.sunDir);
    u.uMoonDir.value.copy(params.moonDir);
    u.uCamAlt.value = params.camAlt;
    u.uRayleigh.value = params.rayleigh;
    u.uMie.value = params.mie;
    u.uMieG.value = params.mieG;
    u.uSunI.value = params.sunI;
    u.uMoonI.value = params.moonI;
    u.uNightSky.value.set(params.nightSky[0], params.nightSky[1], params.nightSky[2]);
    u.uLightPollution.value = params.lightPollution || 0;
    const t = params.skyTint || [1, 1, 1];
    u.uSkyTint.value.set(t[0], t[1], t[2]);

    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.lut);
    this.renderer.render(this.lutScene, this.quadCam);
    this.renderer.setRenderTarget(prev);
  }

  renderSky(camera) {
    this.renderer.render(this.skyScene, this.quadCam);
  }

  dispose() {
    this.lut.dispose();
    this.lutMat.dispose();
    this.skyMat.dispose();
    this.quadGeo.dispose();
  }
}
