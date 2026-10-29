const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort()); await p.route('https://cdnjs.cloudflare.com/**', (r) => r.abort());
  await p.route('https://publica.cnpj.ws/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ razao_social: 'Cooperativa Teste Ltda', natureza_juridica: { id: '2143' }, estabelecimento: { nome_fantasia: 'TESTE', situacao_cadastral: 'Ativa', estado: { sigla: 'PR' }, cidade: { nome: 'Maringá' }, atividade_principal: { id: '1061901' }, inscricoes_estaduais: [{ inscricao_estadual: '123', ativo: true, estado: { sigla: 'PR' } }] } }) }));
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  // vendedores
  await p.click('[data-view="cadastro"]'); await p.click('[data-cad="preco"]'); await p.waitForTimeout(300);
  for (const [n, pa] of [['Guilherme Valentim', 'vendedor'], ['Thiago Souza', 'vendedor'], ['Rep Sul', 'an']]) { await p.fill('#vNome', n); await p.click('label:has(' + `input[name="vPapel"][value="${pa}"]` + ')'); await p.click('#vAdd'); await p.waitForTimeout(250); }
  console.log('equipe:', await p.$eval('section.card table', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300);
  await p.click('[data-seqfam="CONJUNTO MOTOBOMBA"]'); await p.waitForTimeout(500);
  console.log('view:', await p.$eval('#nav [aria-current="page"]', (x) => x.textContent), '| h2:', await p.$$eval('#app h2', (x) => x.map((e) => e.innerText.split('\n')[0]).join(' / ')));
  await p.click('[data-cabnext]'); await p.waitForTimeout(300); console.log('falta:', await p.$eval('.flowbar .sub', (x) => x.innerText), '| miss:', (await p.$$('.f.miss')).length);
  await p.click('.ptab[data-step="2"]'); await p.waitForTimeout(300); console.log('item bloqueado? view =', await p.$eval('#nav [aria-current="page"]', (x) => x.textContent));
  await p.fill('#cnpjIn', '79.114.450/0001-21'); await p.press('#cnpjIn', 'Tab'); await p.waitForTimeout(200); await p.click('#cnpjGo'); await p.waitForTimeout(800);
  console.log('cnpj msg:', await p.$eval('#cnpjMsg', (x) => x.innerText));
  const sel = async (a, i = 1) => { const el = await p.$(`[id$="PROPOSTA_${a}"]`); const tag = await el.evaluate((x) => x.tagName); if (tag === 'SELECT') { const o = await el.$$eval('option', (x) => x.map((y) => y.value)); await el.selectOption(o[i]); } else if (tag === 'INPUT') { await el.fill('X1'); await el.press('Tab'); } else { const r = await el.$$('input'); await r[i].evaluate((x) => x.closest('label').click()); } await p.waitForTimeout(250); };
  console.log('cliente:', await p.$eval('[id$="PROPOSTA_F5"]', (x) => x.value || x.innerText).catch(() => '?'));
  await sel('F8'); await sel('C5'); await p.fill('[id$="PROPOSTA_C10"]', '15 dias'); await p.press('[id$="PROPOSTA_C10"]', 'Tab'); await p.waitForTimeout(200); await sel('J6'); await sel('F9'); await sel('B13');
  await p.click('label:has(' + 'input[data-ppcell="C8"][value="THIAGO SOUZA"]' + ')').catch(async () => { await p.click('label:has(' + 'input[data-ppcell="C8"]' + ')'); }); await p.waitForTimeout(250);
  await p.click('label:has(' + 'input[data-pcom="J8"]' + ')'); await p.waitForTimeout(250);
  await p.click('[data-cabnext]'); await p.waitForTimeout(300); console.log('falta 2:', await p.$eval('.flowbar .sub', (x) => x.innerText));
  await p.screenshot({ path: 'cab_1.png', fullPage: true });
  await p.click('label:has(' + 'input[data-ppcell="L8"]' + ')'); await p.waitForTimeout(250);
  const miss = await p.$eval('.flowbar .sub', (x) => x.innerText); if (miss) console.log('ainda falta:', miss);
  await p.click('[data-cabnext]'); await p.waitForTimeout(500);
  console.log('depois:', await p.$eval('#nav [aria-current="page"]', (x) => x.textContent), '| família:', await p.$eval('[id$="ITEM01_C21"]', (x) => x.value || x.innerText).catch(() => '?'));
  console.log('erros', errs); await b.close();
})();
