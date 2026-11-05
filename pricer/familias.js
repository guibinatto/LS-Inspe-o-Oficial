/* LS Pricer — campos técnicos por família e descrição padronizada.
   Cada família pode ter campos próprios (tipo, unidade, obrigatório, opções) e um modelo de descrição.
   O modelo segue o padrão que as fórmulas da planilha leem (docs/padroes-descricoes.md): a descrição gerada
   é exatamente o texto que a planilha procura. Nada é convertido (CV continua CV, HP continua HP) e nada é
   inventado: campo opcional vazio simplesmente sai da descrição.
   O padrão de cada família pode ser ajustado em Cadastro → Cadastro geral → Campos por família, sem mexer no código.

   Modelo: {campo} é trocado pelo valor; [ ... ] é um trecho opcional que some quando algum campo dentro dele está vazio. */
(function () {
  'use strict';
  const up = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = (s) => semAcento(up(s)).replace(/[^A-Z0-9,./@+-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const famCode = (fam) => parseInt(String(fam || '').split('.')[0], 10) || 0;
  // número no formato do cadastro: vírgula decimal, sem milhar ("0,5", "12,5", "483")
  const fmtNum = (v) => { const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return ''; const n = Number(s.replace(/\./g, '').replace(',', '.')); return isFinite(n) && /^[\d.,]+$/.test(s) ? String(n).replace('.', ',') : up(s); };

  // padrões da REV21 (docs/padroes-descricoes.md e pedidos de cadastro), agora com os campos opcionais do documento
  const PADRAO = {
    1: { nome: 'Motor diesel', modelo: '{modelo} {hp}HP@{rpm}RPM {cil}CIL {vcc} {arref}[ {ctrl}]',
      campos: [{ k: 'modelo', lb: 'Modelo (como no catálogo)', tipo: 'texto', req: true, ex: '6M16G308/6' }, { k: 'hp', lb: 'Potência', tipo: 'numero', un: 'HP', req: true, ex: '483' },
        { k: 'rpm', lb: 'Rotação', tipo: 'numero', un: 'RPM', req: true, ex: '1800' }, { k: 'cil', lb: 'Cilindros', tipo: 'numero', req: true, ex: '6' }, { k: 'vcc', lb: 'Tensão', tipo: 'lista', ops: ['24VCC', '12VCC'], req: true },
        { k: 'arref', lb: 'Arrefecimento', tipo: 'lista', ops: ['RADIADOR', 'TROCADOR DE CALOR'], req: true, minusc: true }, { k: 'ctrl', lb: 'Controle', tipo: 'lista', ops: ['MEC', 'ELE'], req: false }],
      ok: /^\S+ \d+(,\d+)?HP@\d+RPM \d+CIL (12|24)VCC (RADIADOR|TROCADOR)/ },
    10: { nome: 'Motor elétrico', modelo: 'MOTOR {cv}CV {polos} IP55 {tensao}[ {freq}][ {ie}] {marca} {mont}',
      campos: [{ k: 'cv', lb: 'Potência', tipo: 'numero', un: 'CV', req: true, ex: '60' }, { k: 'polos', lb: 'Polos', tipo: 'lista', ops: ['2P', '4P', '6P'], req: true },
        { k: 'tensao', lb: 'Tensão', tipo: 'lista', ops: ['220/380/440V', '380/660V', '660V'], req: true }, { k: 'freq', lb: 'Frequência (só se não for 60 Hz)', tipo: 'lista', ops: ['50HZ'], req: false },
        { k: 'ie', lb: 'Rendimento', tipo: 'lista', ops: ['IE2'], req: false }, { k: 'marca', lb: 'Marca', tipo: 'lista', ops: ['WEG', 'ABB', 'SEW'], req: true }, { k: 'mont', lb: 'Montagem', tipo: 'lista', ops: ['MANCAL', 'MONOBLOCO'], req: true, minusc: true }],
      ok: /^MOTOR \d+(,\d+)?CV [246]P IP55 \S+( 50HZ)?( IE2)? \S+ (MANCAL|MONOBLOCO)$/ },
    11: { nome: 'Bomba de eixo livre', modelo: '{modelo}[ @{rpm}RPM]',
      campos: [{ k: 'modelo', lb: 'Série e modelo (notação do catálogo)', tipo: 'texto', req: true, ex: 'TKF 125-400 EFF · SCE 150-315 · IS 080X065X250' }, { k: 'rpm', lb: 'Rotação (só quando o catálogo cita)', tipo: 'numero', un: 'RPM', req: false }],
      ok: /^\S+/ },
    12: { nome: 'Motobomba', modelo: '{bomba} C/ MOTOR {acion}[ {marca}][ {motor}] {pot}{unid}[ {polos}][ @{rpm}RPM][ {extras}][ {cert}]',
      campos: [{ k: 'bomba', lb: 'Modelo da bomba', tipo: 'texto', req: true, ex: 'TKF-M 65-200' }, { k: 'acion', lb: 'Acionamento', tipo: 'lista', ops: ['ELÉTRICO', 'DIESEL'], req: true, minusc: true },
        { k: 'marca', lb: 'Marca do motor', tipo: 'texto', req: false, ex: 'WEG' }, { k: 'motor', lb: 'Modelo do motor', tipo: 'texto', req: false }, { k: 'pot', lb: 'Potência', tipo: 'numero', req: true, ex: '75' },
        { k: 'unid', lb: 'Unidade da potência (como o fabricante cota)', tipo: 'lista', ops: ['HP', 'CV', 'KW'], req: true }, { k: 'polos', lb: 'Polos', tipo: 'lista', ops: ['2P', '4P', '6P'], req: false },
        { k: 'rpm', lb: 'Rotação', tipo: 'numero', un: 'RPM', req: false }, { k: 'extras', lb: 'Extras (TRIF, IR3, TIER 3…)', tipo: 'texto', req: false }, { k: 'cert', lb: 'Certificação', tipo: 'lista', ops: ['UL/FM'], req: false }],
      ok: /C\/ MOTOR (ELÉTRICO|DIESEL)/ },
    13: { nome: 'Bomba jockey', modelo: '{modelo} {pot}{unid} {fase}[ {freq}][ {tensao}][ {ip}][ {painel}]',
      campos: [{ k: 'modelo', lb: 'Modelo', tipo: 'texto', req: true, ex: 'BT4-0505E7' }, { k: 'pot', lb: 'Potência', tipo: 'numero', req: true, ex: '0,5' }, { k: 'unid', lb: 'Unidade', tipo: 'lista', ops: ['CV', 'HP'], req: true },
        { k: 'fase', lb: 'Alimentação', tipo: 'lista', ops: ['TRIF', 'MONO'], req: true }, { k: 'freq', lb: 'Frequência', tipo: 'lista', ops: ['60HZ', '50HZ'], req: false },
        { k: 'tensao', lb: 'Código de tensão do fabricante', tipo: 'texto', req: false, ex: '2/3' }, { k: 'ip', lb: 'Grau de proteção', tipo: 'lista', ops: ['IP21', 'IP55'], req: false }, { k: 'painel', lb: 'Painel', tipo: 'lista', ops: ['C/ PAINEL'], req: false }],
      ok: /\d+(,\d+)?(CV|HP) (TRIF|MONO)/ },
  };
  // descrição comercial (para documentos ao cliente): só usa o que está preenchido; nada de característica presumida
  const COMERCIAL = {
    1: 'Motor diesel[ {fab}] {modelo}, {hp} HP a {rpm} rpm, {cil} cilindros, {vcc}, arrefecimento por {arref}',
    10: 'Motor elétrico[ {marca}], {cv} CV, {polos}, IP55, {tensao}[, {freq}][, {ie}], montagem {mont}',
    11: 'Bomba de eixo livre[ {fab}] {modelo}[, {rpm} rpm]',
    12: 'Motobomba {bomba} com motor {acion}[ {marca}][ {motor}], {pot} {unid}[, {polos}][, {rpm} rpm][, {extras}][, {cert}]',
    13: 'Bomba jockey[ {fab}] {modelo}, {pot} {unid}, {fase}[, {freq}][, {ip}][, {painel}]',
  };
  for (const [k, t] of Object.entries(COMERCIAL)) PADRAO[k].comercial = t;
  // o que pode ser configurado sem código: campos e modelo por família (tabela FAM_CAMPOS)
  function padraoDe(fam, cfg) {
    const c = famCode(fam); const conf = ((cfg || {})[String(c)]) || null; const base = PADRAO[c] || null;
    if (!conf) return base;
    let ok = base ? base.ok : null; if (conf.regex) { try { ok = new RegExp(conf.regex); } catch (e) { ok = base ? base.ok : null; } }
    return Object.assign({}, base || { nome: conf.nome || fam }, { nome: conf.nome || (base && base.nome) || fam, modelo: conf.modelo || (base && base.modelo) || '', comercial: conf.comercial || (base && base.comercial) || '', campos: conf.campos || (base && base.campos) || [], ok, configurado: true });
  }
  // aplica o modelo: {k} = valor; [..] some se algum campo de dentro estiver vazio
  function montar(p, vals) {
    if (!p || !p.modelo) return '';
    const v = (k) => { const c = (p.campos || []).find((x) => x.k === k); const raw = (vals || {})[k]; if (raw === undefined || raw === null || String(raw).trim() === '') return ''; return c && c.tipo === 'numero' ? fmtNum(raw) : up(raw); };
    let t = p.modelo.replace(/\[([^\]]*)\]/g, (m, g) => { const ks = [...g.matchAll(/\{(\w+)\}/g)].map((x) => x[1]); return ks.every((k) => v(k)) ? g : ''; });
    t = t.replace(/\{(\w+)\}/g, (m, k) => v(k));
    return up(t);
  }
  // comercial: campos marcados "minusc" (arrefecimento, montagem, acionamento) vão em minúsculas; marcas e códigos ficam como estão
  function montarCom(p, vals, extra) {
    if (!p || !p.comercial) return '';
    const all = Object.assign({}, extra || {}, vals || {});
    const v = (k) => { const c = (p.campos || []).find((x) => x.k === k); const raw = all[k]; if (raw === undefined || raw === null || String(raw).trim() === '') return ''; const t = String(raw).trim();
      if (c && c.tipo === 'numero') return fmtNum(t); if (c && c.minusc) return t.toLowerCase(); return t; };
    let t = p.comercial.replace(/\[([^\]]*)\]/g, (m, g) => { const ks = [...g.matchAll(/\{(\w+)\}/g)].map((x) => x[1]); return ks.every((k) => v(k)) ? g : ''; });
    t = t.replace(/\{(\w+)\}/g, (m, k) => v(k)).replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
    return t;
  }
  const faltando = (p, vals) => (p && p.campos ? p.campos.filter((c) => c.req && String((vals || {})[c.k] ?? '').trim() === '').map((c) => c.lb) : []);
  // regras gerais de escrita (REV21) + o padrão da família
  function checar(fam, produto, cfg) {
    const p = padraoDe(fam, cfg); const t = String(produto || '');
    if (!t.trim()) return 'Falta a descrição.';
    if (t !== t.toUpperCase()) return 'Use letras maiúsculas, como no restante do cadastro.';
    if (/\s{2,}/.test(t) || t !== t.trim()) return 'Há espaços duplos ou nas pontas.';
    if (/[‐–—]| - /.test(t)) return 'Sem traço longo nem " - " como separador.';
    if (p && p.ok && !p.ok.test(t)) return 'Fora do padrão da família: ' + p.modelo;
    return '';
  }
  // lê as características de uma descrição que já está no padrão (para preencher o formulário de um item antigo)
  function ler(fam, produto, cfg) { return lerP(padraoDe(fam, cfg), produto); }
  const reCache = new WeakMap();
  function lerP(p, produto) {
    if (!p || !p.modelo) return {};
    let cached = reCache.get(p); if (cached && cached.m === p.modelo) { const r = cached.re.exec(up(produto)); if (!r) return {}; const out = {}; cached.keys.forEach((k, n) => { if (r[n + 1] !== undefined) out[k] = r[n + 1]; }); return out; }
    const campos = p.campos || []; const parts = []; const keys = [];
    // monta uma expressão a partir do modelo; trechos opcionais viram grupos opcionais
    const esc = (s) => s.replace(/[.*+?^${}()|\\/]/g, '\\$&');
    let src = ''; let i = 0; const m = p.modelo;
    while (i < m.length) {
      if (m[i] === '[') { const j = m.indexOf(']', i); src += '(?:' + tok(m.slice(i + 1, j)) + ')?'; i = j + 1; continue; }
      const j = m.indexOf('[', i); const seg = m.slice(i, j < 0 ? m.length : j); src += tok(seg); i = j < 0 ? m.length : j;
    }
    function tok(seg) { return seg.split(/(\{\w+\})/).map((x) => { const mm = /^\{(\w+)\}$/.exec(x); if (!mm) return esc(x); keys.push(mm[1]); const c = campos.find((y) => y.k === mm[1]) || {}; return c.tipo === 'numero' ? '([\\d,]+)' : c.tipo === 'lista' && c.ops ? '(' + c.ops.map(esc).join('|') + '|\\S+)' : '(.+?)'; }).join(''); }
    try { const re = new RegExp('^' + src + '$'); reCache.set(p, { m: p.modelo, re, keys }); void parts; return lerP(p, produto); } catch (e) { return {}; }
  }
  // duplicidade: nunca junta nada sozinho; só classifica para a pessoa decidir
  function duplicidades(rec, lista, cfg) {
    const out = []; const n0 = norm(rec.produto); const W0 = new Set(n0.split(' ').filter((w) => w.length > 1));
    const p = padraoDe(rec.fam, cfg); const car0 = Object.assign({}, ler(rec.fam, rec.produto, cfg), rec.caract || {});
    for (const x of lista) {
      if (!x || x.id === rec.id) continue;
      const n1 = norm(x.produto);
      if (n1 === n0) { out.push({ x, nivel: 'mesmo', motivo: 'mesma descrição' }); continue; }
      if (rec.codFab && x.codFab && norm(rec.codFab) === norm(x.codFab) && norm(rec.fab) === norm(x.fab)) { out.push({ x, nivel: 'mesmo', motivo: 'mesmo fabricante e código do fabricante' }); continue; }
      if (x.fam !== rec.fam) continue;
      const W1 = new Set(n1.split(' ').filter((w) => w.length > 1)); let c = 0; for (const w of W0) if (W1.has(w)) c++;
      const sim = W0.size && W1.size ? c / Math.max(W0.size, W1.size) : 0;
      const car1 = Object.assign({}, ler(x.fam, x.produto, cfg), x.caract || {});
      const tec = (p && p.campos ? p.campos : []).filter((f) => f.tipo === 'numero' || f.tipo === 'lista').map((f) => f.k).filter((k) => car0[k] && car1[k]);
      const difs = tec.filter((k) => norm(car0[k]) !== norm(car1[k]));
      if (tec.length >= 2 && !difs.length && sim >= 0.5) out.push({ x, nivel: 'equivalente', motivo: 'mesmas características técnicas (' + tec.join(', ') + ')' });
      else if (sim >= 0.6) out.push({ x, nivel: 'semelhante', motivo: difs.length ? 'difere em ' + difs.map((k) => ((p.campos.find((f) => f.k === k) || {}).lb || k).toLowerCase() + ' (' + car1[k] + ')').join(', ') : 'descrição parecida' });
    }
    const ord = { mesmo: 0, equivalente: 1, semelhante: 2 };
    return out.sort((a, b) => ord[a.nivel] - ord[b.nivel]).slice(0, 8);
  }
  // busca com sinônimos e abreviações cadastrados (não altera nada: só amplia o que a busca encontra)
  function termos(q, sin) {
    const base = norm(q).split(' ').filter(Boolean); const map = sin || {};
    return base.map((w) => { const alt = new Set([w]); for (const [k, vs] of Object.entries(map)) { const all = [k].concat(vs || []).map(norm); if (all.includes(w)) all.forEach((a) => alt.add(a)); } return [...alt]; });
  }
  const casa = (texto, grupos) => { const t = ' ' + norm(texto) + ' '; return grupos.every((alts) => alts.some((a) => t.includes(a))); };

  window.PricerFamilias = { PADRAO, padraoDe, montar, montarCom, faltando, checar, ler, lerP, duplicidades, termos, casa, norm, up, fmtNum, famCode };
})();
