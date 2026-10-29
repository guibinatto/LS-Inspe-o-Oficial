const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const errs = []; const p = await ctx.newPage(); await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | '))); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  const pend = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('lspricer.pendencias.v1') || '{}')).map((x) => [x.status, x.criticidade, x.departamento, x.titulo.slice(0, 50)].join(' | ')));
  const toast = () => p.$$eval('.toast', (x) => x.map((e) => e.innerText).join(' / ')).catch(() => '');
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  await p.click('#bSave'); await p.waitForTimeout(800);
  console.log('1 automáticas após salvar:', await pend());
  // etapa 5: cartão de pendências da proposta
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.click('[data-step="5"]'); await p.waitForTimeout(300);
  console.log('2 cartão:', await p.$eval('#pnProp h2', (x) => x.innerText).catch(() => 'SEM CARTÃO'));
  // nova manual
  await p.click('#pnProp [data-pnnova]'); await p.waitForTimeout(200);
  await p.fill('#pnTit', 'Confirmar pressão com o cliente'); await p.selectOption('#pnDep', 'Engenharia'); await p.fill('#pnResp', 'Ana'); await p.click('#pnOk'); await p.waitForTimeout(400);
  console.log('3 manual:', await toast(), (await pend()).filter((x) => /pressão/.test(x)));
  // resolver sem solução → bloqueia; com solução → grava com histórico
  await p.click('#pnProp [data-pnabre]'); await p.waitForTimeout(200); const cod = await p.$eval('.modal h2', (x) => x.innerText);
  await p.selectOption('#pnSt', 'resolvida'); await p.click('#pnOk'); await p.waitForTimeout(200); console.log('4 sem solução:', await toast());
  await p.fill('#pnSol', 'Ajustado no cabeçalho'); await p.fill('#pnCom', 'feito'); await p.click('#pnOk'); await p.waitForTimeout(300);
  console.log('5 resolvida:', cod, await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('lspricer.pendencias.v1'))).filter((x) => x.status === 'resolvida').map((x) => x.historico.map((h) => h.texto + ' ' + (h.campos || []).map((c) => c.campo + ':' + c.de + '→' + c.para).join(',')))));
  // auto-resolve: preencher o CNPJ (falta no exemplo) e salvar
  await p.click('[data-step="1"]'); await p.waitForTimeout(200); await p.fill('#cnpjIn', '11222333000181'); await p.press('#cnpjIn', 'Tab'); await p.waitForTimeout(200);
  await p.click('#bSave'); await p.waitForTimeout(800);
  console.log('6 após corrigir CNPJ:', (await pend()).filter((x) => /CNPJ/.test(x)));
  // tela Pendências: acompanhamento com filtros
  await p.click('[data-view="pendencias"]'); await p.waitForTimeout(300);
  console.log('7 acompanhamento:', await p.$eval('#pnAcomp h2', (x) => x.innerText), (await p.$$('#pnAcomp tbody tr')).length, 'linha(s)');
  await p.selectOption('[data-pnf="st"]', 'todas'); await p.waitForTimeout(200); console.log('   todas:', (await p.$$('#pnAcomp tbody tr')).length);
  await p.selectOption('[data-pnf="dep"]', 'Engenharia'); await p.waitForTimeout(200); console.log('   engenharia:', (await p.$$('#pnAcomp tbody tr')).length);
  // revisões: revisar e comparar
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.click('[data-step="6"]'); await p.waitForTimeout(200);
  await p.click('#app [data-revisar]'); await p.waitForTimeout(200); await p.fill('#rvMot', 'novo desconto'); await p.click('#rvOk'); await p.waitForTimeout(1500);
  await p.click('[data-step="4"]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await p.fill('[id$="PROPOSTA_C9"]', '5'); await p.press('[id$="PROPOSTA_C9"]', 'Tab'); await p.waitForTimeout(300); await p.click('#bSave'); await p.waitForTimeout(800);
  await p.click('[data-step="6"]'); await p.waitForTimeout(200); await p.click('#app [data-revs]'); await p.waitForTimeout(500); await p.click('[data-revcmp]'); await p.waitForTimeout(400);
  console.log('8 comparação:', await p.$eval('.modal', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 700)));
  await p.click('.modal [data-close]');
  // enviar ao cliente (início) → congela a versão enviada
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300);
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.click('[data-step="6"]'); await p.waitForTimeout(300);
  const et = await p.$('[data-etp$="|cliente"]'); console.log('9 botão enviar:', !!et); if (et) { await et.click(); await p.waitForTimeout(900); console.log('   ', await toast()); }
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300);
  console.log('10 revisões guardadas:', await p.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('lspricer.revisoes.v1') || '{}')).map(([k, x]) => k.replace(/^p\w+?_/, '_') + ':' + (x.marco || ''))));
  // painel
  console.log('11 painel:', await p.$eval('#painel', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 600)).catch(() => 'SEM PAINEL'));
  await p.selectOption('[data-pnl="div"]', 'SPV'); await p.waitForTimeout(200); console.log('   só SPV:', await p.$eval('#painel', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 160)));
  await p.selectOption('[data-pnl="div"]', 'todas'); await p.waitForTimeout(200);
  // lixeira
  await p.click('#bOpen'); await p.waitForTimeout(300); await p.click('[data-del]'); await p.click('[data-del]'); await p.waitForTimeout(500); console.log('12 excluir:', await toast());
  await p.click('.modal [data-close]').catch(() => {}); await p.waitForTimeout(200);
  await p.click('[data-view="cadastro"]'); await p.click('[data-cad="historico"]'); await p.waitForTimeout(200); await p.click('[data-cad="backup"]'); await p.waitForTimeout(300);
  console.log('13 lixeira:', await p.$$eval('.card h2', (x) => x.map((e) => e.innerText).filter((t) => /lixeira/i.test(t))));
  await p.click('[data-lxrest]'); await p.waitForTimeout(400); console.log('14 restaurar:', await toast(), '· excluída?', await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('lspricer.saved'))).map((x) => !!x.excluida)));
  // perfis
  await p.click('[data-cad="acessos"]'); await p.waitForTimeout(300);
  console.log('15 perfis:', await p.$eval('.t.perm', (x) => x.innerText.split('\n').slice(0, 3).join(' / ').replace(/\s+/g, ' ').slice(0, 300)).catch(() => 'SEM MATRIZ'));
  await p.screenshot({ path: 'p25_perfis.png', fullPage: false });
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('painel').scrollIntoView()); await p.screenshot({ path: 'p25_painel.png' });
  console.log('erros', errs); await b.close();
})();
