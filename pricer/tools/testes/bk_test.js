const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(500);
  await p.click('[data-view="cadastro"]'); await p.click('[data-cad="historico"]'); await p.waitForTimeout(200); await p.click('[data-cad="backup"]'); await p.waitForTimeout(300);
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-bkbaixa]')]); await d.saveAs(__dirname + '/bk.json');
  const bk = require(__dirname + '/bk.json'); console.log('backup:', Object.entries(bk.colecoes).map(([k, v]) => k + ':' + Object.keys(v).length).join(' '), '| insumos', bk.cadastro.insumos.length);
  // apaga a proposta e restaura
  await p.evaluate(() => { localStorage.setItem('lspricer.saved', '{}'); }); await p.reload(); await p.waitForTimeout(1200);
  console.log('propostas antes:', await p.$$eval('.home tbody tr.click', (x) => x.length));
  await p.click('[data-view="cadastro"]'); await p.click('[data-cad="historico"]'); await p.waitForTimeout(200); await p.click('[data-cad="backup"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#bkArq', __dirname + '/bk.json'); await p.waitForTimeout(600);
  console.log('prévia:', await p.$eval('.modal table', (x) => x.innerText.replace(/\t/g, ' | ').split('\n').slice(0, 3).join(' // ')));
  await p.click('#bkOk'); await p.waitForTimeout(2500);
  console.log('propostas depois:', await p.$$eval('.home tbody tr.click', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 60))));
  console.log('erros', errs); await b.close();
})();
