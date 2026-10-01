/* Legamenti del carpo e TFCC del polso (modelli/polso-dito-3d.html, sezione polso).

   Uso (dalla cartella del progetto):
     node strumenti/legamenti-polso.mjs            → riscrive le mesh nel file del modello
     MODELLO=/tmp/copia.html node strumenti/legamenti-polso.mjs   → lavora su una copia

   Ogni legamento è una superficie implicita costruita sulle ossa reali (BodyParts3D) e sulle loro cartilagini:
   - legamenti estrinseci e collaterali: nastro che segue la superficie ossea "tesa" (chiusura morfologica
     delle ossa, così scavalca le rime articolari come un legamento in tensione), con le inserzioni che
     scendono sull'osso vero e si allargano a ventaglio; sezione lenticolare (margini sottili), spessore
     che si riduce verso le inserzioni, leggeri fascicoli longitudinali;
   - scafo-lunato e luno-piramidale: tessuto che occupa la periferia della rima tra le due ossa,
     a forma di C (dorsale spesso, prossimale membranoso, volare intermedio), aperto verso la mediocarpica;
   - TFCC: disco biconcavo tra cupola ulnare e semilunare/piramidale, inserito sul margine dell'incisura
     sigmoidea del radio e alla fovea/base dello stiloide, con i margini ispessiti (legamenti radioulnari
     dorsale e volare), inserito alla fovea e alla base dello stiloide.
   Le linee guida (punti in cm, sistema del modello: x radiale→ulnare, y distale→prossimale, z dorsale→volare)
   sono nella tabella LEG: i punti vengono proiettati sulla superficie, quindi bastano approssimativi.
   Il risultato sono mesh `tfcc`, `lsl`, `llt` e una mesh per legamento (nome = id della struttura nella pagina),
   con la direzione delle fibre per vertice (attributo `d`, usato dallo shader delle fibre).
   Riparte sempre dalle ossa e cartilagini incorporate (che non modifica), quindi si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs'); // griglia corrente: G.O, G.H, G.NX… cambiano con setGriglia
const { man, setMesh, setGriglia, solid, edt, sample, or, clamp, sstep, log, repack, saveFile } = G;

const OSSA = ['radio', 'ulna', 'scafoide', 'semilunare', 'piramidale', 'pisiforme', 'trapezio', 'trapezoide', 'capitato', 'uncinato', 'mc1', 'mc2', 'mc3', 'mc4', 'mc5'];
const CART = ['cartrad', 'cartuln', 'cartcarpo', 'cartmc'];
const STEP = 0.02; // passo della griglia (cm)

/* ============ Vettori ============ */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => a + (b - a) * t;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

