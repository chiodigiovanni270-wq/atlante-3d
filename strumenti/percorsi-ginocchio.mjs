/* Decorso di arterie, vene e nervi del ginocchio (tubi procedurali in modelli/ginocchio-3d.html) negli spazi tra i
   muscoli, senza attraversare ossa, muscoli, tendini o legamenti e senza curve innaturali.

   Uso (dalla cartella del progetto, dopo stratifica-ginocchio.mjs, capsula-ginocchio.mjs e borse-ginocchio.mjs):
     node strumenti/percorsi-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file. Guide e soleo di partenza vengono dalla revisione git
   ORIGINALE, quindi lo script si può rilanciare. Per le prove: SOLO=id1,id2 (solo alcuni tubi), DEBUG=1.

   Anatomia di riferimento (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020):
   - Arteria e vena femorale nel canale degli adduttori sotto il sartorio, tra vasto mediale e adduttore magno; iato
     degli adduttori; nella fossa poplitea, dal profondo al superficiale: arteria (sulla faccia poplitea del femore e sulla
     capsula), vena, nervo tibiale. Il fascio scende tra i capi del gastrocnemio sul popliteo e passa sotto l'arcata
     tendinea del soleo, dove l'arteria si divide in tibiale anteriore (sopra la membrana interossea, poi nella loggia
     anteriore tra tibiale anteriore ed estensore lungo delle dita) e tibiale posteriore (tra tibiale posteriore e soleo),
     che dà la peroniera lungo il perone.
   - Nervo sciatico profondo al capo lungo del bicipite, sull'adduttore magno; si divide all'apice della fossa poplitea.
   - Nervo peroneo comune lungo il margine mediale del bicipite, dietro la testa e attorno al collo del perone, profondo
     al peroneo lungo, dove si divide; peroneo superficiale tra peronieri ed estensore lungo delle dita; peroneo profondo
     sotto l'estensore lungo delle dita, sulla membrana interossea, lateralmente all'arteria tibiale anteriore.
   - Nervo cutaneo surale mediale e piccola safena tra i capi del gastrocnemio, poi sotto la fascia del polpaccio.
   - Grande safena sottocutanea; al ginocchio passa dietro il condilo mediale, superficiale al confine tra sartorio e
     gracile. Nervo safeno nel canale degli adduttori e poi profondo al sartorio; perfora la fascia tra i tendini di
     sartorio e gracile (non dietro il gracile) e scende sottocutaneo con la grande safena. Il ramo infrarotuleo curva in
     avanti sotto la rotula.

   Metodo: la linea guida di ogni tubo (originale, con punti di passaggio anatomici; i rami partono dal tronco) è una
   curva dolce campionata ogni 2,5 mm. In ogni sezione (orizzontale per i tubi che scendono, altrimenti perpendicolare
   alla guida) la programmazione dinamica cerca il percorso di costo minimo: compenetrazione (al quadrato) in ossa,
   muscoli, tendini, legamenti, borse e negli altri tubi, distanza dalla guida, curvatura, piano (sottocutaneo o sotto
   l'involucro dei muscoli) e vicinanza al vaso satellite. Poi una banda elastica (energia di flessione + penalità, ogni
   punto si muove solo nel proprio piano trasversale) toglie le pieghe; i rami escono tangenti al tronco quando nascono
   nella sua direzione. La mesh del soleo (BodyParts3D) non ha l'arcata tendinea: il passaggio viene ricostruito con una
   doccia liscia nella faccia anteriore del muscolo. */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { M, FILE, REAL, man, setPos, repack, saveFile, setGriglia, solid, edt, sample, clamp, sstep, log, reManRe, reDatRe } from './lib-modello.mjs';
import * as G from './lib-modello.mjs'; // griglia corrente (O, H, NX, NY, NZ, N cambiano con setGriglia)

const PROVA = process.argv.includes('--prova');
const ORIGINALE = 'b4df739';
const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const H0 = execFileSync('git', ['show', `${ORIGINALE}:modelli/ginocchio-3d.html`], { cwd: RADICE, maxBuffer: 1 << 30 }).toString('utf8');

