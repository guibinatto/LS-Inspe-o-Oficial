/* LS Pricer — acompanhamento de pendências.
   Cada coisa a resolver vira um registro com código, departamento, responsável, prazo, prioridade, criticidade e histórico.
   As que nascem da conferência da proposta são automáticas: a mesma falha é sempre a mesma pendência (sem duplicar)
   e ela se resolve sozinha quando a falha some da conferência. As manuais são abertas por qualquer pessoa da equipe. */
(function () {
  'use strict';
  const LSK = 'lspricer.pendencias.v1';
  const DEPTOS = ['Comercial', 'Diretoria Comercial', 'Engenharia', 'Compras/Custos', 'Financeiro/Fiscal'];
  // área da conferência → departamento que resolve
  const AREA_DEPTO = { 'Identificação': 'Comercial', 'Configuração': 'Engenharia', 'Custos': 'Compras/Custos', 'Fiscal e FCI': 'Financeiro/Fiscal', 'Margem e desconto': 'Diretoria Comercial', 'Aprovação': 'Diretoria Comercial', 'Documentos': 'Comercial', 'Integridade do cálculo': 'Engenharia' };
  const CRIT = [['impeditiva', 'Impeditiva', 'bad'], ['atencao', 'Atenção', 'warn'], ['informativa', 'Informativa', 'mute']];
  const DE_SEV = { imped: 'impeditiva', aviso: 'atencao', info: 'informativa' };
  const PRIOR = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];
  const STATUS = [['aberta', 'Aberta', 'warn'], ['andamento', 'Em andamento', 'warn'], ['resolvida', 'Resolvida', 'ok'], ['cancelada', 'Não se aplica', 'mute']];
  // prazo padrão a partir da criação, por criticidade (dias corridos)
  const PRAZO_DIAS = { impeditiva: 2, atencao: 5, informativa: 10 };
  const PRIOR_DE = { impeditiva: 'alta', atencao: 'media', informativa: 'baixa' };
  const lb = (L, k) => (L.find((x) => x[0] === k) || [k, k])[1];
  const cls = (L, k) => (L.find((x) => x[0] === k) || [k, k, 'mute'])[2];
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  const maisDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  // a mesma falha com outro número (ex.: "3 linhas" → "4 linhas") continua sendo a mesma pendência; o item (ITEM 02) não
  const chaveMsg = (m) => String(m || '').replace(/(ITEM \d\d)|\d+(?:[.,]\d+)*/g, (x, it) => it || '#').trim();

  window.PricerPendencias = function (ctx) {
    const { REG, esc, toast, modal, ui } = ctx;
    const $ = (s, r) => (r || document).querySelector(s);
    let lista = []; let sub = null; let carregado = false;
    const shared = () => REG.mode === 'shared' && REG.db;
    function ensure() {
      const m = shared() ? 'shared' : 'local'; if (sub === m || sub === 'shared') return; sub = m;
      if (m === 'shared') REG.db.collection('pendencias').orderBy('criadaEm', 'desc').limit(500).onSnapshot((s) => { carregado = true; lista = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); ctx.render(); }, () => {});
      else { lista = lerLocal(); carregado = true; }
    }
    function lerLocal() { try { return Object.entries(JSON.parse(localStorage.getItem(LSK) || '{}')).map(([id, x]) => Object.assign({ id }, x)); } catch (e) { return []; } }
    async function gravar(rec) {
      const body = JSON.parse(JSON.stringify(rec)); const id = body.id; delete body.id;
      if (shared()) { if (!REG.canSaveShared) throw new Error('Sem permissão para gravar pendências (acesso só de leitura).'); await REG.db.doc('pendencias/' + id).set(body); }
      else {
        let all = {}; try { all = JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (e) { all = {}; }
        all[id] = body; try { localStorage.setItem(LSK, JSON.stringify(all)); } catch (e) { throw new Error('O navegador não deixou gravar a pendência (sem espaço). Baixe um backup em Configurações → Backup e restauração.'); }
      }
      const i = lista.findIndex((x) => x.id === id); const rec2 = Object.assign({ id }, body); if (i >= 0) lista[i] = rec2; else lista.unshift(rec2);
    }
    // código legível e único sem contador central (dois usuários ao mesmo tempo não colidem)
    const novoCodigo = () => 'PND-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    // automáticas: o código sai da própria chave, então duas pessoas salvando ao mesmo tempo gravam a mesma pendência
    const codigoAuto = (chave) => { let h = 0x811c9dc5; for (let i = 0; i < chave.length; i++) { h ^= chave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'PND-A' + h.toString(36).toUpperCase().padStart(7, '0'); };
    const aberta = (p) => p.status === 'aberta' || p.status === 'andamento';
    const vencida = (p) => aberta(p) && p.prazo && p.prazo < hojeISO();
    const hist = (texto, campos) => ({ at: new Date().toISOString(), by: REG.me || null, texto, campos: campos || [] });
    const todas = () => { ensure(); return lista; };
    const daProposta = (propId) => todas().filter((p) => p.propId === propId);

    // sincroniza as automáticas de uma proposta com a conferência que acabou de ser feita (ao salvar)
    async function sincronizar(prop, itens) {
      if (!prop || !prop.id) return 0; ensure(); if (shared() && (!REG.canSaveShared || !carregado)) return 0; // sem a lista carregada, não dá para saber o que já existe
      const atuais = new Map(); for (const x of itens || []) { if (x.sev === 'info') continue; atuais.set(prop.id + '|' + x.area + '|' + chaveMsg(x.msg), x); }
      const minhas = lista.filter((p) => p.origem === 'auto' && p.propId === prop.id); let n = 0;
      for (const p of minhas) {
        const x = atuais.get(p.chave);
        if (!x) { if (aberta(p)) { await gravar(Object.assign({}, p, { status: 'resolvida', resolvidaEm: new Date().toISOString(), solucao: 'Resolvida automaticamente: a falha não aparece mais na conferência.', historico: (p.historico || []).concat(hist('Resolvida automaticamente (não aparece mais na conferência)')) })); n++; } continue; }
        const crit = DE_SEV[x.sev]; const mud = [];
        if (p.titulo !== x.msg) mud.push({ campo: 'Descrição', de: p.titulo, para: x.msg });
        if (p.criticidade !== crit) mud.push({ campo: 'Criticidade', de: lb(CRIT, p.criticidade), para: lb(CRIT, crit) });
        if (p.status === 'resolvida') { await gravar(Object.assign({}, p, { titulo: x.msg, criticidade: crit, status: 'aberta', resolvidaEm: null, solucao: '', historico: (p.historico || []).concat(hist('Reaberta: a falha voltou a aparecer na conferência', mud)) })); n++; }
        else if (aberta(p) && mud.length) { await gravar(Object.assign({}, p, { titulo: x.msg, criticidade: crit, historico: (p.historico || []).concat(hist('Atualizada pela conferência', mud)) })); n++; }
        // "não se aplica" (cancelada) com justificativa fica como está
        atuais.delete(p.chave);
      }
      for (const [chave, x] of atuais) {
        const crit = DE_SEV[x.sev];
        await gravar({ id: codigoAuto(chave), chave, origem: 'auto', propId: prop.id, propNome: [prop.numero, prop.cliente].filter(Boolean).join(' · '), item: (String(x.msg).match(/ITEM \d\d/) || [null])[0],
          titulo: x.msg, area: x.area, departamento: AREA_DEPTO[x.area] || 'Comercial', respId: null, respNome: '', prazo: maisDias(PRAZO_DIAS[crit]), prioridade: PRIOR_DE[crit], criticidade: crit,
          status: 'aberta', criadaEm: new Date().toISOString(), criadaPor: REG.me || null, solucao: '', historico: [hist('Gerada pela conferência da proposta')] });
        n++;
      }
      return n;
    }
    const codigoDe = (p) => p.codigo || p.id;

    // ---------- telas ----------
    const pill = (L, k) => `<span class="pill ${cls(L, k)}">${esc(lb(L, k))}</span>`;
    const resp = (p) => (p.respId ? `<span data-uid="${esc(p.respId)}">…</span>` : p.respNome ? esc(p.respNome) : '<span class="sub">sem responsável</span>');
    const prazoTxt = (p) => (p.prazo ? `<span class="${vencida(p) ? 'bad-t' : ''}">${esc(new Date(p.prazo + 'T12:00').toLocaleDateString('pt-BR'))}${vencida(p) ? ' · vencida' : ''}</span>` : '<span class="sub">—</span>');
    function linhas(L, comProposta) {
      return L.map((p) => `<tr class="${p.criticidade === 'impeditiva' && aberta(p) ? 'cf-erro' : vencida(p) ? 'cf-aviso' : ''}">
        <td><b>${esc(codigoDe(p))}</b><br><small class="sub">${p.origem === 'auto' ? 'automática' : 'manual'}</small></td>
        <td>${esc(p.titulo)}${comProposta && p.propNome ? `<br><small class="sub">${esc(p.propNome)}</small>` : ''}</td>
        <td>${esc(p.departamento)}<br><small>${resp(p)}</small></td><td>${prazoTxt(p)}<br><small class="sub">prioridade ${esc(lb(PRIOR, p.prioridade).toLowerCase())}</small></td>
        <td>${pill(CRIT, p.criticidade)}<br>${pill(STATUS, p.status)}</td>
        <td><button class="btn sm" data-pnabre="${esc(p.id)}">Abrir</button>${comProposta && p.propId ? ` <button class="restore" data-pnprop="${esc(p.propId)}">proposta</button>` : ''}</td></tr>`).join('');
    }
    const cab = '<thead><tr><th>Código</th><th>Pendência</th><th>Departamento · responsável</th><th>Prazo</th><th>Criticidade · situação</th><th></th></tr></thead>';
    function filtrar(L, f) {
      const q = String(f.q || '').toLowerCase();
      return L.filter((p) => (f.st === 'todas' || (f.st === 'abertas' && aberta(p)) || (f.st === 'vencidas' && vencida(p)) || (f.st === 'fechadas' && !aberta(p)))
        && (!f.dep || p.departamento === f.dep) && (!f.crit || p.criticidade === f.crit) && (!q || [codigoDe(p), p.titulo, p.propNome, p.respNome, p.departamento].join(' ').toLowerCase().includes(q)))
        .sort((a, b) => (aberta(b) - aberta(a)) || (vencida(b) - vencida(a)) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')) || String(b.criadaEm).localeCompare(String(a.criadaEm)));
    }
    function vLista() {
      const L = todas(); const f = Object.assign({ st: 'abertas', dep: '', crit: '', q: '' }, ui.pnFiltro || {});
      const F = filtrar(L, f); const ab = L.filter(aberta);
      const opt = (v, cur, txt) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(txt)}</option>`;
      return `<section class="card" id="pnAcomp"><h2>Acompanhamento <span class="sub">${ab.length} aberta(s) · ${L.filter(vencida).length} vencida(s) · ${ab.filter((p) => p.criticidade === 'impeditiva').length} impeditiva(s)</span></h2>
        <div class="pnfil"><select data-pnf="st" aria-label="Situação">${[['abertas', 'Abertas'], ['vencidas', 'Vencidas'], ['fechadas', 'Resolvidas e não se aplica'], ['todas', 'Todas']].map(([k, t]) => opt(k, f.st, t)).join('')}</select>
          <select data-pnf="dep" aria-label="Departamento">${opt('', f.dep, 'Todos os departamentos')}${DEPTOS.map((d) => opt(d, f.dep, d)).join('')}</select>
          <select data-pnf="crit" aria-label="Criticidade">${opt('', f.crit, 'Toda criticidade')}${CRIT.map(([k, t]) => opt(k, f.crit, t)).join('')}</select>
          <input type="search" data-pnf="q" placeholder="Buscar código, proposta, responsável…" value="${esc(f.q)}" aria-label="Buscar pendência"><button class="btn pri" data-pnnova>+ Nova pendência</button></div>
        ${F.length ? `<div class="tw"><table class="t">${cab}<tbody>${linhas(F.slice(0, 200), true)}</tbody></table></div>` : `<p class="sub" style="margin:8px 0 0">${L.length ? 'Nenhuma pendência com esses filtros.' : 'Nenhuma pendência registrada. As da conferência aparecem aqui quando uma proposta é salva com falhas; as manuais, pelo botão "+ Nova pendência".'}</p>`}
        <p class="sub" style="margin:8px 0 0">Automáticas nascem da conferência ao salvar a proposta e se resolvem sozinhas quando a falha some. Prazo padrão: impeditiva ${PRAZO_DIAS.impeditiva} dias, atenção ${PRAZO_DIAS.atencao}, informativa ${PRAZO_DIAS.informativa}.</p></section>`;
    }
    function cardProposta(propId, propNome) {
      if (!propId) return '';
      const L = daProposta(propId).sort((a, b) => (aberta(b) - aberta(a)) || String(b.criadaEm).localeCompare(String(a.criadaEm)));
      const ab = L.filter(aberta);
      return `<section class="card" id="pnProp"><h2>Pendências desta proposta <span class="sub">${ab.length} aberta(s)${L.length - ab.length ? ' · ' + (L.length - ab.length) + ' fechada(s)' : ''}</span></h2>
        ${ab.length ? `<div class="tw"><table class="t">${cab}<tbody>${linhas(ab, false)}</tbody></table></div>` : '<p class="sub" style="margin:0 0 8px">Nada em aberto.</p>'}
        <div class="docbar"><button class="btn" data-pnnova="${esc(propId)}" data-pnnome="${esc(propNome || '')}">+ Nova pendência</button>${L.length - ab.length ? '<button class="restore" data-pnver>ver todas no acompanhamento</button>' : ''}</div></section>`;
    }
    const resumo = () => { const L = todas(); return { abertas: L.filter(aberta).length, vencidas: L.filter(vencida).length, impeditivas: L.filter((p) => aberta(p) && p.criticidade === 'impeditiva').length, minhas: L.filter((p) => aberta(p) && p.respId && p.respId === REG.me).length }; };

    function form(p) {
      const opt = (L, cur) => L.map(([k, t]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
      return `<div class="fields">
        <div class="f span2 req"><label for="pnTit">Pendência</label><input id="pnTit" value="${esc(p.titulo || '')}" placeholder="ex.: confirmar com o cliente a pressão do ponto mais desfavorável"${p.origem === 'auto' ? ' readonly' : ''}></div>
        <div class="f"><label for="pnDep">Departamento</label><select id="pnDep">${opt(DEPTOS.map((d) => [d, d]), p.departamento)}</select></div>
        <div class="f"><label for="pnResp">Responsável</label><input id="pnResp" list="dl_pnresp" value="${esc(p.respNome || '')}" placeholder="${p.respId ? 'atribuída a uma pessoa da equipe' : 'nome'}">${REG.mode === 'shared' && REG.me ? `<datalist id="dl_pnresp">${[...new Set(lista.map((x) => x.respNome).filter(Boolean))].sort().map((x) => `<option value="${esc(x)}">`).join('')}</datalist><label class="chk" style="margin-top:4px"><input type="checkbox" id="pnEu"${p.respId === REG.me ? ' checked' : ''}> sou eu</label>` : ''}</div>
        <div class="f"><label for="pnPrazo">Prazo</label><input id="pnPrazo" type="date" value="${esc(p.prazo || '')}"></div>
        <div class="f"><label for="pnPri">Prioridade</label><select id="pnPri">${opt(PRIOR, p.prioridade)}</select></div>
        <div class="f"><label for="pnCrit">Criticidade</label><select id="pnCrit"${p.origem === 'auto' ? ' disabled title="vem da conferência"' : ''}>${opt(CRIT, p.criticidade)}</select></div>
        <div class="f"><label for="pnSt">Situação</label><select id="pnSt">${opt(STATUS, p.status)}</select></div>
        <div class="f span2"><label for="pnSol">Solução ou justificativa <small class="sub">(obrigatória para resolver ou marcar "não se aplica")</small></label><textarea id="pnSol" rows="2">${esc(p.solucao || '')}</textarea></div>
        <div class="f span2"><label for="pnCom">Comentário para o histórico</label><input id="pnCom" placeholder="opcional"></div></div>`;
    }
    function lerForm(o, p) {
      const v = (id) => ($('#' + id, o) ? $('#' + id, o).value.trim() : '');
      const eu = $('#pnEu', o); const out = { titulo: v('pnTit'), departamento: v('pnDep'), respNome: v('pnResp'), prazo: v('pnPrazo') || null, prioridade: v('pnPri'), criticidade: p.origem === 'auto' ? p.criticidade : v('pnCrit'), status: v('pnSt'), solucao: v('pnSol') };
      out.respId = eu ? (eu.checked ? REG.me : (p.respId === REG.me ? null : p.respId || null)) : p.respId || null;
      return { out, com: v('pnCom') };
    }
    const NOMES = { titulo: 'Pendência', departamento: 'Departamento', respNome: 'Responsável', respId: 'Responsável (equipe)', prazo: 'Prazo', prioridade: 'Prioridade', criticidade: 'Criticidade', status: 'Situação', solucao: 'Solução' };
    const fmtCampo = (k, v) => (k === 'status' ? lb(STATUS, v) : k === 'criticidade' ? lb(CRIT, v) : k === 'prioridade' ? lb(PRIOR, v) : k === 'respId' ? (v ? (v === REG.me ? 'você' : 'outra pessoa') : '—') : v || '—');
    function abrir(p, nova) {
      const histHtml = (p.historico || []).slice().reverse().map((h) => `<li><small class="sub">${esc(new Date(h.at).toLocaleString('pt-BR'))}${h.by ? ` · <span data-uid="${esc(h.by)}">…</span>` : ''}</small><br>${esc(h.texto)}${(h.campos || []).map((c) => `<br><small>${esc(c.campo)}: ${esc(String(c.de ?? '—'))} → <b>${esc(String(c.para ?? '—'))}</b></small>`).join('')}</li>`).join('');
      modal(`<h2>${nova ? 'Nova pendência' : esc(codigoDe(p))} ${nova ? '' : pill(STATUS, p.status)}</h2>
        ${p.propNome || p.propId ? `<p class="sub" style="margin:0">Proposta: ${esc(p.propNome || p.propId)}${p.item ? ' · ' + esc(p.item) : ''}${p.origem === 'auto' ? ' · gerada pela conferência (' + esc(p.area || '') + ')' : ''}</p>` : '<p class="sub" style="margin:0">Pendência geral (sem proposta).</p>'}
        ${form(p)}
        ${histHtml ? `<details><summary>Histórico (${(p.historico || []).length})</summary><ul class="pnhist">${histHtml}</ul></details>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="pnOk">${nova ? 'Abrir pendência' : 'Salvar'}</button>${!nova && p.propId ? `<button class="btn" data-pnprop="${esc(p.propId)}">Abrir a proposta</button>` : ''}<button class="btn" data-close>Fechar</button></div>`, (o, close) => {
        if (ctx.fillNames) ctx.fillNames(o);
        $('#pnOk', o).onclick = async () => {
          const { out, com } = lerForm(o, p);
          if (!out.titulo) { toast('Descreva a pendência'); $('#pnTit', o).focus(); return; }
          if (['resolvida', 'cancelada'].includes(out.status) && !out.solucao) { toast('Informe a solução ou a justificativa'); $('#pnSol', o).focus(); return; }
          const mud = Object.keys(NOMES).filter((k) => (p[k] ?? '') !== (out[k] ?? '')).map((k) => ({ campo: NOMES[k], de: nova ? null : fmtCampo(k, p[k]), para: fmtCampo(k, out[k]) }));
          if (!nova && !mud.length && !com) { close(); return; }
          const rec = Object.assign({}, p, out);
          if (['resolvida', 'cancelada'].includes(out.status) && !['resolvida', 'cancelada'].includes(p.status)) rec.resolvidaEm = new Date().toISOString();
          if (aberta(rec)) rec.resolvidaEm = null;
          rec.historico = (p.historico || []).concat(hist(nova ? 'Aberta' + (com ? ': ' + com : '') : (com || 'Alterada'), nova ? [] : mud));
          try { await gravar(rec); close(); toast(nova ? 'Pendência ' + codigoDe(rec) + ' aberta' : 'Pendência atualizada'); ctx.log && ctx.log({ tipo: 'Pendência', ref: rec.propId || rec.id, desc: codigoDe(rec) + ' — ' + rec.titulo + (nova ? ' (aberta)' : ''), mudancas: mud });
            ctx.render(); } catch (e) { toast(e.message || 'Não consegui gravar'); }
        };
      });
    }
    function nova(propId, propNome) {
      abrir({ id: novoCodigo(), origem: 'manual', propId: propId || null, propNome: propNome || '', titulo: '', departamento: 'Comercial', respId: null, respNome: '', prazo: maisDias(PRAZO_DIAS.atencao), prioridade: 'media', criticidade: 'atencao', status: 'aberta', criadaEm: new Date().toISOString(), criadaPor: REG.me || null, solucao: '', historico: [] }, true);
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-pnabre]'); if (a) { const p = todas().find((x) => x.id === a.dataset.pnabre); if (p) abrir(p, false); return; }
      const n = e.target.closest('[data-pnnova]'); if (n) { nova(n.dataset.pnnova || null, n.dataset.pnnome || ''); return; }
      const pr = e.target.closest('[data-pnprop]'); if (pr) { const ov = document.getElementById('overlay'); if (ov) ov.innerHTML = ''; const p = (REG.listPropostas() || []).find((x) => x.id === pr.dataset.pnprop); if (p && ctx.abrirProposta) ctx.abrirProposta(p, 5); else toast('Proposta não encontrada'); return; }
      if (e.target.closest('[data-pnver]')) { ui.view = 'pendencias'; ui.pnFiltro = Object.assign({}, ui.pnFiltro || {}, { st: 'todas' }); ctx.render(); window.scrollTo(0, 0); }
    });
    let tq;
    const onF = (e) => { const t = e.target.closest('[data-pnf]'); if (!t) return; ui.pnFiltro = Object.assign({ st: 'abertas' }, ui.pnFiltro || {}, { [t.dataset.pnf]: t.value });
      if (t.dataset.pnf === 'q') { clearTimeout(tq); tq = setTimeout(() => { ctx.render(); const i = document.querySelector('[data-pnf="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } else ctx.render(); };
    document.addEventListener('change', (e) => { if (e.target.closest('select[data-pnf]')) onF(e); });
    document.addEventListener('input', (e) => { if (e.target.closest('input[data-pnf]')) onF(e); });

    return { ensure, todas, daProposta, sincronizar, vLista, cardProposta, resumo, nova, abrir, aberta, vencida, DEPTOS, CRIT, STATUS, chaveMsg };
  };
})();
