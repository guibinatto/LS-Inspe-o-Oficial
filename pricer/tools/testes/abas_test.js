const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
// duas abas do mesmo navegador: cada uma fica com a sua proposta; alteração não salva de outra proposta aparece na tela inicial
const URL = 'file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('https://**', (r) => r.abort());
  const nova = async () => { const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); await p.goto(URL); await p.waitForTimeout(1300); return p; };
  const nome = (p) => p.evaluate(() => document.querySelector('#docName').innerText);
  const setSp = (p, k, v) => p.$eval(`[data-sp="${k}"]`, (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  // aba A: SPV do cliente Alfa, salva e depois alterada (sem salvar)
  const A = await nova();
  await A.evaluate(() => document.querySelector('[data-spvnew="PAR"]').click()); await A.waitForTimeout(600);
  await setSp(A, 'cliente', 'Cliente Alfa'); await A.waitForTimeout(300); await A.click('#bSave'); await A.waitForTimeout(900);
  await setSp(A, 'contato', 'Contato só na aba A'); await A.waitForTimeout(2200);
  // aba B: abre e começa outra SPV (cliente Beta)
  const B = await nova(); await B.click('[data-view="inicio"]').catch(() => {}); await B.waitForTimeout(400);
  await B.evaluate(() => document.querySelector('[data-spvnew="SMC"]').click()); await B.waitForTimeout(700);
  await setSp(B, 'cliente', 'Cliente Beta'); await B.waitForTimeout(2200);
  // A recarrega: continua na proposta dela, com a alteração
  await A.reload(); await A.waitForTimeout(1500);
  confere('aba A recarregada continua na proposta dela', /Alfa/.test(await nome(A)), await nome(A));
  await A.evaluate(() => { const b = document.querySelector('#nav [data-view="proposta"]'); if (b) b.click(); }); await A.waitForTimeout(500);
  confere('a alteração não salva da aba A continua', (await A.$eval('[data-sp="contato"]', (x) => x.value).catch(() => '')).toLowerCase() === 'contato só na aba a');
  // fecha as duas; uma aba nova mostra o rascunho que não é o "onde parou"
  await A.close(); await B.close();
  const C = await nova(); await C.click('[data-view="inicio"]').catch(() => {}); await C.waitForTimeout(500);
  const lista = await C.$eval('.rasclist', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => '');
  confere('tela inicial lista o rascunho da outra proposta', /Alterações não salvas/.test(lista) && /(Alfa|Beta)/.test(lista), lista.slice(0, 160));
  const atual = await nome(C);
  await C.evaluate(() => document.querySelector('[data-rascabrir]').click()); await C.waitForTimeout(600);
  if (await C.$('.dlgwrap')) { await C.click('.dlgwrap [data-dlg="manter"]'); await C.waitForTimeout(600); }
  const recuperado = await nome(C);
  confere('Abrir recupera o outro rascunho', recuperado !== atual && /(Alfa|Beta)/.test(recuperado), atual + ' → ' + recuperado);
  for (const x of ok) console.log('  ok  ' + x); for (const x of falha) console.log('  FALHA  ' + x);
  console.log(`Abas e rascunhos: ${ok.length} ok, ${falha.length} falha(s)`); await b.close(); process.exit(falha.length ? 1 : 0);
})();
