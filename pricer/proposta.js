/* LS Pricer — proposta técnica e comercial no modelo PTC LS Fire, montada a partir da formação.
 * Os números (itens, quantidades, impostos, NCM, preços e total) vêm da proposta aberta; os textos padrão vêm do
 * Modelo da proposta (Cadastros → Cadastro geral → Modelo da proposta) e o que for próprio desta proposta
 * (aos cuidados de, prazos, observações, notas, contatos…) fica em propCom, salvo junto com a proposta.
 */
(function () {
  'use strict';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  let carregando = null;
  function lib() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!carregando) carregando = new Promise((res, rej) => { const s = document.createElement('script'); s.src = JSPDF; s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { carregando = null; rej(new Error('Não consegui carregar a biblioteca de PDF. Verifique a internet e tente de novo.')); }; document.head.appendChild(s); });
    return carregando;
  }
  // cores e medidas tiradas das PTC (mm, A4)
  const LAR = [199, 56, 21], LAR2 = [228, 101, 14], TIT = [228, 101, 14], ESC = [47, 47, 47], BORDA = [51, 51, 51], CINZA = [153, 153, 153], LINHA = [204, 204, 204], FUNDO = [242, 242, 242], ATN = [42, 43, 42], ATN2 = [212, 93, 42], SUAVE = [253, 236, 226], TXT2 = [85, 85, 85];
  const X0 = 12.4, X1 = 197.5, LW = X1 - X0, TOPO = 44, LIM = 271;
  const MONO = 'RobotoMono', MONT = 'Montserrat';
  const NF2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl = (v) => 'R$ ' + NF2.format(typeof v === 'number' && isFinite(v) ? v : 0);
  const pct = (v) => (typeof v === 'number' && isFinite(v) ? NF2.format(v * 100) + '%' : '—');
  const qtdTxt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : NF2.format(v)) : String(v || ''));
  const dataBR = (s) => { if (!s) return ''; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[3] + '/' + m[2] + '/' + m[1]; return String(s).replace(/^até\s+/i, '').trim(); };
  // o PDF usa fontes reduzidas ao alfabeto latino: troca o que ficaria em branco
  const limpa = (s) => String(s ?? '').replace(/\r/g, '').replace(/[‐‑‒]/g, '-').replace(/[″]/g, '"').replace(/[′]/g, "'").replace(/\t/g, ' ').replace(/[^\x00-\xFFŒœη–—‘-„•…€™→−≤≥\n]/g, '');
  const linhasDe = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);

  // ---------- textos do modelo ----------
  function modelo(REG) {
    const base = window.PRICER_PROPOSTA_TEXTOS || {};
    const m = (((REG && REG.tabelas) || {}).PROPOSTA_MODELO || {}).m || {};
    return Object.assign({}, base, m);
  }
  // linhas com condição entre colchetes: só entram quando a proposta atende
  function aplica(lista, f) {
    const out = [];
    for (const raw of lista || []) {
      let x = String(raw || '').trim(); if (!x) continue;
      const m = x.match(/^\[([^\]]+)\]\s*/); let ok = true;
      if (m) {
        x = x.slice(m[0].length);
        for (const t0 of m[1].split(',')) {
          const t = t0.trim().toLowerCase();
          const v = { diesel: f.diesel, eletrica: f.eletrica, 'start-up': f.startup, 'sem start-up': !f.startup, contrato: f.contrato, 'sem contrato': !f.contrato, campo: f.campo, fabrica: f.fabrica, pecas: f.pecas }[t];
          if (v === false) ok = false;
        }
      }
      if (!ok) continue;
      x = x.replace(/\{norma\}/g, f.normaTxt || 'NFPA 20').replace(/\{certificacao\}/g, f.ulfm ? 'com certificação UL e FM' : 'sem certificação UL e FM')
        .replace(/\{meses\}/g, f.meses || '—').replace(/\{visitas\}/g, f.visitas || '—')
        .replace(/\{diarias\}/g, f.diarias > 1 ? f.diarias + ' diárias inclusas' : '1 diária inclusa');
      out.push(x);
    }
    return out;
  }
  const normaTxt = (n) => { const s = String(n || '').toUpperCase(); if (/NBR\s*16704/.test(s)) return 'ABNT NBR 16704'; if (/NBR\s*13714/.test(s)) return 'ABNT NBR 13714'; return 'NFPA 20'; };

  // ---------- valores efetivos: o que a pessoa escreveu nesta proposta, senão o que vem da formação ----------
  function efetivo(D, pc, M) {
    pc = pc || {};
    const v = (k, d) => (Object.prototype.hasOwnProperty.call(pc, k) ? pc[k] : d);
    const f = D.flags || {};
    const servico = D.tipo === 'SPV' && !f.soPecas; const pecas = D.tipo === 'SPV' && f.pecas;
    const notasPad = D.tipo === 'SEQ' ? aplica(M.notasSeq, f) : D.tipo === 'FACTS' ? (M.notasSeq || []).filter((x) => /garantia padrão|Qualquer item não descrito|prazo de entrega passa/.test(x)) : [].concat(servico ? aplica(M.notasServico, f) : [], pecas ? (M.pecas || {}).notas || [] : []);
    const desviosPad = pecas && !servico ? ((M.pecas || {}).desvios || []) : [];
    const exclPad = [].concat(linhasDe(D.exclusoes), pecas && !servico ? ((M.pecas || {}).exclusoes || []) : []);
    const obsPad = servico ? (M.observacoesServico || []) : [];
    const contatosPad = (M.contatos || []).filter((c) => c.sempre || (D.vendedor && norm(c.nome) === norm(D.vendedor))).map((c) => c.nome);
    const sec = Object.assign({ solucoes: D.tipo === 'SEQ', folha: D.tipo === 'SEQ', comiss: D.tipo === 'SEQ' && !!f.startup, prazos: D.tipo === 'SEQ', docs: D.tipo === 'SEQ', termos: true }, pc.secoes || {});
    return {
      cliente: v('cliente', D.cliente || ''), razao: v('razao', D.razao || D.cliente || ''), cnpj: v('cnpj', D.cnpj || ''), aosCuidados: v('aosCuidados', D.contato || ''),
      obra: v('obra', D.obra || ''), cidade: v('cidade', D.cidade || ''), pagamento: v('pagamento', D.pagamento || ''), frete: v('frete', D.frete || ''),
      prazoFab: v('prazoFab', ''), prazoEnt: v('prazoEnt', ''), prazoTexto: v('prazoTexto', D.prazo || ''),
      observacoes: v('observacoes', obsPad.join('\n')), notas: v('notas', notasPad.join('\n')), desvios: v('desvios', desviosPad.join('\n')), exclusoes: v('exclusoes', exclPad.join('\n')),
      codigos: Object.assign({}, pc.codigos || {}), notasItem: Object.assign({}, pc.notasItem || {}), secoes: sec, contatos: v('contatos', contatosPad),
    };
  }
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  // ---------- PDF ----------
  async function montar(D, pc, M) {
    const jsPDF = await lib();
    const AS = window.PRICER_PROPOSTA_ASSETS; if (!AS) throw new Error('Imagens e fontes da proposta não encontradas no app.');
    const E = efetivo(D, pc, M); const f = D.flags || {};
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const add = (file, fam, st) => { doc.addFileToVFS(file + '.ttf', AS.fontes[file]); doc.addFont(file + '.ttf', fam, st); };
    add('RobotoMono-Regular', MONO, 'normal'); add('RobotoMono-Bold', MONO, 'bold'); add('Montserrat-Regular', MONT, 'normal'); add('Montserrat-Italic', MONT, 'italic'); add('Montserrat-SemiBold', MONT, 'bold'); add('Montserrat-BoldItalic', MONT, 'bolditalic');
    const prop = {}; const img = (k) => { if (!prop[k]) prop[k] = doc.getImageProperties(AS.img[k]); return prop[k]; };
    const put = (k, x, y, w, h) => { const p = img(k); if (!h) h = w * p.height / p.width; if (!w) w = h * p.width / p.height; doc.addImage(AS.img[k], k.endsWith('png') || /selos|slogan/.test(k) ? 'PNG' : 'JPEG', x, y, w, h, k, 'FAST'); return h; };
    const F = (fam, st, sz, cor) => { doc.setFont(fam, st || 'normal'); doc.setFontSize(sz); doc.setTextColor(...(cor || [0, 0, 0])); };
    const T = (s, x, y, o) => doc.text(limpa(s), x, y, o);
    const W = (s) => doc.getTextWidth(limpa(s));
    const quebra = (s, w) => doc.splitTextToSize(limpa(s), w);
    const numero = D.numero ? D.numero + (D.rev !== '' && D.rev != null ? '-Rev.' + D.rev : '') : 'sem número';
    const validade = dataBR(D.validade);
    let y = TOPO, titulo = null, paginas = 0;

    // texto com rótulo normal e valor em negrito, na mesma linha
    function rotVal(rot, val, x, yy, sz, dir) {
      F(MONO, 'normal', sz); const a = W(rot + ' '); F(MONO, 'bold', sz); const b = W(val);
      const x0 = dir ? x - a - b : x;
      F(MONO, 'normal', sz); T(rot + ' ', x0, yy); F(MONO, 'bold', sz); T(val, x0 + a, yy);
    }
    function cabecalho(tit) {
      put('logo-cab', 2.1, 2.5, 28);
      // título à direita; "LS FIRE" em laranja
      const partes = String(tit).split(/(LS FIRE)/).filter(Boolean); F(MONO, 'normal', 12);
      let x = 198.1 - partes.reduce((t, p) => t + W(p), 0);
      for (const p of partes) { doc.setTextColor(...(p === 'LS FIRE' ? TIT : [0, 0, 0])); T(p, x, 9.2); x += W(p); }
      rotVal('Cliente:', E.cliente || '—', 13.1, 25.2, 9.1); rotVal('Data:', dataBR(D.data) || '—', 196.7, 25.2, 9.1, true);
      rotVal('Proposta Nº:', numero, 13.1, 32, 9.1); rotVal('Validade:', validade || '—', 196.7, 32, 9.1, true);
      doc.setFillColor(...LAR); doc.rect(X0, 34.4, LW, 0.25, 'F');
      doc.rect(X0, 277, LW, 0.25, 'F'); F(MONO, 'normal', 9.1, CINZA); T(M.rodape || '', 105, 290.6, { align: 'center' });
    }
    function pagina(tit) { if (paginas++) doc.addPage(); titulo = tit; cabecalho(tit); y = TOPO; }
    function precisa(h) { if (y + h > LIM) { pagina(titulo); return true; } return false; }
    function titulo2(s, sub) { precisa(14); F(MONT, 'normal', 13.4, TIT); T(s, X0, y + 4.6); if (sub) { const w = W(s + ' '); F(MONT, 'normal', 10.6, TIT); T(sub, X0 + w, y + 4.6); } y += 8.2; }
    // linha justificada palavra a palavra (a última linha do parágrafo fica alinhada à esquerda)
    function linhaJust(s, x, yy, w, just) {
      s = limpa(s); if (!just) { T(s, x, yy); return; }
      const ws = s.split(' ').filter(Boolean); if (ws.length < 2) { T(s, x, yy); return; }
      const tot = ws.reduce((t, p) => t + W(p), 0); const gap = (w - tot) / (ws.length - 1); if (gap > 4 * W(' ') + 2) { T(s, x, yy); return; }
      let xx = x; for (const p of ws) { T(p, xx, yy); xx += W(p) + gap; }
    }
    // parágrafo que quebra de página quando precisa
    function paragrafo(s, o = {}) {
      const sz = o.sz || 9.1, lh = o.lh || sz * 0.52, x = o.x ?? X0, w = o.w ?? LW;
      F(o.fam || MONO, o.st || 'normal', sz, o.cor); const L = quebra(s, w);
      L.forEach((l, i) => { if (precisa(lh)) F(o.fam || MONO, o.st || 'normal', sz, o.cor); linhaJust(l, x, y + lh * 0.78, w, o.just && i < L.length - 1); y += lh; });
      y += o.depois ?? 1.6;
    }
    function marcadores(lista, o = {}) {
      const sz = o.sz || 8.2, lh = o.lh || sz * 0.5, x = (o.x ?? X0) + 4, w = (o.w ?? LW) - 4;
      for (const it of lista) { F(MONO, 'normal', sz, o.cor); const L = quebra(it, w); if (precisa(lh * Math.min(L.length, 2))) F(MONO, 'normal', sz, o.cor); T('•', x - 3.6, y + lh * 0.78); L.forEach((l) => { if (precisa(lh)) F(MONO, 'normal', sz, o.cor); linhaJust(l, x, y + lh * 0.78, w, false); y += lh; }); y += o.gap ?? 0.6; }
    }
    function atencao() {
      precisa(16); y += 2; doc.setFillColor(...ATN); doc.rect(X0, y, LW, 10.9, 'F'); doc.setFillColor(...ATN2); doc.rect(11.6, y, 1.5, 10.9, 'F');
      const a = (M.atencao || [])[0] || '', b = (M.atencao || [])[1] || '';
      F(MONO, 'bold', 8.2, [255, 255, 255]); const wA = W('ATENÇÃO: '); F(MONO, 'normal', 8.2, [255, 255, 255]); const wa = W(a);
      let x = 105 - (wA + wa) / 2; F(MONO, 'bold', 8.2, [255, 255, 255]); T('ATENÇÃO: ', x, y + 3.9); F(MONO, 'normal', 8.2, [255, 255, 255]); T(a, x + wA, y + 3.9);
      T(b, 105, y + 8.8, { align: 'center' }); y += 14;
    }
    function separador(yy) { doc.setFillColor(...LAR); doc.rect(X0, yy, LW, 0.25, 'F'); }
    // caixa com borda que acompanha a quebra de página
    function caixa(desenhar, o = {}) {
      let y0 = y; const pad = o.pad ?? 1.2; y += pad;
      const fecha = () => { doc.setDrawColor(...(o.borda || BORDA)); doc.setLineWidth(0.25); doc.rect(X0, y0, LW, y - y0 + pad); };
      const orig = precisa;
      precisa = (h) => { if (y + h > LIM) { fecha(); pagina(titulo); y0 = y; y += pad; return true; } return false; };
      try { desenhar(); } finally { precisa = orig; }
      fecha(); y += pad;
    }
    function faixa(s, o = {}) { precisa(o.h || 12); doc.setFillColor(...(o.cor || LAR2)); doc.rect(X0, y, LW, 5.6, 'F'); F(o.fam || MONO, o.st || 'normal', o.sz || 8.2, [255, 255, 255]); T(s, X0 + 1.6, y + 3.9); y += 5.6; }
    function kv(pares) { for (const [r, v] of pares) if (v) { precisa(5); rotVal(r, v, X0, y + 3.3, 9.1); y += 4.9; } y += 2; }

    // ===== capa =====
    paginas = 1;
    put(D.tipo === 'SPV' ? 'capa-spv' : 'capa-seq', 0, 0, 209.9, 224.9);
    F(MONT, 'normal', 12); T('PROPOSTA', X0, 246); F(MONT, 'italic', 21.1); T('TÉCNICA E COMERCIAL', X0, 257);
    put('selos', 126.9, 238.0, 70.6, 21.2);
    doc.setFillColor(...LAR); doc.rect(X0, 264.5, LW, 0.3, 'F');
    F(MONO, 'normal', 8.2); T('Cliente:', X0, 274.6); F(MONO, 'bold', 8.2); T(quebra(E.cliente || '—', 100)[0], X0, 280.4);
    F(MONO, 'normal', 8.2); T('Obra/Projeto:', X0, 286); F(MONO, 'bold', 8.2); T(quebra(E.obra || '—', 100)[0], X0, 291.3);
    rotVal('Aos cuidados de:', E.aosCuidados || '—', X1, 275, 8.2, true); rotVal('Validade:', validade || '—', X1, 280.6, 8.2, true);
    rotVal('Número:', D.numero || '—', X1, 286, 8.2, true); rotVal('Revisão:', String(D.rev ?? ''), X1, 291.4, 8.2, true);

    // ===== conheça a LS Fire =====
    pagina('CONHEÇA A LS FIRE');
    F(MONT, 'normal', 13.4); T('SOMOS A ', X0, 45.6); const ws = W('SOMOS A '); F(MONT, 'normal', 13.4, TIT); T('LS FIRE', X0 + ws, 45.6); y = 53;
    for (const p of M.somos || []) paragrafo(p, { sz: 10.6, lh: 5.67, just: true, depois: 5.3 });
    { const k = D.tipo === 'SPV' ? 'conheca-spv' : 'conheca-seq'; const p = img(k); let w = LW, h = w * p.height / p.width; const hmax = LIM - (y + 6); if (h > hmax) { h = hmax; w = h * p.width / p.height; } put(k, X0 + (LW - w) / 2, y + 6, w, h); }

    // ===== soluções =====
    if (E.secoes.solucoes && (M.solucoes || []).length) {
      pagina('SOLUÇÕES LS FIRE'); y = 41;
      (M.solucoes || []).forEach((s, i) => {
        if (i) { separador(y + 2); y += 3.5; }
        const y0 = y; const h = put(s.img, 14.1, y0 + 4.5, 92.5);
        y = y0; F(MONO, 'normal', 12, LAR); T(s.t, 109, y0 + 4.6); y = y0 + 6.6;
        paragrafo(s.x, { sz: 10.6, lh: 5.67, x: 109, w: 87.8, just: true, depois: 0 });
        y = Math.max(y, y0 + 4.5 + h) + 2;
      });
    }

    // ===== planilha de preços (e, em serviço/peças, as condições na sequência) =====
    const juntas = D.tipo !== 'SEQ';
    pagina(juntas ? 'PLANILHA DE PREÇOS E CONDIÇÕES' : 'PLANILHA DE PREÇOS');
    kv(juntas || E.razao !== E.cliente || E.cnpj || E.cidade ? [['Razão Social:', E.razao], ['CNPJ:', E.cnpj], ['Aos cuidados de:', E.aosCuidados], ['Projeto/Obra:', E.obra], ['Cidade da obra:', E.cidade]] : [['Projeto/Obra:', E.obra], ['Aos cuidados de:', E.aosCuidados]]);
    y += 2; titulo2('Planilha de preços'); y += 1;
    const COL = [12.4, 21.2, 39.3, 49.5, 61.0, 74.4, 87.9, 101.3, 122.8, 160.2, 197.4];
    const CAB = [['Item'], ['Código'], ['Qtd.'], ['Unid.'], ['PIS/', 'COFINS'], D.tipo === 'SPV' ? ['ICMS/', 'ISS'] : ['ICMS'], ['IPI'], ['NCM'], ['Valor Unit.', '(C/ Impostos)'], ['Valor Total', '(C/ Impostos)']];
    D.itens.forEach((it, i) => {
      precisa(9.2 + 6.2 + 14);
      doc.setFillColor(...ESC); doc.rect(COL[0], y, COL[10] - COL[0], 9.2, 'F'); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.25);
      for (let c = 1; c < 10; c++) doc.line(COL[c], y, COL[c], y + 9.2);
      CAB.forEach((lb, c) => { const cx = (COL[c] + COL[c + 1]) / 2; F(MONO, 'normal', lb[0] === 'NCM' ? 9.1 : 7.4, [255, 255, 255]); if (lb.length === 1) T(lb[0], cx, y + 5.7, { align: 'center' }); else { T(lb[0], cx, y + 3.7, { align: 'center' }); T(lb[1], cx, y + 7.7, { align: 'center' }); } });
      y += 9.2; doc.setDrawColor(...BORDA);
      for (let c = 0; c < 10; c++) doc.rect(COL[c], y, COL[c + 1] - COL[c], 6.2);
      const cod = E.codigos[it.key] ?? it.codigo ?? '';
      const vals = [String(i + 1), cod, qtdTxt(it.qtd), it.un || '', pct(it.pisCofins), pct(it.icms), it.ipi == null ? '—' : pct(it.ipi), it.ncm || ''];
      vals.forEach((v, c) => { F(MONO, 'normal', 8.2, c >= 4 && c <= 7 ? [51, 51, 51] : [0, 0, 0]); let s = limpa(v); while (s && W(s) > COL[c + 1] - COL[c] - 1) s = s.slice(0, -1); T(s, (COL[c] + COL[c + 1]) / 2, y + 4.2, { align: 'center' }); });
      F(MONO, 'normal', 8.2); T(brl(it.unit), COL[9] - 1, y + 4.2, { align: 'right' }); T(brl(it.total), COL[10] - 1, y + 4.2, { align: 'right' });
      y += 6.2;
      caixa(() => {
        const L = (rot, val) => { if (!val) return; F(MONO, 'bold', 7.4); const a = W(rot + ' '); F(MONO, 'normal', 7.4); const lin = quebra(val, LW - 2 - a); lin.forEach((l, k) => { precisa(4); if (k === 0) { F(MONO, 'bold', 7.4); T(rot, X0 + 0.7, y + 3); } F(MONO, 'normal', 7.4); T(l, X0 + 0.7 + (k === 0 ? a : 0), y + 3); y += 3.95; }); };
        L(D.tipo === 'SEQ' ? 'Descrição breve:' : 'Descrição Breve:', it.breve); L('Descrição completa:', it.completa); L('Condição projeto:', it.condicao); L('Vazão nominal da bomba:', it.vazaoNominal);
        const escI = it.escopoPecas ? ((M.pecas || {}).escopo || []) : (it.escopo || []);
        if (escI.length) { precisa(4); F(MONO, 'bold', 7.4); T('Escopo:', X0 + 0.7, y + 3); y += 4.6; for (const p of escI) { const b = /^[•\-–]\s*/.test(p); paragrafo(b ? '• ' + p.replace(/^[•\-–]\s*/, '') : p, { sz: 7.4, lh: 3.95, x: X0 + (b ? 3 : 0.7), w: LW - (b ? 4.4 : 2), just: !b, depois: b ? 0.4 : 2 }); } }
      }, { pad: 0.6 });
      y += 6;
    });
    precisa(10); doc.setFillColor(...LAR2); doc.rect(74.4, y, 123, 0.25, 'F'); F(MONO, 'normal', 10.6); T('TOTAL:', 146.3, y + 5); F(MONO, 'bold', 9.1); T(brl(D.total), 196.8, y + 5, { align: 'right' }); y += 12;

    // ===== condições =====
    if (!juntas) { pagina('CONDIÇÕES'); kv([['Projeto/Obra:', E.obra], ['Aos cuidados de:', E.aosCuidados]]); y += 2; }
    titulo2('Condição de pagamento'); paragrafo(E.pagamento || '—', { depois: 0.8 });
    F(MONO, 'normal', 9.1); paragrafo('Nota: ' + (M.notaPagamento || ''), { just: true, depois: 4 });
    titulo2('Prazo', E.secoes.prazos && D.tipo === 'SEQ' ? '(Vide seção - "Prazos e condições")' : '');
    { const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0; const L = [];
      if (fab) L.push('Fabricação: ' + fab + ' dias (DAPC-Dias corridos após o Pedido de Compra)');
      if (ent) L.push('Entrega: ' + ent + ' dias (DAE-Dias corridos após a Expedição do equipamento)');
      if (fab || ent) L.push('Prazo Total: ' + (fab + ent) + ' dias.');
      for (const l of linhasDe(E.prazoTexto)) L.push(l);
      if (!L.length) L.push('A combinar.');
      for (const l of L) paragrafo(l, { depois: 0.3 }); y += 3.7; }
    titulo2('Frete'); paragrafo(E.frete || '—', { depois: 4 });
    titulo2('Observações');
    { const L = linhasDe(E.observacoes); if (D.tipo === 'SPV' && L.length) marcadores(L, { sz: 7.4, lh: 3.7 }); else for (const l of L) paragrafo(l, { just: true, depois: 0.6 }); y += 2; }
    atencao();

    // ===== folha de dados =====
    if (E.secoes.folha && D.tipo === 'SEQ') {
      D.itens.forEach((it, i) => {
        const fd = it.folha || {}; if (!(fd.componentes || []).length && !(fd.adicionais || []).length && !(fd.hidraulica || []).length) return;
        pagina('FOLHA DE DADOS');
        F(MONT, 'bold', 9); T('Item ' + (i + 1), X0, y + 3); y += 5;
        const cab = [E.codigos[it.key] ?? it.codigo, it.breve].filter(Boolean).join(' - ');
        faixa(cab, { fam: MONT, st: 'normal', sz: 8 }); y += 1;
        const tabela = (grupos) => {
          const hdr = () => { doc.setFillColor(...FUNDO); doc.rect(13.5, y, 182.8, 5.4, 'F'); doc.setDrawColor(...LINHA); doc.setLineWidth(0.25); doc.rect(13.5, y, 182.8, 5.4); doc.line(28, y, 28, y + 5.4); F(MONO, 'normal', 6.5, [119, 119, 119]); T('Qtd', 14.6, y + 3.7); T('Descrição', 29.2, y + 3.7); y += 5.4; };
          hdr();
          for (const g of grupos) {
            const L = [[g.titulo, 'bold']].concat((g.linhas || []).map((l) => [l, 'normal'])); const lin = [];
            for (const [t, st] of L) { F(MONO, st, 6.5); for (const q of quebra(t, 165)) lin.push([q, st]); }
            const h = lin.length * 3.3 + 2.2;
            if (y + h > LIM) { pagina(titulo); hdr(); }
            doc.setDrawColor(...LINHA); doc.rect(13.5, y, 182.8, h); doc.line(28, y, 28, y + h);
            F(MONO, 'normal', 6.5, [60, 60, 60]); T(qtdTxt(g.qtd), 14.6, y + 3.3);
            lin.forEach(([t, st], k) => { F(MONO, st, 6.5, st === 'bold' ? [0, 0, 0] : TXT2); T(t, 29.2, y + 3.3 + k * 3.3); });
            y += h;
          }
          y += 4;
        };
        if ((fd.componentes || []).length) tabela(fd.componentes);
        if ((fd.adicionais || []).length) { precisa(16); F(MONT, 'bold', 9); T('Adicionais', X0, y + 3); y += 5; tabela(fd.adicionais); }
        if ((fd.hidraulica || []).length) {
          precisa(16); F(MONT, 'bold', 9); T('Dados hidráulicos', X0, y + 3); y += 5;
          for (const b of fd.hidraulica) {
            const pares = b.dados.filter((x) => x[1] !== '' && x[1] != null); const lin = Math.ceil(pares.length / 2); const h = 4.2 + lin * 5;
            precisa(h + 2); F(MONO, 'bold', 7.4); T(b.titulo, X0, y + 3); y += 4.2;
            pares.forEach((p, k) => { const cx = k % 2 ? 105 : X0; const yy = y + Math.floor(k / 2) * 5; F(MONO, 'normal', 7.4, TXT2); T(p[0], cx, yy + 3.4); F(MONO, 'bold', 7.4); T(String(p[1]), cx + 44, yy + 3.4); doc.setDrawColor(...LINHA); doc.line(cx, yy + 4.6, cx + 88, yy + 4.6); });
            y += lin * 5 + 3;
          }
        }
        const nt = linhasDe(E.notasItem[it.key]);
        if (nt.length) { precisa(14); F(MONT, 'bold', 9); T('Notas, desvios e observações', X0, y + 3); y += 6; for (const l of nt) paragrafo(l, { sz: 8.2, depois: 0.6 }); }
      });
    }

    // ===== comissionamento e start-up =====
    if (E.secoes.comiss && D.tipo === 'SEQ') {
      const C = M.comissionamento || {}; pagina('COMISSIONAMENTO E START-UP');
      const y0 = y; F(MONT, 'normal', 10.6, TIT); T('O que está incluso', X0, y + 4); y += 7;
      marcadores(aplica(C.incluso, f), { x: X0 + 3, w: 100, sz: 8.2, lh: 4.2, gap: 0.6 });
      const hImg = put('comiss-tecnico', 130, y0 + 6, 66);
      y = Math.max(y, y0 + 6 + hImg) + 5; separador(y); y += 5;
      F(MONT, 'normal', 10.6, TIT); T('Comissionamento e Start-up', 105, y + 4, { align: 'center' }); y += 8;
      y += put('comiss-etapas', 30, y, 150) + 5; separador(y); y += 5;
      const col = (x, tit, sub, L) => { let yy = y; F(MONT, 'normal', 10.6, TIT); T(tit, x, yy + 4, { align: 'center' }); yy += 5.4; if (sub) { T(sub, x, yy + 4, { align: 'center' }); yy += 5.4; } yy += 2; F(MONO, 'normal', 8.2); for (const l of L) for (const q of quebra(l, 80)) { T(q, x, yy + 3.4, { align: 'center' }); yy += 4.2; } return yy; };
      const y1 = col(58, 'Serviços adicionais', '(fora do escopo e sob consulta)', C.adicionais || []); const y2 = col(152, 'Responsabilidades do cliente', '', C.responsabilidades || []);
      y = Math.max(y1, y2) + 4; separador(y); y += 5; atencao();
    }

    // ===== notas, desvios e exclusões =====
    pagina(D.tipo === 'SEQ' ? 'NOTAS DESVIOS E OBSERVAÇÕES' : 'NOTAS E DESVIOS');
    for (const [rot, txt] of [['Notas', E.notas], ['Desvios', E.desvios], ['Exclusões', E.exclusoes]]) {
      faixa(rot, { sz: 8.2 }); const L = linhasDe(txt);
      caixa(() => { if (!L.length) { y += 4; return; } marcadores(L.map((l) => l.replace(/^[•\-–]\s*/, '')), { sz: 7.4, lh: 3.7, gap: 0.5, x: X0 + 1, w: LW - 2 }); }, { pad: 1.2, borda: LINHA });
      y += 4;
    }

    // ===== prazos e condições =====
    if (E.secoes.prazos && D.tipo === 'SEQ') {
      const P = M.prazos || {}; pagina('PRAZOS E CONDIÇÕES');
      F(MONT, 'normal', 10.6, TIT); T('Composição do Prazo Total', 105, y + 4, { align: 'center' }); y += 8;
      paragrafo(P.intro || '', { sz: 8.2, lh: 4.2, just: true, depois: 5 });
      const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0;
      const bx = (x, w, l1, l2, escuro) => { doc.setFillColor(...(escuro ? ATN : FUNDO)); doc.rect(x, y, w, 15, 'F'); F(MONO, 'normal', 8.2, escuro ? [255, 255, 255] : [0, 0, 0]); T(l1, x + w / 2, y + 6, { align: 'center' }); F(MONO, 'bold', 8.2, TIT); T(l2, x + w / 2, y + 11, { align: 'center' }); };
      bx(X0, 52, 'Prazo de Fabricação', fab ? fab + ' dias · DAPC' : 'DAPC'); F(MONO, 'bold', 14, TIT); T('+', 71, y + 9.5, { align: 'center' });
      bx(77, 52, 'Prazo de entrega (CIF)', ent ? ent + ' dias · DAE' : 'DAE'); F(MONO, 'bold', 14, TIT); T('=', 136, y + 9.5, { align: 'center' });
      bx(142, X1 - 142, 'Prazo Total', fab || ent ? (fab + ent) + ' dias' : '', true); y += 21;
      // siglas
      const cs = [X0, 32, 100, X1]; doc.setFillColor(...LAR2); doc.rect(X0, y, LW, 5.6, 'F'); F(MONO, 'bold', 7.4, [255, 255, 255]); ['Sigla', 'Significado', 'Aplica-se a'].forEach((t, c) => T(t, cs[c] + 1.5, y + 3.8)); y += 5.6;
      for (const r of P.siglas || []) { const L = r.map((t, c) => (F(MONO, c ? 'normal' : 'bold', 7.4), quebra(t, cs[c + 1] - cs[c] - 3))); const h = Math.max(...L.map((l) => l.length)) * 3.6 + 2; doc.setDrawColor(...LINHA); doc.line(X0, y + h, X1, y + h); L.forEach((l, c) => { F(MONO, c ? 'normal' : 'bold', 7.4); l.forEach((q, k) => T(q, cs[c] + 1.5, y + 3.6 + k * 3.6)); }); y += h; }
      y += 6;
      const lista = (x, tit, L) => { let yy = y; F(MONT, 'normal', 9.4, TIT); T(tit, x, yy + 3.5); yy += 6.5; for (const l of L) { F(MONO, 'normal', 7.4); const q = quebra(l, 82); T('•', x, yy + 3); q.forEach((s, k) => T(s, x + 3.5, yy + 3 + k * 3.7)); yy += q.length * 3.7 + 1; } return yy; };
      y = Math.max(lista(X0, 'Condições para início da contagem (DAPC)', P.inicio || []), lista(108, 'Hipóteses de suspensão do prazo', P.suspensao || [])) + 5;
      if (P.recebimento) { F(MONO, 'normal', 7.4); const q = quebra(P.recebimento, LW - 8); const h = q.length * 3.7 + 5; precisa(h + 2); doc.setFillColor(...SUAVE); doc.rect(X0, y, LW, h, 'F'); doc.setFillColor(...ATN2); doc.rect(X0, y, 1.2, h, 'F'); F(MONO, 'normal', 7.4); q.forEach((s, k) => T(s, X0 + 4, y + 4.2 + k * 3.7)); y += h + 4; }
      atencao();
    }

    // ===== escopo de documentos =====
    if (E.secoes.docs && D.tipo === 'SEQ') {
      const S = M.escopoDocs || {}; pagina('ESCOPO DE DOCUMENTOS');
      const cs = [X0, 98, 112, 126, 141, 157, 172, X1];
      F(MONO, 'normal', 6.2); const hl = (S.cab || []).map((t, c) => quebra(t, cs[c + 1] - cs[c] - 1.5)); const hh = Math.max(...hl.map((l) => l.length)) * 2.8 + 2.4;
      doc.setFillColor(...ESC); doc.rect(X0, y, LW, hh, 'F'); F(MONO, 'normal', 6.2, [255, 255, 255]); hl.forEach((l, c) => l.forEach((q, k) => T(q, c ? (cs[c] + cs[c + 1]) / 2 : cs[c] + 1.2, y + 3 + k * 2.8, c ? { align: 'center' } : undefined))); y += hh;
      for (const [g, rows] of S.grupos || []) {
        const rs = aplica(rows.map((r) => r[0]), f).map((nome) => rows.find((r) => r[0].replace(/^\[[^\]]+\]\s*/, '') === nome)).filter(Boolean);
        if (!rs.length) continue; precisa(10); doc.setFillColor(...LAR2); doc.rect(X0, y, LW, 4.6, 'F'); F(MONO, 'bold', 6.6, [255, 255, 255]); T(g, X0 + 1.2, y + 3.2); y += 4.6;
        rs.forEach((r, k) => { precisa(5); if (k % 2) { doc.setFillColor(...FUNDO); doc.rect(X0, y, LW, 4.4, 'F'); } F(MONO, 'normal', 6.6); r.forEach((t, c) => { const s = c ? t : t.replace(/^\[[^\]]+\]\s*/, ''); T(s, c ? (cs[c] + cs[c + 1]) / 2 : cs[c] + 1.2, y + 3.1, c ? { align: 'center' } : undefined); }); y += 4.4; });
      }
      y += 6;
      const col = (x, w, blocos) => { const out = []; for (const [tit, L, num] of blocos) { out.push(['t', tit]); L.forEach((l, k) => { F(MONO, 'normal', 6.4); quebra((num ? (k + 1) + '. ' : '') + l, w).forEach((q) => out.push(['l', q])); }); out.push(['g']); } return out; };
      const esq = col(X0, 88, [['Base de Prazo', S.basePrazo || []], ['Tipo de Entrega', S.tipoEntrega || []], ['Adicionais (sob consulta — solicitar à LS Fire)', (S.adicionais || []).map((x) => '- ' + x)]]);
      const dir = col(108, 89, [['Notas', S.notas || [], true]]);
      const alt = (L) => L.reduce((t, x) => t + (x[0] === 't' ? 5 : x[0] === 'g' ? 2.5 : 2.9), 0);
      if (y + Math.max(alt(esq), alt(dir)) > LIM) pagina(titulo);
      const desenha = (x, L) => { let yy = y; for (const r of L) { if (r[0] === 't') { F(MONT, 'normal', 8.6, TIT); T(r[1], x, yy + 3.4); yy += 5; } else if (r[0] === 'g') yy += 2.5; else { F(MONO, 'normal', 6.4); T(r[1], x, yy + 2.4); yy += 2.9; } } return yy; };
      y = Math.max(desenha(X0, esq), desenha(108, dir));
    }

    // ===== termos e condições (duas colunas) =====
    if (E.secoes.termos && (M.termos || []).length) {
      pagina('TERMOS E CONDIÇÕES');
      const cw = 88.5, xs = [X0, X0 + cw + 8], lh = 3.35, sz = 7.2; let colN = 0;
      const L = [];
      for (const c of M.termos) { L.push(['t', c.t]); for (const p of c.p || []) { F(MONO, 'normal', sz); const q = quebra(p, cw); q.forEach((s, k) => L.push(['p', s, k < q.length - 1])); L.push(['g']); } L.push(['g']); }
      for (let k = 0; k < L.length; k++) {
        const r = L[k]; const h = r[0] === 't' ? 5 : r[0] === 'g' ? 1.4 : lh;
        if (r[0] === 'g' && y === TOPO) continue;
        if (y + h + (r[0] === 't' ? lh * 2 : 0) > LIM) { if (colN === 0) { colN = 1; y = TOPO; } else { pagina(titulo); colN = 0; } }
        const x = xs[colN];
        if (r[0] === 't') { F(MONO, 'bold', sz + 0.4); T(r[1], x, y + 3.6); }
        else if (r[0] === 'p') { F(MONO, 'normal', sz); linhaJust(r[1], x, y + 2.6, cw, r[2]); }
        y += h;
      }
    }

    // ===== contatos =====
    pagina('CONTATOS'); F(MONO, 'normal', 9.1); T('À disposição para esclarecimentos,', X0, 62);
    const cts = (M.contatos || []).filter((c) => (E.contatos || []).includes(c.nome));
    cts.forEach((c, k) => { const x = k % 2 ? 108 : X0; const yy = 84 + Math.floor(k / 2) * 30; F(MONT, 'bold', 9.1, TIT); T(c.nome, x, yy); F(MONO, 'normal', 8.2); [c.cargo, c.tel, c.email].filter(Boolean).forEach((s, j) => T(s, x, yy + 5 + j * 4.6)); });
    put('slogan', 117, 238, 80);

    // ===== numeração discreta nas páginas internas =====
    const n = doc.getNumberOfPages();
    for (let i = 2; i <= n; i++) { doc.setPage(i); F(MONO, 'normal', 7, CINZA); T(i + '/' + n, X1, 290.6, { align: 'right' }); }
    const cli = (E.cliente || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 50);
    const nome = ('PTC_' + numero.replace(/\s*\/\s*/g, '_').replace(/\s+/g, '') + (cli ? '_' + cli.replace(/\s+/g, '_') : '')).replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
    return { bytes: doc.output('arraybuffer'), nome, paginas: n };
  }

  window.PricerProposta = { montar, efetivo, modelo, aplica, normaTxt, dataBR };
})();