/* ============ Griglia locale e campi di distanza ============ */
// imposta una griglia che contiene il riquadro [lo, hi] (+ margine) e restituisce i suoi parametri
function griglia(lo, hi, h = STEP, pad = 0.45) {
  const o = lo.map(v => v - pad), n = hi.map((v, k) => Math.ceil((v + pad - o[k]) / h));
  setGriglia(o, h, n[0], n[1], n[2]); return { o, h, nx: n[0], ny: n[1], nz: n[2] };
}
// distanza con segno da un solido voxelizzato (negativa dentro)
function sdf(M) {
  const Do = edt(M), Di = edt(M, true), F = new Float32Array(G.N), h2 = G.H / 2;
  for (let i = 0; i < G.N; i++) F[i] = M[i] ? -(Di[i] - h2) : Do[i] - h2;
  return { F, Do };
}
// chiusura morfologica di raggio r: la superficie scavalca rime articolari e piccole concavità
function chiuso(Do, r) {
  const A = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) A[i] = Do[i] <= r ? 1 : 0;
  const E = edt(A, true), F = new Float32Array(G.N);
  for (let i = 0; i < G.N; i++) F[i] = A[i] ? r - E[i] : Do[i];
  return F;
}
// distanza esatta dai triangoli delle mesh (con segno dalla normale della faccia più vicina) nei voxel entro `banda`
// dalla superficie; altrove resta il valore della trasformata di distanza (F). Le mesh ossee sono chiuse e orientate verso l'esterno.
function esatta(F, nomi, banda = 0.07) {
  const best = new Float32Array(G.N).fill(1e9), sg = new Int8Array(G.N), { O, H, NX, NY, NZ } = G, NXY = NX * NY;
  const cp = (p, a, b, c) => { // punto del triangolo più vicino a p (Ericson, Real-Time Collision Detection 5.1.5)
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
    const pc = sub(p, c), d5 = dot(ab, pc), d6 = dot(ac, pc); if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    const dn = 1 / (va + vb + vc); return add(a, add(mul(ab, vb * dn), mul(ac, vc * dn)));
  };
  const lo = [O[0], O[1], O[2]], hi = [O[0] + NX * H, O[1] + NY * H, O[2] + NZ * H];
  for (const n of nomi) {
    const { pos, idx } = G.REAL(n);
    for (let t = 0; t < idx.length; t += 3) {
      const a = [pos[3 * idx[t]], pos[3 * idx[t] + 1], pos[3 * idx[t] + 2]], b = [pos[3 * idx[t + 1]], pos[3 * idx[t + 1] + 1], pos[3 * idx[t + 1] + 2]], c = [pos[3 * idx[t + 2]], pos[3 * idx[t + 2] + 1], pos[3 * idx[t + 2] + 2]];
      const mn = [0, 1, 2].map(k => Math.min(a[k], b[k], c[k]) - banda), mx = [0, 1, 2].map(k => Math.max(a[k], b[k], c[k]) + banda);
      if (mx[0] < lo[0] || mx[1] < lo[1] || mx[2] < lo[2] || mn[0] > hi[0] || mn[1] > hi[1] || mn[2] > hi[2]) continue;
      const nf = cross(sub(b, a), sub(c, a)), r = [NX, NY, NZ];
      const i0 = [0, 1, 2].map(k => Math.max(0, Math.ceil((mn[k] - O[k]) / H - 0.5))), i1 = [0, 1, 2].map(k => Math.min(r[k] - 1, Math.floor((mx[k] - O[k]) / H - 0.5)));
      for (let kk = i0[2]; kk <= i1[2]; kk++) for (let jj = i0[1]; jj <= i1[1]; jj++) for (let ii = i0[0]; ii <= i1[0]; ii++) {
        const p = [O[0] + (ii + 0.5) * H, O[1] + (jj + 0.5) * H, O[2] + (kk + 0.5) * H], q = cp(p, a, b, c), d = sub(p, q), dd = len(d), id = ii + NX * jj + NXY * kk;
        if (dd < best[id] - 1e-7) { best[id] = dd; sg[id] = dot(d, nf) >= 0 ? 1 : -1; }
      }
    }
  }
  for (let i = 0; i < G.N; i++) if (best[i] <= banda) F[i] = sg[i] * best[i];
  return F;
}
const unione = nomi => nomi.reduce((M, n) => or(M, solid(n)), new Uint8Array(G.N));
// gradiente (non normalizzato) di un campo: array campionato sulla griglia corrente oppure { s: funzione(p) }
const grad = (F, p, e = G.H * 0.75) => { const f = F.s || ((x, y, z) => sample(F, x, y, z)), g = F.s ? (x, y, z) => f([x, y, z]) : f;
  return [g(p[0] + e, p[1], p[2]) - g(p[0] - e, p[1], p[2]), g(p[0], p[1] + e, p[2]) - g(p[0], p[1] - e, p[2]), g(p[0], p[1], p[2] + e) - g(p[0], p[1], p[2] - e)]; };
// sfocatura (box 3×3×3, più passate): toglie la gradinatura dei campi di distanza
function sfoca(F, passate = 2) {
  const { NX, NY, NZ } = G, NXY = NX * NY; let A = F, Bf = new Float32Array(F.length);
  for (let p = 0; p < passate; p++) for (const [st, n] of [[1, NX], [NX, NY], [NXY, NZ]]) {
    for (let i = 0; i < A.length; i++) { const c = ((i / st) | 0) % n; Bf[i] = (A[c > 0 ? i - st : i] + A[i] + A[c < n - 1 ? i + st : i]) / 3; }
    [A, Bf] = [Bf, A];
  }
  return A === F ? F : (F.set(A), F);
}
// porta p sulla superficie di livello lev del campo f(p) (funzione) con passi di Newton lungo il gradiente
function proietta(f, p, lev, it = 8) {
  for (let i = 0; i < it; i++) {
    const e = G.H * 0.75, v = f(p) - lev;
    const g = [f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]), f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]), f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])].map(x => x / (2 * e));
    const g2 = dot(g, g) || 1; p = sub(p, mul(g, clamp(v / g2, -0.15, 0.15)));
    if (Math.abs(v) < 1e-4) break;
  }
  return p;
}

/* ============ Smussatura di Taubin (non restringe la forma) ============ */
function taubin(pos, I, iter) {
  const nv = pos.length / 3, nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const NB = nb.map(s => [...s]);
  for (let it = 0; it < iter; it++) {
    const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
    for (let i = 0; i < nv; i++) { const L = NB[i]; if (!L.length) continue; let x = 0, y = 0, z = 0; for (const j of L) { x += pos[3 * j]; y += pos[3 * j + 1]; z += pos[3 * j + 2]; }
      q[3 * i] += lam * (x / L.length - pos[3 * i]); q[3 * i + 1] += lam * (y / L.length - pos[3 * i + 1]); q[3 * i + 2] += lam * (z / L.length - pos[3 * i + 2]); }
    pos = q;
  }
  return pos;
}

