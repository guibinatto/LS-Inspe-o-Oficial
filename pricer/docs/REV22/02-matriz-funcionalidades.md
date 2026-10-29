# Matriz de funcionalidades REV21 × REV22

Legenda: **Mantida** = igual à REV21; **Ampliada** = mesma função, com acréscimos; **Nova** = não existia.
Toda função da REV21 foi mantida. A coluna "Como foi verificado" cita os testes de `04-testes.md`.

## Cálculo e formação

| Função | REV21 | REV22 | Como foi verificado |
|---|---|---|---|
| Motor de fórmulas e planilha (SEQ) | ✓ | Mantida (sem alteração de código) | regressão: 80 cenários, 6.216 valores, 0 diferença |
| Modelos do MONTADOR (72) | ✓ | Mantida | regressão (todos os 72) |
| SPV (serviço, peças, contrato) | ✓ | Mantida | regressão SPV/FACTS: 0 diferença |
| FACTS | ✓ | Mantida | regressão SPV/FACTS: 0 diferença |
| Margem sobre a receita líquida | ✓ | Mantida | alvo_test |
| Desconto global, por item, margem-alvo | ✓ | Mantida | jor_test, alvo_test |
| NCM e unidade por família (Fiscal) | ✓ | Mantida | regressão (G7/H21) |
| Cenários tributários (reforma) | ✓ | Mantida | trib_test |
| Simulador de negociação | — | **Nova**: roda no motor real, sem alterar a proposta oficial; salva cenários; converte em revisão ou pedido de aprovação | jor_test |

## Proposta e jornada

| Função | REV21 | REV22 | Como foi verificado |
|---|---|---|---|
| Cabeçalho, CNPJ pela Receita, vendedor/AN | ✓ | Mantida, na etapa 1 | cab_test |
| Itens e configurador por conjunto | ✓ | Ampliada: etapa 2, modelos de item, regras de configuração | jor_test, p26_test |
| Custos por linha | parcial | **Ampliada**: etapa 3 com origem, data, validade, variação de preço, alertas e "não se aplica" | jor_test |
| Formação e preço por item | ✓ | Mantida, etapa 4 | jor_test |
| Conferência | parcial (alertas por item) | **Ampliada**: etapa 5 com conferência central e trava de envio configurável | jor_test, p26_test |
| Emissão (memorial, FCI) | ✓ | Mantida, etapa 6 | jor_test |
| Barra de resumo fixa | — | **Nova** | jor_test |
| Revisões (revisar, ver, restaurar) | ✓ | Ampliada: comparação entre revisões, versões enviada e aprovada congeladas | rev_test, p25_test |
| Conferência do PDF | ✓ | Mantida; o PDF salvo leva revisão e etapa | conf_test |

## Processo

| Função | REV21 | REV22 | Como foi verificado |
|---|---|---|---|
| Aprovação com valor target | ✓ | Ampliada: decisão assinada no banco; perde a validade quando custo ou itens mudam | ap_test, alvo_test |
| Minhas pendências por papel | ✓ | Ampliada: acompanhamento com código, departamento, responsável, prazo, prioridade, criticidade, histórico | pend_test, p25_test |
| Pendências automáticas | — | **Nova**: nascem da conferência ao salvar, sem duplicar, e se resolvem sozinhas | p25_test |
| Etapas pós-envio (baixa, avisos, custo real) | ✓ | Mantida | st_test, cr_test, lib_test |
| Custo real só após ganha | ✓ | Mantida | lib_test |
| Responsáveis por área | ✓ | Ampliada: matriz de perfis e permissões; lista gravável só pelo dono | p25_test |
| Excluir proposta | ✓ (apagava) | **Alterada**: vai para a lixeira; só o administrador apaga de vez | p25_test |
| Painel (dashboard) | 4 indicadores | **Ampliada**: etapas, conversão, margem ponderada, prazos, descontos, previsto × realizado, pendências; filtros; fórmulas | p25_test |

## Dados e sistema

| Função | REV21 | REV22 | Como foi verificado |
|---|---|---|---|
| Salvar proposta | ✓ | Ampliada: versão, conflito sem sobrescrita, gravação confirmada | integ_test |
| Indicador de alterações não salvas, rascunho, aviso ao fechar, salvamento automático | — | **Nova** | integ_test |
| Falha de armazenamento | silenciosa | **Corrigida**: aparece em faixa e no topo | integ_test |
| Backup e restauração | — | **Nova** (restauração só pelo administrador) | bk_test |
| Histórico | ✓ | Mantida, com os novos eventos | todos |
| Documentos | ✓ | Ampliada: revisão, item e etapa | p26_test |
| Modelos SPV ("salvar como modelo") | ✓ | Mantida | — (sem alteração) |
| Tema claro/escuro | só automático | **Ampliada**: seletor automático/claro/escuro | p26_test |
| Cadastro de insumos | ficha genérica | **Ampliada**: ficha guiada por família, três descrições, situação, fornecedores, equivalentes, duplicidade, impacto (ver `08-cadastro.md`) | c1_test |
| Estruturas | editor por linha | **Ampliada**: grupos, testador no motor real, rascunho e publicação, comparação, versões | c2_test, c3_test |
| Kits | edição | Ampliada: duplicar, comparar, onde é usado | c3_test |
| Preços nas propostas | sempre os do cadastro do dia | **Alterada**: enviadas, aprovadas e ganhas ficam com os preços da época; atualização seletiva | c2_test |
| Teclado | parcial | Ampliada: Esc fecha janelas, Ctrl+S salva, "pular para o conteúdo", foco na janela aberta | p26_test |

## Navegação e interface

| Função | REV21 | REV22 | Como foi verificado |
|---|---|---|---|
| Navegação principal | barra superior com 9 entradas | **Alterada**: menu lateral com 8 entradas e ícones; recolhível; gaveta no celular | todos os testes de interface (seletores novos) |
| Itens e Memorial | entradas gerais | **Alterada**: abas da proposta SEQ; SPV/FACTS só com Proposta e Histórico | cab_test, jor_test, p26_test |
| Sistema (histórico, responsáveis, backup, planilha) | dentro de Cadastro | **Alterada**: em Configurações | ap_test, bk_test, p25_test, c2_test |
| Cabeçalho de contexto da proposta | parcial | **Ampliada**: número, cliente, revisão, situação, total, margem, custo, itens, pendências | st_test, c2_test |
| Preenchimento inteligente | — | **Nova**: listas de valores usados, botões de escolha, − e +, recuperação de dados do cliente só em campos vazios | c1_test, cab_test |
