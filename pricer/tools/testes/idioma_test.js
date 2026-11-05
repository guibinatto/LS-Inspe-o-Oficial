// Trocar idioma e moeda no card da proposta: a tradução começa na hora (Claude simulado), o card mostra os textos no idioma
// com o original embaixo, e em dólar os totais aparecem convertidos pela taxa.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  // Claude simulado: devolve "[EN] texto" para cada texto pedido
  await p.addInitScript(() => { window.__chamadas = 0; window.claude = { use: async (n) => { if (n !== 'sample') return null; const f = async () => ({ text: '' });
    f.json = async (prompt) => { window.__chamadas++; await new Promise((r) => setTimeout(r, 300)); const m = prompt.match(/TEXTOS:\n([\s\S]*)$/); const L = m ? JSON.parse(m[1]) : []; const pre = /inglês/.test(prompt) ? '[EN] ' : '[ES] '; return { t: L.map((x) => pre + x) }; }; return f; } }; });
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(500);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  const opt = async (nome, v) => { await p.click(`#pcCard input[data-pcopt="${nome}"][value="${v}"]`, { force: true }); };
  const kv = (lb) => p.$eval('#pcCard .pcro', (x, lb) => { const d = [...x.children]; const i = d.findIndex((e) => e.innerText.trim() === lb); return i < 0 ? '?' : d[i + 1].innerText.replace(/\s+/g, ' '); }, lb);
  console.log('1 pt pagamento:', await kv('Condição de pagamento'));
  await opt('idioma', 'en'); await p.waitForTimeout(120);
  console.log('2 durante:', await p.$eval('#pcCard .banner', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 80)));
  await p.waitForTimeout(1500);
  console.log('3 depois:', await p.$eval('#pcCard .banner', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 90)), '| chamadas', await p.evaluate(() => window.__chamadas));
  console.log('4 en pagamento:', await kv('Condição de pagamento'));
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="pc_itens"]'); if (d) d.open = true; });
  console.log('5 item:', await p.$eval('details[data-keep="pc_itens"] tbody tr', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 220)));
  const tot0 = await p.$eval('#pcCard .docbar .sub', (x) => x.innerText);
  await opt('moeda', 'USD'); await p.waitForTimeout(400);
  await p.fill('#pc_taxa', '5,00'); await p.dispatchEvent('#pc_taxa', 'change'); await p.waitForTimeout(400);
  console.log('6 total R$:', tot0.slice(0, 70), '| US$:', (await p.$eval('#pcCard .docbar .sub', (x) => x.innerText)).slice(0, 110));
  await opt('idioma', 'es'); await p.waitForTimeout(1800);
  console.log('7 es pagamento:', await kv('Condição de pagamento'), '| total', (await p.$eval('#pcCard .docbar .sub', (x) => x.innerText)).slice(0, 50));
  await opt('idioma', 'en'); await p.waitForTimeout(500); console.log('8 voltar ao inglês (cache):', await p.evaluate(() => window.__chamadas), 'chamadas no total');
  console.log('erros', errs); await b.close();
})();
