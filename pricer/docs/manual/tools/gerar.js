// Gera o manual (DOCX) no padrão LS Fire Interno a partir de docs/manual/fonte/capNN.js
// e das capturas em docs/manual/prints/anotado. O PDF sai do DOCX (tools/pdf.py).
// Uso: node docs/manual/tools/gerar.js [manual|guia]
const path = require('path'), fs = require('fs'), cp = require('child_process');
const D = require(cp.execSync('npm root -g').toString().trim() + '/docx');
const MAN = path.resolve(__dirname, '..');
const FONTE = path.join(MAN, 'fonte'), PRINTS = path.join(MAN, 'prints'), SAIDA = path.join(MAN, 'saida');
// LEVE=1: versão para celular (imagens menores e mais comprimidas; arquivo com "-celular" no nome)
const LEVE = !!process.env.LEVE;
const CACHE = path.join(SAIDA, LEVE ? '.img-leve' : '.img');
const META = require(path.join(FONTE, 'meta.js'));
const LOGO = path.join(MAN, 'fonte', 'logo_lsfire_colorido.jpg');
const OR = 'FF6600', CZ = '404040', OR_CL = 'FFE5CC', LINHA = 'CCCCCC';
const A4 = { w: 11906, h: 16838 }, MRG = 1134, UTIL = A4.w - 2 * MRG; // 2 cm de margem

const qual = process.argv[2] || 'manual';
// manuais por público (meta.manuais): usuario, admin. 'manual' = todos os capítulos num documento só
const CONF = (META.manuais || {})[qual] || null;
if (CONF) Object.assign(META, { titulo: CONF.titulo, subtitulo: CONF.subtitulo || META.subtitulo, arquivo: CONF.arquivo, revisoes: CONF.revisoes || META.revisoes });
// referências "capítulo N" (número do arquivo capNN) viram o número no documento gerado, ou o do outro manual
let REFS = (t) => t;
fs.mkdirSync(CACHE, { recursive: true });

// ---------- imagens ----------
function imagem(arq) {
  const src = path.join(PRINTS, 'anotado', arq);
  const jpg = path.join(CACHE, arq.replace(/\.png$/, '.jpg'));
  if (!fs.existsSync(jpg) || fs.statSync(jpg).mtimeMs < fs.statSync(src).mtimeMs)
    cp.execFileSync('convert', [src, '-resize', LEVE ? '1000x>' : '1800x>', '-quality', LEVE ? '55' : '86', jpg]);
  const [w, h] = cp.execFileSync('identify', ['-format', '%w %h', jpg]).toString().split(' ').map(Number);
  return { data: fs.readFileSync(jpg), w, h };
}
function dimensiona(w, h, maxW, maxH) { const k = Math.min(maxW / w, maxH / h, 1e9); return { width: Math.round(w * k), height: Math.round(h * k) }; }

