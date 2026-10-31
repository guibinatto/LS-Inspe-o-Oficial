// Arquitetura ERP: menu por módulos (grupos, submenus, pesquisa, recolhido com dica), busca universal (Ctrl+K e botão),
// numeração (série ligada pelo administrador, "gerar nº" na proposta, aviso de número repetido), ficha do insumo em abas,
// visões da estrutura, Ajuda (atalhos e versão) e a lista de propostas com "mostrar mais". Modo local (arquivo).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); await p.route('https://**', (r) => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
  // 1) menu
  confere('grupos do menu', (await p.$$eval('#nav [data-navgt]', (x) => x.map((e) => e.innerText.trim()).join('|'))) === 'PROPOSTAS|CADASTROS|GESTÃO|ADMINISTRAÇÃO|AJUDA');
  confere('submenus começam fechados', await p.$$eval('#nav .navsub', (x) => x.every((e) => e.hidden)));
  await p.click('[data-navgt="propostas"]'); confere('abre o grupo', await p.$eval('#navs_propostas', (x) => !x.hidden) && (await p.getAttribute('[data-navgt="propostas"]', 'aria-expanded')) === 'true');
  await p.click('[data-go="inicio"][data-gv="SEQ"]'); await p.waitForTimeout(300);
  confere('atalho "Propostas SEQ" filtra a lista', await p.$eval('[data-hdiv="SEQ"]', (x) => x.classList.contains('on')) && (await p.getAttribute('[data-go="inicio"][data-gv="SEQ"]', 'aria-current')) === 'true');
  await p.reload(); await p.waitForTimeout(1200); confere('grupo aberto lembrado', await p.$eval('#navs_propostas', (x) => !x.hidden));
  await p.fill('#navQ', 'numer'); await p.waitForTimeout(100);
  const vis = await p.$$eval('#nav [data-view], #nav [data-go]', (x) => x.filter((e) => !e.hidden).map((e) => e.innerText.trim()));
  confere('pesquisa no menu acha "Numeração e máscaras"', vis.length === 1 && /Numeração/.test(vis[0]), vis.join(','));
  await p.press('#navQ', 'Escape'); confere('Esc limpa a pesquisa', (await p.$$eval('#nav [data-view]', (x) => x.filter((e) => !e.hidden).length)) === 7);
  await p.click('#bSideCol'); await p.waitForTimeout(200); await p.hover('#nav [data-view="margens"]'); await p.waitForTimeout(150);
  confere('recolhido: dica com o nome', (await p.$eval('#nav [data-view="margens"]', (x) => getComputedStyle(x, '::after').content)) === '"Margens"');
  confere('recolhido: submenus escondidos', await p.$$eval('#nav .navgh', (x) => x.every((e) => e.offsetParent === null))); await p.click('#bSideCol');
  await p.focus('#nav [data-view="inicio"]'); await p.keyboard.press('ArrowDown'); confere('setas percorrem o menu', await p.evaluate(() => document.activeElement && document.activeElement.dataset.navgt === 'propostas'));
  // 2) Ajuda
  await p.click('[data-navgt="ajuda"]'); await p.click('[data-go="guia"][data-gv="versao"]'); await p.waitForTimeout(300);
  const ver = await p.$eval('#ajuda_versao', (x) => x.innerText).catch(() => '');
  confere('Informações da versão com data de geração', /LS Pricer REV22/.test(ver) && /\d{2}\/\d{2}\/\d{4}/.test(ver), ver.split('\n').slice(0, 4).join(' / '));
  confere('Atalhos de teclado', /Ctrl/.test(await p.$eval('#ajuda_atalhos', (x) => x.innerText).catch(() => '')));
  // 3) busca universal
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200); confere('Ctrl+K abre a busca', !!(await p.$('#gBusca')));
  await p.fill('#gbQ', '6m16g308'); await p.waitForTimeout(200);
  const grupos = await p.$$eval('#gbRes .gbgh', (x) => x.map((e) => e.innerText.trim())); confere('acha insumos pelo modelo', grupos.some((g) => /INSUMOS/i.test(g)), grupos.join(','));
  await p.keyboard.press('Enter'); await p.waitForTimeout(500); confere('Enter abre a ficha do primeiro', /Insumo 01-/i.test(await p.$eval('#overlay h2', (x) => x.innerText).catch(() => '')));
  // 4) ficha em abas
  const abas = await p.$$eval('#overlay [data-ftab]', (x) => x.map((e) => e.innerText.trim()));
  confere('ficha com 6 abas', abas.length === 6, abas.join(' | '));
  await p.click('#overlay [data-ftab="compras"]'); confere('aba Compras mostra o preço e esconde a descrição', await p.evaluate(() => !!document.querySelector('#fVal').offsetParent && !document.querySelector('#fProd').offsetParent));
  confere('Salvar visível em qualquer aba', await p.evaluate(() => { const b = document.querySelector('#fSave'); return !!(b && b.offsetParent); }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.keyboard.press('Control+k'); await p.fill('#gbQ', 'cocamar'); await p.waitForTimeout(200);
  confere('busca sem resultado de proposta antes de salvar', !(await p.$$eval('#gbRes .gbgh', (x) => x.map((e) => e.innerText))).some((g) => /PROPOSTAS/i.test(g)));
  await p.keyboard.press('Escape');
  // 5) numeração (modo local = administrador)
  await p.evaluate(() => { const b = document.querySelector('[data-go="config"][data-gv="numeracao"]'); b.click(); }); await p.waitForTimeout(400);
  confere('tela Numeração e máscaras', /Numeração e máscaras/i.test(await p.$eval('#app', (x) => x.innerText)));
  await p.selectOption('[data-numserie="seq"] [data-nm="ativa"]', '1'); await p.fill('[data-numserie="seq"] [data-nm="inicio"]', '7'); await p.waitForTimeout(100);
  const prev = await p.$eval('[data-numserie="seq"] [data-nmprev]', (x) => x.innerText); confere('prévia da máscara', /^SEQ-\d{4}-00007$/.test(prev), prev);
  await p.click('[data-nmsalvar]'); await p.waitForTimeout(300);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('[data-view="proposta"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.querySelector('[data-step="1"]'); if (b) b.click(); }); await p.waitForTimeout(300);
  const bt = await p.$('[data-numgerar="seq"]'); confere('botão "gerar nº" ao lado do número', !!bt);
  if (bt) { await bt.click(); await p.waitForTimeout(600); const v = await p.$eval('#c_PROPOSTA_C5', (x) => x.value).catch(() => ''); confere('número gerado no campo', /^SEQ-\d{4}-00007$/.test(v), v); }
  await p.click('#bSave'); await p.waitForTimeout(800);
  // duplicar a proposta e repetir o número: aviso
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(300); await p.evaluate(() => { const d = document.querySelector('[data-hdup]'); if (d) d.click(); }); await p.waitForTimeout(600);
  await p.evaluate(() => { const b = document.querySelector('[data-step="1"]'); if (b) b.click(); }); await p.waitForTimeout(300);
  const g2 = await p.$('[data-numgerar="seq"]'); if (g2) { await g2.click(); await p.waitForTimeout(600); }
  const v2 = await p.$eval('#c_PROPOSTA_C5', (x) => x.value).catch(() => ''); confere('segundo número é o seguinte', /^SEQ-\d{4}-00008$/.test(v2), v2);
  await p.fill('#c_PROPOSTA_C5', await p.evaluate(() => 'SEQ-' + new Date().getFullYear() + '-00007')); await p.press('#c_PROPOSTA_C5', 'Tab'); await p.waitForTimeout(400);
  confere('aviso de número repetido', /já está em outra proposta salva/.test(await p.$eval('#app', (x) => x.innerText)));
  // 6) estrutura: visões
  await p.evaluate(() => { const b = document.querySelector('[data-go="cadastro"][data-gv="estruturas"]'); b.click(); }); await p.waitForTimeout(500);
  const linhas = async () => p.$$eval('#app tr:has([data-recedit])', (x) => x.length);
  const nC = await linhas(); await p.click('[data-estrvis][value="tecnica"]', { force: true }); await p.waitForTimeout(300); const nT = await linhas();
  await p.click('[data-estrvis][value="comercial"]', { force: true }); await p.waitForTimeout(300); const txtC = await p.$eval('#app', (x) => x.innerText);
  confere('visão técnica tira serviços', nT > 0 && nT < nC, nT + ' de ' + nC);
  confere('visão comercial mostra onde aparece', /Na proposta \(escopo\)/i.test(txtC) && /só no custo|Acionador|Bomba/.test(txtC));
  // 7) lista com "mostrar mais" não aparece com poucas propostas; nada quebrou
  console.log('OK:', ok.length, '\n  ' + ok.join('\n  ')); console.log('FALHA:', falha.length, falha.length ? '\n  ' + falha.join('\n  ') : ''); console.log('erros', errs);
  await b.close(); process.exit(falha.length || errs.length ? 1 : 0);
})();
