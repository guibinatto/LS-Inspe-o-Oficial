// Etapa SAP: menu Comercial/Cadastros/Engenharia de produto, abas da proposta (Configuração, Formação de preço,
// Memorial de cálculo), composição do preço igual ao memorial, listas no Modelo A (colunas, visualizações salvas,
// páginas) e ficha no Modelo B (cabeçalho do objeto, 7 abas, aba Fornecedores), painel lateral do componente.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('Motores sem preço') : d.accept()));
  await p.route('https://**', (r) => r.abort()); await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
  const br = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
  // 1) menu
  const grupos = await p.$$eval('#nav [data-navgt]', (x) => x.filter((e) => e.offsetParent).map((e) => e.innerText.trim()).join('|'));
  confere('menu: Comercial, Cadastros, Engenharia de produto, Fiscal, Financeiro, Gestão, Administração, Ajuda', grupos === 'COMERCIAL|CADASTROS|ENGENHARIA DE PRODUTO|FISCAL|FINANCEIRO|GESTÃO|ADMINISTRAÇÃO|AJUDA', grupos);
  await p.evaluate((k) => { const h = document.querySelector('[data-navgt="' + k + '"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); }, 'engenharia'); await p.click('[data-go="cadastro"][data-gv="testador"]'); await p.waitForTimeout(400);
  confere('Engenharia → Testador de estruturas abre a tela', /testador/i.test(await p.$eval('.subtabs [aria-selected="true"]', (x) => x.innerText).catch(() => '')));
  // 2) proposta: abas e Formação de preço
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(900); await p.click('#nav [data-view="proposta"]'); await p.waitForTimeout(300);
  const abas = await p.$$eval('.ptabs .ptab span', (x) => x.map((e) => e.innerText.trim()));
  confere('abas da proposta', abas.join('|').toUpperCase() === 'DADOS GERAIS|ITENS|CONFIGURAÇÃO|CUSTOS|FORMAÇÃO DE PREÇO|MEMORIAL DE CÁLCULO|CONFERÊNCIA|DOCUMENTOS|HISTÓRICO', abas.join(' | '));
  await p.click('.ptab[data-ptcfg]'); await p.waitForTimeout(600);
  confere('aba Configuração abre o configurador do item', /Configurar|Compor|Conferir/.test(await p.$eval('#app', (x) => x.innerText.slice(0, 1500))) && (await p.$eval('.ptab.on span', (x) => x.innerText)).toUpperCase() === 'CONFIGURAÇÃO');
  await p.click('.ptab[data-step="4"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="compos"]'); if (d) d.open = true; });
  const comp = await p.$$eval('.cpreco tbody tr', (x) => x.map((r) => [...r.querySelectorAll('td')].map((t) => t.innerText.trim())));
  const v = (lb) => br((comp.find((r) => r[0].includes(lb)) || [])[1] || 'NaN');
  const soma = v('Custo total') + v('Impostos') + v('Comissões') + v('Margem líquida') + (comp.some((r) => /Outros/.test(r[0])) ? v('Outros') : 0);
  confere('composição: custo + impostos + comissões + margem = preço sem IPI', Math.abs(soma - v('Preço de venda sem IPI')) < 0.05, soma.toFixed(2) + ' × ' + v('Preço de venda sem IPI'));
  const kpi = br(await p.$eval('.kpis .kpi.lead b', (x) => x.innerText));
  confere('preço com IPI da composição = indicador da Formação', Math.abs(v('Preço de venda com IPI') - kpi) < 0.05, v('Preço de venda com IPI') + ' × ' + kpi);
  const custoK = br(await p.$$eval('.kpis .kpi', (x) => { const k = x.find((e) => /^Custo total dos itens/i.test(e.querySelector('span').innerText)); return k ? k.querySelector('b').innerText : 'NaN'; }));
  const st = v('Start-up') || 0, fr = comp.some((r) => /Fretes/.test(r[0])) ? v('Fretes') : 0; const nota = await p.$eval('.cpreco', (x) => x.innerText).catch(() => '');
  confere('custo do memorial = custo dos itens + start-up + fretes, e a diferença é explicada', Math.abs(v('Custo total') - custoK - st - fr) < 0.05 && /exatamente o start-up e os fretes/.test(nota), v('Custo total') + ' = ' + custoK + ' + ' + st + ' + ' + fr);
  await p.click('.cpreco [data-view="memorial"]'); await p.waitForTimeout(500); confere('atalho para o memorial de cálculo', (await p.$eval('.ptab.on span', (x) => x.innerText)).toUpperCase() === 'MEMORIAL DE CÁLCULO');
  // 3) Modelo A: insumos
  await p.evaluate((k) => { const h = document.querySelector('[data-navgt="' + k + '"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); }, 'cadastros'); await p.click('[data-go="cadastro"][data-gv="insumos"]'); await p.waitForTimeout(500);
  const pag = await p.$eval('#app .lpager', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => ''); confere('insumos com páginas de 100', /^1–100 de/.test(pag), pag.slice(0, 60));
  const prim = await p.$eval('#app tr[data-ins]', (x) => x.dataset.ins); await p.click('#app [data-lpg="insumos|2"]'); await p.waitForTimeout(300);
  confere('próxima página', /^101–200/.test(await p.$eval('#app .lpager', (x) => x.innerText)) && (await p.$eval('#app tr[data-ins]', (x) => x.dataset.ins)) !== prim);
  await p.click('#app details.lmenu summary'); await p.uncheck('[data-lcol="insumos|fab"]'); await p.waitForTimeout(300);
  confere('coluna Fabricante escondida', !(await p.$$eval('#app table.t thead th', (x) => x.map((e) => e.innerText))).some((t) => /FABRICANTE/i.test(t)));
  await p.check('#insSem'); await p.waitForTimeout(300);
  await p.click('#app details.lmenu:nth-of-type(2) summary').catch(() => {}); await p.evaluate(() => document.querySelectorAll('#app details.lmenu')[1].open = true); await p.click('[data-lviewsave="insumos"]'); await p.waitForTimeout(500);
  await p.uncheck('#insSem'); await p.waitForTimeout(300); const nTodos = await p.$eval('#app .lpager', (x) => x.innerText).catch(() => '');
  await p.evaluate(() => document.querySelectorAll('#app details.lmenu')[1].open = true); await p.click('[data-lview="insumos|Motores sem preço"]'); await p.waitForTimeout(400);
  confere('visualização salva aplicada (só sem preço, coluna escondida)', await p.$eval('#insSem', (x) => x.checked) && !(await p.$$eval('#app table.t thead th', (x) => x.map((e) => e.innerText))).some((t) => /FABRICANTE/i.test(t)), nTodos.slice(0, 20));
  // 4) Modelo B: ficha
  await p.uncheck('#insSem'); await p.waitForTimeout(300); await p.click('#app tr[data-ins] td.code'); await p.waitForTimeout(600);
  confere('ficha com cabeçalho do objeto', !!(await p.$('.modal .objhead .objkpis')) && /Custo vigente/.test(await p.$eval('.modal .objhead', (x) => x.innerText)));
  const fab = await p.$$eval('.modal [data-ftab]', (x) => x.map((e) => e.innerText.trim())); confere('7 abas do cadastro mestre', fab.length === 7 && /FORNECEDORES/i.test(fab.join('|')), fab.join(' | '));
  await p.click('.modal [data-ftab="forn"]'); confere('aba Fornecedores com + Fornecedor', await p.isVisible('#foAdd'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // 5) estrutura: painel lateral
  await p.click('[data-go="cadastro"][data-gv="estruturas"]'); await p.waitForTimeout(500);
  await p.click('#app tr[data-recpainel] td:first-child'); await p.waitForTimeout(400);
  confere('clicar no componente abre o painel lateral', !!(await p.$('.modal.drawer')) && /De onde sai o insumo/.test(await p.$eval('.modal.drawer', (x) => x.innerText)));
  await p.click('.modal.drawer [data-recedit]').catch(() => {}); await p.waitForTimeout(400); confere('Editar componente abre a janela de edição', !(await p.$('.modal.drawer')) && !!(await p.$('.modal')));
  await p.keyboard.press('Escape');
  // 6) propostas: Modelo A
  await p.click('#nav [data-view="inicio"]'); await p.waitForTimeout(400); confere('lista de propostas com Colunas e Visualizações', (await p.$$eval('.lhead .lmenu summary', (x) => x.map((e) => e.innerText))).length === 2);
  console.log('OK:', ok.length, '\n  ' + ok.join('\n  ')); console.log('FALHA:', falha.length, falha.length ? '\n  ' + falha.join('\n  ') : ''); console.log('erros', errs);
  await b.close(); process.exit(falha.length || errs.length ? 1 : 0);
})();
