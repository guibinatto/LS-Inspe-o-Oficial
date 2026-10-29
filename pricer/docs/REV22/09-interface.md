# Navegação e interface (REV22)

Três pedidos: navegação (Itens e Memorial dentro da proposta SEQ), modernização da interface e preenchimento inteligente. Nenhuma fórmula, referência, arredondamento ou dado foi alterado: a regressão continua com 0 diferença (80 cenários e 6.216 valores do motor; 11 cenários de SPV/FACTS).

Capturas antes e depois: `interface/antes/` e `interface/depois/` (computador 1440×900 e celular 390×844, mesmas telas, mesma proposta de exemplo).

## 1. Navegação

| Antes | Depois |
|---|---|
| Barra superior com Início, Proposta, Itens, Memorial, Pendências, Documentos, Margens, Cadastro, Guia | Menu lateral com ícones: Início, Propostas, Pendências, Documentos, Margens, Cadastros, Configurações, Ajuda |
| Itens e Memorial apareciam mesmo sem proposta SEQ aberta (e numa SPV) | Itens e Memorial são abas **da proposta SEQ**: Dados gerais, Itens, Custos, Formação, Conferência, Memorial, Documentos, Histórico |
| SPV e FACTS com as mesmas entradas do SEQ | SPV e FACTS mostram só o que se aplica: Proposta e Histórico |
| Sistema (histórico, responsáveis, backup, planilha) dentro de Cadastro | Em **Configurações**; Cadastros fica só com os cadastros |
| Cabeçalho da proposta variava por tela | Cabeçalho de contexto fixo em todas as abas: divisão, número, cliente, revisão, situação, aprovação, valor total, margem (com o mínimo), custo, itens e pendências |

Preservado: dados, cálculos, propostas antigas (abrem como antes), permissões (as regras continuam no banco; nada passou a depender de esconder botão). Os endereços internos antigos (`item`, `memorial`, abas antigas de Cadastro) continuam funcionando e caem na aba nova correspondente. Se uma SPV estiver aberta e algo pedir Itens ou Memorial, o app volta para a proposta.

Correção feita durante os testes: depois de abrir Configurações, o botão Cadastros voltava para Configurações. Agora abre Cadastros em Insumos.

## 2. Interface

- Ícones Lucide (licença ISC) embutidos no arquivo (`icones.js`, 75 ícones), sem depender de internet.
- Menu lateral recolhível no computador (a escolha fica no navegador) e gaveta com fundo escurecido no celular (abre pelo ☰, fecha com ✕, toque fora ou Esc).
- Botões com ícone e texto; estados de carregamento (Salvar mostra o andamento), sucesso, erro e desabilitado.
- Tabelas com cabeçalho destacado e altura de linha uniforme; cartões e abas com indicador da situação de cada etapa (✓ concluída, • atenção, ! problema).
- Animações curtas de entrada de janelas e avisos; desligadas quando o sistema pede menos movimento.
- Tema claro, escuro ou automático (botão de tema na barra superior).
- Telas sem rolagem horizontal no celular; barra superior compacta em telas estreitas.
- Filtros do painel na tela inicial com o mesmo estilo dos demais campos.

## 3. Preenchimento inteligente

| Onde | O que mudou |
|---|---|
| Dados gerais (SEQ) | Cliente com lista dos clientes já usados; ao escolher um, recupera da última proposta dele o CNPJ, a UF, o cadastro fiscal e o segmento, **somente nos campos vazios**, e avisa o que foi recuperado |
| Itens | Quantidade com botões − e + |
| Ficha do insumo | Características com até 4 opções viram botões de escolha (com "—" quando opcional e "outro" para valor novo); campos de texto sugerem os valores já usados; ao escolher o modelo, preenche só as características **idênticas em todos os insumos do mesmo modelo** e só campos vazios; fabricante com lista |
| SPV | UF em lista; vendedor em lista; condição de pagamento e cliente com sugestões (o cliente conhecido preenche o contato vazio; a UF de uma SPV nova já começa preenchida com SC e não é trocada); visitas e meses com − e + |
| Pedidos de cadastro | Atendimento escolhe a situação do item (ativo, aguardando validação, aguardando preço); fabricante com lista |
| Pendências | Responsável com lista |
| Regras de configuração | Valores com as opções existentes |
| Kits | Marca com lista |

Nunca se preenche uma característica desconhecida: quando os insumos do mesmo modelo divergem, o campo fica vazio para a pessoa escolher.

## 4. Testes

Os 19 scripts de `tools/testes/` foram ajustados aos novos seletores (abas `.ptab` no lugar de `.step`, Sistema em Configurações) e passam sem erro de página. Ver `04-testes.md`.

## 5. Logo sem fundo branco

