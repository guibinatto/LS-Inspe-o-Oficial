/* LS Pricer — leitura de documentos no próprio navegador, sem serviço externo.
 * NF-e em XML (exato), PDF com texto (DANFE, orçamentos), Excel/CSV e, para escaneados e fotos, OCR (tesseract.js).
 * Devolve o mesmo formato que o resto do app usa:
 * { fornecedor, documento, data, tipo, moeda, condicao_pagamento, validade, frete, total, itens: [{ codigo, descricao, ncm, unidade, quantidade, valor_unitario, ipi_percentual, icms_percentual }] }
 */
(function () {
  'use strict';
  const CDN = {
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfworker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  };
  const loaded = {};
  const load = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Não consegui carregar ' + src.split('/').pop() + '. Verifique a internet.')); }; document.head.appendChild(s); }));

  // número em pt-BR ("1.936,40") ou en ("1,936.40"); o último separador é o decimal
  function numBR(s) {
    if (typeof s === 'number') return s; s = String(s || '').replace(/[R$\sUSD€]/g, ''); if (!s) return null;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > ld) s = s.replace(/\./g, '').replace(',', '.'); else if (ld > lc && lc >= 0) s = s.replace(/,/g, '');
    else if (ld >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s); return isFinite(n) ? n : null;
  }
  const NUM = /^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/;
  const dataISO = (s) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (/^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(0, 10) : null); };
  const vazio = () => ({ fornecedor: '', documento: '', data: null, tipo: 'outro', moeda: 'BRL', condicao_pagamento: null, validade: null, frete: null, total: null, itens: [] });

  // ---------- NF-e XML ----------
  function lerXml(txt) {
    const d = new DOMParser().parseFromString(txt, 'application/xml');
    const q = (el, tag) => { const x = el && el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : ''; };
    const out = vazio(); const emit = d.getElementsByTagName('emit')[0]; const ide = d.getElementsByTagName('ide')[0];
    if (!emit && !d.getElementsByTagName('det').length) return null;
    out.tipo = 'nota'; out.fornecedor = q(emit, 'xNome'); out.documento = q(ide, 'nNF'); out.data = dataISO(q(ide, 'dhEmi') || q(ide, 'dEmi'));
    const tot = d.getElementsByTagName('ICMSTot')[0]; out.total = numBR(q(tot, 'vNF')); out.frete = numBR(q(tot, 'vFrete')) || null;
    for (const det of d.getElementsByTagName('det')) {
      const p = det.getElementsByTagName('prod')[0]; const imp = det.getElementsByTagName('imposto')[0];
      const ipi = imp && imp.getElementsByTagName('IPITrib')[0]; const icms = imp && imp.getElementsByTagName('ICMS')[0];
      out.itens.push({ codigo: q(p, 'cProd') || null, descricao: q(p, 'xProd'), ncm: q(p, 'NCM') || null, unidade: q(p, 'uCom') || null, quantidade: numBR(q(p, 'qCom')) || 1,
        valor_unitario: numBR(q(p, 'vUnCom')) || 0, ipi_percentual: numBR(q(ipi, 'pIPI')) || 0, icms_percentual: numBR(q(icms, 'pICMS')) });
    }
    const pg = d.getElementsByTagName('detPag')[0]; if (pg) out.condicao_pagamento = null;
    return out;
  }

  // ---------- PDF: linhas reconstruídas pela posição do texto ----------
  async function pdfLinhas(file) {
    await load(CDN.pdfjs); const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = CDN.pdfworker;
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const linhas = []; const pages = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
      const pg = await pdf.getPage(i); pages.push(pg); const tc = await pg.getTextContent();
      const rows = [];
      for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const y = it.transform[5], x = it.transform[4]; let r = rows.find((z) => Math.abs(z.y - y) < 2.5); if (!r) { r = { y, parts: [] }; rows.push(r); } r.parts.push({ x, s: it.str.trim() }); }
      rows.sort((a, b) => b.y - a.y).forEach((r) => linhas.push(r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return { linhas, pages };
  }
  async function ocr(images, onStatus) {
    await load(CDN.tesseract); const T = window.Tesseract; const linhas = [];
    for (let i = 0; i < images.length; i++) {
      onStatus && onStatus(`Lendo a imagem ${i + 1} de ${images.length} (reconhecimento de texto, pode levar ~30 s)…`);
      const r = await T.recognize(images[i], 'por'); linhas.push(...String(r.data.text || '').split(/\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean));
    }
    return linhas;
  }
  async function pageImage(pg) { const vp = pg.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return c; }

  // ---------- texto → documento ----------
  function lerTexto(linhas) {
    const out = vazio(); const all = linhas.join('\n'); const up = all.toUpperCase();
    out.tipo = /DANFE|NOTA FISCAL ELETR|NF-E/.test(up) ? 'nota' : /PEDIDO DE COMPRA|PEDIDO N/.test(up) ? 'pedido' : /OR[CÇ]AMENTO|COTA[CÇ][AÃ]O|PROPOSTA COMERCIAL/.test(up) ? 'orcamento' : 'outro';
    out.moeda = /US\$|USD/.test(up) ? 'USD' : /€|EUR\b/.test(up) ? 'EUR' : 'BRL';
    const rec = /RECEBEMOS DE (.+?) OS PRODUTOS/i.exec(all.replace(/\n/g, ' ')) || /(?:FORNECEDOR|RAZ[AÃ]O SOCIAL|EMPRESA)\s*:\s*(.+)/i.exec(all); if (rec) out.fornecedor = rec[1].split('\n')[0].trim();
    if (!out.fornecedor) { const i = linhas.findIndex((l) => /IDENTIFICA[CÇ][AÃ]O DO EMITENTE/i.test(l)); const cand = (i >= 0 ? linhas.slice(i + 1, i + 4) : linhas.slice(0, 6)).find((l) => /[A-Z]{3,}/.test(l) && !/DANFE|DOCUMENTO|NOTA|P[AÁ]GINA|OR[CÇ]AMENTO|COTA[CÇ]|PEDIDO|^\d/i.test(l)); if (cand) out.fornecedor = cand.replace(/\s{2,}.*/, '').trim(); }
    const nn = /N[ºo°]\.?\s*:?\s*([0-9][\w.\-/]*)/i.exec(all) || /(?:OR[CÇ]AMENTO|PEDIDO|COTA[CÇ][AÃ]O)\s*(?:N[ºo°.]*)?\s*:?\s*([A-Z0-9][\w\-/]{2,})/i.exec(all);
    if (nn) out.documento = /^\d{3}\.\d{3}\.\d{3}$/.test(nn[1]) ? nn[1].replace(/\./g, '').replace(/^0+(?=\d)/, '') : nn[1];
    const de = /(?:DATA (?:DA |DE )?EMISS[AÃ]O|EMISS[AÃ]O|DATA)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(all) || /(\d{2}\/\d{2}\/\d{4})/.exec(all); if (de) out.data = dataISO(de[1]);
    const vt = /VALOR TOTAL DA NOTA\s*:?\s*([\d.,]+)/i.exec(all) || /TOTAL GERAL\s*:?\s*R?\$?\s*([\d.,]+)/i.exec(all) || /\bTOTAL\s*:?\s*R\$\s*([\d.,]+)/i.exec(all); if (vt) out.total = numBR(vt[1]);
    const fr = /VALOR DO FRETE\s*:?\s*([\d.,]+)/i.exec(all) || /\bFRETE\s*:?\s*R?\$?\s*([\d.,]+)/i.exec(all); if (fr) out.frete = numBR(fr[1]) || null;
    const cp = /CONDI[CÇ][AÃ]O (?:DE )?PAGAMENTO\s*:?\s*(.+)/i.exec(all); if (cp) out.condicao_pagamento = cp[1].split('\n')[0].trim().slice(0, 80);
    const va = /VALIDADE(?: DA PROPOSTA)?\s*:?\s*(.+)/i.exec(all); if (va) out.validade = va[1].split('\n')[0].trim().slice(0, 40);
    // itens da DANFE: código, descrição, NCM (8 dígitos), CST, CFOP, unidade, quantidade, unitário, total…
    const danfe = /^(\S+)\s+(.+?)\s+(\d{8})\s+(\d{3,4})\s+(\d{4})\s+([A-Za-zÇ²³]{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)((?:\s+[\d.,]+)*)\s*$/;
    let last = null;
    for (const l of linhas) {
      const m = danfe.exec(l);
      if (m) {
        const resto = m[10].trim().split(/\s+/).filter(Boolean).map(numBR); // bc icms, v icms, v ipi, alíq icms, alíq ipi
        const aliqs = resto.filter((v) => v !== null && v > 0 && v <= 30); const ipi = resto.length >= 5 ? resto[resto.length - 1] : 0;
        last = { codigo: m[1], descricao: m[2].trim(), ncm: m[3], unidade: m[6].toUpperCase(), quantidade: numBR(m[7]) || 1, valor_unitario: numBR(m[8]) || 0, ipi_percentual: ipi && ipi <= 30 ? ipi : 0, icms_percentual: aliqs.length ? aliqs[resto.length >= 5 ? aliqs.length - 2 : aliqs.length - 1] || null : null };
        out.itens.push(last); continue;
      }
      // continuação da descrição na linha de baixo (não as linhas de tributo aproximado)
      if (last && !/TRIB\.? APROX|Fed\.?\s*R\$|^\d|^(DADOS|C[AÁ]LCULO|INFORMA|RESERVADO)|VALOR|TOTAL|IMPOSTO|BASE DE|TRANSPORTA|FATURA|DUPLICATA/i.test(l) && l.length < 90 && /[A-Z]{2,}/.test(l) && !/[\d.,]+\s+[\d.,]+\s+[\d.,]+$/.test(l)) { last.descricao += ' ' + l; continue; }
      if (/DADOS ADICIONAIS|C[AÁ]LCULO DO ISSQN/i.test(l)) last = null;
    }
    if (!out.itens.length) {
      // orçamento genérico: linha com descrição e três números em que qtd × unitário ≈ total
      for (const l of linhas) {
        const tk = l.split(' '); const nums = []; for (let i = tk.length - 1; i >= 0 && nums.length < 6; i--) { const t = tk[i].replace(/^R\$/, ''); if (NUM.test(t)) nums.unshift({ i, v: numBR(t) }); else if (nums.length) break; }
        if (nums.length < 3) continue; let hit = null;
        for (let a = 0; a < nums.length - 2 && !hit; a++) for (let b = a + 1; b < nums.length - 1 && !hit; b++) for (let c = b + 1; c < nums.length; c++) { const q = nums[a].v, u = nums[b].v, t = nums[c].v; if (q > 0 && u > 0 && t > 0 && Math.abs(q * u - t) <= Math.max(0.05, t * 0.005)) { hit = { q, u, i: nums[0].i }; break; } }
        if (!hit) continue; let desc = tk.slice(0, hit.i).join(' ').trim(); let cod = null; const c0 = /^([A-Z0-9][\w.\-/]{2,})\s+(.+)$/.exec(desc); if (c0 && /\d/.test(c0[1]) && !/^\d{1,2}$/.test(c0[1])) { cod = c0[1]; desc = c0[2]; } desc = desc.replace(/^\d{1,3}\s+/, '');
        const un = /\s(UN|UND|PC|P[CÇ]|KG|M|MT|CJ|JG|KIT|L|CX|PAR)$/i.exec(desc); if (un) desc = desc.slice(0, un.index);
        if (desc.length >= 3) out.itens.push({ codigo: cod, descricao: desc, ncm: null, unidade: un ? un[1].toUpperCase() : null, quantidade: hit.q, valor_unitario: hit.u, ipi_percentual: 0, icms_percentual: null });
      }
    }
    return out;
  }

  // ---------- Excel / CSV ----------
  async function lerPlanilha(file) {
    let rows = [];
    if (/\.csv$|text\/csv/i.test(file.name + ' ' + file.type)) { const t = await file.text(); const sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ','; rows = t.split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim())); }
    else { await load(CDN.exceljs); const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer()); const ws = wb.worksheets[0]; ws.eachRow((r) => { rows.push((r.values || []).slice(1).map((v) => (v && typeof v === 'object' ? (v.result !== undefined ? v.result : v.text || '') : v === undefined || v === null ? '' : v))); }); }
    const out = vazio(); out.tipo = 'orcamento'; const norm = (s) => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const hi = rows.findIndex((r) => r.some((c) => /DESCRI/.test(norm(c))) && r.some((c) => /QTD|QUANT/.test(norm(c)))); if (hi < 0) return out;
    const H = rows[hi].map(norm); const col = (re) => H.findIndex((h) => re.test(h));
    const cD = col(/DESCRI/), cQ = col(/QTD|QUANT/), cU = col(/UNIT|PRECO UN|VALOR UN|V\. UN/), cC = col(/COD/), cN = col(/NCM/), cUn = col(/^UN|UNID/), cI = col(/IPI/);
    for (const r of rows.slice(hi + 1)) { const d = String(r[cD] || '').trim(); const q = numBR(r[cQ]); const u = cU >= 0 ? numBR(r[cU]) : null; if (!d || !q) continue; out.itens.push({ codigo: cC >= 0 ? String(r[cC] || '') || null : null, descricao: d, ncm: cN >= 0 ? String(r[cN] || '') || null : null, unidade: cUn >= 0 && cUn !== cU ? String(r[cUn] || '') || null : null, quantidade: q, valor_unitario: u || 0, ipi_percentual: cI >= 0 ? (numBR(r[cI]) || 0) * (numBR(r[cI]) < 1 ? 100 : 1) : 0, icms_percentual: null }); }
    return out;
  }

  async function ler(file, onStatus) {
    const nm = (file.name || '').toLowerCase(); const ty = file.type || '';
    if (/\.xml$/.test(nm) || /xml/.test(ty)) { onStatus && onStatus('Lendo o XML da nota…'); const r = lerXml(await file.text()); if (r) return Object.assign(r, { _via: 'xml' }); throw new Error('Esse XML não parece uma NF-e.'); }
    if (/\.(xlsx|csv)$/.test(nm)) { onStatus && onStatus('Lendo a planilha…'); return Object.assign(await lerPlanilha(file), { _via: 'planilha' }); }
    if (/pdf$/.test(ty) || /\.pdf$/.test(nm)) {
      onStatus && onStatus('Lendo o PDF…'); const r = await pdfLinhas(file);
      if (r.linhas.join('').replace(/\s/g, '').length >= 80) return Object.assign(lerTexto(r.linhas), { _via: 'pdf' });
      const imgs = []; for (const pg of r.pages.slice(0, 3)) imgs.push(await pageImage(pg));
      return Object.assign(lerTexto(await ocr(imgs, onStatus)), { _via: 'ocr' });
    }
    if (/^image\//.test(ty)) return Object.assign(lerTexto(await ocr([file], onStatus)), { _via: 'ocr' });
    return Object.assign(lerTexto((await file.text()).split(/\r?\n/)), { _via: 'texto' });
  }
  // texto do documento em linhas (PDF com texto, ou reconhecimento de texto se for escaneado/foto)
  async function linhas(file, onStatus) {
    const nm = (file.name || '').toLowerCase(); const ty = file.type || '';
    if (/pdf$/.test(ty) || /\.pdf$/.test(nm)) {
      onStatus && onStatus('Lendo o PDF…'); const r = await pdfLinhas(file);
      if (r.linhas.join('').replace(/\s/g, '').length >= 80) return r.linhas;
      const imgs = []; for (const pg of r.pages.slice(0, 4)) imgs.push(await pageImage(pg)); return ocr(imgs, onStatus);
    }
    if (/^image\//.test(ty)) return ocr([file], onStatus);
    return (await file.text()).split(/\r?\n/);
  }
  // folha de dados: cada linha do PDF como lista de pedaços (na ordem da página), para separar rótulo e valor
  async function partes(file) {
    if (!/pdf$/i.test(file.type || '') && !/\.pdf$/i.test(file.name || '')) return (await linhas(file)).map((l) => [l]);
    await load(CDN.pdfjs); const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = CDN.pdfworker;
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) {
      const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); const rows = [];
      for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const y = it.transform[5], x = it.transform[4]; let r = rows.find((z) => Math.abs(z.y - y) < 2.5); if (!r) { r = { y, parts: [] }; rows.push(r); } r.parts.push({ x, w: it.width || 0, s: it.str.trim() }); }
      rows.sort((a, b) => b.y - a.y).forEach((r) => { const ps = r.parts.sort((a, b) => a.x - b.x); const L = []; let fim = -1e9;
        for (const q of ps) { if (L.length && q.x - fim < 6) L[L.length - 1] += ' ' + q.s; else L.push(q.s); fim = q.x + q.w; }
        out.push(L.map((x) => x.replace(/\s+/g, ' ').trim())); });
    }
    return out;
  }
  // página de um PDF (ou a própria imagem) como imagem PNG, para pôr a curva da bomba na proposta
  async function paginaImagem(file, n, escala) {
    if (/^image\//.test(file.type || '')) return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res({ url: fr.result, paginas: 1 }); fr.onerror = rej; fr.readAsDataURL(file); });
    await load(CDN.pdfjs); const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = CDN.pdfworker;
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const pg = await pdf.getPage(Math.min(Math.max(1, n || 1), pdf.numPages));
    const vp = pg.getViewport({ scale: escala || 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: g, viewport: vp }).promise;
    return { url: c.toDataURL('image/jpeg', 0.88), paginas: pdf.numPages };
  }
  window.PricerLeitor = { ler, linhas, lerTexto, lerXml, numBR, partes, paginaImagem };
})();
