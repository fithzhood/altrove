/* Altrove - biomes.js
 * Ogni bioma e una ricetta completa: che forma ha il terreno, di che colore e,
 * che cosa ci cresce sopra, quanto e torbida l aria e dov e il livello
 * dell acqua. Il resto del motore non sa niente di "foresta" o "deserto":
 * legge solo questi numeri.
 *
 * Convenzioni:
 *  - densita dello scatter = istanze per metro quadro
 *  - slope 0 = pianura, 1 = parete verticale
 *  - height = quota in metri sul livello del mare del bioma
 *  - moisture = 0 arido, 1 fradicio (rumore indipendente dall altezza)
 */

export const SEASONS = [
  { id: 'primavera', label: 'Primavera', snow: 0.0, foliage: 0x6f9c3a, grassMul: [1.02, 1.10, 0.85], bloom: 1.0 },
  { id: 'estate', label: 'Estate', snow: 0.0, foliage: 0x4a7a2c, grassMul: [1.0, 1.0, 1.0], bloom: 0.35 },
  { id: 'autunno', label: 'Autunno', snow: 0.0, foliage: 0xb56a1e, grassMul: [1.22, 0.98, 0.70], bloom: 0.1 },
  { id: 'inverno', label: 'Inverno', snow: 0.55, foliage: 0x6a5a3c, grassMul: [0.92, 0.88, 0.86], bloom: 0.0 }
];

export const WEATHERS = [
  {
    id: 'sereno', label: 'Sereno', icon: 'sun',
    cloudCover: 0.06, cloudDensity: 0.5, cloudHeight: 2600, turbidityMul: 1.0,
    fogMul: 1.0, sunMul: 1.0, ambientMul: 1.0, wind: 0.25,
    rain: 0, snow: 0, dust: 0, lightning: 0, wetness: 0, contrast: 1.0
  },
  {
    id: 'poconuvoloso', label: 'Poco nuvoloso', icon: 'cloudsun',
    cloudCover: 0.36, cloudDensity: 0.75, cloudHeight: 2400, turbidityMul: 1.1,
    fogMul: 1.15, sunMul: 0.94, ambientMul: 1.08, wind: 0.4,
    rain: 0, snow: 0, dust: 0, lightning: 0, wetness: 0, contrast: 0.98
  },
  {
    id: 'coperto', label: 'Coperto', icon: 'cloud',
    cloudCover: 0.92, cloudDensity: 1.0, cloudHeight: 1500, turbidityMul: 1.5,
    fogMul: 2.1, sunMul: 0.22, ambientMul: 1.35, wind: 0.45,
    rain: 0, snow: 0, dust: 0, lightning: 0, wetness: 0.1, contrast: 0.82
  },
  {
    id: 'pioggia', label: 'Pioggia', icon: 'rain',
    cloudCover: 0.97, cloudDensity: 1.15, cloudHeight: 1150, turbidityMul: 1.8,
    fogMul: 3.4, sunMul: 0.13, ambientMul: 1.25, wind: 0.6,
    rain: 0.62, snow: 0, dust: 0, lightning: 0, wetness: 1.0, contrast: 0.78
  },
  {
    id: 'temporale', label: 'Temporale', icon: 'storm',
    cloudCover: 1.0, cloudDensity: 1.5, cloudHeight: 900, turbidityMul: 2.3,
    fogMul: 4.6, sunMul: 0.06, ambientMul: 0.95, wind: 1.0,
    rain: 1.0, snow: 0, dust: 0.05, lightning: 1, wetness: 1.0, contrast: 0.9
  },
  {
    id: 'neve', label: 'Neve', icon: 'snow',
    cloudCover: 0.95, cloudDensity: 1.05, cloudHeight: 1300, turbidityMul: 1.6,
    fogMul: 3.2, sunMul: 0.16, ambientMul: 1.6, wind: 0.45,
    rain: 0, snow: 0.75, dust: 0, lightning: 0, wetness: 0.15, contrast: 0.72
  },
  {
    id: 'nebbia', label: 'Nebbia', icon: 'fog',
    cloudCover: 0.55, cloudDensity: 0.7, cloudHeight: 2000, turbidityMul: 2.6,
    fogMul: 9.0, sunMul: 0.42, ambientMul: 1.5, wind: 0.08,
    rain: 0, snow: 0, dust: 0, lightning: 0, wetness: 0.35, contrast: 0.7
  },
  {
    id: 'sabbia', label: 'Tempesta di sabbia', icon: 'dust',
    cloudCover: 0.3, cloudDensity: 0.6, cloudHeight: 2400, turbidityMul: 3.2,
    fogMul: 8.0, sunMul: 0.5, ambientMul: 1.1, wind: 1.4,
    rain: 0, snow: 0, dust: 1.0, lightning: 0, wetness: 0, contrast: 0.85,
    fogColor: [0.78, 0.55, 0.30]
  }
];

/* Preset di ora del giorno, in ore decimali */
export const TIME_PRESETS = [
  { id: 'notte', label: 'Notte fonda', h: 1.5 },
  { id: 'alba', label: 'Alba', h: 6.3 },
  { id: 'mattino', label: 'Mattino', h: 9.0 },
  { id: 'mezzogiorno', label: 'Mezzogiorno', h: 12.5 },
  { id: 'pomeriggio', label: 'Pomeriggio', h: 16.0 },
  { id: 'oradoro', label: 'Ora dorata', h: 18.6 },
  { id: 'tramonto', label: 'Tramonto', h: 19.6 },
  { id: 'orablu', label: 'Ora blu', h: 20.4 }
];

/* ------------------------------------------------------------------ *
 * BIOMI
 * ------------------------------------------------------------------ */

