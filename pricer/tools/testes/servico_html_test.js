// (1) Versão interativa (HTML) da proposta SEQ de exemplo: sai junto com o PDF oficial, que vai dentro dela com o SHA-256;
//     abre sem internet, mostra cliente, total, itens e condições, e não chama nada de fora.
// (2) Proposta de serviço (SPV) no modelo novo: importa a PTC da WEG (IMP_SPV_SERV, como no importa_spv_test), preenche a
//     execução do serviço e os termos em anexo, e confere o PDF: sem "fabricação"/DTC, com equipe, segurança, sistema fora de
//     operação, entregáveis, garantia, dados fiscais, proposta relacionada, menos páginas e o PDF dos termos à parte.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const { execSync } = require('child_process'); const L = __dirname + '/libs/';
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? ' (' + d + ')' : ''));
const SERV = (process.env.IMP_SPV_SERV || '').split(';').filter(Boolean);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  await ctx.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : /exceljs/.test(u) ? 'exceljs-4.4.0/dist/exceljs.min.js' : null; return f && fs.existsSync(L + f) ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const baixa = async (n, acao) => { const L2 = []; const h = (d) => L2.push(d); p.on('download', h); await acao(); const t0 = Date.now(); while (L2.length < n && Date.now() - t0 < 180000) await p.waitForTimeout(300); await p.waitForTimeout(800); p.off('download', h); return L2; };
  await p.goto('file://' + path.resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1500);

  // ---------- (1) versão interativa ----------
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(900); await p.click('#bSave'); await p.waitForTimeout(800);
  await p.click('[data-view="proposta"]'); await p.evaluate(() => [...document.querySelectorAll('.ptab')].find((e) => /DOCUMENTOS/i.test(e.innerText)).click()); await p.waitForTimeout(800);
  confere('botão "Versão interativa (HTML)" em Documentos', !!(await p.$('[data-pchtml]')));
  const ds = await baixa(2, () => p.click('[data-pchtml]'));
  const pdfD = ds.find((d) => /\.pdf$/i.test(d.suggestedFilename())), htmlD = ds.find((d) => /\.html$/i.test(d.suggestedFilename()));
  confere('saem o PDF oficial e o HTML', !!pdfD && !!htmlD, ds.map((d) => d.suggestedFilename()).join(' + '));
  if (pdfD && htmlD) {
    const fp = path.join(__dirname, 'interativa.pdf'), fh = path.join(__dirname, 'interativa.html'); await pdfD.saveAs(fp); await htmlD.saveAs(fh);
    const html = fs.readFileSync(fh, 'utf8'); const pdf = fs.readFileSync(fp); const sha = crypto.createHash('sha256').update(pdf).digest('hex');
    const m = html.match(/data:application\/pdf;base64,([A-Za-z0-9+/=]+)/); const dentro = m ? Buffer.from(m[1], 'base64') : null;
    confere('o PDF dentro do HTML é o mesmo PDF oficial (byte a byte)', !!dentro && dentro.equals(pdf), dentro ? dentro.length + ' bytes' : 'sem PDF');
    confere('SHA-256 do PDF no rodapé', html.includes(sha), sha.slice(0, 16) + '…');
    confere('aviso de que o PDF é o documento oficial', /em caso de divergência, vale o PDF/.test(html));
    confere('tamanho do HTML', html.length < 15e6, Math.round(html.length / 1024) + ' KB');
    const v = await ctx.newPage(); const ext = []; await v.route('**/*', (r) => { const u = r.request().url(); if (/^(https?):/.test(u)) { ext.push(u); return r.abort(); } return r.continue(); });
    const verr = []; v.on('pageerror', (e) => verr.push(e.message));
    await v.goto('file://' + fh); await v.waitForTimeout(1200);
    const txt = await v.evaluate(() => document.body.innerText);
    confere('abre com cliente, total, itens e condições', /COCAMAR/.test(txt) && /4\.258\.300,00/.test(txt) && /SKID COMBATE/.test(txt) && /CONDIÇÕES/i.test(txt), '');
    await v.screenshot({ path: path.join(__dirname, 'interativa_capa.png') });
    await v.evaluate(() => document.getElementById('itens').scrollIntoView()); await v.waitForTimeout(1500);
    confere('animação: itens aparecem ao rolar', await v.evaluate(() => document.querySelectorAll('#itens .rv.vis').length > 0));
    await v.screenshot({ path: path.join(__dirname, 'interativa_itens.png') });
    await v.setViewportSize({ width: 390, height: 844 }); await v.evaluate(() => scrollTo(0, 0)); await v.waitForTimeout(500);
    confere('celular: sem rolagem lateral', await v.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await v.evaluate(() => document.documentElement.scrollWidth));
    await v.screenshot({ path: path.join(__dirname, 'interativa_celular.png') });
    confere('nenhuma chamada externa', !ext.length, ext.join(' '));
    confere('sem erro de JavaScript no HTML', !verr.length, verr.join(' | '));
    await v.close();
  }

  // ---------- (2) proposta de serviço ----------
  if (!SERV.length) console.log('  (sem IMP_SPV_SERV: parte de serviço não rodou)');
  else {
    await p.click('#bNew'); await p.waitForTimeout(300); await p.click('#mImport'); await p.waitForTimeout(300); await p.setInputFiles('#impArq', SERV);
    await p.waitForFunction(() => !/Lendo os arquivos/.test((document.getElementById('impPrev') || {}).innerText || ''), null, { timeout: 120000 });
    await p.click('#impOk'); await p.waitForTimeout(1500); await p.click('#bSave'); await p.waitForTimeout(800);
    const pdfTxt = async (d) => { const f = path.join(__dirname, d.suggestedFilename()); await d.saveAs(f); return { t: execSync(`pdftotext -layout "${f}" - 2>/dev/null`).toString().replace(/[ \t]+/g, ' '), pags: +((execSync(`pdfinfo "${f}"`).toString().match(/Pages:\s+(\d+)/) || [])[1] || 0) }; };
    const antes = await pdfTxt((await baixa(1, () => p.evaluate(() => document.querySelector('[data-pcgerar]').click())))[0]);
    confere('serviço (antes de preencher): sem "Fabricação" e sem a nota de DTC', !/Fabrica[çc][ãa]o: \d/.test(antes.t) && !/pagamentos vinculados a eventos contratuais/.test(antes.t), antes.pags + ' páginas');
    confere('serviço: sem caixa de "Desvios" vazia', !/Desvios\s*\n\s*Exclus/.test(antes.t));
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { if (d.querySelector('[data-pc="equipe"]')) d.open = true; }));
    const preenche = async (k, v) => { await p.evaluate(([k, v]) => { const e = document.querySelector('[data-pc="' + k + '"]'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]); await p.waitForTimeout(150); };
    const marca = async (sel) => { await p.evaluate((sel) => { const e = document.querySelector(sel); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }, sel); await p.waitForTimeout(250); };
    await preenche('prazoMobil', '5'); await preenche('equipe', '02 técnicos especializados'); await preenche('duracao', '1 dia (8 horas)'); await preenche('horario', 'segunda a sexta, 8h às 17h');
    for (const k of ['nr10', 'aso', 'integ', 'apr']) await marca('[data-pcchk="seg|' + k + '"]');
    await marca('[data-pcbool="foraOp"]'); await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { if (d.querySelector('[data-pc="equipe"]')) d.open = true; })); await preenche('foraHoras', '6 horas');
    for (const k of ['acesso', 'utilid']) await marca('[data-pcchk="resp|' + k + '"]'); for (const k of ['relat', 'teste']) await marca('[data-pcchk="entreg|' + k + '"]');
    await preenche('garantia', '90 dias a partir da conclusão, para defeitos de execução'); await preenche('lc116', '14.01'); await preenche('issMun', 'Guaramirim-SC'); await preenche('issRet', 'sim');
    await preenche('relacionadas', 'Radiador fornecido conforme a PTC 10.342 (cobrado à parte)'); await marca('[data-pcbool="termosAnexo"]');
    const st = await p.evaluate(() => JSON.parse(localStorage.getItem('lspricer.current')).propCom);
    confere('campos gravados na proposta', st && st.equipe && st.seg && st.seg.length === 4 && st.foraOp && st.termosAnexo && st.issRet === 'sim', JSON.stringify(st && { seg: st.seg, resp: st.resp, entreg: st.entreg }));
    const ds2 = await baixa(2, () => p.evaluate(() => document.querySelector('[data-pcgerar]').click()));
    const prop = ds2.find((d) => !/^TERMOS/.test(d.suggestedFilename())), term = ds2.find((d) => /^TERMOS/.test(d.suggestedFilename()));
    confere('saem a proposta e o PDF dos termos', !!prop && !!term, ds2.map((d) => d.suggestedFilename()).join(' + '));
    if (prop && term) {
      const P2 = await pdfTxt(prop), T2 = await pdfTxt(term);
      const tem = (re) => re.test(P2.t);
      confere('execução: início, equipe, duração e horário', tem(/Início dos serviços: 5 dias após o pedido de compra/) && tem(/Equipe: 02 técnicos/) && tem(/Duração estimada no local: 1 dia/) && tem(/Horário de trabalho:/));
      confere('segurança: NR-10, ASO, integração e APR', tem(/NR-10/) && tem(/ASO/) && tem(/integração de segurança/) && tem(/permissão de trabalho/));
      confere('sistema fora de operação com o tempo e a NFPA 25', tem(/fora de operação por aproximadamente 6 horas/) && tem(/NFPA 25/));
      confere('responsabilidades, entregáveis e garantia', tem(/Responsabilidades do cliente/) && tem(/Energia elétrica e água/) && tem(/Entregáveis/) && tem(/registro fotográfico/) && tem(/Garantia do serviço/) && tem(/90 dias a partir da conclusão/));
      confere('dados fiscais e proposta relacionada', tem(/LC 116\/2003\): 14\.01/) && tem(/ISS devido em: Guaramirim-SC/) && tem(/ISS retido pelo tomador: sim/) && tem(/PTC 10\.342/));
      confere('termos: referência ao anexo pelo nome', tem(/enviados como anexo a esta\s+proposta/) && P2.t.includes(term.suggestedFilename().slice(0, 12)));
      confere('proposta mais curta (termos fora)', P2.pags < antes.pags, antes.pags + ' → ' + P2.pags + ' páginas');
      confere('PDF dos termos com o texto completo', /TERMOS E CONDIÇÕES GERAIS DE FORNECIMENTO/.test(T2.t) && /Prazos de Fabricação/.test(T2.t), T2.pags + ' páginas');
      confere('ainda sem "Fabricação" na proposta de serviço', !/Fabrica[çc][ãa]o:/.test(P2.t));
      execSync(`pdftoppm -r 60 -png "${path.join(__dirname, prop.suggestedFilename())}" "${path.join(__dirname, 'servico_pag')}"`);
    }
  }
  confere('sem erro de JavaScript no app', !errs.length, errs.join(' | '));
  for (const x of ok) console.log('  ✓ ' + x); for (const x of falha) console.log('  ✗ ' + x);
  console.log('FALHA: ' + falha.length); await b.close(); process.exit(falha.length ? 1 : 0);
})();
