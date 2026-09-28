/* Estremità del modello del ginocchio: tutte le mesh tagliate sullo stesso piano in alto e in basso
   (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto, per ultimo, dopo percorsi-ginocchio.mjs):
     node strumenti/estremi-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file. Lo script è idempotente: si può rilanciare.

   Il modello è un segmento di arto tagliato a metà coscia e a metà gamba. Le mesh BodyParts3D finivano su piani
   diversi (cute ±20,1 cm, muscoli e tendini ±20,2, ossa ±20,3): qui tutto termina sul piano della cute, y = ±TAGLIO.
   I vertici oltre il piano vengono portati sul piano (la sezione resta piatta; la fascia schiacciata è al massimo di
   2 mm). I tubi di vasi e nervi terminano già sul piano (percorsi-ginocchio.mjs, stesso TAGLIO): qui si verifica. */
import { M, REAL, setPos, repack, saveFile, log, man } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const TAGLIO = 20.1, SOGLIA = 18;

for (const n of [...new Set(man.meshes.map(m => m.n))]) {
  const { pos } = REAL(n); let c = 0, m = 0;
  for (let i = 1; i < pos.length; i += 3) m = Math.max(m, Math.abs(pos[i]));
  if (m >= SOGLIA && m < TAGLIO - 0.01) console.log(`  attenzione: ${n} finisce a ${m.toFixed(2)}, prima del piano di taglio`);
  if (m <= TAGLIO + 0.001) continue;
  const P = new Float32Array(pos); for (let i = 1; i < P.length; i += 3) if (Math.abs(P[i]) > TAGLIO) { P[i] = Math.sign(P[i]) * TAGLIO; c++; }
  setPos(n, P); log(`${n}: ${c} vertici portati sul piano (finiva a ${m.toFixed(2)})`);
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