export const BIOMES = {

  foresta: {
    id: 'foresta',
    label: 'Foresta temperata',
    blurb: 'Colline boscose, radure, uno stagno in fondo alla valle.',
    terrain: 'hills',
    seed: 101,
    seaLevel: 0,
    waterLevel: -27,      // solo le depressioni profonde si allagano
    waterKind: 'lake',
    startHeightOffset: 1.7,
    hills: { amp: 62, freq: 0.0016, oct: 6, medAmp: 6.5, medFreq: 0.012, microAmp: 0.9 },
    snowLine: 210,
    seasonal: true,
    palette: {
      grassLow: 0x2f4a1c, grassHigh: 0x63713a, grassDry: 0x8f8548,
      dirt: 0x4a3b28, rock: 0x6b6760, rockDark: 0x4c4943,
      sand: 0x9a8a63, snow: 0xe9eff7,
      underwater: 0x24301c
    },
    sky: { turbidity: 2.6, rayleigh: 1.05, mie: 0.0045, mieG: 0.78, groundAlbedo: [0.10, 0.13, 0.07] },
    fog: { density: 0.0032, heightFalloff: 0.0075, tint: [0.92, 0.98, 1.0] },
    ambience: { hemiSky: 0x8fb4dd, hemiGround: 0x3a3a24, bounce: 0.30 },
    scatter: [
      /* Qualcuno ci vive: una capanna ogni tanto, un pozzo, un ometto sui
       * sentieri. Un bosco senza niente di costruito si guarda due minuti. */
      { type: 'cabin', density: 0.0030, radius: 300, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.25], tint: [0x8a6a44, 0xa8845a], sink: 0.25, emissive: 0.08, emissiveMask: true, jitter: 0.6, cluster: { period: 260, radius: 22, jitter: 0.6 } },
      { type: 'well', density: 0.0030, radius: 240, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.1], tint: [0x8a8478, 0xa8a094], jitter: 0.7, cluster: { period: 260, radius: 30, jitter: 0.6 } },
      { type: 'cairn', density: 0.0040, radius: 200, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.8, 1.3], tint: [0x8a8880, 0xa8a69e], cluster: { period: 120, radius: 8, jitter: 0.6 } },
      /* La volta: uno strato vicino, fitto e grande. Le regole sopra sono il
       * bosco visto da lontano; queste sono il bosco in cui si sta, con le
       * chiome che si toccano e coprono il cielo. Raggio corto apposta: e
       * solo dove serve, e costa poco. */
      { type: 'broadleaf', density: 0.022, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.25, 1], scale: [1.25, 1.70], tilt: 0.05, tint: [0x2c5e1e, 0x5a8a34], shadow: true, seasonal: true },
      { type: 'conifer', density: 0.016, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.15, 1], scale: [1.1, 1.8], tilt: 0.03, tint: [0x1e4a1a, 0x3a6a2a], shadow: true },
      { type: 'conifer', density: 0.0075, radius: 320, slope: [0, 0.62], height: [-40, 240], moisture: [0.3, 1.0], scale: [0.62, 1.28], tilt: 0.035, tint: [0x2b4420, 0x4c6f2e], shadow: true },
      { type: 'broadleaf', density: 0.0055, radius: 300, slope: [0, 0.45], height: [-40, 150], moisture: [0.42, 1.0], scale: [0.70, 1.22], tilt: 0.05, tint: [0x40662a, 0x6d8c35], shadow: true, seasonal: true },
      { type: 'birch', density: 0.0022, radius: 280, slope: [0, 0.4], height: [-40, 130], moisture: [0.5, 1.0], scale: [0.75, 1.15], tilt: 0.06, tint: [0x6f8f38, 0x93ad4a], shadow: true, seasonal: true },
      { type: 'deadTree', density: 0.0006, radius: 260, slope: [0, 0.5], height: [-40, 200], moisture: [0, 0.55], scale: [0.8, 1.3], tilt: 0.09, tint: [0x584a38, 0x6d5d46], shadow: true },
      { type: 'stump', density: 0.0009, radius: 120, slope: [0, 0.4], height: [-40, 200], moisture: [0.2, 1], scale: [0.7, 1.2], tilt: 0.05, tint: [0x4a3c2c, 0x5e4c38] },
      { type: 'log', density: 0.0007, radius: 130, slope: [0, 0.35], height: [-40, 200], moisture: [0.3, 1], scale: [0.8, 1.4], tilt: 0.04, tint: [0x453a2b, 0x5c4d38] },
      { type: 'bush', density: 0.012, radius: 150, slope: [0, 0.6], height: [-40, 210], moisture: [0.25, 1], scale: [0.6, 1.4], tilt: 0.06, tint: [0x3c5a24, 0x5f7c30], seasonal: true },
      { type: 'fern', density: 0.030, radius: 90, slope: [0, 0.55], height: [-40, 160], moisture: [0.45, 1], scale: [0.6, 1.25], tilt: 0.08, tint: [0x35561f, 0x527a2b] },
      { type: 'rock', density: 0.010, radius: 160, slope: [0, 1], height: [-40, 400], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.4, tint: [0x585449, 0x77726a] },
      { type: 'boulder', density: 0.0011, radius: 260, slope: [0, 0.8], height: [-40, 400], moisture: [0, 1], scale: [0.8, 1.7], tilt: 0.25, tint: [0x5b5750, 0x7a756c], shadow: true },
      { type: 'mushroom', density: 0.010, radius: 55, slope: [0, 0.4], height: [-40, 180], moisture: [0.55, 1], scale: [0.7, 1.3], tilt: 0.1, tint: [0x9c5a3c, 0xd8c8a8] },
      { type: 'flower', density: 0.026, radius: 70, slope: [0, 0.35], height: [-40, 200], moisture: [0.3, 0.9], scale: [0.7, 1.2], tilt: 0.12, tint: [0xd8d24a, 0xe8e8ec], season: ['primavera', 'estate'] },
      { type: 'grassTuft', density: 2.6, radius: 40, slope: [0, 0.62], height: [-40, 230], moisture: [0.15, 1], scale: [0.7, 1.25], tilt: 0.06, tint: [0x5f8130, 0x8fa447], grass: true }
    ]
  },

  deserto: {
    id: 'deserto',
    label: 'Deserto',
    blurb: 'Dune, mesa erose, saguari. La luce piu dura che esista.',
    terrain: 'dunes',
    seed: 202,
    seaLevel: 0,
    waterLevel: null,
    startHeightOffset: 1.7,
    dunes: { mesaAmp: 66, mesaFreq: 0.00072, duneAmp: 17, duneFreqX: 0.0016, duneFreqZ: 0.0105, microAmp: 0.35 },
    snowLine: 9999,
    seasonal: false,
    palette: {
      grassLow: 0x8d7f4e, grassHigh: 0x9b8a58, grassDry: 0xa3915d,
      dirt: 0xb08048, rock: 0x9a5f3c, rockDark: 0x71432a,
      sand: 0xdcb883, sandLight: 0xe8cfa2, snow: 0xffffff,
      underwater: 0x6b5a3a
    },
    sky: { turbidity: 3.4, rayleigh: 0.92, mie: 0.0075, mieG: 0.80, groundAlbedo: [0.36, 0.28, 0.18] },
    fog: { density: 0.0022, heightFalloff: 0.0040, tint: [1.0, 0.95, 0.84] },
    ambience: { hemiSky: 0xa8c2e2, hemiGround: 0x7a5c34, bounce: 0.55 },
    scatter: [
      { type: 'saguaro', density: 0.0016, radius: 300, slope: [0, 0.28], height: [-99, 999], moisture: [0.25, 1], scale: [0.75, 1.35], tilt: 0.03, tint: [0x3f5a2c, 0x5a7438], shadow: true },
      { type: 'barrelCactus', density: 0.004, radius: 140, slope: [0, 0.35], height: [-99, 999], moisture: [0.15, 1], scale: [0.6, 1.4], tilt: 0.05, tint: [0x46602e, 0x647d3a] },
      { type: 'dryBush', density: 0.014, radius: 190, slope: [0, 0.5], height: [-99, 999], moisture: [0, 0.8], scale: [0.6, 1.5], tilt: 0.08, tint: [0x7a6b3c, 0x9a8850] },
      { type: 'deadTree', density: 0.0005, radius: 280, slope: [0, 0.4], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.2], tilt: 0.1, tint: [0x6b5940, 0x8a7454], shadow: true },
      { type: 'rock', density: 0.014, radius: 180, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.8], tilt: 0.5, tint: [0x8a5738, 0xb0836a] },
      { type: 'boulder', density: 0.0016, radius: 300, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.85, 1.9], tilt: 0.3, tint: [0x8b5b3b, 0xa87a58], shadow: true },
      { type: 'grassTuft', density: 0.45, radius: 40, slope: [0, 0.5], height: [-99, 999], moisture: [0.35, 1], scale: [0.6, 1.15], tilt: 0.1, tint: [0x8e8046, 0xac9a5c], grass: true }
    ]
  },

  citta: {
    id: 'citta',
    label: 'Citta',
    blurb: 'Isolati, lampioni, vetrate. Di notte si accende.',
    terrain: 'flat',
    seed: 303,
    seaLevel: 0,
    waterLevel: null,
    startHeightOffset: 1.72,
    flat: { amp: 6.5, freq: 0.0009, microAmp: 0.15 },
    snowLine: 9999,
    seasonal: true,
    city: true,
    palette: {
      grassLow: 0x4a5c30, grassHigh: 0x5d6b3a, grassDry: 0x7a7846,
      dirt: 0x5a5348, rock: 0x807c74, rockDark: 0x5e5b55,
      sand: 0x8f8a7c, snow: 0xeef2f8,
      asphalt: 0x2e3033, sidewalk: 0x8e8b84,
      underwater: 0x2a3038
    },
    sky: { turbidity: 4.2, rayleigh: 1.1, mie: 0.010, mieG: 0.76, groundAlbedo: [0.14, 0.14, 0.15] },
    fog: { density: 0.0045, heightFalloff: 0.0060, tint: [0.95, 0.95, 0.98] },
    ambience: { hemiSky: 0x93b0d4, hemiGround: 0x3d3d3f, bounce: 0.34 },
    scatter: [
      { type: 'broadleaf', density: 0.010, radius: 220, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.75, 1.05], tilt: 0.02, tint: [0x3f6428, 0x5e8034], shadow: true, seasonal: true, avoidRoads: true, roadBand: 4.5 },
      { type: 'bush', density: 0.030, radius: 110, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.1], tilt: 0.04, tint: [0x3a5626, 0x557230], avoidRoads: true, roadBand: 5.5 },
      { type: 'grassTuft', density: 1.4, radius: 38, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.1], tilt: 0.06, tint: [0x4a6028, 0x6b7c38], grass: true, avoidRoads: true, roadBand: 7.0 }
    ]
  },

  alpino: {
    id: 'alpino',
    waterfalls: { minDrop: 18, chance: 0.32, width: [3, 9], radius: 420 },
    label: 'Alta montagna',
    blurb: 'Creste, ghiaioni, conifere che si arrendono a quota.',
    terrain: 'peaks',
    seed: 404,
    seaLevel: 0,
    waterLevel: 14,
    waterKind: 'lake',
    startHeightOffset: 1.7,
    peaks: { amp: 400, freq: 0.00085, oct: 7, medAmp: 22, medFreq: 0.0055, microAmp: 1.4, valleyFloor: -30, sharp: 0.42, massif: 0.00034, massifFreq: 0.00034, floorK: 30 },
    snowLine: 150,
    snowBand: 60,
    seasonal: true,
    palette: {
      grassLow: 0x3d5222, grassHigh: 0x5d6436, grassDry: 0x7d7748,
      dirt: 0x554e42, rock: 0x7b776e, rockDark: 0x4f4c46,
      sand: 0x8d887c, snow: 0xf2f6fc, scree: 0x928d84,
      underwater: 0x2a4450
    },
    sky: { turbidity: 1.8, rayleigh: 1.35, mie: 0.0028, mieG: 0.79, groundAlbedo: [0.30, 0.32, 0.36] },
    fog: { density: 0.0026, heightFalloff: 0.0045, tint: [0.88, 0.94, 1.0] },
    ambience: { hemiSky: 0x86aede, hemiGround: 0x4a4a48, bounce: 0.42 },
    scatter: [
      { type: 'cabin', density: 0.0030, radius: 320, slope: [0, 0.35], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.2], tint: [0x7a5a38, 0x9a7a50], sink: 0.3, emissive: 0.08, emissiveMask: true, jitter: 0.6, cluster: { period: 300, radius: 22, jitter: 0.6 } },
      { type: 'cairn', density: 0.0060, radius: 240, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.5], tint: [0x8a8880, 0xb0aea6], cluster: { period: 90, radius: 7, jitter: 0.6 } },
      { type: 'conifer', density: 0.016, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.15, 1], scale: [0.9, 1.5], tilt: 0.03, tint: [0x1c3e1c, 0x2e5a2a], shadow: true },
      { type: 'conifer', density: 0.0060, radius: 320, slope: [0, 0.55], height: [-99, 165], moisture: [0.2, 1], scale: [0.55, 1.12], tilt: 0.05, tint: [0x24401c, 0x3f5f28], shadow: true },
      { type: 'deadTree', density: 0.0009, radius: 260, slope: [0, 0.55], height: [90, 210], moisture: [0, 1], scale: [0.6, 1.1], tilt: 0.12, tint: [0x5a5044, 0x746755], shadow: true },
      { type: 'bush', density: 0.010, radius: 140, slope: [0, 0.6], height: [-99, 190], moisture: [0.2, 1], scale: [0.5, 1.0], tilt: 0.08, tint: [0x37501f, 0x4e662a] },
      { type: 'rock', density: 0.026, radius: 200, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 2.0], tilt: 0.55, tint: [0x625e56, 0x8b867d] },
      { type: 'boulder', density: 0.0035, radius: 320, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.85, 2.1], tilt: 0.35, tint: [0x5f5b53, 0x878178], shadow: true },
      { type: 'grassTuft', density: 1.7, radius: 38, slope: [0, 0.62], height: [-99, 185], moisture: [0.1, 1], scale: [0.55, 1.05], tilt: 0.1, tint: [0x4c5e26, 0x6d7434], grass: true }
    ]
  },

  costa: {
    id: 'costa',
    label: 'Costa tropicale',
    blurb: 'Sabbia bianca, palme, laguna. Il mare fa il resto.',
    terrain: 'coast',
    seed: 505,
    seaLevel: 0,
    waterLevel: 0,
    waterKind: 'sea',
    startHeightOffset: 1.7,
    coast: { amp: 44, freq: 0.00052, oct: 7, bias: -2.2, beachBand: 6.0, medAmp: 5.5, medFreq: 0.0075, microAmp: 0.5 },
    snowLine: 9999,
    seasonal: false,
    palette: {
      grassLow: 0x3f6b30, grassHigh: 0x597f36, grassDry: 0x8a8a48,
      dirt: 0x6a5a3e, rock: 0x6f6659, rockDark: 0x4f483e,
      sand: 0xe6d6ac, sandLight: 0xf0e6c8, snow: 0xffffff,
      underwater: 0x2f6a6a
    },
    sky: { turbidity: 2.9, rayleigh: 1.0, mie: 0.0060, mieG: 0.80, groundAlbedo: [0.20, 0.24, 0.24] },
    fog: { density: 0.0030, heightFalloff: 0.0055, tint: [0.94, 0.99, 1.0] },
    ambience: { hemiSky: 0x8ec4e8, hemiGround: 0x5a6a52, bounce: 0.48 },
    water: { deep: 0x063a4e, shallow: 0x1f9aa0, foam: 0xf2fbff, waveAmp: 0.42, waveScale: 1.0, reflect: 0.9 },
    scatter: [
      { type: 'lighthouse', density: 0.0040, radius: 500, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.15], tint: [0xeeece6, 0xffffff], sink: 0.4, emissive: 0.22, emissiveMask: true, jitter: 0.5, cluster: { period: 640, radius: 16, jitter: 0.5 } },
      { type: 'cabin', density: 0.0026, radius: 300, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.85, 1.1], tint: [0xd8d0c0, 0xeee6d6], sink: 0.25, emissive: 0.08, emissiveMask: true, jitter: 0.6, cluster: { period: 300, radius: 26, jitter: 0.6 } },
      { type: 'palm', density: 0.0030, radius: 300, slope: [0, 0.42], height: [1.2, 60], moisture: [0, 1], scale: [0.70, 1.28], tilt: 0.14, tint: [0x3d6f2c, 0x5d8f36], shadow: true },
      { type: 'broadleaf', density: 0.0028, radius: 280, slope: [0, 0.5], height: [5, 90], moisture: [0.35, 1], scale: [0.8, 1.5], tilt: 0.05, tint: [0x2f6024, 0x4d7a2e], shadow: true },
      { type: 'bush', density: 0.016, radius: 150, slope: [0, 0.6], height: [1.0, 120], moisture: [0.2, 1], scale: [0.6, 1.5], tilt: 0.07, tint: [0x2f5a22, 0x53782e] },
      { type: 'fern', density: 0.022, radius: 85, slope: [0, 0.5], height: [2, 90], moisture: [0.4, 1], scale: [0.7, 1.5], tilt: 0.09, tint: [0x2c5a1e, 0x4a7a28] },
      { type: 'rock', density: 0.011, radius: 170, slope: [0, 1], height: [-6, 999], moisture: [0, 1], scale: [0.5, 1.7], tilt: 0.45, tint: [0x5f584c, 0x847b6c] },
      { type: 'boulder', density: 0.0013, radius: 260, slope: [0, 0.9], height: [-5, 999], moisture: [0, 1], scale: [0.9, 2.6], tilt: 0.3, tint: [0x60594d, 0x877e6f], shadow: true },
      { type: 'grassTuft', density: 1.9, radius: 38, slope: [0, 0.55], height: [1.4, 140], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x466f26, 0x6c8e32], grass: true }
    ]
  },

  artico: {
    id: 'artico',
    label: 'Tundra artica',
    blurb: 'Neve, ghiaccio, e di notte forse l aurora.',
    terrain: 'hills',
    seed: 606,
    seaLevel: 0,
    waterLevel: -19,
    waterKind: 'ice',
    startHeightOffset: 1.7,
    hills: { amp: 52, freq: 0.0013, oct: 6, medAmp: 6.5, medFreq: 0.009, microAmp: 0.7 },
    snowLine: -999,        // neve ovunque
    seasonal: false,
    alwaysSnow: 0.92,
    aurora: true,
    palette: {
      grassLow: 0x6a6a52, grassHigh: 0x7a7860, grassDry: 0x8a8468,
      dirt: 0x4e4a44, rock: 0x585e64, rockDark: 0x3e444a,
      sand: 0x8a8c8e, snow: 0xf0f5fc, ice: 0xb6d6e8,
      underwater: 0x2c4a58
    },
    sky: { turbidity: 1.6, rayleigh: 1.5, mie: 0.0022, mieG: 0.76, groundAlbedo: [0.62, 0.68, 0.76] },
    fog: { density: 0.0038, heightFalloff: 0.0060, tint: [0.86, 0.93, 1.0] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x7e8b98, bounce: 0.75 },
    scatter: [
      { type: 'domeHut', density: 0.0030, radius: 280, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.55, 0.75], tint: [0xf0f4f8, 0xffffff], sink: 0.35, emissive: 0.06, emissiveMask: true, evenColor: true, jitter: 0.6, cluster: { period: 320, radius: 20, jitter: 0.6 } },
      { type: 'cairn', density: 0.0060, radius: 240, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.4], tint: [0x6a6e74, 0x9a9ea4], cluster: { period: 110, radius: 7, jitter: 0.6 } },
      { type: 'conifer', density: 0.0016, radius: 300, slope: [0, 0.45], height: [-99, 60], moisture: [0.4, 1], scale: [0.5, 1.1], tilt: 0.08, tint: [0x27381f, 0x3a4c26], shadow: true, snowy: true },
      { type: 'deadTree', density: 0.0007, radius: 260, slope: [0, 0.5], height: [-99, 90], moisture: [0, 1], scale: [0.5, 0.9], tilt: 0.14, tint: [0x5a5248, 0x6e655a], shadow: true },
      { type: 'iceRock', density: 0.006, radius: 220, slope: [0, 0.8], height: [-99, 999], moisture: [0, 1], scale: [0.55, 1.45], tilt: 0.3, tint: [0x9cc4d8, 0xd8ecf6], shadow: true },
      { type: 'rock', density: 0.010, radius: 180, slope: [0.12, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.5, tint: [0x4e545a, 0x717880] },
      { type: 'boulder', density: 0.0014, radius: 280, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.8], tilt: 0.3, tint: [0x50565c, 0x747b84], shadow: true },
      { type: 'dryBush', density: 0.007, radius: 120, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.4, 0.9], tilt: 0.1, tint: [0x5e5a44, 0x76705a] },
      { type: 'grassTuft', density: 0.55, radius: 36, slope: [0, 0.4], height: [-99, 999], moisture: [0.3, 1], scale: [0.45, 0.85], tilt: 0.15, tint: [0x6e6a50, 0x878062], grass: true }
    ]
  },

  savana: {
    id: 'savana',
    label: 'Savana',
    blurb: 'Piatta fino all orizzonte, acacie, kopje di granito.',
    terrain: 'savanna',
    seed: 707,
    seaLevel: 0,
    waterLevel: -11,
    waterKind: 'lake',
    startHeightOffset: 1.7,
    savanna: { amp: 26, freq: 0.00075, oct: 5, kopjeAmp: 95, kopjeFreq: 0.0026, kopjePow: 3.4, kopjeCut: 0.26, medAmp: 2.4, medFreq: 0.010, microAmp: 0.5 },
    snowLine: 9999,
    seasonal: false,
    palette: {
      grassLow: 0xa8934e, grassHigh: 0xc0aa62, grassDry: 0xcbb56c,
      dirt: 0x8d5a34, rock: 0x7e7668, rockDark: 0x5c554a,
      sand: 0xc0a468, snow: 0xffffff,
      underwater: 0x4a4426
    },
    sky: { turbidity: 3.6, rayleigh: 0.95, mie: 0.0080, mieG: 0.81, groundAlbedo: [0.32, 0.28, 0.16] },
    fog: { density: 0.0026, heightFalloff: 0.0045, tint: [1.0, 0.96, 0.86] },
    ambience: { hemiSky: 0xa0c0e0, hemiGround: 0x7a6838, bounce: 0.52 },
    scatter: [
      { type: 'stiltHut', density: 0.0026, radius: 280, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.8, 1.05], tint: [0xa8885a, 0xc8a878], sink: 1.2, jitter: 0.6, cluster: { period: 340, radius: 30, jitter: 0.6 } },
      { type: 'well', density: 0.0026, radius: 240, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.1], tint: [0xa89878, 0xc8b898], jitter: 0.7, cluster: { period: 340, radius: 34, jitter: 0.6 } },
      { type: 'acacia', density: 0.0022, radius: 340, slope: [0, 0.35], height: [-99, 999], moisture: [0.2, 1], scale: [0.80, 1.42], tilt: 0.04, tint: [0x4c6630, 0x6a7f3a], shadow: true },
      { type: 'deadTree', density: 0.0007, radius: 280, slope: [0, 0.4], height: [-99, 999], moisture: [0, 0.5], scale: [0.8, 1.4], tilt: 0.08, tint: [0x6b5c44, 0x8a7a5c], shadow: true },
      { type: 'termiteMound', density: 0.0016, radius: 200, slope: [0, 0.3], height: [-99, 999], moisture: [0, 0.7], scale: [0.7, 1.8], tilt: 0.02, tint: [0x8f5f36, 0xa87a4c], shadow: true },
      { type: 'dryBush', density: 0.012, radius: 180, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.6], tilt: 0.07, tint: [0x74713c, 0x948c4c] },
      { type: 'rock', density: 0.008, radius: 180, slope: [0.15, 1], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.9], tilt: 0.5, tint: [0x6e6558, 0x8f8878] },
      { type: 'boulder', density: 0.0022, radius: 300, slope: [0, 1], height: [10, 999], moisture: [0, 1], scale: [1.0, 2.2], tilt: 0.25, tint: [0x6d6456, 0x928a7a], shadow: true },
      { type: 'tallGrass', density: 1.5, radius: 44, slope: [0, 0.45], height: [-99, 999], moisture: [0, 1], scale: [0.45, 0.98], tilt: 0.05, tint: [0xa89250, 0xcbb46a], grass: true }
    ]
  },

  vulcanico: {
    id: 'vulcanico',
    label: 'Terre vulcaniche',
    blurb: 'Basalto nero, colate incandescenti, cenere sospesa.',
    terrain: 'peaks',
    seed: 808,
    seaLevel: 0,
    waterLevel: -4,
    waterKind: 'lava',
    startHeightOffset: 1.7,
    peaks: { amp: 210, freq: 0.0012, oct: 6, medAmp: 16, medFreq: 0.0065, microAmp: 1.1, valleyFloor: -14, sharp: 0.72, massifFreq: 0.0005, floorK: 16 },
    snowLine: 9999,
    seasonal: false,
    emberGlow: true,
    palette: {
      grassLow: 0x3a3630, grassHigh: 0x46403a, grassDry: 0x554c42,
      dirt: 0x33302c, rock: 0x2a2725, rockDark: 0x191716,
      sand: 0x453f38, snow: 0xbdb6ae,
      underwater: 0xff5a12
    },
    sky: { turbidity: 5.0, rayleigh: 0.85, mie: 0.014, mieG: 0.82, groundAlbedo: [0.05, 0.04, 0.04] },
    fog: { density: 0.0058, heightFalloff: 0.0060, tint: [1.0, 0.78, 0.62] },
    ambience: { hemiSky: 0x7a6a68, hemiGround: 0x3a1c10, bounce: 0.22 },
    scatter: [
      { type: 'crystal', density: 0.0016, radius: 240, slope: [0, 0.85], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.8], tilt: 0.35, tint: [0x9c3a2c, 0xe08a3c], emissive: 0.40 },
      { type: 'deadTree', density: 0.0011, radius: 260, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.3], tilt: 0.16, tint: [0x201c1a, 0x332c28], shadow: true },
      { type: 'rock', density: 0.030, radius: 200, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 2.0], tilt: 0.6, tint: [0x1f1c1a, 0x3a3531] },
      { type: 'boulder', density: 0.0038, radius: 320, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.85, 1.9], tilt: 0.35, tint: [0x201d1b, 0x3c3733], shadow: true },
      { type: 'lavaRock', density: 0.0022, radius: 160, slope: [0, 0.7], height: [-99, 30], moisture: [0, 1], scale: [0.6, 1.5], tilt: 0.4, tint: [0xff4a08, 0xffb43c], emissive: 0.75 }
    ]
  },

  palude: {
    id: 'palude',
    label: 'Palude',
    blurb: 'Acqua ferma, cipressi, canneti. La nebbia non se ne va.',
    terrain: 'swamp',
    seed: 909,
    seaLevel: 0,
    waterLevel: 0,
    waterKind: 'swamp',
    startHeightOffset: 1.7,
    swamp: { amp: 5.2, freq: 0.0016, oct: 5, hummockAmp: 1.9, hummockFreq: 0.032, microAmp: 0.42 },
    snowLine: 9999,
    seasonal: true,
    palette: {
      grassLow: 0x3c4a24, grassHigh: 0x4d5a2c, grassDry: 0x6a6636,
      dirt: 0x3a3324, rock: 0x4e4c42, rockDark: 0x35342c,
      sand: 0x5a5340, snow: 0xe6ecf2,
      underwater: 0x1a2418
    },
    sky: { turbidity: 4.4, rayleigh: 1.15, mie: 0.011, mieG: 0.77, groundAlbedo: [0.07, 0.09, 0.05] },
    fog: { density: 0.0135, heightFalloff: 0.055, tint: [0.82, 0.90, 0.80] },
    ambience: { hemiSky: 0x8aa8b0, hemiGround: 0x323a22, bounce: 0.24 },
    water: { deep: 0x16241a, shallow: 0x33482a, foam: 0x9aa878, waveAmp: 0.05, waveScale: 2.2, reflect: 0.72 },
    scatter: [
      { type: 'stiltHut', density: 0.0030, radius: 260, slope: [0, 0.3], height: [-3, 2.5], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.2], tint: [0x8a7050, 0xa89070], underwater: true, jitter: 0.6, cluster: { period: 260, radius: 30, jitter: 0.6 } },
      { type: 'swampTree', density: 0.0050, radius: 300, slope: [0, 0.5], height: [-3, 40], moisture: [0, 1], scale: [0.75, 1.32], tilt: 0.05, tint: [0x354a20, 0x4e6428], shadow: true, seasonal: true },
      { type: 'deadTree', density: 0.0026, radius: 280, slope: [0, 0.5], height: [-3, 40], moisture: [0, 1], scale: [0.7, 1.5], tilt: 0.13, tint: [0x3e3a2c, 0x54503c], shadow: true },
      { type: 'reed', density: 0.75, radius: 55, slope: [0, 0.35], height: [-1.4, 2.2], moisture: [0, 1], scale: [0.7, 1.4], tilt: 0.06, tint: [0x5e6a30, 0x84884a], grass: true },
      { type: 'fern', density: 0.030, radius: 80, slope: [0, 0.5], height: [0.2, 40], moisture: [0.3, 1], scale: [0.7, 1.4], tilt: 0.1, tint: [0x2e4a1c, 0x466326] },
      { type: 'log', density: 0.0022, radius: 150, slope: [0, 0.4], height: [-1, 40], moisture: [0, 1], scale: [0.8, 1.5], tilt: 0.06, tint: [0x352e22, 0x4a4030] },
      { type: 'rock', density: 0.006, radius: 140, slope: [0, 1], height: [-1, 999], moisture: [0, 1], scale: [0.5, 1.3], tilt: 0.5, tint: [0x42433a, 0x5e5e50] },
      { type: 'mushroom', density: 0.016, radius: 55, slope: [0, 0.4], height: [0.3, 40], moisture: [0.4, 1], scale: [0.7, 1.4], tilt: 0.12, tint: [0x8a6a3c, 0xc4b48c] },
      { type: 'grassTuft', density: 1.8, radius: 38, slope: [0, 0.5], height: [0.1, 40], moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x44581f, 0x66722e], grass: true }
    ]
  },

  /* ================================================================ *
   * LUOGHI IMMAGINARI
   * Stessa macchina, altri numeri. Quello che li rende "altri" non e una
   * modalita separata: e la tinta del cielo, che passando dalla LUT si porta
   * dietro anche la luce del sole, l ambiente e la nebbia.
   * ================================================================ */

  boscostregato: {
    id: 'boscostregato',
    label: 'Bosco stregato',
    blurb: 'Alberi storti, nebbia che non se ne va, funghi che fanno luce.',
    fantasy: true,
    terrain: 'hills',
    seed: 1101,
    seaLevel: 0,
    waterLevel: -26,
    waterKind: 'swamp',
    startHeightOffset: 1.7,
    hills: { amp: 52, freq: 0.0017, oct: 6, medAmp: 6.0, medFreq: 0.013, microAmp: 1.0 },
    snowLine: 9999,
    seasonal: false,
    skyTint: [0.66, 0.88, 0.74],
    sunTint: [0.72, 0.86, 0.70],
    nightSky: [0.0022, 0.0036, 0.0032],
    moonBright: 2.6,
    ambientBoost: 1.15,
    palette: {
      grassLow: 0x1e2a16, grassHigh: 0x333f28, grassDry: 0x484a2c,
      dirt: 0x241d18, rock: 0x3a3b36, rockDark: 0x232420,
      sand: 0x3c382e, snow: 0xd6dedb, underwater: 0x0e1810
    },
    sky: { turbidity: 4.8, rayleigh: 1.25, mie: 0.013, mieG: 0.72, groundAlbedo: [0.04, 0.06, 0.04] },
    fog: { density: 0.0062, heightFalloff: 0.020, tint: [0.74, 0.94, 0.80] },
    ambience: { hemiSky: 0x6f8a78, hemiGround: 0x22281c, bounce: 0.18 },
    motes: { amount: 0.16, color: [0.35, 0.85, 0.55] },
    scatter: [
      { type: 'twistedTree', density: 0.032, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.2, 1], scale: [1.1, 1.8], tilt: 0.10, tint: [0x1e2418, 0x3a4230], shadow: true },
      { type: 'twistedTree', density: 0.0110, radius: 300, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.65, 1.30], tilt: 0.10, tint: [0x1e2c16, 0x33421f], shadow: true },
      { type: 'deadTree', density: 0.0038, radius: 280, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.16, tint: [0x1c1815, 0x352e26], shadow: true },
      { type: 'glowMushroom', density: 0.030, radius: 80, slope: [0, 0.5], height: [-99, 999], moisture: [0.3, 1], scale: [0.8, 1.8], tilt: 0.14, tint: [0x2ad6a0, 0x7ef0c8], emissive: 0.45 },
      { type: 'mushroom', density: 0.016, radius: 60, slope: [0, 0.45], height: [-99, 999], moisture: [0.35, 1], scale: [0.8, 1.6], tilt: 0.14, tint: [0x6a4a3a, 0x8e7a62] },
      { type: 'fern', density: 0.040, radius: 85, slope: [0, 0.55], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.4], tilt: 0.10, tint: [0x1f3316, 0x35521f] },
      { type: 'bush', density: 0.016, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.08, tint: [0x1c2c14, 0x2f4420] },
      { type: 'rock', density: 0.014, radius: 160, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.5], tilt: 0.45, tint: [0x2e302c, 0x4a4c46] },
      { type: 'boulder', density: 0.0016, radius: 240, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.7], tilt: 0.3, tint: [0x2c2e2a, 0x484a44], shadow: true },
      { type: 'log', density: 0.0022, radius: 130, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.4], tilt: 0.06, tint: [0x211c18, 0x38302a] },
      { type: 'grassTuft', density: 1.5, radius: 36, slope: [0, 0.55], height: [-99, 999], moisture: [0.15, 1], scale: [0.65, 1.15], tilt: 0.10, tint: [0x2a4018, 0x486028], grass: true },

      /* Un cerchio di pietre: il grappolo strettissimo (tredici metri) e cio
       * che lo fa leggere come messo li da qualcuno invece che caduto. */
      { type: 'standingStone', density: 0.020, radius: 220, slope: [0, 0.32], height: [-99, 999],
        moisture: [0, 1], scale: [0.8, 1.3], tilt: 0.10, tint: [0x4e4a44, 0x6e6860],
        cluster: { period: 340, radius: 13, jitter: 0.6 }, jitter: 0.8, shadow: true },
      /* Anche i menhir isolati passano dal grappolo. Sotto una certa rarita
       * la densita non serve piu a niente: la tessera mette comunque un
       * candidato per cella, e ne uscivano quaranta invece di quattro. */
      { type: 'standingStone', density: 0.0060, radius: 200, slope: [0, 0.45], height: [-99, 999],
        moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.16, tint: [0x4e4a44, 0x6e6860],
        cluster: { period: 200, radius: 7, jitter: 0.6 }, jitter: 0.6, shadow: true }
    ]
  },

  boscofatato: {
    id: 'boscofatato',
    label: 'Bosco fatato',
    blurb: 'Alberi altissimi che brillano, funghi grandi come case, spore nell aria.',
    fantasy: true,
    terrain: 'hills',
    seed: 1202,
    seaLevel: 0,
    waterLevel: -20,
    waterKind: 'lake',
    startHeightOffset: 1.7,
    hills: { amp: 44, freq: 0.0015, oct: 6, medAmp: 5.0, medFreq: 0.011, microAmp: 0.8 },
    snowLine: 9999,
    seasonal: false,
    skyTint: [1.24, 0.86, 1.34],
    sunTint: [1.12, 0.92, 1.16],
    nightSky: [0.0034, 0.0024, 0.0062],
    moonBright: 3.2,
    ambientBoost: 1.25,
    palette: {
      grassLow: 0x1e5040, grassHigh: 0x3c7a56, grassDry: 0x5a7a4a,
      dirt: 0x3a2c40, rock: 0x5c5468, rockDark: 0x3c3648,
      sand: 0x6a5c70, snow: 0xf0e8fa, underwater: 0x123028
    },
    sky: { turbidity: 2.4, rayleigh: 1.35, mie: 0.0055, mieG: 0.78, groundAlbedo: [0.12, 0.16, 0.14] },
    fog: { density: 0.0048, heightFalloff: 0.0085, tint: [1.06, 0.92, 1.10] },
    ambience: { hemiSky: 0xb08ad8, hemiGround: 0x2e4a3a, bounce: 0.34 },
    motes: { amount: 0.85, color: [0.55, 1.00, 0.78] },
    scatter: [
      { type: 'fairyTree', density: 0.012, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.25, 1], scale: [1.2, 1.9], tilt: 0.04, tint: [0x2a5a4a, 0x5aa08a], shadow: true, emissive: 0.05 },
      { type: 'broadleaf', density: 0.018, radius: 140, slope: [0, 0.26], height: [-99, 999], moisture: [0.25, 1], scale: [1.2, 1.8], tilt: 0.05, tint: [0x2a6a3a, 0x4a9a5a], shadow: true },
      { type: 'fairyTree', density: 0.0044, radius: 340, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.35], tilt: 0.05, tint: [0x3fd0a8, 0x9ef0d0], shadow: true, emissive: 0.10 },
      { type: 'giantMushroom', density: 0.0032, radius: 260, slope: [0, 0.45], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.5], tilt: 0.07, tint: [0xd85aa8, 0xf8a0d0], shadow: true, emissive: 0.14 },
      { type: 'glowMushroom', density: 0.045, radius: 80, slope: [0, 0.5], height: [-99, 999], moisture: [0.25, 1], scale: [0.9, 2.0], tilt: 0.12, tint: [0x50b8f0, 0xa8e8ff], emissive: 0.50 },
      { type: 'broadleaf', density: 0.0030, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.15], tilt: 0.05, tint: [0x2f7a5a, 0x58a878], shadow: true },
      { type: 'fern', density: 0.038, radius: 85, slope: [0, 0.55], height: [-99, 999], moisture: [0.25, 1], scale: [0.7, 1.4], tilt: 0.10, tint: [0x1f5a42, 0x3c8a5e] },
      { type: 'flower', density: 0.055, radius: 65, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.5], tilt: 0.12, tint: [0xf0a0e8, 0xfff0a0], emissive: 0.25 },
      { type: 'bush', density: 0.014, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.07, tint: [0x246048, 0x3f8a60] },
      { type: 'rock', density: 0.009, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.4], tilt: 0.45, tint: [0x4c4658, 0x6e6880] },
      { type: 'grassTuft', density: 2.0, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x35906a, 0x6ec49a], grass: true },

      { type: 'mushroomHouse', density: 0.0016, radius: 220, slope: [0, 0.26], height: [-99, 999],
        moisture: [0.2, 1], scale: [0.75, 1.35], tilt: 0.02, tint: [0xd8c8a0, 0xf0e4c8],
        faceDownhill: true, faceJitter: 2.6, upright: true, sink: 0.10, jitter: 0.75,
        cluster: { period: 260, radius: 46, jitter: 0.6 },
        emissive: 0.14, emissiveMask: true, shadow: true }
    ]
  },

  isolecielo: {
    id: 'isolecielo',
    waterfalls: { minDrop: 20, chance: 0.55, width: [3, 12], radius: 420, maxSteps: 70 },
    label: 'Isole nel cielo',
    blurb: 'Zolle sospese sopra un mare di nuvole. Sotto non c e niente.',
    fantasy: true,
    terrain: 'islands',
    seed: 1303,
    seaLevel: 0,
    waterLevel: -74,
    waterKind: 'cloudsea',
    startHeightOffset: 1.7,
    islands: { maskFreq: 0.0026, cut: 0.26, edge: 0.048, base: 28, detFreq: 0.016, detAmp: 10, abyss: -340 },
    snowLine: 9999,
    seasonal: true,
    skyTint: [0.96, 1.0, 1.10],
    nightSky: [0.0016, 0.0024, 0.0048],
    moonBright: 1.4,
    farFade: 3200,
    palette: {
      grassLow: 0x39632a, grassHigh: 0x6c8340, grassDry: 0x8d8a4e,
      dirt: 0x584028, rock: 0x74705f, rockDark: 0x4e4a3e,
      sand: 0x9a8c68, snow: 0xeef3fa, underwater: 0x8ea4b8
    },
    sky: { turbidity: 1.9, rayleigh: 1.20, mie: 0.0035, mieG: 0.80, groundAlbedo: [0.30, 0.33, 0.36] },
    fog: { density: 0.0020, heightFalloff: 0.0035, tint: [0.94, 0.98, 1.05] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x4a5238, bounce: 0.52 },
    scatter: [
      { type: 'conifer', density: 0.0060, radius: 300, slope: [0, 0.55], height: [-40, 999], moisture: [0.25, 1], scale: [0.6, 1.15], tilt: 0.05, tint: [0x2b4a22, 0x4a7030], shadow: true },
      { type: 'broadleaf', density: 0.0048, radius: 280, slope: [0, 0.45], height: [-40, 999], moisture: [0.35, 1], scale: [0.7, 1.15], tilt: 0.05, tint: [0x40702a, 0x6c9436], shadow: true, seasonal: true },
      { type: 'slabRock', density: 0.0060, radius: 220, slope: [0, 0.9], height: [-40, 999], moisture: [0, 1], scale: [0.8, 2.4], tilt: 0.20, tint: [0x6e6a58, 0x8f8b78], shadow: true },
      { type: 'rock', density: 0.012, radius: 160, slope: [0, 1], height: [-40, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.45, tint: [0x625e50, 0x847f6e] },
      { type: 'bush', density: 0.013, radius: 140, slope: [0, 0.6], height: [-40, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.07, tint: [0x3c5a24, 0x5f7c30] },
      { type: 'flower', density: 0.030, radius: 60, slope: [0, 0.4], height: [-40, 999], moisture: [0.2, 1], scale: [0.8, 1.3], tilt: 0.12, tint: [0xe8d868, 0xf0f0f0] },
      { type: 'grassTuft', density: 2.2, radius: 38, slope: [0, 0.6], height: [-40, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x5f8130, 0x8fa447], grass: true },

      { type: 'windmill', density: 0.0022, radius: 260, slope: [0, 0.20], height: [4, 999],
        moisture: [0, 1], scale: [0.85, 1.25], tilt: 0.02, tint: [0xcfc4a8, 0xe8dcc0],
        faceDownhill: true, faceJitter: 2.6, upright: true, sink: 0.35,
        cluster: { period: 300, radius: 30, jitter: 0.6 }, jitter: 0.7,
        emissive: 0.10, emissiveMask: true, shadow: true }
    ]
  },

  smeraldo: {
    id: 'smeraldo',
    /* Si chiama col suo nome: «Mondo di smeraldo» lo nascondeva, ed e un
     * luogo preciso che era stato chiesto per nome. */
    label: 'Namecc',
    blurb: 'Tre soli, e per questo non e mai notte. Cielo giallo-verde, mare verde, erba e rocce azzurre, pianure larghe rotte da altopiani a cima piatta, e case tonde.',
    fantasy: true,
    /* Pianure larghe con altopiani isolati, non colline: e la forma del
     * terreno di Namecc. Il generatore della savana fa esattamente questo —
     * una base quasi piatta piu affioramenti rari e a fianchi ripidi — e qui
     * gli affioramenti sono alti centoventi metri. */
    terrain: 'savanna',
    seed: 1404,
    seaLevel: 0,
    /* Misurato: col livello a -16 il punto piu basso del terreno stava a
     * -10, e l acqua non si vedeva mai. Namecc e un arcipelago — il mare
     * verde e meta di quello che si guarda. */
    waterLevel: -1.5,
    waterKind: 'emerald',
    startHeightOffset: 1.7,
    /* L esponente sotto 1 e la chiave: con `pow(k, 2.8)` gli affioramenti
     * salgono piano e finiscono a punta — vengono cupole. Con 0,55 salgono
     * subito e poi si appiattiscono, cioe fianchi ripidi e cima piatta, che e
     * un altopiano. Misurato prima: solo lo 0,1% del terreno stava sopra i
     * quaranta metri, e di altopiani non se ne vedeva nessuno. */
    savanna: { amp: 12, freq: 0.0012, oct: 4, kopjeAmp: 92, kopjeFreq: 0.0024, kopjePow: 0.55, kopjeCut: 0.30, medAmp: 2.4, medFreq: 0.010, microAmp: 0.45 },
    snowLine: 9999,
    seasonal: false,
    skyTint: [0.80, 1.20, 0.56],   // giallo-verde, non verde-azzurro
    sunTint: [0.96, 1.02, 0.86],
    nightSky: [0.0012, 0.0026, 0.0018],
    /* Niente luna e niente notte: il sole non scende mai sotto i quindici
     * gradi, e gli altri due sono altrove nel cielo. */
    moonBright: 0,
    minSunAlt: 15,
    extraSuns: 2,
    ambientBoost: 1.1,
    palette: {
      grassLow: 0x175f80, grassHigh: 0x3494b8, grassDry: 0x63bed0,
      dirt: 0x3d6478, rock: 0x4c7c94, rockDark: 0x35566a,
      sand: 0x6a9aac, snow: 0xeafaf0, underwater: 0x0f4a58
    },
    sky: { turbidity: 2.2, rayleigh: 1.15, mie: 0.0048, mieG: 0.79, groundAlbedo: [0.14, 0.28, 0.20] },
    /* Poca foschia: il senso di una piana e vedere fin dove arriva, e gli
     * altopiani si leggono solo da lontano. */
    /* Poca nebbia e tinta meno gialla: con quella di prima il cielo
     * giallo-verde tingeva tutta la distanza della stessa tinta, e acqua,
     * terra e altopiani si fondevano in una macchia sola. */
    fog: { density: 0.00070, heightFalloff: 0.0030, tint: [0.82, 1.02, 0.94] },
    farFade: 3600,
    ambience: { hemiSky: 0x9ce0a0, hemiGround: 0x3e5a62, bounce: 0.46 },
    /* Su Namecc il mare e VERDE, non blu ne verde scuro: e la cosa che
     * spiazza di piu guardando il pianeta, insieme al cielo. */
    /* Riflesso basso: con un cielo giallo-verde e la riflessione a 0,72
     * l acqua restituiva il cielo invece del proprio colore, e da verde
     * diventava gialla. Qui deve vincere la tinta dell acqua. */
    water: { deep: 0x0e6f33, shallow: 0x3cbc59, foam: 0xd8f4bc, waveAmp: 0.10, waveScale: 11, reflect: 0.30 },
    scatter: [
      { type: 'ajisaTree', density: 0.0050, radius: 320, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.30], tilt: 0.05, tint: [0x1f6f9e, 0x46a8cc], shadow: true },
      { type: 'spiralRock', density: 0.0028, radius: 300, slope: [0, 0.8], height: [-99, 999], moisture: [0, 1], scale: [0.7, 2.1], tilt: 0.06, tint: [0x44708a, 0x6c9cb0], shadow: true },
      { type: 'rock', density: 0.012, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.45, tint: [0x40687e, 0x6890a4] },
      { type: 'boulder', density: 0.0018, radius: 260, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.85, 1.9], tilt: 0.3, tint: [0x3c6478, 0x64889c], shadow: true },
      { type: 'bush', density: 0.012, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.07, tint: [0x1a6a86, 0x3a96ac] },
      { type: 'grassTuft', density: 2.1, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x2f96c0, 0x62c4dc], grass: true },

      { type: 'domeHut', density: 0.0017, radius: 300, slope: [0, 0.16], height: [-99, 999],
        moisture: [0, 1], scale: [0.9, 1.3], tilt: 0, tint: [0xe4efe2, 0xcfe8dc],
        faceDownhill: true, faceJitter: 2.2, upright: true, sink: 0.28, jitter: 0.7,
        cluster: { period: 340, radius: 36, jitter: 0.6 },
        emissive: 0.07, emissiveMask: true, shadow: true }
    ]
  },

  collegio: {
    id: 'collegio',
    label: 'Il collegio',
    blurb: 'Un castello di torri su un lago nero, e il bosco che comincia subito dopo.',
    fantasy: true,
    terrain: 'hills',
    seed: 1505,
    seaLevel: 0,
    waterLevel: -14,
    waterKind: 'lake',
    startHeightOffset: 1.7,
    castle: true,
    hills: { amp: 70, freq: 0.0014, oct: 6, medAmp: 7.0, medFreq: 0.012, microAmp: 0.9 },
    snowLine: 240,
    seasonal: true,
    nightSky: [0.0018, 0.0026, 0.0050],
    moonBright: 1.8,
    palette: {
      grassLow: 0x2c4520, grassHigh: 0x546a34, grassDry: 0x7a7444,
      dirt: 0x453728, rock: 0x63615a, rockDark: 0x44433e,
      sand: 0x8a806a, snow: 0xe9eff7, underwater: 0x141d18
    },
    sky: { turbidity: 3.0, rayleigh: 1.10, mie: 0.0060, mieG: 0.77, groundAlbedo: [0.09, 0.11, 0.07] },
    fog: { density: 0.0042, heightFalloff: 0.0080, tint: [0.90, 0.95, 1.02] },
    ambience: { hemiSky: 0x86a8d0, hemiGround: 0x33381f, bounce: 0.26 },
    scatter: [
      { type: 'conifer', density: 0.018, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.15, 1], scale: [1.1, 1.8], tilt: 0.03, tint: [0x1e4a1a, 0x3a6a2a], shadow: true },
      { type: 'broadleaf', density: 0.014, radius: 140, slope: [0, 0.26], height: [-99, 999], moisture: [0.25, 1], scale: [1.2, 1.8], tilt: 0.05, tint: [0x2c5e1e, 0x5a8a34], shadow: true, seasonal: true },
      { type: 'conifer', density: 0.0080, radius: 320, slope: [0, 0.6], height: [-40, 999], moisture: [0.3, 1], scale: [0.62, 1.30], tilt: 0.04, tint: [0x22381a, 0x3c5a26], shadow: true },
      { type: 'broadleaf', density: 0.0044, radius: 300, slope: [0, 0.45], height: [-40, 999], moisture: [0.4, 1], scale: [0.7, 1.20], tilt: 0.05, tint: [0x33561f, 0x5a7a2c], shadow: true, seasonal: true },
      { type: 'birch', density: 0.0022, radius: 280, slope: [0, 0.4], height: [-40, 999], moisture: [0.45, 1], scale: [0.75, 1.15], tilt: 0.06, tint: [0x5f8130, 0x86a044], shadow: true, seasonal: true },
      { type: 'deadTree', density: 0.0012, radius: 260, slope: [0, 0.5], height: [-40, 999], moisture: [0, 0.6], scale: [0.8, 1.3], tilt: 0.10, tint: [0x40382c, 0x5c5240], shadow: true },
      { type: 'bush', density: 0.013, radius: 150, slope: [0, 0.6], height: [-40, 999], moisture: [0.25, 1], scale: [0.6, 1.3], tilt: 0.06, tint: [0x2f4a1c, 0x4c6626] },
      { type: 'fern', density: 0.026, radius: 85, slope: [0, 0.55], height: [-40, 999], moisture: [0.4, 1], scale: [0.6, 1.25], tilt: 0.08, tint: [0x2a4818, 0x436824] },
      { type: 'rock', density: 0.011, radius: 165, slope: [0, 1], height: [-40, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.45, tint: [0x55534c, 0x74716a] },
      { type: 'grassTuft', density: 2.3, radius: 38, slope: [0, 0.6], height: [-40, 999], moisture: [0.15, 1], scale: [0.65, 1.15], tilt: 0.08, tint: [0x4a6b28, 0x7a9038], grass: true }
    ]
  },

  pianetino: {
    id: 'pianetino',
    label: 'Il pianetino',
    blurb: 'Una palla di prato larga un centinaio di metri, sospesa nel vuoto.',
    fantasy: true,
    terrain: 'planetoid',
    seed: 1606,
    seaLevel: 0,
    waterLevel: null,
    startHeightOffset: 1.7,
    planetoid: { freq: 0.013, amp: 4.2, microAmp: 0.6 },
    /* La curvatura e l unica cosa che fa il pianeta. 1/(2R) con R centoventi
     * metri: l orizzonte cade a una quarantina di passi. */
    curve: 1 / (2 * 120),
    noShadows: true,
    snowLine: 9999,
    seasonal: false,
    space: true,
    skyTint: [0.85, 0.90, 1.05],
    nightSky: [0.00075, 0.00095, 0.00160],
    moonBright: 1.0,
    ambientBoost: 1.9,
    sunBoost: 0.55,
    farFade: 900,
    palette: {
      grassLow: 0x3f7a2c, grassHigh: 0x6aa03c, grassDry: 0x8fa848,
      dirt: 0x5a4630, rock: 0x76726a, rockDark: 0x53504a,
      sand: 0x9a8f70, snow: 0xffffff, underwater: 0x2a4030
    },
    sky: { turbidity: 1.0, rayleigh: 0.045, mie: 0.0006, mieG: 0.70, groundAlbedo: [0.18, 0.30, 0.14] },
    fog: { density: 0.00035, heightFalloff: 0.002, tint: [0.85, 0.90, 1.05] },
    ambience: { hemiSky: 0x8fa8d8, hemiGround: 0x4a5a30, bounce: 0.55 },
    scatter: [
      { type: 'broadleaf', density: 0.0016, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.2, 1], scale: [1.0, 1.6], tilt: 0.04, tint: [0x2f6420, 0x548034], shadow: true },
      { type: 'slabRock', density: 0.0035, radius: 140, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.8], tilt: 0.18, tint: [0x6c6860, 0x8e8a80], shadow: true },
      { type: 'rock', density: 0.014, radius: 120, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.4], tilt: 0.45, tint: [0x64615a, 0x86827a] },
      { type: 'bush', density: 0.014, radius: 110, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.2], tilt: 0.07, tint: [0x35601f, 0x54802e] },
      { type: 'flower', density: 0.05, radius: 55, slope: [0, 0.45], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.4], tilt: 0.12, tint: [0xf0e05a, 0xf8f8f8] },
      { type: 'grassTuft', density: 2.6, radius: 40, slope: [0, 0.62], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x5a9c34, 0x8cbe4c], grass: true },
      /* Uno o due, non sessanta: il pianeta e largo cento metri, e il senso
       * del lampione e che ce ne sia UNO. Il grappolo strettissimo e l unico
       * modo di ottenere una cosa davvero rara — abbassare la densita non
       * basta, perche ogni tessera un candidato lo mette comunque. */
      /* Tre vulcani e una rosa, alle posizioni del libro: due vulcani in
       * attivita e uno spento, e la rosa un po in disparte. La curvatura del
       * pianetino ha raggio 120 m, quindi l orizzonte cade a una ventina di
       * metri: se non stanno vicini, semplicemente non esistono. */
      { type: 'volcanoCone', density: 0.020, radius: 130, slope: [0, 0.5], height: [-99, 999],
        moisture: [0, 1], scale: [1, 1], tilt: 0.02, tint: [0x6a5240, 0x8a6a50],
        upright: true, sink: 0.12, shadow: true,
        cluster: { period: 92, jitter: 0.35, radius: 40, slots: [
          [-8.5, -5.5, 1.00], [-1.5, -10.5, 0.86], [5.5, -6.5, 0.62]
        ] } },
      { type: 'rose', density: 0.020, radius: 130, slope: [0, 0.45], height: [-99, 999],
        moisture: [0, 1], scale: [1, 1], tilt: 0.03, tint: [0xc8283c, 0xd8384a],
        upright: true, shadow: true, evenColor: true,
        cluster: { period: 92, jitter: 0.35, radius: 40, slots: [[7.5, 6.5, 1.0]] } },

      { type: 'lamppost', density: 0.010, radius: 130, slope: [0, 0.62], height: [-99, 999],
        moisture: [0, 1], scale: [0.9, 1.1], tilt: 0.02, tint: [0x2e2a24, 0x4a443a],
        upright: true, jitter: 0.7, cluster: { period: 210, radius: 8, jitter: 0.5 },
        emissive: 0.55, emissiveMask: true, shadow: true }
    ]
  },

  /* ================================================================ *
   * SECONDA ONDATA
   * ================================================================ */

  pandora: {
    id: 'pandora', label: 'Mondo di Pandora', fantasy: true,
    waterfalls: { minDrop: 8.0, chance: 0.46, width: [2.5, 9], radius: 400 },
    blurb: 'Una luna, non un pianeta: Polifemo riempie il cielo. Giungla che di notte si accende tutta, e montagne sospese in aria.',
    terrain: 'hills', seed: 1707, seaLevel: 0,
    waterLevel: -22, waterKind: 'emerald', startHeightOffset: 1.7,
    hills: { amp: 66, freq: 0.0014, oct: 6, medAmp: 7.0, medFreq: 0.012, microAmp: 0.9 },
    snowLine: 9999, seasonal: false,
    skyTint: [1.05, 0.94, 1.16], sunTint: [1.02, 0.98, 1.05],
    nightSky: [0.0030, 0.0038, 0.0060], moonBright: 2.0, ambientBoost: 1.1,
    /* Polifemo. Pandora e una LUNA, e il gigante gassoso attorno a cui gira
     * occupa una fetta enorme di cielo — a 0,105 di raggio angolare era poco
     * piu della nostra Luna, cioe un dettaglio invece del fatto dominante del
     * posto. Ed e azzurro-verde con le bande, non viola. */
    /* Il colore va tenuto basso: di notte l esposizione automatica amplifica
     * moltissimo, e un disco largo mezzo cielo con albedo 0,4 diventa una
     * lampada bianca. Stessa trappola gia pagata con la Luna adeana. */
    planet: { dir: [0.55, 0.40, -0.73], size: 0.235, color: [0.075, 0.125, 0.155] },
    motes: { amount: 0.75, color: [0.45, 0.90, 1.00] },
    palette: {
      grassLow: 0x1d5a3a, grassHigh: 0x3f8a52, grassDry: 0x6a8a48,
      dirt: 0x3c3226, rock: 0x5e5a50, rockDark: 0x3e3b34,
      sand: 0x7a6c52, snow: 0xe8f4ff, underwater: 0x0f3a2c
    },
    sky: { turbidity: 2.8, rayleigh: 1.30, mie: 0.0070, mieG: 0.78, groundAlbedo: [0.10, 0.18, 0.12] },
    fog: { density: 0.0052, heightFalloff: 0.0090, tint: [0.98, 0.94, 1.08] },
    ambience: { hemiSky: 0x9a86d0, hemiGround: 0x2a4a30, bounce: 0.30 },
    scatter: [
      { type: 'fairyTree', density: 0.0050, radius: 340, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.85, 1.55], tilt: 0.04, tint: [0x2fb0d0, 0x8ff0e0], shadow: true, emissive: 0.05 },
      { type: 'broadleaf', density: 0.0060, radius: 300, slope: [0, 0.5], height: [-99, 999], moisture: [0.25, 1], scale: [0.75, 1.25], tilt: 0.05, tint: [0x1f6a42, 0x3f9058], shadow: true },
      { type: 'palm', density: 0.0026, radius: 280, slope: [0, 0.45], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.2], tilt: 0.10, tint: [0x2a7a4a, 0x54a068], shadow: true },
      { type: 'giantMushroom', density: 0.0022, radius: 240, slope: [0, 0.45], height: [-99, 999], moisture: [0.3, 1], scale: [0.6, 1.2], tilt: 0.07, tint: [0xc050d8, 0xf0a0f8], shadow: true, emissive: 0.13 },
      { type: 'glowMushroom', density: 0.115, radius: 130, slope: [0, 0.55], height: [-99, 999], moisture: [0.15, 1], scale: [0.9, 2.2], tilt: 0.12, tint: [0x30c8ff, 0xa8f0ff], emissive: 0.30 },
      { type: 'fern', density: 0.055, radius: 90, slope: [0, 0.55], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.6], tilt: 0.10, tint: [0x18563a, 0x2f8050] },
      { type: 'flower', density: 0.11, radius: 95, slope: [0, 0.45], height: [-99, 999], moisture: [0.15, 1], scale: [0.8, 1.5], tilt: 0.12, tint: [0xf070c0, 0x70f0d0], emissive: 0.24 },
      /* Ciuffi luminosi anche a terra: nelle immagini non brillano solo i
       * funghi e i fiori, brilla il suolo intero. */
      { type: 'grassTuft', density: 0.55, radius: 60, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.9, 1.6], tilt: 0.10, tint: [0x40e0d0, 0xa0f0ff], emissive: 0.16, grass: true },
      { type: 'slabRock', density: 0.00060, radius: 420, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [4.0, 11.0], tilt: 0.16, tint: [0x54503f, 0x7a7460], yOffset: [55, 190] },
      { type: 'rock', density: 0.010, radius: 160, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.5], tilt: 0.45, tint: [0x4e4a40, 0x6e695c] },
      { type: 'grassTuft', density: 2.2, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.25], tilt: 0.08, tint: [0x27a070, 0x5ecc98], grass: true }
    ]
  },

  marte: {
    id: 'marte', label: 'Marte', fantasy: true,
    blurb: 'Ruggine fino all orizzonte, crateri e un cielo che non e blu.',
    terrain: 'craters', seed: 1808, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.7,
    craters: { freq: 0.0011, amp: 46, cellSize: 210, density: 0.55, depth: 0.34, rim: 0.13, microAmp: 0.55 },
    snowLine: 9999, seasonal: false,
    skyTint: [1.35, 0.86, 0.62], sunTint: [1.15, 0.90, 0.72],
    nightSky: [0.0016, 0.0011, 0.0009], moonBright: 0.7, ambientBoost: 1.15,
    palette: {
      grassLow: 0x7a4526, grassHigh: 0x94572e, grassDry: 0xa8683a,
      dirt: 0x6a3a20, rock: 0x8a5230, rockDark: 0x5c3520,
      sand: 0xb0713c, sandLight: 0xc9884a, snow: 0xe8e0d8, underwater: 0x5a3018
    },
    sky: { turbidity: 6.5, rayleigh: 0.30, mie: 0.028, mieG: 0.62, groundAlbedo: [0.28, 0.16, 0.08] },
    fog: { density: 0.0040, heightFalloff: 0.0030, tint: [1.20, 0.86, 0.66] },
    ambience: { hemiSky: 0xc08050, hemiGround: 0x6a3a20, bounce: 0.55 },
    scatter: [
      { type: 'rock', density: 0.055, radius: 190, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.35, 1.15], tilt: 0.55, tint: [0x6e4024, 0x9c6136] },
      { type: 'boulder', density: 0.0060, radius: 320, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.6, 1.5], tilt: 0.35, tint: [0x6a3c22, 0x965d34], shadow: true },
      { type: 'slabRock', density: 0.0022, radius: 280, slope: [0, 0.9], height: [-999, 999], moisture: [0, 1], scale: [0.7, 1.8], tilt: 0.22, tint: [0x74441f, 0xa06a3a], shadow: true }
    ]
  },

  luna: {
    id: 'luna', label: 'La Luna', fantasy: true,
    blurb: 'Polvere grigia, ombre nette, e la Terra ferma in cielo.',
    terrain: 'craters', seed: 1909, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.7,
    craters: { freq: 0.0013, amp: 34, cellSize: 165, density: 0.72, depth: 0.40, rim: 0.16, microAmp: 0.45 },
    snowLine: 9999, seasonal: false, space: true,
    skyTint: [0.85, 0.88, 1.0], sunBoost: 0.75,
    nightSky: [0.00040, 0.00048, 0.00075], moonBright: 0, ambientBoost: 1.4,
    planet: { dir: [-0.35, 0.48, -0.80], size: 0.075, color: [0.16, 0.34, 0.62] },
    noShadowsSoft: true, farFade: 2400,
    palette: {
      grassLow: 0x5e5c58, grassHigh: 0x76736e, grassDry: 0x84817b,
      dirt: 0x4a4844, rock: 0x6e6b66, rockDark: 0x494742,
      sand: 0x7d7a74, sandLight: 0x94918a, snow: 0xffffff, underwater: 0x333230
    },
    sky: { turbidity: 1.0, rayleigh: 0.012, mie: 0.0002, mieG: 0.70, groundAlbedo: [0.12, 0.12, 0.11] },
    fog: { density: 0.00012, heightFalloff: 0.001, tint: [0.85, 0.88, 1.0] },
    ambience: { hemiSky: 0x585c68, hemiGround: 0x4a4844, bounce: 0.75 },
    scatter: [
      { type: 'rock', density: 0.070, radius: 180, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.30, 1.05], tilt: 0.55, tint: [0x565450, 0x7e7b75] },
      { type: 'boulder', density: 0.0055, radius: 300, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.6, 1.4], tilt: 0.35, tint: [0x52504c, 0x7a7770], shadow: true },

      /* Polvere e crateri li ha anche Mercurio: quello che rende la Luna «la
       * Luna» e che ci siamo stati. Un solo sito, e non sempre in vista. */
      { type: 'lander', density: 0.0060, radius: 420, slope: [0, 0.10], height: [-99, 999],
        moisture: [0, 1], scale: [0.9, 1.1], tilt: 0.01, tint: [0xb0aca4, 0xd8d4cc],
        upright: true, cluster: { period: 780, radius: 13, jitter: 0.5 }, jitter: 0.5,
        shadow: true }
    ]
  },

  canyonrosso: {
    id: 'canyonrosso', label: 'Canyon rosso', fantasy: false,
    blurb: 'Altopiani a gradoni tagliati da forre, guglie che restano in piedi.',
    terrain: 'canyon', seed: 2010, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.7,
    canyon: { freq: 0.00075, amp: 215, steps: 6, riverFreq: 0.0022, riverPow: 6, cut: 190, microAmp: 1.1 },
    snowLine: 9999, seasonal: false,
    palette: {
      grassLow: 0x8a6a3c, grassHigh: 0x9c7844, grassDry: 0xa8854c,
      dirt: 0x8a4a28, rock: 0xa05a30, rockDark: 0x6e3a1e,
      sand: 0xc08a52, sandLight: 0xd4a068, snow: 0xf0f0f0, underwater: 0x5a3418
    },
    sky: { turbidity: 3.2, rayleigh: 0.95, mie: 0.0070, mieG: 0.80, groundAlbedo: [0.32, 0.20, 0.10] },
    fog: { density: 0.0024, heightFalloff: 0.0040, tint: [1.05, 0.94, 0.82] },
    ambience: { hemiSky: 0xa0bce0, hemiGround: 0x7a4626, bounce: 0.55 },
    scatter: [
      { type: 'archRuin', density: 0.0020, radius: 280, slope: [0, 0.35], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [1.2, 2.2], tint: [0x9a5a3a, 0xc07a4a], jitter: 0.7, cluster: { period: 360, radius: 36, jitter: 0.6 } },
      { type: 'cairn', density: 0.0050, radius: 240, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.4], tint: [0x9a6a4a, 0xc08a62], cluster: { period: 120, radius: 7, jitter: 0.6 } },
      { type: 'dryBush', density: 0.014, radius: 190, slope: [0, 0.5], height: [-999, 999], moisture: [0, 0.8], scale: [0.6, 1.5], tilt: 0.08, tint: [0x7a6b3c, 0x9a8850] },
      { type: 'saguaro', density: 0.0011, radius: 300, slope: [0, 0.28], height: [-999, 999], moisture: [0.3, 1], scale: [0.7, 1.25], tilt: 0.03, tint: [0x3f5a2c, 0x5a7438], shadow: true },
      { type: 'deadTree', density: 0.0007, radius: 260, slope: [0, 0.4], height: [-999, 999], moisture: [0.25, 1], scale: [0.7, 1.2], tilt: 0.10, tint: [0x6b5940, 0x8a7454], shadow: true },
      { type: 'rock', density: 0.022, radius: 190, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.5, 2.0], tilt: 0.5, tint: [0x8a5030, 0xb27a50] },
      { type: 'boulder', density: 0.0030, radius: 320, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.9, 2.3], tilt: 0.3, tint: [0x8a5030, 0xb27a50], shadow: true },
      { type: 'grassTuft', density: 0.30, radius: 40, slope: [0, 0.5], height: [-999, 999], moisture: [0.3, 1], scale: [0.6, 1.1], tilt: 0.10, tint: [0x8e8046, 0xac9a5c], grass: true }
    ]
  },

  giungla: {
    id: 'giungla', label: 'Giungla', fantasy: false,
    waterfalls: { minDrop: 7.5, chance: 0.45, width: [2.5, 8], radius: 380 },
    blurb: 'Verde su verde, aria che pesa, e non si vede a venti metri.',
    terrain: 'hills', seed: 2111, seaLevel: 0,
    waterLevel: -18, waterKind: 'swamp', startHeightOffset: 1.7,
    hills: { amp: 60, freq: 0.0016, oct: 6, medAmp: 7.0, medFreq: 0.013, microAmp: 1.0 },
    snowLine: 9999, seasonal: false,
    palette: {
      grassLow: 0x1c4416, grassHigh: 0x356a20, grassDry: 0x5a7a2c,
      dirt: 0x3e3020, rock: 0x54544a, rockDark: 0x383a32,
      sand: 0x6e6042, snow: 0xe8f0e8, underwater: 0x102a12
    },
    sky: { turbidity: 4.2, rayleigh: 1.10, mie: 0.011, mieG: 0.76, groundAlbedo: [0.06, 0.11, 0.05] },
    fog: { density: 0.0052, heightFalloff: 0.0105, tint: [0.90, 1.00, 0.90] },
    ambience: { hemiSky: 0x8ab0a0, hemiGround: 0x24401a, bounce: 0.24 },
    scatter: [
      { type: 'stiltHut', density: 0.0030, radius: 260, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.2], tint: [0x8a7050, 0xa89070], sink: 1.0, jitter: 0.6, cluster: { period: 300, radius: 28, jitter: 0.6 } },
      { type: 'archRuin', density: 0.0020, radius: 260, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.6], tint: [0x6a7a5a, 0x8a9a70], jitter: 0.7, cluster: { period: 380, radius: 40, jitter: 0.6 } },
      { type: 'broadleaf', density: 0.028, radius: 140, slope: [0, 0.26], height: [-99, 999], moisture: [0.3, 1], scale: [1.3, 1.8], tilt: 0.08, tint: [0x1f5a1c, 0x3f8a2c], shadow: true },
      { type: 'palm', density: 0.016, radius: 140, slope: [0, 0.26], height: [-99, 999], moisture: [0.3, 1], scale: [1.1, 1.8], tilt: 0.10, tint: [0x2a6a22, 0x4a9034], shadow: true },
      { type: 'broadleaf', density: 0.0180, radius: 260, slope: [0, 0.55], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.45], tilt: 0.06, tint: [0x1e5416, 0x3d7c26], shadow: true },
      { type: 'palm', density: 0.0075, radius: 250, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.30], tilt: 0.12, tint: [0x256018, 0x458428], shadow: true },
      { type: 'swampTree', density: 0.0035, radius: 240, slope: [0, 0.5], height: [-99, 999], moisture: [0.4, 1], scale: [0.8, 1.35], tilt: 0.06, tint: [0x1a4a14, 0x336a20], shadow: true },
      { type: 'fern', density: 0.090, radius: 80, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.9, 1.9], tilt: 0.12, tint: [0x18400f, 0x2f6a1c] },
      { type: 'bush', density: 0.045, radius: 130, slope: [0, 0.65], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.6], tilt: 0.08, tint: [0x1a4a12, 0x336c20] },
      { type: 'mushroom', density: 0.020, radius: 55, slope: [0, 0.45], height: [-99, 999], moisture: [0.4, 1], scale: [0.8, 1.6], tilt: 0.14, tint: [0xb06030, 0xd8b070] },
      { type: 'log', density: 0.0030, radius: 120, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.5], tilt: 0.06, tint: [0x33291c, 0x4a3c28] },
      { type: 'rock', density: 0.008, radius: 140, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.4], tilt: 0.45, tint: [0x44463c, 0x63645a] },
      { type: 'grassTuft', density: 2.4, radius: 36, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.8, 1.5], tilt: 0.10, tint: [0x2a6a20, 0x4f8e30], grass: true }
    ]
  },

  bambu: {
    id: 'bambu', label: 'Foresta di bambu', fantasy: false,
    blurb: 'Canne dritte a perdita d occhio e una luce verde che scende dall alto.',
    terrain: 'hills', seed: 2212, seaLevel: 0,
    waterLevel: -24, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 42, freq: 0.0018, oct: 5, medAmp: 5.0, medFreq: 0.013, microAmp: 0.8 },
    snowLine: 9999, seasonal: true,
    palette: {
      grassLow: 0x2e4a1e, grassHigh: 0x4e6a2c, grassDry: 0x76783c,
      dirt: 0x463726, rock: 0x5e5c54, rockDark: 0x403f3a,
      sand: 0x7a7256, snow: 0xe9eff7, underwater: 0x1a2a18
    },
    sky: { turbidity: 3.4, rayleigh: 1.10, mie: 0.0080, mieG: 0.77, groundAlbedo: [0.08, 0.13, 0.06] },
    fog: { density: 0.0055, heightFalloff: 0.011, tint: [0.88, 1.02, 0.86] },
    ambience: { hemiSky: 0x92b48c, hemiGround: 0x2e4020, bounce: 0.26 },
    scatter: [
      { type: 'pagoda', density: 0.0030, radius: 320, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.3], tint: [0x8a4a30, 0xa85a3a], sink: 0.3, jitter: 0.5, cluster: { period: 420, radius: 18, jitter: 0.5 } },
      { type: 'bamboo', density: 0.055, radius: 120, slope: [0, 0.26], height: [-99, 999], moisture: [0.3, 1], scale: [1.1, 1.7], tilt: 0.04, tint: [0x5a8a2a, 0x8ab84a], shadow: true },
      { type: 'bamboo', density: 0.0180, radius: 220, slope: [0, 0.55], height: [-99, 999], moisture: [0.2, 1], scale: [0.75, 1.35], tilt: 0.03, tint: [0x5e8a2c, 0x9ab84a], shadow: true },
      { type: 'broadleaf', density: 0.0016, radius: 260, slope: [0, 0.45], height: [-99, 999], moisture: [0.4, 1], scale: [0.7, 1.15], tilt: 0.05, tint: [0x2f5a1e, 0x4e7a28], shadow: true },
      { type: 'fern', density: 0.055, radius: 80, slope: [0, 0.55], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.4], tilt: 0.10, tint: [0x22461a, 0x3a6822] },
      { type: 'rock', density: 0.008, radius: 140, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.3], tilt: 0.45, tint: [0x4e4c44, 0x6c6a62] },
      { type: 'grassTuft', density: 1.9, radius: 36, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x3f6a24, 0x6a8c34], grass: true }
    ]
  },

  salar: {
    id: 'salar', label: 'Deserto di sale', fantasy: false,
    blurb: 'Una crosta bianca sotto un dito d acqua: il cielo ci si specchia dentro.',
    terrain: 'flat', seed: 2313, seaLevel: 0,
    waterLevel: 0.06, waterKind: 'mirror', startHeightOffset: 1.7,
    flat: { amp: 2.2, freq: 0.0006, microAmp: 0.05 },
    snowLine: 9999, seasonal: false, farFade: 3400,
    palette: {
      grassLow: 0xd8d6cc, grassHigh: 0xe8e6dc, grassDry: 0xf0eee4,
      dirt: 0xb8b4a8, rock: 0x9a968c, rockDark: 0x7c7870,
      sand: 0xe4e2d6, sandLight: 0xf4f2e8, snow: 0xffffff, underwater: 0xc8c6bc
    },
    sky: { turbidity: 2.0, rayleigh: 1.15, mie: 0.0035, mieG: 0.80, groundAlbedo: [0.70, 0.70, 0.68] },
    fog: { density: 0.0016, heightFalloff: 0.0035, tint: [0.98, 0.99, 1.0] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0xc8c6bc, bounce: 0.92 },
    scatter: [
      { type: 'cabin', density: 0.0030, radius: 320, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [1.0, 1.3], tint: [0xe8e4dc, 0xffffff], sink: 0.2, emissive: 0.08, emissiveMask: true, jitter: 0.5, cluster: { period: 460, radius: 18, jitter: 0.5 } },
      { type: 'rock', density: 0.0016, radius: 200, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.4, 1.2], tilt: 0.5, tint: [0x8e8a80, 0xb4b0a4] }
    ]
  },

  fiordi: {
    id: 'fiordi', label: 'Fiordi', fantasy: false,
    waterfalls: { minDrop: 22, chance: 0.40, width: [3, 10], radius: 460 },
    blurb: 'Pareti che cadono dritte nell acqua nera, e nuvole basse fra le cime.',
    terrain: 'peaks', seed: 2414, seaLevel: 0,
    waterLevel: 0, waterKind: 'sea', startHeightOffset: 1.7,
    peaks: { amp: 430, freq: 0.00090, oct: 7, medAmp: 24, medFreq: 0.0055, microAmp: 1.4, valleyFloor: -120, sharp: 0.55, massifFreq: 0.00040, floorK: 26 },
    snowLine: 300, snowBand: 70, seasonal: true,
    palette: {
      grassLow: 0x33481f, grassHigh: 0x4e5c2e, grassDry: 0x6e6c3c,
      dirt: 0x4a463c, rock: 0x5e5c58, rockDark: 0x3e3d3a,
      sand: 0x76736a, snow: 0xf2f6fc, scree: 0x86837c, underwater: 0x0a1a20
    },
    sky: { turbidity: 2.4, rayleigh: 1.30, mie: 0.0042, mieG: 0.79, groundAlbedo: [0.14, 0.17, 0.18] },
    fog: { density: 0.0038, heightFalloff: 0.0055, tint: [0.88, 0.94, 1.02] },
    ambience: { hemiSky: 0x88a8cc, hemiGround: 0x3a4030, bounce: 0.34 },
    water: { deep: 0x03151c, shallow: 0x0d4048, foam: 0xeaf6ff },
    scatter: [
      { type: 'cabin', density: 0.0030, radius: 320, slope: [0, 0.3], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.2], tint: [0x8a3a2e, 0xa84a3a], sink: 0.3, emissive: 0.08, emissiveMask: true, jitter: 0.6, cluster: { period: 280, radius: 26, jitter: 0.6 } },
      { type: 'lighthouse', density: 0.0040, radius: 500, slope: [0, 0.3], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.1], tint: [0xeeece6, 0xffffff], sink: 0.4, emissive: 0.22, emissiveMask: true, jitter: 0.5, cluster: { period: 700, radius: 16, jitter: 0.5 } },
      { type: 'conifer', density: 0.020, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.15, 1], scale: [0.9, 1.5], tilt: 0.03, tint: [0x1c3e1c, 0x2e5a2a], shadow: true },
      { type: 'conifer', density: 0.0075, radius: 320, slope: [0, 0.62], height: [2, 260], moisture: [0.2, 1], scale: [0.55, 1.10], tilt: 0.06, tint: [0x1e3418, 0x365224], shadow: true },
      { type: 'deadTree', density: 0.0010, radius: 260, slope: [0, 0.55], height: [2, 300], moisture: [0, 1], scale: [0.6, 1.0], tilt: 0.14, tint: [0x50483c, 0x6c6254], shadow: true },
      { type: 'bush', density: 0.011, radius: 140, slope: [0, 0.6], height: [1, 300], moisture: [0.2, 1], scale: [0.5, 1.1], tilt: 0.08, tint: [0x2e4818, 0x466026] },
      { type: 'rock', density: 0.024, radius: 200, slope: [0, 1], height: [-4, 999], moisture: [0, 1], scale: [0.5, 1.9], tilt: 0.55, tint: [0x56544e, 0x7a776f] },
      { type: 'boulder', density: 0.0030, radius: 320, slope: [0, 1], height: [-4, 999], moisture: [0, 1], scale: [0.85, 2.0], tilt: 0.35, tint: [0x52504a, 0x76736b], shadow: true },
      { type: 'grassTuft', density: 1.4, radius: 36, slope: [0, 0.62], height: [1, 280], moisture: [0.1, 1], scale: [0.55, 1.05], tilt: 0.10, tint: [0x40602a, 0x678238], grass: true }
    ]
  },

  desolata: {
    id: 'desolata', label: 'Terre desolate', fantasy: true,
    blurb: 'Quello che resta dopo. Polvere gialla, alberi secchi, colonne spezzate.',
    terrain: 'hills', seed: 2515, seaLevel: 0,
    waterLevel: -30, waterKind: 'swamp', startHeightOffset: 1.7,
    hills: { amp: 56, freq: 0.0016, oct: 6, medAmp: 6.5, medFreq: 0.012, microAmp: 1.0 },
    snowLine: 9999, seasonal: false,
    skyTint: [1.22, 1.06, 0.70], sunTint: [1.15, 1.00, 0.72],
    nightSky: [0.0022, 0.0020, 0.0016], ambientBoost: 1.05,
    palette: {
      grassLow: 0x6a6234, grassHigh: 0x7e7440, grassDry: 0x92854a,
      dirt: 0x5c4c30, rock: 0x6e6656, rockDark: 0x4a4438,
      sand: 0x8c7c56, snow: 0xd8d4c4, underwater: 0x40381f
    },
    sky: { turbidity: 6.0, rayleigh: 0.85, mie: 0.020, mieG: 0.74, groundAlbedo: [0.20, 0.18, 0.10] },
    fog: { density: 0.0080, heightFalloff: 0.0060, tint: [1.15, 1.02, 0.72] },
    ambience: { hemiSky: 0xc0b070, hemiGround: 0x5c4c30, bounce: 0.42 },
    scatter: [
      { type: 'deadTree', density: 0.0060, radius: 300, slope: [0, 0.55], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.3], tilt: 0.14, tint: [0x4e4636, 0x6e6450], shadow: true },
      { type: 'ruinPillar', density: 0.0030, radius: 240, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.6], tilt: 0.10, tint: [0x8a8272, 0xaea593], shadow: true },
      { type: 'slabRock', density: 0.0035, radius: 260, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.4], tilt: 0.20, tint: [0x6e6654, 0x8e8674], shadow: true },
      { type: 'dryBush', density: 0.020, radius: 180, slope: [0, 0.55], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.5], tilt: 0.10, tint: [0x6a5f34, 0x877a46] },
      { type: 'rock', density: 0.020, radius: 180, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.7], tilt: 0.5, tint: [0x62594a, 0x847a68] },
      { type: 'grassTuft', density: 0.55, radius: 38, slope: [0, 0.55], height: [-99, 999], moisture: [0.3, 1], scale: [0.6, 1.1], tilt: 0.12, tint: [0x7a7040, 0x968a52], grass: true },

      { type: 'archRuin', density: 0.0009, radius: 240, slope: [0, 0.24], height: [-99, 999],
        moisture: [0, 1], scale: [0.8, 1.6], tilt: 0.05, tint: [0x7a7460, 0xa09a80],
        faceDownhill: true, faceJitter: 3.0, upright: true,
        cluster: { period: 360, radius: 56, jitter: 0.6 }, jitter: 0.8, shadow: true },
      { type: 'statueRuin', density: 0.0006, radius: 220, slope: [0, 0.18], height: [-99, 999],
        moisture: [0, 1], scale: [0.8, 1.5], tilt: 0.04, tint: [0x8a8470, 0xaea894],
        faceDownhill: true, faceJitter: 3.0, upright: true,
        cluster: { period: 300, radius: 70, jitter: 0.6 }, jitter: 0.8, shadow: true }
    ]
  },

  neon: {
    id: 'neon', label: 'Metropoli al neon', fantasy: true,
    blurb: 'Torri fino alle nuvole, insegne di ogni colore, asfalto sempre bagnato.',
    terrain: 'flat', seed: 2616, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.72,
    flat: { amp: 5.0, freq: 0.0009, microAmp: 0.12 },
    snowLine: 9999, seasonal: false, city: true, neon: true, tallMul: 2.4,
    skyTint: [0.92, 0.92, 1.10], lightPollution: 0.70,
    nightSky: [0.0019, 0.0018, 0.0036],
    palette: {
      grassLow: 0x3a4a2c, grassHigh: 0x4a5a34, grassDry: 0x66663c,
      dirt: 0x4a4640, rock: 0x6e6c68, rockDark: 0x4c4a46,
      sand: 0x7c7a72, snow: 0xeef2f8,
      asphalt: 0x24262a, sidewalk: 0x6e6c68, underwater: 0x24282e
    },
    sky: { turbidity: 5.5, rayleigh: 1.15, mie: 0.016, mieG: 0.74, groundAlbedo: [0.10, 0.10, 0.12] },
    fog: { density: 0.0026, heightFalloff: 0.0048, tint: [0.94, 0.94, 1.10] },
    ambience: { hemiSky: 0x8090c0, hemiGround: 0x2e3038, bounce: 0.30 },
    scatter: [
      { type: 'broadleaf', density: 0.008, radius: 200, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.0], tilt: 0.02, tint: [0x2f5424, 0x48682e], shadow: true, avoidRoads: true, roadBand: 4.5 },
      { type: 'grassTuft', density: 1.0, radius: 34, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.0], tilt: 0.06, tint: [0x3f5424, 0x5c6c30], grass: true, avoidRoads: true, roadBand: 7.0 }
    ]
  },

  geyser: {
    id: 'geyser', label: 'Valle dei geyser', fantasy: false,
    blurb: 'Pozze turchesi bordate di zolfo, e vapore che non smette mai.',
    terrain: 'hills', seed: 2717, seaLevel: 0,
    waterLevel: -14, waterKind: 'hotspring', startHeightOffset: 1.7,
    hills: { amp: 38, freq: 0.0026, oct: 6, medAmp: 6.5, medFreq: 0.015, microAmp: 1.0 },
    snowLine: 9999, seasonal: false,
    motes: { amount: 0.55, color: [1.0, 0.98, 0.94] },
    palette: {
      grassLow: 0x4a5a2e, grassHigh: 0x76743a, grassDry: 0xa08c44,
      dirt: 0x8a6a30, rock: 0x9c8a5c, rockDark: 0x6a5c3c,
      sand: 0xc0a860, sandLight: 0xd8c47c, snow: 0xeef4fa, underwater: 0x1d5a52
    },
    sky: { turbidity: 3.0, rayleigh: 1.15, mie: 0.0070, mieG: 0.78, groundAlbedo: [0.22, 0.22, 0.14] },
    fog: { density: 0.0065, heightFalloff: 0.020, tint: [0.98, 1.0, 1.02] },
    ambience: { hemiSky: 0x9cc0dc, hemiGround: 0x6a5c3c, bounce: 0.44 },
    scatter: [
      { type: 'cabin', density: 0.0030, radius: 300, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.2], tint: [0x6a5a48, 0x8a7a60], sink: 0.25, emissive: 0.08, emissiveMask: true, jitter: 0.6, cluster: { period: 380, radius: 20, jitter: 0.6 } },
      { type: 'cairn', density: 0.0050, radius: 240, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.8, 1.2], tint: [0x9a9088, 0xc0b8ac], cluster: { period: 130, radius: 7, jitter: 0.6 } },
      { type: 'conifer', density: 0.0038, radius: 300, slope: [0, 0.55], height: [4, 999], moisture: [0.3, 1], scale: [0.6, 1.15], tilt: 0.05, tint: [0x24401c, 0x3f5f28], shadow: true },
      { type: 'deadTree', density: 0.0026, radius: 260, slope: [0, 0.5], height: [-2, 999], moisture: [0, 0.6], scale: [0.6, 1.1], tilt: 0.14, tint: [0x9a9284, 0xbdb5a5], shadow: true },
      { type: 'rock', density: 0.020, radius: 180, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.5, tint: [0x8e7c50, 0xb8a370] },
      { type: 'dryBush', density: 0.010, radius: 150, slope: [0, 0.5], height: [2, 999], moisture: [0, 1], scale: [0.6, 1.2], tilt: 0.10, tint: [0x7a7040, 0x968a52] },
      { type: 'grassTuft', density: 1.2, radius: 38, slope: [0, 0.55], height: [1, 999], moisture: [0.2, 1], scale: [0.6, 1.15], tilt: 0.10, tint: [0x5c6e2a, 0x8a8a40], grass: true }
    ]
  },

  ghiaccio: {
    id: 'ghiaccio', label: 'Regno di ghiaccio', fantasy: true,
    waterfalls: { minDrop: 20, chance: 0.20, width: [2.5, 8], radius: 400 },
    blurb: 'Guglie trasparenti, neve azzurra, e di notte il cielo si muove.',
    terrain: 'peaks', seed: 2818, seaLevel: 0,
    waterLevel: -8, waterKind: 'ice', startHeightOffset: 1.7,
    peaks: { amp: 330, freq: 0.0011, oct: 7, medAmp: 20, medFreq: 0.0060, microAmp: 1.2, valleyFloor: -20, sharp: 0.62, massifFreq: 0.00042, floorK: 24 },
    snowLine: -999, alwaysSnow: 0.95, seasonal: false, aurora: true,
    skyTint: [0.88, 0.96, 1.15],
    nightSky: [0.0018, 0.0026, 0.0052], moonBright: 1.6, ambientBoost: 1.1,
    palette: {
      grassLow: 0x6e7a86, grassHigh: 0x8794a0, grassDry: 0x93a0ac,
      dirt: 0x4e5660, rock: 0x5a6470, rockDark: 0x3e454e,
      sand: 0x8a94a0, snow: 0xf2f8ff, ice: 0xa8d0e8, scree: 0x7e8a96, underwater: 0x2a4a5e
    },
    sky: { turbidity: 1.5, rayleigh: 1.55, mie: 0.0022, mieG: 0.76, groundAlbedo: [0.66, 0.72, 0.82] },
    fog: { density: 0.0034, heightFalloff: 0.0055, tint: [0.84, 0.92, 1.06] },
    ambience: { hemiSky: 0xa4c8ec, hemiGround: 0x8494a4, bounce: 0.80 },
    scatter: [
      { type: 'crystal', density: 0.0060, radius: 280, slope: [0, 0.85], height: [-99, 999], moisture: [0, 1], scale: [0.8, 3.0], tilt: 0.22, tint: [0x5aa8d8, 0xc0eaff], shadow: true, emissive: 0.06 },
      { type: 'iceRock', density: 0.012, radius: 240, slope: [0, 0.85], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.8], tilt: 0.30, tint: [0x9cc4d8, 0xd8ecf6], shadow: true },
      { type: 'spiralRock', density: 0.0014, radius: 320, slope: [0, 0.8], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.4], tilt: 0.05, tint: [0x6a9cc0, 0xb8dcf0], shadow: true },
      { type: 'rock', density: 0.014, radius: 190, slope: [0.10, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.5, tint: [0x505a66, 0x76828e] },
      { type: 'boulder', density: 0.0020, radius: 300, slope: [0, 0.95], height: [-99, 999], moisture: [0, 1], scale: [0.85, 2.0], tilt: 0.3, tint: [0x4e5864, 0x74808c], shadow: true }
    ]
  },

  contea: {
    id: 'contea', label: 'La contea', fantasy: true,
    blurb: 'Colline tonde, siepi, prati che sembrano pettinati. Non succede mai niente.',
    terrain: 'hills', seed: 2919, seaLevel: 0,
    waterLevel: -20, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 34, freq: 0.0021, oct: 5, medAmp: 4.5, medFreq: 0.014, microAmp: 0.6 },
    snowLine: 9999, seasonal: true,
    sunTint: [1.06, 1.01, 0.92],
    palette: {
      grassLow: 0x3d7020, grassHigh: 0x76963c, grassDry: 0xa0a44a,
      dirt: 0x5a4630, rock: 0x77746a, rockDark: 0x55534c,
      sand: 0x9a8f70, snow: 0xeef3fa, underwater: 0x24361c
    },
    sky: { turbidity: 2.2, rayleigh: 1.10, mie: 0.0042, mieG: 0.79, groundAlbedo: [0.14, 0.20, 0.08] },
    fog: { density: 0.0028, heightFalloff: 0.0065, tint: [0.96, 1.0, 1.02] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x46521e, bounce: 0.40 },
    scatter: [
      { type: 'broadleaf', density: 0.0042, radius: 320, slope: [0, 0.4], height: [-99, 999], moisture: [0.3, 1], scale: [0.8, 1.35], tilt: 0.04, tint: [0x3d7a24, 0x6ea23a], shadow: true, seasonal: true },
      { type: 'birch', density: 0.0016, radius: 280, slope: [0, 0.4], height: [-99, 999], moisture: [0.4, 1], scale: [0.75, 1.1], tilt: 0.05, tint: [0x76a03c, 0x9cbc4e], shadow: true, seasonal: true },
      { type: 'bush', density: 0.026, radius: 150, slope: [0, 0.55], height: [-99, 999], moisture: [0.25, 1], scale: [0.6, 1.4], tilt: 0.05, tint: [0x35661e, 0x5a8a2c], seasonal: true },
      { type: 'flower', density: 0.075, radius: 70, slope: [0, 0.4], height: [-99, 999], moisture: [0.25, 1], scale: [0.8, 1.4], tilt: 0.12, tint: [0xf0e060, 0xf8f0f8] },
      { type: 'stump', density: 0.0010, radius: 110, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.1], tilt: 0.04, tint: [0x4a3c2c, 0x5e4c38] },
      { type: 'rock', density: 0.006, radius: 150, slope: [0.1, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.3], tilt: 0.45, tint: [0x6a675e, 0x8c887e] },
      { type: 'grassTuft', density: 3.0, radius: 40, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.6, 1.05], tilt: 0.06, tint: [0x5a9c30, 0x8cbc48], grass: true },

      /* Le case. Vanno scavate nel fianco delle colline e devono guardare a
       * valle: e la sola cosa che distingue la Contea da un prato qualsiasi.
       * L emissivo e mascherato, cosi di notte si accendono solo le finestre. */
      { type: 'hobbitHole', density: 0.0044, radius: 320, slope: [0.02, 0.45], height: [2, 999],
        moisture: [0.2, 1], scale: [0.74, 0.98], tilt: 0, tint: [0x4a8a26, 0x74a83a],
        faceDownhill: true, faceJitter: 0.55, upright: true, sink: 0.12, jitter: 0.42,
        cluster: { period: 300, radius: 64, jitter: 0.55 },
        emissive: 0.09, emissiveMask: true, shadow: true },

      // orti davanti a casa, covoni nei campi, un palo agli incroci
      // gli orti stanno dove sta la gente, non in mezzo ai campi
      { type: 'gardenPatch', density: 0.0034, radius: 220, slope: [0, 0.16], height: [1, 999],
        moisture: [0.3, 1], scale: [0.8, 1.25], tilt: 0, tint: [0x5a9432, 0x86b046],
        upright: true, sink: 0.06, jitter: 0.8,
        cluster: { period: 300, radius: 78, jitter: 0.55 } },
      { type: 'haystack', density: 0.00042, radius: 200, slope: [0, 0.14], height: [1, 999],
        moisture: [0.25, 1], scale: [0.85, 1.2], tilt: 0.03, tint: [0xc8a850, 0xe0c878],
        upright: true, shadow: true },
      { type: 'signpost', density: 0.0009, radius: 220, slope: [0, 0.2], height: [1, 999],
        moisture: [0.15, 1], scale: [0.9, 1.1], tilt: 0.02, tint: [0x7a6248, 0x9a8058],
        upright: true, cluster: { period: 300, radius: 92, jitter: 0.55 } },

      /* Staccionate in filari: un campo coltivato ha dei confini, e sono
       * loro a far leggere il paesaggio come «abitato» invece che «verde». */
      { type: 'fence', density: 0.030, radius: 170, slope: [0, 0.26], height: [1, 999],
        moisture: [0.2, 1], scale: [0.95, 1.05], tilt: 0.015, tint: [0x8a7050, 0xa88c68],
        rows: { angle: 0.62, period: 58, width: 0.020 }, yawFromRows: true,
        upright: true, evenColor: true },
      { type: 'fence', density: 0.030, radius: 170, slope: [0, 0.26], height: [1, 999],
        moisture: [0.2, 1], scale: [0.95, 1.05], tilt: 0.015, tint: [0x8a7050, 0xa88c68],
        rows: { angle: 0.62 + 1.5708, period: 62, width: 0.019 }, yawFromRows: true,
        upright: true, evenColor: true },

      // siepi: cespugli fitti allineati, che e come si fa una siepe davvero
      { type: 'bush', density: 0.22, radius: 150, slope: [0, 0.3], height: [1, 999],
        moisture: [0.25, 1], scale: [0.9, 1.5], tilt: 0.05, tint: [0x2f5e1a, 0x4c7c26],
        rows: { angle: 0.62 + 1.5708, period: 62, width: 0.012 }, seasonal: true }
    ]
  },

  ombra: {
    id: 'ombra', label: 'Terra d ombra', fantasy: true,
    blurb: 'Cenere, roccia spaccata e un cielo rosso che non si decide a fare notte.',
    terrain: 'peaks', seed: 3020, seaLevel: 0,
    waterLevel: -10, waterKind: 'lava', startHeightOffset: 1.7,
    peaks: { amp: 250, freq: 0.0012, oct: 6, medAmp: 18, medFreq: 0.0065, microAmp: 1.2, valleyFloor: -18, sharp: 0.80, massifFreq: 0.00048, floorK: 18 },
    snowLine: 9999, seasonal: false, emberGlow: true,
    skyTint: [1.45, 0.62, 0.42], sunTint: [1.30, 0.70, 0.45],
    nightSky: [0.0075, 0.0028, 0.0018], ambientBoost: 1.0,
    palette: {
      grassLow: 0x2e2a26, grassHigh: 0x3a3530, grassDry: 0x4a423a,
      dirt: 0x282420, rock: 0x201d1b, rockDark: 0x141211,
      sand: 0x3a342e, snow: 0xa8a29a, underwater: 0xff4a08
    },
    sky: { turbidity: 7.0, rayleigh: 0.75, mie: 0.026, mieG: 0.80, groundAlbedo: [0.04, 0.03, 0.03] },
    fog: { density: 0.0090, heightFalloff: 0.0060, tint: [1.30, 0.68, 0.48] },
    ambience: { hemiSky: 0x8a4030, hemiGround: 0x2e1408, bounce: 0.20 },
    motes: { amount: 0.30, color: [1.0, 0.42, 0.10] },
    scatter: [
      { type: 'deadTree', density: 0.0030, radius: 280, slope: [0, 0.55], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.3], tilt: 0.18, tint: [0x1a1614, 0x2e2724], shadow: true },
      { type: 'ruinPillar', density: 0.0018, radius: 240, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.8], tilt: 0.14, tint: [0x2a2622, 0x453e38], shadow: true },
      { type: 'spiralRock', density: 0.0020, radius: 300, slope: [0, 0.85], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.4], tilt: 0.10, tint: [0x1c1917, 0x36302c], shadow: true },
      { type: 'lavaRock', density: 0.0026, radius: 170, slope: [0, 0.7], height: [-99, 40], moisture: [0, 1], scale: [0.6, 1.5], tilt: 0.4, tint: [0xff4a08, 0xffb43c], emissive: 0.70 },
      { type: 'rock', density: 0.034, radius: 200, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 2.0], tilt: 0.6, tint: [0x1b1816, 0x342f2b] },
      { type: 'boulder', density: 0.0040, radius: 320, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.85, 2.0], tilt: 0.35, tint: [0x1c1917, 0x38322e], shadow: true },
      /* Rade davvero: il grappolo largo trenta metri con periodo quattrocento
       * ne mette una ogni tanto, invece di riempire la piana di torri. */
      { type: 'watchTower', density: 0.0012, radius: 400, slope: [0, 0.46], height: [-99, 999],
        moisture: [0, 1], scale: [0.8, 1.4], tilt: 0.015, tint: [0x2a2622, 0x4a423a],
        faceDownhill: true, faceJitter: 2.4, upright: true, sink: 0.4,
        cluster: { period: 400, radius: 30, jitter: 0.6 }, jitter: 0.7, shadow: true }
    ]
  },

  giurassico: {
    id: 'giurassico', label: 'Giurassico', epoca: true,
    waterfalls: { minDrop: 8.0, chance: 0.42, width: [2.5, 9], radius: 380 },
    blurb: 'Felci alte come un uomo, cicadi, e qualcosa di enorme che bruca in fondo alla valle.',
    terrain: 'hills', seed: 3121, seaLevel: 0,
    waterLevel: -20, waterKind: 'swamp', startHeightOffset: 1.7,
    hills: { amp: 74, freq: 0.0014, oct: 6, medAmp: 7.5, medFreq: 0.012, microAmp: 1.0 },
    snowLine: 9999, seasonal: false,
    skyTint: [1.06, 1.00, 0.92], sunTint: [1.05, 1.00, 0.90],
    palette: {
      grassLow: 0x23501c, grassHigh: 0x467026, grassDry: 0x6f8034,
      dirt: 0x453424, rock: 0x5c584c, rockDark: 0x3e3b33,
      sand: 0x77694a, snow: 0xe8f0e8, underwater: 0x142c14
    },
    sky: { turbidity: 4.0, rayleigh: 1.05, mie: 0.0105, mieG: 0.77, groundAlbedo: [0.07, 0.12, 0.05] },
    fog: { density: 0.0056, heightFalloff: 0.0090, tint: [0.98, 1.0, 0.92] },
    ambience: { hemiSky: 0x9ab494, hemiGround: 0x2c4418, bounce: 0.28 },
    scatter: [
      { type: 'conifer', density: 0.020, radius: 150, slope: [0, 0.26], height: [-99, 999], moisture: [0.2, 1], scale: [1.4, 2.4], tilt: 0.04, tint: [0x1e4a1a, 0x3a6a2a], shadow: true },
      { type: 'cycad', density: 0.030, radius: 120, slope: [0, 0.26], height: [-99, 999], moisture: [0.25, 1], scale: [1.0, 1.9], tilt: 0.06, tint: [0x2e6a24, 0x4f8a30], shadow: true },
      { type: 'conifer', density: 0.0085, radius: 340, slope: [0, 0.55], height: [-99, 999], moisture: [0.25, 1], scale: [0.9, 1.9], tilt: 0.04, tint: [0x1e3c18, 0x395c22], shadow: true },
      { type: 'cycad', density: 0.0130, radius: 220, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.5], tilt: 0.05, tint: [0x2e6a24, 0x4f8a30], shadow: true },
      { type: 'palm', density: 0.0040, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0.3, 1], scale: [0.8, 1.4], tilt: 0.10, tint: [0x276018, 0x468428], shadow: true },
      { type: 'fern', density: 0.070, radius: 95, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [1.3, 2.8], tilt: 0.10, tint: [0x1c4412, 0x35701c] },
      { type: 'bush', density: 0.030, radius: 140, slope: [0, 0.65], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.8], tilt: 0.08, tint: [0x1e4c14, 0x376c20] },
      { type: 'log', density: 0.0028, radius: 130, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [1.0, 1.8], tilt: 0.06, tint: [0x33291c, 0x4a3c28] },
      { type: 'rock', density: 0.012, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.7], tilt: 0.45, tint: [0x4a4840, 0x6c6a60] },
      { type: 'boulder', density: 0.0022, radius: 280, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.9, 2.0], tilt: 0.3, tint: [0x484640, 0x6a675e], shadow: true },
      { type: 'grassTuft', density: 2.0, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.9, 1.6], tilt: 0.09, tint: [0x2f6a22, 0x568a32], grass: true }
    ]
  },

  glaciale: {
    id: 'glaciale', label: 'Era glaciale', epoca: true,
    blurb: 'Steppa gelata, poche conifere, e branchi che attraversano lenti.',
    terrain: 'hills', seed: 3222, seaLevel: 0,
    waterLevel: -22, waterKind: 'ice', startHeightOffset: 1.7,
    hills: { amp: 58, freq: 0.0015, oct: 6, medAmp: 6.5, medFreq: 0.010, microAmp: 0.8 },
    snowLine: -999, alwaysSnow: 0.86, seasonal: false, aurora: true,
    skyTint: [0.92, 0.96, 1.08],
    nightSky: [0.0018, 0.0026, 0.0050], moonBright: 1.5,
    palette: {
      grassLow: 0x6a6a56, grassHigh: 0x7e7c66, grassDry: 0x8e8a70,
      dirt: 0x4c4840, rock: 0x565a5e, rockDark: 0x3c4044,
      sand: 0x86847a, snow: 0xeef4fc, ice: 0xb4d4e6, underwater: 0x2a4454
    },
    sky: { turbidity: 1.8, rayleigh: 1.42, mie: 0.0030, mieG: 0.77, groundAlbedo: [0.60, 0.66, 0.74] },
    fog: { density: 0.0044, heightFalloff: 0.0060, tint: [0.86, 0.93, 1.02] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x7c8894, bounce: 0.78 },
    scatter: [
      { type: 'conifer', density: 0.0030, radius: 320, slope: [0, 0.5], height: [-99, 999], moisture: [0.35, 1], scale: [0.55, 1.10], tilt: 0.07, tint: [0x24361c, 0x374c22], shadow: true },
      { type: 'deadTree', density: 0.0016, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.1], tilt: 0.14, tint: [0x53493c, 0x6e6252], shadow: true },
      { type: 'iceRock', density: 0.0045, radius: 240, slope: [0, 0.8], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.6], tilt: 0.30, tint: [0x9cc4d8, 0xd8ecf6], shadow: true },
      { type: 'rock', density: 0.012, radius: 190, slope: [0.08, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.5, tint: [0x4c5054, 0x70757a] },
      { type: 'boulder', density: 0.0018, radius: 300, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.8], tilt: 0.3, tint: [0x4a4e52, 0x6e7378], shadow: true },
      { type: 'dryBush', density: 0.012, radius: 160, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.1], tilt: 0.12, tint: [0x6a6450, 0x8a8268] },
      { type: 'grassTuft', density: 0.85, radius: 40, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.5, 0.95], tilt: 0.14, tint: [0x7c7658, 0x9a9070], grass: true }
    ]
  },

  barriera: {
    id: 'barriera', label: 'Barriera corallina', fantasy: false,
    blurb: 'Sotto la superficie. Coralli, banchi di pesci, la luce a reticolo sul fondo.',
    terrain: 'reef', seed: 3323, seaLevel: 0,
    waterLevel: 0, waterKind: 'tropical', underwater: true, startHeightOffset: 1.7,
    reef: { freq: 0.0022, amp: 14, base: -26, reefFreq: 0.0045, reefAmp: 22, medAmp: 1.6, microAmp: 0.35, maxH: -2.2 },
    snowLine: 9999, seasonal: false, caustics: 0.95, underwaterFog: 0.010,
    palette: {
      grassLow: 0xa89060, grassHigh: 0xc4ae7c, grassDry: 0xd0bc90,
      dirt: 0x8a7a52, rock: 0x6e7a70, rockDark: 0x4c564e,
      sand: 0xd8c894, sandLight: 0xeadcb0, snow: 0xffffff, underwater: 0x2f6a6a
    },
    sky: { turbidity: 2.6, rayleigh: 1.0, mie: 0.0055, mieG: 0.80, groundAlbedo: [0.30, 0.34, 0.30] },
    fog: { density: 0.0030, heightFalloff: 0.0050, tint: [0.94, 0.99, 1.0] },
    ambience: { hemiSky: 0x8ecce0, hemiGround: 0x4a6a60, bounce: 0.55 },
    scatter: [
      { type: 'coral', density: 0.055, radius: 130, slope: [0, 0.7], height: [-99, -2.5], moisture: [0, 1], scale: [0.7, 2.4], tilt: 0.25, tint: [0xe0507a, 0xf0a050], underwater: true },
      { type: 'brainCoral', density: 0.020, radius: 120, slope: [0, 0.5], height: [-99, -2.5], moisture: [0, 1], scale: [0.7, 2.0], tilt: 0.20, tint: [0xd8a850, 0xa0d0c0], underwater: true },
      { type: 'kelp', density: 0.030, radius: 110, slope: [0, 0.5], height: [-99, -4], moisture: [0, 1], scale: [0.7, 1.6], tilt: 0.08, tint: [0x3a7a4a, 0x7ab060], underwater: true },
      { type: 'anemone', density: 0.035, radius: 90, slope: [0, 0.6], height: [-99, -2.5], moisture: [0, 1], scale: [0.7, 1.8], tilt: 0.15, tint: [0xf07090, 0xffd090], underwater: true },
      { type: 'rock', density: 0.020, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.6, 2.0], tilt: 0.5, tint: [0x6a7268, 0x929a8a], underwater: true },
      { type: 'boulder', density: 0.0028, radius: 220, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.9, 2.4], tilt: 0.3, tint: [0x66705f, 0x8e9784], shadow: true, underwater: true }
    ]
  },

  atlantide: {
    id: 'atlantide', label: 'Atlantide', fantasy: true,
    blurb: 'Colonne e volte sul fondo, ricoperte di corallo. Qualcuno abitava qui.',
    terrain: 'reef', seed: 3424, seaLevel: 0,
    waterLevel: 0, waterKind: 'sea', underwater: true, startHeightOffset: 1.7,
    reef: { freq: 0.0018, amp: 12, base: -34, reefFreq: 0.0032, reefAmp: 20, medAmp: 1.2, microAmp: 0.3, maxH: -3.5 },
    snowLine: 9999, seasonal: false, caustics: 0.70, underwaterFog: 0.020,
    skyTint: [0.80, 0.92, 1.05],
    palette: {
      grassLow: 0x5e6a58, grassHigh: 0x7a8470, grassDry: 0x8e9484,
      dirt: 0x4e564a, rock: 0x74786e, rockDark: 0x4e524a,
      sand: 0x9aa088, sandLight: 0xb4b89e, snow: 0xffffff, underwater: 0x1a3a44
    },
    sky: { turbidity: 3.0, rayleigh: 1.05, mie: 0.0060, mieG: 0.79, groundAlbedo: [0.22, 0.26, 0.26] },
    fog: { density: 0.0034, heightFalloff: 0.0050, tint: [0.88, 0.95, 1.02] },
    ambience: { hemiSky: 0x74a8c0, hemiGround: 0x3e4e48, bounce: 0.44 },
    scatter: [
      { type: 'ruinPillar', density: 0.020, radius: 170, slope: [0, 0.35], height: [-99, -4], moisture: [0, 1], scale: [1.2, 3.6], tilt: 0.16, tint: [0x8a9080, 0xb0b6a0], shadow: true, underwater: true },
      { type: 'slabRock', density: 0.014, radius: 160, slope: [0, 0.7], height: [-99, -4], moisture: [0, 1], scale: [1.0, 3.2], tilt: 0.14, tint: [0x7e8478, 0xa2a898], shadow: true, underwater: true },
      { type: 'coral', density: 0.020, radius: 110, slope: [0, 0.7], height: [-99, -4], moisture: [0, 1], scale: [0.6, 1.8], tilt: 0.25, tint: [0xc06070, 0xe0a060], underwater: true },
      { type: 'brainCoral', density: 0.012, radius: 110, slope: [0, 0.5], height: [-99, -4], moisture: [0, 1], scale: [0.6, 1.6], tilt: 0.2, tint: [0xa89060, 0x90b0a8], underwater: true },
      { type: 'kelp', density: 0.026, radius: 100, slope: [0, 0.5], height: [-99, -6], moisture: [0, 1], scale: [0.8, 1.8], tilt: 0.08, tint: [0x2e5a3a, 0x5e8a4a], underwater: true },
      { type: 'rock', density: 0.016, radius: 140, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.8], tilt: 0.5, tint: [0x646a5e, 0x8a907e], underwater: true },

      /* Colonne sparse dicono «rovina»; archi e statue dicono «qui c era una
       * citta», che e quello che il posto promette. */
      { type: 'archRuin', density: 0.0014, radius: 220, slope: [0, 0.26], height: [-99, -4],
        moisture: [0, 1], scale: [0.9, 1.8], tilt: 0.04, tint: [0x8a9484, 0xb4bca4],
        faceDownhill: true, faceJitter: 3.0, upright: true, underwater: true,
        cluster: { period: 330, radius: 52, jitter: 0.6 }, jitter: 0.8, shadow: true },
      { type: 'statueRuin', density: 0.0005, radius: 200, slope: [0, 0.22], height: [-99, -5],
        moisture: [0, 1], scale: [0.9, 1.7], tilt: 0.03, tint: [0x94a094, 0xc0c8b4],
        faceDownhill: true, faceJitter: 3.0, upright: true, underwater: true,
        cluster: { period: 330, radius: 52, jitter: 0.6 }, jitter: 0.8, shadow: true }
    ]
  },

  terracava: {
    id: 'terracava', label: 'La Terra cava', fantasy: true,
    waterfalls: { minDrop: 7.5, chance: 0.44, width: [2.5, 8], radius: 380 },
    blurb: 'Dentro il pianeta. La terra si alza ai lati invece di scendere, e il sole sta appeso al centro.',
    terrain: 'hills', seed: 3525, seaLevel: 0,
    waterLevel: -24, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 50, freq: 0.0016, oct: 6, medAmp: 6.0, medFreq: 0.012, microAmp: 0.9 },
    snowLine: 9999, seasonal: false,
    /* Curvatura negativa: il mondo si piega verso l alto e l orizzonte, invece
     * di cadere, sale. E il segno opposto del pianetino. */
    curve: -1 / (2 * 600), noShadows: true,
    fixedSun: [78, 190],
    skyTint: [1.10, 0.94, 0.72], sunTint: [1.12, 0.98, 0.76],
    nightSky: [0.0090, 0.0072, 0.0044], ambientBoost: 1.5, farFade: 2600,
    palette: {
      grassLow: 0x3a6a22, grassHigh: 0x6d9038, grassDry: 0x94a04a,
      dirt: 0x5a4630, rock: 0x77706a, rockDark: 0x54504a,
      sand: 0x9a8f70, snow: 0xeef3fa, underwater: 0x1e3a1c
    },
    sky: { turbidity: 5.5, rayleigh: 0.65, mie: 0.020, mieG: 0.74, groundAlbedo: [0.16, 0.22, 0.10] },
    fog: { density: 0.0075, heightFalloff: 0.0035, tint: [1.06, 0.96, 0.78] },
    ambience: { hemiSky: 0xd8b878, hemiGround: 0x40521e, bounce: 0.45 },
    scatter: [
      { type: 'conifer', density: 0.0060, radius: 300, slope: [0, 0.6], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.4], tilt: 0.04, tint: [0x24461c, 0x40682a], shadow: true },
      { type: 'broadleaf', density: 0.0075, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0.3, 1], scale: [0.8, 1.4], tilt: 0.05, tint: [0x3a7a24, 0x63a034], shadow: true },
      { type: 'cycad', density: 0.0060, radius: 200, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.4], tilt: 0.05, tint: [0x2e6a24, 0x4f8a30], shadow: true },
      { type: 'fern', density: 0.045, radius: 90, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.9, 2.0], tilt: 0.10, tint: [0x1e4a14, 0x376c20] },
      { type: 'bush', density: 0.020, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.5], tilt: 0.07, tint: [0x2a5a1c, 0x477a28] },
      { type: 'rock', density: 0.010, radius: 160, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.45, tint: [0x6a645c, 0x8e8880] },
      { type: 'grassTuft', density: 2.4, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x50942c, 0x86b444], grass: true }
    ]
  },

  agartha: {
    id: 'agartha', label: 'Agartha', fantasy: true,
    waterfalls: { minDrop: 16, chance: 0.34, width: [3, 11], radius: 400 },
    blurb: 'Il regno di dentro: cristalli alti come torri e una luce che viene da sopra la testa.',
    terrain: 'peaks', seed: 3626, seaLevel: 0,
    waterLevel: 8, waterKind: 'emerald', startHeightOffset: 1.7,
    peaks: { amp: 260, freq: 0.0011, oct: 6, medAmp: 16, medFreq: 0.0060, microAmp: 1.1, valleyFloor: -6, sharp: 0.50, massifFreq: 0.00042, floorK: 22 },
    snowLine: 9999, seasonal: false,
    curve: -1 / (2 * 900), noShadows: true,
    fixedSun: [72, 200],
    skyTint: [1.22, 1.02, 0.70], sunTint: [1.18, 1.02, 0.74],
    nightSky: [0.0110, 0.0086, 0.0050], ambientBoost: 1.6, farFade: 2600,
    motes: { amount: 0.50, color: [1.0, 0.86, 0.45] },
    palette: {
      grassLow: 0x2f6a4e, grassHigh: 0x559a66, grassDry: 0x86a35a,
      dirt: 0x6a5638, rock: 0x8a7a58, rockDark: 0x5e5440,
      sand: 0xa8946a, snow: 0xf4ecd8, scree: 0x9a8c6a, underwater: 0x1a4a3a
    },
    sky: { turbidity: 4.5, rayleigh: 0.72, mie: 0.016, mieG: 0.76, groundAlbedo: [0.18, 0.22, 0.12] },
    fog: { density: 0.0060, heightFalloff: 0.0040, tint: [1.10, 1.00, 0.76] },
    ambience: { hemiSky: 0xe8c078, hemiGround: 0x3e5a34, bounce: 0.48 },
    scatter: [
      { type: 'crystal', density: 0.0075, radius: 320, slope: [0, 0.85], height: [-99, 999], moisture: [0, 1], scale: [1.0, 3.0], tilt: 0.16, tint: [0xf0c060, 0xfff0b0], shadow: true, emissive: 0.10 },
      { type: 'fairyTree', density: 0.0032, radius: 300, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.3], tilt: 0.05, tint: [0x60c890, 0xc8f0b0], shadow: true, emissive: 0.05 },
      { type: 'ajisaTree', density: 0.0038, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.2], tilt: 0.05, tint: [0x2f8a60, 0x66c090], shadow: true },
      { type: 'spiralRock', density: 0.0024, radius: 300, slope: [0, 0.8], height: [-99, 999], moisture: [0, 1], scale: [0.9, 2.6], tilt: 0.07, tint: [0x9a8458, 0xc8b078], shadow: true },
      { type: 'fern', density: 0.035, radius: 85, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.6], tilt: 0.10, tint: [0x2a6a44, 0x4a9060] },
      { type: 'rock', density: 0.012, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.7], tilt: 0.45, tint: [0x7e7050, 0xa89670] },
      { type: 'grassTuft', density: 2.0, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x3f9c68, 0x78c890], grass: true },

      { type: 'archRuin', density: 0.0018, radius: 230, slope: [0, 0.24], height: [-99, 999],
        moisture: [0, 1], scale: [0.9, 1.9], tilt: 0.03, tint: [0xa8b4c0, 0xd0dce8],
        faceDownhill: true, faceJitter: 3.0, upright: true,
        cluster: { period: 280, radius: 64, jitter: 0.6 }, jitter: 0.8, shadow: true },
      { type: 'lamppost', density: 0.0016, radius: 200, slope: [0, 0.24], height: [-99, 999],
        moisture: [0, 1], scale: [0.9, 1.3], tilt: 0.02, tint: [0x3a4450, 0x5a6878],
        upright: true, emissive: 0.40, emissiveMask: true,
        cluster: { period: 280, radius: 64, jitter: 0.6 }, jitter: 0.85 }
    ]
  },

  titano: {
    id: 'titano', label: 'Titano', fantasy: true,
    blurb: 'Dune di idrocarburi sotto una foschia arancione, laghi di metano, e Saturno che riempie il cielo.',
    terrain: 'dunes', seed: 3727, seaLevel: 0,
    waterLevel: 7, waterKind: 'methane', startHeightOffset: 1.7,
    dunes: { mesaAmp: 44, mesaFreq: 0.00080, duneAmp: 13, duneFreqX: 0.0018, duneFreqZ: 0.0110, microAmp: 0.30 },
    snowLine: 9999, seasonal: false,
    skyTint: [1.45, 0.92, 0.40], sunTint: [1.30, 0.94, 0.50], sunBoost: 0.35, sunAngle: 0.0040,
    nightSky: [0.0035, 0.0022, 0.0009], ambientBoost: 1.35,
    planet: { dir: [0.42, 0.36, -0.83], size: 0.20, color: [0.62, 0.54, 0.36], ring: true },
    palette: {
      grassLow: 0x4a3a26, grassHigh: 0x5e4a2e, grassDry: 0x6e5834,
      dirt: 0x3e3020, rock: 0x554634, rockDark: 0x372c20,
      sand: 0x6a5636, sandLight: 0x846c46, snow: 0xc8b48c, underwater: 0x1c1610
    },
    sky: { turbidity: 8.0, rayleigh: 0.55, mie: 0.045, mieG: 0.66, groundAlbedo: [0.16, 0.11, 0.05] },
    fog: { density: 0.0110, heightFalloff: 0.0030, tint: [1.35, 0.94, 0.46] },
    ambience: { hemiSky: 0xc08840, hemiGround: 0x3e3020, bounce: 0.40 },
    scatter: [
      { type: 'rock', density: 0.020, radius: 180, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.4, 1.4], tilt: 0.5, tint: [0x3e3224, 0x685440] },
      { type: 'boulder', density: 0.0026, radius: 280, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.7], tilt: 0.3, tint: [0x3a2e22, 0x60503c], shadow: true },
      { type: 'slabRock', density: 0.0020, radius: 240, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.0], tilt: 0.2, tint: [0x40342a, 0x6a5644], shadow: true }
    ]
  },

  montefato: {
    id: 'montefato', label: 'Monte Fato', fantasy: true,
    blurb: 'Un cono solo, in mezzo a una piana di cenere, con la bocca che brucia.',
    terrain: 'cone', seed: 3828, seaLevel: 0,
    waterLevel: -22, waterKind: 'lava', startHeightOffset: 1.7,
    cone: { radius: 1150, height: 520, pow: 1.7, craterR: 150, craterDepth: 110, craterGlow: true, flutes: 15, fluteAmp: 9, plainAmp: 16, microAmp: 1.0 },
    snowLine: 9999, seasonal: false, emberGlow: true,
    skyTint: [1.50, 0.58, 0.34], sunTint: [1.35, 0.66, 0.40],
    nightSky: [0.0090, 0.0030, 0.0016], ambientBoost: 1.0,
    palette: {
      grassLow: 0x2c2824, grassHigh: 0x38332e, grassDry: 0x463f38,
      dirt: 0x262220, rock: 0x1e1b19, rockDark: 0x121010,
      sand: 0x363029, snow: 0xa49e96, underwater: 0xff4a08
    },
    sky: { turbidity: 8.0, rayleigh: 0.70, mie: 0.030, mieG: 0.80, groundAlbedo: [0.04, 0.03, 0.03] },
    fog: { density: 0.0105, heightFalloff: 0.0050, tint: [1.35, 0.64, 0.42] },
    ambience: { hemiSky: 0x8c3c28, hemiGround: 0x2e1408, bounce: 0.18 },
    motes: { amount: 0.55, color: [1.0, 0.38, 0.08] },
    scatter: [
      { type: 'rock', density: 0.038, radius: 200, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 2.0], tilt: 0.6, tint: [0x1a1715, 0x322c28] },
      { type: 'boulder', density: 0.0040, radius: 320, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.85, 2.1], tilt: 0.35, tint: [0x1b1816, 0x36302c], shadow: true },
      { type: 'lavaRock', density: 0.0030, radius: 170, slope: [0, 0.7], height: [-99, 60], moisture: [0, 1], scale: [0.6, 1.6], tilt: 0.4, tint: [0xff4a08, 0xffb43c], emissive: 0.70 },
      { type: 'deadTree', density: 0.0016, radius: 260, slope: [0, 0.5], height: [-99, 200], moisture: [0, 1], scale: [0.6, 1.1], tilt: 0.2, tint: [0x181514, 0x2c2622], shadow: true },
      { type: 'ruinPillar', density: 0.0010, radius: 220, slope: [0, 0.35], height: [-99, 200], moisture: [0, 1], scale: [0.8, 1.6], tilt: 0.16, tint: [0x241f1c, 0x3c342e], shadow: true },

      /* Una guglia alta quaranta metri non va seminata come l erba: il
       * grappolo strettissimo con periodo lunghissimo ne fa comparire una
       * ogni tanto, ed e cosi che diventa un punto di riferimento. */
      { type: 'darkSpire', density: 0.0011, radius: 900, slope: [0, 0.22], height: [-99, 999],
        moisture: [0, 1], scale: [0.75, 1.5], tilt: 0.01, tint: [0x1a1618, 0x342c34],
        upright: true, sink: 1.2, emissive: 0.30, emissiveMask: true,
        cluster: { period: 1150, radius: 20, jitter: 0.5 }, jitter: 0.6, shadow: true },
      { type: 'watchTower', density: 0.0016, radius: 420, slope: [0, 0.28], height: [-99, 999],
        moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.02, tint: [0x241f1c, 0x40372e],
        faceDownhill: true, faceJitter: 2.4, upright: true, sink: 0.4,
        cluster: { period: 430, radius: 28, jitter: 0.6 }, jitter: 0.7, shadow: true }
    ]
  },

  tatooine: {
    id: 'tatooine', label: 'Tatooine', fantasy: true,
    blurb: 'Due soli che tramontano insieme, sabbia, canyon e le cupole delle fattorie d umidita.',
    terrain: 'dunes', seed: 3929, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.7,
    dunes: { mesaAmp: 82, mesaFreq: 0.00062, duneAmp: 15, duneFreqX: 0.0016, duneFreqZ: 0.0100, microAmp: 0.32 },
    snowLine: 9999, seasonal: false, extraSuns: 1,
    /* I due soli. Il luogo lo prometteva nella descrizione e in cielo ce
     * n era uno solo: e LA cosa per cui Tatooine e Tatooine. Stanno vicini,
     * a pochi gradi, e tramontano quasi appaiati. */
    extraSuns: 1,
    extraSunOffsets: [[0.082, 0.030]],
    /* Il tramonto di Tatooine e viola-magenta in alto e arancio all orizzonte,
     * non giallo-sabbia: e polvere fine in quota che diffonde all indietro. Si
     * ottiene alzando la componente di Mie e togliendo verde alla tinta. */
    /* Il verde tolto e il blu spinto: e cosi che il cielo alto vira al viola
     * invece di restare un grigio caldo. Il viola vero del crepuscolo lo fa
     * l ozono, che questo modello non ha — la tinta e il modo onesto di
     * ottenere lo stesso effetto senza rifare lo scattering. */
    skyTint: [1.20, 0.87, 1.18], sunTint: [1.12, 0.98, 0.84],
    palette: {
      grassLow: 0x9a8452, grassHigh: 0xae9760, grassDry: 0xbca768,
      dirt: 0xa87c48, rock: 0xa07850, rockDark: 0x74553a,
      sand: 0xdcc08c, sandLight: 0xeed8ac, snow: 0xffffff, underwater: 0x6b5a3a
    },
    /* Rayleigh alto e Mie moderata: e il rapporto fra i due a dare la fascia
     * viola. Troppa Mie ingrigisce tutto il cielo e il viola sparisce, che e
     * quello che succedeva a 0,0165. */
    sky: { turbidity: 4.0, rayleigh: 1.32, mie: 0.0105, mieG: 0.76, groundAlbedo: [0.38, 0.32, 0.20] },
    fog: { density: 0.0020, heightFalloff: 0.0038, tint: [1.04, 0.96, 0.94] },
    ambience: { hemiSky: 0xb0c0d8, hemiGround: 0x8a6c40, bounce: 0.60 },
    scatter: [
      { type: 'vaporator', density: 0.00070, radius: 300, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], scale: [0.9, 1.4], tilt: 0.02, tint: [0x8a8478, 0xb0aa9c], shadow: true },
      { type: 'dryBush', density: 0.010, radius: 190, slope: [0, 0.5], height: [-99, 999], moisture: [0, 0.75], scale: [0.5, 1.2], tilt: 0.10, tint: [0x8a7a48, 0xa89a60] },
      { type: 'rock', density: 0.016, radius: 190, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.45, 1.6], tilt: 0.5, tint: [0x8e6a44, 0xb89070] },
      { type: 'boulder', density: 0.0022, radius: 300, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.85, 2.1], tilt: 0.3, tint: [0x8a6642, 0xb08a66], shadow: true },
      { type: 'slabRock', density: 0.0018, radius: 260, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [1.0, 3.0], tilt: 0.18, tint: [0x94704a, 0xbc966e], shadow: true },

      /* Le cupole non stanno sparse: una fattoria e due o tre corpi vicini,
       * ed e per questo che il grappolo ha raggio venticinque metri. */
      { type: 'domeHut', density: 0.0030, radius: 300, slope: [0, 0.13], height: [-99, 999],
        moisture: [0, 1], scale: [0.85, 1.25], tilt: 0, tint: [0xd8c4a0, 0xefe2c4],
        faceDownhill: true, faceJitter: 2.4, upright: true, sink: 0.30, jitter: 0.7,
        cluster: { period: 330, radius: 25, jitter: 0.6 },
        emissive: 0.07, emissiveMask: true, shadow: true }
    ]
  },

  oort: {
    id: 'oort', label: 'Nube di Oort', fantasy: true,
    blurb: 'Un sasso di ghiaccio ai margini del sistema. Il Sole e solo la stella piu luminosa.',
    terrain: 'planetoid', seed: 4030, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.7,
    planetoid: { freq: 0.017, amp: 3.4, microAmp: 0.5 },
    curve: 1 / (2 * 95), noShadows: true,
    snowLine: 9999, seasonal: false, space: true,
    skyTint: [0.72, 0.80, 1.0], sunBoost: 0.40, sunAngle: 0.0011,
    nightSky: [0.00055, 0.00070, 0.00130], moonBright: 0, ambientBoost: 0.75, farFade: 700,
    palette: {
      /* Un nucleo cometario e nero come il carbone: l albedo vera e sotto il
       * cinque per cento. Con il ghiaccio bianco e il sole pieno l esposizione
       * automatica impazziva. */
      grassLow: 0x2e3640, grassHigh: 0x424c58, grassDry: 0x4e5865,
      dirt: 0x242a32, rock: 0x343c46, rockDark: 0x1e242b,
      sand: 0x3a434e, snow: 0xb8c8d8, ice: 0x8098ac, underwater: 0x1a2028
    },
    sky: { turbidity: 1.0, rayleigh: 0.008, mie: 0.0001, mieG: 0.70, groundAlbedo: [0.05, 0.06, 0.07] },
    fog: { density: 0.00010, heightFalloff: 0.001, tint: [0.72, 0.80, 1.0] },
    ambience: { hemiSky: 0x3a4658, hemiGround: 0x242a32, bounce: 0.35 },
    scatter: [
      { type: 'iceRock', density: 0.016, radius: 130, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.5, 2.0], tilt: 0.4, tint: [0x54687e, 0x9ab4c8] },
      { type: 'crystal', density: 0.0060, radius: 130, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.6, 2.2], tilt: 0.3, tint: [0x88b8d8, 0xd8f0ff], emissive: 0.04 },
      { type: 'slabRock', density: 0.0055, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [1.0, 4.5], tilt: 0.5, tint: [0x323a44, 0x606c7a], yOffset: [12, 70] },
      { type: 'rock', density: 0.020, radius: 120, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.4, 1.3], tilt: 0.55, tint: [0x2c343e, 0x556170] }
    ]
  },

  sequoie: {
    id: 'sequoie', label: 'Foresta di sequoie', fantasy: false,
    waterfalls: { minDrop: 7.0, chance: 0.40, width: [2, 6], radius: 340 },
    blurb: 'Colonne rosse alte trenta metri. La luce arriva a fasci, molto in alto.',
    terrain: 'hills', seed: 4131, seaLevel: 0,
    waterLevel: -26, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 58, freq: 0.0017, oct: 6, medAmp: 6.5, medFreq: 0.012, microAmp: 0.9 },
    snowLine: 260, seasonal: true,
    palette: {
      grassLow: 0x2c4a1e, grassHigh: 0x4a6428, grassDry: 0x6e7440,
      dirt: 0x5e3a24, rock: 0x635e54, rockDark: 0x453f38,
      sand: 0x7a6a4c, snow: 0xe9eff7, underwater: 0x1c2a16
    },
    sky: { turbidity: 3.2, rayleigh: 1.10, mie: 0.0075, mieG: 0.78, groundAlbedo: [0.07, 0.10, 0.05] },
    fog: { density: 0.0062, heightFalloff: 0.0105, tint: [1.0, 0.96, 0.88] },
    ambience: { hemiSky: 0x8aa8b8, hemiGround: 0x2e4018, bounce: 0.22 },
    scatter: [
      { type: 'cabin', density: 0.0030, radius: 300, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.2], tint: [0x7a5a3a, 0x9a7a50], sink: 0.25, emissive: 0.08, emissiveMask: true, jitter: 0.6, cluster: { period: 340, radius: 22, jitter: 0.6 } },
      { type: 'conifer', density: 0.0090, radius: 160, slope: [0, 0.26], height: [-99, 999], moisture: [0.25, 1], scale: [3.2, 5.0], tilt: 0.02, tint: [0x1c3c1a, 0x2e5a26], shadow: true },
      { type: 'conifer', density: 0.0038, radius: 340, slope: [0, 0.55], height: [-99, 999], moisture: [0.25, 1], scale: [2.6, 4.3], tilt: 0.015, tint: [0x1e3a18, 0x35561f], shadow: true },
      { type: 'conifer', density: 0.0060, radius: 280, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.5, 1.1], tilt: 0.05, tint: [0x24421a, 0x3d5e24], shadow: true },
      { type: 'fern', density: 0.075, radius: 90, slope: [0, 0.6], height: [-99, 999], moisture: [0.25, 1], scale: [1.0, 2.2], tilt: 0.10, tint: [0x1e4414, 0x35661e] },
      { type: 'log', density: 0.0032, radius: 140, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [1.4, 2.6], tilt: 0.05, tint: [0x4a2c1c, 0x6a4630] },
      { type: 'stump', density: 0.0016, radius: 120, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [1.6, 3.0], tilt: 0.04, tint: [0x5a3320, 0x74472e] },
      { type: 'mushroom', density: 0.018, radius: 60, slope: [0, 0.45], height: [-99, 999], moisture: [0.45, 1], scale: [0.8, 1.6], tilt: 0.12, tint: [0xa06840, 0xd8c8a0] },
      { type: 'rock', density: 0.009, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.5], tilt: 0.45, tint: [0x585349, 0x7a7468] },
      { type: 'grassTuft', density: 1.5, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.15, 1], scale: [0.7, 1.25], tilt: 0.10, tint: [0x3a6a22, 0x5f8a32], grass: true }
    ]
  },

  lavanda: {
    id: 'lavanda', label: 'Campi di lavanda', fantasy: false,
    blurb: 'Filari viola fino alla collina, e il ronzio di quello che ci vive dentro.',
    terrain: 'hills', seed: 4232, seaLevel: 0,
    waterLevel: -28, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 30, freq: 0.0020, oct: 5, medAmp: 4.0, medFreq: 0.013, microAmp: 0.6 },
    snowLine: 9999, seasonal: true,
    sunTint: [1.06, 1.00, 0.92],
    palette: {
      grassLow: 0x7a7a48, grassHigh: 0x9a9455, grassDry: 0xb0a660,
      dirt: 0x8a6a44, rock: 0x8e8878, rockDark: 0x6a6558,
      sand: 0xa89870, snow: 0xeef3fa, underwater: 0x40441f
    },
    sky: { turbidity: 2.6, rayleigh: 1.05, mie: 0.0050, mieG: 0.79, groundAlbedo: [0.24, 0.22, 0.16] },
    fog: { density: 0.0030, heightFalloff: 0.0060, tint: [1.0, 0.98, 1.0] },
    ambience: { hemiSky: 0x9cb8e0, hemiGround: 0x6a6440, bounce: 0.48 },
    scatter: [
      { type: 'cabin', density: 0.0030, radius: 300, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [1.0, 1.4], tint: [0xd8c8a8, 0xeee0c0], sink: 0.25, emissive: 0.08, emissiveMask: true, jitter: 0.5, cluster: { period: 320, radius: 20, jitter: 0.6 } },
      { type: 'well', density: 0.0030, radius: 240, slope: [0, 0.22], height: [-99, 999], moisture: [0, 1], tilt: 0, upright: true, shadow: true, faceDownhill: true, faceJitter: 2.6, scale: [0.9, 1.1], tint: [0xa89878, 0xc8b898], jitter: 0.7, cluster: { period: 320, radius: 28, jitter: 0.6 } },
      { type: 'tallGrass', density: 3.4, radius: 46, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.45, 0.85], tilt: 0.04, tint: [0x6a5a9a, 0xa88fd0], grass: true, rows: { period: 2.4, width: 0.16, angle: 0.5 } },
      { type: 'broadleaf', density: 0.0016, radius: 300, slope: [0, 0.35], height: [-99, 999], moisture: [0, 1], scale: [0.6, 0.95], tilt: 0.04, tint: [0x6a7a44, 0x93a05c], shadow: true },
      { type: 'bush', density: 0.006, radius: 140, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.1], tilt: 0.06, tint: [0x5a6a38, 0x7d8a4a] },
      { type: 'flower', density: 0.030, radius: 60, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.3], tilt: 0.12, tint: [0xf0e070, 0xf8f0f8] },
      { type: 'rock', density: 0.005, radius: 150, slope: [0.1, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.3], tilt: 0.45, tint: [0x7e786a, 0xa29a8a] },
      { type: 'grassTuft', density: 1.1, radius: 36, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.0], tilt: 0.08, tint: [0x86844a, 0xa8a45e], grass: true }
    ]
  },

  mareaperto: {
    id: 'mareaperto', label: 'Mare aperto', fantasy: false,
    blurb: 'Niente terra in nessuna direzione. Solo onde lunghe e il cielo.',
    terrain: 'flat', seed: 4333, seaLevel: 0,
    waterLevel: 0, waterKind: 'sea', openSea: true, startHeightOffset: 1.7,
    flat: { amp: 5.0, freq: 0.0006, microAmp: 0.1, base: -70 },
    snowLine: 9999, seasonal: false, farFade: 3600, caustics: 0,
    palette: {
      grassLow: 0x30414a, grassHigh: 0x415460, grassDry: 0x51636e,
      dirt: 0x2a3840, rock: 0x3e4c56, rockDark: 0x2a343c,
      sand: 0x8a8878, snow: 0xffffff, underwater: 0x08222c
    },
    sky: { turbidity: 2.2, rayleigh: 1.15, mie: 0.0045, mieG: 0.80, groundAlbedo: [0.05, 0.08, 0.10] },
    fog: { density: 0.0026, heightFalloff: 0.0035, tint: [0.94, 0.98, 1.04] },
    ambience: { hemiSky: 0x8ab4dc, hemiGround: 0x2a3a44, bounce: 0.30 },
    scatter: []
  },

  cascate: {
    id: 'cascate', label: 'Le cascate', fantasy: false,
    waterfalls: { minDrop: 10, chance: 0.72, width: [3, 14], radius: 460, maxSteps: 60 },
    blurb: 'Gradoni di roccia, e acqua che scende da tutte le parti.',
    terrain: 'peaks', seed: 4434, seaLevel: 0,
    waterLevel: 12, waterKind: 'lake', startHeightOffset: 1.7,
    peaks: { amp: 290, freq: 0.0016, oct: 7, medAmp: 26, medFreq: 0.0080, microAmp: 1.3, valleyFloor: 0, sharp: 0.45, massifFreq: 0.00060, floorK: 16 },
    snowLine: 320, snowBand: 60, seasonal: true,
    palette: {
      grassLow: 0x2e5620, grassHigh: 0x53702e, grassDry: 0x76783e,
      dirt: 0x4a4030, rock: 0x5e5c54, rockDark: 0x3f3e38,
      sand: 0x7a7466, snow: 0xeef4fc, scree: 0x86827a, underwater: 0x18382e
    },
    sky: { turbidity: 2.6, rayleigh: 1.15, mie: 0.0055, mieG: 0.79, groundAlbedo: [0.10, 0.14, 0.09] },
    fog: { density: 0.0055, heightFalloff: 0.0085, tint: [0.94, 0.99, 1.02] },
    ambience: { hemiSky: 0x8fb4d4, hemiGround: 0x36461f, bounce: 0.32 },
    scatter: [
      { type: 'conifer', density: 0.0090, radius: 320, slope: [0, 0.62], height: [4, 330], moisture: [0.25, 1], scale: [0.6, 1.35], tilt: 0.05, tint: [0x22401a, 0x3c6024], shadow: true },
      { type: 'broadleaf', density: 0.0042, radius: 280, slope: [0, 0.5], height: [4, 220], moisture: [0.4, 1], scale: [0.7, 1.2], tilt: 0.05, tint: [0x2f6a22, 0x568c30], shadow: true },
      { type: 'fern', density: 0.055, radius: 90, slope: [0, 0.62], height: [3, 260], moisture: [0.35, 1], scale: [0.8, 1.7], tilt: 0.10, tint: [0x1e4a16, 0x376e22] },
      { type: 'bush', density: 0.016, radius: 150, slope: [0, 0.62], height: [3, 300], moisture: [0.25, 1], scale: [0.6, 1.4], tilt: 0.07, tint: [0x2a5218, 0x477026] },
      { type: 'rock', density: 0.024, radius: 190, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.9], tilt: 0.5, tint: [0x55534c, 0x7a7770] },
      { type: 'boulder', density: 0.0034, radius: 300, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.9, 2.2], tilt: 0.3, tint: [0x52504a, 0x777369], shadow: true },
      { type: 'log', density: 0.0022, radius: 130, slope: [0, 0.4], height: [4, 250], moisture: [0.3, 1], scale: [0.9, 1.7], tilt: 0.06, tint: [0x3a2e20, 0x54432e] },
      { type: 'grassTuft', density: 2.0, radius: 38, slope: [0, 0.62], height: [3, 320], moisture: [0.2, 1], scale: [0.7, 1.2], tilt: 0.09, tint: [0x3f7a26, 0x6f9a38], grass: true }
    ]
  },

  biblioteca: {
    id: 'biblioteca', label: 'La Biblioteca', fantasy: true,
    library: true,
    blurb: 'Gallerie esagonali di scaffali, tutte uguali, in ogni direzione. Non se ne esce.',
    terrain: 'flat', seed: 4535, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.72,
    flat: { amp: 0.0, freq: 0.001, microAmp: 0.0 },
    snowLine: 9999, seasonal: false, noShadows: true,
    skyTint: [0.30, 0.24, 0.16], sunBoost: 0.02,
    nightSky: [0.0038, 0.0028, 0.0018], ambientBoost: 0.85, farFade: 220,
    palette: {
      grassLow: 0x6a6055, grassHigh: 0x7a7065, grassDry: 0x8a8074,
      dirt: 0x4a4238, rock: 0x6a6055, rockDark: 0x4e4740,
      sand: 0x7a7065, snow: 0xffffff, underwater: 0x2a2620
    },
    sky: { turbidity: 9.0, rayleigh: 0.20, mie: 0.030, mieG: 0.70, groundAlbedo: [0.10, 0.08, 0.06] },
    fog: { density: 0.0210, heightFalloff: 0.0010, tint: [1.0, 0.84, 0.60] },
    ambience: { hemiSky: 0x6a5a44, hemiGround: 0x38312a, bounce: 0.55 },
    motes: { amount: 0.22, color: [1.0, 0.88, 0.66] },
    scatter: []
  }
