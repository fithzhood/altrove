/* Altrove - main.js
 * Mette insieme i pezzi: stato, interfaccia, ciclo di disegno.
 */

import * as THREE from '../vendor/three.module.js';
import { BIOMES, BIOME_ORDER, WEATHERS, SEASONS, TIME_PRESETS, FAUNA, getBiome, getWeather, getSeason } from './biomes.js?v=14';
import { Fauna } from './fauna.js?v=14';

/* Colore dell acqua profonda per tipo, per quando il bioma non lo dichiara. */
const WATER_DEEP = {
  sea: [0.010, 0.055, 0.085], lake: [0.014, 0.045, 0.055], swamp: [0.012, 0.024, 0.011],
  ice: [0.30, 0.44, 0.52], lava: [0.045, 0.008, 0.003], cloudsea: [0.42, 0.46, 0.52],
  emerald: [0.020, 0.075, 0.055], mirror: [0.30, 0.32, 0.36], hotspring: [0.03, 0.22, 0.26],
  reef: [0.020, 0.10, 0.14]
};
import { World, hexToSrgbArr, hexToLinear as hexToLinearArr } from './world.js?v=14';
import { SkySystem } from './sky.js?v=14';
import { FogSystem } from './fog.js?v=14';
import { Engine } from './engine.js?v=14';
import { Terrain } from './terrain.js?v=14';
import { Atmosphere, makeWeatherState, blendWeather } from './atmosphere.js?v=14';
import { FirstPersonControls } from './controls.js?v=14';
import { Scatter } from './scatter.js?v=14';
import { Water } from './water.js?v=14';
import { Precipitation } from './weather.js?v=14';
import { City } from './city.js?v=14';
import { Castle } from './castle.js?v=14';
import { Waterfalls } from './waterfall.js?v=14';
import { Library } from './library.js?v=14';
import { clamp, lerp, saturate } from './noise.js?v=14';

/* ------------------------------------------------------------------ *
 * Versione: viene dal ?v=N sul tag script, cosi la schermata iniziale
 * dichiara sempre quale build sta davvero girando.
 * ------------------------------------------------------------------ */
const BUILD = (() => {
  const s = document.querySelector('script[src*="main.js"]');
  const m = s && s.src.match(/[?&]v=(\d+)/);
  return m ? m[1] : '?';
})();
document.getElementById('brand-build').textContent = 'build ' + BUILD;
document.getElementById('start-build').textContent = 'build ' + BUILD;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ *
 * Stato
 * ------------------------------------------------------------------ */
const SEASON_DAY = { primavera: 110, estate: 172, autunno: 288, inverno: 356 };

const state = {
  biomeId: 'foresta',
  seed: 1 + Math.floor(Math.random() * 99999),
  weatherId: 'sereno',
  hour: 12.5,
  autoTime: false,
  timeSpeed: 6,          // minuti reali per giornata simulata
  seasonId: 'estate',
  latitude: 44,
  wind: 0.4,
  moonPhase: 0.62,
  aurora: false,
  quality: 'alto',
  fly: false,
  speed: 1,
  fov: 72,
  sens: 1,
  headbob: true,
  photo: false,
  hudHidden: false,
  snowCover: 0,
  wetness: 0,
  under: false,
  time: 0
};

const QUALITY = {
  basso: { pr: 0.68, shadow: false, scatter: 0.35, levels: 4, detail: 0.5, fxaa: true },
  medio: { pr: 0.85, shadow: true, scatter: 0.65, levels: 5, detail: 0.8, fxaa: true },
  alto: { pr: 1.0, shadow: true, scatter: 1.0, levels: 5, detail: 1.0, fxaa: true },
  ultra: { pr: 1.0, shadow: true, scatter: 1.45, levels: 5, detail: 1.0, fxaa: true }
};

/* ------------------------------------------------------------------ *
 * Avvio del motore
 * ------------------------------------------------------------------ */
const canvas = $('view');
let engine, sky, fog, scene, camera, controls, atmo, terrain, world, scatter, water, precip, city, castle, fauna, falls, library;
let wxState, wxTarget;

function fatal(msg) {
  const e = $('start-error');
  e.classList.remove('hidden');
  e.innerHTML = '<b>Non riesco ad avviare la grafica 3D.</b><br>' + msg;
  $('enter').disabled = true;
}

try {
  const test = document.createElement('canvas').getContext('webgl2');
  if (!test) throw new Error('WebGL 2 non disponibile in questo browser.');
  engine = new Engine(canvas);
} catch (err) {
  fatal(err.message + '<br><span style="color:#c9a">Serve un browser con WebGL 2 e accelerazione hardware attiva.</span>');
  throw err;
}

scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(state.fov, 1, 0.12, 6000);
sky = new SkySystem(engine.renderer);
fog = new FogSystem();
atmo = new Atmosphere(scene, sky, fog);
precip = new Precipitation(fog);
scene.add(precip.group);
controls = new FirstPersonControls(camera, canvas, null);

wxTarget = getWeather(state.weatherId);
wxState = makeWeatherState(wxTarget);

/* ------------------------------------------------------------------ *
 * Costruzione / ricostruzione del luogo
 * ------------------------------------------------------------------ */
let building = false;

function buildWorld(opts = {}) {
  const biome = getBiome(state.biomeId);
  const q = QUALITY[state.quality];

  if (terrain) { scene.remove(terrain.group); terrain.dispose(); terrain = null; }
  if (scatter) { scene.remove(scatter.group); scatter.dispose(); scatter = null; }
  if (water) { scene.remove(water.group); water.dispose(); water = null; }
  if (city) { scene.remove(city.group); city.dispose(); city = null; }
  if (castle) { scene.remove(castle.group); castle.dispose(); castle = null; }
  if (fauna) { scene.remove(fauna.group); fauna.dispose(); fauna = null; }
  if (falls) { scene.remove(falls.group); falls.dispose(); falls = null; }
  if (library) { scene.remove(library.group); library.dispose(); library = null; }

  world = new World(biome, state.seed);
  controls.setWorld(world);
  precip.setWorld(world);

  terrain = new Terrain(world, fog, { baseSize: 64, div: 32, levels: q.levels });
  scene.add(terrain.group);

  scatter = new Scatter(world, fog, biome, { quality: q.scatter, season: state.seasonId });
  scene.add(scatter.group);

  const faunaList = FAUNA[biome.id] || [];
  if (faunaList.length) {
    fauna = new Fauna(world, fog, { fauna: faunaList, seed: biome.seed },
      { quality: Math.min(1.3, 0.55 + q.scatter * 0.55) });
    scene.add(fauna.group);
  }

  if (biome.city) {
    city = new City(world, fog, {
      radius: 640, lights: q.shadow ? 8 : 4,
      neon: !!biome.neon, tallMul: biome.tallMul || 1
    });
    scene.add(city.group);
  }
  if (biome.castle) {
    castle = new Castle(world, fog);
    scene.add(castle.group);
  }
  if (biome.waterfalls) {
    falls = new Waterfalls(world, fog, biome.waterfalls);
    scene.add(falls.group);
  }
  if (biome.library) {
    library = new Library(world, fog, { radius: 130 });
    scene.add(library.group);
  }
  terrain.uniforms.uCity.value = biome.city ? 1 : 0;

  if (biome.waterLevel !== null && biome.waterLevel !== undefined) {
    water = new Water(world, fog, biome.waterKind || 'lake', biome.waterLevel, { radius: 2600 });
    const bot = biome.palette.sand !== undefined ? biome.palette.sand : biome.palette.dirt;
    const bl = hexToLinearArr(bot);
    water.uniforms.uBottom.value.set(bl[0], bl[1], bl[2]);
    scene.add(water.group);
  }

  if (biome.underwater || biome.openSea) {
    state.fly = true; controls.fly = true;
    controls.flySpeed = biome.underwater ? 7.5 : 14;
    document.querySelectorAll('#movemode .chip').forEach(c =>
      c.classList.toggle('active', c.dataset.mode === 'vola'));
  } else {
    controls.flySpeed = 16;
  }
  const spawn = world.findSpawn();
  controls.teleport(spawn.x, spawn.z, 0.25);
  if (biome.underwater) controls.pos.y = spawn.h;
  camera.position.copy(controls.pos);

  atmo.setQuality(state.quality);
  /* Sul pianetino la curvatura si applica nei nostri shader, ma la passata
   * delle ombre usa il materiale di profondita di three, che non la conosce:
   * le ombre finirebbero staccate dagli oggetti. Meglio nessuna ombra. */
  engine.renderer.shadowMap.enabled = q.shadow && !biome.noShadows;
  precip.setMotes(biome.motes ? biome.motes.amount : 0, biome.motes ? biome.motes.color : null);
  terrain.uniforms.uDetail.value = q.detail;

  applySeason();
  updatePlaceLabel();
  return biome;
}