// ---------- texto ----------
function runs(txt, base) {
  base = base || {}; const out = [];
  REFS(String(txt)).split(/(\*\*[^*]+\*\*)/).forEach((s) => { if (!s) return; const b = /^\*\*(.+)\*\*$/.exec(s); out.push(new D.TextRun(Object.assign({ text: b ? b[1] : s, font: 'Arial' }, base, b ? { bold: true } : {}))); });
  return out;
}
const P = (txt, o) => new D.Paragraph(Object.assign({ children: runs(txt, (o || {}).run), spacing: { after: 120, line: 276 } }, o && o.p));
const vazio = (pt) => Object.assign(new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: '', size: pt || 8 })] }), { _vazio: true });
// tira os espaçadores do fim de um bloco: no fim da página eles criariam uma página em branco antes da quebra seguinte
const semVazioFinal = (l) => { while (l.length && l[l.length - 1]._vazio) l.pop(); return l; };
const borda = (c, s) => ({ style: D.BorderStyle.SINGLE, size: s || 4, color: c });
const semBorda = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function tabela(cab, lin, larg) {
  const n = cab.length;
  if (!larg) { const pesos = cab.map((c, i) => Math.max(8, Math.min(60, Math.max(String(c).length, ...lin.map((l) => String(l[i] || '').length)))));
    const tot = pesos.reduce((a, b) => a + b, 0); larg = pesos.map((p) => Math.round(UTIL * p / tot)); larg[n - 1] = UTIL - larg.slice(0, -1).reduce((a, b) => a + b, 0); }
  const cel = (t, i, head) => new D.TableCell({ width: { size: larg[i], type: D.WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: head ? { type: D.ShadingType.CLEAR, color: 'auto', fill: OR_CL } : undefined,
    children: String(t == null ? '' : t).split('\n').map((x) => new D.Paragraph({ spacing: { after: 0 }, children: runs(x, { size: 19, bold: head || undefined }) })) });
  return new D.Table({ width: { size: UTIL, type: D.WidthType.DXA }, columnWidths: larg,
    borders: { top: borda(LINHA), bottom: borda(LINHA), left: borda(LINHA), right: borda(LINHA), insideHorizontal: borda(LINHA), insideVertical: borda(LINHA) },
    rows: [new D.TableRow({ tableHeader: true, children: cab.map((c, i) => cel(c, i, true)) }), ...lin.map((l) => new D.TableRow({ cantSplit: true, children: cab.map((_, i) => cel(l[i], i)) }))] });
}

const CAIXAS = {
  aviso: ['ATENÇÃO', OR, 'FFF0E6'], dica: ['DICA', CZ, 'F2F2F2'], nota: ['OBSERVAÇÃO', '8C8C8C', 'F7F7F7'],
  nv: ['NÃO VALIDADO', 'C00000', 'FDECEC'], resultado: ['RESULTADO ESPERADO', CZ, 'FFFFFF'], criterio: ['CRITÉRIO DE CONCLUSÃO', OR, 'FFFFFF'],
};
function caixa(tipo, x) {
  const [rot, cor, fundo] = CAIXAS[tipo];
  const textos = Array.isArray(x) ? x : [x];
  return new D.Table({ width: { size: UTIL, type: D.WidthType.DXA }, columnWidths: [UTIL],
    borders: { top: borda(cor, 2), bottom: borda(cor, 2), right: borda(cor, 2), left: { style: D.BorderStyle.SINGLE, size: 24, color: cor }, insideHorizontal: semBorda, insideVertical: semBorda },
    rows: [new D.TableRow({ cantSplit: true, children: [new D.TableCell({ width: { size: UTIL, type: D.WidthType.DXA }, shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: fundo }, margins: { top: 80, bottom: 80, left: 160, right: 140 },
      children: textos.map((t, i) => new D.Paragraph({ spacing: { after: i === textos.length - 1 ? 0 : 60 }, children: [...(i === 0 ? [new D.TextRun({ text: rot + '  ', bold: true, color: cor, font: 'Arial', size: 18 })] : []), ...runs(t, { size: 20 })] })) })] })] });
}

// ---------- figuras ----------
let regCapt = {};
for (const f of fs.readdirSync(PRINTS).filter((f) => /^capturas-cap\d\d\.json$/.test(f))) Object.assign(regCapt, JSON.parse(fs.readFileSync(path.join(PRINTS, f), 'utf8')));
const figuras = []; // para o relatório e a lista de figuras
function figura(cap, id, ctx, recuo) {
  const s = (cap.capturas || []).find((c) => c.id === id); const r = regCapt[id];
  if (!s || !r) return [caixa('nv', `Figura ${id} não encontrada nas capturas.`)];
  // a mesma tela citada de novo no capítulo: remete à figura já mostrada
  ctx.vistas = ctx.vistas || {};
  if (ctx.vistas[id]) return [new D.Paragraph({ indent: { left: recuo ? 460 : 0 }, spacing: { after: 100 }, children: [new D.TextRun({ text: `Veja a Figura ${ctx.vistas[id]} — ${s.titulo}.`, italics: true, size: 19, color: CZ, font: 'Arial' })] })];
  ctx.fig++; const num = `${cap.n}.${ctx.fig}`; ctx.vistas[id] = num;
  figuras.push({ num, id, titulo: s.titulo, arquivo: r.arquivo, ok: r.ok, problemas: r.problemas, cap: cap.n });
  const im = imagem(r.arquivo);
  const cel = (s.vp || 'desktop') === 'celular';
  const maxW = (cel ? 250 : 640) - (recuo ? 24 : 0); const dim = dimensiona(im.w, im.h, maxW, cel ? 520 : 800);
  const out = [
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 }, children: [new D.ImageRun({ type: 'jpg', data: im.data, transformation: dim, altText: { title: s.titulo, description: `Figura ${num}: ${s.titulo}`, name: id } })] }),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, keepNext: (r.marcas || []).length > 0, spacing: { after: 80 }, children: [new D.TextRun({ text: `Figura ${num} — `, bold: true, size: 18, color: CZ, font: 'Arial' }), new D.TextRun({ text: s.titulo, italics: true, size: 18, color: CZ, font: 'Arial' })] }),
  ];
  (r.marcas || []).forEach((m, i, a) => out.push(new D.Paragraph({ keepNext: i < a.length - 1, keepLines: true, indent: { left: 567 + (recuo ? 360 : 0), hanging: 340 }, spacing: { after: 30 }, children: [new D.TextRun({ text: String(m.n), bold: true, color: OR, size: 19, font: 'Arial' }), new D.TextRun({ text: '\t', size: 19 }), ...runs(m.txt, { size: 19 })], tabStops: [{ type: D.TabStopType.LEFT, position: 567 + (recuo ? 360 : 0) }] })));
  out.push(vazio(6));
  if (!r.ok) out.push(caixa('nv', `Esta figura não pôde ser totalmente validada na captura automática: ${(r.problemas || []).join('; ')}.`));
  return out;
}

