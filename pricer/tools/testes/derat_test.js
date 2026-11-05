// Perda de potência do motor diesel (NFPA 20) pela altitude e temperatura informadas em Dados gerais: o card mostra os campos,
// a PTC troca a frase genérica pelo cálculo, a FD ganha a coluna "Pot. no local" e a nota contra a potência máxima absorvida da curva.
// Sem altitude e temperatura, a frase genérica não entra. Usa a folha real da Sempa (SEMPA_PDF) quando houver.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process'); const L = __dirname + '/libs/';
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : ''; return f && fs.existsSync(L + f) ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(900);
  const SEMPA = process.env.SEMPA_PDF && fs.existsSync(process.env.SEMPA_PDF) ? process.env.SEMPA_PDF : '';
  if (SEMPA) {
    const abre = async () => { await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; }); await p.waitForTimeout(200); };
    await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(800); await abre();
    await p.setInputFiles('[data-fdup="ITEM 01|fab"]', SEMPA); await p.waitForTimeout(4000); await abre();
    await p.fill('[data-cvponto="ITEM 01|q"]', '568').catch(() => {}); await p.fill('[data-cvponto="ITEM 01|h"]', '106').catch(() => {}); await p.press('[data-cvponto="ITEM 01|h"]', 'Tab').catch(() => {}); await p.waitForTimeout(800);
  }
  await p.click('#bSave'); await p.waitForTimeout(600);
  const docs = async () => { await p.click('[data-view="proposta"]'); await p.waitForTimeout(300); await p.evaluate(() => [...document.querySelectorAll('.ptab')].find((e) => /DOCUMENTOS/i.test(e.innerText)).click()); await p.waitForTimeout(700); };
  const gera = async (estilo, nome) => {
    await p.click(`#pcCard input[data-pcopt="estilo"][value="${estilo}"]`, { force: true }); await p.waitForTimeout(500);
    const dl = p.waitForEvent('download', { timeout: 120000 }); await p.click('[data-pcgerar]'); const d = await dl; const f = path.join(__dirname, nome); await d.saveAs(f);
    return execSync(`pdftotext -layout "${f}" - 2>/dev/null`).toString().replace(/[ \t]+/g, ' ');
  };
  await docs();
  // sem altitude/temperatura
  const t0 = await gera('ptc', 'derat_sem.pdf');
  confere('sem altitude e temperatura: a frase genérica de altitude não entra na PTC', !/perda de potência por altitude|corrigida para as condições do local/i.test(t0));
  // com altitude 1200 m e 40 °C
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(300); await p.click('.ptab[data-step="1"]'); await p.waitForTimeout(600);
  if (process.env.DBG) console.log(await p.evaluate(() => [document.querySelectorAll('[data-pc]').length, [...document.querySelectorAll('[data-pc]')].map((x) => x.dataset.pc).join(',')]));
  confere('campos de altitude e temperatura no card', !!(await p.$('[data-pc="altitude"]')) && !!(await p.$('[data-pc="tempAmb"]')));
  for (const [k, v] of [['altitude', '1200'], ['tempAmb', '40']]) { await p.fill(`[data-pc="${k}"]`, v); await p.dispatchEvent(`[data-pc="${k}"]`, 'change'); await p.waitForTimeout(300); }
  await p.click('#bSave'); await p.waitForTimeout(500); await docs();
  const f = (1 - 0.03 * (1200 - 91.44) / 304.8) * (1 - 0.01 * (40 - 25) / 5.556);
  const t1 = await gera('ptc', 'derat_ptc.pdf'); const m1 = t1.replace(/\s+/g, ' ').match(/Potência do motor diesel corrigida[^.]*\(altitude 1\.?200 m, temperatura ambiente 40 °C\)[^:]*: de ([\d.]+) HP para ([\d.]+) HP/);
  confere('PTC: nota com altitude, temperatura e potência corrigida', !!m1, m1 ? m1[0].slice(-40) : t1.match(/Potência do motor[^\n]*/));
  if (m1) { const a = +m1[1].replace(/\./g, ''), c = +m1[2].replace(/\./g, ''); confere('PTC: potência corrigida = nominal × fator NFPA 20', Math.abs(c - a * f) <= 1, a + ' × ' + f.toFixed(4) + ' = ' + (a * f).toFixed(1) + ' → ' + c); }
  const t2 = await gera('fd', 'derat_fd.pdf'); const t2s = t2.replace(/\s+/g, ' ');
  confere('FD: coluna Pot. no local', /Pot\. no local/.test(t2s));
  if (SEMPA) confere('FD: nota potência no local × máxima absorvida na curva', /Potência do diesel no local \(NFPA 20\) [\d.]+ HP × máxima absorvida na curva [\d.]+ HP: (Atende|Não atende)/.test(t2s), (t2s.match(/Potência do diesel no local[^.]*\./) || ['—'])[0]);
  // inglês
  await p.click('#pcCard input[data-pcopt="idioma"][value="en"]', { force: true }); await p.waitForTimeout(800);
  const t3 = (await gera('ptc', 'derat_en.pdf')).replace(/\s+/g, ' ');
  confere('PTC em inglês: nota traduzida', /Diesel engine power derated for site conditions \(altitude 1,?200 m, ambient temperature 40 °C\)[^:]*: from [\d,]+ HP to [\d,]+ HP/.test(t3), (t3.match(/Diesel engine power[^.]*\./) || [''])[0].slice(0, 120) || 'idioma não trocou');
  confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  process.exit(falha.length ? 1 : 0);
})();