/* ============ Surface nets su un campo campionato ai centri dei voxel ============ */
function nets(V, fd) {
  const { NX, NY, NZ, O, H } = G, NXY = NX * NY;
  const cx = NX - 1, cy = NY - 1, cz = NZ - 1, C = new Int32Array(cx * cy * cz).fill(-1), P = [];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const b = i + NX * j + NXY * k; let m = 0;
    for (let c = 0; c < 8; c++) { v[c] = V[b + CO[c][0] + CO[c][1] * NX + CO[c][2] * NXY]; if (v[c] < 0) m |= 1 << c; }
    if (m === 0 || m === 255) continue;
    let ax = 0, ay = 0, az = 0, n = 0;
    for (const [a, bb] of ED) if ((v[a] < 0) !== (v[bb] < 0)) { const t = v[a] / (v[a] - v[bb]); ax += CO[a][0] + (CO[bb][0] - CO[a][0]) * t; ay += CO[a][1] + (CO[bb][1] - CO[a][1]) * t; az += CO[a][2] + (CO[bb][2] - CO[a][2]) * t; n++; }
    C[i + cx * j + cx * cy * k] = P.length / 3;
    P.push(O[0] + (i + 0.5 + ax / n) * H, O[1] + (j + 0.5 + ay / n) * H, O[2] + (k + 0.5 + az / n) * H);
  }
  const id = (i, j, k) => C[i + cx * j + cx * cy * k], I = [];
  const quad = (a, b, c, d) => { if (a >= 0 && b >= 0 && c >= 0 && d >= 0) I.push(a, b, c, a, c, d); };
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    if (id(i, j, k) < 0) continue; const b = i + NX * j + NXY * k, s0 = V[b] < 0;
    if (j > 0 && k > 0 && s0 !== (V[b + 1] < 0)) quad(id(i, j, k), id(i, j - 1, k), id(i, j - 1, k - 1), id(i, j, k - 1));
    if (i > 0 && k > 0 && s0 !== (V[b + NX] < 0)) quad(id(i, j, k), id(i, j, k - 1), id(i - 1, j, k - 1), id(i - 1, j, k));
    if (i > 0 && j > 0 && s0 !== (V[b + NXY] < 0)) quad(id(i, j, k), id(i - 1, j, k), id(i - 1, j - 1, k), id(i, j - 1, k));
  }
  // triangoli orientati con la normale verso l'esterno (gradiente del campo)
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map(q => [P[3 * q], P[3 * q + 1], P[3 * q + 2]]);
    const m = mul(add(add(a, b), c), 1 / 3), gr = grad(V, m);
    if (dot(cross(sub(b, a), sub(c, a)), gr) < 0) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  }
  let pos = new Float32Array(P);
  pos = taubin(pos, I, 12); const nv = pos.length / 3;
  const fdir = new Int8Array(nv * 3);
  for (let i = 0; i < nv; i++) { const d = nrm(fd([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]])); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(d[k] * 127); }
  return { pos, idx: Uint32Array.from(I), tag: null, fdir };
}

/* ============ Nastro legamentoso ============ */
/* L = { id, p: punti guida (primo = origine, ultimo = inserzione), w: semilarghezze [origine, centro, inserzione],
         t: spessore al centro, r: raggio di chiusura (quanto il legamento resta "teso" sulle concavità),
         fl: allargamento a ventaglio delle inserzioni, fas: numero di fascicoli, extra: solidi aggiuntivi su cui poggia } */
