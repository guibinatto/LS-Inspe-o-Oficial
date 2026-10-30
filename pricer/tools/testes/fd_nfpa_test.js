// Folha de dados (padrão FD) com o PDF sem texto lido por OCR: curva LS (título, NFPA 20 tracejada, NPSH) e tabelas no PDF
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const T = __dirname + '/'; const L = T + 'libs/'; const fs = require('fs'); const OUT = process.argv[2] || __dirname; if (!fs.existsSync(T + 'sempa_sem_texto.pdf')) { console.log('Gere sempa_sem_texto.pdf com ocr_test.js.'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : /exceljs/.test(u) ? 'exceljs-4.4.0/dist/exceljs.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://cdn.jsdelivr.net/npm/**', (r) => { const u = r.request().url().replace('https://cdn.jsdelivr.net/npm/', ''); const f = u.replace(/^tesseract\.js@5\.1\.1\//, 'tesseract.js-5.1.1/').replace(/^tesseract\.js-core@5\.1\.1\//, 'tesseract.js-core-5.1.1/').replace(/^@tesseract\.js-data\/eng@1\.0\.0\//, 'tesseract.js-data-eng-1.0.0/');
    if (!fs.existsSync(L + f)) return r.abort(); return r.fulfill({ path: L + f, contentType: /\.wasm$/.test(f) ? 'application/wasm' : /\.gz$/.test(f) ? 'application/gzip' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html') + ''); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  const abre = async () => { await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(200); };
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(800); await abre();
  // o item do exemplo (1.370 m³/h) não cai na curva da folha de teste (Sempa 568 m³/h × 106 m): o teste troca só o ponto
  // de trabalho passado à curva e à tabela da NFPA 20 (o resto é a leitura e a montagem reais)
  if (process.env.NOCURVA !== '1') await p.evaluate(() => { const C = window.PricerCurva; const tr = (o) => Object.assign({}, o, { trabalho: [{ q: 568, h: 106, uq: 'm³/h', uh: 'mca' }] });
    const d0 = C.desenhar, n0 = C.nfpa; C.desenhar = (d, o) => d0(d, tr(o)); C.nfpa = (d, o) => n0(d, tr(o)); });
  await p.setInputFiles('[data-fdup="ITEM 01|fab"]', T + 'sempa_sem_texto.pdf');
  await p.waitForFunction(() => { const el = document.querySelector('[data-fabler="ITEM 01"]'); const t = el && el.closest('.fdslot') ? el.closest('.fdslot').innerText : ''; return el && !/Lendo a curva/.test(t); }, null, { timeout: 300000 }); await p.waitForTimeout(2500); await abre();
  const cv = await p.$eval('img[data-cvprev="ITEM 01|fab"]', (x) => x.src).catch(() => ''); if (cv) fs.writeFileSync(OUT + '/curva_nfpa.png', Buffer.from(cv.split(',')[1], 'base64'));
  console.log('prévia da curva:', !!cv);
  await p.click('#bSave'); await p.waitForTimeout(600); await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  await p.click('#pcCard input[data-pcopt="estilo"][value="fd"]', { force: true }); await p.waitForTimeout(600);
  const dl = p.waitForEvent('download', { timeout: 120000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(OUT + '/fd_nfpa.pdf');
  console.log('erros', errs); await b.close();
})();