// ---------- blocos ----------
let instancia = 0;
function blocos(cap, lista, ctx) {
  const out = [];
  for (const b of lista || []) {
    if (b.t === 'p') out.push(P(b.x));
    else if (b.t === 'h') out.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun({ text: b.x })] }));
    else if (b.t === 'h3') out.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_3, children: [new D.TextRun({ text: b.x })] }));
    else if (b.t === 'fig') out.push(...figura(cap, b.id, ctx));
    else if (b.t === 'lista') for (const it of b.itens) out.push(new D.Paragraph({ numbering: { reference: 'marca', level: 0 }, spacing: { after: 60 }, children: runs(it) }));
    else if (b.t === 'numerada') { instancia++; for (const it of b.itens) out.push(new D.Paragraph({ numbering: { reference: 'passos', level: 0, instance: instancia }, spacing: { after: 60 }, children: runs(it) })); }
    else if (b.t === 'tab') { out.push(tabela(b.cab, b.lin, b.larg)); out.push(vazio(10)); }
    else if (CAIXAS[b.t]) { out.push(caixa(b.t, b.x)); out.push(vazio(10)); }
    else if (b.t === 'tut') out.push(...tutorial(cap, b, ctx));
    else if (b.t === 'quebra') out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
    else out.push(caixa('nv', 'Bloco desconhecido: ' + b.t));
  }
  return out;
}
function tutorial(cap, b, ctx) {
  ctx.tut++;
  const out = [new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, keepNext: true, children: [new D.TextRun({ text: `${b.rotulo || 'Tutorial'} ${cap.n}.${ctx.tut} — ${b.titulo}` })] })];
  const L1 = 2300, L2 = UTIL - L1;
  const linha = (rot, val) => new D.TableRow({ cantSplit: true, children: [
    new D.TableCell({ width: { size: L1, type: D.WidthType.DXA }, shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: OR_CL }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: rot, bold: true, size: 19, font: 'Arial' })] })] }),
    new D.TableCell({ width: { size: L2, type: D.WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: (Array.isArray(val) ? val : [val]).map((v) => new D.Paragraph(Object.assign({ spacing: { after: 20 }, children: runs(v, { size: 19 }) }, Array.isArray(val) && val.length > 1 ? { numbering: { reference: 'marca', level: 0 } } : {}))) }),
  ] });
  const pre = b.pre && b.pre.length ? b.pre : ['Nenhum.'];
  out.push(new D.Table({ width: { size: UTIL, type: D.WidthType.DXA }, columnWidths: [L1, L2], borders: { top: borda(LINHA), bottom: borda(LINHA), left: borda(LINHA), right: borda(LINHA), insideHorizontal: borda(LINHA), insideVertical: borda(LINHA) },
    rows: [linha('Objetivo', b.objetivo), linha('Quem pode executar', b.quem), linha('Pré-requisitos', pre)] }));
  out.push(new D.Paragraph({ keepNext: true, spacing: { before: 160, after: 80 }, children: [new D.TextRun({ text: 'Passo a passo', bold: true, color: OR, font: 'Arial', size: 21 })] }));
  instancia++;
  for (const st of b.passos || []) {
    const x = typeof st === 'string' ? st : st.x;
    out.push(new D.Paragraph({ numbering: { reference: 'passos', level: 0, instance: instancia }, keepNext: !!(st.fig), spacing: { after: 80 }, children: runs(x) }));
    if (st.fig) out.push(...figura(cap, st.fig, ctx, true));
    if (st.nota) out.push(caixa('nota', st.nota), vazio(6));
  }
  if (b.resultado) { out.push(vazio(6), caixa('resultado', b.resultado)); }
  if (b.criterio) { out.push(vazio(6), caixa('criterio', b.criterio)); }
  if (b.atencao) { out.push(vazio(6), caixa('aviso', b.atencao)); }
  if (b.dica) { out.push(vazio(6), caixa('dica', b.dica)); }
  if (b.nv) { out.push(vazio(6), caixa('nv', b.nv)); }
  out.push(vazio(14));
  return out;
}

