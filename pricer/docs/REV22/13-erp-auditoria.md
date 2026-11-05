# Arquitetura ERP/CPQ — auditoria (fase 1)

Data: 31/10/2026. Base: `pricer/` no commit 782c152. Referência: complemento "Arquitetura ERP/CPQ inspirada no SAP Business One". Legenda: **existe** (já atende), **parcial** (existe, falta parte), **falta**.

| Item do complemento | Situação | O que existe hoje | Ação nesta etapa |
|---|---|---|---|
| 2.1 Menu global em módulos | parcial | 7 botões soltos (Início, Propostas, Pendências, Margens, Cadastros, Configurações, Ajuda) | agrupar em Início, Propostas, Cadastros, Gestão, Administração, Ajuda, com submenus que abrem telas que já existem |
| 2.2 Barra lateral recolhível, ícones Lucide, área ativa, teclado | parcial | recolher, ícones, `aria-current`, gaveta no celular; dica só pelo `title` | submenus expansíveis, pesquisa no menu, dica acessível no modo recolhido, setas do teclado |
| 2.3 Navegação contextual | existe | abas da proposta (Dados gerais, Itens, Memorial, Conferência, Documentos, Histórico), Itens/Memorial fora do menu global, abas por área no cadastro | manter |
| 3.1 ID interno × código | parcial | insumo: `id` = família + sequência (`01-1234`), não depende da descrição nem da posição (é o que a planilha usa nas colunas A/B); propostas: id gerado + número digitado | manter os ids; documentar |
| 3.2 Máscaras parametrizáveis | falta | número da proposta digitado à mão (ex.: 10.102); códigos de insumo fixos | séries configuráveis só pelo administrador, sem aplicar a registros existentes |
| 3.3 Geração segura | **falta (risco)** | código de insumo novo = maior + 1, sem checar colisão na gravação: duas pessoas cadastrando na mesma família ao mesmo tempo podiam gravar uma por cima da outra | reservar número com trava (lease) e registro por número; insumo novo confere colisão dentro da trava |
| 3.4 Compatibilidade | — | — | nenhum código emitido muda |
| 4 Ficha do produto | parcial | ficha única com geral, características por família, 3 descrições, preço, fornecedores, equivalentes, onde é usado, histórico de preço, folha técnica, documentos e histórico, tudo numa página longa | organizar em abas (Geral, Técnica, Compras e custos, Estruturas e utilização, Documentos, Histórico) sem mudar campos nem a gravação |
| 5 Formulários inteligentes | existe | seletores, botões de escolha, dependentes, "+ novo …", preenchimento pelo modelo já cadastrado | manter |
| 6 Descrições centralizadas | parcial | gerador por família em `familias.js` (`FAMS_F`) usado no cadastro; padronização de motores e bombas em `app.js` (`FAM_PAD`) | auditar duplicidades (fase 4) |
| 7 Estruturas e kits | parcial | editor hierárquico, testador no motor real, rascunho/publicação, comparação, kits | visões técnica/custeio/comercial (fase 4) |
| 8 Proposta como documento | parcial | número, revisão, cliente, situação, cabeçalho com valor, margem e pendências, revisões, composição registrada | manter; conferir o cabeçalho no celular |
| 9 Busca universal | falta | busca só dentro de cada lista (propostas, insumos, documentos) | busca global com Ctrl+K e botão no celular |
| 10 Celular | existe | navegação inferior, cartões, 44 px, 16 px, sem rolagem horizontal (REV22, doc 11) | manter e testar o que mudar |
| 11 Permissões | parcial | regras do banco: cadastro e configurações só Editor/dono; propostas, documentos, pedidos etc. Contribuidor; áreas responsáveis conferidas no app (não no banco) | numeração: configuração no caminho só de administrador; reserva no caminho das propostas |
| 12 Integridade e histórico | existe | composição registrada na inclusão, preços congelados por proposta, versão por gravação com conflito, estruturas com rascunho/publicação | manter |
| 13 Desempenho | parcial | listas carregam as 300 propostas mais recentes (500 baixas); indicadores contam só o que foi carregado | avisar quando o limite for atingido e paginar a lista (fase 5) |

## Riscos e dependências

- O motor de cálculo usa o código do insumo (família e sequência) nas colunas A/B da planilha: o código não pode mudar.
- O número da proposta (célula `C5`) é digitado pela equipe no padrão da LS Fire (ex.: `10.102 / 10.116`); uma série nova só sugere e reserva, não troca números já emitidos.
- As áreas responsáveis (Custos, Engenharia…) são conferidas no app; o banco só distingue Editor/dono de Contribuidor. Separar no banco exige regras por caminho, o que mudaria onde cada cadastro é gravado (migração): fica registrado como limitação.
