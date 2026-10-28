/* LS Pricer — interface. As contas são as da planilha, executadas pelo engine.js. */
(function () {
  'use strict';
  const { Workbook, isErr, parseAddr, addr, numToCol, colToNum, E } = window.PricerEngine;
  const MODEL = window.PRICER_MODEL;
  // Regras do app sobre a planilha (itens 01 a 10):
  // - o arranjo escolhido manda: a jockey só entra sozinha quando nenhum arranjo foi definido;
  // - arranjo só de jockey (J) também monta o item.
  { const cod = MODEL.sheets.find((x) => x.name === 'CODIFICAÇÃO');
    for (let r = 5; r <= 18; r++) cod.cells['D' + r] = `=IF(B${r}="","",IF(B${r}="CONJUNTO MOTOBOMBA","CMB",IF(B${r}="BOMBA JOCKEY + PAINEL","JOCKEYPAINEL",IF(B${r}="FABRICANTES","OEM",SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(B${r}," ",""),"+",""),"/","")))))`; }
  for (const s of MODEL.sheets) if (/^ITEM \d\d$/.test(s.name)) {
    s.cells.AR14 = '=IF(AND($AR$6="",$AR$19="",$AR$8=""),0,1)';
    s.cells.AR20 = '=$AR$22&IF(AND($J$19<>"",ISERROR(SEARCH("J",$AR$22)),$E$17=""),"J","")';
    // bomba das elétricas pode ser outro modelo/tamanho (BA19); em branco = a mesma das diesel
    s.cells.AR23 = '=IF($BA$19<>"",$BA$19,$AR$7)';
    s.cells.AR24 = '=IF($AR$23="","",IFERROR(INDEX(CAD_TIPO,MATCH($AR$23,CAD_PRODUTO,0)),""))';
    // cada conjunto usa a própria potência: o elétrico dimensiona painel, base, acoplamento e capa pelos CV dele
    s.cells.AR25 = '=IF($I$19<>"",$I$19,$AR$9)';
    s.cells.AR26 = '=IFERROR(INDEX(FX_ITENS,MATCH($AR$25,FX_HP,1),1),1)';
    // família do equipamento → estrutura padrão (CMB, SKID, CONTAINER, ESPECIAL, JOCKEYPAINEL, OEM)
    { const X = 'INDEX(MOD_ESTRUTURA,MATCH($AR$1,MOD_NOME,0))', K = "'CODIFICAÇÃO'!$D$5:$D$18";
      s.cells.AR2 = `=IFERROR(INDEX(${K},MATCH($C$21,COD_FAM,0)),"CMB")`;
      s.cells.C21 = `=IFERROR(INDEX(COD_FAM,MATCH(${X},${K},0)),"CONJUNTO MOTOBOMBA")`; }
    // estruturas: "vale para" aceita combinações (CMB+SKID…) e regras novas (trocador, radiador, opcional por item)
    for (let r = 68; r <= 127; r++) {
      const n = r - 67; let f = s.cells['AF' + r]; if (typeof f !== 'string') continue;
      f = f.split(`INDEX(REC_ESTRUT,${n})=$AR$2,AND(INDEX(REC_ESTRUT,${n})="SKID+CONTAINER",OR($AR$2="SKID",$AR$2="CONTAINER"))`).join(`ISNUMBER(SEARCH("+"&$AR$2&"+","+"&INDEX(REC_ESTRUT,${n})&"+"))`);
      f = f.split(`AND(INDEX(REC_KIT,${n})="SEM KIT BOMBA",ISNUMBER(MATCH($AR$7,KB_DESC,0)))`).join(`AND(INDEX(REC_KIT,${n})="SEM KIT BOMBA",ISNUMBER(MATCH($AR$7,KB_DESC,0))),AND(INDEX(REC_KIT,${n})="SÓ TROCADOR",ISERROR(SEARCH("TROCADOR",$AR$6))),AND(INDEX(REC_KIT,${n})="SÓ RADIADOR",ISERROR(SEARCH("RADIADOR",$AR$6))),AND(INDEX(REC_KIT,${n})="OPCIONAL",$BC$${r}<>1)`);
      s.cells['AF' + r] = f;
    }
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
  const newUid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let state = store.get(SK.cur, null) || { id: null, doc: MODEL.example, name: '' };
  if (!state.uid) state.uid = newUid();
  if (!state.div) state.div = 'SEQ';
  const isSpv = () => state.div === 'SPV' && !!state.spv;
  const isFacts = () => state.sol === 'FACTS' && !!state.facts;
  let ui = Object.assign({ view: 'inicio', item: 0, simple: true, step: 1, table: 'PARÂMETROS', filter: '', cad: 'insumos' }, store.get(SK.view, {}));
  if (ui.view === 'tabelas') { ui.view = 'cadastro'; ui.cad = 'tabelas'; }
  // o app sempre abre na página inicial (busca, histórico e os botões SEQ / SPV)
  ui.view = 'inicio';
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

  // nomes de insumo padronizados: propostas salvas com o nome antigo passam a usar o novo
  const renomes = () => ((REG.tabelas || {}).RENOMES || {}).map || {};
  function migrar(doc) {
    const map = renomes(); if (!doc || !Object.keys(map).length) return 0; let n = 0;
    const res = (v) => { let k = 0; while (typeof v === 'string' && map[v] && k++ < 6) v = map[v]; return v; };
    for (const sh of Object.values(doc)) if (sh && typeof sh === 'object') for (const [a, v] of Object.entries(sh)) if (typeof v === 'string' && map[v]) { sh[a] = res(v); n++; }
    return n;
  }
  function build() { if (migrar(state.doc)) store.set(SK.cur, state); wb = new Workbook(MODEL); REG.applyTo(wb); wb.applyDoc(state.doc || {}); listCache = new Map(); }
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
  // família do equipamento pelas famílias de produto SEQ (sigla · nome); "Fabricantes" não é família
  const FAM_SEQ_LB = { 'CONJUNTO MOTOBOMBA': 'CMB · Conjuntos motobomba – sistemas de incêndio', SKID: 'SKD · Skids de motobombas – sistemas de incêndio', CONTAINER: 'CON · Containers / casas de bombas', ESPECIAL: 'ESP · Produtos engenheirados e soluções especiais', 'BOMBA JOCKEY + PAINEL': 'CMB · Bomba jockey + painel' };
  function control(sheet, a, opt = {}) {
    // insumos (montagem e escopo): sugestões filtradas pela família da linha, não a lista da planilha
    let list = opt.list || (opt.datalist ? null : listFor(sheet, a));
    if (list && a === 'C21' && /^ITEM \d+$/.test(sheet)) { const c0 = txt(sheet, a); list = list.filter((o) => o !== 'FABRICANTES' || o === c0); opt = Object.assign({ labels: FAM_SEQ_LB }, opt); }
    const kind = kindOf(sheet, a);
    const v = val(sheet, a);
    const cur = isErr(v) ? '' : (kind === 'pct' && typeof v === 'number') ? NF[2].format(v * 100).replace(/,00$/, '') : kind === 'num' && typeof v === 'number' ? fmtPlain(v) : fmtPlain(v);
    const data = `data-sheet="${esc(sheet)}" data-addr="${a}" data-kind="${kind}" id="${esc(id(sheet, a))}"`;
    // poucas opções curtas: botões de toque em vez de lista (mais rápido)
    if (list && !opt.free && !opt.compact && opt.seg !== false && ui.simple && list.length >= 2 && list.length <= 4 && list.every((o) => String(o).length <= 24)) {
      const fb = isFormulaBase(sheet, a); const over = overridden(sheet, a); const nm = esc(id(sheet, a)); const base = `name="${nm}" data-sheet="${esc(sheet)}" data-addr="${a}" data-kind="${kind}"`;
      let h = fb ? `<label class="${over ? '' : 'on'}"><input type="radio" ${base} value="\u0000auto"${over ? '' : ' checked'}>Auto${!over && cur ? ' · ' + esc(cur) : ''}</label>` : '';
      for (const o of [...new Set(list)]) { const on = (over || !fb) && String(o) === String(cur); h += `<label class="${on ? 'on' : ''}"><input type="radio" ${base} value="${esc(o)}"${on ? ' checked' : ''}>${esc(o)}</label>`; }
      return `<div class="seg" id="${nm}" role="radiogroup">${h}</div>`;
    }
    if (list && !opt.free) {
      const fb = isFormulaBase(sheet, a); const over = overridden(sheet, a);
      let opts = '';
      const LB = (o) => (opt.labels && opt.labels[o]) || o;
      if (fb) opts += `<option value="\u0000auto"${over ? '' : ' selected'}>${esc(opt.compact ? LB(cur) || '—' : cur ? 'Automático — ' + LB(cur) : 'Automático')}</option>`;
      else opts += `<option value=""${cur === '' ? ' selected' : ''}>—</option>`;
      const seen = new Set();
      for (const o of list) { if (seen.has(o)) continue; seen.add(o); opts += `<option value="${esc(o)}"${(over || !fb) && o === cur ? ' selected' : ''}>${esc(LB(o))}</option>`; }
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
    if (el.type === 'radio') { if (el.value === '\u0000auto') return commit(sheet, a, null, true); if (/^-?\d+([.,]\d+)?$/.test(el.value.trim())) return commit(sheet, a, parseFloat(el.value.replace(',', '.'))); return commit(sheet, a, el.value); }
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
    if (go) { ui.item = +go.dataset.goitem; ui.itemFull = false; setView('item'); return; }
    const nv = e.target.closest('[data-view]');
    if (nv) { if (ui.simple && nv.dataset.view === 'item' && !nv.closest('#app')) { ui.step = 2; ui.propFull = false; setView('proposta'); return; } setView(nv.dataset.view); return; }
  });

  // ---------- visões ----------
  function setView(v) { ui.view = v; store.set(SK.view, ui); render(); window.scrollTo(0, 0); }
  function render() {
    const spv = isSpv(); const fx = isFacts(); const outro = spv || fx;
    if (outro && (ui.view === 'item' || ui.view === 'memorial')) ui.view = 'proposta';
    for (const b of document.querySelectorAll('#nav button')) { b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'); if ('seqonly' in b.dataset) b.hidden = outro; }
    const nm = spv ? state.spv.numero : fx ? state.facts.numero : txt('PROPOSTA', 'C5'), cli = spv ? state.spv.cliente : fx ? state.facts.cliente : txt('PROPOSTA', 'F5');
    $('#docName').innerHTML = `<span class="divb ${spv ? 'spv' : 'seq'}">${spv ? 'SPV' : 'SEQ'}</span> ` + ((nm || cli) ? `<b>${esc(nm || 'Sem número')}</b> · ${esc(cli || 'sem cliente')}` : '<b>Proposta nova</b>');
    for (const id of ['bMode']) { const b = $('#' + id); if (b) b.hidden = outro || ['inicio', 'documentos', 'margens'].includes(ui.view); }
    const scroll = window.scrollY; const focusId = document.activeElement && document.activeElement.id;
    const full = !outro && ui.simple && ((ui.view === 'proposta' && ui.propFull) || (ui.view === 'item' && ui.itemFull));
    const views = spv ? { proposta: SPV.vSpv } : fx ? { proposta: FX.vFacts } : ui.simple ? { proposta: ui.propFull ? vProposta : vPropostaS, item: ui.itemFull ? vItem : vItemS } : { proposta: vProposta, item: vItem };
    const html = Object.assign({ inicio: SPV.vHome, documentos: SPV.vDocs, margens: MG.vMargens, memorial: vMemorial, cadastro: vCadastro, guia: vGuia }, views)[ui.view]();
    MG.ensure(); SPV.ensureDocs(); PD.ensure();
    { const nb = document.querySelector('#nav [data-view="cadastro"]'); const n = REG.areaOk('custos') ? PD.abertos().length : 0; if (nb) nb.innerHTML = 'Cadastro' + (n ? ` <span class="nbadge" title="${n} pedido(s) de cadastro em aberto">${n}</span>` : ''); }
    { const mb = document.querySelector('#nav [data-view="margens"]'); const n = MG.pendentesAprov(); if (mb) mb.innerHTML = 'Margens' + (n ? ` <span class="nbadge" title="${n} aprovação(ões) de desconto esperando você">${n}</span>` : ''); }
    const fe = state.id && ['proposta', 'item'].includes(ui.view) && MG.fechDe(state.id);
    const aviso = fe ? `<div class="banner ok" style="margin:0 0 12px">Proposta fechada em ${esc(new Date(fe.fechadoEm).toLocaleDateString('pt-BR'))}${fe.pedido ? ' · pedido ' + esc(fe.pedido) : ''}. O custo real de compras e fabricação é lançado na tela do fechamento. <button class="btn sm pri" data-mgreal="${esc(state.id)}">Lançar custo real</button></div>` : '';
    $('#app').innerHTML = aviso + (full ? '<div class="backbar"><button class="btn sm" data-simpleback>← Voltar à versão simples</button></div>' : '') + html;
    const bm = $('#bMode'); if (bm) bm.textContent = ui.simple ? 'Modo detalhado' : 'Modo simples';
    if (ui.view === 'cadastro') bindCadastro();
    window.scrollTo(0, scroll);
    if (focusId) { const f = document.getElementById(focusId); if (f && f.tagName === 'INPUT') { f.focus(); if (f.type === 'search') f.setSelectionRange(f.value.length, f.value.length); } }
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
      // margem e valores primeiro; código e dados fiscais em linha menor (sem rolar para o lado)
      const low = /ABAIXO|FORA/i.test(sit);
      rows += `<tr${low ? ' class="lowrow"' : ''}><td><button class="btn sm" data-goitem="${i}">${ITEMS[i].slice(5)}</button></td>
        <td><b class="${low ? 'bad-t' : ''}" style="font-size:17px">${show(P, 'X' + r)}</b><br>${situPill(sit)}<br><small class="sub">fator ${show(P, 'V' + r)} · piso ${show(P, 'W' + r)}</small></td>
        <td class="n"><b style="font-size:15px">${show(P, 'P' + r)}</b><br><small class="sub">c/ IPI · ${show(P, 'F' + r)} un.</small><br><small class="sub">s/ IPI ${show(P, 'M' + r)} · custo ${show(P, 'Q' + r)}</small></td>
        <td style="min-width:240px">${esc(txt(P, 'D' + r))}<br><small class="code sub" style="white-space:normal;overflow-wrap:anywhere">${esc(txt(P, 'C' + r))}</small><br><small class="sub">NCM ${esc(txt(P, 'G' + r))} · ${esc(txt(P, 'H' + r))} ${show(P, 'I' + r)} · ICMS ${show(P, 'R' + r)} · IPI ${show(P, 'U' + r)} · unit. s/ impostos ${show(P, 'J' + r)}</small></td></tr>`;
    }
    rows += `<tr class="tot"><td>Totais</td><td><b>${pct(val(P, 'J16'))}</b><br><small class="sub">fator ${show(P, 'V43')}</small></td><td class="n"><b>${show(P, 'P43')}</b><br><small class="sub">s/ IPI ${show(P, 'M43')} · custo ${show(P, 'Q43')}</small></td><td><small class="sub">${esc(txt(P, 'H43'))} ${show(P, 'I43')} · IPI ${show(P, 'N43')}</small></td></tr>`;
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
        <div class="tw"><table class="t itens"><thead><tr><th>Item</th><th>Margem e situação</th><th class="n">Valores</th><th>Descrição, código e fiscal</th></tr></thead><tbody>${rows}</tbody></table></div>
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
  const hiddenRow = (x, bloco) => `<tr class="ro"><td>${esc(x.rot)}</td>${bloco ? `<td>${esc(x.bloco)}</td>` : ''}<td>${esc(x.desc)}</td><td></td><td class="n">${fmtNum(x.qtd)}</td><td class="n">${fmtNum(x.unit, '#,##0.00')}</td><td></td><td class="n">${fmtNum(x.tot, '#,##0.00')}</td><td></td><td>${esc(x.ori)}</td><td class="sub">além da 30ª linha da planilha — só leitura, já no custo</td></tr>`;
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
        return `<tr><td>${esc(x.rot)}</td>${insSel(S, r)}<td>${esc(txt(S, 'E' + r))}</td>${qtdRO(S, r)}${custoRO(S, r)}${updCell(S, r)}<td class="n">${show(S, 'H' + r)}</td><td class="n sub">${pctH(S, val(S, 'H' + r))}</td>${origRO(S, r)}<td>${esc(txt(S, 'L' + r))}</td></tr>`; }).join('') + hid.map((x) => { tot += x.tot; return hiddenRow(x, false); }).join('');
      return `<div class="tw" style="margin-top:12px"><table class="t"><thead><tr><th>Item</th><th>Insumo</th><th>Fabricante</th><th>Qtd</th><th>Custo unit.</th><th>Preço atualizado em</th><th>Custo total</th><th>% do item</th><th>Origem</th><th>Obs.</th></tr></thead><tbody>${tr}<tr class="tot"><td colspan="6">Custo do conjunto</td><td class="n">${fmtNum(tot, '#,##0.00')}</td><td class="n">${pctH(S, tot)}</td><td colspan="2"></td></tr></tbody></table></div>`;
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
      return `<tr><td>${esc(x.rot)}</td><td>${esc(txt(S, 'B' + r))}</td>${insSel(S, r)}<td>${esc(txt(S, 'E' + r))}</td>${qtdRO(S, r)}${custoRO(S, r)}${updCell(S, r)}<td class="n">${show(S, 'H' + r)}</td><td class="n sub">${pctH(S, val(S, 'H' + r))}</td>${origRO(S, r)}<td>${esc(txt(S, 'L' + r))}</td></tr>`; }).join('') + hiddenLines(S).filter((x) => x.acion === 'TODOS').map((x) => hiddenRow(x, true)).join('');
    return `<section class="card"><h2>Itens comuns ao equipamento <span class="sub">base, hidráulica, mão de obra, embalagem — valem para o conjunto todo</span></h2>
      <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Bloco</th><th>Insumo</th><th>Fabricante</th><th>Qtd</th><th>Custo unit.</th><th>Preço atualizado em</th><th>Custo total</th><th>% do item</th><th>Origem</th><th>Obs.</th></tr></thead><tbody>${tr || '<tr><td colspan="11" class="sub">Nada ainda.</td></tr>'}
      <tr class="tot"><td colspan="7">Subtotal da montagem automática (todos os conjuntos + comuns)</td><td class="n">${show(S, 'H64')}</td><td class="n">${pctH(S, val(S, 'H64'))}</td><td colspan="2"></td></tr></tbody></table></div></section>`;
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
      scope += `<tr><td class="n">${show(S, 'A' + r)}</td>${cellIn(S, 'B' + r)}${cellIn(S, 'C' + r)}${insSel(S, r)}<td>${esc(txt(S, 'E' + r))}</td>${cellIn(S, 'F' + r)}${custoRO(S, r)}${updCell(S, r)}<td class="n">${show(S, 'H' + r)}</td>${origRO(S, r)}<td class="n">${show(S, 'J' + r)}</td><td class="n">${show(S, 'K' + r)}</td><td>${esc(txt(S, 'L' + r))}</td></tr>`;
    }
    const tot = (r, lb) => `<tr class="tot"><td></td><td colspan="5">${esc(lb || txt(S, 'B' + r))}</td><td class="n">${show(S, 'G' + r)}</td><td></td><td class="n">${show(S, 'H' + r)}</td><td></td><td class="n">${show(S, 'J' + r)}</td><td colspan="2"></td></tr>`;
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
            <div class="tw"><table class="t"><thead><tr><th>#</th><th>Bloco</th><th>Família</th><th>Insumo</th><th>Fabricante</th><th>Qtd</th><th>Custo unit.</th><th>Preço atualizado em</th><th>Custo total</th><th>Origem</th><th>Venda</th><th>Catálogo</th><th>Obs.</th></tr></thead><tbody>${scope}${tot(113)}${tot(114)}</tbody></table></div>
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

  // ---------- modo simples: proposta em 3 passos, item enxuto, alertas num lugar só ----------
  const uiEdit = new Set();
  const used = (i) => filled(ITEMS[i]) || !!(state.doc && state.doc[ITEMS[i]] && Object.keys(state.doc[ITEMS[i]]).length) || !!(state.doc && state.doc.PROPOSTA && state.doc.PROPOSTA['C' + (20 + i)]);
  const firstFree = () => ITEMS.findIndex((s, i) => !used(i));
  // automático aparece como texto; "alterar" abre o campo
  function fieldS(sheet, a, label, opt = {}) {
    const key = sheet + '|' + a;
    if (isFormulaBase(sheet, a) && !overridden(sheet, a) && !uiEdit.has(key)) {
      const v = opt.fmt ? opt.fmt(val(sheet, a)) : show(sheet, a);
      return `<div class="f fs ${opt.cls || ''}"><label>${esc(label)}</label><div class="autov"><span>${esc(v) || '—'}</span><button class="restore" data-edit="${esc(key)}" aria-label="Alterar ${esc(label)}">alterar</button></div></div>`;
    }
    return field(sheet, a, label, opt);
  }
  // dados básicos para o pedido de cadastro a partir de uma linha ou do motor do item
  function pedidoDaLinha(S, r) {
    const d = txt(S, 'D' + r); const fam = txt(S, 'C' + r) || (REG.insumos.find((i) => i.produto === d) || {}).fam || '';
    const ex = REG.insumos.find((i) => i.produto === d);
    return { fam, produto: d, produtoLinha: d || null, insumoId: ex ? ex.id : null, origem: txt(S, 'AB' + r) === 'IMP' ? 'IMP' : 'NAC', linha: { rotulo: S + ' · ' + (txt(S, 'B' + r) || 'linha ' + r) } };
  }
  function pedidoMotor(S, tipo) {
    if (tipo === 'diesel') return { fam: '01.MOTORDIESEL', campos: { hp: txt(S, 'C19'), rpm: txt(S, 'H19'), arref: /^T/i.test(txt(S, 'F19')) ? 'TROCADOR DE CALOR' : 'RADIADOR', vcc: '24VCC' }, origem: 'IMP', linha: { rotulo: S + ' · motor diesel' } };
    const rpm = num0(val(S, 'H19')); return { fam: '10.MOTORELETRICO', campos: { cv: txt(S, 'I19'), polos: rpm >= 3000 || !rpm ? '2P' : '4P', tensao: '220/380/440V', marca: 'WEG', mont: 'MANCAL' }, origem: 'NAC', linha: { rotulo: S + ' · motor elétrico' } };
  }
  const num0 = (x) => (typeof x === 'number' ? x : 0);
  function primeiraSemPreco(S) { for (let r = 34; r <= 112; r++) if (/sem custo|sem o preço/.test(txt(S, 'L' + r))) return r; return 0; }
  function alertsFor(S) {
    const out = []; const add = (lvl, msg, fix) => { if (!out.some((x) => x.msg === msg)) out.push({ lvl, msg, fix, S }); };
    // fora da política: além de corrigir, dá para pedir aprovação à Diretoria e ao Financeiro
    const addP = (lvl, msg, fix) => { add(lvl, msg, fix); const a = out.find((x) => x.msg === msg); if (a) a.aprov = aprovInfo(); };
    if (!filled(S)) {
      // ainda sem preço: diz o que falta para montar
      const b = txt(S, 'B32');
      if (/MOTOR DIESEL NÃO ENCONTRADO/.test(b)) add('warn', `Não há motor diesel de ${txt(S, 'C19') || '?'} HP${txt(S, 'H19') ? ' a ' + txt(S, 'H19') + ' RPM' : ''}${txt(S, 'F19') ? ' com ' + txt(S, 'F19').toLowerCase() : ''} no cadastro. Troque a potência, a rotação ou o arrefecimento.`, { lb: 'Pedir cadastro do motor', act: 'pedir', data: pedidoMotor(S, 'diesel') });
      if (/MOTOR ELÉTRICO NÃO ENCONTRADO/.test(b)) add('warn', `Não há motor elétrico de ${txt(S, 'I19') || '?'} CV no cadastro. Escolha outra potência.`, { lb: 'Pedir cadastro do motor', act: 'pedir', data: pedidoMotor(S, 'eletrico') });
      if (/jockey e nenhum/.test(b)) add('warn', 'O arranjo pede bomba jockey e nenhuma foi escolhida.', { lb: 'Escolher a jockey', act: 'foco', data: 'J19' });
      if (/SEM VAZÃO NOMINAL/.test(b)) add('info', 'Informe a vazão para entrar a hidráulica (válvula de alívio, cone, medidor e barriletes).', { lb: 'Informar a vazão', act: 'foco', data: 'G17' });
      return out;
    }
    const p84 = txt(S, 'P84');
    if (p84 === 'ABAIXO DO PISO') addP('bad', `Fator efetivo ${fmtNum(val(S, 'P83'), '0.000')} abaixo do piso da política (${fmtNum(val(S, 'H15'), '0.000')}): precisa de aprovação`, val(S, 'C8') ? { lb: 'Tirar o desconto', act: 'desconto' } : { lb: 'Ajustar à margem mínima', act: 'margem' });
    else if (/NÃO ENCONTRADO/.test(p84)) add('bad', p84.charAt(0) + p84.slice(1).toLowerCase() + '. Escolha a potência na lista.', /DIESEL/.test(p84) ? { lb: 'Pedir cadastro do motor', act: 'pedir', data: pedidoMotor(S, 'diesel') } : /ELÉTRICO/.test(p84) ? { lb: 'Pedir cadastro do motor', act: 'pedir', data: pedidoMotor(S, 'eletrico') } : null);
    else if (/SEM PREÇO/.test(p84)) { const r0 = primeiraSemPreco(S); add('bad', 'Há componente sem preço no cadastro: entra com custo zero.', r0 ? { lb: 'Pedir cadastro do preço', act: 'pedir', data: pedidoDaLinha(S, r0) } : null); }
    if (txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO') addP('bad', `Margem ${pct(val(S, 'J15'))} abaixo do mínimo de ${pct(val('PARÂMETROS', 'C34'))}`, { lb: 'Ajustar à margem mínima', act: 'margem' });
    for (const a of ['P78', 'P105', 'C185', 'C187']) { const t = txt(S, a); if (t && !/^OK/.test(t)) add('warn', t); }
    const b32 = txt(S, 'B32');
    if (/SEM VAZÃO NOMINAL/.test(b32)) add('warn', 'Sem vazão nominal: válvula de alívio, cone, medidor e barriletes não entram. Informe a vazão.', { lb: 'Informar a vazão', act: 'foco', data: 'G17' });
    if (/jockey e nenhum/.test(b32)) add('warn', 'O arranjo pede bomba jockey e nenhuma foi escolhida.', { lb: 'Escolher a jockey', act: 'foco', data: 'J19' });
    const m = /(\d+) LINHA\(S\) ALÉM DA 30ª/.exec(b32); if (m) add('info', `${m[1]} componente(s) além da 30ª linha da planilha: já estão no custo.`);
    const lc = txt(S, 'C27').length, ld = txt(S, 'C28').length;
    if (lc > 60) add('warn', `Código com ${lc} caracteres: passa do limite de 60 do ERP.`, { lb: 'Ver o código', act: 'abrir', data: 'cod' });
    if (ld > 120) add('warn', `Descrição breve com ${ld} caracteres: passa do limite de 120 do ERP.`, { lb: 'Ver a descrição', act: 'abrir', data: 'cod' });
    const fci = txt(S, 'C196'); if (fci && !/^OK/.test(fci)) add('info', 'FCI: ' + fci, { lb: 'Ver a FCI', act: 'abrir', data: 'fci' });
    const ack = state.ack || {}; for (const a of out) { const k = S + '|' + a.msg; if (ack[k]) a.ack = ack[k]; }
    return out;
  }
  // situação do pedido de aprovação desta proposta; a aprovação vale enquanto a margem não cair abaixo da aprovada
  function aprovInfo() {
    const ap = state.id ? MG.aprovDe(state.id) : null; if (!ap) return { estado: null };
    const atual = isSpv() ? SPV.snapshot(state.spv).margemPct : isFacts() ? FX.snapshot(state.facts).margemPct : val('PROPOSTA', 'J16');
    let estado = MG.estadoA(ap); if (estado === 'aprovada' && typeof atual === 'number' && atual < num0(ap.snap.margemPct) - 5e-4) estado = 'vencida';
    return { estado, id: ap.id, at: ap.at, margem: ap.snap.margemPct, decisoes: ap.decisoes || {} };
  }
  function aprovLinha(x) {
    const a = x.aprov; if (!a || !a.estado) return '';
    const d = Object.values(a.decisoes).filter((y) => y.comentario).map((y) => y.comentario).join(' · ');
    const t = a.estado === 'pendente' ? `Aprovação pedida em ${new Date(a.at).toLocaleDateString('pt-BR')}: aguardando ${['diretoria', 'financeiro'].filter((k) => !a.decisoes[k]).map((k) => (k === 'diretoria' ? 'Diretoria' : 'Financeiro')).join(' e ')}.`
      : a.estado === 'aprovada' ? `Aprovado pela Diretoria e pelo Financeiro com margem de ${pct(a.margem)}${d ? ' · ' + d : ''}.`
      : a.estado === 'vencida' ? `A aprovação foi para margem de ${pct(a.margem)}; a margem caiu depois disso. Peça de novo.`
      : `Desconto reprovado${d ? ': ' + d : ''}.`;
    return `<br><small class="sub">${esc(t)} <button class="restore" data-apopen="${esc(a.id)}">ver aprovação</button></small>`;
  }
  // cada alerta: corrigir agora (quando dá) ou seguir assim, com a justificativa no histórico
  const alertList = (list, withItem) => list.length ? `<ul class="alerts">${list.map((x) => { const key = esc(JSON.stringify([x.S, x.msg]));
    const ap = x.aprov && x.aprov.estado; const okAp = ap === 'aprovada'; const pedeAp = x.aprov && !x.ack && (!ap || ap === 'reprovada' || ap === 'vencida');
    return `<li class="${x.ack || okAp ? 'ack' : x.lvl}">${withItem ? `<b>Item ${String(x.i + 1).padStart(2, '0')}</b>` : ''}<span>${esc(x.msg)}${aprovLinha(x)}${x.ack ? `<br><small class="sub">Seguindo assim: ${esc(x.ack.motivo)} · <span data-uid="${esc(x.ack.by || '')}">${x.ack.by ? '…' : ''}</span> ${esc(new Date(x.ack.at).toLocaleDateString('pt-BR'))}</small>` : ''}</span>
      <span class="alact">${pedeAp ? `<button class="btn sm${ap ? ' pri' : ''}" data-alaprov>${ap ? 'Pedir de novo' : 'Pedir aprovação'}</button>` : ''}${x.fix && !x.ack && !okAp ? `<button class="btn sm pri" data-alfix="${esc(JSON.stringify({ S: x.S, act: x.fix.act, data: x.fix.data }))}">${esc(x.fix.lb)}</button>` : ''}${x.ack ? `<button class="restore" data-alundo="${key}">desfazer</button>` : x.lvl !== 'info' && !x.aprov ? `<button class="btn sm" data-alack="${key}">Seguir assim</button>` : ''}${withItem ? `<button class="restore" data-goitem="${x.i}">abrir</button>` : ''}</span></li>`; }).join('')}</ul>` : '';
  const countPills = (list) => { const n = (l) => list.filter((x) => x.lvl === l && !x.ack && !(x.aprov && x.aprov.estado === 'aprovada')).length; return list.length ? [['bad', 'alerta'], ['warn', 'aviso']].filter(([l]) => n(l)).map(([l, w]) => `<span class="pill ${l}">${n(l)} ${w}${n(l) > 1 ? 's' : ''}</span>`).join(' ') || '<span class="pill mute">só informação</span>' : '<span class="pill ok">sem alertas</span>'; };

  // ações dos alertas
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-alaprov]')) {
      // a aprovação fica ligada à proposta salva: salva antes, se preciso
      if (!state.id || dirty) { await $('#bSave').onclick(); if (!state.id) return; }
      const p = (REG.listPropostas() || []).find((x) => x.id === state.id) || { id: state.id, uid: state.uid, name: docTitle(), div: isSpv() ? 'SPV' : 'SEQ' };
      const snap = isSpv() ? SPV.snapshot(state.spv) : isFacts() ? FX.snapshot(state.facts) : seqSnapshot();
      MG.pedirAprovacao(Object.assign({ numero: isSpv() ? state.spv.numero : isFacts() ? state.facts.numero : txt('PROPOSTA', 'C5'), cliente: isSpv() ? state.spv.cliente : isFacts() ? state.facts.cliente : txt('PROPOSTA', 'F5') }, p, { id: state.id, name: docTitle() }), snap); return;
    }
    const fx = e.target.closest('[data-alfix]');
    if (fx) { let a; try { a = JSON.parse(fx.dataset.alfix); } catch (er) { return; } const S = a.S; const i = ITEMS.indexOf(S);
      if (a.act === 'pedir') { PD.pedir(Object.assign({ propUid: state.uid, propNome: docTitle() }, a.data || {})); return; }
      if (a.act === 'margem') { const mn = val(PA, 'C34');
        // margem alvo e, como o desconto entra depois, sobe o alvo até a margem final chegar ao mínimo
        const setq = (addr, v) => { const tg = target(S); tg[S] = tg[S] || {}; tg[S][addr] = v; wb.setRaw(S, addr, v); };
        setq('J17', 'MARGEM ALVO'); let alvo = mn; setq('L17', alvo);
        for (let k = 0; k < 8; k++) { const m = val(S, 'J15'); if (typeof m !== 'number' || m >= mn - 5e-4) break; alvo = Math.min(0.9, alvo + (mn - m) + 1e-4); setq('L17', alvo); }
        listCache = new Map(); dirty = true; persist(); render(); logEv({ tipo: 'Alerta corrigido', ref: docTitle(), desc: S + ': preço ajustado à margem mínima de ' + pct(mn), mudancas: [{ campo: 'Modo de preço', de: null, para: 'MARGEM ALVO' }, { campo: 'Margem alvo', de: null, para: alvo }, { campo: 'Margem final', de: null, para: val(S, 'J15') }] }); toast('Preço ajustado à margem mínima'); return; }
      if (a.act === 'desconto') { const d0 = val(S, 'C8'); commit(S, 'C8', null, true); logEv({ tipo: 'Alerta corrigido', ref: docTitle(), desc: S + ': desconto retirado', mudancas: [{ campo: 'Desconto', de: d0, para: null }] }); toast('Desconto retirado'); return; }
      if (a.act === 'foco' || a.act === 'abrir') { ui.item = i; ui.itemFull = false; if (ui.view !== 'item') setView('item');
        setTimeout(() => { if (a.act === 'abrir') { const d = document.querySelector(`details[data-keep="${a.data}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } return; }
          const el = document.getElementById(id(S, a.data)); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } else toast('Escolha a família e o equipamento primeiro'); }, 60); return; }
    }
    const ak = e.target.closest('[data-alack]');
    if (ak) { let k; try { k = JSON.parse(ak.dataset.alack); } catch (er) { return; }
      modal(`<h2>Seguir assim</h2><p class="sub" style="margin:0">${esc(k[0])}: ${esc(k[1])}</p><div class="f"><label for="akMot">Por que seguir assim? (fica no histórico)</label><input id="akMot" placeholder="ex.: aprovado pela diretoria em reunião de 28/10"></div><div style="display:flex;gap:8px"><button class="btn pri" id="akOk">Confirmar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#akMot', o).focus();
        $('#akOk', o).onclick = () => { const mot = $('#akMot', o).value.trim(); if (!mot) { toast('Escreva o motivo'); return; } state.ack = Object.assign({}, state.ack, { [k[0] + '|' + k[1]]: { motivo: mot, by: REG.me || null, at: new Date().toISOString() } }); persist(); dirty = true;
          logEv({ tipo: 'Alerta — seguir assim', ref: docTitle(), desc: k[0] + ': ' + k[1], mudancas: [{ campo: 'Justificativa', de: null, para: mot }] }); close(); render(); toast('Registrado. Salve a proposta para guardar.'); };
      }); return; }
    const au = e.target.closest('[data-alundo]');
    if (au) { let k; try { k = JSON.parse(au.dataset.alundo); } catch (er) { return; } const ack = Object.assign({}, state.ack); delete ack[k[0] + '|' + k[1]]; state.ack = ack; persist(); dirty = true; logEv({ tipo: 'Alerta — justificativa retirada', ref: docTitle(), desc: k[0] + ': ' + k[1], mudancas: [] }); render(); }
  });

  function vPropostaS() {
    const P = 'PROPOSTA'; const step = ui.step || 1;
    const items = ITEMS.map((s, i) => ({ s, i })).filter((x) => used(x.i));
    const alerts = items.flatMap((x) => alertsFor(x.s).map((a) => Object.assign({ i: x.i }, a)));
    const okCli = !!(txt(P, 'F5') && txt(P, 'F7') && txt(P, 'J5') && txt(P, 'J6'));
    const margem = val(P, 'J16'), mMin = val('PARÂMETROS', 'C34');
    const st = (n, lb, info, done) => `<button class="step ${step === n ? 'on' : ''} ${done && step !== n ? 'done' : ''}" data-step="${n}" aria-current="${step === n ? 'step' : 'false'}"><span class="sn">${done && step !== n ? '✓' : n}</span><span class="st"><b>${lb}</b><small>${esc(info)}</small></span></button>`;
    const head = `<div class="flowhead"><div><h1>Proposta ${esc(txt(P, 'C5') || 'nova')}</h1><div class="sub">${esc(txt(P, 'F5') || 'Comece pelo cliente')}</div></div>
      <div class="sumbar"><div><span>Preço total</span><b>${brl(val(P, 'B16'))}</b></div><div><span>Margem</span><b class="${typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? 'bad-t' : ''}">${pct(margem)}</b></div><div><span>Itens</span><b>${items.length}</b></div><div>${countPills(alerts)}</div></div></div>
      <nav class="steps" aria-label="Etapas da proposta">${st(1, 'Cliente', okCli ? txt(P, 'F5') : 'falta preencher', okCli)}${st(2, 'Itens', items.length ? items.length + ' item(ns)' : 'nenhum item ainda', items.length > 0)}${st(3, 'Revisão', alerts.filter((a) => !a.ack).some((a) => a.lvl === 'bad') ? 'há alertas para ver' : 'conferir e gerar documentos', false)}</nav>`;
    let body = '';
    if (step === 1) {
      const cif = /^CIF/.test(txt(P, 'B13'));
      body = `<section class="card"><h2>Cliente e condições <span class="sub">o que todo item herda</span></h2>
          <div class="fields">${fieldS(P, 'F5', 'Cliente', { cls: 'span2' })}${fieldS(P, 'F6', 'Obra / local', { cls: 'span2' })}${fieldS(P, 'C5', 'Nº da proposta')}${fieldS(P, 'F7', 'UF de destino')}${fieldS(P, 'J5', 'Cadastro fiscal', { cls: 'span2' })}${fieldS(P, 'J6', 'Condição de pagamento', { cls: 'span2' })}${fieldS(P, 'C8', 'Vendedor')}${fieldS(P, 'F9', 'Norma')}</div></section>
        <section class="card"><h2>Frete</h2><div class="fields">${fieldS(P, 'B13', 'Modalidade', { cls: 'span2' })}${cif ? fieldS(P, 'D13', 'Distância (km)') + fieldS(P, 'F13', 'Valor fechado (opcional)') : ''}${field(P, 'H13', 'Frete total', { ro: true, fmt: brl })}</div></section>
        <details class="card"${keep('mais')}><summary>Mais opções <span class="sub">revisão, data, validade, desconto global, comissões, NCM, unidade</span></summary>
          <div class="fields">${fieldS(P, 'C6', 'Revisão')}${fieldS(P, 'C7', 'Data')}${fieldS(P, 'C10', 'Validade')}${fieldS(P, 'C9', 'Desconto global')}${fieldS(P, 'F8', 'Segmento')}${fieldS(P, 'J7', 'Comissão — vendedor')}${fieldS(P, 'J8', 'Comissão — agente')}${fieldS(P, 'J9', 'NCM do produto')}${fieldS(P, 'J10', 'Unidade padrão')}${cif ? '' : fieldS(P, 'D13', 'Frete — distância (km)')}${fieldS(P, 'E13', 'Frete — R$ por km')}</div></details>
        <div class="flowbar"><span></span><button class="btn pri" data-step="2">Próximo: itens →</button></div>`;
    } else if (step === 2) {
      const cards = items.map((x) => {
        const S = x.s; const al = alertsFor(S); const ok = filled(S);
        return `<article class="icard"><header><span class="ino">${S.slice(5)}</span><div style="min-width:0"><b>${esc(txt(S, 'C28') || 'Equipamento ainda não escolhido')}</b><code>${esc(txt(S, 'C27'))}</code></div></header>
          ${ok ? `<div class="itotal"><span>Total c/ IPI</span><b>${brl(val(S, 'D15'))}</b></div><dl class="ifacts"><div><dt>Qtd</dt><dd>${show(S, 'P17')}</dd></div><div><dt>Margem</dt><dd class="${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</dd></div><div><dt>Origem</dt><dd>${esc(txt(S, 'P33').slice(0, 3))} ${pct(val(S, 'P32'), 0)}</dd></div></dl>` : '<p class="sub" style="margin:0">Abra para escolher o modelo pronto ou montar o equipamento.</p>'}
          <div>${ok ? countPills(al) : ''}</div>
          <footer><button class="btn sm pri" data-goitem="${x.i}">Abrir</button><button class="btn sm" data-dup="${x.i}">Duplicar</button><button class="btn sm" data-rmitem="${x.i}">Remover</button></footer></article>`;
      }).join('');
      const free = firstFree();
      body = `<div class="icards">${cards}${free >= 0 ? `<button class="icard add" data-additem>+ Adicionar item<small>modelo pronto ou montagem própria</small></button>` : ''}</div>
        <div class="flowbar"><button class="btn" data-step="1">← Cliente</button><button class="btn pri" data-step="3">Próximo: revisão →</button></div>`;
    } else {
      const rows = items.filter((x) => filled(x.s)).map((x) => { const S = x.s; return `<tr><td><button class="btn sm" data-goitem="${x.i}">${S.slice(5)}</button></td><td style="min-width:240px">${esc(txt(S, 'C28'))}</td><td class="n">${show(S, 'P17')}</td><td class="n">${brl(val(S, 'B15'))}</td><td class="n"><b>${brl(val(S, 'D15'))}</b></td><td class="n">${pct(val(S, 'J15'))}</td><td>${situPill(txt(S, 'P84'))} ${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? situPill('MARGEM ABAIXO DO MÍNIMO') : ''}</td></tr>`; }).join('');
      const memo = val(P, 'E83'); const memoOk = typeof memo !== 'number' || Math.abs(memo) <= 0.005;
      body = `<div class="kpis">
          <div class="kpi lead"><span>Preço total (com IPI)</span><b>${brl(val(P, 'B16'))}</b></div>
          <div class="kpi"><span>Custo total</span><b>${brl(val(P, 'G16'))}</b></div>
          <div class="kpi"><span>Margem líquida</span><b class="${typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? 'bad-t' : ''}">${pct(margem)}</b><em>mínimo ${pct(mMin)}</em></div>
          <div class="kpi"><span>DIFAL do cliente (fora do preço)</span><b>${brl(val(P, 'E84'))}</b></div></div>
        <section class="card"><h2>Alertas</h2>${alertList(alerts, true) || '<p class="ok-t" style="margin:0">Nenhum alerta: preços dentro da política, conferências fechando e FCI pronta.</p>'}${memoOk ? '' : `<ul class="alerts" style="margin-top:6px"><li class="bad"><span>A proposta não bate com o memorial: diferença de ${brl(memo)}.</span></li></ul>`}</section>
        <section class="card"><h2>Itens</h2><div class="tw"><table class="t"><thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Unit. c/ IPI</th><th>Total c/ IPI</th><th>Margem</th><th>Situação</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="4">Total da proposta</td><td class="n">${brl(val(P, 'P43'))}</td><td class="n">${pct(margem)}</td><td></td></tr></tbody></table></div></section>
        <section class="card"><h2>Documentos</h2><div class="docbar"><button class="btn pri" data-doc="memorial">Memorial (PDF)</button><button class="btn" data-doc="fcipdf">FCI (PDF)</button><button class="btn" data-doc="fcixlsx">FCI (Excel)</button><button class="btn" data-savebtn>Salvar proposta</button><button class="btn" data-propfull>Ver todas as colunas</button></div></section>
        <div class="flowbar"><button class="btn" data-step="2">← Itens</button><span></span></div>`;
    }
    return `<div class="stack">${head}${body}</div>`;
  }

  function vItemS() {
    const S = ITEMS[ui.item]; const f = (a, lb, o) => field(S, a, lb, o); const fs = (a, lb, o) => fieldS(S, a, lb, o);
    const c = arrCounts(S); const ok = filled(S); const al = alertsFor(S);
    const cmb = isCMB(S); const cmbOne = c.d + c.e + (c.j ? 1 : 0) === 1;
    const chip = (k, lb, on) => `<label class="chip"><input type="radio" name="cmbAc" data-cmb="${k}"${on ? ' checked' : ''}> ${lb}</label>`;
    const step = (k, lb, n) => `<div class="stp"><span>${lb}</span><button type="button" class="btn sm" data-arr="${k}-" aria-label="Menos ${lb}"${n ? '' : ' disabled'}>−</button><b>${n}</b><button type="button" class="btn sm" data-arr="${k}+" aria-label="Mais ${lb}"${c.d + c.e >= 4 ? ' disabled' : ''}>+</button></div>`;
    const arr = cmb ? `${chip('D', 'Diesel', cmbOne && c.d === 1)}${chip('E', 'Elétrica', cmbOne && c.e === 1)}${chip('J', 'Jockey', cmbOne && c.j)}`
      : `${step('D', 'Diesel', c.d)}${step('E', 'Elétrica', c.e)}<label class="chk"><input type="checkbox" data-arrj${c.j ? ' checked' : ''}> Bomba jockey</label>`;
    const fromModel = (a) => !!txt(S, 'AR1') && (val(S, a) === null || val(S, a) === '') && !uiEdit.has(S + '|' + a);
    const modelTxt = (a, label, value, o = {}) => `<div class="f fs ${o.cls || ''}"><label>${esc(label)} <small class="sub" style="font-weight:500">do modelo</small></label><div class="autov"><span>${esc(value) || '—'}</span><button class="restore" data-edit="${esc(S)}|${a}" aria-label="Alterar ${esc(label)}">alterar</button></div></div>`;
    const dieselMotor = fromModel('C19') && txt(S, 'C20') ? modelTxt('C19', 'Motor diesel', txt(S, 'C20'), { cls: 'span2' }) : `${f('C19', 'Potência (HP)')}${f('H19', 'Rotação (RPM)')}${f('F19', 'Arrefecimento')}${field(S, 'C20', 'Motor', { ro: true, cls: 'span2' })}`;
    const eletMotor = fromModel('I19') && txt(S, 'H20') ? modelTxt('I19', 'Motor elétrico', txt(S, 'H20'), { cls: 'span2' }) : `${f('I19', 'Potência (CV)')}${f('L19', 'Tensão do painel')}${field(S, 'H20', 'Motor', { ro: true, cls: 'span2' })}`;
    const arrNames = [c.d ? (c.d > 1 ? c.d + '× diesel' : 'diesel') : '', c.e ? (c.e > 1 ? c.e + '× elétrica' : 'elétrica') : '', c.j ? 'jockey' : ''].filter(Boolean).join(' + ');
    const arrUi = c.code && !overridden(S, 'E17') && !uiEdit.has(S + '|E17') && txt(S, 'AR1')
      ? `<span class="stp"><span>Acionamento</span></span><b>${esc(arrNames.charAt(0).toUpperCase() + arrNames.slice(1))}</b><small class="sub">do modelo · arranjo ${esc(c.code)}</small><button class="restore" data-edit="${esc(S)}|E17">alterar</button>`
      : `<span class="stp"><span>Acionamento</span></span>${arr}<span class="arrcode">Arranjo <b class="code">${esc(c.code || '—')}</b></span>${overridden(S, 'E17') ? `<button class="restore" data-restore="${esc(S)}|E17">↺ arranjo do modelo pronto</button>` : ''}`;
    const sets = [];
    if (c.d) sets.push(`<div class="set"><h3>Conjunto diesel${c.d > 1 ? ' × ' + c.d : ''}</h3><div class="fields">${fs('D19', 'Bomba', { cls: 'span2' })}${dieselMotor}</div></div>`);
    if (c.e) sets.push(`<div class="set"><h3>Conjunto elétrico${c.e > 1 ? ' × ' + c.e : ''}</h3><div class="fields">${c.d ? f('BA19', 'Bomba (em branco = a do diesel)', { cls: 'span2' }) : fs('D19', 'Bomba', { cls: 'span2' }) + f('H19', 'Rotação (RPM)')}${eletMotor}</div></div>`);
    if (c.j) sets.push(`<div class="set"><h3>Bomba jockey</h3><div class="fields">${fs('J19', 'Bomba jockey', { cls: 'span2' })}</div></div>`);
    // componentes editáveis, agrupados por conjunto
    const num = (x) => (typeof x === 'number' ? x : 0);
    const groups = { DIESEL: [], ELETRICA: [], JOCKEY: [], TODOS: [], ESC: [] };
    // quanto cada linha e cada grupo pesa no custo do item (pacote)
    const totItem = num(val(S, 'H114')); const pItem = (v) => (totItem && v ? NF[1].format((v / totItem) * 100) + '%' : '');
    for (const x of montLines(S)) groups[x.acion].push({ r: x.r, rot: x.rot, tot: num(val(S, 'H' + x.r)) });
    for (const x of hiddenLines(S)) groups[x.acion].push({ hid: x, tot: x.tot });
    const escRows = []; for (let r = 68; r <= 112; r++) if (txt(S, 'D' + r) || txt(S, 'C' + r) || txt(S, 'B' + r)) escRows.push(r);
    if (ui.addRow && ui.addRow.S === S && !escRows.includes(ui.addRow.r)) escRows.push(ui.addRow.r);
    groups.ESC = escRows.map((r) => ({ r, esc: true, tot: num(val(S, 'H' + r)) }));
    const nComp = Object.values(groups).reduce((n, g) => n + g.length, 0);
    const gl = { DIESEL: 'Conjunto diesel', ELETRICA: 'Conjunto elétrico', JOCKEY: 'Bomba jockey', TODOS: 'Comuns ao equipamento', ESC: 'Componentes adicionais (do cadastro)' };
    if (['SKID', 'CONTAINER'].includes(String(val(S, 'AR2') || ''))) gl.TODOS = 'Equipamentos e acessórios gerais';
    const obs = (r) => { const o = txt(S, 'L' + r); if (!o) return ''; const sem = /sem custo|sem o preço|fora do catálogo/.test(o);
      return `<span class="pill ${sem ? 'bad' : 'warn'}">${esc(o)}</span>${sem ? ` <button class="restore" data-pedir="${esc(JSON.stringify(pedidoDaLinha(S, r)))}">pedir cadastro</button>` : ''}`; };
    const rowC = (x) => {
      if (x.hid) return `<tr class="ro"><td class="sub">${esc(x.hid.rot)}</td><td>${esc(x.hid.desc)}</td><td class="n">${fmtNum(x.hid.qtd)}</td><td class="n">${fmtNum(x.hid.unit, '#,##0.00')}</td><td></td><td class="n">${fmtNum(x.hid.tot, '#,##0.00')}</td><td class="n sub">${pItem(x.hid.tot)}</td><td><span class="pill mute">além da linha 30 da planilha</span></td></tr>`;
      const r = x.r; const fam = txt(S, 'C' + r);
      const first = x.esc ? cellIn(S, 'C' + r) : `<td class="sub">${esc(x.rot)}</td>`;
      // sempre do cadastro: o insumo vem da lista da família e o custo unitário é o cadastrado
      const lista = fam ? famProdutos(fam) : [];
      const insumo = fam ? cellIn(S, 'D' + r, { list: lista }) : '<td class="sub">escolha a família</td>';
      const custo = `<td class="n">${show(S, 'G' + r)}${overridden(S, 'G' + r) ? ` <button class="restore" data-restore="${esc(S)}|G${r}" title="Custo digitado à mão numa versão antiga">↺ usar o do cadastro</button>` : ''}</td>`;
      return `<tr>${first}${insumo}${x.esc ? cellIn(S, 'F' + r) : qtdRO(S, r)}${custo}${updCell(S, r)}<td class="n">${show(S, 'H' + r)}</td><td class="n sub">${pItem(num(val(S, 'H' + r)))}</td><td>${obs(r)}${x.esc ? ` <button class="restore" data-rmrow="${r}">remover</button>` : ''}</td></tr>`;
    };
    const comp = Object.entries(groups).filter(([, g]) => g.length).map(([k, g]) => { const gt = g.reduce((t, x) => t + x.tot, 0); return `<tr class="grp"><td colspan="5">${gl[k]}</td><td class="n">${fmtNum(gt, '#,##0.00')}</td><td class="n">${pItem(gt)}</td><td></td></tr>${g.map(rowC).join('')}`; }).join('');
    // código e FCI
    const lenTag = (n, lim) => `<span class="pill ${n > lim ? 'bad' : 'ok'}">${n} de ${lim} caracteres</span>`;
    const imp = []; let nNac = 0;
    for (let r = 34; r <= 112; r++) { if ((r > 63 && r < 68) || val(S, 'AU' + r) !== 1) continue; if (txt(S, 'AB' + r) === 'IMP') imp.push({ d: txt(S, 'D' + r), q: show(S, 'F' + r), t: num(val(S, 'F' + r)) * num(val(S, 'AD' + r)) }); else nNac++; }
    for (const x of fciHidden(S)) { if (x.ori === 'IMP') imp.push({ d: x.desc, q: fmtNum(x.qtd), t: x.tot }); else nNac++; }
    const fciSt = txt(S, 'C196');
    const cond = `Desconto ${pct(val(S, 'C8') || 0, 1)} · margem alvo ${pct(val(S, 'P89'))} · start-up ${val(S, 'K12') ? brl(val(S, 'K12')) + '/un.' : 'não'}`;
    return `<div class="stack">
      <div class="flowhead"><div style="min-width:0"><button class="btn sm" data-step="2">← Itens da proposta</button><h1 style="margin-top:8px">${S}</h1><div class="sub">${esc(txt(S, 'C28')) || 'Escolha um modelo pronto ou monte o equipamento abaixo.'}</div></div>
        <div class="sumbar"><div><span>Unitário c/ IPI</span><b>${brl(val(S, 'B15'))}</b></div><div><span>Total</span><b>${brl(val(S, 'D15'))}</b></div><div><span>Margem</span><b class="${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</b></div><div>${ok ? countPills(al) : ''}</div></div></div>
      ${alertList(al, false)}
      ${scopeWarning(S)}
      ${!montLines(S).length && groups.ESC.length ? `<div class="banner info">Este item foi montado linha a linha (${groups.ESC.length} componentes adicionais escolhidos do cadastro), sem usar a seleção abaixo. O preço vem dessas linhas, em Componentes.</div>` : ''}
      ${famPanel(S, c)}
      ${!famChosen(S, c) ? '' : `<section class="card"><h2>Equipamento <span class="sub">${esc(famLabel(String(val(S, 'AR2') || 'CMB')))} · <button class="restore" data-famreset>trocar a família</button></span></h2>
        <div class="fields">${f('C17', 'Modelo pronto', { cls: 'span2', list: modelos().filter((m) => m.estr === String(val(S, 'AR2') || 'CMB')).map((m) => m.nome) })}${f('C6', 'Quantidade').replace('<input ', '<input placeholder="1" ')}</div>
        <div class="sep-or">ou monte</div>
        <div class="fields">${fs('C21', 'Família')}${fromModel('G17') && val(S, 'AR4') ? modelTxt('G17', 'Vazão (USgpm)', fmtNum(val(S, 'AR4'))) : f('G17', 'Vazão (USgpm)')}${fs('H17', 'Pressão (mca)')}${fs('I17', 'Norma')}</div>
        <div class="arrbox">${arrUi}</div>
        ${sets.join('')}
      </section>`}
      ${famChosen(S, c) ? optSection(S, c) : ''}
      ${!famChosen(S, c) ? '' : `
      <details class="card"${keep('cond')}><summary>Condições deste item <span class="sub">${esc(cond)}</span></summary>
        <div class="fields">${f('C8', 'Desconto de negociação')}${fs('L17', 'Margem alvo')}${fs('J17', 'Modo de preço')}${fs('K7', 'Folga de negociação')}${f('C12', 'Start-up — distância (km)')}${f('F12', 'Start-up — diárias')}${f('I12', 'Start-up — valor fechado')}</div></details>
      <details class="card"${keep('comp')}><summary>Componentes <span class="sub">${nComp} itens · custo ${brl(val(S, 'H114'))}</span></summary>
        <p class="sub" style="margin:0 0 10px">Verde é o que a montagem escolheu sozinha. O insumo vem da lista da família; preço, origem e data vêm do cadastro, e a quantidade vem da estrutura do item (Engenharia → Estruturas). Só nos componentes adicionais você informa a quantidade. Se o insumo não existe ou está sem preço, use "pedir cadastro".</p>
        ${nComp ? `<div class="tw"><table class="t comp"><thead><tr><th>Item / família</th><th>Insumo</th><th>Qtd</th><th>Custo unit.</th><th>Preço atualizado em</th><th>Custo total</th><th>% do item</th><th></th></tr></thead><tbody>${comp}<tr class="tot"><td colspan="5">Custo do item</td><td class="n">${brl(val(S, 'H114'))}</td><td class="n">100%</td><td></td></tr></tbody></table></div>` : '<p class="sub">Os componentes aparecem quando o equipamento estiver escolhido.</p>'}
        <div class="docbar" style="margin-top:10px"><button class="btn sm" data-addrow>+ Adicionar componente do cadastro</button><button class="btn sm" data-pedir="${esc(JSON.stringify({ linha: { rotulo: S + ' · novo componente' } }))}">Pedir cadastro de insumo</button></div></details>
      <details class="card"${keep('cod')}><summary>Código e descrição <span class="sub">${lenTag(txt(S, 'C27').length, 60)} ${lenTag(txt(S, 'C28').length, 120)}</span></summary>
        <div class="stack">
          <div><div class="lbl">Código ${lenTag(txt(S, 'C27').length, 60)}</div><div class="codebox">${esc(txt(S, 'C27') || 'o código sai aqui')}</div></div>
          <div><div class="lbl">Descrição breve ${lenTag(txt(S, 'C28').length, 120)}</div><p class="txtv">${esc(txt(S, 'C28')) || '—'}</p></div>
          <div><div class="lbl">Descrição completa</div><p class="txtv">${esc(txt(S, 'C29')) || '—'}</p></div>
          <div><div class="lbl">Ponto operacional</div><p class="txtv">${esc(txt(S, 'C30')) || '—'}</p></div>
          <div class="fields">${fs('J21', 'Marca')}${fs('H21', 'Unidade')}${fs('C4', 'Descrição do item na proposta', { cls: 'span2' })}</div>
        </div></details>
      <details class="card"${keep('fci')}><summary>FCI <span class="sub">conteúdo importado ${pct(val(S, 'C172'), 2)} · ${esc(txt(S, 'E172'))} · ${/^OK/.test(fciSt) ? 'pronta' : 'com pendência'}</span></summary>
        <div class="stack">
          ${fciSt && !/^OK/.test(fciSt) ? `<div class="banner warn">${esc(fciSt)}</div>` : ''}
          <div class="kpis">
            <div class="kpi"><span>Conteúdo importado</span><b>${pct(val(S, 'C172'), 2)}</b><em>${esc(txt(S, 'E172'))} (limite ${pct(val('PARÂMETROS', 'C9'), 0)})</em></div>
            <div class="kpi"><span>Valor da saída</span><b>${brl(val(S, 'H170'))}</b><em>sem ICMS e IPI</em></div>
            <div class="kpi"><span>ICMS na nota</span><b>${pct(val(S, 'C181'), 2)}</b><em>CST ${esc(txt(S, 'C183'))}</em></div>
          </div>
          <div class="fields">${fs('C193', 'Unidade p/ transmissão')}${fs('C194', 'Finalidade', { list: ['ATIVO IMOBILIZADO', 'USO E CONSUMO'] })}</div>
          ${imp.length ? `<div class="tw"><table class="t"><thead><tr><th>Componente importado</th><th>Qtd</th><th>Parcela importada</th></tr></thead><tbody>${imp.map((x) => `<tr><td>${esc(x.d)}</td><td class="n">${esc(x.q)}</td><td class="n">${fmtNum(x.t, '#,##0.00')}</td></tr>`).join('')}<tr class="tot"><td colspan="2">Total importado</td><td class="n">${show(S, 'H166')}</td></tr></tbody></table></div>` : '<p class="sub" style="margin:0">Nenhum componente importado.</p>'}
          <p class="sub" style="margin:0">${nNac} componente(s) nacional(is): entram na FCI com parcela importada zero.</p>
          <div class="docbar"><button class="btn sm pri" data-doc="fcipdf" data-docitem="${S}">FCI em PDF</button><button class="btn sm" data-doc="fcixlsx" data-docitem="${S}">FCI em Excel (template)</button></div>
        </div></details>
      `}
      <div class="flowbar"><button class="btn" data-step="2">← Itens da proposta</button><span style="display:flex;gap:6px">${!txt(S, 'C17') && ok && c.code && !(c.d && c.e) ? '<button class="btn" data-savemodel>Salvar como modelo pronto</button>' : ''}<button class="btn" data-dup="${ui.item}">Duplicar</button><button class="btn" data-rmitem="${ui.item}">Remover</button></span></div>
      <p class="sub" style="text-align:right;margin:0">Precisa da planilha célula por célula? <button class="restore" data-itemfull>abrir a visão completa</button></p>
      ${datalists()}
    </div>`;
  }
  // ---- novo item: família → estrutura cadastrada → modelo cadastrado (ou os mais próximos) ----
  const famChosen = (S, c) => overridden(S, 'C21') || !!txt(S, 'C17') || filled(S) || overridden(S, 'E17');
  function modelos() {
    const out = [];
    for (let r = 7; r <= 86; r++) {
      const n = val(MO, 'B' + r); if (!n) continue;
      const nb = Math.max(1, +val(MO, 'G' + r) || 1); const ac = String(val(MO, 'D' + r) || 'DIESEL'); const jk = txt(MO, 'J' + r);
      out.push({ r, nome: String(n), estr: String(val(MO, 'C' + r) || 'CMB'), ac, vazao: val(MO, 'E' + r), pressao: val(MO, 'F' + r), nb, motor: txt(MO, 'H' + r), bomba: txt(MO, 'I' + r), jockey: jk, code: (ac === 'ELETRICA' ? 'E' : 'D').repeat(nb) + (jk ? 'J' : '') });
    }
    return out;
  }
  function modelMatch(S) {
    const key = String(val(S, 'AR2') || 'CMB'); const code = String(val(S, 'AR20') || '').toUpperCase(); const pumps = (x) => x.replace(/J/g, '');
    const vz = typeof val(S, 'G17') === 'number' ? val(S, 'G17') : null;
    const list = modelos().filter((m) => m.estr === key);
    const exact = code && vz !== null ? list.filter((m) => pumps(m.code) === pumps(code) && m.vazao === vz) : [];
    const score = (m) => (code && m.code[0] !== code[0] ? 2000 : 0) + (code && pumps(m.code) !== pumps(code) ? 500 : 0) + (vz !== null ? (typeof m.vazao === 'number' ? Math.abs(m.vazao - vz) / vz * 100 : 300) : 0);
    const near = list.filter((m) => !exact.includes(m)).sort((a, b) => score(a) - score(b)).slice(0, 3);
    return { key, code, vz, list, exact, near };
  }
  const autoDone = new Set();
  function famPanel(S, c) {
    if (txt(S, 'C17')) return '';
    if (!famChosen(S, c)) {
      const cards = FAMS.filter((f) => f[2] !== 'FABRICANTES').map(([k, lb, fam]) => { const reg = estrList().includes(k); const n = modelos().filter((m) => m.estr === k).length;
        return `<button class="famcard${reg ? '' : ' off'}" data-fam="${esc(fam)}"><b>${esc(FAM_SEQ_LB[fam] || lb)}</b><small>${reg ? (n ? n + ' modelo(s) pronto(s)' : 'estrutura cadastrada, sem modelos') : 'sem estrutura cadastrada'}</small></button>`; }).join('');
      return `<section class="card"><h2>Que equipamento é este item?</h2><div class="famgrid">${cards}<button class="famcard" data-factsnew><b>FAC · FACTS — teste automático de bombas</b><small>configurador MECON (abre uma formação própria)</small></button></div><p class="sub" style="margin:10px 0 0">A família define a estrutura padrão e os modelos prontos que o app procura para você.</p></section>`;
    }
    const m = modelMatch(S); const lb = famLabel(m.key); let h = '';
    if (!estrList().includes(m.key)) {
      const near = estrList().includes(NEAR[m.key]) ? NEAR[m.key] : estrList()[0];
      h += `<div class="banner warn">Ainda não há estrutura cadastrada para <b>${esc(lb)}</b>: o item monta só com os componentes comuns a todas. <button class="restore" data-goestr="${m.key}">Cadastrar a estrutura</button> ou use a mais próxima: <button class="restore" data-fam="${esc((FAMS.find((f) => f[0] === near) || [])[2] || '')}">${esc(famLabel(near))}</button></div>`;
    }
    const desc = [lb, m.code || null, m.vz !== null ? fmtNum(m.vz) + ' USgpm' : null].filter(Boolean).join(' · ');
    const card = (x, tag) => `<div class="mcard"><div style="min-width:0"><b>${esc(x.nome)}</b><small class="sub">${esc([x.code, typeof x.vazao === 'number' ? fmtNum(x.vazao) + ' USgpm' : null, typeof x.pressao === 'number' ? fmtNum(x.pressao) + ' mca' : null, x.bomba].filter(Boolean).join(' · '))}</small></div>${tag || ''}<button class="btn sm" data-usemodel="${esc(x.nome)}">Usar este</button></div>`;
    if (!m.list.length) h += `<div class="banner info">Nenhum modelo pronto cadastrado para ${esc(lb)}. Monte abaixo; quando o preço sair, clique em "Salvar como modelo pronto" para cadastrar.</div>`;
    else if (m.exact.length) {
      const key = S + '|' + m.code + '|' + m.vz;
      if (m.exact.length === 1 && !autoDone.has(key)) { autoDone.add(key); setTimeout(() => { commit(S, 'C17', m.exact[0].nome); toast('Modelo cadastrado aplicado: ' + m.exact[0].nome); }, 0); }
      h += `<section class="card"><h2>Modelo cadastrado para ${esc(desc)}</h2><div class="mlist">${m.exact.map((x) => card(x, '<span class="pill ok">igual</span>')).join('')}</div></section>`;
    } else if (m.code || m.vz !== null) {
      h += `<section class="card"><h2>Modelos cadastrados <span class="sub">${esc(desc)}</span></h2><div class="banner warn" style="margin:0 0 10px">Não há modelo pronto cadastrado com esses dados. Monte abaixo e salve como modelo, ou use o mais próximo.</div><div class="mlist">${m.near.map((x) => card(x, '<span class="pill mute">próximo</span>')).join('')}</div></section>`;
    } else h += `<p class="sub" style="margin:0">Escolha o acionamento e a vazão abaixo: o app procura entre os ${m.list.length} modelo(s) pronto(s) de ${esc(lb)}.</p>`;
    return h;
  }
  async function saveAsModel(S) {
    const c = arrCounts(S); const key = String(val(S, 'AR2') || 'CMB'); const ms = modelos(); let r = 7; const usedR = new Set(ms.map((x) => x.r)); while (usedR.has(r) && r <= 86) r++;
    if (r > 86) return toast('A tabela de modelos prontos está cheia (80 modelos)');
    const ac = c.d ? 'DIESEL' : 'ELETRICA'; const nb = c.d + c.e; const vz = val(S, 'AR4');
    let nome = `${key === 'CMB' ? 'CMB' : famLabel(key).toUpperCase()} ${ac} ${typeof vz === 'number' && vz ? fmtNum(vz) + ' USgpm' : txt(S, 'AR7')} — ${nb} BOMBA${nb > 1 ? 'S' : ''}`;
    let k = 2; while (ms.some((x) => x.nome === nome)) nome = nome.replace(/( \(\d+\))?$/, ` (${k++})`);
    const ch = { ['B' + r]: nome, ['C' + r]: key, ['D' + r]: ac, ['E' + r]: typeof vz === 'number' && vz ? vz : null, ['F' + r]: typeof val(S, 'AR15') === 'number' ? val(S, 'AR15') : null, ['G' + r]: nb,
      ['H' + r]: txt(S, c.d ? 'AR6' : 'AR19') || null, ['I' + r]: txt(S, 'AR7') || null, ['J' + r]: c.j ? txt(S, 'AR8') || null : null };
    try { await REG.setCells(MO, ch, 'Modelo pronto novo: ' + nome, baseOf(MO)); toast('Cadastrado como modelo pronto: ' + nome); } catch (e) { toast(errMsg(e)); }
  }
  document.addEventListener('click', (e) => {
    if (ui.view !== 'item') return;
    const S = ITEMS[ui.item];
    const fm = e.target.closest('[data-fam]'); if (fm && fm.dataset.fam) { commit(S, 'C21', fm.dataset.fam); return; }
    if (e.target.closest('[data-famreset]')) { const d = state.doc && state.doc[S]; if (d) for (const a of ['C21', 'C17', 'E17', 'G17']) delete d[a]; build(); persist(); render(); return; }
    const um = e.target.closest('[data-usemodel]'); if (um) { commit(S, 'C17', um.dataset.usemodel); toast('Modelo aplicado: ' + um.dataset.usemodel); return; }
    const ge = e.target.closest('[data-goestr]'); if (ge) { ui.view = 'cadastro'; ui.cad = 'estruturas'; render(); window.scrollTo(0, 0); estrNewModal(ge.dataset.goestr); return; }
    if (e.target.closest('[data-savemodel]')) { saveAsModel(S); return; }
  });
  // opcionais da estrutura padrão: o item marca quais entram
  function optSection(S, c) {
    const st = String(val(S, 'AR2') || 'CMB');
    const has = { DIESEL: c.d > 0, ELETRICA: c.e > 0, JOCKEY: c.j, TODOS: true };
    const opts = recLines().filter((x) => x.regra === 'OPCIONAL' && estrOf(x).includes(st) && has[x.acion || 'TODOS']);
    if (!opts.length || !c.code) return '';
    const price = (x) => { if (!['FIXO', 'SPLIT'].includes(x.tipo)) return ''; const i = REG.insumos.find((y) => y.produto === x.campo); return i && typeof i.valor === 'number' ? brl(i.valor) + ' · ' + qtdTxt(x.qtd) : '<span class="pill warn">sem preço no cadastro</span>'; };
    return `<section class="card"><h2>Opcionais <span class="sub">da estrutura padrão; marcados entram no custo e na FCI</span></h2><div class="optlist">${opts.map((x) => { const row = 67 + (x.r - 91); return `<label class="sugrow"><input type="checkbox" data-opt="${row}"${val(S, 'BC' + row) === 1 ? ' checked' : ''}><span><b>${esc(x.rot)}</b><br><small class="sub">${price(x)}</small></span></label>`; }).join('')}</div></section>`;
  }
  document.addEventListener('change', (e) => { const o = e.target.closest && e.target.closest('[data-opt]'); if (!o || ui.view !== 'item') return; commit(ITEMS[ui.item], 'BC' + o.dataset.opt, o.checked ? 1 : null, !o.checked); });
  function dupItem(i) {
    const j = firstFree(); if (j < 0) return toast('As 10 posições de item já estão em uso');
    const d = state.doc = state.doc || {};
    if (d[ITEMS[i]]) d[ITEMS[j]] = JSON.parse(JSON.stringify(d[ITEMS[i]]));
    const P = d.PROPOSTA = d.PROPOSTA || {}; for (const c of ['C', 'E', 'F', 'G', 'H']) { const v = P[c + (20 + i)]; if (v !== undefined) P[c + (20 + j)] = v; }
    build(); persist(); render(); toast(`${ITEMS[i]} duplicado em ${ITEMS[j]}`);
  }
  function rmItem(i) {
    const S = ITEMS[i]; if (state.doc) delete state.doc[S];
    if (state.doc && state.doc.PROPOSTA) for (const c of ['C', 'E', 'F', 'G', 'H']) delete state.doc.PROPOSTA[c + (20 + i)];
    build(); persist(); toast(S + ' removido');
  }
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { uiEdit.add(ed.dataset.edit); render(); const [s, a] = ed.dataset.edit.split('|'); const el = document.getElementById(id(s, a)); if (el) el.focus(); return; }
    const sp = e.target.closest('[data-step]');
    if (sp) { ui.step = +sp.dataset.step; ui.propFull = false; setView('proposta'); return; }
    if (e.target.closest('[data-additem]')) { const j = firstFree(); if (j < 0) return; ui.item = j; ui.itemFull = false; setView('item'); return; }
    const dp = e.target.closest('[data-dup]'); if (dp) { dupItem(+dp.dataset.dup); return; }
    const rm = e.target.closest('[data-rmitem]');
    if (rm) { if (!rm.dataset.sure) { rm.dataset.sure = 1; rm.textContent = 'Confirmar remoção'; rm.classList.add('pri'); return; } rmItem(+rm.dataset.rmitem); ui.step = 2; setView('proposta'); return; }
    if (e.target.closest('[data-addrow]')) {
      const S = ITEMS[ui.item]; let r = 0;
      for (let q = 68; q <= 112; q++) if (!txt(S, 'D' + q) && !txt(S, 'C' + q) && !txt(S, 'B' + q) && !(ui.addRow && ui.addRow.S === S && ui.addRow.r === q)) { r = q; break; }
      if (!r) return toast('O escopo já tem 45 linhas');
      ui.addRow = { S, r }; openSet.comp = true; render(); const el = document.getElementById(id(S, 'C' + r)); if (el) el.focus(); return;
    }
    const rr = e.target.closest('[data-rmrow]');
    if (rr) { const S = ITEMS[ui.item]; if (ui.addRow && ui.addRow.r === +rr.dataset.rmrow) ui.addRow = null; clearScopeRows(S, [+rr.dataset.rmrow]); toast('Linha removida'); return; }
    if (e.target.closest('[data-itemfull]')) { ui.itemFull = true; setView('item'); return; }
    if (e.target.closest('[data-propfull]')) { ui.propFull = true; setView('proposta'); return; }
    if (e.target.closest('[data-simpleback]')) { ui.itemFull = false; ui.propFull = false; render(); return; }
    if (e.target.closest('[data-savebtn]')) { $('#bSave').click(); return; }
  });
  const openSet = {};
  const keep = (k) => ` data-keep="${k}"${openSet[k] ? ' open' : ''}`;
  document.addEventListener('toggle', (e) => { const k = e.target.dataset && e.target.dataset.keep; if (k) openSet[k] = e.target.open; }, true);

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
  // data da última atualização do preço do insumo (cadastro; ou a data escrita nas observações)
  function precoData(prod) {
    const i = prod && REG.insumos.find((x) => x.produto === prod); if (!i) return null;
    let d = i.upd ? new Date(i.upd) : null;
    if (!d || isNaN(d)) { const m = String(i.obs || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?!.*\d{2}\/\d{2}\/\d{4})/); if (m) d = new Date(+m[3], +m[2] - 1, +m[1]); }
    return d && !isNaN(d) ? d : null;
  }
  function updCell(S, r) {
    const d = precoData(txt(S, 'D' + r)); if (!d) return `<td class="sub">${txt(S, 'D' + r) ? '—' : ''}</td>`;
    const dias = (Date.now() - d.getTime()) / 864e5;
    return `<td class="sub" style="white-space:nowrap" title="Preço do cadastro atualizado há ${Math.round(dias)} dias">${d.toLocaleDateString('pt-BR')}${dias > 180 ? ' <span class="pill warn">antigo</span>' : ''}</td>`;
  }
  // custo unitário sempre do cadastro (só leitura); se uma versão antiga tem custo digitado, oferece voltar
  const custoRO = (S, r) => `<td class="n">${show(S, 'G' + r)}${overridden(S, 'G' + r) ? ` <button class="restore" data-restore="${esc(S)}|G${r}" title="Custo digitado à mão numa versão antiga">↺ cadastro</button>` : ''}</td>`;
  // origem sempre do cadastro; quantidade da montagem sempre da estrutura
  const pctH = (S, v) => { const t = val(S, 'H114'); return typeof t === 'number' && t && typeof v === 'number' && v ? NF[1].format((v / t) * 100) + '%' : ''; };
  const origRO = (S, r) => `<td>${esc(txt(S, 'AB' + r))}${overridden(S, 'I' + r) ? ` <button class="restore" data-restore="${esc(S)}|I${r}" title="Origem escolhida à mão numa versão antiga">↺ cadastro</button>` : ''}</td>`;
  const qtdRO = (S, r) => `<td class="n" title="Quantidade definida pela estrutura do item (Engenharia → Estruturas)">${show(S, 'F' + r)}${overridden(S, 'F' + r) ? ` <button class="restore" data-restore="${esc(S)}|F${r}" title="Quantidade alterada à mão numa versão antiga">↺ estrutura</button>` : ''}</td>`;
  const insSel = (S, r) => { const fam = txt(S, 'C' + r); return fam ? cellIn(S, 'D' + r, { list: famProdutos(fam) }) : cellIn(S, 'D' + r, { list: [] }); };
  const famProdutos = (fam) => { if (!dlMap) buildDl(); return [...(dlMap.get(fam) || [])]; };
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
  // cadastro por área: cada área tem um responsável e só ele edita o que é dela
  const AREAS = [
    ['custos', 'Custos', 'Preço de compra de insumos e kits, importação e câmbio', [['insumos', 'Insumos e preços'], ['importar', 'Importar preços'], ['motor', 'Kits de motor diesel'], ['bomba', 'Kits de bomba'], ['valvulas', 'Válvulas de alívio'], ['cambio', 'Câmbio e importação'], ['facts', 'FACTS (MECON)'], ['pedidos', 'Pedidos de cadastro']]],
    ['engenharia', 'Engenharia', 'O que entra em cada equipamento e como ele é codificado', [['estruturas', 'Estruturas'], ['familias', 'Famílias'], ['codificacao', 'Codificação']]],
    ['fiscal', 'Fiscal', 'Impostos, NCM, ICMS por estado e FCI', [['fiscal', 'Impostos e NCM']]],
    ['precificacao', 'Precificação', 'Margens, fatores, descontos, comissões e condições de pagamento', [['preco', 'Margens e política']]],
    ['servicos', 'Serviços', 'Técnicos, diárias, deslocamento e modelos de serviço e contrato', [['servicos', 'Equipe, custos e modelos']]],
    ['geral', 'Cadastro geral', 'Dados da empresa, unidades, famílias por divisão e o padrão de descrição dos insumos', [['geral', 'Empresa e famílias'], ['padrao', 'Padronização de descrições']]],
    ['sistema', 'Sistema', 'Histórico, responsáveis por área e planilha', [['historico', 'Histórico'], ['acessos', 'Responsáveis e e-mails'], ['tabelas', 'Planilha (avançado)']]],
  ];
  const CAD_TABS = AREAS.flatMap((a) => a[3]);
  const OLD_TABS = { parametros: 'fiscal', politica: 'preco', fci: 'fiscal', spv: 'servicos' };
  const areaOfTab = (t) => (AREAS.find((a) => a[3].some((x) => x[0] === t)) || AREAS[0])[0];
  const areaName = (k) => (AREAS.find((a) => a[0] === k) || PAPEIS_AP.find((a) => a[0] === k) || [0, k])[1];
  const canEd = () => REG.areaOk(areaOfTab(ui.cad));
  const fmtAt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };
  const fmtVal = (v) => typeof v === 'number' ? NF[2].format(v) : v === null || v === undefined || v === '' ? '—' : String(v);
  const who = (id) => id ? `<span data-uid="${esc(id)}">…</span>` : (REG.mode === 'shared' ? 'alguém da equipe' : 'neste navegador');
  async function fillNames(root) {
    const els = [...(root || document).querySelectorAll('[data-uid]')]; if (!els.length) return;
    const names = await REG.names(els.map((e) => e.dataset.uid));
    for (const e of els) e.textContent = names[e.dataset.uid] || 'alguém da equipe';
  }
  function famList() { const s = new Set(REG.insumos.map((x) => x.fam).filter(Boolean)); for (const x of famInsumos()) s.add(x.fam); return [...s].sort((a, b) => H.famCode(a) - H.famCode(b)); }
  function cadStatus() {
    const shared = REG.mode === 'shared';
    const chips = [];
    chips.push(shared ? '<span class="pill ok">Compartilhado com a equipe</span>' : '<span class="pill mute">Salvo só neste navegador</span>');
    if (shared && !REG.ready) chips.push('<span class="pill warn">Sincronizando…</span>');
    const ar = areaOfTab(ui.cad);
    chips.push(canEd() ? `<span class="pill ok">Você pode editar ${esc(areaName(ar))}</span>` : !REG.canEditCadastro ? '<span class="pill warn">Somente leitura — edição é para quem tem acesso de Editor</span>' : `<span class="pill warn">Somente leitura — ${esc(areaName(ar))} é de outra área</span>`);
    let banner = '';
    if (shared && REG.ready && !REG.seeded) banner = '<div class="banner warn">O cadastro compartilhado ainda está vazio. Até ele ser carregado, o app usa os valores da planilha REV21 e a edição fica bloqueada.</div>';
    if (REG.error) banner += `<div class="banner bad">Não consegui falar com o banco compartilhado (${esc(REG.error)}). O app segue com a última versão que carregou; recarregue a página para tentar de novo.</div>`;
    return `<div class="legend" style="gap:8px">${chips.join('')}</div>${banner}`;
  }
  function vCadastro() {
    if (OLD_TABS[ui.cad]) ui.cad = OLD_TABS[ui.cad];
    if (!CAD_TABS.some((x) => x[0] === ui.cad)) ui.cad = 'insumos';
    const tab = ui.cad; const area = AREAS.find((a) => a[0] === areaOfTab(tab));
    const body = { insumos: vInsumos, familias: vFamilias, codificacao: () => vParamTab('codificacao'), fiscal: () => vParamTab('fiscal'), preco: () => vParamTab('preco'), servicos: () => vParamTab('servicos'), geral: () => vParamTab('geral'), cambio: () => SPV.cfgSec('custos', canEd()), valvulas: () => tableCard('valv'), acessos: vAcessos, padrao: vPadrao, facts: () => FX.vCfg(canEd()), pedidos: () => PD.vLista(), estruturas: vEstruturas, motor: () => vKits('motor'), bomba: () => vKits('bomba'), importar: vImportar, historico: vHistorico, tabelas: vTabelas }[tab]();
    const mine = REG.mode === 'shared' && REG.areasConfiguradas() ? REG.minhasAreas() : null;
    return `<div class="stack">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
        <div><h1>Cadastro</h1><div class="sub">Insumos, kits e tabelas que alimentam o preço. Uma mudança aqui vale para todas as propostas${REG.mode === 'shared' ? ' de toda a equipe' : ' deste navegador'}, e cada alteração fica registrada no histórico.</div></div>
        ${cadStatus()}
      </div>
      <div class="areatabs" role="tablist">${AREAS.map(([k, lb, d, tabs]) => `<button role="tab" data-cad="${tabs[0][0]}" aria-selected="${k === area[0]}" title="${esc(d)}">${lb}${mine && (mine.includes(k) || REG.isOwner) ? ' <span class="mydot" title="sua área"></span>' : ''}</button>`).join('')}</div>
      <p class="sub" style="margin:0">${esc(area[2])}.${REG.mode === 'shared' && REG.areasConfiguradas() ? ` Responsável: <span data-areaown="${area[0]}">${esc((REG.acessos[area[0]] || []).length ? '…' : 'ninguém definido (só o dono edita)')}</span>.` : ''}</p>
      ${area[3].length > 1 ? `<div class="subtabs" role="tablist">${area[3].map(([k, lb]) => `<button role="tab" data-cad="${k}" aria-selected="${k === tab}">${lb}</button>`).join('')}</div>` : ''}
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
          ${canEd() ? '<button class="btn sm pri" id="insNew">+ Novo insumo</button>' : ''}
        </div>
        <p class="sub" style="margin:8px 0">${list.length === all.length ? all.length + ' insumos' : list.length + ' de ' + all.length + ' insumos'}${list.length > shown.length ? ' — mostrando os primeiros ' + shown.length + '; refine a busca' : ''}. Clique numa linha para ver ou editar.</p>
        <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr><th>Código</th><th>Família</th><th>Produto</th><th>Fabricante</th><th>Tipo/config.</th><th>Valor</th><th>Origem</th><th>Atualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="sub">Nenhum insumo com esse filtro.</td></tr>'}</tbody></table></div>
      </section>`;
  }
  function insumoModal(id, presetFam) {
    const isNew = !id; const rec = isNew ? { fam: presetFam || ui.insFam || famList()[0], origem: 'NAC' } : Object.assign({}, REG.insumos.find((x) => x.id === id));
    if (!rec) return;
    const ro = !canEd() ? ' disabled' : '';
    const fams = famList();
    const tipos = [...new Set(REG.insumos.filter((x) => x.fam === rec.fam && x.tipo).map((x) => x.tipo))];
    const code = isNew ? REG.nextCode(rec.fam) : { a: rec.a, b: rec.b };
    const hist = REG.historico.filter((h) => h.ref === id).slice(0, 12);
    const histHtml = hist.length ? `<div class="hist">${hist.map((h) => `<div><small>${fmtAt(h.at)} · ${who(h.by)}</small>${(h.mudancas || []).map((m) => `<div class="chg"><b>${esc(m.campo)}</b> ${esc(fmtVal(m.de))} → ${esc(fmtVal(m.para))}</div>`).join('')}</div>`).join('')}</div>` : '<p class="sub">Sem alterações registradas — valor da planilha REV21.</p>';
    modal(`<h2>${isNew ? 'Novo insumo' : 'Insumo ' + esc(rec.id)}</h2>
      <form id="insForm" class="fields" autocomplete="off">
        <div class="f span2"><label for="fFam">Família</label><select id="fFam"${ro || (!isNew ? '' : '')}>${fams.map((f) => `<option${f === rec.fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}${canEd() ? '<option value="__nova">+ Nova família…</option>' : ''}</select></div>
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
        ${canEd() ? `<button class="btn pri" id="fSave">${isNew ? 'Cadastrar' : 'Salvar'}</button>` : ''}
        ${canEd() && !isNew ? '<button class="btn" id="fDel">Excluir</button>' : ''}
        <button class="btn" data-close>${canEd() ? 'Cancelar' : 'Fechar'}</button>
      </div>
      ${!isNew ? `<h2>Documentos deste insumo</h2>${SPV.docsDoInsumo(rec.id)}<div class="docbar"><label class="btn sm" for="insDoc">📎 Anexar orçamento, nota ou ficha</label><input type="file" id="insDoc" data-insdoc="${esc(rec.id)}" accept="application/pdf,image/*" hidden></div>` : ''}
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
      const pchk = () => { const m = window.PricerPadraoCheck(famSel.value, $('#fProd', o).value); let el = $('#fPad', o); if (!el) { el = document.createElement('small'); el.id = 'fPad'; $('#fProd', o).after(el); } el.textContent = m ? '⚠ ' + m : ''; el.className = 'sub bad-t'; };
      $('#fProd', o).addEventListener('input', pchk); famSel.addEventListener('change', pchk); pchk();
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
      <div class="sheetbar"><input id="kitQ" type="search" placeholder="Buscar kit…" value="${esc(ui.kitQ || '')}" aria-label="Buscar kit" style="flex:1 1 240px"><span class="sub">${list.length} de ${lim} linhas usadas</span><span style="flex:1"></span>${canEd() ? `<button class="btn sm pri" id="kitNew" data-kind="${kind}">+ Novo kit</button>` : ''}</div>
      <p class="sub" style="margin:8px 0">${motor ? 'O montador lê daqui o custo total do conjunto do motor (peça, painel, base, tanque, escape, bateria…). "Total NBR 13714" usa o painel e o tanque NBR; o outro, o painel padrão.' : 'O montador lê daqui o custo da bomba com os acessórios. A bomba END SUCTION usa o total sem as válvulas; a SPLIT CASE (bipartida) usa o total completo — quem decide é o Tipo/config. do insumo no CADASTRO.'} A descrição tem de ser igual à do insumo no CADASTRO.</p>
      <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr><th>Descrição</th><th>Origem</th><th>Marca</th><th>${motor ? 'Motor' : 'Bomba'}</th><th>${motor ? 'Total NBR 13714' : 'Total end suction'}</th><th>${motor ? 'Total' : 'Total split case'}</th><th>Atualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="sub">Nenhum kit.</td></tr>'}</tbody></table></div>
    </section>`;
  }
  function kitModal(kind, id) {
    const motor = kind === 'motor'; const list = motor ? REG.kitMotor : REG.kitBomba;
    const isNew = !id; const rec = isNew ? { desc: '', tipo: 'NAC', marca: '', p: {} } : JSON.parse(JSON.stringify(list.find((x) => x.id === id)));
    const labels = motor ? H.KMD_LABELS : H.KB_LABELS; const ro = canEd() ? '' : ' disabled';
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">${canEd() ? `<button class="btn pri" id="kSave">${isNew ? 'Cadastrar kit' : 'Salvar'}</button>` : ''}${canEd() && !isNew ? '<button class="btn" id="kDel">Excluir</button>' : ''}<button class="btn" data-close>${canEd() ? 'Cancelar' : 'Fechar'}</button></div>
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
    if (!canEd()) return `<section class="card"><p class="sub">Importar preços muda o cadastro de todos. Só quem tem acesso de Editor ao app pode fazer.</p></section>`;
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
  // ---- padronização de descrições (motores diesel, elétricos, bombas, motobombas e jockey) ----
  const PADRAO = (window.PRICER_PADRAO || { itens: [] });
  const FAM_PAD = { '01': 'Motores diesel', 10: 'Motores elétricos', 11: 'Bombas de eixo livre', 12: 'Motobombas', 13: 'Jockey' };
  const PAD_REGRAS = { '01': '{MODELO} {HP}HP@{RPM}RPM {N}CIL {12|24}VCC {RADIADOR|TROCADOR DE CALOR} — marca no campo Fabricante', 10: 'MOTOR {CV}CV {2P|4P|6P} IP55 {TENSÃO} {MARCA} {MANCAL|MONOBLOCO}', 11: '{SÉRIE} {MODELO} na notação do catálogo do fabricante (TKF 65-250, SCE 150-315, IS 080X065X250, MEGANORM 250-500)', 12: '{MODELO DA BOMBA} C/ MOTOR {ELÉTRICO|DIESEL} {MARCA} {POT}HP @{RPM}RPM {CERTIFICAÇÃO}', 13: '{MODELO} {POT}CV {TRIF|MONO} {60HZ} {fases}' };
  function padStatus(x) {
    const it = REG.insumos.find((i) => i.id === x.id); if (!it) return { st: 'sumiu', it };
    const okNome = it.produto === x.para, okFab = !x.fab || it.fab === x.fab, okTipo = !x.tipo || it.tipo === x.tipo;
    if (okNome && okFab && okTipo) return { st: x.de === x.para && !x.fab && !x.tipo ? 'aviso' : 'feito', it };
    if (it.produto !== x.de && it.produto !== x.para) return { st: 'mudou', it };
    return { st: 'pendente', it };
  }
  // nome repetido: dois insumos (ou dois kits) com o mesmo nome e preço diferente fazem a fórmula pegar o primeiro
  let colis = new Map();
  function padColisoes() {
    const cand = new Map(); for (const x of PADRAO.itens) { const s = padStatus(x); if (s.st === 'pendente' && x.confianca !== 'baixa' && x.para !== s.it.produto) cand.set(x.id, x); }
    const final = new Map(); for (const it of REG.insumos) { const n = cand.has(it.id) ? cand.get(it.id).para : it.produto; if (!final.has(n)) final.set(n, []); final.get(n).push(it); }
    const out = new Map();
    for (const [n, list] of final) { if (list.length < 2) continue; const vs = list.map((i) => (typeof i.valor === 'number' ? i.valor : null)); const dif = vs.some((v) => v !== vs[0] && !(v !== null && vs[0] !== null && Math.abs(v - vs[0]) < 0.01));
      if (dif) for (const i of list) if (cand.has(i.id)) out.set(i.id, `mesmo nome de ${list.filter((o) => o.id !== i.id).map((o) => o.id + ' (' + (typeof o.valor === 'number' ? brl(o.valor) : 'sem preço') + ')').join(', ')}`); }
    const kits = REG.kitMotor.concat(REG.kitBomba); const kd = new Set(kits.map((k) => k.desc));
    for (const [id, x] of cand) { const it = REG.insumos.find((i) => i.id === id); if (kits.some((k) => k.desc === it.produto) && kd.has(x.para)) out.set(id, (out.get(id) ? out.get(id) + '; ' : '') + 'já existe um kit com o nome novo'); }
    colis = out; return out;
  }
  function padSel(x, st) {
    if (!ui.padSel) ui.padSel = {};
    if (x.id in ui.padSel) return ui.padSel[x.id];
    if (st.st !== 'pendente' || x.confianca === 'baixa' || colis.has(x.id)) return false;
    return true;
  }
  function vPadrao() {
    padColisoes();
    const ed = canEd(); const fam = ui.padFam || ''; const conf = ui.padConf || ''; const q = (ui.padQ || '').trim().toUpperCase(); const sts = ui.padSt || 'pendente';
    const rows0 = PADRAO.itens.map((x) => ({ x, s: padStatus(x) }));
    const cont = { pendente: 0, feito: 0, aviso: 0, mudou: 0 }; for (const r of rows0) cont[r.s.st] = (cont[r.s.st] || 0) + 1;
    const rows = rows0.filter(({ x, s }) => (!fam || x.id.startsWith(fam + '-')) && (!conf || x.confianca === conf) && (sts === 'todos' || s.st === sts) && (!q || (x.de + ' ' + x.para + ' ' + x.id).toUpperCase().includes(q)));
    const nSel = rows0.filter(({ x, s }) => s.st === 'pendente' && padSel(x, s)).length;
    const pill = { alta: 'ok', media: 'warn', baixa: 'bad' };
    const tr = rows.slice(0, 300).map(({ x, s }) => { const it = s.it || {}; const dup = x.duplicado_de && REG.insumos.find((i) => i.id === x.duplicado_de);
      return `<tr${s.st === 'pendente' ? '' : ' class="ro"'}><td class="in">${s.st === 'pendente' && ed ? `<input type="checkbox" data-padsel="${esc(x.id)}"${padSel(x, s) ? ' checked' : ''} aria-label="Aplicar ${esc(x.id)}">` : ''}</td>
        <td class="code">${esc(x.id)}</td><td style="min-width:240px"><span class="sub" style="text-decoration:${s.st === 'feito' ? 'line-through' : 'none'}">${esc(x.de)}</span><br><b>${esc(x.para)}</b>${x.fab || x.tipo ? `<br><small class="sub">${x.fab ? 'fabricante ' + esc(it.fab || '—') + ' → <b>' + esc(x.fab) + '</b>' : ''}${x.fab && x.tipo ? ' · ' : ''}${x.tipo ? 'tipo ' + esc(it.tipo || '—') + ' → <b>' + esc(x.tipo) + '</b>' : ''}</small>` : ''}
          ${colis.has(x.id) && s.st === 'pendente' ? `<br><span class="pill bad">nome repetido com preço diferente</span> <small class="sub">${esc(colis.get(x.id))}</small>` : ''}
          ${dup ? `<br><small class="sub">duplicado de ${esc(dup.id)} (${typeof dup.valor === 'number' ? brl(dup.valor) : 'sem preço'}; este: ${typeof it.valor === 'number' ? brl(it.valor) : 'sem preço'})</small>` : ''}</td>
        <td><span class="pill ${pill[x.confianca] || 'mute'}">${esc(x.confianca)}</span>${s.st === 'feito' ? ' <span class="pill ok">aplicado</span>' : s.st === 'mudou' ? ' <span class="pill warn">alterado à mão depois</span>' : s.st === 'aviso' ? ' <span class="pill mute">só aviso</span>' : ''}</td>
        <td class="sub" style="min-width:260px">${esc(x.motivo || '')}${x.fonte ? ` <a href="${esc(x.fonte)}" target="_blank" rel="noopener">fonte</a>` : ''}</td></tr>`; }).join('');
    const famOpts = Object.entries(FAM_PAD).map(([k, l]) => `<option value="${String(k).padStart(2, '0')}"${fam === String(k).padStart(2, '0') ? ' selected' : ''}>${l}</option>`).join('');
    return `<div class="stack">
      <section class="card"><h2>Padrão de descrição por família</h2>
        <div class="kv" style="grid-template-columns:minmax(0,1fr) minmax(0,3fr)">${Object.entries(PAD_REGRAS).map(([k, r]) => `<div>${FAM_PAD[k]}</div><div class="code" style="text-align:left;font-weight:500;white-space:normal;overflow-wrap:anywhere;min-width:0">${esc(r)}</div>`).join('')}</div>
        <p class="sub" style="margin:10px 0 0">As fórmulas leem o nome (potência, rotação, tensão, arrefecimento, polos, série da bomba), por isso o padrão segue o formato que a planilha entende. Ao aplicar, o app troca o nome no insumo, nos kits com o mesmo nome e nas estruturas, e as propostas salvas passam a usar o nome novo quando forem abertas. Proposta de ${esc(PADRAO.gerado || '')}, feita a partir de catálogos e fichas de fabricantes (confiança alta = conferido na ficha; média = só formato e catálogo da série; baixa = há dúvida, confira antes).</p></section>
      <div class="sheetbar"><select id="padFam" aria-label="Família"><option value="">Todas as famílias</option>${famOpts}</select>
        <select id="padConf" aria-label="Confiança"><option value="">Toda confiança</option>${['alta', 'media', 'baixa'].map((c) => `<option${conf === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <select id="padSt" aria-label="Situação">${[['pendente', `Pendentes (${cont.pendente})`], ['feito', `Aplicados (${cont.feito})`], ['aviso', `Avisos (${cont.aviso})`], ['mudou', `Alterados à mão (${cont.mudou || 0})`], ['todos', 'Todos']].map(([k, l]) => `<option value="${k}"${sts === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input id="padQ" type="search" placeholder="Buscar nome ou código…" value="${esc(ui.padQ || '')}" aria-label="Buscar">
        ${ed ? `<button class="btn sm" data-padall>Marcar visíveis</button><button class="btn sm" data-padnone>Desmarcar visíveis</button><button class="btn sm pri" data-padapply${nSel ? '' : ' disabled'}>Aplicar marcadas (${nSel})</button>` : ''}</div>
      <p class="sub" id="padProg" style="margin:0">${rows.length} de ${PADRAO.itens.length} ${rows.length > 300 ? '· mostrando 300' : ''} · vêm desmarcados: confiança baixa e nomes que ficariam repetidos com preço diferente (a fórmula pegaria o primeiro).</p>
      <div class="tw" style="max-width:calc(100vw - 32px)"><table class="t"><thead><tr><th></th><th>Código</th><th>Atual → padronizado</th><th>Confiança</th><th>Motivo e fonte</th></tr></thead><tbody>${tr || '<tr><td colspan="5" class="sub">Nada neste filtro.</td></tr>'}</tbody></table></div>
    </div>`;
  }
  async function aplicarPadrao() {
    padColisoes();
    const list = PADRAO.itens.map((x) => ({ x, s: padStatus(x) })).filter(({ x, s }) => s.st === 'pendente' && padSel(x, s));
    if (!list.length) return toast('Nada marcado');
    const changes = list.map(({ x, s }) => ({ id: x.id, de: s.it.produto, produto: x.para, fab: x.fab || undefined, tipo: x.tipo || undefined }));
    const prog = $('#padProg');
    try {
      const ren = await REG.renameInsumos(changes, 'Padronização de ' + changes.length + ' descrição(ões)', (d, t) => { if (prog) prog.textContent = d + ' de ' + t + ' gravados…'; });
      if (Object.keys(ren).length) {
        const map = Object.assign({}, renomes(), ren);
        await REG.setTable('RENOMES', { map }, 'Nomes antigos → novos (' + Object.keys(ren).length + ')', []);
        // estruturas e tabelas que citam o nome do insumo
        for (const sh of ['MONTADOR', 'KIT HIDRÁULICA', 'KIT VÁLVULA ALÍVIO']) {
          const base = baseSheets[sh]; if (!base) continue; const over = REG.tabelas[sh] || {}; const ch = {};
          const cells = new Set([...Object.keys(base.cells), ...Object.keys(over)]);
          for (const a of cells) { const v = a in over ? over[a] : base.cells[a]; if (typeof v === 'string' && ren[v]) ch[a] = ren[v]; }
          if (Object.keys(ch).length) await REG.setCells(sh, ch, 'Padronização: ' + Object.keys(ch).length + ' referência(s) em ' + sh, baseOf(sh));
        }
      }
      ui.padSel = {}; toast(changes.length + ' descrição(ões) padronizada(s)'); render();
    } catch (e) { toast(errMsg(e)); }
  }
  document.addEventListener('change', (e) => {
    if (ui.view !== 'cadastro' || ui.cad !== 'padrao') return; const el = e.target;
    if (el.dataset.padsel) { ui.padSel = ui.padSel || {}; ui.padSel[el.dataset.padsel] = el.checked; render(); return; }
    if (['padFam', 'padConf', 'padSt'].includes(el.id)) { ui[el.id] = el.value; render(); }
  });
  document.addEventListener('click', (e) => {
    if (ui.view !== 'cadastro' || ui.cad !== 'padrao') return;
    const all = e.target.closest('[data-padall]'), none = e.target.closest('[data-padnone]');
    if (all || none) { ui.padSel = ui.padSel || {}; document.querySelectorAll('[data-padsel]').forEach((c) => { ui.padSel[c.dataset.padsel] = !!all; }); render(); return; }
    const ap = e.target.closest('[data-padapply]'); if (ap) { if (!ap.dataset.sure) { ap.dataset.sure = 1; ap.textContent = 'Confirmar: renomear ' + ap.textContent.replace(/\D+/g, '') + ' insumo(s)'; return; } ap.disabled = true; aplicarPadrao(); }
  });

  // ---- responsáveis por área (só o dono do app define) ----
  // e-mails de aviso (baixa e aprovação de desconto): editáveis por quem cuida de Sistema
  const AV_CAMPOS = [['financeiro', 'Financeiro', 'recebe o aviso da baixa e o pedido de aprovação'], ['engenharia', 'Engenharia', 'recebe o aviso da baixa para lançar o custo real'], ['diretoria', 'Diretoria', 'recebe o pedido de aprovação de desconto'], ['cc', 'Cópia', 'opcional, vai em todos'], ['link', 'Link do app', 'vai no texto do e-mail']];
  function avisosCard() {
    const cfg = Object.assign({ link: 'https://claude.ai/artifact/3pa3KFzGLean13jGE6PgSJ' }, ((REG.tabelas || {}).AVISOS || {}).cfg || {}); const ed = REG.areaOk('sistema');
    return `<section class="card"><h2>E-mails das áreas <span class="sub">usados na janela de e-mail da baixa e da aprovação</span></h2>
      <div class="fields">${AV_CAMPOS.map(([k, lb, d]) => `<div class="f span2"><label for="av_${k}">${lb}</label><input id="av_${k}" data-avcfg="${k}" value="${esc(cfg[k] || '')}" placeholder="${esc(d)}"${ed ? '' : ' disabled'}></div>`).join('')}</div>
      <p class="sub" style="margin:8px 0 0">Separe vários e-mails com vírgula.${ed ? '' : ' Só quem cuida de Sistema altera.'}</p></section>`;
  }
  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-avcfg]'); if (!el) return;
    const k = el.dataset.avcfg; const old = (((REG.tabelas || {}).AVISOS || {}).cfg || {});
    const cfg = Object.assign({}, old, { [k]: el.value.trim() });
    try { await REG.setTable('AVISOS', { cfg }, 'E-mails das áreas', [{ campo: (AV_CAMPOS.find((x) => x[0] === k) || [0, k])[1], de: old[k] || null, para: cfg[k] || null }]); toast('E-mail salvo'); } catch (er) { toast(errMsg(er)); }
  });
  const PAPEIS_AP = [['ap_diretoria', 'Diretoria', 'aprova desconto fora da política'], ['ap_financeiro', 'Financeiro', 'aprova desconto fora da política']];
  function vAcessos() {
    if (REG.mode !== 'shared') return avisosCard() + '<section class="card"><p class="sub" style="margin:0">Os responsáveis por área e os aprovadores valem no app compartilhado (claude.ai). Neste arquivo, quem abre edita e aprova tudo.</p></section>';
    const own = REG.isOwner; const ac = REG.acessos || {};
    const rows = AREAS.filter((a) => a[0] !== 'sistema').concat(PAPEIS_AP).map(([k, lb, d]) => `<tr><td><b>${esc(lb)}</b><br><small class="sub">${esc(d)}</small></td>
      <td>${(ac[k] || []).map((id) => `<span class="pchip"><span data-uid="${esc(id)}">…</span>${own ? `<button class="restore" data-acrm="${k}|${esc(id)}" aria-label="Remover">×</button>` : ''}</span>`).join(' ') || `<span class="sub">${/^ap_/.test(k) ? 'ninguém: qualquer Editor aprova' : 'ninguém (só o dono edita)'}</span>`}</td>
      <td>${own ? `<button class="btn sm" data-acadd="${k}">+ Pessoa</button>` : ''}</td></tr>`).join('');
    return `<div class="stack">
      <section class="card"><h2>Responsáveis por área</h2>
        <p class="sub" style="margin:0 0 10px">Cada área do cadastro só pode ser alterada por quem está nela. ${REG.areasConfiguradas() ? '' : '<b>Ainda não há ninguém definido: hoje todo Editor altera tudo.</b> Ao incluir a primeira pessoa, a trava passa a valer.'} O dono do app altera tudo.</p>
        <div class="tw"><table class="t"><thead><tr><th>Área</th><th>Pessoas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="sub" style="margin:10px 0 0">As duas últimas linhas são os aprovadores de desconto fora da política: cada pedido precisa do sim da Diretoria e do Financeiro.${own ? '' : ' Só o dono do app muda esta lista.'}</p></section>
      ${avisosCard()}
      <section class="card"><h2>Como dar acesso</h2><div class="kv" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
        <div>Comercial e vendedores</div><div style="text-align:left;font-weight:400">Compartilhe o app como <b>Contribuidor</b>: fazem e salvam propostas, anexam documentos e não alteram nenhum cadastro (o banco bloqueia).</div>
        <div>Custos, Engenharia, Fiscal, Precificação, Serviços</div><div style="text-align:left;font-weight:400">Compartilhe como <b>Editor</b> e inclua a pessoa na área acima. O app só libera a edição das áreas dela.</div>
        <div>Leitura</div><div style="text-align:left;font-weight:400">Como <b>Leitor</b>, a pessoa consulta propostas, margens e cadastro sem alterar nada.</div></div></section>
    </div>`;
  }
  async function acSave(mut, desc) { const a = JSON.parse(JSON.stringify(REG.acessos || {})); mut(a); try { await REG.setAcessos(a, desc); toast('Responsáveis atualizados'); } catch (e) { toast(errMsg(e)); } }
  document.addEventListener('click', (e) => {
    if (ui.view !== 'cadastro' || ui.cad !== 'acessos') return;
    const rm = e.target.closest('[data-acrm]'); if (rm) { const [k, id] = rm.dataset.acrm.split('|'); acSave((a) => { a[k] = (a[k] || []).filter((x) => x !== id); }, 'Responsável removido de ' + areaName(k)); return; }
    const ad = e.target.closest('[data-acadd]'); if (!ad) return; const k = ad.dataset.acadd;
    modal(`<h2>Incluir em ${esc(areaName(k))}</h2><input type="search" id="acQ" placeholder="Nome ou e-mail de alguém da organização" aria-label="Buscar pessoa" autocomplete="off"><div class="list" id="acList"><p class="sub">Digite para buscar.</p></div><div><button class="btn" data-close>Fechar</button></div>`, (o, close) => {
      let t; const q = $('#acQ', o);
      const go = async () => { const L = $('#acList', o); let hits = []; try { hits = REG.user && REG.user.search ? await REG.user.search(q.value.trim()) : []; } catch (er) { hits = []; }
        L.innerHTML = ''; if (!hits.length) { L.innerHTML = '<p class="sub">Ninguém encontrado.</p>'; return; }
        for (const h of hits.slice(0, 12)) { const row = document.createElement('div'); row.className = 'row'; const nm = document.createElement('b'); nm.textContent = h.name || 'Sem nome'; const b = document.createElement('button'); b.className = 'btn sm pri'; b.textContent = 'Incluir'; b.onclick = () => { close(); acSave((a) => { a[k] = [...new Set([...(a[k] || []), h.id])]; }, 'Responsável incluído em ' + areaName(k)); }; row.append(nm, b); L.appendChild(row); } };
      q.oninput = () => { clearTimeout(t); t = setTimeout(go, 250); }; q.onfocus = () => { if (!q.value) go(); }; q.focus();
    });
  });

  function vHistorico() {
    const q = (ui.histQ || '').trim().toLowerCase(); const T = ui.histT || '';
    const grupoH = (t) => /^(Proposta|Status|Alerta|Aprovação)/.test(t) ? 'propostas' : /^(Baixa|Custo real|Execução)/.test(t) ? 'margens' : /^Documento/.test(t) ? 'documentos' : /^Pedido/.test(t) ? 'pedidos' : /^Acessos/.test(t) ? 'acessos' : 'cadastro';
    const list = REG.historico.filter((h) => !T || grupoH(h.tipo || '') === T).filter((h) => !q || [h.tipo, h.desc, h.ref, ...(h.mudancas || []).map((m) => m.campo)].join(' ').toLowerCase().includes(q)).slice(0, 250);
    const items = list.map((h) => {
      const muds = h.mudancas || []; const many = muds.length > 12;
      return `<div class="hrow"><div class="hmeta"><b>${fmtAt(h.at)}</b><small>${who(h.by)}</small></div><div><div><span class="pill mute">${esc(h.tipo)}</span> ${esc(h.desc || '')} ${h.ref && !/^import$/.test(h.ref) && !String(h.ref).includes('!') && REG.insumos.some((x) => x.id === h.ref) ? `<button class="restore" data-ins="${esc(h.ref)}">abrir</button>` : ''}</div>
        ${muds.length ? `<table class="t mini"><tbody>${muds.slice(0, 12).map((m) => `<tr><td>${esc(m.campo)}</td><td class="n sub">${esc(fmtVal(m.de))}</td><td>→</td><td class="n"><b>${esc(fmtVal(m.para))}</b></td></tr>`).join('')}</tbody></table>${many ? `<small class="sub">+ ${muds.length - 12} alterações</small>` : ''}` : ''}</div></div>`;
    }).join('');
    return `<section class="card">
      <div class="sheetbar"><select id="histT" aria-label="Tipo">${[['', 'Tudo'], ['propostas', 'Propostas e alertas'], ['margens', 'Baixas e custo real'], ['documentos', 'Documentos'], ['pedidos', 'Pedidos de cadastro'], ['cadastro', 'Cadastro'], ['acessos', 'Acessos']].map(([k, l]) => `<option value="${k}"${T === k ? ' selected' : ''}>${l}</option>`).join('')}</select><input id="histQ" type="search" placeholder="Buscar no histórico…" value="${esc(ui.histQ || '')}" aria-label="Buscar no histórico" style="flex:1 1 260px"><span class="sub">${REG.mode === 'shared' ? 'Últimos 90 dias com alteração, de toda a equipe' : 'Alterações feitas neste navegador'}</span></div>
      <div class="hlist">${items || '<p class="sub">Nenhuma alteração registrada ainda. Tudo está com os valores da planilha REV21.</p>'}</div></section>`;
  }

  // ---- estruturas padrão (receita do MONTADOR) ----
  const MO = 'MONTADOR';
  const REC_COLS = { rot: 'B', estr: 'C', acion: 'D', bloco: 'E', fam: 'F', tipo: 'G', campo: 'H', pre: 'I', suf: 'J', qtd: 'K', regra: 'L' };
  const FAM_NICE = { CMB: 'Conjunto motobomba', SKID: 'Skid', CONTAINER: 'Container', ESPECIAL: 'Especial', JOCKEYPAINEL: 'Bomba jockey + painel', OEM: 'Fabricantes (OEM)' };
  const CORE_FAMS = ['CONJUNTO MOTOBOMBA', 'SKID', 'CONTAINER', 'ESPECIAL', 'BOMBA JOCKEY + PAINEL', 'FABRICANTES'];
  const niceName = (n) => String(n).charAt(0) + String(n).slice(1).toLowerCase();
  const famsEquip = () => { const out = []; for (let r = 5; r <= 18; r++) { const n = val('CODIFICAÇÃO', 'B' + r); if (!n) continue; const k = String(val('CODIFICAÇÃO', 'D' + r) || ''); out.push([k, FAM_NICE[k] || niceName(n), String(n), r]); } return out; };
  const FAMS = { find: (fn) => famsEquip().find(fn), filter: (fn) => famsEquip().filter(fn), map: (fn) => famsEquip().map(fn), get length() { return famsEquip().length; } };
  const famLabel = (k) => (FAMS.find((f) => f[0] === k) || [k, FAM_NICE[k] || k])[1];
  const famKey = (fam) => (FAMS.find((f) => f[2] === fam) || ['CMB'])[0];
  const NEAR = new Proxy({ CMB: 'SKID', SKID: 'CONTAINER', CONTAINER: 'SKID' }, { get: (o, k) => o[k] || 'CMB' });
  const estrList = () => String(val(MO, 'N91') || 'CMB,SKID,CONTAINER').split(',').map((x) => x.trim()).filter(Boolean);
  const ESTRSf = () => estrList().map((k) => [k, famLabel(k)]);
  const ACIONS = [['DIESEL', 'Conjunto diesel'], ['ELETRICA', 'Conjunto elétrico'], ['JOCKEY', 'Bomba jockey'], ['TODOS', 'Comum ao equipamento']];
  const TIPOS = [['MOTOR', 'O motor escolhido no item'], ['BOMBA', 'A bomba escolhida no item'], ['JOCKEY', 'A bomba jockey escolhida no item'], ['FAIXA', 'Tabela por potência do diesel'], ['CV', 'Tabela por potência elétrica'], ['VAZAO', 'Tabela por vazão (hidráulica)'], ['TAMANHO', 'Pelo porte do motor (1 a 9)'], ['FIXO', 'Sempre o mesmo insumo'], ['SPLIT', 'Só em bomba split case']];
  const QTDS = [['N', '1 por bomba'], ['N+1', '1 por bomba + 1'], ['2N', '2 por bomba'], ['4N', '4 por bomba']];
  const REGRAS = [['', 'Sempre'], ['SEM KIT MOTOR', 'Só se o motor não for kit'], ['SEM KIT BOMBA', 'Só se a bomba não for kit'], ['SÓ TROCADOR', 'Só motor com trocador de calor'], ['SÓ RADIADOR', 'Só motor com radiador'], ['OPCIONAL', 'Opcional: marcado no item']];
  const fxHead = (sheet, row, c0, n) => Array.from({ length: n }, (_, i) => String(val(sheet, numToCol(colToNum(c0) + i) + row) || '').replace(/^\d+\s*·\s*/, ''));
  const heads = () => ({ FAIXA: fxHead(MO, 156, 'D', 10), CV: fxHead(MO, 171, 'D', 4), VAZAO: fxHead('KIT HIDRÁULICA', 3, 'J', 8) });
  function recLines() {
    const out = [];
    for (let r = 92; r <= 151; r++) {
      const x = { r }; for (const [k, c] of Object.entries(REC_COLS)) { const v = val(MO, c + r); x[k] = v === null || v === undefined ? '' : v; }
      if (x.tipo === '' && x.rot === '') continue; out.push(x);
    }
    return out;
  }
  const estrOf = (x) => x.estr === 'TODOS' || x.estr === '' ? estrList() : String(x.estr).split('+');
  function origemTxt(x, H) {
    const col = (k) => H[k][(+x.campo || 1) - 1] || ('coluna ' + x.campo);
    switch (x.tipo) {
      case 'MOTOR': return x.acion === 'ELETRICA' ? 'O motor elétrico escolhido no item' : 'O motor diesel escolhido no item';
      case 'BOMBA': return 'A bomba escolhida no item';
      case 'JOCKEY': return 'A bomba jockey escolhida no item';
      case 'FAIXA': return 'Potência do diesel → ' + col('FAIXA');
      case 'CV': return 'Potência elétrica → ' + col('CV');
      case 'VAZAO': return 'Vazão → ' + col('VAZAO');
      case 'TAMANHO': return `"${x.pre}" + porte do motor${x.suf ? ` + "${x.suf}"` : ''}`;
      case 'FIXO': return 'Sempre: ' + x.campo;
      case 'SPLIT': return 'Só split case: ' + x.campo;
      default: return x.tipo;
    }
  }
  const qtdTxt = (q) => (QTDS.find((x) => x[0] === String(q)) || [0, `${q} por equipamento`])[1];
  const regraTxt = (g) => (REGRAS.find((x) => x[0] === g) || [0, g])[1];
  // sugestões da LS Pricer: nomes mais claros e opcionais com insumos que já estão no cadastro
  const SUGESTOES = [
    { id: 'nomes', t: 'Nomes mais claros nas linhas principais', d: 'O motor e a bomba deixam de se chamar "kit…" na lista: se é kit ou não, a regra já resolve.', ren: { 92: 'Motor diesel', 96: 'Bomba principal', 97: 'Bomba principal', 108: 'Válvula de liberação de ar', 112: 'Recirculação da carcaça', 132: 'Painel local (repetidor)' } },
    { id: 'nivel', t: 'Opcional: sensor de nível do tanque (alto e baixo)', d: 'Pedido comum em especificação de cliente. Insumo já cadastrado em 45.ACESSORIOSTANQUE.', add: { rot: 'Sensor de nível do tanque', estr: 'TODOS', acion: 'DIESEL', bloco: 'TERCEIROS', fam: '45.ACESSORIOSTANQUE', tipo: 'FIXO', campo: 'SENSOR DE NIVEL ALTO E BAIXO TORNATECH 1 1/2" - GSEFPI0637', qtd: 'N', regra: 'OPCIONAL' } },
    { id: 'manta', t: 'Opcional: manta térmica do escapamento', d: 'Proteção térmica do escape. Insumo já cadastrado em 41.OUTROS (motores de 5 e 6 cilindros).', add: { rot: 'Manta térmica do escapamento', estr: 'TODOS', acion: 'DIESEL', bloco: 'TERCEIROS', fam: '41.OUTROS', tipo: 'FIXO', campo: 'MANTA TÉRMICA MOTORES 5 E 6 CILINDROS', qtd: 'N', regra: 'OPCIONAL' } },
    { id: 'pintura', t: 'Opcional: pintura especial (Petrobras N-1731)', d: 'Para clientes de óleo e gás. Insumo já cadastrado em 35.PINTURAESPECIAL.', add: { rot: 'Pintura especial', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '35.PINTURAESPECIAL', tipo: 'FIXO', campo: 'PINTURA ESPECIAL PADRÃO PETROBRÁS N-1731', qtd: 1, regra: 'OPCIONAL' } },
    { id: 'teste', t: 'Opcional: teste de desempenho em fábrica com laudo', d: 'Cria o insumo "TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO" em 34.MAODEOBRA, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Teste de desempenho em fábrica', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '34.MAODEOBRA', tipo: 'FIXO', campo: 'TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO', qtd: 'N', regra: 'OPCIONAL' }, novo: { fam: '34.MAODEOBRA', produto: 'TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO', origem: 'NAC' } },
    { id: 'databook', t: 'Opcional: data book (manual, certificados e desenhos)', d: 'Cria o insumo "DATA BOOK TÉCNICO" em 41.OUTROS, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Data book técnico', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '41.OUTROS', tipo: 'FIXO', campo: 'DATA BOOK TÉCNICO', qtd: 1, regra: 'OPCIONAL' }, novo: { fam: '41.OUTROS', produto: 'DATA BOOK TÉCNICO', origem: 'NAC' } },
  ];
  const sugFeita = (sg, lines) => sg.ren ? Object.entries(sg.ren).every(([r, n]) => (lines.find((x) => x.r === +r) || {}).rot === n) : lines.some((x) => x.rot === sg.add.rot);
  const recChanges = (r, x) => { const ch = {}; for (const [k, c] of Object.entries(REC_COLS)) ch[c + r] = x[k] === '' || x[k] === undefined ? null : x[k]; return ch; };
  const baseOf = (sheet) => (a) => { const v = baseRaw(sheet, a); return v === undefined ? null : v; };

  function vEstruturas() {
    const est = estrList().includes(ui.estr) ? ui.estr : estrList()[0]; const H = heads(); const lines = recLines();
    const free = 151 - 91 - lines.length;
    const tabs = ESTRSf().map(([k, lb]) => `<button role="tab" aria-selected="${k === est}" data-estr="${k}">${lb}</button>`).join('') + (canEd() && estrList().length < FAMS.length ? '<button data-estrnew>+ Nova estrutura</button>' : '');
    const mine = lines.filter((x) => estrOf(x).includes(est));
    const groups = ACIONS.map(([k, lb]) => {
      const g = mine.filter((x) => (x.acion || 'TODOS') === k); if (!g.length) return '';
      return `<tr class="grp"><td colspan="6">${lb} <span class="sub">· ${g.length} componentes</span></td></tr>` + g.map((x) => `<tr class="click" data-recedit="${x.r}">
        <td><b>${esc(x.rot || '(sem nome)')}</b><br><small class="sub">${esc(x.fam)} · ${esc(x.bloco)}</small></td>
        <td>${esc(origemTxt(x, H))}</td><td>${esc(qtdTxt(x.qtd))}</td>
        <td>${x.regra ? `<span class="pill ${x.regra === 'OPCIONAL' ? 'mute' : 'warn'}">${esc(regraTxt(x.regra))}</span>` : ''}</td>
        <td>${x.estr === 'TODOS' ? '<span class="pill mute">todas</span>' : estrOf(x).map((e) => `<span class="pill mute">${esc(e)}</span>`).join(' ')}</td>
        <td><button class="btn sm" data-recedit="${x.r}">Editar</button></td></tr>`).join('');
    }).join('');
    const sug = SUGESTOES.map((sg) => { const done = sugFeita(sg, lines); return `<label class="sugrow${done ? ' done' : ''}"><input type="checkbox" data-sug="${sg.id}"${done ? ' disabled checked' : ''}><span><b>${esc(sg.t)}</b>${done ? ' <span class="pill ok">aplicada</span>' : ''}<br><small class="sub">${esc(sg.d)}</small></span></label>`; }).join('');
    const changed = Object.keys(REG.tabelas[MO] || {}).length + Object.keys(REG.tabelas['KIT HIDRÁULICA'] || {}).length;
    return `<div class="stack">
      <p class="sub" style="margin:0">A estrutura padrão diz o que entra em cada equipamento montado: quais componentes, de onde sai o insumo (o que foi escolhido no item, a tabela por porte ou um insumo fixo), quantos por bomba e em que condição. Toda proposta nova monta o item por aqui. ${free} linha(s) livre(s) de 60.</p>
      <div class="subtabs" role="tablist" aria-label="Estrutura">${tabs}</div>
      <div class="docbar"><button class="btn sm pri" data-recnew${canEd() && free > 0 ? '' : ' disabled'}>+ Novo componente</button>${changed ? `<span class="sub">${changed} alteração(ões) sobre a planilha</span><button class="btn sm" data-recreset>Voltar à estrutura da planilha</button>` : ''}</div>
      <div class="tw"><table class="t"><thead><tr><th>Componente</th><th>De onde sai o insumo</th><th>Quantidade</th><th>Condição</th><th>Vale para</th><th></th></tr></thead><tbody>${groups || '<tr><td colspan="6" class="sub">Nenhum componente nesta estrutura.</td></tr>'}</tbody></table></div>
      <section class="card"><h2>Sugestões <span class="sub">marque o que quiser aplicar; opcionais não entram no preço até serem marcados no item</span></h2>
        <div class="sugs">${sug}</div>
        <div class="docbar" style="margin-top:10px"><button class="btn sm pri" data-sugapply${canEd() ? '' : ' disabled'}>Aplicar as marcadas</button></div></section>
      <section class="card"><h2>Tabelas por porte <span class="sub">o insumo de cada faixa; vale para todas as estruturas</span></h2>
        <div class="subtabs" role="tablist">${[['FAIXA', 'Potência do diesel (HP)'], ['CV', 'Potência elétrica (CV)'], ['VAZAO', 'Vazão (hidráulica)']].map(([k, lb]) => `<button role="tab" aria-selected="${(ui.porte || 'FAIXA') === k}" data-porte="${k}">${lb}</button>`).join('')}</div>
        ${porteGrid(ui.porte || 'FAIXA')}</section>
      ${datalists()}
    </div>`;
  }
  function porteGrid(k) {
    const spec = { FAIXA: [MO, 156, 157, 166, 'B', 'M', ['B', 'C', 'D']], CV: [MO, 171, 172, 187, 'B', 'G', ['B', 'C']], VAZAO: ['KIT HIDRÁULICA', 3, 4, 32, 'A', 'Q', ['A']] }[k];
    const [sh, hr, r1, r2, c1, c2, numCols] = spec; const cols = []; for (let c = colToNum(c1); c <= colToNum(c2); c++) cols.push(numToCol(c));
    const ed = canEd(); const chg = REG.tabelas[sh] || {};
    const head = cols.map((c) => `<th>${esc(String(val(sh, c + hr) || '').replace(/^\d+\s*·\s*/, ''))}</th>`).join('');
    let body = '';
    for (let r = r1; r <= r2; r++) {
      if (val(sh, cols[0] + r) === null && val(sh, cols[1] + r) === null) continue;
      body += '<tr>' + cols.map((c) => {
        const a = c + r; const f = isFormulaBase(sh, a); const v = val(sh, a); const shown = v === null || v === undefined ? '' : typeof v === 'number' ? fmtPlain(v) : String(v);
        if (f || !ed) return `<td class="${a in chg ? 'chg' : ''}">${esc(shown)}</td>`;
        return `<td class="in ${a in chg ? 'over' : ''}"><input data-tcell="${esc(sh)}|${a}" data-num="${numCols.includes(c) ? 1 : ''}" value="${esc(shown)}"${numCols.includes(c) ? ' inputmode="decimal"' : ' list="dl_all"'} aria-label="${esc(sh)} ${a}"></td>`;
      }).join('') + '</tr>';
    }
    return `<div class="tw" style="margin-top:10px"><table class="t porte"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${k === 'VAZAO' ? '<p class="sub" style="margin:8px 0 0">Nesta tabela você muda as bitolas (colunas à esquerda); os nomes dos insumos à direita saem delas.</p>' : ''}`;
  }
  function recModal(r, preset) {
    const H = heads(); const isNew = !!preset;
    const x = preset || recLines().find((y) => y.r === r) || {};
    const opt = (list, cur) => list.map(([k, lb]) => `<option value="${esc(k)}"${String(cur) === String(k) ? ' selected' : ''}>${esc(lb)}</option>`).join('');
    const colOpts = (k) => H[k].map((h, i) => `<option value="${i + 1}"${String(x.campo) === String(i + 1) && x.tipo === k ? ' selected' : ''}>${esc(h)}</option>`).join('');
    const qIsNum = typeof x.qtd === 'number' || /^\d+$/.test(String(x.qtd));
    const ro = canEd() ? '' : ' disabled';
    modal(`<h2>${isNew ? 'Novo componente' : 'Componente da estrutura'}</h2>
      <div class="fields">
        <div class="f spanall"><label for="rRot">Nome do componente</label><input id="rRot" value="${esc(x.rot || '')}"${ro}></div>
        <div class="f"><label for="rAc">Conjunto</label><select id="rAc"${ro}>${opt(ACIONS, x.acion || 'TODOS')}</select></div>
        <div class="f"><label>Vale para</label><div class="chks">${ESTRSf().map(([k, lb]) => `<label class="chk"><input type="checkbox" data-rest="${k}"${estrOf(x).includes(k) ? ' checked' : ''}${ro}> ${esc(lb)}</label>`).join('')}</div></div>
        <div class="f"><label for="rFam">Família do cadastro</label><select id="rFam"${ro}>${famList().map((f) => `<option${f === x.fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div class="f"><label for="rBl">Bloco</label><select id="rBl"${ro}>${opt([['TERCEIROS', 'Terceiros (comprado)'], ['LS FIRE', 'LS Fire (fabricado)']], x.bloco || 'TERCEIROS')}</select></div>
        <div class="f spanall"><label for="rTipo">De onde sai o insumo</label><select id="rTipo"${ro}>${opt(TIPOS, x.tipo || 'FIXO')}</select></div>
        <div class="f spanall" data-tp="FAIXA"><label for="rFx">Coluna da tabela por potência do diesel</label><select id="rFx"${ro}>${colOpts('FAIXA')}</select></div>
        <div class="f spanall" data-tp="CV"><label for="rCv">Coluna da tabela por potência elétrica</label><select id="rCv"${ro}>${colOpts('CV')}</select></div>
        <div class="f spanall" data-tp="VAZAO"><label for="rVz">Coluna da tabela por vazão</label><select id="rVz"${ro}>${colOpts('VAZAO')}</select></div>
        <div class="f" data-tp="TAMANHO"><label for="rPre">Texto antes do porte</label><input id="rPre" value="${esc(x.pre || '')}"${ro}></div>
        <div class="f" data-tp="TAMANHO"><label for="rSuf">Texto depois do porte</label><input id="rSuf" value="${esc(x.suf || '')}"${ro}></div>
        <div class="f spanall" data-tp="FIXO SPLIT"><label for="rIns">Insumo</label><input id="rIns" list="dl_all" value="${esc(['FIXO', 'SPLIT'].includes(x.tipo) ? x.campo : '')}"${ro}></div>
        <div class="f"><label for="rQ">Quantidade</label><select id="rQ"${ro}>${opt(QTDS.concat([['FIX', 'Fixa por equipamento']]), qIsNum ? 'FIX' : (x.qtd || 'N'))}</select></div>
        <div class="f" data-q><label for="rQn">Quantas</label><input id="rQn" inputmode="decimal" value="${qIsNum ? esc(x.qtd) : '1'}"${ro}></div>
        <div class="f spanall"><label for="rRg">Condição</label><select id="rRg"${ro}>${opt(REGRAS, x.regra || '')}</select></div>
      </div>
      <p class="sub" id="rMsg" style="margin:0"></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${canEd() ? `<button class="btn pri" id="rSave">Salvar</button>${isNew ? '' : '<button class="btn" id="rDel">Excluir da estrutura</button>'}` : ''}<button class="btn" data-close>Fechar</button></div>
      ${datalists()}`, (o, close) => {
      const g = (s) => $(s, o);
      const sync = () => { const t = g('#rTipo').value; o.querySelectorAll('[data-tp]').forEach((el) => { el.hidden = !el.dataset.tp.split(' ').includes(t); }); g('[data-q]').hidden = g('#rQ').value !== 'FIX'; };
      g('#rTipo').onchange = sync; g('#rQ').onchange = sync; sync();
      const save = g('#rSave'); if (save) save.onclick = async () => {
        const t = g('#rTipo').value; const ests = [...o.querySelectorAll('[data-rest]:checked')].map((e) => e.dataset.rest);
        if (!g('#rRot').value.trim()) { g('#rMsg').textContent = 'Dê um nome ao componente.'; return; }
        if (!ests.length) { g('#rMsg').textContent = 'Marque ao menos uma estrutura em "Vale para".'; return; }
        const campo = { FAIXA: +g('#rFx').value, CV: +g('#rCv').value, VAZAO: +g('#rVz').value, FIXO: g('#rIns').value.trim(), SPLIT: g('#rIns').value.trim() }[t] ?? '';
        if (['FIXO', 'SPLIT'].includes(t) && !campo) { g('#rMsg').textContent = 'Escolha o insumo.'; return; }
        const qn = parseInput(g('#rQn').value, 'num');
        const nx = { rot: g('#rRot').value.trim(), estr: ests.length === estrList().length ? 'TODOS' : ests.join('+'), acion: g('#rAc').value, bloco: g('#rBl').value, fam: g('#rFam').value, tipo: t, campo,
          pre: t === 'TAMANHO' ? g('#rPre').value : '', suf: t === 'TAMANHO' ? g('#rSuf').value : '', qtd: g('#rQ').value === 'FIX' ? (typeof qn === 'number' ? qn : 1) : g('#rQ').value, regra: g('#rRg').value };
        try { await REG.setCells(MO, recChanges(x.r, nx), 'Estrutura: ' + nx.rot, baseOf(MO)); close(); toast('Estrutura salva: ' + nx.rot); if (['FIXO', 'SPLIT'].includes(t) && !REG.insumos.some((i) => i.produto === campo)) toast('Atenção: "' + campo + '" não está no cadastro de insumos; entra com custo zero.'); }
        catch (e) { g('#rMsg').textContent = errMsg(e); }
      };
      const del = g('#rDel'); if (del) del.onclick = async () => {
        if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); return; }
        try { const ch = {}; for (const c of Object.values(REC_COLS)) ch[c + x.r] = null; await REG.setCells(MO, ch, 'Estrutura: excluiu ' + x.rot, baseOf(MO)); close(); toast('Componente excluído da estrutura'); } catch (e) { g('#rMsg').textContent = errMsg(e); }
      };
    });
  }
  function estrNewModal(preset) {
    const free = FAMS.filter((f) => !estrList().includes(f[0]));
    modal(`<h2>Nova estrutura</h2>
      <div class="fields"><div class="f"><label for="nFam">Família do equipamento</label><select id="nFam">${free.map((f) => `<option value="${f[0]}"${f[0] === preset ? ' selected' : ''}>${esc(f[1])}</option>`).join('')}</select></div>
      <div class="f"><label for="nCopy">Começar com os componentes de</label><select id="nCopy">${ESTRSf().map(([k, lb]) => `<option value="${k}">${esc(lb)}</option>`).join('')}<option value="">Só os comuns a todas</option></select></div></div>
      <p class="sub" style="margin:0">Os componentes que valem para todas as estruturas entram sozinhos. Depois é só ajustar na lista.</p>
      <div style="display:flex;gap:8px"><button class="btn pri" id="nOk">Criar estrutura</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      $('#nOk', o).onclick = async () => {
        const k = $('#nFam', o).value, src = $('#nCopy', o).value; const ch = { N91: estrList().concat([k]).join(',') };
        if (src) for (const x of recLines()) if (x.estr !== 'TODOS' && estrOf(x).includes(src)) ch['C' + x.r] = x.estr + '+' + k;
        try { await REG.setCells(MO, ch, 'Nova estrutura: ' + famLabel(k), baseOf(MO)); ui.estr = k; close(); toast('Estrutura criada: ' + famLabel(k)); } catch (e) { toast(errMsg(e)); }
      };
    });
  }
  async function applySugs(ids) {
    const lines = recLines(); const used = new Set(lines.map((x) => x.r)); const ch = {}; const novos = []; const nomes = [];
    for (const sg of SUGESTOES.filter((s) => ids.includes(s.id))) {
      if (sg.ren) for (const [r, n] of Object.entries(sg.ren)) if (used.has(+r)) ch[REC_COLS.rot + r] = n;
      if (sg.add) { let r = 92; while (used.has(r) && r <= 151) r++; if (r > 151) break; used.add(r); Object.assign(ch, recChanges(r, sg.add)); }
      if (sg.novo && !REG.insumos.some((i) => i.produto === sg.novo.produto)) novos.push(sg.novo);
      nomes.push(sg.t);
    }
    for (const n of novos) { const { a, b } = REG.nextCode(n.fam); await REG.saveInsumo({ id: REG.newInsumoId(a, b), a, b, fam: n.fam, produto: n.produto, origem: n.origem }, true); }
    if (Object.keys(ch).length) await REG.setCells(MO, ch, 'Sugestões aplicadas: ' + nomes.join('; '), baseOf(MO));
    toast(nomes.length + ' sugestão(ões) aplicada(s)');
  }
  document.addEventListener('click', async (e) => {
    if (ui.view !== 'cadastro' || ui.cad !== 'estruturas') return;
    const t = e.target.closest('[data-estr]'); if (t) { ui.estr = t.dataset.estr; store.set(SK.view, ui); render(); return; }
    const pt = e.target.closest('[data-porte]'); if (pt) { ui.porte = pt.dataset.porte; render(); return; }
    const ed = e.target.closest('[data-recedit]'); if (ed) { recModal(+ed.dataset.recedit); return; }
    if (e.target.closest('[data-estrnew]')) { estrNewModal(); return; }
    if (e.target.closest('[data-recnew]')) { const used = new Set(recLines().map((x) => x.r)); let r = 92; while (used.has(r)) r++; if (r > 151) return toast('A receita já tem 60 linhas'); recModal(r, { r, rot: '', estr: ui.estr || 'CMB', acion: 'TODOS', bloco: 'TERCEIROS', fam: '', tipo: 'FIXO', campo: '', qtd: 'N', regra: '' }); return; }
    const rs = e.target.closest('[data-recreset]');
    if (rs) { if (!rs.dataset.sure) { rs.dataset.sure = 1; rs.textContent = 'Confirmar: desfazer todas as alterações da estrutura'; rs.classList.add('pri'); return; } try { await REG.resetSheet(MO); await REG.resetSheet('KIT HIDRÁULICA'); toast('Estrutura de volta à planilha'); } catch (err) { toast(errMsg(err)); } return; }
    if (e.target.closest('[data-sugapply]')) { const ids = [...document.querySelectorAll('[data-sug]:checked:not(:disabled)')].map((x) => x.dataset.sug); if (!ids.length) return toast('Marque ao menos uma sugestão'); try { await applySugs(ids); } catch (err) { toast(errMsg(err)); } }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target; if (!el.dataset || !el.dataset.tcell) return;
    const [sh, a] = el.dataset.tcell.split('|'); let v = el.value.trim(); if (el.dataset.num && v !== '') { const n = parseInput(v, 'num'); v = typeof n === 'number' ? n : v; }
    try { await REG.setCells(sh, { [a]: v === '' ? null : v }, 'Tabela por porte ' + sh + ' ' + a, baseOf(sh)); } catch (err) { toast(errMsg(err)); }
  });

  // ---- cadastros a partir das tabelas da planilha: parâmetros, listas, política, codificação, FCI ----
  const PA = 'PARÂMETROS', PO = 'POLÍTICA', CO = 'CODIFICAÇÃO';
  const listOf = (sheet, col, r1, r2) => { const o = []; for (let r = r1; r <= r2; r++) { const v = val(sheet, col + r); if (v !== null && v !== '' && v !== undefined) o.push(String(v)); } return o; };
  const PARAM_CARDS = {
    parametros: [
      { t: 'Tributos sobre a receita', rows: [['C5', 'PIS', 'pct'], ['C6', 'COFINS', 'pct'], ['C7', 'IRPJ / CSLL', 'pct'], ['C8', 'Alíquota interestadual de importados', 'pct'], ['C9', 'Limite de conteúdo importado (FCI)', 'pct']] },
      { t: 'Convênio ICMS 52/91', rows: [['C12', 'Aplicar automaticamente', ['SIM', 'NÃO']], ['C13', 'Carga efetiva — interestadual', 'pct'], ['C14', 'Carga efetiva — demais', 'pct']] },
      { t: 'Formação do preço', rows: [['C32', 'Modo padrão dos itens', ['FATOR (MARKUP)', 'MARGEM ALVO']], ['C33', 'Margem alvo padrão', 'pct'], ['C34', 'Margem mínima', 'pct'], ['C35', 'Fórmula da margem alvo', ['EXATA', 'ENCADEADA']], ['C17', 'Base da comissão', ['VENDA BRUTA', 'VENDA LÍQUIDA']], ['C23', 'Provisão de frete no resultado', 'pct']] },
      { t: 'Fatores e negociação', rows: [['C26', 'Fator de frete', 'pct'], ['C27', 'Fator de start-up', 'pct'], ['C30', 'Folga de negociação padrão', 'pct'], ['C39', 'Aplicar encargo financeiro do pagamento', ['SIM', 'NÃO']]] },
      { t: 'Start-up e visitas técnicas', rows: [['C28', 'Custo padrão por km (R$)', 'num'], ['C29', 'Valor padrão da diária (R$)', 'num']] },
      { t: 'Emitente', rows: [['C140', 'Razão social', 'text'], ['C141', 'CNPJ', 'text'], ['C142', 'Inscrição estadual', 'text'], ['C143', 'Regime tributário', 'text'], ['C144', 'Endereço', 'text'], ['C145', 'Contato', 'text']] },
    ],
    codificacao: [
      { t: 'Padrões da codificação', s: CO, rows: [['C66', 'Segmento padrão', () => listOf(CO, 'AB', 5, 13)], ['C67', 'Marca padrão', () => listOf(CO, 'Q', 5, 15)], ['C68', 'Tensão do painel quando é diesel', () => listOf(CO, 'N', 5, 16)], ['C69', 'Partida do painel quando é diesel', () => listOf(CO, 'X', 5, 14)]] },
    ],
  };
  const TABLES = {
    comissao: { t: 'Comissões', s: PA, r1: 19, r2: 21, cols: [['B', 'Tipo', 'text', 1], ['C', 'Taxa', 'pct']], note: 'Os tipos são escolhidos na proposta (comissão do vendedor e do agente).' },
    pagto: { t: 'Condições de pagamento', s: PA, r1: 41, r2: 75, key: 'B', cols: [['B', 'Condição', 'text'], ['C', 'Encargo financeiro', 'pct']] },
    ncm: { t: 'NCM e IPI', s: PA, r1: 110, r2: 126, key: 'C', cols: [['B', 'Descrição', 'text'], ['C', 'NCM', 'text'], ['D', 'IPI', 'pct'], ['E', 'Entra no Convênio 52/91?', ['SIM', 'NÃO']]] },
    unid: { t: 'Unidades de medida', s: PA, r1: 150, r2: 161, key: 'B', cols: [['B', 'Unidade', 'text'], ['C', 'Descrição', 'text'], ['D', 'Código na FCI', 'text']] },
    uf: { t: 'ICMS por UF', s: PA, r1: 79, r2: 105, cols: [['B', 'Estado', 'text', 1], ['D', 'UF', 'text', 1], ['C', 'Região', 'text', 1], ['E', 'Alíquota interna', 'pct'], ['F', 'Interestadual saindo de SC', 'pct'], ['G', 'DIFAL', 'pct', 1]] },
    segdesc: { t: 'Desconto por segmento', s: PO, r1: 7, r2: 12, cols: [['B', 'Segmento', 'text', 1], ['C', 'Desconto sobre a tabela', 'pct']] },
    polfam: { t: 'Famílias de produto', s: PO, r1: 17, r2: 39, key: 'B', cols: [['B', 'Família de produto', 'text'], ['C', 'Fator de tabela', 'num'], ['D', 'Margem bruta', 'pct', 1], ['E', 'Desconto do produto', 'pct'], ['F', 'Desc. máx. nacional', 'pct'], ['G', 'Desc. máx. importado', 'pct'], ['H', 'Piso nacional', 'num', 1]], note: 'O fator de tabela vezes o custo dá o preço de tabela; o piso é o fator mínimo depois do desconto máximo.' },
    config: { t: 'Configurações de bomba', s: CO, r1: 5, r2: 18, key: 'E', cols: [['E', 'Configuração', 'text'], ['F', 'Sigla', 'text']] },
    rot: { t: 'Rotações', s: CO, r1: 5, r2: 24, key: 'H', cols: [['H', 'RPM', 'num'], ['I', 'Sigla', 'text']] },
    norma: { t: 'Normas', s: CO, r1: 5, r2: 16, key: 'K', cols: [['K', 'Norma', 'text'], ['L', 'Sigla', 'text']] },
    tensao: { t: 'Tensões do painel', s: CO, r1: 5, r2: 16, key: 'N', cols: [['N', 'Tensão', 'text'], ['O', 'Sigla', 'text']] },
    marca: { t: 'Marcas', s: CO, r1: 5, r2: 15, key: 'Q', cols: [['Q', 'Marca', 'text'], ['R', 'Sigla', 'text']] },
    segcod: { t: 'Segmentos da codificação', s: CO, r1: 5, r2: 13, key: 'AB', cols: [['AB', 'Segmento', 'text']] },
    modcfg: { t: 'Configuração por modelo de bomba', s: CO, r1: 88, r2: 230, key: 'B', cols: [['B', 'Modelo da bomba', 'text'], ['C', 'Configuração', () => listOf(CO, 'E', 5, 18)]], note: 'O código do item lê a configuração (end suction, split case…) por aqui.' },
    fciuf: { t: 'Alíquota da saída para a FCI', s: 'FCI', r1: 6, r2: 32, cols: [['B', 'UF', 'text', 1], ['C', 'Contribuinte — conteúdo > 40%', 'pct'], ['D', 'Contribuinte — conteúdo ≤ 40%', 'pct'], ['E', 'Carga interna do destino', 'pct']] },
    valv: { t: 'Kits de válvula de alívio', s: 'KIT VÁLVULA ALÍVIO', r1: 2, r2: 37, key: 'A', cols: [['A', 'Descrição', 'text'], ['B', 'Tipo', ['ACE', 'NAC', 'IMP']], ['C', 'Marca', 'text'], ['D', 'Válvula (R$)', 'num'], ['E', 'Waste cone (R$)', 'num'], ['F', 'Custo total (R$)', 'num']] },
  };
  const SYS_LISTS = [['Cadastros fiscais', PA, 'C', 131, 133], ['Agentes', PA, 'D', 131, 133], ['Blocos', PA, 'E', 131, 133], ['Fretes', PA, 'F', 131, 133], ['Normas da proposta', PA, 'G', 131, 134], ['Segmentos da proposta', PA, 'B', 131, 136], ['Acionamentos', CO, 'T', 5, 15], ['Arrefecimentos', CO, 'V', 5, 14], ['Tipos de partida', CO, 'X', 5, 14], ['Tensões VCC', CO, 'Z', 5, 14]];
  const pctShow = (v) => typeof v === 'number' ? NF[2].format(v * 100).replace(/,00$/, '') : '';
  function cellCtl(sh, a, kind, label) {
    const v = val(sh, a); const ed = canEd(); const ch = (REG.tabelas[sh] || {}); const over = a in ch;
    const shown = kind === 'pct' ? pctShow(v) : v === null || v === undefined ? '' : typeof v === 'number' ? fmtPlain(v) : String(v);
    if (!ed) return `<span class="${over ? 'chgv' : ''}">${esc(kind === 'pct' && shown ? shown + '%' : shown) || '—'}</span>`;
    const list = typeof kind === 'function' ? kind() : Array.isArray(kind) ? kind : null;
    const data = `data-pcell="${esc(sh)}|${a}" data-kind="${list ? 'text' : kind}" aria-label="${esc(label)}"${over ? ' class="over"' : ''}`;
    if (list) return `<select ${data}><option value="">—</option>${list.map((o) => `<option${o === shown ? ' selected' : ''}>${esc(o)}</option>`).join('')}${shown && !list.includes(shown) ? `<option selected>${esc(shown)}</option>` : ''}</select>`;
    return `<input ${data} value="${esc(shown)}"${kind === 'text' ? '' : ' inputmode="decimal"'}${kind === 'pct' ? ' placeholder="%"' : ''}>`;
  }
  function paramCard(cd) {
    const sh = cd.s || PA;
    return `<section class="card"><h2>${esc(cd.t)}</h2><div class="fields">${cd.rows.map(([a, lb, kind]) => {
      const hint = sh === PA ? txt(PA, 'D' + a.slice(1)) : '';
      return `<div class="f${kind === 'text' && /Razão|Endereço|Contato/.test(lb) ? ' span2' : ''}"><label>${esc(lb)}</label><div class="ctl pctl">${cellCtl(sh, a, kind, lb)}${kind === 'pct' ? '<span class="unit">%</span>' : ''}</div>${hint ? `<small class="sub">${esc(hint)}</small>` : ''}</div>`;
    }).join('')}</div></section>`;
  }
  const keyOf = (T) => T.key || T.cols[0][0];
  function tableRows(T) { const rows = []; for (let r = T.r1; r <= T.r2; r++) { const k = val(T.s, keyOf(T) + r); if (k !== null && k !== undefined && k !== '') rows.push(r); } return rows; }
  function tableCard(id) {
    const T = TABLES[id]; const rows = tableRows(T); const ed = canEd(); const canAdd = ed && T.key && rows.length < T.r2 - T.r1 + 1;
    const extra = ui.tblAdd === id && canAdd ? (() => { let r = T.r1; const used = new Set(rows); while (used.has(r)) r++; return r; })() : 0;
    const tr = (r, isNew) => `<tr${isNew ? ' class="newrow"' : ''}>${T.cols.map(([c, lb, kind, ro]) => { const a = c + r; if (ro || isFormulaBase(T.s, a)) { const v = val(T.s, a); return `<td class="n">${esc(kind === 'pct' ? (typeof v === 'number' ? pctShow(v) + '%' : '') : kind === 'num' && typeof v === 'number' ? fmtNum(v, '0.0000') : fmtPlain(v))}</td>`; } return `<td class="in">${cellCtl(T.s, a, kind, lb)}</td>`; }).join('')}${ed && T.key ? `<td>${isNew ? '<span class="sub">preencha a 1ª coluna</span>' : `<button class="restore" data-rowdel="${id}|${r}">excluir</button>`}</td>` : ''}</tr>`;
    return `<section class="card"><h2>${esc(T.t)} <span class="sub">${rows.length} de ${T.r2 - T.r1 + 1}</span></h2>${T.note ? `<p class="sub" style="margin:0 0 10px">${esc(T.note)}</p>` : ''}
      <div class="tw"><table class="t reg"><thead><tr>${T.cols.map((x) => `<th>${esc(x[1])}</th>`).join('')}${ed && T.key ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((r) => tr(r)).join('')}${extra ? tr(extra, true) : ''}</tbody></table></div>
      ${canAdd && !extra ? `<div class="docbar" style="margin-top:10px"><button class="btn sm" data-rowadd="${id}">+ Adicionar</button></div>` : ''}</section>`;
  }
  async function rowDelete(id, r) {
    const T = TABLES[id]; const rows = tableRows(T).filter((x) => x !== r); const cols = T.cols.filter(([c, , , ro]) => !ro && !isFormulaBase(T.s, c + T.r1)).map((x) => x[0]);
    const vals = rows.map((q) => cols.map((c) => wb.raw(T.s, c + q)));
    if (id === 'polfam') { const nm = val(PO, 'B' + r); for (let q = 74; q <= 82; q++) if (val(CO, 'C' + q) === nm) return toast('Esta família de produto está ligada a uma família de equipamento; troque lá antes de excluir.'); }
    const ch = {}; for (let i = 0; i <= T.r2 - T.r1; i++) cols.forEach((c, j) => { ch[c + (T.r1 + i)] = i < vals.length ? (vals[i][j] === undefined ? null : vals[i][j]) : null; });
    try { await REG.setCells(T.s, ch, T.t + ': linha excluída', baseOf(T.s)); toast('Excluído'); } catch (e) { toast(errMsg(e)); }
  }
  // famílias de insumo: as que têm insumo + as criadas vazias (FAMILIAS no banco de tabelas)
  const famReg = () => REG.tabelas.FAMILIAS || {};
  function famInsumos() {
    const m = new Map();
    for (const x of REG.insumos) { if (!x.fam) continue; const e = m.get(x.fam) || { fam: x.fam, n: 0, semPreco: 0 }; e.n++; if (typeof x.valor !== 'number') e.semPreco++; m.set(x.fam, e); }
    for (const [code, v] of Object.entries(famReg())) { if (!v || !v.nome) continue; const fam = String(code).padStart(2, '0') + '.' + v.nome; if (![...m.keys()].some((f) => H.famCode(f) === +code)) m.set(fam, { fam, n: 0, semPreco: 0 }); }
    return [...m.values()].sort((a, b) => H.famCode(a.fam) - H.famCode(b.fam));
  }
  function vFamilias() {
    const ed = canEd(); const lines = recLines();
    const ins = famInsumos().map((x) => { const code = H.famCode(x.fam); const nome = x.fam.replace(/^\d+\./, ''); const d = (famReg()[code] || {}).desc || ''; const inRec = lines.filter((l) => l.fam === x.fam).length;
      return `<tr><td class="n">${String(code).padStart(2, '0')}</td><td><b>${esc(nome)}</b>${d ? `<br><small class="sub">${esc(d)}</small>` : ''}</td><td class="n">${x.n}${x.semPreco ? ` <span class="pill warn">${x.semPreco} sem preço</span>` : ''}</td><td class="n">${inRec || ''}</td><td>${ed ? `<button class="btn sm" data-famedit="${esc(x.fam)}">Editar</button>` : ''} <button class="btn sm" data-famins="${esc(x.fam)}">Ver insumos</button></td></tr>`; }).join('');
    const eq = famsEquip().map(([k, lb, nome, r]) => { const core = CORE_FAMS.includes(nome); const pf = (() => { for (let q = 74; q <= 82; q++) if (val(CO, 'B' + q) === nome) return txt(CO, 'C' + q); return ''; })();
      const reg = estrList().includes(k); const nm = modelos().filter((m) => m.estr === k).length;
      return `<tr><td><b>${esc(lb)}</b>${core ? '' : ' <span class="pill mute">nova</span>'}</td><td class="code">${esc(txt(CO, 'C' + r))}</td><td>${esc(pf) || '<span class="pill warn">sem família de produto</span>'}</td><td>${reg ? '<span class="pill ok">cadastrada</span>' : `<span class="pill warn">sem estrutura</span>`}</td><td class="n">${nm}</td><td>${ed ? `<button class="btn sm" data-eqedit="${r}">Editar</button>` : ''}</td></tr>`; }).join('');
    return `<div class="stack">
      <section class="card"><h2>Famílias de insumo <span class="sub">agrupam o cadastro de insumos; a montagem e o escopo escolhem o insumo pela família</span></h2>
        <div class="tw"><table class="t"><thead><tr><th>Código</th><th>Família</th><th>Insumos</th><th>Na estrutura</th><th></th></tr></thead><tbody>${ins}</tbody></table></div>
        ${ed ? '<div class="docbar" style="margin-top:10px"><button class="btn sm pri" data-famnew>+ Nova família de insumo</button></div>' : ''}</section>
      <section class="card"><h2>Famílias de equipamento <span class="sub">o que o item é: cada uma tem sigla no código, família de produto na política de preço e estrutura padrão</span></h2>
        <div class="tw"><table class="t"><thead><tr><th>Família</th><th>Sigla</th><th>Família de produto (política)</th><th>Estrutura</th><th>Modelos prontos</th><th></th></tr></thead><tbody>${eq}</tbody></table></div>
        ${ed && famsEquip().length < 9 ? '<div class="docbar" style="margin-top:10px"><button class="btn sm pri" data-eqnew>+ Nova família de equipamento</button></div>' : ''}</section>
    </div>`;
  }
  function famModal(fam) {
    const isNew = !fam; const code = isNew ? Math.max(0, ...famInsumos().map((x) => H.famCode(x.fam)).filter((n) => n < 99)) + 1 : H.famCode(fam);
    const nome = isNew ? '' : fam.replace(/^\d+\./, ''); const desc = (famReg()[code] || {}).desc || ''; const n = isNew ? 0 : (famInsumos().find((x) => x.fam === fam) || {}).n || 0;
    modal(`<h2>${isNew ? 'Nova família de insumo' : 'Família ' + esc(fam)}</h2>
      <div class="fields"><div class="f"><label for="fmCode">Código</label><input id="fmCode" value="${String(code).padStart(2, '0')}" ${isNew ? 'inputmode="numeric"' : 'disabled'}></div>
      <div class="f span2"><label for="fmNome">Nome (sem espaços, como no código do insumo)</label><input id="fmNome" value="${esc(nome)}" placeholder="EX.: VALVULARETENCAO"></div>
      <div class="f spanall"><label for="fmDesc">Descrição</label><input id="fmDesc" value="${esc(desc)}" placeholder="Para que serve, o que entra aqui"></div></div>
      ${!isNew && n ? `<p class="sub" style="margin:0">Renomear troca a família nos ${n} insumos dela e nas linhas da estrutura padrão. Propostas já salvas mantêm o nome antigo no escopo digitado à mão.</p>` : ''}
      <p class="sub" id="fmMsg" style="margin:0"></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="fmOk">Salvar</button>${!isNew && !n ? '<button class="btn" id="fmDel">Excluir família vazia</button>' : ''}<button class="btn" data-close>Fechar</button></div>`, (o, close) => {
      $('#fmOk', o).onclick = async () => {
        const c = parseInt($('#fmCode', o).value, 10); const nm = $('#fmNome', o).value.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
        if (!c || c < 1 || c > 98) { $('#fmMsg', o).textContent = 'Use um código de 1 a 98.'; return; }
        if (!nm) { $('#fmMsg', o).textContent = 'Dê um nome à família.'; return; }
        if (isNew && famInsumos().some((x) => H.famCode(x.fam) === c)) { $('#fmMsg', o).textContent = 'Já existe uma família com o código ' + c + '.'; return; }
        const nf = String(c).padStart(2, '0') + '.' + nm;
        try {
          if (!isNew && nf !== fam && n) { await REG.renameFamily(fam, nf); }
          await REG.setCells('FAMILIAS', { [c]: { nome: nm, desc: $('#fmDesc', o).value.trim() } }, 'Família ' + nf, () => null);
          if (!isNew && nf !== fam) { const ch = {}; for (const l of recLines()) if (l.fam === fam) ch['F' + l.r] = nf; if (Object.keys(ch).length) await REG.setCells(MO, ch, 'Estrutura: família renomeada para ' + nf, baseOf(MO)); }
          close(); toast(isNew ? 'Família criada: ' + nf : 'Família salva: ' + nf);
        } catch (e) { $('#fmMsg', o).textContent = errMsg(e); }
      };
      const d = $('#fmDel', o); if (d) d.onclick = async () => { try { await REG.setCells('FAMILIAS', { [code]: null }, 'Família excluída ' + fam, () => null); close(); toast('Família excluída'); } catch (e) { $('#fmMsg', o).textContent = errMsg(e); } };
    });
  }
  function eqModal(r) {
    const isNew = !r; const used = new Set(famsEquip().map((x) => x[3])); if (isNew) { r = 5; while (used.has(r)) r++; }
    const nome = isNew ? '' : txt(CO, 'B' + r); const core = CORE_FAMS.includes(nome);
    let pr = 0; for (let q = 74; q <= 82; q++) if (nome && val(CO, 'B' + q) === nome) pr = q;
    const prods = listOf(PO, 'B', 17, 39);
    modal(`<h2>${isNew ? 'Nova família de equipamento' : esc(famLabel(String(val(CO, 'D' + r))))}</h2>
      <div class="fields"><div class="f span2"><label for="eqNome">Nome</label><input id="eqNome" value="${esc(nome)}" placeholder="EX.: CASA DE BOMBAS"${core ? ' disabled' : ''}></div>
      <div class="f"><label for="eqSig">Sigla no código</label><input id="eqSig" value="${esc(txt(CO, 'C' + r))}" placeholder="3 letras"></div>
      <div class="f spanall"><label for="eqProd">Família de produto na política de preço</label><select id="eqProd">${prods.map((p) => `<option${pr && txt(CO, 'C' + pr) === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>
      ${core ? '<p class="sub" style="margin:0">O nome das famílias de origem da planilha fica fixo: as fórmulas dependem dele.</p>' : ''}
      ${isNew ? '<p class="sub" style="margin:0">Depois de criar, cadastre a estrutura dela em Estruturas (o app avisa no item enquanto não houver).</p>' : ''}
      <p class="sub" id="eqMsg" style="margin:0"></p>
      <div style="display:flex;gap:8px"><button class="btn pri" id="eqOk">Salvar</button><button class="btn" data-close>Fechar</button></div>`, (o, close) => {
      $('#eqOk', o).onclick = async () => {
        const nm = core ? nome : $('#eqNome', o).value.trim().toUpperCase(); const sg = $('#eqSig', o).value.trim().toUpperCase(); const pf = $('#eqProd', o).value;
        if (!nm || !sg) { $('#eqMsg', o).textContent = 'Preencha o nome e a sigla.'; return; }
        if (!core && famsEquip().some((x) => x[2] === nm && x[3] !== r)) { $('#eqMsg', o).textContent = 'Já existe uma família com esse nome.'; return; }
        let q = pr; if (!q) { q = 74; while (q <= 82 && val(CO, 'B' + q)) q++; } if (q > 82) { $('#eqMsg', o).textContent = 'A tabela de famílias da política está cheia (9).'; return; }
        try { await REG.setCells(CO, { ['B' + r]: nm, ['C' + r]: sg, ['B' + q]: nm, ['C' + q]: pf }, 'Família de equipamento ' + nm, baseOf(CO)); close(); toast('Família de equipamento salva: ' + nm); } catch (e) { $('#eqMsg', o).textContent = errMsg(e); }
      };
    });
  }
  const divh = (d, t) => `<h3 class="divh"><span class="divb ${d.toLowerCase()}">${d}</span> ${esc(t)}</h3>`;
  const pcard = (t) => paramCard(PARAM_CARDS.parametros.find((c) => c.t === t));
  function vParamTab(tab) {
    const groups = {
      fiscal: () => divh('SEQ', 'Equipamentos') + pcard('Tributos sobre a receita') + pcard('Convênio ICMS 52/91') + ['ncm', 'uf', 'fciuf'].map(tableCard).join('') + divh('SPV', 'Serviços e pós-venda') + SPV.cfgSec('fiscal', canEd()),
      preco: () => divh('SEQ', 'Equipamentos') + pcard('Formação do preço') + pcard('Fatores e negociação') + ['polfam', 'segdesc', 'comissao', 'pagto'].map(tableCard).join('') + divh('SPV', 'Serviços e pós-venda') + SPV.cfgSec('preco', canEd()),
      servicos: () => divh('SPV', 'Serviços e pós-venda') + SPV.cfgSec('servicos', canEd()) + divh('SEQ', 'Start-up de equipamentos') + pcard('Start-up e visitas técnicas'),
      geral: () => pcard('Emitente') + tableCard('unid') + SPV.cfgSec('geral', canEd()),
      codificacao: () => PARAM_CARDS.codificacao.map(paramCard).join('') + ['config', 'rot', 'norma', 'tensao', 'marca', 'segcod', 'modcfg'].map(tableCard).join('')
        + `<section class="card"><h2>Listas do sistema <span class="sub">só leitura: as fórmulas comparam estes nomes</span></h2><div class="syslists">${SYS_LISTS.map(([t, sh, c, a, b]) => `<div><b>${esc(t)}</b><div>${listOf(sh, c, a, b).map((x) => `<span class="pill mute">${esc(x)}</span>`).join(' ')}</div></div>`).join('')}</div></section>`,
    };
    return `<div class="stack">${groups[tab]()}</div>`;
  }
  document.addEventListener('change', async (e) => {
    const el = e.target; if (!el.dataset || !el.dataset.pcell) return;
    const [sh, a] = el.dataset.pcell.split('|'); let v = el.value.trim(); const k = el.dataset.kind;
    if (v !== '' && (k === 'pct' || k === 'num')) { const n = parseInput(v, 'num'); if (typeof n !== 'number') { toast('Número inválido: ' + v); return render(); } v = k === 'pct' ? n / 100 : n; }
    const ch = { [a]: v === '' ? null : v };
    if (sh === PO && a[0] === 'B') { const old = val(PO, a); if (old) for (let q = 74; q <= 82; q++) if (val(CO, 'C' + q) === old) await REG.setCells(CO, { ['C' + q]: v }, 'Família de produto renomeada', baseOf(CO)).catch(() => {}); }
    try { await REG.setCells(sh, ch, (sh === PA ? 'Parâmetros' : sh) + ' ' + a, baseOf(sh)); if (ui.tblAdd) ui.tblAdd = null; } catch (err) { toast(errMsg(err)); }
  });
  document.addEventListener('click', (e) => {
    if (ui.view !== 'cadastro') return;
    const ad = e.target.closest('[data-rowadd]'); if (ad) { ui.tblAdd = ad.dataset.rowadd; render(); const inp = document.querySelector('tr.newrow input, tr.newrow select'); if (inp) inp.focus(); return; }
    const dl = e.target.closest('[data-rowdel]'); if (dl) { if (!dl.dataset.sure) { dl.dataset.sure = 1; dl.textContent = 'confirmar'; return; } const [id, r] = dl.dataset.rowdel.split('|'); rowDelete(id, +r); return; }
    const fe = e.target.closest('[data-famedit]'); if (fe) { famModal(fe.dataset.famedit); return; }
    if (e.target.closest('[data-famnew]')) { famModal(null); return; }
    const fi = e.target.closest('[data-famins]'); if (fi) { ui.cad = 'insumos'; ui.insFam = fi.dataset.famins; store.set(SK.view, ui); render(); return; }
    const ee = e.target.closest('[data-eqedit]'); if (ee) { eqModal(+ee.dataset.eqedit); return; }
    if (e.target.closest('[data-eqnew]')) { eqModal(0); return; }
  });
  // ---- demais tabelas (grade) ----
  function vTabelas() {
    const S = TABLE_SHEETS.includes(ui.table) ? ui.table : 'PARÂMETROS'; ui.table = S; const sh = baseSheets[S];
    const readOnly = REGISTRY_SHEETS.has(S) || !canEd();
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
        ${nchg && canEd() ? '<button class="btn sm" id="bResetTable">Voltar aos valores da planilha</button>' : ''}
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
    if (tab === 'acessos') fillNames($('#app'));
    const ao = $('[data-areaown]'); if (ao && REG.areasConfiguradas()) { const ids = (REG.acessos || {})[ao.dataset.areaown] || []; if (ids.length) REG.names(ids).then((n) => { const el = $('[data-areaown]'); if (el) el.textContent = ids.map((i) => n[i] || 'alguém').join(', '); }); }
    if (tab === 'tabelas') bindGrid();
    if (tab === 'importar') bindImportar();
    const deb = (id, key) => { const el = $('#' + id); if (!el) return; let t; el.oninput = () => { clearTimeout(t); t = setTimeout(() => { ui[key] = el.value; render(); const f = $('#' + id); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 250); }; };
    deb('insQ', 'insQ'); deb('kitQ', 'kitQ'); deb('histQ', 'histQ'); deb('padQ', 'padQ');
    const fam = $('#insFam'); if (fam) fam.onchange = () => { ui.insFam = fam.value; render(); };
    const sem = $('#insSem'); if (sem) sem.onchange = () => { ui.insSem = sem.checked; render(); };
    const ht = $('#histT'); if (ht) ht.onchange = () => { ui.histT = ht.value; render(); };
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

  // ---------- fotografia da formação (para margens e fechamento) ----------
  const MEM_KEYS = { custoMat: 'Custo do conjunto de peças e materiais', custoFab: 'Custos dos serviços de fabricação', custoStartup: 'Custos de Startup', custoFrete: 'Custos dos fretes', custo: 'TOTAL CUSTOS',
    icmsPct: 'ICMS', pisCofinsPct: 'PIS/COFINS', irPct: 'IR/CSLL', impostosPct: 'TOTAL IMPOSTOS (sem o IPI)', comissaoPct: 'TOTAL COMISSÃO', margemPct: 'Margem Liquida',
    venda: 'Preço de venda com impostos — SEM IPI (total)', qtd: 'Quantidade', ipiPct: 'IPI (%)', comExtPct: 'Comissão de 3os externos', comIntPct: 'Comissão de 3os internos', ipi: 'IPI (R$)', vendaIpi: 'Preço de venda com impostos e COM IPI (total)', impostos: 'Impostos', comissao: 'Comissão', margem: 'Margem líquida', ci: 'Conteúdo de importação (CI)' };
  function memRows() { const m = {}; for (let r = 3; r <= 38; r++) { const lb = txt('MEMORIAL', 'B' + r); for (const [k, l] of Object.entries(MEM_KEYS)) if (lb === l && !m[k]) m[k] = r; } return m; }
  function seqSnapshot() {
    const rows = memRows(); const n = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
    const pick = (col) => Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, n(val('MEMORIAL', col + r))]));
    const itens = [];
    ITEMS.forEach((S, i) => {
      if (!filled(S)) return;
      const m = pick(numToCol(3 + i)); const fam = String(val(S, 'AR2') || 'CMB');
      const linhas = [];
      for (const x of montLines(S)) { const r = x.r; const c = n(val(S, 'H' + r)); if (!c && !txt(S, 'D' + r)) continue; linhas.push({ k: 'm' + r, grupo: x.acion, rot: x.rot, fam: txt(S, 'C' + r), desc: txt(S, 'D' + r), qtd: n(val(S, 'F' + r)), unit: n(val(S, 'G' + r)), custo: c, ori: txt(S, 'AB' + r) }); }
      for (const x of hiddenLines(S)) linhas.push({ k: 'h' + x.rot, grupo: x.acion, rot: x.rot, fam: x.fam || '', desc: x.desc, qtd: n(x.qtd), unit: n(x.unit), custo: n(x.tot), ori: x.ori || '' });
      for (let r = 68; r <= 112; r++) { if (!txt(S, 'D' + r) && !n(val(S, 'H' + r))) continue; linhas.push({ k: 'e' + r, grupo: 'ESCOPO', rot: txt(S, 'C' + r), fam: txt(S, 'C' + r), desc: txt(S, 'D' + r), qtd: n(val(S, 'F' + r)), unit: n(val(S, 'G' + r)), custo: n(val(S, 'H' + r)), ori: txt(S, 'AB' + r) }); }
      const qtd = m.qtd || 1;
      // as linhas são de uma unidade e já trazem a mão de obra de fabricação; start-up e frete entram como linhas próprias
      if (m.custoStartup) linhas.push({ k: 'startup', grupo: 'SERVIÇOS', rot: 'Start-up', desc: 'Start-up', qtd: 1, unit: m.custoStartup / qtd, custo: m.custoStartup / qtd });
      if (m.custoFrete) linhas.push({ k: 'frete', grupo: 'SERVIÇOS', rot: 'Frete', desc: 'Frete', qtd: 1, unit: m.custoFrete / qtd, custo: m.custoFrete / qtd });
      const ro = rows.custoMat ? (() => { for (let r = 3; r <= 38; r++) if (txt('MEMORIAL', 'B' + r) === 'Origem do conjunto') return txt('MEMORIAL', numToCol(3 + i) + r); return ''; })() : '';
      const pol = { fatorTabela: n(val(S, 'P20')), descMax: n(val(S, 'P24')), piso: n(val(S, 'P25')), fatorAplicado: n(val(S, 'P23')), pisPct: n(val(PA, 'C5')), cofinsPct: n(val(PA, 'C6')) };
      itens.push(Object.assign(pol, { n: S, origem: ro, nome: txt(S, 'C28') || txt('PROPOSTA', 'C' + (20 + i)) || S, codigo: txt(S, 'C27'), familia: fam, familiaNome: famLabel(fam), linhas }, m, { qtd }));
    });
    const T = pick('M');
    return { div: 'SEQ', venda: T.venda, vendaIpi: T.vendaIpi, custo: T.custo, impostos: T.impostos, comissao: T.comissao, margem: T.margem, margemPct: T.margemPct, minimo: n(val(PA, 'C34')), itens };
  }
  // fotografia de qualquer proposta salva, sem mexer na que está aberta
  function snapshotOf(p) {
    if (p.div === 'SPV' && p.spv) return SPV.snapshot(p.spv);
    if (p.facts) return FX.snapshot(p.facts);
    const doc = JSON.parse(JSON.stringify(p.doc || {})); migrar(doc);
    const keep = wb; const w2 = new Workbook(MODEL); REG.applyTo(w2); w2.applyDoc(doc);
    wb = w2; listCache = new Map();
    try { return seqSnapshot(); } finally { wb = keep; listCache = new Map(); }
  }
  const resumoOf = (snap) => ({ venda: snap.venda, custo: snap.custo, impostos: snap.impostos, comissao: snap.comissao, margem: snap.margem, margemPct: snap.margemPct, minimo: snap.minimo,
    itens: snap.itens.map((x) => ({ nome: x.nome, familia: x.familia, familiaNome: x.familiaNome, qtd: x.qtd, venda: x.venda, custo: x.custo, margem: x.margem, margemPct: x.margemPct })) });

  // ---------- propostas: nova, salvar, abrir, exportar ----------
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function modal(html, bind) {
    const o = $('#overlay'); o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="card">${html}</div></div>`;
    const close = () => { o.innerHTML = ''; };
    o.querySelector('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal') || e.target.closest('[data-close]')) close(); });
    bind && bind(o, close);
  }
  function loadDoc(doc, name, id, extra) { state = Object.assign({ id: id || null, uid: newUid(), div: 'SEQ', status: 'rascunho', doc: JSON.parse(JSON.stringify(doc || {})), name: name || '' }, extra || {}); build(); persist(); dlMap = null; ui.item = 0; render(); }
  function docTitle() {
    if (isSpv()) return [state.spv.numero, state.spv.cliente].filter(Boolean).join(' · ') || 'SPV sem nome';
    if (isFacts()) return ['FACTS', state.facts.numero, state.facts.cliente].filter(Boolean).join(' · ');
    const n = txt('PROPOSTA', 'C5'), c = txt('PROPOSTA', 'F5'); return [n, c].filter(Boolean).join(' · ') || 'Proposta sem nome';
  }
  // abre (ou duplica) uma proposta salva, SEQ ou SPV
  function openProposta(p, dup) {
    const keepId = dup ? null : (p.local && REG.mode === 'shared' ? null : p.id);
    const extra = { uid: dup || !p.uid ? newUid() : p.uid, status: dup ? 'rascunho' : (p.status || 'rascunho'), ack: dup ? {} : (p.ack || {}) };
    if (p.div === 'SPV' && p.spv) {
      const spv = JSON.parse(JSON.stringify(p.spv)); if (dup) { spv.numero = ''; spv.status = 'rascunho'; spv.data = new Date().toISOString().slice(0, 10); }
      loadDoc({}, p.name, keepId, Object.assign(extra, { div: 'SPV', spv }));
    } else if (p.facts) {
      const facts = JSON.parse(JSON.stringify(p.facts)); if (dup) facts.numero = '';
      loadDoc({}, p.name, keepId, Object.assign(extra, { div: 'SEQ', sol: 'FACTS', facts }));
    } else loadDoc(p.doc, p.name, keepId, extra);
    if (dup && !isSpv() && !isFacts()) { if (state.doc.PROPOSTA) delete state.doc.PROPOSTA.C5; build(); persist(); }
    dirty = !!dup; ui.step = 1; ui.propFull = false; setView('proposta');
    toast(dup ? 'Cópia criada: dê um número novo e salve' : 'Aberto: ' + (p.name || docTitle()));
  }
  const logEv = (e) => REG.log(e);
  const PD = window.PricerPedidos({ REG, esc, brl, modal, toast, parseInput, ui, render, getState: () => state, docTitle, famList: () => famList(), fillNames: (o) => fillNames(o), log: logEv });
  const FX = window.PricerFacts({ REG, esc, brl, pct, NF, toast, parseInput, val, txt, ui, render, modal, getState: () => state,
    setState: (s) => { state = Object.assign({ doc: {} }, s); build(); persist(); dirty = true; }, persist: () => { persist(); dirty = true; }, get SPV() { return SPV; } });
  const MG = window.PricerMargens({ REG, esc, brl, pct, NF, modal, toast, parseInput, ui, render, log: logEv, snapshotOf: (p) => snapshotOf(p), resumoOf: (x) => resumoOf(x), get SPV() { return SPV; } });
  // nova proposta SEQ; com a família, já abre o item 01 nela
  function newSeq(fam) { loadDoc({}, ''); ui.propFull = false;
    if (fam) { commit('ITEM 01', 'C21', fam); ui.item = 0; ui.itemFull = false; ui.simple = true; setView('item'); toast('Proposta SEQ nova · ' + (FAM_SEQ_LB[fam] || fam)); return; }
    ui.step = 1; setView('proposta'); toast('Proposta SEQ em branco'); }
  const FAM_CURTO = { 'CONJUNTO MOTOBOMBA': 'CMB · Conjunto motobomba', SKID: 'SKD · Skid', CONTAINER: 'CON · Container', ESPECIAL: 'ESP · Especial', 'BOMBA JOCKEY + PAINEL': 'CMB · Jockey + painel' };
  const famsHome = () => famsEquip().filter((f) => f[2] !== 'FABRICANTES').map(([k, lb, fam]) => ({ fam, lb: FAM_CURTO[fam] || FAM_SEQ_LB[fam] || lb, titulo: FAM_SEQ_LB[fam] || lb }));
  const SPV = window.PricerSPV({ famsHome: () => famsHome(), etapasHtml: (p) => MG.etapasHtml(p), etapaPendente: (p, k) => MG.etapaPendente(p, k), proximo: (p) => MG.proximo(p), situacao: (p) => MG.situacao(p), aprovHtml: () => aprovLinha({ aprov: aprovInfo() }), REG, esc, brl, pct, fmtNum, NF, modal, toast, parseInput, txt, val, docTitle, newSeq, openProposta, ui, render, fechar: (p) => MG.fecharModal(p), log: (e) => REG.log(e), home: () => PD.cardHome(), insumos: () => REG.insumos,
    getState: () => state, setState: (s) => { state = Object.assign({ doc: {} }, s); build(); persist(); dirty = true; },
    persist: () => { persist(); dirty = true; },
    current: () => { if (isSpv()) return { div: 'SPV', label: docTitle(), total: SPV.total() }; if (isFacts()) return { div: 'SEQ', label: docTitle(), total: FX.total() }; const n = txt('PROPOSTA', 'C5'), c = txt('PROPOSTA', 'F5'); return n || c ? { div: 'SEQ', label: docTitle(), total: val('PROPOSTA', 'P43') } : null; } });

  $('#bMode').onclick = () => { ui.simple = !ui.simple; ui.propFull = false; ui.itemFull = false; store.set(SK.view, ui); render(); window.scrollTo(0, 0); };
  $('#bNew').onclick = () => modal(`<h2>Nova proposta</h2><p class="sub">A proposta atual continua salva se você já clicou em Salvar. Alterações não salvas se perdem.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mBlank">SEQ em branco</button><button class="btn pri" id="mSpv">SPV (serviço, peças, contrato)</button><button class="btn" id="mExample">Exemplo SEQ (Cocamar)</button><button class="btn" data-close>Cancelar</button></div>`,
    (o, close) => { $('#mBlank', o).onclick = () => { close(); newSeq(); }; $('#mSpv', o).onclick = () => { close(); setView('inicio'); const t = document.querySelector('.tchips'); if (t) t.scrollIntoView({ block: 'center' }); toast('Escolha o tipo de SPV'); }; $('#mExample', o).onclick = () => { close(); loadDoc(MODEL.example, ''); setView('proposta'); toast('Exemplo carregado'); }; });

  $('#bSave').onclick = async () => {
    const id = state.id || ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
    const base = { name: docTitle(), at: new Date().toISOString(), uid: state.uid, status: state.status || 'rascunho' };
    const p = isSpv() ? Object.assign(base, { div: 'SPV', tipo: state.spv.tipo, numero: state.spv.numero, cliente: state.spv.cliente, total: SPV.total(), spv: state.spv })
      : isFacts() ? Object.assign(base, { div: 'SEQ', tipo: 'FAC', sol: 'FACTS', numero: state.facts.numero, cliente: state.facts.cliente, total: FX.total(), facts: state.facts })
      : Object.assign(base, { div: 'SEQ', numero: txt('PROPOSTA', 'C5'), cliente: txt('PROPOSTA', 'F5'), total: val('PROPOSTA', 'P43'), doc: state.doc || {} });
    if (typeof p.total !== 'number') delete p.total;
    if (state.ack && Object.keys(state.ack).length) p.ack = state.ack;
    try { p.resumo = resumoOf(isSpv() ? SPV.snapshot(state.spv) : isFacts() ? FX.snapshot(state.facts) : seqSnapshot()); } catch (e) { /* segue sem resumo */ }
    try { const novo = !state.id; const where = await REG.saveProposta(id, p); state.id = id; persist(); dirty = false; toast((where === 'shared' ? 'Salvo para a equipe: ' : 'Salvo neste navegador: ') + docTitle());
      logEv({ tipo: novo ? 'Proposta criada' : 'Proposta salva', ref: id, desc: docTitle() + ' · ' + (p.div || 'SEQ') + (p.tipo ? ' ' + p.tipo : ''), mudancas: [{ campo: 'Total', de: null, para: typeof p.total === 'number' ? p.total : null }, { campo: 'Margem', de: null, para: p.resumo ? p.resumo.margemPct : null }] }); }
    catch (err) { toast(errMsg(err)); }
  };

  $('#bOpen').onclick = () => {
    const list = REG.listPropostas();
    const shared = REG.mode === 'shared';
    const rows = list.map((p) => `<div class="row"><div style="min-width:0"><span class="divb ${p.div === 'SPV' ? 'spv' : 'seq'}">${p.div || 'SEQ'}</span> <b>${esc(p.name)}</b><br><small>${fmtAt(p.at)} · ${typeof p.total === 'number' ? brl(p.total) : '—'}${shared && !p.local ? ' · ' + who(p.by) : ''}${p.local ? ' · <span class="pill mute">neste navegador</span>' : ''}</small></div><div style="display:flex;gap:6px"><button class="btn sm pri" data-open="${esc(p.id)}">Abrir</button><button class="btn sm" data-del="${esc(p.id)}">Excluir</button></div></div>`).join('')
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
      o.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { close(); openProposta(byId[b.dataset.open], false); });
      o.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; b.classList.add('pri'); return; }
        const p = byId[b.dataset.del];
        try { await REG.deleteProposta(p.id, !!p.local); logEv({ tipo: 'Proposta excluída', ref: p.id, desc: p.name || '', mudancas: [] }); b.closest('.row').remove(); if (state.id === p.id) { state.id = null; persist(); } } catch (err) { toast(errMsg(err)); }
      });
      const payload = () => JSON.stringify(Object.assign({ app: 'ls-pricer', rev: MODEL.source, name: docTitle(), doc: state.doc }, isSpv() ? { div: 'SPV', spv: state.spv } : isFacts() ? { sol: 'FACTS', facts: state.facts } : {}), null, 1);
      $('#mCopy', o).onclick = () => { const t = payload(); $('#mTxt', o).value = t; navigator.clipboard.writeText(t).then(() => toast('Copiado'), () => { $('#mTxt', o).select(); toast('Selecionado — use Ctrl+C'); }); };
      $('#mDown', o).onclick = async () => { const ok = await REG.save((docTitle().replace(/[^\w\-. ]+/g, '_') || 'proposta') + '.json', payload(), 'application/json'); if (!ok) toast('Download cancelado'); };
      $('#mFile', o).onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $('#mTxt', o).value = rd.result; }; rd.readAsText(f); };
      $('#mImp', o).onclick = () => { try { const j = JSON.parse($('#mTxt', o).value); if (!j.doc && !j.spv && !j.facts) throw 0; close(); if (j.div === 'SPV' && j.spv) loadDoc({}, j.name, null, { div: 'SPV', spv: j.spv }); else if (j.facts) loadDoc({}, j.name, null, { div: 'SEQ', sol: 'FACTS', facts: j.facts }); else loadDoc(j.doc, j.name); setView('proposta'); toast('Importado: ' + (j.name || 'proposta') + ' — clique em Salvar para guardar'); } catch (e) { toast('Não reconheci esse conteúdo como uma proposta do LS Pricer'); } };
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