function applySeason() {
  const biome = getBiome(state.biomeId);
  const season = getSeason(state.seasonId);
  if (!terrain) return;
  const t = biome.seasonal ? season.grassMul : [1, 1, 1];
  terrain.uniforms.uSeasonTint.value.set(t[0], t[1], t[2]);
  if (scatter) scatter.setSeasonTint(t);
  const snowC = biome.palette.snow !== undefined ? hexToSrgbArr(biome.palette.snow) : [0.92, 0.95, 1];
  terrain.uniforms.uSnowColor.value.setRGB(snowC[0] * snowC[0], snowC[1] * snowC[1], snowC[2] * snowC[2]);
  terrain.uniforms.uGlow.value = biome.emberGlow ? 1 : 0;
}

/* Quanta neve c e a terra: parte dalla stagione e dal bioma, poi cresce
 * mentre nevica e si scioglie quando smette. */
function updateGroundCover(dt) {
  const biome = getBiome(state.biomeId);
  const season = getSeason(state.seasonId);
  let base = biome.alwaysSnow || 0;
  if (biome.seasonal) base = Math.max(base, season.snow);
  if (biome.snowLine < 9000 && !biome.alwaysSnow) base = Math.max(base, 0.55);

  const target = clamp(base + wxState.snow * 1.15, 0, 1);
  const rate = wxState.snow > 0.02 ? 0.075 : 0.030;
  state.snowCover += (target - state.snowCover) * (1 - Math.exp(-rate * dt));

  const wTarget = wxState.wetness;
  const wRate = wTarget > state.wetness ? 0.55 : 0.11;
  state.wetness += (wTarget - state.wetness) * (1 - Math.exp(-wRate * dt));

  if (terrain) {
    terrain.uniforms.uSnow.value = state.snowCover;
    terrain.uniforms.uWetness.value = state.wetness * (1 - state.snowCover * 0.8);
    terrain.uniforms.uTime.value = state.time;
  }
  if (scatter) {
    scatter.setSnow(state.snowCover * 0.85);
    scatter.setWetness(state.wetness);
    scatter.setTime(state.time);
    scatter.setWind(0.6, state.wind * (0.4 + wxState.wind));
  }
}

/* ------------------------------------------------------------------ *
 * Interfaccia
 * ------------------------------------------------------------------ */

/* Ogni bioma si presenta con un campione di colore costruito dalla sua stessa
 * tavolozza: cielo sopra, terreno sotto. Nessuna immagine da caricare. */
function biomeSwatch(b) {
  const p = b.palette;
  const hex = (v) => '#' + Math.round(v).toString(16).padStart(6, '0');
  /* Il cielo del campione usa la stessa tinta che il bioma applica alla LUT:
   * cosi Marte e rosa, il mondo di smeraldo e verde e la Luna e nera, senza
   * dover disegnare venti miniature a mano. */
  const t = b.skyTint || [1, 1, 1];
  const dark = b.space ? 0.10 : 1;
  const tint = (base) => {
    const r = Math.min(255, ((base >> 16) & 255) * t[0] * dark);
    const g = Math.min(255, ((base >> 8) & 255) * t[1] * dark);
    const bl = Math.min(255, (base & 255) * t[2] * dark);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  };
  /* Base neutra, non azzurra: moltiplicando un blu per una tinta calda
   * verrebbe fango invece del rosa di Marte. */
  const skyTop = tint(0x6d88a8);
  const skyBot = tint(0xc2d2de);
  const g1 = hex(p.grassHigh !== undefined ? p.grassHigh : p.rock);
  const g2 = hex(p.grassLow !== undefined ? p.grassLow : p.rockDark);
  const acc = hex(p.sand !== undefined ? p.sand : p.rock);
  return `linear-gradient(180deg, ${hex(skyTop)} 0%, ${hex(skyBot)} 40%, ${acc} 44%, ${g1} 60%, ${g2} 100%)`;
}

function makeBiomeCard(id, onPick) {
  const b = BIOMES[id];
  const el = document.createElement('button');
  el.className = 'biome';
  el.dataset.biome = id;
  el.title = b.blurb || b.label;
  el.innerHTML = `<span class="sw" style="background:${biomeSwatch(b)}"></span><span class="nm">${b.label}</span>`;
  if (b.fantasy) el.classList.add('fant');
  el.addEventListener('click', () => onPick(id));
  return el;
}

function refreshBiomeCards() {
  document.querySelectorAll('.biome').forEach(el => {
    el.classList.toggle('active', el.dataset.biome === state.biomeId);
  });
}

