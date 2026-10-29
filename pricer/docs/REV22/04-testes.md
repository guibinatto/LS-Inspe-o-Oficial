# Testes executados e resultados

Data: 29/10/2026. Arquivo testado: `pricer/dist/ls-pricer.html` gerado do commit final da REV22. Navegador: Chromium (Playwright), sem acesso à internet.

## 1. Regressão de cálculo

| Teste | Resultado |
|---|---|
| Motor SEQ: 80 cenários (exemplo, variações e os 72 modelos do MONTADOR) | **6.216 valores, 0 diferença** em relação à REV21 |
| SPV (todos os tipos) e FACTS: totais da barra de resumo | **11 cenários, 24 valores, 0 diferença** |

Detalhes em `05-regressao-calculo.md`.

## 2. Testes de interface (16 scripts, `pricer/tools/testes/`)

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
