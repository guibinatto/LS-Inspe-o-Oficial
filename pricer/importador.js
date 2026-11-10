/* LS Pricer — importar uma proposta feita fora do app: a planilha LS PRICER antiga (formação de preço) e os PDFs da
 * proposta técnica e da comercial (textos, condições, código do item). Lógica pura, sem tela: o app lê os arquivos
 * (ExcelJS e pdf.js) e entrega aqui as células e o texto das páginas.
 *
 *  daPlanilha(sheets, model) → { versao, doc, ref, avisos }
 *     sheets = { 'PROPOSTA': { C5: { v, f } }, 'ITEM 01': {...}, GUIA: {...} }   (v = valor; f = true se era fórmula)
 *     doc    = entradas no formato do app ({ PROPOSTA: { C5: … }, 'ITEM 01': { C4: …, D68: … } })
 *     ref    = preços e custos que a planilha calculou (para conferir e, se a pessoa quiser, manter o preço)
 *  dosPdfs(arquivos) → { numero, rev, … , notas, desvios, desviosEsp, exclusoes, observacoes, parcelas, volumes, opcoes }
 *     arquivos = [{ nome, pgs }]  (pgs = saída de PricerLeitor.itensPdf: páginas com itens de texto e posição)
 */
(function () {
  'use strict';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
  const txt = (x) => (x === null || x === undefined ? '' : String(x).trim());
  // número no formato brasileiro ("1.181.732,20", "30%") ou já número
  const nBR = (s) => { if (typeof s === 'number') return s; s = String(s || '').replace(/[R$\s%]/g, ''); if (!s) return null; if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = Number(s); return isFinite(n) ? n : null; };
  const dataISO = (v) => { if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10); const s = txt(v); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return m[3] + '-' + m[2] + '-' + m[1]; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; };
  // família do insumo: a planilha antiga escreve "1.MOTORDIESEL"; o cadastro do app, "01.MOTORDIESEL"
  const famApp = (s) => txt(s).replace(/^(\d)\.(?=\S)/, '0$1.');

  // ---------------- planilha ----------------
  function versaoDe(sheets) { const t = txt(((sheets.GUIA || {}).B1 || {}).v); const m = t.match(/REV\s*(\d+)/i); return m ? +m[1] : null; }
  // célula digitada (não fórmula) e não vazia
  const ent = (S, k) => { const c = (S || {})[k]; if (!c || c.f) return undefined; const v = c.v; if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return undefined; return v; };
  const val = (S, k) => { const c = (S || {})[k]; return c ? c.v : undefined; };

  function daPlanilha(sheets, model) {
    const versao = versaoDe(sheets); const avisos = []; const doc = { PROPOSTA: {} }; const ref = { itens: [], total: 0, custo: 0 };
    const P = sheets.PROPOSTA; if (!P) throw new Error('A planilha não tem a aba PROPOSTA: não parece ser uma LS PRICER.');
    // cabeçalho da proposta: as mesmas células em todas as revisões
    for (const k of ['C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'F5', 'F6', 'F7', 'F8', 'F9', 'J5', 'J6', 'J7', 'J8', 'J9']) { let v = ent(P, k); if (v === undefined) continue; if (k === 'C7') v = dataISO(v); if (k === 'C6') v = String(v); doc.PROPOSTA[k] = v; }
    const antiga = versao !== null && versao <= 12;
    if (!antiga) { importaMesmoLayout(sheets, model, doc, ref, avisos); return { versao, antiga, doc, ref, avisos }; }
    // REV12: frete por item (vai para o frete da proposta), escopo nas linhas 19 a 68 (vai para o escopo à mão, 68 a 112)
    let frete = 0, mod = '', km = null, rkm = null;
    for (let i = 1; i <= 10; i++) {
      const nome = 'ITEM ' + String(i).padStart(2, '0'); const S = sheets[nome]; if (!S) continue;
      const linhas = []; for (let r = 19; r <= 68; r++) if (txt(val(S, 'D' + r))) linhas.push(r);
      if (!linhas.length) continue;
      const D = {}; doc[nome] = D;
      for (const k of ['C4', 'C5', 'C6', 'C7', 'C8', 'G8', 'K7', 'K8', 'C12', 'E12', 'F12', 'G12', 'I12']) { const v = ent(S, k); if (v !== undefined) D[k] = v; }
      // família do equipamento (skid, container, conjunto): a antiga deduzia da família de produto (C75)
      const feq = txt(val(S, 'C75')); if (/^(SKID|CONTAINER|CONJUNTO MOTOBOMBA|ESPECIAL|BOMBA JOCKEY)/i.test(feq)) D.C21 = feq.toUpperCase();
      const qtd = num(val(S, 'C6')) || 1;
      if (!mod && ent(S, 'D11') !== undefined) mod = txt(ent(S, 'D11'));
      const fu = num(val(S, 'K11')); if (fu) frete += fu * qtd; if (km === null && num(ent(S, 'C11'))) km = num(ent(S, 'C11')); if (rkm === null && num(ent(S, 'E11'))) rkm = num(ent(S, 'E11'));
      if (linhas.length > 45) avisos.push(nome + ': a planilha tem ' + linhas.length + ' linhas de escopo; o app aceita 45 à mão. As ' + (linhas.length - 45) + ' últimas ficaram de fora.');
      linhas.slice(0, 45).forEach((r, n) => { const t = 68 + n;
        const b = ent(S, 'B' + r), c = ent(S, 'C' + r), d = txt(val(S, 'D' + r)), e = ent(S, 'E' + r), f = num(val(S, 'F' + r)), o = ent(S, 'I' + r);
        if (b !== undefined) D['B' + t] = txt(b); if (c !== undefined) D['C' + t] = famApp(c); D['D' + t] = d; if (e !== undefined) D['E' + t] = txt(e); if (f !== null) D['F' + t] = f; if (o !== undefined) D['I' + t] = txt(o);
        // custo: o digitado na linha; custo total digitado por cima (sem o unitário) vira unitário; senão, o que a planilha usou
        // (o preço do cadastro dela na época). Assim a formação fica com os custos da proposta, não com os de hoje.
        const g = num(ent(S, 'G' + r)), h = num(ent(S, 'H' + r)), ac = num(val(S, 'AC' + r));
        const u = h !== null && f ? h / f : g !== null ? g : ac; if (u !== null) D['G' + t] = Math.round(u * 1e6) / 1e6;
        if (h !== null && g !== null && f && Math.abs(h / f - g) > 0.005) avisos.push(nome + ', linha ' + (r - 18) + ' (' + d.slice(0, 40) + '): custo total digitado por cima (' + h + ' para ' + f + ' un.) — importado como ' + (Math.round(h / f * 100) / 100) + ' por unidade.'); });
      ref.itens.push({ sheet: nome, qtd, unit: num(val(S, 'B15')), total: num(val(S, 'D15')), semImp: num(val(S, 'P71')), custo: num(val(S, 'H69')), margem: num(val(S, 'J15')), desc: txt(val(S, 'C4')), linhas: Math.min(45, linhas.length) });
    }
    if (mod) doc.PROPOSTA.B13 = mod; if (frete) doc.PROPOSTA.F13 = Math.round(frete * 100) / 100; else { if (km !== null) doc.PROPOSTA.D13 = km; if (rkm !== null) doc.PROPOSTA.E13 = rkm; }
    ref.total = num(val(P, 'K27')); ref.custo = num(val(P, 'L27'));
    if (!ref.itens.length) avisos.push('Nenhum item com escopo preenchido na planilha.');
    return { versao, antiga, doc, ref, avisos };
  }
  // planilha do mesmo layout do app (REV13 em diante): tudo o que foi digitado onde o app tem célula de entrada
  function importaMesmoLayout(sheets, model, doc, ref, avisos) {
    const cells = {}; for (const s of (model && model.sheets) || []) cells[s.name] = s.cells || {};
    const ehForm = (sh, k) => typeof (cells[sh] || {})[k] === 'string' && cells[sh][k][0] === '=';
    for (const sh of ['PROPOSTA'].concat(Array.from({ length: 10 }, (_, i) => 'ITEM ' + String(i + 1).padStart(2, '0')))) {
      const S = sheets[sh]; if (!S) continue; const D = doc[sh] || (doc[sh] = {});
      for (const k of Object.keys(S)) { const v = ent(S, k); if (v === undefined) continue; const m = (cells[sh] || {})[k];
        if (m !== undefined && !ehForm(sh, k) && String(m) === String(v)) continue; // rótulo igual ao do app
        if (m !== undefined && !ehForm(sh, k) && typeof m === 'string' && typeof v === 'string' && /[a-z]{4}/i.test(m)) continue; // texto fixo da tela
        D[k] = k === 'C7' && sh === 'PROPOSTA' ? dataISO(v) : v; }
      if (sh !== 'PROPOSTA') { if (!Object.keys(D).length) { delete doc[sh]; continue; } ref.itens.push({ sheet: sh, qtd: num(val(S, 'C6')) || 1, unit: num(val(S, 'B15')), total: num(val(S, 'D15')), custo: num(val(S, 'H114')), desc: txt(val(S, 'C4')) }); }
    }
    ref.total = num(val(sheets.PROPOSTA, 'B16')); ref.custo = num(val(sheets.PROPOSTA, 'G16'));
    avisos.push('Planilha no layout do app: as células digitadas foram copiadas como estão.');
  }

  // ---------------- PDFs ----------------
  // linhas de cada página: itens na mesma altura juntam; colunas distantes ficam separadas por " | "
  function linhasDe(pgs) {
    const out = [];
    for (const P of pgs || []) {
      // negrito "simulado" (o mesmo texto desenhado duas vezes, deslocado menos de 1 pt) entra uma vez só
      const its0 = (P.itens || []).filter((q) => !q.rot && q.s).map((q) => Object.assign({}, q, { s: String(q.s).normalize('NFC') })).sort((a, b) => a.y - b.y || a.x - b.x); const its = [];
      for (const q of its0) if (!its.some((k) => k.s === q.s && Math.abs(k.x - q.x) < 1.6 && Math.abs(k.y - q.y) < 1.6)) its.push(q);
      const rows = [];
      for (const q of its) { let r = rows.find((z) => Math.abs(z.y - q.y) < Math.max(2, q.h * 0.45)); if (!r) { r = { y: q.y, h: q.h, ps: [] }; rows.push(r); } r.ps.push(q); }
      rows.sort((a, b) => a.y - b.y);
      for (const r of rows) { const ps = r.ps.sort((a, b) => a.x - b.x); let t = '', fim = -1e9; const cols = [];
        for (const q of ps) { if (t && q.x - fim > 18) { cols.push(t); t = q.s; } else t = t ? t + (q.x - fim > 1.2 ? ' ' : '') + q.s : q.s; fim = q.x + q.w; }
        if (t) cols.push(t); out.push({ pag: P.n, y: r.y, h: r.h, x: ps[0].x, t: cols.join(' | ').replace(/\s+/g, ' ').trim(), cols: cols.map((c) => c.replace(/\s+/g, ' ').trim()) }); }
    }
    return out;
  }
  // cabeçalho e rodapé repetidos em toda página do documento LS Fire
  const RUIDO = [/www\.lsfire\.com\.br/i, /^Cliente:.*Data:/i, /^Proposta N[º°o]/i, /^\d{1,3}(\.\d{3})?-Rev\.?\s*\d*$/i, /^\d+\s*\|?\s*Validade:/i, /^Validade:/i, /^\d+$/, /^\d+\/\d+$/];
  const SECOES = /^(CONHE[ÇC]A A LS FIRE|FOLHA DE DADOS|NOTAS,? DESVIOS E OBSERVA[ÇC][ÕO]ES|COMISSIONAMENTO E START-UP|ESCOPO DE DOCUMENTOS|CONTATOS|PLANILHA DE PRE[ÇC]OS|CONDI[ÇC][ÕO]ES|PRAZOS E CONDI[ÇC][ÕO]ES|TERMOS E CONDI[ÇC][ÕO]ES|ESCOPO DE FORNECIMENTO|SOLU[ÇC][ÕO]ES LS FIRE)$/i;
  // junta as linhas de um trecho em parágrafos (quebra quando há espaço maior entre as linhas ou recuo diferente)
  function paragrafos(L) {
    const out = []; let cur = null;
    for (let i = 0; i < L.length; i++) { const l = L[i], p = L[i - 1];
      const perto = p && l.pag === p.pag && l.y - p.y <= Math.max(p.h, l.h) * 1.75;
      // continuação de item numerado: a linha seguinte vem recuada em relação ao número
      const contLista = cur && cur.lista && perto && l.x > cur.x + 2 && !/^(\d+\.|[•·\-–])\s/.test(l.t);
      const novo = !contLista && (!cur || !perto || Math.abs(l.x - p.x) > 6 || /^(\d+\.|[•·\-–])\s/.test(l.t) || /^Item\s+[\d.]+\s+da especifica/i.test(l.t) || /[.:;]$/.test(p.t) && /^[A-ZÀ-Ú0-9]/.test(l.t) && l.y - p.y > Math.max(p.h, l.h) * 1.35 || !/[.:;,]$/.test(p.t) && p.t.length < 45 && /^[A-ZÀ-Ú]/.test(l.t));
      if (novo) { cur = { t: l.t, x: l.x, lista: /^\d+\.\s/.test(l.t) }; out.push(cur); } else cur.t += ' ' + l.t; }
    return out.map((q) => q.t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  const RE_DERAT = /perda de pot[êe]ncia por altitude/i;

  function dosPdfs(arquivos) {
    const r = { tipos: [], itens: [], avisos: [] };
    for (const A of arquivos || []) {
      const L0 = linhasDe(A.pgs); const all = L0.map((l) => l.t).join('\n');
      // tipo pela capa (PROPOSTA TÉCNICA / COMERCIAL / TÉCNICA E COMERCIAL); sem capa, pela planilha de preços
      const capa = all.slice(0, 80).replace(/\s+/g, ' '); const tipo = /^PROPOSTA T[ÉE]CNICA E COMERCIAL/i.test(capa) ? 'tc' : /^PROPOSTA T[ÉE]CNICA/i.test(capa) ? 'tec' : /^PROPOSTA COMERCIAL/i.test(capa) ? 'com' : /PLANILHA DE PRE[ÇC]OS/i.test(all) ? 'tc' : 'tec'; r.tipos.push(tipo);
      const L = L0.filter((l) => !RUIDO.some((re) => re.test(l.t)));
      const busca = (re) => { const m = all.match(re); return m ? m[1].trim() : ''; };
      r.numero = r.numero || busca(/N[úu]mero:\s*([\d.\/ ]+\d)/i); r.rev = r.rev || busca(/Revis[ãa]o:\s*(\d+)/i);
      r.validade = r.validade || busca(/Validade:\s*(\d{2}\/\d{2}\/\d{4})/i); r.data = r.data || busca(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
      r.aosCuidados = r.aosCuidados || busca(/Aos cuidados de:\s*([^\n|]+)/i); r.cidade = r.cidade || busca(/Cidade da obra:\s*([^\n|]+)/i);
      r.obra = r.obra || busca(/Projeto\/Obra:\s*([^\n|]+)/i);
      if (!r.obra) { const i = L0.findIndex((l) => /^Obra\/Projeto:/i.test(l.t)); if (i >= 0 && L0[i + 1]) r.obra = L0[i + 1].cols[0]; }
      if (!r.cliente) { const i = L0.findIndex((l) => /^Cliente:\s*\|?\s*Aos cuidados|^Cliente:$/i.test(l.t)); if (i >= 0 && L0[i + 1]) r.cliente = L0[i + 1].cols[0]; }
      // trechos: do título até o próximo título
      const trecho = (ini, fim) => { const i = L.findIndex((l) => ini.test(l.t)); if (i < 0) return null; let j = L.findIndex((l, k) => k > i && fim.test(l.t)); if (j < 0) j = L.length; return L.slice(i + 1, j).filter((l) => !SECOES.test(l.t)); };
      if (tipo !== 'tec') {
        // planilha de preços: uma linha por item ("1 | 008-00167 | 1 | UN | 3,65% …  R$ x | R$ y") e os dados embaixo
        L.forEach((l, i) => { const m = l.t.replace(/\s*\|\s*/g, ' ').match(/^(\d{1,2})\s+(\S+)\s+([\d.,]+)\s+([A-Z]{1,4})\s+.*?R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)$/); if (!m) return;
          const it = { n: +m[1], codigo: m[2], qtd: nBR(m[3]), un: m[4], unit: nBR(m[5]), total: nBR(m[6]) };
          const mNcm = l.t.match(/(\d{4}\.\d{2}\.\d{2})/); if (mNcm) it.ncm = mNcm[1];
          const ate = L.findIndex((q, k) => k > i && (/^\d{1,2}\s*\|?\s*\S+\s*\|?\s*[\d.,]+\s*\|?\s*[A-Z]{1,4}\b.*R\$/.test(q.t) || /^TOTAL:/i.test(q.t.replace(/^.*\|\s*/, '')) || /TOTAL:\s*\|?\s*R\$/i.test(q.t)));
          const bloco = L.slice(i + 1, ate < 0 ? L.length : ate).map((q) => q.t.replace(/\s*\|\s*/g, ' ')).join('\n');
          const campo = (rot, prox) => { const m2 = bloco.match(new RegExp(rot + '\\s*([\\s\\S]*?)(?=\\n(?:' + prox + ')|$)', 'i')); return m2 ? m2[1].replace(/\s+/g, ' ').trim() : ''; };
          it.breve = campo('Descri[çc][ãa]o breve:', 'Descri[çc][ãa]o completa:|Condi[çc][ãa]o projeto:'); it.completa = campo('Descri[çc][ãa]o completa:', 'Condi[çc][ãa]o projeto:|Vaz[ãa]o nominal');
          it.condicao = campo('Condi[çc][ãa]o projeto:', 'Vaz[ãa]o nominal|Escopo:'); it.vazaoNominal = campo('Vaz[ãa]o nominal da bomba:', 'Escopo:|\\S');
          if (!r.itens.some((q) => q.n === it.n)) r.itens.push(it); });
        const tot = all.match(/TOTAL:\s*\|?\s*R\$\s*([\d.,]+)/i); if (tot) r.total = nBR(tot[1]);
        const cond = trecho(/^Condi[çc][ãa]o de pagamento$/i, /^Nota:|^Prazo/i); if (cond && cond.length) r.pagamento = cond.map((l) => l.t).join(' ');
        r.prazoFab = r.prazoFab || nBR(busca(/Fabrica[çc][ãa]o:\s*(\d+)\s*dias/i)); r.prazoEnt = r.prazoEnt || nBR(busca(/Entrega:\s*(\d+)\s*dias/i));
        const fr = trecho(/^Frete$/i, /^Observa[çc][õo]es$/i); if (fr && fr.length) r.frete = fr.map((l) => l.t).join(' ');
        const ob = trecho(/^Observa[çc][õo]es$/i, /^ATEN[ÇC][ÃA]O:|^Composi[çc][ãa]o do Prazo/i); if (ob) Object.assign(r, observacoes(ob));
      }
      // notas, desvios e exclusões (iguais nas duas): o primeiro arquivo que trouxer fica
      if (!r.notas) { const n = trecho(/^Notas$/i, /^Desvios$/i); if (n) { const ps = paragrafos(n).filter((p) => !/^(NFPA\s*20|NBR\s*\d+|NFPA20)$/i.test(p)); r.notasDerat = ps.some((p) => RE_DERAT.test(p)); r.notas = ps.filter((p) => !RE_DERAT.test(p)).join('\n'); } }
      if (!r.desvios) { const d = trecho(/^Desvios$/i, /^Exclus[õo]es$/i); if (d) { const ps = paragrafos(d); r.desviosEsp = []; const resto = [];
        for (const p of ps) { const m = p.match(/^Item\s+([\d.]+)\s+da especifica[çc][ãa]o t[ée]cnica\s*[,:;\-–]?\s*(.+)$/i); if (m) r.desviosEsp.push({ ref: m[1], texto: m[2].charAt(0).toUpperCase() + m[2].slice(1) }); else resto.push(p); }
        r.desvios = resto.join('\n'); } }
      if (!r.exclusoes) { const e = trecho(/^Exclus[õo]es$/i, /^(O que est[áa] incluso|Comissionamento e Start-up|Entreg[áa]vel|Base de Prazo|À disposi[çc][ãa]o)/i); if (e) r.exclusoes = paragrafos(e).join('\n'); }
    }
    r.tipos = [...new Set(r.tipos)];
    return r;
  }
  // observações da comercial: tabela de parcelas, de volumes e opções de fornecimento saem estruturadas; o resto fica como texto
  function observacoes(L) {
    const out = { parcelas: [], volumes: [], opcoes: [], observacoes: '' }; const resto = [];
    for (let i = 0; i < L.length; i++) {
      const t = L[i].t; const tp = t.replace(/\s*\|\s*/g, ' ');
      if (/^CONDI[ÇC][ÕO]ES DE PAGAMENTO$/i.test(tp)) continue;
      const pz = tp.match(/parcelas ter[ãa]o prazo de pagamento de\s+(.+?),?\s*(?:conforme os marcos abaixo)?\.?$/i); if (pz) { out.parcelasPrazo = pz[1].replace(/\s*\b(\d+\s*DDL)\b.*$/i, '$1').trim(); continue; }
      if (/^Parcela\s+Marco$/i.test(tp)) continue;
      const pc = tp.match(/^(\d{1,3}(?:[.,]\d+)?)\s*%\s+(.+)$/); if (pc) { out.parcelas.push({ pct: nBR(pc[1]), marco: pc[2].trim() }); continue; }
      if (/^DIMENS[ÕO]ES E PESOS/i.test(tp)) continue; if (/^Volume\s+Comprimento/i.test(tp)) continue;
      const vo = tp.match(/^(.+?)\s+([\d.,]+)\s*mm\s+([\d.,]+)\s*mm\s+([\d.,]+)\s*mm\s+([\d.,]+)\s*kg$/i); if (vo) { out.volumes.push({ nome: vo[1].trim(), c: nBR(vo[2]), l: nBR(vo[3]), a: nBR(vo[4]), peso: nBR(vo[5]) }); continue; }
      if (/^OP[ÇC][ÃA]O DE FORNECIMENTO/i.test(tp)) { const op = { titulo: tp.replace(/^OP[ÇC][ÃA]O DE FORNECIMENTO\s*/i, '').trim(), texto: '', valor: 0 }; const T = [];
        for (i++; i < L.length; i++) { const q = L[i].t.replace(/\s*\|\s*/g, ' '); const v = q.match(/resulta em um (abatimento|acr[ée]scimo) de R\$\s*([\d.,]+)/i);
          if (v) { op.valor = (/abat/i.test(v[1]) ? -1 : 1) * nBR(v[2]); break; } if (/^[A-ZÀ-Ú0-9 ,–\-]{12,}$/.test(q) && T.length) { i--; break; } T.push(L[i]); }
        op.texto = paragrafos(T).join('\n'); out.opcoes.push(op); continue; }
      resto.push(L[i]);
    }
    out.observacoes = paragrafos(resto).join('\n');
    return out;
  }

  // ---------------- conferência ----------------
  // compara o que o app calculou com o que a planilha e o PDF dizem
  function conferir(ref, pdf, app) {
    const L = [];
    (ref.itens || []).forEach((it, i) => { const a = (app.itens || [])[i] || {}; const p = ((pdf || {}).itens || [])[i] || {};
      L.push({ item: i + 1, sheet: it.sheet, planilha: it.unit, pdf: p.unit || null, app: a.unit, dif: a.unit != null && it.unit != null ? a.unit - it.unit : null, custoPlan: it.custo, custoApp: a.custo }); });
    return L;
  }

  // proposta pronta: entradas da planilha + textos e dados dos PDFs (os PDFs são o que o cliente recebeu: prevalecem
  // em número, revisão, validade, obra, condição de pagamento, descrições e ponto de trabalho)
  function montar(pl, pdf) {
    const doc = JSON.parse(JSON.stringify((pl && pl.doc) || { PROPOSTA: {} })); const P = doc.PROPOSTA; pdf = pdf || {}; const avisos = [];
    if (pdf.numero) P.C5 = pdf.numero; if (pdf.rev) P.C6 = String(pdf.rev); if (pdf.validade) P.C10 = 'até ' + pdf.validade; if (pdf.data) P.C7 = dataISO(pdf.data);
    if (pdf.cliente && !P.F5) P.F5 = pdf.cliente; if (pdf.obra) P.F6 = pdf.obra;
    if (pdf.pagamento) { if (P.J6 && P.J6 !== pdf.pagamento) avisos.push('Condição de pagamento: a planilha dizia "' + P.J6 + '"; ficou a do PDF, "' + pdf.pagamento + '".'); P.J6 = pdf.pagamento; }
    const fols = ((pl && pl.ref && pl.ref.itens) || []).map((q) => q.sheet); const pc = {}; const codigos = {};
    (pdf.itens || []).forEach((it, i) => { const sh = fols[i] || 'ITEM ' + String(i + 1).padStart(2, '0'); const D = doc[sh] || (doc[sh] = {});
      if (it.codigo) codigos[sh] = it.codigo; if (it.breve) D.C27 = it.breve; // a "descrição breve" do documento é o código do equipamento (C27) if (it.completa) D.C29 = it.completa;
      const c = String(it.condicao || '').match(/([\d.,]+)\s*m³\/h\s*x\s*([\d.,]+)\s*mca/i); if (c) { D.K23 = nBR(c[1]); D.L23 = nBR(c[2]); D.H17 = nBR(c[2]); }
      const vn = String(it.vazaoNominal || '').match(/([\d.,]+)\s*USgpm/i); if (vn) D.G17 = nBR(vn[1]); });
    if (Object.keys(codigos).length) pc.codigos = codigos;
    for (const k of ['aosCuidados', 'cidade', 'prazoFab', 'prazoEnt', 'notas', 'desvios', 'exclusoes', 'observacoes', 'parcelasPrazo']) if (pdf[k] !== undefined && pdf[k] !== null && pdf[k] !== '') pc[k] = pdf[k];
    for (const k of ['parcelas', 'volumes', 'opcoes', 'desviosEsp']) if ((pdf[k] || []).length) pc[k] = pdf[k];
    if (pdf.notasDerat) avisos.push('A nota "A definição do motor diesel considera a perda de potência por altitude…" não foi importada: informe a altitude e a temperatura em Dados gerais para o app calcular e escrever a correção.');
    return { doc, pc, avisos };
  }
  // preço: acha o desconto de negociação (C8) de cada item que leva ao preço unitário com impostos (B15) pedido
  function calibrar(calc, doc, alvos) {
    const d = JSON.parse(JSON.stringify(doc)); const res = {};
    for (const [sh, alvo] of Object.entries(alvos || {})) { if (!(alvo > 0) || !d[sh]) continue;
      const f = (x) => { d[sh].C8 = x; return calc(d).value(sh, 'B15') - alvo; };
      let x0 = Number(d[sh].C8) || 0, x1 = x0 + 0.02, f0 = f(x0), f1 = f(x1), it = 0;
      while (Math.abs(f1) > 0.004 && it++ < 30 && f1 !== f0) { const x2 = x1 - f1 * (x1 - x0) / (f1 - f0); x0 = x1; f0 = f1; x1 = x2; f1 = f(x1); }
      d[sh].C8 = Math.round(x1 * 1e10) / 1e10; res[sh] = { c8: d[sh].C8, erro: f(d[sh].C8) }; }
    return { doc: d, res };
  }
  window.PricerImportador = { montar, calibrar, daPlanilha, dosPdfs, linhasDe, paragrafos, observacoes, conferir, famApp, nBR };
})();
