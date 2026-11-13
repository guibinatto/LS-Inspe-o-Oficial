// Desconto × margem na Formação (etapa 4): digitar o desconto global mostra a margem; digitar a margem mostra o desconto e os
// valores; nada muda até "Aplicar à proposta"; aplicado, a margem da proposta fica igual à pedida. Proposta do exemplo (Cocamar).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const L = __dirname + '/libs/'; await p.route('https://cdnjs.cloudflare.com/**', (r) => (/exceljs/.test(r.request().url()) ? r.fulfill({ path: L + 'exceljs-4.4.0/dist/exceljs.min.js', contentType: 'text/javascript' }) : r.abort())); await p.route('https://fonts.googleapis.com/**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(900); await p.click('#bSave'); await p.waitForTimeout(600);
  await p.click('[data-view="proposta"]'); await p.click('.ptab[data-step="4"]'); await p.waitForTimeout(800);
  confere('cartão Desconto × margem na Formação', !!(await p.$('#simMgCard')));
  const doc0 = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lspricer.current')).doc));
  const linha = async (lb) => p.evaluate((lb) => { const tr = [...document.querySelectorAll('#smRes tr')].find((x) => x.cells[0] && x.cells[0].innerText.trim() === lb); return tr ? [tr.cells[1].innerText, tr.cells[2].innerText] : null; }, lb);
  const pc = (s) => Number(String(s).replace(/[^\d,-]/g, '').replace(',', '.'));
  await p.fill('#smDesc', '5'); await p.waitForTimeout(1500);
  const m5 = await linha('Margem líquida (%)'), d5 = await linha('Desconto global'), t5 = await linha('Preço ao cliente (com IPI)');
  confere('desconto 5%: mostra a margem e o preço simulados', m5 && d5 && /5,00%/.test(d5[1]) && pc(m5[1]) < pc(m5[0]), JSON.stringify([d5, m5, t5]));
  const fp = await linha('Fator praticado (subtotal ÷ custo dos itens)'), ff = await linha('Fator sobre o preço final (preço com IPI ÷ custo total)');
  confere('fatores no simulador: praticado e sobre o preço final, com a nota', fp && ff && /\d,\d{4}/.test(fp[1]) && /\d,\d{4}/.test(ff[1]) && /Os dois fatores/.test(await p.evaluate(() => document.getElementById('smRes').innerText)), JSON.stringify([fp, ff]));
  confere('a proposta não mudou', doc0 === await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lspricer.current')).doc)));
  const t0 = Date.now(); await p.fill('#smMg', '30'); await p.waitForTimeout(500); await p.waitForFunction(() => /30,00%/.test((document.getElementById('smRes') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  const m30 = await linha('Margem líquida (%)'), d30 = await linha('Desconto global');
  confere('margem 30%: acha o desconto', m30 && /30,00%/.test(m30[1]) && d30, JSON.stringify([d30, m30]) + ' em ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  await p.fill('#smValor', '4.000.000,00'); await p.waitForTimeout(500); await p.waitForFunction(() => /4\.000\.000,00/.test(((document.querySelectorAll('#smRes tr')[2] || {}).innerText) || ''), null, { timeout: 15000 }).catch(() => {});
  const tv = await linha('Preço ao cliente (com IPI)'), dv = await linha('Desconto global'), mv = await linha('Margem líquida (%)');
  confere('valor final R$ 4.000.000: mostra o desconto e a margem', tv && /4\.000\.000,00/.test(tv[1]) && dv && pc(dv[1]) > 0 && mv, JSON.stringify([tv, dv, mv]));
  await p.fill('#smMg', '30'); await p.waitForTimeout(500); await p.waitForFunction(() => /30,00%/.test((document.getElementById('smRes') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  // no memorial também, e o memorial em Excel
  await p.click('[data-view="memorial"]').catch(() => {}); await p.waitForTimeout(800);
  confere('cartão também na página do Memorial', !!(await p.$('#simMgCard')) && /Memorial de formação/.test(await p.evaluate(() => document.getElementById('app').innerText)));
  const dl = p.waitForEvent('download', { timeout: 60000 }).catch(() => null); await p.click('[data-doc="memorialxlsx"]'); const d = await dl;
  if (d) { const f = path.join(__dirname, 'memorial.xlsx'); await d.saveAs(f);
    const xl = require('child_process').execSync(`python3 -I -c "import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb['Memorial'];vals=[c.value for r in ws.iter_rows() for c in r if isinstance(c.value,(int,float))];print(len(wb.sheetnames),len(vals),sum(1 for r in ws.iter_rows() for c in r if c.number_format and '%' in c.number_format))" "${f}"`).toString().trim().split(' ').map(Number);
    confere('Memorial (Excel): abas Memorial e Itens, valores como número, % formatado', xl[0] === 2 && xl[1] > 50 && xl[2] > 5, xl.join(' · ') + ' (abas · números · células em %)'); } else confere('Memorial (Excel) baixado', false);
  await p.click('[data-view="proposta"]'); await p.click('.ptab[data-step="4"]'); await p.waitForTimeout(800);
  await p.fill('#smMg', '30'); await p.waitForTimeout(500); await p.waitForFunction(() => /30,00%/.test((document.getElementById('smRes') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  await p.click('[data-smaplica]'); await p.waitForTimeout(1200);
  const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lspricer.current')); return s.doc.PROPOSTA.C9; });
  const kpi = await p.evaluate(() => [...document.querySelectorAll('.kpi')].map((k) => k.innerText.replace(/\s+/g, ' ')).find((t) => /margem líquida/i.test(t)) || '');
  confere('aplicado: desconto gravado e margem da proposta = 30%', typeof st === 'number' && /30,0/.test(kpi), st + ' · ' + kpi);
  confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  process.exit(falha.length ? 1 : 0);
})();
