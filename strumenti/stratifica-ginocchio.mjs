/* Rapporti anatomici tra legamenti collaterali, zampa d'oca, semimembranoso e bicipite femorale del ginocchio.

   Uso (dalla cartella del progetto, partendo dalle mesh originali):
     node strumenti/stratifica-ginocchio.mjs [--prova]
     node strumenti/capsula-ginocchio.mjs        (dopo: la capsula dipende dalle strutture vicine)

   Con --prova stampa solo le verifiche, senza modificare il file.

   Anatomia di riferimento:
   - LCM superficiale: banda piatta dall'epicondilo mediale alla tibia (~6 cm sotto l'interlinea), coperta
     distalmente da sartorio, gracile e semitendinoso con la borsa anserina interposta
     (Warren LF, Marshall JL, JBJS Am 1979;61:56-62; LaPrade RF et al., JBJS Am 2007;89:2000-10).
     La mesh del LCM non viene modificata: si spostano le strutture che la attraversano.
   - Semimembranoso: inserzione diretta sulla tibia postero-mediale subito sotto l'interlinea; il braccio
     anteriore passa profondo al LCM e si inserisce ~1 cm sotto l'interlinea (LaPrade 2007). Non prosegue
     lungo la tibia mediale: la coda della mesh BodyParts3D oltre l'inserzione viene rimossa e il tendine
     affonda nella corticale all'inserzione (breve tratto tendineo dopo la giunzione mio-tendinea).
   - Semitendinoso: postero-mediale e superficiale al semimembranoso, poi curva in avanti sopra il LCM verso
     la zampa d'oca, sotto il gracile e il sartorio.
   - Bicipite femorale: all'interlinea decorre posteriormente al LCL; sulla testa del perone il braccio
     anteriore del capo lungo passa lateralmente (superficiale) al LCL, che quindi vi si inserisce al di sotto
     (Terry GC, LaPrade RF, AJSM 1996;24:2-8; LaPrade RF et al., AJSM 2003;31:854-60).

   Metodo: nessuna spinta locale. Ogni struttura viene spostata per sezioni trasversali (fasce di 0,5 mm lungo
   l'asse verticale): per ogni sezione si calcola lo spostamento minimo che la libera dalla struttura di
   riferimento in una direzione prestabilita; il profilo lungo la struttura è un inviluppo gaussiano ampio
   (ogni sezione raggiunge lo spostamento necessario, le vicine lo seguono con una campana), così il decorso
   cambia con curve dolci e la sezione non si deforma. Si lavora solo nella regione del ginocchio (ZONA).
   Con --dettaglio stampa anche i livelli degli spostamenti e delle compenetrazioni residue. */
import { REAL, setPos, setMesh, attrs, N, or, solid, edt, sample, sstep, clamp, log, repack, saveFile } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const BIN = 0.05, MARGINE = 0.06, TMAX = 1.2, PASSATE = 5;
const ZONA = y => y > -9.5 && y < 5; // solo la regione del ginocchio: coscia e gamba restano come sono

