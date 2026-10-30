# Folha de dados: pontos de trabalho, NFPA 20, potências e NPSH

Data: 30/10/2026. Arquivos: `curva-ls.js`, `proposta-express.js`, `fabricante.js`, `app.js`.

## O que mudou

| Onde | Antes | Agora |
|---|---|---|
| PDF (padrão Folha de dados), Identificação do item | "Ponto de trabalho" num texto corrido (`1.370 m³/h x 105 mca · 568 m³/h x 100 mca`) | Tabela **Pontos de trabalho**: bomba, acionamento, modelo, vazão (m³/h), pressão (mca), potência nominal do acionador (HP), rotação (rpm), uma linha por bomba |
| PDF | não havia | Tabela **Critérios da NFPA 20**: nominal ou ponto de trabalho (100%), 150% da vazão (altura mínima 65%), shutoff (altura máxima 140%) e final da curva, com a altura exigida, a altura lida na curva, a potência absorvida e o resultado (Atende / Não atende); potência máxima absorvida na curva |
| PDF, rodapé da identificação | "Dados do fabricante (—)" quando a folha não traz o fabricante | "Dados da folha do fabricante, conferidos pela LS Fire." |
| Curva LS Fire | título com fabricante, modelo, rotor e rotação | título com a **descrição da bomba do item** (`AR7`/`D19`; sem ela, a primeira bomba principal da formação) e, embaixo, fabricante, modelo, rotor e rotação |
| Curva LS Fire | shutoff e 150% só quando a folha tinha a seção NFPA | linhas tracejadas sempre que há base: limite de 140% no shutoff, vertical em 150% da vazão, limite de 65% nela, o valor lido na curva; no painel de potência, a potência a 150% e no fim da curva |
| Leitura de PDF sem texto (OCR) | o painel de NPSH ficava de fora (o OCR não lê os números de um dígito do eixo: só "12" e "10") | eixo com só dois números vale quando os dois caem em linhas da grade e a grade continua com o mesmo espaçamento; o painel vai até o zero do eixo. A NPSH entra na curva LS quando está no arquivo; quando não está, não entra |

## Ponto na curva e NFPA 20 (ao lado da prévia)

Nos campos **Curva da bomba** e **Folha de dados completa do fabricante**, ao lado da prévia da curva:

- **Vazão (m³/h)** e **Altura (mca)**: vêm preenchidas com o ponto usado (da folha do fabricante ou o da formação que cai sobre a curva). Ao mudar e sair dos campos (ou Enter), o ponto fica gravado na proposta (`propCom.fd[ITEM].ponto`), a curva é redesenhada com as marcas e a conferência é refeita. **voltar ao ponto do item** apaga o ponto informado.
- O ponto informado vale sobre o da folha e o da formação para marcar a curva; se a folha traz o nominal da seção NFPA 20, ele continua sendo a base da conferência.
- Tabela: ponto de trabalho (ou nominal), 150% da vazão e shutoff com a altura na curva, o exigido pela NFPA 20, atende/não atende, a vazão e a potência; o final da curva e a potência máxima.
- Avisos: o ponto do item que não cai sobre a curva (com os pontos da formação) e o ponto informado que fica mais de 10% acima ou abaixo da curva.
- A proposta (PDF) usa o mesmo ponto na curva e na tabela da NFPA 20.

## Regras (sem cálculo novo de preço)

- Base da NFPA 20: o ponto nominal da seção NFPA 20 da folha; sem ele, o ponto de trabalho (da folha ou o da formação que cai sobre a curva, até 10% de diferença na altura).
- 150% da vazão: altura exigida ≥ 65% da altura base. Shutoff: altura exigida ≤ 140% da altura base. Valores da folha têm prioridade; os demais são lidos na curva entre os pontos do fabricante (interpolação monotônica, sem extrapolar). Se a curva não chega a 150%, o valor fica "—".
- Sem curva do fabricante, ou com o ponto de trabalho fora dela: a tabela mostra só os limites calculados a partir do ponto de trabalho de cada bomba principal (a jockey não entra) e avisa.
- O motor de cálculo, as fórmulas e as células da planilha não mudaram (regressão: 80 cenários / 6216 valores e SPV/FACTS 11 cenários, 0 diferença).

## Teste

`tools/testes/fd_nfpa_test.js`: lê `sempa_sem_texto.pdf` por OCR, gera a curva e a proposta no padrão Folha de dados. O item do exemplo (1.370 m³/h) não cai na curva da folha de teste (568 m³/h × 106 m): o teste confere o aviso, informa 568 × 106 nos campos ao lado da prévia e confere a curva redesenhada, a conferência na tela e a tabela no PDF. Com `NOCURVA=1`, confere o caso do ponto fora da curva.
