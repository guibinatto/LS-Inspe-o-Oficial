# Arquitetura ERP/CPQ — implementação, testes, compatibilidade e reversão

Data: 31/10/2026. Base: auditoria em `13-erp-auditoria.md`. O motor de cálculo, as fórmulas, as células da planilha e as regras fiscais e comerciais **não mudaram** (regressão com 0 diferença, seção 4).

## 1. Relatório de alterações

| Complemento | O que foi feito | Arquivos |
|---|---|---|
| 2.1/2.2 Menu global | Menu em módulos: **Início**; **Propostas** (Proposta aberta + Todas, SEQ, SPV, Em aberto, Aguardando aprovação, Enviadas, Ganhas, Revisões e histórico da proposta aberta, Documentos); **Cadastros** (Cadastros + Produtos e insumos, Famílias, Fabricantes e fornecedores, Estruturas, Kits de motor e de bomba, Regras de configuração, Padronização de descrições, Tabelas fiscais e NCM, Margens e política, Serviços e mão de obra, Pedidos de cadastro); **Gestão** (Pendências, Margens + Aprovações, Em andamento, Ganhas e custo real); **Administração** (Configurações + Usuários e permissões, Numeração e máscaras, Auditoria, Integridade dos cadastros, Backup, Modelo da proposta); **Ajuda** (Guia, Atalhos de teclado, Informações da versão). Os atalhos só levam a telas que já existiam (nenhum módulo vazio). Grupos abrem e fecham (lembrado neste navegador), **Pesquisar no menu**, setas ↑ ↓ Home End, item ativo marcado (`aria-current`), menu recolhido com a dica do nome ao passar o mouse ou focar com o teclado. Tablet: trilho só com os itens principais. Celular: os grupos na gaveta "Mais". | `index.html`, `app.js`, `icones.js` (20 ícones Lucide novos) |
| 2.3 Navegação contextual | Mantida (abas da proposta; Itens e Memorial fora do menu global; abas por área no cadastro). | — |
| 3.2/3.3 Numeração e máscaras | **Administração → Numeração e máscaras**: séries Proposta SEQ (inclui FACTS) e Proposta SPV, com prefixo, ano (AAAA/AA, reinício anual), separador, posições, início, sufixo, prévia e regra de número repetido (avisar ou não deixar salvar). Só o administrador configura (no banco, `meta/numeracao`, que só Editor/dono grava). Séries começam **desligadas**. Ligada, o campo "Nº da proposta" ganha **gerar nº**: reserva com trava (`acquire`) por chamada no contador da série e no registro de cada número (`propostas/_numeracao/numeros/<n>`), pula números já usados em propostas salvas, contador só avança, número nunca reaproveitado. Aviso de número repetido ao lado do campo e na gravação. Lista dos últimos números reservados. | `cadastro.js`, `app.js`, `spv.js`, `facts.js` |
| 3.3 Geração segura (correção) | **Defeito corrigido**: o código de insumo novo era "maior + 1" e, no banco compartilhado, duas pessoas cadastrando na mesma família ao mesmo tempo gravavam uma por cima da outra. Agora, dentro da trava da família, se o código já foi gravado por outra pessoa o insumo recebe o próximo livre e a pessoa é avisada ("o código X foi usado por outra pessoa ao mesmo tempo"). | `cadastro.js`, `app.js` |
| 4 Ficha do produto | Ficha do insumo em abas: **Geral** (identificação, certificação, 3 descrições, texto na proposta), **Técnica** (características da família, equivalentes), **Compras e custos** (preço, fornecedores e cotações, histórico de preço), **Estruturas e utilização** (onde é usado), **Documentos** (folha técnica, anexos), **Histórico**. Mesmo formulário e mesma gravação de antes; Salvar/Duplicar/Excluir/Cancelar sempre visíveis; setas ← → trocam de aba. | `app.js`, `index.html` |
| 6 Descrições | Auditoria: o gerador central é `familias.js` (modelos e campos por família, com o que for configurado em Campos por família). A tela Padronização mostrava o modelo de cada família por um texto fixo à parte (`PAD_REGRAS`), já divergente (motor elétrico sem frequência e rendimento). Agora a tela lê do gerador central; a regra existe num lugar só. `padrao.js` é a lista de conversão de nomes antigos (de → para), não um gerador. Descrições das propostas salvas não mudam. | `app.js` |
| 7.1 Visões da estrutura | Botões **Técnica** (só componentes físicos), **Custeio** (tudo que forma o custo, padrão) e **Comercial** (em que grupo do escopo da proposta cada linha aparece, dentro da descrição do motor diesel ou só no custo). Mesma estrutura, sem cadastro duplicado; a visão comercial usa a mesma regra do escopo da proposta. | `app.js` |
| 9 Busca universal | **Ctrl+K** (⌘K) ou a lupa da barra superior (visível também no celular): propostas, clientes, insumos, famílias, modelos prontos, kits, estruturas, regras e documentos, por código, nome ou descrição (várias palavras). Ações: Abrir e Duplicar proposta; Ver propostas do cliente; Abrir ficha e Localizar na lista do insumo (custo na linha); Ver insumos da família; Abrir kit, estrutura, regras, documento. ↑ ↓ Enter Esc. Procura só no que a pessoa já lê (o banco aplica as permissões). | `app.js`, `index.html` |
| 13 Desempenho | Lista de propostas da tela Início com **Mostrar mais** (60 por vez) e, no banco compartilhado, aviso quando os números consideram só as 300 mais recentes, com **Carregar todas (até 1.000)** (as antigas são juntadas às recentes, que continuam ao vivo). | `cadastro.js`, `spv.js` |
| Ajuda | **Atalhos de teclado** e **Informações da versão** (data de geração e commit carimbados pelo `tools/build.py`, modo dos dados, motor). | `app.js`, `tools/build.py` |
| Correção (Esc) | Esc fechava a janela "clicando" no primeiro botão com `data-close`; com a ficha em abas, esse passou a ser o link "Todos os documentos" (fecha e navega). Agora o Esc usa um botão que só fecha. | `app.js` |

