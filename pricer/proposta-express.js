/* LS Pricer — proposta no padrão "Folha de dados" (inspirado nas folhas de dados de fabricante, como a Peerless Express):
 * páginas densas com faixa de título escura, seções em faixas cinza com pares rótulo : valor em duas colunas, curva,
 * desenhos e escopo em tabelas Qtd | Descrição. Cores LS Fire (cinza escuro e laranja). Os números vêm da formação
 * (mesmos dados do padrão PTC); a folha de dados completa do fabricante, quando anexada no item, entra como veio
 * (só os campos marcados), com rótulos traduzidos pelo dicionário ou pelo Claude.
 * O = mesmas opções do padrão PTC + fab: { [item]: { dados, curva: dataURL, paginas: { n: { url, w, h } } } }, trFab: (texto em inglês) => tradução
 */
(function () {
  'use strict';
  const P = window.PricerProposta; const I = P._i; const FB = () => window.PricerFabricante || null;
  const ESC = [47, 47, 47], LAR = [228, 101, 14], LAR0 = [199, 56, 21], BANDA = [236, 236, 236], LINHA = [214, 214, 214], CINZA = [110, 110, 110], CLARO = [247, 247, 247];
  const X = {
    pt: { doc_tc: 'Proposta técnica e comercial', doc_com: 'Proposta comercial', doc_tec: 'Proposta técnica', resumo: 'Resumo da proposta', dadosProp: 'Dados da proposta', fornec: 'Resumo do fornecimento', valorTotal: 'Valor total', sobre: 'Sobre a LS Fire', ident: 'Identificação do item', desemp: 'Folha de dados de desempenho', constr: 'Folha de dados construtiva',
      adic: 'Dados adicionais de desempenho', curva: 'Curva de desempenho', curvas: 'Curvas em várias rotações', arranjo: 'Arranjo geral', desenho: 'Desenho', escopo: 'Escopo de fornecimento', lsfire: 'Itens da formação LS Fire', especs: 'Especificações',
      hidr: 'Dados hidráulicos', fdB: 'Bomba (folha de dados)', fdM: 'Acionador (folha de dados)', planilha: 'Planilha de preços', cond: 'Condições comerciais', notas: 'Notas, desvios e exclusões', termos: 'Termos e condições', contatos: 'Contatos', comiss: 'Comissionamento e start-up', prazos: 'Prazos', docs: 'Escopo de documentos',
      qtd: 'Qtd', descr: 'Descrição', item: 'Item', codigo: 'Código', un: 'Un.', ncm: 'NCM', ipi: 'IPI', icms: 'ICMS', unit: 'Unitário c/ impostos', tot: 'Total c/ impostos', ponto: 'Ponto de trabalho', equip: 'Equipamento', fonte: 'Dados do fabricante ({f}), conferidos pela LS Fire.', semFab: 'Dados da formação LS Fire.',
      proposta: 'Proposta', rev: 'Revisão', data: 'Data', validade: 'Validade', vendedor: 'Contato comercial', norma: 'Norma', pagamento: 'Pagamento', frete: 'Frete', prazo: 'Prazo', obs: 'Observações', quantidade: 'Quantidade', tag: 'Tag', modelo: 'Modelo', fabr: 'Fabricante' },
    en: { doc_tc: 'Technical and commercial proposal', doc_com: 'Commercial proposal', doc_tec: 'Technical proposal', resumo: 'Proposal summary', dadosProp: 'Proposal data', fornec: 'Scope summary', valorTotal: 'Total amount', sobre: 'About LS Fire', ident: 'Item identification', desemp: 'Performance datasheet', constr: 'Construction datasheet',
      adic: 'Additional performance data', curva: 'Performance curve', curvas: 'Multi-speed curves', arranjo: 'General arrangement', desenho: 'Drawing', escopo: 'Scope of supply', lsfire: 'LS Fire package items', especs: 'Specifications',
      hidr: 'Hydraulic data', fdB: 'Pump (datasheet)', fdM: 'Driver (datasheet)', planilha: 'Price schedule', cond: 'Commercial conditions', notas: 'Notes, deviations and exclusions', termos: 'Terms and conditions', contatos: 'Contacts', comiss: 'Commissioning and start-up', prazos: 'Lead times', docs: 'Documentation scope',
      qtd: 'Qty', descr: 'Description', item: 'Item', codigo: 'Code', un: 'Unit', ncm: 'NCM', ipi: 'IPI', icms: 'ICMS', unit: 'Unit price incl. taxes', tot: 'Total incl. taxes', ponto: 'Duty point', equip: 'Equipment', fonte: 'Manufacturer data ({f}), checked by LS Fire.', semFab: 'LS Fire package data.',
      proposta: 'Proposal', rev: 'Revision', data: 'Date', validade: 'Validity', vendedor: 'Sales contact', norma: 'Standard', pagamento: 'Payment', frete: 'Freight', prazo: 'Lead time', obs: 'Remarks', quantidade: 'Quantity', tag: 'Tag', modelo: 'Model', fabr: 'Manufacturer' },
    es: { doc_tc: 'Propuesta técnica y comercial', doc_com: 'Propuesta comercial', doc_tec: 'Propuesta técnica', resumo: 'Resumen de la propuesta', dadosProp: 'Datos de la propuesta', fornec: 'Resumen del suministro', valorTotal: 'Valor total', sobre: 'Sobre LS Fire', ident: 'Identificación del ítem', desemp: 'Hoja de datos de desempeño', constr: 'Hoja de datos constructiva',
      adic: 'Datos adicionales de desempeño', curva: 'Curva de desempeño', curvas: 'Curvas a varias velocidades', arranjo: 'Disposición general', desenho: 'Plano', escopo: 'Alcance del suministro', lsfire: 'Ítems del conjunto LS Fire', especs: 'Especificaciones',
      hidr: 'Datos hidráulicos', fdB: 'Bomba (hoja de datos)', fdM: 'Accionador (hoja de datos)', planilha: 'Planilla de precios', cond: 'Condiciones comerciales', notas: 'Notas, desvíos y exclusiones', termos: 'Términos y condiciones', contatos: 'Contactos', comiss: 'Puesta en marcha', prazos: 'Plazos', docs: 'Alcance de documentos',
      qtd: 'Cant.', descr: 'Descripción', item: 'Ítem', codigo: 'Código', un: 'Unid.', ncm: 'NCM', ipi: 'IPI', icms: 'ICMS', unit: 'Unitario c/ impuestos', tot: 'Total c/ impuestos', ponto: 'Punto de trabajo', equip: 'Equipo', fonte: 'Datos del fabricante ({f}), verificados por LS Fire.', semFab: 'Datos del conjunto LS Fire.',
      proposta: 'Propuesta', rev: 'Revisión', data: 'Fecha', validade: 'Validez', vendedor: 'Contacto comercial', norma: 'Norma', pagamento: 'Pago', frete: 'Flete', prazo: 'Plazo', obs: 'Observaciones', quantidade: 'Cantidad', tag: 'Tag', modelo: 'Modelo', fabr: 'Fabricante' },
  };
  // títulos de página do fabricante → título no idioma
  const TIT_PAG = [[/Performance Datasheet/i, 'desemp'], [/Construction/i, 'constr'], [/Additional Data/i, 'adic'], [/Multi-Speed/i, 'curvas'], [/Performance Curve/i, 'curva'], [/General Arrangement/i, 'arranjo'], [/Price Sheet/i, 'escopo']];

  async function montar(D, pc, M, O) {
    O = Object.assign({ tipo: 'tc', lang: 'pt', moeda: { cod: 'BRL' }, img: {}, curvas: {}, fab: {}, tr: (s) => s, trFab: (s) => s }, O || {});
    const lang = O.lang, r = I.R[lang] || I.R.pt, x = X[lang] || X.pt, fdl = I.FD[lang] || I.FD.pt;
    const tr = (s) => (lang === 'pt' || !s ? s : O.tr(s) || s);
    const fb = FB();
    const trF = (s, tipo) => { if (!s || lang === 'en') return s; const d = fb ? (tipo === 'sec' ? fb.secT(s, lang) : tipo === 'rot' ? fb.rotT(s, lang) : tipo === 'lin' ? fb.linhaT(s, lang) : fb.valT(s, lang)) : null; return d || O.trFab(s) || s; };
    const jsPDF = await I.lib(); const AS = window.PRICER_PROPOSTA_ASSETS; if (!AS) throw new Error('Imagens e fontes da proposta não encontradas no app.');
    const E = P.efetivo(D, pc, M, lang); const SEC = P.secoes(D, pc, M, O.tipo); const tem = (k) => SEC.includes(k); const comPreco = O.tipo !== 'tec';
    const nf = (d) => new Intl.NumberFormat(I.LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
    const usd = O.moeda && O.moeda.cod === 'USD' && Number(O.moeda.taxa) > 0;
    const din = (v) => (usd ? 'US$ ' : 'R$ ') + nf(2).format(typeof v === 'number' && isFinite(v) ? (usd ? v / Number(O.moeda.taxa) : v) : 0);
    const pct = (v) => (typeof v === 'number' && isFinite(v) ? nf(2).format(v * 100) + '%' : '—');
    const qtdTxt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : nf(2).format(v)) : String(v || ''));
    const numL = (s) => (lang !== 'en' || typeof s !== 'string' ? s : s.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+,\d+\b/g, (m) => m.replace(/\./g, '\u0000').replace(',', '.').replace(/\u0000/g, ',')));
    // números do fabricante (formato americano) no formato do idioma, com o equivalente métrico ao lado
    const nEN = (t) => Number(String(t).replace(/,/g, ''));
    const swap = (t) => (lang === 'en' ? t : String(t).replace(/(^|[^\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+)(?![\w.])/g, (m, a, n) => (/(HI|API|ISO|NFPA)\s$/.test(String(t).slice(0, String(t).indexOf(m) + a.length)) ? m : a + nf((n.split('.')[1] || '').length).format(nEN(n)))));
    const CONV = { USgpm: [0.2271247, 'm³/h', 1], gpm: [0.2271247, 'm³/h', 1], in: [25.4, 'mm', 0], psi: [0.0689476, 'bar', 2], 'psi.g': [0.0689476, 'bar', 2], 'psi.a': [0.0689476, 'bar (abs.)', 2], lb: [0.45359237, 'kg', 0], hp: [0.7457, 'kW', 1], ft: [0.3048, 'm', 2] };
    function medida(v) {
      let t = String(v || '').trim().replace(/\bdeg C\b/, '°C'); const m = t.match(/^([\d.,]+)\s*(USgpm|gpm|in|psi\.g|psi\.a|psi|lb|hp|ft)$/);
      if (m) { const n = nEN(m[1]); const c = CONV[m[2]]; if (isFinite(n) && n !== 0 && c) { let q = n * c[0], u = c[1], d = c[2]; if (u === 'mm' && q >= 1000) { q /= 1000; u = 'm'; d = 1; } return swap(m[1]) + ' ' + m[2] + ' (' + nf(d).format(q) + ' ' + u + ')'; } }
      return swap(t);
    }
    const fdT = (s) => (typeof s === 'string' && s[0] === '@' ? fdl[s.slice(1)] || I.FD.pt[s.slice(1)] || s.slice(1) : s);
    const fdV = (s) => (typeof s === 'string' && s[0] === '#' ? fdl[s.slice(1)] || I.FD.pt[s.slice(1)] || s.slice(1) : s);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const add = (file, fam, st) => { doc.addFileToVFS(file + '.ttf', AS.fontes[file]); doc.addFont(file + '.ttf', fam, st); };
    const MT = I.MONT; add('Montserrat-Regular', MT, 'normal'); add('Montserrat-SemiBold', MT, 'bold'); add('Montserrat-Italic', MT, 'italic');
    const F = (st, sz, cor) => { doc.setFont(MT, st || 'normal'); doc.setFontSize(sz); doc.setTextColor(...(cor || [0, 0, 0])); };
    const T = (s, xx, yy, o) => doc.text(I.limpa(s), xx, yy, o);
    const W = (s) => doc.getTextWidth(I.limpa(s));
    const quebra = (s, w) => doc.splitTextToSize(I.limpa(s), w);
    const fmtImg = (src) => (/^data:image\/png/.test(src) ? 'PNG' : 'JPEG');
    const numero = D.numero ? D.numero + (D.rev !== '' && D.rev != null ? ' · ' + x.rev + ' ' + D.rev : '') : '—';
    let PW = 210, PH = 297, X0 = 12, X1 = 198, LW = 186, LIM = 280, y = 0, titulo = '', npag = 0;
    const logo = (O.img && O.img['logo-cab']) || AS.img['logo-cab'];

    // ---------- moldura das páginas ----------
    function moldura(tit) {
      if (logo) { const p = doc.getImageProperties(logo); const w = 30, h = w * p.height / p.width; doc.addImage(logo, fmtImg(logo), X0, 6.5, w, Math.min(h, 13), 'logo', 'FAST'); }
      F('normal', 6.4, CINZA); T((x['doc_' + O.tipo] || '').toUpperCase(), X1, 9.4, { align: 'right' });
      F('bold', 8.6, ESC); T(x.proposta + ' ' + numero, X1, 13.8, { align: 'right' });
      F('normal', 6.8, CINZA); T([E.cliente, I.dataLang(D.data, lang)].filter(Boolean).join(' · '), X1, 17.8, { align: 'right' });
      doc.setFillColor(...LAR); doc.rect(X0, 21.2, LW, 0.6, 'F');
      doc.setFillColor(...ESC); doc.rect(X0, 24.5, LW, 7.4, 'F'); doc.setFillColor(...LAR); doc.rect(X0, 24.5, 2.4, 7.4, 'F');
      F('bold', 10.2, [255, 255, 255]); T(String(tit).toUpperCase(), PW / 2, 29.6, { align: 'center' });
      doc.setDrawColor(...LINHA); doc.setLineWidth(0.25); doc.line(X0, PH - 13.5, X1, PH - 13.5);
      F('normal', 6.3, CINZA); T(M.rodape || 'LS Fire Sistemas de Combate a Incêndio', PW / 2, PH - 9.2, { align: 'center' });
      y = 36;
    }
    function pagina(tit, paisagem) {
      if (npag++) doc.addPage('a4', paisagem ? 'landscape' : 'portrait');
      PW = paisagem ? 297 : 210; PH = paisagem ? 210 : 297; X1 = PW - 12; LW = X1 - X0; LIM = PH - 17; titulo = tit; moldura(tit);
    }
    const precisa = (h) => { if (y + h > LIM) { pagina(titulo); return true; } return false; };
    // faixa de seção (cinza, com marca laranja)
    function faixa(s, xx, w) { doc.setFillColor(...BANDA); doc.rect(xx, y, w, 5.4, 'F'); doc.setFillColor(...LAR); doc.rect(xx, y, 1.2, 5.4, 'F'); F('bold', 7.6, ESC); T(s, xx + 2.8, y + 3.75); y += 6.4; }
    function subtitulo(s) { precisa(12); F('bold', 10.4, ESC); T(s, X0, y + 4.2); doc.setFillColor(...LAR); doc.rect(X0, y + 5.6, 14, 0.6, 'F'); y += 8.6; }
    // pares rótulo : valor numa coluna
    function altPares(L, w) { let h = 0; for (const [k, v] of L) { F('normal', 6.9); const a = quebra(k, w * 0.5 - 2).length; F('bold', 7); const b = quebra(String(v), w * 0.5 - 2).length; h += Math.max(a, b) * 3.05 + 1.25; } return h; }
    function pares(L, xx, w) {
      for (const [k, v] of L) {
        F('normal', 6.9); const a = quebra(k, w * 0.5 - 2); F('bold', 7); const b = quebra(String(v), w * 0.5 - 2); const h = Math.max(a.length, b.length) * 3.05 + 1.25;
        F('normal', 6.9, CINZA); a.forEach((q, i) => T(q, xx + 1.4, y + 2.7 + i * 3.05)); F('bold', 7, [20, 20, 20]); b.forEach((q, i) => T(q, xx + w * 0.5, y + 2.7 + i * 3.05));
        doc.setDrawColor(...LINHA); doc.setLineWidth(0.15); doc.line(xx, y + h, xx + w, y + h); y += h;
      }
    }
    // seções em duas colunas, como nas folhas de dados: cada uma vai para a coluna mais curta; quebra de página quando não cabe
    function colunas(secs) {
      const cw = (LW - 5) / 2; const xs = [X0, X0 + cw + 5]; let ys = [y, y];
      for (const s of secs.filter((q) => q.pares.length)) {
        let L = s.pares.slice(); let c = ys[0] <= ys[1] ? 0 : 1;
        while (L.length) {
          y = ys[c]; const cabe = []; let h = 6.4; for (const p of L) { const hp = altPares([p], cw); if (y + h + hp > LIM) break; h += hp; cabe.push(p); }
          if (!cabe.length || (cabe.length < Math.min(3, L.length) && y > 45)) {
            if (c === 0 && ys[1] + 6.4 + altPares(L.slice(0, 3), cw) <= LIM) { c = 1; continue; }
            pagina(titulo); ys = [y, y]; c = 0; continue;
          }
          faixa(s.t + (L.length < s.pares.length ? ' (cont.)' : ''), xs[c], cw); pares(cabe, xs[c], cw); L = L.slice(cabe.length); ys[c] = y + 2.4;
          if (L.length) c = 1 - c;
        }
      }
      y = Math.max(ys[0], ys[1]);
    }
    // tabela simples com cabeçalho escuro
    function tabela(cab, linhas, larg, o = {}) {
      const xs = [X0]; for (const w of larg) xs.push(xs[xs.length - 1] + w);
      const hdr = () => { F('bold', 6.6); const hl = cab.map((t, i) => quebra(t, larg[i] - 2)); const hh = Math.max(...hl.map((q) => q.length)) * 2.8 + 2.4; precisa(hh + 5); doc.setFillColor(...ESC); doc.rect(X0, y, xs[xs.length - 1] - X0, hh, 'F'); F('bold', 6.6, [255, 255, 255]); hl.forEach((q, i) => q.forEach((t, k) => T(t, i === 0 || o.esq?.includes(i) ? xs[i] + 1.2 : xs[i + 1] - 1.2, y + 3 + k * 2.8, { align: i === 0 || o.esq?.includes(i) ? 'left' : 'right' }))); y += hh; };
      hdr();
      linhas.forEach((ln, j) => {
        F('normal', 6.9); const cel = ln.map((t, i) => quebra(String(t ?? ''), larg[i] - 2)); const h = Math.max(...cel.map((q) => q.length)) * 3 + 1.6;
        if (y + h > LIM) { pagina(titulo); hdr(); }
        if (j % 2) { doc.setFillColor(...CLARO); doc.rect(X0, y, xs[xs.length - 1] - X0, h, 'F'); }
        cel.forEach((q, i) => { F(o.negrito?.includes(i) ? 'bold' : 'normal', 6.9, [25, 25, 25]); q.forEach((t, k) => T(t, i === 0 || o.esq?.includes(i) ? xs[i] + 1.2 : xs[i + 1] - 1.2, y + 2.8 + k * 3, { align: i === 0 || o.esq?.includes(i) ? 'left' : 'right' })); });
        doc.setDrawColor(...LINHA); doc.setLineWidth(0.15); doc.line(X0, y + h, xs[xs.length - 1], y + h); y += h;
      });
      y += 3;
    }
    // escopo no formato Qtd | Descrição, com recuo por nível
    function escopo(grupo, linhas) {
      precisa(20); F('bold', 9.6, ESC); T(grupo, X0, y + 4); y += 6;
      const hdr = () => { doc.setFillColor(...ESC); doc.rect(X0, y, LW, 4.8, 'F'); F('bold', 6.8, [255, 255, 255]); T(x.qtd, X0 + 1.5, y + 3.3); T(x.descr, X0 + 14, y + 3.3); y += 4.8; };
      hdr();
      for (const l of linhas) {
        const xx = X0 + 14 + Math.min(8, l.n || 0) * 3; const st = (l.n || 0) <= 1 && !/:/.test(l.t) ? 'bold' : 'normal'; F(st, 7); const q = quebra(l.t, X1 - xx - 1); const h = q.length * 3.05 + 1.1;
        if (y + h > LIM) { pagina(titulo); hdr(); }
        if (l.q) { F('bold', 7.2, ESC); T(String(l.q), X0 + 3, y + 2.8, { align: 'center' }); }
        F(st, 7, [25, 25, 25]); q.forEach((t, k) => T(t, xx, y + 2.8 + k * 3.05)); y += h;
        if ((l.n || 0) === 0) { doc.setDrawColor(...LINHA); doc.setLineWidth(0.15); doc.line(X0, y, X1, y); }
      }
      y += 4;
    }
    function imagem(src, hmax, legenda) {
      if (!src) return; const p = doc.getImageProperties(src); let w = LW, h = w * p.height / p.width; if (h > hmax) { h = hmax; w = h * p.width / p.height; }
      const xx = X0 + (LW - w) / 2; doc.addImage(src, fmtImg(src), xx, y, w, h, undefined, 'FAST'); doc.setDrawColor(...LINHA); doc.setLineWidth(0.2); doc.rect(xx, y, w, h); y += h + 2;
      if (legenda) { F('italic', 6.4, CINZA); T(legenda, X0, y + 2); y += 4; }
    }
    function paragrafo(s, o = {}) { F(o.st || 'normal', o.sz || 7.6, o.cor || [25, 25, 25]); for (const q of quebra(s, o.w || LW)) { precisa(3.8); F(o.st || 'normal', o.sz || 7.6, o.cor || [25, 25, 25]); T(q, o.x || X0, y + 3); y += o.lh || 3.6; } y += o.depois ?? 1.2; }
    function marcadores(L) { for (const l of L) { F('normal', 7.4); const q = quebra(l, LW - 5); precisa(q.length * 3.5 + 0.6); doc.setFillColor(...LAR); doc.rect(X0 + 1, y + 1.6, 1.2, 1.2, 'F'); F('normal', 7.4, [25, 25, 25]); q.forEach((t, k) => T(t, X0 + 4, y + 3 + k * 3.5)); y += q.length * 3.5 + 0.8; } y += 2; }

    // ---------- páginas ----------
    const fabDe = (it) => (O.fab || {})[it.key] || null;
    const tituloPag = (t) => { for (const [re, k] of TIT_PAG) if (re.test(t || '')) return x[k]; return trF(t, 'val') || t; };
    function resumo() {
      pagina(x.resumo);
      const esq = [[I.R[lang].cliente.replace(':', ''), E.cliente], [r.razao.replace(':', ''), E.razao], [r.cnpj.replace(':', ''), E.cnpj], [r.aosCuid.replace(':', ''), E.aosCuidados], [r.projObra.replace(':', ''), tr(E.obra)], [r.cidade.replace(':', ''), E.cidade]].filter((p) => p[1]);
      const dir = [[x.proposta, D.numero || '—'], [x.rev, String(D.rev ?? '')], [x.data, I.dataLang(D.data, lang)], [x.validade, I.dataLang(D.validade, lang)], [x.norma, (D.flags || {}).normaTxt || ''], [x.vendedor, D.vendedor || '']].filter((p) => p[1]);
      colunas([{ t: r.cliente.replace(':', ''), pares: esq }, { t: x.dadosProp, pares: dir }]); y += 2;
      subtitulo(x.fornec);
      const cab = comPreco ? [x.item, x.qtd, x.equip, x.ponto, x.tot] : [x.item, x.qtd, x.equip, x.ponto];
      const larg = comPreco ? [12, 12, 92, 40, 30] : [12, 12, 112, 50];
      tabela(cab, D.itens.map((it, i) => [String(i + 1), qtdTxt(it.qtd), [E.codigos[it.key] || it.codigo, D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve)].filter(Boolean).join(' — '), numL(it.condicao || ''), comPreco ? din(it.total) : null].filter((v) => v !== null)), larg, { esq: [2, 3], negrito: [0] });
      if (comPreco) { precisa(12); doc.setFillColor(...LAR); doc.rect(X0, y, LW, 8, 'F'); F('bold', 9.4, [255, 255, 255]); T(x.valorTotal.toUpperCase(), X0 + 3, y + 5.4); T(din(D.total), X1 - 3, y + 5.4, { align: 'right' }); y += 11;
        if (usd) { const nt = r.moeda.replace('{taxa}', nf(4).format(Number(O.moeda.taxa))).replace('{data}', O.moeda.data ? r.moedaData.replace('{d}', I.dataLang(O.moeda.data, lang)) : ''); paragrafo(nt, { sz: 6.6, cor: CINZA }); } }
      if (tem('condicoes')) { y += 2; colunas([{ t: x.cond, pares: [[x.pagamento, tr(E.pagamento) || '—'], [x.frete, tr(E.frete) || '—'], [x.prazo, prazoTxt().join(' · ') || r.combinar], [x.validade, I.dataLang(D.validade, lang) || '—']] }]); }
      if (tem('conheca') && (M.somos || []).length) { y += 3; precisa(30); faixa(x.sobre, X0, LW); paragrafo((M.somos || [])[0], { sz: 7.4, lh: 3.5 }); }
      const selos = (O.img && O.img.selos) || AS.img.selos; if (selos && y < LIM - 26) { const p = doc.getImageProperties(selos); const w = 56, h = w * p.height / p.width; doc.addImage(selos, fmtImg(selos), X1 - w, LIM - h - 1, w, h, 'selos', 'FAST'); }
    }
    function prazoTxt() { const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0; const L = []; if (fab) L.push(r.fab.replace('{n}', fab)); if (ent) L.push(r.ent.replace('{n}', ent)); if (fab || ent) L.push(r.tot.replace('{n}', fab + ent)); for (const l of I.linhasDe(E.prazoTexto)) L.push(tr(l)); return L; }
    function itens() {
      D.itens.forEach((it, i) => {
        const fd = it.folha || {}; const dfd = it.fd || {}; const FA = fabDe(it); const dados = FA && FA.dados; const nItem = r.item.replace('{n}', i + 1);
        const cod = E.codigos[it.key] || it.codigo || '';
        const camposOn = (s) => (s.campos || []).filter((c) => c.on !== false && String(c.v || '').trim()).map((c) => [trF(c.k, 'rot'), fb && fb.ehMedida(c.v) ? medida(c.v) : swap(trF(c.v, 'val'))]);
        const secsDe = (pag) => (dados ? dados.secoes.filter((s) => s.pag === pag && s.t !== 'Project') : []).map((s) => ({ t: trF(s.t, 'sec'), pares: camposOn(s) }));
        const pags = dados ? dados.paginas.filter((p) => p.tipo === 'dados') : [];
        const ident = [[x.item, String(i + 1)], [x.codigo, cod], [x.equip, D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve)], [x.quantidade, qtdTxt(it.qtd) + (it.un ? ' ' + it.un : '')], [x.ponto, numL(it.condicao || '')]].filter((p) => p[1]);
        if (dados) { const pj = (dados.secoes.find((s) => s.t === 'Project') || { campos: [] }).campos; const v = (re) => (pj.find((c) => re.test(c.k)) || {}).v; const tg = v(/^Tag/); const md = v(/Model$|^Model \//); if (md) ident.push([x.modelo, md]); if (tg) ident.push([x.tag, tg]); if (dados.fabricante) ident.push([x.fabr, dados.fabricante]); }
        // 1) desempenho: identificação + seções da primeira folha + curva
        pagina(x.desemp + ' — ' + nItem);
        const sec1 = [{ t: x.ident, pares: ident }];
        if (pags.length) sec1.push(...secsDe(pags[0].n));
        else {
          for (const b of fd.hidraulica || []) sec1.push({ t: x.hidr + ' — ' + r.bomba.replace('{n}', b.n) + ' (' + fdV(b.acion) + (b.cfg ? ' · ' + fdV(b.cfg) : '') + ')', pares: b.dados.filter((d) => d[1]).map((d) => [fdT('@' + d[0]), numL(d[1])]) });
          if ((dfd.bomba || []).length) sec1.push({ t: x.fdB, pares: dfd.bomba.map((d) => [fdT('@' + d[0]), fdV(d[1])]) });
          if ((dfd.motor || []).length) sec1.push({ t: x.fdM, pares: dfd.motor.map((d) => [fdT('@' + d[0]), fdV(d[1])]) });
        }
        colunas(sec1);
        F('italic', 6.2, CINZA); T(dados ? x.fonte.replace('{f}', dados.fabricante || '—') : x.semFab, X0, y + 1.5); y += 4;
        const curva = (FA && FA.curva) || O.curvas[it.key];
        if (curva) { if (LIM - y < 95) pagina(x.curva + ' — ' + nItem); else subtitulo(x.curva); imagem(curva, Math.min(LIM - y - 4, 170)); }
        // 2) demais folhas de dados do fabricante (construtiva, dados adicionais), com as tabelas dessas páginas
        for (const pg of pags.slice(1)) {
          const ss = secsDe(pg.n); const tb = (dados.tabelas || []).filter((t) => t.pag === pg.n); if (!ss.some((s) => s.pares.length) && !tb.length) continue;
          pagina(tituloPag(pg.titulo) + ' — ' + nItem); colunas(ss);
          for (const t of tb) { y += 2; const nc = Math.max(t.cab.length, ...t.linhas.map((l) => l.length)); const cab = t.cab.length === nc ? t.cab.map((c, k) => (k ? c : trF(c, 'sec') || c)) : [''].concat(t.cab).slice(0, nc); const w0 = 62; const ws = [w0].concat(Array(nc - 1).fill((LW - w0) / (nc - 1)));
            tabela(cab.map((c) => trF(c, 'rot') || c), t.linhas.map((l) => [trF(l[0], 'rot') || l[0]].concat(l.slice(1).map(swap))), ws, { esq: [0] }); }
        }
        if (dados && (dados.tabelas || []).some((t) => t.pag === pags[0]?.n)) { /* tabela da primeira folha: já resumida nas seções */ }
        // 3) outras curvas e desenhos escolhidos
        for (const pg of dados ? dados.paginas.filter((p) => (p.tipo === 'curva' || p.tipo === 'desenho' || p.tipo === 'anexo') && FA.paginas && FA.paginas[p.n]) : []) {
          const im = FA.paginas[pg.n]; const paisagem = im.w > im.h; pagina(tituloPag(pg.titulo) + ' — ' + nItem, paisagem); imagem(im.url, LIM - y - 2);
        }
        // 4) escopo: o do fabricante (grupos marcados) + itens da formação LS Fire + especificações
        pagina(x.escopo + ' — ' + nItem);
        F('bold', 8, ESC); for (const q of quebra([cod, D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve)].filter(Boolean).join(' — '), LW)) { T(q, X0, y + 3); y += 3.8; } F('normal', 7.2, CINZA); T([x.quantidade + ': ' + qtdTxt(it.qtd) + (it.un ? ' ' + it.un : ''), it.condicao ? x.ponto + ': ' + numL(it.condicao) : ''].filter(Boolean).join('   ·   '), X0, y + 3); y += 7;
        const gs = dados ? (dados.escopo || []).filter((g) => g.on !== false) : [];
        for (const g of gs) escopo(trF(g.g, 'sec') || g.g, g.linhas.filter((l) => l.on !== false).map((l) => ({ q: l.q, n: l.n, t: trF(l.t, 'lin') })));
        const ls = []; for (const c of (fd.componentes || []).concat(fd.adicionais || [])) { ls.push({ q: qtdTxt(c.qtd), n: 0, t: fdT(c.titulo) }); for (const l of c.linhas || []) ls.push({ n: 2, t: Array.isArray(l) ? fdT('@' + l[0]) + ': ' + fdV(l[1]) : l }); }
        if (ls.length && !(FA && FA.semLs)) escopo(x.lsfire, ls);
        if ((it.espec || []).length) { const le = []; for (const g of it.espec) { le.push({ q: qtdTxt(g.qtd), n: 0, t: fdT(g.titulo) }); for (const l of g.linhas || []) le.push({ n: 2, t: fdT('@' + l[0]) + ': ' + tr(l[1]) }); } escopo(x.especs, le); }
        const nt = I.linhasDe(E.notasItem[it.key]); if (nt.length) { subtitulo(r.notasItem); marcadores(nt.map(tr)); }
      });
    }
    function planilha() {
      pagina(x.planilha);
      const cab = [x.item, x.codigo, x.descr, x.qtd, x.un, x.ncm, x.icms, x.ipi, x.unit, x.tot]; const larg = [9, 20, 61, 10, 10, 15, 11, 10, 20, 20];
      tabela(cab, D.itens.map((it, i) => [String(i + 1), E.codigos[it.key] || it.codigo || '', D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve), qtdTxt(it.qtd), it.un || '', it.ncm || '', pct(it.icms), it.ipi == null ? '—' : pct(it.ipi), din(it.unit), din(it.total)]), larg, { esq: [1, 2], negrito: [9] });
      precisa(12); doc.setFillColor(...LAR); doc.rect(X0, y, LW, 8, 'F'); F('bold', 9.4, [255, 255, 255]); T(x.valorTotal.toUpperCase(), X0 + 3, y + 5.4); T(din(D.total), X1 - 3, y + 5.4, { align: 'right' }); y += 11;
      if (usd) { const nt = r.moeda.replace('{taxa}', nf(4).format(Number(O.moeda.taxa))).replace('{data}', O.moeda.data ? r.moedaData.replace('{d}', I.dataLang(O.moeda.data, lang)) : ''); paragrafo(nt, { sz: 6.6, cor: CINZA }); }
    }
    function condicoes() {
      pagina(x.cond);
      faixa(r.h_pag, X0, LW); paragrafo(tr(E.pagamento) || '—', { st: 'bold' }); if (M.notaPagamento) paragrafo(r.nota + ' ' + M.notaPagamento, { sz: 7, cor: CINZA }); y += 2;
      faixa(r.h_prazo, X0, LW); for (const l of prazoTxt().concat(prazoTxt().length ? [] : [r.combinar])) paragrafo(l, { depois: 0.4 }); y += 2;
      faixa(r.h_frete, X0, LW); paragrafo(tr(E.frete) || '—'); y += 2;
      const ob = I.linhasDe(E.observacoes).map((l) => (E.ajustados.observacoes ? tr(l) : l)); if (ob.length) { faixa(r.h_obs, X0, LW); marcadores(ob); }
      if ((M.atencao || []).length) { precisa(12); doc.setFillColor(...ESC); doc.rect(X0, y, LW, 9.5, 'F'); doc.setFillColor(...LAR); doc.rect(X0, y, 2.4, 9.5, 'F'); F('bold', 7, [255, 255, 255]); T(r.atencao + (M.atencao[0] || ''), X0 + 5, y + 4); F('normal', 7, [255, 255, 255]); T(M.atencao[1] || '', X0 + 5, y + 7.6); y += 12; }
    }
    function notas() {
      pagina(x.notas);
      for (const [rot, txt, k] of [[r.notas, E.notas, 'notas'], [r.desvios, E.desvios, 'desvios'], [r.exclusoes, E.exclusoes, 'exclusoes']]) {
        const L = I.linhasDe(txt).map((l) => (E.ajustados[k] || (k === 'exclusoes' && I.linhasDe(D.exclusoes).includes(l)) ? tr(l) : l).replace(/^[•\-–]\s*/, '')); if (!L.length) continue;
        precisa(14); faixa(rot, X0, LW); marcadores(L);
      }
    }
    function listas(tit, blocos) { pagina(tit); for (const [t, L] of blocos) { if (!(L || []).length) continue; precisa(14); faixa(t, X0, LW); marcadores(P.aplica(L, D.flags || {}, lang)); } }
    function termos() {
      if (!(M.termos || []).length) return; pagina(x.termos);
      const cw = (LW - 6) / 2, xs = [X0, X0 + cw + 6]; let col = 0; const y0 = y;
      for (const c of M.termos) {
        const bl = [['t', c.t]].concat((c.p || []).flatMap((p) => { F('normal', 6.6); return quebra(p, cw).map((q) => ['p', q]).concat([['g']]); }));
        for (const b of bl) { const h = b[0] === 't' ? 4.6 : b[0] === 'g' ? 1.2 : 2.95; if (y + h > LIM) { if (col === 0) { col = 1; y = y0; } else { pagina(x.termos); col = 0; } }
          if (b[0] === 't') { F('bold', 7, ESC); T(b[1], xs[col], y + 3.4); } else if (b[0] === 'p') { F('normal', 6.6, [40, 40, 40]); T(b[1], xs[col], y + 2.4); } y += h; }
      }
    }
    function contatos() {
      pagina(x.contatos); const cts = (M.contatos || []).filter((c) => (E.contatos || []).includes(c.nome));
      cts.forEach((c, k) => { const cx = k % 2 ? X0 + LW / 2 + 3 : X0; if (k % 2 === 0 && k) y += 22; const yy = y; doc.setFillColor(...CLARO); doc.rect(cx, yy, LW / 2 - 3, 19, 'F'); doc.setFillColor(...LAR); doc.rect(cx, yy, 1.2, 19, 'F');
        F('bold', 8.6, ESC); T(c.nome, cx + 4, yy + 5); F('normal', 7.2, CINZA); [c.cargo, c.tel, c.email].filter(Boolean).forEach((t, j) => T(t, cx + 4, yy + 9.4 + j * 3.6)); });
      y += 26; const sl = (O.img && O.img.slogan) || AS.img.slogan; if (sl) { const p = doc.getImageProperties(sl); const w = 80; doc.addImage(sl, fmtImg(sl), X1 - w, Math.max(y, LIM - w * p.height / p.width - 4), w, w * p.height / p.width, 'slogan', 'FAST'); }
    }
    // ordem: resumo (capa), itens (folhas, curvas, desenhos, escopo), planilha, condições, notas, comissionamento, prazos, termos, contatos
    resumo();
    if (tem('folha') || D.tipo !== 'SEQ') itens();
    if (comPreco && tem('planilha')) planilha();
    if (tem('condicoes')) condicoes();
    if (tem('notas')) notas();
    if (tem('comiss')) { const C = M.comissionamento || {}; listas(x.comiss, [[r.incluso, C.incluso], [r.servAd, C.adicionais], [r.resp, C.responsabilidades]]); }
    if (tem('prazos')) { const PZ = M.prazos || {}; pagina(x.prazos); if (PZ.intro) paragrafo(PZ.intro); for (const [t, L] of [[r.inicio, PZ.inicio], [r.susp, PZ.suspensao]]) if ((L || []).length) { faixa(t, X0, LW); marcadores(L); } if (PZ.recebimento) paragrafo(PZ.recebimento, { sz: 7, cor: CINZA }); }
    if (tem('termos')) termos();
    if (tem('contatos')) contatos();
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight(); F('normal', 6.4, CINZA); T(i + '/' + n, w - 12, h - 9.2, { align: 'right' }); T(x.proposta + ' ' + (D.numero || ''), 12, h - 9.2); }
    const cli = (E.cliente || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 50);
    const pre = { tc: 'PTC', com: 'PC', tec: 'PT' }[O.tipo] || 'PTC';
    const nome = (pre + '-FD_' + String(D.numero || 'sem-numero').replace(/\s*\/\s*/g, '_').replace(/\s+/g, '') + (D.rev !== '' && D.rev != null ? '-Rev.' + D.rev : '') + (lang !== 'pt' ? '_' + lang.toUpperCase() : '') + (usd ? '_USD' : '') + (cli ? '_' + cli : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_') + '.pdf';
    return { bytes: doc.output('arraybuffer'), nome, paginas: n, secoes: SEC };
  }
  // textos do fabricante que o dicionário não traduz (vão para o Claude quando disponível)
  function textosFab(dados, lang) {
    const fb = FB(); if (!fb || !dados || lang === 'en') return []; const out = new Set(); const add = (s, ok) => { s = String(s || '').trim(); if (s && /[a-z]{3}/.test(s) && !/^\S+$/.test(s) && !ok) out.add(s); };
    for (const s of dados.secoes || []) { if (s.t === 'Project') continue; add(s.t, fb.secT(s.t, lang)); for (const c of s.campos || []) if (c.on !== false) { add(c.k, fb.rotT(c.k, lang)); add(c.v, fb.valT(c.v, lang) || fb.ehMedida(c.v)); } }
    for (const g of dados.escopo || []) { if (g.on === false) continue; add(g.g, fb.secT(g.g, lang)); for (const l of g.linhas || []) if (l.on !== false) add(l.t, fb.linhaT(l.t, lang)); }
    for (const t of dados.tabelas || []) for (const l of t.linhas || []) add(l[0], fb.rotT(l[0], lang));
    for (const p of dados.paginas || []) if (!TIT_PAG.some(([re]) => re.test(p.titulo))) add(p.titulo, false);
    return [...out];
  }
  window.PricerPropostaFD = { montar, textosFab };
})();