// ---------- cabeçalho e rodapé LS Fire ----------
function cabecalho(titulo) {
  const k = UTIL / 10065; const c = [Math.round(2620 * k), Math.round(6168 * k)]; c.push(UTIL - c[0] - c[1]);
  const logo = fs.readFileSync(LOGO);
  const bd = borda('000000');
  const cel = (w, kids, o) => new D.TableCell(Object.assign({ width: { size: w, type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: kids }, o));
  const t = (x, o) => new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 0 }, children: [new D.TextRun(Object.assign({ text: x, font: 'Arial' }, o))] });
  const tab = new D.Table({ width: { size: UTIL, type: D.WidthType.DXA }, columnWidths: c, borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd }, rows: [
    new D.TableRow({ children: [
      cel(c[0], [new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 0 }, children: [new D.ImageRun({ type: 'jpg', data: logo, transformation: { width: 125, height: 48 } })] })], { verticalMerge: D.VerticalMergeType.RESTART }),
      cel(c[1], [t(titulo || META.titulo, { bold: true, size: 24 }), t(META.subtitulo, { size: 16, color: CZ })], { verticalMerge: D.VerticalMergeType.RESTART }),
      cel(c[2], [t(META.codigo, { bold: true, size: 18 }), t('Revisão: ' + META.revisao, { size: 15 })]),
    ] }),
    new D.TableRow({ children: [cel(c[0], [new D.Paragraph({})], { verticalMerge: D.VerticalMergeType.CONTINUE }), cel(c[1], [new D.Paragraph({})], { verticalMerge: D.VerticalMergeType.CONTINUE }), cel(c[2], [t('Data:', { size: 15 }), t(META.data, { size: 15 })])] }),
    new D.TableRow({ children: [
      cel(c[0] + c[1], [new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: 'Elaborado por: ', bold: true, size: 17, font: 'Arial' }), new D.TextRun({ text: (META.elaborado || '') + '          ', size: 17, font: 'Arial' }), new D.TextRun({ text: 'Aprovado por: ', bold: true, size: 17, font: 'Arial' }), new D.TextRun({ text: META.aprovado || '', size: 17, font: 'Arial' })] })], { columnSpan: 2 }),
      cel(c[2], [new D.Paragraph({})]),
    ] }),
  ] });
  return new D.Header({ children: [tab, new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: '', size: 8 })] })] });
}
function rodape() {
  return new D.Footer({ children: [new D.Paragraph({ border: { top: { style: D.BorderStyle.SINGLE, size: 8, color: OR, space: 4 } }, tabStops: [{ type: D.TabStopType.RIGHT, position: UTIL }], spacing: { after: 0 },
    children: [new D.TextRun({ text: 'LS FIRE · A FORÇA DA ÁGUA É A NOSSA FORÇA · lsfire.com.br', size: 15, color: CZ, font: 'Arial' }), new D.TextRun({ text: '\t', size: 15 }),
      new D.TextRun({ children: [`${META.codigo} · Rev. ${META.revisao} · Página `, D.PageNumber.CURRENT, ' de ', D.PageNumber.TOTAL_PAGES], size: 15, color: CZ, font: 'Arial' })] }),
  new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: 'Documento interno · uso restrito · circulação interna', size: 13, color: '8C8C8C', font: 'Arial' })] })] });
}

