const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const errs = []; const p = await ctx.newPage(); await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | '))); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  const toast = () => p.$$eval('.toast', (x) => x.map((e) => e.innerText).join(' / '));
  const txt = (s) => p.$eval(s, (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'NÃO ACHOU ' + s);
  const AREA = { mapa: 'mapa', qualidade: 'mapa', insumos: 'insumos', motor: 'insumos', importar: 'insumos', pedidos: 'insumos', historico: 'historico', testador: 'estruturas', estruturas: 'estruturas', regras: 'estruturas', campos: 'geral', sinonimos: 'geral' };
  const go = async (tab) => { await p.click('[data-view="cadastro"]'); await p.waitForTimeout(200); await p.click('.areatabs [data-cad="' + AREA[tab] + '"]'); await p.waitForTimeout(300); if (tab !== AREA[tab]) { await p.click('.subtabs [data-cad="' + tab + '"]'); await p.waitForTimeout(400); } };
  // 1 regra rascunho não vale na proposta, publicada vale
  await go('regras'); await p.click('[data-rgedit="novo"]'); await p.waitForTimeout(200);
  await p.fill('#rgNome', 'Skid exige painel XYZ'); await p.selectOption('#rgSev', 'imped'); await p.fill('.rgcond [data-rc="valor"]', 'SKID'); await p.fill('#rgComp', 'PAINEL XYZ'); await p.fill('#rgFonte', 'teste');
  await p.click('#rgOk'); await p.waitForTimeout(400); console.log('1 regra:', (await txt('#app table')).slice(0, 200));
  console.log('  seleção estruturas:', (await p.$$eval('#app section.card h2', (x) => x.map((e) => e.innerText))).join(' | '));
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.click('[data-step="5"]'); await p.waitForTimeout(300);
  console.log('  conferência com regra em rascunho:', (await p.$$eval('#confCentral tbody tr', (x) => x.map((e) => e.innerText).filter((t) => /regra/.test(t)))).length);
  // 2 testador comparar
  await go('testador'); await p.selectOption('#tsCmp', { index: 2 }); await p.click('[data-tstrun]'); await p.waitForTimeout(2500);
  console.log('2 comparação:', (await p.$$eval('#app section.card', (S) => S.map((x) => x.innerText.replace(/\s+/g, ' ')).filter((t) => /COMPARAÇÃO DE CUSTO/.test(t))))[0]?.slice(0, 400));
  // 3 cobertura
  await go('qualidade'); await p.click('[data-cobrun]'); await p.waitForTimeout(15000); console.log('3 cobertura:', (await p.$$eval('#app section.card', (S) => S.map((x) => x.innerText.replace(/\s+/g, ' ')).filter((t) => /COBERTURA/.test(t))))[0]?.slice(0, 400));
  // 4 campos por família: abrir motor diesel, ver cobertura
  await go('campos'); console.log('4 campos:', (await txt('#app table')).slice(0, 300)); await p.click('[data-campofam="01.MOTORDIESEL"]'); await p.waitForTimeout(400); console.log('  modal prévia:', (await txt('#cmPrev')).slice(0, 250)); await p.click('.modal [data-close]');
  // 5 sinônimos: busca TRIFASICO acha TRIF
  await go('insumos'); await p.fill('#insQ', 'trifasico'); await p.waitForTimeout(700); console.log('5 busca sinônimo:', (await txt('#app p.sub')).slice(0, 80));
  // 6 pedidos: pedir e atender aguardando preço
  await p.evaluate(() => document.querySelector('[data-pedir]') ? 0 : 0);
  // 7 importar: colar 2 linhas, uma nova
  await go('importar'); await p.fill('#impTxt', 'Produto\tPreço\nPRODUTO NOVO TESTE XYZ 1\t1.234,56\n01-1002\t70.094,27'); await p.click('#impRead'); await p.waitForTimeout(500);
  await p.click('details summary'); await p.waitForTimeout(200); await p.click('#impNovos'); await p.waitForTimeout(400); console.log('7 provisórios:', (await txt('.modal table')).slice(0, 200)); await p.click('#inOk'); await p.waitForTimeout(900); console.log('  ', await toast());
  console.log('  lista provisórios:', (await txt('#app tbody')).slice(0, 160));
  // 8 biblioteca (precisa de proposta salva)
  await p.click('#bSave'); await p.waitForTimeout(800); await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300);
  const bb = await p.$('[data-biblio]'); console.log('8 botão biblioteca:', !!bb); if (bb) { await bb.click(); await p.waitForTimeout(300); await p.fill('#bbQ', 'skid'); await p.waitForTimeout(300); console.log('  resultados:', (await txt('#bbL')).slice(0, 200)); const u = await p.$('[data-bbuse]'); if (u) { await u.click(); await p.waitForTimeout(800); console.log('  ', await toast()); } }
  // 9 kits: comparar 2 e duplicar
  await go('motor'); const cks = await p.$$('[data-kitsel]'); await cks[0].check(); await cks[1].check(); await p.click('#kitCmp'); await p.waitForTimeout(300); console.log('9 kits:', (await txt('.modal')).slice(0, 200)); await p.click('.modal [data-close]');
  console.log('erros', errs); await b.close();
})();