,
/* ---------------- LUOGHI DEL PASSATO ---------------- */

  carbonifero: {
    id: 'carbonifero', label: 'Carbonifero', epoca: true,
    blurb: 'Trecento milioni di anni fa: foreste di licopodi in acqua bassa, aria densa, e libellule grandi come gabbiani.',
    terrain: 'swamp', seed: 5101, seaLevel: 0,
    waterLevel: 0, waterKind: 'swamp', startHeightOffset: 1.7,
    swamp: { amp: 6.0, freq: 0.0014, oct: 5, hummockAmp: 2.2, hummockFreq: 0.028, microAmp: 0.40 },
    snowLine: 9999, seasonal: false,
    /* L atmosfera del Carbonifero aveva molto piu ossigeno e molta piu acqua
     * sospesa: cielo lattiginoso, orizzonte che sfuma presto. E anche il
     * motivo per cui gli insetti potevano diventare enormi. */
    skyTint: [0.94, 1.02, 0.92], sunTint: [1.04, 1.0, 0.88], ambientBoost: 1.15,
    nightSky: [0.0020, 0.0028, 0.0030],
    palette: {
      grassLow: 0x2e4a1e, grassHigh: 0x3e5e26, grassDry: 0x5a6a30,
      dirt: 0x322a1c, rock: 0x46443a, rockDark: 0x2e2c26,
      sand: 0x50492f, snow: 0xe6ecf2, underwater: 0x16240f
    },
    sky: { turbidity: 6.2, rayleigh: 1.30, mie: 0.020, mieG: 0.76, groundAlbedo: [0.06, 0.09, 0.04] },
    fog: { density: 0.0140, heightFalloff: 0.030, tint: [0.86, 0.94, 0.82] },
    ambience: { hemiSky: 0x9ab89a, hemiGround: 0x2c3a1c, bounce: 0.30 },
    water: { deep: 0x122008, shallow: 0x2c4418, foam: 0x93a274, waveAmp: 0.05, waveScale: 2.0, reflect: 0.70 },
    motes: { amount: 0.30, color: [0.86, 1.0, 0.72] },
    scatter: [
      { type: 'lycopod', density: 0.020, radius: 150, slope: [0, 0.35], height: [-1.2, 999], moisture: [0.25, 1], scale: [1.0, 1.7], tilt: 0.05, tint: [0x3a5a22, 0x62864a], shadow: true },
      { type: 'lycopod', density: 0.0070, radius: 340, slope: [0, 0.30], height: [-1.2, 999], moisture: [0.25, 1], scale: [0.7, 1.5], tilt: 0.05, tint: [0x3a5a22, 0x62864a], shadow: true },
      { type: 'calamite', density: 0.020, radius: 200, slope: [0, 0.35], height: [-1.6, 999], moisture: [0.35, 1], scale: [0.7, 1.6], tilt: 0.07, tint: [0x4a7a2c, 0x86ac4a], shadow: true },
      { type: 'fern', density: 0.11, radius: 110, slope: [0, 0.5], height: [-0.8, 999], moisture: [0.25, 1], scale: [1.5, 3.4], tilt: 0.10, tint: [0x1e4a12, 0x3a7020] },
      { type: 'reed', density: 0.070, radius: 90, slope: [0, 0.4], height: [-2.6, 1.2], moisture: [0.4, 1], scale: [1.0, 2.2], tilt: 0.06, tint: [0x4a6a24, 0x7a9440] },
      { type: 'deadTree', density: 0.0012, radius: 220, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [1.0, 2.2], tilt: 0.14, tint: [0x2e2a1e, 0x4a4230], shadow: true },
      { type: 'log', density: 0.0030, radius: 130, slope: [0, 0.35], height: [-0.6, 999], moisture: [0.2, 1], scale: [1.2, 2.4], tilt: 0.05, tint: [0x2e2618, 0x463a26] },
      { type: 'mushroom', density: 0.030, radius: 60, slope: [0, 0.5], height: [-0.4, 999], moisture: [0.35, 1], scale: [1.4, 3.2], tilt: 0.10, tint: [0xb08a50, 0xd8c088] },
      { type: 'rock', density: 0.007, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.6], tilt: 0.45, tint: [0x413f36, 0x605d52] },
      { type: 'grassTuft', density: 1.9, radius: 40, slope: [0, 0.6], height: [-0.5, 999], moisture: [0.2, 1], scale: [1.0, 1.9], tilt: 0.09, tint: [0x2c5a1a, 0x4e7c2a], grass: true }
    ]
  },

  saharaverde: {
    id: 'saharaverde', label: 'Sahara verde', epoca: true,
    blurb: 'Seimila anni fa il deserto era una prateria di laghi. Gli stessi luoghi, prima che si asciugassero.',
    terrain: 'savanna', seed: 5203, seaLevel: 0,
    waterLevel: -3, waterKind: 'lake', startHeightOffset: 1.7,
    savanna: { amp: 20, freq: 0.0016, oct: 5, kopjeAmp: 58, kopjeFreq: 0.0034, kopjePow: 3.0, kopjeCut: 0.24, medAmp: 3.0, medFreq: 0.011, microAmp: 0.5 },
    snowLine: 9999, seasonal: true,
    sunTint: [1.08, 1.01, 0.90],
    palette: {
      grassLow: 0x6a8a34, grassHigh: 0x93a844, grassDry: 0xc0b256,
      dirt: 0x7a6440, rock: 0x8a7c62, rockDark: 0x60543f,
      sand: 0xc0a86e, snow: 0xeef2f8, underwater: 0x2e4020
    },
    sky: { turbidity: 3.4, rayleigh: 1.05, mie: 0.0080, mieG: 0.78, groundAlbedo: [0.20, 0.22, 0.10] },
    fog: { density: 0.0044, heightFalloff: 0.0060, tint: [1.02, 1.0, 0.94] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x60602c, bounce: 0.44 },
    scatter: [
      { type: 'acacia', density: 0.0022, radius: 380, slope: [0, 0.35], height: [-99, 999], moisture: [0.15, 1], scale: [0.9, 1.6], tilt: 0.05, tint: [0x4a6a26, 0x7a9440], shadow: true },
      { type: 'palm', density: 0.0016, radius: 240, slope: [0, 0.3], height: [-99, 8], moisture: [0.45, 1], scale: [0.9, 1.5], tilt: 0.09, tint: [0x3a7a2e, 0x6aa848], shadow: true },
      { type: 'bush', density: 0.020, radius: 160, slope: [0, 0.5], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.5], tilt: 0.06, tint: [0x5a7a2a, 0x8a9c44] },
      { type: 'reed', density: 0.055, radius: 95, slope: [0, 0.35], height: [-6, 0.8], moisture: [0.4, 1], scale: [0.9, 1.7], tilt: 0.06, tint: [0x7a8a34, 0xa8b45a] },
      { type: 'termiteMound', density: 0.0016, radius: 200, slope: [0, 0.3], height: [-99, 999], moisture: [0, 0.6], scale: [0.8, 1.6], tilt: 0.05, tint: [0x9a6a44, 0xc09060], shadow: true },
      { type: 'boulder', density: 0.0018, radius: 300, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [1.0, 3.0], tilt: 0.3, tint: [0x7a6e56, 0xa2967a], shadow: true },
      { type: 'rock', density: 0.010, radius: 160, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.5], tilt: 0.45, tint: [0x7e7358, 0xa89c7c] },
      { type: 'tallGrass', density: 0.55, radius: 75, slope: [0, 0.45], height: [-99, 999], moisture: [0.1, 1], scale: [0.9, 1.7], tilt: 0.10, tint: [0x8a9c3a, 0xc0be5a], grass: true },
      { type: 'grassTuft', density: 2.4, radius: 42, slope: [0, 0.6], height: [-99, 999], moisture: [0.05, 1], scale: [0.8, 1.5], tilt: 0.08, tint: [0x7a9434, 0xb0b054], grass: true }
    ]
  },

  adeano: {
    id: 'adeano', label: 'Eone Adeano', epoca: true,
    blurb: 'La Terra a quattro miliardi di anni fa: crosta appena rappresa, oceani di lava, e la Luna dieci volte piu vicina.',
    terrain: 'peaks', seed: 5309, seaLevel: 0,
    waterLevel: -6, waterKind: 'lava', startHeightOffset: 1.7,
    peaks: { amp: 180, freq: 0.0013, oct: 6, medAmp: 22, medFreq: 0.0070, microAmp: 1.4, valleyFloor: -18, sharp: 0.78, massifFreq: 0.00055, floorK: 15 },
    snowLine: 9999, seasonal: false, emberGlow: true,
    /* La Luna appena formata stava a un decimo della distanza di oggi: in
     * cielo era un disco enorme, e le maree erano centinaia di metri. E il
     * dettaglio che rende il posto riconoscibile come «la Terra», e non un
     * pianeta qualsiasi. */
    /* L albedo della Luna e 0,12: e roccia scura, non gesso. Messa a 0,5
     * diventa un disco bianco slavato appena l esposizione automatica sale.
     * E 0,42 di raggio angolare erano ventiquattro gradi, mezzo cielo. */
    planet: { dir: [0.30, 0.32, -0.89], size: 0.26, color: [0.21, 0.19, 0.18], ring: false },
    skyTint: [1.50, 0.72, 0.42], sunTint: [1.30, 0.80, 0.52], sunBoost: 0.25,
    nightSky: [0.0060, 0.0022, 0.0012], ambientBoost: 1.25,
    palette: {
      grassLow: 0x3a3230, grassHigh: 0x4a3e38, grassDry: 0x5c4a3e,
      dirt: 0x2e2826, rock: 0x262220, rockDark: 0x161312,
      sand: 0x463c34, snow: 0xa89a90, underwater: 0xff6218
    },
    sky: { turbidity: 9.5, rayleigh: 0.70, mie: 0.055, mieG: 0.70, groundAlbedo: [0.08, 0.05, 0.03] },
    fog: { density: 0.0125, heightFalloff: 0.0035, tint: [1.40, 0.72, 0.40] },
    ambience: { hemiSky: 0xd07038, hemiGround: 0x3a2620, bounce: 0.42 },
    water: { deep: 0xff4a08, shallow: 0xffa030, foam: 0xffd070, waveAmp: 0.28, waveScale: 4.5, reflect: 0.30 },
    motes: { amount: 0.55, color: [1.0, 0.62, 0.28] },
    scatter: [
      { type: 'lavaRock', density: 0.016, radius: 220, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.7, 2.4], tilt: 0.5, tint: [0x201c1a, 0x3e3630], shadow: true },
      { type: 'boulder', density: 0.0030, radius: 300, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [1.2, 3.4], tilt: 0.35, tint: [0x1c1918, 0x38312c], shadow: true },
      { type: 'spiralRock', density: 0.00090, radius: 320, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [1.2, 3.0], tilt: 0.10, tint: [0x241f1c, 0x463c34], shadow: true },
      { type: 'rock', density: 0.020, radius: 160, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.8], tilt: 0.5, tint: [0x232019, 0x3e392f] }
    ]
  },

  /* ---------------- ALTRI MONDI ---------------- */

  mondonuvole: {
    id: 'mondonuvole', label: 'Mondo di nuvole', fantasy: true,
    blurb: 'Il vapore e terreno. Isole di cumulo sopra altre nuvole, e sotto ancora nuvole.',
    terrain: 'islands', seed: 5407, seaLevel: 0,
    waterLevel: -60, waterKind: 'cloudsea', startHeightOffset: 1.7,
    islands: { maskFreq: 0.0022, cut: 0.24, edge: 0.060, base: 24, detFreq: 0.014, detAmp: 7, abyss: -300 },
    snowLine: 9999, seasonal: false, noShadows: false,
    skyTint: [1.02, 1.0, 1.08], ambientBoost: 1.45, farFade: 2600,
    nightSky: [0.0022, 0.0028, 0.0050], moonBright: 1.5,
    palette: {
      grassLow: 0xd8dce6, grassHigh: 0xeef1f6, grassDry: 0xe4e0e8,
      dirt: 0xb8bece, rock: 0xc8ccd8, rockDark: 0x9aa2b4,
      sand: 0xe0e2ea, snow: 0xffffff, underwater: 0xb0b8c8
    },
    sky: { turbidity: 2.6, rayleigh: 1.20, mie: 0.014, mieG: 0.80, groundAlbedo: [0.62, 0.64, 0.70] },
    fog: { density: 0.0075, heightFalloff: 0.0040, tint: [1.0, 1.0, 1.06] },
    ambience: { hemiSky: 0xd8e4f4, hemiGround: 0xb0b8c8, bounce: 0.72 },
    motes: { amount: 0.36, color: [1.0, 1.0, 1.0] },
    scatter: [
      { type: 'cloudPuff', density: 0.0035, radius: 300, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.6], tilt: 0.02, tint: [0xf0f2f6, 0xffffff], upright: true, shadow: true, evenColor: true },
      { type: 'cloudPuff', density: 0.00055, radius: 420, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [2.5, 7.0], tilt: 0.02, tint: [0xe8ecf4, 0xffffff], upright: true, yOffset: [30, 150], evenColor: true },
      { type: 'flower', density: 0.030, radius: 60, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.9, 1.6], tilt: 0.12, tint: [0xf0d8f8, 0xd8e8ff], emissive: 0.10 },
      { type: 'grassTuft', density: 1.2, radius: 40, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.3], tilt: 0.10, tint: [0xdfe6f0, 0xf4f6fa], grass: true }
    ]
  },

  macromondo: {
    id: 'macromondo', label: 'Macromondo', fantasy: true,
    blurb: 'Tutto e gigantesco, o forse sei tu a essere alto due centimetri. Un filo d erba e un albero.',
    terrain: 'hills', seed: 5501, seaLevel: 0,
    waterLevel: -26, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 40, freq: 0.0018, oct: 5, medAmp: 6.0, medFreq: 0.010, microAmp: 0.8 },
    snowLine: 9999, seasonal: true,
    sunTint: [1.05, 1.02, 0.94], ambientBoost: 1.10,
    palette: {
      grassLow: 0x3e7a24, grassHigh: 0x74a03a, grassDry: 0xa0a848,
      dirt: 0x5e4830, rock: 0x7a766c, rockDark: 0x565248,
      sand: 0x9c9070, snow: 0xeef3fa, underwater: 0x244020
    },
    sky: { turbidity: 2.6, rayleigh: 1.10, mie: 0.0050, mieG: 0.79, groundAlbedo: [0.14, 0.20, 0.08] },
    fog: { density: 0.0030, heightFalloff: 0.0060, tint: [0.98, 1.0, 1.02] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x46601e, bounce: 0.42 },
    /* Niente geometrie nuove: sono gli stessi oggetti di sempre, scalati per
     * venti o cinquanta. E questo il punto — l erba e alta otto metri e i
     * sassolini sono massi, ma restano riconoscibilmente erba e sassolini, ed
     * e da li che nasce la vertigine. */
    scatter: [
      { type: 'grassTuft', density: 0.0060, radius: 320, slope: [0, 0.5], height: [-99, 999], moisture: [0.1, 1], scale: [18, 34], tilt: 0.10, tint: [0x3e8a22, 0x7ab83c], shadow: true },
      { type: 'tallGrass', density: 0.0022, radius: 340, slope: [0, 0.45], height: [-99, 999], moisture: [0.15, 1], scale: [10, 20], tilt: 0.09, tint: [0x4a9426, 0x8cc046], shadow: true },
      { type: 'flower', density: 0.0016, radius: 300, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [30, 70], tilt: 0.10, tint: [0xf0d048, 0xf8f0f8], shadow: true },
      { type: 'mushroom', density: 0.00085, radius: 300, slope: [0, 0.4], height: [-99, 999], moisture: [0.25, 1], scale: [60, 140], tilt: 0.08, tint: [0xc86050, 0xe8b088], shadow: true },
      { type: 'rock', density: 0.0035, radius: 300, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [12, 34], tilt: 0.45, tint: [0x6e6a60, 0x968f82], shadow: true },
      { type: 'fern', density: 0.0018, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0.25, 1], scale: [12, 26], tilt: 0.10, tint: [0x1e5a14, 0x3c8020], shadow: true },
      { type: 'grassTuft', density: 1.4, radius: 34, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.5, 1.0], tilt: 0.08, tint: [0x4c8a2c, 0x7aa844], grass: true }
    ]
  },

  inferno: {
    id: 'inferno', label: 'Inferno', fantasy: true,
    blurb: 'Gironi di roccia nera che scendono verso un lago di fuoco. Il cielo non e cielo: e un soffitto.',
    terrain: 'peaks', seed: 5623, seaLevel: 0,
    waterLevel: -12, waterKind: 'lava', startHeightOffset: 1.7,
    peaks: { amp: 230, freq: 0.0011, oct: 6, medAmp: 20, medFreq: 0.0060, microAmp: 1.2, valleyFloor: -22, sharp: 0.84, massifFreq: 0.00048, floorK: 18 },
    snowLine: 9999, seasonal: false, emberGlow: true,
    /* Meno diffusione e piu assorbimento: con la diffusione multipla attiva
     * un cielo cosi torbido diventava bianco in alto, che e l opposto di un
     * soffitto. */
    skyTint: [1.35, 0.34, 0.20], sunTint: [1.40, 0.58, 0.34], sunBoost: 0.10, sunAngle: 0.0060,
    nightSky: [0.0090, 0.0020, 0.0010], ambientBoost: 1.30, farFade: 900,
    palette: {
      grassLow: 0x2e2422, grassHigh: 0x3c2e2a, grassDry: 0x4a3630,
      dirt: 0x241c1a, rock: 0x1c1614, rockDark: 0x0f0b0a,
      sand: 0x3a2c28, snow: 0x8a6a5a, underwater: 0xff4a08
    },
    sky: { turbidity: 11.0, rayleigh: 0.26, mie: 0.052, mieG: 0.62, groundAlbedo: [0.05, 0.015, 0.008] },
    fog: { density: 0.0170, heightFalloff: 0.0028, tint: [1.55, 0.48, 0.26] },
    ambience: { hemiSky: 0xd04824, hemiGround: 0x2a1614, bounce: 0.36 },
    water: { deep: 0xff3a04, shallow: 0xff9020, foam: 0xffc860, waveAmp: 0.22, waveScale: 5.0, reflect: 0.26 },
    motes: { amount: 0.70, color: [1.0, 0.48, 0.18] },
    scatter: [
      { type: 'darkSpire', density: 0.0022, radius: 700, slope: [0, 0.35], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.1], tilt: 0.02, tint: [0x141010, 0x2e2422], upright: true, sink: 1.0, emissive: 0.34, emissiveMask: true, cluster: { period: 620, radius: 34, jitter: 0.55 }, jitter: 0.6, shadow: true },
      { type: 'watchTower', density: 0.0014, radius: 420, slope: [0, 0.42], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.5], tilt: 0.02, tint: [0x181212, 0x362a26], faceDownhill: true, faceJitter: 2.4, upright: true, sink: 0.5, cluster: { period: 440, radius: 30, jitter: 0.6 }, jitter: 0.7, shadow: true },
      { type: 'ruinPillar', density: 0.0035, radius: 260, slope: [0, 0.45], height: [-99, 999], moisture: [0, 1], scale: [0.9, 2.4], tilt: 0.18, tint: [0x1e1816, 0x3a2e2a], shadow: true },
      { type: 'deadTree', density: 0.0022, radius: 260, slope: [0, 0.5], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.5], tilt: 0.22, tint: [0x120e0c, 0x281f1c], shadow: true },
      { type: 'lavaRock', density: 0.018, radius: 200, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.6, 2.2], tilt: 0.5, tint: [0x1a1514, 0x342a26] },
      { type: 'spiralRock', density: 0.0012, radius: 300, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [1.0, 2.6], tilt: 0.12, tint: [0x1c1614, 0x3a2c28], shadow: true },
      { type: 'rock', density: 0.016, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.7], tilt: 0.5, tint: [0x191413, 0x322a26] }
    ]
  }
