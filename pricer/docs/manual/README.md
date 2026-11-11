# Manuais do LS Pricer (MN · Rev. 01)

A partir da Rev. 01 são dois manuais, gerados dos mesmos capítulos:

| Entregável | Arquivo | Para quem |
|---|---|---|
| **Manual do Usuário** (PDF e Word) | `saida/MN-LS-Pricer-Manual-do-Usuario-Rev01.pdf` / `.docx` | Vendas e Precificação: proposta SEQ e SPV do zero ao envio, negociação, documentos, versão interativa, importação de proposta antiga, pendências, aprovações, margens e revisões |
| **Manual do Administrador** (PDF e Word) | `saida/MN-LS-Pricer-Manual-do-Administrador-Rev01.pdf` / `.docx` | Quem mantém o sistema: cadastros (insumos, descrições, estruturas, kits, modelos, famílias, fornecedores), configurações, perfis e permissões, numeração, backup |
| Guia rápido (PDF e Word) | `saida/MN-LS-Pricer-Guia-Rapido-Rev01.pdf` / `.docx` | Todos. "MU 4" = Manual do Usuário, capítulo 4; "MA 3" = Manual do Administrador, capítulo 3 |
| Telas originais e anotadas | `prints/original/`, `prints/anotado/` (nome = capítulo-ordem-módulo-tela) | |
| Registro de cada captura (validada ou não) | `prints/capturas-capNN.json` | |
| Relatório de cobertura e auditoria | `saida/relatorio-cobertura.md` | |

Os capítulos de cada manual e a ordem estão em `fonte/meta.js` (`manuais.usuario.caps` e `manuais.admin.caps`). Os números citados nos textos ("capítulo 9") são os dos arquivos `capNN.js`; o gerador troca pelo número do capítulo no manual gerado, ou por "capítulo N do Manual do …" quando o assunto está no outro manual.

Padrão LS Fire **Interno** (cabeçalho-tabela com logo, código, revisão e data; marca d'água "DOCUMENTO INTERNO"). Código "MN", "Elaborado por" e "Aprovado por" estão em `fonte/meta.js`: confirmar antes de distribuir.

## Como gerar de novo

```
cd pricer
python3 tools/build.py                                   # gera dist/ls-pricer.html
FONTES_CACHE=<pasta com fonts.css e map.txt> LIBS_DIR=<pasta libs, como tools/testes/libs> \
  IMP_XLSX=<planilha> IMP_TEC=<pdf técnica> IMP_COM=<pdf comercial> IMP_SPV_SERV="<masterdoc>;<planilha>;<pdf>" \
  node docs/manual/tools/capturar.js                     # capturas (todas ou: ... capturar.js 3 7)
node docs/manual/tools/gerar.js usuario                  # DOCX do Manual do Usuário
node docs/manual/tools/gerar.js admin                    # DOCX do Manual do Administrador
node docs/manual/tools/gerar.js guia                     # DOCX do guia rápido
python3 docs/manual/tools/pdf.py docs/manual/saida/<arquivo>.docx docs/manual/saida/<arquivo>.pdf
node docs/manual/tools/cobertura.js                      # relatório de cobertura e auditoria
```

- `LIBS_DIR` serve as bibliotecas do cdnjs (jsPDF, ExcelJS, pdf.js) só aos capítulos marcados com `libs: true` (versão interativa e importação), para gerar arquivos de verdade nas capturas. Os outros capítulos continuam mostrando o app sem internet.
- As variáveis `IMP_*` apontam para propostas antigas reais (planilha + PDFs). Sem elas, as duas telas de prévia da importação ficam "não validadas".
- `node docs/manual/tools/gerar.js manual` ainda gera o manual único, com todos os capítulos.

Requisitos: Playwright e o pacote `docx` instalados globalmente no Node, ImageMagick (`convert`, `identify`) e LibreOffice (para o PDF). O formato dos capítulos está em `fonte/LEIAME.md`. Sem `FONTES_CACHE`, as telas saem com Arial no lugar da fonte Barlow do app.
