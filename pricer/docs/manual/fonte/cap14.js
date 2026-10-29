// Capítulo 14 — Margens e indicadores
// Dados das capturas: duas propostas de exemplo salvas; uma marcada como enviada, com baixa (valor fechado menor
// que o proposto) e custo real lançado em parte; a outra fica em aberto (rascunho).
const lerNum = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));

module.exports = {
  n: 14, titulo: 'Margens e indicadores', slug: 'margens',
  inicio: async (p, h) => {
    await h.exemplo(); await h.salvar();
    await h.exemplo(); await h.salvar();
    await h.nav('inicio');
    await h.clicar('.home [data-etp$="|cliente"]', 700); // a primeira da lista passa a "Enviada ao cliente"
  },
  capturas: [
    { id: '14-01', nome: 'margens-dar-baixa', titulo: 'Janela Dar baixa: proposta fechada', clip: '.modal .card', pad: 8,
      prep: async (p, h) => {
        await h.nav('inicio');
        await h.clicar('.home [data-hnext$="|baixa"]', 600);
        await p.fill('#fcPed', 'OC 4521');
        await p.fill('#fcVal', '4.000.000,00'); await h.esperar(300);
        await p.fill('#fcObs', 'desconto final concedido na negociação');
      },
      marcas: [
        { sel: '.modal .kpi.lead', txt: 'Margem líquida da formação de hoje (sem IPI). É o valor que fica congelado na baixa.', pos: 'r' },
        { sel: '#fcData', txt: 'Data do fechamento: vem com a data de hoje; corrija se o pedido chegou antes.', pos: 'l' },
        { sel: '#fcPed', txt: 'Pedido / OC do cliente (opcional).', pos: 't' },
        { sel: '#fcVal', txt: 'Valor fechado sem IPI. Se for diferente do proposto, venda, impostos e comissões acompanham; o custo não muda.', pos: 'r' },
        { sel: '#fcPrev', txt: 'Prévia: como a margem muda com o valor fechado (desconto ou acréscimo).', pos: 'l' },
        { sel: '.modal label.chk', txt: 'Baixar a planilha do fechamento em Excel ao confirmar.', pos: 'l' },
        { sel: '#fcOk', txt: 'Dar baixa: grava a fotografia e muda a proposta para ganha.', pos: 'b' },
      ],
      depois: async (p, h) => { await p.uncheck('#fcXls'); await h.clicar('#fcOk', 1400); } },

    { id: '14-02', nome: 'margens-avisar-areas', titulo: 'Janela Avisar Financeiro e Engenharia (abre logo após a baixa)', clip: '.modal .card', pad: 8,
      prep: async (p, h) => { await p.waitForSelector('#emAss'); await h.esperar(300); },
      marcas: [
        { sel: '.modal label.chk', txt: 'Áreas que recebem o aviso. Os e-mails vêm de Configurações → Responsáveis, e-mails e logo.', pos: 'l' },
        { sel: '#emAss', txt: 'Assunto e mensagem já vêm escritos com número, cliente, valor e margem fechada. Edite se quiser.', pos: 'l' },
        { sel: '#emMail', txt: 'Abrir no meu e-mail: abre o programa de e-mail do computador com tudo preenchido.', pos: 'b' },
        { sel: '#emXls', txt: 'Baixar a planilha do fechamento para anexar.', pos: 'b' },
        { sel: '#emCopy', txt: 'Copiar o assunto e o texto.', pos: 'b' },
        { sel: '#emSo', txt: 'Só marcar como avisado: registra as etapas sem enviar e-mail pelo app.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('#emSo', 900); } },

    { id: '14-03', nome: 'margens-custo-real-topo', titulo: 'Tela Custo real de uma proposta fechada (topo)',
      prep: async (p, h) => { await h.topo(); await h.esperar(300); },
      marcas: [
        { sel: '[data-mgback]', txt: 'Volta ao painel de Margens.', pos: 'r' },
        { sel: '.sumbar', txt: 'Custo previsto, realizado, diferença e quanto das linhas já foi conferido.', pos: 'r' },
        { sel: '.banner.ok', txt: 'Aparece logo depois da baixa: explica como conferir o custo real.', pos: 'b' },
        { sel: '#app .kpis .kpi.lead', txt: 'Margem com o custo real. Este quadro aparece só para quem vê preço e margem.', pos: 'l' },
        { sel: 'label[for="mgNf"]', txt: 'Ler NF ou pedido: lê o documento e sugere em que linha lançar cada item.', pos: 'b' },
        { sel: '[data-mgconcl]', txt: 'Fabricação concluída → enviar ao Financeiro.', pos: 'b' },
        { sel: '[data-mgreopen]', txt: 'Desfazer baixa (pede confirmação). Apaga a baixa e o custo real lançado.', pos: 'b' },
      ] },

    { id: '14-04', nome: 'margens-custo-real-item', titulo: 'Conferência do custo real de um item, linha a linha', clip: '[id="cr_ITEM 03"]', pad: 8,
      prep: async (p, h) => {
        const it = '[id="cr_ITEM 03"]';
        const inp = await p.$(`${it} input[data-real] >> nth=1`);
        const v = lerNum(await inp.inputValue());
        await inp.fill((Math.round(v * 1.12 * 100) / 100).toFixed(2).replace('.', ','));
        await inp.press('Tab'); await h.esperar(800);
      },
      marcas: [
        { sel: '[id="cr_ITEM 03"] .kpis', txt: 'Resumo do item: custo previsto, realizado, diferença e linhas conferidas.', pos: 'l' },
        { sel: '[id="cr_ITEM 03"] input[data-real]', txt: 'Realizado (R$): vem com o valor previsto. Digite o valor real quando for diferente e saia do campo.', pos: 'b' },
        { sel: '[id="cr_ITEM 03"] [data-rok]', txt: '"✓ igual": confirma que a linha custou o previsto (o selo passa a "✓ conferido").', pos: 't' },
        { sel: '[id="cr_ITEM 03"] .pill.warn', txt: '"alterado": o valor lançado é diferente do previsto; a diferença fica em vermelho quando o custo sobe.', pos: 'b' },
        { sel: '[id="cr_ITEM 03"] input[data-robs]', txt: 'Observação da linha (NF, OS, fornecedor).', pos: 't' },
        { sel: '[id="cr_ITEM 03"] [data-rokall]', txt: 'Conferir de uma vez as linhas restantes como iguais ao previsto.', pos: 'b' },
        { sel: '[id="cr_ITEM 03"] [data-rexadd]', txt: '+ Custo não previsto: retrabalho, frete extra, peça trocada…', pos: 'b' },
      ] },

    { id: '14-05', nome: 'margens-painel', titulo: 'Menu Margens: filtros, indicadores e gráficos', alto: 1150,
      prep: async (p, h) => {
        // uma linha grande do item 1 custou 15% a mais que o previsto
        const inp = await p.$('[id="cr_ITEM 01"] input[data-real] >> nth=0');
        const v = lerNum(await inp.inputValue());
        await inp.fill((Math.round(v * 1.15 * 100) / 100).toFixed(2).replace('.', ','));
        await inp.press('Tab'); await h.esperar(800);
        await h.topo(); await h.clicar('[data-mgback]', 600); await h.topo();
      },
      marcas: [
        { sel: '#mgPer', txt: 'Período: últimos 12 meses, este ano ou tudo.', pos: 'b' },
        { sel: '#mgDiv', txt: 'Divisão: SEQ e SPV, só SEQ ou só SPV.', pos: 'b' },
        { sel: '[data-mgtab="fechadas"]', txt: 'Abas: Painel, Ganhas, Em andamento e Aprovações.', pos: 'tl' },
        { sel: '#app .kpis > .kpi:nth-child(3)', txt: 'Margem realizada das fechadas com custo real, comparada com a prevista.', pos: 't' },
        { sel: '#app .kpis > .kpi:nth-child(4)', txt: 'Abaixo do mínimo: propostas em aberto com margem menor que a margem mínima.', pos: 'b' },
        { sel: '#app [data-mgopen]', txt: 'Custo real a lançar: fechadas com linhas ainda sem custo real.', pos: 'l' },
        { sel: 'section.card:has(svg[aria-label="margem prevista e realizada"]) h2', txt: 'Previsto × realizado por pacote; passe o mouse nas barras para ver os valores.', pos: 't' },
      ] },

    { id: '14-06', nome: 'margens-fechadas', titulo: 'Aba Ganhas', clip: 'section.card:has(thead)', pad: 8,
      prep: async (p, h) => { await h.clicar('[data-mgtab="fechadas"]', 500); },
      marcas: [
        { sel: 'section.card:has(thead) tbody td:nth-child(1)', txt: 'Data da baixa e pedido do cliente.', pos: 'b' },
        { sel: 'section.card:has(thead) tbody td:nth-child(4)', txt: 'Margem fechada (com o valor fechado).', pos: 'b' },
        { sel: 'section.card:has(thead) tbody td:nth-child(5)', txt: 'Margem realizada: verde se ficou igual ou acima da fechada, vermelha se caiu.', pos: 'b' },
        { sel: 'section.card:has(thead) tbody td:nth-child(6)', txt: 'Custo apontado: % das linhas com custo real.', pos: 'b' },
        { sel: 'section.card:has(thead) button[data-mgopen]', txt: 'Custo real: abre a conferência linha a linha.', pos: 'b' },
        { sel: 'section.card:has(thead) [data-mgxls]', txt: 'Excel do fechamento.', pos: 'b' },
      ] },

    { id: '14-07', nome: 'margens-em-aberto', titulo: 'Aba Em andamento', clip: 'section.card:has(thead)', pad: 8,
      prep: async (p, h) => { await h.clicar('[data-mgtab="abertas"]', 500); },
      marcas: [
        { sel: 'section.card:has(thead) tbody td:nth-child(4)', txt: 'Margem da proposta; fica vermelha, com o selo "abaixo do mínimo", quando não atinge a margem mínima.', pos: 'b' },
        { sel: 'section.card:has(thead) [data-hopen]', txt: 'Abrir a proposta.', pos: 'b' },
        { sel: 'section.card:has(thead) [data-mgclose]', txt: 'Dar baixa direto daqui.', pos: 'b' },
      ] },

    { id: '14-08', nome: 'margens-painel-inicio', titulo: 'Painel da tela Início com "Como cada número é calculado" aberto', clip: '#painel', pad: 8,
      prep: async (p, h) => {
        await h.nav('inicio');
        await p.evaluate(() => { const d = document.querySelector('#painel details'); if (d) d.open = true; });
        await h.esperar(300);
      },
      marcas: [
        { sel: '[data-pnl="per"]', txt: 'Período: 30, 90 dias, 12 meses ou todo o período (data de criação da proposta).', pos: 'tr' },
        { sel: '[data-pnl="div"]', txt: 'Divisão: SEQ e SPV, só SEQ ou só SPV.', pos: 't' },
        { sel: '.pnlbar[data-pnletapa="ganha"]', txt: 'Propostas por etapa. Clique numa barra para filtrar a lista de propostas abaixo.', pos: 'l' },
        { sel: '#painel .kpis > .kpi:nth-child(3)', txt: 'Margem média ponderada (sobre a receita líquida).', pos: 't' },
        { sel: '#painel .kpis > .kpi:nth-child(8)', txt: 'Margem prevista × realizada das obras com custo real lançado.', pos: 'r' },
        { sel: '#painel .pnlform', txt: 'Como cada número é calculado: as fórmulas, na própria tela.', pos: 'l' },
      ] },

    { id: '14-09', nome: 'margens-chips-lista', titulo: 'Chips de filtro da lista de propostas (tela Início)', clip: '.home section.card:has(.hchips)', pad: 8,
      prep: async (p, h) => { await h.clicar('[data-hdiv="todas"]', 400); },
      marcas: [
        { sel: '[data-hdiv="aberto"]', txt: 'Em aberto: ainda não enviadas.', pos: 't' },
        { sel: '[data-hdiv="ganha"]', txt: 'Ganhas: com baixa (inclui as encerradas).', pos: 't' },
        { sel: '[data-hdiv="pend_real"]', txt: 'Falta custo real: ganhas com baixa e linhas ainda sem custo real.', pos: 't' },
        { sel: '[data-hdiv="perdida"]', txt: 'Perdidas.', pos: 't' },
        { sel: '.home tbody tr.click td:nth-child(4) .pill', txt: 'Situação da proposta.', pos: 'r' },
        { sel: '.home [data-hnext]', txt: 'Próximo passo da proposta (muda conforme a situação).', pos: 't' },
        { sel: '.home [data-hperdida]', txt: 'Perdida: marca a proposta como perdida, com o motivo.', pos: 'b' },
        { sel: '.home .etapas', txt: 'Etapas da proposta: formação, envio, baixa, avisos, custo real e encerramento.', pos: 'l' },
      ] },

    { id: '14-10', nome: 'margens-perdida', titulo: 'Janela Proposta perdida', clip: '.modal .card', pad: 8,
      prep: async (p, h) => { await h.clicar('.home [data-hperdida]', 500); await p.fill('#pdMot', 'preço: concorrente fechou abaixo'); },
      marcas: [
        { sel: '#pdMot', txt: 'Motivo (obrigatório): fica no histórico e ajuda a entender as perdas.', pos: 'tr' },
        { sel: '#pdOk2', txt: 'Marcar como perdida.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('.modal [data-close]', 300); } },
  ],

  conteudo: [
    { t: 'p', x: 'Este capítulo mostra onde acompanhar as margens das propostas: o **Painel** da tela Início, os chips de filtro da lista de propostas e o menu **Margens**. Também explica como registrar o resultado de uma proposta (baixa de ganha ou marcação de perdida), avisar o Financeiro e a Engenharia e lançar o custo real para comparar o previsto com o realizado.' },
    { t: 'aviso', x: 'As telas deste capítulo foram capturadas no modo local, com a proposta de exemplo (SEQ Cocamar). No modo local não há login nem controle de acesso: quem abre o arquivo faz tudo, inclusive dar e desfazer baixas. No modo compartilhado, o que cada pessoa vê e pode fazer depende do papel (Leitor, Contribuidor, Editor, dono) e das áreas definidas em Configurações. Esconder um botão não é segurança: as regras valem no banco compartilhado (ver capítulo 16).' },

    { t: 'h', x: 'Como a margem é calculada' },
    { t: 'p', x: 'O LS Pricer trabalha com a **margem líquida**. O IPI é cobrado por fora e não entra na margem. A porcentagem é calculada sobre a **receita líquida** (venda sem IPI menos impostos), e não sobre o preço de venda. O próprio painel da tela Início diz isso: "Σ margem líquida (R$) ÷ Σ (venda sem IPI − impostos), a mesma base da margem de cada proposta".' },
    { t: 'tab', cab: ['Termo', 'Como o app calcula'], lin: [
      ['Venda sem IPI', 'Preço de venda com impostos, sem o IPI.'],
      ['Receita líquida', 'Venda sem IPI − impostos (ICMS, PIS/COFINS, IR/CSLL).'],
      ['Margem líquida (R$)', 'Venda sem IPI − impostos − comissão − custo.'],
      ['Margem líquida (%)', 'Margem líquida (R$) ÷ receita líquida.'],
      ['Margem fechada', 'A mesma conta com o valor fechado na baixa: venda, impostos e comissões acompanham o valor fechado; o custo fica como estava na formação.'],
      ['Margem realizada', 'A mesma conta com o custo real lançado. Linhas sem custo real contam pelo previsto.'],
    ] },
    { t: 'p', x: 'A **margem mínima** é um parâmetro do cadastro: em **Cadastros → Precificação → Margens e política**, cartão **Formação do preço**, campo **Margem mínima** (na planilha, PARÂMETROS C34: "Margem mínima — abaixo disso o item fica em vermelho"; no cadastro padrão, 30%). Quando a margem de uma proposta SEQ fica abaixo dela, a proposta mostra o alerta "Margem … abaixo do mínimo de …" com o botão **Ajustar à margem mínima**, e o menu Margens conta a proposta em **Abaixo do mínimo**. Nas propostas SPV, a referência é o lucro mínimo do serviço.' },
    { t: 'nota', x: 'Nos gráficos do menu Margens, a linha "mínimo" só aparece com um filtro de divisão escolhido: em **Só SEQ** ela usa a margem mínima gravada nas propostas; em **Só SPV** o app desenha a linha fixa em 40%. Com **SEQ e SPV** não há linha de mínimo.' },
    { t: 'aviso', x: 'Os cartões **Em andamento**, **Ganhas** e **Margem realizada** do menu Margens, e os gráficos **Margem por divisão**, **Margem por família** e **Margem por item / linha**, dividem a margem pela venda sem IPI, e não pela receita líquida. Por isso mostram uma porcentagem menor que a da própria proposta. Na captura, a mesma proposta aparece com 33,2% na aba Em aberto e com 29,4% no cartão Em aberto. Para decisões, use a margem da proposta, a da tabela Ganhas ou a do painel da tela Início, que usam a receita líquida.' },

    { t: 'h', x: 'Painel da tela Início' },
    { t: 'p', x: 'O painel fica na tela Início, acima da lista de propostas. Ele resume as propostas **criadas no período** escolhido e pode ser recolhido clicando no título **Painel**. Cada proposta aparece numa só etapa: perdida; ganha (status ganha ou baixa registrada); em aprovação; enviada ao cliente; ou em elaboração.' },
    { t: 'fig', id: '14-08' },
    { t: 'tab', cab: ['Indicador', 'Como é calculado (texto do app)'], lin: [
      ['Valor das propostas', 'Soma do total salvo (com IPI) das propostas criadas no período.'],
      ['Conversão', 'Ganhas ÷ (ganhas + perdidas), só das propostas do período.'],
      ['Margem média ponderada', 'Σ margem líquida (R$) ÷ Σ (venda sem IPI − impostos). Propostas grandes pesam mais.'],
      ['Prazo médio de elaboração', 'Média de (data de "enviada ao cliente" − data de criação), em dias corridos.'],
      ['Tempo de aprovação', 'Média de (última decisão válida − data do pedido).'],
      ['Do envio à baixa', 'Média de (data da baixa − data do envio).'],
      ['Descontos pedidos', 'Pedidos de aprovação do período; desconto médio = média de (1 − valor target ÷ valor da proposta no pedido).'],
      ['Margem prevista × realizada', 'Obras com custo real lançado: Σ margem ÷ Σ receita líquida, com o custo previsto na baixa e com o custo real. Fica vermelha quando a realizada cai.'],
      ['Pendências em acompanhamento', 'Todas as propostas, sem filtro de período. Vencida = aberta com prazo antes de hoje. O link **abrir** leva à tela Pendências.'],
    ] },
    { t: 'tut', titulo: 'Consultar o painel da tela Início', objetivo: 'Ver, num período e numa divisão, quantas propostas estão em cada etapa, a conversão, a margem e os prazos.', quem: 'Qualquer usuário que abre o app (no modo compartilhado, inclusive o Leitor, que consulta propostas e margens). No modo local não há controle de acesso.', pre: ['Propostas salvas. O painel conta só as propostas criadas no período escolhido.'], passos: [
      'No menu lateral, clique em **Início**.',
      { x: 'No painel, escolha o período (**Últimos 30 dias**, **Últimos 90 dias**, **Últimos 12 meses** ou **Todo o período**) e a divisão (**SEQ e SPV**, **Só SEQ** ou **Só SPV**).', fig: '14-08' },
      'Leia as barras por etapa e os indicadores. Para ver as propostas de uma etapa, clique na barra: a lista de propostas abaixo é filtrada.',
      'Para conferir uma conta, clique em **Como cada número é calculado**.',
    ], resultado: 'O título do painel mostra quantas propostas há no período e o valor total. Os indicadores sem dados aparecem com "—" e uma explicação (por exemplo, "nenhuma enviada no período").', atencao: 'O filtro de período usa a data de criação da proposta. Propostas anteriores à REV22 usam a data da última gravação. Os filtros do painel não mudam a lista de propostas; só o clique numa barra muda.', dica: 'Para ver os números de uma só divisão também na lista, combine o filtro do painel com o chip **SEQ** ou **SPV** da lista de propostas.' },
    { t: 'nv', x: 'No modo compartilhado, o painel calcula a partir das últimas 300 propostas carregadas do banco (REV22, limitações). Não foi possível conferir esse limite nas capturas, que são do modo local.' },

    { t: 'h', x: 'Chips de filtro da lista de propostas' },
    { t: 'p', x: 'A lista **Propostas** da tela Início tem chips de filtro. Só um chip fica ativo por vez. O título mostra quantas propostas foram encontradas, e a busca do topo da tela continua valendo junto com o chip.' },
    { t: 'fig', id: '14-09' },
    { t: 'tab', cab: ['Chip', 'O que mostra'], lin: [
      ['Todas', 'Todas as propostas salvas (a lista mostra até 60).'],
      ['SEQ / SPV', 'Só a divisão escolhida.'],
      ['Em aberto', 'Fase Em aberto: ainda não enviada (inclui desconto reprovado e aprovação que perdeu a validade).'],
      ['Em aprovação', 'Pedido de aprovação esperando decisão ou aprovado e ainda não aplicado.'],
      ['Enviadas ao cliente', 'Fase Enviada ao cliente (inclui em negociação).'],
      ['Ganhas', 'Com baixa (inclui as encerradas).'],
      ['Perdidas', 'Marcadas como perdidas.'],
      ['Falta avisar financeiro', 'Com baixa e a etapa "Financeiro avisado" ainda pendente.'],
      ['Falta avisar engenharia', 'Com baixa e a etapa "Engenharia avisada" ainda pendente.'],
      ['Falta custo real', 'Ganhas com baixa e custo real ainda incompleto.'],
    ] },
    { t: 'nota', x: 'As fases da proposta são sempre as mesmas, na situação da linha, nos chips, no painel e no menu Margens: **Em aberto → Em aprovação → Enviada ao cliente → Ganha → Encerrada**, ou **Perdida**. No menu Margens, **Em andamento** reúne Em aberto, Em aprovação e Enviada ao cliente.' },

    { t: 'h', x: 'Registrar o resultado: baixa (ganha) ou perdida' },
    { t: 'p', x: 'Quando o cliente fecha o pedido, dê **baixa** na proposta. A baixa congela a formação daquele momento (custos, impostos, comissões e margem de cada item e linha), registra o valor fechado e muda a proposta para ganha. O botão **Dar baixa** aparece como próximo passo depois que a proposta é marcada como enviada ao cliente; também está na etapa **Ganha (baixa)** da linha da proposta e na aba **Em andamento** do menu Margens.' },
    { t: 'tut', titulo: 'Dar baixa numa proposta ganha', objetivo: 'Registrar a proposta como fechada, com o valor negociado, e liberar o lançamento do custo real.', quem: 'Quem salva propostas: no modo compartilhado, Contribuidor ou acima. No modo local não há controle de acesso.', pre: ['Proposta salva, com itens com preço.', 'Proposta marcada como enviada ao cliente (o próximo passo passa a ser **Dar baixa**).'], passos: [
      'Na tela Início, na linha da proposta, clique em **Dar baixa**.',
      { x: 'Confira a data do fechamento, informe o pedido/OC do cliente e o **Valor fechado sem IPI**. Se o valor for diferente do proposto, a prévia mostra a nova margem e o desconto ou acréscimo.', fig: '14-01' },
      'Escreva as observações da negociação, se houver, e deixe marcado **Baixar a planilha do fechamento (custos, margens e impostos)** se quiser o Excel.',
      'Clique em **Dar baixa**. O app mostra "Baixa registrada: …", abre a tela de custo real da proposta e, logo em seguida, a janela de aviso às áreas.',
      { x: 'Na janela **Avisar Financeiro e Engenharia**, confira os destinatários e o texto. Use **Abrir no meu e-mail** (o app pergunta depois "O e-mail foi enviado?"), **Copiar texto**, ou **Só marcar como avisado** se o aviso foi feito por outro meio. **Agora não** fecha sem marcar nada.', fig: '14-02' },
    ], resultado: 'A proposta passa a "Fechada", o próximo passo vira **Avisar áreas** (se faltar algum aviso) ou **Lançar custo real**, e a baixa aparece na aba Ganhas do menu Margens. A baixa e o valor fechado ficam no histórico (tipo "Baixa da proposta").', atencao: 'Confira o valor antes de confirmar: a baixa fica gravada com ele, e para corrigir é preciso **Reabrir** a proposta (botão na linha dela, na tela Início) e dar baixa de novo. O valor fechado precisa ser maior que zero ("Valor fechado inválido"). Uma proposta não salva não aceita baixa ("Salve a proposta antes de dar baixa.").', dica: 'Os e-mails das áreas são preenchidos uma vez em Configurações → Responsáveis, e-mails e logo (capítulo 16). As etapas "Financeiro avisado" e "Engenharia avisada" marcam sozinhas quando o envio é confirmado.' },
    { t: 'nv', x: 'O envio real de e-mail não foi validado. O botão **Enviar pelo Outlook** só aparece quando o app compartilhado tem o conector Microsoft 365 disponível; nas capturas (modo local) ele fica oculto. **Abrir no meu e-mail** depende do programa de e-mail do computador. A geração do Excel (planilhas Reunião, Base, Memorial e, com custo real, Custo real) foi conferida no código, mas não nas capturas: o gerador é carregado da internet, bloqueada no ambiente de captura.' },
    { t: 'tut', titulo: 'Marcar uma proposta como perdida', objetivo: 'Registrar que o cliente não fechou, com o motivo, para a conversão e a análise de perdas.', quem: 'Quem salva propostas: no modo compartilhado, Contribuidor ou acima. No modo local não há controle de acesso.', pre: ['Proposta salva, sem baixa (o link **perdida** não aparece nas fechadas).'], passos: [
      'Na tela Início, na linha da proposta, clique no link **perdida**.',
      { x: 'Escreva o motivo (preço, prazo, concorrente, projeto cancelado…) e clique em **Marcar como perdida**.', fig: '14-10' },
    ], resultado: 'A situação passa a "Perdida", o próximo passo vira **Reabrir** e a proposta entra na conversão do painel como decidida. O motivo fica no histórico.', atencao: 'Sem motivo o app não marca ("Escreva o motivo"). Uma proposta perdida não aceita lançamento de custo real.', dica: 'Se o cliente voltar atrás, use **Reabrir**: a proposta volta para "Enviada ao cliente".' },

    { t: 'h', x: 'Menu Margens' },
    { t: 'p', x: 'O menu **Margens** reúne as propostas em aberto e as fechadas, com a margem prevista, a fechada e a realizada. No topo ficam os filtros de período e divisão e as abas **Painel**, **Ganhas**, **Em andamento** e **Aprovações** (pedidos de aprovação de desconto, tratados no capítulo sobre aprovação). Logo abaixo, os cartões de indicadores e a lista **Custo real a lançar**.' },
    { t: 'fig', id: '14-05' },
    { t: 'p', x: 'Na aba **Painel**, os gráficos mostram a margem por divisão, por família, por pacote (os 12 maiores), por item/linha e o **Previsto × realizado** das fechadas com custo real. O gráfico por família tem uma lista própria para escolher a base: abertas e fechadas, só abertas ou só fechadas.' },
    { t: 'fig', id: '14-06' },
    { t: 'fig', id: '14-07' },
    { t: 'p', x: 'Se houver propostas em aberto salvas antes do registro de margens, o painel mostra um aviso com o botão **Calcular as margens delas agora**.' },
    { t: 'nota', x: 'No modo compartilhado, quem não vê preço e margem (fora de Precificação, Financeiro e Diretoria, quando essas listas estão definidas) abre o menu Margens e vê só a lista **Custo real**, com as fechadas e o botão **Lançar custo real**, sem preço nem margem.' },
    { t: 'nv', x: 'A tela reduzida "Custo real" (sem preço nem margem) só existe no modo compartilhado e não foi capturada.' },

    { t: 'h', x: 'Custo real: previsto × realizado' },
    { t: 'p', x: 'Depois da baixa, Compras e Produção conferem o custo real de cada linha da formação. Cada linha já vem com o valor previsto. O custo real só pode ser lançado **depois da baixa e com a proposta ganha**: se a proposta não tem baixa, o app avisa "O custo real é lançado depois da baixa da proposta ganha."; se foi marcada como perdida, "O custo real é lançado só com a proposta ganha." e a tela mostra "Esta proposta não está como ganha: o custo real fica fechado para lançamento."' },
    { t: 'tut', titulo: 'Lançar o custo real de uma proposta fechada', objetivo: 'Registrar quanto cada linha realmente custou e calcular a margem realizada.', quem: 'Engenharia e Custos. No modo compartilhado, quem está nessas áreas em Configurações → Responsáveis (sem ninguém nas áreas, qualquer Editor; o dono sempre). No modo local não há controle de acesso.', pre: ['Proposta com baixa e situação ganha.'], passos: [
      'Abra a proposta pelo próximo passo **Lançar custo real** (tela Início), pela lista **Custo real a lançar** ou pelo botão **Custo real** da aba Fechadas.',
      { x: 'Confira o resumo no topo: previsto, realizado, diferença e porcentagem conferida.', fig: '14-03' },
      { x: 'Em cada item, clique em **✓ igual** quando a linha custou o previsto, ou digite o valor real no campo **Realizado (R$)** e saia do campo. Use a coluna **Observação** para NF, OS ou fornecedor.', fig: '14-04' },
      'Para o que não estava previsto, clique em **+ Custo não previsto**, escreva a descrição e o valor e clique em **Lançar**.',
      'Quando terminar as linhas de um item, use **✓ Conferir as N restantes como iguais ao previsto** para fechar o que faltou.',
      'Ao fim da fabricação, clique em **Fabricação concluída → enviar ao Financeiro** e envie o relatório pela janela de e-mail, ou clique em **Só marcar como concluída**.',
    ], resultado: 'O selo da linha passa a "✓ conferido" ou "alterado", a margem com o custo real é recalculada na hora e a proposta entra no gráfico Previsto × realizado. Cada lançamento fica no histórico (tipo "Custo real"). Depois de concluída, a execução passa a "fabricação concluída" e o Financeiro vê o relatório em Pendências para marcar como conferido.', atencao: 'Linhas não conferidas contam como iguais ao previsto: a margem realizada só é confiável com 100% conferido. **Reabrir (desfazer baixa)** desfaz a baixa e volta a proposta para Enviada ao cliente; a baixa e o custo real lançado ficam guardados numa cópia dentro da proposta.', dica: '**📎 Ler NF ou pedido** lê um PDF, XML da NF-e, Excel ou foto, sugere a linha de cada item (valor com IPI) e soma ao custo já lançado. O XML da NF-e é o formato mais seguro.' },
    { t: 'nv', x: 'A leitura de NF ou pedido depende de um serviço de leitura de documentos do app compartilhado e não foi validada nas capturas. Também não foi validado, no modo compartilhado, quem consegue gravar o custo real no banco: a matriz de permissões indica que essa regra é garantida pelo app, não pelo banco.' },
    { t: 'tut', titulo: 'Comparar o previsto com o realizado', objetivo: 'Ver se as obras fechadas estão saindo com a margem prevista.', quem: 'Quem vê preço e margem: no modo compartilhado, Precificação, Financeiro e Diretoria (ou todo Editor, se essas listas não estiverem definidas) e o dono. No modo local não há controle de acesso.', pre: ['Ao menos uma proposta fechada com custo real lançado.'], passos: [
      'No menu lateral, clique em **Margens**.',
      'Escolha o período e a divisão.',
      'Na aba **Painel**, veja o cartão **Margem realizada** e o gráfico **Previsto × realizado**; passe o mouse nas barras para ver o custo previsto e o real.',
      { x: 'Clique na aba **Ganhas** para ver, proposta por proposta, a margem fechada, a realizada e quanto do custo foi apontado.', fig: '14-06' },
      'Para o detalhe por linha, clique em **Custo real**; para a planilha, em **Excel** (ou **Relatório previsto × realizado (Excel)** na tela do custo real).',
    ], resultado: 'Na tabela Fechadas, a margem realizada aparece em verde quando ficou igual ou acima da fechada e em vermelho quando caiu mais de 0,5 ponto.', atencao: 'Compare a margem realizada com a margem fechada da mesma linha da tabela. O cartão do topo usa outra base (venda sem IPI) e mostra porcentagens menores; ver "Como a margem é calculada".' },
  ],
  glossario: [
    ['Baixa', 'Registro de que a proposta foi fechada (ganha): congela a formação, guarda o valor fechado e libera o lançamento do custo real.'],
    ['Margem líquida', 'Venda sem IPI − impostos − comissão − custo. Em porcentagem, dividida pela receita líquida.'],
    ['Receita líquida', 'Venda sem IPI menos os impostos sobre a venda.'],
    ['Margem realizada', 'Margem calculada com o custo real lançado depois da baixa.'],
    ['Custo real', 'Quanto cada linha da formação custou de fato em compras e fabricação, lançado depois da baixa.'],
  ],
};

// ---- reabrir uma proposta ganha ----
module.exports.conteudo.push(
  { t: 'tut', titulo: 'Reabrir uma proposta ganha (desfazer a baixa)', objetivo: 'Corrigir uma baixa feita por engano ou voltar uma proposta ganha para negociação.', quem: 'Editor (no modo compartilhado). No modo local não há controle de acesso.', pre: ['Proposta com baixa (fase Ganha ou Encerrada).'], passos: [
    'Na tela **Início**, na linha da proposta, clique em **Reabrir** (também está na tela de Custo real, como **Reabrir (desfazer baixa)**).',
    'Leia o aviso: a baixa é desfeita e a proposta volta para **Enviada ao cliente**. Se houver custo real lançado, a janela mostra quanto já foi conferido.',
    'Escreva o **Motivo** e clique em **Reabrir**.',
  ], resultado: 'A proposta volta para Enviada ao cliente, com o próximo passo **Dar baixa**, e sai da aba Ganhas do menu Margens. O histórico registra "Baixa desfeita (proposta reaberta)" com o motivo.', atencao: 'O custo real lançado sai das telas de Margens; ele fica guardado numa cópia dentro da proposta, mas não volta sozinho se a baixa for feita de novo.', dica: 'Propostas perdidas também têm **Reabrir** (como próximo passo da linha): elas voltam para Enviada ao cliente.' },
);
