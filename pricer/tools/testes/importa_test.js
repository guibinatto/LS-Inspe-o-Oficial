// Importar proposta antiga: planilha LS PRICER (formação) + PDFs da técnica e da comercial. Com IMP_XLSX, IMP_TEC e IMP_COM
// (arquivos reais), confere a leitura, o preço mantido, os textos, as tabelas novas (parcelas, volumes, opção) e a emissão
// da técnica e da comercial em dois PDFs.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process'); const L = __dirname + '/libs/';
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const XL = process.env.IMP_XLSX, TEC = process.env.IMP_TEC, COM = process.env.IMP_COM;
if (!XL || !fs.existsSync(XL)) { console.log('Informe IMP_XLSX (e IMP_TEC, IMP_COM) com os arquivos da proposta a importar.'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : /exceljs/.test(u) ? 'exceljs-4.4.0/dist/exceljs.min.js' : ''; return f && fs.existsSync(L + f) ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const txt = (s) => p.$eval(s, (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => '');
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  await p.click('#bNew'); await p.waitForTimeout(300);
  confere('botão Importar proposta antiga em Nova proposta', !!(await p.$('#mImport'))); await p.click('#mImport'); await p.waitForTimeout(300);
  const t0 = Date.now(); await p.setInputFiles('#impArq', [XL, TEC, COM].filter((f) => f && fs.existsSync(f)));
  await p.waitForFunction(() => !/Lendo os arquivos/.test((document.getElementById('impPrev') || {}).innerText || ''), null, { timeout: 120000 });
  const prev = await txt('#impPrev'); console.log('  leitura em ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s'); console.log('  prévia: ' + prev.slice(0, 900));
  confere('prévia: versão da planilha e PDFs reconhecidos', /REV12/.test(prev) && /técnica/.test(prev) && /comercial/.test(prev));
  confere('prévia: número, revisão e cliente', /10\.262/.test(prev) && /rev\. 5/.test(prev) && /IPIRANGA/.test(prev));
  confere('prévia: custo igual ao da planilha', /R\$ 556\.097,20/.test(prev) && !/planilha R\$/.test(prev));
  confere('prévia: preço da planilha, do PDF e do app', /R\$ 1\.090\.070,53/.test(prev) && /R\$ 1\.181\.732,20/.test(prev));
  confere('prévia: textos (notas, desvios, exclusões, parcelas, volumes, opção)', /notas \d+/.test(prev) && /desvios da especificação \d+/.test(prev) && /exclusões \d+/.test(prev) && /parcelas 2/.test(prev) && /volumes 3/.test(prev) && /opções de fornecimento 1/.test(prev));
  await p.click('#impOk'); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lspricer.current') || '{}'); return { doc: s.doc, pc: s.propCom, imp: s.importada }; });
  confere('proposta criada com o cabeçalho', st.doc && st.doc.PROPOSTA.C5 === '10.262' && st.doc.PROPOSTA.C6 === '5' && st.doc.PROPOSTA.F5 === 'IPIRANGA', JSON.stringify(st.doc && st.doc.PROPOSTA).slice(0, 200));
  confere('escopo: 36 linhas no escopo à mão', st.doc && st.doc['ITEM 01'].D68 && st.doc['ITEM 01'].D103 && !st.doc['ITEM 01'].D104);
  confere('código do item e textos guardados', st.pc && st.pc.codigos && st.pc.codigos['ITEM 01'] === '008-00167' && (st.pc.parcelas || []).length === 2 && (st.pc.volumes || []).length === 3 && (st.pc.opcoes || []).length === 1 && st.pc.opcoes[0].valor === -25000, JSON.stringify(st.pc && { c: st.pc.codigos, p: st.pc.parcelas, o: st.pc.opcoes }).slice(0, 300));
  // preço mantido: o da planilha
  await p.click('#bSave'); await p.waitForTimeout(800);
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(300); await p.evaluate(() => [...document.querySelectorAll('.ptab')].find((e) => /DOCUMENTOS/i.test(e.innerText)).click()); await p.waitForTimeout(800);
  const card = await txt('#pcCard'); const tot = (card.match(/total (R\$ [\d.,]+)/) || [])[1];
  confere('preço da proposta = preço da planilha', tot === 'R$ 1.090.070,53', tot);
  // dois PDFs: técnica e comercial
  const dls = []; p.on('download', (d) => dls.push(d)); await p.click('[data-pcgerar2]');
  for (let i = 0; i < 120 && dls.length < 2; i++) await p.waitForTimeout(500);
  confere('Técnica + Comercial: dois PDFs', dls.length === 2, dls.map((d) => d.suggestedFilename()).join(' | '));
  const tx = []; for (const [i, d] of dls.entries()) { const f = path.join(__dirname, 'importa_' + i + '.pdf'); await d.saveAs(f); tx.push(execSync(`pdftotext -layout "${f}" - 2>/dev/null`).toString().replace(/[ \t]+/g, ' ')); }
  const [tec, com] = tx;
  if (tec && com) {
    confere('técnica sem preços', !/R\$ ?1\.090/.test(tec) && /T[ÉE]CNICA/i.test(tec));
    confere('comercial com o preço e o código', /1\.090\.070,53/.test(com) && /008-00167/.test(com));
    confere('comercial: parcelas por marco', /Parcelas de pagamento/i.test(com) && /30%/.test(com) && /70%/.test(com) && /30 DDL/.test(com));
    confere('comercial: dimensões e pesos', /Dimensões e pesos para transporte/i.test(com) && /5\.000 mm/.test(com) && /4\.500 kg/.test(com));
    confere('comercial: opção sem a jockey com abatimento', /SEM A BOMBA JOCKEY/i.test(com) && /abatimento de R\$ 25\.000,00/.test(com));
    confere('desvios da especificação no texto', /Item 5\.3 da especificação técnica:/.test(com));
    confere('notas e exclusões importadas', /O skid é composto por seis painéis/.test(com) && /Interligação do Flexível escape/.test(com));
    confere('sem a frase genérica de altitude', !/perda de potência por altitude/.test(com + tec));
  }
  confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  process.exit(falha.length ? 1 : 0);
})();
