# Simulação de uso de ponta a ponta — cadastros, estruturas, formação de preço, folha de dados e propostas

Data: 31/10/2026. Objetivo: usar o app como uma pessoa usaria (cadastrar, montar, precificar, emitir) e conferir se a folha de dados e as propostas saem com dados corretos e coerentes com a formação de preço.

Ambiente: Chromium (Playwright) com o app de arquivo único (`dist/ls-pricer.html`), modo local, tela de 1440 × 900. A consulta de CNPJ foi simulada (sem internet). Folha do fabricante usada: a folha real da bomba Sempa SCE 200-500 (568 m³/h × 106 m) enviada anteriormente. Não houve teste em aparelho físico.

O teste automático `tools/testes/sim_test.js` repete o roteiro principal e confere os documentos (16 verificações; 15 sem a folha do fabricante).

## 1. Roteiro executado e esforço

"Ações" = cliques, campos preenchidos e escolhas feitas pela pessoa (contadas pelo script).

| Tarefa | Ações | Resultado |
|---|---|---|
| Nova família de insumo (código 48, Sensor de nível, grupo Acessórios, texto de escopo) | 8 | criada; aparece no cadastro de insumos e nas estruturas |
| Nova família de equipamento (Skid teste) | 6 | criada; o app avisa que falta a estrutura |
| Insumo motor diesel pela ficha guiada (7 características) | 17 | descrição gerada pelo padrão (`6M16G308/6 500HP@1800RPM 6CIL 24VCC RADIADOR MEC`), código 01-1091 na sequência, aviso de semelhantes (01-1002 difere em potência) |
| Mesmo motor de novo | — | barrado: "Já existe 01-1091 com mesma descrição", pede confirmação |
| Motor elétrico / bomba de eixo livre / insumo da família nova | 12 / 10 / 6 | descrições pelo padrão; códigos 10-10140, 11-11071, 48-48001 |
| Busca universal (Ctrl+K) pelo motor novo | 1 | encontrado com custo e ações |
| Alterar preço do insumo | 3 | histórico de preço com variação (+2,5%) |
| Componente opcional na estrutura (rascunho) | 11 | salvo; painel lateral mostra condição, origem, insumo fixo e preço |
| Publicar a estrutura | 2 | impacto calculado em 60 modelos prontos ("nenhum muda de custo") e publicada |
| Nova estrutura para a família nova (copiando a de Skid) | 4 | criada com 39 componentes |
| Cabeçalho da proposta SEQ (CNPJ preenche razão social, UF, obra e cadastro fiscal) | 12 | completo |
| Configuração do item (modelo pronto, vazão, pressão, opcional, margem, 3 confirmações, incluir) | 12 | incluído e salvo |
| Folha do fabricante (PDF) | 1 | curva lida e NFPA 20 conferida em 1,9 s |
| Gerar PTC e FD (português e inglês) | 3 | 2 a 3 s por PDF |
| Proposta SPV (inspeção ITM, modelo pronto) até o PDF | 8 | total R$ 9.585,00 igual na tela e no PDF; conferência do PDF ✓ |

Tempo de resposta: recalcular a proposta ao mudar a vazão levou 0,18 s.

## 2. Coerência dos números (proposta 10.250, conjunto diesel SCE 200-500 483 HP, 568 m³/h × 106 mca)

| Conferência | Resultado |
|---|---|
| Custo + impostos + comissões + margem = preço sem IPI | 270.599,33 + 75.635,14 + 9.256,29 + 131.535,24 = **487.026,00** ✓ |
| Composição × memorial × indicador × preço por item × PDF | 487.026,00 nos cinco ✓ |
| Opcional marcado (sensor de nível, R$ 380) | custo 270.219,33 → 270.599,33 ✓ |
| Vazão informada | válvula de alívio, cone, medidor e barriletes entram (custo 233.951 → 270.219) ✓ |
| NFPA 20 com a curva do fabricante | 150%: 852 m³/h com 91,9 m (mín. 68,9 m) atende; shutoff 111,1 m (máx. 148,4 m) atende ✓ |
| Potência máxima absorvida × motor | 325,3 kW na curva < 360 kW (483 HP) ✓ |
| Motor, bomba, rotação, arrefecimento no PDF | iguais à configuração ✓ |
| Regressão do motor de cálculo | 80 cenários / 6216 valores e SPV/FACTS 11 / 24: 0 diferença ✓ |

## 3. Problemas encontrados e corrigidos

Nenhuma correção mexeu em fórmula, célula, alíquota ou regra de preço; o motor continua com 0 diferença.