/* ============ Arcata del soleo ============ */
// La mesh del soleo (BodyParts3D) non ha l'arcata tendinea tra i capi tibiale e fibulare: il margine superiore aderisce
// al popliteo e al tibiale posteriore. Si ricostruisce il passaggio scavando una doccia liscia nella faccia anteriore del
// soleo (asse appena davanti al muscolo, i vertici vicini arretrano) lungo il decorso del fascio
// neurovascolare (vasi poplitei → tibiali posteriori, nervo tibiale), partendo sempre dalla mesh originale.
const ARCATA = { r: 1.2, asse: [[0.4, -6.2, -2.5], [0.35, -6.6, -2.3], [0.25, -7.0, -2.0], [-0.1, -7.4, -1.6], [-0.65, -7.85, -1.5], [-1.05, -8.35, -1.75], [-1.35, -9.0, -2.05], [-1.5, -9.7, -2.25]] }; // asse nel solco davanti al soleo
function soleoOriginale() {
  const m0 = JSON.parse(H0.match(reManRe)[2]), b0 = Buffer.from(H0.match(reDatRe)[2].trim(), 'base64'), e = m0.meshes.findLast(x => x.n === 'sol');
  const q = new Uint16Array(b0.buffer.slice(b0.byteOffset + e.p, b0.byteOffset + e.p + e.nv * 6)), pos = new Float32Array(e.nv * 3);
  for (let i = 0; i < e.nv * 3; i++) { const k = i % 3; pos[i] = m0.min[k] + q[i] / 65535 * (m0.max[k] - m0.min[k]); } return pos;
}
{
  const pos = soleoOriginale(), A = ARCATA.asse; let mosse = 0, mx = 0;
  const dist = p => { let bd = Infinity, bq = null; for (let i = 1; i < A.length; i++) { const a = A[i - 1], b = A[i], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1), q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; bq = q; } } return [bd, bq]; };
  for (let i = 0; i < pos.length; i += 3) { const p = [pos[i], pos[i + 1], pos[i + 2]], [d, q] = dist(p), R2 = ARCATA.r * 2.2; if (d >= R2) continue;
    // spostamento radiale d → d + r(1 - d/R2)²: il canale ha raggio r, il raccordo è dolce (derivata 1 al bordo R2)
    const f = ARCATA.r * (1 - d / R2) ** 2, dir = d > 1e-4 ? p.map((v, k) => (v - q[k]) / d) : [0, 0, -1];
    for (let k = 0; k < 3; k++) pos[i + k] += dir[k] * f; mosse++; mx = Math.max(mx, f); }
  setPos('sol', pos); log(`arcata del soleo: ${mosse} vertici spostati (max ${(mx * 10).toFixed(1)} mm)`);
}

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
// Ogni voce: id (e t, indice del tubo nella struttura, per le strutture con più tubi).
// guida: punti di passaggio anatomici che sostituiscono la guida originale tra il primo e l'ultimo (in y);
// attacca: il tubo nasce dal tronco indicato (nel punto corrispondente a quello originale); attaccaFine: vi termina;
// accompagna: resta a contatto del tubo indicato (vena satellite dell'arteria, nervo del fascio);
// modo(y): 'sup' sottocutaneo, 'prof' sotto l'involucro dei muscoli, null libero; tunnel: {struttura: [yMin, yMax]}
// attraversabile solo in quell'intervallo (iato degli adduttori, tunnel fibulare); R: raggio di ricerca (cm).
const FOSSA = y => y < 11 && y > -7;
const PERCORSI = [
  // arteria femorale → poplitea: nel canale degli adduttori sotto il sartorio, tra vasto mediale e adduttore magno;
  // attraversa lo iato degli adduttori, poi è la struttura più profonda della fossa poplitea, sulla faccia poplitea del
  // femore e sulla capsula; scende tra i capi del gastrocnemio sul popliteo e si divide al suo margine inferiore
  { id: 'apop', R: 1.6, tunnel: { addmag: [11.2, 14.5] },
    guida: [[2.6, 20.36, 3.75], [2.6, 18, 3.75], [2.4, 16, 3.35], [2.1, 14.2, 2.7], [1.95, 13, 1.5], [1.9, 12, 0.3], [1.4, 11, -0.35], [0.8, 10, -0.75],
      [0.45, 9, -0.95], [0.3, 7, -1.25], [0.3, 5, -1.45], [0.2, 3, -2.3], [0.1, 1, -2.6], [0.0, -1, -2.6], [0.0, -2.5, -3.1], [-0.05, -4, -3.45],
      [0.55, -5.5, -3.1], [0.45, -6.4, -2.55], [0.3, -7.0, -2.0]] },
  // vena femorale → poplitea: satellite dell'arteria, posteriore (superficiale) ad essa nella fossa
  { id: 'vpop', R: 1.6, accompagna: 'apop', tunnel: { addmag: [11.2, 14.5] },
    guida: [[3.05, 20.54, 3.4], [3.0, 18, 3.35], [2.8, 16, 2.95], [2.45, 14.2, 2.25], [2.25, 13, 1.1], [2.1, 12, -0.1], [1.55, 11, -0.85], [0.95, 10, -1.3],
      [0.6, 9, -1.55], [0.45, 7, -1.9], [0.45, 5, -2.15], [0.35, 3, -2.95], [0.25, 1, -3.25], [0.2, -1, -3.25], [0.25, -2.5, -3.7], [0.3, -4, -4.0],
      [0.95, -5.5, -3.55], [0.85, -6.3, -3.0], [0.7, -6.9, -2.5]] },
  // nervo sciatico: profondo al capo lungo del bicipite, sulla faccia posteriore dell'adduttore magno; si divide
  // all'apice della fossa poplitea
  { id: 'nsci', R: 2.0, guida: [[0.55, 21.38, -0.55], [0.6, 18, -0.55], [0.6, 15, -0.6], [0.45, 13, -0.95], [0.2, 11.56, -1.55]] },
  // nervo tibiale: il più superficiale del fascio nella fossa; scende con i vasi sotto l'arcata del soleo e poi tra
  // soleo e tibiale posteriore
  { id: 'ntib', R: 1.6, liscio: 2, attacca: 'nsci', accompagna: 'vpop', vicino: FOSSA,
    guida: [[0.2, 11.56, -1.55], [0.2, 10, -2.0], [0.25, 8, -2.45], [0.3, 6, -2.8], [0.35, 4, -3.4], [0.4, 2, -3.6], [0.45, 0, -3.8], [0.5, -2, -4.05],
      [0.55, -4, -4.2], [0.75, -5.5, -3.75], [0.8, -6.5, -3.1], [0.55, -7.0, -2.55], [0.15, -7.45, -1.9], [-0.45, -7.9, -1.85], [-1.0, -8.4, -2.1], [-1.45, -9.1, -2.4], [-1.8, -10.1, -2.45], [-1.99, -11.2, -2.45], [-2.0, -12, -2.47]] },
  // nervo peroneo comune: lungo il margine mediale del bicipite, dietro la testa del perone e attorno al collo;
  // la divisione è profonda al peroneo lungo, sull'osso (tunnel fibulare)
  { id: 'nper', R: 1.6, attacca: 'nsci', modo: y => y < -5.3 ? 'prof' : null, prof: 0.3, tunnel: { perlong: [-9, 0] },
    guida: [[0.2, 11.56, -1.55], [-0.3, 10.5, -1.9], [-0.7, 9.3, -2.25], [-1.2, 8, -2.55], [-1.8, 6.5, -2.8], [-2.4, 5, -3.0], [-2.95, 3.5, -3.15],
      [-3.4, 2, -3.2], [-3.75, 0.5, -3.2], [-4.05, -1, -3.15], [-4.25, -3.0, -3.0], [-4.85, -4.2, -2.6], [-5.2, -5.2, -1.9], [-4.85, -5.9, -1.05]] },
  { id: 'nsurlat', attacca: 'nper', modo: y => y > 1.5 ? null : 'sup' }, // perfora la fascia sopra il capo laterale del gastrocnemio
  // nel setto tra peroneo lungo ed estensore lungo delle dita (i due muscoli poggiano sul perone senza spazio: il nervo
  // segue il solco tra i due, senza attraversarne i ventri)
  { id: 'nperS', attacca: 'nper', modo: () => 'prof', prof: 0.35, tunnel: { perlong: [-6.6, 0] } },
  { id: 'nperP', attacca: 'nper', modo: () => 'prof', prof: 0.35, tunnel: { perlong: [-6.6, 0] } },
  // nervo cutaneo surale mediale e piccola safena: tra i capi del gastrocnemio, poi sottofasciali sul polpaccio
  { id: 'nsurmed', attacca: 'ntib', modo: y => y < -3 ? 'sup' : null },
  { id: 'vps', attaccaFine: 'vpop', modo: y => y < -3 ? 'sup' : null },
  // arterie surali, genicolari e discendente: rami dei vasi principali, a ridosso di ossa e capsula
  { id: 'asur', t: 0, attacca: 'apop' }, { id: 'asur', t: 1, attacca: 'apop' },
  { id: 'agen', t: 0, attacca: 'apop' }, { id: 'agen', t: 1, attacca: 'apop' }, { id: 'agen', t: 2, attacca: 'apop' }, { id: 'agen', t: 3, attacca: 'apop' },
  { id: 'adisc', attacca: 'apop' },
  // tibiale anteriore: passa sopra il margine superiore della membrana interossea tra tibia e perone e scende nella
  // loggia anteriore sulla membrana, tra tibiale anteriore ed estensore lungo delle dita
  { id: 'atant', attacca: 'apop', tunnel: { tibpost: [-9.5, -6] }, guida: [[0.3, -7.0, -2.0], [0.0, -7.45, -1.3], [-0.7, -7.9, -1.0], [-1.5, -8.4, -0.5], [-2.3, -9.1, -0.05], [-2.76, -10.26, 0.06]] },
  { id: 'aric', attacca: 'atant' },
  // tibiale posteriore e vene satelliti: tra tibiale posteriore e soleo (niente scatti laterali sotto l'arcata del soleo)
  { id: 'atpost', attacca: 'apop', guida: [[0.3, -7.0, -2.0], [0.0, -7.45, -1.35], [-0.6, -7.9, -1.45], [-1.1, -8.5, -1.75], [-1.35, -9.3, -2.0], [-1.5, -10.2, -2.2], [-1.56, -11, -2.28]] },
  { id: 'vtpost', attacca: 'vpop', accompagna: 'atpost', guida: [[0.7, -6.9, -2.5], [0.25, -7.5, -1.55], [-0.4, -8.0, -1.7], [-0.85, -8.6, -1.95], [-1.05, -9.4, -2.2], [-1.2, -10.2, -2.3], [-1.26, -11, -2.4]] },
  // peroniera: nasce dalla tibiale posteriore e scende lungo il perone con una curva dolce
  { id: 'aper', attacca: 'atpost', guida: [[-1.35, -9.3, -2.0], [-1.9, -10.1, -1.95], [-2.45, -11, -1.88], [-2.7, -12, -1.85], [-2.77, -13, -1.87]] },
  // grande safena: sottocutanea, dietro il condilo mediale e superficiale alla zampa d'oca
  { id: 'vgs', modo: () => 'sup', ignora: ['nsaf', 'ninfra'], liscio: 2,
    guida: [[5.9, 9, 0.0], [5.85, 7, 0.15], [5.8, 5, 0.1], [5.8, 3, -0.1], [5.75, 1, -0.35], [5.45, -1, -0.65], [4.7, -3, -0.75]] },
  // nervo safeno: nel canale degli adduttori e poi profondo al sartorio; esce tra il margine posteriore del sartorio e
  // il gracile (non dietro il gracile) e scende sottocutaneo con la grande safena
  { id: 'nsaf', fissoInizio: true, liscio: 6, accompagna: 'vgs', vicino: y => y < 1.5, modo: y => y > 3.6 ? 'prof' : y > 2 ? null : 'sup', prof: 0.25, ignora: ['adisc'],
    guida: [[3.36, 9.47, 0.24], [3.6, 8.5, 0.55], [3.95, 7.3, 0.8], [4.35, 6, 0.75], [4.75, 4.8, 0.5], [5.1, 3.8, 0.35], [5.4, 3.0, 0.2], [5.6, 2.2, 0.05], [5.55, 1.2, -0.15], [5.3, -0.5, -0.4], [4.95, -1.8, -0.55]] },
  { id: 'ninfra', attacca: 'nsaf', modo: () => 'sup' },
];
const HC = 0.06, PASSO = 0.25, DMAX = 0.3, MARG = 0.03;
const chiave = P => P.id + (P.t ? '#' + P.t : '');
const tubo0 = (html, P) => tubi(html, P.id)[P.t || 0];