## 2. Funcionalidades preservadas

| Área | Situação | Evidência |
|---|---|---|
| Motor de cálculo SEQ (80 cenários) e SPV/FACTS (11) | igual | regressão: 6216 + 24 valores, 0 diferença |
| Proposta SEQ: cabeçalho, itens, configurador, memorial, conferência, emissão, revisões | igual | cab, cfg, conf, jor, rev, prop, prop_modelo, espec, idioma, integ |
| SPV e FACTS | igual (+ "gerar nº" com a série ligada) | prop_spv, st, alvo, ap |
| Cadastro de insumos, kits, estruturas, regras, importação, edição em massa, pedidos | igual (ficha em abas) | c1, c2, c3, lib, pend, cr |
| Folhas de dados, curva LS, OCR, NFPA 20 | igual | fd, fd_sempa, sempa_real, ocr, ocr_app, fd_nfpa, cad_fd |
| Pendências, aprovações, margens, custo real, tributos | igual | p25, p26, pend, trib, home |
| Backup e restauração, diálogos | igual | bk, dlg |
| Celular e tablet | igual (0 pendências) | mobile_test, auditoria em 10 resoluções × 33 telas |

## 3. Capturas reais antes/depois (`docs/REV22/erp/`)

`antes-menu.png` → `depois-menu.png` e `depois-menu-cadastros.png` (menu por módulos); `antes-menu-recolhido.png` → `depois-menu-recolhido.png`; `antes-ficha-insumo.png` → `depois-ficha-insumo.png` (abas); `depois-busca.png` (busca universal, nova); `antes-celular-inicio.png` → `depois-celular-inicio.png` (lupa no topo); `antes-celular-menu.png` → `depois-celular-menu.png` (grupos na gaveta). Geradas por `tools/testes/erp_capturas.js` (`PREFIXO=antes|depois`).

## 4. Testes executados

| Teste | Resultado |
|---|---|
| `tools/testes/erp_test.js` (novo) | 27 de 27: grupos, submenus, atalho "Propostas SEQ" filtra a lista, grupo lembrado, pesquisa no menu, Esc, dica no recolhido, setas, Ajuda (versão e atalhos), Ctrl+K, busca por modelo, Enter abre a ficha, 6 abas, aba Compras, Salvar visível, numeração (prévia SEQ-2026-00007, gerar nº, próximo SEQ-2026-00008, aviso de repetido), visões técnica (30 de 32 linhas) e comercial |
| `tools/testes/numeracao_test.js` (novo, banco simulado com a mesma trava do claude.ai) | 11 de 11: só administrador configura; série desligada não gera; 12 reservas simultâneas sem repetição; número de proposta salva pulado; formato; contador só avança; série SPV sem ano (SPV0250, SPV0251); duplicado detectado; dois insumos simultâneos na mesma família não se sobrescrevem (01-1002 e 01-1003) e o segundo é avisado |
| Suíte completa (`tools/testes/*_test.js`, 36 testes) | 36 de 36 com saída 0. c1, c2 e cad_fd foram ajustados para clicar na aba da ficha antes de preencher (os campos agora ficam em abas); numeracao_test depende do caminho de `cadastro.js` |
| Regressão do motor (`tools/regressao/motor.js`) | 80 cenários · 6216 valores · 0 diferença |
| Regressão SPV/FACTS (`tools/regressao/spv-facts.js`) | 11 cenários · 24 valores · 0 diferença |
| Auditoria do celular (`mobile_audit.js`, 10 resoluções × 33 telas) | rolagem lateral 0; alvos de toque < 44 px 0; campos com letra < 16 px 0; campos < 44 px 0 |