function buildBiomeUI() {
  const real = BIOME_ORDER.filter(id => !BIOMES[id].fantasy);
  const fant = BIOME_ORDER.filter(id => BIOMES[id].fantasy);

  const gReal = $('biomes-real'), gFant = $('biomes-fantasy');
  gReal.innerHTML = ''; gFant.innerHTML = '';
  real.forEach(id => gReal.appendChild(makeBiomeCard(id, pickBiome)));
  fant.forEach(id => gFant.appendChild(makeBiomeCard(id, pickBiome)));
  if (!fant.length) gFant.closest('.group').classList.add('hidden');

  const sb = $('start-biomes');
  sb.innerHTML = '';
  if (fant.length) {
    const t1 = document.createElement('div'); t1.className = 'sec-title'; t1.textContent = 'Luoghi reali';
    sb.appendChild(t1);
  }
  real.forEach(id => sb.appendChild(makeBiomeCard(id, pickBiomeStart)));
  if (fant.length) {
    const t2 = document.createElement('div'); t2.className = 'sec-title'; t2.textContent = 'Luoghi immaginari';
    sb.appendChild(t2);
    fant.forEach(id => sb.appendChild(makeBiomeCard(id, pickBiomeStart)));
  }
  refreshBiomeCards();
}

function pickBiomeStart(id) {
  state.biomeId = id;
  refreshBiomeCards();
}

function pickBiome(id) {
  if (id === state.biomeId) return;
  state.biomeId = id;
  refreshBiomeCards();
  rebuildWithLoading();
}

function buildWeatherUI() {
  for (const host of [$('weathers'), $('start-weathers')]) {
    host.innerHTML = '';
    WEATHERS.forEach(w => {
      const c = document.createElement('button');
      c.className = 'chip' + (w.id === state.weatherId ? ' active' : '');
      c.dataset.weather = w.id;
      c.textContent = w.label;
      c.addEventListener('click', () => setWeather(w.id));
      host.appendChild(c);
    });
  }
}

function setWeather(id) {
  state.weatherId = id;
  wxTarget = getWeather(id);
  document.querySelectorAll('[data-weather]').forEach(el =>
    el.classList.toggle('active', el.dataset.weather === id));
  $('hud-weather').textContent = wxTarget.label;
  toast(wxTarget.label);
}

function buildTimePresets() {
  const host = $('time-presets');
  host.innerHTML = '';
  TIME_PRESETS.forEach(p => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = p.label;
    c.addEventListener('click', () => { state.hour = p.h; syncHourUI(); });
    host.appendChild(c);
  });
}

function buildSeasonUI() {
  const host = $('seasons');
  host.innerHTML = '';
  SEASONS.forEach(s => {
    const c = document.createElement('button');
    c.className = 'chip' + (s.id === state.seasonId ? ' active' : '');
    c.dataset.season = s.id;
    c.textContent = s.label;
    c.addEventListener('click', () => {
      state.seasonId = s.id;
      document.querySelectorAll('[data-season]').forEach(e =>
        e.classList.toggle('active', e.dataset.season === s.id));
      applySeason();
      toast(s.label);
    });
    host.appendChild(c);
  });
}