| # | Problema | Efeito | Correção |
|---|---|---|---|
| 1 | Planilha de preços da proposta (padrão FD) chamava de "ICMS + PIS + COFINS" o total de impostos do memorial, que inclui IR/CSLL (3,08%) | o cliente via R$ 75.635,14 de impostos e R$ 411.390,86 "sem impostos"; o certo é R$ 60.634,74 (8,80% + 3,65%) e R$ 426.391,26 | o documento usa os valores de ICMS, PIS e COFINS que o motor já calcula para o item (P60:P62); o IR/CSLL continua dentro do preço, sem destaque |
| 2 | Escopo não listava o que vem dentro dos kits | o painel de comando do diesel (R$ 20.490 no kit do motor), a chave de partida, o manômetro e o manovacuômetro (kit da bomba) estavam no custo, mas não apareciam no escopo da PTC nem da FD | o conteúdo dos kits entra como linha do escopo, sem custo próprio |
| 3 | PTC (padrão clássico) descartava componentes de famílias criadas no cadastro | o sensor de nível (família 48) entrava no custo e saía na FD, mas não na PTC | a PTC usa o nome da família do cadastro |
| 4 | "Informar a pressão" abria o campo com "0" e o cursor no início | digitar 106 gravava **1.060 mca**, que ia para o ponto de trabalho, a folha e a proposta | o campo abre com o conteúdo selecionado (vale também para o botão "alterar" dos campos automáticos) |
| 5 | Modelo pronto sem pressão aparecia como "0 mca — do modelo pronto" e nenhum aviso | a proposta podia sair com 0 mca | aviso "Sem pressão…" com botão que leva ao campo; a característica aparece como pendente |
| 6 | Rotação e arrefecimento "pendentes" com o motor já escolhido | indicava falta que não existia | mostram os valores do motor ("do motor escolhido") |
| 7 | Composição do preço: margem 27,0% ao lado do indicador e do memorial com 32,0% | parecia divergência (são bases diferentes) | nova coluna "% no memorial" e nota: comissões e margem sobre o preço sem impostos, como a planilha calcula |
| 8 | Histórico do insumo mostrava as características em JSON | ilegível | "Potência: 500 · Rotação: 1800 …" com os nomes dos campos da família |
| 9 | 1ª linha do histórico de preço com a descrição do produto na coluna Origem | confuso | "cadastro do insumo" |
| 10 | 7 abas da ficha do insumo não cabiam na janela (rolagem lateral cortando o nome) | dificultava achar a aba | no computador as abas quebram em duas linhas |

## 4. Pontos para decisão (não alterados: envolvem preço ou dados de engenharia)

1. **"Ajustar à margem mínima" deixa a margem em 31,97%, não em 30%.** A planilha usa margem-alvo "encadeada" (sobre o preço já sem a comissão); com alvo de 30% a margem líquida final fica em 31,97%. O botão só sobe o alvo, nunca desce. Na proposta simulada o preço ficou ~R$ 14 mil acima do necessário para 30%. Corrigir faria o botão buscar o alvo que dá exatamente o mínimo (preço menor). Precisa da sua confirmação.
2. **Possível custo em dobro no kit da bomba.** O kit SCE 200-500 (R$ 50.333) já soma válvula de alívio de carcaça (R$ 440) e válvula de liberação de ar (R$ 510); a estrutura também inclui "Kit recirculação da carcaça" (R$ 500) e "Kit válvula de liberação de ar" (R$ 450) como linhas próprias. Se forem a mesma coisa, há cerca de R$ 950 contados duas vezes por bomba. A Engenharia/Custos deve confirmar; a correção seria a condição "Só se a bomba não for kit" nessas linhas da estrutura.
3. **A maior parte dos modelos prontos não tem vazão nem pressão.** Dos 40 modelos que a lista do configurador mostra (de 60 cadastrados para conjunto motobomba), 32 vêm sem as duas (30 deles diesel). A pessoa precisa informar vazão e pressão (agora há aviso para cada uma). Completar os modelos evitaria o passo.
4. **Nomes dos modelos prontos cortados** ("SCE 200-500 RT FERRO FUNDI"): vêm assim do cadastro de modelos.
5. **Menu:** "Kits de motor diesel" e "Kits de bomba" estão em Engenharia de produto, mas abrem na área Custos do cadastro (onde ficam os preços). Funciona, mas o destaque da área muda.

## 5. Observações

- A descrição completa dos conjuntos diesel termina com "COM PAINEL PARTIDA DIRETA 220 MONO" (vem do parâmetro de partida do diesel da planilha e já aparecia na REV21). Se não for o texto desejado, é um ajuste de parâmetro, não de fórmula.
- Na simulação a proposta foi gerada sem "aos cuidados de" e prazo até eles serem preenchidos; o cartão avisa o que falta e deixa gerar.
