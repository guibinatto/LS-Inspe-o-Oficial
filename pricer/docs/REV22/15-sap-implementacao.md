# Padrão SAP Business One — auditoria, implementação, design system e equivalência financeira

Data: 31/10/2026. Referência: "Prompt definitivo — transformar o LS Pricer em um sistema no padrão SAP Business One" e a diretriz crítica de preservação da formação do preço. Base: o app depois da etapa ERP (`14-erp-implementacao.md`).

**Diretriz cumprida: a mudança foi na experiência de uso, não na matemática.** `engine.js`, `model.js` (planilha REV21), fórmulas SEQ e SPV, tributos, margens, comissões, simuladores, memorial e regras de aprovação **não foram alterados** nesta etapa. A seção 5 mostra a comparação dos resultados antes e depois.

## 1. Auditoria do prompt × estado do app

| Seção do prompt | Antes desta etapa | Feito agora |
|---|---|---|
| 2 Navegação (Página inicial, Comercial, Cadastros, Engenharia de produto, Gestão, Administração, Ajuda) | módulos Propostas, Cadastros, Gestão, Administração, Ajuda | grupo **Comercial** (antes "Propostas"); **Engenharia de produto** separado de Cadastros; atalhos levam só a telas que existem |
| 3 Abas da proposta (Dados gerais, Itens, Configuração, Formação de preço, Memorial, Conferência, Documentos, Histórico) | 6 etapas (Identificação, Configuração, Custos, Formação, Conferência, Emissão) + Itens/Memorial | abas **Dados gerais · Itens · Configuração · Custos · Formação de preço · Memorial de cálculo · Conferência · Documentos · Histórico**. "Custos" foi mantida (é uma etapa do fluxo e da conferência) |
| 4 Modelo A (lista) | busca, filtros, ordenação, exportação, edição em massa nos insumos; propostas com "Mostrar mais" | **Colunas** (escolher as visíveis), **Visualizações** salvas (filtros + colunas), **páginas** (50/100/200 por página) em insumos e propostas |
| 5 Modelo B (ficha) | ficha em 6 abas | **cabeçalho do objeto** (código, família, descrição, custo vigente, fabricante, origem, preço vencido) e **7 abas**: Geral, Características técnicas, Compras e custos, Fornecedores, Estruturas e kits, Documentos, Histórico |
| 6 Design system | tokens de cor, tipografia e componentes em `index.html` | documentado na seção 4 (sem trocar a identidade) |
| 7 Cadastro mestre do item | ficha com características por família, 3 descrições, fornecedores, onde é usado, folha técnica | reorganizado nas 7 abas; nenhum campo novo |
| 8 Formulários inteligentes | seletores, dependentes, "+ novo", descrição gerada | mantidos |
| 9 Códigos e máscaras | séries de proposta (etapa ERP) | mantido (ver "não implementado") |
| 10 Editor de estruturas | árvore, testador, rascunho/publicação, 3 visões | **painel lateral do componente**: clicar na linha abre os detalhes (condição, quantidade, de onde sai o insumo, quando entra, acionamento, estruturas em que vale, como aparece no escopo da proposta, insumo fixo e insumos da família) sem sair da estrutura, com Editar componente e Abrir ficha do insumo |
| 11 Configurador em 3 etapas | existia (Configurar, Compor, Conferir) | acessível pela aba **Configuração** da proposta |
| 12 Formação de preço | KPIs, simulador, condições comerciais, preço por item | **Composição do preço** (seção 3) com barra e tabela lidas do memorial, e atalho para o memorial |
| 13 Proposta como documento | número, revisão, situação, cabeçalho, revisões | mantido |
| 14 Celular | navegação inferior, cartões, 44 px | listas novas mantêm "Mostrar mais" no celular (páginas só no computador); auditoria na seção 6 |
| 15 Qualidade e segurança | regras do banco, versão por gravação | sem mudança de regra; nada de segurança por esconder botão |

## 2. Relatório de alterações

