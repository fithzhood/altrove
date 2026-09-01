/* Altrove - atmosphere.js
 * Tiene insieme ora del giorno, meteo e bioma, e ne ricava tutto il resto:
 * dove sta il sole, di che colore e la sua luce dopo aver attraversato l aria,
 * quanta luce arriva dal cielo, quanto e densa la foschia, come si muovono le
 * nuvole.
 *
 * Il punto delicato e che la luce della scena e il colore del cielo devono
 * venire dalla stessa formula. Se il cielo e rosso al tramonto ma il sole
 * illumina ancora bianco, l occhio se ne accorge subito.
 */

import * as THREE from '../vendor/three.module.js';
import {
  sunDirection, moonDirection, transmittanceJS, atmosphereJS, SUN_INTENSITY
} from './sky.js?v=19';
import { clamp, lerp, saturate, mulberry32 } from './noise.js?v=19';

/* Campi meteo che vanno interpolati quando si cambia condizione */
const BLEND_KEYS = [
  'cloudCover', 'cloudDensity', 'cloudHeight', 'turbidityMul', 'fogMul',
  'sunMul', 'ambientMul', 'wind', 'rain', 'snow', 'dust', 'lightning',
  'wetness', 'contrast'
];

export function makeWeatherState(w) {
  const s = {};
  for (const k of BLEND_KEYS) s[k] = w[k] || 0;
  s.fogColor = w.fogColor ? w.fogColor.slice() : null;
  return s;
}

export function blendWeather(cur, target, t) {
  for (const k of BLEND_KEYS) cur[k] = lerp(cur[k], target[k] || 0, t);
  const tc = target.fogColor || [1, 1, 1];
  if (!cur.fogColor) cur.fogColor = tc.slice();
  else for (let i = 0; i < 3; i++) cur.fogColor[i] = lerp(cur.fogColor[i], tc[i], t);
  return cur;
}

const _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _tmp = [0, 0, 0];
const _acc = [0, 0, 0];

/* Direzioni su cui campiono il cielo per ricavare la luce ambientale.
 * Cinque bastano: la volta celeste e liscia. */
const AMB_DIRS = [
  [0, 1, 0], [0.70, 0.5, 0], [-0.70, 0.5, 0], [0, 0.5, 0.70], [0, 0.5, -0.70],
  [0.62, 0.14, 0.62], [-0.62, 0.14, -0.62]
];

export class Atmosphere {
  constructor(scene, sky, fog) {
    this.scene = scene;
    this.sky = sky;
    this.fog = fog;

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.sunColor = new THREE.Vector3(1, 1, 1);
    this.sunScreen = new THREE.Vector3(0, 0, -1);
    this.ambientColor = new THREE.Vector3(0.2, 0.3, 0.4);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight.castShadow = true;
    const sh = this.sunLight.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.near = 1;
    sh.camera.far = 620;
    /* normalBias si misura in unita di mondo: con la mappa a 2048 su 210 m un
     * texel vale 0,1 m, quindi due-tre texel bastano. A 0,65 le ombre degli
     * alberi scivolavano via dal tronco e sparivano. */
    sh.bias = -0.00035;
    sh.normalBias = 0.22;
    sh.radius = 2.6;
    this.shadowRadius = 105;
    this._setShadowExtent(this.shadowRadius);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x9fb6d8, 0);
    this.moonLight.castShadow = false;
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    this.hemi = new THREE.HemisphereLight(0x88aacc, 0x40402c, 1);
    scene.add(this.hemi);