function nastro(Lg, ctx) {
  const { Fr, Fc } = ctx, n0 = Lg.p.length;
  const endW = u => 1 - sstep(0, 0.2, u) * sstep(0, 0.2, 1 - u);   // 1 alle inserzioni, 0 al centro
  const t0 = u => Lg.t * (0.55 + 0.45 * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.6);
  const lev = u => t0(u) * 0.5 - 0.01;
  const Fb = (p, u) => mix(sample(Fc, ...p), sample(Fr, ...p), endW(u));
  // 1. punti guida sulla superficie: estremi sull'osso vero, intermedi sulla superficie tesa
  const g = Lg.p.map((p, i) => { const u = i / (n0 - 1); return proietta(q => Fb(q, u), p, lev(u)); });
  // 2. linea densa per tratti, poi rilassata (filo teso vincolato alla superficie, guide come vincoli morbidi)
  let C = [], pin = [];
  for (let i = 0; i < n0 - 1; i++) { const m = Math.max(4, Math.ceil(len(sub(g[i + 1], g[i])) / 0.025)); for (let k = 0; k < m; k++) C.push(add(g[i], mul(sub(g[i + 1], g[i]), k / m))); pin.push(C.length - m); }
  C.push(g[n0 - 1]); pin.push(C.length - 1);
  const N = C.length, uOf = () => { const s = [0]; for (let i = 1; i < N; i++) s.push(s[i - 1] + len(sub(C[i], C[i - 1]))); return s.map(x => x / s[N - 1]); };
  let U = uOf();
  for (let it = 0; it < 120; it++) {
    const D = C.map(p => p.slice());
    for (let i = 1; i < N - 1; i++) D[i] = add(mul(C[i], 0.5), mul(add(C[i - 1], C[i + 1]), 0.25));
    pin.forEach((i, k) => { if (k > 0 && k < n0 - 1) D[i] = add(mul(D[i], 0.85), mul(g[k], 0.15)); });
    for (let i = 1; i < N - 1; i++) D[i] = proietta(q => Fb(q, U[i]), D[i], lev(U[i]), 3);
    C = D; U = uOf();
  }
  // 3. riferimento locale lungo la linea: tangente T, normale alla superficie Nn, binormale B
  const S = [0]; for (let i = 1; i < N; i++) S.push(S[i - 1] + len(sub(C[i], C[i - 1]))); const Ls = S[N - 1];
  const T = C.map((p, i) => nrm(sub(C[Math.min(N - 1, i + 2)], C[Math.max(0, i - 2)])));
  const normale = (p, u) => nrm(grad({ s: q => Fb(q, u) }, p));
  const Nn = C.map((p, i) => { const n = normale(p, U[i]); return nrm(sub(n, mul(T[i], dot(n, T[i])))); });
  // riferimento trasversale molto smussato: il nastro non si attorciglia (la conformità all'osso la dà la proiezione dei punti)
  for (let s = 0; s < 60; s++) { const Q = Nn.map(n => n.slice()); for (let i = 0; i < N; i++) { const a = Nn[Math.max(0, i - 1)], b = Nn[Math.min(N - 1, i + 1)]; Q[i] = nrm(add(mul(Nn[i], 0.5), mul(add(a, b), 0.25))); Q[i] = nrm(sub(Q[i], mul(T[i], dot(Q[i], T[i])))); } Nn.splice(0, N, ...Q); }
  const B = C.map((p, i) => nrm(cross(T[i], Nn[i])));
  const [w0, wm, w1] = Lg.w, fl = Lg.fl ?? 0.18;
  const W = u => (u < 0.5 ? mix(w0, wm, sstep(0, 0.5, u)) : mix(wm, w1, sstep(0.5, 1, u))) * (1 + fl * (1 - sstep(0, 0.18, u)) + fl * (1 - sstep(0, 0.18, 1 - u)));
  const seed = Lg.id.length * 1.7, nf = Lg.fas ?? 4;
  // 4. mesh: anelli lungo la linea; vicino agli estremi la larghezza si chiude ad arco (impronta arrotondata)
  //    e lo spessore si riduce: l'inserzione si appiattisce sull'osso. Faccia profonda proiettata sull'osso
  //    (appena dentro), faccia superficiale a cupola bassa con fascicoli, margini sottili.
  const at = s => { // punto, riferimento e u alla distanza s lungo la linea
    let i = 0; while (i < N - 2 && S[i + 1] < s) i++;
    const h = clamp((s - S[i]) / ((S[i + 1] - S[i]) || 1), 0, 1), u = mix(U[i], U[i + 1], h);
    const lerp = A => nrm(add(mul(A[i], 1 - h), mul(A[i + 1], h)));
    return { c: add(C[i], mul(sub(C[i + 1], C[i]), h)), t: lerp(T), n: lerp(Nn), b: lerp(B), u };
  };
  const M = 28, e0 = Math.min(W(0) * 0.8, Ls * 0.3), e1 = Math.min(W(1) * 0.8, Ls * 0.3), ds = 0.03;
  // ascisse degli anelli: uniformi al centro, uniformi nell'angolo sugli archi terminali (niente salti di larghezza)
  const SS = [], na = 9, nm = Math.max(8, Math.ceil((Ls - e0 - e1) / ds));
  for (let i = 0; i < na; i++) SS.push(e0 * (1 - Math.cos(Math.PI / 2 * i / na)));
  for (let i = 0; i <= nm; i++) SS.push(e0 + (Ls - e0 - e1) * i / nm);
  for (let i = na - 1; i >= 0; i--) SS.push(Ls - e1 * (1 - Math.cos(Math.PI / 2 * i / na)));
  const nr = SS.length - 1, pos = [], fdl = [], idx = [], rings = [];
  for (let r = 0; r <= nr; r++) {
    const s = SS[r], f = at(s), u = f.u;
    const k = Math.sqrt(Math.max(0, 1 - (Math.max(0, e0 - s) / e0) ** 2 - (Math.max(0, s - (Ls - e1)) / e1) ** 2));
    const Le = Math.min(0.45, Ls * 0.3), tk = 0.45 + 0.55 * sstep(0, Le, s) * sstep(0, Le, Ls - s);
    // tv = spessore visibile sopra l'osso; la faccia profonda resta appena dentro (hin) così non resta luce
    const w = W(u) * Math.max(k, 0.03), tv = Math.max(0.06, t0(u) * tk) * Math.max(k, 0.03) ** 0.5, hin = -0.012 - 0.008 * endW(u), ring = [];
    for (let j = 0; j < M; j++) {
      const th = 2 * Math.PI * j / M, cs = Math.cos(th), sn = Math.sin(th), a = w * cs;
      const q = proietta(x => Fb(x, u), add(f.c, mul(f.b, a)), hin, 6), n = nrm(add(normale(q, u), f.n));
      // fascicoli: creste longitudinali che si spostano appena lungo il legamento
      const ar = Math.abs(cs), fas = 1 + 0.11 * Math.sin((cs + 1) * Math.PI * nf + seed + 0.9 * Math.sin(s * 2.7 + seed)) * (1 - ar ** 2);
      const hgt = sn >= 0 ? (tv - hin) * Math.pow(Math.max(0, 1 - ar ** 4), 0.55) * fas : -0.006 * -sn;
      const p = add(q, mul(n, hgt)); ring.push(pos.length / 3); pos.push(...p); fdl.push(...f.t);
    }
    rings.push({ ring, c: f.c, t: f.t });
  }
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  // orientamento coerente su tutta la mesh: verso scelto a maggioranza (il test locale è incerto dove l'anello si chiude)
  const nrmT = (a, b, c) => cross(sub(P(b), P(a)), sub(P(c), P(a)));
  const lato = [], tappi = [[], []];
  for (let r = 0; r < nr; r++) for (let j = 0; j < M; j++) {
    const R0 = rings[r].ring, R1 = rings[r + 1].ring; lato.push([R0[j], R1[j], R0[(j + 1) % M]], [R0[(j + 1) % M], R1[j], R1[(j + 1) % M]]);
  }
  const voto = (T, outF) => T.reduce((v, t) => v + Math.sign(dot(nrmT(...t), outF(t))), 0);
  const ctr = r => mul(add(rings[r].c, rings[Math.min(nr, r + 1)].c), 0.5);
  let vL = 0; lato.forEach((t, i) => { vL += Math.sign(dot(nrmT(...t), sub(P(t[0]), ctr(Math.floor(i / (2 * M)))))); });
  [[rings[0], -1, 0], [rings[nr], 1, 1]].forEach(([R, sg, q]) => { // chiusura delle estremità (anelli già ridotti a pochi decimi di mm)
    const m = R.ring.reduce((acc, i) => add(acc, mul(P(i), 1 / M)), [0, 0, 0]), ci = pos.length / 3; pos.push(...m); fdl.push(...R.t);
    for (let j = 0; j < M; j++) tappi[q].push([ci, R.ring[j], R.ring[(j + 1) % M]]);
    const v = voto(tappi[q], () => mul(R.t, sg)); if (v < 0) tappi[q] = tappi[q].map(([a, b, c]) => [a, c, b]);
  });
  for (const [a, b, c] of lato) if (vL >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  for (const T of tappi) for (const t of T) idx.push(...t);
  const fdir = Int8Array.from(fdl.map(v => Math.round(v * 127)));
  return { pos: taubin(Float32Array.from(pos), idx, 16), idx: Uint32Array.from(idx), tag: null, fdir };
}

/* ============ Contesto: ossa e cartilagini nella griglia del legamento ============ */
function contesto(lo, hi, r, extra = []) {
  const gr = griglia(lo, hi);
  const nomi = [...OSSA, ...CART, ...extra], M = unione(nomi), { F: Fr, Do } = sdf(M), Fc = chiuso(Do, r);
  return { gr, Fr: esatta(sfoca(Fr, 1), nomi), Fc: sfoca(Fc, 4) };
}
const bbox = pts => [[0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])))];

