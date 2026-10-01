/* Cartilagini articolari del polso (modelli/polso-dito-3d.html, sezione polso): le rifila sul profilo articolare.

   Uso (dalla cartella del progetto):
     node strumenti/cartilagini-polso.mjs            → riscrive cartrad, cartuln, cartcarpo, cartmc nel file del modello
     MODELLO=/tmp/copia.html node strumenti/cartilagini-polso.mjs   → lavora su una copia

   Le cartilagini originali rivestono anche i versanti non articolari attorno alle rime e debordano oltre il profilo
   dell'osso. Qui la cartilagine resta solo dove la sua superficie guarda un osso affrontato (o il disco del TFCC)
   entro pochi millimetri: lì mantiene lo spessore, verso il margine si assottiglia e fuori dalla superficie
   articolare rientra appena sotto l'osso (non si vede). Spessore massimo SPMAX.
   Riparte sempre dalle cartilagini della revisione ORIGINALE, quindi si può rilanciare. Ordine: cartilagini-polso.mjs,
   poi legamenti-polso.mjs (i legamenti poggiano anche sulle cartilagini; qui il TFCC già presente basta a
   riconoscere la cupola ulnare come articolare). Parametri in testa. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setPos, setGriglia, solid, edt, sample, sstep, log, repack, saveFile, posDaRevisione, esatta } = G;

const ORIGINALE = '1d7d467';           // revisione con le cartilagini originali
const CART = ['cartrad', 'cartuln', 'cartcarpo', 'cartmc'];
const OSSA = ['radio', 'ulna', 'scafoide', 'semilunare', 'piramidale', 'pisiforme', 'trapezio', 'trapezoide', 'capitato', 'uncinato', 'mc1', 'mc2', 'mc3', 'mc4', 'mc5', 'f1'];
const AFFRONTATI = ['tfcc'];            // strutture non ossee che rendono articolare la superficie che le guarda
const H = 0.025, MARG = 0.5;           // griglia (cm)
const PORTATA = 0.26;                  // distanza massima (lungo la normale) entro cui cercare la superficie affrontata
const VICINO = [0.03, 0.09];           // da "a contatto" a "non affrontata": spessore pieno → nullo
const SPMAX = 0.12, SOTTO = 0.05;      // spessore massimo; profondità a cui rientra la cartilagine tolta

const bb = pos => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], pos[i]); hi[k] = Math.max(hi[k], pos[i]); } return [lo, hi]; };
function campo(nome) { // distanza con segno: esatta entro 1 mm dalla superficie, trasformata di distanza altrove
  const M = solid(nome), Do = edt(M), Di = edt(M, true), F = new Float32Array(G.N);
  for (let i = 0; i < G.N; i++) F[i] = M[i] ? -(Di[i] - H / 2) : Do[i] - H / 2;
  return esatta(F, [nome], 0.1);
}

for (const c of CART) {
  const pos = posDaRevisione(ORIGINALE, c, 'modelli/polso-dito-3d.html'), { idx } = REAL(c), nv = pos.length / 3, [lo, hi] = bb(pos);
  const o = lo.map(v => v - MARG), n = hi.map((v, k) => Math.ceil((v + MARG - o[k]) / H)); setGriglia(o, H, n[0], n[1], n[2]);
  const nomi = [...OSSA, ...AFFRONTATI].filter(x => { const [l, h] = bb(REAL(x).pos); return [0, 1, 2].every(k => h[k] > o[k] && l[k] < o[k] + n[k] * H); });
  const F = nomi.map(campo), osso = nomi.map(x => OSSA.includes(x));
  const su = (k, p) => sample(F[k], p[0], p[1], p[2]);
  const f = new Float32Array(nv), d = new Float32Array(nv), N = [], own = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    let k0 = -1, best = 1e9; for (let k = 0; k < nomi.length; k++) if (osso[k]) { const v = su(k, p); if (v < best) { best = v; k0 = k; } }
    const e = H * 0.75, g = [su(k0, [p[0] + e, p[1], p[2]]) - su(k0, [p[0] - e, p[1], p[2]]), su(k0, [p[0], p[1] + e, p[2]]) - su(k0, [p[0], p[1] - e, p[2]]), su(k0, [p[0], p[1], p[2] + e]) - su(k0, [p[0], p[1], p[2] - e])];
    const l = Math.hypot(...g) || 1; N.push(g.map(x => x / l)); d[i] = best; own[i] = k0;
    // la superficie guarda un'altra struttura entro PORTATA?
    let m = 1e9; for (let s = 0; s <= PORTATA; s += 0.02) { const q = [p[0] + N[i][0] * (Math.max(0, best) + s), p[1] + N[i][1] * (Math.max(0, best) + s), p[2] + N[i][2] * (Math.max(0, best) + s)];
      for (let k = 0; k < nomi.length; k++) if (k !== k0) m = Math.min(m, su(k, q)); }
    f[i] = 1 - sstep(VICINO[0], VICINO[1], m);
  }
  // fattore smussato sulla mesh (margini regolari)
  const nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < idx.length; t += 3) { const [a, b, cc] = [idx[t], idx[t + 1], idx[t + 2]]; nb[a].add(b).add(cc); nb[b].add(a).add(cc); nb[cc].add(a).add(b); }
  let fs = f; for (let it = 0; it < 24; it++) { const q = fs.slice(); for (let i = 0; i < nv; i++) { let s = fs[i], c2 = 1; for (const j of nb[i]) { s += fs[j]; c2++; } q[i] = s / c2; } fs = q; }
  // normali smussate sulla mesh (spostamenti regolari)
  let Ns = N; for (let it = 0; it < 4; it++) Ns = Ns.map((v, i) => { let s = v.slice(); for (const j of nb[i]) for (let a = 0; a < 3; a++) s[a] += Ns[j][a]; const l = Math.hypot(...s) || 1; return s.map(x => x / l); });
  let out = new Float32Array(pos.length), tolti = 0; const K = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = K[i] = sstep(0.42, 0.58, fs[i]), dn = Math.min(d[i], SPMAX) * k - SOTTO * (1 - k), dd = dn - d[i]; if (k < 0.05) tolti++;
    for (let a = 0; a < 3; a++) out[3 * i + a] = pos[3 * i + a] + Ns[i][a] * dd;
  }
  // regolarizzazione leggera (Laplace) solo dove la cartilagine è stata assottigliata
  for (let it = 0; it < 6; it++) { const q = out.slice(); for (let i = 0; i < nv; i++) { if (K[i] > 0.98) continue; const L = [...nb[i]]; for (let a = 0; a < 3; a++) { let s = 0; for (const j of L) s += out[3 * j + a]; q[3 * i + a] = 0.5 * out[3 * i + a] + 0.5 * s / L.length; } } out = q; }
  setPos(c, out); log(c, nv, 'vertici;', Math.round(100 * tolti / nv) + '% portati sotto l\'osso');
}
saveFile(repack());
