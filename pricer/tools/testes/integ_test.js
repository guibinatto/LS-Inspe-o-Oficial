const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const nova = async () => { const p = await ctx.newPage(); await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200); return p; };
  const errs = []; const A = await nova();
  const st = async (p) => { await p.waitForTimeout(1700); return p.$eval('#saveSt', (x) => (x.hidden ? '(oculto) ' : '') + x.innerText); };
  await A.click('#bNew'); await A.click('#mExample'); await A.waitForTimeout(800);
  console.log('1 novo:', await st(A));
  await A.click('#bSave'); await A.waitForTimeout(500); console.log('2 salvo:', await st(A));
  const edita = async (p, v) => { await p.click('[data-view="proposta"]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); await p.fill('[id$="PROPOSTA_C9"]', v); await p.press('[id$="PROPOSTA_C9"]', 'Tab'); await p.waitForTimeout(300); };
  await edita(A, '2'); console.log('3 editado:', await st(A));
  // recarregar: rascunho recuperado
  await A.reload(); await A.waitForTimeout(1300); await A.click('[data-view="proposta"]'); await A.waitForTimeout(300);
  console.log('4 recarregou:', await st(A), '|', await A.$eval('#app .banner.warn', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'sem banner'));
  await A.click('[data-recsalva]'); await A.waitForTimeout(600); console.log('5 salvou recuperado:', await st(A));
  // conflito: B abre a mesma proposta, edita e salva; A edita e salva
  const B = await nova(); await B.click('#bOpen'); await B.waitForTimeout(300); await B.click('[data-open]'); await B.waitForTimeout(600);
  await edita(B, '3'); await B.click('#bSave'); await B.waitForTimeout(600); console.log('6 B salvou:', await st(B));
  await A.bringToFront(); await A.click('[data-view="inicio"]'); await A.waitForTimeout(200); await edita(A, '4');
  console.log('7 A vê aviso:', await A.$eval('#app .banner.warn', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'sem aviso'));
  await A.click('#bSave'); await A.waitForTimeout(600); console.log('8 conflito:', await A.$eval('.modal h2', (x) => x.innerText).catch(() => 'SEM MODAL'));
  await A.click('#cfGuarda'); await A.waitForTimeout(1200); console.log('9 resolveu:', await st(A));
  await A.click('[data-revs]'); await A.waitForTimeout(500); console.log('10 revisões:', await A.$$eval('.modal tbody tr', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 110))));
  await A.click('.modal [data-close]');
  // falha de armazenamento
  await A.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { const e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e; }; window.__restaura = () => { Storage.prototype.setItem = o; }; });
  await edita(A, '6'); await A.click('#bSave'); await A.waitForTimeout(600); console.log('11 sem espaço:', await st(A), '|', await A.$eval('#app .banner.bad', (x) => x.innerText.slice(0, 90)).catch(() => 'sem banner'));
  await A.evaluate(() => window.__restaura());
  // aviso ao fechar com alteração pendente
  let pediu = false; A.on('dialog', (d) => { if (d.type() === 'beforeunload') pediu = true; });
  await A.close({ runBeforeUnload: true }); await new Promise((r) => setTimeout(r, 800)); console.log('12 aviso ao fechar:', pediu);
  console.log('erros', errs); await b.close();
})();
