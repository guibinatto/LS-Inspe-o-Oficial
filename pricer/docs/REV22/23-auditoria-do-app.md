# 23 · Auditoria do app inteiro (Pricer + Serviço de campo + servidor)

## O pedido

Analisar o app como um todo, como desenvolvedor, designer e TI:
- corrigir e melhorar;
- propor soluções;
- organizar os fluxos.

Nenhuma fórmula, referência, índice ou arredondamento do cálculo mudou.

## Segurança do servidor

A revisão foi feita lendo o código e tentando cada ataque contra um servidor de teste. Tudo o que foi provado foi corrigido em `servidor/lib/acesso.js`, `servidor/lib/usuarios.js` e `servidor/server.js`, e virou teste em `npm test` (de 61 para 70 verificações).

| Problema | Gravidade | Correção |
|---|---|---|
| Técnico e cliente recebiam valores de contrato com outros nomes (mensalidade, total, honorário, BDI, total do equipamento) | Alta | No contrato, só sai o que está numa lista de campos permitidos. Nos outros registros, o filtro de nomes de dinheiro ficou mais largo |
| Técnico gravava a aprovação ("Aprovado" com maiúscula, aprovador forjado) | Alta | Quem não aprova nunca escreve a aprovação. O reenvio do devolvido volta a pendente, montado pelo servidor, com histórico. A visita não fica "concluída" sem aprovação |
| `X-Forwarded-For` burlava o limite de tentativas por IP | Média | O cabeçalho só vale vindo do proxy da mesma máquina. Configurável em `TRUST_PROXY` |
| Técnico apagava avisos dos outros e assinava a auditoria em nome de outra pessoa | Baixa a média | Quem não exclui só marca o aviso como lido. O autor da auditoria é quem está logado |
| Cinco senhas erradas de qualquer lugar travavam a conta da vítima | Baixa | 5 erros travam o login só para aquele endereço; 25 erros de todos os endereços travam o login para todos |
| `__proto__` e `constructor` em caminho do banco (não explorável hoje) | Prevenção | Recusados |

Os detalhes estão em `servidor/SEGURANCA.md`.

## Acessibilidade e visual

As telas foram verificadas com o axe-core 4.10.2 (WCAG 2.1 A e AA), nos temas claro e escuro.

| Tela | Antes | Depois |
|---|---|---|
| Pricer, 6 telas, tema claro | 207 elementos com contraste baixo | 0 |
| Pricer, tema escuro | 41 | 0 |
| Serviço de campo, 10 abas × 2 temas, e login | contraste, botões só com ícone sem nome, filtros sem nome | 0 |

O que mudou:
- **Botões e selos laranja preenchidos:**
  - usam o token novo `--or-fill` (#C94A06), com contraste de 4,7:1 com o texto branco;
  - antes era 3,6:1 no tema claro e 2,6:1 no escuro;
  - o laranja da marca (`--or`) continua nas linhas, nos ícones e no item ativo do menu.
- **Texto secundário** (`--ink3`):
  - tema claro: de #83868C para #6B6E74;
  - tema escuro: de #8A8781 para #9A978F.
- **Texto laranja no Serviço de campo:** usa o tom escuro do Pricer (`--or-ink`).
- **Campo obrigatório** deixava o texto digitado laranja: a regra feita para o asterisco valia para o campo inteiro.
- **Nomes para leitor de tela:** os botões só com ícone e os filtros do Serviço de campo ganharam nome.
- **Iniciais dos técnicos:** a cor é escurecida só na tela, para as iniciais em branco ficarem legíveis.

## Desempenho

O Pricer (~9,5 MB) saía do servidor sem compressão e sem cache. Agora:
- sai com gzip, em 2,55 MB;
- vai com ETag: na visita seguinte, o navegador recebe 304 sem corpo se nada mudou;
- o acesso continua conferido antes de qualquer resposta.

## Fluxos e navegação

- O ciclo comercial → serviço:

  proposta (SEQ ou SPV) → aprovação → emissão → ganha → contrato no Serviço de campo → agenda → inspeção → relatório → aprovação → não conformidades → SPV nova.

- **Serviço de campo no menu:** fica logo depois do Comercial, na ordem do trabalho.
- **Pesquisa do menu:** contava e mostrava o Serviço de campo para quem não tem acesso a ele. Corrigido; o `erp_test` acusava o problema.

## Conferência

| O quê | Resultado |
|---|---|
| Regressão do motor | 80 cenários, 6216 valores, 0 diferença |
| SPV/FACTS | 11 cenários, 24 valores, 0 diferença |
| Financeiro pela tela | 137 números, 0 diferença |
| Testes do Pricer (`tools/testes`, 48 arquivos) | todos passando |
| Servidor | API 70, navegador 17, migração 10, 0 falha |
| Ataques da revisão, rodados de novo | sem sucesso |

Não houve teste em celulares de verdade nem no servidor da empresa.

## Próximos passos sugeridos

1. **Antes de usar o servidor:**
   - instalar e migrar;
   - copiar o backup para fora da máquina;
   - testar com os técnicos em celulares reais.
2. **Antes de dar login a clientes:** auditoria externa (teste de invasão).
3. **Relatórios gerenciais:** custo real × previsto.
4. **Teste de usabilidade com vendedores.**
5. **Integração com o Ploomes**, para não digitar a proposta duas vezes.
6. **Quando crescer:**
   - banco de dados no lugar dos arquivos;
   - carregar a planilha embutida (5,7 MB) só ao abrir uma proposta SEQ.
