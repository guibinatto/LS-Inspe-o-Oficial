# Padrões de descrição – cadastro de custos LS Fire

Este documento descreve o padrão de nome (`produto`) e dos campos `fab` e `tipo` por família. As propostas item a item estão em `proposta.json`. Nenhum item é apagado: duplicatas são apenas sinalizadas em `duplicado_de`.

## Regras gerais

- Texto em MAIÚSCULAS, com um único espaço entre tokens. Sem quebras de linha, sem hífen Unicode (`‐`) e sem " - " como separador.
- A marca fica no campo `fab` e não entra no início do nome. A exceção é a marca do motor dentro de conjuntos (12) e de motores elétricos (10), que é parte do padrão.
- **Não se convertem unidades.** CV continua CV e HP continua HP, porque 1 CV = 0,986 HP e converter alteraria o dado. Na família 01 a unidade lida pelas fórmulas é sempre `HP`, e o número fica como o fabricante publica. Por exemplo, Doosan publica 623 PS e Baudouin VS usa kW×1,36.
- Decimal com vírgula na potência (`0,5CV`, `12,5CV`). O ponto é mantido quando faz parte do código do modelo (`MHE 1.5-4A`, `6LTAA8.9`).
- Rotação no formato `@{RPM}RPM`.
- **Duplicatas:** recebem `duplicado_de` = id mais antigo. O arquivo de entrada **não traz preços**, por isso o `para` da duplicata é o mesmo nome padronizado do original. O `motivo` registra que, se os preços divergirem, o item deve ficar distinto. Quando a descrição diverge em dado (HP, tensão, painel), o nome é mantido distinto.
- Dados ausentes (HP, tensão, arrefecimento, montagem) **não são preenchidos** sem ficha do fabricante. Esses itens ficam com `confianca: "baixa"`.

## 01.MOTORDIESEL – motores diesel

```
{MODELO} {HP}HP@{RPM}RPM {N}CIL {12|24}VCC {RADIADOR|TROCADOR DE CALOR} [MEC|ELE]
ex.: 6M16G308/6 483HP@1800RPM 6CIL 24VCC RADIADOR MEC
```

- Espaço antes do HP; `HP@` colado; `RPM` colado; `{N}CIL` sem espaço; tensão `12VCC`/`24VCC`.
- Arrefecimento: `RADIADOR` ou `TROCADOR DE CALOR`. A forma abreviada `TROCADOR` é aceita pelas fórmulas, mas foi padronizada para a forma completa. Tokens finais opcionais: `MEC`, `ELE`.
- Sem prefixo "MOTOR DIESEL" e sem marca no nome (marca em `fab`). Grafia de fabricante: `DOOSAN`, e não `DOSAN`.
- Potência: mantém-se o HP atual quando ele confere com a ficha.

### Verificações feitas

