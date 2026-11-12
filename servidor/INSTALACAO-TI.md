# Servidor LS Fire — instalação (Pricer + Serviço de campo)

Um servidor Node.js serve, no mesmo endereço:

| Endereço | O quê | Quem acessa |
|---|---|---|
| `/login` | tela de entrada | todos |
| `/` | LS Pricer (arquivo único, `app/pricer.html`) | só quem tem nível no Pricer. O servidor não entrega o arquivo a quem não tem |
| `/servico/` | Serviço de campo (PWA: instala no celular, funciona offline) | quem tem perfil de serviço. A "casca" do app abre sem login, e os dados exigem login |
| `/api/...` | banco do Pricer, sincronização do serviço, usuários, backup | conforme o perfil (`SEGURANCA.md`) |

O banco fica em arquivos JSON na pasta `data/`, sem banco de dados externo e sem módulos nativos. A única dependência é o `express`.

## 1. Conteúdo

```
servidor/
├── server.js            servidor (rotas, login, permissões)
├── lib/                 usuários e sessões, regras de acesso, banco do Pricer
├── app/pricer.html      o Pricer (gerado por tools/montar.sh; não fica público)
├── public/              login.html, lsf-shim.js (o Pricer usando o banco do servidor), ícones
│   └── servico/         Serviço de campo compilado (gerado por tools/montar.sh)
├── servico-web/         código-fonte do Serviço de campo (React + Vite)
├── data/                banco, usuários, sessões, anexos e backups (criada no uso; NÃO vai para o git)
├── test/                testes (npm test; e2e e migração com Playwright)
├── tools/montar.sh      monta o pacote a partir do repositório
└── exemplos/            Caddyfile (HTTPS) e lsfire.service (systemd)
```

## 2. Pré-requisitos

- **Node.js 18+**, de preferência 20 ou 22: confira com `node -v`.
- **Python 3**, só para montar o pacote a partir do repositório (gera o Pricer).
- Um **subdomínio público**, ex.: `app.lsfire.com.br`. Os celulares dos técnicos acessam pela rede móvel.
- **HTTPS obrigatório:** o app só instala no celular e funciona offline em HTTPS, e o cookie de login só vai por HTTPS.

## 3. Montar e subir

```bash
# no repositório (uma vez por versão nova)
bash servidor/tools/montar.sh          # gera app/pricer.html e public/servico/, instala o express

# copie a pasta servidor/ para o servidor, ex. /opt/lsfire/servidor (sem a pasta data/ de testes)
cd /opt/lsfire/servidor
cp .env.example .env                   # ajuste porta, ADMIN_TOKEN e backup
node server.js                         # teste rápido; depois use o systemd (passo 5)
```

No primeiro início, o console mostra:

```
PRIMEIRO ACESSO → login: admin   senha: <sorteada>
```

A senha também fica em `data/SENHA-INICIAL.txt`, com permissão só do dono. Entre com ela: o sistema pede uma senha nova na hora. **Depois, apague o arquivo.** Para escolher a senha inicial, defina `ADMIN_SENHA_INICIAL` no `.env` antes do primeiro início.

## 4. HTTPS (Caddy)

`exemplos/Caddyfile`:

```
app.lsfire.com.br {
    reverse_proxy 127.0.0.1:8080
}
```

O Caddy emite e renova o certificado sozinho. Com outro proxy (nginx, IIS), repasse os cabeçalhos `X-Forwarded-Proto` e `X-Forwarded-For` e use `COOKIE_SECURE=1`. Se o proxy estiver em outra máquina, defina `TRUST_PROXY` com o IP dele.

O Pricer (~9 MB) vai comprimido (~2,5 MB) e o navegador guarda a cópia: nas visitas seguintes, só confere se mudou. Não precisa configurar compressão no proxy.

## 5. Rodar como serviço

`exemplos/lsfire.service`: copie para `/etc/systemd/system/`, ajuste a pasta e o usuário e rode `systemctl daemon-reload && systemctl enable --now lsfire`. Use um usuário próprio (ex.: `lsfire`) dono da pasta `data/`.

## 6. Variáveis (`.env`)

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 8080 | porta interna (atrás do Caddy) |
| `ADMIN_SENHA_INICIAL` | sorteada | senha do primeiro `admin` |
| `SESSAO_DIAS` | 30 | dias que o login vale sem uso. O técnico fica offline por dias |
| `ADMIN_TOKEN` | vazio | exportar e fazer backup por script (`/api/export?token=…`). O administrador logado não precisa |
| `BACKUP_INTERVAL_HORAS` / `BACKUP_MANTER` | 6 / 30 | backup automático em `data/backups/` |
| `RATE_LIMIT_MAX` | 600 | requisições por minuto por IP na API. O login tem limite próprio |
| `COOKIE_SECURE` | segue o protocolo | `1` = cookie só por HTTPS (produção) |
| `TRUST_PROXY` | só o proxy desta máquina | de quem aceitar o `X-Forwarded-For`. Com o Caddy na mesma máquina, deixe vazio. Proxy em outra máquina: o IP dele. `0` = não aceitar de ninguém |
| `DATA_DIR` | `./data` | onde ficam os dados |

## 7. Primeiros passos no sistema (administrador)

1. Entre como `admin` e troque a senha.
2. **Configurações → Backup e restauração → Trazer os dados do claude.ai.** Envie o backup completo baixado no Pricer do claude.ai: cadastro, propostas etc. (detalhes em `LEIA-PRIMEIRO.md`).
3. **Configurações → Usuários e permissões → Novo usuário** para cada pessoa:
   - nível no Pricer e perfil no Serviço de campo;
   - se for técnico, o técnico do cadastro do Serviço de campo.

   A senha é provisória: a pessoa troca no primeiro acesso.
4. No Serviço de campo, cadastre os técnicos e depois ligue cada login de técnico ao técnico certo, no passo 3.
5. Defina de novo os responsáveis por área e os aprovadores, na mesma tela de usuários e permissões.

## 8. Backup

- **Automático:** a cada 6 horas, em `data/backups/backup-<data>/`, com o banco do Pricer, os dados do serviço, os usuários e os contadores. Mantém os 30 mais recentes. Também roda antes e depois de cada importação.
- **Manual:** `POST /api/backup`, como administrador ou com o `ADMIN_TOKEN`.
- **Exportação:** `GET /api/export`, um JSON com o serviço, o Pricer e os usuários. Os usuários vão sem as senhas.
- **Importante:** o backup fica na mesma máquina. Copie a pasta `data/` (ou `data/backups/`) para fora dela, num NAS ou na nuvem, todos os dias.
- **Os anexos do Pricer** ficam em `data/assets/` e entram na cópia da pasta `data/`.

**Para restaurar:** pare o serviço, copie os arquivos de um `backup-<data>/` para `data/` e inicie de novo.

## 9. Atualizar a versão

1. No repositório: `bash servidor/tools/montar.sh`.
2. Copie `server.js`, `lib/`, `app/`, `public/` e `package*.json` para o servidor. **Não sobrescreva `data/` nem `.env`.**
3. `systemctl restart lsfire`.

Os celulares pegam a versão nova do Serviço de campo sozinhos, na próxima abertura com internet.

## 10. Testes

```bash
cd servidor
npm test                      # 61 verificações de login, permissões e sincronização (sobe um servidor temporário)
node test/e2e_test.mjs        # navegador: Pricer + Serviço de campo, gestor e técnico (precisa do Playwright)
node test/migracao_test.mjs   # navegador: backup do Pricer → servidor, mesmo total no exemplo Cocamar
```
