/* Header comune dei modelli: link alla home, disclaimer, pannello con crediti.
   Da includere subito dopo <body>:  <script src="../assets/nav.js"></script>
   Non tocca la logica del modello: aggiunge solo elementi sopra il canvas e
   sposta la barra .top del modello sotto l'header.
   Pannello "i": su smartphone foglio dal basso con sfondo attenuato, da 640 px riquadro sotto la "i". */
(function(){
  /* tema scuro sempre, indipendentemente dal sistema: i modelli definiscono
     :root[data-theme="dark"]. Primo passo, prima che il resto della pagina venga disegnato. */
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';

  var HOME = '../index.html';
  var BAR = 'calc(48px + env(safe-area-inset-top,0px))';
  var SANS = 'var(--sans,"Figtree",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)';
  var SERIF = 'var(--serif,"Spectral",Georgia,serif)';
  var WARN = '#ecc85a';   /* giallo dei nervi nei modelli: solo per l'etichetta "Avvertenza" */

  var css =
    '.an-bar{position:fixed;top:0;left:0;right:0;z-index:20;box-sizing:border-box;height:' + BAR + ';' +
      'padding:env(safe-area-inset-top,0px) max(4px,env(safe-area-inset-right,0px)) 0 max(6px,env(safe-area-inset-left,0px));' +
      'display:flex;align-items:center;gap:6px;background:var(--panel,#1e262f);border-bottom:1px solid var(--line,#324050);' +
      'color:var(--ink,#e5eaef);font:500 13px/1.2 ' + SANS + '}' +
    '.an-home{flex:none;display:inline-flex;align-items:center;gap:2px;min-height:44px;padding:0 8px 0 2px;border-radius:8px;' +
      'color:var(--ink,#e5eaef);font:600 17px/1 ' + SERIF + ';text-decoration:none;white-space:nowrap}' +
    '.an-home svg{flex:none;color:var(--accent,#72b4d0)}' +
    '.an-home:hover{color:var(--accent,#72b4d0)}' +
    '.an-disc{flex:1;min-width:0;margin:0;text-align:right;color:var(--muted,#93a1ae);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.an-long{font-size:12.5px;font-weight:400}' +
    '.an-short{display:none;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}' +
    '@media (max-width:640px){.an-long{display:none}.an-short{display:inline}}' +
    '.an-info{flex:none;width:44px;height:44px;border:0;background:transparent;padding:0;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center}' +
    '.an-info span{width:30px;height:30px;box-sizing:border-box;border-radius:50%;border:1px solid var(--line,#324050);' +
      'display:flex;align-items:center;justify-content:center;color:var(--accent,#72b4d0);font:600 17px/1 ' + SERIF + '}' +
    '.an-info:hover span{border-color:var(--accent,#72b4d0)}' +
    '.an-info[aria-expanded="true"] span{background:var(--accent,#72b4d0);border-color:var(--accent,#72b4d0);color:var(--panel,#1e262f)}' +
    '.an-home:focus-visible,.an-info:focus-visible,.an-panel a:focus-visible,.an-close:focus-visible{outline:2px solid var(--accent,#72b4d0);outline-offset:2px}' +
    '.an-panel:focus{outline:none}' +
    '.an-scrim{position:fixed;z-index:19;top:' + BAR + ';left:0;right:0;bottom:0;background:rgba(13,17,22,.66)}' +
    '.an-scrim[hidden],.an-panel[hidden]{display:none}' +
    /* smartphone: foglio dal basso */
    '.an-panel{position:fixed;z-index:21;left:0;right:0;bottom:0;box-sizing:border-box;' +
      'max-height:calc(100% - ' + BAR + ' - 16px);overflow-y:auto;overscroll-behavior:contain;' +
      'padding:10px max(20px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 24px) max(20px,env(safe-area-inset-left,0px));' +
      'display:flex;flex-direction:column;gap:16px;background:var(--panel,#1e262f);border-top:1px solid var(--line,#324050);' +
      'border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.5);color:var(--ink,#e5eaef);font:400 13.5px/1.5 ' + SANS + '}' +
    '.an-grip{align-self:center;flex:none;width:36px;height:4px;border-radius:2px;background:var(--line,#324050)}' +
    '.an-head{display:flex;align-items:center;justify-content:space-between;margin-top:-6px}' +
    '.an-head h2{margin:0;font:600 23px/1.2 ' + SERIF + '}' +
    '.an-close{flex:none;width:44px;height:44px;margin-right:-10px;border:0;border-radius:8px;background:transparent;color:var(--muted,#93a1ae);' +
      'display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}' +
    '.an-close:hover{color:var(--ink,#e5eaef)}' +
    '.an-sec{display:flex;flex-direction:column;gap:6px}' +
    '.an-sec+.an-sec{padding-top:14px;border-top:1px solid var(--line,#324050)}' +
    '.an-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:var(--muted,#93a1ae)}' +
    '.an-warn .an-label{color:' + WARN + '}' +
    '.an-panel p{margin:0}' +
    '.an-warn p{font:500 18px/1.35 ' + SERIF + '}' +
    '.an-panel strong{font-weight:600}' +
    '.an-cite{font:italic 500 14px/1.45 ' + SERIF + ';color:var(--muted,#93a1ae)}' +
    '.an-panel a{color:var(--accent,#72b4d0)}' +
    '.an-back{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;margin-top:2px;border:1px solid var(--accent,#72b4d0);' +
      'border-radius:4px;font-weight:600;font-size:15px;text-decoration:none}' +
    '.an-back:hover{background:var(--accent,#72b4d0);color:var(--panel,#1e262f)}' +
    /* da 640 px: riquadro sotto la "i", senza sfondo attenuato */
    '@media (min-width:641px){' +
      '.an-scrim{display:none}' +
      '.an-panel{left:auto;bottom:auto;top:calc(' + BAR + ' + 8px);right:max(10px,env(safe-area-inset-right,0px));width:380px;' +
        'max-height:calc(100% - ' + BAR + ' - 24px);padding:14px 20px 20px;gap:14px;border:1px solid var(--line,#324050);border-radius:14px;' +
        'box-shadow:0 16px 48px rgba(0,0,0,.55)}' +
      '.an-grip{display:none}.an-head{margin-top:0}.an-head h2{font-size:21px}' +
    '}' +
    /* unica regola sull'interfaccia del modello: titolo e viste scendono sotto l'header */
    '.top{top:' + BAR + ';padding-top:12px}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var CHEVRON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

  var bar = document.createElement('header');
  bar.className = 'an-bar';
  bar.innerHTML =
    '<a class="an-home" href="' + HOME + '">' + CHEVRON + 'Atlante</a>' +
    '<p class="an-disc"><span class="an-long">Materiale didattico. Non destinato a uso clinico o diagnostico.</span>' +
      '<span class="an-short">Solo uso didattico</span></p>' +
    '<button type="button" class="an-info" aria-expanded="false" aria-controls="an-panel" aria-label="Informazioni e crediti">' +
      '<span aria-hidden="true">i</span></button>';

  var scrim = document.createElement('div');
  scrim.className = 'an-scrim';
  scrim.hidden = true;

  var panel = document.createElement('div');
  panel.id = 'an-panel';
  panel.className = 'an-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'an-title');
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML =
    '<div class="an-grip" aria-hidden="true"></div>' +
    '<div class="an-head"><h2 id="an-title">Informazioni</h2>' +
      '<button type="button" class="an-close" aria-label="Chiudi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button></div>' +
    '<section class="an-sec an-warn"><span class="an-label">Avvertenza</span>' +
      '<p>Materiale didattico. Non destinato a uso clinico o diagnostico.</p></section>' +
    '<section class="an-sec"><span class="an-label">Fonte e licenza</span>' +
      '<p>I modelli sono derivati da <strong>BodyParts3D</strong>, © The Database Center for Life Science (DBCLS), ' +
      'licenza <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>. ' +
      'Le geometrie originali sono state modificate e integrate con strutture modellate appositamente. ' +
      'I modelli modificati sono distribuiti con la stessa licenza CC BY-SA 2.1 JP.</p></section>' +
    '<section class="an-sec"><span class="an-label">Citazione</span>' +
      '<p class="an-cite">Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009.</p></section>' +
    '<a class="an-back" href="' + HOME + '">' + CHEVRON + 'Torna all’indice</a>';

  var anchor = document.currentScript;
  if (anchor && anchor.parentNode === document.body) anchor.after(bar, scrim, panel);
  else document.body.prepend(bar, scrim, panel);

  var btn = bar.querySelector('.an-info');
  function setOpen(open, refocus){
    panel.hidden = !open;
    scrim.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) panel.focus({ preventScroll: true });
    else if (refocus) btn.focus();
  }
  btn.addEventListener('click', function(){ setOpen(panel.hidden); });
  panel.querySelector('.an-close').addEventListener('click', function(){ setOpen(false, true); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !panel.hidden) setOpen(false, true);
  });
  /* tocco fuori dal pannello (anche sullo sfondo attenuato): chiude */
  document.addEventListener('pointerdown', function(e){
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();
