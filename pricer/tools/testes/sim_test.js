// Simulação de uso de ponta a ponta, numa sessão só (como uma pessoa faria) e conferência dos documentos:
// família de insumo nova → insumo nela → componente opcional na estrutura (rascunho → publicar) → proposta SEQ pelo
// cabeçalho (CNPJ simulado) → modelo pronto sem vazão/pressão (alertas e campos) → opcional marcado → margem → incluir →
// folha do fabricante (SEMPA_PDF, opcional) → PDFs PTC e FD. Confere: soma da composição = preço, impostos do documento
// (só ICMS+PIS+COFINS), escopo com o conteúdo dos kits (painel, manômetros) e com a família nova, pressão no documento.
// Uso: node sim_test.js  (SEMPA_PDF=<folha SCE 200-500> para a curva e a NFPA 20 no PDF)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const L = __dirname + '/libs/'; const SEMPA = process.env.SEMPA_PDF;
const br = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : ''; return f && fs.existsSync(L + f) ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await ctx.route('https://publica.cnpj.ws/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ razao_social: 'Agroindustrial Simulação Ltda', natureza_juridica: { id: '2062' }, estabelecimento: { situacao_cadastral: 'Ativa', estado: { sigla: 'PR' }, cidade: { nome: 'Londrina' }, atividade_principal: { id: '1061901' }, inscricoes_estaduais: [{ inscricao_estadual: '9012345678', ativo: true, estado: { sigla: 'PR' } }] } }) }));
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
  const txt = (s) => p.$eval(s, (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => '');
  const clkTxt = (t, esc = '#app') => p.evaluate(([t, e]) => { const x = [...document.querySelectorAll(e + ' button')].find((y) => y.offsetParent && y.innerText.trim() === t); if (x) x.click(); return !!x; }, [t, esc]);
  const menu = (g) => p.evaluate((g) => document.querySelector(`#nav [data-gv="${g}"]`).click(), g);
  const aba = (k) => p.click('#overlay [data-ftab="' + k + '"]');
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  // 1) família de insumo nova e um insumo nela
  await menu('familias'); await p.waitForTimeout(400); await clkTxt('Nova família de insumo'); await p.waitForTimeout(300);
  for (const [s, v] of [['#fmCode', '48'], ['#fmNome', 'SENSORNIVEL'], ['#fmDesc', 'Sensor de nível']]) await p.fill(s, v);
  await p.selectOption('#fmGrupo', { label: 'Acessórios' }); await clkTxt('Salvar', '#overlay'); await p.waitForTimeout(500);
  await menu('insumos'); await p.waitForTimeout(400); await p.selectOption('#insFam', '48.SENSORNIVEL'); await p.waitForTimeout(300); await p.click('#insNew'); await p.waitForTimeout(400);
  await p.fill('#fProd', 'SENSOR DE NIVEL BOIA 1/2"'); await aba('compras'); await p.fill('#fVal', '380'); await p.click('#fSave'); await p.waitForTimeout(600);
  // histórico do insumo: características legíveis (não JSON)
  await p.selectOption('#insFam', '01.MOTORDIESEL'); await p.waitForTimeout(300); await p.click('#insNew'); await p.waitForTimeout(400); await aba('tecnica');
  for (const [k, v] of [['modelo', '6M16G308/6'], ['hp', '500'], ['rpm', '1800'], ['cil', '6']]) { await p.fill(`#overlay [data-car="${k}"]`, v); await p.dispatchEvent(`#overlay [data-car="${k}"]`, 'change'); await p.waitForTimeout(150); }
  for (const [k, v] of [['vcc', '24VCC'], ['arref', 'RADIADOR'], ['ctrl', 'MEC']]) await p.check(`#overlay input[data-carr="${k}"][value="${v}"]`, { force: true });
  await aba('geral'); await p.fill('#fFab', 'BAUDOUIN'); await aba('compras'); await p.fill('#fVal', '98500'); await p.click('#fSave'); await p.waitForTimeout(600);
  await p.fill('#insQ', '500HP@1800RPM'); await p.dispatchEvent('#insQ', 'input'); await p.waitForTimeout(500); await p.click('#app tr[data-ins] td.code'); await p.waitForTimeout(500); await aba('hist');
  const pane = (k) => p.$$eval(`#overlay [data-fpane="${k}"]`, (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')).join(' ')); const hist = await pane('hist'); confere('histórico do insumo sem JSON', /Potência: 500/.test(hist) && !/\{"/.test(hist), hist.slice(0, 120));
  await aba('compras'); confere('1ª linha do histórico de preço = cadastro do insumo', /cadastro do insumo/.test(await pane('compras')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // 2) componente opcional na estrutura (rascunho → publicar)
  await menu('estruturas'); await p.waitForTimeout(400); await p.click('[data-estrrasc]'); await p.waitForTimeout(400); await p.click('[data-recnew]'); await p.waitForTimeout(400);
  await p.fill('#rRot', 'Sensor de nível do tanque'); await p.selectOption('#rFam', '48.SENSORNIVEL'); await p.selectOption('#rTipo', 'FIXO'); await p.fill('#rIns', 'SENSOR DE NIVEL BOIA 1/2"');
  await p.selectOption('#rQ', 'FIX'); await p.dispatchEvent('#rQ', 'change'); await p.fill('#rQn', '1'); await p.selectOption('#rRg', 'OPCIONAL'); await p.click('#rSave'); await p.waitForTimeout(700);
  await p.click('[data-rascpub]'); await p.waitForFunction(() => { const x = document.querySelector('#riRes'); return x && /Testados|nenhum|muda/.test(x.innerText); }, null, { timeout: 120000 }).catch(() => {}); await p.click('#riPub'); await p.waitForTimeout(700);
  // 3) proposta SEQ pelo cabeçalho
  await p.click('#cad_vend, [data-cad="preco"]').catch(() => {}); await menu('preco'); await p.waitForTimeout(300);
  await p.fill('#vNome', 'Carlos Vendedor'); await p.click('label:has(input[name="vPapel"][value="vendedor"])'); await p.click('#vAdd'); await p.waitForTimeout(300);
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); await p.click('[data-seqfam="CONJUNTO MOTOBOMBA"]'); await p.waitForTimeout(400);
  await p.fill('#cnpjIn', '11.222.333/0001-81'); await p.dispatchEvent('#cnpjIn', 'change'); await p.waitForTimeout(200); await p.click('#cnpjGo'); await p.waitForTimeout(900);
  const sel1 = async (a, i = 1) => { const el = await p.$(`[id$="PROPOSTA_${a}"]`); const o = await el.$$eval('option', (x) => x.map((y) => y.value)); await el.selectOption(o[i]); await p.waitForTimeout(200); };
  await sel1('F8'); for (const [a, v] of [['C5', '10.250'], ['C10', '15 dias']]) { await p.fill(`[id$="PROPOSTA_${a}"]`, v); await p.dispatchEvent(`[id$="PROPOSTA_${a}"]`, 'change'); }
  await sel1('J6', 2); await p.evaluate(() => { const x = [...document.querySelectorAll('[id$="PROPOSTA_F9"] label, [id$="PROPOSTA_F9"] button')].find((e) => /NFPA20/.test(e.innerText)); if (x) x.click(); }); await sel1('B13');
  await p.click('label:has(input[data-ppcell="C8"])'); await p.waitForTimeout(200);
  for (const [s, v] of [['#pcf_prazoFab', '90'], ['#pcf_prazoEnt', '30']]) if (await p.$(s)) { await p.fill(s, v); await p.dispatchEvent(s, 'change'); }
  await p.click('[data-cabnext]'); await p.waitForTimeout(800);
  await p.fill('[data-cfgq]', 'SCE 200-500'); await p.waitForTimeout(400);
  const nm = await p.$$eval('.cfgmods [data-usemodel]', (x) => (x.find((e) => /483HP/.test(e.closest('.mcard').innerText) && /1 BOMBA D\b/.test(e.closest('.mcard').innerText)) || x[0]).dataset.usemodel);
  await p.click(`.cfgmods [data-usemodel="${nm}"]`); await p.waitForTimeout(800); await p.click('[data-cfget="3"]'); await p.waitForTimeout(500);
  await clkTxt('Informar a vazão'); await p.waitForTimeout(500); await p.selectOption('#c_ITEM01_G17', '2500'); await p.waitForTimeout(800); await p.click('[data-cfget="3"]'); await p.waitForTimeout(500);
  confere('alerta "Sem pressão" com vazão e pressão zerada', /Sem pressão/.test(await txt('#app')));
  await clkTxt('Informar a pressão'); await p.waitForTimeout(500); await p.keyboard.type('106'); await p.keyboard.press('Tab'); await p.waitForTimeout(900);
  const carac = await p.$$eval('#app table.t tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')).join(' / '));
  confere('pressão digitada substitui o 0 (106 mca, não 1060)', /Pressão 106 mca/.test(carac) && !/1\.060/.test(carac), (carac.match(/Pressão [^/]*/) || [''])[0]);
  confere('rotação e arrefecimento do motor escolhido', /Rotação 1\.800 rpm do motor escolhido/.test(carac) && /Arrefecimento TROCADOR DE CALOR do motor escolhido/.test(carac));
  await p.click('[data-cfget="2"]'); await p.waitForTimeout(600); const c0 = br(await txt('.cfghead .sumbar div:first-child b'));
  const op = await p.$$eval('.cfgcomp input[data-opt]', (x) => { const e = x.find((y) => /Sensor de nível/i.test(y.closest('tr').innerText)); return e ? e.dataset.opt : null; });
  if (op) { await p.check(`.cfgcomp input[data-opt="${op}"]`); await p.waitForTimeout(700); } const c1 = br(await txt('.cfghead .sumbar div:first-child b'));
  confere('opcional da família nova aparece e soma o preço do insumo', op && Math.abs(c1 - c0 - 380) < 0.01, c0 + ' → ' + c1);
  await p.click('[data-cfget="3"]'); await p.waitForTimeout(500); await clkTxt('Ajustar à margem mínima'); await p.waitForTimeout(800);
  for (const k of ['tec', 'custo', 'escopo']) await p.check(`input[data-cfgconf="${k}"]`).catch(() => {});
  await p.click('[data-cfgincluir]').catch(() => {}); await p.waitForTimeout(1500);
  if (SEMPA && fs.existsSync(SEMPA)) { await p.click('.ptab[data-step="2"]'); await p.waitForTimeout(400); await p.click('[data-goitem="0"]'); await p.waitForTimeout(700);
    await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.setInputFiles('[data-fdup="ITEM 01|fab"]', SEMPA);
    await p.waitForFunction(() => { const x = document.querySelector('.cvponto'); return x && /kW/.test(x.innerText); }, null, { timeout: 300000 }).catch(() => {}); }
  await p.click('#bSave'); await p.waitForTimeout(800);
  // 4) formação: composição soma o preço; % do memorial ao lado
  await p.click('.ptab[data-step="4"]'); await p.waitForTimeout(700);
  const comp = await p.$$eval('.cpreco tbody tr', (x) => x.map((r) => [...r.cells].map((c) => c.innerText.trim())));
  const vl = (re) => { const r = comp.find((c) => re.test(c[0])); return r ? br(r[1]) : NaN; };
  const soma = vl(/^Custo total/) + vl(/^Impostos/) + vl(/^Comiss/) + vl(/^Margem/); const venda = vl(/^Preço de venda sem IPI/);
  confere('composição: custo + impostos + comissões + margem = preço', Math.abs(soma - venda) < 0.02, soma.toFixed(2) + ' × ' + venda);
  confere('composição mostra o % do memorial (margem)', comp.some((c) => /^Margem/.test(c[0]) && /%/.test(c[3] || '')));
  // 5) documentos
  await p.evaluate(() => [...document.querySelectorAll('.ptab')].find((e) => /DOCUMENTOS/i.test(e.innerText)).click()); await p.waitForTimeout(800);
  const gera = async (nome) => { const dl = p.waitForEvent('download', { timeout: 120000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/' + nome); await p.waitForTimeout(2500); return execSync(`pdftotext -layout "${__dirname + '/' + nome}" - 2>/dev/null`).toString(); };
  const ptc = await gera('sim_ptc.pdf');
  confere('PTC: painel do kit do motor no escopo', /Painel de comando do conjunto diesel/.test(ptc));
  confere('PTC: manômetro e manovacuômetro do kit da bomba', /Manômetro/.test(ptc) && /Manovacuômetro/.test(ptc));
  confere('PTC: componente da família nova no escopo', /SENSOR DE NIVEL BOIA/.test(ptc));
  confere('PTC: pressão 106 mca', /568 m³\/h x 106 mca/.test(ptc));
  await p.click('#pcCard input[data-pcopt="estilo"][value="fd"]', { force: true }); await p.waitForTimeout(500); const fd = await gera('sim_fd.pdf');
  const m = fd.match(/R\$ ([\d.]+,\d\d)\s+R\$ ([\d.]+,\d\d)\s+[\d,]+%\s+[\d,]+%\s+R\$ ([\d.]+,\d\d)/);
  const semImp = m ? br(m[2]) : NaN, imp = m ? br(m[3]) : NaN;
  confere('FD: sem impostos + ICMS/PIS/COFINS = preço', Math.abs(semImp + imp - venda) < 0.02, semImp + ' + ' + imp);
  confere('FD: impostos destacados = só ICMS + PIS + COFINS (12,45% do preço)', Math.abs(imp - venda * 0.1245) < 1, imp);
  confere('FD: painel de comando no escopo', /Painel de comando do conjunto diesel/.test(fd));
  if (SEMPA && fs.existsSync(SEMPA)) confere('FD: NFPA 20 com a curva do fabricante (150% e shutoff)', /150% da vazão[^\n]*91,9 m[^\n]*Atende/.test(fd) && /Shutoff[^\n]*111,1 m[^\n]*Atende/.test(fd));
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  console.log('erros', errs); await b.close(); process.exit(falha.length || errs.length ? 1 : 0);
})();
