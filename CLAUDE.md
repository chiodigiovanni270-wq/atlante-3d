# Atlante anatomico 3D — contesto progetto

## Obiettivo
Sito web statico che raccoglie modelli anatomici 3D interattivi e atlanti RM simulati,
a scopo didattico (anatomia muscolo-scheletrica per radiologia). Lingua dell'interfaccia: italiano.

## Materiale di partenza
La cartella `modelli/` contiene pagine HTML autocontenute, nate come artifact di Claude:
- `ginocchio-3d.html` — ginocchio 3D interattivo (three.js r128 da CDN)
- `polso-dito-3d.html` — polso destro + dito in sezione separata (three.js r128 da CDN)
- `ginocchio-rm-t1.html` — atlante RM T1 simulato del ginocchio
- `polso-dito-rm-t1.html` — atlante RM T1 simulato di polso e dito

Ogni file include dati embedded in base64 (geometrie/immagini): sono file grandi (2–8 MB), è normale.

## Vincoli tecnici
- Sito statico, nessun backend. Hosting: Vercel, collegato a un repository GitHub (deploy automatico a ogni push su `main`).
- Preferire HTML/CSS/JS vanilla, senza framework né build step, salvo mia richiesta esplicita.
- Ogni modello deve restare una pagina indipendente e funzionante anche da sola.
- NON modificare la logica anatomica, le geometrie, i colori o i controlli dei modelli se non te lo chiedo:
  puoi solo aggiungere elementi comuni (header di navigazione, link alla home, meta tag, favicon).
- Responsive: deve funzionare bene su smartphone (touch) e desktop.
- Nessun cookie, nessun tracciamento di terze parti.

## Requisiti di contenuto
- Ogni pagina riporta un disclaimer breve: "Materiale didattico. Non destinato a uso clinico o diagnostico."
- Gli atlanti RM vanno etichettati chiaramente come "simulati" (non immagini reali di pazienti).

## Modo di lavorare
- Prima di modifiche ampie, proponi un piano e attendi conferma.
- Commit piccoli e descrittivi, in italiano.
- Dopo ogni modifica, indicami come verificarla in locale.
