// Varredura do app: (1) todas as telas do menu no computador e no celular (erro de JavaScript, tela vazia, rolagem lateral);
// (2) os tipos de proposta SPV e FACTS até o PDF conferido; (3) "Ajustar à margem mínima" em vários modelos prontos
// (margem final = mínimo, sem ficar abaixo); (4) Primeira Maiúscula nos campos de nome.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const L = __dirname + '/libs/';
const APP = 'file://' + path.resolve(__dirname, '../../dist/ls-pricer.html');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const brN = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
async function abre(b, vp, movel) {
  const ctx = await b.newContext({ viewport: vp, isMobile: !!movel, hasTouch: !!movel, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /autotable/.test(u) ? 'jspdf-autotable-3.8.2/dist/jspdf.plugin.autotable.min.js' : /exceljs/.test(u) ? 'exceljs-4.4.0/dist/exceljs.min.js' : ''; return f && fs.existsSync(L + f) ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route(/^https:\/\/(?!cdnjs\.cloudflare\.com)/, (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(APP); await p.waitForTimeout(1500); return { ctx, p, errs };
}
(async () => {
  const b = await chromium.launch();
  // 1) telas do menu, com a proposta de exemplo aberta
  const telas = {};
  for (const [nome, vp, movel] of [['computador', { width: 1440, height: 900 }], ['celular', { width: 390, height: 844 }, true]]) {
    const { ctx, p, errs } = await abre(b, vp, movel);
    await p.evaluate(() => document.getElementById('bNew').click()); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('mExample').click()); await p.waitForTimeout(1000);
    const itens = await p.$$eval('#nav [data-view], #nav [data-go]', (x) => x.map((e, i) => ({ i, rot: e.innerText.trim().replace(/\s+/g, ' ') || e.getAttribute('aria-label') || '' })));
    const prob = [];
    for (const it of itens) {
      const e0 = errs.length;
      await p.evaluate((i) => { const e = document.querySelectorAll('#nav [data-view], #nav [data-go]')[i]; if (e) e.click(); }, it.i); await p.waitForTimeout(450);
      const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, n: (document.querySelector('#app') || document.body).innerText.trim().length, ov: !!document.querySelector('#overlay .modal') }));
      if (r.ov) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
      if (errs.length > e0) prob.push(it.rot + ': erro ' + errs.slice(e0).join(' | ').slice(0, 120));
      if (r.n < 80) prob.push(it.rot + ': tela vazia (' + r.n + ' caracteres)');
      if (r.sw > r.w + 1) prob.push(it.rot + ': rolagem lateral ' + r.sw + ' > ' + r.w);
    }
    telas[nome] = itens.length; confere(`telas do menu no ${nome} sem erro, sem tela vazia e sem rolagem lateral`, !prob.length, itens.length + ' telas' + (prob.length ? ' · ' + prob.join(' / ') : ''));
    await ctx.close();
  }
  // 2) SPV e FACTS: cada tipo, primeiro modelo pronto, PDF gerado e conferido
  { const { ctx, p, errs } = await abre(b, { width: 1440, height: 900 });
    const tipos = await p.$$eval('[data-spvnew]', (x) => [...new Set(x.map((e) => e.dataset.spvnew))]); const res = [];
    for (const [k, t] of tipos.entries()) {
      await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(300);
      await p.evaluate((t) => document.querySelector(`[data-spvnew="${t}"]`).click(), t); await p.waitForTimeout(500);
      const mod = await p.$('[data-spmod]'); if (mod) { await mod.click(); await p.waitForTimeout(400); }
      else { // tipo sem modelo pronto (peças, locação): lança uma peça 2 × R$ 1.500
        await p.evaluate(() => [...document.querySelectorAll('#app button')].find((e) => e.offsetParent && e.innerText.trim() === 'Peça').click()); await p.waitForTimeout(400);
        for (const [f, v] of [['desc', 'Peça de teste'], ['qtd', '2'], ['unit', '1500']]) { const el = await p.$(`[data-sp="pecas.0.${f}"]`); if (el) { await el.fill(v); await el.dispatchEvent('change'); await p.waitForTimeout(150); } } }
      for (const [f, v] of [['cliente', 'cliente varredura ltda'], ['contato', 'MARIA DA SILVA'], ['numero', String(20100 + k)], ['local', 'joinville - sc']]) { const el = await p.$(`[data-sp="${f}"], [data-fx="${f}"]`); if (el) { await el.fill(v); await el.dispatchEvent('change'); await p.waitForTimeout(120); } }
      await p.click('#bSave'); await p.waitForTimeout(500);
      const tela = await p.$eval('#pcCard', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => ''); const tot = (tela.match(/total R\$ ([\d.,]+)/) || [])[1];
      let pdf = false, conf = '';
      if (await p.$('[data-pcgerar]')) { try { const dl = p.waitForEvent('download', { timeout: 60000 }); await p.click('[data-pcgerar]'); const d = await dl; const f = path.join(__dirname, 'varr_' + t + '.pdf'); await d.saveAs(f); pdf = fs.statSync(f).size > 5000; await p.waitForTimeout(2500); conf = await p.$eval('#confCard', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => ''); } catch (e) { conf = 'falhou: ' + e.message.slice(0, 60); } }
      const cli = await p.$eval('[data-sp="cliente"], [data-fx="cliente"]', (x) => x.value).catch(() => '');
      res.push({ t, tot, pdf, conferido: /conferida ✓|conferido ✓/.test(conf), cli });
    }
    const ruins = res.filter((r) => !r.pdf || !r.conferido || !r.tot);
    confere('SPV/FACTS: todos os tipos geram PDF conferido com total', !ruins.length, res.length + ' tipos' + (ruins.length ? ' · ' + ruins.map((r) => r.t + (r.pdf ? '' : ' sem PDF') + (r.conferido ? '' : ' não conferido') + (r.tot ? '' : ' sem total')).join(', ') : ''));
    confere('SPV/FACTS: cliente em Primeira Maiúscula', res.every((r) => !r.cli || r.cli === 'Cliente Varredura Ltda'), [...new Set(res.map((r) => r.cli))].join(' / '));
    console.log('  SPV/FACTS:', res.map((r) => r.t + ' R$ ' + r.tot).join(' · '));
    confere('SPV/FACTS sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | ')); await ctx.close(); }
  // 3) margem mínima em vários modelos prontos e 4) nomes no cabeçalho da SEQ
  { const { ctx, p, errs } = await abre(b, { width: 1440, height: 900 });
    await p.evaluate(() => document.querySelector('#nav [data-view="cadastro"]').click()); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('#nav [data-gv="preco"]').click()); await p.waitForTimeout(300);
    await p.fill('#vNome', 'ANA PAULA DOS SANTOS'); await p.dispatchEvent('#vNome', 'change'); await p.click('label:has(input[name="vPapel"][value="vendedor"])'); await p.click('#vAdd'); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(300); await p.click('[data-seqfam="CONJUNTO MOTOBOMBA"]'); await p.waitForTimeout(400);
    const nomes = [['[id$="PROPOSTA_F5"]', 'COOPERATIVA AGROINDUSTRIAL DE MARINGÁ LTDA', 'Cooperativa Agroindustrial de Maringá Ltda'], ['[id$="PROPOSTA_F6"]', 'usina são josé - pr', 'Usina São José - PR']];
    for (const [s, v] of nomes) { await p.fill(s, v); await p.dispatchEvent(s, 'change'); await p.waitForTimeout(250); }
    const sel1 = async (a, i = 1) => { const el = await p.$(`[id$="PROPOSTA_${a}"]`); const o = await el.$$eval('option', (x) => x.map((y) => y.value)); await el.selectOption(o[i]); await p.waitForTimeout(200); };
    await p.fill('#cnpjIn', '11.222.333/0001-81'); await p.dispatchEvent('#cnpjIn', 'change'); await p.waitForTimeout(200);
    await sel1('F7'); await sel1('J5'); await sel1('F8'); for (const [a, v] of [['C5', '20.300'], ['C10', '15 dias']]) { await p.fill(`[id$="PROPOSTA_${a}"]`, v); await p.dispatchEvent(`[id$="PROPOSTA_${a}"]`, 'change'); }
    await sel1('J6', 2); await p.evaluate(() => { const x = [...document.querySelectorAll('[id$="PROPOSTA_F9"] label, [id$="PROPOSTA_F9"] button')].find((e) => /NFPA20/.test(e.innerText)); if (x) x.click(); }); await sel1('B13');
    await p.click('label:has(input[data-ppcell="C8"])'); await p.waitForTimeout(200);
    for (const [k, v, esp] of [['clienteCurto', 'COCAMAR SEDE', 'Cocamar Sede'], ['aosCuidados', 'eng. joão da silva', 'Eng. João da Silva'], ['cidade', 'MARINGÁ-PR', 'Maringá-PR']]) { const s = '[data-pc="' + k + '"]'; if (await p.$(s)) { await p.fill(s, v); await p.dispatchEvent(s, 'change'); await p.waitForTimeout(200); nomes.push([s, v, esp]); } }
    const lidos = []; for (const [s, , esp] of nomes) { const v = await p.$eval(s, (x) => x.value).catch(() => '?'); lidos.push([v, esp]); }
    const vend = await p.$$eval('input[data-ppcell="C8"]', (x) => x.map((e) => e.value));
    confere('cabeçalho SEQ: nomes em Primeira Maiúscula', lidos.every(([v, e]) => v === e), lidos.map(([v]) => v).join(' / '));
    confere('vendedor em Primeira Maiúscula', vend.includes('Ana Paula dos Santos'), vend.join(', '));
    await p.click('[data-cabnext]'); await p.waitForTimeout(800);
    const modelos = await p.$$eval('.cfgmods [data-usemodel]', (x) => x.map((e) => e.dataset.usemodel)); const res = [];
    for (const nm of modelos.slice(0, 12)) {
      await p.click('[data-cfget="1"]').catch(() => {}); await p.waitForTimeout(300);
      const bt = await p.$(`.cfgmods [data-usemodel="${nm.replace(/"/g, '\\"')}"]`); if (!bt) continue; await bt.click(); await p.waitForTimeout(700);
      if (await p.$('#c_ITEM01_G17')) { const o = await p.$$eval('#c_ITEM01_G17 option', (x) => x.map((y) => y.value).filter(Boolean)); if (o.length) { await p.selectOption('#c_ITEM01_G17', o[Math.floor(o.length / 2)]); await p.waitForTimeout(500); } }
      await p.click('[data-cfget="3"]'); await p.waitForTimeout(500);
      // volta margem-alvo e modo de preço ao padrão (o ajuste do modelo anterior fica gravado no item)
      for (const a of ['L17', 'J17']) { await p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => { d.open = true; })); const r = await p.$(`[data-restore="ITEM 01|${a}"]`); if (r) { await r.click(); await p.waitForTimeout(500); } }
      const lerM = async () => { const t = await p.$eval('.sumbar', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => ''); const m = t.match(/Margem ([\d,]+)%/i); return m ? brN(m[1]) : NaN; };
      const antes = await lerM(); const temBt = await p.evaluate(() => { const x = [...document.querySelectorAll('#app button')].find((y) => y.offsetParent && y.innerText.trim() === 'Ajustar à margem mínima'); if (x) x.click(); return !!x; });
      await p.waitForTimeout(900); const depois = await lerM(); res.push({ nm: nm.slice(0, 48), antes, depois, temBt });
    }
    const aj = res.filter((r) => r.temBt); const fora = aj.filter((r) => !(Math.abs(r.depois - 30) < 0.051));
    console.log('  margem:', res.map((r) => r.nm.replace('CMB ', '') + ' ' + r.antes + '%' + (r.temBt ? ' → ' + r.depois + '%' : ' (acima do mínimo)')).join('\n          '));
    confere('Ajustar à margem mínima: margem final 30,0% em todos os modelos abaixo do mínimo', aj.length > 0 && !fora.length, aj.length + ' de ' + res.length + ' modelos ajustados' + (fora.length ? ' · fora: ' + fora.map((r) => r.nm + ' ' + r.depois).join(', ') : ''));
    confere('configurador sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | ')); await ctx.close(); }
  await b.close();
  console.log('OK:', ok.length); ok.forEach((x) => console.log('  ✓', x)); console.log('FALHA:', falha.length); falha.forEach((x) => console.log('  ✗', x));
  process.exit(falha.length ? 1 : 0);
})();