// ---------- capa ----------
function capa(tituloDoc, subt) {
  const logo = fs.readFileSync(LOGO);
  const L = (x, o, p) => new D.Paragraph(Object.assign({ alignment: D.AlignmentType.LEFT, spacing: { after: 0 }, children: [new D.TextRun(Object.assign({ text: x, font: 'Arial' }, o))] }, p));
  return [
    new D.Paragraph({ spacing: { before: 600, after: 600 }, children: [new D.ImageRun({ type: 'jpg', data: logo, transformation: { width: 300, height: 115 } })] }),
    L(tituloDoc[0], { size: 52, bold: true }, { spacing: { after: 0 } }),
    L(tituloDoc[1], { size: 64, bold: true, color: OR }, { spacing: { after: 240 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 24, color: OR, space: 8 } } }),
    L(subt, { size: 30, color: CZ }, { spacing: { before: 200, after: 1400 } }),
    tabela(['Documento', 'Revisão', 'Data', 'Sistema'], [[META.codigo, META.revisao, META.data, META.sistema]], [UTIL * 0.3, UTIL * 0.18, UTIL * 0.22, UTIL * 0.3].map(Math.round)),
    vazio(),
    L('Elaborado por: ' + (META.elaborado || '__________________________') + '     Aprovado por: ' + (META.aprovado || '__________________________'), { size: 18, color: CZ }, { spacing: { before: 200 } }),
    new D.Paragraph({ spacing: { before: 2600 }, children: [new D.TextRun({ text: 'A FORÇA DA ÁGUA É A NOSSA FORÇA', bold: true, size: 22, color: OR, font: 'Arial' })] }),
    L('lsfire.com.br', { size: 18, color: CZ }),
    new D.Paragraph({ children: [new D.PageBreak()] }),
  ];
}

function estilos() {
  return {
    default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, font: 'Arial', color: '000000' }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0, keepNext: true, border: { bottom: { style: D.BorderStyle.SINGLE, size: 18, color: OR, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, font: 'Arial', color: OR }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: 'Arial', color: CZ }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: true } },
    ],
  };
}
const numeracao = { config: [
  { reference: 'marca', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
  { reference: 'passos', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT, style: { run: { bold: true, color: OR }, paragraph: { indent: { left: 460, hanging: 360 } } } }] },
] };

function documento(filhos, extras) {
  return new D.Document(Object.assign({ creator: 'LS Fire', title: META.titulo, description: META.subtitulo, styles: estilos(), numbering: numeracao, features: { updateFields: true },
    sections: [{ properties: { titlePage: true, page: { size: { width: A4.w, height: A4.h }, margin: { top: 1000, bottom: 1000, left: MRG, right: MRG, header: 400, footer: 400 } } },
      headers: { default: cabecalho(), first: new D.Header({ children: [new D.Paragraph({})] }) }, footers: { default: rodape(), first: new D.Footer({ children: [new D.Paragraph({})] }) }, children: filhos }] }, extras));
}

// ---------- manual ----------
function capitulos() {
  return fs.readdirSync(FONTE).filter((f) => /^cap\d\d\.js$/.test(f)).sort().map((f) => require(path.join(FONTE, f)));
}
function manual() {
  const todos = capitulos(); const porN = new Map(todos.map((c) => [c.n, c]));
  const lista = CONF ? CONF.caps.map((n) => porN.get(n)).filter(Boolean) : todos;
  const disp = new Map(lista.map((c, i) => [c.n, i + 1]));
  if (CONF) {
    const outro = CONF.outro && META.manuais[CONF.outro]; const dOutro = outro ? new Map(outro.caps.map((n, i) => [n, i + 1])) : new Map();
    REFS = (t) => t.replace(/([Cc])apítulos? (\d+)(?: e (\d+))?/g, (m, c, a, b) => { const f = (n) => (disp.has(+n) ? String(disp.get(+n)) : dOutro.has(+n) ? dOutro.get(+n) + ' do ' + outro.nome : n);
      const fa = f(a), fb = b ? f(b) : null; return c + 'apítulo' + (b ? 's ' + fa + ' e ' + fb : ' ' + fa); });
  }
  const caps = lista.map((c) => Object.assign({}, c, { n: disp.get(c.n) }));
  const F = [...capa(CONF ? CONF.capa : ['MANUAL DE UTILIZAÇÃO', 'LS PRICER'], META.subtitulo)];
  // controle do documento
  F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun('Controle do documento')] }));
  F.push(tabela(['Revisão', 'Data', 'Descrição', 'Elaborado por', 'Aprovado por'], META.revisoes.map((r) => [r.rev, r.data, r.desc, r.elab || '', r.aprov || '']), [900, 1300, 4300, 1570, 1570].map((x) => Math.round(x * UTIL / 9640))));
  F.push(vazio(10));
  F.push(...semVazioFinal(blocos({ n: 0, capturas: [] }, (CONF && CONF.intro ? CONF.intro : []).concat(META.sobre), { fig: 0, tut: 0 })));
  F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new D.TextRun('Sumário')] }));
  F.push(new D.TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-2' }));
  const gloss = new Map(META.glossario.map(([a, b]) => [a, b]));
  for (const cap of caps) {
    F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new D.TextRun(`${cap.n}. ${cap.titulo}`)] }));
    F.push(...semVazioFinal(blocos(cap, cap.conteudo, { fig: 0, tut: 0 })));
    for (const [a, b] of cap.glossario || []) if (!gloss.has(a)) gloss.set(a, b);
  }
  F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new D.TextRun('Glossário')] }));
  F.push(tabela(['Termo', 'Significado'], [...gloss.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt')), [Math.round(UTIL * 0.27), UTIL - Math.round(UTIL * 0.27)]));
  F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new D.TextRun('Lista de figuras')] }));
  F.push(tabela(['Figura', 'Título', 'Arquivo (prints/anotado e prints/original)'], figuras.map((f) => [f.num, f.titulo + (f.ok ? '' : ' (não validada)'), f.arquivo]), [1000, 4700, 3940].map((x) => Math.round(x * UTIL / 9640))));
  return { doc: documento(F), caps };
}

