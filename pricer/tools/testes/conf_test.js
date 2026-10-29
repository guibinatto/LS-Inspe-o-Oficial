const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/';
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdf.worker.min.js' : null; return f ? r.fulfill({ path: L + 'pdfjs-dist-3.11.174/build/' + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
  const itens = [];
  for (const i of [0, 1, 2]) { await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.click(`[data-goitem="${i}"]`); await p.waitForTimeout(400); await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); const t = await p.$$eval('.txtv', (x) => x.map((e) => e.innerText)); itens.push({ d: t[0], ponto: t[2] }); }
  await p.click('[data-view="proposta"]'); await p.click('[data-step="4"]'); await p.waitForTimeout(400);
  const precos = await p.$$eval('#app table.t tbody tr', (x) => x.filter((r) => r.querySelector('[data-goitem]')).map((r) => [...r.querySelectorAll('td')].map((td) => td.innerText)));
  console.log('home etapa:', 'ok'); console.log('preços:', precos.map((r) => r.slice(2, 5).join(' | ')));
  const html = (erro) => `<html><body style="font-family:Arial;font-size:11px"><h2>LS FIRE — PROPOSTA COMERCIAL Nº 10.102 / 10.116 — REVISÃO 3</h2>
    <p>Cliente: COCAMAR COOPERATIVA AGROINDUSTRIAL — SEDE</p><p>Norma: NFPA 20. Frete: FOB — por conta do cliente.</p>
    <table border=1>${itens.map((it, i) => `<tr><td>${i + 1}</td><td>${erro && i === 1 ? it.d.replace('221HP ', '') : it.d}<br>${it.ponto}</td><td>${precos[i][2]}</td><td>${erro && i === 1 ? 'R$ 415.000,00' : precos[i][4]}</td></tr>`).join('')}</table>
    <p>VALOR TOTAL: R$ 4.258.300,00</p><p>Condição de pagamento: 30% ENTRADA + 30% NA ENTREGA DOS DESENHOS TÉCNICOS + 20% NO EMBARQUE + 20% 28DDL</p></body></html>`;
  const pg = await ctxB.newPage();
  for (const [nm, er] of [['prop_ok.pdf', false], ['prop_erro.pdf', true]]) { await pg.setContent(html(er)); await pg.pdf({ path: __dirname + '/' + nm }); }
  // home: próximo passo
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); console.log('home antes:', await p.$eval('.home tbody tr.click .hacts', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('.home [data-hnext]'); await p.waitForTimeout(500); console.log('abriu no card:', !!(await p.$('#confCard')));
  await p.setInputFiles('#confUp', __dirname + '/prop_erro.pdf'); await p.waitForTimeout(2500);
  console.log('erro → ', await p.$eval('#confCard .banner', (x) => x.innerText));
  console.log(await p.$$eval('#confCard tr.cf-erro, #confCard tr.cf-aviso', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 130))));
  await (await p.$('#confCard')).screenshot({ path: __dirname + '/conf_erro.png' });
  await p.setInputFiles('#confUp', __dirname + '/prop_ok.pdf'); await p.waitForTimeout(2500);
  console.log('ok → ', await p.$eval('#confCard .banner', (x) => x.innerText), '|', await p.$eval('#confCard .pill', (x) => x.innerText));
  console.log('avisos/erros:', await p.$$eval('#confCard tr.cf-erro, #confCard tr.cf-aviso', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 130))));
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); console.log('home depois:', await p.$eval('.home tbody tr.click .hacts', (x) => x.innerText.replace(/\s+/g, ' ')), '|', await p.$eval('.home .etapas', (x) => x.innerText.replace(/\s+/g, ' ')));
  await p.click('[data-view="documentos"]'); await p.waitForTimeout(400); console.log('documentos:', (await p.$eval('#app', (x) => x.innerText)).includes('prop_ok.pdf'));
  console.log('erros', errs); await b.close();
})();
