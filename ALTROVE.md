# Altrove

Simulatore di luoghi esplorabili in prima persona. Si sceglie un posto, un
meteo e un'ora, e ci si cammina dentro. Vanilla HTML/CSS/JS + Three.js
vendorizzato in locale (nessuna CDN, nessuna build).

Entrata: `altrove.html`. Server di sviluppo: `python servi.py 8123`.

---

## Che cosa c'è dentro

**54 luoghi**, in tre famiglie: quelli che esistono, quelli che **sono
esistiti** (Carbonifero, Sahara verde, Eone Adeano, Giza, Stonehenge, Antica
Roma, Giurassico, Era glaciale) e quelli che non sono mai esistiti. La divisione non è un vezzo: cambia cosa ti
aspetti di trovare, ed è la prima cosa che si legge nella schermata iniziale.
Il flag è `epoca: true`, accanto a `fantasy: true`.

Ogni luogo è solo un blocco di numeri in
`js/biomes.js`: forma del terreno, tavolozza, che cosa ci cresce e chi ci vive,
quanto è torbida l'aria, dov'è l'acqua. Il motore non sa niente di "foresta" o
di "Marte".

**Fauna**: stormi di uccelli a boids, branchi che pascolano, banchi di pesci,
farfalle, meduse fluttuanti, la megafauna (sauropodi, teropodi, pterosauri,
mammut), gli hobbit della Contea, e la fauna «firma» dei luoghi immaginari:
lupi e pipistrelli nel bosco stregato, fate e unicorni in quello fatato, ikran
a quattro ali ed esapodi su Pandora, bantha e dewback su Tatooine, warg nella
Terra d'ombra. Nei luoghi reali orsi, cammelli, antilopi dove ci stanno. La
CPU muove gli agenti, la GPU anima le membra. Restano senza animali solo i
posti dove non c'è vita: Adeano, Marte, Luna, Titano, Oort, la Biblioteca, il
buco nero.

**Le firme dei luoghi**: un paesaggio si riconosce dal terreno e dalla flora,
un *luogo* da cosa ci hanno costruito sopra. Le case hobbit della Contea
(raccolte in borghi, con orti, staccionate e covoni), le cupole della fattoria
d'umidità di Tatooine, le case tonde di Namecc, le case di fungo del bosco
fatato, i cerchi di pietre del bosco stregato, gli archi e i colossi sommersi
di Atlantide, le torri della Terra d'ombra, la guglia nera del Monte Fato, il
modulo lunare, il lampione del pianetino, i mulini delle isole nel cielo.

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

**La diffusione multipla.** L'integrale conta solo il primo rimbalzo, e con
quello soltanto il cielo usciva dieci volte più scuro dell'erba al sole —
(14, 30, 49) contro (79, 108, 27) a mezzogiorno, mentre nella realtà lo zenit
è più chiaro del prato. La luce che ha rimbalzato due, tre, dieci volte ha
perso ogni memoria della direzione da cui veniva, quindi si aggiunge con fase
isotropa (1/4π) moltiplicata per `ALT_MULTISCATTER`. Non è una taratura
estetica: senza quel termine tutto ciò che non prende il sole diretto viene
quasi nero — le facciate in ombra, il sottobosco, l'interno di una porta.
Dopo: zenit (68, 104, 142). **La costante esiste in due copie**, una in GLSL e
una in JS: se divergono, il cielo che si vede e le luci che illuminano la
scena smettono di essere d'accordo.

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

### Le cose costruite si raggruppano
Una casa non si semina come l'erba. `js/scatter.js` conosce tre regole in più
che valgono solo per gli edifici: **`cluster`** (le case stanno in borghi: ogni
cella larga *period* ne ospita uno, con il centro spostato a caso ma sempre
dentro la cella, così il paese non viene tagliato in due dal confine),
**`faceDownhill`** (la facciata guarda a valle, che è come si scava nel fianco
di una collina) e **`sink`** più `upright` (l'edificio resta a piombo e
sprofonda quanto basta a non lasciare spiragli sotto).

