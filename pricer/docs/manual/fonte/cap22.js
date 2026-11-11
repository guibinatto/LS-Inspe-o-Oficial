// Capítulo 22 — Proposta de serviço (SPV) do zero, tela a tela
// Um fluxo só: Início → SPV manutenção corretiva em campo → cliente e escopo → equipe e deslocamento → peça → formação
// → execução do serviço → termos em anexo → salvar → PDF da proposta e PDF dos termos → lista da tela Início.
const cp = require('child_process'), os = require('os'), path = require('path'), fs = require('fs');
const DIR = path.join(os.tmpdir(), 'manual-cap22'); fs.mkdirSync(DIR, { recursive: true });
const pc = async (p, k, v) => { await p.evaluate(([k, v]) => { const e = document.querySelector('[data-pc="' + k + '"]'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]); await p.waitForTimeout(150); };
const marca = async (p, s) => { await p.evaluate((s) => { const e = document.querySelector(s); if (e && !e.checked) { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); } }, s); await p.waitForTimeout(250); };
const abreExec = (p) => p.evaluate(() => document.querySelectorAll('details').forEach((d) => { if (d.querySelector('[data-pc="equipe"]')) d.open = true; }));
const arq = { prop: path.join(DIR, 'proposta.pdf'), termos: path.join(DIR, 'termos.pdf') };
function paginaCom(f, re) { const n = +((cp.execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/) || [])[1] || 1);
  for (let i = 1; i <= n; i++) { const t = cp.execFileSync('pdftotext', ['-f', String(i), '-l', String(i), f, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); if (re.test(t)) return i; } return 1; }
