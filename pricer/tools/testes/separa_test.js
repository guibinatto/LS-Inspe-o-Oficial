// SPV de serviço com peças separada em duas propostas ligadas (como no Ploomes: 10.339 mão de obra + 10.342 peças):
// cada uma com o seu número, as duas salvas, MO + peças = total de antes, vínculo nos dois sentidos (com Abrir),
// "Propostas relacionadas" preenchida e os dois PDFs, cada um só com a sua parte.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'); const { execSync } = require('child_process'); const L = __dirname + '/libs/';
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const num = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /jspdf\.plugin\.autotable|autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : /exceljs/.test(u) ? 'exceljs-4.4.0/dist/exceljs.min.js' : null; return f ? r.fulfill({ path: L + f, contentType: 'application/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  const set = async (sel, v) => { await p.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, v); await p.waitForTimeout(200); };
  const preco = () => p.evaluate(() => [...document.querySelectorAll('.ctx-kpis .k')].find((d) => /Valor total/i.test(d.querySelector('span').innerText)).querySelector('b').innerText);
  const aba = async (re) => { await p.evaluate((s) => { const t = [...document.querySelectorAll('.ptab')].find((e) => new RegExp(s, 'i').test(e.innerText)); if (t) t.click(); }, re); await p.waitForTimeout(600); };
  const pdf = async () => { const dl = p.waitForEvent('download', { timeout: 120000 }); await p.evaluate(() => document.querySelector('[data-pcgerar]').click()); const d = await dl; const f = path.join(__dirname, 'separa_' + d.suggestedFilename()); await d.saveAs(f); return execSync(`pdftotext -layout "${f}" - 2>/dev/null`).toString().replace(/[ \t]+/g, ' '); };

  await p.evaluate(() => document.querySelector('[data-spvnew="SMC"]').click()); await p.waitForTimeout(800);
  await set('[data-sp="cliente"]', 'WEG TINTAS'); await set('[data-sp="numero"]', '10.339'); await set('[data-sp="dist"]', '120');
  await set('[data-sp="descricao"]', 'Substituição do radiador do motor diesel.');
  await p.click('[data-spadd="pecas"]'); await p.waitForTimeout(300); await set('[data-sp="pecas.0.desc"]', 'RADIADOR'); await set('[data-sp="pecas.0.unit"]', '12000');
  await p.click('[data-spadd="pecas"]'); await p.waitForTimeout(300); await set('[data-sp="pecas.1.desc"]', 'JUNTA DO RADIADOR'); await set('[data-sp="pecas.1.unit"]', '300');
  const total0 = num(await preco());
  confere('botão "Separar em 2 propostas" no cartão de peças', !!(await p.$('[data-spsep]')));
  await p.click('[data-spsep]'); await p.waitForTimeout(400);
  const kv = await p.evaluate(() => document.querySelector('#overlay .kv').innerText);
  const [vMo, vPc] = [/Mão de obra\s*R\$\s*([\d.,]+)/, /Peças\s*R\$\s*([\d.,]+)/].map((re) => num((kv.match(re) || [])[1] || ''));
  confere('modal mostra MO + peças = total de hoje', Math.abs(vMo + vPc - total0) < 0.01, vMo + ' + ' + vPc + ' = ' + total0);
  confere('nº da MO já vem preenchido com o desta proposta', (await p.inputValue('#sepNumMo')) === '10.339');
  await p.click('#sepOk'); await p.waitForTimeout(500);
  confere('sem nº de peças não separa', !!(await p.$('#sepOk')));
  await p.fill('#sepNumPc', '10.339'); await p.click('#sepOk'); await p.waitForTimeout(400);
  confere('números iguais não separa', !!(await p.$('#sepOk')));
  await p.fill('#sepNumPc', '10.342'); await p.click('#sepOk'); await p.waitForTimeout(2500);

  // mão de obra (esta)
  const banMo = await p.evaluate(() => (document.querySelector('[data-vinculo]') || {}).innerText || '');
  confere('MO: aviso de vínculo com a proposta de peças 10.342', /peças deste serviço estão na proposta nº 10\.342/.test(banMo), banMo.slice(0, 90));
  const pMo = num(await preco());
  confere('MO: preço = só a mão de obra', Math.abs(pMo - vMo) < 0.01, pMo);
  confere('MO: sem o cartão de peças e sem o botão de separar', !(await p.$('[data-spsep]')) && !(await p.evaluate(() => [...document.querySelectorAll('section.card h2')].some((h) => /^Peças e materiais/.test(h.innerText)))));
  confere('MO: salva (sem alteração pendente)', await p.evaluate(() => !/não salv/i.test((document.getElementById('saveSt') || {}).innerText || '')));
  await aba('DOCUMENTOS');
  const relMo = await p.evaluate(() => { const t = document.querySelector('[data-pc="relacionadas"]'); return t ? t.value : ''; });
  confere('MO: "Propostas relacionadas" cita a 10.342', /Peças e materiais conforme a proposta nº 10\.342/.test(relMo), relMo);
  const tMo = await pdf();
  confere('PDF da MO: nº 10.339, cita a 10.342 e não lista o radiador como item', /10\.339/.test(tMo) && /10\.342/.test(tMo) && !/JUNTA DO RADIADOR/.test(tMo));

  // abre a de peças pelo aviso
  await aba('(DADOS|SERVI|PROPOSTA)'); await p.evaluate(() => window.scrollTo(0, 0));
  const vinc = await p.$('[data-spvinc]'); confere('MO: botão Abrir a proposta vinculada', !!vinc);
  if (vinc) { await vinc.click(); await p.waitForTimeout(1200); }
  const h1 = await p.evaluate(() => (document.querySelector('.flowhead h1') || {}).innerText || '');
  confere('peças: abriu a 10.342, tipo Peças e sobressalentes', /10\.342/.test(h1) && /Peças e sobressalentes/.test(h1), h1);
  const banPc = await p.evaluate(() => (document.querySelector('[data-vinculo]') || {}).innerText || '');
  confere('peças: aviso de vínculo com a MO 10.339', /mão de obra destas peças está na proposta nº 10\.339/i.test(banPc), banPc.slice(0, 90));
  const pPc = num(await preco());
  confere('peças: preço = só as peças; MO + peças = total de antes', Math.abs(pPc - vPc) < 0.01 && Math.abs(pMo + pPc - total0) < 0.01, pMo + ' + ' + pPc + ' = ' + total0);
  confere('peças: mesmo cliente, sem equipe', (await p.inputValue('[data-sp="cliente"]')).toUpperCase() === 'WEG TINTAS' && !(await p.evaluate(() => [...document.querySelectorAll('section.card h2')].some((h) => /^Equipe e deslocamento/.test(h.innerText)))));
  await aba('DOCUMENTOS');
  const relPc = await p.evaluate(() => { const t = document.querySelector('[data-pc="relacionadas"]'); return t ? t.value : ''; });
  confere('peças: "Propostas relacionadas" cita a 10.339', /Mão de obra conforme a proposta nº 10\.339/.test(relPc), relPc);
  const tPc = await pdf();
  confere('PDF das peças: nº 10.342, radiador e junta, cita a 10.339', /10\.342/.test(tPc) && /RADIADOR/.test(tPc) && /JUNTA DO RADIADOR/.test(tPc) && /10\.339/.test(tPc));

  // as duas na lista de propostas
  await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(600);
  const lista = await p.evaluate(() => document.body.innerText);
  confere('as duas na tela inicial', /10\.339/.test(lista) && /10\.342/.test(lista));
  confere('sem erro de JavaScript', !errs.length, errs.join(' | '));
  await b.close();
  console.log('Separar MO e peças: ' + ok.length + ' ok, ' + falha.length + ' falha(s)'); ok.forEach((x) => console.log('  ok  ' + x)); falha.forEach((x) => console.log('  FALHA  ' + x));
  process.exit(falha.length ? 1 : 0);
})();
