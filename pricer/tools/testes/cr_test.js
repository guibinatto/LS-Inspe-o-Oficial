const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); return u.endsWith('exceljs.min.js') ? r.fulfill({ path: L + 'exceljs-4.4.0/dist/exceljs.min.js', contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
  await p.click('[data-view="inicio"]'); await p.click('.home [data-etp$="|cliente"]'); await p.waitForTimeout(300); await p.click('.home [data-hnext]'); await p.waitForTimeout(300);
  await p.uncheck('#fcXls'); await p.click('#fcOk'); await p.waitForTimeout(700); await p.click('#emSo'); await p.waitForTimeout(500);
  // cards
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300);
  console.log('cards:', await p.$$eval('.icard footer', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))));
  await p.click('.icard [data-mgitem="ITEM 02"]'); await p.waitForTimeout(500);
  console.log('h1:', await p.$eval('#app h1', (x) => x.innerText), '| sumbar:', await p.$eval('.sumbar', (x) => x.innerText.replace(/\s+/g, ' ')));
  console.log('grupos item1:', await p.$$eval('#cr_ITEM\\ 01 tr.grp', (x) => x.map((e) => e.innerText)));
  console.log('MO linhas:', await p.$$eval('#cr_ITEM\\ 01 tr', (x) => { let on = false; const o = []; for (const r of x) { if (r.classList.contains('grp')) on = /Mão/.test(r.innerText); else if (on) o.push(r.innerText.replace(/\s+/g, ' ').slice(0, 90)); } return o; }));
  await p.click('#cr_ITEM\\ 01 [data-rok] >> nth=0'); await p.waitForTimeout(400);
  const inp = await p.$('#cr_ITEM\\ 01 input[data-real] >> nth=1'); await inp.fill('1.500,00'); await inp.press('Tab'); await p.waitForTimeout(400);
  console.log('linhas 1-2:', await p.$$eval('#cr_ITEM\\ 01 tr.rdone, #cr_ITEM\\ 01 tr.rpend', (x) => x.slice(0, 3).map((e) => e.className + ' ' + e.innerText.replace(/\s+/g, ' ').slice(0, 120))));
  await p.click('[data-rokall="ITEM 01"]'); await p.waitForTimeout(400); console.log('kpi item1:', await p.$eval('#cr_ITEM\\ 01 .kpis', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.screenshot({ path: __dirname + '/cr_1.png' });
  await p.click('[data-mgconcl]'); await p.waitForTimeout(500); console.log('email:', await p.$eval('.modal h2', (x) => x.innerText), (await p.$eval('#emTxt', (x) => x.value)).slice(0, 250).replace(/\n/g, ' / '));
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#emXls')]); await d.saveAs(__dirname + '/cr_rel.xlsx');
  await p.click('#emSo'); await p.waitForTimeout(500); console.log('depois:', await p.$eval('.docbar', (x) => x.innerText.replace(/\s+/g, ' ')));
  console.log('erros', errs); await b.close();
})();
