# Usabilidade do vendedor: menos cliques na proposta, na negociação e na conferência

Data: 10/11/2026. Pedido: avaliar o app como vendedor (básico e avançado), fazendo proposta do zero, cadastro, negociação, margens e descontos, e reduzir cliques e complexidade.

Como foi avaliado: o app foi percorrido no navegador com a proposta de exemplo (Cocamar, 3 itens) e com uma proposta SEQ em branco. Foram anotados os campos e botões de cada aba, a altura das páginas e os passos de cada tarefa. Não houve teste em aparelho físico nem com usuários reais.

## 1. O que atrapalhava

| Onde | Problema |
|---|---|
| Dados gerais (proposta nova) | Condição de pagamento, norma, frete, vendedor e validade começavam vazios a cada proposta, embora o vendedor quase sempre repita as mesmas escolhas. A validade era digitada à mão |
| Formação de preço | Havia **três lugares** para mexer no desconto na mesma página: "Desconto × margem", o campo "Desconto global" em Condições comerciais e o "Simulador de negociação". Não ficava claro qual usar |
| Formação de preço | A tabela de composição do preço (custo, impostos, comissões, margem) ficava aberta antes do preço por item e empurrava a negociação para baixo |
| Topo da proposta | A margem aparecia no topo, mas para negociar era preciso ir até a Formação e rolar a página |
| Conferência | Os mesmos avisos apareciam duas vezes: na lista da conferência e na tabela "Pendências desta proposta" |
| Itens | Cada cartão tinha 4 botões do mesmo peso (Abrir, Duplicar, Salvar como modelo, Remover) |

## 2. O que mudou

**Proposta nova repete a última.** Ao criar uma SEQ, o app copia da última proposta SEQ que a pessoa criou:
- condição de pagamento;
- norma;
- frete;
- vendedor e agente de negócio, se ainda estiverem cadastrados;
- prazo de validade em dias.

Só entram valores que ainda existem nas listas. Cliente, CNPJ, obra e número continuam vazios. O aviso na tela diz o que foi repetido, para conferir. Se houver só um vendedor cadastrado, ele já vem marcado.

**Validade em um clique.** Ao lado do campo Validade há os atalhos **15 dias**, **30 dias** e **60 dias**. Eles gravam "até DD/MM/AAAA", contando da data da proposta, no mesmo formato que as propostas já usavam.

**Formação de preço com uma só área de negociação.** A ordem agora é:
1. Indicadores;
2. Preço por item;
3. **Negociar**;
4. Composição do preço (recolhida);
5. Cenários avançados (recolhidos);
6. Reforma tributária.

Em **Negociar**:
- o título mostra o desconto global e a margem atuais;
- atalhos de um clique: **Margem mínima (30%)**, **Sem desconto** (quando há desconto), **3%**, **5%** e **10%**;
- os três campos de antes continuam: desconto, margem desejada e valor final;
- a proposta só muda em **Aplicar à proposta**;
- condição de pagamento e frete ficam no mesmo cartão.

O campo de desconto global repetido em "Condições comerciais" saiu da Formação. Ele continua em Dados gerais → Mais opções.

O antigo "Simulador de negociação" virou **Cenários avançados**, recolhido: variação de custo, outra condição de pagamento, comissões, cenários salvos e converter em revisão. Ele abre sozinho quando há uma simulação.

**Margem do topo leva à negociação.** Clicar na margem do resumo, no topo da proposta, abre a Formação já no cartão Negociar, com o cursor no campo de desconto.

**Conferência sem repetição.** A tabela "Pendências desta proposta" fica recolhida, com o número de abertas no título. Os avisos continuam na lista da conferência, e o registro (código, prazo, responsável) continua a um clique.

**Itens.** Clicar no título do cartão abre o item. Duplicar, Salvar como modelo e Remover ficaram com botões mais discretos, e **Abrir** é o único destacado.

## 3. Cliques e tamanho das páginas

| Tarefa | Antes | Agora |
|---|---|---|
| Preencher pagamento, norma, frete, vendedor e validade numa proposta nova | cerca de 7 cliques e digitar a validade | 0, quando repete a última. Para trocar a validade, 1 clique |
| Ver o desconto que dá a margem mínima | ir à Formação, rolar, digitar "30" | 1 clique na margem do topo + 1 clique em "Margem mínima" |
| Simular 5% de desconto | digitar no campo | 1 clique |

Altura das páginas na proposta de exemplo, a 1440 px de largura:

| Página | Antes | Agora |
|---|---|---|
| Formação de preço (já com a simulação aberta, agora) | 2.231 px | 2.013 px |
| Conferência | 1.655 px | 1.298 px |

## 4. Cálculo

Nenhuma fórmula mudou: os atalhos usam a mesma simulação de antes, e "Aplicar" grava o mesmo desconto global.

| Verificação | Resultado |
|---|---|
| Motor × REV21 (80 cenários, 6.216 valores) | 0 diferença |
| SPV/FACTS × REV21 (11 cenários, 24 valores) | 0 diferença |
| Financeiro pela tela (memorial da proposta de referência, 137 números) × versão anterior | 0 diferença |
| `ux_test` (novo, 13 verificações) | todas passaram |
| `sim_test`, `jor_test` | passaram depois de abrir, no teste, os cartões que agora ficam recolhidos |

## 5. Sugestões para depois (não feitas)

- **Desconto por item na Formação.** Com desconto global, os itens que já estão abaixo do piso continuam fora da política. Um atalho "levar cada item à margem mínima" resolveria isso na própria Formação. Hoje isso é feito item a item, na tela de cada item.
- **Número automático.** Com a série de numeração ligada, o número poderia ser reservado já ao salvar a primeira vez. Hoje é o botão "gerar nº", para não gastar números de propostas abandonadas.
- **Menos abas para o vendedor básico.** São 9 abas. Memorial e Configuração poderiam ficar dentro de Formação e Itens para quem não é da Engenharia.
