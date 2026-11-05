// OCR no app publicado: a página é servida por https com uma política de segurança restrita (downloads só da própria
// origem, worker só da própria origem, sem CDN para o leitor de imagem) e os arquivos do tesseract vêm de /_blob/…,
// como no claude.ai. Usa o PDF sem texto gerado por ocr_test.js (sempa_sem_texto.pdf) e os pacotes de libs/.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const L = __dirname + '/libs/';
const PDF = process.env.PDF_SEM_TEXTO || path.join(__dirname, 'sempa_sem_texto.pdf');
const APP = path.resolve(__dirname, '../../dist/ls-pricer.html');
if (!fs.existsSync(PDF) || !fs.existsSync(L + 'tesseract.js-5.1.1')) { console.log('Gere sempa_sem_texto.pdf com ocr_test.js e desempacote o tesseract.js em libs/.'); process.exit(0); }
const BLOB = { '18f67841b54010abc1d2679955837384': 'tesseract.js-5.1.1/dist/tesseract.min.js', '7eb9c54f37001ae424904db44952b1b1': 'ocr-app/tess-worker.js', '6f9522af1df250662c1e3bdb0f8b34c6': 'tesseract.js-core-5.1.1/tesseract-core-simd-lstm.wasm.js', 'e9505f7aac5cb3c77699558cad14e146': 'tesseract.js-core-5.1.1/tesseract-core-lstm.wasm.js' };
const eng = "self.__LSTESS_ENG='" + fs.readFileSync(L + 'tesseract.js-data-eng-1.0.0/4.0.0_best_int/eng.traineddata.gz').toString('base64') + "';";
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; connect-src 'self'; worker-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data:";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const usados = []; const erros = []; p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  await ctx.route('https://app.teste/**', (r) => { const u = new URL(r.request().url()); usados.push(u.pathname);
    if (u.pathname === '/') return r.fulfill({ path: APP, contentType: 'text/html', headers: { 'Content-Security-Policy': CSP } });
    const id = u.pathname.replace('/_blob/', '');
    if (id === 'eb282e29a39f5b75a262db78535a7ed7') return r.fulfill({ body: eng, contentType: 'text/javascript' });
    if (BLOB[id]) return r.fulfill({ path: L + BLOB[id], contentType: 'text/javascript' });
    return r.fulfill({ status: 404, body: '' }); });
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort()); // o CDN do OCR não é alcançável no app publicado
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await p.goto('https://app.teste/'); await p.waitForTimeout(1500);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(900);
  const abre = async () => { await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(200); };
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(800); await abre();
  const t0 = Date.now(); await p.setInputFiles('[data-fdup="ITEM 01|fab"]', PDF);
  await p.waitForFunction(() => { const el = document.querySelector('[data-fabler="ITEM 01"]'); const t = el && el.closest('.fdslot') ? el.closest('.fdslot').innerText : ''; return el && !/Lendo a curva/.test(t); }, null, { timeout: 300000 }); await p.waitForTimeout(2000); await abre();
  const slot = await p.$eval('[data-fabler="ITEM 01"]', (x) => x.closest('.fdslot').innerText.replace(/\s+/g, ' '));
  console.log('1 tempo:', Math.round((Date.now() - t0) / 1000) + ' s');
  console.log('2 leitura:', (slot.match(/Lido.{0,220}/) || [''])[0]);
  console.log('3 curva:', (slot.match(/Redesenhada no padrão LS Fire[^.]*|Não consegui ler a curva[^.]*/) || ['—'])[0].slice(0, 200));
  console.log('4 arquivos do app usados:', [...new Set(usados.filter((u) => u.startsWith('/_blob/')))].length, 'de 5 | CDN do OCR bloqueado');
  // folha de dados da bomba (leitura por linhas) com o mesmo PDF sem texto
  const slotB = () => p.evaluate(() => { const sl = [...document.querySelectorAll('.fdslot')].find((x) => /Folha de dados da bomba/.test(x.innerText)); return sl ? sl.innerText.replace(/\s+/g, ' ') : ''; });
  if (await p.$('[data-fdup="ITEM 01|bomba"]')) await p.setInputFiles('[data-fdup="ITEM 01|bomba"]', PDF);
  for (let k = 0; k < 40 && !/VAI NA PROPOSTA|Nenhum campo|não tem texto/i.test(await slotB()); k++) await p.waitForTimeout(3000);
  console.log('5 folha da bomba:', (await slotB()).slice(0, 260));
  console.log('erros', erros); await b.close();
})();
