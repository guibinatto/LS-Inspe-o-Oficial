# Testes de interface (Playwright)

Cada script abre `../../dist/ls-pricer.html` no Chromium e percorre um fluxo, sem internet: as chamadas https são bloqueadas.

## Como rodar

1. Gere o arquivo único: `python3 tools/build.py`.
2. Crie uma pasta de trabalho, porque os testes gravam capturas de tela e arquivos na pasta atual. Por exemplo:

   ```
   mkdir -p /tmp/t && cd /tmp/t
   node <caminho>/pricer/tools/testes/jor_test.js
   ```

O Playwright precisa estar instalado globalmente: os scripts carregam de `npm root -g`.

Os testes `alvo`, `ap`, `conf` e `cr` usam o Excel e o leitor de PDF. Coloque as bibliotecas em `tools/testes/libs/`, nas mesmas versões que o app carrega do cdnjs:
- `exceljs-4.4.0/dist/exceljs.min.js`
- `pdfjs-dist-3.11.174/build/pdf.min.js`
- `pdfjs-dist-3.11.174/build/pdf.worker.min.js`

Cada teste imprime o que verificou. A última linha é `erros [...]`, com os erros de JavaScript da página; o esperado é `erros []`.

| Script | O que cobre |
|---|---|
| `cab_test` | cabeçalho obrigatório, CNPJ (resposta simulada), vendedor e AN |
| `jor_test` | as 6 etapas, custos, simulador, conferência central, conversão em revisão |
| `alvo_test` | aprovação com valor target, prévia, aplicar o valor aprovado |
| `ap_test` | aprovações: análise, decisões, Excel, e-mails |
| `st_test` | situação da aprovação na tela inicial, nas etapas e na trilha |
| `lib_test` | custo real só depois de ganha |
| `cr_test` | lançamento de custo real e relatório |
| `conf_test` | conferência do PDF: divergências e PDF correto salvo |
| `pend_test` | painel Minhas pendências por papel |
| `rev_test` | revisar, ver, restaurar, salvar enviada |
| `trib_test` | cenários tributários da reforma |
| `integ_test` | indicador, rascunho recuperado, conflito entre abas, falha de armazenamento, aviso ao fechar |
| `bk_test` | backup completo e restauração |
| `home_test` | botões da tela inicial |
| `p25_test` | pendências com acompanhamento, comparação de revisões, versão enviada congelada, painel, lixeira, perfis |
| `p26_test` | regras de configuração, tema, Esc, Ctrl+S, documentos |
| `c1_test` | Cadastro: todas as abas, ficha guiada (descrição gerada, duplicidade, comercial), gravação das características, testador |
| `c2_test` | Testador com origem; preços da época (proposta enviada não muda e oferece atualização seletiva); edição em massa e desfazer; estrutura em rascunho, impacto nos modelos prontos e publicação |
| `c3_test` | Central de regras (rascunho não vale na proposta), comparação de modelos no testador, cobertura dos modelos prontos, campos por família, importação de provisórios, biblioteca de configurações, comparação de kits |
| `sim_test` | simulação de ponta a ponta: família e insumo novos, componente opcional na estrutura, proposta SEQ do cabeçalho ao PDF; confere composição, impostos do documento, escopo com o conteúdo dos kits e pressão (com `SEMPA_PDF`, também a NFPA 20 pela curva do fabricante) |
| `imp_test` | rascunho recuperado reabre na proposta, no item e na etapa do configurador (salvo, abre no Início); impressão A4 da SEQ e da SPV (Ctrl+P ou botão Imprimir) com cliente, itens, tributos, totais e condições iguais à formação |
| `derat_test` | perda de potência do diesel (NFPA 20): sem altitude/temperatura a frase genérica some; com 1.200 m e 40 °C a PTC traz o cálculo (fator conferido), a FD a coluna "Pot. no local" e (com `SEMPA_PDF`) a nota contra a potência máxima da curva; frase em inglês |
| `importa_test` | importar proposta antiga: com `IMP_XLSX`, `IMP_TEC` e `IMP_COM` (planilha LS PRICER e PDFs da técnica e da comercial), confere a prévia (versão, número, custo, preços da planilha/PDF/app, textos), o preço mantido, o escopo, o código, as parcelas, os volumes, a opção com abatimento, os desvios da especificação e a emissão da técnica e da comercial em dois PDFs |
| `simmargem_test` | Formação → Desconto × margem: desconto mostra a margem, margem desejada acha o desconto, a proposta não muda até Aplicar e, aplicada, fica com a margem pedida |
| `varredura_test` | todas as telas do menu no computador e no celular (erro, tela vazia, rolagem lateral); os 10 tipos SPV/FACTS até o PDF conferido; "Ajustar à margem mínima" em 12 modelos prontos (margem final 30,0%); Primeira Maiúscula nos nomes |
| `sap_test` | menu, abas da proposta, composição do preço, listas (Modelo A), ficha (Modelo B), painel do componente |

`node tools/testes/familias_rt.js` confere, sem navegador, se os modelos de descrição de cada família reproduzem exatamente os nomes do cadastro que já seguem o padrão.
