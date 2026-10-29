# Navegação e interface (REV22)

Três pedidos: navegação (Itens e Memorial dentro da proposta SEQ), modernização da interface e preenchimento inteligente. Nenhuma fórmula, referência, arredondamento ou dado foi alterado: a regressão continua com 0 diferença (80 cenários e 6.216 valores do motor; 11 cenários de SPV/FACTS).

Capturas antes e depois: `interface/antes/` e `interface/depois/` (computador 1440×900 e celular 390×844, mesmas telas, mesma proposta de exemplo).

## 1. Navegação

| Antes | Depois |
|---|---|
| Barra superior com Início, Proposta, Itens, Memorial, Pendências, Documentos, Margens, Cadastro, Guia | Menu lateral com ícones: Início, Propostas, Pendências, Margens, Cadastros, Configurações, Ajuda (Documentos saiu do menu: abre pela proposta, pela ficha do insumo e pelo botão ao lado da busca da tela Início) |
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

## 8. Trilha de etapas da proposta (tela Início)

| Antes | Depois |
|---|---|
| 1ª etapa "Formação" sempre marcada, mesmo sem nada conferido | **Conferência ok**: ✓ só quando a conferência gravada ao salvar não tem impeditivos nem avisos; ◐ com avisos; ! com impeditivos |
| 2ª etapa "PDF conferido" vazia, sem explicação, mesmo com a proposta já fechada | **Finalizada** (PDF conferido). Se ficou para trás sem ser feita, aparece **tracejada (–)** como etapa pulada |
| Situação "Rascunho" | **Em aberto** (as demais seguem: Aprovação com…, Enviada ao cliente, Fechada, Encerrada, Perdida) |
| A etapa destacada podia ser uma lá de trás (ex.: em proposta fechada, a conferência) | A destacada é a primeira em aberto **depois da última concluída** |
| No celular, o nome da 1ª etapa saía cortado | Nome alinhado à borda |

## 9. Documentos fora do menu principal

A tela **Documentos** saiu do menu lateral, que ficou com 7 entradas. Nada foi apagado: a biblioteca continua igual e abre por três atalhos — **Anexar ou ver todos os documentos** (aba Documentos da proposta SEQ), **Todos os documentos** (ficha do insumo) e o botão **Documentos (N)** ao lado da busca da tela Início. Com uma proposta aberta, a tela mostra **Voltar à proposta**.

## 10. Fases da proposta com um nome só, e botões da linha

As fases passam a ser as mesmas em todo o app — situação da linha e do cabeçalho, chips de filtro, painel da tela Início, etapas e menu Margens:

**Em aberto → Em aprovação → Enviada ao cliente → Ganha → Encerrada**, ou **Perdida**.

| Antes (nomes diferentes para a mesma coisa) | Depois |
|---|---|
| Rascunho / Em elaboração / Em aberto | **Em aberto** |
| Aprovação com … / Aguardando aprovação / Desconto aprovado · falta aplicar | **Em aprovação** (detalhe: "· com Diretoria e Financeiro", "· aprovada, falta aplicar") |
| Desconto reprovado / Aprovação perdeu a validade | **Em aberto** · desconto reprovado / · aprovação perdeu a validade |
| Enviada / Enviada ao cliente / Em negociação | **Enviada ao cliente** (detalhe "· em negociação") |
| Fechada / Fechadas / Fechada (baixa) / Ganha | **Ganha** (etapa "Ganha (baixa)"; aba e cartão "Ganhas" no menu Margens) |
| Aba e cartão "Em aberto" do menu Margens (tudo o que não fechou) | **Em andamento** (= Em aberto + Em aprovação + Enviada ao cliente) |

Chips da tela Início: Todas, SEQ, SPV, Em aberto, Em aprovação, Enviadas ao cliente, Ganhas, Perdidas, Falta avisar financeiro, Falta avisar engenharia, Falta custo real. Um filtro salvo com o nome antigo continua funcionando.

Linha da proposta: os botões ficam num grupo alinhado — próximo passo (destacado), **Revisar** (novo: abre a proposta e a janela de nova revisão; aparece em Em aberto, Em aprovação e Enviada ao cliente), **Abrir**, **Duplicar** e **Perdida** (antes um link solto, desalinhado). O símbolo de etapa em andamento passou de ◐ para •, que não sai cortado.

