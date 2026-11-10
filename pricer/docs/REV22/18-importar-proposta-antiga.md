# Importar proposta antiga (planilha LS PRICER + PDFs) e documento comercial com parcelas, volumes e opções

Data: 10/11/2026. Origem: o processo da proposta 10.262 Rev.5 da Ipiranga. A formação foi feita na planilha "LS PRICER - Oficial - 01" (formato REV12). A proposta técnica e a comercial saíram em PDF por outro gerador. O pedido foi trazer esse processo para o app, nas quatro partes escolhidas:

1. cadastrar esta proposta;
2. importar planilhas antigas;
3. os recursos que esta proposta usa e o app não tinha;
4. técnica e comercial como dois PDFs separados.

## 1. Importar proposta antiga

**Onde:** Nova → **Importar proposta antiga (planilha + PDFs)**. Escolha a planilha (.xlsx) e, se tiver, os PDFs da técnica e da comercial, todos de uma vez.

**O que vem da planilha (formação):**

| Planilha antiga (REV12) | No app |
|---|---|
| PROPOSTA C5:C10, F5:F9, J5:J9 (número, revisão, data, vendedor, desconto global, validade, cliente, obra, UF, segmento, norma, cadastro fiscal, pagamento, comissões, NCM) | mesmas células |
| ITEM: descrição, família de produto, quantidade, norma, desconto, ICMS manual, folga, encargo | mesmas células |
| Frete de cada item (modalidade, valor por unidade × quantidade) | frete da proposta (PROPOSTA B13 e F13), rateado entre os itens pelo custo, como o app já faz |
| Start-up (km, diárias, valor da diária, valor fechado) | mesmas células da linha 12 |
| Escopo, linhas 19 a 68 (bloco, família, insumo, fabricante, quantidade, custo, origem) | escopo à mão, linhas 68 a 112 (até 45 linhas; o app avisa se passar) |
| Família do equipamento (C75: SKID, CONTAINER…) | C21 |

Regras do escopo:
- **O custo de cada linha é o que a planilha usou:** o digitado ou o do cadastro dela na época. Assim a formação fica com os custos cotados, não com os de hoje.
- **Custo total digitado por cima** vira custo unitário (H ÷ quantidade), com aviso. Na Ipiranga isso aconteceu no painel jockey: R$ 6.300 por cima de R$ 6.700.
- **Família:** "1.MOTORDIESEL" vira "01.MOTORDIESEL", no formato do cadastro do app.

Planilha REV13 em diante (mesmo layout do app): as células digitadas são copiadas como estão.

**O que vem dos PDFs** (prevalecem sobre a planilha, porque foram o que o cliente recebeu):
- número, revisão, data, validade, obra, cidade e "aos cuidados de";
- código do item (008-00167), descrição breve e completa;
- condição de projeto (vira vazão e pressão do ponto de trabalho) e vazão nominal;
- condição de pagamento, prazo de fabricação e de entrega;
- notas, desvios, exclusões e observações;
- das observações, as tabelas de parcelas e de volumes e a opção de fornecimento vão para os campos novos (seção 2);
- desvios no formato "Item X da especificação técnica…" vão para "Desvios por item da especificação".

Como a leitura funciona:
- O negrito desses PDFs é texto desenhado duas vezes; o leitor junta e lê uma vez só.
- A nota genérica "A definição do motor diesel considera a perda de potência por altitude" **não é importada**. O app calcula a perda quando a altitude e a temperatura são informadas (doc. 17).

**Preço**, escolhido na prévia:
- **Manter o da planilha** (padrão): o desconto de negociação de cada item é ajustado até o preço unitário com impostos bater, com diferença menor que meio centavo.
- **Manter o do PDF:** o mesmo ajuste, com o preço do PDF.
- **Recalcular com as regras do app.**

A prévia mostra lado a lado o custo, o preço da planilha, o do PDF e o recalculado. Nada é gravado até salvar. A importação fica no histórico ("Proposta — importada", com os arquivos e a escolha de preço).

## 2. Campos novos do documento comercial

Ficam em Dados gerais → "Para o documento da proposta" → **Condições e opções do documento comercial**:

