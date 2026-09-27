/* Funzioni comuni agli strumenti che modificano le mesh incorporate in modelli/ginocchio-3d.html:
   lettura/scrittura di bpdat/bpman, voxelizzazione, trasformata di distanza, campionamento. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'ginocchio-3d.html');
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const T0 = Date.now();
export const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(1) + 's', ...a);

/* ============ Lettura delle mesh incorporate ============ */
export const M = { html: readFileSync(FILE, 'utf8') };
let html = M.html;
const reMan = /(<script id="bpman" type="application\/json">)(.*?)(<\/script>)/s;
const reDat = /(<script id="bpdat" type="text\/plain">)(.*?)(<\/script>)/s;
export const reManRe = reMan, reDatRe = reDat;
export const man = JSON.parse(html.match(reMan)[2]);
export const buf0 = Buffer.from(html.match(reDat)[2].trim(), 'base64');
const buf = buf0;
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
// posizioni correnti (modificabili con setPos prima della voxelizzazione)
const override = new Map();
export function setPos(name, pos) { override.set(name, pos); const t = topo.get(name); if (t) t.pos = pos; }
// mesh con topologia nuova (posizioni, indici, tag, direzioni delle fibre)
const topo = new Map();
export function setMesh(name, mesh) { topo.set(name, mesh); override.set(name, mesh.pos); }
// attributi per vertice originali: tag (colore muscolo/tendine) e direzione delle fibre
export function attrs(name) {
  const t = topo.get(name); if (t) return { tag: t.tag, fdir: t.fdir };
  const m = man.meshes.findLast(x => x.n === name);
  return { tag: m.t !== undefined ? new Uint8Array(ab, m.t, m.nv).slice() : null, fdir: m.d !== undefined ? new Int8Array(ab, m.d, m.nv * 3).slice() : null };
}
export function REAL(name) {
  const t = topo.get(name); if (t) return { pos: t.pos, idx: t.idx, nv: t.pos.length / 3 };
  const m = man.meshes.findLast(x => x.n === name), mn = man.min, mx = man.max;
  let pos = override.get(name);
  if (!pos) { const q = new Uint16Array(ab, m.p, m.nv * 3); pos = new Float32Array(m.nv * 3);
    for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; pos[i] = mn[k] + q[i] / 65535 * (mx[k] - mn[k]); } }
  const idx = m.i16 ? new Uint16Array(ab, m.i, m.ni) : new Uint32Array(ab, m.i, m.ni);
  return { pos, idx, nv: m.nv };
}

/* ============ Voxel ============ */
export const O = [-6.5, -10, -6], H = 0.1, NX = 130, NY = 195, NZ = 128, NXY = NX * NY, N = NXY * NZ;
export const vi = (i, j, k) => i + NX * j + NXY * k;
export const or = (A, B) => { for (let i = 0; i < N; i++) A[i] |= B[i]; return A; };
// solido: riempimento per parità lungo z (mesh chiuse) + superficie campionata
export function solid(name, soloSuperficie = false) {
  const { pos, idx } = REAL(name), M = new Uint8Array(N);
  if (!soloSuperficie) {
    const cols = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
      const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - O[0]) / H - 0.5)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, cx) - O[0]) / H - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - O[1]) / H - 0.5)), j1 = Math.min(NY - 1, Math.floor((Math.max(ay, by, cy) - O[1]) / H - 0.5));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const x = O[0] + (i + 0.5) * H + 1e-5, y = O[1] + (j + 0.5) * H + 1.3e-5;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const key = i + NX * j; let L = cols.get(key); if (!L) cols.set(key, L = []);
        L.push(l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2]);
      }
    }
    for (const [key, L] of cols) {
      L.sort((a, b) => a - b);
      for (let q = 0; q + 1 < L.length; q += 2) {
        const k0 = Math.max(0, Math.ceil((L[q] - O[2]) / H - 0.5)), k1 = Math.min(NZ - 1, Math.floor((L[q + 1] - O[2]) / H - 0.5));
        for (let k = k0; k <= k1; k++) M[key + NXY * k] = 1;
      }
    }
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const L = Math.max(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]), Math.hypot(pos[a] - pos[c], pos[a + 1] - pos[c + 1], pos[a + 2] - pos[c + 2]), Math.hypot(pos[b] - pos[c], pos[b + 1] - pos[c + 1], pos[b + 2] - pos[c + 2]));
    const m = Math.max(1, Math.ceil(L / (H * 0.5)));
    for (let u = 0; u <= m; u++) for (let v = 0; v <= m - u; v++) {
      const w = m - u - v;
      const i = Math.floor(((pos[a] * u + pos[b] * v + pos[c] * w) / m - O[0]) / H), j = Math.floor(((pos[a + 1] * u + pos[b + 1] * v + pos[c + 1] * w) / m - O[1]) / H), k = Math.floor(((pos[a + 2] * u + pos[b + 2] * v + pos[c + 2] * w) / m - O[2]) / H);
      if (i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ) M[vi(i, j, k)] = 1;
    }
  }
  return M;
}
// trasformata di distanza euclidea (Felzenszwalb): distanza dal set (inv: dal complemento)
export function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
    if (k === 0 && s <= z[0]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
export function edt(M, inv = false) {
  const D = new Float32Array(N); for (let i = 0; i < N; i++) D[i] = (inv ? !M[i] : M[i]) ? 0 : 1e10;
  const mx = Math.max(NX, NY, NZ), f = new Float64Array(mx), d = new Float64Array(mx), v = new Int32Array(mx), z = new Float64Array(mx + 1);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const b = NX * j + NXY * k; for (let i = 0; i < NX; i++) f[i] = D[b + i]; dt1(f, NX, d, v, z); for (let i = 0; i < NX; i++) D[b + i] = d[i]; }
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const b = i + NXY * k; for (let j = 0; j < NY; j++) f[j] = D[b + NX * j]; dt1(f, NY, d, v, z); for (let j = 0; j < NY; j++) D[b + NX * j] = d[j]; }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const b = i + NX * j; for (let k = 0; k < NZ; k++) f[k] = D[b + NXY * k]; dt1(f, NZ, d, v, z); for (let k = 0; k < NZ; k++) D[b + NXY * k] = d[k]; }
  for (let i = 0; i < N; i++) D[i] = Math.sqrt(D[i]) * H; return D;
}
export function sample(F, x, y, z) { // trilineare sui centri dei voxel
  let fx = (x - O[0]) / H - 0.5, fy = (y - O[1]) / H - 0.5, fz = (z - O[2]) / H - 0.5;
  fx = clamp(fx, 0, NX - 1.001); fy = clamp(fy, 0, NY - 1.001); fz = clamp(fz, 0, NZ - 1.001);
  const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = vi(i, j, k), l = (a, c, t) => a + (c - a) * t;
  return l(l(l(F[b], F[b + 1], u), l(F[b + NX], F[b + NX + 1], u), v), l(l(F[b + NXY], F[b + NXY + 1], u), l(F[b + NXY + NX], F[b + NXY + NX + 1], u), v), w);
}

