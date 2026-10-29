// Capítulo 3 — Criação de proposta (SEQ)
// esconde a barra superior (fixa) só durante a foto, para os números ficarem sobre fundo limpo
const semTopo = async (p) => { p.__st = await p.addStyleTag({ content: 'header.top{visibility:hidden!important}' }); };
const comTopo = async (p) => { if (p.__st) { await p.__st.evaluate((e) => e.remove()); p.__st = null; } };

module.exports = {
  n: 3, titulo: 'Criação de proposta', slug: 'proposta',
  capturas: [
    { id: '03-01', nome: 'proposta-nova-janela', titulo: 'Janela Nova proposta',
      prep: async (p, h) => { await h.clicar('#bNew', 500); },
      clip: '#overlay .modal .card', pad: 12,
      depois: async (p, h) => { await h.esc(); },
      marcas: [
        { sel: '#mBlank', txt: 'SEQ em branco: proposta SEQ nova, começando pelos Dados gerais (revisão 0 e data de hoje já preenchidas).', pos: 'b' },
        { sel: '#mSpv', txt: 'SPV (serviço, peças, contrato): volta à tela Início para escolher o tipo de SPV (ver o capítulo de SPV).', pos: 'b' },
        { sel: '#mExample', txt: 'Exemplo SEQ (Cocamar): carrega a proposta de exemplo, para treino.', pos: 'b' },
        { sel: '#overlay [data-close]', txt: 'Cancelar: fecha a janela sem mudar nada (Esc também fecha).', pos: 'b' },
      ] },
    { id: '03-02', nome: 'proposta-inicio-familias', titulo: 'Tela Início: botões para começar uma proposta SEQ',
      prep: async (p, h) => { await h.nav('inicio'); },
      clip: '.starts .start.seq', pad: 12,
      marcas: [
        { sel: '.start.seq [data-seqfam="CONJUNTO MOTOBOMBA"]', txt: 'Botão de família (aqui, Conjunto motobomba): cria a proposta e já reserva o item 01 nessa família.', pos: 'l' },
        { sel: '.start.seq [data-seqfam="ESPECIAL"]', txt: 'Skid, Container, Especial e Jockey + painel funcionam do mesmo jeito.', pos: 'l' },
        { sel: '.start.seq [data-seqnew]', txt: 'Em branco: proposta SEQ sem família; o equipamento é escolhido depois, na aba Itens.', pos: 'b' },
        { sel: '.start.seq [data-factsnew]', txt: 'FACTS: abre o configurador MECON (ver o capítulo de SPV e FACTS).', pos: 'b' },
      ] },
    { id: '03-03', nome: 'proposta-dados-cliente', titulo: 'Dados gerais, cartão Cliente, com os campos obrigatórios em destaque',
      prep: async (p, h) => { await h.clicar('.start.seq [data-seqfam="CONJUNTO MOTOBOMBA"]', 800); await h.clicar('[data-cabnext]', 700); await h.topo(); },
      clip: '#app section.card', pad: 10,
      marcas: [
        { sel: '#cnpjIn', txt: 'CNPJ / CPF: 14 dígitos (CNPJ) ou 11 (CPF). O contorno vermelho indica campo obrigatório vazio; o * marca os obrigatórios.', pos: 'tr', semCaixa: true },
        { sel: '#cnpjGo', txt: 'Buscar na Receita: consulta o CNPJ e preenche cliente, local, UF e cadastro fiscal.', pos: 'b' },
        { sel: 'label[for="c_PROPOSTA_F5"] > span', txt: 'Cliente (razão social): sugere os clientes de propostas já salvas.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_F6"] > span', txt: 'Obra / local da instalação.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_F7"] > span', txt: 'UF de destino: define o ICMS e o DIFAL.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_J5"] > span', txt: 'Cadastro fiscal do cliente (contribuinte ou não contribuinte).', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_F8"] > span', txt: 'Segmento do cliente (OEM, instalador, revenda, cliente final…).', pos: 'r' },
      ] },
    { id: '03-04', nome: 'proposta-dados-proposta', titulo: 'Dados gerais, cartão Proposta',
      clip: '#app section.card', clipNth: 1, pad: 10,
      marcas: [
        { sel: 'label[for="c_PROPOSTA_C5"] > span', txt: 'Nº da proposta.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_C6"] > span', txt: 'Revisão: começa em 0 na proposta nova.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_C7"] > span', txt: 'Data: já vem com a data de hoje.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_C10"] > span', txt: 'Validade da proposta.', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_J6"] > span', txt: 'Condição de pagamento: lista da planilha (mexe no preço pelo encargo financeiro).', pos: 'r' },
        { sel: 'label[for="c_PROPOSTA_F9"] > span', txt: 'Norma: NFPA20, ULFM, NBR16704 ou NBR13714.', pos: 'r' },
      ] },
    { id: '03-05', nome: 'proposta-vendedor-comissoes', titulo: 'Dados gerais, cartão Vendedor e comissões (vendedor escolhido e AN marcado)',
      prep: async (p, h) => {
        // cadastra um vendedor e um AN de treino em Cadastros → Precificação (neste navegador) e volta para a proposta
        await h.nav('cadastro'); await h.cad('preco');
        await p.fill('#vNome', 'VENDEDOR EXEMPLO'); await h.clicar('#vAdd', 600);
        await h.clicar('label:has(> input[name="vPapel"][value="an"])', 300);
        await p.fill('#vNome', 'AGENTE EXEMPLO'); await h.clicar('#vAdd', 600);
        await h.nav('proposta');
        await h.clicar('#app label:has(> [data-ppcell="C8"])', 600);
        await h.clicar('#app label:has(> [data-pcom="J8"])', 600);
        await h.clicar('#app label:has(> [data-ppcell="L8"])', 600);
      },
      clip: '#app section.card:has([data-pcom])', pad: 10,
      marcas: [
        { sel: '#app label:has(> [data-ppcell="C8"])', txt: 'Vendedor: toque no nome. A lista vem de Cadastros → Precificação (cartão Vendedores e agentes de negócio).', pos: 'r' },
        { sel: '#app label:has(> [data-pcom="J8"])', txt: 'Comissões: Vendedor (já vem marcada na proposta nova) e Agente de negócio (AN), que você marca só se houver AN. Com AN marcado, o campo Agente de negócio fica obrigatório.', pos: 'r' },
        { sel: '#app label:has(> [data-ppcell="L8"])', txt: 'Agente de negócio: toque no nome.', pos: 'r' },
      ] },
    { id: '03-06', nome: 'proposta-receita-sem-conexao', titulo: 'Buscar na Receita sem acesso à internet',
      prep: async (p, h) => { await h.preencher('#cnpjIn', '12.345.678/0001-95'); await h.clicar('#cnpjGo', 1500); await h.topo(); await semTopo(p); },
      depois: async (p) => { await comTopo(p); },
      clip: '#app .f:has(#cnpjIn)', pad: 12,
      marcas: [
        { sel: '#cnpjIn', txt: 'CNPJ digitado (aqui, um número fictício).', pos: 'tr' },
        { sel: '#cnpjGo', txt: 'Buscar na Receita.', pos: 'r' },
        { sel: '#cnpjMsg', txt: 'Resultado da consulta. Sem internet, o app avisa e você preenche os dados à mão.', pos: 'r' },
      ] },
    { id: '03-07', nome: 'proposta-indicador-salvar', titulo: 'Barra superior: indicador de alterações não salvas',
      clip: 'header.top', pad: 0,
      marcas: [
        { sel: '#docName', txt: 'Proposta aberta: divisão, número e cliente.', pos: 'b' },
        { sel: '#saveSt', txt: 'Indicador: "● Proposta ainda não salva" ou "● Alterações não salvas"; depois de salvar, "✓ Salvo às hh:mm".', pos: 'b' },
        { sel: '#bOpen', txt: 'Abrir: lista as propostas salvas.', pos: 'b' },
        { sel: '#bSave', txt: 'Salvar (ou Ctrl+S).', pos: 'b' },
      ] },
    { id: '03-08', nome: 'proposta-cabecalho-contexto', titulo: 'Cabeçalho de contexto da proposta (exemplo salvo)',
      prep: async (p, h) => { await h.exemplo(); await h.salvar(); await h.esperar(600); await h.topo(); await semTopo(p); },
      depois: async (p) => { await comTopo(p); },
      clip: '.ctxh', pad: 10,
      marcas: [
        { sel: '.ctxh .ctx-tt h1', txt: 'Número da proposta e, abaixo, o cliente.', pos: 't' },
        { sel: '.ctxh .ctx-tags', txt: 'Revisão atual ("Rev. 3 ▾": ver, comparar e restaurar revisões), botão Revisar e a situação (Não salva, Em aberto, Em aprovação, Enviada ao cliente, Ganha, Encerrada, Perdida).', pos: 'r' },
        { sel: '.ctx-kpis .k:nth-child(1)', txt: 'Valor total da proposta (com IPI).', pos: 't' },
        { sel: '.ctx-kpis .k:nth-child(2)', txt: 'Margem líquida e o mínimo da política; fica vermelha abaixo do mínimo.', pos: 't' },
        { sel: '.ctx-kpis .k:nth-child(3)', txt: 'Custo total e, ao lado, o número de itens.', pos: 't' },
        { sel: '.ctx-kpis .k:nth-child(5)', txt: 'Pendências: da conferência e do acompanhamento.', pos: 't' },
      ] },
    { id: '03-09', nome: 'proposta-abas', titulo: 'Abas da proposta SEQ, com a situação de cada etapa',
      clip: '.ptabs', pad: 6,
      marcas: [
        { sel: '.ptabs [data-step="1"]', txt: 'Dados gerais: cliente, proposta, vendedor, frete.', pos: 'b' },
        { sel: '.ptabs [data-step="2"]', txt: 'Itens: equipamentos da proposta. "✓" = etapa concluída.', pos: 'b' },
        { sel: '.ptabs [data-step="3"]', txt: 'Custos: origem e validade de cada custo.', pos: 'b' },
        { sel: '.ptabs [data-step="4"]', txt: 'Formação: preço por item e simulador.', pos: 'b' },
        { sel: '.ptabs [data-step="5"]', txt: 'Conferência: o que impede ou pede atenção. "•" = há avisos.', pos: 'b' },
        { sel: '.ptabs [data-view="memorial"]', txt: 'Memorial de formação de preço.', pos: 'b' },
        { sel: '.ptabs [data-step="6"]', txt: 'Documentos: situação, PDFs e revisões.', pos: 'b' },
        { sel: '.ptabs [data-view="phist"]', txt: 'Histórico da proposta.', pos: 'b' },
      ] },
    { id: '03-10', nome: 'proposta-abrir-janela', titulo: 'Janela Propostas salvas (botão Abrir)',
      prep: async (p, h) => { await h.clicar('#bOpen', 600); },
      clip: '#overlay .modal .card', pad: 12,
      depois: async (p, h) => { await h.esc(); },
      marcas: [
        { sel: '#mQ', txt: 'Buscar por número ou cliente.', pos: 'r' },
        { sel: '#mList [data-open]', txt: 'Abrir: carrega a proposta para edição.', pos: 'b' },
        { sel: '#mList [data-del]', txt: 'Excluir: manda para a lixeira (pede confirmação).', pos: 'r' },
        { sel: '#mCopy', txt: 'Copiar proposta atual (texto).', pos: 'l' },
        { sel: '#mDown', txt: 'Baixar .json da proposta atual.', pos: 'b' },
        { sel: 'label[for="mFile"]', txt: 'Abrir .json recebido de outra pessoa.', pos: 'r' },
        { sel: '#mImp', txt: 'Importar o conteúdo colado ou aberto.', pos: 'l' },
      ] },
    { id: '03-11', nome: 'proposta-inicio-lista', titulo: 'Lista de propostas na tela Início',
      prep: async (p, h) => { await h.nav('inicio'); },
      clip: '#app table:has([data-hdup])', pad: 10,
      marcas: [
        { sel: '#app tr[data-hopen] .divb', txt: 'Divisão (SEQ ou SPV), número, revisão e cliente. Clicar na linha também abre.', pos: 'b' },
        { sel: '#app button[data-hnext]', txt: 'Próximo passo sugerido para a proposta (aqui, Conferir PDF).', pos: 'b' },
        { sel: '#app button[data-hrev]', txt: 'Revisar: abre a proposta já na janela de nova revisão (em Em aberto, Em aprovação e Enviada ao cliente).', pos: 'b' },
        { sel: '#app button[data-hopen]', txt: 'Abrir a proposta.', pos: 'b' },
        { sel: '#app button[data-hdup]', txt: 'Duplicar: cria uma cópia Em aberto, sem número.', pos: 'b' },
        { sel: '#app [data-hperdida]', txt: 'Marcar como perdida, com o motivo.', pos: 'r' },
      ] },
    { id: '03-12', nome: 'proposta-copia-duplicada', titulo: 'Cópia criada pelo Duplicar: sem número e ainda não salva',
      prep: async (p, h) => { await h.clicar('#app button[data-hdup]', 900); await h.topo(); await semTopo(p); },
      depois: async (p) => { await comTopo(p); },
      clip: '.ctxh', pad: 10,
      marcas: [
        { sel: '.ctxh .ctx-tt h1', txt: 'A cópia fica sem número: informe o novo número em Dados gerais.', pos: 't' },
        { sel: '.ctxh .ctx-tags > .pill', txt: 'Situação "Não salva" até você clicar em Salvar.', pos: 'r' },
        { sel: '.ctx-kpis .k:nth-child(1)', txt: 'Valores e itens iguais aos da proposta de origem.', pos: 't' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'Este capítulo mostra como criar uma proposta SEQ (soluções e equipamentos), preencher os **Dados gerais**, salvar, abrir e duplicar. No fim estão o cabeçalho de contexto e as abas da proposta. Os capítulos seguintes tratam da precificação (Itens, Custos, Formação e Conferência) e do Memorial.' },
    { t: 'aviso', x: 'As telas foram capturadas no modo local (arquivo aberto no navegador), sem login. No modo local não há controle de acesso: quem abre o arquivo cria, salva e exclui propostas, e elas ficam só naquele navegador. No modo compartilhado, criar, editar e salvar propostas exige acesso de **Contribuidor** ou acima; o **Leitor** só consulta.' },

    { t: 'h', x: 'Três formas de começar' },
    { t: 'p', x: 'Uma proposta SEQ pode começar pelo botão **Nova** (barra superior) ou pelos botões do quadro SEQ na tela **Início**. Para treinar, use o **Exemplo SEQ (Cocamar)**, que já vem com três itens precificados.' },
    { t: 'fig', id: '03-01' },
    { t: 'fig', id: '03-02' },
    { t: 'tab', cab: ['Como começar', 'O que acontece'], lin: [
      ['Nova → **SEQ em branco**', 'Proposta nova, aberta em Dados gerais. Revisão 0, data de hoje e comissão do vendedor já preenchidas. Aviso "Proposta SEQ em branco".'],
      ['Início → botão de família (ex.: **Conjunto motobomba**)', 'Igual ao anterior, mas o item 01 já fica na família escolhida. Aparece a faixa "Nova proposta SEQ · <família>. Preencha o cabeçalho para seguir ao equipamento." e o botão final vira **Próximo: equipamento →**.'],
      ['Início → **Em branco**', 'Igual a Nova → SEQ em branco.'],
      ['Nova → **Exemplo SEQ (Cocamar)**', 'Carrega a proposta de exemplo (nº 10.102 / 10.116, 3 itens, R$ 4.258.300,00). Use para treino; ela ainda não está salva.'],
    ] },
    { t: 'aviso', x: 'A janela Nova avisa: "A proposta atual continua salva se você já clicou em Salvar. Alterações não salvas se perdem." Salve antes de começar outra proposta.' },

    { t: 'tut', titulo: 'Criar uma proposta SEQ', objetivo: 'Abrir uma proposta SEQ nova, pronta para preencher.', quem: 'Contribuidor, Editor ou dono (no modo compartilhado). No modo local qualquer pessoa que abre o arquivo pode criar.', pre: ['App aberto.', 'Se houver uma proposta aberta com alterações, salve-a antes.'], passos: [
      { x: 'Clique em **Nova**, na barra superior, e escolha **SEQ em branco**.', fig: '03-01' },
      { x: 'Ou, na tela **Início**, no quadro **SEQ — Soluções e equipamentos**, clique na família do equipamento (por exemplo, **Conjunto motobomba**) ou em **Em branco**.', fig: '03-02' },
      'A proposta abre na aba **Dados gerais**. Preencha o cabeçalho (próximo tutorial).',
    ], resultado: 'A barra superior mostra "SEQ · Proposta nova" e o indicador "● Proposta ainda não salva" aparece depois da primeira alteração.', dica: 'Começar pelo botão da família poupa um passo: depois do cabeçalho, o app vai direto para o item 01, já na família escolhida.' },

    { t: 'h', x: 'Aba Dados gerais' },
    { t: 'p', x: 'A aba **Dados gerais** tem quatro cartões: **Cliente**, **Proposta**, **Vendedor e comissões** e **Frete**, mais o bloco recolhido **Mais opções** (desconto global e R$ por km do frete). Na proposta nova todos os campos dos cartões são obrigatórios.' },
    { t: 'fig', id: '03-03' },
    { t: 'fig', id: '03-04' },
    { t: 'fig', id: '03-05' },
    { t: 'tab', cab: ['Campo', 'Observação'], lin: [
      ['CNPJ / CPF', 'Obrigatório. Vale com 14 dígitos (CNPJ) ou 11 (CPF); o app formata ao mostrar.'],
      ['Cliente (razão social)', 'Ao escolher um cliente já usado, o app recupera da última proposta dele o CNPJ, a UF, o cadastro fiscal e o segmento, **só nos campos vazios**, e avisa: "Cliente já conhecido: … recuperado(s) da última proposta. Confira."'],
      ['Obra / local, UF de destino, Cadastro fiscal, Segmento', 'Obrigatórios. UF e cadastro fiscal mudam os impostos do preço.'],
      ['Nº da proposta, Revisão, Data, Validade', 'Obrigatórios. Revisão e data já vêm preenchidas na proposta nova.'],
      ['Condição de pagamento, Norma', 'Obrigatórios. Escolha na lista.'],
      ['Vendedor', 'Obrigatório. Os nomes vêm de Cadastros → Precificação, cartão **Vendedores e agentes de negócio**. Sem vendedor cadastrado aparece: "Nenhum vendedor cadastrado: cadastre em Cadastros → Precificação → Vendedores e agentes."'],
      ['Comissões', 'Duas caixas: **Vendedor** e **Agente de negócio (AN)**. Com AN marcado, o campo **Agente de negócio** fica obrigatório.'],
      ['Frete → Modalidade', 'Obrigatório. Com frete CIF, informe a **Distância (km)** ou o **Valor fechado (opcional)**. O **Frete total** é calculado.'],
    ] },
    { t: 'tut', titulo: 'Preencher os Dados gerais', objetivo: 'Completar o cabeçalho para liberar as próximas abas.', quem: 'Contribuidor, Editor ou dono. No modo local não há controle de acesso.', pre: ['Proposta SEQ aberta na aba Dados gerais.', 'Vendedores (e agentes, se houver) cadastrados em Cadastros → Precificação, cartão Vendedores e agentes de negócio (Nome, Papel Vendedor ou AN, E-mail opcional, botão Incluir). No modo local, um navegador novo começa sem ninguém cadastrado.'], passos: [
      'Digite o **CNPJ / CPF** do cliente. Se tiver internet, clique em **Buscar na Receita** para preencher cliente, local, UF e cadastro fiscal; confira o resultado.',
      'Complete os campos do cartão **Cliente** que ficaram vazios.',
      'No cartão **Proposta**, informe **Nº da proposta**, **Validade**, **Condição de pagamento** e **Norma** (revisão e data já vêm preenchidas).',
      { x: 'Em **Vendedor e comissões**, toque no nome do vendedor. Marque **Agente de negócio (AN)** só se houver AN, e escolha o nome dele.', fig: '03-05' },
      'Em **Frete**, escolha a **Modalidade**.',
      { x: 'Clique em **Próximo: configuração →** (ou **Próximo: equipamento →**). Se faltar algo, os campos vazios ficam em destaque e a linha de baixo mostra "Falta: …".', fig: '03-03' },
    ], resultado: 'A aba Dados gerais deixa de indicar campos a preencher e o app abre a aba Itens (ou o item 01, quando a proposta começou por uma família).', atencao: 'Na proposta nova, as abas Itens, Custos, Formação, Conferência e Documentos só abrem com o cabeçalho completo; senão aparece "Preencha o cabeçalho antes de seguir" e o app volta para Dados gerais. Sem vendedor cadastrado, o campo Vendedor não tem o que escolher e o cabeçalho não completa: cadastre antes (ou peça a quem cuida de Precificação). Propostas antigas (anteriores a essa regra) abrem sem travar, mas a falta aparece como aviso na Conferência, como "Falta preencher: CNPJ/CPF" no exemplo.', dica: 'Desconto global e R$ por km do frete ficam em **Mais opções**, no fim da aba. O desconto também pode ser ajustado depois, na aba Formação.' },

    { t: 'h', x: 'Buscar na Receita' },
    { t: 'p', x: 'O botão **Buscar na Receita** consulta o CNPJ em serviço público (CNPJ.ws e, na falta dele, BrasilAPI). Com resposta, o app preenche a razão social, a obra/local e a UF (só se estiverem vazios) e sugere o cadastro fiscal, mostrando a fonte e a situação cadastral logo abaixo do campo, com "Confira." no fim.' },
    { t: 'fig', id: '03-06' },
    { t: 'lista', itens: [
      'CNPJ com menos de 14 dígitos: "Para consultar a Receita, informe um CNPJ com 14 dígitos." (CPF não é consultado).',
      'Sem internet ou com o acesso bloqueado: "Não consegui falar com a Receita daqui (sem internet ou bloqueado). Preencha os dados à mão." (tela acima).',
      'CNPJ inexistente: "CNPJ não encontrado na Receita."',
    ] },
    { t: 'nv', x: 'O retorno real da Receita (razão social, cidade, inscrição estadual e o cadastro fiscal sugerido) não foi validado neste manual: as capturas rodam sem acesso à internet, e a consulta externa sempre cai no aviso de falta de conexão. O comportamento descrito acima foi conferido na leitura do código.' },
    { t: 'aviso', x: 'O cadastro fiscal sugerido pela consulta é uma sugestão a partir da inscrição estadual e da atividade da empresa. Confira sempre antes de seguir: ele muda o ICMS e o DIFAL do preço.' },

    { t: 'h', x: 'Salvar' },
    { t: 'p', x: 'A proposta só fica guardada depois de **Salvar**. O indicador ao lado do nome da proposta, na barra superior, mostra o estado.' },
    { t: 'fig', id: '03-07' },
    { t: 'tab', cab: ['Indicador', 'Significado'], lin: [
      ['● Proposta ainda não salva', 'Proposta nova, nunca salva.'],
      ['● Alterações não salvas', 'Há mudanças desde o último salvamento.'],
      ['✓ Salvo às hh:mm', 'Tudo gravado.'],
      ['Não salvou · hh:mm', 'A última tentativa falhou; o motivo aparece num aviso.'],
    ] },
    { t: 'tut', titulo: 'Salvar a proposta', objetivo: 'Gravar a proposta e o resumo dela (total, margem, conferência).', quem: 'Contribuidor, Editor ou dono. No modo local não há controle de acesso.', pre: ['Proposta aberta.'], passos: [
      'Clique em **Salvar** na barra superior, ou pressione **Ctrl+S** (⌘S no Mac).',
      'Aguarde o botão parar de girar. Aparece o aviso "Salvo e confirmado neste navegador: …" (no modo compartilhado, "Salvo e confirmado no banco da equipe: …").',
    ], resultado: 'O indicador mostra "✓ Salvo às hh:mm", a situação no cabeçalho passa de "Não salva" para "Em aberto" e surgem o selo de revisão e o botão **Revisar**.', atencao: 'Se a proposta já foi enviada ao cliente, salvar uma alteração abre a janela "Esta revisão já foi enviada ao cliente", com as opções **Salvar como revisão N** e **É só correção: salvar na revisão N**. Se outra pessoa salvou a mesma proposta enquanto você editava, o app não sobrescreve: abre a janela "Outra pessoa salvou esta proposta" para você escolher.', dica: 'Rascunhos já salvos uma vez são salvos sozinhos depois de 1 minuto sem edição. Se o navegador fechar antes, as alterações voltam na próxima abertura com a faixa "Recuperamos alterações não salvas" e o botão **Salvar agora**.' },
    { t: 'nota', x: 'Ao salvar, o app também roda a conferência e cria ou resolve sozinho as pendências automáticas da proposta (ver o capítulo de Pendências).' },

    { t: 'h', x: 'Abrir uma proposta salva' },
    { t: 'fig', id: '03-10' },
    { t: 'tut', titulo: 'Abrir uma proposta salva', objetivo: 'Voltar a editar ou consultar uma proposta já salva.', quem: 'Qualquer pessoa com acesso ao app (no modo compartilhado o Leitor abre, mas não salva). No modo local, só aparecem as propostas salvas neste navegador.', pre: ['Proposta salva ao menos uma vez.'], passos: [
      'Clique em **Abrir** na barra superior.',
      'Digite parte do número ou do cliente em **Buscar por número ou cliente…**.',
      { x: 'Clique em **Abrir** na linha da proposta.', fig: '03-10' },
    ], resultado: 'A proposta abre na aba Dados gerais, com o aviso "Aberto: …".', atencao: '**Excluir** manda a proposta para a lixeira (o botão pede confirmação). Dá para restaurar em Configurações → Backup e restauração.', dica: 'A tela **Início** também lista as propostas, com busca por cliente, número, peça ou fornecedor, e o atalho **Continuar editando →** para a proposta aberta.' },
    { t: 'p', x: 'Para mandar uma proposta a alguém fora do app, use, na mesma janela, **Baixar .json** ou **Copiar proposta atual**. Quem recebe usa **Abrir .json** (ou cola o texto) e clica em **Importar**; depois precisa clicar em **Salvar**.' },

    { t: 'h', x: 'Duplicar uma proposta' },
    { t: 'fig', id: '03-11' },
    { t: 'tut', titulo: 'Duplicar uma proposta', objetivo: 'Começar uma proposta nova a partir de outra parecida.', quem: 'Contribuidor, Editor ou dono. No modo local não há controle de acesso.', pre: ['Proposta de origem salva.'], passos: [
      'Na tela **Início**, encontre a proposta na lista **Propostas**.',
      { x: 'Clique em **Duplicar** na linha dela.', fig: '03-11' },
      { x: 'A cópia abre em Dados gerais, sem número e com a situação "Não salva".', fig: '03-12' },
      'Informe o novo **Nº da proposta**, ajuste o que mudar e clique em **Salvar**.',
    ], resultado: 'Aviso "Cópia criada: dê um número novo e salve". Depois de salvar, existem duas propostas; a original não muda.', atencao: 'A cópia volta para Em aberto e não leva as justificativas de alertas, os cenários do simulador nem as marcações "não se aplica" da original.', dica: 'Para reaproveitar só um equipamento (e não a proposta inteira), use os modelos de item ou **Buscar em configurações já usadas**, na aba Itens (capítulo 4).' },

    { t: 'h', x: 'Cabeçalho de contexto' },
    { t: 'p', x: 'Em todas as abas da proposta aparece o mesmo cabeçalho, com a identificação à esquerda e os números principais à direita. Ele é atualizado a cada alteração.' },
    { t: 'fig', id: '03-08' },
    { t: 'tab', cab: ['Indicador', 'O que mostra'], lin: [
      ['Valor total', 'Preço total da proposta com IPI.'],
      ['Margem', 'Margem líquida da proposta e o mínimo da política ("mín. 30%" no exemplo). Fica vermelha abaixo do mínimo.'],
      ['Custo', 'Custo total da proposta.'],
      ['Itens', 'Número de itens (posições) usados.'],
      ['Pendências', 'Itens da conferência que impedem ou pedem atenção, mais as pendências em acompanhamento abertas para esta proposta.'],
    ] },
    { t: 'aviso', x: 'O **Custo** do cabeçalho (R$ 2.424.560,16 no exemplo) não inclui o start-up; o **TOTAL CUSTOS** do Memorial (R$ 2.441.560,16) inclui. A diferença, R$ 17.000,00, é a linha "Custos de Startup" do Memorial. A margem do cabeçalho é a mesma do Memorial.' },
    { t: 'nota', x: 'Depois de salvar, as pendências automáticas nascem dos mesmos itens da conferência. O cabeçalho conta cada falha uma vez só: o número de **Pendências** soma os itens da conferência e as pendências abertas à mão (as automáticas não entram de novo).' },

    { t: 'h', x: 'Abas da proposta SEQ' },
    { t: 'fig', id: '03-09' },
    { t: 'p', x: 'As seis etapas (Dados gerais, Itens, Custos, Formação, Conferência e Documentos) mostram a situação ao lado do nome: **✓** concluída, **•** pede atenção, **!** tem problema; sem sinal, ainda há o que preencher. Passe o mouse sobre a aba para ler o motivo (por exemplo, "Dados gerais — 1 campo(s) a preencher"). Memorial e Histórico não têm situação. No fim de cada etapa, os botões **← <etapa anterior>** e **Próximo: <etapa> →** levam à vizinha.' },
    { t: 'p', x: 'O botão **Planilha completa**, na barra superior, troca a visão guiada pela visão com todas as colunas da planilha; **Visão guiada** volta (capítulo 4).' },
  ],
  glossario: [
    ['SEQ', 'Divisão de soluções e equipamentos (conjuntos motobomba, skids, containers e especiais).'],
    ['Cabeçalho de contexto', 'Faixa no topo da proposta com número, cliente, revisão, situação, valor total, margem, custo, itens e pendências.'],
    ['Cadastro fiscal', 'Classificação do cliente para impostos: contribuinte (revenda/industrialização ou uso/consumo) ou não contribuinte.'],
    ['AN (agente de negócio)', 'Terceiro que recebe comissão na proposta, além do vendedor.'],
  ],
};

// ---- trilha de etapas da proposta ----
module.exports.conteudo.push(
  { t: 'h', x: 'A trilha de etapas da proposta' },
  { t: 'p', x: 'Cada proposta na lista da tela **Início** tem uma trilha de círculos, uma por etapa, e a **situação** ao lado do valor (Em aberto, Em aprovação, Enviada ao cliente, Ganha, Encerrada, Perdida, às vezes com um detalhe, como "Em aprovação · com Diretoria e Financeiro"). A etapa seguinte à última concluída fica destacada em laranja, com o nome embaixo (no celular, só ela mostra o nome); no computador, passe o mouse sobre um círculo para ver o nome e a data.' },
  { t: 'tab', cab: ['Etapa', 'Fica marcada (✓) quando'], lin: [
    ['Conferência ok', 'A conferência da proposta, gravada ao salvar, não tem nada que impeça nem aviso pendente. Com avisos, mostra • e "N aviso(s)"; com impeditivos, ! e "N impede(m)"'],
    ['Aprovação', 'Só aparece se houve pedido de aprovação de valor target: ✓ quando aprovada e aplicada'],
    ['Finalizada', 'O PDF da proposta foi conferido (aba Conferência) e continua valendo para a versão salva'],
    ['Enviada ao cliente', 'A proposta foi marcada como enviada'],
    ['Fechada (baixa)', 'Foi dada a baixa (ganha)'],
    ['Financeiro avisado / Engenharia avisada', 'As áreas foram avisadas depois da baixa'],
    ['Custo real lançado', 'O custo real cobre 100% da proposta'],
    ['Encerrada', 'A execução foi encerrada'],
  ] },
  { t: 'tab', cab: ['Símbolo', 'Significado'], lin: [
    ['✓ verde', 'Etapa concluída'], ['• amarelo', 'Em andamento ou com ressalva (avisos, aprovação esperando decisão, PDF desatualizado)'], ['! vermelho', 'Há algo que impede seguir'],
    ['– tracejado', 'Etapa pulada: ficou para trás sem ser feita (por exemplo, a proposta foi enviada sem conferir o PDF)'], ['○ vazio', 'Ainda não chegou'],
  ] },
);
