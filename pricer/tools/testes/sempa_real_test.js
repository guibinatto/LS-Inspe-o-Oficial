// Folha real da Sempa (SEMPA_PDF: PDF de seleção com Technical Data, Tender Hydraulic e Dimensional Data; não fica no
// repositório). Confere a leitura das seções, a curva lida do gráfico em vetor e redesenhada no padrão LS Fire (no campo
// "Curva da bomba" e na folha completa do fabricante), a proposta nos dois padrões e o botão Cancelar da proposta nova.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs'); const { execSync } = require('child_process');
const PDF = process.env.SEMPA_PDF; if (!PDF || !fs.existsSync(PDF)) { console.log('Defina SEMPA_PDF.'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  // Cancelar na proposta nova (ainda não salva): no topo e ao lado da situação
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  console.log('0 cancelar visível na proposta nova:', await p.$eval('#bCancel', (x) => !x.hidden), '| no cabeçalho:', !!(await p.$('[data-cancelar]')));
  const abre = async () => { await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600); await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); };
  await abre();
  await p.setInputFiles('[data-fdup="ITEM 01|curva"]', PDF); await p.waitForTimeout(4000); await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(2500);
  const cv = await p.$eval('img[data-cvprev="ITEM 01|curva"]', (x) => x.src).catch(() => '');
  console.log('1 campo curva: página', await p.$eval('[data-fdpag="ITEM 01"]', (x) => x.value), '| prévia LS', cv ? 'gerada' : 'SEM PRÉVIA', '|', await p.$eval('img[data-cvprev="ITEM 01|curva"]', (x) => x.previousElementSibling.innerText).catch(() => ''));
  if (cv) fs.writeFileSync(__dirname + '/sempa_real_curva.png', Buffer.from(cv.split(',')[1], 'base64'));
  await p.setInputFiles('[data-fdup="ITEM 01|fab"]', PDF); await p.waitForTimeout(4500); await abre(); await p.waitForTimeout(2500);
  console.log('2 seções:', await p.$$eval('[data-fabler="ITEM 01"]', (x) => [...x[0].closest('.fdslot').querySelectorAll('details summary')].map((s) => s.innerText.replace(/\s+/g, ' ')).join(' | ')));
  console.log('3 folha completa, prévia LS:', !!(await p.$eval('img[data-cvprev="ITEM 01|fab"]', (x) => x.src).catch(() => '')), '| sem opção de imagem do fabricante:', !(await p.$('[data-fabcm]')));
  await p.click('#bSave'); await p.waitForTimeout(600); await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  const gera = async (nome) => { const dl = p.waitForEvent('download', { timeout: 60000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/' + nome); await p.waitForTimeout(2500); return d.suggestedFilename(); };
  await gera('sempa_classico.pdf'); await p.click('#pcCard input[data-pcopt="estilo"][value="fd"]', { force: true }); await p.waitForTimeout(600); await gera('sempa_fd.pdf');
  const tx = (f) => execSync('pdftotext -layout ' + __dirname + '/' + f + ' - 2>/dev/null').toString();
  const f = tx('sempa_fd.pdf');
  console.log('4 FD: motor', /Motor Data|Dados do motor/i.test(f), '| rotor máx', /Impeller D Max|rotor.*m[áa]x/i.test(f), '| escopo bomba', /Bomba centr[ií]fuga|Motobomba/.test(f));
  console.log('erros', errs); await b.close();
})();