const REGOLE = [
  // semimembranoso: coda oltre l'inserzione tagliata (affonda nella tibia tra y -2,1 e -3,0);
  // all'altezza dei condili il tendine decorre dietro al LCM, sotto l'interlinea il braccio anteriore gli passa sotto
  { tipo: 'taglia', nome: 'semim', ySink: -2.1, yCut: -3.0, tendine: [0.4, -0.9],
    affonda: (x, y, z) => sstep(-0.75, -0.35, z) * sstep(-0.5, -1.1, y) }, // punta del braccio anteriore sotto il LCM
  { tipo: 'sez', sposta: ['semim'], rif: ['lcm'], modo: 'dietro', dove: y => y > -1.4, sigma: 0.9, max: 0.9 },
  { tipo: 'sez', sposta: ['semim'], rif: ['lcm'], modo: 'dentro', dove: y => y <= -1.4, sigma: 0.4, max: 0.4 },
  // semitendinoso postero-mediale e superficiale al semimembranoso
  { tipo: 'sez', sposta: ['semit'], rif: ['semim'], modo: 'postero-mediale', dir: [0.6, 0, -0.8], dove: y => y < 4, sigma: 1.0, max: 0.9 },
  { tipo: 'sez', sposta: ['semit'], rif: ['gmed'], modo: 'mediale', dir: [1, 0, 0], dove: y => y < -4, sigma: 0.8, max: 0.3 },
  // borsa anserina e zampa d'oca superficiali al LCM, sartorio il più superficiale
  // (il LCM originale, banda liscia fino all'inserzione tibiale, non si tocca; la borsa anserina, sottile e
  //  comprimibile, gli sta sopra e i tendini vi scorrono sopra senza sollevarsi dall'inserzione)
  { tipo: 'sez', sposta: ['bans'], rif: ['lcm'], modo: 'fuori', sigma: 0.5, max: 0.25 },
  { tipo: 'sez', sposta: ['grac', 'semit'], rif: ['lcm'], modo: 'fuori', sigma: 0.8, max: 0.7 },
  { tipo: 'sez', sposta: ['grac'], rif: ['semit'], modo: 'fuori', dove: y => y < -4, sigma: 0.8, max: 0.3 }, // gracile sopra il semitendinoso
  { tipo: 'sez', sposta: ['sart'], rif: ['lcm', 'grac', 'semit'], modo: 'fuori', sigma: 0.8, max: 0.6 },
  // bicipite (capo lungo e breve) posteriore al LCL all'interlinea, raccordato con l'inserzione sul perone
  { tipo: 'sez', sposta: ['biclong', 'bicbrev'], rif: ['lcl'], modo: 'dietro', dove: y => y > -2.2, sigma: 0.9, max: 0.8 },
  // sulla testa del perone il braccio anteriore del capo lungo passa lateralmente al LCL: il bicipite si solleva quanto basta
  { tipo: 'sez', sposta: ['biclong', 'bicbrev'], rif: ['lcl'], modo: 'fuori', dove: y => y <= -1.8, sigma: 0.5, max: 0.5 },
];
const CONTROLLO = [['lcm', 'semim'], ['semim', 'gmed'], ['semit', 'gmed'], ['lcm', 'grac'], ['lcm', 'semit'], ['lcm', 'sart'], ['lcm', 'bans'], ['semit', 'semim'], ['grac', 'semit'],
  ['sart', 'grac'], ['lcl', 'biclong'], ['lcl', 'bicbrev'], ['biclong', 'glat'], ['bicbrev', 'glat'], ['biclong', 'plant']];

// campo con segno dell'osso (positivo fuori) e normale
const BONES = new Uint8Array(N); for (const n of ['femore', 'tibia', 'perone', 'rotula']) or(BONES, solid(n));
const Do = edt(BONES), Di = edt(BONES, true), GB = new Float32Array(N);
for (let i = 0; i < N; i++) GB[i] = Do[i] - Di[i] + (BONES[i] ? 0.05 : -0.05);
const normal = (x, y, z, e = 0.05) => { const n = [sample(GB, x + e, y, z) - sample(GB, x - e, y, z), sample(GB, x, y + e, z) - sample(GB, x, y - e, z), sample(GB, x, y, z + e) - sample(GB, x, y, z - e)]; const l = Math.hypot(...n) || 1; return n.map(v => v / l); };

// compenetrazione nella regione del ginocchio: % di vertici di a dentro b (>0,5 mm) e viceversa
function compenetrazione(a, b) {
  const Db = edt(solid(b), true), Da = edt(solid(a), true), A = REAL(a), B = REAL(b); let ca = 0, cb = 0;
  let na = 0, nb = 0; const zona = y => y > -8 && y < 5; // solo la regione del ginocchio
  for (let i = 0; i < A.nv; i++) if (zona(A.pos[3 * i + 1])) { na++; if (sample(Db, A.pos[3 * i], A.pos[3 * i + 1], A.pos[3 * i + 2]) > 0.05) ca++; }
  for (let i = 0; i < B.nv; i++) if (zona(B.pos[3 * i + 1])) { nb++; if (sample(Da, B.pos[3 * i], B.pos[3 * i + 1], B.pos[3 * i + 2]) > 0.05) cb++; }
  return `${a}/${b} ${(100 * ca / Math.max(1, na)).toFixed(1)}%·${(100 * cb / Math.max(1, nb)).toFixed(1)}%`;
}
const rapporto = t => console.log(t, CONTROLLO.map(([a, b]) => compenetrazione(a, b)).join('  '));
rapporto('Prima:');

