/* volta.js — l altro emisfero della Terra cava.
 *
 * Dentro un pianeta cavo la terra non finisce all orizzonte: si alza ai lati
 * e continua sopra la testa. Qui il pavimento e il terreno vero (i chunk di
 * terrain.js, curvati verso l alto dalla curvatura negativa del bioma) e la
 * volta e una copia grossolana del terreno di UN ALTRA regione dello stesso
 * mondo, appesa a quota H e curvata verso il basso. Le due superfici si
 * incontrano a meta quota, e li la nebbia le chiude.
 *
 * La regione della volta e lo specchio del pavimento: il punto (x, z) della
 * volta mostra il terreno di (OFF - x, z). E una rotazione di 180 gradi
 * attorno all asse parallelo a z che passa per (OFF/2, H/2): applicata due
 * volte riporta al punto di partenza, e applicata al giocatore quando
 * supera la meta quota lo porta ESATTAMENTE dove stava vedendo. Percio
 * l attraversamento non si vede: si scambiano pavimento e volta, e cio che
 * era la volta e adesso terreno vero con collisioni, piante e animali (li
 * porta lo streaming dei chunk, che segue la camera). Solo la camera resta a
 * testa in giu, e si raddrizza da sola in qualche secondo.
 *
 * Il sole del posto sta appeso a meta quota, e a meta quota si passa: si
 * attraversa il sole. Il lampo di luce copre lo scambio.
 */
import * as THREE from '../vendor/three.module.js';

const N = 112;                 // celle per lato della griglia della volta
const RAGGIO = 1000;           // metri: mezzo lato coperto
const RIGHE_PER_FOTOGRAMMA = 6;
const SOGLIA_RICENTRA = 6;     // celle di scarto prima di ricampionare

export class Volta {
  constructor(scene, world, terrain, fog, biome) {
    this.world = world;
    this.fog = fog;
    this.H = biome.volta.height;
    this.OFF = biome.volta.offset;
    this.waterLevel = biome.waterLevel || 0;
    this.group = new THREE.Group();
    this.cell = (2 * RAGGIO) / N;
    this.cooldown = 0;
    this.centre = { x: NaN, z: NaN };
    this.job = null;

    /* Lo stesso materiale del terreno, cosi la volta ha gli stessi colori e
     * le stesse screziature: ma con la curvatura a segno opposto, perche
     * deve piegarsi verso il basso mentre il pavimento si piega verso l alto.
     * _makeMaterial registra i suoi uniform sul terreno: li prendo e glieli
     * restituisco. */
    const salvati = terrain.uniforms;
    const mat = terrain._makeMaterial({});
    this.uniforms = terrain.uniforms;
    terrain.uniforms = salvati;
    this.terrainUniforms = salvati;
    mat.userData.altFlip = { value: -1.0 };
    this.material = mat;

    const V = (N + 1) * (N + 1);
    this.pos = new Float32Array(V * 3);
    this.nrm = new Float32Array(V * 3);
    this.col = new Float32Array(V * 3);
    this.ter = new Float32Array(V * 4);
    // buffer di lavoro: si campiona qui a pezzi, e si copia tutto insieme
    this.wPos = new Float32Array(V * 3);
    this.wNrm = new Float32Array(V * 3);
    this.wCol = new Float32Array(V * 3);
    this.wTer = new Float32Array(V * 4);
    this.G = N + 3;
    this.Y = new Float32Array(this.G * this.G);
    this.surf = [0, 0, 0, 0, 0, 0, 0];

    const idx = new Uint32Array(N * N * 6);
    let t = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + (N + 1), d = c + 1;
        /* Avvolgimento inverso rispetto ai chunk: la faccia guarda in giu,
         * verso chi la vede. La normale invece guarda in SU: la luce del
         * sole centrale arriva alla volta da sotto, e per una superficie
         * vista dal lato opposto n·l e lo stesso di (-n)·(-l). Cosi la
         * illumina la stessa luce direzionale del pavimento. */
        idx[t++] = a; idx[t++] = b; idx[t++] = c;
        idx[t++] = b; idx[t++] = d; idx[t++] = c;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aTerrain', new THREE.BufferAttribute(this.ter, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = geo;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = false; mesh.castShadow = false;
    this.mesh = mesh;
    this.group.add(mesh);

    /* L acqua della volta: un piano scuro alla quota specchiata dei laghi.
     * Da un chilometro non si vedono le onde, si vede che le conche sono
     * piene. Stesso trucco della normale verso l alto. */
    {
      const R = RAGGIO * 1.05;
      const p = new Float32Array([-R, 0, -R, R, 0, -R, R, 0, R, -R, 0, R]);
      const n = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(p, 3));
      wg.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      wg.setIndex([0, 2, 1, 0, 3, 2]);   // guarda in giu
      const wm = new THREE.MeshStandardMaterial({ color: 0x163e36, roughness: 0.22, metalness: 0.0 });
      wm.userData.altFlip = { value: -1.0 };
      fog.apply(wm);
      this.water = new THREE.Mesh(wg, wm);
      this.water.frustumCulled = false;
      this.water.position.y = this.H - this.waterLevel;
      this.group.add(this.water);
    }

