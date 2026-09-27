/* BOZZA, in attesa di conferma delle regole anatomiche: non usare ancora sul modello.

   Corregge le compenetrazioni tra legamenti e muscoli del ginocchio sollevando i muscoli sopra i legamenti.

   Uso (dalla cartella del progetto):
     node strumenti/stratifica-ginocchio.mjs [--prova]
     node strumenti/capsula-ginocchio.mjs        (poi: la capsula dipende dalle strutture vicine)

   Con --prova stampa solo le compenetrazioni prima e dopo, senza modificare il file.

   Come funziona: per ogni regola { sposta, sopra } voxelizza le strutture "sopra" (profonde) e, per ogni
   vertice delle strutture da spostare, segue la normale all'osso: se nella colonna c'è la struttura
   profonda e il vertice non la supera di almeno MARGINE, calcola di quanto va sollevato. Lo spostamento
   viene esteso per intero fino a PIENO e poi sfumato fino a RAGGIO (distanze tangenziali) a tutta la colonna
   di muscolo sopra quel punto, così il muscolo trasla senza schiacciarsi e si raccorda gradualmente con il resto. Si ripete finché non
   restano compenetrazioni. Le posizioni sono riscritte sul posto nella mesh (stesso numero di vertici).

   Regole (anatomia di riferimento: Warren LF, Marshall JL, JBJS Am 1979; LaPrade RF et al., JBJS Am 2007
   e AJSM 2003): tendini della zampa d'oca e semimembranoso superficiali al LCM; bicipite femorale
   superficiale al LCL fino all'inserzione sulla testa del perone; nella zampa d'oca il sartorio è il più
   superficiale, poi gracile e semitendinoso. */
import { buf0, REAL, setPos, N, or, solid, edt, sample, sstep, log, writePos, saveFile } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const MARGINE = 0.08, PIENO = 0.35, RAGGIO = 0.9, PASSATE = 6;
// su:  'sposta' viene sollevato sopra 'rif' (tutta la colonna di tessuto trasla, senza schiacciarsi)
// giu: 'sposta' viene compresso sotto 'rif' verso l'osso (si assottiglia solo la parte superficiale)
const REGOLE = [
  { tipo: 'giu', sposta: ['semim'], rif: ['lcm'] },            // braccio anteriore del semimembranoso profondo al LCM
  { tipo: 'giu', sposta: ['bicbrev'], rif: ['lcl'] },          // braccio anteriore del capo breve profondo al LCL
  { tipo: 'su', sposta: ['lcm'], rif: ['semim'] },             // residui dove il muscolo è già sull'osso
  { tipo: 'su', sposta: ['lcl'], rif: ['bicbrev'] },
  { tipo: 'su', sposta: ['grac', 'semit', 'bans'], rif: ['lcm'] }, // zampa d'oca e borsa anserina superficiali al LCM
  { tipo: 'su', sposta: ['sart'], rif: ['grac', 'semit', 'lcm'] },
  { tipo: 'su', sposta: ['biclong'], rif: ['lcl'] },           // capo lungo del bicipite superficiale al LCL
];
const CONTROLLO = [['lcm', 'grac'], ['lcm', 'semit'], ['lcm', 'semim'], ['lcm', 'sart'], ['lcm', 'bans'], ['lcl', 'biclong'], ['lcl', 'bicbrev'],
  ['sart', 'grac'], ['sart', 'semit'], ['grac', 'semit'], ['semim', 'gmed'], ['biclong', 'glat'], ['bicbrev', 'glat'], ['biclong', 'itb']];

// campo con segno dell'osso (positivo fuori) e sua normale
const BONES = new Uint8Array(N); for (const n of ['femore', 'tibia', 'perone', 'rotula']) or(BONES, solid(n));
const Do = edt(BONES), Di = edt(BONES, true), GB = new Float32Array(N);
for (let i = 0; i < N; i++) GB[i] = Do[i] - Di[i] + (BONES[i] ? 0.05 : -0.05);
const normal = (x, y, z, e = 0.05) => { const n = [sample(GB, x + e, y, z) - sample(GB, x - e, y, z), sample(GB, x, y + e, z) - sample(GB, x, y - e, z), sample(GB, x, y, z + e) - sample(GB, x, y, z - e)]; const l = Math.hypot(...n) || 1; return n.map(v => v / l); };