const orig = new Map(), keep = name => { if (!orig.has(name)) orig.set(name, new Float32Array(REAL(name).pos)); };
const blur = (a, s) => { const r = Math.ceil(3 * s), out = new Float64Array(a.length); for (let k = 0; k < a.length; k++) { let v = 0, w = 0; for (let j = -r; j <= r; j++) { const q = k + j; if (q < 0 || q >= a.length) continue; const ww = Math.exp(-(j * j) / (2 * s * s)); v += a[q] * ww; w += ww; } out[k] = v / w; } return out; };
// inviluppo gaussiano: ogni sezione raggiunge lo spostamento richiesto, i vicini lo seguono con una campana di ampiezza s
const inviluppo = (a, s) => Array.from(a, (_, k) => { let m = 0; const r = Math.ceil(3 * s); for (let j = -r; j <= r; j++) { const q = a[k + j]; if (q > 0) m = Math.max(m, q * Math.exp(-(j * j) / (2 * s * s))); } return m; });

function taglia({ nome, ySink, yCut, affonda, tendine }) {
  keep(nome);
  const { pos, idx, nv } = REAL(nome), { tag, fdir } = attrs(nome), P = new Float32Array(pos);
  for (let i = 0; i < nv; i++) { // accompagna il tendine dentro la corticale verso l'inserzione
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    const s = Math.max(y > ySink ? 0 : sstep(ySink, yCut, y), affonda ? affonda(x, y, z) : 0); if (s <= 0) continue;
    const g = sample(GB, x, y, z); if (g < -0.08) continue;
    const n = normal(x, y, z), d = s * (g + 0.08); P[3 * i] -= n[0] * d; P[3 * i + 1] -= n[1] * d; P[3 * i + 2] -= n[2] * d;
  }
  const TG = tag && Uint8Array.from(tag); // giunzione mio-tendinea: breve tendine prima dell'inserzione
  if (TG && tendine) for (let i = 0; i < nv; i++) if (TG[i] < 250) TG[i] = Math.max(TG[i], Math.round(200 * sstep(tendine[0], tendine[1], P[3 * i + 1]))); // 250/251: sezioni di taglio
  const T = []; for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if ((P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) / 3 >= yCut) T.push(a, b, c); }
  const map = new Int32Array(nv).fill(-1), np = [], nt = [], nf = [], ni = [];
  for (const o of T) { if (map[o] < 0) { map[o] = np.length / 3; np.push(P[3 * o], P[3 * o + 1], P[3 * o + 2]); if (tag) nt.push(TG[o]); if (fdir) nf.push(fdir[3 * o], fdir[3 * o + 1], fdir[3 * o + 2]); } ni.push(map[o]); }
  // chiusura dei bordi aperti (dentro l'osso) con un ventaglio
  const cnt = new Map(), dir = new Map(); for (let t = 0; t < ni.length; t += 3) for (let r = 0; r < 3; r++) { const a = ni[t + r], b = ni[t + (r + 1) % 3], k = Math.min(a, b) + '_' + Math.max(a, b); cnt.set(k, (cnt.get(k) || 0) + 1); dir.set(k, [a, b]); }
  const next = new Map(); for (const [k, c] of cnt) if (c === 1) { const [a, b] = dir.get(k); next.set(b, a); }
  const visti = new Set(); let loops = 0;
  for (const s0 of next.keys()) {
    if (visti.has(s0)) continue; const L = []; let v = s0; while (!visti.has(v) && next.has(v)) { visti.add(v); L.push(v); v = next.get(v); }
    if (L.length < 3) continue; loops++;
    const c = np.length / 3, m = [0, 1, 2].map(k => L.reduce((s, q) => s + np[3 * q + k], 0) / L.length); np.push(...m);
    if (tag) nt.push(Math.round(L.reduce((s, q) => s + nt[q], 0) / L.length));
    if (fdir) nf.push(...[0, 1, 2].map(k => Math.round(L.reduce((s, q) => s + nf[3 * q + k], 0) / L.length)));
    for (let j = 0; j < L.length; j++) ni.push(L[j], L[(j + 1) % L.length], c);
  }
  setMesh(nome, { pos: Float32Array.from(np), idx: Uint32Array.from(ni), tag: tag ? Uint8Array.from(nt) : null, fdir: fdir ? Int8Array.from(nf) : null });
  log(`taglio ${nome}: ${nv} → ${np.length / 3} vertici, ${loops} bordi chiusi`);
}

