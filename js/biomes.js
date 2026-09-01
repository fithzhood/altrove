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
      { type: 'swampTree', density: 0.0050, radius: 300, slope: [0, 0.5], height: [-3, 40], moisture: [0, 1], scale: [0.75, 1.32], tilt: 0.05, tint: [0x354a20, 0x4e6428], shadow: true, seasonal: true },
      { type: 'deadTree', density: 0.0026, radius: 280, slope: [0, 0.5], height: [-3, 40], moisture: [0, 1], scale: [0.7, 1.5], tilt: 0.13, tint: [0x3e3a2c, 0x54503c], shadow: true },
      { type: 'reed', density: 0.75, radius: 55, slope: [0, 0.35], height: [-1.4, 2.2], moisture: [0, 1], scale: [0.7, 1.4], tilt: 0.06, tint: [0x5e6a30, 0x84884a], grass: true },
      { type: 'fern', density: 0.030, radius: 80, slope: [0, 0.5], height: [0.2, 40], moisture: [0.3, 1], scale: [0.7, 1.4], tilt: 0.1, tint: [0x2e4a1c, 0x466326] },
      { type: 'log', density: 0.0022, radius: 150, slope: [0, 0.4], height: [-1, 40], moisture: [0, 1], scale: [0.8, 1.5], tilt: 0.06, tint: [0x352e22, 0x4a4030] },
      { type: 'rock', density: 0.006, radius: 140, slope: [0, 1], height: [-1, 999], moisture: [0, 1], scale: [0.5, 1.3], tilt: 0.5, tint: [0x42433a, 0x5e5e50] },
      { type: 'mushroom', density: 0.016, radius: 55, slope: [0, 0.4], height: [0.3, 40], moisture: [0.4, 1], scale: [0.7, 1.4], tilt: 0.12, tint: [0x8a6a3c, 0xc4b48c] },
      { type: 'grassTuft', density: 1.8, radius: 38, slope: [0, 0.5], height: [0.1, 40], moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x44581f, 0x66722e], grass: true }
    ]
  }
