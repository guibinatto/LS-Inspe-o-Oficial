# 22 · Servidor LS Fire: Pricer + Serviço de campo

## O pedido

Incorporar ao Pricer, como um módulo interligado, o app de manutenção de campo da LS Fire. Esse app cobre:
- contratos e agenda;
- técnicos;
- inspeções NFPA 25 e start-up NFPA 20, com curva da bomba;
- relatórios com assinatura e aprovação.

O pedido também foi limitar os acessos ao módulo e ao pessoal de Service e Assistência Técnica.

A decisão foi colocar **tudo no servidor da LS Fire**, com login próprio e permissões garantidas pelo servidor. O técnico continua com o app no celular funcionando offline. Os detalhes de instalação e segurança estão em `servidor/LEIA-PRIMEIRO.md`, `servidor/INSTALACAO-TI.md` e `servidor/SEGURANCA.md`.

## Como foi feito

| Parte | O que é |
|---|---|
| `servidor/server.js` + `lib/` | Servidor Node com: login (scrypt, sessão por cookie, senha provisória, bloqueio por senha errada), usuários, banco do Pricer em arquivo, sincronização do serviço filtrada por perfil, anexos, backup e importação do backup do Pricer |
| `servidor/public/lsf-shim.js` | O Pricer foi feito para o banco do claude.ai (`window.claude.use('db' / 'user' / 'downloads' / 'assets')`). Esta camada oferece as mesmas funções falando com o servidor, então o código do Pricer quase não muda. O servidor a injeta no Pricer ao entregá-lo |
| `servidor/servico-web/` | O app de campo (React), adaptado: login, usuários e permissões vêm do servidor; começa sem dados de exemplo; botão **Orçar no Pricer**; contrato mostra a proposta de origem; fica em `/servico/` (PWA) |
| Pricer (`app.js`, `spv.js`, `index.html`) | Aba **Serviço de campo** (o módulo numa moldura); **Criar o contrato no Serviço de campo** na SPV de contrato ganha; orçamento a partir do relatório; **Usuários e acessos**; botão da conta (trocar senha e sair); **Trazer os dados do claude.ai**. Tudo isso só aparece no servidor; no claude.ai e no arquivo local o Pricer fica como estava |

## Acessos

Cada pessoa tem um nível no **Pricer** e um perfil no **Serviço de campo**, independentes. As tabelas completas estão em `servidor/SEGURANCA.md`. Em resumo:

- **Service e Assistência Técnica** (Pricer = Sem acesso): o servidor não entrega o Pricer e nega a API do banco dele. Essas pessoas não veem propostas, preços, custos nem margens.
- **Técnico:** não recebe valores de contrato, não aprova relatório e não altera contrato nem técnico.
- **Cliente:** vê só o contrato e os relatórios dele, sem valores, e não grava nada.
- **Gestor de serviço:** cria contratos (também a partir da proposta) e aprova relatórios. Para orçar e criar contrato pelo Pricer, precisa também do nível Comercial no Pricer.

## Ligações entre os dois

1. **Proposta ganha → contrato.**
   - Vale para a SPV com contrato recorrente ou tipo ITM, com status Ganha.
   - Vão para o contrato: cliente, local, duração, visitas por ano, mensalidade e número da proposta.
   - O contrato recebe número da série 200000, e a mesma proposta não gera dois contratos.
2. **Relatório → orçamento.**
   - As não conformidades do relatório viram o escopo de uma SPV nova, com o cliente e o local do contrato.
   - O preço é feito no Pricer.
3. **Usuários:** um cadastro só. O login do técnico fica ligado ao técnico do Serviço de campo, para "Meus atendimentos".

## Cálculo

Nenhuma fórmula do Pricer mudou. As regressões continuam com 0 diferença:

| Regressão | Resultado |
|---|---|
| motor | 80 cenários, 6216 valores |
| SPV/FACTS | 11 cenários |
| financeiro pela tela | 137 números |

No servidor, o exemplo Cocamar dá o mesmo total do Pricer local (R$ 4.258.300,00). Isso foi conferido no teste de migração, que carrega o backup completo no servidor.

## Testes

