/* Estremità del modello del ginocchio: tutte le mesh tagliate sullo stesso piano in alto e in basso
   (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto, per ultimo, dopo percorsi-ginocchio.mjs):
     node strumenti/estremi-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file. Lo script è idempotente: si può rilanciare.

   Il modello è un segmento di arto tagliato a metà coscia e a metà gamba. Le mesh BodyParts3D finivano su piani
   diversi (cute ±20,1 cm, muscoli e tendini ±20,2, ossa ±20,3): qui tutto termina sul piano della cute, y = ±TAGLIO.
   I vertici oltre il piano vengono portati sul piano (la sezione resta piatta; la fascia schiacciata è al massimo di
   2 mm). I tubi di vasi e nervi terminano già sul piano (percorsi-ginocchio.mjs, stesso TAGLIO): qui si verifica.

   Sezioni pulite sul piano di taglio:
   - ventagli doppi: se una mesh ha sul piano triangoli a ventaglio sovrapposti alla sezione originale (chiusure
     automatiche dei bordi aperti), vengono tolti: due superfici coincidenti danno in WebGL un disegno "a raggiera"
     (z-fighting) al posto della sezione;
   - sezioni sovrapposte: dove la sezione di una struttura invade quella di un'altra (compenetrazione delle mesh
     originali), i vertici sul piano della struttura con priorità minore escono sul bordo dell'altra e i suoi
     triangoli sul piano rimasti dentro l'altra sezione si tolgono (la sezione cede solo dove si sovrappone;
     il resto della mesh non cambia);
   - rientro: ossa, vasi e nervi finiscono sul piano, le altre strutture 0,3 mm sotto (RIENTRO), così dove le
     sezioni si toccano non ci sono superfici coincidenti. Priorità: ossa, poi vasi e nervi, poi le altre strutture dalla sezione più ampia. */
import { M, REAL, setPos, setMesh, attrs, repack, saveFile, log, man } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const TAGLIO = 20.1, SOGLIA = 18, TOL = 0.002;   // TOL: tolleranza della quantizzazione a 16 bit
const RIENTRO = 0.03;                             // le strutture diverse da ossa, vasi e nervi finiscono 0,3 mm sotto il piano
const PIANO = TAGLIO - RIENTRO - TOL;             // vertici sulla sezione (sul piano o appena sotto)
const VALENZA = 16;                               // vertice sul piano con più triangoli: centro di un ventaglio
const H = 0.02, O = -12, NG = 1200;               // griglia 2D del piano (x, z) in cm
const MARGINE = 0.015;                            // distacco dal bordo della sezione vicina
const OSSA = ['femore', 'tibia', 'perone', 'rotula'], ESCLUSE = new Set(['cute', 'capsula']);
const nomi = [...new Set(man.meshes.map(m => m.n))];

for (const n of nomi) {
  const { pos } = REAL(n); let c = 0, m = 0;
  for (let i = 1; i < pos.length; i += 3) m = Math.max(m, Math.abs(pos[i]));
  if (m >= SOGLIA && m < TAGLIO - RIENTRO - 0.01) console.log(`  attenzione: ${n} finisce a ${m.toFixed(2)}, prima del piano di taglio`);
  if (m <= TAGLIO + 0.001) continue;
  const P = new Float32Array(pos); for (let i = 1; i < P.length; i += 3) if (Math.abs(P[i]) > TAGLIO) { P[i] = Math.sign(P[i]) * TAGLIO; c++; }
  setPos(n, P); log(`${n}: ${c} vertici portati sul piano (finiva a ${m.toFixed(2)})`);
}

// toglie i triangoli scelti da via(t) e i vertici rimasti senza triangoli
function togli(n, via) {
  const { pos, idx, nv } = REAL(n), T = []; for (let t = 0; t < idx.length; t += 3) if (!via(t)) T.push(idx[t], idx[t + 1], idx[t + 2]);
  if (T.length === idx.length) return 0;
  const { tag, fdir } = attrs(n), map = new Int32Array(nv).fill(-1), np = [], nt = [], nf = [], ni = [];
  for (const o of T) { if (map[o] < 0) { map[o] = np.length / 3; np.push(pos[3 * o], pos[3 * o + 1], pos[3 * o + 2]); if (tag) nt.push(tag[o]); if (fdir) nf.push(fdir[3 * o], fdir[3 * o + 1], fdir[3 * o + 2]); } ni.push(map[o]); }
  setMesh(n, { pos: Float32Array.from(np), idx: Uint32Array.from(ni), tag: tag ? Uint8Array.from(nt) : null, fdir: fdir ? Int8Array.from(nf) : null });
  return (idx.length - T.length) / 3;
}

