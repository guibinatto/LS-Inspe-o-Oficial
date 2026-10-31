const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const errs = []; const p = await ctx.newPage(); await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | '))); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  const toast = () => p.$$eval('.toast', (x) => x.map((e) => e.innerText).join(' / '));
  const txt = (s) => p.$eval(s, (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'NÃO ACHOU ' + s);
  const AREA = { mapa: 'mapa', qualidade: 'mapa', insumos: 'insumos', motor: 'insumos', historico: 'historico', testador: 'estruturas', estruturas: 'estruturas', campos: 'geral' };
  const go = async (tab) => { const sis = AREA[tab] === 'historico'; await p.click(sis ? '[data-view="config"]' : '[data-view="cadastro"]'); await p.waitForTimeout(200); if (!sis) await p.click('.areatabs [data-cad="' + AREA[tab] + '"]'); await p.waitForTimeout(300); if (tab !== AREA[tab]) { await p.click('.subtabs [data-cad="' + tab + '"]'); await p.waitForTimeout(400); } };
  // 1. testador: resultado
  await go('testador'); await p.click('[data-tstrun]'); await p.waitForTimeout(1500);
  const r = await p.$$eval('#app section.card', (S) => S.map((x) => x.innerText.replace(/\s+/g, ' ')));
  console.log('1 testador:', r[r.length - 1].slice(0, 1100));
  // 2. proposta exemplo salva, depois muda o preço do motor, abre como enviada
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(900);
  const tot0 = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('lspricer.saved')))[0].total);
  const precos = await p.evaluate(() => { const q = Object.values(JSON.parse(localStorage.getItem('lspricer.saved')))[0]; return q.precos ? Object.keys(q.precos.ins).length + ' insumos, ' + Object.keys(q.precos.km).length + ' kits motor, ' + Object.keys(q.precos.kb).length + ' kits bomba' : 'SEM PRECOS'; });
  console.log('2 salvo total', tot0, '| preços guardados:', precos);
  // marca como enviada
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.click('[data-step="6"]'); await p.waitForTimeout(300);
  const et = await p.$('[data-etp$="|cliente"]'); if (et) { await et.click(); await p.waitForTimeout(800); }
  // muda o preço de um insumo usado (o motor do item 01 aparece em D69)
  const desc = '6M33G633/6 952HP@1800RPM 6CIL 24VCC RADIADOR MEC';
  await go('insumos'); await p.fill('#insQ', '6M33G633'); await p.waitForTimeout(600); await p.click('tr[data-ins] td.code'); await p.waitForTimeout(400);
  await p.click('#overlay [data-ftab="compras"]'); // ficha em abas: o preço fica em Compras e custos
  const v0 = await p.$eval('#fVal', (x) => x.value); await p.fill('#fVal', '999999'); await p.waitForTimeout(200);
  console.log('3 impacto:', (await txt('#fImp')).slice(0, 300)); await p.click('#fImpCalc'); await p.waitForTimeout(2500); console.log('   calc:', (await txt('#fImpRes')).slice(0, 300));
  await p.click('#fSave'); await p.waitForTimeout(800); console.log('   salvou:', await toast(), 'era', v0);
  // abre a proposta (enviada → preços da época)
  await p.click('#bOpen'); await p.waitForTimeout(300); await p.click('[data-open]'); await p.waitForTimeout(900);
  const P43 = await p.evaluate(() => document.querySelector('.sumbar') ? document.querySelector('.sumbar').innerText.replace(/\s+/g, ' ') : '');
  console.log('4 aberta (enviada):', P43.slice(0, 120));
  await p.click('[data-step="3"]'); await p.waitForTimeout(400); console.log('   banner:', (await txt('#app .banner')).slice(0, 220));
  await p.click('[data-precocmp]'); await p.waitForTimeout(300); console.log('   modal:', (await txt('.modal')).slice(0, 300));
  await p.click('#prTodos'); await p.click('#prOk'); await p.waitForTimeout(800);
  console.log('5 depois de atualizar:', (await p.evaluate(() => document.querySelector('.sumbar').innerText.replace(/\s+/g, ' '))).slice(0, 120), '|', await toast());
  // 6. edição em massa + desfazer
  await go('insumos'); await p.fill('#insQ', 'BASE'); await p.waitForTimeout(600);
  await p.click('#insSelAll'); await p.click('#insLote'); await p.waitForTimeout(300); await p.selectOption('#ltCampo', 'reajuste'); await p.waitForTimeout(150); await p.fill('#ltVal', '10'); await p.waitForTimeout(250);
  console.log('6 prévia:', (await txt('#ltPrev')).slice(0, 200)); await p.click('#ltOk'); await p.click('#ltOk'); await p.waitForTimeout(900); console.log('   ', await toast());
  await go('historico'); await p.waitForTimeout(300); const dz = await p.$('[data-desfaz]'); console.log('   botão desfazer:', !!dz);
  if (dz) { await dz.click(); await dz.click(); await p.waitForTimeout(900); console.log('   desfez:', await toast()); }
  // 7. estrutura em rascunho → diferenças → publicar
  await go('estruturas'); await p.click('[data-estrrasc]'); await p.waitForTimeout(400);
  console.log('7 modo rascunho:', (await txt('#app .banner.warn')).slice(0, 120));
  await p.click('tr[data-recedit]'); await p.waitForTimeout(400); const nm = await p.$eval('.modal input', (x) => x.id + '=' + x.value).catch(() => '?'); console.log('   modal:', nm);
  const q = await p.$('.modal select[id^="r"]'); 
  await p.evaluate(() => { const i = [...document.querySelectorAll('.modal input')].find((x) => /rot|nome/i.test(x.id)); if (i) { i.value = i.value + ' (RASC)'; i.dispatchEvent(new Event('input')); } });
  const sv = await p.$('.modal .btn.pri'); await sv.click(); await p.waitForTimeout(900); console.log('   salvou:', await toast());
  console.log('   card:', (await txt('#app section.card')).slice(0, 200));
  await p.click('[data-rascpub]'); await p.waitForTimeout(12000); console.log('   impacto:', (await txt('#riRes')).slice(0, 300));
  await p.click('#riPub'); await p.waitForTimeout(900); console.log('   publicou:', await toast());
  console.log('erros', errs); await b.close();
})();