/* ============ Strutture implicite (TFCC, interossei) ============ */
// campo con segno di un gruppo di mesh nella griglia corrente: trasformata di distanza + distanza esatta vicino alla superficie
const campo = nomi => { const M = unione(nomi), { F, Do } = sdf(M); return { F: esatta(sfoca(F, 1), nomi, 0.1), Do }; };
const voxel = id => [G.O[0] + (id % G.NX + 0.5) * G.H, G.O[1] + (((id / G.NX) | 0) % G.NY + 0.5) * G.H, G.O[2] + (((id / (G.NX * G.NY)) | 0) + 0.5) * G.H];
const valuta = g => { const V = new Float32Array(G.N); for (let id = 0; id < G.N; id++) V[id] = g(voxel(id)); return V; };
// polilinea densa e smussata tra punti guida
function densa(pts, passo = 0.02) {
  let C = []; for (let i = 0; i < pts.length - 1; i++) { const m = Math.max(2, Math.ceil(len(sub(pts[i + 1], pts[i])) / passo)); for (let k = 0; k < m; k++) C.push(add(pts[i], mul(sub(pts[i + 1], pts[i]), k / m))); }
  C.push(pts[pts.length - 1]);
  for (let it = 0; it < 20; it++) C = C.map((p, i) => i === 0 || i === C.length - 1 ? p : add(mul(p, 0.5), mul(add(C[i - 1], C[i + 1]), 0.25)));
  return C;
}
// distanza da una polilinea: { d, u (0…1), t (tangente) }
function dalLinea(C, p) {
  let best = 1e9, bu = 0, bt = null; const n = C.length;
  for (let i = 0; i < n - 1; i++) { const a = C[i], ab = sub(C[i + 1], a), l2 = dot(ab, ab) || 1e-9, h = clamp(dot(sub(p, a), ab) / l2, 0, 1), d = len(sub(p, add(a, mul(ab, h))));
    if (d < best) { best = d; bu = (i + h) / (n - 1); bt = ab; } }
  return { d: best, u: bu, t: nrm(bt) };
}
// distanza con segno da un poligono 2D (punti in senso qualsiasi), negativa dentro
function poligono(P, x, z) {
  let d = 1e9, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i], ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az, h = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez), 0, 1);
    d = Math.min(d, Math.hypot(wx - ex * h, wz - ez * h));
    if ((az > z) !== (bz > z) && x < ax + (z - az) * ex / ez) s = -s;
  }
  return s * d;
}

