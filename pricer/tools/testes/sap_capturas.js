// Capturas da etapa SAP (menu Comercial/Engenharia, abas da proposta, Formação de preço, listas e ficha):
// PREFIXO=antes APP_HTML=<html anterior> node sap_capturas.js   |   PREFIXO=depois node sap_capturas.js
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'); const OUT = path.resolve(__dirname, '../../docs/REV22/sap'); const PRE = process.env.PREFIXO || 'depois';
const APP = 'file://' + path.resolve(process.env.APP_HTML || path.join(__dirname, '../../dist/ls-pricer.html'));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [nome, vp] of [['desktop', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: nome === 'celular', hasTouch: nome === 'celular' }); const p = await ctx.newPage();
    await p.route('https://**', (r) => r.abort()); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    await p.goto(APP); await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById('bNew').click()); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('mExample').click()); await p.waitForTimeout(900);
    const pv = '#app'; const shot = async (n) => p.screenshot({ path: `${OUT}/${PRE}-${nome}-${n}.png` });
    await p.evaluate(() => { const b = [...document.querySelectorAll('[data-view="proposta"]')].find((x) => x.offsetParent); if (b) b.click(); }); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('.ptab[data-step="4"]').click()); await p.waitForTimeout(700); await shot('formacao');
    if (nome === 'desktop') {
      await p.evaluate(() => { const c = document.querySelector('.cpreco') || document.querySelector('.kpis'); if (c) c.scrollIntoView(); }); await p.waitForTimeout(200); await shot('formacao-composicao');
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.evaluate(() => { const b = document.querySelector('#nav [data-view="cadastro"]'); if (b) b.click(); }); await p.waitForTimeout(600); await shot('insumos-lista');
      await p.click('#app tr[data-ins] td.code').catch(() => {}); await p.waitForTimeout(700); await shot('insumo-ficha'); await p.keyboard.press('Escape');
    }
    await ctx.close();
  }
  console.log('erros', errs); await b.close();
})();
