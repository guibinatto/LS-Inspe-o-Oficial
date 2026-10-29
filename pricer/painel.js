/* LS Pricer — painel da tela inicial: propostas por etapa, valores, margem, prazos, descontos e previsto × realizado.
   Tudo é calculado das propostas, aprovações, baixas e pendências que o app já guarda; as fórmulas estão no próprio painel. */
(function () {
  'use strict';
  const DIA = 864e5;
  window.PricerPainel = function (ctx) {
    const { REG, esc, brl, pct, ui } = ctx;
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const divOf = (p) => (p.div === 'SPV' ? 'SPV' : 'SEQ');
    const criada = (p) => Date.parse(p.criadaEm || p.at);
    const media = (L) => (L.length ? L.reduce((t, x) => t + x, 0) / L.length : null);
    const dias = (v) => (v === null ? '—' : v < 1 ? 'menos de 1 dia' : Math.round(v) + (Math.round(v) === 1 ? ' dia' : ' dias'));
    // em que etapa a proposta está (uma só por proposta)
    function etapa(p) {
      const MG = ctx.MG(); const F = MG.fechDe(p.id); const st = p.status || 'rascunho';
      if (st === 'perdida') return 'perdida';
      if (F || st === 'ganha') return 'ganha';
      const ap = MG.aprovDe(p.id); if (ap && MG.estadoA(ap) === 'pendente') return 'aprovacao';
      if (st === 'enviada' || st === 'negociacao') return 'enviada';
      return 'rascunho';
    }
    const ETAPAS = [['rascunho', 'Em elaboração'], ['aprovacao', 'Em aprovação'], ['enviada', 'Enviada ao cliente'], ['ganha', 'Ganha'], ['perdida', 'Perdida']];
    const PERIODOS = [['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['tudo', 'Todo o período']];
    function dados() {
      const MG = ctx.MG(); const f = Object.assign({ per: '90', div: 'todas' }, ui.pnl || {});
      const desde = f.per === 'tudo' ? 0 : Date.now() - (+f.per) * DIA;
      const base = (REG.listPropostas() || []).filter((p) => (f.div === 'todas' || divOf(p) === f.div) && criada(p) >= desde);
      const porEtapa = Object.fromEntries(ETAPAS.map(([k]) => [k, { n: 0, v: 0 }]));
      for (const p of base) { const e = porEtapa[etapa(p)]; e.n++; e.v += num(p.total); }
      const ganhas = porEtapa.ganha.n, perdidas = porEtapa.perdida.n;
      // margem ponderada: soma das margens ÷ soma das receitas líquidas (venda sem IPI − impostos), a mesma base da margem de cada proposta
      const comR = base.filter((p) => p.resumo && typeof p.resumo.margem === 'number' && num(p.resumo.venda) - num(p.resumo.impostos) > 0);
      const somaM = comR.reduce((t, p) => t + p.resumo.margem, 0), somaB = comR.reduce((t, p) => t + num(p.resumo.venda) - num(p.resumo.impostos), 0);
      const elab = base.filter((p) => p.etapas && p.etapas.cliente && p.etapas.cliente.at && p.criadaEm).map((p) => (Date.parse(p.etapas.cliente.at) - Date.parse(p.criadaEm)) / DIA).filter((x) => x >= 0);
      const negoc = base.map((p) => ({ p, F: MG.fechDe(p.id) })).filter((x) => x.F && x.F.fechadoEm && x.p.etapas && x.p.etapas.cliente).map((x) => (Date.parse(x.F.fechadoEm + 'T12:00') - Date.parse(x.p.etapas.cliente.at)) / DIA).filter((x) => x >= 0);
      const ids = new Set(base.map((p) => p.id));
      const aps = MG.listaAprov().filter((a) => ids.has(a.propId || a.id));
      const decididas = aps.filter((a) => ['aprovada', 'reprovada'].includes(MG.estadoA(a)));
      const tAprov = decididas.map((a) => { const ds = Object.values(MG.decs(a)).map((d) => Date.parse(d.at)).filter(isFinite); return ds.length ? (Math.max(...ds) - Date.parse(a.at)) / DIA : null; }).filter((x) => x !== null && x >= 0);
      const comAlvo = aps.filter((a) => a.alvo && a.alvo.k);
      const fech = MG.lista().filter((F) => ids.has(F.propId || F.id)).map((F) => { try { return MG.realizado(F); } catch (e) { return null; } }).filter((R) => R && R.apontadas > 0 && R.base);
      const prevM = fech.reduce((t, R) => t + num(R.margem), 0), realM = fech.reduce((t, R) => t + num(R.margemReal), 0), baseR = fech.reduce((t, R) => t + num(R.base), 0);
      return { f, base, porEtapa, ganhas, perdidas, conv: ganhas + perdidas ? ganhas / (ganhas + perdidas) : null, margem: somaB ? somaM / somaB : null, nMargem: comR.length,
        elab: media(elab), nElab: elab.length, negoc: media(negoc), nNegoc: negoc.length, tAprov: media(tAprov), nAprov: decididas.length, aps: aps.length,
        descMedio: media(comAlvo.map((a) => 1 - a.alvo.k)), nDesc: comAlvo.length, aprovadas: aps.filter((a) => MG.estadoA(a) === 'aprovada').length,
        prev: baseR ? prevM / baseR : null, real: baseR ? realM / baseR : null, nReal: fech.length, pend: ctx.PN().resumo() };
    }
    function vPainel() {
      const d = dados(); const f = d.f; const tot = d.base.reduce((t, p) => t + num(p.total), 0); const maxV = Math.max(1, ...ETAPAS.map(([k]) => d.porEtapa[k].n));
      const opt = (L, cur) => L.map(([k, t]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
      const kpi = (lb, v, em, cls) => `<div class="kpi"><span>${lb}</span><b class="${cls || ''}">${v}</b><em>${em}</em></div>`;
      const barras = ETAPAS.map(([k, lb]) => { const e = d.porEtapa[k]; return `<button class="pnlbar" data-pnletapa="${k}" title="${esc(lb)}: ${e.n} proposta(s) · ${esc(brl(e.v))} — clique para ver a lista">
        <span class="pnll">${esc(lb)}</span><span class="pnlt"><span class="pnlf ${k}" style="width:${e.n ? Math.max(2, e.n / maxV * 100) : 0}%"></span></span><span class="pnlv"><b>${e.n}</b> · ${esc(brl(e.v))}</span></button>`; }).join('');
      return `<details class="card painel"${ui.painelFechado ? '' : ' open'} id="painel"><summary><h2 style="display:inline">Painel <span class="sub">${d.base.length} proposta(s) no período · ${esc(brl(tot))}</span></h2></summary>
        <div class="pnfil" style="margin-top:8px"><select data-pnl="per" aria-label="Período">${opt(PERIODOS, f.per)}</select><select data-pnl="div" aria-label="Divisão">${opt([['todas', 'SEQ e SPV'], ['SEQ', 'Só SEQ'], ['SPV', 'Só SPV']], f.div)}</select></div>
        ${d.base.length ? `<div class="pnlbars" role="list" aria-label="Propostas por etapa">${barras}</div>
        <div class="kpis">
          ${kpi('Valor das propostas', esc(brl(tot)), d.base.length + ' proposta(s) criadas no período')}
          ${kpi('Conversão', d.conv === null ? '—' : pct(d.conv, 0), d.ganhas + ' ganha(s) de ' + (d.ganhas + d.perdidas) + ' decidida(s)')}
          ${kpi('Margem média ponderada', d.margem === null ? '—' : pct(d.margem, 1), d.nMargem + ' proposta(s) com resumo')}
          ${kpi('Prazo médio de elaboração', esc(dias(d.elab)), d.nElab ? 'da criação ao envio · ' + d.nElab + ' proposta(s)' : 'nenhuma enviada no período')}
          ${kpi('Tempo de aprovação', esc(dias(d.tAprov)), d.nAprov ? 'do pedido à decisão · ' + d.nAprov + ' pedido(s)' : 'nenhuma decidida')}
          ${kpi('Do envio à baixa', esc(dias(d.negoc)), d.nNegoc ? d.nNegoc + ' fechada(s)' : 'nenhuma fechada')}
          ${kpi('Descontos pedidos', d.aps ? d.aps + ' pedido(s)' : '—', d.nDesc ? 'desconto médio ' + pct(d.descMedio, 1) + ' · ' + d.aprovadas + ' aprovado(s)' : 'nenhum com valor target')}
          ${kpi('Margem prevista × realizada', d.nReal ? pct(d.prev, 1) + ' → ' + pct(d.real, 1) : '—', d.nReal ? d.nReal + ' obra(s) com custo real lançado' : 'sem custo real lançado', d.nReal && d.real < d.prev - 5e-4 ? 'bad-t' : '')}
        </div>
        <p class="sub" style="margin:8px 0 0">Pendências em acompanhamento: <b>${d.pend.abertas}</b> aberta(s) · <b class="${d.pend.vencidas ? 'bad-t' : ''}">${d.pend.vencidas}</b> vencida(s) · <b class="${d.pend.impeditivas ? 'bad-t' : ''}">${d.pend.impeditivas}</b> impeditiva(s) · <button class="restore" data-view="pendencias">abrir</button></p>` : `<p class="sub" style="margin:8px 0 0">Nenhuma proposta ${f.div === 'todas' ? '' : f.div + ' '}criada neste período. Escolha um período maior ou comece uma proposta abaixo.</p>`}
        <details style="margin-top:8px"><summary class="sub">Como cada número é calculado</summary><ul class="sub pnlform">
          <li><b>Período</b>: propostas criadas no período (data de criação; nas anteriores à REV22, a data da última gravação). Divisão: SEQ ou SPV.</li>
          <li><b>Etapas</b>: cada proposta conta uma vez — perdida; ganha (status ganha ou baixa registrada); em aprovação (pedido de aprovação pendente); enviada ao cliente; senão, em elaboração. Valor = soma do total salvo (com IPI).</li>
          <li><b>Conversão</b> = ganhas ÷ (ganhas + perdidas), só das propostas do período.</li>
          <li><b>Margem média ponderada</b> = Σ margem líquida (R$) ÷ Σ (venda sem IPI − impostos), a mesma base da margem de cada proposta. Propostas grandes pesam mais.</li>
          <li><b>Prazo médio de elaboração</b> = média de (data de "enviada ao cliente" − data de criação), em dias corridos.</li>
          <li><b>Tempo de aprovação</b> = média de (última decisão válida − data do pedido). <b>Do envio à baixa</b> = média de (data da baixa − data do envio).</li>
          <li><b>Descontos</b>: pedidos de aprovação do período; desconto médio = média de (1 − valor target ÷ valor da proposta no pedido).</li>
          <li><b>Prevista × realizada</b>: obras com custo real lançado; Σ margem ÷ Σ receita líquida, com o custo previsto na baixa e com o custo real.</li>
          <li><b>Pendências</b>: do acompanhamento (todas as propostas, sem filtro de período). Vencida = aberta com prazo antes de hoje.</li></ul></details></details>`;
    }
    document.addEventListener('change', (e) => { const t = e.target.closest('[data-pnl]'); if (!t) return; ui.pnl = Object.assign({ per: '90', div: 'todas' }, ui.pnl || {}, { [t.dataset.pnl]: t.value }); ctx.render(); });
    document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'painel') ui.painelFechado = !e.target.open; }, true);
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-pnletapa]'); if (!b) return; const map = { rascunho: 'abertas', aprovacao: 'aprovacao', enviada: 'abertas', ganha: 'fechadas', perdida: 'perdidas' }; ui.homeDiv = map[b.dataset.pnletapa] || 'todas'; ctx.render(); const t = document.querySelector('.hchips'); if (t) t.scrollIntoView({ block: 'center' }); });
    return { vPainel, dados, etapa };
  };
})();
