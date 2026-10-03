/* Nervi del polso (modelli/polso-dito-3d.html, sezione polso).

   Uso (dalla cartella del progetto):
     node strumenti/nervi-polso.mjs              → riscrive i tubi dei nervi nel sorgente della pagina
     node strumenti/nervi-polso.mjs verifica     → elenca le compenetrazioni dei nervi, senza scrivere
     MODELLO=/tmp/copia.html node strumenti/nervi-polso.mjs   → lavora su una copia

   1) Piano sottocutaneo dorsale. Il ramo superficiale del nervo radiale, dopo essere uscito tra brachioradiale ed
      ECRL, decorre nel sottocute sopra il I compartimento (APL, EPB) e il retinacolo degli estensori, e incrocia
      superficialmente l'EPL nella tabacchiera anatomica (Abrams RA et al., J Hand Surg Am 1992; Robson AJ et al.,
      J Hand Surg Eur 2008). Il ramo cutaneo dorsale dell'ulnare gira attorno al margine ulnare sotto il FCU e poi
      è sottocutaneo, superficiale al retinacolo e alla guaina dell'ECU (Botte MJ et al., J Hand Surg Am 1990).
      I due tubi vengono spinti fuori da retinacoli, guaine, tendini, muscoli e ossa (almeno GIOCO oltre il raggio)
      restando sotto la cute e scansando le vene superficiali (cefalica, basilica, arcata dorsale), a cui passano
      sopra dove si incrociano. Le linee sono trattate come fili tesi (smussatura e vincoli alternati), senza spigoli.
   2) Divisioni. Un ramo non spunta più dall'estremità di un cilindro: nasce dentro il tronco, prossimalmente al
      punto di divisione, come un fascicolo affiancato agli altri (spostato verso il lato da cui uscirà), corre
      parallelo per un tratto e poi diverge con una curva dolce; l'origine del ramo è assottigliata (opzione `ini`
      di `tube`). Nelle divisioni terminali il tronco si appiattisce e si assottiglia verso la fine (opzioni `fin`,
      `piatto`), così i rami ne sembrano la continuazione. Divisioni nella tabella DIV.
   3) Cute. Vicino allo stiloide radiale e sul dorso ulnare la cute BodyParts3D dista dal retinacolo e dalle guaine
      meno del diametro del nervo: lì la cute si solleva con un rilievo dolce sopra il nervo (che infatti è palpabile),
      in modo che il nervo resti almeno SOTTO_CUTE sotto la superficie. Si riparte dalla cute della revisione ORIGINALE.
   Riparte sempre dai tubi e dalla cute della revisione ORIGINALE, quindi si può rilanciare. Va rilanciato se cambiano retinacoli,
   guaine o tendini dorsali; dopo, se serve, si rilanciano `retinacoli-polso.mjs` e `radio-volare-polso.mjs`, che
   leggono i tubi dal sorgente. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MODELLO ||= resolve(ROOT, 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs');
const { man, log, sstep, griglia, campo, sample } = G;

/* ============ Parametri ============ */
const ORIGINALE = '4c65cdd';                      // revisione con i tubi dei nervi originali (punto di partenza)
const FILE_REPO = 'modelli/polso-dito-3d.html';
const NERVI = ['nmed', 'nmedmot', 'ndig', 'nuln', 'nulnsup', 'nulnprof', 'nulndors', 'npalm', 'nradsup'];
const CARPO = ['scafoide', 'semilunare', 'piramidale', 'pisiforme', 'trapezio', 'trapezoide', 'capitato', 'uncinato', 'mc1', 'mc2', 'mc3', 'mc4', 'mc5'];
// piani profondi del sottocute dorsale: il nervo resta sopra tutti
const PROFONDI = ['retext', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'apl', 'epb', 'epl', 'ecrl', 'ecrb', 'edc', 'eip', 'edm', 'ecu', 'br', 'fcu',
  'radio', 'ulna', ...CARPO, 'apb', 'fpb', 'op', 'adm', 'fdm', 'odm', 'iod', 'add'];
