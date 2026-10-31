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
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { falhaArmaz(e); return false; } },
  };
  // o navegador recusou gravar (sem espaço, modo privado, bloqueado): avisa em vez de perder calado
  var armazFalhou = null; // var: pode ser lido antes do resto iniciar
  function falhaArmaz(e) { const pri = !armazFalhou; armazFalhou = { at: new Date().toISOString(), msg: e && e.name === 'QuotaExceededError' ? 'o navegador está sem espaço' : 'o navegador bloqueou a gravação' }; if (pri) setTimeout(() => { try { render(); } catch (er) { /* ainda iniciando */ } }, 0); }
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
  function build() { if (migrar(state.doc)) store.set(SK.cur, state); wb = new Workbook(MODEL); REG.applyTo(wb); if (state.precosFix) aplicaPrecos(wb, state.precosFix); wb.applyDoc(state.doc || {}); listCache = new Map(); }
  function persist() { store.set(SK.cur, state); }
  // ---------- preços da época ----------
  // Ao salvar, a proposta SEQ guarda os preços do cadastro que usou (insumos e kits). Enviadas, aprovadas e ganhas
  // continuam calculando com eles (state.precosFix) mesmo que o cadastro mude; o rascunho acompanha o cadastro
  // (salvo se a política de Custos mandar congelar também). Trocar para os vigentes é escolha de quem abre, item a item.
  function aplicaPrecos(w, pr, extra) {
    const ins = Object.assign({}, (pr && pr.ins) || {}, extra || {}); const km = (pr && pr.km) || {}, kb = (pr && pr.kb) || {};
    if (!Object.keys(ins).length && !Object.keys(km).length && !Object.keys(kb).length) return 0;
    const Hh = REG.helpers; const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k); let n = 0;
    const cad = w.sheet('CADASTRO').cells;
    for (let r = 2; r <= 1000; r++) { const d = cad.get('D' + r); if (d === undefined || !has(ins, String(d)) || typeof ins[String(d)] !== 'number') continue; if (cad.get('G' + r) !== ins[String(d)]) { cad.set('G' + r, ins[String(d)]); n++; } }
    const kit = (sheet, map, cols, tot, tc, rmax) => { const c = w.sheet(sheet).cells; for (let r = 2; r <= rmax; r++) { const d = c.get('A' + r); if (d === undefined || !has(map, String(d))) continue; const p = map[String(d)] || {};
      for (const k of cols) { if (typeof p[k] === 'number') c.set(k + r, p[k]); else c.delete(k + r); } const t = tot(p); c.set(tc[0] + r, t[0]); c.set(tc[1] + r, t[1]); n++; } };
    kit('KIT MOTORES DIESEL', km, Hh.KMD_COLS, (p) => { const t = Hh.kmdTotals(p); return [t.nbr, t.padrao]; }, ['U', 'V'], 71);
    kit('KIT BOMBA', kb, Hh.KB_COLS, (p) => { const t = Hh.kbTotals(p); return [t.es, t.bp]; }, ['I', 'J'], 78);
    if (n) w.invalidate(); return n;
  }
  // os preços efetivamente usados pela proposta aberta (o primeiro com o nome, como a fórmula pega)
  function precosUsados() {
    const descs = new Set();
    for (const S of ITEMS) { if (!filled(S)) continue; for (let r = 34; r <= 127; r++) for (const c of ['D', 'AJ']) { const v = txt(S, c + r); if (v) descs.add(v); } for (const a of ['C20', 'H20', 'D19', 'J19', 'BA19']) { const v = txt(S, a); if (v) descs.add(v); } }
    const cad = wb.sheet('CADASTRO').cells; const ins = {};
    for (let r = 2; r <= 1000; r++) { const d = cad.get('D' + r); if (d === undefined) continue; const k = String(d); if (descs.has(k) && !(k in ins) && typeof cad.get('G' + r) === 'number') ins[k] = cad.get('G' + r); }
    const kits = (sheet, cols, rmax) => { const c = wb.sheet(sheet).cells; const o = {}; for (let r = 2; r <= rmax; r++) { const d = c.get('A' + r); if (d === undefined) continue; const k = String(d); if (!descs.has(k) || k in o) continue; const p = {}; for (const x of cols) if (typeof c.get(x + r) === 'number') p[x] = c.get(x + r); o[k] = p; } return o; };
    return { at: new Date().toISOString(), ins, km: kits('KIT MOTORES DIESEL', REG.helpers.KMD_COLS, 71), kb: kits('KIT BOMBA', REG.helpers.KB_COLS, 78) };
  }
  function precosFixos(q) {
    if (!q || !q.precos) return false; if ((q.status || 'rascunho') !== 'rascunho') return true;
    try { const ap = MG.aprovDe(q.id); if (ap && MG.estadoA(ap) === 'aprovada') return true; } catch (e) { /* sem aprovações carregadas */ }
    return !!custosCfg().congelarRascunho;
  }
  // diferença entre os preços guardados e os do cadastro de hoje
  function difPrecos(pr) {
    const out = []; if (!pr) return out; const Hh = REG.helpers;
    for (const [d, v] of Object.entries(pr.ins || {})) { const i = REG.insumos.find((x) => x.produto === d); const cur = i ? i.valor : null; if (typeof cur !== 'number' || Math.abs(cur - v) > 0.004) out.push({ t: 'ins', d, de: v, para: typeof cur === 'number' ? cur : null, id: i ? i.id : null }); }
    const kt = (map, list, tot, lb) => { for (const [d, p] of Object.entries(map || {})) { const k = list.find((x) => x.desc === d); const a = tot(p), b = k ? tot(k.p || {}) : null; if (b === null || Math.abs(a - b) > 0.004) out.push({ t: lb, d, de: a, para: b, p: k ? k.p : null }); } };
    kt(pr.km, REG.kitMotor, (p) => Hh.kmdTotals(p).padrao, 'kit motor'); kt(pr.kb, REG.kitBomba, (p) => Hh.kbTotals(p).bp, 'kit bomba');
    return out;
  }
  function precosCard() {
    if (isSpv() || isFacts()) return '';
    const fixo = !!state.precosFix; const pr = state.precosFix || state.precosSalvos; if (!pr) return '';
    const D = difPrecos(pr); if (!D.length) return fixo ? `<div class="banner info" style="margin:0">Esta proposta usa os preços do cadastro de ${esc(new Date(pr.at).toLocaleDateString('pt-BR'))} (preços da época), que continuam iguais aos de hoje.</div>` : '';
    return fixo ? `<div class="banner warn" style="margin:0"><b>Preços da época:</b> esta proposta calcula com os preços de ${esc(new Date(pr.at).toLocaleDateString('pt-BR'))}. ${D.length} preço(s) mudaram no cadastro desde então; nada muda aqui sem a sua escolha. <button class="btn sm" data-precocmp>Comparar e atualizar</button></div>`
      : `<div class="banner info" style="margin:0">${D.length} preço(s) do cadastro mudaram desde a última gravação (${esc(new Date(pr.at).toLocaleDateString('pt-BR'))}). Este rascunho já calcula com os preços de hoje. <button class="restore" data-precocmp>ver quais</button></div>`;
  }
  function precosModal() {
    const fixo = !!state.precosFix; const pr = state.precosFix || state.precosSalvos; const D = difPrecos(pr); if (!D.length) { toast('Nenhum preço mudou'); return; }
    modal(`<h2>Preços da proposta × cadastro de hoje</h2><p class="sub" style="margin:0">${fixo ? 'Marque o que deve passar a usar o preço de hoje. O resto continua com o preço da época.' : 'O rascunho já usa os preços de hoje. A lista mostra o que mudou desde a última gravação.'}</p>
      <div class="tw"><table class="t"><thead><tr>${fixo ? '<th></th>' : ''}<th>Item</th><th>Na proposta</th><th>Hoje</th><th>Variação</th></tr></thead><tbody>${D.map((x, i) => `<tr>${fixo ? `<td class="in"><input type="checkbox" data-prsel="${i}"${x.para === null ? ' disabled' : ''} aria-label="Atualizar ${esc(x.d)}"></td>` : ''}<td>${esc(x.d)}<br><small class="sub">${esc(x.t === 'ins' ? 'insumo' + (x.id ? ' ' + x.id : '') : x.t)}</small></td><td class="n">${brl(x.de)}</td><td class="n">${x.para === null ? '<span class="pill bad">saiu do cadastro</span>' : brl(x.para)}</td><td class="n">${x.para === null || !x.de ? '—' : (x.para > x.de ? '+' : '') + pct((x.para - x.de) / x.de, 1)}</td></tr>`).join('')}</tbody></table></div>
      ${fixo ? `<p class="sub" style="margin:0">${['enviada', 'negociacao', 'ganha'].includes(state.status) ? 'A proposta já foi enviada: ao salvar com preços novos, o app pede para criar uma nova revisão.' : ''} Aprovações cujo custo mude perdem a validade.</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${fixo ? '<button class="btn" id="prTodos">Marcar todos</button><button class="btn pri" id="prOk">Atualizar os marcados</button>' : ''}<button class="btn" data-close>Fechar</button></div>`, (o, close) => {
      const t = $('#prTodos', o); if (t) t.onclick = () => o.querySelectorAll('[data-prsel]:not([disabled])').forEach((c) => { c.checked = true; });
      const ok = $('#prOk', o); if (ok) ok.onclick = () => {
        const sel = [...o.querySelectorAll('[data-prsel]:checked')].map((c) => D[+c.dataset.prsel]); if (!sel.length) { toast('Marque pelo menos um'); return; }
        const pr2 = JSON.parse(JSON.stringify(state.precosFix));
        for (const x of sel) { if (x.t === 'ins') pr2.ins[x.d] = x.para; else if (x.t === 'kit motor') pr2.km[x.d] = JSON.parse(JSON.stringify(x.p)); else pr2.kb[x.d] = JSON.parse(JSON.stringify(x.p)); }
        state.precosFix = pr2; build(); persist(); dirty = true; close(); render();
        logEv({ tipo: 'Proposta — preços atualizados', ref: state.id || '', desc: docTitle() + ': ' + sel.length + ' preço(s) da época trocado(s) pelos de hoje', mudancas: sel.map((x) => ({ campo: x.d, de: x.de, para: x.para })) });
        toast(sel.length + ' preço(s) atualizado(s). Salve a proposta para gravar.');
      };
    });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-precocmp]')) precosModal(); });

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
  let dirty = !!(state && state._sujo); if (dirty) ui.recuperado = state._editEm || true;
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
      const LB = (o) => (opt.labels && opt.labels[o]) || (/^\d{2}\.[A-Z]/.test(String(o)) ? famNome(o) : o);
      if (fb) opts += `<option value="\u0000auto"${over ? '' : ' selected'}>${esc(opt.compact ? LB(cur) || '—' : cur ? 'Automático — ' + LB(cur) : 'Automático')}</option>`;
      else opts += `<option value=""${cur === '' ? ' selected' : ''}>—</option>`;
      const seen = new Set();
      for (const o of list) { if (seen.has(o)) continue; seen.add(o); opts += `<option value="${esc(o)}"${(over || !fb) && o === cur ? ' selected' : ''}>${esc(LB(o))}</option>`; }
      if ((over || !fb) && cur !== '' && !seen.has(cur)) opts += `<option value="${esc(cur)}" selected>${esc(LB(cur))}</option>`;
      if (opt.novoIns !== undefined) opts += `<option value="__novoins__" data-fam="${esc(opt.novoIns || '')}">＋ Cadastrar novo insumo…</option>`;
      return `<select ${data}>${opts}</select>`;
    }
    const dl = opt.datalist ? ` list="${opt.datalist}"` : '';
    const inp = `<input ${data}${dl} value="${esc(cur)}" inputmode="${kind === 'text' ? 'text' : 'decimal'}"${kind === 'pct' ? ' placeholder="%"' : opt.ph ? ` placeholder="${esc(opt.ph)}"` : ''} autocomplete="off">`;
    // quantidades: − e + ao lado, sem impedir de digitar
    return opt.step ? `<div class="stepper"><button type="button" class="btn sm" data-stepdo="-1" data-for="${esc(id(sheet, a))}" aria-label="Diminuir">−</button>${inp}<button type="button" class="btn sm" data-stepdo="1" data-for="${esc(id(sheet, a))}" aria-label="Aumentar">+</button></div>` : inp;
  }
  // célula editável dentro de tabela
  function cellIn(sheet, a, opt = {}) {
    const fb = isFormulaBase(sheet, a); const over = overridden(sheet, a);
    return `<td class="in ${over ? 'over' : fb ? 'auto' : ''}" title="${over ? 'Alterado à mão — apague (ou escolha a 1ª opção) para voltar ao automático' : fb ? 'Automático — pode alterar' : ''}">${control(sheet, a, Object.assign({ compact: true }, opt))}</td>`;
  }

  document.addEventListener('change', (e) => {
    const el = e.target; if (!el.dataset || !el.dataset.addr) return;
    if (el.value === '__novoins__') { const fam = (el.selectedOptions[0] && el.selectedOptions[0].dataset.fam) || ''; render(); novoInsumo('', fam); return; }
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
  // menu lateral: recolher (computador) e gaveta (celular)
  try { if (localStorage.getItem('lspricer.sidemini') === '1') document.body.classList.add('side-mini'); } catch (e) { /* sem preferência guardada */ }
  const fechaMenu = () => { if (!document.body.classList.contains('side-open')) return; document.body.classList.remove('side-open'); $('#sideScrim').hidden = true; $('#bMenu').focus(); };
  $('#bMenu').onclick = () => { document.body.classList.add('side-open'); $('#sideScrim').hidden = false; const f = $('#nav button[aria-current="page"]') || $('#nav button'); if (f) f.focus(); };
  $('#bSideX').onclick = fechaMenu; $('#sideScrim').onclick = fechaMenu;
  $('#nav').addEventListener('click', (e) => { if (e.target.closest('button') && !e.target.closest('[data-navgt]')) fechaMenu(); });
  const sideCol = () => { const m = document.body.classList.contains('side-mini'); const b = $('#bSideCol'); b.dataset.ico = m ? 'panel-left-open' : 'panel-left-close'; b.title = m ? 'Expandir o menu' : 'Recolher o menu'; b.setAttribute('aria-label', b.title); b.querySelector('.nl').textContent = m ? 'Expandir' : 'Recolher'; decorar(b.parentElement); };
  $('#bSideCol').onclick = () => { const m = document.body.classList.toggle('side-mini'); try { localStorage.setItem('lspricer.sidemini', m ? '1' : '0'); } catch (e) { /* só nesta visita */ } sideCol(); };
  sideCol();
  // menu por módulos: grupos que abrem e fecham (a escolha fica neste navegador), pesquisa no menu, setas do teclado e
  // dica com o nome no menu recolhido. Os atalhos dos submenus só levam a telas que já existem.
  const NAVG_K = 'lspricer.navgrupos'; const normMenu = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let navAbertos = {}; try { navAbertos = JSON.parse(localStorage.getItem(NAVG_K) || '{}') || {}; } catch (e) { navAbertos = {}; }
  const navGrupo = (k, abre) => { const h = document.querySelector(`#nav [data-navgt="${k}"]`); const sb = document.getElementById('navs_' + k); if (!h || !sb) return; h.setAttribute('aria-expanded', abre ? 'true' : 'false'); sb.hidden = !abre; };
  for (const h of document.querySelectorAll('#nav [data-navgt]')) navGrupo(h.dataset.navgt, !!navAbertos[h.dataset.navgt]);
  for (const b of document.querySelectorAll('#nav [data-view]')) b.dataset.tip = (b.querySelector('.nl') || b).textContent.trim();
  $('#nav').addEventListener('click', (e) => {
    const h = e.target.closest('[data-navgt]'); if (h) { e.stopPropagation(); const k = h.dataset.navgt; const abre = h.getAttribute('aria-expanded') !== 'true'; navGrupo(k, abre); navAbertos[k] = abre; try { localStorage.setItem(NAVG_K, JSON.stringify(navAbertos)); } catch (er) { /* só nesta visita */ } return; }
    const g = e.target.closest('[data-go]'); if (!g) return;
    const v = g.dataset.go, k = g.dataset.gk, val = g.dataset.gv;
    if (k === 'homeDiv') { ui.homeDiv = val; }
    if (k === 'cad') { ui.cad = val; }
    if (k === 'mgTab') { ui.mgTab = val; ui.mgId = null; ui.apId = null; }
    if (k === 'ajuda') ui.ajuda = val;
    setView(v);
    // lista ou seção certa à vista
    setTimeout(() => { const alvo = k === 'homeDiv' ? document.querySelector(`[data-hdiv="${CSS.escape(val)}"]`) : k === 'ajuda' ? document.getElementById('ajuda_' + val) : null; if (alvo) alvo.scrollIntoView({ block: 'start' }); }, 30);
  });
  // pesquisa no menu: mostra só o que bate (abre os grupos enquanto pesquisa)
  $('#navQ').addEventListener('input', (e) => {
    const q = String(e.target.value || '').trim(); const nq = normMenu(q);
    let n = 0;
    for (const b of document.querySelectorAll('#nav [data-view], #nav [data-go]')) {
      const nl = b.querySelector('.nl'); const t = nl ? (nl.dataset.t || (nl.dataset.t = nl.textContent)) : '';
      const ok = !nq || normMenu(t).includes(nq); b.hidden = !ok; if (ok) n++;
      if (nl) { if (nq && ok) { const i = normMenu(t).indexOf(nq); nl.innerHTML = esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); } else nl.textContent = t; }
    }
    for (const h of document.querySelectorAll('#nav [data-navgt]')) { const k = h.dataset.navgt; const sb = document.getElementById('navs_' + k);
      if (nq) { const vis = [...h.parentElement.querySelectorAll('[data-view], [data-go]')].some((x) => !x.hidden); h.hidden = !vis; sb.hidden = !vis; h.setAttribute('aria-expanded', vis ? 'true' : 'false'); }
      else { h.hidden = false; navGrupo(k, !!navAbertos[k]); } }
    let vz = $('#nav .navvazio'); if (nq && !n) { if (!vz) { vz = document.createElement('div'); vz.className = 'navvazio'; $('#nav').appendChild(vz); } vz.textContent = 'Nada no menu com "' + q + '". Use a busca (Ctrl+K) para procurar propostas e cadastros.'; } else if (vz) vz.remove();
  });
  $('#navQ').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); } if (e.key === 'ArrowDown') { e.preventDefault(); const f = [...document.querySelectorAll('#nav button')].find((x) => !x.hidden && x.offsetParent); if (f) f.focus(); } });
  // setas para cima e para baixo percorrem o menu
  $('#nav').addEventListener('keydown', (e) => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !e.target.closest('button')) return;
    const L = [...document.querySelectorAll('#nav button')].filter((x) => !x.hidden && x.offsetParent); const i = L.indexOf(e.target); if (i < 0) return; e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? L.length - 1 : Math.max(0, Math.min(L.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); L[j].focus(); });
  // teclado: Esc fecha a janela aberta (ou o menu); Ctrl+S (⌘S) salva a proposta
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('side-open')) { fechaMenu(); return; } });
  document.addEventListener('keydown', (e) => {
    // Esc fecha a janela pelo botão que só fecha (um link "fechar e ir para…" também tem data-close e não pode ser o escolhido)
    if (e.key === 'Escape' && $('#overlay') && $('#overlay').firstElementChild && !e.defaultPrevented) { const cs = [...document.querySelectorAll('#overlay [data-close]')]; const so = (x) => Object.keys(x.dataset).length === 1; const c = cs.find((x) => so(x) && x.offsetParent) || cs.find(so); if (c) c.click(); else $('#overlay').innerHTML = ''; return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); setTimeout(() => $('#bSave').click(), 0); }
  });
  // tema: automático (segue o sistema), claro ou escuro; fica guardado neste navegador
  const TEMAS = [['auto', 'Tema: automático'], ['light', 'Tema: claro'], ['dark', 'Tema: escuro']];
  function aplicaTema(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; const b = $('#bTheme'); if (b) { const lb = (TEMAS.find((x) => x[0] === t) || TEMAS[0])[1]; b.innerHTML = '<span class="tl">' + lb + '</span>'; b.dataset.ico = t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'sun-moon'; b.title = lb + ' (clique para trocar)'; b.setAttribute('aria-label', lb + ' (clique para trocar)'); decorar(b.parentElement); } }
  let tema = 'auto'; try { tema = localStorage.getItem('lspricer.tema') || 'auto'; } catch (e) { tema = 'auto'; }
  aplicaTema(tema);
  $('#bBusca').onclick = () => buscaAbrir();
  $('#bTheme').onclick = () => { const i = TEMAS.findIndex((x) => x[0] === tema); tema = TEMAS[(i + 1) % TEMAS.length][0]; try { localStorage.setItem('lspricer.tema', tema); } catch (e) { /* só nesta visita */ } aplicaTema(tema); };
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-restore]');
    if (r) { const [s, a] = r.dataset.restore.split('|'); commit(s, a, null, true); return; }
    // aba Configuração: o configurador do item atual (ou do primeiro item); sem item, vai para a lista de itens
    if (e.target.closest('[data-ptcfg]')) { if (!cabOk()) { ui.step = 1; ui.reqShow = true; setView('proposta'); toast('Preencha o cabeçalho antes do equipamento'); return; }
      const us = ITEMS.map((S, i) => i).filter((i) => used(i)); if (!us.length) { ui.step = 2; setView('proposta'); toast('Adicione um item para configurar'); return; }
      ui.item = us.includes(ui.item) ? ui.item : us[0]; ui.itemFull = false; setView('item'); return; }
    const go = e.target.closest('[data-goitem]');
    if (go) { ui.item = +go.dataset.goitem; ui.itemFull = false; cfgEtRestart(ui.item); setView('item'); return; }
    const nv = e.target.closest('[data-view]');
    if (nv) { if (ui.simple && nv.dataset.view === 'item' && !nv.closest('#app')) { ui.step = cabOk() ? 2 : 1; if (!cabOk()) ui.reqShow = true; ui.propFull = false; setView('proposta'); return; } if (nv.dataset.view === 'cadastro' && areaOfTab(ui.cad) === 'sistema') ui.cad = 'insumos'; setView(nv.dataset.view); return; }
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-recsalva]')) { ui.recuperado = null; await $('#bSave').onclick(e); return; }
    if (e.target.closest('[data-recdesc]') || e.target.closest('[data-recnova]')) { const q = (REG.listPropostas() || []).find((x) => x.id === state.id); if (!q) return; if (e.target.closest('[data-recdesc]') && !await DLG.confirmar('Descartar as alterações não salvas?')) return; dirty = false; ui.recuperado = null; openProposta(q, false); }
  });

  // ---------- visões ----------
  // clientes já usados em propostas salvas: sugestões e dados que se repetem (CNPJ, UF, cadastro fiscal, segmento, contato)
  function clientesConhecidos() {
    const M = new Map();
    for (const q of (REG.listPropostas() || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      const P = ((q.doc || {}).PROPOSTA) || {}; const nome = String(q.cliente || P.F5 || (q.spv || {}).cliente || (q.facts || {}).cliente || '').trim(); if (!nome) continue;
      const c = M.get(nome.toUpperCase()) || { nome };
      for (const [k, v] of Object.entries({ L5: P.L5, F7: P.F7, J5: P.J5, F8: P.F8, contato: (q.spv || {}).contato, uf: (q.spv || {}).uf || P.F7 })) if (v !== undefined && v !== null && v !== '') c[k] = v;
      M.set(nome.toUpperCase(), c);
    }
    return M;
  }
  const dlClientesHtml = () => `<datalist id="dl_clientes">${[...clientesConhecidos().values()].map((c) => `<option value="${esc(c.nome)}">`).join('')}</datalist>`;
  document.addEventListener('change', (e) => {
    const el = e.target; if (!(el.dataset && el.dataset.sheet === 'PROPOSTA' && el.dataset.addr === 'F5')) return;
    const c = clientesConhecidos().get(String(el.value || '').trim().toUpperCase()); if (!c) return;
    setTimeout(() => { const feitos = []; for (const [a, lb] of [['L5', 'CNPJ'], ['F7', 'UF'], ['J5', 'cadastro fiscal'], ['F8', 'segmento']]) if (c[a] !== undefined && !txt('PROPOSTA', a)) { commit('PROPOSTA', a, c[a]); feitos.push(lb); }
      if (feitos.length) toast('Cliente já conhecido: ' + feitos.join(', ') + ' recuperado(s) da última proposta. Confira.'); }, 30);
  });
  // botões − e + das quantidades
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-stepdo]'); if (!b) return; const inp = document.getElementById(b.dataset.for); if (!inp) return; const n = parseInput(String(inp.value || '0'), 'num'); const v = Math.max(0, (typeof n === 'number' ? n : 0) + +b.dataset.stepdo); inp.value = String(v).replace('.', ','); inp.dispatchEvent(new Event('change', { bubbles: true })); });
  // ícones: todo elemento com data-ico ganha o seu ícone (uma vez)
  // botões do conteúdo ganham o ícone pelo sentido do rótulo (o texto continua: ação importante nunca fica só no ícone)
  const ICO_AUTO = [[/^\+|^Nov[ao]\b|^Cadastrar|^Incluir|^Adicionar/i, 'plus'], [/^Salvar/i, 'save'], [/^Duplicar|^Copiar/i, 'copy'], [/^(Excluir|Remover|Apagar|Descartar)/i, 'trash-2'], [/^Editar/i, 'pencil'], [/^Ver\b|^Ver /i, 'eye'],
    [/^(Exportar|Baixar)/i, 'download'], [/^(Importar|Anexar|Escolher arquivo)/i, 'upload'], [/^Aprovar/i, 'circle-check'], [/^Reprovar|^Recusar/i, 'circle-x'], [/^Comparar/i, 'git-compare'], [/^(Testar|Montar e testar)/i, 'flask-conical'],
    [/^Publicar/i, 'send'], [/^(Restaurar|Desfazer|Voltar ao)/i, 'rotate-ccw'], [/^(Buscar|Pesquisar)/i, 'search'], [/^Pedir aprova/i, 'send'], [/^Revisar/i, 'refresh-cw'], [/^Abrir/i, 'external-link'], [/^Fechar$|^Cancelar$/i, 'x'], [/^Aplicar/i, 'check'], [/^Confirmar/i, 'check'], [/^Hist[óo]rico/i, 'history']];
  function iconeAuto(root) { for (const el of (root || document).querySelectorAll('#app .btn:not([data-ico]):not([data-noico]), #overlay .btn:not([data-ico]):not([data-noico])')) { const t = (el.textContent || '').trim(); if (/^[+−-]$/.test(t)) { el.dataset.ico = ''; continue; }
      // "+ Peça": o ícone de mais substitui o sinal escrito
      if (/^\+\s*\S/.test(t)) { const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (tn && /^\s*\+\s*/.test(tn.textContent)) tn.textContent = tn.textContent.replace(/^\s*\+\s*/, ''); }
      const hit = ICO_AUTO.find(([re]) => re.test(t)); el.dataset.ico = hit ? hit[1] : ''; } }
  function decorar(root) { iconeAuto(root); for (const el of (root || document).querySelectorAll('[data-ico]')) { if (!el.dataset.ico) continue; const n = el.dataset.ico; const cur = el.querySelector(':scope > .ico'); if (cur && cur.dataset.n === n) continue; if (cur) cur.remove(); const t = document.createElement('template'); t.innerHTML = window.ICO ? window.ICO(n) : ''; const svg = t.content.firstChild; if (!svg) continue; svg.dataset.n = n; el.insertBefore(svg, el.firstChild); } }
  function setView(v) { if ((v === 'item' || v === 'memorial') && !cabOk()) { ui.step = 1; ui.reqShow = true; v = 'proposta'; toast('Preencha o cabeçalho antes do equipamento'); } ui.view = v; store.set(SK.view, ui); render(); window.scrollTo(0, 0); }
  function render() {
    const spv = isSpv(); const fx = isFacts(); const outro = spv || fx;
    aplicaLogo();
    if (outro && (ui.view === 'item' || ui.view === 'memorial')) ui.view = 'proposta';
    // Sistema (histórico, responsáveis, backup, planilha) fica em Configurações; o resto do cadastro em Cadastros
    if (ui.view === 'cadastro' && CAD_TABS.some((x) => x[0] === ui.cad) && areaOfTab(ui.cad) === 'sistema') ui.view = 'config';
    if (ui.view === 'config' && areaOfTab(ui.cad) !== 'sistema') ui.cad = 'historico';
    const navAtual = viewDaProposta(ui.view) ? 'proposta' : ui.view;
    for (const b of document.querySelectorAll('#nav button[data-view]')) b.setAttribute('aria-current', b.dataset.view === navAtual ? 'page' : 'false');
    for (const b of document.querySelectorAll('#nav button[data-go]')) { const v = b.dataset.go, k = b.dataset.gk, gv = b.dataset.gv;
      const on = ui.view === v && (!k || (k === 'homeDiv' ? (ui.homeDiv || 'todas') === gv : k === 'cad' ? ui.cad === gv : k === 'mgTab' ? (ui.mgTab || 'painel') === gv : k === 'ajuda' ? (ui.ajuda || 'guia') === gv : false));
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
    const nm = spv ? state.spv.numero : fx ? state.facts.numero : txt('PROPOSTA', 'C5'), cli = spv ? state.spv.cliente : fx ? state.facts.cliente : txt('PROPOSTA', 'F5');
    $('#docName').innerHTML = `<span class="divb ${spv ? 'spv' : 'seq'}">${spv ? 'SPV' : 'SEQ'}</span> ` + ((nm || cli) ? `<b>${esc(nm || 'Sem número')}</b> · ${esc(cli || 'sem cliente')}` : '<b>Proposta nova</b>');
    { const b = $('#bMode'); if (b) b.hidden = outro || !['proposta', 'item'].includes(ui.view); }
    const scroll = window.scrollY; const focusId = document.activeElement && document.activeElement.id;
    const full = !outro && ui.simple && ((ui.view === 'proposta' && ui.propFull) || (ui.view === 'item' && ui.itemFull));
    const views = spv ? { proposta: SPV.vSpv } : fx ? { proposta: FX.vFacts } : ui.simple ? { proposta: ui.propFull ? vProposta : vPropostaS, item: ui.itemFull ? vItem : ui.cfgClassico ? vItemS : vConfig } : { proposta: vProposta, item: vItem };
    const html = (viewDaProposta(ui.view) ? propHeader() : '') + Object.assign({ inicio: SPV.vHome, pendencias: MG.vPendencias, documentos: SPV.vDocs, margens: MG.vMargens, memorial: vMemorial, cadastro: () => vCadastro('cadastro'), config: () => vCadastro('config'), guia: vGuia, phist: vPropHist }, views)[ui.view]();
    MG.ensure(); SPV.ensureDocs(); PD.ensure();
    // contadores do menu: só o selo muda; o ícone e o nome ficam
    const selo = (v, n, t) => { const b = document.querySelector('#nav [data-view="' + v + '"]'); if (!b) return; let x = b.querySelector('.nbadge'); if (!n) { if (x) x.remove(); return; } if (!x) { x = document.createElement('span'); x.className = 'nbadge'; b.appendChild(x); } x.textContent = n; x.title = t; b.setAttribute('aria-label', b.textContent.replace(/\d+$/, '').trim() + ' — ' + t); };
    { const n = REG.areaOk('custos') ? PD.abertos().length : 0; selo('cadastro', n, n + ' pedido(s) de cadastro em aberto'); }
    { const n = MG.nPendencias(); selo('pendencias', n, n + ' pendência(s) esperando você'); }
    { const n = MG.pendentesAprov(); selo('margens', n, n + ' aprovação(ões) de desconto esperando você'); }
    const fe = state.id && ['proposta', 'item'].includes(ui.view) && MG.fechDe(state.id);
    const aviso = fe ? `<div class="banner ok" style="margin:0 0 12px">Proposta fechada em ${esc(new Date(fe.fechadoEm).toLocaleDateString('pt-BR'))}${fe.pedido ? ' · pedido ' + esc(fe.pedido) : ''}. ${MG.liberaReal(state.id) ? ' O custo real de compras e fabricação é lançado na tela do fechamento. <button class="btn sm pri" data-mgreal="' + esc(state.id) + '">Lançar custo real</button>' : ' A proposta não está como ganha: o custo real não é lançado.'}</div>` : '';
    const avRev = state.verRev && ['proposta', 'item', 'memorial'].includes(ui.view) ? `<div class="banner warn" style="margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>Consultando a revisão ${state.verRev.rev}</b> (guardada em ${esc(fmtAt(state.verRev.at))}). Só leitura: nada aqui é salvo.</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm pri" data-revatual>Voltar à revisão atual</button><button class="btn sm" data-revs>Revisões</button></span></div>` : '';
    const salvaB = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    const avInteg = !['proposta', 'item', 'memorial'].includes(ui.view) ? '' : (armazFalhou ? `<div class="banner bad" style="margin:0 0 12px"><b>O navegador não está gravando</b> (${esc(armazFalhou.msg)}). O que você fizer agora pode se perder ao fechar. Baixe um backup em Configurações → Backup e restauração e libere espaço.</div>` : '')
      + (ui.recuperado && dirty ? `<div class="banner warn" style="margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>Recuperamos alterações não salvas</b>${typeof ui.recuperado === 'string' ? ' (última edição ' + esc(fmtAt(ui.recuperado)) + ')' : ''}. Elas estão na tela; ainda não foram gravadas.</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm pri" data-recsalva>Salvar agora</button>${salvaB ? '<button class="btn sm" data-recdesc>Descartar e abrir a versão salva</button>' : ''}</span></div>` : '')
      + (salvaB && state.verBase !== undefined && (salvaB.verDoc || 0) > state.verBase && !state.verRev ? `<div class="banner warn" style="margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>${REG.mode === 'shared' ? who(salvaB.by) : 'Outra janela deste navegador'} salvou uma versão mais nova</b> desta proposta às ${esc(fmtAt(salvaB.at))}.${dirty ? ' Ao salvar, o app pede para você escolher o que fazer, sem sobrescrever.' : ''}</span>${dirty ? '' : '<span style="margin-left:auto"><button class="btn sm pri" data-recnova>Abrir a versão nova</button></span>'}</div>` : '');
    $('#app').innerHTML = avInteg + avRev + aviso + (full ? '<div class="backbar"><button class="btn sm" data-simpleback>← Voltar à versão simples</button></div>' : '') + html;
    const bm = $('#bMode'); if (bm) { bm.innerHTML = '<span class="tl">' + (ui.simple ? 'Planilha completa' : 'Visão guiada') + '</span>'; bm.dataset.ico = ui.simple ? 'table-2' : 'list-checks'; }
    atualizaSaveSt();
    if (ui.view === 'cadastro' || ui.view === 'config') bindCadastro();
    decorar(document);
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
    // grupos do resultado: cada um é uma lista rótulo → valor (o separador dentro da lista trocava rótulo e valor de lado)
    const grupos = []; let g = []; for (const x of res) { if (x) g.push(x); else { grupos.push(g); g = []; } } grupos.push(g);
    const kvG = (L) => `<div class="kv res">${L.map((x) => `<div>${x[2] ? '<b>' : ''}${esc(txt(P, 'C' + x[0]))}${x[2] ? '</b>' : ''}</div><div${x[2] ? ' class="tot"' : ''}>${esc(fm[x[1]](val(P, 'E' + x[0])))}</div>`).join('')}</div>`;
    const kv = `<div class="resgrid"><div><h3 class="resh">Custos</h3>${kvG(grupos[0])}</div><div><h3 class="resh">Impostos, comissão e margem</h3>${kvG(grupos[1])}<div class="ressep"></div>${kvG(grupos[2])}<div class="ressep"></div>${kvG(grupos[3])}</div><div><h3 class="resh">Preço, IPI e origem</h3>${kvG(grupos[4])}<div class="ressep"></div>${kvG(grupos[5])}<small class="sub">Origem do pacote pela regra da FCI: conteúdo de importação acima de ${esc(pct(val('PARÂMETROS', 'C9'), 0))} = IMPORTADO, senão NACIONAL.</small></div></div>`;
    const demo = [73, 74, 75, 76, 77, 78].map((r) => `<div>${esc(txt(P, 'C' + r))}${val(P, 'F' + r) !== null ? ` <small class="sub">(${pct(val(P, 'F' + r), 2)})</small>` : ''}</div><div>${brl(val(P, 'E' + r))}</div>`).join('');
    const fora = [82, 83, 84, 85, 86].map((r) => `<div>${esc(txt(P, 'C' + r))}</div><div class="${r === 83 && Math.abs(val(P, 'E83')) > 0.005 ? 'bad-t' : ''}">${brl(val(P, 'E' + r))}</div>`).join('');
    return `<div class="stack">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
        <div><h1>Proposta ${esc(txt(P, 'C5'))}</h1><div class="sub">${esc(txt(P, 'F5'))}${txt(P, 'F6') ? ' · ' + esc(txt(P, 'F6')) : ''}</div></div>
        <div class="legend"><span><i class="e"></i>Entrada</span><span><i class="a"></i>Automático (herdado ou calculado)</span><span><i class="o"></i>Alterado à mão</span></div>
      </div>
      <div class="kpis">
        <div class="kpi lead"><span>Preço total (com IPI)</span><b>${brl(val(P, 'B16'))}</b><em>${esc(txt(P, 'M16'))} itens preenchidos</em></div>
        <div class="kpi"><span>Custo total dos itens</span><b>${brl(val(P, 'G16'))}</b></div>
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
      <section class="card"><h2>Resultado consolidado</h2>${kv}</section>
      <div class="resgrid2">
        <section class="card"><h2>Demonstrativo — base sem IPI</h2><div class="kv res">${demo}</div></section>
        <section class="card"><h2>Fora do preço e conferências</h2><div class="kv res">${fora}</div></section>
      </div>
      ${propComCard()}
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
    const f = (a, lb, o) => field(S, a, lb, o); const fs = (a, lb, o) => fieldS(S, a, lb, o);
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
              ${f('C4', 'Descrição do item', { cls: 'spanall' })}${f('C5', 'Família de produto', { cls: 'span2' })}${f('C6', 'Quantidade', { step: 1 })}${f('C7', 'Norma')}${f('C8', 'Desconto de negociação')}
              ${f('G4', 'Segmento')}${f('G5', 'UF de destino')}${f('G6', 'Cadastro fiscal', { cls: 'span2' })}${fs('G7', 'NCM (do cadastro Fiscal)')}${f('G8', 'ICMS manual (opcional)')}
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
          ${espItemCard(S)}
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
  // quantidade digitada no escopo pode ficar como texto ("1", "2,5")
  const qtdNum = (x) => (typeof x === 'number' ? x : Number(String(x ?? '').trim().replace(/\./g, '').replace(',', '.')) || 0);
  function primeiraSemPreco(S) { for (let r = 34; r <= 112; r++) if (/sem custo|sem o preço/.test(txt(S, 'L' + r))) return r; return 0; }
  // o que as regras de configuração enxergam de um item: campos de escolha e as descrições de todos os componentes
  function itemRegras(S) {
    const campos = {}; for (const [a] of RG.CAMPOS) if (a[0] !== '_') campos[a] = txt(S, a);
    const comps = []; for (let r = 34; r <= 112; r++) { if (r > 63 && r < 68) continue; const d = txt(S, 'D' + r); if (d) comps.push(d); }
    for (const x of hiddenLines(S)) if (x.desc) comps.push(x.desc);
    return { campos, comps };
  }
  const RG = window.PricerRegras({ REG, esc, toast: (m) => toast(m), modal: (h, b) => modal(h, b), selecao: () => selecaoHtml(),
    // sugestões de valor para cada campo de condição: a lista da própria planilha (validação) ou o cadastro
    opcoes: (campo) => campo === '_comp' ? [...new Set(REG.insumos.map((i) => i.produto))] : campo === 'C21' ? famsEquip().map((f) => f[2]) : campo === 'E17' ? [...new Set(modelos().map((m) => m.code))] : (listFor(ITEMS[0], campo) || []) });
  // central de regras: as regras de seleção que já estão nas estruturas (MONTADOR), na mesma tela das regras de configuração
  function selecaoHtml() {
    const H2 = heads(); const L = recLines().filter((x) => x.regra || ['FAIXA', 'CV', 'VAZAO', 'TAMANHO', 'SPLIT'].includes(x.tipo));
    return `<section class="card"><h2>Regras de seleção das estruturas <span class="sub">${L.length} componente(s) com condição ou seleção por tabela; editadas em Estruturas</span></h2>
      <div class="tw" style="max-height:45vh;overflow:auto"><table class="t"><thead><tr><th>Linha</th><th>Componente</th><th>Seleção do insumo</th><th>Condição</th><th>Vale para</th><th></th></tr></thead><tbody>${L.map((x) => `<tr><td class="n">${x.r}</td><td>${esc(x.rot)}<br><small class="sub">${esc((ACIONS.find((a) => a[0] === (x.acion || 'TODOS')) || [0, ''])[1])}</small></td><td><small>${esc(origemTxt(x, H2))}</small></td><td>${x.regra ? `<span class="pill ${x.regra === 'OPCIONAL' ? 'mute' : 'warn'}">${esc(regraTxt(x.regra))}</span>` : '<span class="sub">sempre</span>'}</td><td><small>${esc(estrOf(x).join(', '))}</small></td><td><button class="btn sm" data-qrec="${x.r}">Abrir</button></td></tr>`).join('')}</tbody></table></div>
      <p class="sub" style="margin:8px 0 0">Para ver uma regra funcionando, use o Testador de estruturas: ele mostra por que cada componente entrou ou não.</p></section>`;
  }
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
    // vazão informada e pressão zerada (modelo pronto sem pressão): o ponto de trabalho, a folha de dados e a proposta sairiam com 0 mca
    { const bs = [23, 24, 25, 26].filter((r) => txt(S, 'C' + r) && txt(S, 'C' + r) !== 'JOCKEY'); if (bs.some((r) => num0(val(S, 'K' + r)) > 0) && bs.some((r) => !(num0(val(S, 'L' + r)) > 0))) add('warn', 'Sem pressão: o ponto de trabalho, a folha de dados e a proposta sairiam com 0 mca. Informe a pressão.', { lb: 'Informar a pressão', act: 'foco', data: 'H17' }); }
    if (/jockey e nenhum/.test(b32)) add('warn', 'O arranjo pede bomba jockey e nenhuma foi escolhida.', { lb: 'Escolher a jockey', act: 'foco', data: 'J19' });
    for (const c of Object.keys(especDetecta(S))) { const f = especFaltam(S, c); if (f.length) add('warn', ESPEC_FAM[c].tit + ' sem especificação: falta ' + f.join(', ') + '. Sem isso a fábrica não sabe o que fazer e a folha de dados sai incompleta.', { lb: 'Especificar', act: 'esp', data: c }); }
    // regras de configuração da Engenharia (Cadastros → Engenharia → Regras)
    try { for (const x of RG.avaliar(itemRegras(S))) { add(x.sev === 'imped' ? 'bad' : x.sev === 'aviso' ? 'warn' : 'info', x.msg); const a = out.find((y) => y.msg === x.msg); if (a) a.regra = true; } } catch (e) { /* regra malformada não derruba a tela */ }
    const m = /(\d+) LINHA\(S\) ALÉM DA 30ª/.exec(b32); if (m) add('info', `${m[1]} componente(s) além da 30ª linha da planilha: já estão no custo.`);
    const lc = txt(S, 'C27').length, ld = txt(S, 'C28').length;
    if (lc > 60) add('warn', `Código com ${lc} caracteres: passa do limite de 60 do ERP.`, { lb: 'Ver o código', act: 'abrir', data: 'cod' });
    if (ld > 120) add('warn', `Descrição breve com ${ld} caracteres: passa do limite de 120 do ERP.`, { lb: 'Ver a descrição', act: 'abrir', data: 'cod' });
    const fci = txt(S, 'C196'); if (fci && !/^OK/.test(fci)) add('info', 'FCI: ' + fci, { lb: 'Ver a FCI', act: 'abrir', data: 'fci' });
    const ack = state.ack || {}; for (const a of out) { const k = S + '|' + a.msg; if (ack[k]) a.ack = ack[k]; }
    return out;
  }
  // situação do pedido de aprovação desta proposta; a aprovação vale enquanto a margem não cair abaixo da aprovada
  // com valor target: vale enquanto a proposta não ficar abaixo do valor aprovado; sem target (pedidos antigos): pela margem
  function aprovInfo() {
    const ap = state.id ? MG.aprovDe(state.id) : null; if (!ap) return { estado: null };
    let estado = MG.estadoA(ap); const base = { id: ap.id, at: ap.at, margem: ap.snap.margemPct, decisoes: MG.decs(ap), com: MG.comQuem(ap, true), aplicadoEm: ap.aplicadoEm || null };
    // premissas (custo e itens) mudaram depois do pedido: a aprovação não vale mais
    if (estado === 'aprovada') { let r = null; try { r = MG.premissaMudou(ap, resumoOf(isSpv() ? SPV.snapshot(state.spv) : isFacts() ? FX.snapshot(state.facts) : seqSnapshot())); } catch (e) { r = null; }
      if (r) return Object.assign(base, { estado: 'vencida', motivo: r, alvoIpi: ap.alvo ? ap.alvo.vendaSem * MG.ipiRatio(ap.snap) : null, desc: ap.alvo ? 1 - ap.alvo.k : null, margemAlvo: ap.alvo ? ap.alvo.margemPct : null }); }
    if (ap.alvo) {
      const atualIpi = isSpv() ? SPV.total() : isFacts() ? FX.total() : val('PROPOSTA', 'P43'); const alvoIpi = ap.alvo.vendaSem * MG.ipiRatio(ap.snap);
      if (estado === 'aprovada' && typeof atualIpi === 'number' && atualIpi < alvoIpi - 1) estado = 'vencida';
      return Object.assign(base, { estado, alvoIpi, atualIpi, desc: 1 - ap.alvo.k, margemAlvo: ap.alvo.margemPct, aplicar: estado === 'aprovada' && !isSpv() && !isFacts() && typeof atualIpi === 'number' && atualIpi > alvoIpi + 1, falta: estado === 'aprovada' && !ap.aplicadoEm && typeof atualIpi === 'number' && atualIpi > alvoIpi + 1 });
    }
    const atual = isSpv() ? SPV.snapshot(state.spv).margemPct : isFacts() ? FX.snapshot(state.facts).margemPct : val('PROPOSTA', 'J16');
    if (estado === 'aprovada' && typeof atual === 'number' && atual < num0(ap.snap.margemPct) - 5e-4) estado = 'vencida';
    return Object.assign(base, { estado });
  }
  // selo no topo da proposta: onde está a aprovação, com um clique para ela
  function apSelo() {
    const a = aprovInfo(); if (!a.estado) return '';
    const [cls, t] = a.estado === 'pendente' ? ['warn', 'Aprovação ' + a.com.replace(/ \([^)]*\)/g, '')] : a.estado === 'aprovada' ? ['ok', a.falta ? 'Aprovado · falta aplicar' : 'Desconto aprovado'] : a.estado === 'vencida' ? ['bad', 'Abaixo do valor aprovado'] : ['bad', 'Desconto reprovado'];
    return `<div><button class="pill ${cls} apselo" data-apopen="${esc(a.id)}" title="Ver a aprovação">${esc(t)} ›</button></div>`;
  }
  function aprovLinha(x) {
    const a = x.aprov; if (!a || !a.estado) return '';
    const d = Object.values(a.decisoes).filter((y) => y.comentario).map((y) => y.comentario).join(' · ');
    const alvo = a.alvoIpi ? ` o valor target de ${brl(a.alvoIpi)} (desconto de ${pct(a.desc, 1)}, margem ${pct(a.margemAlvo, 1)})` : '';
    const t = a.estado === 'pendente' ? `Aprovação${alvo ? ' d' + alvo.trim().replace(/^o /, 'o ') : ''} pedida em ${new Date(a.at).toLocaleDateString('pt-BR')}: está \u0001.`
      : a.estado === 'aprovada' ? (alvo ? `Diretoria e Financeiro aprovaram${alvo}.` : `Aprovado pela Diretoria e pelo Financeiro com margem de ${pct(a.margem)}.`) + (d ? ' ' + d : '')
      : a.estado === 'vencida' && a.motivo ? `A aprovação perdeu a validade: ${a.motivo} depois do pedido. Peça de novo.`
      : a.estado === 'vencida' ? (alvo ? `Aprovado${alvo}, mas a proposta está em ${brl(a.atualIpi)}, abaixo do aprovado. Peça de novo.` : `A aprovação foi para margem de ${pct(a.margem)}; a margem caiu depois disso. Peça de novo.`)
      : `Desconto reprovado${d ? ': ' + d : ''}.`;
    return `<br><small class="sub">${esc(t).replace('\u0001', '<b>' + a.com + '</b>')} ${a.aplicar ? '<button class="btn sm pri" data-apaplica>Aplicar o valor aprovado na proposta</button> ' : ''}<button class="restore" data-apopen="${esc(a.id)}">ver aprovação</button></small>`;
  }
  // cada alerta: corrigir agora (quando dá) ou seguir assim, com a justificativa no histórico
  const alertList = (list, withItem) => list.length ? `<ul class="alerts">${list.map((x) => {
    const okAp = x.aprov && x.aprov.estado === 'aprovada';
    return `<li class="${x.ack || okAp ? 'ack' : x.lvl}">${withItem ? `<b>Item ${String(x.i + 1).padStart(2, '0')}</b>` : ''}<span>${esc(x.msg)}${aprovLinha(x)}${x.ack ? `<br><small class="sub">Seguindo assim: ${esc(x.ack.motivo)} · <span data-uid="${esc(x.ack.by || '')}">${x.ack.by ? '…' : ''}</span> ${esc(new Date(x.ack.at).toLocaleDateString('pt-BR'))}</small>` : ''}</span>
      <span class="alact">${alAcoes(x)}${withItem ? `<button class="restore" data-goitem="${x.i}">abrir</button>` : ''}</span></li>`; }).join('')}</ul>` : '';
  // ações de um alerta (as mesmas na tela clássica, na conferência e no configurador)
  function alAcoes(x) { const key = esc(JSON.stringify([x.S, x.msg])); const ap = x.aprov && x.aprov.estado; const okAp = ap === 'aprovada'; const pedeAp = x.aprov && !x.ack && (!ap || ap === 'reprovada' || ap === 'vencida');
    return `${pedeAp ? `<button class="btn sm${ap ? ' pri' : ''}" data-alaprov>${ap ? 'Pedir de novo' : 'Pedir aprovação'}</button>` : ''}${x.fix && !x.ack && !okAp ? `<button class="btn sm pri" data-alfix="${esc(JSON.stringify({ S: x.S, act: x.fix.act, data: x.fix.data }))}">${esc(x.fix.lb)}</button>` : ''}${x.ack ? `<button class="restore" data-alundo="${key}">desfazer</button>` : x.lvl !== 'info' && !x.aprov ? `<button class="btn sm" data-alack="${key}">Seguir assim</button>` : ''}`; }
  const countPills = (list) => { const n = (l) => list.filter((x) => x.lvl === l && !x.ack && !(x.aprov && x.aprov.estado === 'aprovada')).length; return list.length ? [['bad', 'alerta'], ['warn', 'aviso']].filter(([l]) => n(l)).map(([l, w]) => `<span class="pill ${l}">${n(l)} ${w}${n(l) > 1 ? 's' : ''}</span>`).join(' ') || '<span class="pill mute">só informação</span>' : '<span class="pill ok">sem alertas</span>'; };

  // ações dos alertas
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-apaplica]')) {
      const ai = aprovInfo(); if (!ai.aplicar) return; const P = 'PROPOSTA'; const d0 = num0(val(P, 'C9'));
      const setq = (v) => { const tg = target(P); tg[P] = tg[P] || {}; tg[P].C9 = v; wb.setRaw(P, 'C9', v); };
      for (let k = 0; k < 10; k++) { const cur = val(P, 'P43'); if (typeof cur !== 'number' || Math.abs(cur - ai.alvoIpi) < 0.5) break; const d = num0(val(P, 'C9')); setq(Math.min(0.95, 1 - (1 - d) * ai.alvoIpi / cur)); }
      listCache = new Map(); dirty = true; persist(); render();
      MG.marcarAplicado(ai.id, val(P, 'P43')).catch(() => {});
      logEv({ tipo: 'Aprovação — valor aplicado', ref: state.id, desc: docTitle() + ': proposta levada ao valor aprovado de ' + brl(ai.alvoIpi), mudancas: [{ campo: 'Desconto global', de: d0, para: val(P, 'C9') }, { campo: 'Total com IPI', de: ai.atualIpi, para: val(P, 'P43') }] });
      toast('Proposta no valor aprovado: ' + brl(val(P, 'P43')) + '. Salve para guardar.'); return;
    }
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
      if (a.act === 'esp') { ui.item = i; ui.itemFull = false; ui.cfgEt = Object.assign({}, ui.cfgEt, { [S]: 3 }); if (ui.view !== 'item') setView('item'); else render();
        setTimeout(() => { const el = document.getElementById('esp_' + S.replace(/\W/g, '') + '_' + a.data); if (!el) return; el.scrollIntoView({ block: 'start' }); const vazio = [...el.querySelectorAll('[data-esp]')].find((x) => !x.value.trim()); if (vazio) vazio.focus(); }, 60); return; }
      if (a.act === 'foco' || a.act === 'abrir') { ui.item = i; ui.itemFull = false; ui.cfgEt = Object.assign({}, ui.cfgEt, { [S]: a.act === 'foco' ? 1 : 3 }); if (a.act === 'foco' && !['C17', 'C6', 'C21'].includes(a.data)) ui.cfgModo = Object.assign({}, ui.cfgModo, { [S]: 'carac' }); if (ui.view !== 'item') setView('item'); else render();
        setTimeout(() => { if (a.act === 'abrir') { const d = document.querySelector(`details[data-keep="${a.data}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } return; }
          let el = document.getElementById(id(S, a.data));
          // campo automático (mostra o valor com "alterar"): abre para digitar
          if (!el) { const ed = document.querySelector(`[data-edit="${S}|${a.data}"]`); if (ed) { ed.click(); el = document.getElementById(id(S, a.data)); } }
          if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); if (el.select) el.select(); } else toast('Escolha a família e o equipamento primeiro'); }, 60); return; }
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

  // cabeçalho obrigatório antes dos itens
  const fmtDoc = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(v || ''); };
  function faltaCab() {
    const P = 'PROPOSTA'; const req = [['L5', 'CNPJ/CPF'], ['F5', 'Cliente'], ['F6', 'Obra / local'], ['F7', 'UF'], ['J5', 'Cadastro fiscal'], ['F8', 'Segmento'], ['C5', 'Nº da proposta'], ['C6', 'Revisão'], ['C7', 'Data'], ['C10', 'Validade'], ['J6', 'Condição de pagamento'], ['F9', 'Norma'], ['C8', 'Vendedor'], ['B13', 'Frete']];
    if (/^CIF/.test(txt(P, 'B13')) && !txt(P, 'F13')) req.push(['D13', 'Distância do frete']);
    if (txt(P, 'J8') && txt(P, 'J8') !== 'SEM COMISSÃO') req.push(['L8', 'Agente de negócio']);
    return req.filter(([a]) => { if (a === 'L5') { const d = txt(P, a).replace(/\D/g, ''); return d.length !== 14 && d.length !== 11; } return !txt(P, a); });
  }
  // obrigatório nas propostas novas; as antigas mostram o que falta sem travar
  const cabOk = () => isSpv() || isFacts() || !state.cabReq || !faltaCab().length;
  // vendedores e agentes de negócio (Precificação)
  const equipeCom = () => (((REG.tabelas || {}).EQUIPE_COM || {}).lista || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
  // consulta pública do CNPJ (sem o Claude): CNPJ.ws traz a inscrição estadual; BrasilAPI é a reserva
  async function buscaCnpj(doc) {
    const d = doc.replace(/\D/g, ''); if (d.length !== 14) throw new Error('Para consultar a Receita, informe um CNPJ com 14 dígitos.');
    const get = async (u) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000); try { const r = await fetch(u, { signal: ctl.signal }); if (r.status === 404) throw new Error('CNPJ não encontrado na Receita.'); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); } };
    try { const j = await get('https://publica.cnpj.ws/cnpj/' + d); const e = j.estabelecimento || {};
      return { razao: j.razao_social, fantasia: e.nome_fantasia, uf: e.estado && e.estado.sigla, cidade: e.cidade && e.cidade.nome, situacao: e.situacao_cadastral, cnae: String((e.atividade_principal || {}).id || ''), natureza: String((j.natureza_juridica || {}).id || ''), ies: (e.inscricoes_estaduais || []).map((x) => ({ ie: x.inscricao_estadual, ativo: x.ativo, uf: x.estado && x.estado.sigla })), fonte: 'CNPJ.ws' };
    } catch (e1) { if (/não encontrado/.test(e1.message)) throw e1;
      const j = await get('https://brasilapi.com.br/api/cnpj/v1/' + d);
      return { razao: j.razao_social, fantasia: j.nome_fantasia, uf: j.uf, cidade: j.municipio, situacao: j.descricao_situacao_cadastral, cnae: String(j.cnae_fiscal || ''), natureza: String(j.codigo_natureza_juridica || ''), ies: null, fonte: 'BrasilAPI' }; }
  }
  // cadastro fiscal sugerido: IE ativa = contribuinte; comércio atacadista/varejista ou segmento revenda/OEM = revenda ou industrialização
  function cadFiscalDe(x) {
    const P = 'PROPOSTA'; const seg = txt(P, 'F8'); const pub = /^1/.test(x.natureza) || /^3/.test(x.natureza);
    const ie = x.ies ? x.ies.filter((i) => i.ativo !== false && (!txt(P, 'F7') || !i.uf || i.uf === (txt(P, 'F7') || x.uf))) : null;
    const contrib = ie ? ie.length > 0 : !pub;
    if (!contrib) return ['NÃO CONTRIBUINTE — CONSUMIDOR FINAL', ie ? 'sem inscrição estadual ativa' : 'órgão público ou entidade sem fins lucrativos'];
    if (/^4[5-7]/.test(x.cnae.padStart(7, '0')) || /REVENDA|OEM/.test(seg)) return ['CONTRIBUINTE — REVENDA OU INDUSTRIALIZAÇÃO', /REVENDA|OEM/.test(seg) ? 'segmento ' + seg.toLowerCase() : 'atividade de comércio'];
    return ['CONTRIBUINTE — USO/CONSUMO OU ATIVO', ie ? 'inscrição estadual ativa' : 'empresa com atividade comercial ou industrial'];
  }
  document.addEventListener('change', (e) => {
    const t = e.target; const P = 'PROPOSTA';
    if (t.id === 'cnpjIn') { const d = t.value.replace(/\D/g, ''); commit(P, 'L5', d || null, !d); return; }
    if (t.dataset && t.dataset.ppcell) { commit(P, t.dataset.ppcell, t.value); return; }
    if (t.dataset && t.dataset.pcom) { commit(P, t.dataset.pcom, t.checked ? (isSpv() ? 'SPV' : 'SEQ') : 'SEM COMISSÃO'); if (t.dataset.pcom === 'J8' && !t.checked) commit(P, 'L8', null, true); return; }
  });
  document.addEventListener('click', async (e) => {
    const P = 'PROPOSTA';
    if (e.target.closest('#cnpjGo')) {
      const inp = $('#cnpjIn'); const msg = $('#cnpjMsg'); const d = (inp.value || '').replace(/\D/g, '');
      if (d) commit(P, 'L5', d); const m2 = () => $('#cnpjMsg');
      try { if (m2()) m2().textContent = 'Consultando a Receita…';
        const x = await buscaCnpj(d); const [cad, pq] = cadFiscalDe(x);
        if (x.razao) commit(P, 'F5', x.razao.toUpperCase());
        if (!txt(P, 'F6') && x.cidade) commit(P, 'F6', (x.cidade + ' / ' + (x.uf || '')).toUpperCase());
        if (!txt(P, 'F7') && x.uf) commit(P, 'F7', x.uf);
        commit(P, 'J5', cad);
        state.cnpjInfo = `${x.fonte}: ${x.situacao || 'situação não informada'}${x.situacao && !/ATIVA/i.test(x.situacao) ? ' — ATENÇÃO' : ''} · ${x.cidade || ''}/${x.uf || ''} · cadastro fiscal: ${cad.split(' — ')[0].toLowerCase()} (${pq}). Confira.`;
        persist(); render(); logEv({ tipo: 'Proposta — CNPJ consultado', ref: docTitle(), desc: fmtDoc(d) + ' · ' + (x.razao || ''), mudancas: [{ campo: 'Cadastro fiscal', de: null, para: cad }] });
      } catch (er) { const t = /^http|Failed to fetch|NetworkError|aborted|Load failed/i.test(er.message || '') || er.name === 'AbortError' || er.name === 'TypeError' ? 'Não consegui falar com a Receita daqui (sem internet ou bloqueado). Preencha os dados à mão.' : er.message; state.cnpjInfo = t; render(); }
      return;
    }
    if (e.target.closest('[data-cabnext]')) {
      if (!cabOk()) { ui.reqShow = true; render(); const m = document.querySelector('.f.miss'); if (m) m.scrollIntoView({ block: 'center' }); toast('Preencha os campos marcados'); return; }
      ui.reqShow = false; if (ui.famPend && !filled(ITEMS[0])) { ui.item = 0; ui.itemFull = false; ui.famPend = null; cfgEtRestart(0); setView('item'); return; }
      ui.famPend = null; ui.step = 2; setView('proposta'); return;
    }
  });
  // ---------- revisões: cada revisão enviada fica guardada; a atual é a que se edita ----------
  const RVK = 'lspricer.revisoes.v1';
  const revDe = (q) => { const v = q.spv ? q.spv.revisao : q.facts ? q.facts.revisao : ((q.doc || {}).PROPOSTA || {}).C6; const n = parseInt(String(v ?? '0').replace(/\D/g, ''), 10); return isFinite(n) ? n : 0; };
  const revAtual = () => (isSpv() ? revDe({ spv: state.spv }) : isFacts() ? revDe({ facts: state.facts }) : revDe({ doc: { PROPOSTA: { C6: val('PROPOSTA', 'C6') } } }));
  function setRev(n) { if (isSpv()) { state.spv.revisao = String(n); persist(); } else if (isFacts()) { state.facts.revisao = n; persist(); } else commit('PROPOSTA', 'C6', n); }
  let revCache = { id: null, list: [] };
  async function revListar(propId) {
    let L = [];
    if (REG.mode === 'shared' && REG.db) { try { const q = await REG.db.collection('revisoes').where('propId', '==', propId).get(); L = q.docs.map((d) => Object.assign({ id: d.id }, d.data())); } catch (e) { L = []; } }
    else { try { L = Object.entries(JSON.parse(localStorage.getItem(RVK) || '{}')).filter(([, x]) => x.propId === propId).map(([id, x]) => Object.assign({ id }, x)); } catch (e) { L = []; } }
    L.sort((a, b) => b.rev - a.rev); revCache = { id: propId, list: L }; return L;
  }
  async function revGravar(rec, sufixo) {
    const id = rec.propId + '_r' + rec.rev + (sufixo || ''); const body = JSON.parse(JSON.stringify(rec));
    if (REG.mode === 'shared' && REG.db) await REG.db.doc('revisoes/' + id).set(body);
    else { let all = {}; try { all = JSON.parse(localStorage.getItem(RVK) || '{}'); } catch (e) { all = {}; } all[id] = body; localStorage.setItem(RVK, JSON.stringify(all)); }
  }
  // congela a revisão salva (como está no banco) antes de subir para a próxima
  async function revCongelar(salva, motivo) {
    const n = revDe(salva); const corpo = JSON.parse(JSON.stringify(salva)); delete corpo.id; delete corpo.local;
    await revGravar({ propId: salva.id, rev: n, at: new Date().toISOString(), by: REG.me || null, statusEra: salva.status || 'rascunho', motivoProxima: motivo || '', total: salva.total ?? null, margemPct: salva.resumo ? salva.resumo.margemPct : null, numero: salva.numero || '', cliente: salva.cliente || '', body: corpo });
    return n;
  }
  async function salvarSilencioso() { await $('#bSave').onclick(); return (REG.listPropostas() || []).find((x) => x.id === state.id); }
  // Revisar: guarda a atual e abre a próxima para edição
  function revisarModal() {
    if (state.verRev) { toast('Volte à revisão atual para revisar'); return; }
    const n = revAtual();
    modal(`<h2>Revisar a proposta</h2><p class="sub" style="margin:0">A revisão ${n} fica guardada como está${state.id ? '' : ' (a proposta será salva antes)'}. Você passa a editar a <b>revisão ${n + 1}</b>; as anteriores continuam em "Revisões".</p>
      <div class="f"><label for="rvMot">O que muda nesta revisão?</label><input id="rvMot" placeholder="ex.: cliente pediu skid com jockey; troca de motor; novo prazo"></div>
      <div style="display:flex;gap:8px"><button class="btn pri" id="rvOk">Criar revisão ${n + 1}</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      $('#rvMot', o).focus();
      $('#rvOk', o).onclick = async () => { const mot = $('#rvMot', o).value.trim(); close(); await revisar(mot); };
    });
  }
  async function revisar(mot, depois) {
    try {
      // a revisão atual vai para o histórico exatamente como está salva (alterações pendentes entram nela)
      let salva = (REG.listPropostas() || []).find((x) => x.id === state.id);
      if (!salva || dirty) salva = await salvarSilencioso(); if (!salva) return;
      const n = await revCongelar(salva, mot);
      if (depois) depois();
      setRev(n + 1); state._novaRev = true;
      await salvarSilencioso();
      logEv({ tipo: 'Proposta — revisão', ref: state.id, desc: docTitle() + ': revisão ' + (n + 1) + ' criada' + (mot ? ' — ' + mot : ''), mudancas: [{ campo: 'Revisão', de: n, para: n + 1 }] });
      ui.step = 1; render(); toast('Revisão ' + (n + 1) + ' criada. A revisão ' + n + ' está guardada.');
    } catch (e) { toast(errMsg(e)); }
  }
  function revSalvarEnviada(salva) {
    const n = revDe(salva);
    modal(`<h2>Esta revisão já foi enviada ao cliente</h2><p class="sub" style="margin:0">A revisão ${n} foi enviada. Para não perder o que o cliente recebeu, o certo é salvar como <b>revisão ${n + 1}</b>.</p>
      <div class="f"><label for="rvMot2">O que muda?</label><input id="rvMot2" placeholder="opcional"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="rvNova">Salvar como revisão ${n + 1}</button><button class="btn" id="rvMesma">É só correção: salvar na revisão ${n}</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      $('#rvNova', o).onclick = async () => { const mot = $('#rvMot2', o).value.trim(); close();
        // guarda a enviada (do banco), depois salva as alterações já como a próxima
        try { await revCongelar(salva, mot); setRev(n + 1); state._novaRev = true; await salvarSilencioso(); logEv({ tipo: 'Proposta — revisão', ref: state.id, desc: docTitle() + ': revisão ' + (n + 1) + ' criada ao salvar' + (mot ? ' — ' + mot : ''), mudancas: [{ campo: 'Revisão', de: n, para: n + 1 }] }); render(); toast('Salvo como revisão ' + (n + 1)); } catch (e) { toast(errMsg(e)); } };
      $('#rvMesma', o).onclick = async () => { close(); await salvarSilencioso(); };
    });
  }
  async function revisoesModal() {
    if (!state.id) { toast('Salve a proposta para ter revisões'); return; }
    const L = await revListar(state.id); const n = state.verRev ? null : revAtual();
    const salva = (REG.listPropostas() || []).find((x) => x.id === state.id) || {};
    const totAtual = salva.total; const mAtual = salva.resumo ? salva.resumo.margemPct : null;
    const dif = (v) => (typeof v === 'number' && typeof totAtual === 'number' ? (v - totAtual >= 0 ? '+' : '−') + brl(Math.abs(v - totAtual)).replace('R$ ', '') : '');
    const linha = (x) => `<tr><td><b>Rev. ${x.rev}</b></td><td>${esc(fmtAt(x.at))}<br><small class="sub">${who(x.by)}</small></td><td class="n">${typeof x.total === 'number' ? brl(x.total) : '—'}<br><small class="sub">${dif(x.total)}</small></td><td class="n">${x.margemPct != null ? pct(x.margemPct) : '—'}</td><td>${esc(x.statusEra === 'enviada' || x.statusEra === 'negociacao' ? 'enviada ao cliente' : x.statusEra || '')}${x.marco ? `<br><span class="pill ${x.marco === 'aprovada' ? 'ok' : 'warn'}">${x.marco === 'aprovada' ? 'versão aprovada' : 'versão enviada ao cliente'} · congelada</span>` : ''}${/_c\d+$/.test(x.id) ? '<br><small class="sub">cópia guardada num conflito de edição simultânea</small>' : x.motivoProxima ? `<br><small class="sub">na rev. ${x.rev + 1}: ${esc(x.motivoProxima)}</small>` : ''}</td><td style="white-space:nowrap"><button class="btn sm" data-revver="${esc(x.id)}">Ver</button> <button class="btn sm" data-revrest="${esc(x.id)}">Restaurar</button></td></tr>`;
    modal(`<h2>Revisões · ${esc(docTitle())}</h2>
      <div class="tw"><table class="t"><thead><tr><th>Revisão</th><th>Guardada em</th><th>Total</th><th>Margem</th><th>Situação</th><th></th></tr></thead><tbody>
        <tr class="tot"><td><b>Rev. ${revDe(salva)}</b> <span class="pill ok">atual</span></td><td>${esc(fmtAt(salva.at || ''))}</td><td class="n">${typeof totAtual === 'number' ? brl(totAtual) : '—'}</td><td class="n">${mAtual != null ? pct(mAtual) : '—'}</td><td>${esc(salva.status || 'rascunho')}</td><td>${state.verRev ? '<button class="btn sm pri" data-revatual>Voltar à atual</button>' : ''}</td></tr>
        ${L.map(linha).join('') || '<tr><td colspan="6" class="sub">Nenhuma revisão anterior ainda.</td></tr>'}</tbody></table></div>
      <p class="sub" style="margin:0">"Ver" abre a revisão só para consulta. "Restaurar" guarda a atual e traz aquela de volta como a próxima revisão. As versões enviadas ao cliente e as aprovadas ficam congeladas automaticamente.</p>
      ${L.length ? `<div class="fields" style="align-items:end"><div class="f"><label for="rcA">Comparar</label><select id="rcA">${L.map((x, i) => `<option value="${esc(x.id)}"${i === 0 ? ' selected' : ''}>Rev. ${x.rev}${x.marco ? ' · ' + x.marco : ''} · ${esc(fmtAt(x.at))}</option>`).join('')}</select></div>
        <div class="f"><label for="rcB">com</label><select id="rcB"><option value="atual" selected>Rev. ${revDe(salva)} (atual)</option>${L.map((x) => `<option value="${esc(x.id)}">Rev. ${x.rev}${x.marco ? ' · ' + x.marco : ''} · ${esc(fmtAt(x.at))}</option>`).join('')}</select></div>
        <div class="f"><button class="btn pri" data-revcmp>Comparar</button></div></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${state.verRev ? '' : `<button class="btn pri" data-revisar>Revisar (criar revisão ${n + 1})</button>`}<button class="btn" data-close>Fechar</button></div>`, (o) => fillNames(o));
  }
  // ---------- comparação entre revisões ----------
  const ROT_CAB = { C5: 'Número', C6: 'Revisão', C7: 'Data', F5: 'Cliente', F6: 'Cidade / UF', F7: 'UF', F8: 'Segmento', F9: 'Norma', J5: 'Cadastro fiscal', J6: 'Condição de pagamento', J7: 'Comissão do vendedor', J8: 'Comissão do AN', L5: 'CNPJ', L7: 'Vendedor', L8: 'Agente de negócio', B13: 'Frete', C9: 'Desconto global' };
  const fmtV = (v) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'number' ? NF[2].format(v).replace(/,00$/, '') : String(v));
  function compararRev(A, B) {
    const a = A.body || {}, b = B.body || {}; const ra = a.resumo || {}, rb = b.resumo || {}; const campos = [];
    if (a.doc || b.doc) {
      const da = a.doc || {}, db = b.doc || {}; const pa = da.PROPOSTA || {}, pb = db.PROPOSTA || {};
      for (const k of new Set(Object.keys(pa).concat(Object.keys(pb)))) if (JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) campos.push({ campo: ROT_CAB[k] || 'Proposta ' + k, de: fmtV(pa[k]), para: fmtV(pb[k]) });
      for (const S of new Set(Object.keys(da).concat(Object.keys(db)))) { if (S === 'PROPOSTA') continue; const sa = da[S] || {}, sb = db[S] || {}; const n = [...new Set(Object.keys(sa).concat(Object.keys(sb)))].filter((k) => JSON.stringify(sa[k]) !== JSON.stringify(sb[k])).length; if (n) campos.push({ campo: S, de: '', para: n + ' campo(s) de entrada mudaram' }); }
    } else {
      const xa = a.spv || a.facts || {}, xb = b.spv || b.facts || {};
      for (const k of new Set(Object.keys(xa).concat(Object.keys(xb)))) { const va = xa[k], vb = xb[k]; if (JSON.stringify(va) === JSON.stringify(vb)) continue;
        if (Array.isArray(va) || Array.isArray(vb) || (va && typeof va === 'object') || (vb && typeof vb === 'object')) campos.push({ campo: k, de: Array.isArray(va) ? va.length + ' linha(s)' : '', para: Array.isArray(vb) ? vb.length + ' linha(s) · mudou' : 'mudou' });
        else campos.push({ campo: k, de: fmtV(va), para: fmtV(vb) }); }
    }
    const ia = new Map((ra.itens || []).map((x) => [x.nome, x])), ib = new Map((rb.itens || []).map((x) => [x.nome, x])); const itens = [];
    for (const [n, x] of ib) { const y = ia.get(n); if (!y) itens.push({ tipo: 'incluído', nome: n, b: x }); else if (Math.abs(num0(y.venda) - num0(x.venda)) > 0.5 || num0(y.qtd) !== num0(x.qtd) || Math.abs(num0(y.custo) - num0(x.custo)) > 0.5) itens.push({ tipo: 'alterado', nome: n, a: y, b: x }); }
    for (const [n, y] of ia) if (!ib.has(n)) itens.push({ tipo: 'retirado', nome: n, a: y });
    const ap = MG.aprovDe(B.propId || A.propId); let reaprov = null;
    if (ap && MG.estadoA(ap) !== 'reprovada') reaprov = MG.premissaMudou(ap, rb) || (ap.alvo && typeof b.total === 'number' && b.total < ap.alvo.vendaSem * MG.ipiRatio(ap.snap) - 1 ? 'o total ficou abaixo do valor aprovado' : null);
    else if (typeof rb.margemPct === 'number' && typeof rb.minimo === 'number' && rb.margemPct < rb.minimo - 5e-4) reaprov = 'a margem ficou abaixo do mínimo da política';
    return { campos, itens, ra, rb, ta: a.total, tb: b.total, reaprov, temAprov: !!ap };
  }
  function compararModal(A, B) {
    const c = compararRev(A, B); const dif = (x, y, f) => (typeof x === 'number' && typeof y === 'number' ? `<b class="${y - x < -1e-9 ? 'bad-t' : y - x > 1e-9 ? 'ok-t' : ''}">${y - x >= 0 ? '+' : '−'}${f(Math.abs(y - x))}</b>` : '—');
    const linhaT = (lb, x, y, f) => `<tr><td>${lb}</td><td class="n">${typeof x === 'number' ? f(x) : '—'}</td><td class="n">${typeof y === 'number' ? f(y) : '—'}</td><td class="n">${dif(x, y, f)}</td></tr>`;
    modal(`<h2>Comparação · ${esc(A.rot)} → ${esc(B.rot)}</h2>
      <div class="tw"><table class="t"><thead><tr><th></th><th>${esc(A.rot)}</th><th>${esc(B.rot)}</th><th>Diferença</th></tr></thead><tbody>
        ${linhaT('Total da proposta', c.ta, c.tb, brl)}${linhaT('Custo', c.ra.custo, c.rb.custo, brl)}${linhaT('Impostos', c.ra.impostos, c.rb.impostos, brl)}${linhaT('Margem líquida (R$)', c.ra.margem, c.rb.margem, brl)}
        <tr><td>Margem líquida (%)</td><td class="n">${c.ra.margemPct != null ? pct(c.ra.margemPct, 1) : '—'}</td><td class="n">${c.rb.margemPct != null ? pct(c.rb.margemPct, 1) : '—'}</td><td class="n">${typeof c.ra.margemPct === 'number' && typeof c.rb.margemPct === 'number' ? dif(c.ra.margemPct * 100, c.rb.margemPct * 100, (v) => NF[1].format(v) + ' p.p.') : '—'}</td></tr></tbody></table></div>
      <div class="banner ${c.reaprov ? 'warn' : 'ok'}" style="margin:0">${c.reaprov ? `<b>Precisa de nova aprovação:</b> ${esc(c.reaprov)}.` : c.temAprov ? 'A aprovação existente continua valendo para esta versão (custo, itens e valor dentro do aprovado).' : 'Nada nesta comparação exige aprovação.'}</div>
      <h3 style="margin:4px 0 0">Itens</h3>${c.itens.length ? `<div class="tw"><table class="t"><tbody>${c.itens.map((x) => `<tr><td><span class="pill ${x.tipo === 'incluído' ? 'ok' : x.tipo === 'retirado' ? 'bad' : 'warn'}">${x.tipo}</span></td><td>${esc(x.nome || '—')}</td><td class="n">${x.a ? brl(x.a.venda) + (x.a.qtd ? ' · ' + x.a.qtd + ' un' : '') : ''}${x.a && x.b ? ' → ' : ''}${x.b ? '<b>' + brl(x.b.venda) + (x.b.qtd ? ' · ' + x.b.qtd + ' un' : '') + '</b>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Os mesmos itens, com os mesmos valores.</p>'}
      <h3 style="margin:4px 0 0">Campos alterados</h3>${c.campos.length ? `<div class="tw"><table class="t"><thead><tr><th>Campo</th><th>${esc(A.rot)}</th><th>${esc(B.rot)}</th></tr></thead><tbody>${c.campos.map((x) => `<tr><td>${esc(x.campo)}</td><td>${esc(x.de)}</td><td><b>${esc(x.para)}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Nenhum campo mudou.</p>'}
      <div style="display:flex;gap:8px"><button class="btn" data-revs>← Revisões</button><button class="btn" data-close>Fechar</button></div>`);
  }
  // marcos: a versão enviada ao cliente e a aprovada ficam congeladas como estavam naquele momento
  async function congelarMarco(propId, marco) {
    try { const cur = await REG.lerProposta(propId); if (!cur) return; const corpo = JSON.parse(JSON.stringify(cur));
      await revGravar({ propId, rev: revDe(cur), at: new Date().toISOString(), by: REG.me || null, statusEra: marco === 'enviada' ? 'enviada' : (cur.status || 'rascunho'), marco, motivoProxima: '', total: cur.total ?? null, margemPct: cur.resumo ? cur.resumo.margemPct : null, numero: cur.numero || '', cliente: cur.cliente || '', body: corpo }, '_' + marco);
    } catch (e) { toast('Não consegui congelar a versão ' + (marco === 'aprovada' ? 'aprovada' : 'enviada') + ': ' + errMsg(e)); }
  }
  function carregarCorpo(q, extra) {
    const ex = Object.assign({ uid: q.uid || newUid(), status: q.status || 'rascunho', ack: q.ack || {}, propCom: q.propCom ? JSON.parse(JSON.stringify(q.propCom)) : {}, verBase: (((REG.listPropostas() || []).find((y) => y.id === state.id)) || {}).verDoc }, extra || {});
    if (q.div === 'SPV' && q.spv) loadDoc({}, q.name, state.id, Object.assign(ex, { div: 'SPV', spv: JSON.parse(JSON.stringify(q.spv)) }));
    else if (q.facts) loadDoc({}, q.name, state.id, Object.assign(ex, { div: 'SEQ', sol: 'FACTS', facts: JSON.parse(JSON.stringify(q.facts)) }));
    else loadDoc(q.doc, q.name, state.id, ex);
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-revs]')) { revisoesModal(); return; }
    if (e.target.closest('[data-revisar]')) { $('#overlay').innerHTML = ''; revisarModal(); return; }
    if (e.target.closest('[data-revcmp]')) { const a = $('#rcA'), b = $('#rcB'); if (!a || !b) return; const pid = (state.verRev || {}).propId || state.id;
      const pega = (v) => { if (v === 'atual') { const sv = (REG.listPropostas() || []).find((y) => y.id === pid) || {}; return { rot: 'Rev. ' + revDe(sv) + ' (atual)', body: sv, propId: pid }; } const x = revCache.list.find((y) => y.id === v); return x ? { rot: 'Rev. ' + x.rev + (x.marco ? ' ' + x.marco : ''), body: x.body, propId: pid } : null; };
      const A = pega(a.value), B = pega(b.value); if (!A || !B) return; if (a.value === b.value) { toast('Escolha duas versões diferentes'); return; } $('#overlay').innerHTML = ''; compararModal(A, B); return; }
    const vr = e.target.closest('[data-revver]'); if (vr) { const x = revCache.list.find((y) => y.id === vr.dataset.revver); if (!x) return;
      if (dirty && !state.verRev && !await DLG.confirmar('Há alterações não salvas na revisão atual. Abrir a revisão ' + x.rev + ' mesmo assim? (as alterações se perdem)')) return;
      $('#overlay').innerHTML = ''; const pid = state.id; carregarCorpo(x.body, { verRev: { rev: x.rev, propId: pid, at: x.at } }); dirty = false; ui.step = 4; setView('proposta'); return; }
    const rs = e.target.closest('[data-revrest]'); if (rs) { const x = revCache.list.find((y) => y.id === rs.dataset.revrest); if (!x) return; $('#overlay').innerHTML = ''; await revRestaurar(x); return; }
    if (e.target.closest('[data-revatual]')) { $('#overlay').innerHTML = ''; const pid = (state.verRev || {}).propId || state.id; const q = (REG.listPropostas() || []).find((y) => y.id === pid); if (q) { openProposta(q, false); ui.step = 4; render(); } return; }
  });
  async function revRestaurar(x) {
    const pid = (state.verRev || {}).propId || state.id; const salva = (REG.listPropostas() || []).find((y) => y.id === pid); if (!salva) return;
    if (!await DLG.confirmar(`Restaurar a revisão ${x.rev}? A revisão ${revDe(salva)} atual fica guardada e a ${x.rev} volta como revisão ${revDe(salva) + 1}.`)) return;
    try {
      const n = await revCongelar(salva, 'restaurada a revisão ' + x.rev);
      state.id = pid; carregarCorpo(x.body, { uid: salva.uid, verRev: null }); state.id = pid; state.verRev = null; setRev(n + 1); state._novaRev = true;
      await salvarSilencioso();
      logEv({ tipo: 'Proposta — revisão', ref: pid, desc: docTitle() + ': revisão ' + x.rev + ' restaurada como revisão ' + (n + 1), mudancas: [{ campo: 'Revisão', de: n, para: n + 1 }] });
      ui.step = 4; render(); toast('Revisão ' + x.rev + ' restaurada como revisão ' + (n + 1));
    } catch (e) { toast(errMsg(e)); }
  }
  // ---------- conferência do PDF: o que a formação diz ----------
  function formacaoConf() {
    const tk = window.PricerConferencia.tokensTecnicos;
    if (isSpv()) { const s = state.spv; const sn = SPV.snapshot(s); const tot = SPV.total();
      return { rev: revAtual(), cliente: s.cliente, numero: s.numero, pagamento: s.pagamento || '', totais: [tot], totalRef: tot,
        itens: sn.itens.map((x) => ({ nome: x.nome, qtd: 1, valores: [x.venda], tecnicos: [], descricao: '', escopo: x.n === 'pecas' ? (s.pecas || []).filter((y) => y.incluso !== false && y.desc).map((y) => y.desc) : [] })) }; }
    if (isFacts()) { const f = state.facts; const sn = FX.snapshot(f); const tot = FX.total();
      return { rev: revAtual(), cliente: f.cliente, numero: f.numero, pagamento: f.pagamento || '', totais: [tot, sn.venda].filter((v) => typeof v === 'number'), totalRef: tot,
        itens: sn.itens.map((x) => ({ nome: x.nome, qtd: num0(x.qtd) || 1, valores: [x.venda, x.venda / (num0(x.qtd) || 1)], tecnicos: tk(x.nome), descricao: '', escopo: [] })) }; }
    const P = 'PROPOSTA'; const sn = seqSnapshot();
    return { rev: revAtual(), cliente: txt(P, 'F5'), numero: txt(P, 'C5'), pagamento: txt(P, 'J6'), frete: txt(P, 'B13'), norma: txt(P, 'F9'), totais: [val(P, 'P43'), sn.venda].filter((v) => typeof v === 'number'), totalRef: val(P, 'P43'),
      itens: ITEMS.filter((S) => filled(S)).map((S) => { const it = sn.itens.find((x) => x.n === S) || {}; const q = num0(it.qtd) || 1; const esc2 = []; for (let r = 68; r <= 112; r++) { const d = txt(S, 'D' + r); if (d && !/BASE|MAODEOBRA|EMBALAGEM|MISC|TUBULAC|ADITIVO|OUTROS|MIUDEZA|INTERLIGAC/.test(txt(S, 'C' + r) + ' ' + d.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) esc2.push(d); }
        return { nome: txt(S, 'C28'), qtd: q, valores: [val(S, 'B15'), val(S, 'D15'), it.venda, it.venda / q].filter((v) => typeof v === 'number' && v > 0), tecnicos: tk(txt(S, 'C28') + ' ' + txt(S, 'C30')), descricao: txt(S, 'C28'), escopo: esc2 }; }) };
  }
  const propostaAtual = () => (state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null);
  const CF = window.PricerConferencia({ esc, brl, toast, modal, ui, REG, render, log: (e) => logEv(e), salvarDoc: (m, f) => SPV.salvarDoc(Object.assign({ rev: revAtual(), etapa: 'Conferência e aprovação' }, m), f), conferidaOk: (p) => MG.conferidaOk(p),
    propostaAtual: () => { const p = propostaAtual(); if (p && dirty) toast('Há alterações não salvas: salve antes de conferir para valer a versão certa'); return p; }, formacao: () => formacaoConf() });
  const confCard = () => { try { return CF.card(propostaAtual(), formacaoConf()); } catch (e) { return ''; } };

  // ---------- proposta técnica e comercial (modelo PTC LS Fire): o que a formação diz ----------
  const PRP = window.PricerProposta;
  const DLG = window.PricerDlg;
  // folha de dados: o que entra de cada família de insumo (o resto é interno: base, mão de obra, embalagem…); títulos e valores vão como chave e o PDF põe no idioma
  const FD_TIT = { '01': 'motorDiesel', '10': 'motorEletrico', '11': 'bombaCent', '12': 'motobomba', '13': 'jockey', '15': 'tanque', '16': 'silencioso', '17': 'baterias', '19': 'chave', '20': 'painel', '21': 'painel', '22': 'sensores', '26': 'preaq', '29': 'pressostato', '30': 'manovac', '40': 'cabecote', '42': 'manometro', '43': 'recirc', '45': 'acessTanque' };
  const FD_ADIC = { '23': 'valvAlivio', '24': 'cone', '25': 'medidor', '27': 'barrSuc', '28': 'barrRec', '44': 'valvAr' };
  const FD_SEMFAM = [[/A\/H\b|BATERIA/, 'baterias'], [/ACOPLAMENTO/, 'acoplamento'], [/PAINEL LOCAL/, 'painelLocal'], [/TROCADOR/, 'trocadorT'], [/VALVULA DE ALIVIO/, 'valvAlivio'], [/GAVETA/, 'vGaveta'], [/BORBOLETA/, 'vBorb'], [/RENTENCAO|RETENCAO/, 'vRet'], [/FLOW/, 'medidor']];
  const FD_FORA = new Set(['14', '18', '31', '32', '33', '34', '35', '36', '37', '38', '39', '41']);
  // o que vem dentro de um kit também é escopo (motor: painel e chave de partida; bomba: manômetro e manovacuômetro).
  // Entra no documento como linha própria, sem custo: o custo continua no kit, como a planilha calcula
  function kitConteudo(d, q) {
    const km = (REG.kitMotor || []).find((k) => k.desc === d), kb = km ? null : (REG.kitBomba || []).find((k) => k.desc === d);
    const p = (km || kb || {}).p || {}; const tem = (c) => typeof p[c] === 'number' && p[c] > 0; const out = [];
    if (km) { if (tem('F') || tem('E')) out.push(['20', 'PAINEL DE COMANDO DO CONJUNTO DIESEL' + (tem('F') ? '' : ' NBR 13714')]); if (tem('P')) out.push(['19', 'CHAVE DE PARTIDA']); }
    if (kb) { if (tem('E')) out.push(['42', 'MANÔMETRO']); if (tem('F')) out.push(['30', 'MANOVACUÔMETRO']); }
    return out.map(([cod, desc]) => ({ cod, desc, q }));
  }
  const famDoCadastro = (cod) => { const f = famReg(); return f[cod] || f[+cod] || null; };
  const TIPO_BOMBA = { 'END SUCTION': '#endsuction', 'SPLIT CASE': '#splitcase', MONOBLOCO: '#monobloco', 'IN LINE': '#inline', INLINE: '#inline', VERTICAL: '#vertical' };
  const nBR = (v) => (typeof v === 'number' && isFinite(v) ? NF[Number.isInteger(v) ? 0 : Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2].format(v) : String(v || ''));
  const upNoAc = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // atributos da folha de dados tirados da descrição do insumo e do cadastro (nada além do que o app sabe)
  function fdLinhas(cod, desc, fab, ins) {
    const d = upNoAc(desc); const L = [];
    if (['11', '12', '13'].includes(cod) && ins && ins.tipo) L.push(['tipo', TIPO_BOMBA[upNoAc(ins.tipo)] || ins.tipo]);
    if (fab && !/^(VARIOS|0|-)$/.test(upNoAc(fab).trim())) L.push(['marca', fab]);
    L.push(['modelo', desc]);
    if (cod === '01') {
      const m = d.match(/(\d+(?:[.,]\d+)?)\s*HP\s*@?\s*(\d{3,4})\s*RPM/); if (m) L.push(['potencia', m[1] + ' HP @ ' + m[2] + ' rpm']);
      const c = d.match(/(\d+)\s*CIL\b/); if (c) L.push(['cilindros', c[1]]);
      if (/RADIADOR/.test(d)) L.push(['resfr', '#radiador']); else if (/TROCADOR/.test(d)) L.push(['resfr', '#trocador']);
      if (/\bMEC\b/.test(d)) L.push(['injecao', '#mecanica']); else if (/\bELET/.test(d)) L.push(['injecao', '#eletronica']);
    }
    if (cod === '10') { const p = d.match(/(\d+(?:[.,]\d+)?)\s*CV\b/); if (p) L.push(['potencia', p[1] + ' CV']); const po = d.match(/\b(\d{1,2})\s*P(?:OLOS)?\b/); if (po) L.push(['polos', po[1]]); const ip = d.match(/IPW?\s?(\d{2})\b/); if (ip) L.push(['ip', 'IP' + ip[1]]); }
    if (['01', '20', '21', '22'].includes(cod)) { const v = d.match(/\b(12|24)\s*VCC/); if (v) L.push(['tensao', v[1] + ' VCC']); }
    return L;
  }
  const pcGet = () => state.propCom || {};
  function pcSet(k, v) { const pc = Object.assign({}, pcGet()); if (v === undefined) delete pc[k]; else pc[k] = v; state.propCom = pc; dirty = true; persist(); atualizaSaveSt(); }
  // folhas de dados (bomba e motor) que a pessoa conferiu no item: só os campos marcados vão para a proposta
  const fdDoItem = (S) => { const f = (pcGet().fd || {})[S] || {}; const sel = (x) => ((x && x.campos) || []).filter((c) => c.on !== false && c.v).map((c) => [c.k, c.v]); return { bomba: sel(f.bomba), motor: sel(f.motor) }; };
  // especificação pedida por componentes que não se descrevem sozinhos (pintura especial, testes e ensaios, documentos e desenhos):
  // quando o item tem um deles, abre os campos; o essencial vazio gera alerta e o que for preenchido vai para a folha de dados
  const ESPEC_FAM = {
    '35': { k: 'pintura', tit: 'Pintura especial', re: /PINTURA ESPECIAL/, campos: [
      ['norma', 'pNorma', 'Especificação ou padrão a seguir', 'ex.: Petrobras N-1731 · especificação do cliente ET-0000', 1],
      ['preparo', 'pPreparo', 'Preparação de superfície', 'ex.: jateamento abrasivo Sa 2½ (ISO 8501-1)'],
      ['sistema', 'pSistema', 'Esquema de pintura (fundo, intermediária, acabamento)', 'ex.: fundo epóxi rico em zinco + intermediária epóxi + acabamento poliuretano', 0, 1],
      ['acabamento', 'pAcab', 'Pintura final (acabamento)', 'ex.: poliuretano alifático brilhante', 1],
      ['cor', 'pCor', 'Cor final', 'ex.: vermelho segurança RAL 3000 ou Munsell 5R 4/14', 1],
      ['espessura', 'pEsp', 'Espessura total de película seca', 'ex.: 250 µm'],
      ['obs', 'obs', 'Observações', 'ex.: motor e painel na cor original do fabricante', 0, 1]] },
    '46': { k: 'testes', tit: 'Testes e ensaios', re: /\bTESTE\b|ENSAIO|TESTEMUNHAD/, campos: [
      ['quais', 'tQuais', 'Testes e ensaios incluídos', 'ex.: desempenho em fábrica com levantamento de curva, hidrostático', 1, 1],
      ['norma', 'tNorma', 'Norma ou procedimento', 'ex.: NFPA 20 · procedimento do cliente'],
      ['testemunho', 'tTest', 'Testemunho do cliente', 'ex.: testemunhado pelo cliente, com aviso de 10 dias'],
      ['entrega', 'tEntrega', 'O que é entregue', 'ex.: laudo com a curva levantada e certificados dos instrumentos'],
      ['obs', 'obs', 'Observações', '', 0, 1]] },
    '47': { k: 'documentos', tit: 'Documentos e desenhos', re: /DATA ?BOOK|DESENHO|DOCUMENTA/, campos: [
      ['quais', 'dQuais', 'Documentos e desenhos incluídos', 'ex.: desenho dimensional, arranjo geral, diagrama elétrico, data book', 1, 1],
      ['aprovacao', 'dAprov', 'Aprovação do cliente', 'ex.: desenhos para aprovação em até 15 dias após o pedido'],
      ['formato', 'dFormato', 'Idioma e formato', 'ex.: português · PDF e DWG'],
      ['obs', 'obs', 'Observações', '', 0, 1]] },
  };
  // componentes do item (montagem e escopo, com quantidade) que pedem especificação; teste e data book criados antes
  // das famílias 46 e 47 (em mão de obra ou outros) também contam
  function especDetecta(S) {
    const out = {};
    const linhas = []; for (let k = 34; k <= 63; k++) linhas.push(k); for (let k = 68; k <= 112; k++) linhas.push(k);
    for (const k of linhas) {
      const d = txt(S, 'D' + k); const q = qtdNum(val(S, 'F' + k)); if (!d || !(q > 0)) continue;
      const fam = String(txt(S, 'U' + k) || txt(S, 'C' + k) || ''); const cod = /^\d\d\./.test(fam) ? fam.slice(0, 2) : '';
      const c = ESPEC_FAM[cod] ? cod : Object.keys(ESPEC_FAM).find((x) => (!cod || cod === '34' || cod === '41') && ESPEC_FAM[x].re.test(upNoAc(d)));
      if (!c) continue; (out[c] = out[c] || { qtd: 0, descs: [] }).qtd += q; if (!out[c].descs.includes(d)) out[c].descs.push(d);
    }
    return out;
  }
  const especSalva = (S) => ((pcGet().espec || {})[S]) || {};
  const especFaltam = (S, c) => { const v = especSalva(S)[c] || {}; return ESPEC_FAM[c].campos.filter((x) => x[4] && !String(v[x[0]] || '').trim()).map((x) => x[2].toLowerCase()); };
  // o que vai para a folha de dados da proposta (só os campos preenchidos)
  function especDoItem(S) {
    return Object.entries(especDetecta(S)).map(([c, x]) => { const v = especSalva(S)[c] || {}; const E = ESPEC_FAM[c];
      return { qtd: x.qtd, titulo: '@' + E.k, linhas: [['descricao', x.descs.join(' · ')]].concat(E.campos.filter((f) => String(v[f[0]] || '').trim()).map((f) => [f[1], String(v[f[0]]).trim()])) }; });
  }
  function espItemCard(S) {
    const det = especDetecta(S); const cs = Object.keys(det); if (!cs.length) return '';
    const ro = state.verRev ? ' disabled' : ''; const sv = especSalva(S); const sid = S.replace(/\W/g, '');
    return cs.map((c) => { const E = ESPEC_FAM[c]; const v = sv[c] || {}; const falta = especFaltam(S, c);
      return `<section class="card" id="esp_${sid}_${c}"><h2>${esc(E.tit)}: especificação <span class="sub">${esc(det[c].descs.join(' · '))}</span>${falta.length ? ' <span class="pill warn">falta ' + esc(falta.join(', ')) + '</span>' : ' <span class="pill ok">especificada</span>'}</h2>
        <p class="sub" style="margin:0 0 6px">Aparece porque o item tem ${esc(E.tit.toLowerCase())}. O que for preenchido vai para a folha de dados da proposta e fica salvo com ela; os exemplos em cinza são só referência e não entram no documento. <b class="req">*</b> essencial: enquanto faltar, o item fica com alerta.</p>
        <div class="fields">${E.campos.map(([k, , lb, ph, obr, area]) => { const idf = `espf_${sid}_${c}_${k}`; const lab = `<label for="${idf}">${esc(lb)}${obr ? ' <b class="req" title="essencial">*</b>' : ''}</label>`;
          return area ? `<div class="f spanall">${lab}<textarea id="${idf}" data-esp="${esc(S)}|${c}|${k}" rows="2" placeholder="${esc(ph)}"${ro}>${esc(v[k] || '')}</textarea></div>` : `<div class="f span2">${lab}<input id="${idf}" data-esp="${esc(S)}|${c}|${k}" value="${esc(v[k] || '')}" placeholder="${esc(ph)}"${ro}></div>`; }).join('')}</div></section>`; }).join('');
  }
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset || !t.dataset.esp || state.verRev) return;
    const [S, c, k] = t.dataset.esp.split('|'); const all = JSON.parse(JSON.stringify(pcGet().espec || {})); const it = all[S] = all[S] || {}; const g = it[c] = it[c] || {};
    const v = t.value.trim(); if (v) g[k] = v; else delete g[k]; if (!Object.keys(g).length) delete it[c]; if (!Object.keys(it).length) delete all[S];
    pcSet('espec', Object.keys(all).length ? all : undefined); render();
  });
  function propostaDados() {
    if (isSpv()) return SPV.propostaDados(state.spv);
    if (isFacts()) return FX.propostaDados(state.facts);
    const P = 'PROPOSTA'; const itens = []; const fl = { diesel: false, eletrica: false, startup: false, diarias: 0, ulfm: false }; const normas = new Set();
    ITEMS.forEach((S, i) => {
      const r = 33 + i; const total = val(P, 'P' + r); if (!filled(S) || !(typeof total === 'number' && total > 0)) return;
      const bombas = []; for (let b = 23; b <= 26; b++) { const ac = txt(S, 'C' + b); if (ac) bombas.push({ ac, mod: txt(S, 'D' + b), cfg: txt(S, 'E' + b), pot: val(S, 'F' + b), rpm: val(S, 'G' + b), vz: val(S, 'K' + b), pr: val(S, 'L' + b) }); }
      if (bombas.some((b) => b.ac === 'DIESEL')) fl.diesel = true; if (bombas.some((b) => /ELETR|JOCKEY/.test(b.ac))) fl.eletrica = true;
      const su = val(S, 'K12'); if (typeof su === 'number' && su > 0) { fl.startup = true; fl.diarias = Math.max(fl.diarias, num0(val(S, 'F12')) || 1); }
      const nrm = txt(S, 'L21') || txt(P, 'F9'); if (nrm) normas.add(nrm); if (/UL|FM/.test(nrm.toUpperCase())) fl.ulfm = true;
      const comps = [], adic = [];
      const linhas = []; for (let k = 34; k <= 63; k++) linhas.push(k); for (let k = 68; k <= 112; k++) linhas.push(k);
      for (const k of linhas) {
        const d = txt(S, 'D' + k); const q = qtdNum(val(S, 'F' + k)); if (!d || !(q > 0)) continue;
        const fam = String(txt(S, 'U' + k) || txt(S, 'C' + k) || ''); const cod = /^\d\d\./.test(fam) ? fam.slice(0, 2) : '';
        if (FD_FORA.has(cod)) continue;
        const custo = val(S, 'H' + k);
        if (!cod && (!(typeof custo === 'number' && custo > 0) || /TUBULA|ADITIV|MISC|MIUDEZ|INTERLIGA|SOLDAD|EMBALAG|MAO DE OBRA|^BASE\b|OLEO/.test(upNoAc(d)))) continue;
        const famCad = cod && !FD_TIT[cod] && !FD_ADIC[cod] ? famDoCadastro(cod) : null; // família criada no cadastro: sai com o nome dela
        if (cod && !FD_TIT[cod] && !FD_ADIC[cod] && !(famCad && famCad.desc)) continue;
        const ins = insPorProduto(d); const fab = txt(S, 'E' + k) || (ins && ins.fab) || '';
        const ehAdic = FD_ADIC[cod] || (!cod && /VALV|FLOW|CONE|BARRILETE/.test(upNoAc(d)));
        const semFam = !cod ? (FD_SEMFAM.find((x) => x[0].test(upNoAc(d))) || [0, ''])[1] : '';
        const titulo = FD_TIT[cod] ? '@' + (cod === '20' && fl.diesel ? 'painelDiesel' : FD_TIT[cod]) : FD_ADIC[cod] ? '@' + FD_ADIC[cod] : famCad ? famCad.desc : semFam ? '@' + semFam : d;
        (ehAdic ? adic : comps).push({ qtd: q, titulo, linhas: cod ? fdLinhas(cod, d, fab, ins) : [].concat(fab && !/^(VARIOS|0)$/.test(upNoAc(fab)) ? [['marca', fab]] : [], semFam ? [['descricao', d]] : []) });
        for (const x of kitConteudo(d, q)) comps.push({ qtd: x.q, titulo: '@' + (x.cod === '20' && fl.diesel ? 'painelDiesel' : FD_TIT[x.cod]), linhas: [] });
      }
      const vn = val(S, 'AR4');
      const condicao = [...new Set(bombas.filter((b) => typeof b.vz === 'number' && b.vz > 0).map((b) => nBR(b.vz) + ' m³/h x ' + nBR(b.pr) + ' mca'))].join(' · ');
      const acion = { DIESEL: '#diesel', ELETRICA: '#eletrica', ELETRICO: '#eletrica', JOCKEY: '#jockeyA' };
      // no documento do cliente, "sem impostos" desconta só os impostos da nota (ICMS, PIS e COFINS, células P60:P62 do item);
      // o IR/CSLL faz parte do preço e não aparece como imposto destacado. Os valores são os do motor, só reagrupados
      const qd = num0(val(S, 'P17')) || 1; const impNota = ['P60', 'P61', 'P62'].map((a) => val(S, a)).every((x) => typeof x === 'number') ? (val(S, 'P60') + val(S, 'P61') + val(S, 'P62')) * qd : null;
      const semIpiT = val(P, 'M' + r); const semImpDoc = impNota !== null && typeof semIpiT === 'number' ? semIpiT - impNota : val(P, 'K' + r);
      itens.push({ key: S, codigo: (pcGet().codigos || {})[S] || '', qtd: num0(val(P, 'F' + r)) || 1, unitSemImp: impNota !== null && typeof semIpiT === 'number' ? semImpDoc / qd : val(P, 'J' + r), totalSemImp: semImpDoc, totalSemIpi: semIpiT, ipiValor: val(P, 'N' + r), pis: val(P, 'S' + r), cofins: val(P, 'T' + r), un: txt(S, 'H21') || txt(P, 'J10') || 'CJ', pisCofins: num0(val(P, 'S' + r)) + num0(val(P, 'T' + r)), icms: val(P, 'R' + r), ipi: val(P, 'U' + r), ncm: txt(P, 'G' + r),
        unit: val(P, 'O' + r), total, breve: txt(S, 'C27'), completa: txt(S, 'C29'), condicao, bombaDesc: bombaDesc(S),
        pontos: bombas.filter((b) => typeof b.vz === 'number' && b.vz > 0).map((b) => ({ acion: acion[b.ac] || b.ac.toLowerCase(), jockey: b.ac === 'JOCKEY', mod: b.mod, vz: b.vz, pr: typeof b.pr === 'number' ? b.pr : null, pot: typeof b.pot === 'number' && b.pot > 0 ? b.pot : null, rpm: typeof b.rpm === 'number' && b.rpm > 0 ? b.rpm : null })), vazaoNominal: typeof vn === 'number' && vn > 0 ? nBR(vn) + ' USgpm' : '', fd: fdDoItem(S), espec: especDoItem(S), cad: cadastroDoItem(S), escopoG: escopoDoItem(S),
        folha: { componentes: comps, adicionais: adic, hidraulica: bombas.map((b, k) => ({ n: k + 1, acion: acion[b.ac] || b.ac.toLowerCase(), cfg: b.cfg ? TIPO_BOMBA[upNoAc(b.cfg)] || b.cfg.toLowerCase() : '',
          dados: [['modelo', b.mod], ['vazaoNom', typeof vn === 'number' && vn > 0 && b.ac !== 'JOCKEY' ? nBR(vn) + ' USgpm' : ''], ['vazaoProj', typeof b.vz === 'number' && b.vz ? nBR(b.vz) + ' m³/h' : ''], ['pressao', typeof b.pr === 'number' && b.pr ? nBR(b.pr) + ' mca' : ''], ['rotacao', typeof b.rpm === 'number' && b.rpm ? nBR(b.rpm) + ' rpm' : ''], ['potencia', typeof b.pot === 'number' && b.pot ? nBR(b.pot) + ' HP' : '']] })) } });
    });
    const f6 = txt(P, 'F6'); const ac = f6.match(/\s*[·\-–—|,;]?\s*a\/c\.?\s*(.+)$/i);
    return { tipo: 'SEQ', numero: txt(P, 'C5'), rev: txt(P, 'C6'), data: txt(P, 'C7'), validade: txt(P, 'C10'), cliente: txt(P, 'F5'), razao: txt(P, 'F5'), cnpj: txt(P, 'L5'), contato: ac ? ac[1].trim() : '', obra: ac ? f6.slice(0, ac.index).trim() : f6, cidade: '',
      pagamento: txt(P, 'J6'), frete: txt(P, 'B13'), prazo: '', exclusoes: '', vendedor: txt(P, 'C8'), total: val(P, 'P43'), totais: { semImp: itens.every((it) => typeof it.totalSemImp === 'number') ? itens.reduce((t, it) => t + it.totalSemImp, 0) : val(P, 'K43'), semIpi: val(P, 'M43'), ipi: val(P, 'N43') }, itens,
      flags: Object.assign(fl, { normaTxt: [...new Set([...normas].map(PRP.normaTxt))].join(' / ') || 'NFPA 20' }) };
  }
  const cambioPadrao = () => { try { return Number(SPV.cfg().mk.cambio_usd) || 0; } catch (e) { return 0; } };
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  // o que vai no documento e não existe na formação: aparece em Dados gerais (SEQ) e nos dados da SPV
  function pcCampo(k, lb, o = {}) {
    const pc = pcGet(); const v = pc[k] ?? ''; const ro = state.verRev ? ' disabled' : '';
    if (o.area) return `<div class="f ${o.cls || 'spanall'}"><label for="pcf_${k}">${esc(lb)}</label><textarea id="pcf_${k}" data-pc="${k}" rows="${o.rows || 2}" placeholder="${esc(o.ph || '')}"${ro}>${esc(v)}</textarea>${o.dica ? `<small class="sub">${esc(o.dica)}</small>` : ''}</div>`;
    return `<div class="f ${o.cls || ''}"><label for="pcf_${k}">${esc(lb)}</label><input id="pcf_${k}" data-pc="${k}" value="${esc(v)}"${o.num ? ' inputmode="numeric"' : ''} placeholder="${esc(o.ph || '')}"${ro}>${o.dica ? `<small class="sub">${esc(o.dica)}</small>` : ''}</div>`;
  }
  function docPropostaCampos(D) {
    const seq = D.tipo === 'SEQ';
    return `<section class="card"><h2>Para o documento da proposta <span class="sub">vai no PDF gerado na aba ${seq ? 'Documentos' : 'da proposta'}</span></h2><div class="fields">
      ${pcCampo('clienteCurto', 'Nome do cliente no topo das páginas', { cls: 'span2', ph: D.cliente || 'igual ao cliente', dica: 'ex.: COCAMAR SEDE; vazio = nome do cliente' })}${pcCampo('aosCuidados', 'Aos cuidados de', { ph: D.contato || 'nome do contato' })}${pcCampo('cidade', 'Cidade da obra', { ph: 'ex.: MARINGÁ-PR' })}
      ${seq ? pcCampo('prazoFab', 'Prazo de fabricação (dias, DAPC)', { num: true }) + pcCampo('prazoEnt', 'Prazo de entrega (dias, DAE)', { num: true }) : ''}${pcCampo('prazoTexto', seq ? 'Prazo — texto livre (opcional)' : 'Prazo na proposta (opcional)', { area: true, ph: seq ? 'Fabricação + entrega viram "Prazo Total: N dias."' : D.prazo || 'ex.: Prazo para primeira visita: 40 dias.' })}
      ${seq ? pcCampo('observacoes', 'Observações da proposta', { area: true, rows: 3, ph: 'ex.: o detalhe da condição de pagamento' }) : ''}</div></section>`;
  }
  const TIPO_LB = Object.fromEntries(PRP.TIPOS); const LANG_LB = Object.fromEntries(PRP.IDIOMAS);
  function propComCard() {
    let D, E, M; const pc = pcGet(); const tipo = pc.tipoDoc || 'tc', lang = pc.idioma || 'pt';
    try { D = propostaDados(); M = PRP.modelo(REG, lang); E = PRP.efetivo(D, pc, M, lang); } catch (e) { return ''; }
    const ro = state.verRev ? ' disabled' : ''; const seq = D.tipo === 'SEQ';
    const has = (k) => Object.prototype.hasOwnProperty.call(pc, k);
    const reset = (k) => (has(k) ? ` <button type="button" class="linkbtn" data-pcreset="${k}">voltar ao padrão</button>` : '');
    const seg = (nome, ops, cur) => `<div class="seg" role="radiogroup">${ops.map(([k, lb]) => `<label class="${k === cur ? 'on' : ''}"><input type="radio" name="pc_${nome}" data-pcopt="${nome}" value="${k}"${k === cur ? ' checked' : ''}${ro}>${esc(lb)}</label>`).join('')}</div>`;
    const moeda = pc.moeda || {}; const usd = moeda.cod === 'USD'; const taxa = Number(moeda.taxa) || cambioPadrao();
    // o card mostra o que vai no PDF: valores na moeda escolhida (no formato do idioma) e textos já traduzidos, com o original embaixo
    const trd = ((pc.trad || {})[lang]) || {}; const tv = (v) => (lang === 'pt' || !v ? v : trd[v] || v);
    const nfL = new Intl.NumberFormat({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[lang] || 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const din = (v) => (usd && taxa > 0 ? 'US$ ' + nfL.format((Number(v) || 0) / taxa) : usd ? 'US$ —' : 'R$ ' + nfL.format(Number(v) || 0));
    const faltaTr = (lang === 'pt' ? [] : PRP.dinamicos(D, pc)).concat(textosFabTodos(D, pc, lang)).filter((x) => !trd[x]).length;
    const dupla = (v) => { const t = tv(v); return t && t !== v ? `${esc(t)}<br><small class="sub">${esc(v)}</small>` : t ? esc(t) : '<span class="sub">—</span>'; };
    const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0;
    const prazo = [fab ? 'fabricação ' + fab + ' dias' : '', ent ? 'entrega ' + ent + ' dias' : '', fab || ent ? 'total ' + (fab + ent) + ' dias' : '', E.prazoTexto].filter(Boolean).join(' · ');
    const kvs = [['Cliente (topo das páginas)', E.cliente], ['Razão social', E.razao], ['CNPJ', E.cnpj], ['Aos cuidados de', E.aosCuidados], ['Projeto/Obra', E.obra], ['Cidade da obra', E.cidade], ['Número e revisão', (D.numero || '—') + ' · rev. ' + (D.rev ?? '')], ['Data', PRP.dataBR(D.data)], ['Validade', PRP.dataBR(D.validade)], ['Condição de pagamento', E.pagamento], ['Frete', E.frete], ['Prazo', prazo]];
    const faltam = kvs.filter(([lb, v]) => !v && ['Aos cuidados de', 'Condição de pagamento', 'Prazo'].includes(lb)).map((x) => x[0].toLowerCase());
    const ir = seq ? `<button class="btn sm" data-step="1" data-ico="pencil">Alterar em Dados gerais</button>` : `<button class="btn sm" data-pctopo data-ico="pencil">Alterar nos dados da proposta</button>`;
    const SEC = PRP.secoes(D, pc, M, tipo); const base = Object.assign({}, PRP.LAYOUT.tipos[tipo], ((M.layout || {}).tipos || {})[tipo] || {}); const own = ((pc.secoes || {})[tipo]) || {};
    const secOps = PRP.SECOES.filter(([k]) => !['capa', 'planilha'].includes(k) && !(D.tipo !== 'SEQ' && PRP.SO_SEQ.has(k)));
    const fdSt = (S) => { const f = (pc.fd || {})[S] || {}; return ['bomba', 'motor', 'curva'].map((k) => `${{ bomba: 'bomba', motor: 'motor', curva: 'curva' }[k]} ${f[k] ? '<span class="ok-t">✓</span>' : '—'}`).join(' · '); };
    const tr = ((pc.trad || {})[lang]) || {}; const trK = Object.keys(tr);
    const salva = propostaAtual();
    const Ept = lang === 'pt' ? E : PRP.efetivo(D, pc, PRP.modelo(REG, 'pt'), 'pt');
    const area = (k, lb, dica) => `<div class="f spanall"><label for="pc_${k}">${esc(lb)}${reset(k)}</label><textarea id="pc_${k}" data-pc="${k}" rows="${Math.min(12, Math.max(2, String(Ept[k] || '').split('\n').length + 1))}"${ro}>${esc(Ept[k] || '')}</textarea>${dica ? `<small class="sub">${esc(dica)}</small>` : ''}</div>`;
    return `<section class="card" id="pcCard"><h2>Proposta técnica e comercial <span class="sub">PDF no modelo LS Fire (PTC), com os números desta formação</span></h2>
      <div class="pcopts">
        <div class="f"><label>Padrão</label>${seg('estilo', [['ptc', 'Clássico (PTC)'], ['fd', 'Folha de dados (novo)']], pc.estilo === 'fd' ? 'fd' : 'ptc')}</div>
        <div class="f"><label>Documento</label>${seg('tipoDoc', PRP.TIPOS, tipo)}</div>
        <div class="f"><label>Idioma</label>${seg('idioma', PRP.IDIOMAS, lang)}</div>
        <div class="f"><label>Moeda</label>${seg('moeda', [['BRL', 'Real (R$)'], ['USD', 'Dólar (US$)']], usd ? 'USD' : 'BRL')}</div>
        ${usd ? `<div class="f"><label for="pc_taxa">R$ por US$ 1,00</label><input id="pc_taxa" data-pcmoeda="taxa" inputmode="decimal" value="${esc(moeda.taxa ? NF[4].format(moeda.taxa) : '')}" placeholder="${esc(cambioPadrao() ? NF[4].format(cambioPadrao()) : '')}"${ro}><small class="sub">vazio = câmbio do cadastro (${esc(cambioPadrao() ? NF[4].format(cambioPadrao()) : 'não definido')})</small></div><div class="f"><label for="pc_taxad">Data da taxa</label><input id="pc_taxad" type="date" data-pcmoeda="data" value="${esc(moeda.data || hojeISO())}"${ro}></div>` : ''}
      </div>
      ${faltam.length ? `<div class="banner warn" style="margin:8px 0">Falta preencher: ${esc(faltam.join(', '))}. ${seq ? 'Preencha em Dados gerais.' : 'Preencha nos dados da proposta, acima.'}</div>` : ''}
      <div class="docbar" style="margin:8px 0 4px"><button class="btn pri" data-pcgerar data-ico="file-down">Gerar proposta ${esc(TIPO_LB[tipo].toLowerCase())} (PDF${lang !== 'pt' ? ', ' + esc(LANG_LB[lang]) : ''}${usd ? ', US$' : ''})</button><span class="sub">${D.itens.length} item(ns) · total ${esc(din(D.total))}${usd && taxa > 0 ? ' (R$ ' + esc(nfL.format(D.total || 0)) + ' a ' + esc(NF[4].format(taxa)) + ')' : ''} · ${SEC.length} seções${tipo !== 'tec' && lang === 'pt' && !usd ? (salva && !dirty ? ' · o PDF é conferido com a formação e guardado nos documentos' : ' · salve a proposta para o PDF ser conferido e guardado nos documentos') : ' · o PDF é guardado nos documentos'}</span></div>
      ${lang !== 'pt' || faltaTr || tradEm ? `<div class="banner ${tradEm === lang ? 'info' : faltaTr ? 'warn' : 'ok'}" style="margin:0 0 6px">${tradEm === lang ? 'Traduzindo descrições e condições desta proposta…' : faltaTr ? `${faltaTr} texto(s) desta proposta ainda em português. ${ro ? '' : '<button class="btn sm" data-pctraduz data-ico="refresh-cw">Traduzir agora</button>'}` : 'Textos desta proposta traduzidos: confira abaixo (original em cinza) e, se precisar, ajuste em "Traduções desta proposta", mais abaixo.'} ${lang !== 'pt' ? 'Textos padrão e rótulos saem traduzidos com o modelo.' : 'No padrão Folha de dados, o que vem do fabricante em inglês é traduzido para o português.'}</div>` : ''}
      <details class="sub2"${openSet.pc_cab === false ? '' : ' open'} data-keep="pc_cab"><summary>Cabeçalho e condições <span class="sub">vêm de ${seq ? 'Dados gerais e da formação' : 'dados da proposta'}</span></summary>
        <div class="kv pcro">${kvs.map(([lb, v]) => `<div>${esc(lb)}</div><div>${['Projeto/Obra', 'Condição de pagamento', 'Frete'].includes(lb) ? dupla(v) : v ? esc(v) : '<span class="sub">—</span>'}</div>`).join('')}</div>
        <div class="docbar" style="margin-top:8px">${ir}</div></details>
      <details class="sub2"${keep('pc_itens')}><summary>Itens <span class="sub">${seq ? 'código, folha de dados e curva ficam em cada item' : 'vêm da proposta'}</span></summary>
        <div class="tw"><table class="t"><thead><tr><th>#</th><th>Código</th><th>Descrição breve</th>${lang !== 'pt' ? `<th>Descrição (${esc(LANG_LB[lang].toLowerCase())})</th>` : ''}<th class="num">Qtd</th><th class="num">Total${usd ? ' (US$)' : ''}</th>${seq ? '<th>Folha de dados</th><th></th>' : ''}</tr></thead><tbody>${D.itens.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.codigo || '—')}</td><td>${esc(it.breve || '')}</td>${lang !== 'pt' ? `<td>${dupla(seq ? it.completa : it.breve)}</td>` : ''}<td class="num">${esc(nBR(it.qtd))}</td><td class="num">${esc(din(it.total))}</td>${seq ? `<td class="sub">${fdSt(it.key)}</td><td style="white-space:nowrap"><button class="btn sm" data-fdir="${esc(it.key)}" data-ico="upload">${(((pc.fd || {})[it.key]) || {}).fab ? 'Folha do fabricante ✓' : 'Anexar folha do fabricante'}</button> <button class="btn sm" data-goitem="${ITEMS.indexOf(it.key)}">Abrir item</button></td>` : ''}</tr>`).join('')}</tbody></table></div></details>
      <details class="sub2"${keep('pc_notas')}><summary>Textos desta proposta <span class="sub">notas, desvios e exclusões${seq ? '' : ' e observações'}</span></summary><div class="fields">
        ${area('notas', 'Notas', 'Uma por linha. O padrão já considera o que a proposta tem (diesel, elétrica, start-up, norma).' + (lang !== 'pt' ? ' Escreva em português: o texto ajustado é traduzido ao gerar.' : ''))}${area('desvios', 'Desvios')}${area('exclusoes', 'Exclusões')}${seq ? '' : area('observacoes', 'Observações')}</div>
        <div class="docbar"><button class="btn sm" data-pcmodelo data-ico="settings-2">Textos padrão, estrutura e imagens: Modelo da proposta</button></div></details>
      <details class="sub2"${keep('pc_sec')}><summary>Seções e contatos <span class="sub">${esc(TIPO_LB[tipo])}: ${SEC.length} seções</span></summary><div class="fields">
        <div class="f span2"><label>Seções do documento ${esc(TIPO_LB[tipo].toLowerCase())}${(pc.secoes || {})[tipo] ? ` <button type="button" class="linkbtn" data-pcsecreset="${tipo}">voltar ao modelo</button>` : ''}</label><div class="chks" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">${secOps.map(([k, lb]) => `<label class="chk"><input type="checkbox" data-pcsec="${tipo}|${k}"${(own[k] ?? base[k]) ? ' checked' : ''}${ro}> ${esc(lb)}${k === 'comiss' && !(D.flags || {}).startup ? ' <small class="sub">(sem start-up nos itens)</small>' : ''}</label>`).join('')}</div><small class="sub">A ordem e o padrão de cada tipo ficam no Modelo da proposta.</small></div>
        <div class="f span2"><label>Contatos no fim da proposta${reset('contatos')}</label><div class="chks" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">${(M.contatos || []).map((c) => `<label class="chk"><input type="checkbox" data-pcct="${esc(c.nome)}"${(E.contatos || []).includes(c.nome) ? ' checked' : ''}${ro}> ${esc(c.nome)} <small class="sub">${esc(c.cargo || '')}</small></label>`).join('') || '<span class="sub">Nenhum contato no modelo da proposta.</span>'}</div></div></div></details>
      ${lang !== 'pt' ? `<details class="sub2"${keep('pc_tr')}><summary>Traduções desta proposta (${esc(LANG_LB[lang])}) <span class="sub">${trK.length ? trK.length + ' texto(s) para revisar' : 'geradas ao clicar em Gerar'}</span></summary>${trK.length ? `<div class="tw"><table class="t"><thead><tr><th>Português</th><th>${esc(LANG_LB[lang])}</th></tr></thead><tbody>${trK.map((o, i) => `<tr><td class="sub">${esc(o)}</td><td class="in"><textarea data-pctr="${lang}|${i}" rows="${Math.min(6, Math.max(1, Math.ceil(String(tr[o]).length / 70)))}"${ro}>${esc(tr[o])}</textarea></td></tr>`).join('')}</tbody></table></div><div class="docbar" style="margin-top:6px"><button class="btn sm" data-pctrlimpa="${lang}">Traduzir de novo ao gerar</button></div>` : '<p class="sub" style="margin:0">Ao gerar, os textos da formação são traduzidos e aparecem aqui para revisão.</p>'}</details>` : ''}
    </section>`;
  }
  // ---------- folha de dados, curva e código do produto no item (SEQ) ----------
  const FD_KIND = [['bomba', 'Folha de dados da bomba'], ['motor', 'Folha de dados do motor'], ['curva', 'Curva da bomba']];
  function itemPropCard(S) {
    const pc = pcGet(); const f = (pc.fd || {})[S] || {}; const ro = state.verRev ? ' disabled' : '';
    const st = (f.fab ? ['folha do fabricante ✓'] : []).concat(FD_KIND.map(([k, lb]) => (f[k] ? lb.replace(/^Folha de dados d[ao] /, 'FD ').replace('Curva da bomba', 'curva') + ' ✓' : ''))).filter(Boolean).join(' · ');
    const slot = ([k, lb]) => { const x = f[k];
      if (!x) return `<div class="fdslot"><div class="lbl">${esc(lb)}</div><label class="drop" for="fdup_${k}"><b>Solte aqui o PDF${k === 'curva' ? ' do fabricante' : ' ou a imagem'}</b><span class="sub">${k === 'curva' ? 'o app lê a curva e a redesenha no padrão LS Fire' : 'o app lê os dados (vazão, rotação, rotor, sucção, recalque…) para você conferir'}</span><input id="fdup_${k}" type="file" accept="${k === 'curva' ? '.pdf' : '.pdf,image/*'}" data-fdup="${esc(S)}|${k}"${ro} hidden></label></div>`;
      const campos = x.campos || [];
      if (k !== 'curva' && !campos.length && (x.lv || 0) < LEIT_V && !ro) queueMicrotask(() => fdRelerAuto(S, k));
      return `<div class="fdslot"><div class="lbl">${esc(lb)}: <b>${esc(x.nome || '')}</b> <button class="linkbtn" data-fdopen="${esc(x.docId)}">abrir</button>${ro ? '' : ` · <button class="linkbtn" data-fdtira="${esc(S)}|${k}">tirar</button>`}</div>
        ${k === 'curva' ? `<div class="fields"><div class="f"><label for="fdpg_${k}">Página do PDF</label><input id="fdpg_${k}" data-fdpag="${esc(S)}" inputmode="numeric" value="${esc(x.pag || 1)}"${ro}>${x.paginas ? `<small class="sub">de ${x.paginas}</small>` : ''}</div></div>${(x.paginas || 1) > 1 ? `<small class="sub">Clique na página da curva:</small>${thumbsHtml(S, 'curva', x.pag || 1)}` : ''}${curvaSlotHtml(S, x)}`
        : `${campos.length ? `<div class="tw"><table class="t"><thead><tr><th>Vai na proposta</th><th>Campo</th><th>Valor</th><th></th></tr></thead><tbody>${campos.map((c, i) => `<tr><td><input type="checkbox" data-fdon="${esc(S)}|${k}|${i}"${c.on !== false ? ' checked' : ''}${ro} aria-label="Incluir ${esc(c.k)}"></td><td class="in"><input data-fdk="${esc(S)}|${k}|${i}" value="${esc(c.k)}"${ro} aria-label="Campo"></td><td class="in"><input data-fdv="${esc(S)}|${k}|${i}" value="${esc(c.v)}"${ro} aria-label="Valor"></td><td>${ro ? '' : `<button class="btn sm" data-fddel="${esc(S)}|${k}|${i}" aria-label="Tirar a linha">×</button>`}</td></tr>`).join('')}</tbody></table></div>` : `<p class="sub" style="margin:4px 0">${x.lido === false ? 'Não consegui ler dados deste arquivo.' : 'Nenhum campo reconhecido.'} Inclua os campos à mão${claudeOk() ? ' ou leia com Claude' : ''}.</p>`}
          ${ro ? '' : `<div class="docbar" style="margin-top:6px"><button class="btn sm" data-fdadd="${esc(S)}|${k}" data-ico="plus">Incluir campo</button><button class="btn sm" data-fdler="${esc(S)}|${k}">Ler de novo</button>${claudeOk() ? `<button class="btn sm" data-fdclaude="${esc(S)}|${k}">Ler com Claude</button>` : ''}</div>`}`}</div>`; };
    return `<details class="card"${keep('fdprop')}><summary>Proposta: código do produto e folha de dados <span class="sub">${esc([(pc.codigos || {})[S] ? 'código ' + pc.codigos[S] : 'sem código', st].filter(Boolean).join(' · '))}</span></summary>
      <div class="fields"><div class="f"><label for="pccod_${S.replace(/\W/g, '')}">Código do produto (ERP)</label><input id="pccod_${S.replace(/\W/g, '')}" data-pccod="${esc(S)}" value="${esc((pc.codigos || {})[S] || '')}" placeholder="ex.: 004-00242"${ro}><small class="sub">sai na coluna Código da planilha de preços</small></div>
        <div class="f span2"><label for="pcni_${S.replace(/\W/g, '')}">Notas, desvios e observações deste item</label><textarea id="pcni_${S.replace(/\W/g, '')}" data-pcni="${esc(S)}" rows="2"${ro}>${esc((pc.notasItem || {})[S] || '')}</textarea><small class="sub">saem na folha de dados do item</small></div></div>
      ${(() => { const c = cadastroDoItem(S); if (!c.fds.length && !c.faltam.length && !c.desenhos.length) return '';
        return `<div class="fdslot" style="margin-bottom:10px"><div class="lbl">Do cadastro (entra sozinho na folha de dados)</div>
          ${c.fds.map((f) => `<div>✓ <b>${esc(f.uso === 'motor' ? 'Motor' : 'Bomba')}</b> ${esc(f.desc)} <span class="sub">· ${f.secoes.reduce((t, x) => t + x.campos.length, 0)} campos</span></div>`).join('')}
          ${c.faltam.map((f) => `<div>— <b>${esc(f.uso === 'motor' ? 'Motor' : 'Bomba')}</b> ${esc(f.produto)} <span class="sub">sem folha no cadastro</span> <button class="linkbtn" data-insabre="${esc(f.id)}">cadastrar a folha</button></div>`).join('')}
          ${c.desenhos.length ? `<div>✓ <b>Desenho</b> ${c.desenhos.map((d) => esc(d.nome)).join(', ')}</div>` : '<div>— <b>Desenho</b> <span class="sub">sem desenho do modelo ou da família (Engenharia → Famílias)</span></div>'}</div>`; })()}
      ${fabCard(S)}
      <div class="fdgrid">${FD_KIND.map(slot).join('')}</div></details>`;
  }
  // curva da bomba: sempre redesenhada pelo app no padrão LS Fire, com os pontos lidos da página escolhida
  // (tabela de pontos ou o gráfico em vetor do PDF). Sem pontos legíveis, a curva não entra e o item avisa.
  function curvaDados(d, pag) {
    if (!d) return null; const pp = (d.pontosPag || {})[pag] || (d.pontos && (!pag || !d.pontos.pag || d.pontos.pag === pag) ? d.pontos : null);
    return pp ? Object.assign({}, d, { pontos: pp }) : null;
  }
  const curvaOk = (d) => !!(d && window.PricerCurva && window.PricerCurva.temPontos(d));
  const logoCurva = () => (window.PRICER_PROPOSTA_ASSETS || { img: {} }).img['logo-cab'];
  // pontos de trabalho da formação do item (m³/h × mca de cada bomba): a curva usa o que cai sobre ela quando a folha não diz
  const trabItem = (S) => { const L = []; for (let b = 23; b <= 26; b++) { const vz = val(S, 'K' + b), pr = val(S, 'L' + b); if (txt(S, 'C' + b) && typeof vz === 'number' && vz > 0 && typeof pr === 'number' && pr > 0) L.push({ q: vz, h: pr, uq: 'm³/h', uh: 'mca' }); } return L; };
  // descrição da bomba do item (título da curva): a escolhida no item; sem ela, a da primeira bomba principal da formação
  const bombaDesc = (S) => { if (txt(S, 'AR7') || txt(S, 'D19')) return txt(S, 'AR7') || txt(S, 'D19'); for (let b = 23; b <= 26; b++) if (txt(S, 'C' + b) && txt(S, 'C' + b) !== 'JOCKEY' && txt(S, 'D' + b)) return txt(S, 'D' + b); return ''; };
  // ponto informado ao lado da prévia da curva (m³/h × mca): marca a curva e é a base da NFPA 20 quando a folha não traz o nominal
  const pontoCurva = (S) => { const x = (((pcGet().fd || {})[S]) || {}).ponto; return x && x.q > 0 && x.h > 0 ? x : null; };
  const optCurva = (S, lang) => ({ lang, logo: logoCurva(), trabalho: trabItem(S), titulo: bombaDesc(S), ponto: pontoCurva(S) });
  const numTela = (v) => { const s = String(v || '').trim().replace(/\s/g, ''); if (!s) return null; const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s); return isFinite(n) && n > 0 ? n : null; };
  // campos do ponto e tabela da NFPA 20 ao lado da prévia (atualiza a curva ao mudar)
  function curvaPontoHtml(S, k, d) {
    const C = window.PricerCurva; if (!C || !C.nfpa) return ''; const N = C.nfpa(d, optCurva(S, 'pt')); if (!N) return '';
    const ro = state.verRev ? ' disabled' : ''; const man = pontoCurva(S); const U = N.U;
    const fq = /gpm/i.test(U.q) ? 4.402868 : /l\/s/i.test(U.q) ? 1 / 3.6 : 1; // m³/h → unidade da curva
    const q0 = man ? man.q : N.qT ? N.qT / fq : (trabItem(S)[0] || {}).q, h0 = man ? man.h : N.hT || (trabItem(S)[0] || {}).h;
    const v = (x, dd) => (x === null || x === undefined || !isFinite(x) ? '—' : NF[dd].format(x));
    const vq = (q) => (q === null || q === undefined ? '—' : v(q / fq, 0) + ' m³/h' + (fq !== 1 ? ' <span class="sub">(' + v(q, 0) + ' ' + esc(U.q) + ')</span>' : ''));
    const vh = (h) => (h === null || h === undefined ? '—' : v(h, 1) + ' ' + esc(U.h)), vp = (x) => (x === null || x === undefined ? '—' : v(x, 1) + ' ' + esc(U.p));
    const res = (ok) => (ok === null || ok === undefined ? '' : ok ? '<span class="pill ok">atende</span>' : '<span class="pill bad">não atende</span>');
    const orig = man ? 'informado aqui' : N.trabForm ? 'da formação do item (cai sobre a curva)' : N.qT ? 'da folha do fabricante' : '';
    const fora = N.qT && N.desvio !== null && Math.abs(N.desvio) > 0.1 ? `<div class="banner warn" style="margin:8px 0 0">O ponto fica ${v(Math.abs(N.desvio) * 100, 0)}% ${N.desvio > 0 ? 'abaixo' : 'acima'} da curva do fabricante nessa vazão: confira a vazão, a altura e o rotor.</div>` : '';
    const semPonto = !N.qT ? `<div class="banner warn" style="margin:8px 0 0">O ponto de trabalho do item não cai sobre esta curva${trabItem(S).length ? ' (' + trabItem(S).map((t) => nBR(t.q) + ' m³/h × ' + nBR(t.h) + ' mca').join(' · ') + ')' : ''}. Informe o ponto para marcar a curva e conferir a NFPA 20.</div>` : '';
    // ponto (vazão · potência) | altura na curva | exigido pela NFPA 20
    const lin = (nome, q, p, hc, ex, ok) => [`<b>${esc(nome)}</b><br><small class="sub">${vq(q)} · ${vp(p)}</small>`, vh(hc) + (ok === null || ok === undefined ? '' : '<br>' + res(ok)), ex];
    const linhas = N.qN ? [lin(N.base === 'nominal' ? 'Nominal (100%)' : 'Ponto de trabalho (100%)', N.qN, N.pN, N.hN0, vh(N.hN)),
      lin('150% da vazão', N.q150, N.p150, N.h150, N.h150Lim ? 'mín. ' + vh(N.h150Lim) + '<br><small class="sub">65%</small>' : '—', N.ok150),
      lin('Shutoff', 0, N.pSh, N.sh, N.shLim ? 'máx. ' + vh(N.shLim) + '<br><small class="sub">140%</small>' : '—', N.okSh)] : [];
    if (N.qFim) linhas.push(lin('Final da curva', N.qFim, N.pFim, N.hFim, '—'));
    const id0 = 'cvp_' + S.replace(/\W/g, '') + '_' + k;
    return `<div class="cvponto" data-cvbox="${esc(S)}" data-cvq="${q0 ? Math.round(q0 * 10) / 10 : ''}" data-cvh="${h0 ? Math.round(h0 * 10) / 10 : ''}"><div class="lbl"><b>Ponto na curva e NFPA 20</b></div>
      <p class="sub" style="margin:2px 0 8px">Base para marcar a curva e conferir a NFPA 20${orig ? ' · ponto ' + orig : ''}.</p>
      <div class="fields" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="f"><label for="${id0}_q">Vazão (m³/h)</label><input id="${id0}_q" type="text" inputmode="decimal" data-cvponto="${esc(S)}|q" value="${q0 ? esc(nBR(Math.round(q0 * 10) / 10)) : ''}"${ro}></div>
        <div class="f"><label for="${id0}_h">Altura (mca)</label><input id="${id0}_h" type="text" inputmode="decimal" data-cvponto="${esc(S)}|h" value="${h0 ? esc(nBR(Math.round(h0 * 10) / 10)) : ''}"${ro}></div></div>
      ${man && !ro ? `<button type="button" class="linkbtn" data-cvpontolimpa="${esc(S)}">voltar ao ponto do item</button>` : ''}${semPonto}${fora}
      ${linhas.length ? `<div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th>Ponto</th><th>Na curva</th><th>NFPA 20</th></tr></thead><tbody>${linhas.map((l) => '<tr>' + l.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('') + '</tr>').join('')}</tbody></table></div>` : ''}
      ${N.pMax ? `<p class="sub" style="margin:6px 0 0">Potência máxima absorvida na curva: <b>${vp(N.pMax)}</b>.</p>` : ''}
      <p class="sub" style="margin:6px 0 0">NFPA 20: a 150% da vazão, altura de no mínimo 65% da nominal; em shutoff, no máximo 140%. Valores lidos entre os pontos do fabricante, sem extrapolar.</p></div>`;
  }
  const fonteCurva = (d) => (d.pontos.ocr ? 'lida do gráfico da página ' + d.pontos.pag + ' com os números dos eixos reconhecidos na imagem (o PDF não tem texto): confira os valores na prévia (' : '') + (d.pontos.vetor ? (d.pontos.ocr ? '' : 'lida do gráfico da página ' + d.pontos.pag + ' (') + d.pontos.pts.length + ' pontos, com ' + ['eff', 'p', 'npsh'].filter((k) => d.pontos.pts.some((p) => typeof p[k] === 'number')).map((k) => ({ eff: 'rendimento', p: 'potência', npsh: 'NPSH' })[k]).concat(d.pontos.outros && d.pontos.outros.length ? [d.pontos.outros.length + ' outros diâmetros de rotor'] : []).join(', ') + ')'
    : d.pontos.chave ? 'pelos pontos informados na folha (shutoff, mínima, trabalho, nominal e máxima): só a curva de altura' : 'com os ' + d.pontos.pts.length + ' pontos da tabela da página ' + d.pontos.pag);
  const SEM_CURVA = 'Não consegui ler a curva deste arquivo (o PDF não traz o gráfico em vetor nem a tabela de pontos, ou é uma imagem/escaneado). A curva não entra na proposta: peça ao fabricante o PDF original da seleção.';
  function curvaSlotHtml(S, x) {
    if (!x.dados) { if (/\.pdf$/i.test(x.nome || '')) queueMicrotask(() => curvaSlotLer(S)); return /\.pdf$/i.test(x.nome || '') ? '<p class="sub" style="margin:8px 0 0">Lendo a curva…</p>' : `<div class="banner warn" style="margin:8px 0 0">${esc(SEM_CURVA)}</div>`; }
    const d = curvaDados(x.dados, x.pag || 1); if (!curvaOk(d) && (x.dados.lv || 0) < LEIT_V && !state.verRev && /\.pdf$/i.test(x.nome || '')) { queueMicrotask(() => curvaSlotLer(S)); return '<p class="sub" style="margin:8px 0 0">Lendo a curva de novo, agora com o leitor de imagem…</p>'; }
    if (!curvaOk(d)) return `<div class="banner warn" style="margin:8px 0 0">${esc(SEM_CURVA)}${Object.keys(x.dados.pontosPag || {}).length ? ' Páginas com curva legível: ' + Object.keys(x.dados.pontosPag).join(', ') + '.' : ''}</div>`;
    queueMicrotask(() => curvaPrevia(S, 'curva', d));
    return `<small class="sub" style="display:block;margin-top:8px">Curva redesenhada no padrão LS Fire, ${esc(fonteCurva(d))}.</small><div class="cvlado"><img data-cvprev="${esc(S)}|curva" alt="Prévia da curva redesenhada" style="width:100%;max-width:760px;margin-top:6px;border:1px solid var(--line);border-radius:8px;background:#fff">${curvaPontoHtml(S, 'curva', d)}</div>`;
  }
  // versão da leitura: 2 = leitor de imagem (OCR) funcionando no app publicado. Resultados vazios de antes são lidos de novo, uma vez.
  const LEIT_V = 2; const relendoFd = {};
  async function fdRelerAuto(S, k) {
    const id = S + '|' + k; if (relendoFd[id]) return; relendoFd[id] = true;
    try { const x = Object.assign({}, (((pcGet().fd || {})[S]) || {})[k] || {}); const file = await fdArquivo(S, k); if (!file) return;
      const campos = await fdLer(S, k, file, false); x.campos = campos; x.lido = true; x.lv = LEIT_V; fdPut(S, k, x); render(); if (campos.length) toast(campos.length + ' campo(s) lidos de novo: confira');
    } catch (e) { const x = Object.assign({}, (((pcGet().fd || {})[S]) || {})[k] || {}); x.lv = LEIT_V; fdPut(S, k, x); render(); toast('Não consegui ler a folha: ' + errMsg(e)); }
  }
  const lendoCurva = {};
  async function curvaSlotLer(S) {
    if (lendoCurva[S]) return; lendoCurva[S] = true;
    try { const file = await fdArquivo(S, 'curva'); if (!file) return; const d = window.PricerFabricante.ler(await window.PricerLeitor.itensPdf(file, 20, toast));
      const x = Object.assign({}, (((pcGet().fd || {})[S]) || {}).curva || {}); x.dados = { fabricante: d.fabricante, secoes: d.secoes, pontos: d.pontos, pontosPag: d.pontosPag || {}, selecao: d.selecao || '', lv: LEIT_V }; fdPut(S, 'curva', x); render();
    } catch (er) { const x = Object.assign({}, (((pcGet().fd || {})[S]) || {}).curva || {}); if (x.dados) { x.dados = Object.assign({}, x.dados, { lv: LEIT_V }); fdPut(S, 'curva', x); render(); } toast('Não consegui ler a curva: ' + errMsg(er)); } finally { lendoCurva[S] = false; }
  }
  // lê só a curva de um arquivo já guardado (anexado antes da leitura do gráfico em vetor)
  async function relerCurva(S, k) {
    try { const file = await fdArquivo(S, k); if (!file || !(/pdf/i.test(file.type) || /\.pdf$/i.test(file.name))) return null; const d = window.PricerFabricante.ler(await window.PricerLeitor.itensPdf(file, 20, toast));
      return Object.assign({}, d, { pontosPag: d.pontosPag || {}, selecao: d.selecao || '' }); } catch (e) { return null; }
  }
  // folha do fabricante lida antes da leitura do gráfico: lê a curva de novo (uma vez) e guarda
  const relendoFab = {};
  async function fabRelerCurva(S) {
    if (relendoFab[S]) return; relendoFab[S] = true;
    const d2 = await relerCurva(S, 'fab');
    fabMut(S, (G) => { G.dados.lv = LEIT_V; G.dados.pontos = (d2 && d2.pontos) || G.dados.pontos || null; G.dados.pontosPag = (d2 && d2.pontosPag) || {}; if (d2 && d2.pontos && d2.pontos.pag) G.curvaPag = d2.pontos.pag; if (d2 && !(G.dados.secoes || []).length && (d2.secoes || []).length) { for (const g of d2.escopo || []) g.on = false; G.dados = Object.assign(d2, { lv: LEIT_V }); } });
    render();
  }
  const prevCv = {};
  async function curvaPrevia(S, k, d) {
    const lang = pcGet().idioma || 'pt'; const ch = lang + '|' + JSON.stringify(d.pontos) + '|' + (d.secoes || []).length + '|' + JSON.stringify(optCurva(S, lang).ponto || trabItem(S)); const id = S + '|' + k;
    if (!prevCv[id] || prevCv[id].ch !== ch) prevCv[id] = { ch, url: await window.PricerCurva.desenhar(d, optCurva(S, lang)) };
    const el = document.querySelector(`img[data-cvprev="${CSS.escape(id)}"]`); if (el) el.src = prevCv[id].url;
  }
  // folha de dados completa do fabricante (ex.: Peerless Express): lida por posição do texto; tudo fica para conferir
  const TIPO_PAG = { dados: 'dados', curva: 'curva', desenho: 'desenho', anexo: 'anexo', escopo: 'escopo' };
  function fabCard(S) {
    const pc = pcGet(); const F0 = (((pc.fd || {})[S]) || {}).fab; const ro = state.verRev ? ' disabled' : '';
    const intro = '<p class="sub" style="margin:0 0 6px">Para o padrão <b>Folha de dados (novo)</b>: o PDF completo do fabricante (desempenho, construtiva, curvas, arranjo e escopo). O app lê os dados, você confere e escolhe o que vai; a proposta sai com as seções, a curva, os desenhos e o escopo neste layout.</p>';
    if (!F0) return `<div class="fdslot" style="margin-bottom:10px"><div class="lbl">Folha de dados completa do fabricante</div>${intro}<label class="drop" for="fdup_fab"><b>Solte aqui o PDF do fabricante</b><span class="sub">ex.: datasheet da Peerless com várias páginas</span><input id="fdup_fab" type="file" accept=".pdf" data-fdup="${esc(S)}|fab"${ro} hidden></label></div>`;
    const d = F0.dados || { secoes: [], paginas: [], escopo: [], tabelas: [] }; const nC = d.secoes.reduce((t, x) => t + x.campos.length, 0); const nOn = d.secoes.reduce((t, x) => t + x.campos.filter((c) => c.on !== false).length, 0);
    const pj = (d.secoes.find((x) => x.t === 'Project') || { campos: [] }).campos; const mod = (pj.find((c) => /Model$|^Model \//.test(c.k)) || {}).v || '';
    const pags = d.paginas.filter((q) => ['curva', 'desenho', 'anexo'].includes(q.tipo));
    const cmp = fabConfere(S, d);
    return `<div class="fdslot" style="margin-bottom:10px"><div class="lbl">Folha de dados completa do fabricante: <b>${esc(F0.nome || '')}</b> <button class="linkbtn" data-fdopen="${esc(F0.docId)}">abrir</button>${ro ? '' : ` · <button class="linkbtn" data-fdtira="${esc(S)}|fab">tirar</button> · <button class="linkbtn" data-fabler="${esc(S)}">ler de novo</button>`}</div>${intro}
      <div class="kv pcro"><div>Fabricante e modelo</div><div>${esc([d.fabricante, mod].filter(Boolean).join(' · ') || '—')}</div><div>Lido</div><div>${(d.paginas || []).some((q) => q.ocr) ? '<span class="pill warn">texto reconhecido na imagem (o PDF não tem texto): confira tudo</span> ' : ''}${d.ocrErro ? '<span class="pill warn">o PDF não tem texto e o reconhecimento de imagem não funcionou aqui: ' + esc(d.ocrErro.slice(0, 80)) + '</span> ' : ''}${d.paginas.length} páginas · ${d.secoes.length} seções · ${nOn} de ${nC} campos marcados · ${d.escopo.length} grupos de escopo · ${d.tabelas.length} tabela(s)</div></div>
      ${cmp.length ? `<div class="banner warn" style="margin:8px 0">${cmp.map(esc).join('<br>')}</div>` : ''}
      ${(() => { const dc = curvaDados(d, F0.curvaPag); const cps = Object.keys(d.pontosPag || {}).map(Number);
        const sel = cps.length > 1 ? `<div class="f" style="max-width:360px;margin-top:6px"><label for="fabcv_${S.replace(/\W/g, '')}">Página da curva</label><select id="fabcv_${S.replace(/\W/g, '')}" data-fabcurva="${esc(S)}"${ro}>${cps.map((n) => `<option value="${n}"${F0.curvaPag === n ? ' selected' : ''}>página ${n}: ${esc((d.paginas.find((q) => q.n === n) || {}).titulo || '')}</option>`).join('')}</select></div>` : '';
        if (!ro && ((!curvaOk(dc) && !d.pontosPag) || ((d.lv || 0) < LEIT_V && (!(d.secoes || []).length || !curvaOk(dc))))) { queueMicrotask(() => fabRelerCurva(S)); return '<p class="sub" style="margin:8px 0 0">Lendo a folha de novo, agora com o leitor de imagem…</p>'; }
        if (!curvaOk(dc)) return `<div class="banner warn" style="margin:8px 0">${esc(SEM_CURVA)}</div>${sel}`;
        queueMicrotask(() => curvaPrevia(S, 'fab', dc));
        return `<div class="f spanall" style="margin-top:8px"><label>Curva na proposta</label><small class="sub">Redesenhada no padrão LS Fire, ${esc(fonteCurva(dc))}, com o ponto de trabalho e os pontos da NFPA 20 (ao lado: o ponto usado e a conferência).</small>${sel}
          <div class="cvlado"><img data-cvprev="${esc(S)}|fab" alt="Prévia da curva redesenhada" style="width:100%;max-width:760px;margin-top:8px;border:1px solid var(--line);border-radius:8px;background:#fff">${curvaPontoHtml(S, 'fab', dc)}</div></div>`; })()}
      <div class="fields" style="margin-top:8px">
        <div class="f span2"><label>Páginas que entram como imagem</label><div class="chks" style="display:flex;flex-direction:column;gap:4px">${pags.map((q) => `<label class="chk"><input type="checkbox" data-fabpag="${esc(S)}|${q.n}"${(F0.pags || {})[q.n] ? ' checked' : ''}${ro}> página ${q.n}: ${esc(q.titulo)} <small class="sub">${TIPO_PAG[q.tipo]}</small></label>`).join('') || '<span class="sub">nenhuma</span>'}</div></div>
        <div class="f span2"><label>Escopo da proposta</label><div class="chks" style="display:flex;flex-direction:column;gap:4px"><label class="chk"><input type="checkbox" data-fabls="${esc(S)}"${F0.semLs ? '' : ' checked'}${ro}> Incluir também os itens da formação LS Fire</label></div><small class="sub">desmarque se o escopo do fabricante já cobre tudo</small></div></div>
      ${d.secoes.map((x, si) => `<details class="sub2"${keep('fab_' + S + '_' + si)}><summary>${esc(x.t === 'Project' ? 'Identificação (não vai por padrão)' : x.t)}${x.t !== 'Project' && window.PricerFabricante && window.PricerFabricante.secT(x.t, 'pt') && window.PricerFabricante.secT(x.t, 'pt') !== x.t ? ' <span class="sub">· ' + esc(window.PricerFabricante.secT(x.t, 'pt')) + '</span>' : ''} <span class="sub">${x.campos.filter((c) => c.on !== false).length}/${x.campos.length} · página ${x.pag}</span></summary>
        <div class="tw"><table class="t"><thead><tr><th>Vai</th><th>Campo (como no fabricante)</th><th>Valor</th></tr></thead><tbody>${x.campos.map((c, ci) => `<tr><td><input type="checkbox" data-fabon="${esc(S)}|${si}|${ci}"${c.on !== false ? ' checked' : ''}${ro} aria-label="Incluir ${esc(c.k)}"></td><td>${esc(c.k)}</td><td class="in"><input data-fabv="${esc(S)}|${si}|${ci}" value="${esc(c.v)}"${ro} aria-label="Valor de ${esc(c.k)}"></td></tr>`).join('')}</tbody></table></div></details>`).join('')}
      ${d.escopo.length ? `<details class="sub2"${keep('fab_esc_' + S)}><summary>Escopo do fabricante <span class="sub">${d.escopo.filter((g) => g.on !== false).length}/${d.escopo.length} grupos</span></summary><div class="chks" style="display:flex;flex-direction:column;gap:6px">${d.escopo.map((g, gi) => `<label class="chk"><input type="checkbox" data-fabg="${esc(S)}|${gi}"${g.on !== false ? ' checked' : ''}${ro}> <b>${esc(g.g)}</b> <small class="sub">${g.linhas.length} linhas: ${esc(g.linhas.slice(0, 4).map((l) => l.t).join(' · '))}…</small></label>`).join('')}</div></details>` : ''}
    </div>`;
  }
  // confere a folha do fabricante com a formação: vazão e altura nominais
  function fabConfere(S, d) {
    const out = []; const v = (re) => { for (const s of d.secoes) { if (s.t === 'NFPA Limits' || s.t === 'Project') continue; const c = s.campos.find((x) => re.test(x.k)); if (c) return c.v; } return ''; };
    const n = (t) => Number(String(t || '').replace(/,/g, '').match(/[\d.]+/)?.[0]);
    // vazão em USgpm (Peerless) ou m³/h (Sempa: "Flow" dos dados de operação), comparada em USgpm
    const fv = v(/^Flow, rated$/) || v(/^Flow$/); const vz = /m[³3]\s*\/\s*h/i.test(fv) ? n(fv) * 4.402868 : n(fv); const vzF = val(S, 'AR4'); if (vz && typeof vzF === 'number' && vzF > 0 && Math.abs(vz - vzF) / vzF > 0.02) out.push('Vazão nominal na folha do fabricante (' + (/m[³3]/.test(fv) ? fv + ' = ' : '') + nBR(Math.round(vz)) + ' USgpm) diferente da formação (' + nBR(vzF) + ' USgpm).');
    const hd = n(v(/^Differential head.*\(actual\)|^Differential head \/ pressure, rated$/)) || n(v(/^Head$/)); let hF = null; for (let b = 23; b <= 26; b++) if (/DIESEL|ELETR/.test(txt(S, 'C' + b)) && typeof val(S, 'L' + b) === 'number') { hF = val(S, 'L' + b); break; }
    if (hd && hF && Math.abs(hd - hF) / hF > 0.03) out.push('Altura nominal na folha do fabricante (' + nBR(hd) + ' m) diferente da formação (' + nBR(hF) + ' mca).');
    return out;
  }
  let sampleP;
  const claudeOk = () => !!(window.claude && window.claude.use);
  const sampleFn = () => (sampleP || (sampleP = (async () => { try { return claudeOk() ? await window.claude.use('sample') : null; } catch (e) { return null; } })()));
  async function docBlob(id) { try { return await SPV.blobDoc(id); } catch (e) { return null; } }
  const blobURL = (b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  function fdPut(S, k, v) { const fd = JSON.parse(JSON.stringify(pcGet().fd || {})); fd[S] = fd[S] || {}; if (v === undefined) delete fd[S][k]; else fd[S][k] = v; pcSet('fd', fd); }
  async function fdLer(S, k, file, comClaude) {
    let campos = [];
    if (comClaude) {
      const sample = await sampleFn(); if (!sample) throw new Error('A leitura com Claude não está disponível aqui.');
      toast('Lendo com Claude…'); let texto = '';
      try { texto = (await window.PricerLeitor.partes(file, toast)).map((r) => r.join(' | ')).join('\n'); } catch (e) { texto = ''; }
      // sem texto aproveitável: manda a imagem das páginas (onde o Claude desta tela aceita imagens)
      let imagens; if (texto.replace(/\W/g, '').length < 60) { const lim = sample.limits ? await sample.limits().catch(() => null) : null;
        if (!lim || !lim.images) throw new Error('O PDF não tem texto e a leitura de imagem com Claude não está disponível aqui.');
        const pgs = await window.PricerLeitor.paginasImagem(file, Math.min(lim.images.maxCount || 4, 4), 1.6);
        imagens = pgs.map((q) => { const [cab, b64] = q.url.split(','); const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: (/data:([^;]+)/.exec(cab) || [0, 'image/jpeg'])[1] }); }); }
      const res = await sample.json(`Extraia da folha de dados (datasheet) de ${k === 'bomba' ? 'uma bomba de incêndio' : 'um motor (diesel ou elétrico)'} os campos técnicos que estiverem no texto. Use rótulos curtos em português (ex.: Fabricante, Modelo, Vazão, Altura manométrica, Rotação, Diâmetro do rotor, Potência, Rendimento, NPSH requerido, Sucção, Recalque, Vedação, Material da carcaça, Tensão, Frequência, Número de polos, Grau de proteção). Copie os valores como estão, com as unidades; não invente nada que não esteja no texto. Responda só JSON: {"campos": [{"campo": "...", "valor": "..."}]}.${imagens ? '\n\nO PDF não tem texto selecionável: leia os campos das imagens das páginas anexadas (uma imagem por página).' : ''}\n\nTEXTO:\n${texto.slice(0, 24000) || '(sem texto)'}`, imagens ? { images: imagens } : undefined);
      campos = ((res && res.campos) || []).filter((c) => c && c.campo && c.valor).slice(0, 40).map((c) => ({ k: String(c.campo).slice(0, 40), v: String(c.valor).slice(0, 80), on: true }));
    } else {
      const rows = await window.PricerLeitor.partes(file, toast); campos = PRP.lerFolhaDados(rows, k);
    }
    return campos;
  }
  async function fabLerArquivo(S, file, base) {
    toast('Lendo a folha de dados do fabricante…');
    const pgs = await window.PricerLeitor.itensPdf(file, 40, toast); const dados = window.PricerFabricante.ler(pgs); dados.lv = LEIT_V;
    const cv = (dados.pontos && dados.pontos.pag ? dados.paginas.find((q) => q.n === dados.pontos.pag) : null) || dados.paginas.find((q) => q.tipo === 'curva' && !/Multi/i.test(q.titulo)) || dados.paginas.find((q) => q.tipo === 'curva');
    const pags = {}; for (const q of dados.paginas) if (q.tipo === 'desenho' && /Arrangement/i.test(q.titulo)) pags[q.n] = true;
    for (const g of dados.escopo || []) g.on = false;
    fdPut(S, 'fab', Object.assign({}, base, { dados, curvaPag: cv ? cv.n : null, pags })); render();
    const nC = dados.secoes.reduce((t, x) => t + x.campos.length, 0);
    toast(nC ? nC + ' campos, ' + dados.escopo.length + ' grupos de escopo e ' + dados.paginas.filter((q) => q.tipo !== 'dados').length + ' páginas de curva/desenho: confira antes de gerar' : 'Arquivo guardado; não reconheci dados nesta folha');
    if ((pcGet().idioma || 'pt') !== 'en' && pcGet().estilo === 'fd') traduzirAgora();
  }
  // miniaturas das páginas de um arquivo do item, para clicar na página da curva
  const thumbsCache = {};
  const thumbsHtml = (S, k, sel) => { queueMicrotask(() => fillThumbs(S, k)); return `<div class="thumbs" data-thumbs="${esc(S)}|${k}" data-sel="${sel || ''}"><span class="sub">carregando as páginas…</span></div>`; };
  async function fillThumbs(S, k) {
    const x = (((pcGet().fd || {})[S]) || {})[k]; if (!x || !x.docId) return;
    try { if (!thumbsCache[x.docId]) { const file = await fdArquivo(S, k); if (!file) return; thumbsCache[x.docId] = await window.PricerLeitor.miniaturas(file, 16); }
      const el = document.querySelector(`[data-thumbs="${CSS.escape(S + '|' + k)}"]`); if (!el) return; const sel = +el.dataset.sel || 0;
      el.innerHTML = thumbsCache[x.docId].map((t) => `<button type="button" class="${t.n === sel ? 'on' : ''}" data-thumbpg="${esc(S)}|${k}|${t.n}" title="Usar a página ${t.n} como curva"${state.verRev ? ' disabled' : ''}><img src="${t.url}" alt="Página ${t.n}"><span>p. ${t.n}</span></button>`).join('');
    } catch (er) { const el = document.querySelector(`[data-thumbs="${CSS.escape(S + '|' + k)}"]`); if (el) el.innerHTML = '<span class="sub">Não consegui mostrar as páginas.</span>'; }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-thumbpg]'); if (!b || state.verRev) return; const [S, k, n] = b.dataset.thumbpg.split('|');
    if (k === 'curva') { const x = Object.assign({}, (((pcGet().fd || {})[S]) || {}).curva || {}); x.pag = +n; fdPut(S, 'curva', x); } else fabMut(S, (F0) => { F0.curvaPag = +n; });
    render(); toast('Curva: página ' + n); });
  const fabCurvaDados = (F0) => (F0 ? curvaDados(F0.dados, F0.curvaPag) : null);
  const fabMut = (S, fn) => { const F0 = JSON.parse(JSON.stringify((((pcGet().fd || {})[S]) || {}).fab || null)); if (!F0) return; fn(F0); fdPut(S, 'fab', F0); };
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset || state.verRev) return; const ds = t.dataset;
    if (ds.fabon || ds.fabv) { const [S, si, ci] = (ds.fabon || ds.fabv).split('|'); fabMut(S, (F0) => { const c = F0.dados.secoes[+si].campos[+ci]; if (ds.fabon) c.on = t.checked; else c.v = t.value.trim(); }); if (ds.fabon) render(); return; }
    if (ds.fabg) { const [S, gi] = ds.fabg.split('|'); fabMut(S, (F0) => { F0.dados.escopo[+gi].on = t.checked; }); render(); return; }
    if (ds.fabpag) { const [S, n] = ds.fabpag.split('|'); fabMut(S, (F0) => { F0.pags = Object.assign({}, F0.pags, { [n]: t.checked }); if (!t.checked) delete F0.pags[n]; }); return; }
    if (ds.fabcurva !== undefined) { fabMut(ds.fabcurva, (F0) => { F0.curvaPag = t.value ? +t.value : null; }); render(); return; }
    if (ds.fabls !== undefined) { fabMut(ds.fabls, (F0) => { F0.semLs = !t.checked; }); return; }
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-cvpontolimpa]'); if (!b || state.verRev) return; fdPut(b.dataset.cvpontolimpa, 'ponto', undefined); render(); });
  // ponto informado: grava quando o foco sai dos dois campos (Tab da vazão para a altura não redesenha no meio da digitação) ou com Enter
  const cvPontoGrava = (box) => { const S = box.dataset.cvbox; const lerC = (cc) => (box.querySelector(`[data-cvponto="${CSS.escape(S + '|' + cc)}"]`) || {}).value || '';
    const tq = lerC('q'), th = lerC('h'); if ((tq.trim() && !numTela(tq)) || (th.trim() && !numTela(th))) { toast('Valor inválido: use números (ex.: 568 ou 105,5).'); return; }
    const q = numTela(tq), h = numTela(th); const atual = pontoCurva(S); const ref = atual || (box.dataset.cvq ? { q: +box.dataset.cvq, h: +box.dataset.cvh } : null);
    if (q && h && ref && Math.abs(ref.q - q) < 0.05 && Math.abs(ref.h - h) < 0.05) return; if (!(q && h) && !atual) return;
    fdPut(S, 'ponto', q && h ? { q, h } : undefined); render(); };
  document.addEventListener('focusout', (e) => { const t = e.target; if (!t.dataset || !t.dataset.cvponto || state.verRev) return; const box = t.closest('.cvponto'); if (!box) return;
    const noPar = (el) => !!(el && el.matches && el.matches('[data-cvponto]') && box.contains(el)); if (noPar(e.relatedTarget)) return;
    setTimeout(() => { if (box.isConnected && !noPar(document.activeElement)) cvPontoGrava(box); }, 0); });
  document.addEventListener('keydown', (e) => { const t = e.target; if (e.key !== 'Enter' || !t.dataset || !t.dataset.cvponto || state.verRev) return; e.preventDefault(); const box = t.closest('.cvponto'); if (box) cvPontoGrava(box); });
  // do cartão da proposta direto para o bloco da folha do fabricante no item
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-insabre]'); if (b) { ui.cad = 'insumos'; insumoModal(b.dataset.insabre); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-fdir]'); if (!b) return; const i = ITEMS.indexOf(b.dataset.fdir); if (i < 0) return;
    ui.item = i; ui.itemFull = false; openSet.fdprop = true; ui.cfgEt = Object.assign({}, ui.cfgEt, { [ITEMS[i]]: 3 }); if (ui.view !== 'item') setView('item'); else render();
    setTimeout(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) { d.open = true; const alvo = d.querySelector('[data-fdup$="|fab"]') ? d.querySelector('[data-fdup$="|fab"]').closest('.fdslot') : d.querySelector('[data-fabler]')?.closest('.fdslot'); (alvo || d).scrollIntoView({ block: 'start' }); } }, 80); });
  document.addEventListener('click', async (e) => { const b = e.target.closest('[data-fabler]'); if (!b || state.verRev) return; const S = b.dataset.fabler;
    try { const F0 = (((pcGet().fd || {})[S]) || {}).fab; const file = await fdArquivo(S, 'fab'); if (!F0 || !file) { toast('Não encontrei o arquivo.'); return; } if (!await DLG.confirmar('Ler de novo? As marcações e correções feitas nesta folha voltam ao que o app lê.')) return; await fabLerArquivo(S, file, { docId: F0.docId, nome: F0.nome }); } catch (er) { toast(errMsg(er)); } });
  async function fdArquivo(S, k) { const x = (((pcGet().fd || {})[S]) || {})[k]; if (!x) return null; const b = await docBlob(x.docId); return b ? new File([b], x.nome || 'arquivo', { type: b.type || (/\.pdf$/i.test(x.nome || '') ? 'application/pdf' : '') }) : null; }
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!t.dataset || state.verRev) return;
    if (t.dataset.fdup) {
      const [S, k] = t.dataset.fdup.split('|'); const file = t.files && t.files[0]; t.value = ''; if (!file) return;
      try {
        toast('Guardando o arquivo…');
        const docId = await SPV.salvarDoc({ tipo: k === 'curva' ? 'curva da bomba' : 'folha de dados', nome: file.name, propUid: state.uid || null, propNome: docTitle(), item: S, etapa: 'Proposta', notas: (k === 'fab' ? 'Folha de dados completa do fabricante' : (FD_KIND.find((x) => x[0] === k) || [0, ''])[1]) + ' · ' + S, itens: [] }, file);
        if (k === 'fab') { await fabLerArquivo(S, file, { docId, nome: file.name }); return; }
        if (k === 'curva') { let paginas = 1, pag = 1, dados = null;
          try { paginas = (await window.PricerLeitor.paginaImagem(file, 1, 0.3)).paginas;
            if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) { const d = window.PricerFabricante.ler(await window.PricerLeitor.itensPdf(file, 20, toast)); dados = { fabricante: d.fabricante, secoes: d.secoes, pontos: d.pontos, pontosPag: d.pontosPag || {}, selecao: d.selecao || '' };
              const cv = d.pontos && d.pontos.pag ? { n: d.pontos.pag } : d.paginas.find((q) => q.tipo === 'curva'); if (cv) pag = cv.n; } } catch (er) { /* a página é escolhida depois */ }
          fdPut(S, k, { docId, nome: file.name, pag, paginas, dados: dados || { secoes: [], pontos: null, pontosPag: {} } });
          toast(curvaOk(curvaDados(dados, pag)) ? 'Curva lida (página ' + pag + '): confira a prévia no padrão LS Fire' : 'Arquivo guardado, mas não consegui ler a curva'); render(); return; }
        let campos = [], lido = true; try { toast('Lendo a folha de dados…'); campos = await fdLer(S, k, file, false); } catch (er) { lido = false; }
        fdPut(S, k, { docId, nome: file.name, campos, lido, lv: LEIT_V }); render();
        toast(campos.length ? campos.length + ' campo(s) lidos: confira antes de gerar a proposta' : 'Arquivo guardado; nenhum campo reconhecido');
      } catch (er) { toast(errMsg(er)); }
      return;
    }
    const pega = (a) => { const [S, k, i] = a.split('|'); const fd = JSON.parse(JSON.stringify(pcGet().fd || {})); const x = ((fd[S] || {})[k]) || null; return { S, k, i: +i, fd, x }; };
    if (t.dataset.fdon || t.dataset.fdk || t.dataset.fdv) { const { S, k, i, fd, x } = pega(t.dataset.fdon || t.dataset.fdk || t.dataset.fdv); if (!x || !x.campos || !x.campos[i]) return; if (t.dataset.fdon) x.campos[i].on = t.checked; else if (t.dataset.fdk) x.campos[i].k = t.value.trim(); else x.campos[i].v = t.value.trim(); fd[S][k] = x; pcSet('fd', fd); return; }
    if (t.dataset.fdpag) { const S = t.dataset.fdpag; const x = Object.assign({}, (((pcGet().fd || {})[S]) || {}).curva || {}); const n = parseInt(t.value, 10); x.pag = n > 0 ? Math.min(n, x.paginas || n) : 1; fdPut(S, 'curva', x); render(); }
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fdopen],[data-fdtira],[data-fddel],[data-fdadd],[data-fdler],[data-fdclaude]'); if (!b) return;
    if (b.dataset.fdopen) { const d = (SPV.docs() || []).find((x) => x.id === b.dataset.fdopen); if (d) SPV.abrirDoc(d, false); else toast('Não encontrei o arquivo.'); return; }
    if (state.verRev) return;
    const [S, k, i] = (b.dataset.fdtira || b.dataset.fddel || b.dataset.fdadd || b.dataset.fdler || b.dataset.fdclaude).split('|');
    if (b.dataset.fdtira) { if (!await DLG.confirmar('Tirar este arquivo da proposta? (ele continua nos documentos)')) return; fdPut(S, k, undefined); render(); return; }
    const x = JSON.parse(JSON.stringify((((pcGet().fd || {})[S]) || {})[k] || {}));
    if (b.dataset.fddel) { (x.campos || []).splice(+i, 1); fdPut(S, k, x); render(); return; }
    if (b.dataset.fdadd) { x.campos = (x.campos || []).concat([{ k: 'Campo', v: '', on: true }]); fdPut(S, k, x); render(); return; }
    try { const file = await fdArquivo(S, k); if (!file) { toast('Não encontrei o arquivo.'); return; } const campos = await fdLer(S, k, file, !!b.dataset.fdclaude); x.campos = campos; x.lido = true; x.lv = LEIT_V; fdPut(S, k, x); render(); toast(campos.length ? campos.length + ' campo(s) lidos: confira' : 'Nenhum campo reconhecido'); } catch (er) { toast(errMsg(er)); }
  });
  // ---------- tradução dos textos da formação (descrições, pagamento, frete, textos ajustados) ----------
  // tradução assim que o idioma muda: o card já mostra o resultado, e o PDF reaproveita o que ficou guardado
  let tradEm = null;
  async function traduzirAgora() {
    const lang = pcGet().idioma || 'pt'; if (tradEm || state.verRev) return;
    let D; try { D = propostaDados(); } catch (er) { return; }
    const tr0 = ((pcGet().trad || {})[lang]) || {}; if (!(lang === 'pt' ? [] : PRP.dinamicos(D, pcGet())).concat(textosFabTodos(D, pcGet(), lang)).some((x) => !tr0[x])) return;
    tradEm = lang; render();
    try { const { aviso } = await tradutor(D, pcGet(), lang); if (aviso) toast(aviso); } catch (er) { toast(errMsg(er)); } finally { tradEm = null; render(); }
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-pctraduz]')) traduzirAgora(); });
  // textos da folha de dados do fabricante (em inglês) que o dicionário não cobre: só no padrão Folha de dados
  const fabDados = (pc, S) => ((((pc.fd || {})[S]) || {}).fab || {}).dados || null;
  const textosFabTodos = (D, pc, lang) => (pc.estilo === 'fd' && window.PricerPropostaFD ? [...new Set(D.itens.flatMap((it) => window.PricerPropostaFD.textosFab(fabDados(pc, it.key), lang).concat(window.PricerPropostaFD.textosFab({ secoes: ((it.cad || {}).fds || []).flatMap((f) => f.secoes.map((q) => ({ t: q.t, campos: q.campos.map(([k, v]) => ({ k, v, on: true })) }))) }, lang))))] : []);
  async function tradutor(D, pc, lang) {
    const lista = lang === 'pt' ? [] : PRP.dinamicos(D, pc); const cache = Object.assign({}, ((pc.trad || {})[lang]) || {}); const falta = lista.filter((s) => !cache[s]);
    const faltaEN = textosFabTodos(D, pc, lang).filter((s) => !cache[s]);
    let aviso = '';
    if (faltaEN.length) {
      const sample = await sampleFn(); const alvo = lang === 'pt' ? 'português do Brasil' : 'espanhol';
      if (!sample) aviso = 'Tradução automática indisponível aqui: parte da folha de dados do fabricante ficou em inglês.';
      else for (let i = 0; i < faltaEN.length; i += 40) {
        const lote = faltaEN.slice(i, i + 40);
        try {
          const res = await sample.json(`Traduza do inglês para o ${alvo} os textos abaixo, tirados da folha de dados de um fabricante de bombas de incêndio (NFPA 20). Use os termos técnicos usuais no Brasil (vazão, altura manométrica, rotor, carcaça, gaxeta, acionador, painel de comando). Mantenha códigos, números, unidades, normas, modelos e nomes próprios como estão. Responda só JSON: {"t": ["tradução 1", ...]} com o mesmo número de itens e na mesma ordem.\n\nTEXTOS:\n${JSON.stringify(lote)}`);
          const t = (res && res.t) || []; lote.forEach((s, j) => { if (t[j]) cache[s] = String(t[j]); });
        } catch (er) { aviso = 'Parte da tradução da folha de dados do fabricante falhou: alguns textos ficaram em inglês.'; }
      }
      if (sample && !falta.length) pcSet('trad', Object.assign({}, pc.trad || {}, { [lang]: cache }));
    }
    if (falta.length) {
      const sample = await sampleFn();
      if (!sample) aviso = 'Tradução automática indisponível aqui: descrições e textos da formação ficaram em português.';
      else {
        const alvo = lang === 'en' ? 'inglês' : 'espanhol';
        for (let i = 0; i < falta.length; i += 40) {
          const lote = falta.slice(i, i + 40);
          try {
            const res = await sample.json(`Traduza do português do Brasil para o ${alvo} os textos abaixo, de uma proposta técnica e comercial de bombas de incêndio (NFPA 20, NFPA 25). Mantenha códigos, números, unidades, siglas, normas, modelos e nomes próprios como estão. Responda só JSON: {"t": ["tradução 1", "tradução 2", ...]} com o mesmo número de itens e na mesma ordem.\n\nTEXTOS:\n${JSON.stringify(lote)}`);
            const t = (res && res.t) || []; lote.forEach((s, j) => { if (t[j]) cache[s] = String(t[j]); });
          } catch (er) { aviso = 'Parte da tradução automática falhou: alguns textos ficaram em português.'; }
        }
        pcSet('trad', Object.assign({}, pc.trad || {}, { [lang]: cache }));
      }
    }
    return { tr: (s) => cache[s] || s, aviso };
  }
  async function gerarProposta() {
    const pc = pcGet(); const tipo = pc.tipoDoc || 'tc', lang = pc.idioma || 'pt';
    const D = propostaDados(); if (!D.itens.length) { toast('Nenhum item com preço para a proposta'); return; }
    const M = PRP.modelo(REG, lang); toast('Montando a proposta…');
    const img = {}; for (const [k, c] of Object.entries(M.imagens || {})) if (c && c.docId) { const b = await docBlob(c.docId); if (b) img[k] = await blobURL(b); }
    const curvas = {}, nfpa = {};
    // curva sempre no padrão LS Fire: redesenhada com os pontos lidos; sem pontos legíveis, fica de fora (o item já avisa)
    const semCurva = [];
    if (D.tipo === 'SEQ') for (const it of D.itens) { const cv = (((pc.fd || {})[it.key]) || {}).curva; if (!cv) continue; let dc = curvaDados(cv.dados, cv.pag || 1);
      // curva anexada antes da leitura do gráfico (ou lida sem resultado): lê o arquivo de novo agora
      if (!curvaOk(dc)) { const d2 = await relerCurva(it.key, 'curva'); if (d2) { dc = curvaDados(d2, cv.pag || 1) || curvaDados(d2, null); if (curvaOk(dc)) { const x = Object.assign({}, cv, { dados: d2 }); fdPut(it.key, 'curva', x); } } }
      try { if (curvaOk(dc)) { curvas[it.key] = await window.PricerCurva.desenhar(dc, optCurva(it.key, lang)); nfpa[it.key] = window.PricerCurva.nfpa(dc, optCurva(it.key, lang)); } else semCurva.push(it.key); } catch (er) { toast('Não consegui preparar a curva de ' + it.key + ': ' + errMsg(er)); } }
    let tr = (s) => s, aviso = ''; const fd = pc.estilo === 'fd';
    if (lang !== 'pt' || (fd && textosFabTodos(D, pcGet(), lang).length)) ({ tr, aviso } = await tradutor(D, pcGet(), lang));
    // padrão Folha de dados: curva recortada e páginas escolhidas da folha do fabricante, como imagem
    const fab = {};
    if (D.tipo === 'SEQ') for (const it of D.itens) { const F0 = (((pc.fd || {})[it.key]) || {}).fab; if (!F0 || !F0.dados) continue;
      try { const file = await fdArquivo(it.key, 'fab'); if (!file) continue; const L = window.PricerLeitor;
        const out = { dados: F0.dados, paginas: {}, semLs: !!F0.semLs };
        // curva: sempre redesenhada no padrão LS Fire com os pontos da folha
        if (!curvas[it.key]) { let dc = fabCurvaDados(F0);
          if (!curvaOk(dc)) { const d2 = await relerCurva(it.key, 'fab'); if (d2) { dc = curvaDados(d2, d2.pontos && d2.pontos.pag); if (curvaOk(dc)) fabMut(it.key, (G) => { G.dados.pontos = d2.pontos; G.dados.pontosPag = d2.pontosPag; G.curvaPag = d2.pontos.pag || G.curvaPag; });
            // folha guardada sem nada lido (leitura antiga ou que falhou): usa a leitura nova inteira
            if (!(F0.dados.secoes || []).length && (d2.secoes || []).length) { for (const g of d2.escopo || []) g.on = false; out.dados = d2; fabMut(it.key, (G) => { G.dados = d2; G.curvaPag = (d2.pontos && d2.pontos.pag) || G.curvaPag; }); } } }
          if (curvaOk(dc)) { out.curva = await window.PricerCurva.desenhar(dc, optCurva(it.key, lang)); nfpa[it.key] = window.PricerCurva.nfpa(dc, optCurva(it.key, lang)); } else if (!semCurva.includes(it.key)) semCurva.push(it.key); }
        if (!fd) { if (out.curva) curvas[it.key] = out.curva; continue; }
        for (const q of F0.dados.paginas) if ((F0.pags || {})[q.n]) out.paginas[q.n] = { url: await L.recorte(file, q.n, null, 2.2), w: q.w, h: q.h };
        fab[it.key] = out; } catch (er) { toast('Não consegui preparar a folha do fabricante de ' + it.key + ': ' + errMsg(er)); } }
    if (semCurva.length) aviso = (aviso ? aviso + ' ' : '') + 'Sem curva legível (não entrou): ' + semCurva.join(', ') + '.';
    const moeda = pc.moeda && pc.moeda.cod === 'USD' ? { cod: 'USD', taxa: Number(pc.moeda.taxa) || cambioPadrao(), data: pc.moeda.data || hojeISO() } : { cod: 'BRL' };
    if (moeda.cod === 'USD' && !(moeda.taxa > 0)) { toast('Informe a taxa do dólar (R$ por US$ 1,00)'); return; }
    const desenhos = {};
    if (D.tipo === 'SEQ') for (const it of D.itens) for (const dz of ((it.cad || {}).desenhos || [])) {
      try { const b = await docBlob(dz.id); if (!b) continue; const file = new File([b], dz.nome || 'desenho', { type: b.type || (/\.pdf$/i.test(dz.nome || '') ? 'application/pdf' : 'image/png') });
        if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) { const n = (await window.PricerLeitor.paginaImagem(file, 1, 0.2)).paginas; for (let k = 1; k <= Math.min(n, 4); k++) (desenhos[it.key] = desenhos[it.key] || []).push(await window.PricerLeitor.recorte(file, k, null, 2.2)); }
        else (desenhos[it.key] = desenhos[it.key] || []).push(await blobURL(b)); } catch (er) { toast('Não consegui preparar o desenho ' + (dz.nome || '') + ': ' + errMsg(er)); } }
    const r = fd && window.PricerPropostaFD ? await window.PricerPropostaFD.montar(D, pcGet(), M, { tipo, lang, moeda, img, curvas, nfpa, tr, fab, trFab: tr, desenhos }) : await PRP.montar(D, pcGet(), M, { tipo, lang, moeda, img, curvas, tr, desenhos });
    const ok = await REG.save(r.nome, r.bytes, 'application/pdf');
    logEv({ tipo: 'Proposta — PDF gerado', ref: state.id || docTitle(), desc: docTitle() + ' rev. ' + revAtual() + ': ' + r.nome + ' (' + TIPO_LB[tipo] + ', ' + LANG_LB[lang] + (moeda.cod === 'USD' ? ', US$ a R$ ' + NF[4].format(moeda.taxa) : '') + ', ' + r.paginas + ' páginas)', mudancas: [] });
    const p = propostaAtual(); const file = new File([r.bytes], r.nome, { type: 'application/pdf' });
    if (p && !dirty && !state.verRev && tipo !== 'tec' && lang === 'pt' && moeda.cod === 'BRL') await CF.rodar(file);
    else if (p && !state.verRev) { try { await SPV.salvarDoc({ tipo: 'proposta', nome: r.nome, propUid: p.uid || null, propNome: p.name || '', numero: (p.numero || '') + ' rev. ' + revAtual(), rev: revAtual(), etapa: 'Emissão', notas: 'Proposta ' + TIPO_LB[tipo].toLowerCase() + ' gerada pelo app (' + LANG_LB[lang] + (moeda.cod === 'USD' ? ', US$' : '') + ')', itens: [] }, file); } catch (er) { /* o download já foi feito */ } toast((ok ? 'PDF gerado (' + r.paginas + ' páginas) e guardado nos documentos' : 'Download cancelado') + (aviso ? '. ' + aviso : '')); }
    else toast((ok ? 'PDF gerado (' + r.paginas + ' páginas). Salve a proposta para guardar o PDF nos documentos.' : 'Download cancelado') + (aviso ? ' ' + aviso : ''));
    render();
  }
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset || state.verRev) return;
    if (t.dataset.pc) { const k = t.dataset.pc; let v = t.value; if (k === 'prazoFab' || k === 'prazoEnt') { v = v.trim() === '' ? '' : parseInt(v.replace(/\D/g, ''), 10); if (Number.isNaN(v)) v = ''; } if (v === '' && ['clienteCurto', 'aosCuidados', 'cidade', 'prazoFab', 'prazoEnt', 'prazoTexto', 'observacoes'].includes(k)) v = undefined; pcSet(k, v); if (t.closest('#pcCard')) render(); return; }
    if (t.dataset.pcopt) { const k = t.dataset.pcopt; if (k === 'moeda') pcSet('moeda', Object.assign({}, pcGet().moeda || {}, { cod: t.value })); else pcSet(k === 'tipoDoc' ? 'tipoDoc' : k === 'estilo' ? 'estilo' : 'idioma', t.value); render(); if (k === 'idioma' || k === 'estilo') traduzirAgora(); return; }
    if (t.dataset.pcmoeda) { const m = Object.assign({}, pcGet().moeda || {}); if (t.dataset.pcmoeda === 'taxa') { const n = parseInput(t.value, 'num'); m.taxa = typeof n === 'number' && n > 0 ? n : undefined; } else m.data = t.value; pcSet('moeda', m); render(); return; }
    if (t.dataset.pccod !== undefined) { pcSet('codigos', Object.assign({}, pcGet().codigos || {}, { [t.dataset.pccod]: t.value.trim() })); return; }
    if (t.dataset.pcni !== undefined) { pcSet('notasItem', Object.assign({}, pcGet().notasItem || {}, { [t.dataset.pcni]: t.value.trim() })); return; }
    if (t.dataset.pcsec) { const [tp, k] = t.dataset.pcsec.split('|'); const sec = JSON.parse(JSON.stringify(pcGet().secoes || {})); sec[tp] = Object.assign({}, sec[tp] || {}, { [k]: t.checked }); pcSet('secoes', sec); render(); return; }
    if (t.dataset.pctr) { const [lg, i] = t.dataset.pctr.split('|'); const tr = Object.assign({}, ((pcGet().trad || {})[lg]) || {}); const o = Object.keys(tr)[+i]; if (o === undefined) return; tr[o] = t.value; pcSet('trad', Object.assign({}, pcGet().trad || {}, { [lg]: tr })); return; }
    if (t.dataset.pcct !== undefined) { let D, E; try { D = propostaDados(); E = PRP.efetivo(D, pcGet(), PRP.modelo(REG)); } catch (er) { return; } const set = new Set(E.contatos || []); if (t.checked) set.add(t.dataset.pcct); else set.delete(t.dataset.pcct); pcSet('contatos', [...set]); }
  });
  document.addEventListener('click', async (e) => {
    const rs = e.target.closest('[data-pcreset]'); if (rs) { e.preventDefault(); pcSet(rs.dataset.pcreset, undefined); render(); return; }
    const sr = e.target.closest('[data-pcsecreset]'); if (sr) { const sec = Object.assign({}, pcGet().secoes || {}); delete sec[sr.dataset.pcsecreset]; pcSet('secoes', sec); render(); return; }
    const tl = e.target.closest('[data-pctrlimpa]'); if (tl) { const tr = Object.assign({}, pcGet().trad || {}); delete tr[tl.dataset.pctrlimpa]; pcSet('trad', tr); render(); return; }
    if (e.target.closest('[data-pctopo]')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (e.target.closest('[data-pcmodelo]')) { ui.cad = 'propmodelo'; setView('config'); return; }
    if (!e.target.closest('[data-pcgerar]')) return;
    try { await gerarProposta(); } catch (er) { toast(errMsg(er)); }
  });

  // selo "Rev. N" no topo da proposta
  const revSelo = () => (state.id ? `<div style="display:flex;gap:4px;align-items:center"><button class="pill ${state.verRev ? 'warn' : 'mute'} apselo" data-revs title="Ver as revisões desta proposta">${state.verRev ? 'Consultando rev. ' + state.verRev.rev : 'Rev. ' + revAtual()} ▾</button>${state.verRev ? '' : `<button class="btn sm" data-revisar title="Guarda a revisão ${revAtual()} e abre a ${revAtual() + 1} para editar">Revisar</button>`}</div>` : '');

  // ---------- jornada da proposta SEQ em 6 etapas ----------
  const ETAPAS_P = [[1, 'Identificação'], [2, 'Configuração'], [3, 'Custos'], [4, 'Formação'], [5, 'Conferência'], [6, 'Emissão']];
  // parâmetros de custos (Custos): validade das cotações e variação de preço que pede atenção
  const custosCfg = () => Object.assign({ validadeDias: 30, avisoDias: 5, variacaoPct: 0.15, bloquearEnvio: true, congelarRascunho: false }, ((REG.tabelas || {}).CUSTOS_CFG || {}).cfg || {});
  // data da última atualização do preço: a mais recente entre a data da cotação e a data em que o preço mudou no cadastro
  // (registros antigos, sem precoEm, usam a data da última gravação)
  function precoRef(i) { if (!i) return null; const a = (i.precoEm ? Date.parse(i.precoEm) : Date.parse(i.upd || '')) || 0, b = i.dataCot ? Date.parse(i.dataCot + 'T12:00') || 0 : 0; return Math.max(a, b) || null; }
  const idadePreco = (i) => { const r = precoRef(i); return r ? (Date.now() - r) / 864e5 : null; };
  const precoVencido = (i) => { const d = idadePreco(i); return typeof i.valor === 'number' && d !== null && d > custosCfg().validadeDias; };
  const insPorProduto = (() => { let m = null, v = null; return (d) => { if (v !== REG.insumos) { m = new Map(REG.insumos.map((i) => [i.produto, i])); v = REG.insumos; } return m.get(d) || null; }; })();
  function variacaoPreco(ins) {
    for (const h of REG.historico || []) { if (h.ref !== ins.id && h.ref !== 'import' && !/^L/.test(String(h.ref))) continue;
      for (const m of h.mudancas || []) { if (!(h.ref === ins.id ? /valor/i.test(m.campo) : String(m.campo).startsWith(ins.id) && (h.ref === 'import' || /· valor$/.test(m.campo)))) continue; if (typeof m.de === 'number' && typeof m.para === 'number' && m.de) return { pct: (m.para - m.de) / m.de, at: h.at, de: m.de, para: m.para }; } }
    return null;
  }
  // linhas de custo de todos os itens, com origem, data e validade da cotação e os alertas de cada uma
  function linhasCusto() {
    const C = custosCfg(); const hoje = Date.now(); const sn = seqSnapshot(); const na = state.naCustos || {}; const out = [];
    for (const it of sn.itens) {
      const S = it.n; const q = it.qtd || 1;
      for (const l of it.linhas || []) {
        if (['startup', 'frete'].includes(l.k)) continue;
        const ins = l.desc ? insPorProduto(l.desc) : null; const r = /^[me]\d+$/.test(l.k) ? +l.k.slice(1) : null;
        const manual = r && state.doc && state.doc[S] && state.doc[S]['G' + r] !== undefined;
        const upd = precoRef(ins); const idade = upd ? (hoje - upd) / 864e5 : null;
        const al = [];
        const principal = /MOTOR|BOMBA|JOCKEY/.test(String(l.grupo || '') + ' ' + String(l.fam || '')) && !/ACOPLAMENTO|CAPA/.test(String(l.fam || ''));
        if (l.desc && !(l.custo > 0)) al.push(principal ? ['imped', 'componente principal sem preço'] : ['aviso', 'item sem custo']);
        else if (l.desc && l.unit === 0 && l.qtd) al.push(['aviso', 'custo unitário zerado']);
        if (l.qtd === 0 && l.custo > 0) al.push(['aviso', 'quantidade zero com custo']);
        if (l.qtd && l.unit && Math.abs(l.unit * l.qtd - l.custo) > Math.max(1, l.custo * 0.01)) al.push(['aviso', 'quantidade × unitário não fecha com o total']);
        if (!manual && ins && idade !== null) { if (idade > C.validadeDias) al.push(['aviso', 'preço vencido (' + Math.round(idade) + ' dias sem atualizar)']); else if (idade > C.validadeDias - C.avisoDias) al.push(['info', 'preço vence em ' + Math.round(C.validadeDias - idade) + ' dias']); }
        if (!manual && ins && !precoRef(ins)) al.push(['info', 'preço da planilha original, sem data de atualização']);
        if (ins && foraDeUso(ins)) al.push(['aviso', 'insumo ' + situ(ins) + (ins.substituto ? ' — substituto: ' + ins.substituto : '')]);
        else if (ins && ['provisorio', 'validacao', 'preco'].includes(situ(ins))) al.push(['aviso', 'cadastro ' + (SITUACOES.find((x) => x[0] === situ(ins)) || [0, ''])[1].toLowerCase()]);
        const vp = ins && variacaoPreco(ins); if (vp && Math.abs(vp.pct) >= C.variacaoPct) al.push(['aviso', 'preço mudou ' + (vp.pct > 0 ? '+' : '') + pct(vp.pct, 0) + ' em ' + new Date(vp.at).toLocaleDateString('pt-BR')]);
        if (l.desc && !ins && !manual) al.push(['info', 'fora do cadastro (nome não encontrado)']);
        const key = S + '|' + l.k; const marcado = na[key];
        out.push({ S, key, item: it.nome, l, ins, q, manual, upd, idade, al: marcado ? [] : al, na: marcado || null, total: l.custo * q });
      }
    }
    return out;
  }
  function vCustos() {
    return precosCard() + vCustos0();
  }
  // aviso de preço vencido na proposta (atualização mensal), com atalho para o cadastro; propostas com preços da época não usam o cadastro de hoje
  function vencidosBanner() {
    if (state.precosFix) return '';
    let L; try { L = linhasCusto(); } catch (e) { return ''; }
    const C = custosCfg(); const m = new Map(); for (const x of L) if (!x.manual && x.ins && !x.na && precoVencido(x.ins)) m.set(x.ins.id, x.ins);
    if (!m.size) return '';
    const lista = [...m.values()].sort((a, b) => (precoRef(a) || 0) - (precoRef(b) || 0));
    const nomes = lista.slice(0, 4).map((i) => `${esc(i.produto)} <small class="sub">(${new Date(precoRef(i)).toLocaleDateString('pt-BR')})</small>`).join('; ');
    return `<div class="banner warn" style="margin:0 0 12px"><b>${m.size} insumo(s) desta proposta com preço vencido</b> — mais de ${C.validadeDias} dias sem atualizar no cadastro: ${nomes}${lista.length > 4 ? '; …' : ''}.
      <button class="btn sm pri" data-irvenc="${esc(lista.map((i) => i.id).join(','))}">Atualizar no cadastro</button></div>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-irvenc]'); if (!b) return; ui.insIds = b.dataset.irvenc.split(',').filter(Boolean); ui.insSit = ''; ui.pg_insumos = 1; ui.insQ = ''; ui.pg_insumos = 1; ui.insFam = ''; ui.pg_insumos = 1; ui.cad = 'insumos'; setView('cadastro'); });
  function vCustos0() {
    const L = linhasCusto(); const C = custosCfg(); const sev = { imped: 0, aviso: 0, info: 0 }; for (const x of L) for (const [s] of x.al) sev[s]++;
    const filtro = ui.custoFiltro || 'alertas';
    const vis = filtro === 'todos' ? L : L.filter((x) => x.al.length || x.na);
    const porItem = [...new Set(vis.map((x) => x.S))];
    const ic = { imped: '<span class="bad-t">✕</span>', aviso: '<span class="warn-t">!</span>', info: '<span class="sub">i</span>' };
    const tab = porItem.map((S) => { const X = vis.filter((x) => x.S === S); const tot = L.filter((x) => x.S === S).reduce((t, x) => t + x.total, 0);
      return `<tr class="grp"><td colspan="9">${esc(S)} · ${esc(String(X[0].item).slice(0, 70))} <span class="sub">· custo do item ${brl(tot)}</span></td></tr>` + X.map((x) => `<tr class="${x.al.some((a) => a[0] === 'imped') ? 'cf-erro' : x.al.some((a) => a[0] === 'aviso') ? 'cf-aviso' : ''}">
        <td>${x.ins ? `<button class="restore" data-ins="${esc(x.ins.id)}" title="abrir o insumo e o histórico">${esc(x.ins.id)}</button>` : '<span class="sub">—</span>'}</td>
        <td>${esc(x.l.desc || x.l.rot || '')}<br><small class="sub">${esc([x.l.fam, x.l.grupo !== 'ESCOPO' ? x.l.grupo : 'escopo', x.ins && x.ins.fab].filter(Boolean).join(' · '))}</small></td>
        <td class="n">${NF[2].format(x.l.qtd * x.q)}</td><td class="n">${brl(x.l.unit)}</td><td class="n"><b>${brl(x.total)}</b></td>
        <td>${x.manual ? 'digitado na proposta' : x.ins ? (x.l.ori || x.ins.origem || 'NAC') + ' · cadastro' : 'sem cadastro'}</td>
        <td>${x.manual ? '—' : x.upd ? new Date(x.upd).toLocaleDateString('pt-BR') + `<br><small class="sub">vale até ${new Date(x.upd + C.validadeDias * 864e5).toLocaleDateString('pt-BR')}</small>` : '<span class="sub">sem data</span>'}</td>
        <td>${x.na ? `<span class="pill mute">não se aplica</span><br><small class="sub">${esc(x.na.motivo)}</small> <button class="restore" data-naundo="${esc(x.key)}">desfazer</button>` : x.al.map(([s, t]) => `<div>${ic[s]} ${esc(t)}</div>`).join('') || '<span class="ok-t">✓</span>'}</td>
        <td>${!x.na && x.al.length ? `<button class="restore" data-namark="${esc(x.key)}" title="marcar como intencional: não é pendência">não se aplica</button>` : ''}</td></tr>`).join(''); }).join('');
    return `<section class="card"><h2>Composição de custos <span class="sub">de onde vem cada custo, a data da cotação e o que pede atenção</span></h2>
      <div class="kpis" style="margin-bottom:10px"><div class="kpi"><span>Custo total</span><b>${brl(L.reduce((t, x) => t + x.total, 0))}</b><em>${L.length} linhas em ${new Set(L.map((x) => x.S)).size} item(ns)</em></div><div class="kpi"><span>Impeditivos</span><b class="${sev.imped ? 'bad-t' : 'ok-t'}">${sev.imped}</b><em>componente principal sem preço</em></div><div class="kpi"><span>Avisos</span><b class="${sev.aviso ? 'warn-t' : 'ok-t'}">${sev.aviso}</b><em>sem custo, cotação vencida, variação ≥ ${pct(C.variacaoPct, 0)}</em></div><div class="kpi"><span>Informações</span><b>${sev.info}</b><em>validade ${C.validadeDias} dias (Custos)</em></div></div>
      <div class="hchips" style="margin-bottom:8px">${[['alertas', 'Só o que pede atenção'], ['todos', 'Todas as linhas']].map(([k, lb]) => `<button class="hchip${filtro === k ? ' on' : ''}" data-custofiltro="${k}">${lb}</button>`).join('')}</div>
      ${vis.length ? `<div class="tw"><table class="t"><thead><tr><th>Código</th><th>Componente</th><th>Qtd</th><th>Unitário</th><th>Total</th><th>Origem do preço</th><th>Cotação</th><th>Situação</th><th></th></tr></thead><tbody>${tab}</tbody></table></div>` : '<p class="ok-t" style="margin:0">Nenhum custo pedindo atenção.</p>'}
      <p class="sub" style="margin:8px 0 0">Valores do cadastro em reais. "Não se aplica" registra que a ausência é intencional (fica no histórico) e tira a linha das pendências. A validade e a variação que pede atenção são ajustáveis em Cadastros → Custos.</p></section>`;
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-custofiltro]'); if (f) { ui.custoFiltro = f.dataset.custofiltro; render(); return; }
    const nm = e.target.closest('[data-namark]'); if (nm) { const key = nm.dataset.namark;
      modal(`<h2>Não se aplica</h2><p class="sub" style="margin:0">${esc(key)}</p><div class="f"><label for="naMot">Por quê? (fica no histórico)</label><input id="naMot" placeholder="ex.: cliente fornece; já incluso no kit; não faz parte deste escopo"></div><div style="display:flex;gap:8px"><button class="btn pri" id="naOk">Confirmar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#naMot', o).focus(); $('#naOk', o).onclick = () => { const m = $('#naMot', o).value.trim(); if (!m) { toast('Escreva o motivo'); return; } state.naCustos = Object.assign({}, state.naCustos, { [key]: { motivo: m, by: REG.me || null, at: new Date().toISOString() } }); dirty = true; persist(); logEv({ tipo: 'Custo — não se aplica', ref: docTitle(), desc: key, mudancas: [{ campo: 'Justificativa', de: null, para: m }] }); close(); render(); }; }); return; }
    const nu = e.target.closest('[data-naundo]'); if (nu) { const n2 = Object.assign({}, state.naCustos); delete n2[nu.dataset.naundo]; state.naCustos = n2; dirty = true; persist(); render(); }
  });

  // ---------- modelo da proposta técnica e comercial: textos padrão e contatos (Cadastro geral) ----------
  const PM_CAMPOS = [
    ['Textos gerais', [['somos', 'Somos a LS Fire', 'par'], ['notaPagamento', 'Nota da condição de pagamento', 'txt'], ['atencao', 'Aviso ATENÇÃO (duas linhas)', 'lin'], ['rodape', 'Rodapé das páginas', 'txt']]],
    ['Equipamentos (SEQ)', [['notasSeq', 'Notas', 'lin'], ['comissionamento.incluso', 'Comissionamento: o que está incluso', 'lin'], ['comissionamento.adicionais', 'Comissionamento: serviços adicionais', 'lin'], ['comissionamento.responsabilidades', 'Comissionamento: responsabilidades do cliente', 'lin'],
      ['prazos.intro', 'Prazos: composição do prazo total', 'txt'], ['prazos.inicio', 'Prazos: condições para início da contagem', 'lin'], ['prazos.suspensao', 'Prazos: hipóteses de suspensão', 'lin'], ['prazos.recebimento', 'Prazos: recebimento', 'txt']]],
    ['Serviços e peças (SPV)', [['notasServico', 'Notas — serviços', 'lin'], ['observacoesServico', 'Observações — serviços', 'lin'], ['pecas.escopo', 'Escopo padrão — peças', 'par'], ['pecas.notas', 'Notas — peças', 'lin'], ['pecas.desvios', 'Desvios — peças', 'lin'], ['pecas.exclusoes', 'Exclusões — peças', 'lin']]],
    ['Termos e condições', [['termos', 'Termos e condições', 'termos']]],
  ];
  const pmGet = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
  const pmSalvo = () => (((REG.tabelas || {}).PROPOSTA_MODELO || {}).m || {});
  const pmTexto = (v, tipo) => tipo === 'par' ? (v || []).join('\n\n') : tipo === 'lin' ? (v || []).join('\n') : tipo === 'termos' ? (v || []).map((c) => '## ' + c.t + '\n' + (c.p || []).join('\n')).join('\n\n') : String(v || '');
  function pmValor(t, tipo) {
    if (tipo === 'par') return t.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    if (tipo === 'lin') return t.split('\n').map((x) => x.trim()).filter(Boolean);
    if (tipo === 'termos') { const out = []; for (const l of t.split('\n').map((x) => x.trim()).filter(Boolean)) { if (/^##\s*/.test(l)) out.push({ t: l.replace(/^##\s*/, ''), p: [] }); else { if (!out.length) out.push({ t: '', p: [] }); out[out.length - 1].p.push(l); } } return out; }
    return t.trim();
  }
  const pmLangAtual = () => ui.pmLang || 'pt';
  // a origem de cada idioma: português = texto do app; inglês e espanhol = tradução que vem com o app
  const pmBase = (lang) => { const b = window.PRICER_PROPOSTA_TEXTOS || {}; return lang === 'pt' ? b : Object.assign({}, b, (b.i18n || {})[lang] || {}); };
  const pmSalvoLang = (lang) => (lang === 'pt' ? pmSalvo() : ((pmSalvo().i18n || {})[lang]) || {});
  function vModeloProposta() {
    const ed = canEd(); const ro = ed ? '' : ' disabled'; const lang = pmLangAtual(); const M = PRP.modelo(REG, lang); const sv = pmSalvoLang(lang); const base = pmBase(lang); const svPt = pmSalvo();
    const mudou = (k) => { const top = k.split('.')[0]; return Object.prototype.hasOwnProperty.call(sv, top) && JSON.stringify(pmGet(sv, k)) !== JSON.stringify(pmGet(base, k)); };
    const ptMudou = (k) => lang !== 'pt' && Object.prototype.hasOwnProperty.call(svPt, k.split('.')[0]) && JSON.stringify(pmGet(svPt, k)) !== JSON.stringify(pmGet(window.PRICER_PROPOSTA_TEXTOS || {}, k)) && !mudou(k);
    const campo = ([k, lb, tipo]) => { if (lang !== 'pt' && k === 'rodape') return ''; const t = pmTexto(pmGet(M, k), tipo); return `<div class="f spanall"><label for="pm_${k}">${esc(lb)}${mudou(k) ? ` <span class="pill warn">alterado</span>${ed ? ` <button type="button" class="linkbtn" data-pmreset="${k}">voltar ao texto original</button>` : ''}` : ''}${ptMudou(k) ? ' <span class="pill bad">o texto em português mudou: confira esta tradução</span>' : ''}</label><textarea id="pm_${k}" data-pm="${k}" data-pmt="${tipo}" rows="${tipo === 'termos' ? 24 : Math.min(14, Math.max(2, t.split('\n').length + 1))}"${ro}>${esc(t)}</textarea></div>`; };
    const cts = M.contatos || [];
    const L = M.layout || PRP.LAYOUT; const ordem = (L.ordem || PRP.LAYOUT.ordem).concat(PRP.LAYOUT.ordem.filter((k) => !(L.ordem || []).includes(k)));
    const lay = (tp, k) => (((L.tipos || {})[tp] || {})[k] ?? PRP.LAYOUT.tipos[tp][k]);
    const fixa = (k) => k === 'capa' || k === 'planilha';
    const SL = Object.fromEntries(PRP.SECOES);
    const AS = window.PRICER_PROPOSTA_ASSETS || { img: {} };
    setTimeout(pmThumbs, 0);
    return `<section class="card"><h2>Modelo da proposta técnica e comercial <span class="sub">estrutura, imagens, textos padrão e contatos do PDF da proposta (modelo PTC)</span></h2>
      <p class="sub" style="margin:0 0 6px">Valem para todas as propostas geradas a partir de agora; as já enviadas não mudam (o PDF fica nos documentos). Em cada proposta dá para escolher o tipo (técnica e comercial, comercial ou técnica), o idioma e a moeda, e ajustar notas, seções e contatos só para ela.</p>
      ${ed ? '' : '<p class="sub" style="margin:0 0 6px">Só quem cuida do Cadastro geral altera.</p>'}
      <details class="sub2"${keep('pm_estr')}><summary>Estrutura do documento <span class="sub">ordem das seções e o que entra em cada tipo</span></summary>
        <div class="tw"><table class="t"><thead><tr><th>Ordem</th><th>Seção</th>${PRP.TIPOS.map(([, lb]) => `<th>${esc(lb)}</th>`).join('')}</tr></thead><tbody>${ordem.map((k, i) => `<tr><td style="white-space:nowrap">${fixa(k) && k === 'capa' ? '<span class="sub">sempre a primeira</span>' : ed ? `<button class="btn sm" data-pmord="${k}|-1"${i <= 1 ? ' disabled' : ''} aria-label="Subir">↑</button> <button class="btn sm" data-pmord="${k}|1"${i === ordem.length - 1 ? ' disabled' : ''} aria-label="Descer">↓</button>` : ''}</td><td>${esc(SL[k] || k)}${PRP.SO_SEQ.has(k) ? ' <small class="sub">(só equipamentos)</small>' : ''}</td>${PRP.TIPOS.map(([tp]) => `<td><input type="checkbox" data-pmlay="${tp}|${k}"${fixa(k) || lay(tp, k) ? ' checked' : ''}${fixa(k) || !ed ? ' disabled' : ''} aria-label="${esc(SL[k] || k)} na proposta ${tp}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <small class="sub">Na proposta técnica a planilha sai sem preços (escopo de fornecimento). Comissionamento só entra quando algum item tem start-up. Serviços (SPV) e FACTS usam a mesma ordem, sem as seções só de equipamentos.</small>
        ${ed && pmSalvo().layout ? '<div class="docbar" style="margin-top:6px"><button class="btn sm" data-pmlayreset>Voltar à estrutura original</button></div>' : ''}</details>
      <details class="sub2"${keep('pm_img')}><summary>Imagens <span class="sub">trocar, tamanho, alinhamento e posição</span></summary>
        <div class="imggrid">${PRP.SLOTS.map(([k, lb]) => { const c = (M.imagens || {})[k] || {}; return `<div class="imgcard"><div class="lbl">${esc(lb)}${c.docId ? ' <span class="pill warn">trocada</span>' : ''}</div>
          <div class="imgprev"><img data-pmthumb="${k}" alt="${esc(lb)}" src="${c.docId ? '' : esc(AS.img[k] || '')}"></div>
          <div class="fields"><div class="f"><label for="pmi_${k}_larg">Tamanho (%)</label><input id="pmi_${k}_larg" data-pmimg="${k}|larg" inputmode="numeric" value="${esc(c.larg || 100)}"${ro}></div>
            <div class="f"><label for="pmi_${k}_dy">Deslocar (mm)</label><input id="pmi_${k}_dy" data-pmimg="${k}|dy" inputmode="decimal" value="${esc(c.dy || 0)}" title="+ desce, − sobe"${ro}></div>
            <div class="f spanall"><label for="pmi_${k}_al">Alinhamento</label><select id="pmi_${k}_al" data-pmimg="${k}|al"${ro}>${[['', 'como no modelo'], ['e', 'à esquerda'], ['c', 'centralizada'], ['d', 'à direita']].map(([v, t]) => `<option value="${v}"${(c.al || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
          <small class="sub">Deslocar: + desce, − sobe</small>
          ${ed ? `<div class="docbar"><label class="btn sm" for="pmup_${k}">Trocar imagem</label><input id="pmup_${k}" type="file" accept="image/png,image/jpeg" data-pmup="${k}" hidden>${c.docId || c.larg || c.al || c.dy ? `<button class="btn sm" data-pmimgreset="${k}">Voltar à original</button>` : ''}</div>` : ''}</div>`; }).join('')}</div></details>
      <details class="sub2"${keep('pm_ct')}><summary>Contatos <span class="sub">${cts.length}</span></summary>
        <div class="tw"><table class="t"><thead><tr><th>Nome</th><th>Cargo</th><th>Telefone</th><th>E-mail</th><th>Sempre</th><th></th></tr></thead><tbody>${cts.map((c, i) => `<tr>${['nome', 'cargo', 'tel', 'email'].map((f) => `<td class="in"><input data-pmct="${i}|${f}" value="${esc(c[f] || '')}" aria-label="${f} do contato ${i + 1}"${ro}></td>`).join('')}<td><input type="checkbox" data-pmct="${i}|sempre"${c.sempre ? ' checked' : ''} aria-label="Sempre na proposta"${ro}></td><td>${ed ? `<button class="btn sm" data-pmctdel="${i}" aria-label="Tirar ${esc(c.nome || 'contato')}">Tirar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${ed ? '<div class="docbar" style="margin-top:6px"><button class="btn sm" data-pmctadd data-ico="plus">Incluir contato</button></div>' : ''}
        <small class="sub">"Sempre" entra em todas as propostas; quem tem o mesmo nome do vendedor da proposta também entra. Na proposta dá para marcar outros.</small></details>
      <div class="pmtextos"><div class="f"><label>Textos padrão em</label><div class="seg" role="radiogroup">${PRP.IDIOMAS.map(([k, lb]) => `<label class="${k === lang ? 'on' : ''}"><input type="radio" name="pm_lang" data-pmlang value="${k}"${k === lang ? ' checked' : ''}>${esc(lb)}</label>`).join('')}</div></div>
        <p class="sub" style="margin:4px 0 0">Nas notas, uma linha pode começar com uma condição entre colchetes e só entra quando a proposta atende: <b>[diesel]</b>, <b>[eletrica]</b>, <b>[start-up]</b>, <b>[sem start-up]</b>, <b>[contrato]</b>, <b>[campo]</b>, <b>[fabrica]</b>. O app troca <b>{norma}</b>, <b>{certificacao}</b> (com ou sem UL e FM), <b>{meses}</b>, <b>{visitas}</b> e <b>{diarias}</b> pelo que está na proposta. Nos termos, cada cláusula começa com uma linha <b>## título</b>.${lang !== 'pt' ? ' Inglês e espanhol: tradução que veio com o app; mantenha os colchetes e chaves como estão. Os termos e condições traduzidos devem ser revisados pelo jurídico antes do uso.' : ''}</p></div>
      ${PM_CAMPOS.map(([g, Lc]) => `<details class="sub2"${keep('pm_' + g)}><summary>${esc(g)}${lang !== 'pt' ? ' <span class="sub">' + esc(Object.fromEntries(PRP.IDIOMAS)[lang]) + '</span>' : ''}</summary><div class="fields">${Lc.map(campo).join('')}</div></details>`).join('')}
    </section>`;
  }
  // miniatura das imagens trocadas (o arquivo fica nos documentos)
  async function pmThumbs() {
    const M = PRP.modelo(REG);
    for (const im of document.querySelectorAll('img[data-pmthumb]')) { const c = (M.imagens || {})[im.dataset.pmthumb] || {}; if (!c.docId || im.getAttribute('src')) continue; const b = await docBlob(c.docId); if (b) im.src = URL.createObjectURL(b); }
  }
  async function pmSalvar(top, valor, rot, lang) {
    const m = JSON.parse(JSON.stringify(pmSalvo())); lang = lang || 'pt';
    const alvo = lang === 'pt' ? m : ((m.i18n = m.i18n || {})[lang] = m.i18n[lang] || {});
    const de = JSON.stringify(alvo[top] ?? null).slice(0, 80);
    if (valor === undefined) delete alvo[top]; else alvo[top] = valor;
    const rt = rot + (lang !== 'pt' ? ' (' + lang.toUpperCase() + ')' : '');
    await REG.setTable('PROPOSTA_MODELO', { m }, 'Modelo da proposta: ' + rt, [{ campo: rt, de, para: valor === undefined ? 'original' : JSON.stringify(valor).slice(0, 80) }]);
    toast('Salvo'); render();
  }
  // imagem nova: reduz para no máximo 1800 px (PNG mantém a transparência) e guarda nos documentos
  function pmReduz(file) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { const s = Math.min(1, 1800 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); const g = c.getContext('2d'); const png = /png/i.test(file.type); if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => (b ? res(new File([b], file.name.replace(/\.\w+$/, '') + (png ? '.png' : '.jpg'), { type: png ? 'image/png' : 'image/jpeg' })) : rej(new Error('Não consegui ler a imagem'))), png ? 'image/png' : 'image/jpeg', 0.86); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Não consegui ler a imagem')); }; im.src = u; });
  }
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.pmlang !== undefined) { ui.pmLang = t.value; render(); return; }
    if (!(t.dataset.pm || t.dataset.pmct || t.dataset.pmlay || t.dataset.pmimg || t.dataset.pmup) || !canEd()) return;
    try {
      const lang = pmLangAtual();
      if (t.dataset.pm) { const k = t.dataset.pm; const top = k.split('.')[0]; const M = PRP.modelo(REG, lang); const v = pmValor(t.value, t.dataset.pmt); const lb = (PM_CAMPOS.flatMap((x) => x[1]).find((x) => x[0] === k) || [0, k])[1];
        if (k.includes('.')) { const sub = k.split('.')[1]; await pmSalvar(top, Object.assign({}, M[top] || {}, { [sub]: v }), lb, lang); } else await pmSalvar(top, v, lb, lang); return; }
      if (t.dataset.pmct) { const [i, f] = t.dataset.pmct.split('|'); const L = JSON.parse(JSON.stringify(PRP.modelo(REG).contatos || [])); if (!L[+i]) return; L[+i][f] = f === 'sempre' ? t.checked : t.value.trim(); await pmSalvar('contatos', L, 'contatos'); return; }
      if (t.dataset.pmlay) { const [tp, k] = t.dataset.pmlay.split('|'); const L = JSON.parse(JSON.stringify(PRP.modelo(REG).layout || PRP.LAYOUT)); L.tipos = L.tipos || {}; L.tipos[tp] = Object.assign({}, PRP.LAYOUT.tipos[tp], L.tipos[tp] || {}, { [k]: t.checked }); await pmSalvar('layout', L, 'estrutura do documento'); return; }
      if (t.dataset.pmimg) { const [k, f] = t.dataset.pmimg.split('|'); const im = JSON.parse(JSON.stringify(PRP.modelo(REG).imagens || {})); const c = im[k] || {}; let v = t.value;
        if (f === 'larg') { v = parseInt(v, 10); if (!(v >= 20 && v <= 200)) { toast('Tamanho entre 20% e 200%'); render(); return; } } else if (f === 'dy') { v = parseInput(v, 'num'); if (typeof v !== 'number' || Math.abs(v) > 120) { toast('Deslocamento entre −120 e 120 mm'); render(); return; } }
        c[f] = v; im[k] = c; await pmSalvar('imagens', im, 'imagem ' + k); return; }
      if (t.dataset.pmup) { const k = t.dataset.pmup; const file = t.files && t.files[0]; t.value = ''; if (!file) return; toast('Preparando a imagem…'); const f2 = await pmReduz(file);
        const docId = await SPV.salvarDoc({ tipo: 'imagem do modelo da proposta', nome: f2.name, etapa: 'Modelo da proposta', notas: 'Imagem do modelo da proposta: ' + k, itens: [] }, f2);
        const im = JSON.parse(JSON.stringify(PRP.modelo(REG).imagens || {})); im[k] = Object.assign({}, im[k] || {}, { docId, nome: f2.name }); await pmSalvar('imagens', im, 'imagem ' + k); }
    } catch (er) { toast(errMsg(er)); }
  });
  document.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-pmreset]'), a = e.target.closest('[data-pmctadd]'), d = e.target.closest('[data-pmctdel]'), o = e.target.closest('[data-pmord]'), lr = e.target.closest('[data-pmlayreset]'), ir = e.target.closest('[data-pmimgreset]');
    if (!(r || a || d || o || lr || ir) || !canEd()) return;
    try {
      const lang = pmLangAtual();
      if (r) { const k = r.dataset.pmreset; const top = k.split('.')[0]; const base = pmBase(lang);
        if (k.includes('.')) { const sub = k.split('.')[1]; const cur = Object.assign({}, PRP.modelo(REG, lang)[top] || {}, { [sub]: (base[top] || {})[sub] }); await pmSalvar(top, JSON.stringify(cur) === JSON.stringify(base[top]) ? undefined : cur, k, lang); } else await pmSalvar(top, undefined, k, lang); return; }
      if (o) { const [k, dir] = o.dataset.pmord.split('|'); const L = JSON.parse(JSON.stringify(PRP.modelo(REG).layout || PRP.LAYOUT)); const ord = (L.ordem || PRP.LAYOUT.ordem).slice(); const i = ord.indexOf(k), j = i + Number(dir); if (i < 1 || j < 1 || j >= ord.length) return; [ord[i], ord[j]] = [ord[j], ord[i]]; L.ordem = ord; await pmSalvar('layout', L, 'ordem das seções'); return; }
      if (lr) { if (!await DLG.confirmar('Voltar a estrutura do documento ao original?')) return; await pmSalvar('layout', undefined, 'estrutura do documento'); return; }
      if (ir) { const k = ir.dataset.pmimgreset; const im = JSON.parse(JSON.stringify(PRP.modelo(REG).imagens || {})); delete im[k]; await pmSalvar('imagens', im, 'imagem ' + k + ' (original)'); return; }
      const L = JSON.parse(JSON.stringify(PRP.modelo(REG).contatos || []));
      if (a) { L.push({ nome: 'Novo contato', cargo: '', tel: '', email: '' }); await pmSalvar('contatos', L, 'contatos'); return; }
      if (d) { const i = +d.dataset.pmctdel; if (!await DLG.confirmar('Tirar ' + ((L[i] || {}).nome || 'este contato') + ' do modelo da proposta?')) return; L.splice(i, 1); await pmSalvar('contatos', L, 'contatos'); }
    } catch (er) { toast(errMsg(er)); }
  });
  function vCustosCfg() {
    const C = custosCfg(); const ed = canEd();
    const f = (k, lb, suf, d) => `<div class="f"><label for="cc_${k}">${lb}</label><div class="mbc"><input id="cc_${k}" data-ccfg="${k}" value="${esc(k === 'variacaoPct' ? NF[0].format(C[k] * 100) : C[k])}" inputmode="decimal"${ed ? '' : ' disabled'}><span class="sub">${suf}</span></div><small class="sub">${d}</small></div>`;
    return `<section class="card"><h2>Validade dos preços e alertas de custo <span class="sub">atualização de preços mensal: padrão de 30 dias</span></h2><div class="fields">${f('validadeDias', 'Validade do preço', 'dias', 'depois disso o insumo aparece como preço vencido no cadastro e a proposta avisa (Custos e Formação)')}${f('avisoDias', 'Avisar antes de vencer', 'dias', 'informa que o preço está perto de vencer')}${f('variacaoPct', 'Variação de preço que pede atenção', '%', 'mudança do preço do insumo desde a última referência')}
      <div class="f span2"><label>Política de envio</label><label class="chk"><input type="checkbox" data-ccfg="bloquearEnvio"${C.bloquearEnvio ? ' checked' : ''}${ed ? '' : ' disabled'}> Travar "Enviar ao cliente" quando a conferência tiver itens que impedem seguir</label></div>
      <div class="f span2"><label>Preços da época</label><label class="chk"><input type="checkbox" data-ccfg="congelarRascunho"${C.congelarRascunho ? ' checked' : ''}${ed ? '' : ' disabled'}> Rascunhos também ficam com os preços de quando foram salvos</label><small class="sub">Propostas enviadas, aprovadas e ganhas sempre ficam com os preços da época; a atualização é escolhida item a item.</small></div></div>
      <p class="sub" style="margin:8px 0 0">${ed ? 'Alterações ficam no histórico.' : 'Só quem cuida de Custos altera.'}</p></section>`;
  }
  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-ccfg]'); if (!el) return; const k = el.dataset.ccfg; const C = custosCfg(); let v;
    if (k === 'bloquearEnvio' || k === 'congelarRascunho') v = el.checked; else { const n = parseInput(el.value, 'num'); if (typeof n !== 'number' || n < 0) { toast('Número inválido'); return; } v = k === 'variacaoPct' ? n / 100 : Math.round(n); }
    try { await REG.setTable('CUSTOS_CFG', { cfg: Object.assign({}, ((REG.tabelas || {}).CUSTOS_CFG || {}).cfg || {}, { [k]: v }) }, 'Política de custos', [{ campo: k, de: C[k], para: v }]); toast('Salvo'); } catch (er) { toast(errMsg(er)); }
  });

  // ---------- modelos de item: um equipamento configurado vira modelo para outras propostas ----------
  let modelosItem = []; let modSub = null; const MODK = 'lspricer.modelos.v1';
  function ensureModelos() {
    const m = REG.mode === 'shared' && REG.db ? 'shared' : 'local'; if (modSub === m || modSub === 'shared') return; modSub = m;
    if (m === 'shared') REG.db.collection('modelos').orderBy('at', 'desc').limit(300).onSnapshot((s) => { modelosItem = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); render(); }, () => {});
    else modelosItem = Object.entries(store.get(MODK, {})).map(([id, x]) => Object.assign({ id }, x)).sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }
  async function gravarModelo(id, body) {
    if (REG.mode === 'shared' && REG.db) { if (body === null) await REG.db.doc('modelos/' + id).delete(); else await REG.db.doc('modelos/' + id).set(JSON.parse(JSON.stringify(body))); return; }
    const all = store.get(MODK, {}); if (body === null) delete all[id]; else all[id] = body; if (!store.set(MODK, all)) throw new Error('O navegador não deixou gravar o modelo (sem espaço)');
    modelosItem = Object.entries(all).map(([k, x]) => Object.assign({ id: k }, x)).sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }
  // biblioteca de configurações já usadas: itens de propostas salvas, pesquisáveis por família, modelo, potência, vazão, pressão, cliente e componentes
  function biblioteca() {
    const out = [];
    for (const q of REG.listPropostas() || []) { if (q.div === 'SPV' || q.facts || !q.doc) continue; const nomes = ((q.resumo || {}).itens || []).map((x) => x.nome); let k = 0;
      for (const S of ITEMS) { const c = q.doc[S]; if (!c || !Object.keys(c).length) continue; const nome = nomes[k++] || '';
        out.push({ q, S, c, nome, fam: c.C21 || '', modelo: c.C17 || '', bomba: c.D19 || '', hp: c.C19, cv: c.I19, vazao: c.G17, pressao: c.H17, hay: [q.numero, q.cliente, nome, ...Object.values(c).filter((v) => typeof v === 'string' || typeof v === 'number')].join(' ') }); } }
    return out;
  }
  function bibliotecaModal() {
    const all = biblioteca(); const sin = sinonimos();
    modal(`<h2>Configurações já usadas <span class="sub">${all.length} item(ns) em propostas salvas</span></h2>
      <input type="search" id="bbQ" placeholder="Buscar: família, modelo da bomba, 483HP, 1500, cliente, componente…" aria-label="Buscar configuração" autocomplete="off">
      <div id="bbL" class="tw" style="max-height:55vh;overflow:auto"></div>
      <p class="sub" style="margin:0">Usar copia a configuração do item para uma posição livre desta proposta, registra de onde veio e recalcula com o cadastro e as regras de hoje.</p><div><button class="btn" data-close>Fechar</button></div>`, (o) => {
      const draw = () => { const g = FAMS_F.termos($('#bbQ', o).value, sin); const L = all.filter((x) => !g.length || FAMS_F.casa(x.hay, g)).slice(0, 60);
        $('#bbL', o).innerHTML = L.length ? `<table class="t"><thead><tr><th>Proposta</th><th>Item</th><th>Família · modelo</th><th>Potência · vazão · pressão</th><th></th></tr></thead><tbody>${L.map((x, i) => `<tr><td><b>${esc(x.q.numero || x.q.name || '')}</b><br><small class="sub">${esc(x.q.cliente || '')} · ${esc(new Date(x.q.at).toLocaleDateString('pt-BR'))}</small></td><td>${esc(x.S)}<br><small class="sub">${esc(x.nome.slice(0, 70))}</small></td><td>${esc(famNome(x.fam))}${x.modelo ? '<br><small>' + esc(x.modelo) + '</small>' : x.bomba ? '<br><small>' + esc(x.bomba) + '</small>' : ''}</td><td><small>${[x.hp ? x.hp + ' HP' : '', x.cv ? x.cv + ' CV' : '', x.vazao ? x.vazao + ' USgpm' : '', x.pressao ? x.pressao + ' mca' : ''].filter(Boolean).join(' · ') || '—'}</small></td><td><button class="btn sm pri" data-bbuse="${all.indexOf(x)}">Usar</button></td></tr>`).join('')}</tbody></table>` : '<p class="sub">Nada encontrado.</p>';
        o.querySelectorAll('[data-bbuse]').forEach((b) => { b.onclick = () => { const x = all[+b.dataset.bbuse]; const j = firstFree(); if (j < 0) { toast('As 10 posições de item já estão em uso'); return; } const S = ITEMS[j];
          state.doc = state.doc || {}; state.doc[S] = JSON.parse(JSON.stringify(x.c)); state.origemItens = Object.assign({}, state.origemItens || {}, { [S]: { propId: x.q.id, numero: x.q.numero || '', item: x.S, at: new Date().toISOString() } });
          build(); persist(); dirty = true; listCache = new Map(); $('#overlay').innerHTML = ''; logEv({ tipo: 'Configuração reaproveitada', ref: docTitle(), desc: S + ' ← ' + (x.q.numero || '') + ' ' + x.S, mudancas: [] }); render(); toast(S + ' criado a partir de ' + (x.q.numero || 'outra proposta') + ' ' + x.S + ', com os preços de hoje'); }; }); };
      $('#bbQ', o).oninput = draw; draw(); $('#bbQ', o).focus();
    });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-biblio]')) bibliotecaModal(); });
  function vModelosItem() {
    ensureModelos(); if (!modelosItem.length) return `<p class="sub" style="margin:0">Dica: em cada item, "Salvar como modelo" guarda a configuração para usar em outras propostas. <button class="restore" data-biblio>Buscar em configurações já usadas</button></p>`;
    const free = firstFree();
    return `<section class="card"><h2>Modelos de item <span class="sub">configurações salvas pela equipe · <button class="restore" data-biblio>buscar em configurações já usadas</button></span></h2><div class="tw"><table class="t"><tbody>${modelosItem.map((x) => `<tr><td><b>${esc(x.nome)}</b><br><small class="sub">${esc(x.desc || '')}</small></td><td class="sub">${esc(FAM_SEQ_LB[x.fam] || x.fam || '')}<br>${who(x.by)} · ${esc(fmtAt(x.at))}</td><td style="text-align:right;white-space:nowrap">${free >= 0 ? `<button class="btn sm pri" data-moduse="${esc(x.id)}">Usar</button>` : ''} ${!x.by || x.by === REG.me || REG.isOwner || REG.mode === 'local' ? `<button class="restore" data-moddel="${esc(x.id)}">excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  document.addEventListener('click', async (e) => {
    const sv = e.target.closest('[data-modsave]'); if (sv) { const S = ITEMS[+sv.dataset.modsave]; const cells = JSON.parse(JSON.stringify((state.doc || {})[S] || {})); if (!Object.keys(cells).length) { toast('Configure o item antes'); return; }
      const nome = await DLG.pedir('Nome do modelo', txt(S, 'C28').slice(0, 60)); if (!nome) return;
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      try { await gravarModelo(id, { nome, desc: txt(S, 'C28'), fam: txt(S, 'C21'), cells, at: new Date().toISOString(), by: REG.me || null }); logEv({ tipo: 'Modelo de item salvo', ref: id, desc: nome + ' · ' + txt(S, 'C28'), mudancas: [] }); toast('Modelo salvo'); render(); } catch (er) { toast(errMsg(er)); } return; }
    const us = e.target.closest('[data-moduse]'); if (us) { const x = modelosItem.find((y) => y.id === us.dataset.moduse); const j = firstFree(); if (!x || j < 0) return; const S = ITEMS[j];
      state.doc = state.doc || {}; state.doc[S] = JSON.parse(JSON.stringify(x.cells)); build(); persist(); dirty = true; listCache = new Map(); logEv({ tipo: 'Modelo de item usado', ref: docTitle(), desc: S + ' ← ' + x.nome, mudancas: [] }); ui.item = j; ui.itemFull = false; cfgEtRestart(j); setView('item'); toast('Item criado a partir do modelo: confira e ajuste'); return; }
    const dl = e.target.closest('[data-moddel]'); if (dl) { if (!await DLG.confirmar('Excluir este modelo?')) return; try { await gravarModelo(dl.dataset.moddel, null); logEv({ tipo: 'Modelo de item excluído', ref: dl.dataset.moddel, desc: '', mudancas: [] }); render(); } catch (er) { toast(errMsg(er)); } }
  });

  // ---------- simulador de negociação: o motor real numa cópia; a proposta oficial não muda ----------
  function simular(sc) {
    const doc = JSON.parse(JSON.stringify(state.doc || {})); migrar(doc); doc.PROPOSTA = doc.PROPOSTA || {};
    if (sc.pag) doc.PROPOSTA.J6 = sc.pag;
    if (sc.comV !== undefined) doc.PROPOSTA.J7 = sc.comV ? 'SEQ' : 'SEM COMISSÃO';
    if (sc.comA !== undefined) doc.PROPOSTA.J8 = sc.comA ? 'SEQ' : 'SEM COMISSÃO';
    if (typeof sc.desc === 'number') doc.PROPOSTA.C9 = sc.desc;
    const k = 1 + num0(sc.custoPct);
    const monta = (d) => { const w2 = new Workbook(MODEL); REG.applyTo(w2); if (state.precosFix) aplicaPrecos(w2, state.precosFix);
      if (Math.abs(k - 1) > 1e-9) { for (const [sh, cols] of [['CADASTRO', ['G']], ['KIT MOTORES DIESEL', ['U', 'V']], ['KIT BOMBA', ['I', 'J']]]) { const s = w2.sheet(sh); for (const [a, v] of s.cells) if (typeof v === 'number' && cols.includes(a.replace(/\d+/, '')) && +a.replace(/\D/g, '') > 1) s.cells.set(a, v * k); }
        for (const S of ITEMS) if (d[S]) for (let r = 34; r <= 112; r++) if (typeof d[S]['G' + r] === 'number') d[S]['G' + r] *= k; }
      w2.applyDoc(d); return w2; };
    const ler = (w2) => { const keep = wb; wb = w2; listCache = new Map(); try { const sn = seqSnapshot(); return { sn, total: val('PROPOSTA', 'P43'), margem: val('PROPOSTA', 'J16'), fora: ITEMS.filter((S) => filled(S)).filter((S) => val(S, 'P84') === 'ABAIXO DO PISO' || txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO').length, desc: num0(val('PROPOSTA', 'C9')) }; } finally { wb = keep; listCache = new Map(); } };
    let w2 = monta(JSON.parse(JSON.stringify(doc))); let r = ler(w2);
    // valor final negociado: acha o desconto global que leva a esse total (com IPI)
    if (typeof sc.alvo === 'number' && sc.alvo > 0) { for (let i = 0; i < 10 && Math.abs(r.total - sc.alvo) > 0.5; i++) { const d = num0(doc.PROPOSTA.C9); doc.PROPOSTA.C9 = Math.min(0.95, 1 - (1 - d) * sc.alvo / r.total); w2 = monta(JSON.parse(JSON.stringify(doc))); r = ler(w2); } }
    r.docSim = doc; return r;
  }
  const resumoSim = (r) => { const s = r.sn; const custo = s.custo; return { total: r.total, venda: s.venda, custo, impostos: s.impostos, comissao: s.comissao, margem: s.margem, margemPct: r.margem, markup: custo ? s.venda / custo : null, fora: r.fora, desc: r.desc }; };
  function vSimulador() {
    const P = 'PROPOSTA'; const sc = ui.sim || {}; const O = resumoSim({ sn: seqSnapshot(), total: val(P, 'P43'), margem: val(P, 'J16'), fora: ITEMS.filter((S) => filled(S)).filter((S) => val(S, 'P84') === 'ABAIXO DO PISO' || txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO').length, desc: num0(val(P, 'C9')) });
    let Sres = null; if (ui.simRes) Sres = ui.simRes;
    const mMin = val('PARÂMETROS', 'C34'); const pags = listFor(P, 'J6') || [];
    const lin = (lb, f, fmt) => `<tr><td>${lb}</td><td class="n">${fmt(f(O))}</td><td class="n"><b>${Sres ? fmt(f(Sres)) : '—'}</b></td><td class="n">${Sres && typeof f(O) === 'number' && typeof f(Sres) === 'number' ? (f(Sres) - f(O) >= 0 ? '+' : '−') + fmt(Math.abs(f(Sres) - f(O))).replace('R$ ', '') : ''}</td></tr>`;
    const x = (v) => (typeof v === 'number' && isFinite(v) ? NF[2].format(v) + 'x' : '—');
    const salvos = state.cenSim || [];
    return `<section class="card" id="simCard"><h2>Simulador de negociação <span class="pill warn">simulação: não altera a proposta</span></h2>
      <p class="sub" style="margin:0 0 8px">Usa o mesmo motor de cálculo da proposta, numa cópia. Nada muda até você converter o cenário em revisão.</p>
      <div class="fields">
        <div class="f"><label for="simDesc">Desconto global (%)</label><input id="simDesc" inputmode="decimal" value="${typeof sc.desc === 'number' ? esc(NF[2].format(sc.desc * 100)) : ''}" placeholder="${esc(NF[2].format(O.desc * 100))}"></div>
        <div class="f"><label for="simAlvo">ou valor final negociado (com IPI)</label><input id="simAlvo" inputmode="decimal" value="${typeof sc.alvo === 'number' ? esc(NF[2].format(sc.alvo)) : ''}" placeholder="R$"></div>
        <div class="f"><label for="simCusto">Variação de custos (%)</label><input id="simCusto" inputmode="decimal" value="${typeof sc.custoPct === 'number' ? esc(NF[2].format(sc.custoPct * 100)) : ''}" placeholder="0"></div>
        <div class="f span2"><label for="simPag">Condição de pagamento</label><select id="simPag"><option value="">igual à proposta</option>${pags.map((o) => `<option${sc.pag === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
        <div class="f span2"><label>Comissões</label><div class="seg"><label><input type="checkbox" id="simComV"${sc.comV ?? (txt(P, 'J7') !== 'SEM COMISSÃO' && txt(P, 'J7') !== '') ? ' checked' : ''}>Vendedor</label><label><input type="checkbox" id="simComA"${sc.comA ?? (txt(P, 'J8') !== 'SEM COMISSÃO' && txt(P, 'J8') !== '') ? ' checked' : ''}>AN</label></div></div></div>
      <div class="docbar" style="margin-top:8px"><button class="btn pri" data-simrun>Simular</button>${Sres ? '<button class="btn" data-simsave>Salvar cenário</button><button class="btn" data-simrev>Converter em revisão</button>' : ''}<button class="btn" data-simclear>Restaurar o original</button></div>
      ${Sres ? `<div class="tw" style="margin-top:10px"><table class="t"><thead><tr><th></th><th>Proposta oficial</th><th>Simulação</th><th>Diferença</th></tr></thead><tbody>
        ${lin('Total ao cliente (com IPI)', (v) => v.total, brl)}${lin('Venda sem IPI', (v) => v.venda, brl)}${lin('Custo', (v) => v.custo, brl)}${lin('Impostos', (v) => v.impostos, brl)}${lin('Comissões', (v) => v.comissao, brl)}${lin('Resultado (margem líquida R$)', (v) => v.margem, brl)}
        ${lin('Margem líquida', (v) => v.margemPct, (v) => pct(v, 1))}${lin('Markup (venda ÷ custo)', (v) => v.markup, x)}${lin('Desconto global', (v) => v.desc, (v) => pct(v, 1))}${lin('Itens fora da política', (v) => v.fora, (v) => String(v ?? '—'))}</tbody></table></div>
        <div class="banner ${Sres.fora || Sres.margemPct < mMin - 5e-4 ? 'warn' : 'ok'}" style="margin:8px 0 0">${Sres.fora || Sres.margemPct < mMin - 5e-4 ? `Este cenário <b>precisa de aprovação</b> da Diretoria e do Financeiro (margem ${pct(Sres.margemPct, 1)}, mínimo ${pct(mMin, 0)}). <button class="restore" data-simaprov>pedir aprovação com este valor</button>` : 'Este cenário fica dentro da política.'}</div>` : ''}
      ${salvos.length ? `<h2 style="margin-top:12px">Cenários salvos</h2><div class="tw"><table class="t"><tbody>${salvos.map((c, i) => `<tr><td><b>${esc(c.nome)}</b><br><small class="sub">${esc(fmtAt(c.at))}</small></td><td class="n">${brl(c.res.total)}</td><td class="n">${pct(c.res.margemPct, 1)}</td><td style="white-space:nowrap"><button class="btn sm" data-simload="${i}">Abrir</button> <button class="restore" data-simdel="${i}">excluir</button></td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
  }
  function lerSimForm() {
    const pv = (id, k) => { const t = ($('#' + id) || {}).value; if (!t || !t.trim()) return undefined; const n = parseInput(t.trim(), 'num'); return typeof n === 'number' ? n / k : undefined; };
    return { desc: pv('simDesc', 100), alvo: pv('simAlvo', 1), custoPct: pv('simCusto', 100), pag: ($('#simPag') || {}).value || undefined, comV: !!($('#simComV') || {}).checked, comA: !!($('#simComA') || {}).checked };
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-simrun]')) { const sc = lerSimForm(); ui.sim = sc; toast('Simulando…'); setTimeout(() => { try { const r = simular(sc); ui.simRes = resumoSim(r); ui.simDoc = r.docSim; } catch (er) { toast('Não consegui simular: ' + errMsg(er)); } render(); const c = $('#simCard'); if (c) c.scrollIntoView({ block: 'start' }); }, 20); return; }
    if (e.target.closest('[data-simclear]')) { ui.sim = null; ui.simRes = null; ui.simDoc = null; render(); return; }
    if (e.target.closest('[data-simsave]')) { const nome = await DLG.pedir('Nome do cenário', 'Cenário ' + ((state.cenSim || []).length + 1)); if (!nome) return; state.cenSim = (state.cenSim || []).concat([{ nome, at: new Date().toISOString(), by: REG.me || null, sc: ui.sim, res: ui.simRes }]); dirty = true; persist(); logEv({ tipo: 'Simulação salva', ref: docTitle(), desc: nome + ': ' + brl(ui.simRes.total) + ' · margem ' + pct(ui.simRes.margemPct, 1), mudancas: [] }); render(); toast('Cenário salvo (não altera a proposta)'); return; }
    const ld = e.target.closest('[data-simload]'); if (ld) { const c = (state.cenSim || [])[+ld.dataset.simload]; if (c) { ui.sim = c.sc; const r = simular(c.sc); ui.simRes = resumoSim(r); ui.simDoc = r.docSim; render(); } return; }
    const dl = e.target.closest('[data-simdel]'); if (dl) { state.cenSim = (state.cenSim || []).filter((_, i) => i !== +dl.dataset.simdel); dirty = true; persist(); render(); return; }
    if (e.target.closest('[data-simaprov]')) { e.preventDefault(); $('#app [data-alaprov]') ? null : null; ui.simAlvoAprov = ui.simRes.total; await abrirAprovacaoComAlvo(ui.simRes.total); return; }
    if (e.target.closest('[data-simrev]')) {
      if (!state.id) { toast('Salve a proposta primeiro'); return; } if (!ui.simDoc) return;
      if (!await DLG.confirmar('Converter este cenário em revisão? A revisão atual fica guardada e os valores simulados viram a próxima revisão (proposta oficial).')) return;
      const docSim = ui.simDoc; const res = ui.simRes;
      await revisar('cenário simulado: ' + brl(res.total) + ' · margem ' + pct(res.margemPct, 1), () => { for (const [sh, cells] of Object.entries(docSim)) { if (!PROPOSAL_SHEETS.has(sh)) continue; state.doc[sh] = Object.assign({}, cells); } build(); });
      ui.sim = null; ui.simRes = null; ui.simDoc = null; ui.step = 4; render(); return;
    }
  });
  async function abrirAprovacaoComAlvo(totalIpi) {
    if (!state.id || dirty) { await $('#bSave').onclick(); if (!state.id) return; }
    const p = (REG.listPropostas() || []).find((x) => x.id === state.id) || { id: state.id, uid: state.uid, name: docTitle(), div: 'SEQ' };
    MG.pedirAprovacao(Object.assign({ numero: txt('PROPOSTA', 'C5'), cliente: txt('PROPOSTA', 'F5') }, p, { id: state.id, name: docTitle() }), seqSnapshot(), totalIpi);
  }

  // ---------- conferência central: tudo o que impede, pede atenção ou só informa, num lugar só ----------
  function conferenciaCentral() {
    const P = 'PROPOSTA'; const out = []; const add = (sev, area, msg, go) => { if (!out.some((x) => x.msg === msg && x.area === area)) out.push({ sev, area, msg, go }); };
    // cabeçalho completo é obrigatório nas propostas novas; nas antigas (antes da regra), falta vira aviso
    for (const [, lb] of faltaCab()) add(state.cabReq ? 'imped' : 'aviso', 'Identificação', 'Falta preencher: ' + lb, { step: 1 });
    const items = ITEMS.map((s, i) => ({ s, i })).filter((x) => used(x.i));
    if (!items.some((x) => filled(x.s))) add('imped', 'Configuração', 'Nenhum equipamento com preço na proposta', { step: 2 });
    for (const x of items) {
      if (!filled(x.s)) { add('aviso', 'Configuração', x.s + ': equipamento ainda não configurado', { item: x.i }); continue; }
      for (const a of alertsFor(x.s)) { if (a.ack) continue; const ap = a.aprov && a.aprov.estado;
        if (a.aprov) { if (ap === 'aprovada') continue; add(ap === 'pendente' ? 'aviso' : 'aviso', 'Margem e desconto', x.s + ': ' + a.msg + (ap === 'pendente' ? ' — aprovação pedida' : ' — exige aprovação'), { step: 5, sel: '.aprovbox' }); continue; }
        add(a.lvl === 'bad' ? 'imped' : a.lvl === 'warn' ? 'aviso' : 'info', a.lvl === 'info' && !a.regra ? 'Fiscal e FCI' : 'Configuração', x.s + ': ' + a.msg, { item: x.i }); }
      if (!txt(x.s, 'G7')) add('aviso', 'Fiscal e FCI', x.s + ': item sem NCM (cadastre o NCM da família em Fiscal)', { step: 1 });
    }
    try { const L = linhasCusto(); const n = (s) => L.filter((y) => y.al.some((a) => a[0] === s)).length;
      if (n('imped')) add('imped', 'Custos', n('imped') + ' componente(s) principal(is) sem preço', { step: 3 }); if (n('aviso')) add('aviso', 'Custos', n('aviso') + ' linha(s) de custo pedindo atenção (sem custo, cotação vencida, variação)', { step: 3 }); if (n('info')) add('info', 'Custos', n('info') + ' linha(s) com informação de cotação', { step: 3 }); } catch (e) { /* segue */ }
    if (state.precosFix) { const D = difPrecos(state.precosFix); if (D.length) add('info', 'Custos', D.length + ' preço(s) do cadastro mudaram desde a época desta proposta; ela continua com os preços da época', { step: 3 }); }
    const memo = val(P, 'E83'); if (typeof memo === 'number' && Math.abs(memo) > 0.005) add('imped', 'Integridade do cálculo', 'A proposta não bate com o memorial: diferença de ' + brl(memo), { step: 4 });
    const ai = aprovInfo(); if (ai.estado === 'pendente') add('aviso', 'Aprovação', 'Aprovação ' + (ai.com || '').replace(/<[^>]+>/g, ''), { step: 5, sel: '.aprovbox' }); else if (ai.estado === 'reprovada') add('imped', 'Aprovação', 'Desconto reprovado: ajuste o preço ou peça de novo', { step: 5, sel: '.aprovbox' }); else if (ai.estado === 'vencida') add('imped', 'Aprovação', ai.motivo ? 'A aprovação perdeu a validade: ' + ai.motivo : 'Proposta abaixo do valor aprovado', { step: 5, sel: '.aprovbox' });
    const sv = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    if (sv && !MG.conferidaOk(sv)) add(sv.conferencia ? 'aviso' : 'info', 'Documentos', sv.conferencia ? (sv.conferencia.ok ? 'Conferência do PDF desatualizada: a proposta mudou' : 'O PDF conferido tem divergências') : 'PDF da proposta ainda não conferido', { step: 5, sel: '#confCard' });
    if (!state.id) add('aviso', 'Documentos', 'Proposta ainda não salva', { save: true });
    return out;
  }
  const resumoConf = () => { try { const L = conferenciaCentral(); return { imped: L.filter((x) => x.sev === 'imped').length, aviso: L.filter((x) => x.sev === 'aviso').length, info: L.filter((x) => x.sev === 'info').length }; } catch (e) { return { imped: 0, aviso: 0, info: 0 }; } };
  function vConferenciaCentral() {
    const L = conferenciaCentral(); const g = { imped: 'Impede seguir', aviso: 'Pede tratamento ou justificativa', info: 'Informação' };
    const ic = { imped: '<span class="bad-t">✕</span>', aviso: '<span class="warn-t">!</span>', info: '<span class="sub">i</span>' };
    return `<section class="card" id="confCentral"><h2>Conferência da proposta <span class="sub">campos, cliente, equipamentos, custos, fiscal, margem, aprovações, documentos e cálculo</span></h2>
      <div class="kpis" style="margin-bottom:8px">${['imped', 'aviso', 'info'].map((s) => `<div class="kpi"><span>${g[s]}</span><b class="${s === 'imped' && L.some((x) => x.sev === s) ? 'bad-t' : s === 'aviso' && L.some((x) => x.sev === s) ? 'warn-t' : 'ok-t'}">${L.filter((x) => x.sev === s).length}</b></div>`).join('')}</div>
      ${L.length ? `<div class="tw"><table class="t"><tbody>${['imped', 'aviso', 'info'].flatMap((s) => L.filter((x) => x.sev === s)).map((x) => `<tr class="${x.sev === 'imped' ? 'cf-erro' : x.sev === 'aviso' ? 'cf-aviso' : ''}"><td style="width:24px">${ic[x.sev]}</td><td><small class="sub">${esc(x.area)}</small><br>${esc(x.msg)}</td><td style="text-align:right"><button class="btn sm" data-confgo="${esc(JSON.stringify(x.go))}">Ir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="ok-t" style="margin:0">Tudo conferido: nada impede, nada pede atenção.</p>'}
      <p class="sub" style="margin:8px 0 0">${custosCfg().bloquearEnvio ? 'Pela política (Cadastros → Custos), "Enviar ao cliente" fica travado enquanto houver itens que impedem seguir.' : 'A política atual não trava o envio: os impeditivos ficam só como aviso.'}</p></section>`;
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-confgo]'); if (!g) return; let go; try { go = JSON.parse(g.dataset.confgo); } catch (er) { return; }
    if (go.save) { $('#bSave').onclick(); return; }
    if (typeof go.item === 'number') { ui.item = go.item; ui.itemFull = false; cfgEtRestart(go.item); setView('item'); return; }
    ui.step = go.step || 1; setView('proposta'); if (go.sel) setTimeout(() => { const el = document.querySelector(go.sel); if (el) el.scrollIntoView({ block: 'center' }); }, 60);
  });

  // ---------- proposta: cabeçalho de contexto e abas ----------
  // Itens e Memorial pertencem à proposta SEQ aberta: ficam nas abas da proposta, não no menu global.
  // abas da proposta (documento): Itens lista os equipamentos; Configuração abre o configurador do item atual;
  // Formação de preço e Memorial de cálculo mostram o mesmo motor da planilha (nenhum cálculo novo)
  const ABAS_SEQ = [['geral', 'Dados gerais', 'id-card', 1], ['itens', 'Itens', 'boxes', 2], ['configuracao', 'Configuração', 'sliders-horizontal', 0], ['custos', 'Custos', 'coins', 3], ['formacao', 'Formação de preço', 'badge-percent', 4], ['memorial', 'Memorial de cálculo', 'scroll-text', 0], ['conferencia', 'Conferência', 'clipboard-check', 5], ['documentos', 'Documentos', 'folder-open', 6], ['historico', 'Histórico', 'history', 0]];
  const ABAS_OUTRO = [['proposta', 'Proposta', 'wrench'], ['historico', 'Histórico', 'history']];
  const viewDaProposta = (v) => ['proposta', 'item', 'memorial', 'phist'].includes(v);
  function abaAtual() { if (ui.view === 'item') return 'configuracao'; if (ui.view === 'memorial') return 'memorial'; if (ui.view === 'phist') return 'historico'; const st = ui.step || 1; return (ABAS_SEQ.find((a) => a[3] === st) || ABAS_SEQ[0])[0]; }
  function estadoEtapas() {
    const P = 'PROPOSTA'; const items = ITEMS.map((s, i) => ({ s, i })).filter((x) => used(x.i));
    const alerts = items.flatMap((x) => alertsFor(x.s).map((a) => Object.assign({ i: x.i }, a)));
    const margem = val(P, 'J16'), mMin = val('PARÂMETROS', 'C34');
    const rc = resumoConf(); const nCusto = (() => { try { const L = linhasCusto(); return { imped: L.filter((x) => x.al.some((a) => a[0] === 'imped')).length, aviso: L.filter((x) => x.al.some((a) => a[0] === 'aviso')).length }; } catch (e) { return { imped: 0, aviso: 0 }; } })();
    const sv = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    return { items, alerts, margem, mMin, rc, sv, e: {
      1: faltaCab().length ? ['pend', faltaCab().length + ' campo(s) a preencher'] : ['ok', txt(P, 'F5')],
      2: !items.some((x) => filled(x.s)) ? ['pend', 'nenhum equipamento'] : alerts.some((a) => !a.ack && a.lvl === 'bad' && !a.aprov) ? ['warn', items.length + ' item(ns) · alertas'] : ['ok', items.length + ' item(ns)'],
      3: nCusto.imped ? ['bad', nCusto.imped + ' sem preço'] : nCusto.aviso ? ['warn', nCusto.aviso + ' a conferir'] : ['ok', brl(val(P, 'G16'))],
      4: typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? ['warn', 'margem ' + pct(margem) + ' < mínimo'] : ['ok', 'margem ' + pct(margem)],
      5: rc.imped ? ['bad', rc.imped + ' impede(m) seguir'] : rc.aviso ? ['warn', rc.aviso + ' aviso(s)'] : ['ok', 'conferida'],
      6: sv ? ['ok', ({ rascunho: 'pronta para enviar', enviada: 'enviada', negociacao: 'em negociação', ganha: 'ganha', perdida: 'perdida' })[sv.status || 'rascunho'] || sv.status] : ['pend', 'salve a proposta'] } };
  }
  const STATUS_LB = { rascunho: 'Em aberto', enviada: 'Enviada ao cliente', negociacao: 'Enviada · em negociação', ganha: 'Ganha', perdida: 'Perdida' };
  // cabeçalho permanente: número, cliente, tipo, revisão, situação, total, margem, pendências e os atalhos da proposta
  function ctxHeader() {
    const spv = isSpv(), fx = isFacts(); const sv = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    let num, cli, tot, mg, mMin, custo, nItens, pend;
    if (spv) { const sn = SPV.snapshot(state.spv); num = state.spv.numero; cli = state.spv.cliente; tot = SPV.total(); mg = sn.margemPct; mMin = sn.minimo; custo = sn.custo; nItens = sn.itens.length; }
    else if (fx) { const sn = FX.snapshot(state.facts); num = state.facts.numero; cli = state.facts.cliente; tot = FX.total(); mg = sn.margemPct; mMin = sn.minimo; custo = sn.custo; nItens = sn.itens.length; }
    else { const P = 'PROPOSTA'; num = txt(P, 'C5'); cli = txt(P, 'F5'); tot = val(P, 'B16'); mg = val(P, 'J16'); mMin = val('PARÂMETROS', 'C34'); custo = val(P, 'G16'); nItens = ITEMS.filter((s, i) => used(i)).length; }
    if (!spv && !fx) { const rc = resumoConf(); pend = rc.imped + rc.aviso; } else pend = 0;
    // as automáticas repetem os itens da conferência: na SEQ entram só as manuais, para não contar duas vezes
    const pnAb = state.id ? PN.daProposta(state.id).filter(PN.aberta).filter((x) => spv || fx || x.origem !== 'auto').length : 0;
    const sit = sv ? (MG.situacao ? MG.situacao(sv) : [STATUS_LB[sv.status || 'rascunho'], 'mute']) : ['Não salva', 'mute'];
    const baixa = typeof mg === 'number' && typeof mMin === 'number' && mg < mMin;
    const ipiTxt = spv ? 'com impostos' : 'com IPI';
    return `<section class="ctxh${ui.ctxOpen ? ' open' : ''}" aria-label="Resumo da proposta">
      <div class="ctx-id"><span class="divb ${spv ? 'spv' : 'seq'}">${spv ? 'SPV' : fx ? 'FACTS' : 'SEQ'}</span><div class="ctx-tt"><h1>${esc(num || 'Proposta sem número')}</h1><div class="sub">${esc(cli || 'Cliente não informado')}</div></div>
        <div class="ctx-tags">${revSelo()}<span class="pill ${sit[1]}">${esc(sit[2] === 'aprovacao' && MG.faseLb ? MG.faseLb('aprovacao') : sit[0])}</span>${spv || fx ? '' : apSelo()}${podeCancelar() ? `<button class="btn sm ghost" data-cancelar data-ico="x" title="${sv ? 'Descartar o que não foi salvo' : 'Desistir da criação desta proposta'}">Cancelar</button>` : ''}</div></div>
      <div class="ctx-kpis sumbar sticky">
        <div class="k"><span>Valor total</span><b>${brl(tot)}</b><em>${ipiTxt}</em></div>
        <div class="k"><span>Margem</span><b class="${baixa ? 'bad-t' : ''}">${pct(mg)}</b><em>${typeof mMin === 'number' ? `mín. ${pct(mMin, 0)}` : ''}</em></div>
        <div class="k x"><span>Custo</span><b>${brl(custo)}</b><em></em></div>
        <div class="k x"><span>Itens</span><b>${nItens}</b><em></em></div>
        <div class="k kpend" ${spv || fx ? 'data-view="pendencias"' : 'data-step="5"'} role="button" tabindex="0" title="Ver as pendências"><span>Pendências</span><b class="${pend || pnAb ? 'warn-t' : 'ok-t'}">${pend + pnAb}</b><em>${pend ? pend + ' na conferência' : ''}${pend && pnAb ? ' · ' : ''}${pnAb ? pnAb + ' em acompanhamento' : pend ? '' : 'nada pendente'}</em></div>
        <button class="btn sm ctx-more" data-ctxmore aria-expanded="${ui.ctxOpen ? 'true' : 'false'}" data-ico="${ui.ctxOpen ? 'chevron-down' : 'chevron-right'}">${ui.ctxOpen ? 'menos' : 'mais'}</button></div>
    </section>`;
  }
  function propTabs() {
    if (isSpv() || isFacts()) { const cur = ui.view === 'phist' ? 'historico' : 'proposta';
      return `<nav class="ptabs" aria-label="Áreas da proposta">${ABAS_OUTRO.map(([k, lb, ic]) => `<button class="ptab${cur === k ? ' on' : ''}" data-view="${k === 'historico' ? 'phist' : 'proposta'}" data-ico="${ic}" aria-current="${cur === k ? 'page' : 'false'}"><span>${lb === 'Proposta' ? (isSpv() ? 'Serviço e pós-venda' : 'FACTS') : lb}</span></button>`).join('')}</nav>`; }
    const E = estadoEtapas().e; const cur = abaAtual();
    return `<nav class="ptabs" aria-label="Áreas da proposta">${ABAS_SEQ.map(([k, lb, ic, n]) => { const s = n ? E[n] : null; const at = n ? `data-step="${n}"` : k === 'configuracao' ? 'data-ptcfg' : `data-view="${k === 'memorial' ? 'memorial' : 'phist'}"`;
      return `<button class="ptab${cur === k ? ' on' : ''}${s ? ' st-' + s[0] : ''}" ${at} data-ico="${ic}" aria-current="${cur === k ? 'page' : 'false'}" title="${esc(lb + (s && s[1] ? ' — ' + s[1] : ''))}"><span>${lb}</span>${s ? `<i class="pst" aria-label="${esc(s[1] || '')}">${s[0] === 'ok' ? '✓' : s[0] === 'bad' ? '!' : s[0] === 'warn' ? '•' : ''}</i>` : ''}</button>`; }).join('')}</nav>`;
  }
  const propHeader = () => ctxHeader() + propTabs();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-ctxmore]')) { ui.ctxOpen = !ui.ctxOpen; render(); } });
  // histórico da proposta: revisões, etapas e o que foi registrado sobre ela
  function vPropHist() {
    const sv = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    if (!state.id) return '<section class="card"><p class="sub" style="margin:0">Salve a proposta para ter histórico e revisões.</p></section>';
    const ev = (REG.historico || []).filter((h) => h.ref === state.id || (h.mudancas || []).some((m) => m.campo === state.id)).slice(0, 80);
    return `<div class="stack"><section class="card"><h2>Situação e etapas</h2>${sv ? MG.etapasHtml(sv) : ''}</section>
      <section class="card"><h2>Revisões <span class="sub">revisão atual ${revAtual()}</span></h2><div class="docbar"><button class="btn" data-revs data-ico="git-compare">Ver, comparar e restaurar revisões</button>${state.verRev ? '' : '<button class="btn" data-revisar data-ico="refresh-cw">Revisar (nova revisão)</button>'}</div></section>
      <section class="card"><h2>Registro <span class="sub">${ev.length} evento(s) desta proposta</span></h2>${ev.length ? `<div class="hlist">${ev.map((h) => `<div class="hrow"><div class="hmeta"><b>${fmtAt(h.at)}</b><small>${who(h.by)}</small></div><div><span class="pill mute">${esc(h.tipo)}</span> ${esc(h.desc || '')}${(h.mudancas || []).length ? `<table class="t mini"><tbody>${h.mudancas.slice(0, 8).map((m) => `<tr><td>${esc(m.campo)}</td><td class="n sub">${esc(fmtVal(m.de))}</td><td>→</td><td class="n"><b>${esc(fmtVal(m.para))}</b></td></tr>`).join('')}</tbody></table>` : ''}</div></div>`).join('')}</div>` : '<p class="sub" style="margin:0">Nada registrado ainda.</p>'}</section></div>`;
  }
  function vPropostaS() {
    const P = 'PROPOSTA'; let step = ui.step || 1; if (step > 6) step = 6;
    const items = ITEMS.map((s, i) => ({ s, i })).filter((x) => used(x.i));
    const alerts = items.flatMap((x) => alertsFor(x.s).map((a) => Object.assign({ i: x.i }, a)));
    const margem = val(P, 'J16'), mMin = val('PARÂMETROS', 'C34');
    const rc = resumoConf(); const nCusto = (() => { try { const L = linhasCusto(); return { imped: L.filter((x) => x.al.some((a) => a[0] === 'imped')).length, aviso: L.filter((x) => x.al.some((a) => a[0] === 'aviso')).length }; } catch (e) { return { imped: 0, aviso: 0 }; } })();
    const sv = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    const estado = {
      1: faltaCab().length ? ['pend', faltaCab().length + ' campo(s) a preencher'] : ['ok', txt(P, 'F5')],
      2: !items.some((x) => filled(x.s)) ? ['pend', 'nenhum equipamento'] : alerts.some((a) => !a.ack && a.lvl === 'bad' && !a.aprov) ? ['warn', items.length + ' item(ns) · alertas'] : ['ok', items.length + ' item(ns)'],
      3: nCusto.imped ? ['bad', nCusto.imped + ' sem preço'] : nCusto.aviso ? ['warn', nCusto.aviso + ' a conferir'] : ['ok', brl(val(P, 'G16'))],
      4: typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? ['warn', 'margem ' + pct(margem) + ' < mínimo'] : ['ok', 'margem ' + pct(margem)],
      5: rc.imped ? ['bad', rc.imped + ' impede(m) seguir'] : rc.aviso ? ['warn', rc.aviso + ' aviso(s)'] : ['ok', 'conferida'],
      6: sv ? ['ok', ({ rascunho: 'pronta para enviar', enviada: 'enviada', negociacao: 'em negociação', ganha: 'ganha', perdida: 'perdida' })[sv.status || 'rascunho'] || sv.status] : ['pend', 'salve a proposta'],
    };
    const head = '';
    const nav = (ant, prox) => `<div class="flowbar">${ant ? `<button class="btn" data-step="${ant}">← ${ETAPAS_P[ant - 1][1]}</button>` : '<span></span>'}${prox ? `<button class="btn pri" data-step="${prox}">Próximo: ${ETAPAS_P[prox - 1][1].toLowerCase()} →</button>` : '<span></span>'}</div>`;
    let body = '';
    if (step === 1) {
      const cif = /^CIF/.test(txt(P, 'B13')); const falta = new Set(ui.reqShow ? faltaCab().map((x) => x[0]) : []);
      const rq = (a, lb, cls = '') => fieldS(P, a, lb, { cls: 'req ' + cls + (falta.has(a) ? ' miss' : '') });
      const ven = equipeCom(); const vs = ven.filter((x) => x.papel !== 'an'), ans = ven.filter((x) => x.papel === 'an');
      const chips = (lista, cell, vazio) => { const cur = txt(P, cell); const nomes = [...new Set(lista.map((x) => x.nome).concat(cur && !lista.some((x) => x.nome === cur) ? [cur] : []))];
        return nomes.length ? `<div class="seg" role="radiogroup">${nomes.map((n) => `<label class="${n === cur ? 'on' : ''}"><input type="radio" name="pp_${cell}" data-ppcell="${cell}" value="${esc(n)}"${n === cur ? ' checked' : ''}>${esc(n)}</label>`).join('')}</div>` : `<p class="sub" style="margin:0">${vazio}</p>`; };
      const comV = txt(P, 'J7') !== 'SEM COMISSÃO' && txt(P, 'J7') !== ''; const comA = txt(P, 'J8') !== 'SEM COMISSÃO' && txt(P, 'J8') !== '';
      const famPend = ui.famPend && !filled(ITEMS[0]) ? ui.famPend : null;
      body = `${famPend ? `<div class="banner info">Nova proposta SEQ · <b>${esc(FAM_SEQ_LB[famPend] || famPend)}</b>. Preencha o cabeçalho para seguir ao equipamento.</div>` : ''}
        <section class="card"><h2>Cliente <span class="sub">todos os campos são obrigatórios</span></h2>
          <div class="fields">
            <div class="f span2 req${falta.has('L5') ? ' miss' : ''}"><label for="cnpjIn">CNPJ / CPF</label><div class="cnpjrow"><input id="cnpjIn" value="${esc(fmtDoc(txt(P, 'L5')))}" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off"><button class="btn" id="cnpjGo" type="button">Buscar na Receita</button></div><small class="sub" id="cnpjMsg">${esc(state.cnpjInfo || 'Preenche cliente, local, UF e cadastro fiscal.')}</small></div>
            ${rq('F5', 'Cliente (razão social)', 'span2').replace('<input ', '<input list="dl_clientes" ')}${dlClientesHtml()}${rq('F6', 'Obra / local', 'span2')}${rq('F7', 'UF de destino')}${rq('J5', 'Cadastro fiscal', 'span2')}${rq('F8', 'Segmento')}</div></section>
        <section class="card"><h2>Proposta</h2><div class="fields">${rq('C5', 'Nº da proposta').replace(/<\/label>/, window.LSNumGerar('seq', '#c_PROPOSTA_C5', txt(P, 'C5')) + '</label>')}${rq('C6', 'Revisão')}${rq('C7', 'Data')}${rq('C10', 'Validade')}${rq('J6', 'Condição de pagamento', 'span2')}${rq('F9', 'Norma')}</div></section>
        ${(() => { try { return docPropostaCampos(propostaDados()); } catch (e) { return ''; } })()}
        <section class="card"><h2>Vendedor e comissões</h2><div class="fields">
            <div class="f spanall req${falta.has('C8') ? ' miss' : ''}"><label>Vendedor${REG.areaOk('precificacao') ? ' <button type="button" class="restore" data-novovend>+ novo vendedor ou AN</button>' : ''}</label>${chips(vs, 'C8', REG.areaOk('precificacao') ? 'Nenhum vendedor cadastrado: use "+ novo vendedor ou AN".' : 'Nenhum vendedor cadastrado: peça a quem cuida de Precificação.')}</div>
            <div class="f spanall"><label>Comissões <span class="sub">taxa da divisão (Precificação)</span></label><div class="seg"><label class="${comV ? 'on' : ''}"><input type="checkbox" data-pcom="J7"${comV ? ' checked' : ''}>Vendedor</label><label class="${comA ? 'on' : ''}"><input type="checkbox" data-pcom="J8"${comA ? ' checked' : ''}>Agente de negócio (AN)</label></div></div>
            ${comA ? `<div class="f spanall req${falta.has('L8') ? ' miss' : ''}"><label>Agente de negócio</label>${chips(ans, 'L8', 'Nenhum AN cadastrado: cadastre em Cadastros → Precificação → Vendedores e agentes.')}</div>` : ''}</div></section>
        <section class="card"><h2>Frete</h2><div class="fields">${rq('B13', 'Modalidade', 'span2')}${cif ? rq('D13', 'Distância (km)') + fieldS(P, 'F13', 'Valor fechado (opcional)') : ''}${field(P, 'H13', 'Frete total', { ro: true, fmt: brl })}</div></section>
        <details class="card"${keep('mais')}><summary>Mais opções <span class="sub">desconto global e R$ por km do frete</span></summary>
          <div class="fields">${fieldS(P, 'C9', 'Desconto global (vazio = sem desconto)')}${fieldS(P, 'E13', 'Frete — R$ por km')}</div></details>
        <div class="flowbar"><span class="sub">${ui.reqShow && falta.size ? 'Falta: ' + esc(faltaCab().map((x) => x[1]).join(', ')) : ''}</span><button class="btn pri" data-cabnext>${famPend ? 'Próximo: equipamento →' : 'Próximo: configuração →'}</button></div>`;
    } else if (step === 2) {
      const fechada = !!(state.id && MG.liberaReal(state.id));
      const cards = items.map((x) => {
        const S = x.s; const al = alertsFor(S); const ok = filled(S);
        return `<article class="icard"><header><span class="ino">${S.slice(5)}</span><div style="min-width:0"><b>${esc(txt(S, 'C28') || 'Equipamento ainda não escolhido')}</b><code>${esc(txt(S, 'C27'))}</code></div></header>
          ${ok ? `<div class="itotal"><span>Total c/ IPI</span><b>${brl(val(S, 'D15'))}</b></div><dl class="ifacts"><div><dt>Qtd</dt><dd>${show(S, 'P17')}</dd></div><div><dt>Margem</dt><dd class="${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</dd></div><div><dt>Origem</dt><dd>${esc(txt(S, 'P33').slice(0, 3))} ${pct(val(S, 'P32'), 0)}</dd></div></dl>` : '<p class="sub" style="margin:0">Abra para escolher o modelo pronto ou montar o equipamento.</p>'}
          <div>${ok ? countPills(al) : ''}</div>
          <footer>${fechada ? `<button class="btn sm pri" data-mgreal="${esc(state.id)}" data-mgitem="${S}">Lançar custo real</button><button class="btn sm" data-goitem="${x.i}">Abrir</button>` : `<button class="btn sm pri" data-goitem="${x.i}">Abrir</button>`}<button class="btn sm" data-dup="${x.i}">Duplicar</button>${ok ? `<button class="btn sm" data-modsave="${x.i}" title="Guardar esta configuração para outras propostas">Salvar como modelo</button>` : ''}<button class="btn sm" data-rmitem="${x.i}">Remover</button></footer></article>`;
      }).join('');
      const free = firstFree();
      body = `<div class="icards">${cards}${free >= 0 ? `<button class="icard add" data-additem>+ Adicionar item<small>modelo pronto ou montagem própria</small></button>` : ''}</div>
        ${vModelosItem()}
        ${nav(1, 3)}`;
    } else if (step === 3) {
      body = vencidosBanner() + vCustos() + nav(2, 4);
    } else if (step === 4) {
      const rows = items.filter((x) => filled(x.s)).map((x) => { const S = x.s; return `<tr><td><button class="btn sm" data-goitem="${x.i}">${S.slice(5)}</button></td><td style="min-width:240px">${esc(txt(S, 'C28'))}</td><td class="n">${show(S, 'P17')}</td><td class="n">${brl(val(S, 'B15'))}</td><td class="n"><b>${brl(val(S, 'D15'))}</b></td><td class="n">${pct(val(S, 'J15'))}</td><td>${situPill(txt(S, 'P84'))} ${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? situPill('MARGEM ABAIXO DO MÍNIMO') : ''}</td></tr>`; }).join('');
      const sn = (() => { try { return seqSnapshot(); } catch (e) { return null; } })();
      body = vencidosBanner() + `<div class="kpis">
          <div class="kpi lead"><span>Preço total (com IPI)</span><b>${brl(val(P, 'B16'))}</b></div>
          <div class="kpi"><span>Custo total dos itens</span><b>${brl(val(P, 'G16'))}</b><em>${sn && sn.custo ? 'markup ' + NF[2].format(sn.venda / sn.custo) + 'x' : ''}</em></div>
          <div class="kpi"><span>Margem líquida</span><b class="${typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? 'bad-t' : ''}">${pct(margem)}</b><em>mínimo ${pct(mMin)}</em></div>
          <div class="kpi"><span>Impostos · comissões</span><b>${sn ? brl(sn.impostos) : '—'}</b><em>${sn ? 'comissões ' + brl(sn.comissao) : ''}</em></div>
          <div class="kpi"><span>DIFAL do cliente (fora do preço)</span><b>${brl(val(P, 'E84'))}</b></div></div>
        ${composicaoPrecoHtml()}
        <section class="card"><h2>Condições comerciais <span class="sub">o que mexe no preço</span></h2><div class="fields">${fieldS(P, 'C9', 'Desconto global')}${fieldS(P, 'J6', 'Condição de pagamento', { cls: 'span2' })}${fieldS(P, 'B13', 'Frete', { cls: 'span2' })}</div>
          <p class="sub" style="margin:8px 0 0">Comissões: ${esc(txt(P, 'J7') || '—')} (vendedor) · ${esc(txt(P, 'J8') || '—')} (AN) — ajuste em Identificação. Margem-alvo e desconto por item ficam na tela de cada item.</p></section>
        <section class="card"><h2>Preço por item</h2><div class="tw"><table class="t"><thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Unit. c/ IPI</th><th>Total c/ IPI</th><th>Margem</th><th>Situação</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="4">Total da proposta</td><td class="n">${brl(val(P, 'P43'))}</td><td class="n">${pct(margem)}</td><td></td></tr></tbody></table></div></section>
        ${vSimulador()}
        ${(() => { try { return TB.cardProposta(sn || seqSnapshot(), { uf: txt(P, 'F7'), cadfiscal: txt(P, 'J5'), div: 'SEQ' }); } catch (e) { return ''; } })()}
        ${nav(3, 5)}`;
    } else if (step === 5) {
      body = `${vConferenciaCentral()}
        ${(() => { const ai = aprovInfo(); return `<section class="card"><h2>Aprovação da proposta <span class="sub">desconto além da política: peça pela proposta toda, com o valor target</span></h2><div class="aprovbox">${ai.estado ? aprovLinha({ aprov: ai }).replace(/^<br>/, '') : '<small class="sub">Nenhum pedido de aprovação para esta proposta.</small>'}<button class="btn${ai.estado === 'pendente' || ai.estado === 'aprovada' ? '' : ' pri'}" data-alaprov>${ai.estado ? 'Pedir de novo (novo valor target)' : 'Pedir aprovação (valor target)'}</button></div></section>`; })()}
        ${confCard()}
        ${PN.cardProposta(state.id, docTitle())}
        <details class="card"${keep('alertas')}><summary>Alertas por item <span class="sub">${countPills(alerts)}</span></summary>${alertList(alerts, true) || '<p class="ok-t" style="margin:0">Nenhum alerta nos itens.</p>'}</details>
        ${nav(4, 6)}`;
    } else {
      const nx = sv ? MG.proximo(sv) : null;
      const docsP = (() => { try { return SPV.docsDaProposta(state.uid); } catch (e) { return []; } })();
      body = `<section class="card"><h2>Situação e próximo passo</h2>${sv ? MG.etapasHtml(sv) : '<p class="sub" style="margin:0">Salve a proposta para acompanhar as etapas.</p>'}
          ${nx ? `<div class="docbar" style="margin-top:8px"><button class="btn pri" data-hnext="${esc(sv.id)}|${nx.act}">${esc(nx.lb)}</button></div>` : ''}</section>
        ${propComCard()}
        <section class="card"><h2>Documentos da proposta</h2><div class="docbar"><button class="btn pri" data-doc="memorial">Memorial (PDF)</button><button class="btn" data-doc="fcipdf">FCI (PDF)</button><button class="btn" data-doc="fcixlsx">FCI (Excel)</button><button class="btn" data-propfull>Ver todas as colunas</button><button class="btn" data-view="documentos" data-ico="folder-open">Anexar ou ver todos os documentos</button></div>
          ${docsP.length ? `<div class="tw" style="margin-top:8px"><table class="t"><tbody>${docsP.map((d) => `<tr><td>${esc(d.nome || '')}<br><small class="sub">${esc([d.tipo, d.numero, d.fornecedor, d.rev != null && !isNaN(d.rev) ? 'rev. ' + d.rev : '', d.item, d.etapa].filter(Boolean).join(' · '))}</small></td><td class="sub">${esc(fmtAt(d.at))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:8px 0 0">Nenhum documento ligado ainda (o PDF conferido entra aqui).</p>'}</section>
        <section class="card"><h2>Revisões</h2><div class="docbar">${state.id ? '<button class="btn" data-revs>Ver e comparar revisões</button><button class="btn" data-revisar>Revisar (nova revisão)</button>' : '<span class="sub">Salve a proposta para ter revisões.</span>'}</div></section>
        ${nav(5, 0)}`;
    }
    return `<div class="stack">${head}${body}</div>`;
  }


  // blocos do item usados na tela clássica e na etapa Conferir do configurador
  const lenTag = (n, lim) => `<span class="pill ${n > lim ? 'bad' : 'ok'}">${n} de ${lim} caracteres</span>`;
  function itemCodHtml(S) { const fs = (a, lb, o) => fieldS(S, a, lb, o);
    return `<details class="card"${keep('cod')}><summary>Código e descrição <span class="sub">${lenTag(txt(S, 'C27').length, 60)} ${lenTag(txt(S, 'C28').length, 120)}</span></summary>
        <div class="stack">
          <div><div class="lbl">Código ${lenTag(txt(S, 'C27').length, 60)}</div><div class="codebox">${esc(txt(S, 'C27') || 'o código sai aqui')}</div></div>
          <div><div class="lbl">Descrição breve ${lenTag(txt(S, 'C28').length, 120)}</div><p class="txtv">${esc(txt(S, 'C28')) || '—'}</p></div>
          <div><div class="lbl">Descrição completa</div><p class="txtv">${esc(txt(S, 'C29')) || '—'}</p></div>
          <div><div class="lbl">Ponto operacional</div><p class="txtv">${esc(txt(S, 'C30')) || '—'}</p></div>
          <div class="fields">${fs('J21', 'Marca')}${fs('G7', 'NCM (do cadastro Fiscal)')}${fs('H21', 'Unidade (do cadastro Fiscal)')}${fs('C4', 'Descrição do item na proposta', { cls: 'span2' })}</div>
        </div></details>`; }
  function itemFciHtml(S) { const fs = (a, lb, o) => fieldS(S, a, lb, o); const num = (x) => (typeof x === 'number' ? x : 0);
    const imp = []; let nNac = 0;
    for (let r = 34; r <= 112; r++) { if ((r > 63 && r < 68) || val(S, 'AU' + r) !== 1) continue; if (txt(S, 'AB' + r) === 'IMP') imp.push({ d: txt(S, 'D' + r), q: show(S, 'F' + r), t: num(val(S, 'F' + r)) * num(val(S, 'AD' + r)) }); else nNac++; }
    for (const x of fciHidden(S)) { if (x.ori === 'IMP') imp.push({ d: x.desc, q: fmtNum(x.qtd), t: x.tot }); else nNac++; }
    const fciSt = txt(S, 'C196');
    return `<details class="card"${keep('fci')}><summary>FCI <span class="sub">conteúdo importado ${pct(val(S, 'C172'), 2)} · ${esc(txt(S, 'E172'))} · ${/^OK/.test(fciSt) ? 'pronta' : 'com pendência'}</span></summary>
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
        </div></details>`; }
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
      const alt = ['D', 'F', 'G', 'I'].some((c) => overridden(S, c + r));
      const ori = x.esc ? '<br><span class="pill mute" title="Linha incluída nesta proposta">acrescentado na proposta</span>' : alt ? '<br><span class="pill warn" title="Valor trocado à mão nesta proposta">alterado na proposta</span>' : txt(S, 'AR1') ? '<br><span class="pill mute" title="Veio do modelo pronto, sobre a estrutura padrão">do modelo</span>' : '<br><span class="pill mute" title="Veio da estrutura padrão">do padrão</span>';
      const first = x.esc ? `${cellIn(S, 'C' + r).replace(/<\/td>$/, ori + '</td>')}` : `<td class="sub">${esc(x.rot)}${ori}</td>`;
      // sempre do cadastro: o insumo vem da lista da família e o custo unitário é o cadastrado
      const lista = fam ? famProdutos(fam) : [];
      const insumo = fam ? cellIn(S, 'D' + r, { list: lista, novoIns: fam }) : '<td class="sub">escolha a família</td>';
      const custo = `<td class="n">${show(S, 'G' + r)}${overridden(S, 'G' + r) ? ` <button class="restore" data-restore="${esc(S)}|G${r}" title="Custo digitado à mão numa versão antiga">↺ usar o do cadastro</button>` : ''}</td>`;
      return `<tr>${first}${insumo}${x.esc ? cellIn(S, 'F' + r) : qtdRO(S, r)}${custo}${updCell(S, r)}<td class="n">${show(S, 'H' + r)}</td><td class="n sub">${pItem(num(val(S, 'H' + r)))}</td><td>${obs(r)}${x.esc ? ` <button class="restore" data-rmrow="${r}">remover</button>` : ''}</td></tr>`;
    };
    const comp = Object.entries(groups).filter(([, g]) => g.length).map(([k, g]) => { const gt = g.reduce((t, x) => t + x.tot, 0); return `<tr class="grp"><td colspan="5">${gl[k]}</td><td class="n">${fmtNum(gt, '#,##0.00')}</td><td class="n">${pItem(gt)}</td><td></td></tr>${g.map(rowC).join('')}`; }).join('');
    const cond = `Desconto ${pct(val(S, 'C8') || 0, 1)} · margem alvo ${pct(val(S, 'P89'))} · start-up ${val(S, 'K12') ? brl(val(S, 'K12')) + '/un.' : 'não'}`;
    return `<div class="stack">
      <div class="flowhead"><div style="min-width:0"><button class="btn sm" data-step="2">← Itens da proposta</button><h1 style="margin-top:8px">${S}</h1><div class="sub">${esc(txt(S, 'C28')) || 'Escolha um modelo pronto ou monte o equipamento abaixo.'}</div></div>
        <div class="sumbar"><div><span>Unitário c/ IPI</span><b>${brl(val(S, 'B15'))}</b></div><div><span>Total</span><b>${brl(val(S, 'D15'))}</b></div><div><span>Margem</span><b class="${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</b></div><div>${ok ? countPills(al) : ''}</div></div></div>
      ${alertList(al, false)}
      ${scopeWarning(S)}
      ${!montLines(S).length && groups.ESC.length ? `<div class="banner info">Este item foi montado linha a linha (${groups.ESC.length} componentes adicionais escolhidos do cadastro), sem usar a seleção abaixo. O preço vem dessas linhas, em Componentes.</div>` : ''}
      ${famPanel(S, c)}
      ${!famChosen(S, c) ? '' : `<section class="card"><h2>Equipamento <span class="sub">${esc(famLabel(String(val(S, 'AR2') || 'CMB')))} · <button class="restore" data-famreset>trocar a família</button></span></h2>
        <div class="fields">${f('C17', 'Modelo pronto', { cls: 'span2', list: modelos().filter((m) => m.estr === String(val(S, 'AR2') || 'CMB')).map((m) => m.nome) })}${f('C6', 'Quantidade', { step: 1, ph: '1' })}</div>
        <div class="sep-or">ou monte</div>
        <div class="fields">${fs('C21', 'Família')}${fromModel('G17') && val(S, 'AR4') ? modelTxt('G17', 'Vazão (USgpm)', fmtNum(val(S, 'AR4'))) : f('G17', 'Vazão (USgpm)')}${fs('H17', 'Pressão (mca)')}${fs('I17', 'Norma')}</div>
        <div class="arrbox">${arrUi}</div>
        ${sets.join('')}
      </section>`}
      ${famChosen(S, c) ? optSection(S, c) : ''}
      ${espItemCard(S)}
      ${!famChosen(S, c) ? '' : `
      <details class="card"${keep('cond')}><summary>Condições deste item <span class="sub">${esc(cond)}</span></summary>
        <div class="fields">${f('C8', 'Desconto de negociação')}${fs('L17', 'Margem alvo')}${fs('J17', 'Modo de preço')}${fs('K7', 'Folga de negociação')}${f('C12', 'Start-up — distância (km)')}${f('F12', 'Start-up — diárias')}${f('I12', 'Start-up — valor fechado')}</div></details>
      <details class="card"${keep('comp')}><summary>Componentes <span class="sub">${nComp} itens · custo ${brl(val(S, 'H114'))}</span></summary>
        <p class="sub" style="margin:0 0 10px">Verde é o que a montagem escolheu sozinha. O insumo vem da lista da família; preço, origem e data vêm do cadastro, e a quantidade vem da estrutura do item (Engenharia → Estruturas). Só nos componentes adicionais você informa a quantidade. Se o insumo não existe ou está sem preço, use "pedir cadastro".</p>
        ${nComp ? `<div class="tw"><table class="t comp"><thead><tr><th>Item / família</th><th>Insumo</th><th>Qtd</th><th>Custo unit.</th><th>Preço atualizado em</th><th>Custo total</th><th>% do item</th><th></th></tr></thead><tbody>${comp}<tr class="tot"><td colspan="5">Custo do item</td><td class="n">${brl(val(S, 'H114'))}</td><td class="n">100%</td><td></td></tr></tbody></table></div>` : '<p class="sub">Os componentes aparecem quando o equipamento estiver escolhido.</p>'}
        <div class="docbar" style="margin-top:10px"><button class="btn sm" data-addrow>+ Adicionar componente do cadastro</button><button class="btn sm" data-pedir="${esc(JSON.stringify({ linha: { rotulo: S + ' · novo componente' } }))}">Pedir cadastro de insumo</button></div></details>
      ${itemCodHtml(S)}
      ${itemPropCard(S)}
      ${itemFciHtml(S)}
      `}
      <div class="flowbar"><button class="btn" data-step="2">← Itens da proposta</button><span style="display:flex;gap:6px">${!txt(S, 'C17') && ok && c.code && !(c.d && c.e) ? '<button class="btn" data-savemodel>Salvar como modelo pronto</button>' : ''}<button class="btn" data-dup="${ui.item}">Duplicar</button><button class="btn" data-rmitem="${ui.item}">Remover</button></span></div>
      <p class="sub" style="text-align:right;margin:0"><button class="restore" data-cfgassistido>voltar ao configurador assistido</button> · Precisa da planilha célula por célula? <button class="restore" data-itemfull>abrir a visão completa</button></p>
      ${datalists()}
    </div>`;
  }
  // ===================== configurador assistido do equipamento: Configurar → Compor → Conferir =====================
  // Não há motor paralelo: as escolhas vão para as mesmas células do item (família C21, modelo pronto C17, arranjo E17,
  // bomba D19, motor C19/H19/F19 e I19/L19, jockey J19, vazão G17, pressão H17, norma I17, opcionais BC, escopo 68–112) e a
  // planilha monta os componentes pela estrutura (MONTADOR), kits e tabelas por porte, e calcula custo, preço e margem.
  // Aqui só se lê o resultado, se explica de onde cada componente veio e se confere antes de incluir na proposta.
  const CFG_ETAPAS = [[1, 'Configurar', 'sliders-horizontal'], [2, 'Compor', 'layers'], [3, 'Conferir', 'clipboard-check']];
  const CFG_PARAMS = ['C21', 'C17', 'E17', 'D19', 'BA19', 'C19', 'H19', 'F19', 'I19', 'L19', 'J19', 'G17', 'H17', 'I17'];
  const cfgAll = () => (pcGet().cfg || {});
  const cfgDe = (S) => cfgAll()[S] || {};
  function cfgPut(S, fn) { const all = JSON.parse(JSON.stringify(cfgAll())); all[S] = all[S] || {}; fn(all[S]); if (!Object.keys(all[S]).length) delete all[S]; pcSet('cfg', Object.keys(all).length ? all : undefined); }
  // etapa aberta de cada item (preferência da tela): item novo começa em Configurar; item já montado abre em Conferir
  const cfgEtapa = (S) => { ui.cfgEt = ui.cfgEt || {}; if (!ui.cfgEt[S]) ui.cfgEt[S] = filled(S) ? 3 : 1; return ui.cfgEt[S]; };
  // abrir o item pela lista: item preenchido vai para Conferir, item novo para Configurar
  const cfgEtRestart = (i) => { const k = ITEMS[i]; if (ui.cfgEt && k in ui.cfgEt) { ui.cfgEt = Object.assign({}, ui.cfgEt); delete ui.cfgEt[k]; } };
  const cfgIr = (S, n, sel, campo) => { ui.cfgEt = Object.assign({}, ui.cfgEt, { [S]: n }); if (n === 1 && campo && !['C17', 'C6', 'C21'].includes(campo)) ui.cfgModo = Object.assign({}, ui.cfgModo, { [S]: 'carac' }); if (sel !== undefined) ui.cfgSel = sel ? { S, k: sel } : null; store.set(SK.view, ui); render(); window.scrollTo(0, 0); };
  // grava várias células do item de uma vez (uma só renderização); null = volta ao automático
  function cfgSet(S, cells) {
    const tg = target(S); tg[S] = tg[S] || {}; const sh = wb.sheet(S);
    for (const [a, v] of Object.entries(cells)) {
      if (v === undefined) { delete tg[S][a]; const b = baseRaw(S, a); if (b === undefined) sh.cells.delete(a); else sh.cells.set(a, b); }
      else { tg[S][a] = v; sh.cells.set(a, v); }
    }
    if (!Object.keys(tg[S]).length) delete tg[S];
    wb.invalidate(); listCache = new Map(); dirty = true; persist(); render();
  }
  const kitDe = (lista, d) => !!d && (lista || []).some((k) => k.desc === d);
  // componentes do item como a planilha montou, com a linha da estrutura que gerou cada um e a classificação
  function cfgComps(S) {
    const lines = recLines(); const byR = new Map(lines.map((x) => [x.r, x])); const H2 = heads(); const out = []; const usados = new Set();
    const c = arrCounts(S); const est = String(val(S, 'AR2') || 'CMB'); const has = { DIESEL: c.d > 0, ELETRICA: c.e > 0, JOCKEY: c.j, TODOS: true };
    const motorD = txt(S, 'AR6') || txt(S, 'C20'), bomba = txt(S, 'AR7'); const kitM = kitDe(REG.kitMotor, motorD), kitB = kitDe(REG.kitBomba, bomba);
    const classe = (ln) => !ln ? 'obrig' : ln.regra === 'OPCIONAL' ? 'opc' : ['MOTOR', 'BOMBA', 'JOCKEY'].includes(ln.tipo) ? 'princ' : ln.regra || ['FAIXA', 'CV', 'VAZAO', 'TAMANHO', 'SPLIT'].includes(ln.tipo) ? 'cond' : 'obrig';
    const base = (r, ln, extra) => { const d = txt(S, 'D' + r); const ins = d ? insPorProduto(d) : null; const unit = val(S, 'G' + r), tot = val(S, 'H' + r);
      return Object.assign({ k: 'r' + r, r, ln, rot: ln ? ln.rot : txt(S, 'B' + r), acion: ln ? (['DIESEL', 'ELETRICA', 'JOCKEY'].includes(ln.acion) ? ln.acion : 'TODOS') : 'TODOS', bloco: ln ? ln.bloco : '', desc: d, ins, fam: txt(S, 'C' + r) || (ins && ins.fam) || (ln && ln.fam) || '',
        qtd: val(S, 'F' + r), unit, tot, obs: txt(S, 'L' + r), cls: classe(ln), on: true, origem: ln ? origemTxt(ln, H2) : '', semCad: !!d && !ins, semPreco: !!d && !(typeof unit === 'number' && unit > 0),
        trocado: overridden(S, 'D' + r), qtdAlt: overridden(S, 'F' + r) }, extra || {}); };
    for (const x of montLines(S)) { const k = val(S, 'AE' + x.r); const ln = typeof k === 'number' ? byR.get(91 + k) : null; if (ln) usados.add(ln.r); out.push(base(x.r, ln, { tipo: 'est' })); }
    for (const x of hiddenLines(S)) { const ln = byR.get(91 + (x.r - 67)); if (ln) usados.add(ln.r); const ins = insPorProduto(x.desc);
      out.push({ k: 'h' + x.r, r: x.r, ln, tipo: 'hid', rot: x.rot, acion: x.acion, bloco: ln ? ln.bloco : '', desc: x.desc, ins, fam: x.fam, qtd: x.qtd, unit: x.unit, tot: x.tot, cls: classe(ln), on: true, origem: ln ? origemTxt(ln, H2) : '', semCad: !!x.desc && !ins, semPreco: !(x.unit > 0) }); }
    for (let r = 68; r <= 112; r++) if (txt(S, 'D' + r) || txt(S, 'C' + r) || txt(S, 'B' + r)) out.push(base(r, null, { k: 'm' + r, tipo: 'man', cls: 'man', rot: txt(S, 'B' + r) || 'Componente adicional', acion: 'ESC' }));
    // da estrutura e não entrou: opcional desmarcado (para marcar), incluído no kit do fornecedor, ou fora por regra
    const fora = [];
    for (const ln of lines) {
      if (!estrOf(ln).includes(est) || usados.has(ln.r)) continue; const ac = ['DIESEL', 'ELETRICA', 'JOCKEY'].includes(ln.acion) ? ln.acion : 'TODOS';
      if (!has[ac]) { fora.push({ ln, porque: 'o arranjo ' + (c.code || '—') + ' não tem ' + (ACIONS.find((a) => a[0] === ac) || [0, ac])[1].toLowerCase() }); continue; }
      if (ln.regra === 'OPCIONAL') { const row = 67 + (ln.r - 91); out.push({ k: 'o' + ln.r, ln, tipo: 'opc', row, rot: ln.rot, acion: ac, bloco: ln.bloco, desc: ['FIXO', 'SPLIT'].includes(ln.tipo) ? ln.campo : '', ins: ['FIXO', 'SPLIT'].includes(ln.tipo) ? insPorProduto(ln.campo) : null, qtd: null, unit: null, tot: 0, cls: 'opc', on: false, origem: origemTxt(ln, H2) }); continue; }
      if ((ln.regra === 'SEM KIT MOTOR' && kitM) || (ln.regra === 'SEM KIT BOMBA' && kitB)) { out.push({ k: 'k' + ln.r, ln, tipo: 'kit', rot: ln.rot, acion: ac, bloco: ln.bloco, desc: '', cls: 'forn', on: true, tot: 0, origem: origemTxt(ln, H2), porque: 'já vem no kit do ' + (ln.regra === 'SEM KIT MOTOR' ? 'motor (' + motorD + ')' : 'bomba (' + bomba + ')') }); continue; }
      fora.push({ ln, porque: ln.regra ? 'condição "' + regraTxt(ln.regra) + '" não atendida' : 'a origem não devolveu insumo (' + origemTxt(ln, H2) + ')' });
    }
    // marcados: os opcionais que entraram têm a caixa BC da linha
    for (const x of out) if (x.cls === 'opc' && x.tipo !== 'opc' && x.ln) x.row = 67 + (x.ln.r - 91);
    return { comps: out, fora, c, est, kitM, kitB };
  }
  const CLS_LB = { princ: ['Obrigatório', 'ok', 'escolhido na etapa Configurar'], obrig: ['Obrigatório', 'ok', 'sempre entra nesta estrutura'], cond: ['Condicional', 'warn', 'entra conforme as características'], opc: ['Opcional', 'mute', 'marcado no item'], forn: ['Incluído pelo fornecedor', 'mute', 'faz parte de um kit comprado pronto'], man: ['Adicionado na proposta', 'info', 'incluído à mão nesta proposta'] };
  // o que acionou a linha da estrutura: a característica do item e a faixa da tabela usada
  function cfgGatilho(S, ln) {
    if (!ln) return '';
    const n = (v) => (typeof v === 'number' ? v : parseFloat(String(v || '').replace(',', '.')));
    const hp = n(val(S, 'C19')) || n((txt(S, 'C20').match(/(\d+(?:[.,]\d+)?)\s*HP/i) || [])[1]); const cv = n(val(S, 'I19')); const vz = n(val(S, 'AR4'));
    const faixa = (r1, r2, x) => { for (let r = r1; r <= r2; r++) { const a = n(val(MO, 'B' + r)), b = n(val(MO, 'C' + r)); if (isFinite(a) && isFinite(b) && x >= a && x <= b) return [a, b, r]; } return null; };
    const H2 = heads(); const col = (k) => (H2[k] || [])[(+ln.campo || 1) - 1] || '';
    switch (ln.tipo) {
      case 'MOTOR': return ln.acion === 'ELETRICA' ? 'Motor elétrico escolhido: ' + (txt(S, 'H20') || txt(S, 'AR19') || '—') : 'Motor diesel escolhido: ' + (txt(S, 'C20') || txt(S, 'AR6') || '—');
      case 'BOMBA': return 'Bomba escolhida: ' + (txt(S, 'AR7') || txt(S, 'D19') || '—');
      case 'JOCKEY': return 'Bomba jockey escolhida: ' + (txt(S, 'AR8') || txt(S, 'J19') || '—');
      case 'FAIXA': case 'TAMANHO': { const f = isFinite(hp) ? faixa(157, 166, hp) : null; return isFinite(hp) ? 'Motor diesel de ' + fmtNum(hp) + ' HP' + (f ? ' → faixa de ' + fmtNum(f[0]) + ' a ' + fmtNum(f[1]) + ' HP' + (ln.tipo === 'TAMANHO' ? ' (porte ' + fmtPlain(val(MO, 'D' + f[2])) + ')' : ' · coluna "' + col('FAIXA') + '"') : ' (fora das faixas da tabela)') : 'Potência do motor diesel não informada'; }
      case 'CV': { const f = isFinite(cv) ? faixa(172, 187, cv) : null; return isFinite(cv) ? 'Motor elétrico de ' + fmtNum(cv) + ' CV' + (f ? ' → faixa de ' + fmtNum(f[0]) + ' a ' + fmtNum(f[1]) + ' CV · coluna "' + col('CV') + '"' : ' (fora das faixas)') : 'Potência do motor elétrico não informada'; }
      case 'VAZAO': return isFinite(vz) ? 'Vazão nominal de ' + fmtNum(vz) + ' USgpm → tabela hidráulica, coluna "' + col('VAZAO') + '"' : 'Vazão nominal não informada';
      case 'SPLIT': return 'Bomba split case' + (txt(S, 'AR7') ? ' (' + txt(S, 'AR7') + ')' : '');
      case 'FIXO': return 'Sempre o mesmo insumo nesta estrutura';
      default: return '';
    }
  }
  // última versão publicada da linha da estrutura (histórico do MONTADOR)
  function cfgVersao(ln) {
    if (!ln) return null; const re = new RegExp('^[A-Z]+' + ln.r + '$');
    const h = REG.historico.find((x) => x.ref === MO && (x.mudancas || []).some((m) => re.test(String(m.campo || ''))));
    return h ? { at: h.at, by: h.by, desc: h.desc } : null;
  }
  // conferência automática do item: impeditivo (bloqueia incluir), atenção e informativo, cada um com o lugar para corrigir
  function cfgValida(S, M) {
    M = M || cfgComps(S); const out = []; const add = (lvl, msg, go, extra) => { if (!out.some((x) => x.msg === msg)) out.push(Object.assign({ lvl, msg, go: go || { et: 3 }, bloq: lvl === 'imped' }, extra || {})); };
    const c = M.c;
    // item montado linha a linha (só componentes adicionais, sem acionamento): não pede bomba nem motor
    const linhaALinha = !c.code && M.comps.some((x) => x.tipo === 'man') && !M.comps.some((x) => x.tipo === 'est');
    if (linhaALinha) add('info', 'Item montado linha a linha (componentes adicionais), sem a estrutura da família: o preço vem dessas linhas.', { et: 2 });
    else if (!txt(S, 'C21')) add('imped', 'Escolha a família do equipamento.', { et: 1, campo: 'C21' });
    else if (!c.code) add('imped', 'Escolha o acionamento (diesel, elétrico, jockey) ou um modelo pronto.', { et: 1 });
    if (c.code && (c.d || c.e) && !txt(S, 'AR7') && !txt(S, 'D19')) add('imped', 'Escolha a bomba.', { et: 1, campo: 'D19' });
    if (c.d && !txt(S, 'C20') && !txt(S, 'AR6')) add('imped', 'Escolha o motor diesel (potência, rotação e arrefecimento).', { et: 1, campo: 'C19' });
    if (c.e && !txt(S, 'H20') && !txt(S, 'AR19')) add('imped', 'Escolha o motor elétrico (potência e tensão).', { et: 1, campo: 'I19' });
    // o que a planilha e as regras já apontam (alertas do item)
    const NV = { bad: 'imped', warn: 'aviso', info: 'info' };
    for (const a of alertsFor(S)) { const go = a.fix && a.fix.act === 'foco' ? { et: 1, campo: a.fix.data } : a.fix && a.fix.act === 'pedir' ? { et: 2 } : { et: 3 };
      // política comercial (margem, piso) não bloqueia incluir: segue para aprovação
      add(a.ack ? 'info' : NV[a.lvl] || 'info', a.msg, go, { bloq: a.lvl === 'bad' && !a.ack && !a.aprov && !/margem|piso|fator/i.test(a.msg), al: a }); }
    const vistos = new Map();
    for (const x of M.comps) {
      if (x.tipo === 'opc' || x.tipo === 'kit') continue; const go = { et: 2, sel: x.k };
      if (x.semCad) add('imped', (x.rot ? x.rot + ': ' : '') + '"' + x.desc + '" não está no cadastro.', go);
      else if (x.desc && x.semPreco) add('imped', (x.rot ? x.rot + ': ' : '') + x.desc + ' sem preço no cadastro (entra com custo zero).', go);
      if (x.ins && foraDeUso(x.ins)) add('aviso', x.desc + ' está ' + situ(x.ins) + ' no cadastro' + (x.ins.substituto ? ' (substituto: ' + x.ins.substituto + ')' : '') + '.', go);
      const d = x.ins ? precoData(x.desc) : null; if (d && (Date.now() - d.getTime()) / 864e5 > 180) add('aviso', 'Preço de ' + x.desc + ' atualizado há mais de 180 dias (' + d.toLocaleDateString('pt-BR') + ').', go);
      if (x.tipo === 'man') { const q = qtdNum(x.qtd); if (x.desc && !(q > 0)) add('imped', 'Quantidade inválida em ' + x.desc + '.', go); if (!x.desc) add('aviso', 'Linha adicional sem insumo escolhido.', go); }
      if (x.desc) { const k = x.desc; if (vistos.has(k) && (x.tipo === 'man' || vistos.get(k).tipo === 'man')) add('aviso', x.desc + ' aparece na estrutura e também como componente adicional: confira se não está em dobro.', go); else vistos.set(k, x); }
      if (x.trocado) add('info', (x.rot || 'Componente') + ': insumo trocado nesta proposta (' + x.desc + ').', go);
      if (x.qtdAlt) add('info', (x.rot || 'Componente') + ': quantidade alterada nesta proposta (' + fmtNum(x.qtd) + ').', go);
    }
    // composição registrada ao incluir na proposta x composição atual (a estrutura mestre ou as escolhas mudaram depois)
    const cf = cfgDe(S); if (cf.snap && cf.snap.sig !== cfgSig(S, M)) { const env = ['enviada', 'aprovada', 'ganha'].includes(String(state.status || '')); const dif = cfgDifSnap(S, M);
      add(env ? 'aviso' : 'info', (env ? 'A proposta já foi enviada e a ' : 'A ') + 'composição mudou desde que o equipamento foi incluído (' + fmtAt(cf.snap.at) + ')' + (dif.length ? ': ' + dif.slice(0, 3).join('; ') + (dif.length > 3 ? '…' : '') : '') + '.', { et: 3 }, { snap: true }); }
    const ord = { imped: 0, aviso: 1, info: 2 }; return out.sort((a, b) => ord[a.lvl] - ord[b.lvl]);
  }
  // assinatura da configuração (escolhas + componentes e quantidades): muda quando algo relevante muda
  function cfgSig(S, M) { M = M || cfgComps(S); return JSON.stringify([CFG_PARAMS.map((a) => fmtPlain(val(S, a))), M.comps.filter((x) => x.tipo !== 'opc' && x.tipo !== 'kit').map((x) => [x.desc, fmtPlain(x.qtd)]).sort()]); }
  function cfgSnapDe(S, M) { M = M || cfgComps(S); return { at: new Date().toISOString(), by: REG.me || null, sig: cfgSig(S, M), params: Object.fromEntries(CFG_PARAMS.map((a) => [a, fmtPlain(val(S, a))])),
    comps: M.comps.filter((x) => x.tipo === 'est' || x.tipo === 'man' || x.tipo === 'hid').map((x) => ({ k: x.k, r: x.r, tipo: x.tipo, rot: x.rot, desc: x.desc, fam: x.fam, qtd: x.qtd, unit: x.unit, tot: x.tot })), custo: val(S, 'H114'), preco: val(S, 'B15'), total: val(S, 'D15'), margem: val(S, 'J15'), desc: txt(S, 'C28') }; }
  function cfgDifSnap(S, M) {
    const sn = cfgDe(S).snap; if (!sn) return []; M = M || cfgComps(S); const cur = new Map(); for (const x of M.comps) if (x.desc && x.tipo !== 'opc' && x.tipo !== 'kit') cur.set(x.desc, (cur.get(x.desc) || 0) + qtdNum(x.qtd));
    const ant = new Map(); for (const x of sn.comps || []) if (x.desc) ant.set(x.desc, (ant.get(x.desc) || 0) + qtdNum(x.qtd)); const L = [];
    for (const [d, q] of cur) if (!ant.has(d)) L.push('entrou ' + d); else if (Math.abs(ant.get(d) - q) > 1e-9) L.push(d + ': ' + fmtNum(ant.get(d)) + ' → ' + fmtNum(q));
    for (const d of ant.keys()) if (!cur.has(d)) L.push('saiu ' + d);
    for (const a of CFG_PARAMS) if ((sn.params || {})[a] !== undefined && sn.params[a] !== fmtPlain(val(S, a))) L.push(a + ': ' + (sn.params[a] || '—') + ' → ' + (fmtPlain(val(S, a)) || '—'));
    return L;
  }
  // volta a composição do item à registrada na inclusão (proposta enviada): fixa insumo e quantidade das linhas da estrutura
  // (passam a valer como alteração da proposta) e põe de volta como adicional o que a estrutura nova tirou
  function cfgFixar(S) {
    const sn = cfgDe(S).snap; if (!sn) return; const M = cfgComps(S); const ch = {}; const porR = new Map(M.comps.filter((x) => x.tipo === 'est').map((x) => [x.r, x]));
    const snEst = (sn.comps || []).filter((x) => x.tipo === 'est'); const snR = new Set(snEst.map((x) => x.r));
    for (const x of snEst) { const cur = porR.get(x.r); if (!cur) continue; if (cur.desc !== x.desc) ch['D' + x.r] = x.desc; if (fmtPlain(cur.qtd) !== fmtPlain(x.qtd)) ch['F' + x.r] = x.qtd; }
    for (const x of porR.values()) if (!snR.has(x.r)) ch['F' + x.r] = 0;
    const faltam = snEst.filter((x) => !porR.has(x.r)); let r = 68;
    for (const x of faltam) { while (r <= 112 && (txt(S, 'D' + r) || txt(S, 'C' + r) || txt(S, 'B' + r) || ch['D' + r])) r++; if (r > 112) break; ch['C' + r] = x.fam || ''; ch['D' + r] = x.desc; ch['F' + r] = x.qtd; ch['B' + r] = x.rot || ''; r++; }
    if (!Object.keys(ch).length) { toast('A composição já é a registrada'); return; }
    cfgSet(S, ch); logEv({ tipo: 'Configuração fixada', ref: docTitle(), desc: S + ': composição voltou à registrada em ' + fmtAt(sn.at), mudancas: Object.entries(ch).map(([campo, para]) => ({ campo: S + '!' + campo, de: null, para })) });
    toast('Composição fixada como registrada em ' + fmtAt(sn.at));
  }
  // ---------- tela ----------
  function vConfig() {
    const S = ITEMS[ui.item]; const et = cfgEtapa(S); const M = cfgComps(S); const V = cfgValida(S, M);
    const prob = { 1: V.some((x) => x.go.et === 1 && x.lvl === 'imped'), 2: V.some((x) => x.go.et === 2 && x.lvl === 'imped'), 3: V.some((x) => x.lvl === 'imped' && x.bloq) };
    const feito = { 1: !!M.c.code && !V.some((x) => x.go.et === 1 && x.lvl === 'imped'), 2: filled(S), 3: !!cfgDe(S).incl && cfgDe(S).incl.sig === cfgSig(S, M) };
    const equip = txt(S, 'C28') || (txt(S, 'C21') ? famLabel(String(val(S, 'AR2') || 'CMB')) : 'equipamento não escolhido');
    const salvo = dirty ? '<span class="pill warn">alterações não salvas</span>' : state.id ? '<span class="pill ok">salvo</span>' : '<span class="pill mute">proposta ainda não salva</span>';
    const passos = CFG_ETAPAS.map(([n, lb, ic]) => `<li><button type="button" class="cfgstep${n === et ? ' on' : ''}${feito[n] ? ' done' : ''}${prob[n] ? ' prob' : ''}" data-cfget="${n}"${n === et ? ' aria-current="step"' : ''} data-ico="${prob[n] ? 'triangle-alert' : feito[n] && n !== et ? 'circle-check' : ic}"><span>${n}. ${lb}</span></button></li>`).join('');
    const corpo = et === 1 ? cfgEt1(S, M) : et === 2 ? cfgEt2(S, M) : cfgEt3(S, M, V);
    const nav = `<div class="flowbar cfgnav">${et > 1 ? `<button class="btn" data-cfget="${et - 1}" data-ico="arrow-left">Voltar</button>` : `<button class="btn" data-step="2" data-ico="arrow-left">Itens da proposta</button>`}
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-savebtn data-ico="save">Salvar rascunho</button>${et < 3 ? `<button class="btn pri" data-cfget="${et + 1}" data-ico="arrow-right">Continuar</button>` : ''}</span></div>`;
    return `<div class="stack cfg">
      <div class="cfghead"><div style="min-width:0"><small class="sub">Proposta ${esc(txt('PROPOSTA', 'C5') || 'sem número')} · ${esc(txt('PROPOSTA', 'F5') || 'cliente não informado')} · ${S}</small><h1 style="margin:2px 0 0">${esc(equip)}</h1></div>
        <div class="sumbar"><div><span>Custo</span><b>${brl(val(S, 'H114'))}</b></div><div><span>Unitário c/ IPI</span><b>${brl(val(S, 'B15'))}</b></div><div><span>Margem</span><b class="${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</b></div><div>${salvo}</div></div></div>
      <nav aria-label="Etapas do configurador"><ol class="cfgsteps">${passos}</ol></nav>
      ${corpo}
      ${nav}
      <p class="sub" style="text-align:right;margin:0">Prefere a tela anterior do item? <button class="restore" data-cfgclassico>abrir a tela clássica</button> · <button class="restore" data-itemfull>visão completa da planilha</button></p>
      ${datalists()}
    </div>`;
  }
  // ---- etapa 1: família, ponto de partida (modelo pronto, configuração salva ou características) e escopo ----
  function cfgEt1(S, M) {
    const c = M.c; const fam = txt(S, 'C21'); const key = String(val(S, 'AR2') || 'CMB'); const cf = cfgDe(S);
    const fams = famsEquip().filter((f) => f[2] !== 'FABRICANTES');
    const famCards = fams.map(([k, lb, nome]) => { const reg = estrList().includes(k); const n = modelos().filter((m) => m.estr === k).length; const on = fam === nome || (!fam && false);
      return `<button type="button" class="famcard${on ? ' on' : ''}${reg ? '' : ' off'}" data-fam="${esc(nome)}" aria-pressed="${on}"><b>${esc(FAM_SEQ_LB[nome] || lb)}</b><small>${reg ? (n ? n + ' modelo(s) pronto(s)' : 'estrutura cadastrada, sem modelos') : 'sem estrutura cadastrada'}</small></button>`; }).join('');
    if (!famChosen(S, c)) return `<section class="card"><h2>1. Família do equipamento</h2><div class="famgrid">${famCards}<button type="button" class="famcard" data-factsnew><b>FAC · FACTS — teste automático de bombas</b><small>configurador MECON (formação própria)</small></button></div><p class="sub" style="margin:10px 0 0">A família define a estrutura padrão, os modelos prontos e as listas de bomba e motor que o app mostra.</p></section>${cfgSalvasHtml(S)}`;
    const modo = ui.cfgModo && ui.cfgModo[S] ? ui.cfgModo[S] : txt(S, 'C17') || modelos().some((m) => m.estr === key) ? 'modelo' : 'carac';
    const segModo = `<div class="seg" role="radiogroup" aria-label="Ponto de partida"><label class="${modo === 'modelo' ? 'on' : ''}"><input type="radio" name="cfgModo_${S.replace(/\W/g, '')}" data-cfgmodo="modelo"${modo === 'modelo' ? ' checked' : ''}>Modelo pronto</label><label class="${modo === 'carac' ? 'on' : ''}"><input type="radio" name="cfgModo_${S.replace(/\W/g, '')}" data-cfgmodo="carac"${modo === 'carac' ? ' checked' : ''}>Montar por características</label></div>`;
    const blocoModo = modo === 'modelo' ? cfgModelos(S, key) : cfgCarac(S, c);
    const especial = cf.especial === true;
    return `<div class="cfggrid"><div class="stack">
      <section class="card"><h2>1. Família <span class="sub">${esc(FAM_SEQ_LB[fam] || famLabel(key))} · <button class="restore" data-famreset>trocar a família</button></span></h2>
        ${!estrList().includes(key) ? `<div class="banner warn" style="margin:0">Ainda não há estrutura cadastrada para ${esc(famLabel(key))}: o item monta só com os componentes comuns. <button class="restore" data-goestr="${key}">Cadastrar a estrutura</button></div>` : ''}
        <div class="fields"><div class="f span2"><label>Ponto de partida</label>${segModo}</div>${field(S, 'C6', 'Quantidade', { step: 1, ph: '1' })}</div></section>
      ${blocoModo}
      ${cfgCaracTab(S, c)}
      <section class="card"><h2>Escopo da configuração</h2>
        <div class="seg" role="radiogroup" aria-label="Escopo"><label class="${especial ? '' : 'on'}"><input type="radio" name="cfgEsp_${S.replace(/\W/g, '')}" data-cfgesp="0"${especial ? '' : ' checked'}>Padrão da estrutura</label><label class="${especial ? 'on' : ''}"><input type="radio" name="cfgEsp_${S.replace(/\W/g, '')}" data-cfgesp="1"${especial ? ' checked' : ''}>Configuração especial</label></div>
        <p class="sub" style="margin:8px 0 0">${especial ? 'Especial: na etapa Compor dá para trocar o insumo e a quantidade de qualquer componente da estrutura e acrescentar componentes de qualquer família. Tudo fica marcado como alteração desta proposta; a estrutura mestre não muda.' : 'Padrão: a estrutura da família decide os componentes e as quantidades; você marca os opcionais e acrescenta o que faltar.'} A estrutura tem kits de fornecedor (motor e bomba que já vêm com painel, base ou manômetros) e tabelas por porte, aplicados sozinhos.</p></section>
    </div>${cfgPrevia(S, M)}</div>`;
  }
  function cfgSalvasHtml(S) {
    ensureModelos(); if (!modelosItem.length) return '';
    return `<section class="card"><h2>Ou parta de uma configuração salva <span class="sub">modelos de item da equipe</span></h2><div class="mlist">${modelosItem.slice(0, 12).map((x) => `<div class="mcard"><div style="min-width:0"><b>${esc(x.nome)}</b><small class="sub">${esc(x.desc || '')}</small></div><button class="btn sm" data-cfgsalva="${esc(x.id)}" data-ico="copy">Usar neste item</button></div>`).join('')}</div></section>`;
  }
  function cfgModelos(S, key) {
    const q = String((ui.cfgQ || {})[S] || '').toUpperCase(); const ac = (ui.cfgAc || {})[S] || '';
    const L = modelos().filter((m) => m.estr === key).filter((m) => !ac || m.ac === ac).filter((m) => !q || [m.nome, m.bomba, m.motor, m.code, m.jockey].join(' ').toUpperCase().includes(q));
    const sel = txt(S, 'C17'); const mm = modelMatch(S);
    const chip = (k, lb) => `<label class="chip"><input type="radio" name="cfgAc_${S.replace(/\W/g, '')}" data-cfgac="${k}"${ac === k ? ' checked' : ''}> ${lb}</label>`;
    const card = (x) => `<div class="mcard${x.nome === sel ? ' on' : ''}"><div style="min-width:0"><b>${esc(x.nome)}</b><small class="sub">${esc([x.code, typeof x.vazao === 'number' ? fmtNum(x.vazao) + ' USgpm' : null, typeof x.pressao === 'number' ? fmtNum(x.pressao) + ' mca' : null, x.bomba, x.motor].filter(Boolean).join(' · '))}</small></div>${x.nome === sel ? '<span class="pill ok">em uso</span>' : mm.exact.includes(x) ? '<span class="pill ok">bate com a configuração</span>' : ''}${x.nome === sel ? '' : `<button class="btn sm" data-usemodel="${esc(x.nome)}">Usar este</button>`}</div>`;
    return `<section class="card"><h2>2. Modelo pronto <span class="sub">${modelos().filter((m) => m.estr === key).length} cadastrado(s) para ${esc(famLabel(key))}</span></h2>
      <div class="fields"><div class="f span2"><label for="cfgQ_${S.replace(/\W/g, '')}">Pesquisar (nome, bomba, motor, arranjo)</label><input id="cfgQ_${S.replace(/\W/g, '')}" type="search" data-cfgq value="${esc((ui.cfgQ || {})[S] || '')}" placeholder="ex.: 1500, SCE 250, 6M16"></div>
        <div class="f span2"><label>Acionamento</label><div style="display:flex;gap:6px;flex-wrap:wrap">${chip('', 'Todos')}${chip('DIESEL', 'Diesel')}${chip('ELETRICA', 'Elétrico')}</div></div></div>
      <div class="mlist cfgmods">${L.slice(0, 40).map(card).join('') || '<p class="sub">Nenhum modelo com esse filtro.</p>'}</div>${L.length > 40 ? `<p class="sub">Mostrando 40 de ${L.length}: refine a pesquisa.</p>` : ''}
      ${sel ? `<p class="sub" style="margin:8px 0 0">Modelo em uso: <b>${esc(sel)}</b>. As características vêm dele; para mudar uma, use "alterar" abaixo (fica marcado como alteração).</p>` : ''}</section>`;
  }
  // fabricante e modelo da bomba: lista da planilha (cadastro e kits) filtrada pelo fabricante do cadastro
  const fabDe = (p) => { const i = insPorProduto(p); if (i && i.fab) return String(i.fab).toUpperCase(); const k = (REG.kitBomba || []).find((x) => x.desc === p) || (REG.kitMotor || []).find((x) => x.desc === p); return k && k.marca ? String(k.marca).toUpperCase() : ''; };
  function cfgSelFab(S, a, label) {
    const L = listFor(S, a) || []; const fabs = [...new Set(L.map(fabDe).filter(Boolean))].sort(); const fk = S + '|' + a; const fs0 = (ui.cfgFab || {})[fk] || (txt(S, a) ? fabDe(txt(S, a)) : '');
    const lista = fs0 ? L.filter((p) => fabDe(p) === fs0) : L;
    return `${fabs.length > 1 ? `<div class="f"><label for="cfgFab_${a}">Fabricante</label><select id="cfgFab_${a}" data-cfgfab="${esc(fk)}"><option value="">todos (${L.length})</option>${fabs.map((f) => `<option${f === fs0 ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>` : ''}${field(S, a, label + (fs0 ? ' · ' + fs0 : ''), { cls: 'span2', list: lista })}`;
  }
  function cfgCarac(S, c) {
    const f = (a, lb, o) => field(S, a, lb, o); const fs = (a, lb, o) => fieldS(S, a, lb, o);
    const cmb = isCMB(S); const cmbOne = c.d + c.e + (c.j ? 1 : 0) === 1;
    const chip = (k, lb, on) => `<label class="chip"><input type="radio" name="cmbAc" data-cmb="${k}"${on ? ' checked' : ''}> ${lb}</label>`;
    const step = (k, lb, n) => `<div class="stp"><span>${lb}</span><button type="button" class="btn sm" data-arr="${k}-" aria-label="Menos ${lb}"${n ? '' : ' disabled'}>−</button><b>${n}</b><button type="button" class="btn sm" data-arr="${k}+" aria-label="Mais ${lb}"${c.d + c.e >= 4 ? ' disabled' : ''}>+</button></div>`;
    const arr = cmb ? `${chip('D', 'Diesel', cmbOne && c.d === 1)}${chip('E', 'Elétrico', cmbOne && c.e === 1)}${chip('J', 'Só jockey', cmbOne && c.j)}` : `${step('D', 'Diesel', c.d)}${step('E', 'Elétrica', c.e)}<label class="chk"><input type="checkbox" data-arrj${c.j ? ' checked' : ''}> Bomba jockey</label>`;
    const sets = [];
    if (c.d) sets.push(`<div class="set"><h3>Conjunto diesel${c.d > 1 ? ' × ' + c.d : ''}</h3><div class="fields">${cfgSelFab(S, 'D19', 'Bomba')}${f('C19', 'Potência (HP)')}${f('H19', 'Rotação (RPM)')}${f('F19', 'Arrefecimento')}${field(S, 'C20', 'Motor (da tabela)', { ro: true, cls: 'span2' })}</div></div>`);
    if (c.e) sets.push(`<div class="set"><h3>Conjunto elétrico${c.e > 1 ? ' × ' + c.e : ''}</h3><div class="fields">${c.d ? f('BA19', 'Bomba (em branco = a do diesel)', { cls: 'span2' }) : cfgSelFab(S, 'D19', 'Bomba') + f('H19', 'Rotação (RPM)')}${f('I19', 'Potência (CV)')}${f('L19', 'Tensão do painel')}${field(S, 'H20', 'Motor (da tabela)', { ro: true, cls: 'span2' })}</div></div>`);
    if (c.j) sets.push(`<div class="set"><h3>Bomba jockey</h3><div class="fields">${cfgSelFab(S, 'J19', 'Bomba jockey')}</div></div>`);
    return `<section class="card"><h2>2. Características <span class="sub">listas do cadastro; o motor sai da tabela pela potência</span></h2>
      <div class="arrbox"><span class="stp"><span>Acionamento</span></span>${arr}<span class="arrcode">Arranjo <b class="code">${esc(c.code || '—')}</b></span></div>
      <div class="fields">${fs('G17', 'Vazão (USgpm)')}${fs('H17', 'Pressão (mca)')}${fs('I17', 'Norma')}</div>
      ${sets.join('')}</section>`;
  }
  // de onde veio cada valor: do modelo pronto, calculado, informado, alterado na proposta ou pendente
  function cfgOrigem(S, a, tem) {
    if (!tem) return ['pendente', 'warn'];
    // escolha feita aqui (família, modelo, acionamento, características) x valor do modelo pronto mudado à mão
    if (overridden(S, a)) return txt(S, 'C17') && !['C21', 'C17', 'C6'].includes(a) ? ['alterado do modelo pronto', 'warn'] : ['escolhido nesta proposta', 'ok'];
    const digitado = !!(state.doc && state.doc[S] && state.doc[S][a] !== undefined);
    if (isFormulaBase(S, a) || (!digitado && txt(S, 'C17'))) return [txt(S, 'C17') ? 'do modelo pronto' : 'calculado pela planilha', 'mute'];
    return [digitado ? 'informado' : 'padrão', 'mute'];
  }
  function cfgCaracTab(S, c) {
    const L = [['C21', 'Família', txt(S, 'C21')], ['C17', 'Modelo pronto', txt(S, 'C17')], ['E17', 'Arranjo', c.code], ['G17', 'Vazão nominal', val(S, 'AR4') ? fmtNum(val(S, 'AR4')) + ' USgpm' : ''], ['H17', 'Pressão', num0(val(S, 'H17')) > 0 ? show(S, 'H17') + ' mca' : ''], ['I17', 'Norma', txt(S, 'I17')]];
    if (c.d || c.e) L.push(['D19', 'Bomba', txt(S, 'AR7') || txt(S, 'D19')]);
    if (c.d) { const md = upNoAc(txt(S, 'C20') || txt(S, 'AR6')); const rpmM = (md.match(/(\d{4})\s*RPM/) || [])[1]; const arrM = /TROCADOR/.test(md) ? 'TROCADOR DE CALOR' : /RADIADOR/.test(md) ? 'RADIADOR' : '';
      // com o motor já escolhido (modelo pronto), rotação e arrefecimento são os do motor: não ficam "pendentes"
      L.push(['C19', 'Motor diesel', txt(S, 'C20') || txt(S, 'AR6')], show(S, 'H19') ? ['H19', 'Rotação', show(S, 'H19') + ' rpm'] : ['H19', 'Rotação', rpmM ? fmtNum(+rpmM) + ' rpm' : '', rpmM ? 'do motor escolhido' : ''], txt(S, 'F19') ? ['F19', 'Arrefecimento', txt(S, 'F19')] : ['F19', 'Arrefecimento', arrM, arrM ? 'do motor escolhido' : '']); }
    if (c.e) L.push(['I19', 'Motor elétrico', txt(S, 'H20') || txt(S, 'AR19')], ['L19', 'Tensão do painel', txt(S, 'L19')]);
    if (c.j) L.push(['J19', 'Bomba jockey', txt(S, 'AR8') || txt(S, 'J19')]);
    const pts = []; for (let b = 23; b <= 26; b++) { const vz = val(S, 'K' + b), pr = val(S, 'L' + b); if (txt(S, 'C' + b) && typeof vz === 'number' && vz > 0) pts.push(txt(S, 'C' + b).toLowerCase() + ' ' + fmtNum(vz) + ' m³/h × ' + fmtNum(pr) + ' mca'); }
    const bomba = insPorProduto(txt(S, 'AR7') || txt(S, 'D19')); const ce = certLinha(bomba && bomba.cert, 'pt');
    const rows = L.map(([a, lb, v, orig]) => { const [o, cl] = orig ? [orig, 'mute'] : cfgOrigem(S, a, !!v); return `<tr><td>${esc(lb)}</td><td><b>${esc(v || '—')}</b></td><td><span class="pill ${cl}" title="Origem do valor">${esc(o)}</span>${overridden(S, a) ? ` <button class="restore" data-restore="${esc(S)}|${a}">↺ automático</button>` : ''}</td></tr>`; }).join('');
    return `<section class="card"><h2>Características do equipamento <span class="sub">o que o app já sabe e de onde veio</span></h2><div class="tw"><table class="t"><tbody>${rows}
      ${pts.length ? `<tr><td>Ponto(s) de trabalho</td><td><b>${esc(pts.join(' · '))}</b></td><td><span class="pill mute">calculado pela planilha</span></td></tr>` : ''}
      <tr><td>Certificação da bomba</td><td><b>${esc(ce || 'não listada')}</b></td><td><span class="pill mute">do cadastro</span></td></tr></tbody></table></div></section>`;
  }
  function cfgPrevia(S, M) {
    const n = M.comps.filter((x) => x.tipo !== 'opc' && x.tipo !== 'kit').length;
    return `<aside class="card side cfgprev" aria-label="Prévia da configuração"><h2>Prévia</h2>
      <div class="codebox" style="margin:0 0 8px">${esc(txt(S, 'C27') || 'o código sai aqui')}</div>
      <p class="txtv" style="margin:0 0 8px">${esc(txt(S, 'C28')) || '—'}</p>
      <div class="kv"><div>Componentes</div><div>${n}</div><div>Custo</div><div>${brl(val(S, 'H114'))}</div><div>Unitário c/ IPI</div><div>${brl(val(S, 'B15'))}</div><div>Margem</div><div>${pct(val(S, 'J15'))}</div></div></aside>`;
  }
  // ---- etapa 2: composição pela estrutura, opcionais, quantidades, adicionais e painel do componente ----
  function cfgEt2(S, M) {
    const especial = cfgDe(S).especial === true; const sel = ui.cfgSel && ui.cfgSel.S === S ? M.comps.find((x) => x.k === ui.cfgSel.k) : null;
    const grupos = ACIONS.map(([k, lb]) => [k, lb]).concat([['ESC', 'Adicionados nesta proposta']]);
    const gl = { DIESEL: 'Conjunto diesel', ELETRICA: 'Conjunto elétrico', JOCKEY: 'Bomba jockey', TODOS: ['SKID', 'CONTAINER'].includes(M.est) ? 'Equipamentos e acessórios gerais' : 'Comuns ao equipamento', ESC: 'Adicionados nesta proposta' };
    const tot = num0(val(S, 'H114'));
    const linha = (x) => {
      const [clb, cpl] = CLS_LB[x.cls] || CLS_LB.obrig; const off = x.tipo === 'opc'; const ctl = x.cls === 'opc' && x.row ? `<input type="checkbox" data-opt="${x.row}"${val(S, 'BC' + x.row) === 1 || (!off && x.tipo !== 'opc') ? ' checked' : ''} aria-label="Incluir ${esc(x.rot)}">` : x.tipo === 'man' ? '' : `<span class="cfglock" data-ico="lock" title="${esc(clb + ': ' + (CLS_LB[x.cls] || [])[2])}"></span>`;
      const qtd = x.tipo === 'man' ? cfgQtdCtl(S, x.r, x.qtd) : x.tipo === 'est' && especial ? cfgQtdCtl(S, x.r, x.qtd, true) : `<span title="Quantidade da estrutura">${x.qtd === null || x.qtd === undefined ? '—' : fmtNum(x.qtd)}</span>${x.qtdAlt ? ` <button class="restore" data-restore="${esc(S)}|F${x.r}" title="Voltar à quantidade da estrutura">↺</button>` : ''}`;
      const tag = `<span class="pill ${cpl}">${clb}</span>${x.trocado ? ' <span class="pill warn">insumo trocado</span>' : ''}${x.qtdAlt ? ' <span class="pill warn">qtd alterada</span>' : ''}${x.semCad ? ' <span class="pill bad">sem cadastro</span>' : x.semPreco && x.desc ? ' <span class="pill bad">sem preço</span>' : ''}${x.ins && foraDeUso(x.ins) ? ' <span class="pill bad">' + esc(situ(x.ins)) + '</span>' : ''}`;
      // adicionados: o insumo é o nome; da estrutura: o componente é o nome e o insumo vem embaixo
      const nome = x.tipo === 'man' ? (x.desc || 'Componente adicional') : (x.rot || '—'); const sub = x.tipo === 'man' ? famNome(x.fam || '') : (x.desc || (x.tipo === 'kit' ? x.porque : x.tipo === 'opc' ? 'não incluído' : '—'));
      return `<tr class="${off ? 'cfgoff' : ''}${sel && sel.k === x.k ? ' cfgsel' : ''}" id="cfgc_${x.k}"><td class="cfgchk">${ctl}</td><td><b>${esc(nome)}</b><br><small class="sub">${esc(sub)}</small><div class="cfgtags">${tag}</div></td><td class="n">${qtd}</td><td class="n">${typeof x.unit === 'number' ? brl(x.unit) : '—'}</td><td class="n">${off ? '—' : brl(x.tot)}</td><td><span class="cfgacts"><button class="btn sm cfgwhy" data-cfgsel="${esc(x.k)}" data-ico="circle-help" title="Por que entrou e detalhes" aria-label="Por que ${esc(nome)} foi selecionado e detalhes">Por quê?</button>${cadBtn(x)}</span></td></tr>`; };
    // só o administrador corrige o cadastro daqui (a gravação do insumo continua sujeita às regras de acesso do cadastro)
    const cadBtn = (x) => !REG.ehAdmin() || !x.desc || x.tipo === 'opc' || x.tipo === 'kit' ? '' : `<button class="btn sm cfgcad" data-cfgcad="${esc(x.k)}" data-ico="${x.semCad ? 'plus' : 'pencil'}" title="${x.semCad ? 'Cadastrar este insumo (administrador)' : 'Corrigir o cadastro deste insumo (administrador)'}" aria-label="${x.semCad ? 'Cadastrar ' : 'Corrigir o cadastro de '}${esc(x.desc)}">${x.semCad ? 'Cadastrar' : 'Corrigir cadastro'}</button>`;
    const corpo = grupos.map(([k]) => { const L = M.comps.filter((x) => x.acion === k); if (!L.length) return ''; const gt = L.reduce((t, x) => t + (x.tipo === 'opc' ? 0 : num0(x.tot)), 0); const opcs = L.filter((x) => x.cls === 'opc' && x.row);
      return `<tr class="grp"><td colspan="4">${esc(gl[k])}${opcs.length > 1 ? ` <button class="restore" data-cfgopcall="${opcs.map((x) => x.row).join(',')}">marcar todos os opcionais</button>` : ''}</td><td class="n">${brl(gt)}${tot ? ' <small class="sub">' + pct(gt / tot, 0) + '</small>' : ''}</td><td></td></tr>${L.map(linha).join('')}`; }).join('');
    const fora = M.fora.length ? `<details class="card"${keep('cfgfora')}><summary>Componentes da estrutura que não entraram <span class="sub">${M.fora.length}</span></summary><ul class="uso">${M.fora.map((n) => `<li><b>${esc(n.ln.rot)}</b> — ${esc(n.porque)}</li>`).join('')}</ul></details>` : '';
    return `<div class="cfggrid"><div class="stack">
      <section class="card"><h2>Composição <span class="sub">montada pela estrutura ${esc(famLabel(M.est))}${txt(S, 'C17') ? ' e pelo modelo ' + esc(txt(S, 'C17')) : ''}${especial ? ' · <span class="pill warn">configuração especial</span>' : ''}</span></h2>
        <div class="cfglegenda">${Object.values(CLS_LB).map(([lb, cl, d]) => `<span><span class="pill ${cl}">${esc(lb)}</span> <small class="sub">${esc(d)}</small></span>`).join('')}</div>
        ${M.comps.length ? `<div class="tw"><table class="t comp cfgcomp"><thead><tr><th><span class="sr">Incluir</span></th><th>Componente</th><th>Qtd</th><th>Unit.</th><th>Total</th><th><span class="sr">Detalhes</span></th></tr></thead><tbody>${corpo}<tr class="tot"><td colspan="4">Custo do item</td><td class="n">${brl(val(S, 'H114'))}</td><td></td></tr></tbody></table></div>` : '<div class="banner info" style="margin:0">Os componentes aparecem quando o equipamento estiver escolhido na etapa Configurar.</div>'}
        <div class="docbar" style="margin-top:10px"><button class="btn sm" data-cfgadd data-ico="plus">Adicionar componente</button>${M.comps.some((x) => x.trocado || x.qtdAlt) || Object.keys((state.doc || {})[S] || {}).some((a) => /^BC\d+$/.test(a)) ? '<button class="btn sm" data-cfgpadrao data-ico="rotate-ccw">Restaurar padrão</button>' : ''}</div></section>
      ${ui.cfgAdd === S ? cfgAddHtml(S, especial) : ''}
      ${fora}
    </div>${cfgPainel(S, M, sel, especial)}</div>`;
  }
  function cfgQtdCtl(S, r, q, est) {
    const v = qtdNum(q); return `<span class="cfgqtd"><button type="button" class="btn sm" data-cfgq1="${r}|-1" aria-label="Diminuir a quantidade"${v <= 0 ? ' disabled' : ''} data-ico="minus"></button><input inputmode="decimal" data-cfgqtd="${r}" value="${esc(fmtPlain(q))}" aria-label="Quantidade" size="4"><button type="button" class="btn sm" data-cfgq1="${r}|1" aria-label="Aumentar a quantidade" data-ico="plus"></button>${est && overridden(S, 'F' + r) ? ` <button class="restore" data-restore="${esc(S)}|F${r}" title="Voltar à quantidade da estrutura">↺</button>` : ''}</span>`;
  }
  function cfgAddHtml(S, especial) {
    const q = String(ui.cfgAddQ || '').toUpperCase(); const L = q.length >= 2 ? REG.insumos.filter((i) => !foraDeUso(i) && [i.id, i.produto, i.fab, i.codFab, i.fam].join(' ').toUpperCase().includes(q)).slice(0, 30) : [];
    return `<section class="card" id="cfgAddBox"><h2>Adicionar componente <span class="sub">do cadastro de insumos; não muda a estrutura mestre</span></h2>
      <div class="fields"><div class="f spanall"><label for="cfgAddQ">Pesquisar por código, descrição, fabricante ou família</label><input id="cfgAddQ" type="search" data-cfgaddq value="${esc(ui.cfgAddQ || '')}" placeholder="ex.: válvula, 23-, BERMAD" autocomplete="off"></div></div>
      ${q.length >= 2 ? (L.length ? `<div class="tw"><table class="t"><tbody>${L.map((i) => `<tr><td><b>${esc(i.produto)}</b><br><small class="sub">${esc(i.id)} · ${esc(famNome(i.fam))}${i.fab ? ' · ' + esc(i.fab) : ''}</small></td><td class="n">${typeof i.valor === 'number' ? brl(i.valor) : '<span class="pill warn">sem preço</span>'}</td><td><button class="btn sm" data-cfgaddins="${esc(i.id)}" data-ico="plus">Adicionar</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="banner warn" style="margin:0">Nada encontrado no cadastro com "${esc(ui.cfgAddQ)}". <button class="restore" data-pedir="${esc(JSON.stringify({ produto: ui.cfgAddQ, linha: { rotulo: S + ' · componente adicional' } }))}">pedir cadastro</button>${REG.areaOk('cadastro') || REG.areaOk('custos') ? ' · <button class="restore" data-cfgnovoins>cadastrar agora</button>' : ''}</div>`) : '<p class="sub" style="margin:0">Digite ao menos 2 letras.</p>'}
      <div class="docbar" style="margin-top:8px"><button class="btn sm" data-cfgaddfim>Fechar</button></div></section>`;
  }
  // painel do componente: por que entrou (dados reais da estrutura), cadastro, preço e ações
  function cfgPainel(S, M, x, especial) {
    if (!x) return `<aside class="card side cfgpainel" aria-live="polite"><h2>Detalhes</h2><p class="sub" style="margin:0">Clique em "Por quê?" num componente para ver de onde ele veio, o cadastro, o preço e as alternativas.</p></aside>`;
    const ln = x.ln; const i = x.ins; const v = cfgVersao(ln); const H2 = heads(); void H2;
    const motivo = x.tipo === 'man' ? 'Incluído à mão nesta proposta.' : x.tipo === 'kit' ? 'Não entra separado: ' + x.porque + '.' : x.tipo === 'opc' ? 'Opcional da estrutura, desmarcado: marque para incluir.' : '';
    const alts = i ? [].concat(i.substituto ? [i.substituto] : [], (i.equiv || []).map((e) => (typeof e === 'string' ? e : e.id || e.produto || '')).filter(Boolean)) : [];
    const lista = x.fam && (x.tipo === 'man' || (x.tipo === 'est' && especial)) ? famProdutos(x.fam) : [];
    const kv = (k, vv) => (vv === undefined || vv === null || vv === '' ? '' : `<div>${esc(k)}</div><div>${vv}</div>`);
    return `<aside class="card side cfgpainel" aria-live="polite" id="cfgPainel"><h2>${esc(x.rot || 'Componente')} <button class="restore" data-cfgsel="" aria-label="Fechar detalhes">fechar</button></h2>
      <h3 style="margin:0 0 4px">Por que este componente?</h3>
      ${motivo ? `<p style="margin:0 0 6px">${esc(motivo)}</p>` : ''}
      ${ln ? `<div class="kv">${kv('Estrutura', esc(famLabel(M.est)) + ' · linha ' + ln.r)}${kv('Bloco', esc(ln.bloco || ''))}${kv('Regra de seleção', esc(origemTxt(ln, heads())))}${kv('Condição', esc(regraTxt(ln.regra)))}${kv('O que acionou', esc(cfgGatilho(S, ln)))}${kv('Quantidade', esc(qtdTxt(ln.qtd)) + (x.qtd !== null && x.qtd !== undefined ? ' → ' + esc(fmtNum(x.qtd)) : ''))}${kv('Versão da regra', v ? esc(fmtAt(v.at)) + ' · ' + who(v.by) : 'versão original da planilha')}</div>` : ''}
      ${x.trocado ? '<p class="sub" style="margin:6px 0 0">O insumo foi trocado nesta proposta. <button class="restore" data-restore="' + esc(S) + '|D' + x.r + '">↺ voltar ao da estrutura</button></p>' : ''}
      ${x.desc ? `<h3 style="margin:10px 0 4px">Cadastro</h3><div class="kv">${kv('Código', i ? esc(i.id) + (i.codFab ? ' · fab. ' + esc(i.codFab) : '') : '<span class="pill bad">não cadastrado</span>')}${kv('Descrição', esc(x.desc))}${kv('Fabricante', esc((i && i.fab) || ''))}${kv('Família', esc(famNome(x.fam)))}${kv('Quantidade', esc(fmtNum(x.qtd)))}${kv('Custo unitário', typeof x.unit === 'number' ? brl(x.unit) : '—')}${kv('Total', brl(x.tot))}${kv('Origem do preço', i ? esc([i.fonte || '', precoData(x.desc) ? 'atualizado em ' + precoData(x.desc).toLocaleDateString('pt-BR') : 'sem data'].filter(Boolean).join(' · ')) : '')}${kv('Situação', i ? esc(situ(i)) : '')}${kv('Certificação', esc(certLinha(i && i.cert, 'pt')))}</div>` : ''}
      ${alts.length ? `<h3 style="margin:10px 0 4px">Alternativas aprovadas</h3><ul class="uso">${alts.map((a) => `<li>${esc((REG.insumos.find((y) => y.id === a) || {}).produto || a)}</li>`).join('')}</ul>` : ''}
      <div class="docbar" style="margin-top:10px;flex-wrap:wrap">
        ${lista.length ? `<div class="f" style="width:100%"><label for="cfgTroca">Trocar o insumo (${esc(famNome(x.fam))})</label><select id="cfgTroca" data-cfgtroca="${x.r}"><option value="">—</option>${lista.map((p) => `<option${p === x.desc ? ' selected' : ''}>${esc(p)}</option>`).join('')}<option value="__novoins__" data-fam="${esc(x.fam)}">＋ Cadastrar novo insumo…</option></select></div>` : ''}
        ${x.tipo === 'man' ? `<button class="btn sm" data-rmrow="${x.r}" data-ico="trash-2">Remover</button>` : ''}
        ${i ? `<button class="btn sm" data-insabre="${esc(i.id)}" data-ico="external-link">Abrir no cadastro</button>` : x.desc ? `<button class="btn sm" data-pedir="${esc(JSON.stringify(x.r && x.r < 113 ? pedidoDaLinha(S, x.r) : { produto: x.desc, linha: { rotulo: S } }))}">Pedir cadastro</button>` : ''}
        ${ln ? `<button class="btn sm" data-qrec="${ln.r}" data-ico="layers">Ver na estrutura</button>` : ''}</div></aside>`;
  }
  // ---- etapa 3: resumo, custos e preço da planilha, conferência, checagens e inclusão ----
  function cfgEt3(S, M, V) {
    const cf = cfgDe(S); const sig = cfgSig(S, M); const conf = cf.conf || {};
    const grp = ACIONS.concat([['ESC', 'Adicionados nesta proposta']]).map(([k, lb]) => { const L = M.comps.filter((x) => x.acion === k && x.tipo !== 'opc' && x.tipo !== 'kit'); if (!L.length) return ''; const gt = L.reduce((t, x) => t + num0(x.tot), 0);
      return `<details class="cfgcusto"><summary><span>${esc(k === 'TODOS' && ['SKID', 'CONTAINER'].includes(M.est) ? 'Equipamentos e acessórios gerais' : lb)}</span><b>${brl(gt)}</b></summary><div class="tw"><table class="t"><tbody>${L.map((x) => `<tr><td>${esc(x.rot)}<br><small class="sub">${esc(x.desc || '—')}</small></td><td class="n">${fmtNum(x.qtd)}</td><td class="n">${brl(x.tot)}</td></tr>`).join('')}</tbody></table></div></details>`; }).join('');
    const nv = { imped: ['Impeditivo', 'bad'], aviso: ['Atenção', 'warn'], info: ['Informativo', 'info'] };
    const alertas = V.length ? `<ul class="alerts cfgalerts">${V.map((a, i) => `<li class="${a.al && a.al.ack ? 'ack' : nv[a.lvl][1]}"><span><b>${nv[a.lvl][0]}${a.lvl === 'imped' && !a.bloq ? ' (vai para aprovação)' : ''}:</b> ${esc(a.msg)}${a.al ? aprovLinha(a.al) : ''}${a.al && a.al.ack ? `<br><small class="sub">Seguindo assim: ${esc(a.al.ack.motivo)} · ${esc(new Date(a.al.ack.at).toLocaleDateString('pt-BR'))}</small>` : ''}</span><span class="alact" style="display:flex;gap:6px;flex-wrap:wrap">${a.al ? alAcoes(a.al) : ''}${a.snap && cf.snap && ['enviada', 'aprovada', 'ganha'].includes(String(state.status || '')) ? '<button class="btn sm" data-cfgfixar>Manter a composição registrada</button>' : ''}<button class="btn sm" data-cfgalert="${i}">Ir para o ${a.go.et === 1 ? 'campo' : a.go.et === 2 ? 'componente' : 'item'}</button></span></li>`).join('')}</ul>` : '<div class="banner ok" style="margin:0">Nenhuma pendência: a configuração está consistente.</div>';
    const chk = (k, lb) => { const c0 = conf[k]; const ok = c0 && c0.sig === sig; return `<label class="chk"><input type="checkbox" data-cfgconf="${k}"${ok ? ' checked' : ''}> ${esc(lb)}${c0 ? ` <small class="sub">${ok ? '' : '(antes de mudanças: refaça) '}${esc(fmtAt(c0.at))} · ${who(c0.by)}</small>` : ''}</label>`; };
    const nImp = V.filter((x) => x.lvl === 'imped' && x.bloq).length; const incl = cf.incl; const inclOk = incl && incl.sig === sig;
    const alt = M.comps.filter((x) => x.tipo === 'man' || x.trocado || x.qtdAlt); const opc = M.comps.filter((x) => x.cls === 'opc');
    return `<div class="stack">
      <section class="card"><h2>Equipamento</h2><div class="split2"><div>
        <div class="lbl">Código</div><div class="codebox">${esc(txt(S, 'C27') || '—')}</div>
        <div class="lbl" style="margin-top:8px">Descrição</div><p class="txtv">${esc(txt(S, 'C28')) || '—'}</p><p class="sub" style="margin:0">${esc(txt(S, 'C30'))}</p></div>
        <div class="kv"><div>Família / estrutura</div><div>${esc(famLabel(M.est))}</div><div>Modelo pronto</div><div>${esc(txt(S, 'C17') || 'montado por características')}</div><div>Arranjo</div><div>${esc(M.c.code || '—')}</div><div>Bomba</div><div>${esc(txt(S, 'AR7') || txt(S, 'D19') || '—')}</div>${M.c.d ? `<div>Motor diesel</div><div>${esc(txt(S, 'C20') || '—')}</div>` : ''}${M.c.e ? `<div>Motor elétrico</div><div>${esc(txt(S, 'H20') || '—')}</div>` : ''}<div>Vazão</div><div>${val(S, 'AR4') ? fmtNum(val(S, 'AR4')) + ' USgpm' : '—'}</div><div>Quantidade</div><div>${show(S, 'P17') || '1'}</div><div>Componentes</div><div>${M.comps.filter((x) => x.tipo !== 'opc' && x.tipo !== 'kit').length} · ${opc.filter((x) => x.tipo !== 'opc').length} opcional(is) marcado(s) · ${alt.length} alteração(ões) da proposta</div></div></div>
        <div class="docbar" style="margin-top:8px"><button class="btn sm" data-cfget="1" data-ico="pencil">Editar configuração</button><button class="btn sm" data-cfget="2" data-ico="layers">Ver componentes</button><button class="btn sm" data-dup="${ui.item}" data-ico="copy">Duplicar</button><button class="btn sm" data-modsave="${ui.item}" data-ico="save">Salvar como modelo de item</button></div></section>
      <section class="card"><h2>Custo e preço <span class="sub">calculados pela planilha (formação oficial)</span></h2>
        <div class="kpis"><div class="kpi"><span>Custo do item</span><b>${brl(val(S, 'H114'))}</b><em>custo direto dos componentes</em></div><div class="kpi"><span>${esc(txt(S, 'F14') || 'Fator')}</span><b>${fmtNum(val(S, 'F15'), '0.0000')}</b><em>markup aplicado sobre o custo</em></div><div class="kpi"><span>${esc(txt(S, 'H14') || 'Fator mínimo')}</span><b>${fmtNum(val(S, 'H15'), '0.0000')}</b></div><div class="kpi lead"><span>${esc(txt(S, 'B14') || 'Preço unitário')}</span><b>${brl(val(S, 'B15'))}</b><em>preço de venda c/ impostos</em></div><div class="kpi"><span>${esc(txt(S, 'D14') || 'Total')}</span><b>${brl(val(S, 'D15'))}</b></div><div class="kpi"><span>Margem</span><b class="${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? 'bad-t' : ''}">${pct(val(S, 'J15'))}</b><em>sobre a venda</em></div></div>
        <div class="cfgcustos">${grp}</div>
        <p class="sub" style="margin:8px 0 0">Nacional ${brl(val(S, 'H115'))} · Importado ${brl(val(S, 'H116'))} · Serviços ${brl(val(S, 'H117'))} · Materiais ${brl(val(S, 'H118'))}</p>
        <details style="margin-top:8px"${keep('cfgmemo')}><summary class="sub">Memória de cálculo (impostos, comissões, frete, margem)</summary><div class="memo">${memoCalc(S)}</div></details></section>
      <section class="card"><h2>Conferência <span class="sub">${V.filter((x) => x.lvl === 'imped').length} impeditivo(s) · ${V.filter((x) => x.lvl === 'aviso').length} atenção · ${V.filter((x) => x.lvl === 'info').length} informativo(s)</span></h2>${alertas}
        <div class="chks" style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${chk('tec', 'Configuração técnica revisada')}${chk('custos', 'Custos conferidos')}${chk('escopo', 'Escopo validado')}</div>
        <p class="sub" style="margin:6px 0 0">As confirmações ficam registradas com nome e data e valem para esta configuração: se ela mudar, precisam ser refeitas. Elas não substituem as verificações automáticas.</p></section>
      ${cfgExtras(S)}
      ${espItemCard(S)}
      ${itemPropCard(S)}
      <section class="card cfgincl"><h2>Incluir na proposta</h2>
        ${inclOk ? `<div class="banner ok" style="margin:0">Incluído na proposta em ${esc(fmtAt(incl.at))} · ${who(incl.by)}. A composição, as quantidades e os parâmetros ficaram registrados com a proposta.</div>` : incl ? `<div class="banner warn" style="margin:0">Incluído em ${esc(fmtAt(incl.at))}, mas a configuração mudou depois: atualize na proposta.</div>` : ''}
        ${nImp ? `<div class="banner bad" style="margin:8px 0 0">${nImp} impeditivo(s) acima: corrija antes de incluir.</div>` : ''}
        <div class="docbar" style="margin-top:10px"><button class="btn pri" data-cfgincluir${nImp || ui.cfgSaving ? ' disabled' : ''} data-ico="${ui.cfgSaving ? 'loader-circle' : 'circle-check'}">${ui.cfgSaving ? 'Gravando…' : incl ? 'Atualizar na proposta' : 'Adicionar à proposta'}</button><button class="btn" data-step="2" data-ico="list">Itens da proposta</button></div>
        <p class="sub" style="margin:6px 0 0">Valida, grava a proposta e registra a configuração. Clicar de novo atualiza o mesmo item; não cria outro.</p></section>
    </div>`;
  }
  // condições comerciais do item, código/descrição/fiscal e FCI (os mesmos campos da tela clássica)
  function cfgExtras(S) {
    const f = (a, lb, o) => field(S, a, lb, o); const fs = (a, lb, o) => fieldS(S, a, lb, o);
    const cond = `Desconto ${pct(val(S, 'C8') || 0, 1)} · margem alvo ${pct(val(S, 'P89'))} · start-up ${val(S, 'K12') ? brl(val(S, 'K12')) + '/un.' : 'não'}`;
    return `<details class="card"${keep('cond')}><summary>Condições deste item <span class="sub">${esc(cond)}</span></summary>
        <div class="fields">${f('C8', 'Desconto de negociação')}${fs('L17', 'Margem alvo')}${fs('J17', 'Modo de preço')}${fs('K7', 'Folga de negociação')}${f('C12', 'Start-up — distância (km)')}${f('F12', 'Start-up — diárias')}${f('I12', 'Start-up — valor fechado')}</div></details>
      ${itemCodHtml(S)}
      ${itemFciHtml(S)}`;
  }
  // incluir/atualizar: valida, registra a composição, grava a proposta e só então confirma
  async function cfgIncluir(S) {
    if (ui.cfgSaving) return; const M = cfgComps(S); const V = cfgValida(S, M); const bl = V.filter((x) => x.lvl === 'imped' && x.bloq);
    if (bl.length) { toast('Corrija antes: ' + bl[0].msg); return; }
    ui.cfgSaving = true; render();
    try {
      const snap = cfgSnapDe(S, M); const novo = !cfgDe(S).incl;
      cfgPut(S, (c) => { c.incl = { at: snap.at, by: snap.by, sig: snap.sig }; c.snap = snap; });
      logEv({ tipo: novo ? 'Equipamento incluído na proposta' : 'Equipamento atualizado na proposta', ref: docTitle(), desc: S + ' · ' + (snap.desc || '') + ' · ' + brl(snap.total), mudancas: [] });
      await $('#bSave').onclick();
      if (dirty) throw new Error('a proposta não foi gravada (veja o aviso acima)');
      toast((novo ? 'Equipamento incluído na proposta' : 'Equipamento atualizado na proposta') + ' e gravado');
    } catch (e) { toast('Não consegui gravar: ' + errMsg(e)); }
    finally { ui.cfgSaving = false; render(); }
  }
  // ---- eventos do configurador ----
  document.addEventListener('click', async (e) => {
    if (ui.view !== 'item') return; const S = ITEMS[ui.item]; const t = e.target;
    const go = t.closest('[data-cfget]'); if (go) { cfgIr(S, +go.dataset.cfget); return; }
    if (t.closest('[data-cfgclassico]')) { ui.cfgClassico = true; store.set(SK.view, ui); render(); return; }
    if (t.closest('[data-cfgassistido]')) { ui.cfgClassico = false; store.set(SK.view, ui); render(); return; }
    const sl = t.closest('[data-cfgsel]'); if (sl) { ui.cfgSel = sl.dataset.cfgsel ? { S, k: sl.dataset.cfgsel } : null; render(); if (sl.dataset.cfgsel && window.innerWidth >= 768 && window.innerWidth < 1000) setTimeout(() => { const p = document.getElementById('cfgPainel'); if (p) p.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30); return; }
    const q1 = t.closest('[data-cfgq1]'); if (q1) { const [r, d] = q1.dataset.cfgq1.split('|'); const v = Math.max(0, qtdNum(val(S, 'F' + r)) + +d); commit(S, 'F' + r, v); return; }
    const oa = t.closest('[data-cfgopcall]'); if (oa) { const ch = {}; for (const r of oa.dataset.cfgopcall.split(',')) ch['BC' + r] = 1; cfgSet(S, ch); return; }
    if (t.closest('[data-cfgadd]')) { ui.cfgAdd = S; ui.cfgAddQ = ''; render(); setTimeout(() => { const el = document.getElementById('cfgAddQ'); if (el) el.focus(); }, 30); return; }
    if (t.closest('[data-cfgaddfim]')) { ui.cfgAdd = null; render(); return; }
    const ai = t.closest('[data-cfgaddins]'); if (ai) { const i = REG.insumos.find((x) => x.id === ai.dataset.cfgaddins); if (!i) return; let r = 0; for (let q = 68; q <= 112; q++) if (!txt(S, 'D' + q) && !txt(S, 'C' + q) && !txt(S, 'B' + q)) { r = q; break; }
      if (!r) { toast('O item já tem 45 componentes adicionais'); return; } cfgSet(S, { ['C' + r]: i.fam, ['D' + r]: i.produto, ['F' + r]: 1 }); ui.cfgSel = { S, k: 'm' + r }; toast(i.produto + ' adicionado'); return; }
    if (t.closest('[data-cfgnovoins]')) { ui.cad = 'insumos'; insumoModal(null); return; }
    const cc = t.closest('[data-cfgcad]'); if (cc) { if (!REG.ehAdmin()) { toast('Só o administrador corrige o cadastro por aqui. Use "Pedir cadastro".'); return; }
      const x = cfgComps(S).comps.find((y) => y.k === cc.dataset.cfgcad); if (!x) return;
      // depois de gravar: a linha acrescentada na proposta passa a usar o nome corrigido; as da estrutura continuam pela estrutura
      cfgCadAlvo = { S, r: x.r, tipo: x.tipo, desc: x.desc, id: x.ins ? x.ins.id : null, at: Date.now() };
      // fechou a ficha sem gravar: esquece o alvo (para não mexer na linha ao gravar outro insumo depois)
      const vigia = setInterval(() => { if (!document.querySelector('#overlay #fProd')) { clearInterval(vigia); cfgCadAlvo = null; } }, 500);
      if (x.ins) { insumoModal(x.ins.id); return; }
      insumoModal(null, x.fam && /^\d+\./.test(x.fam) ? x.fam : undefined);
      setTimeout(() => { const o = $('#overlay'); if (!o) return; const gr = $('#fGerar', o); if (gr && gr.checked) { gr.checked = false; gr.dispatchEvent(new Event('change')); }
        const pr = $('#fProd', o); if (pr) { pr.value = x.desc; pr.dispatchEvent(new Event('input')); } toast('Confira família, preço e fabricante e clique em Cadastrar'); }, 40);
      return; }
    if (t.closest('[data-cfgpadrao]')) { if (!await DLG.confirmar('Voltar a composição ao padrão da estrutura? Trocas de insumo e de quantidade da estrutura e os opcionais marcados voltam ao automático (os componentes adicionados ficam).')) return;
      const ch = {}; for (let r = 34; r <= 63; r++) for (const col of ['D', 'F', 'G', 'I']) if (overridden(S, col + r)) ch[col + r] = undefined; for (const a of Object.keys((state.doc || {})[S] || {})) if (/^BC\d+$/.test(a)) ch[a] = undefined; cfgSet(S, ch); toast('Composição no padrão da estrutura'); return; }
    if (t.closest('[data-cfgincluir]')) { await cfgIncluir(S); return; }
    if (t.closest('[data-cfgfixar]')) { if (await DLG.confirmar('Fixar a composição registrada quando o equipamento foi incluído? As linhas da estrutura passam a valer como alteração desta proposta.')) cfgFixar(S); return; }
    const al = t.closest('[data-cfgalert]'); if (al) { const a = cfgValida(S)[+al.dataset.cfgalert]; if (!a) return; cfgIr(S, a.go.et, a.go.sel, a.go.campo);
      setTimeout(() => { if (a.go.campo) { const el = document.getElementById(id(S, a.go.campo)); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } } else if (a.go.sel) { const el = document.getElementById('cfgc_' + a.go.sel); if (el) el.scrollIntoView({ block: 'center' }); } }, 60); return; }
    const sv = t.closest('[data-cfgsalva]'); if (sv) { ensureModelos(); const x = modelosItem.find((y) => y.id === sv.dataset.cfgsalva); if (!x) return; if (Object.keys((state.doc || {})[S] || {}).length && !await DLG.confirmar('Substituir a configuração deste item por "' + x.nome + '"?')) return;
      state.doc = state.doc || {}; state.doc[S] = JSON.parse(JSON.stringify(x.cells)); build(); persist(); dirty = true; listCache = new Map(); logEv({ tipo: 'Modelo de item usado', ref: docTitle(), desc: S + ' ← ' + x.nome, mudancas: [] }); toast('Configuração aplicada: ' + x.nome); render(); return; }
  });
  document.addEventListener('change', (e) => {
    if (ui.view !== 'item') return; const S = ITEMS[ui.item]; const t = e.target; const ds = t.dataset || {};
    if (ds.cfgmodo) { ui.cfgModo = Object.assign({}, ui.cfgModo, { [S]: ds.cfgmodo }); render(); return; }
    if (ds.cfgesp !== undefined) { cfgPut(S, (c) => { if (ds.cfgesp === '1') c.especial = true; else delete c.especial; }); render(); return; }
    if (ds.cfgac !== undefined) { ui.cfgAc = Object.assign({}, ui.cfgAc, { [S]: ds.cfgac }); render(); return; }
    if (ds.cfgfab) { ui.cfgFab = Object.assign({}, ui.cfgFab, { [ds.cfgfab]: t.value }); render(); return; }
    if (ds.cfgqtd) { const v = parseInput(t.value, 'num'); if (typeof v !== 'number' || v < 0) { toast('Quantidade inválida'); render(); return; } commit(S, 'F' + ds.cfgqtd, v); return; }
    if (ds.cfgtroca) { if (!t.value) return; commit(S, 'D' + ds.cfgtroca, t.value); toast('Insumo trocado nesta proposta'); return; }
    if (ds.cfgconf) { const k = ds.cfgconf; const sig = cfgSig(S); cfgPut(S, (c) => { c.conf = c.conf || {}; if (t.checked) c.conf[k] = { at: new Date().toISOString(), by: REG.me || null, sig }; else delete c.conf[k]; if (!Object.keys(c.conf).length) delete c.conf; });
      logEv({ tipo: 'Conferência do equipamento', ref: docTitle(), desc: S + ': ' + ({ tec: 'configuração técnica revisada', custos: 'custos conferidos', escopo: 'escopo validado' })[k] + (t.checked ? '' : ' (desmarcada)'), mudancas: [] }); render(); return; }
  });
  // pesquisa: atualiza ao digitar, sem perder o foco
  document.addEventListener('input', (e) => {
    if (ui.view !== 'item') return; const S = ITEMS[ui.item]; const t = e.target;
    const refoca = (sel) => { const pos = t.selectionStart; render(); const el = document.querySelector(sel); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* campo sem seleção */ } } };
    if (t.matches('[data-cfgq]')) { ui.cfgQ = Object.assign({}, ui.cfgQ, { [S]: t.value }); refoca('[data-cfgq]'); return; }
    if (t.matches('[data-cfgaddq]')) { ui.cfgAddQ = t.value; refoca('[data-cfgaddq]'); }
  });
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
    if (ed) { uiEdit.add(ed.dataset.edit); render(); const [s, a] = ed.dataset.edit.split('|'); const el = document.getElementById(id(s, a)); if (el) { el.focus(); if (el.select) el.select(); } return; }
    const sp = e.target.closest('[data-step]');
    if (sp) { if (+sp.dataset.step > 1 && !cabOk()) { ui.step = 1; ui.reqShow = true; setView('proposta'); toast('Preencha o cabeçalho antes de seguir'); return; } ui.step = +sp.dataset.step; ui.propFull = false; if (!ui.simple && sp.closest('.ptabs, .flowbar, #app')) { ui.simple = true; store.set(SK.view, ui); } setView('proposta'); return; }
    if (e.target.closest('[data-additem]')) { const j = firstFree(); if (j < 0) return; ui.item = j; ui.itemFull = false; cfgEtRestart(j); setView('item'); return; }
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
    // inativos e descontinuados saem das listas de escolha (continuam no cadastro e no cálculo das propostas que já os usam)
    const fora = new Set(REG.insumos.filter((i) => foraDeUso(i)).map((i) => i.produto));
    for (let r = 2; r <= 1000; r++) {
      const fam = wb.value('CADASTRO', 'C' + r), prod = wb.value('CADASTRO', 'D' + r);
      if (!prod || isErr(prod) || !fam || isErr(fam) || fora.has(String(prod))) continue;
      const k = String(fam); if (!dlMap.has(k)) dlMap.set(k, new Set()); dlMap.get(k).add(String(prod)); all.add(String(prod));
    }
    dlMap.set('*', all);
  }
  // data da última atualização do preço do insumo (cadastro; ou a data escrita nas observações)
  function precoData(prod) {
    const i = prod && REG.insumos.find((x) => x.produto === prod); if (!i) return null;
    let d = precoRef(i) ? new Date(precoRef(i)) : null;
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
    let notes = '';
    // linhas 3–38: formação; 39–46: conferência contra as abas de item; textos longos sem valor viram nota
    for (let r = 3; r <= 48; r++) {
      const lb = txt(M, 'B' + r); if (!lb) continue;
      if (val(M, 'M' + r) === null && val(M, 'C' + r) === null && lb.length > 90) { notes += `<p class="sub">${esc(lb)}</p>`; continue; }
      if (val(M, 'M' + r) === null && val(M, 'C' + r) === null) { rows.push(`<tr><td colspan="${cols.length + 2}" style="font-weight:700;color:var(--or-ink)">${esc(lb)}</td></tr>`); continue; }
      const bold = /^TOTAL|Margem|Preço de venda com impostos e COM/i.test(lb);
      rows.push(`<tr class="${bold ? 'tot' : ''}"><td>${esc(lb)}</td>${cols.map((c) => `<td class="n">${show(M, c + r)}</td>`).join('')}<td class="n"><b>${show(M, 'M' + r)}</b></td></tr>`);
    }
    return `<div class="stack"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end"><div><h1>Memorial de formação de preço</h1><div class="sub">No formato que o financeiro pede: custos, impostos, comissão, margem e o demonstrativo — por item e total da proposta.</div></div><div class="docbar"><span class="sub">Documentos para o financeiro</span><button class="btn sm pri" data-doc="memorial">Memorial (PDF)</button><button class="btn sm" data-doc="fcipdf">FCI (PDF)</button><button class="btn sm" data-doc="fcixlsx">FCI (Excel)</button></div></div>
      <section class="card"><div class="tw"><table class="t"><thead><tr><th>Linha</th>${cols.map((c) => `<th>ITEM ${String(colToNum(c) - 2).padStart(2, '0')}</th>`).join('')}<th>Total da proposta</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${notes}</section></div>`;
  }

  // ---------- cadastro: insumos, kits, importação, histórico e demais tabelas ----------
  const H = REG.helpers;
  // cadastro por área: cada área tem um responsável e só ele edita o que é dela
  const AREAS = [
    ['visao', 'Visão geral', 'Mapa do cadastro (produtos, equipamentos, estruturas, padronização e parâmetros) e qualidade dos dados mestres', [['mapa', 'Mapa do cadastro'], ['qualidade', 'Qualidade dos dados']]],
    ['custos', 'Custos', 'Preço de compra de insumos e kits, importação e câmbio', [['insumos', 'Insumos e preços'], ['importar', 'Importar preços'], ['motor', 'Kits de motor diesel'], ['bomba', 'Kits de bomba'], ['valvulas', 'Válvulas de alívio'], ['cambio', 'Câmbio e importação'], ['facts', 'FACTS (MECON)'], ['custoscfg', 'Validade e alertas'], ['pedidos', 'Pedidos de cadastro'], ['fornecedores', 'Fornecedores e fabricantes']]],
    ['engenharia', 'Engenharia', 'O que entra em cada equipamento e como ele é codificado', [['estruturas', 'Estruturas'], ['mobase', 'Mão de obra e bases'], ['familias', 'Famílias'], ['codificacao', 'Codificação'], ['regras', 'Regras de configuração'], ['testador', 'Testador de estruturas']]],
    ['fiscal', 'Fiscal', 'Impostos, NCM, ICMS por estado, FCI e os cenários da reforma tributária', [['fiscal', 'Impostos e NCM'], ['cenarios', 'Cenários tributários (reforma)']]],
    ['precificacao', 'Precificação', 'Margens, fatores, descontos, comissões e condições de pagamento', [['preco', 'Margens e política']]],
    ['servicos', 'Serviços', 'Técnicos, diárias, deslocamento e modelos de serviço e contrato', [['servicos', 'Equipe, custos e modelos']]],
    ['geral', 'Cadastro geral', 'Dados da empresa, unidades, famílias por divisão, e o padrão de descrição dos insumos', [['geral', 'Empresa e famílias'], ['padrao', 'Padronização de descrições'], ['campos', 'Campos por família'], ['sinonimos', 'Sinônimos e abreviações']]],
    ['sistema', 'Sistema', 'Histórico, modelo da proposta, responsáveis e e-mails, backup e restauração e planilha (avançado)', [['historico', 'Histórico'], ['propmodelo', 'Modelo da proposta'], ['acessos', 'Responsáveis, e-mails e logo'], ['numeracao', 'Numeração e máscaras'], ['backup', 'Backup e restauração'], ['tabelas', 'Planilha (avançado)']]],
  ];
  const CAD_TABS = AREAS.flatMap((a) => a[3]);
  const OLD_TABS = { parametros: 'fiscal', politica: 'preco', fci: 'fiscal', spv: 'servicos' };
  const areaOfTab = (t) => (AREAS.find((a) => a[3].some((x) => x[0] === t)) || AREAS[0])[0];
  const areaName = (k) => (AREAS.find((a) => a[0] === k) || PAPEIS_AP.find((a) => a[0] === k) || [0, k])[1];
  // o modelo da proposta fica em Configurações, mas quem edita continua sendo o responsável do Cadastro geral
  const PERM_TAB = { propmodelo: 'geral' };
  const canEd = () => REG.areaOk(PERM_TAB[ui.cad] || areaOfTab(ui.cad));
  const fmtAt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };
  const fmtVal = (v) => typeof v === 'number' ? NF[2].format(v) : v === null || v === undefined || v === '' ? '—' : String(v);
  const who = (id) => id ? `<span data-uid="${esc(id)}">…</span>` : (REG.mode === 'shared' ? 'alguém da equipe' : 'neste navegador');
  async function fillNames(root) {
    const els = [...(root || document).querySelectorAll('[data-uid]')]; if (!els.length) return;
    const names = await REG.names(els.map((e) => e.dataset.uid));
    for (const e of els) e.textContent = names[e.dataset.uid] || 'alguém da equipe';
  }
  // nome da família para a tela: "01.MOTORDIESEL" vira "Motor diesel". O código continua gravado por dentro
  // (é o que a planilha compara e o prefixo do código do insumo); só a Engenharia → Famílias mostra o número.
  const FAM_NOMES = { 1: 'Motor diesel', 10: 'Motor elétrico', 11: 'Bomba de eixo livre', 12: 'Motobomba', 13: 'Bomba jockey', 14: 'Base', 15: 'Tanque de combustível', 16: 'Escapamento', 17: 'Bateria', 18: 'Acoplamento', 19: 'Chave de partida', 20: 'Controlador', 21: 'Painel de comando', 22: 'Sensores', 23: 'Válvula de alívio', 24: 'Cone de descarga', 25: 'Medidor de vazão', 26: 'Pré-aquecimento', 27: 'Barrilete de sucção', 28: 'Barrilete de recalque', 29: 'Pressostato', 30: 'Manovacuômetro', 31: 'Interligação das baterias', 32: 'Miscelâneas', 33: 'Kit de instalações', 34: 'Mão de obra', 35: 'Pintura especial', 36: 'Capa do acoplamento', 37: 'Embalagem', 38: 'Tomada de pressão', 39: 'ECM reserva', 40: 'Cabeçote', 41: 'Outros', 42: 'Manômetro', 43: 'Kit de recirculação', 44: 'Kit válvula de ar', 45: 'Acessórios do tanque', 46: 'Testes e ensaios', 47: 'Documentos e desenhos' };
  function famNome(f) {
    const m = /^(\d+)\.(.+)$/.exec(String(f || '')); if (!m) return String(f || '');
    const code = +m[1]; if (FAM_NOMES[code]) return FAM_NOMES[code];
    const reg = famReg()[code]; if (reg && reg.desc) return reg.desc.split(':')[0].trim();
    return m[2].charAt(0) + m[2].slice(1).toLowerCase();
  }
  window.LSFamNome = famNome;
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
  const AREA_ICO = { visao: 'layout-dashboard', custos: 'coins', engenharia: 'wrench', fiscal: 'receipt', precificacao: 'badge-percent', servicos: 'users', geral: 'tag', sistema: 'settings-2' };
  function vCadastro(modo) {
    const cfg = modo === 'config';
    if (OLD_TABS[ui.cad]) ui.cad = OLD_TABS[ui.cad];
    if (!CAD_TABS.some((x) => x[0] === ui.cad)) ui.cad = cfg ? 'historico' : 'insumos';
    const tab = ui.cad; const area = AREAS.find((a) => a[0] === areaOfTab(tab));
    const body = { insumos: vInsumos, familias: vFamilias, codificacao: () => vParamTab('codificacao'), fiscal: () => vParamTab('fiscal'), preco: () => vParamTab('preco'), servicos: () => vParamTab('servicos'), geral: () => vParamTab('geral'), cambio: () => SPV.cfgSec('custos', canEd()), valvulas: () => tableCard('valv'), acessos: vAcessos, numeracao: vNumeracao, backup: vBackup, custoscfg: vCustosCfg, propmodelo: vModeloProposta, regras: () => RG.vCfg(canEd()), mapa: vMapa, qualidade: vQualidade, fornecedores: vFornecedores, campos: vCampos, sinonimos: vSinonimos, testador: vTestador, padrao: vPadrao, mobase: vMoBase, cenarios: () => TB.vCenarios(canEd()), facts: () => FX.vCfg(canEd()), pedidos: () => PD.vLista(), estruturas: vEstruturas, motor: () => vKits('motor'), bomba: () => vKits('bomba'), importar: vImportar, historico: vHistorico, tabelas: vTabelas }[tab]();
    const mine = REG.mode === 'shared' && REG.areasConfiguradas() ? REG.minhasAreas() : null;
    return `<div class="stack">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:end">
        <div>${cfg ? '<h1>Configurações</h1><div class="sub">Histórico de alterações, modelo da proposta, perfis e responsáveis, e-mails e logo, backup e restauração e a planilha completa (avançado). Itens para administradores; o modelo da proposta é editado por quem cuida do Cadastro geral.</div>' : `<h1>Cadastros</h1><div class="sub">Insumos, kits e tabelas que alimentam o preço. Uma mudança aqui vale para todas as propostas${REG.mode === 'shared' ? ' de toda a equipe' : ' deste navegador'}, e cada alteração fica registrada no histórico.</div>`}</div>
        ${cadStatus()}
      </div>
      ${cfg ? '' : `<div class="areatabs" role="tablist">${AREAS.filter((a) => a[0] !== 'sistema').map(([k, lb, d, tabs]) => `<button role="tab" data-cad="${tabs[0][0]}" aria-selected="${k === area[0]}" title="${esc(d)}" data-ico="${AREA_ICO[k] || 'database'}">${lb}${mine && (mine.includes(k) || REG.isOwner) ? ' <span class="mydot" title="sua área"></span>' : ''}</button>`).join('')}</div>`}
      <p class="sub" style="margin:0">${esc(area[2])}.${REG.mode === 'shared' && REG.areasConfiguradas() ? ` Responsável: <span data-areaown="${area[0]}">${esc((REG.acessos[area[0]] || []).length ? '…' : 'ninguém definido (só o dono edita)')}</span>.` : ''}</p>
      ${area[3].length > 1 ? `<div class="subtabs" role="tablist">${area[3].map(([k, lb]) => `<button role="tab" data-cad="${k}" aria-selected="${k === tab}">${lb}</button>`).join('')}</div>` : ''}
      ${body}
    </div>`;
  }

  // ---- insumos ----
  // índice de uso dos nomes do cadastro (estruturas, tabelas por porte, kits, propostas e baixas): para "sem uso", qualidade e edição em massa
  function usoIndex() {
    const nomes = new Map(); const add = (n, onde) => { if (!n) return; const k = String(n); if (!nomes.has(k)) nomes.set(k, new Set()); nomes.get(k).add(onde); };
    const famSel = new Set();
    for (const x of recLines()) {
      if (x.tipo === 'FIXO' || x.tipo === 'SPLIT') add(x.campo, 'estrutura');
      else if (x.tipo === 'TAMANHO') for (let r = 157; r <= 166; r++) { const n = val(MO, 'D' + r); if (n !== null) add(String(x.pre || '') + fmtPlain(n) + String(x.suf || ''), 'estrutura'); }
      else if (['MOTOR', 'BOMBA', 'JOCKEY'].includes(x.tipo) && x.fam) famSel.add(x.fam);
    }
    const tab = (sh, r1, r2, c1, c2) => { for (let r = r1; r <= r2; r++) for (let c = colToNum(c1); c <= colToNum(c2); c++) { const v = val(sh, numToCol(c) + r); if (typeof v === 'string' && v) add(v, 'tabela por porte'); } };
    tab(MO, 157, 166, 'E', 'M'); tab(MO, 172, 187, 'D', 'G'); tab('KIT HIDRÁULICA', 4, 32, 'B', 'Q');
    for (const k of REG.kitMotor.concat(REG.kitBomba)) add(k.desc, 'kit');
    for (const q of REG.listPropostas() || []) { for (const [sh, cells] of Object.entries(q.doc || {})) if (/^ITEM/.test(sh)) for (const v of Object.values(cells || {})) if (typeof v === 'string') add(v, 'proposta'); for (const d of Object.keys((q.precos || {}).ins || {})) add(d, 'proposta'); }
    for (const F of MG.lista ? MG.lista() : []) for (const it of (F.snap || {}).itens || []) for (const l of it.linhas || []) add(l.desc, 'baixa');
    for (const r of RG.lista()) if (r.componente) add('regra:' + r.componente, 'regra');
    return { nomes, famSel, de: (i) => [...(nomes.get(i.produto) || [])].concat(famSel.has(i.fam) ? ['escolhido no item (família)'] : []) };
  }
  const favKey = () => 'lspricer.fav.' + (REG.me || 'local');
  const favs = () => { try { return new Set(JSON.parse(localStorage.getItem(favKey()) || '[]')); } catch (e) { return new Set(); } };
  function favToggle(id) { const f = favs(); if (f.has(id)) f.delete(id); else f.add(id); try { localStorage.setItem(favKey(), JSON.stringify([...f])); } catch (e) { toast('O navegador não deixou guardar o favorito'); } }
  const selIns = new Set();
  // coluna "Preço atualizado em": data e selo de vencido / vence em breve / sem data
  function dataPrecoHtml(x, C) {
    if (typeof x.valor !== 'number') return '<span class="sub">—</span>';
    const r = precoRef(x); if (!r) return '<span class="pill mute" title="preço da planilha original, sem data de atualização">sem data</span>';
    const d = (Date.now() - r) / 864e5; const dt = new Date(r).toLocaleDateString('pt-BR');
    return `${dt}${d > C.validadeDias ? ` <span class="pill warn" title="mais de ${C.validadeDias} dias sem atualizar">vencido · ${Math.round(d)} d</span>` : d > C.validadeDias - C.avisoDias ? ` <span class="pill mute">vence em ${Math.max(0, Math.round(C.validadeDias - d))} d</span>` : ''}`;
  }
  // ---- Modelo A (listas): colunas escolhidas, visualizações salvas e paginação. Preferência de tela, guardada neste navegador ----
  const LISTA_K = 'lspricer.listas';
  const listaPref = (id) => { try { return (JSON.parse(localStorage.getItem(LISTA_K) || '{}') || {})[id] || {}; } catch (e) { return {}; } };
  const listaSet = (id, patch) => { try { const all = JSON.parse(localStorage.getItem(LISTA_K) || '{}') || {}; all[id] = Object.assign({}, all[id] || {}, patch); localStorage.setItem(LISTA_K, JSON.stringify(all)); } catch (e) { /* só nesta visita */ } };
  const listaCols = (id, cols) => { const h = listaPref(id).ocultas || []; return cols.filter(([k]) => !h.includes(k)).map(([k]) => k); };
  function listaFerramentas(id, cols, views) {
    const h = listaPref(id).ocultas || []; const vs = listaPref(id).views || {};
    return `<details class="lmenu"><summary class="btn sm" data-ico="columns-3">Colunas</summary><div class="lpop" role="group" aria-label="Colunas visíveis">${cols.map(([k, lb]) => `<label class="chk"><input type="checkbox" data-lcol="${id}|${k}"${h.includes(k) ? '' : ' checked'}> ${esc(lb)}</label>`).join('')}</div></details>
      ${views ? `<details class="lmenu"><summary class="btn sm" data-ico="bookmark">Visualizações${Object.keys(vs).length ? ' (' + Object.keys(vs).length + ')' : ''}</summary><div class="lpop">${Object.keys(vs).map((n) => `<div class="lview"><button type="button" class="linkbtn" data-lview="${id}|${esc(n)}">${esc(n)}</button><button type="button" class="restore" data-lviewdel="${id}|${esc(n)}" aria-label="Excluir a visualização ${esc(n)}">excluir</button></div>`).join('') || '<small class="sub">Nenhuma salva.</small>'}<button type="button" class="btn sm" data-lviewsave="${id}">Salvar a visualização atual…</button><small class="sub">Guarda busca, filtros, ordem e colunas neste navegador.</small></div></details>` : ''}`;
  }
  function listaPaginas(id, total, pg, tam) {
    if (total <= tam) return ''; const nP = Math.ceil(total / tam); const p0 = Math.min(Math.max(1, pg), nP);
    return `<div class="lpager" role="navigation" aria-label="Páginas"><span class="sub">${NF[0].format((p0 - 1) * tam + 1)}–${NF[0].format(Math.min(total, p0 * tam))} de ${NF[0].format(total)}</span>
      <button class="btn sm" data-lpg="${id}|${p0 - 1}"${p0 <= 1 ? ' disabled' : ''} aria-label="Página anterior">‹ Anterior</button><span class="sub">página ${p0} de ${nP}</span><button class="btn sm" data-lpg="${id}|${p0 + 1}"${p0 >= nP ? ' disabled' : ''} aria-label="Próxima página">Próxima ›</button>
      <label class="sub">por página <select data-lpgtam="${id}" aria-label="Linhas por página">${[50, 100, 200].map((n) => `<option${n === tam ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
  }
  // a janela de Colunas/Visualizações abre sempre dentro da tela e por cima do menu lateral; fecha ao clicar fora
  document.addEventListener('toggle', (e) => { const d = e.target; if (!(d && d.classList && d.classList.contains('lmenu')) || !d.open) return;
    for (const o of document.querySelectorAll('details.lmenu[open]')) if (o !== d) o.open = false;
    const pop = d.querySelector('.lpop'); const r = d.querySelector('summary').getBoundingClientRect(); const w = Math.min(pop.offsetWidth || 260, window.innerWidth - 16);
    pop.style.position = 'fixed'; pop.style.top = Math.round(r.bottom + 6) + 'px'; pop.style.right = 'auto'; pop.style.left = Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))) + 'px'; }, true);
  document.addEventListener('click', (e) => { if (e.target.closest('details.lmenu')) return; for (const o of document.querySelectorAll('details.lmenu[open]')) o.open = false; });
  // estado de cada lista que entra numa visualização salva
  const LISTA_ESTADO = { insumos: ['insQ', 'insFam', 'insFab', 'insSit', 'insSem', 'insFav', 'insOrd'], propostas: ['homeQ', 'homeDiv'] };
  window.LSLista = { ferramentas: listaFerramentas, paginas: listaPaginas, cols: listaCols, pref: listaPref };
  document.addEventListener('change', (e) => { const t = e.target;
    if (t.dataset && t.dataset.lcol) { const [id, k] = t.dataset.lcol.split('|'); const h = new Set(listaPref(id).ocultas || []); if (t.checked) h.delete(k); else h.add(k); listaSet(id, { ocultas: [...h] }); render(); return; }
    if (t.dataset && t.dataset.lpgtam) { listaSet(t.dataset.lpgtam, { tam: +t.value }); ui['pg_' + t.dataset.lpgtam] = 1; render(); } });
  document.addEventListener('click', async (e) => {
    const pg = e.target.closest('[data-lpg]'); if (pg) { const [id, n] = pg.dataset.lpg.split('|'); ui['pg_' + id] = +n; render(); const t = document.querySelector('#app .lpager'); if (t) t.closest('section').scrollIntoView({ block: 'start' }); return; }
    const sv = e.target.closest('[data-lviewsave]'); if (sv) { const id = sv.dataset.lviewsave; const nome = String(await DLG.pedir('Nome da visualização (ex.: Motores sem preço):', '') || '').trim(); if (!nome) return;
      const est = {}; for (const k of LISTA_ESTADO[id] || []) est[k] = ui[k]; const vs = Object.assign({}, listaPref(id).views || {}, { [nome]: { est, ocultas: listaPref(id).ocultas || [] } }); listaSet(id, { views: vs }); toast('Visualização salva: ' + nome); render(); return; }
    const ap = e.target.closest('[data-lview]'); if (ap) { const [id, n] = ap.dataset.lview.split('|'); const v = (listaPref(id).views || {})[n]; if (!v) return; for (const k of LISTA_ESTADO[id] || []) ui[k] = v.est[k]; listaSet(id, { ocultas: v.ocultas || [] }); ui['pg_' + id] = 1; render(); toast('Visualização: ' + n); return; }
    const dl = e.target.closest('[data-lviewdel]'); if (dl) { const [id, n] = dl.dataset.lviewdel.split('|'); const vs = Object.assign({}, listaPref(id).views || {}); delete vs[n]; listaSet(id, { views: vs }); render(); } });
  function vInsumos() {
    const fam = ui.insFam || ''; const fab = ui.insFab || ''; const sit = ui.insSit || ''; const sem = !!ui.insSem; const soFav = !!ui.insFav; const ord = ui.insOrd || 'codigo';
    const all = H.sortIns(REG.insumos); const cfg = famCfg(); const F = favs(); const C = custosCfg();
    const semPreco = all.filter((x) => typeof x.valor !== 'number');
    const grupos = FAMS_F.termos(ui.insQ || '', sinonimos());
    const pend = (x) => { const L = []; if (typeof x.valor !== 'number') L.push(['sem preço', 'warn']); const m = FAMS_F.checar(x.fam, x.produto, cfg); if (m && !x.excecao) L.push(['fora do padrão', 'warn']);
      if (precoVencido(x)) L.push(['preço vencido', 'warn']); return L; };
    const ids = ui.insIds && ui.insIds.length ? new Set(ui.insIds) : null;
    let list = all.filter((x) => (!fam || x.fam === fam) && (!fab || (x.fab || '') === fab) && (!sem || typeof x.valor !== 'number') && (!soFav || F.has(x.id))
      && (!sit || (sit === 'pend' ? pend(x).length || situ(x) !== 'ativo' : sit === 'vencido' ? precoVencido(x) : sit === 'semdata' ? typeof x.valor === 'number' && !precoRef(x) : situ(x) === sit)) && (!ids || ids.has(x.id))
      && (!grupos.length || FAMS_F.casa([x.id, x.produto, x.fab, x.tipo, x.obs, x.fam, x.codFab, x.descCom, x.descFab, Object.values(x.caract || {}).join(' ')].join(' '), grupos)));
    const cmp = { codigo: () => 0, produto: (a, b) => a.produto.localeCompare(b.produto), valor: (a, b) => (b.valor ?? -1) - (a.valor ?? -1), upd: (a, b) => (precoRef(a) || 0) - (precoRef(b) || 0) }[ord] || (() => 0);
    list = list.slice().sort((a, b) => (F.has(b.id) - F.has(a.id)) || cmp(a, b));
    // no celular os insumos aparecem em cartões, 80 por vez ("Mostrar mais"), para a tela não ficar pesada
    // celular: cartões, 80 por vez ("Mostrar mais"); computador: páginas de 50, 100 ou 200 linhas
    const cel = window.matchMedia && window.matchMedia('(max-width: 767px)').matches; const tam = listaPref('insumos').tam || 100;
    const pgN = Math.min(Math.max(1, ui.pg_insumos || 1), Math.max(1, Math.ceil(list.length / tam))); const lim = cel ? Math.min(400, ui.insLim || 80) : list.length;
    const shown = cel ? list.slice(0, lim) : list.slice((pgN - 1) * tam, pgN * tam); const ed = canEd();
    const INS_COLS = [['fam', 'Família'], ['fab', 'Fabricante'], ['tipo', 'Tipo/config.'], ['valor', 'Valor'], ['origem', 'Origem'], ['upd', 'Preço atualizado em']]; const vc = new Set(listaCols('insumos', INS_COLS)); const cv = (k, html) => (vc.has(k) ? html : '');
    const last = all.reduce((m, x) => (x.upd && x.upd > (m.upd || '') ? x : m), {});
    const th = (k, lb) => `<th><button class="thsort${ord === k ? ' on' : ''}" data-insord="${k}">${lb}${ord === k ? ' ▾' : ''}</button></th>`;
    const rows = shown.map((x) => `<tr class="click" data-ins="${esc(x.id)}">${ed ? `<td class="in"><input type="checkbox" data-inssel="${esc(x.id)}"${selIns.has(x.id) ? ' checked' : ''} aria-label="Selecionar ${esc(x.id)}"></td>` : ''}<td><button class="star${F.has(x.id) ? ' on' : ''}" data-insfav="${esc(x.id)}" aria-label="${F.has(x.id) ? 'Tirar dos favoritos' : 'Favoritar'}">${F.has(x.id) ? '★' : '☆'}</button></td><td class="code">${esc(x.id)}</td>${cv('fam', `<td>${esc(famNome(x.fam))}</td>`)}
      <td style="min-width:280px">${esc(x.produto)} ${situPillIns(x)} ${pend(x).filter((p) => p[0] !== 'sem preço').map(([t, c]) => `<span class="pill ${c}">${t}</span>`).join(' ')}</td>${cv('fab', `<td>${esc(x.fab || '')}</td>`)}${cv('tipo', `<td>${esc(x.tipo || '')}</td>`)}
      ${cv('valor', `<td class="n">${typeof x.valor === 'number' ? brl(x.valor) : '<span class="pill warn">sem preço</span>'}</td>`)}${cv('origem', `<td>${esc(x.origem || '')}</td>`)}${cv('upd', `<td>${dataPrecoHtml(x, C)}</td>`)}</tr>`).join('');
    const semData = all.filter((x) => typeof x.valor === 'number' && !precoRef(x)); const vencidos = all.filter((x) => precoVencido(x)); const UI = vencidos.length ? usoIndex() : null; const vUso = vencidos.filter((x) => UI.de(x).length);
    const fams = famList(); const fabs = [...new Set(all.map((x) => x.fab).filter(Boolean))].sort();
    for (const id of [...selIns]) if (!REG.insumos.some((x) => x.id === id)) selIns.delete(id);
    return `<div class="kpis">
        <div class="kpi"><span>Insumos</span><b>${NF[0].format(all.length)}</b><em>limite da planilha: ${H.LIMITS.insumos}</em></div>
        <div class="kpi"><span>Famílias</span><b>${fams.length}</b></div>
        <div class="kpi"><span>Sem preço</span><b class="${semPreco.length ? 'bad-t' : ''}">${semPreco.length}</b><em>puxam custo zero na proposta</em></div>
        <div class="kpi"><span>Preço vencido</span><b class="${vencidos.length ? 'warn-t' : 'ok-t'}">${vencidos.length}</b><em>mais de ${C.validadeDias} dias sem atualizar${vUso.length ? ' · ' + vUso.length + ' em uso' : ''}${semData.length ? ` · <button class="linkbtn" data-inssemdata>${semData.length} sem data</button>` : ''}</em></div>
        <div class="kpi"><span>Última alteração</span><b style="font-size:18px">${last.upd ? fmtAt(last.upd) : '—'}</b><em>${last.upd ? esc(last.produto || '') : 'valores da planilha REV21'}</em></div>
      </div>
      ${vencidos.length && sit !== 'vencido' ? `<div class="banner warn" style="margin:0"><b>${vencidos.length} insumo(s) com preço vencido</b> — a atualização de preços é mensal (${C.validadeDias} dias)${vUso.length ? `; ${vUso.length} estão em uso em estruturas, kits ou propostas` : ''}. <button class="btn sm" data-insvenc>Ver os vencidos</button></div>` : ''}
      ${ids ? `<div class="banner info" style="margin:0">Mostrando só os ${ids.size} insumo(s) vindos da proposta. <button class="btn sm" data-insids>Mostrar todos</button></div>` : ''}
      <section class="card">
        <div class="sheetbar">
          <input id="insQ" type="search" placeholder="Buscar código, fabricante, modelo, característica… (aceita sinônimos)" value="${esc(ui.insQ || '')}" aria-label="Buscar insumo" style="flex:1 1 260px">
          <select id="insFam" aria-label="Família"><option value="">Todas as famílias</option>${fams.map((f) => `<option value="${esc(f)}"${f === fam ? ' selected' : ''}>${esc(famNome(f))}</option>`).join('')}</select>
          <select id="insFab" aria-label="Fabricante"><option value="">Todos os fabricantes</option>${fabs.map((f) => `<option${f === fab ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <select id="insSit" aria-label="Situação"><option value="">Toda situação</option><option value="pend"${sit === 'pend' ? ' selected' : ''}>Com pendência</option><option value="vencido"${sit === 'vencido' ? ' selected' : ''}>Preço vencido (mais de ${C.validadeDias} dias)</option><option value="semdata"${sit === 'semdata' ? ' selected' : ''}>Preço sem data de atualização</option>${SITUACOES.map(([k, lb]) => `<option value="${k}"${sit === k ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" id="insSem"${sem ? ' checked' : ''}> Só sem preço</label>
          <label class="chk"><input type="checkbox" id="insFavF"${soFav ? ' checked' : ''}> ★ Favoritos</label>
          <span style="flex:1"></span>
          ${listaFerramentas('insumos', INS_COLS, true)}
          <button class="btn sm" id="insCsv">Exportar CSV</button>
          ${ed ? `<button class="btn sm" id="insLote"${selIns.size ? '' : ' disabled'}>Edição em massa (${selIns.size})</button><button class="btn sm pri" id="insNew">+ Novo insumo</button>` : ''}
        </div>
        <p class="sub" style="margin:8px 0">${list.length === all.length ? all.length + ' insumos' : list.length + ' de ' + all.length + ' insumos'}${cel && list.length > shown.length ? ' — mostrando os primeiros ' + shown.length + (shown.length < 400 ? '' : '; refine a busca') : ''}. Clique numa linha para ver ou editar.${ed ? ' Marque as caixas para a edição em massa.' : ''}</p>
        <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr>${ed ? `<th><input type="checkbox" id="insSelAll" aria-label="Marcar os visíveis"></th>` : ''}<th></th>${th('codigo', 'Código')}${cv('fam', '<th>Família</th>')}${th('produto', 'Produto')}${cv('fab', '<th>Fabricante</th>')}${cv('tipo', '<th>Tipo/config.</th>')}${cv('valor', th('valor', 'Valor'))}${cv('origem', '<th>Origem</th>')}${cv('upd', th('upd', 'Preço atualizado em'))}</tr></thead><tbody>${rows || `<tr><td colspan="${ed ? 10 : 9}" class="sub">Nenhum insumo com esse filtro.</td></tr>`}</tbody></table></div>
        ${cel ? '' : listaPaginas('insumos', list.length, pgN, tam)}
        ${cel && list.length > shown.length && shown.length < 400 ? `<div class="docbar" style="margin-top:8px"><button class="btn" data-insmais>Mostrar mais ${Math.min(80, list.length - shown.length)}</button></div>` : ''}
      </section>`;
  }
  // edição em massa: escolhe o campo, vê a prévia e o impacto, confirma; fica no histórico e pode ser desfeita
  function loteModal() {
    const ids = [...selIns].filter((id) => REG.insumos.some((x) => x.id === id)); if (!ids.length) return;
    const recs = ids.map((id) => REG.insumos.find((x) => x.id === id)); const U = usoIndex();
    const CAMPOS = [['situacao', 'Situação'], ['fab', 'Fabricante'], ['tipo', 'Tipo/config.'], ['origem', 'Origem (NAC/IMP)'], ['reajuste', 'Reajuste de preço (%)'], ['dataCot', 'Data da cotação'], ['fonte', 'Origem do preço']];
    modal(`<h2>Edição em massa · ${ids.length} insumo(s)</h2>
      <div class="fields"><div class="f"><label for="ltCampo">Campo</label><select id="ltCampo">${CAMPOS.map(([k, lb]) => `<option value="${k}">${esc(lb)}</option>`).join('')}</select></div><div class="f span2" id="ltValWrap"></div></div>
      <div id="ltPrev"></div><p class="sub" style="margin:0">O nome (descrição técnica) não se edita em massa: ele é a chave das fórmulas. Cada alteração fica no histórico e o lote inteiro pode ser desfeito em Configurações → Histórico.</p>
      <div style="display:flex;gap:8px"><button class="btn pri" id="ltOk" disabled>Aplicar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      const g = (s) => $(s, o);
      const drawVal = () => { const k = g('#ltCampo').value;
        g('#ltValWrap').innerHTML = `<label for="ltVal">Novo valor</label>` + (k === 'situacao' ? `<select id="ltVal">${SITUACOES.map(([s, lb]) => `<option value="${s}">${esc(lb)}</option>`).join('')}</select>` : k === 'origem' ? '<select id="ltVal"><option>NAC</option><option>IMP</option></select>' : k === 'dataCot' ? '<input id="ltVal" type="date">' : `<input id="ltVal"${k === 'reajuste' ? ' inputmode="decimal" placeholder="ex.: 5 ou -3"' : ''}>`);
        g('#ltVal').oninput = prev; g('#ltVal').onchange = prev; prev(); };
      let ch = [];
      const prev = () => { const k = g('#ltCampo').value; const raw = g('#ltVal').value.trim(); ch = [];
        for (const x of recs) { let para;
          if (k === 'reajuste') { const p = parseInput(raw, 'num'); if (typeof p !== 'number' || typeof x.valor !== 'number') continue; para = Math.round(x.valor * (1 + p / 100) * 100) / 100; ch.push({ id: x.id, campos: { valor: para }, de: { valor: x.valor }, nome: x.produto, uso: U.de(x).length }); continue; }
          para = k === 'situacao' || k === 'origem' || k === 'dataCot' ? raw : raw.toUpperCase(); if (k === 'fonte') para = raw; if (!raw) continue;
          if ((x[k] ?? (k === 'situacao' ? 'ativo' : '')) === para) continue; ch.push({ id: x.id, campos: { [k]: para }, de: { [k]: x[k] ?? null }, nome: x.produto, uso: U.de(x).length }); }
        const k2 = k === 'reajuste' ? 'valor' : k;
        g('#ltPrev').innerHTML = ch.length ? `<div class="tw" style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th>Insumo</th><th>Atual</th><th>Novo</th><th>Em uso</th></tr></thead><tbody>${ch.map((c) => `<tr><td><b>${esc(c.id)}</b> ${esc(c.nome)}</td><td class="n">${esc(fmtVal(c.de[k2]))}</td><td class="n"><b>${esc(fmtVal(c.campos[k2]))}</b></td><td>${c.uso ? `<span class="pill warn">${c.uso} uso(s)</span>` : '<span class="sub">—</span>'}</td></tr>`).join('')}</tbody></table></div>${k === 'situacao' && ['inativo', 'descontinuado'].includes(raw) && ch.some((c) => c.uso) ? '<div class="banner warn" style="margin:6px 0 0">Itens em uso continuam no cálculo das estruturas e propostas; só saem das listas de escolha.</div>' : ''}` : '<p class="sub" style="margin:0">Nada muda com esse valor.</p>';
        g('#ltOk').disabled = !ch.length; g('#ltOk').textContent = 'Aplicar em ' + ch.length; };
      g('#ltCampo').onchange = drawVal; drawVal();
      g('#ltOk').onclick = async () => { const b = g('#ltOk'); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: alterar ' + ch.length + ' insumo(s)'; return; } b.disabled = true;
        try { const r = await REG.saveInsumosLote(ch.map((c) => ({ id: c.id, campos: c.campos, de: c.de })), CAMPOS.find((x) => x[0] === g('#ltCampo').value)[1] + ' em ' + ch.length + ' insumo(s)', 'Edição em massa'); selIns.clear(); close(); render(); toast(r.n + ' insumo(s) alterado(s). Para desfazer: Configurações → Histórico.'); }
        catch (er) { b.disabled = false; toast(errMsg(er)); } };
    });
  }
  document.addEventListener('click', (e) => {
    const fv = e.target.closest('[data-insfav]'); if (fv) { e.stopPropagation(); favToggle(fv.dataset.insfav); render(); return; }
    if (e.target.closest('[data-insmais]')) { ui.insLim = Math.min(400, (ui.insLim || 80) + 80); render(); return; }
    const so = e.target.closest('[data-insord]'); if (so) { ui.insOrd = so.dataset.insord; ui.pg_insumos = 1; render(); return; }
    if (e.target.closest('[data-inssemdata]')) { ui.insSit = 'semdata'; ui.pg_insumos = 1; render(); return; }
    if (e.target.closest('[data-insvenc]')) { ui.insSit = 'vencido'; ui.pg_insumos = 1; ui.insOrd = 'upd'; ui.pg_insumos = 1; render(); return; }
    if (e.target.closest('[data-insids]')) { ui.insIds = null; render(); return; }
    if (e.target.closest('#insLote')) { loteModal(); return; }
    const dz = e.target.closest('[data-desfaz]'); if (dz) { const h = REG.historico.find((x) => x.at === dz.dataset.desfaz && String(x.ref) === dz.dataset.ref); if (!h) return;
      if (!dz.dataset.sure) { dz.dataset.sure = 1; dz.textContent = 'confirmar: desfazer este lote'; return; }
      REG.desfazerLote(h).then((r) => toast(r.n + ' insumo(s) voltaram' + (r.conflito.length ? '; ' + r.conflito.length + ' já tinham mudado de novo e ficaram como estão' : ''))).catch((er) => toast(errMsg(er))); }
  }, true);
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-inssel]'); if (s) { if (s.checked) selIns.add(s.dataset.inssel); else selIns.delete(s.dataset.inssel); const b = $('#insLote'); if (b) { b.disabled = !selIns.size; b.textContent = 'Edição em massa (' + selIns.size + ')'; } return; }
    if (e.target.id === 'insSelAll') { document.querySelectorAll('[data-inssel]').forEach((c) => { c.checked = e.target.checked; if (c.checked) selIns.add(c.dataset.inssel); else selIns.delete(c.dataset.inssel); }); const b = $('#insLote'); if (b) { b.disabled = !selIns.size; b.textContent = 'Edição em massa (' + selIns.size + ')'; } return; }
    if (e.target.id === 'insFab') { ui.insFab = e.target.value; ui.pg_insumos = 1; render(); } else if (e.target.id === 'insSit') { ui.insSit = e.target.value; ui.pg_insumos = 1; render(); } else if (e.target.id === 'insFavF') { ui.insFav = e.target.checked; ui.pg_insumos = 1; render(); }
  });
  // ---------- ficha do insumo (REV22): campos por família, descrição gerada, três descrições, duplicidade, fornecedores, equivalentes ----------
  const FAMS_F = window.PricerFamilias;
  const famCfg = () => (((REG.tabelas || {}).FAM_CAMPOS || {}).fams) || {};
  FAMS_F.cfgFn = famCfg;
  // sinônimos e abreviações para a busca (ponto de partida: as grafias que o documento de padrões já unificou)
  const SIN_PADRAO = { TRIF: ['TRIFASICO', 'TRI'], '2P': ['2 POLOS'], '4P': ['4 POLOS'], '6P': ['6 POLOS'], IP55: ['IP-55', 'IPW55'], TROCADOR: ['TROCADOR DE CALOR'], ELETRICO: ['ELETRICA'], MOTOBOMBA: ['CMB', 'CONJUNTO MOTOBOMBA'], 'C/': ['COM'] };
  const sinonimos = () => (((REG.tabelas || {}).SINONIMOS || {}).map) || SIN_PADRAO;
  const SITUACOES = [['ativo', 'Ativo', 'ok'], ['provisorio', 'Provisório', 'warn'], ['validacao', 'Aguardando validação técnica', 'warn'], ['preco', 'Aguardando preço', 'warn'], ['inativo', 'Inativo', 'mute'], ['descontinuado', 'Descontinuado', 'bad']];
  const situ = (i) => (i && i.situacao) || 'ativo';
  const situPillIns = (i) => { const s = SITUACOES.find((x) => x[0] === situ(i)) || SITUACOES[0]; return s[0] === 'ativo' ? '' : `<span class="pill ${s[2]}">${esc(s[1])}</span>`; };
  const foraDeUso = (i) => ['inativo', 'descontinuado'].includes(situ(i));
  // histórico de preço de um insumo: alterações na ficha, importações e edições em massa
  function historicoPreco(ins) {
    const out = [];
    for (const h of REG.historico || []) for (const m of h.mudancas || []) {
      const c = String(m.campo || '');
      const hit = (h.ref === ins.id && /^valor$/i.test(c)) || c === ins.id + ' · valor' || (c.startsWith(ins.id + ' · ') && /Importação|Mão de obra|critério/i.test(h.tipo + ' ' + (h.desc || '')));
      if (hit && (typeof m.para === 'number' || typeof m.de === 'number')) out.push({ at: h.at, by: h.by, de: m.de, para: m.para, fonte: h.tipo === 'Insumo' ? (ins.fonte || 'ficha do insumo') : m.de == null && h.ref === ins.id ? 'cadastro do insumo' : h.desc || h.tipo });
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  // renomear sem quebrar o motor: estruturas (insumo fixo) e tabelas por porte com o nome exato acompanham;
  // nomes montados pela estrutura (prefixo + porte) ou saídos de fórmula não podem ser renomeados por aqui
  function renomeImpacto(rec, novo) {
    const old = rec.produto; const fix = {}; const bloqueios = []; const put = (sh, a) => { (fix[sh] = fix[sh] || {})[a] = novo; };
    for (const x of recLines()) {
      if ((x.tipo === 'FIXO' || x.tipo === 'SPLIT') && x.campo === old) put(MO, REC_COLS.campo + x.r);
      if (x.tipo === 'TAMANHO' && x.fam === rec.fam) for (let r = 157; r <= 166; r++) { const n = val(MO, 'D' + r); if (n !== null && String(x.pre || '') + fmtPlain(n) + String(x.suf || '') === old) bloqueios.push(`a estrutura "${x.rot}" monta este nome (prefixo + porte); mude o prefixo da estrutura em vez de renomear o insumo`); }
    }
    const tab = (sh, r1, r2, c1, c2) => { for (let r = r1; r <= r2; r++) for (let c = colToNum(c1); c <= colToNum(c2); c++) { const a = numToCol(c) + r; if (val(sh, a) !== old) continue; if (isFormulaBase(sh, a)) bloqueios.push(`${sh} ${a} calcula este nome por fórmula`); else put(sh, a); } };
    tab(MO, 157, 166, 'B', 'M'); tab(MO, 172, 187, 'B', 'G'); tab('KIT HIDRÁULICA', 4, 32, 'A', 'Q');
    const kits = REG.kitMotor.concat(REG.kitBomba).filter((k) => k.desc === old);
    const u = ondeUsado(rec);
    return { fix, bloqueios: [...new Set(bloqueios)], kits, props: u.props.length, fech: u.fech.length, nCel: Object.values(fix).reduce((t, o) => t + Object.keys(o).length, 0) };
  }
  async function aplicarRenome(rec, novo) {
    const imp = renomeImpacto(rec, novo); if (imp.bloqueios.length) throw new Error('Não dá para renomear: ' + imp.bloqueios[0]);
    const ren = await REG.renameInsumos([{ id: rec.id, de: rec.produto, produto: novo }], 'Renomeado: ' + rec.produto + ' → ' + novo);
    await REG.setTable('RENOMES', { map: Object.assign({}, renomes(), ren, { [rec.produto]: novo }) }, 'Nome antigo → novo: ' + novo, [{ campo: rec.produto, de: null, para: novo }]);
    for (const [sh, ch] of Object.entries(imp.fix)) await REG.setCells(sh, ch, 'Renomeado nas estruturas e tabelas: ' + novo, baseOf(sh));
    return imp;
  }
  // custo total de aquisição de cada fornecedor, na mesma base (R$ por unidade): preço × câmbio × (1 + impostos) + frete
  function custoTotalForn(f) {
    const moeda = f.moeda || 'BRL'; const cambio = moeda === 'BRL' ? 1 : (typeof f.cambio === 'number' && f.cambio > 0 ? f.cambio : null);
    if (typeof f.preco !== 'number' || cambio === null) return null;
    return f.preco * cambio * (1 + (typeof f.impostos === 'number' ? f.impostos : 0)) + (typeof f.frete === 'number' ? f.frete : 0);
  }
  // ---------- folha de dados técnica no cadastro (motor e bomba) e desenhos das famílias de equipamento e modelos prontos ----------
  // ficam nos documentos, ligados ao insumo (insumos: [id]) ou à família/modelo; a proposta puxa daqui a folha de dados de cada item
  const FDTEC = 'folha de dados técnica', DESENHO = 'desenho do equipamento';
  const FDTEC_FAM = { 1: 'motor', 10: 'motor', 11: 'bomba', 12: 'bomba', 13: 'bomba' };
  const fdtLocal = {}; // gravações recentes, até o documento compartilhado chegar
  const docsTodos = () => { const L = (SPV.docs() || []).slice(); for (const d of Object.values(fdtLocal)) { const i = L.findIndex((x) => x.id === d.id); if (i >= 0) L[i] = Object.assign({}, L[i], d); else L.unshift(d); } return L; };
  const fdTecDe = (insId) => docsTodos().find((d) => d.tipo === FDTEC && (d.insumos || []).includes(insId)) || null;
  // chave do cadastro de um componente: insumo (id), kit de bomba (kb:id) ou kit de motor (km:id)
  const chaveCad = (desc) => { const ins = insPorProduto(desc); if (ins) return ins.id; const kb = (REG.kitBomba || []).find((k) => k.desc === desc); if (kb) return 'kb:' + kb.id; const km = (REG.kitMotor || []).find((k) => k.desc === desc); if (km) return 'km:' + km.id;
    // sem nome exato (descrição digitada mais curta): aceita um único item do cadastro que comece com o mesmo texto
    const D0 = upNoAc(desc).trim(); if (D0.length < 6) return null; const com = (n) => upNoAc(n).startsWith(D0 + ' ');
    const i2 = REG.insumos.filter((x) => com(x.produto)); if (i2.length === 1) return i2[0].id;
    const k2 = (REG.kitBomba || []).filter((k) => com(k.desc)); if (k2.length === 1 && !i2.length) return 'kb:' + k2[0].id;
    const m2 = (REG.kitMotor || []).filter((k) => com(k.desc)); if (m2.length === 1 && !i2.length) return 'km:' + m2[0].id; return null; };
  const nomeCad = (key) => { if (/^kb:/.test(key)) return ((REG.kitBomba || []).find((k) => 'kb:' + k.id === key) || {}).desc || key; if (/^km:/.test(key)) return ((REG.kitMotor || []).find((k) => 'km:' + k.id === key) || {}).desc || key; return (REG.insumos.find((x) => x.id === key) || {}).produto || key; };
  const usoCad = (key) => (/^km:/.test(key) ? 'motor' : /^kb:/.test(key) ? 'bomba' : FDTEC_FAM[H.famCode((REG.insumos.find((x) => x.id === key) || {}).fam)] || 'bomba');
  const desenhosDe = (filtro) => docsTodos().filter((d) => d.tipo === DESENHO && filtro(d));
  // da bomba, só o que é construtivo (não depende da curva nem da condição de operação)
  const CONSTR_SEC = /construct|material|listing|approval|weight|additional information|seal|^testing$|construção|materia|peso|vedação|listagem|testes/i;
  const DESEMP_SEC = /performance|limit|operating|operation|liquid|nfpa|pressure data|driver data|mechanical|condi|líquido/i;
  const CONSTR_CAMPO = /flange|stages|estágios|casing pressure|impeller d|number of stages/i;
  const MOTOR_SEC = /engine|motor|driver(?! data)|acionador/i;
  function fdTecMarca(dados, uso) {
    const temMotor = (dados.secoes || []).some((s) => MOTOR_SEC.test(s.t));
    for (const s of dados.secoes || []) {
      const ok = uso === 'motor' ? (!temMotor || MOTOR_SEC.test(s.t)) : !MOTOR_SEC.test(s.t) && (CONSTR_SEC.test(s.t) || !DESEMP_SEC.test(s.t));
      for (const c of s.campos || []) c.on = s.t !== 'Project' && String(c.v || '').trim() !== '' && ok && (uso === 'motor' || CONSTR_SEC.test(s.t) || CONSTR_CAMPO.test(c.k));
    }
    return { fabricante: dados.fabricante || '', secoes: (dados.secoes || []).filter((s) => s.t !== 'Project') };
  }
  function fdTecHtml(insId) {
    const ed = canEd(); const ro = ed ? '' : ' disabled'; const d = fdTecDe(insId); const uso = usoCad(insId);
    const intro = `<p class="sub" style="margin:0 0 6px">${uso === 'motor' ? 'Folha de dados do motor: entra na folha de dados de toda proposta que usar este motor (também dentro de skid e container).' : 'Dados construtivos da bomba (flanges, materiais, rotação, rolamento, vedação, pesos, listagens): entram na folha de dados de toda proposta que usar esta bomba. O que depende da curva e da condição de operação fica na proposta.'}</p>`;
    if (!d) return intro + (ed ? `<label class="drop" for="fdtup_${esc(insId)}"><b>Solte aqui o PDF da folha de dados ${uso === 'motor' ? 'do motor' : 'da bomba'}</b><span class="sub">o app lê e você marca o que vai para a proposta</span><input id="fdtup_${esc(insId)}" type="file" accept=".pdf" data-fdtup="${esc(insId)}" hidden></label>` : '<p class="sub">Sem folha cadastrada.</p>');
    const F0 = d.fdTec || { secoes: [] }; const n = F0.secoes.reduce((t, s) => t + s.campos.length, 0), on = F0.secoes.reduce((t, s) => t + s.campos.filter((c) => c.on !== false).length, 0);
    return intro + `<div class="kv pcro"><div>Arquivo</div><div>${esc(d.nome || '')} <button class="linkbtn" data-fdopen="${esc(d.id)}">abrir</button>${ed ? ` · <button class="linkbtn" data-fdttira="${esc(insId)}">tirar</button>` : ''}</div><div>Lido</div><div>${esc(F0.fabricante || '—')} · ${F0.secoes.length} seções · ${on} de ${n} campos vão para a proposta</div></div>
      ${F0.secoes.map((s, si) => `<details class="sub2"><summary>${esc(s.t)}${window.PricerFabricante && window.PricerFabricante.secT(s.t, 'pt') && window.PricerFabricante.secT(s.t, 'pt') !== s.t ? ' <span class="sub">· ' + esc(window.PricerFabricante.secT(s.t, 'pt')) + '</span>' : ''} <span class="sub">${s.campos.filter((c) => c.on !== false).length}/${s.campos.length}</span></summary>
        <div class="tw"><table class="t"><thead><tr><th>Vai</th><th>Campo</th><th>Valor</th></tr></thead><tbody>${s.campos.map((c, ci) => `<tr><td><input type="checkbox" data-fdton="${esc(insId)}|${si}|${ci}"${c.on !== false ? ' checked' : ''}${ro} aria-label="Incluir ${esc(c.k)}"></td><td>${esc(c.k)}</td><td class="in"><input data-fdtv="${esc(insId)}|${si}|${ci}" value="${esc(c.v)}"${ro} aria-label="Valor de ${esc(c.k)}"></td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
  }
  const fdtRefresh = (insId) => { const el = document.getElementById('fdtBox'); if (el && el.dataset.fdtins === insId) el.innerHTML = fdTecHtml(insId); };
  async function fdtGrava(d) { fdtLocal[d.id] = d; const meta = Object.assign({}, d); await SPV.salvarDoc(meta); }
  document.addEventListener('change', async (e) => {
    const t = e.target; if (!t.dataset) return; const ds = t.dataset;
    if (ds.fdtup) { const insId = ds.fdtup; const file = t.files && t.files[0]; t.value = ''; if (!file || !canEd()) return;
      try { toast('Lendo a folha de dados…'); const uso = usoCad(insId);
        const dados = window.PricerFabricante.ler(await window.PricerLeitor.itensPdf(file, 30, toast)); const fdTec = fdTecMarca(dados, uso);
        const id = await SPV.salvarDoc({ tipo: FDTEC, nome: file.name, insumos: [insId], uso, fdTec, etapa: 'Cadastro', notas: 'Folha de dados técnica · ' + nomeCad(insId), itens: [] }, file);
        fdtLocal[id] = Object.assign({ id }, (SPV.docs() || []).find((x) => x.id === id) || { tipo: FDTEC, nome: file.name, insumos: [insId], uso, fdTec });
        fdtRefresh(insId); toast(fdTec.secoes.length ? 'Folha lida: confira o que vai para a proposta' : 'Folha guardada; não reconheci campos'); } catch (er) { toast(errMsg(er)); }
      return; }
    if (ds.fdton || ds.fdtv) { if (!canEd()) return; const [insId, si, ci] = (ds.fdton || ds.fdtv).split('|'); const d0 = fdTecDe(insId); if (!d0) return; const d = JSON.parse(JSON.stringify(d0)); const c = d.fdTec.secoes[+si].campos[+ci];
      if (ds.fdton) c.on = t.checked; else c.v = t.value.trim(); try { await fdtGrava(d); if (ds.fdton) fdtRefresh(insId); } catch (er) { toast(errMsg(er)); } return; }
    if (ds.desup) { const [tipo, chave] = ds.desup.split('|'); const file = t.files && t.files[0]; t.value = ''; if (!file || !canEd()) return;
      try { const meta = { tipo: DESENHO, nome: file.name, etapa: 'Cadastro', itens: [], notas: 'Desenho · ' + chave }; meta[tipo === 'modelo' ? 'modelo' : 'equip'] = chave; const id = await SPV.salvarDoc(meta, file); fdtLocal[id] = Object.assign({ id }, meta);
        const box = document.getElementById('desBox'); if (box) box.innerHTML = desenhosHtml(box.dataset.equip); toast('Desenho guardado'); } catch (er) { toast(errMsg(er)); } }
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fdttira],[data-destira]'); if (!b || !canEd()) return;
    if (b.dataset.fdttira) { const d = fdTecDe(b.dataset.fdttira); if (!d || !await DLG.confirmar('Tirar a folha de dados técnica deste insumo? O arquivo continua nos documentos.')) return;
      const d2 = Object.assign({}, d, { tipo: 'folha de dados (retirada do cadastro)' }); try { await fdtGrava(d2); fdtRefresh(b.dataset.fdttira); } catch (er) { toast(errMsg(er)); } return; }
    const d = docsTodos().find((x) => x.id === b.dataset.destira); if (!d || !await DLG.confirmar('Tirar este desenho do cadastro? O arquivo continua nos documentos.')) return;
    try { await fdtGrava(Object.assign({}, d, { tipo: 'desenho (retirado do cadastro)' })); const box = document.getElementById('desBox'); if (box) box.innerHTML = desenhosHtml(box.dataset.equip); } catch (er) { toast(errMsg(er)); }
  });
  // desenhos da família de equipamento (vale para todos os itens dela) e de cada modelo pronto (vale só para o modelo)
  function desenhosHtml(equip) {
    const ed = canEd(); const lista = (L) => L.map((d) => `<span class="pill mute">${esc(d.nome)}</span> <button class="linkbtn" data-fdopen="${esc(d.id)}">abrir</button>${ed ? ` <button class="linkbtn" data-destira="${esc(d.id)}">tirar</button>` : ''}`).join(' ');
    const up = (tipo, chave, lb) => (ed ? `<label class="btn sm" for="desup_${esc(tipo + chave).replace(/\W/g, '')}">${lb}</label><input id="desup_${esc(tipo + chave).replace(/\W/g, '')}" type="file" accept=".pdf,image/*" data-desup="${esc(tipo)}|${esc(chave)}" hidden>` : '');
    const fam = desenhosDe((d) => d.equip === equip); const mods = modelos().filter((m) => m.estr === equip);
    return `<p class="sub" style="margin:0 0 6px">O desenho entra na folha de dados da proposta: o do modelo pronto quando o item usa aquele modelo; senão, o da família.</p>
      <div class="docbar" style="margin-bottom:8px"><b>Família</b> ${lista(fam) || '<span class="sub">sem desenho</span>'} ${up('equip', equip, 'Anexar desenho da família')}</div>
      ${mods.length ? `<div class="tw" style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th>Modelo pronto</th><th>Desenho</th><th></th></tr></thead><tbody>${mods.map((m) => `<tr><td>${esc(m.nome)}</td><td>${lista(desenhosDe((d) => d.modelo === m.nome)) || '<span class="sub">—</span>'}</td><td>${up('modelo', m.nome, 'Anexar')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Nenhum modelo pronto nesta família.</p>'}`;
  }
  // ---------- certificação do item (UL listado / FM aprovado): marcada no cadastro, citada na proposta ----------
  const CERTS = [['UL', 'UL Listed'], ['FM', 'FM Approved']];
  const certHtml = (pre, cert, ro) => `<div class="chks" style="display:flex;gap:14px;flex-wrap:wrap">${CERTS.map(([c, lb]) => `<label class="chk"><input type="checkbox" id="${pre}Cert${c}" data-cert="${c}"${String(cert || '').split(/\W+/).includes(c) ? ' checked' : ''}${ro}> ${lb}</label>`).join('')}</div><small class="sub">sai na descrição do item na proposta</small>`;
  const certLer = (g, pre = 'f') => { const v = CERTS.map(([c]) => c).filter((c) => { const el = g('#' + pre + 'Cert' + c); return el && el.checked; }); return v.length ? v.join(' / ') : undefined; };
  const CERT_TXT = { pt: { UL: 'Listado UL', FM: 'Aprovado FM' }, en: { UL: 'UL Listed', FM: 'FM Approved' }, es: { UL: 'Listado UL', FM: 'Aprobado FM' } };
  const certLinha = (cert, lang) => { const L = String(cert || '').split(/\W+/).filter((c) => CERT_TXT.pt[c]); return L.length ? L.map((c) => (CERT_TXT[lang] || CERT_TXT.pt)[c]).join(' · ') : ''; };
  // ---------- texto do escopo da proposta: no cadastro do item (insumo ou kit) ou, na falta, o padrão da família de insumo ----------
  const GRUPOS_ESC = ['Bomba', 'Acionador', 'Painel de comando', 'Bomba jockey', 'Acessórios', 'Testes e ensaios', 'Documentos e desenhos', 'Serviços', 'Comercial'];
  // texto padrão (escopo-padrao.js): título e linhas por família e por tipo, em pt/en/es; grupo de cada família
  const EP = window.PRICER_ESCOPO_PADRAO || { grupos: {}, fams: {}, tipos: {} };
  const GRUPO_PAD = Object.fromEntries(Object.entries(EP.fams).map(([k, v]) => [k, v.grupo]));
  const FORA_ESC = new Set([32, 33, 34, 37]); // miscelâneas, kit de instalação, mão de obra, embalagem: só entram se tiverem texto cadastrado
  const escTab = () => (REG.tabelas || {}).ESCOPO_PROPOSTA || {};
  const escItem = (key) => ((escTab().itens || {})[key]) || '';
  const escFam = (code) => ((escTab().fams || {})[code]) || {};
  async function escSalvar(fn, rot) { const t = JSON.parse(JSON.stringify(escTab())); t.itens = t.itens || {}; t.fams = t.fams || {}; fn(t); await REG.setTable('ESCOPO_PROPOSTA', t, 'Escopo da proposta: ' + rot, [{ campo: rot, de: null, para: 'alterado' }]); }
  const escCampoHtml = (key, fam) => { const ed = canEd(); const fe = escFam(H.famCode(fam)); return `<div class="f spanall"><label for="escit_${esc(key).replace(/\W/g, '')}">Descrição no escopo da proposta <span class="sub">uma linha por item da descrição; {marca}, {modelo} e {qtd} são trocados</span></label><textarea id="escit_${esc(key).replace(/\W/g, '')}" data-escit="${esc(key)}" rows="3" placeholder="${esc(fe.t || ((EP.fams[H.famCode(fam)] || {}).t || {}).pt || 'vazio = texto padrão da família (ou só a marca e o modelo)')}"${ed ? '' : ' disabled'}>${esc(escItem(key))}</textarea><small class="sub">Grupo no escopo: ${esc(fe.grupo || GRUPO_PAD[H.famCode(fam)] || 'Acessórios')} (definido na família de insumo)</small></div>`; };
  document.addEventListener('change', async (e) => { const t = e.target; if (!t.dataset || t.dataset.escit === undefined || !canEd()) return; const key = t.dataset.escit; const v = t.value.trim();
    try { await escSalvar((T) => { if (v) T.itens[key] = v; else delete T.itens[key]; }, nomeCad(key)); toast('Descrição do escopo salva'); } catch (er) { toast(errMsg(er)); } });
  const preencher = (tpl, o) => String(tpl).replace(/\{marca\}/g, o.marca || '').replace(/\{modelo\}/g, o.modelo || '').replace(/\{qtd\}/g, o.qtd || '').replace(/\s+/g, ' ').replace(/^[\s·:-]+|[\s·:-]+$/g, '').trim();
  // ---------- escopo de fornecimento no padrão da proposta LS Fire (PTC): título do componente e linhas "Rótulo: valor" ----------
  // Cada valor vem do que o app sabe: a formação (descrição padronizada do insumo ou do kit, as outras linhas do item, a norma
  // e o painel da descrição do equipamento), as características e a certificação do cadastro e as folhas técnicas da bomba e
  // do motor. Linha sem valor não entra. Os textos-padrão da LS Fire (material, pintura, comunicação do painel…) estão em
  // ESC_STD e valem até a folha técnica ou a especificação do item dizer outra coisa. Texto cadastrado no item ou na família
  // (Cadastro → Na proposta) continua tendo prioridade.
  const ESC_STD = { material: 'Padrão (compatível com água limpa)', pinturaBomba: 'Padrão Fornecedor — Cor: Vermelho Padrão Fornecedor', pinturaJockey: 'Padrão Fabricante — Cor: Padrão Fabricante',
    painelLocal: 'Padrão LS Fire', comunicacao: 'Contato Seco (Sem protocolo)', ipPainel: 'IP-65', solto: 'fornecido solto e embalado' };
  // rótulos e valores fixos em inglês e espanhol (o resto passa pela tradução da proposta)
  const ESC_TR = {
    en: { 'Bomba Centrífuga': 'Centrifugal Pump', 'Bomba Jockey': 'Jockey Pump', Motobomba: 'Pump set', 'Motor Diesel': 'Diesel Engine', 'Motor Elétrico': 'Electric Motor', 'Tanque de combustível diesel': 'Diesel fuel tank', 'Painel de comando do conjunto diesel': 'Diesel fire pump controller', 'Painel de comando do conjunto elétrico': 'Electric fire pump controller', 'Painel de comando da bomba jockey': 'Jockey pump controller', Baterias: 'Batteries', 'Manômetro e Manovacuômetro': 'Pressure and compound gauges', Manômetro: 'Pressure gauge', Manovacuômetro: 'Compound gauge', 'Válvula de alívio de carcaça': 'Casing relief valve',
      Tipo: 'Type', Marca: 'Make', Modelo: 'Model', Material: 'Material', Sucção: 'Suction', Recalque: 'Discharge', Vedação: 'Seal', Lubrificação: 'Lubrication', Rotação: 'Rotation', Pintura: 'Paint', Potência: 'Power', Injeção: 'Injection', Resfriamento: 'Cooling', Acoplamento: 'Coupling', 'Painel local': 'Local panel', 'Tensão cont.': 'Control voltage', 'Kit pré-aq.': 'Pre-heater kit', 'Número de Polos': 'Number of poles', Frequência: 'Frequency', 'Grau de Proteção': 'Protection', 'Tensão alim.': 'Supply voltage', 'Grau Prot.': 'Protection', 'Leit. pressão': 'Pressure sensing', Comunicação: 'Communication', 'Norma/Cert.': 'Standard/Listing', Volume: 'Volume', Certificação: 'Listing', 'Ponto de trabalho': 'Duty point',
      'fornecido solto e embalado': 'supplied loose and packed', 'anexo ao motor': 'attached to the engine', 'Flexível de escape': 'Exhaust flexible', 'Silencioso Industrial': 'Industrial silencer', Mecânica: 'Mechanical', Eletrônica: 'Electronic', Radiador: 'Radiator', 'Trocador de calor': 'Heat exchanger', 'Por transdutor': 'Pressure transducer', 'Por pressostato': 'Pressure switch', 'Contato Seco (Sem protocolo)': 'Dry contacts (no protocol)', 'NL (Não listado)': 'NL (not listed)', 'Padrão LS Fire': 'LS Fire standard', 'Padrão (compatível com água limpa)': 'Standard (suitable for clean water)', 'Padrão Fornecedor — Cor: Vermelho Padrão Fornecedor': 'Supplier standard — Color: supplier standard red', 'Padrão Fabricante — Cor: Padrão Fabricante': 'Manufacturer standard — Color: manufacturer standard', Sim: 'Yes', monofásico: 'single-phase', trifásico: 'three-phase', Cilindros: 'cylinders', 'Horário (Clockwise — RH)': 'Clockwise (RH)', 'Anti-horário (Counterclockwise — LH)': 'Counterclockwise (LH)', Gaxeta: 'Packing', 'Selo mecânico': 'Mechanical seal', Graxa: 'Grease', Óleo: 'Oil',
      'Mancalizada (end-suction)': 'Bare shaft (end suction)', 'Bipartida (split case)': 'Horizontal split case', 'Mancalizada (multiestágio)': 'Bare shaft (multistage)', 'Monobloco (end-suction)': 'Close-coupled (end suction)', 'Vertical tipo turbina': 'Vertical turbine', 'Monobloco (multiestágio)': 'Close-coupled (multistage)', Especial: 'Special' },
    es: { 'Bomba Centrífuga': 'Bomba Centrífuga', 'Bomba Jockey': 'Bomba Jockey', Motobomba: 'Motobomba', 'Motor Diesel': 'Motor Diésel', 'Motor Elétrico': 'Motor Eléctrico', 'Tanque de combustível diesel': 'Tanque de combustible diésel', 'Painel de comando do conjunto diesel': 'Tablero de control del conjunto diésel', 'Painel de comando do conjunto elétrico': 'Tablero de control del conjunto eléctrico', 'Painel de comando da bomba jockey': 'Tablero de control de la bomba jockey', Baterias: 'Baterías', 'Manômetro e Manovacuômetro': 'Manómetro y manovacuómetro', Manômetro: 'Manómetro', Manovacuômetro: 'Manovacuómetro', 'Válvula de alívio de carcaça': 'Válvula de alivio de carcasa',
      Tipo: 'Tipo', Marca: 'Marca', Modelo: 'Modelo', Material: 'Material', Sucção: 'Succión', Recalque: 'Descarga', Vedação: 'Sello', Lubrificação: 'Lubricación', Rotação: 'Rotación', Pintura: 'Pintura', Potência: 'Potencia', Injeção: 'Inyección', Resfriamento: 'Refrigeración', Acoplamento: 'Acoplamiento', 'Painel local': 'Tablero local', 'Tensão cont.': 'Tensión de control', 'Kit pré-aq.': 'Kit precalentador', 'Número de Polos': 'Número de polos', Frequência: 'Frecuencia', 'Grau de Proteção': 'Grado de protección', 'Tensão alim.': 'Tensión de alim.', 'Grau Prot.': 'Grado de prot.', 'Leit. pressão': 'Lectura de presión', Comunicação: 'Comunicación', 'Norma/Cert.': 'Norma/Cert.', Volume: 'Volumen', Certificação: 'Certificación', 'Ponto de trabalho': 'Punto de trabajo',
      'fornecido solto e embalado': 'suministrado suelto y embalado', 'anexo ao motor': 'junto al motor', 'Flexível de escape': 'Flexible de escape', 'Silencioso Industrial': 'Silenciador industrial', Mecânica: 'Mecánica', Eletrônica: 'Electrónica', Radiador: 'Radiador', 'Trocador de calor': 'Intercambiador de calor', 'Por transdutor': 'Por transductor', 'Por pressostato': 'Por presostato', 'Contato Seco (Sem protocolo)': 'Contacto seco (sin protocolo)', 'NL (Não listado)': 'NL (no listado)', 'Padrão LS Fire': 'Estándar LS Fire', 'Padrão (compatível com água limpa)': 'Estándar (compatible con agua limpia)', 'Padrão Fornecedor — Cor: Vermelho Padrão Fornecedor': 'Estándar del proveedor — Color: rojo estándar del proveedor', 'Padrão Fabricante — Cor: Padrão Fabricante': 'Estándar del fabricante — Color: estándar del fabricante', Sim: 'Sí', monofásico: 'monofásico', trifásico: 'trifásico', Cilindros: 'cilindros', 'Horário (Clockwise — RH)': 'Horario (Clockwise — RH)', 'Anti-horário (Counterclockwise — LH)': 'Antihorario (Counterclockwise — LH)', Gaxeta: 'Empaquetadura', 'Selo mecânico': 'Sello mecánico', Graxa: 'Grasa', Óleo: 'Aceite',
      'Mancalizada (end-suction)': 'Con soporte (end suction)', 'Bipartida (split case)': 'Bipartida (split case)', 'Mancalizada (multiestágio)': 'Con soporte (multietapa)', 'Monobloco (end-suction)': 'Monobloque (end suction)', 'Vertical tipo turbina': 'Vertical tipo turbina', 'Monobloco (multiestágio)': 'Monobloque (multietapa)', Especial: 'Especial' } };
  const escT = (t, lang) => { if (!lang || lang === 'pt' || !t) return t; const D = ESC_TR[lang] || {}; if (D[t]) return D[t];
    const m = String(t).match(/^(.*?) \((fornecido solto e embalado|anexo ao motor)\)$/); if (m) return escT(m[1], lang) + ' (' + (D[m[2]] || m[2]) + ')';
    const i = String(t).indexOf(': '); if (i > 0) return escT(t.slice(0, i), lang) + ': ' + escT(t.slice(i + 2), lang);
    return String(t).replace(/ - (\d+) Cilindros$/, (x, n) => ' - ' + n + ' ' + (D.Cilindros || 'Cilindros')).replace(/\b(monofásico|trifásico)\b/g, (x) => D[x] || x); };
  const ESC_INTERNO = new Set([14, 19, 22, 31, 36, 38, 40, 41]);
  const TIPO_ESC = { '11|END SUCTION': 'Mancalizada (end-suction)', '11|SPLIT CASE': 'Bipartida (split case)', '11|MULTIESTÁGIO': 'Mancalizada (multiestágio)', '12|MONOBLOCO': 'Monobloco (end-suction)', '12|SPLIT CASE': 'Bipartida (split case)', '12|END SUCTION': 'Mancalizada (end-suction)', '12|VERTICAL TURBINA': 'Vertical tipo turbina', '13|MONOBLOCO': 'Monobloco (multiestágio)' };
  // valor de um campo das folhas técnicas do cadastro (seções marcadas)
  function fdCampo(key, reS, reK) { const doc = key ? fdTecDe(key) : null; for (const sc of ((doc || {}).fdTec || {}).secoes || []) { if (reS && !reS.test(sc.t)) continue; const c = (sc.campos || []).find((x) => x.on !== false && String(x.v || '').trim() && reK.test(x.k)); if (c) return c.v; } return ''; }
  const vPt = (v) => { const FB = window.PricerFabricante; const [a, ...r] = String(v || '').split(' / '); return a ? (((FB && FB.valT(a, 'pt')) || a) + (r.length ? ' / ' + r.join(' / ') : '')) : ''; };
  const rotPt = (v) => (/counter|anti|\bLH\b/i.test(v) ? 'Anti-horário (Counterclockwise — LH)' : /clockwise|horário|\bRH\b/i.test(v) ? 'Horário (Clockwise — RH)' : vPt(v));
  function escopoDoItem(S) {
    const lang = pcGet().idioma || 'pt'; const G = {}; const ks = []; for (let k = 34; k <= 63; k++) ks.push(k); for (let k = 68; k <= 112; k++) ks.push(k);
    const add = (g, ent) => { const L = (G[g] = G[g] || []); const ig = L.find((x) => x.titulo === ent.titulo && JSON.stringify(x.sub) === JSON.stringify(ent.sub)); if (ig && typeof ig.q === 'number' && typeof ent.q === 'number') ig.q += ent.q; else L.push(ent); };
    const comp = upNoAc(txt(S, 'C29') || txt(S, 'C27'));
    const norma = /NFPA\s?20/.test(comp) ? 'NFPA 20' : (comp.match(/NBR\s?(\d{4,5})/) || [])[0]?.replace(/NBR\s?/, 'NBR ') || '';
    // as linhas do item
    const L = [];
    for (const k of ks) {
      const d = txt(S, 'D' + k); const q = qtdNum(val(S, 'F' + k)); if (!d || !(q > 0)) continue;
      const fam = String(txt(S, 'U' + k) || txt(S, 'C' + k) || ''); const code = /^\d\d\./.test(fam) ? +fam.slice(0, 2) : 0;
      const key = chaveCad(d); const ins = key && !/^k[bm]:/.test(key) ? REG.insumos.find((x) => x.id === key) : insPorProduto(d); const kit = key && /^k[bm]:/.test(key) ? ((/^kb:/.test(key) ? REG.kitBomba : REG.kitMotor) || []).find((x) => key.endsWith(':' + x.id)) : null;
      let marca = txt(S, 'E' + k) || (ins && ins.fab) || (kit && kit.marca) || ''; if (/^(VARIOS|VÁRIOS|0|-)$/i.test(marca.trim())) marca = '';
      L.push({ k, d, q, code, key, ins, kit, marca, D: upNoAc(d), usado: false });
      for (const x of kitConteudo(d, q)) L.push({ k, d: x.desc, q: x.q, code: +x.cod, key: null, ins: null, kit: null, marca: '', D: upNoAc(x.desc), usado: false, doKit: true });
    }
    const de = (codes) => L.filter((x) => codes.includes(x.code) && !x.usado);
    // marca como se escreve: palavras curtas (siglas) em maiúsculas, o resto com inicial maiúscula ("SVE Corp", "LS Fire", "Baudouin")
    const marcaTxt = (m) => String(m || '').trim().split(/\s+/).filter(Boolean).map((w) => (w.length <= 3 || /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ').replace(/\bLs Fire\b/i, 'LS Fire').replace(/^Lsfire$/i, 'LS Fire');
    const MARCAS = new Set(REG.insumos.map((i) => upNoAc(i.fab || '').trim()).concat((REG.kitMotor || []).map((k) => upNoAc(k.marca || '').trim())).filter((x) => x.length > 2));
    const certTxt = (x, lg) => certLinha((x.ins && x.ins.cert) || (x.kit && x.kit.cert), lg || 'pt');
    const temUsuario = (x) => (x.key && escItem(x.key)) || (escFam(x.code) || {}).t;
    const usuario = (x) => { const o = { marca: x.marca, modelo: x.d, qtd: nBR(x.q) }; return (escItem(x.key) || escFam(x.code).t).split('\n').map((l) => preencher(l, o)).filter(Boolean); };
    const linha = (rot, v) => (v ? rot + ': ' + v : '');
    const ent = (g, x, titulo, sub, ord) => add(g, { q: x.q, titulo: escT(titulo, lang), sub: sub.filter(Boolean).map((l) => (/^Certificação: /.test(l) ? escT('Certificação', lang) + ': ' + certTxt(x, lang) : escT(l, lang))), ord });
    const esp = especSalva(S)['35'] || {};
    // bombas (principal, motobomba e jockey)
    for (const x of de([11, 12, 13])) {
      x.usado = true; const grupo = x.code === 13 ? 'Bomba jockey' : 'Bomba';
      if (temUsuario(x)) { ent(grupo, x, x.code === 13 ? 'Bomba Jockey' : 'Bomba Centrífuga', usuario(x), 0); continue; }
      const tipoIns = upNoAc((x.ins && x.ins.tipo) || '') || (/SPLIT CASE/.test(comp) ? 'SPLIT CASE' : /END SUCTION/.test(comp) ? 'END SUCTION' : /MONOBLOCO/.test(comp) && x.code === 13 ? 'MONOBLOCO' : '');
      const car = (x.ins && x.ins.caract) || {}; const modelo = car.modelo || car.bomba || (x.code === 13 ? x.d.replace(/\s+\d+(?:[.,]\d+)?\s*(CV|HP)\b.*$/i, '') : x.d);
      const pint = esp.norma || esp.cor ? 'Especial' + (esp.norma ? ' — ' + esp.norma : '') + (esp.cor ? ' — Cor: ' + esp.cor : '') : x.code === 13 ? ESC_STD.pinturaJockey : ESC_STD.pinturaBomba;
      const F = (((pcGet().fd || {})[S]) || {}); const dd = (F.fab || {}).dados || (F.curva || {}).dados;
      const cp = (re) => { for (const sc of (dd || {}).secoes || []) { if (sc.t === 'Project' || /NFPA/i.test(sc.t)) continue; const c = (sc.campos || []).find((y) => y.on !== false && re.test(y.k)); if (c) return c.v; } return ''; };
      const qf = x.code !== 13 ? cp(/^Flow(, rated)?$/) : '', hf = x.code !== 13 ? cp(/^Head$|^Differential head.*\(actual\)$|^Differential head \/ pressure, rated$/) : '';
      ent(grupo, x, x.code === 13 ? 'Bomba Jockey' : x.code === 12 ? 'Motobomba' : 'Bomba Centrífuga', [
        linha('Tipo', TIPO_ESC[x.code + '|' + tipoIns] || ''), linha('Marca', marcaTxt(x.marca)), linha('Modelo', modelo),
        linha('Material', vPt(fdCampo(x.key, /material/i, /casing|carcaça|volute/i)) || ESC_STD.material),
        linha('Sucção', fdCampo(x.key, null, /suction (nozzle|flange diameter)|^sucção/i)), linha('Recalque', fdCampo(x.key, null, /discharge (nozzle|flange diameter)|^recalque/i)),
        linha('Vedação', vPt(fdCampo(x.key, null, /seal type|pump seal|^vedação/i))), linha('Lubrificação', vPt(fdCampo(x.key, null, /lubrication|lubrificação/i))),
        linha('Rotação', rotPt(fdCampo(x.key, null, /direction of rotation|sentido de rotação/i))), linha('Pintura', pint),
        qf && hf ? linha('Ponto de trabalho', qf + ' × ' + hf) : '', linha('Certificação', certTxt(x))], 0);
      // motor da motobomba e da jockey (das características do cadastro)
      if (x.code === 12 && car.acion) ent('Acionador', x, /DIESEL/i.test(car.acion) ? 'Motor Diesel' : 'Motor Elétrico', [linha('Marca', marcaTxt(car.marca || '')), linha('Modelo', car.motor || ''), linha('Potência', car.pot ? car.pot + ' ' + (car.unid || '') : ''), linha('Número de Polos', (car.polos || '').replace(/P$/, ''))], 1);
      // jockey: o motor vem das características do cadastro ou da descrição ("CIS RS-84 4CV"); polos pela rotação do equipamento
      if (x.code === 13) { const pm = x.D.match(/(\d+(?:[.,]\d+)?)\s*(CV|HP)\b/); const pot = car.pot ? car.pot + ' ' + (car.unid || 'CV') : pm ? pm[1] + ' ' + pm[2] : ''; const rpmE = +((comp.match(/JOCKEY[^,]*?(\d{4})\s*RPM/) || [])[1] || 0);
        const polos = rpmE >= 3000 ? '2' : rpmE >= 1500 ? '4' : ''; const hz = car.freq ? car.freq.replace(/HZ$/i, 'Hz') : '60Hz';
        if (pot) ent('Bomba jockey', x, 'Motor Elétrico', [linha('Potência', pot), linha('Número de Polos', polos), linha('Frequência', hz), linha('Grau de Proteção', car.ip || '')], 1); }
    }
    // motor diesel, com o que é dele no item: escape, pré-aquecimento, acoplamento, painel local
    for (const x of de([1])) {
      x.usado = true; if (temUsuario(x)) { ent('Acionador', x, 'Motor Diesel', usuario(x), 1); continue; }
      const car = (x.ins && x.ins.caract) || {}; const D = x.D;
      // descrição fora do padrão ("MOTOR DIESEL SNAT 6HTAA6.5-G22 221HP 1800RPM"): tira o nome da família e a marca escrita nela
      let resto = x.d.replace(/^MOTOR\s+DIESEL\s+/i, '').trim(); let marca = x.marca; const w0 = upNoAc(resto.split(/\s+/)[0]);
      if (MARCAS.has(w0)) { if (!marca) marca = w0; resto = resto.split(/\s+/).slice(1).join(' '); }
      const mod = car.modelo || resto.split(/\s+/)[0]; const cil = car.cil || (D.match(/(\d+)\s*CIL\b/) || [])[1]; const hp = car.hp || (D.match(/(\d+(?:[.,]\d+)?)\s*HP/) || [])[1]; const rpm = car.rpm || (D.match(/(?:HP\s*@?\s*|@\s*)(\d{3,4})\s*RPM/) || [])[1];
      const inj = /\bMEC\b/.test(car.ctrl || D) ? 'Mecânica' : /\bELE/.test(car.ctrl || D.replace(/ELETRIC/g, '')) ? 'Eletrônica' : ''; const res = /TROCADOR/.test(car.arref || D) ? 'Trocador de calor' : /RADIADOR/.test(car.arref || D) ? 'Radiador' : '';
      const vcc = car.vcc || (D.match(/\b(12|24)\s*VCC/) || [])[0] || ''; const vccT = vcc.replace(/(\d+)\s*VCC/i, '$1 VCC');
      const ac = de([18]).find((y) => !y.usado); if (ac) ac.usado = true;
      const pl = L.find((y) => !y.usado && /PAINEL LOCAL/.test(y.D)); if (pl) pl.usado = true;
      const pa = de([26]).find((y) => !y.usado); if (pa) pa.usado = true;
      const esc0 = de([16]).find((y) => !y.usado); if (esc0) esc0.usado = true;
      const fdm = (re) => vPt(fdCampo(x.key, /engine|motor|driver/i, re));
      ent('Acionador', x, 'Motor Diesel', [linha('Marca', marcaTxt(marca)), linha('Modelo', mod + (cil ? ' - ' + cil + ' Cilindros' : '')), linha('Potência', hp ? hp + ' HP' + (rpm ? ' @ ' + rpm + ' rpm' : '') : ''),
        linha('Injeção', inj), linha('Resfriamento', res || fdm(/cooling type/i)), linha('Acoplamento', ac ? (/CARDAN/.test(ac.D) ? 'Tipo cardan' : /PINOS/.test(ac.D) ? 'Elástico de pinos' + (/FLANGE/.test(ac.D) ? ' com flange' : '') : [marcaTxt(ac.marca), ac.d].filter(Boolean).join(' ')) : ''),
        linha('Painel local', pl ? ESC_STD.painelLocal : ''), linha('Tensão cont.', vccT), linha('Kit pré-aq.', pa ? pa.d.replace(/^KIT\s+/i, '') : ''),
        esc0 && /FLEX/.test(esc0.D) ? 'Flexível de escape (anexo ao motor)' : '', esc0 && /SILENC/.test(esc0.D) ? 'Silencioso Industrial (fornecido solto e embalado)' : '', linha('Certificação', certTxt(x))], 1);
    }
    for (const x of de([10])) {
      x.usado = true; if (temUsuario(x)) { ent('Acionador', x, 'Motor Elétrico', usuario(x), 1); continue; }
      const car = (x.ins && x.ins.caract) || {}; const D = x.D;
      const cv = car.cv || (D.match(/(\d+(?:[.,]\d+)?)\s*CV\b/) || [])[1]; const po = (car.polos || (D.match(/\b(\d)\s*P\b/) || [])[0] || '').replace(/\s*P$/, ''); const ip = car.ip || (D.match(/\bIP\s?(\d{2})\b/) || [])[0] || '';
      const freq = car.freq ? car.freq.replace(/HZ$/i, 'Hz') : '60Hz';
      ent('Acionador', x, 'Motor Elétrico', [linha('Marca', marcaTxt(car.marca || x.marca)), linha('Potência', cv ? cv + ' CV' : ''), linha('Número de Polos', po), linha('Frequência', freq), linha('Grau de Proteção', ip.replace(/\s/, '')), linha('Certificação', certTxt(x))], 1);
    }
    // tanque, painéis, baterias, instrumentos
    for (const x of de([15])) { x.usado = true; if (temUsuario(x)) { ent('Acessórios', x, 'Tanque de combustível diesel (fornecido solto e embalado)', usuario(x), 3); continue; } const v = (x.D.match(/(\d{2,5})\s*L?\b/) || [])[1]; ent('Acessórios', x, 'Tanque de combustível diesel (fornecido solto e embalado)', [linha('Volume', v ? v + ' L' : '')], 3); }
    const tensaoDe = (seg) => { const m = seg.match(/PAINEL[^,]*?\b(220|380|440|480)\s*(MONO|TRI)/); return m ? m[1] + 'V ' + (m[2] === 'MONO' ? 'monofásico' : 'trifásico') : ''; };
    const segs = comp.split(/(?=\bDIESEL\b|\bELETRICA\b|\bJOCKEY\b)/);
    const tensaoPainel = (tipo, D) => { const v = (D.match(/\b(220|380|440|480)\s*V\b/) || [])[1]; if (v) return v + 'V ' + (v === '220' ? ((/MONO/.test(D) && 'monofásico') || (/TRI/.test(D) && 'trifásico') || '') : 'trifásico').trim(); const sg = segs.find((g) => g.startsWith(tipo)); return sg ? tensaoDe(sg) : ''; };
    for (const x of de([20, 21])) {
      x.usado = true; const jockey = /\bJ\b|JOCKEY|\bJD\d/.test(x.D) && !/\bE[JS]\b|ED\d/.test(x.D); const diesel = x.code === 20 || /DIESEL/.test(x.D);
      const tit = diesel ? 'Painel de comando do conjunto diesel' : jockey ? 'Painel de comando da bomba jockey' : 'Painel de comando do conjunto elétrico';
      if (temUsuario(x)) { ent(jockey ? 'Bomba jockey' : 'Painel de comando', x, tit + ' (fornecido solto e embalado)', usuario(x), 2); continue; }
      const nfpa = /NFPA/.test(x.D) || (!/\bNBR\b|-U-/.test(x.D) && norma === 'NFPA 20'); const nrm = nfpa ? 'NFPA 20' : /NBR|-U-/.test(x.D) ? (norma.startsWith('NBR') ? norma : 'NBR') : norma;
      const ce = certTxt(x); const certN = ce ? ce.replace(' · ', ' / ') : 'NL (Não listado)';
      ent(jockey ? 'Bomba jockey' : 'Painel de comando', x, tit + ' (fornecido solto e embalado)', [linha('Marca', marcaTxt(x.marca)), linha('Tensão alim.', tensaoPainel(diesel ? 'DIESEL' : jockey ? 'JOCKEY' : 'ELETRICA', x.D)), linha('Grau Prot.', /SVE/.test(upNoAc(x.marca)) ? ESC_STD.ipPainel : ''),
        linha('Leit. pressão', nfpa ? 'Por transdutor' : nrm ? 'Por pressostato' : ''), linha('Comunicação', ESC_STD.comunicacao), linha('Norma/Cert.', nrm ? nrm + ' / ' + certN : '')], 2);
    }
    for (const x of de([17])) { x.usado = true; const ah = (x.D.match(/(\d+)\s*X\s*(\d+)\s*A\/?H/) || []); const m1 = L.find((y) => y.code === 1); const vcc = m1 ? ((m1.D.match(/\b(12|24)\s*VCC/) || [])[1] || '') : '';
      ent('Acionador', x, 'Baterias' + (ah[2] ? ': ' + (vcc ? vcc + ' VCC - ' : '') + ah[1] + ' x ' + ah[2] + ' A/h' : ': ' + x.d) + ' (fornecido solto e embalado)', [], 4); }
    { const mn = de([42]).filter((y) => !y.usado), mv = de([30]).filter((y) => !y.usado); if (mn.length && mv.length) { mn.concat(mv).forEach((y) => { y.usado = true; }); ent('Acessórios', mn[0], 'Manômetro e Manovacuômetro (fornecido solto e embalado)', [mn[0].d, mv[0].d], 5); } }
    for (const x of de([43])) { x.usado = true; ent('Acessórios', x, 'Válvula de alívio de carcaça: Sim', [], 6); }
    // partes internas do conjunto (base, chaves e sensores do motor, interligação, capa, tomada de pressão, cabeçote): não vão
    // para o escopo, como na proposta LS Fire, a menos que tenham texto cadastrado
    for (const x of L) if (!x.usado && ESC_INTERNO.has(x.code) && !temUsuario(x)) x.usado = true;
    // o resto: texto cadastrado, texto padrão da família ou a descrição comercial do cadastro
    for (const x of L) {
      if (x.usado) continue; const code = x.code; const ti = x.key ? escItem(x.key) : ''; const fe = escFam(code);
      const pf = EP.fams[code] || null; const padT = (pf && pf.t && (pf.t[lang] || pf.t.pt)) || '';
      if (!ti && !fe.t && !padT && (FORA_ESC.has(code) || !code)) continue;
      const o = { marca: /^LS ?FIRE$/i.test(x.marca.trim()) ? '' : marcaTxt(x.marca), modelo: x.d, qtd: nBR(x.q) }; if (o.marca && x.d.toUpperCase().startsWith(o.marca.toUpperCase())) o.marca = '';
      const desc = x.ins && x.ins.descCom; const tpl = ti || fe.t || (desc ? '' : padT);
      const tPad = (pf && pf.titulo && (pf.titulo[lang] || pf.titulo.pt)) || (famReg()[code] || {}).desc || x.d;
      let sub = tpl ? tpl.split('\n').map((l) => preencher(l, o)).filter(Boolean) : desc ? [desc] : [[o.marca, o.modelo].filter(Boolean).join(' ')];
      if (sub.length === 1 && sub[0] === tPad) sub = [];
      const ce = certTxt(x, lang); if (ce) sub.push(escT('Certificação', lang) + ': ' + ce);
      add(fe.grupo || GRUPO_PAD[code] || 'Acessórios', { q: x.q, titulo: tPad, sub, ord: 9 });
    }
    for (const g of especDoItem(S)) { if (g.titulo === '@pintura' && de([11, 12, 13]).length) continue; add(g.titulo === '@pintura' ? 'Bomba' : g.titulo === '@testes' ? 'Testes e ensaios' : 'Documentos e desenhos', { q: g.qtd, titulo: g.titulo, sub: g.linhas.filter((l) => l[0] !== 'descricao').map((l) => '#' + l[0] + '|' + l[1]), ord: 9 }); }
    return GRUPOS_ESC.filter((g) => (G[g] || []).length).map((g) => ({ g, itens: G[g].map((x, i) => [x, i]).sort((a, b) => a[0].ord - b[0].ord || a[1] - b[1]).map(([x]) => { const y = Object.assign({}, x); delete y.ord; return y; }) }));
  }
  // o que a proposta puxa do cadastro para um item: folhas técnicas de bombas e motores (somando iguais) e desenhos
  function cadastroDoItem(S) {
    const fds = []; const linhas = []; for (let k = 34; k <= 63; k++) linhas.push(k); for (let k = 68; k <= 112; k++) linhas.push(k);
    const faltam = [];
    for (const k of linhas) {
      const d = txt(S, 'D' + k); const q = qtdNum(val(S, 'F' + k)); if (!d || !(q > 0)) continue;
      const fam = String(txt(S, 'U' + k) || txt(S, 'C' + k) || ''); const cod = /^\d\d\./.test(fam) ? +fam.slice(0, 2) : 0; if (!FDTEC_FAM[cod]) continue;
      const key = chaveCad(d); if (!key) continue; const doc = fdTecDe(key);
      if (!doc) { if (!faltam.some((x) => x.id === key)) faltam.push({ id: key, produto: d, uso: FDTEC_FAM[cod] }); continue; }
      const ja = fds.find((x) => x.doc === doc.id); if (ja) { ja.qtd += q; continue; }
      fds.push({ doc: doc.id, uso: doc.uso || FDTEC_FAM[cod], titulo: '@' + (FD_TIT[String(cod).padStart(2, '0')] || 'bombaCent'), desc: d, qtd: q, fabricante: (doc.fdTec || {}).fabricante || '',
        secoes: ((doc.fdTec || {}).secoes || []).map((s) => ({ t: s.t, campos: s.campos.filter((c) => c.on !== false && String(c.v || '').trim()).map((c) => [c.k, c.v]) })).filter((s) => s.campos.length) });
    }
    const mod = txt(S, 'C17'); const eq = String(val(S, 'AR2') || 'CMB');
    let des = mod ? desenhosDe((d) => d.modelo === mod) : []; if (!des.length) des = desenhosDe((d) => d.equip === eq);
    return { fds, faltam, desenhos: des.map((d) => ({ id: d.id, nome: d.nome })) };
  }
  // "cadastrar novo" a partir de uma lista: abre a ficha (quem edita o cadastro) ou o pedido de cadastro (os demais)
  function novoInsumo(nome, fam) {
    const famOk = fam && /^\d+\./.test(fam) ? fam : undefined;
    if (!(REG.areaOk('cadastro') || REG.areaOk('custos'))) { PD.pedir(Object.assign({ produto: nome || '', propUid: state.uid, propNome: docTitle() }, famOk ? { fam: famOk } : {})); return; }
    ui.cad = 'insumos'; insumoModal(null, famOk);
    if (nome) setTimeout(() => { const o = $('#overlay'); if (!o) return; const gr = $('#fGerar', o); if (gr && gr.checked) { gr.checked = false; gr.dispatchEvent(new Event('change')); } const pr = $('#fProd', o); if (pr) { pr.value = nome; pr.dispatchEvent(new Event('input')); } }, 40);
  }
  async function novoVendedor() {
    if (!REG.areaOk('precificacao')) { toast('Sem permissão para cadastrar vendedores: peça a quem cuida de Precificação.'); return; }
    modal(`<h2>Novo vendedor ou agente de negócio</h2><div class="fields"><div class="f span2"><label for="nvNome">Nome</label><input id="nvNome" placeholder="ex.: THIAGO SILVA" autocomplete="off"></div><div class="f"><label>Papel</label><div class="seg"><label class="on"><input type="radio" name="nvPapel" value="vendedor" checked>Vendedor</label><label><input type="radio" name="nvPapel" value="an">AN</label></div></div><div class="f span2"><label for="nvMail">E-mail (opcional)</label><input id="nvMail" type="email" inputmode="email" autocomplete="email"></div></div>
      <p class="sub" style="margin:0">Fica na lista de Cadastros → Precificação → Vendedores e agentes, para todas as propostas.</p><div class="docbar"><button class="btn pri" id="nvOk">Cadastrar</button><button class="btn" data-close>Cancelar</button></div>`,
    (o, close) => { const n = $('#nvNome', o); if (n) n.focus(); $('#nvOk', o).onclick = () => { const nome = ($('#nvNome', o).value || '').trim().toUpperCase().replace(/\s+/g, ' '); const papel = (o.querySelector('input[name="nvPapel"]:checked') || {}).value || 'vendedor'; const email = ($('#nvMail', o).value || '').trim();
      if (!nome) { toast('Escreva o nome'); return; } const L = equipeCom(); if (L.some((x) => x.nome === nome && x.papel === papel)) { toast('Já cadastrado'); return; }
      close(); salvaEquipe(L.concat([{ nome, papel, email }]), (papel === 'an' ? 'AN' : 'Vendedor') + ' incluído: ' + nome, [{ campo: nome, de: null, para: papel }]); toast((papel === 'an' ? 'AN' : 'Vendedor') + ' cadastrado: ' + nome + '. Escolha na lista.'); }; });
  }
  window.LSNovo = { insumo: novoInsumo, vendedor: novoVendedor };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-novovend]')) { e.preventDefault(); novoVendedor(); } });
  // correção de cadastro aberta pelo configurador (administrador): ao gravar, a linha acrescentada na proposta usa o nome gravado
  let cfgCadAlvo = null;
  function aposSalvarInsumo(rec, isNew) {
    const a = cfgCadAlvo; cfgCadAlvo = null; if (!a || Date.now() - a.at > 30 * 60 * 1000) return;
    if (isNew ? !!a.id : a.id !== rec.id) return;
    if (a.tipo === 'man' && rec.produto && rec.produto !== a.desc && ITEMS.includes(a.S)) { commit(a.S, 'D' + a.r, rec.produto); toast('Linha da proposta atualizada para "' + rec.produto + '"'); }
    else render();
  }
  // ficha do produto (dados mestres) em abas; os campos continuam no mesmo formulário e são gravados juntos
  const FICHA_ABAS = [['geral', 'Geral'], ['tecnica', 'Características técnicas'], ['compras', 'Compras e custos'], ['forn', 'Fornecedores'], ['uso', 'Estruturas e kits'], ['docs', 'Documentos'], ['hist', 'Histórico']];
  const fichaAba = (o, k) => { for (const b of o.querySelectorAll('[data-ftab]')) b.setAttribute('aria-selected', b.dataset.ftab === k ? 'true' : 'false'); for (const el of o.querySelectorAll('[data-fpane]')) el.classList.toggle('fpane-off', el.dataset.fpane !== k); };
  function insumoModal(id, presetFam) {
    const isNew = !id; const rec = isNew ? { fam: presetFam || ui.insFam || famList()[0], origem: 'NAC', situacao: 'ativo' } : JSON.parse(JSON.stringify(REG.insumos.find((x) => x.id === id) || null));
    if (!rec) return;
    const ed = canEd(); const ro = ed ? '' : ' disabled';
    const fams = famList(); const cfg = famCfg();
    const code = isNew ? REG.nextCode(rec.fam) : { a: rec.a, b: rec.b };
    const st = { fam: rec.fam, car: Object.assign({}, FAMS_F.ler(rec.fam, rec.produto, cfg), rec.caract || {}), forn: JSON.parse(JSON.stringify(rec.forn || [])), equiv: JSON.parse(JSON.stringify(rec.equiv || [])) };
    const p0 = FAMS_F.padraoDe(rec.fam, cfg);
    st.gerar = !!(p0 && p0.modelo) && (isNew || FAMS_F.montar(p0, st.car) === rec.produto);
    const hist = REG.historico.filter((h) => h.ref === id).slice(0, 12);
    // características gravadas como objeto: mostra "Potência: 500 · Rotação: 1800" com os nomes dos campos da família, não o JSON
    const lbCar = Object.fromEntries(((p0 && p0.campos) || []).map((c) => [c.k, String(c.lb || c.k).replace(/\s*\(.*\)$/, '')]));
    const hv = (x) => (typeof x === 'object' && x ? Object.entries(x).filter(([, y]) => y !== '' && y != null).map(([k, y]) => (lbCar[k] || k) + ': ' + y).join(' · ') || '—' : fmtVal(x));
    const histHtml = hist.length ? `<div class="hist">${hist.map((h) => `<div><small>${fmtAt(h.at)} · ${who(h.by)}</small>${(h.mudancas || []).map((m) => `<div class="chg"><b>${esc(m.campo)}</b> ${esc(hv(m.de))} → ${esc(hv(m.para))}</div>`).join('')}</div>`).join('')}</div>` : '<p class="sub">Sem alterações registradas.</p>';
    const hp = isNew ? [] : historicoPreco(rec); const C = custosCfg();
    const hpHtml = hp.length ? `<div class="tw"><table class="t"><thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Variação</th><th>Origem</th></tr></thead><tbody>${hp.slice(0, 15).map((x) => { const v = typeof x.de === 'number' && x.de && typeof x.para === 'number' ? (x.para - x.de) / x.de : null; return `<tr><td>${esc(fmtAt(x.at))}<br><small class="sub">${who(x.by)}</small></td><td class="n">${typeof x.de === 'number' ? brl(x.de) : '—'}</td><td class="n">${typeof x.para === 'number' ? brl(x.para) : '—'}</td><td class="n ${v !== null && Math.abs(v) >= C.variacaoPct ? 'bad-t' : ''}">${v === null ? '—' : (v > 0 ? '+' : '') + pct(v, 1)}</td><td><small>${esc(x.fonte || '')}</small></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Sem alteração de preço registrada (o valor é o da planilha ou da última gravação).</p>';
    const insOpts = REG.insumos.filter((i) => i.id !== rec.id).map((i) => `<option value="${esc(i.id + ' · ' + i.produto)}">`).join('');
    modal(`<div class="objhead"><div class="objid"><small class="sub">${isNew ? 'Novo insumo' : 'Insumo'} · ${esc(famNome(rec.fam) || '')}</small><h2>${isNew ? 'Novo insumo' : 'Insumo ' + esc(rec.id)} ${isNew ? '' : situPillIns(rec)}</h2>${isNew ? '' : `<div class="objtit">${esc(rec.produto || '')}</div>`}</div>
      ${isNew ? '' : `<div class="objkpis"><div><small class="sub">Custo vigente</small><b>${typeof rec.valor === 'number' ? brl(rec.valor) : 'sem preço'}</b></div><div><small class="sub">Fabricante</small><b>${esc(rec.fab || '—')}</b></div><div><small class="sub">Origem</small><b>${esc(rec.origem || '—')}</b></div>${precoVencido(rec) ? '<div><span class="pill warn">preço vencido</span></div>' : ''}</div>`}</div>
      <div class="subtabs fichatabs" role="tablist" aria-label="Seções da ficha">${FICHA_ABAS.filter(([k]) => !isNew || ['geral', 'tecnica', 'compras', 'forn'].includes(k)).map(([k, lb], i) => `<button type="button" role="tab" data-ftab="${k}" aria-selected="${i === 0}">${lb}</button>`).join('')}</div>
      <form id="insForm" autocomplete="off" class="stack" style="gap:10px">
      <div class="fields" data-fpane="geral">
        <div class="f span2"><label for="fFam">Família</label><select id="fFam"${ro}>${fams.map((f) => `<option value="${esc(f)}"${f === rec.fam ? ' selected' : ''}>${esc(famNome(f))}</option>`).join('')}${ed ? '<option value="__nova">+ Nova família…</option>' : ''}</select></div>
        <div class="f" id="fNovaWrap" hidden><label for="fNova">Nova família (nn.NOME)</label><input id="fNova" placeholder="46.NOMEDAFAMILIA"></div>
        <div class="f"><label>Código (não muda)</label><div class="ro code" id="fCode">${esc(String(code.a).padStart(2, '0') + '-' + code.b)}</div></div>
        <div class="f"><label for="fSit">Situação</label><select id="fSit"${ro}>${SITUACOES.map(([k, lb]) => `<option value="${k}"${situ(rec) === k ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select></div>
        <div class="f"><label for="fFab">Fabricante</label><input id="fFab" list="dlFabAll" value="${esc(rec.fab || '')}"${ro}><datalist id="dlFabAll">${[...new Set(REG.insumos.map((i) => i.fab).filter(Boolean))].sort().map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="f"><label for="fCodFab">Código do fabricante</label><input id="fCodFab" value="${esc(rec.codFab || '')}"${ro}></div>
        <div class="f"><label>Certificação</label>${certHtml('f', rec.cert, ro)}</div>
        <div class="f"><label for="fTipo">Tipo/config.</label><input id="fTipo" list="dlTipos" value="${esc(rec.tipo || '')}"${ro}><datalist id="dlTipos">${[...new Set(REG.insumos.filter((x) => x.fam === rec.fam && x.tipo).map((x) => x.tipo))].map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div class="f"><label for="fOri">Origem</label><select id="fOri"${ro}><option${rec.origem === 'NAC' ? ' selected' : ''}>NAC</option><option${rec.origem === 'IMP' ? ' selected' : ''}>IMP</option></select></div>
        <div class="f span2" id="fSubWrap"${['inativo', 'descontinuado'].includes(situ(rec)) ? '' : ' hidden'}><label for="fSub">Substituto (quando descontinuado)</label><input id="fSub" list="dlInsAll" value="${esc(rec.substituto ? rec.substituto + ' · ' + ((REG.insumos.find((i) => i.id === rec.substituto) || {}).produto || '') : '')}"${ro}></div>
      </div>
      <section class="fsec" id="fCarSec" data-fpane="tecnica"><h3>Características técnicas <span class="sub" id="fCarSub"></span></h3><div class="fields" id="fCar"></div></section>
      <section class="fsec" data-fpane="geral"><h3>Descrições</h3>
        <div class="fields"><div class="f spanall"><label for="fProd">Descrição técnica padronizada <small class="sub">(é o nome que as fórmulas e as estruturas usam)</small></label>
          <input id="fProd" value="${esc(rec.produto || '')}"${ro}><label class="chk" id="fGerWrap"><input type="checkbox" id="fGerar"${st.gerar ? ' checked' : ''}${ro}> gerar pelas características da família</label><small class="sub" id="fPad"></small></div>
          <div class="f spanall" id="fExcWrap" hidden><label for="fExc">Justificativa da exceção ao padrão</label><input id="fExc" value="${esc(rec.excecao || '')}" placeholder="ex.: código do fabricante não segue a série; nome exigido pelo cliente"${ro}></div>
          <div class="f spanall"><label for="fCom">Descrição comercial <small class="sub">(para documentos ao cliente)</small></label><div class="row2"><input id="fCom" value="${esc(rec.descCom || '')}"${ro}><button type="button" class="btn sm" id="fComSug"${ro}>Sugerir</button></div></div>
          <div class="f spanall"><label for="fDescFab">Descrição do fabricante <small class="sub">(texto original do catálogo ou da cotação)</small></label><input id="fDescFab" value="${esc(rec.descFab || '')}"${ro}></div>
          <div class="f spanall"><label for="fObs">Observações</label><input id="fObs" value="${esc(rec.obs || '')}"${ro}></div></div>
        <div id="fDup"></div></section>
      <section class="fsec" data-fpane="compras"><h3>Preço de aquisição</h3>
        <div class="fields"><div class="f"><label for="fVal">Valor (R$)</label><input id="fVal" inputmode="decimal" value="${typeof rec.valor === 'number' ? esc(NF[2].format(rec.valor)) : ''}" placeholder="sem preço"${ro}></div>
          <div class="f span2"><label for="fFonte">Origem do preço</label><input id="fFonte" value="${esc(rec.fonte || '')}" placeholder="fornecedor, nº do orçamento"${ro}></div>
          <div class="f"><label for="fDataCot">Data da cotação</label><input id="fDataCot" type="date" value="${esc(rec.dataCot || '')}"${ro}></div></div>
        <div id="fImp"></div></section>
      <details class="fsec" data-fpane="forn" open><summary><h3 style="display:inline">Fornecedores e cotações <span class="sub">${st.forn.length}</span></h3></summary><div id="fForn"></div></details>
      <details class="fsec" data-fpane="tecnica" open><summary><h3 style="display:inline">Equivalentes técnicos e alternativas <span class="sub">${st.equiv.length}</span></h3></summary><div id="fEquiv"></div></details>
      </form>
      <datalist id="dlInsAll">${insOpts}</datalist><datalist id="dl_fornall">${[...new Set(REG.insumos.flatMap((i) => (i.forn || []).map((f) => f.nome)).concat((() => { try { return SPV.docs().map((d) => d.fornecedor); } catch (e) { return []; } })()).filter(Boolean))].sort().map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      ${!isNew ? `<div data-fpane="uso">${ondeUsadoHtml(rec)}</div>` : ''}
      ${!isNew ? `<div data-fpane="compras"><h3>Histórico de preço</h3>${hpHtml}</div>` : ''}
      ${!isNew ? `<div data-fpane="geral"><h3>Na proposta</h3><div class="fields">${escCampoHtml(rec.id, rec.fam)}</div></div>` : ''}
      ${!isNew && FDTEC_FAM[H.famCode(rec.fam)] ? `<div data-fpane="docs"><h3>Folha de dados técnica</h3><div id="fdtBox" data-fdtins="${esc(rec.id)}">${fdTecHtml(rec.id)}</div></div>` : ''}
      ${!isNew ? `<div data-fpane="docs"><h3>Documentos deste insumo</h3>${SPV.docsDoInsumo(rec.id)}<div class="docbar"><label class="btn sm" for="insDoc">📎 Anexar orçamento, nota ou ficha</label><input type="file" id="insDoc" data-insdoc="${esc(rec.id)}" accept="application/pdf,image/*,.xml,.xlsx,.csv" hidden><button class="btn sm" data-close data-view="documentos" data-ico="folder-open">Todos os documentos</button></div></div>` : ''}
      ${!isNew ? `<div data-fpane="hist"><h3>Histórico deste insumo</h3>${histHtml}</div>` : ''}
      <div id="fErr" class="bad-t"></div>
      <div class="fichaacoes">
        ${ed ? `<button class="btn pri" id="fSave">${isNew ? 'Cadastrar' : 'Salvar'}</button>` : ''}
        ${ed && !isNew ? '<button class="btn" id="fDup2">Duplicar</button>' : ''}
        ${ed && !isNew ? '<button class="btn" id="fDel">Excluir</button>' : ''}
        <button class="btn" data-close>${ed ? 'Cancelar' : 'Fechar'}</button>
      </div>`,
    (o, close) => {
      fillNames(o); fichaAba(o, 'geral');
      o.addEventListener('click', (e) => { const b = e.target.closest('[data-ftab]'); if (b) fichaAba(o, b.dataset.ftab); });
      o.addEventListener('keydown', (e) => { const b = e.target.closest('[data-ftab]'); if (!b || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return; const L = [...o.querySelectorAll('[data-ftab]')]; const nx = L[(L.indexOf(b) + (e.key === 'ArrowRight' ? 1 : L.length - 1)) % L.length]; nx.focus(); fichaAba(o, nx.dataset.ftab); });
      const g = (s) => $(s, o); const famSel = g('#fFam'), nova = g('#fNova');
      const famAtual = () => (famSel.value === '__nova' ? nova.value.trim().toUpperCase().replace(/\s+/g, '') : famSel.value);
      const pad = () => FAMS_F.padraoDe(famAtual(), cfg);
      const drawCar = () => {
        const p = pad(); const sec = g('#fCarSec');
        if (!p || !(p.campos || []).length) { sec.hidden = true; g('#fGerWrap').hidden = true; return; }
        sec.hidden = false; g('#fGerWrap').hidden = !p.modelo; g('#fCarSub').textContent = p.nome + (p.modelo ? ' · modelo: ' + p.modelo : '');
        // valores já usados nesta família (para sugerir modelos, bombas, marcas…)
        const usados = (k) => { const set = new Set(); for (const i of REG.insumos) { if (i.fam !== famAtual()) continue; const v0 = (i.caract || {})[k] || FAMS_F.lerP(p, i.produto)[k]; if (v0) set.add(String(v0)); } return [...set].sort(); };
        st.outro = st.outro || {};
        g('#fCar').innerHTML = p.campos.map((c) => { const v = st.car[c.k] ?? ''; const idf = 'fc_' + c.k; const ops = c.ops || [];
          // poucas opções: botões de escolha (com "outro" para o que não estiver na lista e "—" quando é opcional)
          const inp = c.tipo === 'lista' && ops.length && ops.length <= 4 ? `<div class="seg" role="radiogroup" aria-label="${esc(c.lb)}">${(c.req ? [] : [['', '—']]).concat(ops.map((o) => [o, o])).map(([o, lb2]) => `<label class="${String(v) === o && !st.outro[c.k] ? 'on' : ''}"><input type="radio" name="${idf}" data-carr="${esc(c.k)}" value="${esc(o)}"${String(v) === o && !st.outro[c.k] ? ' checked' : ''}${ro}>${esc(lb2)}</label>`).join('')}<label class="${st.outro[c.k] || (v && !ops.includes(String(v))) ? 'on' : ''}"><input type="radio" name="${idf}" data-carr="${esc(c.k)}" value="\u0000outro"${st.outro[c.k] || (v && !ops.includes(String(v))) ? ' checked' : ''}${ro}>outro</label></div>${st.outro[c.k] || (v && !ops.includes(String(v))) ? `<input id="${idf}" data-car="${esc(c.k)}" value="${esc(v)}" placeholder="informe o valor"${ro}>` : ''}`
            : c.tipo === 'lista' ? `<input id="${idf}" data-car="${esc(c.k)}" list="dl_${idf}" value="${esc(v)}"${ro}><datalist id="dl_${idf}">${ops.concat(usados(c.k).filter((x) => !ops.includes(x))).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`
            : c.tipo === 'texto' ? `<input id="${idf}" data-car="${esc(c.k)}" list="dl_${idf}" value="${esc(v)}" placeholder="${esc(c.ex || '')}"${ro}><datalist id="dl_${idf}">${usados(c.k).slice(0, 300).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`
            : `<input id="${idf}" data-car="${esc(c.k)}" value="${esc(v)}" inputmode="decimal" placeholder="${esc(c.ex || '')}"${ro}>`;
          return `<div class="f${c.tipo === 'texto' ? ' span2' : ''}${c.req ? ' req' : ''}"><label for="${idf}">${esc(c.lb)}${c.un ? ` <small class="sub">(${esc(c.un)})</small>` : ''}${c.req ? '' : ' <small class="sub">opcional</small>'}</label>${inp}</div>`; }).join('');
        o.querySelectorAll('[data-car]').forEach((el) => { el.oninput = () => { st.car[el.dataset.car] = el.value; atualiza(); }; el.onchange = () => autoModelo(el.dataset.car, el.value); });
        o.querySelectorAll('[data-carr]').forEach((el) => { el.onchange = () => { const k = el.dataset.carr; if (el.value === '\u0000outro') { st.outro[k] = true; st.car[k] = ''; } else { st.outro[k] = false; st.car[k] = el.value; } drawCar(); atualiza(); if (st.outro[k]) { const i = g('#fc_' + k); if (i) i.focus(); } }; });
      };
      // modelo já cadastrado na família: preenche só o que é igual em todos os itens com esse modelo (e só campos vazios)
      const autoModelo = (k, v) => { const p = pad(); if (!p || !v || !['modelo', 'bomba'].includes(k)) return;
        const L = REG.insumos.filter((i) => i.fam === famAtual() && i.id !== rec.id).map((i) => Object.assign({}, FAMS_F.lerP(p, i.produto), i.caract || {})).filter((c) => FAMS_F.norm(c[k]) === FAMS_F.norm(v)); if (!L.length) return;
        const feitos = []; for (const c of p.campos) { if (c.k === k || String(st.car[c.k] ?? '').trim()) continue; const vs = new Set(L.map((x) => x[c.k] ?? '')); if (vs.size === 1 && [...vs][0]) { st.car[c.k] = [...vs][0]; feitos.push(c.lb.toLowerCase()); } }
        if (feitos.length) { drawCar(); atualiza(); toast('Do modelo já cadastrado (' + L.length + ' item(ns)): ' + feitos.join(', ') + '. Confira; o que varia entre eles não foi preenchido.'); } };
      const atualiza = () => {
        const p = pad(); const fam = famAtual(); const gerar = g('#fGerar').checked && p && p.modelo;
        if (gerar) { const falta = FAMS_F.faltando(p, st.car); const m = FAMS_F.montar(p, st.car); if (!falta.length) g('#fProd').value = m; g('#fProd').readOnly = true;
          g('#fPad').innerHTML = falta.length ? `<span class="bad-t">Faltam: ${esc(falta.join(', '))}.</span> A descrição sai quando todos os obrigatórios estiverem preenchidos.` : '<span class="ok-t">Gerada pelo padrão da família.</span>'; g('#fExcWrap').hidden = true; }
        else { g('#fProd').readOnly = !ed; const m = FAMS_F.checar(fam, g('#fProd').value, cfg); g('#fPad').innerHTML = m ? '<span class="bad-t">⚠ ' + esc(m) + '</span>' : '<span class="ok-t">No padrão.</span>'; g('#fExcWrap').hidden = !m; }
        // duplicidade: só aponta; quem decide é a pessoa
        const cand = { id: rec.id, fam, produto: g('#fProd').value, fab: g('#fFab').value, codFab: g('#fCodFab').value, caract: st.car };
        const dups = cand.produto.trim() ? FAMS_F.duplicidades(cand, REG.insumos, cfg) : []; const LB = { mesmo: ['Mesmo produto', 'bad'], equivalente: ['Possivelmente equivalente', 'warn'], semelhante: ['Semelhante, com diferenças', 'mute'] };
        g('#fDup').innerHTML = dups.length ? `<div class="banner ${dups[0].nivel === 'mesmo' ? 'bad' : 'warn'}" style="margin:6px 0 0"><b>Antes de salvar, confira:</b><ul class="uso">${dups.map((d) => `<li><span class="pill ${LB[d.nivel][1]}">${LB[d.nivel][0]}</span> <b>${esc(d.x.id)}</b> ${esc(d.x.produto)} <small class="sub">· ${esc(d.motivo)} · ${typeof d.x.valor === 'number' ? brl(d.x.valor) : 'sem preço'}${situ(d.x) !== 'ativo' ? ' · ' + esc(situ(d.x)) : ''}</small></li>`).join('')}</ul><small>Produtos com potência, tensão, material ou configuração diferentes são produtos distintos: nada é juntado automaticamente.</small></div>` : '';
        st.dups = dups;
        // preço: impacto da mudança
        const vt = g('#fVal').value.trim(); const novo = vt === '' ? null : parseInput(vt, 'num');
        if (!isNew && typeof novo === 'number' && typeof rec.valor === 'number' && Math.abs(novo - rec.valor) > 0.004) {
          const u = ondeUsado(rec); const v = (novo - rec.valor) / rec.valor;
          g('#fImp').innerHTML = `<div class="banner ${Math.abs(v) >= C.variacaoPct ? 'warn' : 'info'}" style="margin:6px 0 0"><b>Mudança de preço:</b> ${brl(rec.valor)} → ${brl(novo)} (${v > 0 ? '+' : ''}${pct(v, 1)}). Usado em ${u.est.length} componente(s) de estrutura${u.props.length ? ', ' + u.props.length + ' proposta(s) escolhido à parte' : ''}${u.fech.length ? ', ' + u.fech.length + ' formação(ões) fechada(s) (não mudam)' : ''}. Propostas enviadas, aprovadas e ganhas guardam o preço da época; rascunhos passam a usar o novo. <button type="button" class="restore" id="fImpCalc">calcular o impacto na margem das propostas</button><div id="fImpRes"></div></div>`;
          const b = g('#fImpCalc'); if (b) b.onclick = () => { g('#fImpRes').innerHTML = '<small class="sub">Calculando…</small>'; setTimeout(() => { g('#fImpRes').innerHTML = impactoPrecoHtml(rec, novo); }, 20); };
        } else g('#fImp').innerHTML = '';
        g('#fSubWrap').hidden = !['inativo', 'descontinuado'].includes(g('#fSit').value);
      };
      const drawForn = () => {
        const tot = st.forn.map(custoTotalForn); const valid = tot.filter((x) => x !== null); const min = valid.length ? Math.min(...valid) : null; const hoje = new Date().toISOString().slice(0, 10);
        g('#fForn').innerHTML = `${st.forn.length ? `<div class="tw"><table class="t forn"><thead><tr><th>Fornecedor</th><th>Preço</th><th>Moeda</th><th>Câmbio</th><th>Impostos %</th><th>Frete</th><th>Prazo (dias)</th><th>Validade</th><th>Pagamento</th><th>Qtd. mín.</th><th>Custo total</th><th></th></tr></thead><tbody>${st.forn.map((f, i) => `<tr>
          <td class="in"><input data-fo="${i}|nome" list="dl_fornall" value="${esc(f.nome || '')}" aria-label="Fornecedor"${ro}></td><td class="in"><input data-fo="${i}|preco" value="${typeof f.preco === 'number' ? NF[2].format(f.preco) : ''}" inputmode="decimal" aria-label="Preço"${ro}></td>
          <td class="in"><select data-fo="${i}|moeda" aria-label="Moeda"${ro}>${['BRL', 'USD', 'EUR'].map((m) => `<option${(f.moeda || 'BRL') === m ? ' selected' : ''}>${m}</option>`).join('')}</select></td><td class="in"><input data-fo="${i}|cambio" value="${typeof f.cambio === 'number' ? NF[4].format(f.cambio) : ''}" inputmode="decimal" placeholder="${(f.moeda || 'BRL') === 'BRL' ? '—' : 'R$ por ' + f.moeda}" aria-label="Câmbio"${ro}></td>
          <td class="in"><input data-fo="${i}|impostos" value="${typeof f.impostos === 'number' ? NF[2].format(f.impostos * 100) : ''}" inputmode="decimal" aria-label="Impostos %"${ro}></td><td class="in"><input data-fo="${i}|frete" value="${typeof f.frete === 'number' ? NF[2].format(f.frete) : ''}" inputmode="decimal" aria-label="Frete por unidade"${ro}></td>
          <td class="in"><input data-fo="${i}|prazo" value="${f.prazo ?? ''}" inputmode="numeric" aria-label="Prazo em dias"${ro}></td><td class="in"><input type="date" data-fo="${i}|validade" value="${esc(f.validade || '')}" aria-label="Validade"${ro}></td>
          <td class="in"><input data-fo="${i}|pagamento" value="${esc(f.pagamento || '')}" aria-label="Pagamento"${ro}></td><td class="in"><input data-fo="${i}|qmin" value="${f.qmin ?? ''}" inputmode="numeric" aria-label="Quantidade mínima"${ro}></td>
          <td class="n">${tot[i] === null ? `<small class="bad-t">${(f.moeda || 'BRL') !== 'BRL' && !(f.cambio > 0) ? 'informe o câmbio' : '—'}</small>` : `<b>${brl(tot[i])}</b>${tot[i] === min && valid.length > 1 ? '<br><span class="pill ok">menor total</span>' : ''}`}${f.validade && f.validade < hoje ? '<br><span class="pill warn">vencida</span>' : ''}</td>
          <td style="white-space:nowrap">${ed && tot[i] !== null ? `<button type="button" class="restore" data-fouse="${i}">usar este preço</button> ` : ''}${ed ? `<button type="button" class="restore" data-form="${i}" aria-label="Remover">×</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0 0 6px">Nenhum fornecedor cadastrado para este item.</p>'}
          ${ed ? '<button type="button" class="btn sm" id="foAdd">+ Fornecedor</button>' : ''}<p class="sub" style="margin:6px 0 0">Custo total = preço × câmbio × (1 + impostos) + frete, por unidade. O app não escolhe sozinho pelo menor preço: compare também prazo, validade, pagamento e conformidade, e use "usar este preço" para levar a cotação ao cadastro.</p>`;
        o.querySelectorAll('[data-fo]').forEach((el) => { el.onchange = () => { const [i, k] = el.dataset.fo.split('|'); const f = st.forn[+i]; const t = el.value.trim();
          if (['preco', 'cambio', 'frete'].includes(k)) { const n = t === '' ? null : parseInput(t, 'num'); f[k] = typeof n === 'number' ? n : null; } else if (k === 'impostos') { const n = t === '' ? null : parseInput(t, 'num'); f[k] = typeof n === 'number' ? n / 100 : null; }
          else if (['prazo', 'qmin'].includes(k)) { const n = parseInt(t, 10); f[k] = isFinite(n) ? n : null; } else f[k] = t || null; drawForn(); }; });
        const ad = g('#foAdd'); if (ad) ad.onclick = () => { st.forn.push({ nome: '', moeda: 'BRL', at: new Date().toISOString().slice(0, 10) }); drawForn(); };
        o.querySelectorAll('[data-form]').forEach((b) => { b.onclick = () => { st.forn.splice(+b.dataset.form, 1); drawForn(); }; });
        o.querySelectorAll('[data-fouse]').forEach((b) => { b.onclick = () => { const f = st.forn[+b.dataset.fouse]; const t = custoTotalForn(f); g('#fVal').value = NF[2].format(Math.round(t * 100) / 100); g('#fFonte').value = [f.nome, f.moeda !== 'BRL' ? f.moeda + ' ' + NF[2].format(f.preco) + ' × ' + NF[4].format(f.cambio) : '', 'cotação'].filter(Boolean).join(' · '); if (f.at) g('#fDataCot').value = f.at; atualiza(); toast('Preço do fornecedor levado para o cadastro; salve para gravar'); }; });
      };
      const EQ = [['tecnica', 'Equivalência técnica validada'], ['comercial', 'Alternativa comercial (sujeita a aprovação)'], ['substituto', 'Substituto de produto descontinuado']];
      const drawEquiv = () => {
        g('#fEquiv').innerHTML = `${st.equiv.length ? `<div class="tw"><table class="t"><thead><tr><th>Produto</th><th>Tipo</th><th>Características comparadas · justificativa</th><th>Restrições</th><th>Validado</th><th></th></tr></thead><tbody>${st.equiv.map((q, i) => { const x = REG.insumos.find((y) => y.id === q.id); return `<tr>
          <td>${x ? `<b>${esc(x.id)}</b> ${esc(x.produto)}` : `<span class="bad-t">${esc(q.id)} (não existe mais)</span>`}</td><td>${esc((EQ.find((e) => e[0] === q.tipo) || [0, q.tipo])[1])}</td><td><small>${esc(q.caracts || '')}${q.justificativa ? '<br>' + esc(q.justificativa) : ''}</small></td><td><small>${esc(q.restricoes || '—')}</small></td>
          <td><small>${esc(q.at || '')}<br>${who(q.por)}</small></td><td>${ed ? `<button type="button" class="restore" data-eqrm="${i}" aria-label="Remover">×</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0 0 6px">Nenhum equivalente cadastrado.</p>'}
          ${ed ? `<div class="fields" style="margin-top:6px"><div class="f span2"><label for="eqIns">Produto equivalente</label><input id="eqIns" list="dlInsAll" placeholder="buscar pelo código ou nome"></div><div class="f span2"><label for="eqTipo">Tipo</label><select id="eqTipo">${EQ.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
            <div class="f spanall"><label for="eqCar">Características comparadas e justificativa (obrigatório)</label><input id="eqCar" placeholder="ex.: mesma potência, rotação e flange; ficha técnica do fabricante anexada"></div><div class="f spanall"><label for="eqRes">Restrições de uso</label><input id="eqRes" placeholder="ex.: não vale para projetos UL/FM"></div></div>
            <button type="button" class="btn sm" id="eqAdd">+ Registrar equivalente</button>` : ''}<p class="sub" style="margin:6px 0 0">O app nunca troca um produto por outro sozinho: o equivalente fica registrado para consulta e para a escolha de quem monta a proposta.</p>`;
        fillNames(g('#fEquiv'));
        o.querySelectorAll('[data-eqrm]').forEach((b) => { b.onclick = () => { st.equiv.splice(+b.dataset.eqrm, 1); drawEquiv(); }; });
        const ad = g('#eqAdd'); if (ad) ad.onclick = () => { const idq = g('#eqIns').value.split(' · ')[0].trim(); if (!REG.insumos.some((i) => i.id === idq)) { toast('Escolha um produto da lista'); return; } const car = g('#eqCar').value.trim(); if (!car) { toast('Informe as características comparadas e a justificativa'); return; }
          st.equiv.push({ id: idq, tipo: g('#eqTipo').value, caracts: car, restricoes: g('#eqRes').value.trim() || null, por: REG.me || null, at: new Date().toISOString().slice(0, 10) }); drawEquiv(); };
      };
      famSel.onchange = () => { g('#fNovaWrap').hidden = famSel.value !== '__nova'; if (famSel.value !== '__nova') { const p = pad(); st.car = Object.assign({}, FAMS_F.ler(famSel.value, g('#fProd').value, cfg)); g('#fGerar').checked = !!(p && p.modelo) && isNew; } if (isNew) { const c = famSel.value === '__nova' ? null : REG.nextCode(famSel.value); g('#fCode').textContent = c ? String(c.a).padStart(2, '0') + '-' + c.b : '—'; } drawCar(); atualiza(); };
      nova.oninput = () => { drawCar(); atualiza(); };
      g('#fGerar').onchange = () => atualiza(); g('#fProd').oninput = () => atualiza(); g('#fFab').oninput = atualiza; g('#fCodFab').oninput = atualiza; g('#fVal').oninput = atualiza; g('#fSit').onchange = atualiza;
      g('#fComSug').onclick = () => { const p = pad(); const t = p ? FAMS_F.montarCom(p, st.car, { fab: g('#fFab').value.trim() }) : ''; if (t) g('#fCom').value = t; else toast('Esta família não tem modelo de descrição comercial; escreva à mão ou configure em Campos por família'); };
      drawCar(); drawForn(); drawEquiv(); atualiza();
      const sv = g('#fSave');
      if (sv) sv.onclick = async (e) => {
        e.preventDefault(); const err = (m) => { g('#fErr').textContent = m; };
        let fam = famSel.value;
        if (fam === '__nova') { fam = famAtual(); if (!/^\d{1,2}\.[A-Z0-9]+$/.test(fam)) return err('Nova família: use o formato nn.NOME, sem acento e sem espaço (ex.: 46.KITSUCCAO).'); fam = fam.replace(/^(\d)\./, '0$1.'); }
        const p = pad(); const gerar = g('#fGerar').checked && p && p.modelo;
        if (gerar) { const falta = FAMS_F.faltando(p, st.car); if (falta.length) return err('Preencha as características obrigatórias: ' + falta.join(', ') + '. Dado ausente não é inventado: se não houver, desmarque "gerar" e justifique a exceção.'); }
        const produto = (gerar ? FAMS_F.montar(p, st.car) : g('#fProd').value).replace(/\s+/g, ' ').trim().toUpperCase(); if (!produto) return err('Informe a descrição técnica.');
        const padMsg = FAMS_F.checar(fam, produto, cfg); const exc = g('#fExc').value.trim();
        if (padMsg && !exc) { g('#fExcWrap').hidden = false; return err(padMsg + ' — informe a justificativa da exceção ou corrija a descrição.'); }
        const mesmo = (st.dups || []).filter((d) => d.nivel === 'mesmo');
        if (mesmo.length && !sv.dataset.dupeOk) { sv.dataset.dupeOk = 1; return err('Já existe ' + mesmo.map((d) => d.x.id).join(', ') + ' com ' + mesmo[0].motivo + '. A fórmula pega sempre o primeiro com o mesmo nome. Clique de novo só se for mesmo outro produto.'); }
        const vtxt = g('#fVal').value.trim(); const valor = vtxt === '' ? null : parseInput(vtxt, 'num');
        if (valor !== null && typeof valor !== 'number') return err('Valor inválido. Use por exemplo 12.345,67.');
        const sit = g('#fSit').value; const subId = g('#fSub').value.split(' · ')[0].trim();
        if (sit === 'descontinuado' && subId && !REG.insumos.some((i) => i.id === subId)) return err('Substituto não encontrado: escolha da lista.');
        if (sit === 'descontinuado' && !isNew && !sv.dataset.descOk) { const u = ondeUsado(rec); if (u.est.length) { sv.dataset.descOk = 1; return err('Este insumo ainda entra em ' + u.est.length + ' componente(s) de estrutura. Descontinuar não tira das estruturas (o cálculo continua igual); troque-o lá ou no substituto. Clique de novo para confirmar.'); } }
        let a = rec.a, b = rec.b, nid = rec.id;
        if (isNew || H.famCode(fam) !== rec.a) { const c = REG.insumos.some((x) => x.fam === fam) ? REG.nextCode(fam) : { a: H.famCode(fam), b: H.famCode(fam) * 1000 + 1 }; a = c.a; b = c.b; if (isNew) nid = REG.newInsumoId(a, b); }
        const caract = {}; for (const [k, v] of Object.entries(st.car)) if (String(v ?? '').trim()) caract[k] = String(v).trim().toUpperCase();
        const out = { id: nid, a, b, fam, produto, fab: g('#fFab').value.trim().toUpperCase(), tipo: g('#fTipo').value.trim().toUpperCase(), valor, origem: g('#fOri').value, obs: g('#fObs').value.trim(),
          situacao: sit === 'ativo' && !rec.situacao ? undefined : sit, codFab: g('#fCodFab').value.trim() || undefined, caract: Object.keys(caract).length ? caract : undefined, descCom: g('#fCom').value.trim() || undefined, descFab: g('#fDescFab').value.trim() || undefined,
          excecao: padMsg ? exc : undefined, substituto: subId || undefined, fonte: g('#fFonte').value.trim() || undefined, dataCot: g('#fDataCot').value || undefined,
          forn: st.forn.filter((f) => f.nome || typeof f.preco === 'number').length ? st.forn.filter((f) => f.nome || typeof f.preco === 'number') : undefined, equiv: st.equiv.length ? st.equiv : undefined, cert: certLer(g) };
        // renomear um insumo em uso: mostra o impacto e pede confirmação; estruturas e tabelas acompanham
        if (!isNew && produto !== rec.produto) {
          const imp = renomeImpacto(rec, produto);
          if (imp.bloqueios.length) return err('Não dá para renomear: ' + imp.bloqueios.join('; ') + '.');
          if (!sv.dataset.renOk) { sv.dataset.renOk = 1; return err(`Renomear "${rec.produto}" → "${produto}": ${imp.nCel} célula(s) de estrutura ou tabela por porte, ${imp.kits.length} kit(s) e ${imp.props} proposta(s) passam a usar o novo nome (o nome antigo continua reconhecido nas propostas salvas). Clique de novo para confirmar.`); }
        }
        sv.disabled = true; sv.textContent = 'Salvando…';
        try {
          if (!isNew && produto !== rec.produto) await aplicarRenome(rec, produto);
          const ch = await REG.saveInsumo(out, isNew); aposSalvarInsumo(out, isNew); close(); toast(ch === false ? 'Nada mudou' : ch && ch.colidiu ? 'Cadastrado: ' + out.id + ' (o código ' + nid + ' foi usado por outra pessoa ao mesmo tempo)' : (isNew ? 'Cadastrado: ' + out.id : 'Salvo: ' + out.id));
        } catch (er) { sv.disabled = false; sv.textContent = isNew ? 'Cadastrar' : 'Salvar'; err(errMsg(er)); }
      };
      const dp = g('#fDup2'); if (dp) dp.onclick = () => { const cp = JSON.parse(JSON.stringify(rec)); close(); insumoModalCopia(cp); };
      const del = g('#fDel');
      if (del) del.onclick = async () => {
        const u = ondeUsado(rec);
        if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); g('#fErr').textContent = (u.est.length || u.props.length ? `Em uso: ${u.est.length} componente(s) de estrutura e ${u.props.length} proposta(s) — prefira marcar como Inativo ou Descontinuado, que preserva o histórico. ` : '') + 'Propostas que usam este insumo passam a mostrar "fora do catálogo".'; return; }
        try { await REG.deleteInsumo(rec.id); close(); toast('Excluído: ' + rec.id); } catch (er) { g('#fErr').textContent = errMsg(er); }
      };
    });
  }
  // duplicar: abre a ficha nova já preenchida (o código novo sai na hora de salvar)
  function insumoModalCopia(cp) {
    insumoModal(null, cp.fam);
    setTimeout(() => { const o = $('#overlay'); if (!o) return; const set = (s, v) => { const el = $(s, o); if (el && v !== undefined && v !== null) el.value = v; };
      set('#fFab', cp.fab); set('#fCodFab', ''); set('#fTipo', cp.tipo); set('#fOri', cp.origem); set('#fCom', cp.descCom); set('#fObs', 'cópia de ' + cp.id);
      for (const [k, v] of Object.entries(Object.assign({}, FAMS_F.ler(cp.fam, cp.produto, famCfg()), cp.caract || {}))) { const el = $('[data-car="' + k + '"]', o); if (el) { el.value = v; el.dispatchEvent(new Event('input')); } }
      if (!$('#fGerar', o).checked) { set('#fProd', cp.produto + ' (CÓPIA)'); $('#fProd', o).dispatchEvent(new Event('input')); }
      toast('Cópia de ' + cp.id + ': ajuste o que muda antes de cadastrar');
    }, 30);
  }
  // impacto de um novo preço nas propostas que usam o insumo (recalcula no motor, sem gravar nada)
  function impactoPrecoHtml(rec, novo) {
    const props = (REG.listPropostas() || []).filter((q) => q.div !== 'SPV' && !q.facts && q.doc && ((q.precos && q.precos.ins && rec.produto in q.precos.ins) || Object.entries(q.doc).some(([sh, cells]) => /^ITEM/.test(sh) && Object.values(cells || {}).includes(rec.produto)) || (q.resumo && 0))).slice(0, 12);
    const cand = props.length ? props : (REG.listPropostas() || []).filter((q) => q.div !== 'SPV' && !q.facts && q.doc && (q.status || 'rascunho') === 'rascunho').slice(0, 8);
    const rows = []; for (const q of cand) {
      try { const a = snapshotOf(q); const b = snapshotOf(q, { [rec.produto]: novo }); if (Math.abs(b.custo - a.custo) < 0.005) continue;
        const fixo = precosFixos(q); rows.push(`<tr><td>${esc(q.numero || q.name || '')}<br><small class="sub">${esc(q.cliente || '')} · ${esc(q.status || 'rascunho')}</small></td><td class="n">${brl(b.custo - a.custo)}</td><td class="n">${pct(a.margemPct, 1)} → <b class="${b.margemPct < a.margemPct ? 'bad-t' : ''}">${pct(b.margemPct, 1)}</b></td><td>${fixo ? '<span class="pill mute">congelada: não muda sozinha</span>' : '<span class="pill warn">rascunho: muda ao abrir</span>'}</td></tr>`); } catch (e) { /* proposta antiga sem cálculo */ }
    }
    return rows.length ? `<div class="tw" style="margin-top:6px"><table class="t"><thead><tr><th>Proposta</th><th>Custo</th><th>Margem</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<small class="sub">Nenhuma proposta salva muda de custo com este preço.</small>';
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
      return `<tr class="click" data-kit="${esc(k.id)}"><td class="in"><input type="checkbox" data-kitsel="${esc(k.id)}"${kitSel.has(k.id) ? ' checked' : ''} aria-label="Comparar ${esc(k.desc)}"></td><td style="min-width:300px">${esc(k.desc)}${REG.insumos.some((i) => i.produto === k.desc) ? '' : ' <span class="pill warn">sem insumo de mesmo nome</span>'}</td><td>${esc(k.tipo || '')}</td><td>${esc(k.marca || '')}</td><td class="n">${brl(p.D || 0)}</td><td class="n">${brl(motor ? t.nbr : t.es)}</td><td class="n"><b>${brl(motor ? t.padrao : t.bp)}</b></td><td class="sub">${k.upd ? fmtAt(k.upd) : ''}</td></tr>`;
    }).join('');
    return `<section class="card">
      <div class="sheetbar"><input id="kitQ" type="search" placeholder="Buscar kit…" value="${esc(ui.kitQ || '')}" aria-label="Buscar kit" style="flex:1 1 240px"><span class="sub">${list.length} de ${lim} linhas usadas</span><button class="btn sm" id="kitCmp"${kitSel.size < 2 ? ' disabled' : ''}>Comparar (${kitSel.size})</button><span style="flex:1"></span>${canEd() ? `<button class="btn sm pri" id="kitNew" data-kind="${kind}">+ Novo kit</button>` : ''}</div>
      <p class="sub" style="margin:8px 0">${motor ? 'O montador lê daqui o custo total do conjunto do motor (peça, painel, base, tanque, escape, bateria…). "Total NBR 13714" usa o painel e o tanque NBR; o outro, o painel padrão.' : 'O montador lê daqui o custo da bomba com os acessórios. A bomba END SUCTION usa o total sem as válvulas; a SPLIT CASE (bipartida) usa o total completo — quem decide é o Tipo/config. do insumo no CADASTRO.'} A descrição tem de ser igual à do insumo no CADASTRO.</p>
      <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr><th></th><th>Descrição</th><th>Origem</th><th>Marca</th><th>${motor ? 'Motor' : 'Bomba'}</th><th>${motor ? 'Total NBR 13714' : 'Total end suction'}</th><th>${motor ? 'Total' : 'Total split case'}</th><th>Atualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="sub">Nenhum kit.</td></tr>'}</tbody></table></div>
    </section>`;
  }
  // onde o kit entra: modelos prontos, propostas (pelo nome ou pelos preços da época) e o insumo de mesmo nome
  function kitUso(k) {
    const mods = modelos().filter((m) => m.motor === k.desc || m.bomba === k.desc).map((m) => m.nome);
    const props = (REG.listPropostas() || []).filter((q) => ((q.precos || {}).km || {})[k.desc] || ((q.precos || {}).kb || {})[k.desc] || Object.entries(q.doc || {}).some(([sh, c]) => /^ITEM/.test(sh) && Object.values(c || {}).includes(k.desc)));
    return { mods, props, ins: REG.insumos.find((i) => i.produto === k.desc) || null };
  }
  function kitCompara(kind, ids) {
    const motor = kind === 'motor'; const list = motor ? REG.kitMotor : REG.kitBomba; const K = ids.map((id) => list.find((x) => x.id === id)).filter(Boolean); if (K.length < 2) return;
    const labels = motor ? H.KMD_LABELS : H.KB_LABELS; const tot = (k) => (motor ? H.kmdTotals(k.p || {}) : H.kbTotals(k.p || {}));
    modal(`<h2>Comparar kits</h2><div class="tw"><table class="t"><thead><tr><th>Componente</th>${K.map((k) => `<th>${esc(k.desc)}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(labels).map(([c, lb]) => { const vs = K.map((k) => (k.p || {})[c]); const dif = new Set(vs.map((v) => v ?? null)).size > 1; return `<tr${dif ? ' class="cf-aviso"' : ''}><td>${esc(lb)}</td>${vs.map((v) => `<td class="n">${typeof v === 'number' ? brl(v) : '—'}</td>`).join('')}</tr>`; }).join('')}
      <tr class="tot"><td>${motor ? 'Total' : 'Total split case'}</td>${K.map((k) => `<td class="n">${brl(motor ? tot(k).padrao : tot(k).bp)}</td>`).join('')}</tr></tbody></table></div><div><button class="btn" data-close>Fechar</button></div>`);
  }
  const kitSel = new Set();
  document.addEventListener('change', (e) => { const c = e.target.closest('[data-kitsel]'); if (!c) return; if (c.checked) kitSel.add(c.dataset.kitsel); else kitSel.delete(c.dataset.kitsel); const b = $('#kitCmp'); if (b) { b.disabled = kitSel.size < 2; b.textContent = 'Comparar (' + kitSel.size + ')'; } });
  document.addEventListener('click', (e) => { if (e.target.closest('#kitCmp')) kitCompara(ui.cad === 'bomba' ? 'bomba' : 'motor', [...kitSel]); }, true);
  function kitModal(kind, id, preset) {
    const motor = kind === 'motor'; const list = motor ? REG.kitMotor : REG.kitBomba;
    const isNew = !id; const rec = isNew ? (preset || { desc: '', tipo: 'NAC', marca: '', p: {} }) : JSON.parse(JSON.stringify(list.find((x) => x.id === id)));
    const labels = motor ? H.KMD_LABELS : H.KB_LABELS; const ro = canEd() ? '' : ' disabled';
    const hist = REG.historico.filter((h) => h.ref === id).slice(0, 10);
    const parts = Object.entries(labels).map(([c, lb]) => `<div class="f"><label for="k${c}">${esc(lb)}</label><input id="k${c}" data-part="${c}" inputmode="decimal" value="${typeof rec.p[c] === 'number' ? esc(NF[2].format(rec.p[c])) : ''}"${ro}></div>`).join('');
    const prodList = REG.insumos.filter((x) => x.fam === (motor ? '01.MOTORDIESEL' : '11.BOMBAMANCAL')).map((x) => x.produto);
    modal(`<h2>${isNew ? 'Novo kit' : 'Kit'} — ${motor ? 'motor diesel' : 'bomba'}</h2>
      <div class="fields">
        <div class="f spanall"><label for="kDesc">Descrição (igual à do CADASTRO)</label><input id="kDesc" list="dlKitProd" value="${esc(rec.desc)}"${ro}><datalist id="dlKitProd">${prodList.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
        <div class="f"><label for="kTipo">Origem</label><select id="kTipo"${ro}><option${rec.tipo === 'NAC' ? ' selected' : ''}>NAC</option><option${rec.tipo === 'IMP' ? ' selected' : ''}>IMP</option></select></div>
        <div class="f"><label for="kMarca">Marca</label><input id="kMarca" list="dl_kmarca" value="${esc(rec.marca || '')}"${ro}><datalist id="dl_kmarca">${[...new Set(list.map((k) => k.marca).filter(Boolean))].sort().map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="f"><label>Certificação</label>${certHtml('k', rec.cert, ro)}</div>
      </div>
      <p class="sub" id="kWarn"></p>
      <h2>Componentes (R$)</h2>
      <div class="fields" id="kParts">${parts}</div>
      <div class="kpis" id="kTot"></div>
      <div id="kErr" class="bad-t"></div>
      ${!isNew ? `<h2>Na proposta</h2><div class="fields">${escCampoHtml((motor ? 'km:' : 'kb:') + rec.id, motor ? '01.MOTORDIESEL' : '11.BOMBAMANCAL')}</div><h2>Folha de dados técnica</h2><div id="fdtBox" data-fdtins="${esc((motor ? 'km:' : 'kb:') + rec.id)}">${fdTecHtml((motor ? 'km:' : 'kb:') + rec.id)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${canEd() ? `<button class="btn pri" id="kSave">${isNew ? 'Cadastrar kit' : 'Salvar'}</button>` : ''}${canEd() && !isNew ? '<button class="btn" id="kDup">Duplicar</button><button class="btn" id="kDel">Excluir</button>' : ''}<button class="btn" data-close>${canEd() ? 'Cancelar' : 'Fechar'}</button></div>
      ${!isNew ? (() => { const u = kitUso(rec); return `<h2>Onde é usado</h2><p class="sub" style="margin:0">${u.ins ? 'Insumo de mesmo nome: ' + esc(u.ins.id) + (typeof u.ins.valor === 'number' ? ' (' + brl(u.ins.valor) + ')' : ' (sem preço)') : '<span class="bad-t">Nenhum insumo com este nome no cadastro: o seletor do item não o oferece.</span>'}${u.mods.length ? '<br>Modelos prontos: ' + esc(u.mods.join(', ')) : ''}${u.props.length ? '<br>' + u.props.length + ' proposta(s): ' + esc(u.props.slice(0, 6).map((q) => q.numero || q.name || '').join(', ')) : ''}. Propostas enviadas e aprovadas guardam os valores do kit da época.</p>`; })() : ''}
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
        const out = { id: rec.id || ((motor ? 'm' : 'b') + Date.now().toString(36)), ord: rec.ord, desc, tipo: $('#kTipo', o).value, marca: $('#kMarca', o).value.trim(), p: read(), cert: certLer((q) => $(q, o), 'k') };
        sv.disabled = true;
        try { const ch = await REG.saveKit(kind, out, isNew); close(); toast(ch === false ? 'Nada mudou' : 'Kit salvo'); } catch (err) { sv.disabled = false; $('#kErr', o).textContent = errMsg(err); }
      };
      const dk = $('#kDup', o); if (dk) dk.onclick = () => { const cp = JSON.parse(JSON.stringify(rec)); delete cp.id; delete cp.ord; cp.desc = cp.desc + ' (CÓPIA)'; close(); kitModal(kind, null, cp); toast('Cópia: troque a descrição e ajuste os componentes'); };
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
        ${m.miss.length ? `<details style="margin-top:10px"><summary class="sub">Ver os ${m.miss.length} não encontrados (registros novos)</summary><p class="sub">${m.miss.slice(0, 200).map((x) => esc(x.key)).join(' · ')}</p>
          <div class="fields" style="margin-top:6px"><div class="f span2"><label for="impNovaFam">Cadastrar os novos como provisórios na família</label><select id="impNovaFam">${famList().map((f) => `<option value="${esc(f)}">${esc(famNome(f))}</option>`).join('')}</select></div><div class="f"><button class="btn sm" id="impNovos" style="margin-top:22px">Conferir e cadastrar ${Math.min(100, m.miss.filter((x) => !/^\d{1,2}-\d+$/.test(x.key)).length)} provisório(s)</button></div></div>
          <p class="sub">Entram com situação "Provisório" e o preço do arquivo, para validação de Engenharia/Custos antes de ir para as propostas. Códigos (01-1234) não encontrados não viram cadastro; descrições sim.</p></details>` : ''}
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
    const nv = $('#impNovos'); if (nv) nv.onclick = () => {
      const fam = $('#impNovaFam').value; const m = matchImport(); const cfg = famCfg(); const lista = []; const ja = new Set();
      for (const x of m.miss) { if (/^\d{1,2}-\d+$/.test(x.key)) continue; const produto = x.key.replace(/\s+/g, ' ').trim().toUpperCase(); if (ja.has(produto)) continue; ja.add(produto);
        const dups = FAMS_F.duplicidades({ id: null, fam, produto }, REG.insumos, cfg).filter((d) => d.nivel !== 'semelhante'); lista.push({ produto, valor: x.price, pad: FAMS_F.checar(fam, produto, cfg), dups }); if (lista.length >= 100) break; }
      modal(`<h2>Novos cadastros provisórios · ${esc(fam)}</h2><div class="tw" style="max-height:50vh;overflow:auto"><table class="t"><thead><tr><th></th><th>Descrição</th><th>Preço</th><th>Conferência</th></tr></thead><tbody>${lista.map((x, i) => `<tr><td class="in"><input type="checkbox" data-impn="${i}"${x.dups.length ? '' : ' checked'} aria-label="Cadastrar"></td><td>${esc(x.produto)}</td><td class="n">${typeof x.valor === 'number' ? brl(x.valor) : '—'}</td><td><small>${x.dups.length ? '<span class="bad-t">possível duplicidade: ' + esc(x.dups.map((d) => d.x.id).join(', ')) + '</span>' : ''}${x.pad ? ' <span class="warn-t">' + esc(x.pad) + '</span>' : x.dups.length ? '' : '<span class="ok-t">ok</span>'}</small></td></tr>`).join('')}</tbody></table></div>
        <div style="display:flex;gap:8px"><button class="btn pri" id="inOk">Cadastrar marcados como provisórios</button><button class="btn" data-close>Cancelar</button></div><p class="sub" id="inProg" style="margin:0"></p>`, (o, close) => {
        $('#inOk', o).onclick = async () => { const sel = [...o.querySelectorAll('[data-impn]:checked')].map((c) => lista[+c.dataset.impn]); if (!sel.length) { toast('Nada marcado'); return; } $('#inOk', o).disabled = true; let n = 0;
          try { for (const x of sel) { const c = REG.insumos.some((i) => i.fam === fam) ? REG.nextCode(fam) : { a: H.famCode(fam), b: H.famCode(fam) * 1000 + 1 };
              await REG.saveInsumo({ id: REG.newInsumoId(c.a, c.b), a: c.a, b: c.b, fam, produto: x.produto, valor: typeof x.valor === 'number' ? x.valor : null, origem: 'NAC', situacao: 'provisorio', fonte: imp.name, dataCot: new Date().toISOString().slice(0, 10), obs: 'importado de ' + imp.name + (x.pad ? ' · fora do padrão: ' + x.pad : ''), excecao: x.pad ? 'importação: conferir a descrição' : undefined }, true);
              n++; const pg = $('#inProg', o); if (pg) pg.textContent = n + ' de ' + sel.length + ' cadastrados…'; }
            close(); toast(n + ' provisório(s) cadastrado(s). Valide na lista de insumos (situação Provisório).'); ui.insSit = 'provisorio'; ui.pg_insumos = 1; ui.cad = 'insumos'; imp = null; render(); } catch (er) { $('#inOk', o).disabled = false; toast(errMsg(er)); } };
      });
    };
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
  // modelo de cada família: vem do gerador central (familias.js + Campos por família), o mesmo que monta a descrição no cadastro
  const padRegra = (k) => { const pp = FAMS_F.padraoDe(String(k).padStart(2, '0') + '.', famCfg()); return pp && pp.modelo ? pp.modelo.toUpperCase().replace(/\{([A-Z]+)\}/g, (m, x) => '{' + ((pp.campos || []).find((c) => c.k.toUpperCase() === x) || { lb: x }).lb.toUpperCase() + '}') + ' — campos entre [ ] só entram quando preenchidos' : '—'; };
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
        <div class="kv" style="grid-template-columns:minmax(0,1fr) minmax(0,3fr)">${Object.keys(FAM_PAD).map((k) => [k, padRegra(k)]).map(([k, r]) => `<div>${FAM_PAD[k]}</div><div class="code" style="text-align:left;font-weight:500;white-space:normal;overflow-wrap:anywhere;min-width:0">${esc(r)}</div>`).join('')}</div>
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
  // logo da empresa: enviado pelo app, vale no topo e nos PDFs
  const logoAtual = () => ((REG.tabelas || {}).MARCA || {}).logo || '';
  // o menu usa a versão para fundo escuro; os PDFs usam o logo original (#logoPdf). Logo próprio da empresa vale nos dois, no menu sobre fundo branco
  const LOGO_ORIG = { side: (document.querySelector('.sidenav .logo-plate img') || {}).getAttribute?.('src'), pdf: (document.getElementById('logoPdf') || {}).getAttribute?.('src') };
  function aplicaLogo() {
    const img = document.querySelector('.sidenav .logo-plate img'), pdf = document.getElementById('logoPdf'); const lg = logoAtual();
    const quer = { side: lg || LOGO_ORIG.side, pdf: lg || LOGO_ORIG.pdf };
    if (img && quer.side && img.getAttribute('src') !== quer.side) img.setAttribute('src', quer.side);
    if (pdf && quer.pdf && pdf.getAttribute('src') !== quer.pdf) pdf.setAttribute('src', quer.pdf);
    const pl = document.querySelector('.sidenav .logo-plate'); if (pl) pl.classList.toggle('custom', !!lg);
  }
  function logoCard() {
    const ed = REG.areaOk('sistema');
    return `<section class="card"><h2>Logo <span class="sub">topo do app, memorial e PDFs</span></h2>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="logo-plate custom" style="border:1px solid var(--line)"><img src="${esc(logoAtual() || (document.getElementById('logoPdf') || {}).src || '')}" alt="Logo atual" style="height:44px"></span>
      ${ed ? '<label class="btn pri" for="logoUp">Trocar logo (PNG, JPG ou SVG)</label><input type="file" id="logoUp" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>' + (logoAtual() ? ' <button class="btn" data-logoreset>Voltar ao original</button>' : '') : '<span class="sub">Só quem cuida de Sistema troca o logo.</span>'}</div></section>`;
  }
  async function salvaLogo(dataUrl, desc) { try { await REG.setTable('MARCA', dataUrl ? { logo: dataUrl } : {}, desc, []); render(); toast(dataUrl ? 'Logo trocado' : 'Logo original'); } catch (e) { toast(errMsg(e)); } }
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'logoUp') return; const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const src = String(rd.result);
      if (/svg/.test(f.type)) { if (src.length > 300000) { toast('SVG grande demais (máx. 300 KB)'); return; } salvaLogo(src, 'Logo trocado (' + f.name + ')'); return; }
      // reduz para 120 px de altura: fica leve e nítido no topo e nos PDFs
      const im = new Image(); im.onload = () => { const h = Math.min(120, im.naturalHeight); const w = Math.round(im.naturalWidth * h / im.naturalHeight); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h); salvaLogo(cv.toDataURL('image/png'), 'Logo trocado (' + f.name + ')'); };
      im.onerror = () => toast('Não consegui ler essa imagem'); im.src = src;
    };
    rd.readAsDataURL(f);
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-logoreset]')) salvaLogo(null, 'Logo original restaurado'); });
  const PAPEIS_AP = [['ap_diretoria', 'Diretoria', 'aprova desconto fora da política'], ['ap_financeiro', 'Financeiro', 'aprova desconto fora da política']];
  // ---------- perfis e permissões ----------
  // Os perfis saem do nível de compartilhamento do app (garantido pelo banco) e das listas de responsáveis e aprovadores,
  // que só o dono do app grava (regra do banco em meta/acessos).
  const PERFIS = [['admin', 'Administrador'], ['diretoria', 'Diretoria Comercial'], ['comercial', 'Comercial'], ['engenharia', 'Engenharia'], ['custos', 'Compras/Custos'], ['finfiscal', 'Financeiro/Fiscal'], ['consulta', 'Consulta']];
  const PERFIL_DE = { admin: 'dono do app', diretoria: 'na lista de aprovadores Diretoria', comercial: 'compartilhado como Contribuidor ou Editor', engenharia: 'na área Engenharia (e Editor)', custos: 'na área Custos (e Editor)', finfiscal: 'na lista de aprovadores Financeiro ou na área Fiscal', consulta: 'compartilhado como Leitor' };
  function meusPerfis() {
    if (REG.mode !== 'shared') return ['admin'];
    const ac = REG.acessos || {}; const tem = (k) => (ac[k] || []).includes(REG.me); const out = [];
    if (REG.isOwner) out.push('admin'); if (tem('ap_diretoria')) out.push('diretoria'); if (REG.canSaveShared) out.push('comercial');
    if (tem('engenharia')) out.push('engenharia'); if (tem('custos')) out.push('custos'); if (tem('ap_financeiro') || tem('fiscal')) out.push('finfiscal');
    if (!REG.canSaveShared) out.push('consulta');
    return out;
  }
  // ação · perfis que podem · onde a regra é garantida
  const PERMS = [
    ['Consultar propostas, margens e cadastro', ['admin', 'diretoria', 'comercial', 'engenharia', 'custos', 'finfiscal', 'consulta'], 'banco'],
    ['Criar, editar e salvar propostas; pendências; documentos', ['admin', 'diretoria', 'comercial', 'engenharia', 'custos', 'finfiscal'], 'banco (Contribuidor ou acima)'],
    ['Mandar proposta para a lixeira', ['admin', 'comercial'], 'app: o Comercial só o rascunho que criou'],
    ['Apagar proposta de vez · restaurar backup', ['admin'], 'app'],
    ['Aprovar desconto pela Diretoria', ['admin', 'diretoria'], 'banco + conferência na leitura: assinatura gravada no espaço da própria pessoa e lista de aprovadores'],
    ['Aprovar desconto pelo Financeiro', ['admin', 'finfiscal'], 'banco + conferência na leitura (só quem está na lista Financeiro)'],
    ['Alterar cadastro de Custos', ['admin', 'custos'], 'banco (Editor) + app (área)'],
    ['Alterar Engenharia', ['admin', 'engenharia'], 'banco (Editor) + app (área)'],
    ['Alterar Fiscal', ['admin', 'finfiscal'], 'banco (Editor) + app (área; só quem está na área Fiscal)'],
    ['Lançar custo real', ['admin', 'engenharia', 'custos'], 'app'],
    ['Conferir previsto × realizado', ['admin', 'finfiscal'], 'app'],
    ['Definir responsáveis, aprovadores e perfis', ['admin'], 'banco (só o dono grava)']];
  function perfisCard() {
    const meus = meusPerfis();
    return `<section class="card"><h2>Perfis e permissões <span class="sub">quem pode o quê</span></h2>
      <p class="sub" style="margin:0 0 8px">${REG.mode === 'shared' ? `Seus perfis: ${meus.map((k) => `<span class="pill ok">${esc(PERFIS.find((x) => x[0] === k)[1])}</span>`).join(' ')}` : '<b>Neste arquivo (modo local) não há login nem controle de acesso: quem abre o arquivo faz tudo, como administrador.</b> Os perfis abaixo valem no app compartilhado.'}</p>
      <div class="tw"><table class="t perm"><thead><tr><th>Ação</th>${PERFIS.map(([k, lb]) => `<th title="${esc(PERFIL_DE[k])}">${esc(lb)}</th>`).join('')}<th>Onde é garantido</th></tr></thead><tbody>
        ${PERMS.map(([a, ps, onde]) => `<tr><td>${esc(a)}</td>${PERFIS.map(([k]) => `<td class="c">${ps.includes(k) ? '<span class="ok-t" aria-label="pode">✓</span>' : '<span class="sub" aria-label="não pode">—</span>'}</td>`).join('')}<td><small class="sub">${esc(onde)}</small></td></tr>`).join('')}</tbody></table></div>
      <p class="sub" style="margin:8px 0 0"><b>Banco</b>: a regra é do banco compartilhado do claude.ai e vale mesmo fora da tela (nível de compartilhamento: Leitor, Contribuidor, Editor, dono). <b>App</b>: o app confere antes de gravar e registra no histórico, mas o banco só distingue nível de compartilhamento; uma pessoa com acesso de Contribuidor e conhecimento técnico poderia gravar direto pelo navegador. Esses casos ficam no histórico e estão descritos nas limitações da REV22. Sem ninguém nas áreas, todo Editor altera todo o cadastro; sem aprovadores definidos, qualquer Editor aprova.</p></section>`;
  }
  // ---- numeração e máscaras (Administração) ----
  // botão "gerar nº" ao lado do número da proposta (só com a série ligada) e aviso de número repetido
  window.LSNumGerar = (serie, alvo, valor) => {
    const cfg = REG.serieCfg ? REG.serieCfg(serie) : null; const dup = REG.numeroDuplicado && REG.numeroDuplicado(valor, state.id);
    return (cfg && cfg.ativa && !state.verRev ? ` <button type="button" class="restore" data-numgerar="${esc(serie)}" data-numalvo="${esc(alvo)}" title="Reserva o próximo número da série ${esc(REG.NUM_SERIES[serie])} (sem repetir, também com várias pessoas ao mesmo tempo)">gerar nº ${esc((() => { const a = String(new Date().getFullYear()); return String(cfg.prefixo || '') + (cfg.anual ? (cfg.formatoAno === 'AA' ? a.slice(-2) : a) + String(cfg.sepAno ?? '-') : ''); })())}…</button>` : '')
      + (dup ? ` <small class="cadnovo" role="status">Este número já está em outra proposta salva${cfg && cfg.bloqueio ? ': troque antes de salvar' : ''}.</small>` : '');
  };
  document.addEventListener('click', async (e) => { const b = e.target.closest('[data-numgerar]'); if (!b || state.verRev) return; e.preventDefault();
    const inp = document.querySelector(b.dataset.numalvo); if (!inp) return;
    if (String(inp.value || '').trim() && !await DLG.confirmar('Trocar o número "' + inp.value + '" por um número novo da série? O número atual não é apagado de nenhuma outra proposta.')) return;
    b.disabled = true; try { const n = await REG.reservarNumero(b.dataset.numgerar, state.id); inp.value = n; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); toast('Número reservado: ' + n + '. Salve a proposta para gravá-lo nela.'); } catch (er) { toast(errMsg(er)); } finally { b.disabled = false; } });
  function vNumeracao() {
    const adm = REG.ehAdmin(); const ser = Object.keys(REG.NUM_SERIES);
    if (adm) queueMicrotask(nmLista);
    if (!adm) return `<section class="card"><h2>Numeração e máscaras</h2><p class="sub">Só o administrador configura as séries de numeração. ${ser.filter((k) => REG.serieCfg(k).ativa).map((k) => esc(REG.NUM_SERIES[k]) + ': ' + esc(REG.formatarNumero(REG.serieCfg(k), REG.serieCfg(k).inicio))).join(' · ') || 'Nenhuma série ligada: o número da proposta é digitado.'}</p></section>`;
    const card = (k) => { const c = REG.serieCfg(k); const id = (x) => 'nm_' + k + '_' + x;
      return `<section class="card" data-numserie="${k}"><h2>${esc(REG.NUM_SERIES[k])} ${c.ativa ? '<span class="pill ok">ligada</span>' : '<span class="pill mute">desligada (número digitado)</span>'}</h2>
        <div class="fields">
          <div class="f"><label for="${id('ativa')}">Série</label><select id="${id('ativa')}" data-nm="ativa"><option value="0"${c.ativa ? '' : ' selected'}>desligada: número digitado</option><option value="1"${c.ativa ? ' selected' : ''}>ligada: botão "gerar nº"</option></select></div>
          <div class="f"><label for="${id('prefixo')}">Prefixo</label><input id="${id('prefixo')}" data-nm="prefixo" value="${esc(c.prefixo)}" maxlength="12"></div>
          <div class="f"><label for="${id('anual')}">Ano no número</label><select id="${id('anual')}" data-nm="anual"><option value="1"${c.anual ? ' selected' : ''}>sim, recomeça a cada ano</option><option value="0"${c.anual ? '' : ' selected'}>não, sequência contínua</option></select></div>
          <div class="f"><label for="${id('formatoAno')}">Formato do ano</label><select id="${id('formatoAno')}" data-nm="formatoAno"><option${c.formatoAno === 'AAAA' ? ' selected' : ''}>AAAA</option><option${c.formatoAno === 'AA' ? ' selected' : ''}>AA</option></select></div>
          <div class="f"><label for="${id('sepAno')}">Separador depois do ano</label><input id="${id('sepAno')}" data-nm="sepAno" value="${esc(c.sepAno)}" maxlength="3"></div>
          <div class="f"><label for="${id('posicoes')}">Posições do sequencial</label><input id="${id('posicoes')}" data-nm="posicoes" type="number" min="1" max="12" value="${esc(c.posicoes)}"></div>
          <div class="f"><label for="${id('inicio')}">Começa em</label><input id="${id('inicio')}" data-nm="inicio" type="number" min="1" value="${esc(c.inicio)}"></div>
          <div class="f"><label for="${id('sufixo')}">Sufixo</label><input id="${id('sufixo')}" data-nm="sufixo" value="${esc(c.sufixo)}" maxlength="12"></div>
          <div class="f span2"><label for="${id('bloqueio')}">Número repetido</label><select id="${id('bloqueio')}" data-nm="bloqueio"><option value="0"${c.bloqueio ? '' : ' selected'}>avisa e deixa salvar</option><option value="1"${c.bloqueio ? ' selected' : ''}>não deixa salvar com número de outra proposta</option></select></div>
        </div>
        <p class="sub" style="margin:8px 0 0">Prévia: <b data-nmprev>${esc(REG.formatarNumero(c, c.inicio))}</b> · o contador nunca volta: número reservado não é reaproveitado, mesmo que a proposta seja excluída.</p></section>`; };
    return `<div class="stack"><section class="card"><h2>Numeração e máscaras</h2><p class="sub" style="margin:0">Séries de numeração por tipo de documento. <b>Nada é renumerado</b>: propostas e insumos existentes ficam como estão. Com a série ligada, o campo "Nº da proposta" ganha o botão <b>gerar nº</b>, que reserva o próximo número com trava no banco compartilhado (duas pessoas ao mesmo tempo nunca recebem o mesmo número); o número continua podendo ser digitado. Códigos de insumo não mudam: o motor de cálculo usa família + sequência (ex.: 01-1001).${REG.mode === 'shared' ? '' : ' <b>Neste navegador</b> (arquivo local), a numeração vale só aqui: sem banco compartilhado, não há como evitar colisão com outras pessoas.'}</p></section>
      ${ser.map(card).join('')}
      <div><button class="btn pri" data-nmsalvar>Salvar a numeração</button></div>
      <section class="card"><h2>Últimos números reservados</h2><div data-nmlista><p class="sub">Carregando…</p></div></section></div>`;
  }
  const nmLer = (root) => { const out = {}; for (const sec of root.querySelectorAll('[data-numserie]')) { const k = sec.dataset.numserie; const g = (x) => (sec.querySelector(`[data-nm="${x}"]`) || {}).value;
    out[k] = { ativa: g('ativa') === '1', prefixo: g('prefixo') || '', anual: g('anual') === '1', formatoAno: g('formatoAno') || 'AAAA', sepAno: g('sepAno') ?? '-', posicoes: +g('posicoes') || 5, inicio: +g('inicio') || 1, sufixo: g('sufixo') || '', bloqueio: g('bloqueio') === '1' }; } return out; };
  document.addEventListener('input', (e) => { const sec = e.target.closest && e.target.closest('[data-numserie]'); if (!sec) return; const c = nmLer(sec.parentElement)[sec.dataset.numserie]; const pv = sec.querySelector('[data-nmprev]'); if (pv) pv.textContent = REG.formatarNumero(c, c.inicio); });
  document.addEventListener('change', (e) => { const sec = e.target.closest && e.target.closest('[data-numserie]'); if (!sec) return; const c = nmLer(sec.parentElement)[sec.dataset.numserie]; const pv = sec.querySelector('[data-nmprev]'); if (pv) pv.textContent = REG.formatarNumero(c, c.inicio); });
  document.addEventListener('click', async (e) => { if (!e.target.closest('[data-nmsalvar]')) return; try { await REG.salvarNumeracao(nmLer(document.getElementById('app')), 'Numeração e máscaras'); toast('Numeração salva'); render(); } catch (er) { toast(errMsg(er)); } });
  async function nmLista() { const el = document.querySelector('[data-nmlista]'); if (!el || el.dataset.ok) return; el.dataset.ok = '1';
    try { const L = await REG.numerosReservados(); el.innerHTML = L.length ? `<div class="tw"><table class="t"><thead><tr><th>Número</th><th>Série</th><th>Quando</th><th>Quem</th></tr></thead><tbody>${L.slice(0, 30).map((x) => `<tr><td><b>${esc(x.numero)}</b></td><td>${esc(REG.NUM_SERIES[x.serie] || x.serie)}</td><td>${esc(fmtAt(x.at))}</td><td>${who(x.by)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Nenhum número reservado ainda.</p>'; fillNames(el); } catch (er) { el.innerHTML = '<p class="sub">Não consegui ler os números reservados: ' + esc(errMsg(er)) + '</p>'; } }
  function vAcessos() {
    if (REG.mode !== 'shared') return perfisCard() + logoCard() + avisosCard() + '<section class="card"><p class="sub" style="margin:0">Os responsáveis por área e os aprovadores valem no app compartilhado (claude.ai). Neste arquivo, quem abre edita e aprova tudo.</p></section>';
    const own = REG.isOwner; const ac = REG.acessos || {};
    const rows = AREAS.filter((a) => a[0] !== 'sistema').concat(PAPEIS_AP).map(([k, lb, d]) => `<tr><td><b>${esc(lb)}</b><br><small class="sub">${esc(d)}</small></td>
      <td>${(ac[k] || []).map((id) => `<span class="pchip"><span data-uid="${esc(id)}">…</span>${own ? `<button class="restore" data-acrm="${k}|${esc(id)}" aria-label="Remover">×</button>` : ''}</span>`).join(' ') || `<span class="sub">${/^ap_/.test(k) ? 'ninguém: qualquer Editor aprova' : 'ninguém (só o dono edita)'}</span>`}</td>
      <td>${own ? `<button class="btn sm" data-acadd="${k}">+ Pessoa</button>` : ''}</td></tr>`).join('');
    return `<div class="stack">
      <section class="card"><h2>Responsáveis por área</h2>
        <p class="sub" style="margin:0 0 10px">Cada área do cadastro só pode ser alterada por quem está nela. ${REG.areasConfiguradas() ? '' : '<b>Ainda não há ninguém definido: hoje todo Editor altera tudo.</b> Ao incluir a primeira pessoa, a trava passa a valer.'} O dono do app altera tudo.</p>
        <div class="tw"><table class="t"><thead><tr><th>Área</th><th>Pessoas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="sub" style="margin:10px 0 0">As duas últimas linhas são os aprovadores de desconto fora da política: cada pedido precisa do sim da Diretoria e do Financeiro.${own ? '' : ' Só o dono do app muda esta lista.'}</p></section>
      ${perfisCard()}${logoCard()}${avisosCard()}
      <section class="card"><h2>Como dar acesso</h2><div class="kv" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
        <div>Comercial e vendedores</div><div style="text-align:left;font-weight:400">Compartilhe o app como <b>Contribuidor</b>: fazem e salvam propostas, anexam documentos e não alteram nenhum cadastro (o banco bloqueia).</div>
        <div>Custos, Engenharia, Fiscal, Precificação, Serviços</div><div style="text-align:left;font-weight:400">Compartilhe como <b>Editor</b> e inclua a pessoa na área acima. O app só libera a edição das áreas dela.</div>
        <div>Leitura</div><div style="text-align:left;font-weight:400">Como <b>Leitor</b>, a pessoa consulta propostas, margens e cadastro sem alterar nada.</div></div></section>
    </div>`;
  }
  async function acSave(mut, desc) { const a = JSON.parse(JSON.stringify(REG.acessos || {})); mut(a); try { await REG.setAcessos(a, desc); toast('Responsáveis atualizados'); } catch (e) { toast(errMsg(e)); } }
  document.addEventListener('click', (e) => {
    if (!['cadastro', 'config'].includes(ui.view) || ui.cad !== 'acessos') return;
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

  // ---------- backup e restauração ----------
  const COLECOES = [['propostas', 'Propostas', 'lspricer.saved'], ['revisoes', 'Revisões', 'lspricer.revisoes.v1'], ['aprovacoes', 'Aprovações', 'lspricer.aprovacoes.v1'], ['fechamentos', 'Baixas e custo real', 'lspricer.fechamentos.v1'],
    ['pedidos', 'Pedidos de cadastro', 'lspricer.pedidos.v1'], ['documentos', 'Documentos (só os dados; os arquivos não vão no backup)', 'lspricer.docs.v1'], ['pendencias', 'Acompanhamento de pendências', 'lspricer.pendencias.v1'], ['modelos', 'Modelos de item', 'lspricer.modelos.v1']];
  async function lerColecao(nome, lsk) {
    if (REG.mode === 'shared' && REG.db) { try { const q = await REG.db.collection(nome).get(); return Object.fromEntries(q.docs.map((d) => [d.id, d.data()])); } catch (e) { return {}; } }
    const v = store.get(lsk, null); if (!v) return {}; if (Array.isArray(v)) return Object.fromEntries(v.map((x) => { const c = Object.assign({}, x); const id = c.id; delete c.id; return [id, c]; })); return v;
  }
  async function montarBackup() {
    const b = { app: 'ls-pricer', rev: 'REV22', criadoEm: new Date().toISOString(), modo: REG.mode, colecoes: {}, cadastro: { insumos: REG.insumos, kitMotor: REG.kitMotor, kitBomba: REG.kitBomba, tabelas: REG.tabelas, acessos: REG.acessos || {} }, historico: REG.historico || [] };
    for (const [k, , lsk] of COLECOES) b.colecoes[k] = await lerColecao(k, lsk);
    return b;
  }
  function vBackup() {
    const pre = store.get('lspricer.backup.antes-rev22', null);
    return `<div class="stack"><section class="card"><h2>Backup <span class="sub">tudo o que o app guarda, num arquivo .json</span></h2>
      <p class="sub" style="margin:0 0 8px">Propostas, revisões, aprovações, baixas e custo real, pedidos, dados dos documentos, cadastro (insumos, kits, tabelas e parâmetros) e histórico${REG.mode === 'shared' ? ', do banco da equipe' : ', deste navegador'}. Os arquivos anexados (PDFs) não entram: baixe-os pela tela Documentos.</p>
      <div class="docbar"><button class="btn pri" data-bkbaixa>Baixar backup completo</button>${pre ? `<button class="btn" data-bkpre>Baixar a cópia automática de antes da REV22 (${esc(fmtAt(pre.criadoEm))})</button>` : ''}</div></section>
      <section class="card"><h2>Restaurar <span class="sub">a partir de um backup</span></h2>
      <p class="sub" style="margin:0 0 8px">O app mostra o que tem no arquivo e o que vai mudar antes de gravar. Por padrão só acrescenta o que não existe; quando o registro já existe, a versão atual vai para as revisões antes de ser substituída.</p>
      ${REG.ehAdmin() ? '<label class="btn" for="bkArq">Escolher arquivo de backup (.json)</label><input type="file" id="bkArq" accept=".json,application/json" hidden>' : '<p class="sub" style="margin:0"><b>Só o administrador (dono do app) restaura backups.</b></p>'}</section>
      ${vLixeira()}</div>`;
  }
  // lixeira: propostas excluídas ficam aqui até o administrador apagar de vez
  function vLixeira() {
    const L = REG.lixeira().sort((a, b) => String(b.excluida.at).localeCompare(String(a.excluida.at)));
    return `<section class="card"><h2>Lixeira <span class="sub">${L.length} proposta(s) excluída(s)</span></h2>
      ${L.length ? `<div class="tw"><table class="t"><thead><tr><th>Proposta</th><th>Excluída em</th><th></th></tr></thead><tbody>${L.map((p) => `<tr><td><b>${esc(p.numero || p.name || '—')}</b><br><small class="sub">${esc(p.cliente || '')}${typeof p.total === 'number' ? ' · ' + brl(p.total) : ''}</small></td><td>${esc(fmtAt(p.excluida.at))}<br><small class="sub">${who(p.excluida.by)}</small></td>
        <td style="white-space:nowrap"><button class="btn sm" data-lxrest="${esc(p.id)}">Restaurar</button>${REG.ehAdmin() ? ` <button class="btn sm" data-lxdel="${esc(p.id)}">Apagar de vez</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Vazia. Quando alguém exclui uma proposta, ela vem para cá e pode ser restaurada.</p>'}
      <p class="sub" style="margin:8px 0 0">Excluir manda para a lixeira (o administrador ou quem criou o rascunho). Apagar de vez é só do administrador${REG.mode === 'shared' ? ', e as revisões guardadas continuam no banco' : ''}.</p></section>`;
  }
  document.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-lxrest]'); const d = e.target.closest('[data-lxdel]'); if (!r && !d) return;
    const p = REG.lixeira().find((x) => x.id === (r || d).dataset[r ? 'lxrest' : 'lxdel']); if (!p) return;
    try {
      if (r) { await REG.restaurarLixeira(p); logEv({ tipo: 'Proposta restaurada da lixeira', ref: p.id, desc: p.name || '', mudancas: [] }); toast('Proposta restaurada'); }
      else { if (!await DLG.confirmar('Apagar de vez "' + (p.numero || p.name) + '"? Não dá para desfazer (só por um backup).')) return; await REG.deleteProposta(p.id, !!p.local); logEv({ tipo: 'Proposta apagada de vez', ref: p.id, desc: p.name || '', mudancas: [] }); toast('Apagada'); }
      render();
    } catch (er) { toast(errMsg(er)); }
  });
  async function baixarJson(nome, obj) { const ok = await REG.save(nome, JSON.stringify(obj, null, 1), 'application/json'); if (!ok) toast('Download cancelado'); }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-bkbaixa]')) { toast('Montando o backup…'); const b = await montarBackup(); await baixarJson('ls-pricer-backup-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json', b); logEv({ tipo: 'Backup baixado', ref: 'backup', desc: Object.entries(b.colecoes).map(([k, v]) => k + ': ' + Object.keys(v).length).join(' · '), mudancas: [] }); return; }
    if (e.target.closest('[data-bkpre]')) { await baixarJson('ls-pricer-antes-rev22.json', store.get('lspricer.backup.antes-rev22', {})); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'bkArq') return; const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (!REG.ehAdmin()) { toast('Só o administrador restaura backups'); return; }
    const rd = new FileReader(); rd.onload = () => { let b; try { b = JSON.parse(rd.result); } catch (er) { toast('Arquivo inválido'); return; } if (!b || b.app !== 'ls-pricer' || !b.colecoes) { toast('Esse arquivo não é um backup do LS Pricer'); return; } restaurarModal(b); }; rd.readAsText(f);
  });
  async function restaurarModal(b) {
    const atual = {}; for (const [k, , lsk] of COLECOES) atual[k] = await lerColecao(k, lsk);
    const linhas = COLECOES.map(([k, lb]) => { const B = b.colecoes[k] || {}; const ids = Object.keys(B); const novos = ids.filter((id) => !atual[k][id]); const iguais = ids.filter((id) => atual[k][id] && JSON.stringify(atual[k][id]) === JSON.stringify(B[id])); const dif = ids.length - novos.length - iguais.length;
      return { k, lb, total: ids.length, novos: novos.length, dif, iguais: iguais.length }; });
    const podeCad = REG.mode === 'local';
    modal(`<h2>Restaurar backup de ${esc(fmtAt(b.criadoEm))}</h2><p class="sub" style="margin:0">Gerado ${esc(b.rev || '')} · ${b.modo === 'shared' ? 'banco da equipe' : 'navegador'}.</p>
      <div class="tw"><table class="t"><thead><tr><th></th><th>O que</th><th>No arquivo</th><th>Novos</th><th>Diferentes do atual</th><th>Iguais</th></tr></thead><tbody>${linhas.map((x) => `<tr><td><input type="checkbox" data-bkcol="${x.k}"${x.total ? ' checked' : ' disabled'}></td><td>${esc(x.lb)}</td><td class="n">${x.total}</td><td class="n">${x.novos}</td><td class="n">${x.dif}</td><td class="n">${x.iguais}</td></tr>`).join('')}
        <tr><td><input type="checkbox" data-bkcad${podeCad ? '' : ' disabled'}></td><td>Cadastro (insumos, kits, tabelas)</td><td class="n" colspan="4">${podeCad ? 'substitui o cadastro deste navegador inteiro' : 'no banco da equipe, o cadastro se restaura pelo Cadastros → Importar preços e pelas tabelas; aqui só as coleções acima'}</td></tr></tbody></table></div>
      <label class="chk"><input type="checkbox" id="bkSubst"> Substituir também os registros diferentes (a versão atual de cada proposta vai antes para as revisões)</label>
      <div style="display:flex;gap:8px"><button class="btn pri" id="bkOk">Restaurar o que está marcado</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      $('#bkOk', o).onclick = async () => {
        const cols = [...o.querySelectorAll('[data-bkcol]:checked')].map((x) => x.dataset.bkcol); const subst = $('#bkSubst', o).checked; const cad = podeCad && o.querySelector('[data-bkcad]').checked;
        if (!await DLG.confirmar('Confirmar a restauração?')) return; close(); let n = 0, pul = 0;
        for (const k of cols) { const lsk = COLECOES.find((c) => c[0] === k)[2]; const B = b.colecoes[k] || {};
          for (const [id, body] of Object.entries(B)) { const cur = atual[k][id]; if (cur && JSON.stringify(cur) === JSON.stringify(body)) continue; if (cur && !subst) { pul++; continue; }
            if (cur && k === 'propostas') await revGravar({ propId: id, rev: revDe(cur), at: cur.at, by: cur.by || null, statusEra: cur.status || 'rascunho', motivoProxima: 'substituída por restauração de backup', total: cur.total ?? null, margemPct: cur.resumo ? cur.resumo.margemPct : null, numero: cur.numero || '', cliente: cur.cliente || '', body: cur }, '_bk' + Date.now().toString(36)).catch(() => {});
            if (REG.mode === 'shared' && REG.db) await REG.db.doc(k + '/' + id).set(body);
            else { const v = store.get(lsk, null); if (Array.isArray(v) || k === 'documentos') { const arr = (v || []).filter((x) => x.id !== id); arr.unshift(Object.assign({ id }, body)); store.set(lsk, arr); } else { const all = v || {}; all[id] = body; store.set(lsk, all); } }
            n++; } }
        if (cad) { localStorage.setItem('lspricer.registry.v1', JSON.stringify({ insumos: b.cadastro.insumos, kitMotor: b.cadastro.kitMotor, kitBomba: b.cadastro.kitBomba, tabelas: b.cadastro.tabelas || {} })); }
        logEv({ tipo: 'Backup restaurado', ref: 'backup', desc: n + ' registro(s) restaurado(s)' + (pul ? ', ' + pul + ' mantido(s) como estavam' : '') + (cad ? ' · cadastro substituído' : '') + ' · backup de ' + fmtAt(b.criadoEm), mudancas: [] });
        toast(n + ' registro(s) restaurado(s). Recarregando…'); setTimeout(() => location.reload(), 900);
      };
    });
  }
  // cópia automática do que está no navegador antes da primeira abertura da REV22 (para voltar à REV21)
  (function () { try { if (localStorage.getItem('lspricer.backup.antes-rev22')) return; const o = { app: 'ls-pricer', rev: 'REV21', criadoEm: new Date().toISOString(), chaves: {} }; let tam = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^lspricer\./.test(k)) { o.chaves[k] = localStorage.getItem(k); tam += o.chaves[k].length; } }
      // só guarda se couber com folga (o limite do navegador costuma ser ~5 MB); senão, o backup manual cobre
      if (tam > 0 && tam < 1500000) localStorage.setItem('lspricer.backup.antes-rev22', JSON.stringify(o)); } catch (e) { /* sem espaço: segue */ } })();

  function vHistorico() {
    const q = (ui.histQ || '').trim().toLowerCase(); const T = ui.histT || '';
    const grupoH = (t) => /^(Proposta|Status|Alerta|Aprovação|Etapa da proposta|Revisão|Pendência)/.test(t) ? 'propostas' : /^(Baixa|Custo real|Execução)/.test(t) ? 'margens' : /^Documento/.test(t) ? 'documentos' : /^Pedido/.test(t) ? 'pedidos' : /^(Acessos|Backup|Restauração)/.test(t) ? 'acessos' : 'cadastro';
    const list = REG.historico.filter((h) => !T || grupoH(h.tipo || '') === T).filter((h) => !q || [h.tipo, h.desc, h.ref, ...(h.mudancas || []).map((m) => m.campo)].join(' ').toLowerCase().includes(q)).slice(0, 250);
    const items = list.map((h) => {
      const muds = h.mudancas || []; const many = muds.length > 12;
      const lote = /^(Edição em massa|Importação de preços|Consolidação de cadastro)$/.test(h.tipo || '') && REG.areaOk('custos') ? `<button class="restore" data-desfaz="${esc(h.at)}" data-ref="${esc(String(h.ref))}">desfazer este lote</button> ` : '';
      return `<div class="hrow"><div class="hmeta"><b>${fmtAt(h.at)}</b><small>${who(h.by)}</small></div><div><div><span class="pill mute">${esc(h.tipo)}</span> ${esc(h.desc || '')} ${lote}${h.ref && !/^import$/.test(h.ref) && !String(h.ref).includes('!') && REG.insumos.some((x) => x.id === h.ref) ? `<button class="restore" data-ins="${esc(h.ref)}">abrir</button>` : ''}</div>
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
  // onde o insumo entra: estruturas (fixo, por porte, tamanho), formações fechadas e propostas
  function ondeUsado(ins) {
    const p = ins.produto; const out = []; const lines = recLines();
    const TB = { FAIXA: [MO, 157, 166, 'D', 'B', 'C', 'motor diesel de', ' HP'], CV: [MO, 172, 187, 'D', 'B', 'C', 'motor elétrico de', ' CV'], VAZAO: ['KIT HIDRÁULICA', 4, 32, 'J', 'A', null, 'vazão de', ''] };
    const faixas = (k, pred) => { const [sh, r1, r2, , a, b] = TB[k]; const fx = []; for (let r = r1; r <= r2; r++) { if (val(sh, a + r) === null) continue; if (pred(r)) fx.push(b ? fmtPlain(val(sh, a + r)) + ' a ' + fmtPlain(val(sh, b + r)) : fmtPlain(val(sh, a + r))); } return fx; };
    const nome = (x, cell) => String(x.pre || '') + cell + String(x.suf || '');
    for (const x of lines) {
      const est = estrOf(x).join(', '); const op = x.regra === 'OPCIONAL' ? ' · opcional' : '';
      if ((x.tipo === 'FIXO' || x.tipo === 'SPLIT') && x.campo === p) out.push([x.rot, `sempre${x.tipo === 'SPLIT' ? ', só split case' : ''}${op}`, est]);
      else if (x.tipo === 'TAMANHO' && x.fam === ins.fam) { const fx = faixas('FAIXA', (r) => nome(x, fmtPlain(val(MO, 'D' + r))) === p); if (fx.length) out.push([x.rot, 'motor diesel de ' + fx.join(' · ') + ' HP' + op, est]); }
      else if (TB[x.tipo]) { const t = TB[x.tipo]; const col = numToCol(colToNum(t[3]) + (+x.campo || 1) - 1); const fx = faixas(x.tipo, (r) => { const v = val(t[0], col + r); return v !== null && v !== '' && nome(x, String(v)) === p; }); if (fx.length) out.push([x.rot, t[6] + ' ' + fx.join(' · ') + t[7] + op, est]); }
      else if (['MOTOR', 'BOMBA', 'JOCKEY'].includes(x.tipo) && x.fam === ins.fam) out.push([x.rot, 'quando escolhido no item' + op, est]);
    }
    const fech = (MG.lista ? MG.lista() : []).filter((F) => ((F.snap || {}).itens || []).some((it) => (it.linhas || []).some((l) => l.desc === p)));
    const props = (REG.listPropostas() || []).filter((q) => q.doc && Object.entries(q.doc).some(([sh, cells]) => /^ITEM/.test(sh) && Object.values(cells || {}).includes(p)));
    const seen = new Set(); const est = out.filter((y) => { const k = y.join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    return { est, fech, props };
  }
  function ondeUsadoHtml(ins) {
    const u = ondeUsado(ins);
    const est = u.est.length ? `<ul class="uso">${u.est.map(([rot, quando, e]) => `<li><b>${esc(rot)}</b> — ${esc(quando)}<br><small class="sub">estruturas: ${esc(e)}</small></li>`).join('')}</ul>`
      : '<p class="sub" style="margin:0">Nenhuma estrutura usa este insumo. Para ele entrar nos equipamentos, inclua-o numa estrutura (Engenharia → Estruturas) ou numa tabela por porte.</p>';
    const fx = u.fech.length ? `<p class="sub" style="margin:6px 0 0">Em ${u.fech.length} formação(ões) fechada(s): ${u.fech.slice(0, 6).map((F) => esc(F.numero || F.nome || '')).join(', ')}${u.fech.length > 6 ? '…' : ''}</p>` : '';
    const pr = u.props.length ? `<p class="sub" style="margin:6px 0 0">Escolhido à parte em ${u.props.length} proposta(s): ${u.props.slice(0, 6).map((q) => esc(q.numero || q.name || '')).join(', ')}${u.props.length > 6 ? '…' : ''}</p>` : '';
    return `<h2>Onde é usado</h2>${est}${fx}${pr}`;
  }
  // ---- mão de obra e bases por porte: nomes que se explicam e critério de preço ----
  // o porte (tamanho) sai da potência do motor diesel; ele escolhe base, mão de obra e embalagem
  const MB_NOMES = [
    { k: 'base', lb: 'Base metálica', fam: '14.BASE', velho: (n) => 'BASE ' + n, novo: (n) => 'BASE METÁLICA PORTE ' + n, crit: 'kg', pre: ['BASE ', 'BASE METÁLICA PORTE '] },
    { k: 'mocj', lb: 'MO montagem · conjunto', fam: '34.MAODEOBRA', velho: (n) => 'MO ' + n, novo: (n) => 'MO MONTAGEM CONJUNTO PORTE ' + n, crit: 'h', pre: ['MO ', 'MO MONTAGEM CONJUNTO PORTE '] },
    { k: 'mosk', lb: 'MO montagem · skid', fam: '34.MAODEOBRA', velho: (n) => 'MO ' + n + ' SKID', novo: (n) => 'MO MONTAGEM SKID PORTE ' + n, crit: 'h', pre: ['MO ', 'MO MONTAGEM SKID PORTE '], suf: [' SKID', ''] },
    { k: 'emb', lb: 'Embalagem', fam: '37.EMBALAGEM', velho: (n) => 'EMBALAGEM ' + n, novo: (n) => 'EMBALAGEM PORTE ' + n, crit: null, pre: ['EMBALAGEM ', 'EMBALAGEM PORTE '] },
  ];
  const MB_CONT = [10, 20, 40].map((pes) => ({ pes, velho: 'MO CONTAINER ' + pes + ' PÉS', novo: 'MO MONTAGEM CONTAINER ' + pes + ' PÉS' }));
  const insPorNome = (...nomes) => REG.insumos.find((i) => nomes.includes(i.produto)) || null;
  const critMB = () => Object.assign({ rh: null, rkg: null, p: {}, cont: {} }, ((REG.tabelas || {}).CRIT_MOBASE || {}));
  const hpDoPorte = (n) => { const fx = []; for (let r = 157; r <= 166; r++) if (+val(MO, 'D' + r) === n) fx.push([val(MO, 'B' + r), val(MO, 'C' + r)]); if (!fx.length) return ''; return fmtPlain(fx[0][0]) + ' a ' + fmtPlain(fx[fx.length - 1][1]) + ' HP'; };
  function mbPrecoNovo(def, n, C) { const c = (C.p[n] || {})[def.k]; if (typeof c !== 'number') return null; if (def.crit === 'h' && typeof C.rh === 'number') return Math.round(c * C.rh * 100) / 100; if (def.crit === 'kg' && typeof C.rkg === 'number') return Math.round(c * C.rkg * 100) / 100; return null; }
  function vMoBase() {
    const ed = canEd(); const C = critMB(); const pendNomes = MB_NOMES.some((d) => Array.from({ length: 10 }, (_, i) => i + 1).some((n) => insPorNome(d.velho(n)))) || MB_CONT.some((c) => insPorNome(c.velho));
    const cel = (d, n) => { const ins = insPorNome(d.novo(n), d.velho(n)); if (!ins) return '<td class="sub">—</td>'; const nv = mbPrecoNovo(d, n, C); const cv = (C.p[n] || {})[d.k];
      return `<td><div class="mbc">${d.crit ? `<input class="rin" data-mbcrit="${n}|${d.k}" value="${typeof cv === 'number' ? NF[1].format(cv) : ''}" placeholder="${d.crit}" inputmode="decimal"${ed ? '' : ' disabled'} aria-label="${esc(d.lb)} porte ${n} em ${d.crit}"><span class="sub">${d.crit}</span>` : ''}</div><small class="sub">atual ${brl(num0(ins.valor))}</small>${nv !== null && Math.abs(nv - num0(ins.valor)) > 0.005 ? `<br><small class="${nv > num0(ins.valor) ? 'bad-t' : 'ok-t'}">critério ${brl(nv)}</small>` : ''}</td>`; };
    const rows = Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<tr><td><b>Porte ${n}</b><br><small class="sub">${esc(hpDoPorte(n) || 'sem faixa de motor')}</small></td>${MB_NOMES.map((d) => cel(d, n)).join('')}</tr>`).join('');
    const cont = MB_CONT.map((c) => { const ins = insPorNome(c.novo, c.velho); const h = (C.cont || {})[c.pes]; const nv = typeof h === 'number' && typeof C.rh === 'number' ? h * C.rh : null;
      return `<tr><td><b>Container ${c.pes} pés</b></td><td><div class="mbc"><input class="rin" data-mbcont="${c.pes}" value="${typeof h === 'number' ? NF[1].format(h) : ''}" placeholder="h" inputmode="decimal"${ed ? '' : ' disabled'}><span class="sub">h</span></div></td><td>${ins ? brl(num0(ins.valor)) : '—'}</td><td>${nv !== null ? brl(nv) : '—'}</td></tr>`; }).join('');
    const muda = mbMudancas().length;
    return `<div class="stack">
      <section class="card"><h2>Mão de obra e bases por porte <span class="sub">critério de preço, não número solto</span></h2>
        <div class="banner info" style="margin:0 0 10px"><b>Como funciona:</b> o <b>porte</b> de cada equipamento sai da potência do motor diesel (Estruturas → Tabelas por porte). O porte escolhe a base metálica, a mão de obra de montagem e a embalagem. Aqui cada preço vira critério: <b>mão de obra = horas × R$/hora</b> e <b>base = peso (kg) × R$/kg</b>. Preencha horas e peso de cada porte; o app mostra o preço pelo critério ao lado do atual e aplica com histórico.</div>
        <div class="fields"><div class="f"><label for="mbRh">R$ por hora de montagem</label><input id="mbRh" data-mbtop="rh" value="${typeof C.rh === 'number' ? NF[2].format(C.rh) : ''}" inputmode="decimal"${ed ? '' : ' disabled'} placeholder="ex.: 75,00"></div><div class="f"><label for="mbRkg">R$ por kg de base (aço + fabricação)</label><input id="mbRkg" data-mbtop="rkg" value="${typeof C.rkg === 'number' ? NF[2].format(C.rkg) : ''}" inputmode="decimal"${ed ? '' : ' disabled'} placeholder="ex.: 28,00"></div></div>
        <div class="tw" style="margin-top:10px"><table class="t mbt"><thead><tr><th>Porte</th>${MB_NOMES.map((d) => `<th>${esc(d.lb)}${d.crit ? ` <small>(${d.crit})</small>` : ''}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <h2 style="margin-top:14px">Containers</h2><div class="tw"><table class="t mbt"><thead><tr><th>Tamanho</th><th>Horas de montagem</th><th>Preço atual</th><th>Pelo critério</th></tr></thead><tbody>${cont}</tbody></table></div>
        ${ed ? `<div class="docbar" style="margin-top:10px"><button class="btn pri" data-mbapply${muda ? '' : ' disabled'}>Aplicar ${muda || ''} preço(s) pelo critério</button>${pendNomes ? '<button class="btn" data-mbnomes>Padronizar os nomes (ex.: "MO 6 SKID" → "MO MONTAGEM SKID PORTE 6")</button>' : '<span class="pill ok">nomes padronizados</span>'}</div>` : ''}
        <p class="sub" style="margin:8px 0 0">Padronizar os nomes ajusta junto as estruturas e as propostas antigas (o nome velho continua reconhecido). Cada insumo ganha no campo Tipo a faixa de motor do porte.</p></section></div>`;
  }
  function mbMudancas() {
    const C = critMB(); const out = [];
    for (const d of MB_NOMES) for (let n = 1; n <= 10; n++) { const ins = insPorNome(d.novo(n), d.velho(n)); const nv = ins && mbPrecoNovo(d, n, C); if (ins && nv !== null && Math.abs(nv - num0(ins.valor)) > 0.005) out.push({ id: ins.id, de: num0(ins.valor), para: nv }); }
    for (const c of MB_CONT) { const ins = insPorNome(c.novo, c.velho); const h = (C.cont || {})[c.pes]; if (ins && typeof h === 'number' && typeof C.rh === 'number') { const nv = Math.round(h * C.rh * 100) / 100; if (Math.abs(nv - num0(ins.valor)) > 0.005) out.push({ id: ins.id, de: num0(ins.valor), para: nv }); } }
    return out;
  }
  async function salvaCrit(mut, desc, mud) {
    const C = JSON.parse(JSON.stringify(critMB())); mut(C);
    try { await REG.setTable('CRIT_MOBASE', C, desc, mud || []); } catch (e) { toast(errMsg(e)); return; }
    // redesenha já (o preço pelo critério aparece) e devolve o foco ao campo em que a pessoa estava
    const ae = document.activeElement; const key = ae && ae.dataset ? Object.entries(ae.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${v}"]`)[0] : null;
    render(); if (key) { const el = document.querySelector(key); if (el) el.focus(); }
  }
  document.addEventListener('change', (e) => {
    const el = e.target; if (ui.view !== 'cadastro' || ui.cad !== 'mobase') return;
    const pv = (t) => { t = t.trim(); if (!t) return null; const n = parseInput(t, 'num'); return typeof n === 'number' ? n : undefined; };
    if (el.dataset.mbtop) { const v = pv(el.value); if (v === undefined) return toast('Número inválido'); salvaCrit((C) => { C[el.dataset.mbtop] = v; }, el.dataset.mbtop === 'rh' ? 'R$ por hora de montagem' : 'R$ por kg de base', [{ campo: el.dataset.mbtop === 'rh' ? 'R$/hora' : 'R$/kg', de: critMB()[el.dataset.mbtop], para: v }]); return; }
    if (el.dataset.mbcrit) { const [n, k] = el.dataset.mbcrit.split('|'); const v = pv(el.value); if (v === undefined) return toast('Número inválido'); const d = MB_NOMES.find((x) => x.k === k); salvaCrit((C) => { C.p[n] = C.p[n] || {}; if (v === null) delete C.p[n][k]; else C.p[n][k] = v; }, d.lb + ' porte ' + n, [{ campo: d.lb + ' porte ' + n + ' (' + d.crit + ')', de: ((critMB().p[n] || {})[k]) ?? null, para: v }]); return; }
    if (el.dataset.mbcont) { const v = pv(el.value); if (v === undefined) return toast('Número inválido'); salvaCrit((C) => { C.cont = C.cont || {}; if (v === null) delete C.cont[el.dataset.mbcont]; else C.cont[el.dataset.mbcont] = v; }, 'Horas container ' + el.dataset.mbcont + ' pés'); }
  });
  document.addEventListener('click', async (e) => {
    if (ui.view !== 'cadastro' || ui.cad !== 'mobase') return;
    if (e.target.closest('[data-mbapply]')) { const ch = mbMudancas(); if (!ch.length) return toast('Nada a aplicar'); try { const n = await REG.applyPrices(ch, 'Mão de obra e bases pelo critério'); toast(n + ' preço(s) atualizado(s)'); } catch (er) { toast(errMsg(er)); } return; }
    if (e.target.closest('[data-mbnomes]')) {
      const changes = [];
      for (const d of MB_NOMES) for (let n = 1; n <= 10; n++) { const ins = insPorNome(d.velho(n)); if (ins) changes.push({ id: ins.id, de: ins.produto, produto: d.novo(n), tipo: hpDoPorte(n) ? 'MOTOR DIESEL ' + hpDoPorte(n) : undefined }); }
      for (const c of MB_CONT) { const ins = insPorNome(c.velho); if (ins) changes.push({ id: ins.id, de: ins.produto, produto: c.novo }); }
      if (!changes.length) return toast('Os nomes já estão padronizados');
      try {
        const ren = await REG.renameInsumos(changes, 'Mão de obra e bases: nomes por porte');
        await REG.setTable('RENOMES', { map: Object.assign({}, renomes(), ren) }, 'Nomes antigos → novos (' + Object.keys(ren).length + ')', []);
        // estruturas: prefixo/sufixo do porte e o container fixo
        const ch = {};
        for (const x of recLines()) {
          if (x.tipo === 'TAMANHO') { const d = MB_NOMES.find((m) => m.fam === x.fam && m.pre[0] === x.pre && (m.suf ? m.suf[0] === x.suf : !x.suf)); if (d) { ch[REC_COLS.pre + x.r] = d.pre[1]; if (d.suf) ch[REC_COLS.suf + x.r] = d.suf[1] || null; } }
          if (x.tipo === 'FIXO' && ren[x.campo]) ch[REC_COLS.campo + x.r] = ren[x.campo];
        }
        if (Object.keys(ch).length) await REG.setCells(MO, ch, 'Estruturas: nomes de mão de obra e bases por porte', baseOf(MO));
        toast(changes.length + ' nome(s) padronizado(s)');
      } catch (er) { toast(errMsg(er)); }
    }
  });
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
    { id: 'teste', t: 'Opcional: teste de desempenho em fábrica com laudo', d: 'Cria o insumo "TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO" em 46.TESTESENSAIOS, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Teste de desempenho em fábrica', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '46.TESTESENSAIOS', tipo: 'FIXO', campo: 'TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO', qtd: 'N', regra: 'OPCIONAL' }, novo: { fam: '46.TESTESENSAIOS', produto: 'TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO', origem: 'NAC' } },
    { id: 'databook', t: 'Opcional: data book (manual, certificados e desenhos)', d: 'Cria o insumo "DATA BOOK TÉCNICO" em 47.DOCUMENTOSDESENHOS, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Data book técnico', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '47.DOCUMENTOSDESENHOS', tipo: 'FIXO', campo: 'DATA BOOK TÉCNICO', qtd: 1, regra: 'OPCIONAL' }, novo: { fam: '47.DOCUMENTOSDESENHOS', produto: 'DATA BOOK TÉCNICO', origem: 'NAC' } },
    { id: 'desenhos', t: 'Opcional: desenhos para aprovação do cliente', d: 'Cria o insumo "DESENHOS PARA APROVAÇÃO DO CLIENTE" em 47.DOCUMENTOSDESENHOS, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Desenhos para aprovação', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '47.DOCUMENTOSDESENHOS', tipo: 'FIXO', campo: 'DESENHOS PARA APROVAÇÃO DO CLIENTE', qtd: 1, regra: 'OPCIONAL' }, novo: { fam: '47.DOCUMENTOSDESENHOS', produto: 'DESENHOS PARA APROVAÇÃO DO CLIENTE', origem: 'NAC' } },
  ];
  const sugFeita = (sg, lines) => sg.ren ? Object.entries(sg.ren).every(([r, n]) => (lines.find((x) => x.r === +r) || {}).rot === n) : lines.some((x) => x.rot === sg.add.rot);
  const recChanges = (r, x) => { const ch = {}; for (const [k, c] of Object.entries(REC_COLS)) ch[c + r] = x[k] === '' || x[k] === undefined ? null : x[k]; return ch; };
  const baseOf = (sheet) => (a) => { const v = baseRaw(sheet, a); return v === undefined ? null : v; };

  // ---------- mapa do cadastro: as áreas funcionais (A a E) apontando para as telas que já existem ----------
  function vMapa() {
    const nIns = REG.insumos.length; const semP = REG.insumos.filter((i) => typeof i.valor !== 'number').length; const nFab = new Set(REG.insumos.map((i) => i.fab).filter(Boolean)).size;
    const nForn = new Set(REG.insumos.flatMap((i) => (i.forn || []).map((f) => f.nome)).filter(Boolean)).size; const cfgN = Object.keys(famCfg()).length;
    const lk = (tab, lb, info) => `<li><button class="restore" data-cad="${tab}">${esc(lb)}</button>${info ? ` <small class="sub">${info}</small>` : ''}</li>`;
    const G = [
      ['A', 'Produtos e insumos', [lk('insumos', 'Insumos e componentes', nIns + ' itens · ' + semP + ' sem preço'), lk('fornecedores', 'Fornecedores e fabricantes', nForn + ' fornecedores · ' + nFab + ' fabricantes'), lk('familias', 'Famílias de insumos'), lk('campos', 'Características técnicas por família', cfgN ? cfgN + ' família(s) ajustada(s)' : 'padrão da REV21'), lk('importar', 'Preços de aquisição (importar)'), lk('custoscfg', 'Validade das cotações e alertas')]],
      ['B', 'Equipamentos e modelos', [lk('familias', 'Famílias de equipamento e modelos prontos'), lk('regras', 'Compatibilidades (regras de configuração)', RG.lista().length + ' regra(s)'), lk('codificacao', 'Codificação')]],
      ['C', 'Estruturas e kits', [lk('estruturas', 'Estruturas padrão e tabelas por porte', recLines().length + ' componentes'), lk('testador', 'Testador de estruturas (motor real)'), lk('motor', 'Kits de motor diesel', REG.kitMotor.length + ' kits'), lk('bomba', 'Kits de bomba', REG.kitBomba.length + ' kits'), lk('valvulas', 'Válvulas de alívio'), lk('mobase', 'Mão de obra e bases')]],
      ['D', 'Padronização', [lk('padrao', 'Padrões de descrição'), lk('campos', 'Modelos de descrição técnica e comercial'), lk('sinonimos', 'Sinônimos e abreviações', Object.keys(sinonimos()).length + ' grupo(s)'), lk('qualidade', 'Qualidade dos dados mestres'), lk('pedidos', 'Pedidos de cadastro (novos itens)')]],
      ['E', 'Parâmetros comerciais e fiscais', [lk('preco', 'Políticas de preço, margens, comissões'), lk('fiscal', 'NCM e impostos'), lk('cenarios', 'Cenários tributários'), lk('cambio', 'Câmbio e importação'), lk('servicos', 'Serviços (SPV)'), lk('geral', 'Listas auxiliares e empresa')]]];
    return `<div class="stack"><p class="sub" style="margin:0">O cadastro é a fonte única de dados do app: cada item é cadastrado uma vez e reaproveitado nas estruturas, kits, propostas, custos e documentos. As permissões continuam por área (Custos, Engenharia, Fiscal…); este mapa só organiza o caminho.</p>
      <div class="cadmap">${G.map(([l, t, L]) => `<section class="card"><h2>${l}. ${esc(t)}</h2><ul>${L.join('')}</ul></section>`).join('')}</div></div>`;
  }
  // ---------- campos técnicos por família (sem mexer no código) ----------
  function cobertura(fam, p) {
    const L = REG.insumos.filter((i) => i.fam === fam); let ok = 0; const fora = [];
    for (const i of L) { const m = FAMS_F.montar(p, FAMS_F.lerP(p, i.produto)); if (m && m === i.produto) ok++; else if (fora.length < 8) fora.push(i.produto); }
    return { n: L.length, ok, fora };
  }
  function vCampos() {
    const ed = canEd(); const cfg = famCfg();
    const rows = famList().map((fam) => { const p = FAMS_F.padraoDe(fam, cfg); const c = H.famCode(fam); const cob = p && p.modelo ? cobertura(fam, p) : null;
      return `<tr><td class="n">${String(c).padStart(2, '0')}</td><td><b>${esc(fam.replace(/^\d+\./, ''))}</b>${p ? `<br><small class="sub">${esc(p.nome || '')}</small>` : ''}</td><td class="code" style="white-space:normal">${p && p.modelo ? esc(p.modelo) : '<span class="sub">texto livre (regras gerais de escrita)</span>'}</td>
        <td>${p ? (p.campos || []).length + ' campo(s)' : '—'}</td><td>${cob ? `${cob.ok} de ${cob.n} nomes no modelo` : '—'}</td><td>${cfg[String(c)] ? '<span class="pill warn">ajustado</span>' : p ? '<span class="pill mute">padrão REV21</span>' : ''}</td>
        <td>${ed ? `<button class="btn sm" data-campofam="${esc(fam)}">${p ? 'Editar' : 'Criar modelo'}</button>` : ''}</td></tr>`; }).join('');
    return `<div class="stack"><section class="card"><h2>Campos técnicos e modelo de descrição por família</h2>
      <p class="sub" style="margin:0 0 8px">Cada família pode ter campos próprios (tipo, unidade, obrigatório, opções) e o modelo que monta a descrição técnica. Nas famílias de motor diesel, motor elétrico, bomba, motobomba e jockey <b>as fórmulas leem o nome</b> (potência, rotação, série): o modelo dessas famílias segue docs/padroes-descricoes.md e qualquer ajuste é testado contra o cadastro antes de salvar. Unidades nunca são convertidas.</p>
      <div class="tw"><table class="t"><thead><tr><th>Cód.</th><th>Família</th><th>Modelo da descrição</th><th>Campos</th><th>Cadastro no modelo</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section></div>`;
  }
  function camposModal(fam) {
    const cfg = famCfg(); const c = H.famCode(fam); const base = FAMS_F.PADRAO[c] || null; const p = FAMS_F.padraoDe(fam, cfg) || { nome: fam.replace(/^\d+\./, ''), modelo: '', comercial: '', campos: [] };
    const st = { campos: JSON.parse(JSON.stringify(p.campos || [])) }; const leitura = [1, 10, 11, 12, 13].includes(c);
    modal(`<h2>Campos e modelo · ${esc(fam)}</h2>
      <div class="fields"><div class="f span2"><label for="cmNome">Nome da família</label><input id="cmNome" value="${esc(p.nome || '')}"></div>
        <div class="f spanall"><label for="cmMod">Modelo da descrição técnica <small class="sub">{campo} = valor · [ ... ] = trecho opcional</small></label><input id="cmMod" class="code" value="${esc(p.modelo || '')}" placeholder="ex.: {modelo} {pot}{unid} {fase}[ {ip}]"></div>
        <div class="f spanall"><label for="cmCom">Modelo da descrição comercial</label><input id="cmCom" value="${esc(p.comercial || '')}" placeholder="ex.: Bomba jockey {modelo}, {pot} {unid}"></div>
        <div class="f spanall"><label for="cmRe">Validação extra (expressão regular, opcional)</label><input id="cmRe" class="code" value="${esc(cfg[String(c)] && cfg[String(c)].regex || '')}" placeholder="${base && base.ok ? esc(String(base.ok).slice(1, -1)) : ''}"></div></div>
      <h3>Campos</h3><div id="cmCampos"></div><button type="button" class="btn sm" id="cmAdd">+ Campo</button>
      <div id="cmPrev" class="banner info" style="margin:8px 0 0"></div>
      ${leitura ? '<div class="banner warn" style="margin:0">As fórmulas leem o nome nesta família. Se o modelo deixar de reproduzir os nomes que hoje estão no padrão, o app avisa e pede confirmação.</div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="cmOk">Salvar</button>${cfg[String(c)] ? '<button class="btn" id="cmPad">Voltar ao padrão da REV21</button>' : ''}<button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      const g = (s) => $(s, o);
      const draw = () => { g('#cmCampos').innerHTML = `<div class="tw"><table class="t"><thead><tr><th>Chave</th><th>Rótulo</th><th>Tipo</th><th>Unidade</th><th>Opções (lista)</th><th>Obrig.</th><th>Minúsc. (comercial)</th><th></th></tr></thead><tbody>${st.campos.map((f, i) => `<tr>
        <td class="in"><input data-cm="${i}|k" value="${esc(f.k)}" aria-label="Chave"></td><td class="in"><input data-cm="${i}|lb" value="${esc(f.lb || '')}" aria-label="Rótulo"></td>
        <td class="in"><select data-cm="${i}|tipo" aria-label="Tipo">${[['texto', 'texto'], ['numero', 'número'], ['lista', 'lista']].map(([k, l]) => `<option value="${k}"${f.tipo === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="in"><input data-cm="${i}|un" value="${esc(f.un || '')}" aria-label="Unidade" placeholder="HP, CV, kW…"></td><td class="in"><input data-cm="${i}|ops" value="${esc((f.ops || []).join(', '))}" aria-label="Opções"></td>
        <td class="in"><input type="checkbox" data-cm="${i}|req"${f.req ? ' checked' : ''} aria-label="Obrigatório"></td><td class="in"><input type="checkbox" data-cm="${i}|minusc"${f.minusc ? ' checked' : ''} aria-label="Minúsculas"></td><td><button type="button" class="restore" data-cmrm="${i}" aria-label="Remover">×</button></td></tr>`).join('')}</tbody></table></div>`;
        o.querySelectorAll('[data-cm]').forEach((el) => { el.onchange = () => { const [i, k] = el.dataset.cm.split('|'); const f = st.campos[+i]; if (k === 'req' || k === 'minusc') f[k] = el.checked; else if (k === 'ops') f.ops = el.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean); else f[k] = k === 'k' ? el.value.trim().replace(/\W/g, '') : el.value.trim(); prev(); }; });
        o.querySelectorAll('[data-cmrm]').forEach((b) => { b.onclick = () => { st.campos.splice(+b.dataset.cmrm, 1); draw(); prev(); }; }); };
      const atual = () => ({ nome: g('#cmNome').value.trim(), modelo: g('#cmMod').value.trim(), comercial: g('#cmCom').value.trim(), regex: g('#cmRe').value.trim() || undefined, campos: st.campos.filter((f) => f.k) });
      let cobNova = null, cobBase = null;
      const prev = () => { const a = atual(); const ex = Object.fromEntries(a.campos.map((f) => [f.k, f.ex || (f.ops && f.ops[0]) || (f.tipo === 'numero' ? '10' : 'X')]));
        const pp = { nome: a.nome, modelo: a.modelo, comercial: a.comercial, campos: a.campos };
        cobNova = a.modelo ? cobertura(fam, pp) : null; cobBase = base ? cobertura(fam, base) : null;
        g('#cmPrev').innerHTML = `Exemplo: <b class="code">${esc(FAMS_F.montar(pp, ex) || '—')}</b>${a.comercial ? ` · comercial: <b>${esc(FAMS_F.montarCom(pp, ex, {}))}</b>` : ''}${cobNova ? `<br>No cadastro: ${cobNova.ok} de ${cobNova.n} nomes desta família seguem este modelo${cobBase ? ` (padrão da REV21: ${cobBase.ok})` : ''}.${cobNova.fora.length ? ' Fora do modelo, por exemplo: ' + cobNova.fora.slice(0, 3).map((x) => `<span class="code">${esc(x)}</span>`).join(' · ') : ''}` : ''}`; };
      g('#cmAdd').onclick = () => { st.campos.push({ k: 'campo' + (st.campos.length + 1), lb: '', tipo: 'texto', req: false }); draw(); prev(); };
      ['#cmNome', '#cmMod', '#cmCom', '#cmRe'].forEach((s) => { g(s).oninput = prev; });
      draw(); prev();
      g('#cmOk').onclick = async () => { const a = atual(); const b = g('#cmOk');
        if (a.regex) { try { new RegExp(a.regex); } catch (e) { toast('Expressão regular inválida'); return; } }
        const ks = [...a.modelo.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).filter((k) => !a.campos.some((f) => f.k === k)); if (ks.length) { toast('O modelo usa campos que não existem: ' + ks.join(', ')); return; }
        if (leitura && cobBase && cobNova && cobNova.ok < cobBase.ok && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar mesmo assim'; toast(`Com este modelo, ${cobBase.ok - cobNova.ok} nome(s) que hoje estão no padrão deixam de casar. As fórmulas leem o nome: confira antes.`); return; }
        const all = JSON.parse(JSON.stringify(famCfg())); all[String(c)] = a;
        try { await REG.setTable('FAM_CAMPOS', { fams: all }, 'Campos e modelo da família ' + fam, [{ campo: fam, de: p.modelo || null, para: a.modelo || null }]); close(); toast('Família ' + fam + ' salva'); } catch (er) { toast(errMsg(er)); } };
      const pd = g('#cmPad'); if (pd) pd.onclick = async () => { const all = JSON.parse(JSON.stringify(famCfg())); delete all[String(c)]; try { await REG.setTable('FAM_CAMPOS', { fams: all }, 'Família ' + fam + ' voltou ao padrão da REV21', []); close(); toast('Voltou ao padrão'); } catch (er) { toast(errMsg(er)); } };
    });
  }
  // ---------- sinônimos e abreviações (só para a busca; os dados originais não mudam) ----------
  function vSinonimos() {
    const ed = canEd(); const map = sinonimos();
    return `<section class="card"><h2>Sinônimos e abreviações <span class="sub">a busca de insumos e configurações encontra qualquer uma das grafias</span></h2>
      <div class="tw"><table class="t"><thead><tr><th>Termo</th><th>Também procura por</th><th></th></tr></thead><tbody>${Object.entries(map).map(([k, v]) => `<tr><td class="code">${esc(k)}</td><td>${esc((v || []).join(', '))}</td><td>${ed ? `<button class="restore" data-sinrm="${esc(k)}" aria-label="Remover">×</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${ed ? `<div class="fields" style="margin-top:8px"><div class="f"><label for="sinK">Termo</label><input id="sinK" placeholder="ex.: TRIF"></div><div class="f span2"><label for="sinV">Outras grafias (separadas por vírgula)</label><input id="sinV" placeholder="ex.: TRIFÁSICO, TRI"></div><div class="f"><button class="btn pri" data-sinadd style="margin-top:22px">Incluir</button></div></div>` : ''}
      <p class="sub" style="margin:8px 0 0">Os sinônimos ampliam o que a busca encontra; nenhum nome do cadastro é trocado por eles.</p></section>`;
  }
  async function salvaSin(map, desc) { try { await REG.setTable('SINONIMOS', { map }, desc, []); toast('Sinônimos salvos'); } catch (e) { toast(errMsg(e)); } }
  // ---------- fornecedores e fabricantes (a partir das cotações dos insumos e dos documentos) ----------
  function vFornecedores() {
    const hoje = new Date().toISOString().slice(0, 10); const M = new Map();
    for (const i of REG.insumos) for (const f of i.forn || []) { if (!f.nome) continue; const k = f.nome.toUpperCase(); const x = M.get(k) || { nome: f.nome, itens: 0, vencidas: 0, prazo: [], ult: '' }; x.itens++; if (f.validade && f.validade < hoje) x.vencidas++; if (typeof f.prazo === 'number') x.prazo.push(f.prazo); if ((f.at || '') > x.ult) x.ult = f.at || ''; M.set(k, x); }
    const docs = (() => { try { return SPV.docs(); } catch (e) { return []; } })(); for (const d of docs) { if (!d.fornecedor) continue; const k = d.fornecedor.toUpperCase(); const x = M.get(k) || { nome: d.fornecedor, itens: 0, vencidas: 0, prazo: [], ult: '' }; x.docs = (x.docs || 0) + 1; M.set(k, x); }
    const fabs = new Map(); for (const i of REG.insumos) if (i.fab) fabs.set(i.fab, (fabs.get(i.fab) || 0) + 1);
    const L = [...M.values()].sort((a, b) => b.itens - a.itens);
    return `<div class="stack"><section class="card"><h2>Fornecedores <span class="sub">${L.length}, a partir das cotações cadastradas nos insumos e dos documentos</span></h2>
      ${L.length ? `<div class="tw"><table class="t"><thead><tr><th>Fornecedor</th><th>Itens cotados</th><th>Cotações vencidas</th><th>Prazo médio</th><th>Documentos</th></tr></thead><tbody>${L.map((x) => `<tr><td><b>${esc(x.nome)}</b></td><td class="n">${x.itens}</td><td class="n">${x.vencidas ? `<span class="pill warn">${x.vencidas}</span>` : '0'}</td><td class="n">${x.prazo.length ? Math.round(x.prazo.reduce((t, v) => t + v, 0) / x.prazo.length) + ' dias' : '—'}</td><td class="n">${x.docs || 0}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Nenhum fornecedor cadastrado ainda. Cadastre as cotações na ficha de cada insumo (seção Fornecedores e cotações).</p>'}</section>
      <section class="card"><h2>Fabricantes <span class="sub">${fabs.size}</span></h2><div style="display:flex;gap:6px;flex-wrap:wrap">${[...fabs].sort((a, b) => b[1] - a[1]).map(([f, n]) => `<button class="pill mute apselo" data-fabgo="${esc(f)}">${esc(f)} · ${n}</button>`).join('')}</div></section></div>`;
  }
  document.addEventListener('click', async (e) => {
    const cf = e.target.closest('[data-campofam]'); if (cf) { camposModal(cf.dataset.campofam); return; }
    const sr = e.target.closest('[data-sinrm]'); if (sr) { const m = Object.assign({}, sinonimos()); delete m[sr.dataset.sinrm]; salvaSin(m, 'Sinônimo removido: ' + sr.dataset.sinrm); return; }
    if (e.target.closest('[data-sinadd]')) { const k = FAMS_F.norm($('#sinK').value); const v = $('#sinV').value.split(',').map((x) => FAMS_F.norm(x)).filter(Boolean); if (!k || !v.length) { toast('Informe o termo e as outras grafias'); return; } const m = Object.assign({}, sinonimos(), { [k]: v }); salvaSin(m, 'Sinônimo: ' + k + ' = ' + v.join(', ')); return; }
    const fg = e.target.closest('[data-fabgo]'); if (fg) { ui.insFab = fg.dataset.fabgo; ui.pg_insumos = 1; ui.cad = 'insumos'; render(); }
  });
  // ---------- qualidade dos dados mestres: aponta, filtra e leva ao registro; nada é alterado sozinho ----------
  function qualidade() {
    const cfg = famCfg(); const C = custosCfg(); const U = usoIndex(); const out = []; const add = (sev, tipo, fam, msg, go) => out.push({ sev, tipo, fam: fam || '', msg, go });
    const nomes = new Map(); for (const i of REG.insumos) { const k = FAMS_F.norm(i.produto); if (!nomes.has(k)) nomes.set(k, []); nomes.get(k).push(i); }
    const prodSet = new Set(REG.insumos.map((i) => i.produto));
    for (const i of REG.insumos) {
      const usos = U.de(i); const emUso = usos.length > 0; const go = { ins: i.id };
      if (!i.fam) add('imped', 'Sem família', '', i.id + ' ' + i.produto, go);
      if (!i.fab && FAMS_F.PADRAO[H.famCode(i.fam)]) add('aviso', 'Sem fabricante', i.fam, i.id + ' ' + i.produto, go);
      if (typeof i.valor !== 'number') add(emUso ? 'imped' : 'aviso', 'Sem preço', i.fam, i.id + ' ' + i.produto + (emUso ? ' — em uso: ' + usos.join(', ') : ''), go);
      if (precoVencido(i) && emUso) add('aviso', 'Preço desatualizado', i.fam, i.id + ' ' + i.produto + ' — preço atualizado em ' + new Date(precoRef(i)).toLocaleDateString('pt-BR'), go);
      const m = FAMS_F.checar(i.fam, i.produto, cfg); if (m && !i.excecao) add('aviso', 'Descrição fora do padrão', i.fam, i.id + ' ' + i.produto + ' — ' + m, go);
      const p = FAMS_F.padraoDe(i.fam, cfg); if (p && p.modelo && !m) { const falta = FAMS_F.faltando(p, Object.assign({}, FAMS_F.lerP(p, i.produto), i.caract || {})); if (falta.length) add('info', 'Características obrigatórias ausentes', i.fam, i.id + ' ' + i.produto + ' — falta: ' + falta.join(', '), go); }
      if (foraDeUso(i) && (usos.includes('estrutura') || usos.includes('tabela por porte'))) add('imped', 'Descontinuado ainda utilizado', i.fam, i.id + ' ' + i.produto + ' — ' + usos.join(', ') + (i.substituto ? ' · substituto ' + i.substituto : ' · sem substituto'), go);
      if (i.substituto && !REG.insumos.some((x) => x.id === i.substituto)) add('aviso', 'Substituto inexistente', i.fam, i.id + ' aponta para ' + i.substituto, go);
    }
    for (const [, L] of nomes) if (L.length > 1) { const vs = new Set(L.map((x) => x.valor ?? null)); add(vs.size > 1 ? 'imped' : 'aviso', 'Possível duplicidade (mesmo nome)', L[0].fam, L.map((x) => x.id + (typeof x.valor === 'number' ? ' (' + brl(x.valor) + ')' : ' (sem preço)')).join(' · ') + ' — ' + L[0].produto + (vs.size > 1 ? ' — a fórmula pega o primeiro' : ''), { dup: L.map((x) => x.id).join(',') }); }
    // estruturas e tabelas: referências a nomes que não estão no cadastro
    for (const x of recLines()) {
      if ((x.tipo === 'FIXO' || x.tipo === 'SPLIT') && x.campo && !prodSet.has(String(x.campo))) add('imped', 'Estrutura com insumo inexistente', x.fam, `"${x.rot}" usa "${x.campo}", que não está no cadastro`, { rec: x.r });
      if (!x.rot || !x.fam) add('aviso', 'Estrutura incompleta', x.fam, `linha ${x.r}: ${!x.rot ? 'sem nome' : 'sem família'}`, { rec: x.r });
    }
    const tab = (sh, r1, r2, c1, c2, lb) => { for (let r = r1; r <= r2; r++) for (let c = colToNum(c1); c <= colToNum(c2); c++) { const a = numToCol(c) + r; const v = val(sh, a); if (typeof v === 'string' && v && !/^\d/.test(v) && !prodSet.has(v) && !isFormulaBase(sh, a)) add('aviso', 'Tabela por porte com insumo inexistente', '', `${lb} ${a}: "${v}"`, { cad: 'estruturas' }); } };
    tab(MO, 157, 166, 'E', 'M', 'Potência diesel'); tab(MO, 172, 187, 'D', 'G', 'Potência elétrica');
    for (const k of REG.kitMotor) if (!prodSet.has(k.desc)) add('aviso', 'Kit sem insumo no cadastro', '01.MOTORDIESEL', k.desc, { cad: 'motor' });
    for (const k of REG.kitBomba) if (!prodSet.has(k.desc)) add('aviso', 'Kit sem insumo no cadastro', '11.BOMBAMANCAL', k.desc, { cad: 'bomba' });
    // famílias de equipamento e modelos prontos sem estrutura própria
    for (const [k, lb] of famsEquip()) if (!estrList().includes(k) && !['OEM', 'JOCKEYPAINEL'].includes(k)) add('info', 'Família de equipamento sem estrutura própria', '', lb + ' usa a estrutura mais próxima', { cad: 'estruturas' });
    // regras de configuração que citam componente que não existe
    for (const r of RG.lista()) if (r.componente && !REG.insumos.some((i) => FAMS_F.norm(i.produto).includes(FAMS_F.norm(r.componente)))) add('aviso', 'Regra com componente que não existe no cadastro', '', `"${r.nome}" procura "${r.componente}"`, { cad: 'regras' });
    return out;
  }
  function semUso() { const U = usoIndex(); return REG.insumos.filter((i) => !U.de(i).length && !foraDeUso(i)); }
  function vQualidade() {
    const L = qualidade(); const sev = ui.qSev || ''; const fam = ui.qFam || ''; const tipo = ui.qTipo || '';
    const F = L.filter((x) => (!sev || x.sev === sev) && (!fam || x.fam === fam) && (!tipo || x.tipo === tipo));
    const tipos = [...new Set(L.map((x) => x.tipo))]; const cont = (s) => L.filter((x) => x.sev === s).length;
    const ic = { imped: '<span class="bad-t">✕</span>', aviso: '<span class="warn-t">!</span>', info: '<span class="sub">i</span>' };
    const goBtn = (g) => g.ins ? `<button class="btn sm" data-ins="${esc(g.ins)}">Abrir</button>` : g.rec ? `<button class="btn sm" data-qrec="${g.rec}">Abrir</button>` : g.dup ? `<button class="btn sm" data-qdup="${esc(g.dup)}">Consolidar…</button>` : g.cad ? `<button class="btn sm" data-cad="${esc(g.cad)}">Ir</button>` : '';
    const SU = semUso(); const ed = REG.areaOk('custos');
    return `<div class="stack"><section class="card"><h2>Qualidade dos dados mestres</h2>
      <div class="kpis" style="margin-bottom:8px"><div class="kpi"><span>Impede ou distorce o cálculo</span><b class="${cont('imped') ? 'bad-t' : 'ok-t'}">${cont('imped')}</b></div><div class="kpi"><span>Pede atenção</span><b class="${cont('aviso') ? 'warn-t' : 'ok-t'}">${cont('aviso')}</b></div><div class="kpi"><span>Informação</span><b>${cont('info')}</b></div><div class="kpi"><span>Sem utilização</span><b>${SU.length}</b></div></div>
      <div class="pnfil"><select data-qf="qSev" aria-label="Criticidade"><option value="">Toda criticidade</option>${[['imped', 'Impede'], ['aviso', 'Atenção'], ['info', 'Informação']].map(([k, l]) => `<option value="${k}"${sev === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select data-qf="qTipo" aria-label="Tipo"><option value="">Todos os tipos</option>${tipos.map((t) => `<option${t === tipo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select data-qf="qFam" aria-label="Família"><option value="">Todas as famílias</option>${famList().map((f) => `<option value="${esc(f)}"${f === fam ? ' selected' : ''}>${esc(famNome(f))}</option>`).join('')}</select></div>
      ${F.length ? `<div class="tw" style="max-height:55vh;overflow:auto"><table class="t"><tbody>${F.slice(0, 400).map((x) => `<tr class="${x.sev === 'imped' ? 'cf-erro' : x.sev === 'aviso' ? 'cf-aviso' : ''}"><td style="width:24px">${ic[x.sev]}</td><td><small class="sub">${esc(x.tipo)}${x.fam ? ' · ' + esc(famNome(x.fam)) : ''}</small><br>${esc(x.msg)}</td><td style="text-align:right">${goBtn(x.go)}</td></tr>`).join('')}</tbody></table></div>${F.length > 400 ? '<p class="sub">Mostrando 400; use os filtros.</p>' : ''}` : '<p class="ok-t" style="margin:0">Nada com esses filtros.</p>'}
      <p class="sub" style="margin:8px 0 0">O painel só aponta. Correções são feitas no registro (botão Abrir) e ficam no histórico. "Consolidar" junta duplicidades de mesmo nome mediante confirmação, sem apagar nada.</p></section>
      <section class="card"><h2>Cobertura dos modelos prontos <span class="sub">monta cada modelo na planilha real e aponta componente sem cadastro, sem preço ou regra impeditiva</span></h2>
        ${ui.cobRes ? (ui.cobRes.length ? `<div class="tw" style="max-height:40vh;overflow:auto"><table class="t"><thead><tr><th>Modelo</th><th>Problemas</th><th></th></tr></thead><tbody>${ui.cobRes.map((x) => `<tr><td>${esc(x.nome)}</td><td><small>${esc(x.msg)}</small></td><td><button class="btn sm" data-cobgo="${esc(x.nome)}">Testar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="ok-t" style="margin:0">Todos os modelos prontos montam sem componente sem cadastro ou sem preço.</p>') : ''}
        <div class="docbar" style="margin-top:8px"><button class="btn sm" data-cobrun>${ui.cobRes ? 'Testar de novo' : 'Testar todos os modelos prontos'}</button><span class="sub" id="cobProg"></span></div></section>
      <section class="card"><h2>Cadastros sem utilização <span class="sub">${SU.length} insumo(s) fora de estruturas, tabelas, kits, regras, propostas e baixas</span></h2>
        ${SU.length ? `<div class="tw" style="max-height:40vh;overflow:auto"><table class="t"><tbody>${SU.slice(0, 300).map((i) => `<tr>${ed ? `<td class="in"><input type="checkbox" data-susel="${esc(i.id)}" aria-label="Marcar ${esc(i.id)}"></td>` : ''}<td class="code">${esc(i.id)}</td><td>${esc(i.produto)}</td><td>${esc(famNome(i.fam))}</td><td class="n">${typeof i.valor === 'number' ? brl(i.valor) : '—'}</td><td><button class="btn sm" data-ins="${esc(i.id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>
          ${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn sm" data-suinat="inativo">Marcar os selecionados como inativos</button><button class="btn sm" data-suinat="descontinuado">… como descontinuados</button></div>' : ''}` : '<p class="sub" style="margin:0">Todos os insumos têm alguma referência.</p>'}
        <p class="sub" style="margin:8px 0 0">Nenhum registro é excluído: inativo e descontinuado saem das listas de escolha e o histórico fica preservado. Itens escolhidos no próprio item (motores, bombas, jockey) contam como usados pela família.</p></section></div>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cobrun]'); if (b) { b.disabled = true; const M = modelos(); const out = [];
      for (let i = 0; i < M.length; i++) { const p = $('#cobProg'); if (p) p.textContent = 'Testando ' + (i + 1) + ' de ' + M.length + '…'; await new Promise((r) => setTimeout(r, 0));
        try { const r = montarTeste({ estr: M[i].estr, modelo: M[i].nome }, false); const L = []; const sc = r.comps.filter((x) => x.semCad).length, sp = r.comps.filter((x) => x.semPreco).length; if (sc) L.push(sc + ' sem cadastro'); if (sp) L.push(sp + ' sem preço'); const im = r.regrasCfg.filter((x) => x.sev === 'imped').length; if (im) L.push(im + ' regra(s) impeditiva(s)'); if (r.comps.some((x) => x.ins && foraDeUso(x.ins))) L.push('usa insumo descontinuado/inativo'); if (L.length) out.push({ nome: M[i].nome, msg: L.join(' · ') }); }
        catch (er) { out.push({ nome: M[i].nome, msg: 'erro ao montar: ' + er.message }); } }
      ui.cobRes = out; render(); return; }
    const g = e.target.closest('[data-cobgo]'); if (g) { const m = modelos().find((x) => x.nome === g.dataset.cobgo); if (!m) return; ui.tst = { estr: m.estr, modo: 'modelo', modelo: m.nome, opc: [], rodou: true }; ui.cad = 'testador'; render(); }
  });
  function consolidarModal(ids) {
    const L = ids.split(',').map((id) => REG.insumos.find((x) => x.id === id)).filter(Boolean); if (L.length < 2) return;
    if (!REG.areaOk('custos')) { toast('Só a área de Custos consolida cadastros'); return; }
    modal(`<h2>Consolidar cadastros com o mesmo nome</h2><p class="sub" style="margin:0">${esc(L[0].produto)}</p>
      <p class="sub" style="margin:0">Escolha o registro que fica. Os outros passam a <b>descontinuados</b>, com o que fica como substituto, e ganham um sufixo no nome para a fórmula passar a pegar o escolhido. Nada é apagado e tudo pode ser desfeito pelo histórico.</p>
      <div class="tw"><table class="t"><thead><tr><th></th><th>Código</th><th>Preço</th><th>Fabricante</th><th>Atualizado</th></tr></thead><tbody>${L.map((x, i) => `<tr><td class="in"><input type="radio" name="csKeep" value="${esc(x.id)}"${i === 0 ? ' checked' : ''} aria-label="Manter ${esc(x.id)}"></td><td class="code">${esc(x.id)}</td><td class="n">${typeof x.valor === 'number' ? brl(x.valor) : 'sem preço'}</td><td>${esc(x.fab || '')}</td><td class="sub">${x.upd ? esc(fmtAt(x.upd)) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="banner warn" id="csImp" style="margin:0"></div>
      <div style="display:flex;gap:8px"><button class="btn pri" id="csOk">Consolidar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      const keep = () => (o.querySelector('input[name="csKeep"]:checked') || {}).value;
      const imp = () => { const k = REG.insumos.find((x) => x.id === keep()); const first = H.sortIns(L)[0]; $('#csImp', o).innerHTML = first.id === k.id ? 'O registro escolhido já é o que a fórmula usa: os preços das propostas não mudam.' : `Hoje a fórmula usa ${esc(first.id)} (${typeof first.valor === 'number' ? brl(first.valor) : 'sem preço'}); depois passa a usar ${esc(k.id)} (${typeof k.valor === 'number' ? brl(k.valor) : 'sem preço'}). Rascunhos que usam este nome mudam de custo; propostas com preços da época, não.`; };
      o.querySelectorAll('input[name="csKeep"]').forEach((r) => { r.onchange = imp; }); imp();
      $('#csOk', o).onclick = async () => { const k = keep(); const outros = L.filter((x) => x.id !== k); const b = $('#csOk', o); b.disabled = true;
        try { await REG.saveInsumosLote(outros.map((x) => ({ id: x.id, campos: { situacao: 'descontinuado', substituto: k, produto: x.produto + ' (SUBSTITUÍDO POR ' + k + ')' }, de: { situacao: x.situacao ?? null, substituto: x.substituto ?? null, produto: x.produto } })), 'Consolidação: ' + L[0].produto + ' → ' + k, 'Consolidação de cadastro');
          close(); toast('Consolidado em ' + k); render(); } catch (er) { b.disabled = false; toast(errMsg(er)); } };
    });
  }
  document.addEventListener('change', (e) => { const q = e.target.closest('[data-qf]'); if (q) { ui[q.dataset.qf] = q.value; render(); } });
  document.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-qdup]'); if (d) { consolidarModal(d.dataset.qdup); return; }
    const r = e.target.closest('[data-qrec]'); if (r) { ui.cad = 'estruturas'; render(); recModal(+r.dataset.qrec); return; }
    const s = e.target.closest('[data-suinat]'); if (s) { const ids = [...document.querySelectorAll('[data-susel]:checked')].map((c) => c.dataset.susel); if (!ids.length) { toast('Marque os insumos'); return; }
      if (!s.dataset.sure) { s.dataset.sure = 1; s.textContent = 'Confirmar: ' + ids.length + ' insumo(s) → ' + s.dataset.suinat; return; }
      try { await REG.saveInsumosLote(ids.map((id) => { const x = REG.insumos.find((y) => y.id === id); return { id, campos: { situacao: s.dataset.suinat }, de: { situacao: x.situacao ?? null } }; }), ids.length + ' insumo(s) sem uso → ' + s.dataset.suinat, 'Edição em massa'); toast(ids.length + ' insumo(s) marcados'); render(); } catch (er) { toast(errMsg(er)); } }
  });
  // ---------- estruturas: rascunho, publicação controlada e testador no motor real ----------
  // O rascunho guarda alterações da estrutura sem tocar no MONTADOR que as propostas usam. O testador e a prévia de impacto
  // rodam a planilha de verdade (o mesmo motor das propostas) com o rascunho aplicado numa cópia.
  const rascunho = () => (((REG.tabelas || {}).ESTR_RASCUNHO || {}).cells) || {};
  const emRascunho = () => !!ui.estrRasc;
  function wbCom(opts) { const w = new Workbook(MODEL); REG.applyTo(w); if (opts && opts.rasc) { const s = w.sheet(MO); for (const [a, v] of Object.entries(rascunho())) { if (v === null || v === '') s.cells.delete(a); else s.cells.set(a, v); } w.invalidate(); } if (opts && opts.doc) w.applyDoc(JSON.parse(JSON.stringify(opts.doc))); return w; }
  function comWb(w, fn) { const keep = wb; const kc = listCache; wb = w; listCache = new Map(); try { return fn(); } finally { wb = keep; listCache = kc; } }
  // toda gravação da estrutura passa por aqui: em rascunho, vai para o rascunho; publicada, vai para o MONTADOR (e para o histórico, que é a trilha de versões)
  async function gravaMO(ch, desc) {
    if (!emRascunho()) return REG.setCells(MO, ch, desc, baseOf(MO));
    const cur = Object.assign({}, rascunho()); const base = (a) => { const v = baseRaw(MO, a); const t = (REG.tabelas[MO] || {})[a]; return t !== undefined ? (t === '' ? null : t) : v === undefined ? null : v; };
    for (const [a, v] of Object.entries(ch)) { const nv = v === undefined || v === '' ? null : v; if ((nv ?? null) === (base(a) ?? null)) delete cur[a]; else cur[a] = nv; }
    await REG.setTable('ESTR_RASCUNHO', { cells: cur, desc: [].concat((((REG.tabelas || {}).ESTR_RASCUNHO || {}).desc) || [], [desc]).slice(-30) }, 'Rascunho de estrutura: ' + desc, []);
    return true;
  }
  // diferenças do rascunho em relação ao publicado, por linha da estrutura
  function difRascunho() {
    const R = rascunho(); const rows = [...new Set(Object.keys(R).map((a) => +a.replace(/\D/g, '')))].sort((a, b) => a - b); const out = [];
    const pub = new Map(recLines().map((x) => [x.r, x])); const dr = comWb(wbCom({ rasc: true }), () => new Map(recLines().map((x) => [x.r, x])));
    for (const r of rows) { const a = pub.get(r), b = dr.get(r); out.push({ r, tipo: !a && b ? 'incluído' : a && !b ? 'excluído' : 'alterado', a, b, campos: a && b ? Object.keys(REC_COLS).filter((k) => String(a[k]) !== String(b[k])).map((k) => ({ k, de: a[k], para: b[k] })) : [] }); }
    return out;
  }
  // um item montado pela planilha, lido como a tela de item lê: componentes, origem, regra e custo
  function montarTeste(cfg, rasc) {
    const fam = (FAMS.find((f) => f[0] === cfg.estr) || [0, 0, 'CONJUNTO MOTOBOMBA'])[2];
    const it = { C21: fam }; if (cfg.modelo) it.C17 = cfg.modelo; else { for (const a of ['E17', 'D19', 'C19', 'H19', 'F19', 'I19', 'L19', 'J19', 'G17', 'BA19']) if (cfg[a] !== undefined && cfg[a] !== '') it[a] = /^(C19|H19|I19|G17)$/.test(a) && typeof parseInput(String(cfg[a]), 'num') === 'number' ? parseInput(String(cfg[a]), 'num') : cfg[a]; }
    for (const r of cfg.opc || []) it['BC' + r] = 1;
    const w = wbCom({ rasc, doc: { PROPOSTA: MODEL.example.PROPOSTA, 'ITEM 01': it } });
    return comWb(w, () => {
      const S = 'ITEM 01'; const lines = recLines(); const byR = new Map(lines.map((x) => [x.r, x])); const H2 = heads(); const comps = []; const usados = new Set();
      for (let r = 34; r <= 63; r++) { const d = txt(S, 'D' + r); if (!d && !txt(S, 'B' + r)) continue; const k = val(S, 'AE' + r); const ln = typeof k === 'number' ? byR.get(91 + k) : null; if (ln) usados.add(ln.r);
        const ins = d ? REG.insumos.find((i) => i.produto === d) : null; const unit = val(S, 'G' + r); const tot = val(S, 'H' + r);
        comps.push({ rot: ln ? ln.rot : txt(S, 'B' + r), desc: d, qtd: val(S, 'F' + r), unit, tot, acion: ln ? (ln.acion || 'TODOS') : 'TODOS', origem: ln ? origemTxt(ln, H2) : 'linha fixa da planilha', regra: ln ? regraTxt(ln.regra) : '', ln: ln ? ln.r : null, obs: txt(S, 'L' + r), ins, semCad: !!d && !ins, semPreco: !!d && !(typeof unit === 'number' && unit > 0) }); }
      for (const x of hiddenLines(S)) { const ln = byR.get(91 + (x.r - 67)); if (ln) usados.add(ln.r); comps.push({ rot: x.rot, desc: x.desc, qtd: x.qtd, unit: x.unit, tot: x.tot, acion: x.acion, origem: ln ? origemTxt(ln, H2) : '', regra: ln ? regraTxt(ln.regra) : '', ln: ln ? ln.r : null, obs: '', ins: REG.insumos.find((i) => i.produto === x.desc) || null, semCad: !!x.desc && !REG.insumos.some((i) => i.produto === x.desc), semPreco: !(x.unit > 0) }); }
      const c = arrCounts(S); const est = String(val(S, 'AR2') || cfg.estr);
      const has = { DIESEL: c.d > 0, ELETRICA: c.e > 0, JOCKEY: c.j, TODOS: true };
      const naoEntrou = lines.filter((x) => estrOf(x).includes(est) && !usados.has(x.r)).map((x) => ({ x, porque: !has[x.acion || 'TODOS'] ? 'o arranjo ' + (c.code || '—') + ' não tem ' + (ACIONS.find((a) => a[0] === x.acion) || [0, x.acion])[1].toLowerCase() : x.regra === 'OPCIONAL' ? 'opcional não marcado' : x.regra ? 'condição "' + regraTxt(x.regra) + '" não atendida' : 'a origem não devolveu insumo (' + origemTxt(x, H2) + ')' }));
      const alertas = []; for (const a of ['B32', 'P84', 'P78', 'P105', 'C185', 'C187']) { const t = txt(S, a); if (t && !/^OK/.test(t)) alertas.push(t); }
      let regrasCfg = []; try { regrasCfg = RG.avaliar(itemRegras(S), true); } catch (e) { regrasCfg = []; }
      return { comps, naoEntrou, alertas, regrasCfg, custo: val(S, 'H114'), desc: txt(S, 'C28'), code: c.code, est, arr: c };
    });
  }
  function vTestador() {
    const t = ui.tst || (ui.tst = { estr: estrList()[0], modo: 'modelo', modelo: '', opc: [], rasc: false });
    const mods = modelos().filter((m) => m.estr === t.estr); if (t.modo === 'modelo' && !mods.some((m) => m.nome === t.modelo)) t.modelo = mods.length ? mods[0].nome : '';
    const temRasc = Object.keys(rascunho()).length > 0;
    const inp = (a, lb, list) => { const L = list ? listFor(ITEMS[0], a) || [] : []; return `<div class="f"><label for="ts_${a}">${esc(lb)}</label><input id="ts_${a}" data-tst="${a}" value="${esc(t[a] || '')}"${L.length ? ` list="dl_ts_${a}"` : ''}>${L.length ? `<datalist id="dl_ts_${a}">${L.slice(0, 400).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}</div>`; };
    const opcs = recLines().filter((x) => x.regra === 'OPCIONAL' && estrOf(x).includes(t.estr));
    let res = null, erro = '';
    if (t.rodou) { try { res = montarTeste(t, t.rasc && temRasc); } catch (e) { erro = e.message || String(e); } }
    const sum = (L) => L.reduce((s, x) => s + num0(x.tot), 0);
    const grupos = res ? ACIONS.map(([k, lb]) => [k, lb, res.comps.filter((x) => (x.acion || 'TODOS') === k)]).filter((g) => g[2].length) : [];
    return `<div class="stack"><section class="card"><h2>Testador de estruturas <span class="sub">monta um item de teste na planilha real; nada é gravado</span></h2>
      <div class="fields"><div class="f"><label for="tsEstr">Estrutura</label><select id="tsEstr" data-tst="estr">${ESTRSf().map(([k, lb]) => `<option value="${k}"${k === t.estr ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select></div>
        <div class="f span2"><label>Configurar por</label><div class="seg"><label class="${t.modo === 'modelo' ? 'on' : ''}"><input type="radio" name="tsModo" value="modelo"${t.modo === 'modelo' ? ' checked' : ''}>modelo pronto</label><label class="${t.modo === 'manual' ? 'on' : ''}"><input type="radio" name="tsModo" value="manual"${t.modo === 'manual' ? ' checked' : ''}>características</label></div></div>
        ${temRasc ? `<div class="f"><label class="chk" style="margin-top:22px"><input type="checkbox" data-tstr${t.rasc ? ' checked' : ''}> usar o rascunho da estrutura</label></div>` : ''}</div>
      ${t.modo === 'modelo' ? `<div class="fields"><div class="f span2"><label for="tsMod">Modelo pronto</label><select id="tsMod" data-tst="modelo">${mods.map((m) => `<option${m.nome === t.modelo ? ' selected' : ''}>${esc(m.nome)}</option>`).join('') || '<option value="">nenhum modelo nesta estrutura</option>'}</select></div>
        <div class="f span2"><label for="tsCmp">Comparar com</label><select id="tsCmp" data-tst="cmp"><option value="">—</option>${modelos().filter((m) => m.nome !== t.modelo).map((m) => `<option${m.nome === t.cmp ? ' selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div></div>`
        : `<div class="fields">${inp('E17', 'Arranjo (ex.: D, E, DJ, DDJ)')}${inp('D19', 'Bomba', true)}${inp('C19', 'Potência diesel (HP)', true)}${inp('H19', 'Rotação (RPM)', true)}${inp('F19', 'Arrefecimento', true)}${inp('I19', 'Potência elétrica (CV)', true)}${inp('L19', 'Tensão do painel', true)}${inp('J19', 'Bomba jockey', true)}${inp('G17', 'Vazão')}</div>`}
      ${opcs.length ? `<div class="f"><label>Opcionais</label><div class="chks">${opcs.map((x) => { const row = 67 + (x.r - 91); return `<label class="chk"><input type="checkbox" data-tsopc="${row}"${(t.opc || []).includes(row) ? ' checked' : ''}> ${esc(x.rot)}</label>`; }).join('')}</div></div>` : ''}
      <div class="docbar"><button class="btn pri" data-tstrun>Montar e testar</button></div></section>
      ${erro ? `<div class="banner bad">${esc(erro)}</div>` : ''}
      ${res && t.modo === 'modelo' && t.cmp ? (() => { const m2 = modelos().find((m) => m.nome === t.cmp); let r2 = null; try { r2 = montarTeste({ estr: m2.estr, modelo: m2.nome }, t.rasc && temRasc); } catch (e) { r2 = null; } if (!r2) return '';
        const g = (R, k) => R.comps.filter((x) => (x.acion || 'TODOS') === k).reduce((s2, x) => s2 + num0(x.tot), 0);
        return `<section class="card"><h2>Comparação de custo por grupo <span class="sub">custo direto dos componentes (sem despesas alocadas e sem margem)</span></h2><div class="tw"><table class="t"><thead><tr><th>Grupo</th><th>${esc(t.modelo)}</th><th>${esc(t.cmp)}</th><th>Diferença</th></tr></thead><tbody>${ACIONS.map(([k, lb]) => { const a = g(res, k), b2 = g(r2, k); return a || b2 ? `<tr><td>${esc(lb)}</td><td class="n">${brl(a)}${res.custo ? ' <small class="sub">' + pct(a / res.custo, 0) + '</small>' : ''}</td><td class="n">${brl(b2)}${r2.custo ? ' <small class="sub">' + pct(b2 / r2.custo, 0) + '</small>' : ''}</td><td class="n">${brl(b2 - a)}</td></tr>` : ''; }).join('')}
          <tr class="tot"><td>Custo do item</td><td class="n">${brl(res.custo)}</td><td class="n">${brl(r2.custo)}</td><td class="n">${brl(num0(r2.custo) - num0(res.custo))}</td></tr></tbody></table></div>
          <p class="sub" style="margin:8px 0 0">Maiores componentes de custo: ${res.comps.slice().sort((a, b2) => num0(b2.tot) - num0(a.tot)).slice(0, 3).map((x) => esc(x.rot) + ' (' + brl(x.tot) + ')').join(', ')}.</p></section>`; })() : ''}
      ${res ? `<section class="card"><h2>Resultado <span class="sub">${esc(res.desc || '')}</span></h2>
        <div class="kpis"><div class="kpi lead"><span>Custo do item (planilha)</span><b>${brl(res.custo)}</b></div><div class="kpi"><span>Componentes</span><b>${res.comps.length}</b></div><div class="kpi"><span>Sem cadastro / sem preço</span><b class="${res.comps.some((x) => x.semCad || x.semPreco) ? 'bad-t' : 'ok-t'}">${res.comps.filter((x) => x.semCad).length} / ${res.comps.filter((x) => x.semPreco).length}</b></div><div class="kpi"><span>Arranjo</span><b>${esc(res.code || '—')}</b></div></div>
        ${res.alertas.length || res.regrasCfg.length ? `<ul class="alerts" style="margin-top:8px">${res.alertas.map((a) => `<li class="warn"><span>${esc(a)}</span></li>`).join('')}${res.regrasCfg.map((a) => `<li class="${a.sev === 'imped' ? 'bad' : a.sev === 'aviso' ? 'warn' : 'info'}"><span>${esc(a.msg)}</span></li>`).join('')}</ul>` : ''}
        <div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th>Componente</th><th>Insumo</th><th>Qtd</th><th>Unit.</th><th>Total</th><th>Por que entrou</th></tr></thead><tbody>${grupos.map(([k, lb, L]) => `<tr class="grp"><td colspan="4">${esc(lb)}</td><td class="n">${brl(sum(L))}</td><td class="n sub">${res.custo ? pct(sum(L) / res.custo, 1) : ''}</td></tr>` + L.map((x) => `<tr><td>${esc(x.rot || '')}</td><td>${esc(x.desc || '—')}${x.semCad ? ' <span class="pill bad">sem cadastro</span>' : x.semPreco ? ' <span class="pill warn">sem preço</span>' : ''}${x.ins && foraDeUso(x.ins) ? ' <span class="pill bad">' + esc(situ(x.ins)) + '</span>' : ''}${x.obs ? `<br><small class="sub">${esc(x.obs)}</small>` : ''}</td><td class="n">${fmtNum(x.qtd)}</td><td class="n">${typeof x.unit === 'number' ? brl(x.unit) : '—'}</td><td class="n">${typeof x.tot === 'number' ? brl(x.tot) : '—'}</td><td><small>${esc(x.origem)}${x.regra && x.regra !== 'Sempre' ? ' · ' + esc(x.regra) : ''}${x.ln ? ` · <button class="restore" data-qrec="${x.ln}">linha ${x.ln}</button>` : ''}</small></td></tr>`).join('')).join('')}</tbody></table></div>
        <h3 style="margin:10px 0 4px">Componentes da estrutura que não entraram <span class="sub">${res.naoEntrou.length}</span></h3>
        ${res.naoEntrou.length ? `<ul class="uso">${res.naoEntrou.map((n) => `<li><b>${esc(n.x.rot)}</b> — ${esc(n.porque)} <button class="restore" data-qrec="${n.x.r}">linha ${n.x.r}</button></li>`).join('')}</ul>` : '<p class="sub" style="margin:0">Todos os componentes da estrutura entraram.</p>'}</section>` : ''}</div>`;
  }
  document.addEventListener('change', (e) => {
    const t = ui.tst; if (!t || ui.cad !== 'testador') return;
    const el = e.target; if (el.dataset && el.dataset.tst) { t[el.dataset.tst] = el.value; if (el.dataset.tst === 'estr') { t.opc = []; t.modelo = ''; } t.rodou = false; render(); return; }
    if (el.name === 'tsModo') { t.modo = el.value; t.rodou = false; render(); return; }
    if (el.dataset && el.dataset.tsopc) { const r = +el.dataset.tsopc; t.opc = (t.opc || []).filter((x) => x !== r); if (el.checked) t.opc.push(r); return; }
    if (el.matches('[data-tstr]')) { t.rasc = el.checked; render(); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-tstrun]')) { document.querySelectorAll('[data-tst]').forEach((el) => { ui.tst[el.dataset.tst] = el.value; }); ui.tst.rodou = true; render(); } });
  // painel do rascunho na tela de estruturas: diferenças, impacto nos modelos prontos, publicar, descartar; versões publicadas com desfazer
  function rascunhoCard() {
    const R = rascunho(); const n = Object.keys(R).length; const ed = canEd();
    const vers = REG.historico.filter((h) => h.tipo === 'Estrutura' && h.ref === MO).slice(0, 8);
    const ver = vers.length ? `<details><summary class="sub">Versões publicadas recentes (${vers.length})</summary><ul class="uso">${vers.map((h) => `<li>${esc(fmtAt(h.at))} · ${who(h.by)} — ${esc(h.desc || '')} <small class="sub">(${(h.mudancas || []).length} célula(s))</small>${ed ? ` <button class="restore" data-estrdesf="${esc(h.at)}">desfazer esta versão</button>` : ''}</li>`).join('')}</ul></details>` : '';
    return `<section class="card"><h2>Publicação <span class="sub">${emRascunho() ? 'editando em rascunho: as propostas não veem estas alterações' : 'editando a estrutura publicada'}</span></h2>
      <div class="docbar">${ed ? `<label class="chk"><input type="checkbox" data-estrrasc${emRascunho() ? ' checked' : ''}> editar em rascunho</label>` : ''}${n ? `<span class="pill warn">rascunho com ${n} célula(s) alterada(s)</span><button class="btn sm" data-rascdif>Ver diferenças e impacto</button>${ed ? '<button class="btn sm pri" data-rascpub>Publicar…</button><button class="btn sm" data-rascdesc>Descartar rascunho</button>' : ''}<button class="btn sm" data-cad="testador">Testar no testador</button>` : '<span class="sub">Sem rascunho pendente.</span>'}</div>${ver}</section>`;
  }
  async function impactoRascunho(onProg) {
    const D = difRascunho(); const est = new Set(); for (const d of D) for (const x of [d.a, d.b]) if (x) estrOf(x).forEach((k) => est.add(k));
    const mods = modelos().filter((m) => est.has(m.estr)); const out = [];
    for (let i = 0; i < mods.length; i++) { const m = mods[i]; onProg && onProg(i + 1, mods.length); await new Promise((r) => setTimeout(r, 0));
      try { const a = montarTeste({ estr: m.estr, modelo: m.nome }, false); const b = montarTeste({ estr: m.estr, modelo: m.nome }, true);
        const na = new Set(a.comps.map((x) => x.desc)), nb = new Set(b.comps.map((x) => x.desc));
        const mais = [...nb].filter((x) => !na.has(x)), menos = [...na].filter((x) => !nb.has(x));
        if (Math.abs(num0(a.custo) - num0(b.custo)) > 0.005 || mais.length || menos.length) out.push({ m, a: a.custo, b: b.custo, mais, menos }); } catch (e) { out.push({ m, erro: e.message }); } }
    return { D, out, n: mods.length };
  }
  function rascDifModal(publicar) {
    const D = difRascunho();
    modal(`<h2>${publicar ? 'Publicar o rascunho da estrutura' : 'Rascunho da estrutura'}</h2>
      <div class="tw"><table class="t"><thead><tr><th>Linha</th><th>Componente</th><th>Mudança</th></tr></thead><tbody>${D.map((d) => `<tr><td class="n">${d.r}</td><td>${esc((d.b || d.a || {}).rot || '')}</td><td><span class="pill ${d.tipo === 'incluído' ? 'ok' : d.tipo === 'excluído' ? 'bad' : 'warn'}">${d.tipo}</span> ${d.campos.map((c) => `<small>${esc(c.k)}: ${esc(String(c.de))} → <b>${esc(String(c.para))}</b></small>`).join(' · ')}</td></tr>`).join('')}</tbody></table></div>
      <div id="riRes" class="banner info" style="margin:0">Calculando o impacto nos modelos prontos…</div>
      <div style="display:flex;gap:8px">${publicar ? '<button class="btn pri" id="riPub" disabled>Publicar</button>' : ''}<button class="btn" data-close>Fechar</button></div>`, (o, close) => {
      impactoRascunho((i, n) => { const el = $('#riRes', o); if (el) el.textContent = 'Testando modelos prontos: ' + i + ' de ' + n + '…'; }).then((r) => {
        const el = $('#riRes', o); if (!el) return;
        el.className = 'banner ' + (r.out.length ? 'warn' : 'ok');
        el.innerHTML = r.out.length ? `<b>${r.out.length} de ${r.n} modelo(s) pronto(s) mudam:</b><ul class="uso">${r.out.slice(0, 20).map((x) => `<li><b>${esc(x.m.nome)}</b> ${x.erro ? '<span class="bad-t">' + esc(x.erro) + '</span>' : `custo ${brl(x.a)} → ${brl(x.b)}${x.mais.length ? ' · entra: ' + esc(x.mais.join(', ')) : ''}${x.menos.length ? ' · sai: ' + esc(x.menos.join(', ')) : ''}`}</li>`).join('')}</ul>Atenção: os preços da época congelam só os preços. A composição dos itens não fica congelada: toda proposta que monta pela estrutura (inclusive enviadas e aprovadas, ao serem reabertas) passa a usar a estrutura nova.` : `Testados ${r.n} modelo(s) pronto(s) das estruturas alteradas: nenhum muda de custo nem de componentes.`;
        const pb = $('#riPub', o); if (pb) { pb.disabled = false; pb.onclick = async () => { pb.disabled = true; try { const R = rascunho(); const descs = ((((REG.tabelas || {}).ESTR_RASCUNHO || {}).desc) || []).slice(-5);
          await REG.setCells(MO, R, 'Publicado: ' + (descs.join('; ') || Object.keys(R).length + ' célula(s)'), baseOf(MO)); await REG.setTable('ESTR_RASCUNHO', { cells: {}, desc: [] }, 'Rascunho de estrutura publicado', []); ui.estrRasc = false; close(); toast('Estrutura publicada'); render(); } catch (er) { pb.disabled = false; toast(errMsg(er)); } }; }
      });
    });
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-rascdif]')) { rascDifModal(false); return; }
    if (e.target.closest('[data-rascpub]')) { rascDifModal(true); return; }
    const dc = e.target.closest('[data-rascdesc]'); if (dc) { if (!dc.dataset.sure) { dc.dataset.sure = 1; dc.textContent = 'Confirmar: descartar o rascunho'; return; } try { await REG.setTable('ESTR_RASCUNHO', { cells: {}, desc: [] }, 'Rascunho de estrutura descartado', []); toast('Rascunho descartado'); } catch (er) { toast(errMsg(er)); } return; }
    const df = e.target.closest('[data-estrdesf]'); if (df) { const h = REG.historico.find((x) => x.at === df.dataset.estrdesf && x.tipo === 'Estrutura'); if (!h) return;
      if (!df.dataset.sure) { df.dataset.sure = 1; df.textContent = 'confirmar: voltar estas ' + (h.mudancas || []).length + ' célula(s)'; return; }
      const ch = {}; const conf = []; for (const m of h.mudancas || []) { const cur = val(MO, m.campo); if ((cur ?? null) !== (m.para ?? null) && !(cur === '' && m.para === null)) { conf.push(m.campo); continue; } ch[m.campo] = m.de ?? null; }
      try { if (Object.keys(ch).length) await REG.setCells(MO, ch, 'Desfeita a versão de ' + fmtAt(h.at) + ': ' + (h.desc || ''), baseOf(MO)); toast(Object.keys(ch).length + ' célula(s) voltaram' + (conf.length ? '; ' + conf.length + ' já tinham mudado de novo e ficaram' : '')); } catch (er) { toast(errMsg(er)); } }
  });
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('[data-estrrasc]')) { ui.estrRasc = e.target.checked; render(); } });
  document.addEventListener('click', (e) => { const f = e.target.closest('[data-fold]'); if (!f || ui.view !== 'cadastro') return; ui.estrFold = Object.assign({}, ui.estrFold || {}, { [f.dataset.fold]: !(ui.estrFold || {})[f.dataset.fold] }); render(); });
  // comparar duas estruturas: o que é comum, o que só uma tem e onde a regra, a origem ou a quantidade diferem
  function estrComparaModal(A, B) {
    const L = recLines(); const H2 = heads(); const a = L.filter((x) => estrOf(x).includes(A)), b = L.filter((x) => estrOf(x).includes(B));
    const key = (x) => (x.acion || 'TODOS') + '|' + x.rot; const ma = new Map(a.map((x) => [key(x), x])), mb = new Map(b.map((x) => [key(x), x]));
    const rows = [...new Set([...ma.keys(), ...mb.keys()])].map((k) => { const x = ma.get(k), y = mb.get(k); const d = x && y ? ['tipo', 'campo', 'qtd', 'regra', 'fam'].filter((f) => String(x[f]) !== String(y[f])) : [];
      return `<tr><td>${esc((x || y).rot)}<br><small class="sub">${esc((ACIONS.find((q) => q[0] === ((x || y).acion || 'TODOS')) || [0, ''])[1])}</small></td><td>${x ? esc(origemTxt(x, H2)) + '<br><small class="sub">' + esc(qtdTxt(x.qtd)) + ' · ' + esc(regraTxt(x.regra)) + '</small>' : '<span class="pill mute">não tem</span>'}</td><td>${y ? esc(origemTxt(y, H2)) + '<br><small class="sub">' + esc(qtdTxt(y.qtd)) + ' · ' + esc(regraTxt(y.regra)) + '</small>' : '<span class="pill mute">não tem</span>'}</td><td>${!x || !y ? '<span class="pill warn">só em uma</span>' : x.r === y.r ? '<span class="pill ok">mesma linha</span>' : d.length ? '<span class="pill warn">difere: ' + esc(d.join(', ')) + '</span>' : '<span class="pill ok">igual</span>'}</td></tr>`; }).join('');
    modal(`<h2>Comparar estruturas · ${esc(famLabel(A))} × ${esc(famLabel(B))}</h2><div class="tw"><table class="t"><thead><tr><th>Componente</th><th>${esc(famLabel(A))}</th><th>${esc(famLabel(B))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div><button class="btn" data-close>Fechar</button></div>`);
  }
  document.addEventListener('change', (e) => { if (e.target.id === 'estrCmp' && e.target.value) { const A = estrList().includes(ui.estr) ? ui.estr : estrList()[0]; const B = e.target.value; e.target.value = ''; estrComparaModal(A, B); } });
  function vEstruturas() { const card = rascunhoCard(); return emRascunho() ? comWb(wbCom({ rasc: true }), () => card + '<div class="banner warn" style="margin:0">Mostrando o <b>rascunho</b>. As propostas continuam usando a estrutura publicada até você publicar.</div>' + vEstruturas0()) : card + vEstruturas0(); }
  const ESTR_SERV = new Set([34, 35, 37, 46, 47]); // mão de obra, pintura especial, embalagem, testes e ensaios, documentos
  const estrCode = (x) => { const m = /^(\d+)\./.exec(String(x.fam || '')); return m ? +m[1] : 0; };
  const estrFisica = (x) => { const c = estrCode(x); return c > 0 && !ESTR_SERV.has(c); };
  function estrNaProposta(x) {
    const c = estrCode(x); const fe = escFam(c); const pf = EP.fams[c] || null; const comTexto = !!(fe.t || (pf && pf.t));
    if ([1, 10].includes(c)) return '<span class="pill ok">Acionador</span>'; if ([11, 12].includes(c)) return '<span class="pill ok">Bomba</span>'; if (c === 13) return '<span class="pill ok">Bomba jockey</span>';
    if ([16, 18, 26].includes(c)) return '<span class="pill mute">dentro da descrição do motor diesel</span>';
    if (!c) return '<span class="pill mute">só no custo (sem família)</span>';
    if (ESC_INTERNO.has(c) && !fe.t) return '<span class="pill mute">só no custo (uso interno)</span>';
    if (FORA_ESC.has(c) && !comTexto) return '<span class="pill mute">só no custo (sem texto de escopo)</span>';
    return `<span class="pill ok">${esc(fe.grupo || GRUPO_PAD[c] || 'Acessórios')}</span>`;
  }
  function vEstruturas0() {
    const est = estrList().includes(ui.estr) ? ui.estr : estrList()[0]; const H = heads(); const lines = recLines();
    const free = 151 - 91 - lines.length;
    const tabs = ESTRSf().map(([k, lb]) => `<button role="tab" aria-selected="${k === est}" data-estr="${k}">${lb}</button>`).join('') + (canEd() && estrList().length < FAMS.length ? '<button data-estrnew>+ Nova estrutura</button>' : '');
    // três visões da mesma estrutura (nada é cadastrado duas vezes): técnica = composição física; custeio = tudo que forma
    // o custo (padrão); comercial = como cada linha aparece no escopo da proposta (mesma regra de escopoDoItem)
    const vis = ['tecnica', 'custeio', 'comercial'].includes(ui.estrVis) ? ui.estrVis : 'custeio';
    const mine = lines.filter((x) => estrOf(x).includes(est) && (vis !== 'tecnica' || estrFisica(x)));
    const groups = ACIONS.map(([k, lb]) => {
      const g = mine.filter((x) => (x.acion || 'TODOS') === k); if (!g.length) return '';
      const fold = (ui.estrFold || {})[k];
      return `<tr class="grp click" data-fold="${k}"><td colspan="6">${fold ? '▸' : '▾'} ${lb} <span class="sub">· ${g.length} componentes · ${g.filter((x) => !x.regra).length} obrigatório(s), ${g.filter((x) => x.regra === 'OPCIONAL').length} opcional(is), ${g.filter((x) => x.regra && x.regra !== 'OPCIONAL').length} condicional(is)</span></td></tr>` + (fold ? '' : g.map((x) => `<tr class="click" data-recpainel="${x.r}">
        <td><b>${esc(x.rot || '(sem nome)')}</b><br><small class="sub">${esc(famNome(x.fam))} · ${esc(x.bloco)}</small></td>
        <td>${esc(origemTxt(x, H))}</td><td>${esc(qtdTxt(x.qtd))}</td>
        <td>${x.regra ? `<span class="pill ${x.regra === 'OPCIONAL' ? 'mute' : 'warn'}">${x.regra === 'OPCIONAL' ? 'opcional' : 'condicional: ' + esc(regraTxt(x.regra))}</span>` : '<span class="pill ok">obrigatório</span>'}</td>
        <td>${vis === 'comercial' ? estrNaProposta(x) : x.estr === 'TODOS' ? '<span class="pill mute">todas</span>' : estrOf(x).map((e) => `<span class="pill mute">${esc(e)}</span>`).join(' ')}</td>
        <td><button class="btn sm" data-recedit="${x.r}">Editar</button></td></tr>`).join(''));
    }).join('');
    const sug = SUGESTOES.map((sg) => { const done = sugFeita(sg, lines); return `<label class="sugrow${done ? ' done' : ''}"><input type="checkbox" data-sug="${sg.id}" data-done="${done ? 1 : 0}"${done ? ' checked' : ''}${canEd() ? '' : ' disabled'}><span><b>${esc(sg.t)}</b>${done ? ' <span class="pill ok">aplicada</span> <small class="sub">desmarque para desfazer</small>' : ''}<br><small class="sub">${esc(sg.d)}</small></span></label>`; }).join('');
    const changed = Object.keys(REG.tabelas[MO] || {}).length + Object.keys(REG.tabelas['KIT HIDRÁULICA'] || {}).length;
    return `<div class="stack">
      <p class="sub" style="margin:0">A estrutura padrão diz o que entra em cada equipamento montado: quais componentes, de onde sai o insumo (o que foi escolhido no item, a tabela por porte ou um insumo fixo), quantos por bomba e em que condição. Toda proposta nova monta o item por aqui. ${free} linha(s) livre(s) de 60.</p>
      <div class="subtabs" role="tablist" aria-label="Estrutura">${tabs}</div>
      <div class="seg" role="radiogroup" aria-label="Visão da estrutura">${[['tecnica', 'Técnica', 'composição física do equipamento'], ['custeio', 'Custeio', 'tudo que forma o custo'], ['comercial', 'Comercial', 'como aparece no escopo da proposta']].map(([k, lb, d]) => `<label class="${vis === k ? 'on' : ''}" title="${d}"><input type="radio" name="estrVis" value="${k}" data-estrvis${vis === k ? ' checked' : ''}>${lb}</label>`).join('')}</div>
      <p class="sub" style="margin:0">${vis === 'tecnica' ? 'Visão técnica: só os componentes físicos (sem mão de obra, pintura, embalagem, testes e documentos).' : vis === 'comercial' ? 'Visão comercial: em que grupo do escopo da proposta cada linha aparece, ou se fica só no custo. Os textos vêm de Cadastro → Escopo por família/insumo.' : 'Visão de custeio: todas as linhas que formam o custo do equipamento.'}</p>
      <div class="docbar"><button class="btn sm pri" data-recnew${canEd() && free > 0 ? '' : ' disabled'}>+ Novo componente</button><select id="estrCmp" aria-label="Comparar com outra estrutura"><option value="">Comparar com…</option>${ESTRSf().filter(([k]) => k !== est).map(([k, lb]) => `<option value="${k}">${esc(lb)}</option>`).join('')}</select><button class="btn sm" data-cad="testador">Testar esta estrutura</button>${changed ? `<span class="sub">${changed} alteração(ões) sobre a planilha</span><button class="btn sm" data-recreset>Voltar à estrutura da planilha</button>` : ''}</div>
      <div class="tw"><table class="t"><thead><tr><th>Componente</th><th>De onde sai o insumo</th><th>Quantidade</th><th>Condição</th><th>${vis === 'comercial' ? 'Na proposta (escopo)' : 'Vale para'}</th><th></th></tr></thead><tbody>${groups || '<tr><td colspan="6" class="sub">Nenhum componente nesta estrutura.</td></tr>'}</tbody></table></div>
      <section class="card"><h2>Sugestões <span class="sub">marque o que quiser aplicar; opcionais não entram no preço até serem marcados no item</span></h2>
        <div class="sugs">${sug}</div>
        <div class="docbar" style="margin-top:10px"><button class="btn sm pri" data-sugapply${canEd() ? '' : ' disabled'}>Aplicar mudanças</button></div></section>
      <section class="card"><h2>Tabelas por porte <span class="sub">os componentes que mudam com o tamanho do equipamento</span></h2>
        ${porteExplica(ui.porte || 'FAIXA')}
        <div class="subtabs" role="tablist">${[['FAIXA', 'Potência do diesel (HP)'], ['CV', 'Potência elétrica (CV)'], ['VAZAO', 'Vazão (hidráulica)']].map(([k, lb]) => `<button role="tab" aria-selected="${(ui.porte || 'FAIXA') === k}" data-porte="${k}">${lb}</button>`).join('')}</div>
        ${porteGrid(ui.porte || 'FAIXA')}</section>
      ${datalists()}
    </div>`;
  }
  function porteExplica(k) {
    const spec = { FAIXA: [MO, 156, 157, 166, 'B', 'M', 'HP do motor diesel'], CV: [MO, 171, 172, 187, 'B', 'G', 'CV do motor elétrico'], VAZAO: ['KIT HIDRÁULICA', 3, 4, 32, 'A', 'Q', 'vazão da bomba'] }[k];
    const [sh, hr, r1, r2, c1, c2, oque] = spec; const rows = []; for (let r = r1; r <= r2; r++) if (val(sh, c1 + r) !== null) rows.push(r);
    const ex = rows[Math.floor(rows.length / 2)]; const cols = []; for (let c = colToNum(c1); c <= colToNum(c2); c++) cols.push(numToCol(c));
    const hd = (c) => String(val(sh, c + hr) || '').replace(/^\d+\s*·\s*/, ''); const v = (c) => { const x = val(sh, c + ex); return x === null || x === undefined ? '' : String(x); };
    const itens = cols.slice(k === 'VAZAO' ? 1 : k === 'CV' ? 2 : 3).filter((c) => v(c)).slice(0, 4).map((c) => `${hd(c).toLowerCase()} = <b>${esc(v(c))}</b>`).join('; ');
    const faixa = k === 'VAZAO' ? `vazão ${esc(v(cols[0]))}` : `de ${esc(v(cols[0]))} a ${esc(v(cols[1]))}`;
    return `<div class="banner info" style="margin:0 0 10px"><b>Para que serve:</b> cada linha é uma faixa de ${oque}. Quando um item é montado, o app acha a linha da faixa e coloca esses componentes sozinho, nas estruturas que usam "tabela por porte". Mudou a potência, eles mudam junto, sem ninguém escolher à mão.${ex ? `<br><b>Exemplo:</b> ${oque} ${faixa} → ${itens}.` : ''}<br>Para trocar um componente de uma faixa, clique nele e escolha o insumo do cadastro.</div>`;
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
        if (f || !ed) return `<td class="ptxt ${a in chg ? 'chg' : ''}">${esc(shown)}</td>`;
        // faixas: número digitado; insumos: texto inteiro, e a troca escolhe do cadastro
        if (numCols.includes(c)) return `<td class="in ${a in chg ? 'over' : ''}"><input data-tcell="${esc(sh)}|${a}" data-num="1" value="${esc(shown)}" inputmode="decimal" aria-label="${esc(sh)} ${a}"></td>`;
        return `<td class="ptxt ${a in chg ? 'over' : ''}"><button class="pedit" data-pedit="${esc(sh)}|${a}|${esc(String(val(sh, c + hr) || '').replace(/^\d+\s*·\s*/, ''))}">${esc(shown) || '<span class="sub">—</span>'}</button></td>`;
      }).join('') + '</tr>';
    }
    return `<div class="tw" style="margin-top:10px"><table class="t porte"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${k === 'VAZAO' ? '<p class="sub" style="margin:8px 0 0">Nesta tabela você muda as bitolas (colunas à esquerda); os nomes dos insumos à direita saem delas.</p>' : ''}`;
  }
  // painel lateral com os detalhes do componente da estrutura (só leitura; Editar abre a janela de sempre)
  function recPainel(r) {
    const x = recLines().find((y) => y.r === r); if (!x) return; const H = heads(); const est = estrOf(x);
    const code = (/^(\d+)\./.exec(String(x.fam || '')) || [])[1]; const insFam = x.fam ? REG.insumos.filter((i) => i.fam === x.fam) : [];
    const fixo = x.tipo === 'FIXO' || x.tipo === 'SPLIT' ? (REG.insumos.find((i) => FAMS_F.norm(i.produto) === FAMS_F.norm(x.campo)) || null) : null;
    modal(`<div class="objhead"><div class="objid"><small class="sub">Componente da estrutura · linha ${r}</small><h2>${esc(x.rot || '(sem nome)')}</h2><div class="objtit">${esc(famNome(x.fam) || 'sem família')} · ${esc(x.bloco || '')}</div></div>
        <div class="objkpis"><div><small class="sub">Condição</small><b>${x.regra ? (x.regra === 'OPCIONAL' ? 'opcional' : 'condicional') : 'obrigatório'}</b></div><div><small class="sub">Quantidade</small><b>${esc(qtdTxt(x.qtd))}</b></div></div></div>
      <div class="kv pcro"><div>De onde sai o insumo</div><div>${esc(origemTxt(x, H))}</div>
        <div>Quando entra</div><div>${x.regra ? esc(x.regra === 'OPCIONAL' ? 'opcional: entra quando marcado no item' : regraTxt(x.regra)) : 'sempre'}</div>
        <div>Acionamento</div><div>${esc((ACIONS.find((a) => a[0] === (x.acion || 'TODOS')) || [0, x.acion || 'todos'])[1])}</div>
        <div>Vale para</div><div>${x.estr === 'TODOS' ? 'todas as estruturas' : esc(est.map(famLabel).join(', '))}</div>
        <div>Na proposta (escopo)</div><div>${estrNaProposta(x)}</div>
        ${fixo ? `<div>Insumo fixo</div><div><b>${esc(fixo.id)}</b> · ${esc(fixo.produto)} · ${typeof fixo.valor === 'number' ? brl(fixo.valor) : 'sem preço'}</div>` : ''}
        ${x.fam ? `<div>Insumos da família</div><div>${insFam.length} no cadastro${code ? '' : ''}</div>` : ''}</div>
      <div class="fichaacoes">${canEd() ? `<button class="btn pri" data-recedit="${r}" data-ico="pencil">Editar componente</button>` : ''}
        ${fixo ? `<button class="btn" data-recins="${esc(fixo.id)}">Abrir ficha do insumo</button>` : ''}
        ${x.fam ? `<button class="btn" data-recfam="${esc(x.fam)}">Ver insumos da família</button>` : ''}
        <button class="btn" data-close>Fechar</button></div>`, (o, close) => {
      const m = o.querySelector('.modal'); if (m) m.classList.add('drawer');
      o.addEventListener('click', (e) => { const a = e.target.closest('[data-recins]'); if (a) { close(); insumoModal(a.dataset.recins); return; }
        const f = e.target.closest('[data-recfam]'); if (f) { close(); ui.cad = 'insumos'; ui.insFam = f.dataset.recfam; ui.insQ = ''; ui.pg_insumos = 1; render(); return; }
        const ed = e.target.closest('[data-recedit]'); if (ed) { close(); recModal(+ed.dataset.recedit); } });
    });
  }
  function recModal(r, preset) { if (emRascunho()) return comWb(wbCom({ rasc: true }), () => recModal0(r, preset)); return recModal0(r, preset); }
  function recModal0(r, preset) {
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
        <div class="f"><label for="rFam">Família do cadastro</label><select id="rFam"${ro}>${famList().map((f) => `<option value="${esc(f)}"${f === x.fam ? ' selected' : ''}>${esc(famNome(f))}</option>`).join('')}</select></div>
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
        try { await gravaMO(recChanges(x.r, nx), 'Estrutura: ' + nx.rot); close(); toast('Estrutura salva: ' + nx.rot); if (['FIXO', 'SPLIT'].includes(t) && !REG.insumos.some((i) => i.produto === campo)) toast('Atenção: "' + campo + '" não está no cadastro de insumos; entra com custo zero.'); }
        catch (e) { g('#rMsg').textContent = errMsg(e); }
      };
      const del = g('#rDel'); if (del) del.onclick = async () => {
        if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); return; }
        try { const ch = {}; for (const c of Object.values(REC_COLS)) ch[c + x.r] = null; await gravaMO(ch, 'Estrutura: excluiu ' + x.rot); close(); toast('Componente excluído da estrutura'); } catch (e) { g('#rMsg').textContent = errMsg(e); }
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
        try { await gravaMO(ch, 'Nova estrutura: ' + famLabel(k)); ui.estr = k; close(); toast('Estrutura criada: ' + famLabel(k)); } catch (e) { toast(errMsg(e)); }
      };
    });
  }
  async function applySugs(ids) {
    const lines = recLines(); const used = new Set(lines.map((x) => x.r)); const ch = {}; const novos = []; const nomes = [];
    for (const sg of SUGESTOES.filter((s) => ids.includes(s.id))) {
      if (sg.ren) for (const [r, n] of Object.entries(sg.ren)) if (used.has(+r)) ch[REC_COLS.rot + r] = n;
      if (sg.add) { let r = 92; while (used.has(r) && r <= 151) r++; if (r > 151) break; used.add(r); const ex = REG.insumos.find((i) => i.produto === sg.add.campo); Object.assign(ch, recChanges(r, ex && ex.fam ? Object.assign({}, sg.add, { fam: ex.fam }) : sg.add)); }
      if (sg.novo && !REG.insumos.some((i) => i.produto === sg.novo.produto)) novos.push(sg.novo);
      nomes.push(sg.t);
    }
    for (const n of novos) { const { a, b } = REG.nextCode(n.fam); await REG.saveInsumo({ id: REG.newInsumoId(a, b), a, b, fam: n.fam, produto: n.produto, origem: n.origem }, true); }
    if (Object.keys(ch).length) await gravaMO(ch, 'Sugestões aplicadas: ' + nomes.join('; '));
    toast(nomes.length + ' sugestão(ões) aplicada(s)');
  }
  // desfaz: nomes voltam ao da planilha; linhas opcionais saem da estrutura (o insumo criado fica no cadastro)
  async function undoSugs(ids) {
    const lines = recLines(); const ch = {}; const nomes = []; const b = baseOf(MO);
    for (const sg of SUGESTOES.filter((x) => ids.includes(x.id))) {
      if (sg.ren) for (const r of Object.keys(sg.ren)) ch[REC_COLS.rot + r] = b(REC_COLS.rot + r);
      if (sg.add) for (const x of lines.filter((l) => l.rot === sg.add.rot)) for (const c of Object.values(REC_COLS)) ch[c + x.r] = null;
      nomes.push(sg.t);
    }
    if (Object.keys(ch).length) await REG.setCells(MO, ch, 'Sugestões desfeitas: ' + nomes.join('; '), b);
    toast(nomes.length + ' sugestão(ões) desfeita(s)');
  }
  document.addEventListener('click', async (e) => {
    if (ui.view !== 'cadastro' || ui.cad !== 'estruturas') return;
    const t = e.target.closest('[data-estr]'); if (t) { ui.estr = t.dataset.estr; store.set(SK.view, ui); render(); return; }
    const vv = e.target.closest('[data-estrvis]'); if (vv) { ui.estrVis = vv.value; store.set(SK.view, ui); render(); return; }
    const pt = e.target.closest('[data-porte]'); if (pt) { ui.porte = pt.dataset.porte; render(); return; }
    const pe = e.target.closest('[data-pedit]'); if (pe) { const [sh, a, lb] = pe.dataset.pedit.split('|'); const cur = txt(sh, a);
      modal(`<h2>${esc(lb)}</h2><p class="sub" style="margin:0">Faixa da linha ${esc(a.replace(/\D/g, ''))}. Escolha o insumo do cadastro (a lista filtra enquanto você digita).</p><div class="f"><label for="peIn">Insumo</label><input id="peIn" list="dl_all" value="${esc(cur)}" autocomplete="off"></div><p class="sub" id="peMsg" style="margin:0"></p><div style="display:flex;gap:8px"><button class="btn pri" id="peOk">Salvar</button><button class="btn" id="peClr">Deixar sem</button><button class="btn" data-close>Cancelar</button></div>${datalists()}`, (o, close) => {
        const inp = $('#peIn', o); inp.focus(); inp.select();
        const go = async (v) => { close(); try { await REG.setCells(sh, { [a]: v || null }, 'Tabela por porte ' + lb + ' (linha ' + a.replace(/\D/g, '') + ')', baseOf(sh)); toast('Salvo'); } catch (err) { toast(errMsg(err)); } };
        $('#peOk', o).onclick = () => go(inp.value.trim()); $('#peClr', o).onclick = () => go('');
      }); return; }
    const ed = e.target.closest('[data-recedit]'); if (ed) { recModal(+ed.dataset.recedit); return; }
    const rp = e.target.closest('[data-recpainel]'); if (rp && !e.target.closest('button, a, input, select')) { recPainel(+rp.dataset.recpainel); return; }
    if (e.target.closest('[data-estrnew]')) { estrNewModal(); return; }
    if (e.target.closest('[data-recnew]')) { const used = new Set(recLines().map((x) => x.r)); let r = 92; while (used.has(r)) r++; if (r > 151) return toast('A receita já tem 60 linhas'); recModal(r, { r, rot: '', estr: ui.estr || 'CMB', acion: 'TODOS', bloco: 'TERCEIROS', fam: '', tipo: 'FIXO', campo: '', qtd: 'N', regra: '' }); return; }
    const rs = e.target.closest('[data-recreset]');
    if (rs) { if (!rs.dataset.sure) { rs.dataset.sure = 1; rs.textContent = 'Confirmar: desfazer todas as alterações da estrutura'; rs.classList.add('pri'); return; } try { await REG.resetSheet(MO); await REG.resetSheet('KIT HIDRÁULICA'); toast('Estrutura de volta à planilha'); } catch (err) { toast(errMsg(err)); } return; }
    if (e.target.closest('[data-sugapply]')) {
      const box = [...document.querySelectorAll('[data-sug]')]; const ids = box.filter((x) => x.checked && x.dataset.done !== '1').map((x) => x.dataset.sug); const undo = box.filter((x) => !x.checked && x.dataset.done === '1').map((x) => x.dataset.sug);
      if (!ids.length && !undo.length) return toast('Nada mudou: marque para aplicar ou desmarque para desfazer');
      try { if (undo.length) await undoSugs(undo); if (ids.length) await applySugs(ids); } catch (err) { toast(errMsg(err)); } }
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
  // famílias que já vêm com o app (sem insumo nem preço: o cadastro de Custos cria os insumos); excluir grava vazio por cima
  const FAM_PADRAO = {
    46: { nome: 'TESTESENSAIOS', desc: 'Testes e ensaios: desempenho em fábrica, testemunhado, hidrostático, vibração, ruído e laudos' },
    47: { nome: 'DOCUMENTOSDESENHOS', desc: 'Documentos e desenhos: desenhos para aprovação, dimensional, arranjo, diagramas, data book, memorial e ART' },
  };
  const famReg = () => { const out = Object.assign({}, FAM_PADRAO); for (const [k, v] of Object.entries(REG.tabelas.FAMILIAS || {})) { if (v && v.nome) out[k] = v; else delete out[k]; } return out; };
  function famInsumos() {
    const m = new Map();
    for (const x of REG.insumos) { if (!x.fam) continue; const e = m.get(x.fam) || { fam: x.fam, n: 0, semPreco: 0 }; e.n++; if (typeof x.valor !== 'number') e.semPreco++; m.set(x.fam, e); }
    for (const [code, v] of Object.entries(famReg())) { if (!v || !v.nome) continue; const fam = String(code).padStart(2, '0') + '.' + v.nome; if (![...m.keys()].some((f) => H.famCode(f) === +code)) m.set(fam, { fam, n: 0, semPreco: 0 }); }
    return [...m.values()].sort((a, b) => H.famCode(a.fam) - H.famCode(b.fam));
  }
  function vFamilias() {
    const ed = canEd(); const lines = recLines();
    const ins = famInsumos().map((x) => { const code = H.famCode(x.fam); const nome = x.fam.replace(/^\d+\./, ''); const d = (famReg()[code] || {}).desc || ''; const inRec = lines.filter((l) => l.fam === x.fam).length;
      return `<tr><td class="n">${String(code).padStart(2, '0')}</td><td><b>${esc(famNome(x.fam))}</b> <small class="sub code">${esc(nome)}</small>${d ? `<br><small class="sub">${esc(d)}</small>` : ''}</td><td class="n">${x.n}${x.semPreco ? ` <span class="pill warn">${x.semPreco} sem preço</span>` : ''}</td><td class="n">${inRec || ''}</td><td>${ed ? `<button class="btn sm" data-famedit="${esc(x.fam)}">Editar</button>` : ''} <button class="btn sm" data-famins="${esc(x.fam)}">Ver insumos</button></td></tr>`; }).join('');
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
      <div class="f spanall"><label for="fmDesc">Descrição</label><input id="fmDesc" value="${esc(desc)}" placeholder="Para que serve, o que entra aqui"></div>
      <div class="f span2"><label for="fmGrupo">Grupo no escopo da proposta</label><select id="fmGrupo">${GRUPOS_ESC.map((g) => `<option${(escFam(code).grupo || GRUPO_PAD[code] || 'Acessórios') === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="f spanall"><label for="fmEsc">Texto padrão no escopo <span class="sub">uma linha por item; {marca}, {modelo} e {qtd} são trocados; vale para os insumos da família sem descrição própria</span></label><textarea id="fmEsc" rows="3" placeholder="${esc(((EP.fams[code] || {}).t || {}).pt || 'ex.: Marca: {marca}\nModelo: {modelo}')}">${esc(escFam(code).t || '')}</textarea></div></div>
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
          { const gr = $('#fmGrupo', o).value, tx = $('#fmEsc', o).value.trim(); const cur = escFam(c); if (gr !== (cur.grupo || GRUPO_PAD[c] || 'Acessórios') || tx !== (cur.t || '')) await escSalvar((T) => { T.fams[c] = { grupo: gr, t: tx }; }, 'família ' + nf); }
          if (!isNew && nf !== fam) { const ch = {}; for (const l of recLines()) if (l.fam === fam) ch['F' + l.r] = nf; if (Object.keys(ch).length) await REG.setCells(MO, ch, 'Estrutura: família renomeada para ' + nf, baseOf(MO)); }
          close(); toast(isNew ? 'Família criada: ' + nf : 'Família salva: ' + nf);
        } catch (e) { $('#fmMsg', o).textContent = errMsg(e); }
      };
      const d = $('#fmDel', o); if (d) d.onclick = async () => { try { await REG.setCells('FAMILIAS', { [code]: null }, 'Família excluída ' + fam, (a) => FAM_PADRAO[a] || null); close(); toast('Família excluída'); } catch (e) { $('#fmMsg', o).textContent = errMsg(e); } };
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
      <div style="display:flex;gap:8px"><button class="btn pri" id="eqOk">Salvar</button><button class="btn" data-close>Fechar</button></div>
      ${isNew ? '' : `<h2>Desenhos</h2><div id="desBox" data-equip="${esc(String(val(CO, 'D' + r) || ''))}">${desenhosHtml(String(val(CO, 'D' + r) || ''))}</div>`}`, (o, close) => {
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
  // NCM e unidade por família de produto: cada item puxa daqui
  function ncmFamCard() {
    const ed = canEd(); const fams = listFor('ITEM 01', 'C21').filter((f) => f && f !== 'FABRICANTES');
    const map = Object.assign({}, REG.FISCAL_FAM_PADRAO, ((REG.tabelas || {}).FISCAL_FAM || {}).map || {});
    const ncms = []; for (let r = 110; r <= 126; r++) { const c = txt(PA, 'C' + r); if (c) ncms.push([c, txt(PA, 'B' + r)]); }
    const uns = []; for (let r = 150; r <= 169; r++) { const u = txt(PA, 'B' + r); if (u) uns.push([u, txt(PA, 'C' + r)]); }
    const sel = (f, k, opts, cur) => `<select data-ffam="${esc(f)}|${k}"${ed ? '' : ' disabled'}><option value="">—</option>${opts.map(([v, d]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v + (d ? ' · ' + d : ''))}</option>`).join('')}</select>`;
    return `<section class="card"><h2>NCM e unidade por família <span class="sub">o item puxa daqui; na proposta não se escolhe mais</span></h2>
      <div class="tw"><table class="t"><thead><tr><th>Família do equipamento</th><th>NCM</th><th>Unidade</th></tr></thead><tbody>${fams.map((f) => { const m = map[f] || {}; return `<tr><td><b>${esc(FAM_SEQ_LB[f] || f)}</b></td><td>${sel(f, 'ncm', ncms, m.ncm || '')}</td><td>${sel(f, 'unid', uns, m.unid || '')}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="sub" style="margin:8px 0 0">Família sem NCM aqui: o item fica sem NCM e o alerta da FCI avisa. Um item específico ainda pode trocar o NCM na tela do item (ex.: jockey de vazão pequena).</p></section>`;
  }
  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-ffam]'); if (!el) return; const [f, k] = el.dataset.ffam.split('|');
    const cur = JSON.parse(JSON.stringify(((REG.tabelas || {}).FISCAL_FAM || {}).map || {})); const base = Object.assign({}, (REG.FISCAL_FAM_PADRAO || {})[f], cur[f]);
    const de = base[k] || null; base[k] = el.value || ''; cur[f] = base;
    try { await REG.setTable('FISCAL_FAM', { map: cur }, (k === 'ncm' ? 'NCM' : 'Unidade') + ' da família ' + f, [{ campo: (k === 'ncm' ? 'NCM ' : 'Unidade ') + f, de, para: el.value || null }]); toast('Salvo'); } catch (er) { toast(errMsg(er)); }
  });
  // vendedores e agentes de negócio (AN): a proposta escolhe daqui, sem digitar
  function vendCard() {
    const ed = canEd(); const L = equipeCom();
    const row = (x, i) => `<tr><td><b>${esc(x.nome)}</b></td><td>${x.papel === 'an' ? 'Agente de negócio (AN)' : 'Vendedor'}</td><td>${esc(x.email || '')}</td><td>${ed ? `<button class="restore" data-vrm="${esc(x.nome)}|${x.papel}">remover</button>` : ''}</td></tr>`;
    return `<section class="card"><h2>Vendedores e agentes de negócio <span class="sub">a proposta escolhe daqui; a taxa de comissão está na tabela de comissões</span></h2>
      <div class="tw"><table class="t"><thead><tr><th>Nome</th><th>Papel</th><th>E-mail</th><th></th></tr></thead><tbody>${L.map(row).join('') || '<tr><td colspan="4" class="sub">Ninguém cadastrado ainda.</td></tr>'}</tbody></table></div>
      ${ed ? `<div class="fields" style="margin-top:10px"><div class="f span2"><label for="vNome">Nome</label><input id="vNome" placeholder="ex.: THIAGO SILVA"></div><div class="f"><label>Papel</label><div class="seg"><label class="on"><input type="radio" name="vPapel" value="vendedor" checked>Vendedor</label><label><input type="radio" name="vPapel" value="an">AN</label></div></div><div class="f span2"><label for="vMail">E-mail (opcional)</label><input id="vMail" type="email" inputmode="email" autocomplete="email"></div><div class="f" style="justify-content:end"><button class="btn pri" id="vAdd">Incluir</button></div></div>` : ''}</section>`;
  }
  async function salvaEquipe(lista, desc, mud) { try { await REG.setTable('EQUIPE_COM', { lista }, desc, mud || []); render(); } catch (e) { toast(errMsg(e)); } }
  document.addEventListener('click', (e) => {
    if (e.target.closest('#vAdd')) { const nome = ($('#vNome').value || '').trim().toUpperCase().replace(/\s+/g, ' '); const papel = (document.querySelector('input[name="vPapel"]:checked') || {}).value || 'vendedor'; const email = ($('#vMail').value || '').trim();
      if (!nome) { toast('Escreva o nome'); return; } const L = equipeCom(); if (L.some((x) => x.nome === nome && x.papel === papel)) { toast('Já cadastrado'); return; }
      salvaEquipe(L.concat([{ nome, papel, email }]), (papel === 'an' ? 'AN' : 'Vendedor') + ' incluído: ' + nome, [{ campo: nome, de: null, para: papel }]); return; }
    const rm = e.target.closest('[data-vrm]'); if (rm) { const [nome, papel] = rm.dataset.vrm.split('|'); salvaEquipe(equipeCom().filter((x) => !(x.nome === nome && x.papel === papel)), 'Removido de vendedores/AN: ' + nome, [{ campo: nome, de: papel, para: null }]); }
  });
  function vParamTab(tab) {
    const groups = {
      fiscal: () => divh('SEQ', 'Equipamentos') + ncmFamCard() + pcard('Tributos sobre a receita') + pcard('Convênio ICMS 52/91') + ['ncm', 'uf', 'fciuf'].map(tableCard).join('') + divh('SPV', 'Serviços e pós-venda') + SPV.cfgSec('fiscal', canEd()),
      preco: () => vendCard() + divh('SEQ', 'Equipamentos') + pcard('Formação do preço') + pcard('Fatores e negociação') + ['polfam', 'segdesc', 'comissao', 'pagto'].map(tableCard).join('') + divh('SPV', 'Serviços e pós-venda') + SPV.cfgSec('preco', canEd()),
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
    if (ui.view !== 'cadastro' && ui.view !== 'config') return;
    const ad = e.target.closest('[data-rowadd]'); if (ad) { ui.tblAdd = ad.dataset.rowadd; render(); const inp = document.querySelector('tr.newrow input, tr.newrow select'); if (inp) inp.focus(); return; }
    const dl = e.target.closest('[data-rowdel]'); if (dl) { if (!dl.dataset.sure) { dl.dataset.sure = 1; dl.textContent = 'confirmar'; return; } const [id, r] = dl.dataset.rowdel.split('|'); rowDelete(id, +r); return; }
    const fe = e.target.closest('[data-famedit]'); if (fe) { famModal(fe.dataset.famedit); return; }
    if (e.target.closest('[data-famnew]')) { famModal(null); return; }
    const fi = e.target.closest('[data-famins]'); if (fi) { ui.cad = 'insumos'; ui.insFam = fi.dataset.famins; ui.pg_insumos = 1; store.set(SK.view, ui); render(); return; }
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
    const fam = $('#insFam'); if (fam) fam.onchange = () => { ui.insFam = fam.value; ui.pg_insumos = 1; render(); };
    const sem = $('#insSem'); if (sem) sem.onchange = () => { ui.insSem = sem.checked; ui.pg_insumos = 1; render(); };
    const ht = $('#histT'); if (ht) ht.onchange = () => { ui.histT = ht.value; render(); };
    const csv = $('#insCsv'); if (csv) csv.onclick = exportInsumos;
    const nw = $('#insNew'); if (nw) nw.onclick = () => insumoModal(null);
    const kn = $('#kitNew'); if (kn) kn.onclick = () => kitModal(kn.dataset.kind, null);
    fillNames($('#app'));
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cad]'); if (t) { ui.cad = t.dataset.cad; store.set(SK.view, ui); render(); return; }
    const ins = e.target.closest('[data-ins]'); if (ins && !e.target.closest('input')) { insumoModal(ins.dataset.ins); return; }
    const kit = e.target.closest('[data-kit]'); if (kit && !e.target.closest('input')) { kitModal(ui.cad === 'bomba' ? 'bomba' : 'motor', kit.dataset.kit); return; }
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
      <section class="card" id="ajuda_guia"><div class="guide">${h}</div></section>
      <section class="card" id="ajuda_atalhos"><h2>Atalhos de teclado</h2><div class="kv pcro">
        <div><kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> no Mac)</div><div>Busca universal: propostas, clientes, insumos, famílias, kits, estruturas, regras e documentos</div>
        <div><kbd>Ctrl</kbd> + <kbd>S</kbd></div><div>Salvar a proposta</div>
        <div><kbd>Esc</kbd></div><div>Fechar a janela aberta, a busca ou o menu</div>
        <div><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Home</kbd> <kbd>End</kbd></div><div>Percorrer o menu lateral e os resultados da busca</div>
        <div><kbd>Enter</kbd></div><div>Abrir o item escolhido no menu ou na busca; num campo da planilha, gravar e sair do campo</div></div></section>
      <section class="card" id="ajuda_versao"><h2>Informações da versão</h2><div class="kv pcro">
        <div>Aplicativo</div><div>LS Pricer REV22</div><div>Gerado em</div><div>__LS_BUILD__</div>
        <div>Dados</div><div>${REG.mode === 'shared' ? 'banco compartilhado da equipe (claude.ai)' : 'neste navegador (arquivo aberto localmente; sem login nem permissões por pessoa)'}</div>
        <div>Motor de cálculo</div><div>planilha REV21 (fórmulas e células preservadas; regressão com 0 diferença)</div>
        <div>Documentação</div><div><code>pricer/docs/REV22/</code> (relatórios) e <code>pricer/docs/manual/</code> (manual de utilização)</div></div></section></div>`;
  }

  // ---------- fotografia da formação (para margens e fechamento) ----------
  const MEM_KEYS = { custoMat: 'Custo do conjunto de peças e materiais', custoFab: 'Custos dos serviços de fabricação', custoStartup: 'Custos de Startup', custoFrete: 'Custos dos fretes', custo: 'TOTAL CUSTOS',
    icmsPct: 'ICMS', pisCofinsPct: 'PIS/COFINS', irPct: 'IR/CSLL', impostosPct: 'TOTAL IMPOSTOS (sem o IPI)', comissaoPct: 'TOTAL COMISSÃO', margemPct: 'Margem Liquida',
    venda: 'Preço de venda com impostos — SEM IPI (total)', qtd: 'Quantidade', ipiPct: 'IPI (%)', comExtPct: 'Comissão de 3os externos', comIntPct: 'Comissão de 3os internos', ipi: 'IPI (R$)', vendaIpi: 'Preço de venda com impostos e COM IPI (total)', impostos: 'Impostos', comissao: 'Comissão', margem: 'Margem líquida', ci: 'Conteúdo de importação (CI)' };
  // composição do preço de venda: as linhas do memorial (coluna do total), na ordem custo → impostos → comissões →
  // margem → preço sem IPI → IPI → preço com IPI. Só leitura do motor; nenhuma conta nova (a última linha só confere a soma).
  function composicaoPrecoHtml() {
    const R = memRows(); const v = (k) => (R[k] ? val('MEMORIAL', 'M' + R[k]) : null); const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
    const venda = num(v('venda')); if (!venda) return '';
    const lin = [['Peças e materiais', v('custoMat')], ['Serviços de fabricação', v('custoFab')], ['Start-up', v('custoStartup')], ['Fretes', v('custoFrete')]].filter(([, x]) => num(x));
    const custo = num(v('custo')), imp = num(v('impostos')), com = num(v('comissao')), mg = num(v('margem')), ipi = num(v('ipi')), comIpi = num(v('vendaIpi'));
    const pc = (x) => (num(x) !== null && venda ? pct(x / venda) : '');
    const resto = [custo, imp, com, mg].every((x) => x !== null) ? venda - custo - imp - com - mg : null;
    const barra = [['custo', custo, 'Custo'], ['imp', imp, 'Impostos'], ['com', com, 'Comissões'], ['mg', mg, 'Margem']].filter(([, x]) => num(x) && x > 0)
      .map(([k, x, lb]) => `<span class="cpb-${k}" style="width:${Math.max(0, Math.min(100, (x / venda) * 100)).toFixed(2)}%" title="${esc(lb + ': ' + brl(x) + ' (' + pct(x / venda) + ')')}"></span>`).join('');
    // o memorial dá comissão e margem em % do preço sem impostos; a 4ª coluna repete esses percentuais para não parecerem divergentes
    const mp = (k) => { const x = num(v(k)); return x === null ? '' : pct(x); };
    const tr = (lb, x, extra, cls, mem) => `<tr class="${cls || ''}"><td>${lb}</td><td class="n">${brl(x)}</td><td class="n">${extra ?? pc(x)}</td><td class="n">${mem || ''}</td></tr>`;
    return `<section class="card cpreco"><h2>Composição do preço <span class="sub">memorial de cálculo, total da proposta</span></h2>
      <div class="cpbar" role="img" aria-label="Divisão do preço sem IPI: custo ${pc(custo)}, impostos ${pc(imp)}, comissões ${pc(com)}, margem ${pc(mg)}">${barra}</div>
      <div class="cplegend"><span><i class="cpb-custo"></i>Custo ${pc(custo)}</span><span><i class="cpb-imp"></i>Impostos ${pc(imp)}</span><span><i class="cpb-com"></i>Comissões ${pc(com)}</span><span><i class="cpb-mg"></i>Margem ${pc(mg)}</span></div>
      <div class="tw"><table class="t"><thead><tr><th>Componente</th><th class="n">Valor</th><th class="n">% do preço sem IPI</th><th class="n">% no memorial</th></tr></thead><tbody>
        ${lin.map(([lb, x]) => tr('&nbsp;&nbsp;' + esc(lb), x, null, 'sub-t')).join('')}
        ${tr('<b>Custo total (memorial)</b>', custo, null, 'tot')}
        ${tr('Impostos (sem o IPI)', imp, null, '', mp('impostosPct'))}${tr('Comissões', com, null, '', mp('comissaoPct'))}${tr('Margem líquida', mg, null, '', mp('margemPct'))}
        ${resto !== null && Math.abs(resto) > 0.01 ? tr('Outros itens do memorial', resto) : ''}
        ${tr('<b>Preço de venda sem IPI</b>', venda, '100%', 'tot')}
        ${num(ipi) ? tr('IPI', ipi, '') : ''}${tr('<b>Preço de venda com IPI</b>', comIpi, '', 'tot')}
      </tbody></table></div>
      ${num(v('impostos')) !== null ? `<p class="sub" style="margin:8px 0 0">% no memorial: impostos sobre o preço sem IPI; comissões e margem sobre o preço sem impostos (${brl(venda - imp)}), como a planilha calcula. Os impostos incluem ICMS, PIS/COFINS e IR/CSLL.</p>` : ''}
      ${(() => { const g16 = num(val('PROPOSTA', 'G16')); const st = num(v('custoStartup')) || 0, fr = num(v('custoFrete')) || 0; if (custo === null || g16 === null || Math.abs(custo - g16) < 0.01) return '';
        const dif = custo - g16; const bate = Math.abs(dif - st - fr) < 0.01;
        return `<p class="sub" style="margin:8px 0 0">O indicador <b>Custo total dos itens</b> no alto da aba (célula G16 da planilha) soma o custo dos itens: ${brl(g16)}. O custo total do memorial é ${brl(dif)} maior${bate ? ' — exatamente o start-up e os fretes, que o memorial soma ao custo' : ''}.</p>`; })()}
      <div class="docbar" style="margin-top:8px"><button class="btn sm" data-view="memorial" data-ico="scroll-text">Abrir o memorial de cálculo</button><span class="sub">Valores do motor da planilha (as mesmas fórmulas da REV21); o memorial mostra item por item.</span></div></section>`;
  }
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
      const pol = { fatorTabela: n(val(S, 'P20')), descMax: n(val(S, 'P24')), piso: n(val(S, 'P25')), fatorAplicado: n(val(S, 'P23')), pisPct: n(val(PA, 'C5')), cofinsPct: n(val(PA, 'C6')), ncm: txt(S, 'G7') };
      itens.push(Object.assign(pol, { n: S, origem: ro, nome: txt(S, 'C28') || txt('PROPOSTA', 'C' + (20 + i)) || S, codigo: txt(S, 'C27'), familia: fam, familiaNome: famLabel(fam), linhas }, m, { qtd }));
    });
    const T = pick('M');
    return { div: 'SEQ', venda: T.venda, vendaIpi: T.vendaIpi, custo: T.custo, impostos: T.impostos, comissao: T.comissao, margem: T.margem, margemPct: T.margemPct, minimo: n(val(PA, 'C34')), itens };
  }
  // fotografia de qualquer proposta salva, sem mexer na que está aberta
  function snapshotOf(p, extraIns) {
    if (p.div === 'SPV' && p.spv) return SPV.snapshot(p.spv);
    if (p.facts) return FX.snapshot(p.facts);
    const doc = JSON.parse(JSON.stringify(p.doc || {})); migrar(doc);
    const keep = wb; const w2 = new Workbook(MODEL); REG.applyTo(w2); aplicaPrecos(w2, precosFixos(p) ? p.precos : null, extraIns); w2.applyDoc(doc);
    wb = w2; listCache = new Map();
    try { return seqSnapshot(); } finally { wb = keep; listCache = new Map(); }
  }
  const resumoOf = (snap) => ({ venda: snap.venda, custo: snap.custo, impostos: snap.impostos, comissao: snap.comissao, margem: snap.margem, margemPct: snap.margemPct, minimo: snap.minimo,
    itens: snap.itens.map((x) => ({ nome: x.nome, familia: x.familia, familiaNome: x.familiaNome, qtd: x.qtd, venda: x.venda, custo: x.custo, margem: x.margem, margemPct: x.margemPct })) });

  // ---------- propostas: nova, salvar, abrir, exportar ----------
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  // ---- busca universal (Ctrl+K / ⌘K; no celular, o botão de lupa no topo) ----
  // Procura no que a pessoa já pode ler (o banco aplica as permissões): propostas, clientes, insumos, famílias, modelos
  // prontos, kits, estruturas, regras e documentos. Cada resultado tem a ação principal (Enter) e atalhos.
  const nb = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function buscaResultados(q0) {
    const q = nb(q0).trim(); if (q.length < 2) return [];
    const termos = q.split(/\s+/).filter(Boolean); const bate = (...c) => { const h = nb(c.filter(Boolean).join(' ')); return termos.every((t) => h.includes(t)); };
    const G = [];
    const props = (REG.listPropostas() || []).filter((p) => bate(p.numero, p.cliente, p.name, p.div, p.tipo, p.status)).slice(0, 6);
    if (props.length) G.push(['Propostas', props.map((p) => ({ t: (p.numero || 'sem número') + ' · ' + (p.cliente || p.name || ''), d: [p.div || 'SEQ', p.status || 'rascunho', typeof p.total === 'number' ? brl(p.total) : ''].filter(Boolean).join(' · '), ico: 'file-text', acoes: [['Abrir', () => openProposta(p, false)], ['Duplicar', () => openProposta(p, true)]] }))]);
    const clis = [...clientesConhecidos().values()].filter((c) => bate(c.nome, c.L5)).slice(0, 5);
    if (clis.length) G.push(['Clientes', clis.map((c) => ({ t: c.nome, d: [c.L5, c.F7 || c.uf].filter(Boolean).join(' · ') || 'cliente de propostas salvas', ico: 'users', acoes: [['Ver propostas', () => { ui.homeQ = c.nome; ui.homeDiv = 'todas'; setView('inicio'); }]] }))]);
    const ins = REG.insumos.filter((i) => bate(i.id, i.produto, i.fab, i.codFab, i.descCom, famNome(i.fam))).slice(0, 8);
    if (ins.length) G.push(['Produtos e insumos', ins.map((i) => ({ t: i.id + ' · ' + i.produto, d: [famNome(i.fam), i.fab, typeof i.valor === 'number' ? 'custo ' + brl(i.valor) : 'sem preço', situ(i) !== 'ativo' ? situ(i) : ''].filter(Boolean).join(' · '), ico: 'package',
      acoes: [['Abrir ficha', () => { ui.cad = 'insumos'; if (ui.view !== 'cadastro') setView('cadastro'); insumoModal(i.id); }], ['Localizar na lista', () => { ui.cad = 'insumos'; ui.insQ = i.id; ui.pg_insumos = 1; ui.insFam = ''; ui.pg_insumos = 1; setView('cadastro'); }]] }))]);
    const fams = famList().filter((f) => bate(f, famNome(f))).slice(0, 5);
    if (fams.length) G.push(['Famílias de insumo', fams.map((f) => ({ t: famNome(f), d: f + ' · ' + REG.insumos.filter((i) => i.fam === f).length + ' insumo(s)', ico: 'folder-tree', acoes: [['Ver insumos', () => { ui.cad = 'insumos'; ui.insFam = f; ui.pg_insumos = 1; ui.insQ = ''; ui.pg_insumos = 1; setView('cadastro'); }]] }))]);
    let mods = []; try { mods = modelos().filter((m) => bate(m.nome, m.estr, m.bomba, m.motor)).slice(0, 5); } catch (e) { mods = []; }
    if (mods.length) G.push(['Modelos prontos', mods.map((m) => ({ t: m.nome, d: [famLabel(m.estr), m.bomba, m.motor].filter(Boolean).join(' · '), ico: 'layout-template', acoes: [['Abrir famílias e modelos', () => { ui.cad = 'familias'; setView('cadastro'); }]] }))]);
    const kits = [...REG.kitMotor.map((k) => ['motor', k]), ...REG.kitBomba.map((k) => ['bomba', k])].filter(([, k]) => bate(k.desc, k.marca, k.tipo)).slice(0, 5);
    if (kits.length) G.push(['Kits', kits.map(([tp, k]) => ({ t: k.desc, d: (tp === 'motor' ? 'kit de motor diesel' : 'kit de bomba') + (k.marca ? ' · ' + k.marca : ''), ico: 'boxes', acoes: [['Abrir kit', () => { ui.cad = tp; ui.kitQ = k.desc; setView('cadastro'); }]] }))]);
    let ests = []; try { ests = ESTRSf().filter(([k, lb]) => bate(k, lb)).slice(0, 5); } catch (e) { ests = []; }
    if (ests.length) G.push(['Estruturas', ests.map(([k, lb]) => ({ t: lb, d: 'estrutura ' + k, ico: 'network', acoes: [['Abrir estrutura', () => { ui.cad = 'estruturas'; ui.estr = k; setView('cadastro'); }]] }))]);
    const regs = RG.lista().filter((r) => bate(r.id, r.nome, r.componente, r.mensagem)).slice(0, 5);
    if (regs.length) G.push(['Regras de configuração', regs.map((r) => ({ t: (r.id ? r.id + ' · ' : '') + (r.nome || r.componente || 'regra'), d: [r.status, r.efeito, r.componente].filter(Boolean).join(' · '), ico: 'git-branch', acoes: [['Abrir regras', () => { ui.cad = 'regras'; setView('cadastro'); }]] }))]);
    let docs = []; try { docs = (SPV.docs() || []).filter((d) => bate(d.nome, d.fornecedor, d.numero, d.notas, d.propNome)).slice(0, 5); } catch (e) { docs = []; }
    if (docs.length) G.push(['Documentos', docs.map((d) => ({ t: d.nome || 'documento', d: [d.tipo, d.fornecedor, d.numero && 'nº ' + d.numero].filter(Boolean).join(' · '), ico: 'paperclip', acoes: [['Abrir', () => SPV.abrirDoc(d, false)], ['Ver em Documentos', () => { ui.docQ = d.nome || ''; setView('documentos'); }]] }))]);
    return G;
  }
  let buscaQ = '';
  function buscaAbrir() {
    if ($('#gBusca')) { const i = $('#gBusca input'); if (i) i.focus(); return; }
    let acoes = [];
    modal(`<div id="gBusca" class="gbusca"><label class="sr" for="gbQ">Buscar</label><div class="gbq"><input id="gbQ" type="search" autocomplete="off" placeholder="Buscar proposta, cliente, insumo, família, kit, estrutura, regra ou documento" value="${esc(buscaQ)}" aria-controls="gbRes" aria-describedby="gbDica"></div>
      <small class="sub" id="gbDica">↑ ↓ escolhem · Enter abre · Esc fecha · procura só no que você tem acesso</small><div id="gbRes" class="gbres" role="listbox" aria-label="Resultados"></div></div>`, (o, close) => {
      const inp = $('#gbQ', o); const res = $('#gbRes', o);
      const desenha = () => { buscaQ = inp.value; const G = buscaResultados(inp.value); acoes = [];
        res.innerHTML = String(inp.value).trim().length < 2 ? '<p class="sub">Digite pelo menos 2 letras.</p>' : !G.length ? '<p class="sub">Nada encontrado.</p>' : G.map(([nome, L]) => `<div class="gbg"><div class="gbgh">${esc(nome)}</div>${L.map((r) => { const i = acoes.length; acoes.push(r); return `<div class="gbi" role="option" id="gb_${i}" data-gbi="${i}" aria-selected="false" tabindex="-1"><span class="gbico" data-ico="${r.ico}"></span><span class="gbt"><b>${esc(r.t)}</b><small class="sub">${esc(r.d)}</small></span><span class="gbacts">${r.acoes.map(([lb], j) => `<button type="button" class="btn sm${j ? '' : ' pri'}" data-gba="${i}|${j}">${esc(lb)}</button>`).join('')}</span></div>`; }).join('')}</div>`).join('');
        decorar(res); marca(0); };
      let sel = 0; const marca = (i) => { const L = [...res.querySelectorAll('[data-gbi]')]; if (!L.length) return; sel = Math.max(0, Math.min(L.length - 1, i)); L.forEach((x, k) => x.setAttribute('aria-selected', k === sel ? 'true' : 'false')); inp.setAttribute('aria-activedescendant', 'gb_' + sel); L[sel].scrollIntoView({ block: 'nearest' }); };
      const faz = (i, j) => { const r = acoes[i]; if (!r) return; close(); r.acoes[j || 0][1](); };
      inp.addEventListener('input', desenha);
      inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); marca(sel + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); marca(sel - 1); } else if (e.key === 'Enter') { e.preventDefault(); faz(sel, 0); } });
      res.addEventListener('click', (e) => { const b = e.target.closest('[data-gba]'); if (b) { const [i, j] = b.dataset.gba.split('|').map(Number); faz(i, j); return; } const it = e.target.closest('[data-gbi]'); if (it) faz(+it.dataset.gbi, 0); });
      desenha(); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
  }
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); buscaAbrir(); } });
  function modal(html, bind) {
    const o = $('#overlay'); o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="card">${html}</div></div>`;
    setTimeout(() => decorar(o), 0);
    setTimeout(() => { if (!o.contains(document.activeElement)) { const f = o.querySelector('input:not([type=hidden]):not([disabled]),select,textarea,button'); if (f) f.focus(); } }, 0);
    const close = () => { o.innerHTML = ''; };
    o.querySelector('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal') || e.target.closest('[data-close]')) close(); });
    bind && bind(o, close);
  }
  function loadDoc(doc, name, id, extra) { state = Object.assign({ id: id || null, uid: newUid(), div: 'SEQ', status: 'rascunho', doc: JSON.parse(JSON.stringify(doc || {})), name: name || '' }, extra || {}); build(); persist(); dlMap = null; ui.item = 0; render(); ui.assinaturaAberta = assinatura(); setTimeout(() => { ui.assinaturaAberta = assinatura(); }, 150); }
  const assinatura = () => JSON.stringify([state.doc, state.spv, state.facts, state.propCom || {}]);
  function docTitle() {
    if (isSpv()) return [state.spv.numero, state.spv.cliente].filter(Boolean).join(' · ') || 'SPV sem nome';
    if (isFacts()) return ['FACTS', state.facts.numero, state.facts.cliente].filter(Boolean).join(' · ');
    const n = txt('PROPOSTA', 'C5'), c = txt('PROPOSTA', 'F5'); return [n, c].filter(Boolean).join(' · ') || 'Proposta sem nome';
  }
  // abre (ou duplica) uma proposta salva, SEQ ou SPV
  function openProposta(p, dup) {
    const keepId = dup ? null : (p.local && REG.mode === 'shared' ? null : p.id);
    const extra = { uid: dup || !p.uid ? newUid() : p.uid, status: dup ? 'rascunho' : (p.status || 'rascunho'), ack: dup ? {} : (p.ack || {}), verBase: dup ? undefined : (p.verDoc || 0), cenSim: dup ? [] : (p.cenSim || []), naCustos: dup ? {} : (p.naCustos || {}), precosFix: !dup && precosFixos(p) ? JSON.parse(JSON.stringify(p.precos)) : null, precosSalvos: dup ? null : (p.precos || null), origemItens: p.origemItens || {}, propCom: p.propCom ? JSON.parse(JSON.stringify(p.propCom)) : {} };
    if (p.div === 'SPV' && p.spv) {
      const spv = JSON.parse(JSON.stringify(p.spv)); if (dup) { spv.numero = ''; spv.status = 'rascunho'; spv.data = new Date().toISOString().slice(0, 10); }
      loadDoc({}, p.name, keepId, Object.assign(extra, { div: 'SPV', spv }));
    } else if (p.facts) {
      const facts = JSON.parse(JSON.stringify(p.facts)); if (dup) facts.numero = '';
      loadDoc({}, p.name, keepId, Object.assign(extra, { div: 'SEQ', sol: 'FACTS', facts }));
    } else loadDoc(p.doc, p.name, keepId, extra);
    if (dup && !isSpv() && !isFacts()) { if (state.doc.PROPOSTA) delete state.doc.PROPOSTA.C5; build(); persist(); }
    dirty = !!dup; ui.recuperado = null; ui.erroSalvar = null; ui.salvoEm = dup ? null : p.at; ui.step = 1; ui.propFull = false; setView('proposta');
    toast(dup ? 'Cópia criada: dê um número novo e salve' : 'Aberto: ' + (p.name || docTitle()));
  }
  const logEv = (e) => REG.log(e);
  const PD = window.PricerPedidos({ REG, esc, brl, modal, toast, parseInput, ui, render, getState: () => state, docTitle, famList: () => famList(), fillNames: (o) => fillNames(o), log: logEv });
  const PN = window.PricerPendencias({ REG, esc, toast, modal, ui, render, log: logEv, fillNames: (o) => fillNames(o), abrirProposta: (p, step) => { openProposta(p, false); ui.step = step || 1; render(); window.scrollTo(0, 0); } });
  const FX = window.PricerFacts({ confCard: () => (() => { try { return docPropostaCampos(propostaDados()); } catch (e) { return ''; } })() + propComCard() + confCard() + PN.cardProposta(state.id, docTitle()), revSelo: () => revSelo(), REG, esc, brl, pct, NF, toast, parseInput, val, txt, ui, render, modal, getState: () => state,
    setState: (s) => { state = Object.assign({ doc: {} }, s); build(); persist(); dirty = true; ui.assinaturaAberta = null; setTimeout(() => { ui.assinaturaAberta = assinatura(); }, 150); }, persist: () => { persist(); dirty = true; }, get SPV() { return SPV; } });
  const TB = window.PricerTributos({ REG, esc, brl, pct, NF, toast, parseInput, ui, render });
  // pendências de cadastro (pedidos de preço) e do fiscal (NCM por família, alíquotas a definir)
  function pendExtra() {
    const S = [];
    // pendências do acompanhamento atribuídas a mim (no app compartilhado; neste navegador não há usuário)
    if (REG.mode === 'shared' && REG.me) S.push({ k: 'acomp', titulo: 'Pendências atribuídas a você', papel: 'Acompanhamento', itens: PN.todas().filter((p) => PN.aberta(p) && p.respId === REG.me).map((p) => ({ titulo: (p.id) + ' · ' + p.titulo, sub: [p.propNome, p.departamento, p.prazo ? 'prazo ' + new Date(p.prazo + 'T12:00').toLocaleDateString('pt-BR') + (PN.vencida(p) ? ' (vencida)' : '') : ''].filter(Boolean).join(' · '), desde: p.criadaEm, btn: ['Abrir', `data-pnabre="${esc(p.id)}"`] })) });
    if (REG.areaOk('custos')) S.push({ k: 'pedidos', titulo: 'Pedidos de cadastro', papel: 'Custos', itens: PD.abertos().map((x) => ({ titulo: x.produto || x.desc || 'Pedido de cadastro', sub: [famNome(x.fam), x.propNome].filter(Boolean).join(' · '), desde: x.at, btn: ['Atender', 'data-pendgo="cadastro|pedidos"'] })) });
    if (REG.areaOk('fiscal')) {
      const map = Object.assign({}, REG.FISCAL_FAM_PADRAO, ((REG.tabelas || {}).FISCAL_FAM || {}).map || {});
      const semNcm = listFor('ITEM 01', 'C21').filter((f) => f && f !== 'FABRICANTES' && !(map[f] || {}).ncm).map((f) => ({ titulo: 'Família sem NCM: ' + (FAM_SEQ_LB[f] || f), sub: 'o item fica sem NCM e sem IPI', desde: '', btn: ['Cadastrar NCM', 'data-pendgo="cadastro|fiscal"'] }));
      const falta = TB.cenarios().filter((c) => c.status !== 'confirmado').map((c) => ({ c, f: (c.tributos || []).filter((t) => !t.fonte && t.modo !== 'nao' && (t.aliq === null || t.aliq === undefined)).map((t) => t.sigla) })).filter((x) => x.f.length)
        .map(({ c, f }) => ({ titulo: 'Cenário tributário: ' + c.nome, sub: 'alíquota a definir: ' + f.join(', '), desde: '', btn: ['Completar', `data-pendgo="cadastro|cenarios" data-cenpend="${esc(c.id)}"`] }));
      S.push({ k: 'fiscal', titulo: 'Cadastro fiscal', papel: 'Fiscal', itens: semNcm.concat(falta) });
    }
    return S;
  }
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-pendgo]'); if (!g) return; const [v, c] = g.dataset.pendgo.split('|'); if (g.dataset.cenpend) ui.cenSel = g.dataset.cenpend; ui.view = v; if (c) ui.cad = c; store.set(SK.view, ui); render(); window.scrollTo(0, 0); });
  const MG = window.PricerMargens({ acompanhamento: () => PN.vLista(), aoEnviar: (p) => { congelarMarco(p.id, 'enviada'); if (state.id === p.id && p.precos && !state.precosFix) { state.precosFix = JSON.parse(JSON.stringify(p.precos)); build(); persist(); } }, aoAprovar: (id) => congelarMarco(id, 'aprovada'), bloqueioEnvio: (p) => { const c = custosCfg(); if (!c.bloquearEnvio || p.div === 'SPV' || p.facts) return 0; if (state.id === p.id && !isSpv() && !isFacts()) return resumoConf().imped; return p.checagem ? p.checagem.imped || 0 : 0; }, pendExtra: () => pendExtra(), abrirProposta: (p, step) => { openProposta(p, false); ui.step = step || 1; render(); window.scrollTo(0, 0); }, REG, esc, brl, pct, NF, modal, toast, parseInput, ui, render, log: logEv, snapshotOf: (p) => snapshotOf(p), resumoOf: (x) => resumoOf(x), get SPV() { return SPV; } });
  // nova proposta SEQ; com a família, já abre o item 01 nela
  function newSeq(fam) { loadDoc({}, ''); ui.propFull = false; ui.reqShow = false; state.cnpjInfo = '';
    // começa pelo cabeçalho; revisão 0 e data de hoje já preenchidas
    state.cabReq = true; const P = 'PROPOSTA'; const hoje = new Date(); commit(P, 'C6', 0); commit(P, 'C7', hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0'));
    commit(P, 'J7', 'SEQ');
    if (fam) { commit('ITEM 01', 'C21', fam); ui.famPend = fam; ui.simple = true; } else ui.famPend = null;
    ui.step = 1; setView('proposta'); toast(fam ? 'Proposta SEQ nova · ' + (FAM_SEQ_LB[fam] || fam) + ' — comece pelo cabeçalho' : 'Proposta SEQ em branco'); }
  const FAM_CURTO = { 'CONJUNTO MOTOBOMBA': 'CMB · Conjunto motobomba', SKID: 'SKD · Skid', CONTAINER: 'CON · Container', ESPECIAL: 'ESP · Especial', 'BOMBA JOCKEY + PAINEL': 'CMB · Jockey + painel' };
  const famsHome = () => famsEquip().filter((f) => f[2] !== 'FABRICANTES').map(([k, lb, fam]) => ({ fam, lb: FAM_CURTO[fam] || FAM_SEQ_LB[fam] || lb, titulo: FAM_SEQ_LB[fam] || lb }));
  const PNL = window.PricerPainel({ REG, esc, brl, pct, ui, render, MG: () => MG, PN: () => PN });
  // os botões de tipo da tela Início trocam a proposta aberta: pergunta antes de perder alterações não salvas
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-spvnew],[data-seqnew],[data-seqfam],[data-factsnew]'); if (!b || !dirty || assinatura() === ui.assinaturaAberta) return;
    if (b.dataset.dlgok) { delete b.dataset.dlgok; return; }
    // segura o clique, pergunta e, se a pessoa confirmar, refaz o clique
    e.preventDefault(); e.stopImmediatePropagation();
    if (await DLG.confirmar('A proposta aberta tem alterações não salvas. Começar uma nova mesmo assim? (as alterações se perdem)')) { b.dataset.dlgok = '1'; b.click(); }
  }, true);
  const SPV = window.PricerSPV({ revisar: () => revisarModal(), clientes: () => clientesConhecidos(), vendedores: () => equipeCom().filter((x) => x.papel !== 'an').map((x) => x.nome), pagamentos: () => listFor('PROPOSTA', 'J6') || [], painel: () => PNL.vPainel(), revAtual: () => revAtual(), pendencias: () => MG.resumoPendencias(), confCard: () => (() => { try { return docPropostaCampos(propostaDados()); } catch (e) { return ''; } })() + propComCard() + confCard() + PN.cardProposta(state.id, docTitle()), revSelo: () => revSelo(), tribCard: (snap, c) => TB.cardProposta(snap, c), famsHome: () => famsHome(), etapasHtml: (p) => MG.etapasHtml(p), etapaPendente: (p, k) => MG.etapaPendente(p, k), proximo: (p) => MG.proximo(p), situacao: (p) => MG.situacao(p), podeReabrir: () => MG.podeReabrir(), aprovHtml: () => aprovLinha({ aprov: aprovInfo() }), REG, esc, brl, pct, fmtNum, NF, modal, toast, parseInput, txt, val, docTitle, newSeq, openProposta, ui, render, fechar: (p) => MG.fecharModal(p), log: (e) => REG.log(e), home: () => PD.cardHome(), insumos: () => REG.insumos,
    getState: () => state, setState: (s) => { state = Object.assign({ doc: {} }, s); build(); persist(); dirty = true; ui.assinaturaAberta = null; setTimeout(() => { ui.assinaturaAberta = assinatura(); }, 150); },
    persist: () => { persist(); dirty = true; },
    current: () => { if (isSpv()) return { div: 'SPV', label: docTitle(), total: SPV.total() }; if (isFacts()) return { div: 'SEQ', label: docTitle(), total: FX.total() }; const n = txt('PROPOSTA', 'C5'), c = txt('PROPOSTA', 'F5'); return n || c ? { div: 'SEQ', label: docTitle(), total: val('PROPOSTA', 'P43') } : null; } });

  $('#bMode').onclick = () => { ui.simple = !ui.simple; ui.propFull = false; ui.itemFull = false; store.set(SK.view, ui); render(); window.scrollTo(0, 0); };
  $('#bNew').onclick = () => modal(`<h2>Nova proposta</h2><p class="sub">A proposta atual continua salva se você já clicou em Salvar. Alterações não salvas se perdem.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mBlank">SEQ em branco</button><button class="btn pri" id="mSpv">SPV (serviço, peças, contrato)</button><button class="btn" id="mExample">Exemplo SEQ (Cocamar)</button><button class="btn" data-close>Cancelar</button></div>`,
    (o, close) => { $('#mBlank', o).onclick = () => { close(); newSeq(); }; $('#mSpv', o).onclick = () => { close(); setView('inicio'); const t = document.querySelector('[data-spvnew]'); if (t) t.closest('.card, section, div').scrollIntoView({ block: 'center' }); toast('Escolha o tipo de SPV'); }; $('#mExample', o).onclick = () => { close(); loadDoc(MODEL.example, ''); setView('proposta'); toast('Exemplo carregado'); }; });

  // cancelar: na proposta nova (mesmo sem nada preenchido), desiste da criação e volta ao início; na salva, descarta as
  // alterações e reabre a última versão salva. Aparece no topo e ao lado da situação da proposta.
  function podeCancelar() { if (state.verRev || !viewDaProposta(ui.view)) return false; const salva = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null; return !salva || dirty; }
  $('#bCancel').onclick = () => cancelar();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-cancelar]')) cancelar(); });
  async function cancelar() {
    if (!podeCancelar()) return;
    const salva = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    if (!salva) { if (dirty && !await DLG.confirmar('Cancelar a criação desta proposta? O que foi preenchido e não foi salvo será descartado.')) return;
      loadDoc({}, ''); dirty = false; persist(); setView('inicio'); toast('Proposta nova descartada'); return; }
    if (!await DLG.confirmar('Descartar as alterações não salvas e voltar à última versão salva?')) return;
    openProposta(salva, false); dirty = false; persist(); render(); toast('Alterações descartadas: voltou à versão salva');
  }
  // salvar mostra o estado: girando enquanto grava, e volta ao normal no fim (sucesso ou erro)
  $('#bSave').onclick = async (ev) => { const sb = $('#bSave'); if (sb.classList.contains('busy')) return; sb.classList.add('busy'); sb.dataset.ico = 'loader-circle'; decorar(sb.parentElement);
    try { return await salvar0(ev); } finally { sb.classList.remove('busy'); sb.dataset.ico = 'save'; decorar(sb.parentElement); } };
  const salvar0 = async (ev) => {
    if (state.verRev) { toast('Você está consultando a revisão ' + state.verRev.rev + '. Volte à atual ou restaure esta como nova revisão.'); return; }
    // proposta já enviada ao cliente: alterar cria revisão nova (a enviada fica guardada), salvo se for só correção
    const salva = (REG.listPropostas() || []).find((x) => x.id === state.id);
    if (ev && salva && dirty && ['enviada', 'negociacao'].includes(salva.status)) { revSalvarEnviada(salva); return; }
    // número já usado em outra proposta salva: avisa; com o bloqueio ligado na série, não grava
    { const nu = isSpv() ? state.spv.numero : isFacts() ? state.facts.numero : txt('PROPOSTA', 'C5'); const sk = isSpv() ? 'spv' : 'seq';
      if (REG.numeroDuplicado && REG.numeroDuplicado(nu, state.id)) { if (REG.serieCfg(sk).bloqueio) { toast('O número ' + nu + ' já está em outra proposta salva. Troque o número (ou use "gerar nº") antes de salvar.'); return; } toast('Atenção: o número ' + nu + ' já está em outra proposta salva.'); } }
    const id = state.id || ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)); const novaRev = !!state._novaRev;
    const p = { name: docTitle(), at: new Date().toISOString(), uid: state.uid };
    if (isSpv()) Object.assign(p, { div: 'SPV', tipo: state.spv.tipo, numero: state.spv.numero, cliente: state.spv.cliente, total: SPV.total(), spv: state.spv });
    else if (isFacts()) Object.assign(p, { div: 'SEQ', tipo: 'FAC', sol: 'FACTS', numero: state.facts.numero, cliente: state.facts.cliente, total: FX.total(), facts: state.facts });
    else Object.assign(p, { div: 'SEQ', numero: txt('PROPOSTA', 'C5'), cliente: txt('PROPOSTA', 'F5'), total: val('PROPOSTA', 'P43'), doc: state.doc || {} });
    if (typeof p.total !== 'number') delete p.total;
    if (state.ack && Object.keys(state.ack).length) p.ack = state.ack;
    if (state.cenSim && state.cenSim.length) p.cenSim = state.cenSim;
    if (!isSpv() && !isFacts()) { try { p.checagem = Object.assign(resumoConf(), { at: new Date().toISOString() }); } catch (e) { /* segue */ } }
    if (state.naCustos && Object.keys(state.naCustos).length) p.naCustos = state.naCustos;
    if (!isSpv() && !isFacts()) { try { p.precos = precosUsados(); } catch (e) { /* segue sem a fotografia de preços */ } }
    if (state.origemItens && Object.keys(state.origemItens).length) p.origemItens = state.origemItens;
    if (state.propCom && Object.keys(state.propCom).length) p.propCom = state.propCom;
    try { p.resumo = resumoOf(isSpv() ? SPV.snapshot(state.spv) : isFacts() ? FX.snapshot(state.facts) : seqSnapshot()); } catch (e) { /* segue sem resumo */ }
    // status, etapas, conferência e motivo de perda são da tela inicial: vêm do registro atual do banco
    const ajustar = (body, cur) => {
      for (const k of ['etapas', 'motivoPerda', 'conferencia', 'criadaEm', 'criadaPor', 'excluida']) if (cur && cur[k] !== undefined) body[k] = JSON.parse(JSON.stringify(cur[k]));
      let status = cur ? (cur.status || 'rascunho') : (state.status || 'rascunho');
      if (novaRev && status !== 'ganha') { status = 'rascunho'; if (body.etapas) delete body.etapas.cliente; }
      body.status = status; if (!cur) { body.criadaEm = body.at; body.criadaPor = REG.me || null; }
    };
    const base = state.id && state.verBase !== undefined ? state.verBase : undefined;
    try {
      const novo = !state.id; const where = await REG.saveProposta(id, p, { editor: true, base, ajustar });
      delete state._novaRev; state.id = id; state.verBase = (REG.ultimaVersao[id] || {}).verDoc; if (p.precos) { state.precosSalvos = p.precos; if (state.precosFix) state.precosFix = JSON.parse(JSON.stringify(p.precos)); } state.status = (REG.listPropostas() || []).find((x) => x.id === id)?.status || state.status;
      dirty = false; ui.salvoEm = new Date().toISOString(); ui.erroSalvar = null; persist(); atualizaSaveSt();
      if (!isSpv() && !isFacts()) { try { PN.sincronizar({ id, numero: p.numero, cliente: p.cliente }, conferenciaCentral()).catch(() => {}); } catch (e) { /* a conferência não impede salvar */ } }
      if (!(ev && ev.auto)) toast((where === 'shared' ? 'Salvo e confirmado no banco da equipe: ' : 'Salvo e confirmado neste navegador: ') + docTitle());
      logEv({ tipo: novo ? 'Proposta criada' : ev && ev.auto ? 'Proposta salva (automático)' : 'Proposta salva', ref: id, desc: docTitle() + ' · ' + (p.div || 'SEQ') + (p.tipo ? ' ' + p.tipo : ''), mudancas: [{ campo: 'Total', de: null, para: typeof p.total === 'number' ? p.total : null }, { campo: 'Margem', de: null, para: p.resumo ? p.resumo.margemPct : null }] });
    } catch (err) {
      if (err.code === 'conflito') { conflitoModal(err.remoto, id); return; }
      ui.erroSalvar = { at: new Date().toISOString(), msg: errMsg(err) }; atualizaSaveSt(); toast('Não salvou: ' + errMsg(err));
    }
  };
  // conflito: alguém salvou o conteúdo desta proposta enquanto você editava — nada é sobrescrito sem escolha
  function conflitoModal(remoto, id) {
    modal(`<h2>Outra pessoa salvou esta proposta</h2><p class="sub" style="margin:0"><b>${who(remoto.by)}</b> salvou às ${esc(fmtAt(remoto.at))}, enquanto você editava. As suas alterações continuam aqui; escolha o que fazer.</p>
      <div class="stack" style="gap:8px"><button class="btn pri" id="cfGuarda">Guardar a versão dela como revisão e salvar a minha</button><button class="btn" id="cfCopia">Salvar a minha como uma proposta nova (cópia)</button><button class="btn" id="cfAbre">Descartar as minhas e abrir a versão salva</button><button class="btn" data-close>Decidir depois (nada é salvo agora)</button></div>`, (o, close) => { fillNames(o);
      $('#cfGuarda', o).onclick = async () => { close(); try { await revGravar({ propId: id, rev: revDe(remoto), at: remoto.at, by: remoto.by || null, statusEra: remoto.status || 'rascunho', motivoProxima: 'versão salva por outra pessoa durante edição simultânea', total: remoto.total ?? null, margemPct: remoto.resumo ? remoto.resumo.margemPct : null, numero: remoto.numero || '', cliente: remoto.cliente || '', body: remoto }, '_c' + (remoto.ver || 0));
        state.verBase = remoto.verDoc || 0; logEv({ tipo: 'Proposta — conflito resolvido', ref: id, desc: docTitle() + ': versão de outra pessoa guardada nas revisões; a sua foi salva', mudancas: [] }); await $('#bSave').onclick(); } catch (e) { toast(errMsg(e)); } };
      $('#cfCopia', o).onclick = async () => { close(); state.id = null; state.uid = newUid(); delete state.verBase; await $('#bSave').onclick(); toast('Salva como proposta nova; a outra ficou como estava'); };
      $('#cfAbre', o).onclick = async () => { if (!await DLG.confirmar('Descartar as suas alterações?')) return; close(); openProposta(Object.assign({ id }, remoto), false); };
    });
  }
  // indicador de gravação no topo
  function atualizaSaveSt() {
    { const h = document.querySelector('header.top'); if (h) document.documentElement.style.setProperty('--hdr', h.offsetHeight + 'px'); }
    const el = $('#saveSt'); if (!el) return; const hm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let cls = 'ok', t = '';
    if (armazFalhou) { cls = 'bad'; t = 'Falha ao gravar: ' + armazFalhou.msg; }
    else if (ui.erroSalvar) { cls = 'bad'; t = 'Não salvou · ' + hm(ui.erroSalvar.at); }
    else if (state.verRev) { cls = 'mute'; t = 'Consultando revisão ' + state.verRev.rev; }
    else if (dirty) { cls = 'warn'; t = state.id ? '● Alterações não salvas' : '● Proposta ainda não salva'; }
    else if (state.id) t = '✓ Salvo' + (ui.salvoEm ? ' às ' + hm(ui.salvoEm) : '');
    el.className = 'savest ' + cls; el.textContent = t; el.hidden = !t || ['inicio', 'cadastro', 'pendencias', 'guia'].includes(ui.view) && !armazFalhou;
    { const bc = $('#bCancel'); if (bc) bc.hidden = !podeCancelar(); }
    el.title = cls === 'warn' ? 'Clique em Salvar para gravar. O rascunho fica guardado neste navegador.' : '';
  }
  // rascunho: o estado em edição já fica no navegador; marca se há alteração pendente para recuperar depois
  setInterval(() => {
    const sujo = !!dirty && !state.verRev;
    if (sujo !== !!state._sujo) { state._sujo = sujo; state._editEm = sujo ? new Date().toISOString() : null; store.set(SK.cur, state); }
    atualizaSaveSt();
  }, 1500);
  window.addEventListener('beforeunload', (e) => { if (dirty && !state.verRev) { e.preventDefault(); e.returnValue = ''; } });
  // salvamento automático controlado: só rascunho já salvo uma vez, sem conflito, parado há 1 minuto
  let ultimaEdicao = Date.now(); document.addEventListener('input', () => { ultimaEdicao = Date.now(); }, true); document.addEventListener('change', () => { ultimaEdicao = Date.now(); }, true);
  setInterval(async () => {
    if (!dirty || !state.id || state.verRev || ui.autoSalvar === false || Date.now() - ultimaEdicao < 60000 || document.querySelector('#overlay .modal')) return;
    const s = (REG.listPropostas() || []).find((x) => x.id === state.id); if (!s || (s.status || 'rascunho') !== 'rascunho') return;
    await $('#bSave').onclick({ auto: true });
  }, 20000);

  $('#bOpen').onclick = () => {
    const list = REG.listPropostas();
    const shared = REG.mode === 'shared';
    const rows = list.map((p) => `<div class="row"><div style="min-width:0"><span class="divb ${p.div === 'SPV' ? 'spv' : 'seq'}">${p.div || 'SEQ'}</span> <b>${esc(p.name)}</b><br><small>${fmtAt(p.at)} · ${typeof p.total === 'number' ? brl(p.total) : '—'}${shared && !p.local ? ' · ' + who(p.by) : ''}${p.local ? ' · <span class="pill mute">neste navegador</span>' : ''}</small></div><div style="display:flex;gap:6px"><button class="btn sm pri" data-open="${esc(p.id)}">Abrir</button>${REG.podeExcluir(p) ? `<button class="btn sm" data-del="${esc(p.id)}" title="Vai para a lixeira (Configurações → Backup e restauração); dá para restaurar">Excluir</button>` : ''}</div></div>`).join('')
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
        try { await REG.moverLixeira(p, ''); logEv({ tipo: 'Proposta excluída (lixeira)', ref: p.id, desc: p.name || '', mudancas: [] }); b.closest('.row').remove(); toast('Proposta na lixeira. Dá para restaurar em Configurações → Backup e restauração.'); if (state.id === p.id) { state.id = null; persist(); } } catch (err) { toast(errMsg(err)); }
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
