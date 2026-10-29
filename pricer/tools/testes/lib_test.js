const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
  const cards = async () => { await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); return p.$$eval('.icard footer', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))[0]); };
  const home = async () => { await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); return [await p.$eval('.home tbody tr.click .hacts', (x) => x.innerText.replace(/\s+/g, ' ')), await p.$eval('.home .etapas', (x) => [...x.querySelectorAll('.etp')].filter((e) => /Custo real/.test(e.innerText)).map((e) => e.className)[0])]; };
  console.log('1 sem baixa · cards:', await cards(), '| home:', await home());
  await p.click('.home [data-etp$="|cliente"]'); await p.waitForTimeout(300); await p.click('.home [data-hnext]'); await p.waitForTimeout(300); await p.uncheck('#fcXls'); await p.click('#fcOk'); await p.waitForTimeout(700); await p.click('#emSo'); await p.waitForTimeout(400);
  console.log('2 com baixa · cards:', await cards(), '| home:', await home());
  // força a proposta a perdida no armazenamento local
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) { try { const o = JSON.parse(localStorage.getItem(k)); if (o && typeof o === 'object' && !Array.isArray(o)) for (const v of Object.values(o)) if (v && v.status === 'ganha') { v.status = 'perdida'; localStorage.setItem(k, JSON.stringify(o)); } } catch (e) {} } });
  await p.reload(); await p.waitForTimeout(1200);
  console.log('3 perdida · cards:', await cards(), '| home:', await home());
  await p.click('[data-view="margens"]'); await p.waitForTimeout(300); console.log('fila:', await p.$$eval('#app section.card h2', (x) => x.map((e) => e.innerText.split('\n')[0]).filter((t) => /Custo real a lançar/.test(t)).length));
  console.log('erros', errs); await b.close();
})();
