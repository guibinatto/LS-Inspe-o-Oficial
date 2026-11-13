// Capítulo 16 — Configurações e administração
// Capturas no modo local: sem login, quem abre o arquivo é administrador. O que só existe no modo
// compartilhado (responsáveis por área, nomes de pessoas, selos de perfil) está marcado como não validado.
const os = require('os'), path = require('path');

module.exports = {
  n: 16, titulo: 'Configurações e administração', slug: 'config',
  inicio: async (p, h) => {
    // gera registros no histórico: proposta criada e enviada ao cliente
    await h.exemplo(); await h.salvar();
    await h.nav('inicio');
    await h.clicar('.home [data-etp$="|cliente"]', 700);
  },
  capturas: [
    { id: '16-01', nome: 'config-menu', titulo: 'Menu Configurações e suas quatro abas', alto: 780,
      prep: async (p, h) => { await h.nav('config'); await h.topo(); },
      marcas: [
        { sel: '#nav [data-view="config"]', txt: 'Configurações, no menu lateral.', pos: 'r' },
        { sel: '.legend .pill:nth-child(1)', txt: 'Onde os dados ficam: "Salvo só neste navegador" (modo local) ou "Compartilhado com a equipe".', pos: 'b' },
        { sel: '.legend .pill:nth-child(2)', txt: 'Se você pode editar esta parte (aqui, a área Sistema).', pos: 'b' },
        { sel: '.subtabs [data-cad="historico"]', txt: 'Histórico de alterações.', pos: 'b' },
        { sel: '.subtabs [data-cad="acessos"]', txt: 'Responsáveis, e-mails e logo (com perfis e permissões).', pos: 'b' },
        { sel: '.subtabs [data-cad="backup"]', txt: 'Backup e restauração, com a lixeira.', pos: 'b' },
        { sel: '.subtabs [data-cad="tabelas"]', txt: 'Planilha (avançado): as abas da planilha original.', pos: 'b' },
      ] },

    { id: '16-02', nome: 'config-historico', titulo: 'Histórico com filtro de tipo e busca', clip: 'section.card:has(#histT)', pad: 8,
      prep: async (p, h) => { await p.selectOption('#histT', 'propostas'); await h.esperar(500); },
      marcas: [
        { sel: '#histT', txt: 'Tipo: Tudo, Propostas e alertas, Baixas e custo real, Documentos, Pedidos de cadastro, Cadastro ou Acessos.', pos: 't' },
        { sel: '#histQ', txt: 'Busca por texto (tipo, descrição, referência ou nome do campo).', pos: 't' },
        { sel: 'section.card:has(#histT) .sheetbar .sub', txt: 'Abrangência: neste navegador (local) ou últimos 90 dias com alteração, de toda a equipe (compartilhado).', pos: 't' },
        { sel: '.hrow .hmeta', txt: 'Data, hora e quem fez (no modo local, "neste navegador").', pos: 'l' },
        { sel: '.hrow .pill', txt: 'Tipo do registro e descrição.', pos: 'bl' },
        { sel: '.hrow table.mini', txt: 'Cada campo alterado: valor anterior → valor novo.', pos: 'r' },
      ],
      depois: async (p, h) => { await p.selectOption('#histT', ''); await h.esperar(400); } },

    { id: '16-03', nome: 'config-perfis', titulo: 'Perfis e permissões (matriz)', clip: 'section.card:has(table.perm)', pad: 8,
      prep: async (p, h) => { await h.clicar('.subtabs [data-cad="acessos"]', 600); },
      marcas: [
        { sel: 'section.card:has(table.perm) > p.sub b', txt: 'No modo local: sem login nem controle de acesso. Os perfis valem no app compartilhado.', pos: 'l' },
        { sel: 'table.perm thead th:nth-child(8)', txt: 'Colunas de perfil: Administrador, Diretoria Comercial, Comercial, Engenharia, Compras/Custos, Financeiro/Fiscal e Consulta. Passe o mouse no nome para ver como a pessoa ganha o perfil.', pos: 't' },
        { sel: 'table.perm tbody tr:nth-child(4) td:first-child', txt: 'Apagar proposta de vez e restaurar backup: só o administrador.', pos: 'l' },
        { sel: 'table.perm tbody tr:nth-child(10) td:first-child', txt: 'Lançar custo real: Administrador, Engenharia e Compras/Custos.', pos: 'l' },
        { sel: 'table.perm thead th:last-child', txt: 'Onde é garantido: "banco" (vale mesmo fora da tela) ou "app" (o app confere e registra, mas o banco não impede).', pos: 't' },
        { sel: 'section.card:has(table.perm) > p.sub:last-child', txt: 'Explicação de banco × app e o que vale quando ninguém foi definido nas áreas.', pos: 'l' },
      ] },

    { id: '16-04', nome: 'config-emails', titulo: 'E-mails das áreas', clip: 'section.card:has(#av_financeiro)', pad: 8,
      prep: async (p, h) => { await h.preencher('#av_financeiro', 'financeiro@exemplo.com.br'); },
      marcas: [
        { sel: '#av_financeiro', txt: 'Financeiro: recebe o aviso da baixa e o pedido de aprovação.', pos: 'l' },
        { sel: '#av_engenharia', txt: 'Engenharia: recebe o aviso da baixa para lançar o custo real.', pos: 'r' },
        { sel: '#av_diretoria', txt: 'Diretoria: recebe o pedido de aprovação de desconto.', pos: 'l' },
        { sel: '#av_cc', txt: 'Cópia: opcional, vai em todos.', pos: 'r' },
        { sel: '#av_link', txt: 'Link do app: vai no texto do e-mail.', pos: 'l' },
        { sel: 'section.card:has(#av_financeiro) > p.sub', txt: 'Vários e-mails: separe com vírgula. Grava ao sair do campo.', pos: 'r' },
      ] },

    { id: '16-05', nome: 'config-logo', titulo: 'Logo da empresa', clip: 'section.card:has(label[for="logoUp"])', pad: 8,
      marcas: [
        { sel: 'section.card:has(label[for="logoUp"]) .logo-plate', txt: 'Logo atual: aparece no topo do app, no memorial e nos PDFs.', pos: 'l' },
        { sel: 'label[for="logoUp"]', txt: 'Trocar logo (PNG, JPG ou SVG). Depois de trocar, aparece também "Voltar ao original".', pos: 'r' },
      ] },

    { id: '16-06', nome: 'config-backup', titulo: 'Backup e restauração, com a lixeira', clip: 'div.stack:has(> section.card [data-bkbaixa])', pad: 8,
      prep: async (p, h) => { await h.clicar('.subtabs [data-cad="backup"]', 600); },
      marcas: [
        { sel: '[data-bkbaixa]', txt: 'Baixar backup completo: um arquivo .json com tudo o que o app guarda (sem os PDFs anexados).', pos: 'r' },
        { sel: 'label[for="bkArq"]', txt: 'Escolher arquivo de backup (.json): só o administrador (dono do app) restaura.', pos: 'r' },
        { sel: 'section.card:has(label[for="bkArq"]) > p.sub', txt: 'O app mostra o que vai mudar antes de gravar; por padrão só acrescenta o que não existe.', pos: 'l' },
        { sel: 'section.card:has(h2):last-child h2', txt: 'Lixeira: propostas excluídas, com Restaurar e (só o administrador) Apagar de vez.', pos: 'l' },
      ] },

    { id: '16-07', nome: 'config-restaurar', titulo: 'Janela de restauração de backup (prévia antes de gravar)', clip: '.modal .card', pad: 8,
      prep: async (p, h) => {
        const arq = path.join(os.tmpdir(), 'ls-pricer-manual-backup.json');
        const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-bkbaixa]')]);
        await d.saveAs(arq); await h.esperar(500);
        await p.setInputFiles('#bkArq', arq); await h.esperar(900);
      },
      marcas: [
        { sel: '.modal h2', txt: 'Data do backup e de onde veio (navegador ou banco da equipe).', pos: 'l' },
        { sel: '.modal thead', txt: 'Para cada coleção: quantos registros há no arquivo, quantos são novos, diferentes do atual ou iguais.', pos: 'l' },
        { sel: '.modal [data-bkcol="propostas"]', txt: 'Marque o que restaurar.', pos: 'l' },
        { sel: '.modal [data-bkcad]', txt: 'Cadastro: no modo local substitui o cadastro inteiro deste navegador; no compartilhado fica desativado.', pos: 'l' },
        { sel: '.modal label.chk', txt: 'Substituir também os registros diferentes (a versão atual da proposta vai antes para as revisões).', pos: 'l' },
        { sel: '#bkOk', txt: 'Restaurar o que está marcado: pede confirmação e recarrega o app.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('.modal [data-close]', 400); } },

    { id: '16-08', nome: 'config-planilha', titulo: 'Planilha (avançado), filtrada', clip: 'section.card:has(#selTable)', pad: 8,
      prep: async (p, h) => {
        await h.clicar('.subtabs [data-cad="tabelas"]', 800);
        await p.fill('#tblFilter', 'margem'); await h.esperar(900);
      },
      marcas: [
        { sel: '#selTable', txt: 'Aba da planilha. As abas marcadas "(consulta)" vêm das telas Insumos e Kits e não se editam aqui.', pos: 'l' },
        { sel: '#tblFilter', txt: 'Filtrar linhas pelo texto.', pos: 'b' },
        { sel: 'section.card:has(#selTable) .sheetbar > .sub', txt: 'Quantas células estão diferentes da planilha REV21.', pos: 'b' },
        { sel: '.grid td[data-a="C34"]', txt: 'Célula de valor (aqui, a margem mínima): clique para editar; Enter grava, Esc cancela.', pos: 'r' },
        { sel: '.grid tbody tr:nth-child(4) th.rh', txt: 'Número da linha na planilha; o filtro mantém as linhas de título.', pos: 'l' },
      ],
      depois: async (p, h) => { await p.fill('#tblFilter', ''); await h.esperar(600); } },

    { id: '16-09', nome: 'config-tema-escuro', titulo: 'Tema escuro (botão de tema na barra superior)',
      prep: async (p, h) => { await h.clicar('#bTheme', 300); await h.clicar('#bTheme', 500); await h.clicar('.subtabs [data-cad="historico"]', 500); await h.topo(); },
      marcas: [
        { sel: '#bTheme', txt: 'Tema: cada clique troca entre automático, claro e escuro. Passe o mouse para ver o tema atual.', pos: 'b' },
        { sel: '#nav [data-view="config"]', txt: 'Todas as telas seguem o tema escolhido.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.clicar('#bTheme', 400); } },
  ],

  conteudo: [
    { t: 'p', x: 'O menu **Configurações** reúne o que é de administração: o histórico de alterações, os perfis e responsáveis, os e-mails e o logo, o backup e a restauração e a planilha completa. Este capítulo também explica o tema da tela e o que cada papel pode fazer no modo local e no modo compartilhado.' },
    { t: 'h', x: 'Modo local × modo compartilhado' },
    { t: 'tab', cab: ['', 'Modo local', 'Modo compartilhado'], lin: [
      ['Como abre', 'O arquivo ls-pricer.html direto no computador', 'O endereço do app no claude.ai'],
      ['Onde ficam os dados', 'Só neste navegador, neste computador', 'No banco da equipe: todos veem as mesmas propostas e cadastros'],
      ['Login e permissões', 'Não há. Quem abre o arquivo faz tudo, como administrador', 'Sim. O papel de cada pessoa (Leitor, Contribuidor, Editor, dono) é verificado no banco'],
      ['Selo no topo de Cadastros e Configurações', '"Salvo só neste navegador"', '"Compartilhado com a equipe"'],
      ['Histórico', 'Alterações feitas neste navegador', 'Últimos 90 dias com alteração, de toda a equipe'],
    ] },
    { t: 'aviso', x: '**No modo local não há login nem controle de acesso**: quem abre o arquivo faz tudo, inclusive restaurar backup e apagar propostas de vez. Use o modo local só para estudo, treino ou contingência. **Esconder um botão não é segurança.** As regras de acesso valem no banco compartilhado. Algumas regras são conferidas só pelo app (a matriz de permissões diz quais): uma pessoa com acesso de Contribuidor e conhecimento técnico poderia gravar direto pelo navegador; esses casos ficam registrados no histórico.' },

    { t: 'h', x: 'Papéis no modo compartilhado' },
    { t: 'p', x: 'O banco do app compartilhado distingue só o nível de compartilhamento de cada pessoa. Os perfis do app (Comercial, Engenharia, Financeiro/Fiscal etc.) saem desse nível e das listas de responsáveis e aprovadores, que só o dono grava.' },
    { t: 'tab', cab: ['Papel', 'O que pode fazer', 'Como dar o acesso'], lin: [
      ['Leitor', 'Consulta propostas, margens e cadastro, sem alterar nada (perfil Consulta).', 'Compartilhar o app como Leitor.'],
      ['Contribuidor', 'Cria, edita e salva propostas; pendências; documentos. Não altera nenhum cadastro (o banco bloqueia). Pode mandar para a lixeira a proposta em aberto que criou (perfil Comercial).', 'Compartilhar como Contribuidor (comercial e vendedores).'],
      ['Editor', 'Tudo do Contribuidor e, além disso, altera o cadastro das áreas em que está (Custos, Engenharia, Fiscal, Precificação, Serviços…). Sem ninguém definido nas áreas, todo Editor altera todo o cadastro; sem aprovadores definidos, qualquer Editor aprova desconto.', 'Compartilhar como Editor e incluir a pessoa na área, em Responsáveis.'],
      ['Dono (Administrador)', 'Tudo: define responsáveis, aprovadores e perfis; restaura backup; apaga proposta de vez; altera todas as áreas.', 'É quem publicou o app.'],
    ] },
    { t: 'nv', x: 'As capturas são do modo local. No modo compartilhado a tela Responsáveis, e-mails e logo mostra também o cartão **Responsáveis por área** (com **+ Pessoa** e **×** para o dono), "Seus perfis" com selos e o cartão **Como dar acesso**. Essas telas, os nomes das pessoas e as recusas do banco não foram validados nas capturas. Pela leitura do código, os botões **+ Pessoa** e **×** só respondem quando a tela atual é Cadastros; como a aba agora fica em Configurações, eles podem não reagir ao clique (ver o relatório de inconsistências).' },

    { t: 'h', x: 'O menu Configurações' },
    { t: 'fig', id: '16-01' },
    { t: 'tab', cab: ['Aba', 'Para que serve'], lin: [
      ['Histórico', 'Todas as alterações registradas: propostas, baixas, custo real, documentos, pedidos de cadastro, cadastro e acessos.'],
      ['Responsáveis, e-mails e logo', 'Perfis e permissões, logo da empresa e e-mails das áreas; no modo compartilhado, também os responsáveis por área e os aprovadores.'],
      ['Backup e restauração', 'Baixar e restaurar o backup completo; lixeira de propostas excluídas.'],
      ['Planilha (avançado)', 'As abas da planilha original (tributos, política, montador, codificação, hidráulica, FCI), célula a célula.'],
    ] },

    { t: 'tut', titulo: 'Consultar o histórico de alterações', objetivo: 'Descobrir quem mudou o quê e quando: uma proposta, uma baixa, um preço do cadastro, um acesso.', quem: 'Qualquer usuário consulta. No modo local não há controle de acesso e o histórico é só deste navegador.', pre: ['Nenhum.'], passos: [
      'No menu lateral, clique em **Configurações**. A aba **Histórico** abre primeiro.',
      { x: 'Escolha o tipo na lista (**Tudo**, **Propostas e alertas**, **Baixas e custo real**, **Documentos**, **Pedidos de cadastro**, **Cadastro** ou **Acessos**) e, se quiser, digite em **Buscar no histórico…**.', fig: '16-02' },
      'Leia cada registro: data e hora, quem fez, tipo, descrição e a tabela com o valor anterior e o novo de cada campo.',
    ], resultado: 'A lista mostra até 250 registros que atendem ao filtro, do mais recente para o mais antigo. Registros de insumo têm o link **abrir**. Percentuais aparecem como fração (margem 0,33 = 33%).', atencao: 'No modo compartilhado o histórico cobre os últimos 90 dias com alteração. Para guardar mais tempo, baixe backups periódicos (o backup leva o histórico).', dica: 'Registros de **Edição em massa**, **Importação de preços** e **Consolidação de cadastro** têm o botão **desfazer este lote** para quem pode editar a área Custos; ele pede confirmação.' },

    { t: 'nota', x: 'O filtro de tipo separa os registros pelo começo do tipo. Na REV22, registros como "Etapa da proposta" (enviada ao cliente, avisos às áreas, encerrada) e "Backup baixado" aparecem em **Cadastro**, e não em **Propostas e alertas**. Se não achar um registro, use **Tudo** com a busca.' },
    { t: 'h', x: 'Perfis e permissões' },
    { t: 'p', x: 'A aba **Responsáveis, e-mails e logo** começa pela matriz **Perfis e permissões**: uma linha por ação, uma coluna por perfil e a coluna **Onde é garantido**.' },
    { t: 'fig', id: '16-03' },
    { t: 'tab', cab: ['Perfil', 'Quem tem'], lin: [
      ['Administrador', 'O dono do app (no modo local, quem abre o arquivo).'],
      ['Diretoria Comercial', 'Quem está na lista de aprovadores Diretoria.'],
      ['Comercial', 'Quem foi compartilhado como Contribuidor ou Editor.'],
      ['Engenharia', 'Quem está na área Engenharia (e é Editor).'],
      ['Compras/Custos', 'Quem está na área Custos (e é Editor).'],
      ['Financeiro/Fiscal', 'Quem está na lista de aprovadores Financeiro ou na área Fiscal.'],
      ['Consulta', 'Quem foi compartilhado como Leitor.'],
    ] },
    { t: 'nota', x: 'Uma pessoa pode ter mais de um perfil. Nas ações com "banco" na coluna Onde é garantido, a regra vale mesmo fora da tela. Nas ações com "app" (mandar para a lixeira, apagar de vez, restaurar backup, lançar custo real, conferir previsto × realizado), o app confere antes de gravar e registra no histórico, mas o banco não impede quem tenha o nível de compartilhamento suficiente.' },

    { t: 'h', x: 'E-mails das áreas e logo' },
    { t: 'tut', titulo: 'Cadastrar os e-mails das áreas', objetivo: 'Deixar prontos os destinatários das janelas de e-mail da baixa (Avisar Financeiro e Engenharia) e do pedido de aprovação de desconto.', quem: 'Quem cuida de Sistema. No modo compartilhado: qualquer Editor enquanto ninguém foi definido nas áreas; depois disso, só o dono (a área Sistema não tem lista de responsáveis). Para os demais os campos aparecem desativados, com "Só quem cuida de Sistema altera." No modo local não há controle de acesso.', pre: ['Os e-mails de cada área.'], passos: [
      'Em **Configurações**, clique na aba **Responsáveis, e-mails e logo** e role até **E-mails das áreas**.',
      { x: 'Preencha **Financeiro**, **Engenharia** e **Diretoria**; se quiser, **Cópia** e o **Link do app**. Separe vários e-mails com vírgula.', fig: '16-04' },
      'Saia do campo (Tab ou clique fora). O app grava e mostra "E-mail salvo".',
    ], resultado: 'Na próxima baixa ou pedido de aprovação, a janela de e-mail já vem com esses destinatários. A alteração fica no histórico.', atencao: 'O app não confere se o endereço existe. Na janela de e-mail, só os endereços em formato válido entram no envio.', dica: 'O **Link do app** vai no fim do texto do e-mail; use o endereço do app compartilhado da equipe.' },
    { t: 'fig', id: '16-05' },
    { t: 'p', x: 'Para trocar o logo, clique em **Trocar logo (PNG, JPG ou SVG)** e escolha a imagem. O app reduz PNG e JPG para 120 px de altura; um SVG pode ter até 300 KB ("SVG grande demais (máx. 300 KB)"). O logo vale no topo do app, no memorial e nos PDFs. Para voltar, use **Voltar ao original**. Quem pode: o mesmo de quem cuida de Sistema; os outros veem "Só quem cuida de Sistema troca o logo."' },
    { t: 'nv', x: 'A troca do logo não foi feita nas capturas: a figura mostra o logo original e o botão.' },

    { t: 'h', x: 'Backup e restauração' },
    { t: 'fig', id: '16-06' },
    { t: 'tut', titulo: 'Baixar um backup completo', objetivo: 'Guardar uma cópia de tudo o que o app tem: propostas, revisões, aprovações, baixas e custo real, pedidos de cadastro, dados dos documentos, acompanhamento de pendências, modelos de item, cadastro e histórico.', quem: 'Qualquer usuário com acesso à aba (no modo compartilhado o backup lê o banco da equipe). No modo local não há controle de acesso e o backup é só deste navegador.', pre: ['Nenhum.'], passos: [
      'Em **Configurações**, clique em **Backup e restauração**.',
      'Clique em **Baixar backup completo**. O app mostra "Montando o backup…" e baixa o arquivo ls-pricer-backup-AAAA-MM-DD-HH-MM.json.',
    ], resultado: 'O arquivo .json fica na pasta de downloads, e o histórico registra "Backup baixado" com a contagem de cada coleção.', atencao: 'Os arquivos anexados (PDFs) não entram no backup: baixe-os pela tela Documentos. No modo local, os dados vivem só no navegador; limpar os dados do navegador apaga tudo o que não estiver num backup.', dica: 'Se aparecer o botão **Baixar a cópia automática de antes da REV22**, ele traz o que estava no navegador antes da primeira abertura da REV22.' },
    { t: 'tut', titulo: 'Restaurar um backup', objetivo: 'Recuperar propostas e registros a partir de um arquivo de backup.', quem: 'Só o administrador (dono do app). Para os demais aparece "Só o administrador (dono do app) restaura backups." No modo local não há controle de acesso: quem abre o arquivo é administrador.', pre: ['Um arquivo de backup do LS Pricer (.json). Outro arquivo é recusado com "Esse arquivo não é um backup do LS Pricer".', 'Recomendado: baixar antes um backup do estado atual.'], passos: [
      'Em **Configurações → Backup e restauração**, clique em **Escolher arquivo de backup (.json)** e escolha o arquivo.',
      { x: 'Confira a prévia: para cada coleção, quantos registros estão no arquivo, quantos são novos, diferentes do atual e iguais. Marque o que restaurar.', fig: '16-07' },
      'Se quiser trocar também os registros diferentes, marque **Substituir também os registros diferentes**. Sem essa marca, o app só acrescenta o que não existe.',
      'Clique em **Restaurar o que está marcado** e confirme.',
    ], resultado: 'O app mostra "N registro(s) restaurado(s). Recarregando…" e recarrega. O histórico registra "Backup restaurado". Quando uma proposta é substituída, a versão anterior vai para as revisões.', atencao: 'A linha **Cadastro (insumos, kits, tabelas)** só pode ser marcada no modo local e substitui o cadastro inteiro deste navegador. No banco da equipe, o cadastro se restaura pelo Cadastros → Importar preços e pelas tabelas.', dica: 'A **Lixeira**, logo abaixo, guarda as propostas excluídas: **Restaurar** (o administrador ou quem excluiu) e **Apagar de vez** (só o administrador, sem volta a não ser por backup).' },
    { t: 'nv', x: 'A restauração no banco compartilhado (gravação direta em cada coleção) não foi validada: as capturas param na prévia, no modo local.' },

    { t: 'h', x: 'Planilha (avançado)' },
    { t: 'p', x: 'A aba **Planilha (avançado)** mostra as abas da planilha original: tributos, política comercial, receita do montador, codificação, hidráulica e FCI. Use-a só quando a informação não estiver numa tela própria de Cadastros.' },
    { t: 'fig', id: '16-08' },
    { t: 'lista', itens: [
      'Escolha a aba na lista e, se quiser, filtre as linhas pelo texto.',
      'Clique numa célula de valor para editar; **Enter** grava ("Salvo: ABA CÉLULA") e **Esc** cancela. Células de fórmula (texto cinza) são calculadas.',
      'As células alteradas ficam destacadas e o topo mostra quantas estão diferentes da planilha REV21. **Voltar aos valores da planilha** desfaz todas as mudanças da aba (pede confirmação).',
      'As abas marcadas "(consulta)" são montadas a partir das telas Insumos e Kits: edite por lá.',
    ] },
    { t: 'aviso', x: 'Uma célula alterada aqui vale para todas as propostas (no modo compartilhado, de toda a equipe). Prefira as telas de Cadastros, que explicam cada campo. Quem pode editar: quem cuida de Sistema (ver "Cadastrar os e-mails das áreas"); no modo local não há controle de acesso.' },

    { t: 'h', x: 'Tema claro, escuro ou automático' },
    { t: 'tut', titulo: 'Trocar o tema da tela', objetivo: 'Usar o app com fundo claro, escuro ou seguindo o sistema operacional.', quem: 'Qualquer usuário. A escolha é pessoal e fica guardada neste navegador.', pre: ['Nenhum.'], passos: [
      'Na barra superior, clique no botão de tema (ícone de sol/lua).',
      { x: 'Cada clique passa para o próximo: **Tema: automático** → **Tema: claro** → **Tema: escuro** → automático. Passe o mouse sobre o botão para ver o tema atual.', fig: '16-09' },
    ], resultado: 'Todas as telas mudam na hora. Na próxima abertura, neste navegador, o app volta com o mesmo tema.', atencao: 'O tema não acompanha a pessoa em outro computador ou navegador.', dica: 'No automático, o app segue o tema claro ou escuro do sistema operacional.' },
  ],
  glossario: [
    ['Modo local', 'App aberto pelo arquivo ls-pricer.html: dados só no navegador, sem login nem controle de acesso.'],
    ['Modo compartilhado', 'App aberto pelo endereço no claude.ai: dados no banco da equipe, com acesso verificado no banco.'],
    ['Dono do app', 'Quem publicou o app compartilhado; é o Administrador e o único que define responsáveis, aprovadores e restaura backup.'],
    ['Lixeira', 'Lugar das propostas excluídas, de onde podem ser restauradas ou apagadas de vez pelo administrador.'],
  ],
};

// ---- Cenários tributários ----
module.exports.capturas.push(
  { id: '16-10', nome: 'config-cenarios-tributarios', titulo: 'Cadastros → Fiscal → Cenários tributários (reforma)', novo: true,
    prep: async (p, h) => { await h.nav('cadastro'); await p.click('.areatabs [data-cad="fiscal"]'); await h.esperar(400); await h.cad('cenarios'); await h.topo(); },
    clip: '#app section.card:last-of-type', marcas: [] },
);
module.exports.conteudo.push(
  { t: 'h', x: 'Parâmetros fiscais: cenários da reforma tributária' },
  { t: 'p', x: 'Em **Cadastros** → **Fiscal** → **Cenários tributários (reforma)**, a área Fiscal cadastra os tributos e as regras de cada fase da reforma: quais tributos incidem, com qual alíquota, se entram por dentro do preço (como o ICMS hoje) ou por fora (somados ao preço, como o IPI e a CBS/IBS), o que sai da base de cada um e se geram crédito sobre o custo. As regras mudam a alíquota para casos específicos (UF, NCM, cadastro fiscal, família). Comece por **Cenário 2027 (rascunho pronto)** ou **Cenário em branco**.' },
  { t: 'fig', id: '16-10' },
  { t: 'nota', x: 'A formação oficial continua na planilha até a área Fiscal confirmar as regras: o cenário serve para comparar "hoje × cenário" em cada proposta, sem mudar o preço oficial.' },
);

// ---- Numeração e máscaras ----
module.exports.capturas.push(
  { id: '16-11', nome: 'config-numeracao', titulo: 'Administração → Numeração e máscaras (série de propostas SEQ ligada)', novo: true, alto: 1300,
    prep: async (p, h) => { await h.nav('config'); await h.cad('numeracao'); await p.selectOption('[data-numserie="seq"] [data-nm="ativa"]', '1'); await h.esperar(200); await h.topo(); },
    clip: '#app [data-numserie="seq"]', pad: 8,
    marcas: [
      { sel: '[data-numserie="seq"] [data-nm="ativa"]', txt: 'Série desligada (número digitado, o padrão) ou ligada (botão "gerar nº" na proposta).', pos: 'r' },
      { sel: '[data-numserie="seq"] [data-nm="prefixo"]', txt: 'Prefixo, ano (com reinício anual), separador, posições, início e sufixo formam a máscara.', pos: 'b' },
      { sel: '[data-numserie="seq"] [data-nm="bloqueio"]', txt: 'Número repetido: só avisar ou impedir a gravação.', pos: 't' },
      { sel: '[data-numserie="seq"] [data-nmprev]', txt: 'Prévia do primeiro número com a máscara.', pos: 't' },
    ] },
);
module.exports.conteudo.push(
  { t: 'h', x: 'Numeração e máscaras' },
  { t: 'p', x: 'Em **Configurações** → **Numeração e máscaras** (ou **Administração** → **Numeração e máscaras**, no menu), o administrador define uma série de numeração para as propostas SEQ (inclusive FACTS) e outra para as SPV: prefixo, ano no número (recomeça a cada ano, no formato AAAA ou AA), separador depois do ano, posições do sequencial, número inicial e sufixo. Exemplo: **SEQ-2026-00001**. Quem não é administrador vê só as séries ligadas, sem poder alterar; no modo compartilhado, a configuração fica num lugar do banco que só o Editor/dono grava.' },
  { t: 'fig', id: '16-11' },
  { t: 'lista', itens: [
    'As séries começam **desligadas**: o número da proposta continua digitado como hoje (ex.: 10.102). Nada é renumerado ao ligar uma série; propostas e códigos de insumo existentes não mudam.',
    'Com a série ligada, o campo **Nº da proposta** ganha o botão **gerar nº**. Ele reserva o próximo número no banco compartilhado, com trava: duas pessoas ao mesmo tempo nunca recebem o mesmo número. Números já usados em propostas salvas são pulados, e número reservado não é reaproveitado, mesmo que a proposta seja excluída. Salve a proposta para gravar o número nela.',
    'Número digitado que já está em outra proposta salva aparece com aviso ao lado do campo. Com **Número repetido: não deixa salvar**, a proposta só é gravada depois de trocar o número.',
    'A lista **Últimos números reservados** mostra o número, a série, quando e quem reservou.',
  ] },
  { t: 'nv', x: 'A reserva simultânea foi testada com o banco simulado (12 reservas ao mesmo tempo, sem repetição) e no modo local; no banco compartilhado real ela depende da trava do próprio banco, que é a mesma usada no teste.' },
);
