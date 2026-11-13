# 21 · Serviço com peças em duas propostas (mão de obra e peças)

## O pedido

No Ploomes, serviço com peças vira **duas propostas**: uma de mão de obra (MO) e outra de peças, cada uma com o seu número. Exemplo da WEG Tintas: **10.339** é o serviço de troca do radiador e **10.342** é o radiador. O app passou a fazer essa separação dentro do próprio fluxo da SPV.

## Como funciona

1. Na SPV de serviço (com o bloco **Equipe e deslocamento** e o bloco **Peças e materiais**), o cartão de peças tem o botão **Separar em 2 propostas: mão de obra e peças**.
2. A janela pede as duas **famílias** (o tipo da SPV, que vai para margens e relatórios):
   - **mão de obra (esta)**: vem com a família da proposta aberta (SMC, SMF, PAN, TAQ…) e pode ser trocada;
   - **peças (nova)**: começa em **PAR · Peças e sobressalentes**. Pode ser outra família da divisão SPV, por exemplo PAN para peças de painel.

   Na criação da SPV continua uma escolha só, a do tipo de serviço. A segunda família é pedida aqui, porque é aqui que nasce a segunda proposta.

   Depois, a janela pede os dois números:
   - **mão de obra (esta)**: já vem com o número da proposta aberta;
   - **peças (nova)**: digitado, ou pelo botão **gerar nº** quando a série de numeração SPV está ligada (Administração → Numeração e máscaras).
3. A janela mostra, para a mão de obra e para as peças, o valor e o lucro líquido de cada parte sozinha, e a soma, que é igual ao total de antes. Se uma das partes ficar abaixo do lucro mínimo, aparece um aviso.

   No exemplo do manual, junto dava 31,0%: mão de obra 50,7% e peças 7,1%, com fator 1,5. O serviço "carregava" as peças. Separadas, a proposta de peças precisa de fator maior ou de aprovação. O app não muda o fator sozinho.
4. A opção **Escrever em "Propostas relacionadas"** (ligada por padrão) põe em cada proposta o número da outra, no idioma da proposta. Esse texto sai no PDF, na seção "Propostas relacionadas":
   - na MO: "Peças e materiais conforme a proposta nº 10.342 (cobrados à parte).";
   - nas peças: "Mão de obra conforme a proposta nº 10.339 (cobrada à parte).".
5. **Separar e salvar as duas** grava primeiro a proposta de peças e depois a de mão de obra.

| | Proposta de mão de obra (a aberta) | Proposta de peças (nova) |
|---|---|---|
| Família (tipo) | a escolhida na janela (padrão: a da proposta) | a escolhida na janela (padrão: PAR · Peças e sobressalentes) |
| Número | o informado | o informado ou gerado |
| Cliente, CNPJ, contato, local, UF, vendedor, pagamento, validade, multiplicadores | mantidos | copiados |
| Equipe, deslocamento, ART, escopo, prazo de execução, não incluso, código do serviço | mantidos | não vão (escopo: "Fornecimento das peças e materiais abaixo, para o serviço da proposta nº …") |
| Peças | saem | todas as linhas, com custo, moeda, IPI e fator |
| Dados da execução do serviço (equipe, segurança, responsabilidades, entregáveis, garantia, dados fiscais do serviço) | mantidos | não vão |
| Idioma, moeda e demais campos do documento | mantidos | copiados |

Depois de separadas, cada proposta mostra no topo um aviso com o número e o valor da outra e o botão **Abrir a nº …**. Se houver alteração não salva, o app salva antes de abrir a outra. Cada uma tem o seu PDF, o seu status, a sua aprovação e as suas revisões.

## Quando o botão não aparece ou não separa

- Proposta sem equipe ou sem peças: não há o que separar.
- Contrato recorrente: o preço é por visita × número de visitas, e a separação não se aplica.
- Proposta já separada: o aviso de vínculo aparece no lugar.
- Proposta já enviada ao cliente (enviada, em negociação, ganha ou perdida): o app não separa e orienta a fazer uma revisão primeiro.
- Número vazio, os dois números iguais, ou número já usado em outra proposta salva. Com o bloqueio de duplicidade da série ligado, o app não separa. Sem o bloqueio, pergunta antes.
- Duplicar uma proposta separada gera uma cópia sem o vínculo.

## Cálculo

Nada muda nas fórmulas. A família não entra no cálculo: o tipo de campo ou fábrica, que define hotel e alimentação, fica o da proposta original, mesmo que a família da mão de obra seja trocada. No cálculo da SPV (`spv.js`, `calc`):

- o preço do serviço é custo do serviço × multiplicador;
- o preço das peças é a soma de custo × fator de cada linha;
- impostos, comissões e custo financeiro são percentuais sobre cada parte.

Por isso, MO sozinha + peças sozinhas = total da proposta junta, centavo a centavo. O lucro de cada parte é que fica diferente do lucro da proposta junta. O teste confere isso, e as regressões seguem com 0 diferença:

| Regressão | Resultado |
|---|---|
| motor | 80 cenários, 6216 valores, 0 diferença |
| SPV/FACTS | 11 cenários, 24 valores, 0 diferença |
| financeiro pela tela | 137 números, 0 diferença |

## Limitações

- O vínculo guarda o identificador da outra proposta. O aviso do topo mostra sempre o número atual da outra; o texto de "Propostas relacionadas" não é reescrito sozinho. Se um número mudar depois, o aviso indica "o número mudou: confira Propostas relacionadas".
- Os documentos de fornecedor ligados às peças (orçamentos) continuam nos documentos da proposta de mão de obra.
- Não há "juntar de novo". Para voltar atrás, use a revisão anterior da proposta de MO e exclua a de peças.
- No modo local (arquivo aberto no navegador), as duas propostas ficam neste navegador, sem login e sem controle de acesso.

## Teste

`tools/testes/separa_test.js` (23 verificações) faz o caminho inteiro:

1. monta uma SPV SMC "WEG TINTAS" nº 10.339, com radiador e junta;
2. confere a soma na janela e recusa número vazio e números iguais;
3. confere as duas seleções de família (SMC e PAR já escolhidas), troca para SMF e PAN, separa com 10.342 e confere a família de cada uma, o preço só da MO, o aviso, "Propostas relacionadas" e o PDF da MO, sem as peças;
4. abre a 10.342 pelo aviso e confere o tipo PAR, o mesmo cliente, sem equipe, preço só das peças, MO + peças = total de antes, e o PDF das peças citando a 10.339;
5. confere as duas na tela inicial, sem erro de JavaScript.
