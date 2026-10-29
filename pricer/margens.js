/* LS Pricer — registro de margens.
 * Fechamento ("dar baixa"): congela custos, impostos, comissões e margem de cada item e linha da proposta.
 * Painel: margens das propostas em aberto e fechadas, por divisão, família, pacote e item.
 * Realizado: custo real de compras e fabricação lançado por linha, comparado com o previsto.
 */
(function () {
  'use strict';
  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const ABERTAS = ['rascunho', 'enviada', 'negociacao'];
  const LSK = 'lspricer.fechamentos.v1';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let libP;
  const excelLib = () => { if (window.ExcelJS) return Promise.resolve(window.ExcelJS); libP = libP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = EXCELJS; s.onload = () => res(window.ExcelJS); s.onerror = () => { libP = null; rej(new Error('Não consegui carregar o gerador de Excel. Verifique a internet.')); }; document.head.appendChild(s); }); return libP; };

  function Margens(ctx) {
    const { REG, esc, brl, pct, NF, modal, toast, parseInput } = ctx;
    const $ = (s, el = document) => el.querySelector(s);
    const ui = ctx.ui;
    const shared = () => REG.mode === 'shared' && !!REG.db;
    // custo real: Engenharia (e Custos) preenchem
    const canReal = () => REG.areaOk('engenharia') || REG.areaOk('custos');
    const fmtD = (d) => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch (e) { return d || ''; } };
    const mi = (v) => (Math.abs(v) >= 1e6 ? 'R$ ' + NF[1].format(v / 1e6) + ' mi' : Math.abs(v) >= 1e3 ? 'R$ ' + NF[0].format(v / 1e3) + ' mil' : brl(v));

    // ---------- fechamentos: banco da equipe ou navegador ----------
    let fech = []; let sub = false;
    const lsGet = () => { try { return JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (e) { return {}; } };
    const lsSet = (o) => { try { localStorage.setItem(LSK, JSON.stringify(o)); } catch (e) { throw new Error('O navegador não deixou gravar a baixa (sem espaço). Baixe um backup e libere espaço.'); } };
    function ensure() {
      const m = shared() ? 'shared' : 'local'; if (sub === m || sub === 'shared') return; sub = m;
      if (m === 'shared') REG.db.collection('fechamentos').orderBy('fechadoEm', 'desc').limit(500).onSnapshot((s) => { fech = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); ctx.render(); }, () => {});
      else fech = Object.entries(lsGet()).map(([id, f]) => Object.assign({ id }, f));
    }
    async function gravar(id, rec) {
      const body = JSON.parse(JSON.stringify(rec)); delete body.id;
      if (shared()) await REG.db.doc('fechamentos/' + id).set(body);
      else { const all = lsGet(); all[id] = body; lsSet(all); fech = Object.entries(all).map(([k, f]) => Object.assign({ id: k }, f)); }
    }
    async function apagar(id) {
      if (shared()) await REG.db.doc('fechamentos/' + id).delete();
      else { const all = lsGet(); delete all[id]; lsSet(all); fech = Object.entries(all).map(([k, f]) => Object.assign({ id: k }, f)); }
    }
    const fechDe = (propId) => fech.find((f) => f.id === propId);
    // reabrir uma proposta ganha: desfaz a baixa, guarda uma cópia dela (com o custo real) na proposta e volta para Enviada ao cliente
    const podeReabrir = () => REG.mode === 'local' || !!REG.canEditCadastro;
    function reabrirModal(p) {
      const F = fechDe(p.id); if (!F) { toast('Esta proposta não tem baixa para desfazer'); return; }
      if (!podeReabrir()) { toast('Só quem tem acesso de Editor desfaz uma baixa'); return; }
      const R = realizado(F); const temReal = R && R.apontadas;
      modal(`<h2>Reabrir a proposta</h2>
        <p class="sub" style="margin:0">${esc(p.numero || p.name || '')} · ${esc(p.cliente || '')}. A baixa de ${esc(new Date(F.fechadoEm).toLocaleDateString('pt-BR'))} (${brl(F.valorFechado || R.venda || 0)}) é desfeita e a proposta volta para <b>Enviada ao cliente</b>. Uma cópia da baixa (com o custo real, se houver) fica guardada na proposta; o histórico registra quem reabriu e o motivo.</p>
        ${temReal ? `<div class="banner warn" style="margin:0">Esta baixa tem custo real lançado (${pct(R.cobertura, 0)} conferido). Ele sai das telas de Margens e fica só na cópia guardada.</div>` : ''}
        <div class="f"><label for="rbMot">Motivo</label><input id="rbMot" placeholder="ex.: cliente pediu nova revisão antes do pedido; baixa feita por engano"></div>
        <div style="display:flex;gap:8px"><button class="btn pri" id="rbOk">Reabrir</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#rbOk', o).onclick = async () => {
          const mot = $('#rbMot', o).value.trim(); if (!mot) { toast('Escreva o motivo'); return; }
          const copia = { em: new Date().toISOString(), por: REG.me || null, motivo: mot, baixa: JSON.parse(JSON.stringify(F)) };
          try {
            await REG.patchProposta(p.id, (r) => { r.baixasDesfeitas = (r.baixasDesfeitas || []).concat([copia]); r.status = 'enviada'; const e = Object.assign({}, r.etapas || {}); delete e.encerrada; r.etapas = e; });
            await apagar(F.id);
            ctx.log && ctx.log({ tipo: 'Baixa desfeita (proposta reaberta)', ref: p.id, desc: (p.numero || p.name || '') + ' · ' + (p.cliente || '') + ' — ' + mot, mudancas: [{ campo: 'Status', de: 'ganha', para: 'enviada' }, { campo: 'Valor fechado', de: F.valorFechado ?? null, para: null }] });
            close(); ui.mgId = null; ctx.render(); toast('Proposta reaberta: voltou para Enviada ao cliente');
          } catch (er) { toast(er.message || 'Não consegui reabrir'); }
        };
      });
    }
    // custo real só depois da baixa e com a proposta ganha (perdida ou reaberta não lança)
    // conferência do PDF vale para a revisão e o total que foram conferidos
    const revDeP = (q) => { const v = q.spv ? q.spv.revisao : q.facts ? q.facts.revisao : ((q.doc || {}).PROPOSTA || {}).C6; const n = parseInt(String(v ?? '0').replace(/\D/g, ''), 10); return isFinite(n) ? n : 0; };
    const conferidaOk = (p) => { const c = p && p.conferencia; return !!(c && c.ok && c.rev === revDeP(p) && Math.abs(num(c.total) - num(p.total)) < 1); };
    const liberaReal = (x) => { const id = typeof x === 'string' ? x : x && x.id; if (!id || !fechDe(id)) return false; const p = typeof x === 'object' && x.status !== undefined ? x : (REG.listPropostas() || []).find((y) => y.id === id); return !p || (p.status || 'ganha') === 'ganha'; };

    // ---------- contas: fechado (com o valor negociado) e realizado ----------
    // o valor fechado pode diferir do proposto: venda, impostos e comissões acompanham; o custo não muda
    // a margem líquida da formação é sobre a receita líquida (preço − impostos), não sobre o preço:
    // a base de cada fotografia sai dela mesma (margem ÷ margem %), proporcional ao preço
    const baseFrac = (x) => { const b = x.venda && x.margemPct && Math.abs(x.margemPct) > 1e-6 ? (num(x.margem) / x.margemPct) / x.venda : NaN; return isFinite(b) && b > 0.3 && b <= 1.0001 ? b : (x.venda ? (x.venda - num(x.impostos)) / x.venda : 1); };
    const mPct = (margem, venda, bf) => (venda ? margem / (venda * bf) : 0);
    function fechado(F) {
      const s = F.snap; const k = s.venda ? num(F.valorFechado || s.venda) / s.venda : 1;
      const itens = s.itens.map((x) => { const venda = x.venda * k, impostos = x.impostos * k, comissao = x.comissao * k, margem = venda - impostos - comissao - x.custo, bf = baseFrac(x); return Object.assign({}, x, { bf, venda, impostos, comissao, margem, margemPct: mPct(margem, venda, bf) }); });
      const sum = (f) => itens.reduce((t, x) => t + num(x[f]), 0); const venda = sum('venda'), margem = sum('margem');
      const base = itens.reduce((t, x) => t + x.venda * x.bf, 0);
      return { k, itens, venda, base, impostos: sum('impostos'), comissao: sum('comissao'), custo: sum('custo'), margem, margemPct: base ? margem / base : 0 };
    }
    function realizado(F) {
      const P = fechado(F); const R = F.real || {}; let lin = 0, ap = 0;
      const itens = P.itens.map((x) => {
        const r = R[x.n] || {}; let custoReal = 0, custoPrev = 0, apont = 0;
        const linhas = (x.linhas || []).map((l) => { const q = (r.l || {})[l.k]; lin++; const has = q && typeof q.v === 'number'; if (has) { ap++; apont++; } custoPrev += l.custo * x.qtd; const real = has ? q.v : null; custoReal += has ? real : l.custo * x.qtd;
          const qPrev = num(l.qtd) * (x.qtd || 1); const prev = l.custo * x.qtd; const uPrev = num(l.unit) || (qPrev ? prev / qPrev : prev);
          const qReal = has && typeof q.q === 'number' ? q.q : qPrev; const uReal = has ? (typeof q.u === 'number' ? q.u : (qReal ? real / qReal : real)) : uPrev;
          return Object.assign({}, l, { prev, real, qPrev, uPrev, qReal, uReal, obs: q && q.obs, doc: q && q.doc }); });
        // custos fora das linhas (fabricação, frete…) que não viraram linha
        const resto = Math.max(0, x.custo - custoPrev); custoReal += resto;
        const extras = (r.extras || []).filter((e) => typeof e.v === 'number'); custoReal += extras.reduce((t, e) => t + e.v, 0);
        const margem = x.venda - x.impostos - x.comissao - custoReal;
        return Object.assign({}, x, { linhas, extras, resto, custoReal, apont, margemReal: margem, margemRealPct: mPct(margem, x.venda, x.bf) });
      });
      const custoReal = itens.reduce((t, x) => t + x.custoReal, 0); const margem = P.venda - P.impostos - P.comissao - custoReal;
      return Object.assign({}, P, { itens, custoReal, margemReal: margem, margemRealPct: P.base ? margem / P.base : 0, linhas: lin, apontadas: ap, cobertura: lin ? ap / lin : 0 });
    }

    // ---------- dar baixa ----------
    function fecharModal(p, onDone) {
      ensure();
      if (!p || !p.id) return toast('Salve a proposta antes de dar baixa.');
      let snap;
      try { snap = ctx.snapshotOf(p); } catch (e) { return toast('Não consegui calcular esta proposta: ' + (e.message || e)); }
      if (!snap || !snap.itens.length) return toast('Esta proposta não tem itens com preço para fechar.');
      const ja = fechDe(p.id);
      modal(`<h2>Dar baixa: proposta fechada</h2>
        <p class="sub" style="margin:0">${esc((p.div || 'SEQ') + ' · ' + (p.numero || 'sem número') + ' · ' + (p.cliente || ''))}. A formação de hoje fica congelada: custos, impostos, comissões e margem de cada item e linha. Depois, Compras e Produção lançam o custo real.</p>
        ${ja ? '<div class="banner warn">Esta proposta já tem baixa. Confirmar substitui a fotografia anterior e apaga o custo real lançado.</div>' : ''}
        <div class="kpis"><div class="kpi"><span>Venda proposta (sem IPI)</span><b>${brl(snap.venda)}</b></div><div class="kpi"><span>Custo</span><b>${brl(snap.custo)}</b></div><div class="kpi lead"><span>Margem líquida</span><b>${pct(snap.margemPct, 1)}</b></div></div>
        <div class="fields">
          <div class="f"><label for="fcData">Data do fechamento</label><input id="fcData" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="f"><label for="fcPed">Pedido / OC do cliente</label><input id="fcPed" placeholder="nº do pedido"></div>
          <div class="f"><label for="fcVal">Valor fechado sem IPI (R$)</label><input id="fcVal" inputmode="decimal" value="${NF[2].format(snap.venda)}"></div>
          <div class="f spanall"><label for="fcObs">Observações da negociação</label><input id="fcObs" placeholder="desconto final, prazo, condição…"></div>
        </div>
        <p class="sub" id="fcPrev" style="margin:0"></p>
        <label class="chk"><input type="checkbox" id="fcXls" checked> Baixar a planilha do fechamento (custos, margens e impostos)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="fcOk">Dar baixa</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        const prev = () => { const v = parseInput($('#fcVal', o).value, 'num'); const F = { snap, valorFechado: typeof v === 'number' ? v : snap.venda }; const P = fechado(F);
          $('#fcPrev', o).innerHTML = Math.abs(P.k - 1) > 1e-6 ? `Com o valor fechado, a margem vai de ${pct(snap.margemPct, 1)} para <b>${pct(P.margemPct, 1)}</b> (${P.k < 1 ? 'desconto de ' + pct(1 - P.k, 1) : 'acréscimo de ' + pct(P.k - 1, 1)}).` : ''; };
        $('#fcVal', o).oninput = prev; prev();
        $('#fcOk', o).onclick = async () => {
          const v = parseInput($('#fcVal', o).value, 'num'); if (typeof v !== 'number' || v <= 0) { toast('Valor fechado inválido'); return; }
          const F = { propId: p.id, uid: p.uid || null, div: p.div || 'SEQ', tipo: p.tipo || null, numero: p.numero || '', cliente: p.cliente || '', nome: p.name || '', fechadoEm: $('#fcData', o).value || new Date().toISOString().slice(0, 10),
            at: new Date().toISOString(), by: REG.me || null, pedido: $('#fcPed', o).value.trim(), obs: $('#fcObs', o).value.trim(), vendaProposta: snap.venda, valorFechado: v, snap, real: {}, execucao: 'em andamento' };
          $('#fcOk', o).disabled = true; const querXls = $('#fcXls', o).checked;
          try {
            await gravar(p.id, F);
            ctx.log && ctx.log({ tipo: 'Baixa da proposta', ref: p.id, desc: (p.numero || p.name || '') + ' · ' + (p.cliente || ''), mudancas: [{ campo: 'Valor proposto', de: null, para: snap.venda }, { campo: 'Valor fechado', de: null, para: v }, { campo: 'Margem', de: snap.margemPct, para: fechado(F).margemPct }, { campo: 'Pedido', de: null, para: F.pedido || null }] });
            await REG.patchProposta(p.id, { status: 'ganha', resumo: ctx.resumoOf(snap) });
            if (!shared()) fech = Object.entries(lsGet()).map(([k, f]) => Object.assign({ id: k }, f));
            close(); toast('Baixa registrada: ' + (p.numero || p.name || 'proposta'));
            if (querXls) excel(Object.assign({ id: p.id }, F)).catch((e) => toast(e.message || 'Não consegui gerar o Excel'));
            // vai direto para a tela do custo real desta proposta
            ui.view = 'margens'; ui.mgId = p.id; ui.mgNova = p.id; onDone && onDone(); ctx.render(); window.scrollTo(0, 0);
            setTimeout(() => { const p2 = (REG.listPropostas() || []).find((x) => x.id === p.id) || Object.assign({}, p, { status: 'ganha' }); avisarModal(p2, ['financeiro', 'engenharia']); }, 400);
          } catch (e) { $('#fcOk', o).disabled = false; toast((e && e.message) || 'Não consegui registrar a baixa'); }
        };
      });
    }

    // ---------- gráficos (SVG, com dica ao passar o mouse) ----------
    const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    function hbars(rows, opt = {}) {
      const W = opt.w || 640;
      // rows: [{label, sub, vals:[number|null], tips:[string]}]; valores em fração (margem %)
      if (!rows.length) return '<p class="sub">Sem dados no filtro.</p>';
      const ns = opt.series ? opt.series.length : 1; const bh = ns > 1 ? 11 : 16; const gap = 2; const rowH = ns * bh + (ns - 1) * gap + 16;
      const L = 196, R = 92; const pw = W - L - R; const all = rows.flatMap((r) => r.vals.filter((v) => typeof v === 'number'));
      const lo = Math.min(0, ...all), hi = Math.max(0.05, ...all, opt.min || 0) * 1.05; const x = (v) => L + ((v - lo) / (hi - lo)) * pw;
      const H = rows.length * rowH + 26;
      let g = '';
      for (const t of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].filter((t) => t >= lo && t <= hi)) g += `<line x1="${x(t)}" x2="${x(t)}" y1="4" y2="${H - 20}" class="vz-grid"/><text x="${x(t)}" y="${H - 6}" class="vz-ax" text-anchor="middle">${NF[0].format(t * 100)}%</text>`;
      rows.forEach((r, i) => {
        const y0 = 6 + i * rowH;
        g += `<text x="${L - 8}" y="${y0 + (ns * bh + (ns - 1) * gap) / 2 + 4}" class="vz-lb" text-anchor="end">${esc(cut(r.label, 26))}</text>`;
        if (r.sub) g += `<text x="${L - 8}" y="${y0 + (ns * bh + (ns - 1) * gap) / 2 + 16}" class="vz-ax" text-anchor="end">${esc(cut(r.sub, 32))}</text>`;
        r.vals.forEach((v, k) => {
          if (typeof v !== 'number') return; const y = y0 + k * (bh + gap); const x0 = x(Math.min(0, v)), x1 = x(Math.max(0, v)); const w = Math.max(1, x1 - x0);
          const rad = Math.min(4, w / 2, bh / 2);
          const path = v >= 0 ? `M${x0},${y}h${w - rad}a${rad},${rad} 0 0 1 ${rad},${rad}v${bh - 2 * rad}a${rad},${rad} 0 0 1 -${rad},${rad}h-${w - rad}z` : `M${x1},${y}h-${w - rad}a${rad},${rad} 0 0 0 -${rad},${rad}v${bh - 2 * rad}a${rad},${rad} 0 0 0 ${rad},${rad}h${w - rad}z`;
          g += `<path d="${path}" class="vz-s${k + 1}${opt.min && v < opt.min ? ' vz-low' : ''}"/><rect x="${L}" y="${y - 1}" width="${pw}" height="${bh + 2}" fill="transparent" data-tip="${esc((r.tips && r.tips[k]) || '')}"/>`;
          if (!opt.noLabels) g += `<text x="${x(Math.max(0, v)) + 6}" y="${y + bh / 2 + 4}" class="vz-val">${NF[1].format(v * 100)}%${opt.min && v < opt.min ? ' ▼' : ''}</text>`;
        });
      });
      if (opt.min) g += `<line x1="${x(opt.min)}" x2="${x(opt.min)}" y1="2" y2="${H - 20}" class="vz-min"/><text x="${x(opt.min) + 4}" y="12" class="vz-ax">mínimo ${NF[0].format(opt.min * 100)}%</text>`;
      g += `<line x1="${x(0)}" x2="${x(0)}" y1="2" y2="${H - 20}" class="vz-base"/>`;
      const legend = opt.series && opt.series.length > 1 ? `<div class="vz-legend">${opt.series.map((s, k) => `<span><i class="vz-k${k + 1}"></i>${esc(s)}</span>`).join('')}</div>` : '';
      return `${legend}<svg class="vz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || 'gráfico de margens')}">${g}</svg>`;
    }
    let tipEl;
    document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t || !t.dataset.tip) { if (tipEl) tipEl.hidden = true; return; } if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'vz-tip'; document.body.appendChild(tipEl); } tipEl.textContent = t.dataset.tip; tipEl.hidden = false; });
    document.addEventListener('mousemove', (e) => { if (tipEl && !tipEl.hidden) { tipEl.style.left = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 14) + 'px'; tipEl.style.top = (e.clientY + 14) + 'px'; } });

    // ---------- dados do painel ----------
    function base() {
      const per = ui.mgPer || '12m'; const dv = ui.mgDiv || 'todas'; const now = Date.now();
      const inPer = (d) => { const t = Date.parse(d); if (!isFinite(t)) return true; if (per === '12m') return t > now - 365 * 864e5; if (per === 'ano') return new Date(t).getFullYear() === new Date().getFullYear(); return true; };
      const props = (REG.listPropostas() || []).filter((p) => dv === 'todas' || (p.div || 'SEQ') === dv);
      const abertas = props.filter((p) => ABERTAS.includes(p.status || 'rascunho') && p.resumo && p.resumo.venda > 0 && inPer(p.at));
      const semResumo = props.filter((p) => ABERTAS.includes(p.status || 'rascunho') && !(p.resumo && p.resumo.venda > 0)).length;
      const fechadas = fech.filter((f) => (dv === 'todas' || f.div === dv) && inPer(f.fechadoEm)).map((f) => Object.assign({ F: f }, realizado(f)));
      return { abertas, fechadas, semResumo };
    }
    const wavg = (list, vf, mf) => { const v = list.reduce((t, x) => t + num(vf(x)), 0); return v ? list.reduce((t, x) => t + num(mf(x)), 0) / v : null; };
    function grupo(entries, keyF, labelF) {
      const m = new Map();
      for (const e of entries) { const k = keyF(e); if (!m.has(k)) m.set(k, { k, label: labelF(e), venda: 0, margem: 0, n: 0, min: e.min }); const g = m.get(k); g.venda += e.venda; g.margem += e.margem; g.n++; }
      return [...m.values()].map((g) => Object.assign(g, { pct: g.venda ? g.margem / g.venda : 0 })).sort((a, b) => b.venda - a.venda);
    }

    // ---------- painel ----------
    function vMargens() {
      ensure();
      if (ui.mgId) return vDetalhe(ui.mgId);
      if (!veComercial()) return vFilaReal();
      ensureA(); if ((ui.mgTab || 'painel') === 'aprovacoes' && ui.apId) return vAprovDetalhe(ui.apId);
      const nAp = aprov.filter((a) => estadoA(a) === 'pendente').length;
      const B = base(); const tab = ui.mgTab || 'painel';
      const itAb = B.abertas.flatMap((p) => (p.resumo.itens || []).map((x) => ({ div: p.div || 'SEQ', fam: x.familia, famNome: x.familiaNome || x.familia, nome: x.nome, venda: num(x.venda), margem: num(x.margem), min: num(p.resumo.minimo), pac: p })));
      const itFe = B.fechadas.flatMap((f) => f.itens.map((x) => ({ div: f.F.div, fam: x.familia, famNome: x.familiaNome || x.familia, nome: x.nome, venda: x.venda, margem: x.margem, margemReal: x.margemReal, min: num(f.F.snap.minimo), pac: f })));
      const vAb = B.abertas.reduce((t, p) => t + num(p.resumo.venda), 0); const mAb = wavg(B.abertas, (p) => p.resumo.venda, (p) => p.resumo.margem);
      const vFe = B.fechadas.reduce((t, f) => t + f.venda, 0); const mFe = wavg(B.fechadas, (f) => f.venda, (f) => f.margem);
      const comReal = B.fechadas.filter((f) => f.apontadas > 0); const mRe = wavg(comReal, (f) => f.venda, (f) => f.margemReal); const mPrevRe = wavg(comReal, (f) => f.venda, (f) => f.margem);
      const baixo = B.abertas.filter((p) => p.resumo.minimo && p.resumo.margemPct < p.resumo.minimo).length;
      const sel = (id, v, opts) => `<select id="${id}" aria-label="${id}">${opts.map(([k, l]) => `<option value="${k}"${v === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
      const filtros = `<div class="sheetbar">${sel('mgPer', ui.mgPer || '12m', [['12m', 'Últimos 12 meses'], ['ano', 'Este ano'], ['tudo', 'Tudo']])}${sel('mgDiv', ui.mgDiv || 'todas', [['todas', 'SEQ e SPV'], ['SEQ', 'Só SEQ'], ['SPV', 'Só SPV']])}
        <div class="hchips" style="margin-left:auto">${[['painel', 'Painel'], ['fechadas', `Ganhas (${B.fechadas.length})`], ['abertas', `Em andamento (${B.abertas.length})`], ['aprovacoes', `Aprovações${nAp ? ' (' + nAp + ' pendente' + (nAp > 1 ? 's' : '') + ')' : ''}`]].map(([k, l]) => `<button class="hchip${tab === k ? ' on' : ''}" data-mgtab="${k}">${l}</button>`).join('')}</div></div>`;
      const kpis = `<div class="kpis">
        <div class="kpi"><span>Em andamento</span><b>${mi(vAb)}</b><em>${B.abertas.length} proposta(s) · margem ${mAb === null ? '—' : pct(mAb, 1)}</em></div>
        <div class="kpi"><span>Ganhas</span><b>${mi(vFe)}</b><em>${B.fechadas.length} pacote(s) · margem fechada ${mFe === null ? '—' : pct(mFe, 1)}</em></div>
        <div class="kpi lead"><span>Margem realizada</span><b>${mRe === null ? '—' : pct(mRe, 1)}</b><em>${comReal.length ? `${comReal.length} pacote(s) com custo real · previsto ${pct(mPrevRe, 1)} (${mRe - mPrevRe >= 0 ? '+' : '−'}${NF[1].format(Math.abs(mRe - mPrevRe) * 100)} p.p.)` : 'lance o custo real nas fechadas'}</em></div>
        <div class="kpi"><span>Abaixo do mínimo</span><b>${baixo}</b><em>propostas em aberto</em></div></div>
        ${B.semResumo ? `<div class="banner info">${B.semResumo} proposta(s) em aberto foram salvas antes do registro de margens. <button class="restore" data-mgcalc>Calcular as margens delas agora</button></div>` : ''}`;
      const fila = B.fechadas.filter((f) => f.cobertura < 1 && liberaReal(f.F.id)).sort((a, b) => String(b.F.fechadoEm).localeCompare(String(a.F.fechadoEm))).slice(0, 6);
      const filaHtml = fila.length ? `<section class="card"><h2>Custo real a lançar <span class="sub">fechadas com linhas sem custo real</span></h2><div class="tw"><table class="t"><tbody>${fila.map((f) => `<tr><td><span class="divb ${f.F.div.toLowerCase()}">${f.F.div}</span> <b>${esc(f.F.numero || '—')}</b> <span class="sub">${esc(f.F.cliente || '')} · fechada em ${fmtD(f.F.fechadoEm)}</span></td><td class="n">${pct(f.cobertura, 0)} conferido</td><td style="text-align:right"><button class="btn sm pri" data-mgopen="${esc(f.F.id)}">Lançar custo real</button></td></tr>`).join('')}</tbody></table></div></section>` : '';
      let body = filaHtml;
      if (tab === 'aprovacoes') body = vAprovacoes(); else
      if (tab === 'painel') {
        const divs = ['SEQ', 'SPV'].map((d) => { const a = itAb.filter((x) => x.div === d), f = itFe.filter((x) => x.div === d); const pa = wavg(a, (x) => x.venda, (x) => x.margem), pf = wavg(f, (x) => x.venda, (x) => x.margem);
          return { label: d, sub: `${mi(a.reduce((t, x) => t + x.venda, 0))} · ${mi(f.reduce((t, x) => t + x.venda, 0))}`, vals: [pa, pf], tips: [`${d} em aberto: margem ${pa === null ? '—' : pct(pa, 1)} sobre ${brl(a.reduce((t, x) => t + x.venda, 0))}`, `${d} fechadas: margem ${pf === null ? '—' : pct(pf, 1)} sobre ${brl(f.reduce((t, x) => t + x.venda, 0))}`] }; }).filter((r) => r.vals.some((v) => v !== null));
        const baseFam = ui.mgFam === 'abertas' ? itAb : ui.mgFam === 'fechadas' ? itFe : itAb.concat(itFe);
        const fams = grupo(baseFam, (x) => x.div + '|' + x.fam, (x) => x.famNome).slice(0, 14).map((g) => ({ label: g.label, sub: g.k.split('|')[0] + ' · ' + mi(g.venda), vals: [g.pct], tips: [`${g.label}: margem ${pct(g.pct, 1)} · venda ${brl(g.venda)} · ${g.n} item(ns)`] }));
        const minRef = ui.mgDiv === 'SPV' ? 0.4 : ui.mgDiv === 'SEQ' ? num((itAb[0] || itFe[0] || {}).min) || null : null;
        const pacs = B.fechadas.concat(B.abertas.map((p) => ({ pac: p, aberta: true, venda: num(p.resumo.venda), margemPct: num(p.resumo.margemPct) }))).sort((a, b) => b.venda - a.venda).slice(0, 12)
          .map((x) => x.aberta ? { label: x.pac.numero || x.pac.name || '—', sub: (x.pac.cliente || '') + ' · aberta', vals: [x.margemPct], tips: [`${x.pac.numero || ''} ${x.pac.cliente || ''} (em aberto): ${pct(x.margemPct, 1)} sobre ${brl(x.venda)}`] }
            : { label: x.F.numero || x.F.nome || '—', sub: (x.F.cliente || '') + ' · fechada', vals: [x.margemPct], tips: [`${x.F.numero || ''} ${x.F.cliente || ''} (fechada ${fmtD(x.F.fechadoEm)}): ${pct(x.margemPct, 1)} sobre ${brl(x.venda)}`] });
        const pr = comReal.slice(0, 12).map((f) => ({ label: f.F.numero || f.F.nome || '—', sub: `${f.F.cliente || ''} · ${pct(f.cobertura, 0)} apontado`, vals: [f.margemPct, f.margemRealPct], tips: [`Previsto: ${pct(f.margemPct, 1)} · custo ${brl(f.custo)}`, `Realizado: ${pct(f.margemRealPct, 1)} · custo ${brl(f.custoReal)}`] }));
        const itens = grupo(itAb.concat(itFe), (x) => x.div + '|' + x.nome, (x) => x.nome).slice(0, 12).map((g) => ({ label: g.label, sub: g.k.split('|')[0] + ' · ' + mi(g.venda), vals: [g.pct], tips: [`${g.label}: ${pct(g.pct, 1)} · ${g.n} ocorrência(s) · ${brl(g.venda)}`] }));
        body += `<div class="vzgrid">
          <section class="card"><h2>Margem por divisão</h2>${hbars(divs, { series: ['Em andamento', 'Ganhas'], aria: 'margem por divisão' })}</section>
          <section class="card"><h2>Margem por família <span class="sub"><select id="mgFam" aria-label="Base">${[['todas', 'em andamento e ganhas'], ['abertas', 'só em andamento'], ['fechadas', 'só ganhas']].map(([k, l]) => `<option value="${k}"${(ui.mgFam || 'todas') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></span></h2>${hbars(fams, { min: minRef, aria: 'margem por família' })}</section>
          <section class="card"><h2>Margem por pacote <span class="sub">os 12 maiores</span></h2>${hbars(pacs, { min: minRef, aria: 'margem por pacote' })}</section>
          <section class="card"><h2>Previsto × realizado <span class="sub">fechadas com custo real</span></h2>${pr.length ? hbars(pr, { series: ['Previsto', 'Realizado'], aria: 'margem prevista e realizada' }) : '<p class="sub">Assim que Compras e Produção lançarem o custo real de uma fechada, a comparação aparece aqui.</p>'}</section>
          <section class="card span-all"><h2>Margem por item / linha <span class="sub">agrupado pelo nome do item</span></h2>${hbars(itens, { min: minRef, aria: 'margem por item', w: 1300 })}</section>
        </div>`;
      } else if (tab === 'fechadas') {
        body += `<section class="card"><div class="tw"><table class="t"><thead><tr><th>Fechamento</th><th>Pacote</th><th>Venda fechada</th><th>Margem fechada</th><th>Margem realizada</th><th>Custo apontado</th><th>Execução</th><th></th></tr></thead><tbody>${B.fechadas.map((f) => `<tr class="click" data-mgopen="${esc(f.F.id)}">
          <td>${fmtD(f.F.fechadoEm)}${f.F.pedido ? `<br><small class="sub">pedido ${esc(f.F.pedido)}</small>` : ''}</td><td><span class="divb ${f.F.div.toLowerCase()}">${f.F.div}</span> <b>${esc(f.F.numero || '—')}</b><br><small class="sub">${esc(f.F.cliente || f.F.nome || '')}</small></td>
          <td class="n">${brl(f.venda)}</td><td class="n">${pct(f.margemPct, 1)}</td><td class="n">${f.apontadas ? `<b class="${f.margemRealPct < f.margemPct - 0.005 ? 'bad-t' : 'ok-t'}">${pct(f.margemRealPct, 1)}</b>` : '—'}</td>
          <td class="n">${pct(f.cobertura, 0)}</td><td>${esc(f.F.execucao || 'em andamento')}</td><td style="white-space:nowrap"><button class="btn sm pri" data-mgopen="${esc(f.F.id)}">Custo real</button> <button class="btn sm" data-mgxls="${esc(f.F.id)}">Excel</button></td></tr>`).join('') || '<tr><td colspan="8" class="sub">Nenhuma proposta fechada no filtro. Na página inicial, mude o status para "Ganha" ou use "Dar baixa".</td></tr>'}</tbody></table></div></section>`;
      } else {
        body += `<section class="card"><div class="tw"><table class="t"><thead><tr><th>Proposta</th><th>Status</th><th>Venda</th><th>Margem</th><th>Itens</th><th></th></tr></thead><tbody>${B.abertas.sort((a, b) => num(b.resumo.venda) - num(a.resumo.venda)).map((p) => { const low = p.resumo.minimo && p.resumo.margemPct < p.resumo.minimo;
          return `<tr><td><span class="divb ${(p.div || 'SEQ').toLowerCase()}">${p.div || 'SEQ'}</span> <b>${esc(p.numero || '—')}</b><br><small class="sub">${esc(p.cliente || p.name || '')}</small></td><td>${(() => { const s2 = situacao(p); return `<span class="pill ${s2[1]}">${esc(s2[0])}</span>`; })()}</td>
          <td class="n">${brl(p.resumo.venda)}</td><td class="n"><b class="${low ? 'bad-t' : ''}">${pct(p.resumo.margemPct, 1)}</b>${low ? ' <span class="pill bad">abaixo do mínimo</span>' : ''}</td><td class="sub">${esc((p.resumo.itens || []).map((x) => x.nome).join(' · ').slice(0, 90))}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-hopen="${esc(p.id)}">Abrir</button> <button class="btn sm pri" data-mgclose="${esc(p.id)}">Dar baixa</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="sub">Nenhuma proposta em aberto com margem calculada.</td></tr>'}</tbody></table></div></section>`;
      }
      return `<div class="stack"><div class="flowhead"><div><h1>Margens</h1><div class="sub">Propostas em aberto e fechadas: margem prevista, fechada e realizada (com o custo real de compras e fabricação).</div></div></div>${filtros}${kpis}${body}</div>`;
    }

    // ---------- detalhe de um fechamento: previsto × realizado por linha ----------
    // quem vê preço, margem, impostos e comissões; quem só lança custo vê previsto × realizado
    const veComercial = () => { if (REG.mode === 'local' || REG.isOwner) return true; const ac = REG.acessos || {}; const ks = ['precificacao', 'ap_financeiro', 'ap_diretoria'];
      return ks.some((k) => (ac[k] || []).length) ? ks.some((k) => (ac[k] || []).includes(REG.me)) : !!REG.canEditCadastro; };
    // tela de Margens para quem só confere custo: a fila de fechadas, sem preço nem margem
    function vFilaReal() {
      const L = fech.filter((F) => liberaReal(F.id)).sort((a, b) => String(b.fechadoEm).localeCompare(String(a.fechadoEm))).map((F) => ({ F, R: realizado(F) }));
      return `<div class="stack"><h1>Custo real</h1><section class="card"><h2>Ganhas <span class="sub">confira o custo real de cada uma</span></h2><div class="tw"><table class="t"><tbody>${L.map(({ F, R }) => `<tr><td><span class="divb ${F.div.toLowerCase()}">${F.div}</span> <b>${esc(F.numero || '—')}</b> <span class="sub">${esc(F.cliente || '')} · fechada em ${fmtD(F.fechadoEm)} · ${esc(F.execucao || 'em andamento')}</span></td><td class="n">${R.apontadas} de ${R.linhas} conferidas</td><td style="text-align:right"><button class="btn sm${R.cobertura < 1 ? ' pri' : ''}" data-mgopen="${esc(F.id)}">${R.cobertura < 1 ? 'Lançar custo real' : 'Ver'}</button></td></tr>`).join('') || '<tr><td class="sub">Nenhuma proposta fechada ainda.</td></tr>'}</tbody></table></div></section></div>`;
    }
    const ehMO = (l) => /MAODEOBRA|MÃO DE OBRA|MAO DE OBRA/i.test((l.fam || '') + ' ' + (l.desc || '') + ' ' + (l.rot || ''));
    function vDetalhe(id) {
      const F0 = fech.find((f) => f.id === id); if (!F0) { ui.mgId = null; return '<p class="sub">Fechamento não encontrado.</p>'; }
      const R = realizado(F0); const ed = canReal() && liberaReal(F0.id); const com = veComercial();
      const dif = (d) => (Math.abs(d) < 0.005 ? '<span class="sub">0,00</span>' : `<b class="${d > 0 ? 'bad-t' : 'ok-t'}">${d > 0 ? '+' : '−'}${brl(Math.abs(d)).replace('R$ ', '')}</b>`);
      const linha = (it, l) => {
        const has = typeof l.real === 'number'; const v = has ? l.real : l.prev; const d = v - l.prev; const igual = has && Math.abs(d) < 0.005;
        const st = !has ? `<button class="rok" data-rok="${esc(it.n)}|${esc(l.k)}" title="Confere: quantidade e valor iguais ao previsto"${ed ? '' : ' disabled'}>✓ igual</button>` : igual ? '<span class="pill ok">✓ conferido</span>' : '<span class="pill warn">alterado</span>';
        const nm = esc(l.desc || l.rot || '');
        return `<tr class="${has ? 'rdone' : 'rpend'}"><td>${nm}<br><small class="sub">${esc([ehMO(l) ? 'MÃO DE OBRA' : l.grupo, l.fam].filter(Boolean).join(' · '))}</small></td>
          <td class="n">${NF[2].format(l.qPrev)}</td><td class="in">${ed ? `<input class="rin q${has ? '' : ' pend'}" data-rq="${esc(it.n)}|${esc(l.k)}" inputmode="decimal" value="${NF[2].format(l.qReal)}" aria-label="Quantidade usada de ${nm}">` : NF[2].format(l.qReal)}</td>
          <td class="n">${brl(l.uPrev).replace('R$ ', '')}</td><td class="in">${ed ? `<input class="rin${has ? '' : ' pend'}" data-ru="${esc(it.n)}|${esc(l.k)}" inputmode="decimal" value="${NF[2].format(l.uReal)}" aria-label="Valor unitário com impostos de ${nm}">` : brl(l.uReal).replace('R$ ', '')}</td>
          <td class="n">${brl(l.prev).replace('R$ ', '')}</td><td class="n"><b>${brl(v).replace('R$ ', '')}</b></td><td class="n">${dif(d)}</td><td>${st}</td>
          <td class="in">${ed ? `<input class="rin" data-robs="${esc(it.n)}|${esc(l.k)}" value="${esc(l.obs || '')}" placeholder="NF, OS, fornecedor…" aria-label="Observação">` : esc(l.obs || '')}</td></tr>`;
      };
      const itens = R.itens.map((it) => {
        // mão de obra num bloco próprio, depois dos materiais
        const mat = it.linhas.filter((l) => !ehMO(l)), mo = it.linhas.filter(ehMO);
        const ex = it.extras.map((e, i) => `<tr class="newrow"><td>${esc(e.desc)}<br><small class="sub">NÃO PREVISTO</small></td><td></td><td></td><td></td><td></td><td class="n">—</td><td class="n"><b>${brl(e.v).replace('R$ ', '')}</b></td><td class="n">${dif(e.v)}</td><td></td><td>${ed ? `<button class="restore" data-rexdel="${esc(it.n)}|${i}">remover</button>` : ''}</td></tr>`).join('');
        const pend = it.linhas.length - it.apont; const prev = it.custo; const real = it.custoReal;
        return `<section class="card" id="cr_${esc(it.n)}"><h2>${esc(it.nome)} <span class="sub">${esc(it.familiaNome || it.familia || '')} · ${NF[0].format(it.qtd || 1)} un.</span></h2>
          <div class="kpis" style="margin-bottom:10px"><div class="kpi"><span>Custo previsto</span><b>${brl(prev)}</b></div><div class="kpi lead"><span>Custo realizado</span><b>${brl(real)}</b></div><div class="kpi"><span>Diferença</span><b class="${real - prev > 0.005 ? 'bad-t' : 'ok-t'}">${real - prev >= 0 ? '+' : '−'}${brl(Math.abs(real - prev)).replace('R$ ', '')}</b><em>${prev ? pct((real - prev) / prev, 1) : ''}</em></div><div class="kpi"><span>Conferência</span><b>${it.apont} de ${it.linhas.length}</b><em>${pend ? pend + ' linha(s) a conferir' : 'tudo conferido'}</em></div></div>
          <div class="tw"><table class="t reg"><thead><tr><th rowspan="2">Componente</th><th colspan="2">Quantidade</th><th colspan="2">Valor unitário com impostos (R$)</th><th colspan="2">Total (R$)</th><th rowspan="2">Diferença</th><th rowspan="2"></th><th rowspan="2">Observação</th></tr><tr><th>Prevista</th><th>Usada</th><th>Previsto</th><th>Real</th><th>Previsto</th><th>Real</th></tr></thead><tbody>
          ${mat.length ? '<tr class="grp"><td colspan="11">Materiais e componentes</td></tr>' + mat.map((l) => linha(it, l)).join('') : ''}
          <tr class="grp"><td colspan="11">Mão de obra</td></tr>${mo.length ? mo.map((l) => linha(it, l)).join('') : '<tr><td colspan="11" class="sub">Sem linha de mão de obra na formação. Lance horas extras ou serviços como "custo não previsto".</td></tr>'}
          ${ex ? '<tr class="grp"><td colspan="11">Não previsto</td></tr>' + ex : ''}
          ${it.resto > 0.5 ? `<tr><td class="sub">Outros custos sem linha (arredondamentos)</td><td></td><td></td><td></td><td></td><td class="n">${brl(it.resto).replace('R$ ', '')}</td><td class="n sub">${brl(it.resto).replace('R$ ', '')}</td><td></td><td></td><td></td></tr>` : ''}
          <tr class="tot"><td>Total do item</td><td></td><td></td><td></td><td></td><td class="n">${brl(prev).replace('R$ ', '')}</td><td class="n">${brl(real).replace('R$ ', '')}</td><td class="n">${dif(real - prev)}</td><td></td><td></td></tr></tbody></table></div>
          ${ed ? `<div class="docbar" style="margin-top:8px">${pend ? `<button class="btn sm" data-rokall="${esc(it.n)}">✓ Conferir as ${pend} restantes como iguais ao previsto</button>` : ''}<button class="btn sm" data-rexadd="${esc(it.n)}">+ Custo não previsto</button></div>` : ''}</section>`;
      }).join('');
      const exec = F0.execucao || 'em andamento'; const concluida = exec !== 'em andamento';
      return `<div class="stack">
        <div class="flowhead"><div style="min-width:0"><button class="btn sm" data-mgback>← Margens</button><h1 style="margin-top:8px"><span class="divb ${F0.div.toLowerCase()}">${F0.div}</span> Custo real · ${esc(F0.numero || F0.nome || 'Fechamento')}</h1><div class="sub">${esc(F0.cliente || '')} · fechada em ${fmtD(F0.fechadoEm)}${F0.pedido ? ' · pedido ' + esc(F0.pedido) : ''}</div></div>
          <div class="sumbar"><div><span>Previsto</span><b>${brl(R.custo)}</b></div><div><span>Realizado</span><b>${brl(R.custoReal)}</b></div><div><span>Diferença</span><b class="${R.custoReal - R.custo > 0.005 ? 'bad-t' : 'ok-t'}">${R.custoReal - R.custo >= 0 ? '+' : '−'}${brl(Math.abs(R.custoReal - R.custo)).replace('R$ ', '')}</b></div><div><span>Conferido</span><b>${pct(R.cobertura, 0)}</b></div></div></div>
        ${ui.mgNova === id ? '<div class="banner ok"><b>Baixa registrada.</b> Compras e Produção conferem aqui o custo real: cada linha já vem com o valor previsto; clique em "✓ igual" quando confere ou digite o valor real quando for diferente.</div>' : ''}
        ${com ? `<div class="kpis"><div class="kpi"><span>Venda fechada</span><b>${brl(R.venda)}</b><em>proposto ${brl(F0.vendaProposta)}</em></div><div class="kpi"><span>Margem fechada</span><b>${pct(R.margemPct, 1)}</b></div><div class="kpi lead"><span>Margem com o custo real</span><b class="${R.margemRealPct < R.margemPct - 0.005 ? 'bad-t' : 'ok-t'}">${pct(R.margemRealPct, 1)}</b><em>visível só para Precificação, Financeiro e Diretoria</em></div></div>` : ''}
        <div class="docbar">${ed ? `<label class="btn" for="mgNf">📎 Ler NF ou pedido (PDF, XML, Excel ou foto)</label><input type="file" id="mgNf" accept="application/pdf,image/*,.xml,.xlsx,.csv" hidden>` : ''}
          ${com ? `<button class="btn" data-mgxls="${esc(F0.id)}">Relatório previsto × realizado (Excel)</button>` : ''}
          ${ed && !concluida ? `<button class="btn pri" data-mgconcl="${esc(F0.id)}">Fabricação concluída → enviar ao Financeiro</button>` : `<span class="pill ${concluida ? 'ok' : 'mute'}">${esc(exec)}</span>${ed && concluida ? ` <button class="restore" data-mgconcl="${esc(F0.id)}">reenviar ao Financeiro</button>` : ''}`}
          ${com && (REG.canEditCadastro || REG.mode === 'local') ? `<button class="btn" data-mgreopen="${esc(F0.id)}" data-ico="rotate-ccw">Reabrir (desfazer baixa)</button>` : ''}</div>
        ${ed ? '' : `<p class="sub" style="margin:0">${liberaReal(F0.id) ? 'O custo real é conferido por Engenharia e Custos.' : 'Esta proposta não está como ganha: o custo real fica fechado para lançamento.'}</p>`}
        ${itens}</div>`;
    }
    // fabricação concluída: marca a execução e manda ao Financeiro o relatório completo
    function concluirFab(id) {
      const F = fech.find((f) => f.id === id); if (!F) return; const R = realizado(F); const cfg = avisosCfg(); const n = F.numero || F.nome || '';
      const pend = R.linhas - R.apontadas;
      const corpo = () => [`Olá,`, ``, `A fabricação da proposta ${n} — ${F.cliente || ''} foi concluída.`, ``, `Custo previsto: ${brl(R.custo)}`, `Custo realizado: ${brl(R.custoReal)}`, `Diferença: ${R.custoReal - R.custo >= 0 ? '+' : '−'}${brl(Math.abs(R.custoReal - R.custo))} (${R.custo ? pct((R.custoReal - R.custo) / R.custo, 1) : '—'})`, `Linhas conferidas: ${R.apontadas} de ${R.linhas}${pend ? ' (as demais contam como previsto)' : ''}.`, ``, `Por item:`]
        .concat(R.itens.map((x) => `• ${x.nome}: previsto ${brl(x.custo)} · realizado ${brl(x.custoReal)}`))
        .concat(['', 'O relatório completo previsto × realizado está no Excel (baixe e anexe) e no app: Margens → Ganhas → ' + n + '.', `LS Pricer: ${cfg.link}`]).join('\n');
      emailModal({ titulo: 'Fabricação concluída · enviar ao Financeiro', intro: pend ? `Atenção: ${pend} linha(s) ainda não conferida(s) contam como iguais ao previsto.` : 'Todas as linhas conferidas.',
        grupos: [{ k: 'financeiro', lb: 'Financeiro', emails: cfg.financeiro, on: true }], cc: cfg.cc, assunto: `Fabricação concluída · previsto × realizado · ${n}${F.cliente ? ' · ' + F.cliente : ''}`, corpo,
        excel: () => excel(F), soMarcar: 'Só marcar como concluída',
        onDone: async (a, obs) => { const F2 = fech.find((f) => f.id === id) || F; await gravar(id, Object.assign({}, F2, { execucao: 'fabricação concluída', concluidaEm: new Date().toISOString() })); ctx.log && ctx.log({ tipo: 'Execução', ref: id, desc: n + ' — fabricação concluída; ' + obs, mudancas: [{ campo: 'Execução', de: F2.execucao || 'em andamento', para: 'fabricação concluída' }, { campo: 'Custo realizado', de: R.custo, para: R.custoReal }] }); if (!shared()) ctx.render(); } });
    }
    async function setReal(id, mut, desc) {
      const F = fech.find((f) => f.id === id); if (!F) return; const real = JSON.parse(JSON.stringify(F.real || {})); const antes = realizado(F); mut(real);
      const depois = realizado(Object.assign({}, F, { real }));
      ctx.log && ctx.log({ tipo: 'Custo real', ref: id, desc: (F.numero || F.nome || '') + ' · ' + (desc || 'lançamento'), mudancas: [{ campo: 'Custo real', de: antes.custoReal, para: depois.custoReal }, { campo: 'Margem realizada', de: antes.margemRealPct, para: depois.margemRealPct }] });
      const rec = Object.assign({}, F, { real, upd: new Date().toISOString(), updBy: REG.me || null });
      try { await gravar(id, rec); if (!shared()) ctx.render(); } catch (e) { toast((e && e.message) || 'Não consegui salvar'); }
    }

    // ---------- ler NF / pedido e distribuir nas linhas ----------
    const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2 || /\d/.test(w)));
    const score = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let c = 0; for (const w of A) if (B.has(w)) c++; return c / Math.min(A.size, B.size); };
    async function lerNf(id, file) {
      const F = fech.find((f) => f.id === id); if (!F || !file) return;
      const R = realizado(F); const linhas = R.itens.flatMap((it) => it.linhas.map((l) => ({ it, l })));
      modal(`<h2>Lendo ${esc(file.name)}…</h2><p class="sub" id="nfSt">Lendo o documento…</p><div><button class="btn" data-close>Cancelar</button></div>`);
      let j;
      try { j = await ctx.SPV.lerDocumento(file, (m) => { const el = document.getElementById('nfSt'); if (el) el.textContent = m; }); }
      catch (e) { const el = document.getElementById('nfSt'); if (el) el.textContent = e && e.code === 'unavailable' ? 'Não consegui ler esse arquivo. Lance os valores à mão (XML da NF-e é o formato mais seguro).' : 'Não consegui ler o documento' + (e && e.code ? ' (' + e.code + ')' : '') + '.'; return; }
      const its = (j.itens || []).filter((x) => x && x.descricao).map((x) => ({ x, v: num(x.quantidade || 1) * num(x.valor_unitario) * (1 + num(x.ipi_percentual) / 100) }));
      const best = its.map(({ x, v }) => { let b = null, bs = 0; for (const c of linhas) { const sc = Math.max(score(x.descricao, c.l.desc), score(x.descricao, c.l.rot) * 0.8); if (sc > bs) { bs = sc; b = c; } } return { x, v, alvo: bs >= 0.34 ? b : null, sc: bs }; });
      const opts = (sel) => `<option value="">— não lançar —</option>${linhas.map((c, i) => `<option value="${i}"${sel === c ? ' selected' : ''}>${esc((c.it.nome || '').slice(0, 24) + ' › ' + (c.l.desc || c.l.rot || '').slice(0, 60))}</option>`).join('')}<option value="extra">+ custo não previsto</option>`;
      document.getElementById('overlay').innerHTML = '';
      modal(`<h2>${esc(j.fornecedor || 'Documento')} ${j.documento ? '· nº ' + esc(j.documento) : ''}</h2>
        <p class="sub" style="margin:0">Confira em qual linha cada item da nota entra. O valor inclui IPI. Itens que caem na mesma linha são somados.</p>
        <div class="tw"><table class="t reg"><thead><tr><th>Item da nota</th><th>Valor</th><th>Lançar em</th></tr></thead><tbody>${best.map((b, i) => `<tr><td>${esc(b.x.descricao)}<br><small class="sub">${esc([b.x.codigo, NF[2].format(num(b.x.quantidade || 1)) + ' × ' + NF[2].format(num(b.x.valor_unitario))].filter(Boolean).join(' · '))}</small></td><td class="n">${brl(b.v)}</td><td class="in"><select data-nfmap="${i}">${opts(b.alvo)}</select></td></tr>`).join('')}</tbody></table></div>
        <label class="chk"><input type="checkbox" id="nfSum" checked> Somar ao custo real já lançado na linha</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="nfOk">Lançar custos reais</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#nfOk', o).onclick = async () => {
          const somar = $('#nfSum', o).checked; const ref = [j.fornecedor, j.documento && 'nº ' + j.documento].filter(Boolean).join(' ');
          let docId = null; try { docId = await ctx.SPV.salvarDoc({ tipo: j.tipo || 'nota', fornecedor: j.fornecedor || '', numero: j.documento || '', data: /^\d{4}-\d{2}-\d{2}$/.test(j.data || '') ? j.data : null, moeda: j.moeda || 'BRL', total: typeof j.total === 'number' ? j.total : null, itens: j.itens || [], propUid: F.uid || null, propNome: (F.numero || '') + ' · ' + (F.cliente || ''), notas: 'Custo real do fechamento' }, file); } catch (e) { docId = null; }
          const add = {}; const extras = {};
          o.querySelectorAll('[data-nfmap]').forEach((s) => { const b = best[+s.dataset.nfmap]; if (s.value === '') return; if (s.value === 'extra') { const n = R.itens[0].n; (extras[n] = extras[n] || []).push({ desc: b.x.descricao + (ref ? ' (' + ref + ')' : ''), v: b.v }); return; } const c = linhas[+s.value]; const key = c.it.n + '|' + c.l.k; const a0 = add[key] || { v: 0, q: 0 }; add[key] = { v: a0.v + b.v, q: a0.q + num(b.x.quantidade || 1) }; });
          await setReal(id, (real) => {
            for (const [key, a] of Object.entries(add)) { const [n, k] = key.split('|'); real[n] = real[n] || {}; real[n].l = real[n].l || {}; const cur = real[n].l[k] || {}; const base = somar && typeof cur.v === 'number' ? cur.v : 0; const qb = somar && typeof cur.v === 'number' ? (typeof cur.q === 'number' ? cur.q : 0) : 0; const qt = qb + a.q, vt = base + a.v; real[n].l[k] = { v: vt, q: qt, u: qt ? vt / qt : vt, obs: [cur.obs, ref].filter(Boolean).join(' · '), doc: docId || cur.doc || null }; }
            for (const [n, list] of Object.entries(extras)) { real[n] = real[n] || {}; real[n].extras = (real[n].extras || []).concat(list); }
          });
          close(); toast(Object.keys(add).length + ' linha(s) com custo real lançado');
        };
      });
    }

    // ---------- abas no padrão do Markup HFS (Reunião + Base), com fórmulas vivas ----------
    function hfsSheets(wbx, F, R) {
      const its = R.itens; const n = its.length; const L = (c) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
      const IC = (i) => L(3 + i); const TC = L(3 + n); const NC = 5 + n; const first = IC(0), last = IC(n - 1);
      const NAVY = 'FF243649', INK = 'FF202B36', HEAD = 'FFEDF1F5', KEY = 'FFDCE8F0', INPF = 'FFFFF1C2', INPC = 'FF1657AE', TOPF = 'FFE9F0F5';
      const RS = '"R$ "#,##0.00;\\("R$ "#,##0.00\\);"R$ -"', FX = '0.0000"x"', PC = '0.00%';
      const nomeCurto = (x, i) => (x.n && /^ITEM/.test(x.n) ? x.n.replace('ITEM ', 'Item ') : 'Item ' + String(i + 1).padStart(2, '0')) + (x.familia ? ' · ' + x.familia : '');
      const mk = (title) => { const ws = wbx.addWorksheet(title, { views: [{ showGridLines: false }] }); ws.getColumn(1).width = 3; ws.getColumn(2).width = title === 'Reunião' ? 62 : 46; for (let i = 0; i < n; i++) ws.getColumn(3 + i).width = 21; ws.getColumn(3 + n).width = 22; ws.getColumn(4 + n).width = 3; ws.getColumn(NC).width = 62; return ws; };
      const put = (ws, a, v, st = {}) => { const c = ws.getCell(a); c.value = v; if (st.fmt) c.numFmt = st.fmt; c.font = { name: 'Arial', size: st.size || 11, bold: !!st.b, color: { argb: st.color || INK } }; if (st.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } }; if (st.wrap) c.alignment = { wrapText: true, vertical: 'top' }; return c; };
      const inp = (ws, a, v, fmt) => put(ws, a, v, { fmt, fill: INPF, color: INPC });
      const sec = (ws, r, t) => { put(ws, 'B' + r, t, { b: true, color: 'FFFFFFFF', fill: NAVY }); for (let i = 0; i <= n; i++) put(ws, L(3 + i) + r, null, { fill: NAVY }); };
      const head = (ws, r, lb, tot = 'Total') => { put(ws, 'B' + r, lb, { b: true, fill: HEAD }); its.forEach((x, i) => put(ws, IC(i) + r, nomeCurto(x, i), { b: true, fill: HEAD })); if (tot) put(ws, TC + r, tot, { b: true, fill: HEAD }); };
      const linhaF = (ws, r, lb, f, fmt, st = {}) => { put(ws, 'B' + r, lb, st); its.forEach((x, i) => put(ws, IC(i) + r, { formula: f(IC(i), i) }, Object.assign({ fmt }, st))); if (st.tot !== false) put(ws, TC + r, { formula: st.totF || `SUM(${first}${r}:${last}${r})` }, Object.assign({ fmt }, st)); };
      const nota = (ws, r, t) => put(ws, L(NC) + r, t, { size: 10, color: 'FF52514E', wrap: true });
      // ---- Base ----
      const B = mk('Base');
      put(B, 'B2', 'Base da formação | ' + (F.numero || F.nome || ''), { b: true, size: 20, color: NAVY }); put(B, 'B3', 'Valores extraídos do LS Pricer no fechamento de ' + fmtD(F.fechadoEm) + '; amarelo = entrada editável.');
      sec(B, 5, 'CUSTOS LANÇADOS NA FORMAÇÃO'); head(B, 6, 'Componente');
      const grupos = new Map();
      its.forEach((x, i) => (x.linhas || []).forEach((l) => { if (l.k === 'startup' || l.k === 'frete') return; const ori = l.ori === 'IMP' ? 'importado' : 'nacional'; const g = String(l.fam || (l.grupo === 'ESCOPO' ? 'Escopo sem família' : l.grupo) || 'Outros').replace(/^\d+\./, '') + ' | ' + ori; if (!grupos.has(g)) grupos.set(g, { ori, v: its.map(() => 0) }); grupos.get(g).v[i] += l.prev; }));
      its.forEach((x, i) => { const base = x.custo - num(x.custoStartup) - num(x.custoFrete); const soma = [...grupos.values()].reduce((t, g) => t + g.v[i], 0); const d = base - soma; if (Math.abs(d) > 0.5) { const g = 'Outros e ajustes | nacional'; if (!grupos.has(g)) grupos.set(g, { ori: 'nacional', v: its.map(() => 0) }); grupos.get(g).v[i] += d; } });
      const ord = [...grupos.entries()].sort((a, b) => (a[1].ori === b[1].ori ? b[1].v.reduce((q, z) => q + z, 0) - a[1].v.reduce((q, z) => q + z, 0) : a[1].ori === 'importado' ? -1 : 1));
      let r = 7; const r0 = r; let ri0 = null, ri1 = null, rn0 = null, rn1 = null;
      for (const [g, o] of ord) { put(B, 'B' + r, g); o.v.forEach((v, i) => inp(B, IC(i) + r, Math.round(v * 100) / 100, RS)); put(B, TC + r, { formula: `SUM(${first}${r}:${last}${r})` }, { fmt: RS }); if (o.ori === 'importado') { ri0 = ri0 || r; ri1 = r; } else { rn0 = rn0 || r; rn1 = r; } r++; }
      r++; const rImp = r, rNac = r + 1, rCus = r + 2;
      linhaF(B, rImp, 'Total importado', (c) => (ri0 ? `SUM(${c}${ri0}:${c}${ri1})` : '0'), RS); linhaF(B, rNac, 'Total nacional', (c) => (rn0 ? `SUM(${c}${rn0}:${c}${rn1})` : '0'), RS); linhaF(B, rCus, 'Custo de aquisição original', (c) => `SUM(${c}${rImp}:${c}${rNac})`, RS, { b: true });
      r = rCus + 2; sec(B, r, 'VALORES ADICIONADOS AO PREÇO'); head(B, r + 1, 'Componente');
      const rFre = r + 2, rSta = r + 3;
      put(B, 'B' + rFre, 'Frete embutido no preço'); put(B, 'B' + rSta, 'Start-up embutido no preço');
      its.forEach((x, i) => { inp(B, IC(i) + rFre, num(x.custoFrete), RS); inp(B, IC(i) + rSta, num(x.custoStartup), RS); }); [rFre, rSta].forEach((q) => put(B, TC + q, { formula: `SUM(${first}${q}:${last}${q})` }, { fmt: RS }));
      r = rSta + 2; sec(B, r, 'TRIBUTOS CADASTRADOS NO PRICER'); head(B, r + 1, 'Parâmetro', null);
      const rIcms = r + 2, rPis = r + 3, rCof = r + 4, rIr = r + 5, rIpi = r + 6, rDiv = r + 7;
      [[rIcms, 'ICMS', (x) => (x.icmsPct != null ? x.icmsPct : Math.max(0, (x.venda ? x.impostos / x.venda : 0) - num(x.pisPct || 0.0065) - num(x.cofinsPct || 0.03) - num(x.irPct)))], [rPis, 'PIS | base sem ICMS', (x) => (x.pisPct != null ? x.pisPct : 0.0065)], [rCof, 'COFINS | base sem ICMS', (x) => (x.cofinsPct != null ? x.cofinsPct : 0.03)], [rIr, 'IRPJ / CSLL', (x) => num(x.irPct)], [rIpi, 'IPI | por fora', (x) => num(x.ipiPct)]]
        .forEach(([q, lb, f]) => { put(B, 'B' + q, lb); its.forEach((x, i) => inp(B, IC(i) + q, f(x), PC)); });
      linhaF(B, rDiv, 'Divisor fiscal | antes do IPI', (c) => `1-(${c}${rIcms}+${c}${rIr}+(${c}${rPis}+${c}${rCof})*(1-${c}${rIcms}))`, '0.00000', { tot: false });
      r = rDiv + 2; sec(B, r, 'PREÇO FECHADO E POLÍTICA'); put(B, TC + r, 'TOTAL', { b: true, color: 'FFFFFFFF', fill: NAVY });
      const rPre = r + 1, rTab = r + 2, rDes = r + 3, rMin = r + 4;
      put(B, 'B' + rPre, 'Preço fechado com impostos (com IPI)'); its.forEach((x, i) => inp(B, IC(i) + rPre, Math.round((x.venda + num(x.ipi) * R.k) * 100) / 100, RS)); put(B, TC + rPre, { formula: `SUM(${first}${rPre}:${last}${rPre})` }, { fmt: RS });
      put(B, 'B' + rTab, 'Fator de tabela'); its.forEach((x, i) => inp(B, IC(i) + rTab, x.fatorTabela || null, FX)); nota(B, rTab, 'Fator de tabela da família de produto do item (POLÍTICA).');
      put(B, 'B' + rDes, 'Desconto máximo da política'); its.forEach((x, i) => inp(B, IC(i) + rDes, x.descMax != null ? x.descMax : null, PC)); nota(B, rDes, 'Desconto máximo sobre o preço de tabela, pela origem do conjunto (nacional ou importado).');
      linhaF(B, rMin, 'Fator mínimo aprovado', (c) => `IF(${c}${rTab}="","",${c}${rTab}*(1-${c}${rDes}))`, FX, { tot: false }); nota(B, rMin, 'Fator mínimo = fator de tabela × (1 − desconto máximo): cobre custo fixo, financeiro e o resultado desejado.');
      r = rMin + 3; put(B, 'B' + r, 'Fontes e premissas', { b: true });
      [`LS Pricer: ${its.map((x, i) => nomeCurto(x, i)).join(', ')} — custos, frete, start-up e tributos do fechamento.`, `Fechamento de ${fmtD(F.fechadoEm)}${F.pedido ? ', pedido ' + F.pedido : ''}: valor proposto ${brl(F.vendaProposta)} e fechado ${brl(R.venda)} sem IPI.`, 'A origem (importado/nacional) de cada componente vem do cadastro de insumos.', 'Atualização proporcional do importado é uma estimativa; conferir nacionalização e créditos.', 'Frete e start-up cobrados foram mantidos como na origem; sem novo encargo financeiro.']
        .forEach((t, j) => put(B, 'B' + (r + 1 + j), t, { size: 10, color: 'FF52514E' }));
      // ---- Reunião ----
      const W = mk('Reunião'); const cambio = num(((ctx.SPV && ctx.SPV.cfg && ctx.SPV.cfg().mk) || {}).cambio_usd) || 5.5;
      put(W, 'B2', 'Markup da negociação | ' + (F.cliente || ''), { b: true, size: 20, color: NAVY }); put(W, 'B3', (F.numero || F.nome || '') + ' • preço fechado × custo atualizado pelo câmbio');
      put(W, 'B5', 'Preço necessário pelo fator aprovado', { fill: TOPF }); put(W, TC + '5', { formula: TC + '31' }, { b: true, size: 19, color: NAVY, fill: TOPF, fmt: RS });
      put(W, 'B6', 'Preço fechado com o cliente'); put(W, TC + '6', { formula: 'C10' }, { fmt: RS }); nota(W, 6, 'Preço com impostos e IPI, como fechado.');
      put(W, 'B7', 'Ajuste para atender à política'); put(W, TC + '7', { formula: `${TC}5-${TC}6` }, { fmt: RS }); nota(W, 7, 'Entre parênteses: sobrando. Sem parênteses: faltando.');
      put(W, 'B9', 'Câmbio "atual" (estimativa)'); inp(W, 'C9', cambio, '"R$ "0.00'); nota(W, 9, 'Cenário para a reunião; não é cotação verificada.');
      put(W, 'B10', 'Preço total fechado'); put(W, 'C10', { formula: `Base!${TC}${rPre}` }, { fmt: RS });
      put(W, 'B11', 'Câmbio usado no custo original (nacionalização)'); inp(W, 'C11', cambio, '"R$ "0.00'); nota(W, 11, 'Confirmar com Compras o câmbio da formação.');
      put(W, 'B12', 'Fator mínimo aprovado (por item na linha 36)'); put(W, 'C12', { formula: `IFERROR(AVERAGE(${first}36:${last}36),"")` }, { fmt: FX });
      sec(W, 14, '1. ATUALIZAR O CUSTO DE AQUISIÇÃO'); head(W, 15, 'Etapa');
      linhaF(W, 16, 'Importado no custo original', (c) => `Base!${c}${rImp}`, RS); linhaF(W, 17, 'Nacional no custo original', (c) => `Base!${c}${rNac}`, RS); linhaF(W, 18, 'Custo total original', (c) => `SUM(${c}16:${c}17)`, RS);
      linhaF(W, 19, 'Variação do câmbio | compra ÷ formação', () => '$C$9/$C$11', '0.0000', { tot: false });
      linhaF(W, 20, 'Importado com o novo câmbio', (c) => `${c}16*${c}19`, RS); nota(W, 20, 'Somente a parcela importada varia; o custo nacional permanece fixo.');
      linhaF(W, 21, 'CUSTO DE AQUISIÇÃO ATUALIZADO', (c) => `SUM(${c}17,${c}20)`, RS, { b: true, fill: HEAD }); nota(W, 21, 'A classificação e os valores de origem permanecem como no Pricer.');
      sec(W, 23, '2. FORMAR O PREÇO E CONFERIR A CONDIÇÃO DO CLIENTE'); head(W, 23, '2. FORMAR O PREÇO E CONFERIR A CONDIÇÃO DO CLIENTE'); put(W, 'B23', '2. FORMAR O PREÇO E CONFERIR A CONDIÇÃO DO CLIENTE', { b: true, color: 'FFFFFFFF', fill: NAVY });
      linhaF(W, 24, 'Custo atualizado × fator mínimo', (c) => `IF(${c}36="",0,${c}21*${c}36)`, RS); nota(W, 24, 'O fator é aplicado ao custo, antes dos impostos de venda.');
      linhaF(W, 25, '(+) Frete embutido no preço', (c) => `Base!${c}${rFre}`, RS); linhaF(W, 26, '(+) Start-up embutido no preço', (c) => `Base!${c}${rSta}`, RS);
      linhaF(W, 27, '(=) Base do preço antes dos tributos', (c) => `SUM(${c}24:${c}26)`, RS);
      linhaF(W, 28, 'Divisor dos tributos | antes do IPI', (c) => `Base!${c}${rDiv}`, '0.00000', { tot: false });
      linhaF(W, 29, 'Preço com tributos | antes do IPI', (c) => `${c}27/${c}28`, RS); linhaF(W, 30, '(+) IPI', (c) => `${c}29*Base!${c}${rIpi}`, RS);
      linhaF(W, 31, 'PREÇO NECESSÁRIO PELA POLÍTICA', (c) => `SUM(${c}29:${c}30)`, RS, { b: true, fill: KEY });
      linhaF(W, 32, 'Preço fechado com o cliente', (c) => `Base!${c}${rPre}`, RS);
      linhaF(W, 33, 'Preço do cliente após tributos', (c) => `${c}32/(1+Base!${c}${rIpi})*${c}28`, RS);
      linhaF(W, 34, 'Base disponível para o produto', (c) => `${c}33-${c}25-${c}26`, RS);
      linhaF(W, 35, 'FATOR QUE O PREÇO DO CLIENTE SUPORTA', (c) => `IFERROR(${c}34/${c}21,"")`, FX, { b: true, fill: HEAD, totF: `IFERROR(SUM(${first}34:${last}34)/${TC}21,"")` });
      linhaF(W, 36, 'Fator mínimo aprovado', (c) => `Base!${c}${rMin}`, FX, { totF: 'C12' });
      linhaF(W, 37, 'Diferença até o preço da política', (c) => `${c}31-${c}32`, RS);
      put(W, 'B38', 'Conclusão sobre o fator aprovado', { fill: HEAD }); put(W, 'C38', { formula: `IF(${TC}32<${TC}31-0.01,"ABAIXO DA POLÍTICA","ATENDE À POLÍTICA")` }, { fill: HEAD, b: true });
      sec(W, 40, '3. IDENTIFICAR SE A VENDA COBRE TODOS OS CUSTOS');
      put(W, 'B41', 'Fator de equilíbrio validado pelo Financeiro'); inp(W, 'C41', null, FX); nota(W, 41, 'Preencher somente se conhecido; vazio não significa zero.');
      linhaF(W, 42, 'Preço de equilíbrio | sem resultado desejado', (c) => `IF(COUNT($C$41)=0,"",(${c}21*$C$41+${c}25+${c}26)/${c}28*(1+Base!${c}${rIpi}))`, RS, { totF: `IF(COUNT($C$41)=0,"",SUM(${first}42:${last}42))` });
      linhaF(W, 43, 'Diferença de preço até o equilíbrio', (c) => `IF(COUNT($C$41)=0,"",${c}42-${c}32)`, RS, { totF: `IF(COUNT($C$41)=0,"",${TC}42-${TC}32)` });
      put(W, 'B44', 'Conclusão sobre a cobertura dos custos'); put(W, 'C44', { formula: `IF(COUNT(C41)=0,"EQUILÍBRIO NÃO INFORMADO",IF(${TC}32<${TC}42-0.01,"NÃO COBRE TODOS OS CUSTOS",IF(ABS(${TC}32-${TC}42)<=0.01,"NO EQUILÍBRIO","COBRE O EQUILÍBRIO")))` }, { b: true });
      put(W, 'B46', 'Como explicar na reunião', { b: true });
      ['1. O fator mínimo cobre estrutura, financeiro e resultado desejado.', '2. O câmbio aumenta o custo importado; o preço fixo passa a suportar um fator menor.', '3. Abaixo do mínimo: não atinge a política. Abaixo do equilíbrio: não cobre os custos.', 'O fator de equilíbrio deve usar a mesma base do fator praticado, sem duplicar os adicionais.']
        .forEach((t, j) => put(W, 'B' + (47 + j), t));
      wbx.views = [{ activeTab: 0 }];
    }

    // ---------- Excel do fechamento: resumo no formato do Memorial (um item por coluna) ----------
    async function excel(F, aprovacao) {
      const ExcelJS = await excelLib(); const R = realizado(F); const k = R.k; const wbx = new ExcelJS.Workbook(); wbx.creator = 'LS Pricer';
      hfsSheets(wbx, F, R);
      // pedido de aprovação: o preço ainda é o proposto, não o fechado
      if (F.modo === 'aprovacao') {
        const TR = [[/Preço total fechado/g, 'Preço total proposto'], [/fechado com o cliente/g, 'proposto ao cliente'], [/Preço fechado com impostos/g, 'Preço proposto com impostos'], [/preço fechado ×/g, 'preço proposto ×'], [/como fechado/g, 'como proposto'], [/no fechamento de/g, 'no pedido de aprovação de'], [/do fechamento/g, 'da proposta'], [/^Fechamento de /, 'Pedido de aprovação de '], [/valor proposto (.*?) e fechado (.*?) sem IPI/, 'valor atual $1 e valor target $2 sem IPI']];
        ['Base', 'Reunião'].forEach((nm) => { const ws = wbx.getWorksheet(nm); if (ws) ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'string') { let v = c.value; TR.forEach(([a, b]) => { v = v.replace(a, b); }); if (v !== c.value) c.value = v; } })); });
      }
      const OR = 'FFE8570A', INK = 'FF1E1F21', SOFT = 'FFFFF1E8', GRAY = 'FFF4F3F0';
      const money = '#,##0.00;[Red]-#,##0.00', perc = '0.00%;[Red]-0.00%', fat = '0.0000';
      const its = R.itens; const n = its.length; const colT = n + 2;
      const ws = wbx.addWorksheet('Memorial', { views: [{ showGridLines: false, state: 'frozen', xSplit: 1, ySplit: 8 }] });
      ws.columns = [{ width: 46 }].concat(its.map(() => ({ width: 17 }))).concat([{ width: 19 }]);
      const t = ws.addRow(['LS FIRE — FECHAMENTO DA PROPOSTA']); t.font = { bold: true, size: 14, color: { argb: OR } };
      ws.addRow([`${F.div}${F.tipo ? ' · ' + F.tipo : ''} · ${F.numero || F.nome || ''} · ${F.cliente || ''}`]).font = { bold: true };
      ws.addRow([`Fechada em ${fmtD(F.fechadoEm)}${F.pedido ? ' · pedido ' + F.pedido : ''} · execução: ${F.execucao || 'em andamento'}`]);
      ws.addRow([`Valor proposto ${brl(F.vendaProposta)} → fechado ${brl(R.venda)}${Math.abs(k - 1) > 1e-6 ? ' (' + (k < 1 ? 'desconto de ' : 'acréscimo de ') + NF[2].format(Math.abs(1 - k) * 100) + '%)' : ''}${F.obs ? ' · ' + F.obs : ''}`]);
      ws.addRow([]); ws.addRow([]); ws.addRow([]);
      const hd = ws.addRow(['Linha'].concat(its.map((x, i) => (F.div === 'SEQ' && x.n && /^ITEM/.test(x.n) ? x.n : 'ITEM ' + String(i + 1).padStart(2, '0')))).concat(['TOTAL DA PROPOSTA']));
      hd.eachCell((c, ci) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ci === colT ? OR : INK } }; c.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }; }); hd.height = 22;
      const nm = ws.addRow(['Item'].concat(its.map((x) => x.nome)).concat([''])); nm.eachCell((c) => { c.font = { size: 9, color: { argb: 'FF52514E' } }; c.alignment = { wrapText: true, vertical: 'top' }; }); nm.height = 48;
      const sec = (lb) => { const r = ws.addRow([lb]); r.font = { bold: true, color: { argb: OR } }; };
      const sum = (f) => its.reduce((tt, x) => tt + num(f(x)), 0);
      const row = (lb, f, fmt, o = {}) => {
        const vals = its.map(f); if (o.skipZero && vals.every((v) => !num(v))) return null;
        const tot = o.total !== undefined ? o.total : fmt === perc ? (R.venda ? sum((x) => num(f(x)) * x.venda) / R.venda : 0) : sum(f);
        const r = ws.addRow([lb].concat(vals.map((v) => (v === null || v === undefined ? null : v))).concat([tot]));
        r.eachCell((c, ci) => { if (ci > 1) c.numFmt = fmt; if (ci === colT) c.font = { bold: true }; });
        if (o.bold) r.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; });
        if (o.lead) r.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; });
        return r;
      };
      const lin = (x) => x.linhas || [];
      const custoOri = (x, ori) => lin(x).filter((l) => !['SERVIÇOS', 'DESLOCAMENTO', 'EQUIPE'].includes(l.grupo) && (ori === 'IMP' ? l.ori === 'IMP' : l.ori !== 'IMP')).reduce((tt, l) => tt + l.prev, 0);
      const temOri = its.some((x) => lin(x).some((l) => l.ori === 'IMP'));
      sec('CUSTOS');
      // nacional = o resto, para fechar com o total (a mão de obra de fabricação tem linha própria)
      if (temOri) { row('Peças e materiais — importado', (x) => custoOri(x, 'IMP'), money); row('Peças e materiais — nacional', (x) => x.custo - custoOri(x, 'IMP') - num(x.custoFab) - num(x.custoStartup) - num(x.custoFrete), money); }
      else row('Custo do conjunto de peças e materiais', (x) => (x.custoMat != null ? x.custoMat : x.custo - num(x.custoStartup) - num(x.custoFrete)), money);
      row('Custos dos serviços de fabricação', (x) => x.custoFab, money, { skipZero: true });
      row('Custos de start-up', (x) => x.custoStartup, money, { skipZero: true });
      row('Custos dos fretes', (x) => x.custoFrete, money, { skipZero: true });
      row('TOTAL CUSTOS', (x) => x.custo, money, { bold: true });
      sec('IMPOSTOS (sobre o preço sem IPI)');
      row('ICMS', (x) => x.icmsPct, perc, { skipZero: true }); row('PIS/COFINS', (x) => x.pisCofinsPct, perc, { skipZero: true }); row('IR/CSLL', (x) => x.irPct, perc, { skipZero: true });
      row('TOTAL IMPOSTOS (sem o IPI)', (x) => (x.venda ? x.impostos / x.venda : 0), perc, { bold: true });
      sec('COMISSÃO E MARGEM');
      row('TOTAL COMISSÃO', (x) => (x.venda ? x.comissao / x.venda : 0), perc);
      row('Margem líquida', (x) => x.margemPct, perc, { lead: true, total: R.margemPct });
      row('Fator sobre o custo de aquisição', (x) => { const base = x.custo - num(x.custoStartup) - num(x.custoFrete); return base ? (x.venda - x.impostos - num(x.custoStartup) - num(x.custoFrete)) / base : null; }, fat,
        { total: (() => { const base = R.custo - sum((x) => num(x.custoStartup) + num(x.custoFrete)); return base ? (R.venda - R.impostos - sum((x) => num(x.custoStartup) + num(x.custoFrete))) / base : null; })() });
      sec('PREÇO');
      row('Preço de venda com impostos — SEM IPI (total)', (x) => x.venda, money, { lead: true });
      row('Quantidade', (x) => x.qtd || 1, '0', {});
      row('Preço unitário com impostos — SEM IPI', (x) => x.venda / (x.qtd || 1), money, { total: null });
      const ipiR = (x) => num(x.ipi) * k; row('IPI (R$)', ipiR, money, { skipZero: true });
      row('Preço de venda com impostos e COM IPI (total)', (x) => x.venda + ipiR(x), money, { lead: true });
      if (its.some((x) => x.origem)) { const r = ws.addRow(['Origem do conjunto'].concat(its.map((x) => x.origem || '')).concat([its.every((x) => x.origem === its[0].origem) ? its[0].origem : 'MISTO'])); r.font = { bold: true }; row('Conteúdo de importação (CI)', (x) => x.ci, perc, { total: null }); }
      sec('DEMONSTRATIVO (base: preço sem IPI — o IPI é por fora e não entra na margem)');
      row('Preço de venda com impostos (sem IPI)', (x) => x.venda, money); row('Impostos', (x) => x.impostos, money); row('Preço de venda sem impostos', (x) => x.venda - x.impostos, money);
      row('Custos materiais e serviços', (x) => x.custo, money); row('Comissão', (x) => x.comissao, money); row('Margem líquida', (x) => x.margem, money, { bold: true });
      row('Conferência (custos + comissão + margem)', (x) => x.custo + x.comissao + x.margem, money);
      if (R.apontadas || its.some((x) => x.extras.length)) {
        sec(`REALIZADO (${R.apontadas} de ${R.linhas} linhas com custo real; as demais contam como previsto)`);
        row('Custo real', (x) => x.custoReal, money); row('Diferença de custo (real − previsto)', (x) => x.custoReal - x.custo, money);
        row('Margem líquida realizada (R$)', (x) => x.margemReal, money, { bold: true }); row('Margem líquida realizada (%)', (x) => x.margemRealPct, perc, { lead: true, total: R.margemRealPct });
      }
      // custo real por linha, só quando houver apontamento
      if (R.apontadas || its.some((x) => x.extras.length)) {
        const wr = wbx.addWorksheet('Custo real'); wr.columns = [{ width: 28 }, { width: 52 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 34 }];
        const h3 = wr.addRow(['Item', 'Componente', 'Qtd prevista', 'Qtd usada', 'Unit. previsto c/ impostos', 'Unit. real c/ impostos', 'Total previsto', 'Total real', 'Diferença', 'Observação']); h3.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }; });
        for (const x of its) { for (const l of x.linhas.filter((q) => typeof q.real === 'number')) { const r = wr.addRow([x.nome, l.desc || l.rot || '', l.qPrev, l.qReal, l.uPrev, l.uReal, l.prev, l.real, l.real - l.prev, l.obs || '']); [5, 6, 7, 8, 9].forEach((c) => { r.getCell(c).numFmt = money; }); }
          for (const e of x.extras) { const r = wr.addRow([x.nome, 'NÃO PREVISTO — ' + e.desc, 0, e.v, e.v, '']); [3, 4, 5].forEach((c) => { r.getCell(c).numFmt = money; }); } }
      }
      const name = ((aprovacao ? 'Aprovação ' : 'Fechamento ') + (F.numero || '') + ' ' + (F.cliente || '')).trim().replace(/[\\/:*?"<>|]+/g, '_') + '.xlsx';
      const ok = await REG.save(name, await wbx.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); if (!ok) toast('Download cancelado');
    }

    // ---------- margens das propostas antigas (sem resumo) ----------
    async function calcularAntigas() {
      const list = (REG.listPropostas() || []).filter((p) => ABERTAS.includes(p.status || 'rascunho') && !(p.resumo && p.resumo.venda > 0));
      let ok = 0; toast('Calculando ' + list.length + ' proposta(s)…');
      for (const p of list) { try { const snap = ctx.snapshotOf(p); await REG.patchProposta(p.id, { resumo: ctx.resumoOf(snap) }); ok++; } catch (e) { /* segue */ } await new Promise((r) => setTimeout(r, 0)); }
      toast(ok + ' proposta(s) com margem calculada'); ctx.render();
    }

    // ---------- eventos ----------
    document.addEventListener('change', (e) => {
      const el = e.target; if (ui.view !== 'margens') return;
      if (el.id === 'mgPer' || el.id === 'mgDiv' || el.id === 'mgFam') { ui[el.id] = el.value; ctx.render(); return; }
      if (el.dataset.rq || el.dataset.ru) {
        const [n, k] = (el.dataset.rq || el.dataset.ru).split('|'); const t = el.value.trim(); const x = parseInput(t, 'num'); if (typeof x !== 'number' || x < 0) { toast('Número inválido'); return; }
        const F = fech.find((f) => f.id === ui.mgId); const it = F && realizado(F).itens.find((y) => y.n === n); const l = it && it.linhas.find((y) => y.k === k); if (!l) return;
        const q = el.dataset.rq ? x : l.qReal, u = el.dataset.ru ? x : l.uReal;
        setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; real[n].l[k] = Object.assign(real[n].l[k] || {}, { q, u, v: Math.round(q * u * 100) / 100 }); }, 'linha ' + (l.desc || k) + ': ' + NF[2].format(q) + ' × ' + brl(u) + ' = ' + brl(q * u)); return; }
      if (el.dataset.real) { const [n, k] = el.dataset.real.split('|'); const t = el.value.trim(); const v = t === '' ? null : parseInput(t, 'num'); if (t !== '' && typeof v !== 'number') { toast('Número inválido'); return; }
        setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; const cur = real[n].l[k] || {}; if (v === null) { delete cur.v; } else cur.v = v; real[n].l[k] = cur; }, 'linha ' + k + (v === null ? ' apagada' : ' = ' + brl(v))); return; }
      if (el.dataset.robs) { const [n, k] = el.dataset.robs.split('|'); setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; real[n].l[k] = Object.assign(real[n].l[k] || {}, { obs: el.value.trim() }); }); return; }
      if (el.dataset.mgexec) { const F = fech.find((f) => f.id === el.dataset.mgexec); if (F) gravar(F.id, Object.assign({}, F, { execucao: el.value })).then(() => { ctx.log && ctx.log({ tipo: 'Execução', ref: F.id, desc: F.numero || F.nome || '', mudancas: [{ campo: 'Execução', de: F.execucao || 'em andamento', para: el.value }] }); if (!shared()) ctx.render(); toast('Execução: ' + el.value); }); return; }
      if (el.id === 'mgNf') { lerNf(ui.mgId, el.files[0]); el.value = ''; }
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      const ok1 = t.closest('[data-rok]'); if (ok1) { const [n, k] = ok1.dataset.rok.split('|'); const F = fech.find((f) => f.id === ui.mgId); const it = F && realizado(F).itens.find((x) => x.n === n); const l = it && it.linhas.find((x) => x.k === k); if (!l) return;
        setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; real[n].l[k] = Object.assign(real[n].l[k] || {}, { q: l.qPrev, u: l.uPrev, v: l.prev, ok: true }); }, 'linha ' + (l.desc || k) + ' conferida = previsto'); return; }
      const oka = t.closest('[data-rokall]'); if (oka) { const n = oka.dataset.rokall; const F = fech.find((f) => f.id === ui.mgId); const it = F && realizado(F).itens.find((x) => x.n === n); if (!it) return; const falta = it.linhas.filter((l) => typeof l.real !== 'number');
        setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; for (const l of falta) real[n].l[l.k] = Object.assign(real[n].l[l.k] || {}, { q: l.qPrev, u: l.uPrev, v: l.prev, ok: true }); }, falta.length + ' linha(s) de ' + (it.nome || n) + ' conferidas = previsto'); return; }
      const cf = t.closest('[data-mgconcl]'); if (cf) { concluirFab(cf.dataset.mgconcl); return; }
      const hr0 = t.closest('[data-hreabrir]'); if (hr0) { const p = (REG.listPropostas() || []).find((x) => x.id === hr0.dataset.hreabrir); if (p) reabrirModal(p); return; }
      const rl = t.closest('[data-mgreal]'); if (rl) { ensure(); const id = rl.dataset.mgreal; if (!liberaReal(id)) { toast(fechDe(id) ? 'O custo real é lançado só com a proposta ganha.' : 'O custo real é lançado depois da baixa da proposta ganha.'); return; } ui.view = 'margens'; ui.mgId = id; ui.mgNova = null; ctx.render(); window.scrollTo(0, 0); const it = rl.dataset.mgitem; if (it) setTimeout(() => { const el = document.getElementById('cr_' + it); if (el) el.scrollIntoView({ block: 'start' }); }, 60); return; }
      const cl = t.closest('[data-mgclose]'); if (cl) { const p = (REG.listPropostas() || []).find((x) => x.id === cl.dataset.mgclose); if (p) fecharModal(p); return; }
      if (ui.view !== 'margens') return;
      const tb = t.closest('[data-mgtab]'); if (tb) { ui.mgTab = tb.dataset.mgtab; ui.apId = null; ctx.render(); return; }
      const op = t.closest('[data-mgopen]'); if (op) { ui.mgId = op.dataset.mgopen; ui.mgNova = null; ctx.render(); window.scrollTo(0, 0); return; }
      if (t.closest('[data-mgback]')) { ui.mgId = null; ctx.render(); return; }
      if (t.closest('[data-mgcalc]')) { calcularAntigas(); return; }
      const xl = t.closest('[data-mgxls]'); if (xl) { const F = fech.find((f) => f.id === xl.dataset.mgxls); if (F) excel(F).catch((er) => toast(er.message || 'Não consegui gerar o Excel')); return; }
      const ro = t.closest('[data-mgreopen]'); if (ro) { const F1 = fech.find((f) => f.id === ro.dataset.mgreopen); const p1 = (REG.listPropostas() || []).find((x) => x.id === ((F1 && F1.propId) || ro.dataset.mgreopen)); if (p1) { reabrirModal(p1); return; } if (!ro.dataset.sure) { ro.dataset.sure = 1; ro.textContent = 'Confirmar: desfazer a baixa'; ro.classList.add('pri'); return; }
        const F = fech.find((f) => f.id === ro.dataset.mgreopen); apagar(ro.dataset.mgreopen).then(async () => { ctx.log && ctx.log({ tipo: 'Baixa desfeita', ref: ro.dataset.mgreopen, desc: F ? (F.numero || F.nome || '') : '', mudancas: [] }); const p = (REG.listPropostas() || []).find((x) => x.id === (F && F.propId)); if (p) await REG.patchProposta(p.id, { status: 'negociacao' }).catch(() => {}); ui.mgId = null; ctx.render(); toast('Baixa desfeita'); }).catch((er) => toast(er.message || 'Não consegui desfazer')); return; }
      const ad = t.closest('[data-rexadd]'); if (ad) { const n = ad.dataset.rexadd;
        modal(`<h2>Custo não previsto</h2><div class="fields"><div class="f span2"><label for="rxD">Descrição</label><input id="rxD" placeholder="retrabalho, frete extra, peça trocada…"></div><div class="f"><label for="rxV">Valor (R$)</label><input id="rxV" inputmode="decimal"></div></div><div style="display:flex;gap:8px"><button class="btn pri" id="rxOk">Lançar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
          $('#rxOk', o).onclick = () => { const d = $('#rxD', o).value.trim(); const v = parseInput($('#rxV', o).value, 'num'); if (!d || typeof v !== 'number') { toast('Preencha descrição e valor'); return; } close(); setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].extras = (real[n].extras || []).concat([{ desc: d, v }]); }); };
          $('#rxD', o).focus(); });
        return; }
      const rd = t.closest('[data-rexdel]'); if (rd) { const [n, i] = rd.dataset.rexdel.split('|'); setReal(ui.mgId, (real) => { if (real[n] && real[n].extras) real[n].extras.splice(+i, 1); }); }
    });

    // ---------- etapas da proposta (página inicial) ----------
    const ETAPAS = [['formacao', 'Conferência ok'], ['cliente', 'Enviada ao cliente'], ['baixa', 'Ganha (baixa)'], ['financeiro', 'Financeiro avisado'], ['engenharia', 'Engenharia avisada'], ['real', 'Custo real lançado'], ['encerrada', 'Encerrada']];
    const dt = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch (e) { return ''; } };
    function etapas(p) {
      ensure(); const F = fechDe(p.id); const e = p.etapas || {}; const st = p.status || 'rascunho'; const perdida = st === 'perdida';
      const R = F ? realizado(F) : null; const ap = aprovDe(p.id);
      const lista = ETAPAS.slice(); lista.splice(1, 0, ['conferida', 'Finalizada']); if (ap) lista.splice(1, 0, ['aprovacao', 'Aprovação']);
      return lista.map(([k, lb]) => {
        let s = 'pend', info = '', act = null;
        if (k === 'formacao') {
          // 1ª etapa: a conferência da proposta (gravada ao salvar) sem nada que impeça ou peça tratamento
          const c = p.checagem; act = 'conferir';
          if (p.div === 'SPV' || p.facts) { s = 'ok'; info = dt(p.at); }
          else if (!c) { if (st !== 'rascunho' || F) { s = 'ok'; info = dt(p.at); } else info = 'salve para conferir'; }
          else if (c.imped) { s = 'bad'; info = c.imped + ' impede(m)'; }
          else if (c.aviso) { s = 'parcial'; info = c.aviso + ' aviso(s)'; }
          else { s = 'ok'; info = dt(c.at || p.at); } }
        else if (k === 'conferida') { const c = p.conferencia; act = 'conferir'; if (conferidaOk(p)) { s = 'ok'; info = dt(c.at); } else if (c) { s = 'parcial'; info = c.ok ? 'PDF desatualizado' : 'PDF com divergências'; } else if (st !== 'rascunho' || F) { s = 'off'; info = 'PDF não conferido'; } else info = 'conferir o PDF'; }
        else if (k === 'aprovacao') { const ea = estadoA(ap); act = 'aprovacao'; if (ea === 'aprovada' && !F && premissaMudou(ap, p.resumo)) { s = 'parcial'; info = 'perdeu a validade: ' + premissaMudou(ap, p.resumo); } else if (ea === 'aprovada') { s = ap.alvo && !ap.aplicadoEm && !F ? 'parcial' : 'ok'; info = s === 'ok' ? 'aprovada' : 'falta aplicar'; } else if (ea === 'reprovada') { s = 'parcial'; info = 'reprovada'; } else { s = 'parcial'; info = comQuem(ap); } }
        else if (k === 'cliente') { if (['enviada', 'negociacao', 'ganha', 'perdida'].includes(st) || F) { s = 'ok'; info = e.cliente ? dt(e.cliente.at) : ''; } else act = 'cliente'; }
        else if (perdida) { s = 'off'; info = k === 'baixa' ? 'perdida' : ''; }
        else if (k === 'baixa') { if (F) { s = 'ok'; info = dt(F.fechadoEm); } else act = 'baixa'; }
        else if (!F) s = 'off';
        else if (k === 'real' && !liberaReal(p)) s = 'off';
        else if (k === 'real') { act = 'real'; if (R.cobertura >= 1 - 1e-9) { s = 'ok'; info = '100%'; } else if (R.apontadas) { s = 'parcial'; info = pct(R.cobertura, 0); } }
        else if (k === 'encerrada') { act = 'marcar'; if (e.encerrada || F.execucao === 'encerrada') { s = 'ok'; info = e.encerrada ? dt(e.encerrada.at) : ''; } }
        else { act = 'avisar'; if (e[k]) { s = 'ok'; info = dt(e[k].at); } }
        return { k, lb, s, info, act, obs: e[k] && e[k].obs };
      });
    }
    const etapaPendente = (p, k) => { const x = etapas(p).find((y) => y.k === k); return x && (x.s === 'pend' || x.s === 'parcial' || x.s === 'bad'); };
    function etapasHtml(p) {
      const L = etapas(p);
      // etapa não feita antes de uma já feita = pulada (–); depois = ainda não chegou (vazia)
      let ultOk = -1; L.forEach((x, i) => { if (x.s === 'ok') ultOk = i; }); L.forEach((x, i) => { if (x.s === 'off' && i < ultOk) x.s = 'pulada'; });
      // a próxima é a primeira em aberto depois da última concluída (as de trás continuam com o seu estado)
      const aberta = (x) => x.s === 'pend' || x.s === 'parcial' || x.s === 'bad';
      const prox = L.find((x, i) => i > ultOk && aberta(x)) || L.find(aberta);
      return `<div class="etapas" style="--n:${L.length}">${L.map((x) => `<button class="etp ${x.s}${prox === x ? ' next' : ''}" data-etp="${esc(p.id)}|${x.k}" title="${esc(x.lb + (x.obs ? ' — ' + x.obs : '') + (x.act === 'marcar' || x.act === 'avisar' ? (x.s === 'ok' ? ' (clique para desmarcar)' : x.act === 'avisar' ? ' (avisar por e-mail)' : ' (clique para marcar)') : x.act === 'real' ? ' (abrir custo real)' : x.act === 'baixa' ? ' (dar baixa)' : x.act === 'cliente' ? ' (marcar como enviada)' : ''))}"${x.s === 'off' || !x.act && x.s !== 'ok' && x.s !== 'pulada' ? ' disabled' : ''}>
        <span class="etc">${x.s === 'ok' ? '✓' : x.s === 'parcial' ? '•' : x.s === 'bad' ? '!' : x.s === 'pulada' ? '–' : ''}</span><span class="etl">${esc(x.lb)}</span>${x.info ? `<small>${esc(x.info)}</small>` : ''}</button>`).join('')}</div>`;
    }
    async function salvarEtapa(p, k, val, desc) {
      await REG.patchProposta(p.id, (r) => { r.etapas = Object.assign({}, r.etapas || {}); if (val) r.etapas[k] = val; else delete r.etapas[k]; });
      ctx.log && ctx.log({ tipo: 'Etapa da proposta', ref: p.id, desc: (p.numero || p.name || '') + ' · ' + (p.cliente || '') + ' — ' + desc, mudancas: [{ campo: (ETAPAS.find((x) => x[0] === k) || [0, k])[1], de: val ? null : 'feito', para: val ? 'feito' + (val.obs ? ' · ' + val.obs : '') : null }] });
      ctx.render();
    }
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-etp]'); if (!b || b.disabled) return;
      const [pid, k] = b.dataset.etp.split('|'); const p = (REG.listPropostas() || []).find((x) => x.id === pid); if (!p) return;
      const x = etapas(p).find((y) => y.k === k); if (!x) return;
      if (x.act === 'baixa') { fecharModal(p); return; }
      if (x.act === 'conferir') { ctx.abrirProposta && ctx.abrirProposta(p, 5); setTimeout(() => { const el = document.getElementById('confCard'); if (el) el.scrollIntoView({ block: 'start' }); }, 80); return; }
      if (x.act === 'aprovacao') { ui.view = 'margens'; ui.mgTab = 'aprovacoes'; ui.mgId = null; ui.apId = p.id; ctx.render(); window.scrollTo(0, 0); return; }
      if (x.act === 'real') { ui.view = 'margens'; ui.mgId = p.id; ui.mgNova = null; ctx.render(); window.scrollTo(0, 0); return; }
      if (x.act === 'cliente') { const bq = ctx.bloqueioEnvio ? ctx.bloqueioEnvio(p) : 0; if (bq) { toast(bq + ' item(ns) da conferência impedem enviar. Veja na etapa Conferência.'); ctx.abrirProposta && ctx.abrirProposta(p, 5); return; } ctx.aoEnviar && ctx.aoEnviar(p);
        REG.patchProposta(p.id, (r) => { r.status = 'enviada'; r.etapas = Object.assign({}, r.etapas || {}, { cliente: { at: new Date().toISOString(), by: REG.me || null } }); }).then(() => { ctx.log && ctx.log({ tipo: 'Etapa da proposta', ref: p.id, desc: (p.numero || '') + ' — enviada ao cliente', mudancas: [{ campo: 'Status', de: p.status || 'rascunho', para: 'enviada' }] }); toast('Marcada como enviada ao cliente'); ctx.render(); }); return; }
      if (x.act === 'avisar' && x.s !== 'ok') { avisarModal(p, [k]); return; }
      if (x.act !== 'marcar' && x.act !== 'avisar') return;
      if (x.s === 'ok') { if (!window.confirm('Desmarcar "' + x.lb + '"?')) return; salvarEtapa(p, k, null, x.lb + ' desmarcada').catch((e) => toast(e.message || 'Não consegui salvar')); return; }
      modal(`<h2>${esc(x.lb)}</h2><p class="sub" style="margin:0">${esc((p.numero || p.name || '') + ' · ' + (p.cliente || ''))}</p>
        <div class="f"><label for="etObs">Observação (opcional)</label><input id="etObs" placeholder="${k === 'financeiro' ? 'ex.: enviado por e-mail para o financeiro com o pedido' : k === 'engenharia' ? 'ex.: enviado para a engenharia lançar o custo real' : 'ex.: projeto entregue e faturado'}"></div>
        <div style="display:flex;gap:8px"><button class="btn pri" id="etOk">Marcar como feito</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#etObs', o).focus();
        $('#etOk', o).onclick = async () => { const obs = $('#etObs', o).value.trim(); close();
          try { await salvarEtapa(p, k, { at: new Date().toISOString(), by: REG.me || null, obs: obs || null }, x.lb + (obs ? ': ' + obs : ''));
            if (k === 'encerrada') { const F = fechDe(p.id); if (F && F.execucao !== 'encerrada') await gravar(F.id, Object.assign({}, F, { execucao: 'encerrada' })); }
            toast(x.lb + ': feito'); } catch (e) { toast(e.message || 'Não consegui salvar'); } };
      });
    });

    // ---------- aviso por e-mail ao Financeiro e à Engenharia ----------
    const avisosCfg = () => Object.assign({ financeiro: '', engenharia: '', diretoria: '', cc: '', link: 'https://claude.ai/artifact/3pa3KFzGLean13jGE6PgSJ' }, ((REG.tabelas || {}).AVISOS || {}).cfg || {});
    const emails = (t) => String(t || '').split(/[;,\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    let mcpP;
    const getMcp = () => { if (mcpP === undefined) mcpP = (window.claude && window.claude.use ? window.claude.use('mcp') : Promise.resolve(null)).catch(() => null); return mcpP; };
    function textoAviso(p, F, areas, cfg) {
      const P = fechado(F); const n = F.numero || F.nome || 'sem número';
      const linhas = [`Olá,`, ``, `A proposta ${n} — ${F.cliente || ''} foi fechada em ${fmtD(F.fechadoEm)}${F.pedido ? ' (pedido ' + F.pedido + ')' : ''}.`,
        `Valor fechado: ${brl(P.venda)} sem IPI · margem líquida fechada: ${pct(P.margemPct, 1)}.`, `Itens:`].concat(P.itens.map((x) => `• ${x.qtd || 1} × ${x.nome}`)).concat(['']);
      if (areas.includes('financeiro')) linhas.push(`Financeiro: a formação completa (custos, impostos, comissões e margem por item) está disponível no LS Pricer em Margens → Ganhas → ${n}, com a planilha do fechamento em Excel.`);
      if (areas.includes('engenharia')) linhas.push(`Engenharia: por favor, lance o custo real de compras e fabricação de cada linha no LS Pricer em Margens → Ganhas → ${n} (botão "Custo real"). A margem realizada é calculada na hora.`);
      linhas.push('', `LS Pricer: ${cfg.link}`, F.obs ? `Observações da negociação: ${F.obs}` : '');
      return { assunto: `Proposta ${n} fechada — formação disponível${F.cliente ? ' · ' + F.cliente : ''}`, corpo: linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() };
    }
    async function marcarAvisadas(p, areas, obs) {
      await REG.patchProposta(p.id, (r) => { r.etapas = Object.assign({}, r.etapas || {}); for (const a of areas) r.etapas[a] = { at: new Date().toISOString(), by: REG.me || null, obs }; });
      ctx.log && ctx.log({ tipo: 'Etapa da proposta', ref: p.id, desc: (p.numero || p.name || '') + ' — ' + areas.map((a) => (ETAPAS.find((x) => x[0] === a) || [0, a])[1]).join(' e ') + (obs ? ': ' + obs : ''), mudancas: areas.map((a) => ({ campo: (ETAPAS.find((x) => x[0] === a) || [0, a])[1], de: null, para: 'feito' })) });
      ctx.render();
    }
    // janela de e-mail genérica: Outlook do usuário (conector Microsoft 365), programa de e-mail ou copiar
    function emailModal(o) {
      modal(`<h2>${esc(o.titulo)}</h2>${o.intro ? `<p class="sub" style="margin:0">${esc(o.intro)}</p>` : ''}
        <div class="fields">
          ${o.grupos.map((g) => `<div class="f span2"><label class="chk"><input type="checkbox" data-eg="${g.k}"${g.on ? ' checked' : ''}> ${esc(g.lb)}</label><input data-egto="${g.k}" value="${esc(g.emails || '')}" placeholder="e-mail ${esc(g.lb.toLowerCase())}"></div>`).join('')}
          <div class="f spanall"><label for="emCc">Cópia</label><input id="emCc" value="${esc(o.cc || '')}" placeholder="opcional"></div>
          <div class="f spanall"><label for="emAss">Assunto</label><input id="emAss" value="${esc(o.assunto)}"></div>
          <div class="f spanall"><label for="emTxt">Mensagem</label><textarea id="emTxt" rows="12"></textarea></div>
        </div>
        ${o.excel ? '<p class="sub" style="margin:0">O Outlook do app envia sem anexo: quem recebe abre a análise no app. Para anexar a planilha, baixe e use "Abrir no meu e-mail".</p>' : ''}
        <p class="sub" id="emMsg" style="margin:0"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="emOutlook" hidden>Enviar pelo Outlook</button><a class="btn" id="emMail" target="_blank" rel="noopener">Abrir no meu e-mail</a>${o.excel ? '<button class="btn" id="emXls">Baixar a planilha</button>' : ''}<button class="btn" id="emCopy">Copiar texto</button>${o.soMarcar ? `<button class="btn" id="emSo">${esc(o.soMarcar)}</button>` : ''}<button class="btn" data-close>Agora não</button></div>`, (m, close) => {
        const g = (q) => $(q, m);
        const sel = () => o.grupos.filter((x) => m.querySelector(`[data-eg="${x.k}"]`).checked).map((x) => x.k);
        const para = () => [].concat(...o.grupos.filter((x) => m.querySelector(`[data-eg="${x.k}"]`).checked).map((x) => emails(m.querySelector(`[data-egto="${x.k}"]`).value)));
        const mail = () => { g('#emMail').href = 'mailto:' + encodeURIComponent(para().join(',')) + '?subject=' + encodeURIComponent(g('#emAss').value) + (emails(g('#emCc').value).length ? '&cc=' + encodeURIComponent(emails(g('#emCc').value).join(',')) : '') + '&body=' + encodeURIComponent(g('#emTxt').value); };
        const refaz = () => { g('#emTxt').value = o.corpo(sel()); mail(); };
        m.querySelectorAll('[data-eg]').forEach((c) => { c.onchange = refaz; }); m.querySelectorAll('[data-egto]').forEach((c) => { c.oninput = mail; }); ['#emCc', '#emAss', '#emTxt'].forEach((q) => { g(q).oninput = mail; }); refaz();
        getMcp().then((x) => { if (x) g('#emOutlook').hidden = false; });
        // lê a seleção antes de fechar a janela
        const fim = async (obs, a, to) => { if (o.onDone) await o.onDone(a, obs, to); };
        g('#emOutlook').onclick = async () => {
          const to = para(); if (!to.length) { g('#emMsg').textContent = 'Informe pelo menos um e-mail válido.'; return; }
          const mc = await getMcp(); if (!mc) { g('#emMsg').textContent = 'O envio pelo Outlook não está disponível aqui. Use "Abrir no meu e-mail".'; return; }
          const html = g('#emTxt').value.split(/\n{2,}/).map((par) => '<p>' + esc(par).replace(/\n/g, '<br>') + '</p>').join('');
          g('#emOutlook').disabled = true; g('#emMsg').textContent = 'Enviando…';
          try {
            await mc.callTool('Microsoft 365', 'outlook_send_mail', Object.assign({ to, subject: g('#emAss').value.slice(0, 255), body: html, bodyType: 'html' }, emails(g('#emCc').value).length ? { cc: emails(g('#emCc').value) } : {}));
            const a = sel(); close(); await fim('e-mail enviado para ' + to.join(', '), a, to); toast('E-mail enviado');
          } catch (e) {
            g('#emOutlook').disabled = false; const c = e && e.code;
            g('#emMsg').textContent = c === 'needs_reauth' ? 'A conexão com o Microsoft 365 expirou: reconecte em claude.ai (Configurações → Conectores) e tente de novo.'
              : c === 'server_not_connected' || c === 'selection_required' ? 'O Microsoft 365 não está conectado na sua conta do claude.ai. Conecte em Configurações → Conectores, ou use "Abrir no meu e-mail".'
              : c === 'not_granted' || c === 'not_in_manifest' ? 'O envio pelo Outlook não foi permitido. Use "Abrir no meu e-mail".'
              : c === 'blocked_by_policy' || c === 'approval_required' ? 'A política da organização não permite enviar e-mail por aqui. Use "Abrir no meu e-mail".'
              : c === 'tool_error' ? 'O Outlook recusou o envio: ' + ((e && e.message) || '') + '. Confira os e-mails.'
              : c === 'cancelled' ? 'Envio cancelado.'
              : 'Não sei se o e-mail saiu (' + (c || 'erro') + '). Confira a pasta Enviados do Outlook antes de tentar de novo.';
          }
        };
        g('#emMail').onclick = () => { setTimeout(() => { if (window.confirm('O e-mail foi enviado?')) { const a = sel(), to = para(); close(); fim('e-mail pelo programa de e-mail para ' + to.join(', '), a, to); } }, 600); };
        g('#emCopy').onclick = () => navigator.clipboard.writeText(g('#emAss').value + '\n\n' + g('#emTxt').value).then(() => toast('Texto copiado'), () => toast('Não consegui copiar'));
        if (o.excel) g('#emXls').onclick = () => o.excel().catch((e) => toast(e.message || 'Não consegui gerar o Excel'));
        const so = g('#emSo'); if (so) so.onclick = async () => { const a = sel(), to = para(); close(); await fim('registrado sem e-mail pelo app', a, to); };
      });
    }
    function avisarModal(p, areas) {
      ensure(); const F = fechDe(p.id); if (!F) { toast('Dê baixa na proposta antes de avisar as áreas.'); return; }
      const cfg = avisosCfg();
      emailModal({ titulo: 'Avisar Financeiro e Engenharia', intro: `A formação da proposta ${F.numero || F.nome || ''} está disponível. Confira o e-mail e envie; as etapas marcam sozinhas.`,
        grupos: [{ k: 'financeiro', lb: 'Financeiro', emails: cfg.financeiro, on: areas.includes('financeiro') }, { k: 'engenharia', lb: 'Engenharia', emails: cfg.engenharia, on: areas.includes('engenharia') }],
        cc: cfg.cc, assunto: textoAviso(p, F, areas, cfg).assunto, corpo: (sel) => textoAviso(p, F, sel, cfg).corpo, excel: () => excel(F), soMarcar: 'Só marcar como avisado',
        onDone: async (a, obs) => { if (!a.length) return; await marcarAvisadas(Object.assign({}, (REG.listPropostas() || []).find((x) => x.id === p.id) || p), a, obs); } });
    }

    // ---------- aprovação de desconto fora da política (Diretoria + Financeiro) ----------
    let aprov = []; let subA = null;
    function ensureA() {
      const m = shared() ? 'shared' : 'local'; if (subA === m || subA === 'shared') return; subA = m;
      if (m === 'shared') REG.db.collection('aprovacoes').orderBy('at', 'desc').limit(300).onSnapshot((s) => { aprov = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); ctx.render(); }, () => {});
      else { try { aprov = Object.entries(JSON.parse(localStorage.getItem('lspricer.aprovacoes.v1') || '{}')).map(([id, x]) => Object.assign({ id }, x)); } catch (e) { aprov = []; } }
    }
    async function gravarA(id, rec) {
      const body = JSON.parse(JSON.stringify(rec)); delete body.id;
      if (shared()) await REG.db.doc('aprovacoes/' + id).set(body);
      else { let all = {}; try { all = JSON.parse(localStorage.getItem('lspricer.aprovacoes.v1') || '{}'); } catch (e) { all = {}; } all[id] = body; try { localStorage.setItem('lspricer.aprovacoes.v1', JSON.stringify(all)); } catch (e) { throw new Error('O navegador não deixou gravar a aprovação (sem espaço). Baixe um backup e libere espaço.'); } aprov = Object.entries(all).map(([k, x]) => Object.assign({ id: k }, x)); ctx.render(); }
    }
    const PAPEIS = [['diretoria', 'Diretoria'], ['financeiro', 'Financeiro']];
    const aprovDe = (propId) => { ensureA(); return aprov.find((a) => a.id === propId) || null; };
    // ---- decisões assinadas ----
    // No app compartilhado, quem decide grava também uma assinatura no próprio espaço do banco (assinaturas/<id>/aprov/…),
    // que a regra do banco só deixa essa pessoa escrever. Todos conferem ao ler: a decisão só conta se a assinatura existe
    // e bate, e se a pessoa está entre os aprovadores do papel (lista que só o dono do app grava) ou é o dono.
    const CORTE_ASSIN = '2026-10-30'; // decisões anteriores à REV22 não têm assinatura: valem como legado
    const assin = {}; const subAs = {};
    function ouvirAssin(uid) {
      if (!uid || subAs[uid] || !shared()) return; subAs[uid] = true; assin[uid] = null;
      REG.db.collection('assinaturas/' + uid + '/aprov').onSnapshot((s) => { assin[uid] = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); ctx.render(); }, () => { assin[uid] = {}; ctx.render(); });
    }
    function decisaoValida(a, k) {
      const x = (a.decisoes || {})[k]; if (!x) return { ok: false };
      if (REG.mode !== 'shared') return { ok: true };
      const lista = (REG.acessos || {})['ap_' + k] || [];
      if (lista.length && !lista.includes(x.by) && !(REG.donoId && x.by === REG.donoId)) return { ok: false, motivo: 'quem decidiu não está entre os aprovadores' };
      if (String(x.at) < CORTE_ASSIN) return { ok: true, legado: true };
      ouvirAssin(x.by); const m = assin[x.by];
      if (!m) return { ok: false, motivo: 'conferindo a assinatura…', carregando: true };
      const sg = m[a.id + '__' + k]; if (!sg || sg.decisao !== x.decisao || sg.at !== x.at) return { ok: false, motivo: 'decisão sem assinatura válida no banco' };
      return { ok: true };
    }
    const decs = (a) => { const out = {}; for (const [k] of PAPEIS) if (decisaoValida(a, k).ok) out[k] = a.decisoes[k]; return out; };
    // premissas da aprovação: custo e itens do momento do pedido. Se mudaram, a aprovação não vale mais.
    function premissaMudou(a, resumo) {
      if (!a || !a.snap || !resumo) return null;
      const c0 = num(a.snap.custo), c1 = num(resumo.custo);
      if (c0 && Math.abs(c1 - c0) / c0 > 0.005) return 'o custo mudou de ' + brl(c0) + ' para ' + brl(c1);
      const nomes = (L) => (L || []).map((x) => String(x.nome || '') + '×' + num(x.qtd || 1)).sort().join('|');
      if (a.snap.itens && resumo.itens && nomes(a.snap.itens) !== nomes(resumo.itens)) return 'os itens ou quantidades mudaram';
      return null;
    }
    const estadoA = (a) => { if (!a) return null; const d = decs(a); if (PAPEIS.some(([k]) => d[k] && d[k].decisao === 'reprovada')) return 'reprovada'; if (PAPEIS.every(([k]) => d[k] && d[k].decisao === 'aprovada')) return 'aprovada'; return 'pendente'; };
    // sem aprovador definido, qualquer Editor decide; o dono sempre pode
    const podeDecidir = (papel) => { if (REG.mode === 'local' || REG.isOwner) return true; const l = (REG.acessos || {})['ap_' + papel] || []; return l.length ? l.includes(REG.me) : !!REG.canEditCadastro; };
    // proposta inteira levada ao valor target: preços, impostos e comissões acompanham; o custo fica
    function escala(snap, k) {
      if (!k || Math.abs(k - 1) < 1e-9) return snap;
      // tudo o que não é custo (impostos, comissões e demais deduções da formação) acompanha o preço
      const itens = snap.itens.map((x) => { const ded = x.venda - num(x.margem) - x.custo; const bf = baseFrac(x); const venda = x.venda * k, impostos = num(x.impostos) * k, comissao = num(x.comissao) * k, margem = venda - ded * k - x.custo;
        return Object.assign({}, x, { bf, venda, ipi: num(x.ipi) * k, impostos, comissao, margem, margemPct: mPct(margem, venda, bf), fatorAplicado: x.fatorAplicado ? x.fatorAplicado * k : x.fatorAplicado }); });
      const sum = (f) => itens.reduce((t, x) => t + num(x[f]), 0); const venda = snap.venda * k, margem = sum('margem'), base = itens.reduce((t, x) => t + x.venda * x.bf, 0);
      return Object.assign({}, snap, { itens, venda, vendaIpi: snap.vendaIpi ? snap.vendaIpi * k : snap.vendaIpi, impostos: sum('impostos'), comissao: sum('comissao'), margem, margemPct: base ? margem / base : 0 });
    }
    const kAlvo = (a) => (a && a.alvo && a.snap.venda ? a.alvo.vendaSem / a.snap.venda : 1);
    const ipiRatio = (snap) => (snap.vendaIpi && snap.venda ? snap.vendaIpi / snap.venda : 1);
    // preço mínimo da proposta pela margem mínima (sem IPI)
    const minPelaMargem = (snap) => { if (!snap.venda) return null; const t = (snap.venda - num(snap.margem) - snap.custo) / snap.venda; const bf = snap.itens.reduce((a, x) => a + x.venda * baseFrac(x), 0) / snap.venda; const d = 1 - t - num(snap.minimo) * bf; return d > 0 ? snap.custo / d : null; };
    // com quem está: papéis que ainda não decidiram, com os nomes de quem cuida de cada um
    const pendPapeis = (a) => { const d = decs(a); return PAPEIS.filter(([k]) => !d[k]); };
    const nomesPapel = (k) => ((REG.acessos || {})['ap_' + k] || []);
    function comQuem(a, html) {
      const pp = pendPapeis(a); if (!pp.length) return '';
      const parte = ([k, lb]) => { const ids = nomesPapel(k); return html && ids.length ? `${lb} (${ids.map((id) => `<span data-uid="${esc(id)}">…</span>`).join(', ')})` : lb; };
      return 'com ' + pp.map(parte).join(' e ');
    }
    function trilha(a) {
      const d = decs(a); const e = estadoA(a);
      const passo = (cls, lb, info) => `<div class="etp ${cls}"><span class="etc">${cls === 'ok' ? '✓' : cls === 'bad' ? '✕' : ''}</span><span class="etl">${lb}</span>${info ? `<small>${info}</small>` : ''}</div>`;
      const quem = (id) => (id ? `<span data-uid="${esc(id)}">…</span>` : '');
      const L = [passo('ok', 'Pedido', `${dt(a.at)} ${quem(a.by)}`)];
      for (const [k, lb] of PAPEIS) { const x = d[k]; const inv = !x && (a.decisoes || {})[k] ? decisaoValida(a, k) : null;
        if (inv && !inv.carregando) L.push(passo('bad', lb + ': decisão não conta', esc(inv.motivo)));
        else if (x) L.push(passo(x.decisao === 'aprovada' ? 'ok' : 'bad', lb + (x.decisao === 'aprovada' ? ' aprovou' : ' reprovou'), `${dt(x.at)} ${quem(x.by)}`));
        else { const ids = nomesPapel(k); L.push(passo(e === 'pendente' ? 'next' : 'pend', lb, e === 'pendente' ? 'aguardando' + (ids.length ? ' ' + ids.map(quem).join(', ') : '') : '')); } }
      if (a.alvo) L.push(passo(a.aplicadoEm ? 'ok' : e === 'aprovada' ? 'next' : 'pend', 'Valor aplicado', a.aplicadoEm ? dt(a.aplicadoEm) : e === 'aprovada' ? 'falta aplicar na proposta' : ''));
      return `<div class="etapas trilha" style="--n:${L.length}">${L.join('')}</div>`;
    }
    async function marcarAplicado(id, valor) { const a = aprov.find((x) => x.id === id); if (!a) return; await gravarA(id, Object.assign({}, a, { aplicadoEm: new Date().toISOString(), aplicadoValor: valor, aplicadoBy: REG.me || null })); }
    // análise no formato da planilha (Reunião): fator mínimo × fator que o preço suporta, por item
    function analise(snap) {
      return snap.itens.map((x) => {
        const icms = x.icmsPct != null ? x.icmsPct : 0; const pis = x.pisPct != null ? x.pisPct : 0.0065, cof = x.cofinsPct != null ? x.cofinsPct : 0.03; const ir = num(x.irPct); const ipi = num(x.ipiPct);
        const div = 1 - (icms + ir + (pis + cof) * (1 - icms)); const fre = num(x.custoFrete), sta = num(x.custoStartup); const aq = x.custo - fre - sta;
        const fmin = x.fatorTabela ? x.fatorTabela * (1 - num(x.descMax)) : null; const preco = x.venda + num(x.ipi);
        const necessario = fmin ? (aq * fmin + fre + sta) / div * (1 + ipi) : null; const suporta = aq ? (preco / (1 + ipi) * div - fre - sta) / aq : null;
        return { nome: x.nome, n: x.n, aq, fre, sta, div, fmin, fatorAplicado: x.fatorAplicado, suporta, necessario, preco, dif: necessario != null ? necessario - preco : null, margemPct: x.margemPct, ok: necessario == null || preco >= necessario - 0.01 };
      });
    }
    function textoAprov(p, snap0, mot, cfg, alvo) {
      const k = alvo && snap0.venda ? alvo.vendaSem / snap0.venda : 1; const snap = escala(snap0, k); const A = analise(snap); const n = p.numero || p.name || 'sem número'; const ri = ipiRatio(snap0);
      const cab = alvo ? [`Peço aprovação para fechar a proposta ${n} — ${p.cliente || ''} pelo valor target de ${brl(alvo.vendaSem * ri)} com IPI (${brl(alvo.vendaSem)} sem IPI).`,
        `Valor atual: ${brl(snap0.venda * ri)} com IPI · desconto pedido: ${pct(1 - k, 1)}.`, `Margem líquida no target: ${pct(snap.margemPct, 1)} (atual ${pct(snap0.margemPct, 1)}; mínimo ${pct(snap0.minimo || 0, 0)}).`]
        : [`Peço aprovação para a proposta ${n} — ${p.cliente || ''}, que está fora da política de preço.`, `Valor proposto: ${brl(snap.venda)} sem IPI · margem líquida: ${pct(snap.margemPct, 1)} (mínimo ${pct(snap.minimo || 0, 0)}).`];
      const l = [`Olá,`, ``].concat(cab, [``, `Justificativa: ${mot || '—'}`, ``, alvo ? `Itens no valor target:` : `Itens:`])
        .concat(A.map((x) => `• ${x.nome}: margem ${pct(x.margemPct, 1)}; fator aplicado ${x.fatorAplicado ? NF[4].format(x.fatorAplicado) : '—'} × mínimo ${x.fmin ? NF[4].format(x.fmin) : '—'}${x.dif != null && x.dif > 0.01 ? '; faltam ' + brl(x.dif) + ' para a política' : ''}.`))
        .concat(['', `Para analisar e aprovar: LS Pricer → Margens → Aprovações → ${n}. A análise está no formato da planilha (Reunião e Base), com o Excel para baixar.`, `LS Pricer: ${cfg.link}`]);
      return { assunto: `Aprovação de desconto · proposta ${n}${alvo ? ' · target ' + brl(alvo.vendaSem * ri) : ''}${p.cliente ? ' · ' + p.cliente : ''}`, corpo: l.join('\n') };
    }
    const fAprov = (p, a) => ({ id: p.id, propId: p.id, div: p.div || 'SEQ', tipo: p.tipo || null, numero: p.numero || '', cliente: p.cliente || '', nome: p.name || '', fechadoEm: (a && a.at || new Date().toISOString()).slice(0, 10), pedido: '', obs: 'Análise para aprovação de desconto', modo: 'aprovacao', vendaProposta: a.snap.venda, valorFechado: a.alvo ? a.alvo.vendaSem : a.snap.venda, snap: a.snap, real: {}, execucao: '' });
    function pedirAprovacao(p, snap, alvoIpi) {
      ensureA(); const cfg = avisosCfg(); const ri = ipiRatio(snap); const minS = minPelaMargem(snap);
      const ant = aprovDe(p.id); const ini = typeof alvoIpi === 'number' ? { base: 'com', vendaSem: alvoIpi / ri } : ant && ant.alvo ? ant.alvo : null;
      modal(`<h2>Pedir aprovação da proposta</h2><p class="sub" style="margin:0">${esc((p.numero || p.name || '') + (p.cliente ? ' · ' + p.cliente : ''))}. Diga por quanto quer fechar; Diretoria e Financeiro analisam esse valor e aprovam no app.</p>
        <div class="kpis"><div class="kpi"><span>Valor atual (com IPI)</span><b>${brl(snap.venda * ri)}</b><em>${brl(snap.venda)} sem IPI</em></div><div class="kpi"><span>Margem atual</span><b>${pct(snap.margemPct, 1)}</b><em>mínimo ${pct(snap.minimo || 0, 0)}</em></div><div class="kpi"><span>Menor preço pela margem mínima</span><b>${minS ? brl(minS * ri) : '—'}</b><em>com IPI</em></div></div>
        <div class="fields"><div class="f span2 req"><label for="apAlvo">Valor target</label><input id="apAlvo" inputmode="decimal" placeholder="ex.: 4.000.000,00" value="${ini ? esc(NF[2].format(ini.base === 'sem' ? ini.vendaSem : ini.vendaSem * ri)) : ''}"></div>
          <div class="f span2"><label>O valor é</label><div class="seg" role="radiogroup"><label><input type="radio" name="apBase" value="com"${!ini || ini.base !== 'sem' ? ' checked' : ''}>com IPI</label><label><input type="radio" name="apBase" value="sem"${ini && ini.base === 'sem' ? ' checked' : ''}>sem IPI</label></div></div></div>
        <div id="apPrev" class="banner info" style="margin:0">Digite o valor target para ver desconto e margem.</div>
        <div class="f req"><label for="apMot">Justificativa</label><textarea id="apMot" rows="3" placeholder="ex.: cliente estratégico, concorrente fechou por R$ X, volume do contrato anual…"></textarea></div>
        <div style="display:flex;gap:8px"><button class="btn pri" id="apOk">Continuar para o e-mail</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        const ler = () => { const v = parseInput($('#apAlvo', o).value.trim(), 'num'); if (typeof v !== 'number' || v <= 0) return null; const base = (o.querySelector('input[name="apBase"]:checked') || {}).value || 'com'; return { valor: v, base, vendaSem: base === 'com' ? v / ri : v }; };
        const prev = () => { const al = ler(); const el = $('#apPrev', o); if (!al) { el.className = 'banner info'; el.textContent = 'Digite o valor target para ver desconto e margem.'; return; }
          const k = al.vendaSem / snap.venda; const sc = escala(snap, k); const abaixo = analise(sc).filter((x) => !x.ok).length; const ruim = sc.margemPct < num(snap.minimo) - 5e-4;
          el.className = 'banner ' + (ruim || abaixo ? 'warn' : 'ok');
          el.innerHTML = `Target ${brl(al.vendaSem * ri)} com IPI · <b>${k <= 1 ? 'desconto de ' + pct(1 - k, 1) : 'acréscimo de ' + pct(k - 1, 1)}</b> sobre o atual · margem líquida no target <b>${pct(sc.margemPct, 1)}</b> (mínimo ${pct(snap.minimo || 0, 0)})${abaixo ? ` · ${abaixo} item(ns) abaixo do fator mínimo` : ''}.`; };
        $('#apAlvo', o).oninput = prev; o.querySelectorAll('input[name="apBase"]').forEach((x) => { x.onchange = prev; }); prev(); $('#apAlvo', o).focus();
        $('#apOk', o).onclick = async () => {
          const alvo = ler(); if (!alvo) { toast('Informe o valor target'); $('#apAlvo', o).focus(); return; }
          const mot = $('#apMot', o).value.trim(); if (!mot) { toast('Escreva a justificativa'); return; } close();
          const k = alvo.vendaSem / snap.venda; const sc = escala(snap, k);
          const rec = { propId: p.id, uid: p.uid || null, numero: p.numero || '', cliente: p.cliente || '', nome: p.name || '', div: p.div || 'SEQ', at: new Date().toISOString(), by: REG.me || null, motivo: mot, snap, alvo: Object.assign(alvo, { k, margemPct: sc.margemPct }), decisoes: {} };
          try { await gravarA(p.id, rec); ctx.log && ctx.log({ tipo: 'Aprovação solicitada', ref: p.id, desc: (p.numero || p.name || '') + ' · ' + (p.cliente || '') + ' — target ' + brl(alvo.vendaSem * ri) + ' — ' + mot, mudancas: [{ campo: 'Valor atual (sem IPI)', de: null, para: snap.venda }, { campo: 'Valor target (sem IPI)', de: null, para: alvo.vendaSem }, { campo: 'Margem no target', de: snap.margemPct, para: sc.margemPct }] }); }
          catch (e) { toast((e && e.message) || 'Não consegui registrar o pedido'); return; }
          const t = textoAprov(p, snap, mot, cfg, rec.alvo);
          emailModal({ titulo: 'Pedir aprovação à Diretoria e ao Financeiro', intro: 'O pedido já está no app (Margens → Aprovações). Envie o aviso por e-mail.',
            grupos: [{ k: 'diretoria', lb: 'Diretoria', emails: cfg.diretoria, on: true }, { k: 'financeiro', lb: 'Financeiro', emails: cfg.financeiro, on: true }], cc: cfg.cc, assunto: t.assunto, corpo: () => t.corpo,
            excel: () => excel(fAprov(p, rec), true), onDone: async (a, obs) => { ctx.log && ctx.log({ tipo: 'Aprovação solicitada', ref: p.id, desc: 'aviso: ' + obs, mudancas: [] }); } });
          ctx.render();
        };
      });
    }
    function vAprovacoes() {
      ensureA();
      if (ui.apId) return vAprovDetalhe(ui.apId);
      const rows = aprov.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).map((a) => { const e = estadoA(a); const pill = { pendente: 'warn', aprovada: 'ok', reprovada: 'bad' }[e];
        return `<tr class="click" data-apopen="${esc(a.id)}"><td>${esc(fmtD(a.at))}</td><td><span class="divb ${String(a.div || 'SEQ').toLowerCase()}">${esc(a.div || 'SEQ')}</span> <b>${esc(a.numero || '—')}</b><br><small class="sub">${esc(a.cliente || a.nome || '')}</small></td><td class="n">${a.alvo ? `${brl(a.alvo.vendaSem * ipiRatio(a.snap))}<br><small class="sub">atual ${brl(a.snap.venda * ipiRatio(a.snap))}</small>` : brl(a.snap.venda)}</td><td class="n">${pct(escala(a.snap, kAlvo(a)).margemPct, 1)}</td>
          <td>${PAPEIS.map(([k, lb]) => { const d = decs(a)[k]; return `<span class="pill ${d ? (d.decisao === 'aprovada' ? 'ok' : 'bad') : 'mute'}">${lb}: ${d ? d.decisao : 'pendente'}</span>`; }).join(' ')}</td><td><span class="pill ${pill}">${e === 'pendente' ? esc(comQuem(a)) : e}</span>${e === 'aprovada' && a.alvo && !a.aplicadoEm ? '<br><small class="sub">falta aplicar na proposta</small>' : ''}</td><td><button class="btn sm pri" data-apopen="${esc(a.id)}">Analisar</button></td></tr>`; }).join('');
      return `<section class="card"><h2>Aprovações de desconto <span class="sub">propostas fora da política</span></h2><div class="tw"><table class="t"><thead><tr><th>Pedido</th><th>Proposta</th><th>Valor target</th><th>Margem no target</th><th>Decisões</th><th>Onde está</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="sub">Nenhum pedido de aprovação.</td></tr>'}</tbody></table></div></section>`;
    }
    function vAprovDetalhe(id) {
      const a = aprov.find((x) => x.id === id); if (!a) { ui.apId = null; return '<p class="sub">Pedido não encontrado.</p>'; }
      const k = kAlvo(a); const sc = escala(a.snap, k); const A = analise(sc); const A0 = analise(a.snap); const e = estadoA(a); const d = decs(a); const ri = ipiRatio(a.snap);
      const fx = (v) => (typeof v === 'number' && isFinite(v) ? NF[4].format(v) + 'x' : '—');
      const linha = (lb, f, cls = '') => `<tr class="${cls}"><td>${lb}</td>${A.map((x) => `<td class="n">${f(x)}</td>`).join('')}</tr>`;
      const tabela = `<div class="tw"><table class="t"><thead><tr><th>Etapa</th>${A.map((x) => `<th>${esc(x.n && /^ITEM/.test(x.n) ? x.n : x.nome.slice(0, 24))}</th>`).join('')}</tr></thead><tbody>
        ${linha('Custo de aquisição', (x) => brl(x.aq))}${linha('(+) Frete embutido', (x) => brl(x.fre))}${linha('(+) Start-up embutido', (x) => brl(x.sta))}${linha('Divisor dos tributos (antes do IPI)', (x) => NF[4].format(x.div))}
        ${linha('Fator aplicado na proposta', (x) => fx(x.fatorAplicado))}${linha('Fator mínimo aprovado (política)', (x) => fx(x.fmin))}${linha('<b>Fator que o preço suporta</b>', (x) => `<b class="${x.fmin && x.suporta < x.fmin - 1e-4 ? 'bad-t' : 'ok-t'}">${fx(x.suporta)}</b>`, 'tot')}
        ${linha('Preço necessário pela política', (x) => (x.necessario != null ? brl(x.necessario) : '—'))}${a.alvo ? linha('Preço atual da proposta (com IPI)', (x) => brl(A0[A.indexOf(x)].preco)) : ''}${linha(a.alvo ? '<b>Preço no valor target (com IPI)</b>' : 'Preço proposto (com IPI)', (x) => brl(x.preco))}${linha('<b>Diferença até a política</b>', (x) => (x.dif != null ? `<b class="${x.dif > 0.01 ? 'bad-t' : 'ok-t'}">${brl(x.dif)}</b>` : '—'), 'tot')}
        ${linha(a.alvo ? 'Margem líquida no target' : 'Margem líquida', (x) => pct(x.margemPct, 1))}${linha('Conclusão', (x) => `<span class="pill ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'atende à política' : 'abaixo da política'}</span>`)}</tbody></table></div>`;
      const dec = PAPEIS.map(([k, lb]) => { const x = d[k]; const pode = podeDecidir(k);
        return `<div class="kpi"><span>${lb}</span>${x ? `<b class="${x.decisao === 'aprovada' ? 'ok-t' : 'bad-t'}">${x.decisao}</b><em>${esc(fmtD(x.at))} · <span data-uid="${esc(x.by || '')}">${x.by ? '…' : ''}</span>${x.comentario ? ' · ' + esc(x.comentario) : ''}</em>` : `<b>pendente</b><em>${pode ? `<button class="btn sm pri" data-apdec="${esc(a.id)}|${k}|aprovada">Aprovar</button> <button class="btn sm" data-apdec="${esc(a.id)}|${k}|reprovada">Reprovar</button>` : 'aguardando quem cuida desta aprovação'}</em>`}</div>`; }).join('');
      return `<div class="stack"><div class="flowhead"><div><button class="btn sm" data-apback>← Aprovações</button><h1 style="margin-top:8px">Aprovação · ${esc(a.numero || a.nome || '')}</h1><div class="sub">${esc(a.cliente || '')} · pedido em ${esc(fmtD(a.at))} por <span data-uid="${esc(a.by || '')}">${a.by ? '…' : 'alguém da equipe'}</span></div></div>
        <div class="sumbar">${a.alvo ? `<div><span>Valor atual</span><b>${brl(a.snap.venda * ri)}</b></div><div><span>Valor target</span><b>${brl(a.alvo.vendaSem * ri)}</b></div><div><span>Desconto</span><b>${pct(1 - k, 1)}</b></div>` : `<div><span>Valor proposto</span><b>${brl(a.snap.venda)}</b></div>`}<div><span>${a.alvo ? 'Margem no target' : 'Margem líquida'}</span><b class="${sc.margemPct < num(a.snap.minimo) - 5e-4 ? 'bad-t' : 'ok-t'}">${pct(sc.margemPct, 1)}</b></div><div><span class="pill ${{ pendente: 'warn', aprovada: 'ok', reprovada: 'bad' }[e]}">${e}</span></div></div></div>
        <section class="card"><h2>Onde está <span class="sub">${e === 'pendente' ? esc(comQuem(a)) : e === 'aprovada' ? (a.alvo && !a.aplicadoEm ? 'aprovada · falta aplicar o valor na proposta' : 'aprovada') : 'reprovada'}</span></h2>${trilha(a)}
          <div class="kpis" style="margin-top:10px">${dec}</div>
          <div class="docbar" style="margin-top:8px"><button class="btn" data-approp="${esc(a.id)}">Abrir a proposta</button></div></section>
        <section class="card"><h2>Justificativa</h2><p style="margin:0">${esc(a.motivo || '')}</p></section>
        <section class="card"><h2>Análise no formato da planilha <span class="sub">${a.alvo ? 'no valor target · ' : ''}fator mínimo × fator que o preço suporta · valores com IPI</span></h2>${tabela}<div class="docbar" style="margin-top:10px"><button class="btn" data-apxls="${esc(a.id)}">Baixar a planilha (Reunião e Base)</button></div></section>
        </div>`;
    }
    document.addEventListener('click', (ev) => {
      const t = ev.target;
      const op = t.closest('[data-apopen]'); if (op && !t.closest('[data-apdec]')) { ui.view = 'margens'; ui.mgTab = 'aprovacoes'; ui.mgId = null; ui.apId = op.dataset.apopen; ctx.render(); window.scrollTo(0, 0); return; }
      if (t.closest('[data-apback]')) { ui.apId = null; ctx.render(); return; }
      const ap2 = t.closest('[data-approp]'); if (ap2) { const p = (REG.listPropostas() || []).find((x) => x.id === ap2.dataset.approp); if (!p) { toast('Proposta não encontrada'); return; } ctx.abrirProposta && ctx.abrirProposta(p, 5); return; }
      const xl = t.closest('[data-apxls]'); if (xl) { const a = aprov.find((x) => x.id === xl.dataset.apxls); if (a) excel(fAprov({ id: a.id, numero: a.numero, cliente: a.cliente, name: a.nome, div: a.div }, a), true).catch((e) => toast(e.message || 'Não consegui gerar o Excel')); return; }
      const dc = t.closest('[data-apdec]'); if (dc) { const [id, papel, decisao] = dc.dataset.apdec.split('|'); const a = aprov.find((x) => x.id === id); if (!a) return;
        modal(`<h2>${decisao === 'aprovada' ? 'Aprovar' : 'Reprovar'} · ${esc(PAPEIS.find((x) => x[0] === papel)[1])}</h2><div class="f"><label for="adCom">Comentário${decisao === 'reprovada' ? ' (obrigatório)' : ' (opcional)'}</label><input id="adCom" placeholder="${decisao === 'aprovada' ? 'ex.: aprovado com prazo de pagamento 28 DDL' : 'ex.: margem baixa demais; tentar 30%'}"></div><div style="display:flex;gap:8px"><button class="btn pri" id="adOk">Confirmar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
          $('#adCom', o).focus();
          $('#adOk', o).onclick = async () => { const com = $('#adCom', o).value.trim(); if (decisao === 'reprovada' && !com) { toast('Escreva o motivo'); return; } close();
            const at = new Date().toISOString();
            const rec = Object.assign({}, a, { decisoes: Object.assign({}, a.decisoes || {}, { [papel]: { decisao, comentario: com || null, at, by: REG.me || null } }) });
            if (shared() && !REG.me) { toast('Não consegui identificar você no app compartilhado; a decisão precisa ser assinada. Recarregue a página.'); return; }
            try { if (shared()) await REG.db.doc('assinaturas/' + REG.me + '/aprov/' + id + '__' + papel).set({ propId: id, papel, decisao, at, comentario: com || null });
              await gravarA(id, rec); const d2 = Object.assign({}, decs(a), { [papel]: rec.decisoes[papel] }); if (PAPEIS.every(([k]) => d2[k] && d2[k].decisao === 'aprovada') && ctx.aoAprovar) ctx.aoAprovar(a.propId || id); ctx.log && ctx.log({ tipo: 'Aprovação — ' + decisao, ref: id, desc: (a.numero || '') + ' · ' + papel + (com ? ': ' + com : ''), mudancas: [{ campo: papel, de: 'pendente', para: decisao }] }); toast('Decisão registrada'); }
            catch (e) { toast((e && e.message) || 'Não consegui registrar'); } };
        }); }
    });

    // próximo passo de cada proposta (botão principal na página inicial)
    function proximo(p) {
      ensure(); const F = fechDe(p.id); const st = p.status || 'rascunho'; const e = p.etapas || {};
      if (st === 'perdida') return { lb: 'Reabrir', act: 'reabrir' };
      const ap = aprovDe(p.id);
      if (!F && ap) { const ea = estadoA(ap);
        if (ea === 'pendente') return PAPEIS.some(([k]) => !decs(ap)[k] && podeDecidir(k)) ? { lb: 'Analisar aprovação', act: 'aprovacao' } : { lb: 'Ver aprovação', act: 'aprovacao' };
        if (ea === 'aprovada' && ap.alvo && !ap.aplicadoEm) return { lb: 'Aplicar valor aprovado', act: 'aplicar' };
        if (ea === 'reprovada') return { lb: 'Ver motivo', act: 'aprovacao' }; }
      if (!F && st === 'rascunho' && !conferidaOk(p)) return { lb: 'Conferir PDF', act: 'conferir' };
      if (!F) return st === 'rascunho' ? { lb: 'Enviar ao cliente', act: 'cliente' } : { lb: 'Dar baixa', act: 'baixa' };
      if (!e.financeiro || !e.engenharia) return { lb: 'Avisar áreas', act: 'avisar' };
      if (liberaReal(p) && realizado(F).cobertura < 1 - 1e-9) return { lb: 'Lançar custo real', act: 'real' };
      if (!(e.encerrada || F.execucao === 'encerrada')) return { lb: 'Encerrar', act: 'encerrar' };
      return null;
    }
    // fases da proposta: um só vocabulário para a situação, os filtros, o painel e o menu Margens
    const FASES = [['aberto', 'Em aberto'], ['aprovacao', 'Em aprovação'], ['enviada', 'Enviada ao cliente'], ['ganha', 'Ganha'], ['encerrada', 'Encerrada'], ['perdida', 'Perdida']];
    const faseLb = (k) => (FASES.find((x) => x[0] === k) || FASES[0])[1];
    // [texto, cor, fase, detalhe]: o texto é a fase e, quando houver, o detalhe ("Em aprovação · com Diretoria")
    function situacao(p) {
      const F = fechDe(p.id); const st = p.status || 'rascunho'; const e = p.etapas || {};
      const S = (fase, cls, det) => [faseLb(fase) + (det ? ' · ' + det : ''), cls, fase, det || ''];
      if (st === 'perdida') return S('perdida', 'bad'); if (F && (e.encerrada || F.execucao === 'encerrada')) return S('encerrada', 'ok');
      if (F) return S('ganha', 'ok');
      const ap = aprovDe(p.id); if (ap) { const e2 = estadoA(ap); if (e2 === 'pendente') return S('aprovacao', 'warn', comQuem(ap)); if (e2 === 'reprovada') return S('aberto', 'bad', 'desconto reprovado'); if (premissaMudou(ap, p.resumo)) return S('aberto', 'bad', 'aprovação perdeu a validade'); if (ap.alvo && !ap.aplicadoEm) return S('aprovacao', 'ok', 'aprovada, falta aplicar'); }
      if (st === 'enviada' || st === 'negociacao') return S('enviada', 'warn', st === 'negociacao' ? 'em negociação' : ''); return S('aberto', 'mute');
    }
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-hnext]'); const pd = ev.target.closest('[data-hperdida]'); if (!b && !pd) return;
      const [pid, act] = (b ? b.dataset.hnext : pd.dataset.hperdida + '|perdida').split('|'); const p = (REG.listPropostas() || []).find((x) => x.id === pid); if (!p) return;
      const salvaStatus = async (status, extra, desc) => { await REG.patchProposta(p.id, (r) => { r.status = status; for (const [k, v] of Object.entries(extra || {})) { if (k === 'etapas') r.etapas = Object.assign({}, r.etapas || {}, v); else r[k] = v; } }); ctx.log && ctx.log({ tipo: 'Status da proposta', ref: p.id, desc: (p.numero || p.name || '') + ' · ' + (p.cliente || '') + (desc ? ' — ' + desc : ''), mudancas: [{ campo: 'Status', de: p.status || 'rascunho', para: status }] }); ctx.render(); };
      if (act === 'cliente') { const bq = ctx.bloqueioEnvio ? ctx.bloqueioEnvio(p) : 0; if (bq) { toast(bq + ' item(ns) da conferência impedem enviar. Veja na etapa Conferência.'); ctx.abrirProposta && ctx.abrirProposta(p, 5); return; } ctx.aoEnviar && ctx.aoEnviar(p); salvaStatus('enviada', { etapas: Object.assign({}, p.etapas || {}, { cliente: { at: new Date().toISOString(), by: REG.me || null } }) }).then(() => toast('Marcada como enviada ao cliente')); return; }
      if (act === 'baixa') { fecharModal(p); return; }
      if (act === 'aplicar') { ctx.abrirProposta && ctx.abrirProposta(p, 5); return; }
      if (act === 'conferir') { ctx.abrirProposta && ctx.abrirProposta(p, 5); setTimeout(() => { const el = document.getElementById('confCard'); if (el) el.scrollIntoView({ block: 'start' }); }, 80); return; }
      if (act === 'aprovacao') { ui.view = 'margens'; ui.mgTab = 'aprovacoes'; ui.mgId = null; ui.apId = p.id; ctx.render(); window.scrollTo(0, 0); return; }
      if (act === 'avisar') { const e = p.etapas || {}; avisarModal(p, ['financeiro', 'engenharia'].filter((a) => !e[a])); return; }
      if (act === 'real') { ui.view = 'margens'; ui.mgId = p.id; ui.mgNova = null; ctx.render(); window.scrollTo(0, 0); return; }
      if (act === 'encerrar') { const x = document.querySelector(`[data-etp="${CSS.escape(p.id)}|encerrada"]`); if (x) x.click(); return; }
      if (act === 'reabrir') { salvaStatus('enviada', null, 'reaberta').then(() => toast('Proposta reaberta')); return; }
      if (act === 'perdida') {
        modal(`<h2>Proposta perdida</h2><p class="sub" style="margin:0">${esc((p.numero || p.name || '') + ' · ' + (p.cliente || ''))}</p><div class="f"><label for="pdMot">Motivo (fica no histórico e ajuda a entender as perdas)</label><input id="pdMot" placeholder="preço, prazo, concorrente, projeto cancelado…"></div><div style="display:flex;gap:8px"><button class="btn pri" id="pdOk2">Marcar como perdida</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
          $('#pdMot', o).focus(); $('#pdOk2', o).onclick = () => { const mot = $('#pdMot', o).value.trim(); if (!mot) { toast('Escreva o motivo'); return; } close(); salvaStatus('perdida', { motivoPerda: mot }, 'perdida: ' + mot).then(() => toast('Marcada como perdida')); };
        }); }
    });

    // ---------- minhas pendências: o que espera por mim, por papel ----------
    const dias = (iso) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return isFinite(d) ? (d <= 0 ? 'hoje' : d === 1 ? 'há 1 dia' : 'há ' + d + ' dias') : ''; };
    const aprovadorDe = (papel) => { if (REG.mode === 'local' || REG.isOwner) return true; const l = (REG.acessos || {})['ap_' + papel] || []; return l.length ? l.includes(REG.me) : !!REG.canEditCadastro; };
    function secoesPendencias() {
      ensure(); ensureA(); const S = []; const props = REG.listPropostas() || [];
      const nomeP = (id) => { const q = props.find((x) => x.id === id); return q ? (q.numero || q.name || '') + (q.cliente ? ' · ' + q.cliente : '') : ''; };
      for (const [k, lb] of PAPEIS) {
        if (!aprovadorDe(k)) continue;
        const L = aprov.filter((a) => estadoA(a) === 'pendente' && !decs(a)[k]).map((a) => ({ titulo: (a.numero || a.nome || '') + (a.cliente ? ' · ' + a.cliente : ''), sub: a.alvo ? `target ${brl(a.alvo.vendaSem * ipiRatio(a.snap))} · desconto ${pct(1 - a.alvo.k, 1)} · margem ${pct(escala(a.snap, kAlvo(a)).margemPct, 1)}` : 'margem ' + pct(a.snap.margemPct, 1), desde: a.at, btn: ['Analisar', `data-apopen="${esc(a.id)}"`] }));
        S.push({ k: 'ap_' + k, titulo: 'Aprovar descontos', papel: lb, itens: L });
      }
      if (aprovadorDe('financeiro')) S.push({ k: 'fin_rel', titulo: 'Relatórios previsto × realizado para conferir', papel: 'Financeiro',
        itens: fech.filter((F) => F.execucao === 'fabricação concluída' && !F.finConferido).map((F) => { const R = realizado(F); return { titulo: (F.numero || F.nome || '') + (F.cliente ? ' · ' + F.cliente : ''), sub: `previsto ${brl(R.custo)} · realizado ${brl(R.custoReal)} (${R.custoReal - R.custo >= 0 ? '+' : '−'}${brl(Math.abs(R.custoReal - R.custo)).replace('R$ ', '')})`, desde: F.concluidaEm || F.fechadoEm, btn: ['Ver relatório', `data-mgopen="${esc(F.id)}"`], btn2: ['Conferido', `data-finok="${esc(F.id)}"`] }; }) });
      if (canReal()) S.push({ k: 'real', titulo: 'Custo real a lançar', papel: 'Engenharia e Custos',
        itens: fech.filter((F) => liberaReal(F.id)).map((F) => ({ F, R: realizado(F) })).filter((x) => x.R.cobertura < 1 - 1e-9).map(({ F, R }) => ({ titulo: (F.numero || F.nome || '') + (F.cliente ? ' · ' + F.cliente : ''), sub: `${R.apontadas} de ${R.linhas} linhas conferidas · ${F.execucao || 'em andamento'}`, desde: F.fechadoEm, btn: ['Lançar custo real', `data-mgreal="${esc(F.id)}"`] })) });
      for (const x of (ctx.pendExtra ? ctx.pendExtra() : [])) S.push(x);
      // minhas propostas: o próximo passo que é meu (não o que espera por outra pessoa)
      const minhas = props.filter((q) => (REG.mode === 'local' || !q.by || q.by === REG.me) && q.status !== 'perdida').map((q) => ({ q, nx: proximo(q) })).filter((x) => x.nx && !['aprovacao', 'encerrar', 'real'].includes(x.nx.act));
      S.push({ k: 'minhas', titulo: 'Minhas propostas', papel: 'Comercial', itens: minhas.map(({ q, nx }) => ({ titulo: (q.numero || q.name || '') + (q.cliente ? ' · ' + q.cliente : ''), sub: situacao(q)[0], desde: q.at, btn: [nx.lb, `data-hnext="${esc(q.id)}|${nx.act}"`] })) });
      return S;
    }
    const nPendencias = () => secoesPendencias().reduce((t, x) => t + x.itens.length, 0);
    function vPendencias() {
      const S = secoesPendencias(); const tot = S.reduce((t, x) => t + x.itens.length, 0);
      const sec = (x) => `<section class="card"><h2>${esc(x.titulo)} <span class="pill ${x.itens.length ? 'warn' : 'ok'}">${x.itens.length || 'nada pendente'}</span> <span class="sub">${esc(x.papel)}</span></h2>
        ${x.itens.length ? `<div class="tw"><table class="t"><tbody>${x.itens.sort((a, b) => String(a.desde).localeCompare(String(b.desde))).map((i) => `<tr><td><b>${esc(i.titulo)}</b><br><small class="sub">${esc(i.sub || '')}</small></td><td class="sub" style="white-space:nowrap">${esc(dias(i.desde))}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm pri" ${i.btn[1]}>${esc(i.btn[0])}</button>${i.btn2 ? ` <button class="btn sm" ${i.btn2[1]}>${esc(i.btn2[0])}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
      const comItens = S.filter((x) => x.itens.length), vazias = S.filter((x) => !x.itens.length);
      const quem = REG.mode === 'local' ? 'Neste navegador você vê as pendências de todas as áreas.' : REG.areasConfiguradas() || Object.keys(REG.acessos || {}).some((k) => /^ap_/.test(k)) ? 'Mostrando as áreas e aprovações em que você está (Configurações → Responsáveis, e-mails e logo).' : 'Ninguém foi definido por área ainda: todo Editor vê todas as pendências. Defina em Configurações → Responsáveis, e-mails e logo.';
      return `<div class="stack"><div class="flowhead"><div><h1>Minhas pendências</h1><div class="sub">${tot ? tot + ' coisa(s) esperando por você, as mais antigas primeiro.' : 'Nada esperando por você agora.'} ${esc(quem)}</div></div></div>
        ${comItens.map(sec).join('')}${ctx.acompanhamento ? ctx.acompanhamento() : ''}${vazias.length ? `<section class="card"><h2>Em dia</h2><div style="display:flex;gap:6px;flex-wrap:wrap">${vazias.map((x) => `<span class="pill ok">✓ ${esc(x.titulo)} · ${esc(x.papel)}</span>`).join('')}</div></section>` : ''}</div>`;
    }
    // resumo para a tela inicial
    function resumoPendencias() {
      const S = secoesPendencias().filter((x) => x.itens.length); if (!S.length) return '';
      return `<div class="pendbar"><b>Esperando por você:</b> ${S.map((x) => `<button class="pill warn apselo" data-view="pendencias">${x.itens.length} · ${esc(x.titulo.toLowerCase())}${/^ap_/.test(x.k) ? ' (' + esc(x.papel) + ')' : ''}</button>`).join(' ')}</div>`;
    }
    document.addEventListener('click', async (ev) => {
      const fo = ev.target.closest('[data-finok]'); if (!fo) return; const F = fech.find((f) => f.id === fo.dataset.finok); if (!F) return;
      try { await gravar(F.id, Object.assign({}, F, { finConferido: { at: new Date().toISOString(), by: REG.me || null } })); ctx.log && ctx.log({ tipo: 'Custo real', ref: F.id, desc: (F.numero || F.nome || '') + ' — relatório previsto × realizado conferido pelo Financeiro', mudancas: [] }); if (!shared()) ctx.render(); toast('Marcado como conferido'); } catch (e) { toast((e && e.message) || 'Não consegui salvar'); }
    });
    return { FASES, faseLb, podeReabrir, vPendencias, resumoPendencias, nPendencias, conferidaOk, liberaReal, escala, ipiRatio, comQuem, marcarAplicado, lista: () => { ensure(); return fech; }, vMargens, fecharModal, ensure, fechDe, excel, etapasHtml, etapaPendente, avisarModal, proximo, situacao, pedirAprovacao, aprovDe, estadoA, realizado, listaAprov: () => { ensureA(); return aprov; }, decs, decisaoValida, premissaMudou, ensureA, pendentesAprov: () => { ensureA(); return aprov.filter((a) => estadoA(a) === 'pendente' && PAPEIS.some(([k]) => !decs(a)[k] && podeDecidir(k))).length; } };
  }
  window.PricerMargens = Margens;
})();
