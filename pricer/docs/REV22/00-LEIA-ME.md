# LS Pricer REV22

Evolução da REV21 com o mesmo motor de cálculo, sem nenhuma diferença nos valores calculados.

## Conteúdo do pacote

| Item | Onde |
|---|---|
| App completo (arquivo único, abre no navegador) | `pricer/dist/ls-pricer.html` |
| Código-fonte | `pricer/*.js`, `pricer/index.html`, `pricer/tools/` |
| Gerar o arquivo único a partir do código | `python3 pricer/tools/build.py` |
| Regressão de cálculo | `pricer/tools/regressao/` |
| App compartilhado da equipe | artifact no claude.ai (mesmo endereço da REV21) |

## Relatórios

1. [Alterações](01-alteracoes.md): arquivos, commits, dados novos.
2. [Matriz de funcionalidades REV21 × REV22](02-matriz-funcionalidades.md).
3. [Novas funcionalidades e bugs corrigidos](03-novas-funcionalidades-e-bugs.md).
4. [Testes executados e resultados](04-testes.md).
5. [Regressão de cálculo](05-regressao-calculo.md).
6. [Implantação, migração e rollback](06-implantacao-migracao-rollback.md).
7. [Limitações conhecidas](07-limitacoes.md).
8. [Cadastros, padronização, estruturas e kits](08-cadastro.md): o que foi reaproveitado, cada requisito dos complementos e o que não foi feito, com o motivo.