function fmtHour(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function syncHourUI() {
  $('hour').value = state.hour;
  $('start-hour').value = state.hour;
  const t = fmtHour(state.hour);
  $('hour-val').textContent = t;
  $('start-hour-val').textContent = t;
  $('hud-clock').textContent = t;
}

const MOON_NAMES = ['nuova', 'falce crescente', 'primo quarto', 'gibbosa crescente', 'piena', 'gibbosa calante', 'ultimo quarto', 'falce calante'];
function moonName(p) { return MOON_NAMES[Math.round(p * 8) % 8]; }

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

function updatePlaceLabel() {
  const b = getBiome(state.biomeId);
  $('hud-place').textContent = b.label;
  $('hud-weather').textContent = getWeather(state.weatherId).label;
}

/* ---- collegamento dei controlli ---- */
function bindSlider(id, valId, apply, fmt) {
  const el = $(id);
  const upd = () => {
    const v = parseFloat(el.value);
    if (valId) $(valId).textContent = fmt ? fmt(v) : v;
    apply(v);
  };
  el.addEventListener('input', upd);
  upd();
}

function bindUI() {
  buildBiomeUI();
  buildWeatherUI();
  buildTimePresets();
  buildSeasonUI();

  $('panel-tab').addEventListener('click', () => togglePanel(true));
  $('panel-close').addEventListener('click', () => togglePanel(false));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === b.dataset.tab));
    });
  });

  $('hour').addEventListener('input', e => { state.hour = parseFloat(e.target.value); state.autoTime = false; $('auto-time').checked = false; syncHourUI(); });
  $('start-hour').addEventListener('input', e => { state.hour = parseFloat(e.target.value); syncHourUI(); });
  $('auto-time').addEventListener('change', e => { state.autoTime = e.target.checked; });
  bindSlider('time-speed', 'time-speed-val', v => state.timeSpeed = v, v => v.toFixed(1));

  bindSlider('latitude', 'latitude-val', v => state.latitude = v, v => Math.round(v) + '°');
  bindSlider('wind', 'wind-val', v => state.wind = v / 100, v => Math.round(v) + '%');
  bindSlider('moon', 'moon-val', v => state.moonPhase = v, v => moonName(v));
  $('aurora').addEventListener('change', e => state.aurora = e.target.checked);

  $('seed').addEventListener('change', e => {
    state.seed = Math.max(1, parseInt(e.target.value) || 1);
    $('seed-val').textContent = state.seed;
    rebuildWithLoading();
  });
  $('reseed').addEventListener('click', () => {
    state.seed = 1 + Math.floor(Math.random() * 99999);
    $('seed').value = state.seed;
    $('seed-val').textContent = state.seed;
    rebuildWithLoading();
  });
  $('respawn').addEventListener('click', () => {
    if (!world) return;
    const a = Math.random() * Math.PI * 2, r = 300 + Math.random() * 900;
    let x = controls.pos.x + Math.cos(a) * r, z = controls.pos.z + Math.sin(a) * r;
    controls.teleport(x, z, 0.3);
    terrain.lastCx = null;
    toast('Altrove');
  });

  document.querySelectorAll('#movemode .chip').forEach(c => {
    c.addEventListener('click', () => {
      setFly(c.dataset.mode === 'vola');
    });
  });
  bindSlider('speed', 'speed-val', v => { state.speed = v; controls.speedScale = v; }, v => v.toFixed(1) + '×');
  bindSlider('fov', 'fov-val', v => { state.fov = v; camera.fov = v; camera.updateProjectionMatrix(); }, v => Math.round(v) + '°');
  bindSlider('sens', 'sens-val', v => { state.sens = v; controls.sensitivity = 0.0022 * v; }, v => v.toFixed(2));
  $('headbob').addEventListener('change', e => { state.headbob = e.target.checked; });

  document.querySelectorAll('#quality .chip').forEach(c => {
    c.addEventListener('click', () => {
      state.quality = c.dataset.q;
      document.querySelectorAll('#quality .chip').forEach(x => x.classList.toggle('active', x === c));
      applyQuality();
    });
  });

  const S = engine.settings;
  bindSlider('exposure', 'exposure-val', v => S.exposure = Math.pow(2, v), v => (v >= 0 ? '+' : '') + v.toFixed(2));
  $('auto-exposure').addEventListener('change', e => S.autoExposure = e.target.checked);
  bindSlider('bloom', 'bloom-val', v => S.bloom = v / 100, v => Math.round(v) + '%');
  bindSlider('saturation', 'saturation-val', v => S.saturation = v / 100, v => Math.round(v) + '%');
  bindSlider('contrast', 'contrast-val', v => S.contrast = v / 100, v => Math.round(v) + '%');
  bindSlider('vignette', 'vignette-val', v => S.vignette = v / 100, v => Math.round(v) + '%');
  bindSlider('grain', 'grain-val', v => S.grain = v / 1000, v => Math.round(v));
  bindSlider('chromatic', 'chromatic-val', v => S.chromatic = v / 100, v => Math.round(v) + '%');
  $('dof').addEventListener('change', e => S.dof = e.target.checked ? 1 : 0);
  bindSlider('focus', 'focus-val', v => S.focusDist = v, v => Math.round(v) + ' m');
  bindSlider('aperture', 'aperture-val', v => S.aperture = v, v => v.toFixed(2));
  $('shot').addEventListener('click', screenshot);

  $('seed').value = state.seed;
  $('seed-val').textContent = state.seed;
  syncHourUI();
}

function setFly(on) {
  state.fly = on;
  controls.fly = on;
  document.querySelectorAll('#movemode .chip').forEach(c =>
    c.classList.toggle('active', (c.dataset.mode === 'vola') === on));
  toast(on ? 'Volo libero' : 'A piedi');
}

