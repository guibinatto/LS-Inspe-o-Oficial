// Capítulo 15 — Revisões e histórico
// Fluxo das capturas (uma janela só, na ordem): exemplo salvo (rev. 3) → Revisar (rev. 4, desconto de 5%)
// → enviada ao cliente (versão congelada) → alteração e Salvar (pergunta revisão ou correção → rev. 5)
// → lista e comparação → consulta da rev. 3 → restauração → histórico da proposta → histórico geral → lixeira.
const desconto = async (p, h, v) => {
  await h.aba(1); await h.abrirDetalhes(); // desconto global digitado direto: Dados gerais → Mais opções
  await p.fill('[id$="PROPOSTA_C9"]', String(v)); await p.press('[id$="PROPOSTA_C9"]', 'Tab'); await h.esperar(500);
};
module.exports = {
  n: 15, titulo: 'Revisões e histórico', slug: 'revisoes',
  inicio: async (p, h) => { await h.exemplo(); await h.salvar(); },
  capturas: [
    { id: '15-01', nome: 'revisoes-cabecalho', titulo: 'Cabeçalho da proposta: revisão atual e botão Revisar', clip: 'section.ctxh', pad: 6,
      prep: async (p, h) => { await p.click('#nav [data-view="proposta"]'); await h.esperar(300); await h.aba(1); await h.topo(); },
      marcas: [
        { sel: '.ctxh .apselo[data-revs]', txt: 'Revisão atual. Clique para ver, comparar e restaurar as revisões.', pos: 'l' },
        { sel: '.ctxh .ctx-tags [data-revisar]', txt: 'Revisar: guarda a revisão atual e abre a próxima para edição.', pos: 't' },
        { sel: '.ctxh .ctx-tags > span.pill', txt: 'Situação da proposta.', pos: 'r' },
      ] },
    { id: '15-02', nome: 'revisoes-revisar', titulo: 'Revisar a proposta: o motivo fica registrado', clip: '.modal .card', pad: 6,
      prep: async (p, h) => { await h.clicar('.ctxh .ctx-tags [data-revisar]', 400); await p.fill('#rvMot', 'cliente pediu desconto global de 5%'); },
      marcas: [
        { sel: '.modal #rvMot', txt: 'O que muda nesta revisão? (vai para o histórico e para a lista de revisões)', pos: 'l' },
        { sel: '.modal #rvOk', txt: 'Criar revisão: a atual fica guardada como está.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.clicar('.modal #rvOk', 1500); await desconto(p, h, 5); await h.salvar(); } },
    { id: '15-03', nome: 'revisoes-salvar-enviada', titulo: 'Salvar uma proposta já enviada: nova revisão ou só correção', clip: '.modal .card', pad: 6,
      prep: async (p, h) => {
        // marca como enviada ao cliente pela tela Início (congela a versão enviada) e volta a editar
        await h.nav('inicio'); await h.clicar('.home [data-etp$="|cliente"]', 900);
        await h.clicar('.home tbody tr.click [data-hopen]', 700);
        await desconto(p, h, 6); await h.clicar('#bSave', 500);
        await p.fill('#rvMot2', 'cliente pediu 6% de desconto');
      },
      marcas: [
        { sel: '.modal h2', txt: 'Aparece ao salvar alterações numa proposta enviada ao cliente ou em negociação.', pos: 'l' },
        { sel: '.modal #rvMot2', txt: 'O que muda? (opcional)', pos: 'l' },
        { sel: '.modal #rvNova', txt: 'Salvar como revisão nova: a enviada fica guardada.', pos: 'b' },
        { sel: '.modal #rvMesma', txt: 'É só correção: grava por cima, na mesma revisão.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('.modal #rvNova', 1500); } },
    { id: '15-04', nome: 'revisoes-lista', titulo: 'Lista de revisões: ver, restaurar, comparar', clip: '.modal .card', pad: 6, alto: 1000,
      prep: async (p, h) => { await h.topo(); await h.clicar('.ctxh .apselo[data-revs]', 700); },
      marcas: [
        { sel: '.modal tbody tr.tot', txt: 'Revisão atual (a que se edita).', pos: 'l' },
        { sel: '.modal tbody .pill.warn', txt: 'Versão enviada ao cliente, congelada automaticamente.', pos: 'r' },
        { sel: '.modal [data-revver]', txt: 'Ver: abre só para consulta.', pos: 't' },
        { sel: '.modal [data-revrest]', txt: 'Restaurar: traz de volta como a próxima revisão.', pos: 'r' },
        { sel: '.modal #rcA', txt: 'Comparar esta versão…', pos: 'l' },
        { sel: '.modal #rcB', txt: '…com esta (por padrão, a atual).', pos: 't' },
        { sel: '.modal [data-revcmp]', txt: 'Comparar.', pos: 'r' },
        { sel: '.modal [data-revisar]', txt: 'Revisar (criar a próxima revisão).', pos: 'l' },
      ] },
    { id: '15-05', nome: 'revisoes-comparar', titulo: 'Comparação entre a revisão 3 e a atual', clip: '.modal .card', pad: 6, alto: 1000,
      prep: async (p, h) => {
        const v = await p.$$eval('#rcA option', (o) => o[o.length - 1].value); await p.selectOption('#rcA', v);
        await h.clicar('.modal [data-revcmp]', 600);
      },
      marcas: [
        { sel: '.modal table.t', txt: 'Total, custo, impostos e margem lado a lado, com a diferença.', pos: 'l' },
        { sel: '.modal .banner', txt: 'Se a mudança exige nova aprovação, e por quê.', pos: 'l' },
        { sel: '.modal h3', txt: 'Itens incluídos, retirados e alterados.', pos: 'l' },
        { sel: '.modal h3', nth: 1, txt: 'Campos alterados (de → para).', pos: 'l' },
        { sel: '.modal [data-revs]', txt: '← Revisões: volta à lista.', pos: 'l' },
      ] },
    { id: '15-06', nome: 'revisoes-consulta', titulo: 'Consultando uma revisão anterior (só leitura)',
      prep: async (p, h) => {
        await h.clicar('.modal [data-revs]', 600);
        const n = (await p.$$('.modal [data-revver]')).length; await p.click(`.modal [data-revver] >> nth=${n - 1}`); await h.esperar(900); await h.topo();
      },
      marcas: [
        { sel: '#app .banner.warn span', txt: 'Consultando a revisão: só leitura, nada aqui é salvo.', pos: 'r' },
        { sel: '#app .banner.warn [data-revatual]', txt: 'Voltar à revisão atual.', pos: 'l' },
        { sel: '.ctxh .apselo[data-revs]', txt: 'O selo mostra "Consultando rev. N".', pos: 'b' },
        { sel: '#saveSt', txt: 'O indicador de gravação também avisa a consulta.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('#app .banner.warn [data-revatual]', 800); } },
    { id: '15-07', nome: 'revisoes-historico-proposta', titulo: 'Aba Histórico da proposta: registro de tudo o que aconteceu com ela', clip: '#app section.card', clipNth: 2, pad: 8, alto: 1200,
      prep: async (p, h) => {
        // restaura a revisão 3 (a confirmação é aceita) para que o registro mostre a restauração
        await h.topo(); await h.clicar('.ctxh .apselo[data-revs]', 700);
        const n = (await p.$$('.modal [data-revrest]')).length; await p.click(`.modal [data-revrest] >> nth=${n - 1}`); await h.esperar(1500);
        await h.aba('phist'); await h.topo();
      },
      marcas: [
        { sel: '#app section.card:nth-of-type(3) h2', txt: 'Registro: eventos desta proposta, do mais recente para o mais antigo.', pos: 'l' },
        { sel: '#app .hlist .hrow .hmeta', txt: 'Quando e quem.', pos: 'l' },
        { sel: '#app .hlist .hrow .pill', txt: 'Tipo do evento (revisão, salva, status, aprovação, conferência…).', pos: 't' },
        { sel: '#app .hlist .hrow table.mini', txt: 'O que mudou: de → para.', pos: 'r' },
      ] },
    { id: '15-08', nome: 'revisoes-historico-geral', titulo: 'Configurações → Histórico: todas as alterações, com filtro e busca', clip: '#app section.card', pad: 8, alto: 1100,
      prep: async (p, h) => { await h.nav('config'); await h.cad('historico'); await p.selectOption('#histT', 'propostas'); await h.esperar(300); await p.fill('#histQ', 'revisão'); await p.press('#histQ', 'Tab'); await h.esperar(500); await h.topo(); },
      marcas: [
        { sel: '#histT', txt: 'Tipo: tudo, propostas e alertas, baixas e custo real, documentos, pedidos, cadastro, acessos.', pos: 'l' },
        { sel: '#histQ', txt: 'Busca no tipo, descrição, referência e campos alterados.', pos: 't' },
        { sel: '#app .sheetbar > span.sub', txt: 'Neste navegador: alterações feitas aqui. No compartilhado: últimos 90 dias de toda a equipe.', pos: 't' },
        { sel: '#app .hlist .hrow table.mini', txt: 'Campos alterados: de → para.', pos: 'r' },
      ] },
    { id: '15-09', nome: 'revisoes-excluir', titulo: 'Abrir → Propostas salvas: Excluir manda para a lixeira', clip: '.modal .card', pad: 6,
      prep: async (p, h) => { await h.clicar('#bOpen', 500); await h.clicar('.modal [data-del]', 300); },
      marcas: [
        { sel: '.modal #mQ', txt: 'Buscar por número ou cliente.', pos: 'l' },
        { sel: '.modal [data-open]', txt: 'Abrir a proposta.', pos: 'b' },
        { sel: '.modal [data-del]', txt: 'Excluir: o primeiro clique vira "Confirmar"; o segundo manda para a lixeira.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.clicar('.modal [data-del]', 700); await h.esc(); } },
    { id: '15-10', nome: 'revisoes-lixeira', titulo: 'Configurações → Backup e restauração → Lixeira', clip: '#app section.card', clipNth: 2, pad: 8,
      prep: async (p, h) => { await h.nav('config'); await h.cad('backup'); },
      marcas: [
        { sel: '#app section.card:nth-of-type(3) h2', txt: 'Lixeira: propostas excluídas.', pos: 'l' },
        { sel: '#app [data-lxrest]', txt: 'Restaurar: a proposta volta para a lista.', pos: 'b' },
        { sel: '#app [data-lxdel]', txt: 'Apagar de vez (só o administrador; não dá para desfazer).', pos: 'r' },
      ],
      depois: async (p, h) => { await h.clicar('#app [data-lxrest]', 700); } },
  ],
  conteudo: [
    { t: 'p', x: 'Cada proposta tem uma **revisão atual**, que é a que se edita. As revisões anteriores ficam guardadas exatamente como estavam e podem ser consultadas, comparadas e restauradas. Além disso, tudo o que acontece fica no **histórico**: o da proposta (aba Histórico) e o geral (Configurações → Histórico).' },
    { t: 'tab', cab: ['Quando', 'O que o app guarda'], lin: [
      ['Você clica em **Revisar**', 'A revisão atual, como está salva (alterações pendentes são salvas antes). Você passa a editar a próxima.'],
      ['Você salva alterações numa proposta **enviada ao cliente** ou **em negociação**', 'Pergunta se é revisão nova (a enviada fica guardada) ou só correção (grava por cima).'],
      ['A proposta é marcada como **Enviada ao cliente**', 'Uma cópia congelada: "versão enviada ao cliente · congelada".'],
      ['Diretoria e Financeiro **aprovam** o desconto', 'Uma cópia congelada: "versão aprovada · congelada".'],
      ['Você **restaura** uma revisão', 'A atual vai para a lista e a escolhida volta como a próxima revisão.'],
      ['Duas pessoas salvam ao mesmo tempo', 'Na escolha "Guardar a versão dela como revisão e salvar a minha", a versão da outra pessoa vai para a lista ("cópia guardada num conflito de edição simultânea").'],
    ] },
    { t: 'nv', x: 'O conflito de edição simultânea e os nomes de quem salvou cada revisão dependem do modo compartilhado e não foram exercitados nas capturas. No modo local, a coluna de quem guardou mostra "neste navegador".' },

    { t: 'h', x: 'Revisar a proposta' },
    { t: 'fig', id: '15-01' },
    { t: 'tut', titulo: 'Criar uma nova revisão', objetivo: 'Mudar a proposta (por exemplo, a pedido do cliente) sem perder a versão anterior.',
      quem: 'Quem edita a proposta (no modo compartilhado, Contribuidor ou acima). No modo local não há controle de acesso.',
      pre: ['Proposta aberta na revisão atual (não numa revisão em consulta: aí o app avisa "Volte à revisão atual para revisar").'],
      passos: [
        'Com a proposta aberta, clique em **Revisar**, ao lado do selo **Rev. N** no topo. O mesmo botão existe na aba **Documentos** (quadro Revisões, **Revisar (nova revisão)**), na aba **Histórico**, na lista de revisões e na tela **Início**, na linha da proposta (abre a proposta já nesta janela).',
        { x: 'Em **O que muda nesta revisão?**, descreva o motivo e clique em **Criar revisão N+1**.', fig: '15-02' },
        'Faça as alterações e clique em **Salvar**.',
      ],
      resultado: 'O aviso "Revisão N+1 criada. A revisão N está guardada." aparece, o selo passa a mostrar a nova revisão, a proposta volta a **Em aberto** e a edição recomeça em Dados gerais. O histórico registra "Proposta — revisão".',
      atencao: 'A nova revisão volta para Em aberto: a conferência do PDF da revisão anterior não vale para ela ("conferência desatualizada") e o PDF precisa ser conferido de novo antes de enviar.',
      dica: 'Use o motivo para dizer o que o cliente pediu. Ele aparece na lista de revisões ("na rev. N+1: …").' },

    { t: 'h', x: 'Salvar uma proposta já enviada' },
    { t: 'p', x: 'Se a proposta está como enviada ao cliente (ou em negociação) e você altera e clica em **Salvar**, o app não grava direto: ele pergunta o que fazer, para não perder o que o cliente recebeu.' },
    { t: 'fig', id: '15-03' },
    { t: 'tut', titulo: 'Salvar alterações numa proposta enviada', objetivo: 'Decidir entre revisão nova e correção ao salvar uma proposta já enviada.',
      quem: 'Quem edita a proposta. No modo local não há controle de acesso.',
      pre: ['Proposta marcada como enviada ao cliente (na tela Início, etapa **Enviada ao cliente** ou botão **Enviar ao cliente**).'],
      passos: [
        'Altere a proposta e clique em **Salvar**.',
        'Na janela **Esta revisão já foi enviada ao cliente**, escreva em **O que muda?** (opcional).',
        'Clique em **Salvar como revisão N+1** (o certo quando o cliente vai receber outra versão) ou em **É só correção: salvar na revisão N** (por exemplo, um erro de digitação que não muda o que foi enviado).',
      ],
      resultado: 'Com revisão nova: "Salvo como revisão N+1", a enviada fica guardada e a proposta volta a Em aberto. Com correção: a revisão N é gravada por cima, sem nova entrada na lista.',
      atencao: '**Cancelar** não salva nada: as alterações continuam na tela, ainda não gravadas.' },

    { t: 'h', x: 'Lista de revisões, consulta e restauração' },
    { t: 'p', x: 'Clique no selo **Rev. N ▾** no topo da proposta (ou em **Ver e comparar revisões** na aba Documentos, ou **Ver, comparar e restaurar revisões** na aba Histórico). A lista mostra a revisão atual e as guardadas, com data, total (e a diferença para a atual), margem, situação na época e o motivo da revisão seguinte. As versões enviada ao cliente e aprovada aparecem com o selo de congeladas.' },
    { t: 'fig', id: '15-04' },
    { t: 'fig', id: '15-06' },
    { t: 'tut', titulo: 'Consultar e restaurar uma revisão anterior', objetivo: 'Ver como era uma revisão anterior e, se for o caso, voltar a ela.',
      quem: 'Consultar: qualquer pessoa com acesso. Restaurar: quem edita a proposta. No modo local não há controle de acesso.',
      pre: ['Proposta salva com pelo menos uma revisão guardada.'],
      passos: [
        'Clique no selo **Rev. N ▾** no topo da proposta.',
        'Na linha da revisão, clique em **Ver**. A proposta abre em consulta, com a faixa "Consultando a revisão N … Só leitura: nada aqui é salvo." Se houver alterações não salvas, o app pergunta antes de abrir.',
        'Para sair, clique em **Voltar à revisão atual**.',
        'Para trazer a revisão de volta, abra a lista e clique em **Restaurar** na linha dela. Confirme a pergunta "Restaurar a revisão N? A revisão M atual fica guardada e a N volta como revisão M+1."',
      ],
      resultado: 'Na consulta, nada é gravado (Salvar avisa "Você está consultando a revisão N. Volte à atual ou restaure esta como nova revisão."). Na restauração, o aviso "Revisão N restaurada como revisão M+1" aparece e o histórico registra a restauração.',
      atencao: 'Restaurar não apaga nada: a atual também vai para a lista. Mas a proposta passa a ter o conteúdo da revisão restaurada (valores, itens e condições).' },

    { t: 'h', x: 'Comparar revisões' },
    { t: 'fig', id: '15-05' },
    { t: 'tut', titulo: 'Comparar duas revisões', objetivo: 'Ver o que mudou entre duas versões e se a mudança exige nova aprovação.',
      quem: 'Qualquer pessoa com acesso à proposta. No modo local não há controle de acesso.',
      pre: ['Pelo menos uma revisão guardada.'],
      passos: [
        'Abra a lista de revisões (selo **Rev. N ▾**).',
        'Em **Comparar**, escolha uma versão e, em **com**, a outra (por padrão, a atual).',
        'Clique em **Comparar**.',
      ],
      resultado: 'A janela **Comparação** mostra total, custo, impostos e margem lado a lado com a diferença; a faixa com "Precisa de nova aprovação: …", "A aprovação existente continua valendo para esta versão…" ou "Nada nesta comparação exige aprovação."; os itens incluídos, retirados e alterados; e os campos alterados (de → para).',
      atencao: 'Escolher a mesma versão nos dois lados não compara: aparece "Escolha duas versões diferentes".' },

    { t: 'h', x: 'Histórico da proposta e histórico geral' },
    { t: 'p', x: 'A aba **Histórico** da proposta (SEQ, SPV e FACTS) reúne a situação e as etapas, o quadro **Revisões** e o **Registro** com os eventos daquela proposta: criação e gravações, revisões, conferência do PDF, status, aprovação, alertas e pendências.' },
    { t: 'fig', id: '15-07' },
    { t: 'p', x: 'Em **Configurações** → **Histórico** fica o histórico geral de alterações: propostas, cadastro, documentos, pedidos, baixas e acessos. Cada linha mostra quando, quem, o tipo, a descrição e os campos alterados (até 12; o resto aparece como "+ N alterações").' },
    { t: 'fig', id: '15-08' },
    { t: 'tut', titulo: 'Encontrar uma alteração no histórico', objetivo: 'Saber quando, quem e o que mudou.',
      quem: 'Qualquer pessoa com acesso ao app. No modo local, o histórico tem só o que foi feito neste navegador.',
      pre: ['Nenhum.'],
      passos: [
        'Para uma proposta: abra a proposta e clique na aba **Histórico**; leia o **Registro**.',
        'Para tudo: clique em **Configurações** no menu lateral; a tela abre em **Histórico**.',
        'Escolha o tipo (**Tudo**, **Propostas e alertas**, **Baixas e custo real**, **Documentos**, **Pedidos de cadastro**, **Cadastro**, **Acessos**) e digite em **Buscar no histórico…**.',
      ],
      resultado: 'A lista mostra até 250 eventos que batem com o filtro, do mais recente para o mais antigo.',
      dica: 'Lotes de cadastro (edição em massa, importação de preços, consolidação) têm o botão **desfazer este lote** para quem cuida de Custos.' },
    { t: 'nv', x: 'No modo compartilhado, o histórico geral mostra os "Últimos 90 dias com alteração, de toda a equipe" com o nome de quem fez; não foi validado nas capturas (modo local).' },

    { t: 'h', x: 'Lixeira de propostas' },
    { t: 'p', x: 'Excluir uma proposta não apaga: ela vai para a **Lixeira**, em **Configurações** → **Backup e restauração**, e pode ser restaurada. Só o administrador apaga de vez.' },
    { t: 'fig', id: '15-09' },
    { t: 'fig', id: '15-10' },
    { t: 'tut', titulo: 'Excluir e restaurar uma proposta', objetivo: 'Tirar uma proposta da lista sem perdê-la, e trazê-la de volta se preciso.',
      quem: 'Excluir: o administrador (dono do app) ou quem criou a proposta em aberto (no modo compartilhado, com acesso de gravação). Restaurar: o administrador ou quem excluiu. Apagar de vez: só o administrador. No modo local não há controle de acesso: quem abre o arquivo é tratado como administrador.',
      pre: ['A proposta salva.'],
      passos: [
        'Clique em **Abrir** na barra superior.',
        'Na linha da proposta, clique em **Excluir** e, em seguida, em **Confirmar**.',
        'Para restaurar: clique em **Configurações** → **Backup e restauração** e, no quadro **Lixeira**, clique em **Restaurar** na linha da proposta.',
        'Para apagar de vez (administrador): clique em **Apagar de vez** e confirme.',
      ],
      resultado: 'Ao excluir, a proposta some da lista e aparece "Proposta na lixeira. …"; o histórico registra "Proposta excluída (lixeira)". Ao restaurar, aparece "Proposta restaurada" e ela volta para a lista. Apagada de vez, só volta por um backup.',
      atencao: 'A proposta excluída sai da lista, mas não é apagada: o aviso indica onde restaurar, em **Configurações** → **Backup e restauração** → **Lixeira**.',
      dica: 'Se a proposta excluída estava aberta, a tela deixa de estar ligada a ela. Depois de restaurar, abra-a de novo por **Abrir** antes de editar: salvar a tela antiga grava uma proposta nova, separada.' },
    { t: 'nv', x: 'No modo compartilhado, as regras de quem exclui, restaura e apaga são verificadas no banco, e as revisões guardadas de uma proposta apagada de vez continuam no banco. Não validado nas capturas (modo local).' },
  ],
  glossario: [
    ['Revisão atual', 'A versão da proposta que se edita; as anteriores ficam guardadas e só se consultam, comparam ou restauram.'],
    ['Versão congelada', 'Cópia automática da proposta no momento em que ela foi enviada ao cliente ou em que o desconto foi aprovado.'],
    ['Lixeira', 'Lista das propostas excluídas, em Configurações → Backup e restauração; de lá elas podem ser restauradas.'],
  ],
};
