# Celular e tablet: interface por toque

Data: 30/10/2026. Arquivo: `pricer/dist/ls-pricer.html`. Nada no motor de cálculo, nas fórmulas, nas regras técnicas, fiscais e comerciais, nas permissões ou na estrutura dos dados foi alterado. As mudanças são de disposição, tamanho e navegação.

## 1. Auditoria antes da mudança

A auditoria é automática (`pricer/tools/testes/mobile_audit.js`). Ela abre o app no Chromium com tela de celular (toque ligado), percorre 33 telas e mede cada uma em 10 tamanhos: 320, 360, 375, 390, 414 e 430 px de largura (celulares), 768 (tablet), 1024 (computador pequeno, com mouse), 844 × 390 (celular deitado) e 1024 × 1366 (tablet grande).

As telas medidas foram:
- **Início e janelas da barra:** Início, Mais ações, Nova proposta e Abrir.
- **Proposta SEQ:** Dados gerais, Itens, as três etapas do configurador e o painel "Por quê?", item novo, Custos, Formação, Conferência, Memorial, Documentos e Histórico.
- **Outras áreas:** Pendências e Margens.
- **Cadastros:** Mapa, Insumos, ficha do insumo, Kits de motor, Estruturas, Regras, Testador, Fiscal, Preço, Serviços e Cadastro geral.
- **Sistema e serviços:** Configurações, Ajuda e uma proposta SPV.

O que ela mede em cada tela:
- **Rolagem lateral:** se a página passa da largura do aparelho e qual elemento é o causador.
- **Toque:** alvos menores que 44 × 44 px.
- **Zoom no iPhone:** campos com letra menor que 16 px, que fazem o iPhone ampliar a tela ao tocar.
- **Altura dos campos:** campos com menos de 44 px.
- **Cortes:** textos cortados sem reticências.
- **Tabelas:** tabelas que só se leem rolando para o lado.
- **Barras fixas:** a parte da altura ocupada por barras que não rolam.

Problemas encontrados (antes):

| Problema | Onde |
|---|---|
| Quase todos os alvos de toque menores que 44 px (cerca de 95%: botões de 30–34 px, links "alterar", "abrir", "↺", caixas de marcar de 13 px) | todas as telas |
| Campos com letra de 13–14 px: o iPhone amplia a tela ao tocar | todos os formulários e tabelas editáveis (Fiscal 210 campos, Preço 187) |
| Página mais larga que a tela (rolagem lateral da página inteira) | 3 telas em 320 px (Formação, Documentos, Pendências); Pendências também em 360 e 375 px |
| Cabeçalho da proposta ocupando ~40% da altura em 390 px antes de qualquer conteúdo | todas as abas da proposta |
| Título do item no configurador em 28 px, ocupando 5 linhas | configurador |
| Tabelas largas só legíveis com rolagem lateral; colunas de 230–300 px fixas | Custos, Formação, Insumos, Kits, Estruturas, Fiscal, Preço, Serviços, Cadastro geral, SPV |
| Lista de 400 insumos de uma vez | Cadastros → Insumos |
| Menu só pelo botão ☰ no topo, longe do polegar; seis botões na barra superior | navegação |
| Botão Salvar cortado na barra superior | proposta SPV |
| Janelas centralizadas, com botões fora da área visível em telas baixas | Nova, Abrir, ficha do insumo, confirmações |
| Painel lateral "Por que este componente?" empurrado para o fim da página | configurador |
| Grades com coluna mínima de 300–360 px (folha de dados, imagens) maiores que a tela de 320 px | configurador (Conferir), modelo da proposta |
| Selos sem quebra de linha estourando a largura | Pendências |
| Teclado virtual cobrindo o campo e a barra de ações | formulários |
| Cabeçalho da proposta tomando quase toda a altura com o celular deitado | 844 × 390 |

## 2. O que foi feito

