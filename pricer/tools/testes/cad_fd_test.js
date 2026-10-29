// Folhas de dados no cadastro: folha técnica da bomba e do motor no insumo (pelo atalho "cadastrar a folha" do item),
// desenho na família de equipamento; a proposta (padrão Folha de dados e Clássico) puxa tudo sozinha.
// Usa FD_PDF (folha de fabricante, ex.: Peerless) como folha da bomba e do motor.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs'); const { execSync } = require('child_process');
const PDF = process.env.FD_PDF; if (!PDF || !fs.existsSync(PDF)) { console.log('Defina FD_PDF.'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  // desenho de teste (PNG)
  const aux = await ctxB.newPage(); await aux.setContent('<html><body style="margin:0"><svg width="900" height="500" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="500" fill="#fff"/><rect x="60" y="120" width="700" height="220" fill="none" stroke="#000" stroke-width="3"/><text x="70" y="60" font-size="28">DESENHO DIMENSIONAL (TESTE)</text></svg></body></html>');
  await aux.screenshot({ path: __dirname + '/desenho_teste.png', clip: { x: 0, y: 0, width: 900, height: 500 } }); await aux.close();
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(500);
  const abreItem = async () => { await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600); await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(200); };
  await abreItem();
  const doCad = () => p.$eval('[data-insabre], .fdslot .lbl', () => [...document.querySelectorAll('.fdslot')].find((x) => /Do cadastro/.test(x.innerText))?.innerText.replace(/\s+/g, ' ') || 'sem bloco');
  console.log('1 antes:', await doCad());
  // cadastra a folha da bomba e a do motor pelo atalho
  for (const uso of ['Bomba', 'Motor']) {
    const bt = await p.$$eval('[data-insabre]', (x, uso) => { const e = x.find((y) => y.parentElement.innerText.includes(uso)); return e ? e.dataset.insabre : null; }, uso);
    if (!bt) { console.log('  sem atalho para', uso); continue; }
    await p.click(`[data-insabre="${bt}"]`); await p.waitForTimeout(600);
    // o clique no quadro abre a janela de arquivo (o bloco não pode reabrir o cadastro)
    const fc = p.waitForEvent('filechooser', { timeout: 3000 }).then(() => 'abre').catch(() => 'NÃO ABRE'); await p.click('#fdtBox label.drop'); console.log('  janela de arquivo:', await fc);
    await p.setInputFiles(`[data-fdtup="${bt}"]`, PDF); await p.waitForTimeout(4000);
    console.log('2 ' + uso + ' no cadastro:', await p.$eval('#fdtBox .kv', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => 'NÃO LEU'));
    await p.click('#overlay [data-close]').catch(() => p.keyboard.press('Escape')); await p.waitForTimeout(400);
  }
  // desenho na família SKID
  await p.click('[data-view="cadastro"]'); await p.waitForTimeout(200); await p.click('.areatabs [data-cad="estruturas"]'); await p.waitForTimeout(200); await p.click('[data-cad="familias"]'); await p.waitForTimeout(400);
  const eq = await p.$$eval('[data-eqedit]', (x) => (x.find((e) => /SKID|Skid/.test(e.closest('tr').innerText)) || {}).dataset?.eqedit);
  await p.click(`[data-eqedit="${eq}"]`); await p.waitForTimeout(500);
  await p.setInputFiles('#desBox [data-desup^="equip|"]', __dirname + '/desenho_teste.png'); await p.waitForTimeout(1500);
  console.log('3 desenho:', await p.$eval('#desBox', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 160)));
  await p.click('#overlay [data-close]').catch(() => {}); await p.waitForTimeout(300);
  await abreItem(); console.log('4 no item:', await doCad());
  // gera nos dois padrões
  await p.click('#bSave'); await p.waitForTimeout(600); await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  const gera = async (nome) => { const dl = p.waitForEvent('download', { timeout: 60000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/' + nome); await p.waitForTimeout(2500); return d.suggestedFilename(); };
  const opt = async (nome, v) => { await p.click(`#pcCard input[data-pcopt="${nome}"][value="${v}"]`, { force: true }); await p.waitForTimeout(600); };
  await gera('cad_classico.pdf'); await opt('estilo', 'fd'); await gera('cad_fd.pdf');
  const tx = (f) => execSync('pdftotext ' + __dirname + '/' + f + ' - 2>/dev/null').toString();
  const c = tx('cad_classico.pdf'), f = tx('cad_fd.pdf');
  console.log('5 clássico: bomba do cadastro', /Bomba Centr[ií]fuga — SCE 250-450|Centrifugal|Flange/.test(c), '| desenho', /Desenho/.test(c));
  console.log('6 folha de dados: construtiva do cadastro', /FOLHA DE DADOS CONSTRUTIVA — ITEM 1/.test(f), '| desenho', /DESENHO — ITEM 1/.test(f), '| flange', /Flange de sucção/.test(f));
  console.log('erros', errs); await b.close();
})();
