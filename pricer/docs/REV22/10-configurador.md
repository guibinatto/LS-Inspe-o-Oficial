# Configurador assistido do item (Configurar · Compor · Conferir)

Data: 30/10/2026. Arquivo: `pricer/dist/ls-pricer.html`. O configurador passa a ser a tela padrão do item SEQ. A tela anterior continua disponível pelo link **abrir a tela clássica**, e a visão completa da planilha pelo link **visão completa da planilha**.

## 1. Relatório de alterações

| Arquivo | O que mudou |
|---|---|
| `app.js` | Bloco novo do configurador (`vConfig`, `cfgEt1`, `cfgEt2`, `cfgEt3` e funções `cfg*`). Rota do item: `ui.itemFull ? vItem : ui.cfgClassico ? vItemS : vConfig`. Os blocos **Código e descrição** e **FCI** saíram de `vItemS` para `itemCodHtml` e `itemFciHtml`, usados pelas duas telas. As ações dos alertas saíram de `alertList` para `alAcoes`, usadas na tela clássica, na conferência da proposta e na etapa Conferir. As ações de alerta que abrem o item (`foco`, `abrir`, `esp`) e o atalho da folha de dados levam à etapa certa do configurador. Abrir um item pela lista recomeça na etapa padrão. |
| `index.html` | CSS do configurador (`.cfghead`, `.cfgsteps`, `.cfggrid`, `.cfgcomp`, `.cfgpainel`, `.cfgalerts`, `.cfgqtd`, `.cfgcustos`, `.sr` e regras para 640 px). Na barra superior, em telas até 600 px, o botão Cancelar sai e as ações rolam na horizontal, sem estourar a largura. |
| `tools/testes/cfg_test.js` | Teste novo do fluxo completo (ver a seção 3). |
| `docs/manual/fonte/cap04.js` | Capítulo 4 do manual reescrito para o configurador, com capturas novas. |

O que **não** mudou: `engine.js`, `model.js` (motor e planilha da REV21), as estruturas (MONTADOR), as tabelas por porte, os kits, as regras de configuração (`regras.js`) e o cadastro. A regressão do motor continua com diferença zero (seção 3).

### Como o configurador grava

Ele grava as mesmas células do item que a tela clássica: família `C21`, modelo pronto `C17`, arranjo `E17`, bomba `D19`/`BA19`, diesel `C19`/`H19`/`F19`, elétrico `I19`/`L19`, jockey `J19`, vazão `G17`, pressão `H17`, norma `I17`, quantidade `C6`, opcionais `BC{linha}`, troca de insumo e quantidade nas linhas da estrutura (`D{linha}`/`F{linha}`, só em Configuração especial) e componentes adicionados nas linhas do escopo (68 a 112). O que é só do configurador fica junto da proposta, em `propCom.cfg[ITEM]`:

| Campo | Conteúdo |
|---|---|
| `especial` | escopo Padrão da estrutura ou Configuração especial |
| `conf.tec`, `conf.custos`, `conf.escopo` | confirmação manual: data, usuário e a assinatura da configuração confirmada |
| `incl` | inclusão na proposta: data, usuário e assinatura |
| `snap` | composição registrada na inclusão: parâmetros, componentes e quantidades, custo, preço, total, margem e descrição |

A assinatura (`cfgSig`) junta os parâmetros e a lista de componentes com quantidades. Se a configuração muda depois de uma confirmação ou da inclusão, a tela pede para refazer.

## 2. Funções reaproveitadas (nenhuma regra ou cálculo novo)

| Função | Uso no configurador |
|---|---|
| motor da planilha (`wb`, `val`, `txt`, `show`) | todos os valores: custo `H114`, preço `B15`, total `D15`, fatores `F15`/`H15` com os rótulos `F14`/`H14`, margem `J15`, categorias `H115`–`H118`, descrições `C27`–`C30`, motor `C20`/`H20`, pontos `K23:L26` |
| `commit`, `field`, `fieldS`, `control`, `listFor`, `overridden`, `isFormulaBase`, `baseRaw`, `target` | edição das células e listas dependentes, igual à tela clássica |
| `recLines`, `montLines`, `hiddenLines`, `estrOf`, `heads`, `origemTxt`, `regraTxt`, `qtdTxt` | linhas do MONTADOR que entraram, as que ficaram fora e o texto da regra |
| `arrCounts`, `famsEquip`, `estrList`, `famLabel`, `FAM_SEQ_LB`, `ACIONS`, `isCMB` | família, acionamento e arranjo |
| `modelos`, `modelMatch`, `ensureModelos`/`modelosItem` | modelos prontos e configurações salvas da equipe |
| `alertsFor`, `alAcoes`, `aprovLinha` | alertas do item e as ações deles (corrigir, pedir aprovação, seguir assim) |
| `insPorProduto`, `foraDeUso`, `situ`, `precoData`, `famProdutos`, `certLinha` | cadastro do componente, situação, data do preço, lista da família, certificação |
| `memoCalc`, `espItemCard`, `itemPropCard`, `itemCodHtml`, `itemFciHtml` | memória de cálculo, especificação, folha de dados, código e FCI |
| `insumoModal`, `PD.pedir`, `pedidoDaLinha` | cadastrar agora e pedir cadastro |
| `dupItem`, `modsave`, `pcGet`/`pcSet`, `logEv`, `$('#bSave').onclick` | duplicar, salvar como modelo, gravar com a proposta, histórico, gravação |
| `montarTeste` (testador de estruturas) | usado só no teste de comparação |
| `PricerDlg` | confirmações (funciona também onde o navegador bloqueia janelas) |