Il `cluster` non è solo estetica: **sotto una certa rarità la densità smette di
funzionare**, perché ogni tessera mette comunque un candidato per cella. Per
ottenere una cosa davvero rara — una guglia, un modulo lunare, *il* lampione —
l'unica leva è un grappolo strettissimo con periodo lunghissimo.

Il grappolo ha tre forme, e la forma è il monumento:

- **a macchia** (`radius`) — un borgo, un quartiere, una fattoria;
- **ad anello** (`ring`, `ringWidth`) — un cerchio di pietre. Stonehenge *è* la
  disposizione: a macchia verrebbe un mucchio di sassi. Con `faceCenter` ogni
  pietra guarda il centro;
- **a postazioni** (`slots: [[dx, dz, scala], …]`) — un sito con una pianta
  vera. Le tre piramidi di Giza stanno in punti precisi, con taglie precise, e
  `fixedYaw: 0` le allinea ai punti cardinali come sono davvero. Si tiene il
  candidato la cui *cella* contiene la postazione, o se ne otterrebbero dieci
  sovrapposte.

### La vegetazione non è una lista
`js/scatter.js`: la posizione di ogni pianta viene da un hash delle coordinate.
La stessa cella dà sempre lo stesso albero, quindi si ricalcola invece di
ricordarla. L'unità di lavoro è la tessera: muovendosi si generano solo quelle
nuove. Ogni fotogramma le tessere attive vengono ricompattate negli
InstancedMesh — un disegno per variante, non per pianta.

**La volta del bosco.** Ogni bioma boscoso ha due strati: le regole di sempre
sono il bosco visto da lontano; uno strato vicino (raggio 120–160 m) mette
alberi grandi e fitti, con le chiome che si toccano e coprono il cielo. È
limitato ai pendii dolci: su un pendio le chiome degli alberi a valle arrivano
all'altezza degli occhi. E siccome il punto di partenza lo sceglie il terreno,
che degli alberi non sa niente, dopo la semina `scansaTronchi()` sposta il
giocatore al primo punto libero.

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

**Raggi di luce e ombre di contatto.** Due passate in più, entrambe dalla sola
profondità. I raggi crepuscolari non si calcolano nel volume: si prendono i
pixel di cielo vicino al sole e si strascinano radialmente verso di esso, in
due iterazioni a un quarto di risoluzione; dove una chioma copre il cielo la
striscia si interrompe, ed è quello che l'occhio legge come «luce che filtra».
L'occlusione ambientale ricostruisce la posizione dalla profondità e la normale
dalle sue derivate, dodici campioni in emisfero ruotati a caso per pixel, poi
una sfocatura che rispetta i bordi; è applicata al colore finale (un
compromesso: separare i termini in ogni materiale costerebbe troppo). Sotto una
chioma o fra due sassi è l'ombra di contatto che nessuna luce diretta può dare.
Entrambe hanno un cursore nel pannello Immagine.

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
| `js/biomes.js` | i 54 luoghi, gli 8 meteo, le stagioni, la tabella della fauna |
| `js/world.js` | campo di altezze, pendenze, superfici |
| `js/noise.js` | rumore condiviso CPU/GPU |
| `js/sky.js` | scattering atmosferico, sole, luna, stelle, nuvole, aurora, buco nero |
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
| `dev/bestiario.html` | banco di prova dei modelli degli animali, fermi e su fondo neutro (`?only=wolf,bear&pose=0.15`) |
| `dev/oggetti.html` | banco di prova delle geometrie di `props.js`, con un piano d'appoggio |
| `window.__frame(n)` | orologio pilotabile: fa avanzare l'app di n fotogrammi anche a scheda nascosta |
| `joystick.html` | pagina di diagnosi del controller (assi e tasti dal vivo) |
| `servi.py` | server di sviluppo che vieta la cache |

`vendor/three.core.js` + `vendor/three.module.js`: Three.js r185, in locale.

---

## Comandi

WASD muoversi · Shift correre · Ctrl accovacciarsi · Spazio saltare
F volo libero · Tab pannello · P modalità foto · H nascondi interfaccia
C salva immagine · Esc liberare il mouse