function applyQuality() {
  const q = QUALITY[state.quality];
  engine.renderer.shadowMap.enabled = q.shadow;
  engine.settings.fxaa = q.fxaa;
  atmo.setQuality(state.quality);
  if (terrain) terrain.uniforms.uDetail.value = q.detail;
  resize();
  if (terrain && terrain.levels !== q.levels) rebuildWithLoading();
  toast('Qualità ' + state.quality);
}

let panelOpen = false;
function togglePanel(open) {
  panelOpen = open === undefined ? !panelOpen : open;
  $('panel').classList.toggle('closed', !panelOpen);
  $('panel-tab').classList.toggle('hide', panelOpen);
  if (panelOpen) controls.releaseLock();
}

/* ------------------------------------------------------------------ *
 * Caricamento
 * ------------------------------------------------------------------ */
let loadJob = null;

function rebuildWithLoading() {
  if (building) return;
  building = true;
  $('loading').classList.remove('hidden');
  $('load-bar').style.width = '0%';
  $('load-label').textContent = 'Sto costruendo ' + getBiome(state.biomeId).label.toLowerCase();
  const biome = buildWorld();
  loadJob = { done: 0, total: 1 };
  // il terreno si costruisce nei fotogrammi successivi, con la barra che avanza
  terrain.update(controls.pos.x, controls.pos.z, 0);
  loadJob.total = Math.max(1, terrain.queue.length);
  loadJob.phase = 'terreno';
}

function stepLoading() {
  if (!loadJob) return;
  if (loadJob.phase === 'terreno') {
    const left = terrain.update(controls.pos.x, controls.pos.z, 5);
    const done = loadJob.total - left;
    $('load-bar').style.width = Math.round(58 * clamp(done / loadJob.total, 0, 1)) + '%';
    if (left === 0) {
      loadJob.phase = 'vegetazione';
      $('load-label').textContent = 'Sto piantando la vegetazione';
    }
    return;
  }
  // seconda fase: vegetazione e, se serve, edifici
  const pending = scatter.update(controls.pos.x, controls.pos.z, 26)
    || (city ? city.update(controls.pos.x, controls.pos.z, 6) : false)
    || (library ? library.update(controls.pos.x, controls.pos.z, 8) : false);
  loadJob.scatterSteps = (loadJob.scatterSteps || 0) + 1;
  $('load-bar').style.width = Math.round(58 + 42 * clamp(loadJob.scatterSteps / 24, 0, 1)) + '%';
  if (!pending) {
    if (water) water.updateDepth(controls.pos.x, controls.pos.z, true);
    loadJob = null;
    building = false;
    $('loading').classList.add('hidden');
    // riposiziona: il terreno ora esiste davvero
    controls.pos.y = world.height(controls.pos.x, controls.pos.z) + controls.eyeHeight;
  }
}

/* ------------------------------------------------------------------ *
 * Schermata iniziale
 * ------------------------------------------------------------------ */
let started = false;

$('enter').addEventListener('click', () => {
  if (started) return;
  started = true;
  $('start').classList.add('leaving');
  setTimeout(() => $('start').classList.add('hidden'), 520);
  $('hud').classList.remove('hidden');
  $('crosshair').classList.remove('hidden');
  controls.enabled = true;
  rebuildWithLoading();
  setTimeout(() => controls.requestLock(), 120);
});

controls.onLockChange = (locked) => {
  canvas.classList.toggle('locked', locked);
  if (locked && panelOpen) togglePanel(false);
};

canvas.addEventListener('click', () => {
  if (started && !panelOpen && !controls.locked) controls.requestLock();
});

/* ------------------------------------------------------------------ *
 * Tasti
 * ------------------------------------------------------------------ */
document.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'Tab') { e.preventDefault(); togglePanel(); }
  else if (e.code === 'KeyF') setFly(!state.fly);
  else if (e.code === 'KeyH') {
    state.hudHidden = !state.hudHidden;
    $('hud').classList.toggle('faded', state.hudHidden);
    $('crosshair').classList.toggle('hidden', state.hudHidden);
    $('panel-tab').classList.toggle('hide', state.hudHidden || panelOpen);
  }
  else if (e.code === 'KeyP') setPhoto(!state.photo);
  else if (e.code === 'KeyC') screenshot();
});

