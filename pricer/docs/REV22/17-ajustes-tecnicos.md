# Ajustes técnicos: NCM pela vazão, recalque de 450 gpm, perda de potência do diesel e folha de desempenho

Data: 05/11/2026. Origem: a conferência técnica feita depois da simulação de uso (doc. 16). O usuário pediu os itens 2, 3 e 4 dessa conferência e uma folha de desempenho com títulos coerentes, no padrão da Peerless. O item 1, o dimensionamento do tanque de combustível, fica com a Engenharia e não foi alterado.

## 1. NCM e IPI pela vazão da bomba (item 2)

| | Antes | Agora |
|---|---|---|
| Regra | O NCM vinha só da família do item (CMB = 8413.70.90, IPI 0%) | Mesma regra, mais uma: se o NCM da família é 8413.70.90 e a vazão nominal da bomba principal é **até 300 l/min (18 m³/h, 79 gpm)**, o item sai como **8413.70.80** |
| IPI | 0% para qualquer vazão | 3,25% para 8413.70.80. A alíquota vem da tabela NCM × IPI que já existia em PARÂMETROS (linhas 110–114); não foi digitado nenhum valor novo |

- Onde está: `cadastro.js`, fórmula de G7 que o cadastro injeta em cada ITEM. O resto da cadeia (P43 = IPI pelo NCM, preço com IPI, memorial) não mudou.
- A base é a vazão nominal da bomba (AR4, em gpm) × 0,2271247, **sem arredondar**. Exemplo: 80 gpm dá 18,17 m³/h e continua 8413.70.90. Se a comparação usasse a coluna K arredondada, 80 gpm daria "18" e entraria por engano.
- Conferido no motor de cálculo:

| Vazão (gpm) | m³/h | NCM | IPI |
|---|---|---|---|
| 50 | 11,4 | 8413.70.80 | 3,25% |
| 79 | 17,9 | 8413.70.80 | 3,25% |
| 80 | 18,2 | 8413.70.90 | 0% |
| 100 | 22,7 | 8413.70.90 | 0% |
| 500 | 113,6 | 8413.70.90 | 0% |

- Bomba jockey não conta, porque a vazão usada é a da bomba principal. Família com outro NCM (skid, container etc.) também não muda.

## 2. Recalque da bomba de 450 gpm (item 3)

- KIT HIDRÁULICA, linha de 450 gpm, coluna I (recalque): de **4"** para **5"**, como na tabela de bitolas mínimas da NFPA 20.
- As colunas H/I (sucção e recalque) são **informativas**. O custo do kit vem das colunas J:Q (`KH_ITENS`), que não mudaram, então nenhum preço muda.
- Pendente: o site da tabela NFPA estava bloqueado na rede deste ambiente. A Engenharia deve confirmar o valor na edição da norma adotada.

## 3. Perda de potência do motor diesel por altitude e temperatura (item 4)

Antes, a PTC trazia sempre a frase "A definição do motor diesel considera a perda de potência por altitude, de acordo com a NFPA 20", mas nada era calculado.

Agora:

- **Dados gerais → "Para o documento da proposta"** (só na SEQ) tem dois campos novos: **Altitude da instalação (m)** e **Temperatura ambiente máx. (°C)**.
- O fator da NFPA 20 é calculado assim:
  - altitude: −3% a cada 300 m (304,8 m) acima de 91 m (91,44 m);
  - temperatura: −1% a cada 5,6 °C (5,556 °C) acima de 25 °C;
  - fator = fator da altitude × fator da temperatura;
  - potência no local = potência nominal do motor diesel × fator.
- **PTC (e notas da FD):** a frase genérica é trocada pelo cálculo. Exemplo com 1.200 m e 40 °C:

  > Potência do motor diesel corrigida para as condições do local (altitude 1.200 m, temperatura ambiente 40 °C), conforme a NFPA 20 (−3% a cada 300 m acima de 91 m e −1% a cada 5,6 °C acima de 25 °C): de 952 HP para 825 HP.

  O fator é 0,8909 × 0,9730 = 0,8668, e 952 × 0,8668 = 825,2. A frase existe em português, inglês e espanhol.
- **Sem altitude e sem temperatura, a frase não entra**, porque o documento não pode afirmar uma verificação que não foi feita.
- **FD, "Pontos de trabalho":** quando há os dados, entra a coluna **Pot. no local (HP)** para o motor diesel.
- **FD, "Critérios da NFPA 20":** quando há a curva do fabricante, entra a nota "Potência do diesel no local (NFPA 20) 825 HP × máxima absorvida na curva 436 HP: Atende", ou "Não atende". kW e cv são convertidos para HP.
- O cálculo é só informativo: não muda o motor escolhido, o custo nem o preço. Se a potência no local não atender, cabe à Engenharia trocar o motor.

## 4. Folha de dados de desempenho no padrão Peerless

O problema: a FD repetia os títulos dos blocos da folha do fabricante. Na Sempa, por exemplo, apareciam "NPSHr" com materiais embaixo e "P-83F-01B" com os dados do fluido, porque o leitor pegava como título a linha que vinha antes do bloco.

Agora, quando há folha do fabricante:

- Os campos são reconhecidos **pelo nome**, não pelo título do bloco, e vão para seções fixas, como na *Pump Performance Datasheet* da Peerless:

  | Coluna | Seções |
  |---|---|
  | Esquerda | Identificação do item · Condições de operação · Limites NFPA |
  | Direita | Líquido · Materiais · Dados de pressão · Construção · Faixa de operação (fabricante) · Outros dados |

- Os dados de motor da folha da bomba não entram, porque o acionador do item é o da formação de preço.
- O que a folha não informa vem da curva (conferência NFPA 20): vazão e altura nominais, vazão e altura a 150% (real / limite), shutoff (real / limite) e potência a 150% e máxima.
- Valores repetidos com o mesmo número saem uma vez só. Acoplamento e vedação ficam numa linha cada (ex.: "Elástico · Sempa · Ferro fundido nodular 07040").
- Os materiais foram traduzidos (incluído "Ductile Cast Iron" → Ferro fundido nodular), também quando vêm com código ("Cast Iron / 06025").
- A tabela "Critérios da NFPA 20" e as notas dela ficam juntas na mesma página.
- Conferido com as duas folhas reais enviadas (Sempa SCE 200-500 e Peerless), em português e inglês.

## 5. Testes e regressão

| Verificação | Resultado |
|---|---|
| Motor de cálculo × REV21 (80 cenários, 6.216 valores) | 0 diferença. Nenhum cenário da base tem bomba de até 79 gpm, por isso o NCM novo não aparece nela; foi conferido à parte (tabela da seção 1) |
| SPV/FACTS × REV21 (11 cenários, 24 valores) | 0 diferença |
| Financeiro pela tela (memorial da proposta de referência, 129 números) × versão anterior | 0 diferença |
| `derat_test` (novo, 8 verificações) | sem os dados, a frase some; com 1.200 m e 40 °C: frase na PTC, fator certo, coluna na FD, nota contra a curva e frase em inglês |
| Suíte completa (`tools/testes`) | ver o resultado no fim do commit |

Não houve teste em aparelho físico.
