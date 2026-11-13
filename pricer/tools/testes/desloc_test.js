// Cidade base do técnico e estimativa do deslocamento na SPV.
// Cadastra a base de um técnico (Curitiba/PR), abre uma SPV com dois técnicos para Cajamar/SP e confere: a estimativa por
// técnico (base própria ou sede), o botão que preenche a distância, que nada muda sem o clique, e a cidade não encontrada.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.route('https://**', (r) => r.abort()); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  try {
    await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
    // cadastro: base do Yago em Curitiba/PR
    await p.evaluate(() => document.querySelector('[data-go="cadastro"][data-gv="servicos"]').click()); await p.waitForTimeout(600);
    const campo = async (lb, v) => { const el = await p.$(`input[aria-label="${lb}"]`); await el.fill(v); await el.dispatchEvent('change'); await p.waitForTimeout(400); };
    await campo('Cidade base de Yago', 'Curitiba'); await campo('UF da base de Yago', 'PR');
    const st = await p.evaluate(() => [...document.querySelectorAll('tr')].find((r) => r.querySelector('input[aria-label="Cidade base de Yago"]')).innerText);
    confere('cadastro: cidade base reconhecida (✓ Curitiba/PR)', /Curitiba\/PR/.test(st), st.replace(/\s+/g, ' ').slice(0, 80));
    confere('cadastro: técnico sem base "sai da sede"', /sai da sede/.test(await p.$eval('#app', (x) => x.innerText)));
    // SPV com Yago (Curitiba) e Alessandro (sem base → sede Joinville) para Cajamar/SP
    await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('[data-spvnew="SMC"]').click()); await p.waitForTimeout(500);
    await p.click('[data-spmod="smc-prev"]'); await p.waitForTimeout(400);
    const sp = async (k, v) => { const el = await p.$(`[data-sp="${k}"]`); if ((await el.evaluate((x) => x.tagName)) === 'SELECT') await el.selectOption(v); else await el.fill(v); await el.dispatchEvent('change'); await p.waitForTimeout(300); };
    const dist0 = await p.$eval('[data-sp="dist"]', (x) => x.value);
    await sp('uf', 'SP'); await sp('local', 'Cajamar - galpão 3');
    const esperado = await p.evaluate(() => { const M = window.LSMun, d = M.achar('Cajamar', 'SP'); return { y: Math.round(M.km(M.achar('Curitiba', 'PR'), d) * 1.3), a: Math.round(M.km(M.achar('Joinville', 'SC'), d) * 1.3) }; });
    const info = await p.$eval('[data-spdistinfo]', (x) => x.innerText.replace(/\s+/g, ' ')).catch(() => '');
    const fmt = (n) => n.toLocaleString('pt-BR');
    confere('SPV: estimativa por técnico (base própria e sede)', /Yago \(base Curitiba\/PR\)/.test(info) && /Alessandro \(sede Joinville\/SC\)/.test(info) && info.includes(fmt(esperado.y) + ' km') && info.includes(fmt(esperado.a) + ' km'), info.slice(0, 200));
    confere('SPV: avisa bases diferentes', /bases diferentes/.test(info));
    confere('SPV: sem clicar, a distância não muda', (await p.$eval('[data-sp="dist"]', (x) => x.value)) === dist0, dist0);
    const max = Math.max(esperado.y, esperado.a);
    await p.click('[data-spdist]'); await p.waitForTimeout(400);
    const dist1 = await p.$eval('[data-sp="dist"]', (x) => x.value);
    confere('SPV: "Usar … km" preenche a maior distância', Number(dist1.replace(/\./g, '').replace(',', '.')) === max, dist1 + ' × ' + max);
    const log = await p.evaluate(() => [...document.querySelectorAll('tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).filter((t) => /Deslocamento rodoviário|Passagens aéreas/.test(t)).join(' | '));
    const rod = (max * 2 * 2.7).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    confere('SPV: o deslocamento segue a distância (ida e volta × R$/km; acima de 1.000 km, avião)', max * 2 > 1000 ? /Passagens aéreas trechos R\$ [\d.]+,\d\d R\$ [1-9]/.test(log) : log.includes('R$ ' + rod), log.slice(0, 160));
    await sp('local', 'Cidade Que Não Existe');
    confere('SPV: cidade não encontrada pede para escrever a cidade no Local', /escreva a cidade do serviço no campo/.test(await p.$eval('#app', (x) => x.innerText)));
    confere('sem erro de JavaScript', !errs.length, errs.slice(0, 2).join(' | '));
  } catch (e) { falha.push('erro: ' + (e.stack || e)); }
  await b.close();
  console.log('Deslocamento pela base: ' + ok.length + ' ok, ' + falha.length + ' falha(s)'); ok.forEach((x) => console.log('  ok  ' + x)); falha.forEach((x) => console.log('  FALHA  ' + x));
  process.exit(falha.length ? 1 : 0);
})();
