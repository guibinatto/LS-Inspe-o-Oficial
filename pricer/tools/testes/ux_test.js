// Menos cliques para o vendedor: proposta nova repete as escolhas da última (pagamento, norma, frete, validade); atalhos de
// validade; Formação com uma só área de negociação (atalhos de um clique); clique na margem do topo leva à negociação;
// pendências da conferência sem lista repetida. Proposta do exemplo (Cocamar) salva primeiro.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(String(e)));
  await p.route('https://**', (r) => r.abort()); await p.route('https://cdnjs.cloudflare.com/**', (r) => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(900);
  // validade do exemplo = data + 7 dias; a próxima proposta deve repetir esse prazo
  const ex = await p.evaluate(() => JSON.parse(localStorage.getItem('lspricer.current')).doc.PROPOSTA);
  await p.click('#bSave'); await p.waitForTimeout(800);
  // 1) Formação: uma área de negociação; composição e cenários avançados recolhidos
  await p.click('[data-view="proposta"]'); await p.click('.ptab[data-step="4"]'); await p.waitForTimeout(800);
  const cards = await p.$$eval('#app .card > h2, #app details.card > summary', (x) => x.map((e) => e.innerText.split('\n')[0].trim()));
  confere('Formação: Negociar aparece uma vez e os campos de desconto não se repetem', (await p.$$('#smDesc')).length === 1 && !(await p.$('#c_PROPOSTA_C9')), cards.join(' / '));
  confere('Formação: composição e cenários avançados recolhidos', await p.evaluate(() => { const a = document.querySelector('details[data-keep="compos"]'), c = document.querySelector('#simAvDet'); return a && c && !a.open && !c.open; }));
  confere('Formação: pagamento e frete dentro de Negociar', !!(await p.$('#simMgCard #c_PROPOSTA_J6')) && !!(await p.$('#simMgCard #c_PROPOSTA_B13')));
  const doc0 = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lspricer.current')).doc));
  // atalho "Margem mínima": um clique simula 30%
  await p.click('[data-smq^="margem|"]'); await p.waitForTimeout(400);
  await p.waitForFunction(() => /30,00%/.test((document.getElementById('smRes') || {}).innerText || ''), null, { timeout: 20000 }).catch(() => {});
  const mg = await p.evaluate(() => { const tr = [...document.querySelectorAll('#smRes tr')].find((x) => x.cells[0] && x.cells[0].innerText.trim() === 'Margem líquida (%)'); return tr ? tr.cells[2].innerText : ''; });
  confere('atalho "Margem mínima": 1 clique mostra a simulação com 30,00%', /30,00%/.test(mg), mg);
  confere('atalho não altera a proposta antes de Aplicar', doc0 === await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('lspricer.current')).doc)));
  await p.click('[data-smq="desc|0.05"]'); await p.waitForTimeout(600);
  const d5 = await p.evaluate(() => { const tr = [...document.querySelectorAll('#smRes tr')].find((x) => x.cells[0] && x.cells[0].innerText.trim() === 'Desconto global'); return tr ? tr.cells[2].innerText : ''; });
  confere('atalho 5%: simula o desconto global de 5%', /5,00%/.test(d5) && (await p.inputValue('#smDesc')) === '5,00', d5);
  // 2) margem no topo leva à negociação
  await p.click('.ptab[data-step="1"]'); await p.waitForTimeout(500); await p.click('.ctx-kpis .kneg'); await p.waitForTimeout(800);
  confere('clique na margem do topo abre a Formação na negociação', await p.evaluate(() => { const c = document.getElementById('simMgCard'); if (!c) return false; const r = c.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0 && document.activeElement && document.activeElement.id === 'smDesc'; }));
  // 3) conferência: pendências recolhidas (os avisos já aparecem na conferência)
  await p.click('.ptab[data-step="5"]'); await p.waitForTimeout(700);
  confere('Conferência: pendências da proposta recolhidas', await p.evaluate(() => { const d = document.querySelector('details#pnProp'); return !!d && !d.open && /Pendências desta proposta/i.test(d.querySelector('summary').innerText); }));
  // 4) proposta nova repete a última
  await p.click('#bNew'); await p.click('#mBlank'); await p.waitForTimeout(900);
  const P = await p.evaluate(() => JSON.parse(localStorage.getItem('lspricer.current')).doc.PROPOSTA);
  const dt = (v) => { const t = String(v || ''); let m = t.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return Date.UTC(+m[1], m[2] - 1, +m[3]); m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Date.UTC(+m[3], m[2] - 1, +m[1]) : NaN; };
  const dias = (a, b2) => Math.round((dt(b2) - dt(a)) / 864e5);
  confere('nova: pagamento, norma e frete da última proposta', P.J6 === ex.J6 && P.F9 === ex.F9 && P.B13 === ex.B13, [P.J6, P.F9, P.B13].join(' | '));
  confere('nova: mesma validade em dias da última', dias(P.C7, P.C10) === dias(ex.C7, ex.C10), dias(ex.C7, ex.C10) + ' → ' + dias(P.C7, P.C10));
  confere('nova: cliente e número continuam vazios', !P.F5 && !P.C5);
  // 5) atalho de validade: 1 clique
  await p.click('[data-valdias="30"]'); await p.waitForTimeout(500);
  const P2 = await p.evaluate(() => JSON.parse(localStorage.getItem('lspricer.current')).doc.PROPOSTA);
  confere('atalho "30 dias": validade = data + 30', dias(P2.C7, P2.C10) === 30, P2.C7 + ' → ' + P2.C10);
  confere('sem erro de JavaScript', !erros.length, erros.join(' | '));
  for (const x of ok) console.log('  ✓ ' + x); for (const x of falha) console.log('  ✗ ' + x);
  console.log('FALHA: ' + falha.length); await b.close(); process.exit(falha.length ? 1 : 0);
})();
