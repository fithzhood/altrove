/* Altrove - fog.js
 * Prospettiva aerea invece di nebbia colorata.
 *
 * La nebbia normale mescola verso un colore fisso: il risultato e che una
 * montagna lontana ha la stessa tinta guardando a nord o contro il sole. Qui il
 * colore della nebbia viene letto dalla LUT del cielo nella direzione del
 * frammento, per cui le lontananze contro sole si accendono e quelle in ombra
 * restano fredde. E il singolo effetto che fa piu differenza sulla profondita.
 *
 * La densita cala con la quota secondo un esponenziale, e l integrale lungo il
 * raggio ha forma chiusa: nelle valli la foschia si deposita, sulle cime no.
 */

import * as THREE from '../vendor/three.module.js';
import { GLSL_SKY_LUT } from './sky.js?v=29';
import { GLSL_NOISE } from './noise.js?v=29';

export class FogSystem {
  constructor() {
    /* Oggetti uniform condivisi. Ogni materiale registrato punta a QUESTI
     * oggetti, non a una copia: aggiornarne uno aggiorna tutta la scena. */
    this.u = {
      altSkyLut: { value: null },
      altFogDensity: { value: 0.003 },
      altFogFalloff: { value: 0.006 },
      altFogBaseY: { value: 0.0 },
      altFogTint: { value: new THREE.Color(1, 1, 1) },
      altFogOverride: { value: new THREE.Color(1, 1, 1) },
      altFogOverrideMix: { value: 0.0 },
      altFogMax: { value: 1.0 },
      altFogStart: { value: 3.0 },
      altSunDir: { value: new THREE.Vector3(0, 1, 0) },
      altSunColor: { value: new THREE.Vector3(1, 1, 1) },
      altFarFade: { value: 3000.0 },
      /* 1 = la dissolvenza al confine del mondo si misura in orizzontale,
       * non in linea d aria: nella Terra cava la volta e a 1200 m sopra la
       * testa e in linea d aria sarebbe gia sfumata via, mentre in
       * orizzontale sta a zero. */
      altFadeHorizontal: { value: 0.0 },
      /* Curvatura del mondo: vale 0 ovunque tranne sul pianetino. */
      altCurve: { value: 0.0 },
      /* Acqua: la quota del pelo serve alle caustiche, che si vedono anche
       * dall alto in acqua bassa, non solo immersi. */
      altWaterY: { value: -1e9 },
      altCaustics: { value: 0.0 },
      altUnderwater: { value: 0.0 },
      altDeepColor: { value: new THREE.Color(0.02, 0.10, 0.14) },
      altTime: { value: 0.0 },
      /* Ombre delle nuvole: la stessa funzione di densita dello strato in
       * cielo, valutata nel punto in cui il raggio del sole che passa per il
       * frammento buca lo strato. E cio che fa «passare» una nuvola sul prato. */
      altCloudCover: { value: 0.0 },
      altCloudDensity: { value: 1.0 },
      altCloudHeight: { value: 1800.0 },
      altCloudScroll: { value: new THREE.Vector2(0, 0) }
    };
    this.materials = new Set();
  }

