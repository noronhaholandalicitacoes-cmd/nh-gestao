/* ═══ NH · FILTROS RECOLHÍVEIS — 24/10/2026 ═════════════════════════════
   Pedido do cliente (print das abas do Gestão): os filtros de empresa e
   de situação "são muito relevantes, mas deixam o ambiente pesado".
   Ajustes pedidos depois:
   · "quando eu clicar, as empresas e os filtros têm que aparecer em ordem
     na tela, como era, e quando quiser recolher é só clicar";
   · "empresas e situações estão fazendo a mesma função" — cada botão tem
     de abrir só a SUA fileira.

   Então, igual em Gestão, Viabilidade e Portal de Contratos:
   · cada fileira de pílulas tem um botão-resumo — "Empresa: Todas 802 ▾";
   · clicar abre AQUELA fileira, exatamente como era, no mesmo lugar;
     clicar de novo recolhe (a seta vira ▴/▾);
   · filtro ligado fica laranja, com "×" para voltar a "Todas";
   · aberto/recolhido fica guardado por fileira (cada um no seu navegador).
   As pílulas são as originais de cada sistema — nenhuma função de filtro
   foi reescrita. Se a tela redesenha as pílulas, o resumo acompanha
   sozinho (MutationObserver).

   Uso: nhFiltrosCompactos([{sel, item, rotulo, ativo?, junto?, esconder?}])
     sel      seletor das fileiras de pílulas
     item     seletor de cada pílula dentro da fileira
     rotulo   "Empresa", "Situação"... (texto do resumo)
     ativo    classe da pílula escolhida (padrão "on")
     junto    function(fileira) → resumo ao lado do qual este vai
     esconder function(fileira) → rótulo antigo, que aparece só aberto
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(window.nhFiltrosCompactos) return;

  var TODOS = /^tod[oa]s\b/i;

  var CSS = ''+
  '.nhf-orig:not(.nhf-aberta), .nhf-rot:not(.nhf-aberta){display:none!important}'+
  '.nhf{display:inline-flex;align-items:center;vertical-align:middle;margin:0 8px 0 0;flex-shrink:0}'+
  '.nhf-bt{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:10px;cursor:pointer;'+
    'font:inherit;font-size:13px;font-weight:600;white-space:nowrap;'+
    'background:var(--s2,var(--surf,#1b1e26));border:1px solid var(--b1,var(--line,#2a2e38));color:var(--t2,var(--txt2,#b8bcc6))}'+
  '.nhf-bt:hover{border-color:var(--b2,var(--line2,#3a3f4b));color:var(--t1,var(--txt,#eceef2))}'+
  '.nhf-bt .nhf-r{color:var(--t3,var(--txt3,#8a8f9a));font-weight:500}'+
  '.nhf-bt b{color:var(--t1,var(--txt,#eceef2));font-weight:700;max-width:180px;overflow:hidden;text-overflow:ellipsis}'+
  '.nhf-bt i{font-style:normal;font-size:11.5px;color:var(--t3,var(--txt3,#8a8f9a))}'+
  '.nhf-bt .nhf-s{font-size:10px;opacity:.7}'+
  '.nhf.aberta .nhf-bt{border-color:var(--b2,var(--line2,#3a3f4b))}'+
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
  function chave(box, cfg){ return 'nhf:' + location.pathname + ':' + (box.id || cfg.rotulo); }
  function lerAberta(k){ try{ return localStorage.getItem(k) === '1'; }catch(e){ return false; } }
  function gravarAberta(k, sim){ try{ localStorage.setItem(k, sim ? '1' : '0'); }catch(e){} }

  function montar(box, cfg){
    if(box._nhf) return;
    var w = document.createElement('div');
    w.className = 'nhf';
    w.innerHTML = '<button type="button" class="nhf-bt"></button>'+
                  '<button type="button" class="nhf-x" title="Voltar para todos">×</button>';
    var bt = w.querySelector('.nhf-bt'), x = w.querySelector('.nhf-x');
    var ativoCls = cfg.ativo || 'on';
    var k = chave(box, cfg), rot = null;
    box._nhf = {w: w};

    function itens(){ return Array.prototype.slice.call(box.querySelectorAll(cfg.item)); }
    function aplicar(sim){
      box.classList.toggle('nhf-aberta', sim);
      if(rot) rot.classList.toggle('nhf-aberta', sim);
      w.classList.toggle('aberta', sim);
      pintar();
    }
    function pintar(){
      var l = itens();
      w.style.display = l.length ? '' : 'none';
      /* Nem toda fileira tem "Todas" (no Portal, a de empresa não tem):
         sem pílula ligada, ou com "Todas/Todos" ligada, é "sem filtro". */
      var at = l.filter(function(p){ return p.classList.contains(ativoCls); })[0] || null;
      var p = at ? partes(at.textContent) : {nome: 'Todas', n: ''};
      var aberta = box.classList.contains('nhf-aberta');
      w.classList.toggle('ligado', !!(at && !TODOS.test(p.nome)));
      bt.innerHTML = '<span class="nhf-r">' + esc(cfg.rotulo) + ':</span><b>' + esc(p.nome || 'Todas') + '</b>' +
        (p.n ? '<i>' + esc(p.n) + '</i>' : '') + '<span class="nhf-s">' + (aberta ? '▴' : '▾') + '</span>';
      bt.title = aberta ? 'Recolher ' + cfg.rotulo.toLowerCase() : 'Mostrar ' + cfg.rotulo.toLowerCase();
    }
    bt.addEventListener('click', function(ev){
      ev.stopPropagation();
      var sim = !box.classList.contains('nhf-aberta');
      gravarAberta(k, sim); aplicar(sim);
    });
    x.addEventListener('click', function(ev){
      ev.stopPropagation();
      var l = itens();
      var todos = l.filter(function(q){ return TODOS.test(partes(q.textContent).nome); })[0];
      var at = l.filter(function(q){ return q.classList.contains(ativoCls); })[0];
      /* Com "Todas", clica nela; sem, clica de novo na ligada (desliga). */
      if(todos) todos.click(); else if(at) at.click();
      setTimeout(pintar, 0);
    });

    /* Rótulo antigo: aparece junto com a fileira aberta. Antes de inserir
       o resumo, porque `esconder` costuma apontar o vizinho anterior. */
    if(cfg.esconder){ var e = cfg.esconder(box); if(e && e !== w){ rot = e; e.classList.add('nhf-rot'); } }
    var vizinho = cfg.junto ? cfg.junto(box) : null;
    if(vizinho && vizinho.parentNode) vizinho.parentNode.insertBefore(w, vizinho.nextSibling);
    else box.parentNode.insertBefore(w, box);
    box.classList.add('nhf-orig');

    new MutationObserver(function(){ pintar(); }).observe(box, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
    aplicar(lerAberta(k));
  }

  var CFGS = [];
  function varrer(){
    CFGS.forEach(function(cfg){
      document.querySelectorAll(cfg.sel).forEach(function(box){ try{ montar(box, cfg); }catch(e){ console.warn('[nh-filtros]', e); } });
    });
  }
  window.nhFiltrosCompactos = function(lista){
    estilo();
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