    /* Il sole centrale: una sfera che brucia, a meta quota. Il cielo lo
     * disegnerebbe dietro la volta, e non si vedrebbe mai. */
    {
      /* La radianza del disco del sole in cielo e uSunColor (circa 23): a
       * quel valore una sfera esce beige e piatta, perche l abbaglio del
       * cielo lo aggiunge la composizione (il glare), non la radianza. Qui
       * la sfera deve bruciare da sola: 140 basta a farla bianca e a far
       * lavorare il bloom senza che l esposizione crolli quando la si guarda. */
      const sg = new THREE.SphereGeometry(30, 48, 32);
      const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(140) });
      sm.toneMapped = false;
      this.sun = new THREE.Mesh(sg, sm);
      this.sun.frustumCulled = false;
      this.group.add(this.sun);
      /* L alone e additivo: con la fusione normale un alone piu scuro dello
       * sfondo HDR diventava un anello nero attorno al sole. */
      const hg = new THREE.SphereGeometry(52, 32, 20);
      const hm = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(2.2),
        transparent: true, opacity: 0.35, depthWrite: false, side: THREE.BackSide,
        blending: THREE.AdditiveBlending
      });
      hm.toneMapped = false;
      this.halo = new THREE.Mesh(hg, hm);
      this.halo.frustumCulled = false;
      this.group.add(this.halo);
    }

    // il primo campionamento e sincrono: al primo fotogramma la volta c e gia
    this._campionaTutto(0, 0);
  }

  /* ---- campionamento ------------------------------------------------ */

  _quotaVolta(x, z) {
    return this.H - this.world.height(this.OFF - x, z);
  }

  _rigaAltezze(cx, cz, j) {
    const G = this.G, c = this.cell, Y = this.Y;
    const z = cz + (j - 1 - N / 2) * c;
    for (let i = 0; i < G; i++) Y[j * G + i] = this._quotaVolta(cx + (i - 1 - N / 2) * c, z);
  }

  _rigaVertici(cx, cz, j, pos, nrm, col, ter) {
    const G = this.G, c = this.cell, Y = this.Y, inv2c = 1 / (2 * c), surf = this.surf;
    const z = cz + (j - N / 2) * c;
    for (let i = 0; i <= N; i++) {
      const vi = j * (N + 1) + i;
      const gi = (j + 1) * G + (i + 1);
      const x = cx + (i - N / 2) * c;
      const y = Y[gi];
      pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
      let nx = (Y[gi - 1] - Y[gi + 1]) * inv2c, ny = 1, nz = (Y[gi - G] - Y[gi + G]) * inv2c;
      const il = 1 / Math.hypot(nx, ny, nz);
      nx *= il; ny *= il; nz *= il;
      nrm[vi * 3] = nx; nrm[vi * 3 + 1] = ny; nrm[vi * 3 + 2] = nz;
      // il colore e quello che il terreno avrebbe li, nella regione specchiata
      this.world.surface(this.OFF - x, z, this.H - y, ny, surf);
      col[vi * 3] = surf[0]; col[vi * 3 + 1] = surf[1]; col[vi * 3 + 2] = surf[2];
      ter[vi * 4] = surf[3]; ter[vi * 4 + 1] = surf[4]; ter[vi * 4 + 2] = surf[5]; ter[vi * 4 + 3] = surf[6];
    }
  }

  _campionaTutto(cx, cz) {
    for (let j = 0; j < this.G; j++) this._rigaAltezze(cx, cz, j);
    for (let j = 0; j <= N; j++) this._rigaVertici(cx, cz, j, this.pos, this.nrm, this.col, this.ter);
    this._segnaAggiornata();
    this.centre.x = cx; this.centre.z = cz;
    this.job = null;
  }

  _segnaAggiornata() {
    const g = this.geo;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aTerrain.needsUpdate = true;
  }

  _snap(v) { return Math.round(v / this.cell) * this.cell; }

  /* Ricampiona a pezzi, qualche riga per fotogramma, in un buffer a parte:
   * la volta che si vede resta intera finche quella nuova non e pronta. */
  _campiona(px, pz) {
    const tx = this._snap(px), tz = this._snap(pz);
    const lontano = (a, b) => Math.abs(a - b) > SOGLIA_RICENTRA * this.cell;
    if (!this.job) {
      if (!lontano(tx, this.centre.x) && !lontano(tz, this.centre.z)) return;
      this.job = { cx: tx, cz: tz, fase: 0, j: 0 };
    } else if (Math.abs(tx - this.job.cx) > 2 * SOGLIA_RICENTRA * this.cell ||
               Math.abs(tz - this.job.cz) > 2 * SOGLIA_RICENTRA * this.cell) {
      this.job = { cx: tx, cz: tz, fase: 0, j: 0 };   // troppo vecchio: ricomincia
    }
    const J = this.job;
    let righe = RIGHE_PER_FOTOGRAMMA;
    while (righe > 0) {
      if (J.fase === 0) {
        if (J.j < this.G) { this._rigaAltezze(J.cx, J.cz, J.j++); righe--; }
        else { J.fase = 1; J.j = 0; }
      } else {
        if (J.j <= N) { this._rigaVertici(J.cx, J.cz, J.j++, this.wPos, this.wNrm, this.wCol, this.wTer); righe--; }
        else {
          this.pos.set(this.wPos); this.nrm.set(this.wNrm); this.col.set(this.wCol); this.ter.set(this.wTer);
          this._segnaAggiornata();
          this.centre.x = J.cx; this.centre.z = J.cz;
          this.job = null;
          return;
        }
      }
    }
  }

  /* ---- ogni fotogramma ---------------------------------------------- */

  /* Torna true quando il giocatore ha attraversato la meta quota ed e stato
   * ribaltato dall altra parte: chi chiama accende il lampo. */
  update(controls, sunDir, dt) {
    this._campiona(controls.pos.x, controls.pos.z);

    // uniform del terreno che cambiano nel tempo: la volta li segue
    const U = this.uniforms, T = this.terrainUniforms;
    for (const k in U) {
      if (!T[k]) continue;
      const v = T[k].value;
      if (typeof v === 'number') U[k].value = v;
      else if (v && v.copy) U[k].value.copy(v);
    }

    const p = controls.pos;
    this.water.position.x = p.x; this.water.position.z = p.z;

    /* Il sole sta a meta quota, nella direzione della luce: chi sale verso
     * di lui lo vede crescere, e a meta quota ci passa dentro. */
    const sy = Math.max(sunDir.y, 0.05);
    const t = Math.max(0, (this.H * 0.5 - p.y) / sy);
    this.sun.position.set(p.x + sunDir.x * t, this.H * 0.5, p.z + sunDir.z * t);
    this.halo.position.copy(this.sun.position);
    // il sole visto da vicino e sempre piu grande: la sfera non deve sparire nel varco
    const vicino = 1 - Math.min(1, Math.abs(p.y - this.H * 0.5) / 140);
    this.halo.material.opacity = 0.35 + vicino * 0.6;

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown <= 0 && p.y > this.H * 0.5 + 0.5) {
      controls.mirror(this.OFF, this.H);
      this.cooldown = 2.0;
      // la volta adesso deve mostrare la regione da cui si viene: subito, non a pezzi
      this._campionaTutto(this._snap(controls.pos.x), this._snap(controls.pos.z));
      return true;
    }
    return false;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
    this.water.geometry.dispose(); this.water.material.dispose();
    this.sun.geometry.dispose(); this.sun.material.dispose();
    this.halo.geometry.dispose(); this.halo.material.dispose();
  }
}
