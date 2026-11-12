// Relatórios gerenciais (Margens → Relatórios): custo previsto × realizado.
// Monta uma proposta ganha (exemplo SEQ Cocamar), lança custo real diferente do previsto em uma linha e confere que o
// relatório bate com a tela de custo real da própria proposta, em todos os agrupamentos, nas bases e no Excel.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'); const L = __dirname + '/libs/';
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const brl = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); return u.endsWith('exceljs.min.js') ? r.fulfill({ path: L + 'exceljs-4.4.0/dist/exceljs.min.js', contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  try {
    await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
    // sem nada ganho: a tela explica de onde vêm os dados
    await p.evaluate(() => document.querySelector('[data-go="margens"][data-gv="relatorios"]').click()); await p.waitForTimeout(500);
    confere('menu Gestão → Relatórios gerenciais abre a tela', /Relatórios gerenciais/i.test(await p.$eval('#app h1', (x) => x.innerText)));
    confere('sem proposta ganha: explica como os dados entram', /Nenhuma proposta ganha no filtro/.test(await p.$eval('#app', (x) => x.innerText)));
    // proposta ganha com custo real
    await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
    await p.click('[data-view="inicio"]'); await p.click('.home [data-etp$="|cliente"]'); await p.waitForTimeout(300); await p.click('.home [data-hnext]'); await p.waitForTimeout(300);
    await p.uncheck('#fcXls'); await p.click('#fcOk'); await p.waitForTimeout(700); await p.click('#emSo'); await p.waitForTimeout(500);
    const iu = await p.$('#cr_ITEM\\ 01 input[data-ru] >> nth=1'); await iu.fill('1.500,00'); await iu.press('Tab'); await p.waitForTimeout(400);
    const iq = await p.$('#cr_ITEM\\ 01 input[data-rq] >> nth=1'); await iq.fill('2'); await iq.press('Tab'); await p.waitForTimeout(400);
    await p.click('[data-rokall="ITEM 01"]'); await p.waitForTimeout(400);
    const sb = await p.$$eval('.sumbar > div', (x) => x.map((e) => e.querySelector('b').innerText));
    const prev = brl(sb[0]), real = brl(sb[1]);
    // relatório
    await p.click('[data-mgback]'); await p.waitForTimeout(300); await p.click('[data-mgtab="relatorios"]'); await p.waitForTimeout(500);
    const kp = await p.$$eval('#app .kpis .kpi', (x) => x.map((e) => e.innerText.replace(/\s+/g, ' ')));
    const totalLinha = async () => p.$$eval('#app table.t tr.tot td', (x) => x.map((e) => e.innerText.split('\n')[0]));
    let tot = await totalLinha();
    confere('total da tabela: custo previsto igual ao da tela de custo real', Math.abs(brl(tot[3]) - prev) < 0.01, tot[3] + ' × ' + sb[0]);
    confere('total da tabela: custo realizado igual ao da tela de custo real', Math.abs(brl(tot[4]) - real) < 0.01, tot[4] + ' × ' + sb[1]);
    confere('desvio = realizado − previsto, com sinal', /^[+−]/.test(tot[5]) && Math.abs(brl(tot[5].replace('−', '-')) - (real - prev)) < 0.01, tot[5]);
    confere('indicadores: previsto, realizado, margem e conferência', kp.length === 5 && /Custo realizado/i.test(kp[2]) && /p\.p\./.test(kp[3]) && /linhas com custo real/i.test(kp[4]), kp.join(' | ').slice(0, 200));
    confere('dois gráficos de barras, linha por mês e tabelas', (await p.$$('#app svg.vz')).length >= 2 && /Componentes com maior desvio/i.test(await p.$eval('#app', (x) => x.innerText)));
    const comp = await p.$$eval('#app section', (x) => (x.find((s) => /Componentes com maior desvio/i.test(s.innerText)) || {}).innerText || '');
    confere('componente alterado aparece entre os maiores desvios', /[+−]\d/.test(comp) && !/Nenhuma linha conferida/.test(comp), comp.slice(0, 160).replace(/\s+/g, ' '));
    // todos os agrupamentos fecham no mesmo total
    for (const d of ['vendedor', 'cliente', 'mes', 'div', 'familia']) {
      await p.selectOption('#rlDim', d); await p.waitForTimeout(300); tot = await totalLinha();
      const linhas = await p.$$eval('#app section.span-all:last-of-type table.t tbody tr:not(.tot)', (x) => x.map((e) => e.querySelector('td:nth-child(4)').innerText));
      const soma = linhas.reduce((t, v) => t + brl(v), 0);
      confere(`agrupar por ${d}: grupos somam o total previsto`, Math.abs(soma - prev) < 0.05 && Math.abs(brl(tot[3]) - prev) < 0.01, linhas.length + ' grupo(s), soma ' + soma.toFixed(2));
    }
    // bases
    await p.selectOption('#rlBase', 'completas'); await p.waitForTimeout(300);
    confere('base "só 100% conferidas": proposta com linha sem conferir fica de fora, com explicação', /nenhuma com o custo real 100% conferido/.test(await p.$eval('#app', (x) => x.innerText)));
    await p.selectOption('#rlBase', 'todas'); await p.waitForTimeout(300);
    confere('base "todas as ganhas" volta a mostrar a proposta', Math.abs(brl((await totalLinha())[3]) - prev) < 0.01);
    // Excel
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-rlxls]')]); const arq = __dirname + '/rel_relatorio.xlsx'; await d.saveAs(arq);
    const xl = await p.evaluate(async (b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(bin.buffer);
      return { nomes: wb.worksheets.map((w) => w.name), pac: wb.getWorksheet('Pacotes').getRow(6).values.map((v) => (v && typeof v === 'object' ? v.result ?? String(v) : v)) }; }, require('fs').readFileSync(arq).toString('base64'));
    const nomes = xl.nomes;
    confere('Excel com uma aba por agrupamento, pacotes e componentes', ['Por família', 'Por vendedor', 'Por cliente', 'Por mês', 'Por divisão', 'Pacotes', 'Componentes'].every((n) => nomes.includes(n)), nomes.join(', '));
    const lin = xl.pac;
    confere('Excel: pacote com previsto e realizado iguais aos da tela', Math.abs(Number(lin[7]) - prev) < 0.01 && Math.abs(Number(lin[8]) - real) < 0.01, lin.slice(1, 10).join(' | '));
    // celular
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
    confere('celular: sem rolagem lateral da página', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  } catch (e) { falha.push('erro: ' + (e.stack || e)); }
  await b.close();
  console.log('Relatórios gerenciais: ' + ok.length + ' ok, ' + falha.length + ' falha(s)'); ok.forEach((x) => console.log('  ok  ' + x)); falha.forEach((x) => console.log('  FALHA  ' + x));
  process.exit(falha.length ? 1 : 0);
})();
