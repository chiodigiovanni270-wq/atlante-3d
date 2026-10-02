/* Faccia volare del radio distale (modelli/polso-dito-3d.html, sezione polso): pronatore quadrato, capsula volare e
   zona fibrosa intermedia, arteria radiale, cuscinetto adiposo del pronatore quadrato.

   Uso (dalla cartella del progetto):
     node strumenti/radio-volare-polso.mjs                → tutti i passi, nell'ordine
     node strumenti/radio-volare-polso.mjs pq arteria     → solo alcuni passi (pq, capsula, arteria, adipe)
     node strumenti/radio-volare-polso.mjs verifica       → elenca le compenetrazioni residue, senza scrivere
     MODELLO=/tmp/copia.html node strumenti/radio-volare-polso.mjs   → lavora su una copia

   - Pronatore quadrato (`pq`): si inserisce sul quarto distale della faccia anteriore e del margine anteriore del
     radio (Gray's Anatomy); la mesh originale si fermava 3–5 mm prima del margine. Il tratto radiale del muscolo
     viene disteso fino al margine anteriore facendolo scorrere sull'osso (stessa distanza dalla superficie, fibre
     trasverse invariate); bordo distale (pochi mm prossimale alla watershed line: Bergsma M et al., J Wrist Surg
     2020) e bordo prossimale restano quelli originali. Dove FDP, FDS e FPL poggiavano direttamente sul muscolo la sua
     faccia volare scende di poco (al massimo 1,5 mm) per far posto al cuscinetto adiposo.
   - Capsula volare e zona fibrosa intermedia (`capvol`): tra il bordo distale del pronatore e la rima volare il radio
     è coperto da tessuto fibroso, che continua nella capsula radiocarpica volare ed è il piano su cui scorrono FPL e
     FDP (Imatani J, Akita K, J Wrist Surg 2017). Telo teso sottile: poggia sull'osso, scavalca la rima articolare
     fino a scafoide e semilunare, resta sotto i legamenti radiocarpici volari (che ne sono gli ispessimenti), sotto
     il bordo distale del pronatore e sotto tendini, vasi e nervi.
   - Arteria radiale (`arad`, tubo nel sorgente della pagina): nel terzo distale dell'avambraccio poggia sul FPL e sul
     pronatore quadrato, poi sulla capsula volare del radio, tra brachioradiale e FCR (dove si palpa il polso). Il
     decorso originale era 5–9 mm più superficiale: viene abbassato sul piano profondo e portato radialmente al FPL;
     dalla curva sotto APL ed EPB in poi (tabacchiera, arco profondo) resta quello originale. Il ramo palmare
     superficiale (`aradsup`) parte dal nuovo punto d'origine.
   - Cuscinetto adiposo del pronatore quadrato (`adipq`, categoria `adi`, semitrasparente nella pagina): strato
     adiposo sulla faccia volare del pronatore, sotto i flessori profondi (spazio di Parona); riempie lo spazio libero
     fino a uno spessore massimo, ulnarmente all'arteria radiale e a distanza dal FCU.
   Riparte sempre dal pronatore quadrato e dall'arteria originali (revisione ORIGINALE); capsula e cuscinetto sono
   rigenerati da zero, quindi si può rilanciare. Ordine: pq → capsula → arteria → adipe.
   Sistema del modello: cm, x radiale→ulnare, y distale→prossimale (0 = rima radiocarpica), z dorsale→volare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MODELLO ||= resolve(ROOT, 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs');
const { man, setMesh, setPos, clamp, sstep, log, repack, saveFile, griglia, sample, campo } = G;

/* ============ Parametri ============ */
const ORIGINALE = 'a566a6f';                     // revisione con pronatore quadrato e arteria radiale originali
const FILE_REPO = 'modelli/polso-dito-3d.html';
const PQ = {
  margine: 0.08,      // il bordo radiale arriva a 0,8 mm dal margine anteriore del radio
  perno: 1.3,         // ampiezza (cm) del tratto radiale che si distende; più ulnarmente il muscolo non cambia
  y: [0.75, 1.2, 3.8, 4.9],   // distensione piena tra y[1] e y[2], nulla sotto y[0] e sopra y[3] (bordi originali; più in alto origina il FPL)
};
const CAPS = {
  sp: 0.07,           // spessore (cm)
  sotto: 0.15,        // quanto scorre sotto il bordo distale del pronatore (cm)
  distale: [[-3.25, -0.55], [-2.4, -0.75], [-1.5, -0.62], [-0.9, -0.5], [-0.35, -0.42]],  // margine distale (x, y) su scafoide e semilunare
  ulnare: -0.38,      // margine ulnare (incisura sigmoidea)
  p: 6,               // pressione verso il piano osseo
  raggio: 0.25,       // raggio degli angoli del contorno (cm)
  piede: 0.12,        // legamenti e pronatore più vicini di così all'osso (inserzioni) non sollevano la lamina
};
const ARAD = {
  r: 0.12,            // raggio del tubo (come nella pagina)
  gioco: 0.04,        // distanza dal piano su cui poggia (cm)
  dalFPL: 0.05,       // distanza dal fianco radiale del FPL (cm)
  yCurva: [-0.62, -0.3],   // sotto y[0] decorso originale; tra y[0] e y[1] raccordo
  yPQ: [3.4, 6.6],    // sul pronatore l'arteria sta radialmente al FPL; sopra y[1] poggia sul FPL (raccordo tra i due)
};
const ADIPE = {
  spazio: 0.17,       // spazio di Parona: distanza voluta tra faccia volare del pronatore e flessori profondi (cm)
  taglio: 0.15,       // per ricavarlo la faccia volare del pronatore scende al massimo di tanto (cm)
  pqMin: 0.3,         // spessore minimo del pronatore dove scende (cm)
  max: 0.2,           // spessore massimo (cm)
  min: 0.05,          // sotto questo spessore libero il cuscinetto si interrompe
  gioco: 0.025,       // distanza dalle strutture vicine (cm)
  y: [0.5, 4.6],      // estensione prossimo-distale (cm)
  dallArteria: 0.22,  // margine radiale: ulnare all'arteria radiale di almeno questo (cm, oltre il raggio)
};