,
giza: {
    id: 'giza', label: 'Giza', epoca: true,
    blurb: 'La piana come era finita: le piramidi lisce e bianche di calcare levigato, con la punta dorata. Non erano gradoni gialli.',
    terrain: 'dunes', seed: 5711, seaLevel: 0,
    waterLevel: -22, waterKind: 'lake', startHeightOffset: 1.7,
    dunes: { mesaAmp: 26, mesaFreq: 0.00060, duneAmp: 5.0, duneFreqX: 0.0016, duneFreqZ: 0.0090, microAmp: 0.30 },
    snowLine: 9999, seasonal: false,
    sunTint: [1.10, 1.02, 0.88], ambientBoost: 1.05,
    palette: {
      grassLow: 0xb09a68, grassHigh: 0xc8b482, grassDry: 0xd8c894,
      dirt: 0x9a8258, rock: 0xa89476, rockDark: 0x7a6a50,
      sand: 0xd8c496, sandLight: 0xece0b8, snow: 0xffffff, underwater: 0x3a4a30
    },
    sky: { turbidity: 4.2, rayleigh: 0.98, mie: 0.014, mieG: 0.78, groundAlbedo: [0.34, 0.30, 0.20] },
    /* Poca nebbia: le piramidi si guardano da ottocento metri, e con una
     * densita da paesaggio umido il calcare bianco arriva marrone. Il deserto
     * secco e uno dei posti dove si vede piu lontano al mondo. */
    fog: { density: 0.0016, heightFalloff: 0.0030, tint: [1.06, 1.0, 0.92] },
    farFade: 4200,
    ambience: { hemiSky: 0xa8c4e8, hemiGround: 0x9a8258, bounce: 0.52 },
    scatter: [
      /* Le tre piramidi stanno in punti precisi l una rispetto all altra e
       * sono allineate ai punti cardinali con un errore di pochi minuti
       * d arco. Le postazioni qui sotto sono la pianta vera del sito: Cheope
       * all origine, Chefren a sud-ovest, Micerino piu in la e alto meno di
       * meta, piu le tre piramidi delle regine in fila. */
      { type: 'pyramid', density: 0.00040, radius: 1400, slope: [0, 0.30], height: [-99, 999],
        moisture: [0, 1], scale: [1, 1], tilt: 0, tint: [0xf0ead8, 0xfaf4e4],
        fixedYaw: 0, upright: true, sink: 2.0, shadow: true,
        cluster: { period: 2600, radius: 900, jitter: 0.4, slots: [
          [0, 0, 1.00],            // Cheope
          [-250, 315, 0.97],       // Chefren
          [-455, 625, 0.44],       // Micerino
          [95, -185, 0.20], [160, -185, 0.20], [225, -185, 0.19]   // le regine
        ] } },

      /* La Sfinge guarda a est, verso il sorgere del sole. Il modello guarda
       * verso -Z, quindi per puntarlo a +X serve mezzo giro all indietro. */
      { type: 'sphinx', density: 0.00040, radius: 1400, slope: [0, 0.30], height: [-99, 999],
        moisture: [0, 1], scale: [1, 1], tilt: 0, tint: [0xd8bf94, 0xe8d4ac],
        fixedYaw: -1.5708, upright: true, sink: 1.2, shadow: true,
        cluster: { period: 2600, radius: 900, jitter: 0.4, slots: [[385, 300, 1.0]] } },

      { type: 'palm', density: 0.0030, radius: 260, slope: [0, 0.3], height: [-99, -6], moisture: [0.4, 1], scale: [0.9, 1.5], tilt: 0.10, tint: [0x3a7a2e, 0x6aa848], shadow: true },
      { type: 'reed', density: 0.045, radius: 100, slope: [0, 0.35], height: [-99, -18], moisture: [0.4, 1], scale: [0.9, 1.6], tilt: 0.06, tint: [0x7a8a34, 0xa8b45a] },
      { type: 'dryBush', density: 0.010, radius: 180, slope: [0, 0.5], height: [-99, 999], moisture: [0, 0.5], scale: [0.7, 1.4], tilt: 0.08, tint: [0x8a7a4a, 0xb0a06a] },
      { type: 'rock', density: 0.012, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.45, tint: [0xa08c68, 0xc4b088] },
      { type: 'slabRock', density: 0.0025, radius: 250, slope: [0, 0.7], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.2], tilt: 0.12, tint: [0xa89476, 0xcabb98], shadow: true }
    ]
  },

  romaantica: {
    id: 'romaantica', label: 'Antica Roma', epoca: true,
    blurb: 'Non il Foro in rovina: la citta viva. Insulae di quattro piani lungo strade strette, templi col tetto di coppi, e i pini sopra i tetti.',
    terrain: 'hills', seed: 5813, seaLevel: 0,
    waterLevel: -14, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 26, freq: 0.0024, oct: 4, medAmp: 3.4, medFreq: 0.013, microAmp: 0.45 },
    snowLine: 9999, seasonal: false,
    sunTint: [1.08, 1.02, 0.92],
    palette: {
      grassLow: 0x6a7c34, grassHigh: 0x8a9648, grassDry: 0xb0a25a,
      dirt: 0x8a7452, rock: 0x9a9080, rockDark: 0x6e6656,
      sand: 0xb0a078, snow: 0xeef2f8, underwater: 0x2e4028
    },
    sky: { turbidity: 3.0, rayleigh: 1.05, mie: 0.0075, mieG: 0.79, groundAlbedo: [0.20, 0.20, 0.14] },
    fog: { density: 0.0040, heightFalloff: 0.0060, tint: [1.02, 1.0, 0.96] },
    ambience: { hemiSky: 0x9cc0e8, hemiGround: 0x6a6438, bounce: 0.46 },
    scatter: [
      /* Le insulae si allineano lungo i filari, che sono le strade: due
       * famiglie incrociate danno l isolato. Senza l allineamento resta un
       * mucchio di case girate a caso, che e il modo piu sicuro per non far
       * sembrare una citta una citta. */
      { type: 'insula', density: 0.0075, radius: 260, slope: [0, 0.22], height: [1, 999],
        moisture: [0, 1], scale: [0.85, 1.25], tilt: 0.008, tint: [0xd8c0a0, 0xe8d4b8],
        rows: { angle: 0.35, period: 34, width: 0.26 }, yawFromRows: true, faceJitter: 0.05,
        upright: true, sink: 0.4, jitter: 0.5, emissive: 0.07, emissiveMask: true, shadow: true,
        cluster: { period: 620, radius: 210, jitter: 0.5 } },
      { type: 'insula', density: 0.0075, radius: 260, slope: [0, 0.22], height: [1, 999],
        moisture: [0, 1], scale: [0.85, 1.25], tilt: 0.008, tint: [0xd0b898, 0xe4cfae],
        rows: { angle: 0.35 + 1.5708, period: 36, width: 0.24 }, yawFromRows: true, faceJitter: 0.05,
        upright: true, sink: 0.4, jitter: 0.5, emissive: 0.07, emissiveMask: true, shadow: true,
        cluster: { period: 620, radius: 210, jitter: 0.5 } },

      { type: 'romanTemple', density: 0.0016, radius: 300, slope: [0, 0.16], height: [1, 999],
        moisture: [0, 1], scale: [0.9, 1.5], tilt: 0, tint: [0xe4dcc8, 0xf0ead8],
        fixedYaw: 0.35, faceJitter: 0.12, upright: true, sink: 0.5, shadow: true,
        cluster: { period: 620, radius: 90, jitter: 0.5 }, jitter: 0.7 },
      { type: 'statue', density: 0.0028, radius: 200, slope: [0, 0.18], height: [1, 999],
        moisture: [0, 1], scale: [1.2, 2.2], tilt: 0.01, tint: [0xdad4c4, 0xeae4d4],
        upright: true, shadow: true, cluster: { period: 620, radius: 130, jitter: 0.5 }, jitter: 0.8 },
      { type: 'ruinPillar', density: 0.0035, radius: 220, slope: [0, 0.2], height: [1, 999],
        moisture: [0, 1], scale: [1.0, 1.9], tilt: 0.02, tint: [0xd8d0bc, 0xeae2ce],
        upright: true, shadow: true, cluster: { period: 620, radius: 120, jitter: 0.5 } },

      { type: 'conifer', density: 0.0032, radius: 300, slope: [0, 0.4], height: [-99, 999], moisture: [0.15, 1], scale: [1.1, 1.9], tilt: 0.04, tint: [0x2e5624, 0x4a7a32], shadow: true },
      { type: 'bush', density: 0.016, radius: 150, slope: [0, 0.5], height: [-99, 999], moisture: [0.15, 1], scale: [0.7, 1.4], tilt: 0.06, tint: [0x4a6a26, 0x76903c] },
      { type: 'rock', density: 0.008, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.4], tilt: 0.45, tint: [0x8a8272, 0xb0a894] },
      { type: 'grassTuft', density: 2.0, radius: 40, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.3], tilt: 0.08, tint: [0x6e8a30, 0x9aa848], grass: true }
    ]
  },

  stonehenge: {
    id: 'stonehenge', label: 'Stonehenge', epoca: true,
    blurb: 'La piana di Salisbury quattromila anni fa, col cerchio ancora intero: i triliti in piedi e gli architravi al loro posto.',
    terrain: 'hills', seed: 5903, seaLevel: 0,
    waterLevel: -30, waterKind: 'lake', startHeightOffset: 1.7,
    hills: { amp: 22, freq: 0.0013, oct: 4, medAmp: 2.6, medFreq: 0.009, microAmp: 0.40 },
    snowLine: 9999, seasonal: true,
    sunTint: [1.02, 1.0, 0.96],
    palette: {
      grassLow: 0x5a7a2e, grassHigh: 0x86a044, grassDry: 0xa8a45a,
      dirt: 0x6a5a3e, rock: 0x8a8578, rockDark: 0x605c50,
      sand: 0x9a9070, snow: 0xeef3fa, underwater: 0x2a4020
    },
    sky: { turbidity: 3.6, rayleigh: 1.18, mie: 0.011, mieG: 0.77, groundAlbedo: [0.16, 0.20, 0.10] },
    fog: { density: 0.0060, heightFalloff: 0.0090, tint: [0.98, 1.0, 1.02] },
    ambience: { hemiSky: 0x9cb8d8, hemiGround: 0x54601e, bounce: 0.40 },
    scatter: [
      /* Il cerchio di sarsen: trenta piedritti su un anello di sedici metri e
       * mezzo di raggio, e dentro il ferro di cavallo dei triliti. E la
       * disposizione a fare Stonehenge — un grappolo darebbe un mucchio di
       * sassi, che e esattamente cio che Stonehenge non e. */
      { type: 'trilithon', density: 0.024, radius: 320, slope: [0, 0.20], height: [-99, 999],
        moisture: [0, 1], scale: [0.95, 1.12], tilt: 0.015, tint: [0x8a8578, 0xa8a294],
        faceCenter: true, faceJitter: 0.10, upright: true, sink: 0.3, jitter: 0.35, shadow: true,
        cluster: { period: 620, radius: 40, ring: 16.5, ringWidth: 2.6, jitter: 0.5 } },
      { type: 'trilithon', density: 0.020, radius: 320, slope: [0, 0.20], height: [-99, 999],
        moisture: [0, 1], scale: [1.20, 1.42], tilt: 0.015, tint: [0x847f72, 0xa09a8c],
        faceCenter: true, faceJitter: 0.06, upright: true, sink: 0.3, jitter: 0.30, shadow: true,
        cluster: { period: 620, radius: 40, ring: 7.2, ringWidth: 1.8, jitter: 0.5 } },
      { type: 'standingStone', density: 0.014, radius: 320, slope: [0, 0.22], height: [-99, 999],
        moisture: [0, 1], scale: [0.55, 0.75], tilt: 0.05, tint: [0x5e6a6e, 0x808a8c],
        faceCenter: true, faceJitter: 0.4, upright: true, jitter: 0.5, shadow: true,
        cluster: { period: 620, radius: 40, ring: 25.5, ringWidth: 2.2, jitter: 0.5 } },
      { type: 'standingStone', density: 0.0040, radius: 300, slope: [0, 0.3], height: [-99, 999],
        moisture: [0, 1], scale: [0.7, 1.1], tilt: 0.14, tint: [0x6e6a60, 0x8e8a80],
        cluster: { period: 380, radius: 9, jitter: 0.6 }, jitter: 0.7, shadow: true },

      { type: 'broadleaf', density: 0.0016, radius: 320, slope: [0, 0.4], height: [-99, 999], moisture: [0.3, 1], scale: [0.8, 1.3], tilt: 0.05, tint: [0x39701f, 0x6a9036], shadow: true, seasonal: true },
      { type: 'bush', density: 0.018, radius: 150, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.06, tint: [0x35661e, 0x5a8a2c], seasonal: true },
      { type: 'rock', density: 0.006, radius: 150, slope: [0.05, 1], height: [-99, 999], moisture: [0, 1], scale: [0.4, 1.2], tilt: 0.45, tint: [0x74706a, 0x98938a] },
      { type: 'grassTuft', density: 2.6, radius: 42, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.6, 1.1], tilt: 0.07, tint: [0x548a2a, 0x86ac42], grass: true }
    ]
  }
