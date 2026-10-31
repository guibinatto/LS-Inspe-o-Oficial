# Testes executados e resultados

Data: 29/10/2026. Arquivo testado: `pricer/dist/ls-pricer.html` gerado do commit final da REV22. Navegador: Chromium (Playwright), sem acesso à internet.

## 1. Regressão de cálculo

| Teste | Resultado |
|---|---|
| Motor SEQ: 80 cenários (exemplo, variações e os 72 modelos do MONTADOR) | **6.216 valores, 0 diferença** em relação à REV21 |
| SPV (todos os tipos) e FACTS: totais da barra de resumo | **11 cenários, 24 valores, 0 diferença** |

Detalhes em `05-regressao-calculo.md`.

## 2. Testes de interface (19 scripts, `pricer/tools/testes/`)

Depois da nova navegação, os scripts foram ajustados aos seletores novos (abas `.ptab`, Sistema em Configurações) e rodaram de novo: os 19 passam sem erro de página.

Todos terminaram com código 0 e **sem erro de JavaScript na página**.

| Script | Verificações principais | Resultado |
|---|---|---|
| `cab_test` | campos obrigatórios do cabeçalho; consulta de CNPJ (resposta simulada) preenche cliente e cadastro fiscal; vendedor e AN; segue para o item com a família escolhida | ✓ |
| `jor_test` | 6 etapas abrem; custos com 59 linhas; simulador a R$ 4.000.000 dá 29,0% de margem e "precisa de aprovação"; proposta oficial intacta até converter; conversão cria a revisão 4; conferência central | ✓ |
| `alvo_test` | prévia de desconto e margem no target; aprovadores analisam no target; aplicar o valor aprovado acerta o total | ✓ |
| `ap_test` | análise no formato da planilha; reprovar exige motivo; decisões da Diretoria e do Financeiro; Excel; 5 e-mails configurados | ✓ |
| `st_test` | selo de revisão e de aprovação; "com quem está" na tela inicial, nas etapas e na trilha; trilha avança após a decisão da Diretoria | ✓ |
| `lib_test` | "lançar custo real" só depois de baixa ganha | ✓ |
| `cr_test` | tela de custo real sem dados comerciais; realizado começa igual ao previsto; grupos de materiais e mão de obra; relatório Excel | ✓ |
| `conf_test` | PDF com erro aponta divergências; PDF correto é salvo nos documentos da proposta | ✓ |
| `pend_test` | painel Minhas pendências por papel | ✓ |
| `rev_test` | revisar, ver, restaurar; salvar enviada pergunta revisão ou correção | ✓ |
| `trib_test` | cenários tributários e comparação na proposta | ✓ |
| `integ_test` | indicador "não salvas"; rascunho recuperado ao recarregar; conflito entre duas abas resolvido sem sobrescrever (a outra versão vira revisão); sem espaço no navegador aparece; aviso ao fechar | ✓ |
| `bk_test` | backup completo baixado; restauração com prévia | ✓ |
| `home_test` | botões de família e FACTS na tela inicial; família abre a proposta nova pelo cabeçalho | ✓ |
| `p25_test` | itens abaixo | ✓ |
| `p26_test` | itens abaixo | ✓ |
| `c1_test`, `c2_test`, `c3_test` | cadastro guiado, preços da época, edição em massa, estruturas em rascunho, testador, regras, importação de provisórios, biblioteca, kits (detalhes em `08-cadastro.md`) | ✓ |

### `p25_test`

- **Pendências automáticas**: 4 nascem ao salvar o exemplo, com a criticidade e o departamento de cada uma.
- **Pendência manual**: criada a partir da proposta.
- **Resolver**: sem solução, é bloqueado; com solução, grava, e o histórico registra a mudança de situação.
- **Resolução automática**: com o CNPJ preenchido, a pendência "Falta preencher: CNPJ" se resolve sozinha.
- **Acompanhamento**: os filtros por situação e departamento funcionam.
- **Comparação Rev. 3 → Rev. 4**: mostra total −R$ 211.940,55, margem −3,4 p.p., itens alterados e "precisa de nova aprovação".
- **Versão enviada**: marcar "enviada ao cliente" congela a revisão (`_r4_enviada`).
- **Painel**:
  - etapas e valores, margem ponderada 29,8% e prazo de elaboração;
  - o filtro "Só SPV" mostra o estado vazio.