/* ============ Pianta: colonne (x, y) con quote delle mesh ============ */
const PL = { x0: -4.2, y0: -1.4, h: 0.02 }; PL.nx = Math.round((1.8 - PL.x0) / PL.h); PL.ny = Math.round((8.2 - PL.y0) / PL.h);
const NC = PL.nx * PL.ny, cx = i => PL.x0 + (i + 0.5) * PL.h, cy = j => PL.y0 + (j + 0.5) * PL.h;
// quote massima e minima di un gruppo di mesh in ogni colonna (−∞/+∞ dove la colonna non le incontra)
function quote(meshes) {
  const top = new Float32Array(NC).fill(-Infinity), bot = new Float32Array(NC).fill(Infinity);
  for (const m of meshes) {
    const { pos, idx } = typeof m === 'string' ? G.REAL(m) : m;
    for (let t = 0; t < idx.length; t += 3) {
      const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
      const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], qx = pos[c], qy = pos[c + 1];
      const den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy); if (Math.abs(den) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, qx) - PL.x0) / PL.h - 0.5)), i1 = Math.min(PL.nx - 1, Math.floor((Math.max(ax, bx, qx) - PL.x0) / PL.h - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by, qy) - PL.y0) / PL.h - 0.5)), j1 = Math.min(PL.ny - 1, Math.floor((Math.max(ay, by, qy) - PL.y0) / PL.h - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = cx(i), y = cy(j), l1 = ((by - qy) * (x - qx) + (qx - bx) * (y - qy)) / den, l2 = ((qy - ay) * (x - qx) + (ax - qx) * (y - qy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2], k = i + PL.nx * j;
        if (z > top[k]) top[k] = z; if (z < bot[k]) bot[k] = z;
      }
    }
  }
  return { top, bot };
}
// vasi e nervi: tubi letti dal sorgente della pagina
function tubi(id) {
  const riga = G.M.html.split('\n').find(l => l.startsWith(`{id:'${id}',`));
  if (!riga) throw new Error('tubo non trovato: ' + id);
  return [...riga.matchAll(/tube\(\[\[(.*?)\]\],([\d.]+)/g)].map(m => ({ pts: m[1].split('],[').map(s => s.split(',').map(Number)), r: +m[2] }));
}
function quoteTubi(ids) {
  const top = new Float32Array(NC).fill(-Infinity), bot = new Float32Array(NC).fill(Infinity);
  for (const id of ids) for (const { pts, r } of tubi(id)) for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.01));
    for (let q = 0; q <= n; q++) {
      const c = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * q / n);
      const i0 = Math.max(0, Math.floor((c[0] - r - PL.x0) / PL.h)), i1 = Math.min(PL.nx - 1, Math.ceil((c[0] + r - PL.x0) / PL.h));
      const j0 = Math.max(0, Math.floor((c[1] - r - PL.y0) / PL.h)), j1 = Math.min(PL.ny - 1, Math.ceil((c[1] + r - PL.y0) / PL.h));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d2 = (cx(i) - c[0]) ** 2 + (cy(j) - c[1]) ** 2; if (d2 > r * r) continue;
        const k = i + PL.nx * j, dz = Math.sqrt(r * r - d2);
        if (c[2] + dz > top[k]) top[k] = c[2] + dz; if (c[2] - dz < bot[k]) bot[k] = c[2] - dz;
      }
    }
  }
  return { top, bot };
}
// campionamento bilineare di un campo di colonne; le colonne senza valore non contano (null se nessuna)
function piano(A, x, y) {
  const fx = (x - PL.x0) / PL.h - 0.5, fy = (y - PL.y0) / PL.h - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  let s = 0, w = 0;
  for (const [di, dj, ww] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
    const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= PL.nx || jj >= PL.ny) continue;
    const a = A[ii + PL.nx * jj]; if (!isFinite(a)) continue; s += a * ww; w += ww;
  }
  return w > 1e-6 ? s / w : null;
}
// sezione di una mesh col piano y = c: segmenti in (x, z)
function sezione(mesh, c) {
  const { pos, idx } = typeof mesh === 'string' ? G.REAL(mesh) : mesh, out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const pts = [];
    for (let e = 0; e < 3; e++) { const a = 3 * idx[t + e], b = 3 * idx[t + (e + 1) % 3], ya = pos[a + 1] - c, yb = pos[b + 1] - c;
      if ((ya < 0) !== (yb < 0)) { const k = ya / (ya - yb); pts.push([pos[a] + (pos[b] - pos[a]) * k, pos[a + 2] + (pos[b + 2] - pos[a + 2]) * k]); } }
    if (pts.length === 2) out.push(pts);
  }
  return out;
}
// profilo f(y) campionato ogni 0,05 cm e smussato (media mobile), interpolato linearmente
function profilo(f, y0, y1, raggio = 0.25) {
  const Y = [], V = []; for (let y = y0; y <= y1 + 1e-9; y += 0.05) { Y.push(y); V.push(f(y)); }
  const k = Math.round(raggio / 0.05), S = V.map((_, i) => { let s = 0, n = 0; for (let d = -k; d <= k; d++) { const v = V[i + d]; if (v != null) { s += v; n++; } } return n ? s / n : null; });
  return y => { const t = clamp((y - y0) / 0.05, 0, Y.length - 1.001), i = Math.floor(t), u = t - i; return S[i] == null || S[i + 1] == null ? (S[i] ?? S[i + 1]) : S[i] + (S[i + 1] - S[i]) * u; };
}
const mix = (a, b, t) => a + (b - a) * t;

