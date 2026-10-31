// Capítulo 8 — Padronização de descrições
const centro = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, sel);
const fam01 = 'tr:has([data-campofam^="01."])';

module.exports = {
  n: 8, titulo: 'Padronização de descrições', slug: 'padronizacao',
  capturas: [
    { id: '08-01', nome: 'cadastro-campos-por-familia', titulo: 'Cadastro geral → Campos por família', alto: 1200,
      prep: async (p, h) => { await h.nav('cadastro'); await h.cad('geral'); await h.cad('campos'); },
      clip: '#app section.card > p.sub',
      marcas: [
        { sel: `${fam01} td.code`, txt: 'Modelo da descrição técnica: {campo} é trocado pelo valor; [ ... ] é um trecho opcional.', pos: 't' },
        { sel: `${fam01} td:nth-child(4)`, txt: 'Quantos campos técnicos a família tem.', pos: 't' },
        { sel: `${fam01} td:nth-child(5)`, txt: 'Cobertura: quantos nomes do cadastro já seguem o modelo.', pos: 't' },
        { sel: `${fam01} .pill`, txt: '"padrão REV21" ou "ajustado" (alterado nesta tela).', pos: 't' },
        { sel: '[data-campofam^="01."]', txt: 'Editar campos e modelo (ou Criar modelo, numa família sem padrão).', pos: 'b' },
        { sel: 'tr:has([data-campofam^="14."]) td.code', txt: 'Família sem modelo: texto livre, conferido só pelas regras gerais de escrita.', pos: 'b' },
      ] },
    { id: '08-02', nome: 'cadastro-campos-modelo', titulo: 'Campos e modelo de uma família (motor elétrico)', alto: 1200,
      prep: async (p, h) => { await h.clicar('[data-campofam^="10."]', 600); },
      clip: '.modal .card',
      marcas: [
        { sel: '#cmMod', txt: 'Modelo da descrição técnica.', pos: 'l' },
        { sel: '#cmCom', txt: 'Modelo da descrição comercial.', pos: 'l' },
        { sel: '#cmRe', txt: 'Validação extra (expressão regular, opcional).', pos: 'l' },
        { sel: '#cmCampos table', txt: 'Campos: chave, rótulo, tipo, unidade, opções, obrigatório e minúsculas na comercial.', pos: 'l' },
        { sel: '#cmAdd', txt: '+ Campo.', pos: 'l' },
        { sel: '#cmPrev', txt: 'Prévia: exemplo montado e quantos nomes do cadastro seguem o modelo.', pos: 'l' },
        { sel: '.modal .banner.warn', txt: 'Nesta família as fórmulas leem o nome: se o modelo deixar de casar com os nomes, o app pede confirmação.', pos: 'l' },
        { sel: '#cmOk', txt: 'Salvar.', pos: 'b' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '08-03', nome: 'cadastro-descricao-gerada', titulo: 'Aba Características técnicas: campos da família que montam a descrição', alto: 1500,
      prep: async (p, h) => {
        await h.cad('insumos'); await h.clicar('#insNew', 600);
        await p.selectOption('#fFam', '10.MOTORELETRICO'); await h.esperar(400); await p.fill('#fFab', 'WEG');
        await h.clicar('.modal [data-ftab="tecnica"]', 250);
        await p.fill('[data-car="cv"]', '75'); await h.esperar(200);
        for (const [k, v] of [['polos', '4P'], ['tensao', '380/660V'], ['marca', 'WEG'], ['mont', 'MANCAL']]) { await p.check(`input[data-carr="${k}"][value="${v}"]`, { force: true }); await h.esperar(200); }
        await centro(p, '#fCarSec');
      },
      clip: '#fCarSec',
      marcas: [
        { sel: '#fCarSub', txt: 'Padrão da família e o modelo usado.', pos: 't' },
        { sel: '[data-car="cv"]', txt: 'Potência em CV, como o fabricante publica (nada é convertido).', pos: 'l' },
        { sel: '.seg:has([data-carr="freq"])', txt: 'Campo opcional: "—" deixa o trecho fora da descrição.', pos: 't' },
        { sel: '.seg:has([data-carr="mont"])', txt: 'Montagem: MANCAL ou MONOBLOCO.', pos: 'r' },
      ] },
    { id: '08-08', nome: 'cadastro-descricao-gerada-geral', titulo: 'Aba Geral: descrição técnica gerada e descrição comercial sugerida', alto: 1500,
      prep: async (p, h) => { await h.clicar('.modal [data-ftab="geral"]', 250); await h.clicar('#fComSug', 300); await centro(p, '#fProd'); },
      clip: '.modal section.fsec', clipNth: 0,
      marcas: [
        { sel: '#fProd', txt: 'Descrição técnica montada pelo modelo.', pos: 'l' },
        { sel: '#fPad', txt: '"Gerada pelo padrão da família."', pos: 'r' },
        { sel: '#fCom', txt: 'Descrição comercial sugerida (botão Sugerir).', pos: 'l' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '08-04', nome: 'cadastro-duplicidade', titulo: 'Verificação de duplicidade: mesmo produto e semelhantes', alto: 1500,
      prep: async (p, h) => {
        await h.clicar('#insNew', 600);
        await p.selectOption('#fFam', '01.MOTORDIESEL'); await h.esperar(400);
        await h.clicar('.modal [data-ftab="tecnica"]', 250);
        await h.preencher('[data-car="modelo"]', '6M16G308/6'); await h.esperar(400);
        await p.check('input[data-carr="arref"][value="RADIADOR"]', { force: true }); await h.esperar(200);
        await p.check('input[data-carr="ctrl"][value="MEC"]', { force: true }); await h.esperar(200);
        await h.clicar('.modal [data-ftab="geral"]', 250); await h.clicar('#fSave', 400); await centro(p, '#fDup');
      },
      clip: '#fDup',
      marcas: [
        { sel: '#fProd', txt: 'Descrição gerada, igual à de um item já cadastrado.', pos: 'l' },
        { sel: '#fDup .pill.bad', txt: 'Mesmo produto: mesma descrição, ou mesmo fabricante e código do fabricante.', pos: 'l' },
        { sel: '#fDup .pill.mute', txt: 'Semelhante, com diferenças: o app diz em que campo difere.', pos: 'bl' },
        { sel: '#fDup .banner > small', txt: 'Nada é juntado automaticamente.', pos: 'b' },
        { sel: '#fErr', txt: 'Ao salvar um "mesmo produto", o app avisa; só um segundo clique grava.', pos: 'l' },
      ] },
    { id: '08-05', nome: 'cadastro-excecao-padrao', titulo: 'Descrição fora do padrão: justificativa da exceção', alto: 1500,
      prep: async (p, h) => {
        await p.uncheck('#fGerar'); await h.esperar(300);
        await p.fill('#fProd', 'MOTOR DIESEL BAUDOUIN 6M16G308/6 483HP'); await h.esperar(400);
        await centro(p, '#fProd');
      },
      clip: '.modal section.fsec', clipNth: 0,
      marcas: [
        { sel: '#fGerWrap', txt: 'Desmarcado: a descrição é digitada à mão.', pos: 'r' },
        { sel: '#fProd', txt: 'Texto fora do modelo da família.', pos: 'l' },
        { sel: '#fPad', txt: 'Aviso: "Fora do padrão da família" e o modelo esperado.', pos: 'l' },
        { sel: '#fExc', txt: 'Justificativa da exceção: obrigatória para gravar fora do padrão.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '08-06', nome: 'cadastro-sinonimos', titulo: 'Cadastro geral → Sinônimos e abreviações', alto: 1100,
      prep: async (p, h) => {
        await h.cad('geral'); await h.cad('sinonimos');
        await p.fill('#sinK', 'MONO'); await p.fill('#sinV', 'MONOFASICO, MONOF');
      },
      clip: '#app section.card',
      marcas: [
        { sel: '#app section.card tbody tr td.code', txt: 'Termo.', pos: 'l' },
        { sel: '#app section.card tbody tr td:nth-child(2)', txt: 'Também procura por: as outras grafias.', pos: 't' },
        { sel: '[data-sinrm]', txt: 'Remover o grupo.', pos: 'r' },
        { sel: '#sinK', txt: 'Novo termo.', pos: 'l' },
        { sel: '#sinV', txt: 'Outras grafias, separadas por vírgula.', pos: 'b' },
        { sel: '[data-sinadd]', txt: 'Incluir.', pos: 'r' },
      ] },
    { id: '08-07', nome: 'cadastro-padronizacao', titulo: 'Cadastro geral → Padronização de descrições', alto: 1100,
      prep: async (p, h) => { await h.cad('padrao'); },
      clip: '#app section.card',
      marcas: [
        { sel: '#app section.card .kv', txt: 'Padrão de descrição de cada família.', pos: 'l' },
        { sel: '#padFam', txt: 'Família.', pos: 'b' },
        { sel: '#padConf', txt: 'Confiança da sugestão: alta, media ou baixa.', pos: 'b' },
        { sel: '#padSt', txt: 'Pendentes, aplicados, avisos, alterados à mão.', pos: 'b' },
        { sel: '#padQ', txt: 'Buscar nome ou código.', pos: 'b' },
        { sel: '[data-padapply]', txt: 'Aplicar marcadas.', pos: 'b' },
        { sel: '[data-padsel]', txt: 'Marque cada sugestão que vai aplicar.', pos: 'l' },
        { sel: '.tw table tbody tr td:nth-child(3)', txt: 'Nome atual (riscado quando aplicado) → nome padronizado.', pos: 'r' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'A **descrição técnica** do insumo não é só um nome: é a chave pela qual a planilha encontra o item. Nas linhas de componentes, as fórmulas procuram o preço, o fabricante e a origem pela descrição exata (por exemplo, INDEX(CAD_VALOR; MATCH(descrição; CAD_PRODUTO; 0))). Os kits de motor e de bomba também precisam ter a descrição igual à do insumo. E nas famílias de motor diesel, motor elétrico, bomba de eixo livre, motobomba e jockey as fórmulas **leem dados de dentro do nome** (potência, rotação, tensão, arrefecimento, polos, série da bomba).' },
    { t: 'aviso', x: 'Consequências práticas: (1) dois insumos com a **mesma descrição** fazem a fórmula pegar sempre o primeiro; (2) uma descrição fora do formato pode impedir a fórmula de ler a potência ou a rotação; (3) trocar o nome de um insumo sem atualizar estruturas, kits e propostas faz a linha aparecer como "fora do catálogo". Por isso o app padroniza a descrição pelos campos da família, verifica duplicidade e controla o renomear.' },
    { t: 'p', x: 'As telas deste capítulo ficam em **Cadastros** → **Cadastro geral** (abas **Padronização de descrições**, **Campos por família** e **Sinônimos e abreviações**) e na ficha do insumo (**Custos** → **Insumos e preços**). Foram capturadas no **modo local**, em que quem abre o arquivo pode editar. No **modo compartilhado**, gravar exige o papel **Editor**, verificado no banco; se houver responsáveis por área, só quem cuida da área correspondente (Cadastro geral, para modelos, sinônimos e padronização; Custos, para os insumos) ou o dono grava.' },
    { t: 'h', x: 'As três descrições do insumo' },
    { t: 'tab', cab: ['Descrição', 'Para que serve', 'Como é preenchida'], lin: [
      ['Descrição técnica padronizada', 'Nome usado pelas fórmulas, estruturas e kits', 'Gerada pelos campos da família (caixa **gerar pelas características da família**) ou digitada, com justificativa se fugir do padrão'],
      ['Descrição comercial', 'Documentos ao cliente', 'Botão **Sugerir**, pelo modelo comercial da família; só usa o que está preenchido'],
      ['Descrição do fabricante', 'Texto original do catálogo ou da cotação', 'Digitada; não é conferida'],
    ] },
    { t: 'h', x: 'Regras gerais de escrita' },
    { t: 'p', x: 'Valem para todas as famílias. O app confere as quatro primeiras ao digitar e ao salvar; as demais são do documento de padrões e estão embutidas nos modelos das famílias.' },
    { t: 'lista', itens: [
      'Letras MAIÚSCULAS ("Use letras maiúsculas, como no restante do cadastro.").',
      'Um único espaço entre as palavras, sem espaço nas pontas ("Há espaços duplos ou nas pontas.").',
      'Sem traço longo nem " - " como separador ("Sem traço longo nem " - " como separador.").',
      'O formato do modelo da família, quando há modelo ("Fora do padrão da família: <modelo>").',
      'A marca vai no campo **Fabricante**, não no início do nome. Exceção: a marca do motor nos motores elétricos (10) e nas motobombas (12), que faz parte do padrão.',
      'Unidades não são convertidas: CV continua CV, HP continua HP, como o fabricante publica.',
      'Decimal com vírgula na potência (0,5CV; 12,5CV). O ponto fica quando faz parte do código do modelo (6LTAA8.9).',
      'Rotação no formato @{RPM}RPM.',
    ] },
    { t: 'h', x: 'Os padrões das famílias' },
    { t: 'p', x: 'No modelo, {campo} é trocado pelo valor e o trecho entre [ ] é opcional: some quando o campo de dentro está vazio. Os modelos abaixo são os padrões da REV21 (podem ser ajustados em **Campos por família**).' },
    { t: 'tab', cab: ['Família', 'Modelo da descrição técnica', 'Exemplo'], lin: [
      ['01 Motor diesel', '{modelo} {hp}HP@{rpm}RPM {cil}CIL {vcc} {arref}[ {ctrl}]', '6M16G308/6 483HP@1800RPM 6CIL 24VCC RADIADOR MEC'],
      ['10 Motor elétrico', 'MOTOR {cv}CV {polos} IP55 {tensao}[ {freq}][ {ie}] {marca} {mont}', 'MOTOR 75CV 4P IP55 380/660V WEG MANCAL'],
      ['11 Bomba de eixo livre', '{modelo}[ @{rpm}RPM]', 'TKF 125-400 EFF'],
      ['12 Motobomba', '{bomba} C/ MOTOR {acion}[ {marca}][ {motor}] {pot}{unid}[ {polos}][ @{rpm}RPM][ {extras}][ {cert}]', 'GSD 50-200 C/ MOTOR ELÉTRICO WEG 40CV 2P TRIF IR3'],
      ['13 Bomba jockey', '{modelo} {pot}{unid} {fase}[ {freq}][ {tensao}][ {ip}][ {painel}]', 'BT4-0505E7 0,5CV TRIF 60HZ 2/3'],
    ] },
    { t: 'lista', itens: [
      '**Motor diesel (01)**: sem prefixo "MOTOR DIESEL" e sem marca no nome (marca em Fabricante). HP colado em @, RPM colado, {N}CIL sem espaço, tensão 12VCC ou 24VCC, arrefecimento RADIADOR ou TROCADOR DE CALOR; MEC ou ELE no fim é opcional.',
      '**Motor elétrico (10)**: polos 2P, 4P ou 6P; tensões 220/380/440V, 380/660V ou 660V; 50HZ só quando não for 60 Hz; IE2 opcional; marca WEG, ABB ou SEW; montagem MANCAL ou MONOBLOCO. IPW55 é escrito IP55; TRIF e a rotação não entram (a rotação é redundante com os polos).',
      '**Bomba de eixo livre (11)**: série e modelo na notação do catálogo do fabricante, como primeiro termo (TKF, SCE, MEGANORM, IS 080X065X250, AEF…); rotação só quando o catálogo cita.',
      '**Motobomba (12)**: modelo da bomba primeiro, depois C/ MOTOR ELÉTRICO ou C/ MOTOR DIESEL; potência na unidade em que o fabricante cota (HP, CV ou KW).',
      '**Bomba jockey (13)**: potência com vírgula decimal, TRIF ou MONO; o código de tensão do fabricante (2/3, 4V) é mantido.',
    ] },
    { t: 'tut', titulo: 'Cadastrar um insumo com a descrição gerada pelo padrão', objetivo: 'Obter a descrição técnica e a comercial a partir dos dados técnicos, sem digitar o nome.', quem: 'No modo compartilhado: **Editor** da área **Custos** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Ficha técnica do item.', 'Família com modelo (01, 10, 11, 12 ou 13, ou outra configurada em Campos por família).'], passos: [
      'Em **Custos** → **Insumos e preços**, clique em **+ Novo insumo** e escolha a **Família**.',
      { x: 'Na aba **Características técnicas**, preencha as **Características técnicas**. Campos opcionais com "—" ficam fora da descrição. Na aba **Geral**, confira a **Descrição técnica padronizada** e a mensagem "Gerada pelo padrão da família.". Clique em **Sugerir** para a **Descrição comercial**.', fig: '08-03' },
      { x: 'Na aba **Geral**, a descrição técnica aparece montada e **Sugerir** preenche a descrição comercial.', fig: '08-08' },
      'Preencha o **Fabricante** (a marca não vai no nome, salvo nas famílias 10 e 12) e o preço.',
      'Clique em **Cadastrar**.',
    ], resultado: 'O item é gravado com a descrição no padrão e com as características guardadas no registro.', atencao: 'Enquanto faltar campo obrigatório, a mensagem mostra "Faltam: …" e a descrição não é montada.', dica: 'A descrição comercial usa minúsculas em arrefecimento, montagem e acionamento (por exemplo, "montagem mancal"); marcas e códigos ficam como estão.' },
    { t: 'h', x: 'Verificação de duplicidade' },
    { t: 'p', x: 'Ao digitar, a ficha compara o item com o cadastro e mostra, no quadro **Antes de salvar, confira**, até oito itens em três níveis. Nada é juntado automaticamente: quem decide é a pessoa.' },
    { t: 'tab', cab: ['Nível', 'Quando aparece'], lin: [
      ['Mesmo produto', 'Mesma descrição (sem diferenciar acentos e pontuação), ou mesmo fabricante e mesmo código do fabricante. Vale para qualquer família.'],
      ['Possivelmente equivalente', 'Mesma família, ao menos duas características técnicas (número ou lista) iguais e nenhuma diferente, e descrição parecida.'],
      ['Semelhante, com diferenças', 'Mesma família e descrição parecida; o app diz em que campo difere (por exemplo, "difere em potência (898)").'],
    ] },
    { t: 'tut', titulo: 'Tratar um aviso de duplicidade', objetivo: 'Evitar dois insumos com o mesmo nome, que fazem a fórmula pegar sempre o primeiro.', quem: 'Quem cadastra insumos: no modo compartilhado, **Editor** da área **Custos** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Ficha de novo insumo preenchida.'], passos: [
      { x: 'Leia o quadro **Antes de salvar, confira**. Se houver **Mesmo produto**, ao clicar em **Cadastrar** o app avisa "Já existe <código> com mesma descrição. A fórmula pega sempre o primeiro com o mesmo nome. Clique de novo só se for mesmo outro produto."', fig: '08-04' },
      'Se for o mesmo item, clique em **Cancelar** e use o insumo existente (ou atualize o preço dele).',
      'Se for outro produto, diferencie a descrição pelas características que mudam (potência, tensão, configuração).',
      'Só clique de novo em **Cadastrar** se for, de fato, outro produto com a mesma descrição.',
    ], resultado: 'O cadastro fica sem nomes repetidos, ou o nome repetido é gravado de forma consciente.', atencao: 'Itens semelhantes com potência, tensão, material ou configuração diferentes são produtos distintos: não os junte.', dica: 'Nomes já repetidos no cadastro aparecem em **Visão geral** → **Qualidade dos dados** como "Possível duplicidade (mesmo nome)", com o botão **Consolidar…**.' },
    { t: 'h', x: 'Exceção ao padrão' },
    { t: 'p', x: 'Quando o dado não existe na ficha do fabricante ou o nome precisa fugir do modelo, desmarque **gerar pelas características da família** e digite a descrição. Se ela não seguir o padrão, o campo **Justificativa da exceção ao padrão** aparece e passa a ser obrigatório para gravar. Itens com exceção justificada não aparecem como "fora do padrão" na lista.' },
    { t: 'tut', titulo: 'Gravar uma descrição fora do padrão com justificativa', objetivo: 'Cadastrar um item cujo nome não cabe no modelo, sem esconder a exceção.', quem: 'No modo compartilhado: **Editor** da área **Custos** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Motivo da exceção (ex.: código do fabricante não segue a série; nome exigido pelo cliente).'], passos: [
      'Na ficha, desmarque **gerar pelas características da família**.',
      { x: 'Digite a descrição. Leia o aviso "⚠ Fora do padrão da família: …" e preencha a **Justificativa da exceção ao padrão**.', fig: '08-05' },
      'Clique em **Cadastrar** (ou **Salvar**).',
    ], resultado: 'O item é gravado com a justificativa no registro.', atencao: 'Sem justificativa o app não grava: "Fora do padrão da família: … — informe a justificativa da exceção ou corrija a descrição." Lembre que, nas famílias 01, 10, 11, 12 e 13, as fórmulas leem o nome: uma exceção pode impedir a leitura de potência ou rotação.' },
    { t: 'h', x: 'Campos por família e cobertura' },
    { t: 'p', x: 'Em **Cadastro geral** → **Campos por família**, cada família mostra o modelo da descrição, o número de campos, a cobertura (**Cadastro no modelo**: quantos nomes do cadastro já seguem o modelo) e se está no **padrão REV21** ou **ajustado**. Famílias sem modelo usam texto livre, conferido só pelas regras gerais. **Editar** (ou **Criar modelo**) abre a janela **Campos e modelo**.' },
    { t: 'fig', id: '08-01' },
    { t: 'tut', titulo: 'Ajustar os campos e o modelo de uma família', objetivo: 'Mudar campos técnicos ou o modelo de descrição sem alterar o código do app.', quem: 'No modo compartilhado: **Editor** da área **Cadastro geral** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Conhecer o padrão da família (tabela acima e docs/padroes-descricoes.md).'], passos: [
      'Em **Cadastro geral** → **Campos por família**, clique em **Editar** na família.',
      { x: 'Ajuste o **Modelo da descrição técnica**, o **Modelo da descrição comercial** e, se quiser, a **Validação extra (expressão regular, opcional)**. Em **Campos**, ajuste chave, rótulo, tipo (texto, número, lista), unidade, opções, obrigatório e minúsculas; use **+ Campo** para incluir.', fig: '08-02' },
      'Leia a prévia: o exemplo montado e "No cadastro: X de Y nomes desta família seguem este modelo".',
      'Clique em **Salvar**.',
    ], resultado: 'Aviso "Família <família> salva" e o selo **ajustado** na lista. As fichas novas passam a usar os campos e o modelo novos.', atencao: 'Nas famílias 01, 10, 11, 12 e 13, se o modelo novo deixar de reproduzir nomes que hoje estão no padrão, o app avisa quantos deixam de casar e o botão vira **Confirmar mesmo assim**. O modelo não pode citar campo que não existe ("O modelo usa campos que não existem: …").', dica: 'O botão **Voltar ao padrão da REV21** desfaz o ajuste da família.' },
    { t: 'h', x: 'Sinônimos e abreviações' },
    { t: 'p', x: 'Os sinônimos ampliam o que a busca de insumos encontra: buscar qualquer grafia de um grupo encontra as demais. Nenhum nome do cadastro é trocado. O ponto de partida são as grafias que o documento de padrões unificou (TRIF/TRIFASICO/TRI, 2P/2 POLOS, IP55/IP-55/IPW55, TROCADOR/TROCADOR DE CALOR, MOTOBOMBA/CMB, C//COM…).' },
    { t: 'tut', titulo: 'Incluir um sinônimo', objetivo: 'Fazer a busca encontrar um item por outra grafia.', quem: 'No modo compartilhado: **Editor** da área **Cadastro geral** (ou o dono). No modo local, quem abre o arquivo.', pre: [], passos: [
      'Em **Cadastro geral** → **Sinônimos e abreviações**, digite o **Termo**.',
      { x: 'Em **Outras grafias (separadas por vírgula)**, digite as variações e clique em **Incluir**.', fig: '08-06' },
      'Teste na busca de **Insumos e preços**.',
    ], resultado: 'Aviso "Sinônimos salvos" e a nova linha na tabela.', atencao: 'A busca divide o texto digitado em palavras e procura cada palavra como trecho. Por isso grafias com espaço ("2 POLOS") não funcionam como sinônimo de uma palavra só, e grafias curtas (como "TRI") também encontram palavras que as contêm (ELETRICO).', dica: 'Prefira sinônimos de uma palavra só, com pelo menos quatro letras.' },
    { t: 'h', x: 'Padronização das descrições existentes' },
    { t: 'p', x: 'Em **Cadastro geral** → **Padronização de descrições** está a proposta de padronização de motores diesel, elétricos, bombas, motobombas e jockey, feita a partir de catálogos e fichas de fabricantes. Cada linha mostra o nome atual → padronizado, a **confiança** (alta = conferido na ficha; media = só formato e catálogo da série; baixa = há dúvida) e o motivo com a fonte. Ao aplicar, o app troca o nome no insumo, nos kits com o mesmo nome e nas estruturas e tabelas, e grava os pares nome antigo → novo para as propostas salvas.' },
    { t: 'tut', titulo: 'Aplicar a padronização sugerida', objetivo: 'Colocar no padrão os nomes antigos sem quebrar fórmulas.', quem: 'No modo compartilhado: **Editor** da área **Cadastro geral** (ou o dono). No modo local, quem abre o arquivo.', pre: ['Backup recente (Configurações → Backup e restauração).'], passos: [
      { x: 'Filtre por família, confiança e situação (**Pendentes**). Busque pelo nome ou código, se quiser.', fig: '08-07' },
      'Revise as linhas marcadas. Desmarque o que não quer aplicar (use **Desmarcar visíveis** para começar do zero e marque uma a uma).',
      'Clique em **Aplicar marcadas (N)**.',
    ], resultado: 'Aviso "N descrição(ões) padronizada(s)". As linhas passam a **Aplicados**, com o nome antigo riscado.', atencao: 'As sugestões pendentes já vêm **marcadas**, exceto as de confiança baixa e as que deixariam dois nomes iguais com preço diferente. Ao abrir a tela, o botão já mostra muitas marcadas (326 na captura): revise antes de aplicar.' },
    { t: 'h', x: 'Cuidado ao renomear' },
    { t: 'lista', itens: [
      'Renomeie pela ficha do insumo ou pela tela de padronização: elas atualizam estruturas, tabelas por porte, kits e o registro nome antigo → novo. Ver o tutorial "Renomear um insumo usado em estrutura" (capítulo 7).',
      'Não renomeie insumos cujo nome a estrutura monta (prefixo + porte, como BASE 1 a BASE 10 e EMBALAGEM por porte): o app bloqueia e pede para mudar o prefixo na estrutura.',
      'O nome não pode ser alterado pela edição em massa, porque é a chave das fórmulas.',
      'Depois de renomear, propostas salvas mostram o nome novo quando abertas; propostas enviadas, aprovadas e ganhas mantêm os preços da época.',
      'Confira a cobertura em **Campos por família** e a lista "Descrição fora do padrão" em **Qualidade dos dados**.',
    ] },
    { t: 'nv', x: 'A busca com sinônimos de mais de uma palavra ("2 POLOS") foi testada: retorna itens que contêm "2" e "POLOS" em qualquer lugar, não os itens 2P. Não foi verificado se isso é o comportamento pretendido.' },
  ],
  glossario: [
    ['Descrição técnica padronizada', 'Nome do insumo no formato da família; é a chave que as fórmulas, estruturas e kits usam.'],
    ['Modelo de descrição', 'Texto com {campos} e [trechos opcionais] que monta a descrição a partir das características da família.'],
    ['Cobertura', 'Quantos nomes de uma família seguem o modelo de descrição.'],
    ['Exceção ao padrão', 'Descrição fora do modelo, gravada com justificativa obrigatória.'],
    ['Sinônimo', 'Grafia alternativa que a busca também encontra; não altera o cadastro.'],
  ],
};
