# LEIA PRIMEIRO — servidor LS Fire (Pricer + Serviço de campo)

Esta pasta é o pacote para o TI da LS Fire hospedar, num servidor da empresa e num só endereço (ex.: `https://app.lsfire.com.br`), dois sistemas:

- **LS Pricer**: o app de propostas;
- **Serviço de campo**: o app de manutenção (contratos, agenda, técnicos, inspeções NFPA 25 e start-up NFPA 20, relatórios). Ele vira um módulo do Pricer.

O login é o mesmo para os dois. Ninguém precisa de conta no claude.ai, OpenAI ou ChatGPT.

## Como fica para cada pessoa

| Quem | Entra em | Vê |
|---|---|---|
| Comercial e Diretoria | `/` (Pricer) | Pricer completo. Com perfil de serviço, também a aba **Serviço de campo** |
| Gestor, coordenador ou supervisor de serviço | `/` ou `/servico/` | O que o nível no Pricer liberar, mais o Serviço de campo (contratos com valor, agenda, aprovação de relatórios) |
| Técnico de campo | `/servico/` (instala no celular e funciona offline) | Só o Serviço de campo, **sem valores**. O servidor nem entrega o Pricer |
| Cliente (opcional) | `/servico/` | Só o contrato e os relatórios dele, sem valores |

Os acessos são definidos pelo administrador no Pricer, em **Configurações → Usuários e permissões**. Cada pessoa tem duas configurações separadas:

- o nível no **Pricer**: Sem acesso, Consulta, Comercial, Editor ou Administrador;
- o perfil no **Serviço de campo**: Sem acesso, Gestor, Coordenador, Supervisor, Técnico ou Cliente.

As regras valem **no servidor**, não só na tela. Um técnico que abra o console do navegador e chame a API direto também recebe "sem permissão" (ver `SEGURANCA.md`).

## O que está ligado entre os dois

- **Proposta de contrato ganha → contrato no Serviço de campo.** Vale para a SPV de inspeção ou contrato recorrente. No Pricer aparece o botão **Criar o contrato no Serviço de campo**. Vão para o contrato:
  - cliente e local;
  - duração e visitas por ano;
  - mensalidade;
  - número da proposta.

  O contrato recebe número próprio (série 200000), e a mesma proposta não gera dois contratos.
- **Relatório de inspeção → orçamento no Pricer.** No relatório, o botão **Orçar no Pricer** abre uma proposta de serviço (SPV) nova. O escopo já vem com as não conformidades apontadas e com o cliente e o local do contrato. O preço é feito no Pricer, como sempre.
- **Usuários:** um cadastro só, no Pricer. O técnico do login fica ligado ao técnico do Serviço de campo, para ele ver os atendimentos dele.

## O que o TI faz

1. Ler `INSTALACAO-TI.md`: Node 18+, subdomínio, HTTPS e serviço do sistema.
2. Ler `SEGURANCA.md` antes de colocar dados reais.
3. No primeiro início, o servidor cria o usuário `admin` com uma senha sorteada. A senha aparece no console e em `data/SENHA-INICIAL.txt`. Ela é trocada no primeiro acesso.

## Trazer os dados que já estão no claude.ai

No Pricer do claude.ai, o administrador baixa o **backup completo** (Configurações → Backup e restauração). Depois envia o arquivo no Pricer do servidor, na mesma tela, em **Trazer os dados do claude.ai**. Vêm:

- o cadastro (insumos, kits e tabelas);
- as propostas, revisões, aprovações, baixas, pedidos, documentos, pendências e modelos;
- o histórico.

Não vêm:

- os responsáveis por área e os aprovadores, porque as pessoas do claude.ai não existem no servidor;
- os PDFs anexados.

Esses itens são refeitos no servidor.

Os dados do app de campo antigo (pacote `lsfire-deploy`), se já estiver em uso, ficam no arquivo `store.json` dele. Esse arquivo pode ser copiado para `data/store.json` deste servidor, com o servidor parado. Os usuários antigos do app de campo não são aproveitados, porque a senha agora é conferida pelo servidor: cadastre-os de novo em Usuários e permissões.

## O que não funciona fora do claude.ai

O que usa a IA do Claude não existe no servidor:

- a leitura de PDF, foto ou planilha de fornecedor com IA;
- o envio de e-mail pelo Microsoft 365.

O resto do Pricer funciona igual. A versão do claude.ai continua existindo como está. Depois da migração, o banco oficial passa a ser o do servidor, e as duas versões não se sincronizam.
