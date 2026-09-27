/* Decorso di vene e nervi del ginocchio (tubi procedurali in modelli/ginocchio-3d.html) nei piani anatomici corretti,
   senza attraversare ossa, muscoli, tendini o legamenti.

   Uso (dalla cartella del progetto, dopo stratifica-ginocchio.mjs e capsula-ginocchio.mjs):
     node strumenti/percorsi-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file. Le linee guida di partenza sono i decorsi originali
   (revisione git ORIGINALE, con qualche punto di passaggio anatomico), quindi lo script si può rilanciare.

   Anatomia di riferimento (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020):
   - Vena grande safena: sottocutanea per tutto il decorso, nella fascia superficiale sopra la fascia profonda; al ginocchio
     passa dietro i condili mediali di femore e tibia, circa un palmo dietro il margine mediale della rotula, quindi
     superficiale ai tendini della zampa d'oca.
   - Nervo safeno: nel canale degli adduttori e poi dietro il sartorio; al lato mediale del ginocchio perfora la fascia
     lata tra i tendini di sartorio e gracile e diventa sottocutaneo, scendendo con la grande safena. Il ramo
     infrarotuleo perfora il sartorio e curva in avanti, sottocutaneo, sotto la rotula.
   - Nervo peroneo comune: lungo il margine mediale del bicipite femorale, tra il suo tendine e il capo laterale del
     gastrocnemio; passa dietro la testa del perone e gira attorno al collo, profondo al peroneo lungo, dove si divide.
   - Nervo peroneo superficiale: nella loggia laterale, profondo al peroneo lungo, tra i peronieri e l'estensore lungo
     delle dita; diventa sottocutaneo solo nel terzo distale della gamba (oltre i limiti del modello).
   - Nervo peroneo profondo: attraversa il setto intermuscolare anteriore, passa profondo all'estensore lungo delle dita e
     scende sulla membrana interossea, laterale all'arteria tibiale anteriore, tra tibiale anteriore ed estensore lungo.

   Metodo: la linea guida di ogni tubo è campionata ogni 2,5 mm; in ogni sezione trasversale si valutano le posizioni
   possibili entro 1,6 cm e la programmazione dinamica sceglie il percorso di costo minimo. Il costo somma la
   compenetrazione (al quadrato) nelle strutture da evitare e negli altri tubi, la distanza dalla guida, la regolarità
   del decorso e, per i tubi sottocutanei, la distanza dall'involucro delle strutture profonde e dalla cute (per quelli
   profondi, una profondità minima sotto l'involucro). I rami restano collegati al tronco da cui nascono. */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { M, FILE, REAL, setGriglia, solid, edt, sample, clamp, log } from './lib-modello.mjs';
import * as G from './lib-modello.mjs'; // griglia corrente (O, H, NX, NY, NZ, N cambiano con setGriglia)

const PROVA = process.argv.includes('--prova');
const ORIGINALE = 'b4df739';
const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const H0 = execFileSync('git', ['show', `${ORIGINALE}:modelli/ginocchio-3d.html`], { cwd: RADICE, maxBuffer: 1 << 30 }).toString('utf8');