---

### La volta della Terra cava (build 27)

Nella Terra cava sopra la testa c e l altro emisfero, e volando verso il
sole centrale lo si raggiunge. Sta tutto in `js/volta.js`, acceso dal campo
`volta: { height: 1200, offset: 20000 }` del bioma.

- **La volta** e una griglia grossolana (113x113 vertici, 2 km di lato, che
  segue la camera ricampionandosi 6 righe per fotogramma) del terreno di
  un altra regione dello stesso mondo, specchiata: il punto (x, z) della
  volta mostra `height(OFF - x, z)` appeso a quota `H - h`. Usa il
  materiale del terreno (`terrain._makeMaterial`, stessi colori e
  screziature) con `userData.altFlip = -1`: la curvatura ha segno opposto
  e la volta si piega verso il basso mentre il pavimento si piega verso
  l alto. Si incontrano a meta quota, a 848 m in orizzontale, dove
  `farFade: 900` e la nebbia chiudono la cucitura.
- **La curvatura ora e in spazio-mondo** (`fog.js`, `water.js`): il
  vertice scende o sale con il quadrato della distanza ORIZZONTALE dalla
  camera, lungo la verticale del mondo. Prima piegava lungo l asse di
  vista e guardando in su o in giu il mondo si storceva. Vale anche per il
  pianetino.
- **La dissolvenza al confine e orizzontale** (`fadeHorizontal: 1` dal
  bioma, uniform `altFadeHorizontal`): in linea d aria la volta a 1200 m
  sarebbe gia sfumata via; in orizzontale sta a zero.
- **Le normali della volta guardano in su** e l avvolgimento delle facce in
  giu: la luce del sole centrale arriva alla volta da sotto, e per una
  superficie vista dal lato opposto n·l e lo stesso di (-n)·(-l). Cosi la
  illumina la stessa luce direzionale del pavimento, senza una seconda luce.
- **Il sole centrale** e una sfera a meta quota nella direzione della luce
  (`fixedSun`), radianza 140 (il disco in cielo ha ~23, ma l abbaglio in
  cielo lo aggiunge il glare della composizione, non la radianza), con un
  alone additivo: con la fusione normale l alone era un anello nero.
- **L attraversamento**: oltre `H/2` si applica `controls.mirror(OFF, H)`,
  una rotazione di 180 gradi attorno all asse parallelo a z per
  (OFF/2, H/2): posizione (OFF - x, H - y), yaw e pitch negati, velocita
  ribaltata, e rollio della camera a pi greco. L immagine e identica prima
  e dopo (e per questo che non si vede), e il rollio si spegne da solo in
  tre secondi: e la volta che diventa pavimento. Lo streaming dei chunk
  segue la camera e in mezzo secondo il nuovo pavimento e vero, con
  piante e animali. Il lampo bianco (`#flash`) copre lo scambio, che
  coincide con il passaggio dentro il sole. Cooldown di 2 s, e la volta
  si ricampiona subito, in modo sincrono, sulla nuova posizione.
- In volo «su» e `cos(roll)`: a testa in giu chi tiene premuto per
  salire continua ad andare dove stava andando.

Trappole trovate: le sfere del sole e dell alone con radianza HDR
paragonabile allo sfondo sembrano «non renderizzate» (beige piatto, anello
scuro): non e un bug di rendering, e la scala HDR della scena. E il pannello
del browser nascosto rallenta rAF a un fotogramma al secondo: il rollio
che «non si spegneva» era il tempo che non passava, `window.__frame(220)` lo
dimostra.

### Esposizione pesata verso il basso (build 26)

La misurazione della luminanza media (`lumMat` in `engine.js`) pesa i pixel
in alto meno di quelli in basso (peso 1 sotto il 45% dello schermo, 0,28
sopra l 82%, rampa in mezzo), come la misurazione a matrice di una macchina
fotografica. Prima la media semplice sul fotogramma intero era dominata dal
cielo, e una savana a mezzogiorno usciva scura come al crepuscolo. Il peso
viaggia nel canale verde della catena 64→16→4→1 e `adaptMat` divide
`exp(r/g)`. La chiave e passata da 0,148 a 0,17. I limiti dell esposizione
(`autoMin`/`autoMax`) sono gli stessi: la notte resta notte.

