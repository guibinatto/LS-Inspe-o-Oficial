// Numeração: reserva sem colisão no banco compartilhado (banco simulado com a mesma trava "acquire" do claude.ai),
// várias reservas ao mesmo tempo, número já usado em proposta pulado, contador que não volta, ano no número,
// configuração só do administrador e código de insumo novo que colide com outro gravado ao mesmo tempo.
global.window = { PricerEngine: { parseAddr: (a) => a } }; global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } };
require('../../cadastro.js');
const MODEL = { sheets: [{ name: 'CADASTRO', cells: { A2: 1, B2: 1001, C2: '01.MOTORDIESEL', D2: 'MOTOR TESTE' } }, { name: 'KIT MOTORES DIESEL', cells: {} }, { name: 'KIT BOMBA', cells: {} }] };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeDb() {
  const docs = {}, leases = {};
  const ref = (path) => ({ path,
    async get() { await espera(Math.random() * 15); const d = docs[path]; return { exists: !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; },
    async set(v) { await espera(Math.random() * 15); docs[path] = JSON.parse(JSON.stringify(v)); },
    async acquire({ holder, ttlMs }) { await espera(Math.random() * 10); const ttl = Math.max(1000, Math.min(600000, ttlMs || 30000)); const l = leases[path]; const now = Date.now(); if (l && l.exp > now && l.holder !== holder) return { acquired: false, expiresAt: new Date(l.exp).toISOString() }; leases[path] = { holder, exp: now + ttl }; return { acquired: true, expiresAt: new Date(now + ttl).toISOString() }; } });
  return { docs, doc: ref, collection: (c) => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: Object.entries(docs).filter(([k]) => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1).map(([, v]) => ({ data: () => v })) }) }) }) }) };
}
(async () => {
  const ok = []; const falha = []; const confere = (nome, cond, det) => (cond ? ok : falha).push(nome + (det ? ' (' + det + ')' : ''));
  const R = window.PricerRegistry.Registry(MODEL, () => {});
  // banco compartilhado simulado, sem ser administrador
  R.mode = 'shared'; R.db = fakeDb(); R.canSaveShared = true; R.canEditCadastro = true; R.seeded = true; R.me = 'u1'; R.isOwner = false; R.propostas = [{ id: 'pX', numero: 'SEQ-' + new Date().getFullYear() + '-00002' }];
  try { await R.salvarNumeracao({ seq: Object.assign({}, R.NUM_PADRAO.seq, { ativa: true }) }); confere('só o administrador configura', false); } catch (e) { confere('só o administrador configura', /administrador/.test(e.message)); }
  try { await R.reservarNumero('seq'); confere('série desligada não gera', false); } catch (e) { confere('série desligada não gera', /não está ligada/.test(e.message)); }
  R.isOwner = true; await R.salvarNumeracao({ seq: Object.assign({}, R.NUM_PADRAO.seq, { ativa: true }), spv: Object.assign({}, R.NUM_PADRAO.spv, { ativa: true, anual: false, prefixo: 'SPV', posicoes: 4, inicio: 250 }) });
  confere('configuração gravada em meta/numeracao (caminho só de administrador)', !!R.db.docs['meta/numeracao']);
  R.isOwner = false;
  // 12 reservas ao mesmo tempo (pessoas e abas diferentes)
  const L = await Promise.all(Array.from({ length: 12 }, (_, i) => { R.me = 'u' + (i % 3); return R.reservarNumero('seq').catch((e) => 'ERRO ' + e.message); }));
  const erros = L.filter((x) => /^ERRO/.test(x)); const nums = L.filter((x) => !/^ERRO/.test(x));
  confere('12 reservas simultâneas, nenhum número repetido', new Set(nums).size === nums.length && nums.length >= 10, nums.length + ' números, ' + erros.length + ' pediram para tentar de novo');
  confere('número já usado em proposta salva é pulado', !nums.includes('SEQ-' + new Date().getFullYear() + '-00002'));
  confere('formato SEQ-AAAA-NNNNN', nums.every((n) => /^SEQ-\d{4}-\d{5}$/.test(n)), nums.slice(0, 3).join(', '));
  const prox = R.db.docs['propostas/_numeracao/series/seq-' + new Date().getFullYear()].prox;
  confere('contador só avança', prox > Math.max(...nums.map((n) => +n.slice(-5))), 'próximo ' + prox);
  const sp = [await R.reservarNumero('spv'), await R.reservarNumero('spv')];
  confere('série SPV sem ano, 4 posições, começa em 250', sp[0] === 'SPV0250' && sp[1] === 'SPV0251', sp.join(', '));
  confere('número duplicado detectado', R.numeroDuplicado('SEQ-' + new Date().getFullYear() + '-00002', 'outra') && !R.numeroDuplicado('SEQ-' + new Date().getFullYear() + '-00002', 'pX'));
  // insumo novo: duas pessoas cadastram na mesma família ao mesmo tempo com o mesmo código calculado
  R._mutate; const cod = R.nextCode('01.MOTORDIESEL');
  const a = { id: R.newInsumoId(cod.a, cod.b), a: cod.a, b: cod.b, fam: '01.MOTORDIESEL', produto: 'MOTOR A', origem: 'NAC' };
  const b = { id: R.newInsumoId(cod.a, cod.b), a: cod.a, b: cod.b, fam: '01.MOTORDIESEL', produto: 'MOTOR B', origem: 'NAC' };
  const ra = await R.saveInsumo(a, true); const rb = await R.saveInsumo(b, true);
  const itens = R.db.docs['cadastro/f01'].itens;
  confere('insumos cadastrados juntos não se sobrescrevem', Object.values(itens).map((x) => x.produto).sort().join('|') === 'MOTOR A|MOTOR B', Object.keys(itens).join(', '));
  confere('o segundo recebe o próximo código e é avisado', !!(rb && rb.colidiu) && b.id !== a.id, b.id);
  console.log('OK:', ok.length, '\n  ' + ok.join('\n  ')); console.log('FALHA:', falha.length, falha.length ? '\n  ' + falha.join('\n  ') : ''); process.exit(falha.length ? 1 : 0);
})();
