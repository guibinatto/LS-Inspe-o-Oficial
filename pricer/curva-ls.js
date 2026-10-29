/* LS Pricer — curva da bomba redesenhada no padrão LS Fire a partir dos pontos do fabricante (tabela vazão × altura,
   rendimento e potência lida da folha de dados). Três painéis com o mesmo eixo de vazão (altura, rendimento, potência),
   sem eixo duplo; ponto de trabalho e pontos da NFPA 20 marcados com os valores que vieram da folha. Nada é extrapolado:
   a curva passa só pelos pontos do fabricante (interpolação monotônica entre eles). */
(function () {
  'use strict';
  const LAR = '#E4650E', ESC = '#2F2F2F', TXT = '#3A3A3A', MUTED = '#7A7A7A', GRID = '#E6E6E6', EIXO = '#BDBDBD';
  const L = {
    pt: { h: 'Altura manométrica', eff: 'Rendimento', p: 'Potência absorvida', q: 'Vazão', trab: 'Ponto de trabalho', nfpa: 'Nominal NFPA 20', shut: 'Shutoff', p150: '150% da vazão', lim: 'limite', rotor: 'rotor', fonte: 'Curva traçada pela LS Fire com os pontos da folha de dados do fabricante' },
    en: { h: 'Total head', eff: 'Efficiency', p: 'Power absorbed', q: 'Flow', trab: 'Duty point', nfpa: 'NFPA 20 rated', shut: 'Shutoff', p150: '150% flow', lim: 'limit', rotor: 'impeller', fonte: 'Curve plotted by LS Fire from the manufacturer datasheet points' },
    es: { h: 'Altura manométrica', eff: 'Rendimiento', p: 'Potencia absorbida', q: 'Caudal', trab: 'Punto de trabajo', nfpa: 'Nominal NFPA 20', shut: 'Válvula cerrada', p150: '150% del caudal', lim: 'límite', rotor: 'impulsor', fonte: 'Curva trazada por LS Fire con los puntos de la hoja de datos del fabricante' },
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
  async function desenhar(dados, o = {}) {
    if (!temPontos(dados)) return null;
    const lang = L[o.lang] ? o.lang : 'pt'; const t = L[lang]; await fontes();
    const nf = (d) => new Intl.NumberFormat(LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
    const P = dados.pontos; const pts = P.pts; const U = Object.assign({ q: 'USgpm', h: 'm', eff: '%', p: 'hp' }, P.unid || {});
    const W = 2400, H = 1760; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const FT = (w, sz) => `${w} ${sz}px MontLS, Montserrat, Arial, sans-serif`;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const qMax = Math.max(...pts.map((p) => p.q)); const xStep = passo(qMax * 1.06, 10); const xMax = Math.ceil((qMax * 1.04) / xStep) * xStep;
    const X0 = 190, X1 = W - 70; const sx = (q) => X0 + (q / xMax) * (X1 - X0);
    // painéis: altura (grande), rendimento e potência; cada um com o seu eixo
    const series = [['h', t.h, 0.52], ['eff', t.eff, 0.19], ['p', t.p, 0.19]].filter(([k]) => pts.some((p) => typeof p[k] === 'number'));
    const topo = 190, base = H - 190, gap = 64; const alt = base - topo - gap * (series.length - 1); const soma = series.reduce((a, s) => a + s[2], 0);
    let y = topo; const paineis = series.map(([k, nome, f]) => { const h = alt * f / soma; const p = { k, nome, y0: y, y1: y + h }; y += h + gap; return p; });
    // dados do ponto de trabalho e da NFPA 20 (só o que estiver na folha)
    const qT = nums(campo(dados, /Operating/i, /^Flow, rated$/))[0]; const hT = nums(campo(dados, /Operating/i, /^Differential head.*\((actual)\)$/))[0] || nums(campo(dados, /Operating/i, /^Differential head/))[0];
    const qN = nums(campo(dados, /NFPA/i, /^Flow, rated$/))[0], hN = nums(campo(dados, /NFPA/i, /^Head, rated$/))[0];
    const sh = nums(campo(dados, /NFPA/i, /^Head at shutoff/)), h150 = nums(campo(dados, /NFPA/i, /^Head at 150%/)), q150 = nums(campo(dados, /NFPA/i, /^Flow at 150%/))[0];
    for (const pn of paineis) {
      const vals = pts.map((p) => p[pn.k]).filter((v) => typeof v === 'number'); let vmax = Math.max(...vals);
      if (pn.k === 'h') vmax = Math.max(vmax, hT || 0, hN || 0, sh[1] || 0);
      const ys = passo(vmax * 1.08, pn.k === 'h' ? 8 : 3); const ymax = Math.ceil((vmax * 1.06) / ys) * ys; const syy = (v) => pn.y1 - (v / ymax) * (pn.y1 - pn.y0); pn.sy = syy;
      // grade e eixo y (recessivos)
      g.lineWidth = 2; g.font = FT(400, 30); g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let v = 0; v <= ymax + 1e-9; v += ys) { const yy = syy(v); g.strokeStyle = v === 0 ? EIXO : GRID; g.beginPath(); g.moveTo(X0, yy); g.lineTo(X1, yy); g.stroke(); g.fillStyle = MUTED; g.fillText(nf(ys < 1 ? 1 : 0).format(v), X0 - 18, yy); }
      for (let q = 0; q <= xMax + 1e-9; q += xStep) { const xx = sx(q); g.strokeStyle = GRID; g.beginPath(); g.moveTo(xx, pn.y0); g.lineTo(xx, pn.y1); g.stroke(); }
      g.fillStyle = TXT; g.font = FT(600, 34); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(pn.nome + ' (' + U[pn.k] + ')', X0, pn.y0 - 18);
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
      if (sh[1]) { const yy = ph.sy(sh[1]); g.setLineDash([14, 12]); g.strokeStyle = MUTED; g.lineWidth = 3; g.beginPath(); g.moveTo(sx(0), yy); g.lineTo(sx(xMax * 0.16), yy); g.stroke(); g.setLineDash([]); tri(sx(0) + 6, yy, true); rotulo(t.shut + ' ' + t.lim + ' ' + fh(sh[1]), sx(xMax * 0.16), yy, 'd', MUTED); }
      if (h150[1] && q150) { const xx = sx(q150), yy = ph.sy(h150[1]); g.setLineDash([14, 12]); g.strokeStyle = MUTED; g.lineWidth = 3; g.beginPath(); g.moveTo(xx - 90, yy); g.lineTo(xx + 90, yy); g.stroke(); g.setLineDash([]); tri(xx, yy, false); rotulo(t.lim + ' 150%: ' + fh(h150[1]), xx, yy + 48, 'd', MUTED); }
      if (h150[0] && q150) { ponto(sx(q150), ph.sy(h150[0]), false); rotulo(t.p150 + ': ' + fq(q150) + ' · ' + fh(h150[0]), sx(q150), ph.sy(h150[0]) + 104, 'e'); }
      if (sh[0]) { ponto(sx(0), ph.sy(sh[0]), false); }
      if (qN && hN && Math.abs(qN - (qT || 0)) / qN > 0.01) { ponto(sx(qN), ph.sy(hN), false); rotulo(t.nfpa + ': ' + fq(qN) + ' · ' + fh(hN), sx(qN), ph.sy(hN) + 52, 'e'); }
      if (qT && hT) { const xx = sx(qT), yy = ph.sy(hT); g.setLineDash([6, 10]); g.strokeStyle = ESC; g.lineWidth = 3; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, ph.y1); g.stroke(); g.setLineDash([]); ponto(xx, yy, true); rotulo(t.trab + ': ' + fq(qT) + ' · ' + fh(hT), xx, yy + 50, 'd'); }
    }
    // eixo x (vazão) com equivalente em m³/h quando a vazão vem em galões
    const yb = paineis[paineis.length - 1].y1; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let q = 0; q <= xMax + 1e-9; q += xStep) { const xx = sx(q); g.fillStyle = MUTED; g.font = FT(400, 30); g.fillText(nf(0).format(q), xx, yb + 16); if (/gpm/i.test(U.q)) { g.font = FT(400, 24); g.fillText(nf(0).format(q * 0.2271247), xx, yb + 54); } }
    g.fillStyle = TXT; g.font = FT(600, 34); g.fillText(t.q + ' (' + U.q + (/gpm/i.test(U.q) ? ' · m³/h' : '') + ')', (X0 + X1) / 2, yb + 96);
    // cabeçalho: modelo, rotor e rotação (como vieram da folha) e o logo
    const mod = campo(dados, /Project/i, /Model$|^Model \//); const rot = campo(dados, /NFPA|Construction/i, /^Impeller diameter, rated$|^Impeller Diameter$/); const rpm = campo(dados, /NFPA|Operating/i, /^Speed, rated$/);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = ESC; g.font = FT(600, 40);
    const dec = (v) => (lang === 'en' ? v : String(v).replace(/(\d),(\d{3})/g, '$1\u0000$2').replace(/(\d)\.(\d)/g, '$1,$2').replace(/\u0000/g, '.'));
    g.fillText([dados.fabricante, mod].filter(Boolean).join(' ') + (rot ? ' · ' + t.rotor + ' ' + dec(rot) : '') + (rpm ? ' · ' + rpm : ''), X0, 58);
    if (o.logo) { try { const im = new Image(); im.src = o.logo; await im.decode(); const w = 230, h = w * im.height / im.width; g.drawImage(im, W - 70 - w, 18, w, h); } catch (e) { /* sem logo */ } }
    g.fillStyle = LAR; g.fillRect(X0, 80, 120, 6);
    g.fillStyle = MUTED; g.font = FT(400, 26); g.textAlign = 'right'; g.fillText(t.fonte + (dados.pontos.pag ? ' (p. ' + dados.pontos.pag + ')' : '') + '.', X1, H - 22);
    return cv.toDataURL('image/png');
  }
  window.PricerCurva = { desenhar, temPontos };
})();
