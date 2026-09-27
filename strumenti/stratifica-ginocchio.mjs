/* Elimina le compenetrazioni tra legamenti collaterali e muscoli del ginocchio, rispettando i rapporti
   anatomici descritti in letteratura.

   Uso (dalla cartella del progetto):
     node strumenti/stratifica-ginocchio.mjs [--prova]
     node strumenti/capsula-ginocchio.mjs        (dopo: la capsula dipende dalle strutture vicine)

   Con --prova stampa solo le compenetrazioni prima e dopo, senza modificare il file.

   Rapporti anatomici applicati:
   - Zampa d'oca (sartorio, gracile, semitendinoso) e borsa anserina superficiali al LCM superficiale;
     il sartorio è il più superficiale (Warren LF, Marshall JL, JBJS Am 1979;61:56-62).
   - Semimembranoso: il tendine principale decorre e si inserisce postero-medialmente, dietro al LCM;
     il braccio anteriore (tibiale) passa profondo al LCM (LaPrade RF et al., JBJS Am 2007;89:2000-10).
   - Bicipite femorale: sopra la testa del perone decorre posteriormente al LCL; all'inserzione il capo
     lungo resta laterale (superficiale) al LCL, mentre il braccio anteriore del capo breve passa medialmente
     (in profondità) al LCL (LaPrade RF et al., AJSM 2003;31:854-60; Terry GC, LaPrade RF, AJSM 1996).

   I muscoli (BodyParts3D) si toccano il meno possibile: dove un tendine deve stare sopra un legamento,
   è il legamento (struttura modellata) a passare sotto, appiattendosi verso l'osso.

   Tipi di correzione (ogni regola voxelizza le strutture di riferimento e ripete finché serve):
   - su:  la struttura viene sollevata sopra il riferimento lungo la normale all'osso; si sposta tutta la
          colonna di tessuto (per intero fino a PIENO, poi sfumando fino a RAGGIO), senza schiacciarla;
   - dir: come su, ma in una direzione fissa (es. indietro), per portarla dietro al riferimento;
   - giu: la parte superficiale della struttura viene compressa sotto il riferimento, verso l'osso (al più
          0,5 mm dentro la corticale, dove la mesh muscolare poggia già sull'osso).
   Le posizioni sono riscritte sul posto nella mesh (stesso numero di vertici). */
