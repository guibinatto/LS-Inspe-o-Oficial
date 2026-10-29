// Página publicada com as janelas do navegador bloqueadas (confirm/prompt respondem na hora "não"/vazio, abas novas não
// abrem): os botões abrir, tirar e ler de novo da folha do fabricante e da curva continuam funcionando, com a confirmação e a
// visualização dentro do app. Usa FD_PDF (folha de fabricante).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs');
const PDF = process.env.FD_PDF; if (!PDF || !fs.existsSync(PDF)) { console.log('Defina FD_PDF.'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctxB.newPage();
  await p.addInitScript(() => { window.confirm = () => false; window.prompt = () => null; window.open = () => null; });
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('popup', () => errs.push('abriu aba nova'));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  const abre = async () => { await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(200); };
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600); await abre();
  await p.setInputFiles('[data-fdup="ITEM 01|curva"]', PDF); await p.waitForTimeout(4000); await abre();
  // abrir: quadro com as páginas
  await p.click('.fdslot:has([data-fdup="ITEM 01|curva"]) [data-fdopen], [data-fdtira="ITEM 01|curva"] ~ x', { timeout: 2000 }).catch(async () => { const bt = await p.$$('[data-fdopen]'); await bt[bt.length - 1].click(); });
  await p.waitForTimeout(2500); await p.waitForTimeout(3000); console.log('1 abrir: quadro', !!(await p.$('.dlgwrap')), '| páginas', await p.$$eval('.dlgdoc img', (x) => x.length));
  await p.click('.dlgwrap [data-dlg="n"]'); await p.waitForTimeout(300);
  // tirar: confirmação do app; Cancelar mantém, OK tira
  await p.click('[data-fdtira="ITEM 01|curva"]'); await p.waitForTimeout(300); console.log('2 tirar: pergunta no app', !!(await p.$('.dlgwrap')));
  await p.click('.dlgwrap [data-dlg="n"]'); await p.waitForTimeout(300); await abre(); console.log('3 cancelado: arquivo continua', !!(await p.$('[data-fdtira="ITEM 01|curva"]')));
  await p.click('[data-fdtira="ITEM 01|curva"]'); await p.waitForTimeout(300); await p.click('.dlgwrap [data-dlg="s"]'); await p.waitForTimeout(500); await abre();
  console.log('4 confirmado: arquivo tirado', !(await p.$('[data-fdtira="ITEM 01|curva"]')));
  // ler de novo (folha completa)
  await p.setInputFiles('[data-fdup="ITEM 01|fab"]', PDF); await p.waitForTimeout(4500); await abre();
  await p.click('[data-fabler="ITEM 01"]'); await p.waitForTimeout(300); const perg = !!(await p.$('.dlgwrap')); await p.click('.dlgwrap [data-dlg="s"]'); await p.waitForTimeout(5000); await abre();
  console.log('5 ler de novo: pergunta', perg, '|', await p.$eval('[data-fabler="ITEM 01"]', (x) => x.closest('.fdslot').querySelector('.kv').innerText.replace(/\s+/g, ' ').slice(0, 120)));
  // Cancelar a proposta nova
  await p.click('#bNew'); await p.waitForTimeout(300); await p.click('.dlgwrap [data-dlg="s"]').catch(() => {}); await p.waitForTimeout(300);
  console.log('erros', errs); await b.close();
})();
