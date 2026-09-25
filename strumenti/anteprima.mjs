/* Genera l'anteprima di un modello per la card della homepage.

   Uso (dalla cartella del progetto, con il server locale attivo sulla porta 8000):
     python3 -m http.server 8000                       (in un altro terminale)
     node strumenti/anteprima.mjs <nome> [--zoom=1] [--dy=0] [--out=percorso.jpg]

   Esempio:
     node strumenti/anteprima.mjs ginocchio-3d
     → apre http://localhost:8000/modelli/ginocchio-3d.html e salva assets/anteprime/ginocchio-3d.jpg

   Opzioni:
     --zoom  ingrandimento del ritaglio (1 = canvas intero, 1.2 = 20% più vicino)
     --dy    spostamento verticale del ritaglio, in frazione dell'altezza (es. -0.05 = più in alto)
     --out   percorso di uscita alternativo (utile per fare prove senza sovrascrivere)

   Come funziona: avvia Google Chrome headless con un profilo temporaneo (non tocca il tuo),
   apre il modello a 1600×1000, aspetta che #load sia nascosto (modello costruito), cattura
   solo il canvas 3D nella vista iniziale e lo compone 800×500 su sfondo con la palette scura
   del sito, JPEG qualità 0.82.

   Requisiti: Node 22 o successivo (WebSocket integrato), Google Chrome in /Applications. */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SERVER = 'http://localhost:8000';
const PORT = 9223;

const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Uso: node strumenti/anteprima.mjs <nome> [--zoom=1] [--dy=0] [--out=percorso.jpg]');
  process.exit(1);
}
const zoom = Number(opt('zoom') || 1), dy = Number(opt('dy') || 0);
const out = resolve(opt('out') || join(ROOT, 'assets', 'anteprime', `${name}.jpg`));
const url = `${SERVER}/modelli/${name}.html`;

let status;
try { status = (await fetch(url)).status; }
catch {
  console.error(`Server locale non raggiungibile su ${SERVER}.\nAvvialo dalla cartella del progetto: python3 -m http.server 8000`);
  process.exit(1);
}
if (status !== 200) {
  console.error(`${url} risponde HTTP ${status}: controlla che esista modelli/${name}.html`);
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'anteprima-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,1000', 'about:blank'],
  { stdio: 'ignore' });

try {
  let pages;
  for (let i = 0; i < 50 && !pages; i++) {
    try { pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(t => t.type === 'page'); }
    catch { await sleep(200); }
  }
  if (!pages || !pages.length) throw new Error('Chrome headless non risponde');

  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const cdp = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr =>
    (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });

  // attende la fine della costruzione del modello (max 60 s); senza #load aspetta 8 s
  let built = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const st = await evaluate(`(() => { const l = document.getElementById('load'); return l ? (l.hidden ? 'ok' : 'wait') : 'none'; })()`);
    if (st === 'ok') { built = true; break; }
    if (st === 'none' && i >= 16) break;
  }
  if (!built) console.warn('Attenzione: #load non trovato o ancora visibile, catturo comunque.');
  await sleep(1500);

  const res = await evaluate(`new Promise(res => requestAnimationFrame(() => {
    const c = document.getElementById('c') || document.querySelector('canvas');
    if (!c) return res({ error: 'nessun canvas nella pagina' });
    const W = 800, H = 500, z = ${zoom}, dy = ${dy};
    const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
    const gr = g.createRadialGradient(W/2, H*0.42, 0, W/2, H*0.42, W*0.6);
    gr.addColorStop(0, '#2a333d'); gr.addColorStop(0.62, '#161c23'); gr.addColorStop(1, '#0d1116');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const sw = c.width / z, sh = sw * H / W, sx = (c.width - sw) / 2, sy = (c.height - sh) / 2 + dy * c.height;
    g.drawImage(c, sx, sy, sw, sh, 0, 0, W, H);
    res({ data: o.toDataURL('image/jpeg', 0.82) });
  }))`);
  if (res.error) throw new Error(res.error);

  const buf = Buffer.from(res.data.split(',')[1], 'base64');
  writeFileSync(out, buf);
  console.log(`Salvata ${relative(process.cwd(), out)} (800×500, ${Math.round(buf.length / 1024)} KB)`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(prof, { recursive: true, force: true });
}