| Área | Mudança |
|---|---|
| Faixas de largura | até 480 px (celular compacto), 481–767 (celular maior), 768–1023 (tablet), 1024+ (computador). Os limites seguem o conteúdo, não modelos de aparelho. Grades usam `minmax(min(100%, N px), 1fr)`, que nunca passa da tela. |
| Navegação no celular | barra embaixo com **Início, Propostas, Pendências, Cadastros, Mais**, com ícones e nomes e os mesmos selos do menu lateral. **Mais** abre o menu completo (Margens, Configurações, Ajuda). Itens e Memorial seguem dentro da proposta, nas abas dela. O botão ☰ do topo sai: não há duas barras de navegação. |
| Barra superior no celular | só **Salvar** e **Mais ações** (⋮), que abre um painel inferior com Nova, Abrir, Cancelar, Tema e Modo detalhado (só as que valem na tela). |
| Tablet | menu lateral em coluna de 84 px, com ícone e nome de cada tela. |
| Toque | botões, links de ação, abas, selos clicáveis, botões − e +, ordenação e caixas de marcar com 44 × 44 px no mínimo. Caixas de marcar soltas em tabelas ganharam área de 44 px com a caixa desenhada no centro (claro e escuro). Vale para larguras até 1023 px e para qualquer tela de toque. |
| Formulários | campos com 48 px de altura e letra de 16 px (sem zoom no iPhone); uma coluna até 480 px. Teclado numérico (`inputmode="decimal"`) nos campos de número (já existia), teclado de e-mail nos campos de e-mail. Seletores e botões de escolha continuam no lugar da digitação, como no computador. |
| Teclado virtual | ao focar um campo, ele rola para o meio da área visível. Enquanto o teclado está aberto, a barra de baixo e a barra de comandos do configurador saem da frente. |
| Cabeçalho da proposta | número, cliente (uma linha, com reticências), situação, revisão e Cancelar; abaixo, numa linha só, **Valor total, Margem e Pendências**. **mais** mostra custo, itens e os detalhes. Tocar em **Pendências** abre a Conferência (SPV/FACTS: tela Pendências). Em telas baixas e com o celular deitado o resumo não fica preso no topo. |
| Tabelas | no celular, tabela que não cabe vira **cartões**: cada linha um cartão, com o nome da coluna ao lado de cada valor. A primeira informação útil vira o título do cartão. Linhas de grupo e de total viram cabeçalho e destaque. Campos editáveis, caixas de seleção, ordenação ("Código ▾", "Produto"…) e "marcar todos" continuam funcionando. **Ver tabela completa** (acima de cada tabela) mostra a tabela inteira com rolagem lateral; **Ver em cartões** volta. A escolha fica guardada neste navegador. Tabelas que cabem continuam como tabela. A planilha completa (modo detalhado) continua em grade. |
| Memorial | em cartões: cada linha do memorial com ITEM 01, ITEM 02, … e TOTAL DA PROPOSTA identificados; os números são os mesmos do computador. |
| Insumos | no celular, 80 por vez, com **Mostrar mais** (até 400, como no computador). |
| Janelas | Nova, Abrir, fichas e confirmações abrem como painel inferior de largura total, com rolagem interna, respeitando as áreas seguras do iPhone (notch e barra de gestos). Confirmações com botões de largura total. O visualizador de documentos ocupa a tela inteira. |
| Configurador | uma etapa por vez, uma coluna (a prévia lateral sai). **Voltar, Salvar e Continuar** fixos embaixo, acima da barra de navegação; em telas baixas eles ficam no fim da etapa. Famílias em cartões de duas colunas. Componentes em lista vertical: caixa ou cadeado, nome e classificação, quantidade, total e **Por quê?**. O painel do componente abre como painel inferior; tocar fora ou Esc fecha. As escolhas ficam guardadas ao trocar de etapa (são as células do item). |
| Tipografia | títulos menores no celular (22 px; resumo 15–18 px); letra mínima de 16 px nos campos; valores em R$ com tamanho que se ajusta à largura, sem quebrar no meio. |
| Desempenho | só CSS e um observador que marca as tabelas uma vez por renderização. Nada é recalculado ao digitar (o cálculo segue no "sair do campo", como antes). Sem animações pesadas; quem pede menos movimento no sistema não vê animação. |
| Áreas seguras | `viewport-fit=cover` (já existia) e `env(safe-area-inset-*)` na barra superior, na barra de baixo, nos painéis inferiores, nas janelas e nas mensagens. |

