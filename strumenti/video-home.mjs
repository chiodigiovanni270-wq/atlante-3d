/* Genera il video di presentazione della homepage: il modello ruota di 360° attorno
   all'asse verticale, in loop continuo, sullo sfondo scuro della homepage.

   Uso (dalla cartella del progetto, con il server locale attivo sulla porta 8000):
     python3 -m http.server 8000                       (in un altro terminale)
     node strumenti/video-home.mjs <nome> [--passo=2] [--fps=24] [--w=1280] [--dist=1] [--alza=0] [--dy=0] [--prova]

   Esempio:
     node strumenti/video-home.mjs ginocchio-3d
     → salva assets/video/ginocchio-3d.mp4 (H.264, senza audio) e assets/video/ginocchio-3d.jpg (primo fotogramma,
       usato come poster e come immagine fissa per chi ha attivo "riduci movimento")

   Opzioni:
     --passo  px di trascinamento per fotogramma (velocità): un giro = 698 px, quindi 2 → 349 fotogrammi
     --fps    fotogrammi al secondo (con --passo=2 e 24 fps un giro dura ~14,5 s)
     --w      larghezza del video in px (altezza = 5/8)
     --dist   distanza della camera rispetto a quella iniziale (1.4 = modello più piccolo, con più margine)
     --alza   elevazione della camera rispetto a quella iniziale, in radianti (negativo = più dal basso)
     --dy     spostamento verticale del ritaglio, in frazione dell'altezza
     --prova  salva solo il primo fotogramma (per regolare --dist, --alza e --dy)

   Come funziona: come anteprima.mjs apre il modello in Chrome headless e nasconde l'interfaccia;
   poi usa i comandi del modello come farebbe una persona (rotella per la distanza, trascinamento
   orizzontale per la rotazione: 0,009 rad per px, 0,0012 per unità di rotella, i valori del codice
   comune dei modelli), cattura il canvas a ogni fotogramma e compone il JPEG; ffmpeg monta il video.
   Il file del modello non viene modificato.

   Requisiti: Node 22 o successivo, Chrome (vedi lib-chrome.mjs), ffmpeg con libx264
   (macOS: brew install ffmpeg; percorso alternativo nella variabile FFMPEG). */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avviaChrome, apriModello, espressioneCattura, verificaModello } from './lib-chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Uso: node strumenti/video-home.mjs <nome> [--passo=2] [--fps=24] [--w=1280] [--dist=1] [--alza=0] [--dy=0] [--prova]');
  process.exit(1);
}
const passo = Math.max(1, Math.round(Number(opt('passo') || 2))), fps = Number(opt('fps') || 24);
const W = Math.round(Number(opt('w') || 1280) / 2) * 2, H = Math.round(W * 5 / 16) * 2;
const dist = Number(opt('dist') || 1), alza = Number(opt('alza') || 0), dy = Number(opt('dy') || 0);
const prova = args.includes('--prova');
const GIRO = Math.round(2 * Math.PI / 0.009);          // px di trascinamento per un giro completo
const N = prova ? 1 : Math.round(GIRO / passo);

const dir = join(ROOT, 'assets', 'video');
mkdirSync(dir, { recursive: true });
const outVideo = join(dir, `${name}.mp4`), outPoster = join(dir, `${name}.jpg`);

if (!prova && spawnSync(FFMPEG, ['-version']).status !== 0) {
  console.error(`ffmpeg non trovato ("${FFMPEG}"): installalo (macOS: brew install ffmpeg) o indica il percorso nella variabile FFMPEG.`);
  process.exit(1);
}
const url = await verificaModello(name);
const tmp = mkdtempSync(join(tmpdir(), 'video-atlante-'));
const chrome = await avviaChrome();
try {
  await apriModello(chrome, url, 1600, 1000, 1);
  // interfaccia nascosta: gli eventi arrivano direttamente al canvas
  await chrome.evaluate(`(() => { const s = document.createElement('style');
    s.textContent = 'body > :not(canvas){display:none !important}'; document.head.appendChild(s); })()`);
  const mouse = (type, x, y, extra = {}) => chrome.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  const X0 = 1400, Y0 = 500;
  if (dist !== 1) await mouse('mouseWheel', 800, Y0, { button: 'none', deltaX: 0, deltaY: Math.log(dist) / 0.0012 });
  await mouse('mousePressed', X0, Y0, { buttons: 1, clickCount: 1 });
  const dyAlza = Math.round(alza / 0.009);            // trascinare in basso alza la camera
  if (dyAlza) await mouse('mouseMoved', X0, Y0 + dyAlza, { buttons: 1 });
  const t = Date.now();
  for (let i = 0; i < N; i++) {
    if (i) await mouse('mouseMoved', X0 - i * passo, Y0 + dyAlza, { buttons: 1 });
    const res = await chrome.evaluate(espressioneCattura(W, H, 1, dy, 'image/jpeg', 0.92));
    if (res.error) throw new Error(res.error);
    const buf = Buffer.from(res.data.split(',')[1], 'base64');
    writeFileSync(join(tmp, `f${String(i).padStart(4, '0')}.jpg`), buf);
    if (i === 0) writeFileSync(outPoster, buf);
    if (i % 24 === 23) process.stdout.write(`\r${i + 1}/${N} fotogrammi (${Math.round((Date.now() - t) / 1000)} s)`);
  }
  await mouse('mouseReleased', X0 - N * passo, Y0 + dyAlza, { buttons: 0, clickCount: 1 });
  console.log(`\nSalvato ${relative(process.cwd(), outPoster)} (${W}×${H}, primo fotogramma)`);
  if (!prova) {
    const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, 'f%04d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-movflags', '+faststart', '-an', join(tmp, 'out.mp4')], { stdio: 'inherit' });
    if (ff.status !== 0) throw new Error('ffmpeg non è riuscito a creare il video');
    copyFileSync(join(tmp, 'out.mp4'), outVideo);
    console.log(`Salvato ${relative(process.cwd(), outVideo)} (${W}×${H}, ${N} fotogrammi a ${fps} fps, ` +
      `${Math.round(statSync(outVideo).size / 1024)} KB)`);
  }
} finally {
  await chrome.chiudi();
  rmSync(tmp, { recursive: true, force: true });
}
