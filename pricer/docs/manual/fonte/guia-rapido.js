// Guia rápido de consulta (versão resumida do manual MN · LS Pricer).
module.exports = {
  intro: [
    { t: 'p', x: 'Consulta rápida das rotinas mais usadas do **LS Pricer REV22**. O passo a passo completo, com as telas anotadas, está nos manuais, com o capítulo entre parênteses: **MU** = Manual do Usuário, **MA** = Manual do Administrador.' },
  ],
  secoes: [
    { titulo: 'Onde fica cada coisa', fig: '01-02', blocos: [
      { t: 'tab', cab: ['Menu lateral', 'Para quê'], lin: [
        ['Início', 'Busca, começar proposta SEQ ou SPV, painel, lista de propostas e próximas etapas (cap. 2 e 14)'],
        ['Propostas', 'A proposta aberta, com as abas dela (cap. 3 a 6)'],
        ['Pendências', 'Acompanhamento e Minhas pendências (cap. 13)'],
        ['Margens', 'Ganhas, em andamento, aprovações, custo real e gráficos (cap. 13 e 14)'],
        ['Cadastros', 'Visão geral, Custos, Engenharia, Fiscal, Precificação, Serviços e Cadastro geral (cap. 7 a 11)'],
        ['Configurações', 'Histórico, responsáveis e e-mails, backup e restauração, planilha avançada (cap. 16)'],
        ['Ajuda', 'Guia de campos da planilha original'],
      ] },
      { t: 'tab', cab: ['Abas da proposta SEQ', 'O que fazer'], lin: [
        ['Dados gerais', 'Cliente, obra, UF, cadastro fiscal, segmento, número, revisão, pagamento, norma, vendedor e comissões'],
        ['Itens', 'Família, modelo, condições, componentes e quantidade de cada equipamento'],
        ['Custos', 'Origem, data e validade dos preços; "não se aplica"'],
        ['Formação', 'Preço por item, Negociar (desconto, margem ou valor final) e cenários avançados'],
        ['Conferência', 'Impeditivos, alertas, pedido de aprovação, conferência do PDF'],
        ['Memorial', 'Memorial de formação para o financeiro, por item e total'],
        ['Documentos', 'Proposta técnica e comercial (PDF no modelo LS Fire), documentos ligados, memorial em PDF, FCI; **Anexar ou ver todos os documentos** abre a biblioteca'],
        ['Histórico', 'Tudo o que aconteceu com a proposta'],
      ] },
      { t: 'nota', x: 'Na SPV e no FACTS, a proposta tem só duas abas: **Serviço e pós-venda** (ou **FACTS**) e **Histórico**.' },
    ] },
    { titulo: 'Rotinas mais usadas', blocos: [
      { t: 'tab', cab: ['Rotina', 'Caminho'], lin: [
        ['Nova proposta SEQ', 'Início → botão da família, ou **Nova** → **SEQ em branco** (cap. 3)'],
        ['Nova SPV', 'Início → tipo de serviço, ou **Nova** → **SPV** (cap. 6)'],
        ['Abrir proposta salva', '**Abrir** na barra superior, ou a lista da tela Início (cap. 3)'],
        ['Duplicar', 'Lista da tela Início → **Duplicar**; dê um número novo e salve (cap. 3)'],
        ['Negociar desconto ou margem', 'Clique na **Margem** do topo da proposta → cartão **Negociar** → atalho ou valor → **Aplicar à proposta** (cap. 4)'],
        ['Versão interativa (HTML)', 'Aba **Documentos** → **Versão interativa (HTML)** (cap. 20)'],
        ['Importar proposta antiga', '**Nova** → **Importar proposta antiga (planilha + PDFs)** (cap. 19)'],
        ['Pedir aprovação de valor target', 'Aba **Conferência** → pedido de aprovação (cap. 13)'],
        ['Nova revisão', 'Selo da revisão no cabeçalho → **Revisar**, com o motivo (cap. 15)'],
        ['Comparar revisões', 'Selo da revisão → escolha a revisão → **Comparar** (cap. 15)'],
        ['Gerar a proposta (técnica e comercial, comercial ou técnica; PT, EN ou ES; R$ ou US$)', 'Proposta → aba **Documentos** → escolha documento, idioma e moeda → **Gerar proposta (PDF)** (cap. 5)'],
        ['Folha de dados e curva da bomba na proposta', 'Item → **Proposta: código do produto e folha de dados** → solte o PDF (cap. 5)'],
        ['Mudar estrutura, imagens, textos padrão e contatos da proposta', 'Configurações → **Modelo da proposta** (cap. 5)'],
        ['Dar baixa (ganha/perdida)', 'Tela Início → próxima etapa da proposta (cap. 14)'],
        ['Lançar custo real', 'Margens → proposta ganha → Custo real (cap. 14)'],
        ['Cadastrar insumo', 'Cadastros → Custos → Insumos e preços → **+ Novo insumo** (cap. 7)'],
        ['Atualizar preços vencidos (mensal)', 'Cadastros → Custos → Insumos e preços → **Ver os vencidos**; ou, na proposta, **Atualizar no cadastro** (cap. 7)'],
        ['Pedir cadastro de insumo', 'No item ou na SPV, botão **pedir cadastro** (cap. 7)'],
        ['Mudar estrutura', 'Cadastros → Engenharia → Estruturas, **editar em rascunho** → **Ver diferenças e impacto** → **Publicar** (cap. 9)'],
        ['Backup', 'Configurações → Backup e restauração → **Baixar backup completo** (cap. 16)'],
        ['Restaurar proposta excluída', 'Configurações → Backup e restauração → Lixeira (cap. 15)'],
      ] },
    ] },
    // passo a passo com telas: uma rotina por quadro, com a tela anotada (mesmas figuras dos manuais)
    { titulo: '1. Começar uma proposta', fig: '03-01', ordem: 1, blocos: [
      { t: 'lista', itens: [
        'Clique em **Nova** (barra superior).',
        'Escolha **SEQ em branco**, **SPV**, o **Exemplo SEQ (Cocamar)** ou **Importar proposta antiga**.',
        'Na proposta nova, pagamento, norma, frete e validade já vêm da sua última proposta: confira.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 3.' },
    ] },
    { titulo: '2. Dados gerais', fig: '03-04', ordem: 2, blocos: [
      { t: 'lista', itens: [
        'Preencha o cartão **Cliente** (o CNPJ pode buscar na Receita).',
        'No cartão **Proposta**, informe o número; use os atalhos **15**, **30** ou **60 dias** da validade.',
        'Escolha o vendedor e a modalidade de frete e clique em **Próximo**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 3.' },
    ] },
    { titulo: '3. Configurar o equipamento', fig: '04-07', ordem: 3, blocos: [
      { t: 'lista', itens: [
        'Em **Itens**, clique em **+ Adicionar item** e escolha a família.',
        'Escolha um modelo pronto (pesquisa e filtro) ou monte o item.',
        'Siga **Configurar → Compor → Conferir** e clique em **Incluir na proposta**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 4.' },
    ] },
    { titulo: '4. Negociar desconto ou margem', fig: '04-04', ordem: 4, blocos: [
      { t: 'lista', itens: [
        'Clique na **Margem** do resumo no topo da proposta.',
        'No cartão **Negociar**, clique em **Margem mínima (30%)** ou num desconto pronto, ou digite o valor final.',
        'Compare **Proposta agora** × **Simulação** e clique em **Aplicar à proposta**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 4.' },
    ] },
    { titulo: '5. Conferir antes de enviar', fig: '04-05', ordem: 5, blocos: [
      { t: 'lista', itens: [
        'Abra a aba **Conferência**.',
        'Em cada linha, clique em **Ir** e corrija ou justifique.',
        'Fora da política: **Pedir aprovação (valor target)**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 4.' },
    ] },
    { titulo: '6. Gerar a proposta e a versão interativa', fig: '20-01', ordem: 6, blocos: [
      { t: 'lista', itens: [
        'Abra a aba **Documentos** e escolha documento, idioma e moeda.',
        'Clique em **Gerar proposta (PDF)**, em **Técnica + Comercial (2 PDFs)** ou em **Versão interativa (HTML)**.',
        'No app publicado, confirme **Salvar arquivo**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 20.' },
    ] },
    { titulo: '7. A versão interativa aberta', fig: '20-04', ordem: 7, blocos: [
      { t: 'lista', itens: [
        'Abra o arquivo "_interativa.html" no navegador ou no celular.',
        'O botão **PDF oficial** baixa o PDF que vale; o rodapé mostra o SHA-256 dele.',
        'Para mandar por link, publique o arquivo num endereço da LS Fire.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 20.' },
    ] },
    { titulo: '8. Proposta de serviço (SPV)', fig: '06-15', ordem: 8, blocos: [
      { t: 'lista', itens: [
        'Na SPV, abra **Para o documento da proposta → Execução do serviço**.',
        'Preencha equipe e duração e marque segurança, responsabilidades, entregáveis e, se for o caso, sistema fora de operação.',
        'Marque **Termos e condições em anexo** e gere o PDF (sai também o dos termos).',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 6.' },
    ] },
    { titulo: '9. Importar proposta antiga', fig: '19-02', ordem: 9, blocos: [
      { t: 'lista', itens: [
        '**Nova** → **Importar proposta antiga (planilha + PDFs)**.',
        'Escolha a planilha e os PDFs de uma vez e confira a prévia.',
        'Escolha qual preço manter e clique em **Criar a proposta**; depois, salve.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 19.' },
    ] },
    { titulo: '10. Pendências', fig: '13-01', ordem: 10, blocos: [
      { t: 'lista', itens: [
        'Menu **Pendências** → **Acompanhamento**.',
        'Clique em **Abrir** para ver e atualizar uma pendência.',
        'As automáticas se resolvem sozinhas quando a falha some.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 13.' },
    ] },
    { titulo: '11. Revisar a proposta', fig: '15-01', ordem: 11, blocos: [
      { t: 'lista', itens: [
        'No cabeçalho, clique em **Revisar** e escreva o motivo.',
        'Pelo selo **Rev. N**, veja, compare e restaure revisões.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 15.' },
    ] },
    { titulo: '12. Cadastrar um insumo (administrador)', fig: '07-20', ordem: 12, blocos: [
      { t: 'lista', itens: [
        '**Cadastros** → **Custos** → **Insumos e preços** → **+ Novo insumo**.',
        'Preencha a ficha por abas; confira o aviso de itens parecidos.',
        'Clique em **Cadastrar**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 7.' },
    ] },
    { titulo: '13. Estruturas (administrador)', fig: '09-04', ordem: 13, blocos: [
      { t: 'lista', itens: [
        '**Cadastros** → **Engenharia** → **Estruturas**.',
        'Edite em **rascunho**, veja **diferenças e impacto** e **Publicar**.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 9.' },
    ] },
    { titulo: '14. Perfis, backup e numeração (administrador)', fig: '16-03', ordem: 14, blocos: [
      { t: 'lista', itens: [
        '**Configurações**: perfis e permissões, e-mails das áreas, backup e restauração.',
        '**Administração** → **Numeração e máscaras** para ligar a série de propostas.',
      ] },
      { t: 'nota', x: 'Passo a passo completo: cap. 16.' },
    ] },
    { titulo: 'Atalhos e sinais', blocos: [
      { t: 'tab', cab: ['Atalho ou sinal', 'Significado'], lin: [
        ['Ctrl+S', 'Salvar a proposta'],
        ['Esc', 'Fechar a janela aberta ou o menu do celular'],
        ['● Alterações não salvas', 'Há mudanças ainda não gravadas: clique em Salvar'],
        ['✓ Salvo às …', 'Proposta gravada'],
        ['✓ / • / ! nas abas', 'Etapa concluída / pede atenção / tem problema'],
        ['Margem em vermelho no cabeçalho', 'Abaixo da margem mínima da política'],
        ['Botão Recolher (menu lateral)', 'Deixa o menu só com ícones; no celular, use ☰'],
      ] },
    ] },
    { titulo: 'Erros frequentes', blocos: [
      { t: 'tab', cab: ['Mensagem', 'O que fazer'], lin: [
        ['"Preencha o cabeçalho antes do equipamento" / "Falta: …"', 'Preencha os campos obrigatórios (*) de Dados gerais'],
        ['"Nenhum vendedor cadastrado…"', 'Cadastros → Precificação → Vendedores e agentes → **Incluir**'],
        ['"… não está no cadastro de insumos; entra com custo zero."', 'Escolha o insumo pela lista ou peça o cadastro'],
        ['"Margem X abaixo do mínimo de Y"', '**Ajustar à margem mínima** ou pedir aprovação'],
        ['"N item(ns) da conferência impedem enviar."', 'Resolva os impeditivos na aba Conferência'],
        ['"A aprovação perdeu a validade…"', '**Pedir de novo (novo valor target)**'],
        ['"N insumo(s) desta proposta com preço vencido"', '**Atualizar no cadastro** e atualizar o preço (validade de 30 dias)'],
        ['"Já existe … com mesma descrição."', 'Use o insumo existente ou diferencie a descrição'],
        ['"Outra pessoa salvou esta proposta"', 'Escolha guardar a versão dela como revisão, salvar a sua como cópia ou descartar a sua'],
      ] },
      { t: 'aviso', x: 'No modo local (arquivo aberto no computador) não há login nem controle de acesso, e os dados ficam só naquele navegador. Use o endereço compartilhado da equipe para o trabalho real.' },
    ] },
  ],
};