/* ============ Pronatore quadrato ============ */
function pronatore() {
  const pos = G.posDaRevisione(ORIGINALE, 'pq', FILE_REPO), nv = pos.length / 3;
  const S = quote(['radio']).top;                                             // faccia volare del radio per colonna
  const yv = i => pos[3 * i + 1];
  // bordo radiale del muscolo e margine anteriore del radio (punto d'appoggio in direzione radio-volare, 45°)
  const bordoPQ = profilo(y => { let m = null; for (let i = 0; i < nv; i++) if (Math.abs(yv(i) - y) < 0.06 && (m === null || pos[3 * i] < m)) m = pos[3 * i]; return m; }, 0.4, 6.2, 0.2);
  const margine = profilo(y => { let b = null, s = -Infinity; for (const sg of sezione('radio', y)) for (const [x, z] of sg) if (z - x > s) { s = z - x; b = x; } return b; }, 0.4, 6.2, 0.2);
  const w = y => sstep(PQ.y[0], PQ.y[1], y) * (1 - sstep(PQ.y[2], PQ.y[3], y));
  const out = Float32Array.from(pos); let mossi = 0, dmax = 0;
  for (let i = 0; i < nv; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], e = bordoPQ(y), d = Math.max(0, e - (margine(y) + PQ.margine)) * w(y);
    if (d <= 0) continue;
    const xp = e + PQ.perno; if (x >= xp) continue;
    const x2 = x - d * (xp - x) / (xp - e), s1 = piano(S, x, y), s2 = piano(S, x2, y);
    out[3 * i] = x2; if (s1 !== null && s2 !== null) out[3 * i + 2] = z + s2 - s1;
    mossi++; dmax = Math.max(dmax, x - x2);
  }
  // dove il tratto disteso passa sotto il ventre del FPL il muscolo si adatta (faccia volare appena sotto il FPL)
  const fpl = quote(['fpl']); let adattati = 0;
  for (let i = 0; i < nv; i++) {
    const x = out[3 * i], y = out[3 * i + 1], z = out[3 * i + 2], b = piano(fpl.bot, x, y), s = piano(S, x, y);
    if (b === null || s === null || b < s + 0.03 || z < b - 0.02) continue;
    out[3 * i + 2] = Math.max(b - 0.02, s + 0.015); adattati++;
  }
  // spazio di Parona: dove i flessori profondi poggiano sul pronatore la faccia volare del muscolo scende di poco
  // (al massimo ADIPE.taglio, raccordata verso i margini), per far posto al cuscinetto adiposo
  const { idx } = G.REAL('pq'), qq = quote([{ pos: out, idx }]), U = new Float32Array(NC).fill(Infinity);
  for (const q of quoteSeparate(['fdp', 'fds', 'fpl'])) for (let k = 0; k < NC; k++) if (q.bot[k] > (qq.top[k] + qq.bot[k]) / 2 && q.bot[k] < U[k]) U[k] = q.bot[k];   // anche tendini che sfiorano il muscolo
  const imp = new Uint8Array(NC); for (let k = 0; k < NC; k++) imp[k] = isFinite(qq.top[k]) ? 1 : 0;
  const Epq = distanza2D(imp), taglio = new Float32Array(NC);
  for (let k = 0; k < NC; k++) { if (!imp[k] || !isFinite(U[k])) continue; const y = cy((k / PL.nx) | 0);
    taglio[k] = clamp(ADIPE.spazio - (U[k] - qq.top[k]), 0, Math.min(ADIPE.taglio, qq.top[k] - qq.bot[k] - ADIPE.pqMin)) * sstep(0.05, 0.35, -Epq[k]) * sstep(ADIPE.y[0], ADIPE.y[0] + 0.3, y) * (1 - sstep(ADIPE.y[1] - 0.3, ADIPE.y[1], y)); }
  liscia(taglio, 6); let scesi = 0;
  for (let i = 0; i < nv; i++) { const x = out[3 * i], y = out[3 * i + 1], t = piano(qq.top, x, y), c = piano(taglio, x, y);
    if (t === null || !c || out[3 * i + 2] < t - 0.1) continue; out[3 * i + 2] -= c * sstep(t - 0.1, t - 0.03, out[3 * i + 2]); scesi++; }
  setPos('pq', out);
  log('pq: spostati', mossi, 'vertici, al massimo', dmax.toFixed(2), 'cm; adattati sotto il FPL', adattati, '; faccia volare abbassata (spazio di Parona)', scesi);
}

/* ============ Lastra: mesh di una lamina (capsula, cuscinetto) ============ */
/* Lamina compresa tra lo(x, y) e hi(x, y) nel dominio E(x, y) < 0. Griglia regolare in pianta (passo `passo`): i nodi
   interni restano dove sono, quelli appena fuori vengono agganciati al contorno E = 0, così il margine segue il
   contorno di qualunque forma. Faccia superficiale e profonda; verso il margine la lamina si chiude a metà spessore,
   poi un semicerchio. fd(p) = direzione delle fibre. */