Arquivos: `index.html` (CSS, barra de baixo, botão Mais ações), `mobile.js` (novo: cartões, barra de baixo, Mais ações, teclado, painel do componente), `icones.js` (2 ícones Lucide: ellipsis-vertical e layout-list), `app.js` (Pendências clicável no resumo, insumos 80 por vez no celular, campo de e-mail, rolagem do painel só no tablet), `margens.js` (teclado de e-mail), `tools/build.py` (o arquivo final é trocado de uma vez, sem ficar pela metade durante a gravação), `docs/manual` (capítulo 2).

## 3. Resultado por resolução

A tabela abaixo compara as mesmas 33 telas, antes e depois, em cada tamanho. É gerada por `node tools/testes/mobile_relatorio.js antes.json depois.json`.

| Resolução | Telas | Rolagem lateral da página (antes → depois) | Alvos de toque < 44 px | Campos com letra < 16 px | Campos < 44 px de altura | Barras fixas (máx. da altura) |
|---|---|---|---|---|---|---|
| 320 × 568 | 33 | 3 → **0** | 2695 de 2849 (95%) → **0 de 2300 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 10% → 20% |
| 360 × 780 | 33 | 1 → **0** | 2698 de 2849 (95%) → **0 de 2300 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 7% → 14% |
| 375 × 667 | 33 | 1 → **0** | 2702 de 2849 (95%) → **0 de 2300 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 13% → 17% |
| 390 × 844 | 33 | 0 → **0** | 2702 de 2849 (95%) → **0 de 2300 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 11% → 13% |
| 414 × 896 | 33 | 0 → **0** | 2706 de 2849 (95%) → **0 de 2297 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 6% → 13% |
| 430 × 932 | 33 | 0 → **0** | 2709 de 2849 (95%) → **0 de 2297 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 6% → 12% |
| 768 × 1024 (tablet) | 33 | 0 → **0** | 2718 de 2863 (95%) → **0 de 2847 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 5% → 6% |
| 1024 × 768 (computador pequeno, mouse) | 33 | 0 → **0** | 2671 de 2819 (95%) → **0 de 2833 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 7% → 8% |
| 844 × 390 (celular deitado) | 33 | 0 → **0** | 2718 de 2863 (95%) → **0 de 2847 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 14% → 0% |
| 1024 × 1366 (tablet grande, toque) | 33 | 0 → **0** | 2671 de 2819 (95%) → **0 de 2833 (0%)** | 696 de 698 → **0 de 698** | 680 → **0** | 4% → 5% |

Nenhuma tela com pendência.

Na coluna **Barras fixas**, a altura ocupada sobe porque agora a navegação fica numa barra embaixo, sempre à mão. Em 320 × 568 são 52 px no topo e cerca de 60 px embaixo (20%). Com o teclado aberto, a barra de baixo sai. Com o celular deitado, o topo deixa de ser fixo e fica 0%.

"Alvos de toque < 44 px" em 1024 × 768 com mouse: no computador o tamanho de toque não se aplica e o visual ficou como antes.

## 4. Testes funcionais no celular (`tools/testes/mobile_test.js`)

Feitos no Chromium com tela de 390 × 844 e toque. Os valores foram comparados com o mesmo exemplo aberto em 1440 × 900.

