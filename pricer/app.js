/* LS Pricer — interface. As contas são as da planilha, executadas pelo engine.js. */
(function () {
  'use strict';
  const { Workbook, isErr, parseAddr, addr, numToCol, colToNum, E } = window.PricerEngine;
  const MODEL = window.PRICER_MODEL;
  // Regras do app sobre a planilha (itens 01 a 10):
  // - o arranjo escolhido manda: a jockey só entra sozinha quando nenhum arranjo foi definido;
  // - arranjo só de jockey (J) também monta o item.
  for (const s of MODEL.sheets) if (/^ITEM \d\d$/.test(s.name)) {
    s.cells.AR14 = '=IF(AND($AR$6="",$AR$19="",$AR$8=""),0,1)';
    s.cells.AR20 = '=$AR$22&IF(AND($J$19<>"",ISERROR(SEARCH("J",$AR$22)),$E$17=""),"J","")';
    // bomba das elétricas pode ser outro modelo/tamanho (BA19); em branco = a mesma das diesel
    s.cells.AR23 = '=IF($BA$19<>"",$BA$19,$AR$7)';
    s.cells.AR24 = '=IF($AR$23="","",IFERROR(INDEX(CAD_TIPO,MATCH($AR$23,CAD_PRODUTO,0)),""))';
    // cada conjunto usa a própria potência: o elétrico dimensiona painel, base, acoplamento e capa pelos CV dele
    s.cells.AR25 = '=IF($I$19<>"",$I$19,$AR$9)';
    s.cells.AR26 = '=IFERROR(INDEX(FX_ITENS,MATCH($AR$25,FX_HP,1),1),1)';
    for (let r = 68; r <= 127; r++) for (const col of ['AJ', 'AL', 'AM', 'AN']) {
      const f = s.cells[col + r]; if (typeof f !== 'string') continue;
      const m = /INDEX\(REC_TIPO,(\d+)\)/.exec(f); if (!m) continue;
      const el = 'INDEX(REC_ACION,' + m[1] + ')="ELETRICA"';
      let g = f.split('$AR$7').join('IF(' + el + ',$AR$23,$AR$7)').split('$AR$12="SPLIT CASE"').join('IF(' + el + ',$AR$24,$AR$12)="SPLIT CASE"');
      if (col === 'AJ') g = g.split('$AR$9').join('IF(' + el + ',$AR$25,$AR$9)').split('$AR$11').join('IF(' + el + ',$AR$26,$AR$11)');
      s.cells[col + r] = g;
    }
  }
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ITEMS = Array.from({ length: 10 }, (_, i) => 'ITEM ' + String(i + 1).padStart(2, '0'));
  const PROPOSAL_SHEETS = new Set(['PROPOSTA', ...ITEMS]);
  const TABLE_SHEETS = ['PARÂMETROS', 'POLÍTICA', 'MONTADOR', 'CODIFICAÇÃO', 'KIT HIDRÁULICA', 'KIT VÁLVULA ALÍVIO', 'FCI', 'FCI EXTRAÇÃO', 'CADASTRO', 'KIT MOTORES DIESEL', 'KIT BOMBA'];
  const REGISTRY_SHEETS = new Set(['CADASTRO', 'KIT MOTORES DIESEL', 'KIT BOMBA']);
  const SK = { cur: 'lspricer.current', db: 'lspricer.db', saved: 'lspricer.saved', view: 'lspricer.view' };
  const baseSheets = Object.fromEntries(MODEL.sheets.map((s) => [s.name, s]));

  // ---------- armazenamento ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  };
  let state = store.get(SK.cur, null) || { id: null, doc: MODEL.example, name: '' };
  let ui = Object.assign({ view: 'proposta', item: 0, table: 'PARÂMETROS', filter: '', cad: 'insumos' }, store.get(SK.view, {}));
  if (ui.view === 'tabelas') { ui.view = 'cadastro'; ui.cad = 'tabelas'; }
  let wb;
  // cadastro compartilhado (claude.ai) ou local (arquivo)
  let pendingRender = false;
  const REG = window.PricerRegistry.Registry(MODEL, () => {
    build(); dlMap = null;
    const ae = document.activeElement;
    if (ae && ae.matches && ae.matches('#app input, #app select, #app textarea')) { pendingRender = true; return; }
    render();
  });
  document.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => { const ae = document.activeElement; if (!(ae && ae.matches && ae.matches('#app input, #app select, #app textarea'))) { pendingRender = false; render(); } }, 0); });

  function build() { wb = new Workbook(MODEL); REG.applyTo(wb); wb.applyDoc(state.doc); listCache = new Map(); }
  function persist() { store.set(SK.cur, state); }

  // ---------- validações (listas) ----------
  const dvIndex = {};
  for (const s of MODEL.sheets) {
    const idx = (dvIndex[s.name] = {});
    for (const dv of s.dv) for (const part of dv.sqref.split(/\s+/)) {
      const [a, b] = part.split(':'); const p1 = parseAddr(a), p2 = parseAddr(b || a);
      for (let r = p1.r; r <= p2.r; r++) for (let c = p1.c; c <= p2.c; c++) idx[addr(r, c)] = dv.f;
    }
  }
  for (const it of ITEMS) dvIndex[it].BA19 = 'MONT_BOMBAS';
  let listCache = new Map();
  function listFor(sheet, a) {
    const f = dvIndex[sheet] && dvIndex[sheet][a]; if (!f) return null;
    const key = f.includes('$') || f.startsWith('CHOOSE') ? sheet + '!' + a : sheet + '|' + f;
    if (!listCache.has(key)) { const p = parseAddr(a); listCache.set(key, wb.listValues(sheet, f, p.r, p.c).map((x) => fmtPlain(x))); }
    return listCache.get(key);
  }

  // ---------- formatação ----------
  const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const NF = [0, 1, 2, 3, 4].map(nf);
  function fmtPlain(v) { if (v === null || v === undefined) return ''; if (typeof v === 'number') return String(+v.toFixed(10)).replace('.', ','); return String(v); }
  function fmtNum(v, fmt) {
    if (isErr(v)) return v.code;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
    if (typeof v !== 'number') return String(v);
    const f = fmt || '';
    if (f.includes('%')) { const d = (f.split('.')[1] || '').replace(/[^0]/g, '').length; return NF[d].format(v * 100) + '%'; }
    if (f.startsWith('mm') || f.startsWith('dd')) { const dt = new Date(Math.round((v - 25569) * 86400000)); return dt.toISOString().slice(0, 10).split('-').reverse().join('/'); }
    if (f.startsWith('"ITEM')) return 'ITEM ' + String(v).padStart(2, '0');
    const m = /0\.(0+)/.exec(f); if (m) return NF[Math.min(4, m[1].length)].format(v);
    if (f === '0' || f === '#,##0') return NF[0].format(v);
    if (f === '0.##') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: Number.isInteger(v) ? 0 : 4 }).format(v);
  }
  const brl = (v) => typeof v === 'number' ? 'R$ ' + NF[2].format(v) : fmtNum(v);
  const pct = (v, d = 1) => typeof v === 'number' ? NF[d].format(v * 100) + '%' : fmtNum(v);
  function fmtOf(sheet, a) { const s = baseSheets[sheet]; return s && s.fmts[a]; }
  function val(sheet, a) { return wb.value(sheet, a); }
  function show(sheet, a) { return fmtNum(val(sheet, a), fmtOf(sheet, a)); }
  function txt(sheet, a) { const v = val(sheet, a); return v === null || v === undefined || isErr(v) ? '' : typeof v === 'number' ? fmtNum(v, fmtOf(sheet, a)) : String(v); }

  // ---------- edição ----------
  function baseRaw(sheet, a) { const s = baseSheets[sheet]; return s ? s.cells[a] : undefined; }
  function isFormulaBase(sheet, a) { const v = baseRaw(sheet, a); return typeof v === 'string' && v[0] === '='; }
  function curRaw(sheet, a) { return wb.raw(sheet, a); }
  function overridden(sheet, a) { const c = curRaw(sheet, a); return isFormulaBase(sheet, a) && !(typeof c === 'string' && c[0] === '='); }
  function target(sheet) { return (state.doc = state.doc || {}); }
  function kindOf(sheet, a) {
    const f = fmtOf(sheet, a) || '';
    if (f.includes('%')) return 'pct';
    if (/[0#]/.test(f) && !f.startsWith('mm') && f !== '@') return 'num';
    const b = baseRaw(sheet, a); if (typeof b === 'number') return 'num';
    const v = val(sheet, a); if (typeof v === 'number') return 'num';
    return 'text';
  }
  function parseInput(raw, kind) {
    const t = String(raw).trim(); if (t === '') return null;
    if (kind === 'pct' || kind === 'num') {
      let s = t.replace(/\s|R\$/g, ''); const hasPct = s.endsWith('%'); s = s.replace('%', '');
      if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
      else if (/^\-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      const n = parseFloat(s); if (Number.isNaN(n)) return t;
      return kind === 'pct' ? n / 100 : (hasPct ? n / 100 : n);
    }
    return t;
  }
  function commit(sheet, a, value, restore) {
    if (/^ITEM \d\d$/.test(sheet) && a === 'I17') mirror(sheet, 'L21', value, restore); // norma do montador = norma do código
    const tg = target(sheet); tg[sheet] = tg[sheet] || {};
    if (restore) {
      delete tg[sheet][a];
      if (!Object.keys(tg[sheet]).length) delete tg[sheet];
      const s = wb.sheet(sheet); const b = baseRaw(sheet, a); if (b === undefined) s.cells.delete(a); else s.cells.set(a, b);
      wb.invalidate();
    } else {
      tg[sheet][a] = value;
      wb.setRaw(sheet, a, value);
    }
    listCache = new Map(); dirty = true; persist(); render();
  }
  let dirty = false;
  function mirror(sheet, a, value, restore) {
    const tg = target(sheet); tg[sheet] = tg[sheet] || {};
    if (restore) { delete tg[sheet][a]; const b = baseRaw(sheet, a); const s = wb.sheet(sheet); if (b === undefined) s.cells.delete(a); else s.cells.set(a, b); }
    else { tg[sheet][a] = value; wb.sheet(sheet).cells.set(a, value); }
  }

  // campo com rótulo (entrada, herdado ou somente leitura)
  function field(sheet, a, label, opt = {}) {
    const fb = isFormulaBase(sheet, a);
    const editable = opt.ro ? false : (!fb || opt.edit !== false);
    const over = overridden(sheet, a);
    const cls = !editable ? '' : over ? 'over' : fb ? 'auto' : '';
    const lbl = `<label for="${esc(id(sheet, a))}"><span>${esc(label)}</span>${over ? `<button class="restore" data-restore="${esc(sheet)}|${a}" title="Voltar ao valor automático">↺ automático</button>` : ''}</label>`;
    if (!editable) return `<div class="f ${opt.cls || ''}"><label>${esc(label)}</label><div class="ro ${opt.lead ? 'lead' : ''}">${esc(opt.fmt ? opt.fmt(val(sheet, a)) : show(sheet, a)) || '&nbsp;'}</div></div>`;
    return `<div class="f ${cls} ${opt.cls || ''}">${lbl}<div class="ctl">${control(sheet, a, opt)}</div></div>`;
  }
  function id(sheet, a) { return 'c_' + sheet.replace(/\W/g, '') + '_' + a; }
  function control(sheet, a, opt = {}) {
    // insumos (montagem e escopo): sugestões filtradas pela família da linha, não a lista da planilha
    const list = opt.list || (opt.datalist ? null : listFor(sheet, a));
    const kind = kindOf(sheet, a);
    const v = val(sheet, a);
    const cur = isErr(v) ? '' : (kind === 'pct' && typeof v === 'number') ? NF[2].format(v * 100).replace(/,00$/, '') : kind === 'num' && typeof v === 'number' ? fmtPlain(v) : fmtPlain(v);
    const data = `data-sheet="${esc(sheet)}" data-addr="${a}" data-kind="${kind}" id="${esc(id(sheet, a))}"`;
    if (list && !opt.free) {
      const fb = isFormulaBase(sheet, a); const over = overridden(sheet, a);
      let opts = '';
      if (fb) opts += `<option value="\u0000auto"${over ? '' : ' selected'}>${esc(opt.compact ? (cur || '—') : cur ? 'Automático — ' + cur : 'Automático')}</option>`;
      else opts += `<option value=""${cur === '' ? ' selected' : ''}>—</option>`;
      const seen = new Set();
      for (const o of list) { if (seen.has(o)) continue; seen.add(o); opts += `<option${(over || !fb) && o === cur ? ' selected' : ''}>${esc(o)}</option>`; }
      if ((over || !fb) && cur !== '' && !seen.has(cur)) opts += `<option selected>${esc(cur)}</option>`;
      return `<select ${data}>${opts}</select>`;
    }
    const dl = opt.datalist ? ` list="${opt.datalist}"` : '';
    return `<input ${data}${dl} value="${esc(cur)}" inputmode="${kind === 'text' ? 'text' : 'decimal'}"${kind === 'pct' ? ' placeholder="%"' : ''} autocomplete="off">`;
  }
  // célula editável dentro de tabela
  function cellIn(sheet, a, opt = {}) {
    const fb = isFormulaBase(sheet, a); const over = overridden(sheet, a);
    return `<td class="in ${over ? 'over' : fb ? 'auto' : ''}" title="${over ? 'Alterado à mão — apague (ou escolha a 1ª opção) para voltar ao automático' : fb ? 'Automático — pode alterar' : ''}">${control(sheet, a, Object.assign({ compact: true }, opt))}</td>`;
  }

  document.addEventListener('change', (e) => {
    const el = e.target; if (!el.dataset || !el.dataset.addr) return;
    const { sheet, addr: a, kind } = el.dataset;
    if (el.tagName === 'SELECT') {
      if (el.value === '\u0000auto') return commit(sheet, a, null, true);
      if (el.value === '') return commit(sheet, a, null);
      // opção numérica (potência, rotação, vazão…) grava como número, senão a planilha não acha na faixa
      if (/^-?\d+([.,]\d+)?$/.test(el.value.trim())) return commit(sheet, a, parseFloat(el.value.replace(',', '.')));
      const n = parseInput(el.value, kind === 'pct' ? 'text' : kind);
      return commit(sheet, a, typeof n === 'number' ? n : el.value);
    }
    const v = parseInput(el.value, kind);
    if (v === null && isFormulaBase(sheet, a)) return commit(sheet, a, null, true);
    commit(sheet, a, v);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[data-addr]')) e.target.blur(); });
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-restore]');
    if (r) { const [s, a] = r.dataset.restore.split('|'); commit(s, a, null, true); return; }
    const go = e.target.closest('[data-goitem]');
    if (go) { ui.item = +go.dataset.goitem; setView('item'); return; }
    const nv = e.target.closest('[data-view]');
    if (nv) { setView(nv.dataset.view); return; }
  });

  // ---------- visões ----------
  function setView(v) { ui.view = v; store.set(SK.view, ui); render(); window.scrollTo(0, 0); }
  function render() {
    for (const b of document.querySelectorAll('#nav button')) b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false');
    const nm = txt('PROPOSTA', 'C5'), cli = txt('PROPOSTA', 'F5');
    $('#docName').innerHTML = (nm || cli) ? `<b>${esc(nm || 'Sem número')}</b> · ${esc(cli || 'sem cliente')}` : '<b>Proposta nova</b>';
    const scroll = window.scrollY; const focusId = document.activeElement && document.activeElement.id;
    const html = { proposta: vProposta, item: vItem, memorial: vMemorial, cadastro: vCadastro, guia: vGuia }[ui.view]();
    $('#app').innerHTML = html;
    if (ui.view === 'cadastro') bindCadastro();
    window.scrollTo(0, scroll);
    if (focusId) { const f = document.getElementById(focusId); if (f && f.tagName === 'INPUT') f.focus(); }
  }
  const filled = (sh) => { const v = val(sh, 'H114'); return typeof v === 'number' && v !== 0; };

  function situPill(s) {
    if (!s) return '';
    const t = String(s);
    const cls = /ABAIXO|FORA|DIFERENÇA|ATENÇÃO/i.test(t) ? 'bad' : /DENTRO|OK/i.test(t) ? 'ok' : 'warn';
    return `<span class="pill ${cls}">${esc(t)}</span>`;
  }

  function vProposta() {
    const P = 'PROPOSTA';
    const f = (a, lb, o) => field(P, a, lb || txt(P, 'B' + a.slice(1)), o);
    let quick = '';
    for (let i = 0; i < 10; i++) {
      const r = 20 + i; const sh = ITEMS[i];
      quick += `<tr><td><button class="btn sm" data-goitem="${i}">${sh}</button></td>${cellIn(P, 'C' + r)}${cellIn(P, 'E' + r)}${cellIn(P, 'F' + r)}${cellIn(P, 'H' + r)}<td>${esc(txt(P, 'I' + r))}</td></tr>`;
    }
    let rows = '';
    for (let i = 0; i < 10; i++) {
      const r = 33 + i; if (txt(P, 'C' + r) === '' && !filled(ITEMS[i])) continue;
      const sit = txt(P, 'Y' + r);
      rows += `<tr><td><button class="btn sm" data-goitem="${i}">${ITEMS[i].slice(5)}</button></td><td class="code">${esc(txt(P, 'C' + r))}</td><td style="min-width:260px">${esc(txt(P, 'D' + r))}</td><td class="n">${show(P, 'F' + r)}</td><td>${esc(txt(P, 'G' + r))}</td><td>${esc(txt(P, 'H' + r))} <small class="sub">${show(P, 'I' + r)}</small></td><td class="n">${show(P, 'J' + r)}</td><td class="n">${show(P, 'K' + r)}</td><td class="n">${show(P, 'M' + r)}</td><td class="n">${show(P, 'N' + r)}</td><td class="n"><b>${show(P, 'P' + r)}</b></td><td class="n">${show(P, 'Q' + r)}</td><td class="n">${show(P, 'R' + r)}</td><td class="n">${show(P, 'U' + r)}</td><td class="n">${show(P, 'V' + r)}</td><td class="n">${show(P, 'W' + r)}</td><td class="n">${show(P, 'X' + r)}</td><td>${situPill(sit)}</td></tr>`;
    }
    rows += `<tr class="tot"><td colspan="5">Totais</td><td>${esc(txt(P, 'H43'))} <small class="sub">${show(P, 'I43')}</small></td><td></td><td class="n">${show(P, 'K43')}</td><td class="n">${show(P, 'M43')}</td><td class="n">${show(P, 'N43')}</td><td class="n">${show(P, 'P43')}</td><td class="n">${show(P, 'Q43')}</td><td colspan="3"></td><td class="n">${show(P, 'V43')}</td><td colspan="3"></td></tr>`;
    const margem = val(P, 'J16'); const mMin = val('PARÂMETROS', 'C34');
    const res = [[47, 'brl'], [48, 'brl'], [49, 'brl'], [50, 'brl'], [51, 'brl', 1], null, [53, 'pct2'], [54, 'pct2'], [55, 'pct2'], [56, 'pct2', 1], null, [58, 'pct2'], [59, 'pct2'], [60, 'pct2', 1], null, [62, 'pct2', 1], null, [64, 'brl'], [65, 'pct4'], [66, 'brl'], [67, 'brl', 1], null, [69, 'txt'], [70, 'pct2']];
    const fm = { brl, pct2: (v) => pct(v, 2), pct4: (v) => pct(v, 4), txt: (v) => fmtNum(v) };
    const kv = res.map((x) => x ? `<div>${x[2] ? '<b>' : ''}${esc(txt(P, 'C' + x[0]))}${x[2] ? '</b>' : ''}</div><div>${esc(fm[x[1]](val(P, 'E' + x[0])))}</div>` : '<div class="sep"></div>').join('');
    const demo = [73, 74, 75, 76, 77, 78].map((r) => `<div>${esc(txt(P, 'C' + r))}${val(P, 'F' + r) !== null ? ` <small class="sub">(${pct(val(P, 'F' + r), 2)})</small>` : ''}</div><div>${brl(val(P, 'E' + r))}</div>`).join('');
    const fora = [82, 83, 84, 85, 86].map((r) => `<div>${esc(txt(P, 'C' + r))}</div><div class="${r === 83 && Math.abs(val(P, 'E83')) > 0.005 ? 'bad-t' : ''}">${brl(val(P, 'E' + r))}</div>`).join('');
    return `<div class="stack">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
        <div><h1>Proposta ${esc(txt(P, 'C5'))}</h1><div class="sub">${esc(txt(P, 'F5'))}${txt(P, 'F6') ? ' · ' + esc(txt(P, 'F6')) : ''}</div></div>
        <div class="legend"><span><i class="e"></i>Entrada</span><span><i class="a"></i>Automático (herdado ou calculado)</span><span><i class="o"></i>Alterado à mão</span></div>
      </div>
      <div class="kpis">
        <div class="kpi lead"><span>Preço total (com IPI)</span><b>${brl(val(P, 'B16'))}</b><em>${esc(txt(P, 'M16'))} itens preenchidos</em></div>
        <div class="kpi"><span>Custo total</span><b>${brl(val(P, 'G16'))}</b></div>
        <div class="kpi"><span>Margem líquida</span><b class="${typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? 'bad-t' : ''}">${pct(margem)}</b><em>mínimo ${pct(mMin)}</em></div>
        <div class="kpi"><span>Desconto global</span><b>${pct(val(P, 'E16'), 2)}</b></div>
        <div class="kpi"><span>DIFAL do cliente (fora do preço)</span><b>${brl(val(P, 'E84'))}</b></div>
      </div>
      <section class="card"><h2>Dados da proposta</h2>
        <div class="fields">
          ${f('C5')}${f('C6')}${f('C7')}${f('C8')}${f('C9')}${f('C10')}
          ${field(P, 'F5', txt(P, 'E5'), { cls: 'span2' })}${field(P, 'F6', txt(P, 'E6'), { cls: 'span2' })}${field(P, 'F7', txt(P, 'E7'))}${field(P, 'F8', txt(P, 'E8'))}${field(P, 'F9', txt(P, 'E9'))}
          ${field(P, 'J5', txt(P, 'I5'), { cls: 'span2' })}${field(P, 'J6', txt(P, 'I6'), { cls: 'span2' })}${field(P, 'J7', txt(P, 'I7'))}${field(P, 'J8', txt(P, 'I8'))}${field(P, 'J9', txt(P, 'I9'))}${field(P, 'J10', txt(P, 'I10'))}
        </div></section>
      <section class="card"><h2>Frete da proposta <span class="sub">uma carga só; o valor é rateado entre os itens na proporção do custo</span></h2>
        <div class="fields">
          ${field(P, 'B13', txt(P, 'B12'), { cls: 'span2' })}${field(P, 'D13', txt(P, 'D12'))}${field(P, 'E13', txt(P, 'E12'))}${field(P, 'F13', txt(P, 'F12'))}${field(P, 'H13', txt(P, 'H12'), { ro: true, lead: true, fmt: brl })}
          <div class="spanall sub">${esc(txt(P, 'I13'))}</div>
        </div></section>
      <section class="card"><h2>Montagem rápida <span class="sub">escolha o modelo pronto de cada item; qtd em branco = 1</span></h2>
        <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Modelo pronto</th><th>Qtd</th><th>Vazão nom. (USgpm)</th><th>Nº de bombas</th><th>Descrição gerada</th></tr></thead><tbody>${quick}</tbody></table></div>
      </section>
      <section class="card"><h2>Itens da proposta</h2>
        <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Qtd</th><th>NCM</th><th>Origem · CI</th><th>Unit. s/ impostos</th><th>Total s/ impostos</th><th>Total c/ impostos s/ IPI</th><th>IPI R$</th><th>Total c/ IPI</th><th>Custo</th><th>ICMS</th><th>IPI %</th><th>Fator</th><th>Piso</th><th>Margem</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="sub">${esc(txt(P, 'B44'))}</p>
      </section>
      <div class="fields wide" style="align-items:start">
        <section class="card"><h2>Resultado consolidado</h2><div class="kv">${kv}</div></section>
        <div class="stack">
          <section class="card"><h2>Demonstrativo — base sem IPI</h2><div class="kv">${demo}</div></section>
          <section class="card"><h2>Fora do preço e conferências</h2><div class="kv">${fora}</div></section>
        </div>
      </div>
    </div>`;
  }

  function memoCalc(S) {
    let out = '';
    for (let r = 17; r <= 106; r++) {
      const o = val(S, 'O' + r), p = val(S, 'P' + r), q = val(S, 'Q' + r);
      if ((o === null || o === '') && (p === null || p === '')) continue;
      const fill = (baseSheets[S].fills || {})['P' + r];
      const isHead = typeof o === 'string' && (p === null || p === '' ) && o === o.toUpperCase() && o.length < 70;
      if (isHead) { out += `<div class="h">${esc(o)}</div>`; continue; }
      if ((p === null || p === '') && typeof o === 'string') { out += `<div class="note">${esc(o)}</div>`; continue; }
      const pv = typeof p === 'number' ? fmtNum(p, fmtOf(S, 'P' + r)) : fmtNum(p);
      out += `<div class="r ${fill === 'FFF1E8' ? 'lead' : ''}"><div>${esc(fmtNum(o))}</div><div class="v${typeof p === 'string' ? ' tx' : ''}">${esc(pv)}</div><div class="p">${q === null || q === '' ? '' : esc(typeof q === 'number' ? fmtNum(q, fmtOf(S, 'Q' + r) || '0.00%') : q)}</div></div>`;
    }
    return out;
  }

  // ---------- equipamento: seções por acionamento ----------
  function arrCounts(S) {
    const a = String(val(S, 'AR20') || '').toUpperCase();
    return { d: (a.match(/D/g) || []).length, e: (a.match(/E/g) || []).length, j: a.includes('J'), code: a };
  }
  function pumpLines(S) {
    const out = [];
    for (let r = 23; r <= 26; r++) {
      if (!txt(S, 'C' + r)) continue;
      const idx = r - 22; const rows = [];
      for (let q = 34; q <= 112; q++) { if (q > 63 && q < 68) continue; const w = val(S, 'W' + q), y = val(S, 'Y' + q); if (w === idx || y === idx) rows.push(q); }
      out.push({ r, idx, rows, escopo: rows.filter((q) => q >= 68) });
    }
    return out;
  }
  // linhas da montagem automática com o acionamento da receita (MONTADOR) que as gerou
  function montLines(S) {
    const out = [];
    for (let r = 34; r <= 63; r++) {
      if (txt(S, 'D' + r) === '' && txt(S, 'B' + r) === '') continue;
      const k = val(S, 'AE' + r);
      const acion = typeof k === 'number' ? String(val('MONTADOR', 'D' + (91 + k)) || 'TODOS') : 'TODOS';
      const rot = typeof k === 'number' ? txt('MONTADOR', 'B' + (91 + k)) : '';
      out.push({ r, acion: ['DIESEL', 'ELETRICA', 'JOCKEY'].includes(acion) ? acion : 'TODOS', rot });
    }
    return out;
  }
  function hiddenLines(S) {
    const out = [];
    for (let r = 68; r <= 127; r++) {
      const g = val(S, 'AG' + r); if (typeof g !== 'number' || g <= 30) continue;
      const k = r - 67; const acion = String(val('MONTADOR', 'D' + (91 + k)) || 'TODOS');
      const num = (x) => (typeof x === 'number' ? x : 0);
      out.push({ r, n: g, acion: ['DIESEL', 'ELETRICA', 'JOCKEY'].includes(acion) ? acion : 'TODOS', rot: txt('MONTADOR', 'B' + (91 + k)),
        bloco: txt(S, 'AH' + r), fam: txt(S, 'AI' + r), desc: txt(S, 'AJ' + r), qtd: num(val(S, 'AK' + r)), unit: num(val(S, 'AL' + r)), ori: txt(S, 'AM' + r), imp: num(val(S, 'AN' + r)),
        tot: num(val(S, 'AK' + r)) * num(val(S, 'AL' + r)) });
    }
    return out;
  }
  const hiddenRow = (x, bloco) => `<tr class="ro"><td>${esc(x.rot)}</td>${bloco ? `<td>${esc(x.bloco)}</td>` : ''}<td>${esc(x.desc)}</td><td></td><td class="n">${fmtNum(x.qtd)}</td><td class="n">${fmtNum(x.unit, '#,##0.00')}</td><td class="n">${fmtNum(x.tot, '#,##0.00')}</td><td>${esc(x.ori)}</td><td class="sub">além da 30ª linha da planilha — só leitura, já no custo</td></tr>`;
  const isCMB = (S) => String(val(S, 'AR2') || 'CMB') === 'CMB';
  function equipSections(S) {
    const f = (a, lb, o) => field(S, a, lb, o);
    const c = arrCounts(S); const over = overridden(S, 'E17');
    const step = (k, lb, n) => `<div class="stp"><span>${lb}</span><button type="button" class="btn sm" data-arr="${k}-" aria-label="Menos ${lb}"${n ? '' : ' disabled'}>−</button><b>${n}</b><button type="button" class="btn sm" data-arr="${k}+" aria-label="Mais ${lb}"${c.d + c.e >= 4 ? ' disabled' : ''}>+</button></div>`;
    let n = 0; const num = () => ++n + ' · ';
    const cmb = isCMB(S);
    const cmbOne = c.d + c.e + (c.j ? 1 : 0) === 1;
    const radio = (k, lb, on) => `<label class="chk"><input type="radio" name="cmbAc" data-cmb="${k}"${on ? ' checked' : ''}> ${lb}</label>`;
    const arrUi = cmb
      ? `<span class="stp"><span>Acionamento</span></span>${radio('D', 'Diesel', cmbOne && c.d === 1)}${radio('E', 'Elétrica', cmbOne && c.e === 1)}${radio('J', 'Jockey', cmbOne && c.j)}
         <span class="arrcode">Arranjo <b class="code">${esc(c.code || '—')}</b></span>
         ${c.code && !cmbOne ? '<span class="pill warn">CMB é um conjunto por item — escolha um acionamento; para mais bombas use outro item ou SKID</span>' : ''}`
      : `${step('D', 'Diesel', c.d)}${step('E', 'Elétrica', c.e)}
         <label class="chk"><input type="checkbox" data-arrj${c.j ? ' checked' : ''}> Bomba jockey</label>
         <span class="arrcode">Arranjo <b class="code">${esc(c.code || '—')}</b></span>`;
    let html = `<section class="card"><h2>${num()}Equipamento <span class="sub">${cmb ? 'conjunto motobomba: um conjunto por item — escolha o acionamento' : 'diga quantas bombas de cada acionamento'}</span></h2>
      <div class="fields">${f('C21', 'Família do equipamento')}${f('C17', 'Modelo pronto', { cls: 'span2' })}${f('G17', 'Vazão nom. (USgpm)')}${f('H17', 'Pressão (mca)')}${f('I17', 'Norma')}${f('J21', 'Marca')}${f('H21', 'Unidade')}</div>
      <div class="arrbox">
        ${arrUi}
        ${over ? '<button class="restore" data-restore="' + esc(S) + '|E17">↺ arranjo do modelo pronto</button>' : ''}
      </div></section>`;
    const ml = montLines(S);
    const itemsTable = (acion) => {
      const rows = ml.filter((x) => x.acion === acion);
      const hid = hiddenLines(S).filter((x) => x.acion === acion);
      if (!rows.length && !hid.length) return '<p class="sub" style="margin:10px 0 0">Os itens deste conjunto aparecem aqui assim que a seleção acima estiver completa.</p>';
      let tot = 0;
      const tr = rows.map((x) => { const r = x.r; const h = val(S, 'H' + r); if (typeof h === 'number') tot += h; const fam = txt(S, 'C' + r);
        return `<tr><td>${esc(x.rot)}</td>${cellIn(S, 'D' + r, { datalist: fam ? dlFor(fam) : 'dl_all' })}<td>${esc(txt(S, 'E' + r))}</td>${cellIn(S, 'F' + r)}${cellIn(S, 'G' + r)}<td class="n">${show(S, 'H' + r)}</td>${cellIn(S, 'I' + r)}<td>${esc(txt(S, 'L' + r))}</td></tr>`; }).join('') + hid.map((x) => { tot += x.tot; return hiddenRow(x, false); }).join('');
      return `<div class="tw" style="margin-top:12px"><table class="t"><thead><tr><th>Item</th><th>Insumo</th><th>Fabricante</th><th>Qtd</th><th>Custo unit.</th><th>Custo total</th><th>Origem</th><th>Obs.</th></tr></thead><tbody>${tr}<tr class="tot"><td colspan="5">Custo do conjunto</td><td class="n">${fmtNum(tot, '#,##0.00')}</td><td colspan="2"></td></tr></tbody></table></div>`;
    };
    if (c.d) html += `<section class="card"><h2>${num()}Conjunto diesel <span class="sub">${c.d}× bomba + motor diesel + painel + tanque, escape, bateria…</span></h2>
      <div class="fields">${f('D19', 'Bomba', { cls: 'span2' })}${f('H19', 'Rotação (RPM)')}${f('C19', 'Potência do motor (HP)')}${f('F19', 'Arrefecimento')}${f('C20', 'Motor diesel resolvido', { cls: 'span2' })}</div>
      ${itemsTable('DIESEL')}</section>`;
    if (c.e) html += `<section class="card"><h2>${num()}Conjunto elétrico <span class="sub">${c.e}× bomba + motor elétrico + painel + base</span></h2>
      <div class="fields">${c.d ? f('BA19', 'Bomba (em branco = igual à do diesel)', { cls: 'span2' }) : f('D19', 'Bomba', { cls: 'span2' }) + f('H19', 'Rotação (RPM)')}${f('I19', 'Potência do motor (CV)')}${f('L19', 'Tensão do painel')}${f('H20', 'Motor elétrico resolvido', { cls: 'span2' })}</div>
      ${itemsTable('ELETRICA')}</section>`;
    if (c.j) html += `<section class="card"><h2>${num()}Conjunto jockey <span class="sub">bomba jockey + painel + sucção e recalque</span></h2>
      <div class="fields">${f('J19', 'Bomba jockey', { cls: 'span2' })}${c.e ? '' : f('L19', 'Tensão do painel')}</div>
      ${itemsTable('JOCKEY')}</section>`;
    // conjunto montado
    const lines = pumpLines(S);
    const fromEsc = lines.filter((l) => l.escopo.length);
    const rows = lines.map((l) => {
      const r = l.r; const src = l.escopo.length ? `<span class="pill warn">Escopo, linha ${l.escopo.map((q) => show(S, 'A' + q)).join(' e ')}</span> <button class="restore" data-rmscope="${l.escopo.join(',')}">remover do escopo</button>` : '<span class="pill ok">Montagem automática</span>';
      const pot = val(S, 'F' + r); const un = txt(S, 'C' + r) === 'DIESEL' ? 'HP' : 'CV';
      return `<tr><td class="n"><b>${show(S, 'Z' + r)}×</b></td><td>${esc(txt(S, 'C' + r))}</td><td>${esc(txt(S, 'D' + r))}</td><td>${esc(txt(S, 'E' + r))}</td><td class="n">${typeof pot === 'number' ? fmtNum(pot) + ' ' + un : ''}</td><td class="n">${esc(txt(S, 'G' + r))}</td><td>${esc(txt(S, 'H' + r))}</td><td>${esc(txt(S, 'C' + r) === 'DIESEL' ? '' : txt(S, 'J' + r))}</td><td style="min-width:220px" class="sub">${esc(txt(S, 'V' + r))}</td><td>${src}</td></tr>`;
    }).join('');
    const have = (t) => lines.some((l) => txt(S, 'C' + l.r) === t && !l.escopo.length);
    const falta = [];
    if (c.d && !have('DIESEL')) falta.push(['DIESEL', c.d, 'escolha a bomba principal, a potência diesel e a rotação']);
    if (c.e && !have('ELETRICA')) falta.push(['ELETRICA', c.e, 'escolha a bomba principal e a potência elétrica (CV)']);
    if (c.j && !have('JOCKEY')) falta.push(['JOCKEY', 1, 'escolha a bomba jockey']);
    const faltaRows = falta.map(([t, q, msg]) => `<tr><td class="n"><b>${q}×</b></td><td>${t}</td><td colspan="8"><span class="pill warn">falta completar</span> ${esc(msg)}</td></tr>`).join('');
    html += `<section class="card"><h2>Conjunto montado <span class="sub">uma linha por tipo de bomba, com a quantidade</span></h2>
      ${fromEsc.length ? `<div class="banner warn">${fromEsc.length === lines.length ? 'As bombas deste item vêm' : 'Parte das bombas vem'} do Escopo de fornecimento (linhas digitadas à mão), não da seleção acima. Se não fazem parte deste equipamento, clique em "remover do escopo".</div>` : ''}
      <div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th>Qtd</th><th>Acionamento</th><th>Bomba</th><th>Configuração</th><th>Potência</th><th>Rotação</th><th>Arrefecimento</th><th>Tensão</th><th>Motor</th><th>Origem</th></tr></thead><tbody>${rows + faltaRows || '<tr><td colspan="10" class="sub">Nada montado ainda: escolha um modelo pronto ou diga quantas bombas de cada acionamento.</td></tr>'}</tbody></table></div>
    </section>`;
    return html;
  }
  function commonSection(S) {
    const rows = montLines(S).filter((x) => x.acion === 'TODOS');
    const tr = rows.map((x) => { const r = x.r; const fam = txt(S, 'C' + r);
      return `<tr><td>${esc(x.rot)}</td><td>${esc(txt(S, 'B' + r))}</td>${cellIn(S, 'D' + r, { datalist: fam ? dlFor(fam) : 'dl_all' })}<td>${esc(txt(S, 'E' + r))}</td>${cellIn(S, 'F' + r)}${cellIn(S, 'G' + r)}<td class="n">${show(S, 'H' + r)}</td>${cellIn(S, 'I' + r)}<td>${esc(txt(S, 'L' + r))}</td></tr>`; }).join('') + hiddenLines(S).filter((x) => x.acion === 'TODOS').map((x) => hiddenRow(x, true)).join('');
    return `<section class="card"><h2>Itens comuns ao equipamento <span class="sub">base, hidráulica, mão de obra, embalagem — valem para o conjunto todo</span></h2>
      <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Bloco</th><th>Insumo</th><th>Fabricante</th><th>Qtd</th><th>Custo unit.</th><th>Custo total</th><th>Origem</th><th>Obs.</th></tr></thead><tbody>${tr || '<tr><td colspan="9" class="sub">Nada ainda.</td></tr>'}
      <tr class="tot"><td colspan="6">Subtotal da montagem automática (todos os conjuntos + comuns)</td><td class="n">${show(S, 'H64')}</td><td colspan="2"></td></tr></tbody></table></div></section>`;
  }
  // componentes da receita além da 30ª linha, numerados depois dos da planilha
  function fciHidden(S) {
    let last = 0; for (let r = 34; r <= 112; r++) { const n = val(S, 'AV' + r); if (typeof n === 'number' && n > last) last = n; }
    return hiddenLines(S).map((x, i) => ({ n: last + i + 1, grp: x.fam || '-', desc: x.desc, ori: x.ori || 'NAC', qtd: x.qtd, unit: x.imp, tot: x.qtd * x.imp,
      obs: x.ori === 'IMP' ? '' : 'NAC -  Valor zerado para cálculo do CI' }));
  }
  function scopeWarning(S) {
    let n = 0; for (let r = 68; r <= 112; r++) if (txt(S, 'D' + r)) n++;
    if (!n || !montLines(S).length) return '';
    return `<div class="banner warn">Além da montagem automática, o Escopo de fornecimento tem ${n} linha(s) digitadas à mão. Elas entram no custo, no preço e na FCI deste item. Se vieram de outro equipamento (por exemplo, do exemplo Cocamar), apague: <button class="restore" data-clearscope>apagar todo o escopo</button></div>`;
  }
  function setArr(S, d, e, j) {
    d = Math.max(0, Math.min(4, d)); e = Math.max(0, Math.min(4 - d, e));
    const code = 'D'.repeat(d) + 'E'.repeat(e) + (j ? 'J' : '');
    if (!code) return commit(S, 'E17', null, true);
    commit(S, 'E17', code);
  }
  function clearScopeRows(S, rows) {
    const d = state.doc && state.doc[S]; if (!d) return;
    for (const q of rows) for (const col of 'ABCDEFGHIJKL') delete d[col + q];
    build(); persist(); render();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-arr]');
    if (b && ui.view === 'item') { const S = ITEMS[ui.item]; const c = arrCounts(S); const [k, op] = [b.dataset.arr[0], b.dataset.arr[1]]; const dd = op === '+' ? 1 : -1; setArr(S, c.d + (k === 'D' ? dd : 0), c.e + (k === 'E' ? dd : 0), c.j); return; }
    const rm = e.target.closest('[data-rmscope]');
    if (rm) { if (!rm.dataset.sure) { rm.dataset.sure = 1; rm.textContent = 'confirmar remoção'; return; } clearScopeRows(ITEMS[ui.item], rm.dataset.rmscope.split(',').map(Number)); toast('Linhas removidas do escopo'); return; }
    if (e.target.matches('[data-clearscope]')) { const t = e.target; if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'confirmar: apagar as linhas do escopo'; return; } const rows = []; for (let q = 68; q <= 112; q++) rows.push(q); clearScopeRows(ITEMS[ui.item], rows); toast('Escopo apagado'); return; }
    if (e.target.id === 'bClearScope') { const t = e.target; if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Confirmar: apagar todo o escopo'; t.classList.add('pri'); return; } const rows = []; for (let q = 68; q <= 112; q++) rows.push(q); clearScopeRows(ITEMS[ui.item], rows); toast('Escopo apagado'); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-cmb]') && ui.view === 'item') { const S = ITEMS[ui.item]; const k = e.target.dataset.cmb; return setArr(S, k === 'D' ? 1 : 0, k === 'E' ? 1 : 0, k === 'J'); }
    if (e.target.matches('[data-arrj]') && ui.view === 'item') { const S = ITEMS[ui.item]; const c = arrCounts(S); setArr(S, c.d, c.e, e.target.checked); }
  });

  function vItem() {
    const S = ITEMS[ui.item];
    const tabs = ITEMS.map((sh, i) => `<button class="itab ${i === ui.item ? 'on' : ''} ${filled(sh) ? '' : 'empty'}" data-goitem="${i}"><b>${sh}</b><small title="${esc(txt(sh, 'C28'))}">${esc(txt(sh, 'C27') || (filled(sh) ? txt(sh, 'AR1') : 'vazio') || 'vazio')}</small></button>`).join('');
    const f = (a, lb, o) => field(S, a, lb, o);
    const hdr = (c) => txt(S, c);
    // bombas 1-4
    const bcols = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    let pumps = '';
    for (let r = 23; r <= 26; r++) pumps += `<tr><td>${esc(txt(S, 'B' + r))}</td>${bcols.map((c) => cellIn(S, c + r)).join('')}</tr>`;
    // escopo
    let scope = ''; let lastFilled = 67;
    for (let r = 68; r <= 112; r++) if (txt(S, 'D' + r) !== '' || txt(S, 'B' + r) !== '' || txt(S, 'C' + r) !== '') lastFilled = r;
    const showTo = Math.min(112, Math.max(lastFilled + (ui.extraRows || 3), 70));
    for (let r = 68; r <= showTo; r++) {
      const fam = txt(S, 'C' + r);
      scope += `<tr><td class="n">${show(S, 'A' + r)}</td>${cellIn(S, 'B' + r)}${cellIn(S, 'C' + r)}${cellIn(S, 'D' + r, { datalist: fam ? dlFor(fam) : 'dl_all' })}<td>${esc(txt(S, 'E' + r))}</td>${cellIn(S, 'F' + r)}${cellIn(S, 'G' + r)}<td class="n">${show(S, 'H' + r)}</td>${cellIn(S, 'I' + r)}<td class="n">${show(S, 'J' + r)}</td><td class="n">${show(S, 'K' + r)}</td><td>${esc(txt(S, 'L' + r))}</td></tr>`;
    }
    const tot = (r, lb) => `<tr class="tot"><td></td><td colspan="5">${esc(lb || txt(S, 'B' + r))}</td><td class="n">${show(S, 'G' + r)}</td><td class="n">${show(S, 'H' + r)}</td><td></td><td class="n">${show(S, 'J' + r)}</td><td colspan="2"></td></tr>`;
    // FCI
    let fciRows = '';
    // lista completa (o bloco da planilha tem 45 linhas; os componentes além disso só entravam no total)
    for (let r = 34; r <= 112; r++) {
      if ((r > 63 && r < 68) || val(S, 'AU' + r) !== 1) continue;
      const n = val(S, 'AV' + r), q = 120 + n; const ori = txt(S, 'AB' + r);
      const unitCell = n <= 45 ? cellIn(S, 'G' + q) : `<td class="n">${show(S, 'AD' + r) || fmtNum(val(S, 'AD' + r), '#,##0.00')}</td>`;
      const num = (x) => (typeof x === 'number' ? x : 0);
      const tot = n <= 45 ? num(val(S, 'H' + q)) : num(val(S, 'F' + r)) * num(val(S, 'AD' + r)); // até 45 vale o que foi ajustado no bloco FCI
      fciRows += `<tr><td class="n">${n}</td><td>${esc(txt(S, 'C' + r) || '-')}</td><td>${esc(txt(S, 'D' + r))}</td><td>${esc(ori)}</td><td class="n">${show(S, 'F' + r)}</td>${unitCell}<td class="n">${fmtNum(tot, '#,##0.00')}</td><td class="sub">${ori === 'NAC' ? 'NAC -  Valor zerado para cálculo do CI' : ''}</td></tr>`;
    }
    for (const x of fciHidden(S)) fciRows += `<tr><td class="n">${x.n}</td><td>${esc(x.grp)}</td><td>${esc(x.desc)}</td><td>${esc(x.ori)}</td><td class="n">${fmtNum(x.qtd)}</td><td class="n">${fmtNum(x.unit, '#,##0.00')}</td><td class="n">${fmtNum(x.tot, '#,##0.00')}</td><td class="sub">${esc(x.obs)}</td></tr>`;
    const fciKv = [172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183].map((r) => `<div>${esc(txt(S, 'D' + r))}</div><div>${esc(show(S, 'C' + r))}</div>`).join('')
      + '<div class="sep"></div>' + [185, 186, 187, 188].map((r) => `<div>${esc(txt(S, 'B' + r))}</div><div style="text-align:left;font-weight:400">${esc(show(S, 'C' + r))}</div>`).join('');
    const sit = val(S, 'P84'), al = val(S, 'P91');
    return `<div class="stack">
      <div class="itemtabs" role="tablist">${tabs}</div>
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
        <div style="min-width:0"><h1>${S}</h1><div class="sub">${esc(txt(S, 'C28')) || 'Escolha um modelo pronto (aqui ou na Montagem rápida da proposta) para montar o item.'}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${situPill(sit)}${al && al !== 'OK' ? situPill(al) : ''}<button class="btn sm" id="bClearItem">Limpar este item</button></div>
      </div>
      <div class="codebox">${esc(txt(S, 'C27') || 'código sai aqui')}</div>
      ${scopeWarning(S)}
      <div class="kpis">
        <div class="kpi lead"><span>${esc(hdr('B14'))}</span><b>${brl(val(S, 'B15'))}</b></div>
        <div class="kpi"><span>${esc(hdr('D14'))}</span><b>${brl(val(S, 'D15'))}</b><em>quantidade ${show(S, 'P17')}</em></div>
        <div class="kpi"><span>${esc(hdr('F14'))}</span><b>${fmtNum(val(S, 'F15'), '0.0000')}</b></div>
        <div class="kpi"><span>${esc(hdr('H14'))}</span><b>${fmtNum(val(S, 'H15'), '0.0000')}</b></div>
        <div class="kpi"><span>${esc(hdr('J14'))}</span><b class="${al === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</b></div>
      </div>
      <div class="split">
        <div class="stack">
          ${equipSections(S)}
          <section class="card"><h2>Código e descrição</h2>
            <div class="fields wide">
              ${field(S, 'C28', 'Descrição breve', { ro: true, cls: 'spanall' })}${field(S, 'C29', 'Descrição completa', { ro: true, cls: 'spanall' })}${field(S, 'C30', 'Ponto operacional', { ro: true, cls: 'spanall' })}
              <div class="spanall sub">${esc(txt(S, 'C31'))}</div>
            </div>
            <details style="margin-top:12px"><summary class="sub">Ajuste fino da codificação — bombas 1 a 4, célula por célula</summary>
              <div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th>Bomba</th>${bcols.map((c) => `<th>${esc(txt(S, c + '22'))}</th>`).join('')}</tr></thead><tbody>${pumps}</tbody></table></div>
            </details></section>
          <section class="card"><h2>Comercial e fiscal <span class="sub">herdado da proposta; mude aqui só o que for deste item</span></h2>
            <div class="fields">
              ${f('C4', 'Descrição do item', { cls: 'spanall' })}${f('C5', 'Família de produto', { cls: 'span2' })}${f('C6', 'Quantidade')}${f('C7', 'Norma')}${f('C8', 'Desconto de negociação')}
              ${f('G4', 'Segmento')}${f('G5', 'UF de destino')}${f('G6', 'Cadastro fiscal', { cls: 'span2' })}${f('G7', 'NCM')}${f('G8', 'ICMS manual (opcional)')}
              ${f('K4', 'Condição de pagamento', { cls: 'span2' })}${f('K5', 'Comissão — vendedor')}${f('K6', 'Comissão — agente')}${f('K7', 'Folga de negociação')}${f('K8', 'Encargo financeiro')}
              ${f('J17', 'Modo de preço')}${f('L17', 'Margem alvo')}
            </div></section>
          <section class="card"><h2>Frete e start-up <span class="sub">o frete vem da proposta, já rateado por custo</span></h2>
            <div class="fields">
              ${field(S, 'D11', 'Frete — modalidade', { ro: true, cls: 'span2' })}${field(S, 'H11', 'Frete — parte deste item', { ro: true, fmt: brl })}${field(S, 'K11', 'Frete — por unidade', { ro: true, lead: true, fmt: brl })}
              ${f('C12', 'Start-up — distância (km)')}${f('E12', 'R$ por km')}${f('F12', 'Diárias')}${f('G12', 'Valor da diária')}${f('I12', 'Valor fechado')}${field(S, 'K12', 'Start-up por unidade', { ro: true, lead: true, fmt: brl })}
            </div></section>
          ${commonSection(S)}
          <section class="card"><h2>Escopo de fornecimento <span class="sub">o que você acrescenta à montagem; insumo com lista do CADASTRO pela família</span></h2>
            <div class="tw"><table class="t"><thead><tr><th>#</th><th>Bloco</th><th>Família</th><th>Insumo</th><th>Fabricante</th><th>Qtd</th><th>Custo unit.</th><th>Custo total</th><th>Origem</th><th>Venda</th><th>Catálogo</th><th>Obs.</th></tr></thead><tbody>${scope}${tot(113)}${tot(114)}</tbody></table></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">${showTo < 112 ? '<button class="btn sm" id="bMoreRows">+ linhas</button>' : ''}${lastFilled >= 68 ? '<button class="btn sm" id="bClearScope">Apagar todo o escopo</button>' : ''}
              <span class="sub">Nacional ${brl(val(S, 'H115'))} · Importado ${brl(val(S, 'H116'))} · Serviços ${brl(val(S, 'H117'))} · Materiais ${brl(val(S, 'H118'))} · CI ${pct(val(S, 'J115'), 2)} (${esc(txt(S, 'J116'))})</span></div>
          </section>
          <details class="card"><summary>FCI — ficha de conteúdo de importação</summary>
            <div class="stack">
              <div class="docbar"><span class="sub">Baixar a FCI deste item</span><button class="btn sm" data-doc="fcipdf" data-docitem="${S}">PDF</button><button class="btn sm" data-doc="fcixlsx" data-docitem="${S}">Excel (template)</button></div>
              <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Grupo</th><th>Descrição</th><th>Origem</th><th>Qtd</th><th>Parcela imp. unit.</th><th>Parcela importada</th><th>Observação</th></tr></thead><tbody>${fciRows}<tr class="tot"><td colspan="6">${esc(txt(S, 'B166'))}</td><td class="n">${show(S, 'H166')}</td><td></td></tr></tbody></table></div>
              <div class="kv">${fciKv}</div>
              <div class="fields">${f('C191', txt(S, 'D191'), { cls: 'span2' })}${f('C193', 'Unidade p/ transmissão da FCI')}${f('C194', 'Finalidade (consumidor final)', { list: ['ATIVO IMOBILIZADO', 'USO E CONSUMO'] })}${field(S, 'C195', 'FCI', { ro: true, lead: true })}${field(S, 'C196', 'Pendências', { ro: true, cls: 'span2' })}</div>
            </div>
          </details>
        </div>
        <aside class="card side"><h2>Memória de cálculo</h2><div class="memo">${memoCalc(S)}</div></aside>
      </div>
      ${datalists()}
    </div>`;
  }

  // listas de insumos por família (CADASTRO)
  let dlMap = null;
  function buildDl() {
    dlMap = new Map(); const all = new Set();
    for (let r = 2; r <= 1000; r++) {
      const fam = wb.value('CADASTRO', 'C' + r), prod = wb.value('CADASTRO', 'D' + r);
      if (!prod || isErr(prod) || !fam || isErr(fam)) continue;
      const k = String(fam); if (!dlMap.has(k)) dlMap.set(k, new Set()); dlMap.get(k).add(String(prod)); all.add(String(prod));
    }
    dlMap.set('*', all);
  }
  function dlFor(fam) { if (!dlMap) buildDl(); return dlMap.has(fam) ? 'dl_' + fam.replace(/\W/g, '') : 'dl_all'; }
  function datalists() {
    if (!dlMap) buildDl();
    let h = ''; for (const [k, set] of dlMap) h += `<datalist id="${k === '*' ? 'dl_all' : 'dl_' + k.replace(/\W/g, '')}">${[...set].map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>`;
    return h;
  }

  function vMemorial() {
    const M = 'MEMORIAL';
    const cols = []; for (let i = 0; i < 10; i++) if (filled(ITEMS[i])) cols.push(numToCol(3 + i));
    const rows = [];
    for (let r = 3; r <= 38; r++) {
      const lb = txt(M, 'B' + r); if (!lb) continue;
      if (val(M, 'M' + r) === null && val(M, 'C' + r) === null) { rows.push(`<tr><td colspan="${cols.length + 2}" style="font-weight:700;color:var(--or-ink)">${esc(lb)}</td></tr>`); continue; }
      const bold = /^TOTAL|Margem|Preço de venda com impostos e COM/i.test(lb);
      rows.push(`<tr class="${bold ? 'tot' : ''}"><td>${esc(lb)}</td>${cols.map((c) => `<td class="n">${show(M, c + r)}</td>`).join('')}<td class="n"><b>${show(M, 'M' + r)}</b></td></tr>`);
    }
    let notes = ''; for (let r = 39; r <= 48; r++) { const t = txt(M, 'B' + r); if (t) notes += `<p class="sub">${esc(t)}</p>`; }
    return `<div class="stack"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end"><div><h1>Memorial de formação de preço</h1><div class="sub">No formato que o financeiro pede: custos, impostos, comissão, margem e o demonstrativo — por item e total da proposta.</div></div><div class="docbar"><span class="sub">Documentos para o financeiro</span><button class="btn sm pri" data-doc="memorial">Memorial (PDF)</button><button class="btn sm" data-doc="fcipdf">FCI (PDF)</button><button class="btn sm" data-doc="fcixlsx">FCI (Excel)</button></div></div>
      <section class="card"><div class="tw"><table class="t"><thead><tr><th>Linha</th>${cols.map((c) => `<th>ITEM ${String(colToNum(c) - 2).padStart(2, '0')}</th>`).join('')}<th>Total da proposta</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${notes}</section></div>`;
  }

  // ---------- cadastro: insumos, kits, importação, histórico e demais tabelas ----------
  const H = REG.helpers;
  const CAD_TABS = [['insumos', 'Insumos'], ['motor', 'Kits de motor diesel'], ['bomba', 'Kits de bomba'], ['importar', 'Importar preços'], ['historico', 'Histórico'], ['tabelas', 'Outras tabelas']];
  const fmtAt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };
  const fmtVal = (v) => typeof v === 'number' ? NF[2].format(v) : v === null || v === undefined || v === '' ? '—' : String(v);
  const who = (id) => id ? `<span data-uid="${esc(id)}">…</span>` : (REG.mode === 'shared' ? 'alguém da equipe' : 'neste navegador');
  async function fillNames(root) {
    const els = [...(root || document).querySelectorAll('[data-uid]')]; if (!els.length) return;
    const names = await REG.names(els.map((e) => e.dataset.uid));
    for (const e of els) e.textContent = names[e.dataset.uid] || 'alguém da equipe';
  }
  function famList() { const s = new Set(REG.insumos.map((x) => x.fam).filter(Boolean)); return [...s].sort((a, b) => H.famCode(a) - H.famCode(b)); }
  function cadStatus() {
    const shared = REG.mode === 'shared';
    const chips = [];
    chips.push(shared ? '<span class="pill ok">Compartilhado com a equipe</span>' : '<span class="pill mute">Salvo só neste navegador</span>');
    if (shared && !REG.ready) chips.push('<span class="pill warn">Sincronizando…</span>');
    chips.push(REG.canEditCadastro ? '<span class="pill ok">Você pode editar</span>' : '<span class="pill warn">Somente leitura — edição é para quem tem acesso de Editor</span>');
    let banner = '';
    if (shared && REG.ready && !REG.seeded) banner = '<div class="banner warn">O cadastro compartilhado ainda está vazio. Até ele ser carregado, o app usa os valores da planilha REV21 e a edição fica bloqueada.</div>';
    if (REG.error) banner += `<div class="banner bad">Não consegui falar com o banco compartilhado (${esc(REG.error)}). O app segue com a última versão que carregou; recarregue a página para tentar de novo.</div>`;
    return `<div class="legend" style="gap:8px">${chips.join('')}</div>${banner}`;
  }
  function vCadastro() {
    const tab = ui.cad || 'insumos';
    const body = { insumos: vInsumos, motor: () => vKits('motor'), bomba: () => vKits('bomba'), importar: vImportar, historico: vHistorico, tabelas: vTabelas }[tab]();
    return `<div class="stack">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
        <div><h1>Cadastro</h1><div class="sub">Insumos, kits e tabelas que alimentam o preço. Uma mudança aqui vale para todas as propostas${REG.mode === 'shared' ? ' de toda a equipe' : ' deste navegador'}, e cada alteração fica registrada no histórico.</div></div>
        ${cadStatus()}
      </div>
      <div class="subtabs" role="tablist">${CAD_TABS.map(([k, lb]) => `<button role="tab" data-cad="${k}" aria-selected="${k === tab}">${lb}</button>`).join('')}</div>
      ${body}
    </div>`;
  }

  // ---- insumos ----
  function vInsumos() {
    const q = (ui.insQ || '').trim().toLowerCase(); const fam = ui.insFam || ''; const sem = !!ui.insSem;
    const all = H.sortIns(REG.insumos);
    const semPreco = all.filter((x) => typeof x.valor !== 'number');
    let list = all;
    if (fam) list = list.filter((x) => x.fam === fam);
    if (sem) list = list.filter((x) => typeof x.valor !== 'number');
    if (q) list = list.filter((x) => [x.id, x.produto, x.fab, x.tipo, x.obs, x.fam].join(' ').toLowerCase().includes(q));
    const shown = list.slice(0, 400);
    const last = all.reduce((m, x) => (x.upd && x.upd > (m.upd || '') ? x : m), {});
    const rows = shown.map((x) => `<tr class="click" data-ins="${esc(x.id)}"><td class="code">${esc(x.id)}</td><td>${esc(x.fam)}</td><td style="min-width:280px">${esc(x.produto)}</td><td>${esc(x.fab || '')}</td><td>${esc(x.tipo || '')}</td><td class="n">${typeof x.valor === 'number' ? brl(x.valor) : '<span class="pill warn">sem preço</span>'}</td><td>${esc(x.origem || '')}</td><td class="sub">${x.upd ? fmtAt(x.upd) : ''}</td></tr>`).join('');
    const fams = famList();
    return `<div class="kpis">
        <div class="kpi"><span>Insumos</span><b>${NF[0].format(all.length)}</b><em>limite da planilha: ${H.LIMITS.insumos}</em></div>
        <div class="kpi"><span>Famílias</span><b>${fams.length}</b></div>
        <div class="kpi"><span>Sem preço</span><b class="${semPreco.length ? 'bad-t' : ''}">${semPreco.length}</b><em>puxam custo zero na proposta</em></div>
        <div class="kpi"><span>Última alteração</span><b style="font-size:18px">${last.upd ? fmtAt(last.upd) : '—'}</b><em>${last.upd ? esc(last.produto || '') : 'valores da planilha REV21'}</em></div>
      </div>
      <section class="card">
        <div class="sheetbar">
          <input id="insQ" type="search" placeholder="Buscar por código, produto, fabricante…" value="${esc(ui.insQ || '')}" aria-label="Buscar insumo" style="flex:1 1 260px">
          <select id="insFam" aria-label="Família"><option value="">Todas as famílias</option>${fams.map((f) => `<option${f === fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" id="insSem"${sem ? ' checked' : ''}> Só sem preço</label>
          <span style="flex:1"></span>
          <button class="btn sm" id="insCsv">Exportar CSV</button>
          ${REG.canEditCadastro ? '<button class="btn sm pri" id="insNew">+ Novo insumo</button>' : ''}
        </div>
        <p class="sub" style="margin:8px 0">${list.length === all.length ? all.length + ' insumos' : list.length + ' de ' + all.length + ' insumos'}${list.length > shown.length ? ' — mostrando os primeiros ' + shown.length + '; refine a busca' : ''}. Clique numa linha para ver ou editar.</p>
        <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr><th>Código</th><th>Família</th><th>Produto</th><th>Fabricante</th><th>Tipo/config.</th><th>Valor</th><th>Origem</th><th>Atualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="sub">Nenhum insumo com esse filtro.</td></tr>'}</tbody></table></div>
      </section>`;
  }
  function insumoModal(id, presetFam) {
    const isNew = !id; const rec = isNew ? { fam: presetFam || ui.insFam || famList()[0], origem: 'NAC' } : Object.assign({}, REG.insumos.find((x) => x.id === id));
    if (!rec) return;
    const ro = !REG.canEditCadastro ? ' disabled' : '';
    const fams = famList();
    const tipos = [...new Set(REG.insumos.filter((x) => x.fam === rec.fam && x.tipo).map((x) => x.tipo))];
    const code = isNew ? REG.nextCode(rec.fam) : { a: rec.a, b: rec.b };
    const hist = REG.historico.filter((h) => h.ref === id).slice(0, 12);
    const histHtml = hist.length ? `<div class="hist">${hist.map((h) => `<div><small>${fmtAt(h.at)} · ${who(h.by)}</small>${(h.mudancas || []).map((m) => `<div class="chg"><b>${esc(m.campo)}</b> ${esc(fmtVal(m.de))} → ${esc(fmtVal(m.para))}</div>`).join('')}</div>`).join('')}</div>` : '<p class="sub">Sem alterações registradas — valor da planilha REV21.</p>';
    modal(`<h2>${isNew ? 'Novo insumo' : 'Insumo ' + esc(rec.id)}</h2>
      <form id="insForm" class="fields" autocomplete="off">
        <div class="f span2"><label for="fFam">Família</label><select id="fFam"${ro || (!isNew ? '' : '')}>${fams.map((f) => `<option${f === rec.fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}${REG.canEditCadastro ? '<option value="__nova">+ Nova família…</option>' : ''}</select></div>
        <div class="f" id="fNovaWrap" hidden><label for="fNova">Nova família (nn.NOME)</label><input id="fNova" placeholder="46.NOMEDAFAMILIA"></div>
        <div class="f"><label>Código</label><div class="ro code" id="fCode">${esc(String(code.a).padStart(2, '0') + '-' + code.b)}</div></div>
        <div class="f spanall"><label for="fProd">Produto (descrição)</label><input id="fProd" value="${esc(rec.produto || '')}" required${ro}></div>
        <div class="f"><label for="fFab">Fabricante</label><input id="fFab" value="${esc(rec.fab || '')}"${ro}></div>
        <div class="f"><label for="fTipo">Tipo/config.</label><input id="fTipo" list="dlTipos" value="${esc(rec.tipo || '')}"${ro}><datalist id="dlTipos">${tipos.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div class="f"><label for="fVal">Valor (R$)</label><input id="fVal" inputmode="decimal" value="${typeof rec.valor === 'number' ? esc(NF[2].format(rec.valor)) : ''}"${ro}></div>
        <div class="f"><label for="fOri">Origem</label><select id="fOri"${ro}><option${rec.origem === 'NAC' ? ' selected' : ''}>NAC</option><option${rec.origem === 'IMP' ? ' selected' : ''}>IMP</option></select></div>
        <div class="f spanall"><label for="fObs">Observações</label><input id="fObs" value="${esc(rec.obs || '')}"${ro}></div>
      </form>
      ${!isNew ? '<p class="sub">Propostas usam o insumo pelo nome do produto: se você renomear, as propostas que já usam o nome antigo passam a mostrar "fora do catálogo".</p>' : ''}
      <p class="sub" id="fHint"></p>
      <div id="fErr" class="bad-t"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${REG.canEditCadastro ? `<button class="btn pri" id="fSave">${isNew ? 'Cadastrar' : 'Salvar'}</button>` : ''}
        ${REG.canEditCadastro && !isNew ? '<button class="btn" id="fDel">Excluir</button>' : ''}
        <button class="btn" data-close>${REG.canEditCadastro ? 'Cancelar' : 'Fechar'}</button>
      </div>
      ${!isNew ? `<h2>Histórico deste insumo</h2>${histHtml}` : ''}`,
    (o, close) => {
      fillNames(o);
      const famSel = $('#fFam', o), nova = $('#fNova', o);
      const hint = () => {
        const f = famSel.value === '__nova' ? nova.value.trim().toUpperCase() : famSel.value;
        const h = { '11.BOMBAMANCAL': 'Bomba: preencha o Tipo/config. com END SUCTION ou SPLIT CASE — é ele que escolhe qual total do KIT BOMBA usar. Cadastre também o kit na aba Kits de bomba.', '13.JOCKEY': 'Jockey: use MONOBLOCO em Tipo/config. Aparece no seletor na hora.', '01.MOTORDIESEL': 'Motor diesel: descreva no padrão MODELO 000HP@0000RPM 0CIL 00VCC ARREFECIMENTO e cadastre também o kit em Kits de motor diesel.' }[f] || '';
        $('#fHint', o).textContent = h;
        if (isNew) { const c = famSel.value === '__nova' ? (/^\d{1,2}\./.test(f) ? { a: H.famCode(f), b: H.famCode(f) * 1000 + 1 } : null) : REG.nextCode(f); $('#fCode', o).textContent = c ? String(c.a).padStart(2, '0') + '-' + c.b : '—'; }
      };
      famSel.onchange = () => { $('#fNovaWrap', o).hidden = famSel.value !== '__nova'; hint(); };
      nova.oninput = hint; hint();
      const sv = $('#fSave', o);
      if (sv) sv.onclick = async (e) => {
        e.preventDefault();
        let fam = famSel.value;
        if (fam === '__nova') { fam = nova.value.trim().toUpperCase().replace(/\s+/g, ''); if (!/^\d{1,2}\.[A-Z0-9]+$/.test(fam)) { $('#fErr', o).textContent = 'Nova família: use o formato nn.NOME, sem acento e sem espaço (ex.: 46.KITSUCCAO).'; return; } fam = fam.replace(/^(\d)\./, '0$1.'); }
        const produto = $('#fProd', o).value.trim(); if (!produto) { $('#fErr', o).textContent = 'Informe a descrição do produto.'; return; }
        const dupe = REG.insumos.find((x) => x.produto.toLowerCase() === produto.toLowerCase() && x.id !== rec.id);
        if (dupe && !sv.dataset.dupeOk) { $('#fErr', o).textContent = 'Já existe ' + dupe.id + ' com essa mesma descrição — a proposta puxa sempre o primeiro. Clique de novo para salvar mesmo assim.'; sv.dataset.dupeOk = 1; return; }
        const vtxt = $('#fVal', o).value.trim(); const valor = vtxt === '' ? null : parseInput(vtxt, 'num');
        if (valor !== null && typeof valor !== 'number') { $('#fErr', o).textContent = 'Valor inválido. Use por exemplo 12.345,67.'; return; }
        let a = rec.a, b = rec.b, nid = rec.id;
        if (isNew || H.famCode(fam) !== rec.a) { const c = REG.insumos.some((x) => x.fam === fam) ? REG.nextCode(fam) : { a: H.famCode(fam), b: H.famCode(fam) * 1000 + 1 }; a = c.a; b = c.b; if (isNew) nid = REG.newInsumoId(a, b); }
        const out = { id: nid, a, b, fam, produto, fab: $('#fFab', o).value.trim(), tipo: $('#fTipo', o).value.trim().toUpperCase(), valor, origem: $('#fOri', o).value, obs: $('#fObs', o).value.trim() };
        sv.disabled = true; sv.textContent = 'Salvando…';
        try { const ch = await REG.saveInsumo(out, isNew); close(); toast(ch === false ? 'Nada mudou' : (isNew ? 'Cadastrado: ' + nid : 'Salvo: ' + nid)); }
        catch (err) { sv.disabled = false; sv.textContent = isNew ? 'Cadastrar' : 'Salvar'; $('#fErr', o).textContent = errMsg(err); }
      };
      const del = $('#fDel', o);
      if (del) del.onclick = async () => {
        if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); $('#fErr', o).textContent = 'Propostas que usam este insumo passam a mostrar "fora do catálogo".'; return; }
        try { await REG.deleteInsumo(rec.id); close(); toast('Excluído: ' + rec.id); } catch (err) { $('#fErr', o).textContent = errMsg(err); }
      };
    });
  }
  function errMsg(e) {
    if (!e) return 'Algo deu errado.';
    if (e.code === 'invalid_argument') return 'O banco recusou a gravação — provavelmente você não tem acesso de Editor a este app.';
    if (e.code === 'quota_exceeded') return 'O banco compartilhado chegou ao limite de documentos. Exclua propostas antigas ou fale com quem publicou o app.';
    if (e.code === 'resource_exhausted') return 'Muitas gravações em pouco tempo. Espere alguns segundos e tente de novo.';
    if (e.code === 'unavailable' || e.code === 'revoked') return 'Sem conexão com o banco compartilhado agora. Tente de novo em instantes.';
    return e.message || String(e);
  }
  function csvCell(v) { const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  async function exportInsumos() {
    const lines = [['Código', 'Família', 'Produto', 'Fabricante', 'Tipo/config.', 'Valor', 'Origem', 'Observações'].join(';')];
    for (const x of H.sortIns(REG.insumos)) lines.push([x.id, x.fam, x.produto, x.fab, x.tipo, x.valor, x.origem, x.obs].map(csvCell).join(';'));
    const ok = await REG.save('cadastro-insumos-' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
    toast(ok ? 'CSV gerado' : 'Download cancelado');
  }

  // ---- kits ----
  function vKits(kind) {
    const motor = kind === 'motor'; const list = H.sortKit(motor ? REG.kitMotor : REG.kitBomba);
    const lim = motor ? H.LIMITS.kitMotor : H.LIMITS.kitBomba;
    const q = (ui.kitQ || '').trim().toLowerCase();
    const rows = list.filter((k) => !q || [k.desc, k.marca, k.tipo].join(' ').toLowerCase().includes(q)).map((k) => {
      const p = k.p || {}; const t = motor ? H.kmdTotals(p) : H.kbTotals(p);
      return `<tr class="click" data-kit="${esc(k.id)}"><td style="min-width:300px">${esc(k.desc)}</td><td>${esc(k.tipo || '')}</td><td>${esc(k.marca || '')}</td><td class="n">${brl(p.D || 0)}</td><td class="n">${brl(motor ? t.nbr : t.es)}</td><td class="n"><b>${brl(motor ? t.padrao : t.bp)}</b></td><td class="sub">${k.upd ? fmtAt(k.upd) : ''}</td></tr>`;
    }).join('');
    return `<section class="card">
      <div class="sheetbar"><input id="kitQ" type="search" placeholder="Buscar kit…" value="${esc(ui.kitQ || '')}" aria-label="Buscar kit" style="flex:1 1 240px"><span class="sub">${list.length} de ${lim} linhas usadas</span><span style="flex:1"></span>${REG.canEditCadastro ? `<button class="btn sm pri" id="kitNew" data-kind="${kind}">+ Novo kit</button>` : ''}</div>
      <p class="sub" style="margin:8px 0">${motor ? 'O montador lê daqui o custo total do conjunto do motor (peça, painel, base, tanque, escape, bateria…). "Total NBR 13714" usa o painel e o tanque NBR; o outro, o painel padrão.' : 'O montador lê daqui o custo da bomba com os acessórios. A bomba END SUCTION usa o total sem as válvulas; a SPLIT CASE (bipartida) usa o total completo — quem decide é o Tipo/config. do insumo no CADASTRO.'} A descrição tem de ser igual à do insumo no CADASTRO.</p>
      <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr><th>Descrição</th><th>Origem</th><th>Marca</th><th>${motor ? 'Motor' : 'Bomba'}</th><th>${motor ? 'Total NBR 13714' : 'Total end suction'}</th><th>${motor ? 'Total' : 'Total split case'}</th><th>Atualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="sub">Nenhum kit.</td></tr>'}</tbody></table></div>
    </section>`;
  }
  function kitModal(kind, id) {
    const motor = kind === 'motor'; const list = motor ? REG.kitMotor : REG.kitBomba;
    const isNew = !id; const rec = isNew ? { desc: '', tipo: 'NAC', marca: '', p: {} } : JSON.parse(JSON.stringify(list.find((x) => x.id === id)));
    const labels = motor ? H.KMD_LABELS : H.KB_LABELS; const ro = REG.canEditCadastro ? '' : ' disabled';
    const hist = REG.historico.filter((h) => h.ref === id).slice(0, 10);
    const parts = Object.entries(labels).map(([c, lb]) => `<div class="f"><label for="k${c}">${esc(lb)}</label><input id="k${c}" data-part="${c}" inputmode="decimal" value="${typeof rec.p[c] === 'number' ? esc(NF[2].format(rec.p[c])) : ''}"${ro}></div>`).join('');
    const prodList = REG.insumos.filter((x) => x.fam === (motor ? '01.MOTORDIESEL' : '11.BOMBAMANCAL')).map((x) => x.produto);
    modal(`<h2>${isNew ? 'Novo kit' : 'Kit'} — ${motor ? 'motor diesel' : 'bomba'}</h2>
      <div class="fields">
        <div class="f spanall"><label for="kDesc">Descrição (igual à do CADASTRO)</label><input id="kDesc" list="dlKitProd" value="${esc(rec.desc)}"${ro}><datalist id="dlKitProd">${prodList.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
        <div class="f"><label for="kTipo">Origem</label><select id="kTipo"${ro}><option${rec.tipo === 'NAC' ? ' selected' : ''}>NAC</option><option${rec.tipo === 'IMP' ? ' selected' : ''}>IMP</option></select></div>
        <div class="f"><label for="kMarca">Marca</label><input id="kMarca" value="${esc(rec.marca || '')}"${ro}></div>
      </div>
      <p class="sub" id="kWarn"></p>
      <h2>Componentes (R$)</h2>
      <div class="fields" id="kParts">${parts}</div>
      <div class="kpis" id="kTot"></div>
      <div id="kErr" class="bad-t"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${REG.canEditCadastro ? `<button class="btn pri" id="kSave">${isNew ? 'Cadastrar kit' : 'Salvar'}</button>` : ''}${REG.canEditCadastro && !isNew ? '<button class="btn" id="kDel">Excluir</button>' : ''}<button class="btn" data-close>${REG.canEditCadastro ? 'Cancelar' : 'Fechar'}</button></div>
      ${!isNew ? `<h2>Histórico deste kit</h2>${hist.length ? `<div class="hist">${hist.map((h) => `<div><small>${fmtAt(h.at)} · ${who(h.by)}</small>${(h.mudancas || []).map((m) => `<div class="chg"><b>${esc(m.campo)}</b> ${esc(fmtVal(m.de))} → ${esc(fmtVal(m.para))}</div>`).join('')}</div>`).join('')}</div>` : '<p class="sub">Sem alterações registradas — valores da planilha REV21.</p>'}` : ''}`,
    (o, close) => {
      fillNames(o);
      const read = () => { const p = {}; for (const inp of o.querySelectorAll('[data-part]')) { const t = inp.value.trim(); if (t === '') continue; const v = parseInput(t, 'num'); if (typeof v === 'number') p[inp.dataset.part] = v; } return p; };
      const upd = () => {
        const p = read(); const t = motor ? H.kmdTotals(p) : H.kbTotals(p);
        $('#kTot', o).innerHTML = motor ? `<div class="kpi"><span>Total NBR 13714</span><b>${brl(t.nbr)}</b></div><div class="kpi lead"><span>Total</span><b>${brl(t.padrao)}</b></div>` : `<div class="kpi"><span>Total end suction</span><b>${brl(t.es)}</b></div><div class="kpi lead"><span>Total split case</span><b>${brl(t.bp)}</b></div>`;
        const d = $('#kDesc', o).value.trim();
        $('#kWarn', o).textContent = d && !REG.insumos.some((x) => x.produto.toLowerCase() === d.toLowerCase()) ? 'Essa descrição não está no CADASTRO. Cadastre o insumo também (família ' + (motor ? '01.MOTORDIESEL' : '11.BOMBAMANCAL') + ') para ele aparecer no seletor do montador.' : '';
      };
      o.addEventListener('input', upd); upd();
      const sv = $('#kSave', o);
      if (sv) sv.onclick = async () => {
        const desc = $('#kDesc', o).value.trim(); if (!desc) { $('#kErr', o).textContent = 'Informe a descrição.'; return; }
        const out = { id: rec.id || ((motor ? 'm' : 'b') + Date.now().toString(36)), ord: rec.ord, desc, tipo: $('#kTipo', o).value, marca: $('#kMarca', o).value.trim(), p: read() };
        sv.disabled = true;
        try { const ch = await REG.saveKit(kind, out, isNew); close(); toast(ch === false ? 'Nada mudou' : 'Kit salvo'); } catch (err) { sv.disabled = false; $('#kErr', o).textContent = errMsg(err); }
      };
      const del = $('#kDel', o);
      if (del) del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); return; } try { await REG.deleteKit(kind, rec.id); close(); toast('Kit excluído'); } catch (err) { $('#kErr', o).textContent = errMsg(err); } };
    });
  }

  // ---- importar preços ----
  let imp = null; // {name, rows:[[...]], header:bool, colId, colVal, sel:Set}
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Não consegui carregar o leitor de Excel. Salve a planilha como CSV ou copie e cole as colunas.')); document.head.appendChild(s); });
  }
  function parseText(t) {
    const lines = t.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    const sep = lines[0] && lines[0].includes('\t') ? '\t' : (lines[0] || '').split(';').length >= (lines[0] || '').split(',').length ? ';' : ',';
    return lines.map((l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); });
  }
  function guessCols(rows) {
    const h = (rows[0] || []).map((x) => String(x).toUpperCase());
    let id = h.findIndex((x) => /C[ÓO]D/.test(x)); if (id < 0) id = h.findIndex((x) => /PRODUTO|DESCRI|ITEM|MODELO/.test(x));
    let val = h.findIndex((x) => /VALOR|PRE[ÇC]O|CUSTO|UNIT/.test(x));
    const header = id >= 0 || val >= 0;
    return { header, colId: Math.max(0, id), colVal: val >= 0 ? val : Math.min(1, h.length - 1) };
  }
  function toPrice(v) { if (typeof v === 'number') return v; const n = parseInput(String(v || ''), 'num'); return typeof n === 'number' ? n : null; }
  function matchImport() {
    if (!imp) return null;
    const byId = new Map(REG.insumos.map((x) => [x.id, x])); const byB = new Map(REG.insumos.map((x) => [String(x.b), x]));
    const byName = new Map(); for (const x of H.sortIns(REG.insumos)) { const k = x.produto.trim().toLowerCase(); if (!byName.has(k)) byName.set(k, x); }
    const out = { ok: [], same: [], miss: [], bad: [] };
    imp.rows.slice(imp.header ? 1 : 0).forEach((r, i) => {
      const key = String(r[imp.colId] ?? '').trim(); if (!key) return;
      const price = toPrice(r[imp.colVal]);
      const rec = byId.get(key) || byId.get(key.replace(/^(\d)-/, '0$1-')) || byB.get(key) || byName.get(key.toLowerCase());
      if (!rec) { out.miss.push({ key, price }); return; }
      if (price === null || price < 0) { out.bad.push({ key, raw: r[imp.colVal] }); return; }
      const row = { i, id: rec.id, produto: rec.produto, de: rec.valor ?? null, para: Math.round(price * 100) / 100 };
      if (row.de !== null && Math.abs(row.de - row.para) < 0.005) out.same.push(row); else out.ok.push(row);
    });
    return out;
  }
  function vImportar() {
    if (!REG.canEditCadastro) return `<section class="card"><p class="sub">Importar preços muda o cadastro de todos. Só quem tem acesso de Editor ao app pode fazer.</p></section>`;
    let step2 = '';
    if (imp) {
      const cols = (imp.rows[0] || []).map((c, i) => `<option value="${i}">${esc(imp.header ? (c || 'Coluna ' + (i + 1)) : 'Coluna ' + numToCol(i + 1) + ' — ' + String(c).slice(0, 30))}</option>`).join('');
      const sel = (id, v) => cols.replace(`<option value="${v}">`, `<option value="${v}" selected>`);
      const m = matchImport();
      if (!imp.sel) imp.sel = new Set(m.ok.map((x) => x.id));
      const rows = m.ok.map((x) => { const d = x.de ? (x.para - x.de) / x.de : null; return `<tr><td><input type="checkbox" data-impsel="${esc(x.id)}"${imp.sel.has(x.id) ? ' checked' : ''} aria-label="Aplicar ${esc(x.id)}"></td><td class="code">${esc(x.id)}</td><td>${esc(x.produto)}</td><td class="n">${x.de === null ? '<span class="pill warn">sem preço</span>' : brl(x.de)}</td><td class="n"><b>${brl(x.para)}</b></td><td class="n ${d !== null && Math.abs(d) > 0.3 ? 'bad-t' : ''}">${d === null ? '—' : (d > 0 ? '+' : '') + NF[1].format(d * 100) + '%'}</td></tr>`; }).join('');
      step2 = `<section class="card"><h2>2. Colunas <span class="sub">${esc(imp.name)} · ${imp.rows.length} linhas</span></h2>
        <div class="fields"><div class="f span2"><label for="impId">Coluna que identifica o insumo (código 01-1001 ou descrição do produto)</label><select id="impId">${sel('impId', imp.colId)}</select></div>
        <div class="f"><label for="impVal">Coluna do preço</label><select id="impVal">${sel('impVal', imp.colVal)}</select></div>
        <label class="chk" style="align-self:end"><input type="checkbox" id="impHdr"${imp.header ? ' checked' : ''}> Primeira linha é cabeçalho</label></div></section>
        <section class="card"><h2>3. Conferir e aplicar</h2>
        <div class="kpis"><div class="kpi lead"><span>Preços que mudam</span><b>${m.ok.length}</b></div><div class="kpi"><span>Iguais ao cadastro</span><b>${m.same.length}</b></div><div class="kpi"><span>Não encontrados</span><b class="${m.miss.length ? 'bad-t' : ''}">${m.miss.length}</b></div><div class="kpi"><span>Preço ilegível</span><b class="${m.bad.length ? 'bad-t' : ''}">${m.bad.length}</b></div></div>
        ${m.ok.length ? `<div class="tw" style="max-height:50vh;overflow:auto;margin-top:12px"><table class="t"><thead><tr><th><input type="checkbox" id="impAll" checked aria-label="Todos"></th><th>Código</th><th>Produto</th><th>Atual</th><th>Novo</th><th>Variação</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="sub">Nenhum preço diferente do cadastro para aplicar.</p>'}
        ${m.miss.length ? `<details style="margin-top:10px"><summary class="sub">Ver os ${m.miss.length} não encontrados</summary><p class="sub">${m.miss.slice(0, 200).map((x) => esc(x.key)).join(' · ')}</p></details>` : ''}
        <p class="sub">Variações acima de 30% ficam em vermelho para você conferir. Só os marcados são gravados, e a importação inteira entra no histórico como uma alteração.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn pri" id="impGo"${imp.sel.size ? '' : ' disabled'}>Aplicar ${imp.sel.size} preço(s)</button><button class="btn" id="impReset">Começar de novo</button><span id="impProg" class="sub"></span></div></section>`;
    }
    return `<section class="card"><h2>1. Lista de preços do fornecedor</h2>
      <p class="sub">Aceita Excel (.xlsx), CSV ou colunas copiadas de uma planilha. Precisa de uma coluna com o código do insumo (01-1001) ou a descrição exatamente como está no cadastro, e uma coluna com o preço.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label class="btn" for="impFile">Escolher arquivo</label><input type="file" id="impFile" accept=".xlsx,.xls,.csv,.txt" hidden><span class="sub">ou cole abaixo</span></div>
      <textarea id="impTxt" class="paste" placeholder="Código	Preço&#10;11-11001	52.300,00&#10;01-1002	71.500,00" aria-label="Colar preços"></textarea>
      <div><button class="btn" id="impRead">Ler o texto colado</button></div></section>${step2}`;
  }
  function bindImportar() {
    const f = $('#impFile'); if (!f) return;
    const setRows = (name, rows) => { rows = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')); if (!rows.length) { toast('Não achei linhas nesse conteúdo'); return; } const g = guessCols(rows); imp = Object.assign({ name, rows, sel: null }, g); render(); };
    f.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        if (/\.xlsx?$/i.test(file.name)) { const X = await loadSheetJS(); const wbk = X.read(await file.arrayBuffer(), { type: 'array' }); const ws = wbk.Sheets[wbk.SheetNames[0]]; setRows(file.name, X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })); }
        else setRows(file.name, parseText(await file.text()));
      } catch (err) { toast(errMsg(err)); }
    };
    $('#impRead').onclick = () => { const t = $('#impTxt').value; if (t.trim()) setRows('texto colado', parseText(t)); };
    if (!imp) return;
    $('#impId').onchange = (e) => { imp.colId = +e.target.value; imp.sel = null; render(); };
    $('#impVal').onchange = (e) => { imp.colVal = +e.target.value; imp.sel = null; render(); };
    $('#impHdr').onchange = (e) => { imp.header = e.target.checked; imp.sel = null; render(); };
    $('#impReset').onclick = () => { imp = null; render(); };
    const all = $('#impAll'); if (all) all.onchange = (e) => { const m = matchImport(); imp.sel = e.target.checked ? new Set(m.ok.map((x) => x.id)) : new Set(); render(); };
    document.querySelectorAll('[data-impsel]').forEach((c) => c.onchange = () => { if (c.checked) imp.sel.add(c.dataset.impsel); else imp.sel.delete(c.dataset.impsel); const b = $('#impGo'); b.textContent = 'Aplicar ' + imp.sel.size + ' preço(s)'; b.disabled = !imp.sel.size; });
    const go = $('#impGo'); if (go) go.onclick = async () => {
      if (!go.dataset.sure) { go.dataset.sure = 1; go.textContent = 'Confirmar: gravar ' + imp.sel.size + ' preço(s)'; return; }
      const m = matchImport(); const changes = m.ok.filter((x) => imp.sel.has(x.id));
      go.disabled = true;
      try { const n = await REG.applyPrices(changes, imp.name, (d, t) => { const p = $('#impProg'); if (p) p.textContent = d + ' de ' + t + ' gravados…'; }); imp = null; ui.cad = 'historico'; render(); toast(n + ' preço(s) atualizados'); }
      catch (err) { go.disabled = false; toast(errMsg(err)); }
    };
  }

  // ---- histórico ----
  function vHistorico() {
    const q = (ui.histQ || '').trim().toLowerCase();
    const list = REG.historico.filter((h) => !q || [h.tipo, h.desc, h.ref, ...(h.mudancas || []).map((m) => m.campo)].join(' ').toLowerCase().includes(q)).slice(0, 250);
    const items = list.map((h) => {
      const muds = h.mudancas || []; const many = muds.length > 12;
      return `<div class="hrow"><div class="hmeta"><b>${fmtAt(h.at)}</b><small>${who(h.by)}</small></div><div><div><span class="pill mute">${esc(h.tipo)}</span> ${esc(h.desc || '')} ${h.ref && !/^import$/.test(h.ref) && !String(h.ref).includes('!') && REG.insumos.some((x) => x.id === h.ref) ? `<button class="restore" data-ins="${esc(h.ref)}">abrir</button>` : ''}</div>
        ${muds.length ? `<table class="t mini"><tbody>${muds.slice(0, 12).map((m) => `<tr><td>${esc(m.campo)}</td><td class="n sub">${esc(fmtVal(m.de))}</td><td>→</td><td class="n"><b>${esc(fmtVal(m.para))}</b></td></tr>`).join('')}</tbody></table>${many ? `<small class="sub">+ ${muds.length - 12} alterações</small>` : ''}` : ''}</div></div>`;
    }).join('');
    return `<section class="card">
      <div class="sheetbar"><input id="histQ" type="search" placeholder="Buscar no histórico…" value="${esc(ui.histQ || '')}" aria-label="Buscar no histórico" style="flex:1 1 260px"><span class="sub">${REG.mode === 'shared' ? 'Últimos 90 dias com alteração, de toda a equipe' : 'Alterações feitas neste navegador'}</span></div>
      <div class="hlist">${items || '<p class="sub">Nenhuma alteração registrada ainda. Tudo está com os valores da planilha REV21.</p>'}</div></section>`;
  }

  // ---- demais tabelas (grade) ----
  function vTabelas() {
    const S = TABLE_SHEETS.includes(ui.table) ? ui.table : 'PARÂMETROS'; ui.table = S; const sh = baseSheets[S];
    const readOnly = REGISTRY_SHEETS.has(S) || !REG.canEditCadastro;
    const m = /([A-Z]+)(\d+):([A-Z]+)(\d+)/.exec(sh.dim); const c2 = colToNum(m[3]);
    let r2 = 1; const w = wb.sheet(S);
    for (const a of w.cells.keys()) { const p = parseAddr(a); if (p && p.r > r2) r2 = p.r; }
    const hidden = new Set(sh.hiddenCols);
    const chg = REG.tabelas[S] || {};
    const q = (ui.filter || '').trim().toLowerCase();
    let body = '';
    const cols = []; for (let c = 1; c <= c2; c++) if (!hidden.has(numToCol(c))) cols.push(c);
    for (let r = 1; r <= r2; r++) {
      let cells = '', any = false, hay = '';
      for (const c of cols) {
        const a = numToCol(c) + r; const raw = w.cells.get(a);
        const isF = typeof raw === 'string' && raw[0] === '=';
        const v = raw === undefined ? null : wb.value(S, a);
        const t = fmtNum(v, sh.fmts[a]); if (t !== '') { any = true; hay += t.toLowerCase() + ' '; }
        const cls = [isF || readOnly ? 'f' : 'e', typeof v === 'number' ? 'n' : '', a in chg ? 'chg' : ''].join(' ');
        cells += `<td class="${cls}" data-a="${a}" title="${esc(isF ? raw : t)}">${esc(t)}</td>`;
      }
      if (!any && r > 1 && q) continue;
      if (q && r > 3 && !hay.includes(q)) continue;
      body += `<tr><th class="rh">${r}</th>${cells}</tr>`;
    }
    const nchg = Object.keys(chg).length;
    return `<section class="card stack">
      <p class="sub" style="margin:0">Tributos, política comercial, receita do montador, codificação, hidráulica e FCI. Clique numa célula de valor para editar; células de fórmula (texto cinza) são calculadas.${REGISTRY_SHEETS.has(S) ? ' <b>Esta aba é montada a partir das telas Insumos e Kits — edite por lá.</b>' : ''}</p>
      <div class="sheetbar">
        <select id="selTable" aria-label="Aba">${TABLE_SHEETS.map((t) => `<option${t === S ? ' selected' : ''}>${esc(t)}${REGISTRY_SHEETS.has(t) ? ' (consulta)' : ''}</option>`).join('')}</select>
        <input id="tblFilter" type="search" placeholder="Filtrar linhas…" value="${esc(ui.filter || '')}" aria-label="Filtrar linhas">
        <span class="sub">${nchg ? nchg + ' célula(s) diferente(s) da planilha REV21' : 'igual à planilha REV21'}</span>
        ${nchg && REG.canEditCadastro ? '<button class="btn sm" id="bResetTable">Voltar aos valores da planilha</button>' : ''}
      </div>
      <div class="gridwrap"><table class="grid"><thead><tr><th class="rh"></th>${cols.map((c) => `<th>${numToCol(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  }
  function bindGrid() {
    $('#selTable').onchange = (e) => { ui.table = e.target.value.replace(' (consulta)', ''); ui.filter = ''; store.set(SK.view, ui); render(); };
    let tmr; $('#tblFilter').oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { ui.filter = e.target.value; render(); const f = $('#tblFilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 250); };
    const rb = $('#bResetTable'); if (rb) rb.onclick = async () => { if (!rb.dataset.sure) { rb.dataset.sure = 1; rb.textContent = 'Confirmar: desfazer todas as mudanças desta aba'; return; } try { await REG.resetSheet(ui.table); toast('Aba de volta aos valores da planilha'); } catch (err) { toast(errMsg(err)); } };
    $('.grid').addEventListener('click', (e) => {
      const td = e.target.closest('td.e'); if (!td || td.querySelector('input')) return;
      const a = td.dataset.a; const S = ui.table; const raw = wb.raw(S, a);
      const inp = document.createElement('input'); inp.className = 'cellin'; inp.value = raw === undefined ? '' : fmtPlain(raw);
      td.textContent = ''; td.appendChild(inp); inp.focus(); inp.select();
      let finished = false;
      const done = async (save) => {
        if (finished) return; finished = true;
        if (save) {
          const t = inp.value.trim(); const orig = baseRaw(S, a);
          const v = t === '' ? null : (typeof orig === 'number' || /^-?[\d.]*,?\d+%?$/.test(t)) ? parseInput(t, 'num') : t;
          const cur = wb.raw(S, a);
          if (!(v === (cur === undefined ? null : cur))) {
            const restore = v === orig || (v === null && orig === undefined);
            try { await REG.setCell(S, a, v, restore, orig === undefined ? null : orig); toast('Salvo: ' + S + ' ' + a); } catch (err) { toast(errMsg(err)); }
          }
        }
        render();
      };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true), { once: true });
    });
  }
  function bindCadastro() {
    const tab = ui.cad || 'insumos';
    if (tab === 'tabelas') bindGrid();
    if (tab === 'importar') bindImportar();
    const deb = (id, key) => { const el = $('#' + id); if (!el) return; let t; el.oninput = () => { clearTimeout(t); t = setTimeout(() => { ui[key] = el.value; render(); const f = $('#' + id); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 250); }; };
    deb('insQ', 'insQ'); deb('kitQ', 'kitQ'); deb('histQ', 'histQ');
    const fam = $('#insFam'); if (fam) fam.onchange = () => { ui.insFam = fam.value; render(); };
    const sem = $('#insSem'); if (sem) sem.onchange = () => { ui.insSem = sem.checked; render(); };
    const csv = $('#insCsv'); if (csv) csv.onclick = exportInsumos;
    const nw = $('#insNew'); if (nw) nw.onclick = () => insumoModal(null);
    const kn = $('#kitNew'); if (kn) kn.onclick = () => kitModal(kn.dataset.kind, null);
    fillNames($('#app'));
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cad]'); if (t) { ui.cad = t.dataset.cad; store.set(SK.view, ui); render(); return; }
    const ins = e.target.closest('[data-ins]'); if (ins && !e.target.closest('input')) { insumoModal(ins.dataset.ins); return; }
    const kit = e.target.closest('[data-kit]'); if (kit) { kitModal(ui.cad === 'bomba' ? 'bomba' : 'motor', kit.dataset.kit); return; }
  });

  function vGuia() {
    const G = 'GUIA'; let h = '';
    for (let r = 4; r <= 73; r++) {
      const b = txt(G, 'B' + r), c = txt(G, 'C' + r), d = txt(G, 'D' + r);
      if (!b && !c) continue;
      if (b && !c) { h += `<div class="gh">${esc(b)}</div>`; continue; }
      h += `<div class="gk">${esc(b === '·' ? '' : b)}</div><div>${esc(c)}${d ? ` <span class="pill mute">${esc(d)}</span>` : ''}</div>`;
    }
    return `<div class="stack"><div><h1>Guia</h1><div class="sub">O manual da planilha original. No app, "aba" vira tela: PROPOSTA e ITEM são as telas Proposta e Itens; insumos, kits e as demais abas estão em Cadastro. Amarelo é entrada, verde é automático e laranja é o que você alterou à mão.</div></div>
      <section class="card"><div class="guide">${h}</div></section></div>`;
  }

  // ---------- propostas: nova, salvar, abrir, exportar ----------
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function modal(html, bind) {
    const o = $('#overlay'); o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="card">${html}</div></div>`;
    const close = () => { o.innerHTML = ''; };
    o.querySelector('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal') || e.target.closest('[data-close]')) close(); });
    bind && bind(o, close);
  }
  function loadDoc(doc, name, id) { state = { id: id || null, doc: JSON.parse(JSON.stringify(doc || {})), name: name || '' }; build(); persist(); dlMap = null; ui.item = 0; render(); }
  function docTitle() { const n = txt('PROPOSTA', 'C5'), c = txt('PROPOSTA', 'F5'); return [n, c].filter(Boolean).join(' · ') || 'Proposta sem nome'; }

  $('#bNew').onclick = () => modal(`<h2>Nova proposta</h2><p class="sub">A proposta atual continua salva se você já clicou em Salvar. Alterações não salvas se perdem.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mBlank">Proposta em branco</button><button class="btn" id="mExample">Abrir o exemplo (Cocamar)</button><button class="btn" data-close>Cancelar</button></div>`,
    (o, close) => { $('#mBlank', o).onclick = () => { close(); loadDoc({}, ''); setView('proposta'); toast('Proposta em branco'); }; $('#mExample', o).onclick = () => { close(); loadDoc(MODEL.example, ''); setView('proposta'); toast('Exemplo carregado'); }; });

  $('#bSave').onclick = async () => {
    const id = state.id || ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
    const p = { name: docTitle(), numero: txt('PROPOSTA', 'C5'), cliente: txt('PROPOSTA', 'F5'), at: new Date().toISOString(), total: val('PROPOSTA', 'P43'), doc: state.doc || {} };
    if (typeof p.total !== 'number') delete p.total;
    try { const where = await REG.saveProposta(id, p); state.id = id; persist(); dirty = false; toast((where === 'shared' ? 'Salvo para a equipe: ' : 'Salvo neste navegador: ') + docTitle()); }
    catch (err) { toast(errMsg(err)); }
  };

  $('#bOpen').onclick = () => {
    const list = REG.listPropostas();
    const shared = REG.mode === 'shared';
    const rows = list.map((p) => `<div class="row"><div style="min-width:0"><b>${esc(p.name)}</b><br><small>${fmtAt(p.at)} · ${typeof p.total === 'number' ? brl(p.total) : '—'}${shared && !p.local ? ' · ' + who(p.by) : ''}${p.local ? ' · <span class="pill mute">neste navegador</span>' : ''}</small></div><div style="display:flex;gap:6px"><button class="btn sm pri" data-open="${esc(p.id)}">Abrir</button><button class="btn sm" data-del="${esc(p.id)}">Excluir</button></div></div>`).join('')
      || `<p class="sub">Nenhuma proposta salva ${shared ? 'pela equipe' : 'neste navegador'} ainda.</p>`;
    modal(`<h2>Propostas salvas</h2>
      ${shared ? '<p class="sub">Propostas da equipe: quem tem acesso ao app vê e abre todas. Salvar de novo atualiza a mesma proposta.</p>' : '<p class="sub">Este arquivo guarda as propostas só neste navegador.</p>'}
      <input type="search" id="mQ" placeholder="Buscar por número ou cliente…" aria-label="Buscar proposta">
      <div class="list" id="mList">${rows}</div>
      <h2 style="margin-top:6px">Arquivo</h2>
      <p class="sub">Para mandar uma proposta para alguém fora do app, baixe o .json ou copie o conteúdo; do outro lado, abra o arquivo ou cole e clique em Importar.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="mCopy">Copiar proposta atual</button><button class="btn" id="mDown">Baixar .json</button><label class="btn" for="mFile">Abrir .json</label><input type="file" id="mFile" accept=".json,application/json" hidden></div>
      <textarea id="mTxt" placeholder="…ou cole aqui o conteúdo de uma proposta e clique em Importar" aria-label="Conteúdo da proposta"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mImp">Importar</button><button class="btn" data-close>Fechar</button></div>`,
    (o, close) => {
      fillNames(o);
      const byId = Object.fromEntries(list.map((p) => [p.id, p]));
      $('#mQ', o).oninput = (e) => { const q = e.target.value.toLowerCase(); o.querySelectorAll('#mList .row').forEach((r) => { r.hidden = q && !r.textContent.toLowerCase().includes(q); }); };
      o.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { const p = byId[b.dataset.open]; close(); loadDoc(p.doc, p.name, p.local && shared ? null : p.id); setView('proposta'); toast('Aberto: ' + p.name); });
      o.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; b.classList.add('pri'); return; }
        const p = byId[b.dataset.del];
        try { await REG.deleteProposta(p.id, !!p.local); b.closest('.row').remove(); if (state.id === p.id) { state.id = null; persist(); } } catch (err) { toast(errMsg(err)); }
      });
      const payload = () => JSON.stringify({ app: 'ls-pricer', rev: MODEL.source, name: docTitle(), doc: state.doc }, null, 1);
      $('#mCopy', o).onclick = () => { const t = payload(); $('#mTxt', o).value = t; navigator.clipboard.writeText(t).then(() => toast('Copiado'), () => { $('#mTxt', o).select(); toast('Selecionado — use Ctrl+C'); }); };
      $('#mDown', o).onclick = async () => { const ok = await REG.save((docTitle().replace(/[^\w\-. ]+/g, '_') || 'proposta') + '.json', payload(), 'application/json'); if (!ok) toast('Download cancelado'); };
      $('#mFile', o).onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $('#mTxt', o).value = rd.result; }; rd.readAsText(f); };
      $('#mImp', o).onclick = () => { try { const j = JSON.parse($('#mTxt', o).value); if (!j.doc) throw 0; close(); loadDoc(j.doc, j.name); setView('proposta'); toast('Importado: ' + (j.name || 'proposta') + ' — clique em Salvar para guardar'); } catch (e) { toast('Não reconheci esse conteúdo como uma proposta do LS Pricer'); } };
    });
  };

  document.addEventListener('click', (e) => {
    if (e.target.id === 'bMoreRows') { ui.extraRows = (ui.extraRows || 3) + 5; render(); }
    if (e.target.id === 'bClearItem') {
      const b = e.target;
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: limpar item'; b.classList.add('pri'); return; }
      const S = ITEMS[ui.item]; if (state.doc) delete state.doc[S];
      const r = 20 + ui.item; if (state.doc && state.doc.PROPOSTA) for (const c of ['C', 'E', 'F', 'G', 'H']) delete state.doc.PROPOSTA[c + r];
      build(); persist(); render(); toast(S + ' limpo');
    }
  });

  const DOCS = window.PricerDocs({ val, txt, show, fmtNum, brl, pct, ITEMS, filled, save: REG.save, toast, wb: () => wb, fciHidden });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc]'); if (!b) return;
    const it = b.dataset.docitem || null;
    if (b.dataset.doc === 'memorial') DOCS.memorialPdf();
    if (b.dataset.doc === 'fcipdf') DOCS.fciPdf(it);
    if (b.dataset.doc === 'fcixlsx') DOCS.fciXlsx(it);
  });
  build(); render();
})();
