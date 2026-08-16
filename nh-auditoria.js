/* ══════════════════════════════════════════════════════════════════
   NH — TRILHA DE AUDITORIA E LIXEIRA
   Arquivo compartilhado pelos cinco sistemas. Criado em 15/08/2026.

   POR QUE ESTE ARQUIVO EXISTE
   ───────────────────────────
   A empresa cresceu, entraram colaboradores, e o sistema não sabia
   dizer quem fez o quê. `fbSave` gravava _updatedAt (QUANDO mudou) e
   nunca quem; `fbDelete` apagava de vez, sem registro e sem volta.
   Com senha compartilhada, "alguém alterou" era tudo que dava para
   saber — e mesmo com contas separadas não haveria onde olhar.

   AS TRÊS REGRAS QUE ESTE ARQUIVO IMPÕE
   ─────────────────────────────────────
   1. TODA gravação passa a dizer quem fez.
   2. NADA é apagado de verdade: vai para a lixeira e pode voltar.
   3. A trilha é IMUTÁVEL. As regras do Firestore permitem criar e ler,
      e proíbem alterar e apagar — para todo mundo, inclusive o admin.
      Trilha que o admin pode editar não é trilha, é rascunho.

   POR QUE ARQUIVO COMPARTILHADO, E NÃO COLADO EM CADA SISTEMA
   ──────────────────────────────────────────────────────────
   Cinco cópias de código de segurança divergem — é assim que nasce o
   sistema em que quatro telas auditam e a quinta não, e ninguém sabe
   qual. Aqui é um lugar só.

   ⚠️ Este arquivo precisa ser publicado JUNTO com os HTML. Se ele
      faltar, os sistemas continuam funcionando (a chamada é protegida)
      mas PARAM DE AUDITAR — e a tela de Atividade avisa isso em
      vermelho, em vez de mostrar uma lista vazia e parecer que
      ninguém fez nada.

   NÃO É BOMBA DE COTA
   ───────────────────
   O sistema principal grava a cada célula editada. Uma linha de
   auditoria por gravação encheria a cota do Firebase (que já estourou
   uma vez, em 06/08). Por isso a COALESCÊNCIA: edições seguidas do
   mesmo registro, pela mesma pessoa, dentro de 3 minutos, viram UMA
   linha só, que vai acumulando os campos tocados. "Kethleen editou o
   edital 412" em vez de quarenta linhas iguais.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var NH = global.NHAudit = global.NHAudit || {};

  var _db = null;
  var _sistema = '';
  var _quem = '';
  var _papel = '';
  var _nome = '';
  var _ligado = false;

  /* ── Coalescência: por que ela junta ANTES de gravar ─────────────
     A primeira versão gravava a linha e depois a atualizava a cada
     nova edição. Não funciona, e a razão é a própria regra que torna
     a trilha confiável: `allow update: if false`. Toda tentativa de
     coalescer levaria "permissão negada" e cairia para linha nova —
     ou seja, a bomba de cota que a coalescência existe para evitar.

     Afrouxar a regra para permitir o retoque foi considerado e
     recusado: quem pode reescrever `campos` pode esconder o que
     alterou, e aí a trilha deixa de servir para a conversa difícil
     que é o motivo de ela existir.

     Solução: juntar na MEMÓRIA e gravar UMA vez, no fim da rajada.
     A trilha continua estritamente só-inserção.

     Descarrega quando:
       • 45 s sem novo toque no mesmo registro (fim da rajada), ou
       • 3 min desde o primeiro toque (alguém editando sem parar), ou
       • a aba é escondida ou fechada (é aí que se perde de verdade).

     O que se perde no pior caso: até 45 s de detalhe, se o navegador
     for morto à força. É melhor do que multiplicar por quarenta a
     escrita no banco — e a cota do Firebase já estourou uma vez. */
  var OCIOSO = 45 * 1000;
  var IDADE_MAX = 3 * 60 * 1000;
  var _buffer = {};      /* chave → {ev, campos, primeiro, ultimo, toques, timer} */

  /* Falhas de gravação da trilha. Não interrompem o trabalho, mas a
     tela de Atividade mostra o número — trilha que falha em silêncio
     é pior do que trilha nenhuma, porque dá falsa segurança. */
  NH.falhas = 0;
  NH.ultimoErro = '';

  /* ── Ligar ──────────────────────────────────────────────────────
     `db` é a instância nomeada de cada sistema (nh-viabilidade,
     nh-crm, …); cada um passa a sua. */
  NH.iniciar = function (opcoes) {
    _db = opcoes.db;
    _sistema = String(opcoes.sistema || '?');
    _ligado = !!_db;
    return NH;
  };

  /** Quem está usando. Chamado no onAuthStateChanged de cada sistema.
   *  `papel` diz de que tipo é o acesso: 'admin', 'equipe' ou
   *  'empresa' — porque na hora de ler a trilha importa saber se quem
   *  mexeu era da casa ou era a cliente. */
  /** `nome` entrou em 16/08/2026, quando o login da equipe passou a ser
   *  o WhatsApp. Sem ele a trilha diria "5583999887766 alterou o edital
   *  #412" — verdadeiro e inútil. O nome é gravado em CADA linha, no
   *  momento da ação, e não consultado depois: assim continua legível
   *  mesmo que a pessoa saia da empresa e o cadastro suma. */
  NH.identificar = function (email, papel, nome) {
    _quem = String(email || '').toLowerCase();
    _papel = String(papel || '');
    _nome = String(nome || '');
    return NH;
  };

  NH.quem = function () { return _quem; };
  NH.pronto = function () { return _ligado && !!_quem; };

  /* ── Comparar antes e depois ────────────────────────────────────
     Guardar o documento inteiro a cada alteração seria caro e
     ilegível. O que interessa é o que MUDOU. */

  function _texto(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return '[objeto]'; } }
    return String(v);
  }

  /** Compara dois arrays posicionais (_arr) e devolve os índices que
   *  mudaram, com o valor de antes e o de depois. Os nomes das colunas
   *  vêm de fora, porque só o sistema sabe o que é o índice 12. */
  NH.diffArr = function (antes, depois, nomes) {
    var out = [];
    var a = antes || [], b = depois || [];
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var va = _texto(a[i]), vb = _texto(b[i]);
      if (va === vb) continue;
      out.push({
        campo: (nomes && nomes[i]) ? nomes[i] : ('coluna ' + i),
        de: va.substring(0, 120),
        para: vb.substring(0, 120)
      });
    }
    return out;
  };

  /** Compara dois objetos simples. Usado pelos sistemas que não
   *  guardam array posicional (CRM, Financeiro). */
  NH.diffObj = function (antes, depois, rotulos) {
    var out = [];
    var a = antes || {}, b = depois || {};
    var chaves = {};
    Object.keys(a).forEach(function (k) { chaves[k] = 1; });
    Object.keys(b).forEach(function (k) { chaves[k] = 1; });
    Object.keys(chaves).forEach(function (k) {
      /* Campos de controle não são notícia: dizer que _updatedAt mudou
         a cada gravação é ruído que esconde a informação real. */
      if (k.charAt(0) === '_' || k === 'atualizadoEm' || k === 'atualizadoPor') return;
      var va = _texto(a[k]), vb = _texto(b[k]);
      if (va === vb) return;
      out.push({
        campo: (rotulos && rotulos[k]) ? rotulos[k] : k,
        de: va.substring(0, 120),
        para: vb.substring(0, 120)
      });
    });
    return out;
  };

  /* ── Gravar na trilha ───────────────────────────────────────────── */

  function _agora() { return Date.now(); }

  /**
   * Registra uma ação.
   *
   *   NHAudit.registrar({
   *     acao:   'alterou',            // criou | alterou | excluiu |
   *                                   // restaurou | entrou | saiu | negado
   *     onde:   'editais',            // coleção
   *     alvo:   '412',                // id do documento
   *     rotulo: 'PE 045/2026 — VISE', // como a pessoa reconhece
   *     campos: [{campo,de,para}]     // opcional
   *   })
   *
   * Nunca lança: se a trilha falhar, o trabalho da pessoa continua.
   * O erro fica contado em NHAudit.falhas e aparece na tela de
   * Atividade — fail-open, mas visível.
   */
  NH.registrar = function (ev) {
    if (!_ligado) return Promise.resolve(false);
    try {
      var acao = String(ev.acao || 'alterou');
      var campos = Array.isArray(ev.campos) ? ev.campos.slice(0, 30) : [];

      /* Só 'alterou' é juntado. Criar, excluir, entrar e restaurar são
         eventos únicos — juntá-los apagaria informação, e são raros o
         bastante para não pesarem na cota. */
      if (acao !== 'alterou') return _gravar(_montar(ev, campos, 1));

      var chave = _sistema + '|' + String(ev.onde || '') + '|' + String(ev.alvo == null ? '' : ev.alvo);
      var b = _buffer[chave];
      if (!b) {
        b = _buffer[chave] = { ev: ev, campos: [], primeiro: _agora(), toques: 0, timer: null };
      }
      b.ev = ev;                 /* o rótulo mais recente é o melhor */
      b.toques++;
      _juntarCampos(b.campos, campos);
      b.ultimo = _agora();

      if (b.timer) clearTimeout(b.timer);
      /* Se a rajada já dura muito, descarrega agora em vez de esperar
         o ócio — senão quem edita sem parar nunca aparece na trilha. */
      var espera = ((_agora() - b.primeiro) >= IDADE_MAX) ? 0 : OCIOSO;
      b.timer = setTimeout(function () { _descarregar(chave); }, espera);
      return Promise.resolve(true);
    } catch (e) {
      NH.falhas++; NH.ultimoErro = e && e.message || String(e);
      return Promise.resolve(false);
    }
  };

  /** Junta campos novos nos já acumulados. Mesmo campo tocado de novo
   *  mantém o "de" ORIGINAL e atualiza o "para" — senão o histórico
   *  mostraria o penúltimo valor em vez do ponto de partida. */
  function _juntarCampos(acc, novos) {
    novos.forEach(function (c) {
      var achou = null;
      for (var i = 0; i < acc.length; i++) if (acc[i].campo === c.campo) { achou = acc[i]; break; }
      if (achou) achou.para = c.para; else acc.push(c);
    });
    if (acc.length > 30) acc.length = 30;
  }

  function _montar(ev, campos, toques) {
    var doc = {
      quando: _agora(),
      quem: _quem || '(sem identificação)',
      nome: _nome || '',
      papel: _papel,
      sistema: _sistema,
      acao: String(ev.acao || 'alterou'),
      onde: String(ev.onde || ''),
      alvo: String(ev.alvo == null ? '' : ev.alvo),
      rotulo: String(ev.rotulo || '').substring(0, 160),
      campos: campos,
      /* Quantas gravações a linha representa. 40 toques num registro
         não é só ruído poupado: é alguém refazendo trabalho, e isso
         em si é informação. */
      toques: toques || 1
    };
    if (ev.copia) doc.copia = ev.copia;
    return doc;
  }

  function _gravar(doc) {
    return _db.collection('auditoria').add(doc)
      .then(function () { return true; })
      .catch(function (e) {
        NH.falhas++; NH.ultimoErro = e && e.message || String(e);
        console.error('[auditoria] não gravou:', NH.ultimoErro);
        return false;
      });
  }

  function _descarregar(chave) {
    var b = _buffer[chave];
    if (!b) return Promise.resolve(false);
    delete _buffer[chave];
    if (b.timer) clearTimeout(b.timer);
    if (!b.campos.length && b.toques <= 0) return Promise.resolve(false);
    return _gravar(_montar(b.ev, b.campos, b.toques));
  }

  /** Descarrega tudo que está esperando. Chamado antes de sair da
   *  página e disponível para quem quiser forçar. */
  NH.descarregar = function () {
    var todas = Object.keys(_buffer).map(_descarregar);
    return Promise.all(todas);
  };

  /* Fechar a aba é o momento em que a trilha se perde. `visibilitychange`
     é o gancho que dispara de verdade no celular; `pagehide` cobre o
     fechar da aba no computador. `beforeunload` sozinho não basta. */
  if (global.addEventListener) {
    global.addEventListener('visibilitychange', function () {
      if (global.document && global.document.visibilityState === 'hidden') NH.descarregar();
    });
    global.addEventListener('pagehide', function () { NH.descarregar(); });
  }

  /* ── Lixeira ────────────────────────────────────────────────────
     Excluir passa a ser mover. O documento inteiro é copiado para
     `lixeira` antes de sair do lugar, com quem tirou e quando.

     Isso resolve o "excluíram e ninguém sabe" duas vezes: sabe-se
     quem, e dá para desfazer. */

  /**
   * Apaga com rede de segurança.
   *   colecao — de onde sai
   *   id      — qual documento
   *   rotulo  — como a pessoa reconhece o que foi apagado
   *
   * Devolve {ok:true} ou {ok:false, erro}. Se a cópia para a lixeira
   * falhar, NÃO apaga: melhor o registro ficar do que sumir sem volta.
   */
  /* ── A lixeira NÃO expira sozinha ────────────────────────────────
     Decidido com o cliente em 15/08/2026. Cheguei a montar expiração
     automática de 90 dias por TTL do Firestore, e ele preferiu que
     nada suma sem alguém decidir — só o sócio apaga, quando quiser.

     É a escolha mais segura das duas, e por um motivo que vale
     registrar: prazo automático é uma promessa silenciosa. Se um dia
     a política for desligada por engano no console, ninguém percebe;
     se for esquecida ligada, some coisa que alguém ainda ia procurar.
     Sem prazo, o estado da lixeira é sempre o que se vê na tela.

     O custo é ela crescer para sempre. Não é problema real: são linhas
     de texto, não arquivos — e se um dia incomodar, o sócio limpa pelo
     botão, que é justamente o que existe. */

  NH.excluir = function (colecao, id, rotulo) {
    if (!_ligado) return Promise.reject(new Error('auditoria não iniciada'));
    var ref = _db.collection(colecao).doc(String(id));
    return ref.get().then(function (snap) {
      if (!snap.exists) return { ok: true, vazio: true };
      var dados = snap.data();
      return _db.collection('lixeira').add({
        colecao: colecao,
        docId: String(id),
        dados: dados,
        rotulo: String(rotulo || '').substring(0, 160),
        excluidoPor: _quem || '(sem identificação)',
        excluidoPorNome: _nome || '',
        excluidoEm: _agora(),
        sistema: _sistema,
        restaurado: false
      }).then(function (lix) {
        return ref.delete().then(function () {
          NH.registrar({
            acao: 'excluiu', onde: colecao, alvo: id,
            rotulo: rotulo, copia: lix.id
          });
          return { ok: true, lixeiraId: lix.id };
        });
      });
    }).catch(function (e) {
      /* Falhou a cópia: o documento continua onde estava. É o
         comportamento certo — perder o dado é pior que não apagar. */
      return { ok: false, erro: e && e.message || String(e) };
    });
  };

  /** Devolve um item da lixeira para o lugar de onde saiu. */
  NH.restaurar = function (lixeiraId) {
    if (!_ligado) return Promise.reject(new Error('auditoria não iniciada'));
    var lref = _db.collection('lixeira').doc(String(lixeiraId));
    return lref.get().then(function (snap) {
      if (!snap.exists) return { ok: false, erro: 'item não está mais na lixeira' };
      var it = snap.data();
      if (it.restaurado) return { ok: false, erro: 'este item já foi restaurado' };
      return _db.collection(it.colecao).doc(it.docId).get().then(function (atual) {
        /* Se alguém recriou o registro com o mesmo número no meio do
           caminho, restaurar por cima apagaria o trabalho novo. */
        if (atual.exists) return { ok: false, erro: 'já existe um registro com este número — restaurar apagaria o atual' };
        return _db.collection(it.colecao).doc(it.docId).set(it.dados).then(function () {
          return lref.update({ restaurado: true, restauradoPor: _quem, restauradoEm: _agora() })
            .catch(function () { /* o que importa já voltou */ })
            .then(function () {
              NH.registrar({
                acao: 'restaurou', onde: it.colecao, alvo: it.docId,
                rotulo: it.rotulo, copia: String(lixeiraId)
              });
              return { ok: true };
            });
        });
      });
    }).catch(function (e) {
      return { ok: false, erro: e && e.message || String(e) };
    });
  };

  /** Apaga um item da lixeira PARA SEMPRE.
   *
   *  É a única operação de todo o sistema que perde dado sem volta —
   *  por isso a regra do Firestore a restringe ao sócio, e por isso ela
   *  deixa rastro: some o dado, fica o registro de que alguém o
   *  destruiu, com nome e hora. A trilha sobrevive ao que ela descreve.
   */
  NH.apagarDaLixeira = function (lixeiraId) {
    if (!_ligado) return Promise.reject(new Error('auditoria não iniciada'));
    var lref = _db.collection('lixeira').doc(String(lixeiraId));
    return lref.get().then(function (snap) {
      if (!snap.exists) return { ok: false, erro: 'este item já não está na lixeira' };
      var it = snap.data();
      return lref.delete().then(function () {
        NH.registrar({
          acao: 'destruiu', onde: it.colecao || 'lixeira', alvo: it.docId || String(lixeiraId),
          rotulo: it.rotulo || '(sem nome)'
        });
        return { ok: true };
      });
    }).catch(function (e) {
      var m = e && e.message || String(e);
      /* A regra recusa para quem não é sócio. Vale traduzir, senão a
         pessoa lê "Missing or insufficient permissions" e acha que o
         sistema quebrou. */
      if (/permission|insufficient/i.test(m))
        return { ok: false, erro: 'apagar da lixeira é só de sócio' };
      return { ok: false, erro: m };
    });
  };

  /* ── Leitura, para a tela de Atividade ─────────────────────────── */

  NH.listar = function (limite) {
    if (!_ligado) return Promise.resolve([]);
    return _db.collection('auditoria').orderBy('quando', 'desc')
      .limit(limite || 400).get()
      .then(function (s) {
        return s.docs.map(function (d) {
          var o = d.data(); o.id = d.id; return o;
        });
      });
  };

  NH.listarLixeira = function (limite) {
    if (!_ligado) return Promise.resolve([]);
    return _db.collection('lixeira').orderBy('excluidoEm', 'desc')
      .limit(limite || 200).get()
      .then(function (s) {
        return s.docs.map(function (d) {
          var o = d.data(); o.id = d.id; return o;
        });
      });
  };

})(window);