| Verificação | Resultado |
|---|---|
| 1 barra inferior visível; menu lateral fora da tela | ✓ |
| 2 Mais abre o menu completo | ✓ |
| Esc fecha o menu | ✓ |
| 3 Mais ações: Nova, Abrir, Tema: automático | ✓ |
| 4 janela Nova proposta como painel inferior (base em 844 px) | ✓ |
| 5 cabeçalho da proposta compacto: 147 px (17% da tela) | ✓ |
| tocar em Pendências abre a Conferência | ✓ |
| 6 cab igual ao computador | ✓ |
| 6 itens igual ao computador | ✓ |
| 6 item igual ao computador | ✓ |
| 6 comp igual ao computador | ✓ |
| 6 memorial igual ao computador | ✓ |
| memorial em cartões: cada linha com ITEM 01, 02, 03 e o total identificados | ✓ |
| 7 campo Obra/local com 16 px de letra e 44 px de altura | ✓ |
| 8 Salvar no celular: ✓ Salvo às 02:29 | ✓ |
| depois de recarregar, o valor continua | ✓ |
| 9 rascunho recuperado ao recarregar | ✓ |
| 10 Configurar: uma coluna (prévia lateral escondida) | ✓ |
| Voltar/Salvar/Continuar fixos embaixo (sticky) | ✓ |
| 11 "Por quê?" abre como painel inferior (fixed, 844, 390, 390, 844, 844) | ✓ |
| tocar fora fecha o painel | ✓ |
| ao voltar, as características escolhidas continuam: Família CONJUNTO MOTOBOMBA escolhido nesta proposta ↺ automático Model | ✓ |
| sem rolagem lateral | ✓ |
| 12 insumos em cartões, 80 por vez: 80 | ✓ |
| Mostrar mais: 160 | ✓ |
| busca filtra: 91 cartões | ✓ |
| seleção para edição em massa marcada | ✓ |
| 13 "Ver tabela completa" mostra a tabela | ✓ |
| 14 ficha do insumo abre | ✓ |
| 15 SPV abre sem rolagem lateral | ✓ |
| 16 celular deitado (844×390) sem rolagem lateral | ✓ |

31 de 31 verificações ok; nenhum erro de JavaScript na página.

Além disso: a bateria completa de testes do app (31 scripts) e as regressões de cálculo, ver `04-testes.md`.

## 5. Capturas

Pasta `pricer/docs/REV22/interface/celular/`:
- `antes/` e `depois/`: capturas reais das mesmas telas em 320, 390, 768 e 844 × 390;
- `comparativo-*.png`: antes e depois lado a lado, das principais telas em 390 px.

## 6. Limitações

- **Sem aparelho real:** não houve teste em iPhone (Safari) nem em Android (Chrome). Toda a validação foi no Chromium simulando tela e toque. O comportamento do teclado virtual e das áreas seguras segue as regras do navegador (`visualViewport`, `env(safe-area-inset-*)`), mas não foi visto num aparelho.
- **Listas longas:** tabelas de cadastro muito extensas e editáveis (Fiscal, Preço, Serviços) viram listas longas de cartões. Funcionam, mas no celular dá mais trabalho que no computador. **Ver tabela completa** continua disponível.
- **Gráficos de Margens:** se ajustam à largura, mas o detalhe de cada barra foi feito para aparecer ao passar o mouse. No toque esse detalhe não foi verificado; os valores estão também nas tabelas da tela.
- **Modo detalhado:** a planilha completa continua em grade com rolagem. É uma visão de conferência para tela grande.
- **Insumos:** no celular aparecem 80 por vez (até 400, como no computador). A busca e os filtros alcançam todos.
- **Arquivos gerados:** PDF da proposta, memorial e Excel são os mesmos do computador. Abrir e compartilhar depende do leitor de PDF do aparelho.
- **Manual:** o capítulo 2 ganhou as capturas do celular e do tablet. Os demais capítulos seguem com capturas do computador; as telas são as mesmas, só a disposição muda.

## 7. Como manter

- O CSS de celular e tablet está no fim do `<style>` de `pricer/index.html`, no bloco "celular e tablet", separado por faixa de largura. O comportamento está em `pricer/mobile.js`.
- Uma tabela que deva continuar como tabela no celular recebe o atributo `data-tabela`.
- Depois de mudar telas: `python3 tools/build.py`, depois `node tools/testes/mobile_audit.js saida.json pasta-de-capturas` (todas as larguras) e `node tools/testes/mobile_test.js`.