import { buf0, REAL, setPos, N, or, solid, edt, sample, sstep, clamp, log, writePos, saveFile } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const MARGINE = 0.08, PIENO = 0.35, RAGGIO = 0.9, PASSATE = 8, LISCIA = 6;
const vicini = new Map();
const sopraArt = (x, y) => y > -1.2, sottoArt = (x, y) => y <= -1.2;       // femore/interlinea vs tibia
const REGOLE = [
  { tipo: 'dir', d: [0, 0, -1], sposta: ['semim'], rif: ['lcm'], dove: sopraArt },    // tendine principale dietro al LCM
  { tipo: 'giu', sposta: ['lcm'], rif: ['grac', 'semit', 'sart', 'bans'], liscia: 20 },          // LCM profondo alla zampa d'oca
  { tipo: 'giu', sposta: ['semim'], rif: ['lcm'], dove: sottoArt },                   // braccio anteriore profondo al LCM
  { tipo: 'dir', d: [0, 0, -1], sposta: ['biclong', 'bicbrev'], rif: ['lcl'], dove: (x, y) => y > -3.0, max: 0.6 }, // bicipite dietro al LCL fino alla testa del perone
  { tipo: 'su', sposta: ['lcm'], rif: ['semim'], dove: sottoArt, max: 0.3, passate: 1 },   // residui: al più 3 mm
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
  for (let pass = 0; pass < (R.passate ?? PASSATE); pass++) {
    const SO = new Uint8Array(N); for (const n of R.rif) or(SO, solid(n)); const DS = edt(SO);
    const occ = (x, y, z) => sample(DS, x, y, z) < 0.01;
    let tot = 0, maxd = 0;
    for (const name of R.sposta) {
      const { pos, nv } = REAL(name), src = [];
      if (!orig.has(name)) orig.set(name, new Float32Array(pos));
      for (let i = 0; i < nv; i++) {
        const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], g = sample(GB, x, y, z); if (g < -1 || g > 2) continue;
        if (R.dove && !R.dove(x, y, z)) continue;
        if (R.tipo === 'dir') { // se il vertice è dentro (o a ridosso di) il riferimento, va portato oltre, nella direzione d
          const d = R.d; let s0 = null; for (let t = -MARGINE; t <= MARGINE; t += 0.02) if (occ(x + d[0] * t, y + d[1] * t, z + d[2] * t)) { s0 = t; break; }
          if (s0 === null) continue; let t = s0; while (t < 2 && occ(x + d[0] * t, y + d[1] * t, z + d[2] * t)) t += 0.02;
          src.push([x, y, z, Math.min(R.max ?? 9, t + MARGINE), d]); continue;
        }
        const n = normal(x, y, z), f = [x - n[0] * g, y - n[1] * g, z - n[2] * g];
        let bot = null, top = null;
        for (let d = -0.3; d < Math.min(1.6, g + 0.6); d += 0.02) if (occ(f[0] + n[0] * d, f[1] + n[1] * d, f[2] + n[2] * d)) { if (bot === null) bot = d; top = d; } else if (bot !== null) break;
        if (bot === null || bot > g + 0.3) continue; // solo riferimenti a ridosso del vertice
        if (R.tipo === 'su') { const need = Math.min(R.max ?? 9, Math.max(top, 0) + MARGINE - g); if (need > 0.005) src.push([x, y, z, need, n]); }
        else if (g > -0.05 && g >= bot - MARGINE && g <= top + 0.3) { const need = g - Math.max(-0.05, bot - MARGINE); if (need > 0.005) src.push([x, y, z, need, n]); }
      }
      if (!src.length) continue;
      const out = new Float32Array(pos);
      for (let i = 0; i < nv; i++) {
        const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; let best = 0, bn = null;
        for (const [sx, sy, sz, need, n] of src) {
          const dx = x - sx, dy = y - sy, dz = z - sz; let v;
          if (R.tipo !== 'giu') { // distanza tangenziale: si sposta tutta la colonna oltre la sorgente
            const h = dx * n[0] + dy * n[1] + dz * n[2]; if (h < -0.15 || h > 3) continue;
            const d = Math.hypot(dx - n[0] * h, dy - n[1] * h, dz - n[2] * h); if (d >= RAGGIO) continue; v = need * (1 - sstep(PIENO, RAGGIO, d));
          } else { const d = Math.hypot(dx, dy, dz); if (d >= 0.45) continue; v = need * (1 - sstep(0.15, 0.45, d)); }
          if (v > best) { best = v; bn = n; }
        }
        if (!bn) continue;
        if (R.tipo === 'giu') { const g = sample(GB, x, y, z); best = Math.min(best, Math.max(0, g + 0.05)); if (!best) continue; best = -best; }
        out[3 * i] += bn[0] * best; out[3 * i + 1] += bn[1] * best; out[3 * i + 2] += bn[2] * best; maxd = Math.max(maxd, Math.abs(best));
      }
      // levigatura degli spostamenti lungo la mesh: niente increspature né pieghe
      const { idx } = REAL(name), D = new Float32Array(nv * 3); for (let i = 0; i < nv * 3; i++) D[i] = out[i] - pos[i];
      if (!vicini.has(name)) { const nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let r = 0; r < 3; r++) { const a = idx[t + r], b = idx[t + (r + 1) % 3]; nb[a].add(b); nb[b].add(a); } vicini.set(name, nb); }
      const nb = vicini.get(name);
      for (let it = 0; it < (R.liscia ?? LISCIA); it++) { const E = D.slice(); for (let i = 0; i < nv; i++) { if (!nb[i].size) continue; let sx = 0, sy = 0, sz = 0; for (const j of nb[i]) { sx += E[3 * j]; sy += E[3 * j + 1]; sz += E[3 * j + 2]; } const m = nb[i].size;
        D[3 * i] = 0.5 * E[3 * i] + 0.5 * sx / m; D[3 * i + 1] = 0.5 * E[3 * i + 1] + 0.5 * sy / m; D[3 * i + 2] = 0.5 * E[3 * i + 2] + 0.5 * sz / m; } }
      if (R.sezioni) { // cordoni (LCL): ogni sezione trasversale si sposta in blocco, il legamento si curva senza appiattirsi
        const y0 = Math.min(...Array.from({ length: nv }, (_, i) => pos[3 * i + 1])), nb2 = 200, B = Array.from({ length: nb2 }, () => [0, 0, 0]), bin = y => clamp(Math.floor((y - y0) / 0.05), 0, nb2 - 1);
        for (let i = 0; i < nv; i++) { const b = B[bin(pos[3 * i + 1])], dx = out[3 * i] - pos[3 * i], dy = out[3 * i + 1] - pos[3 * i + 1], dz = out[3 * i + 2] - pos[3 * i + 2]; if (Math.hypot(dx, dy, dz) > Math.hypot(...b)) { b[0] = dx; b[1] = dy; b[2] = dz; } }
        const S = B.map((_, k) => { const o = [0, 0, 0]; let w = 0; for (let j = -12; j <= 12; j++) { const q = B[k + j]; if (!q) continue; const ww = Math.exp(-(j * j) / 32); w += ww; for (let c = 0; c < 3; c++) o[c] += q[c] * ww; } return o.map(v => v / w); });
        for (let i = 0; i < nv; i++) { const b = S[bin(pos[3 * i + 1])]; for (let c = 0; c < 3; c++) D[3 * i + c] = b[c]; }
      }
      for (let i = 0; i < nv * 3; i++) out[i] = pos[i] + D[i];
      setPos(name, out); spostati.add(name); tot += src.length;
    }
    log(`${R.tipo} ${R.rif.join('+')}: ${R.sposta.join('+')}, passata ${pass + 1}: ${tot} vertici, spostamento massimo ${(maxd * 10).toFixed(1)} mm`);
    if (!tot) break;
  }
}
for (const [name, o] of orig) { const p = REAL(name).pos; let m = 0, c = 0; for (let i = 0; i < p.length; i += 3) { const d = Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2]); m = Math.max(m, d); if (d > 0.01) c++; }
  console.log(`  ${name}: ${c} vertici spostati, massimo ${(m * 10).toFixed(1)} mm`); }
rapporto('Dopo:');
if (PROVA) process.exit(0);
const buf = Buffer.from(buf0); for (const name of spostati) writePos(buf, name, REAL(name).pos);
saveFile(buf);
