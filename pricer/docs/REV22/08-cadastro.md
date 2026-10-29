# REV22 — Cadastros, padronização, estruturas e kits

Complementos de 1 a 6. O cadastro da REV21 foi evoluído, não substituído. Nenhuma base paralela foi criada e nenhuma fórmula foi alterada: regressão do motor com 80 cenários e 6.216 valores, 0 diferença; SPV/FACTS com 11 cenários, 0 diferença.

## 1. O que já existia e foi reaproveitado

| Mecanismo da REV21 | Como foi reaproveitado |
|---|---|
| Código do insumo `aa-bbbb` (família + sequência) | É o identificador interno estável e imutável. A descrição não é chave do registro. |
| Busca do motor pelo nome (a planilha procura o insumo pela descrição) | Mantida. A **camada de associação** é a tabela `RENOMES` (nome antigo → novo), que já migrava as propostas salvas. Renomear pela ficha nova usa essa tabela. |
| Padrões por família (`pedidos.js` e `docs/padroes-descricoes.md`) | Viraram `familias.js`, configurável. O modelo de cada família reproduz exatamente os nomes que já estão no padrão (ver seção 4). |
| Padronização de descrições (`padrao.js` e a tela "Padronização") | Mantida como está. |
| Pedidos de cadastro | São a base da governança: o atendimento agora define a situação do item. |
| Estruturas no MONTADOR (linhas 92 a 151) e tabelas por porte | Continuam sendo o motor de configuração. Editor, testador, rascunho e publicação trabalham sobre elas. |
| Kits de motor e de bomba | Mantidos. Ganharam duplicar, comparar e "onde é usado". |
| Histórico (`REG.historico`) | É a trilha de versões: cada alteração de estrutura guarda célula, valor anterior, valor novo, quem e quando. "Desfazer versão" e "desfazer lote" usam essa trilha. |
| "Onde é usado" | Reaproveitado na ficha, no impacto de renomear e mudar preço e no painel de qualidade. |

## 2. Requisitos e situação

Legenda: ✅ implementado e testado · ◐ parcial · ✗ não implementado (motivo ao lado).

### Cadastro guiado e padronização

| Requisito | Situação | Onde está |
|---|---|---|
| Interface em áreas A a E | ✅ | Cadastro → Visão geral → Mapa do cadastro. As permissões continuam por área (Custos, Engenharia…). |
| Campos técnicos por família (tipo, unidade, obrigatório, opções), sem mexer em código | ✅ | Cadastro geral → Campos por família |
| Descrição técnica gerada pelo padrão, com prévia | ✅ | Ficha do insumo, "gerar pelas características" |
| Normalizar espaços, grafia e separadores; não converter unidade | ✅ | `familias.js` (CV, HP e kW explícitos; nenhuma conversão) |
| Exceção justificada ao padrão | ✅ | Campo "Justificativa da exceção" |
| Descrições técnica, comercial e do fabricante no mesmo produto | ✅ | Ficha do insumo |
| Modelo de descrição comercial por família | ✅ | Campos por família |
| Prevenção de duplicidade (mesmo, possivelmente equivalente, semelhante) | ✅ | Ficha (ao digitar), pedidos e importação. Nada é juntado sozinho. |
| Consolidar duplicidades mediante aprovação, preservando histórico | ✅ | Qualidade → "Consolidar…": o retirado vira descontinuado com substituto, e o lote pode ser desfeito |
| Situações: provisório, aguardando validação técnica, aguardando preço, ativo, inativo, descontinuado | ✅ | Ficha, lista, pedidos, importação, alertas de custo |
| Substituto de item descontinuado | ✅ | Ficha |
| Renomear sem quebrar fórmulas | ✅ | Mostra o impacto, atualiza estruturas, tabelas por porte, kits e `RENOMES`. Bloqueia quando o nome é montado pela estrutura (prefixo + porte) ou sai de fórmula. |
| Validar o padrão contra as fórmulas | ✅ | Ao editar um modelo, o app mostra quantos nomes do cadastro continuam casando e pede confirmação se cair |
| Sinônimos e abreviações na busca | ✅ | Cadastro geral → Sinônimos. O ponto de partida são as grafias que o documento de padrões já unificou. |
| Favoritos | ✅ | Estrela na lista de insumos (por pessoa, neste navegador) |

### Preços, fornecedores e equivalentes

