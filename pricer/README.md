# LS Pricer (app)

Versão web da planilha **LS PRICER REV21** (formação de preço de conjuntos motobomba).
A REV21 é a REV20 com as correções de `tools/patch_rev20.py`.
As contas são as mesmas da planilha: o `engine.js` executa as ~34 mil fórmulas originais
célula a célula, e a interface organiza as abas em telas.

## Como usar
- **Arquivo único:** abra `dist/ls-pricer.html` no navegador. Não precisa instalar nada.
- **Gerar o arquivo único:** `python3 tools/build.py`
- **Corrigir uma REV20:** `python3 tools/patch_rev20.py entrada.xlsx saida.xlsx`

## Arquivos
- `engine.js` — motor de fórmulas · `model.js` — planilha REV21 (fórmulas, listas, exemplo COCAMAR)
- `app.js` — telas · `cadastro.js` — cadastro compartilhado · `docs.js` — Memorial/FCI em PDF e Excel
- `fci-template.js` / `templates/Calculo_FCI.xlsx` — template oficial da FCI
