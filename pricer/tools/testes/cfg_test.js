// Configurador assistido (Configurar → Compor → Conferir): fluxo completo num item novo, composição pela estrutura,
// opcionais, configuração especial (quantidade), restaurar padrão, componente adicional, conferência, inclusão gravada,
// reabertura, e comparação com o fluxo anterior: para os mesmos modelos prontos, o custo e os componentes do configurador
// são os do Testador de estruturas (o leitor da montagem da planilha). Também mede telas de celular/tablet e modo escuro.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await ctx.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => r.abort()); await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const APP = 'file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html');
  await p.goto(APP); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  const custo = () => p.$eval('.cfghead .sumbar div:first-child b', (x) => x.innerText);
  const shot = (n) => p.screenshot({ path: __dirname + '/cfg_' + n + '.png', fullPage: true });
  // 1) item novo: etapa Configurar, famílias do cadastro
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-additem]'); await p.waitForTimeout(600);
  console.log('1 item novo abre em:', await p.$eval('.cfgstep.on', (x) => x.innerText.trim()), '| famílias:', await p.$$eval('.famcard[data-fam]', (x) => x.map((e) => e.innerText.split('\n')[0]).join(' / ')));
  await shot('1_familia');
  await p.click('.famcard[data-fam="CONJUNTO MOTOBOMBA"]'); await p.waitForTimeout(600);
  const nMod = await p.$$eval('.cfgmods .mcard', (x) => x.length);
  await p.click('input[data-cfgac="DIESEL"]', { force: true }); await p.waitForTimeout(300); const nDiesel = await p.$$eval('.cfgmods .mcard', (x) => x.length);
  await p.fill('[data-cfgq]', '1500'); await p.waitForTimeout(400); const nBusca = await p.$$eval('.cfgmods .mcard', (x) => x.length);
  console.log('2 modelos prontos:', nMod, '| só diesel:', nDiesel, '| busca "1500":', nBusca);
  const mod = await p.$eval('.cfgmods [data-usemodel]', (x) => x.dataset.usemodel); await p.click('.cfgmods [data-usemodel]'); await p.waitForTimeout(800);
  const orig = await p.$$eval('.cfgstep ~ x, table.t tbody tr', (rows) => rows.filter((r) => /Bomba|Motor diesel|Vazão nominal/.test(r.cells[0] ? r.cells[0].innerText : '')).map((r) => r.cells[0].innerText + ': ' + r.cells[1].innerText + ' [' + r.cells[2].innerText.trim() + ']'));
  console.log('3 modelo usado:', mod, '| características:', orig.join(' | '));
  await shot('2_configurar');
  // 2) Compor
  await p.click('[data-cfget="2"]'); await p.waitForTimeout(600);
  const tipos = await p.$$eval('.cfgcomp .cfgtags .pill', (x) => { const m = {}; for (const e of x) m[e.innerText] = (m[e.innerText] || 0) + 1; return m; });
  console.log('4 composição:', await p.$$eval('.cfgcomp [data-cfgsel]', (x) => x.length), 'componentes |', JSON.stringify(tipos), '| custo', await custo());
  const k0 = await p.$$eval('.cfgcomp [data-cfgsel]', (x) => x.map((e) => e.dataset.cfgsel)); await p.click(`[data-cfgsel="${k0[2]}"]`); await p.waitForTimeout(300);
  console.log('5 por quê:', (await p.$eval('#cfgPainel', (x) => x.innerText.replace(/\s+/g, ' '))).slice(0, 260));
  await shot('3_compor');
  const c0 = await custo();
  const opt = await p.$('.cfgcomp input[data-opt]:not(:checked)'); if (opt) { await opt.check(); await p.waitForTimeout(600); console.log('6 opcional marcado: custo', c0, '→', await custo()); await (await p.$(`.cfgcomp input[data-opt="${await opt.getAttribute('data-opt')}"]`)).uncheck(); await p.waitForTimeout(600); console.log('  desmarcado: custo', await custo()); } else console.log('6 sem opcional nesta estrutura');
  await p.click('[data-cfget="1"]'); await p.waitForTimeout(400); await p.click('input[data-cfgesp="1"]', { force: true }); await p.waitForTimeout(400); await p.click('[data-cfget="2"]'); await p.waitForTimeout(500);
  const q1 = await p.$('.cfgcomp [data-cfgq1$="|1"]'); await q1.click(); await p.waitForTimeout(600);
  console.log('7 especial, +1 na quantidade da estrutura: custo', c0, '→', await custo(), '| marcado:', await p.$$eval('.cfgcomp .pill', (x) => x.some((e) => /qtd alterada/.test(e.innerText))));
  await p.click('[data-cfgpadrao]'); await p.waitForTimeout(600); console.log('8 restaurar padrão: custo', await custo(), c0 === (await custo()) ? '(igual ao original)' : '(DIFERENTE)');
  await p.click('[data-cfgadd]'); await p.waitForTimeout(300); await p.fill('#cfgAddQ', 'MANOMETRO'); await p.waitForTimeout(500); const nAdd = await p.$$eval('[data-cfgaddins]', (x) => x.length);
  if (nAdd) { await p.click('[data-cfgaddins]'); await p.waitForTimeout(600); } console.log('9 componente adicional: achados', nAdd, '| no grupo adicionados:', await p.$$eval('.cfgcomp tr[id^="cfgc_m"]', (x) => x.length), '| custo', await custo());
  await p.fill('#cfgAddQ', 'XYZ-NAOEXISTE'); await p.waitForTimeout(400); console.log('  não encontrado oferece pedido de cadastro:', !!(await p.$('#cfgAddBox [data-pedir]')));
  // 3) Conferir e incluir
  await p.click('[data-cfget="3"]'); await p.waitForTimeout(600);
  console.log('10 conferência:', await p.$eval('.cfgalerts, .banner.ok', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 200)).catch(() => '—'));
  await p.check('input[data-cfgconf="tec"]'); await p.waitForTimeout(400); console.log('11 confirmação registrada:', await p.$eval('input[data-cfgconf="tec"]', (x) => x.closest('label').innerText.replace(/\s+/g, ' ')));
  await shot('4_conferir');
  const inc = await p.$('[data-cfgincluir]'); const dis = await inc.isDisabled(); console.log('12 botão incluir habilitado:', !dis);
  if (!dis) { await inc.click(); await p.waitForTimeout(2500); console.log('13 incluído:', await p.$eval('.cfgincl', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 160)), '| status:', await p.$eval('#saveSt', (x) => x.innerText).catch(() => ''));
    const nItens = async () => { await p.click('[data-step="2"]'); await p.waitForTimeout(400); const n = await p.$$eval('[data-goitem]', (x) => x.length); await p.click(`[data-goitem="${n - 1}"]`); await p.waitForTimeout(500); await p.click('[data-cfget="3"]'); await p.waitForTimeout(400); return n; };
    const n1 = await nItens(); await p.click('[data-cfgincluir]'); await p.waitForTimeout(2500); console.log('14 clicar de novo não duplica: botão diz', await p.$eval('[data-cfgincluir]', (x) => x.innerText.trim()), '| itens na proposta', n1, '→', await nItens()); }
  // reabrir: a inclusão fica registrada com a proposta
  await p.reload(); await p.waitForTimeout(1500); await p.click('[data-view="proposta"]').catch(() => {}); await p.click('[data-step="2"]').catch(() => {}); await p.waitForTimeout(400);
  const n = await p.$$eval('[data-goitem]', (x) => x.length); await p.click(`[data-goitem="${n - 1}"]`).catch(() => {}); await p.waitForTimeout(600); await p.click('[data-cfget="3"]').catch(() => {}); await p.waitForTimeout(500);
  console.log('15 depois de recarregar:', await p.$eval('.cfgincl', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 120)).catch(() => 'sem a etapa Conferir'));
  // 4) comparação com o fluxo anterior: configurador × Testador de estruturas, para os primeiros modelos prontos
  // (sem o componente adicional do passo 9, que o testador não tem)
  await p.click('[data-cfget="2"]'); await p.waitForTimeout(400); for (const k of await p.$$eval('.cfgcomp tr[id^="cfgc_m"] [data-cfgsel]', (x) => x.map((e) => e.dataset.cfgsel))) { await p.click(`[data-cfgsel="${k}"]`); await p.waitForTimeout(200); await p.click('#cfgPainel [data-rmrow]'); await p.waitForTimeout(400); }
  await p.click('[data-cfget="1"]'); await p.waitForTimeout(400); await p.fill('[data-cfgq]', ''); await p.waitForTimeout(300); await p.click('input[data-cfgac=""]', { force: true }); await p.waitForTimeout(300);
  const nomes = await p.$$eval('.cfgmods [data-usemodel], .cfgmods .mcard.on b', (x) => x.map((e) => e.dataset.usemodel || e.innerText)).catch(() => []);
  const cmp = [];
  for (const nm of nomes.slice(0, 8)) {
    await p.click('[data-cfget="1"]').catch(() => {}); await p.waitForTimeout(300); await p.fill('[data-cfgq]', ''); await p.waitForTimeout(300);
    const bt = await p.$(`.cfgmods [data-usemodel="${nm.replace(/"/g, '\\"')}"]`); if (bt) { await bt.click(); await p.waitForTimeout(700); }
    await p.click('[data-cfget="2"]'); await p.waitForTimeout(500);
    const cc = await custo(); const comps = await p.$$eval('.cfgcomp tbody tr[id^="cfgc_r"], .cfgcomp tbody tr[id^="cfgc_h"]', (x) => x.map((r) => r.querySelector('small').innerText).sort());
    cmp.push({ nm, cc, comps });
  }
  const it = await p.evaluate(() => location.hash); void it;
  await p.click('[data-view="cadastro"]'); await p.waitForTimeout(300); await p.click('.areatabs [data-cad="estruturas"]').catch(() => {}); await p.waitForTimeout(300); await p.click('[data-cad="testador"]'); await p.waitForTimeout(500);
  let iguais = 0;
  for (const x of cmp) {
    await p.selectOption('#tsMod', { label: x.nm }).catch(() => {}); await p.click('[data-tstrun]'); await p.waitForTimeout(700);
    const t = await p.$eval('.kpi.lead b', (e) => e.innerText); const comps = await p.$$eval('section.card table.t tbody tr:not(.grp)', (rows) => rows.map((r) => (r.cells[1] ? r.cells[1].innerText.split('\n')[0].replace(/\s*(sem cadastro|sem preço)$/, '').trim() : '')).filter(Boolean).sort());
    const ok = t === x.cc && JSON.stringify(comps) === JSON.stringify(x.comps.map((c) => c.trim())); if (ok) iguais++; else console.log('   diferença em', x.nm, '| configurador', x.cc, x.comps.length, '| testador', t, comps.length);
  }
  console.log('16 configurador × testador (fluxo anterior):', iguais, 'de', cmp.length, 'modelos iguais em custo e componentes');
  // 5) telas: celular, tablet e modo escuro, sem rolagem horizontal
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(500);
  for (const [w, h, nm] of [[390, 844, 'celular'], [820, 1180, 'tablet']]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400); for (const e of [3, 2]) { await p.click(`[data-cfget="${e}"]`); await p.waitForTimeout(400); }
    console.log('17 ' + nm + ': largura da página', await p.evaluate(() => document.documentElement.scrollWidth + ' para ' + window.innerWidth)); await shot('5_' + nm); }
  await p.setViewportSize({ width: 1440, height: 1000 }); await p.emulateMedia({ colorScheme: 'dark' }); await p.click('[data-cfget="2"]'); await p.waitForTimeout(400); await shot('6_escuro');
  console.log('18 teclado: etapas são botões com aria-current:', await p.$eval('.cfgstep[aria-current="step"]', (x) => x.tagName));
  console.log('erros', errs); await b.close();
  void fs;
})();