/* ============ Scrittura ============ */
// sovrascrive sul posto le posizioni (stesso numero di vertici) di una mesh esistente
export function writePos(buf, name, pos) {
  const m = man.meshes.findLast(x => x.n === name), q = new Uint16Array(m.nv * 3);
  for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; q[i] = Math.round(clamp((pos[i] - man.min[k]) / (man.max[k] - man.min[k]), 0, 1) * 65535); }
  Buffer.from(q.buffer).copy(buf, m.p);
}
// ricompone il buffer: mesh con topologia nuova (setMesh) o posizioni nuove (setPos); il resto copiato com'è
const quant = pos => { const q = new Uint16Array(pos.length); for (let i = 0; i < pos.length; i++) { const k = i % 3; q[i] = Math.round(clamp((pos[i] - man.min[k]) / (man.max[k] - man.min[k]), 0, 1) * 65535); } return Buffer.from(q.buffer); };
export function repack() {
  const parts = []; let len = 0; const seen = new Map();
  const push = b => { const pad = (4 - len % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); len += pad; } const off = len; parts.push(b); len += b.length; return off; };
  const old = (off, n) => { const k = off + ':' + n; if (!seen.has(k)) seen.set(k, push(buf0.subarray(off, off + n))); return seen.get(k); };
  const live = new Map(); man.meshes.forEach((m, i) => live.set(m.n, i));
  man.meshes = man.meshes.map((m, i) => {
    const e = { ...m }, isLive = live.get(m.n) === i, T = isLive && topo.get(m.n), P = isLive && override.get(m.n);
    if (T) {
      const nv = T.pos.length / 3, i16 = nv < 65536; e.nv = nv; e.ni = T.idx.length; e.i16 = i16 ? 1 : 0;
      e.p = push(quant(T.pos)); delete e.t; delete e.d;
      if (T.tag) e.t = push(Buffer.from(Uint8Array.from(T.tag).buffer)); if (T.fdir) e.d = push(Buffer.from(Int8Array.from(T.fdir).buffer));
      e.i = push(Buffer.from((i16 ? Uint16Array.from(T.idx) : Uint32Array.from(T.idx)).buffer));
    } else {
      e.p = P ? push(quant(P)) : old(m.p, m.nv * 6);
      if (m.t !== undefined) e.t = old(m.t, m.nv); if (m.d !== undefined) e.d = old(m.d, m.nv * 3);
      e.i = old(m.i, m.ni * (m.i16 ? 2 : 4));
    }
    return e;
  });
  return Buffer.concat(parts);
}
export function saveFile(buf) {
  const html = M.html.replace(reMan, (_, a, b, c) => a + JSON.stringify(man) + c).replace(reDat, (_, a, b, c) => a + buf.toString('base64') + c);
  writeFileSync(FILE, html); log('scritto', FILE);
}
