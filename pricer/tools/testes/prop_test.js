// Proposta técnica e comercial (modelo PTC): cabeçalho vindo de Dados gerais, código e folha de dados no item,
// os três tipos de documento, inglês e dólar. Gera os PDFs, confere a versão em português e guarda nos documentos.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url();
    const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : null;
    return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  // folha de dados de teste (fictícia) e uma curva em PNG
  const aux = await ctxB.newPage();
  await aux.setContent(`<html><body style="font-family:Arial;font-size:12px"><h3>FOLHA DE DADOS — BOMBA (TESTE)</h3><table>${[['Modelo', 'TKF 125-400 EFF'], ['Vazão (m³/h)', '341'], ['Altura (mca)', '97'], ['Rotação', '1780 rpm'], ['Diâmetro do rotor', '424 mm'], ['Sucção', '6" CL 125 lbs'], ['Recalque', '5" CL 125 lbs'], ['Vedação', 'Gaxeta'], ['NPSH requerido', '4,2 m']].map(([a, c]) => `<tr><td style="padding:2px 60px 2px 0">${a}</td><td>${c}</td></tr>`).join('')}</table></body></html>`);
  await aux.pdf({ path: __dirname + '/fd_teste.pdf' });
  await aux.setContent('<html><body style="margin:0"><svg width="800" height="500" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="500" fill="#fff"/><path d="M40 80 Q 400 120 760 420" stroke="#1a4" stroke-width="4" fill="none"/><text x="40" y="40" font-size="24">Curva de teste</text></svg></body></html>');
  await aux.screenshot({ path: __dirname + '/curva_teste.png', clip: { x: 0, y: 0, width: 800, height: 500 } }); await aux.close();
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
  const fill = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'change'); await p.waitForTimeout(200); };
  // Dados gerais: o que vai no documento
  await p.click('[data-view="proposta"]'); await p.click('[data-step="1"]'); await p.waitForTimeout(400);
  await fill('#pcf_clienteCurto', 'COCAMAR SEDE'); await fill('#pcf_prazoFab', '90'); await fill('#pcf_prazoEnt', '30'); await fill('#pcf_cidade', 'MARINGÁ-PR');
  // item 02: código, folha de dados e curva
  await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="1"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; });
  await fill('[data-pccod="ITEM 02"]', '004-00242');
  await p.setInputFiles('[data-fdup="ITEM 02|bomba"]', __dirname + '/fd_teste.pdf'); await p.waitForTimeout(3000);
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; });
  console.log('FD lida:', await p.$$eval('[data-fdk^="ITEM 02|bomba"]', (x) => x.map((e, i) => e.value + '=' + document.querySelectorAll('[data-fdv^="ITEM 02|bomba"]')[i].value).join('; ')));
  await p.setInputFiles('[data-fdup="ITEM 02|curva"]', __dirname + '/curva_teste.png'); await p.waitForTimeout(1500);
  await p.click('#bSave'); await p.waitForTimeout(600);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  console.log('cartão:', !!(await p.$('#pcCard')), '| cabeçalho só leitura:', !(await p.$('#pcCard input[data-pc="clienteCurto"]')), '| aos cuidados:', await p.$eval('#pcCard .pcro', (x) => (x.innerText.match(/Aos cuidados de\s*(.+)/) || [])[1]));
  const gera = async (nome) => { const dl = p.waitForEvent('download', { timeout: 40000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/' + nome); await p.waitForTimeout(3500); return d.suggestedFilename(); };
  console.log('tc pt:', await gera('prop_ptc.pdf'));
  await p.click('[data-step="5"]'); await p.waitForTimeout(400); console.log('conferência:', await p.$eval('#confCard', (x) => x.innerText.replace(/\s+/g, ' ').slice(60, 160)).catch(() => 'sem cartão'));
  await p.click('[data-step="6"]'); await p.waitForTimeout(400);
  const opt = async (nome, v) => { await p.click(`#pcCard input[data-pcopt="${nome}"][value="${v}"]`, { force: true }); await p.waitForTimeout(400); };
  await opt('tipoDoc', 'com'); console.log('comercial:', await gera('prop_pc.pdf'));
  await opt('tipoDoc', 'tec'); console.log('técnica:', await gera('prop_pt.pdf'));
  await opt('tipoDoc', 'tc'); await opt('idioma', 'en'); await opt('moeda', 'USD'); await fill('#pc_taxa', '5,4321');
  console.log('inglês US$:', await gera('prop_en_usd.pdf'));
  await opt('idioma', 'es'); await opt('moeda', 'BRL'); console.log('espanhol:', await gera('prop_es.pdf'));
  const docs = await p.evaluate(() => (JSON.parse(localStorage.getItem('lspricer.docs.v1') || '[]')).map((d) => d.tipo + ':' + d.nome));
  console.log('documentos:', docs.filter((x) => /^(proposta|folha|curva)/.test(x)).length);
  console.log('erros', errs); await b.close();
})();