### Ombre delle nuvole (build 26)

Le nuvole dello strato in cielo proiettano l ombra sul terreno e su tutto
cio che e illuminato dal sole. Non e una shadow map: `fog.js` inietta in ogni
materiale `altCloudShadow(wp)`, che proietta il punto lungo `altSunDir` fino
alla quota delle nuvole e ricampiona LO STESSO fbm dello strato in cielo
(`uv = p*0.00023 + altCloudScroll`, stessa copertura e densita), poi moltiplica
`directLight.color` nel chunk `lights_fragment_begin`. I quattro uniform li
passa `atmosphere.js` in `fog.set()` insieme alla nebbia, cosi l ombra scorre
con la nuvola che si vede. Con cielo sereno (`cloudCover` 0) la funzione
restituisce 1 e non costa nulla di visibile.

Trappola: la sostituzione del chunk e una stringa JS a singoli apici. Se la
scrivi da Python con `
		` dentro una stringa normale, Python mette a
capo davvero e il file non si carica piu in nessun browser (`SyntaxError:
Invalid or unexpected token`), mentre `node --check` puo dire OK lo stesso.
Per trovare il file colpevole: `node --input-type=module -e "await
import('./js/fog.js')"`, o nel browser `import('/js/x.js?chk=...')` a uno a uno.

### La fauna dei luoghi (build 28)

Tutta la tabella sta in `FAUNA` in `js/biomes.js`; i modelli in `js/fauna.js`.
Il quadrupede è uno solo, parametrico: muso (`snout`), orecchie (`ear`), gobba
posizionabile (`hump`, `humpZ`, `humpPlain`), cresta dorsale (`spines`), corno
(`horn`), corna a spirale (`horns: 'curl'`), criniera (`mane`), coda con
rastremazione (`tailTaper`), sei zampe (`legs: 6` — il paio in più sta subito
dietro le anteriori e riusa i loro codici, lo shader non cambia). Lupo, warg,
orso, cammello, bantha, dewback, unicorno ed esapode sono tutti quel generatore
con numeri diversi. Da zero solo pipistrello, fata e banshee.

Tre comportamenti nuovi, dichiarati nella regola del bioma:

- **`herd: R`** — branco. La specie ha un centro che vaga piano attorno al
  giocatore (mai in acqua, mai su un pendio), e ogni individuo sceglie le mete
  entro R metri da lì. Senza, dieci animali che si ignorano non sono un branco.
- **`night: true`** — notturni. Escono con `nightness > 0.45`; all'alba la
  meta dello stormo va a due raggi e mezzo dietro al giocatore, se ne vanno e
  muoiono fuori raggio. Nessuno sparisce sotto gli occhi.
- **Nessuno nasce davanti agli occhi.** `_spawn` scarta i candidati entro
  0,75 R nel cono di vista (coseno > 0,45): vicino si nasce solo alle spalle.
  Per questo i raggi dei boschi sono scesi a 150–190 m senza comparse.

**Gli animali di terra evitano le pareti** (`slopeAt > 0,2`, cioè oltre ~37°),
sia nascendo che scegliendo le mete: prima un dewback saliva una duna a
picco e ci affondava con mezzo corpo.

**Perché le creature magiche «non si incontravano».** Nel bosco fatato c'erano
nove spiriti a 10–34 m di quota e cento farfalle di dodici centimetri: sotto
una volta di alberi non li vedeva nessuno. Ora fate (trenta centimetri,
emissivo 0,9), fuochi fatui a 2–12 m e unicorni stanno tutti ad altezza
d'occhio, entro 60–160 m. La regola generale: un animale va messo dove il
giocatore guarda, non dove sarebbe realistico.