/* ============ Tubi nel sorgente della pagina ============ */
// tutti i tubi di una struttura: punti, raggio, posizione del testo dei punti
function tubi(html, id) {
  const i = html.indexOf(`{id:'${id}',`); if (i < 0) throw new Error('struttura ' + id);
  const fine = html.indexOf('\n {id:', i + 5), out = [];
  for (let j = html.indexOf('tube([[', i); j >= 0 && j < fine; j = html.indexOf('tube([[', j + 1)) {
    const k = html.indexOf(']]', j); out.push({ pts: JSON.parse(html.slice(j + 5, k + 2)), r: parseFloat(html.slice(k + 3)), a: j + 5, b: k + 2 });
  }
  return out;
}
const TUBI = [...M.html.matchAll(/\{id:'(\w+)',nw:1,cat:'(?:art|ven|ner)'/g)].map(m => m[1]);
const correnti = new Map(TUBI.map(id => [id, tubi(M.html, id).map(t => ({ pts: t.pts, r: t.r }))])); // aggiornati man mano

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(...a), nrm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ricampiona(P, passo) {
  const out = [P[0]]; let resto = 0;
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = len(sub(b, a)); let t = passo - resto;
    while (t <= L) { out.push(add(a, sub(b, a), t / L)); t += passo; } resto = L - (t - passo); }
  if (len(sub(P[P.length - 1], out[out.length - 1])) > passo * 0.3) out.push(P[P.length - 1]); return out;
}
const distSeg = (p, a, b) => { const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1); return len(sub(p, add(a, ab, t))); };
const distPoli = (p, P) => { let m = Infinity; for (let i = 1; i < P.length; i++) m = Math.min(m, distSeg(p, P[i - 1], P[i])); return m; };
const vicino = (P, q) => { let bi = 0, bd = Infinity; P.forEach((p, i) => { const d = len(sub(p, q)); if (d < bd) { bd = d; bi = i; } }); return P[bi]; };

/* ============ Strutture ============ */
const OSSA = ['femore', 'tibia', 'perone', 'rotula'];
const MUSCOLI = ['retto', 'vint', 'vmed', 'vlat', 'sart', 'grac', 'semit', 'semim', 'biclong', 'bicbrev', 'addmag', 'gmed', 'glat', 'plant', 'pop', 'sol',
  'tibant', 'extdig', 'perlong', 'tibpost', 'fdl', 'fhl', 'ehl', 'perbrev'];
const FIBROSE = ['itb', 'lcm', 'lcl', 'all', 'popfib', 'tenrot', 'tenquad', 'retmed', 'retlat', 'mpfl'];
const BORSE = ['bans', 'bgsm', 'bprep', 'binfsup'];
const PROFONDE = [...OSSA, ...MUSCOLI, ...FIBROSE, ...BORSE]; // involucro sotto la fascia superficiale
const pesi = n => OSSA.includes(n) ? 120 : FIBROSE.includes(n) ? 60 : 40;

/* ============ Percorsi ============ */
// modo(y): 'sup' sottocutaneo, 'prof' profondo (sotto l'involucro), null libero; fisso: estremi bloccati
const PERCORSI = [
  { id: 'vgs', modo: () => 'sup', ignora: ['nsaf', 'ninfra'] },
  // sopra il ginocchio dietro il sartorio (profondo), poi tra sartorio e gracile fino al sottocute
  { id: 'nsaf', fissoInizio: true, accompagna: 'vgs', modo: y => y > 3.5 ? 'prof' : y > 1.8 ? null : 'sup', prof: 0.3, guidaPesi: y => y > 4.5 ? 1 : 0.3, ignora: ['adisc'] },
  { id: 'ninfra', attacca: 'nsaf', modo: () => 'sup' },
  // dietro la testa del perone e attorno al collo; la divisione è profonda al peroneo lungo, sull'osso (tunnel fibulare)
  { id: 'nper', fissoInizio: true, modo: y => y < -5.3 ? 'prof' : null, prof: 0.3, liberi: ['perlong'], liberiFino: -Infinity, ignora: ['nsci', 'ntib'],
    via: [[-4.25, -3.0, -3.0], [-4.85, -4.2, -2.6], [-5.2, -5.2, -1.9], [-4.85, -5.9, -1.05]] },
  { id: 'nsurlat', attacca: 'nper', modo: y => y > 1.5 ? null : 'sup' }, // perfora la fascia sopra il capo laterale del gastrocnemio
  // nel setto intermuscolare tra peroneo lungo ed estensore lungo delle dita (nel modello i due muscoli poggiano sul
  // perone senza spazio tra loro e l'osso: il nervo segue il solco tra i due, senza attraversarne i ventri)
  { id: 'nperS', attacca: 'nper', modo: () => 'prof', prof: 0.35, liberi: ['perlong'], liberiFino: -6.6 },
  { id: 'nperP', attacca: 'nper', modo: () => 'prof', prof: 0.35, liberi: ['perlong'], liberiFino: -6.6 },
];
const R = 1.6, HC = 0.06, PASSO = 0.25, DMAX = 0.3, MARG = 0.03;

