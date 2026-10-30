/* LS Pricer — curva da bomba redesenhada no padrão LS Fire a partir dos pontos do fabricante (tabela vazão × altura,
   rendimento e potência lida da folha de dados). Três painéis com o mesmo eixo de vazão (altura, rendimento, potência),
   sem eixo duplo; ponto de trabalho e pontos da NFPA 20 marcados com os valores que vieram da folha. Nada é extrapolado:
   a curva passa só pelos pontos do fabricante (interpolação monotônica entre eles). */
(function () {
  'use strict';
  const LAR = '#E4650E', ESC = '#2F2F2F', TXT = '#3A3A3A', MUTED = '#7A7A7A', GRID = '#E6E6E6', EIXO = '#BDBDBD';
  const L = {
    pt: { h: 'Altura manométrica', eff: 'Rendimento', p: 'Potência absorvida', q: 'Vazão', trab: 'Ponto de trabalho', nfpa: 'Nominal NFPA 20', shut: 'Shutoff', p150: '150% da vazão', lim: 'limite', max140: 'máx. 140%', min65: 'mín. 65%', fim: 'Final da curva', fora: 'a curva do fabricante não chega a 150%', rotor: 'rotor', fonte: 'Curva traçada pela LS Fire com os pontos da folha de dados do fabricante', chave: 'Curva de altura traçada pela LS Fire pelos pontos informados na folha do fabricante (shutoff, mínima, trabalho, nominal e máxima)', vetor: 'Curvas traçadas pela LS Fire a partir do gráfico da folha de dados do fabricante', npsh: 'NPSH requerido', diam: 'Ø', form: '(formação LS Fire)' },
    en: { h: 'Total head', eff: 'Efficiency', p: 'Power absorbed', q: 'Flow', trab: 'Duty point', nfpa: 'NFPA 20 rated', shut: 'Shutoff', p150: '150% flow', lim: 'limit', max140: 'max. 140%', min65: 'min. 65%', fim: 'End of curve', fora: 'the manufacturer curve does not reach 150%', rotor: 'impeller', fonte: 'Curve plotted by LS Fire from the manufacturer datasheet points', chave: 'Head curve plotted by LS Fire through the points given in the manufacturer datasheet (shutoff, minimum, duty, rated and maximum)', vetor: 'Curves plotted by LS Fire from the manufacturer datasheet chart', npsh: 'NPSH required', diam: 'Ø', form: '(LS Fire selection)' },
    es: { h: 'Altura manométrica', eff: 'Rendimiento', p: 'Potencia absorbida', q: 'Caudal', trab: 'Punto de trabajo', nfpa: 'Nominal NFPA 20', shut: 'Válvula cerrada', p150: '150% del caudal', lim: 'límite', max140: 'máx. 140%', min65: 'mín. 65%', fim: 'Final de la curva', fora: 'la curva del fabricante no llega al 150%', rotor: 'impulsor', fonte: 'Curva trazada por LS Fire con los puntos de la hoja de datos del fabricante', chave: 'Curva de altura trazada por LS Fire por los puntos indicados en la hoja del fabricante (válvula cerrada, mínimo, trabajo, nominal y máximo)', vetor: 'Curvas trazadas por LS Fire a partir del gráfico de la hoja de datos del fabricante', npsh: 'NPSH requerido', diam: 'Ø', form: '(selección LS Fire)' },
  };
  const LOC = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
  let fonteOk = null;
  async function fontes() {
    if (fonteOk) return fonteOk;
    fonteOk = (async () => { const AS = window.PRICER_PROPOSTA_ASSETS; if (!AS || !window.FontFace) return false;
      try { for (const [nm, w] of [['Montserrat-Regular', '400'], ['Montserrat-SemiBold', '600']]) { const f = new FontFace('MontLS', 'url(data:font/ttf;base64,' + AS.fontes[nm] + ')', { weight: w }); await f.load(); document.fonts.add(f); } return true; } catch (e) { return false; } })();
    return fonteOk;
  }
  // números do fabricante ("2,724 USgpm", "114.3 m", "134.8 / 160.0 m")
  const nums = (s) => (String(s || '').match(/[\d,]*\.?\d+/g) || []).map((x) => Number(x.replace(/,/g, '')));
  function campo(dados, sec, re) { for (const s of dados.secoes || []) { if (sec && !sec.test(s.t)) continue; const c = (s.campos || []).find((x) => re.test(x.k)); if (c) return c.v; } return ''; }
  // interpolação monotônica (Fritsch–Carlson): a curva não inventa picos entre os pontos
  function monotona(xs, ys) {
    const n = xs.length; const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], t = a * a + b * b; if (t > 9) { const k = 3 / Math.sqrt(t); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; } }
    return (x) => { let i = 0; while (i < n - 2 && x > xs[i + 1]) i++; const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]; };
  }
  const passo = (max, alvo) => { const bruto = max / alvo; const p = Math.pow(10, Math.floor(Math.log10(bruto))); const r = bruto / p; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p; };

  function temPontos(dados) { return !!(dados && dados.pontos && (dados.pontos.pts || []).length >= 4); }
  // NFPA 20 a partir da folha e da curva do fabricante: nominal (100%), 150% da vazão (altura mínima 65% da nominal) e
  // shutoff (altura máxima 140% da nominal). O que a folha informa vale; o resto é lido na curva entre os pontos do
  // fabricante (sem extrapolar). Sem nominal na folha, a base é o ponto de trabalho. Potências no nominal, a 150% e no fim da curva.
  function nfpa(dados, o = {}) {
    if (!temPontos(dados)) return null;
    const P = dados.pontos; const pts = P.pts; const U = Object.assign({ q: 'USgpm', h: 'm', eff: '%', p: 'hp', npsh: 'm' }, P.unid || {});
    const serie = (k) => pts.filter((p) => typeof p[k] === 'number').filter((p, i, A) => !i || p.q > A[i - 1].q);
    const em = (k, q) => { const ps = serie(k); if (ps.length < 2 || !(q >= ps[0].q - 1e-9 && q <= ps[ps.length - 1].q * 1.001)) return null; return monotona(ps.map((p) => p.q), ps.map((p) => p[k]))(Math.min(q, ps[ps.length - 1].q)); };
    let qT = nums(campo(dados, /Operating/i, /^Flow, rated$/))[0] || nums(campo(dados, /Operat/i, /^Flow$/))[0]; let hT = nums(campo(dados, /Operating/i, /^Differential head.*\((actual)\)$/))[0] || nums(campo(dados, /Operating/i, /^Differential head/))[0] || nums(campo(dados, /Operat/i, /^Head$/))[0];
    // sem o ponto de trabalho na folha: o da formação que cai sobre a curva (até 10% de diferença na altura), na unidade da curva
    let trabForm = false, man = false, desvio = null;
    // ponto informado na tela (vazão em m³/h, altura em mca): vale sobre o da folha e o da formação, mesmo fora da curva
    if (o.ponto && o.ponto.q > 0 && o.ponto.h > 0) { const fq = /gpm/i.test(U.q) ? 4.402868 : /l\/s/i.test(U.q) ? 1 / 3.6 : 1; qT = o.ponto.q * fq; hT = o.ponto.h; man = true; }
    if (!(qT && hT) && (o.trabalho || []).length) { const fq = /gpm/i.test(U.q) ? 4.402868 : /l\/s/i.test(U.q) ? 1 / 3.6 : 1;
      let best = null; for (const t of o.trabalho) { const q = t.q * fq; const hc = em('h', q); if (hc === null) continue; const d = Math.abs(hc - t.h) / t.h; if (d <= 0.1 && (!best || d < best.d)) best = { q, h: t.h, d }; }
      if (best) { qT = best.q; hT = best.h; trabForm = true; } }
    if (qT && hT) { const hc = em('h', qT); desvio = hc === null ? null : (hc - hT) / hT; }
    const qNf = nums(campo(dados, /NFPA/i, /^Flow, rated$/))[0], hNf = nums(campo(dados, /NFPA/i, /^Head, rated$/))[0];
    const base = qNf && hNf ? 'nominal' : qT && hT ? 'trabalho' : ''; const qN = qNf && hNf ? qNf : qT, hN = qNf && hNf ? hNf : hT;
    const shF = nums(campo(dados, /NFPA/i, /^Head at shutoff/)), h150F = nums(campo(dados, /NFPA/i, /^Head at 150%/)), q150F = nums(campo(dados, /NFPA/i, /^Flow at 150%/))[0];
    const q150 = q150F || (qN ? 1.5 * qN : null);
    const h150 = h150F[0] || (q150 ? em('h', q150) : null), h150Lim = h150F[1] || (hN ? 0.65 * hN : null);
    const sh = shF[0] || em('h', 0), shLim = shF[1] || (hN ? 1.4 * hN : null);
    const fol = nums(campo(dados, null, /^(Shaft Power|Power, rated)$/))[0]; const pc = qN ? em('p', qN) : null;
    const pN = fol && pc !== null && Math.abs(fol - pc) <= Math.max(0.08 * pc, 0.5) ? fol : pc !== null ? pc : null;
    const ps = serie('p'); const fim = ps.length ? ps[ps.length - 1] : null;
    const hFim = fim ? em('h', fim.q) : null;
    return { U, qT, hT, trabForm, man, desvio, base, qN, hN, q150, h150, h150Lim, sh, shLim, pN, p150: q150 ? em('p', q150) : null, pSh: em('p', 0), hN0: qN ? em('h', qN) : null,
      qFim: fim ? fim.q : null, pFim: fim ? fim.p : null, hFim, pMax: ps.length ? Math.max(...ps.map((p) => p.p)) : null,
      ok150: h150 !== null && h150Lim ? h150 >= h150Lim - 1e-9 : null, okSh: sh !== null && shLim ? sh <= shLim + 1e-9 : null };
  }

  async function desenhar(dados, o = {}) {
    if (!temPontos(dados)) return null;
    const lang = L[o.lang] ? o.lang : 'pt'; const t = L[lang]; await fontes();
    const nf = (d) => new Intl.NumberFormat(LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
    const P = dados.pontos; const pts = P.pts; const U = Object.assign({ q: 'USgpm', h: 'm', eff: '%', p: 'hp', npsh: 'm' }, P.unid || {}); const outros = P.outros || [];
    const W = 2400, H = 1760; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const FT = (w, sz) => `${w} ${sz}px MontLS, Montserrat, Arial, sans-serif`;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const N = nfpa(dados, o); const qMax = Math.max(...pts.map((p) => p.q), ...outros.map((o) => Math.max(...o.pts.map((p) => p.q))), N.q150 && N.q150 <= 1.35 * Math.max(...pts.map((p) => p.q)) ? N.q150 : 0); const xStep = passo(qMax * 1.06, 10); const xMax = Math.ceil((qMax * 1.04) / xStep) * xStep;
    const X0 = 190, X1 = W - 70; const sx = (q) => X0 + (q / xMax) * (X1 - X0);
    // painéis: altura (grande), rendimento e potência; cada um com o seu eixo
    const series = [['h', t.h, 0.52], ['eff', t.eff, 0.19], ['p', t.p, 0.19], ['npsh', t.npsh, 0.17]].filter(([k]) => pts.filter((p) => typeof p[k] === 'number').length >= 2);
    const topo = 190, base = H - 190, gap = series.length > 3 ? 58 : 64; const alt = base - topo - gap * (series.length - 1); const soma = series.reduce((a, s) => a + s[2], 0);
    let y = topo; const paineis = series.map(([k, nome, f]) => { const h = alt * f / soma; const p = { k, nome, y0: y, y1: y + h }; y += h + gap; return p; });
    // ponto de trabalho, nominal e pontos da NFPA 20 (150% da vazão e shutoff), com as potências
    const { qT, hT, trabForm, qN, hN, q150 } = N; const sh = [N.sh, N.shLim], h150 = [N.h150, N.h150Lim];
    for (const pn of paineis) {
      const vals = pts.map((p) => p[pn.k]).filter((v) => typeof v === 'number'); let vmax = Math.max(...vals);
      if (pn.k === 'h') vmax = Math.max(vmax, hT || 0, hN || 0, sh[1] || 0, sh[0] || 0, ...outros.map((o) => Math.max(...o.pts.map((p) => p.h))));
      const ys = passo(vmax * 1.08, pn.k === 'h' ? 8 : 3); const ymax = Math.ceil((vmax * 1.06) / ys) * ys; const syy = (v) => pn.y1 - (v / ymax) * (pn.y1 - pn.y0); pn.sy = syy;
      // grade e eixo y (recessivos)
      g.lineWidth = 2; g.font = FT(400, 30); g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let v = 0; v <= ymax + 1e-9; v += ys) { const yy = syy(v); g.strokeStyle = v === 0 ? EIXO : GRID; g.beginPath(); g.moveTo(X0, yy); g.lineTo(X1, yy); g.stroke(); g.fillStyle = MUTED; g.fillText(nf(ys < 1 ? 1 : 0).format(v), X0 - 18, yy); }
      for (let q = 0; q <= xMax + 1e-9; q += xStep) { const xx = sx(q); g.strokeStyle = GRID; g.beginPath(); g.moveTo(xx, pn.y0); g.lineTo(xx, pn.y1); g.stroke(); }
      g.fillStyle = TXT; g.font = FT(600, 34); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(pn.nome + ' (' + U[pn.k] + ')', X0, pn.y0 - 18);
      // outros diâmetros de rotor (tracejados, recessivos), com o diâmetro na ponta
      if (pn.k === 'h') for (const o of outros) { const op = o.pts.filter((p, i, A) => !i || p.q > A[i - 1].q); if (op.length < 2) continue; const fo = monotona(op.map((p) => p.q), op.map((p) => p.h));
        g.setLineDash([16, 12]); g.strokeStyle = '#A8A8A8'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 120; i++) { const q = op[0].q + (op[op.length - 1].q - op[0].q) * i / 120; const xx = sx(q), yy = syy(fo(q)); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); g.setLineDash([]);
        const fim = op[op.length - 1]; g.fillStyle = MUTED; g.font = FT(400, 24); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t.diam + ' ' + (lang === 'en' ? o.rot : String(o.rot).replace('.', ',')), Math.min(sx(fim.q) + 10, X1 - 110), syy(fim.h)); }
      // curva: só entre os pontos do fabricante
      const ps = pts.filter((p) => typeof p[pn.k] === 'number'); const f = monotona(ps.map((p) => p.q), ps.map((p) => p[pn.k]));
      g.strokeStyle = LAR; g.lineWidth = pn.k === 'h' ? 7 : 5; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i <= 240; i++) { const q = ps[0].q + (ps[ps.length - 1].q - ps[0].q) * i / 240; const xx = sx(q), yy = syy(f(q)); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke();
      pn.f = f; pn.ymax = ymax;
    }
    // marcações no painel de altura
    const ph = paineis.find((p) => p.k === 'h');
    const rotulo = (txt, xx, yy, lado, cor) => { g.font = FT(600, 30); g.textBaseline = 'middle'; const w = g.measureText(txt).width;
      if (lado === 'd' && xx + 22 + w > X1) lado = 'e'; if (lado === 'e' && xx - 22 - w < X0) lado = 'd'; g.textAlign = lado === 'e' ? 'right' : 'left'; const x2 = lado === 'e' ? xx - 22 : xx + 22;
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(lado === 'e' ? x2 - w - 8 : x2 - 8, yy - 22, w + 16, 44); g.fillStyle = cor || TXT; g.fillText(txt, x2, yy); };
    const ponto = (xx, yy, cheio) => { g.lineWidth = 5; g.strokeStyle = '#fff'; g.fillStyle = cheio ? ESC : '#fff'; g.beginPath(); g.arc(xx, yy, 15, 0, Math.PI * 2); g.fill(); g.stroke(); if (!cheio) { g.strokeStyle = ESC; g.lineWidth = 5; g.beginPath(); g.arc(xx, yy, 12, 0, Math.PI * 2); g.stroke(); } };
    const tri = (xx, yy, baixo) => { g.fillStyle = ESC; g.beginPath(); if (baixo) { g.moveTo(xx - 15, yy - 13); g.lineTo(xx + 15, yy - 13); g.lineTo(xx, yy + 13); } else { g.moveTo(xx - 15, yy + 13); g.lineTo(xx + 15, yy + 13); g.lineTo(xx, yy - 13); } g.closePath(); g.fill(); };
    const fq = (q) => nf(0).format(q) + ' ' + U.q, fh = (h) => nf(1).format(h) + ' ' + U.h;
    if (ph) {
      if (qN && hN && Math.abs(qN - (qT || 0)) / qN > 0.01) { ponto(sx(qN), ph.sy(hN), false); rotulo(t.nfpa + ': ' + fq(qN) + ' · ' + fh(hN), sx(qN), ph.sy(hN) + 52, 'e'); }
      if (P.chave) for (const p of pts) { g.fillStyle = LAR; g.beginPath(); g.arc(sx(p.q), ph.sy(p.h), 9, 0, Math.PI * 2); g.fill(); }
      if (qT && hT) { const xx = sx(qT), yy = ph.sy(hT); g.setLineDash([6, 10]); g.strokeStyle = ESC; g.lineWidth = 3; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, ph.y1); g.stroke(); g.setLineDash([]); ponto(xx, yy, true); const tt = t.trab + ': ' + fq(qT) + ' · ' + fh(hT) + (trabForm ? ' ' + t.form : ''); g.font = FT(600, 30); const wt = g.measureText(tt).width;
        // o rótulo vai para cima da curva quando passaria por cima do ponto de 150% da vazão
        const sobre150 = !P.chave && q150 && h150[0] && sx(q150) > xx && sx(q150) < xx + 60 + wt; rotulo(tt, xx, yy + (sobre150 ? -54 : 54), P.chave ? 'e' : 'd'); }
      // NFPA 20 com linhas tracejadas: limite de 140% no shutoff, vertical em 150% da vazão e limite de 65% nela
      const tracejado = (x1, y1, x2, y2) => { g.setLineDash([14, 12]); g.strokeStyle = MUTED; g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); };
      if (sh[1]) { const yy = ph.sy(sh[1]); tracejado(sx(0), yy, sx(xMax * 0.18), yy); tri(sx(0) + 6, yy, true); rotulo(t.shut + (sh[0] ? ': ' + fh(sh[0]) : '') + ' (' + t.max140 + ': ' + fh(sh[1]) + ')', sx(xMax * 0.18), yy, 'd', sh[0] && sh[0] > sh[1] ? LAR : TXT); }
      if (sh[0]) ponto(sx(0), ph.sy(sh[0]), false);
      if (q150 && q150 <= xMax) { const xx = sx(q150); const lim = h150[1]; const yv = h150[0] ? ph.sy(h150[0]) : ph.sy(lim || 0);
        tracejado(xx, ph.y1, xx, Math.min(yv, lim ? ph.sy(lim) : yv) - 20);
        if (lim) { const yy = ph.sy(lim); tracejado(xx - 90, yy, xx + 90, yy); tri(xx, yy, false); }
        const txt = t.p150 + ': ' + fq(q150) + (h150[0] ? ' · ' + fh(h150[0]) : '') + (lim ? ' (' + t.min65 + ': ' + fh(lim) + ')' : '') + (h150[0] ? '' : ' — ' + t.fora);
        rotulo(txt, xx, (lim ? ph.sy(lim) : yv) + 75, 'd', h150[0] && lim && h150[0] < lim ? LAR : TXT); }
      if (q150 && q150 <= xMax && h150[0]) ponto(sx(q150), ph.sy(h150[0]), false);
    }
    // ponto de trabalho também nos outros painéis (valor lido na curva do fabricante)
    if (qT) for (const pn of paineis) { if (pn.k === 'h' || !pn.f) continue; const ps = pts.filter((p) => typeof p[pn.k] === 'number'); if (!ps.length || qT < ps[0].q || qT > ps[ps.length - 1].q) continue;
      // valor escrito na folha quando houver; senão, o lido na curva
      const fol = { eff: nums(campo(dados, null, /^Efficiency(, rated)?$/))[0], p: nums(campo(dados, null, /^(Shaft Power|Power, rated)$/))[0], npsh: nums(campo(dados, null, /^NPSH\s?r(equired)?$/i))[0] }[pn.k];
      const v0 = pn.f(qT); const v = fol && Math.abs(fol - v0) <= Math.max(0.08 * Math.abs(v0), 0.5) ? fol : v0; const xx = sx(qT), yy = pn.sy(v0); g.setLineDash([6, 10]); g.strokeStyle = ESC; g.lineWidth = 3; g.beginPath(); g.moveTo(xx, pn.y0); g.lineTo(xx, pn.y1); g.stroke(); g.setLineDash([]); ponto(xx, yy, true);
      rotulo(nf(pn.k === 'p' ? 1 : pn.k === 'eff' ? 1 : 2).format(v) + ' ' + U[pn.k], xx, yy - 40, 'd'); }
    // potência a 150% da vazão e no fim da curva (tracejadas, como os pontos da NFPA 20)
    const pp = paineis.find((p) => p.k === 'p');
    if (pp) { const fp = (v) => nf(1).format(v) + ' ' + U.p;
      const marca = (q, v, txt, dy) => { const xx = sx(q), yy = pp.sy(v); g.setLineDash([14, 12]); g.strokeStyle = MUTED; g.lineWidth = 3; g.beginPath(); g.moveTo(xx, pp.y1); g.lineTo(xx, yy); g.stroke(); g.setLineDash([]); ponto(xx, yy, false); rotulo(txt, xx, yy + dy, 'e'); };
      if (q150 && N.p150 !== null) marca(q150, N.p150, '150%: ' + fp(N.p150), 44);
      if (N.pFim !== null && (!q150 || Math.abs(N.qFim - q150) / q150 > 0.03)) marca(N.qFim, N.pFim, t.fim + ': ' + fp(N.pFim), -40); }
    // eixo x (vazão) com equivalente em m³/h quando a vazão vem em galões
    const yb = paineis[paineis.length - 1].y1; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let q = 0; q <= xMax + 1e-9; q += xStep) { const xx = sx(q); g.fillStyle = MUTED; g.font = FT(400, 30); g.fillText(nf(0).format(q), xx, yb + 16); if (/gpm/i.test(U.q)) { g.font = FT(400, 24); g.fillText(nf(0).format(q * 0.2271247), xx, yb + 54); } }
    g.fillStyle = TXT; g.font = FT(600, 34); g.fillText(t.q + ' (' + U.q + (/gpm/i.test(U.q) ? ' · m³/h' : '') + ')', (X0 + X1) / 2, yb + 96);
    // cabeçalho: modelo, rotor e rotação (como vieram da folha) e o logo
    let mod = campo(dados, /Project/i, /Model$|^Model \//); const rot = campo(dados, /NFPA|Construction/i, /^Impeller diameter, rated$|^Impeller Diameter$/) || campo(dados, null, /^Impeller D(iameter)?\b.*(Designed|rated)/i); const rpm = campo(dados, /NFPA|Operating/i, /^Speed, rated$/) || campo(dados, null, /^Speed$/);
    if (!mod) { const pj = ((dados.secoes || []).find((x) => x.t === 'Project') || { campos: [] }).campos.map((c) => c.k + ' ' + c.v).join(' '); mod = (pj.match(/\b([A-Z]{2,6}\s?\d{2,4}[-/]\d{2,4}[A-Z]?)\b/) || [])[1] || ''; }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = ESC;
    const dec = (v) => (lang === 'en' ? v : String(v).replace(/(\d),(\d{3})/g, '$1\u0000$2').replace(/(\d)\.(\d)/g, '$1,$2').replace(/\u0000/g, '.'));
    const linha = [dados.fabricante, mod].filter(Boolean).join(' ') + (rot ? ' · ' + t.rotor + ' ' + dec(rot) : '') + (rpm ? ' · ' + rpm : '');
    // título: a descrição da bomba do item; embaixo, fabricante, modelo, rotor e rotação como vieram da folha
    const cabe = (txt, sz, max) => { let s = String(txt), z = sz; g.font = FT(600, z); while (g.measureText(s).width > max && z > 28) { z -= 2; g.font = FT(600, z); } while (g.measureText(s).width > max && s.length > 8) s = s.slice(0, -2).trimEnd() + '…'; if (s.endsWith('……')) s = s.slice(0, -1); return s; };
    const larg = X1 - X0 - 270; const tit = String(o.titulo || '').trim();
    if (tit) { g.fillText(cabe(tit, 40, larg), X0, 58); if (linha.trim()) { g.fillStyle = MUTED; g.font = FT(400, 28); g.fillText(linha, X0, 128); } }
    else { g.fillText(cabe(linha, 40, larg), X0, 58); }
    if (o.logo) { try { const im = new Image(); im.src = o.logo; await im.decode(); const w = 230, h = w * im.height / im.width; g.drawImage(im, W - 70 - w, 18, w, h); } catch (e) { /* sem logo */ } }
    g.fillStyle = LAR; g.fillRect(X0, 80, 120, 6);
    g.fillStyle = MUTED; g.font = FT(400, 26); g.textAlign = 'right'; g.fillText((P.chave ? t.chave : P.vetor ? t.vetor : t.fonte) + (dados.pontos.pag ? ' (p. ' + dados.pontos.pag + ')' : '') + '.', X1, H - 22);
    return cv.toDataURL('image/png');
  }
  window.PricerCurva = { desenhar, temPontos, nfpa };
})();
