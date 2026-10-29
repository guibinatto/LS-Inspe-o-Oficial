# Navegação e interface (REV22)

Três pedidos: navegação (Itens e Memorial dentro da proposta SEQ), modernização da interface e preenchimento inteligente. Nenhuma fórmula, referência, arredondamento ou dado foi alterado: a regressão continua com 0 diferença (80 cenários e 6.216 valores do motor; 11 cenários de SPV/FACTS).

Capturas antes e depois: `interface/antes/` e `interface/depois/` (computador 1440×900 e celular 390×844, mesmas telas, mesma proposta de exemplo).

## 1. Navegação

| Antes | Depois |
|---|---|
| Barra superior com Início, Proposta, Itens, Memorial, Pendências, Documentos, Margens, Cadastro, Guia | Menu lateral com ícones: Início, Propostas, Pendências, Documentos, Margens, Cadastros, Configurações, Ajuda |
| Itens e Memorial apareciam mesmo sem proposta SEQ aberta (e numa SPV) | Itens e Memorial são abas **da proposta SEQ**: Dados gerais, Itens, Custos, Formação, Conferência, Memorial, Documentos, Histórico |
| SPV e FACTS com as mesmas entradas do SEQ | SPV e FACTS mostram só o que se aplica: Proposta e Histórico |
| Sistema (histórico, responsáveis, backup, planilha) dentro de Cadastro | Em **Configurações**; Cadastros fica só com os cadastros |
| Cabeçalho da proposta variava por tela | Cabeçalho de contexto fixo em todas as abas: divisão, número, cliente, revisão, situação, aprovação, valor total, margem (com o mínimo), custo, itens e pendências |

Preservado: dados, cálculos, propostas antigas (abrem como antes), permissões (as regras continuam no banco; nada passou a depender de esconder botão). Os endereços internos antigos (`item`, `memorial`, abas antigas de Cadastro) continuam funcionando e caem na aba nova correspondente. Se uma SPV estiver aberta e algo pedir Itens ou Memorial, o app volta para a proposta.

Correção feita durante os testes: depois de abrir Configurações, o botão Cadastros voltava para Configurações. Agora abre Cadastros em Insumos.

## 2. Interface

- Ícones Lucide (licença ISC) embutidos no arquivo (`icones.js`, 75 ícones), sem depender de internet.
- Menu lateral recolhível no computador (a escolha fica no navegador) e gaveta com fundo escurecido no celular (abre pelo ☰, fecha com ✕, toque fora ou Esc).
- Botões com ícone e texto; estados de carregamento (Salvar mostra o andamento), sucesso, erro e desabilitado.
- Tabelas com cabeçalho destacado e altura de linha uniforme; cartões e abas com indicador da situação de cada etapa (✓ concluída, • atenção, ! problema).
- Animações curtas de entrada de janelas e avisos; desligadas quando o sistema pede menos movimento.
- Tema claro, escuro ou automático (botão de tema na barra superior).
- Telas sem rolagem horizontal no celular; barra superior compacta em telas estreitas.
- Filtros do painel na tela inicial com o mesmo estilo dos demais campos.

## 3. Preenchimento inteligente

| Onde | O que mudou |
|---|---|
| Dados gerais (SEQ) | Cliente com lista dos clientes já usados; ao escolher um, recupera da última proposta dele o CNPJ, a UF, o cadastro fiscal e o segmento, **somente nos campos vazios**, e avisa o que foi recuperado |
| Itens | Quantidade com botões − e + |
| Ficha do insumo | Características com até 4 opções viram botões de escolha (com "—" quando opcional e "outro" para valor novo); campos de texto sugerem os valores já usados; ao escolher o modelo, preenche só as características **idênticas em todos os insumos do mesmo modelo** e só campos vazios; fabricante com lista |
| SPV | UF em lista; vendedor em lista; condição de pagamento e cliente com sugestões (cliente preenche contato e UF vazios); visitas e meses com − e + |
| Pedidos de cadastro | Atendimento escolhe a situação do item (ativo, aguardando validação, aguardando preço); fabricante com lista |
| Pendências | Responsável com lista |
| Regras de configuração | Valores com as opções existentes |
| Kits | Marca com lista |

Nunca se preenche uma característica desconhecida: quando os insumos do mesmo modelo divergem, o campo fica vazio para a pessoa escolher.

## 4. Testes

Os 19 scripts de `tools/testes/` foram ajustados aos novos seletores (abas `.ptab` no lugar de `.step`, Sistema em Configurações) e passam sem erro de página. Ver `04-testes.md`.
