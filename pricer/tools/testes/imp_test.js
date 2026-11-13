// Rascunho e impressão: (1) com alterações não salvas, recarregar volta à proposta, ao item e à etapa do configurador;
// salvo, abre na página inicial; (2) impressão A4 (Ctrl+P / botão Imprimir) da SEQ e da SPV: PDF de impressão do Chromium em A4,
// com cliente, itens e totais iguais aos da formação, sem o restante da tela.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const APP = 'file://' + path.resolve(__dirname, '../../dist/ls-pricer.html');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await ctx.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const txt = (s) => p.$eval(s, (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => '');
  await p.goto(APP); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('bNew').click()); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('mExample').click()); await p.waitForTimeout(900);
  await p.click('#bSave'); await p.waitForTimeout(600);
  // 1) rascunho: item 02, etapa Compor, uma alteração sem salvar, recarrega
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(300); await p.click('.ptab[data-step="2"]'); await p.waitForTimeout(400); await p.click('[data-goitem="1"]'); await p.waitForTimeout(700);
  await p.click('[data-cfget="2"]'); await p.waitForTimeout(500);
  const q = await p.$('#c_ITEM02_C6'); if (q) { await q.fill('2'); await q.dispatchEvent('change'); } else { await p.click('[data-cfget="1"]'); await p.waitForTimeout(300); await p.fill('#c_ITEM02_C6', '2'); await p.dispatchEvent('#c_ITEM02_C6', 'change'); await p.click('[data-cfget="2"]'); }
  // espera o recálculo e a gravação do rascunho (o app marca a alteração depois de recalcular)
  await p.waitForFunction(() => /"_sujo":true/.test(localStorage.getItem('lspricer.current') || ''), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(300); const antes = await txt('.cfgstep.on');
  await p.reload(); await p.waitForTimeout(1800);
  const nav = await txt('#nav [aria-current="page"]'), et = await txt('.cfgstep.on'), tit = await txt('#app h1');
  confere('rascunho: recarregar volta ao item e à etapa do configurador', /PROPOSTA ABERTA/i.test(nav) && et === antes && /ITEM 02/.test(await txt('#app')), nav + ' · ' + et + ' · ' + tit.slice(0, 60));
  confere('rascunho: aviso de alterações recuperadas', /Recuperamos alterações não salvas/.test(await txt('#app')));
  await p.click('[data-cfget="1"]'); await p.waitForTimeout(400);
  confere('rascunho: a alteração continua lá (quantidade 2)', (await p.$eval('#c_ITEM02_C6', (x) => x.value).catch(() => '?')) === '2', await p.$eval('#c_ITEM02_C6', (x) => x.value).catch(() => 'sem campo'));
  await p.click('#bSave'); await p.waitForTimeout(700); await p.reload(); await p.waitForTimeout(1500);
  confere('salvo: recarregar abre na página inicial', /IN[ÍI]CIO/i.test(await txt('#nav [aria-current="page"]')), await txt('#nav [aria-current="page"]'));
  // 2) impressão A4 da SEQ
  const imprime = async (nome) => {
    const r = await p.evaluate(() => { window.print = () => {}; const b = document.querySelector('[data-pcimprimir]'); if (b) b.click(); return !!document.getElementById('printDoc'); });
    await p.emulateMedia({ media: 'print' }); const f = path.join(__dirname, nome); await p.pdf({ path: f, format: 'A4', preferCSSPageSize: true, printBackground: true }); await p.emulateMedia({ media: 'screen' });
    const t = execSync(`pdftotext -layout "${f}" - 2>/dev/null`).toString(); const pags = +(execSync(`pdfinfo "${f}" | grep Pages`).toString().match(/\d+/) || [0])[0];
    const tam = execSync(`pdfinfo "${f}" | grep "Page size"`).toString(); return { r, t, pags, tam };
  };
  await p.click('[data-view="proposta"]'); await p.waitForTimeout(400); await p.evaluate(() => [...document.querySelectorAll('.ptab')].find((e) => /DOCUMENTOS/i.test(e.innerText)).click()); await p.waitForTimeout(700);
  confere('botão Imprimir (A4) no cartão de Documentos', !!(await p.$('[data-pcimprimir]')));
  const totTela = ((await txt('#pcCard')).match(/total (R\$ [\d.,]+)/) || [])[1];
  const s1 = await imprime('imp_seq.pdf');
  confere('SEQ: página de impressão montada', s1.r);
  confere('SEQ: papel A4 em pé', /\(A4\)/.test(s1.tam), s1.tam.trim());
  confere('SEQ: cliente, itens, tributos, totais e condições', /Cocamar|COCAMAR/i.test(s1.t) && /Itens/i.test(s1.t) && /Tributos/i.test(s1.t) && /Valor total/i.test(s1.t) && /Condições comerciais/i.test(s1.t));
  confere('SEQ: valor total igual ao da formação', totTela && s1.t.includes(totTela), totTela);
  confere('SEQ: sem o menu e os botões da tela', !/Pesquisar no menu|RECOLHER|Gerar proposta técnica/i.test(s1.t));
  console.log('  SEQ: ' + s1.pags + ' página(s)');
  // 3) impressão A4 da SPV (modelo pronto ITM)
  await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('[data-spvnew="ITM"]').click()); await p.waitForTimeout(500);
  const m = await p.$('[data-spmod]'); if (m) { await m.click(); await p.waitForTimeout(400); }
  for (const [f, v] of [['cliente', 'Cliente Impressão Ltda'], ['contato', 'Maria Teste'], ['numero', '40.001']]) { const el = await p.$(`[data-sp="${f}"]`); if (el) { await el.fill(v); await el.dispatchEvent('change'); } }
  await p.click('#bSave'); await p.waitForTimeout(500); const totSpv = ((await txt('#pcCard')).match(/total (R\$ [\d.,]+)/) || [])[1];
  const s2 = await imprime('imp_spv.pdf');
  confere('SPV: impressão com cliente e total da formação', s2.r && /Cliente Impressão Ltda/.test(s2.t) && totSpv && s2.t.includes(totSpv), totSpv);
  // 4) fora da proposta, Ctrl+P imprime a tela normal (não monta o resumo)
  await p.evaluate(() => document.querySelector('#nav [data-view="cadastro"]').click()); await p.waitForTimeout(400);
  const fora = await p.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); const r = !!document.getElementById('printDoc'); window.dispatchEvent(new Event('afterprint')); return r; });
  confere('fora da proposta, Ctrl+P não troca a página pelo resumo', !fora);
  confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  process.exit(falha.length ? 1 : 0);
})();
