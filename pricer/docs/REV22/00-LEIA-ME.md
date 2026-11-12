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
17. [Ajustes técnicos](17-ajustes-tecnicos.md): NCM 8413.70.80 para bomba de até 18 m³/h, recalque de 5" para 450 gpm, perda de potência do diesel por altitude e temperatura (NFPA 20) e folha de desempenho no padrão Peerless.
18. [Importar proposta antiga](18-importar-proposta-antiga.md): planilha LS PRICER antiga + PDFs da técnica e da comercial viram proposta no app (preço mantido ou recalculado); parcelas por marco, volumes, opções de fornecimento e desvios da especificação no documento comercial; técnica e comercial em dois PDFs; a proposta 10.262 da Ipiranga.
19. [Usabilidade do vendedor](19-usabilidade-vendedor.md): avaliação como vendedor básico e avançado (proposta do zero, negociação, margens, descontos) e o que mudou para ter menos cliques: proposta nova repete a última, atalhos de validade, uma só área "Negociar" com atalhos de um clique, margem do topo leva à negociação, conferência sem lista repetida.
20. [Proposta de serviço e versão interativa](20-proposta-servico-e-interativa.md): PDF de serviço sem textos de fabricação, seção "Execução do serviço" (equipe, segurança/NRs, sistema fora de operação, responsabilidades, entregáveis, garantia, dados fiscais, propostas relacionadas), termos e condições em anexo; versão interativa em HTML com o PDF oficial dentro e o SHA-256 dele.
21. [Serviço com peças em duas propostas](21-separar-mo-e-pecas.md): na SPV com equipe e peças, o botão "Separar em 2 propostas" cria a proposta de peças (PAR) com número próprio, ligada à de mão de obra, como no Ploomes (10.339 + 10.342); valores iguais aos de antes, "Propostas relacionadas" preenchida, aviso com Abrir nas duas.
22. [Servidor LS Fire: Pricer + Serviço de campo](22-servidor-e-servico-de-campo.md): o app de manutenção de campo vira módulo do Pricer num servidor da empresa, com login próprio e permissões garantidas pelo servidor (Service e Assistência Técnica sem acesso ao Pricer, técnico sem valores), contrato a partir da proposta ganha, orçamento a partir do relatório e migração do backup do claude.ai. Instalação e segurança em `servidor/`.
23. [Auditoria do app inteiro](23-auditoria-do-app.md): revisão de segurança do servidor (5 problemas provados e corrigidos, 70 testes), contraste WCAG AA nos dois temas (207 → 0 no Pricer), Pricer comprimido e com cache no servidor (9,5 → 2,6 MB), Serviço de campo depois do Comercial no menu; cálculo sem diferença.
24. [Submenus do Serviço de campo](22-servidor-e-servico-de-campo.md#menu-do-serviço-de-campo): no menu do Pricer, Serviço de campo vira grupo com Agenda, Visitas, Atendimentos, Relatórios, Aprovação, Contratos, Técnicos e Auditoria, conforme o perfil; o submenu abre a tela certa do módulo e acompanha a troca feita dentro dele.
17. Manual de utilização: `pricer/docs/manual/` (DOCX, PDF, guia rápido, capturas e relatório de cobertura).
