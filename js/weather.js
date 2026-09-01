/* Altrove - weather.js
 * Precipitazioni: pioggia, neve, polvere.
 *
 * Le particelle non si aggiornano sulla CPU. Ognuna ha una posizione fissa
 * dentro un cubo di lato BOX che segue la camera; il movimento e il modulo del
 * tempo dentro quel cubo, calcolato nel vertex shader. Cosi cinquantamila
 * gocce costano un disegno solo e zero lavoro per fotogramma.
 *
 * Gli spruzzi a terra sono l eccezione: hanno bisogno della quota del terreno,
 * quindi qualche decina viene ricollocata sulla CPU un po per volta.
 */

import * as THREE from '../vendor/three.module.js';
import { GLSL_NOISE, mulberry32 } from './noise.js?v=21';
import { GLSL_FOG_DECL } from './fog.js?v=21';

const BOX = new THREE.Vector3(46, 34, 46);
const SPLASH_MAX = 220;

export class Precipitation {
  constructor(fog, opts = {}) {
    this.fog = fog;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.maxRain = opts.maxRain || 26000;
    this.maxSnow = opts.maxSnow || 14000;
    this.maxDust = opts.maxDust || 9000;

    this.shared = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uWind: { value: new THREE.Vector2(1, 0.3) },
      uAmount: { value: 0 },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: new THREE.Vector3(0.3, 0.4, 0.5) },
      uLightning: { value: 0 }
    };

    this.rain = this._makeLayer('rain', this.maxRain, 1337);
    this.snow = this._makeLayer('snow', this.maxSnow, 4711);
    this.dust = this._makeLayer('dust', this.maxDust, 9001);
    this.motes = this._makeLayer('motes', 4200, 555);
    [this.rain, this.snow, this.dust, this.motes].forEach(l => { l.mesh.visible = false; this.group.add(l.mesh); });

    this.splash = this._makeSplashes();
    this.group.add(this.splash.mesh);

    this.world = null;
    this.splashCursor = 0;
  }

  setWorld(w) { this.world = w; }

  /* Spore luminose: quantita e colore li decide il bioma, non il meteo. */
  setMotes(amount, color) {
    this.moteAmount = amount;
    if (color) this.motes.uniforms.uMoteColor.value.set(color[0], color[1], color[2]);
  }

  /* ------------------------------------------------------------------ */
  _makeLayer(kind, count, seed) {
    const rnd = mulberry32(seed);
    // quad unitario: la forma vera la decide il vertex shader
    const g = new THREE.InstancedBufferGeometry();
    const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const uvq = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    g.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvq, 2));

    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = rnd();
      seeds[i * 4 + 1] = rnd();
      seeds[i * 4 + 2] = rnd();
      seeds[i * 4 + 3] = rnd();
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const isRain = kind === 'rain';
    const isSnow = kind === 'snow';
    const isMote = kind === 'motes';

    const uniforms = Object.assign({}, this.shared, {
      /* uAmount NON puo restare condiviso: i tre strati si sovrascriverebbero
       * l intensita a vicenda e nevicherebbe insieme alla pioggia. */
      uAmount: { value: 0 },
      uFall: { value: isRain ? 22.0 : isSnow ? 1.35 : isMote ? -0.30 : 0.5 },
      uSize: { value: 1.0 },
      uTimeMote: { value: 0 },
      uMoteColor: { value: new THREE.Vector3(0.55, 0.95, 0.75) },
      uKind: { value: isRain ? 0 : isSnow ? 1 : isMote ? 3 : 2 }
    });
    for (const k in this.fog.u) uniforms[k] = this.fog.u[k];

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      // le spore emettono luce: si sommano, non coprono
      blending: isMote ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        varying vec2 vUv;
        varying float vFade;
        varying vec3 vAltWorld;
        varying float vSeed;
        uniform float uTime, uFall, uSize, uAmount, uKind;
        uniform float altCurve;
        uniform vec3 uCamPos, uBox;
        uniform vec2 uWind;

        void main(){
          vUv = uv * 0.5 + 0.5;
          vSeed = aSeed.w;

          /* Posizione: il seme e fisso, il tempo scorre e il modulo riporta la
           * particella dall altra parte del cubo. Il cubo e agganciato alla
           * camera, quindi la pioggia non finisce mai. */
          vec3 p = aSeed.xyz * uBox;
          float t = uTime;
          p.y = mod(p.y - uFall * t, uBox.y);
          p.x = mod(p.x + uWind.x * t * (uKind > 0.5 ? 2.2 : 1.4), uBox.x);
          p.z = mod(p.z + uWind.y * t * (uKind > 0.5 ? 2.2 : 1.4), uBox.z);

          if (uKind > 0.5){
            // neve e polvere ondeggiano invece di cadere dritte
            float w = uKind > 1.5 ? 3.4 : 1.0;
            p.x += sin(t * (0.5 + aSeed.w) + aSeed.x * 30.0) * 1.3 * w;
            p.z += cos(t * (0.42 + aSeed.y) + aSeed.z * 27.0) * 1.3 * w;
          }

          vec3 world = p + uCamPos - uBox * 0.5;

          /* Diradamento: la quantita di particelle visibile deve poter salire e
           * scendere. Invece di cambiare instanceCount, spingo fuori vista
           * quelle in eccesso: niente riallocazioni. */
          float keep = step(aSeed.w, uAmount);
          if (keep < 0.5){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

          vec3 toCam = uCamPos - world;
          float dist = length(toCam);
          vec3 view = toCam / max(dist, 1e-4);

          vec3 up, right;
          if (uKind < 0.5){
            // la goccia e una scia allineata alla velocita
            vec3 vel = normalize(vec3(uWind.x * 1.4, -uFall, uWind.y * 1.4));
            right = normalize(cross(vel, view));
            up = vel;
            float len = 0.62 + aSeed.w * 0.75;
            world += right * position.x * 0.011 + up * position.y * len * 0.5;
          } else {
            // fiocco e granello: sempre di faccia
            right = normalize(cross(vec3(0.0, 1.0, 0.0), view));
            up = normalize(cross(view, right));
            float s = uKind > 2.5 ? (0.020 + aSeed.w * 0.045)
                    : uKind > 1.5 ? (0.06 + aSeed.w * 0.30)
                                  : (0.030 + aSeed.w * 0.055);
            world += right * position.x * s + up * position.y * s;
          }

          // dissolvenza ai bordi del cubo, cosi non si vede il confine
          vec3 rel = abs(p - uBox * 0.5) / (uBox * 0.5);
          float edge = max(max(rel.x, rel.y), rel.z);
          vFade = 1.0 - smoothstep(0.72, 1.0, edge);
          vFade *= smoothstep(0.35, 1.6, dist);

          vAltWorld = world;
          vec4 mvp = viewMatrix * vec4(world, 1.0);
          mvp.y -= mvp.z * mvp.z * altCurve;
          gl_Position = projectionMatrix * mvp;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        varying float vFade;
        varying float vSeed;
        varying vec3 vAltWorld;
        uniform float uKind, uLightning, uTimeMote;
        uniform vec3 uSunColor, uAmbient, uMoteColor;
        ${GLSL_NOISE}
        ${GLSL_FOG_DECL}

        void main(){
          vec2 c = vUv * 2.0 - 1.0;
          float a;
          vec3 col;
          if (uKind < 0.5){
            // scia: sfuma alle due estremita e ai lati
            a = (1.0 - abs(c.x)) * (1.0 - abs(c.y) * 0.85);
            a = pow(clamp(a, 0.0, 1.0), 0.85) * 0.30;
            col = (uAmbient * 2.4 + uSunColor * 0.05) + vec3(0.55) * uLightning;
          } else if (uKind < 1.5){
            float d = dot(c, c);
            a = smoothstep(1.0, 0.05, d) * 0.85;
            col = (uAmbient * 1.5 + uSunColor * 0.035) * (0.85 + 0.3 * vSeed) + vec3(0.6) * uLightning;
          } else if (uKind < 2.5){
            float d = dot(c, c);
            a = smoothstep(1.0, 0.0, d) * 0.30;
            col = mix(vec3(0.62, 0.44, 0.24), vec3(0.85, 0.68, 0.42), vSeed) * (uAmbient.g * 3.0 + 0.15);
          } else {
            // spora: nucleo netto dentro un alone morbido
            float d = dot(c, c);
            float core = smoothstep(0.30, 0.0, d);
            float halo = smoothstep(1.0, 0.0, d);
            a = clamp(core * 0.85 + halo * 0.22, 0.0, 1.0);
            float puls = 0.55 + 0.45 * sin(vSeed * 40.0 + uTimeMote);
            col = uMoteColor * (0.5 + 1.3 * vSeed) * puls * 1.4;
          }
          a *= vFade;
          if (a < 0.004) discard;
          col = altApplyFogAt(col, vAltWorld, cameraPosition);
          gl_FragColor = vec4(col, a);
        }`
    });

    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return { mesh, mat, uniforms, count };
  }

  /* ------------------------------------------------------------------ *
   * Spruzzi: anelli che si allargano dove la goccia tocca terra
   * ------------------------------------------------------------------ */
  _makeSplashes() {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1]);
    const uvq = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    g.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvq, 2));
    const off = new Float32Array(SPLASH_MAX * 4);      // x, y, z, fase
    g.setAttribute('aSplash', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = SPLASH_MAX;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const uniforms = Object.assign({}, this.shared, { uAmount: { value: 0 }, uSplashSize: { value: 0.20 } });
    for (const k in this.fog.u) uniforms[k] = this.fog.u[k];

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */`
        attribute vec4 aSplash;
        varying vec2 vUv;
        varying float vLife;
        varying vec3 vAltWorld;
        uniform float uTime, uAmount, uSplashSize;
        void main(){
          vUv = uv;
          float period = 0.62;
          float life = fract((uTime + aSplash.w) / period);
          vLife = life;
          if (uAmount < 0.02 || aSplash.y < -9000.0){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
          float r = uSplashSize * (0.12 + life * 1.0);
          vec3 world = aSplash.xyz + vec3(position.x * r, 0.02, position.z * r);
          vAltWorld = world;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        varying float vLife;
        varying vec3 vAltWorld;
        uniform vec3 uAmbient;
        uniform float uAmount;
        ${GLSL_NOISE}
        ${GLSL_FOG_DECL}
        void main(){
          vec2 c = vUv * 2.0 - 1.0;
          float d = length(c);
          // anello sottile che si allarga e svanisce
          float ring = smoothstep(0.55, 0.92, d) * smoothstep(1.0, 0.88, d);
          float a = ring * (1.0 - vLife) * 0.5 * clamp(uAmount * 2.0, 0.0, 1.0);
          if (a < 0.005) discard;
          vec3 col = uAmbient * 2.6;
          col = altApplyFogAt(col, vAltWorld, cameraPosition);
          gl_FragColor = vec4(col, a);
        }`
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    mesh.visible = false;
    return { mesh, mat, uniforms, data: off, attr: g.attributes.aSplash };
  }

  /* Ricolloca un pugno di spruzzi per fotogramma attorno al giocatore. */
  _moveSplashes(camX, camZ, n) {
    if (!this.world) return;
    const d = this.splash.data;
    for (let k = 0; k < n; k++) {
      const i = this.splashCursor % SPLASH_MAX;
      this.splashCursor++;
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.sqrt(Math.random()) * 15;
      const x = camX + Math.cos(a) * r, z = camZ + Math.sin(a) * r;
      const h = this.world.height(x, z);
      const wl = this.world.hasWater ? this.world.waterLevel : -1e9;
      d[i * 4] = x;
      d[i * 4 + 1] = h < wl ? -99999 : h;
      d[i * 4 + 2] = z;
      d[i * 4 + 3] = Math.random() * 4;
    }
    this.splash.attr.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  update(camera, time, wx, atmo, dt) {
    const S = this.shared;
    S.uTime.value = time;
    S.uCamPos.value.copy(camera.position);
    S.uSunColor.value.copy(atmo.sunColor);
    S.uAmbient.value.copy(atmo.ambientColor);
    S.uLightning.value = atmo.lightning;
    const wdir = 0.6;
    const wstr = 1.2 + wx.wind * 5.0;
    S.uWind.value.set(Math.cos(wdir) * wstr, Math.sin(wdir) * wstr);

    const showRain = wx.rain > 0.01;
    const showSnow = wx.snow > 0.01;
    const showDust = wx.dust > 0.01;

    this.rain.mesh.visible = showRain;
    this.snow.mesh.visible = showSnow;
    this.dust.mesh.visible = showDust;
    this.rain.uniforms.uAmount.value = wx.rain;
    this.snow.uniforms.uAmount.value = wx.snow;
    this.dust.uniforms.uAmount.value = wx.dust;

    this.splash.mesh.visible = showRain;
    this.splash.uniforms.uAmount.value = wx.rain;
    if (showRain) this._moveSplashes(camera.position.x, camera.position.z, 14);

    // spore: non dipendono dal meteo ma dal luogo
    const mo = this.moteAmount || 0;
    this.motes.mesh.visible = mo > 0.01;
    this.motes.uniforms.uAmount.value = mo;
    this.motes.uniforms.uTimeMote.value = time * 2.2;
  }

  dispose() {
    [this.rain, this.snow, this.dust, this.motes].forEach(l => {
      l.mesh.geometry.dispose(); l.mat.dispose();
    });
    this.splash.mesh.geometry.dispose();
    this.splash.mat.dispose();
  }
}
