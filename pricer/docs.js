/* LS Pricer — documentos: memorial em PDF e FCI em PDF e Excel (layout da aba FCI EXTRAÇÃO). */
(function () {
  'use strict';
  const LIBS = {
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  };
  const loaded = {};
  function load(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => { delete loaded[src]; rej(new Error('Não consegui carregar a biblioteca para gerar o arquivo. Verifique a internet e tente de novo.')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function pdfLib() { if (!(window.jspdf && window.jspdf.jsPDF)) await load(LIBS.jspdf); if (!window.jspdf.jsPDF.API.autoTable) await load(LIBS.autotable); return window.jspdf.jsPDF; }
  async function excelLib() { if (!window.ExcelJS) await load(LIBS.exceljs); return window.ExcelJS; }

  const OR = [232, 87, 10], INK = [27, 28, 30], MUTE = [110, 112, 118], LINE = [215, 212, 206];
  const SLOGAN = 'A FORÇA DA ÁGUA É A NOSSA FORÇA';

  function logoData() {
    try {
      const img = document.getElementById('logoPdf') || document.querySelector('.logo-plate img'); if (!img || !img.naturalWidth) return null;
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); return { url: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
    } catch (e) { return null; }
  }
  const safe = (s) => String(s ?? '').replace(/[‑‒–]/g, '-').replace(/—/g, '—').replace(/[^\x00-\xFF—–’“”•…]/g, '');

  function Docs(ctx) {
    const { val, txt, show, fmtNum, brl, pct, ITEMS, filled, save, toast, wb, fciHidden } = ctx;
    const today = () => new Date().toLocaleDateString('pt-BR');
    const P = 'PROPOSTA';
    const propNum = () => txt(P, 'C5') || 'sem número';
    const fileBase = (kind) => (kind + ' - ' + propNum() + (txt(P, 'F5') ? ' - ' + txt(P, 'F5').split(/[—-]/)[0].trim() : '')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);

    // cabeçalho e rodapé no padrão LS Fire
    function frame(doc, title, subtitle) {
      const W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight();
      const logo = logoData();
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFillColor(...OR); doc.rect(0, 0, W, 3, 'F');
        if (logo) doc.addImage(logo.url, 'PNG', 12, 7, 38, 38 * logo.h / logo.w);
        doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text(safe(title), W - 12, 13, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE);
        doc.text(safe(subtitle), W - 12, 18.5, { align: 'right' });
        doc.setDrawColor(...LINE); doc.line(12, 24, W - 12, 24);
        doc.setFillColor(...OR); doc.rect(0, Hh - 10, W, 10, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text(SLOGAN, 12, Hh - 3.8);
        doc.setFont('helvetica', 'normal');
        doc.text(safe('Gerado em ' + today() + ' pelo LS Pricer · página ' + i + ' de ' + pages), W - 12, Hh - 3.8, { align: 'right' });
      }
    }
    function kvBlock(doc, y, pairs, cols) {
      const W = doc.internal.pageSize.getWidth(); const colW = (W - 24) / cols;
      for (let i = 0; i < pairs.length; i += cols) {
        let rowH = 0;
        pairs.slice(i, i + cols).forEach(([k, v], j) => {
          const x = 12 + j * colW;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...MUTE);
          const kl = doc.splitTextToSize(safe(k).toUpperCase(), colW - 4).slice(0, 2);
          doc.text(kl, x, y);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...INK);
          const vl = doc.splitTextToSize(safe(v || '—'), colW - 4).slice(0, 2);
          const vy = y + kl.length * 2.8 + 1.4; doc.text(vl, x, vy);
          rowH = Math.max(rowH, (vy - y) + vl.length * 3.6 + 2.2);
        });
        y += rowH;
      }
      return y + 1;
    }
    const tableStyle = {
      styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
      headStyles: { fillColor: [30, 31, 33], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 246, 243] },
      margin: { left: 12, right: 12, top: 30, bottom: 16 },
    };

    // ---------- memorial ----------
    async function memorialPdf() {
      const jsPDF = await pdfLib();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const items = ITEMS.map((s, i) => ({ s, i })).filter((x) => filled(x.s));
      let y = 32;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK);
      doc.text(safe('Proposta ' + propNum() + (txt(P, 'C6') ? ' — rev. ' + txt(P, 'C6') : '')), 12, y); y += 7;
      y = kvBlock(doc, y, [['Cliente', txt(P, 'F5')], ['Obra / local', txt(P, 'F6')], ['UF de destino', txt(P, 'F7')], ['Segmento', txt(P, 'F8')],
        ['Data', txt(P, 'C7')], ['Validade', txt(P, 'C10')], ['Vendedor', txt(P, 'C8')], ['Cadastro fiscal', txt(P, 'J5')],
        ['Condição de pagamento', txt(P, 'J6')], ['Frete', txt(P, 'B13')], ['Norma', txt(P, 'F9')], ['NCM', txt(P, 'J9')]], 4) + 2;
      // resumo
      const k = [['Preço total (com IPI)', brl(val(P, 'P43'))], ['Custo total', brl(val(P, 'Q43'))], ['Margem líquida', pct(val(P, 'E62'), 2)], ['Itens', txt(P, 'M16')]];
      const W = doc.internal.pageSize.getWidth(); const bw = (W - 24) / 4;
      k.forEach(([a, b], i) => {
        const x = 12 + i * bw; doc.setFillColor(i === 0 ? 255 : 248, i === 0 ? 241 : 246, i === 0 ? 232 : 243); doc.rect(x, y, bw - 3, 14, 'F');
        doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.setFont('helvetica', 'normal'); doc.text(safe(a).toUpperCase(), x + 3, y + 5);
        doc.setFontSize(12); doc.setTextColor(...(i === 0 ? OR : INK)); doc.setFont('helvetica', 'bold'); doc.text(safe(b), x + 3, y + 11.5);
      });
      y += 20;
      // itens
      doc.autoTable(Object.assign({}, tableStyle, {
        startY: y,
        head: [['Item', 'Código', 'Descrição', 'Qtd', 'Unit. c/ impostos s/ IPI', 'IPI', 'Total c/ IPI', 'Origem', 'Margem']],
        body: items.map(({ s, i }) => { const r = 33 + i; return [s.slice(5), txt(P, 'C' + r), txt(P, 'D' + r), show(P, 'F' + r), show(P, 'L' + r), show(P, 'U' + r), show(P, 'P' + r), txt(P, 'H' + r), show(P, 'X' + r)].map(safe); }),
        columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 52, font: 'courier', fontSize: 7 }, 3: { halign: 'right', cellWidth: 11 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' }, 8: { halign: 'right' } },
      }));
      // memorial (linhas da aba MEMORIAL)
      const M = 'MEMORIAL';
      const cols = items.map(({ i }) => String.fromCharCode(67 + i)); // C..L
      const body = []; const bold = [];
      for (let r = 3; r <= 38; r++) {
        const lb = txt(M, 'B' + r); if (!lb) continue;
        if (val(M, 'M' + r) === null && val(M, 'C' + r) === null) { body.push([{ content: safe(lb), colSpan: cols.length + 2, styles: { fontStyle: 'bold', textColor: OR, fillColor: [255, 255, 255] } }]); continue; }
        const isBold = /^TOTAL|Margem|com impostos e COM IPI/i.test(lb);
        const row = [lb, ...cols.map((c) => show(M, c + r)), show(M, 'M' + r)].map(safe);
        if (isBold) bold.push(body.length);
        body.push(row);
      }
      doc.addPage();
      doc.autoTable(Object.assign({}, tableStyle, {
        startY: 32,
        head: [['Memorial de formação de preço', ...items.map(({ s }) => s), 'Total da proposta']],
        body,
        columnStyles: Object.assign({ 0: { cellWidth: 78 } }, Object.fromEntries(cols.map((_, j) => [j + 1, { halign: 'right' }])), { [cols.length + 1]: { halign: 'right', fontStyle: 'bold' } }),
        didParseCell: (d) => { if (d.section === 'body' && bold.includes(d.row.index)) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [255, 241, 232]; } },
      }));
      let yy = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.setFont('helvetica', 'normal');
      for (let r = 39; r <= 48; r++) { const t = txt(M, 'B' + r); if (!t) continue; const lines = doc.splitTextToSize(safe(t), W - 24); if (yy + lines.length * 3.4 > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); yy = 32; } doc.text(lines, 12, yy); yy += lines.length * 3.4 + 1.5; }
      frame(doc, 'Memorial de formação de preço', 'Proposta ' + propNum() + ' · ' + (txt(P, 'F5') || ''));
      return deliver(fileBase('Memorial') + '.pdf', doc.output('arraybuffer'), 'application/pdf');
    }

    // ---------- FCI ----------
    // lê a aba FCI EXTRAÇÃO (o template que vai para a planilha do financeiro) com o item escolhido
    function withItem(S, fn) {
      const sh = wb().sheet('FCI EXTRAÇÃO'); const prev = sh.cells.get('L2');
      sh.cells.set('L2', S); wb().invalidate();
      try { return fn(); } finally { if (prev === undefined) sh.cells.delete('L2'); else sh.cells.set('L2', prev); wb().invalidate(); }
    }
    // componentes da FCI direto da montagem (34-63) e do escopo (68-112): o bloco da planilha só lista 45
    function fciComps(S) {
      const out = [];
      for (let r = 34; r <= 112; r++) {
        if (r > 63 && r < 68) continue;
        if (val(S, 'AU' + r) !== 1) continue;
        const n = val(S, 'AV' + r), q = 120 + n; // até a linha 45 vale o ajuste feito no bloco FCI do item
        const ori = txt(S, 'AB' + r), qtd = val(S, 'F' + r), unit = n <= 45 && typeof val(S, 'G' + q) === 'number' ? val(S, 'G' + q) : val(S, 'AD' + r);
        out.push({ n, grp: txt(S, 'C' + r) || '-', desc: txt(S, 'D' + r), ori, qtd, unit,
          tot: typeof qtd === 'number' && typeof unit === 'number' ? qtd * unit : 0, obs: ori === 'NAC' ? 'NAC -  Valor zerado para cálculo do CI' : '' });
      }
      return out.sort((a, b) => a.n - b.n).concat(fciHidden ? fciHidden(S) : []);
    }
    function fciItems(only) { return (only ? [only] : ITEMS).filter((s) => filled(s)); }
    function fciData(S) {
      const comps = fciComps(S).map((x) => [String(x.n), x.grp, x.desc, x.ori, fmtNum(x.qtd, '#,##0.0'), fmtNum(x.unit, '#,##0.00'), fmtNum(x.tot, '#,##0.00'), x.obs]);
      return {
        code: txt(S, 'C27'), desc: txt(S, 'C28') || txt(S, 'C4'), comps,
        kv: [['Valor da saída (sem ICMS/IPI)', show(S, 'H170')], ['Conteúdo de importação (CI)', pct(val(S, 'C172'), 2)], ['Origem', txt(S, 'E172')], ['Alíquota ICMS (usar na OV)', pct(val(S, 'C181'), 2)],
          ['CST ICMS', txt(S, 'C183')], ['UF origem / destino', txt(S, 'C173') + ' / ' + txt(S, 'C174')], ['Contribuinte de ICMS', txt(S, 'C175')], ['Destinação', txt(S, 'C176')],
          ['NCM', txt(S, 'C192')], ['% IPI', pct(val(S, 'C191'), 2)], ['Unidade p/ transmissão', txt(S, 'C193')], ['Finalidade', txt(S, 'C194')],
          ['FCI', txt(S, 'C195')], ['DIFAL estimado', pct(val(S, 'C179'), 2)], ['Quem recolhe o DIFAL', txt(S, 'C180')], ['Carga total da operação', pct(val(S, 'C182'), 2)]],
        total: show(S, 'H166'), pend: txt(S, 'C196'), checks: [txt(S, 'C185'), txt(S, 'C187'), txt(S, 'C188')].filter(Boolean),
      };
    }
    async function fciPdf(only) {
      const list = fciItems(only); if (!list.length) { toast('Nenhum item preenchido para a FCI'); return; }
      const jsPDF = await pdfLib();
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      list.forEach((S, n) => {
        if (n) doc.addPage();
        const d = fciData(S); let y = 32;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(safe(S + ' — ' + (d.code || '')), 12, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE);
        const dl = doc.splitTextToSize(safe(d.desc), doc.internal.pageSize.getWidth() - 24); doc.text(dl, 12, y); y += dl.length * 3.8 + 3;
        y = kvBlock(doc, y, d.kv, 4);
        doc.autoTable(Object.assign({}, tableStyle, {
          startY: y + 1,
          head: [['#', 'Grupo', 'Descrição', 'Origem', 'Qtd', 'Parcela imp. unit.', 'Parcela importada', 'Observação']],
          body: d.comps.map((r) => r.map(safe)),
          foot: [[{ content: 'VALOR TOTAL DA PARCELA IMPORTADA', colSpan: 6 }, safe(d.total), '']],
          footStyles: { fillColor: [255, 241, 232], textColor: INK, fontStyle: 'bold' },
          columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 33, fontSize: 6.6 }, 3: { cellWidth: 14 }, 4: { halign: 'right', cellWidth: 10 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { cellWidth: 34, fontSize: 6.8 } },
        }));
        let yy = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(8); doc.setTextColor(...INK);
        for (const t of [d.pend ? 'Pendências: ' + d.pend : '', ...d.checks]) { if (!t) continue; const l = doc.splitTextToSize(safe(t), doc.internal.pageSize.getWidth() - 24); doc.text(l, 12, yy); yy += l.length * 3.6 + 1.5; }
      });
      frame(doc, 'FCI — Ficha de conteúdo de importação', 'Proposta ' + propNum() + ' · ' + (txt(P, 'F5') || ''));
      return deliver(fileBase('FCI') + (only ? ' - ' + only : '') + '.pdf', doc.output('arraybuffer'), 'application/pdf');
    }
    // Excel: preenche o template oficial "Cálculo FCI" (templates/Calculo_FCI.xlsx), uma aba por item
    const TPL_ROWS = 16, FIRST = 3; // linhas de componentes do template: 3 a 18
    function shiftRefs(f, k) { // desloca referências da própria aba a partir da linha 19
      if (!k) return f;
      return f.replace(/(^|[^A-Za-z!$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(])/g, (m, pre, d1, col, d2, row) => {
        const r = +row; return pre + d1 + col + d2 + (r >= FIRST + TPL_ROWS ? r + k : r);
      }).replace('G3:G18', 'G3:G' + (18 + k));
    }
    const colNum = (L) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    function copySheet(book, src, name) {
      const ws = book.addWorksheet(name, { properties: JSON.parse(JSON.stringify(src.properties || {})), pageSetup: JSON.parse(JSON.stringify(src.pageSetup || {})), views: JSON.parse(JSON.stringify(src.views || [])) });
      src.columns && src.columns.forEach((c, i) => { if (c && c.width) ws.getColumn(i + 1).width = c.width; });
      src.eachRow({ includeEmpty: true }, (row, r) => {
        const nr = ws.getRow(r); if (row.height) nr.height = row.height;
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          const t = nr.getCell(c);
          let v = cell.value; if (v && typeof v === 'object' && v.sharedFormula) v = { formula: cell.formula };
          t.value = v; t.style = JSON.parse(JSON.stringify(cell.style || {}));
          if (cell.note) t.note = JSON.parse(JSON.stringify(cell.note));
        });
      });
      (src.model.merges || []).forEach((m) => { try { ws.mergeCells(m); } catch (e) { /* já mesclado */ } });
      return ws;
    }
    function fillFci(ws, S) {
      const comps = fciComps(S);
      const k = Math.max(0, comps.length - TPL_ROWS);
      // guarda as fórmulas de baixo antes de inserir linhas
      const below = [], notes = [];
      ws.eachRow({ includeEmpty: true }, (row, r) => { row.eachCell({ includeEmpty: true }, (cell, c) => { if (cell.note) notes.push([r, c, cell.note]); if (r >= FIRST + TPL_ROWS && cell.formula) below.push([r, c, cell.formula]); }); });
      const merges = (ws.model.merges || []).slice();
      if (k) {
        ws.duplicateRow(FIRST + TPL_ROWS - 2, k, true);
        // o ExcelJS não desloca as mesclagens: refaz as de baixo na posição nova e limpa as cópias soltas
        const moves = merges.map((m) => /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m)).filter((mm) => mm && +mm[2] >= FIRST + TPL_ROWS);
        for (const mm of moves) { try { ws.unMergeCells(mm[0]); } catch (e) { /* ok */ } }
        for (const mm of moves) {
          const nr1 = +mm[2] + k, nr2 = +mm[4] + k, c1 = colNum(mm[1]), c2 = colNum(mm[3]);
          for (let r = nr1; r <= nr2; r++) for (let c = c1; c <= c2; c++) if (r !== nr1 || c !== c1) ws.getRow(r).getCell(c).value = null;
          ws.mergeCells(mm[1] + nr1 + ':' + mm[3] + nr2);
        }
      }
      below.forEach(([r, c, f]) => { ws.getRow(r + k).getCell(c).value = { formula: shiftRefs(f, k) }; });
      notes.forEach(([r, c, note]) => { if (k && r >= FIRST + TPL_ROWS) ws.getRow(r).getCell(c)._comment = undefined; });
      notes.forEach(([r, c, note]) => { ws.getRow(r >= FIRST + TPL_ROWS ? r + k : r).getCell(c).note = note; });
      const n = TPL_ROWS + k;
      for (let i = 0; i < n; i++) {
        const r = FIRST + i, x = comps[i], row = ws.getRow(r);
        if (!row) continue;
        row.getCell(1).value = x ? i + 1 : null;
        row.getCell(2).value = x ? x.grp : null;
        row.getCell(3).value = x ? x.desc : null;
        row.getCell(4).value = x ? x.ori : null;
        row.getCell(5).value = x && typeof x.qtd === 'number' ? x.qtd : null;
        row.getCell(6).value = x && typeof x.unit === 'number' ? x.unit : null;
        row.getCell(7).value = { formula: '+E' + r + '*F' + r };
        row.getCell(8).value = x && x.obs ? x.obs : null;
      }
      const R = (r) => ws.getRow(r + k);
      let soma = 0;
      for (let i = 0; i < n; i++) { const x = comps[i]; const g = x && typeof x.qtd === 'number' && typeof x.unit === 'number' ? x.qtd * x.unit : 0; soma += g; ws.getRow(FIRST + i).getCell(7).value = { formula: '+E' + (FIRST + i) + '*F' + (FIRST + i), result: g }; }
      // saída: código, família, quantidade, valor com e sem ICMS/IPI
      R(22).getCell(1).value = txt(S, 'C27') || '-';
      R(22).getCell(2).value = '-';
      R(22).getCell(3).value = txt(S, 'C5') || txt(S, 'D169') || '-';
      R(22).getCell(5).value = 1;
      R(22).getCell(6).value = typeof val(S, 'G169') === 'number' ? val(S, 'G169') : null;
      R(22).getCell(7).value = typeof val(S, 'H169') === 'number' ? val(S, 'H169') : null;
      // enquadramento
      R(26).getCell(1).value = txt(S, 'C173') || 'SC';
      R(27).getCell(1).value = txt(S, 'G5');
      R(28).getCell(1).value = txt(S, 'C175');
      R(29).getCell(1).value = txt(S, 'C176');
      R(30).getCell(1).value = txt(S, 'G7');
      // grava também o resultado de cada fórmula, com a mesma lógica do template
      const saida = typeof val(S, 'H169') === 'number' ? val(S, 'H169') : 0;
      const ci = saida ? soma / saida : 0;
      const ufO = txt(S, 'C173') || 'SC', ufD = txt(S, 'G5'), contrib = txt(S, 'C175'), dest = txt(S, 'C176');
      const tab = {}; const al = ws.workbook.getWorksheet('Aliquotas');
      if (al) al.eachRow((row, r) => { if (r > 1) tab[String(row.getCell(1).value)] = [row.getCell(2).value, row.getCell(3).value, row.getCell(4).value]; });
      const t = tab[ufD] || [0, 0, 0];
      const invalid = contrib === 'NÃO' && dest === 'REVENDA/INDUSTRIALIZAÇÃO';
      const aliq = ci > 0.4 ? t[0] : t[1];
      const difal = invalid ? '' : (ufD === ufO || dest === 'REVENDA/INDUSTRIALIZAÇÃO') ? 0 : Math.max(0, t[2] - aliq);
      const quem = invalid ? 'COMBINAÇÃO INVÁLIDA' : ufD === ufO ? 'SEM DIFAL (venda interna)' : dest === 'REVENDA/INDUSTRIALIZAÇÃO' ? 'SEM DIFAL (revenda)' : difal === 0 ? 'SEM DIFAL' : contrib === 'NÃO' ? 'LS FIRE recolhe' : 'CLIENTE recolhe';
      const setRes = (r, c, result) => { const cell = R(r).getCell(c); if (cell.formula) cell.value = { formula: cell.formula, result }; };
      setRes(19, 7, soma); setRes(23, 7, saida); setRes(25, 7, ci); setRes(25, 4, ci > 0.4 ? 'IMPORTADO' : 'NACIONAL');
      setRes(31, 1, aliq); setRes(32, 1, difal); setRes(33, 1, quem);
      setRes(34, 1, invalid ? 'CORRIJA ACIMA' : aliq + (contrib === 'NÃO' && difal > 0 ? difal : 0));
      setRes(35, 1, invalid ? '' : aliq + difal); setRes(36, 1, ci > 0.7 ? 8 : ci > 0.4 ? 3 : 5);
      const f37 = R(37).getCell(1).formula || ''; const msgs = [...f37.matchAll(/"([^"]{25,})"/g)].map((m) => m[1]);
      if (msgs.length >= 6) setRes(37, 1, invalid ? msgs[0] : ufD === ufO ? msgs[1] : dest === 'REVENDA/INDUSTRIALIZAÇÃO' ? msgs[2] : difal === 0 ? msgs[3] : contrib === 'NÃO' ? msgs[4] : msgs[5]);
      // listas (o Excel perde as validações do template ao regravar)
      const dv = (r, list) => { R(r).getCell(1).dataValidation = { type: 'list', allowBlank: true, formulae: [list] }; };
      dv(26, 'Aliquotas!$A$2:$A$28'); dv(27, 'Aliquotas!$A$2:$A$28'); dv(28, 'Aliquotas!$F$2:$F$3'); dv(29, 'Aliquotas!$F$6:$F$7'); dv(30, 'Aliquotas!$F$10:$F$11');
      for (let i = 0; i < n; i++) ws.getRow(FIRST + i).getCell(4).dataValidation = { type: 'list', allowBlank: true, formulae: ['"IMP,NAC"'] };
    }
    async function fciXlsx(only) {
      const list = fciItems(only); if (!list.length) { toast('Nenhum item preenchido para a FCI'); return; }
      if (!window.FCI_TEMPLATE_B64) throw new Error('Template da FCI não encontrado no app.');
      const ExcelJS = await excelLib();
      const bin = Uint8Array.from(atob(window.FCI_TEMPLATE_B64), (c) => c.charCodeAt(0));
      const book = new ExcelJS.Workbook(); await book.xlsx.load(bin.buffer);
      const tpl = book.worksheets[0];
      const sheets = [tpl];
      for (let i = 1; i < list.length; i++) sheets.push(copySheet(book, tpl, 'tmp' + i));
      list.forEach((S, i) => { sheets[i].name = 'Cálculo CI - ' + S; fillFci(sheets[i], S); });
      // itens primeiro, depois orientações, alíquotas e tabela CST
      const rest = book.worksheets.filter((w) => !sheets.includes(w));
      [...sheets, ...rest].forEach((w, i) => { w.orderNo = i; });
      book.calcProperties = Object.assign({}, book.calcProperties, { fullCalcOnLoad: true });
      const out = await book.xlsx.writeBuffer();
      return deliver(fileBase('FCI') + (only ? ' - ' + only : '') + '.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    async function deliver(name, data, mime) { const ok = await save(name, data, mime); toast(ok ? 'Arquivo gerado: ' + name : 'Download cancelado'); return ok; }

    return {
      memorialPdf: () => run(memorialPdf),
      fciPdf: (only) => run(() => fciPdf(only)),
      fciXlsx: (only) => run(() => fciXlsx(only)),
    };
    async function run(fn) { try { toast('Gerando arquivo…'); return await fn(); } catch (e) { toast(e && e.message ? e.message : 'Não consegui gerar o arquivo'); } }
  }
  window.PricerDocs = Docs;
})();