// guida: originale, con il tratto tra primo e ultimo punto di passaggio sostituito (raccordo sugli estremi)
function guida(P) {
  let g = tubo0(H0, P).pts.map(p => p.slice());
  if (P.guida) {
    const V = P.guida, ya = Math.max(V[0][1], V[V.length - 1][1]), yb = Math.min(V[0][1], V[V.length - 1][1]), giu = V[0][1] > V[V.length - 1][1];
    const prima = g.filter(p => giu ? p[1] > ya + 0.3 : p[1] < yb - 0.3), dopo = g.filter(p => giu ? p[1] < yb - 0.3 : p[1] > ya + 0.3);
    g = [...(P.attacca ? [] : prima), ...V.map(p => p.slice()), ...(P.attaccaFine ? [] : dopo)]; // chi si aggancia parte dalla guida
  }
  if (P.via) { const y0 = P.via[0][1] + 0.8; g = g.filter(p => p[1] > y0).concat(P.via); }
  const aggancio = (tronco, q0) => { // estremo del tronco se lì nasceva, altrimenti il punto del tronco nuovo più vicino
    // a quello originale pesando soprattutto la quota (i tronchi si sono spostati in orizzontale)
    const orig = tubi(H0, tronco)[0].pts, nuovo = ricampiona(correnti.get(tronco)[0].pts, 0.05);
    if (len(sub(orig.at(-1), q0)) < 0.05) return nuovo.at(-1).slice(); if (len(sub(orig[0], q0)) < 0.05) return nuovo[0].slice();
    let b = nuovo[0], bd = Infinity; for (const p of nuovo) { const d = 4 * Math.abs(p[1] - q0[1]) + Math.hypot(p[0] - q0[0], p[2] - q0[2]); if (d < bd) { bd = d; b = p; } } return b.slice(); };
  if (P.attacca) g[0] = aggancio(P.attacca, tubo0(H0, P).pts[0]);
  if (P.attaccaFine) g[g.length - 1] = aggancio(P.attaccaFine, tubo0(H0, P).pts.at(-1));
  return leviga(curva(g), P.leviga ?? 120);
}
// Catmull-Rom centripeta ogni 2,5 mm: la guida è già una curva dolce
function curva(P) {
  const Q = [P[0]]; for (const p of P.slice(1)) if (len(sub(p, Q.at(-1))) > 0.05) Q.push(p);
  const out = [];
  for (let i = 0; i < Q.length - 1; i++) {
    const p0 = Q[Math.max(0, i - 1)], p1 = Q[i], p2 = Q[i + 1], p3 = Q[Math.min(Q.length - 1, i + 2)];
    const t01 = Math.sqrt(len(sub(p1, p0))) || 1e-3, t12 = Math.sqrt(len(sub(p2, p1))) || 1e-3, t23 = Math.sqrt(len(sub(p3, p2))) || 1e-3;
    const m1 = [0, 1, 2].map(k => (p2[k] - p1[k]) + t12 * ((p1[k] - p0[k]) / t01 - (p2[k] - p0[k]) / (t01 + t12)));
    const m2 = [0, 1, 2].map(k => (p2[k] - p1[k]) + t12 * ((p3[k] - p2[k]) / t23 - (p3[k] - p1[k]) / (t12 + t23)));
    const n = Math.max(1, Math.ceil(len(sub(p2, p1)) / 0.1));
    for (let j = 0; j < n; j++) { const t = j / n, h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
      out.push([0, 1, 2].map(k => h00 * p1[k] + h10 * m1[k] + h01 * p2[k] + h11 * m2[k])); }
  }
  out.push(Q.at(-1)); return ricampiona(out, PASSO);
}
// levigatura della guida (estremi fermi): toglie le ondulazioni dei decorsi originali prima della ricerca
function leviga(P, it) { const Q = P.map(p => p.slice()); for (let r = 0; r < it; r++) { const O = Q.map(p => p.slice()); for (let k = 1; k < Q.length - 1; k++) for (let q = 0; q < 3; q++) Q[k][q] = 0.5 * O[k][q] + 0.25 * (O[k - 1][q] + O[k + 1][q]); } return Q; }

