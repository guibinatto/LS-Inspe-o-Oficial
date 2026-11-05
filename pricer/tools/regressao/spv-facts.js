#!/usr/bin/env node
/* Regressão de SPV e FACTS pela tela: cria uma proposta de cada tipo de SPV e um FACTS padrão e lê o resumo calculado.
 * Uso: node tools/regressao/spv-facts.js <arquivo html do app> > resultado.json   (precisa do Playwright)
 * Comparar: node tools/regressao/motor.js --comparar referencia.json atual.json
 */
'use strict';
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
(async () => {
  const html = path.resolve(process.argv[2]); const b = await pw.chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort());
  await p.goto('file://' + html); await p.waitForTimeout(1200);
  const res = {};
  const ler = async () => p.$$eval('.sumbar > div', (x) => x.map((d) => { const s = d.querySelector('span'), v = d.querySelector('b'); return s && v ? [s.innerText.trim().toUpperCase(), v.innerText.trim()] : null; }).filter(Boolean));
  const tipos = await p.$$eval('[data-spvnew]', (x) => x.map((e) => e.dataset.spvnew));
  for (const t of tipos) {
    await p.click('[data-view="inicio"]'); await p.waitForTimeout(250); await p.click(`[data-spvnew="${t}"]`); await p.waitForTimeout(500);
    const o = {}; for (const [k, v] of await ler()) if (!/REV/.test(k)) o[k] = v; res['SPV ' + t] = o;
  }
  await p.click('[data-view="inicio"]'); await p.waitForTimeout(250);
  const fx = await p.$('[data-seqfam="FACTS"], [data-factsnew], .tchip[data-facts]');
  if (fx) { await fx.click(); await p.waitForTimeout(600); const o = {}; for (const [k, v] of await ler()) if (!/REV/.test(k)) o[k] = v; res['FACTS padrão'] = o; }
  process.stdout.write(JSON.stringify(res, null, 1)); await b.close();
})();
