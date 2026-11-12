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