| Requisito | Situação | Onde está |
|---|---|---|
| Vários fornecedores por produto (preço, moeda, câmbio, impostos, frete, prazo, validade, pagamento, quantidade mínima) | ✅ | Ficha → Fornecedores e cotações |
| Comparar pelo custo total de aquisição, sem escolher só pelo menor preço | ✅ | Custo total = preço × câmbio × (1 + impostos) + frete. "Menor total" é só indicação; levar ao cadastro é escolha da pessoa. |
| Moeda sem câmbio informado | ◐ | Sinalizada na linha do fornecedor. O preço do cadastro continua sempre em R$, como na planilha. |
| Equivalentes: técnica validada, alternativa comercial, substituto | ✅ | Ficha → Equivalentes, com características comparadas, justificativa, restrições, quem e quando. Nunca troca sozinho. |
| Histórico de preços, com variação expressiva destacada | ✅ | Ficha → Histórico de preço |
| Impacto de uma mudança de preço (estruturas, propostas, margem) | ✅ | Ficha: aviso ao mudar o valor e "calcular o impacto na margem", que recalcula as propostas no motor sem gravar nada |
| Propostas enviadas, aprovadas e ganhas não mudam com o cadastro | ✅ | **Preços da época**: ao salvar, a proposta guarda os preços de insumos e kits que usou. Enviadas, aprovadas e ganhas calculam com eles. Rascunhos acompanham o cadastro, salvo se a política de Custos mandar congelar. |
| Atualização seletiva (escolher o que trazer para o preço de hoje) | ✅ | Etapa Custos da proposta → "Comparar e atualizar" |

### Estruturas, kits e regras

| Requisito | Situação | Onde está |
|---|---|---|
| Estrutura por grupos, recolher e expandir, custo por grupo | ✅ | Estruturas: grupos recolhíveis. O custo por grupo aparece no Testador e no item. |
| Obrigatório, opcional e condicional, com origem e regra de cada componente | ✅ | Estruturas (selos) e Testador ("por que entrou") |
| Incluir, excluir, substituir e configurar componentes | ✅ | Estruturas (editor da REV21, agora com rascunho) |
| Reorganizar (mudar a ordem) | ✗ | A posição da linha no MONTADOR é referência das fórmulas (coluna AE). Mudar a ordem exigiria alterar fórmulas. |
| Duplicar estrutura e copiar entre famílias | ✅ | "+ Nova estrutura → começar com os componentes de" (REV21) |
| Comparar duas estruturas | ✅ | Estruturas → "Comparar com…" |
| Comparar versões | ✅ | Rascunho × publicado ("Ver diferenças") e histórico de versões publicadas |
| Rascunho, validação e publicação; restaurar versão | ✅ | Estruturas → Publicação: editar em rascunho, testar, ver o impacto em todos os modelos prontos afetados, publicar, desfazer versão |
| Testador de estruturas no motor real, sem gravar | ✅ | Engenharia → Testador. Usa a mesma planilha das propostas; o custo bate com a referência da REV21 (R$ 316.071,95 no modelo de 1500 USgpm). |
| Diagnóstico: por que entrou e por que não entrou | ✅ | Testador: origem e regra de cada componente; componentes que não entraram e o motivo |
| Herança padrão → modelo → proposta, com a origem de cada componente | ✅ | Tela do item: "do padrão", "do modelo", "alterado na proposta", "acrescentado na proposta". Restaurar o original usa os botões ↺ da REV21. |
| Central de regras (id, descrição, condições, resultado, prioridade, responsável, versão, status) | ✅ | Engenharia → Regras de configuração. Lista também as regras de seleção das estruturas. |
| Dependências entre componentes (adicional necessário, incompatível ou já incluído, opcional, substituto) | ✅ | Condição "Componente presente" nas regras. Opcional fica na estrutura; substituto e equivalente, na ficha. |
| Regras não presumem norma | ✅ | O app não traz regra pronta e a fonte é obrigatória |
| Kits: componentes, custo por componente e total, comparar, duplicar, onde é usado, histórico | ✅ | Kits de motor e de bomba |
| Subconjuntos reutilizáveis aninhados | ✗ | Os kits são o subconjunto que a planilha entende. Aninhar subconjuntos exigiria mudar a estrutura de cálculo da planilha, fora do que se pode fazer sem alterar fórmulas. |
| Cobertura: modelos sem estrutura, componentes sem custo, configurações incompletas | ✅ | Qualidade → "Testar todos os modelos prontos" e as listas do painel |
| Biblioteca de configurações já usadas, criar a partir de outra | ✅ | Etapa Configuração → "buscar em configurações já usadas". Copia o item, registra a origem e recalcula com o cadastro de hoje. |
| Análise de custo por estrutura (participação dos grupos, maiores componentes, comparar configurações) | ✅ | Testador → "Comparar com". O custo direto é separado das despesas alocadas e da margem, que não entram nessa comparação. |

### Qualidade, importação e manutenção