/* ---- ventagli doppi sul piano ---- */
for (const n of nomi) {
  const { pos, idx, nv } = REAL(n), sul = i => Math.abs(pos[3 * i + 1]) > PIANO, val = new Uint16Array(nv);
  for (let t = 0; t < idx.length; t += 3) if (sul(idx[t]) && sul(idx[t + 1]) && sul(idx[t + 2])) for (let r = 0; r < 3; r++) val[idx[t + r]]++;
  const c = togli(n, t => val[idx[t]] > VALENZA || val[idx[t + 1]] > VALENZA || val[idx[t + 2]] > VALENZA);
  if (c) log(`${n}: tolti ${c} triangoli a ventaglio sul piano`);
}

/* ---- sezioni sovrapposte ---- */
// sezione di una mesh sul piano (segno s): maschera 2D dei triangoli che giacciono sul piano
function sezione(n, s) {
  const { pos, idx } = REAL(n), sul = i => s * pos[3 * i + 1] > PIANO, Mk = new Uint8Array(NG * NG); let area = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]]; if (!v.every(sul)) continue;
    const P = v.map(i => [pos[3 * i], pos[3 * i + 2]]), den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
    if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.ceil((Math.min(P[0][0], P[1][0], P[2][0]) - O) / H), i1 = Math.floor((Math.max(P[0][0], P[1][0], P[2][0]) - O) / H);
    const j0 = Math.ceil((Math.min(P[0][1], P[1][1], P[2][1]) - O) / H), j1 = Math.floor((Math.max(P[0][1], P[1][1], P[2][1]) - O) / H);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = O + i * H + 1e-5, z = O + j * H + 1.3e-5;
      const l1 = ((P[1][1] - P[2][1]) * (x - P[2][0]) + (P[2][0] - P[1][0]) * (z - P[2][1])) / den, l2 = ((P[2][1] - P[0][1]) * (x - P[2][0]) + (P[0][0] - P[2][0]) * (z - P[2][1])) / den;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) Mk[i * NG + j] = 1;
    }
  }
  for (const v of Mk) area += v; return area ? { Mk, area: area * H * H } : null;
}
// estremi dei tubi (vasi e nervi) sul piano: cerchi di raggio r
const tubi = [];
for (const m of M.html.matchAll(/\{id:'(\w+)',nw:1,cat:'(?:art|ven|ner)'/g)) {
  const i = m.index, fine = M.html.indexOf('\n {id:', i + 5);
  for (let j = M.html.indexOf('tube([[', i); j >= 0 && j < fine; j = M.html.indexOf('tube([[', j + 1)) {
    const k = M.html.indexOf(']]', j) + 2, pts = JSON.parse(M.html.slice(j + 5, k)), r = parseFloat(M.html.slice(k + 1));
    for (const a of [pts[0], pts.at(-1)]) if (Math.abs(Math.abs(a[1]) - TAGLIO) < 0.005) tubi.push({ id: m[1], s: Math.sign(a[1]), x: a[0], z: a[2], r });
  }
}
const cerchio = (Mk, { x, z, r }) => { const R = r + MARGINE; for (let i = Math.floor((x - R - O) / H); i <= Math.ceil((x + R - O) / H); i++) for (let j = Math.floor((z - R - O) / H); j <= Math.ceil((z + R - O) / H); j++) if (Math.hypot(O + i * H - x, O + j * H - z) <= R) Mk[i * NG + j] = 1; };
const dentro = (U, x, z) => { const i = Math.round((x - O) / H), j = Math.round((z - O) / H); return i >= 0 && j >= 0 && i < NG && j < NG && U[i * NG + j]; };
// punto fuori da U più vicino a (x, z), cercato su anelli crescenti della griglia
function uscita(U, x, z) {
  const i0 = Math.round((x - O) / H), j0 = Math.round((z - O) / H); let best = null, bd = Infinity;
  for (let r = 1; r < 100 && (r - 1) * H < bd; r++) for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
    if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= NG || j >= NG || U[i * NG + j]) continue;
    const px = O + i * H, pz = O + j * H, d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = [px, pz]; }
  }
  if (!best) return null; const l = bd || 1; return [best[0] + (best[0] - x) / l * MARGINE, best[1] + (best[1] - z) / l * MARGINE];
}
for (const s of [1, -1]) {
  const sez = nomi.filter(n => !ESCLUSE.has(n)).map(n => ({ n, ...sezione(n, s) })).filter(e => e.Mk);
  sez.sort((a, b) => (OSSA.includes(b.n) - OSSA.includes(a.n)) || b.area - a.area);
  const U = new Uint8Array(NG * NG); // sezioni già occupate (ossa, tubi, strutture con priorità maggiore)
  for (const e of sez.filter(e => OSSA.includes(e.n))) for (let i = 0; i < U.length; i++) U[i] |= e.Mk[i];
  for (const t of tubi.filter(t => t.s === s)) cerchio(U, t);
  for (const e of sez) {
    if (!OSSA.includes(e.n)) {
      const { pos } = REAL(e.n), P = new Float32Array(pos); let c = 0, dmax = 0;
      for (let v = 0; v < P.length / 3; v++) {
        if (s * P[3 * v + 1] < PIANO || !dentro(U, P[3 * v], P[3 * v + 2])) continue;
        const q = uscita(U, P[3 * v], P[3 * v + 2]); if (!q || Math.hypot(q[0] - P[3 * v], q[1] - P[3 * v + 2]) < 2 * H) continue; // già sul bordo
        dmax = Math.max(dmax, Math.hypot(q[0] - P[3 * v], q[1] - P[3 * v + 2])); P[3 * v] = q[0]; P[3 * v + 2] = q[1]; c++;
      }
      if (c) setPos(e.n, P);
      // triangoli sul piano rimasti dentro una sezione vicina (lo scavalcano senza avervi vertici): coperti, si tolgono
      const { idx } = REAL(e.n), sul = i => s * P[3 * i + 1] > PIANO;
      const t0 = togli(e.n, t => { const [a, b, d] = [idx[t], idx[t + 1], idx[t + 2]]; return sul(a) && sul(b) && sul(d) && dentro(U, (P[3 * a] + P[3 * b] + P[3 * d]) / 3, (P[3 * a + 2] + P[3 * b + 2] + P[3 * d + 2]) / 3); });
      if (c || t0) log(`${e.n} (${s > 0 ? 'alto' : 'basso'}): ${c} vertici fuori dalle sezioni vicine (max ${(10 * dmax).toFixed(1)} mm), ${t0} triangoli coperti tolti`);
    }
    const f = sezione(e.n, s); if (f) for (let i = 0; i < U.length; i++) U[i] |= f.Mk[i];
  }
}
// rientro: dove due sezioni si toccano restano sempre visibili quelle di ossa, vasi e nervi (niente z-fighting
// tra superfici coincidenti); 0,3 mm non si vedono ma bastano alla precisione della profondità in WebGL
for (const n of nomi) {
  if (OSSA.includes(n) || ESCLUSE.has(n) || !(sezione(n, 1) || sezione(n, -1))) continue; // solo le strutture tagliate
  const { pos } = REAL(n), P = new Float32Array(pos); let c = 0;
  for (let i = 1; i < P.length; i += 3) if (Math.abs(P[i]) > TAGLIO - RIENTRO + 1e-4) { P[i] = Math.sign(P[i]) * (TAGLIO - RIENTRO); c++; }
  if (c) { setPos(n, P); log(`${n}: ${c} vertici ${RIENTRO * 10} mm sotto il piano`); }
}

// verifica dei tubi: gli estremi alla sezione devono stare sul piano, con l'ultimo tratto verticale
for (const m of M.html.matchAll(/\{id:'(\w+)',nw:1,cat:'(?:art|ven|ner)'/g)) {
  const i = m.index, fine = M.html.indexOf('\n {id:', i + 5);
  for (let j = M.html.indexOf('tube([[', i); j >= 0 && j < fine; j = M.html.indexOf('tube([[', j + 1)) {
    const pts = JSON.parse(M.html.slice(j + 5, M.html.indexOf(']]', j) + 2));
    for (const [a, b] of [[pts[0], pts[1]], [pts.at(-1), pts.at(-2)]]) if (Math.abs(a[1]) > SOGLIA && (Math.abs(Math.abs(a[1]) - TAGLIO) > 0.005 || Math.hypot(a[0] - b[0], a[2] - b[2]) > 0.005))
      console.log(`  attenzione: ${m[1]} termina a y ${a[1]} (non sul piano o non verticale): rilanciare percorsi-ginocchio.mjs`);
  }
}
if (PROVA) process.exit(0);
saveFile(repack());
