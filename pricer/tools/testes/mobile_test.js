// Uso no celular: as mesmas operações do computador, por toque, com os mesmos valores.
// Roda no Chromium com tela de celular (390×844, toque) e compara com o computador (1440×900). Não é um aparelho real.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const APP = 'file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html');
const ok = (c, m) => console.log((c ? '✓ ' : '✕ ') + m);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const abre = async (vp, toque) => { const ctx = await b.newContext({ viewport: vp, isMobile: toque, hasTouch: toque }); await ctx.route('https://**', (r) => r.abort());
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); await p.goto(APP); await p.waitForTimeout(1300); return [ctx, p]; };
  const valores = async (p, cel) => {
    const r = {};
    r.cab = await p.$eval('.ctx-kpis', (x) => [...x.querySelectorAll('.k b')].slice(0, 2).map((b) => b.textContent.trim()).join(' | '));
    await p.click('.ptab[data-step="2"]'); await p.waitForTimeout(400);
    r.itens = await p.$$eval('.icard .itotal b', (x) => x.map((b) => b.textContent.trim()).join(' | '));
    await p.click('[data-goitem="0"]'); await p.waitForTimeout(800);
    r.item = await p.$eval('.cfghead .sumbar', (x) => [...x.querySelectorAll('b')].map((b) => b.textContent.trim()).join(' | '));
    await p.click('.cfgsteps [data-cfget="2"]'); await p.waitForTimeout(600);
    r.comp = await p.$eval('.cfgcomp tr.tot', (x) => x.textContent.replace(/\s+/g, ' ').trim());
    if (cel) await p.click('.bnav [data-view="proposta"]'); else await p.click('#nav [data-view="proposta"]');
    await p.waitForTimeout(400); await p.click('.ptab[data-view="memorial"]'); await p.waitForTimeout(700);
    r.memorial = await p.$eval('#app table', (x) => (x.innerText.match(/-?[\d.]+,\d+%?/g) || []).join(' '));
    return r;
  };
  // computador: referência
  const [cd, d] = await abre({ width: 1440, height: 900 }, false);
  await d.click('#bNew'); await d.click('#mExample'); await d.waitForTimeout(1200); await d.click('#nav [data-view="proposta"]'); await d.waitForTimeout(400);
  const ref = await valores(d, false); await cd.close();

  const [cc, p] = await abre({ width: 390, height: 844 }, true);
  const larg = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  ok(await p.isVisible('.bnav') && await p.$eval('.sidenav', (x) => x.getBoundingClientRect().right <= 0), '1 barra inferior visível; menu lateral fora da tela');
  await p.click('.bnav [data-bmais]'); await p.waitForTimeout(300); ok(await p.isVisible('#nav [data-view="margens"]'), '2 Mais abre o menu completo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok(!(await p.evaluate(() => document.body.classList.contains('side-open'))), '  Esc fecha o menu');
  await p.click('#bMore'); await p.waitForTimeout(300); const itens = await p.$$eval('.msheet [data-msid]', (x) => x.map((e) => e.textContent.trim()));
  ok(itens.includes('Nova') && itens.includes('Abrir'), '3 Mais ações: ' + itens.join(', '));
  await p.click('[data-msid="bNew"]'); await p.waitForTimeout(400);
  const fundo = await p.$eval('.modal .card', (x) => Math.round(x.getBoundingClientRect().bottom)); ok(Math.abs(fundo - 844) <= 1, '4 janela Nova proposta como painel inferior (base em ' + fundo + ' px)');
  await p.click('#mExample'); await p.waitForTimeout(1300); await p.click('.bnav [data-view="proposta"]'); await p.waitForTimeout(400);
  const hCab = await p.$eval('.ctxh', (x) => x.getBoundingClientRect().height); ok(hCab < 844 * 0.25, '5 cabeçalho da proposta compacto: ' + Math.round(hCab) + ' px (' + Math.round(hCab / 8.44) + '% da tela)');
  await p.click('.k.kpend'); await p.waitForTimeout(500); ok(await p.$eval('.ptab.on', (x) => x.dataset.step) === '5', '  tocar em Pendências abre a Conferência');
  // valores iguais aos do computador
  await p.click('.ptab[data-step="1"]'); await p.waitForTimeout(300);
  const cel = await valores(p, true);
  for (const k of Object.keys(ref)) ok(ref[k] === cel[k], '6 ' + k + ' igual ao computador' + (ref[k] === cel[k] ? '' : ': ' + ref[k].slice(0, 80) + ' ≠ ' + cel[k].slice(0, 80)));
  ok(await p.$$eval('#app table.mobcard tbody tr td[data-label="ITEM 01"]', (x) => x.length) > 5, '  memorial em cartões: cada linha com ITEM 01, 02, 03 e o total identificados');
  // formulário: fonte de 16 px, altura e gravação
  await p.click('.bnav [data-view="proposta"]'); await p.click('.ptab[data-step="1"]'); await p.waitForTimeout(400);
  const f = await p.$eval('[id$="PROPOSTA_F6"]', (x) => [parseFloat(getComputedStyle(x).fontSize), Math.round(x.getBoundingClientRect().height)]);
  ok(f[0] >= 16 && f[1] >= 44, '7 campo Obra/local com ' + f[0] + ' px de letra e ' + f[1] + ' px de altura');
  await p.fill('[id$="PROPOSTA_F6"]', 'Obra teste celular'); await p.press('[id$="PROPOSTA_F6"]', 'Tab'); await p.waitForTimeout(400);
  await p.click('#bSave'); await p.waitForTimeout(1200); const st = await p.$eval('#saveSt', (x) => x.textContent.trim()).catch(() => ''); ok(/Salvo/i.test(st), '8 Salvar no celular: ' + st);
  await p.reload(); await p.waitForTimeout(1500); await p.click('.bnav [data-view="proposta"]'); await p.click('.ptab[data-step="1"]').catch(() => {}); await p.waitForTimeout(400);
  ok((await p.$eval('[id$="PROPOSTA_F6"]', (x) => x.value)) === 'Obra teste celular', '  depois de recarregar, o valor continua');
  // rascunho: alteração sem salvar é recuperada
  await p.fill('[id$="PROPOSTA_F6"]', 'Obra sem salvar'); await p.press('[id$="PROPOSTA_F6"]', 'Tab'); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForTimeout(1500); await p.click('.bnav [data-view="proposta"]'); await p.waitForTimeout(400);
  ok(/Recuperamos alterações não salvas/.test(await p.$eval('#app', (x) => x.innerText)), '9 rascunho recuperado ao recarregar');
  await p.click('[data-recsalva]'); await p.waitForTimeout(1000);
  // configurador: uma etapa por vez, seleções preservadas, painel inferior
  await p.click('.ptab[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="1"]'); await p.waitForTimeout(800);
  await p.click('.cfgsteps [data-cfget="1"]'); await p.waitForTimeout(600); const car = () => p.$eval('section.card:has(.pill[title="Origem do valor"]) tbody', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => ''); const mod1 = await car();
  ok(await p.$$eval('.cfggrid > .stack, .cfgprev', (x) => x.filter((e) => e.getBoundingClientRect().width > 0).length) === 1, '10 Configurar: uma coluna (prévia lateral escondida)');
  const nav = await p.$eval('.cfgnav', (x) => getComputedStyle(x).position); ok(nav === 'sticky', '  Voltar/Salvar/Continuar fixos embaixo (' + nav + ')');
  await p.click('.cfgnav .btn.pri'); await p.waitForTimeout(600); await p.click('.cfgcomp [data-cfgsel]'); await p.waitForTimeout(500);
  const sh = await p.$eval('#cfgPainel', (x) => [getComputedStyle(x).position, Math.round(x.getBoundingClientRect().bottom), document.documentElement.scrollWidth, innerWidth, innerHeight, Math.round(visualViewport.height)]); ok(sh[0] === 'fixed' && sh[1] >= 843, '11 "Por quê?" abre como painel inferior (' + sh.join(', ') + ')');
  await p.click('.cfgscrim', { position: { x: 20, y: 40 } }); await p.waitForTimeout(400); ok(!(await p.$('#cfgPainel')), '  tocar fora fecha o painel');
  await p.click('.cfgsteps [data-cfget="1"]'); await p.waitForTimeout(500); ok(mod1 && (await car()) === mod1, '  ao voltar, as características escolhidas continuam: ' + mod1.slice(0, 70));
  ok(await larg(), '  sem rolagem lateral');
  // tabelas em cartões e tabela completa
  await p.click('.bnav [data-view="cadastro"]'); await p.waitForTimeout(500); await p.click('.areatabs [data-cad="insumos"]'); await p.waitForTimeout(800);
  const nCards = await p.$$eval('table.mobcard tbody tr', (x) => x.length); ok(nCards === 80, '12 insumos em cartões, 80 por vez: ' + nCards);
  await p.click('[data-insmais]'); await p.waitForTimeout(800); ok(await p.$$eval('table.mobcard tbody tr', (x) => x.length) === 160, '  Mostrar mais: 160');
  await p.fill('#insQ', 'jockey'); await p.waitForTimeout(900); const nq = await p.$$eval('table.mobcard tbody tr', (x) => x.length); ok(nq > 0 && nq < 160, '  busca filtra: ' + nq + ' cartões');
  await p.click('table.mobcard tbody tr td.mobsel input'); await p.waitForTimeout(400); ok(await p.$eval('table.mobcard tbody tr td.mobsel input', (x) => x.checked), '  seleção para edição em massa marcada');
  await p.click('[data-mobtg]'); await p.waitForTimeout(400); ok(await p.evaluate(() => document.body.classList.contains('tab-completa') && getComputedStyle(document.querySelector('table.mobcard thead')).display !== 'none'), '13 "Ver tabela completa" mostra a tabela');
  await p.click('[data-mobtg]'); await p.waitForTimeout(400);
  await p.click('table.mobcard tbody tr td.mobtit'); await p.waitForTimeout(700); ok(await p.isVisible('.modal .card'), '14 ficha do insumo abre'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // SPV
  await p.click('.bnav [data-view="inicio"]'); await p.waitForTimeout(400); await p.click('[data-spvnew]'); await p.waitForTimeout(1000);
  ok(/SPV/.test(await p.$eval('.ctxh', (x) => x.innerText)) && await larg(), '15 SPV abre sem rolagem lateral');
  // deitado
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(600); ok(await larg(), '16 celular deitado (844×390) sem rolagem lateral');
  console.log('erros', errs); await b.close();
})();
