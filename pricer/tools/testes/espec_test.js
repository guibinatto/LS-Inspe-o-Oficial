// Famílias 46 (testes e ensaios) e 47 (documentos e desenhos) e especificação por componente: a pintura especial
// abre os campos no item, o essencial vazio gera alerta com "Especificar", e o que foi preenchido vai para a folha de dados do PDF.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const { execSync } = require('child_process');
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url();
    const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : '';
    return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  const fill = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'change'); await p.waitForTimeout(250); };
  const cad = async (area, tab) => { await p.click('[data-view="cadastro"]'); await p.waitForTimeout(200); await p.click('.areatabs [data-cad="' + area + '"]'); await p.waitForTimeout(300); if (tab && tab !== area) { await p.click('[data-cad="' + tab + '"]'); await p.waitForTimeout(300); } };
  // 1. famílias novas na lista
  await cad('estruturas', 'familias').catch(async () => cad('insumos', 'familias'));
  const fams = await p.$$eval('#app table.t tbody tr', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')).filter((t) => /^4[67]\b/.test(t)));
  console.log('1 famílias:', fams.join(' | ') || 'NÃO ACHOU');
  // 2. sugestões da estrutura: pintura especial e teste de desempenho (cria o insumo em 46)
  await cad('estruturas');
  for (const id of ['pintura', 'teste']) await p.check('[data-sug="' + id + '"]');
  await p.click('[data-sugapply]'); await p.waitForTimeout(1200);
  const ins = await p.evaluate(() => { const m = (JSON.parse(localStorage.getItem('lspricer.registry.v1') || '{}').insumos || []); return m.filter((x) => /TESTE DE DESEMPENHO/.test(x.produto)).map((x) => x.fam + ' ' + x.produto); }).catch(() => []);
  console.log('2 insumo criado:', ins.join(' | ') || '(ver no cadastro)');
  // 3. proposta exemplo, item 01: marca o opcional pintura especial
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(500);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="comp"]'); if (d) d.open = true; });
  await p.click('[data-addrow]'); await p.waitForTimeout(400);
  const idC = await p.evaluate(() => document.activeElement && document.activeElement.id); const r = idC.replace(/^.*_C/, '');
  const tag = await p.$eval('#' + idC, (x) => x.tagName);
  if (tag === 'SELECT') { await p.selectOption('#' + idC, '35.PINTURAESPECIAL'); } else await fill('#' + idC, '35.PINTURAESPECIAL');
  await p.waitForTimeout(500); await p.selectOption('#c_ITEM01_D' + r, { label: 'PINTURA ESPECIAL PADRÃO PETROBRÁS N-1731' }).catch(async () => { const o = await p.$$eval('#c_ITEM01_D' + r + ' option', (x) => x.map((e) => e.value)); console.log('opções:', o.join(' | ')); await p.selectOption('#c_ITEM01_D' + r, o.find((v) => /N-1731/.test(v))); }); await p.waitForTimeout(500); await fill('#c_ITEM01_F' + r, '1');
  console.log('3 linha ' + r + ':', await p.$eval('#c_ITEM01_D' + r, (x) => x.closest('tr').innerText.replace(/\s+/g, ' ').replace(/\d\d\.[A-Z]+ /g, '').slice(0, 140)));
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(700);
  const card = await p.$eval('[id^="esp_ITEM01_35"]', (x) => x.querySelector('h2').innerText.replace(/\s+/g, ' ')).catch(() => 'SEM CARTÃO');
  console.log('4 cartão:', card, errs.slice(0, 3));
  const al = await p.$$eval('[data-alfix]', (x) => x.map((e) => e.closest('.al, li, div').innerText.replace(/\s+/g, ' ').slice(0, 160)).filter((t) => /Pintura especial/.test(t)));
  console.log('5 alerta:', al.join(' | ') || 'SEM ALERTA');
  await p.click('[data-alfix*="\\"act\\":\\"esp\\""]'); await p.waitForTimeout(400);
  console.log('6 foco em:', await p.evaluate(() => document.activeElement && document.activeElement.id));
  await fill('#espf_ITEM01_35_norma', 'PETROBRAS N-1731 (CONDIÇÃO 3)');
  await fill('#espf_ITEM01_35_acabamento', 'POLIURETANO ALIFÁTICO BRILHANTE');
  await fill('#espf_ITEM01_35_cor', 'VERMELHO SEGURANÇA RAL 3000');
  await fill('#espf_ITEM01_35_espessura', '280 µm');
  console.log('7 depois:', await p.$eval('[id^="esp_ITEM01_35"] h2', (x) => x.innerText.replace(/\s+/g, ' ')), '| alerta:', (await p.$$eval('[data-alfix]', (x) => x.filter((e) => /Pintura especial/.test(e.closest('.al, li, div').innerText)).length)));
  await (await p.$('[id^="esp_ITEM01_35"]')).screenshot({ path: __dirname + '/espec_card.png' });
  // 4. salva, recarrega e gera a técnica e comercial
  await p.click('#bSave'); await p.waitForTimeout(600);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600);
  console.log('8 após recarregar, cor:', await p.$eval('#espf_ITEM01_35_cor', (x) => x.value).catch(() => 'PERDEU'));
  await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  const dl = p.waitForEvent('download', { timeout: 40000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/espec_ptc.pdf'); await p.waitForTimeout(2500);
  const t = execSync('pdftotext -layout ' + __dirname + '/espec_ptc.pdf -').toString();
  const i = t.indexOf('Pintura especial'); console.log('9 PDF:', i < 0 ? 'NÃO ENTROU' : t.slice(t.lastIndexOf('\n', i - 200), i + 700).replace(/[ \t]+/g, ' '));
  console.log('erros', errs); await b.close();
})();