function lastra(nome, { lo, hi, E, fd, passo = 0.035, bordo = 5 }) {
  const Ev = (x, y) => piano(E, x, y) ?? 1;
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (let k = 0; k < NC; k++) if (E[k] < 0) { const x = cx(k % PL.nx), y = cy((k / PL.nx) | 0); bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const X0 = bx0 - 2 * passo, Y0 = by0 - 2 * passo, ni = Math.ceil((bx1 - bx0) / passo) + 5, nj = Math.ceil((by1 - by0) / passo) + 5;
  const dentro = new Uint8Array(ni * nj), nodo = new Int32Array(ni * nj).fill(-1), P2 = [], bordoN = [];
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) dentro[i + ni * j] = Ev(X0 + i * passo, Y0 + j * passo) < 0 ? 1 : 0;
  for (let j = 1; j < nj - 1; j++) for (let i = 1; i < ni - 1; i++) {
    const q = i + ni * j; let x = X0 + i * passo, y = Y0 + j * passo;
    if (!dentro[q]) {
      if (!(dentro[q + 1] || dentro[q - 1] || dentro[q + ni] || dentro[q - ni])) continue;
      const x0 = x, y0 = y;   // spostamento limitato a 0,45 passi: i nodi agganciati non si scavalcano
      for (let it = 0; it < 6; it++) { const e = Ev(x, y), d = 0.01, gx = (Ev(x + d, y) - Ev(x - d, y)) / (2 * d), gy = (Ev(x, y + d) - Ev(x, y - d)) / (2 * d), g2 = gx * gx + gy * gy || 1;
        x -= e * gx / g2; y -= e * gy / g2; const l = Math.hypot(x - x0, y - y0), m = 0.45 * passo; if (l > m) { x = x0 + (x - x0) * m / l; y = y0 + (y - y0) * m / l; } if (Math.abs(e) < 1e-4) break; }
    }
    nodo[q] = P2.length; P2.push([x, y]); bordoN.push(!dentro[q]);
  }
  // triangoli in pianta (antiorari), con almeno un vertice interno
  const T2 = [], area = (a, b, c) => (P2[b][0] - P2[a][0]) * (P2[c][1] - P2[a][1]) - (P2[c][0] - P2[a][0]) * (P2[b][1] - P2[a][1]);
  const tri = (qa, qb, qc) => { const [a, b, c] = [nodo[qa], nodo[qb], nodo[qc]]; if (a < 0 || b < 0 || c < 0) return; if (!(dentro[qa] || dentro[qb] || dentro[qc])) return;
    const s = area(a, b, c); if (Math.abs(s) < 1e-7) return; T2.push(s > 0 ? [a, b, c] : [a, c, b]); };
  for (let j = 1; j < nj - 2; j++) for (let i = 1; i < ni - 2; i++) {
    const a = i + ni * j, b = a + 1, c = a + 1 + ni, d = a + ni, n = [a, b, c, d].filter(q => nodo[q] >= 0).length;
    if (n === 4) { if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); } }
    else if (n === 3) { const v = [a, b, c, d].filter(q => nodo[q] >= 0); tri(v[0], v[1], v[2]); }
  }
  // margine: lati che appartengono a un solo triangolo, concatenati in anelli (interno a sinistra)
  const conta = new Map(), kk = (a, b) => a < b ? a * 1e6 + b : b * 1e6 + a;
  for (const t of T2) for (let e = 0; e < 3; e++) { const k = kk(t[e], t[(e + 1) % 3]); conta.set(k, (conta.get(k) || 0) + 1); }
  const succ = new Map(), anelli = [];
  for (const t of T2) for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3]; if (conta.get(kk(a, b)) === 1) (succ.get(a) || succ.set(a, []).get(a)).push(b); }
  while (succ.size) {
    const [v0] = succ.keys(), loop = [v0]; let v = v0, chiuso = false;
    for (;;) { const L = succ.get(v); if (!L || !L.length) break; const w = L.pop(); if (!L.length) succ.delete(v); if (w === v0) { chiuso = true; break; } loop.push(w); v = w; }
    if (loop.length >= 3) anelli.push({ loop, chiuso });
  }
  // margine levigato: i nodi agganciati scorrono lungo l'anello (media con i vicini), niente gradini della griglia
  for (const { loop, chiuso } of anelli) { const n = loop.length;
    for (let p = 0; p < 4; p++) { const Q = loop.map(v => P2[v].slice());
      for (let i = 0; i < n; i++) { if (!chiuso && (i === 0 || i === n - 1)) continue; const a = P2[loop[(i - 1 + n) % n]], b = P2[loop[(i + 1) % n]];
        Q[i] = [0.5 * P2[loop[i]][0] + 0.25 * (a[0] + b[0]), 0.5 * P2[loop[i]][1] + 0.25 * (a[1] + b[1])]; }
      loop.forEach((v, i) => { P2[v] = Q[i]; }); } }
  // quota media e semispessore; sul margine metà spessore
  const mt = (v) => { const [x, y] = P2[v]; let a = piano(lo, x, y), b = piano(hi, x, y);
    if (a === null || b === null) return [0, 0.006]; return [(a + b) / 2, Math.max(0.006, (b - a) / 2) * (bordoN[v] ? 0.5 : 1)]; };
  const nv2 = P2.length, MT = P2.map((_, v) => mt(v)), pos = [], fdl = [], idx = [];
  const vtx = p => { pos.push(...p); const d = fd(p), l = Math.hypot(...d) || 1; fdl.push(...d.map(v => v / l)); return pos.length / 3 - 1; };
  for (let v = 0; v < nv2; v++) vtx([P2[v][0], P2[v][1], MT[v][0] + MT[v][1]]);   // faccia superficiale: indici 0..nv2-1
  for (let v = 0; v < nv2; v++) vtx([P2[v][0], P2[v][1], MT[v][0] - MT[v][1]]);   // faccia profonda: nv2..2nv2-1
  for (const [a, b, c] of T2) { idx.push(a, b, c); idx.push(nv2 + a, nv2 + c, nv2 + b); }
  // semicerchio dalla faccia superficiale a quella profonda lungo ogni anello
  for (const { loop, chiuso } of anelli) {
    const n = loop.length, lati = chiuso ? n : n - 1, vic = i => chiuso ? (i + n) % n : clamp(i, 0, n - 1);
    const uscita = loop.map((v, i) => { const a = P2[loop[vic(i - 1)]], b = P2[loop[vic(i + 1)]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
    let prec = loop.slice();                                       // anello sulla faccia superficiale
    for (let q = 1; q < bordo; q++) {
      const ang = Math.PI * q / bordo, ring = loop.map((v, i) => { const [m, t] = MT[v]; return vtx([P2[v][0] + uscita[i][0] * Math.sin(ang) * t * 0.8, P2[v][1] + uscita[i][1] * Math.sin(ang) * t * 0.8, m + Math.cos(ang) * t]); });
      for (let i = 0; i < lati; i++) { const j = (i + 1) % n; idx.push(prec[i], ring[i], ring[j], prec[i], ring[j], prec[j]); }
      prec = ring;
    }
    const fondo = loop.map(v => nv2 + v);
    for (let i = 0; i < lati; i++) { const j = (i + 1) % n; idx.push(prec[i], fondo[i], fondo[j], prec[i], fondo[j], prec[j]); }
  }
  orienta(pos, idx);
  const mesh = { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fdl.map(v => Math.round(v * 127))) };
  if (!man.meshes.some(x => x.n === nome)) man.meshes.push({ n: nome });
  setMesh(nome, mesh); log(nome, mesh.pos.length / 3, 'vertici,', anelli.length, anelli.length === 1 ? 'margine' : 'margini');
  return mesh;
}
// orientamento coerente (propagazione sulle facce adiacenti) e verso l'esterno (volume con segno positivo)
function orienta(pos, idx) {
  const nT = idx.length / 3, ed = new Map(), key = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
  for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) { const k = key(idx[3 * t + e], idx[3 * t + (e + 1) % 3]); (ed.get(k) || ed.set(k, []).get(k)).push(t); }
  const fatto = new Uint8Array(nT);
  for (let s = 0; s < nT; s++) { if (fatto[s]) continue; fatto[s] = 1; const coda = [s];
    while (coda.length) { const t = coda.pop();
      for (let e = 0; e < 3; e++) { const a = idx[3 * t + e], b = idx[3 * t + (e + 1) % 3];
        for (const u of ed.get(key(a, b))) { if (fatto[u]) continue; fatto[u] = 1;
          let concorde = false; for (let f = 0; f < 3; f++) if (idx[3 * u + f] === a && idx[3 * u + (f + 1) % 3] === b) concorde = true;
          if (concorde) { const x = idx[3 * u + 1]; idx[3 * u + 1] = idx[3 * u + 2]; idx[3 * u + 2] = x; }
          coda.push(u); } } } }
  let vol = 0; for (let t = 0; t < nT; t++) { const [a, b, c] = [0, 1, 2].map(f => idx[3 * t + f] * 3);
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]); }
  if (vol < 0) for (let t = 0; t < nT; t++) { const x = idx[3 * t + 1]; idx[3 * t + 1] = idx[3 * t + 2]; idx[3 * t + 2] = x; }
}
// distanza con segno (approssimata, in cm) da una maschera di colonne: negativa dentro
function distanza2D(M) {
  const D = new Float32Array(NC), dentro = new Float32Array(NC).fill(1e9), fuori = new Float32Array(NC).fill(1e9);
  for (let k = 0; k < NC; k++) (M[k] ? fuori : dentro)[k] = 0;  // fuori: distanza dalle colonne interne; dentro: dalle esterne
  for (const A of [dentro, fuori]) { // due passate di chamfer 3-4
    const { nx, ny } = PL;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = i + nx * j; let v = A[k];
      if (i > 0) v = Math.min(v, A[k - 1] + 3); if (j > 0) v = Math.min(v, A[k - nx] + 3);
      if (i > 0 && j > 0) v = Math.min(v, A[k - nx - 1] + 4); if (i < nx - 1 && j > 0) v = Math.min(v, A[k - nx + 1] + 4); A[k] = v; }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = i + nx * j; let v = A[k];
      if (i < nx - 1) v = Math.min(v, A[k + 1] + 3); if (j < ny - 1) v = Math.min(v, A[k + nx] + 3);
      if (i < nx - 1 && j < ny - 1) v = Math.min(v, A[k + nx + 1] + 4); if (i > 0 && j < ny - 1) v = Math.min(v, A[k + nx - 1] + 4); A[k] = v; }
  }
  for (let k = 0; k < NC; k++) D[k] = M[k] ? -(dentro[k] / 3 - 0.5) * PL.h : (fuori[k] / 3 - 0.5) * PL.h;
  return D;
}
// media 3×3 di un campo di colonne (solo dove definito), `passate` volte
function liscia(A, passate, dom = null) {
  for (let p = 0; p < passate; p++) { const Q = A.slice();
    for (let j = 1; j < PL.ny - 1; j++) for (let i = 1; i < PL.nx - 1; i++) { const k = i + PL.nx * j; if (!isFinite(A[k]) || (dom && !dom[k])) continue;
      let s = 0, n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const v = A[k + a + PL.nx * b]; if (isFinite(v)) { s += v; n++; } } Q[k] = s / n; }
    A.set(Q); }
  return A;
}
// telo teso: z = media dei vicini − pressione, con L ≤ z ≤ U (sovrarilassamento), solo nel dominio
function telo(dom, L, U, Z, p, iter = 3000, w = 1.8) {
  const ph = p * PL.h * PL.h, { nx, ny } = PL;
  for (let it = 0; it < iter; it++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = i + nx * j; if (!dom[k]) continue; let s = 0, n = 0;
    for (const d of [1, -1, nx, -nx]) if (dom[k + d]) { s += Z[k + d]; n++; }
    if (!n) continue; let z = Z[k] + w * ((s - ph * n / 4) / n - Z[k]);
    Z[k] = L[k] <= U[k] ? clamp(z, L[k], U[k]) : (L[k] + U[k]) / 2;
  }
  return Z;
}
const SOPRA_VOLARI = ['fpl', 'fdp', 'fds', 'fcr', 'pl', 'fcu', 'br', 'gfpl', 'gulnare', 'gfcr'];   // strutture volari che passano sopra
const TUBI_VOLARI = ['nmed', 'auln', 'nuln', 'npalm', 'vmed'];
// quota della faccia inferiore della prima struttura sopra la quota Z, colonna per colonna
function soffitto(Z, gruppi) {
  const U = new Float32Array(NC).fill(Infinity);
  for (const q of gruppi) for (let k = 0; k < NC; k++) if (q.bot[k] > Z[k] - 0.02 && q.bot[k] < U[k]) U[k] = q.bot[k];
  return U;
}
// quote di più mesh separate (ciascuna con la propria faccia inferiore)
const quoteSeparate = nomi => nomi.map(n => quote([n]));

