// PDF sem texto selecionável (ex.: folha "editada" em que o texto virou desenho): o app reconhece o texto na imagem da
// página (tesseract.js), lê as seções e calibra o gráfico em vetor pelos números dos eixos. O PDF de teste sai da folha real
// da Sempa (SEMPA_PDF) com o texto tirado e a imagem da página por baixo (precisa de python3 com PyMuPDF).
// O tesseract.js, o núcleo e o idioma vêm dos pacotes npm em libs/ (npm pack tesseract.js@5.1.1 tesseract.js-core@5.1.1
// @tesseract.js-data/eng@1.0.0, desempacotados como tesseract.js-5.1.1/, tesseract.js-core-5.1.1/, tesseract.js-data-eng-1.0.0/).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs'); const { execFileSync } = require('child_process');
const SRC = process.env.SEMPA_PDF; if (!SRC || !fs.existsSync(SRC) || !fs.existsSync(L + 'tesseract.js-5.1.1')) { console.log('Defina SEMPA_PDF e desempacote o tesseract.js em libs/.'); process.exit(0); }
const PDF = __dirname + '/sempa_sem_texto.pdf';
execFileSync('python3', ['-I', '-c', `import pymupdf,sys
o=pymupdf.open(sys.argv[1]); d=pymupdf.open(sys.argv[1])
for i,pg in enumerate(d):
    px=o[i].get_pixmap(dpi=200)
    for b in pg.get_text('words'): pg.add_redact_annot(pymupdf.Rect(b[:4]))
    pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    pg.insert_image(pg.rect, pixmap=px, overlay=False)
d.save(sys.argv[2])`, SRC, PDF]);
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctxB.newPage();
  await ctxB.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctxB.route('https://cdn.jsdelivr.net/npm/**', (r) => { const u = r.request().url().replace('https://cdn.jsdelivr.net/npm/', ''); const f = u.replace(/^tesseract\.js@5\.1\.1\//, 'tesseract.js-5.1.1/').replace(/^tesseract\.js-core@5\.1\.1\//, 'tesseract.js-core-5.1.1/').replace(/^@tesseract\.js-data\/(\w+)@1\.0\.0\//, 'tesseract.js-data-$1-1.0.0/');
    if (!fs.existsSync(L + f)) return r.abort(); return r.fulfill({ path: L + f, contentType: /\.wasm$/.test(f) ? 'application/wasm' : /\.gz$/.test(f) ? 'application/gzip' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  const abre = async () => { await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(200); };
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600); await abre();
  await p.setInputFiles('[data-fdup="ITEM 01|fab"]', PDF);
  await p.waitForFunction(() => !!document.querySelector('[data-fabler="ITEM 01"]'), null, { timeout: 180000 }); await p.waitForTimeout(2500); await abre();
  const slot = () => p.$eval('[data-fabler="ITEM 01"]', (x) => x.closest('.fdslot').innerText.replace(/\s+/g, ' '));
  const t = await slot(); console.log('1 leitura:', (t.match(/Lido.{0,200}/) || [''])[0]);
  console.log('2 curva:', (t.match(/Redesenhada no padrão LS Fire[^.]*|Não consegui ler a curva[^.]*/) || ['—'])[0].slice(0, 220));
  const prev = await p.$eval('img[data-cvprev="ITEM 01|fab"]', (x) => x.src).catch(() => ''); console.log('3 prévia LS:', prev ? 'gerada' : 'SEM PRÉVIA'); if (prev) fs.writeFileSync(__dirname + '/ocr_curva.png', Buffer.from(prev.split(',')[1], 'base64'));
  console.log('erros', errs); await b.close();
})();