| Alteração | Arquivos |
|---|---|
| Menu: Comercial (Propostas SEQ, SPV, todas, rascunhos, aguardando aprovação, enviadas, ganhas, histórico, documentos); Cadastros (produtos e insumos, importar preços, famílias e modelos prontos, fabricantes e fornecedores, válvulas, câmbio, FACTS, serviços, empresa, sinônimos); Engenharia de produto (estruturas e tabelas por porte, kits de motor e de bomba, mão de obra, regras de configuração, testador, padronização, campos por família, codificação); Gestão; Administração; Ajuda | `index.html`, `app.js`, `icones.js` |
| Abas da proposta SEQ com Configuração (abre o configurador do item aberto ou do primeiro item usado), Formação de preço e Memorial de cálculo | `app.js` |
| Composição do preço na aba Formação de preço | `app.js`, `index.html` |
| Indicador "Custo total" renomeado **"Custo total dos itens"** (é a célula G16, que não soma start-up e fretes) | `app.js` |
| Lista de insumos e lista de propostas no Modelo A (colunas, visualizações salvas, páginas); preferências guardadas neste navegador (`lspricer.listas`) | `app.js`, `spv.js`, `index.html` |
| Ficha do insumo no Modelo B (cabeçalho do objeto e 7 abas) | `app.js`, `index.html` |
| Painel lateral do componente na estrutura | `app.js`, `index.html` |
| Testes: `sap_test.js` (novo), `c2_test.js` e `erp_test.js` ajustados às novas abas e ao painel; `sap_capturas.js` (novo); `tools/regressao/financeiro-ui.js` (novo) | `tools/` |
| Manual: capítulos 2, 4, 7, 8, 9 e 12 | `docs/manual/fonte/` |

## 3. Formação de preço dentro da proposta

A aba **Formação de preço** ganhou o quadro **Composição do preço**, só de leitura:

- barra empilhada Custo · Impostos · Comissões · Margem (% do preço sem IPI);
- tabela com Peças e materiais, Serviços de fabricação, Start-up e Fretes (só as linhas com valor), **Custo total (memorial)**, Impostos (sem o IPI), Comissões, Margem líquida, **Preço de venda sem IPI**, IPI, **Preço de venda com IPI**;
- coluna **% no memorial** (impostos sobre o preço sem IPI; comissões e margem sobre o preço sem impostos, como a planilha calcula), para a margem da composição não parecer diferente da do memorial;
- botão **Abrir o memorial de cálculo**.

Todos os valores vêm da coluna M da aba MEMORIAL, calculada pelo motor; o quadro não faz conta própria (não há fórmula simplificada). Ao conferir, apareceu uma diferença que já existia e não é erro: o indicador do alto da aba é a célula G16 (soma do custo dos itens) e o memorial soma também start-up e fretes. Na proposta de exemplo a diferença é R$ 17.000,00, exatamente o start-up. Para não confundir, o indicador passou a se chamar "Custo total dos itens" e uma nota explica a diferença com os valores da proposta.

## 4. Design system

O padrão visual continua o mesmo do app (identidade LS Fire). Os tokens ficam em `:root` no `index.html` e têm versão escura (`prefers-color-scheme` e `data-theme="dark"`).

| Token | Claro | Uso |
|---|---|---|
| `--or` / `--or-ink` / `--or-soft` / `--or-line` | #E8570A / #B8440A / #FFF1E8 / #F6C9AE | ação principal, aba ativa, destaque das linhas de total |
| `--ink` / `--ink2` / `--ink3` | #1B1C1E / #4E5157 / #83868C | texto, texto secundário, legendas |
| `--line` / `--line2` | #E4E2DE / #D2CFC9 | bordas |
| `--bg` / `--card` / `--bar` | #F4F3F0 / #FFFFFF / #1E1F21 | fundo, cartões, menu lateral e barra superior |
| `--entry` / `--entry-line` | #FFF7DD / #EBD58C | campo que a pessoa preenche |
| `--auto` / `--auto-line` / `--auto-ink` | #EDF5F0 / #BFD9C8 / #2F6B46 | valor calculado ou trazido do cadastro |
| `--ok` `--bad` `--warn` (+ `-bg`) | #1E7A45 / #B42F22 / #9A6200 | situação (dentro da política, erro, atenção) |
| `--f-body` / `--f-cond` / `--f-mono` | Barlow / Barlow Condensed / IBM Plex Mono | texto, títulos e rótulos, códigos e números |

Componentes (classes reais do app):

| Componente | Classe | Regra |
|---|---|---|
| Botão | `.btn`, `.btn.pri`, `.btn.sm`; ícone por `data-ico` (Lucide embutido) | uma ação principal laranja por área |
| Abas de documento | `.ptabs` / `.ptab` (proposta), `.fichatabs` (ficha) | aba ativa com sublinhado laranja; setas ← → trocam |
| Cabeçalho do objeto | `.objhead` | código + descrição à esquerda, indicadores à direita |
| Lista (Modelo A) | `.lhead` + `.lacts` (ferramentas), `.lmenu`/`.lpop` (Colunas, Visualizações), `.lpager` (páginas) | busca e filtros em cima, ferramentas à direita, páginas embaixo |
| Indicadores | `.kpis` | número grande, rótulo em maiúsculas condensadas |
| Composição | `.cpbar`, `.cplegend`, `.cpreco` | barras com a mesma ordem da tabela |
| Painel lateral | `.modal.drawer` | detalhe sem sair da tela; Esc fecha |
| Campos | entrada `--entry`, automático `--auto` | a cor diz quem preenche |
| Situação | `.tag` com `--ok`/`--warn`/`--bad` | texto sempre junto da cor |

