const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const errs = []; const p = await ctx.newPage(); await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  const toast = () => p.$$eval('.toast', (x) => x.map((e) => e.innerText).join(' / '));
  // regra: SKID exige componente "PAINEL XYZ" (impeditiva)
  await p.click('[data-view="cadastro"]'); await p.waitForTimeout(200); await p.click('[data-cad="estruturas"]').catch(() => {}); await p.waitForTimeout(200); await p.click('[data-cad="regras"]'); await p.waitForTimeout(300);
  console.log('1 tela regras:', await p.$eval('#app .card h2', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('[data-rgedit="novo"]'); await p.waitForTimeout(200);
  await p.fill('#rgNome', 'Skid com painel XYZ'); await p.selectOption('#rgSev', 'imped'); await p.fill('.rgcond [data-rc="valor"]', 'SKID'); await p.fill('#rgComp', 'PAINEL XYZ');
  await p.click('#rgOk'); await p.waitForTimeout(200); console.log('2 sem fonte:', await p.$eval('#rgMsgSt', (x) => x.innerText));
  await p.fill('#rgFonte', 'teste automatizado'); await p.click('#rgOk'); await p.waitForTimeout(400); console.log('3 salva:', await toast(), '|', await p.$$eval('#app tbody tr', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' '))));
  // proposta exemplo: o ITEM 01 é SKID → alerta impeditivo na conferência
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.click('[data-step="5"]'); await p.waitForTimeout(300);
  console.log('4 conferência:', await p.$$eval('#confCentral tbody tr', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')).filter((t) => /regra/.test(t))));
  // tema
  await p.click('#bTheme'); console.log('5 tema:', await p.evaluate(() => document.documentElement.dataset.theme), await p.$eval('#bTheme', (x) => x.innerText));
  await p.click('#bTheme'); console.log('  ', await p.evaluate(() => document.documentElement.dataset.theme), await p.$eval('#bTheme', (x) => x.innerText));
  await p.screenshot({ path: 'p26_escuro.png' });
  await p.click('#bTheme'); console.log('  ', await p.evaluate(() => document.documentElement.dataset.theme || '(auto)'));
  // Esc fecha modal; Ctrl+S salva
  await p.click('#bOpen'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(100); console.log('6 esc fechou:', await p.$eval('#overlay', (x) => x.innerHTML === ''));
  await p.keyboard.press('Control+s'); await p.waitForTimeout(800); console.log('7 ctrl+s:', await toast());
  // documento com revisão/item/etapa
  await p.click('#nav [data-view="inicio"]'); await p.waitForTimeout(400); await p.click('#app [data-view="documentos"]'); await p.waitForTimeout(300);
  console.log('8 docs page ok:', !!(await p.$('#docQ')));
  console.log('erros', errs); await b.close();
})();
