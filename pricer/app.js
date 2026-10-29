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
  // teclado: Esc fecha a janela aberta; Ctrl+S (⌘S) salva a proposta
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#overlay') && $('#overlay').firstElementChild && !e.defaultPrevented) { const c = $('#overlay [data-close]'); if (c) c.click(); else $('#overlay').innerHTML = ''; return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); setTimeout(() => $('#bSave').click(), 0); }
  });
  // tema: automático (segue o sistema), claro ou escuro; fica guardado neste navegador
  const TEMAS = [['auto', 'Tema: automático'], ['light', 'Tema: claro'], ['dark', 'Tema: escuro']];
  function aplicaTema(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; const b = $('#bTheme'); if (b) { b.textContent = (TEMAS.find((x) => x[0] === t) || TEMAS[0])[1]; b.setAttribute('aria-label', b.textContent + ' (clique para trocar)'); } }
  let tema = 'auto'; try { tema = localStorage.getItem('lspricer.tema') || 'auto'; } catch (e) { tema = 'auto'; }
  aplicaTema(tema);
  $('#bTheme').onclick = () => { const i = TEMAS.findIndex((x) => x[0] === tema); tema = TEMAS[(i + 1) % TEMAS.length][0]; try { localStorage.setItem('lspricer.tema', tema); } catch (e) { /* só nesta visita */ } aplicaTema(tema); };
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-restore]');
    if (r) { const [s, a] = r.dataset.restore.split('|'); commit(s, a, null, true); return; }
    const go = e.target.closest('[data-goitem]');
    if (go) { ui.item = +go.dataset.goitem; ui.itemFull = false; setView('item'); return; }
    const nv = e.target.closest('[data-view]');
    if (nv) { if (ui.simple && nv.dataset.view === 'item' && !nv.closest('#app')) { ui.step = cabOk() ? 2 : 1; if (!cabOk()) ui.reqShow = true; ui.propFull = false; setView('proposta'); return; } setView(nv.dataset.view); return; }
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-recsalva]')) { ui.recuperado = null; await $('#bSave').onclick(e); return; }
    if (e.target.closest('[data-recdesc]') || e.target.closest('[data-recnova]')) { const q = (REG.listPropostas() || []).find((x) => x.id === state.id); if (!q) return; if (e.target.closest('[data-recdesc]') && !window.confirm('Descartar as alterações não salvas?')) return; dirty = false; ui.recuperado = null; openProposta(q, false); }
  });

  // ---------- visões ----------
  function setView(v) { if ((v === 'item' || v === 'memorial') && !cabOk()) { ui.step = 1; ui.reqShow = true; v = 'proposta'; toast('Preencha o cabeçalho antes do equipamento'); } ui.view = v; store.set(SK.view, ui); render(); window.scrollTo(0, 0); }
  function render() {
    const spv = isSpv(); const fx = isFacts(); const outro = spv || fx;
    aplicaLogo();
    if (outro && (ui.view === 'item' || ui.view === 'memorial')) ui.view = 'proposta';
    for (const b of document.querySelectorAll('#nav button')) { b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'); if ('seqonly' in b.dataset) b.hidden = outro; }
    const nm = spv ? state.spv.numero : fx ? state.facts.numero : txt('PROPOSTA', 'C5'), cli = spv ? state.spv.cliente : fx ? state.facts.cliente : txt('PROPOSTA', 'F5');
    $('#docName').innerHTML = `<span class="divb ${spv ? 'spv' : 'seq'}">${spv ? 'SPV' : 'SEQ'}</span> ` + ((nm || cli) ? `<b>${esc(nm || 'Sem número')}</b> · ${esc(cli || 'sem cliente')}` : '<b>Proposta nova</b>');
    for (const id of ['bMode']) { const b = $('#' + id); if (b) b.hidden = outro || ['inicio', 'documentos', 'margens'].includes(ui.view); }
    const scroll = window.scrollY; const focusId = document.activeElement && document.activeElement.id;
    const full = !outro && ui.simple && ((ui.view === 'proposta' && ui.propFull) || (ui.view === 'item' && ui.itemFull));
    const views = spv ? { proposta: SPV.vSpv } : fx ? { proposta: FX.vFacts } : ui.simple ? { proposta: ui.propFull ? vProposta : vPropostaS, item: ui.itemFull ? vItem : vItemS } : { proposta: vProposta, item: vItem };
    const html = Object.assign({ inicio: SPV.vHome, pendencias: MG.vPendencias, documentos: SPV.vDocs, margens: MG.vMargens, memorial: vMemorial, cadastro: vCadastro, guia: vGuia }, views)[ui.view]();
    MG.ensure(); SPV.ensureDocs(); PD.ensure();
    { const nb = document.querySelector('#nav [data-view="cadastro"]'); const n = REG.areaOk('custos') ? PD.abertos().length : 0; if (nb) nb.innerHTML = 'Cadastro' + (n ? ` <span class="nbadge" title="${n} pedido(s) de cadastro em aberto">${n}</span>` : ''); }
    { const pb = document.querySelector('#nav [data-view="pendencias"]'); const n = MG.nPendencias(); if (pb) pb.innerHTML = 'Pendências' + (n ? ` <span class="nbadge" title="${n} pendência(s) esperando você">${n}</span>` : ''); }
    { const mb = document.querySelector('#nav [data-view="margens"]'); const n = MG.pendentesAprov(); if (mb) mb.innerHTML = 'Margens' + (n ? ` <span class="nbadge" title="${n} aprovação(ões) de desconto esperando você">${n}</span>` : ''); }
    const fe = state.id && ['proposta', 'item'].includes(ui.view) && MG.fechDe(state.id);
    const aviso = fe ? `<div class="banner ok" style="margin:0 0 12px">Proposta fechada em ${esc(new Date(fe.fechadoEm).toLocaleDateString('pt-BR'))}${fe.pedido ? ' · pedido ' + esc(fe.pedido) : ''}. ${MG.liberaReal(state.id) ? ' O custo real de compras e fabricação é lançado na tela do fechamento. <button class="btn sm pri" data-mgreal="' + esc(state.id) + '">Lançar custo real</button>' : ' A proposta não está como ganha: o custo real não é lançado.'}</div>` : '';
    const avRev = state.verRev && ['proposta', 'item', 'memorial'].includes(ui.view) ? `<div class="banner warn" style="margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>Consultando a revisão ${state.verRev.rev}</b> (guardada em ${esc(fmtAt(state.verRev.at))}). Só leitura: nada aqui é salvo.</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm pri" data-revatual>Voltar à revisão atual</button><button class="btn sm" data-revs>Revisões</button></span></div>` : '';
    const salvaB = state.id ? (REG.listPropostas() || []).find((x) => x.id === state.id) : null;
    const avInteg = !['proposta', 'item', 'memorial'].includes(ui.view) ? '' : (armazFalhou ? `<div class="banner bad" style="margin:0 0 12px"><b>O navegador não está gravando</b> (${esc(armazFalhou.msg)}). O que você fizer agora pode se perder ao fechar. Baixe um backup em Cadastro → Sistema → Backup e libere espaço.</div>` : '')
      + (ui.recuperado && dirty ? `<div class="banner warn" style="margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>Recuperamos alterações não salvas</b>${typeof ui.recuperado === 'string' ? ' (última edição ' + esc(fmtAt(ui.recuperado)) + ')' : ''}. Elas estão na tela; ainda não foram gravadas.</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm pri" data-recsalva>Salvar agora</button>${salvaB ? '<button class="btn sm" data-recdesc>Descartar e abrir a versão salva</button>' : ''}</span></div>` : '')
      + (salvaB && state.verBase !== undefined && (salvaB.verDoc || 0) > state.verBase && !state.verRev ? `<div class="banner warn" style="margin:0 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span><b>${REG.mode === 'shared' ? who(salvaB.by) : 'Outra janela deste navegador'} salvou uma versão mais nova</b> desta proposta às ${esc(fmtAt(salvaB.at))}.${dirty ? ' Ao salvar, o app pede para você escolher o que fazer, sem sobrescrever.' : ''}</span>${dirty ? '' : '<span style="margin-left:auto"><button class="btn sm pri" data-recnova>Abrir a versão nova</button></span>'}</div>` : '');
    $('#app').innerHTML = avInteg + avRev + aviso + (full ? '<div class="backbar"><button class="btn sm" data-simpleback>← Voltar à versão simples</button></div>' : '') + html;
    const bm = $('#bMode'); if (bm) bm.textContent = ui.simple ? 'Modo detalhado' : 'Modo simples';
    atualizaSaveSt();
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
  // o que as regras de configuração enxergam de um item: campos de escolha e as descrições de todos os componentes
  function itemRegras(S) {
    const campos = {}; for (const [a] of RG.CAMPOS) campos[a] = txt(S, a);
    const comps = []; for (let r = 34; r <= 112; r++) { if (r > 63 && r < 68) continue; const d = txt(S, 'D' + r); if (d) comps.push(d); }
    for (const x of hiddenLines(S)) if (x.desc) comps.push(x.desc);
    return { campos, comps };
  }
  const RG = window.PricerRegras({ REG, esc, toast: (m) => toast(m), modal: (h, b) => modal(h, b) });
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
    // regras de configuração da Engenharia (Cadastro → Engenharia → Regras)
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
  const alertList = (list, withItem) => list.length ? `<ul class="alerts">${list.map((x) => { const key = esc(JSON.stringify([x.S, x.msg]));
    const ap = x.aprov && x.aprov.estado; const okAp = ap === 'aprovada'; const pedeAp = x.aprov && !x.ack && (!ap || ap === 'reprovada' || ap === 'vencida');
    return `<li class="${x.ack || okAp ? 'ack' : x.lvl}">${withItem ? `<b>Item ${String(x.i + 1).padStart(2, '0')}</b>` : ''}<span>${esc(x.msg)}${aprovLinha(x)}${x.ack ? `<br><small class="sub">Seguindo assim: ${esc(x.ack.motivo)} · <span data-uid="${esc(x.ack.by || '')}">${x.ack.by ? '…' : ''}</span> ${esc(new Date(x.ack.at).toLocaleDateString('pt-BR'))}</small>` : ''}</span>
      <span class="alact">${pedeAp ? `<button class="btn sm${ap ? ' pri' : ''}" data-alaprov>${ap ? 'Pedir de novo' : 'Pedir aprovação'}</button>` : ''}${x.fix && !x.ack && !okAp ? `<button class="btn sm pri" data-alfix="${esc(JSON.stringify({ S: x.S, act: x.fix.act, data: x.fix.data }))}">${esc(x.fix.lb)}</button>` : ''}${x.ack ? `<button class="restore" data-alundo="${key}">desfazer</button>` : x.lvl !== 'info' && !x.aprov ? `<button class="btn sm" data-alack="${key}">Seguir assim</button>` : ''}${withItem ? `<button class="restore" data-goitem="${x.i}">abrir</button>` : ''}</span></li>`; }).join('')}</ul>` : '';
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
      ui.reqShow = false; if (ui.famPend && !filled(ITEMS[0])) { ui.item = 0; ui.itemFull = false; ui.famPend = null; setView('item'); return; }
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
      await revGravar({ propId, rev: revDe(cur), at: new Date().toISOString(), by: REG.me || null, statusEra: cur.status || 'rascunho', marco, motivoProxima: '', total: cur.total ?? null, margemPct: cur.resumo ? cur.resumo.margemPct : null, numero: cur.numero || '', cliente: cur.cliente || '', body: corpo }, '_' + marco);
    } catch (e) { toast('Não consegui congelar a versão ' + (marco === 'aprovada' ? 'aprovada' : 'enviada') + ': ' + errMsg(e)); }
  }
  function carregarCorpo(q, extra) {
    const ex = Object.assign({ uid: q.uid || newUid(), status: q.status || 'rascunho', ack: q.ack || {}, verBase: (((REG.listPropostas() || []).find((y) => y.id === state.id)) || {}).verDoc }, extra || {});
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
      if (dirty && !state.verRev && !window.confirm('Há alterações não salvas na revisão atual. Abrir a revisão ' + x.rev + ' mesmo assim? (as alterações se perdem)')) return;
      $('#overlay').innerHTML = ''; const pid = state.id; carregarCorpo(x.body, { verRev: { rev: x.rev, propId: pid, at: x.at } }); dirty = false; ui.step = 4; setView('proposta'); return; }
    const rs = e.target.closest('[data-revrest]'); if (rs) { const x = revCache.list.find((y) => y.id === rs.dataset.revrest); if (!x) return; $('#overlay').innerHTML = ''; await revRestaurar(x); return; }
    if (e.target.closest('[data-revatual]')) { $('#overlay').innerHTML = ''; const pid = (state.verRev || {}).propId || state.id; const q = (REG.listPropostas() || []).find((y) => y.id === pid); if (q) { openProposta(q, false); ui.step = 4; render(); } return; }
  });
  async function revRestaurar(x) {
    const pid = (state.verRev || {}).propId || state.id; const salva = (REG.listPropostas() || []).find((y) => y.id === pid); if (!salva) return;
    if (!window.confirm(`Restaurar a revisão ${x.rev}? A revisão ${revDe(salva)} atual fica guardada e a ${x.rev} volta como revisão ${revDe(salva) + 1}.`)) return;
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

  // selo "Rev. N" no topo da proposta
  const revSelo = () => (state.id ? `<div style="display:flex;gap:4px;align-items:center"><button class="pill ${state.verRev ? 'warn' : 'mute'} apselo" data-revs title="Ver as revisões desta proposta">${state.verRev ? 'Consultando rev. ' + state.verRev.rev : 'Rev. ' + revAtual()} ▾</button>${state.verRev ? '' : `<button class="btn sm" data-revisar title="Guarda a revisão ${revAtual()} e abre a ${revAtual() + 1} para editar">Revisar</button>`}</div>` : '');

  // ---------- jornada da proposta SEQ em 6 etapas ----------
  const ETAPAS_P = [[1, 'Identificação'], [2, 'Configuração'], [3, 'Custos'], [4, 'Formação'], [5, 'Conferência'], [6, 'Emissão']];
  // parâmetros de custos (Custos): validade das cotações e variação de preço que pede atenção
  const custosCfg = () => Object.assign({ validadeDias: 90, avisoDias: 15, variacaoPct: 0.15, bloquearEnvio: true, congelarRascunho: false }, ((REG.tabelas || {}).CUSTOS_CFG || {}).cfg || {});
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
        const dq = ins && (ins.dataCot || ins.upd); const upd = dq ? Date.parse(dq) : null; const idade = upd ? (hoje - upd) / 864e5 : null;
        const al = [];
        const principal = /MOTOR|BOMBA|JOCKEY/.test(String(l.grupo || '') + ' ' + String(l.fam || '')) && !/ACOPLAMENTO|CAPA/.test(String(l.fam || ''));
        if (l.desc && !(l.custo > 0)) al.push(principal ? ['imped', 'componente principal sem preço'] : ['aviso', 'item sem custo']);
        else if (l.desc && l.unit === 0 && l.qtd) al.push(['aviso', 'custo unitário zerado']);
        if (l.qtd === 0 && l.custo > 0) al.push(['aviso', 'quantidade zero com custo']);
        if (l.qtd && l.unit && Math.abs(l.unit * l.qtd - l.custo) > Math.max(1, l.custo * 0.01)) al.push(['aviso', 'quantidade × unitário não fecha com o total']);
        if (!manual && ins && idade !== null) { if (idade > C.validadeDias) al.push(['aviso', 'cotação vencida (' + Math.round(idade) + ' dias)']); else if (idade > C.validadeDias - C.avisoDias) al.push(['info', 'cotação vence em ' + Math.round(C.validadeDias - idade) + ' dias']); }
        if (!manual && ins && !ins.upd && !ins.dataCot) al.push(['info', 'preço da planilha original, sem data de cotação']);
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
      <p class="sub" style="margin:8px 0 0">Valores do cadastro em reais. "Não se aplica" registra que a ausência é intencional (fica no histórico) e tira a linha das pendências. A validade e a variação que pede atenção são ajustáveis em Cadastro → Custos.</p></section>`;
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-custofiltro]'); if (f) { ui.custoFiltro = f.dataset.custofiltro; render(); return; }
    const nm = e.target.closest('[data-namark]'); if (nm) { const key = nm.dataset.namark;
      modal(`<h2>Não se aplica</h2><p class="sub" style="margin:0">${esc(key)}</p><div class="f"><label for="naMot">Por quê? (fica no histórico)</label><input id="naMot" placeholder="ex.: cliente fornece; já incluso no kit; não faz parte deste escopo"></div><div style="display:flex;gap:8px"><button class="btn pri" id="naOk">Confirmar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        $('#naMot', o).focus(); $('#naOk', o).onclick = () => { const m = $('#naMot', o).value.trim(); if (!m) { toast('Escreva o motivo'); return; } state.naCustos = Object.assign({}, state.naCustos, { [key]: { motivo: m, by: REG.me || null, at: new Date().toISOString() } }); dirty = true; persist(); logEv({ tipo: 'Custo — não se aplica', ref: docTitle(), desc: key, mudancas: [{ campo: 'Justificativa', de: null, para: m }] }); close(); render(); }; }); return; }
    const nu = e.target.closest('[data-naundo]'); if (nu) { const n2 = Object.assign({}, state.naCustos); delete n2[nu.dataset.naundo]; state.naCustos = n2; dirty = true; persist(); render(); }
  });

  function vCustosCfg() {
    const C = custosCfg(); const ed = canEd();
    const f = (k, lb, suf, d) => `<div class="f"><label for="cc_${k}">${lb}</label><div class="mbc"><input id="cc_${k}" data-ccfg="${k}" value="${esc(k === 'variacaoPct' ? NF[0].format(C[k] * 100) : C[k])}" inputmode="decimal"${ed ? '' : ' disabled'}><span class="sub">${suf}</span></div><small class="sub">${d}</small></div>`;
    return `<section class="card"><h2>Validade das cotações e alertas de custo</h2><div class="fields">${f('validadeDias', 'Validade da cotação', 'dias', 'depois disso a linha aparece como cotação vencida')}${f('avisoDias', 'Avisar antes de vencer', 'dias', 'informa que a cotação está perto de vencer')}${f('variacaoPct', 'Variação de preço que pede atenção', '%', 'mudança do preço do insumo desde a última referência')}
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
  function vModelosItem() {
    ensureModelos(); if (!modelosItem.length) return `<p class="sub" style="margin:0">Dica: em cada item, "Salvar como modelo" guarda a configuração para usar em outras propostas.</p>`;
    const free = firstFree();
    return `<section class="card"><h2>Modelos de item <span class="sub">configurações salvas pela equipe</span></h2><div class="tw"><table class="t"><tbody>${modelosItem.map((x) => `<tr><td><b>${esc(x.nome)}</b><br><small class="sub">${esc(x.desc || '')}</small></td><td class="sub">${esc(FAM_SEQ_LB[x.fam] || x.fam || '')}<br>${who(x.by)} · ${esc(fmtAt(x.at))}</td><td style="text-align:right;white-space:nowrap">${free >= 0 ? `<button class="btn sm pri" data-moduse="${esc(x.id)}">Usar</button>` : ''} ${!x.by || x.by === REG.me || REG.isOwner || REG.mode === 'local' ? `<button class="restore" data-moddel="${esc(x.id)}">excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  document.addEventListener('click', async (e) => {
    const sv = e.target.closest('[data-modsave]'); if (sv) { const S = ITEMS[+sv.dataset.modsave]; const cells = JSON.parse(JSON.stringify((state.doc || {})[S] || {})); if (!Object.keys(cells).length) { toast('Configure o item antes'); return; }
      const nome = window.prompt('Nome do modelo', txt(S, 'C28').slice(0, 60)); if (!nome) return;
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      try { await gravarModelo(id, { nome, desc: txt(S, 'C28'), fam: txt(S, 'C21'), cells, at: new Date().toISOString(), by: REG.me || null }); logEv({ tipo: 'Modelo de item salvo', ref: id, desc: nome + ' · ' + txt(S, 'C28'), mudancas: [] }); toast('Modelo salvo'); render(); } catch (er) { toast(errMsg(er)); } return; }
    const us = e.target.closest('[data-moduse]'); if (us) { const x = modelosItem.find((y) => y.id === us.dataset.moduse); const j = firstFree(); if (!x || j < 0) return; const S = ITEMS[j];
      state.doc = state.doc || {}; state.doc[S] = JSON.parse(JSON.stringify(x.cells)); build(); persist(); dirty = true; listCache = new Map(); logEv({ tipo: 'Modelo de item usado', ref: docTitle(), desc: S + ' ← ' + x.nome, mudancas: [] }); ui.item = j; ui.itemFull = false; setView('item'); toast('Item criado a partir do modelo: confira e ajuste'); return; }
    const dl = e.target.closest('[data-moddel]'); if (dl) { if (!window.confirm('Excluir este modelo?')) return; try { await gravarModelo(dl.dataset.moddel, null); logEv({ tipo: 'Modelo de item excluído', ref: dl.dataset.moddel, desc: '', mudancas: [] }); render(); } catch (er) { toast(errMsg(er)); } }
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
    if (e.target.closest('[data-simsave]')) { const nome = window.prompt('Nome do cenário', 'Cenário ' + ((state.cenSim || []).length + 1)); if (!nome) return; state.cenSim = (state.cenSim || []).concat([{ nome, at: new Date().toISOString(), by: REG.me || null, sc: ui.sim, res: ui.simRes }]); dirty = true; persist(); logEv({ tipo: 'Simulação salva', ref: docTitle(), desc: nome + ': ' + brl(ui.simRes.total) + ' · margem ' + pct(ui.simRes.margemPct, 1), mudancas: [] }); render(); toast('Cenário salvo (não altera a proposta)'); return; }
    const ld = e.target.closest('[data-simload]'); if (ld) { const c = (state.cenSim || [])[+ld.dataset.simload]; if (c) { ui.sim = c.sc; const r = simular(c.sc); ui.simRes = resumoSim(r); ui.simDoc = r.docSim; render(); } return; }
    const dl = e.target.closest('[data-simdel]'); if (dl) { state.cenSim = (state.cenSim || []).filter((_, i) => i !== +dl.dataset.simdel); dirty = true; persist(); render(); return; }
    if (e.target.closest('[data-simaprov]')) { e.preventDefault(); $('#app [data-alaprov]') ? null : null; ui.simAlvoAprov = ui.simRes.total; await abrirAprovacaoComAlvo(ui.simRes.total); return; }
    if (e.target.closest('[data-simrev]')) {
      if (!state.id) { toast('Salve a proposta primeiro'); return; } if (!ui.simDoc) return;
      if (!window.confirm('Converter este cenário em revisão? A revisão atual fica guardada e os valores simulados viram a próxima revisão (proposta oficial).')) return;
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
      <p class="sub" style="margin:8px 0 0">${custosCfg().bloquearEnvio ? 'Pela política (Cadastro → Custos), "Enviar ao cliente" fica travado enquanto houver itens que impedem seguir.' : 'A política atual não trava o envio: os impeditivos ficam só como aviso.'}</p></section>`;
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-confgo]'); if (!g) return; let go; try { go = JSON.parse(g.dataset.confgo); } catch (er) { return; }
    if (go.save) { $('#bSave').onclick(); return; }
    if (typeof go.item === 'number') { ui.item = go.item; ui.itemFull = false; setView('item'); return; }
    ui.step = go.step || 1; setView('proposta'); if (go.sel) setTimeout(() => { const el = document.querySelector(go.sel); if (el) el.scrollIntoView({ block: 'center' }); }, 60);
  });

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
    const st = ([n, lb]) => { const [s, info] = estado[n]; const marca = s === 'ok' && step !== n ? '✓' : s === 'bad' ? '!' : n;
      return `<button class="step st-${s} ${step === n ? 'on' : ''} ${s === 'ok' && step !== n ? 'done' : ''}" data-step="${n}" aria-current="${step === n ? 'step' : 'false'}"><span class="sn">${marca}</span><span class="st"><b>${lb}</b><small>${esc(info || '')}</small></span></button>`; };
    const head = `<div class="flowhead"><div><h1>Proposta ${esc(txt(P, 'C5') || 'nova')}</h1><div class="sub">${esc(txt(P, 'F5') || 'Comece pela identificação')}</div></div>
      <div class="sumbar sticky"><div><span>Preço total</span><b>${brl(val(P, 'B16'))}</b></div><div><span>Custo</span><b>${brl(val(P, 'G16'))}</b></div><div><span>Margem</span><b class="${typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? 'bad-t' : ''}">${pct(margem)}</b></div><div><span>Itens</span><b>${items.length}</b></div><div>${countPills(alerts)}</div>${revSelo()}${apSelo()}</div></div>
      <nav class="steps six" aria-label="Etapas da proposta">${ETAPAS_P.map(st).join('')}</nav>`;
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
            ${rq('F5', 'Cliente (razão social)', 'span2')}${rq('F6', 'Obra / local', 'span2')}${rq('F7', 'UF de destino')}${rq('J5', 'Cadastro fiscal', 'span2')}${rq('F8', 'Segmento')}</div></section>
        <section class="card"><h2>Proposta</h2><div class="fields">${rq('C5', 'Nº da proposta')}${rq('C6', 'Revisão')}${rq('C7', 'Data')}${rq('C10', 'Validade')}${rq('J6', 'Condição de pagamento', 'span2')}${rq('F9', 'Norma')}</div></section>
        <section class="card"><h2>Vendedor e comissões</h2><div class="fields">
            <div class="f spanall req${falta.has('C8') ? ' miss' : ''}"><label>Vendedor</label>${chips(vs, 'C8', 'Nenhum vendedor cadastrado: cadastre em Cadastro → Precificação → Vendedores e agentes.')}</div>
            <div class="f spanall"><label>Comissões <span class="sub">taxa da divisão (Precificação)</span></label><div class="seg"><label class="${comV ? 'on' : ''}"><input type="checkbox" data-pcom="J7"${comV ? ' checked' : ''}>Vendedor</label><label class="${comA ? 'on' : ''}"><input type="checkbox" data-pcom="J8"${comA ? ' checked' : ''}>Agente de negócio (AN)</label></div></div>
            ${comA ? `<div class="f spanall req${falta.has('L8') ? ' miss' : ''}"><label>Agente de negócio</label>${chips(ans, 'L8', 'Nenhum AN cadastrado: cadastre em Cadastro → Precificação → Vendedores e agentes.')}</div>` : ''}</div></section>
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
      body = vCustos() + nav(2, 4);
    } else if (step === 4) {
      const rows = items.filter((x) => filled(x.s)).map((x) => { const S = x.s; return `<tr><td><button class="btn sm" data-goitem="${x.i}">${S.slice(5)}</button></td><td style="min-width:240px">${esc(txt(S, 'C28'))}</td><td class="n">${show(S, 'P17')}</td><td class="n">${brl(val(S, 'B15'))}</td><td class="n"><b>${brl(val(S, 'D15'))}</b></td><td class="n">${pct(val(S, 'J15'))}</td><td>${situPill(txt(S, 'P84'))} ${txt(S, 'P91') === 'MARGEM ABAIXO DO MÍNIMO' ? situPill('MARGEM ABAIXO DO MÍNIMO') : ''}</td></tr>`; }).join('');
      const sn = (() => { try { return seqSnapshot(); } catch (e) { return null; } })();
      body = `<div class="kpis">
          <div class="kpi lead"><span>Preço total (com IPI)</span><b>${brl(val(P, 'B16'))}</b></div>
          <div class="kpi"><span>Custo total</span><b>${brl(val(P, 'G16'))}</b><em>${sn && sn.custo ? 'markup ' + NF[2].format(sn.venda / sn.custo) + 'x' : ''}</em></div>
          <div class="kpi"><span>Margem líquida</span><b class="${typeof margem === 'number' && typeof mMin === 'number' && margem < mMin ? 'bad-t' : ''}">${pct(margem)}</b><em>mínimo ${pct(mMin)}</em></div>
          <div class="kpi"><span>Impostos · comissões</span><b>${sn ? brl(sn.impostos) : '—'}</b><em>${sn ? 'comissões ' + brl(sn.comissao) : ''}</em></div>
          <div class="kpi"><span>DIFAL do cliente (fora do preço)</span><b>${brl(val(P, 'E84'))}</b></div></div>
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
        <section class="card"><h2>Documentos da proposta</h2><div class="docbar"><button class="btn pri" data-doc="memorial">Memorial (PDF)</button><button class="btn" data-doc="fcipdf">FCI (PDF)</button><button class="btn" data-doc="fcixlsx">FCI (Excel)</button><button class="btn" data-propfull>Ver todas as colunas</button></div>
          ${docsP.length ? `<div class="tw" style="margin-top:8px"><table class="t"><tbody>${docsP.map((d) => `<tr><td>${esc(d.nome || '')}<br><small class="sub">${esc([d.tipo, d.numero, d.fornecedor, d.rev != null && !isNaN(d.rev) ? 'rev. ' + d.rev : '', d.item, d.etapa].filter(Boolean).join(' · '))}</small></td><td class="sub">${esc(fmtAt(d.at))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:8px 0 0">Nenhum documento ligado ainda (o PDF conferido entra aqui).</p>'}</section>
        <section class="card"><h2>Revisões</h2><div class="docbar">${state.id ? '<button class="btn" data-revs>Ver e comparar revisões</button><button class="btn" data-revisar>Revisar (nova revisão)</button>' : '<span class="sub">Salve a proposta para ter revisões.</span>'}</div></section>
        ${nav(5, 0)}`;
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
          <div class="fields">${fs('J21', 'Marca')}${fs('G7', 'NCM (do cadastro Fiscal)')}${fs('H21', 'Unidade (do cadastro Fiscal)')}${fs('C4', 'Descrição do item na proposta', { cls: 'span2' })}</div>
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
    if (sp) { if (+sp.dataset.step > 1 && !cabOk()) { ui.step = 1; ui.reqShow = true; setView('proposta'); toast('Preencha o cabeçalho antes de seguir'); return; } ui.step = +sp.dataset.step; ui.propFull = false; setView('proposta'); return; }
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
    let d = i.dataCot ? new Date(i.dataCot + 'T12:00') : i.upd ? new Date(i.upd) : null;
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
    ['visao', 'Visão geral', 'Mapa do cadastro (produtos, equipamentos, estruturas, padronização e parâmetros) e qualidade dos dados mestres', [['mapa', 'Mapa do cadastro'], ['qualidade', 'Qualidade dos dados']]],
    ['custos', 'Custos', 'Preço de compra de insumos e kits, importação e câmbio', [['insumos', 'Insumos e preços'], ['importar', 'Importar preços'], ['motor', 'Kits de motor diesel'], ['bomba', 'Kits de bomba'], ['valvulas', 'Válvulas de alívio'], ['cambio', 'Câmbio e importação'], ['facts', 'FACTS (MECON)'], ['custoscfg', 'Validade e alertas'], ['pedidos', 'Pedidos de cadastro'], ['fornecedores', 'Fornecedores e fabricantes']]],
    ['engenharia', 'Engenharia', 'O que entra em cada equipamento e como ele é codificado', [['estruturas', 'Estruturas'], ['mobase', 'Mão de obra e bases'], ['familias', 'Famílias'], ['codificacao', 'Codificação'], ['regras', 'Regras de configuração'], ['testador', 'Testador de estruturas']]],
    ['fiscal', 'Fiscal', 'Impostos, NCM, ICMS por estado, FCI e os cenários da reforma tributária', [['fiscal', 'Impostos e NCM'], ['cenarios', 'Cenários tributários (reforma)']]],
    ['precificacao', 'Precificação', 'Margens, fatores, descontos, comissões e condições de pagamento', [['preco', 'Margens e política']]],
    ['servicos', 'Serviços', 'Técnicos, diárias, deslocamento e modelos de serviço e contrato', [['servicos', 'Equipe, custos e modelos']]],
    ['geral', 'Cadastro geral', 'Dados da empresa, unidades, famílias por divisão e o padrão de descrição dos insumos', [['geral', 'Empresa e famílias'], ['padrao', 'Padronização de descrições'], ['campos', 'Campos por família'], ['sinonimos', 'Sinônimos e abreviações']]],
    ['sistema', 'Sistema', 'Histórico, responsáveis por área e planilha', [['historico', 'Histórico'], ['acessos', 'Responsáveis, e-mails e logo'], ['backup', 'Backup e restauração'], ['tabelas', 'Planilha (avançado)']]],
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
    const body = { insumos: vInsumos, familias: vFamilias, codificacao: () => vParamTab('codificacao'), fiscal: () => vParamTab('fiscal'), preco: () => vParamTab('preco'), servicos: () => vParamTab('servicos'), geral: () => vParamTab('geral'), cambio: () => SPV.cfgSec('custos', canEd()), valvulas: () => tableCard('valv'), acessos: vAcessos, backup: vBackup, custoscfg: vCustosCfg, regras: () => RG.vCfg(canEd()), mapa: vMapa, qualidade: vQualidade, fornecedores: vFornecedores, campos: vCampos, sinonimos: vSinonimos, testador: vTestador, padrao: vPadrao, mobase: vMoBase, cenarios: () => TB.vCenarios(canEd()), facts: () => FX.vCfg(canEd()), pedidos: () => PD.vLista(), estruturas: vEstruturas, motor: () => vKits('motor'), bomba: () => vKits('bomba'), importar: vImportar, historico: vHistorico, tabelas: vTabelas }[tab]();
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
  function vInsumos() {
    const fam = ui.insFam || ''; const fab = ui.insFab || ''; const sit = ui.insSit || ''; const sem = !!ui.insSem; const soFav = !!ui.insFav; const ord = ui.insOrd || 'codigo';
    const all = H.sortIns(REG.insumos); const cfg = famCfg(); const F = favs(); const C = custosCfg();
    const semPreco = all.filter((x) => typeof x.valor !== 'number');
    const grupos = FAMS_F.termos(ui.insQ || '', sinonimos());
    const pend = (x) => { const L = []; if (typeof x.valor !== 'number') L.push(['sem preço', 'warn']); const m = FAMS_F.checar(x.fam, x.produto, cfg); if (m && !x.excecao) L.push(['fora do padrão', 'warn']);
      const dq = x.dataCot || x.upd; if (dq && (Date.now() - Date.parse(dq)) / 864e5 > C.validadeDias) L.push(['cotação vencida', 'warn']); return L; };
    let list = all.filter((x) => (!fam || x.fam === fam) && (!fab || (x.fab || '') === fab) && (!sem || typeof x.valor !== 'number') && (!soFav || F.has(x.id))
      && (!sit || (sit === 'pend' ? pend(x).length || situ(x) !== 'ativo' : situ(x) === sit))
      && (!grupos.length || FAMS_F.casa([x.id, x.produto, x.fab, x.tipo, x.obs, x.fam, x.codFab, x.descCom, x.descFab, Object.values(x.caract || {}).join(' ')].join(' '), grupos)));
    const cmp = { codigo: () => 0, produto: (a, b) => a.produto.localeCompare(b.produto), valor: (a, b) => (b.valor ?? -1) - (a.valor ?? -1), upd: (a, b) => String(b.dataCot || b.upd || '').localeCompare(String(a.dataCot || a.upd || '')) }[ord] || (() => 0);
    list = list.slice().sort((a, b) => (F.has(b.id) - F.has(a.id)) || cmp(a, b));
    const shown = list.slice(0, 400); const ed = canEd();
    const last = all.reduce((m, x) => (x.upd && x.upd > (m.upd || '') ? x : m), {});
    const th = (k, lb) => `<th><button class="thsort${ord === k ? ' on' : ''}" data-insord="${k}">${lb}${ord === k ? ' ▾' : ''}</button></th>`;
    const rows = shown.map((x) => `<tr class="click" data-ins="${esc(x.id)}">${ed ? `<td class="in"><input type="checkbox" data-inssel="${esc(x.id)}"${selIns.has(x.id) ? ' checked' : ''} aria-label="Selecionar ${esc(x.id)}"></td>` : ''}<td><button class="star${F.has(x.id) ? ' on' : ''}" data-insfav="${esc(x.id)}" aria-label="${F.has(x.id) ? 'Tirar dos favoritos' : 'Favoritar'}">${F.has(x.id) ? '★' : '☆'}</button></td><td class="code">${esc(x.id)}</td><td>${esc(x.fam)}</td>
      <td style="min-width:280px">${esc(x.produto)} ${situPillIns(x)} ${pend(x).filter((p) => p[0] !== 'sem preço').map(([t, c]) => `<span class="pill ${c}">${t}</span>`).join(' ')}</td><td>${esc(x.fab || '')}</td><td>${esc(x.tipo || '')}</td>
      <td class="n">${typeof x.valor === 'number' ? brl(x.valor) : '<span class="pill warn">sem preço</span>'}</td><td>${esc(x.origem || '')}</td><td class="sub">${x.dataCot ? esc(new Date(x.dataCot + 'T12:00').toLocaleDateString('pt-BR')) : x.upd ? esc(new Date(x.upd).toLocaleDateString('pt-BR')) : '—'}</td></tr>`).join('');
    const fams = famList(); const fabs = [...new Set(all.map((x) => x.fab).filter(Boolean))].sort();
    for (const id of [...selIns]) if (!REG.insumos.some((x) => x.id === id)) selIns.delete(id);
    return `<div class="kpis">
        <div class="kpi"><span>Insumos</span><b>${NF[0].format(all.length)}</b><em>limite da planilha: ${H.LIMITS.insumos}</em></div>
        <div class="kpi"><span>Famílias</span><b>${fams.length}</b></div>
        <div class="kpi"><span>Sem preço</span><b class="${semPreco.length ? 'bad-t' : ''}">${semPreco.length}</b><em>puxam custo zero na proposta</em></div>
        <div class="kpi"><span>Última alteração</span><b style="font-size:18px">${last.upd ? fmtAt(last.upd) : '—'}</b><em>${last.upd ? esc(last.produto || '') : 'valores da planilha REV21'}</em></div>
      </div>
      <section class="card">
        <div class="sheetbar">
          <input id="insQ" type="search" placeholder="Buscar código, fabricante, modelo, característica… (aceita sinônimos)" value="${esc(ui.insQ || '')}" aria-label="Buscar insumo" style="flex:1 1 260px">
          <select id="insFam" aria-label="Família"><option value="">Todas as famílias</option>${fams.map((f) => `<option${f === fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <select id="insFab" aria-label="Fabricante"><option value="">Todos os fabricantes</option>${fabs.map((f) => `<option${f === fab ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <select id="insSit" aria-label="Situação"><option value="">Toda situação</option><option value="pend"${sit === 'pend' ? ' selected' : ''}>Com pendência</option>${SITUACOES.map(([k, lb]) => `<option value="${k}"${sit === k ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" id="insSem"${sem ? ' checked' : ''}> Só sem preço</label>
          <label class="chk"><input type="checkbox" id="insFavF"${soFav ? ' checked' : ''}> ★ Favoritos</label>
          <span style="flex:1"></span>
          <button class="btn sm" id="insCsv">Exportar CSV</button>
          ${ed ? `<button class="btn sm" id="insLote"${selIns.size ? '' : ' disabled'}>Edição em massa (${selIns.size})</button><button class="btn sm pri" id="insNew">+ Novo insumo</button>` : ''}
        </div>
        <p class="sub" style="margin:8px 0">${list.length === all.length ? all.length + ' insumos' : list.length + ' de ' + all.length + ' insumos'}${list.length > shown.length ? ' — mostrando os primeiros ' + shown.length + '; refine a busca' : ''}. Clique numa linha para ver ou editar.${ed ? ' Marque as caixas para a edição em massa.' : ''}</p>
        <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr>${ed ? `<th><input type="checkbox" id="insSelAll" aria-label="Marcar os visíveis"></th>` : ''}<th></th>${th('codigo', 'Código')}<th>Família</th>${th('produto', 'Produto')}<th>Fabricante</th><th>Tipo/config.</th>${th('valor', 'Valor')}<th>Origem</th>${th('upd', 'Cotação')}</tr></thead><tbody>${rows || `<tr><td colspan="${ed ? 10 : 9}" class="sub">Nenhum insumo com esse filtro.</td></tr>`}</tbody></table></div>
      </section>`;
  }
  // edição em massa: escolhe o campo, vê a prévia e o impacto, confirma; fica no histórico e pode ser desfeita
  function loteModal() {
    const ids = [...selIns].filter((id) => REG.insumos.some((x) => x.id === id)); if (!ids.length) return;
    const recs = ids.map((id) => REG.insumos.find((x) => x.id === id)); const U = usoIndex();
    const CAMPOS = [['situacao', 'Situação'], ['fab', 'Fabricante'], ['tipo', 'Tipo/config.'], ['origem', 'Origem (NAC/IMP)'], ['reajuste', 'Reajuste de preço (%)'], ['dataCot', 'Data da cotação'], ['fonte', 'Origem do preço']];
    modal(`<h2>Edição em massa · ${ids.length} insumo(s)</h2>
      <div class="fields"><div class="f"><label for="ltCampo">Campo</label><select id="ltCampo">${CAMPOS.map(([k, lb]) => `<option value="${k}">${esc(lb)}</option>`).join('')}</select></div><div class="f span2" id="ltValWrap"></div></div>
      <div id="ltPrev"></div><p class="sub" style="margin:0">O nome (descrição técnica) não se edita em massa: ele é a chave das fórmulas. Cada alteração fica no histórico e o lote inteiro pode ser desfeito em Sistema → Histórico.</p>
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
        try { const r = await REG.saveInsumosLote(ch.map((c) => ({ id: c.id, campos: c.campos, de: c.de })), CAMPOS.find((x) => x[0] === g('#ltCampo').value)[1] + ' em ' + ch.length + ' insumo(s)', 'Edição em massa'); selIns.clear(); close(); render(); toast(r.n + ' insumo(s) alterado(s). Para desfazer: Sistema → Histórico.'); }
        catch (er) { b.disabled = false; toast(errMsg(er)); } };
    });
  }
  document.addEventListener('click', (e) => {
    const fv = e.target.closest('[data-insfav]'); if (fv) { e.stopPropagation(); favToggle(fv.dataset.insfav); render(); return; }
    const so = e.target.closest('[data-insord]'); if (so) { ui.insOrd = so.dataset.insord; render(); return; }
    if (e.target.closest('#insLote')) { loteModal(); return; }
    const dz = e.target.closest('[data-desfaz]'); if (dz) { const h = REG.historico.find((x) => x.at === dz.dataset.desfaz && String(x.ref) === dz.dataset.ref); if (!h) return;
      if (!dz.dataset.sure) { dz.dataset.sure = 1; dz.textContent = 'confirmar: desfazer este lote'; return; }
      REG.desfazerLote(h).then((r) => toast(r.n + ' insumo(s) voltaram' + (r.conflito.length ? '; ' + r.conflito.length + ' já tinham mudado de novo e ficaram como estão' : ''))).catch((er) => toast(errMsg(er))); }
  }, true);
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-inssel]'); if (s) { if (s.checked) selIns.add(s.dataset.inssel); else selIns.delete(s.dataset.inssel); const b = $('#insLote'); if (b) { b.disabled = !selIns.size; b.textContent = 'Edição em massa (' + selIns.size + ')'; } return; }
    if (e.target.id === 'insSelAll') { document.querySelectorAll('[data-inssel]').forEach((c) => { c.checked = e.target.checked; if (c.checked) selIns.add(c.dataset.inssel); else selIns.delete(c.dataset.inssel); }); const b = $('#insLote'); if (b) { b.disabled = !selIns.size; b.textContent = 'Edição em massa (' + selIns.size + ')'; } return; }
    if (e.target.id === 'insFab') { ui.insFab = e.target.value; render(); } else if (e.target.id === 'insSit') { ui.insSit = e.target.value; render(); } else if (e.target.id === 'insFavF') { ui.insFav = e.target.checked; render(); }
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
      if (hit && (typeof m.para === 'number' || typeof m.de === 'number')) out.push({ at: h.at, by: h.by, de: m.de, para: m.para, fonte: h.tipo === 'Insumo' ? (ins.fonte || 'ficha do insumo') : h.desc || h.tipo });
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
    const histHtml = hist.length ? `<div class="hist">${hist.map((h) => `<div><small>${fmtAt(h.at)} · ${who(h.by)}</small>${(h.mudancas || []).map((m) => `<div class="chg"><b>${esc(m.campo)}</b> ${esc(fmtVal(typeof m.de === 'object' && m.de ? JSON.stringify(m.de) : m.de))} → ${esc(fmtVal(typeof m.para === 'object' && m.para ? JSON.stringify(m.para) : m.para))}</div>`).join('')}</div>`).join('')}</div>` : '<p class="sub">Sem alterações registradas.</p>';
    const hp = isNew ? [] : historicoPreco(rec); const C = custosCfg();
    const hpHtml = hp.length ? `<div class="tw"><table class="t"><thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Variação</th><th>Origem</th></tr></thead><tbody>${hp.slice(0, 15).map((x) => { const v = typeof x.de === 'number' && x.de && typeof x.para === 'number' ? (x.para - x.de) / x.de : null; return `<tr><td>${esc(fmtAt(x.at))}<br><small class="sub">${who(x.by)}</small></td><td class="n">${typeof x.de === 'number' ? brl(x.de) : '—'}</td><td class="n">${typeof x.para === 'number' ? brl(x.para) : '—'}</td><td class="n ${v !== null && Math.abs(v) >= C.variacaoPct ? 'bad-t' : ''}">${v === null ? '—' : (v > 0 ? '+' : '') + pct(v, 1)}</td><td><small>${esc(x.fonte || '')}</small></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Sem alteração de preço registrada (o valor é o da planilha ou da última gravação).</p>';
    const insOpts = REG.insumos.filter((i) => i.id !== rec.id).map((i) => `<option value="${esc(i.id + ' · ' + i.produto)}">`).join('');
    modal(`<h2>${isNew ? 'Novo insumo' : 'Insumo ' + esc(rec.id)} ${isNew ? '' : situPillIns(rec)}</h2>
      <form id="insForm" autocomplete="off" class="stack" style="gap:10px">
      <div class="fields">
        <div class="f span2"><label for="fFam">Família</label><select id="fFam"${ro}>${fams.map((f) => `<option${f === rec.fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}${ed ? '<option value="__nova">+ Nova família…</option>' : ''}</select></div>
        <div class="f" id="fNovaWrap" hidden><label for="fNova">Nova família (nn.NOME)</label><input id="fNova" placeholder="46.NOMEDAFAMILIA"></div>
        <div class="f"><label>Código (não muda)</label><div class="ro code" id="fCode">${esc(String(code.a).padStart(2, '0') + '-' + code.b)}</div></div>
        <div class="f"><label for="fSit">Situação</label><select id="fSit"${ro}>${SITUACOES.map(([k, lb]) => `<option value="${k}"${situ(rec) === k ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select></div>
        <div class="f"><label for="fFab">Fabricante</label><input id="fFab" value="${esc(rec.fab || '')}"${ro}></div>
        <div class="f"><label for="fCodFab">Código do fabricante</label><input id="fCodFab" value="${esc(rec.codFab || '')}"${ro}></div>
        <div class="f"><label for="fTipo">Tipo/config.</label><input id="fTipo" list="dlTipos" value="${esc(rec.tipo || '')}"${ro}><datalist id="dlTipos">${[...new Set(REG.insumos.filter((x) => x.fam === rec.fam && x.tipo).map((x) => x.tipo))].map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div class="f"><label for="fOri">Origem</label><select id="fOri"${ro}><option${rec.origem === 'NAC' ? ' selected' : ''}>NAC</option><option${rec.origem === 'IMP' ? ' selected' : ''}>IMP</option></select></div>
        <div class="f span2" id="fSubWrap"${['inativo', 'descontinuado'].includes(situ(rec)) ? '' : ' hidden'}><label for="fSub">Substituto (quando descontinuado)</label><input id="fSub" list="dlInsAll" value="${esc(rec.substituto ? rec.substituto + ' · ' + ((REG.insumos.find((i) => i.id === rec.substituto) || {}).produto || '') : '')}"${ro}></div>
      </div>
      <section class="fsec" id="fCarSec"><h3>Características técnicas <span class="sub" id="fCarSub"></span></h3><div class="fields" id="fCar"></div></section>
      <section class="fsec"><h3>Descrições</h3>
        <div class="fields"><div class="f spanall"><label for="fProd">Descrição técnica padronizada <small class="sub">(é o nome que as fórmulas e as estruturas usam)</small></label>
          <input id="fProd" value="${esc(rec.produto || '')}"${ro}><label class="chk" id="fGerWrap"><input type="checkbox" id="fGerar"${st.gerar ? ' checked' : ''}${ro}> gerar pelas características da família</label><small class="sub" id="fPad"></small></div>
          <div class="f spanall" id="fExcWrap" hidden><label for="fExc">Justificativa da exceção ao padrão</label><input id="fExc" value="${esc(rec.excecao || '')}" placeholder="ex.: código do fabricante não segue a série; nome exigido pelo cliente"${ro}></div>
          <div class="f spanall"><label for="fCom">Descrição comercial <small class="sub">(para documentos ao cliente)</small></label><div class="row2"><input id="fCom" value="${esc(rec.descCom || '')}"${ro}><button type="button" class="btn sm" id="fComSug"${ro}>Sugerir</button></div></div>
          <div class="f spanall"><label for="fDescFab">Descrição do fabricante <small class="sub">(texto original do catálogo ou da cotação)</small></label><input id="fDescFab" value="${esc(rec.descFab || '')}"${ro}></div>
          <div class="f spanall"><label for="fObs">Observações</label><input id="fObs" value="${esc(rec.obs || '')}"${ro}></div></div>
        <div id="fDup"></div></section>
      <section class="fsec"><h3>Preço de aquisição</h3>
        <div class="fields"><div class="f"><label for="fVal">Valor (R$)</label><input id="fVal" inputmode="decimal" value="${typeof rec.valor === 'number' ? esc(NF[2].format(rec.valor)) : ''}" placeholder="sem preço"${ro}></div>
          <div class="f span2"><label for="fFonte">Origem do preço</label><input id="fFonte" value="${esc(rec.fonte || '')}" placeholder="fornecedor, nº do orçamento"${ro}></div>
          <div class="f"><label for="fDataCot">Data da cotação</label><input id="fDataCot" type="date" value="${esc(rec.dataCot || '')}"${ro}></div></div>
        <div id="fImp"></div></section>
      <details class="fsec"${st.forn.length ? ' open' : ''}><summary><h3 style="display:inline">Fornecedores e cotações <span class="sub">${st.forn.length}</span></h3></summary><div id="fForn"></div></details>
      <details class="fsec"${st.equiv.length ? ' open' : ''}><summary><h3 style="display:inline">Equivalentes técnicos e alternativas <span class="sub">${st.equiv.length}</span></h3></summary><div id="fEquiv"></div></details>
      </form>
      <datalist id="dlInsAll">${insOpts}</datalist>
      <div id="fErr" class="bad-t"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${ed ? `<button class="btn pri" id="fSave">${isNew ? 'Cadastrar' : 'Salvar'}</button>` : ''}
        ${ed && !isNew ? '<button class="btn" id="fDup2">Duplicar</button>' : ''}
        ${ed && !isNew ? '<button class="btn" id="fDel">Excluir</button>' : ''}
        <button class="btn" data-close>${ed ? 'Cancelar' : 'Fechar'}</button>
      </div>
      ${!isNew ? ondeUsadoHtml(rec) : ''}
      ${!isNew ? `<h2>Histórico de preço</h2>${hpHtml}` : ''}
      ${!isNew ? `<h2>Documentos deste insumo</h2>${SPV.docsDoInsumo(rec.id)}<div class="docbar"><label class="btn sm" for="insDoc">📎 Anexar orçamento, nota ou ficha</label><input type="file" id="insDoc" data-insdoc="${esc(rec.id)}" accept="application/pdf,image/*,.xml,.xlsx,.csv" hidden></div>` : ''}
      ${!isNew ? `<h2>Histórico deste insumo</h2>${histHtml}` : ''}`,
    (o, close) => {
      fillNames(o);
      const g = (s) => $(s, o); const famSel = g('#fFam'), nova = g('#fNova');
      const famAtual = () => (famSel.value === '__nova' ? nova.value.trim().toUpperCase().replace(/\s+/g, '') : famSel.value);
      const pad = () => FAMS_F.padraoDe(famAtual(), cfg);
      const drawCar = () => {
        const p = pad(); const sec = g('#fCarSec');
        if (!p || !(p.campos || []).length) { sec.hidden = true; g('#fGerWrap').hidden = true; return; }
        sec.hidden = false; g('#fGerWrap').hidden = !p.modelo; g('#fCarSub').textContent = p.nome + (p.modelo ? ' · modelo: ' + p.modelo : '');
        g('#fCar').innerHTML = p.campos.map((c) => { const v = st.car[c.k] ?? ''; const idf = 'fc_' + c.k;
          const inp = c.tipo === 'lista' ? `<input id="${idf}" data-car="${esc(c.k)}" list="dl_${idf}" value="${esc(v)}"${ro}><datalist id="dl_${idf}">${(c.ops || []).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`
            : `<input id="${idf}" data-car="${esc(c.k)}" value="${esc(v)}"${c.tipo === 'numero' ? ' inputmode="decimal"' : ''} placeholder="${esc(c.ex || '')}"${ro}>`;
          return `<div class="f${c.tipo === 'texto' ? ' span2' : ''}${c.req ? ' req' : ''}"><label for="${idf}">${esc(c.lb)}${c.un ? ` <small class="sub">(${esc(c.un)})</small>` : ''}${c.req ? '' : ' <small class="sub">opcional</small>'}</label>${inp}</div>`; }).join('');
        o.querySelectorAll('[data-car]').forEach((el) => { el.oninput = () => { st.car[el.dataset.car] = el.value; atualiza(); }; });
      };
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
          <td class="in"><input data-fo="${i}|nome" value="${esc(f.nome || '')}" aria-label="Fornecedor"${ro}></td><td class="in"><input data-fo="${i}|preco" value="${typeof f.preco === 'number' ? NF[2].format(f.preco) : ''}" inputmode="decimal" aria-label="Preço"${ro}></td>
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
          forn: st.forn.filter((f) => f.nome || typeof f.preco === 'number').length ? st.forn.filter((f) => f.nome || typeof f.preco === 'number') : undefined, equiv: st.equiv.length ? st.equiv : undefined };
        // renomear um insumo em uso: mostra o impacto e pede confirmação; estruturas e tabelas acompanham
        if (!isNew && produto !== rec.produto) {
          const imp = renomeImpacto(rec, produto);
          if (imp.bloqueios.length) return err('Não dá para renomear: ' + imp.bloqueios.join('; ') + '.');
          if (!sv.dataset.renOk) { sv.dataset.renOk = 1; return err(`Renomear "${rec.produto}" → "${produto}": ${imp.nCel} célula(s) de estrutura ou tabela por porte, ${imp.kits.length} kit(s) e ${imp.props} proposta(s) passam a usar o novo nome (o nome antigo continua reconhecido nas propostas salvas). Clique de novo para confirmar.`); }
        }
        sv.disabled = true; sv.textContent = 'Salvando…';
        try {
          if (!isNew && produto !== rec.produto) await aplicarRenome(rec, produto);
          const ch = await REG.saveInsumo(out, isNew); close(); toast(ch === false ? 'Nada mudou' : (isNew ? 'Cadastrado: ' + nid : 'Salvo: ' + nid));
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
        <div class="f"><label for="kMarca">Marca</label><input id="kMarca" value="${esc(rec.marca || '')}"${ro}></div>
      </div>
      <p class="sub" id="kWarn"></p>
      <h2>Componentes (R$)</h2>
      <div class="fields" id="kParts">${parts}</div>
      <div class="kpis" id="kTot"></div>
      <div id="kErr" class="bad-t"></div>
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
        const out = { id: rec.id || ((motor ? 'm' : 'b') + Date.now().toString(36)), ord: rec.ord, desc, tipo: $('#kTipo', o).value, marca: $('#kMarca', o).value.trim(), p: read() };
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
  // logo da empresa: enviado pelo app, vale no topo e nos PDFs
  const logoAtual = () => ((REG.tabelas || {}).MARCA || {}).logo || '';
  function aplicaLogo() { const img = document.querySelector('.logo-plate img'); const lg = logoAtual(); if (img && lg && img.getAttribute('src') !== lg) img.setAttribute('src', lg); }
  function logoCard() {
    const ed = REG.areaOk('sistema');
    return `<section class="card"><h2>Logo <span class="sub">topo do app, memorial e PDFs</span></h2>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span class="logo-plate" style="border:1px solid var(--line)"><img src="${esc(logoAtual() || (document.querySelector('.logo-plate img') || {}).src || '')}" alt="Logo atual" style="height:44px"></span>
      ${ed ? '<label class="btn pri" for="logoUp">Trocar logo (PNG, JPG ou SVG)</label><input type="file" id="logoUp" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>' + (logoAtual() ? ' <button class="btn" data-logoreset>Voltar ao original</button>' : '') : '<span class="sub">Só quem cuida de Sistema troca o logo.</span>'}</div></section>`;
  }
  async function salvaLogo(dataUrl, desc) { try { await REG.setTable('MARCA', dataUrl ? { logo: dataUrl } : {}, desc, []); if (!dataUrl) { const img = document.querySelector('.logo-plate img'); if (img) img.setAttribute('src', 'logo-lsfire.png'); } render(); toast(dataUrl ? 'Logo trocado' : 'Logo original'); } catch (e) { toast(errMsg(e)); } }
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
      else { if (!window.confirm('Apagar de vez "' + (p.numero || p.name) + '"? Não dá para desfazer (só por um backup).')) return; await REG.deleteProposta(p.id, !!p.local); logEv({ tipo: 'Proposta apagada de vez', ref: p.id, desc: p.name || '', mudancas: [] }); toast('Apagada'); }
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
        <tr><td><input type="checkbox" data-bkcad${podeCad ? '' : ' disabled'}></td><td>Cadastro (insumos, kits, tabelas)</td><td class="n" colspan="4">${podeCad ? 'substitui o cadastro deste navegador inteiro' : 'no banco da equipe, o cadastro se restaura pelo Cadastro → Importar preços e pelas tabelas; aqui só as coleções acima'}</td></tr></tbody></table></div>
      <label class="chk"><input type="checkbox" id="bkSubst"> Substituir também os registros diferentes (a versão atual de cada proposta vai antes para as revisões)</label>
      <div style="display:flex;gap:8px"><button class="btn pri" id="bkOk">Restaurar o que está marcado</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
      $('#bkOk', o).onclick = async () => {
        const cols = [...o.querySelectorAll('[data-bkcol]:checked')].map((x) => x.dataset.bkcol); const subst = $('#bkSubst', o).checked; const cad = podeCad && o.querySelector('[data-bkcad]').checked;
        if (!window.confirm('Confirmar a restauração?')) return; close(); let n = 0, pul = 0;
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
    const grupoH = (t) => /^(Proposta|Status|Alerta|Aprovação)/.test(t) ? 'propostas' : /^(Baixa|Custo real|Execução)/.test(t) ? 'margens' : /^Documento/.test(t) ? 'documentos' : /^Pedido/.test(t) ? 'pedidos' : /^Acessos/.test(t) ? 'acessos' : 'cadastro';
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
    { id: 'teste', t: 'Opcional: teste de desempenho em fábrica com laudo', d: 'Cria o insumo "TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO" em 34.MAODEOBRA, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Teste de desempenho em fábrica', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '34.MAODEOBRA', tipo: 'FIXO', campo: 'TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO', qtd: 'N', regra: 'OPCIONAL' }, novo: { fam: '34.MAODEOBRA', produto: 'TESTE DE DESEMPENHO EM FÁBRICA COM LAUDO', origem: 'NAC' } },
    { id: 'databook', t: 'Opcional: data book (manual, certificados e desenhos)', d: 'Cria o insumo "DATA BOOK TÉCNICO" em 41.OUTROS, sem preço: defina o valor no cadastro antes de usar.', add: { rot: 'Data book técnico', estr: 'TODOS', acion: 'TODOS', bloco: 'LS FIRE', fam: '41.OUTROS', tipo: 'FIXO', campo: 'DATA BOOK TÉCNICO', qtd: 1, regra: 'OPCIONAL' }, novo: { fam: '41.OUTROS', produto: 'DATA BOOK TÉCNICO', origem: 'NAC' } },
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
    const fg = e.target.closest('[data-fabgo]'); if (fg) { ui.insFab = fg.dataset.fabgo; ui.cad = 'insumos'; render(); }
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
      const dq = i.dataCot || i.upd; if (typeof i.valor === 'number' && dq && (Date.now() - Date.parse(dq)) / 864e5 > C.validadeDias && emUso) add('aviso', 'Preço desatualizado', i.fam, i.id + ' ' + i.produto + ' — cotação de ' + new Date(dq).toLocaleDateString('pt-BR'), go);
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
        <select data-qf="qFam" aria-label="Família"><option value="">Todas as famílias</option>${famList().map((f) => `<option${f === fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
      ${F.length ? `<div class="tw" style="max-height:55vh;overflow:auto"><table class="t"><tbody>${F.slice(0, 400).map((x) => `<tr class="${x.sev === 'imped' ? 'cf-erro' : x.sev === 'aviso' ? 'cf-aviso' : ''}"><td style="width:24px">${ic[x.sev]}</td><td><small class="sub">${esc(x.tipo)}${x.fam ? ' · ' + esc(x.fam) : ''}</small><br>${esc(x.msg)}</td><td style="text-align:right">${goBtn(x.go)}</td></tr>`).join('')}</tbody></table></div>${F.length > 400 ? '<p class="sub">Mostrando 400; use os filtros.</p>' : ''}` : '<p class="ok-t" style="margin:0">Nada com esses filtros.</p>'}
      <p class="sub" style="margin:8px 0 0">O painel só aponta. Correções são feitas no registro (botão Abrir) e ficam no histórico. "Consolidar" junta duplicidades de mesmo nome mediante confirmação, sem apagar nada.</p></section>
      <section class="card"><h2>Cadastros sem utilização <span class="sub">${SU.length} insumo(s) fora de estruturas, tabelas, kits, regras, propostas e baixas</span></h2>
        ${SU.length ? `<div class="tw" style="max-height:40vh;overflow:auto"><table class="t"><tbody>${SU.slice(0, 300).map((i) => `<tr>${ed ? `<td class="in"><input type="checkbox" data-susel="${esc(i.id)}" aria-label="Marcar ${esc(i.id)}"></td>` : ''}<td class="code">${esc(i.id)}</td><td>${esc(i.produto)}</td><td>${esc(i.fam)}</td><td class="n">${typeof i.valor === 'number' ? brl(i.valor) : '—'}</td><td><button class="btn sm" data-ins="${esc(i.id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>
          ${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn sm" data-suinat="inativo">Marcar os selecionados como inativos</button><button class="btn sm" data-suinat="descontinuado">… como descontinuados</button></div>' : ''}` : '<p class="sub" style="margin:0">Todos os insumos têm alguma referência.</p>'}
        <p class="sub" style="margin:8px 0 0">Nenhum registro é excluído: inativo e descontinuado saem das listas de escolha e o histórico fica preservado. Itens escolhidos no próprio item (motores, bombas, jockey) contam como usados pela família.</p></section></div>`;
  }
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
      let regrasCfg = []; try { regrasCfg = RG.avaliar(itemRegras(S)); } catch (e) { regrasCfg = []; }
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
      ${t.modo === 'modelo' ? `<div class="fields"><div class="f span2"><label for="tsMod">Modelo pronto</label><select id="tsMod" data-tst="modelo">${mods.map((m) => `<option${m.nome === t.modelo ? ' selected' : ''}>${esc(m.nome)}</option>`).join('') || '<option value="">nenhum modelo nesta estrutura</option>'}</select></div></div>`
        : `<div class="fields">${inp('E17', 'Arranjo (ex.: D, E, DJ, DDJ)')}${inp('D19', 'Bomba', true)}${inp('C19', 'Potência diesel (HP)', true)}${inp('H19', 'Rotação (RPM)', true)}${inp('F19', 'Arrefecimento', true)}${inp('I19', 'Potência elétrica (CV)', true)}${inp('L19', 'Tensão do painel', true)}${inp('J19', 'Bomba jockey', true)}${inp('G17', 'Vazão')}</div>`}
      ${opcs.length ? `<div class="f"><label>Opcionais</label><div class="chks">${opcs.map((x) => { const row = 67 + (x.r - 91); return `<label class="chk"><input type="checkbox" data-tsopc="${row}"${(t.opc || []).includes(row) ? ' checked' : ''}> ${esc(x.rot)}</label>`; }).join('')}</div></div>` : ''}
      <div class="docbar"><button class="btn pri" data-tstrun>Montar e testar</button></div></section>
      ${erro ? `<div class="banner bad">${esc(erro)}</div>` : ''}
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
        el.innerHTML = r.out.length ? `<b>${r.out.length} de ${r.n} modelo(s) pronto(s) mudam:</b><ul class="uso">${r.out.slice(0, 20).map((x) => `<li><b>${esc(x.m.nome)}</b> ${x.erro ? '<span class="bad-t">' + esc(x.erro) + '</span>' : `custo ${brl(x.a)} → ${brl(x.b)}${x.mais.length ? ' · entra: ' + esc(x.mais.join(', ')) : ''}${x.menos.length ? ' · sai: ' + esc(x.menos.join(', ')) : ''}`}</li>`).join('')}</ul>Propostas com preços da época não mudam; rascunhos passam a montar com a estrutura nova.` : `Testados ${r.n} modelo(s) pronto(s) das estruturas alteradas: nenhum muda de custo nem de componentes.`;
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
  function vEstruturas0() {
    const est = estrList().includes(ui.estr) ? ui.estr : estrList()[0]; const H = heads(); const lines = recLines();
    const free = 151 - 91 - lines.length;
    const tabs = ESTRSf().map(([k, lb]) => `<button role="tab" aria-selected="${k === est}" data-estr="${k}">${lb}</button>`).join('') + (canEd() && estrList().length < FAMS.length ? '<button data-estrnew>+ Nova estrutura</button>' : '');
    const mine = lines.filter((x) => estrOf(x).includes(est));
    const groups = ACIONS.map(([k, lb]) => {
      const g = mine.filter((x) => (x.acion || 'TODOS') === k); if (!g.length) return '';
      const fold = (ui.estrFold || {})[k];
      return `<tr class="grp click" data-fold="${k}"><td colspan="6">${fold ? '▸' : '▾'} ${lb} <span class="sub">· ${g.length} componentes · ${g.filter((x) => !x.regra).length} obrigatório(s), ${g.filter((x) => x.regra === 'OPCIONAL').length} opcional(is), ${g.filter((x) => x.regra && x.regra !== 'OPCIONAL').length} condicional(is)</span></td></tr>` + (fold ? '' : g.map((x) => `<tr class="click" data-recedit="${x.r}">
        <td><b>${esc(x.rot || '(sem nome)')}</b><br><small class="sub">${esc(x.fam)} · ${esc(x.bloco)}</small></td>
        <td>${esc(origemTxt(x, H))}</td><td>${esc(qtdTxt(x.qtd))}</td>
        <td>${x.regra ? `<span class="pill ${x.regra === 'OPCIONAL' ? 'mute' : 'warn'}">${x.regra === 'OPCIONAL' ? 'opcional' : 'condicional: ' + esc(regraTxt(x.regra))}</span>` : '<span class="pill ok">obrigatório</span>'}</td>
        <td>${x.estr === 'TODOS' ? '<span class="pill mute">todas</span>' : estrOf(x).map((e) => `<span class="pill mute">${esc(e)}</span>`).join(' ')}</td>
        <td><button class="btn sm" data-recedit="${x.r}">Editar</button></td></tr>`).join(''));
    }).join('');
    const sug = SUGESTOES.map((sg) => { const done = sugFeita(sg, lines); return `<label class="sugrow${done ? ' done' : ''}"><input type="checkbox" data-sug="${sg.id}" data-done="${done ? 1 : 0}"${done ? ' checked' : ''}${canEd() ? '' : ' disabled'}><span><b>${esc(sg.t)}</b>${done ? ' <span class="pill ok">aplicada</span> <small class="sub">desmarque para desfazer</small>' : ''}<br><small class="sub">${esc(sg.d)}</small></span></label>`; }).join('');
    const changed = Object.keys(REG.tabelas[MO] || {}).length + Object.keys(REG.tabelas['KIT HIDRÁULICA'] || {}).length;
    return `<div class="stack">
      <p class="sub" style="margin:0">A estrutura padrão diz o que entra em cada equipamento montado: quais componentes, de onde sai o insumo (o que foi escolhido no item, a tabela por porte ou um insumo fixo), quantos por bomba e em que condição. Toda proposta nova monta o item por aqui. ${free} linha(s) livre(s) de 60.</p>
      <div class="subtabs" role="tablist" aria-label="Estrutura">${tabs}</div>
      <div class="docbar"><button class="btn sm pri" data-recnew${canEd() && free > 0 ? '' : ' disabled'}>+ Novo componente</button><select id="estrCmp" aria-label="Comparar com outra estrutura"><option value="">Comparar com…</option>${ESTRSf().filter(([k]) => k !== est).map(([k, lb]) => `<option value="${k}">${esc(lb)}</option>`).join('')}</select><button class="btn sm" data-cad="testador">Testar esta estrutura</button>${changed ? `<span class="sub">${changed} alteração(ões) sobre a planilha</span><button class="btn sm" data-recreset>Voltar à estrutura da planilha</button>` : ''}</div>
      <div class="tw"><table class="t"><thead><tr><th>Componente</th><th>De onde sai o insumo</th><th>Quantidade</th><th>Condição</th><th>Vale para</th><th></th></tr></thead><tbody>${groups || '<tr><td colspan="6" class="sub">Nenhum componente nesta estrutura.</td></tr>'}</tbody></table></div>
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
      if (sg.add) { let r = 92; while (used.has(r) && r <= 151) r++; if (r > 151) break; used.add(r); Object.assign(ch, recChanges(r, sg.add)); }
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
    const pt = e.target.closest('[data-porte]'); if (pt) { ui.porte = pt.dataset.porte; render(); return; }
    const pe = e.target.closest('[data-pedit]'); if (pe) { const [sh, a, lb] = pe.dataset.pedit.split('|'); const cur = txt(sh, a);
      modal(`<h2>${esc(lb)}</h2><p class="sub" style="margin:0">Faixa da linha ${esc(a.replace(/\D/g, ''))}. Escolha o insumo do cadastro (a lista filtra enquanto você digita).</p><div class="f"><label for="peIn">Insumo</label><input id="peIn" list="dl_all" value="${esc(cur)}" autocomplete="off"></div><p class="sub" id="peMsg" style="margin:0"></p><div style="display:flex;gap:8px"><button class="btn pri" id="peOk">Salvar</button><button class="btn" id="peClr">Deixar sem</button><button class="btn" data-close>Cancelar</button></div>${datalists()}`, (o, close) => {
        const inp = $('#peIn', o); inp.focus(); inp.select();
        const go = async (v) => { close(); try { await REG.setCells(sh, { [a]: v || null }, 'Tabela por porte ' + lb + ' (linha ' + a.replace(/\D/g, '') + ')', baseOf(sh)); toast('Salvo'); } catch (err) { toast(errMsg(err)); } };
        $('#peOk', o).onclick = () => go(inp.value.trim()); $('#peClr', o).onclick = () => go('');
      }); return; }
    const ed = e.target.closest('[data-recedit]'); if (ed) { recModal(+ed.dataset.recedit); return; }
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
      ${ed ? `<div class="fields" style="margin-top:10px"><div class="f span2"><label for="vNome">Nome</label><input id="vNome" placeholder="ex.: THIAGO SILVA"></div><div class="f"><label>Papel</label><div class="seg"><label class="on"><input type="radio" name="vPapel" value="vendedor" checked>Vendedor</label><label><input type="radio" name="vPapel" value="an">AN</label></div></div><div class="f span2"><label for="vMail">E-mail (opcional)</label><input id="vMail"></div><div class="f" style="justify-content:end"><button class="btn pri" id="vAdd">Incluir</button></div></div>` : ''}</section>`;
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
  function modal(html, bind) {
    const o = $('#overlay'); o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="card">${html}</div></div>`;
    setTimeout(() => { if (!o.contains(document.activeElement)) { const f = o.querySelector('input:not([type=hidden]):not([disabled]),select,textarea,button'); if (f) f.focus(); } }, 0);
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
    const extra = { uid: dup || !p.uid ? newUid() : p.uid, status: dup ? 'rascunho' : (p.status || 'rascunho'), ack: dup ? {} : (p.ack || {}), verBase: dup ? undefined : (p.verDoc || 0), cenSim: dup ? [] : (p.cenSim || []), naCustos: dup ? {} : (p.naCustos || {}), precosFix: !dup && precosFixos(p) ? JSON.parse(JSON.stringify(p.precos)) : null, precosSalvos: dup ? null : (p.precos || null) };
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
  const FX = window.PricerFacts({ confCard: () => confCard() + PN.cardProposta(state.id, docTitle()), revSelo: () => revSelo(), REG, esc, brl, pct, NF, toast, parseInput, val, txt, ui, render, modal, getState: () => state,
    setState: (s) => { state = Object.assign({ doc: {} }, s); build(); persist(); dirty = true; }, persist: () => { persist(); dirty = true; }, get SPV() { return SPV; } });
  const TB = window.PricerTributos({ REG, esc, brl, pct, NF, toast, parseInput, ui, render });
  // pendências de cadastro (pedidos de preço) e do fiscal (NCM por família, alíquotas a definir)
  function pendExtra() {
    const S = [];
    // pendências do acompanhamento atribuídas a mim (no app compartilhado; neste navegador não há usuário)
    if (REG.mode === 'shared' && REG.me) S.push({ k: 'acomp', titulo: 'Pendências atribuídas a você', papel: 'Acompanhamento', itens: PN.todas().filter((p) => PN.aberta(p) && p.respId === REG.me).map((p) => ({ titulo: (p.id) + ' · ' + p.titulo, sub: [p.propNome, p.departamento, p.prazo ? 'prazo ' + new Date(p.prazo + 'T12:00').toLocaleDateString('pt-BR') + (PN.vencida(p) ? ' (vencida)' : '') : ''].filter(Boolean).join(' · '), desde: p.criadaEm, btn: ['Abrir', `data-pnabre="${esc(p.id)}"`] })) });
    if (REG.areaOk('custos')) S.push({ k: 'pedidos', titulo: 'Pedidos de cadastro', papel: 'Custos', itens: PD.abertos().map((x) => ({ titulo: x.produto || x.desc || 'Pedido de cadastro', sub: [x.fam, x.propNome].filter(Boolean).join(' · '), desde: x.at, btn: ['Atender', 'data-pendgo="cadastro|pedidos"'] })) });
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
  const SPV = window.PricerSPV({ painel: () => PNL.vPainel(), revAtual: () => revAtual(), pendencias: () => MG.resumoPendencias(), confCard: () => confCard() + PN.cardProposta(state.id, docTitle()), revSelo: () => revSelo(), tribCard: (snap, c) => TB.cardProposta(snap, c), famsHome: () => famsHome(), etapasHtml: (p) => MG.etapasHtml(p), etapaPendente: (p, k) => MG.etapaPendente(p, k), proximo: (p) => MG.proximo(p), situacao: (p) => MG.situacao(p), aprovHtml: () => aprovLinha({ aprov: aprovInfo() }), REG, esc, brl, pct, fmtNum, NF, modal, toast, parseInput, txt, val, docTitle, newSeq, openProposta, ui, render, fechar: (p) => MG.fecharModal(p), log: (e) => REG.log(e), home: () => PD.cardHome(), insumos: () => REG.insumos,
    getState: () => state, setState: (s) => { state = Object.assign({ doc: {} }, s); build(); persist(); dirty = true; },
    persist: () => { persist(); dirty = true; },
    current: () => { if (isSpv()) return { div: 'SPV', label: docTitle(), total: SPV.total() }; if (isFacts()) return { div: 'SEQ', label: docTitle(), total: FX.total() }; const n = txt('PROPOSTA', 'C5'), c = txt('PROPOSTA', 'F5'); return n || c ? { div: 'SEQ', label: docTitle(), total: val('PROPOSTA', 'P43') } : null; } });

  $('#bMode').onclick = () => { ui.simple = !ui.simple; ui.propFull = false; ui.itemFull = false; store.set(SK.view, ui); render(); window.scrollTo(0, 0); };
  $('#bNew').onclick = () => modal(`<h2>Nova proposta</h2><p class="sub">A proposta atual continua salva se você já clicou em Salvar. Alterações não salvas se perdem.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mBlank">SEQ em branco</button><button class="btn pri" id="mSpv">SPV (serviço, peças, contrato)</button><button class="btn" id="mExample">Exemplo SEQ (Cocamar)</button><button class="btn" data-close>Cancelar</button></div>`,
    (o, close) => { $('#mBlank', o).onclick = () => { close(); newSeq(); }; $('#mSpv', o).onclick = () => { close(); setView('inicio'); const t = document.querySelector('.tchips'); if (t) t.scrollIntoView({ block: 'center' }); toast('Escolha o tipo de SPV'); }; $('#mExample', o).onclick = () => { close(); loadDoc(MODEL.example, ''); setView('proposta'); toast('Exemplo carregado'); }; });

  $('#bSave').onclick = async (ev) => {
    if (state.verRev) { toast('Você está consultando a revisão ' + state.verRev.rev + '. Volte à atual ou restaure esta como nova revisão.'); return; }
    // proposta já enviada ao cliente: alterar cria revisão nova (a enviada fica guardada), salvo se for só correção
    const salva = (REG.listPropostas() || []).find((x) => x.id === state.id);
    if (ev && salva && dirty && ['enviada', 'negociacao'].includes(salva.status)) { revSalvarEnviada(salva); return; }
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
      $('#cfAbre', o).onclick = () => { if (!window.confirm('Descartar as suas alterações?')) return; close(); openProposta(Object.assign({ id }, remoto), false); };
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
    const rows = list.map((p) => `<div class="row"><div style="min-width:0"><span class="divb ${p.div === 'SPV' ? 'spv' : 'seq'}">${p.div || 'SEQ'}</span> <b>${esc(p.name)}</b><br><small>${fmtAt(p.at)} · ${typeof p.total === 'number' ? brl(p.total) : '—'}${shared && !p.local ? ' · ' + who(p.by) : ''}${p.local ? ' · <span class="pill mute">neste navegador</span>' : ''}</small></div><div style="display:flex;gap:6px"><button class="btn sm pri" data-open="${esc(p.id)}">Abrir</button>${REG.podeExcluir(p) ? `<button class="btn sm" data-del="${esc(p.id)}" title="Vai para a lixeira (Cadastro → Sistema → Backup); dá para restaurar">Excluir</button>` : ''}</div></div>`).join('')
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
        try { await REG.moverLixeira(p, ''); logEv({ tipo: 'Proposta excluída (lixeira)', ref: p.id, desc: p.name || '', mudancas: [] }); b.closest('.row').remove(); toast('Proposta na lixeira. Dá para restaurar em Cadastro → Sistema → Backup.'); if (state.id === p.id) { state.id = null; persist(); } } catch (err) { toast(errMsg(err)); }
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
