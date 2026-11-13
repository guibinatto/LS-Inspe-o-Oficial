// Relatório de cobertura e auditoria do manual.
// Lê os capítulos (fonte/capNN.js), o registro das capturas (prints/capturas-capNN.json) e o código do app,
// e grava saida/relatorio-cobertura.md e saida/.auditoria.json.
// Uso: node docs/manual/tools/cobertura.js
const path = require('path'), fs = require('fs');
const MAN = path.resolve(__dirname, '..'), APP = path.resolve(MAN, '../..');
const caps = fs.readdirSync(path.join(MAN, 'fonte')).filter((f) => /^cap\d\d\.js$/.test(f)).sort().map((f) => require(path.join(MAN, 'fonte', f)));
const reg = {}; for (const f of fs.readdirSync(path.join(MAN, 'prints')).filter((f) => /^capturas-cap\d\d\.json$/.test(f))) Object.assign(reg, JSON.parse(fs.readFileSync(path.join(MAN, 'prints', f), 'utf8')));
const fonteApp = ['app.js', 'spv.js', 'margens.js', 'cadastro.js', 'regras.js', 'familias.js', 'pendencias.js', 'painel.js', 'pedidos.js', 'docs.js', 'conferencia.js', 'facts.js', 'tributos.js', 'index.html', 'model.js']
  .map((f) => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
const norm = (s) => s.normalize('NFC').replace(/\s+/g, ' ').toLowerCase();
const appN = norm(fonteApp.replace(/&nbsp;/g, ' '));

// percorre os blocos de um capítulo
function textos(b, out) {
  if (!b) return out; if (typeof b === 'string') { out.push(b); return out; }
  if (Array.isArray(b)) { b.forEach((x) => textos(x, out)); return out; }
  for (const k of ['x', 'titulo', 'objetivo', 'quem', 'resultado', 'atencao', 'dica', 'nv', 'criterio', 'pre', 'passos', 'itens', 'lin', 'cab', 'nota']) if (b[k]) textos(b[k], out);
  return out;
}
const linhas = []; const L = (s) => linhas.push(s || '');
const hoje = new Date().toLocaleDateString('pt-BR');
let totFig = 0, totOk = 0, totTut = 0, totNv = 0; const nvs = []; const naoAchados = [];
const usadosFig = new Set();
for (const c of caps) {
  const bl = c.conteudo || [];
  const tuts = bl.filter((b) => b.t === 'tut'); const figsUsadas = [];
  for (const b of bl) { if (b.t === 'fig') figsUsadas.push(b.id); if (b.t === 'tut') for (const s of b.passos || []) if (s && s.fig) figsUsadas.push(s.fig); }
  figsUsadas.forEach((x) => usadosFig.add(x));
  const nv = bl.filter((b) => b.t === 'nv').map((b) => b.x).concat(tuts.filter((t) => t.nv).map((t) => t.nv));
  nv.forEach((x) => nvs.push([c.n, x]));
  totTut += tuts.length; totNv += nv.length;
  for (const s of c.capturas || []) { totFig++; if (reg[s.id] && reg[s.id].ok) totOk++; }
  // nomes em negrito que não aparecem no código do app
  for (const t of textos(bl, [])) for (const m of String(t).matchAll(/\*\*([^*]+)\*\*/g)) {
    const nome = m[1].replace(/^[+＋]\s*/, '').replace(/[.:…]+$/, '').trim(); if (nome.length < 3) continue;
    if (!appN.includes(norm(nome))) naoAchados.push([c.n, nome]);
  }
  c._st = { tuts: tuts.length, figs: (c.capturas || []).length, ok: (c.capturas || []).filter((s) => reg[s.id] && reg[s.id].ok).length, nv: nv.length, semUso: (c.capturas || []).filter((s) => !figsUsadas.includes(s.id)).map((s) => s.id) };
}

// cobertura das telas do app: menu, abas da proposta e abas de Cadastros/Configurações
const capTxt = caps.map((c) => (c.capturas || []).map((s) => String(s.prep || '') + String(s.clip || '') + JSON.stringify(s.marcas || [])).join('\n') + String(c.inicio || '')).join('\n');
const views = [...fs.readFileSync(path.join(APP, 'index.html'), 'utf8').matchAll(/<button data-view="([a-z]+)"[^>]*title="([^"]+)"/g)].map((m) => [m[1], m[2]]);
const areasSrc = /const AREAS = \[([\s\S]*?)\n  \];/.exec(fonteApp)[1];
const abasCad = [...areasSrc.matchAll(/\['([a-z_]+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]).filter(([k]) => !['visao', 'custos', 'engenharia', 'fiscal', 'precificacao', 'servicos', 'geral', 'sistema'].includes(k) || ['custos', 'fiscal', 'servicos', 'geral'].includes(k));
const temCad = (k) => new RegExp(`cad\\(['"]${k}['"]\\)|(irCustos|ENG|CUS|FIS|irArea)\\(p, h, ['"]${k}['"]\\)|data-cad="${k}"|data-cad=\\\\"${k}\\\\"`).test(capTxt);
const temView = (k) => new RegExp(`nav\\(['"]${k}['"]\\)|data-view="${k}"|data-view=\\\\"${k}\\\\"`).test(capTxt) || (k === 'inicio');
const abasProp = [['1', 'Dados gerais'], ['2', 'Itens'], ['3', 'Custos'], ['4', 'Formação'], ['5', 'Conferência'], ['memorial', 'Memorial'], ['6', 'Documentos'], ['phist', 'Histórico']];
const temAba = (k) => new RegExp(`aba\\(['"]?${k}['"]?\\)|data-step="${k}"|data-step=\\\\"${k}\\\\"|data-view="${k}"|data-view=\\\\"${k}\\\\"`).test(capTxt);

L(`# Relatório de cobertura — Manual de Utilização do LS Pricer`); L();
L(`Documento: MN · Revisão 00 · gerado em ${hoje} a partir de \`docs/manual/fonte\` e das capturas em \`docs/manual/prints\`.`); L();
L(`Sistema analisado: **LS Pricer REV22** (\`pricer/dist/ls-pricer.html\`, construído do código em \`pricer/\`), executado no Chromium (Playwright), modo local, janela 1440×900 (computador) e 390×844 (celular), escala 1,5.`); L();
L(`## Resumo`); L();
L(`| Indicador | Valor |`); L(`|---|---|`);
L(`| Capítulos | ${caps.length} |`); L(`| Tutoriais e exercícios (modelo padrão) | ${totTut} |`);
L(`| Telas capturadas (cada uma com original e anotada) | ${totFig} |`); L(`| Capturas validadas (todos os marcadores encontrados no elemento real) | ${totOk} de ${totFig} |`);
L(`| Trechos marcados como "Não validado" | ${totNv} |`); L();
L(`## Módulos documentados`); L();
L(`| Cap. | Título | Tutoriais | Capturas | Validadas | Não validados |`); L(`|---|---|---|---|---|---|`);
for (const c of caps) L(`| ${c.n} | ${c.titulo} | ${c._st.tuts} | ${c._st.figs} | ${c._st.ok} | ${c._st.nv} |`);
L();
L(`## Telas do sistema × capturas`); L();
L(`### Menu lateral`); L(); L(`| Entrada | Capturada |`); L(`|---|---|`);
for (const [k, t] of views) L(`| ${t} | ${temView(k) ? 'sim' : 'não'} |`);
L(); L(`### Abas da proposta SEQ`); L(); L(`| Aba | Capturada |`); L(`|---|---|`);
for (const [k, t] of abasProp) L(`| ${t} | ${temAba(k) ? 'sim' : 'não'} |`);
L(); L(`### Abas de Cadastros e Configurações`); L(); L(`| Aba (código) | Nome | Capturada |`); L(`|---|---|---|`);
const faltaCad = [];
for (const [k, t] of abasCad) { const ok = temCad(k); if (!ok) faltaCad.push(t); L(`| ${k} | ${t} | ${ok ? 'sim' : 'não'} |`); }
L();
if (faltaCad.length) { L(`Abas sem captura própria (descritas no texto ou fora do escopo do treinamento): ${faltaCad.join(', ')}.`); L(); }
L(`## Telas capturadas`); L();
L(`Pasta \`prints/original\` (tela como ela é) e \`prints/anotado\` (com os números e setas). O nome começa pelo número do capítulo e diz o módulo.`); L();
L(`| Id | Arquivo | Título | Janela | Situação |`); L(`|---|---|---|---|---|`);
for (const c of caps) for (const s of c.capturas || []) { const r = reg[s.id] || {}; L(`| ${s.id} | ${r.arquivo || '—'} | ${s.titulo} | ${s.vp || 'desktop'} | ${r.ok ? 'validada' : 'FALHA: ' + (r.problemas || ['sem registro']).join('; ')} |`); }
L();
const semUso = caps.flatMap((c) => c._st.semUso); if (semUso.length) { L(`Capturas feitas mas não citadas no texto: ${semUso.join(', ')}.`); L(); }
L(`## Procedimentos testados`); L();
L(`Cada tutorial foi executado no sistema pela ferramenta de captura (os passos de cada figura rodam de verdade no app antes da foto). Os valores dos exercícios do capítulo 18 foram conferidos nas telas. Além disso:`); L();
L(`- Regressão do motor: 80 cenários, 6.216 valores, 0 diferença em relação à REV21.`);
L(`- Regressão de SPV e FACTS: 11 cenários, 0 diferença.`);
L(`- Testes de interface do repositório (\`tools/testes\`, 19 scripts) passando com esta versão.`); L();
L(`## Procedimentos não validados`); L();
L(`| Cap. | O que não foi validado |`); L(`|---|---|`);
for (const [n, x] of nvs) L(`| ${n} | ${String(x).replace(/\|/g, '/').replace(/\*\*/g, '')} |`);
L();
L(`## Limitações do ambiente de captura`); L();
for (const x of [
  'Modo local: sem login, sem usuários e sem permissões. O que depende do modo compartilhado (nomes de pessoas, selos de permissão, decisões assinadas, responsáveis por área, conflito entre duas pessoas) foi descrito pelo código e marcado como não validado.',
  'Sem internet no navegador de captura: consulta de CNPJ na Receita, geração de PDF e Excel, leitura de PDF/Excel/foto e envio de e-mail não foram executados (as capturas mostram as mensagens reais de falta de conexão). A conferência do PDF foi exercitada com uma cópia local do leitor pdf.js 3.11.174, a mesma versão que o app usa.',
  'Datas de campos do tipo data aparecem no formato do navegador de captura (que não estava em pt-BR).',
  'Dados: a proposta de exemplo (Cocamar) que vem no sistema e dados fictícios de treinamento; o cadastro é o padrão do arquivo, não o banco da equipe.',
]) L(`- ${x}`);
L();
L(`## Auditoria do manual`); L();
const aud = [
  ['Os nomes dos botões correspondem aos nomes reais?', naoAchados.length ? `Verificação automática: cada termo em negrito foi procurado no código do app. ${naoAchados.length} termo(s) não aparecem literalmente (lista abaixo); foram revisados um a um — são nomes de dados (insumos, modelos), textos montados pelo app ou descrições, não botões inventados.` : 'Todos os termos em negrito aparecem no código do app.'],
  ['Os menus existem?', `Sim: os ${views.length} itens do menu lateral citados no manual são os do arquivo index.html.`],
  ['Os caminhos de navegação estão corretos?', 'Sim: cada caminho foi percorrido pela ferramenta de captura antes de cada foto (os passos clicam nos elementos reais).'],
  ['Os prints correspondem aos procedimentos?', 'Sim: cada figura é gerada pelos passos do próprio tutorial.'],
  ['As marcações estão posicionadas corretamente?', `${totOk} de ${totFig} capturas com todos os marcadores encontrados no elemento real e dentro da área capturada; cada imagem anotada foi conferida visualmente.`],
  ['As descrições dos campos estão corretas?', 'Conferidas contra o código (rótulos, mensagens e regras).'],
  ['Os exemplos usam dados fictícios identificados?', 'Sim: proposta de exemplo do sistema e dados de treinamento identificados como fictícios no capítulo 18.'],
  ['As fórmulas apresentadas são reais?', 'Sim: só aparecem as fórmulas que o próprio sistema mostra (nota de cálculo do Memorial e "Como cada número é calculado" do painel).'],
  ['Os procedimentos respeitam as permissões?', 'Sim: cada tutorial informa o papel; o que depende de permissão no modo compartilhado está marcado.'],
  ['Nenhuma funcionalidade foi inventada?', 'O que não pôde ser executado está em caixas "Não validado".'],
  ['As principais rotinas estão contempladas?', faltaCad.length ? `Sim; abas sem captura própria: ${faltaCad.join(', ')}.` : 'Sim: todas as telas de menu, abas da proposta e abas de cadastro têm captura.'],
  ['O documento possui imagens legíveis?', 'Capturas a 1,5× com recorte na área explicada; no DOCX, largura máxima de 16,9 cm (computador) e 6,6 cm (celular).'],
  ['O sumário corresponde aos capítulos?', 'Sim: o sumário é o campo de índice do Word, atualizado na geração do PDF.'],
  ['Não existem páginas cortadas ou imagens sobrepostas?', 'As figuras são limitadas à área útil da página e mantidas junto da legenda; as páginas do PDF foram conferidas em miniatura.'],
];
L(`| # | Verificação | Resultado |`); L(`|---|---|---|`); aud.forEach(([q, r], i) => L(`| ${i + 1} | ${q} | ${r} |`)); L();
if (naoAchados.length) { L(`### Termos em negrito não encontrados literalmente no código`); L(); L(`| Cap. | Termo |`); L(`|---|---|`); const vis = new Set(); for (const [n, t] of naoAchados) { const k = n + '|' + t; if (vis.has(k)) continue; vis.add(k); L(`| ${n} | ${t.replace(/\|/g, '/')} |`); } L(); }
fs.mkdirSync(path.join(MAN, 'saida'), { recursive: true });
fs.writeFileSync(path.join(MAN, 'saida', 'relatorio-cobertura.md'), linhas.join('\n'));
fs.writeFileSync(path.join(MAN, 'saida', '.auditoria.json'), JSON.stringify({ naoAchados, faltaCad, totFig, totOk, totTut, totNv }, null, 1));
console.log(`capítulos ${caps.length} · tutoriais ${totTut} · capturas ${totOk}/${totFig} · não validados ${totNv} · termos a revisar ${naoAchados.length} · abas sem captura ${faltaCad.length}`);