/* TFCC. Un unico solido: disco tra cupola ulnare (con la sua cartilagine) e semilunare/piramidale, base sul margine
   dell'incisura sigmoidea (penetra appena nel radio: è inserito), apice alla fovea e alla base dello stiloide, dove
   si attacca all'osso. Superficie distale concava e più alta al centro (biconcavo, più sottile al centro), più bassa
   verso l'ulna. I margini dorsale e volare (legamenti radioulnari) sono più spessi e arrotondati e scendono sui
   versanti della testa ulnare. Il versante ulnare (omologo meniscale) è rappresentato dal collaterale ulnare. */
const TF = {
  bordo: [[-0.78, -0.94], [-0.78, 0.6], [-0.3, 0.52], [0.2, 0.46], [0.6, 0.3], [0.86, 0.06], [0.95, -0.24], [0.84, -0.52], [0.64, -0.74], [0.4, -0.86], [0.0, -0.9], [-0.4, -0.96]],
  inserzioni: [[0.6, -0.38, 0.22], [0.72, -0.66, 0.14]], // fovea e base dello stiloide: [x, z, raggio]
  stiloide: [0.75, -0.8, 0.22], // la punta resta libera: lì il disco non scende oltre la base
  centro: [0.12, -0.12],
};
function tfcc() {
  griglia([-0.8, -1.0, -1.15], [1.3, 0.75, 0.75], 0.026, 0.15);
  const FU = campo(['ulna', 'cartuln']).F, FR = campo(['radio', 'cartrad']).F, FC = campo(['semilunare', 'piramidale', 'cartcarpo']).F;
  const su = (F, p) => sample(F, p[0], p[1], p[2]);
  const [sx, sz, sr] = TF.stiloide;
  const P = (x, z) => 0.1 - 0.17 * sstep(0.15, 0.95, x) + 0.07 * Math.exp(-((x - TF.centro[0]) ** 2 + (z - TF.centro[1]) ** 2) / 0.12)
    + 0.3 * Math.exp(-((x - sx) ** 2 + (z - sz) ** 2) / (sr * sr));
  const g = p => {
    const [x, y, z] = p, fu = su(FU, p), fr = su(FR, p), fc = su(FC, p);
    const ins = TF.inserzioni.reduce((m, [ix, iz, r]) => Math.max(m, Math.exp(-((x - ix) ** 2 + (z - iz) ** 2) / (r * r))), 0);
    const dp = poligono(TF.bordo, x, z), b = P(x, z);
    // margini dorsale e volare: anello più spesso (radioulnari) che scende lungo i versanti della testa ulnare
    const rim = sstep(-0.32, -0.08, dp) * sstep(0.25, 0.75, Math.abs(z + 0.2) / 0.8), giu = 0.22 * rim;
    let d = smax(dp, y - b - 0.46, 0.1);
    d = smax(d, mix(0.012, -0.035, ins) - fu, 0.03);
    d = smax(d, 0.014 - fc, 0.03);
    d = smax(d, b - giu - y, 0.06);
    d = smax(d, -0.03 - fr, 0.02);
    // lontano dall'ulna (oltre i margini) il tessuto si assottiglia: niente pareti verticali
    d = smax(d, fu - (0.06 + 0.12 * (1 - sstep(-0.1, 0.05, dp))), 0.06);
    return d;
  };
  const V = valuta(g);
  const fd = p => { // fibre: lungo i margini (verso la fovea) e trasversali nel disco (dal radio alla fovea)
    const f = TF.inserzioni[0], r = nrm([f[0] - p[0], 0, f[1] - p[2]]), dp = poligono(TF.bordo, p[0], p[2]);
    return nrm(add(r, mul([0, 0, Math.sign(-p[2] - 0.2)], 0.25 * sstep(-0.3, -0.05, dp))));
  };
  return nets(V, fd);
}

