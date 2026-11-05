# Regressão de cálculo REV21 × REV22

## Método

- **Motor SEQ** (`tools/regressao/motor.js`):
  - Roda em Node, sem navegador e sem dados do usuário.
  - Carrega `engine.js`, `model.js` e `cadastro.js` da pasta indicada.
  - Calcula 80 cenários fixos: o exemplo da planilha e variações de desconto, margem, frete, start-up, pagamento e quantidades, mais os 72 modelos do MONTADOR.
  - Grava cada valor calculado: preços, custos, impostos, comissões, margens, fatores, NCM, unidade e totais da proposta.
- **SPV e FACTS** (`tools/regressao/spv-facts.js`): o app gerado (`dist/ls-pricer.html`) é aberto no Chromium, cada tipo de SPV e o FACTS são montados e os totais da barra de resumo são lidos.
- **Referência**:
  - `referencia-rev21.json` e `referencia-rev21-spv-facts.json`, geradas na tag `rev21`.
  - Na comparação, números iguais até 1e-6 relativo e textos idênticos.

## Resultado (29/10/2026, commit 434c18b)

```
node tools/regressao/motor.js . > atual.json
node tools/regressao/motor.js --comparar tools/regressao/referencia-rev21.json atual.json
80 cenários · 6216 valores comparados · 0 diferença(s)

node tools/regressao/spv-facts.js dist/ls-pricer.html > atual-spv.json
node tools/regressao/motor.js --comparar tools/regressao/referencia-rev21-spv-facts.json atual-spv.json
11 cenários · 24 valores comparados · 0 diferença(s)
```

## O que a REV22 acrescenta sem tocar no cálculo

- **Simulador**: clona a planilha e aplica os parâmetros na cópia. A proposta oficial só muda quando o usuário converte o cenário em revisão.
- **Regras de configuração**: só leem campos e descrições de componentes e geram alertas. Não gravam células.
- **Painel e comparação de revisões**: usam o `resumo` já salvo em cada proposta, com a mesma margem sobre a receita líquida.
- **"Não se aplica" nos custos**: marca a linha para a conferência. Não zera nem remove custo.

## Para repetir

Na pasta `pricer/`, rode os comandos acima. Para o SPV/FACTS é preciso o Playwright (`NODE_PATH=$(npm root -g)`). Qualquer diferença aparece listada, com cenário, célula, valor de referência e valor atual.
