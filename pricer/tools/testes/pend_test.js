const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
  // pedido de aprovação + cenário com CBS em branco
  await p.click('[data-view="proposta"]'); await p.click('[data-step="5"]'); await p.waitForTimeout(300);
  await p.click('.aprovbox [data-alaprov]'); await p.waitForTimeout(300); await p.fill('#apAlvo', '4.000.000,00'); await p.fill('#apMot', 'teste'); await p.click('#apOk'); await p.waitForTimeout(400); await p.click('.modal [data-close]');
  await p.click('[data-view="cadastro"]'); await p.click('[data-cad="fiscal"]'); await p.click('[data-cad="cenarios"]'); await p.waitForTimeout(200); await p.click('[data-cennovo="2027"]'); await p.waitForTimeout(400);
  console.log('menu:', await p.$eval('#nav [data-view="pendencias"]', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); console.log('home:', await p.$eval('.pendbar', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'sem resumo'));
  await p.click('#nav [data-view="pendencias"]'); await p.waitForTimeout(400);
  console.log('painel:', await p.$$eval('#app section.card', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 170))));
  await p.screenshot({ path: __dirname + '/pend.png', fullPage: true });
  await p.click('#app [data-apopen]'); await p.waitForTimeout(400); console.log('abriu:', await p.$eval('#app h1', (x) => x.innerText));
  await p.click('#nav [data-view="pendencias"]'); await p.waitForTimeout(300); await p.click('#app [data-cenpend]'); await p.waitForTimeout(400); console.log('cenário:', await p.$eval('#app section.card:nth-of-type(2) h2', (x) => x.innerText));
  console.log('erros', errs); await b.close();
})();
