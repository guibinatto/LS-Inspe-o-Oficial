// Modelo da proposta (Cadastro geral): textos (português e inglês), estrutura por tipo de documento e imagens;
// depois gera a proposta e confere que a estrutura e a imagem trocada valeram.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/';
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage(); p.on('dialog', (d) => d.accept());
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : null; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('download', (d) => console.log('download:', d.suggestedFilename()));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#nav [data-view="config"]'); await p.waitForTimeout(300);
  await p.click('[data-cad="propmodelo"]'); await p.waitForTimeout(400);
  const abre = () => p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => { d.open = true; }));
  await abre();
  const ta = '#pm_notasSeq'; const v = await p.inputValue(ta); await p.fill(ta, v + '\nNota de teste do treinamento.'); await p.dispatchEvent(ta, 'change'); await p.waitForTimeout(500);
  console.log('alterado:', await p.$$eval('#app .pill.warn', (x) => x.length) >= 1, '| tem a nota:', (await p.inputValue(ta)).includes('Nota de teste'));
  await abre(); await p.click('[data-pmreset="notasSeq"]'); await p.waitForTimeout(500);
  console.log('depois de voltar:', (await p.inputValue(ta)).includes('Nota de teste') ? 'ainda alterado' : 'original');
  // inglês
  await p.click('input[data-pmlang][value="en"]', { force: true }); await p.waitForTimeout(400); await abre();
  console.log('notas em inglês:', (await p.inputValue('#pm_notasSeq')).split('\n')[1]);
  await p.click('input[data-pmlang][value="pt"]', { force: true }); await p.waitForTimeout(300); await abre();
  // estrutura: tira Soluções da técnica e comercial e sobe Termos
  await p.click('input[data-pmlay="tc|solucoes"]'); await p.waitForTimeout(400); await abre();
  for (let i = 0; i < 3; i++) { await p.click('[data-pmord="termos|-1"]'); await p.waitForTimeout(300); await abre(); }
  console.log('ordem:', await p.$$eval('#app details[data-keep="pm_estr"] tbody tr td:nth-child(2)', (x) => x.map((e) => e.innerText.split(' (')[0].split(':')[0]).join(' › ')));
  // imagem: troca a do Conheça (equipamentos) e diminui para 70%
  await p.setInputFiles('[data-pmup="conheca-seq"]', __dirname + '/curva_teste.png'); await p.waitForTimeout(1500); await abre();
  await p.fill('[data-pmimg="conheca-seq|larg"]', '70'); await p.dispatchEvent('[data-pmimg="conheca-seq|larg"]', 'change'); await p.waitForTimeout(500); await abre();
  console.log('imagem trocada:', await p.$$eval('#app .imgcard .pill.warn', (x) => x.length));
  await p.screenshot({ path: __dirname + '/prop_modelo.png' });
  // gera a proposta com o modelo novo
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(400);
  await (await p.$('#pcCard')).screenshot({ path: __dirname + '/prop_card.png' });
  const dl = p.waitForEvent('download', { timeout: 40000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/prop_modelo.pdf'); await p.waitForTimeout(800);
  console.log('gerado:', d.suggestedFilename());
  console.log('erros', errs); await b.close();
})();