const BB = new Map(); // ingombro delle mesh, per saltare quelle fuori dalla griglia
const dentro = (n, lo, hi) => { if (!BB.has(n)) { const { pos } = REAL(n), a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; a[k] = Math.min(a[k], pos[i]); b[k] = Math.max(b[k], pos[i]); } BB.set(n, [a, b]); }
  const [a, b] = BB.get(n); return [0, 1, 2].every(k => b[k] > lo[k] && a[k] < hi[k]); };
function campi(P, g, r, R) {
  const lo = [0, 1, 2].map(k => Math.min(...g.map(p => p[k])) - R - 1.2), hi = [0, 1, 2].map(k => Math.max(...g.map(p => p[k])) + R + 1.2);
  setGriglia(lo, 0.1, Math.ceil((hi[0] - lo[0]) / 0.1), Math.ceil((hi[1] - lo[1]) / 0.1), Math.ceil((hi[2] - lo[2]) / 0.1));
  const Pen = new Float32Array(G.N), tun = P.tunnel || {}, PenT = {};
  const U = new Uint8Array(G.N), Dmin = new Float32Array(G.N).fill(1e9); // distanza con segno dalla struttura più vicina (per le verifiche)
  for (const n of PROFONDE) {
    if (!dentro(n, lo, hi)) continue;
    const S = solid(n); for (let i = 0; i < G.N; i++) U[i] |= S[i];
    const Do = edt(S), Di = edt(S, true), w = pesi(n), T = tun[n] ? (PenT[n] = new Float32Array(G.N)) : Pen;
    for (let i = 0; i < G.N; i++) { const d = Do[i] - Di[i], p = r + MARG - d; if (p > 0) T[i] += w * p * p; if (d < Dmin[i]) Dmin[i] = d; }
  }
  // altri tubi (vasi e nervi), esclusi il tubo stesso, il tronco da cui nasce e i suoi rami
  const fam = new Set([P.id, P.attacca, P.attaccaFine, ...(P.ignora || []), ...PERCORSI.filter(q => q.attacca === P.id || q.attaccaFine === P.id).map(q => q.id)]);
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
  // penalità totale in un punto (strutture, tunnel fuori dal proprio intervallo)
  const pen = (x, y, z) => { let v = sample(Pen, x, y, z); for (const n in PenT) { const [a, b] = tun[n]; if (y < a || y > b) v += sample(PenT[n], x, y, z); } return v; };
  return { pen, E, K, Dmin, tun };
}