,
buconero: {
    id: 'buconero', label: 'Buco nero', fantasy: true,
    blurb: 'Un sasso senz aria in orbita attorno a un buco nero che sta divorando la sua stella. Il disco di accrescimento e l unica luce.',
    terrain: 'craters', seed: 6101, seaLevel: 0,
    waterLevel: null, startHeightOffset: 1.7,
    craters: { freq: 0.0014, amp: 38, cellSize: 150, density: 0.80, depth: 0.44, rim: 0.18, microAmp: 0.60 },
    snowLine: 9999, seasonal: false, noShadows: false,
    /* Niente aria: rayleigh quasi a zero, cielo nero, e le stelle si vedono
     * anche di «giorno». La luce arriva tutta dal disco. */
    blackHole: { dir: [0.351, 0.341, -0.872], size: 0.030, tilt: 0.20, temp: 1.0 },
    fixedSun: [19.9, 21.9], sunDisk: 0,
    sunTint: [1.35, 0.72, 0.34], sunBoost: 0.0, sunAngle: 0.0030,
    skyTint: [1.0, 0.7, 0.5], nightSky: [0.0009, 0.0006, 0.0010],
    ambientBoost: 0.55, farFade: 2600, starsAlways: true,
    palette: {
      grassLow: 0x2e2c2a, grassHigh: 0x3c3936, grassDry: 0x46423e,
      dirt: 0x272522, rock: 0x22201e, rockDark: 0x141312,
      sand: 0x35322e, snow: 0x8a8480, underwater: 0x101010
    },
    sky: { turbidity: 1.0, rayleigh: 0.020, mie: 0.0016, mieG: 0.72, groundAlbedo: [0.05, 0.04, 0.04] },
    fog: { density: 0.0006, heightFalloff: 0.0020, tint: [1.20, 0.66, 0.34] },
    ambience: { hemiSky: 0x6a3418, hemiGround: 0x1a1614, bounce: 0.20 },
    motes: { amount: 0.12, color: [1.0, 0.58, 0.26] },
    scatter: [
      { type: 'boulder', density: 0.0030, radius: 320, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [1.0, 3.2], tilt: 0.35, tint: [0x1e1c1a, 0x3a3632], shadow: true },
      { type: 'slabRock', density: 0.0022, radius: 300, slope: [0, 0.7], height: [-99, 999], moisture: [0, 1], scale: [1.0, 2.8], tilt: 0.16, tint: [0x232120, 0x403b36], shadow: true },
      { type: 'lavaRock', density: 0.014, radius: 200, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.6, 2.0], tilt: 0.5, tint: [0x1c1a18, 0x35302c] },
      { type: 'rock', density: 0.022, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.8], tilt: 0.5, tint: [0x201e1c, 0x38332f] },
      { type: 'crystal', density: 0.0016, radius: 220, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.8, 2.0], tilt: 0.12, tint: [0x704028, 0xc07040], emissive: 0.16, shadow: true }
    ]
  }
};

