/* LS Pricer — conferência do PDF da proposta comercial contra a formação.
 * Lê o PDF no navegador (texto ou reconhecimento de texto), confere cabeçalho, valores, especificações e escopo.
 * Tudo certo: salva o PDF nos documentos da formação e marca a proposta como conferida.
 * Divergência: aponta o que corrigir; dá para aceitar com justificativa.
 */
(function () {
  'use strict';
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/³/g, '3').replace(/[^A-Z0-9%.,/@\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compacto = (s) => norm(s).replace(/[\s.\-/]+/g, '');
  const PARADAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'PARA', 'A', 'O', 'EM', 'LTDA', 'S', 'SA', 'S/A', 'ME', 'EIRELI', 'LS', 'FIRE', 'COMBATE', 'INCENDIO', '—', '-']);
  const moedas = (txt) => (String(txt).match(/\d{1,3}(?:\.\d{3})+,\d{2}|\b\d+,\d{2}\b/g) || []).map((x) => parseFloat(x.replace(/\./g, '').replace(',', '.')));
  // tokens técnicos que precisam aparecer: potência, rotação, vazão, pressão, modelo, norma
  function tokensTecnicos(s) {
    const T = new Set(); const t = norm(s);
    for (const m of t.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(HP|RPM|CV|MCA|USGPM|GPM|M3\/H)\b/g)) T.add(m[1] + ' ' + m[2]);
    for (const m of t.matchAll(/\b([A-Z]{2,4})\s?(\d{2,3}-\d{2,4})\b/g)) T.add(m[1] + ' ' + m[2]);
    for (const m of t.matchAll(/\b(NFPA|NBR)\s?(\d{2,5})\b/g)) T.add(m[1] + m[2]);
    for (const k of ['DIESEL', 'JOCKEY', 'SPLIT CASE', 'END SUCTION', 'MONOBLOCO', 'RADIADOR', 'TROCADOR', 'SKID', 'CONTAINER']) if (new RegExp('\\b' + k + '\\b').test(t)) T.add(k);
    return [...T];
  }
  const palavras = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length > 1 && !PARADAS.has(w)))];

  function Conferencia(ctx) {
    const { esc, brl, toast, modal, ui, REG } = ctx;
    const $ = (s, el = document) => el.querySelector(s);
    let ultimo = null; // { propId, rev, res, file }

    function achaTexto(NT, NC, tok) { const n = norm(tok); if (!n) return true; if (NT.includes(n)) return true; return NC.includes(compacto(tok)); }
    function cobertura(NT, NC, s) { const W = palavras(s); if (!W.length) return { pct: 1, falta: [] }; const falta = W.filter((w) => !achaTexto(NT, NC, w)); return { pct: 1 - falta.length / W.length, falta }; }
    const valorNoPdf = (vals, v, tol = 0.5) => typeof v === 'number' && v > 0 && vals.some((x) => Math.abs(x - v) <= tol);

    // monta e confere a lista; cada linha: grupo, o que, formação, situação (ok | erro | aviso), evidência
    function conferir(texto, F) {
      const NT = norm(texto), NC = compacto(texto), vals = moedas(texto); const out = [];
      const add = (grupo, oque, formacao, st, pdf) => out.push({ grupo, oque, formacao, st, pdf: pdf || '' });
      const maior = vals.length ? Math.max(...vals) : null;
      // cabeçalho
      if (F.cliente) { const c = cobertura(NT, NC, F.cliente); add('Cabeçalho', 'Cliente', F.cliente, c.pct >= 0.7 ? 'ok' : 'erro', c.pct >= 0.7 ? '' : 'não achei: ' + c.falta.join(', ')); }
      if (F.numero) { const parts = String(F.numero).split(/[^0-9.]+/).filter((x) => x.replace(/\D/g, '').length >= 3); const ok = parts.length && parts.every((x) => NT.includes(x) || NC.includes(x.replace(/\D/g, ''))); add('Cabeçalho', 'Nº da proposta', F.numero, ok ? 'ok' : 'erro', ok ? '' : 'número não encontrado no PDF'); }
      if (F.rev != null) { const n = +F.rev; const ok = new RegExp('\\b(REV|REVISAO|R)\\s*\\.?\\s*0*' + n + '\\b').test(NT); add('Cabeçalho', 'Revisão', 'Rev. ' + n, ok ? 'ok' : 'erro', ok ? '' : (NT.match(/\b(REV|REVISAO)\s*\.?\s*\d+/g) || []).slice(0, 2).join(' / ') || 'revisão não encontrada'); }
      if (F.pagamento) { const nums = (norm(F.pagamento).match(/\d+%?|\d+\s*DDL/g) || []); const falta = nums.filter((x) => !NT.includes(x) && !NC.includes(x.replace(/\s/g, ''))); const c = cobertura(NT, NC, F.pagamento); const ok = !falta.length && c.pct >= 0.6; add('Cabeçalho', 'Condição de pagamento', F.pagamento, ok ? 'ok' : 'erro', ok ? '' : 'não achei: ' + (falta.length ? falta.join(', ') : c.falta.slice(0, 5).join(', '))); }
      if (F.frete) { const k = /^CIF/.test(F.frete) ? 'CIF' : /^FOB/.test(F.frete) ? 'FOB' : ''; if (k) { const ok = NT.includes(k); const outro = k === 'CIF' ? 'FOB' : 'CIF'; add('Cabeçalho', 'Frete', F.frete, ok ? 'ok' : 'erro', ok ? '' : NT.includes(outro) ? 'no PDF está ' + outro : 'modalidade não encontrada'); } }
      if (F.norma) { const ok = achaTexto(NT, NC, F.norma); add('Cabeçalho', 'Norma', F.norma, ok ? 'ok' : 'erro', ok ? '' : 'norma não encontrada'); }
      // valores
      const okTot = F.totais.some((v) => valorNoPdf(vals, v)); add('Valores', 'Total da proposta', F.totais.map(brl).join(' ou '), okTot ? 'ok' : 'erro', okTot ? '' : maior ? 'maior valor no PDF: ' + brl(maior) : 'nenhum valor em R$ no PDF');
      // itens
      F.itens.forEach((it, i) => {
        const g = 'Item ' + String(i + 1).padStart(2, '0') + ' · ' + String(it.nome || '').slice(0, 40);
        const okV = it.valores.some((v) => valorNoPdf(vals, v)); add(g, 'Preço', it.valores.filter((v) => v > 0).map(brl).slice(0, 2).join(' ou ') + ' (unit. ou total, com ou sem IPI)', okV ? 'ok' : 'erro', okV ? '' : 'nenhum desses valores no PDF');
        if (it.qtd > 1) { const ok = new RegExp('\\b0*' + it.qtd + '([.,]0+)?\\s*(UN|UND|CJ|PC|CONJ|X)\\b|\\b' + it.qtd + '\\s*X\\b').test(NT) || NT.includes(' ' + it.qtd + ' '); add(g, 'Quantidade', String(it.qtd), ok ? 'ok' : 'aviso', ok ? '' : 'quantidade não identificada com certeza'); }
        for (const tk of it.tecnicos) { const ok = achaTexto(NT, NC, tk) || achaTexto(NT, NC, tk.replace(' ', '')); add(g, 'Especificação', tk, ok ? 'ok' : 'erro', ok ? '' : 'não está no PDF'); }
        if (it.descricao) { const c = cobertura(NT, NC, it.descricao); add(g, 'Descrição do equipamento', it.descricao, c.pct >= 0.8 ? 'ok' : c.pct >= 0.6 ? 'aviso' : 'erro', c.pct >= 0.8 ? '' : 'faltam: ' + c.falta.slice(0, 8).join(', ')); }
        // escopo: o PDF comercial descreve com outras palavras; aponta o que não aparece, sem travar
        if (it.escopo.length) { const nao = it.escopo.filter((e) => cobertura(NT, NC, e).pct < 0.6);
          add(g, 'Escopo', it.escopo.length + ' componente(s) de escopo', nao.length ? 'aviso' : 'ok', nao.length ? `${it.escopo.length - nao.length} de ${it.escopo.length} citados · não citados: ${nao.slice(0, 8).join('; ')}${nao.length > 8 ? '…' : ''}` : ''); }
      });
      return { linhas: out, erros: out.filter((x) => x.st === 'erro').length, avisos: out.filter((x) => x.st === 'aviso').length };
    }

    function vResultado(R, conf) {
      const icon = { ok: '<span class="ok-t">✓</span>', erro: '<span class="bad-t">✕</span>', aviso: '<span class="warn-t">!</span>' };
      const grupos = [...new Set(R.linhas.map((x) => x.grupo))]; const tudo = !!ui.confTudo; const nOk = R.linhas.filter((x) => x.st === 'ok').length;
      // por padrão só o que precisa de atenção; o que conferiu fica num clique
      const tabela = grupos.map((g) => { const L = R.linhas.filter((x) => x.grupo === g); const er = L.filter((x) => x.st === 'erro').length, av = L.filter((x) => x.st === 'aviso').length; const vis = tudo ? L : L.filter((x) => x.st !== 'ok');
        if (!vis.length && !tudo) return '';
        return `<tr class="grp"><td colspan="4">${esc(g)} ${er ? `<span class="pill bad">${er} a corrigir</span>` : ''}${av ? ` <span class="pill warn">${av} para conferir</span>` : ''}${!er && !av ? '<span class="pill ok">ok</span>' : ''}</td></tr>` + vis.map((x) => `<tr class="cf-${x.st}"><td style="width:24px">${icon[x.st]}</td><td>${esc(x.oque)}</td><td>${esc(x.formacao)}</td><td class="sub">${esc(x.pdf)}</td></tr>`).join(''); }).join('');
      const okGrupos = grupos.filter((g) => R.linhas.filter((x) => x.grupo === g).every((x) => x.st === 'ok'));
      return `${R.erros ? `<div class="banner bad" style="margin:0 0 8px"><b>${R.erros} ponto(s) a corrigir</b>${R.avisos ? ` e ${R.avisos} para conferir` : ''}. Corrija a proposta e confira de novo o PDF corrigido.</div>` : `<div class="banner ok" style="margin:0 0 8px"><b>Tudo confere com a formação.</b>${R.avisos ? ` ${R.avisos} ponto(s) para dar uma olhada.` : ''} ${conf ? 'PDF salvo nos documentos desta proposta.' : ''}</div>`}
        ${tabela ? `<div class="tw"><table class="t"><thead><tr><th></th><th>O que</th><th>Na formação</th><th>No PDF</th></tr></thead><tbody>${tabela}</tbody></table></div>` : ''}
        <p class="sub" style="margin:6px 0 0">${nOk} ponto(s) conferem${okGrupos.length && !tudo ? ' (' + esc(okGrupos.join(', ')) + ' sem nenhuma pendência)' : ''}. <button class="restore" data-conftudo>${tudo ? 'mostrar só o que precisa de atenção' : 'ver tudo o que foi conferido'}</button></p>`;
    }

    // quadro na Revisão
    function card(p, F) {
      const c = p && p.conferencia; const valida = c && ctx.conferidaOk(p);
      const st = !c ? '<span class="pill mute">não conferida</span>' : valida ? `<span class="pill ok">conferida ✓ ${esc(new Date(c.at).toLocaleDateString('pt-BR'))}${c.ressalva ? ' · com ressalva' : ''}</span>` : '<span class="pill warn">conferência desatualizada: a proposta mudou depois</span>';
      const res = ultimo && p && ultimo.propId === p.id && ultimo.rev === F.rev ? vResultado(ultimo.res, ultimo.salvo) : '';
      const aceitar = ultimo && p && ultimo.propId === p.id && ultimo.res.erros && !ultimo.salvo;
      return `<section class="card" id="confCard"><h2>Conferência do PDF da proposta <span class="sub">o app confere o PDF com a formação: valores, especificações e escopo</span></h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">${st}${c && c.docId ? ' <span class="sub">PDF salvo: ' + esc(c.arquivo || '') + '</span>' : ''}</div>
        ${p ? `<label class="drop" for="confUp"><b>Solte aqui o PDF da proposta comercial</b><span class="sub">ou clique para escolher. A leitura é feita neste navegador.</span><input type="file" id="confUp" accept="application/pdf,image/*" hidden></label>` : '<p class="sub" style="margin:0">Salve a proposta para conferir o PDF.</p>'}
        <p class="sub" id="confSt" style="margin:6px 0 0"></p>${res}
        ${aceitar ? '<div class="docbar" style="margin-top:8px"><button class="btn" data-confaceita>As divergências estão certas: aceitar e salvar o PDF</button></div>' : ''}</section>`;
    }

    async function rodar(file) {
      const p = ctx.propostaAtual(); if (!p) { toast('Salve a proposta antes de conferir'); return; }
      const F = ctx.formacao(); const st = (m) => { const el = $('#confSt'); if (el) el.textContent = m; };
      let linhas;
      try { linhas = await window.PricerLeitor.linhas(file, st); } catch (e) { st('Não consegui ler o PDF: ' + ((e && e.message) || e)); return; }
      const texto = (linhas || []).join('\n'); if (texto.replace(/\s/g, '').length < 40) { st('O PDF não tem texto legível.'); return; }
      const res = conferir(texto, F); ultimo = { propId: p.id, rev: F.rev, res, file, salvo: false };
      ctx.log({ tipo: 'Proposta — conferência do PDF', ref: p.id, desc: (p.numero || p.name || '') + ' rev. ' + F.rev + ': ' + (res.erros ? res.erros + ' divergência(s)' : 'confere') + ' · ' + file.name, mudancas: res.linhas.filter((x) => x.st === 'erro').slice(0, 20).map((x) => ({ campo: x.grupo + ' · ' + x.oque, de: x.formacao, para: x.pdf })) });
      if (!res.erros) await salvar(p, F, file, res, null); else { await marcar(p, F, { ok: false, erros: res.erros, arquivo: file.name }); ctx.render(); setTimeout(() => { const el = $('#confCard'); if (el) el.scrollIntoView({ block: 'start' }); }, 50); }
    }
    async function salvar(p, F, file, res, ressalva) {
      let docId = null;
      try { docId = await ctx.salvarDoc({ tipo: 'proposta', nome: file.name, propUid: p.uid || null, propNome: p.name || '', numero: (p.numero || '') + ' rev. ' + F.rev, notas: 'Proposta comercial conferida com a formação' + (ressalva ? ' — ressalva: ' + ressalva : ''), itens: [] }, file); }
      catch (e) { toast((e && e.message) || 'Não consegui salvar o PDF'); }
      await marcar(p, F, { ok: true, arquivo: file.name, docId, ressalva: ressalva || null, avisos: res.avisos });
      if (ultimo) ultimo.salvo = true;
      ctx.log({ tipo: 'Proposta — conferida', ref: p.id, desc: (p.numero || p.name || '') + ' rev. ' + F.rev + (ressalva ? ' com ressalva: ' + ressalva : '') + ' · PDF salvo: ' + file.name, mudancas: [] });
      toast(ressalva ? 'Aceito com ressalva e PDF salvo' : 'Confere! PDF salvo na formação'); ctx.render();
    }
    async function marcar(p, F, c) {
      const rec = Object.assign({}, p, { conferencia: Object.assign({ at: new Date().toISOString(), by: REG.me || null, rev: F.rev, total: F.totalRef }, c) }); delete rec.id; delete rec.local;
      try { await REG.saveProposta(p.id, rec); } catch (e) { toast((e && e.message) || 'Não consegui registrar a conferência'); }
    }
    document.addEventListener('click', (e) => { if (e.target.closest('[data-conftudo]')) { ui.confTudo = !ui.confTudo; ctx.render(); setTimeout(() => { const el = $('#confCard'); if (el) el.scrollIntoView({ block: 'start' }); }, 30); } });
    document.addEventListener('change', (e) => { if (e.target.id === 'confUp') { const f = e.target.files[0]; e.target.value = ''; if (f) rodar(f); } });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-confaceita]') || !ultimo) return;
      modal(`<h2>Aceitar as divergências</h2><p class="sub" style="margin:0">Fica registrado no histórico, com o seu nome.</p><div class="f"><label for="cfJus">Por que está certo assim?</label><input id="cfJus" placeholder="ex.: o PDF mostra o preço por conjunto; o escopo está descrito com outras palavras"></div><div style="display:flex;gap:8px"><button class="btn pri" id="cfOk">Aceitar e salvar o PDF</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#cfJus', o).focus();
        $('#cfOk', o).onclick = async () => { const j = $('#cfJus', o).value.trim(); if (!j) { toast('Escreva o motivo'); return; } close(); const p = ctx.propostaAtual(); if (!p) return; await salvar(p, ctx.formacao(), ultimo.file, ultimo.res, j); };
      });
    });
    return { card, conferir, tokensTecnicos };
  }
  window.PricerConferencia = Conferencia;
  window.PricerConferencia.tokensTecnicos = tokensTecnicos;
})();
