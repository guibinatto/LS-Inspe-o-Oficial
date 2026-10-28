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
    const canReal = () => REG.areaOk('custos');
    const fmtD = (d) => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch (e) { return d || ''; } };
    const mi = (v) => (Math.abs(v) >= 1e6 ? 'R$ ' + NF[1].format(v / 1e6) + ' mi' : Math.abs(v) >= 1e3 ? 'R$ ' + NF[0].format(v / 1e3) + ' mil' : brl(v));

    // ---------- fechamentos: banco da equipe ou navegador ----------
    let fech = []; let sub = false;
    const lsGet = () => { try { return JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (e) { return {}; } };
    const lsSet = (o) => { try { localStorage.setItem(LSK, JSON.stringify(o)); } catch (e) { toast('Sem espaço no navegador para guardar o fechamento'); } };
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

    // ---------- contas: fechado (com o valor negociado) e realizado ----------
    // o valor fechado pode diferir do proposto: venda, impostos e comissões acompanham; o custo não muda
    function fechado(F) {
      const s = F.snap; const k = s.venda ? num(F.valorFechado || s.venda) / s.venda : 1;
      const itens = s.itens.map((x) => { const venda = x.venda * k, impostos = x.impostos * k, comissao = x.comissao * k, margem = venda - impostos - comissao - x.custo; return Object.assign({}, x, { venda, impostos, comissao, margem, margemPct: venda ? margem / venda : 0 }); });
      const sum = (f) => itens.reduce((t, x) => t + num(x[f]), 0); const venda = sum('venda'), margem = sum('margem');
      return { k, itens, venda, impostos: sum('impostos'), comissao: sum('comissao'), custo: sum('custo'), margem, margemPct: venda ? margem / venda : 0 };
    }
    function realizado(F) {
      const P = fechado(F); const R = F.real || {}; let lin = 0, ap = 0;
      const itens = P.itens.map((x) => {
        const r = R[x.n] || {}; let custoReal = 0, custoPrev = 0, apont = 0;
        const linhas = (x.linhas || []).map((l) => { const q = (r.l || {})[l.k]; lin++; const has = q && typeof q.v === 'number'; if (has) { ap++; apont++; } custoPrev += l.custo * x.qtd; const real = has ? q.v : null; custoReal += has ? real : l.custo * x.qtd; return Object.assign({}, l, { prev: l.custo * x.qtd, real, obs: q && q.obs, doc: q && q.doc }); });
        // custos fora das linhas (fabricação, frete…) que não viraram linha
        const resto = Math.max(0, x.custo - custoPrev); custoReal += resto;
        const extras = (r.extras || []).filter((e) => typeof e.v === 'number'); custoReal += extras.reduce((t, e) => t + e.v, 0);
        const margem = x.venda - x.impostos - x.comissao - custoReal;
        return Object.assign({}, x, { linhas, extras, resto, custoReal, apont, margemReal: margem, margemRealPct: x.venda ? margem / x.venda : 0 });
      });
      const custoReal = itens.reduce((t, x) => t + x.custoReal, 0); const margem = P.venda - P.impostos - P.comissao - custoReal;
      return Object.assign({}, P, { itens, custoReal, margemReal: margem, margemRealPct: P.venda ? margem / P.venda : 0, linhas: lin, apontadas: ap, cobertura: lin ? ap / lin : 0 });
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
            const rec = Object.assign({}, p, { status: 'ganha', resumo: ctx.resumoOf(snap) }); delete rec.id; delete rec.local;
            await REG.saveProposta(p.id, rec);
            if (!shared()) fech = Object.entries(lsGet()).map(([k, f]) => Object.assign({ id: k }, f));
            close(); toast('Baixa registrada: ' + (p.numero || p.name || 'proposta'));
            if (querXls) excel(Object.assign({ id: p.id }, F)).catch((e) => toast(e.message || 'Não consegui gerar o Excel'));
            // vai direto para a tela do custo real desta proposta
            ui.view = 'margens'; ui.mgId = p.id; ui.mgNova = p.id; onDone && onDone(); ctx.render(); window.scrollTo(0, 0);
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
      const B = base(); const tab = ui.mgTab || 'painel';
      const itAb = B.abertas.flatMap((p) => (p.resumo.itens || []).map((x) => ({ div: p.div || 'SEQ', fam: x.familia, famNome: x.familiaNome || x.familia, nome: x.nome, venda: num(x.venda), margem: num(x.margem), min: num(p.resumo.minimo), pac: p })));
      const itFe = B.fechadas.flatMap((f) => f.itens.map((x) => ({ div: f.F.div, fam: x.familia, famNome: x.familiaNome || x.familia, nome: x.nome, venda: x.venda, margem: x.margem, margemReal: x.margemReal, min: num(f.F.snap.minimo), pac: f })));
      const vAb = B.abertas.reduce((t, p) => t + num(p.resumo.venda), 0); const mAb = wavg(B.abertas, (p) => p.resumo.venda, (p) => p.resumo.margem);
      const vFe = B.fechadas.reduce((t, f) => t + f.venda, 0); const mFe = wavg(B.fechadas, (f) => f.venda, (f) => f.margem);
      const comReal = B.fechadas.filter((f) => f.apontadas > 0); const mRe = wavg(comReal, (f) => f.venda, (f) => f.margemReal); const mPrevRe = wavg(comReal, (f) => f.venda, (f) => f.margem);
      const baixo = B.abertas.filter((p) => p.resumo.minimo && p.resumo.margemPct < p.resumo.minimo).length;
      const sel = (id, v, opts) => `<select id="${id}" aria-label="${id}">${opts.map(([k, l]) => `<option value="${k}"${v === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
      const filtros = `<div class="sheetbar">${sel('mgPer', ui.mgPer || '12m', [['12m', 'Últimos 12 meses'], ['ano', 'Este ano'], ['tudo', 'Tudo']])}${sel('mgDiv', ui.mgDiv || 'todas', [['todas', 'SEQ e SPV'], ['SEQ', 'Só SEQ'], ['SPV', 'Só SPV']])}
        <div class="hchips" style="margin-left:auto">${[['painel', 'Painel'], ['fechadas', `Fechadas (${B.fechadas.length})`], ['abertas', `Em aberto (${B.abertas.length})`]].map(([k, l]) => `<button class="hchip${tab === k ? ' on' : ''}" data-mgtab="${k}">${l}</button>`).join('')}</div></div>`;
      const kpis = `<div class="kpis">
        <div class="kpi"><span>Em aberto</span><b>${mi(vAb)}</b><em>${B.abertas.length} proposta(s) · margem ${mAb === null ? '—' : pct(mAb, 1)}</em></div>
        <div class="kpi"><span>Fechadas</span><b>${mi(vFe)}</b><em>${B.fechadas.length} pacote(s) · margem fechada ${mFe === null ? '—' : pct(mFe, 1)}</em></div>
        <div class="kpi lead"><span>Margem realizada</span><b>${mRe === null ? '—' : pct(mRe, 1)}</b><em>${comReal.length ? `${comReal.length} pacote(s) com custo real · previsto ${pct(mPrevRe, 1)} (${mRe - mPrevRe >= 0 ? '+' : '−'}${NF[1].format(Math.abs(mRe - mPrevRe) * 100)} p.p.)` : 'lance o custo real nas fechadas'}</em></div>
        <div class="kpi"><span>Abaixo do mínimo</span><b>${baixo}</b><em>propostas em aberto</em></div></div>
        ${B.semResumo ? `<div class="banner info">${B.semResumo} proposta(s) em aberto foram salvas antes do registro de margens. <button class="restore" data-mgcalc>Calcular as margens delas agora</button></div>` : ''}`;
      const fila = B.fechadas.filter((f) => f.cobertura < 1).sort((a, b) => String(b.F.fechadoEm).localeCompare(String(a.F.fechadoEm))).slice(0, 6);
      const filaHtml = fila.length ? `<section class="card"><h2>Custo real a lançar <span class="sub">fechadas com linhas sem custo real</span></h2><div class="tw"><table class="t"><tbody>${fila.map((f) => `<tr><td><span class="divb ${f.F.div.toLowerCase()}">${f.F.div}</span> <b>${esc(f.F.numero || '—')}</b> <span class="sub">${esc(f.F.cliente || '')} · fechada em ${fmtD(f.F.fechadoEm)}</span></td><td class="n">${pct(f.cobertura, 0)} apontado</td><td style="text-align:right"><button class="btn sm pri" data-mgopen="${esc(f.F.id)}">Lançar custo real</button></td></tr>`).join('')}</tbody></table></div></section>` : '';
      let body = filaHtml;
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
          <section class="card"><h2>Margem por divisão</h2>${hbars(divs, { series: ['Em aberto', 'Fechadas'], aria: 'margem por divisão' })}</section>
          <section class="card"><h2>Margem por família <span class="sub"><select id="mgFam" aria-label="Base">${[['todas', 'abertas e fechadas'], ['abertas', 'só abertas'], ['fechadas', 'só fechadas']].map(([k, l]) => `<option value="${k}"${(ui.mgFam || 'todas') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></span></h2>${hbars(fams, { min: minRef, aria: 'margem por família' })}</section>
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
          return `<tr><td><span class="divb ${(p.div || 'SEQ').toLowerCase()}">${p.div || 'SEQ'}</span> <b>${esc(p.numero || '—')}</b><br><small class="sub">${esc(p.cliente || p.name || '')}</small></td><td>${esc(((ctx.SPV.STATUS || []).find((x) => x[0] === p.status) || [0, p.status || 'rascunho'])[1])}</td>
          <td class="n">${brl(p.resumo.venda)}</td><td class="n"><b class="${low ? 'bad-t' : ''}">${pct(p.resumo.margemPct, 1)}</b>${low ? ' <span class="pill bad">abaixo do mínimo</span>' : ''}</td><td class="sub">${esc((p.resumo.itens || []).map((x) => x.nome).join(' · ').slice(0, 90))}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-hopen="${esc(p.id)}">Abrir</button> <button class="btn sm pri" data-mgclose="${esc(p.id)}">Dar baixa</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="sub">Nenhuma proposta em aberto com margem calculada.</td></tr>'}</tbody></table></div></section>`;
      }
      return `<div class="stack"><div class="flowhead"><div><h1>Margens</h1><div class="sub">Propostas em aberto e fechadas: margem prevista, fechada e realizada (com o custo real de compras e fabricação).</div></div></div>${filtros}${kpis}${body}</div>`;
    }

    // ---------- detalhe de um fechamento: previsto × realizado por linha ----------
    function vDetalhe(id) {
      const F0 = fech.find((f) => f.id === id); if (!F0) { ui.mgId = null; return '<p class="sub">Fechamento não encontrado.</p>'; }
      const R = realizado(F0); const ed = canReal();
      const cell = (it, l) => ed ? `<input class="rin" data-real="${esc(it.n)}|${esc(l.k)}" inputmode="decimal" value="${typeof l.real === 'number' ? NF[2].format(l.real) : ''}" placeholder="${NF[2].format(l.prev)}" aria-label="Custo real de ${esc(l.desc)}">` : (typeof l.real === 'number' ? brl(l.real) : '<span class="sub">—</span>');
      const itens = R.itens.map((it) => {
        const rows = it.linhas.map((l) => { const d = typeof l.real === 'number' ? l.real - l.prev : null;
          return `<tr><td class="sub">${esc(l.grupo || '')}</td><td>${esc(l.desc || l.rot || '')}${l.fam ? `<br><small class="sub">${esc(l.fam)}</small>` : ''}</td><td class="n">${NF[2].format(num(l.qtd) * (it.qtd || 1))}</td><td class="n">${brl(l.prev)}</td><td class="in">${cell(it, l)}</td><td class="n ${d === null ? '' : d > 0.005 ? 'bad-t' : 'ok-t'}">${d === null ? '' : (d > 0 ? '+' : '−') + brl(Math.abs(d)).replace('R$ ', '')}</td>
          <td class="in">${ed ? `<input class="rin" data-robs="${esc(it.n)}|${esc(l.k)}" value="${esc(l.obs || '')}" placeholder="NF, OS, fornecedor…" aria-label="Observação">` : esc(l.obs || '')}</td></tr>`; }).join('');
        const ex = it.extras.map((e, i) => `<tr class="newrow"><td class="sub">NÃO PREVISTO</td><td>${esc(e.desc)}</td><td></td><td class="n">—</td><td class="n">${brl(e.v)}</td><td class="n bad-t">+${brl(e.v).replace('R$ ', '')}</td><td>${ed ? `<button class="restore" data-rexdel="${esc(it.n)}|${i}">remover</button>` : ''}</td></tr>`).join('');
        return `<section class="card"><h2>${esc(it.nome)} <span class="sub">${esc(it.familiaNome || it.familia || '')} · ${NF[0].format(it.qtd || 1)} un. · venda ${brl(it.venda)}</span></h2>
          <div class="kpis" style="margin-bottom:10px"><div class="kpi"><span>Custo previsto</span><b>${brl(it.custo)}</b></div><div class="kpi"><span>Custo real</span><b>${brl(it.custoReal)}</b><em>${it.apont} de ${it.linhas.length} linhas apontadas</em></div><div class="kpi"><span>Margem prevista</span><b>${pct(it.margemPct, 1)}</b></div><div class="kpi lead"><span>Margem realizada</span><b class="${it.margemRealPct < it.margemPct - 0.005 ? 'bad-t' : ''}">${pct(it.margemRealPct, 1)}</b></div></div>
          <div class="tw"><table class="t reg"><thead><tr><th>Grupo</th><th>Componente</th><th>Qtd</th><th>Previsto</th><th>Real (R$)</th><th>Diferença</th><th>Observação</th></tr></thead><tbody>${rows}${ex}
          ${it.resto > 0.5 ? `<tr><td class="sub">OUTROS</td><td class="sub">Custos sem linha (arredondamentos, itens além da planilha)</td><td></td><td class="n">${brl(it.resto)}</td><td class="n sub">igual ao previsto</td><td></td><td></td></tr>` : ''}</tbody></table></div>
          ${ed ? `<div class="docbar" style="margin-top:8px"><button class="btn sm" data-rexadd="${esc(it.n)}">+ Custo não previsto</button></div>` : ''}</section>`;
      }).join('');
      return `<div class="stack">
        <div class="flowhead"><div style="min-width:0"><button class="btn sm" data-mgback>← Margens</button><h1 style="margin-top:8px"><span class="divb ${F0.div.toLowerCase()}">${F0.div}</span> ${esc(F0.numero || F0.nome || 'Fechamento')}</h1><div class="sub">${esc(F0.cliente || '')} · fechada em ${fmtD(F0.fechadoEm)}${F0.pedido ? ' · pedido ' + esc(F0.pedido) : ''}${F0.obs ? ' · ' + esc(F0.obs) : ''}</div></div>
          <div class="sumbar"><div><span>Venda fechada</span><b>${brl(R.venda)}</b></div><div><span>Margem fechada</span><b>${pct(R.margemPct, 1)}</b></div><div><span>Realizada</span><b class="${R.margemRealPct < R.margemPct - 0.005 ? 'bad-t' : 'ok-t'}">${pct(R.margemRealPct, 1)}</b></div></div></div>
        ${ui.mgNova === id ? `<div class="banner ok"><b>Baixa registrada.</b> É aqui que Compras e Produção lançam o custo real: digite na coluna "Real (R$)" de cada linha ou use "Ler NF ou pedido de compra". A margem realizada recalcula na hora. Esta tela fica em Margens → Fechadas, e na página inicial pelo botão "Custo real".</div>` : ''}
        <div class="kpis"><div class="kpi"><span>Proposto × fechado</span><b>${brl(F0.vendaProposta)}</b><em>fechado ${brl(R.venda)}${Math.abs(R.k - 1) > 1e-6 ? ' (' + (R.k < 1 ? '−' : '+') + pct(Math.abs(1 - R.k), 1) + ')' : ''}</em></div>
          <div class="kpi"><span>Impostos e comissões</span><b>${brl(R.impostos + R.comissao)}</b><em>impostos ${brl(R.impostos)} · comissões ${brl(R.comissao)}</em></div>
          <div class="kpi"><span>Custo previsto × real</span><b>${brl(R.custoReal)}</b><em>previsto ${brl(R.custo)} (${R.custoReal - R.custo >= 0 ? '+' : '−'}${brl(Math.abs(R.custoReal - R.custo)).replace('R$ ', '')})</em></div>
          <div class="kpi"><span>Apontamento</span><b>${pct(R.cobertura, 0)}</b><em>${R.apontadas} de ${R.linhas} linhas com custo real</em></div></div>
        <div class="docbar">${ed ? `<label class="btn pri" for="mgNf">📎 Ler NF ou pedido de compra com Claude</label><input type="file" id="mgNf" accept="application/pdf,image/*" hidden>` : ''}
          <button class="btn" data-mgxls="${esc(F0.id)}">Planilha do fechamento (Excel)</button>
          <label class="chk">Execução <select data-mgexec="${esc(F0.id)}"${ed ? '' : ' disabled'}>${['em andamento', 'fabricação concluída', 'entregue', 'encerrada'].map((x) => `<option${(F0.execucao || 'em andamento') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
          ${REG.canEditCadastro || REG.mode === 'local' ? `<button class="btn" data-mgreopen="${esc(F0.id)}">Desfazer baixa</button>` : ''}</div>
        ${ed ? '<p class="sub" style="margin:0">Lance o custo real total de cada linha (todas as unidades). Linha em branco conta como previsto. Claude lê a nota fiscal ou o pedido e sugere em qual linha cada item entra.</p>' : '<p class="sub" style="margin:0">O custo real é lançado pela área de Custos.</p>'}
        ${itens}</div>`;
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
      modal(`<h2>Lendo ${esc(file.name)}…</h2><p class="sub" id="nfSt">Claude está lendo o documento…</p><div><button class="btn" data-close>Cancelar</button></div>`);
      let j;
      try { j = await ctx.SPV.lerDocumento(file, (m) => { const el = document.getElementById('nfSt'); if (el) el.textContent = m; }); }
      catch (e) { const el = document.getElementById('nfSt'); if (el) el.textContent = e && e.code === 'unavailable' ? 'A leitura automática só funciona no app publicado no claude.ai. Lance os valores à mão.' : 'Não consegui ler o documento' + (e && e.code ? ' (' + e.code + ')' : '') + '.'; return; }
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
          o.querySelectorAll('[data-nfmap]').forEach((s) => { const b = best[+s.dataset.nfmap]; if (s.value === '') return; if (s.value === 'extra') { const n = R.itens[0].n; (extras[n] = extras[n] || []).push({ desc: b.x.descricao + (ref ? ' (' + ref + ')' : ''), v: b.v }); return; } const c = linhas[+s.value]; const key = c.it.n + '|' + c.l.k; add[key] = (add[key] || 0) + b.v; });
          await setReal(id, (real) => {
            for (const [key, v] of Object.entries(add)) { const [n, k] = key.split('|'); real[n] = real[n] || {}; real[n].l = real[n].l || {}; const cur = real[n].l[k] || {}; const base = somar && typeof cur.v === 'number' ? cur.v : 0; real[n].l[k] = { v: base + v, obs: [cur.obs, ref].filter(Boolean).join(' · '), doc: docId || cur.doc || null }; }
            for (const [n, list] of Object.entries(extras)) { real[n] = real[n] || {}; real[n].extras = (real[n].extras || []).concat(list); }
          });
          close(); toast(Object.keys(add).length + ' linha(s) com custo real lançado');
        };
      });
    }

    // ---------- Excel do fechamento: resumo no formato do Memorial (um item por coluna) ----------
    async function excel(F) {
      const ExcelJS = await excelLib(); const R = realizado(F); const k = R.k; const wbx = new ExcelJS.Workbook(); wbx.creator = 'LS Pricer';
      const OR = 'FFE8570A', INK = 'FF1E1F21', SOFT = 'FFFFF1E8', GRAY = 'FFF4F3F0';
      const money = '#,##0.00;[Red]-#,##0.00', perc = '0.00%;[Red]-0.00%', fat = '0.0000';
      const its = R.itens; const n = its.length; const colT = n + 2;
      const ws = wbx.addWorksheet('Fechamento', { views: [{ showGridLines: false, state: 'frozen', xSplit: 1, ySplit: 8 }] });
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
      // composição resumida, como a aba Base da análise de markup
      const wc = wbx.addWorksheet('Composição', { views: [{ showGridLines: false, state: 'frozen', xSplit: 1, ySplit: 2 }] });
      wc.columns = [{ width: 46 }].concat(its.map(() => ({ width: 17 }))).concat([{ width: 19 }]);
      wc.addRow(['CUSTOS LANÇADOS NA FORMAÇÃO']).font = { bold: true, color: { argb: OR } };
      const h2 = wc.addRow(['Componente'].concat(its.map((x, i) => 'ITEM ' + String(i + 1).padStart(2, '0'))).concat(['TOTAL'])); h2.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }; });
      const grupos = new Map();
      its.forEach((x, i) => lin(x).forEach((l) => { const g = (String(l.fam || (l.grupo === 'ESCOPO' ? 'ESCOPO SEM FAMÍLIA' : l.grupo) || 'OUTROS').replace(/^\d+\./, '') || 'OUTROS') + (l.ori ? ' | ' + (l.ori === 'IMP' ? 'importado' : 'nacional') : ''); if (!grupos.has(g)) grupos.set(g, its.map(() => 0)); grupos.get(g)[i] += l.prev; }));
      for (const [g, v] of [...grupos.entries()].sort((a2, b2) => b2[1].reduce((q, z) => q + z, 0) - a2[1].reduce((q, z) => q + z, 0))) { const r = wc.addRow([g].concat(v).concat([v.reduce((q, z) => q + z, 0)])); r.eachCell((c, ci) => { if (ci > 1) c.numFmt = money; }); }
      const tr = wc.addRow(['TOTAL'].concat(its.map((x) => x.custo)).concat([R.custo])); tr.eachCell((c, ci) => { c.font = { bold: true }; if (ci > 1) c.numFmt = money; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; });
      // custo real por linha, só quando houver apontamento
      if (R.apontadas || its.some((x) => x.extras.length)) {
        const wr = wbx.addWorksheet('Custo real'); wr.columns = [{ width: 28 }, { width: 52 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 34 }];
        const h3 = wr.addRow(['Item', 'Componente', 'Previsto', 'Real', 'Diferença', 'Observação']); h3.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }; });
        for (const x of its) { for (const l of x.linhas.filter((q) => typeof q.real === 'number')) { const r = wr.addRow([x.nome, l.desc || l.rot || '', l.prev, l.real, l.real - l.prev, l.obs || '']); [3, 4, 5].forEach((c) => { r.getCell(c).numFmt = money; }); }
          for (const e of x.extras) { const r = wr.addRow([x.nome, 'NÃO PREVISTO — ' + e.desc, 0, e.v, e.v, '']); [3, 4, 5].forEach((c) => { r.getCell(c).numFmt = money; }); } }
      }
      const name = ('Fechamento ' + (F.numero || '') + ' ' + (F.cliente || '')).trim().replace(/[\\/:*?"<>|]+/g, '_') + '.xlsx';
      const ok = await REG.save(name, await wbx.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); if (!ok) toast('Download cancelado');
    }

    // ---------- margens das propostas antigas (sem resumo) ----------
    async function calcularAntigas() {
      const list = (REG.listPropostas() || []).filter((p) => ABERTAS.includes(p.status || 'rascunho') && !(p.resumo && p.resumo.venda > 0));
      let ok = 0; toast('Calculando ' + list.length + ' proposta(s)…');
      for (const p of list) { try { const snap = ctx.snapshotOf(p); const rec = Object.assign({}, p, { resumo: ctx.resumoOf(snap) }); delete rec.id; delete rec.local; await REG.saveProposta(p.id, rec); ok++; } catch (e) { /* segue */ } await new Promise((r) => setTimeout(r, 0)); }
      toast(ok + ' proposta(s) com margem calculada'); ctx.render();
    }

    // ---------- eventos ----------
    document.addEventListener('change', (e) => {
      const el = e.target; if (ui.view !== 'margens') return;
      if (el.id === 'mgPer' || el.id === 'mgDiv' || el.id === 'mgFam') { ui[el.id] = el.value; ctx.render(); return; }
      if (el.dataset.real) { const [n, k] = el.dataset.real.split('|'); const t = el.value.trim(); const v = t === '' ? null : parseInput(t, 'num'); if (t !== '' && typeof v !== 'number') { toast('Número inválido'); return; }
        setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; const cur = real[n].l[k] || {}; if (v === null) { delete cur.v; } else cur.v = v; real[n].l[k] = cur; }, 'linha ' + k + (v === null ? ' apagada' : ' = ' + brl(v))); return; }
      if (el.dataset.robs) { const [n, k] = el.dataset.robs.split('|'); setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].l = real[n].l || {}; real[n].l[k] = Object.assign(real[n].l[k] || {}, { obs: el.value.trim() }); }); return; }
      if (el.dataset.mgexec) { const F = fech.find((f) => f.id === el.dataset.mgexec); if (F) gravar(F.id, Object.assign({}, F, { execucao: el.value })).then(() => { ctx.log && ctx.log({ tipo: 'Execução', ref: F.id, desc: F.numero || F.nome || '', mudancas: [{ campo: 'Execução', de: F.execucao || 'em andamento', para: el.value }] }); if (!shared()) ctx.render(); toast('Execução: ' + el.value); }); return; }
      if (el.id === 'mgNf') { lerNf(ui.mgId, el.files[0]); el.value = ''; }
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      const rl = t.closest('[data-mgreal]'); if (rl) { ensure(); const id = rl.dataset.mgreal; if (!fechDe(id)) { toast('Esta proposta ainda não tem baixa: use "Dar baixa" primeiro.'); return; } ui.view = 'margens'; ui.mgId = id; ui.mgNova = null; ctx.render(); window.scrollTo(0, 0); return; }
      const cl = t.closest('[data-mgclose]'); if (cl) { const p = (REG.listPropostas() || []).find((x) => x.id === cl.dataset.mgclose); if (p) fecharModal(p); return; }
      if (ui.view !== 'margens') return;
      const tb = t.closest('[data-mgtab]'); if (tb) { ui.mgTab = tb.dataset.mgtab; ctx.render(); return; }
      const op = t.closest('[data-mgopen]'); if (op) { ui.mgId = op.dataset.mgopen; ui.mgNova = null; ctx.render(); window.scrollTo(0, 0); return; }
      if (t.closest('[data-mgback]')) { ui.mgId = null; ctx.render(); return; }
      if (t.closest('[data-mgcalc]')) { calcularAntigas(); return; }
      const xl = t.closest('[data-mgxls]'); if (xl) { const F = fech.find((f) => f.id === xl.dataset.mgxls); if (F) excel(F).catch((er) => toast(er.message || 'Não consegui gerar o Excel')); return; }
      const ro = t.closest('[data-mgreopen]'); if (ro) { if (!ro.dataset.sure) { ro.dataset.sure = 1; ro.textContent = 'Confirmar: desfazer a baixa'; ro.classList.add('pri'); return; }
        const F = fech.find((f) => f.id === ro.dataset.mgreopen); apagar(ro.dataset.mgreopen).then(async () => { ctx.log && ctx.log({ tipo: 'Baixa desfeita', ref: ro.dataset.mgreopen, desc: F ? (F.numero || F.nome || '') : '', mudancas: [] }); const p = (REG.listPropostas() || []).find((x) => x.id === (F && F.propId)); if (p) { const rec = Object.assign({}, p, { status: 'negociacao' }); delete rec.id; delete rec.local; await REG.saveProposta(p.id, rec).catch(() => {}); } ui.mgId = null; ctx.render(); toast('Baixa desfeita'); }).catch((er) => toast(er.message || 'Não consegui desfazer')); return; }
      const ad = t.closest('[data-rexadd]'); if (ad) { const n = ad.dataset.rexadd;
        modal(`<h2>Custo não previsto</h2><div class="fields"><div class="f span2"><label for="rxD">Descrição</label><input id="rxD" placeholder="retrabalho, frete extra, peça trocada…"></div><div class="f"><label for="rxV">Valor (R$)</label><input id="rxV" inputmode="decimal"></div></div><div style="display:flex;gap:8px"><button class="btn pri" id="rxOk">Lançar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
          $('#rxOk', o).onclick = () => { const d = $('#rxD', o).value.trim(); const v = parseInput($('#rxV', o).value, 'num'); if (!d || typeof v !== 'number') { toast('Preencha descrição e valor'); return; } close(); setReal(ui.mgId, (real) => { real[n] = real[n] || {}; real[n].extras = (real[n].extras || []).concat([{ desc: d, v }]); }); };
          $('#rxD', o).focus(); });
        return; }
      const rd = t.closest('[data-rexdel]'); if (rd) { const [n, i] = rd.dataset.rexdel.split('|'); setReal(ui.mgId, (real) => { if (real[n] && real[n].extras) real[n].extras.splice(+i, 1); }); }
    });

    return { vMargens, fecharModal, ensure, fechDe, excel };
  }
  window.PricerMargens = Margens;
})();