,

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
      { type: 'twistedTree', density: 0.0110, radius: 300, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.65, 1.30], tilt: 0.10, tint: [0x1e2c16, 0x33421f], shadow: true },
      { type: 'deadTree', density: 0.0038, radius: 280, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.16, tint: [0x1c1815, 0x352e26], shadow: true },
      { type: 'glowMushroom', density: 0.030, radius: 80, slope: [0, 0.5], height: [-99, 999], moisture: [0.3, 1], scale: [0.8, 1.8], tilt: 0.14, tint: [0x2ad6a0, 0x7ef0c8], emissive: 0.45 },
      { type: 'mushroom', density: 0.016, radius: 60, slope: [0, 0.45], height: [-99, 999], moisture: [0.35, 1], scale: [0.8, 1.6], tilt: 0.14, tint: [0x6a4a3a, 0x8e7a62] },
      { type: 'fern', density: 0.040, radius: 85, slope: [0, 0.55], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.4], tilt: 0.10, tint: [0x1f3316, 0x35521f] },
      { type: 'bush', density: 0.016, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.08, tint: [0x1c2c14, 0x2f4420] },
      { type: 'rock', density: 0.014, radius: 160, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.5], tilt: 0.45, tint: [0x2e302c, 0x4a4c46] },
      { type: 'boulder', density: 0.0016, radius: 240, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.7], tilt: 0.3, tint: [0x2c2e2a, 0x484a44], shadow: true },
      { type: 'log', density: 0.0022, radius: 130, slope: [0, 0.4], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.4], tilt: 0.06, tint: [0x211c18, 0x38302a] },
      { type: 'grassTuft', density: 1.5, radius: 36, slope: [0, 0.55], height: [-99, 999], moisture: [0.15, 1], scale: [0.65, 1.15], tilt: 0.10, tint: [0x2a4018, 0x486028], grass: true }
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
      { type: 'fairyTree', density: 0.0044, radius: 340, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.35], tilt: 0.05, tint: [0x3fd0a8, 0x9ef0d0], shadow: true, emissive: 0.10 },
      { type: 'giantMushroom', density: 0.0032, radius: 260, slope: [0, 0.45], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.5], tilt: 0.07, tint: [0xd85aa8, 0xf8a0d0], shadow: true, emissive: 0.14 },
      { type: 'glowMushroom', density: 0.045, radius: 80, slope: [0, 0.5], height: [-99, 999], moisture: [0.25, 1], scale: [0.9, 2.0], tilt: 0.12, tint: [0x50b8f0, 0xa8e8ff], emissive: 0.50 },
      { type: 'broadleaf', density: 0.0030, radius: 280, slope: [0, 0.5], height: [-99, 999], moisture: [0.3, 1], scale: [0.7, 1.15], tilt: 0.05, tint: [0x2f7a5a, 0x58a878], shadow: true },
      { type: 'fern', density: 0.038, radius: 85, slope: [0, 0.55], height: [-99, 999], moisture: [0.25, 1], scale: [0.7, 1.4], tilt: 0.10, tint: [0x1f5a42, 0x3c8a5e] },
      { type: 'flower', density: 0.055, radius: 65, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.5], tilt: 0.12, tint: [0xf0a0e8, 0xfff0a0], emissive: 0.25 },
      { type: 'bush', density: 0.014, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.07, tint: [0x246048, 0x3f8a60] },
      { type: 'rock', density: 0.009, radius: 150, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.4], tilt: 0.45, tint: [0x4c4658, 0x6e6880] },
      { type: 'grassTuft', density: 2.0, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x35906a, 0x6ec49a], grass: true }
    ]
  },

  isolecielo: {
    id: 'isolecielo',
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
      { type: 'grassTuft', density: 2.2, radius: 38, slope: [0, 0.6], height: [-40, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x5f8130, 0x8fa447], grass: true }
    ]
  },

  smeraldo: {
    id: 'smeraldo',
    label: 'Mondo di smeraldo',
    blurb: 'Cielo verde, erba turchese, tre soli e guglie che si avvitano.',
    fantasy: true,
    terrain: 'hills',
    seed: 1404,
    seaLevel: 0,
    waterLevel: -20,
    waterKind: 'emerald',
    startHeightOffset: 1.7,
    hills: { amp: 58, freq: 0.0015, oct: 6, medAmp: 6.0, medFreq: 0.011, microAmp: 0.8 },
    snowLine: 9999,
    seasonal: false,
    skyTint: [0.62, 1.12, 0.80],
    sunTint: [0.96, 1.02, 0.86],
    nightSky: [0.0012, 0.0026, 0.0018],
    moonBright: 1.6,
    extraSuns: 2,
    ambientBoost: 1.1,
    palette: {
      grassLow: 0x14584c, grassHigh: 0x2f8068, grassDry: 0x54907a,
      dirt: 0x7a6238, rock: 0x9a7a44, rockDark: 0x6c5530,
      sand: 0xb49a5c, snow: 0xeafaf0, underwater: 0x134a38
    },
    sky: { turbidity: 2.2, rayleigh: 1.15, mie: 0.0048, mieG: 0.79, groundAlbedo: [0.14, 0.28, 0.20] },
    fog: { density: 0.0030, heightFalloff: 0.0055, tint: [0.86, 1.06, 0.92] },
    ambience: { hemiSky: 0x7ad8a0, hemiGround: 0x4a5a30, bounce: 0.42 },
    scatter: [
      { type: 'ajisaTree', density: 0.0050, radius: 320, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.7, 1.30], tilt: 0.05, tint: [0x2a8a6a, 0x5ec49a], shadow: true },
      { type: 'spiralRock', density: 0.0028, radius: 300, slope: [0, 0.8], height: [-99, 999], moisture: [0, 1], scale: [0.7, 2.1], tilt: 0.06, tint: [0x8a6c3c, 0xc0a068], shadow: true },
      { type: 'rock', density: 0.012, radius: 170, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.45, tint: [0x7a6238, 0xa8895a] },
      { type: 'boulder', density: 0.0018, radius: 260, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.85, 1.9], tilt: 0.3, tint: [0x7a6238, 0xa8895a], shadow: true },
      { type: 'bush', density: 0.012, radius: 140, slope: [0, 0.6], height: [-99, 999], moisture: [0.2, 1], scale: [0.6, 1.3], tilt: 0.07, tint: [0x1f6a4e, 0x3a9068] },
      { type: 'grassTuft', density: 2.1, radius: 38, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x2f9c74, 0x64c8a0], grass: true }
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
      { type: 'broadleaf', density: 0.0016, radius: 150, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [1.0, 1.6], tilt: 0.04, tint: [0x2f6420, 0x548034], shadow: true },
      { type: 'slabRock', density: 0.0035, radius: 140, slope: [0, 0.9], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.8], tilt: 0.18, tint: [0x6c6860, 0x8e8a80], shadow: true },
      { type: 'rock', density: 0.014, radius: 120, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.4], tilt: 0.45, tint: [0x64615a, 0x86827a] },
      { type: 'bush', density: 0.014, radius: 110, slope: [0, 0.6], height: [-99, 999], moisture: [0, 1], scale: [0.6, 1.2], tilt: 0.07, tint: [0x35601f, 0x54802e] },
      { type: 'flower', density: 0.05, radius: 55, slope: [0, 0.45], height: [-99, 999], moisture: [0, 1], scale: [0.8, 1.4], tilt: 0.12, tint: [0xf0e05a, 0xf8f8f8] },
      { type: 'grassTuft', density: 2.6, radius: 40, slope: [0, 0.62], height: [-99, 999], moisture: [0, 1], scale: [0.7, 1.2], tilt: 0.08, tint: [0x5a9c34, 0x8cbe4c], grass: true }
    ]
  }