// ---------- guia rápido ----------
function guia() {
  const G = require(path.join(FONTE, 'guia-rapido.js'));
  // "cap. N" (número do arquivo capNN) vira o capítulo do Manual do Usuário (MU) ou do Administrador (MA)
  if (META.manuais) { const mu = new Map(META.manuais.usuario.caps.map((n, i) => [n, i + 1])), ma = new Map(META.manuais.admin.caps.map((n, i) => [n, i + 1]));
    const um = (n) => (mu.has(+n) ? 'MU ' + mu.get(+n) : ma.has(+n) ? 'MA ' + ma.get(+n) : 'cap. ' + n);
    REFS = (t) => t.replace(/cap\. (\d+)(?: (a|e) (\d+))?/g, (m, a, sep, b) => (b ? um(a) + ' ' + sep + ' ' + um(b) : um(a))); }
  const caps = capitulos(); const porId = {}; for (const c of caps) for (const s of c.capturas || []) porId[s.id] = c;
  const F = [];
  F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun('Guia rápido — LS Pricer')] }));
  F.push(...blocos({ n: 'G', capturas: [] }, G.intro, { fig: 0, tut: 0 }));
  for (const sec of G.secoes) {
    F.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun(sec.titulo)] }));
    if (sec.fig) { const c = porId[sec.fig]; if (c) F.push(...figura(Object.assign({}, c, { n: 'G' }), sec.fig, { fig: sec.ordem || 0, tut: 0 })); }
    F.push(...blocos({ n: 'G', capturas: [] }, sec.blocos, { fig: 0, tut: 0 }));
  }
  return { doc: new D.Document({ creator: 'LS Fire', title: 'Guia rápido — LS Pricer', styles: estilos(), numbering: numeracao,
    sections: [{ properties: { page: { size: { width: A4.w, height: A4.h }, margin: { top: 1000, bottom: 900, left: MRG, right: MRG, header: 400, footer: 400 } } }, headers: { default: cabecalho('GUIA RÁPIDO — LS PRICER') }, footers: { default: rodape() }, children: F }] }) };
}

(async () => {
  const r = qual === 'guia' ? guia() : manual();
  const nome = (qual === 'guia' ? META.arquivoGuia : META.arquivo) + (LEVE ? '-celular' : '');
  const tmp = path.join(CACHE, nome + '.tmp.docx');
  fs.writeFileSync(tmp, await D.Packer.toBuffer(r.doc));
  // marca d'água "DOCUMENTO INTERNO" nos cabeçalhos (padrão LS Fire Interno)
  cp.execFileSync('python3', [path.join(__dirname, 'marca_dagua.py'), tmp, path.join(SAIDA, nome + '.docx')], { stdio: 'inherit' });
  if (qual !== 'guia') fs.writeFileSync(path.join(SAIDA, '.figuras.json'), JSON.stringify(figuras, null, 1));
  console.log('ok', path.join(SAIDA, nome + '.docx'), figuras.length, 'figuras');
})();
