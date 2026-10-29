# LS Pricer REV22 — Relatório de alterações

Base: REV21 (tag git `rev21`, commit 25d0968). Commits da REV22, em ordem:

| Commit | Bloco |
|---|---|
| 063371e | Integridade dos dados e regressão do motor (referência REV21) |
| 972173e | Jornada da proposta em 6 etapas, custos, simulador, conferência central, modelos de item |
| 45192ef | Pendências com acompanhamento, perfis e permissões, aprovações assinadas, lixeira, comparação de revisões, painel |
| 434c18b | Regras de configuração, documentos por revisão/item/etapa, tema, teclado |
| d14c692 e seguintes | Cadastro: ficha guiada por família, preços da época, qualidade, testador, rascunho e publicação de estruturas, central de regras, biblioteca, importação de provisórios (ver `08-cadastro.md`) |

Nenhuma fórmula, referência de célula, índice, arredondamento ou tabela da planilha foi alterada. Ver `05-regressao-calculo.md`.

## Arquivos

| Arquivo | Situação | O que mudou |
|---|---|---|
| `engine.js`, `model.js`, `padrao.js`, `fci-template.js` | sem alteração | motor e planilha da REV21 |
| `cadastro.js` | alterado | gravação de proposta com versão (`ver`/`verDoc`), conflito, `patchProposta`, leitura de confirmação; lixeira (`moverLixeira`, `restaurarLixeira`, `podeExcluir`, `ehAdmin`); `donoId` lido de `meta/acessos` |
| `app.js` | alterado | jornada em 6 etapas, custos, simulador, conferência central, modelos de item, integridade (indicador, rascunho, conflito, autosave, `beforeunload`), backup e lixeira, comparação de revisões e marcos congelados, perfis e matriz, regras no `alertsFor`, tema e teclado |
| `margens.js` | alterado | gravações por patch, trava de envio, decisões assinadas (`decisaoValida`, `decs`), `premissaMudou`, ganchos `aoEnviar`/`aoAprovar`, exportações para o painel |
| `spv.js` | alterado | painel na tela inicial (gancho `painel`), documentos com revisão, item e etapa |
| `conferencia.js`, `pedidos.js` | alterado | gravação por patch; falha de armazenamento aparece |
| `pendencias.js` | **novo** | acompanhamento de pendências |
| `painel.js` | **novo** | painel (dashboard) com fórmulas documentadas |
| `regras.js` | **novo** | regras de configuração da Engenharia; depois ganhou prioridade, status, versão, responsável e a condição "componente presente" |
| `familias.js` | **novo** | campos técnicos e modelos de descrição por família, leitura de características do nome, duplicidade, sinônimos |
| `pedidos.js` | alterado | atendimento define a situação do item; conferência de padrão e duplicidade via `familias.js` |
| `index.html` | alterado | novos scripts, estilos (6 etapas, barra de resumo, pendências, painel, matriz, regras, link "pular"), botão de tema, selo REV22 |
| `tools/regressao/*` | **novo** | regressão do motor e de SPV/FACTS, com as referências da REV21 |
| `docs/REV22/*` | **novo** | estes relatórios |

## Dados novos no banco compartilhado

| Coleção / documento | Conteúdo | Regra de escrita |
|---|---|---|
| `pendencias` | acompanhamento de pendências | Contribuidor ou acima |
| `modelos` | modelos de item | Contribuidor ou acima |
| `tabelas/*` FAM_CAMPOS, SINONIMOS, ESTR_RASCUNHO | campos por família, sinônimos, rascunho de estrutura | Editor |
| `cadastro/fNN` (insumos) campos novos | situação, características, descrições, fornecedores, equivalentes | Editor |
| `propostas/*` campos `precos`, `origemItens` | preços da época e origem de itens reaproveitados | Contribuidor ou acima |
| `assinaturas/<id da pessoa>/aprov` | assinatura de cada decisão de aprovação | só a própria pessoa (regra `{self}`) |
| `meta/acessos` | responsáveis e aprovadores | só o dono do app (antes: Editor) |
| `propostas/*` campos novos | `ver`, `verDoc`, `criadaEm`, `criadaPor`, `excluida`, `checagem`, `naCustos`, `cenSim` | Contribuidor ou acima |
| `revisoes/*_enviada`, `*_aprovada` | versões congeladas | Contribuidor ou acima |

Nenhum campo existente mudou de significado. Registros antigos sem os campos novos continuam abrindo (ver `06-implantacao-migracao-rollback.md`).
