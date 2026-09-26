# Atlante anatomico 3D

Sito statico con modelli anatomici 3D interattivi, a scopo didattico
(anatomia muscolo-scheletrica per radiologia). Interfaccia in italiano, tema scuro fisso.

> Materiale didattico. Non destinato a uso clinico o diagnostico.

## Struttura

```
index.html                 homepage: una card per ogni modello (card su smartphone, tavole da 720 px)
modelli/<nome>-3d.html     un file autocontenuto per modello (three.js r128 da CDN, dati in base64)
assets/nav.js              header comune dei modelli: link alla home, disclaimer, pannello "i" con i crediti
assets/favicon.svg
assets/anteprime/          immagini 800×500 delle card
strumenti/anteprima.mjs    genera le anteprime (non pubblicato sul sito)
.vercelignore              esclude dal deploy strumenti/, CLAUDE.md e README.md
```

Nessun framework, nessun build step, nessun cookie o tracciamento.
Ogni modello resta una pagina indipendente: se `assets/nav.js` manca, funziona lo stesso, solo senza header.

## Provare il sito in locale

```bash
python3 -m http.server 8000
```

dalla cartella del progetto, poi apri <http://localhost:8000>.
Le pagine si aprono anche con il doppio clic, ma il server locale riproduce il comportamento del sito online
ed è necessario per lo script delle anteprime.

Cosa controllare dopo una modifica:
- homepage: card, immagini, link (anche "Polso" / "Dito"), numeri "Tav." e conteggio dei modelli;
- in ogni modello: header in alto, "‹ Atlante" torna alla home, pannello "i" si apre e si chiude
  (su smartphone dal basso, chiudibile toccando lo sfondo; da 640 px come riquadro sotto la "i"),
  toccando una struttura si apre la scheda giusta;
- vista smartphone (strumenti per sviluppatori del browser, 360 e 375 px) e desktop.

## Aggiungere un modello

1. **File** — copia la pagina in `modelli/<nome>-3d.html` (minuscolo, parole separate da trattini).
2. **Righe comuni** — nel file del modello aggiungi solo queste, senza toccare altro:
   ```html
   <html lang="it" data-theme="dark">                                        <!-- attributo sul tag esistente -->
   <meta name="description" content="Modello 3D interattivo di …">         <!-- nel <head> -->
   <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">     <!-- nel <head> -->
   <script src="../assets/nav.js"></script>                                 <!-- subito dopo <body> -->
   ```
3. **Anteprima** — con il server locale attivo:
   ```bash
   node strumenti/anteprima.mjs <nome>-3d
   ```
   Salva `assets/anteprime/<nome>-3d.jpg`. Per regolare l'inquadratura: `--zoom=1.2`, `--dy=-0.05`;
   per fare prove senza sovrascrivere: `--out=/tmp/prova.jpg`. Richiede Node 22+ e Google Chrome.
4. **Card** — in `index.html` duplica un blocco `<!-- CARD MODELLO -->` e aggiorna distretto, immagine,
   testo alternativo, didascalia della vista, link, titolo e descrizione. Il numero "Tav." e il conteggio
   dei modelli sono automatici. Il blocco `.sub` (link alle sezioni) è facoltativo e sostituisce il pulsante
   "Apri il modello".
5. **Verifica e pubblica** — controlla in locale, poi:
   ```bash
   git add modelli/<nome>-3d.html assets/anteprime/<nome>-3d.jpg index.html
   git commit -m "Aggiunge modello <nome>"
   git push
   ```

## Pubblicazione

Hosting su Vercel collegato al repository GitHub: ogni push su `main` pubblica il sito.
Non serve configurazione: Vercel serve i file così come sono.

## Crediti

I modelli sono derivati da **BodyParts3D**, © The Database Center for Life Science (DBCLS),
licenza [CC BY-SA 2.1 JP](https://creativecommons.org/licenses/by-sa/2.1/jp/).
Le geometrie originali sono state modificate e integrate con strutture modellate appositamente.
I modelli modificati sono distribuiti con la stessa licenza CC BY-SA 2.1 JP.

Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009.