// percentuale di vertici di a penetrati in b per più di 0,5 mm, e viceversa
function compenetrazione(a, b) {
  const Db = edt(solid(b), true), Da = edt(solid(a), true), A = REAL(a), B = REAL(b); let ca = 0, cb = 0;
  for (let i = 0; i < A.nv; i++) if (sample(Db, A.pos[3 * i], A.pos[3 * i + 1], A.pos[3 * i + 2]) > 0.1) ca++;
  for (let i = 0; i < B.nv; i++) if (sample(Da, B.pos[3 * i], B.pos[3 * i + 1], B.pos[3 * i + 2]) > 0.1) cb++;
  return `${a}/${b} ${(100 * ca / A.nv).toFixed(1)}%·${(100 * cb / B.nv).toFixed(1)}%`;
}
const rapporto = t => console.log(t, CONTROLLO.map(([a, b]) => compenetrazione(a, b)).join('  '));
rapporto('Prima:');

const spostati = new Set(), orig = new Map();
for (const R of REGOLE) {
  for (let pass = 0; pass < PASSATE; pass++) {
    const SO = new Uint8Array(N); for (const n of R.rif) or(SO, solid(n)); const DS = edt(SO);
    const occ = (x, y, z) => sample(DS, x, y, z) < 0.01;
    let tot = 0, maxd = 0;
    for (const name of R.sposta) {
      const { pos, nv } = REAL(name), src = [];
      if (!orig.has(name)) orig.set(name, new Float32Array(pos));
      for (let i = 0; i < nv; i++) {
        const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], g = sample(GB, x, y, z); if (g < -1 || g > 2) continue;
        const n = normal(x, y, z), f = [x - n[0] * g, y - n[1] * g, z - n[2] * g];
        let bot = null, top = null;
        for (let d = -0.3; d < 1.6; d += 0.02) if (occ(f[0] + n[0] * d, f[1] + n[1] * d, f[2] + n[2] * d)) { if (bot === null) bot = d; top = d; } else if (R.tipo === 'giu' && bot !== null) break;
        if (bot === null) continue;
        if (R.tipo === 'su') { const need = Math.max(top, 0) + MARGINE - g; if (need > 0.005) src.push([x, y, z, need, n]); }
        else if (g > 0.03 && g >= bot - MARGINE && g <= top + 0.3) { const need = g - Math.max(0.03, bot - MARGINE); if (need > 0.005) src.push([x, y, z, need, n]); }
      }
      if (!src.length) continue;
      const out = new Float32Array(pos);
      for (let i = 0; i < nv; i++) {
        const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; let best = 0, bn = null;
        for (const [sx, sy, sz, need, n] of src) {
          const dx = x - sx, dy = y - sy, dz = z - sz; let v;
          if (R.tipo === 'su') { // distanza tangenziale: si solleva tutta la colonna sopra la sorgente
            const h = dx * n[0] + dy * n[1] + dz * n[2]; if (h < -0.15 || h > 3) continue;
            const d = Math.hypot(dx - n[0] * h, dy - n[1] * h, dz - n[2] * h); if (d >= RAGGIO) continue; v = need * (1 - sstep(PIENO, RAGGIO, d));
          } else { const d = Math.hypot(dx, dy, dz); if (d >= 0.45) continue; v = need * (1 - sstep(0.15, 0.45, d)); }
          if (v > best) { best = v; bn = n; }
        }
        if (!bn) continue;
        if (R.tipo === 'giu') { const g = sample(GB, x, y, z); best = Math.min(best, Math.max(0, g - 0.03)); if (!best) continue; best = -best; }
        out[3 * i] += bn[0] * best; out[3 * i + 1] += bn[1] * best; out[3 * i + 2] += bn[2] * best; maxd = Math.max(maxd, Math.abs(best));
      }
      setPos(name, out); spostati.add(name); tot += src.length;
    }
    log(`${R.tipo === 'su' ? 'sopra' : 'sotto'} ${R.rif.join('+')}: ${R.sposta.join('+')}, passata ${pass + 1}: ${tot} vertici, spostamento massimo ${(maxd * 10).toFixed(1)} mm`);
    if (!tot) break;
  }
}
for (const [name, o] of orig) { const p = REAL(name).pos; let m = 0, c = 0; for (let i = 0; i < p.length; i += 3) { const d = Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2]); m = Math.max(m, d); if (d > 0.01) c++; }
  console.log(`  ${name}: ${c} vertici spostati, massimo ${(m * 10).toFixed(1)} mm`); }
rapporto('Dopo:');
if (PROVA) process.exit(0);
const buf = Buffer.from(buf0); for (const name of spostati) writePos(buf, name, REAL(name).pos);
saveFile(buf);