| Campo | No PDF (comercial e técnica-comercial; padrão clássico e Folha de dados; impressão A4) |
|---|---|
| Prazo de cada parcela + **Parcelas por marco** (% e marco) | "Parcelas de pagamento": "Todas as parcelas terão prazo de pagamento de 30 DDL, conforme os marcos abaixo" + tabela. A tela soma as parcelas e avisa se não der 100% |
| **Dimensões e pesos para transporte** (volume, comprimento, largura, altura, peso) | tabela "Dimensões e pesos para transporte" |
| **Opções de fornecimento** (opção, o que muda, valor) | "Opção de fornecimento — …", o texto e "A escolha desta opção resulta em um abatimento (ou acréscimo) de R$ X sobre o valor total da proposta". Valor negativo = abatimento. É informativo: não muda o total da proposta |
| **Desvios por item da especificação** (item, desvio) | na lista de desvios: "Item 5.3 da especificação técnica: …" |

Os textos entram na tradução automática quando a proposta sai em inglês ou espanhol. Nada disso mexe em fórmula, custo ou preço.

## 3. Técnica e comercial em dois PDFs

Em Documentos há um botão novo, **Técnica + Comercial (2 PDFs)**. Ele gera a técnica (sem preços) e depois a comercial (com planilha de preços e condições). Os dois ficam guardados nos documentos da proposta. O seletor de tipo e o botão de um PDF só continuam como antes.

## 4. A proposta da Ipiranga

Importada com os três arquivos enviados (teste `importa_test`, 20 verificações):

| | Planilha | PDF | App |
|---|---|---|---|
| Custo do item | R$ 556.097,20 | — | R$ 556.097,20 (36 linhas, iguais) |
| Preço unitário com impostos | R$ 1.090.070,53 | R$ 1.181.732,20 (total R$ 1.222.154,79) | R$ 1.058.132,15 pelas regras do app; com "manter o da planilha", R$ 1.090.070,53 |

O que precisa de atenção:
- **A planilha e o PDF não batem entre si.** A planilha (salva em 10/11) dá R$ 1.090.070,53. O PDF Rev.5 (09/11) diz R$ 1.181.732,20 no item e R$ 1.222.154,79 no total; a diferença de R$ 40.422,59 entre o item e o total não aparece em nenhuma linha do PDF. A planilha tem "desconto na bomba aprovado (09/11/26)", então provavelmente mudou depois do PDF. Escolha na prévia qual preço manter.
- **Impostos:** a planilha antiga aplica ICMS de 8,8%, PIS/COFINS sem ICMS na base e IRPJ/CSLL de 3,39%. O app (REV21) dá ICMS de 5,14%, base cheia e 3,08% para este caso, por isso o mesmo custo dá 2,9% a menos. Com "manter o preço", o valor fica igual e o ICMS do documento sai o do app (5,14%), não os 8,80% do PDF antigo. **A área fiscal deve confirmar o ICMS para RO, contribuinte.**
- **Condição de pagamento:** a planilha dizia "30% entrada + 30% desenhos + 20% embarque + 20% 28DDL". O PDF diz "CP-005 — outras condições, vide observações", com 30% + 70% em 30 DDL. Ficou a do PDF, com as parcelas na tabela.
- **Código e descrição:** saem os do PDF (008-00167). A codificação da planilha antiga gerava "SKD LSF DD 0 453…" sem o jockey.

**Como cadastrar esta proposta no seu app:** Nova → Importar proposta antiga → escolha os três arquivos → Criar a proposta → Salvar. Leva uns 4 segundos. O app não tem acesso aos dados gravados no seu navegador, por isso a importação precisa ser feita aí.

## 5. Testes e regressão

| Verificação | Resultado |
|---|---|
| Motor × REV21 (80 cenários, 6.216 valores) | 0 diferença |
| SPV/FACTS (11 cenários) | 0 diferença |
| Financeiro pela tela × versão anterior | 0 diferença |
| `importa_test` (novo, com os arquivos da Ipiranga) | 20/20 |
| `sim`, `imp`, `idioma`, `derat`, `cad_fd`, `fd`, `varredura` | todos passaram |

Não houve teste em aparelho físico.
