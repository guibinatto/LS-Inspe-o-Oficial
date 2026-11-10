// Importar propostas de serviços e peças (SPV): IMP_SPV_SERV = "planilha MASTERDOC;planilha LS PRICER do serviço;PDF do serviço"
// e IMP_SPV_PECA = "planilha LS PRICER da peça;PDF da peça" (arquivos separados por ";"). Confere tipo, custo, preço mantido,
// código, escopo, textos e o PDF gerado.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process'); const L = __dirname + '/libs/';
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const SERV = (process.env.IMP_SPV_SERV || '').split(';').filter(Boolean), PECA = (process.env.IMP_SPV_PECA || '').split(';').filter(Boolean);
if (!SERV.length && !PECA.length) { console.log('Informe IMP_SPV_SERV e/ou IMP_SPV_PECA.'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : /exceljs/.test(u) ? 'exceljs-4.4.0/dist/exceljs.min.js' : ''; return f && fs.existsSync(L + f) ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  const importa = async (arqs, nome, esp) => {
    await p.click('#bNew'); await p.waitForTimeout(300); await p.click('#mImport'); await p.waitForTimeout(300); await p.setInputFiles('#impArq', arqs);
    await p.waitForFunction(() => !/Lendo os arquivos/.test((document.getElementById('impPrev') || {}).innerText || ''), null, { timeout: 120000 });
    const prev = await p.$eval('#impPrev', (x) => x.innerText.replace(/\s+/g, ' ')); console.log('  ' + nome + ': ' + prev.slice(0, 700));
    confere(nome + ': prévia reconhece ' + esp.tipoTxt, new RegExp(esp.tipoTxt).test(prev));
    confere(nome + ': custo ' + esp.custo, prev.includes(esp.custo));
    await p.click('#impOk'); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lspricer.current') || '{}'); return { div: s.div, spv: s.spv, pc: s.propCom }; });
    confere(nome + ': proposta SPV ' + esp.tipo + ' criada', st.div === 'SPV' && st.spv && st.spv.tipo === esp.tipo && st.spv.numero === esp.numero && st.spv.cnpj === '60.621.141/0004-04', st.spv && [st.spv.tipo, st.spv.numero, st.spv.cnpj].join(' · '));
    await p.click('#bSave'); await p.waitForTimeout(800);
    const tela = await p.evaluate(() => document.getElementById('app').innerText.replace(/\s+/g, ' '));
    confere(nome + ': total ' + esp.total + ' na tela', tela.includes(esp.total));
    const dl = p.waitForEvent('download', { timeout: 120000 }); await p.evaluate(() => { const b = document.querySelector('[data-pcgerar]'); if (b) b.click(); }); const d = await dl.catch(() => null);
    if (!d) { confere(nome + ': PDF gerado', false); return; }
    const f = path.join(__dirname, 'imp_spv_' + esp.tipo + '.pdf'); await d.saveAs(f); const t = execSync(`pdftotext -layout "${f}" - 2>/dev/null`).toString().replace(/[ \t]+/g, ' ');
    confere(nome + ': PDF com código, preço, escopo e textos', t.includes(esp.codigo) && t.includes(esp.total) && t.includes(esp.escopo) && t.includes(esp.nota), [esp.codigo, esp.total, esp.escopo, esp.nota].map((x) => (t.includes(x) ? '✓' : '✗ ' + x)).join(' · '));
  };
  if (SERV.length) await importa(SERV, 'serviço', { tipoTxt: 'SMC · Serviço', tipo: 'SMC', numero: '10.339', custo: 'R$ 2.530,00', total: 'R$ 5.233,49', codigo: 'SERV-017', escopo: 'Remoção do radiador atualmente instalado', nota: 'mão de obra de 02 (dois) técnicos' });
  if (PECA.length) await importa(PECA, 'peça', { tipoTxt: 'PAR · Peças', tipo: 'PAR', numero: '10.342', custo: 'R$ 17.999,69', total: 'R$ 37.233,71', codigo: '033-06130', escopo: 'Fornecimento de radiador destinado', nota: 'exclusivamente o radiador especificado' });
  confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  process.exit(falha.length ? 1 : 0);
})();