function guida(P) {
  let g = tubi(H0, P.id)[0].pts.map(p => p.slice());
  if (P.via) { // sostituisce il tratto distale della guida con i punti di passaggio
    const y0 = P.via[0][1] + 0.8; g = g.filter(p => p[1] > y0).concat(P.via);
  }
  if (P.attacca) { const tr = correnti.get(P.attacca)[0].pts, orig = tubi(H0, P.attacca)[0].pts;
    // il ramo nasce dal punto del tronco corrispondente a quello originale (estremo del tronco o punto più vicino)
    const q0 = g[0], fineTronco = len(sub(orig[orig.length - 1], q0)) < 0.05;
    g[0] = fineTronco ? tr[tr.length - 1].slice() : vicino(ricampiona(tr, 0.1), q0).slice(); }
  return g;
}

const BB = new Map(); // ingombro delle mesh, per saltare quelle fuori dalla griglia
const dentro = (n, lo, hi) => { if (!BB.has(n)) { const { pos } = REAL(n), a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; a[k] = Math.min(a[k], pos[i]); b[k] = Math.max(b[k], pos[i]); } BB.set(n, [a, b]); }
  const [a, b] = BB.get(n); return [0, 1, 2].every(k => b[k] > lo[k] && a[k] < hi[k]); };
function campi(P, g, r) {
  const lo = [0, 1, 2].map(k => Math.min(...g.map(p => p[k])) - R - 1.2), hi = [0, 1, 2].map(k => Math.max(...g.map(p => p[k])) + R + 1.2);
  setGriglia(lo, 0.1, Math.ceil((hi[0] - lo[0]) / 0.1), Math.ceil((hi[1] - lo[1]) / 0.1), Math.ceil((hi[2] - lo[2]) / 0.1));
  const Pen = new Float32Array(G.N), liberi = new Set(P.liberi || []);
  const PenL = liberi.size ? new Float32Array(G.N) : null; // compenetrazione nelle strutture attraversate solo all'origine
  const U = new Uint8Array(G.N), Dmin = new Float32Array(G.N).fill(1e9); // distanza con segno dalla struttura più vicina (per le verifiche)
  for (const n of PROFONDE) {
    if (!dentro(n, lo, hi)) continue;
    const S = solid(n); for (let i = 0; i < G.N; i++) U[i] |= S[i];
    const Do = edt(S), Di = edt(S, true), w = pesi(n), T = liberi.has(n) ? PenL : Pen;
    for (let i = 0; i < G.N; i++) { const d = Do[i] - Di[i], p = r + MARG - d; if (p > 0) T[i] += w * p * p; if (T === Pen && d < Dmin[i]) Dmin[i] = d; }
  }
  // altri tubi (vasi e nervi), esclusi il tubo stesso, il tronco da cui nasce e i suoi rami
  const fam = new Set([P.id, P.attacca, ...(P.ignora || []), ...PERCORSI.filter(q => q.attacca === P.id).map(q => q.id)]);
  if (P.attacca) PERCORSI.filter(q => q.attacca === P.attacca).forEach(q => fam.add(q.id));
  for (const [id, lista] of correnti) { if (fam.has(id)) continue;
    for (const t of lista) { const pts = ricampiona(t.pts, 0.1), rr = t.r + r + MARG;
      if (!pts.some(p => p.every((v, k) => v > lo[k] - rr && v < hi[k] + rr))) continue;
      const D = new Float32Array(G.N).fill(Infinity);
      for (const p of pts) { const i0 = Math.floor((p[0] - rr - G.O[0]) / G.H), i1 = Math.ceil((p[0] + rr - G.O[0]) / G.H), j0 = Math.floor((p[1] - rr - G.O[1]) / G.H), j1 = Math.ceil((p[1] + rr - G.O[1]) / G.H), k0 = Math.floor((p[2] - rr - G.O[2]) / G.H), k1 = Math.ceil((p[2] + rr - G.O[2]) / G.H);
        for (let k = Math.max(0, k0); k <= Math.min(G.NZ - 1, k1); k++) for (let j = Math.max(0, j0); j <= Math.min(G.NY - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(G.NX - 1, i1); i++) {
          const x = G.O[0] + (i + 0.5) * G.H, y = G.O[1] + (j + 0.5) * G.H, z = G.O[2] + (k + 0.5) * G.H, d = Math.hypot(x - p[0], y - p[1], z - p[2]), id2 = i + G.NX * j + G.NXY * k; if (d < D[id2]) D[id2] = d; } }
      for (let i = 0; i < G.N; i++) { const p = rr - D[i]; if (p > 0) Pen[i] += 40 * p * p; } } }
  // involucro delle strutture profonde (chiusura morfologica di 4 mm: niente solchi tra muscoli vicini) e cute
  const D1 = edt(U), C = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) C[i] = D1[i] <= 0.4 ? 1 : 0;
  const D2 = edt(C, true); for (let i = 0; i < G.N; i++) C[i] = (D2[i] > 0.4 || U[i]) ? 1 : 0;
  const Eo = edt(C), Ei = edt(C, true), E = new Float32Array(G.N); for (let i = 0; i < G.N; i++) E[i] = Eo[i] - Ei[i];
  const K = edt(solid('cute'), true);
  return { Pen, PenL, E, K, Dmin };
}

