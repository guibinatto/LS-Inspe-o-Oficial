// Capturas da arquitetura ERP (menu por módulos, busca, numeração, ficha do produto): PREFIXO=antes|depois
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'); const OUT = path.resolve(__dirname, '../../docs/REV22/erp'); const PRE = process.env.PREFIXO || 'depois';
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: nome === 'celular', hasTouch: nome === 'celular' }); const p = await ctx.newPage();
    await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
    if (nome === 'desktop') {
      await p.screenshot({ path: `${OUT}/${PRE}-menu.png` });
      const sub = await p.$('[data-navgt="cadastros"]'); if (sub) { await sub.click(); await p.click('[data-navgt="comercial"]'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${PRE}-menu-cadastros.png` }); }
      await p.click('#bSideCol'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${PRE}-menu-recolhido.png` }); await p.click('#bSideCol');
      await p.evaluate(() => { const b = document.querySelector('[data-view="cadastro"]'); if (b) b.click(); }); await p.waitForTimeout(500);
      await p.evaluate(() => { const r = document.querySelector('[data-insedit], [data-ins]'); if (r) r.click(); }); await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/${PRE}-ficha-insumo.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.keyboard.press('Control+k'); await p.waitForTimeout(300); if (await p.$('#gBusca')) { await p.fill('#gBusca input', 'motor'); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${PRE}-busca.png` }); await p.keyboard.press('Escape'); }
    } else {
      await p.screenshot({ path: `${OUT}/${PRE}-celular-inicio.png` });
      await p.click('[data-bmais]').catch(() => {}); await p.waitForTimeout(300); await p.click('[data-navgt="cadastros"]').catch(() => {}); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${PRE}-celular-menu.png` });
    }
    await ctx.close();
  }
  console.log('erros', errs); await b.close();
})();