  /* Aggancia la nebbia a un materiale qualsiasi (standard, lambert, custom). */
  apply(material) {
    if (material.userData.__altFog) return material;
    material.userData.__altFog = true;
    material.fog = false;               // spegne quella di three
    const u = this.u;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      if (prev) prev(shader, renderer);
      for (const k in u) shader.uniforms[k] = u[k];
      /* Segno della curvatura, per materiale: la volta della Terra cava si
       * piega verso il basso mentre tutto il resto si piega verso l alto. */
      shader.uniforms.altFlip = material.userData.altFlip || { value: 1.0 };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          out vec3 vAltWorld;
          uniform float altCurve, altFlip;`)
        /* Il blocco di proiezione viene riscritto invece che aggiunto: serve
         * infilare la curvatura fra la trasformazione di vista e la proiezione.
         * mvPosition resta a livello di funzione perche i blocchi successivi di
         * three (ombre, posizione nel mondo) la usano. */
        .replace('#include <project_vertex>', `
          vec4 altLocal = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            altLocal = instanceMatrix * altLocal;
          #endif
          vAltWorld = (modelMatrix * altLocal).xyz;
          vec4 mvPosition = modelViewMatrix * altLocal;
          /* Curvatura nello spazio del mondo: il vertice scende (o sale) con
           * il quadrato della distanza ORIZZONTALE dalla camera, lungo la
           * verticale del mondo. La versione precedente piegava lungo l asse
           * di vista, e guardando in su o in giu il mondo si storceva. */
          if (altCurve != 0.0) {
            vec2 altD = vAltWorld.xz - cameraPosition.xz;
            mvPosition.xyz += (viewMatrix * vec4(0.0, -dot(altD, altD) * altCurve * altFlip, 0.0, 0.0)).xyz;
          }
          gl_Position = projectionMatrix * mvPosition;
        `);

      /* Il chunk delle luci di three viene espanso qui e ritoccato: subito
       * dopo aver letto la luce direzionale, la si attenua con l ombra della
       * nuvola. Non c e altro punto in cui la luce diretta sia gia un valore
       * e non ancora sommata al resto. */
      const luci = THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= altCloudShadow(vAltWorld);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <lights_fragment_begin>', luci)
        .replace('#include <common>', `#include <common>
          in vec3 vAltWorld;
          uniform sampler2D altSkyLut;
          uniform float altFogDensity, altFogFalloff, altFogBaseY, altFogMax, altFogStart;
          uniform float altFogOverrideMix, altFarFade, altFadeHorizontal;
          uniform vec3 altFogTint, altFogOverride, altSunDir, altSunColor, altDeepColor;
          uniform float altWaterY, altCaustics, altUnderwater, altTime;
          uniform float altCloudCover, altCloudDensity, altCloudHeight;
          uniform vec2 altCloudScroll;
          ${GLSL_SKY_LUT}
          ${GLSL_NOISE}

          /* Quanto sole arriva a terra sotto lo strato di nuvole. La formula
           * della densita e la stessa di clouds() in sky.js, con lo stesso
           * scorrimento: cosi l ombra sta esattamente sotto la nuvola che si
           * vede, e si muove con lei. */
          float altCloudShadow(vec3 wp){
            if (altCloudCover < 0.005) return 1.0;
            float sy = max(altSunDir.y, 0.06);
            /* Lo strato in cielo sta a altCloudHeight SOPRA LA CAMERA, non
             * sul livello del mare: la stessa quota va usata qui, o l ombra
             * non sta sotto la nuvola che si vede. */
            float quota = cameraPosition.y + altCloudHeight;
            vec2 p = wp.xz + altSunDir.xz / sy * (quota - wp.y);
            vec2 uv = p * 0.00023 + altCloudScroll;
            /* Stesso domain warp e stesse ottave del cielo: quando il sole
             * entra in una nuvola, la luce a terra deve calare in quel momento. */
            vec2 w = vec2(alt_fbm2(uv * 2.1 + 5.2, 3), alt_fbm2(uv * 2.1 - 3.7, 3)) - 0.5;
            float shape = alt_fbm2(uv + w * 0.55, 5);
            float detail = alt_fbm2(uv * 5.5 + altCloudScroll * 2.3, 4);
            float d = shape + detail * 0.22 - (1.0 - altCloudCover) * 0.92;
            d = smoothstep(0.0, 0.30, d) * altCloudDensity;
            return 1.0 - d * 0.82;
          }

          /* Caustiche: la superficie increspata concentra la luce in reticoli
           * che scorrono. Due campi di rumore che si inseguono, la loro
           * differenza elevata a potenza alta lascia solo le creste. */
          float altCaustic(vec2 p, float t){
            vec2 q = p * 0.62;
            float a = alt_fbm2(q + vec2(t * 0.09, t * 0.065), 3);
            float b = alt_fbm2(q * 1.63 + vec2(-t * 0.075, t * 0.11) + 5.0, 3);
            return pow(clamp(1.0 - abs(a - b) * 2.7, 0.0, 1.0), 7.0);
          }

          /* Integrale della densita esponenziale in quota lungo il segmento
           * camera -> frammento. Forma chiusa, niente marcia. */
          float altFogIntegral(vec3 camP, vec3 wP){
            vec3 dv = wP - camP;
            float dist = length(dv);
            if (dist < 1e-4) return 0.0;
            float yc = camP.y - altFogBaseY;
            float yp = wP.y  - altFogBaseY;
            float ac = clamp(-altFogFalloff * yc, -12.0, 12.0);
            float ap = clamp(-altFogFalloff * yp, -12.0, 12.0);
            float dy = yp - yc;
            float I;
            if (abs(dy) < 1e-3 || altFogFalloff < 1e-6){
              I = altFogDensity * dist * exp(ac);
            } else {
              I = altFogDensity * dist * (exp(ac) - exp(ap)) / (altFogFalloff * dy);
            }
            return max(I, 0.0);
          }

          vec3 altApplyFog(vec3 color){
            vec3 dv = vAltWorld - cameraPosition;
            float dist = length(dv);
            vec3 vd = dv / max(dist, 1e-4);

            /* Sotto il pelo dell acqua: reticolo di luce sul fondo e colore
             * che vira al blu con la profondita. */
            float wDepth = altWaterY - vAltWorld.y;
            if (altCaustics > 0.0 && wDepth > 0.0){
              float c = altCaustic(vAltWorld.xz, altTime);
              color *= 1.0 + c * altCaustics * exp(-wDepth * 0.085) * 1.6;
              color = mix(color, color * altDeepColor * 6.0, clamp(wDepth * 0.055, 0.0, 0.75));
            }

            float I = altFogIntegral(cameraPosition, vAltWorld);
            float f = 1.0 - exp(-I);

            // i primi metri restano sempre limpidi, altrimenti le mani sfumano
            f *= smoothstep(0.0, altFogStart, dist);
            // e al confine del mondo si chiude comunque, cosi il terreno non finisce di netto
            float altFadeD = mix(dist, length(vAltWorld.xz - cameraPosition.xz), altFadeHorizontal);
            f = max(f, smoothstep(altFarFade * 0.72, altFarFade, altFadeD));
            f = clamp(f * altFogMax, 0.0, 1.0);
            if (f <= 0.0005) return color;

            vec3 fogCol = alt_sampleSky(altSkyLut, vd) * altFogTint;
            fogCol = mix(fogCol, altFogOverride, altFogOverrideMix);
            if (altUnderwater > 0.5){
              // immersi la nebbia e l acqua stessa, e si chiude molto prima
              fogCol = altDeepColor * (0.55 + 0.9 * max(0.0, vd.y));
            }
            return mix(color, fogCol, f);
          }`)
        .replace('#include <fog_fragment>', `
          gl_FragColor.rgb = altApplyFog(gl_FragColor.rgb);`);

      material.userData.__altShader = shader;
    };
    /* Chiave di cache del programma: senza, three puo riusare il programma
     * compilato di un altro materiale che ha gli stessi parametri di base ma
     * iniezioni diverse, e finisce per disegnare con lo shader sbagliato. */
    if (!material.customProgramCacheKey || material.customProgramCacheKey() === '') {
      material.customProgramCacheKey = () => 'altfog';
    } else {
      const base = material.customProgramCacheKey();
      material.customProgramCacheKey = () => base + '|altfog';
    }
    material.needsUpdate = true;
    this.materials.add(material);
    return material;
  }

  /* Aggiorna i parametri. Un solo oggetto uniform per tutti i materiali. */
  set(params) {
    const u = this.u;
    if (params.lut !== undefined) u.altSkyLut.value = params.lut;
    if (params.density !== undefined) u.altFogDensity.value = params.density;
    if (params.falloff !== undefined) u.altFogFalloff.value = params.falloff;
    if (params.baseY !== undefined) u.altFogBaseY.value = params.baseY;
    if (params.tint) u.altFogTint.value.setRGB(params.tint[0], params.tint[1], params.tint[2]);
    if (params.override) u.altFogOverride.value.setRGB(params.override[0], params.override[1], params.override[2]);
    if (params.overrideMix !== undefined) u.altFogOverrideMix.value = params.overrideMix;
    if (params.max !== undefined) u.altFogMax.value = params.max;
    if (params.start !== undefined) u.altFogStart.value = params.start;
    if (params.sunDir) u.altSunDir.value.copy(params.sunDir);
    if (params.sunColor) u.altSunColor.value.set(params.sunColor[0], params.sunColor[1], params.sunColor[2]);
    if (params.farFade !== undefined) u.altFarFade.value = params.farFade;
    if (params.fadeHorizontal !== undefined) u.altFadeHorizontal.value = params.fadeHorizontal;
    if (params.curve !== undefined) u.altCurve.value = params.curve;
    if (params.waterY !== undefined) u.altWaterY.value = params.waterY;
    if (params.caustics !== undefined) u.altCaustics.value = params.caustics;
    if (params.underwater !== undefined) u.altUnderwater.value = params.underwater;
    if (params.deepColor) u.altDeepColor.value.setRGB(params.deepColor[0], params.deepColor[1], params.deepColor[2]);
    if (params.time !== undefined) u.altTime.value = params.time;
    if (params.cloudCover !== undefined) u.altCloudCover.value = params.cloudCover;
    if (params.cloudDensity !== undefined) u.altCloudDensity.value = params.cloudDensity;
    if (params.cloudHeight !== undefined) u.altCloudHeight.value = params.cloudHeight;
    if (params.cloudScroll) u.altCloudScroll.value.copy(params.cloudScroll);
  }
}

/* Frammento GLSL da incollare nei ShaderMaterial scritti a mano (acqua,
 * particelle) che non passano dai chunk di three. */
export const GLSL_FOG_DECL = /* glsl */`
/* Chi include questo blocco dichiara da se il proprio varying di posizione:
 * ShaderMaterial usa la sintassi varying, i RawShaderMaterial usano in/out. */
uniform sampler2D altSkyLut;
uniform float altFogDensity, altFogFalloff, altFogBaseY, altFogMax, altFogStart;
uniform float altFogOverrideMix, altFarFade, altFadeHorizontal;
uniform vec3 altFogTint, altFogOverride, altSunDir, altSunColor;
${GLSL_SKY_LUT}
float altFogIntegral(vec3 camP, vec3 wP){
  vec3 dv = wP - camP;
  float dist = length(dv);
  if (dist < 1e-4) return 0.0;
  float yc = camP.y - altFogBaseY;
  float yp = wP.y  - altFogBaseY;
  float ac = clamp(-altFogFalloff * yc, -12.0, 12.0);
  float ap = clamp(-altFogFalloff * yp, -12.0, 12.0);
  float dy = yp - yc;
  if (abs(dy) < 1e-3 || altFogFalloff < 1e-6) return max(altFogDensity * dist * exp(ac), 0.0);
  return max(altFogDensity * dist * (exp(ac) - exp(ap)) / (altFogFalloff * dy), 0.0);
}
vec3 altApplyFogAt(vec3 color, vec3 wPos, vec3 camPos){
  vec3 dv = wPos - camPos;
  float dist = length(dv);
  vec3 vd = dv / max(dist, 1e-4);
  float f = 1.0 - exp(-altFogIntegral(camPos, wPos));
  f *= smoothstep(0.0, altFogStart, dist);
  float altFadeD = mix(dist, length(wPos.xz - camPos.xz), altFadeHorizontal);
  f = max(f, smoothstep(altFarFade * 0.72, altFarFade, altFadeD));
  f = clamp(f * altFogMax, 0.0, 1.0);
  if (f <= 0.0005) return color;
  vec3 fogCol = alt_sampleSky(altSkyLut, vd) * altFogTint;
  fogCol = mix(fogCol, altFogOverride, altFogOverrideMix);
  return mix(color, fogCol, f);
}
`;
