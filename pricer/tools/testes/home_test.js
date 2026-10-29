const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  console.log('SEQ:', await p.$$eval('.start.seq .tchip', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))));
  await p.screenshot({ path: 'h_home.png' });
  await p.click('[data-seqfam="SKID"]'); await p.waitForTimeout(600);
  console.log('abriu:', await p.$eval('.flowhead h1', (x) => x.innerText), '|', await p.$eval('#app h2', (x) => x.innerText.slice(0, 80)));
  const sel = await p.$('select[id$="ITEM01_C21"]'); console.log('família:', sel ? await sel.evaluate((e) => e.options[e.selectedIndex].text) : 'sem select');
  console.log('erros', errs); await b.close();
})();
