# LS Pricer (app)

Versão web da planilha **LS PRICER REV21** (formação de preço de conjuntos motobomba).
A REV21 é a REV20 com as correções de `tools/patch_rev20.py`.
As contas são as mesmas da planilha: o `engine.js` executa as ~34 mil fórmulas originais
célula a célula, e a interface organiza as abas em telas.

O app abre numa **página inicial**: busca nas propostas salvas (cliente, número, peça,
fornecedor), status de cada proposta e dois caminhos — **SEQ** (equipamentos, a planilha REV21)
e **SPV** (serviços e pós-venda: serviço em campo/fábrica, peças, inspeção e contrato,
treinamento, locação…). A formação de custo SPV segue a planilha *PRECIFICAÇÃO SERVIÇOS
MASTERDOC*: equipe × diárias + deslocamento, multiplicador, impostos e comissões sobre a
venda bruta e lucro líquido mínimo de 40%. **Documentos** guarda orçamentos, notas e
contratos ligados às propostas; no app publicado, Claude lê o PDF ou a foto do orçamento
e traz os itens para as peças.

## Como usar
- **Arquivo único:** abra `dist/ls-pricer.html` no navegador. Não precisa instalar nada.
- **Gerar o arquivo único:** `python3 tools/build.py`
- **Corrigir uma REV20:** `python3 tools/patch_rev20.py entrada.xlsx saida.xlsx`

## Arquivos
- `engine.js` — motor de fórmulas · `model.js` — planilha REV21 (fórmulas, listas, exemplo COCAMAR)
- `app.js` — telas · `cadastro.js` — cadastro compartilhado · `docs.js` — Memorial/FCI em PDF e Excel
- `spv.js` — página inicial, formação de custo SPV, documentos e leitura de orçamentos
- `fci-template.js` / `templates/Calculo_FCI.xlsx` — template oficial da FCI