const SOTTOCUTE = { nradsup: 'tutti', nulndors: 'tutti' };   // nervi da portare nel sottocute (tutti i loro tubi)
const VENE_SUP = ['vcef', 'vbas', 'varco'];   // vene sottocutanee del dorso: il nervo le scansa
const GIOCO = 0.04;      // distanza minima dai piani profondi, oltre il raggio (cm)
const SOTTO_CUTE = 0.05; // distanza dalla superficie cutanea, oltre il raggio (cm): dove il sottocute è più sottile
                         // la cute si solleva con un rilievo dolce sopra il nervo (sigma RILIEVO cm)
const RILIEVO = 0.6;
const PASSO = 0.1;   // passo dei punti dei tubi riposizionati (cm)
const SOTTO_CUTE_TESSUTI = 0.04;   // anche retinacolo, guaine e tendini dorsali restano almeno così sotto la cute (cm)
const TESSUTI = ['retext', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'apl', 'epb', 'epl', 'ecrl', 'ecrb', 'edc', 'eip', 'edm', 'ecu'];
// divisioni: genitore (id, indice del tubo), figlio (id, indice), lunghezza del tratto affiancato nel tronco (cm),
// lunghezza del raccordo sul decorso originale (cm), quota dello spostamento laterale (frazione dello spazio libero),
// ricorrente (cm): il ramo nasce di lato a questa distanza prima dell'origine e va subito verso il suo decorso
const DIV = [
  { da: ['nmed', 0], a: ['npalm', 0], aff: 1.0, racc: 1.2, k: 0.8 },
  { da: ['nmed', 0], a: ['nmedmot', 0], aff: 0.3, racc: 0.6, k: 0.75, ricorrente: 0.35 },
  { da: ['nmed', 0], a: ['ndig', 0], aff: 1.4, racc: 1.4, k: 0.75 },
  { da: ['nmed', 0], a: ['ndig', 1], aff: 1.1, racc: 1.2, k: 0.55 },
  { da: ['nmed', 0], a: ['ndig', 2], aff: 1.25, racc: 0.7, k: 0.3 },
  { da: ['nuln', 0], a: ['nulndors', 0], aff: 1.1, racc: 1.4, k: 0.8 },
  { da: ['nuln', 0], a: ['nulnsup', 0], aff: 0.9, racc: 1.0, k: 0.7 },
  { da: ['nuln', 0], a: ['nulnprof', 0], aff: 0.8, racc: 0.6, k: 0.7 },
  { da: ['nulnsup', 0], a: ['nulnsup', 1], aff: 0.8, racc: 1.0, k: 0.8 },
  { da: ['nradsup', 0], a: ['nradsup', 1], aff: 1.0, racc: 1.2, k: 0.75 },
  { da: ['nradsup', 0], a: ['nradsup', 2], aff: 1.1, racc: 1.2, k: 0.75 },
];
// tronchi che terminano dividendosi: assottigliamento finale [raggio finale, lunghezza] e appiattimento [rapporto, lunghezza]
const FINE = { 'nmed:0': { fin: [0.3, 1.3], piatto: [0.7, 2.0] }, 'nuln:0': { fin: [0.25, 0.9], piatto: [0.8, 1.4] }, 'nradsup:0': { fin: [0.25, 1.0], piatto: [0.8, 1.2] } };