**Collaudo in-app senza pannello.** Lo screenshot del pannello scade sulla
scena pesante. Il ripiego: `renderer.domElement.toDataURL()` subito dopo
`__frame()` (stesso task, quindi il buffer c'è ancora) e un `fetch` POST
`no-cors` verso un ricevitore Python locale che scrive il file. Per inquadrare
un animale conviene scegliere il punto di ripresa fra dodici direzioni
attorno a lui, scartando quelle bloccate, e stare 2–3 m più in alto: a terra
si finisce dentro un masso.

## Trappole già pagate

- **Un quadrupede con la testa a filo del corpo sembra una foca.** Il collo
  deve portare la testa *davanti* al muso dell'ellissoide (`neckFwd` ≥ 0,6),
  o a trenta metri lupo e cervo sono la stessa salsiccia con le zampe.
- **`__frame` in blocchi: 900 fotogrammi superano i 45 s del tool.** Duecento
  per chiamata; e la costruzione del mondo avanza solo se qualcuno chiama i
  fotogrammi, quindi a pannello nascosto `__rebuild()` va spinto con un ciclo
  `while (loading non hidden) __frame(1)`.
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
- **La modalità foto non deve scrivere sui comandi dell'utente.** Scriveva
  `dof.checked = true` entrando, e uscendo rileggeva quella stessa casella: la
  profondità di campo restava accesa per sempre. Lo stato di partenza va
  memorizzato e rimesso.
- **`bindSlider` chiama `apply` anche in fase di collegamento.** Se quella
  funzione ha un effetto collaterale (spegnere il fuoco automatico perché
  «l'utente ha mosso il cursore»), all'avvio scatta da sola. Ora `apply` riceve
  un secondo argomento che distingue la mano umana dall'inizializzazione.
- **Il cerchio di confusione deve dipendere dalla distanza di messa a fuoco.**
  Con `c = A·(d−fuoco)/d` lo sfocato all'infinito vale sempre l'apertura, e
  mettere a fuoco a dodici metri cancella l'intero paesaggio. In un obiettivo
  vero c'è un `/(fuoco − f)` che fa sfocare *meno* quando si mette a fuoco
  lontano.
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
- **Un dt negativo fa esplodere la fisica.** I fotogrammi sintetici di
  `__frame` si intrecciano con quelli veri, il tempo torna indietro di qualche
  millisecondo, e `exp(-26·dt)` con dt negativo manda il giocatore a 10²⁷
  metri sotto il mondo. Il dt ora è chiuso in [0, 0,25].
- **Nelle schede nascoste il browser sospende `requestAnimationFrame`.** Il
  riquadro d'anteprima si nasconde da solo, e da lì in poi l'app *sembra*
  rotta: la barra di caricamento resta a zero, nessun mondo si costruisce, e
  la console è pulita. Non è un bug — è il tempo che non scorre. Per il
  collaudo c'è `window.__frame(n)`, che chiama i fotogrammi a mano: una
  passata su tutti i luoghi si fa così anche a riquadro chiuso.
- **Un cambio di luogo durante la costruzione veniva ignorato in silenzio.**
  Ora si mette in coda e parte appena finisce; e se `buildWorld()` lancia
  un'eccezione, il messaggio compare nella barra invece di lasciarla a zero.
- **Il bagliore del sole va dove c'è un sole da vedere.** Nel cielo del buco
  nero il «sole» esiste solo per illuminare la scena e sta dentro il buco nero:
  la post-produzione ci disegnava attorno i raggi, e ne usciva una stella di
  Natale. `sunDisk: 0` spegne disco e bagliore insieme.
- **Un luogo tratto da una fonte va verificato sulla fonte, non a memoria.**
  Il difetto ricorrente è lo stesso: la *descrizione* del luogo promette la
  caratteristica e il bioma non ce l'ha. Namecc dichiarava tre soli e faceva
  notte; Tatooine dichiarava «due soli che tramontano insieme» e in cielo ne
  aveva uno. `extraSuns` disegna solo dischi — non illumina, non impedisce la
  notte. La verifica utile è leggere il proprio blurb e chiedersi se il codice
  lo mantiene.
- **La distanza fra i soli in più dipende dal luogo.** Su Namecc sono tre soli
  lontani (è per quello che non fa mai notte); su Tatooine sono due soli
  vicinissimi che tramontano appaiati. Un valore fisso non può servire
  entrambi: `extraSunOffsets`.
- **Un corpo celeste grande va tenuto scuro.** Di notte l'esposizione
  automatica amplifica moltissimo: la Luna adeana con albedo 0,5 e Polifemo con
  0,4 diventavano lampade bianche. L'albedo della Luna è 0,12, e nel motore
  serve ancora meno.
  `minSunAlt` impedisce al sole di scendere sotto una soglia: continua a
  girare per il cielo, semplicemente non tramonta. Stessa storia per i colori,
  che vanno presi da una referenza — su Namecc acqua verde, terra e piante
  azzurre, cielo giallo-verde, che non è la tavolozza che verrebbe da sé.
- **Un parametro del terreno dimenticato non dà errore: dà NaN**, e NaN si
  propaga a tutto il campo di altezze. Il risultato è un mondo invisibile con
  il giocatore a quota NaN e la console pulita — il modo peggiore di rompersi.
  Il costruttore di `World` ora campiona venti quote e fallisce dicendo quale
  bioma e quale forma di terreno.
- **Un blocco GLSL incluso da più moduli va protetto da una guardia**
  (`#ifndef`), altrimenti le funzioni risultano ridefinite.
- **L'ordine dei vertici decide quale faccia è il davanti.** Questi materiali
  disegnano una faccia sola: una cupola avvolta al contrario si vede solo da
  dentro e sparisce da fuori. Per un disco o un anello costruiti attorno a una
  normale `n`, la terna `(T, B, n)` va destrorsa e i vertici percorsi di
  conseguenza.
- **Una facciata messa a una frazione fissa del raggio finisce sepolta.** A un
  metro da terra un ellissoide è ancora quasi al raggio pieno: il piano della
  porta va calcolato dall'equazione della superficie a *quella* quota, non a
  occhio.
- **Un muretto su un pendio deve scendere molto sotto lo zero**, o resta per
  aria proprio dal lato da cui lo si guarda.
- **L'emissivo di un edificio va mascherato**, o di notte si accende tutta la
  casa invece delle sole finestre. La maschera viaggia in `aFlex`, che per un
  edificio non serve a nulla (una casa non si piega al vento).
- **Di notte l'esposizione automatica amplifica moltissimo**: un emissivo a
  1,7 diventa un faro con un alone grande quanto la casa. I valori giusti per
  una finestra accesa stanno sotto 0,1.
- **Non tutti i biomi chiudevano con `  },` sulla stessa riga**: sei finivano
  con la graffa e la virgola separate, e una modifica automatica che cercava
  quella chiusura infilava le regole nel bioma successivo. Ora sono uniformi,
  ma conviene sempre verificare *in quale* bioma è finita una regola aggiunta
  da uno script.

---

## Cosa manca / si potrebbe fare

- Il pianetino usa una curvatura applicata negli shader, ma la passata delle
  ombre usa il materiale di profondità di three, che non la conosce: lì le
  ombre sono spente. Servirebbe un `customDepthMaterial`.
- Niente audio.
- Le andature dei quadrupedi sono cicliche, non c'è appoggio del piede vero
  (nessuna cinematica inversa): a passo lento si nota un filo di slittamento.
- Le nuvole sono uno strato piatto in parallasse, non volumetriche vere.
- Il buco nero non integra le geodetiche: mette in scena quello che la lente
  *produce* (ombra, anello di fotoni, ellisse schiacciato, arco sollevato,
  asimmetria Doppler). Un vero ray-tracing relativistico sarebbe un altro
  progetto.
- La diffusione multipla è approssimata con un termine isotropo costante
  (`ALT_MULTISCATTER`), non con un integrale vero: è corretta nell'ordine di
  grandezza e nell'andamento, non nel dettaglio.
