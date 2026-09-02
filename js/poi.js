/* Altrove - poi.js
 * Punti di interesse: le cose per cui vale la pena camminare.
 *
 * Un paesaggio si guarda, un luogo si esplora. Perche ci sia qualcosa da
 * esplorare servono mete — la capanna in fondo al bosco, il relitto, il
 * branco — e un modo per sapere da che parte stanno. Questo modulo fa la
 * seconda meta: non piazza niente, RITROVA quello che lo scatter e la fauna
 * hanno gia messo, e lo consegna alla bussola.
 *
 * Il trucco e che lo scatter e una funzione: i centri dei grappoli vengono
 * da un hash della cella di periodo, e la stessa formula, chiamata da qui,
 * restituisce gli stessi centri senza generare nessuna tessera. Per le regole
 * a postazioni (una struttura sola per cella) si applicano nel punto esatto
 * gli stessi filtri dello scatter, quindi bussola e mondo dicono per forza la
 * stessa cosa. Per borghi e cerchi (molti oggetti attorno a un centro) basta
 * che il centro sia in terra ferma e alla quota giusta.
 *
 * Gli animali sono mete che si muovono: il centro del branco se c e, altrimenti
 * l esemplare piu vicino. Si ricalcolano a ogni chiamata, costano niente.
 */

import { clusterCenter, passesRule } from './scatter.js?v=29';

export class Pois {
  constructor(world, biome) {
    this.world = world;
    this.biome = biome;
    this.rules = (biome.scatter || []).filter(r => r.poi && r.cluster);
    this.fixed = biome.pois || [];
    this.range = 900;
    this.fauna = null;
    this._cx = null; this._cz = null;
    this._static = [];
  }

  /* Ricalcolo delle mete fisse. Si rifa quando il giocatore si e spostato di
   * qualche decina di metri: e un giro su poche celle, non su tessere. */
  _refresh(cx, cz) {
    const out = [];
    for (const rule of this.rules) {
      const K = rule.cluster, P = K.period;
      // le piramidi si vedono da tre chilometri: il raggio e della regola
      const R = rule.poi.range || this.range;
      const k0x = Math.floor((cx - R) / P), k1x = Math.floor((cx + R) / P);
      const k0z = Math.floor((cz - R) / P), k1z = Math.floor((cz + R) / P);
      for (let kz = k0z; kz <= k1z; kz++) {
        for (let kx = k0x; kx <= k1x; kx++) {
          const [vx, vz] = clusterCenter(K, kx, kz);
          if (K.slots) {
            for (const sl of K.slots) {
              const x = vx + sl[0], z = vz + sl[1];
              if (!passesRule(this.world, rule, x, z)) continue;
              out.push({ x, z, label: rule.poi.label, icon: rule.poi.icon, kind: 'struct', range: R });
              if (rule.poi.first) break;   // a Giza basta un segnale per tre piramidi
            }
          } else {
            if (!passesRule(this.world, rule, vx, vz, true)) continue;
            out.push({ x: vx, z: vz, label: rule.poi.label, icon: rule.poi.icon, kind: 'struct', range: R });
          }
        }
      }
    }
    for (const f of this.fixed) out.push({ x: f.x, z: f.z, label: f.label, icon: f.icon, kind: 'fixed', range: f.range || 3000 });
    this._static = out;
  }

  /* Le mete entro il raggio, dalla piu vicina. Al massimo due per tipo e
   * dieci in tutto: dodici igloo sulla bussola sono rumore, e coprirebbero
   * l unica capanna della strega che sta piu in la. */
  list(cx, cz) {
    if (this._cx === null || Math.hypot(cx - this._cx, cz - this._cz) > 40) {
      this._refresh(cx, cz);
      this._cx = cx; this._cz = cz;
    }
    const out = [];
    for (const p of this._static) {
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d <= p.range) out.push({ x: p.x, z: p.z, label: p.label, icon: p.icon, kind: p.kind, d });
    }
    if (this.fauna) {
      for (const K of this.fauna.kinds) {
        const poi = K.rule.poi;
        if (!poi) continue;
        let x, z;
        if (K.rule.herd && K.hx !== undefined && K.agents.some(a => a.alive)) {
          x = K.hx; z = K.hz;
        } else {
          let best = null, bd = 1e9;
          for (const a of K.agents) {
            if (!a.alive) continue;
            const d = Math.hypot(a.x - cx, a.z - cz);
            if (d < bd) { bd = d; best = a; }
          }
          if (!best) continue;
          x = best.x; z = best.z;
        }
        out.push({ x, z, label: poi.label, icon: poi.icon, kind: 'fauna', d: Math.hypot(x - cx, z - cz) });
      }
    }
    out.sort((a, b) => a.d - b.d);
    const seen = {}, kept = [];
    for (const p of out) {
      seen[p.label] = (seen[p.label] || 0) + 1;
      if (seen[p.label] > 2) continue;
      kept.push(p);
      if (kept.length >= 10) break;
    }
    return kept;
  }
}