## 11. Custo real por quantidade e valor unitário; Reabrir

- **Custo real**: cada linha passa a ter **Quantidade** (prevista × usada) e **Valor unitário com impostos** (previsto × real); o **total real é calculado** pelo app (quantidade usada × unitário real) e a diferença também. **✓ igual** confirma quantidade e unitário previstos. A leitura de NF grava a quantidade da nota e o unitário (total ÷ quantidade). Lançamentos antigos, feitos só pelo total, continuam valendo (a quantidade aparece igual à prevista e o unitário sai do total). O Excel "previsto × realizado" ganhou as colunas de quantidade e unitário.
- **Reabrir**: na linha das propostas Ganhas e Encerradas da tela Início (e em Custo real, "Reabrir (desfazer baixa)"). Pede o motivo, avisa se há custo real lançado, guarda uma cópia da baixa e do custo real dentro da proposta (`baixasDesfeitas`) e volta a proposta para Enviada ao cliente. Antes, "Desfazer baixa" ficava só no Custo real e apagava a baixa sem cópia.

## 12. Proposta técnica e comercial gerada pelo app (modelo PTC)

- **Onde**: aba **Documentos** da proposta SEQ; na SPV e no FACTS, o cartão fica acima da conferência do PDF. Botão **Gerar proposta (PDF)**.
- **O que sai** (mesmo visual das PTC 10.102, 10.116, 10.131 e 10.259: Montserrat e Roboto Mono, laranja LS Fire, cabeçalho com cliente/data/número/validade e rodapé da empresa): capa, Conheça a LS Fire, Soluções LS Fire, Planilha de preços, Condições, Folha de dados por item, Comissionamento e start-up, Notas desvios e observações, Prazos e condições, Escopo de documentos, Termos e condições (28 cláusulas) e Contatos. Serviço e peças seguem a PTC de serviço (planilha de preços e condições juntas, notas e desvios).
- **De onde vêm os números**: planilha PROPOSTA linhas 33–42 (código, qtd, NCM, PIS, COFINS, ICMS, IPI, preço unitário e total com impostos e IPI) e P43 (total); descrição breve = C27 e completa = C29 de cada item; condição de projeto = vazão × pressão das bombas (K/L 23–26); folha de dados = componentes das linhas 34–63 e 68–112 (marca e modelo do cadastro de insumos; famílias internas como base, mão de obra e embalagem ficam fora); start-up = K12/F12. SPV e FACTS: `propostaDados()` em spv.js e facts.js, a partir do mesmo cálculo da tela. Nenhuma fórmula foi alterada (regressão REV21: 0 diferença).
- **O que é da proposta** (salvo em `propCom`, junto com a proposta e nas revisões): cliente no topo, razão social, CNPJ, aos cuidados de, projeto/obra, cidade, código do produto (ERP) por item, notas da folha de dados, condição de pagamento, prazos de fabricação e entrega (DAPC/DAE), frete, observações, notas, desvios, exclusões, seções e contatos. Cada campo alterado tem "voltar ao padrão".
- **Textos padrão**: Configurações → **Modelo da proposta** (tabela `PROPOSTA_MODELO`), com contatos e todos os textos; linhas com condição ([diesel], [eletrica], [start-up], [sem start-up], [contrato], [campo], [fabrica]) e marcadores ({norma}, {certificacao}, {meses}, {visitas}, {diarias}). Textos de origem: `tools/proposta/textos-base.js` e `tools/proposta/termos.json`; imagens e fontes em `templates/proposta/` (gerados por `tools/proposta/gerar.py`).
- **Conferência automática**: com a proposta salva e sem alterações pendentes, o PDF gerado passa pela conferência do PDF (conferencia.js) e, se bater, é guardado nos documentos e a proposta fica "conferida ✓".
- **Limites**: o app não tem o código do produto do ERP, a curva da bomba, sucção/recalque, vedação e pintura; esses dados não saem na folha de dados (o código é digitado por item). Testes: `prop_test`, `prop_spv_test`, `prop_modelo_test`.