export const BIOME_ORDER = [
  // reali
  'foresta', 'deserto', 'citta', 'alpino', 'costa', 'artico', 'savana', 'vulcanico', 'palude',
  'canyonrosso', 'giungla', 'bambu', 'sequoie', 'lavanda', 'salar', 'fiordi', 'geyser',
  'barriera', 'mareaperto', 'cascate',
  // passati
  'carbonifero', 'saharaverde', 'adeano', 'giza', 'stonehenge', 'romaantica',
  'giurassico', 'glaciale',
  // immaginari
  'boscostregato', 'boscofatato', 'isolecielo', 'smeraldo', 'collegio', 'pianetino',
  'pandora', 'marte', 'luna', 'titano', 'oort', 'desolata', 'neon', 'ghiaccio',
  'contea', 'ombra', 'montefato', 'tatooine',
  'atlantide', 'terracava', 'agartha', 'biblioteca',
  'mondonuvole', 'macromondo', 'inferno', 'buconero'
];


/* ------------------------------------------------------------------ *
 * FAUNA
 * Tenuta separata dalle ricette dei luoghi: si aggiunge e si toglie senza
 * toccare il resto. Un posto dove niente si muove sembra un plastico.
 *
 * count = quanti individui vivi attorno al giocatore; radius = entro quale
 * distanza restano (usciti, ricompaiono dall altra parte).
 * ------------------------------------------------------------------ */

