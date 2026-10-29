// Capítulo 13 — Pendências e aprovações
// Fluxo das capturas (uma janela só, na ordem): exemplo salvo → acompanhamento → pendência atualizada → conferência
// → pedido de aprovação com valor target → Início ("com quem está") → Minhas pendências → análise e decisões
// → aplicar o valor aprovado → regra de atenção (para ter um alerta com "Seguir assim") → justificativa.
let pendId = null;
module.exports = {
  n: 13, titulo: 'Pendências e aprovações', slug: 'pendencias',
  inicio: async (p, h) => { await h.exemplo(); await h.salvar(); },
  capturas: [
    { id: '13-01', nome: 'pendencias-acompanhamento', titulo: 'Pendências → Acompanhamento: pendências automáticas geradas ao salvar a proposta', clip: '#pnAcomp', pad: 8,
      prep: async (p, h) => { await h.nav('pendencias'); await p.evaluate(() => { const c = document.getElementById('pnAcomp'); if (c) c.scrollIntoView(); }); },
      marcas: [
        { sel: '#pnAcomp [data-pnf="st"]', txt: 'Situação: abertas, vencidas, resolvidas e não se aplica, ou todas.', pos: 't' },
        { sel: '#pnAcomp [data-pnf="dep"]', txt: 'Filtro por departamento.', pos: 't' },
        { sel: '#pnAcomp [data-pnf="crit"]', txt: 'Filtro por criticidade.', pos: 't' },
        { sel: '#pnAcomp [data-pnf="q"]', txt: 'Busca por código, proposta, responsável…', pos: 't' },
        { sel: '#pnAcomp [data-pnnova]', txt: '+ Nova pendência (manual).', pos: 'r' },
        { sel: '#pnAcomp tbody tr:nth-child(1) td:nth-child(1)', txt: 'Código e origem: automática (da conferência) ou manual.', pos: 'l' },
        { sel: '#pnAcomp tbody tr:nth-child(1) td:nth-child(4)', txt: 'Prazo (fica vermelho e "vencida" quando passa) e prioridade.', pos: 'b' },
        { sel: '#pnAcomp tbody tr:nth-child(1) [data-pnabre]', txt: 'Abrir: ver e atualizar a pendência.', pos: 'r' },
      ] },
    { id: '13-02', nome: 'pendencias-detalhe', titulo: 'Pendência aberta: campos, situação e histórico', clip: '.modal .card', pad: 6, alto: 1000,
      prep: async (p, h) => {
        pendId = await p.$eval('#pnAcomp tbody tr:nth-child(1) [data-pnabre]', (x) => x.dataset.pnabre);
        await h.clicar(`[data-pnabre="${pendId}"]`, 400);
        await h.preencher('#pnResp', 'Ana (Comercial)'); await p.selectOption('#pnSt', 'andamento'); await h.preencher('#pnCom', 'aguardando a decisão da Diretoria sobre o desconto');
        await h.clicar('#pnOk', 500);
        await h.clicar(`#pnAcomp [data-pnabre="${pendId}"]`, 400);
        await p.evaluate(() => document.querySelectorAll('.modal details').forEach((d) => { d.open = true; }));
      },
      marcas: [
        { sel: '.modal #pnTit', txt: 'Pendência. Na automática, o texto vem da conferência e não se edita.', pos: 'l' },
        { sel: '.modal #pnDep', txt: 'Departamento que resolve.', pos: 'l' },
        { sel: '.modal #pnResp', txt: 'Responsável.', pos: 'l' },
        { sel: '.modal #pnPrazo', txt: 'Prazo (padrão: 2 dias impeditiva, 5 atenção, 10 informativa).', pos: 'r' },
        { sel: '.modal #pnCrit', txt: 'Criticidade (na automática, vem da conferência).', pos: 'l' },
        { sel: '.modal #pnSt', txt: 'Situação: Aberta, Em andamento, Resolvida ou Não se aplica.', pos: 'r' },
        { sel: '.modal #pnSol', txt: 'Solução ou justificativa: obrigatória para resolver ou marcar "não se aplica".', pos: 'l' },
        { sel: '.modal details summary', txt: 'Histórico: quem mudou o quê, de → para.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '13-03', nome: 'pendencias-conferencia', titulo: 'Aba Conferência: a conferência da proposta, origem das pendências automáticas', clip: '#confCentral', pad: 8,
      prep: async (p, h) => { await p.click('#nav [data-view="proposta"]'); await h.esperar(300); await h.aba(5); },
      marcas: [
        { sel: '#confCentral .kpis .kpi:nth-child(1)', txt: 'Impede seguir: vira pendência impeditiva.', pos: 't' },
        { sel: '#confCentral .kpis .kpi:nth-child(2)', txt: 'Pede tratamento ou justificativa: vira pendência de atenção.', pos: 't' },
        { sel: '#confCentral .kpis .kpi:nth-child(3)', txt: 'Informação: não vira pendência.', pos: 't' },
        { sel: '#confCentral tbody tr:nth-child(1) td:nth-child(2)', txt: 'Área (define o departamento da pendência) e a falha.', pos: 'l' },
        { sel: '#confCentral tbody tr:nth-child(1) [data-confgo]', txt: 'Ir: abre o lugar onde se corrige.', pos: 'r' },
      ] },
    { id: '13-04', nome: 'pendencias-pedir-aprovacao', titulo: 'Pedir aprovação da proposta com o valor target', clip: '.modal .card', pad: 6, alto: 1000,
      prep: async (p, h) => {
        await h.clicar('.aprovbox [data-alaprov]', 600);
        await p.fill('#apAlvo', '4.000.000,00'); await h.esperar(300);
        await p.fill('#apMot', 'Concorrente fechou por R$ 4,0 milhões; cliente estratégico.'); await h.esperar(200);
      },
      marcas: [
        { sel: '.modal .kpis .kpi:nth-child(1)', txt: 'Valor atual (com e sem IPI).', pos: 'l' },
        { sel: '.modal .kpis .kpi:nth-child(3)', txt: 'Menor preço pela margem mínima.', pos: 'r' },
        { sel: '.modal #apAlvo', txt: 'Valor target: por quanto quer fechar.', pos: 'l' },
        { sel: '.modal .seg', txt: 'O valor é com IPI ou sem IPI.', pos: 'r' },
        { sel: '.modal #apPrev', txt: 'Prévia: desconto sobre o atual e margem no target.', pos: 'l' },
        { sel: '.modal #apMot', txt: 'Justificativa (obrigatória).', pos: 'l' },
        { sel: '.modal #apOk', txt: 'Continuar para o e-mail: registra o pedido e abre o aviso por e-mail.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.clicar('.modal #apOk', 800); await h.clicar('.modal [data-close]', 400); } },
    { id: '13-05', nome: 'pendencias-inicio-com-quem', titulo: 'Tela Início: a situação mostra com quem está a aprovação', clip: '.home table.t', pad: 8,
      prep: async (p, h) => { await h.nav('inicio'); await p.evaluate(() => { const t = document.querySelector('.home table.t'); if (t) t.scrollIntoView(); }); },
      marcas: [
        { sel: '.home tbody tr.click td:nth-child(4) .pill', txt: 'Situação: "Em aprovação · com Diretoria e Financeiro" enquanto ninguém decidiu.', pos: 't' },
        { sel: '.home tbody tr.click [data-hnext]', txt: 'Próximo passo da proposta (aqui, analisar a aprovação).', pos: 't' },
        { sel: '.home [data-etp$="|aprovacao"]', txt: 'Etapa Aprovação na trilha da proposta, com quem está.', pos: 'b' },
      ] },
    { id: '13-06', nome: 'pendencias-minhas', titulo: 'Minhas pendências: aprovações esperando cada papel', clip: '#app > .stack', pad: 8, alto: 900,
      prep: async (p, h) => { await h.nav('pendencias'); await h.topo(); },
      marcas: [
        { sel: '#app .flowhead .sub', txt: 'Quantas coisas esperam por você. Neste navegador, aparecem as de todas as áreas.', pos: 'r' },
        { sel: '#app .stack > section.card:nth-of-type(1) h2', txt: 'Aprovar descontos · Diretoria.', pos: 'l' },
        { sel: '#app .stack > section.card:nth-of-type(2) h2', txt: 'Aprovar descontos · Financeiro.', pos: 'l' },
        { sel: '#app .stack > section.card:nth-of-type(1) [data-apopen]', txt: 'Analisar: abre a análise da aprovação.', pos: 'l' },
        { sel: '#pnAcomp h2', txt: 'Acompanhamento: as pendências com código, prazo e responsável.', pos: 'l' },
      ] },
    { id: '13-07', nome: 'pendencias-analise', titulo: 'Margens → Aprovações: onde está e a decisão de cada papel', clip: '#app section.card', pad: 8,
      prep: async (p, h) => { await h.clicar('#app .stack > section.card:nth-of-type(1) [data-apopen]', 600); await h.topo(); },
      marcas: [
        { sel: '#app .trilha .etp:nth-child(1)', txt: 'Trilha: pedido, Diretoria, Financeiro e valor aplicado.', pos: 'l' },
        { sel: '#app [data-apdec$="|diretoria|aprovada"]', txt: 'Aprovar (comentário opcional).', pos: 'l' },
        { sel: '#app [data-apdec$="|diretoria|reprovada"]', txt: 'Reprovar (comentário obrigatório).', pos: 'r' },
        { sel: '#app [data-apdec$="|financeiro|aprovada"]', txt: 'O Financeiro decide separado da Diretoria.', pos: 'l' },
        { sel: '#app [data-approp]', txt: 'Abrir a proposta.', pos: 'r' },
      ],
      depois: async (p, h) => {
        for (const k of ['diretoria', 'financeiro']) { await h.clicar(`#app [data-apdec$="|${k}|aprovada"]`, 300); await p.fill('#adCom', k === 'diretoria' ? 'ok pela estratégia do cliente' : 'ok, pagamento 28 DDL'); await h.clicar('#adOk', 500); }
      } },
    { id: '13-08', nome: 'pendencias-aplicar-valor', titulo: 'Aprovação concluída: aplicar o valor aprovado na proposta', clip: '#app section.card', clipNth: 1, pad: 8,
      prep: async (p, h) => { await h.clicar('#app [data-approp]', 700); await h.aba(5); },
      marcas: [
        { sel: '#app [data-apaplica]', txt: 'Aplicar o valor aprovado na proposta: ajusta o desconto global até o valor target.', pos: 'b' },
        { sel: '#app .aprovbox [data-apopen]', txt: 'ver aprovação.', pos: 'b' },
        { sel: '#app .aprovbox [data-alaprov]', txt: 'Pedir de novo, com novo valor target.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.clicar('#app [data-apaplica]', 700); await h.salvar(); } },
    { id: '13-09', nome: 'pendencias-alertas', titulo: 'Alertas por item: corrigir agora ou seguir assim', clip: '#app details.card', pad: 8,
      prep: async (p, h) => {
        // regra de atenção cadastrada pela Engenharia, só para gerar um alerta sem aprovação
        await h.nav('cadastro'); await h.cad('estruturas'); await h.cad('regras'); await h.clicar('[data-rgedit="novo"]', 300);
        await p.fill('#rgNome', 'Confirmar a pressão do ponto mais desfavorável'); await p.selectOption('#rgSev', 'aviso'); await p.selectOption('#rgSt', 'publicada');
        await h.clicar('.modal [data-rcrm="0"]', 200); await p.selectOption('#rgEf', 'aviso'); await p.fill('#rgFonte', 'decisão da Engenharia (exemplo de treino)'); await h.clicar('#rgOk', 500);
        await p.click('#nav [data-view="proposta"]'); await h.esperar(300); await h.aba(5);
        await p.evaluate(() => { const d = document.querySelector('#app details.card'); if (d) d.open = true; });
      },
      marcas: [
        { sel: '#app details.card summary', txt: 'Alertas por item, com a contagem por tipo.', pos: 'l' },
        { sel: '#app details.card li.ack', txt: 'Alerta coberto pela aprovação: sem botões.', pos: 'l' },
        { sel: '#app details.card li.warn [data-alack]', txt: 'Seguir assim: mantém, com justificativa no histórico.', pos: 'tl' },
        { sel: '#app details.card li.warn [data-goitem]', nth: 2, txt: 'abrir: vai ao item.', pos: 'b' },
      ] },
    { id: '13-10', nome: 'pendencias-seguir-assim', titulo: 'Seguir assim: a justificativa é obrigatória', clip: '.modal .card', pad: 6,
      prep: async (p, h) => { await h.clicar('#app details.card li.warn [data-alack]', 400); await p.fill('#akMot', 'pressão confirmada pelo cliente em reunião de 28/10'); },
      marcas: [
        { sel: '.modal #akMot', txt: 'Por que seguir assim? (fica no histórico)', pos: 'l' },
        { sel: '.modal #akOk', txt: 'Confirmar. Depois, salve a proposta.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.clicar('.modal #akOk', 400); } },
  ],
  conteudo: [
    { t: 'p', x: 'Este capítulo cobre o que ainda falta resolver numa proposta e quem precisa decidir. São três mecanismos que conversam entre si: a **conferência da proposta** (aba Conferência), o **acompanhamento de pendências** (menu Pendências) e a **aprovação de desconto com valor target** (Diretoria e Financeiro).' },
    { t: 'tab', cab: ['Mecanismo', 'Onde', 'O que faz'], lin: [
      ['Conferência da proposta', 'Proposta → aba Conferência → quadro "Conferência da proposta"', 'Lista o que impede seguir, o que pede tratamento ou justificativa e o que só informa.'],
      ['Pendências automáticas', 'Menu Pendências → Acompanhamento; aba Conferência → "Pendências desta proposta"', 'Ao salvar a proposta, cada falha da conferência que impede ou pede atenção vira uma pendência com código, departamento, prazo e prioridade. Não duplica e se resolve sozinha quando a falha some.'],
      ['Pendências manuais', 'Botão "+ Nova pendência"', 'Qualquer coisa a resolver, com ou sem proposta.'],
      ['Alertas por item', 'Aba Conferência → "Alertas por item"; tela do item', 'Cada alerta tem a correção possível (por exemplo, Ajustar à margem mínima) ou Seguir assim, com justificativa.'],
      ['Aprovação com valor target', 'Aba Conferência → "Aprovação da proposta"; Margens → Aprovações', 'Pede à Diretoria e ao Financeiro um valor para a proposta toda; depois de aprovado, o valor é aplicado na proposta.'],
    ] },
    { t: 'aviso', x: 'No modo local não há usuários: todo mundo vê as pendências e as aprovações de todas as áreas ("Neste navegador você vê as pendências de todas as áreas") e qualquer pessoa aprova. A separação por papel, os aprovadores e a assinatura das decisões só existem no modo compartilhado.' },

    { t: 'h', x: 'Acompanhamento de pendências' },
    { t: 'p', x: 'O menu **Pendências** abre a tela **Minhas pendências**. No fim dela fica o quadro **Acompanhamento**, com todas as pendências registradas. Por padrão aparecem as abertas, das mais urgentes (abertas, vencidas, prazo mais próximo) para as outras.' },
    { t: 'fig', id: '13-01' },
    { t: 'tab', cab: ['Campo', 'Como funciona'], lin: [
      ['Código', 'PND-AAMMDD-XXXX nas manuais; PND-A… nas automáticas (o código sai da própria falha, por isso não duplica).'],
      ['Departamento', 'Comercial, Diretoria Comercial, Engenharia, Compras/Custos ou Financeiro/Fiscal. Na automática vem da área da conferência (por exemplo Identificação → Comercial; Margem e desconto → Diretoria Comercial; Custos → Compras/Custos).'],
      ['Responsável', 'Nome livre. No modo compartilhado há também "sou eu", que liga a pendência ao seu usuário.'],
      ['Prazo', 'Padrão a partir da criação: impeditiva 2 dias, atenção 5, informativa 10. Passou do prazo e está aberta: "vencida".'],
      ['Prioridade', 'Alta, Média ou Baixa (na automática: impeditiva → alta, atenção → média).'],
      ['Criticidade', 'Impeditiva, Atenção ou Informativa. Na automática vem da conferência e não se muda.'],
      ['Situação', 'Aberta, Em andamento, Resolvida ou Não se aplica.'],
      ['Histórico', 'Cada gravação registra data, quem e o que mudou (de → para), mais o comentário.'],
    ] },
    { t: 'tut', titulo: 'Atualizar e resolver uma pendência', objetivo: 'Registrar quem cuida, o andamento e a solução de uma pendência.',
      quem: 'No modo compartilhado, quem pode gravar no banco (Contribuidor ou acima); com acesso só de leitura aparece "Sem permissão para gravar pendências (acesso só de leitura)." No modo local não há controle de acesso.',
      pre: ['Uma pendência aberta (automática ou manual).'],
      passos: [
        'No menu lateral, clique em **Pendências** e role até **Acompanhamento**. Use os filtros e a busca se preciso.',
        'Clique em **Abrir** na linha da pendência.',
        { x: 'Preencha **Responsável**, ajuste **Prazo** e **Prioridade** e mude a **Situação** para **Em andamento**. Escreva em **Comentário para o histórico** o que foi feito e clique em **Salvar**.', fig: '13-02' },
        'Quando estiver resolvida, abra de novo, escolha **Resolvida** (ou **Não se aplica**), escreva a **Solução ou justificativa** e clique em **Salvar**.',
      ],
      resultado: 'O aviso "Pendência atualizada" aparece; a mudança entra no histórico da pendência e no histórico geral (tipo "Pendência"). Resolvida, ela sai da lista de abertas.',
      atencao: 'Sem a solução ou justificativa, o app não deixa resolver nem marcar "não se aplica": aparece "Informe a solução ou a justificativa". As automáticas se resolvem sozinhas quando a falha some da conferência (solução "Resolvida automaticamente: a falha não aparece mais na conferência.") e são reabertas se a falha voltar. Uma automática marcada "não se aplica" fica como está.',
      dica: 'Pela proposta, use **Abrir a proposta** dentro da pendência, ou o botão **proposta** na linha do acompanhamento.' },
    { t: 'tut', titulo: 'Abrir uma pendência manual', objetivo: 'Registrar algo a resolver que a conferência não detecta (por exemplo, confirmar um dado com o cliente).',
      quem: 'Qualquer pessoa da equipe que possa gravar (no modo compartilhado, Contribuidor ou acima). No modo local não há controle de acesso.',
      pre: ['Para ligar à proposta, abra-a e use o quadro da aba Conferência.'],
      passos: [
        'Clique em **+ Nova pendência**: no **Acompanhamento** (pendência geral, sem proposta) ou no quadro **Pendências desta proposta** da aba **Conferência** (ligada à proposta).',
        'Descreva em **Pendência** e escolha **Departamento**, **Responsável**, **Prazo**, **Prioridade** e **Criticidade**.',
        'Clique em **Abrir pendência**.',
      ],
      resultado: 'O aviso "Pendência PND-… aberta" aparece e ela entra no acompanhamento como "manual". Na proposta, o cabeçalho soma as pendências "em acompanhamento".',
      atencao: 'Sem descrição, o app avisa "Descreva a pendência" e não grava.' },
    { t: 'h', x: 'De onde vêm as pendências automáticas' },
    { t: 'p', x: 'Ao salvar a proposta, o app passa a conferência da proposta para o acompanhamento. O que **impede seguir** vira pendência impeditiva; o que **pede tratamento ou justificativa** vira pendência de atenção; o que é só **informação** não vira pendência. A conferência também trava o "Enviar ao cliente" quando a política de Custos manda travar e há itens que impedem seguir.' },
    { t: 'fig', id: '13-03' },
    { t: 'nota', x: 'Na proposta de exemplo, logo ao salvar, nascem quatro pendências de atenção: falta o CNPJ/CPF (Comercial) e três alertas de margem e fator abaixo da política (Diretoria Comercial).' },

    { t: 'h', x: 'Aprovação de desconto com valor target' },
    { t: 'p', x: 'Quando o preço fica fora da política (margem abaixo do mínimo ou fator abaixo do piso), o caminho é pedir aprovação **pela proposta toda**, dizendo o valor pelo qual se quer fechar (valor target). A Diretoria e o Financeiro analisam esse valor e decidem no app; depois de aprovado, quem monta a proposta aplica o valor.' },
    { t: 'tut', titulo: 'Pedir aprovação com valor target', objetivo: 'Levar à Diretoria e ao Financeiro um desconto além da política, com o valor e a justificativa.',
      quem: 'Quem monta a proposta (no modo compartilhado, Contribuidor ou acima). No modo local não há controle de acesso.',
      pre: ['Proposta SEQ, SPV ou FACTS. Se ela não estiver salva ou tiver alterações, o app salva antes de abrir o pedido.'],
      passos: [
        'Abra a proposta, clique na aba **Conferência** e, no quadro **Aprovação da proposta**, clique em **Pedir aprovação (valor target)**. O mesmo pedido sai do botão **Pedir aprovação** de um alerta.',
        { x: 'Confira **Valor atual**, **Margem atual** e **Menor preço pela margem mínima**. Digite o **Valor target**, escolha se é **com IPI** ou **sem IPI** e leia a prévia (desconto e margem no target). Escreva a **Justificativa**.', fig: '13-04' },
        'Clique em **Continuar para o e-mail**. O pedido já fica registrado; na janela **Pedir aprovação à Diretoria e ao Financeiro**, confira destinatários, assunto e mensagem e use **Abrir no meu e-mail**, **Baixar a planilha**, **Copiar texto** ou **Agora não**.',
      ],
      resultado: 'O quadro passa a mostrar "Aprovação do valor target de R$ … pedida em <data>: está com Diretoria e Financeiro." O topo da proposta ganha o selo da aprovação e a tela Início mostra com quem está.',
      atencao: 'Sem valor target ou sem justificativa o pedido não sai ("Informe o valor target", "Escreva a justificativa"). Um novo pedido (**Pedir de novo (novo valor target)**) substitui o anterior da mesma proposta.',
      dica: 'O simulador da aba Formação também leva um valor ao pedido de aprovação.' },
    { t: 'nv', x: 'Envio do aviso por e-mail: o botão **Enviar pelo Outlook** só aparece quando o app compartilhado tem o Microsoft 365 conectado; não foi exercitado. **Abrir no meu e-mail** depende do programa de e-mail do computador. Os endereços da Diretoria, do Financeiro e da cópia vêm de Configurações → Responsáveis, e-mails e logo.' },
    { t: 'h', x: 'Com quem está' },
    { t: 'p', x: 'Enquanto falta decisão, a situação da proposta na tela **Início** mostra com quem está ("Em aprovação · com Diretoria e Financeiro"; depois que um decide, só o outro). A trilha de etapas da linha ganha a etapa **Aprovação**, e o botão de próximo passo leva à análise.' },
    { t: 'fig', id: '13-05' },
    { t: 'nv', x: 'No modo compartilhado, "com quem está" traz também os nomes dos aprovadores cadastrados para cada papel, e a tela Minhas pendências mostra a cada pessoa só os papéis em que ela está. Isso depende de usuários e de Configurações → Responsáveis, e-mails e logo, e não foi validado nas capturas (modo local).' },
    { t: 'fig', id: '13-06' },
    { t: 'tut', titulo: 'Analisar e decidir uma aprovação (Diretoria ou Financeiro)', objetivo: 'Aprovar ou reprovar o valor target pedido.',
      quem: 'No modo compartilhado, quem está na lista de aprovadores do papel (Diretoria ou Financeiro) ou o dono do app; sem lista definida, qualquer Editor. Quem não pode decidir vê "aguardando quem cuida desta aprovação". No modo local qualquer pessoa decide.',
      pre: ['Um pedido de aprovação pendente.'],
      passos: [
        'Abra **Pendências** e clique em **Analisar** na seção **Aprovar descontos** do seu papel. Também dá para ir por **Margens** → **Aprovações** → **Analisar**, ou pelo botão de próximo passo na tela Início.',
        { x: 'Leia **Onde está**, a **Justificativa** e a **Análise no formato da planilha** (fator mínimo × fator que o preço suporta, por item, no valor target). Se quiser, use **Baixar a planilha (Reunião e Base)**.', fig: '13-07' },
        'No seu papel, clique em **Aprovar** ou **Reprovar**, escreva o **Comentário** (obrigatório para reprovar) e clique em **Confirmar**.',
      ],
      resultado: 'O aviso "Decisão registrada" aparece e a trilha marca a decisão. Quando Diretoria e Financeiro aprovam, a situação vira "Em aprovação · aprovada, falta aplicar" e a versão aprovada da proposta é congelada nas revisões. Se um reprova, a situação vira "Desconto reprovado".',
      atencao: 'A aprovação perde a validade se, depois do pedido, o custo total mudar mais de 0,5% ou os itens ou quantidades mudarem, ou se a proposta ficar abaixo do valor aprovado. Aí é preciso pedir de novo.' },
    { t: 'nv', x: 'Decisões assinadas: no modo compartilhado cada decisão grava também uma assinatura no banco e só conta se a assinatura existir e quem decidiu for aprovador do papel ("decisão sem assinatura válida no banco", "quem decidiu não está entre os aprovadores"). Não validado nas capturas (modo local).' },
    { t: 'tut', titulo: 'Aplicar o valor aprovado na proposta', objetivo: 'Levar a proposta exatamente ao valor target aprovado.',
      quem: 'Quem monta a proposta (no modo compartilhado, Contribuidor ou acima). No modo local não há controle de acesso.',
      pre: ['Aprovação com Diretoria e Financeiro aprovados.', 'Proposta SEQ (o botão de aplicar não aparece na SPV nem na FACTS).'],
      passos: [
        'Na tela Início, clique em **Aplicar valor aprovado** na linha da proposta (ou abra a proposta na aba **Conferência**).',
        { x: 'No quadro **Aprovação da proposta**, clique em **Aplicar o valor aprovado na proposta**.', fig: '13-08' },
        'Clique em **Salvar**.',
      ],
      resultado: 'O app ajusta o **Desconto global** até o total com IPI chegar ao valor aprovado ("Proposta no valor aprovado: R$ …. Salve para guardar."), a trilha marca **Valor aplicado** e o histórico registra "Aprovação — valor aplicado".',
      atencao: 'O ajuste é feito no desconto global. Mudar itens, quantidades ou custos depois disso pode derrubar a aprovação.' },

    { t: 'h', x: 'Alertas: corrigir ou seguir assim' },
    { t: 'p', x: 'Cada alerta de item mostra o que dá para fazer. O botão de correção tem o nome da ação (**Ajustar à margem mínima**, **Tirar o desconto**, **Pedir cadastro do motor**, **Pedir cadastro do preço**, **Informar a vazão**, **Escolher a jockey**, **Ver o código**, **Ver a descrição**, **Ver a FCI**). Alertas de margem e fator abaixo da política oferecem **Pedir aprovação**; os demais de alerta ou aviso oferecem **Seguir assim**, que exige justificativa. Alertas só de informação não têm "Seguir assim".' },
    { t: 'fig', id: '13-09' },
    { t: 'tut', titulo: 'Seguir assim com justificativa', objetivo: 'Manter a proposta como está, registrando por quê.',
      quem: 'Quem monta a proposta. No modo local não há controle de acesso.',
      pre: ['Um alerta com o botão **Seguir assim** (alertas de margem ou fator abaixo da política pedem aprovação, não "seguir assim").'],
      passos: [
        'Abra a proposta na aba **Conferência** e abra **Alertas por item** (ou abra o item).',
        { x: 'Clique em **Seguir assim**, escreva em **Por que seguir assim? (fica no histórico)** e clique em **Confirmar**.', fig: '13-10' },
        'Clique em **Salvar** na barra superior.',
      ],
      resultado: 'O alerta fica marcado "Seguindo assim: <motivo>", sai da contagem e da conferência e o histórico registra "Alerta — seguir assim" com a justificativa. Para voltar atrás, clique em **desfazer**.',
      atencao: 'Sem motivo o app avisa "Escreva o motivo". A justificativa só é guardada ao salvar a proposta ("Registrado. Salve a proposta para guardar.").' },
    { t: 'nota', x: 'O alerta "Confirmar a pressão do ponto mais desfavorável" das figuras vem de uma regra de atenção cadastrada só para o exemplo em Cadastros → Engenharia → Regras de configuração. O app não vem com regras prontas.' },
  ],
  glossario: [
    ['Pendência automática', 'Pendência criada pelo app ao salvar a proposta, a partir de uma falha da conferência; não duplica e se resolve sozinha quando a falha some.'],
    ['Valor target', 'Valor pelo qual se pede para fechar a proposta toda, analisado e aprovado pela Diretoria e pelo Financeiro.'],
    ['Seguir assim', 'Decisão de manter um alerta, com justificativa obrigatória registrada no histórico.'],
  ],
};
