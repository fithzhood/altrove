/* Altrove - dev/shots.js
 * Strumento di collaudo, non fa parte dell app.
 *
 * Renderizza una lista di vedute (bioma + meteo + ora + posizione) dentro un
 * unico foglio a griglia, cosi si giudica tutto insieme invece di guardare una
 * schermata per volta.
 *
 * Uso dalla console:
 *   const m = await import('/dev/shots.js'); await m.sheet(m.PRESET_BIOMI);
 */

const A = () => window.__altrove;

function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }
async function frames(n) { for (let i = 0; i < n; i++) await nextFrame(); }

async function waitBuild(maxFrames = 900) {
  for (let i = 0; i < maxFrames; i++) {
    await nextFrame();
    const t = A().terrain;
    if (t && t.queue.length === 0 && document.getElementById('loading').classList.contains('hidden')) {
      return true;
    }
  }
  return false;
}

/* Applica un caso e aspetta che il mondo si assesti */
export async function applyCase(c) {
  const a = A();
  const st = a.state;
  const changedWorld = (c.biome && c.biome !== st.biomeId) || (c.seed && c.seed !== st.seed);

  if (c.biome) st.biomeId = c.biome;
  if (c.seed) st.seed = c.seed;
  if (c.season) st.seasonId = c.season;
  if (c.hour !== undefined) st.hour = c.hour;
  if (c.latitude !== undefined) st.latitude = c.latitude;
  if (c.moonPhase !== undefined) st.moonPhase = c.moonPhase;
  if (c.aurora !== undefined) st.aurora = c.aurora;
  if (c.wind !== undefined) st.wind = c.wind;
  if (c.weather) {
    st.weatherId = c.weather;
    // salta la transizione morbida: qui serve lo stato finale
    document.querySelector(`[data-weather="${c.weather}"]`).click();
    const W = a.WEATHERS ? a.WEATHERS : null;
  }
  st.autoTime = false;

  if (changedWorld) {
    window.__rebuild();
    await waitBuild();
  }

  if (c.x !== undefined) {
    a.controls.teleport(c.x, c.z, c.up || 0.4);
    a.terrain.lastCx = null;
    await waitBuild();
  } else if (c.respawn) {
    const s = a.world.findSpawn();
    a.controls.teleport(s.x, s.z, 0.4);
    a.terrain.lastCx = null;
    await waitBuild();
  }
  if (c.fly !== undefined) { st.fly = c.fly; a.controls.fly = c.fly; }
  if (c.y !== undefined) a.controls.pos.y = a.world.height(a.controls.pos.x, a.controls.pos.z) + c.y;
  if (c.yaw !== undefined) a.controls.yaw = c.yaw;
  if (c.pitch !== undefined) a.controls.pitch = c.pitch;

  // il meteo si interpola: lo forzo a destinazione
  window.__snapWeather();
  // e l esposizione automatica ha bisogno di qualche fotogramma
  a.engine.adaptPrimed = false;
  await frames(c.settle || 26);
}

export async function sheet(cases, opts = {}) {
  const cols = opts.cols || 3;
  const tw = opts.tileW || 460;
  const th = opts.tileH || 285;
  const a = A();

  document.getElementById('hud').classList.add('faded');
  document.getElementById('crosshair').classList.add('hidden');
  document.getElementById('panel-tab').classList.add('hide');
  document.getElementById('panel').classList.add('closed');

  const rows = Math.ceil(cases.length / cols);
  let out = document.getElementById('__sheet');
  if (out) out.remove();
  out = document.createElement('canvas');
  out.id = '__sheet';
  out.width = tw * cols; out.height = th * rows;
  out.style.cssText = `position:fixed;left:0;top:0;z-index:9999;width:${tw * cols}px;max-width:100vw;height:auto;background:#000`;
  const ctx = out.getContext('2d');

  // porta il renderer alla dimensione della cella
  const oldW = window.innerWidth, oldH = window.innerHeight;
  a.engine.setSize(tw, th, 1);
  a.camera.aspect = tw / th;
  a.camera.updateProjectionMatrix();

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    await applyCase(c);
    const cx = (i % cols) * tw, cy = ((i / cols) | 0) * th;
    ctx.drawImage(a.engine.renderer.domElement, cx, cy, tw, th);
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(cx, cy + th - 20, tw, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '12px ui-monospace, monospace';
    const lab = c.label || `${c.biome || a.state.biomeId} / ${c.weather || a.state.weatherId} / ${(c.hour ?? a.state.hour).toFixed(1)}h`;
    ctx.fillText(lab, cx + 7, cy + th - 6);
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.strokeRect(cx + .5, cy + .5, tw - 1, th - 1);
  }

  document.body.appendChild(out);
  a.engine.setSize(oldW, oldH, Math.min(devicePixelRatio || 1, 2));
  a.camera.aspect = oldW / oldH;
  a.camera.updateProjectionMatrix();
  return 'pronto';
}

export function clear() {
  const o = document.getElementById('__sheet');
  if (o) o.remove();
  document.getElementById('hud').classList.remove('faded');
  document.getElementById('crosshair').classList.remove('hidden');
  document.getElementById('panel-tab').classList.remove('hide');
}

/* ---- preset ---- */

export const PRESET_BIOMI = [
  { biome: 'foresta', weather: 'sereno', hour: 9.5, respawn: true, yaw: 0.7, pitch: -0.02 },
  { biome: 'deserto', weather: 'sereno', hour: 15.0, respawn: true, yaw: 2.1, pitch: 0.0 },
  { biome: 'citta', weather: 'poconuvoloso', hour: 11.0, respawn: true, yaw: 0.0, pitch: 0.0 },
  { biome: 'alpino', weather: 'sereno', hour: 10.0, respawn: true, yaw: 1.4, pitch: 0.05 },
  { biome: 'costa', weather: 'sereno', hour: 17.5, respawn: true, yaw: 2.6, pitch: -0.02 },
  { biome: 'artico', weather: 'nebbia', hour: 13.0, respawn: true, yaw: 0.3, pitch: 0.0 },
  { biome: 'savana', weather: 'sereno', hour: 18.2, respawn: true, yaw: 3.1, pitch: 0.0 },
  { biome: 'vulcanico', weather: 'coperto', hour: 20.5, respawn: true, yaw: 1.0, pitch: 0.02 },
  { biome: 'palude', weather: 'nebbia', hour: 7.0, respawn: true, yaw: 0.5, pitch: -0.03 }
];

export const PRESET_ORE = [2.0, 5.2, 6.4, 8.0, 12.5, 16.0, 18.6, 19.6, 20.6].map(h => ({
  biome: 'foresta', weather: 'poconuvoloso', hour: h, yaw: 1.55, pitch: 0.06,
  label: `foresta ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
}));

export const PRESET_METEO = ['sereno', 'poconuvoloso', 'coperto', 'pioggia', 'temporale', 'neve', 'nebbia', 'sabbia'].map(w => ({
  biome: 'foresta', weather: w, hour: 13.0, yaw: 1.0, pitch: -0.02, label: 'foresta / ' + w
}));
