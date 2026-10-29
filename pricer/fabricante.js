/* LS Pricer — leitura da folha de dados completa do fabricante (ex.: Peerless Express: desempenho, construtiva,
   dados adicionais, curvas, arranjo geral e escopo Qtd/Descrição) a partir do texto posicionado do PDF.
   Nada é inventado: o que não for reconhecido fica de fora e a pessoa confere tudo antes de ir para a proposta.
   A tradução de rótulos e valores usa um dicionário fixo; o resto pode ser traduzido pelo Claude quando disponível. */
(function () {
  'use strict';
  const num = (s) => /^[-+]?[\d.,]+%?$/.test(s) || s === '-' || s === 'N/A';
  // junta pedaços da mesma linha: colados quando o espaço é mínimo (ex.: "DQ6H" "-" "UFAA98")
  function junta(ts) { let out = '', fim = null; for (const t of ts) { out += fim !== null && t.x - fim > 1.2 ? ' ' + t.s : t.s; fim = t.x + t.w; } return out.replace(/\s+/g, ' ').trim(); }
  function linhas(pg) {
    const rows = [];
    for (const it of pg.itens.filter((i) => !i.rot).sort((a, b) => a.y - b.y || a.x - b.x)) { let r = rows.find((z) => Math.abs(z.y - it.y) < 2.6); if (!r) { r = { y: it.y, ts: [] }; rows.push(r); } r.ts.push(it); }
    rows.forEach((r) => r.ts.sort((a, b) => a.x - b.x)); return rows.sort((a, b) => a.y - b.y);
  }
  const RODAPE = /^(Peerless Express|LS Fire Sistemas)|Santa Catarina|Rua Guilherme/i;
  function tituloDe(pg) {
    const cands = pg.itens.filter((i) => i.y < pg.h * 0.16 && i.h >= 11 && !RODAPE.test(i.s)).sort((a, b) => a.y - b.y);
    // título girado na margem (ex.: Sempa: "Technical Data", "Tender Hydraulic", "Dimensional Data")
    if (!cands.length) { const g = pg.itens.filter((i) => i.rot && i.s.length > 3 && !RODAPE.test(i.s)).sort((a, b) => b.s.length - a.s.length)[0]; return g ? { t: g.s, y: -99 } : { t: '', y: -99 }; }
    const y0 = cands[0].y; return { t: junta(cands.filter((i) => Math.abs(i.y - y0) < 3)).replace(/^(.+)\1$/, '$1'), y: y0 };
  }
  // vários "rótulo : valor" lado a lado no mesmo pedaço de coluna (ex.: "Customer :" e "Date : 27/10/2026")
  function pares(ts) {
    const ix = ts.map((t, i) => (/^:/.test(t.s) ? i : -1)).filter((i) => i > 0); if (ix.length < 2) return null;
    const out = []; let ini = 0;
    ix.forEach((i, k) => {
      const prox = ix[k + 1]; let fim = ts.length;
      if (prox !== undefined) { fim = prox - 1; for (let j = i + 1; j < prox; j++) if (ts[j].x - (ts[j - 1].x + ts[j - 1].w) > 30) { fim = j; break; } }
      const v = [Object.assign({}, ts[i], { s: ts[i].s.replace(/^:\s*/, '') })].concat(ts.slice(i + 1, fim)).filter((t) => t.s);
      out.push([junta(ts.slice(ini, i)), junta(v)]); ini = fim;
    });
    return out;
  }
  // rótulo e valor de um pedaço de coluna: pelo ":" ou pelo maior espaço entre pedaços
  function par(ts) {
    // "Rótulo : valor" num pedaço só
    if (ts.length === 1) { const m = ts[0].s.match(/^([^:]{2,60}?)\s+:\s*(.*)$/); if (m) return [m[1].trim(), m[2].trim()]; }
    const i = ts.findIndex((t) => /^:/.test(t.s));
    // ":" sozinho e nada logo depois: campo vazio (o que vem longe já é de outra coluna, ex.: "Customer :      Date")
    if (i > 0 && ts[i].s === ':' && (!ts[i + 1] || ts[i + 1].x - (ts[i].x + ts[i].w) > 40)) return [junta(ts.slice(0, i)), ''];
    if (i > 0) { const v = [Object.assign({}, ts[i], { s: ts[i].s.replace(/^:\s*/, '') })].concat(ts.slice(i + 1)).filter((t) => t.s); return [junta(ts.slice(0, i)), junta(v)]; }
    if (ts.length < 2) return null;
    let g = -1, gi = -1; for (let k = 1; k < ts.length; k++) { const d = ts[k].x - (ts[k - 1].x + ts[k - 1].w); if (d > g) { g = d; gi = k; } }
    return g > 12 ? [junta(ts.slice(0, gi)), junta(ts.slice(gi))] : null;
  }
  // tabela de pontos da curva (Flow | Head | Efficiency | Power | NPSHr), como a da página da curva da Peerless:
  // cabeçalho com os nomes, linha de unidades e linhas só de números; cada coluna é achada pela posição do nome
  const COLS = [['q', /^(flow|vaz)/i], ['h', /^(head|altura|tdh)/i], ['eff', /^(eff|rend)/i], ['p', /^(power|pot)/i], ['npsh', /^npsh/i]];
  const nNum = (t) => { const s = String(t).trim(); if (!/^[-+]?[\d.,]+$/.test(s)) return null; return Number(s.replace(/,/g, '')); };
  function acharPontos(rows, pag) {
    for (let i = 0; i < rows.length; i++) {
      const cab = rows[i].ts; const cols = [];
      for (const t of cab) { const c = COLS.find(([, re]) => re.test(t.s)); if (c && !cols.some((x) => x.k === c[0])) cols.push({ k: c[0], x: t.x + t.w / 2, u: (t.s.match(/\(([^)]+)\)/) || [])[1] || '' }); }
      if (!cols.some((c) => c.k === 'q') || !cols.some((c) => c.k === 'h') || cols.length < 3) continue;
      let j = i + 1;
      if (rows[j] && rows[j].ts.every((t) => /^\(.+\)$/.test(t.s))) { for (const t of rows[j].ts) { const c = cols.reduce((m, c2) => (Math.abs(c2.x - (t.x + t.w / 2)) < Math.abs(m.x - (t.x + t.w / 2)) ? c2 : m), cols[0]); if (Math.abs(c.x - (t.x + t.w / 2)) < 30) c.u = t.s.slice(1, -1); } j++; }
      const pts = [];
      for (; j < rows.length; j++) {
        const ts = rows[j].ts; if (!ts.every((t) => nNum(t.s) !== null || t.s === '-')) break;
        const pt = {}; for (const t of ts) { const c = cols.reduce((m, c2) => (Math.abs(c2.x - (t.x + t.w / 2)) < Math.abs(m.x - (t.x + t.w / 2)) ? c2 : m), cols[0]); if (Math.abs(c.x - (t.x + t.w / 2)) < 45) pt[c.k] = nNum(t.s); }
        if (typeof pt.q === 'number' && typeof pt.h === 'number') pts.push(pt);
      }
      if (pts.length >= 4 && pts.every((p, k) => !k || p.q > pts[k - 1].q)) return { pag, unid: Object.fromEntries(cols.map((c) => [c.k, c.u])), pts };
    }
    return null;
  }
  // sem tabela de pontos (ex.: Sempa): monta a curva de altura com os pontos que a folha informa — shutoff (Q=0),
  // vazão mínima, ponto de trabalho, nominal e máxima, cada um com a sua altura; só vale com 4 pontos ou mais
  function pontosChave(out) {
    const C = []; for (const s of out.secoes || []) for (const c of s.campos || []) C.push(c);
    const nv = (v) => { const m = String(v || '').match(/[-+]?[\d.,]+/); return m ? Number(m[0].replace(/,/g, '')) : NaN; };
    const uQ = (v) => (String(v).match(/m[³3]\s*\/\s*h|USgpm|gpm|l\/s/i) || [])[0]; const uH = (v) => !uQ(v) && /\d\s*(m|ft|mca)\s*$/i.test(String(v).trim()) ? (String(v).trim().match(/(m|ft|mca)$/i) || [])[1] : null;
    const tipo = (k) => (/nominal|rated|nom\.?$/i.test(k) ? 'nom' : /q\s*max|max/i.test(k) ? 'max' : /q\s*min|min/i.test(k) ? 'min' : null);
    const Q = {}, Hh = {}; let unQ = '', unH = '', q0 = null, h0 = null, qT = null, hT = null;
    for (const c of C) {
      const k = String(c.k || ''); const v = c.v; const n = nv(v); if (!isFinite(n)) continue;
      if (uQ(v)) { unQ = unQ || uQ(v); const t = tipo(k); if (t && Q[t] == null) Q[t] = n; else if (/^(flow|vazão|caudal)$/i.test(k.trim()) && qT == null) qT = n; continue; }
      if (uH(v)) { unH = unH || uH(v); if (/q\s*=\s*0|shut|closed/i.test(k)) { h0 = n; continue; } const t = tipo(k); if (t && /head|altura|at\s*q/i.test(k + ' ' + t) && Hh[t] == null && !/static|npsh/i.test(k)) { Hh[t] = n; continue; } if (/^(head|altura)$/i.test(k.trim()) && hT == null) hT = n; }
    }
    const pts = []; if (h0 != null) pts.push({ q: 0, h: h0 });
    for (const t of ['min', 'nom', 'max']) if (Q[t] != null && Hh[t] != null) pts.push({ q: Q[t], h: Hh[t] });
    if (qT != null && hT != null) pts.push({ q: qT, h: hT });
    const L = pts.sort((a, b) => a.q - b.q).filter((p, i, A) => !i || p.q > A[i - 1].q);
    return L.length >= 4 ? { pag: null, chave: true, unid: { q: (unQ || '').replace(/m3/i, 'm³'), h: unH || 'm' }, pts: L } : null;
  }
  // curva desenhada em vetor (ex.: Sempa): os números dos eixos dão a escala de cada painel (altura, rendimento,
  // potência, NPSH) e do eixo de vazão; a curva do rotor escolhido é o traço contínuo colorido de cada painel.
  // As curvas tracejadas do painel de altura (outros diâmetros) vêm junto, com o diâmetro escrito na ponta.
  // Só sai resultado quando a escala fecha (3 números ou mais em cada eixo, alinhados com a grade).
  function curvasVetor(pg) {
    const V = pg.vet || []; if (V.length < 8) return null;
    const nr = (s) => (/^-?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : null);
    // grade: as linhas retas do traço mais comum (as linhas de referência do ponto de trabalho ficam de fora)
    const retas = []; for (const v of V) if (v.p.length === 2) { const [a, b] = v.p; const ch = v.c.join(',') + '|' + v.w + '|' + v.d; if (Math.abs(a[1] - b[1]) < 0.4 && Math.abs(a[0] - b[0]) > 60) retas.push({ o: 'h', z: a[1], ch }); else if (Math.abs(a[0] - b[0]) < 0.4 && Math.abs(a[1] - b[1]) > 40) retas.push({ o: 'v', z: a[0], ch }); }
    const cont = {}; for (const r of retas) cont[r.ch] = (cont[r.ch] || 0) + 1; const chG = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
    const hz = retas.filter((r) => r.o === 'h' && r.ch === chG).map((r) => r.z), vt = retas.filter((r) => r.o === 'v' && r.ch === chG).map((r) => r.z);
    const snap = (val, L, tol) => { let m = null; for (const z of L) if (Math.abs(z - val) <= tol && (m === null || Math.abs(z - val) < Math.abs(m - val))) m = z; return m === null ? val : m; };
    const its = pg.itens.filter((i) => !i.rot);
    // eixo y: números alinhados à direita numa coluna à esquerda do gráfico
    const nums = its.filter((i) => nr(i.s) !== null); const porBorda = {};
    for (const i of nums) { const k = Math.round((i.x + i.w) / 2); (porBorda[k] = porBorda[k] || []).push(i); }
    const col = Object.values(porBorda).sort((a, b) => b.length - a.length)[0]; if (!col || col.length < 6) return null;
    const xEixo = Math.max(...col.map((i) => i.x + i.w));
    const ticks = col.slice().sort((a, b) => a.y - b.y).map((i) => ({ v: nr(i.s), y: snap(i.y - i.h * 0.35, hz, 3.5) }));
    const grupos = []; for (const t of ticks) { const g = grupos[grupos.length - 1]; if (g && t.v < g[g.length - 1].v) g.push(t); else grupos.push([t]); }
    // eixo x: a linha de números crescentes logo abaixo dos painéis
    const linhasX = {}; for (const i of nums) if (i.x > xEixo) { const k = Math.round(i.y); (linhasX[k] = linhasX[k] || []).push(i); }
    const rx = Object.values(linhasX).filter((L) => L.length >= 4).map((L) => L.sort((a, b) => a.x - b.x)).filter((L) => L.every((i, k) => !k || nr(i.s) > nr(L[k - 1].s))).sort((a, b) => b.length - a.length)[0];
    if (!rx) return null;
    // reta pelos números do eixo, tirando no máximo um número fora da linha
    const ajusta = (P) => { const r = ajusta0(P); if (r.err === 0 || P.length < 4) return r; let pior = -1, e = -1; P.forEach(([x, y], i) => { const d = Math.abs(r.a * x + r.b - y); if (d > e) { e = d; pior = i; } }); const r2 = ajusta0(P.filter((_, i) => i !== pior)); return r2.err < r.err / 3 ? r2 : r; };
    const ajusta0 = (P) => { const n = P.length, mx = P.reduce((s, p) => s + p[0], 0) / n, my = P.reduce((s, p) => s + p[1], 0) / n; let sxx = 0, sxy = 0; for (const [x, y] of P) { sxx += (x - mx) * (x - mx); sxy += (x - mx) * (y - my); } const a = sxy / sxx; const b = my - a * mx; const err = Math.max(...P.map(([x, y]) => Math.abs(a * x + b - y))); return { a, b, err }; };
    const fx = ajusta(rx.map((i) => [snap(i.x + i.w / 2, vt, 3.5), nr(i.s)])); const passoX = Math.abs(nr(rx[1].s) - nr(rx[0].s)); if (!(fx.a > 0) || fx.err > passoX * 0.06) return null;
    const textoLinha = (y0, y1) => its.filter((i) => i.y >= y0 && i.y <= y1 && i.x >= xEixo - 2 && i.x < xEixo + 160 && /[A-Za-z%η]/.test(i.s)).sort((a, b) => a.y - b.y || a.x - b.x);
    const paineis = [];
    for (const g of grupos) {
      if (g.length < 3) continue; const f = ajusta(g.map((t) => [t.y, t.v])); const passo = Math.abs(g[0].v - g[1].v); if (!(f.a < 0) || f.err > passo * 0.08) continue;
      const yTop = g[0].y, yBot = g[g.length - 1].y; const tt = textoLinha(yTop - 16, yTop + 14); const rot = tt.length ? tt.filter((i) => Math.abs(i.y - tt[0].y) < 3).map((i) => i.s).join(' ') : '';
      const k = /npsh/i.test(rot) ? 'npsh' : /%|eff|rend|η/i.test(rot) || /^h\b/.test(rot) ? 'eff' : /^H\b|head|altura|tdh|förder/i.test(rot) ? 'h' : /^P\b|power|pot|kw|hp\b/i.test(rot) ? 'p' : null;
      paineis.push({ k, rot, u: (rot.match(/[\[(]\s*([^\])]+?)\s*[\])]/) || [])[1] || '', yTop, yBot, f });
    }
    if (!paineis.length) return null;
    paineis.forEach((p, i) => { if (!p.k) p.k = ['h', 'eff', 'p', 'npsh'][i] || null; });
    const ph = paineis.find((p) => p.k === 'h'); if (!ph) return null;
    const q = (x) => fx.a * x + fx.b; const arr = (v) => Math.round(Math.max(0, v) * 100) / 100;
    const painelDe = (pts) => { const ys = pts.map((p) => p[1]).sort((a, b) => a - b); const ym = ys[Math.floor(ys.length / 2)]; return paineis.find((p) => ym >= p.yTop - 3 && ym <= p.yBot + 3); };
    const colorido = (c) => Math.max(...c) - Math.min(...c) > 40;
    const series = {}, outros = [];
    const cands = V.filter((v) => v.p.length >= 3 && v.p[0][0] >= xEixo - 1 && v.p.every((p, i) => !i || p[0] >= v.p[i - 1][0] - 0.2));
    for (const pn of paineis) {
      const meus = cands.filter((v) => painelDe(v.p) === pn);
      let sol = meus.filter((v) => !v.d && colorido(v.c)); if (!sol.length) { const wmax = Math.max(0, ...meus.filter((v) => !v.d).map((v) => v.w)); sol = meus.filter((v) => !v.d && v.w === wmax && wmax > 0.6); }
      sol.sort((a, b) => a.p[0][0] - b.p[0][0]); const cad = [];
      for (const v of sol) { const fim = cad[cad.length - 1]; if (fim && v.p[0][0] < fim[0] - 1) continue; if (fim && Math.abs(v.p[0][1] - fim[1]) > (pn.yBot - pn.yTop) * 0.06) continue; for (const p of v.p) if (!cad.length || p[0] > cad[cad.length - 1][0] + 0.05) cad.push(p); }
      if (cad.length >= 4) series[pn.k] = cad.map((p) => [q(p[0]), pn.f.a * p[1] + pn.f.b]);
      if (pn.k === 'h') {
        // cada tracejado fica com o diâmetro escrito mais perto da sua ponta (um para um)
        const tr = meus.filter((x) => x.d); const lbs = its.filter((i) => /^\d{2,4}[.,]\d+$/.test(i.s) && i.y > pn.yTop - 8 && i.y < pn.yBot + 8); const pares = [];
        tr.forEach((v, a) => { const fim = v.p[v.p.length - 1]; lbs.forEach((i, b) => { const dy = Math.abs(i.y - i.h * 0.35 - fim[1]), dx = i.x - fim[0]; if (dy < 12 && dx > -8 && dx < 40) pares.push([dy + Math.abs(dx) * 0.2, a, b]); }); });
        const usA = new Set(), usB = new Set(); for (const [, a, b] of pares.sort((x, y) => x[0] - y[0])) { if (usA.has(a) || usB.has(b)) continue; usA.add(a); usB.add(b); outros.push({ rot: lbs[b].s, pts: tr[a].p.map((p) => ({ q: arr(q(p[0])), h: arr(pn.f.a * p[1] + pn.f.b) })) }); }
      }
    }
    if (!series.h) return null;
    const interp = (S, x) => { if (!S || x < S[0][0] - 1e-6 || x > S[S.length - 1][0] + 1e-6) return undefined; let i = 0; while (i < S.length - 2 && x > S[i + 1][0]) i++; const [x0, y0] = S[i], [x1, y1] = S[i + 1]; return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); };
    const pts = series.h.map(([qq, h]) => { const o = { q: arr(Math.max(0, qq)), h: arr(h) }; for (const k of ['eff', 'p', 'npsh']) { const v = interp(series[k], qq); if (v !== undefined) o[k] = arr(v); } return o; }).filter((p, i, A) => !i || p.q > A[i - 1].q);
    const tq = its.find((i) => /^Q\s*[\[(]/.test(i.s) || /^(Flow|Vazão|Caudal)\s*[\[(]/i.test(i.s)); const uq = tq ? (tq.s.match(/[\[(]\s*([^\])]+?)\s*[\])]/) || [])[1] : '';
    const unid = { q: (uq || '').replace(/m3/i, 'm³') }; for (const pn of paineis) if (pn.u) unid[pn.k] = pn.u;
    return { pag: pg.n, vetor: true, unid, pts, outros: outros.sort((a, b) => parseFloat(b.rot) - parseFloat(a.rot)) };
  }
  function ler(paginas) {
    const out = { fabricante: '', paginas: [], secoes: [], tabelas: [], escopo: [] };
    const todo = paginas.map((p) => p.itens.map((i) => i.s).join(' ')).join(' ');
    // fabricante: o nome conhecido que mais aparece no documento
    const FABS = ['Peerless', 'Sempa', 'KSB', 'Grundfos', 'Patterson', 'Aurora', 'Ruhrpumpen', 'Flowserve', 'Imbil', 'Schneider', 'WEG', 'Mark', 'Clarke', 'Cummins', 'Tornatech', 'Metron', 'Firetrol', 'Xylem', 'Armstrong', 'SPP', 'Pentair', 'Fairbanks'];
    out.fabricante = FABS.map((f) => [f, (todo.match(new RegExp('\\b' + f + '\\b', 'gi')) || []).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1] || (a[0] === 'Clarke' ? 1 : -1))[0]?.[0] || '';
    const vistos = new Set(); let identOk = false;
    const sec = (t, n) => { let s = out.secoes.find((x) => x.t === t); if (!s) { s = { t, pag: n, campos: [] }; out.secoes.push(s); } return s; };
    for (const pg of paginas) {
      const T0 = tituloDe(pg); const tit = T0.t;
      // corta o gráfico que algumas folhas trazem embaixo dos dados (começa no aviso de aceitação do teste)
      const todas = linhas(pg).filter((r) => r.y > pg.h * 0.035 && r.y < pg.h - 36 && !RODAPE.test(junta(r.ts)));
      const ehEscopo = todas.some((r) => r.ts.length >= 2 && r.ts[0].s === 'Qty' && /^Description/.test(r.ts[1].s));
      const rows = ehEscopo ? todas : todas.filter((r) => Math.abs(r.y - T0.y) > 3);
      const corte = (rows.find((r) => /Performance based on test|rated point is the only/i.test(junta(r.ts))) || {}).y || 1e9;
      const txt = rows.map((r) => junta(r.ts)).join('\n');
      const escopo = ehEscopo;
      const txtPg = pg.itens.map((i) => i.s).join(' ');
      const nPares = rows.filter((r) => r.ts.some((t) => /^:/.test(t.s))).length;
      const eixos = /\bQ\s*\[|\bH\s*\[\s*m|\[\s*m[³3]\s*\/\s*h\s*\]|Flow\s*-\s*US|NPSH\s*\[|\bP\s*\[\s*kW|\bQ\s*\(\s*(m[³3]|l\/s|gpm|US)|\bH\s*\(\s*(m|ft)\s*\)|NPSH\s*\(\s*(m|ft)\s*\)/i.test(txtPg);
      const curva = /Curve|Curva|Kennlinie|Characteristic|Hydraulic/i.test(tit) || (eixos && nPares < 10 && pg.itens.length < 220);
      const desenho = /Arrangement|Dimension|Drawing/i.test(tit) || (!tit && pg.itens.length < 120 && !/:/.test(txt));
      const tipo = escopo ? 'escopo' : curva ? 'curva' : desenho ? 'desenho' : 'dados';
      if (!out.pontos) out.pontos = acharPontos(rows, pg.n);
      // curva em vetor: lida em toda página de curva (a pessoa escolhe a página; a primeira lida é a padrão)
      if (curva && pg.vet) { const cv = curvasVetor(pg); if (cv) { (out.pontosPag = out.pontosPag || {})[pg.n] = cv; if (!out.pontos) out.pontos = cv; } }
      const P = { n: pg.n, titulo: tit || (desenho ? 'Desenho' : 'Página ' + pg.n), tipo, w: pg.w, h: pg.h };
      if (curva) {
        // área do gráfico: abaixo do aviso do fabricante até o eixo de vazão
        const ax = pg.itens.filter((i) => ((i.s === 'Flow' || /^Flow\s*-/.test(i.s)) && i.h >= 8.5) || /^Q\s*[\[(]/.test(i.s)).sort((a, b) => b.y - a.y)[0];
        const yH = pg.itens.filter((i) => /^H\s*[\[(]/.test(i.s)).sort((a, b) => a.y - b.y)[0];
        const yNx = ax ? Math.max(ax.y, ...pg.itens.filter((i) => i.y > ax.y && i.y < ax.y + 22 && /^\d+$/.test(i.s)).map((i) => i.y)) : 0;
        const tabY = ax ? (pg.itens.filter((i) => i.y > ax.y + 2 && /^(Customer|Project name|Tag Number)$/.test(i.s)).sort((a, b) => a.y - b.y)[0] || {}).y : null;
        const aviso = pg.itens.filter((i) => /buyer\.?$|tolerance\.?$|Hyd Inst/i.test(i.s) && (!ax || i.y < ax.y)).sort((a, b) => b.y - a.y)[0];
        const y0 = aviso ? aviso.y + 4 : yH ? yH.y - 16 : (pg.itens.find((i) => i.s === tit) || { y: 60 }).y + 10; const y1 = ax ? Math.min(yNx + 7, tabY ? tabY - 9 : 1e9) : pg.h * 0.62;
        P.caixa = { x: 14, y: y0, w: pg.w - 28, h: Math.max(80, y1 - y0) };
      }
      out.paginas.push(P); const dadosAte = tipo === 'dados' ? corte : 1e9;
      // página de curva: os quadros de dados embaixo do gráfico (ex.: Sempa, 3 colunas com título) entram como seções
      if (tipo === 'curva' && P.caixa) {
        const baixo = rows.filter((r) => r.y > P.caixa.y + P.caixa.h - 4 || r.y < P.caixa.y - 2); let cols = null, nomes = null;
        for (const r of baixo) {
          const semDois = !r.ts.some((t) => /:/.test(t.s));
          if (semDois && r.ts.length >= 2 && r.ts.every((t) => /^[A-Z][A-Za-z ()/.-]{2,40}$/.test(t.s))) { cols = r.ts.map((t) => t.x - 2); nomes = r.ts.map((t) => t.s); continue; }
          if (!cols) continue;
          const grupos = cols.map(() => []); for (const t of r.ts) { let ci = 0; for (let k = 0; k < cols.length; k++) if (t.x >= cols[k]) ci = k; grupos[ci].push(t); }
          if (grupos.filter((g) => g.length).length === 1 && grupos[0].length && !par(grupos[0])) { cols = null; continue; }
          grupos.forEach((g, k) => { if (!g.length) return; const pp = par(g); if (!pp || !pp[1]) return; const chave = nomes[k] + '|' + pp[0] + '|' + pp[1]; if (vistos.has(chave)) return; vistos.add(chave); sec(nomes[k], pg.n).campos.push({ k: pp[0], v: pp[1], on: true }); });
        }
      }
      if (tipo === 'escopo') {
        let g = null, emTab = false;
        for (const r of rows) {
          const t0 = r.ts[0]; const big = t0.h >= 12 && t0.x < pg.w * 0.2 && r.ts.length === 1;
          if (big) { const nome = t0.s; g = out.escopo.find((x) => x.g === nome && x === out.escopo[out.escopo.length - 1]) || null; if (!g) { g = { g: nome, linhas: [] }; out.escopo.push(g); } emTab = false; continue; }
          if (r.ts[0].s === 'Qty') { emTab = true; continue; }
          if (!g || !emTab) { const pp = par(r.ts.filter((t) => t.x < pg.w / 2)); const pq = par(r.ts.filter((t) => t.x >= pg.w / 2));
            for (const x of [pp, pq]) if (x && x[1] && !vistos.has(x[0] + '|' + x[1])) { vistos.add(x[0] + '|' + x[1]); sec('Project', pg.n).campos.push({ k: x[0], v: x[1], on: false }); } continue; }
          const qtd = r.ts[0].x < 60 && /^\d+$/.test(r.ts[0].s) ? r.ts[0].s : '';
          const ds = r.ts.filter((t) => t.x >= 60); if (!ds.length) continue;
          const nivel = Math.max(0, Math.round((ds[0].x - 65.8) / 2.9));
          g.linhas.push({ q: qtd, n: nivel, t: junta(ds) });
        }
        continue;
      }
      if (tipo !== 'dados') continue;
      // tabelas numéricas (desempenho por vazão, dados de desempenho): linhas com 4 ou mais pedaços espalhados
      const meio = pg.w / 2; const secAtual = { e: null, d: null }; let tab = null; let ultimo = { e: null, d: null }; let ident = true;
      // tamanho da letra do corpo (dos valores ": …"): título de seção maior que ele vale mesmo com outro título ao lado
      const hs = {}; for (const r of rows) for (const t of r.ts) if (/^:/.test(t.s)) hs[t.h.toFixed(1)] = (hs[t.h.toFixed(1)] || 0) + 1;
      const corpo = Number(Object.keys(hs).sort((a, b) => hs[b] - hs[a])[0] || 0);
      const ladoDe = (r, lado) => r.ts.filter((t) => (lado === 'e' ? t.x < meio - 4 : t.x >= meio - 4));
      const colX = { e: 1e9, d: 1e9 }; for (const r of rows) for (const lado of ['e', 'd']) { const ts = ladoDe(r, lado); if (ts.length >= 2 && ts.some((t) => /^:/.test(t.s))) colX[lado] = Math.min(colX[lado], ts[0].x); }
      // rótulos de grupo (ex.: Sempa: "Flow" com "Nominal / Max. / Min." e "Impeller D" com "Max. / Designed / Min."): o nome do
      // grupo fica numa linha só e vale para as linhas vizinhas recuadas na mesma posição
      const rotulos = (r, lado) => { const ts = ladoDe(r, lado); const i = ts.findIndex((t) => /^:/.test(t.s)); return i > 0 ? ts.slice(0, i) : []; };
      const grupoDe = (ri, lado) => {
        const L = rotulos(rows[ri], lado); if (L.length !== 1 || L[0].x - colX[lado] < 25) return '';
        const xs = L[0].x; let best = null;
        for (const dir of [-1, 1]) for (let k = ri + dir, n = 1; k >= 0 && k < rows.length && n <= 3; k += dir, n++) {
          const M = rotulos(rows[k], lado); if (M.length >= 2 && Math.abs(M[M.length - 1].x - xs) < 3 && Math.abs(M[0].x - colX[lado]) < 3) { if (!best || n < best.n) best = { n, g: junta(M.slice(0, -1)) }; break; }
          if (!(M.length === 1 && Math.abs(M[0].x - xs) < 3)) break;
        }
        return best ? best.g : '';
      };
      const temParAbaixo = (ri, lado) => { for (let k = ri + 1; k < Math.min(rows.length, ri + 3); k++) { const ts = rows[k].ts.filter((t) => (lado === 'e' ? t.x < meio - 4 : t.x >= meio - 4)); if (ts.some((t) => /^:/.test(t.s) || /\S\s+:\s/.test(t.s))) return true; if (ts.length) return false; } return false; };
      for (let ri = 0; ri < rows.length; ri++) { const r = rows[ri];
        if (r.y >= dadosAte - 2) break;
        if (r.ts.some((t) => /^@/.test(t.s))) continue;
        const ehTab = r.ts.length >= 4 && r.ts.filter((t) => num(t.s)).length >= 3 && !r.ts.some((t) => /^:/.test(t.s));
        if (ehTab) {
          if (!tab) { tab = { t: '', pag: pg.n, cab: [], linhas: [] }; out.tabelas.push(tab); }
          const nums = r.ts.filter((t) => num(t.s)); const rot = junta(r.ts.filter((t) => !num(t.s) && t.x < nums[0].x));
          tab.linhas.push([rot].concat(nums.map((t) => t.s))); continue;
        }
        // cabeçalho de tabela (Flow (USgpm) Head (m) ...) ou título dela
        if (r.ts.length >= 4 && (junta(r.ts).match(/\((USgpm|m3\/h|m³\/h|m|%|ft|hp|kW|psi[.ag]*|bar)\)/g) || []).length >= 2) { tab = { t: '', pag: pg.n, cab: r.ts.map((t) => t.s), linhas: [] }; out.tabelas.push(tab); continue; }
        if (tab && r.ts.length >= 3 && !r.ts.some((t) => /^:/.test(t.s)) && tab.linhas.length) tab = null;
        // linha do modelo selecionado (ex.: Sempa "SCE 200-500 1800 rpm / 568 m³/h / 106 m / …"): vira o modelo da identificação
        if (r.ts.length === 1 && /\d\s*rpm\b/i.test(r.ts[0].s) && (r.ts[0].s.match(/\//g) || []).length >= 2) {
          if (!out.selecao) { out.selecao = r.ts[0].s; const m = r.ts[0].s.split(/\s+\d+\s*rpm/i)[0].trim(); if (m) sec('Project', pg.n).campos.push({ k: 'Model', v: m, on: false }); }
          continue;
        }
        for (const lado of ['e', 'd']) {
          const ts = r.ts.filter((t) => (lado === 'e' ? t.x < meio - 4 : t.x >= meio - 4)); if (!ts.length) continue;
          const x0 = lado === 'e' ? 30 : meio; const x1 = lado === 'e' ? meio : pg.w - 30; let p = par(ts);
          const vp = pares(ts);
          if (vp) { const s0 = secAtual[lado] || (ident ? 'Project' : ''); if (!s0 || (s0 === 'Project' && identOk && pg.n !== out.secoes.find((x) => x.t === 'Project')?.pag)) continue;
            for (const [k, v] of vp) { if (!k || !v || vistos.has(s0 + '|' + k + '|' + v)) continue; vistos.add(s0 + '|' + k + '|' + v); sec(s0, pg.n).campos.push({ k, v, on: s0 !== 'Project' }); } ultimo[lado] = null; continue; }
          if (p) { const g = grupoDe(ri, lado); if (g) p = [g + ' ' + p[0], p[1]]; }
          const grande = !p && corpo && ts.length === 1 && ts[0].h >= corpo + 0.6 && /^[A-Z][A-Za-z][A-Za-z /&()-]{1,40}$/.test(ts[0].s) && ts[0].x - x0 < 40 && temParAbaixo(ri, lado);
          const centro = ts.length === 1 ? Math.abs(ts[0].x + ts[0].w / 2 - (x0 + x1) / 2) : 99;
          const cont = ultimo[lado] && /\s(a|de|do|da|e|and|of|the|with|for)$|[-,/]$/.test(ultimo[lado].v || ultimo[lado].k);
          const esq = !p && ts.length === 1 && /^[A-Z][A-Za-z][A-Za-z /&()-]{1,40}$/.test(ts[0].s) && ts[0].x - x0 < 40 && (r.ts.length === 1 || lado === 'd' || r.ts.filter((t) => t.x >= meio - 4).length === 0) && temParAbaixo(ri, lado);
          if ((!p && !cont && ts.length === 1 && centro < 16 && ts[0].x - x0 > 40 && !/^:/.test(ts[0].s) && !num(ts[0].s)) || esq || grande) {
            const nome = ts[0].s; if (tab && !tab.linhas.length) tab.t = nome; else { secAtual[lado] = nome; if ((esq || grande) && r.ts.length === 1) { secAtual.e = nome; secAtual.d = nome; ultimo.e = null; ultimo.d = null; } ident = false; } ultimo[lado] = null; continue; }
          const s = secAtual[lado] || (ident ? 'Project' : '');
          if (!p) {
            if (ts.length !== 1 || /^:/.test(ts[0].s)) continue; const naColunaRot = ts[0].x - x0 < 40; const c = ultimo[lado];
            // rótulo em duas linhas ("Direction of Rotation (viewed from" / "drive end)") e valor na linha do meio
            if (c && c.v === '' && !naColunaRot) { c.v = ts[0].s; c.on = s !== 'Project'; }
            else if (c && naColunaRot && c.pend) c.k = (c.k + ' ' + ts[0].s).trim();
            else if (c && !naColunaRot && !c.pend) c.v = (c.v + ' ' + ts[0].s).trim();
            else if (naColunaRot && s && !num(ts[0].s)) { const n = { k: ts[0].s, v: '', on: false, pend: true }; sec(s, pg.n).campos.push(n); ultimo[lado] = n; }
            continue;
          }
          if (/^@/.test(p[0]) || (/^[a-z]/.test(p[0]) && !/\d/.test(p[1])) || (num(p[0]) && num(p[1]))) continue;
          if (!s || (s === 'Project' && identOk && pg.n !== out.secoes.find((x) => x.t === 'Project')?.pag)) { ultimo[lado] = { k: p[0], v: p[1] }; continue; }
          const chave = s + '|' + p[0] + '|' + p[1]; if (vistos.has(chave)) { ultimo[lado] = null; continue; } vistos.add(chave);
          const c = { k: p[0], v: p[1], on: s !== 'Project' && p[1] !== '' && p[1] !== '-' }; sec(s, pg.n).campos.push(c); ultimo[lado] = c;
        }
      }
      if (out.secoes.some((x) => x.t === 'Project')) identOk = true;
    }
    for (const s of out.secoes) s.campos = s.campos.filter((c) => c.k && (s.t !== 'Project' || String(c.v || '').trim())).map((c) => { delete c.pend; return c; });
    if (!out.pontos) out.pontos = pontosChave(out);
    out.secoes = out.secoes.filter((s) => s.campos.length);
    for (const P of out.paginas) if (P.tipo === 'dados' && !out.secoes.some((s) => s.pag === P.n)) P.tipo = 'anexo';
    out.tabelas = out.tabelas.filter((t) => t.linhas.length >= 2);
    return out;
  }

  // ---------- tradução fixa dos rótulos mais comuns (Peerless e afins) ----------
  const SEC = {
    'Operating Conditions': ['Condições de operação', 'Condiciones de operación'], Liquid: ['Líquido', 'Líquido'], 'NFPA Limits': ['Limites NFPA', 'Límites NFPA'],
    Material: ['Material', 'Material'], 'Pressure Data': ['Dados de pressão', 'Datos de presión'], Construction: ['Construção', 'Construcción'], Materials: ['Materiais', 'Materiales'],
    'Listings and Approvals': ['Listagens e aprovações', 'Listados y aprobaciones'], 'Engine Information': ['Motor', 'Motor'], 'Additional information': ['Informações adicionais', 'Información adicional'],
    Testing: ['Testes', 'Pruebas'], 'Approximate Weights': ['Pesos aproximados', 'Pesos aproximados'], 'Performance Data': ['Dados de desempenho', 'Datos de desempeño'],
    'Stage, Speed and Solids Limits': ['Limites de estágios, rotação e sólidos', 'Límites de etapas, velocidad y sólidos'], 'Mechanical Limits': ['Limites mecânicos', 'Límites mecánicos'],
    'Typical Driver Data': ['Dados típicos do acionador', 'Datos típicos del accionador'], 'Various Performance Data': ['Dados de desempenho', 'Datos de desempeño'], Project: ['Identificação', 'Identificación'],
    'Operation Data': ['Dados de operação', 'Datos de operación'], 'Operating Data Specification': ['Especificação de operação', 'Especificación de operación'], 'Hydraulic Data (Duty Point)': ['Dados hidráulicos (ponto de trabalho)', 'Datos hidráulicos (punto de trabajo)'], 'Impeller Design': ['Rotor', 'Impulsor'], Performance: ['Desempenho', 'Desempeño'], 'Pump Data': ['Dados da bomba', 'Datos de la bomba'], 'Pump Material': ['Materiais da bomba', 'Materiales de la bomba'], 'Shaft Seal': ['Vedação do eixo', 'Sello del eje'], 'Technical Data': ['Dados técnicos', 'Datos técnicos'],
    'Motor Data': ['Dados do motor', 'Datos del motor'], Coupling: ['Acoplamento', 'Acoplamiento'], 'Hydraulic Data': ['Dados hidráulicos', 'Datos hidráulicos'], 'Dimensional Data': ['Dimensões', 'Dimensiones'],
    Pump: ['Bomba', 'Bomba'], Driver: ['Acionador', 'Accionador'], Controller: ['Painel de comando', 'Tablero de control'], Accessories: ['Acessórios', 'Accesorios'],
  };
  const ROT = {
    Customer: ['Cliente', 'Cliente'], 'Customer ref. / PO': ['Referência / pedido', 'Referencia / pedido'], 'Tag Number': ['Tag', 'Tag'], Service: ['Serviço', 'Servicio'], Quantity: ['Quantidade', 'Cantidad'],
    'Quote Number / ID': ['Cotação do fabricante', 'Cotización del fabricante'], 'Peerless Model': ['Modelo', 'Modelo'], 'Pump Model': ['Modelo da bomba', 'Modelo de la bomba'], Model: ['Modelo', 'Modelo'], Stages: ['Estágios', 'Etapas'],
    'Based on curve number': ['Curva de referência', 'Curva de referencia'], 'Date last saved': ['Data da seleção', 'Fecha de la selección'], 'Project name': ['Projeto', 'Proyecto'],
    'Flow, rated': ['Vazão nominal', 'Caudal nominal'], 'Differential head / pressure, rated (requested)': ['Altura diferencial nominal (pedida)', 'Altura diferencial nominal (solicitada)'],
    'Differential head / pressure, rated (actual)': ['Altura diferencial nominal (real)', 'Altura diferencial nominal (real)'], 'Differential head / pressure, rated': ['Altura diferencial nominal', 'Altura diferencial nominal'],
    'Suction pressure, rated / max': ['Pressão de sucção nominal / máx.', 'Presión de succión nominal / máx.'], 'NPSH available, rated': ['NPSH disponível', 'NPSH disponible'], 'Site Supply Frequency': ['Frequência da rede', 'Frecuencia de la red'],
    'Speed, rated': ['Rotação nominal', 'Velocidad nominal'], 'Impeller diameter, rated': ['Diâmetro do rotor nominal', 'Diámetro del impulsor nominal'], 'Impeller diameter, maximum': ['Diâmetro do rotor máximo', 'Diámetro del impulsor máximo'],
    'Impeller diameter, minimum': ['Diâmetro do rotor mínimo', 'Diámetro del impulsor mínimo'], 'Head, rated': ['Altura nominal', 'Altura nominal'], 'Power, rated': ['Potência nominal', 'Potencia nominal'],
    'Power required at 150% flow': ['Potência a 150% da vazão', 'Potencia al 150% del caudal'], 'Peak power': ['Potência máxima', 'Potencia máxima'], 'Efficiency, rated': ['Rendimento nominal', 'Rendimiento nominal'], Efficiency: ['Rendimento', 'Rendimiento'],
    'Flow at 150%': ['Vazão a 150%', 'Caudal al 150%'], 'Head at 150%, actual/limit': ['Altura a 150% (real / limite)', 'Altura al 150% (real / límite)'], 'Head at shutoff, actual/limit': ['Altura em shutoff (real / limite)', 'Altura a válvula cerrada (real / límite)'],
    'Liquid type': ['Líquido', 'Líquido'], 'Additional liquid description': ['Descrição adicional do líquido', 'Descripción adicional del líquido'], 'Solids diameter, max': ['Diâmetro máx. de sólidos', 'Diámetro máx. de sólidos'],
    'Solids concentration, by volume': ['Concentração de sólidos (volume)', 'Concentración de sólidos (volumen)'], 'Temperature, max': ['Temperatura máxima', 'Temperatura máxima'], 'Fluid density, rated / max': ['Densidade nominal / máx.', 'Densidad nominal / máx.'],
    'Viscosity, rated': ['Viscosidade', 'Viscosidad'], Viscosity: ['Viscosidade', 'Viscosidad'], 'Vapor pressure, rated': ['Pressão de vapor', 'Presión de vapor'], 'Material selected': ['Material', 'Material'],
    'Maximum working pressure': ['Pressão máxima de trabalho', 'Presión máxima de trabajo'], 'Maximum Working Pressure': ['Pressão máxima de trabalho', 'Presión máxima de trabajo'], 'Maximum allowable working pressure': ['Pressão máxima admissível', 'Presión máxima admisible'],
    'Maximum allowable suction pressure': ['Pressão máx. admissível de sucção', 'Presión máx. admisible de succión'], 'Hydrostatic test pressure': ['Pressão do teste hidrostático', 'Presión de prueba hidrostática'],
    'Direction of Rotation (viewed from drive end)': ['Sentido de rotação (visto do acionamento)', 'Sentido de giro (visto desde el accionamiento)'], 'Suction Flange Diameter': ['Flange de sucção', 'Brida de succión'],
    'Suction Flange Rating': ['Classe do flange de sucção', 'Clase de la brida de succión'], 'Discharge Flange Diameter': ['Flange de recalque', 'Brida de descarga'], 'Dicharge Flange Rating': ['Classe do flange de recalque', 'Clase de la brida de descarga'],
    'Discharge Flange Rating': ['Classe do flange de recalque', 'Clase de la brida de descarga'], 'Impeller Diameter': ['Diâmetro do rotor', 'Diámetro del impulsor'], 'Bearing Type': ['Rolamento', 'Rodamiento'], 'Bearing Lubrication': ['Lubrificação dos rolamentos', 'Lubricación de rodamientos'],
    'Pump Seal': ['Vedação', 'Sello'], 'Rotor Group': ['Grupo rotativo', 'Grupo rotativo'], 'Pump Casing': ['Carcaça', 'Carcasa'], Impeller: ['Rotor', 'Impulsor'], 'Pump Shaft': ['Eixo', 'Eje'], 'Shaft Sleeve': ['Luva do eixo', 'Camisa del eje'],
    'Case Ring': ['Anel de desgaste da carcaça', 'Anillo de desgaste de la carcasa'], 'Impeller wear ring': ['Anel de desgaste do rotor', 'Anillo de desgaste del impulsor'], Paint: ['Pintura', 'Pintura'], 'Pump Base': ['Base', 'Base'], Mounting: ['Montagem', 'Montaje'],
    'Max suction pressure**': ['Pressão máx. de sucção', 'Presión máx. de succión'], 'Hydraulic performance test': ['Teste de desempenho', 'Prueba de desempeño'], 'Hydrostatic test': ['Teste hidrostático', 'Prueba hidrostática'], 'Curve approval': ['Aprovação da curva', 'Aprobación de la curva'],
    'NPSH test': ['Teste de NPSH', 'Prueba de NPSH'], 'String test': ['Teste do conjunto', 'Prueba del conjunto'], 'Test w/ motor': ['Teste com o motor', 'Prueba con el motor'], 'Bare Pump': ['Bomba', 'Bomba'], Driver: ['Acionador', 'Accionador'], Base: ['Base', 'Base'],
    Manufacturer: ['Fabricante', 'Fabricante'], 'Cooling type': ['Arrefecimento', 'Refrigeración'], 'Rated speed': ['Rotação nominal', 'Velocidad nominal'], 'Rated power': ['Potência nominal', 'Potencia nominal'], 'Derated power': ['Potência corrigida (altitude e temperatura)', 'Potencia corregida (altitud y temperatura)'],
    'Installation elevation': ['Altitude da instalação', 'Altitud de la instalación'], 'Installation temperature (max)': ['Temperatura máx. da instalação', 'Temperatura máx. de la instalación'], 'Engine voltage': ['Tensão do motor', 'Tensión del motor'], 'Preheater voltage': ['Tensão do pré-aquecedor', 'Tensión del precalentador'],
    'Fuel supply': ['Alimentação de combustível', 'Alimentación de combustible'], Tier: ['Nível de emissões', 'Nivel de emisiones'], 'Silencer type': ['Silencioso', 'Silenciador'], 'Silencer size': ['Tamanho do silencioso', 'Tamaño del silenciador'], 'Silencer configuration': ['Configuração do silencioso', 'Configuración del silenciador'],
    'Flexible exhaust connection': ['Conexão flexível do escape', 'Conexión flexible del escape'], 'Drive shaft type': ['Eixo cardã', 'Eje cardán'], Tank: ['Tanque', 'Tanque'], 'Torsional coupling': ['Acoplamento torcional', 'Acoplamiento torsional'], Batteries: ['Baterias', 'Baterías'],
    'Rack and cables': ['Suporte e cabos', 'Soporte y cables'], 'Cooling loop size': ['Linha de arrefecimento', 'Línea de refrigeración'], 'Cooling loop material': ['Material da linha de arrefecimento', 'Material de la línea de refrigeración'], 'ULC fuel lines': ['Linhas de combustível ULC', 'Líneas de combustible ULC'],
    'Fuel system': ['Sistema de combustível', 'Sistema de combustible'], Ventiliation: ['Ventilação', 'Ventilación'], 'Base mounted controller adapter': ['Adaptador do painel na base', 'Adaptador del tablero en la base'],
    'Pump Type': ['Tipo de bomba', 'Tipo de bomba'], 'Impeller D': ['Diâmetro do rotor', 'Diámetro del impulsor'], Frequency: ['Frequência', 'Frecuencia'], 'NPSH r': ['NPSH requerido', 'NPSH requerido'], NPSH: ['NPSH requerido', 'NPSH requerido'], Flow: ['Vazão', 'Caudal'], Head: ['Altura manométrica', 'Altura manométrica'], 'Static Head': ['Altura estática', 'Altura estática'], Fluid: ['Fluido', 'Fluido'], Density: ['Densidade', 'Densidad'],
    'Kinematic Viscosity': ['Viscosidade cinemática', 'Viscosidad cinemática'], Temperature: ['Temperatura', 'Temperatura'], Speed: ['Rotação', 'Velocidad'], 'Number of Stages': ['Número de estágios', 'Número de etapas'], 'Max. Casing Pressure': ['Pressão máx. da carcaça', 'Presión máx. de la carcasa'],
    'Max. Operation Pressure': ['Pressão máx. de operação', 'Presión máx. de operación'], 'Head (Q=0)': ['Altura em shutoff (Q=0)', 'Altura a válvula cerrada (Q=0)'], 'Shaft Power': ['Potência no eixo', 'Potencia en el eje'], 'Maximum Shaft Power': ['Potência máx. no eixo', 'Potencia máx. en el eje'],
    NPSHr: ['NPSH requerido', 'NPSH requerido'], 'Volute Casing': ['Carcaça (voluta)', 'Carcasa (voluta)'], 'Seal Box': ['Caixa de selagem', 'Caja de sellado'], Shaft: ['Eixo', 'Eje'], 'Bearing Housing': ['Caixa de rolamentos', 'Caja de rodamientos'], 'Wear Ring': ['Anel de desgaste', 'Anillo de desgaste'],
    'Sleeve Set': ['Luva do eixo', 'Camisa del eje'], 'Seal Type': ['Tipo de vedação', 'Tipo de sello'], Type: ['Tipo', 'Tipo'], 'Impeller D Designed': ['Diâmetro do rotor (projeto)', 'Diámetro del impulsor (diseño)'],
    'Flow Nominal': ['Vazão nominal', 'Caudal nominal'], 'Flow Max.': ['Vazão máxima', 'Caudal máximo'], 'Flow Min.': ['Vazão mínima', 'Caudal mínimo'], 'Head Nominal': ['Altura nominal', 'Altura nominal'],
    'Head at Qmax': ['Altura na vazão máxima', 'Altura al caudal máximo'], 'Head at Qmin': ['Altura na vazão mínima', 'Altura al caudal mínimo'], 'Impeller D Max.': ['Diâmetro do rotor máximo', 'Diámetro del impulsor máximo'],
    'Impeller D Min.': ['Diâmetro do rotor mínimo', 'Diámetro del impulsor mínimo'], 'Suction Nozzle': ['Bocal de sucção', 'Boquilla de succión'], 'Discharge Nozzle': ['Bocal de recalque', 'Boquilla de descarga'], 'Body Type': ['Carcaça (modelo)', 'Carcasa (modelo)'],
    'Rated Power': ['Potência nominal', 'Potencia nominal'], 'Shaft Diameter': ['Diâmetro do eixo', 'Diámetro del eje'], 'Insulation Class': ['Classe de isolamento', 'Clase de aislamiento'], 'Protection Class': ['Grau de proteção', 'Grado de protección'],
    Voltage: ['Tensão', 'Tensión'], 'Efficiency Class': ['Classe de rendimento', 'Clase de eficiencia'], 'Phase Number': ['Número de fases', 'Número de fases'], 'Direction of Rotation': ['Sentido de rotação', 'Sentido de giro'],
    'Rated power (based on duty point)': ['Potência no ponto de trabalho', 'Potencia en el punto de trabajo'], 'Max power (non-overloading)': ['Potência máxima (sem sobrecarga)', 'Potencia máxima (sin sobrecarga)'], 'NPSH required': ['NPSH requerido', 'NPSH requerido'],
  };
  const VAL = {
    Yes: ['Sim', 'Sí'], No: ['Não', 'No'], 'N/A': ['N/A', 'N/A'], None: ['Nenhum', 'Ninguno'], Ample: ['Amplo', 'Amplio'], 'Cold Water': ['Água fria', 'Agua fría'], 'Ductile Iron': ['Ferro fundido nodular', 'Hierro dúctil'], 'Cast Iron': ['Ferro fundido', 'Hierro fundido'],
    'Clockwise (RH)': ['Horário (RH)', 'Horario (RH)'], 'Counterclockwise (LH)': ['Anti-horário (LH)', 'Antihorario (LH)'], Grease: ['Graxa', 'Grasa'], Oil: ['Óleo', 'Aceite'], 'Packing seal': ['Gaxeta', 'Empaquetadura'], 'Mechanical seal': ['Selo mecânico', 'Sello mecánico'],
    'Single Row': ['Uma carreira', 'Una hilera'], 'Silicon Brass': ['Latão ao silício', 'Latón al silicio'], 'Carbon steel': ['Aço carbono', 'Acero al carbono'], 'Bismuth tin bronze': ['Bronze estanho-bismuto', 'Bronce estaño-bismuto'], Integral: ['Integral', 'Integral'],
    'Heat exchanger cooled': ['Trocador de calor', 'Intercambiador de calor'], 'Radiator cooled': ['Radiador', 'Radiador'], 'Mounted on base with driver': ['Montada na base com o acionador', 'Montada en la base con el accionador'], 'Standard ventilation': ['Ventilação padrão', 'Ventilación estándar'],
    Steel: ['Aço', 'Acero'], Standard: ['Padrão', 'Estándar'], 'Peerless Fire Red': ['Vermelho Peerless', 'Rojo Peerless'], 'Non-witnessed': ['Não testemunhado', 'No presenciada'], 'Non-witnessed per HI 14.6 1U': ['Não testemunhado (HI 14.6 1U)', 'No presenciada (HI 14.6 1U)'],
    Elastic: ['Elástico', 'Elástico'], Surface: ['Superfície', 'Superficie'], 'Clockwise from the Drive End': ['Horário, visto do acionamento', 'Horario, visto desde el accionamiento'], 'Chromium Steel': ['Aço cromo', 'Acero al cromo'],
    'Chrome Nickel Steel': ['Aço cromo-níquel', 'Acero cromo-níquel'], 'Bronze Casting (Tinned)': ['Bronze fundido (estanhado)', 'Bronce fundido (estañado)'], 'Ductile Cast Iron': ['Ferro fundido nodular', 'Hierro dúctil'],
    'Double Suction Pump': ['Bipartida (dupla sucção)', 'Bipartida (doble succión)'], Water: ['Água', 'Agua'], 'Soft Packing': ['Gaxeta', 'Empaquetadura'],
    'Diesel engine': ['Motor diesel', 'Motor diésel'], 'Electric motor': ['Motor elétrico', 'Motor eléctrico'], 'Fire Pump System': ['Sistema de bomba de incêndio', 'Sistema de bomba contra incendio'], UL: ['UL', 'UL'],
  };
  const idx = (lang) => (lang === 'pt' ? 0 : lang === 'es' ? 1 : -1);
  const secT = (s, lang) => (idx(lang) < 0 ? s : (SEC[s] || [])[idx(lang)] || null);
  const rotT = (s, lang) => (idx(lang) < 0 ? s : (ROT[s] || [])[idx(lang)] || null);
  // valor com código depois da barra ("Cast Iron / 06025"): traduz o material e mantém o código
  const valT = (s, lang) => { if (idx(lang) < 0) return s; const d = (VAL[s] || [])[idx(lang)]; if (d) return d; const m = String(s).match(/^(.+?) \/ (.+)$/); if (m && VAL[m[1]]) return VAL[m[1]][idx(lang)] + ' / ' + (VAL[m[2]] ? VAL[m[2]][idx(lang)] : m[2]); return null; };
  // linha do escopo "Chave: valor": traduz cada parte pelo dicionário
  const linhaT = (s, lang) => { if (idx(lang) < 0) return s; if (VAL[s]) return valT(s, lang); const m = String(s).match(/^([^:]{2,60}):\s*(.*)$/); if (!m) return null; const k = rotT(m[1], lang) || ESC_ROT[m[1]]?.[idx(lang)]; const v = m[2] === '' ? '' : valT(m[2], lang); return k && v !== null ? (v ? k + ': ' + v : k + ':') : null; };
  const ESC_ROT = { 'Pump model': ['Modelo da bomba', 'Modelo de la bomba'], 'Selected pump listing': ['Listagem', 'Listado'], 'Casing material': ['Material da carcaça', 'Material de la carcasa'], 'Suction flange': ['Flange de sucção', 'Brida de succión'],
    'Discharge flange': ['Flange de recalque', 'Brida de descarga'], 'Casing ring': ['Anel da carcaça', 'Anillo de la carcasa'], 'Impeller material': ['Material do rotor', 'Material del impulsor'], 'Impeller Wear Ring': ['Anel de desgaste do rotor', 'Anillo de desgaste del impulsor'],
    Rotation: ['Rotação', 'Rotación'], 'Shaft material': ['Material do eixo', 'Material del eje'], 'Shaft sleeve material': ['Material da luva do eixo', 'Material de la camisa del eje'], 'Packing type': ['Tipo de gaxeta', 'Tipo de empaquetadura'], 'Nameplate units': ['Unidades da placa', 'Unidades de la placa'],
    'Engine voltage': ['Tensão do motor', 'Tensión del motor'], 'Controller brand': ['Marca do painel', 'Marca del tablero'], 'Controller voltage': ['Tensão do painel', 'Tensión del tablero'], 'Controller frequency': ['Frequência do painel', 'Frecuencia del tablero'], Enclosure: ['Invólucro', 'Envolvente'], 'Enclosure type': ['Tipo de invólucro', 'Tipo de envolvente'] };
  const UNI = 'USgpm|gpm|in|psi\\.?[ga]?|lb|hp|ft|rpm|m|mm|cP|SG|Hz|V|VAC|VDC|V DC|%|deg C|°C|kW|bar|m³/h|hp/100 rpm|psi\\.a';
  const reMedida = new RegExp('^[-+]?[\\d.,]+(\\s*/\\s*[-+]?[\\d.,]+)?\\s*(' + UNI + ')?$');
  const ehMedida = (v) => reMedida.test(String(v || '').trim().replace(/\s+/g, ' '));
  window.PricerFabricante = { ler, secT, rotT, valT, linhaT, junta, ehMedida };
})();
