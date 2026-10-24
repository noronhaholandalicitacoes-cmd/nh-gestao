/* ═══ NH · FILTROS COMPACTOS — 24/10/2026 ═══════════════════════════════
   Pedido do cliente (print das abas do Gestão): os filtros de empresa e
   de situação "são muito relevantes, mas deixam o ambiente pesado" —
   duas fileiras de pílulas antes do primeiro card. Pediu "mais
   padronizado, recolhível e de rápido acesso", igual em todas as abas e
   em todos os sistemas.

   Como funciona (o mesmo em Gestão, Viabilidade e Portal de Contratos):
   · cada fileira de pílulas vira UM botão — "Empresa: Todas 802 ▾";
   · um clique abre a lista inteira (as mesmas pílulas, com as mesmas
     cores e contagens); um clique escolhe e fecha;
   · filtro ligado fica laranja e ganha um "×" para voltar a "Todas";
   · a fileira original continua na página, escondida: cada pílula da
     lista CLICA a pílula original. Nenhuma função de filtro foi
     reescrita — se a tela redesenha as pílulas, o botão acompanha
     sozinho (MutationObserver).

   Uso: nhFiltrosCompactos([{sel, item, rotulo, ativo?, junto?}])
     sel     seletor das fileiras de pílulas
     item    seletor de cada pílula dentro da fileira
     rotulo  "Empresa", "Situação"... (texto à esquerda do botão)
     ativo   classe da pílula escolhida (padrão "on")
     junto   function(fileira) → elemento ao lado do qual o botão vai
             (para pôr "Situação" do lado de "Empresa", na mesma linha)
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(window.nhFiltrosCompactos) return;

  var CSS = ''+
  '.nhf-orig{display:none!important}'+
  '.nhf{position:relative;display:inline-flex;align-items:center;vertical-align:middle;margin:0 6px 0 0}'+
  '.nhf-bt{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:10px;cursor:pointer;'+
    'font:inherit;font-size:13px;font-weight:600;white-space:nowrap;'+
    'background:var(--s2,var(--surf,#1b1e26));border:1px solid var(--b1,var(--line,#2a2e38));color:var(--t2,var(--txt2,#b8bcc6))}'+
  '.nhf-bt:hover{border-color:var(--b2,var(--line2,#3a3f4b));color:var(--t1,var(--txt,#eceef2))}'+
  '.nhf-bt .nhf-r{color:var(--t3,var(--txt3,#8a8f9a));font-weight:500}'+
  '.nhf-bt b{color:var(--t1,var(--txt,#eceef2));font-weight:700;max-width:180px;overflow:hidden;text-overflow:ellipsis}'+
  '.nhf-bt i{font-style:normal;font-size:11.5px;color:var(--t3,var(--txt3,#8a8f9a))}'+
  '.nhf-bt .nhf-s{font-size:10px;opacity:.7}'+
  '.nhf.ligado .nhf-bt{border-color:rgba(249,115,22,.55);background:rgba(249,115,22,.10)}'+
  '.nhf.ligado .nhf-bt b{color:var(--nh,#f97316)}'+
  '.nhf-x{display:none;margin-left:-6px;height:34px;width:26px;border-radius:0 10px 10px 0;cursor:pointer;font-size:15px;line-height:1;'+
    'background:rgba(249,115,22,.10);border:1px solid rgba(249,115,22,.55);border-left:none;color:var(--nh,#f97316)}'+
  '.nhf.ligado .nhf-x{display:inline-block}'+
  '.nhf.ligado .nhf-bt{border-radius:10px 0 0 10px}'+
  '.nhf-pop{display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:9000;min-width:240px;max-width:min(560px,92vw);'+
    'max-height:60vh;overflow:auto;padding:10px;border-radius:12px;'+
    'background:var(--s1,var(--bg2,#14161c));border:1px solid var(--b2,var(--line2,#3a3f4b));box-shadow:0 14px 40px rgba(0,0,0,.45)}'+
  '.nhf.aberto .nhf-pop{display:flex;flex-wrap:wrap;gap:6px}'+
  '.nhf-pop>*{margin:0!important}'+
  '.nhf-linha{display:flex;align-items:center;gap:6px;flex-wrap:wrap}';

  function estilo(){
    if(document.getElementById('nhf-css')) return;
    var s = document.createElement('style'); s.id = 'nhf-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  var TODOS = /^tod[oa]s\b/i;
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* "VISE (332)" → nome "VISE", conta "332" */
  function partes(txt){
    txt = String(txt || '').replace(/\s+/g, ' ').trim();
    var m = txt.match(/^(.*?)\s*\((\d[\d.]*)\)$/);
    return m && m[1] ? {nome: m[1].replace(/[—–-]\s*$/, '').trim(), n: m[2]} : {nome: txt, n: ''};
  }

  function fecharTodos(exceto){
    document.querySelectorAll('.nhf.aberto').forEach(function(w){ if(w !== exceto) w.classList.remove('aberto'); });
  }
  document.addEventListener('click', function(ev){ if(!ev.target.closest || !ev.target.closest('.nhf')) fecharTodos(null); });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') fecharTodos(null); });

  function montar(box, cfg){
    if(box._nhf) return;
    var w = document.createElement('div');
    w.className = 'nhf';
    w.innerHTML = '<button type="button" class="nhf-bt" aria-haspopup="true"></button>'+
                  '<button type="button" class="nhf-x" title="Voltar para todos">×</button>'+
                  '<div class="nhf-pop" role="menu"></div>';
    var bt = w.children[0], x = w.children[1], pop = w.children[2];
    var ativoCls = cfg.ativo || 'on';
    var st = {w: w, cfg: cfg};
    box._nhf = st;

    function itens(){ return Array.prototype.slice.call(box.querySelectorAll(cfg.item)); }
    function pintar(){
      var l = itens();
      w.style.display = l.length ? '' : 'none';
      /* Nem toda fileira tem "Todas" (no Portal, a de empresa não tem):
         sem pílula ligada, ou com a "Todas/Todos" ligada, é "sem filtro". */
      var at = l.filter(function(p){ return p.classList.contains(ativoCls); })[0] || null;
      var p = at ? partes(at.textContent) : {nome: 'Todas', n: ''};
      var ligado = !!(at && !TODOS.test(p.nome));
      w.classList.toggle('ligado', ligado);
      bt.innerHTML = '<span class="nhf-r">' + esc(cfg.rotulo) + ':</span><b>' + esc(p.nome || 'Todas') + '</b>' +
        (p.n ? '<i>' + esc(p.n) + '</i>' : '') + '<span class="nhf-s">▾</span>';
      bt.title = cfg.rotulo + ' — ' + l.length + ' opç' + (l.length === 1 ? 'ão' : 'ões') + '. Clique para escolher.';
      if(w.classList.contains('aberto')) lista();
    }
    function lista(){
      pop.innerHTML = '';
      itens().forEach(function(orig){
        var c = orig.cloneNode(true);
        c.removeAttribute('id'); c.removeAttribute('onclick');
        c.addEventListener('click', function(ev){
          ev.preventDefault(); ev.stopPropagation();
          w.classList.remove('aberto');
          orig.click();
          setTimeout(pintar, 0);
        });
        pop.appendChild(c);
      });
    }
    bt.addEventListener('click', function(ev){
      ev.stopPropagation();
      var abrir = !w.classList.contains('aberto');
      fecharTodos(w);
      if(abrir){ lista(); w.classList.add('aberto'); } else w.classList.remove('aberto');
    });
    x.addEventListener('click', function(ev){
      ev.stopPropagation();
      var l = itens();
      var todos = l.filter(function(p){ return TODOS.test(partes(p.textContent).nome); })[0];
      var at = l.filter(function(p){ return p.classList.contains(ativoCls); })[0];
      /* Com "Todas", clica nela; sem, clica de novo na ligada (desliga). */
      if(todos) todos.click(); else if(at) at.click();
      setTimeout(pintar, 0);
    });

    /* Antes de inserir o botão: `esconder` costuma apontar o vizinho
       anterior da fileira (o rótulo antigo). */
    if(cfg.esconder){ var e = cfg.esconder(box); if(e && e !== w) e.style.display = 'none'; }
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
  /* Para quem precisa do botão de outra fileira (ex.: pôr "Situação"
     ao lado de "Empresa"). */
  window.nhFiltroBotaoDe = function(box){ return box && box._nhf ? box._nhf.w : null; };
})();