const fasce = new Map(); // intervallo verticale fisso per struttura
// direzione di uscita più breve: gradiente della distanza con segno (A: distanza da fuori, B: da dentro)
const gradS = (A, B, x, y, z, e = 0.05) => { const f = (a, b, c) => sample(A, a, b, c) - sample(B, a, b, c); const g = [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]; const l = Math.hypot(...g); return l > 1e-6 ? g.map(v => v / l) : null; };
function sezioni(R) {
  const tot = new Map();
  for (let pass = 0; pass < PASSATE; pass++) {
    const SO = new Uint8Array(N); for (const n of R.rif) or(SO, solid(n)); const DO = edt(SO), DOi = R.esci ? edt(SO, true) : null;
    let any = false, maxA = 0;
    for (const name of R.sposta) {
      keep(name);
      const { pos, nv } = REAL(name);
      if (!fasce.has(name)) { let a = Infinity, b = -Infinity; for (let i = 0; i < nv; i++) { a = Math.min(a, pos[3 * i + 1]); b = Math.max(b, pos[3 * i + 1]); } fasce.set(name, [a - 1, Math.ceil((b - a + 2) / BIN) + 1]); }
      const [y0, nb] = fasce.get(name), bin = y => clamp((y - y0) / BIN, 0, nb - 1);
      const need = new Float64Array(nb), D = [new Float64Array(nb), new Float64Array(nb), new Float64Array(nb)];
      for (let i = 0; i < nv; i++) {
        const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; if (!ZONA(y) || (R.dove && !R.dove(y))) continue;
        if (sample(DO, x, y, z) >= MARGINE) continue;
        // direzioni possibili: indietro; oppure lungo la normale all'osso (fuori/dentro) o, se più breve, lungo l'asse medio-laterale
        const n = normal(x, y, z), cand = R.dir ? [R.dir] : (R.modo === 'dietro' ? [[0, 0, -1]] : R.modo === 'fuori' ? [n, [Math.sign(x), 0, 0]] : [n.map(v => -v)]).concat(R.dirs || []);
        if (R.esci) { const g = gradS(DO, DOi, x, y, z); if (g) cand.push(g); } // uscita più breve dal riferimento
        let t = Infinity, d = null;
        for (const c of cand) { let u = 0.02; for (; u <= TMAX; u += 0.02) if (sample(DO, x + c[0] * u, y + c[1] * u, z + c[2] * u) >= MARGINE) break; if (u <= TMAX && u < t) { t = u; d = c; } }
        if (!d) continue;
        const b = Math.round(bin(y)); need[b] = Math.max(need[b], t); for (let k = 0; k < 3; k++) D[k][b] += d[k] * t;
      }
      // anche il caso inverso: punti del riferimento racchiusi dentro la struttura (legamento sottile dentro un tendine spesso)
      const SMs = solid(name), DMi = edt(SMs, true), DMo = R.esci ? edt(SMs) : null;
      for (const rn of R.rif) { const Q = REAL(rn);
        for (let i = 0; i < Q.nv; i++) {
          const x = Q.pos[3 * i], y = Q.pos[3 * i + 1], z = Q.pos[3 * i + 2]; if (!ZONA(y) || (R.dove && !R.dove(y))) continue;
          if (sample(DMi, x, y, z) < 0.03) continue;
          const n = normal(x, y, z), cand = R.dir ? [R.dir] : (R.modo === 'dietro' ? [[0, 0, -1]] : R.modo === 'fuori' ? [n, [Math.sign(x), 0, 0]] : [n.map(v => -v)]).concat(R.dirs || []);
          if (R.esci) { const g = gradS(DMo, DMi, x, y, z); if (g) cand.push(g.map(v => -v)); }
          let t = Infinity, d = null;
          for (const c of cand) { let u = 0.02; for (; u <= TMAX; u += 0.02) if (sample(DMi, x - c[0] * u, y - c[1] * u, z - c[2] * u) <= 0) break; if (u <= TMAX && u + MARGINE < t) { t = u + MARGINE; d = c; } }
          if (!d) continue;
          const b = Math.round(bin(y)); need[b] = Math.max(need[b], t); for (let k = 0; k < 3; k++) D[k][b] += d[k] * t;
        } }
      if (Math.max(...need) < 0.01) continue; any = true;
      const s = R.sigma / BIN, A = blur(inviluppo(need, s), s / 4), Dx = blur(D[0], 3 * s), Dy = blur(D[1], 3 * s), Dz = blur(D[2], 3 * s); // direzione molto regolare
      const T0 = tot.get(name) || new Float64Array(nb);
      for (let k = 0; k < nb; k++) { A[k] = Math.min(A[k], Math.max(0, R.max - T0[k])); T0[k] += A[k]; maxA = Math.max(maxA, T0[k]); }
      tot.set(name, T0);
      const out = new Float32Array(pos);
      for (let i = 0; i < nv; i++) {
        const f = bin(pos[3 * i + 1]), k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1), u = f - k0, lerp = a => a[k0] * (1 - u) + a[k1] * u;
        const a = lerp(A); if (a < 1e-4) continue;
        const v = [lerp(Dx), lerp(Dy), lerp(Dz)], l = Math.hypot(...v); if (l < 1e-9) continue;
        for (let c = 0; c < 3; c++) out[3 * i + c] += v[c] / l * a;
      }
      setPos(name, out);
    }
    log(`${R.sposta.join('+')} ${R.modo} rispetto a ${R.rif.join('+')}, passata ${pass + 1}: spostamento massimo ${(maxA * 10).toFixed(1)} mm`);
    if (!any) break;
  }
}

