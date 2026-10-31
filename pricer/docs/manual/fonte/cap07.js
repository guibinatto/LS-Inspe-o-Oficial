// Capítulo 7 — Cadastro de insumos
const larga = (p) => p.evaluate(() => { const c = document.querySelector('.modal .card'); if (c) c.style.width = 'min(1320px,100%)'; });
const rolarAte = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'start' }); }, sel);
const salvarFicha = async (p, h) => { await h.clicar('#fSave', 900); if (await p.$('.modal #fSave')) await h.clicar('#fSave', 1200); };
const aba = async (p, h, k) => { await h.clicar('.modal [data-ftab="' + k + '"]', 250); };
const rolarFim = (p) => p.evaluate(() => { const c = document.querySelector('.modal .card'); if (c) c.scrollTop = c.scrollHeight; });

module.exports = {
  n: 7, titulo: 'Cadastro de insumos', slug: 'insumos',
  inicio: async (p, h) => { await h.exemplo(); await h.salvar(); },
  capturas: [
    { id: '07-01', nome: 'cadastro-insumos-lista', titulo: 'Lista de insumos com busca, filtros, favorito e ordenação', alto: 1100,
      prep: async (p, h) => {
        await h.nav('cadastro'); await h.cad('insumos');
        await p.selectOption('#insFam', '10.MOTORELETRICO'); await h.esperar(500);
        await p.fill('#insQ', 'IPW55'); await h.esperar(800);
        await p.click('[data-insord="valor"]'); await h.esperar(400);
        await p.locator('tr[data-ins] .star').nth(0).click(); await h.esperar(400);
      },
      clip: '#app section.card',
      marcas: [
        { sel: '#insQ', txt: 'Busca: código, fabricante, modelo ou característica. Aceita sinônimos (aqui, IPW55 encontra os motores IP55).', pos: 't' },
        { sel: '#insFam', txt: 'Filtro por família.', pos: 't' },
        { sel: '#insSit', txt: 'Filtro por situação (ativo, provisório, aguardando validação, aguardando preço, inativo, descontinuado ou "Com pendência").', pos: 't' },
        { sel: 'label.chk:has(#insSem)', txt: 'Só os insumos sem preço.', pos: 't' },
        { sel: 'label.chk:has(#insFavF)', txt: 'Só os favoritos.', pos: 'b' },
        { sel: '[data-insord="valor"]', txt: 'Clique no título da coluna para ordenar (Código, Produto, Valor, Cotação).', pos: 't' },
        { sel: '.star.on', txt: 'Estrela: favorito. Os favoritos sobem para o topo da lista.', pos: 'l' },
        { sel: '#insNew', txt: '+ Novo insumo abre a ficha guiada em branco.', pos: 'b' },
      ] },
    { id: '07-20', nome: 'cadastro-ficha-geral', titulo: 'Ficha do produto em abas: aba Geral de um novo insumo', alto: 1500,
      prep: async (p, h) => {
        await p.fill('#insQ', ''); await h.esperar(600);
        await p.selectOption('#insFam', '01.MOTORDIESEL'); await h.esperar(500);
        await h.clicar('#insNew', 600); await p.fill('#fFab', 'BAUDOUIN'); await h.esperar(300);
      },
      marcas: [
        { sel: '.modal .fichatabs', txt: 'Abas da ficha: Geral, Técnica, Compras e custos (no insumo já cadastrado também Estruturas e utilização, Documentos e Histórico).', pos: 'b' },
        { sel: '#fFam', txt: 'Família: define os campos técnicos e o modelo de descrição.', pos: 'l' },
        { sel: '#fCode', txt: 'Código: gerado pela família (aa-bbbb) e não muda depois.', pos: 'r' },
        { sel: '#fSit', txt: 'Situação do item.', pos: 'l' },
        { sel: '#fFab', txt: 'Fabricante (a marca fica aqui, não no nome).', pos: 't' },
        { sel: '#fCodFab', txt: 'Código do fabricante (usado também na verificação de duplicidade).', pos: 'r' },
        { sel: '.modal .fichaacoes', txt: 'Cadastrar/Salvar e Cancelar ficam sempre visíveis, em qualquer aba.', pos: 't' },
      ] },
    { id: '07-02', nome: 'cadastro-ficha-identificacao', titulo: 'Aba Técnica: características técnicas da família', alto: 1500,
      prep: async (p, h) => {
        await aba(p, h, 'tecnica');
        await h.preencher('[data-car="modelo"]', '6M16G308/6'); await h.esperar(400);
        await p.fill('[data-car="hp"]', '490'); await p.fill('[data-car="rpm"]', '1800'); await p.fill('[data-car="cil"]', '6');
        await p.check('input[data-carr="vcc"][value="24VCC"]', { force: true }); await h.esperar(200);
        await p.check('input[data-carr="arref"][value="RADIADOR"]', { force: true }); await h.esperar(200);
        await p.check('input[data-carr="ctrl"][value="MEC"]', { force: true }); await h.esperar(200);
      },
      clip: '#fCarSec',
      marcas: [
        { sel: '#fCarSub', txt: 'Nome do padrão e modelo da descrição da família.', pos: 't' },
        { sel: '[data-car="hp"]', txt: 'Campos técnicos; * = obrigatório.', pos: 'r' },
        { sel: '.seg:has([data-carr="vcc"])', txt: 'Listas curtas aparecem como botões; "outro" abre um campo livre.', pos: 'r' },
      ] },
    { id: '07-03', nome: 'cadastro-ficha-descricoes', titulo: 'Descrições do insumo e aviso de itens parecidos', alto: 1500,
      prep: async (p, h) => { await aba(p, h, 'geral'); await h.clicar('#fComSug', 300); await rolarAte(p, '#fProd'); },
      clip: '.modal section.fsec', clipNth: 0,
      marcas: [
        { sel: '#fProd', txt: 'Descrição técnica: o nome que as fórmulas e as estruturas usam.', pos: 'l' },
        { sel: '#fGerWrap', txt: 'Marcado: a descrição é gerada pelas características (o campo fica travado).', pos: 'r' },
        { sel: '#fPad', txt: 'Conferência do padrão da família.', pos: 'l' },
        { sel: '#fCom', txt: 'Descrição comercial, para documentos ao cliente.', pos: 'l' },
        { sel: '#fComSug', txt: 'Sugerir: monta a descrição comercial pelo modelo da família.', pos: 'r' },
        { sel: '#fDescFab', txt: 'Descrição do fabricante: texto original do catálogo ou da cotação.', pos: 'l' },
        { sel: '#fDup .banner', txt: 'Antes de salvar, confira: itens parecidos já cadastrados. Nada é juntado sozinho.', pos: 'l' },
      ],
      depois: async (p, h) => { await aba(p, h, 'compras'); await p.fill('#fVal', '105.000,00'); await h.esperar(200); await salvarFicha(p, h); } },
    { id: '07-04', nome: 'cadastro-ficha-fornecedores', titulo: 'Fornecedores e cotações, com o custo total, e equivalentes', alto: 1500,
      prep: async (p, h) => {
        await p.fill('#insQ', '6M33G633'); await h.esperar(800);
        await h.clicar('tr[data-ins="01-1008"] td.code', 600); await larga(p);
        await aba(p, h, 'compras');
        await h.clicar('#foAdd', 300); await h.clicar('#foAdd', 300);
        await h.preencher('[data-fo="0|nome"]', 'FORNECEDOR A'); await h.preencher('[data-fo="0|preco"]', '210.000,00'); await h.preencher('[data-fo="0|frete"]', '1.500,00'); await h.preencher('[data-fo="0|prazo"]', '30');
        await h.preencher('[data-fo="1|nome"]', 'FORNECEDOR B'); await h.preencher('[data-fo="1|preco"]', '38.000,00');
        await p.selectOption('[data-fo="1|moeda"]', 'USD'); await h.esperar(300);
        await h.preencher('[data-fo="1|cambio"]', '5,40'); await h.preencher('[data-fo="1|impostos"]', '12'); await h.preencher('[data-fo="1|prazo"]', '90');
        await rolarAte(p, '.modal details.fsec');
      },
      clip: '.modal details.fsec',
      marcas: [
        { sel: '#foAdd', txt: '+ Fornecedor: uma linha por cotação.', pos: 'l' },
        { sel: '[data-fo="1|moeda"]', txt: 'Moeda da cotação (BRL, USD ou EUR).', pos: 'b' },
        { sel: '[data-fo="1|cambio"]', txt: 'Câmbio em R$ (obrigatório para moeda estrangeira).', pos: 'b' },
        { sel: '.modal .forn .pill.ok', txt: 'Custo total = preço × câmbio × (1 + impostos) + frete. "menor total" é só indicação.', pos: 'b' },
        { sel: '[data-fouse="0"]', txt: '"usar este preço" leva o custo total ao campo Valor do cadastro.', pos: 'r' },
      ] },
    { id: '07-21', nome: 'cadastro-ficha-equivalentes', titulo: 'Aba Técnica: equivalentes técnicos e alternativas', alto: 1500,
      prep: async (p, h) => {
        await aba(p, h, 'tecnica');
        await p.fill('#eqIns', '01-1009'); await p.selectOption('#eqTipo', 'comercial');
        await p.fill('#eqCar', 'mesmo modelo, potência e rotação; arrefecimento por trocador de calor'); await p.fill('#eqRes', 'conferir com a Engenharia antes de trocar');
        await h.clicar('#eqAdd', 300); await rolarAte(p, '#fEquiv');
      },
      clip: '#fEquiv',
      depois: async (p, h) => { await aba(p, h, 'compras'); await h.clicar('[data-fouse="0"]', 400); await salvarFicha(p, h); },
      marcas: [
        { sel: '#fEquiv tbody tr', txt: 'Equivalente registrado, com tipo, justificativa, restrições e data.', pos: 'l' },
        { sel: '#eqTipo', txt: 'Tipo: equivalência técnica, alternativa comercial ou substituto.', pos: 'r' },
        { sel: '#eqAdd', txt: '+ Registrar equivalente (exige características comparadas e justificativa).', pos: 'l' },
      ] },
    { id: '07-05', nome: 'cadastro-ficha-impacto-preco', titulo: 'Mudança de preço: aviso e impacto na margem das propostas', alto: 1500,
      prep: async (p, h) => {
        await p.selectOption('#insFam', ''); await h.esperar(400);
        await p.fill('#insQ', 'TOMADA'); await h.esperar(800);
        await h.clicar('tr[data-ins="38-38001"] td.code', 600); await aba(p, h, 'compras');
        const v = await p.$eval('#fVal', (x) => Number(x.value.replace(/\./g, '').replace(',', '.')));
        await p.fill('#fVal', (Math.round(v * 110) / 100).toFixed(2).replace('.', ',')); await h.esperar(300);
        await h.clicar('#fImpCalc', 3000);
        await p.evaluate(() => document.querySelector('#fVal').closest('section').scrollIntoView({ block: 'center' }));
      },
      clip: '.modal section.fsec', clipNth: 0,
      marcas: [
        { sel: '#fVal', txt: 'Valor (R$): o preço do cadastro, sempre em reais.', pos: 't' },
        { sel: '#fFonte', txt: 'Origem do preço: fornecedor, nº do orçamento.', pos: 't' },
        { sel: '#fDataCot', txt: 'Data da cotação: conta para a data do preço (vale a mais recente entre esta data e a da última mudança de preço).', pos: 'l' },
        { sel: '#fImp .banner', txt: 'Mudança de preço: de → para, variação e onde o insumo é usado.', pos: 'l' },
        { sel: '#fImpCalc', txt: 'Calcula o impacto na margem das propostas salvas, sem gravar nada.', pos: 'b' },
        { sel: '#fImpRes', txt: 'Resultado: tabela com proposta, custo e margem antes → depois, ou o aviso de que nenhuma proposta muda.', pos: 'l' },
      ],
      depois: async (p, h) => { await salvarFicha(p, h); } },
    { id: '07-06', nome: 'cadastro-ficha-onde-usado', titulo: 'Aba Estruturas e utilização: onde o insumo é usado', alto: 1500,
      prep: async (p, h) => { await p.fill('#insQ', '6M33G633'); await h.esperar(800); await h.clicar('tr[data-ins="01-1008"] td.code', 600); await aba(p, h, 'uso'); },
      clip: '.modal [data-fpane="uso"]',
      marcas: [
        { sel: '.modal [data-fpane="uso"] h2', txt: 'Onde é usado: componentes de estrutura, formações fechadas e propostas.', pos: 'l' },
        { sel: '.modal [data-fpane="uso"] ul.uso li', txt: 'Componente, quando entra e em quais estruturas.', pos: 'r' },
      ] },
    { id: '07-22', nome: 'cadastro-ficha-historicos', titulo: 'Abas Compras e custos (histórico de preço), Documentos e Histórico', alto: 1500,
      prep: async (p, h) => { await aba(p, h, 'hist'); },
      clip: '.modal [data-fpane="hist"]',
      marcas: [
        { sel: '.modal [data-ftab="compras"]', txt: 'Compras e custos: preço, fornecedores e cotações, e o histórico de preço (de, para, variação e origem).', pos: 'b' },
        { sel: '.modal [data-ftab="docs"]', txt: 'Documentos: folha de dados técnica e os orçamentos, notas e fichas anexados ao insumo.', pos: 'b' },
        { sel: '.modal .hist', txt: 'Histórico deste insumo: cada campo alterado, quando e por quem.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '07-07', nome: 'cadastro-renomear', titulo: 'Renomear um insumo usado em estrutura: o app mostra o impacto antes', alto: 1500,
      prep: async (p, h) => {
        await p.fill('#insQ', 'GLICERINADO'); await h.esperar(800);
        await h.clicar('tr[data-ins="42-42002"] td.code', 600);
        await p.fill('#fProd', 'DN 100 0-16 BAR GLICERINADO 1/2" CX INOX CALIBRADO'); await h.esperar(300);
        await h.clicar('#fSave', 400); await rolarAte(p, '#fProd');
      },
      clip: '.modal section.fsec', clipNth: 0,
      marcas: [
        { sel: '#fProd', txt: 'Nova descrição técnica (aqui, sem o " - " fora do padrão).', pos: 'l' },
        { sel: '#fPad', txt: 'A conferência do padrão passa a mostrar "No padrão."', pos: 'l' },
        { sel: '#fErr', txt: 'Impacto: células de estrutura ou tabela, kits e propostas que passam a usar o novo nome.', pos: 'l' },
        { sel: '#fSave', txt: 'Clique de novo em Salvar para confirmar.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.clicar('#fSave', 1500); await h.esc(); } },
    { id: '07-08', nome: 'cadastro-edicao-massa', titulo: 'Edição em massa: campo, novo valor e prévia', alto: 1100,
      prep: async (p, h) => {
        await p.fill('#insQ', 'BASE'); await h.esperar(800);
        await h.clicar('#insSelAll', 300); await h.clicar('#insLote', 500);
        await p.selectOption('#ltCampo', 'reajuste'); await h.esperar(300); await p.fill('#ltVal', '10'); await h.esperar(400);
      },
      clip: '.modal .card',
      marcas: [
        { sel: '#ltCampo', txt: 'Campo: situação, fabricante, tipo, origem, reajuste de preço (%), data da cotação ou origem do preço.', pos: 'l' },
        { sel: '#ltVal', txt: 'Novo valor (no reajuste, o percentual: 5 ou -3).', pos: 't' },
        { sel: '#ltPrev table', txt: 'Prévia: atual, novo e se o item está em uso.', pos: 'l' },
        { sel: '.modal .card > p.sub', txt: 'O nome não se edita em massa: ele é a chave das fórmulas.', pos: 'l' },
        { sel: '#ltOk', txt: 'Aplicar em N; o botão pede um segundo clique para confirmar.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('#ltOk', 300); await h.clicar('#ltOk', 1200); } },
    { id: '07-09', nome: 'cadastro-historico-desfazer', titulo: 'Configurações → Histórico: desfazer um lote', alto: 1100,
      prep: async (p, h) => { await h.nav('config'); await p.selectOption('#histT', 'cadastro'); await h.esperar(500); await p.fill('#histQ', 'Reajuste'); await h.esperar(900); },
      clip: '#app section.card',
      marcas: [
        { sel: '#histT', txt: 'Filtro por tipo (aqui, Cadastro).', pos: 't' },
        { sel: '#histQ', txt: 'Busca no histórico.', pos: 't' },
        { sel: '.hlist .hrow .hmeta', txt: 'Quando e quem.', pos: 'l' },
        { sel: '.hlist .hrow .pill', txt: 'Tipo da alteração: Edição em massa.', pos: 'b' },
        { sel: '[data-desfaz]', txt: 'desfazer este lote (pede confirmação com um segundo clique).', pos: 'r' },
        { sel: '.hlist .hrow table.mini', txt: 'Cada insumo e campo: de → para.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.clicar('[data-desfaz]', 300); await h.clicar('[data-desfaz]', 1200); } },
    { id: '07-10', nome: 'cadastro-pedir-cadastro', titulo: 'Pedir cadastro de insumo', alto: 1100,
      prep: async (p, h) => {
        await h.nav('cadastro'); await h.cad('insumos'); await h.cad('pedidos');
        await h.clicar('[data-pedir]', 500);
        await p.selectOption('#pdFam', '10.MOTORELETRICO'); await h.esperar(400);
        await p.fill('[data-pdc="cv"]', '175'); await h.esperar(300);
        await p.check('input[data-pdc="polos"][value="6P"]', { force: true }); await h.esperar(200);
        await p.check('input[data-pdc="tensao"][value="380/660V"]', { force: true }); await h.esperar(200);
        await p.fill('#pdFab', 'WEG'); await p.selectOption('#pdUrg', { index: 1 }); await h.esperar(200);
      },
      clip: '.modal .card',
      marcas: [
        { sel: '#pdFam', txt: 'Família do item pedido.', pos: 'l' },
        { sel: '[data-pdc="cv"]', txt: 'Campos básicos da família.', pos: 'l' },
        { sel: '.seg:has([data-pdc="polos"])', txt: 'Opções fixas viram botões.', pos: 'r' },
        { sel: '#pdDesc', txt: 'Descrição para o cadastro, montada no padrão.', pos: 'l' },
        { sel: '#pdChk', txt: 'Conferência do padrão.', pos: 'r' },
        { sel: '#pdSim .banner', txt: 'Aviso de itens parecidos já cadastrados: confira antes de pedir.', pos: 'r' },
        { sel: '#pdUrg', txt: 'Prazo: normal ou urgente (proposta em aberto).', pos: 'r' },
        { sel: '#pdOk', txt: 'Enviar pedido: vai para a área de Custos.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('#pdOk', 900); } },
    { id: '07-11', nome: 'cadastro-atender-pedido', titulo: 'Custos atende o pedido: preço e situação ao cadastrar', alto: 1100,
      prep: async (p, h) => { await h.clicar('[data-pdat]', 600); await p.selectOption('#atSit', 'preco'); await h.esperar(200); },
      clip: '.modal .card',
      marcas: [
        { sel: '#atDesc', txt: 'Descrição no padrão da família (pode ser corrigida aqui).', pos: 'l' },
        { sel: '#atVal', txt: 'Preço de custo: obrigatório para liberar como Ativo.', pos: 'l' },
        { sel: '#atSit', txt: 'Situação ao cadastrar: Ativo, Aguardando validação técnica ou Aguardando preço.', pos: 'r' },
        { sel: '#atFonte', txt: 'Fonte do preço.', pos: 'l' },
        { sel: '#atOk', txt: 'Cadastrar e atender.', pos: 'b' },
        { sel: '#atNo', txt: 'Recusar (pede o motivo, que vai para quem pediu).', pos: 'b' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '07-12', nome: 'cadastro-qualidade', titulo: 'Visão geral → Qualidade dos dados', alto: 1100,
      prep: async (p, h) => { await h.cad('mapa'); await h.cad('qualidade'); },
      clip: '#app section.card',
      marcas: [
        { sel: '.kpis .kpi', nth: 0, txt: 'Impede ou distorce o cálculo.', pos: 't' },
        { sel: '.kpis .kpi', nth: 3, txt: 'Sem utilização: insumos sem nenhuma referência (lista no fim da página).', pos: 't' },
        { sel: '[data-qf="qSev"]', txt: 'Filtro por criticidade.', pos: 'b' },
        { sel: '[data-qf="qTipo"]', txt: 'Filtro por tipo de problema.', pos: 't' },
        { sel: '[data-qf="qFam"]', txt: 'Filtro por família.', pos: 'r' },
        { sel: '#app section.card button[data-ins]', txt: 'Abrir: leva à ficha do insumo para corrigir.', pos: 'l' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'O cadastro de insumos é a lista de tudo o que entra no custo de um equipamento: motores, bombas, painéis, bases, mão de obra, embalagem e demais componentes. Cada insumo tem um **código** fixo (família + sequência, por exemplo 01-1008), uma **descrição técnica** e um **preço de aquisição** em reais. As estruturas, os kits e as propostas leem o insumo pela descrição técnica; por isso o capítulo 8 trata só da padronização das descrições.' },
    { t: 'p', x: 'Caminho: menu lateral **Cadastros** → área **Custos** → aba **Insumos e preços**. O mesmo item aparece no **Mapa do cadastro** (área **Visão geral**) como "Insumos e componentes".' },
    { t: 'aviso', x: 'Uma alteração no cadastro vale para todas as propostas: no modo compartilhado, para as de toda a equipe; no modo local, para as deste navegador. Todas as telas deste capítulo foram capturadas no **modo local**, em que não há login: quem abre o arquivo pode editar o cadastro (a tela mostra "Salvo só neste navegador" e "Você pode editar Custos"). No **modo compartilhado**, gravar no cadastro exige o papel **Editor**, verificado no banco. Se o dono do app definiu responsáveis por área, só quem está na área **Custos** (ou o dono) altera insumos e preços; os demais veem "Somente leitura".' },
    { t: 'h', x: 'A lista de insumos' },
    { t: 'p', x: 'No alto da aba ficam quatro indicadores: **Insumos** (com o limite da planilha, 999), **Famílias**, **Sem preço** (insumos sem preço puxam custo zero na proposta) e **Última alteração**. Abaixo, a barra de busca e filtros e a tabela. A lista mostra até 400 linhas; se houver mais, refine a busca.' },
    { t: 'fig', id: '07-01' },
    { t: 'tab', cab: ['Recurso', 'Como funciona'], lin: [
      ['Busca', 'Procura em código, descrição técnica, fabricante, tipo, observações, família, código do fabricante, descrições comercial e do fabricante e nas características técnicas. Todas as palavras digitadas precisam aparecer. Os **sinônimos** cadastrados ampliam a busca (por exemplo, IPW55 também encontra IP55).'],
      ['Filtros', '**Todas as famílias**, **Todos os fabricantes**, **Toda situação** (inclui "Com pendência": sem preço, fora do padrão, preço vencido ou situação diferente de Ativo; "Preço vencido (mais de 30 dias)"; e "Preço sem data de atualização"), **Só sem preço** e **★ Favoritos**.'],
      ['Favoritos', 'A estrela ☆ de cada linha marca o insumo como favorito. Os favoritos ficam no topo da lista. Eles são guardados neste navegador, por pessoa.'],
      ['Ordenação', 'Clique no título **Código**, **Produto**, **Valor** ou **Preço atualizado em** (este, do preço mais antigo para o mais novo). A coluna ativa mostra ▾.'],
      ['Selos na linha', 'Situação (quando não é Ativo), **fora do padrão**, **preço vencido** e, na coluna Valor, **sem preço**.'],
      ['Preço atualizado em', 'Data da última atualização do preço (a mais recente entre a data da cotação e a data em que o preço mudou no cadastro), com o selo **vencido · N d** depois de 30 dias, **vence em N d** nos 5 dias antes, ou **sem data** para preços da planilha original.'],
      ['Exportar CSV', 'Baixa a lista completa (código, família, produto, fabricante, tipo, valor, origem, observações).'],
    ] },
    { t: 'tut', titulo: 'Encontrar um insumo', objetivo: 'Localizar rapidamente um item do cadastro para consultar ou editar.', quem: 'Qualquer usuário consulta (inclusive Leitor). No modo local não há controle de acesso.', pre: ['App aberto em **Cadastros** → **Custos** → **Insumos e preços**.'], passos: [
      'Digite no campo de busca parte do código, do modelo, do fabricante ou de uma característica.',
      'Se precisar, escolha a família, o fabricante ou a situação nos filtros.',
      { x: 'Clique no título de uma coluna para ordenar. Clique na ☆ para guardar o item nos favoritos.', fig: '07-01' },
      'Clique na linha para abrir a ficha do insumo.',
    ], resultado: 'A contagem abaixo da barra mostra quantos insumos atendem à busca ("139 de 938 insumos", por exemplo) e a ficha abre ao clicar na linha.', dica: 'Use **Toda situação** → **Com pendência** para achar de uma vez os itens sem preço, fora do padrão ou com cotação vencida.' },
    { t: 'h', x: 'A ficha guiada do insumo' },
    { t: 'p', x: 'A ficha abre ao clicar numa linha ou em **+ Novo insumo**. Ela é organizada em abas, como uma ficha de dados mestres: **Geral** (família, código, situação, fabricante, código do fabricante, tipo/config., origem, certificação, as três **Descrições** e o texto **Na proposta**); **Técnica** (**Características técnicas** da família e **Equivalentes técnicos e alternativas**); **Compras e custos** (**Preço de aquisição**, **Fornecedores e cotações** e **Histórico de preço**); e, nos itens já gravados, **Estruturas e utilização** (**Onde é usado**), **Documentos** (folha de dados técnica e anexos) e **Histórico** (**Histórico deste insumo**). Todas as abas são do mesmo formulário: **Salvar** grava tudo de uma vez e fica sempre visível embaixo. As setas ← → trocam de aba quando a barra de abas está selecionada.' },
    { t: 'fig', id: '07-20' },
    { t: 'tab', cab: ['Situação', 'Quando usar'], lin: [
      ['Ativo', 'Liberado para uso. Registros antigos sem situação contam como ativos.'],
      ['Provisório', 'Criado pela importação de preços, aguardando conferência.'],
      ['Aguardando validação técnica', 'Cadastrado, mas a Engenharia ainda precisa validar.'],
      ['Aguardando preço', 'Cadastrado sem preço confirmado (Compras).'],
      ['Inativo', 'Sai das listas de escolha; continua no cálculo das propostas que já o usam.'],
      ['Descontinuado', 'Como inativo, e abre o campo **Substituto (quando descontinuado)**.'],
    ] },
    { t: 'tut', titulo: 'Cadastrar um novo insumo pela ficha guiada', objetivo: 'Incluir um item novo com a descrição técnica no padrão da família.', quem: 'No modo compartilhado: **Editor** (e, se houver responsáveis por área, quem cuida de **Custos** ou o dono). No modo local, quem abre o arquivo.', pre: ['Ficha técnica ou cotação do item, com os dados que a família pede.', 'Ter conferido na busca que o item ainda não existe.'], passos: [
      'Em **Insumos e preços**, escolha a família no filtro (opcional) e clique em **+ Novo insumo**.',
      'Confira a **Família**. O **Código (não muda)** é sugerido pela família.',
      { x: 'Preencha **Fabricante** e, se houver, **Código do fabricante**. Na aba **Técnica**, em **Características técnicas**, preencha os campos marcados com * (obrigatórios). Nas listas curtas, clique no botão da opção; use **outro** para um valor fora da lista.', fig: '07-02' },
      'Ao sair do campo de modelo, se o modelo já existe na família, o app preenche os campos vazios que são iguais em todos os itens daquele modelo e avisa quais preencheu. Confira-os.',
      { x: 'Volte à aba **Geral** e veja a **Descrição técnica padronizada** montada automaticamente (caixa **gerar pelas características da família** marcada). Clique em **Sugerir** para a descrição comercial. Leia o quadro **Antes de salvar, confira**.', fig: '07-03' },
      'Informe o **Valor (R$)**, a **Origem do preço** e a **Data da cotação**.',
      'Clique em **Cadastrar**.',
    ], resultado: 'A ficha fecha, aparece o aviso "Cadastrado: <código>" e o item entra na lista. A inclusão fica no histórico (Configurações → Histórico).', atencao: 'Se faltar campo obrigatório, o app não grava e mostra "Preencha as características obrigatórias: …". Ele não inventa dado ausente: sem a informação, desmarque **gerar pelas características da família** e justifique a exceção (capítulo 8).', dica: 'Para um item parecido com um existente, abra o existente e clique em **Duplicar**: a ficha nova vem preenchida (família, fabricante, tipo, origem, descrição comercial, características) com "cópia de <código>" nas observações, e o código novo só é gerado ao cadastrar.' },
    { t: 'p', x: 'Na lista de famílias da ficha há a opção **+ Nova família…**, que pede o nome no formato nn.NOME, sem acento e sem espaço (por exemplo, 46.KITSUCCAO).' },
    { t: 'h', x: 'Fornecedores, cotações e equivalentes' },
    { t: 'p', x: 'Em **Fornecedores e cotações** cada linha é uma cotação: fornecedor, preço, moeda (BRL, USD, EUR), câmbio, impostos %, frete, prazo (dias), validade, pagamento e quantidade mínima. O app calcula o **Custo total = preço × câmbio × (1 + impostos) + frete**, por unidade, e marca o **menor total** só como indicação. Moeda estrangeira sem câmbio mostra "informe o câmbio"; validade vencida mostra **vencida**. O preço do cadastro continua sempre em reais.' },
    { t: 'p', x: 'Em **Equivalentes técnicos e alternativas** registre outro insumo do cadastro como **Equivalência técnica validada**, **Alternativa comercial (sujeita a aprovação)** ou **Substituto de produto descontinuado**, com características comparadas e justificativa (obrigatório) e restrições de uso. O app nunca troca um produto por outro sozinho.' },
    { t: 'tut', titulo: 'Registrar cotações de fornecedores e levar o preço ao cadastro', objetivo: 'Comparar fornecedores pelo custo total e atualizar o preço do insumo com a cotação escolhida.', quem: 'No modo compartilhado: **Editor** da área **Custos** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Cotações recebidas, com moeda, câmbio, impostos e frete.'], passos: [
      'Abra a ficha do insumo e clique na aba **Compras e custos**.',
      'Clique em **+ Fornecedor** para cada cotação e preencha a linha.',
      { x: 'Para moeda estrangeira, escolha a moeda e informe o câmbio. Compare o **Custo total**, o prazo, a validade e o pagamento.', fig: '07-04' },
      'Clique em **usar este preço** na cotação escolhida: o **Valor (R$)**, a **Origem do preço** e a **Data da cotação** são preenchidos.',
      { x: 'Se quiser, na aba **Técnica**, em **Equivalentes técnicos e alternativas**, escolha o produto, o tipo, escreva a justificativa e clique em **+ Registrar equivalente**.', fig: '07-21' },
      'Clique em **Salvar**.',
    ], resultado: 'O preço do cadastro passa a ser o custo total da cotação escolhida, e a mudança aparece no **Histórico de preço** da ficha.', atencao: '"usar este preço" só preenche os campos; nada é gravado até você clicar em **Salvar**.', dica: 'A aba **Fornecedores e fabricantes** (área Custos) resume os fornecedores das cotações cadastradas: itens cotados, cotações vencidas e prazo médio.' },
    { t: 'h', x: 'Mudança de preço e impacto nas propostas' },
    { t: 'p', x: 'Ao alterar o **Valor (R$)** de um insumo já gravado, a ficha mostra o quadro **Mudança de preço**: valor antigo → novo, variação, quantos componentes de estrutura usam o item e em quantas propostas ele foi escolhido à parte. O link **calcular o impacto na margem das propostas** recalcula as propostas salvas no motor, sem gravar nada, e lista as que mudam de custo, com a margem antes → depois e a indicação "congelada: não muda sozinha" ou "rascunho: muda ao abrir".' },
    { t: 'p', x: 'Propostas enviadas, aprovadas e ganhas guardam os **preços da época**; rascunhos passam a usar o novo preço (a menos que a política de Custos mande congelar os rascunhos também).' },
    { t: 'tut', titulo: 'Alterar o preço de um insumo e ver o impacto', objetivo: 'Atualizar um preço sabendo antes o que muda nas propostas.', quem: 'No modo compartilhado: **Editor** da área **Custos** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Novo preço e sua origem (fornecedor, nº do orçamento).'], passos: [
      'Abra a ficha do insumo.',
      { x: 'Na aba **Compras e custos**, digite o novo valor em **Valor (R$)**, preencha **Origem do preço** e **Data da cotação** e leia o quadro **Mudança de preço**. Clique em **calcular o impacto na margem das propostas**.', fig: '07-05' },
      'Clique em **Salvar**.',
      { x: 'Reabra a ficha e confira, na aba **Estruturas e utilização**, **Onde é usado**; na aba **Compras e custos**, o **Histórico de preço** (de, para, variação e origem; variações acima do limite da política de Custos ficam em vermelho); e, na aba **Histórico**, o **Histórico deste insumo**.', fig: '07-06' },
      { x: 'Documentos e histórico ficam nas últimas abas.', fig: '07-22' },
    ], resultado: 'O aviso "Salvo: <código>" aparece, o novo valor entra na lista e a alteração fica registrada no histórico de preço.', atencao: 'O cálculo considera o custo efetivamente usado em cada proposta. Na proposta de exemplo os custos estão digitados nas linhas dos componentes, por isso a captura mostra "Nenhuma proposta salva muda de custo com este preço."', dica: 'Use **📎 Anexar orçamento, nota ou ficha** para guardar a cotação junto do insumo.' },
    { t: 'nv', x: 'A tabela de propostas afetadas (custo, margem antes → depois, congelada/rascunho) foi conferida no código, mas não aparece nas capturas: com a proposta de exemplo, cujos custos estão digitados nas linhas, nenhuma proposta muda de custo.' },
    { t: 'h', x: 'Renomear um insumo' },
    { t: 'p', x: 'A descrição técnica é a chave que as fórmulas e as estruturas usam. Renomear na ficha é possível, mas o app mostra antes o impacto: quantas células de estrutura ou tabela por porte, quantos kits e quantas propostas passam a usar o nome novo. Ao confirmar, ele troca o nome nessas estruturas, tabelas e kits e grava o par nome antigo → novo, para que as propostas salvas reconheçam o nome antigo.' },
    { t: 'tut', titulo: 'Renomear um insumo usado em estrutura', objetivo: 'Corrigir a descrição técnica sem quebrar estruturas, kits e propostas.', quem: 'No modo compartilhado: **Editor** da área **Custos** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Ler o capítulo 8 (padrão da família).'], passos: [
      'Abra a ficha do insumo.',
      'Se a caixa **gerar pelas características da família** estiver marcada, ajuste as características; se não, edite a **Descrição técnica padronizada**.',
      { x: 'Clique em **Salvar**. Leia a mensagem de impacto em vermelho.', fig: '07-07' },
      'Clique em **Salvar** de novo para confirmar.',
    ], resultado: 'O nome muda no insumo, nas estruturas, tabelas por porte e kits que o usavam, e as propostas salvas passam a mostrar o nome novo quando abertas.', atencao: 'Quando a estrutura monta o nome (prefixo + porte, como as bases e embalagens por porte) ou uma fórmula calcula o nome, o app bloqueia: "Não dá para renomear: a estrutura "…" monta este nome (prefixo + porte); mude o prefixo da estrutura em vez de renomear o insumo."' },
    { t: 'h', x: 'Edição em massa e desfazer' },
    { t: 'p', x: 'Marque as caixas das linhas (ou a caixa do título, que marca as visíveis) e clique em **Edição em massa (N)**. Os campos possíveis são **Situação**, **Fabricante**, **Tipo/config.**, **Origem (NAC/IMP)**, **Reajuste de preço (%)**, **Data da cotação** e **Origem do preço**. O nome não se edita em massa. A prévia mostra o valor atual, o novo e quantos usos cada item tem.' },
    { t: 'tut', titulo: 'Reajustar preços em massa e desfazer o lote', objetivo: 'Aplicar um percentual a vários insumos de uma vez, com possibilidade de voltar.', quem: 'No modo compartilhado: **Editor** da área **Custos** (ou o dono); o botão **desfazer este lote** também só aparece para quem pode editar Custos. No modo local, quem abre o arquivo.', pre: ['Filtro ou busca que deixe visíveis só os itens a reajustar.'], passos: [
      'Filtre a lista e marque os insumos (ou a caixa do título).',
      'Clique em **Edição em massa (N)**.',
      { x: 'Em **Campo**, escolha **Reajuste de preço (%)** e digite o percentual em **Novo valor** (5 ou -3, por exemplo). Confira a prévia.', fig: '07-08' },
      'Clique em **Aplicar em N** e depois em **Confirmar: alterar N insumo(s)**.',
      { x: 'Para voltar: menu **Configurações** → **Histórico**, localize o lote e clique em **desfazer este lote** e depois em **confirmar: desfazer este lote**.', fig: '07-09' },
    ], resultado: 'Aviso "N insumo(s) alterado(s). Para desfazer: Configurações → Histórico." Ao desfazer: "N insumo(s) voltaram"; itens que mudaram de novo depois do lote ficam como estão e o aviso informa quantos.', atencao: 'O reajuste só vale para itens com preço: os sem preço não entram na prévia.', dica: 'O mesmo **desfazer este lote** aparece para importações de preços e consolidações de cadastro.' },
    { t: 'h', x: 'Excluir, inativar e descontinuar' },
    { t: 'p', x: 'O botão **Excluir** da ficha pede um segundo clique (**Confirmar exclusão**) e, se o item estiver em uso, avisa quantos componentes de estrutura e propostas o usam e recomenda marcar como Inativo ou Descontinuado. Propostas que usam um insumo excluído passam a mostrar "fora do catálogo". Não há lixeira de insumos: a exclusão fica registrada no histórico, mas não tem botão para restaurar. A lixeira do app (Configurações → Backup e restauração) é só de propostas.' },
    { t: 'aviso', x: 'Prefira **Inativo** ou **Descontinuado** com substituto a excluir. Ao descontinuar um item que ainda entra em estrutura, o app avisa que o cálculo continua igual: troque o insumo na estrutura ou no substituto.' },
    { t: 'h', x: 'Pedidos de cadastro' },
    { t: 'p', x: 'Quando falta um insumo ou um preço, quem monta a proposta pede o cadastro. O pedido vai para a área de Custos, que cadastra o item e escolhe a situação. Caminhos para pedir: **Cadastros** → **Custos** → **Pedidos de cadastro** → **+ Novo pedido**; na proposta, na seção **Componentes** do item, o botão **Pedir cadastro de insumo**; e o link **pedir cadastro** ao lado de uma linha "sem custo" ou "fora do catálogo". Quem pediu acompanha pelo cartão **Pedidos de cadastro** da tela inicial (**Ver pedidos**).' },
    { t: 'tab', cab: ['Situação ao cadastrar (Custos)', 'Situação do pedido', 'Insumo'], lin: [
      ['Ativo (liberado para uso)', 'atendido (filtro "Liberados")', 'Ativo, com preço obrigatório'],
      ['Aguardando validação técnica', 'aguardando validação', 'Aguardando validação técnica'],
      ['Aguardando preço (Compras)', 'aguardando preço', 'Aguardando preço; o preço é opcional'],
      ['Recusar', 'recusado (com o motivo)', 'Não é criado'],
    ] },
    { t: 'tut', titulo: 'Pedir o cadastro de um insumo e atendê-lo', objetivo: 'Levar um item que falta na proposta até o cadastro, com a descrição no padrão.', quem: 'Pedir: quem monta propostas. Atender (**Cadastrar**): área **Custos** — no modo compartilhado, **Editor** responsável por Custos ou o dono. No modo local, quem abre o arquivo faz as duas coisas.', pre: ['Dados básicos do item (família, fabricante, características).'], passos: [
      'Em **Pedidos de cadastro**, clique em **+ Novo pedido** (ou use **Pedir cadastro de insumo** na proposta).',
      { x: 'Escolha a **Família**, preencha os campos e o **Fabricante**. Confira a **Descrição para o cadastro**, a mensagem "Descrição no padrão." e o aviso de itens parecidos. Informe a **Observação para Custos** e o **Prazo**. Clique em **Enviar pedido**.', fig: '07-10' },
      'Custos: na lista **Em aberto**, clique em **Cadastrar** no pedido.',
      { x: 'Confira a **Descrição (padrão da família)**, informe **Preço de custo (R$)**, escolha a **Situação ao cadastrar** e a **Fonte do preço**. Clique em **Cadastrar e atender** (ou **Recusar**, informando o motivo).', fig: '07-11' },
    ], resultado: 'Ao enviar: "Pedido enviado para Custos". Ao atender: "Cadastrado e atendido: <descrição>"; o insumo entra no cadastro com a situação escolhida e o pedido muda de situação.', atencao: 'Para liberar como Ativo o preço é obrigatório: sem ele o app mostra "Para liberar como ativo, informe o preço de custo (ou escolha "aguardando preço")". Se o item já existe com preço, o pedido avisa "Este insumo já existe no cadastro…" e o botão vira **Enviar mesmo assim (atualizar o preço)**.', dica: 'Quando o nome digitado na proposta é diferente do padronizado, ao cadastrar o app troca esse nome pelo padronizado nas propostas salvas.' },
    { t: 'nv', x: 'No modo compartilhado, não foi possível verificar no banco qual papel mínimo (Contribuidor ou Editor) consegue gravar um pedido de cadastro.' },
    { t: 'h', x: 'Importar preços: não encontrados viram provisórios' },
    { t: 'p', x: 'Em **Custos** → **Importar preços**, depois de ler o arquivo (Excel, CSV ou texto colado), a etapa **3. Conferir e aplicar** mostra os preços que mudam, os iguais, os **Não encontrados** e os de preço ilegível. Em **Ver os N não encontrados (registros novos)**, escolha a família em **Cadastrar os novos como provisórios na família** e clique em **Conferir e cadastrar N provisório(s)**. A janela **Novos cadastros provisórios** confere padrão e duplicidade de cada descrição (itens com possível duplicidade vêm desmarcados). Clique em **Cadastrar marcados como provisórios**.' },
    { t: 'p', x: 'Os itens entram com situação **Provisório**, o preço do arquivo e a observação "importado de <arquivo>"; a lista de insumos abre filtrada em Provisório para validação. Até 100 por vez. Códigos (01-1234) não encontrados não viram cadastro; só descrições. Importar exige poder editar Custos.' },
    { t: 'nv', x: 'A importação de provisórios foi conferida no código (Importar preços → não encontrados), sem captura neste capítulo.' },
    { t: 'h', x: 'Qualidade dos dados, sem utilização e mapa' },
    { t: 'p', x: 'Em **Cadastros** → **Visão geral** → **Qualidade dos dados**, o painel aponta problemas por criticidade (impede ou distorce o cálculo, pede atenção, informação), com filtros por criticidade, tipo e família e o botão **Abrir** que leva à ficha. Para nomes repetidos, o botão **Consolidar…** (área Custos) escolhe o registro que fica; os outros passam a descontinuados com substituto, e o lote pode ser desfeito. Nada é corrigido sozinho.' },
    { t: 'fig', id: '07-12' },
    { t: 'p', x: 'Mais abaixo, **Cadastros sem utilização** lista os insumos sem referência em estruturas, tabelas, kits, regras, propostas e baixas. Quem edita Custos pode marcá-los e usar **Marcar os selecionados como inativos** ou **… como descontinuados**; nenhum registro é excluído. O **Mapa do cadastro** (aba ao lado) organiza todos os cadastros em cinco grupos (A a E) com links para cada tela.' },
  ],
  glossario: [
    ['Insumo', 'Item do cadastro de custos (componente, motor, bomba, mão de obra…), com código, descrição técnica e preço.'],
    ['Código do insumo', 'Identificador aa-bbbb (família + sequência). Não muda depois de criado.'],
    ['Situação do insumo', 'Ativo, Provisório, Aguardando validação técnica, Aguardando preço, Inativo ou Descontinuado.'],
    ['Custo total de aquisição', 'Preço × câmbio × (1 + impostos) + frete, por unidade, calculado na cotação do fornecedor.'],
    ['Pedido de cadastro', 'Solicitação de inclusão ou preço de insumo enviada para a área de Custos.'],
    ['Lote', 'Conjunto de alterações gravadas de uma vez (edição em massa, importação, consolidação), que pode ser desfeito pelo histórico.'],
  ],
};

// ---- Importar preços e demais tabelas da área Custos ----
const irCustos = async (p, h, aba) => { await h.nav('cadastro'); await p.click('.areatabs [data-cad="insumos"]'); await h.esperar(400); await h.cad(aba); await h.topo(); };
module.exports.capturas.push(
  { id: '07-13', nome: 'cadastro-importar-colar', titulo: 'Importar preços: lista de preços colada', novo: true,
    prep: async (p, h) => { await irCustos(p, h, 'importar'); await p.fill('#impTxt', 'Código\tPreço\n01-1002\t71.500,00\n11-11001\t52.300,00\nBOMBA TREINO FICTICIA 123\t1.000,00'); },
    clip: '#app section.card:has(#impTxt)', marcas: [
      { sel: 'label[for="impFile"]', txt: 'Escolher arquivo Excel (.xlsx), CSV ou texto.', pos: 'tr' },
      { sel: '#impTxt', txt: 'Ou cole as colunas copiadas de uma planilha (código ou descrição e preço).', pos: 'l' },
      { sel: '#impRead', txt: 'Ler o texto colado.', pos: 'r' },
    ] },
  { id: '07-14', nome: 'cadastro-importar-conferir', titulo: 'Importar preços: colunas, conferência e aplicação',
    prep: async (p, h) => { await h.clicar('#impRead', 700); },
    clip: ['#app section.card:has(#impId)', '#app section.card:has(#impReset)'], marcas: [
      { sel: '#impId', txt: 'Coluna que identifica o insumo (código ou descrição).', pos: 'l' },
      { sel: '#impVal', txt: 'Coluna do preço.', pos: 'b' },
      { sel: '#impHdr', txt: 'Primeira linha é cabeçalho.', pos: 't' },
      { sel: '#app section.card:has(#impReset) .kpis', txt: 'Quantos preços mudam, iguais, não encontrados e ilegíveis.', pos: 'l' },
      { sel: '#impGo', txt: 'Aplicar só os marcados; a importação entra no histórico como uma alteração.', pos: 'b' },
    ] },
  { id: '07-15', nome: 'cadastro-validade-alertas', titulo: 'Custos → Validade e alertas', novo: true,
    prep: async (p, h) => { await irCustos(p, h, 'custoscfg'); },
    clip: '#app section.card:last-of-type', marcas: [] },
  { id: '07-16', nome: 'cadastro-cambio', titulo: 'Custos → Câmbio e importação (peças importadas da SPV)', novo: true,
    prep: async (p, h) => { await irCustos(p, h, 'cambio'); },
    clip: '#app section.card:last-of-type', marcas: [] },
  { id: '07-17', nome: 'cadastro-valvulas', titulo: 'Custos → Válvulas de alívio', novo: true,
    prep: async (p, h) => { await irCustos(p, h, 'valvulas'); },
    clip: '#app section.card:last-of-type', alto: 1100, marcas: [] },
  { id: '07-18', nome: 'cadastro-facts-mecon', titulo: 'Custos → FACTS (MECON): lista de preços e custos de importação', novo: true,
    prep: async (p, h) => { await irCustos(p, h, 'facts'); },
    clip: [['#app section.card', -2], ['#app section.card', -1]], alto: 1600, marcas: [] },
);
module.exports.conteudo.push(
  { t: 'h', x: 'Importar preços em massa' },
  { t: 'p', x: 'Em **Cadastros** → **Custos** → **Importar preços**, a lista de preços de um fornecedor atualiza vários insumos de uma vez. O sistema aceita Excel (.xlsx), CSV ou colunas copiadas de uma planilha, e precisa de uma coluna com o código do insumo (01-1001) ou a descrição exatamente como está no cadastro, e de uma coluna com o preço.' },
  { t: 'tut', titulo: 'Importar uma lista de preços', objetivo: 'Atualizar os preços de vários insumos a partir da lista de um fornecedor, conferindo antes de gravar.', quem: 'Editor (no modo compartilhado; responsável pela área Custos, se definida). Sem acesso de Editor, a tela mostra "Importar preços muda o cadastro de todos. Só quem tem acesso de Editor ao app pode fazer."', pre: ['Lista de preços com uma coluna de código ou descrição e uma de preço.'], passos: [
    { x: 'Clique em **Escolher arquivo**, ou cole as colunas no quadro e clique em **Ler o texto colado**.', fig: '07-13' },
    { x: 'Em **2. Colunas**, escolha a coluna que identifica o insumo e a **Coluna do preço**; marque **Primeira linha é cabeçalho** se for o caso.', fig: '07-14' },
    'Em **3. Conferir e aplicar**, confira a tabela: preço atual, novo e variação. Variações acima de 30% ficam em vermelho. Desmarque o que não deve ser gravado.',
    'Clique em **Aplicar N preço(s)**.',
  ], resultado: 'Os preços marcados são gravados e a importação inteira entra no histórico como uma alteração (Configurações → Histórico, com **desfazer este lote**).', atencao: 'Descrições não encontradas podem ser cadastradas como provisórias (botão **Conferir e cadastrar N provisório(s)**, em "Ver os N não encontrados"): entram com situação "Provisório" e o preço do arquivo, para validação de Engenharia/Custos. Códigos (01-1234) não encontrados não viram cadastro. O desfazer do lote volta os preços, mas não apaga os provisórios criados.', dica: 'Prefira importar pelo código do insumo: a descrição precisa ser idêntica à do cadastro.' },
  { t: 'nota', x: 'Na figura, a lista colada é fictícia (a linha "BOMBA TREINO FICTICIA 123" não existe no cadastro e aparece entre os não encontrados). A importação não foi aplicada.' },
  { t: 'h', x: 'Outras tabelas da área Custos' },
  { t: 'tab', cab: ['Aba', 'O que guarda', 'Onde é usado'], lin: [
    ['Validade e alertas', 'Validade do preço (padrão 30 dias: atualização mensal), aviso antes de vencer, variação de preço que pede atenção, política de envio (travar "Enviar ao cliente" com impeditivos) e preços da época dos rascunhos', 'Aba Custos e Conferência das propostas'],
    ['Câmbio e importação', 'Câmbio do dólar e do euro e fator de importação (frete, impostos e despacho)', 'Peças importadas das propostas SPV'],
    ['Válvulas de alívio', 'Kits de válvula de alívio: descrição, tipo, marca, válvula, waste cone e custo total', 'Itens SEQ com válvula de alívio'],
    ['FACTS (MECON)', 'Lista MECON (preço de integrador em EUR), R$ por EUR, IPI dos equipamentos, materiais de instalação, treinamento e engenheiro MECON em campo', 'Propostas FACTS'],
    ['Fornecedores e fabricantes', 'Cadastro de fornecedores (capítulo 12)', 'Ficha do insumo e documentos'],
    ['Pedidos de cadastro', 'Fila de pedidos de novos insumos (tutoriais deste capítulo)', 'Itens e SPV'],
  ] },
  { t: 'fig', id: '07-15' }, { t: 'fig', id: '07-16' }, { t: 'fig', id: '07-17' }, { t: 'fig', id: '07-18' },
  { t: 'aviso', x: 'Essas tabelas valem para todas as propostas novas (e para os rascunhos que não estão com preços da época). Alterar câmbio, fator de importação ou validade muda custos e alertas de muita gente: faça só se for o responsável pela área Custos.' },
);

// ---- Preço vencido: atualização mensal ----
const venceUm = async (p, h) => { await h.nav('cadastro'); await p.click('.areatabs [data-cad="insumos"]'); await h.esperar(300); await h.cad('insumos'); await p.fill('#insQ', '01-1020'); await h.esperar(500); await h.clicar('tr[data-ins="01-1020"]', 600); await h.clicar('.modal [data-ftab="compras"]', 250); await p.fill('#fDataCot', '2026-08-15'); await h.clicar('#fSave', 900); await p.fill('#insQ', ''); await h.esperar(500); };
module.exports.capturas.push(
  { id: '07-19', nome: 'cadastro-precos-vencidos', titulo: 'Insumos com preço vencido: indicador, aviso, filtro e coluna Preço atualizado em', novo: true,
    prep: async (p, h) => { await venceUm(p, h); await h.clicar('[data-insvenc]', 600); await h.topo(); },
    clip: ['#app .kpis', '#app section.card:has(#insQ)'], alto: 1100, marcas: [
      { sel: '#app .kpis .kpi:nth-child(4)', txt: 'Preço vencido: quantos estão há mais de 30 dias sem atualizar, quantos em uso e quantos sem data.', pos: 'tl' },
      { sel: '#insSit', txt: 'Filtro "Preço vencido (mais de 30 dias)" (também há "Preço sem data de atualização").', pos: 'bl' },
      { sel: 'button[data-insord="upd"]', txt: 'Coluna Preço atualizado em: clique para ordenar do preço mais antigo ao mais novo.', pos: 't' },
      { sel: 'tr[data-ins="01-1020"] td:last-child .pill', txt: 'Selo "vencido · N d" na data do preço.', pos: 'l' },
    ] },
);
module.exports.conteudo.push(
  { t: 'h', x: 'Atualização mensal dos preços' },
  { t: 'p', x: 'A atualização de preços dos insumos é **mensal**: depois de 30 dias sem atualizar, o preço fica **vencido**. A data que conta é a **última atualização do preço** — a mais recente entre a **Data da cotação** informada na ficha e a data em que o valor mudou no cadastro (pela ficha, pela edição em massa ou pela importação). Mudar outro campo do insumo (fabricante, descrição, situação) não renova o preço.' },
  { t: 'tut', titulo: 'Encontrar e atualizar os preços vencidos', objetivo: 'Manter os preços do cadastro com no máximo 30 dias, para as propostas novas saírem com custo atual.', quem: 'Editor (no modo compartilhado; responsável pela área Custos, se definida). No modo local, quem abre o arquivo.', pre: ['Preços atualizados dos fornecedores (lista, cotação ou orçamento).'], passos: [
    { x: 'Abra **Cadastros** → **Custos** → **Insumos e preços**. O indicador **Preço vencido** e a faixa amarela mostram quantos insumos passaram de 30 dias; clique em **Ver os vencidos**.', fig: '07-19' },
    'A lista mostra só os vencidos, do preço mais antigo para o mais novo (coluna **Preço atualizado em**, com o selo **vencido · N d**).',
    'Para poucos itens, clique na linha, informe o novo **Valor** e a **Data da cotação** e clique em **Salvar**. Para muitos, use **Importar preços** (lista do fornecedor) ou a **Edição em massa**.',
    'Confira se o selo sumiu e se o indicador diminuiu.',
  ], resultado: 'A coluna Preço atualizado em mostra a data de hoje (ou a data da cotação informada) e o insumo sai do filtro de vencidos. As propostas abertas que usam esse insumo param de mostrar o aviso de preço vencido.', atencao: 'Os preços que vieram da planilha original não têm data e aparecem como **sem data** (filtro "Preço sem data de atualização"). Eles não entram na contagem de vencidos porque a data não é conhecida: atualize-os e eles passam a ter data e a entrar na regra dos 30 dias.', dica: 'Se a proposta mostrar o aviso, o botão **Atualizar no cadastro** abre esta lista já filtrada só com os insumos daquela proposta.' },
  { t: 'nota', x: 'Na figura, o preço de 01-1020 recebeu a data de cotação fictícia 15/08/2026 só para o exemplo de preço vencido.' },
);
