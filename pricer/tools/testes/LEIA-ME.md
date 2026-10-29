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
