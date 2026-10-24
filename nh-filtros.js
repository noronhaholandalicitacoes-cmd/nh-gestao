/* ═══ NH · FILTROS RECOLHÍVEIS — 24/10/2026 ═════════════════════════════
   Pedido do cliente (print das abas do Gestão): os filtros de empresa e
   de situação "são muito relevantes, mas deixam o ambiente pesado".
   Primeira versão (lista suspensa) ele não gostou: "quando eu clicar, as
   empresas e os filtros têm que aparecer em ordem na tela, como era, e
   quando quiser recolher é só clicar".

   Então, igual em Gestão, Viabilidade e Portal de Contratos:
   · RECOLHIDO: uma linha de resumo — "Empresa: Todas 802 ▾" e
     "Situação: Todos ▾". Filtro ligado fica laranja, com "×" para
     voltar a "Todas".
   · Um clique no resumo ABRE: as fileiras de pílulas voltam a aparecer
     exatamente como eram, no mesmo lugar e na mesma ordem.
   · "▴ Recolher filtros" fecha de novo.
   · Aberto/recolhido fica guardado por tela (cada um no seu navegador).
   As pílulas são as originais de cada sistema — nenhuma função de filtro
   foi reescrita. Se a tela redesenha as pílulas, o resumo acompanha
   sozinho (MutationObserver).

   Uso: nhFiltrosCompactos([{sel, item, rotulo, ativo?, junto?, esconder?}])
     sel      seletor das fileiras de pílulas
     item     seletor de cada pílula dentro da fileira
     rotulo   "Empresa", "Situação"... (texto do resumo)
     ativo    classe da pílula escolhida (padrão "on")
     junto    function(fileira) → resumo ao lado do qual este vai
     esconder function(fileira) → rótulo antigo, que some só recolhido
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(window.nhFiltrosCompactos) return;

  var CHAVE = 'nhf_aberto:' + location.pathname;
  var TODOS = /^tod[oa]s\b/i;

  var CSS = ''+
  'body:not(.nhf-aberto) .nhf-orig, body:not(.nhf-aberto) .nhf-rot{display:none!important}'+
  'body.nhf-aberto .nhf-bt, body.nhf-aberto .nhf-x, body.nhf-aberto .nhf.nhf-junto{display:none!important}'+
  'body:not(.nhf-aberto) .nhf-rec{display:none!important}'+
  '.nhf{display:inline-flex;align-items:center;vertical-align:middle;margin:0 6px 0 0;flex-shrink:0}'+
  '.nhf-bt,.nhf-rec{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:10px;cursor:pointer;'+
    'font:inherit;font-size:13px;font-weight:600;white-space:nowrap;'+
    'background:var(--s2,var(--surf,#1b1e26));border:1px solid var(--b1,var(--line,#2a2e38));color:var(--t2,var(--txt2,#b8bcc6))}'+
  '.nhf-bt:hover,.nhf-rec:hover{border-color:var(--b2,var(--line2,#3a3f4b));color:var(--t1,var(--txt,#eceef2))}'+
  '.nhf-rec{height:30px;font-size:12px;padding:0 10px}'+
  '.nhf-bt .nhf-r{color:var(--t3,var(--txt3,#8a8f9a));font-weight:500}'+
  '.nhf-bt b{color:var(--t1,var(--txt,#eceef2));font-weight:700;max-width:180px;overflow:hidden;text-overflow:ellipsis}'+
  '.nhf-bt i{font-style:normal;font-size:11.5px;color:var(--t3,var(--txt3,#8a8f9a))}'+
  '.nhf-bt .nhf-s{font-size:10px;opacity:.7}'+
  '.nhf.ligado .nhf-bt{border-color:rgba(249,115,22,.55);background:rgba(249,115,22,.10);border-radius:10px 0 0 10px}'+
  '.nhf.ligado .nhf-bt b{color:var(--nh,#f97316)}'+
  '.nhf-x{display:none;margin-left:-1px;height:34px;width:26px;border-radius:0 10px 10px 0;cursor:pointer;font-size:15px;line-height:1;'+
    'background:rgba(249,115,22,.10);border:1px solid rgba(249,115,22,.55);border-left:none;color:var(--nh,#f97316)}'+
  '.nhf.ligado .nhf-x{display:inline-block}';

  function estilo(){
    if(document.getElementById('nhf-css')) return;
    var s = document.createElement('style'); s.id = 'nhf-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* "VISE (332)" → nome "VISE", conta "332". Só conta entre parênteses. */
  function partes(txt){
    txt = String(txt || '').replace(/\s+/g, ' ').trim();
    var m = txt.match(/^(.*?)\s*\((\d[\d.]*)\)$/);
    return m && m[1] ? {nome: m[1].replace(/[—–-]\s*$/, '').trim(), n: m[2]} : {nome: txt, n: ''};
  }

  function aberto(){ try{ return localStorage.getItem(CHAVE) === '1'; }catch(e){ return false; } }
  function abrir(sim){
    document.body.classList.toggle('nhf-aberto', !!sim);
    try{ localStorage.setItem(CHAVE, sim ? '1' : '0'); }catch(e){}
  }

  function montar(box, cfg){
    if(box._nhf) return;
    var w = document.createElement('div');
    w.className = 'nhf' + (cfg.junto ? ' nhf-junto' : '');
    w.innerHTML = '<button type="button" class="nhf-bt" title="Mostrar os filtros"></button>'+
                  '<button type="button" class="nhf-x" title="Voltar para todos">×</button>'+
                  (cfg.junto ? '' : '<button type="button" class="nhf-rec" title="Recolher os filtros">▴ Recolher filtros</button>');
    var bt = w.querySelector('.nhf-bt'), x = w.querySelector('.nhf-x'), rec = w.querySelector('.nhf-rec');
    var ativoCls = cfg.ativo || 'on';
    box._nhf = {w: w};

    function itens(){ return Array.prototype.slice.call(box.querySelectorAll(cfg.item)); }
    function pintar(){
      var l = itens();
      w.style.display = l.length ? '' : 'none';
      /* Nem toda fileira tem "Todas" (no Portal, a de empresa não tem):
         sem pílula ligada, ou com "Todas/Todos" ligada, é "sem filtro". */
      var at = l.filter(function(p){ return p.classList.contains(ativoCls); })[0] || null;
      var p = at ? partes(at.textContent) : {nome: 'Todas', n: ''};
      w.classList.toggle('ligado', !!(at && !TODOS.test(p.nome)));
      bt.innerHTML = '<span class="nhf-r">' + esc(cfg.rotulo) + ':</span><b>' + esc(p.nome || 'Todas') + '</b>' +
        (p.n ? '<i>' + esc(p.n) + '</i>' : '') + '<span class="nhf-s">▾</span>';
    }
    bt.addEventListener('click', function(ev){ ev.stopPropagation(); abrir(true); });
    if(rec) rec.addEventListener('click', function(ev){ ev.stopPropagation(); abrir(false); });
    x.addEventListener('click', function(ev){
      ev.stopPropagation();
      var l = itens();
      var todos = l.filter(function(q){ return TODOS.test(partes(q.textContent).nome); })[0];
      var at = l.filter(function(q){ return q.classList.contains(ativoCls); })[0];
      /* Com "Todas", clica nela; sem, clica de novo na ligada (desliga). */
      if(todos) todos.click(); else if(at) at.click();
      setTimeout(pintar, 0);
    });

    /* Rótulo antigo: some só quando recolhido. Antes de inserir o resumo,
       porque `esconder` costuma apontar o vizinho anterior da fileira. */
    if(cfg.esconder){ var e = cfg.esconder(box); if(e && e !== w) e.classList.add('nhf-rot'); }
    var vizinho = cfg.junto ? cfg.junto(box) : null;
    if(vizinho && vizinho.parentNode) vizinho.parentNode.insertBefore(w, vizinho.nextSibling);
    else box.parentNode.insertBefore(w, box);
    box.classList.add('nhf-orig');

    new MutationObserver(function(){ pintar(); }).observe(box, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
    pintar();
  }

  var CFGS = [];
  function varrer(){
    CFGS.forEach(function(cfg){
      document.querySelectorAll(cfg.sel).forEach(function(box){ try{ montar(box, cfg); }catch(e){ console.warn('[nh-filtros]', e); } });
    });
  }
  window.nhFiltrosCompactos = function(lista){
    estilo();
    document.body.classList.toggle('nhf-aberto', aberto());
    CFGS = CFGS.concat(lista || []);
    varrer();
    /* Fileiras que nascem depois (abas montadas sob demanda). */
    if(!window._nhfObs){
      var pend = false;
      window._nhfObs = new MutationObserver(function(){
        if(pend) return; pend = true;
        setTimeout(function(){ pend = false; varrer(); }, 120);
      });
      window._nhfObs.observe(document.body, {childList: true, subtree: true});
    }
  };
  window.nhFiltroBotaoDe = function(box){ return box && box._nhf ? box._nhf.w : null; };
})();