## 13. Resultado consolidado e origem do pacote

- **Layout** (planilha completa da proposta → Resultado consolidado): o cartão ocupa a largura toda, em três blocos (Custos · Impostos, comissão e margem · Preço, IPI e origem), com mais espaço entre as linhas; Demonstrativo e Fora do preço lado a lado embaixo. Corrigido também o defeito que trocava rótulo e valor de lado depois de cada separador (ICMS e as linhas seguintes apareciam alinhadas à direita e em negrito).
- **Origem do conjunto (pacote)**: a fórmula MEMORIAL!M29 devolvia "MISTO" quando havia itens nacionais e importados. Agora segue a regra da FCI aplicada ao pacote: conteúdo de importação consolidado (MEMORIAL!M30) acima de LIMITE_CI (PARÂMETROS!C9, 40%) = IMPORTADO, senão NACIONAL; sem itens, "—". Impacto verificado: M29 só é usada por PROPOSTA!E69 (exibição); a origem e o ICMS de cada item continuam vindo da FCI do item (P33). Regressão REV21: 0 diferença. No exemplo, a origem do pacote passa de MISTO para IMPORTADO (CI 45,00%).

## 14. Onde fica "Gerar proposta (PDF)" e o resumo do topo

- Na **visão planilha** (botão do topo "Visão guiada"), clicar numa aba da proposta (Dados gerais, Itens… Documentos) não mudava nada: a tela continuava na planilha completa. Agora a aba abre a etapa na visão guiada; o cartão **Proposta técnica e comercial** também aparece no fim da planilha completa.
- Resumo do topo (valor total, margem, custo, itens, pendências): rótulos, valores e linha de apoio alinhados na mesma altura em todas as colunas (antes, as colunas sem linha de apoio ficavam centralizadas e desalinhadas); "com IPI" sob o valor total.

## 15. Proposta v2: tipos, idiomas, moeda, folha de dados e modelo editável

- **Cabeçalho só para leitura** no cartão da proposta: cliente, razão social, CNPJ, obra, número, revisão, datas, pagamento e frete vêm de Dados gerais e da formação, com o botão "Alterar em Dados gerais" (na SPV, "Alterar nos dados da proposta"). O que não existe na formação (nome do cliente no topo, aos cuidados de, cidade da obra, prazos de fabricação/entrega, observações) fica no cartão **Para o documento da proposta** de Dados gerais (e na SPV, acima do cartão). A SPV ganhou CNPJ e Código do serviço (ERP).
- **Item**: bloco **Proposta: código do produto e folha de dados**, com código do ERP, notas do item e três arquivos: folha de dados da bomba, folha de dados do motor (lidas no navegador: vazão, altura, rotação, rotor, NPSH, sucção, recalque, vedação, potência, tensão, polos, IP…; com "Ler com Claude" quando disponível) e curva da bomba (PDF ou imagem; a página escolhida entra na folha de dados). Os arquivos ficam nos documentos da proposta.
- **Três tipos**: técnica e comercial (PTC), comercial (PC) e técnica (PT, sem preços: "Escopo de fornecimento"). **Três idiomas** (rótulos e textos padrão traduzidos com o app; descrições e textos da proposta traduzidos na hora pelo Claude, com revisão no cartão; números da formação no formato do idioma). **Moeda**: real ou dólar, com taxa (padrão: câmbio do cadastro) e data, e nota de conversão no PDF; a formação continua em reais. A conferência automática roda na versão em português e em real; as outras vão para os documentos.
- **Modelo da proposta**: estrutura (ordem das seções e o que entra em cada tipo), imagens (trocar, tamanho %, alinhamento, deslocamento), contatos e textos em português, inglês e espanhol, com aviso quando o português muda e a tradução não.
- Arquivos: `proposta.js` (seções, idiomas, moeda, imagens, leitor de folha de dados), `tools/proposta/textos-{en,es}.json` e `termos-{en,es}.json`, `leitor.js` (`partes`, `paginaImagem`). Nenhuma fórmula mudou (regressão REV21: 0 diferença).

## 16. Proposta no padrão Folha de dados (novo)

