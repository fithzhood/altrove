# Altrove

Simulatore di luoghi esplorabili in prima persona. Si sceglie un posto, un
meteo e un'ora, e ci si cammina dentro. Vanilla HTML/CSS/JS + Three.js
vendorizzato in locale (nessuna CDN, nessuna build).

Entrata: `altrove.html`. Server di sviluppo: `python servi.py 8123`.

---

## Che cosa c'è dentro

**44 luoghi**, fra reali e immaginari. Ogni luogo è solo un blocco di numeri in
`js/biomes.js`: forma del terreno, tavolozza, che cosa ci cresce e chi ci vive,
quanto è torbida l'aria, dov'è l'acqua. Il motore non sa niente di "foresta" o
di "Marte".

**Fauna**: stormi di uccelli a boids, branchi che pascolano, banchi di pesci,
farfalle, meduse fluttuanti, e la megafauna (sauropodi, teropodi, pterosauri,
mammut). La CPU muove gli agenti, la GPU anima le membra.

**Sott'acqua**: si nuota davvero. Caustiche sul fondo, luce che vira al blu con
la profondità, nevischio marino, e la nebbia che diventa l'acqua stessa.

**Cascate**: non sono piazzate a mano — il sistema cerca i salti di quota e ci
fa scendere l'acqua, seguendo la pendenza fino a valle.

**8 condizioni meteo** (sereno, poco nuvoloso, coperto, pioggia, temporale,
neve, nebbia, tempesta di sabbia), che si interpolano l'una nell'altra invece
di scattare.

**Ora del giorno continua** 0–24 con ciclo automatico, più latitudine
(cambia quanto sale il sole e quanto durano i crepuscoli), stagione, vento,
fase lunare.

---

## Le decisioni che contano

### Il cielo non è un gradiente
`js/sky.js` integra lo scattering atmosferico lungo il raggio di vista:
Rayleigh per il blu del giorno e il rosso del tramonto, Mie per la foschia e
l'alone attorno al sole. Costa troppo per farlo a schermo intero, quindi gira
una volta per fotogramma su una texture equirettangolare 192×96 (la LUT).

Da quella LUT pescano tre clienti diversi, ed è questo che tiene insieme
l'immagine:

1. la passata di cielo, che ci aggiunge sole, luna con le fasi, stelle, Via
   Lattea, nuvole e aurora;
2. **la nebbia di ogni materiale**, che così prende il colore del cielo nella
   direzione in cui guardi — le lontananze contro sole si accendono, quelle in
   ombra restano fredde. È l'effetto singolo che fa più differenza;
3. le luci della scena, calcolate in JS con **la stessa identica formula**.

Se cielo e luci divergessero, l'occhio se ne accorgerebbe subito.

### Il mondo è una funzione, non una mappa
`js/world.js`: dato (x, z) restituisce quota, pendenza e di che cosa è fatta la
superficie. Non esiste niente in memoria, quindi il mondo è infinito e
ricomincia identico a parità di seme.

Regola di ferro: `height(x,z)` non dipende dal livello di dettaglio. Se due LOD
adiacenti calcolassero quote diverse sullo stesso punto, si aprirebbero crepe.

### Il terreno segue la camera
`js/terrain.js`: 4×4 chunk fitti intorno al giocatore, poi anelli di chunk
larghi il doppio ognuno. Il buco centrale di ogni anello coincide esattamente
con l'area coperta dall'anello più fine. Due chilometri di mondo con ~70.000
vertici. Le gonne sui bordi tappano le crepe di un pixel dove la risoluzione
cambia.

### La vegetazione non è una lista
`js/scatter.js`: la posizione di ogni pianta viene da un hash delle coordinate.
La stessa cella dà sempre lo stesso albero, quindi si ricalcola invece di
ricordarla. L'unità di lavoro è la tessera: muovendosi si generano solo quelle
nuove. Ogni fotogramma le tessere attive vengono ricompattate negli
InstancedMesh — un disegno per variante, non per pianta.

Le geometrie (`js/props.js`) sono tutte procedurali: 40 generatori, nessun
modello caricato. Ognuno viene **normalizzato a un'altezza dichiarata** dopo la
costruzione: senza, altezza casuale nel generatore per scala casuale nel bioma
dava erba alta come un uomo.