for (const R of REGOLE) R.tipo === 'taglia' ? taglia(R) : sezioni(R);
for (const [name, o] of orig) { const p = REAL(name).pos; if (p.length !== o.length) { console.log(`  ${name}: topologia modificata`); continue; }
  let m = 0; for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2]));
  const pr = {}; for (let i = 0; i < p.length; i += 3) { const k = Math.round(o[i + 1]); pr[k] = Math.max(pr[k] || 0, Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2])); }
  console.log(`  ${name}: spostamento massimo ${(m * 10).toFixed(1)} mm`, process.argv.includes('--dettaglio') ? Object.entries(pr).filter(([, v]) => v > 0.05).sort((a, b) => b[0] - a[0]).map(([k, v]) => `y${k}:${(v * 10).toFixed(0)}`).join(' ') : ''); }
rapporto('Dopo:');
if (process.argv.includes('--dettaglio')) for (const [a0, b0] of CONTROLLO) for (const [a, b] of [[a0, b0], [b0, a0]]) { // livelli dei residui
  const Db = edt(solid(b), true), A = REAL(a), h = {};
  for (let i = 0; i < A.nv; i++) { const y = A.pos[3 * i + 1]; if (y > -8 && y < 5 && sample(Db, A.pos[3 * i], y, A.pos[3 * i + 2]) > 0.05) h[Math.round(y)] = (h[Math.round(y)] || 0) + 1; }
  if (Object.keys(h).length) console.log(`  ${a} in ${b}:`, Object.entries(h).sort((p, q) => q[0] - p[0]).map(([k, v]) => `y${k}:${v}`).join(' '));
}
if (PROVA) process.exit(0);
saveFile(repack());
