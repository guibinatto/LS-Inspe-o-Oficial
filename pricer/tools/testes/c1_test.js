const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const errs = []; const p = await ctx.newPage(); await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | '))); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  const toast = () => p.$$eval('.toast', (x) => x.map((e) => e.innerText).join(' / '));
  const txt = (s) => p.$eval(s, (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'NÃO ACHOU ' + s);
  await p.click('[data-view="cadastro"]'); await p.waitForTimeout(300);
  const AREA = { mapa: 'mapa', qualidade: 'mapa', insumos: 'insumos', fornecedores: 'insumos', motor: 'insumos', campos: 'geral', sinonimos: 'geral', testador: 'estruturas', estruturas: 'estruturas' };
  global.go = async (tab) => { await p.click('.areatabs [data-cad="' + AREA[tab] + '"]'); await p.waitForTimeout(300); if (tab !== AREA[tab]) { await p.click('.subtabs [data-cad="' + tab + '"]'); await p.waitForTimeout(400); } };
  for (const tab of ['mapa', 'qualidade', 'insumos', 'fornecedores', 'campos', 'sinonimos', 'testador', 'estruturas', 'motor']) {
    await go(tab); const t = await txt('#app'); const i = t.indexOf(tab === 'mapa' ? 'O cadastro é a fonte' : t.match(/(sua área|Somente leitura|Você pode editar)[^.]*\.?/) ? '' : ''); 
    console.log('aba', tab, '→', t.split(/Você pode editar [^ ]+( [^ ]+)?/).pop().slice(0, 200));
  }
  // qualidade: números
  await go('qualidade');
  console.log('Q kpis:', await txt('#app .kpis'));
  // novo insumo motor diesel guiado
  await go('insumos');
  await p.selectOption('#insFam', '01.MOTORDIESEL'); await p.waitForTimeout(300);
  await p.click('#insNew'); await p.waitForTimeout(300);
  console.log('ficha campos:', await p.$$eval('[data-car]', (x) => x.map((e) => e.dataset.car).join(',')));
  const fill = async (k, v) => { await p.fill('[data-car="' + k + '"]', v); };
  await fill('modelo', '6M16G308/6'); await fill('hp', '483'); await fill('rpm', '1800'); await fill('cil', '6'); await fill('vcc', '24VCC'); await fill('arref', 'RADIADOR'); await fill('ctrl', 'MEC');
  await p.waitForTimeout(200);
  console.log('gerada:', await p.$eval('#fProd', (x) => x.value), '|', await txt('#fPad'));
  console.log('dup:', (await txt('#fDup')).slice(0, 220));
  await p.fill('[data-car="hp"]', '490'); await p.waitForTimeout(200);
  console.log('gerada2:', await p.$eval('#fProd', (x) => x.value), '| dup2:', (await txt('#fDup')).slice(0, 200));
  await p.click('#fComSug'); console.log('comercial:', await p.$eval('#fCom', (x) => x.value));
  await p.fill('#fFab', 'BAUDOUIN'); await p.fill('#fVal', '100000');
  await p.click('#fForn'.replace('#fForn', '.fsec summary')).catch(() => {});
  await p.click('#fSave'); await p.waitForTimeout(800); console.log('salvou:', await toast());
  const novo = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('lspricer.registry.v1')); return r.insumos.filter((i) => /490HP/.test(i.produto)).map((i) => JSON.stringify(i)); });
  console.log('registro:', novo);
  // testador com modelo pronto
  await go('testador');
  await p.click('[data-tstrun]'); await p.waitForTimeout(1500);
  console.log('testador:', (await txt('#app')).slice(0, 900));
  console.log('erros', errs); await b.close();
})();