- Opção **Padrão** no cartão da proposta: **Clássico (PTC)** ou **Folha de dados (novo)** (`propCom.estilo = 'fd'`), gerado por `proposta-express.js`.
- Layout inspirado nas folhas de dados de fabricante (Peerless Express), nas cores LS Fire: faixa de título escura com marca laranja, seções em faixas cinza com pares rótulo/valor em duas colunas, curva recortada, desenhos (página em paisagem quando o original é paisagem) e escopo em tabelas Qtd | Descrição com recuo por nível.
- No item, **Folha de dados completa do fabricante** (`propCom.fd[item].fab`): o PDF é lido por posição do texto (`PricerLeitor.itensPdf` + `fabricante.js`): seções, campos, tabelas numéricas, páginas de curva (área do gráfico recortada), desenhos e escopo por grupo. A pessoa marca/desmarca campos, corrige valores, escolhe a curva, as páginas que entram como imagem e se o escopo inclui os itens da formação LS Fire.
- Conferência com a formação: vazão e altura nominais da folha comparadas com o item (aviso acima de 2% e 3%).
- Tradução: dicionário fixo de rótulos e valores do fabricante (pt/es); o restante vai ao Claude (do inglês) quando disponível. Números no formato do idioma, com equivalente métrico (USgpm→m³/h, in→mm, psi→bar, lb→kg, hp→kW).
- A conferência automática do PDF lê até 40 páginas (antes 8) para alcançar a planilha e o escopo deste padrão.
- Testes: `tools/testes/fd_test.js` (precisa de `FD_PDF` com o caminho de uma folha do fabricante).

## 17. Especificação por componente e famílias 46/47

- Famílias padrão 46 TESTESENSAIOS e 47 DOCUMENTOSDESENHOS (`FAM_PADRAO`; excluir grava vazio por cima).
- Cartão de especificação no item para famílias 35 (pintura especial), 46 e 47 (`propCom.espec[item][família]`), alerta "Especificar" enquanto faltar campo essencial, saída na folha de dados do PDF.
- Idioma e moeda atualizam o cartão da proposta na hora (tradução imediata e valores convertidos).
- Modelo da proposta em **Configurações** (edição pelo responsável do Cadastro geral).

## 18. Curva no padrão LS Fire

- `fabricante.js` lê a tabela de pontos da curva (Flow | Head | Efficiency | Power | NPSHr) → `dados.pontos`.
- `curva-ls.js` (`PricerCurva.desenhar`) traça em canvas: três painéis com o mesmo eixo de vazão (sem eixo duplo), interpolação monotônica só entre os pontos do fabricante, ponto de trabalho, nominal NFPA 20, shutoff e 150% com os limites da folha, eixo secundário em m³/h, logo LS Fire. Usada nos dois padrões; prévia no item; opção "Imagem do fabricante" mantém o recorte da página.
- Botão "Anexar folha do fabricante" por item no cartão da proposta.

## 19. Cadastro como fonte da folha de dados e do escopo

- Folha de dados técnica em documentos (`tipo: 'folha de dados técnica'`, `insumos: [chave]`), chave = id do insumo, `kb:<id>` (kit de bomba) ou `km:<id>` (kit de motor). Bomba: só seções construtivas marcadas; motor: só seções do motor quando a folha é combinada.
- Desenhos em documentos (`tipo: 'desenho do equipamento'`, `equip` ou `modelo`), anexados em Engenharia → Famílias.
- Texto de escopo na tabela `ESCOPO_PROPOSTA` (`itens[chave]`, `fams[código] = { grupo, t }`), com {marca}, {modelo}, {qtd}.
- Proposta: `it.cad` (folhas e desenhos), `it.escopoG` (escopo por grupo); folha construtiva do cadastro (bomba à esquerda, motor à direita), desenhos como páginas; o escopo do fabricante anexado na proposta fica desligado por padrão.
- Curva por pontos-chave (shutoff, mínima, trabalho, nominal, máxima) quando não há tabela de pontos; quadros com título embaixo da curva viram seções.
- Planilha de preços em paisagem com preços sem impostos, impostos e IPI; botão Cancelar no topo.