/* ============ Utilità ============ */
const fmt = v => +v.toFixed(3);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => mul(a, 1 / (len(a) || 1));
const reTube = /tube\(\[\[(.*?)\]\],([\d.]+)(?:,(\{[^}]*\}))?\)/g;
let SORGENTE0 = null;
function rigaOriginale(id) {
  SORGENTE0 ??= execFileSync('git', ['show', `${ORIGINALE}:${FILE_REPO}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8');
  const r = SORGENTE0.split('\n').find(l => l.startsWith(`{id:'${id}',`)); if (!r) throw new Error('riga originale non trovata: ' + id);
  return r;
}
const leggi = riga => [...riga.matchAll(reTube)].map(m => ({ pts: m[1].split('],[').map(s => s.split(',').map(Number)), r: +m[2], o: {} }));
function sostituisciRiga(id, nuova) {
  const righe = G.M.html.split('\n'), i = righe.findIndex(l => l.startsWith(`{id:'${id}',`));
  if (i < 0) throw new Error('riga non trovata: ' + id);
  righe[i] = nuova; G.M.html = righe.join('\n');
}
// lunghezze cumulate lungo la polilinea; punto e tangente a una data ascissa
const ascisse = P => { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + len(sub(P[i], P[i - 1]))); return s; };
function aAscissa(P, S, s) {
  if (s <= 0) return { p: P[0], t: nrm(sub(P[1], P[0])) };
  for (let i = 1; i < P.length; i++) if (S[i] >= s) { const u = (s - S[i - 1]) / (S[i] - S[i - 1] || 1), d = sub(P[i], P[i - 1]); return { p: add(P[i - 1], mul(d, u)), t: nrm(d) }; }
  return { p: P.at(-1), t: nrm(sub(P.at(-1), P.at(-2))) };
}
// punto più vicino di una polilinea fitta
function vicino(Q, p) { let j = 0, d = Infinity; Q.forEach((c, i) => { const e = len(sub(c, p)); if (e < d) { d = e; j = i; } }); return { q: Q[j], d, j }; }
// polilinea ricampionata a passo costante (estremi compresi)
function ricampiona(P, passo) {
  const S = ascisse(P), L = S.at(-1), n = Math.max(2, Math.round(L / passo)), out = [];
  for (let q = 0; q <= n; q++) out.push(aAscissa(P, S, L * q / n).p);
  return out;
}
// smussatura dei punti interni, estremi fissi
function smussa(P, pass, fissi = new Set()) {
  for (let p = 0; p < pass; p++) { const B = P.map(v => v.slice());
    for (let i = 1; i < P.length - 1; i++) if (!fissi.has(i)) for (const k of [0, 1, 2]) B[i][k] = (P[i - 1][k] + 2 * P[i][k] + P[i + 1][k]) / 4;
    P.splice(0, P.length, ...B); }
}

/* ============ 1) Sottocute dorsale ============ */
const RICHIESTE = [];   // punti dell'asse troppo vicini alla cute: { p, need (cm), n (normale cutanea) }
function sottocute(T) {
  for (const id of Object.keys(SOTTOCUTE)) {
    const tubi = T[id], tutti = tubi.flatMap(t => t.pts);
    const lo = [0, 1, 2].map(k => Math.min(...tutti.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...tutti.map(p => p[k])));
    griglia(lo, hi, 0.03, 0.5);
    const nomi = PROFONDI.filter(n => man.meshes.some(m => m.n === n));
    const Fp = campo(nomi).F, Fc = campo(['cute']).F;
    const gr = (F, p) => { const e = 0.05, g = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return sample(F, ...a) - sample(F, ...b); }); return nrm(g); };
    // direzione di risalita: verso la cute (normale della superficie cutanea), non lungo il gradiente dei piani profondi,
    // che tra due tendini vicini ha un crinale e lascerebbe il nervo incastrato tra i due
    const su = p => { const a = gr(Fc, p), b = gr(Fp, p); return nrm(add(mul(a, 0.8), mul(b, 0.2))); };
    // filo teso: punti ogni PASSO cm; a ogni giro smussatura, poi la cute tira dentro (vincolo morbido) e i piani
    // profondi spingono fuori (vincolo rigido): la linea scavalca i rilievi senza spigoli. Il tronco si elabora insieme
    // al primo ramo, come un'unica linea; gli altri rami partono dal tronco già fissato
    const filo = (P, r, fissi) => {
      const tgt = r + GIOCO, tgtC = r + SOTTO_CUTE, y0 = P.map(p => p[1]);
      const vincoli = () => { for (let i = fissi; i < P.length; i++) {
        const dc = sample(Fc, ...P[i]); if (dc > -tgtC) P[i] = add(P[i], mul(gr(Fc, P[i]), -(dc + tgtC) * 0.03));
        // vena: il nervo se ne allontana di lato o le passa sopra (mai sotto: sotto ci sono i piani profondi);
        // dove i due si incrociano il nervo scavalca la vena e la cute si solleva un poco
        for (const v of VENE) { const { q, d } = vicino(v.pts, P[i]), m = r + v.r + GIOCO; if (d >= m) continue;
          const n = su(P[i]), w = sub(P[i], q), dir = nrm(add(w, mul(n, Math.abs(dot(w, n)) - dot(w, n) + 0.3 * m)));
          P[i] = add(P[i], mul(dir, (m - d) * 0.7)); }
        if (i === 0 || i === P.length - 1) P[i][1] = y0[i];   // estremi sul piano di sezione o sull'origine
        for (let q = 0; q < 3; q++) { const d = sample(Fp, ...P[i]); if (d < tgt) P[i] = add(P[i], mul(su(P[i]), tgt - d + 0.002)); } } };
      const fx = new Set(Array.from({ length: fissi }, (_, i) => i));
      for (let it = 0; it < 1500; it++) { smussa(P, 1, fx); vincoli(); }
      return P;
    };
    // vene superficiali (tubi della pagina): il nervo le scansa, non le attraversa
    const VENE = VENE_SUP.flatMap(v => leggi(G.M.html.split('\n').find(l => l.startsWith(`{id:'${v}',`)))).map(t => ({ pts: ricampiona(t.pts, 0.03), r: t.r }));
    const tr = ricampiona(tubi[0].pts, PASSO), k = tr.length - 1, R = tubi.map(t => ricampiona(t.pts, PASSO));
    if (tubi.length === 1) tubi[0].pts = filo(tr, tubi[0].r, 0);
    else {
      const A = filo([...tr, ...R[1].slice(1)], Math.min(tubi[0].r, tubi[1].r), 0);
      tubi[0].pts = A.slice(0, k + 1); tubi[1].pts = A.slice(k);
      for (let b = 2; b < tubi.length; b++) tubi[b].pts = filo([...tubi[0].pts, ...R[b].slice(1)], tubi[b].r, k + 1).slice(k);
    }
    // sollevamento della cute richiesto lungo l'asse (ogni 0,5 mm): profondità sotto la cute almeno r + SOTTO_CUTE,
    // nella direzione della normale cutanea
    for (const { pts, r } of tubi) for (let s = 0; s < pts.length - 1; s++) {
      const n = Math.max(1, Math.ceil(len(sub(pts[s + 1], pts[s])) / 0.05));
      for (let q = 0; q < n; q++) { const p = add(pts[s], mul(sub(pts[s + 1], pts[s]), q / n)), need = sample(Fc, ...p) + r + SOTTO_CUTE;
        if (need > 0) { const g = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += 0.05; b[k] -= 0.05; return sample(Fc, ...a) - sample(Fc, ...b); }); RICHIESTE.push({ p, need, n: nrm(g) }); } }
    }
    log(id, 'portato nel sottocute');
  }
}

/* ============ 3) Cute sollevata sopra i nervi sottocutanei ============ */
function cute() {
  // anche i vertici di retinacolo, guaine e tendini che arrivano alla cute (o la superano: nella cute BodyParts3D il
  // sottocute sopra lo stiloide radiale è quasi assente)
  griglia([-4.6, -3.5, -2.6], [2.6, 3.5, 2.6], 0.03, 0.2); const Fc = campo(['cute']).F;
  for (const n of TESSUTI) { if (!man.meshes.some(m => m.n === n)) continue; const { pos } = G.REAL(n);
    for (let i = 0; i < pos.length; i += 3) { const p = [pos[i], pos[i + 1], pos[i + 2]]; if (Math.abs(p[1]) > 3.4) continue;
      const need = sample(Fc, ...p) + SOTTO_CUTE_TESSUTI;
      if (need > 0) { const g = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += 0.05; b[k] -= 0.05; return sample(Fc, ...a) - sample(Fc, ...b); }); RICHIESTE.push({ p, need, n: nrm(g) }); } } }
  const pos = G.REAL('cute').pos.slice(), nv = pos.length / 3;
  const box = [0, 1, 2].map(k => [Math.min(...RICHIESTE.map(a => a.p[k])) - 1, Math.max(...RICHIESTE.map(a => a.p[k])) + 1]);
  let mx = 0, mossi = 0;
  for (let i = 0; i < nv; i++) {
    const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (![0, 1, 2].every(k => q[k] > box[k][0] && q[k] < box[k][1])) continue;
    let best = 0, dir = null;
    for (const a of RICHIESTE) { const w = (a.need * 1.3 + 0.02) * Math.exp(-0.5 * (len(sub(q, a.p)) / RILIEVO) ** 2); if (w > best) { best = w; dir = a.n; } }
    if (best < 1e-4) continue;
    for (let k = 0; k < 3; k++) pos[3 * i + k] += dir[k] * best;
    mx = Math.max(mx, best); mossi++;
  }
  G.setPos('cute', pos);
  log('cute sollevata sopra i nervi:', mossi, 'vertici, fino a', (mx * 10).toFixed(1), 'mm');
}

/* ============ 0) Versante volare: nervi fuori da tendini, muscoli e retinacoli ============ */
const VOLARI = { // tubo → strutture da cui deve stare lontano (oltre il raggio)
  'nmed:0': ['retfl', 'fds', 'fdp', 'fpl', 'fcr', 'gfcr', 'pl', 'pq', 'capvol', 'radio', 'ulna', 'semilunare', 'capitato', 'scafoide', 'trapezio'],
  'nmedmot:0': ['retfl', 'apb', 'fpb', 'op', 'trapezio', 'mc1'],
  'nuln:0': ['fcu', 'pisiforme', 'retfl', 'tettoguy', 'ulna', 'fds', 'fdp'],
  'nulnprof:0': ['uncinato', 'pisiforme', 'fdm', 'odm', 'adm', 'retfl', 'mc5', 'mc4'],
  // nervi digitali comuni: profondi all'aponeurosi palmare (`pl`), sopra i tendini flessori e i lombricali
  'ndig:0': ['pl', 'retfl', 'fds', 'fdp', 'lumb', 'mc2', 'mc3', 'mc4', 'add'],
  'ndig:1': ['pl', 'retfl', 'fds', 'fdp', 'lumb', 'mc2', 'mc3', 'mc4', 'add'],
  'ndig:2': ['pl', 'retfl', 'fds', 'fdp', 'lumb', 'mc2', 'mc3', 'mc4', 'add', 'apb', 'fpb'],
  'nulnsup:0': ['pl', 'retfl', 'tettoguy', 'pisiforme', 'adm', 'fdm', 'fds', 'fdp', 'lumb', 'mc4', 'mc5'],
  'nulnsup:1': ['pl', 'retfl', 'tettoguy', 'pisiforme', 'adm', 'fdm', 'fds', 'fdp', 'lumb', 'mc4', 'mc5'],
};
// estremi liberi di scorrere sul loro piano (y fisso): inizio del tronco (piano di sezione) e fine dei rami digitali;
// tutti gli altri estremi sono origini o divisioni e restano dove sono
const LIBERI = { 'nmed:0': [1, 0], 'nuln:0': [1, 0], 'ndig:0': [0, 1], 'ndig:1': [0, 1], 'ndig:2': [0, 1], 'nulnsup:0': [0, 1], 'nulnsup:1': [0, 1] };
// nel tunnel carpale il mediano è appiattito (sezione ovale, larga e bassa a parità di area): rapporto altezza/larghezza
const TUNNEL = { y: [-2.8, -0.4], rampa: 0.6, rapporto: 0.7 };
const rtTunnel = y => 1 - (1 - TUNNEL.rapporto) * sstep(TUNNEL.y[0] - TUNNEL.rampa, TUNNEL.y[0], y) * (1 - sstep(TUNNEL.y[1], TUNNEL.y[1] + TUNNEL.rampa, y));
const rEff = (id, y, r) => id === 'nmed' ? r * Math.sqrt(rtTunnel(y)) : r;   // raggio nella direzione volare-dorsale
// sezione ovale del mediano (tronco): punti del contorno nel piano x-z, semiassi larghezza r/√rt e altezza r√rt
const OVALE = [...Array(12).keys()].map(i => i / 12 * 2 * Math.PI);
const contorno = (id, y, r) => id !== 'nmed' ? null : OVALE.map(a => [r / Math.sqrt(rtTunnel(y)) * Math.cos(a), 0, r * Math.sqrt(rtTunnel(y)) * Math.sin(a)]);
// quota (distanza dal campo F meno il raggio) peggiore sul contorno della sezione, e il suo punto
function peggioreContorno(F, id, p, r) {
  const C = contorno(id, p[1], r); if (!C) return { d: sample(F, ...p) - r, q: p, c: [0, 0, 0] };
  let d = 1e9, q = p, c = null; for (const o of C) { const x = add(p, o), e = sample(F, ...x); if (e < d) { d = e; q = x; c = o; } } return { d, q, c };
}
const SOTTO_PL = ['ndig', 'nulnsup'];   // nervi che stanno sempre profondi all'aponeurosi palmare
const GIOCO_V = 0.03;
const EXTRA_V = { gfcr: 0.04 };   // spazio per la lamina profonda del retinacolo tra il tunnel del FCR e il mediano (cm)   // distanza minima (cm) oltre il raggio
function volari(T) {
  for (const [chiave, nomi] of Object.entries(VOLARI)) {
    const [id, b] = chiave.split(':'), t = T[id][+b], r = t.r;
    const P = ricampiona(t.pts, 0.1), n = P.length;
    const lo = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
    griglia(lo, hi, 0.03, 0.4);
    const noms = nomi.filter(m => man.meshes.some(x => x.n === m)), Fs = noms.map(m => campo([m]).F);
    const gr = (F, p) => { const e = 0.05, g = [0, 1, 2].map(k => { const a = p.slice(), c = p.slice(); a[k] += e; c[k] -= e; return sample(F, ...a) - sample(F, ...c); }); return nrm(g); };
    const [l0, l1] = LIBERI[chiave] || [0, 0], fx = new Set([...(l0 ? [] : [0]), ...(l1 ? [] : [n - 1])]), y0 = P[0][1], y1 = P[n - 1][1];
    // filo teso: smussatura e vincoli alternati (come per i rami dorsali), così la linea scavalca gli ostacoli senza spigoli
    const spingi = k => { for (let i = 0; i < n; i++) { if (fx.has(i)) continue; Fs.forEach((F, j) => { const { d: d0, q } = peggioreContorno(F, id, P[i], r), ex = GIOCO_V + (EXTRA_V[noms[j]] || 0), d = d0 - (ex - GIOCO_V); if (d - GIOCO_V >= 0) return;
      // l'aponeurosi palmare è un telo sottile: il nervo sta sempre sotto (dorsalmente), il gradiente cambierebbe verso attraversandola
      const dir = noms[j] === 'pl' && SOTTO_PL.includes(id) ? [0, 0, -1] : gr(F, q); P[i] = add(P[i], mul(dir, -(d - GIOCO_V) * k)); }); } };
    const piani = () => { P[0][1] = y0; P[n - 1][1] = y1; };
    for (let it = 0; it < 1500; it++) { spingi(0.8); piani(); smussa(P, 2, fx); piani(); }
    for (let it = 0; it < 40; it++) spingi(1);
    const sp = Math.max(...P.map((p, i) => len(sub(p, aAscissa(t.pts, ascisse(t.pts), ascisse(P)[i] * ascisse(t.pts).at(-1) / ascisse(P).at(-1)).p))));
    t.pts = P; log(chiave, 'versante volare: scostamento massimo', (sp * 10).toFixed(1), 'mm');
  }
}

/* ============ 2) Divisioni ============ */
function divisioni(T) {
  for (const { da, a, aff, racc, k, ricorrente } of DIV) {
    const tr = T[da[0]][da[1]], ra = T[a[0]][a[1]], P = tr.pts, S = ascisse(P), C = ra.pts, SC = ascisse(C);
    // punto di origine sul tronco: il più vicino al primo punto del ramo
    let j = 0, dm = Infinity; P.forEach((q, i) => { const d = len(sub(q, C[0])); if (d < dm) { dm = d; j = i; } });
    const s0 = S[j], { t: Tt } = aAscissa(P, S, s0), terminale = j === P.length - 1;
    // lato d'uscita: direzione del ramo dopo il raccordo, senza la componente lungo il tronco
    const dir = sub(aAscissa(C, SC, Math.min(racc, SC.at(-1))).p, C[0]); let lat = sub(dir, mul(Tt, dot(dir, Tt)));
    if (len(lat) < 1e-3) lat = [0, 0, 1]; lat = nrm(lat);
    const Rloc = terminale ? tr.r * ((FINE[da.join(':')]?.fin?.[0] ?? 1) + 1) / 2 : tr.r;
    const m = Math.max(0, Rloc - ra.r) * k;
    // tratto affiancato dentro il tronco (dall'ascissa s0 − aff all'origine), poi decorso originale con lo spostamento che si annulla
    const pre = [], n = Math.max(3, Math.round(aff / 0.15));
    for (let q = 0; q < n; q++) { const s = s0 - aff + aff * q / n, { p } = aAscissa(P, S, s); pre.push(add(p, mul(lat, m * (0.55 + 0.45 * q / n)))); }
    const post = C.map((p, i) => add(p, mul(lat, m * (1 - sstep(0, racc, SC[i])))));
    // ramo ricorrente (motorio del mediano): esce dal fianco del tronco poco prima della divisione e va subito
    // all'indietro verso i tenari, senza correre in avanti nel tronco e ripiegare su sé stesso
    if (ricorrente) {
      pre.length = 0;
      for (const [ds, f] of [[ricorrente + aff, 0.5], [ricorrente, 1]]) pre.push(add(aAscissa(P, S, s0 - ds).p, mul(lat, m * f)));
      post.splice(0, post.findIndex((_, i) => SC[i] >= 0.4));
    }
    ra.pts = [...pre, ...post];
    ra.o.ini = [0.35, Math.min(0.5, aff * 0.45)];
  }
  for (const [chiave, f] of Object.entries(FINE)) {
    const [id, b] = chiave.split(':'), t = T[id][+b], L = ascisse(t.pts).at(-1);
    if (f.fin) t.o.fin = f.fin;
    const tunnel = id === 'nmed' && +b === 0, pts = t.pts, S = ascisse(pts);
    if (f.piatto || tunnel) { // rapporto altezza/larghezza lungo il tubo: appiattimento finale e, per il mediano, tunnel carpale
      const prof = u => { const s = u * L; let q = 1;
        if (f.piatto) q = Math.min(q, 1 - (1 - f.piatto[0]) * sstep(L - f.piatto[1], L, s));
        if (tunnel) q = Math.min(q, rtTunnel(aAscissa(pts, S, s).p[1]));
        return q; };
      t.o.piatto = Array.from({ length: 41 }, (_, i) => [fmt(i / 40), fmt(prof(i / 40))]); t.o.wdir = [1, 0, 0];
    }
  }
}

/* ============ Scrittura ============ */
const opz = o => '{' + ['urep:6', ...Object.entries(o).map(([k, v]) => k + ':' + JSON.stringify(v))].join(',') + '}';
function scrivi(T) {
  for (const id of NERVI) {
    let i = 0;
    const riga = rigaOriginale(id).replace(reTube, () => { const t = T[id][i++];
      return 'tube([' + t.pts.map(p => '[' + p.map(fmt).join(',') + ']').join(',') + '],' + t.r + ',' + opz(t.o) + ')'; });
    sostituisciRiga(id, riga);
  }
}

/* ============ Verifica ============ */
const CONTRO = {
  nradsup: ['retext', 'g1', 'g2', 'g3', 'apl', 'epb', 'epl', 'ecrl', 'ecrb', 'br', 'radio', 'scafoide', 'trapezio', 'mc1', 'mc2', 'iod', 'add'],
  nulndors: ['retext', 'g5', 'g6', 'ecu', 'edm', 'edc', 'fcu', 'ulna', 'piramidale', 'uncinato', 'mc4', 'mc5', 'adm'],
  nmed: ['retfl', 'fds', 'fdp', 'fpl', 'fcr', 'pl', 'pq', 'capvol'], npalm: ['retfl', 'pl', 'fcr', 'apb'], nmedmot: ['retfl', 'apb', 'fpb', 'op'],
  ndig: ['pl', 'retfl', 'fds', 'fdp', 'lumb'], nuln: ['fcu', 'pisiforme', 'retfl', 'tettoguy'], nulnsup: ['pl', 'retfl', 'tettoguy', 'pisiforme', 'adm'],
  nulnprof: ['uncinato', 'pisiforme', 'fdm', 'odm', 'adm'],
};
function verifica() {
  const mix = (a, b, t) => a + (b - a) * t;
  for (const id of NERVI) leggi(G.M.html.split('\n').find(l => l.startsWith(`{id:'${id}',`))).forEach(({ pts, r }, b) => {
    const P = []; for (let s = 0; s < pts.length - 1; s++) for (let q = 0; q < 4; q++) P.push(pts[s].map((v, k) => mix(v, pts[s + 1][k], q / 4)));
    const lo = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
    griglia(lo, hi, 0.03, 0.4);
    for (const c of (CONTRO[id] || [])) {
      if (!man.meshes.some(m => m.n === c)) continue;
      const { F } = campo([c]); let n = 0, peggio = 0, dove = null;
      for (const p of P) { const d = peggioreContorno(F, id, p, r).d; if (d < -0.02) { n++; if (d < peggio) { peggio = d; dove = p; } } }
      if (n) log(`  ${id}[${b}] dentro ${c}: ${n} punti (fino a ${(-peggio * 10).toFixed(1)} mm, y = ${dove[1].toFixed(2)})`);
    }
    if (SOTTOCUTE[id]) { G.griglia(lo, hi, 0.03, 0.4); const { F } = campo(['cute']); const fuori = P.filter(p => sample(F, ...p) > -r).length;
      if (fuori) log(`  ${id}[${b}] fuori dalla cute: ${fuori} punti`); }
  });
}

/* ============ Esecuzione ============ */
if (process.argv.includes('verifica')) verifica();
else {
  G.setPos('cute', G.posDaRevisione(ORIGINALE, 'cute', FILE_REPO));
  const T = Object.fromEntries(NERVI.map(id => [id, leggi(rigaOriginale(id))]));
  volari(T);
  sottocute(T);
  cute();
  divisioni(T);
  scrivi(T);
  G.saveFile(G.repack());
}