| Marca/série | Verificação | Fonte |
|---|---|---|
| Baudouin G-drive (6M16G, 6M21G, 6M33G) | HP do cadastro = kWm ESP×1,341: 6M16G308/6 360 kWm, 6M33G600/6 670 kWm, 6M33G633/6 710 kWm, 6M21G390/6 448 kWm | [6M33 PowerKit](https://powerhouse.se/wp-content/uploads/2022/10/6M33_10403E_PK.S.308.EN_.06.22.pdf), [6M21 spec](https://tech-expo.ru/upload/iblock/941/Baudouin_6M21_SpecSheet.pdf), [PowerKit brochure](https://tech-expo.ru/upload/iblock/00a/Baudouin_PowerKit_Brochure_02.19_WEB.pdf) |
| Baudouin velocidade variável | Conferem 6M11V2D0 (150 kW@2200), 6M16V2D0 (255 kW@2200) e 6M21V2D0 (370 kW@2200). Divergem 6M16V4D0 (190 kW, não 322 HP) e 6M21V6D0 (2200 e não 2100 rpm); 6M16V6D0 não consta | [Rating card VS 2024](https://baudouin.com/wp-content/uploads/2024/03/Industrial-Variable-Speed-Engine-Rating-Card-07082024.pdf) |
| Baudouin 4M11 | **4 cilindros**: 4M11V6D0 = 120 kW@2300 (=161 HP). O cadastro dizia 6CIL e foi corrigido | [baudouin.com 4M11 VS](https://baudouin.com/?p=35949) |
| Doosan P158LE | V8 14,6 L, 458 kW standby@1800 = 623 PS | [ficha P158LE](https://bnhgenerators.com/wp-content/uploads/2022/02/P158LE-engine-spec-1.pdf) |
| Volvo Penta TAD1346GE | 479 kWm standby / 436 kWm prime @1800. O "TAD483GE" do cadastro não existe no catálogo | [publicação Volvo Penta](https://pubs.volvopenta.com/publications//47714298) |
| Perkins 1104C-44TA / 1106C-70TA | 92,2 kW (=124 HP) @2200 e 162 kW (=217 HP) @2200, conferem | [1104C-44TA](https://www.perkins.com/en_GB/products/new/perkins/industrial/industrial-open-power-units/1000002440.html), [1106C-70TA](https://www.perkins.com/en_GB/products/new/perkins/industrial/industrial-diesel-engines/1000002260.html) |
| Branco BD-227 / BD-277 E / BD-277 TE | 4 cil.; 29,9 / 57,1 / 89,7 cv@3000, conferem. Fonte de revenda: não foi achada ficha oficial | [BD 227](https://www.lojadomecanico.com.br/produto/623948/33/787/motor-a-diesel-4t-34cv-2270cc-refrigerado-a-agua-com-partida-eletrica-bd-227-branco-90325100) |
| Yanmar 4TNV88 | Família tem várias potências (36,9 kW@3000). Não há dado da variante -DAS | [yanmar.com](https://www.yanmar.com/eu/industrial/product/engines/4tnv88/) |
| Cummins 6LTAA8.9-P340, FPT, SNAT, De Maas, Lintec, Buffalo | **Sem ficha oficial encontrada.** Só foi padronizado o formato | – |

## 10.MOTORELETRICO – motores elétricos

```
MOTOR {CV}CV {2P|4P|6P} IP55 {TENSÃO} [50HZ] [IE2] {WEG|ABB|SEW} {MANCAL|MONOBLOCO}
ex.: MOTOR 60CV 2P IP55 220/380/440V WEG MANCAL
```

- Tensões usadas: `220/380/440V`, `380/660V`, `660V`. Tokens opcionais entre tensão e marca: `50HZ` (produto diferente) e `IE2`.
- Removidos: `TRIF`, rotação (`3500RPM`, `1750RPM`, `1800RPM`, redundante com os polos), `- PARA MOTOBOMBAS` e espaços duplos.
- `IPW55` → `IP55`. Na WEG, o "W" indica apenas proteção adicional contra intempéries, e o grau de proteção continua IP55. Os W22 das carcaças maiores saem de fábrica como IPW55 ([WEG FAQ](https://www.weg.net/institutional/BE/en/contact/faq?page=171); [catálogo WEG áreas classificadas](https://static.weg.net/medias/downloadcenter/h6c/hc1/WEG-motores-aplicacoes-em-areas-classificadas-50009268-brochure-portuguese-web.pdf)).
- `fab` = fabricante (WEG/ABB/SEW). Nos itens do garimpo, `fab` continha a montagem ("MANCAL"/"MONOBLOCO"), e isso foi corrigido.
- `tipo` = forma construtiva: `B3D` para MANCAL (pés) e `B34D` para MONOBLOCO, como nos itens existentes.
- Quando a montagem não estava informada, foi adotado MANCAL, ou MONOBLOCO quando o texto dizia "PARA MOTOBOMBAS", com `confianca: "baixa"`. **Conferir antes de aplicar**, porque a fórmula faz MATCH exato no nome WEG MANCAL.

## 11.BOMBAMANCAL – bombas de eixo livre

O modelo é sempre o primeiro token, mantendo os prefixos testados pelas fórmulas: `TKF`, `SCE`, `SF`, `MHE`, `VSSE`, `BT4`, `CIS` e `AEF` (busca por SEARCH).

| Série | Padrão | Fonte |
|---|---|---|
| Sempa TKF | `TKF {DN}-{rotor}` e sufixo `EFF` separado por espaço (`TKF 125-400 EFF`) | [catálogo TKF Sempa](https://sempapompa.com/writable/uploads/medias/files/katalog/TKF%20Katalog.pdf) |
| Sempa SCE | `SCE {DN}-{rotor} [RT {MATERIAL}]` (sem alteração) | [catálogo SCE](https://pdf.directindustry.com/pdf/sempa-ltd/sce/205417-901693.html) |
| KSB Meganorm | `MEGANORM {DN}-{rotor} @{RPM}RPM`. Catálogo KSB 60 Hz 4 polos é a 1750 rpm | [manual Meganorm](https://wp.ufpel.edu.br/hugoguedes/files/2018/09/mt_meganorm_linha_ampliada_a2742_0_1p_4.pdf) |
| WDM IS | `IS {suc}X{rec}X{rotor}` com **3 dígitos e zero à esquerda**, sem espaços (`IS 080X065X250`), como nas fichas WDM; `tipo` END SUCTION | [ficha WDM 080x065x250](https://wdmpumps.net/cl/wp-content/uploads/2020/12/080x065x250.pdf), [Technical Book IS](https://wdmpumps.com/wp-content/uploads/2025/01/Technical-Book-IS.pdf) |
| Peerless AEF | `{DN}AEF{rotor}[letra]` (ex.: `10AEF20`); AE/AEF = bipartida horizontal | [Peerless AE](https://manualmachine.com/peerless/typeae/26820873-pump) |

## 12.MOTOBOMBA – conjuntos bomba + acionador

```
{MODELO DA BOMBA} C/ MOTOR {ELÉTRICO|DIESEL} [{MARCA}] [{MODELO DO MOTOR}] {POT}{HP|CV|KW} [{n}P] [@{RPM}RPM] [TRIF] [{TENSÃO}] [IR3|IP55] [60HZ|50HZ] [extras] [UL/FM]
ex.: 10AEF20 C/ MOTOR DIESEL CLARKE C18H0-UFAD18 460HP @1760RPM TIER 3
     GSD 50-200 C/ MOTOR ELÉTRICO WEG 40CV 2P TRIF IR3
     IE 080X065X250 C/ MOTOR ELÉTRICO 40HP 2P
```

- O modelo da bomba vem primeiro. Os SFFECO que começavam com "DIESEL 2000GPM@..." foram reordenados, e o `LEFT(...,2)="SF"` passa a reconhecê-los.
- `+`, `&`, `COM MOTOR` e `- MOTOR` foram trocados por `C/ MOTOR {ELÉTRICO|DIESEL}`. O tipo de acionamento foi deduzido só quando há evidência:
  - **Diesel:** Clarke ([clarkefire.com](https://clarkefire.com/products/engines); C18H e C32H são diesel base Caterpillar), Kirloskar KFP ([Kirloskar KFP UL/FM](https://testkfp.kirloskar.com/Downloads/Kirloskar-KFP-Series-FM-UL-Engines.pdf), 27–336 hp, 1760–3000 rpm), motores NM4/NM6/NM12 (NM Fire, [distribuidor](https://thaikhuongpump.com/en/product/bom-chua-chay-truc-roi-split-case-scf-nm-fire/)), Greaves e Buffalo BFDE.
  - **Elétrico:** WEG, Techtop, F-TDC/F-TX, ou quando o texto informa polos.
- `2 POLOS` → `2P`; `TRI`/`TRIFÁSICO`/`T` → `TRIF`; `IP-55` → `IP55`; `TIER LEVEL T3` → `TIER 3`.
- Notação dos modelos de bomba:
  - WDM IE: igual à IS (`IE 065X050X250`).
  - Waterfall: sem espaços (`WF-8X6X14 HS`, `WF-4X10 ESF`); HS = split case ([Waterfall](https://intersec.ae.messefrankfurt.com/dubai/en/exhibitor-search/exhibitor-search.detail.html/waterfall-pumps-manufacturing-llc/mf_7_aexv8a00b6f1_4004519_10000056202501.html)).
  - NM Fire: `SCF {a}-{b}-{c}` com espaço após a série.
  - Sempa TKF-M: monobloco, `tipo` MONOBLOCO.
  - Schneider: `BPI-22 R`, `BPI-92S`, `BC-92S`.
  - Ebara/Thebe: `THSI-18`; GS/GSD conforme [Ebara](https://ebara.com.br/details/gsgsd-serie-65).
- **Exceção – código CMB** (`CMB {fab3} {D|E} {SC|ES}.{modelo}.{HP}.{RPM/100} {TC|TR|SS} UL/FM`): é mantido como está, com separador `.` e `UL/FM` em vez de `ULFM`. O `SEARCH("AEF")` continua funcionando.
- `tipo`: AEF e HS → `SPLIT CASE`; ESF → `END SUCTION`; VTP → `VERTICAL TURBINA`.

## 13.JOCKEY – bombas jockey

```
{MODELO} {POT}{CV|HP} {TRIF|MONO} [60HZ|50HZ] [{código de tensão}] [IP21|IP55] [C/ PAINEL]
ex.: BT4-0505E7 0,5CV TRIF 60HZ 2/3
     TBPS2-09 0,5CV TRIF 2/3 IP21
     MHE 10 20-30 3CV TRIF IP21
```

- Notação Schneider `0.5 T 60 2/3` → `0,5CV TRIF 60HZ 2/3`. O código de tensão do fabricante (`2/3`, `4V`) é mantido, porque não foi encontrada definição oficial para convertê-lo em volts.
- `BPI BT4-...` e `BPI ME-AL ...` são a linha de incêndio Schneider, distinta de `BT4` ([Schneider BPI](https://www.aecweb.com.br/produto/motobombas-centrifugas-prevencao-contra-incendio-bpi/55275); [BT4](https://www.aecweb.com.br/produto/motobombas-centrifugas-de-aco-inox-bt4/55216)). Por isso, **não** são tratados como duplicatas dos BT4 e o prefixo "BPI" é mantido.
- WDM: `MHE`, `VSSE` (inox) e `VSE` (ferro fundido) são séries diferentes ([Technical Book VSE/VSSE](https://wdmpumps.com/wp-content/uploads/2024/09/Technical-Book-VSE.pdf)). Potência em HP mantida como o fabricante cota.
- `TRF` → `TRIF`; " - " removido.

## Observação sobre as fontes

Nesta sessão o acesso direto às páginas (download dos PDFs) foi bloqueado pela rede. As verificações foram feitas pelos trechos indexados nos buscadores, e as URLs citadas são os documentos de onde vieram esses trechos. Antes de aplicar itens com `confianca` "media" que dependem de valor numérico, recomenda-se abrir a ficha citada.
