/* ═══ AGENTE DO GESTÃO — 08/11/2026 ═══════════════════════════════════
   Pedido: "o mesmo agente que acompanha todo o processo no gestão do TK,
   no NH gestão — sem aparência; acompanha todos os cards quando forem
   abertos; pode ficar livre, mas discreto".

   · Um ponto pequeno, translúcido, que se arrasta para qualquer lugar
     (a posição fica guardada neste navegador). Sem rosto, sem som.
   · Percebe sozinho o card que a pessoa abre (expandir o card ou abrir a
     Ficha) e passa a acompanhar aquele processo: mostra, num sussurro de
     poucos segundos, quantos pontos de atenção ele tem — a mesma conta da
     Ficha (_fpAtencao), feita aqui, sem IA e sem leitura do banco.
   · Clicou, abre a conversa já no contexto do card. Quem responde é o
     assistente da NH no servidor (o mesmo motor do Jarvis) (/api/agente/conversa), que relê o processo com as
     travas de acesso da pessoa (restritos, só leitura).
   · Ações que ele pode devolver: levar a outro card / abrir a Ficha, e
     entregar uma peça em rascunho (Word, montado aqui como no Controle).
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if (window.__nhAgente) return; window.__nhAgente = true;
  var API = (typeof NH_API !== 'undefined' && NH_API) || 'https://nhlicitacoes.noronhaholanda.com.br';
  var ETAPAS = {editais:'Editais', andamento:'Em Andamento', finalizados:'Finalizados', ganhas:'Contrato'};
  var ctx = null;            /* {etapa,id,empresa,titulo,atencao:[{n,t}]} */
  var hist = [];             /* [{papel:'eu'|'agente', texto}] — só nesta aba */
  var ocupado = false, aberto = false;
  function ls(k, v){ try{ if(v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(e){ return null; } }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* ── Estilo ───────────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent =
  '#nh-ag{position:fixed;z-index:9000;right:18px;bottom:88px;display:none;font-family:inherit}'+
  '#nh-ag.on{display:block}'+
  /* A logo da NH É o agente (pedido de 08/11): brilha devagar parada,
     gira ao abrir, gira sem parar enquanto pensa e explode ao fechar. */
  '#nh-ag-bola{width:40px;height:40px;border-radius:12px;border:1px solid rgba(249,115,22,.5);cursor:grab;padding:0;position:relative;'+
    'background:var(--nh-logo,radial-gradient(circle at 35% 30%,#f97316,#111725 62%)) center/cover no-repeat;overflow:visible;'+
    'opacity:.7;transition:opacity .25s;touch-action:none;animation:nhAgBrilha 3.6s ease-in-out infinite}'+
  '#nh-ag-bola:hover,#nh-ag.aberto #nh-ag-bola,#nh-ag.ctx #nh-ag-bola{opacity:1}'+
  '#nh-ag-bola:active{cursor:grabbing}'+
  '#nh-ag-bola:focus-visible{outline:2px solid #f97316;outline-offset:3px}'+
  '#nh-ag-bola.gira{animation:nhAgGiraUma .7s cubic-bezier(.2,.8,.2,1),nhAgBrilha 3.6s ease-in-out infinite}'+
  '#nh-ag.pensa #nh-ag-bola{animation:nhAgGira 1.1s linear infinite,nhAgBrilha 1.2s ease-in-out infinite}'+
  '#nh-ag-bola.explode{animation:nhAgExplode .5s ease-out forwards}'+
  '#nh-ag-bola.volta{animation:nhAgVolta .45s cubic-bezier(.2,1.4,.4,1)}'+
  '@keyframes nhAgBrilha{0%,100%{box-shadow:0 0 6px 0 rgba(249,115,22,.25),0 0 0 0 rgba(249,115,22,0)}50%{box-shadow:0 0 16px 3px rgba(249,115,22,.55),0 0 28px 6px rgba(124,58,237,.18)}}'+
  '@keyframes nhAgGira{to{transform:rotate(360deg)}}'+
  '@keyframes nhAgGiraUma{0%{transform:rotate(0) scale(1)}50%{transform:rotate(200deg) scale(1.18)}100%{transform:rotate(360deg) scale(1)}}'+
  '@keyframes nhAgExplode{0%{transform:scale(1);opacity:1;filter:brightness(1)}35%{transform:scale(1.45);filter:brightness(2.2)}100%{transform:scale(.2);opacity:0;filter:brightness(2.5)}}'+
  '@keyframes nhAgVolta{0%{transform:scale(.2);opacity:0}100%{transform:scale(1);opacity:1}}'+
  '.nh-ag-faisca{position:fixed;z-index:9001;width:7px;height:7px;border-radius:50%;pointer-events:none}'+
  '@media (prefers-reduced-motion:reduce){#nh-ag-bola{animation:none;box-shadow:0 0 12px 2px rgba(249,115,22,.4)}#nh-ag-bola.gira{animation:nhAgGiraUma .7s ease}#nh-ag.pensa #nh-ag-bola{animation:nhAgGira 1.6s linear infinite}}'+
  '#nh-ag-num{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;border-radius:8px;font-size:10px;line-height:16px;text-align:center;'+
    'font-weight:700;color:#fff;background:#d97706;display:none;padding:0 4px;pointer-events:none}'+
  '#nh-ag-num.alta{background:#dc2626}'+
  '#nh-ag.ctx #nh-ag-num.tem{display:block}'+
  '#nh-ag-sus{position:absolute;right:52px;bottom:7px;white-space:nowrap;max-width:min(320px,70vw);overflow:hidden;text-overflow:ellipsis;'+
    'font-size:12px;color:var(--t1,#e5e7eb);background:var(--s1,#111725);border:1px solid var(--b1,#252d40);border-radius:999px;padding:5px 11px;'+
    'opacity:0;transform:translateX(6px);transition:opacity .3s,transform .3s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.18)}'+
  '#nh-ag.esq #nh-ag-sus{right:auto;left:52px;transform:translateX(-6px)}'+
  '#nh-ag-sus.on{opacity:.92;transform:none}'+
  '#nh-ag-pn{position:absolute;right:0;bottom:52px;width:min(380px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 120px));display:none;flex-direction:column;'+
    'background:var(--s1,#111725);color:var(--t1,#e5e7eb);border:1px solid var(--b1,#252d40);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);overflow:hidden}'+
  '#nh-ag.esq #nh-ag-pn{right:auto;left:0}'+
  '#nh-ag.baixo #nh-ag-pn{bottom:auto;top:52px}'+
  '#nh-ag.aberto #nh-ag-pn{display:flex}'+
  '.nh-ag-cab{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--b1,#252d40);font-size:12px}'+
  '.nh-ag-logo{width:20px;height:20px;border-radius:6px;flex:none;background:var(--nh-logo,#f97316) center/cover no-repeat}'+
  '.nh-ag-cab b{color:#f97316;letter-spacing:.06em;font-size:11px}'+
  '.nh-ag-cab span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.75}'+
  '.nh-ag-cab button{background:none;border:0;color:inherit;opacity:.6;cursor:pointer;font-size:16px;line-height:1;padding:2px 4px}'+
  '.nh-ag-cab button:hover{opacity:1}'+
  '.nh-ag-at{padding:8px 12px;border-bottom:1px solid var(--b1,#252d40);font-size:12px}'+
  '.nh-ag-at summary{cursor:pointer;opacity:.85}'+
  '.nh-ag-at li{margin:4px 0 0 2px;list-style:none}'+
  '.nh-ag-at li::before{content:"● ";color:#d97706}.nh-ag-at li.alta::before{color:#dc2626}'+
  '.nh-ag-msgs{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-height:90px}'+
  '.nh-ag-m{font-size:13px;line-height:1.45;padding:8px 10px;border-radius:10px;max-width:92%;white-space:pre-wrap;word-wrap:break-word}'+
  '.nh-ag-m.eu{align-self:flex-end;background:rgba(249,115,22,.14)}'+
  '.nh-ag-m.agente{align-self:flex-start;background:var(--s2,#161d2e)}'+
  '.nh-ag-m.erro{color:#ef4444}'+
  '.nh-ag-vazio{font-size:12px;opacity:.7}'+
  '.nh-ag-doc{display:inline-block;margin-top:6px;font-size:12px;font-weight:600;color:#f97316;cursor:pointer;text-decoration:underline}'+
  '.nh-ag-sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}'+
  '.nh-ag-sug button{font-size:11px;border:1px solid var(--b1,#252d40);background:none;color:inherit;border-radius:999px;padding:4px 9px;cursor:pointer;opacity:.85}'+
  '.nh-ag-sug button:hover{opacity:1;border-color:#f97316}'+
  '.nh-ag-pe{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--b1,#252d40)}'+
  '.nh-ag-pe textarea{flex:1;resize:none;height:38px;max-height:110px;font:inherit;font-size:13px;color:inherit;background:var(--s2,#161d2e);border:1px solid var(--b1,#252d40);border-radius:9px;padding:8px 10px}'+
  '.nh-ag-pe button{border:0;border-radius:9px;background:#f97316;color:#fff;font-weight:700;padding:0 13px;cursor:pointer}'+
  '.nh-ag-pe button:disabled{opacity:.5;cursor:default}'+
  '@media (max-width:560px){#nh-ag-pn{position:fixed;left:8px!important;right:8px!important;bottom:8px!important;top:auto!important;width:auto;max-height:70vh}'+
    '#nh-ag.aberto #nh-ag-bola,#nh-ag.aberto #nh-ag-sus{visibility:hidden}}';
  document.head.appendChild(css);

  /* ── Montagem ─────────────────────────────────────────────────────── */
  var raiz = document.createElement('div');
  raiz.id = 'nh-ag';
  raiz.innerHTML =
    '<div id="nh-ag-pn" role="dialog" aria-label="Assistente da NH no Gestão">'+
      '<div class="nh-ag-cab"><i class="nh-ag-logo" aria-hidden="true"></i><b>ASSISTENTE NH</b><span id="nh-ag-onde">sem card aberto</span>'+
        '<button type="button" id="nh-ag-limpa" title="Começar conversa nova" aria-label="Começar conversa nova">⟲</button>'+
        '<button type="button" id="nh-ag-sil" title="Sussurros ao abrir card" aria-label="Ligar ou desligar os avisos ao abrir card"></button>'+
        '<button type="button" id="nh-ag-x" title="Fechar" aria-label="Fechar">×</button></div>'+
      '<div class="nh-ag-at" id="nh-ag-at" hidden></div>'+
      '<div class="nh-ag-msgs" id="nh-ag-msgs" aria-live="polite"></div>'+
      '<div class="nh-ag-sug" id="nh-ag-sug"></div>'+
      '<form class="nh-ag-pe" id="nh-ag-form"><label for="nh-ag-txt" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Pergunte ao assistente da NH</label>'+
        '<textarea id="nh-ag-txt" placeholder="Pergunte sobre este processo…" rows="1"></textarea><button type="submit" id="nh-ag-env">➤</button></form>'+
    '</div>'+
    '<div id="nh-ag-sus" aria-hidden="true"></div>'+
    '<button type="button" id="nh-ag-bola" aria-expanded="false" aria-label="Assistente da NH: clique para conversar, arraste para mudar de lugar"><span id="nh-ag-num"></span></button>';
  document.body.appendChild(raiz);
  var $ = function(id){ return document.getElementById(id); };
  var bola = $('nh-ag-bola'), pn = $('nh-ag-pn'), msgs = $('nh-ag-msgs'), txt = $('nh-ag-txt');

  /* Posição livre, guardada. */
  function aplicarPos(p){
    if(!p) return;
    var x = Math.min(window.innerWidth - 50, Math.max(6, p.x)), y = Math.min(window.innerHeight - 50, Math.max(6, p.y));
    raiz.style.left = x + 'px'; raiz.style.top = y + 'px'; raiz.style.right = 'auto'; raiz.style.bottom = 'auto';
    raiz.classList.toggle('esq', x < window.innerWidth / 2);
    raiz.classList.toggle('baixo', y < 300);
  }
  try{ aplicarPos(JSON.parse(ls('nh-ag-pos') || 'null')); }catch(e){}
  window.addEventListener('resize', function(){ try{ aplicarPos(JSON.parse(ls('nh-ag-pos') || 'null')); }catch(e){} });
  var arr = null, ignorar = false;
  bola.addEventListener('pointerdown', function(e){ arr = {x:e.clientX, y:e.clientY, mexeu:false}; try{ bola.setPointerCapture(e.pointerId); }catch(_){} });
  bola.addEventListener('pointermove', function(e){
    if(!arr) return;
    if(!arr.mexeu && Math.hypot(e.clientX - arr.x, e.clientY - arr.y) < 5) return;
    arr.mexeu = true;
    var p = {x: e.clientX - 20, y: e.clientY - 20}; aplicarPos(p); ls('nh-ag-pos', JSON.stringify(p));
  });
  bola.addEventListener('pointerup', function(){ if(arr && arr.mexeu) ignorar = true; arr = null; });
  bola.addEventListener('click', function(){ if(ignorar){ ignorar = false; return; } alternar(!aberto); });
  $('nh-ag-x').addEventListener('click', function(){ alternar(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && aberto) alternar(false); });
  /* Giro e explosão são curtos e só acontecem quando a pessoa clica: rodam
     sempre (pedido do cliente). O brilho contínuo respeita "reduzir movimento". */
  var calmo = false;
  function animar(cls, ms, depois){
    bola.classList.remove('gira', 'explode', 'volta'); void bola.offsetWidth;
    bola.classList.add(cls);
    setTimeout(function(){ bola.classList.remove(cls); if(depois) depois(); }, ms);
  }
  /* Faíscas nas cores da logo, saindo do centro da bola. */
  function explodir(){
    if(calmo) return;
    var r = bola.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var cores = ['#f97316', '#fb923c', '#7c3aed', '#3b82f6', '#fde68a'];
    for(var i = 0; i < 16; i++){
      var f = document.createElement('span'); f.className = 'nh-ag-faisca';
      var ang = (Math.PI * 2 * i) / 16 + Math.random() * .4, dist = 34 + Math.random() * 38, tam = 4 + Math.random() * 5;
      f.style.cssText = 'left:' + (cx - tam / 2) + 'px;top:' + (cy - tam / 2) + 'px;width:' + tam + 'px;height:' + tam + 'px;background:' + cores[i % cores.length] + ';box-shadow:0 0 8px ' + cores[i % cores.length];
      document.body.appendChild(f);
      var a = f.animate ? f.animate([{transform: 'translate(0,0) scale(1)', opacity: 1},
        {transform: 'translate(' + Math.cos(ang) * dist + 'px,' + Math.sin(ang) * dist + 'px) scale(.2)', opacity: 0}],
        {duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.1,.8,.3,1)'}) : null;
      (function(el){ if(a) a.onfinish = function(){ el.remove(); }; else setTimeout(function(){ el.remove(); }, 600); })(f);
    }
    animar('explode', 500, function(){ animar('volta', 450); });
  }
  function alternar(v){
    var era = aberto;
    aberto = v; raiz.classList.toggle('aberto', v); bola.setAttribute('aria-expanded', v ? 'true' : 'false');
    if(v){ if(!era && !calmo) animar('gira', 700); pintarCab(); pintarSugestoes(); if(!hist.length) pintarMsgs(); setTimeout(function(){ txt.focus(); }, 30); }
    else if(era) explodir();
  }

  /* Sussurros: ligados por padrão; a pessoa desliga no painel. */
  function sussurrosOn(){ return ls('nh-ag-sus') !== 'off'; }
  function pintarSil(){ var b = $('nh-ag-sil'); b.textContent = sussurrosOn() ? '◉' : '○'; b.title = sussurrosOn() ? 'Avisos ao abrir card: ligados (clique para desligar)' : 'Avisos ao abrir card: desligados (clique para ligar)'; }
  $('nh-ag-sil').addEventListener('click', function(){ ls('nh-ag-sus', sussurrosOn() ? 'off' : 'on'); pintarSil(); });
  pintarSil();
  var tSus = null;
  function sussurrar(t){
    if(!sussurrosOn() || aberto) return;
    var s = $('nh-ag-sus'); s.textContent = t; s.classList.add('on');
    clearTimeout(tSus); tSus = setTimeout(function(){ s.classList.remove('on'); }, 4200);
  }
  $('nh-ag-limpa').addEventListener('click', function(){ hist = []; pintarMsgs(); });

  /* ── Só aparece com alguém logado no Gestão ───────────────────────── */
  function logado(){
    try{
      var u = (typeof auth !== 'undefined' && auth.currentUser);
      var tela = document.getElementById('login-screen');
      return !!u && !(tela && getComputedStyle(tela).display !== 'none');
    }catch(e){ return false; }
  }
  setInterval(function(){
    var on = logado();
    raiz.classList.toggle('on', on);
    if(!on && aberto) alternar(false);
    if(!on){ ctx = null; hist = []; }
  }, 1500);

  /* ── Acompanhar o card aberto ─────────────────────────────────────── */
  function aba(){ try{ var b = document.querySelector('.sb-item.on'); var m = b && /go\(['"]([^'"]+)['"]/.exec(b.getAttribute('onclick') || ''); return m ? m[1] : ''; }catch(e){ return ''; } }
  function registro(etapa, id){
    try{ var L = (typeof ALL !== 'undefined' && ALL[etapa]) || []; for(var i = 0; i < L.length; i++) if(String(L[i][0]) === String(id)) return L[i]; }catch(e){}
    return null;
  }
  function atencaoDe(etapa, id){
    try{
      if(typeof nhFichaElos !== 'function' || typeof _fpAtencao !== 'function') return [];
      var el = nhFichaElos(etapa, id); return el ? _fpAtencao(el) : [];
    }catch(e){ return []; }
  }
  function acompanhar(etapa, id){
    if(!ETAPAS[etapa] || id === undefined || id === null || id === '') return;
    var r = registro(etapa, id); if(!r) return;
    var mesmo = ctx && ctx.etapa === etapa && String(ctx.id) === String(id);
    ctx = {etapa: etapa, id: String(id), empresa: String(r[2] || '').trim(), titulo: String(r[3] || '').trim(), atencao: atencaoDe(etapa, id)};
    raiz.classList.add('ctx');
    var n = ctx.atencao.length, altas = ctx.atencao.filter(function(x){ return x.n === 'alta'; }).length, num = $('nh-ag-num');
    num.textContent = n; num.className = n ? ('tem' + (altas ? ' alta' : '')) : '';
    if(aberto){ pintarCab(); pintarSugestoes(); }
    if(!mesmo) sussurrar((ctx.empresa ? ctx.empresa + ' · ' : '') + (ctx.titulo || ETAPAS[etapa] + ' #' + id).slice(0, 60) +
      (n ? ' — ' + n + ' ponto' + (n > 1 ? 's' : '') + ' de atenção' + (altas ? ' (' + altas + ' urgente' + (altas > 1 ? 's' : '') + ')' : '') : ' — em ordem'));
  }
  /* Card expandido: a classe "collapsed" sai do .kcard (clique no topo,
     irParaCard ou "Expandir tudo"). Vários de uma vez = expandir tudo:
     não muda o foco. */
  var fila = [], tFila = null;
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      var t = m.target;
      if(!t.classList || !t.classList.contains('kcard')) return;
      if(/\bcollapsed\b/.test(m.oldValue || '') && !t.classList.contains('collapsed')) fila.push(t.id);
    });
    if(!fila.length) return;
    clearTimeout(tFila);
    tFila = setTimeout(function(){
      var ids = fila.slice(); fila = [];
      if(ids.length !== 1) return;
      var mm = /^row-([a-z]+)-(\d+)$/.exec(ids[0]); if(!mm) return;
      try{ var rec = (typeof FIL !== 'undefined' && FIL[mm[1]] || [])[+mm[2]]; if(rec) acompanhar(mm[1], rec[0]); }catch(e){}
    }, 60);
  }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true});
  /* Ficha do processo. */
  if(typeof window.nhFichaAbrir === 'function'){
    var orig = window.nhFichaAbrir;
    window.nhFichaAbrir = function(etapa, id){ var r = orig.apply(this, arguments); try{ acompanhar(etapa, id); }catch(e){} return r; };
  }

  /* ── Painel ───────────────────────────────────────────────────────── */
  function pintarCab(){
    $('nh-ag-onde').textContent = ctx ? ('acompanhando · ' + (ctx.empresa ? ctx.empresa + ' · ' : '') + (ctx.titulo || ETAPAS[ctx.etapa] + ' #' + ctx.id)) : 'sem card aberto — pergunte sobre qualquer processo';
    var at = $('nh-ag-at');
    if(ctx && ctx.atencao.length){
      at.hidden = false;
      at.innerHTML = '<details><summary>' + ctx.atencao.length + ' ponto' + (ctx.atencao.length > 1 ? 's' : '') + ' de atenção neste card</summary><ul style="margin:4px 0 0;padding:0">' +
        ctx.atencao.map(function(x){ return '<li class="' + (x.n === 'alta' ? 'alta' : '') + '">' + esc(x.t) + '</li>'; }).join('') + '</ul></details>';
    } else at.hidden = true;
  }
  function soLeitura(){ return typeof IS_READONLY !== 'undefined' && !!IS_READONLY; }
  function pintarSugestoes(){
    var s;
    if(ctx){
      s = ['Resuma este processo', 'O que falta para avançar?', 'Quais os riscos?'];
      if(!soLeitura()){
        if(ctx.etapa === 'editais') s.push('Gere uma impugnação deste edital');
        else if(ctx.etapa === 'andamento') s.push('Gere um recurso');
        else if(ctx.etapa === 'ganhas') s.push('Gere um ofício de reajuste');
      }
      s.push('Abrir a ficha');
    } else s = ['O que pede ação hoje?', 'O que vence esta semana?', 'Procurar um processo'];
    $('nh-ag-sug').innerHTML = s.map(function(x){ return '<button type="button">' + esc(x) + '</button>'; }).join('');
    Array.prototype.forEach.call($('nh-ag-sug').querySelectorAll('button'), function(b){
      b.addEventListener('click', function(){
        if(b.textContent === 'Abrir a ficha' && ctx){ try{ nhFichaAbrir(ctx.etapa, ctx.id); }catch(e){} return; }
        enviar(b.textContent);
      });
    });
  }
  function pintarMsgs(pensando){
    if(!hist.length && !pensando){
      msgs.innerHTML = '<div class="nh-ag-vazio">Estou acompanhando os cards que você abre. Pergunte o que precisar — situação, prazos, riscos, próximo passo — ou peça uma peça em rascunho.</div>';
      return;
    }
    msgs.innerHTML = hist.map(function(m, i){
      return '<div class="nh-ag-m ' + (m.erro ? 'agente erro' : m.papel) + '">' + esc(m.texto) +
        (m.doc ? '<br><span class="nh-ag-doc" data-i="' + i + '">⤓ Baixar Word: ' + esc(m.doc.titulo || 'documento') + '</span>' +
          (m.doc.drive ? ' · <a class="nh-ag-doc" href="' + esc(m.doc.drive) + '" target="_blank" rel="noopener">pasta</a>' : '') : '') + '</div>';
    }).join('') + (pensando ? '<div class="nh-ag-m agente">' + esc(pensando) + '</div>' : '');
    Array.prototype.forEach.call(msgs.querySelectorAll('span.nh-ag-doc'), function(s){
      s.addEventListener('click', function(){ var m = hist[+s.getAttribute('data-i')]; if(m && m.doc) baixarWord(m.doc.id, s); });
    });
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── Conversa ─────────────────────────────────────────────────────── */
  $('nh-ag-form').addEventListener('submit', function(e){ e.preventDefault(); enviar(txt.value); });
  txt.addEventListener('keydown', function(e){ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); enviar(txt.value); } });
  async function enviar(t){
    t = String(t || '').trim(); if(!t || ocupado) return;
    var u = (typeof auth !== 'undefined' && auth.currentUser); if(!u) return;
    txt.value = ''; ocupado = true; $('nh-ag-env').disabled = true; raiz.classList.add('pensa');
    var anterior = hist.filter(function(m){ return !m.erro; }).map(function(m){ return {papel: m.papel, texto: m.texto}; });
    hist.push({papel: 'eu', texto: t});
    var longo = /impugna|recurso|contrarraz|esclarec|declara|proposta|of[ií]cio|gere|redij/i.test(t);
    pintarMsgs(longo ? 'Redigindo — leio a pasta e o edital, leva de 1 a 3 minutos…' : 'Olhando…');
    try{
      var r = await fetch(API + '/api/agente/conversa', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({idToken: await u.getIdToken(), mensagem: t, etapa: ctx ? ctx.etapa : '', id: ctx ? ctx.id : '', aba: aba(),
          atencao: ctx ? ctx.atencao.map(function(x){ return x.t; }) : [], historico: anterior.slice(-12)})});
      var j = await r.json().catch(function(){ return {}; });
      if(!r.ok || !j.ok) throw new Error(j.erro || ('HTTP ' + r.status));
      var m = {papel: 'agente', texto: j.texto || 'Feito.'};
      (j.acoes || []).forEach(function(a){
        if(a.tipo === 'documento') m.doc = {id: a.id, titulo: a.titulo, drive: a.drive};
        if(a.tipo === 'abrir') setTimeout(function(){
          try{ if(a.como === 'ficha') nhFichaAbrir(a.etapa, a.id); else irParaCard(a.etapa, a.id); }catch(e){}
        }, 250);
      });
      hist.push(m);
    }catch(e){
      hist.push({papel: 'agente', erro: true, texto: 'Não consegui responder: ' + (e.message || e)});
    }finally{
      ocupado = false; $('nh-ag-env').disabled = false; raiz.classList.remove('pensa');
      if(hist.length > 40) hist.splice(0, hist.length - 40);
      pintarMsgs();
    }
  }

  /* ── Word (mesma montagem do Controle) ────────────────────────────── */
  async function baixarWord(id, alvo){
    var u = (typeof auth !== 'undefined' && auth.currentUser); if(!u) return;
    var txt0 = alvo.textContent; alvo.textContent = 'montando…';
    try{
      var r = await fetch(API + '/api/agente/documento', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({idToken: await u.getIdToken(), id: id})});
      var j = await r.json().catch(function(){ return {}; });
      if(!r.ok || !j.ok) throw new Error(j.erro || ('HTTP ' + r.status));
      var D = window.docx; if(!D) throw new Error('a biblioteca do Word não carregou; recarregue a página');
      var d = j.doc || {};
      var P = function(t, op){ op = op || {};
        return new D.Paragraph({alignment: op.al || D.AlignmentType.JUSTIFIED, spacing: {after: op.depois === undefined ? 160 : op.depois, line: 360},
          indent: op.recuo ? {firstLine: 709} : undefined, children: [new D.TextRun({text: String(t || ''), bold: !!op.negrito, size: op.tam || 24, font: 'Arial'})]}); };
      var f = [];
      if(d.titulo) f.push(P(String(d.titulo).toUpperCase(), {al: D.AlignmentType.CENTER, negrito: true, tam: 26, depois: 320}));
      if(d.enderecamento) f.push(P(d.enderecamento, {negrito: true, al: D.AlignmentType.LEFT}));
      if(d.referencia) f.push(P(d.referencia, {al: D.AlignmentType.LEFT, depois: 280}));
      if(d.qualificacao) f.push(P(d.qualificacao, {recuo: true}));
      (d.secoes || []).forEach(function(s){
        if(s.titulo) f.push(P(String(s.titulo).toUpperCase(), {negrito: true, al: D.AlignmentType.LEFT, depois: 120}));
        (s.paragrafos || []).forEach(function(p){ f.push(P(p, {recuo: true})); });
      });
      if((d.pedidos || []).length){ f.push(P('DOS PEDIDOS', {negrito: true, al: D.AlignmentType.LEFT, depois: 120})); d.pedidos.forEach(function(p, i){ f.push(P(String.fromCharCode(97 + i) + ') ' + p)); }); }
      if(d.fecho) f.push(P(d.fecho, {recuo: true, depois: 240}));
      if(d.local_data) f.push(P(d.local_data, {al: D.AlignmentType.RIGHT, depois: 720}));
      var as = d.assinatura || {};
      f.push(P('_______________________________________', {al: D.AlignmentType.CENTER, depois: 0}));
      [as.nome, as.cargo, as.empresa, as.cnpj ? 'CNPJ ' + String(as.cnpj).replace(/^CNPJ\s*/i, '') : ''].filter(Boolean).forEach(function(l){ f.push(P(l, {al: D.AlignmentType.CENTER, depois: 0})); });
      var doc = new D.Document({creator: 'NH Licitações', title: d.titulo || 'Documento',
        sections: [{properties: {page: {margin: {top: 1418, bottom: 1134, left: 1701, right: 1134}}}, children: f}]});
      var blob = await D.Packer.toBlob(doc);
      var nome = String(d.titulo || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'documento';
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome + '.docx'; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }catch(e){
      alert('Não consegui montar o Word: ' + (e.message || e));
    }finally{ alvo.textContent = txt0; }
  }
})();
