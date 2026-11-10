const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1])); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Modelo teste' : undefined));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(500);
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(400);
  console.log('etapas:', await p.$$eval('.ptabs .ptab', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | ')));
  for (const n of [1, 2, 3, 4, 5, 6]) { await p.click(`.ptabs [data-step="${n}"]`); await p.waitForTimeout(500); const h = await p.$$eval('#app section.card h2, #app details > summary', (x) => x.map((e) => e.innerText.split('\n')[0].slice(0, 40))); console.log('etapa', n, '→', h.slice(0, 7).join(' / ')); await p.screenshot({ path: __dirname + `/jor_${n}.png`, fullPage: false }); }
  // custos
  await p.click('.ptabs [data-step="3"]'); await p.waitForTimeout(500); console.log('custos kpis:', await p.$eval('#app .kpis', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('[data-custofiltro="todos"]'); await p.waitForTimeout(400); console.log('linhas:', await p.$$eval('#app table.t tbody tr:not(.grp)', (x) => x.length));
  // simulador
  await p.click('.ptabs [data-step="4"]'); await p.waitForTimeout(400); await p.evaluate(() => { const d = document.querySelector('#simAvDet'); if (d) d.open = true; }); await p.fill('#simAlvo', '4.000.000,00'); await p.click('[data-simrun]'); await p.waitForTimeout(2500);
  console.log('simulação:', await p.$eval('#simCard table', (x) => x.innerText.replace(/\t/g, ' | ').split('\n').slice(0, 11).join(' // ')));
  console.log('banner:', await p.$eval('#simCard .banner', (x) => x.innerText));
  console.log('oficial continua:', await p.$eval('.sumbar', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('[data-simsave]'); await p.waitForTimeout(400); console.log('salvos:', await p.$$eval('#simCard [data-simload]', (x) => x.length));
  await p.click('[data-simrev]'); await p.waitForTimeout(2500); console.log('após converter:', await p.$eval('.sumbar', (x) => x.innerText.replace(/\s+/g, ' ')));
  // conferência
  await p.click('.ptabs [data-step="5"]'); await p.waitForTimeout(500); console.log('conferência:', await p.$$eval('#confCentral tr', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 100)).slice(0, 8)));
  console.log('erros', errs); await b.close();
})();