Modelo A (lista): título, botão Novo, busca, filtros, ordenação pelo cabeçalho, Colunas, Visualizações, exportação, seleção para edição em massa, páginas. Modelo B (ficha): cabeçalho do objeto, abas, ações Salvar/Duplicar/Excluir/Cancelar sempre visíveis.

## 5. Equivalência financeira antes × depois

| Comparação | Referência | Resultado |
|---|---|---|
| Motor SEQ (`tools/regressao/motor.js`) | `referencia-rev21.json` (planilha REV21) | 80 cenários · 6216 valores · **0 diferença** |
| SPV e FACTS (`tools/regressao/spv-facts.js`) | `referencia-rev21-spv-facts.json` | 11 cenários · 24 valores · **0 diferença** |
| Proposta de referência pela tela (`tools/regressao/financeiro-ui.js`, novo) | app da tag `rev21` e app do commit 782c152 (antes das etapas ERP e SAP) × app atual | Proposta exemplo SEQ (Cocamar): memorial com 28 linhas, **218 números comparados nas duas versões, 0 diferença** |

O `financeiro-ui.js` abre cada versão do app, cria a mesma proposta (Nova → Exemplo), abre o memorial de cálculo e compara número a número todas as linhas (custos por item e total, impostos, comissões, margem, preço sem e com IPI). Uso: `node tools/regressao/financeiro-ui.js referencia.html atual.html [outra.html]`; sai com erro se algum número mudar.

## 6. Testes

| Teste | Resultado |
|---|---|
| `tools/testes/sap_test.js` (novo) | 18 de 18: menu com os 6 grupos; Engenharia → Testador abre a tela; abas da proposta; aba Configuração abre o configurador; composição custo + impostos + comissões + margem = preço sem IPI; preço com IPI = indicador; custo do memorial = custo dos itens + start-up + fretes; atalho do memorial; insumos com páginas de 100; próxima página; esconder coluna; visualização salva aplicada; cabeçalho da ficha; 7 abas; aba Fornecedores; painel lateral do componente; Editar componente; propostas com Colunas e Visualizações |
| Suíte completa (`tools/testes/*_test.js`) | ver `04-testes.md` (resultado desta etapa) |
| Regressões | seção 5 |

Não houve teste em aparelho celular físico: as verificações de celular são feitas no Chromium com a tela e o toque de um celular.

## 7. Capturas reais antes/depois (`docs/REV22/sap/`)

`antes-desktop-formacao.png` → `depois-desktop-formacao.png` (abas e Formação de preço); `antes-desktop-formacao-composicao.png` → `depois-desktop-formacao-composicao.png` (composição do preço); `antes-desktop-insumos-lista.png` → `depois-desktop-insumos-lista.png` (Modelo A); `antes-desktop-insumo-ficha.png` → `depois-desktop-insumo-ficha.png` (Modelo B); `antes-celular-formacao.png` → `depois-celular-formacao.png`. Geradas por `tools/testes/sap_capturas.js` (`PREFIXO=antes APP_HTML=<versão anterior>` ou `PREFIXO=depois`).

## 8. Compatibilidade, permissões, atualização e reversão

- Nenhum dado gravado mudou de formato; nada é migrado. As preferências de lista (colunas, visualizações, tamanho da página) e os grupos do menu ficam só no navegador (`lspricer.listas`, `lspricer.navgrupos`).
- Regras do banco e permissões: as mesmas da etapa ERP (`14-erp-implementacao.md`, seção 6). Esconder colunas ou abas não é controle de acesso.
- Modo local: continua sem login nem permissões, e a tela informa isso.
- Atualizar: publicar o novo `dist/ls-pricer.html`. Reverter: publicar a versão anterior; as preferências salvas no navegador são ignoradas por ela.

## 9. Não implementado (com o motivo)

- **Módulo Relatórios** e **Glossário** dentro do app: não criados para não abrir telas vazias; os indicadores continuam em Margens e o glossário no manual.
- **Máscaras para insumo, kit, estrutura e regra**: o código do insumo é a chave do motor (colunas A/B da planilha); um código de apresentação exige campo novo e decisão de uso (ver `14-erp-implementacao.md`, seção 8).
- **Cadastro de unidades de medida** separado: hoje a unidade vem do cadastro do item e da tabela fiscal; não foi criado.
- **Configuração dos equipamentos com várias configurações por proposta**: a aba Configuração abre o configurador já existente, por item.
- **Visualizações salvas compartilhadas** entre pessoas: ficam só no navegador de quem salvou.
- **Páginas nas listas no celular**: no celular as listas continuam com "Mostrar mais".
- **Teste em aparelho físico** (celular ou tablet): não executado.
