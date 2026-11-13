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
        try { R.isOwner = !!(await user.isOwner()); } catch (e) { R.isOwner = false; }
        const w = await user.can('data.write'); R.canSaveShared = w !== false;
      } else R.canSaveShared = true;
      changed('mode');
      const err = (e) => { R.error = (e && e.code) || 'unavailable'; changed('error'); };
      let got = { meta: false, ins: false, km: false, kb: false };
      const maybeReady = () => { if (got.meta && got.ins && got.km && got.kb && !R.ready) { R.ready = true; changed('ready'); } };
      // meta/acessos só o dono do app grava (regra do banco); por isso quem gravou (by) é o dono
      db.doc('meta/acessos').onSnapshot((s) => { R.acessos = (s.exists && s.data().areas) || {}; R.donoId = (s.exists && s.data().by) || null; changed('acessos'); }, () => {});
      db.doc('meta/numeracao').onSnapshot((s) => { R.numCfg = (s.exists && s.data().series) || {}; changed('numeracao'); }, () => {});
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
    // registro de qualquer ação do app (propostas, baixas, documentos, pedidos, alertas): não exige acesso ao cadastro
    R.log = async (entry) => { try { await log(entry); } catch (e) { /* sem permissão de gravar: segue */ } };
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
    const INS_FIELDS = [['fam', 'Família'], ['produto', 'Produto'], ['fab', 'Fabricante'], ['tipo', 'Tipo/config.'], ['valor', 'Valor'], ['origem', 'Origem'], ['obs', 'Observações'],
      // REV22: ficha técnica e governança (campos opcionais; registros da REV21 continuam válidos sem eles)
      ['situacao', 'Situação'], ['codFab', 'Código do fabricante'], ['caract', 'Características'], ['descCom', 'Descrição comercial'], ['descFab', 'Descrição do fabricante'],
      ['excecao', 'Exceção ao padrão'], ['substituto', 'Substituto'], ['fonte', 'Origem do preço'], ['dataCot', 'Data da cotação'], ['forn', 'Fornecedores'], ['equiv', 'Equivalentes'], ['cert', 'Certificação (UL/FM)']];
    R.INS_FIELDS = INS_FIELDS;
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
      // data da última atualização do preço: muda só quando o valor muda (editar outro campo não "renova" o preço)
      const mudouPreco = before ? before.valor !== rec.valor : typeof rec.valor === 'number';
      body.precoEm = mudouPreco ? body.upd : before ? (before.precoEm || before.upd || 'planilha') : undefined; if (!body.precoEm) delete body.precoEm; // 'planilha': preço sem data conhecida
      const mud = diff(before, rec, INS_FIELDS);
      if (!isNew && !mud.length) return false; let colidiu = false;
      if (R.mode === 'shared') {
        if (before && famCode(before.fam) !== famCode(rec.fam)) await mutate(famDoc(before.fam), (d) => { if (d.itens) delete d.itens[rec.id]; return d; });
        await mutate(famDoc(rec.fam), (d) => { d.fam = d.fam || rec.fam; d.itens = d.itens || {};
          // código já gravado por outra pessoa (cadastro simultâneo): pega o próximo livre da família, nunca grava por cima
          if (isNew && d.itens[rec.id]) { const bs = Object.keys(d.itens).map((k) => +String(k).split('-')[1]).filter((x) => x > 0).concat(R.insumos.filter((x) => x.a === rec.a).map((x) => x.b)); const b = Math.max(...bs) + 1; rec.b = b; rec.id = R.newInsumoId(rec.a, b); body.b = b; colidiu = true; }
          d.itens[rec.id] = body; return d; });
      }
      else { R.insumos = before ? R.insumos.map((x) => x.id === rec.id ? Object.assign({ id: rec.id }, body) : x) : R.insumos.concat([Object.assign({ id: rec.id }, body)]); saveLocal(); changed('insumos'); }
      await log({ tipo: isNew ? 'Insumo novo' : 'Insumo', ref: rec.id, desc: rec.produto + (colidiu ? ' (código ajustado: o anterior foi usado por outra pessoa ao mesmo tempo)' : ''), mudancas: mud });
      return colidiu ? { id: rec.id, colidiu: true } : true;
    };
    // edição em lote (edição em massa, consolidação): grava por família, registra de/para de cada campo e devolve o lote para desfazer
    R.saveInsumosLote = async (changes, desc, tipo) => {
      guard(); const at = new Date().toISOString(); const byFam = new Map(); const mud = [];
      for (const c of changes) { const rec = R.insumos.find((x) => x.id === c.id); if (!rec) continue; if (!byFam.has(rec.fam)) byFam.set(rec.fam, []); byFam.get(rec.fam).push([c, rec]);
        // preço alterado no lote: grava a data da atualização (e a anterior, para o desfazer voltar as duas)
        if ('valor' in c.campos && !('precoEm' in c.campos) && c.campos.valor !== rec.valor) { c.campos.precoEm = at; c.de = c.de || {}; c.de.precoEm = rec.precoEm || rec.upd || null; } }
      const lote = 'L' + Date.now().toString(36);
      for (const [fam, list] of byFam) {
        const upd = (it, c) => { for (const [k, v] of Object.entries(c.campos)) { if (v === null || v === '' || v === undefined) delete it[k]; else it[k] = JSON.parse(JSON.stringify(v)); } it.upd = at; if (R.me) it.updBy = R.me; };
        if (R.mode === 'shared') await mutate(famDoc(fam), (d) => { d.itens = d.itens || {}; for (const [c] of list) if (d.itens[c.id]) upd(d.itens[c.id], c); return d; });
        else for (const [c, rec] of list) upd(rec, c);
        for (const [c, rec] of list) for (const [k, v] of Object.entries(c.campos)) mud.push({ campo: c.id + ' · ' + k, de: c.de ? c.de[k] ?? null : null, para: v ?? null, id: c.id, k });
      }
      if (R.mode === 'local') { R.insumos = R.insumos.slice(); saveLocal(); changed('insumos'); }
      await log({ tipo: tipo || 'Edição em massa', ref: lote, desc: desc || changes.length + ' insumo(s)', mudancas: mud });
      return { lote, n: changes.length };
    };
    // desfazer um lote (edição em massa ou importação): só volta o que ainda está como o lote deixou
    R.desfazerLote = async (h) => {
      guard(); const volta = []; const conflito = [];
      for (const m of h.mudancas || []) {
        let id = m.id, k = m.k; if (!id) { const mm = /^(\d{2}-\d+)/.exec(String(m.campo)); if (!mm) continue; id = mm[1]; k = 'valor'; }
        const rec = R.insumos.find((x) => x.id === id); if (!rec) { conflito.push(id); continue; }
        if (JSON.stringify(rec[k] ?? null) !== JSON.stringify(m.para ?? null)) { conflito.push(id); continue; }
        let c = volta.find((x) => x.id === id); if (!c) { c = { id, campos: {}, de: {} }; volta.push(c); } c.campos[k] = m.de ?? null; c.de[k] = m.para ?? null;
      }
      if (volta.length) await R.saveInsumosLote(volta, 'Desfeito: ' + (h.desc || h.tipo), 'Desfazer lote');
      return { n: volta.length, conflito };
    };
    R.deleteInsumo = async (id) => {
      guard(); const before = R.insumos.find((x) => x.id === id); if (!before) return;
      if (R.mode === 'shared') await mutate(famDoc(before.fam), (d) => { if (d.itens) delete d.itens[id]; return d; });
      else { R.insumos = R.insumos.filter((x) => x.id !== id); saveLocal(); changed('insumos'); }
      await log({ tipo: 'Insumo excluído', ref: id, desc: before.produto, mudancas: [{ campo: 'Valor', de: before.valor ?? null, para: null }] });
    };
    R.newInsumoId = (a, b) => String(a).padStart(2, '0') + '-' + b;
    // renomear família: troca o nome em todos os insumos dela (o código nn não muda)
    R.renameFamily = async (oldFam, newFam) => {
      guard();
      if (famCode(oldFam) !== famCode(newFam)) throw new Error('O código da família não muda; troque só o nome.');
      const n = R.insumos.filter((x) => x.fam === oldFam).length;
      if (R.mode === 'shared') await mutate(famDoc(oldFam), (d) => { d.fam = newFam; for (const it of Object.values(d.itens || {})) if (it.fam === oldFam) it.fam = newFam; return d; });
      else { R.insumos = R.insumos.map((x) => x.fam === oldFam ? Object.assign({}, x, { fam: newFam }) : x); saveLocal(); changed('insumos'); }
      await log({ tipo: 'Família', ref: oldFam, desc: 'Renomeada para ' + newFam + ' (' + n + ' insumos)', mudancas: [{ campo: 'Família', de: oldFam, para: newFam }] });
    };

    // padronização: troca nome, fabricante e tipo de vários insumos de uma vez e acompanha os kits com o mesmo nome
    R.renameInsumos = async (changes, desc, onProgress) => {
      guard(); const at = new Date().toISOString(); const byFam = new Map(); const mud = []; const ren = {};
      for (const c of changes) { const rec = R.insumos.find((x) => x.id === c.id); if (!rec) continue; if (!byFam.has(rec.fam)) byFam.set(rec.fam, []); byFam.get(rec.fam).push([c, rec]); }
      let done = 0;
      for (const [fam, list] of byFam) {
        const upd = (it, c) => { if (c.produto) it.produto = c.produto; if (c.fab) it.fab = c.fab; if (c.tipo) it.tipo = c.tipo; if (c.obs !== undefined) it.obs = c.obs; it.upd = at; if (R.me) it.updBy = R.me; };
        if (R.mode === 'shared') await mutate(famDoc(fam), (d) => { d.itens = d.itens || {}; for (const [c] of list) if (d.itens[c.id]) upd(d.itens[c.id], c); return d; });
        else for (const [c, rec] of list) upd(rec, c);
        for (const [c, rec] of list) { if (c.produto && c.produto !== c.de) ren[c.de] = c.produto; mud.push({ campo: c.id, de: c.de, para: c.produto + (c.fab ? ' · ' + c.fab : '') + (c.tipo ? ' · ' + c.tipo : '') }); }
        done += list.length; onProgress && onProgress(done, changes.length);
      }
      // kits com a mesma descrição do insumo
      for (const kind of ['motor', 'bomba']) {
        const hit = kitList(kind).filter((k) => ren[k.desc]); if (!hit.length) continue;
        if (R.mode === 'shared') await mutate('kits/' + kind, (d) => { for (const k of hit) if (d.itens && d.itens[k.id]) { d.itens[k.id].desc = ren[k.desc]; d.itens[k.id].upd = at; } return d; });
        else { const nl = kitList(kind).map((k) => ren[k.desc] ? Object.assign({}, k, { desc: ren[k.desc], upd: at }) : k); if (kind === 'motor') R.kitMotor = nl; else R.kitBomba = nl; }
      }
      if (R.mode === 'local') { R.insumos = R.insumos.slice(); saveLocal(); changed('insumos'); }
      await log({ tipo: 'Padronização de descrições', ref: 'padrao', desc: desc || changes.length + ' insumo(s)', mudancas: mud });
      return ren;
    };

    // ---- kits ----
    const kitList = (kind) => (kind === 'motor' ? R.kitMotor : R.kitBomba);
    R.saveKit = async (kind, rec, isNew) => {
      guard();
      const list = kitList(kind); const lim = kind === 'motor' ? LIMITS.kitMotor : LIMITS.kitBomba;
      if (isNew && list.length >= lim) throw new Error('Não há linha livre na aba KIT ' + (kind === 'motor' ? 'MOTORES DIESEL' : 'BOMBA') + ' (limite de ' + lim + ').');
      const before = list.find((x) => x.id === rec.id) || null;
      const labels = kind === 'motor' ? KMD_LABELS : KB_LABELS;
      const mud = diff(before, rec, [['desc', 'Descrição'], ['tipo', 'Origem'], ['marca', 'Marca'], ['cert', 'Certificação (UL/FM)']]);
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
    // tabela própria do app (configuração SPV, famílias de produto): grava o conteúdo inteiro e registra só o que mudou
    R.setTable = async (sheet, cells, desc, mudancas) => {
      guard();
      if (R.mode === 'shared') await R.db.doc('tabelas/' + slug(sheet)).set(JSON.parse(JSON.stringify({ sheet, cells })));
      else { R.tabelas = Object.assign({}, R.tabelas, { [sheet]: cells }); saveLocal(); changed('tabelas'); }
      await log({ tipo: 'Cadastro ' + sheet, ref: sheet, desc, mudancas: mudancas || [] });
    };
    R.resetSheet = async (sheet) => {
      guard();
      if (R.mode === 'shared') await R.db.doc('tabelas/' + slug(sheet)).set({ sheet, cells: {} });
      else { R.tabelas = Object.assign({}, R.tabelas); delete R.tabelas[sheet]; saveLocal(); changed('tabelas'); }
      await log({ tipo: 'Tabela ' + sheet, ref: sheet, desc: 'Voltou aos valores da planilha', mudancas: [] });
    };

    // ---- importação de preços em lote ----
    R.applyPrices = async (changes, fonte, onProgress) => {
      guard(); let done = 0; const ok = [], datas = []; const at = new Date().toISOString();
      const byFam = new Map();
      for (const c of changes) { const rec = R.insumos.find((x) => x.id === c.id); if (!rec) continue; if (!byFam.has(rec.fam)) byFam.set(rec.fam, []); byFam.get(rec.fam).push([c, rec]); }
      for (const [fam, list] of byFam) {
        if (R.mode === 'shared') {
          await mutate(famDoc(fam), (d) => { d.itens = d.itens || {}; for (const [c] of list) if (d.itens[c.id]) { d.itens[c.id].valor = c.para; d.itens[c.id].upd = at; d.itens[c.id].precoEm = at; if (R.me) d.itens[c.id].updBy = R.me; } return d; });
        }
        for (const [c, rec] of list) { datas.push({ campo: c.id + ' · data do preço', de: rec.precoEm || rec.upd || null, para: at, id: c.id, k: 'precoEm' }); ok.push({ campo: c.id + ' · ' + rec.produto, de: c.de ?? null, para: c.para }); }
        if (R.mode !== 'shared') for (const [c, rec] of list) { rec.valor = c.para; rec.upd = at; rec.precoEm = at; }
        done += list.length; onProgress && onProgress(done, changes.length);
      }
      if (R.mode === 'local') { R.insumos = R.insumos.slice(); saveLocal(); changed('insumos'); }
      await log({ tipo: 'Importação de preços', ref: 'import', desc: fonte + ' — ' + ok.length + ' preço(s)', mudancas: ok.concat(datas) });
      return ok.length;
    };

    // ---- numeração e máscaras (séries por tipo de documento) ----
    // Configuração: só o administrador (no banco, meta/ só aceita gravação de Editor/dono). Nenhuma série vem ligada e
    // nada é renumerado: a série só vale para números gerados depois que o administrador a liga.
    // Reserva sem colisão: trava curta no contador da série (acquire), cada número vira um registro próprio
    // (propostas/_numeracao/numeros/<número>) que só é gravado se ainda não existir, e números já usados em propostas
    // salvas são pulados. Número reservado nunca é reaproveitado, mesmo que a proposta seja excluída.
    R.NUM_SERIES = { seq: 'Proposta SEQ', spv: 'Proposta SPV' };
    R.NUM_PADRAO = { seq: { prefixo: 'SEQ-', anual: true, formatoAno: 'AAAA', sepAno: '-', posicoes: 5, sufixo: '', inicio: 1, ativa: false, bloqueio: false },
      spv: { prefixo: 'SPV-', anual: true, formatoAno: 'AAAA', sepAno: '-', posicoes: 5, sufixo: '', inicio: 1, ativa: false, bloqueio: false } };
    R.numCfg = ls.get('lspricer.numeracao', {}) || {};
    R.serieCfg = (k) => Object.assign({}, R.NUM_PADRAO[k] || {}, (R.numCfg || {})[k] || {});
    R.formatarNumero = (cfg, n, ano) => { const a = String(ano || new Date().getFullYear()); return String(cfg.prefixo || '') + (cfg.anual ? (cfg.formatoAno === 'AA' ? a.slice(-2) : a) + String(cfg.sepAno ?? '-') : '') + String(n).padStart(Math.max(1, Math.min(12, +cfg.posicoes || 1)), '0') + String(cfg.sufixo || ''); };
    R.salvarNumeracao = async (series, desc) => {
      if (!R.ehAdmin()) throw new Error('Só o administrador configura a numeração e as máscaras.');
      for (const [k, c] of Object.entries(series)) { if (!R.NUM_SERIES[k]) throw new Error('Série desconhecida: ' + k); if (!(+c.posicoes >= 1 && +c.posicoes <= 12)) throw new Error('Posições do sequencial: de 1 a 12.'); if (!(+c.inicio >= 1)) throw new Error('O sequencial começa em 1 ou mais.'); if (/[\/\\#?]/.test(String(c.prefixo || '') + String(c.sufixo || '') + String(c.sepAno || ''))) throw new Error('Prefixo, separador e sufixo não aceitam / \\ # ?'); }
      const antes = JSON.parse(JSON.stringify(R.numCfg || {}));
      if (R.mode === 'shared') await R.db.doc('meta/numeracao').set({ series: JSON.parse(JSON.stringify(series)), upd: new Date().toISOString(), by: R.me || null });
      else { ls.set('lspricer.numeracao', series); }
      R.numCfg = JSON.parse(JSON.stringify(series)); changed('numeracao');
      await log({ tipo: 'Numeração', ref: 'numeracao', desc: desc || 'Séries de numeração alteradas', mudancas: Object.keys(series).map((k) => ({ campo: R.NUM_SERIES[k], de: antes[k] ? JSON.stringify(antes[k]) : null, para: JSON.stringify(series[k]) })) });
    };
    const slugNum = (n) => String(n).replace(/[^A-Za-z0-9_.~:@+-]/g, '_').slice(0, 180) || '_';
    const numUsadoEmProposta = (numero, propId) => R.todasPropostas().some((p) => p.id !== propId && !p.excluida && String(p.numero || '').trim().toUpperCase() === String(numero).trim().toUpperCase());
    R.numerosReservados = async (k) => {
      if (R.mode !== 'shared') return Object.values(ls.get('lspricer.numeros', {})).filter((x) => !k || x.serie === k).sort((a, b) => String(b.at).localeCompare(String(a.at)));
      const q = await R.db.collection('propostas/_numeracao/numeros').orderBy('at', 'desc').limit(50).get(); return q.docs.map((d) => d.data()).filter((x) => !k || x.serie === k);
    };
    R.reservarNumero = async (k, propId) => {
      const cfg = R.serieCfg(k); if (!R.NUM_SERIES[k]) throw new Error('Série desconhecida.'); if (!cfg.ativa) throw new Error('A série "' + R.NUM_SERIES[k] + '" não está ligada. O administrador liga em Administração → Numeração e máscaras.');
      if (R.mode === 'shared' && !R.canSaveShared) throw new Error('Sem permissão para gravar propostas: não dá para reservar um número.');
      const ano = new Date().getFullYear(); const chave = k + (cfg.anual ? '-' + ano : '');
      const at = new Date().toISOString();
      if (R.mode !== 'shared') {
        const cont = ls.get('lspricer.numcont', {}); const slots = ls.get('lspricer.numeros', {}); let n = Math.max(+cont[chave] || 0, +cfg.inicio || 1);
        for (let i = 0; i < 500; i++, n++) { const numero = R.formatarNumero(cfg, n, ano); if (slots[slugNum(numero)] || numUsadoEmProposta(numero, propId)) continue;
          slots[slugNum(numero)] = { numero, serie: k, at, by: null, propId: propId || null }; cont[chave] = n + 1; ls.set('lspricer.numeros', slots); ls.set('lspricer.numcont', cont);
          await log({ tipo: 'Número reservado', ref: numero, desc: R.NUM_SERIES[k] + ': ' + numero, mudancas: [] }); return numero; }
        throw new Error('Não achei número livre na série.');
      }
      // trava por chamada (mesmo usuário em duas abas também não divide a trava)
      const holder = (R.me || 'anon') + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const contRef = R.db.doc('propostas/_numeracao/series/' + chave);
      // espera a trava de quem está gerando agora (ela expira sozinha; quem termina a encurta para 1 s), por até ~20 s
      let ok = false; const t0 = Date.now();
      while (!ok && Date.now() - t0 < 20000) { const r = await contRef.acquire({ holder, ttlMs: 5000 }); ok = !!(r && r.acquired);
        if (!ok) { const ate = r && r.expiresAt ? Date.parse(r.expiresAt) - Date.now() : 600; await new Promise((res) => setTimeout(res, Math.max(150, Math.min(ate, 1500)) + Math.random() * 250)); } }
      if (!ok) throw new Error('Outra pessoa está gerando um número desta série agora. Tente de novo em alguns segundos.');
      const c = await contRef.get(); let n = Math.max(+((c.exists && c.data().prox) || 0), +cfg.inicio || 1);
      for (let i = 0; i < 200; i++, n++) {
        const numero = R.formatarNumero(cfg, n, ano); if (numUsadoEmProposta(numero, propId)) continue;
        // o registro do número também é reservado com trava e só é gravado se ainda não existir
        const slot = R.db.doc('propostas/_numeracao/numeros/' + slugNum(numero)); const sl = await slot.acquire({ holder, ttlMs: 8000 }); if (!(sl && sl.acquired)) continue; const sx = await slot.get(); if (sx.exists) continue;
        await slot.set({ numero, serie: k, at, by: R.me || null, propId: propId || null });
        await contRef.set({ prox: n + 1, serie: k, ano: cfg.anual ? ano : null, upd: at, by: R.me || null });
        try { await contRef.acquire({ holder, ttlMs: 1000 }); } catch (e) { /* a trava expira sozinha */ }
        await log({ tipo: 'Número reservado', ref: numero, desc: R.NUM_SERIES[k] + ': ' + numero, mudancas: [] });
        return numero;
      }
      throw new Error('Não achei número livre na série (200 tentativas). Confira a configuração.');
    };
    // número digitado já usado em outra proposta salva (aviso, ou bloqueio se a série pedir)
    R.numeroDuplicado = (numero, propId) => !!String(numero || '').trim() && numUsadoEmProposta(numero, propId);

    // ---- áreas responsáveis: quem pode editar cada parte do cadastro ----
    // Sem ninguém atribuído, vale a regra antiga (todo Editor edita tudo). O dono do app edita sempre.
    R.acessos = {};
    // as chaves ap_* são os aprovadores de desconto, não travam o cadastro
    R.areasConfiguradas = () => Object.entries(R.acessos || {}).some(([k, l]) => !/^(ap|svc)_/.test(k) && l && l.length);
    R.areaOk = (area) => {
      if (R.mode === 'local') return true;
      if (!R.canEditCadastro) return false;
      if (R.isOwner || !area || !R.areasConfiguradas()) return true;
      return ((R.acessos || {})[area] || []).includes(R.me);
    };
    R.minhasAreas = () => Object.entries(R.acessos || {}).filter(([k, l]) => !/^(ap|svc)_/.test(k) && (l || []).includes(R.me)).map(([a]) => a);
    R.setAcessos = async (areas, desc) => {
      if (R.mode !== 'shared') throw new Error('As áreas responsáveis valem só no app compartilhado.');
      if (!R.isOwner) throw new Error('Só o dono do app define quem cuida de cada área.');
      await R.db.doc('meta/acessos').set({ areas: JSON.parse(JSON.stringify(areas)), upd: new Date().toISOString(), by: R.me || null });
      await log({ tipo: 'Acessos', ref: 'acessos', desc: desc || 'Áreas responsáveis alteradas', mudancas: [] });
    };

    // ---- propostas ----
    // excluir: ninguém apaga direto. A proposta vai para a lixeira (dá para restaurar) e só o administrador apaga de vez.
    // Quem pode mandar para a lixeira: o administrador (dono do app; neste navegador, quem usa) ou quem criou a proposta, enquanto rascunho.
    R.listPropostas = () => R.todasPropostas().filter((p) => !p.excluida);
    R.lixeira = () => R.todasPropostas().filter((p) => p.excluida);
    R.ehAdmin = () => R.mode === 'local' || !!R.isOwner;
    R.podeExcluir = (p) => R.ehAdmin() || (!!R.canSaveShared && (p.status || 'rascunho') === 'rascunho' && !!p.criadaPor && p.criadaPor === R.me);
    R.moverLixeira = async (p, motivo) => {
      if (!R.podeExcluir(p)) throw new Error('Só o administrador ou quem criou o rascunho pode excluir esta proposta.');
      return R.patchProposta(p.id, (r) => { r.excluida = { at: new Date().toISOString(), by: R.me || null, motivo: motivo || '' }; });
    };
    R.restaurarLixeira = async (p) => { if (!R.ehAdmin() && !(p.excluida && p.excluida.by === R.me)) throw new Error('Só o administrador ou quem excluiu pode restaurar.'); return R.patchProposta(p.id, (r) => { delete r.excluida; }); };
    // banco compartilhado: a lista ao vivo traz as 300 mais recentes; "carregar todas" busca até 1.000 de uma vez e junta
    // as mais antigas (as recentes continuam atualizando ao vivo). Os indicadores usam o que estiver carregado e avisam do limite.
    R.propostasAntigas = null;
    R.propostasNoLimite = () => R.mode === 'shared' && !!R.propostas && R.propostas.length >= 300 && !R.propostasAntigas;
    R.carregarTodasPropostas = async () => { if (R.mode !== 'shared') return R.todasPropostas().length; const q = await R.db.collection('propostas').orderBy('at', 'desc').limit(1000).get(); R.propostasAntigas = q.docs.map((d) => Object.assign({ id: d.id }, d.data())); changed('propostas'); return R.todasPropostas().length; };
    R.todasPropostas = () => { if (R.mode === 'shared' && R.propostas) { if (!R.propostasAntigas) return R.propostas; const vivos = new Set(R.propostas.map((p) => p.id)); return R.propostas.concat(R.propostasAntigas.filter((p) => !vivos.has(p.id))).sort((a, b) => String(b.at).localeCompare(String(a.at))); }
      return Object.entries(ls.get(LS.saved, {})).map(([id, p]) => Object.assign({ id, local: true }, p)).sort((a, b) => String(b.at).localeCompare(String(a.at))); };
    // gravação com versão: 'ver' sobe a cada gravação; 'verDoc' só quando o conteúdo (editor) muda.
    // O editor informa a versão que abriu (base): se outra pessoa gravou o conteúdo antes, é conflito — nunca sobrescreve calado.
    // Status, etapas e conferência gravam por patch: relê o registro atual, aplica só a mudança, grava e confere.
    const emShared = () => R.mode === 'shared' && R.canSaveShared;
    R.lerProposta = async (id) => {
      if (emShared()) { const d = await R.db.doc('propostas/' + id).get(); return d.exists ? JSON.parse(JSON.stringify(d.data())) : null; }
      const x = ls.get(LS.saved, {})[id]; return x ? JSON.parse(JSON.stringify(x)) : null;
    };
    async function gravarConferido(id, body) {
      if (emShared()) {
        const b = clean(Object.assign({}, body, { by: R.me || undefined })); await R.db.doc('propostas/' + id).set(b);
        const v = await R.db.doc('propostas/' + id).get();
        if (!v.exists || (v.data() || {}).ver !== b.ver) { const e = new Error('O banco não confirmou a gravação (outra gravação chegou junto). Tente salvar de novo.'); e.code = 'nao_confirmado'; throw e; }
        return 'shared';
      }
      const saved = ls.get(LS.saved, {}); saved[id] = body;
      if (!ls.set(LS.saved, saved)) { const e = new Error('O navegador não deixou gravar (sem espaço ou bloqueado). Baixe um backup em Configurações → Backup e restauração e libere espaço.'); e.code = 'armazenamento'; throw e; }
      if (((ls.get(LS.saved, {})[id]) || {}).ver !== body.ver) { const e = new Error('A gravação neste navegador não se confirmou. Tente de novo.'); e.code = 'nao_confirmado'; throw e; }
      return 'local';
    }
    R.ultimaVersao = {};
    // Trava da proposta durante a gravação (banco compartilhado): duas pessoas salvando no mesmo instante passavam as duas
    // pela conferência de versão e a primeira gravação sumia. Com a trava, uma espera a outra terminar e a segunda vê o
    // conflito de versão (e pode comparar e escolher), em vez de apagar a primeira sem aviso.
    async function comTrava(id, fn) {
      if (!emShared()) return fn();
      const ref = R.db.doc('propostas/' + id); if (typeof ref.acquire !== 'function') return fn();
      const holder = (R.me || 'anon') + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      let ok = false; const t0 = Date.now();
      while (!ok && Date.now() - t0 < 15000) {
        let r; try { r = await ref.acquire({ holder, ttlMs: 10000 }); } catch (e) { return fn(); } // banco sem trava: segue como antes
        ok = !!(r && r.acquired);
        if (!ok) { const ate = r && r.expiresAt ? Date.parse(r.expiresAt) - Date.now() : 600; await new Promise((res) => setTimeout(res, Math.max(150, Math.min(ate, 1500)) + Math.random() * 250)); }
      }
      if (!ok) { const e = new Error('Outra pessoa está salvando esta proposta agora. Tente de novo em alguns segundos.'); e.code = 'ocupado'; throw e; }
      try { return await fn(); } finally { try { await ref.acquire({ holder, ttlMs: 1000 }); } catch (e) { /* a trava vence sozinha */ } }
    }
    R.saveProposta = (id, p, opts = {}) => comTrava(id, () => salvarProposta(id, p, opts));
    async function salvarProposta(id, p, opts) {
      const cur = await R.lerProposta(id);
      if (opts.base !== undefined && opts.base !== null && cur && (cur.verDoc || 0) !== opts.base) { const e = new Error('Outra pessoa salvou esta proposta enquanto você editava.'); e.code = 'conflito'; e.remoto = cur; throw e; }
      const body = JSON.parse(JSON.stringify(p)); delete body.id; delete body.local;
      if (opts.ajustar) opts.ajustar(body, cur);
      body.ver = (cur ? cur.ver || 0 : 0) + 1; body.verDoc = opts.editor ? (cur ? cur.verDoc || 0 : 0) + 1 : (cur ? cur.verDoc || 0 : body.verDoc || 0);
      const onde = await gravarConferido(id, body); R.ultimaVersao[id] = { ver: body.ver, verDoc: body.verDoc };
      if (R.mode === 'shared' && R.propostas) { const i = R.propostas.findIndex((x) => x.id === id); const rec = Object.assign({ id }, body, { by: R.me || body.by }); if (i >= 0) R.propostas[i] = rec; }
      return onde;
    }
    R.patchProposta = (id, mut) => comTrava(id, async () => {
      for (let t = 0; t < 3; t++) {
        const cur = await R.lerProposta(id); if (!cur) throw new Error('Proposta não encontrada.');
        const body = JSON.parse(JSON.stringify(cur)); if (typeof mut === 'function') mut(body); else Object.assign(body, mut);
        body.ver = (cur.ver || 0) + 1; body.verDoc = cur.verDoc || 0;
        try { await gravarConferido(id, body); R.ultimaVersao[id] = { ver: body.ver, verDoc: body.verDoc }; if (R.mode === 'local') changed('propostas'); return body; }
        catch (e) { if (e.code !== 'nao_confirmado' || t === 2) throw e; }
      }
    });
    R.deleteProposta = async (id, isLocal) => {
      if (!R.ehAdmin()) throw new Error('Só o administrador apaga uma proposta de vez.');
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
      // o salvar do claude.ai TRANSFERE um ArrayBuffer (ele fica vazio para quem chamou): vai uma cópia em Blob,
      // para o mesmo conteúdo poder ser guardado nos documentos e embutido na versão interativa depois do download
      const dado = data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? new Blob([data], { type: mime || 'application/octet-stream' }) : data;
      if (R.downloads) { for (let k = 0; k < 4; k++) { try { await R.downloads.save({ filename, data: dado }); return true; } catch (e) { if (e && e.code === 'declined') return false; if (e && e.code === 'rate_limited' && k < 3) { await new Promise((ok) => setTimeout(ok, 1500)); continue; } break; } } }
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
      // NCM e unidade de cada item vêm do cadastro por família (Fiscal); a proposta não escolhe mais
      const ff = Object.assign({}, R.FISCAL_FAM_PADRAO, ((R.tabelas || {}).FISCAL_FAM || {}).map || {});
      const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
      const fams = Object.entries(ff).filter(([, v]) => v && (v.ncm || v.unid));
      for (let i = 1; i <= 10; i++) {
        const s = wb.sheet('ITEM ' + String(i).padStart(2, '0')); if (!s) continue;
        const ncm = fams.filter(([, v]) => v.ncm).reduceRight((acc, [f, v]) => `IF($C$21=${q(f)},${q(v.ncm)},${acc})`, 'PROP_NCM');
        const un = fams.filter(([, v]) => v.unid).reduceRight((acc, [f, v]) => `IF($C$21=${q(f)},${q(v.unid)},${acc})`, 'IF(PROP_UNIDADE="","CJ",PROP_UNIDADE)');
        // bomba centrífuga de vazão até 300 l/min (18 m³/h) é 8413.70.80 na TIPI (IPI 3,25%), não 8413.70.90; AR4 = vazão nominal da bomba principal em gpm (×0,2271247 = m³/h)
        const ncmV = `IF(AND($AR$4>0,$AR$4*0.2271247<=18,(${ncm})="8413.70.90"),"8413.70.80",${ncm})`;
        s.cells.set('G7', '=' + ncmV); s.cells.set('H21', '=IF($C$21="","",' + un + ')');
      }
      wb.invalidate();
    };
    // ponto de partida até o Fiscal confirmar cada família
    R.FISCAL_FAM_PADRAO = { 'CONJUNTO MOTOBOMBA': { ncm: '8413.70.90', unid: 'CJ' }, SKID: { ncm: '8413.70.90', unid: 'CJ' }, CONTAINER: { ncm: '8413.70.90', unid: 'CJ' }, ESPECIAL: { ncm: '8413.70.90', unid: 'CJ' }, 'BOMBA JOCKEY + PAINEL': { ncm: '8413.70.80', unid: 'CJ' } };
    R.helpers = { KMD_COLS, KB_COLS, KMD_LABELS, KB_LABELS, LIMITS, kmdTotals, kbTotals, famCode, sortIns, sortKit, slug };
    return R;
  }

  window.PricerRegistry = { Registry, baseFromModel };
})();
