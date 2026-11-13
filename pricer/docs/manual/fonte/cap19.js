// Capítulo 19 — Importar proposta antiga (planilha LS PRICER + PDFs; serviços e peças com a planilha MASTERDOC)
// As telas com arquivos reais usam os arquivos indicados nas variáveis (os mesmos dos testes):
//   IMP_XLSX, IMP_TEC, IMP_COM (SEQ)  e  IMP_SPV_SERV (SPV, arquivos separados por ";")
// Sem elas, essas capturas ficam marcadas como não validadas.
const env = (k) => (process.env[k] || '').split(';').filter(Boolean);
const abreImport = async (p, h) => { await h.esc(); await h.nav('inicio'); await p.click('#bNew'); await p.waitForTimeout(300); await p.click('#mImport'); await p.waitForTimeout(400); };
const espera = (p) => p.waitForFunction(() => !/Lendo os arquivos/.test((document.getElementById('impPrev') || {}).innerText || '') && (document.getElementById('impPrev') || {}).innerText, null, { timeout: 180000 });
module.exports = {
  n: 19, titulo: 'Importar proposta antiga', slug: 'importar', libs: true,
  capturas: [
    { id: '19-01', nome: 'importar-janela', titulo: 'Nova → Importar proposta antiga: janela para escolher os arquivos',
      prep: async (p, h) => { await abreImport(p, h); },
      clip: '.modal .card', pad: 6,
      marcas: [
        { sel: '#impArq', txt: 'Arquivos: a planilha LS PRICER (.xlsx) e, se tiver, os PDFs da técnica e da comercial. Para serviços, junte a planilha MASTERDOC.', pos: 'b' },
        { sel: '#impOk', txt: 'Criar a proposta: só libera depois da prévia. Nada é gravado até você salvar.', pos: 'r' },
      ] },
    { id: '19-02', nome: 'importar-previa-seq', titulo: 'Prévia de uma proposta SEQ (planilha + PDF técnico + PDF comercial)', alto: 1300,
      prep: async (p) => { const f = env('IMP_XLSX').concat(env('IMP_TEC'), env('IMP_COM')); if (f.length < 3) throw new Error('arquivos de exemplo não informados (IMP_XLSX, IMP_TEC, IMP_COM)'); await p.setInputFiles('#impArq', f); await espera(p); },
      clip: '.modal .card', pad: 6,
      marcas: [
        { sel: '#impPrev .kv', txt: 'O que foi lido: planilha (versão), PDFs (técnica/comercial), número, cliente e textos.', pos: 'l' },
        { sel: '#impPrev table', txt: 'Por item: custo, preço na planilha, no PDF e com as regras do app.', pos: 'l' },
        { sel: '#impPrev .impradio', txt: 'Preço da proposta: manter o da planilha, o do PDF, ou recalcular.', pos: 'l' },
      ] },
    { id: '19-03', nome: 'importar-previa-spv', titulo: 'Prévia de uma proposta de serviço (MASTERDOC + LS PRICER + PDF)', alto: 1200,
      prep: async (p, h) => { const f = env('IMP_SPV_SERV'); if (f.length < 2) throw new Error('arquivos de exemplo não informados (IMP_SPV_SERV)'); await abreImport(p, h); await p.setInputFiles('#impArq', f); await espera(p); },
      clip: '.modal .card', pad: 6,
      marcas: [
        { sel: '#impPrev', txt: 'O app reconhece serviço ou peça, a equipe e o deslocamento, e mostra custo e preço como na SEQ.', pos: 'l' },
        { sel: '#impPrev .impradio', txt: 'Preço: o da planilha, o do PDF, ou recalcular com as regras do app.', pos: 'l' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'Propostas feitas fora do app (na planilha LS PRICER antiga, com os PDFs gerados por ela) podem entrar no app para revisar, negociar e gerar os documentos novos. Vale para **SEQ** (planilha + PDFs da técnica e da comercial) e para **serviços e peças** (planilha de serviços MASTERDOC, planilha LS PRICER e PDF).' },
    { t: 'fig', id: '19-01' },
    { t: 'tut', titulo: 'Importar uma proposta SEQ antiga', objetivo: 'Trazer para o app a formação, os textos e o cabeçalho de uma proposta feita na planilha.', quem: 'Contribuidor, Editor ou dono. No modo local não há controle de acesso.', pre: ['A planilha LS PRICER da proposta (.xlsx; REV12 ou REV21).', 'Se tiver: o PDF da proposta técnica e o da comercial.'], passos: [
      'Clique em **Nova** e depois em **Importar proposta antiga (planilha + PDFs)**.',
      'Em **Arquivos**, escolha a planilha e os PDFs de uma vez (segure Ctrl para marcar vários).',
      { x: 'Confira a prévia: o que foi lido, cada item com custo e os três preços (planilha, PDF e regras do app) e os avisos.', fig: '19-02' },
      'Em **Preço da proposta**, escolha **Manter o preço da planilha** (o desconto de negociação é ajustado para chegar nele), **Manter o preço do PDF** ou **Recalcular com as regras do app**.',
      'Clique em **Criar a proposta**.',
      'Confira Dados gerais, itens e Formação, e clique em **Salvar**.',
    ], resultado: 'Proposta nova no app com número, revisão, cliente, itens, escopo de cada linha (custos como foram cotados), notas, desvios, exclusões, observações, parcelas, volumes e opções de fornecimento. O histórico registra de quais arquivos ela veio.', atencao: 'A diferença entre o preço da planilha e o do app vem das regras de cálculo da planilha antiga (ICMS, PIS/COFINS, IRPJ/CSLL). Escolha conscientemente qual preço manter.', dica: 'Só com os PDFs (sem a planilha), a formação fica em branco, mas cabeçalho, descrições e textos entram.' },
    { t: 'h', x: 'Serviços e peças' },
    { t: 'fig', id: '19-03' },
    { t: 'tut', titulo: 'Importar uma proposta de serviço ou de peças', objetivo: 'Trazer uma SPV feita na planilha de serviços.', quem: 'Contribuidor, Editor ou dono. No modo local não há controle de acesso.', pre: ['Serviço: planilha MASTERDOC (equipe, deslocamento e markup), planilha LS PRICER do serviço e o PDF da proposta.', 'Peça: planilha LS PRICER da peça e o PDF.'], passos: [
      'Clique em **Nova** → **Importar proposta antiga (planilha + PDFs)**.',
      'Escolha os arquivos da proposta de uma vez.',
      { x: 'Confira a prévia: tipo (serviço ou peça), código, custo e preço.', fig: '19-03' },
      'Escolha qual preço manter e clique em **Criar a proposta**.',
      'Complete a **Execução do serviço** (capítulo 6) e salve.',
    ], resultado: 'SPV criada com cliente, CNPJ, contato, escopo, exclusões, equipe e deslocamento (serviço) ou peças (peça), com o preço escolhido.', atencao: 'Os PDFs antigos traziam impostos que nem sempre batem com as regras do app (ISS, ICMS). Confira a formação antes de enviar.' },
    { t: 'nota', x: 'Os PDFs da planilha antiga escrevem o negrito duas vezes; o app junta as linhas repetidas. Se algum texto vier quebrado, ajuste nos campos da proposta antes de gerar o documento novo.' },
  ],
  glossario: [
    ['Importar proposta antiga', 'Criar uma proposta no app a partir da planilha LS PRICER e dos PDFs da técnica e da comercial (ou da planilha de serviços MASTERDOC).'],
  ],
};