/* ============ Capsula volare e zona fibrosa intermedia ============ */
function capsula() {
  const fondo = quote(['radio', 'scafoide', 'semilunare', 'cartrad', 'cartcarpo']), pq = quote(['pq']);
  const legam = quoteSeparate(['rsc', 'lrl', 'srl', 'ul', 'ut', 'uc', 'tfcc']), sopra = [...quoteSeparate(SOPRA_VOLARI), quoteTubi(TUBI_VOLARI)];
  const margineRad = profilo(y => { let b = null, s = -Infinity; for (const sg of sezione('radio', y)) for (const [x, z] of sg) if (z - x > s) { s = z - x; b = x; } return b; }, -0.2, 2.0, 0.2);
  // bordo distale del pronatore per colonna x
  const bordoPQ = new Float32Array(PL.nx).fill(Infinity);
  for (let k = 0; k < NC; k++) if (isFinite(pq.top[k])) { const i = k % PL.nx, y = cy((k / PL.nx) | 0); if (y < bordoPQ[i]) bordoPQ[i] = y; }
  // radialmente al pronatore il margine prosegue con lo stesso andamento (niente rientranze), poi media mobile
  { let ult = Infinity; for (let i = PL.nx - 1; i >= 0; i--) { if (cx(i) > CAPS.ulnare) continue; if (isFinite(bordoPQ[i])) ult = bordoPQ[i]; else bordoPQ[i] = ult; }
    const B = bordoPQ.slice(), m = Math.round(0.2 / PL.h);
    for (let i = 0; i < PL.nx; i++) { let s = 0, n = 0; for (let d = -m; d <= m; d++) { const v = B[i + d]; if (isFinite(v)) { s += v; n++; } } if (n) bordoPQ[i] = s / n; } }
  const yDist = x => { const D = CAPS.distale; if (x <= D[0][0]) return D[0][1]; for (let i = 1; i < D.length; i++) if (x <= D[i][0]) return mix(D[i - 1][1], D[i][1], (x - D[i - 1][0]) / (D[i][0] - D[i - 1][0])); return D[D.length - 1][1]; };
  const dom = new Uint8Array(NC);
  for (let j = 0; j < PL.ny; j++) for (let i = 0; i < PL.nx; i++) {
    const x = cx(i), y = cy(j), k = i + PL.nx * j;
    const yP = Math.min(isFinite(bordoPQ[i]) ? bordoPQ[i] + CAPS.sotto : 1.25, 1.25);
    const xR = margineRad(clamp(y, -0.2, 2.0)) + (y < 0 ? 0.12 : 0.05);
    if (x > xR && x < CAPS.ulnare && y > yDist(x) && y < yP) dom[k] = 1;
  }
  // angoli arrotondati (apertura morfologica di raggio CAPS.raggio)
  const E0 = distanza2D(dom), er = new Uint8Array(NC); for (let k = 0; k < NC; k++) er[k] = E0[k] < -CAPS.raggio ? 1 : 0;
  const E = liscia(distanza2D(er).map(v => v - CAPS.raggio), 3);
  const dom2 = new Uint8Array(NC); for (let k = 0; k < NC; k++) dom2[k] = E[k] < 2.5 * PL.h ? 1 : 0;
  // ostacoli: sotto l'osso e le cartilagini, sopra legamenti, pronatore, tendini, vasi e nervi
  const T = new Float32Array(NC), L = new Float32Array(NC), U = new Float32Array(NC), Z = new Float32Array(NC);
  for (let k = 0; k < NC; k++) {
    if (!dom2[k]) continue;
    T[k] = CAPS.sp * (0.55 + 0.45 * sstep(0, 0.12, -E[k]));
    L[k] = (isFinite(fondo.top[k]) ? fondo.top[k] : -1) + T[k] / 2;
  }
  // il fondo dove manca (fessura articolare) prende il valore dei vicini
  for (let p = 0; p < 40; p++) for (let k = PL.nx; k < NC - PL.nx; k++) if (dom2[k] && L[k] < -0.5) { let s = 0, n = 0; for (const d of [1, -1, PL.nx, -PL.nx]) if (L[k + d] > -0.5) { s += L[k + d]; n++; } if (n) L[k] = s / n - 0.05; }
  // legamenti e pronatore sollevano la lamina solo dove sono staccati dall'osso: le inserzioni la lasciano passare
  // (la capsula continua sotto di esse; i legamenti radiocarpici volari ne sono ispessimenti)
  const sollevati = q => ({ top: q.top, bot: q.bot.map((b, k) => b - fondo.top[k] < CAPS.piede ? Infinity : b) });
  const Ub = liscia(soffitto(L, [sollevati(pq), ...legam.map(sollevati), ...sopra]), 2);   // smussato: solchi dei tendini senza gradini
  for (let k = 0; k < NC; k++) { if (!dom2[k]) continue; U[k] = Ub[k] - 0.01 - T[k] / 2; Z[k] = L[k] + 0.05; }
  telo(dom2, L, U, Z, CAPS.p);
  // smussatura: sotto i tendini che poggiano quasi sull'osso (FPL e FDP alla watershed line) la lamina scende con un
  // raccordo dolce; può affondare appena nell'osso, mai salire nelle strutture sopra
  for (let p = 0; p < 8; p++) { const Q = Z.slice();
    for (let k = PL.nx + 1; k < NC - PL.nx - 1; k++) { if (!dom2[k]) continue; let s = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const q = k + a + PL.nx * b; if (dom2[q]) { s += Z[q]; n++; } }
      Q[k] = Math.min(Math.max(s / n, L[k] - 0.04), U[k]); }
    Z.set(Q); }
  // dove lo spazio resta stretto la lamina si assottiglia e resta sotto la struttura superiore
  let stretti = 0;
  for (let k = 0; k < NC; k++) { if (!dom2[k]) continue;
    if (Z[k] + T[k] / 2 > Ub[k] - 0.01) { const su = Ub[k] - 0.01, giu = Math.min(Z[k] - T[k] / 2, su - 0.045); T[k] = su - giu; Z[k] = (su + giu) / 2; stretti++; } }
  log('capsula: colonne', dom2.reduce((a, b) => a + b, 0), 'strette', stretti);
  const lo = new Float32Array(NC).fill(-Infinity), hi = new Float32Array(NC).fill(-Infinity);
  for (let k = 0; k < NC; k++) if (dom2[k]) { lo[k] = Z[k] - T[k] / 2; hi[k] = Z[k] + T[k] / 2; }
  return lastra('capvol', { lo, hi, E, fd: () => [0.15, 1, 0] });
}