function instrada(P) {
  const g = guida(P), r = tubi(M.html, P.id)[0].r, F = campi(P, g, r);
  const S = ricampiona(g, PASSO), n = S.length;
  // riferimenti trasversali lungo la guida (trasporto parallelo)
  const T = S.map((_, k) => nrm(sub(S[Math.min(n - 1, k + 1)], S[Math.max(0, k - 1)])));
  const Ux = [], Vx = []; let u = nrm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  for (let k = 0; k < n; k++) { u = nrm(sub(u, T[k].map(v => v * dot(u, T[k])))); Ux.push(u); Vx.push(cross(T[k], u)); }
  const C = [], idx = new Map(), m = Math.round(R / HC);
  for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) if (a * a + b * b <= m * m) { idx.set(a + ',' + b, C.length); C.push([a, b]); }
  const nd = Math.ceil(DMAX / HC), vic = C.map(([a, b]) => { const l = []; for (let da = -nd; da <= nd; da++) for (let db = -nd; db <= nd; db++) { if (da * da + db * db > nd * nd) continue; const j = idx.get((a + da) + ',' + (b + db)); if (j !== undefined) l.push(j); } return l; });
  const comp = P.accompagna ? ricampiona(correnti.get(P.accompagna)[0].pts, 0.2) : null, rc = P.accompagna ? correnti.get(P.accompagna)[0].r : 0;
  const punto = (k, c) => add(add(S[k], Ux[k], C[c][0] * HC), Vx[k], C[c][1] * HC);
  const costo = (k, c) => {
    const p = punto(k, c), [x, y, z] = p, o2 = (C[c][0] ** 2 + C[c][1] ** 2) * HC * HC;
    let v = sample(F.Pen, x, y, z) + 0.3 * (P.guidaPesi ? P.guidaPesi(y) : 1) * o2;
    if (F.PenL && y < P.liberiFino) v += sample(F.PenL, x, y, z); // sopra liberiFino la struttura si può attraversare (tunnel)
    const md = P.modo(y), e = sample(F.E, x, y, z);
    if (md === 'sup') { const s = sample(F.K, x, y, z); v += 30 * Math.max(0, e - (r + 0.06)) ** 2 + 60 * Math.max(0, r + 0.02 - e) ** 2 + 60 * Math.max(0, r + 0.05 - s) ** 2; }
    else if (md === 'prof') v += 30 * Math.max(0, P.prof + e) ** 2;
    if (comp && y < 1.5) { let dv = Infinity; for (const q of comp) dv = Math.min(dv, Math.hypot(x - q[0], y - q[1], z - q[2])); v += 10 * Math.max(0, dv - (r + rc + 0.3)) ** 2; }
    return v;
  };
  const nc = C.length, zero = idx.get('0,0'), fissoI = P.fissoInizio || P.attacca, fissoF = P.fissoFine;
  let cur = new Float64Array(nc).fill(Infinity), back = [];
  if (fissoI) cur[zero] = 0; else for (let c = 0; c < nc; c++) cur[c] = costo(0, c);
  for (let k = 1; k < n; k++) {
    const nx = new Float64Array(nc).fill(Infinity), bk = new Int32Array(nc).fill(-1), ds = len(sub(S[k], S[k - 1])) || PASSO;
    for (let c = 0; c < nc; c++) { if (fissoF && k === n - 1 && c !== zero) continue; let best = Infinity, bi = -1;
      for (const j of vic[c]) { const pc = cur[j]; if (pc === Infinity) continue; const da = (C[c][0] - C[j][0]) * HC, db = (C[c][1] - C[j][1]) * HC, t = pc + 4 * (da * da + db * db) / ds; if (t < best) { best = t; bi = j; } }
      if (bi >= 0) { nx[c] = best + costo(k, c); bk[c] = bi; } }
    cur = nx; back.push(bk);
  }
  let c = 0; for (let j = 1; j < nc; j++) if (cur[j] < cur[c]) c = j;
  const path = new Array(n); for (let k = n - 1; k >= 0; k--) { path[k] = punto(k, c); if (k > 0) c = back[k - 1][c]; }
  // levigatura leggera (estremi bloccati) e punti ogni 5 mm per la curva della pagina
  for (let it = 0; it < 3; it++) for (let k = 1; k < n - 1; k++) path[k] = path[k].map((v, q) => 0.25 * path[k - 1][q] + 0.5 * v + 0.25 * path[k + 1][q]);
  const out = path.filter((_, k) => k % 2 === 0 || k === n - 1);
  // verifica: compenetrazione del tubo (raggio r) nelle strutture da evitare, in mm, e quota del decorso oltre 0,5 mm
  const valuta = pts => { let mx = 0, n5 = 0; const Q = ricampiona(pts, 0.1); for (const p of Q) { const q = r - sample(F.Dmin, ...p); mx = Math.max(mx, q); if (q > 0.05) n5++; }
    return `compenetrazione massima ${(Math.max(0, mx) * 10).toFixed(1)} mm, oltre 0,5 mm nel ${(100 * n5 / Q.length).toFixed(0)}% del decorso`; };
  log(`${P.id}: prima ${valuta(tubi(H0, P.id)[0].pts)} → dopo ${valuta(out)}`);
  return { r, out };
}

const nuovi = new Map();
for (const P of PERCORSI) { const { out } = instrada(P); nuovi.set(P.id, out); correnti.set(P.id, [{ pts: out, r: correnti.get(P.id)[0].r }]); }
if (PROVA) process.exit(0);
let html = M.html;
const sostituzioni = [...nuovi].map(([id, pts]) => ({ ...tubi(html, id)[0], pts })).sort((a, b) => b.a - a.a);
for (const s of sostituzioni) html = html.slice(0, s.a) + JSON.stringify(s.pts.map(p => p.map(v => +v.toFixed(2)))) + html.slice(s.b);
writeFileSync(FILE, html); log('scritto', FILE);
