// Serviço de campo no Pricer do claude.ai (visualização): simula o claude.ai com um banco em memória (window.claude.use)
// e serve a pasta servico-claude ao lado do Pricer, como no artifact publicado. Confere: menu, módulo dentro do Pricer,
// gravação no banco (coleções svc_*), contrato a partir da proposta ganha, orçamento a partir do relatório e técnico sem valores.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const RAIZ = path.resolve(__dirname, '../..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const f = u === '/' ? path.join(RAIZ, 'dist/ls-pricer.html') : path.join(RAIZ, u);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
// banco do claude.ai em memória (mesmo jeito: doc/collection, where/orderBy/limit, onSnapshot, acquire)
const FAKE = (perfil) => `(() => { if (window.top !== window) return;
  const P = ${JSON.stringify(perfil)}; const docs = window.__docs = new Map(); const subs = new Set(); const clone = (x) => x == null ? x : JSON.parse(JSON.stringify(x));
  const pai = (p) => p.split('/').slice(0, -1).join('/');
  const snapD = (p) => { const d = docs.get(p); return { id: p.split('/').pop(), exists: !!d, data: () => clone(d) }; };
  const run = (q) => { let out = [...docs.keys()].filter((p) => pai(p) === q.path).map((p) => ({ id: p.split('/').pop(), d: docs.get(p) }));
    for (const [f, op, v] of q.where) out = out.filter((x) => op === '==' ? x.d[f] === v : true);
    for (const [f, dir] of q.orderBy) out.sort((a, b) => (a.d[f] < b.d[f] ? -1 : a.d[f] > b.d[f] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    if (q.limit) out = out.slice(0, q.limit); return { docs: out.map((x) => ({ id: x.id, exists: true, data: () => clone(x.d) })), size: out.length, empty: !out.length, forEach(f) { this.docs.forEach(f); } }; };
  const avisa = () => setTimeout(() => subs.forEach((s) => s()), 0);
  const doc = (p) => ({ id: p.split('/').pop(), get: async () => snapD(p), set: async (d) => { if (P.nivel < 2) throw Object.assign(new Error('sem permissão'), { code: 'permission_denied' }); docs.set(p, clone(d)); avisa(); }, update: async (d) => { docs.set(p, Object.assign({}, docs.get(p), clone(d))); avisa(); },
    delete: async () => { docs.delete(p); avisa(); }, acquire: async () => ({ acquired: true }), onSnapshot: (cb) => { const f = () => cb(snapD(p)); subs.add(f); f(); return () => subs.delete(f); } });
  const col = (p, q) => { q = q || { path: p, where: [], orderBy: [], limit: 0 }; const n = (m) => { const c = { path: p, where: q.where.slice(), orderBy: q.orderBy.slice(), limit: q.limit }; m(c); return col(p, c); };
    return { where: (f, op, v) => n((c) => c.where.push([f, op, v])), orderBy: (f, d) => n((c) => c.orderBy.push([f, d])), limit: (k) => n((c) => { c.limit = k; }), doc: (id) => doc(p + '/' + id), get: async () => run(q), onSnapshot: (cb) => { const f = () => cb(run(q)); subs.add(f); f(); return () => subs.delete(f); } }; };
  const db = { doc, collection: (p) => col(p) };
  const user = { id: async () => P.id, isOwner: async () => P.dono, canEdit: async () => P.nivel >= 3, can: async () => P.nivel >= 2, me: async () => ({ id: P.id, name: P.nome }), profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: i }])), search: async () => [] };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : n === 'downloads' ? { save: async () => ({}) } : null) };
})();`;
(async () => {
  await new Promise((r) => srv.listen(0, r)); const BASE = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(); const errs = [];
  const abre = async (perfil, docs) => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.addInitScript(FAKE(perfil)); await c.route('https://**', (r) => r.abort());
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.goto(BASE + '/'); await p.waitForTimeout(1500);
    if (docs) await p.evaluate((d) => { for (const [k, v] of Object.entries(d)) window.__docs.set(k, v); }, docs);
    await p.waitForTimeout(800); return { c, p }; };
  const frame = async (p) => { await p.click('#navServico [data-view="servico"]'); await p.waitForTimeout(3500); return p.frames().find((f) => /servico-claude/.test(f.url())); };
  try {
    // ---------- dono (Administrador) ----------
    let { c, p } = await abre({ id: 'dono', nome: 'Guilherme', dono: true, nivel: 4 });
    confere('menu mostra Serviço de campo no claude.ai', await p.evaluate(() => !document.getElementById('navServico').hidden));
    let fr = await frame(p);
    confere('módulo abre dentro do Pricer', !!fr && /Painel/.test(await fr.evaluate(() => document.body.innerText)));
    confere('dentro do claude.ai não aparece "Sair" do módulo', !/\bSair\b/.test(await fr.evaluate(() => document.body.innerText)));
    // cria um técnico e um contrato pelo módulo, como o usuário faria (mesmas funções de gravação: storage.set)
    await fr.evaluate(async () => {
      await window.storage.set('tecnicos', JSON.stringify([{ id: 1, nome: 'Técnico Um', iniciais: 'TU', cor: '#16A34A' }]));
      await window.storage.set('contratos', JSON.stringify([{ id: 1, codigo: '200001', cliente: 'Indústria Exemplo', endereco: 'Rua A, 100 — Joinville/SC', contato: 'Eng. Ana', tecnicoId: 1, duracaoMeses: 12, valorMensal: 4800, dataInicio: '2026-11-01', validade: '2027-10-31', equipamentos: [] }]));
      await window.storage.set('relatorios', JSON.stringify([{ id: 100, codigo: '700100', contratoId: 1, cliente: 'Indústria Exemplo', tipo: 'preventiva', valorServico: 900, aprovacao: { status: 'aprovado' }, grupos: [{ nome: 'Bomba', itens: [{ texto: 'Vazamento na gaxeta', status: 'nok', obs: 'gotejando' }] }] }]));
    });
    const banco = await p.evaluate(() => [...window.__docs.keys()].filter((k) => /^svc_/.test(k)));
    confere('dados do serviço gravados no banco do claude.ai, um documento por registro', banco.includes('svc_contratos/1') && banco.includes('svc_tecnicos/1') && banco.includes('svc_relatorios/100'), banco.join(', '));
    await fr.evaluate(() => location.reload()); await p.waitForTimeout(3000); fr = p.frames().find((f) => /servico-claude/.test(f.url()));
    await fr.evaluate(() => [...document.querySelectorAll('nav button')].find((x) => /Contratos/.test(x.innerText)).click()); await p.waitForTimeout(800);
    const txtC = await fr.evaluate(() => document.body.innerText);
    confere('contrato aparece no módulo depois de recarregar, com valor (administrador)', /Indústria Exemplo/.test(txtC) && /4\.800/.test(txtC));
    const num = await fr.evaluate(async () => (await (await fetch('/api/allocate-number', { method: 'POST', body: JSON.stringify({ tipo: 'atendimento' }) })).json()).numero);
    confere('numeração do atendimento vem do Pricer (700000…)', /^7000\d\d$/.test(num), num);
    // relatório → orçamento
    await fr.evaluate(() => window.top.postMessage({ tipo: 'lsf-orcamento', relatorioId: '100' }, '*'));
    await p.waitForFunction(() => !!document.querySelector('textarea[data-sp="descricao"]') && !document.getElementById('app').hidden, null, { timeout: 15000 });
    const esc = await p.inputValue('textarea[data-sp="descricao"]');
    confere('relatório vira SPV com a não conformidade no escopo', /700100/.test(esc) && /Vazamento na gaxeta \(gotejando\)/.test(esc), esc.slice(0, 90));
    // proposta de contrato ganha → contrato
    await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('[data-spvnew="ITM"]').click()); await p.waitForTimeout(700);
    await p.$eval('[data-sp="cliente"]', (el) => { el.value = 'Shopping Centro'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.$eval('[data-sp="numero"]', (el) => { el.value = '10.777'; el.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(200);
    await p.click('#bSave'); await p.waitForTimeout(1200);
    await p.evaluate(() => { for (const [k, v] of window.__docs) if (/^propostas\//.test(k) && v.numero === '10.777') { v.status = 'ganha'; window.__docs.set(k, v); } window.claude.use('db').then((db) => db.doc('meta/x').set({ t: Date.now() })); });
    await p.waitForSelector('[data-svccontrato]', { timeout: 15000 }).catch(() => {});
    confere('SPV de contrato ganha mostra "Criar o contrato no Serviço de campo"', !!(await p.$('[data-svccontrato]')));
    if (await p.$('[data-svccontrato]')) { await p.click('[data-svccontrato]'); await p.waitForTimeout(1200); }
    const ban = await p.evaluate(() => (document.querySelector('[data-svcct]') || {}).innerText || '');
    confere('contrato criado com número próprio', /Contrato 2000\d\d criado/.test(ban), ban.slice(0, 60));
    confere('perfis do serviço aparecem em Responsáveis por área', await p.evaluate(async () => { document.querySelector('[data-go="config"][data-gv="acessos"]').click(); await new Promise((r) => setTimeout(r, 1500)); return /Serviço de campo: Técnico/.test(document.body.innerText); }));
    // ---------- submenus do Serviço de campo ----------
    const subs = async () => p.evaluate(() => [...document.querySelectorAll('#navs_servico [data-gk="svcTab"]')].filter((x) => !x.hidden).map((x) => x.innerText.trim()));
    await p.evaluate(() => { const h = document.querySelector('[data-navgt="servico"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); });
    const sAdm = await subs();
    confere('submenu do Serviço de campo (administrador): 8 telas na ordem do trabalho', sAdm.join('|') === 'Agenda|Visitas técnicas|Atendimentos por técnico|Relatórios|Aprovação de relatórios|Contratos de manutenção|Técnicos|Auditoria do serviço', sAdm.join('|'));
    await p.click('#navs_servico [data-gv="agenda"]'); await p.waitForTimeout(1500); fr = p.frames().find((f) => /servico-claude/.test(f.url()));
    const abaAg = await fr.evaluate(() => (document.querySelector('.lsf-tab[aria-current="page"]') || {}).innerText || '');
    confere('submenu Agenda abre o módulo na Agenda', /Agenda/i.test(abaAg) && await p.evaluate(() => document.querySelector('#navs_servico [data-gv="agenda"]').getAttribute('aria-current') === 'true'), abaAg);
    await p.click('#navs_servico [data-gv="relatorios"]'); await p.waitForTimeout(1200);
    confere('submenu Relatórios troca a tela com o módulo já aberto', /Relat/i.test(await fr.evaluate(() => (document.querySelector('.lsf-tab[aria-current="page"]') || {}).innerText || '')));
    await fr.evaluate(() => [...document.querySelectorAll('.lsf-tab')].find((x) => /técnicos/i.test(x.innerText)).click()); await p.waitForTimeout(800);
    confere('trocar a tela dentro do módulo marca o submenu certo no Pricer', await p.evaluate(() => document.querySelector('#navs_servico [data-gv="tecnicos"]').getAttribute('aria-current') === 'true'));
    confere('pesquisa no menu acha as telas do serviço', await p.evaluate(async () => { const q = document.getElementById('navQ'); q.value = 'aprova'; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 50)); const v = [...document.querySelectorAll('#nav [data-go], #nav [data-view]')].filter((e) => !e.hidden).map((e) => e.innerText.trim()); q.value = ''; q.dispatchEvent(new Event('input')); return v.includes('Aprovação de relatórios'); }));
    const todos = await p.evaluate(() => Object.fromEntries([...window.__docs].filter(([k]) => /^svc_|^meta\/acessos/.test(k))));
    await c.close();
    // ---------- técnico (Contribuidor, na lista Serviço de campo: Técnico) ----------
    todos['meta/acessos'] = { areas: { svc_tecnico: ['tec1'] }, by: 'dono' };
    ({ c, p } = await abre({ id: 'tec1', nome: 'Técnico Um', dono: false, nivel: 2 }, todos));
    await p.evaluate(() => { const h = document.querySelector('[data-navgt="servico"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); });
    const sTec = await subs();
    confere('submenu do técnico: sem Aprovação nem Auditoria, com "Meus atendimentos"', !sTec.some((x) => /Aprova|Auditoria/.test(x)) && sTec.includes('Meus atendimentos') && sTec.includes('Agenda'), sTec.join('|'));
    fr = await frame(p);
    await fr.evaluate(() => [...document.querySelectorAll('nav button')].find((x) => /Contratos/.test(x.innerText)).click()); await p.waitForTimeout(800);
    const t2 = await fr.evaluate(() => document.body.innerText);
    confere('técnico vê o contrato sem valor', /Indústria Exemplo/.test(t2) && !/4\.800/.test(t2));
    // sem vínculo de login no claude.ai: o técnico é achado pelo nome igual ao do cadastro
    await fr.click('button[aria-label="Nova ação"]'); await fr.click('button:has-text("Nova Visita")'); await p.waitForTimeout(600);
    const tecAg = await fr.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => /Técnico Um/.test(o.text))); return s ? s.options[s.selectedIndex].text : ''; });
    confere('técnico agendando no claude.ai vem escolhido pelo nome (você)', /Técnico Um \(você\)/.test(tecAg), tecAg);
    await fr.evaluate(() => location.reload()); await p.waitForTimeout(3000); fr = p.frames().find((f) => /servico-claude/.test(f.url()));
    await fr.evaluate(async () => { const r = JSON.parse((await window.storage.get('relatorios')).value); r[0].aprovacao = { status: 'aprovado' }; r.push({ id: 101, codigo: '700101', contratoId: 1, aprovacao: { status: 'aprovado' } }); await window.storage.set('relatorios', JSON.stringify(r)); });
    const r101 = await p.evaluate(() => window.__docs.get('svc_relatorios/101'));
    confere('relatório do técnico entra como pendente (não aprova)', r101 && r101.d.aprovacao.status === 'pendente');
    const r100 = await p.evaluate(() => window.__docs.get('svc_relatorios/100'));
    confere('valor que o técnico não vê fica guardado', r100.d.valorServico === 900);
    await c.close();
    confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  } catch (e) { falha.push('erro: ' + (e.stack || e)); }
  await b.close(); srv.close();
  console.log('Serviço de campo no claude.ai: ' + ok.length + ' ok, ' + falha.length + ' falha(s)'); ok.forEach((x) => console.log('  ok  ' + x)); falha.forEach((x) => console.log('  FALHA  ' + x));
  process.exit(falha.length ? 1 : 0);
})();