O menu lateral mostrava o logo dentro de uma placa branca. Agora o logo fica direto sobre o menu escuro, numa versão para fundo escuro (`logo-lsfire-escuro.png`: chama laranja igual, letras "FIRE" e "SISTEMAS DE COMBATE A INCÊNDIO" claras). Os PDFs (memorial, FCI, proposta SPV) continuam com o logo original, de letras escuras, guardado numa imagem oculta (`#logoPdf`). Se a empresa carregar um logo próprio em Configurações → Responsáveis, e-mails e logo, ele vale nos dois lugares e, no menu, volta a ter fundo branco (as cores de um logo qualquer não são conhecidas).

## 6. Correções feitas durante a verificação do manual

A execução de cada procedimento para as capturas do manual encontrou estes problemas, todos corrigidos sem mexer em fórmulas (regressão continua com 0 diferença):

| Problema | Correção |
|---|---|
| Com um item aberto, **Planilha completa** dava erro ("fs is not defined") e a tela não mudava | A visão completa do item abre normalmente |
| Mensagens citavam caminhos antigos ("Cadastro → Sistema → Backup", "Sistema → Histórico") | Passam a citar **Configurações → …** e **Cadastros → …** |
| Depois de abrir Configurações, o botão **Cadastros** voltava para Configurações | Abre Cadastros em Insumos |
| **+ Pessoa**/**×** dos responsáveis e incluir/excluir linhas da **Planilha (avançado)** só respondiam na tela Cadastros | Respondem em Configurações |
| Chip **Aguardando aprovação** (e a barra "Em aprovação" do painel) nunca mostravam nada | Mostram as propostas com situação "Aprovação com …"; **Em aberto** mostra tudo o que não está fechado, encerrado ou perdido |
| Botões "+ Peça", "+ Novo insumo" etc. mostravam dois sinais de mais (ícone e texto) | O ícone substitui o sinal escrito; os botões − e + das quantidades ficam sem ícone |
| Os botões de tipo da tela Início trocavam a proposta aberta sem avisar, mesmo com alterações não salvas | Perguntam antes, quando a proposta aberta foi alterada |
| O cabeçalho contava duas vezes as pendências automáticas (que repetem os itens da conferência) | Na SEQ, conta a conferência e só as pendências manuais |
| O Memorial mostrava as linhas de conferência ("Preço do item na Pricer", "Diferença (R$)") só com o nome | As linhas aparecem na tabela, com os valores |
| A versão enviada congelada aparecia como "rascunho" na lista de revisões | Aparece como enviada |
| No histórico, "Etapa da proposta", "Revisão", "Pendência", "Backup" e "Restauração" caíam no filtro "Cadastro" | Caem em "Propostas e alertas" e "Acessos" |
| Ao publicar estrutura, a janela dizia "Propostas com preços da época não mudam" | Diz a verdade: os preços da época congelam só os preços; a composição de quem monta pela estrutura muda (ver limitações) |
| Nas janelas, caixas de seleção esticavam a largura toda; a coluna Moeda das peças mostrava uma letra só | Tamanho próprio |
| Nova → SPV rolava até o quadro SEQ | Rola até os tipos de SPV |

## 7. Atualização mensal dos preços (preço vencido)

| Antes | Depois |
|---|---|
| Coluna "Cotação" na lista de insumos com a data da cotação ou da última gravação do insumo (mudar o fabricante "renovava" o preço) | Coluna **Preço atualizado em**: a mais recente entre a data da cotação e a data em que o **valor** mudou no cadastro (campo novo `precoEm`, gravado só quando o preço muda: ficha, edição em massa e importação; o desfazer do lote volta as duas coisas) |
| Validade padrão de 90 dias, aviso 15 dias antes | Validade padrão de **30 dias** (atualização mensal), aviso 5 dias antes. Se o banco da equipe já tiver um valor gravado em Custos → Validade e alertas, ele continua valendo até ser alterado ali |
| Sem visão do que está vencido no cadastro | Indicador **Preço vencido** (com "em uso" e "sem data"), faixa com **Ver os vencidos**, filtros "Preço vencido" e "Preço sem data de atualização", selo **vencido · N d** / **vence em N d** / **sem data**, ordenação do mais antigo ao mais novo |
| Aviso só por linha, na aba Custos ("cotação vencida") | Faixa **N insumo(s) desta proposta com preço vencido** no topo das abas **Custos** e **Formação**, com o botão **Atualizar no cadastro**, que abre a lista de insumos filtrada só nos insumos daquela proposta |

Regras: o aviso da proposta considera só as linhas com preço vindo do cadastro (não as digitadas na proposta) e não aparece em propostas com preços da época (enviadas, aprovadas, ganhas), que não usam o preço de hoje. Insumos sem nenhuma data (894 dos 938 do cadastro padrão, vindos da planilha REV21) aparecem como **sem data** e não contam como vencidos até receberem um preço novo. A regressão de cálculo continua com 0 diferença: nada disso muda valores, só datas e avisos.
