# Guida tecnica ai modelli 3D — da rispettare per i nuovi modelli

Ricavata da `ginocchio-3d.html` e `polso-dito-3d.html`. Un nuovo modello deve avere la stessa architettura, così si integra nel sito senza adattamenti.

## Requisiti generali
- Singolo file HTML autocontenuto, lingua italiana, lato **destro** salvo diversa indicazione.
- Dipendenze esterne ammesse: three.js **r128** da cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`) e Google Fonts (Figtree per il testo, Spectral per i titoli). Nient'altro.
- Nessun localStorage, nessuna chiamata di rete, nessun cookie.
- Stile realistico; strutture selezionabili e nascondibili singolarmente e per categoria.

## Tema e stile
- Token CSS su `:root`: `--bg --bg-hi --bg-lo --panel --ink --muted --line --accent --shadow --sans --serif`.
- Palette scura (quella usata dal sito): `--bg:#161c23; --bg-hi:#2a333d; --bg-lo:#0d1116; --panel:#1e262f; --ink:#e5eaef; --muted:#93a1ae; --line:#324050; --accent:#72b4d0`.
- Mantenere anche la variante chiara e i selettori `prefers-color-scheme` / `:root[data-theme="dark"]` come negli esistenti (il sito forza comunque lo scuro).
- Sfondo del body: gradiente radiale `var(--bg-hi) → var(--bg) → var(--bg-lo)`; renderer con `setClearColor(0x000000,0)` (trasparente).

## Layout dell'interfaccia (vincolante per la barra del sito)
- Canvas `#c` a tutto schermo (`position:fixed; inset:0`). Resize e picking basati su `innerWidth/innerHeight`.
- Barra superiore `.top` fissa in alto con titolo a sinistra e fila `.views` di pulsanti vista (`data-view`). Il sito sposta `.top` sotto la propria barra: **`.top` deve esistere con questo nome** e avere `padding-top` che includa la safe-area.
- Pannello inferiore `#sheet`: pulsante/intestazione `.sheet-tab` (`#bSheet`) + contenitore `.sheet-body` (`#sheetBody`) con chip delle categorie (`#chips`), pulsanti (Tutto, Solo ossa, Trasparenza, eventuali extra), `Elenco` (`#bList`) con lista `#list`, riga `.credit` con i crediti.
- Modalità compatta (`(max-width:600px), (orientation:landscape) and (max-height:500px)`): `#sheet` chiuso all'avvio (classe `collapsed` già nell'HTML), da chiuso resta solo un pulsante ovale "Strutture ▴" centrato e fluttuante (alto 44 px, a 12 px + safe-area dal bordo, sfondo `--panel` all'82% con `backdrop-filter: blur`), che all'apertura diventa l'intestazione a tutta larghezza "Strutture ▾" con angoli superiori arrotondati; nessun elemento opaco deve toccare il bordo inferiore (in Safari iOS creerebbe una fascia di colore diverso sotto la barra del browser); altezza massima 60dvh con un solo scorrimento; aprire una card chiude il pannello, aprire il pannello chiude la card; card compatta (max 35dvh, scorre solo `.info`), sempre sopra il pulsante. La classe `open` resta riservata a Elenco. CSS e JS identici in ginocchio e polso: copiarli da lì. Desktop e 601–899 px invariati.
- Card di dettaglio `#card` (nome `#cName`, categoria `#cCat`, testo `#cInfo`, pulsanti Isola `#cIso` e Nascondi `#cHide`).
- Schermata di caricamento `#load` con barra `#loadBar` e testo `#loadTxt` ("Costruzione del modello…").
- Su smartphone la fila `.views` deve stare nello schermo a 360 px (se serve, sotto 430 px farla scendere sotto il titolo come nel polso).

## Dati
- Categorie in `const CATS=[{id,name,color}]` (es. ossa, cart, men, leg, ten, mus, art, ven, ner, bor, adi, caps, cute). `HIDDEN_CATS` = categorie nascoste all'avvio (es. capsula, cute).
- Strutture in `const S=[{id, cat, name, info, b:()=>[...]}]`: `info` è una nota breve didattica/clinica (anatomia + rilievo radiologico/ecografico), `b` restituisce le geometrie.
- Geometrie reali (BodyParts3D) codificate in base64 dentro `<script id="bpdat" type="text/plain">`, con indice in `<script id="bpman" type="application/json">` (`min`, `max`, `meshes:[{n, nv, ni, p, t?, d?, i16, i}]`). Richiamate con `REAL('<nome>')`. Più sezioni → `bpdat2`/`bpman2`.
- Strutture non presenti in BodyParts3D (legamenti, tendini, pulegge, borse, ecc.): modellate proceduralmente e adattate all'anatomia reale.
- Capsula del ginocchio: generata da `strumenti/capsula-ginocchio.mjs` a partire dalle mesh reali (involucro delle superfici articolari, profondo alle strutture extracapsulari) e salvata come mesh `capsula` in `bpdat`. Per modificarla si cambiano i parametri nello script e lo si rilancia.
- Rapporti tra legamenti collaterali e muscoli del ginocchio: `strumenti/stratifica-ginocchio.mjs` elimina le compenetrazioni secondo la letteratura (zampa d'oca superficiale al LCM, braccio anteriore del semimembranoso profondo, bicipite posteriore al LCL). Dopo averlo usato va rilanciato anche `capsula-ginocchio.mjs`. Funzioni comuni in `strumenti/lib-modello.mjs`.

## Contenuti obbligatori
- Riga `.credit`: "Ossa, muscoli e cute: BodyParts3D, © The Database Center for Life Science, licenza CC BY-SA 2.1 JP (Mitsuhashi N et al., Nucleic Acids Res 2009). Le altre strutture sono modellate e adattate." (adattare l'elenco a ciò che viene effettivamente da BodyParts3D).
- Viste standard coerenti con il distretto (es. Ant/Post/Lat/Med; per il polso Volare/Dorsale/Radiale/Ulnare).
- Più distretti nello stesso file = sezioni separate con selettore e ancora nell'URL (es. `#dito`).

## Checklist prima di consegnare un nuovo modello
- [ ] Clic su strutture vicino ai bordi alto e basso apre la card giusta
- [ ] Rotazione, zoom, viste, isola/nascondi, elenco funzionanti
- [ ] Nessun errore in console; carica anche su smartphone
- [ ] `.views` interamente visibile a 360 px
- [ ] Su smartphone: pannello chiuso all'avvio, pulsante "Strutture" ovale e funzionante, nessuna fascia di colore diverso in basso in Safari, card compatta, nessuna sovrapposizione titolo/viste
- [ ] Credito BodyParts3D presente e corretto
- [ ] Note `info` anatomicamente corrette (verificate da me)
