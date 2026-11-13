# 25 · Relatórios gerenciais: custo previsto × realizado

## Onde fica

Há dois caminhos:
- **Gestão → Relatórios gerenciais**, no menu;
- a aba **Relatórios** em Margens.

Só quem vê preço e margem abre a tela: Precificação, Financeiro e Diretoria. No modo local, quem usa o arquivo vê tudo. Quem só lança custo (Engenharia, Custos) continua vendo apenas a fila de custo real, sem preço nem margem.

## De onde vêm os números

- **Previsto** é o custo da formação congelada na baixa da proposta ganha (**Dar baixa**).
- **Realizado** é o valor que Engenharia e Custos lançam em cada linha, em **Margens → Ganhas → Custo real**. Os custos não previstos entram somados.
- **Linha ainda não conferida conta pelo previsto.** Por isso a tela sempre mostra quanto já foi conferido, e a base pode ser escolhida:

  | Base | O que entra |
  |---|---|
  | **Com custo real lançado** (padrão) | Ganhas com pelo menos uma linha conferida |
  | **Só 100% conferidas** | Ganhas com todas as linhas conferidas |
  | **Todas as ganhas** | Todas as propostas ganhas |

- **Margem:** é a mesma conta da formação, sobre a receita líquida (venda − impostos − comissões − custo, dividido por venda − impostos). O valor fechado com o cliente já está considerado.

Nada no cálculo da formação mudou. O relatório só lê as baixas e o custo real que já existiam.

## O que mostra

- **Filtros:** período (12 meses, este ano, tudo), divisão (SEQ, SPV) e base.
- **Agrupar por:** família, vendedor, cliente, mês do fechamento ou divisão. O vendedor vem da proposta. Proposta sem vendedor fica em "Sem vendedor".
- **Indicadores:**
  - venda fechada;
  - custo previsto;
  - custo realizado, com o desvio em R$ e em %;
  - margem prevista → realizada, em pontos percentuais;
  - conferência (linhas com custo real).
- **Gráficos:**
  - **Custo previsto × realizado** por grupo: barras azul (previsto) e laranja (realizado), com o valor escrito em cada barra;
  - **Desvio de custo** por grupo, em % do previsto;
  - **Margem prevista × realizada por mês**, com a mesma informação também em tabela ("Ver em tabela").
- **Onde o custo mudou:** materiais e componentes, mão de obra, custos não previstos.
- **Componentes com maior desvio:** os 15 maiores em R$, com os pacotes em que aparecem.
- **Tabela completa** do agrupamento, com total.
- **Baixar relatório (Excel)**, com estas abas:
  - uma por agrupamento: família, vendedor, cliente, mês e divisão;
  - **Pacotes:** cada ganha, com previsto, realizado e margens;
  - **Componentes:** todas as linhas conferidas, maior desvio primeiro.

Ao passar o mouse nos gráficos aparece o valor exato. As cores azul e laranja passam na verificação para daltonismo e no contraste, nos temas claro e escuro.

## Testes

`tools/testes/rel_test.js` (19 verificações). Ele monta uma proposta ganha (exemplo Cocamar), lança custo real diferente do previsto e confere:
- os totais do relatório batem com a tela de custo real da proposta;
- os grupos somam o total, em cada agrupamento;
- as bases filtram certo;
- o Excel traz as abas e os mesmos valores;
- a tela vazia explica de onde vêm os dados;
- no celular não há rolagem lateral;
- não há erro de JavaScript.

Também verificado:
- o axe-core não acusa violação (WCAG A/AA) nos dois temas;
- as regressões do motor, de SPV/FACTS e do financeiro continuam com 0 diferença.