function setPhoto(on) {
  state.photo = on;
  const S = engine.settings;
  S.dof = on ? (parseFloat($('aperture').value) > 0 ? 1 : 0) : ($('dof').checked ? 1 : 0);
  $('hud').classList.toggle('faded', on || state.hudHidden);
  $('crosshair').classList.toggle('hidden', on || state.hudHidden);
  $('panel-tab').classList.toggle('hide', on || panelOpen);
  if (on) { $('dof').checked = true; S.dof = 1; }
  toast(on ? 'Modalità foto' : 'Modalità foto disattivata');
}

function screenshot() {
  try {
    const name = `altrove-${state.biomeId}-${state.weatherId}-${fmtHour(state.hour).replace(':', '')}.png`;
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Immagine salvata');
    }, 'image/png');
  } catch (err) {
    toast('Non riesco a salvare l’immagine');
  }
}

/* ------------------------------------------------------------------ *
 * Ridimensionamento
 * ------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const q = QUALITY[state.quality];
  const pr = Math.min(window.devicePixelRatio || 1, 2) * q.pr;
  engine.setSize(w, h, pr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ *
 * Bussola
 * ------------------------------------------------------------------ */
const COMPASS_MARKS = [];
(function buildCompass() {
  const strip = $('compass-strip');
  const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
  let html = '';
  // tre giri, cosi lo scorrimento non mostra mai i bordi
  for (let rep = -1; rep <= 1; rep++) {
    for (let a = 0; a < 360; a += 15) {
      const l = labels[a];
      html += `<i class="${l ? 'card' : ''}">${l || '&middot;'}</i>`;
    }
  }
  strip.innerHTML = html;
})();

