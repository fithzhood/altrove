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
import { GLSL_SKY_LUT } from './sky.js?v=1';

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
      /* Curvatura del mondo: vale 0 ovunque tranne sul pianetino. */
      altCurve: { value: 0.0 }
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

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          out vec3 vAltWorld;
          uniform float altCurve;`)
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
          mvPosition.y -= mvPosition.z * mvPosition.z * altCurve;
          gl_Position = projectionMatrix * mvPosition;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          in vec3 vAltWorld;
          uniform sampler2D altSkyLut;
          uniform float altFogDensity, altFogFalloff, altFogBaseY, altFogMax, altFogStart;
          uniform float altFogOverrideMix, altFarFade;
          uniform vec3 altFogTint, altFogOverride, altSunDir, altSunColor;
          ${GLSL_SKY_LUT}

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

            float I = altFogIntegral(cameraPosition, vAltWorld);
            float f = 1.0 - exp(-I);

            // i primi metri restano sempre limpidi, altrimenti le mani sfumano
            f *= smoothstep(0.0, altFogStart, dist);
            // e al confine del mondo si chiude comunque, cosi il terreno non finisce di netto
            f = max(f, smoothstep(altFarFade * 0.72, altFarFade, dist));
            f = clamp(f * altFogMax, 0.0, 1.0);
            if (f <= 0.0005) return color;

            vec3 fogCol = alt_sampleSky(altSkyLut, vd) * altFogTint;
            fogCol = mix(fogCol, altFogOverride, altFogOverrideMix);
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
    if (params.curve !== undefined) u.altCurve.value = params.curve;
  }
}

/* Frammento GLSL da incollare nei ShaderMaterial scritti a mano (acqua,
 * particelle) che non passano dai chunk di three. */
export const GLSL_FOG_DECL = /* glsl */`
/* Chi include questo blocco dichiara da se il proprio varying di posizione:
 * ShaderMaterial usa la sintassi varying, i RawShaderMaterial usano in/out. */
uniform sampler2D altSkyLut;
uniform float altFogDensity, altFogFalloff, altFogBaseY, altFogMax, altFogStart;
uniform float altFogOverrideMix, altFarFade;
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
  f = max(f, smoothstep(altFarFade * 0.72, altFarFade, dist));
  f = clamp(f * altFogMax, 0.0, 1.0);
  if (f <= 0.0005) return color;
  vec3 fogCol = alt_sampleSky(altSkyLut, vd) * altFogTint;
  fogCol = mix(fogCol, altFogOverride, altFogOverrideMix);
  return mix(color, fogCol, f);
}
`;
