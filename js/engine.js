/* Altrove - engine.js
 * Renderer e catena di post-produzione.
 *
 * La scena viene disegnata in un buffer a virgola mobile senza limite
 * superiore: il sole vale migliaia, l ombra sotto un cespuglio vale qualche
 * millesimo. Solo alla fine questo intervallo enorme viene schiacciato nei 256
 * livelli dello schermo. E la stessa ragione per cui una fotocamera espone.
 *
 * Ordine delle passate:
 *   cielo -> scena -> occlusione ambientale -> raggi di luce -> luminanza
 *   media -> bloom -> [profondita di campo] ->
 *   composizione (esposizione, ACES, bagliore del sole, vignetta, grana) -> FXAA
 */

import * as THREE from '../vendor/three.module.js';

const FS_VERT = `
in vec3 position; in vec2 uv; out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`;

function fsGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
}

const RT_HDR = {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  depthBuffer: false, stencilBuffer: false, generateMipmaps: false
};

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: true
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // la facciamo noi, in composizione
    this.renderer.shadowMap.enabled = true;
    /* In three r185 PCFSoftShadowMap non ha piu un percorso di shader suo: il
     * renderer lo declassa a PCFShadowMap e stampa un avviso di deprecazione.
     * Nessuna perdita, anzi: il PCF nuovo campiona con un disco di Vogel a
     * cinque prelievi ruotato da rumore per pixel, ed e piu morbido del vecchio
     * soft. shadow.radius continua a regolarne l ampiezza. */
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.geo = fsGeometry();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scenes = [];
    this.width = 1; this.height = 1; this.pr = 1;

    this.settings = {
      bloom: 0.50, bloomThreshold: 1.55, bloomKnee: 0.58,
      /* L intervallo dell esposizione automatica va tenuto stretto. A 22x una
       * scena notturna veniva amplificata al punto che qualunque cosa emettesse
       * luce propria diventava una sfera bianca sfocata. Nove stop di margine
       * bastano, e la notte resta notte. */
      exposure: 1.0, autoExposure: true, autoKey: 0.148, autoSpeed: 1.6,
      autoMin: 0.05, autoMax: 20.0,
      vignette: 0.42, grain: 0.030, chromatic: 0.55,
      contrast: 1.0, saturation: 1.0, lift: 0.0,
      sunGlare: 1.0, dof: 0, focusDist: 40, aperture: 0.5, autofocus: true, fxaa: true,
      rays: 1.0, ao: 0.62
    };

    this._buildTargets(2, 2);
    this._buildMaterials();
  }

  _mkQuad(mat) {
    const s = new THREE.Scene();
    const m = new THREE.Mesh(this.geo, mat);
    m.frustumCulled = false;
    s.add(m);
    this.scenes.push(s);
    return s;
  }

  _buildTargets(w, h) {
    const disp = (t) => { if (t) t.dispose(); };
    disp(this.hdr); disp(this.ldr); disp(this.dofRT);
    if (this.bloomRT) this.bloomRT.forEach(disp);
    if (this.lumRT) this.lumRT.forEach(disp);
    if (this.adaptRT) this.adaptRT.forEach(disp);
    if (this.raysRT) this.raysRT.forEach(disp);
    if (this.aoRT) this.aoRT.forEach(disp);

    this.hdr = new THREE.WebGLRenderTarget(w, h, {
      ...RT_HDR, depthBuffer: true
    });
    this.hdr.depthTexture = new THREE.DepthTexture(w, h);
    this.hdr.depthTexture.type = THREE.UnsignedIntType;
    this.hdr.depthTexture.minFilter = THREE.NearestFilter;
    this.hdr.depthTexture.magFilter = THREE.NearestFilter;

    this.dofRT = new THREE.WebGLRenderTarget(w, h, RT_HDR);
    this.ldr = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false
    });

    // catena del bloom: sei livelli, ciascuno meta del precedente
    this.bloomRT = [];
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < 6; i++) {
      this.bloomRT.push(new THREE.WebGLRenderTarget(Math.max(1, bw), Math.max(1, bh), RT_HDR));
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }

    // catena della luminanza media: 64 -> 16 -> 4 -> 1
    this.lumRT = [64, 16, 4, 1].map(s => new THREE.WebGLRenderTarget(s, s, {
      ...RT_HDR, minFilter: THREE.LinearFilter
    }));
    // adattamento: due texel 1x1 in ping-pong fra un fotogramma e il successivo
    this.adaptRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, {
      ...RT_HDR, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
    }));
    this.adaptIdx = 0;
    this.adaptPrimed = false;

    // raggi a un quarto (due bersagli per le due iterazioni), occlusione a meta
    const q = { ...RT_HDR, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.raysRT = [0, 1].map(() => new THREE.WebGLRenderTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), q));
    this.aoRT = [0, 1].map(() => new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), {
      ...RT_HDR, type: THREE.UnsignedByteType
    }));
  }

  _buildMaterials() {
    const common = { glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false };

    /* --- luminanza: primo passo, riduce l HDR a 64x64 di log-luminanza --- */
    this.lumMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc; uniform vec2 uTexel;
        void main(){
          vec3 c = vec3(0.0);
          for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++)
            c += texture2D(tSrc, vUv + vec2(float(i), float(j)) * uTexel * 5.0).rgb;
          c /= 9.0;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // il logaritmo evita che una singola sorgente accecante domini la media
          fragColor = vec4(log(max(l, 1e-5)), 0.0, 0.0, 1.0);
        }`
    });
    this.lumScene = this._mkQuad(this.lumMat);

    this.downMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc; uniform vec2 uTexel;
        void main(){
          vec4 c = texture2D(tSrc, vUv + vec2(-0.5,-0.5)*uTexel)
                 + texture2D(tSrc, vUv + vec2( 0.5,-0.5)*uTexel)
                 + texture2D(tSrc, vUv + vec2(-0.5, 0.5)*uTexel)
                 + texture2D(tSrc, vUv + vec2( 0.5, 0.5)*uTexel);
          fragColor = c * 0.25;
        }`
    });
    this.downScene = this._mkQuad(this.downMat);

    this.adaptMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tLum: { value: null }, tPrev: { value: null },
        uRate: { value: 0.05 }, uPrime: { value: 0 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tLum, tPrev; uniform float uRate, uPrime;
        void main(){
          float target = exp(texture2D(tLum, vec2(0.5)).r);
          float prev = texture2D(tPrev, vec2(0.5)).r;
          if (uPrime > 0.5) { fragColor = vec4(target, 0.0, 0.0, 1.0); return; }
          // l occhio si adatta al buio piu lentamente che alla luce
          float rate = uRate * (target < prev ? 0.55 : 1.0);
          fragColor = vec4(mix(prev, target, clamp(rate, 0.0, 1.0)), 0.0, 0.0, 1.0);
        }`
    });
    this.adaptScene = this._mkQuad(this.adaptMat);

    /* --- bloom: soglia con ginocchio morbido --- */
    this.prefilterMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tSrc: { value: null }, tAdapt: { value: null }, uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: 1.1 }, uKnee: { value: 0.6 },
        uExposure: { value: 1 }, uAuto: { value: 1 }, uKey: { value: 0.2 },
        uMin: { value: 0.02 }, uMax: { value: 20.0 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc, tAdapt; uniform vec2 uTexel;
        uniform float uThreshold, uKnee, uExposure, uAuto, uKey, uMin, uMax;
        void main(){
          vec3 c = vec3(0.0);
          c += texture2D(tSrc, vUv + vec2(-1.0,-1.0)*uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2( 1.0,-1.0)*uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(-1.0, 1.0)*uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2( 1.0, 1.0)*uTexel).rgb;
          c *= 0.25;

          float ev = uExposure;
          if (uAuto > 0.5){
            float avg = max(texture2D(tAdapt, vec2(0.5)).r, 1e-5);
            ev *= clamp(uKey / avg, uMin, uMax);
          }
          c *= ev;

          float br = max(c.r, max(c.g, c.b));
          float knee = uThreshold * uKnee + 1e-5;
          float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee);
          float w = max(soft, br - uThreshold) / max(br, 1e-5);
          fragColor = vec4(c * w, 1.0);
        }`
    });
    this.prefilterScene = this._mkQuad(this.prefilterMat);

    // downsample a 13 prelievi: niente sfarfallio sui punti luminosi piccoli
    this.bloomDownMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc; uniform vec2 uTexel;
        vec3 T(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
        void main(){
          vec3 a = T(vec2(-2,-2)), b = T(vec2(0,-2)), c = T(vec2(2,-2));
          vec3 d = T(vec2(-2, 0)), e = T(vec2(0, 0)), f = T(vec2(2, 0));
          vec3 g = T(vec2(-2, 2)), h = T(vec2(0, 2)), i = T(vec2(2, 2));
          vec3 j = T(vec2(-1,-1)), k = T(vec2(1,-1)), l = T(vec2(-1,1)), m = T(vec2(1,1));
          vec3 r = e * 0.125;
          r += (a + c + g + i) * 0.03125;
          r += (b + d + f + h) * 0.0625;
          r += (j + k + l + m) * 0.125;
          fragColor = vec4(r, 1.0);
        }`
    });
    this.bloomDownScene = this._mkQuad(this.bloomDownMat);

    // upsample a tenda 3x3, additivo
    this.bloomUpMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
        vec3 T(vec2 o){ return texture2D(tSrc, vUv + o * uTexel * uRadius).rgb; }
        void main(){
          vec3 r = T(vec2(-1,-1)) + T(vec2(0,-1))*2.0 + T(vec2(1,-1))
                 + T(vec2(-1, 0))*2.0 + T(vec2(0,0))*4.0 + T(vec2(1,0))*2.0
                 + T(vec2(-1, 1)) + T(vec2(0, 1))*2.0 + T(vec2(1,1));
          fragColor = vec4(r / 16.0, 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true
    });
    this.bloomUpScene = this._mkQuad(this.bloomUpMat);

    /* --- profondita di campo (solo modalita foto) --- */
    this.dofMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tSrc: { value: null }, tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 }, uFar: { value: 4000 },
        uFocus: { value: 40 }, uAperture: { value: 0.5 }, uMaxCoc: { value: 22 },
        uFocusK: { value: 2.2 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc, tDepth; uniform vec2 uTexel;
        uniform float uNear, uFar, uFocus, uAperture, uMaxCoc, uFocusK;
        float linDepth(vec2 uv){
          float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        float coc(float d){
          /* In un obiettivo vero il cerchio di confusione vale
           *     c = A * f * |d - fuoco| / (d * (fuoco - f))
           * e quel «fuoco» al denominatore e tutto: mettendo a fuoco lontano
           * si sfoca MENO. La formula di prima non ce l aveva, cosi lo
           * sfocato all infinito valeva sempre l apertura e mettere a fuoco a
           * dodici metri cancellava l intero paesaggio. */
          float c = uAperture * uFocusK * (d - uFocus) / (max(d, 0.01) * max(uFocus, 0.5));
          return clamp(c, -1.0, 1.0);
        }
        void main(){
          float dC = linDepth(vUv);
          float cC = coc(dC);
          float r = abs(cC) * uMaxCoc;
          vec3 sum = texture2D(tSrc, vUv).rgb;
          float wsum = 1.0;
          if (r > 0.6){
            // spirale aurea: 32 prelievi distribuiti senza schema visibile
            for (int i = 0; i < 32; i++){
              float fi = float(i) + 0.5;
              float ang = fi * 2.39996323;
              float rad = sqrt(fi / 32.0) * r;
              vec2 o = vec2(cos(ang), sin(ang)) * rad * uTexel;
              vec2 uv2 = vUv + o;
              float d2 = linDepth(uv2);
              float c2 = abs(coc(d2)) * uMaxCoc;
              // un campione entra solo se il suo cerchio di confusione lo raggiunge
              float w = (d2 < dC) ? smoothstep(rad - 1.0, rad + 1.0, c2) : 1.0;
              sum += texture2D(tSrc, uv2).rgb * w;
              wsum += w;
            }
          }
          fragColor = vec4(sum / wsum, 1.0);
        }`
    });
    this.dofScene = this._mkQuad(this.dofMat);

    /* --- raggi di luce: maschera del cielo visibile, a un quarto ---
     * Il trucco e vecchio quanto i videogiochi: i raggi crepuscolari non si
     * calcolano nel volume, si prendono i pixel di cielo vicino al sole e li
     * si strascina radialmente verso di esso. Dove un albero copre il cielo la
     * striscia si interrompe, ed e quello che l occhio legge come «raggio che
     * filtra fra le chiome». */
    this.raysMaskMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tDepth: { value: null },
        uSunScreen: { value: new THREE.Vector3(0, 0, -1) },
        uAspect: { value: 1 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tDepth; uniform vec3 uSunScreen; uniform float uAspect;
        void main(){
          float sky = step(0.99999, texture2D(tDepth, vUv).x);
          vec2 v = (vUv - uSunScreen.xy) * vec2(uAspect, 1.0);
          float r2 = dot(v, v);
          // la luce e forte vicino al sole e si spegne allontanandosi
          float w = exp(-r2 * 1.9);
          fragColor = vec4(vec3(sky * w), 1.0);
        }`
    });
    this.raysMaskScene = this._mkQuad(this.raysMaskMat);

    this.raysBlurMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tSrc: { value: null },
        uSunScreen: { value: new THREE.Vector3(0, 0, -1) },
        uDensity: { value: 0.5 }, uDecay: { value: 0.965 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc; uniform vec3 uSunScreen; uniform float uDensity, uDecay;
        float hash12(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void main(){
          const int N = 40;
          vec2 stp = (uSunScreen.xy - vUv) * uDensity / float(N);
          // rumore per pixel: nasconde le bande fra un campione e l altro
          vec2 uv = vUv + stp * hash12(vUv * 1731.0);
          vec3 acc = vec3(0.0); float w = 1.0, tot = 0.0;
          for (int i = 0; i < N; i++){
            uv += stp;
            // fuori dallo schermo non c e informazione: non si legge il bordo
            float dentro = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
            acc += texture2D(tSrc, clamp(uv, 0.0, 1.0)).rgb * w * dentro;
            tot += w; w *= uDecay;
          }
          fragColor = vec4(acc / tot, 1.0);
        }`
    });
    this.raysBlurScene = this._mkQuad(this.raysBlurMat);

    /* --- occlusione ambientale, dalla sola profondita, a meta ---
     * Nessun buffer delle normali: si ricostruisce la posizione in spazio
     * vista dalla profondita e la normale dalle sue derivate. Dodici campioni
     * in emisfero, ruotati a caso per pixel, poi una sfocatura che rispetta i
     * bordi. E quello che manca sotto una chioma o fra due sassi: l ombra di
     * contatto, che nessuna luce diretta puo dare. */
    this.aoMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uProj: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 }, uFar: { value: 4000 },
        uRadius: { value: 0.9 }, uRes: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tDepth; uniform vec2 uTexel, uProj, uRes;
        uniform float uNear, uFar, uRadius;
        float lin(vec2 uv){
          float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        vec3 posAt(vec2 uv){
          float z = lin(uv);
          return vec3((uv * 2.0 - 1.0) * uProj * z, -z);
        }
        float hash12(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void main(){
          vec3 p = posAt(vUv);
          float depth = -p.z;
          if (depth > 2500.0){ fragColor = vec4(1.0); return; }
          /* Normale dalle derivate. Ai bordi di profondita da spazzatura, ma
           * la sfocatura dopo la nasconde e a meta risoluzione non si vede. */
          vec3 n = normalize(cross(dFdx(p), dFdy(p)));
          vec3 up = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 t = normalize(cross(up, n));
          vec3 b = cross(n, t);
          float rot = hash12(vUv * uRes) * 6.2831853;
          /* Il raggio cresce con la distanza: un metro a due metri dalla
           * camera e un cerchio enorme, a cento metri e un pixel. */
          float rad = uRadius * (0.6 + depth * 0.04);
          float occ = 0.0, cnt = 0.0;
          for (int i = 0; i < 12; i++){
            float fi = float(i) + 0.5;
            float phi = fi * 2.39996323 + rot;
            float ct = 1.0 - (fi / 12.0) * 0.85;      // piu campioni vicino alla normale
            float st = sqrt(max(0.0, 1.0 - ct * ct));
            vec3 dir = t * (cos(phi) * st) + b * (sin(phi) * st) + n * ct;
            float len = mix(0.18, 1.0, fi / 12.0);
            vec3 sp = p + dir * rad * len;
            vec2 suv = 0.5 + 0.5 * (sp.xy / (-sp.z * uProj));
            if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
            float sceneZ = lin(suv);
            float dz = (-sp.z) - sceneZ;                   // > 0: c e qualcosa davanti al campione
            float range = smoothstep(0.0, 1.0, rad / max(1e-3, abs(depth - sceneZ)));
            occ += step(0.02 * rad, dz) * range;
            cnt += 1.0;
          }
          float ao = 1.0 - occ / max(cnt, 1.0);
          fragColor = vec4(vec3(ao), 1.0);
        }`
    });
    this.aoScene = this._mkQuad(this.aoMat);

    this.aoBlurMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tSrc: { value: null }, tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 }, uFar: { value: 4000 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc, tDepth; uniform vec2 uTexel; uniform float uNear, uFar;
        float lin(vec2 uv){
          float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        void main(){
          float z0 = lin(vUv);
          float acc = 0.0, wsum = 0.0;
          for (int y = -2; y <= 2; y++)
            for (int x = -2; x <= 2; x++){
              vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
              float z = lin(uv);
              // un pixel a un altra profondita non deve sporcare questo
              float w = exp(-abs(z - z0) / max(0.02 * z0, 0.05));
              acc += texture2D(tSrc, uv).r * w; wsum += w;
            }
          fragColor = vec4(vec3(acc / max(wsum, 1e-4)), 1.0);
        }`
    });
    this.aoBlurScene = this._mkQuad(this.aoBlurMat);

    /* --- composizione --- */
    this.compMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: {
        tSrc: { value: null }, tBloom: { value: null }, tAdapt: { value: null },
        tDepth: { value: null },
        uResolution: { value: new THREE.Vector2() },
        uExposure: { value: 1 }, uAuto: { value: 1 }, uKey: { value: 0.2 },
        uMin: { value: 0.02 }, uMax: { value: 20 },
        uBloom: { value: 0.5 }, uVignette: { value: 0.4 }, uGrain: { value: 0.03 },
        uChromatic: { value: 0.5 }, uContrast: { value: 1 }, uSaturation: { value: 1 },
        uLift: { value: 0.0 },
        uTime: { value: 0 },
        uSunScreen: { value: new THREE.Vector3(0, 0, -1) },
        uSunColor: { value: new THREE.Vector3(1, 1, 1) },
        uSunGlare: { value: 1 },
        uRainStreaks: { value: 0 }, uWet: { value: 0 },
        tRays: { value: null }, tAO: { value: null },
        uRays: { value: 1 }, uAO: { value: 0.6 }
      },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc, tBloom, tAdapt, tDepth, tRays, tAO;
        uniform float uRays, uAO;
        uniform vec2 uResolution;
        uniform float uExposure, uAuto, uKey, uMin, uMax, uBloom, uVignette, uGrain;
        uniform float uChromatic, uContrast, uSaturation, uLift, uTime, uSunGlare;
        uniform float uRainStreaks, uWet;
        uniform vec3 uSunScreen, uSunColor;

        // ACES, versione a matrici di Stephen Hill
        const mat3 ACES_IN = mat3(
          0.59719, 0.07600, 0.02840,
          0.35458, 0.90834, 0.13383,
          0.04823, 0.01566, 0.83777);
        const mat3 ACES_OUT = mat3(
           1.60475, -0.10208, -0.00327,
          -0.53108,  1.10813, -0.07276,
          -0.07367, -0.00605,  1.07602);
        vec3 rrt(vec3 v){
          vec3 a = v * (v + 0.0245786) - 0.000090537;
          vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
          return a / b;
        }
        vec3 acesFitted(vec3 c){
          c = ACES_IN * c;
          c = rrt(c);
          c = ACES_OUT * c;
          return clamp(c, 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c){
          return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
        }
        float hash12(vec2 p){
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        void main(){
          vec2 uv = vUv;
          vec2 cen = uv - 0.5;
          float r2 = dot(cen, cen);

          /* Aberrazione cromatica: le lunghezze d onda non mettono a fuoco
           * nello stesso punto, e lo scarto cresce verso i bordi. */
          vec3 col;
          if (uChromatic > 0.001){
            vec2 off = cen * r2 * uChromatic * 0.010;
            col.r = texture2D(tSrc, uv + off).r;
            col.g = texture2D(tSrc, uv).g;
            col.b = texture2D(tSrc, uv - off).b;
          } else {
            col = texture2D(tSrc, uv).rgb;
          }

          col += texture2D(tBloom, uv).rgb * uBloom;

          /* Occlusione ambientale: scurisce dove la geometria si chiude su se
           * stessa. Applicata al colore finale e non al solo termine ambiente
           * — un compromesso, ma il costo di separare i termini in ogni
           * materiale sarebbe altissimo. Il cielo resta a 1. */
          if (uAO > 0.001){
            float ao = texture2D(tAO, uv).r;
            col *= mix(1.0, ao, uAO);
          }
          /* Raggi crepuscolari: luce del sole strascinata dal cielo visibile.
           * Sommati in HDR, prima della curva tonale, cosi si comportano come
           * luce vera e non come un velo bianco. */
          if (uRays > 0.001 && uSunScreen.z > 0.0){
            col += texture2D(tRays, uv).rgb * uSunColor * uRays * 0.055;
          }

          /* Bagliore del sole: solo se il disco non e coperto da qualcosa.
           * Sondo la profondita in sei punti intorno alla sua posizione. */
          if (uSunGlare > 0.001 && uSunScreen.z > 0.0){
            float vis = 0.0;
            for (int i = 0; i < 6; i++){
              float a = float(i) * 1.0472;
              vec2 sp = uSunScreen.xy + vec2(cos(a), sin(a)) * 0.011;
              if (sp.x > 0.0 && sp.x < 1.0 && sp.y > 0.0 && sp.y < 1.0){
                vis += step(0.99999, texture2D(tDepth, sp).x);
              }
            }
            vis /= 6.0;
            if (vis > 0.0){
              vec2 d = uv - uSunScreen.xy;
              d.x *= uResolution.x / uResolution.y;
              float dist = length(d);
              // alone
              float halo = exp(-dist * 7.0) * 0.10;
              // raggi: modulazione angolare, come le lamelle del diaframma
              float ang = atan(d.y, d.x);
              float streak = (0.55 + 0.45 * sin(ang * 9.0)) * exp(-dist * 3.4) * 0.045;
              // fantasmi lungo la retta sole-centro
              float ghosts = 0.0;
              for (int i = 1; i <= 3; i++){
                vec2 gp = -(uSunScreen.xy - 0.5) * (float(i) * 0.42) + 0.5;
                vec2 gd = uv - gp; gd.x *= uResolution.x / uResolution.y;
                ghosts += exp(-dot(gd, gd) * 900.0) * 0.030 / float(i);
              }
              col += uSunColor * (halo + streak + ghosts) * vis * uSunGlare;
            }
          }

          // esposizione
          float ev = uExposure;
          if (uAuto > 0.5){
            float avg = max(texture2D(tAdapt, vec2(0.5)).r, 1e-5);
            ev *= clamp(uKey / avg, uMin, uMax);
          }
          col *= ev;

          // gocce sull obiettivo quando piove
          if (uRainStreaks > 0.001){
            vec2 gp = uv * vec2(uResolution.x / uResolution.y, 1.0) * 9.0;
            vec2 gi = floor(gp);
            float t = uTime * 0.55 + hash12(gi) * 20.0;
            vec2 gf = fract(gp) - 0.5;
            gf.y += fract(t) * 1.1 - 0.55;
            float d = length(gf * vec2(1.0, 0.55));
            float drop = smoothstep(0.19, 0.05, d) * step(0.62, hash12(gi + 3.7));
            col = mix(col, col * 1.35 + 0.02, drop * uRainStreaks * 0.6);
          }

          col = acesFitted(col);

          // contrasto e saturazione, dopo la mappatura tonale
          col = clamp((col - 0.5) * uContrast + 0.5 + uLift, 0.0, 1.0);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = clamp(mix(vec3(l), col, uSaturation), 0.0, 1.0);

          // vignetta
          float vig = 1.0 - uVignette * smoothstep(0.18, 0.78, r2);
          col *= vig;

          col = toSRGB(col);

          // grana + dithering: rompe le bande nei gradienti del cielo
          float n = hash12(uv * uResolution + fract(uTime) * 137.0);
          col += (n - 0.5) * uGrain;
          col += (hash12(uv * uResolution + 71.3) - 0.5) * (1.0 / 255.0);

          fragColor = vec4(col, 1.0);
        }`
    });
    this.compScene = this._mkQuad(this.compMat);

    /* --- FXAA --- */
    this.fxaaMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor;
        uniform sampler2D tSrc; uniform vec2 uTexel;
        float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
        void main(){
          vec3 rgbNW = texture2D(tSrc, vUv + vec2(-1.0,-1.0)*uTexel).rgb;
          vec3 rgbNE = texture2D(tSrc, vUv + vec2( 1.0,-1.0)*uTexel).rgb;
          vec3 rgbSW = texture2D(tSrc, vUv + vec2(-1.0, 1.0)*uTexel).rgb;
          vec3 rgbSE = texture2D(tSrc, vUv + vec2( 1.0, 1.0)*uTexel).rgb;
          vec3 rgbM  = texture2D(tSrc, vUv).rgb;
          float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(rgbM);
          float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
          float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
          if (lMax - lMin < max(0.028, lMax * 0.115)) { fragColor = vec4(rgbM, 1.0); return; }
          vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
          float red = max((lNW + lNE + lSW + lSE) * 0.25 * 0.20, 1.0/128.0);
          float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
          dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
          vec3 rgbA = 0.5 * (texture2D(tSrc, vUv + dir * (1.0/3.0 - 0.5)).rgb
                           + texture2D(tSrc, vUv + dir * (2.0/3.0 - 0.5)).rgb);
          vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb
                                         + texture2D(tSrc, vUv + dir * 0.5).rgb);
          float lB = lum(rgbB);
          fragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
        }`
    });
    this.fxaaScene = this._mkQuad(this.fxaaMat);

    this.copyMat = new THREE.RawShaderMaterial({
      ...common,
      uniforms: { tSrc: { value: null } },
      vertexShader: FS_VERT,
      fragmentShader: `precision highp float;
        #define texture2D texture
        in vec2 vUv; out vec4 fragColor; uniform sampler2D tSrc;
        void main(){ fragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`
    });
    this.copyScene = this._mkQuad(this.copyMat);
  }

  setSize(w, h, pixelRatio) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    this.pr = pixelRatio;
    /* Deve passare da setPixelRatio: scrivere a mano canvas.width lascia il
     * viewport di three alla dimensione vecchia, e si disegna in un angolo. */
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, true);
    const rw = Math.max(2, this.renderer.domElement.width);
    const rh = Math.max(2, this.renderer.domElement.height);
    if (rw === this.width && rh === this.height) return;
    this.width = rw; this.height = rh;
    this._buildTargets(rw, rh);
    this.adaptPrimed = false;
  }

  _blit(scene, target) {
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, this.cam);
  }

  /* ------------------------------------------------------------------ *
   * Pipeline completa
   * ------------------------------------------------------------------ */
  render(scene, camera, sky, dt, frameInfo) {
    const R = this.renderer, S = this.settings;
    const W = this.width, H = this.height;

    // 1. cielo + scena nel buffer HDR
    R.setRenderTarget(this.hdr);
    R.clear(true, true, true);
    if (sky) R.render(sky.skyScene, sky.quadCam);
    R.render(scene, camera);

    // 1b. occlusione ambientale, a meta risoluzione
    if (S.ao > 0.001) {
      const a = this.aoMat.uniforms;
      a.tDepth.value = this.hdr.depthTexture;
      a.uTexel.value.set(1 / this.aoRT[0].width, 1 / this.aoRT[0].height);
      a.uRes.value.set(this.aoRT[0].width, this.aoRT[0].height);
      const th = Math.tan(camera.fov * Math.PI / 360);
      a.uProj.value.set(th * camera.aspect, th);
      a.uNear.value = camera.near; a.uFar.value = camera.far;
      this._blit(this.aoScene, this.aoRT[0]);
      const ab = this.aoBlurMat.uniforms;
      ab.tSrc.value = this.aoRT[0].texture;
      ab.tDepth.value = this.hdr.depthTexture;
      ab.uTexel.value.set(1 / this.aoRT[0].width, 1 / this.aoRT[0].height);
      ab.uNear.value = camera.near; ab.uFar.value = camera.far;
      this._blit(this.aoBlurScene, this.aoRT[1]);
    }

    // 1c. raggi di luce, a un quarto, due iterazioni di sfocatura radiale
    const sunScr = frameInfo && frameInfo.sunScreen;
    if (S.rays > 0.001 && sunScr && sunScr.z > 0.0) {
      const m = this.raysMaskMat.uniforms;
      m.tDepth.value = this.hdr.depthTexture;
      m.uSunScreen.value.copy(sunScr);
      m.uAspect.value = W / H;
      this._blit(this.raysMaskScene, this.raysRT[0]);
      const b = this.raysBlurMat.uniforms;
      b.uSunScreen.value.copy(sunScr);
      b.tSrc.value = this.raysRT[0].texture; b.uDensity.value = 0.55; b.uDecay.value = 0.962;
      this._blit(this.raysBlurScene, this.raysRT[1]);
      b.tSrc.value = this.raysRT[1].texture; b.uDensity.value = 0.30; b.uDecay.value = 0.975;
      this._blit(this.raysBlurScene, this.raysRT[0]);
    }

    // 2. luminanza media della scena
    this.lumMat.uniforms.tSrc.value = this.hdr.texture;
    this.lumMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this._blit(this.lumScene, this.lumRT[0]);
    for (let i = 1; i < this.lumRT.length; i++) {
      this.downMat.uniforms.tSrc.value = this.lumRT[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / this.lumRT[i - 1].width, 1 / this.lumRT[i - 1].height);
      this._blit(this.downScene, this.lumRT[i]);
    }
    const prev = this.adaptRT[this.adaptIdx];
    const next = this.adaptRT[1 - this.adaptIdx];
    this.adaptMat.uniforms.tLum.value = this.lumRT[this.lumRT.length - 1].texture;
    this.adaptMat.uniforms.tPrev.value = prev.texture;
    this.adaptMat.uniforms.uRate.value = 1 - Math.exp(-Math.min(dt, 0.25) * S.autoSpeed);
    this.adaptMat.uniforms.uPrime.value = this.adaptPrimed ? 0 : 1;
    this._blit(this.adaptScene, next);
    this.adaptIdx = 1 - this.adaptIdx;
    this.adaptPrimed = true;
    const adaptTex = next.texture;

    // 3. bloom
    let bloomTex = null;
    if (S.bloom > 0.001) {
      const pf = this.prefilterMat.uniforms;
      pf.tSrc.value = this.hdr.texture;
      pf.tAdapt.value = adaptTex;
      pf.uTexel.value.set(1 / W, 1 / H);
      pf.uThreshold.value = S.bloomThreshold;
      pf.uKnee.value = S.bloomKnee;
      pf.uExposure.value = S.exposure;
      pf.uAuto.value = S.autoExposure ? 1 : 0;
      pf.uKey.value = S.autoKey; pf.uMin.value = S.autoMin; pf.uMax.value = S.autoMax;
      this._blit(this.prefilterScene, this.bloomRT[0]);

      const levels = Math.min(this.bloomRT.length, Math.max(2, Math.floor(Math.log2(Math.min(W, H))) - 2));
      for (let i = 1; i < levels; i++) {
        const src = this.bloomRT[i - 1];
        this.bloomDownMat.uniforms.tSrc.value = src.texture;
        this.bloomDownMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this._blit(this.bloomDownScene, this.bloomRT[i]);
      }
      for (let i = levels - 1; i > 0; i--) {
        const src = this.bloomRT[i];
        this.bloomUpMat.uniforms.tSrc.value = src.texture;
        this.bloomUpMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.bloomUpMat.uniforms.uRadius.value = 1.0;
        R.setRenderTarget(this.bloomRT[i - 1]);
        R.render(this.bloomUpScene, this.cam);   // additivo sul livello sottostante
      }
      bloomTex = this.bloomRT[0].texture;
    }

    // 4. profondita di campo (facoltativa)
    let colorTex = this.hdr.texture;
    if (S.dof > 0.001) {
      const d = this.dofMat.uniforms;
      d.tSrc.value = this.hdr.texture;
      d.tDepth.value = this.hdr.depthTexture;
      d.uTexel.value.set(1 / W, 1 / H);
      d.uNear.value = camera.near; d.uFar.value = camera.far;
      d.uFocus.value = S.focusDist;
      d.uAperture.value = S.aperture * S.dof;
      d.uFocusK.value = 2.2;
      d.uMaxCoc.value = 18 * (H / 1080);
      this._blit(this.dofScene, this.dofRT);
      colorTex = this.dofRT.texture;
    }

    // 5. composizione
    const c = this.compMat.uniforms;
    c.tSrc.value = colorTex;
    c.tBloom.value = bloomTex || this.bloomRT[0].texture;
    c.tAdapt.value = adaptTex;
    c.tDepth.value = this.hdr.depthTexture;
    c.uResolution.value.set(W, H);
    c.uExposure.value = S.exposure;
    c.uAuto.value = S.autoExposure ? 1 : 0;
    c.uKey.value = S.autoKey; c.uMin.value = S.autoMin; c.uMax.value = S.autoMax;
    c.uBloom.value = S.bloom > 0.001 ? S.bloom : 0;
    c.uVignette.value = S.vignette;
    c.uGrain.value = S.grain;
    c.uChromatic.value = S.chromatic;
    c.uContrast.value = S.contrast;
    c.uSaturation.value = S.saturation;
    c.uLift.value = S.lift;
    c.uSunGlare.value = S.sunGlare;
    c.tRays.value = this.raysRT[0].texture;
    c.tAO.value = this.aoRT[1].texture;
    c.uRays.value = (sunScr && sunScr.z > 0.0) ? S.rays : 0;
    c.uAO.value = S.ao;
    if (frameInfo) {
      c.uTime.value = frameInfo.time || 0;
      if (frameInfo.sunScreen) c.uSunScreen.value.copy(frameInfo.sunScreen);
      if (frameInfo.sunColor) c.uSunColor.value.copy(frameInfo.sunColor);
      c.uRainStreaks.value = frameInfo.rainStreaks || 0;
      c.uWet.value = frameInfo.wetness || 0;
    }

    if (S.fxaa) {
      this._blit(this.compScene, this.ldr);
      this.fxaaMat.uniforms.tSrc.value = this.ldr.texture;
      this.fxaaMat.uniforms.uTexel.value.set(1 / W, 1 / H);
      this._blit(this.fxaaScene, null);
    } else {
      this._blit(this.compScene, null);
    }
    R.setRenderTarget(null);
  }
}
