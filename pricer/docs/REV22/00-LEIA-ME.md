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
9. [Navegação e interface](09-interface.md): menu lateral, abas da proposta, modernização visual, preenchimento inteligente, capturas antes e depois.
10. [Configurador assistido do item](10-configurador.md): alterações, funções reaproveitadas, comparação com a tela anterior, uso e manutenção.
11. [Celular e tablet](11-celular-e-tablet.md): auditoria, mudanças, resultado por resolução, testes no celular e limitações.
12. [Folha de dados: pontos de trabalho, NFPA 20, potências e NPSH](12-folha-de-dados-nfpa20.md).
13. [Arquitetura ERP/CPQ — auditoria](13-erp-auditoria.md): o que já existia, o que era parcial e o que faltava em relação ao complemento.
14. [Arquitetura ERP/CPQ — implementação](14-erp-implementacao.md): menu por módulos, numeração e máscaras, ficha do produto em abas, descrições, visões da estrutura, busca universal, testes, compatibilidade, permissões, atualização e reversão, e o que não foi feito.
15. [Padrão SAP Business One — implementação](15-sap-implementacao.md): auditoria do prompt, menu Comercial/Cadastros/Engenharia, abas da proposta com Formação de preço, listas (Modelo A) e fichas (Modelo B), design system, **equivalência financeira antes × depois** e o que não foi feito.
16. [Simulação de uso de ponta a ponta](16-simulacao-de-uso.md): cadastros, estruturas, proposta SEQ e SPV até o PDF, esforço por tarefa, coerência dos números, problemas corrigidos e pontos para decisão.
17. Manual de utilização: `pricer/docs/manual/` (DOCX, PDF, guia rápido, capturas e relatório de cobertura).