### La luce vive in HDR
`js/engine.js`: la scena si disegna in virgola mobile senza limite superiore.
Il sole vale migliaia, l'ombra sotto un cespuglio qualche millesimo. Solo alla
fine l'intervallo viene schiacciato nei 256 livelli dello schermo, con
esposizione automatica (log-media della luminanza, adattamento asimmetrico
come l'occhio), ACES, bloom a sei livelli, bagliore del sole con prova di
occlusione sulla profondità, aberrazione cromatica, vignetta, grana, FXAA.

L'intervallo dell'esposizione automatica è **volutamente limitato**: lasciato
libero, una scena notturna veniva amplificata al punto che qualunque cosa
emettesse luce propria diventava una sfera bianca sfocata.

### Le particelle non toccano la CPU
`js/weather.js`: ogni goccia ha una posizione fissa dentro un cubo che segue la
camera, e il movimento è il modulo del tempo dentro quel cubo, calcolato nel
vertex shader. Ventiseimila gocce costano un disegno e zero lavoro per
fotogramma. Solo gli spruzzi a terra hanno bisogno della quota del terreno, e
quelli vengono ricollocati qualche decina per volta.

### L'acqua
`js/water.js`: griglia polare che segue la camera (fitta sotto i piedi,
larghissima all'orizzonte), onde di Gerstner (i vertici scivolano anche in
orizzontale verso la cresta: è questo che rende il profilo appuntito sopra e
largo sotto), Fresnel con riflesso preso dalla LUT del cielo, e una mappa
dell'altezza del fondo attorno al giocatore da cui nascono il colore
dell'acqua bassa e la schiuma sulla riva.

Dieci tipi: mare, mare tropicale, lago, palude, ghiaccio, lava, metano, mare
di nuvole, specchio salino, pozze termali.

---

## File

| file | che cosa fa |
|---|---|
| `altrove.html` / `altrove.css` | guscio e interfaccia |
| `js/main.js` | stato, interfaccia, ciclo di disegno |
| `js/biomes.js` | i 44 luoghi, gli 8 meteo, le stagioni, la fauna |
| `js/world.js` | campo di altezze, pendenze, superfici |
| `js/noise.js` | rumore condiviso CPU/GPU |
| `js/sky.js` | scattering atmosferico, sole, luna, stelle, nuvole, aurora |
| `js/atmosphere.js` | lega ora + meteo + bioma a luci, nebbia, cielo |
| `js/fog.js` | prospettiva aerea iniettata in ogni materiale |
| `js/engine.js` | renderer e post-produzione |
| `js/terrain.js` | terreno a livelli di dettaglio |
| `js/props.js` | 40 generatori di geometrie |
| `js/scatter.js` | semina e istanziamento |
| `js/water.js` | superfici liquide |
| `js/weather.js` | pioggia, neve, polvere, spore |
| `js/city.js` | edifici, lampioni, auto, insegne al neon |
| `js/fauna.js` | animali: sagome, andature, stormi |
| `js/waterfall.js` | cascate trovate dal rilievo |
| `js/library.js` | la Biblioteca esagonale infinita |
| `js/castle.js` | il castello del collegio |
| `js/controls.js` | camera in prima persona |
| `dev/shots.js` | strumento di collaudo: molte vedute in un foglio solo |
| `dev/bestiario.html` | banco di prova dei modelli degli animali, fermi e su fondo neutro |
| `servi.py` | server di sviluppo che vieta la cache |

`vendor/three.core.js` + `vendor/three.module.js`: Three.js r185, in locale.

---

## Comandi

WASD muoversi · Shift correre · Ctrl accovacciarsi · Spazio saltare
F volo libero · Tab pannello · P modalità foto · H nascondi interfaccia
C salva immagine · Esc liberare il mouse

---

## Trappole già pagate

- **`texture2D` non esiste in GLSL ES 3.00.** Nei materiali di three c'è un
  `#define` che lo traduce; nei RawShaderMaterial GLSL3 va aggiunto a mano.
- **Sotto l'orizzonte il raggio entra nel pianeta** e la densità atmosferica
  cresce come `exp(+h/H)`: NaN, cioè nero. La direzione va limitata a poco
  sopra l'orizzonte geometrico, non sotto.
- **Le stelle sotto il pixel spariscono.** La larghezza della gaussiana va
  legata a quanto misura un pixel in celle (`fwidth`), non fissata.
- **`sunColor` è irradianza, non radianza.** Le nuvole vanno divise per circa
  π, o escono trenta volte più luminose del cielo.
- **`PCFSoftShadowMap` non esiste piu** da three r185: il renderer lo declassa
  a `PCFShadowMap` e stampa un avviso a ogni avvio. Non e una perdita — il PCF
  nuovo campiona con un disco di Vogel a cinque prelievi ruotato da rumore per
  pixel, ed e piu morbido del vecchio «soft». `shadow.radius` continua a
  regolarne l ampiezza. Va solo dichiarato `PCFShadowMap` esplicitamente.
- **`normalBias` delle ombre si misura in metri.** A 0,65 le ombre degli alberi
  scivolavano via dal tronco e sparivano.
- **Il viewport di three non segue `canvas.width` scritto a mano.** Va da
  `setPixelRatio`, o si disegna in un angolo della tela.
- **`onBeforeCompile` senza `customProgramCacheKey`** fa riusare a three il
  programma compilato di un altro materiale con iniezioni diverse.
- **Il server di sviluppo deve vietare la cache**, o si collauda codice vecchio
  credendo di collaudare quello nuovo.
- **La taglia di un animale va misurata sull'asse giusto.** Un uccello ad ali
  aperte è alto pochi centimetri e largo un metro: normalizzarlo sull'altezza lo
  gonfia di tre volte, e ne esce un condor. Ogni creatura dichiara il proprio
  asse (apertura, lunghezza, altezza).
- **Il verso della rotta.** I modelli guardano verso -Z, quindi la rotazione che
  li punta verso (dx, dz) è `atan2(dx, dz) + π`. Senza quel mezzo giro tutti gli
  animali camminano all'indietro, ed è quello che facevano.
- **Un interno vuole `DoubleSide`.** Con il culling in avanti il soffitto
  scompare visto da sotto, e nella Biblioteca infinita si vede il cielo.
- **Due piani complanari sfarfallano.** Il pavimento della Biblioteca sta cinque
  centimetri sopra il terreno, o si riempie di bande.
- **Un blocco GLSL incluso da più moduli va protetto da una guardia**
  (`#ifndef`), altrimenti le funzioni risultano ridefinite.

---

## Cosa manca / si potrebbe fare

- Il pianetino usa una curvatura applicata negli shader, ma la passata delle
  ombre usa il materiale di profondità di three, che non la conosce: lì le
  ombre sono spente. Servirebbe un `customDepthMaterial`.
- Niente audio.
- Le andature dei quadrupedi sono cicliche, non c'è appoggio del piede vero
  (nessuna cinematica inversa): a passo lento si nota un filo di slittamento.
- Nessuna occlusione ambientale a schermo (SSAO): sotto le chiome manca un po'
  di ombra di contatto.
- Le nuvole sono uno strato piatto in parallasse, non volumetriche vere.