async function mostra(p, pags) { // [[arquivo, página], …]
  const imgs = pags.map(([f, n], k) => { const out = path.join(DIR, 'pag' + k); cp.execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', '-f', String(n), '-l', String(n), f, out]); return 'data:image/png;base64,' + fs.readFileSync(out + '.png').toString('base64'); });
  await p.evaluate((imgs) => { const d = document.createElement('div'); d.id = 'pdfPrev'; d.style.cssText = 'position:fixed;inset:0;background:#3a3a3a;z-index:9999;display:flex;gap:28px;align-items:center;justify-content:center;padding:24px';
    imgs.forEach((s) => { const i = document.createElement('img'); i.src = s; i.style.cssText = 'height:92vh;box-shadow:0 4px 24px rgba(0,0,0,.5);background:#fff'; d.appendChild(i); }); document.body.appendChild(d); }, imgs);
  await p.waitForTimeout(600);
}
const tira = (p) => p.evaluate(() => { const d = document.getElementById('pdfPrev'); if (d) d.remove(); });

module.exports = {
  n: 22, titulo: 'Proposta de serviço (SPV) do zero, tela a tela', slug: 'spv-do-zero', libs: true,
  capturas: [
    { id: '22-01', nome: 'spvzero-inicio', titulo: 'Tela Início: escolher o tipo de serviço', novo: true,
      prep: async (p, h) => { await h.nav('inicio'); await h.topo(); },
      clip: '.start.spv', pad: 8,
      marcas: [
        { sel: '[data-spvnew="SMC"]', txt: 'Manutenção corretiva em campo (o exemplo deste capítulo).', pos: 'l' },
        { sel: '[data-spvnew="PAR"]', txt: 'Peças e sobressalentes: começa sem equipe.', pos: 'l' },
        { sel: '[data-spvnew="ITM"]', txt: 'Inspeção / contrato: com o bloco Contrato recorrente.', pos: 'b' },
      ] },
    { id: '22-02', nome: 'spvzero-cliente', titulo: 'Cliente e escopo preenchidos',
      prep: async (p, h) => { await h.clicar('[data-spvnew="SMC"]', 900);
        for (const [k, v] of [['cliente', 'CLIENTE TREINAMENTO LTDA'], ['contato', 'Eng. Maria Souza'], ['cnpj', '12.345.678/0001-95'], ['numero', '10.501'], ['local', 'Fábrica 1 — Joinville'], ['vendedor', 'Vendedor Exemplo']]) await h.preencher(`[data-sp="${k}"]`, v);
        await p.selectOption('[data-sp="uf"]', 'SC'); await h.esperar(300); await h.preencher('textarea[data-sp="descricao"]', 'Troca do radiador do motor diesel da bomba de incêndio, com teste de funcionamento.'); },
      clip: 'section.card:has([data-sp="cliente"])', pad: 8,
      marcas: [
        { sel: '[data-sp="cliente"]', txt: 'Cliente (sugere os já usados).', pos: 'l' },
        { sel: '[data-sp="cnpj"]', txt: 'CNPJ.', pos: 'l' },
        { sel: '[data-sp="numero"]', txt: 'Número da proposta.', pos: 'l' },
        { sel: '[data-sp="uf"]', txt: 'UF: define o ICMS das peças.', pos: 'l' },
        { sel: '[data-sp="pagamento"]', txt: 'Condição de pagamento e validade (dias).', pos: 'l' },
        { sel: 'textarea[data-sp="descricao"]', txt: 'Escopo do serviço: vai na proposta.', pos: 'l' },
      ] },
    { id: '22-03', nome: 'spvzero-equipe', titulo: 'Equipe e deslocamento (120 km só ida)',
      prep: async (p, h) => { await h.preencher('[data-sp="dist"]', '120'); },
      clip: 'section.card:has([data-sp="dist"])', pad: 8,
      marcas: [
        { sel: 'select[data-sp="equipe.0.tec"]', txt: 'Técnico: a diária vem do cadastro.', pos: 'l' },
        { sel: '[data-sp="equipe.0.dias"]', txt: 'Dias de trabalho.', pos: 'l' },
        { sel: '[data-sp="dist"]', txt: 'Distância só ida: o app calcula ida e volta.', pos: 'l' },
        { sel: '[data-sp="ov.hotel_noites"]', txt: 'Hotel, alimentação e ART calculados sozinhos (dá para alterar).', pos: 'l' },
        { sel: 'section.card:has([data-sp="dist"]) tr.tot', txt: 'Custo da prestação do serviço.', pos: 'l' },
      ] },
    { id: '22-04', nome: 'spvzero-peca', titulo: 'Peças e materiais: o radiador',
      prep: async (p, h) => { await h.clicar('[data-spadd="pecas"]', 500); await h.preencher('[data-sp="pecas.0.desc"]', 'RADIADOR DO MOTOR DIESEL'); await h.preencher('[data-sp="pecas.0.unit"]', '6500'); },
      clip: 'section.card:has([data-spadd="pecas"])', pad: 8,
      marcas: [
        { sel: '[data-sp="pecas.0.incluso"]', txt: 'Incluso no preço (desmarque se for cobrado em outra proposta).', pos: 'l' },
        { sel: '[data-sp="pecas.0.desc"]', txt: 'Descrição da peça.', pos: 'b' },
        { sel: '[data-sp="pecas.0.unit"]', txt: 'Custo unitário de compra.', pos: 'b' },
        { sel: '[data-sp="pecas.0.fator"]', txt: 'Fator de venda (padrão do cadastro).', pos: 'b' },
        { sel: 'label[for="spImport"]', txt: 'Ou importe o orçamento do fornecedor (PDF, XML, Excel ou foto).', pos: 'b' },
      ] },
    { id: '22-05', nome: 'spvzero-formacao', titulo: 'Formação do preço do serviço',
      prep: async (p) => { await p.evaluate(() => document.querySelector('[data-sp="mk.mult"]').scrollIntoView({ block: 'center' })); },
      clip: 'section.card:has([data-sp="mk.mult"])', pad: 8, alto: 1300,
      marcas: [
        { sel: '[data-sp="mk.mult"]', txt: 'Multiplicador do serviço: custo × multiplicador = venda do serviço.', pos: 'l' },
        { sel: 'section.card:has([data-sp="mk.mult"]) .kv', txt: 'Venda, impostos, comissões e lucro líquido (meta 40%).', pos: 'l' },
        { sel: 'label.chk:has([data-sp="aprazo"]) input', txt: 'Pagamento a prazo: soma o encargo financeiro.', pos: 'b' },
      ] },
    { id: '22-06', nome: 'spvzero-execucao', titulo: 'Para o documento → Execução do serviço', alto: 1500,
      prep: async (p, h) => { await abreExec(p); await h.esperar(300);
        await pc(p, 'prazoMobil', '5'); await pc(p, 'equipe', '02 técnicos especializados'); await pc(p, 'duracao', '1 dia (8 horas)'); await pc(p, 'horario', 'segunda a sexta, 8h às 17h');
        for (const k of ['nr10', 'aso', 'integ', 'apr']) await marca(p, '[data-pcchk="seg|' + k + '"]');
        await marca(p, '[data-pcbool="foraOp"]'); await abreExec(p); await pc(p, 'foraHoras', '6 horas');
        for (const k of ['acesso', 'utilid']) await marca(p, '[data-pcchk="resp|' + k + '"]'); for (const k of ['relat', 'teste']) await marca(p, '[data-pcchk="entreg|' + k + '"]');
        await pc(p, 'garantia', '90 dias a partir da conclusão, para defeitos de execução'); await pc(p, 'lc116', '14.01'); await pc(p, 'issMun', 'Joinville-SC'); await pc(p, 'issRet', 'sim'); await abreExec(p); },
      clip: 'details:has([data-pc="equipe"])', pad: 8,
      marcas: [
        { sel: '[data-pc="equipe"]', txt: 'Início, equipe, duração e horário.', pos: 'b' },
        { sel: '[data-pcchk="seg|nr10"]', txt: 'Segurança e acesso: marque o que vale.', pos: 'l' },
        { sel: '[data-pcbool="foraOp"]', txt: 'Sistema fora de operação (aviso NFPA 25).', pos: 'l' },
        { sel: '[data-pcchk="resp|acesso"]', txt: 'Responsabilidades do cliente.', pos: 'l' },
        { sel: '[data-pcchk="entreg|relat"]', txt: 'Entregáveis.', pos: 'l' },
        { sel: '[data-pc="garantia"]', txt: 'Garantia do serviço.', pos: 'b' },
        { sel: '[data-pc="lc116"]', txt: 'Dados fiscais do serviço.', pos: 't' },
      ] },
    { id: '22-07', nome: 'spvzero-termos', titulo: 'Propostas relacionadas e termos em anexo',
      prep: async (p) => { await pc(p, 'relacionadas', 'Mão de obra conforme esta proposta; radiador incluso.'); await marca(p, '[data-pcbool="termosAnexo"]'); },
      clip: [['.fields:has([data-pc="relacionadas"])', 0]], pad: 8,
      marcas: [
        { sel: '[data-pc="relacionadas"]', txt: 'O que está em outra proposta (peça × mão de obra).', pos: 'b' },
        { sel: '[data-pcbool="termosAnexo"]', txt: 'Termos em PDF à parte: a proposta fica curta.', pos: 'r' },
      ] },
    { id: '22-08', nome: 'spvzero-salvar', titulo: 'Salvar a SPV',
      prep: async (p, h) => { await h.salvar(); await h.esperar(600); await h.topo(); },
      clip: '.ctxh', pad: 8,
      marcas: [
        { sel: '.ctxh .ctx-kpis', txt: 'Valor total, lucro, custo e pendências.', pos: 'b' },
        { sel: '#saveSt', txt: '"Salvo às …".', pos: 'b' },
      ] },
    { id: '22-09', nome: 'spvzero-gerar', titulo: 'Proposta técnica e comercial da SPV: gerar',
      prep: async (p) => { await p.evaluate(() => document.getElementById('pcCard').scrollIntoView({ block: 'start' })); },
      clip: '#pcCard .docbar:has([data-pcgerar])', pad: 10,
      marcas: [
        { sel: '#pcCard [data-pcgerar]', txt: 'Gerar a proposta: saem a proposta e o PDF dos termos.', pos: 'b' },
        { sel: '#pcCard [data-pchtml]', txt: 'Versão interativa (HTML).', pos: 'b' },
      ] },
    { id: '22-10', nome: 'spvzero-pdf', titulo: 'O PDF da proposta de serviço: planilha e execução do serviço',
      prep: async (p, h) => { const L = []; const f = (d) => L.push(d); p.on('download', f); await p.click('[data-pcgerar]'); const t0 = Date.now(); while (L.length < 2 && Date.now() - t0 < 180000) await p.waitForTimeout(400); p.off('download', f);
        for (const d of L) await d.saveAs(/^TERMOS/.test(d.suggestedFilename()) ? arq.termos : arq.prop); await h.esperar(1500);
        await mostra(p, [[arq.prop, paginaCom(arq.prop, /PLANILHA DE PREÇOS/)], [arq.prop, paginaCom(arq.prop, /EXECUÇÃO DO SERVIÇO|Execução do serviço/)]]); },
      marcas: [
        { sel: '#pdfPrev img:nth-child(1)', txt: 'Planilha de preços e condições: início dos serviços, sem "fabricação".', pos: 'b' },
        { sel: '#pdfPrev img:nth-child(2)', txt: 'Execução do serviço: equipe, segurança, sistema fora de operação, entregáveis, garantia e fiscal.', pos: 'b' },
      ],
      depois: async (p) => { await tira(p); } },
    { id: '22-11', nome: 'spvzero-termos-pdf', titulo: 'O PDF dos termos (anexo) e a referência na proposta',
      prep: async (p) => { await mostra(p, [[arq.prop, paginaCom(arq.prop, /enviados como anexo/)], [arq.termos, 1]]); },
      marcas: [
        { sel: '#pdfPrev img:nth-child(1)', txt: 'Na proposta: "Aplicam-se os Termos e Condições… (TERMOS_….pdf)".', pos: 'b' },
        { sel: '#pdfPrev img:nth-child(2)', txt: 'O anexo com os termos completos.', pos: 'b' },
      ],
      depois: async (p) => { await tira(p); } },
    { id: '22-12', nome: 'spvzero-lista', titulo: 'A SPV na lista da tela Início',
      prep: async (p, h) => { await h.nav('inicio'); await h.topo(); },
      clip: '.home table.t', pad: 8,
      marcas: [
        { sel: '.home table.t tbody tr:first-child td:nth-child(1)', txt: 'Divisão SPV.', pos: 'b' },
        { sel: '.home table.t tbody tr:first-child td:nth-child(3)', txt: 'Total.', pos: 'b' },
        { sel: '.home table.t tbody tr:first-child [data-hnext]', txt: 'Próxima etapa.', pos: 'b' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'Este capítulo faz uma proposta de **serviço em campo** do começo ao fim, com uma tela para cada passo: troca do radiador do motor diesel de uma bomba de incêndio, com dois técnicos. Os valores são de treino. Os detalhes de cada bloco estão no capítulo 6.' },
    { t: 'tut', titulo: 'Passo 1 — Começar e preencher o cliente', objetivo: 'Abrir a SPV do tipo certo e preencher cliente e escopo.', quem: 'Vendedor ou Serviços (Contribuidor, Editor ou dono). No modo local não há controle de acesso.', pre: ['Técnicos e preços de deslocamento cadastrados em Cadastros → Serviços (capítulo 6).'], passos: [
      { x: 'Na tela **Início**, clique no tipo de serviço (aqui, **Manutenção corretiva em campo**).', fig: '22-01' },
      { x: 'Preencha cliente, contato, CNPJ, número, local, UF, vendedor e o escopo.', fig: '22-02' },
    ], resultado: 'A SPV abre com o modelo do tipo escolhido: escopo, exclusões, prazo e equipe já sugeridos.' },
    { t: 'tut', titulo: 'Passo 2 — Equipe, deslocamento e peças', objetivo: 'Montar o custo do serviço.', quem: 'Vendedor ou Serviços.', pre: ['SPV aberta.'], passos: [
      { x: 'Em **Equipe e deslocamento**, confira os técnicos e os dias e informe a distância só ida.', fig: '22-03' },
      { x: 'Em **Peças e materiais**, clique em **+ Peça** e informe a descrição e o custo (ou importe o orçamento).', fig: '22-04' },
      { x: 'Em **Formação do preço**, confira o multiplicador e o lucro líquido.', fig: '22-05' },
    ], resultado: 'Custo da prestação, venda e lucro calculados. Abaixo da meta de 40%, o app mostra o multiplicador necessário.' },
    { t: 'tut', titulo: 'Passo 3 — O que o cliente precisa ler na proposta', objetivo: 'Preencher a execução do serviço e deixar os termos em anexo.', quem: 'Vendedor ou Serviços.', pre: ['Custo e preço conferidos.'], passos: [
      { x: 'Em **Para o documento da proposta**, abra **Execução do serviço** e preencha equipe, duração, segurança, sistema fora de operação, responsabilidades, entregáveis, garantia e dados fiscais.', fig: '22-06' },
      { x: 'Escreva as **Propostas relacionadas**, se houver, e marque **Termos e condições em anexo**.', fig: '22-07' },
      { x: 'Clique em **Salvar**.', fig: '22-08' },
    ], resultado: 'Tudo gravado na SPV.' },
    { t: 'tut', titulo: 'Passo 4 — Gerar e conferir os PDFs', objetivo: 'Gerar a proposta de serviço e o anexo dos termos.', quem: 'Vendedor ou Serviços.', pre: ['SPV salva.'], passos: [
      { x: 'No cartão **Proposta técnica e comercial**, clique em **Gerar proposta técnica e comercial (PDF)**.', fig: '22-09' },
      { x: 'Confira a planilha de preços e a seção **Execução do serviço**.', fig: '22-10' },
      { x: 'Confira a referência aos termos e o PDF dos termos.', fig: '22-11' },
      { x: 'Na tela **Início**, a SPV aparece na lista com a próxima etapa.', fig: '22-12' },
    ], resultado: 'Dois PDFs: a proposta (curta) e os termos. Os dois ficam guardados nos documentos da proposta.', atencao: 'Mande os dois PDFs ao cliente. No app publicado, confirme **Salvar arquivo** duas vezes.' },
  ],
};
