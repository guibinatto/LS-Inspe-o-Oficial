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

## 5. Unidades, folha construtiva e escopo (ajustes pedidos depois da v63)

**Unidades.** A folha misturava sistemas: alguns valores em polegada, psi, hp e SG convertidos, outros não; potência em kW numa folha e em hp em outra; vazão em m³/h numa tabela e em USgpm na outra. Agora toda a FD usa as unidades da LS Fire, qualquer que seja o fabricante:

| Grandeza | Na folha | Exemplo |
|---|---|---|
| Vazão | m³/h, com USgpm entre parênteses quando o fabricante usa gpm (a NFPA 20 classifica as bombas em gpm) | 618,7 m³/h (2.724 USgpm) |
| Altura (manométrica, NPSH, shutoff, 150%) | mca, como no ponto de trabalho (em inglês, m) | 114,3 mca |
| Pressão | bar (psi, kPa e MPa convertidos); absoluta como "bar (abs.)" | 192,4 psi.g → 13,3 bar; 2500 kPa → 25,0 bar |
| Diâmetro | mm | 19,69 in → 500 mm |
| Potência | HP, com kW entre parênteses (para comparar com o acionador); nas tabelas, só HP | 267,73 kW → 359,0 HP (267,7 kW) |
| Temperatura | °C | 20,00 °C |
| Densidade | kg/m³ (SG × 1000) | 998.000 kg/m³ → 998 kg/m³ |

Também:
- Na mesma unidade, ficam as casas decimais da folha, até 2.
- Códigos de material depois da barra (1.4301, 2.1050.01) não são mais tratados como número.
- A curva desenhada não mudou: ela já mostra o eixo de vazão em gpm e m³/h.

**Folha construtiva repetida.** Os dados construtivos da bomba no cadastro (materiais, diâmetros do rotor, pressão da carcaça, vedação) saíam numa página "Folha de dados construtiva" própria, repetindo o que já estava na folha de desempenho. Agora:
- entram na própria folha de desempenho, nas mesmas seções;
- o que já veio da folha do fabricante anexada na proposta tem prioridade;
- o que se repete com outro nome ("Diâmetro do rotor" × "Diâmetro do rotor (projeto)", mesmo valor) sai uma vez só;
- a página construtiva só continua para o acionador, quando ele tem folha no cadastro.

**Escopo.** A seção "Comercial" (frete e prazo) saía no escopo de cada item, às vezes sozinha numa página. Ela repetia as condições comerciais do resumo, por isso saiu do escopo do item. Além disso, grupo curto do escopo vai inteiro para a página seguinte, sem deixar o título sozinho.

## 6. Testes e regressão

| Verificação | Resultado |
|---|---|
| Motor de cálculo × REV21 (80 cenários, 6.216 valores) | 0 diferença. Nenhum cenário da base tem bomba de até 79 gpm, por isso o NCM novo não aparece nela; foi conferido à parte (tabela da seção 1) |
| SPV/FACTS × REV21 (11 cenários, 24 valores) | 0 diferença |
| Financeiro pela tela (memorial da proposta de referência, 129 números) × versão anterior | 0 diferença |
| `derat_test` (novo, 8 verificações) | sem os dados, a frase some; com 1.200 m e 40 °C: frase na PTC, fator certo, coluna na FD, nota contra a curva e frase em inglês |
| Suíte completa (`tools/testes`, 40 testes) | 39 passaram de primeira. O `imp_test` falhou também na v62: ele recarregava a página antes de o rascunho ser gravado. Agora espera a gravação e passa (13/13). Depois dos ajustes da seção 5 foram repetidos `derat`, `cad_fd` (bomba do cadastro dentro da folha de desempenho, sem página construtiva), `sim`, `fd`, `fd_sempa`, `idioma` e `imp`: todos passaram |

Não houve teste em aparelho físico.