,

  /* ================================================================ *
   * SECONDA ONDATA
   * ================================================================ */

  pandora: {
    id: 'pandora', label: 'Mondo di Pandora', fantasy: true,
    blurb: 'Giungla che brilla al buio e rocce sospese in aria.',
    terrain: 'hills', seed: 1707, seaLevel: 0,
    waterLevel: -22, waterKind: 'emerald', startHeightOffset: 1.7,
    hills: { amp: 66, freq: 0.0014, oct: 6, medAmp: 7.0, medFreq: 0.012, microAmp: 0.9 },
    snowLine: 9999, seasonal: false,
    skyTint: [1.05, 0.94, 1.16], sunTint: [1.02, 0.98, 1.05],
    nightSky: [0.0030, 0.0038, 0.0060], moonBright: 2.0, ambientBoost: 1.1,
    planet: { dir: [0.55, 0.42, -0.72], size: 0.105, color: [0.38, 0.30, 0.62] },
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
      { type: 'glowMushroom', density: 0.050, radius: 80, slope: [0, 0.5], height: [-99, 999], moisture: [0.2, 1], scale: [0.9, 2.0], tilt: 0.12, tint: [0x30c8ff, 0xa8f0ff], emissive: 0.28 },
      { type: 'fern', density: 0.055, radius: 90, slope: [0, 0.55], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.6], tilt: 0.10, tint: [0x18563a, 0x2f8050] },
      { type: 'flower', density: 0.045, radius: 65, slope: [0, 0.4], height: [-99, 999], moisture: [0.2, 1], scale: [0.8, 1.4], tilt: 0.12, tint: [0xf070c0, 0x70f0d0], emissive: 0.22 },
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
      { type: 'boulder', density: 0.0055, radius: 300, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.6, 1.4], tilt: 0.35, tint: [0x52504c, 0x7a7770], shadow: true }
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
      { type: 'rock', density: 0.0016, radius: 200, slope: [0, 1], height: [-999, 999], moisture: [0, 1], scale: [0.4, 1.2], tilt: 0.5, tint: [0x8e8a80, 0xb4b0a4] }
    ]
  },

  fiordi: {
    id: 'fiordi', label: 'Fiordi', fantasy: false,
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
      { type: 'grassTuft', density: 0.55, radius: 38, slope: [0, 0.55], height: [-99, 999], moisture: [0.3, 1], scale: [0.6, 1.1], tilt: 0.12, tint: [0x7a7040, 0x968a52], grass: true }
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
      { type: 'conifer', density: 0.0038, radius: 300, slope: [0, 0.55], height: [4, 999], moisture: [0.3, 1], scale: [0.6, 1.15], tilt: 0.05, tint: [0x24401c, 0x3f5f28], shadow: true },
      { type: 'deadTree', density: 0.0026, radius: 260, slope: [0, 0.5], height: [-2, 999], moisture: [0, 0.6], scale: [0.6, 1.1], tilt: 0.14, tint: [0x9a9284, 0xbdb5a5], shadow: true },
      { type: 'rock', density: 0.020, radius: 180, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.5, 1.6], tilt: 0.5, tint: [0x8e7c50, 0xb8a370] },
      { type: 'dryBush', density: 0.010, radius: 150, slope: [0, 0.5], height: [2, 999], moisture: [0, 1], scale: [0.6, 1.2], tilt: 0.10, tint: [0x7a7040, 0x968a52] },
      { type: 'grassTuft', density: 1.2, radius: 38, slope: [0, 0.55], height: [1, 999], moisture: [0.2, 1], scale: [0.6, 1.15], tilt: 0.10, tint: [0x5c6e2a, 0x8a8a40], grass: true }
    ]
  },

  ghiaccio: {
    id: 'ghiaccio', label: 'Regno di ghiaccio', fantasy: true,
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
      { type: 'grassTuft', density: 3.0, radius: 40, slope: [0, 0.6], height: [-99, 999], moisture: [0.1, 1], scale: [0.6, 1.05], tilt: 0.06, tint: [0x5a9c30, 0x8cbc48], grass: true }
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
      { type: 'boulder', density: 0.0040, radius: 320, slope: [0, 1], height: [-99, 999], moisture: [0, 1], scale: [0.85, 2.0], tilt: 0.35, tint: [0x1c1917, 0x38322e], shadow: true }
    ]
  }
};

export const BIOME_ORDER = [
  // reali
  'foresta', 'deserto', 'citta', 'alpino', 'costa', 'artico', 'savana', 'vulcanico', 'palude',
  'canyonrosso', 'giungla', 'bambu', 'salar', 'fiordi', 'geyser',
  // immaginari
  'boscostregato', 'boscofatato', 'isolecielo', 'smeraldo', 'collegio', 'pianetino',
  'pandora', 'marte', 'luna', 'desolata', 'neon', 'ghiaccio', 'contea', 'ombra'
];

export function getBiome(id) {
  return BIOMES[id] || BIOMES.foresta;
}
export function getWeather(id) {
  return WEATHERS.find(w => w.id === id) || WEATHERS[0];
}
export function getSeason(id) {
  return SEASONS.find(s => s.id === id) || SEASONS[1];
}
