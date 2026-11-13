# Novas funcionalidades e bugs corrigidos

## Novas funcionalidades

1. **Jornada em 6 etapas** (Identificação, Configuração, Custos, Formação, Conferência, Emissão), com situação de cada etapa e uma barra de resumo fixa (preço, custo, margem, itens, alertas).
2. **Custos transparentes**: cada linha mostra origem, data da cotação, validade, variação de preço registrada no histórico e alertas (impeditivo, atenção, informativo). A linha pode ser marcada "não se aplica". Validade, aviso e variação são configuráveis em Custos → Validade e alertas.
3. **Simulador de negociação** no motor real: desconto, valor-alvo, variação de custo, pagamento e comissões. A proposta oficial não muda. Os cenários podem ser guardados, convertidos em revisão ou levados ao pedido de aprovação.
4. **Conferência central** com trava de envio ao cliente quando há item impeditivo. A trava é configurável.
5. **Modelos de item**: um equipamento configurado vira modelo para outras propostas.
6. **Acompanhamento de pendências**:
   - Cada pendência tem código, proposta, item, departamento, responsável, prazo, prioridade, criticidade (informativa, atenção ou impeditiva), situação, solução e histórico.
   - As automáticas nascem da conferência ao salvar. Elas não duplicam: o código sai da própria falha. Quando a falha some, a pendência se resolve sozinha, e é reaberta se a falha voltar.
   - As manuais são abertas por qualquer pessoa da equipe.
7. **Perfis e permissões**: Administrador, Diretoria Comercial, Comercial, Engenharia, Compras/Custos, Financeiro/Fiscal e Consulta. A matriz em Cadastro → Sistema mostra quem pode o quê e onde cada regra é garantida (banco ou app).
8. **Decisões de aprovação assinadas**:
   - No app compartilhado, cada decisão grava uma assinatura no espaço do banco da própria pessoa, e só ela consegue escrever ali.
   - Ao ler, todos conferem a assinatura e a lista de aprovadores. Uma decisão sem assinatura ou de quem não é aprovador não conta.
9. **Aprovação perde a validade quando as premissas mudam**: custo total (mais de 0,5%), itens ou quantidades. Continua valendo a regra da REV21 para preço abaixo do target.
10. **Lixeira de propostas**: excluir manda para a lixeira. O administrador ou quem criou o rascunho exclui; só o administrador apaga de vez.
11. **Comparação entre revisões**: totais, custo, impostos e margem; itens incluídos, retirados e alterados; campos alterados; se a mudança exige nova aprovação.
12. **Versões congeladas**: ao marcar "enviada ao cliente" e quando a aprovação se completa.
13. **Painel na tela inicial** com filtros de período e divisão. As fórmulas estão no próprio painel, em "Como cada número é calculado".
14. **Regras de configuração (Engenharia)**:
    - Uma condição sobre família, arranjo, bomba, potência, rotação, tensão, vazão ou jockey exige ou proíbe um componente, com a criticidade escolhida.
    - A fonte é obrigatória. O app não traz regras prontas.
15. **Integridade**:
    - versão por proposta, com conflito resolvido sem sobrescrever;
    - gravação conferida após salvar;
    - indicador de alterações não salvas;
    - rascunho recuperado;
    - aviso ao fechar;
    - salvamento automático só de rascunhos parados;
    - backup completo e restauração com prévia.
16. **Documentos** ligados a revisão, item e etapa.
17. **Tema** automático, claro ou escuro. **Teclado**: Esc fecha janelas, Ctrl+S salva, link "pular para o conteúdo".

## Bugs corrigidos

| # | Problema na REV21 | Correção |
|---|---|---|
| 1 | Salvar sem espaço no navegador falhava calado (`store.set` e a gravação local de propostas engoliam o erro) | O erro aparece no topo e numa faixa; a gravação é relida para confirmar |
| 2 | Duas pessoas editando a mesma proposta: a última gravação apagava a outra sem aviso | Versão por proposta; o conflito abre uma escolha, e a outra versão pode ser guardada como revisão |
| 3 | Salvar no editor voltava status, etapas e conferência marcados pela tela inicial | O salvar preserva status, etapas, conferência, motivo de perda, criação e lixeira |
| 4 | Mudar status, etapa ou conferência regravava a proposta inteira (sobrescrevia edição simultânea) | Gravação por patch: relê, aplica só a mudança e confere |
| 5 | Aprovações e baixas em modo local falhavam caladas sem espaço | Falha visível |
| 6 | Uma aprovação continuava valendo depois de mudar custo ou itens | Perde a validade e pede de novo |
| 7 | Qualquer Editor podia alterar a lista de responsáveis e aprovadores pelo banco (a trava era só da tela) | Regra do banco: só o dono grava `meta/acessos` |
| 8 | O campo `by` de uma decisão podia ser preenchido com o id de outra pessoa | A decisão precisa de assinatura no espaço da própria pessoa |
| 9 | Excluir proposta apagava sem volta | Lixeira |
