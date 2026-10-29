// Modelo da proposta (Cadastro geral): edita uma nota, vê "alterado", volta ao texto original; e o cartão da proposta na aba Documentos.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#nav [data-view="cadastro"]'); await p.waitForTimeout(300); await p.click('[data-cad="geral"]'); await p.waitForTimeout(300);
  await p.click('[data-cad="propmodelo"]'); await p.waitForTimeout(400);
  console.log('tela:', await p.$eval('#app h2', (x) => x.innerText).catch(() => '?'));
  await p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => { d.open = true; }));
  const ta = '#pm_notasSeq'; const v = await p.inputValue(ta); await p.fill(ta, v + '\nNota de teste do treinamento.'); await p.dispatchEvent(ta, 'change'); await p.waitForTimeout(500);
  console.log('alterado:', await p.$$eval('#app .pill.warn', (x) => x.length), '| tem a nota:', (await p.inputValue(ta)).includes('Nota de teste'));
  await p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => { d.open = true; }));
  await p.click('[data-pmreset="notasSeq"]'); await p.waitForTimeout(500);
  console.log('depois de voltar:', (await p.inputValue(ta)).includes('Nota de teste') ? 'ainda alterado' : 'original');
  await p.screenshot({ path: __dirname + '/prop_modelo.png', fullPage: false });
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { document.querySelectorAll('#pcCard details').forEach((d) => { d.open = true; }); });
  await (await p.$('#pcCard')).screenshot({ path: __dirname + '/prop_card.png' });
  console.log('erros', errs); await b.close();
})();