/* Scafo-lunato e luno-piramidale: tessuto nella periferia della rima tra le due ossa (entro `ag` da entrambe),
   profondo `prof(φ)` dalla superficie esterna; φ = angolo attorno all'asse della rima (0 = prossimale, 90° = dorsale,
   −90° = volare, ±180° = distale, cioè verso la mediocarpica, dove il legamento manca). Fibre trasversali. */
const INTEROSSEI = [
  { id: 'lsl', a: 'scafoide', b: 'semilunare', ag: 0.085, prof: { dors: 0.3, pross: 0.16, vol: 0.2 }, spess: { dors: 0.03, pross: 0, vol: 0.012 } },
  { id: 'llt', a: 'semilunare', b: 'piramidale', ag: 0.085, prof: { dors: 0.2, pross: 0.15, vol: 0.28 }, spess: { dors: 0.012, pross: 0, vol: 0.03 } },
];
function interosseo(L) {
  const A = G.REAL(L.a), B = G.REAL(L.b), bb = q => [[0, 1, 2].map(k => { let m = 1e9; for (let i = k; i < q.pos.length; i += 3) m = Math.min(m, q.pos[i]); return m; }), [0, 1, 2].map(k => { let m = -1e9; for (let i = k; i < q.pos.length; i += 3) m = Math.max(m, q.pos[i]); return m; })];
  const [la, ha] = bb(A), [lb, hb] = bb(B), lo = [0, 1, 2].map(k => Math.max(la[k], lb[k]) - 0.5), hi = [0, 1, 2].map(k => Math.min(ha[k], hb[k]) + 0.5);
  griglia(lo, hi, STEP, 0.1);
  const FA = campo([L.a]).F, FB = campo([L.b]).F, { Do } = campo([L.a, L.b]), FCl = sfoca(chiuso(Do, 0.14));
  // rima: voxel vicini a entrambe le ossa → centro e asse (da a verso b)
  let c = [0, 0, 0], n = 0, ax = [0, 0, 0];
  for (let id = 0; id < G.N; id++) if (FA[id] > 0 && FB[id] > 0 && FA[id] < 0.1 && FB[id] < 0.1) { const p = voxel(id); c = add(c, p); n++; }
  c = mul(c, 1 / n);
  for (let id = 0; id < G.N; id++) if (FA[id] > 0 && FB[id] > 0 && FA[id] < 0.1 && FB[id] < 0.1) { const p = voxel(id); ax = add(ax, grad(FB, p).map((v, k) => -v)); ax = add(ax, grad(FA, p)); }
  ax = nrm(ax);
  const eP = nrm(sub([0, 1, 0], mul(ax, ax[1]))), eD = nrm(cross(ax, eP)); // prossimale e (segno da verificare) dorsale
  const sD = eD[2] < 0 ? 1 : -1; // dorsale = z negativa
  const su = (F, p) => sample(F, p[0], p[1], p[2]);
  const g = p => {
    const d = sub(p, c), py = dot(d, eP), pd = dot(d, eD) * sD, phi = Math.atan2(pd, py); // 0 prossimale, +π/2 dorsale
    const wD = Math.max(0, Math.sin(phi)) ** 2, wV = Math.max(0, -Math.sin(phi)) ** 2, wP = Math.max(0, Math.cos(phi)) ** 2;
    const prof = (wD * L.prof.dors + wV * L.prof.vol + wP * L.prof.pross) / (wD + wV + wP + 1e-6), sp = (wD * L.spess.dors + wV * L.spess.vol) / (wD + wV + wP + 1e-6);
    const aperto = sstep(0.62, 0.92, Math.abs(phi) / Math.PI); // lato distale (mediocarpico) aperto
    const fa = su(FA, p), fb = su(FB, p), fcl = su(FCl, p);
    let e = Math.max(fa, fb) - (L.ag + sp);
    e = smax(e, -fa - 0.015, 0.02); e = smax(e, -fb - 0.015, 0.02);
    e = smax(e, -(fcl + prof * (1 - aperto) - 0.02 * aperto), 0.04); e = smax(e, fcl - 0.015 - sp, 0.03);
    return e;
  };
  const V = valuta(g);
  return nets(V, () => ax);
}

