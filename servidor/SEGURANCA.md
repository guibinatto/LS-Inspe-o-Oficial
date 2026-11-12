# Servidor LS Fire — segurança

Este documento diz o que o servidor garante e o que ainda é limite. Leia antes de colocar dados reais de clientes.

## Princípio

Esconder botão na tela não é segurança. **Toda regra de acesso abaixo é conferida no servidor**, em cada requisição. A tela só esconde o que a pessoa já não pode fazer.

## Login e sessão

- **Senha:** `scrypt` (Node `crypto`), com salt aleatório por usuário. A comparação é em tempo constante. Nenhuma senha fica em texto, nem no disco nem nos logs.
- **Senha provisória:** a primeira senha, ou uma redefinida pelo administrador, precisa ser trocada antes de qualquer outra coisa. Até lá, a API responde 403.
- **Regras de senha:** mínimo de 8 caracteres, com letras e números. Também precisa ser diferente da atual.
- **Bloqueio:** 5 senhas erradas seguidas travam aquele login por 15 minutos. O login também tem limite de 20 tentativas por minuto por IP.
- **Sessão:** um token aleatório de 32 bytes num cookie `HttpOnly` e `SameSite=Lax`, com `Secure` em HTTPS. No disco fica só o SHA-256 do token. O padrão é 30 dias sem uso (`SESSAO_DIAS`).
- **Desativar ou trocar a senha** de um usuário encerra as sessões dele na hora.
- **CSRF:** toda gravação na API exige o cabeçalho `X-LSF: 1`, que outro site não consegue mandar.
- **Cabeçalhos:**
  - `X-Frame-Options: SAMEORIGIN`: só o próprio Pricer põe o serviço numa moldura;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: same-origin`.

## Quem pode o quê

### LS Pricer

| Nível | Lê | Grava |
|---|---|---|
| Sem acesso | **nada**: o servidor não entrega o Pricer (vai para `/servico/`) e a API do banco responde 403 | nada |
| Consulta | tudo do Pricer | nada |
| Comercial | tudo | propostas, documentos, baixas, pedidos, histórico, aprovações, revisões, pendências, modelos de item, a própria assinatura e anexos |
| Editor | tudo | também o cadastro (insumos, kits, tabelas) e as configurações |
| Administrador | tudo | tudo, mais os responsáveis por área, os usuários, o backup e a importação |

As áreas responsáveis (Custos, Engenharia, Fiscal…) e os aprovadores de desconto continuam conferidos pelo app, como no claude.ai.

### Serviço de campo

| Perfil | Valores de contrato | Contratos | Técnicos | Agenda e visitas | Relatórios | Aprovar relatório | Excluir |
|---|---|---|---|---|---|---|---|
| Administrador (o do Pricer) | vê | cria e altera | cria e altera | sim | sim | sim | sim |
| Gestor | vê | cria e altera | cria e altera | sim | sim | sim | não |
| Coordenador | vê | não | cria e altera | sim | sim | sim | não |
| Supervisor | vê | não | não | sim | sim | sim | não |
| Técnico | **não recebe** | não | não | sim | cria e corrige os pendentes ou devolvidos | **não** | não |
| Cliente | **não recebe** | só o dele, leitura | não | só leitura | só os do contrato dele | não | não |

**Valores:** qualquer campo começado por *valor*, *preço*, *custo*, *margem* ou *desconto*, em qualquer nível do registro, é retirado antes de ir para o Técnico ou o Cliente. Quando o técnico grava um registro, o servidor devolve esses campos do jeito que estavam guardados.

**Aprovação:** um relatório criado ou alterado por quem não aprova entra sempre como **pendente**. Depois de aprovado, não muda mais por quem não aprova.

**Sincronização:** o servidor junta registro a registro, pelo `id`, sem sobrescrever a lista inteira:
- o que o perfil não pode criar, alterar ou excluir é ignorado;
- o que o perfil não enxerga fica como está;
- um registro só é excluído se o aparelho já o conhecia (existia antes da última sincronização dele) e se o perfil pode excluir. Assim, um celular que ficou dias offline não apaga o que outros criaram.

**Ligações com o Pricer:**
- Criar contrato a partir da proposta exige nível Comercial no Pricer **e** perfil Gestor (ou Administrador).
- Ler o relatório para orçamento exige nível Comercial no Pricer e perfil de serviço.
- O Técnico, sem Pricer, não usa nenhum dos dois.

## Arquivos

- `data/usuarios.json` e `data/sessoes.json` são gravados com permissão `600`. O serviço do systemd usa `UMask=0077`.
- **Anexos do Pricer:** só tipos permitidos (imagem, PDF, Excel, CSV, texto, XML), até 20 MB. Ficam em `data/assets/` e só quem tem nível no Pricer baixa (`/_blob/<id>`). SVG é servido sem permissão de script.
- **O arquivo do Pricer** (`app/pricer.html`) fica fora da pasta pública e só sai para quem tem nível no Pricer. Ele contém a base de custos da planilha.

## Limites conhecidos

- **Celular offline:** o Serviço de campo guarda os dados no aparelho para funcionar sem internet. Quem tem o celular desbloqueado e o app aberto vê o que aquele perfil vê. A proteção do aparelho é a tela de bloqueio do próprio celular. O bloqueio por inatividade com senha local do app antigo foi retirado, porque sem internet não há como conferir a senha no servidor.
- **Conflito entre aparelhos:** se dois aparelhos alteram o **mesmo** registro offline, vale o que sincronizar por último. Registros diferentes não se atrapalham.
- **Banco em arquivo:** é adequado para a equipe atual (dezenas de usuários). Para centenas de usuários simultâneos, vale migrar para um banco de dados.
- **Backup:** fica na mesma máquina até o TI copiar para fora (ver `INSTALACAO-TI.md`).
- **Revisão de segurança:** este documento é uma avaliação honesta de quem montou o sistema, não uma auditoria. Antes de abrir o acesso a clientes externos (perfil Cliente), vale uma revisão de segurança feita por especialista.

## Testes de segurança incluídos

`npm test` (61 verificações) confere, entre outros:
- o técnico não recebe o Pricer nem lê ou grava o banco dele, mesmo chamando a API direto;
- o técnico não recebe valores e não aprova relatório;
- o cliente só vê o dele;
- o Comercial não altera cadastro;
- CSRF, senha provisória, bloqueio por senha errada e fim da sessão ao desativar;
- nenhuma senha nem token em texto no disco.
