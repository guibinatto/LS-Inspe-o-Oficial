# Implantação, migração e rollback

## Implantação

### App compartilhado (claude.ai)

1. Antes de publicar, o administrador baixa um backup completo pela REV21 em produção, se possível. A REV21 não tem o botão: use a cópia do navegador ou exporte as propostas pelo "Abrir → Baixar .json". Depois da REV22 no ar, baixe também o backup em Cadastro → Sistema → Backup e restauração.
2. Publique a nova versão no mesmo endereço do artifact. A publicação declara as regras do banco (`capabilities.db.rules`). Novas nesta versão:
   - `pendencias`: escrita por Contribuidor;
   - `modelos`: escrita por Contribuidor;
   - `assinaturas`: leitura por todos; escrita só em `assinaturas/{self}` (cada um no seu espaço);
   - `meta/acessos`: escrita só pelo dono do app.
3. No primeiro acesso, o dono abre Cadastro → Sistema → Responsáveis e confere as listas de aprovadores Diretoria e Financeiro.

### Arquivo local (`ls-pricer.html`)

Basta substituir o arquivo. Na primeira abertura, a REV22 guarda uma cópia de tudo o que está no navegador (`lspricer.backup.antes-rev22`), desde que caiba (até 1,5 MB). Ela pode ser baixada em Sistema → Backup.

## Migração de dados

Não há migração destrutiva. Os registros da REV21 continuam válidos e os campos novos nascem quando cada registro é gravado de novo:

| Dado | O que acontece |
|---|---|
| Propostas sem `ver`/`verDoc` | A primeira gravação cria a versão 1 |
| Propostas sem `criadaEm`/`criadaPor` | O painel usa a data da última gravação. Só o administrador as manda para a lixeira (o autor original não é conhecido) |
| Aprovações decididas antes de 30/10/2026 | Valem como legado, sem assinatura |
| Aprovações decididas a partir de 30/10/2026 | Precisam de assinatura |
| Pendências | Nascem na próxima gravação de cada proposta SEQ |

Recomendação: aprovações em aberto sejam decididas de novo depois da implantação, para ficarem assinadas.

## Rollback

1. **Voltar o código**: republique a REV21 (tag `rev21`, arquivo `pricer/dist/ls-pricer.html` daquele commit) no mesmo endereço.
2. **Dados**:
   - A REV21 ignora os campos e coleções novos. Propostas gravadas pela REV22 abrem na REV21: o `doc` da planilha é o mesmo.
   - Propostas que estavam na lixeira voltam a aparecer na REV21, que não conhece o campo `excluida`.
   - Para voltar o conjunto inteiro a um ponto anterior, restaure o backup baixado antes da implantação (pela REV22, em Sistema → Backup → Restaurar, escolhendo substituir).
3. **Regras do banco**: ao republicar a REV21, publique com as regras da REV21. Nelas, `meta/acessos` volta a ser gravável por Editor.

### Arquivo local

Abra o arquivo da REV21. Os dados do navegador continuam. Para voltar exatamente ao estado de antes, restaure `ls-pricer-antes-rev22.json`.

## Verificação depois de implantar

1. Rode a regressão (`05-regressao-calculo.md`).
2. Abra uma proposta antiga e confira o total.
3. Salve e confira o indicador "✓ Salvo".
4. Peça uma aprovação de teste: com dois aprovadores reais, confira que a trilha mostra as decisões e que nada aparece como "decisão não conta".