/* ============ Tabella dei legamenti estrinseci e collaterali ============ */
const LEG = [
  // volari radio-carpali
  { id: 'rsc', p: [[-2.88, -0.22, 0.5], [-2.7, -0.6, 0.55], [-2.5, -0.98, 0.58], [-2.22, -1.36, 0.5], [-1.9, -1.68, 0.42], [-1.55, -1.95, 0.42]], w: [0.32, 0.26, 0.30], t: 0.08, r: 0.24, fas: 6 },
  { id: 'lrl', p: [[-2.1, 0.22, 0.78], [-1.72, 0.0, 0.76], [-1.32, -0.22, 0.72], [-0.96, -0.42, 0.68], [-0.66, -0.62, 0.64]], w: [0.36, 0.30, 0.30], t: 0.08, r: 0.14, fas: 6 },
  { id: 'srl', p: [[-1.08, 0.22, 0.88], [-0.92, 0.04, 0.80], [-0.72, -0.14, 0.66], [-0.5, -0.38, 0.62]], w: [0.32, 0.30, 0.30], t: 0.07, r: 0.10, fas: 5 },
  // volari ulno-carpali: originano dal legamento radioulnare volare del TFCC
  { id: 'ul', p: [[0.1, 0.3, 0.55], [0.0, 0.05, 0.56], [-0.12, -0.22, 0.6], [-0.25, -0.5, 0.62]], w: [0.24, 0.20, 0.24], t: 0.07, r: 0.2, fas: 5, tfcc: 1 },
  { id: 'ut', p: [[0.42, 0.3, 0.5], [0.38, 0.05, 0.52], [0.35, -0.25, 0.54], [0.32, -0.55, 0.58], [0.3, -0.82, 0.6]], w: [0.24, 0.20, 0.26], t: 0.07, r: 0.2, fas: 5, tfcc: 1 },
  { id: 'uc', p: [[0.3, 0.36, 0.5], [0.12, 0.0, 0.62], [-0.2, -0.55, 0.72], [-0.62, -1.15, 0.66], [-1.05, -1.68, 0.5], [-1.4, -1.98, 0.44]], w: [0.22, 0.20, 0.26], t: 0.07, r: 0.18, fas: 5, tfcc: 1 },
  // dorsali
  { id: 'drc', p: [[-1.6, 0.4, -1.32], [-1.38, 0.02, -1.18], [-1.1, -0.42, -1.05], [-0.72, -0.74, -1.2], [-0.32, -1.08, -1.12], [0.1, -1.28, -0.98], [0.38, -1.32, -0.9]], w: [0.36, 0.26, 0.30], t: 0.07, r: 0.14, fas: 6 },
  { id: 'dic', p: [[0.36, -1.32, -0.9], [-0.15, -1.22, -1.02], [-0.6, -1.0, -1.18], [-1.05, -0.92, -1.12], [-1.5, -1.07, -1.0], [-1.95, -1.12, -0.8], [-2.3, -1.45, -0.7], [-2.36, -1.9, -0.75], [-2.25, -2.3, -1.15]], w: [0.30, 0.24, 0.28], t: 0.07, r: 0.14, fas: 6 },
  // collaterali
  { id: 'rcl', p: [[-3.6, -0.42, -0.12], [-3.46, -0.66, 0.0], [-3.3, -0.86, 0.14], [-3.15, -0.98, 0.36], [-2.92, -1.04, 0.52]], w: [0.20, 0.16, 0.24], t: 0.07, r: 0.12, fas: 5 },
  { id: 'ucl', p: [[0.95, -0.05, -0.62], [1.02, -0.3, -0.45], [1.08, -0.6, -0.3], [1.12, -0.92, -0.15], [1.12, -1.22, 0.02], [1.08, -1.48, 0.2]], w: [0.3, 0.28, 0.3], t: 0.07, r: 0.32, fas: 5, tfcc: 1 },
  // pisiforme
  { id: 'pisham', p: [[0.42, -1.98, 1.08], [0.2, -2.05, 1.0], [0.0, -2.1, 0.95], [-0.18, -2.12, 0.92]], w: [0.22, 0.18, 0.22], t: 0.07, r: 0.22, fas: 5 },
  { id: 'pismc', p: [[0.62, -2.0, 1.05], [0.58, -2.25, 0.8], [0.53, -2.5, 0.62], [0.52, -2.85, 0.5]], w: [0.22, 0.18, 0.22], t: 0.07, r: 0.22, fas: 5 },
];

/* ============ Esecuzione ============ */
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--'));
const vuole = id => !SOLO.length || SOLO.includes(id);
if (vuole('tfcc')) { const m = tfcc(); setMesh('tfcc', m); log('tfcc', m.pos.length / 3, 'vertici'); }
for (const L of INTEROSSEI) if (vuole(L.id)) { const m = interosseo(L); setMesh(L.id, m); log(L.id, m.pos.length / 3, 'vertici'); }
for (const Lg of LEG) {
  if (!vuole(Lg.id)) continue;
  const [lo, hi] = bbox(Lg.p);
  const ctx = contesto(lo, hi, Lg.r, Lg.tfcc ? ['tfcc'] : []);
  const mesh = nastro(Lg, ctx);
  if (!man.meshes.some(m => m.n === Lg.id)) man.meshes.push({ n: Lg.id });
  setMesh(Lg.id, mesh); log(Lg.id, mesh.pos.length / 3, 'vertici');
}
saveFile(repack());
