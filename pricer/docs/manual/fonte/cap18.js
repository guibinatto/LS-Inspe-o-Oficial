// Capítulo 18 — Exercícios práticos. Valores esperados conferidos no arquivo da REV22, modo local, cadastro padrão.
const E = (o) => Object.assign({ t: 'tut', rotulo: 'Exercício' }, o);
module.exports = {
  n: 18, titulo: 'Exercícios práticos', slug: 'exercicios',
  capturas: [],
  conteudo: [
    { t: 'p', x: 'Os exercícios usam a **proposta de exemplo** (Nova → **Exemplo SEQ (Cocamar)**), que já vem no sistema, e dados fictícios criados só para o treinamento. Os resultados esperados foram conferidos no arquivo desta revisão, com o cadastro padrão.' },
    { t: 'aviso', x: 'Faça os exercícios no **modo local** (arquivo ls-pricer.html aberto no computador, de preferência num navegador ou perfil separado). No modo compartilhado, tudo o que for salvo vai para o banco da equipe. Os exercícios 4, 5 e 6 mexem em cadastros: nunca os faça no ambiente compartilhado.' },
    { t: 'nota', x: 'Se o seu cadastro de preços for diferente do padrão (por exemplo, preços já atualizados pela equipe), os valores em R$ podem mudar. O caminho e as mensagens continuam os mesmos.' },
    E({ titulo: 'Criar uma proposta SEQ', objetivo: 'Criar uma proposta do zero, preencher os dados gerais e salvar.', quem: 'Qualquer participante do treinamento (modo local).', pre: ['Arquivo ls-pricer.html aberto.', 'Pelo menos um vendedor cadastrado em Cadastros → Precificação → Vendedores e agentes (num navegador novo a lista vem vazia: inclua um vendedor fictício, por exemplo "Vendedor Treino").'], passos: [
      'Clique em **Nova** e depois em **SEQ em branco**.',
      'Em **Dados gerais**, preencha o cliente fictício "CLIENTE TREINAMENTO LTDA", a obra "Obra de treinamento", a UF, o cadastro fiscal e o segmento.',
      'Preencha o cartão **Proposta** (número fictício, revisão, data, validade, condição de pagamento, norma) e escolha o vendedor.',
      'Clique em **Salvar**.',
      'Volte à tela **Início** e procure "TREINAMENTO" na busca.',
    ], resultado: 'A barra superior mostra "✓ Salvo às …" e a proposta aparece na lista de propostas da tela Início.', criterio: 'A proposta abre de novo pelo botão **Abrir** com os mesmos dados, sem "Falta: …" no fim de Dados gerais.' }),
    E({ titulo: 'Configurar um conjunto motobomba', objetivo: 'Acrescentar um item pela família e por um modelo pronto e ver os componentes que a estrutura monta.', quem: 'Qualquer participante.', pre: ['Proposta do exercício 1 aberta.'], passos: [
      'Abra a aba **Itens** e comece um item novo.',
      'Escolha a família do conjunto motobomba e, no cartão **Equipamento**, um modelo pronto (por exemplo, um "CMB DIESEL").',
      'Confira os cartões **Condições deste item** e **Componentes do item**: as linhas vêm da estrutura da família.',
      'Ajuste a **Quantidade** com os botões − e +.',
      'Salve a proposta.',
    ], resultado: 'O item mostra preço calculado e os componentes montados pela estrutura; o cabeçalho de contexto atualiza valor total, margem, custo e itens.', criterio: 'O participante sabe dizer de onde vêm os componentes (estrutura da família, capítulo 9) e onde ver alertas do item (aba Conferência).' }),
    E({ titulo: 'Consultar custos, simulador e memorial', objetivo: 'Ler a formação de preço da proposta de exemplo e testar uma negociação sem alterar a proposta oficial.', quem: 'Qualquer participante.', pre: ['Nova → **Exemplo SEQ (Cocamar)** carregado.'], passos: [
      'Na aba **Formação**, no **Simulador**, digite 4.000.000,00 em "ou valor final negociado (com IPI)" e clique em **Simular**.',
      'Observe o cabeçalho de contexto: o **Valor total** continua o da proposta.',
      'Abra a aba **Memorial** e vá até o bloco **CONFERÊNCIA CONTRA AS ABAS DE ITEM**.',
    ], resultado: 'Simulação com margem de 29,0%, desconto global de 6,1% e o aviso de que precisa de aprovação (mínimo de 30%). O cabeçalho continua em R$ 4.258.300,00. No Memorial, "Preço do item na Pricer (sem IPI)" do ITEM 02 é 430.514,16 e "Diferença (R$)" é 0,00 em todas as colunas.', criterio: 'O participante explica por que a simulação não muda a proposta oficial e onde conferir que o memorial bate com os itens.' }),
    E({ titulo: 'Cadastrar um insumo sem criar duplicidade', objetivo: 'Usar a ficha guiada do insumo e ver a verificação de duplicidade em ação.', quem: 'No modo compartilhado, Editor da área Custos ou Cadastro geral. No treinamento, modo local.', pre: ['Modo local.'], passos: [
      'Abra **Cadastros** → **Custos** → **Insumos e preços** e clique em **+ Novo insumo**.',
      'Escolha a família 01.MOTORDIESEL, digite o modelo 6M16G308/6 e saia do campo com Tab.',
      'Marque RADIADOR e MEC.',
      'Clique em **Cadastrar**.',
    ], resultado: 'O quadro de duplicidade mostra "Mesmo produto · 01-1002". Ao cadastrar, aparece "Já existe 01-1002 com mesma descrição…" e nada é gravado.', criterio: 'O participante explica por que duas descrições iguais são um problema (as fórmulas pegam sempre o primeiro insumo com o mesmo nome).' }),
    E({ titulo: 'Verificar uma descrição padronizada', objetivo: 'Encontrar insumos pela busca com sinônimos e reconhecer o padrão de descrição da família.', quem: 'Qualquer participante.', pre: ['Modo local.'], passos: [
      'Em **Cadastros** → **Custos** → **Insumos e preços**, filtre a família 10.MOTORELETRICO.',
      'Busque "IPW55".',
      'Abra **Cadastros** → **Cadastro geral** → **Padronização de descrições** e leia o modelo da família de motores elétricos.',
    ], resultado: 'A lista mostra "139 de 938 insumos", todos com IP55 no nome: a busca trocou o sinônimo IPW55 pela grafia padrão.', criterio: 'O participante identifica as partes da descrição padronizada de um motor elétrico e sabe que o sinônimo serve só para a busca (o nome gravado não muda).' }),
    E({ titulo: 'Editar uma estrutura em rascunho (ambiente seguro)', objetivo: 'Ver o impacto de uma mudança de estrutura nos modelos prontos antes de publicar, e descartar a mudança.', quem: 'No modo compartilhado, Editor da área Engenharia. No treinamento, só modo local.', pre: ['Modo local, num navegador separado.'], passos: [
      'Abra **Cadastros** → **Engenharia** → **Estruturas**, estrutura Conjunto motobomba, e marque **editar em rascunho**.',
      'Abra o componente **Sensores**, mude para "Opcional: marcado no item" e **Salvar**.',
      'Clique em **Ver diferenças e impacto** e espere o teste terminar.',
      'Clique em **Descartar rascunho** e confirme.',
    ], resultado: 'O impacto mostra "60 de 72 modelo(s) pronto(s) mudam" e o CMB DIESEL 1500 USgpm de R$ 316.071,95 para R$ 314.367,95. Depois de descartar, a estrutura publicada fica como estava.', criterio: 'Nada foi publicado: o Testador de estruturas, com o modelo "CMB DIESEL 1500 USgpm — 2 BOMBAS (PTC 10.116)", continua mostrando R$ 316.071,95.', atencao: 'Não clique em **Publicar** no exercício. As tabelas por porte gravam direto, mesmo em rascunho: não as altere no treinamento.' }),
    E({ titulo: 'Elaborar uma proposta SPV', objetivo: 'Montar um serviço em campo e ver o efeito do deslocamento e do multiplicador no preço.', quem: 'Qualquer participante.', pre: ['Modo local.'], passos: [
      'Na tela **Início**, clique em **Serviço em campo**.',
      'Digite 300 em **Distância até o local (só ida, km)**.',
      'Mude o **Multiplicador** para 2.',
      'Clique em **aplicar** no aviso de lucro.',
    ], resultado: 'Ao abrir: Preço R$ 9.885,00 e Lucro líquido 50,7%. Com 300 km: custo da prestação R$ 4.915,00 e preço R$ 14.745,00. Com multiplicador 2: aviso de lucro líquido de 34,1%, abaixo do mínimo de 40%, com o botão "aplicar 2,28".', criterio: 'Depois de aplicar, o selo de lucro deixa de mostrar "abaixo de 40%".' }),
    E({ titulo: 'Consultar pendências e margens', objetivo: 'Ver pendências automáticas se resolverem e dar baixa numa proposta para ler a margem fechada.', quem: 'Qualquer participante (no modo compartilhado, dar baixa exige acesso de gravação).', pre: ['Modo local, com a proposta de exemplo.'], passos: [
      'Carregue o **Exemplo SEQ (Cocamar)** e clique em **Salvar**.',
      'Abra **Pendências** → **Acompanhamento**: confira as pendências abertas, entre elas "Falta preencher: CNPJ/CPF".',
      'Volte à proposta, preencha o CNPJ fictício 11.222.333/0001-81 em **Dados gerais** e salve.',
      'Em **Pendências**, escolha o filtro "Resolvidas e não se aplica".',
      'Na tela **Início**, marque a proposta como enviada e dê baixa com **Valor fechado** 4.000.000,00.',
      'Abra **Margens** → aba **Fechadas**.',
    ], resultado: 'Após salvar o exemplo, há 4 pendências abertas. Depois do CNPJ, "Falta preencher: CNPJ/CPF" aparece como Resolvida, com "Resolvida automaticamente: a falha não aparece mais na conferência." Na baixa, a prévia mostra "a margem vai de 33,2% para 29,0% (desconto de 6,1%)" e a aba Ganhas mostra margem fechada de 29,0%.', criterio: 'O participante sabe onde ver o que depende dele (Pendências) e onde acompanhar o resultado das propostas fechadas (Margens).' }),
  ],
};