## 3. Testes

Ver a seção "Configurador assistido" em `04-testes.md` e o script `pricer/tools/testes/cfg_test.js`.

## 4. Comparação com o configurador anterior

| Aspecto | Tela anterior (clássica) | Configurador assistido |
|---|---|---|
| Organização | uma página com cartões e blocos recolhidos | 3 etapas com navegação (Voltar, Salvar rascunho, Continuar) e etapas clicáveis com situação (feita, com problema, atual) |
| Família | botões | botões com o número de modelos prontos e o aviso de estrutura não cadastrada |
| Modelo pronto | lista suspensa | lista com pesquisa (nome, bomba, motor, arranjo) e filtro por acionamento; configurações salvas da equipe na mesma etapa |
| Características | campos; "do modelo" em alguns | tabela com a origem de cada valor (do modelo pronto, escolhido nesta proposta, alterado do modelo pronto, calculado pela planilha, pendente), pontos de trabalho e certificação da bomba |
| Bomba | lista da família | fabricante e depois o modelo (lista filtrada) |
| Componentes | tabela com origem (do modelo, do padrão, alterado, acrescentado) | tabela classificada (obrigatório, condicional, opcional, incluído pelo fornecedor, adicionado na proposta), opcionais marcáveis na linha, painel "Por que este componente?" com a regra real, o que acionou e a versão da regra, alternativas, componentes que ficaram fora e o motivo |
| Escopo especial | não havia | troca de insumo e quantidade em qualquer linha da estrutura, marcada como alteração; **Restaurar padrão** |
| Conferência do item | alertas no topo | três níveis (Impeditivo, Atenção, Informativo) com **Ir para**, as mesmas ações dos alertas e checagens dos componentes (sem cadastro, sem preço, descontinuado, preço com mais de 180 dias, quantidade inválida, duplicados) |
| Confirmações | não havia | técnica, custos e escopo, com quem e quando, invalidadas por mudança |
| Inclusão | o item entra ao preencher | **Adicionar à proposta** valida, grava e só então confirma; clicar de novo atualiza o mesmo item; composição registrada |
| Composição registrada | não havia | aviso quando a composição muda depois da inclusão; em proposta enviada, aprovada ou ganha, **Manter a composição registrada** |
| Cálculo | motor da planilha | o mesmo motor; 8 de 8 modelos com o mesmo custo e os mesmos componentes do testador |

## 5. Uso

1. Na aba **Itens**, **+ Adicionar item** (item novo abre em **1. Configurar**) ou **Abrir** num item existente (abre em **3. Conferir**).
2. **Configurar**: família; ponto de partida (**Modelo pronto** com pesquisa e filtro, configuração salva ou **Montar por características**); quantidade; escopo **Padrão da estrutura** ou **Configuração especial**.
3. **Compor**: confira os componentes; **Por quê?** explica cada um; marque opcionais; **Adicionar componente** do cadastro (ou **pedir cadastro**); **Restaurar padrão** desfaz.
4. **Conferir**: confira custo e preço; resolva os impeditivos; trate os avisos; marque as confirmações; **Adicionar à proposta**.
5. Para voltar à tela anterior: **abrir a tela clássica** (e **voltar ao configurador assistido**).

O manual (capítulo 4) traz o passo a passo com as capturas.

## 6. Atualização e manutenção

- O configurador lê as estruturas, tabelas por porte, kits, modelos e cadastro em tempo real. Mudanças feitas em Cadastros (estruturas, tabelas por porte, kits, modelos prontos, insumos e preços) aparecem nele sem mudar código.
- Para mudar textos ou classificações: `CLS_LB` (classificação), `CFG_ETAPAS` (etapas), `cfgValida` (checagens do item) em `pricer/app.js`. As regras de configuração da Engenharia continuam em `regras.js` e entram pelo `alertsFor`.
- Depois de mudar o código: `python3 pricer/tools/build.py`; rodar `cfg_test.js` e a regressão (`tools/regressao/motor.js` e `spv-facts.js`), que precisam dar 0 diferença.
- Rollback: o link **abrir a tela clássica** já leva à tela anterior. Para voltar o padrão do item à tela clássica, troque a rota em `render()` para `ui.cfgClassico === false ? vConfig : vItemS`. Os dados gravados pelo configurador são as mesmas células do item; `propCom.cfg` é ignorado pela tela clássica.

## 7. Limitações

- No modo local não há login: as confirmações e a inclusão ficam registradas como "neste navegador", sem nome de usuário. O app não simula identidade.
- As confirmações manuais não são controle de acesso. Quem pode alterar a proposta continua definido pelos papéis (Contribuidor, Editor, dono) no modo compartilhado.
- Opcionais só existem onde a estrutura tem linhas com a regra OPCIONAL para o acionamento; nos modelos testados não havia.
- A troca de insumo e de quantidade de linhas da estrutura só existe em **Configuração especial**, para não mudar a estrutura padrão sem intenção.
