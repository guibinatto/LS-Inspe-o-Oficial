/* LS Pricer — cadastro (insumos, kits, tabelas, histórico e propostas).
 * Publicado no claude.ai, os dados ficam num banco compartilhado pela equipe;
 * aberto como arquivo, ficam no navegador. As telas leem daqui e o motor de
 * cálculo recebe as abas CADASTRO / KIT reconstruídas a partir dos registros.
 */
(function () {
  'use strict';
  const { parseAddr } = window.PricerEngine;

  const KMD_COLS = 'DEFGHIJKLMNOPQRST'.split('');
  const KB_COLS = 'DEFGH'.split('');
  const KMD_LABELS = { D: 'Motor diesel', E: 'Painel NBR 13714', F: 'Painel', G: 'Base', H: 'Tanque NBR 13714', I: 'Tanque de combustível', J: 'Mangueira de combustível', K: 'Escape', L: 'Bateria', M: 'Acoplamento / cardan', N: 'Sensores', O: 'Pré-aquecimento', P: 'Chave de partida', Q: 'Miscelâneas', R: 'Mão de obra', S: 'Capa do acoplamento', T: 'Embalagem' };
  const KB_LABELS = { D: 'Bomba', E: 'Manômetro', F: 'Manovacuômetro', G: 'Válvula de alívio de carcaça', H: 'Válvula de liberação de ar' };
  const LIMITS = { insumos: 999, kitMotor: 70, kitBomba: 77 };
  const LS = { reg: 'lspricer.registry.v1', hist: 'lspricer.history.v1', saved: 'lspricer.saved' };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const clean = (o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== null) r[k] = v; return r; };
  const today = () => new Date().toISOString().slice(0, 10);

  // ---------- registros de base, lidos da planilha ----------
  function baseFromModel(MODEL) {
    const sh = (n) => MODEL.sheets.find((s) => s.name === n).cells;
    const cad = sh('CADASTRO'), kmd = sh('KIT MOTORES DIESEL'), kb = sh('KIT BOMBA');
    const insumos = [];
    for (let r = 2; r <= 1000; r++) {
      if (cad['D' + r] === undefined) continue;
      const a = cad['A' + r], b = cad['B' + r];
      insumos.push(clean({ id: String(a).padStart(2, '0') + '-' + b, a, b, fam: cad['C' + r], produto: String(cad['D' + r]), fab: cad['E' + r], tipo: cad['F' + r], valor: num(cad['G' + r]), origem: cad['H' + r], obs: cad['I' + r] }));
    }
    const kitMotor = [];
    for (let r = 2; r <= 71; r++) {
      if (!kmd['A' + r]) continue;
      const p = {}; for (const c of KMD_COLS) if (num(kmd[c + r]) !== null) p[c] = kmd[c + r];
      kitMotor.push(clean({ id: 'm' + String(r).padStart(3, '0'), ord: r, desc: String(kmd['A' + r]), tipo: kmd['B' + r], marca: kmd['C' + r], p }));
    }
    const kitBomba = [];
    for (let r = 2; r <= 78; r++) {
      if (!kb['A' + r]) continue;
      const p = {}; for (const c of KB_COLS) if (num(kb[c + r]) !== null) p[c] = kb[c + r];
      kitBomba.push(clean({ id: 'b' + String(r).padStart(3, '0'), ord: r, desc: String(kb['A' + r]), tipo: kb['B' + r], marca: kb['C' + r], p }));
    }
    return { insumos, kitMotor, kitBomba, tabelas: {} };
  }
  const kmdTotals = (p) => { const s = (cs) => cs.reduce((t, c) => t + (num(p[c]) || 0), 0); const mid = s('GHIJKLMNOPQRST'.split('')); const r2 = (x) => Math.round(x * 100) / 100; return { nbr: r2((num(p.D) || 0) + (num(p.E) || 0) + mid), padrao: r2((num(p.D) || 0) + (num(p.F) || 0) + mid) }; };
  const kbTotals = (p) => { const s = (cs) => cs.reduce((t, c) => t + (num(p[c]) || 0), 0); const r2 = (x) => Math.round(x * 100) / 100; return { es: r2(s(['D', 'E', 'F'])), bp: r2(s(KB_COLS)) }; };
  const famCode = (fam) => { const m = /^(\d+)\./.exec(fam || ''); return m ? +m[1] : 99; };
  const sortIns = (list) => list.slice().sort((x, y) => (x.a - y.a) || (x.b - y.b));
  const sortKit = (list) => list.slice().sort((x, y) => (x.ord || 1e9) - (y.ord || 1e9) || String(x.desc).localeCompare(String(y.desc)));

  // ---------- armazenamento (compartilhado ou local) ----------
  function Registry(MODEL, onChange) {
    const base = baseFromModel(MODEL);
    const R = {
      mode: 'local', ready: true, seeded: true, canEditCadastro: true, canSaveShared: false,
      me: null, user: null, downloads: null, db: null,
      insumos: base.insumos, kitMotor: base.kitMotor, kitBomba: base.kitBomba, tabelas: {},
      historico: [], propostas: null, error: null, base,
    };
    // local: o que foi mudado neste navegador
    const local = ls.get(LS.reg, null);
    if (local) { R.insumos = local.insumos || R.insumos; R.kitMotor = local.kitMotor || R.kitMotor; R.kitBomba = local.kitBomba || R.kitBomba; R.tabelas = local.tabelas || {}; }
    R.historico = ls.get(LS.hist, []);
    const saveLocal = () => { if (R.mode === 'local') ls.set(LS.reg, { insumos: R.insumos, kitMotor: R.kitMotor, kitBomba: R.kitBomba, tabelas: R.tabelas }); };
    let changeTimer = null;
    const changed = (what) => { clearTimeout(changeTimer); changeTimer = setTimeout(() => onChange(what), 60); };

    // conecta ao banco compartilhado quando publicado no claude.ai
    (async function connect() {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const [db, user, downloads] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('downloads')]);
      R.downloads = downloads; R.user = user;
      if (!db) { changed('mode'); return; }
      R.db = db; R.mode = 'shared'; R.ready = false; R.canEditCadastro = false;
      if (user) {
        R.me = await user.id();
        R.canEditCadastro = await user.canEdit();
        const w = await user.can('data.write'); R.canSaveShared = w !== false;
      } else R.canSaveShared = true;
      changed('mode');
      const err = (e) => { R.error = (e && e.code) || 'unavailable'; changed('error'); };
      let got = { meta: false, ins: false, km: false, kb: false };
      const maybeReady = () => { if (got.meta && got.ins && got.km && got.kb && !R.ready) { R.ready = true; changed('ready'); } };
      db.doc('meta/cadastro').onSnapshot((s) => { R.seeded = !!(s.exists && s.data().seeded); got.meta = true; if (R._applyShared) R._applyShared(); maybeReady(); changed('meta'); }, err);
      // insumos: um documento por família (cadastro/fNN), com os itens por código
      let insDocs = null, kitDocs = null;
      const applyShared = () => {
        if (!R.seeded) return;
        if (insDocs) { const all = []; for (const d of insDocs) { const it = d.data().itens || {}; for (const [id, x] of Object.entries(it)) all.push(Object.assign({ id }, x)); } R.insumos = all; }
        if (kitDocs) { for (const d of kitDocs) { const list = Object.entries(d.data().itens || {}).map(([id, x]) => Object.assign({ id }, x)); if (d.id === 'motor') R.kitMotor = list; if (d.id === 'bomba') R.kitBomba = list; } }
      };
      R._applyShared = applyShared;
      db.collection('cadastro').limit(200).onSnapshot((s) => { insDocs = s.docs; got.ins = true; applyShared(); maybeReady(); changed('insumos'); }, err);
      db.collection('kits').limit(10).onSnapshot((s) => { kitDocs = s.docs; got.km = got.kb = true; applyShared(); maybeReady(); changed('kits'); }, err);
      db.collection('tabelas').limit(50).onSnapshot((s) => { const t = {}; for (const d of s.docs) { const x = d.data(); if (x && x.sheet) t[x.sheet] = x.cells || {}; } R.tabelas = t; changed('tabelas'); }, err);
      db.collection('historico').orderBy('dia', 'desc').limit(90).onSnapshot((s) => {
        const all = []; for (const d of s.docs) for (const it of (d.data().itens || [])) all.push(it);
        all.sort((x, y) => String(y.at).localeCompare(String(x.at))); R.historico = all; changed('historico');
      }, err);
      db.collection('propostas').orderBy('at', 'desc').limit(300).onSnapshot((s) => { R.propostas = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); changed('propostas'); }, err);
    })();

    // ---- gravação: lê, altera e grava o documento com uma trava curta ----
    async function mutate(path, fn) {
      const ref = R.db.doc(path);
      for (let i = 0; i < 4; i++) {
        let ok = true; try { ok = (await ref.acquire({ holder: R.me || 'anon', ttlMs: 8000 })).acquired; } catch (e) { ok = true; }
        if (ok) break; await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
      }
      const cur = await ref.get();
      const data = cur.exists ? JSON.parse(JSON.stringify(cur.data())) : {};
      const out = fn(data);
      await ref.set(out || data);
    }
    const famDoc = (fam) => 'cadastro/f' + String(famCode(fam)).padStart(2, '0');
    R._mutate = mutate;

    // ---- histórico ----
    async function log(entry) {
      const it = Object.assign({ at: new Date().toISOString(), by: R.me || null }, entry);
      if (R.mode === 'local') { R.historico = [it].concat(R.historico).slice(0, 800); ls.set(LS.hist, R.historico); changed('historico'); return; }
      const ref = R.db.doc('historico/' + today());
      try { await ref.acquire({ holder: R.me || 'anon', ttlMs: 8000 }); } catch (e) { /* segue sem trava */ }
      const cur = await ref.get();
      const itens = (cur.exists ? (cur.data().itens || []) : []).concat([it]);
      await ref.set({ dia: today(), itens });
    }
    function diff(before, after, fields) {
      const out = [];
      const nz = (v) => (v === undefined || v === '' ? null : v);
      for (const [k, lb] of fields) { const a = nz(before ? before[k] : undefined), b = nz(after ? after[k] : undefined); if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ campo: lb, de: a, para: b }); }
      return out;
    }
    const INS_FIELDS = [['fam', 'Família'], ['produto', 'Produto'], ['fab', 'Fabricante'], ['tipo', 'Tipo/config.'], ['valor', 'Valor'], ['origem', 'Origem'], ['obs', 'Observações']];
    const guard = () => { if (!R.canEditCadastro) throw new Error('Sem permissão para editar o cadastro. Peça acesso de Editor a quem publicou o app.'); if (R.mode === 'shared' && !R.seeded) throw new Error('O cadastro compartilhado ainda não foi carregado.'); };

    // ---- insumos ----
    R.nextCode = (fam) => {
      const a = famCode(fam); const bs = R.insumos.filter((x) => x.a === a).map((x) => x.b);
      return { a, b: bs.length ? Math.max(...bs) + 1 : a * 1000 + 1 };
    };
    R.saveInsumo = async (rec, isNew) => {
      guard();
      const before = R.insumos.find((x) => x.id === rec.id) || null;
      if (isNew && R.insumos.length >= LIMITS.insumos) throw new Error('O cadastro chegou ao limite de 999 insumos da planilha.');
      const body = clean(Object.assign({}, rec)); delete body.id;
      body.upd = new Date().toISOString(); if (R.me) body.updBy = R.me;
      const mud = diff(before, rec, INS_FIELDS);
      if (!isNew && !mud.length) return false;
      if (R.mode === 'shared') {
        if (before && famCode(before.fam) !== famCode(rec.fam)) await mutate(famDoc(before.fam), (d) => { if (d.itens) delete d.itens[rec.id]; return d; });
        await mutate(famDoc(rec.fam), (d) => { d.fam = d.fam || rec.fam; d.itens = d.itens || {}; d.itens[rec.id] = body; return d; });
      }
      else { R.insumos = before ? R.insumos.map((x) => x.id === rec.id ? Object.assign({ id: rec.id }, body) : x) : R.insumos.concat([Object.assign({ id: rec.id }, body)]); saveLocal(); changed('insumos'); }
      await log({ tipo: isNew ? 'Insumo novo' : 'Insumo', ref: rec.id, desc: rec.produto, mudancas: mud });
      return true;
    };
    R.deleteInsumo = async (id) => {
      guard(); const before = R.insumos.find((x) => x.id === id); if (!before) return;
      if (R.mode === 'shared') await mutate(famDoc(before.fam), (d) => { if (d.itens) delete d.itens[id]; return d; });
      else { R.insumos = R.insumos.filter((x) => x.id !== id); saveLocal(); changed('insumos'); }
      await log({ tipo: 'Insumo excluído', ref: id, desc: before.produto, mudancas: [{ campo: 'Valor', de: before.valor ?? null, para: null }] });
    };
    R.newInsumoId = (a, b) => String(a).padStart(2, '0') + '-' + b;

    // ---- kits ----
    const kitList = (kind) => (kind === 'motor' ? R.kitMotor : R.kitBomba);
    R.saveKit = async (kind, rec, isNew) => {
      guard();
      const list = kitList(kind); const lim = kind === 'motor' ? LIMITS.kitMotor : LIMITS.kitBomba;
      if (isNew && list.length >= lim) throw new Error('Não há linha livre na aba KIT ' + (kind === 'motor' ? 'MOTORES DIESEL' : 'BOMBA') + ' (limite de ' + lim + ').');
      const before = list.find((x) => x.id === rec.id) || null;
      const labels = kind === 'motor' ? KMD_LABELS : KB_LABELS;
      const mud = diff(before, rec, [['desc', 'Descrição'], ['tipo', 'Origem'], ['marca', 'Marca']]);
      for (const [c, lb] of Object.entries(labels)) { const a = before && before.p ? before.p[c] : undefined, b = rec.p ? rec.p[c] : undefined; if ((a ?? null) !== (b ?? null)) mud.push({ campo: lb, de: a ?? null, para: b ?? null }); }
      if (!isNew && !mud.length) return false;
      const body = clean(Object.assign({}, rec)); delete body.id; body.upd = new Date().toISOString(); if (R.me) body.updBy = R.me;
      if (isNew && !body.ord) body.ord = Math.max(0, ...list.map((x) => x.ord || 0)) + 1;
      if (R.mode === 'shared') await mutate('kits/' + kind, (d) => { d.itens = d.itens || {}; d.itens[rec.id] = body; return d; });
      else { const nl = before ? list.map((x) => x.id === rec.id ? Object.assign({ id: rec.id }, body) : x) : list.concat([Object.assign({ id: rec.id }, body)]); if (kind === 'motor') R.kitMotor = nl; else R.kitBomba = nl; saveLocal(); changed('kits'); }
      await log({ tipo: (isNew ? 'Kit novo — ' : 'Kit — ') + (kind === 'motor' ? 'motor diesel' : 'bomba'), ref: rec.id, desc: rec.desc, mudancas: mud });
      return true;
    };
    R.deleteKit = async (kind, id) => {
      guard(); const list = kitList(kind); const before = list.find((x) => x.id === id); if (!before) return;
      if (R.mode === 'shared') await mutate('kits/' + kind, (d) => { if (d.itens) delete d.itens[id]; return d; });
      else { const nl = list.filter((x) => x.id !== id); if (kind === 'motor') R.kitMotor = nl; else R.kitBomba = nl; saveLocal(); changed('kits'); }
      await log({ tipo: 'Kit excluído — ' + (kind === 'motor' ? 'motor diesel' : 'bomba'), ref: id, desc: before.desc, mudancas: [] });
    };

    // ---- demais tabelas (PARÂMETROS, POLÍTICA…): alterações célula a célula ----
    const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
    R.setCell = async (sheet, a, v, restore, baseVal) => {
      guard();
      const cells = Object.assign({}, R.tabelas[sheet] || {});
      const before = a in cells ? cells[a] : baseVal;
      if (restore) delete cells[a]; else cells[a] = v;
      if (R.mode === 'shared') await R.db.doc('tabelas/' + slug(sheet)).set({ sheet, cells });
      else { R.tabelas = Object.assign({}, R.tabelas, { [sheet]: cells }); if (!Object.keys(cells).length) delete R.tabelas[sheet]; saveLocal(); changed('tabelas'); }
      await log({ tipo: 'Tabela ' + sheet, ref: sheet + '!' + a, desc: sheet + ' ' + a, mudancas: [{ campo: a, de: before ?? null, para: restore ? (baseVal ?? null) : v }] });
    };
    // várias células de uma vez (uma linha de estrutura, por exemplo): uma gravação e um registro no histórico
    R.setCells = async (sheet, changes, desc, baseOf) => {
      guard();
      const cells = Object.assign({}, R.tabelas[sheet] || {}); const mud = [];
      for (const [a, v0] of Object.entries(changes)) {
        const v = v0 === undefined || v0 === '' ? null : v0; const base = baseOf(a); const before = a in cells ? (cells[a] === '' ? null : cells[a]) : (base ?? null);
        if ((v ?? null) === (base ?? null)) delete cells[a]; else cells[a] = v === null ? '' : v;
        if ((before ?? null) !== (v ?? null)) mud.push({ campo: a, de: before ?? null, para: v });
      }
      if (!mud.length) return false;
      if (R.mode === 'shared') await R.db.doc('tabelas/' + slug(sheet)).set({ sheet, cells });
      else { R.tabelas = Object.assign({}, R.tabelas, { [sheet]: cells }); if (!Object.keys(cells).length) delete R.tabelas[sheet]; saveLocal(); changed('tabelas'); }
      await log({ tipo: 'Estrutura', ref: sheet, desc, mudancas: mud });
      return true;
    };
    R.resetSheet = async (sheet) => {
      guard();
      if (R.mode === 'shared') await R.db.doc('tabelas/' + slug(sheet)).set({ sheet, cells: {} });
      else { R.tabelas = Object.assign({}, R.tabelas); delete R.tabelas[sheet]; saveLocal(); changed('tabelas'); }
      await log({ tipo: 'Tabela ' + sheet, ref: sheet, desc: 'Voltou aos valores da planilha', mudancas: [] });
    };

    // ---- importação de preços em lote ----
    R.applyPrices = async (changes, fonte, onProgress) => {
      guard(); let done = 0; const ok = []; const at = new Date().toISOString();
      const byFam = new Map();
      for (const c of changes) { const rec = R.insumos.find((x) => x.id === c.id); if (!rec) continue; if (!byFam.has(rec.fam)) byFam.set(rec.fam, []); byFam.get(rec.fam).push([c, rec]); }
      for (const [fam, list] of byFam) {
        if (R.mode === 'shared') {
          await mutate(famDoc(fam), (d) => { d.itens = d.itens || {}; for (const [c] of list) if (d.itens[c.id]) { d.itens[c.id].valor = c.para; d.itens[c.id].upd = at; if (R.me) d.itens[c.id].updBy = R.me; } return d; });
        } else for (const [c, rec] of list) { rec.valor = c.para; rec.upd = at; }
        for (const [c, rec] of list) ok.push({ campo: c.id + ' · ' + rec.produto, de: c.de ?? null, para: c.para });
        done += list.length; onProgress && onProgress(done, changes.length);
      }
      if (R.mode === 'local') { R.insumos = R.insumos.slice(); saveLocal(); changed('insumos'); }
      await log({ tipo: 'Importação de preços', ref: 'import', desc: fonte + ' — ' + ok.length + ' preço(s)', mudancas: ok });
      return ok.length;
    };

    // ---- propostas ----
    R.listPropostas = () => R.mode === 'shared' && R.propostas ? R.propostas : Object.entries(ls.get(LS.saved, {})).map(([id, p]) => Object.assign({ id, local: true }, p)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    R.saveProposta = async (id, p) => {
      if (R.mode === 'shared' && R.canSaveShared) { await R.db.doc('propostas/' + id).set(clean(Object.assign({}, p, { by: R.me || undefined }))); return 'shared'; }
      const saved = ls.get(LS.saved, {}); saved[id] = p; ls.set(LS.saved, saved); return 'local';
    };
    R.deleteProposta = async (id, isLocal) => {
      if (!isLocal && R.mode === 'shared') { await R.db.doc('propostas/' + id).delete(); return; }
      const saved = ls.get(LS.saved, {}); delete saved[id]; ls.set(LS.saved, saved);
    };

    // ---- pessoas ----
    R.names = async (ids) => {
      const out = {}; const list = [...new Set(ids.filter(Boolean))];
      if (!R.user || !list.length) return out;
      try { const ps = await R.user.profiles(list); for (const id of list) out[id] = (ps[id] && ps[id].name) || 'Alguém da equipe'; } catch (e) { /* sem nomes */ }
      return out;
    };

    // ---- arquivo para baixar ----
    R.save = async (filename, data, mime) => {
      if (R.downloads) { try { await R.downloads.save({ filename, data }); return true; } catch (e) { if (e && e.code === 'declined') return false; } }
      try { const b = new Blob([data], { type: mime || 'application/octet-stream' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; a.click(); return true; } catch (e) { return false; }
    };

    // ---- aplica no motor ----
    R.applyTo = (wb) => {
      const cad = wb.sheet('CADASTRO').cells;
      for (let r = 2; r <= 1000; r++) for (const c of 'ABCDEFGHI') cad.delete(c + r);
      sortIns(R.insumos).slice(0, LIMITS.insumos).forEach((x, i) => {
        const r = i + 2; const set = (c, v) => { if (v !== undefined && v !== null && v !== '') cad.set(c + r, v); };
        set('A', x.a); set('B', x.b); set('C', x.fam); set('D', x.produto); set('E', x.fab); set('F', x.tipo); set('G', num(x.valor)); set('H', x.origem); set('I', x.obs);
      });
      const kmd = wb.sheet('KIT MOTORES DIESEL').cells;
      for (let r = 2; r <= 71; r++) for (const c of 'ABCDEFGHIJKLMNOPQRSTUV') kmd.delete(c + r);
      sortKit(R.kitMotor).slice(0, LIMITS.kitMotor).forEach((k, i) => {
        const r = i + 2; kmd.set('A' + r, k.desc); if (k.tipo) kmd.set('B' + r, k.tipo); if (k.marca) kmd.set('C' + r, k.marca);
        const p = k.p || {}; for (const c of KMD_COLS) if (num(p[c]) !== null) kmd.set(c + r, p[c]);
        const t = kmdTotals(p); kmd.set('U' + r, t.nbr); kmd.set('V' + r, t.padrao);
      });
      const kb = wb.sheet('KIT BOMBA').cells;
      for (let r = 2; r <= 78; r++) for (const c of 'ABCDEFGHIJ') kb.delete(c + r);
      sortKit(R.kitBomba).slice(0, LIMITS.kitBomba).forEach((k, i) => {
        const r = i + 2; kb.set('A' + r, k.desc); if (k.tipo) kb.set('B' + r, k.tipo); if (k.marca) kb.set('C' + r, k.marca);
        const p = k.p || {}; for (const c of KB_COLS) if (num(p[c]) !== null) kb.set(c + r, p[c]);
        const t = kbTotals(p); kb.set('I' + r, t.es); kb.set('J' + r, t.bp);
      });
      for (const [sheet, cells] of Object.entries(R.tabelas || {})) {
        const s = wb.sheet(sheet); if (!s) continue;
        for (const [a, v] of Object.entries(cells)) { if (!parseAddr(a)) continue; if (v === null || v === '') s.cells.delete(a); else s.cells.set(a, v); }
      }
      wb.invalidate();
    };
    R.helpers = { KMD_COLS, KB_COLS, KMD_LABELS, KB_LABELS, LIMITS, kmdTotals, kbTotals, famCode, sortIns, sortKit, slug };
    return R;
  }

  window.PricerRegistry = { Registry, baseFromModel };
})();