function instrada(P) {
  let g = guida(P); const r = tubo0(M.html, P).r, R = P.R || 1.2, F = campi(P, g, r, R);
  if (P.modo) { // guida dei tratti sottocutanei portata sotto la cute: si cammina verso la cute (gradiente della distanza
    // dalla cute) e si prende l'ultimo punto in cui si esce dall'involucro dei muscoli (non i solchi tra un muscolo e l'altro)
    const gk = p => { const e = 0.05; return nrm([0, 1, 2].map(q => { const a = p.slice(), b = p.slice(); a[q] += e; b[q] -= e; return sample(F.K, ...b) - sample(F.K, ...a); })); };
    g = g.map((p, k) => { if ((k === 0 && (P.attacca || P.fissoInizio)) || (k === g.length - 1 && P.attaccaFine) || P.modo(p[1]) !== 'sup') return p;
      let q = p.slice(), best = null, prev = sample(F.E, ...q) - (r + 0.08);
      for (let i = 0; i < 120 && sample(F.K, ...q) > 0.05; i++) { const d = gk(q); q = q.map((v, c) => v + d[c] * 0.04); const cur = sample(F.E, ...q) - (r + 0.08); if (prev < 0 && cur >= 0) best = q.slice(); prev = cur; }
      return best || p; });
    g = leviga(g, 40);
  }
  const S = g, n = S.length;
  // riferimenti trasversali lungo la guida (trasporto parallelo)
  const T = S.map((_, k) => nrm(sub(S[Math.min(n - 1, k + 1)], S[Math.max(0, k - 1)])));
  const Ux = [], Vx = []; let u = nrm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  // decorso sempre discendente (|tangente verticale| > 0,35): piani orizzontali, una sola posizione per quota;
  // altrimenti piani perpendicolari alla guida
  const verticale = T.every(t => Math.abs(t[1]) > 0.35);
  for (let k = 0; k < n; k++) { if (verticale) { Ux.push([1, 0, 0]); Vx.push([0, 0, 1]); continue; } u = nrm(sub(u, T[k].map(v => v * dot(u, T[k])))); Ux.push(u); Vx.push(cross(T[k], u)); }
  const C = [], idx = new Map(), m = Math.round(R / HC);
  for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) if (a * a + b * b <= m * m) { idx.set(a + ',' + b, C.length); C.push([a, b]); }
  const nd = Math.ceil(DMAX / HC), vic = C.map(([a, b]) => { const l = []; for (let da = -nd; da <= nd; da++) for (let db = -nd; db <= nd; db++) { if (da * da + db * db > nd * nd) continue; const j = idx.get((a + da) + ',' + (b + db)); if (j !== undefined) l.push(j); } return l; });
  const compB = new Map(); if (P.accompagna) for (const q of ricampiona(correnti.get(P.accompagna)[0].pts, 0.1)) { const b = Math.floor(q[1] / 0.5); (compB.get(b) || compB.set(b, []).get(b)).push(q); }
  const comp = P.accompagna ? true : null, rc = P.accompagna ? correnti.get(P.accompagna)[0].r : 0, vicino = P.vicino || (() => true);
  const punto = (k, c) => add(add(S[k], Ux[k], C[c][0] * HC), Vx[k], C[c][1] * HC);
  const extra = (p, sup) => { // vincoli di piano e di vicinanza
    const [x, y, z] = p; let v = 0; const md = P.modo ? P.modo(y) : null, e = sample(F.E, x, y, z);
    if (md === 'sup') { const s = sample(F.K, x, y, z); v += 30 * Math.max(0, e - (r + 0.06)) ** 2 + 60 * Math.max(0, r + 0.02 - e) ** 2 + 60 * Math.max(0, r + 0.05 - s) ** 2; }
    else if (md === 'prof') v += 30 * Math.max(0, P.prof + e) ** 2;
    if (comp && vicino(y)) { let dv = Infinity; const b0 = Math.floor(y / 0.5); for (let b = b0 - 2; b <= b0 + 2; b++) for (const q of compB.get(b) || []) dv = Math.min(dv, Math.hypot(x - q[0], y - q[1], z - q[2])); if (dv < Infinity) v += 10 * Math.max(0, dv - (r + rc + 0.2)) ** 2; }
    return v;
  };
  const costo = (k, c) => { const p = punto(k, c), o2 = (C[c][0] ** 2 + C[c][1] ** 2) * HC * HC; return F.pen(...p) + 0.3 * o2 + extra(p); };
  const nc = C.length, zero = idx.get('0,0'), fissoI = P.fissoInizio || P.attacca, fissoF = P.fissoFine || P.attaccaFine;
  let cur = new Float64Array(nc).fill(Infinity), back = [];
  if (fissoI) cur[zero] = 0; else for (let c = 0; c < nc; c++) cur[c] = costo(0, c);
  for (let k = 1; k < n; k++) {
    const nx = new Float64Array(nc).fill(Infinity), bk = new Int32Array(nc).fill(-1), ds = len(sub(S[k], S[k - 1])) || PASSO;
    for (let c = 0; c < nc; c++) { if (fissoF && k === n - 1 && c !== zero) continue; let best = Infinity, bi = -1;
      for (const j of vic[c]) { const pc = cur[j]; if (pc === Infinity) continue; const da = (C[c][0] - C[j][0]) * HC, db = (C[c][1] - C[j][1]) * HC, t = pc + 12 * (P.liscio || 1) * (da * da + db * db) / ds; if (t < best) { best = t; bi = j; } }
      if (bi >= 0) { nx[c] = best + costo(k, c); bk[c] = bi; } }
    cur = nx; back.push(bk);
  }
  let c = 0; for (let j = 1; j < nc; j++) if (cur[j] < cur[c]) c = j;
  let path = new Array(n); for (let k = n - 1; k >= 0; k--) { path[k] = punto(k, c); if (k > 0) c = back[k - 1][c]; }
  if (process.env.DEBUG) { const pg = pts => { let mx = 0, yr = [Infinity, -Infinity]; for (let k = 1; k < pts.length - 1; k++) { const a = nrm(sub(pts[k], pts[k - 1])), b = nrm(sub(pts[k + 1], pts[k])); mx = Math.max(mx, Math.acos(clamp(dot(a, b), -1, 1)) * 57.3); } pts.forEach(p => { yr[0] = Math.min(yr[0], p[1]); yr[1] = Math.max(yr[1], p[1]); }); return `piega ${mx.toFixed(0)}° y ${yr.map(v => v.toFixed(1))}`; };
    log(`  ${chiave(P)} guida: ${pg(S)}; ricerca: ${pg(path)}; y ${path.filter((_, k) => k % 8 === 0).map(p => p[1].toFixed(1)).join(' ')}`); }
  let pre = null; // punto del tronco 2,5 mm prima dell'aggancio: il ramo ne esce tangente
  if (P.attacca) { const tr = ricampiona(correnti.get(P.attacca)[0].pts, PASSO); let bi = 0, bd = Infinity; tr.forEach((p, i) => { const d = len(sub(p, path[0])); if (d < bd) { bd = d; bi = i; } });
    // solo se il ramo parte nella stessa direzione del tronco (biforcazione); i rami ad angolo (genicolari) no, o farebbero un'ansa
    const dt = nrm(sub(tr[Math.min(tr.length - 1, bi + 1)], tr[Math.max(0, bi - 1)])), db = nrm(sub(path[Math.min(n - 1, 8)], path[0]));
    if (bi > 0 && dot(dt, db) > 0.5) pre = tr[bi - 1]; }
  path = elastica(path, p => F.pen(...p) + extra(p), Ux, Vx, 20 * (P.liscio || 1), pre); // estremi fermi (aggancio o punto scelto dalla ricerca)
  if (process.env.DEBUG) log(`  dopo elastica: n ${path.length}, y ${path.filter((_, k) => k % 8 === 0).map(p => p[1].toFixed(1)).join(' ')}`);
  const out = path.filter((_, k) => k % 2 === 0 || k === n - 1);
  // verifica: compenetrazione del tubo (raggio r) nelle strutture da evitare (tunnel esclusi nel loro intervallo), in mm
  const valuta = pts => { let mx = 0, n5 = 0; const Q = ricampiona(pts, 0.1); for (const p of Q) { const q = r - sample(F.Dmin, ...p); if (Object.entries(F.tun).some(([, [a, b]]) => p[1] >= a && p[1] <= b)) continue; mx = Math.max(mx, q); if (q > 0.05) n5++; }
    return `compenetrazione massima ${(Math.max(0, mx) * 10).toFixed(1)} mm, oltre 0,5 mm nel ${(100 * n5 / Q.length).toFixed(0)}% del decorso`; };
  const piega = pts => { let mx = 0; const Q = ricampiona(pts, 0.25); for (let k = 1; k < Q.length - 1; k++) { const a = nrm(sub(Q[k], Q[k - 1])), b = nrm(sub(Q[k + 1], Q[k])); mx = Math.max(mx, Math.acos(clamp(dot(a, b), -1, 1)) * 180 / Math.PI); } return mx; };
  if (process.env.DEBUG) log(`  piani ${verticale ? 'orizzontali' : 'perpendicolari'}`);
  log(`${chiave(P)}: prima ${valuta(tubo0(H0, P).pts)}, piega max ${piega(tubo0(H0, P).pts).toFixed(0)}° → dopo ${valuta(out)}, piega max ${piega(out).toFixed(0)}° ogni 2,5 mm`);
  return out;
}
// banda elastica: discesa del gradiente su energia = penalità (strutture, piani) + λ·flessione (differenze seconde al
// quadrato). Ogni punto si muove solo nel proprio piano trasversale (U, V della ricerca): niente scorrimenti lungo il
// decorso, quindi niente anse; gli estremi restano fermi (aggancio o punto scelto dalla ricerca)
function elastica(P, f, U, V, lam = 20, pre = null) {
  const Q = P.map(p => p.slice()), n = Q.length, e = 0.02;
  for (let it = 0; it < 9000; it++) {
    const Fz = Q.map(() => [0, 0, 0]);
    if (pre) { const d = [0, 1, 2].map(q => pre[q] - 2 * Q[0][q] + Q[1][q]); for (let q = 0; q < 3; q++) Fz[1][q] -= lam * d[q]; } // uscita tangente al tronco
    for (let k = 1; k < n - 1; k++) { // flessione: forza = -∂/∂p Σ|p[k-1]-2p[k]+p[k+1]|²
      const d = [0, 1, 2].map(q => Q[k - 1][q] - 2 * Q[k][q] + Q[k + 1][q]);
      for (let q = 0; q < 3; q++) { Fz[k - 1][q] -= lam * d[q]; Fz[k][q] += 2 * lam * d[q]; Fz[k + 1][q] -= lam * d[q]; } }
    let mx = 0;
    for (let k = 1; k < n - 1; k++) {
      const pu = t => add(Q[k], U[k], t), pv = t => add(Q[k], V[k], t), v = f(Q[k]);
      const gu = v > 1e-4 ? 2 * (f(pu(e)) - f(pu(-e))) / (2 * e) : 0, gv = v > 1e-4 ? 2 * (f(pv(e)) - f(pv(-e))) / (2 * e) : 0;
      const h = 0.05 / lam, su = h * (dot(Fz[k], U[k]) - gu), sv = h * (dot(Fz[k], V[k]) - gv), sl = Math.hypot(su, sv), c = sl > 0.01 ? 0.01 / sl : 1;
      for (let q = 0; q < 3; q++) Q[k][q] += (U[k][q] * su + V[k][q] * sv) * c; mx = Math.max(mx, sl * c); }
    if (mx < 5e-6) break;
  }
  return Q;
}

const nuovi = [];
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null; // per le prove: solo alcuni tubi
for (const P of PERCORSI) { if (SOLO && !SOLO.includes(chiave(P))) continue; const out = instrada(P); nuovi.push([P, out]); const L = correnti.get(P.id); L[P.t || 0] = { pts: out, r: L[P.t || 0].r }; }
if (PROVA) process.exit(0);
let html = M.html;
const sostituzioni = nuovi.map(([P, pts]) => ({ ...tubo0(html, P), pts })).sort((a, b) => b.a - a.a);
for (const s of sostituzioni) html = html.slice(0, s.a) + JSON.stringify(s.pts.map(p => p.map(v => +v.toFixed(2)))) + html.slice(s.b);
M.html = html; saveFile(repack()); // tubi nuovi e soleo con l'arcata