    this.cloudScroll = new THREE.Vector2(0, 0);
    this.lightning = 0;
    this._flashQueue = [];
    this._nextStrike = 3 + Math.random() * 6;
    this.rng = mulberry32(4242);
    this.onLightning = null;
    this.starVisibility = 0;
    this.nightness = 0;
  }

  _setShadowExtent(r) {
    const c = this.sunLight.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.updateProjectionMatrix();
  }

  setQuality(q) {
    const map = { basso: 1024, medio: 2048, alto: 2048, ultra: 4096 };
    const size = map[q] || 2048;
    if (this.sunLight.shadow.mapSize.x !== size) {
      this.sunLight.shadow.mapSize.set(size, size);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
    }
    this.shadowRadius = q === 'basso' ? 70 : q === 'ultra' ? 150 : 105;
    this._setShadowExtent(this.shadowRadius);
  }

  /* ------------------------------------------------------------------ *
   * Aggiornamento per fotogramma
   * ------------------------------------------------------------------ */
  update(st, dt, camera) {
    const biome = st.biome;
    const wx = st.weather;
    const camAlt = Math.max(1, camera.position.y - (biome.waterLevel || 0));

    if (biome.fixedSun) {
      /* Certi luoghi non hanno un giorno: il sole della Terra cava sta appeso
       * al centro e non tramonta mai. */
      const al = biome.fixedSun[0] * Math.PI / 180, az = biome.fixedSun[1] * Math.PI / 180;
      this.sunDir.set(Math.sin(az) * Math.cos(al), Math.sin(al), -Math.cos(az) * Math.cos(al)).normalize();
    } else {
      sunDirection(st.hour, st.latitude, st.dayOfYear, this.sunDir);
    }
    moonDirection(st.hour, st.latitude, st.dayOfYear, st.moonPhase, this.moonDir);

    const sky = biome.sky;
    const tint = biome.skyTint || [1, 1, 1];
    const rayleigh = sky.rayleigh * (st.skyRayleigh || 1);
    // il meteo sporca l aria: piu torbida, piu Mie
    const mieMul = (sky.mie / 0.0045) * wx.turbidityMul * (st.skyMie || 1);
    const mieG = sky.mieG;

    /* --- luce del sole: irradianza dopo l attraversamento dell atmosfera --- */
    transmittanceJS(camAlt, this.sunDir.x, this.sunDir.y, this.sunDir.z, rayleigh, mieMul, _tmp);
    const sunMul = wx.sunMul * (st.sunBoost || 1);
    const sunT = biome.sunTint || tint;
    let sr = _tmp[0] * SUN_INTENSITY * sunMul * sunT[0];
    let sg = _tmp[1] * SUN_INTENSITY * sunMul * sunT[1];
    let sb = _tmp[2] * SUN_INTENSITY * sunMul * sunT[2];
    // spegnimento morbido sotto l orizzonte
    const below = saturate((this.sunDir.y + 0.02) / 0.05);
    sr *= below; sg *= below; sb *= below;

    this.sunColor.set(sr, sg, sb);
    this.sunLight.color.setRGB(sr, sg, sb);
    this.sunLight.intensity = 1;
    this.sunLight.visible = (sr + sg + sb) > 0.002;

    /* --- luce ambientale: media del cielo su qualche direzione --- */
    _acc[0] = _acc[1] = _acc[2] = 0;
    for (const d of AMB_DIRS) {
      atmosphereJS(camAlt, d[0], d[1], d[2], this.sunDir.x, this.sunDir.y, this.sunDir.z,
        rayleigh, mieMul, mieG, SUN_INTENSITY, _tmp);
      _acc[0] += _tmp[0]; _acc[1] += _tmp[1]; _acc[2] += _tmp[2];
    }
    const inv = 1 / AMB_DIRS.length;
    let ar = _acc[0] * inv * tint[0], ag = _acc[1] * inv * tint[1], ab = _acc[2] * inv * tint[2];

    // la luna illumina pochissimo, ma di notte e tutto quello che c e
    const moonUp = Math.max(0, this.moonDir.y);
    const illum = 0.5 * (1 - this.sunDir.dot(this.moonDir));
    const moonI = moonUp > 0 ? 2.6e-5 * illum * (0.25 + 0.75 * moonUp) * (st.moonBright || 1) : 0;
    this.moonI = moonI;
    if (moonI > 0) {
      transmittanceJS(camAlt, this.moonDir.x, this.moonDir.y, this.moonDir.z, rayleigh, mieMul, _tmp);
      const mScale = SUN_INTENSITY * moonI * 1.6 * wx.sunMul;
      this.moonLight.color.setRGB(_tmp[0] * mScale * 0.82, _tmp[1] * mScale * 0.92, _tmp[2] * mScale * 1.25);
      this.moonLight.intensity = 1;
      this.moonLight.visible = true;
    } else {
      this.moonLight.visible = false;
    }

    // fondo cielo notturno del bioma
    const ns = st.nightSky || [0.00055, 0.00085, 0.0017];
    ar += ns[0] * 2.2; ag += ns[1] * 2.2; ab += ns[2] * 2.2;

    /* Con il cielo coperto il sole si spegne ma l ambiente cresce: la volta
     * diventa una sorgente estesa. */
    const ambMul = wx.ambientMul * Math.PI * 0.62 * (st.ambientBoost || 1);
    ar *= ambMul; ag *= ambMul; ab *= ambMul;
    this.ambientColor.set(ar, ag, ab);

    const bnc = biome.ambience.bounce;
    this.hemi.color.setRGB(ar, ag, ab);
    this.hemi.groundColor.setRGB(ar * bnc * 0.92, ag * bnc * 0.88, ab * bnc * 0.70);
    this.hemi.intensity = 1;

    /* --- fulmini --- */
    this.lightning *= Math.exp(-dt * 7.5);
    if (wx.lightning > 0.02) {
      this._nextStrike -= dt * (0.35 + wx.lightning);
      if (this._nextStrike <= 0) {
        this._nextStrike = 2.2 + this.rng() * 9 / (0.3 + wx.lightning);
        const n = 1 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n; i++) {
          this._flashQueue.push({ t: i * (0.045 + this.rng() * 0.10), i: 0.5 + this.rng() * 0.9 });
        }
        if (this.onLightning) this.onLightning(0.4 + this.rng() * 1.2);
      }
    }
    for (let i = this._flashQueue.length - 1; i >= 0; i--) {
      const f = this._flashQueue[i];
      f.t -= dt;
      if (f.t <= 0) { this.lightning = Math.max(this.lightning, f.i); this._flashQueue.splice(i, 1); }
    }
    if (this.lightning > 0.01) {
      const L = this.lightning * 2.4;
      this.hemi.color.setRGB(ar + L * 0.7, ag + L * 0.78, ab + L * 1.0);
    }

    /* --- ombre: il tronco di piramide segue la camera --- */
    const sl = this.sunLight;
    const useMoon = !sl.visible && this.moonLight.visible;
    const shadowSrc = useMoon ? this.moonDir : this.sunDir;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    // avanza il centro verso dove si guarda: piu ombre utili nella stessa mappa
    const fwd = _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const ahead = this.shadowRadius * 0.42;
    const tx = cx + fwd.x * ahead, ty = cy, tz = cz + fwd.z * ahead;
    sl.target.position.set(tx, ty, tz);
    sl.position.set(tx + shadowSrc.x * 300, ty + shadowSrc.y * 300, tz + shadowSrc.z * 300);
    sl.target.updateMatrixWorld();
    this.moonLight.target.position.set(tx, ty, tz);
    this.moonLight.position.set(tx + this.moonDir.x * 300, ty + this.moonDir.y * 300, tz + this.moonDir.z * 300);
    this.moonLight.target.updateMatrixWorld();

    /* --- LUT del cielo --- */
    this.sky.renderLUT({
      sunDir: this.sunDir, moonDir: this.moonDir, camAlt,
      rayleigh, mie: mieMul, mieG,
      sunI: SUN_INTENSITY, moonI,
      nightSky: ns,
      lightPollution: st.lightPollution || 0,
      skyTint: tint
    });

    /* --- uniform della passata visibile --- */
    const windDir = st.windDir || 0.6;
    const windSpeed = (0.35 + wx.wind * 2.2) * (st.windScale || 1);
    this.cloudScroll.x += Math.cos(windDir) * windSpeed * dt * 0.0016;
    this.cloudScroll.y += Math.sin(windDir) * windSpeed * dt * 0.0016;

    const su = this.sky.skyMat.uniforms;
    su.uInvVP.value.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).invert();
    su.uCamPos.value.copy(camera.position);
    su.uSunDir.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uSunColor.value.copy(this.sunColor);
    su.uSunDiskI.value = 26 * (0.25 + 0.75 * wx.sunMul);
    su.uMoonI.value = moonI;
    su.uTime.value = st.time;
    su.uCloudCover.value = wx.cloudCover;
    su.uCloudDensity.value = wx.cloudDensity;
    su.uCloudHeight.value = wx.cloudHeight;
    su.uCloudScroll.value.copy(this.cloudScroll);
    su.uDustAmount.value = wx.dust * 0.85;
    su.uHazeColor.value.set(wx.fogColor[0], wx.fogColor[1], wx.fogColor[2]);
    su.uLightning.value = this.lightning;
    su.uAurora.value = st.aurora || 0;
    if (st.auroraColor) su.uAuroraColor.value.set(st.auroraColor[0], st.auroraColor[1], st.auroraColor[2]);
    su.uStars.value = st.stars === undefined ? 1 : st.stars;

    /* Soli compagni: ruotati attorno al principale, uno piu alto e uno piu
     * basso, cosi sorgono e tramontano insieme ma sfalsati. */
    su.uSunAngle.value = biome.sunAngle || 0.0047;
    const pl = biome.planet;
    su.uPlanetOn.value = pl ? 1 : 0;
    su.uPlanetRing.value = (pl && pl.ring) ? 1 : 0;
    if (pl) {
      su.uPlanetDir.value.set(pl.dir[0], pl.dir[1], pl.dir[2]).normalize();
      su.uPlanetSize.value = pl.size;
      su.uPlanetColor.value.set(pl.color[0], pl.color[1], pl.color[2]);
    }

    const extra = biome.extraSuns || 0;
    su.uExtraSuns.value = extra;
    if (extra > 0) {
      _v3.copy(this.sunDir);
      su.uSun2.value.copy(_v3).applyAxisAngle(_yAxis, 0.34);
      su.uSun2.value.y += 0.10; su.uSun2.value.normalize();
      su.uSun3.value.copy(_v3).applyAxisAngle(_yAxis, -0.27);
      su.uSun3.value.y -= 0.07; su.uSun3.value.normalize();
    }

    // quanto e notte: serve a chi deve accendere le luci
    const lum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
    this.nightness = clamp(1 - lum * 12, 0, 1);
    this.starVisibility = this.nightness;

    /* --- nebbia --- */
    const bf = biome.fog;
    const dustMix = saturate(wx.dust * 0.92);
    this.fog.set({
      lut: this.sky.lut.texture,
      density: bf.density * wx.fogMul * (st.fogScale || 1),
      falloff: bf.heightFalloff,
      baseY: st.fogBaseY !== undefined ? st.fogBaseY : (biome.waterLevel || 0),
      tint: bf.tint,
      override: wx.fogColor,
      overrideMix: dustMix * 0.75,
      max: 1.0,
      start: 2.5,
      sunDir: this.sunDir,
      sunColor: [this.sunColor.x, this.sunColor.y, this.sunColor.z],
      farFade: st.farFade || 2600
    });

    /* --- posizione del sole a schermo, per il bagliore --- */
    _v3.copy(camera.position).addScaledVector(this.sunDir, 5000);
    _v3.project(camera);
    const inFront = this.sunDir.dot(fwd) > 0;
    this.sunScreen.set(_v3.x * 0.5 + 0.5, _v3.y * 0.5 + 0.5, (inFront && sl.visible) ? 1 : 0);
  }
}