## 5. Compatibilidade de dados

- **Nada é migrado nem renumerado.** Códigos de insumo (família + sequência, usados pelo motor nas colunas A/B), ids de kits e de propostas, números de propostas e descrições históricas ficam como estão.
- Dados novos, todos opcionais: `meta/numeracao` (configuração das séries), `propostas/_numeracao/series/<série-ano>` (contador) e `propostas/_numeracao/numeros/<número>` (um registro por número reservado; subcoleção, fora da lista de propostas). No modo local: `lspricer.numeracao`, `lspricer.numcont`, `lspricer.numeros`, `lspricer.navgrupos` (grupos abertos do menu).
- Sem séries ligadas, o app grava exatamente o que gravava antes.
- O registro do insumo não ganhou campos. A ficha em abas reorganiza a tela, não os dados.

## 6. Permissões (onde cada regra é verificada)

| Ação | Quem | Onde é verificado |
|---|---|---|
| Consultar propostas, cadastros, documentos | Leitor e acima | banco (regra de leitura) |
| Criar e editar propostas, documentos, pedidos, pendências; reservar número | Contribuidor e acima | banco (`propostas`, `documentos`, `pedidos`… com gravação `interact`) |
| Editar cadastros, estruturas, kits, regras, tabelas | Editor/dono | banco (raiz só `admin`) + área responsável conferida no app |
| Alterar custos / modificar estruturas / publicar regras | responsável da área (Custos, Engenharia) | no app (`REG.areaOk`); no banco, Editor/dono |
| Aprovar propostas (desconto) | aprovadores definidos pelo dono | no app (margens) e registro em `assinaturas/<pessoa>` |
| Gerenciar usuários e responsáveis | dono do app | banco (`meta/` só `admin`) + app (só o dono grava `meta/acessos`) |
| Configurar numeração e máscaras | administrador | banco (`meta/numeracao`) + app (`REG.salvarNumeracao` recusa quem não é administrador) |
| Excluir proposta de vez | administrador | app; rascunho do próprio autor vai para a lixeira |

No modo local (arquivo) não há login nem permissões: quem abre o arquivo faz tudo, e a numeração vale só naquele navegador. A tela informa isso.

## 7. Atualização e reversão

- **Atualizar**: publicar o novo `dist/ls-pricer.html` (mesmo endereço). Não há migração. A numeração só passa a valer quando o administrador liga uma série.
- **Reverter**: publicar a versão anterior do app. Os dados novos (`meta/numeracao`, `propostas/_numeracao/…`) são ignorados por ela. Os números já gravados nas propostas continuam lá, como texto. Para só desligar a numeração, basta deixar as séries desligadas.
- **Commits**: a implementação está nos commits desta etapa no ramo `claude/transform-to-app-fra7mi`; reverter um commit volta o código daquela parte.

## 8. Não implementado nesta etapa (com o motivo)

- **Máscaras para insumo, motor, bomba, kit, estrutura e regra** (INS-, MD-, ME-, BC-, KIT-, EST-, REG-): não aplicadas. O código do insumo é a chave do motor de cálculo (família + sequência) e os kits e estruturas são identificados pela posição na planilha; um código de apresentação exigiria um campo novo em cada registro e a decisão de como mostrá-lo nas telas e documentos. O serviço de numeração já aceita novas séries (`R.NUM_SERIES`), mas não foram criadas sem essa decisão.
- **Subfamília** e outros campos de classificação na ficha: não criados (não existem no cadastro hoje).
- **Relatórios** como módulo próprio e **Glossário** dentro do app: não criados para não abrir telas vazias. Os indicadores e exportações continuam em Margens; o glossário está no manual.
- **Permissões por área no banco**: continuam conferidas no app; no banco a distinção é Editor/dono × Contribuidor. Separar por área exige regras por caminho e mudar onde cada cadastro é gravado (migração).
- **Margens/baixas**: continuam carregando as 500 mais recentes (sem "carregar todas").
- **Numeração no banco compartilhado real**: testada com banco simulado que reproduz a trava do claude.ai e no modo local; a reserva simultânea no banco real não foi executada nesta sessão.
