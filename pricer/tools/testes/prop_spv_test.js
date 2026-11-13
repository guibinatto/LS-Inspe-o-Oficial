// Proposta técnica e comercial (modelo PTC) de serviço: contrato ITM trimestral e Fireconnect (serviço + peças).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage(); p.on('dialog', (d) => d.accept());
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url();
    const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : null;
    return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  for (const [tipo, mod, nome] of [['ITM', 'itm4', 'prop_itm.pdf'], ['FRC', 'frc-ativacao', 'prop_frc.pdf']]) {
    await p.click('#nav [data-view="inicio"]'); await p.waitForTimeout(300);
    await p.evaluate((t) => { const x = document.querySelector(`[data-spvnew="${t}"]`); if (x) x.click(); }, tipo); await p.waitForTimeout(500);
    const m = await p.$(`[data-spmod="${mod}"]`); if (m) { await m.click(); await p.waitForTimeout(400); } else console.log('sem modelo', mod);
    const sp = async (k, v) => { const el = await p.$(`[data-sp="${k}"]`); if (!el) { console.log('sem campo', k); return; } await el.fill(v); await el.dispatchEvent('change'); await p.waitForTimeout(150); };
    await sp('cliente', 'CLIENTE TREINAMENTO LTDA'); await sp('contato', 'Fulano de Tal'); await sp('numero', tipo === 'ITM' ? '10.900' : '10.901'); await sp('local', 'SANTOS - SP');
    await p.click('#bSave'); await p.waitForTimeout(500);
    console.log(tipo, 'cartão:', !!(await p.$('#pcCard')));
    const dl = p.waitForEvent('download', { timeout: 30000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/' + nome);
    await p.waitForTimeout(3500);
    console.log(tipo, d.suggestedFilename(), fs.statSync(__dirname + '/' + nome).size, '| conferência:', await p.$eval('#confCard', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 160)).catch(() => 'sem cartão'));
  }
  // proposta só de peças (como a PTC 10.259): montada direto pelo módulo
  const pg = await p.evaluate(async () => { const D = { tipo: 'SPV', numero: '10.259', rev: '3', data: '2026-10-16', validade: '2026-10-20', cliente: 'NAVEGANTES LOGISTICA PORTUARIA', razao: 'NORDESTE LOGISTICA I S.A.', cnpj: '35.058.101/0001-06', contato: 'NORDESTE', obra: 'CABEDELO - PB', cidade: 'CABEDELO-PB', pagamento: 'CP-319 - 50% COM ENVIO DO PEDIDO E 50% 21DDL APÓS EMISSÃO DA NF', frete: 'CE-004 - CIF - ENTREGA POR CONTA DA LS FIRE, SEM DESCARGA', prazo: '', exclusoes: '', vendedor: '', total: 1115.16,
      itens: [{ key: 'pc0', codigo: '043-13022', qtd: 2, un: 'Un', pisCofins: 0.0365, icms: 0.05, ipi: 0, ncm: '7307.29.00', unit: 79.98, total: 159.95, breve: 'NIPLE DUPLO 2\" BSP INOX', escopo: [], escopoPecas: true }, { key: 'pc1', codigo: '053-00003', qtd: 4, un: 'Un', pisCofins: 0.0365, icms: 0.05, ipi: 0, ncm: '7307.11.00', unit: 238.80, total: 955.21, breve: 'ACOPLAMENTO RIGIDO RANHURADO 3', escopo: [] }], flags: { pecas: true, soPecas: true } };
    const r = await window.PricerProposta.montar(D, { prazoFab: 48, prazoEnt: 2 }, window.PricerProposta.modelo(null)); return r.paginas; });
  console.log('peças: páginas', pg);
  console.log('erros', errs); await b.close();
})();