- **Lixeira**: excluir manda para a lixeira; restaurar volta a proposta.
- **Perfis**: a matriz de perfis e permissões aparece.

### `p26_test`

- **Regra de configuração**:
  - Sem fonte, não salva.
  - A regra "SKID exige componente PAINEL XYZ", impeditiva, aparece como impeditiva na conferência do item 01.
- **Tema**: alterna automático → claro → escuro → automático.
- **Teclado**: Esc fecha a janela; Ctrl+S salva.
- **Documentos**: a tela abre.

## 3. O que não foi testado aqui

- App compartilhado com várias pessoas reais: assinaturas de aprovação, regra do dono em `meta/acessos`, perfis por pessoa. A lógica foi revisada, mas o banco do claude.ai não está disponível neste ambiente. Ver o roteiro em `06-implantacao-migracao-rollback.md`, "Verificação depois de implantar".
- Envio pelo Outlook (conector Microsoft 365).
- Telas de celular: o layout foi ajustado por CSS, mas os testes rodaram em 1440 × 900.

## Configurador assistido (`cfg_test`, 30/10/2026)

| # | Verificação | Resultado |
|---|---|---|
| 1 | Item novo abre em 1. Configurar, com as famílias com estrutura | ✓ 6 famílias |
| 2 | Modelos prontos com pesquisa e filtro por acionamento | ✓ busca "1500" → 2 |
| 3 | Modelo aplicado; características com a origem de cada valor | ✓ "do modelo pronto" |
| 4 | Composição classificada pela estrutura | ✓ 26 componentes: 7 obrigatórios, 14 condicionais, 5 incluídos pelo fornecedor |
| 5 | "Por que este componente?" com dados reais da estrutura | ✓ linha 98, regra "Potência do diesel → TANQUE", "Motor diesel de 217 HP → faixa de 181 a 265 HP" |
| 7–8 | Configuração especial: quantidade da estrutura +1 e Restaurar padrão | ✓ R$ 316.071,95 → R$ 408.771,95 → R$ 316.071,95 |
| 9 | Adicionar componente do cadastro; não encontrado oferece pedido de cadastro | ✓ |
| 10–11 | Conferência em três níveis, com as ações dos alertas; confirmação com data e responsável | ✓ |
| 12–15 | Adicionar à proposta: grava, confirma só depois de gravar, não duplica, continua depois de recarregar | ✓ 4 itens → 4 itens; "Salvo" |
| 16 | Configurador × testador de estruturas (fluxo anterior) | ✓ 8 de 8 modelos iguais em custo e componentes |
| 17–18 | Celular e tablet sem rolagem lateral; etapas como botões com `aria-current` | ✓ |

Capturas reais: `interface/configurador/cfg_1_familia.jpg` a `cfg_6_escuro.jpg`.

## Celular e tablet (`mobile_test` e `mobile_audit`, 30/10/2026)

Detalhes, tabela por resolução e limitações em `11-celular-e-tablet.md`. Todos os 31 scripts de interface foram rodados de novo com a versão para celular: os 31 terminaram com código 0 e sem erro de página. A regressão do motor (80 cenários, 6.216 valores) e a de SPV/FACTS (11 cenários) continuam com 0 diferença.


## Arquitetura ERP/CPQ (31/10/2026)

| Teste | Resultado |
|---|---|
| `erp_test.js` | 27 de 27 (menu por módulos, pesquisa no menu, recolhido, busca universal, ficha em abas, numeração na proposta, visões da estrutura, Ajuda) |
| `numeracao_test.js` | 11 de 11 (reserva simultânea sem repetição com banco simulado, contador, máscaras, permissão, insumo simultâneo) |
| Suíte completa (36 testes) | 36 de 36 com saída 0 |
| Regressão do motor e SPV/FACTS | 0 diferença |
| Auditoria do celular (10 resoluções × 33 telas) | 0 pendências |

Detalhes em `14-erp-implementacao.md`.
