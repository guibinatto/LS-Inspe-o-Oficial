# Limitações conhecidas

## Infraestrutura e segurança

1. **Não há Supabase nem servidor próprio.** O app compartilhado usa o banco de documentos do artifact do claude.ai; o arquivo local usa o `localStorage` do navegador. A REV22 preserva essa infraestrutura.
2. **O banco só distingue nível de compartilhamento**: Leitor, Contribuidor, Editor e dono, mais o espaço próprio de cada pessoa (`{self}`).
   - **Garantido pelo banco**:
     - leitura, para todos;
     - gravação de propostas, pendências, documentos, revisões e aprovações, para Contribuidor ou acima;
     - cadastro e tabelas, para Editor;
     - lista de responsáveis e aprovadores, só para o dono;
     - assinatura de decisão, só para a própria pessoa.
   - **Garantido só pelo app, com registro no histórico**:
     - quem pode mandar proposta para a lixeira ou apagar de vez;
     - restaurar backup;
     - lançar custo real;
     - conferir previsto × realizado;
     - a trava de área dentro do cadastro (um Editor fora da área é barrado pela tela, não pelo banco).

     Uma pessoa com acesso de Contribuidor ou Editor e conhecimento técnico pode gravar direto pelo console do navegador. Esconder botão não é tratado como segurança: a matriz de permissões indica em cada linha onde a regra é garantida.
3. **Aprovação sem aprovadores definidos**: qualquer Editor decide, e o banco não confirma que quem assinou é Editor. Defina as listas Diretoria e Financeiro para a conferência valer por pessoa.
4. **Decisões anteriores a 30/10/2026** valem como legado, sem assinatura. Uma decisão forjada com data antiga não seria detectada; por isso, decida de novo as aprovações em aberto.
5. **Arquivo local (modo local)**: não há login nem controle de acesso. Quem abre o arquivo é administrador e faz tudo. Os dados ficam só naquele navegador.

## Concorrência

6. A gravação por patch relê, aplica e confere, com até 3 tentativas. O banco não tem transação, então duas gravações no mesmo milissegundo ainda podem disputar. A conferência após gravar detecta o caso e pede para tentar de novo.
7. Pendências automáticas só sincronizam depois que a lista do banco carregou. Uma proposta salva nos primeiros segundos de uma visita pode deixar a sincronização para a próxima gravação.

## Funcionais

8. A conferência central, as pendências automáticas, as regras de configuração e o simulador valem para propostas **SEQ**. SPV e FACTS têm conferência do PDF, revisões, pendências manuais e documentos, mas não a conferência central.
9. O envio de e-mail pelo conector Microsoft 365 (Outlook) não foi testado com conta real neste ambiente. Sem o conector, o app oferece abrir o e-mail no programa de correio (mailto) com o texto pronto.
10. A consulta de CNPJ depende de serviços públicos (CNPJ.ws, BrasilAPI). Sem internet, o preenchimento é manual.
11. O painel calcula no navegador a partir das últimas 300 propostas carregadas do banco.
12. O cenário tributário 2027 está como rascunho. CBS e IBS ficam "a confirmar" até a regulamentação.