function updateCompass(yaw) {
  // yaw 0 = verso -Z = nord
  let deg = (-yaw * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const perMark = 60;               // px per tacca (15 gradi)
  const x = -(deg / 15) * perMark - 360 / 15 * perMark + 150;
  $('compass-strip').style.transform = `translateX(${x}px)`;
}

/* ------------------------------------------------------------------ *
 * Ciclo
 * ------------------------------------------------------------------ */
let last = performance.now();
let fpsAcc = 0, fpsCount = 0, fpsShown = 0, perfTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  state.time += dt;

  if (!started) { renderIdle(dt); return; }
  if (loadJob) { stepLoading(); }

  // ora del giorno
  if (state.autoTime) {
    state.hour = (state.hour + dt * (24 / (state.timeSpeed * 60))) % 24;
    syncHourUI();
  }

  // meteo: transizione morbida
  blendWeather(wxState, wxTarget, 1 - Math.exp(-dt * 0.42));
  updateGroundCover(dt);

  controls.bobAmountLimit = state.headbob ? 1 : 0;
  if (!state.headbob) controls.bobAmount = 0;
  controls.update(dt);

  const biome = getBiome(state.biomeId);
  atmo.update({
    biome, weather: wxState,
    hour: state.hour, latitude: state.latitude,
    dayOfYear: SEASON_DAY[state.seasonId] || 172,
    moonPhase: state.moonPhase,
    time: state.time,
    windDir: 0.6, windScale: 0.35 + state.wind * 1.6,
    aurora: (state.aurora || biome.aurora) ? 1 : 0,
    lightPollution: biome.lightPollution !== undefined ? biome.lightPollution : (biome.city ? 0.55 : 0),
    nightSky: biome.nightSky || [0.0015, 0.0022, 0.0044],
    moonBright: biome.moonBright || 1,
    ambientBoost: biome.ambientBoost || 1,
    sunBoost: biome.sunBoost || 1,
    stars: biome.space ? 1.6 : 1,
    farFade: biome.farFade || (terrain ? terrain.radius * 0.92 : 2600),
    fogBaseY: biome.waterLevel || 0
  }, dt, camera);

  // curvatura del mondo: zero ovunque tranne sul pianetino
  fog.set({ curve: biome.curve || 0 });

  /* Immersione. Sotto il pelo dell acqua cambia tutto: la nebbia diventa
   * l acqua stessa e si chiude in pochi metri, il colore vira, la pioggia non
   * si vede piu e al suo posto scende il nevischio marino. */
  const wl = biome.waterLevel;
  const hasW = wl !== null && wl !== undefined;
  const under = hasW && camera.position.y < wl - 0.12;
  if (under !== state.under) {
    state.under = under;
    if (under) toast('Sott\u2019acqua');
  }
  const deep = biome.water && biome.water.deep !== undefined
    ? hexToLinearArr(biome.water.deep)
    : (WATER_DEEP[biome.waterKind] || [0.02, 0.08, 0.11]);
  fog.set({
    waterY: hasW ? wl : -1e9,
    caustics: hasW ? (biome.caustics !== undefined ? biome.caustics : 0.55) : 0,
    underwater: under ? 1 : 0,
    deepColor: deep,
    time: state.time
  });
  if (under) {
    fog.set({ density: 0.055 + (biome.underwaterFog || 0), falloff: 0.0, max: 1.0, start: 0.6 });
    engine.settings.saturation = (parseFloat($('saturation').value) / 100) * 0.86;
    engine.settings.chromatic = (parseFloat($('chromatic').value) / 100) * 1.5;
  } else {
    engine.settings.saturation = parseFloat($('saturation').value) / 100;
    engine.settings.chromatic = parseFloat($('chromatic').value) / 100;
  }

  if (terrain) terrain.update(controls.pos.x, controls.pos.z, loadJob ? 4 : 2);
  if (scatter && !loadJob) scatter.update(controls.pos.x, controls.pos.z, 3);
  if (water) {
    water.update(camera, state.time, atmo.sunDir, atmo.sunColor, sky.lut.texture,
      state.wind * (0.4 + wxState.wind), dt);
  }
  if (state.under) {
    precip.setMotes(0.55, [0.85, 0.92, 0.95]);
    precip.update(camera, state.time, { ...wxState, rain: 0, snow: 0, dust: 0 }, atmo, dt);
  } else {
    precip.setMotes(biome.motes ? biome.motes.amount : 0, biome.motes ? biome.motes.color : null);
    precip.update(camera, state.time, wxState, atmo, dt);
  }
  if (fauna) {
    fauna.update(camera, dt, state.time, biome.waterLevel);
    fauna.setSnow(state.snowCover * 0.7);
    fauna.setWetness(state.wetness);
  }
  if (falls) falls.update(controls.pos.x, controls.pos.z, state.time, atmo.sunColor, atmo.ambientColor);
  if (library && !loadJob) { library.update(controls.pos.x, controls.pos.z, 2); library.setTime(state.time); }
  if (castle) castle.update(atmo.nightness, state.time, state.wetness, state.snowCover);
  if (city) {
    if (!loadJob) city.update(controls.pos.x, controls.pos.z, 2);
    city.setNight(atmo.nightness);
    city.setTime(state.time);
    city.setWetness(state.wetness);
    city.setSnow(state.snowCover);
    city.updateLights(controls.pos.x, controls.pos.z, atmo.nightness);
  }

  // HUD
  if (!state.hudHidden && !state.photo) {
    updateCompass(controls.yaw);
    $('hud-coords').textContent = Math.round(controls.pos.x) + ', ' + Math.round(controls.pos.z);
    $('hud-alt').textContent = Math.round(controls.pos.y) + ' m';
  }
  fpsAcc += dt; fpsCount++;
  perfTimer += dt;
  if (perfTimer > 0.5) {
    fpsShown = Math.round(fpsCount / fpsAcc);
    fpsAcc = 0; fpsCount = 0; perfTimer = 0;
    if (!state.hudHidden && !state.photo) {
      $('hud-perf').innerHTML = fpsShown + ' fps<br>' + (terrain ? terrain.stats.chunks : 0) + ' chunk<br>' +
        (scatter ? (scatter.stats.instances / 1000).toFixed(1) + 'k piante' : '') +
        (fauna && fauna.stats.agents ? '<br>' + fauna.stats.agents + ' animali' : '');
    }
  }

  engine.settings.contrast = (parseFloat($('contrast').value) / 100) * wxState.contrast;
  engine.render(scene, camera, sky, dt, {
    time: state.time,
    sunScreen: atmo.sunScreen,
    sunColor: atmo.sunColor,
    rainStreaks: wxState.rain,
    wetness: state.wetness
  });
}

/* Prima di entrare mostro comunque qualcosa dietro la schermata iniziale */
function renderIdle(dt) {
  engine.render(scene, camera, null, dt, { time: state.time });
}

bindUI();
resize();
setWeather(state.weatherId);
requestAnimationFrame(frame);

window.__altrove = { state, engine, sky, fog, scene, camera, controls, get terrain() { return terrain; }, get world() { return world; }, get scatter() { return scatter; }, get water() { return water; }, get city() { return city; }, get castle() { return castle; }, get fauna() { return fauna; }, get falls() { return falls; }, get library() { return library; }, precip, atmo, THREE };

/* Agganci per lo strumento di collaudo in dev/shots.js */
window.__rebuild = rebuildWithLoading;
window.__snapWeather = () => { wxState = makeWeatherState(wxTarget); };
