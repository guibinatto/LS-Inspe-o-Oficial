// Capítulo 9 — Estruturas (MONTADOR): componentes, tabelas por porte, rascunho, publicação, testador e comparação
const ENG = async (p, h) => { await h.nav('cadastro'); await h.cad('estruturas'); };
module.exports = {
  n: 9, titulo: 'Estruturas', slug: 'estruturas',
  capturas: [
    { id: '09-01', nome: 'estruturas-lista', titulo: 'Cadastros → Engenharia → Estruturas: componentes da estrutura Conjunto motobomba',
      prep: async (p, h) => { await ENG(p, h); for (const g of ['ELETRICA', 'JOCKEY', 'TODOS']) await h.clicar(`tr.grp[data-fold="${g}"]`, 250); await h.topo(); },
      clip: '.areatabs', pad: 8,
      marcas: [
        { sel: '.areatabs [aria-selected="true"]', txt: 'Área Engenharia: estruturas, famílias, regras e testador.', pos: 'b' },
        { sel: '.subtabs [data-estr="CMB"]', txt: 'Uma aba por estrutura (família de equipamento): Conjunto motobomba, Skid, Container.', pos: 't' },
        { sel: '[data-estrnew]', txt: '+ Nova estrutura: cria a estrutura de outra família, partindo dos componentes de uma existente.', pos: 'r' },
        { sel: '[data-recnew]', txt: '+ Novo componente: inclui uma linha na estrutura (60 linhas no total).', pos: 'l' },
        { sel: '#estrCmp', txt: 'Comparar com…: abre a comparação com outra estrutura.', pos: 't' },
        { sel: '#app .docbar [data-cad="testador"]', txt: 'Testar esta estrutura: abre o Testador de estruturas.', pos: 'r' },
        { sel: 'tr.grp[data-fold="DIESEL"]', txt: 'Grupo (conjunto) com a contagem de obrigatórios, opcionais e condicionais. Clique para recolher ou expandir.', pos: 'l' },
        { sel: 'tr[data-recpainel="98"] button[data-recedit]', txt: 'Editar: abre o componente.', pos: 'r' },
      ],
      depois: async (p, h) => { for (const g of ['ELETRICA', 'JOCKEY', 'TODOS']) await h.clicar(`tr.grp[data-fold="${g}"]`, 250); } },
    { id: '09-02', nome: 'estruturas-componente', titulo: 'Janela do componente da estrutura (Tanque de combustível)',
      prep: async (p, h) => { await h.clicar('tr[data-recpainel="98"] button[data-recedit]', 500); },
      clip: '.modal .card', pad: 8,
      marcas: [
        { sel: '#rRot', txt: 'Nome do componente (como aparece no item).', pos: 'l' },
        { sel: '#rAc', txt: 'Conjunto: diesel, elétrico, bomba jockey ou comum ao equipamento.', pos: 'l' },
        { sel: '.modal .chks', txt: 'Vale para: em quais estruturas a linha entra.', pos: 'b' },
        { sel: '#rTipo', txt: 'De onde sai o insumo: escolhido no item, tabela por porte, porte do motor ou insumo fixo.', pos: 'l' },
        { sel: '#rFx', txt: 'Coluna da tabela por porte (aparece conforme a origem escolhida).', pos: 'l' },
        { sel: '#rQ', txt: 'Quantidade: 1 por bomba, 1 por bomba + 1, 2 ou 4 por bomba, ou fixa por equipamento.', pos: 'l' },
        { sel: '#rRg', txt: 'Condição: sempre, só sem kit, só trocador/radiador ou opcional marcado no item.', pos: 'l' },
        { sel: '#rSave', txt: 'Salvar. Ao lado, Excluir da estrutura pede confirmação.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '09-03', nome: 'estruturas-tabelas-porte', titulo: 'Tabelas por porte: potência do diesel (HP)',
      prep: async (p, h) => { await h.topo(); },
      clip: '#app section.card .banner.info', pad: 14,
      marcas: [
        { sel: '[data-porte="VAZAO"]', txt: 'Três tabelas: Potência do diesel (HP), Potência elétrica (CV) e Vazão (hidráulica, bitolas por vazão da bomba).', pos: 'r' },
        { sel: '#app section.card .banner.info', txt: 'Para que serve a tabela, com um exemplo lido da própria tabela.', pos: 'l' },
        { sel: 'input[data-tcell]', txt: 'Limites da faixa: digite o número e saia do campo para gravar.', pos: 'l' },
        { sel: 'button.pedit', txt: 'Insumo da faixa: clique e escolha do cadastro (ou Deixar sem).', pos: 'b' },
      ] },
    { id: '09-04', nome: 'estruturas-rascunho', titulo: 'Estrutura em rascunho com uma alteração pendente',
      prep: async (p, h) => {
        await h.topo(); await h.clicar('[data-estrrasc]', 600);
        await h.clicar('tr[data-recpainel="103"] button[data-recedit]', 500);
        await p.selectOption('#rRg', 'OPCIONAL'); await h.clicar('#rSave', 900);
        await h.topo();
      },
      clip: '#app section.card', pad: 8,
      marcas: [
        { sel: '#app section.card label.chk:has([data-estrrasc])', txt: 'editar em rascunho: marcado, as mudanças vão para o rascunho e as propostas não as veem.', pos: 'l' },
        { sel: '#app section.card .pill.warn', txt: 'Quantas células o rascunho mudou.', pos: 't' },
        { sel: '[data-rascdif]', txt: 'Ver diferenças e impacto: o que mudou e quais modelos prontos mudam (sem publicar).', pos: 't' },
        { sel: '[data-rascpub]', txt: 'Publicar…: mostra as diferenças e o impacto e só então libera a publicação.', pos: 't' },
        { sel: '[data-rascdesc]', txt: 'Descartar rascunho (pede confirmação).', pos: 'b' },
        { sel: '#app .banner.warn', txt: 'Aviso: a tela mostra o rascunho.', pos: 'l' },
        { sel: 'tr[data-recpainel="103"] .pill', txt: 'Sensores passou a opcional no rascunho.', pos: 'l' },
      ] },
    { id: '09-05', nome: 'estruturas-impacto', titulo: 'Publicar o rascunho: diferenças e impacto nos modelos prontos', alto: 1500,
      prep: async (p, h) => {
        await h.clicar('[data-rascpub]', 600);
        await p.waitForFunction(() => { const e = document.querySelector('#riRes'); return e && !/Testando|Calculando/.test(e.textContent); }, null, { timeout: 120000 });
        await h.esperar(500);
      },
      clip: '.modal .card', pad: 8,
      marcas: [
        { sel: '.modal table', txt: 'Diferenças por linha da estrutura: incluído, excluído ou alterado (campo: antes → depois).', pos: 'l' },
        { sel: '#riRes', txt: 'Impacto: cada modelo pronto das estruturas alteradas é montado no motor real, antes e depois.', pos: 'l' },
        { sel: '#riPub', txt: 'Publicar: só fica ativo depois do cálculo do impacto.', pos: 'b' },
        { sel: '.modal [data-close]', txt: 'Fechar sem publicar: o rascunho continua guardado.', pos: 'b' },
      ] },
    { id: '09-06', nome: 'estruturas-versoes', titulo: 'Versões publicadas recentes, com Desfazer esta versão',
      prep: async (p, h) => {
        await h.clicar('#riPub', 1500); await h.topo();
        await h.clicar('#app section.card details summary', 400);
      },
      clip: '#app section.card', pad: 8,
      marcas: [
        { sel: '#app section.card details summary', txt: 'Versões publicadas recentes: data, quem publicou e quantas células mudaram.', pos: 'l' },
        { sel: '[data-estrdesf]', txt: 'desfazer esta versão: o primeiro clique pede confirmação e mostra quantas células voltam.', pos: 'b' },
        { sel: '#app section.card label.chk:has([data-estrrasc])', txt: 'Depois de publicar, o modo rascunho é desligado.', pos: 'tr' },
      ] },
    { id: '09-07', nome: 'estruturas-testador-comparar', titulo: 'Testador de estruturas comparando dois modelos prontos',
      prep: async (p, h) => {
        await h.cad('testador');
        await p.selectOption('#tsCmp', { index: 2 }); await h.esperar(500);
        await h.clicar('[data-tstrun]', 3500); await h.topo();
      },
      clip: '#app section.card', clipNth: 0, pad: 8,
      marcas: [
        { sel: '#tsEstr', txt: 'Estrutura a testar.', pos: 'l' },
        { sel: '#app .seg', txt: 'Configurar por modelo pronto ou por características (arranjo, bomba, potências, vazão).', pos: 'r' },
        { sel: '#tsMod', txt: 'Modelo pronto a montar.', pos: 'l' },
        { sel: '#tsCmp', txt: 'Comparar com: outro modelo pronto.', pos: 'r' },
        { sel: '#app .chks', txt: 'Opcionais da estrutura: marque para testar com eles.', pos: 'l' },
        { sel: '[data-tstrun]', txt: 'Montar e testar: roda a planilha real numa cópia. Nada é gravado.', pos: 'r' },
        { sel: '#app section.card tr.tot', txt: 'Custo direto por grupo e do item, nos dois modelos, com a diferença.', pos: 'l' },
      ] },
    { id: '09-08', nome: 'estruturas-testador-resultado', titulo: 'Resultado do testador: componentes, custo e diagnóstico',
      prep: async (p, h) => { await h.topo(); },
      clip: '#app section.card', clipNth: 2, pad: 8,
      marcas: [
        { sel: '#app .kpi.lead', txt: 'Custo do item calculado pela planilha.', pos: 'l' },
        { sel: '#app section.card .kpis .kpi:nth-child(3)', txt: 'Componentes sem cadastro / sem preço.', pos: 't' },
        { sel: '#app tr.grp', txt: 'Grupo com subtotal e participação no custo.', pos: 'l' },
        { sel: '#app section.card:nth-of-type(3) th:last-child', txt: 'Por que entrou: origem, condição e a linha da estrutura (clique na linha para abrir o componente).', pos: 't' },
        { sel: '#app section.card h3', txt: 'Componentes que não entraram e o motivo.', pos: 'l' },
      ] },
    { id: '09-09', nome: 'estruturas-comparar', titulo: 'Comparar estruturas: Conjunto motobomba × Skid (trecho com diferenças)', alto: 1100,
      prep: async (p, h) => { await h.cad('estruturas'); await h.topo(); await p.selectOption('#estrCmp', 'SKID'); await h.esperar(600);
        await p.evaluate(() => { const c = document.querySelector('.modal .card'); const w = c.querySelector('.pill.warn'); c.scrollTop += w.getBoundingClientRect().top - c.getBoundingClientRect().top - 420; }); await h.esperar(300); },
      clip: '.modal .card', pad: 8,
      marcas: [
        { sel: '.modal .pill.warn', txt: 'difere: mostra o que muda entre as duas (tipo, campo do insumo, quantidade, condição, família).', pos: 'l' },
        { sel: '.modal tr:has(.pill.warn) ~ tr:has(.pill.ok) .pill.ok', txt: 'mesma linha: o componente é a mesma linha da estrutura nas duas.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.esc(); } },
  ],
  conteudo: [
    { t: 'p', x: 'A **estrutura** diz o que entra em cada equipamento montado: quais componentes, de onde sai o insumo de cada um (o motor ou a bomba escolhidos no item, uma tabela por porte ou um insumo fixo), quantos por bomba e em que condição. Ela fica na aba MONTADOR da planilha (linhas 92 a 151, 60 linhas no total) e é a mesma para todas as propostas. Toda proposta nova monta o item por aqui.' },
    { t: 'p', x: 'O caminho é **Cadastros → Engenharia → Estruturas**. Na mesma área ficam **Famílias**, **Regras de configuração** e **Testador de estruturas**.' },
    { t: 'tab', cab: ['Papel', 'O que pode fazer nesta tela'], lin: [
      ['Leitor, Contribuidor', 'Ver as estruturas, as tabelas por porte, as comparações e usar o testador. Os campos aparecem bloqueados e o selo "Somente leitura" aparece no alto.'],
      ['Editor', 'Editar componentes, tabelas por porte, rascunho, publicar e desfazer versões. Se o dono definiu responsáveis por área, só o responsável pela área Engenharia (ou o dono) edita.'],
      ['Modo local', 'Sem login: quem abre o arquivo edita tudo. Use só para estudo e treino.'],
    ] },
    { t: 'aviso', x: 'No modo compartilhado, gravar estruturas exige o papel Editor, verificado no banco da equipe. Uma estrutura publicada vale para as propostas de toda a equipe.' },
    { t: 'h', x: 'A tela de estruturas' },
    { t: 'p', x: 'Cada estrutura tem uma aba. Os componentes aparecem em grupos (Conjunto diesel, Conjunto elétrico, Bomba jockey e Comum ao equipamento). Cada linha mostra o componente, de onde sai o insumo, a quantidade, a condição (selo obrigatório, opcional ou condicional) e para quais estruturas vale. O texto acima das abas informa quantas linhas livres restam das 60.' },
    { t: 'fig', id: '09-01' },
    { t: 'nota', x: 'A ordem das linhas não pode ser mudada: a posição da linha no MONTADOR é referência das fórmulas da planilha.' },
    { t: 'tut', titulo: 'Editar um componente da estrutura', objetivo: 'Mudar a origem, a quantidade ou a condição de um componente, ou incluir um componente novo.', quem: 'Editor (no modo compartilhado; responsável pela área Engenharia, se as áreas estiverem definidas). No modo local não há controle de acesso.', pre: ['Saber qual insumo do cadastro deve entrar (para origem "Sempre o mesmo insumo").', 'De preferência, marcar **editar em rascunho** antes (ver o tutorial seguinte).'], passos: [
      'Abra **Cadastros → Engenharia → Estruturas** e clique na aba da estrutura.',
      'Clique em **Editar** na linha do componente, ou em **+ Novo componente** para incluir um.',
      { x: 'Preencha **Nome do componente**, **Conjunto**, **Vale para**, **Família do cadastro**, **Bloco**, **De onde sai o insumo**, **Quantidade** e **Condição**. Os campos de coluna da tabela, texto antes/depois do porte ou **Insumo** aparecem conforme a origem escolhida.', fig: '09-02' },
      'Clique em **Salvar**. Para tirar o componente, clique em **Excluir da estrutura** e depois em **Confirmar exclusão**.',
    ], resultado: 'O aviso "Estrutura salva: <nome>" aparece e a linha muda na lista. Sem o modo rascunho, a mudança já vale para os itens montados a partir de agora.', atencao: 'Se o insumo escolhido não estiver no cadastro de insumos, o app avisa "Atenção: "<insumo>" não está no cadastro de insumos; entra com custo zero." Sem nome, aparece "Dê um nome ao componente."; sem estrutura marcada, "Marque ao menos uma estrutura em "Vale para"."', dica: 'Para criar a estrutura de outra família de equipamento, use **+ Nova estrutura** e escolha em **Começar com os componentes de** a estrutura mais parecida.' },
    { t: 'h', x: 'Tabelas por porte' },
    { t: 'p', x: 'As tabelas por porte guardam os componentes que mudam com o tamanho do equipamento. Há três: **Potência do diesel (HP)**, **Potência elétrica (CV)** e **Vazão (hidráulica)**. Quando um item é montado, o app acha a linha da faixa e coloca esses componentes sozinho nas linhas da estrutura que usam "tabela por porte".' },
    { t: 'fig', id: '09-03' },
    { t: 'lista', itens: [
      'Limites da faixa (colunas numéricas à esquerda): digite o número e saia do campo; a gravação é imediata.',
      'Insumos da faixa: clique no nome, escolha o insumo na lista do cadastro e clique em **Salvar**, ou em **Deixar sem**.',
      'Na tabela de vazão você muda as bitolas (colunas à esquerda); os nomes dos insumos à direita saem delas.',
    ] },
    { t: 'aviso', x: 'As tabelas por porte gravam direto na versão publicada, mesmo com **editar em rascunho** marcado (confirmado no código: só os componentes da estrutura passam pelo rascunho). Mudar uma faixa muda na hora o custo dos itens novos e dos rascunhos de proposta. As mudanças nas tabelas de HP e de CV entram em **Versões publicadas recentes** e podem ser desfeitas por lá; as da tabela de vazão ficam só em Configurações → Histórico.' },
    { t: 'h', x: 'Rascunho, diferenças, impacto e publicação' },
    { t: 'p', x: 'O quadro **Publicação**, no alto da tela, controla como a estrutura é editada. Com **editar em rascunho** marcado, as alterações de componentes ficam guardadas à parte e as propostas continuam usando a estrutura publicada até a publicação. O rascunho é um só, compartilhado pela equipe.' },
    { t: 'tut', titulo: 'Alterar a estrutura em rascunho e publicar', objetivo: 'Mudar a estrutura com segurança: ver o que muda e o efeito nos modelos prontos antes que as propostas passem a usar a mudança.', quem: 'Editor (no modo compartilhado; responsável pela área Engenharia, se as áreas estiverem definidas). Quem não edita vê o selo do rascunho e pode abrir Ver diferenças e impacto, mas não tem os botões Publicar… e Descartar rascunho. No modo local não há controle de acesso.', pre: ['Estrutura sem rascunho pendente de outra pessoa (o quadro mostra "Sem rascunho pendente.").'], passos: [
      'Em **Cadastros → Engenharia → Estruturas**, marque **editar em rascunho**.',
      { x: 'Edite os componentes normalmente e clique em **Salvar** em cada um. O quadro passa a mostrar "rascunho com N célula(s) alterada(s)" e a tela avisa que mostra o rascunho.', fig: '09-04' },
      'Clique em **Testar no testador** para montar um modelo com o rascunho (marque **usar o rascunho da estrutura** no testador).',
      { x: 'Clique em **Publicar…**. A janela lista as diferenças por linha e monta cada modelo pronto das estruturas alteradas antes e depois. Aguarde o fim de "Testando modelos prontos: N de M…".', fig: '09-05' },
      'Confira os modelos que mudam (custo antes → depois, o que entra e o que sai) e clique em **Publicar**.',
    ], resultado: 'O aviso "Estrutura publicada" aparece, o rascunho é zerado, o modo rascunho é desligado e a publicação entra em **Versões publicadas recentes**.', atencao: 'O botão **Publicar** só é liberado depois do cálculo do impacto. **Descartar rascunho** pede um segundo clique ("Confirmar: descartar o rascunho") e apaga todas as alterações pendentes.', dica: 'Use **Ver diferenças e impacto** para revisar sem o risco de publicar: a janela é a mesma, sem o botão Publicar.' },
    { t: 'tut', titulo: 'Desfazer uma versão publicada', objetivo: 'Voltar as células alteradas por uma publicação ou edição da estrutura.', quem: 'Editor (responsável pela área Engenharia, se definida). No modo local não há controle de acesso.', pre: ['A versão aparece em **Versões publicadas recentes** (as 8 alterações mais recentes da estrutura: publicações de rascunho e também edições feitas direto na estrutura publicada, nas tabelas de HP e CV e modelos prontos novos).'], passos: [
      { x: 'No quadro **Publicação**, abra **Versões publicadas recentes**.', fig: '09-06' },
      'Clique em **desfazer esta versão** na linha desejada.',
      'Clique de novo no botão, que passa a mostrar "confirmar: voltar estas N célula(s)".',
    ], resultado: 'O aviso informa quantas células voltaram. Se alguma célula já tinha mudado de novo depois daquela versão, ela fica como está e o aviso diz quantas ficaram. O desfazer também é registrado no histórico.', atencao: 'O desfazer vale para a estrutura publicada: as propostas novas e os rascunhos passam a montar com os valores anteriores.' },
    { t: 'nota', x: 'O botão **Voltar à estrutura da planilha** (aparece quando há alterações sobre a planilha) desfaz todas as alterações da estrutura e das tabelas por porte de uma vez, depois de um clique de confirmação.' },
    { t: 'h', x: 'O que muda nas propostas' },
    { t: 'p', x: 'Mudar a estrutura (ou uma tabela por porte) muda o custo das propostas novas e dos rascunhos de proposta, que montam os itens com a estrutura publicada no momento.' },
    { t: 'p', x: 'Ao salvar, a proposta SEQ guarda os **preços da época**: os preços dos insumos e kits que ela usou. Propostas enviadas, aprovadas e ganhas continuam calculando com esses preços, mesmo que o cadastro de preços mude.' },
    { t: 'aviso', x: 'Os preços da época congelam os preços, não a composição do item. Em teste com o arquivo atual, uma proposta enviada com um item montado por modelo pronto, reaberta depois de publicado um componente novo na estrutura, passou a ter o componente novo e o total mudou (de R$ 4.528.173,31 para R$ 4.873.830,64). A janela de publicação diz "Propostas com preços da época não mudam", o que vale só para os preços. Antes de publicar uma mudança de estrutura, avise quem tem propostas enviadas em aberto. A versão enviada ao cliente fica guardada no histórico de revisões da proposta como estava no envio.' },
    { t: 'h', x: 'Testador de estruturas' },
    { t: 'nota', x: 'Nas figuras do testador, Sensores aparece como opcional e fora do item porque o exemplo do tutorial anterior publicou essa mudança. Por isso o custo do modelo de 1500 USgpm aparece como R$ 314.367,95; com a estrutura original da planilha ele é R$ 316.071,95.' },
    { t: 'p', x: 'O **Testador de estruturas** (Engenharia → Testador de estruturas) monta um item de teste na planilha real, a mesma das propostas, e mostra o resultado. Nada é gravado. Pode ser usado por qualquer pessoa.' },
    { t: 'tut', titulo: 'Testar uma estrutura e comparar dois modelos', objetivo: 'Conferir o que entra em um equipamento, o custo de cada grupo e por que cada componente entrou ou não.', quem: 'Qualquer usuário (o testador não grava nada). No modo local não há controle de acesso.', pre: ['Estrutura com pelo menos um modelo pronto, ou as características do equipamento (arranjo, bomba, potência, vazão).'], passos: [
      'Abra **Cadastros → Engenharia → Testador de estruturas** (ou clique em **Testar esta estrutura** na tela de estruturas).',
      'Escolha a **Estrutura** e, em **Configurar por**, **modelo pronto** ou **características**.',
      'Escolha o **Modelo pronto** e, se quiser comparar, outro modelo em **Comparar com**. Marque os **Opcionais** que devem entrar.',
      { x: 'Clique em **Montar e testar**. Com um modelo em **Comparar com**, aparece a **Comparação de custo por grupo**.', fig: '09-07' },
      { x: 'Confira o **Resultado**: custo do item, componentes, os sem cadastro ou sem preço, os grupos e a coluna **Por que entrou**. No fim, **Componentes da estrutura que não entraram** explica o motivo de cada um.', fig: '09-08' },
    ], resultado: 'O custo do item calculado pela planilha, por grupo e por componente, sem alterar nenhuma proposta nem o cadastro.', atencao: 'A comparação mostra o custo direto dos componentes, sem as despesas alocadas e sem a margem. Não é o preço de venda.', dica: 'Clique em "linha N" na coluna **Por que entrou** para abrir o componente da estrutura direto do resultado. Com um rascunho pendente, marque **usar o rascunho da estrutura** para testar antes de publicar.' },
    { t: 'h', x: 'Comparar estruturas' },
    { t: 'p', x: 'Na tela de estruturas, escolha uma estrutura em **Comparar com…**. A janela lista os componentes das duas, lado a lado, com a origem, a quantidade e a condição, e marca o que é igual, o que só uma tem e o que difere.' },
    { t: 'fig', id: '09-09' },
    { t: 'h', x: 'Mensagens que você pode ver' },
    { t: 'tab', cab: ['Mensagem', 'Quando aparece', 'O que fazer'], lin: [
      ['Somente leitura — edição é para quem tem acesso de Editor', 'Modo compartilhado sem o papel Editor', 'Peça acesso de Editor a quem publicou o app.'],
      ['Somente leitura — Engenharia é de outra área', 'Áreas definidas e você não é responsável pela Engenharia', 'Peça a alteração ao responsável ou ao dono.'],
      ['A receita já tem 60 linhas', '+ Novo componente sem linha livre', 'Exclua ou reaproveite um componente sem uso.'],
      ['Testando modelos prontos: N de M…', 'Cálculo do impacto em andamento', 'Aguarde; o botão Publicar é liberado no fim.'],
    ] },
  ],
  glossario: [
    ['Estrutura', 'Lista de componentes que o app usa para montar um equipamento de uma família (aba MONTADOR da planilha).'],
    ['Tabela por porte', 'Tabela de faixas (HP, CV ou vazão) que define os componentes que mudam com o tamanho do equipamento.'],
    ['Rascunho de estrutura', 'Alterações de componentes guardadas à parte; as propostas só as usam depois de publicadas.'],
    ['Testador de estruturas', 'Monta um item de teste no motor real da planilha, sem gravar nada.'],
  ],
};

// ---- Mão de obra e bases por porte ----
module.exports.capturas.push(
  { id: '09-10', nome: 'estruturas-mao-de-obra-bases', titulo: 'Engenharia → Mão de obra e bases por porte', novo: true,
    prep: async (p, h) => { await h.nav('cadastro'); await p.click('.areatabs [data-cad="estruturas"]'); await h.esperar(400); await h.cad('mobase'); await h.topo(); },
    clip: '#app section.card:last-of-type', alto: 1300, marcas: [] },
);
module.exports.conteudo.push(
  { t: 'h', x: 'Mão de obra e bases por porte' },
  { t: 'p', x: 'Em **Cadastros** → **Engenharia** → **Mão de obra e bases**, cada porte de equipamento tem o preço da base metálica, da mão de obra de montagem (conjunto e skid) e da embalagem. O porte sai da potência do motor diesel (Estruturas → Tabelas por porte) e escolhe a base, a mão de obra e a embalagem do item.' },
  { t: 'p', x: 'A tela transforma cada preço em critério: **mão de obra = horas × R$/hora** e **base = peso (kg) × R$/kg**. Informe o R$ por hora de montagem, o R$ por kg de base e, em cada porte, as horas e o peso: o sistema mostra o preço pelo critério ao lado do atual ("atual R$ …") e aplica com registro no histórico.' },
  { t: 'fig', id: '09-10' },
  { t: 'aviso', x: 'Aplicar o critério muda o custo de base, montagem e embalagem de todos os itens novos daquele porte. Confira o impacto no Testador de estruturas antes e depois.' },
);

// ---- Visões da estrutura: técnica, custeio e comercial ----
module.exports.capturas.push(
  { id: '09-11', nome: 'estruturas-visoes', titulo: 'Visão comercial da estrutura: em que grupo do escopo cada linha aparece', novo: true, alto: 1300,
    prep: async (p, h) => { await h.nav('cadastro'); await h.cad('estruturas'); await p.click('[data-estrvis][value="comercial"]', { force: true }); await h.esperar(400); await h.topo(); },
    clip: [['#app .seg:has([data-estrvis])', 0], ['#app .tw table.t', 0]], pad: 8,
    marcas: [
      { sel: '#app .seg:has([data-estrvis])', txt: 'Visão: Técnica (só o que é físico), Custeio (tudo que forma o custo, padrão) ou Comercial.', pos: 't' },
      { sel: '#app thead th:nth-child(5)', txt: 'Na visão comercial, esta coluna diz em que grupo do escopo da proposta a linha aparece, ou se fica só no custo.', pos: 'b' },
    ],
    depois: async (p) => { await p.click('[data-estrvis][value="custeio"]', { force: true }); } },
);
module.exports.conteudo.push(
  { t: 'h', x: 'Visões técnica, de custeio e comercial' },
  { t: 'p', x: 'A mesma estrutura pode ser vista de três jeitos, sem cadastro duplicado. Os botões **Técnica**, **Custeio** e **Comercial**, logo abaixo das abas das estruturas, trocam só a forma de ver: **Técnica** mostra a composição física do equipamento (tira mão de obra, pintura especial, embalagem, testes e ensaios e documentos); **Custeio** (o padrão) mostra todas as linhas que formam o custo; **Comercial** mostra, para cada linha, em que grupo do escopo da proposta ela aparece (Acionador, Bomba, Acessórios…), se entra dentro da descrição do motor diesel ou se fica só no custo. A regra é a mesma usada para montar o escopo da proposta; os textos vêm do escopo cadastrado por família e por insumo.' },
  { t: 'fig', id: '09-11' },
);