const UCCELLO = [0x2a2622, 0x5c5248];
const GABBIANO = [0xd4d6d2, 0xf2f2ee];
const CORVO = [0x121418, 0x2c3038];
const RAPACE = [0x382c20, 0x6e5c44];
const CERVO = [0x7c5730, 0xb08a5a];
const ANTILOPE = [0xb8834a, 0xe0b47a];
const PESCE = [0x35657c, 0x8fb8cc];

export const FAUNA = {
  foresta: [
    { type: 'bird', count: 24, radius: 300, y: [28, 70], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'deer', count: 9, radius: 220, scale: [0.85, 1.15], tint: CERVO, speed: [1.1, 2.0], shadow: true },
    { type: 'butterfly', count: 60, radius: 42, y: [0.5, 2.4], scale: [0.8, 1.4], tint: [0xe8a83a, 0xf2d86a] }
  ],
  deserto: [
    { type: 'raptor', count: 6, radius: 340, y: [60, 130], scale: [0.9, 1.3], tint: RAPACE }
  ],
  citta: [
    { type: 'bird', count: 26, radius: 260, y: [22, 55], scale: [0.8, 1.1], tint: [0x4a4e56, 0x8a8e96] }
  ],
  alpino: [
    { type: 'raptor', count: 7, radius: 360, y: [70, 160], scale: [1.0, 1.4], tint: RAPACE },
    { type: 'deer', count: 7, radius: 220, scale: [0.8, 1.05], tint: CERVO, speed: [1.0, 1.8], shadow: true }
  ],
  costa: [
    { type: 'bird', count: 28, radius: 300, y: [14, 45], scale: [0.9, 1.3], tint: GABBIANO },
    { type: 'fish', count: 70, radius: 90, scale: [0.7, 1.5], tint: [0x4a8a90, 0xd8d060] },
    { type: 'butterfly', count: 26, radius: 40, y: [0.5, 2.2], scale: [0.9, 1.5], tint: [0x40b0d0, 0xf0f0a0] }
  ],
  artico: [
    { type: 'bird', count: 10, radius: 300, y: [25, 60], scale: [0.9, 1.2], tint: GABBIANO }
  ],
  savana: [
    { type: 'bird', count: 18, radius: 320, y: [35, 90], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'antelope', count: 16, radius: 280, scale: [0.85, 1.15], tint: ANTILOPE, speed: [1.4, 2.6], shadow: true },
    { type: 'butterfly', count: 26, radius: 40, y: [0.4, 1.8], scale: [0.8, 1.2], tint: [0xe0c050, 0xf0e090] }
  ],
  palude: [
    { type: 'bird', count: 14, radius: 260, y: [16, 45], scale: [0.9, 1.4], tint: [0x54503e, 0x8a8464] },
    { type: 'fish', count: 34, radius: 70, scale: [0.6, 1.1], tint: [0x3e5230, 0x7a8a4a] },
    { type: 'butterfly', count: 46, radius: 40, y: [0.3, 1.6], scale: [0.8, 1.3], tint: [0x8ac04a, 0xd8e070] }
  ],
  canyonrosso: [
    { type: 'raptor', count: 7, radius: 380, y: [80, 170], scale: [1.0, 1.4], tint: RAPACE }
  ],
  giungla: [
    { type: 'bird', count: 34, radius: 240, y: [18, 48], scale: [0.8, 1.2], tint: [0x2a8a3a, 0xe06a2a] },
    { type: 'butterfly', count: 90, radius: 42, y: [0.4, 3.0], scale: [0.9, 1.7], tint: [0x30a0e0, 0xf0d040] },
    { type: 'fish', count: 22, radius: 60, scale: [0.6, 1.0], tint: [0x3a6a48, 0x9ab060] }
  ],
  bambu: [
    { type: 'bird', count: 22, radius: 250, y: [20, 50], scale: [0.8, 1.15], tint: [0x4a5a30, 0x9aa860] },
    { type: 'butterfly', count: 55, radius: 40, y: [0.4, 2.6], scale: [0.8, 1.4], tint: [0xf0f0f0, 0xe8c060] }
  ],
  salar: [
    { type: 'bird', count: 14, radius: 340, y: [20, 70], scale: [0.9, 1.4], tint: [0xe8b0c0, 0xf8e0e8] }
  ],
  fiordi: [
    { type: 'bird', count: 30, radius: 320, y: [20, 80], scale: [0.9, 1.3], tint: GABBIANO },
    { type: 'fish', count: 50, radius: 80, scale: [0.7, 1.3], tint: [0x2e5a6e, 0x8aa8b8] }
  ],
  geyser: [
    { type: 'bird', count: 16, radius: 280, y: [26, 60], scale: [0.9, 1.2], tint: UCCELLO },
    { type: 'deer', count: 7, radius: 220, scale: [0.9, 1.2], tint: CERVO, speed: [1.1, 2.0], shadow: true }
  ],
  boscostregato: [
    { type: 'bird', count: 14, radius: 240, y: [18, 44], scale: [0.9, 1.3], tint: CORVO },
    { type: 'butterfly', count: 26, radius: 36, y: [0.4, 2.0], scale: [0.8, 1.3], tint: [0x2a3a2a, 0x6a8a5a] }
  ],
  boscofatato: [
    { type: 'butterfly', count: 110, radius: 44, y: [0.4, 3.4], scale: [0.9, 1.8], tint: [0x60f0c0, 0xd0a0ff], emissive: 0.30 },
    { type: 'jelly', count: 9, radius: 180, y: [10, 34], scale: [0.8, 1.8], tint: [0x70d8ff, 0xd8b0ff], emissive: 0.22 },
    { type: 'bird', count: 14, radius: 240, y: [22, 55], scale: [0.8, 1.2], tint: [0x9ad0f0, 0xf0d8ff] }
  ],
  isolecielo: [
    { type: 'bird', count: 40, radius: 360, y: [20, 90], scale: [0.9, 1.4], tint: GABBIANO },
    { type: 'jelly', count: 7, radius: 220, y: [26, 60], scale: [1.0, 2.2], tint: [0xd8e8f0, 0xffffff] }
  ],
  smeraldo: [
    { type: 'bird', count: 20, radius: 300, y: [28, 70], scale: [0.9, 1.3], tint: [0x2a7a6a, 0x8ad0b0] },
    { type: 'butterfly', count: 40, radius: 40, y: [0.4, 2.2], scale: [0.9, 1.5], tint: [0x40e0b0, 0xf0f0a0] }
  ],
  collegio: [
    { type: 'bird', count: 24, radius: 300, y: [26, 75], scale: [0.9, 1.3], tint: CORVO },
    { type: 'deer', count: 9, radius: 230, scale: [0.85, 1.15], tint: CERVO, speed: [1.0, 2.0], shadow: true },
    { type: 'fish', count: 26, radius: 70, scale: [0.6, 1.1], tint: [0x2e4a3a, 0x7a8a5a] }
  ],
  pianetino: [
    { type: 'butterfly', count: 40, radius: 42, y: [0.4, 2.4], scale: [0.9, 1.6], tint: [0xf0d040, 0xf8f0c0] },
    { type: 'bird', count: 8, radius: 120, y: [14, 30], scale: [0.9, 1.2], tint: UCCELLO }
  ],
  pandora: [
    { type: 'jelly', count: 16, radius: 240, y: [12, 46], scale: [0.9, 2.2], tint: [0x40d0ff, 0xc060ff], emissive: 0.26 },
    { type: 'butterfly', count: 100, radius: 46, y: [0.5, 3.6], scale: [1.0, 2.0], tint: [0x50f0d0, 0xff70d0], emissive: 0.30 },
    { type: 'bird', count: 26, radius: 300, y: [26, 80], scale: [1.0, 1.6], tint: [0x2060a0, 0xe0a040] },
    { type: 'fish', count: 26, radius: 70, scale: [0.7, 1.3], tint: [0x30a0a0, 0xc0f0e0] }
  ],
  desolata: [
    { type: 'raptor', count: 6, radius: 340, y: [55, 120], scale: [0.9, 1.3], tint: CORVO }
  ],
  neon: [
    { type: 'bird', count: 18, radius: 240, y: [30, 90], scale: [0.8, 1.1], tint: [0x2a2e36, 0x60646c] }
  ],
  ghiaccio: [
    { type: 'bird', count: 10, radius: 320, y: [40, 110], scale: [0.9, 1.3], tint: GABBIANO }
  ],
  giza: [
    { type: 'raptor', count: 6, radius: 340, y: [50, 140], scale: [0.9, 1.3], tint: RAPACE },
    { type: 'bird', count: 16, radius: 260, y: [12, 40], scale: [0.8, 1.1], tint: [0x8a7a5a, 0xd0c0a0] }
  ],
  romaantica: [
    { type: 'bird', count: 26, radius: 260, y: [16, 48], scale: [0.8, 1.1], tint: [0x4a4e56, 0x8a8e96] },
    { type: 'butterfly', count: 30, radius: 44, y: [0.4, 2.2], scale: [0.8, 1.3], tint: [0xe0c050, 0xf0e090] }
  ],
  stonehenge: [
    { type: 'bird', count: 22, radius: 300, y: [20, 60], scale: [0.9, 1.3], tint: CORVO },
    { type: 'deer', count: 10, radius: 240, scale: [0.85, 1.15], tint: CERVO, speed: [1.0, 1.9], shadow: true },
    { type: 'butterfly', count: 34, radius: 44, y: [0.4, 2.0], scale: [0.8, 1.3], tint: [0xf0e070, 0xf8f8f0] }
  ],
  carbonifero: [
    /* Meganeura: settanta centimetri di apertura alare. Era possibile perche
       l aria aveva molto piu ossigeno, ed e la cosa piu memorabile del
       periodo — piu delle piante. */
    { type: 'butterfly', count: 40, radius: 90, y: [1.0, 9.0], scale: [7, 11], tint: [0x3a6a8a, 0x8ac0d0] },
    { type: 'butterfly', count: 70, radius: 46, y: [0.4, 3.0], scale: [1.4, 2.6], tint: [0x6a8a3a, 0xc0d070] },
    { type: 'fish', count: 40, radius: 80, scale: [0.7, 1.6], tint: [0x3a4a28, 0x8a9450] }
  ],
  saharaverde: [
    { type: 'bird', count: 22, radius: 320, y: [30, 80], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'antelope', count: 22, radius: 300, scale: [0.85, 1.2], tint: ANTILOPE, speed: [1.4, 2.6], shadow: true },
    { type: 'deer', count: 8, radius: 240, scale: [0.9, 1.2], tint: CERVO, speed: [1.0, 1.9], shadow: true },
    { type: 'butterfly', count: 40, radius: 44, y: [0.4, 2.0], scale: [0.9, 1.4], tint: [0xe0c050, 0xf4e890] }
  ],
  mondonuvole: [
    { type: 'bird', count: 40, radius: 340, y: [10, 90], scale: [0.9, 1.6], tint: GABBIANO },
    { type: 'jelly', count: 16, radius: 120, y: [6, 46], scale: [1.0, 2.6], tint: [0xd8e0f0, 0xffffff] }
  ],
  macromondo: [
    /* Alla scala di un insetto una farfalla e grande come un aliante. */
    { type: 'butterfly', count: 26, radius: 200, y: [3, 40], scale: [40, 90], tint: [0xe08030, 0xf8d060] },
    { type: 'bird', count: 8, radius: 380, y: [90, 220], scale: [6, 12], tint: UCCELLO }
  ],
  inferno: [
    { type: 'raptor', count: 12, radius: 340, y: [40, 130], scale: [1.0, 1.8], tint: [0x1a1210, 0x4a2a1e] }
  ],
  contea: [
    /* I panciotti cambiano colore da uno all altro: e cio che fa sembrare
       un gruppo un gruppo di persone e non copie dello stesso modello. */
    { type: 'hobbit', count: 16, radius: 130, scale: [0.92, 1.08],
      tint: [0x8a4a3a, 0x4a6a8a], speed: [0.7, 1.4], shadow: true },
    { type: 'bird', count: 30, radius: 300, y: [22, 60], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'deer', count: 11, radius: 230, scale: [0.8, 1.1], tint: CERVO, speed: [1.0, 1.9], shadow: true },
    { type: 'butterfly', count: 90, radius: 44, y: [0.4, 2.2], scale: [0.9, 1.5], tint: [0xf0d850, 0xf8f8f0] }
  ],
  ombra: [
    { type: 'raptor', count: 7, radius: 320, y: [50, 120], scale: [0.9, 1.4], tint: CORVO }
  ],
  giurassico: [
    { type: 'sauropod', count: 5, radius: 420, scale: [0.85, 1.25], tint: [0x4e5a44, 0x8a9068], speed: [0.5, 1.0], shadow: true },
    { type: 'biped', count: 4, radius: 340, scale: [0.85, 1.20], tint: [0x6a4a2c, 0xa8804a], speed: [1.6, 3.2], shadow: true },
    { type: 'pterosaur', count: 11, radius: 380, y: [40, 110], scale: [1.6, 3.0], tint: [0x5c5044, 0x9a8a70] },
    { type: 'bird', count: 12, radius: 260, y: [16, 40], scale: [0.9, 1.3], tint: [0x2a5a34, 0x7a9a48] },
    { type: 'butterfly', count: 45, radius: 42, y: [0.4, 3.0], scale: [1.1, 2.0], tint: [0x50c060, 0xe8d060] }
  ],
  glaciale: [
    { type: 'mammoth', count: 7, radius: 340, scale: [0.85, 1.20], tint: [0x5c4028, 0x8e6a44], speed: [0.7, 1.4], shadow: true },
    { type: 'deer', count: 9, radius: 280, scale: [0.9, 1.2], tint: [0x6e6250, 0x9c8f76], speed: [1.2, 2.4], shadow: true },
    { type: 'bird', count: 9, radius: 300, y: [30, 80], scale: [0.9, 1.3], tint: [0x3a3e44, 0x7c8288] }
  ],
  barriera: [
    { type: 'fish', count: 130, radius: 90, scale: [0.6, 1.8], tint: [0xf0a030, 0x40b0d0] },
    { type: 'bigFish', count: 6, radius: 150, scale: [0.8, 1.6], tint: [0x40607a, 0x9ab0c0] },
    { type: 'jelly', count: 7, radius: 120, y: [6, 20], scale: [0.5, 1.1], tint: [0xd8b0f0, 0xf0e0ff], emissive: 0.10 }
  ],
  atlantide: [
    { type: 'fish', count: 80, radius: 90, scale: [0.6, 1.5], tint: [0x8aa060, 0x50a0b0] },
    { type: 'bigFish', count: 5, radius: 160, scale: [0.9, 1.8], tint: [0x3a4e5c, 0x8090a0] },
    { type: 'jelly', count: 9, radius: 130, y: [8, 24], scale: [0.6, 1.4], tint: [0x90d8f0, 0xe0f8ff], emissive: 0.14 }
  ],
  terracava: [
    { type: 'bird', count: 24, radius: 280, y: [24, 60], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'deer', count: 10, radius: 240, scale: [0.85, 1.15], tint: CERVO, speed: [1.0, 2.0], shadow: true },
    { type: 'butterfly', count: 70, radius: 42, y: [0.4, 2.6], scale: [0.9, 1.6], tint: [0xf0c050, 0xf8e8a0] }
  ],
  agartha: [
    { type: 'butterfly', count: 95, radius: 44, y: [0.5, 3.2], scale: [1.0, 1.9], tint: [0xffd070, 0xfff0c0], emissive: 0.26 },
    { type: 'jelly', count: 11, radius: 200, y: [14, 40], scale: [0.8, 1.8], tint: [0xffd88a, 0xfff4d0], emissive: 0.22 },
    { type: 'bird', count: 16, radius: 260, y: [26, 65], scale: [0.9, 1.3], tint: [0xd8b070, 0xf8e8c0] }
  ],
  montefato: [
    { type: 'raptor', count: 6, radius: 340, y: [70, 160], scale: [1.0, 1.5], tint: CORVO }
  ],
  tatooine: [
    { type: 'raptor', count: 5, radius: 340, y: [70, 150], scale: [0.9, 1.3], tint: RAPACE }
  ],
  sequoie: [
    { type: 'bird', count: 26, radius: 260, y: [26, 70], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'deer', count: 8, radius: 230, scale: [0.85, 1.15], tint: CERVO, speed: [1.0, 1.9], shadow: true },
    { type: 'butterfly', count: 40, radius: 40, y: [0.4, 2.4], scale: [0.9, 1.5], tint: [0xe8a83a, 0xf2d86a] }
  ],
  lavanda: [
    { type: 'butterfly', count: 140, radius: 44, y: [0.3, 1.8], scale: [0.9, 1.6], tint: [0xf0e070, 0xd8a0e8] },
    { type: 'bird', count: 20, radius: 280, y: [20, 55], scale: [0.9, 1.3], tint: UCCELLO }
  ],
  cascate: [
    { type: 'bird', count: 26, radius: 300, y: [24, 70], scale: [0.9, 1.3], tint: UCCELLO },
    { type: 'deer', count: 8, radius: 230, scale: [0.85, 1.15], tint: CERVO, speed: [1.0, 1.9], shadow: true },
    { type: 'butterfly', count: 55, radius: 42, y: [0.4, 2.4], scale: [0.9, 1.5], tint: [0x60c0e0, 0xf0e8a0] }
  ],
  mareaperto: [
    { type: 'bird', count: 34, radius: 340, y: [6, 40], scale: [1.0, 1.5], tint: GABBIANO },
    { type: 'fish', count: 40, radius: 80, scale: [0.7, 1.4], tint: [0x2e6a80, 0x9ac0d0] },
    { type: 'bigFish', count: 5, radius: 180, scale: [1.0, 2.2], tint: [0x24404e, 0x7a8e9c] }
  ]
};

export function getBiome(id) {
  return BIOMES[id] || BIOMES.foresta;
}
export function getWeather(id) {
  return WEATHERS.find(w => w.id === id) || WEATHERS[0];
}
export function getSeason(id) {
  return SEASONS.find(s => s.id === id) || SEASONS[1];
}