/* ============ Arteria radiale ============ */
const fmt = v => +v.toFixed(3);
function arteria() {
  const riga0 = rigaOriginale('arad'), pts0 = riga0.match(/tube\(\[\[(.*?)\]\],([\d.]+)/)[1].split('],[').map(s => s.split(',').map(Number));
  const profondi = [quote(['pq', 'radio', 'ulna', 'mio', 'scafoide', 'trapezio']), G.man.meshes.some(m => m.n === 'capvol') ? quote(['capvol']) : null,
    quote(['rsc', 'rcl', 'srl', 'lrl'])].filter(Boolean);
  const fpl = quote(['fpl']), br = quote(['br']), tutti = [...profondi, fpl, br];
  // quota (centro − r) di un tubo di raggio r appoggiato sui piani: contatto lungo tutta la sezione, non solo al centro
  const appoggio = piani => (x, y) => { let m = -9;
    for (let d = -1; d <= 1.001; d += 0.25) { const dx = d * ARAD.r, f = Math.max(...piani.map(q => piano(q.top, x + dx, y) ?? -9)); m = Math.max(m, f + Math.sqrt(Math.max(0, ARAD.r ** 2 - dx * dx)) - ARAD.r); }
    return m; };
  const fondoP = appoggio(profondi), sopraTutti = appoggio(tutti);
  // quota del centro: sul piano profondo; se lì urterebbe FPL o brachioradiale (prossimalmente, dove poggia sul FPL) ci sale sopra
  const urta = (x, y, zc) => { for (let d = -1; d <= 1.001; d += 0.25) { const dx = d * ARAD.r, h = Math.sqrt(Math.max(0, ARAD.r ** 2 - dx * dx));
    for (const q of [fpl, br]) { const t = piano(q.top, x + dx, y), b = piano(q.bot, x + dx, y); if (t !== null && b !== null && b < zc + h + 0.01 && t > zc - h - 0.01) return true; } } return false; };
  const quota = (x, y) => { const z1 = fondoP(x, y) + ARAD.r + ARAD.gioco; return urta(x, y, z1) ? sopraTutti(x, y) + ARAD.r + ARAD.gioco : z1; };
  const [yA, yB] = ARAD.yCurva;
  // 1) x: sul pronatore radiale al fianco del FPL (alla quota del piano profondo), mai oltre il brachioradiale; più in alto sul FPL
  const nuovi = pts0.map(([x, y, z]) => {
    if (y < yA) return [x, y, z];
    let xn = x;
    for (let it = 0; it < 4; it++) {
      const zc = fondoP(xn, y) + ARAD.r + ARAD.gioco;
      // fianco radiale del FPL e fianco ulnare del brachioradiale: colonne dove occupano la quota dell'arteria
      const occupa = (q, xx) => { const t = piano(q.top, xx, y), b = piano(q.bot, xx, y); return t !== null && b !== null && b < zc + ARAD.r && t > zc - ARAD.r; };
      let xf = Infinity; for (let xx = xn - 0.8; xx < xn + 0.6; xx += 0.01) if (occupa(fpl, xx)) { xf = xx; break; }
      let xb = -Infinity; for (let xx = xn + 0.6; xx > xn - 1.0; xx -= 0.01) if (occupa(br, xx)) { xb = xx; break; }
      const lim = xf - ARAD.r - ARAD.dalFPL; if (xn > lim) xn = Math.max(lim, xb + ARAD.r + ARAD.dalFPL);
    }
    return [mix(xn, x, sstep(ARAD.yPQ[0], ARAD.yPQ[1], y)), y, z];
  });
  // 2) smussatura di x lungo il decorso, poi quota: poggia sul piano profondo
  const sm = (A, k, pass) => { for (let p = 0; p < pass; p++) { const B = A.map(v => v.slice()); for (let i = 1; i < A.length - 1; i++) if (A[i][1] >= yA) B[i][k] = (A[i - 1][k] + 2 * A[i][k] + A[i + 1][k]) / 4; A.splice(0, A.length, ...B); } };
  sm(nuovi, 0, 14);
  for (const p of nuovi) if (p[1] >= yA) p[2] = quota(p[0], p[1]);
  // filo teso: smussata e mai sotto il piano, l'arteria scavalca gli avvallamenti (rima volare → scafoide) senza seguirli
  for (let p = 0; p < 30; p++) { sm(nuovi, 2, 1); for (const q of nuovi) if (q[1] >= yA) q[2] = Math.max(q[2], quota(q[0], q[1])); }
  // 3) raccordo con il decorso originale nella curva sotto APL ed EPB
  const fin = nuovi.map((p, i) => { const t = sstep(yA, yB, p[1]); return [0, 1, 2].map(k => fmt(mix(pts0[i][k], p[k], t))); });
  // ramo palmare superficiale: parte dal punto corrispondente del nuovo decorso, raccordato sui primi punti
  const rigaS0 = rigaOriginale('aradsup'), s0 = rigaS0.match(/tube\(\[\[(.*?)\]\],([\d.]+)/)[1].split('],[').map(s => s.split(',').map(Number));
  const io = pts0.findIndex(p => Math.hypot(p[0] - s0[0][0], p[1] - s0[0][1], p[2] - s0[0][2]) < 1e-3);
  if (io < 0) throw new Error('origine del ramo palmare superficiale non trovata sull\'arteria radiale');
  const dO = [0, 1, 2].map(k => fin[io][k] - pts0[io][k]);
  const s1 = s0.map((p, i) => p.map((v, k) => fmt(v + dO[k] * (1 - sstep(0, 5, i)))));
  const scrivi = (riga0, pts) => riga0.replace(/tube\(\[\[(.*?)\]\]/, 'tube([' + pts.map(p => '[' + p.join(',') + ']').join(',') + ']');
  sostituisciRiga('arad', scrivi(rigaCorrente('arad'), fin));        // solo le coordinate: il resto della riga resta quello attuale
  sostituisciRiga('aradsup', scrivi(rigaCorrente('aradsup'), s1));
  const spost = fin.map((p, i) => Math.hypot(p[0] - pts0[i][0], p[2] - pts0[i][2]));
  log('arteria radiale: spostamento massimo', Math.max(...spost).toFixed(2), 'cm; origine del ramo superficiale spostata di', Math.hypot(...dO).toFixed(2), 'cm');
}
// riga di una struttura nel sorgente della pagina alla revisione ORIGINALE
let SORGENTE0 = null;
function rigaOriginale(id) {
  SORGENTE0 ??= execFileSync('git', ['show', `${ORIGINALE}:${FILE_REPO}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8');
  const r = SORGENTE0.split('\n').find(l => l.startsWith(`{id:'${id}',`)); if (!r) throw new Error('riga originale non trovata: ' + id);
  return r;
}
const rigaCorrente = id => { const r = G.M.html.split('\n').find(l => l.startsWith(`{id:'${id}',`)); if (!r) throw new Error('riga non trovata: ' + id); return r; };
function sostituisciRiga(id, nuova) {
  const righe = G.M.html.split('\n'), i = righe.findIndex(l => l.startsWith(`{id:'${id}',`));
  if (i < 0) throw new Error('riga non trovata: ' + id);
  righe[i] = nuova; G.M.html = righe.join('\n');
}

/* ============ Cuscinetto adiposo del pronatore quadrato ============ */
function adipe() {
  const fondo = quote(['pq', 'radio', 'ulna', 'mio', ...(G.man.meshes.some(m => m.n === 'capvol') ? ['capvol'] : [])]), pq = quote(['pq']);
  const sopra = [...quoteSeparate([...SOPRA_VOLARI, 'rsc', 'lrl', 'srl', 'ul', 'ut', 'uc']), quoteTubi([...TUBI_VOLARI, 'arad', 'aulnprof'])];
  const arad = tubi('arad')[0].pts, xArt = y => { let best = null, d = Infinity; for (const p of arad) if (Math.abs(p[1] - y) < d) { d = Math.abs(p[1] - y); best = p[0]; } return best; };
  // soffitto: faccia inferiore della prima struttura sopra il piano (anche se lo sfiora o vi entra di poco)
  const U = new Float32Array(NC).fill(Infinity);
  for (const q of sopra) for (let k = 0; k < NC; k++) if (q.bot[k] > fondo.top[k] - 0.1 && q.bot[k] < U[k]) U[k] = q.bot[k];
  // impronta del pronatore
  const imp = new Uint8Array(NC); for (let k = 0; k < NC; k++) imp[k] = isFinite(pq.top[k]) ? 1 : 0;
  const Epq = distanza2D(imp);
  const T = fondo.top, nx = PL.nx, pend = k => Math.hypot((T[k + 2] - T[k - 2]) / (4 * PL.h), (T[k + 2 * nx] - T[k - 2 * nx]) / (4 * PL.h));
  // FCU: sta di fianco al cuscinetto (non sopra), quindi fascia di rispetto in pianta dove scende alla sua quota
  const fcu = quote(['fcu']), mFcu = new Uint8Array(NC); for (let k = 0; k < NC; k++) mFcu[k] = isFinite(fcu.bot[k]) && fcu.bot[k] < T[k] + ADIPE.max + 0.1 ? 1 : 0;
  const Efcu = distanza2D(mFcu);
  const dom = new Uint8Array(NC);
  for (let j = 2; j < PL.ny - 2; j++) for (let i = 2; i < PL.nx - 2; i++) {
    const k = i + PL.nx * j, x = cx(i), y = cy(j);
    if (y < ADIPE.y[0] || y > ADIPE.y[1] || !isFinite(T[k])) continue;
    if (!(Epq[k] <= -0.2)) continue;                                                // sulla faccia volare del pronatore
    if (!(pend(k) < 0.6)) continue;                                                 // non sui fianchi (margine ulnare, bordo radiale)
    if (x < xArt(y) + ARAD.r + ADIPE.dallArteria) continue;                         // ulnarmente all'arteria radiale
    if (U[k] - T[k] - 2 * ADIPE.gioco < ADIPE.min) continue;
    dom[k] = 1;
  }
  // parte connessa più grande, poi contorno regolare (chiusura e apertura morfologiche)
  const etich = new Int32Array(NC).fill(-1), dim = []; let lab = 0;
  for (let s0 = 0; s0 < NC; s0++) { if (!dom[s0] || etich[s0] >= 0) continue; const coda = [s0]; etich[s0] = lab; let n = 0;
    while (coda.length) { const k = coda.pop(); n++; for (const d of [1, -1, PL.nx, -PL.nx]) { const q = k + d; if (q >= 0 && q < NC && dom[q] && etich[q] < 0) { etich[q] = lab; coda.push(q); } } }
    dim.push(n); lab++; }
  const big = dim.indexOf(Math.max(...dim)); for (let k = 0; k < NC; k++) dom[k] = etich[k] === big ? 1 : 0;
  const soglia = (D, v) => { const M = new Uint8Array(NC); for (let k = 0; k < NC; k++) M[k] = D[k] < v ? 1 : 0; return M; };
  const chiuso = soglia(distanza2D(soglia(distanza2D(dom), 0.15)).map(v => -v), -0.15).map(v => 1 - v);   // dilata e riduci di 1,5 mm: chiude buchi e insenature
  const E = liscia(distanza2D(soglia(distanza2D(chiuso), -0.2)).map((v, k) => Math.max(v - 0.2, 0.3 - Efcu[k])), 4);   // riduci e dilata di 2 mm (toglie le punte); 3 mm dal FCU
  const lo = new Float32Array(NC).fill(-Infinity), hi = new Float32Array(NC).fill(-Infinity);
  for (let k = 0; k < NC; k++) {
    if (E[k] > 2.5 * PL.h || !isFinite(T[k])) continue;
    const a = T[k] + ADIPE.gioco, libero = (isFinite(U[k]) ? U[k] - ADIPE.gioco : a + ADIPE.max) - a;
    lo[k] = a; hi[k] = a + Math.max(0.02, Math.min(libero, ADIPE.max * (0.35 + 0.65 * sstep(0, 0.35, -E[k]))));
  }
  liscia(lo, 2); liscia(hi, 2);
  for (let k = 0; k < NC; k++) if (isFinite(hi[k])) { const a = T[k] + ADIPE.gioco * 0.6; if (lo[k] < a) lo[k] = a; if (isFinite(U[k]) && hi[k] > U[k] - ADIPE.gioco * 0.6) hi[k] = Math.max(lo[k] + 0.012, U[k] - ADIPE.gioco * 0.6); }
  return lastra('adipq', { lo, hi, E, fd: () => [1, 0, 0], passo: 0.045 });
}

/* ============ Verifica: compenetrazioni ============ */
function verifica(nomi, contro) {
  for (const n of nomi) {
    if (!man.meshes.some(m => m.n === n)) continue;
    const { pos } = G.REAL(n), nv = pos.length / 3; let lo = [9, 9, 9], hi = [-9, -9, -9];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[3 * i + k]); hi[k] = Math.max(hi[k], pos[3 * i + k]); }
    griglia(lo, hi, 0.03, 0.2);
    for (const c of contro) {
      if (c === n || !man.meshes.some(m => m.n === c)) continue;
      const { F } = campo([c]); let dentro = 0, peggio = 0;
      for (let i = 0; i < nv; i++) { const d = sample(F, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (d < -0.03) { dentro++; peggio = Math.min(peggio, d); } }
      if (dentro) log(`  ${n} dentro ${c}: ${dentro} vertici (fino a ${(-peggio * 10).toFixed(1)} mm)`);
    }
  }
}

// tubo (vasi, nervi): punti dell'asse più vicini di r − 0,2 mm alla superficie di una mesh
function verificaTubo(id, contro) {
  for (const { pts, r } of tubi(id)) {
    const P = []; for (let s = 0; s < pts.length - 1; s++) for (let q = 0; q < 4; q++) P.push([0, 1, 2].map(k => mix(pts[s][k], pts[s + 1][k], q / 4)));
    const lo = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
    griglia(lo, hi, 0.03, 0.4);
    for (const c of contro) {
      if (!man.meshes.some(m => m.n === c)) continue;
      const { F } = campo([c]); let n = 0, peggio = 0, dove = null;
      for (const p of P) { const d = sample(F, ...p) - r; if (d < -0.02) { n++; if (d < peggio) { peggio = d; dove = p; } } }
      if (n) log(`  ${id} dentro ${c}: ${n} punti (fino a ${(-peggio * 10).toFixed(1)} mm, y = ${dove[1].toFixed(2)})`);
    }
  }
}

/* ============ Esecuzione ============ */
const passi = process.argv.slice(2), vuole = k => !passi.length || passi.includes(k);
if (passi.includes('verifica')) {
  verifica(['pq'], ['radio', 'ulna', 'br', 'fpl', 'fdp', 'fcu', 'apl', 'mio']);
  verifica(['capvol'], ['radio', 'scafoide', 'semilunare', 'pq', 'fpl', 'fdp', 'rsc', 'lrl', 'srl']);
  verifica(['adipq'], ['pq', 'radio', 'ulna', 'fpl', 'fdp', 'fds', 'fcu', 'capvol']);
  verificaTubo('arad', ['radio', 'pq', 'capvol', 'fpl', 'fcr', 'fds', 'br', 'apl', 'epb', 'scafoide', 'trapezio', 'rsc', 'rcl', 'adipq']);
  verificaTubo('aradsup', ['apb', 'fpb', 'op', 'retfl', 'scafoide', 'trapezio', 'capvol']);
  for (const t of ['nmed', 'auln', 'nuln', 'npalm']) verificaTubo(t, ['pq', 'capvol', 'adipq']);
} else {
  if (vuole('pq')) pronatore();
  if (vuole('capsula')) capsula();
  if (vuole('arteria')) arteria();
  if (vuole('adipe')) adipe();
  saveFile(repack());
}
