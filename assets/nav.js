/* Header comune dei modelli: link alla home, disclaimer, pannello con crediti.
   Da includere subito dopo <body>:  <script src="../assets/nav.js"></script>
   Non tocca la logica del modello: aggiunge solo elementi sopra il canvas e
   sposta la barra .top del modello sotto l'header. */
(function(){
  /* tema scuro sempre, indipendentemente dal sistema: i modelli definiscono
     :root[data-theme="dark"]. Primo passo, prima che il resto della pagina venga disegnato. */
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';

  var HOME = '../index.html';
  var BAR = 'calc(44px + env(safe-area-inset-top,0px))';

  var css =
    '.an-bar{position:fixed;top:0;left:0;right:0;z-index:20;box-sizing:border-box;height:' + BAR + ';' +
      'padding:env(safe-area-inset-top,0px) max(10px,env(safe-area-inset-right,0px)) 0 max(10px,env(safe-area-inset-left,0px));' +
      'display:flex;align-items:center;gap:10px;background:var(--panel,#1e262f);border-bottom:1px solid var(--line,#324050);' +
      'color:var(--ink,#e5eaef);font:500 13px/1.2 var(--sans,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)}' +
    '.an-home{flex:none;display:inline-flex;align-items:center;gap:4px;padding:8px 6px;color:var(--accent,#72b4d0);font-weight:600;text-decoration:none;white-space:nowrap}' +
    '.an-home span{font-size:18px;line-height:1;margin-top:-2px}' +
    '.an-disc{flex:1;min-width:0;margin:0;text-align:right;color:var(--muted,#93a1ae);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.an-short{display:none}' +
    '@media (max-width:640px){.an-long{display:none}.an-short{display:inline}}' +
    '.an-info{flex:none;width:28px;height:28px;border-radius:50%;border:1px solid var(--line,#324050);background:transparent;' +
      'color:var(--accent,#72b4d0);font:600 14px/1 var(--serif,Georgia,serif);padding:0;cursor:pointer}' +
    '.an-info[aria-expanded="true"]{background:var(--accent,#72b4d0);border-color:var(--accent,#72b4d0);color:var(--panel,#1e262f)}' +
    '.an-home:focus-visible,.an-info:focus-visible,.an-panel a:focus-visible,.an-close:focus-visible{outline:2px solid var(--accent,#72b4d0);outline-offset:2px}' +
    '.an-panel{position:fixed;z-index:21;top:calc(' + BAR + ' + 6px);right:max(10px,env(safe-area-inset-right,0px));' +
      'width:min(360px,calc(100vw - 20px));box-sizing:border-box;padding:14px 38px 14px 16px;background:var(--panel,#1e262f);' +
      'border:1px solid var(--line,#324050);border-radius:12px;box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.45));' +
      'color:var(--ink,#e5eaef);font:400 13.5px/1.45 var(--sans,system-ui,sans-serif)}' +
    '.an-panel[hidden]{display:none}' +
    '.an-panel p{margin:0 0 8px}.an-panel p:last-child{margin:0}' +
    '.an-panel .an-cite{color:var(--muted,#93a1ae);font-size:12px}' +
    '.an-panel a{color:var(--accent,#72b4d0)}' +
    '.an-close{position:absolute;top:6px;right:6px;border:0;background:transparent;color:var(--muted,#93a1ae);font-size:20px;line-height:1;padding:4px 8px;cursor:pointer}' +
    /* unica regola sull'interfaccia del modello: titolo e viste scendono sotto l'header */
    '.top{top:' + BAR + ';padding-top:12px}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('header');
  bar.className = 'an-bar';
  bar.innerHTML =
    '<a class="an-home" href="' + HOME + '"><span aria-hidden="true">‹</span>Atlante 3D</a>' +
    '<p class="an-disc"><span class="an-long">Materiale didattico. Non destinato a uso clinico o diagnostico.</span>' +
      '<span class="an-short">Solo uso didattico</span></p>' +
    '<button type="button" class="an-info" aria-expanded="false" aria-controls="an-panel" aria-label="Informazioni e crediti">i</button>';

  var panel = document.createElement('div');
  panel.id = 'an-panel';
  panel.className = 'an-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Informazioni e crediti');
  panel.hidden = true;
  panel.innerHTML =
    '<button type="button" class="an-close" aria-label="Chiudi">×</button>' +
    '<p><strong>Materiale didattico.</strong> Non destinato a uso clinico o diagnostico.</p>' +
    '<p>I modelli sono derivati da <strong>BodyParts3D</strong>, © The Database Center for Life Science (DBCLS), ' +
      'licenza <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>. ' +
      'Le geometrie originali sono state modificate e integrate con strutture modellate appositamente. ' +
      'I modelli modificati sono distribuiti con la stessa licenza CC BY-SA 2.1 JP.</p>' +
    '<p class="an-cite">Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009.</p>';

  var anchor = document.currentScript;
  if (anchor && anchor.parentNode === document.body) anchor.after(bar, panel);
  else document.body.prepend(bar, panel);

  var btn = bar.querySelector('.an-info');
  function setOpen(open, refocus){
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open && refocus) btn.focus();
  }
  btn.addEventListener('click', function(){ setOpen(panel.hidden); });
  panel.querySelector('.an-close').addEventListener('click', function(){ setOpen(false, true); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !panel.hidden) setOpen(false, true);
  });
  document.addEventListener('pointerdown', function(e){
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();
