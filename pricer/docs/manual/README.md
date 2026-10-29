# Manual de Utilização do LS Pricer (MN · Rev. 00)

| Entregável | Arquivo |
|---|---|
| Manual completo (PDF, com sumário navegável) | `saida/MN-LS-Pricer-Manual-de-Utilizacao-Rev00.pdf` |
| Manual editável (Word) | `saida/MN-LS-Pricer-Manual-de-Utilizacao-Rev00.docx` |
| Guia rápido (PDF e Word) | `saida/MN-LS-Pricer-Guia-Rapido-Rev00.pdf` / `.docx` |
| Telas originais e anotadas | `prints/original/`, `prints/anotado/` (nome = capítulo-ordem-módulo-tela) |
| Registro de cada captura (validada ou não) | `prints/capturas-capNN.json` |
| Relatório de cobertura e auditoria | `saida/relatorio-cobertura.md` |

Padrão LS Fire **Interno** (cabeçalho-tabela com logo, código, revisão e data; marca d'água "DOCUMENTO INTERNO"). Código "MN", "Elaborado por" e "Aprovado por" estão em `fonte/meta.js`: confirmar antes de distribuir.

## Como gerar de novo

O manual é gerado a partir do app, para acompanhar as próximas revisões.

```
cd pricer
python3 tools/build.py                                   # gera dist/ls-pricer.html
FONTES_CACHE=<pasta com fonts.css e map.txt> node docs/manual/tools/capturar.js   # capturas (todas ou: ... capturar.js 3 7)
node docs/manual/tools/gerar.js manual                   # DOCX do manual
node docs/manual/tools/gerar.js guia                     # DOCX do guia rápido
python3 docs/manual/tools/pdf.py docs/manual/saida/<arquivo>.docx docs/manual/saida/<arquivo>.pdf
node docs/manual/tools/cobertura.js                      # relatório de cobertura e auditoria
```

Requisitos: Playwright e o pacote `docx` instalados globalmente no Node, ImageMagick (`convert`, `identify`) e LibreOffice (para o PDF). O formato dos capítulos está em `fonte/LEIAME.md`. Sem `FONTES_CACHE`, as telas saem com Arial no lugar da fonte Barlow do app.