| Requisito | Situação | Onde está |
|---|---|---|
| Painel de qualidade com filtro por família e criticidade, levando ao registro | ✅ | Visão geral → Qualidade. Cobre: sem família, sem fabricante, sem preço, preço desatualizado, fora do padrão, características ausentes, duplicidades, descontinuado em uso, substituto inexistente, estrutura com insumo inexistente, estrutura incompleta, tabela por porte com insumo inexistente, kit sem insumo, família sem estrutura, regra com componente inexistente. |
| Cadastros sem utilização → inativo ou descontinuado, sem excluir | ✅ | Qualidade → Cadastros sem utilização |
| Edição em massa com filtros, prévia, impacto, confirmação, histórico e reversão | ✅ | Lista de insumos → marcar → Edição em massa. Desfazer em Sistema → Histórico. O nome não se edita em massa, porque é a chave das fórmulas. |
| Importação: prévia, mapeamento, alterados, novos, validação, confirmação, relatório, reversão | ✅ | Importar preços (REV21) e, novos nesta versão: os não encontrados viram **provisórios** depois de conferir padrão e duplicidade; a importação pode ser desfeita pelo histórico |
| Governança de novos itens | ✅ | Pedido → Custos cadastra como ativo, aguardando validação ou aguardando preço → quem pediu acompanha no cartão da tela inicial |
| Assistente de manutenção (o que muda, dependências, afetados, testes, prévia, publicar após validar) | ✅ | Rascunho de estrutura → "Ver diferenças e impacto" → Publicar |

### Fora do escopo desta etapa (conforme a diretriz de implementação)

- **Proposta → pedido com configuração contratada congelada**: a baixa da REV21 já congela a fotografia da proposta ganha (componentes, quantidades, preços, condições). Não foi criado um módulo novo de acompanhamento de pedidos.
- **Rentabilidade por componente, fornecedor e categoria**: continua o previsto × realizado por item e por linha da REV21. A análise agregada não foi criada nesta etapa.
- **Notificações**: o app não tem infraestrutura de envio além do e-mail da aprovação. As pendências aparecem em "Minhas pendências".

## 3. Dados novos e compatibilidade

- **Insumo**: ganhou campos opcionais (`situacao`, `codFab`, `caract`, `descCom`, `descFab`, `excecao`, `substituto`, `fonte`, `dataCot`, `forn`, `equiv`). Registros da REV21 continuam válidos sem eles: sem `situacao` vale "ativo".
- **Tabelas novas** (coleção `tabelas`, escrita por Editor):
  - `FAM_CAMPOS`: campos e modelos por família;
  - `SINONIMOS`;
  - `ESTR_RASCUNHO`: rascunho de estrutura, que não entra no cálculo;
  - `REGRAS_CFG`: regras, agora com `id`, `prioridade`, `status`, `versao` e `resp`.
- **Proposta**: ganhou `precos` (insumos e kits usados) e `origemItens`. Propostas salvas pela REV21 não têm `precos`: continuam calculando com o cadastro do dia até serem salvas na REV22.
- **Listas de escolha**: inativos e descontinuados saem das listas, mas continuam no cálculo das propostas que já os usam.

## 4. Verificação dos modelos de descrição

Para cada insumo cujo nome segue o padrão da família, as características foram lidas do nome e a descrição foi remontada pelo modelo. O texto tem de ser idêntico.

| Família | Nomes no padrão | Remontados idênticos |
|---|---|---|
| 01 Motor diesel | 84 | 84 |
| 10 Motor elétrico | 139 | 139 |
| 11 Bomba de eixo livre | 98 | 97 (1 com espaço especial no nome original) |
| 12 Motobomba | 192 | 188 (4 sem potência no nome: o modelo não inventa o dado e pede exceção justificada) |
| 13 Jockey | 48 | 48 |

O teste considera o cadastro da planilha e as padronizações sugeridas. O script está em `tools/testes` (`c1`, `c3`) ; a verificação dos modelos é `node tools/testes/familias_rt.js`.

## 5. Testes

| Teste | O que verifica | Resultado |
|---|---|---|
| `c1_test` | Todas as abas abrem. Ficha guiada: a descrição gerada é igual à de um item existente e a duplicidade é apontada. Com 490 HP, a diferença de potência aparece. A descrição comercial não inventa dado. O registro gravado tem as características. O testador monta o modelo. | ✓ sem erro |
| `c2_test` | Testador: 21 componentes com origem e linha. Proposta salva guarda 35 preços de insumos, 1 kit motor e 1 kit bomba. Mudança de preço mostra o impacto. Proposta enviada reaberta mantém o total e mostra "Preços da época". "Comparar e atualizar" funciona. Edição em massa: prévia, aplica e desfaz pelo histórico. Estrutura em rascunho: banner, gravação no rascunho, impacto testado em 72 modelos, publicação. | ✓ sem erro |
| `c3_test` | Regra em rascunho não vale na proposta. Central lista as regras de seleção. Testador compara dois modelos por grupo. Cobertura dos modelos prontos aponta 3 sem cadastro/preço num skid e a regra impeditiva de teste. Campos por família: cobertura 71 de 90 igual ao padrão. Importação cria provisório e marca o fora do padrão. Biblioteca acha e reaproveita configuração. Comparação de kits. | ✓ sem erro |
| Regressão | Motor: 80 cenários, 6.216 valores. SPV/FACTS: 11 cenários, 24 valores. | **0 diferença** |
| 16 testes anteriores da REV22 | Jornada, aprovações, revisões, integridade, backup etc. | ver `04-testes.md` |
