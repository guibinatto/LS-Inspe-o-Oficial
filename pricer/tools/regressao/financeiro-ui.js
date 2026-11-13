#!/usr/bin/env node
/* Comparação financeira pela tela: abre duas ou mais versões do app (arquivo único), carrega a proposta de referência
 * (Nova → Exemplo SEQ Cocamar) e compara, número a número, o memorial de cálculo (todas as linhas, por item e total)
 * e os totais da proposta. Uso: node tools/regressao/financeiro-ui.js referencia.html atual.html [outra.html…]
 * Sai com 1 se algum número diferir. Só leitura: nada é gravado. */
'use strict';
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const arquivos = process.argv.slice(2); if (arquivos.length < 2) { console.log('Uso: financeiro-ui.js referencia.html atual.html [outra.html]'); process.exit(2); }
const num = (t) => (String(t).match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?%?|-?\d+(?:,\d+)?%?/g) || []).map((x) => (x.endsWith('%') ? Number(x.slice(0, -1).replace(/\./g, '').replace(',', '.')) / 100 : Number(x.replace(/\./g, '').replace(',', '.'))));
async function extrai(b, html) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); await p.route('https://**', (r) => r.abort()); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + path.resolve(html)); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('bNew').click()); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('mExample').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-view="memorial"]')][0]; if (b) b.click(); }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => { d.open = true; }));
  const linhas = await p.$$eval('#app table tr', (L) => L.map((r) => [...r.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())).filter((c) => c.length > 1));
  const out = {}; for (const c of linhas) { const lb = c[0].toUpperCase().replace(/\s+/g, ' '); const vs = c.slice(1).join(' | '); if (!lb || !/\d/.test(vs)) continue; let k = lb, n = 2; while (out[k] !== undefined) k = lb + ' #' + n++; out[k] = vs; }
  await p.context().close(); return out;
}
(async () => {
  const b = await pw.chromium.launch(); const R = []; for (const f of arquivos) R.push(await extrai(b, f)); await b.close();
  const ref = R[0]; let dif = 0, n = 0; const msg = [];
  for (let i = 1; i < R.length; i++) {
    const cur = R[i];
    for (const [k, v] of Object.entries(ref)) {
      const a = num(v), c = cur[k] !== undefined ? num(cur[k]) : null;
      if (c === null) { msg.push(`[${path.basename(arquivos[i])}] linha ausente: ${k}`); dif++; continue; }
      if (a.length !== c.length) { msg.push(`[${path.basename(arquivos[i])}] ${k}: ${a.length} valores → ${c.length}`); dif++; continue; }
      a.forEach((x, j) => { n++; if (Math.abs(x - c[j]) > 1e-6 * Math.max(1, Math.abs(x))) { dif++; if (msg.length < 40) msg.push(`[${path.basename(arquivos[i])}] ${k} [${j}]: ${x} → ${c[j]}`); } });
    }
  }
  console.log(`Memorial da proposta de referência: ${Object.keys(ref).length} linhas · ${n} números comparados em ${R.length - 1} versão(ões) · ${dif} diferença(s)`);
  for (const m of msg) console.log('  ' + m);
  process.exit(dif ? 1 : 0);
})();
