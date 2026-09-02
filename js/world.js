/* Altrove - world.js
 * Il mondo e una funzione pura: dato (x, z) restituisce la quota, la pendenza e
 * di che cosa e fatta la superficie. Non esiste una mappa in memoria, per cui
 * il mondo e infinito e ricomincia identico a parita di seme.
 *
 * Regola di ferro: height(x,z) NON deve mai dipendere dal livello di dettaglio.
 * Se due LOD adiacenti calcolassero altezze diverse sullo stesso punto si
 * aprirebbero crepe nel terreno.
 */

import { Noise, clamp, lerp, smoothstep, saturate, hash2i } from './noise.js?v=29';

/* sRGB -> lineare. Le palette dei biomi sono scritte come colori "da schermo",
 * ma i vertex color devono arrivare allo shader gia in spazio lineare. */
function s2l(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function hexToLinear(hex) {
  return [
    s2l(((hex >> 16) & 255) / 255),
    s2l(((hex >> 8) & 255) / 255),
    s2l((hex & 255) / 255)
  ];
}
export function hexToSrgbArr(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/* Parametri della griglia stradale del bioma citta */
export const CITY = {
  block: 92,        // passo della griglia
  roadHalf: 8.5,    // mezza carreggiata
  walkHalf: 12.0,   // marciapiede incluso
  avenueEvery: 4,   // ogni N isolati la strada e un viale
  avenueExtra: 5.0
};

export class World {
  constructor(biome, seed) {
    this.b = biome;
    this.seed = (seed | 0) || 1;
    const s = (this.seed ^ (biome.seed * 7919)) >>> 0;
    this.n = new Noise(s);
    this.nw = new Noise((s + 4517) >>> 0);   // domain warp
    this.nm = new Noise((s + 9931) >>> 0);   // umidita
    this.nd = new Noise((s + 2287) >>> 0);   // dettaglio / variazione colore
    this.kind = biome.terrain;
    this.pal = {};
    for (const k in biome.palette) this.pal[k] = hexToLinear(biome.palette[k]);
    this.waterLevel = biome.waterLevel;
    this.hasWater = biome.waterLevel !== null && biome.waterLevel !== undefined;
    this.isCity = !!biome.city;

    /* Un parametro del terreno dimenticato non produce un errore: produce
     * NaN, e NaN si propaga in silenzio a tutto il campo di altezze. Il
     * risultato e un mondo invisibile con il giocatore a quota NaN e la
     * console pulita, che e il modo peggiore di rompersi. Venti campioni al
     * momento della costruzione costano niente e trasformano un mistero in
     * un messaggio che dice quale bioma e quale forma di terreno. */
    for (let i = 0; i < 20; i++) {
      const a = i * 2.399;
      const h = this.height(Math.cos(a) * i * 37, Math.sin(a) * i * 41);
      if (!Number.isFinite(h)) {
        throw new Error(
          'quota non finita nel bioma «' + (biome.id || '?') + '» (terreno «' +
          this.kind + '»): manca un parametro in biome.' + this.kind + '?');
      }
    }
  }

  /* ---------------- distanza dalla strada (solo citta) ---------------- */

  roadDistance(x, z) {
    const P = CITY.block;
    const ix = Math.round(x / P), iz = Math.round(z / P);
    const dx = Math.abs(x - ix * P);
    const dz = Math.abs(z - iz * P);
    const wx = CITY.roadHalf + (Math.abs(ix) % CITY.avenueEvery === 0 ? CITY.avenueExtra : 0);
    const wz = CITY.roadHalf + (Math.abs(iz) % CITY.avenueEvery === 0 ? CITY.avenueExtra : 0);
    // distanza con segno dal bordo della carreggiata piu vicina
    return Math.min(dx - wx, dz - wz);
  }

  /* ---------------- campo di altezze ---------------- */

  height(x, z) {
    const b = this.b, n = this.n, nw = this.nw;

    switch (this.kind) {

      case 'hills': {
        const p = b.hills;
        // Il domain warp fa serpeggiare i crinali invece di lasciarli a macchie
        const w = 190;
        const wx = x + nw.fbm2(x * 0.00085, z * 0.00085, 3) * w;
        const wz = z + nw.fbm2(x * 0.00085 + 41.3, z * 0.00085 - 17.9, 3) * w;
        let v = n.fbm2(wx * p.freq, wz * p.freq, p.oct);
        // esponente > 1: i fondivalle si appiattiscono, le cime restano
        v = Math.sign(v) * Math.pow(Math.abs(v), 1.22);
        let h = v * p.amp;
        h += n.fbm2(x * p.medFreq + 31.7, z * p.medFreq - 11.3, 4) * p.medAmp;
        h += n.fbm2(x * 0.058, z * 0.058, 2) * p.microAmp;
        if (b.castle) h = this._castleShape(x, z, h);
        return h;
      }

      case 'peaks': {
        const p = b.peaks;
        const w = 240;
        const wx = x + nw.fbm2(x * 0.0006, z * 0.0006, 3) * w;
        const wz = z + nw.fbm2(x * 0.0006 + 13.1, z * 0.0006 + 88.4, 3) * w;
        let r = n.ridged2(wx * p.freq, wz * p.freq, p.oct, 2.03, 0.5, p.sharp ?? 1);
        r = (r + 1) * 0.5;                    // 0..1
        r = Math.pow(r, 1.35);
        /* Maschera del massiccio: senza, le montagne coprono uniformemente
         * tutta la mappa. Con, ci sono catene e fra una catena e l altra si
         * apre una valle larga. */
        const mf = p.massifFreq || 0.00034;
        let mask = nw.fbm2(x * mf + 300.5, z * mf - 122.7, 3) * 0.5 + 0.5;
        mask = smoothstep(0.20, 0.72, mask);
        let h = r * p.amp * (0.16 + 0.84 * mask);
        h += n.fbm2(x * p.medFreq, z * p.medFreq, 4) * p.medAmp * (0.4 + 0.6 * mask);
        h += n.fbm2(x * 0.052 + 7.7, z * 0.052, 2) * p.microAmp;
        // fondovalle morbido: smooth-max contro il piano di base
        const f = p.valleyFloor;
        const k = p.floorK || 22;
        h = f + 0.5 * ((h - f) + Math.sqrt((h - f) * (h - f) + k * k)) - k * 0.5;
        return h;
      }

      case 'dunes': {
        const p = b.dunes;
        // mesa: terrazzamento del rumore a grande scala
        let q = n.fbm2(x * p.mesaFreq, z * p.mesaFreq, 4) * 0.5 + 0.5;
        const steps = 3.0;
        const qt = Math.floor(q * steps) / steps;
        const frac = q * steps - Math.floor(q * steps);
        const edge = smoothstep(0.72, 0.94, frac) / steps;
        q = qt + edge + (q - qt) * 0.18;
        let h = q * p.mesaAmp;
        /* Dune: billow fortemente anisotropo. Le creste sono lunghe centinaia
         * di metri lungo il vento e si ripetono ogni ~100 m di traverso. Un
         * warp leggero le fa serpeggiare invece di lasciarle rettilinee. */
        const ang = 0.42;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let dx = x * ca - z * sa, dz = x * sa + z * ca;
        dz += nw.fbm2(dx * 0.0022, dz * 0.0022, 2) * 90;
        let d = n.billow2(dx * p.duneFreqX, dz * p.duneFreqZ, 3);
        d = -d;                                    // creste, non solchi
        // asimmetria: sopravento dolce, sottovento ripido
        d = d < 0 ? d * 0.45 : Math.pow(d, 0.62);
        h += d * p.duneAmp;
        h += n.fbm2(x * 0.09, z * 0.09, 2) * p.microAmp;
        return h;
      }

      case 'coast': {
        const p = b.coast;
        const w = 150;
        const wx = x + nw.fbm2(x * 0.0009, z * 0.0009, 3) * w;
        const wz = z + nw.fbm2(x * 0.0009 - 22.5, z * 0.0009 + 61.2, 3) * w;
        let v = n.fbm2(wx * p.freq, wz * p.freq, p.oct);
        v = Math.sign(v) * Math.pow(Math.abs(v), 1.15);
        let h = v * p.amp + p.bias;
        h += n.fbm2(x * p.medFreq, z * p.medFreq, 3) * p.medAmp;
        // spiaggia: comprimi le quote vicino al pelo dell acqua
        const a = Math.abs(h);
        const flat = lerp(0.26, 1.0, smoothstep(0.0, p.beachBand, a));
        h *= flat;
        h += n.fbm2(x * 0.075, z * 0.075, 2) * p.microAmp * (0.35 + 0.65 * smoothstep(0, 4, a));
        return h;
      }

      case 'savanna': {
        const p = b.savanna;
        let h = n.fbm2(x * p.freq, z * p.freq, p.oct) * p.amp;
        // kopje: affioramenti granitici isolati che rompono la piana
        const cut = p.kopjeCut ?? 0.18;
        let k = n.fbm2(x * p.kopjeFreq + 55.5, z * p.kopjeFreq - 12.2, 4);
        k = Math.max(0, k - cut) / (1 - cut);
        /* Valori di riserva: un parametro dimenticato dava Math.pow(k, undefined)
         * = NaN, e da li NaN in tutto il campo di altezze — terreno invisibile,
         * quota del giocatore NaN, e nessun errore in console. */
        h += Math.pow(k, p.kopjePow ?? 3.0) * (p.kopjeAmp ?? 0);
        h += n.fbm2(x * (p.medFreq ?? 0.01), z * (p.medFreq ?? 0.01), 3) * (p.medAmp ?? 0);
        h += n.fbm2(x * 0.07, z * 0.07, 2) * p.microAmp;
        return h;
      }

      case 'swamp': {
        const p = b.swamp;
        let h = n.fbm2(x * p.freq, z * p.freq, p.oct) * p.amp;
        h = Math.sign(h) * Math.pow(Math.abs(h), 1.5) * 1.2;
        const hum = n.billow2(x * p.hummockFreq, z * p.hummockFreq, 3);
        h += Math.max(0, hum) * p.hummockAmp;
        h += n.fbm2(x * 0.11, z * 0.11, 2) * p.microAmp;
        return h;
      }

      /* Cono vulcanico isolato in mezzo a una piana. Il profilo e una
       * potenza della distanza dal centro; il cratere e una conca scavata in
       * cima, e le scanalature radiali sono le colate. */
      case 'cone': {
        const p = b.cone;
        const d = Math.hypot(x, z);
        const t = Math.max(0, 1 - d / p.radius);
        let h = Math.pow(t, p.pow) * p.height;
        const ang = Math.atan2(z, x);
        const flute = Math.sin(ang * p.flutes + nw.fbm2(x * 0.0035, z * 0.0035, 3) * 5.0);
        h += flute * p.fluteAmp * smoothstep(p.radius, p.craterR, d);
        if (d < p.craterR) {
          const u = d / p.craterR;
          h -= (1 - u * u) * p.craterDepth;
        }
        h += n.fbm2(x * 0.0021, z * 0.0021, 5) * p.plainAmp;
        h += n.fbm2(x * 0.035, z * 0.035, 3) * p.microAmp;
        return h;
      }

      /* Barriera corallina: tutto sotto il pelo dell acqua. Le creste della
       * barriera salgono quasi in superficie ma non emergono mai, per cui il
       * mondo si guarda solo da dentro. */
      case 'reef': {
        const p = b.reef;
        let h = n.fbm2(x * p.freq, z * p.freq, 5) * p.amp + p.base;
        let r = n.ridged2(x * p.reefFreq, z * p.reefFreq, 4, 2.03, 0.5, 0.5);
        r = (r + 1) * 0.5;
        h += Math.pow(r, 1.9) * p.reefAmp;
        h += n.fbm2(x * 0.055, z * 0.055, 3) * p.medAmp;
        h += n.fbm2(x * 0.22, z * 0.22, 2) * p.microAmp;
        return Math.min(h, p.maxH);
      }

      /* Crateri: superficie lunare o marziana. Ogni cella della griglia puo
       * ospitare un cratere, con la conca dentro e il bordo rialzato fuori. Il
       * profilo e quello vero: parabola all interno, gaussiana sul labbro. */
      case 'craters': {
        const p = b.craters;
        let h = n.fbm2(x * p.freq, z * p.freq, 5) * p.amp;
        h += n.fbm2(x * p.freq * 5.3 + 11.1, z * p.freq * 5.3, 4) * p.amp * 0.22;
        const cell = p.cellSize;
        const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const ci = gx + i, cj = gz + j;
            if (hash2i(ci, cj, 13) > p.density) continue;
            const px = (ci + hash2i(ci, cj, 7)) * cell;
            const pz = (cj + hash2i(ci, cj, 11)) * cell;
            const rad = cell * (0.10 + 0.32 * hash2i(ci, cj, 17));
            const d = Math.hypot(x - px, z - pz);
            if (d > rad * 2.0) continue;
            const t = d / rad;
            const scale = rad * p.depth;
            if (t < 1) h -= (1 - t * t) * scale;
            const e = (t - 1.0) * 3.0;
            h += Math.exp(-e * e) * rad * p.rim;
          }
        }
        h += n.fbm2(x * 0.09, z * 0.09, 2) * p.microAmp;
        return h;
      }

      /* Canyon: altopiano a terrazze inciso da forre. Le terrazze vengono dal
       * troncamento del rumore, le forre da un ridged elevato a potenza alta,
       * che lascia solo i solchi piu stretti. */
      case 'canyon': {
        const p = b.canyon;
        const w = 120;
        const wx = x + nw.fbm2(x * 0.0011, z * 0.0011, 3) * w;
        const wz = z + nw.fbm2(x * 0.0011 + 9.3, z * 0.0011 - 4.4, 3) * w;
        let base = n.fbm2(wx * p.freq, wz * p.freq, 5) * 0.5 + 0.5;
        const st = p.steps;
        const fl = Math.floor(base * st);
        const fr = base * st - fl;
        const q = fl / st + smoothstep(0.74, 0.96, fr) / st + (fr / st) * 0.14;
        let h = q * p.amp;
        let r = 1 - Math.abs(n.fbm2(x * p.riverFreq + 3.3, z * p.riverFreq - 7.1, 4));
        r = Math.pow(Math.max(0, r), p.riverPow);
        h -= r * p.cut;
        h += n.fbm2(x * 0.045, z * 0.045, 3) * p.microAmp;
        return h;
      }

      /* Isole sospese. Una maschera decide dove c e terra; dove non ce n e,
       * la quota precipita sotto il mare di nuvole e sparisce. La transizione
       * e strettissima di proposito: e quella che diventa la falesia. */
      case 'islands': {
        const p = b.islands;
        let m = n.fbm2(x * p.maskFreq, z * p.maskFreq, 4);
        // il bordo non deve essere una curva liscia
        m += nw.fbm2(x * 0.0075, z * 0.0075, 3) * 0.075;
        m -= p.cut;
        const t = smoothstep(0, p.edge, m);
        const top = p.base
          + n.fbm2(x * p.detFreq, z * p.detFreq, 4) * p.detAmp
          + n.fbm2(x * 0.055, z * 0.055, 2) * 0.9;
        return lerp(p.abyss, top, Math.pow(t, 0.45));
      }

      /* Pianetino: rilievo minuto. La sensazione di stare su una palla piccola
       * la da la curvatura applicata negli shader, non il campo di altezze. */
      case 'planetoid': {
        const p = b.planetoid;
        let h = n.fbm2(x * p.freq, z * p.freq, 4) * p.amp;
        h += n.fbm2(x * 0.055 + 12.1, z * 0.055, 3) * p.microAmp;
        return h;
      }

      case 'flat':
      default: {
        const p = b.flat;
        // base: serve al mare aperto, dove il fondale deve stare ben sotto
        let h = n.fbm2(x * p.freq, z * p.freq, 3) * p.amp + (p.base || 0);
        if (this.isCity) {
          // le carreggiate sono lisce: spegni il micro-rumore sull asfalto
          const rd = this.roadDistance(x, z);
          const onRoad = 1 - smoothstep(-1.0, 5.0, rd);
          h += n.fbm2(x * 0.05, z * 0.05, 2) * p.microAmp * (1 - onRoad * 0.92);
          // leggerissimo dosso al centro carreggiata per il drenaggio
          h -= onRoad * 0.06;
        } else {
          h += n.fbm2(x * 0.05, z * 0.05, 2) * p.microAmp;
        }
        return h;
      }
    }
  }

  /* Un castello su una collina ondulata galleggerebbe da un lato e
   * sprofonderebbe dall altro. Qui il terreno viene spianato sotto la cinta e
   * scavato poco piu in la, per avere il lago dove serve. */
  _castleShape(x, z, h) {
    /* Il raccordo e lungo duecento metri, non cinquanta: cosi il castello non
     * sta su un tavolo ma in cima a un poggio, e lo si vede arrivando. */
    const d = Math.hypot(x, z);
    const t = smoothstep(200, 54, d);
    h = lerp(h, 22, t);

    // gola scavata a nord: e quella che il ponte attraversa
    const gz = smoothstep(-38, -62, z) * (1 - smoothstep(-96, -118, z));
    const gx = 1 - smoothstep(30, 56, Math.abs(x));
    h = lerp(h, -6, gz * gx * 0.94);

    // il lago comincia oltre la gola
    const dl = Math.hypot(x * 0.85, z + 330);
    const lt = smoothstep(215, 90, dl);
    h = lerp(h, -34, lt);
    return h;
  }

  /* Zona in cui non deve crescere niente: il cortile e il ponte. */
  blocked(x, z) {
    if (!this.b.castle) return false;
    if (Math.abs(x) < 84 && Math.abs(z) < 76) return true;
    if (Math.abs(x) < 13 && z < -48 && z > -145) return true;   // ponte
    return false;
  }

  /* Normale analitica per differenze centrali. eps costante -> nessuna
   * discontinuita di illuminazione fra chunk dello stesso livello. */
  normalAt(x, z, eps = 1.0, out) {
    const hL = this.height(x - eps, z), hR = this.height(x + eps, z);
    const hD = this.height(x, z - eps), hU = this.height(x, z + eps);
    let nx = hL - hR, ny = 2 * eps, nz = hD - hU;
    const inv = 1 / Math.hypot(nx, ny, nz);
    out = out || [0, 0, 0];
    out[0] = nx * inv; out[1] = ny * inv; out[2] = nz * inv;
    return out;
  }

  slopeAt(x, z, eps = 1.0) {
    const n = this.normalAt(x, z, eps, this._tmpN || (this._tmpN = [0, 0, 0]));
    return 1 - n[1];
  }

  moisture(x, z, h) {
    let m = this.nm.fbm2(x * 0.0022, z * 0.0022, 4) * 0.5 + 0.5;
    m += this.nm.fbm2(x * 0.014, z * 0.014, 2) * 0.12;
    // le quote basse trattengono acqua, le cime no
    if (this.hasWater) m += saturate((this.waterLevel + 14 - h) / 26) * 0.32;
    else m -= saturate((h - 30) / 160) * 0.2;
    return clamp(m, 0, 1);
  }

  /* ---------------- classificazione della superficie ----------------
   * out = [r, g, b, snowAffinity, rockMask, wetAffinity, glow] */
  surface(x, z, h, ny, out) {
    const b = this.b, P = this.pal, nd = this.nd;
    const slope = 1 - ny;                       // 0 piatto, ~1 verticale
    const moist = this.moisture(x, z, h);

    // screziatura: rompe l uniformita a media distanza
    const varA = nd.fbm2(x * 0.035, z * 0.035, 3);
    const varB = nd.fbm2(x * 0.0075, z * 0.0075, 3);
    const varC = nd.fbm2(x * 0.19, z * 0.19, 2);

    let rock = smoothstep(0.16, 0.42, slope + varB * 0.07);
    let r, g, bl;

    if (this.kind === 'dunes') {
      // sabbia chiara sulle creste, ombreggiata negli avvallamenti
      const crest = saturate((h - 18) / 34) * 0.5 + saturate(varA * 0.5 + 0.5) * 0.5;
      const sa = P.sand, sl = P.sandLight || P.sand;
      r = lerp(sa[0], sl[0], crest); g = lerp(sa[1], sl[1], crest); bl = lerp(sa[2], sl[2], crest);
      rock = smoothstep(0.30, 0.62, slope);
      const rk = h > 34 ? P.rock : P.rockDark;
      r = lerp(r, rk[0], rock); g = lerp(g, rk[1], rock); bl = lerp(bl, rk[2], rock);
      // chiazze di sterpaglia dove c e umidita
      const scrub = saturate((moist - 0.62) * 3.2) * (1 - rock);
      r = lerp(r, P.grassLow[0], scrub * 0.55);
      g = lerp(g, P.grassLow[1], scrub * 0.55);
      bl = lerp(bl, P.grassLow[2], scrub * 0.55);

    } else if (this.kind === 'coast') {
      const wl = this.waterLevel;
      const above = h - wl;
      const beach = 1 - smoothstep(0.4, b.coast.beachBand, above);
      const gl = P.grassLow, gh = P.grassHigh;
      const alt = saturate((h - 4) / 70);
      r = lerp(gl[0], gh[0], alt); g = lerp(gl[1], gh[1], alt); bl = lerp(gl[2], gh[2], alt);
      const dry = saturate((0.55 - moist) * 2.0);
      r = lerp(r, P.grassDry[0], dry * 0.5); g = lerp(g, P.grassDry[1], dry * 0.5); bl = lerp(bl, P.grassDry[2], dry * 0.5);
      const sa = P.sand, sl2 = P.sandLight || P.sand;
      const sm = saturate(varA * 0.5 + 0.5);
      const sr = lerp(sa[0], sl2[0], sm), sg = lerp(sa[1], sl2[1], sm), sb = lerp(sa[2], sl2[2], sm);
      r = lerp(r, sr, beach); g = lerp(g, sg, beach); bl = lerp(bl, sb, beach);
      const rk = P.rock;
      r = lerp(r, rk[0], rock * 0.9); g = lerp(g, rk[1], rock * 0.9); bl = lerp(bl, rk[2], rock * 0.9);
      // fondale
      if (above < 0) {
        const uw = saturate(-above / 6);
        r = lerp(r, P.underwater[0], uw * 0.75);
        g = lerp(g, P.underwater[1], uw * 0.75);
        bl = lerp(bl, P.underwater[2], uw * 0.75);
      }

    } else if (this.isCity) {
      const rd = this.roadDistance(x, z);
      const road = 1 - smoothstep(-0.6, 0.4, rd);
      const walk = (1 - smoothstep(-0.4, 0.5, rd - (CITY.walkHalf - CITY.roadHalf))) - road;
      const gl = P.grassLow, gh = P.grassHigh;
      const alt = saturate(varB * 0.5 + 0.5);
      r = lerp(gl[0], gh[0], alt); g = lerp(gl[1], gh[1], alt); bl = lerp(gl[2], gh[2], alt);
      const dry = saturate((0.5 - moist) * 2.0);
      r = lerp(r, P.grassDry[0], dry * 0.45); g = lerp(g, P.grassDry[1], dry * 0.45); bl = lerp(bl, P.grassDry[2], dry * 0.45);
      const asp = hexToLinear(b.palette.asphalt);
      const sw = hexToLinear(b.palette.sidewalk);
      const grain = varC * 0.06;
      r = lerp(r, asp[0] + grain, road); g = lerp(g, asp[1] + grain, road); bl = lerp(bl, asp[2] + grain, road);
      r = lerp(r, sw[0] + grain, Math.max(0, walk)); g = lerp(g, sw[1] + grain, Math.max(0, walk)); bl = lerp(bl, sw[2] + grain, Math.max(0, walk));
      rock = road * 0.0;
      // asfalto e marciapiede: niente neve d erba, ma tanta acqua
      out[3] = (1 - slope * 1.4) * 0.75;
      out[4] = 0;
      out[5] = saturate(1 - slope * 3) * (0.35 + 0.65 * Math.max(road, Math.max(0, walk)));
      out[6] = 0;
      out[0] = r; out[1] = g; out[2] = bl;
      return out;

    } else if (this.kind === 'peaks') {
      const gl = P.grassLow, gh = P.grassHigh;
      const alt = saturate((h - 10) / 130);
      r = lerp(gl[0], gh[0], alt); g = lerp(gl[1], gh[1], alt); bl = lerp(gl[2], gh[2], alt);
      const dry = saturate((0.5 - moist) * 2.2);
      r = lerp(r, P.grassDry[0], dry * 0.55); g = lerp(g, P.grassDry[1], dry * 0.55); bl = lerp(bl, P.grassDry[2], dry * 0.55);
      // sopra il limite della vegetazione: ghiaione
      const bare = smoothstep(120, 200, h);
      const scree = P.scree || P.rock;
      r = lerp(r, scree[0], bare); g = lerp(g, scree[1], bare); bl = lerp(bl, scree[2], bare);
      rock = Math.max(rock, smoothstep(0.13, 0.34, slope));
      const rk = varA > 0 ? P.rock : P.rockDark;
      r = lerp(r, rk[0], rock); g = lerp(g, rk[1], rock); bl = lerp(bl, rk[2], rock);

    } else if (this.kind === 'swamp') {
      const gl = P.grassLow, gh = P.grassHigh;
      const alt = saturate((h - this.waterLevel) / 5);
      r = lerp(P.dirt[0], gl[0], alt); g = lerp(P.dirt[1], gl[1], alt); bl = lerp(P.dirt[2], gl[2], alt);
      const mossy = saturate(varA * 0.5 + 0.5);
      r = lerp(r, gh[0], mossy * 0.55); g = lerp(g, gh[1], mossy * 0.55); bl = lerp(bl, gh[2], mossy * 0.55);
      if (h < this.waterLevel) {
        const uw = saturate((this.waterLevel - h) / 2.5);
        r = lerp(r, P.underwater[0], uw); g = lerp(g, P.underwater[1], uw); bl = lerp(bl, P.underwater[2], uw);
      }
      r = lerp(r, P.rock[0], rock * 0.7); g = lerp(g, P.rock[1], rock * 0.7); bl = lerp(bl, P.rock[2], rock * 0.7);

    } else {
      // colline temperate, tundra, savana
      const gl = P.grassLow, gh = P.grassHigh;
      const alt = saturate((h - (this.hasWater ? this.waterLevel : 0)) / 90);
      /* Tre sorgenti di variazione invece di una: quota, macchie larghe e
       * macchie strette. Con una sola il prato resta una campitura piatta. */
      const mix1 = saturate(alt * 0.55 + (varB * 0.5 + 0.5) * 0.62 + varA * 0.16);
      r = lerp(gl[0], gh[0], mix1); g = lerp(gl[1], gh[1], mix1); bl = lerp(gl[2], gh[2], mix1);
      const dry = saturate((0.52 - moist) * 2.2);
      r = lerp(r, P.grassDry[0], dry * 0.6); g = lerp(g, P.grassDry[1], dry * 0.6); bl = lerp(bl, P.grassDry[2], dry * 0.6);
      // terra battuta nelle zone molto umide e piatte (sentieri, fango)
      const mud = saturate((moist - 0.78) * 4) * (1 - rock);
      r = lerp(r, P.dirt[0], mud * 0.5); g = lerp(g, P.dirt[1], mud * 0.5); bl = lerp(bl, P.dirt[2], mud * 0.5);
      const rk = varA > 0 ? P.rock : P.rockDark;
      r = lerp(r, rk[0], rock); g = lerp(g, rk[1], rock); bl = lerp(bl, rk[2], rock);
      if (this.hasWater && h < this.waterLevel) {
        const uw = saturate((this.waterLevel - h) / 4);
        r = lerp(r, P.underwater[0], uw * 0.8);
        g = lerp(g, P.underwater[1], uw * 0.8);
        bl = lerp(bl, P.underwater[2], uw * 0.8);
      }
    }

    // grana finale
    const grain = varC * 0.045 + varA * 0.02;
    r = clamp(r * (1 + grain), 0, 1);
    g = clamp(g * (1 + grain), 0, 1);
    bl = clamp(bl * (1 + grain), 0, 1);

    // affinita alla neve: superfici piatte e in quota
    const snowLine = b.snowLine;
    let snowAff;
    if (b.alwaysSnow) snowAff = (1 - Math.pow(slope, 0.8) * 1.15);
    else if (snowLine > 9000) snowAff = (1 - slope * 1.6) * 0.9;
    else snowAff = (1 - Math.pow(slope, 0.75) * 1.25) * (0.35 + 0.65 * smoothstep(snowLine - (b.snowBand || 45), snowLine + (b.snowBand || 45), h));
    snowAff = clamp(snowAff, 0, 1);

    // affinita al bagnato: pozzanghere sul piatto
    const wetAff = clamp((1 - slope * 3.2) * (0.45 + 0.55 * moist), 0, 1);

    // bagliore (solo vulcanico): vicino al livello della lava
    let glow = 0;
    if (this.kind === 'cone' && b.cone.craterGlow) {
      const dc = Math.hypot(x, z);
      glow = Math.max(glow, saturate(1 - dc / (b.cone.craterR * 1.25)) * 1.4);
      glow = Math.min(1, glow);
    }
    if (b.emberGlow && this.hasWater) {
      glow = saturate(1 - (h - this.waterLevel) / 9) * (0.35 + 0.65 * saturate(varA * 0.5 + 0.5));
      glow = Math.pow(clamp(glow, 0, 1), 1.7);
    }

    out[0] = r; out[1] = g; out[2] = bl;
    out[3] = snowAff; out[4] = rock; out[5] = wetAff; out[6] = glow;
    return out;
  }

  /* ---------------- utilita ---------------- */

  /* Punto di partenza decente: asciutto, poco ripido, vista aperta. */
  findSpawn() {
    /* Nei mondi sommersi non esiste terra asciutta: si parte a mezz acqua,
     * sopra un punto profondo abbastanza da nuotarci. */
    if (this.kind === 'cone') {
      // ai piedi del vulcano, non sul fianco
      const r = this.b.cone.radius * 1.25;
      const x = 0, z = r;
      return { x, z, h: this.height(x, z) };
    }
    if (this.b.openSea) {
      return { x: 0, z: 0, h: this.waterLevel + 1.4 };
    }
    if (this.b.underwater) {
      for (let i = 0; i < 400; i++) {
        const a = hash2i(i, 5, 3) * Math.PI * 2;
        const rr = Math.sqrt(hash2i(i, 9, 5)) * 180;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const h = this.height(x, z);
        if (this.waterLevel - h > 7) return { x, z, h: h + (this.waterLevel - h) * 0.55 };
      }
      return { x: 0, z: 0, h: this.height(0, 0) + 5 };
    }
    // dove c e un castello si parte davanti al castello, non a caso
    if (this.b.castle) {
      const x = 16, z = 172;
      return { x, z, h: this.height(x, z) };
    }
    const R = 220;
    let best = null;
    for (let i = 0; i < 900; i++) {
      const a = hash2i(i, 3, 11) * Math.PI * 2;
      const rr = Math.sqrt(hash2i(i, 7, 13)) * R;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const h = this.height(x, z);
      if (this.hasWater && h < this.waterLevel + 1.2) continue;
      if (this.kind === 'islands' && h < this.b.islands.base * 0.4) continue;
      if (this.isCity && this.roadDistance(x, z) > 0) continue; // in citta parti in strada
      const sl = this.slopeAt(x, z, 1.5);
      if (sl > 0.22) continue;
      /* Evita di far nascere il giocatore dentro un oggetto: i punti troppo
       * vicini a una cella di scatter fitto vengono penalizzati. */
      const score = -Math.abs(h - (this.hasWater ? this.waterLevel + 8 : 12)) - sl * 60 - rr * 0.02;
      if (!best || score > best.score) best = { x, z, h, score };
      if (i > 200 && best) break;
    }
    if (!best) {
      const h = this.height(0, 0);
      best = { x: 0, z: 0, h };
    }
    return best;
  }

  /* Mappa di profondita per la schiuma sulla riva. Riempie un Float32Array
   * res*res con l altezza del fondo, centrata su (cx, cz). */
  fillHeightField(cx, cz, size, res, arr) {
    const step = size / (res - 1);
    const o = -size * 0.5;
    let k = 0;
    for (let j = 0; j < res; j++) {
      const z = cz + o + j * step;
      for (let i = 0; i < res; i++) {
        arr[k++] = this.height(cx + o + i * step, z);
      }
    }
  }
}