| Teste | O que confere | Resultado |
|---|---|---|
| `servidor/test/api_test.mjs` (`npm test`) | Login, senha provisória, CSRF, níveis do Pricer, perfis do serviço (sem valores, aprovação protegida, cliente só o dele), junção sem perder dados, ligações, bloqueio, sessão, nenhum segredo no disco | 61 ok |
| `servidor/test/e2e_test.mjs` | No navegador: gestor entra, abre o Serviço de campo dentro do Pricer, o relatório vira SPV, salva no servidor, proposta de contrato ganha vira contrato. Técnico entra direto no serviço, sem Pricer e sem valores, sem rolagem lateral no celular | 17 ok |
| `servidor/test/migracao_test.mjs` | Backup completo do Pricer → servidor: cadastro, propostas, mesmo total | 10 ok |
| Testes do Pricer (`separa`, `servico_html`, `ux`, `sim`) e regressões | O Pricer no claude.ai e no arquivo local continua igual | ok |

Os testes rodaram no Chromium deste ambiente, em largura de computador e de celular (390 px). Não houve teste em celulares de verdade nem no servidor da empresa.

## Limitações

- **IA do Claude:** o que usa a IA (leitura de documento de fornecedor, e-mail pelo Microsoft 365) não existe no servidor.
- **Duas versões separadas:** a do claude.ai continua existindo, mas não sincroniza com o servidor. Depois da migração, o banco oficial é o do servidor.
- **Celular offline:** quem está com o celular desbloqueado vê o que aquele perfil vê. A proteção é a tela de bloqueio do próprio aparelho.
- **Mesmo registro em dois aparelhos offline:** vale o último a sincronizar.
- **Backup na mesma máquina:** o TI precisa copiar a pasta `data/` para fora todos os dias.
- **Responsáveis e anexos:** os responsáveis por área, os aprovadores e os PDFs anexados não vêm no backup do claude.ai e precisam ser refeitos no servidor.

## Visualização no claude.ai

O módulo também foi colocado no Pricer publicado no claude.ai, como visualização, para usar antes de o servidor ser instalado.

- **Onde está:** item **Serviço de campo** no menu lateral. O módulo (pasta `pricer/servico-claude`, gerada com `LSF_ALVO=claude npx vite build` em `servidor/servico-web`) é publicado junto com o Pricer e roda numa moldura.
- **Onde ficam os dados:** o módulo pede ao Pricer, por mensagens; o Pricer grava no banco do claude.ai, um documento por registro, nas coleções `svc_contratos`, `svc_tecnicos`, `svc_visitas`, `svc_relatorios`, `svc_auditoria`, `svc_notificacoes` e `svc_meta` (numeração).
- **Perfis:**
  - o dono do link é Administrador;
  - as listas **Serviço de campo: Gestor / Coordenador / Supervisor / Técnico** ficam em Configurações → Usuários e permissões → Responsáveis por área;
  - quem não está em nenhuma lista: Editor vira Gestor, os demais viram Técnico.
- **Gravação no banco do claude.ai:**
  - contratos e técnicos: só quem tem acesso de Editor;
  - agenda, visitas, relatórios, auditoria, avisos e numeração: Contribuidor ou acima.
- **Ligações:** relatório → orçamento e proposta de contrato ganha → contrato funcionam como no servidor.
- **Limites (por isso é só visualização):**
  - não tem login próprio: cada pessoa entra com a conta do claude.ai;
  - não funciona offline;
  - a regra de "técnico sem valores" e a proteção da aprovação são aplicadas pelo app, não pelo banco: quem tem acesso de Contribuidor ou Editor ao link consegue ler tudo pelo navegador;
  - relatórios com muitas fotos podem passar do tamanho máximo de um documento do banco.

Teste: `pricer/tools/testes/servico_claude_test.js` (14 verificações). Ele simula o banco do claude.ai e confere:
- o menu e o módulo dentro do Pricer;
- a gravação por registro e a numeração;
- o orçamento a partir do relatório e o contrato a partir da proposta;
- os perfis em Responsáveis por área;
- o técnico sem valores, com o relatório entrando como pendente.
