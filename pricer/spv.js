/* LS Pricer — página inicial, formação de custo SPV (serviços e pós-venda) e documentos.
 * Lógica da planilha "PRECIFICAÇÃO SERVIÇOS MASTERDOC": custo da prestação (equipe e
 * deslocamento) × multiplicador, impostos e comissões sobre a venda bruta, lucro líquido
 * mínimo de 40%; peças com fator próprio. Documentos ficam no banco da equipe (assets + db).
 */
(function () {
  'use strict';
  const CDN = {
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfworker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  };
  const loaded = {};
  function load(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Não consegui carregar a biblioteca. Verifique a internet e tente de novo.')); }; document.head.appendChild(s); });
    return loaded[src];
  }

  // famílias de produto por divisão (tabela de famílias da LS Fire)
  const FAMPROD = [
    [1, 'BOMBAS DE EIXO LIVRE', 'SEQ', 'BBA', 'Bombas centrífugas de eixo livre para aplicações em geral (água, efluentes, processos industriais)'],
    [2, 'BOMBAS MONOBLOCO', 'SEQ', 'BMB', 'Bombas centrífugas monobloco para aplicações em geral (água, efluentes, processos industriais)'],
    [3, 'CONJUNTOS MOTOBOMBA – APLICAÇÕES GERAIS', 'SEQ', 'CBL', 'Conjuntos motobomba (bomba + motor em base com luva de acoplamento) para aplicações em geral'],
    [4, 'CONJUNTOS MOTOBOMBA – SISTEMAS DE INCÊNDIO', 'SEQ', 'CMB', 'Conjuntos motobomba diesel, elétricos e jockey para sistemas de combate a incêndio'],
    [5, 'TREINAMENTOS E START-UP', 'SPV', 'TRT', 'Treinamentos de operação e manutenção, aplicação, produtos, etc.'],
    [6, 'BOMBAS SUBMERSÍVEIS', 'SEQ', 'BBS', 'Bombas submersíveis para água limpa, esgoto, drenagem e efluentes em geral'],
    [7, 'MOTORES INDUSTRIAIS E MARÍTIMOS', 'SEQ', 'MOT', 'Motores industriais e marítimos para acionamento de bombas e equipamentos'],
    [8, 'SKIDS DE MOTOBOMBAS – SISTEMAS DE INCÊNDIO', 'SEQ', 'SKD', 'Skids completos de motobombas com base, tubulação, válvulas e acessórios para combate a incêndio'],
    [9, 'TANQUES DE COMBUSTÍVEL', 'SPV', 'TAQ', 'Tanques de combustível (diesel) para conjuntos motobomba e sistemas de bombeamento'],
    [10, 'PAINÉIS DE COMANDO E CONTROLE', 'SPV', 'PAN', 'Painéis de comando e controle de bombas (SVE, Tornatech e equivalentes)'],
    [11, 'SERVIÇOS E MANUTENÇÕES EM CAMPO', 'SPV', 'SMC', 'Manutenções corretivas e preventivas, inspeção pontual (SPOT), testes de casa de bombas, alinhamentos, montagem'],
    [12, 'SERVIÇOS E MANUTENÇÕES EM FABRICA', 'SPV', 'SMF', 'Manutenções corretivas e preventivas realizadas em fábrica'],
    [14, 'PRODUTOS ENGENHEIRADOS E SOLUÇÕES ESPECIAIS', 'SEQ', 'ESP', 'Soluções engenheiradas, conjuntos especiais, bombas e skids customizados'],
    [15, 'MOTOBOMBAS PORTÁTEIS – LINHA KUBE', 'SEQ', 'KUB', 'Motobombas portáteis Kube (linha Turquia e similares)'],
    [16, 'SOLUÇÕES FIRECONNECT', 'SPV', 'FRC', 'Serviços de instalação, integração e suporte de sistemas Fireconnect'],
    [17, 'CONTAINERS / CASAS DE BOMBAS – SISTEMAS DE INCÊNDIO', 'SEQ', 'CON', 'Containers e casas de bombas completas para sistemas de combate a incêndio'],
    [18, 'PEÇAS DE REPOSIÇÃO E SOBRESSALENTES', 'SPV', 'PAR', 'Peças de reposição para bombas e motores, flanges, válvulas de alívio, waste cone, trocadores de calor etc.'],
    [19, 'INSPEÇÕES E CONTRATOS DE MANUTENÇÃO', 'SPV', 'ITM', 'Contratos de inspeções, testes periódicos e manutenção recorrente'],
    [20, 'LOCAÇÃO DE EQUIPAMENTOS (RENTALS)', 'SPV', 'REN', 'Locação de bombas, skids, containers, painéis e sistemas completos'],
    [21, 'SISTEMAS DE FILTRAGEM', 'SPV', 'SFL', 'Sistemas de filtragem de óleo diesel para tanques de combustível'],
    [22, 'FACTS — TESTE AUTOMÁTICO DE BOMBAS (CHURN TEST)', 'SEQ', 'FAC', 'Sistema automático de teste e monitoramento de bombas de incêndio (FACTS, aprovado FM 1330 / NFPA 25)'],
  ];
  // como cada tipo de SPV começa: equipe/deslocamento, peças, contrato
  const TIPO_INI = {
    SMC: { equipe: 1, pecas: 1, titulo: 'Serviço em campo' }, SMF: { equipe: 1, pecas: 1, campo: 0, titulo: 'Serviço em fábrica' },
    PAR: { equipe: 0, pecas: 1, titulo: 'Peças e sobressalentes' }, ITM: { equipe: 1, pecas: 0, contrato: 1, titulo: 'Inspeção / contrato' },
    TRT: { equipe: 1, pecas: 0, titulo: 'Treinamento / start-up' }, REN: { equipe: 0, pecas: 1, locacao: 1, titulo: 'Locação' },
    PAN: { equipe: 1, pecas: 1, titulo: 'Painéis' }, TAQ: { equipe: 1, pecas: 1, titulo: 'Tanques' }, FRC: { equipe: 1, pecas: 1, titulo: 'Fireconnect' }, SFL: { equipe: 1, pecas: 1, titulo: 'Filtragem' },
  };
  const STATUS = [['rascunho', 'Rascunho', 'mute'], ['enviada', 'Enviada', 'warn'], ['negociacao', 'Em negociação', 'warn'], ['ganha', 'Ganha', 'ok'], ['perdida', 'Perdida', 'bad']];
  const DOC_TIPOS = [['orcamento', 'Orçamento de fornecedor'], ['nota', 'Nota fiscal'], ['pedido', 'Pedido de compra'], ['contrato', 'Contrato'], ['tecnico', 'Desenho / data sheet'], ['proposta', 'Proposta enviada'], ['outro', 'Outro']];
  // valores padrão, tirados da planilha MASTERDOC (diárias de 21/02/2025)
  const DEF = {
    tecnicos: [{ nome: 'João Mendes', funcao: 'Consultoria / inspeção', diaria: 1500 }, { nome: 'Juarez Lucas', funcao: 'Técnico', diaria: 550 }, { nome: 'Yago', funcao: 'Mecânico', diaria: 580 }, { nome: 'Roger', funcao: 'Eletricista', diaria: 390 }, { nome: 'Alessandro', funcao: 'Ajudante', diaria: 380 },
      { nome: 'Diária mecânico (terceiro)', funcao: 'Mecânico', diaria: 450 }, { nome: 'Diária automação (terceiro)', funcao: 'Automação', diaria: 2450 }, { nome: 'Diária elétrica (terceiro)', funcao: 'Elétrica', diaria: 750 }, { nome: 'Diária consultoria', funcao: 'Consultoria', diaria: 3000 }, { nome: 'Diária inspetor', funcao: 'Inspetor', diaria: 1500 }],
    custos: { rkm: 2.7, aereo: 2500, carro: 300, hotel: 250, alim: 150, art: 275, limite_km: 1000, saida: 'Rua Guilherme Boldt, 124 — Joinville/SC' },
    mk: { mult: 3, pis: 0.0065, cofins: 0.03, irpj: 0.048, iss: 0.05, fin: 0, com_rep: 0, com_capt: 0, com_orc: 0.025, prazo: 0.035, lucro_min: 0.4, fator_pecas: 1.5, cambio_usd: 5.5, cambio_eur: 6, fimp: 1.8, irpj_pecas: 0.0308 },
  };
  // modelos de serviço e contrato: escopo, equipe e frequência prontos para começar uma proposta
  const ESC_ITM = `Inspeção e testes periódicos da casa de bombas de incêndio conforme NFPA 25 e ABNT NBR 16704. Em cada visita:
• Partida e funcionamento das bombas principal (diesel ou elétrica) e jockey, com registro das pressões de sucção e recalque, rotação e tempo de partida
• Motor diesel: nível de óleo, líquido de arrefecimento e combustível, correias, mangueiras, filtros, baterias e carregador
• Bomba: gaxetas ou selo, mancais, vibração e ruídos anormais, alinhamento visual
• Painéis de comando: alarmes, sinalizações e operação em automático
• Válvulas de sucção, recalque, alívio e teste na posição correta
• Relatório técnico com fotos e recomendações após cada visita`;
  const EXC = 'Peças, materiais e consumíveis não listados (orçados à parte); obra civil, andaimes e içamento; água, energia e combustível para os testes; adequações pedidas após a visita; horas paradas por indisponibilidade do local.';
  const FREQ = [[12, 'Mensal'], [6, 'Bimestral'], [4, 'Trimestral'], [3, 'Quadrimestral'], [2, 'Semestral'], [1, 'Anual']];
  DEF.modelos = FREQ.map(([v, lb]) => ({ id: 'itm' + v, tipo: 'ITM', nome: `Contrato anual — ${v} visita${v > 1 ? 's' : ''} (${lb.toLowerCase()})`, visitas: v, meses: 12, equipe: [{ tec: 'Yago', dias: 1 }],
    escopo: ESC_ITM + (v === 1 ? '' : '\n• Uma vez por ano: teste de desempenho (curva de vazão) da bomba principal'), exclusoes: EXC, prazo: `${v} visita${v > 1 ? 's' : ''} por ano, durante 12 meses` })).concat([
    { id: 'smc-prev', tipo: 'SMC', nome: 'Manutenção preventiva anual — motobomba diesel', equipe: [{ tec: 'Yago', dias: 2 }, { tec: 'Alessandro', dias: 2 }], prazo: '2 dias em campo',
      escopo: 'Manutenção preventiva anual do conjunto motobomba diesel: troca de óleo lubrificante e filtros (óleo, combustível e ar), inspeção e troca de correias, verificação do líquido de arrefecimento, baterias e carregador, reaperto geral, teste de partida e funcionamento com registro de pressões, e relatório técnico.', exclusoes: EXC },
    { id: 'smc-spot', tipo: 'SMC', nome: 'Inspeção pontual (SPOT)', equipe: [{ tec: 'João Mendes', dias: 1 }], prazo: '1 dia em campo',
      escopo: 'Inspeção técnica pontual da casa de bombas: avaliação das bombas, motores, painéis, válvulas e tubulação, teste de funcionamento e relatório com não conformidades e recomendações (NFPA 25 / ABNT NBR 16704).', exclusoes: EXC },
    { id: 'smc-teste', tipo: 'SMC', nome: 'Teste de desempenho da casa de bombas (curva de vazão)', equipe: [{ tec: 'Yago', dias: 1 }, { tec: 'Roger', dias: 1 }], prazo: '1 dia em campo',
      escopo: 'Teste anual de desempenho da bomba de incêndio: medição de vazão a 0%, 100% e 150% da nominal, pressões e rotação, comparação com a curva de fábrica e relatório técnico com laudo e ART.', exclusoes: EXC },
    { id: 'smc-alinh', tipo: 'SMC', nome: 'Alinhamento de conjunto motobomba', equipe: [{ tec: 'Yago', dias: 1 }], prazo: '1 dia em campo',
      escopo: 'Alinhamento do conjunto motobomba (motor e bomba) com relógio comparador ou laser, verificação do acoplamento e da base, teste de funcionamento e relatório com as medidas antes e depois.', exclusoes: EXC },
    { id: 'trt-startup', tipo: 'TRT', nome: 'Start-up e comissionamento', equipe: [{ tec: 'João Mendes', dias: 2 }], prazo: '2 dias em campo',
      escopo: 'Start-up e comissionamento do sistema de bombeamento: verificação da instalação, primeira partida, ajuste dos pressostatos e do painel, testes de funcionamento e de vazão, orientação à equipe do cliente e relatório de comissionamento.', exclusoes: EXC },
    { id: 'trt-trein', tipo: 'TRT', nome: 'Treinamento de operação e manutenção (8 h)', equipe: [{ tec: 'João Mendes', dias: 1 }], prazo: '1 dia (8 horas)',
      escopo: 'Treinamento teórico e prático de 8 horas para a equipe do cliente: funcionamento do sistema, operação dos painéis, partida manual e automática, rotinas de inspeção semanal e mensal (NFPA 25) e cuidados de manutenção. Inclui material didático e certificado.', exclusoes: EXC },
    { id: 'frc-ativacao', tipo: 'FRC', nome: 'Fireconnect — instalação e ativação', equipe: [{ tec: 'Roger', dias: 1 }, { tec: 'João Mendes', dias: 1 }], prazo: '1 dia em campo', pecas: [],
      escopo: 'Instalação e ativação do monitoramento remoto Fireconnect na casa de bombas: montagem do gateway e dos sensores, ligação ao painel da bomba, configuração da conta e dos alarmes, teste de comunicação e treinamento rápido dos usuários. Cadastre aqui as peças padrão do kit Fireconnect para elas entrarem sozinhas na proposta.', exclusoes: EXC },
    { id: 'facts-comiss', tipo: 'TRT', nome: 'FACTS — instalação assistida e comissionamento', equipe: [{ tec: 'Roger', dias: 2 }, { tec: 'João Mendes', dias: 1 }], prazo: '2 dias em campo por casa de bombas',
      escopo: `Comissionamento do sistema FACTS (MECON) conforme o checklist do fabricante:
• Conferência das pressões na tela de leituras analógicas contra os manômetros, com a bomba parada e em operação
• Baterias acima de 13 V, temperatura da sala, vibração zerada e LEDs dos sensores de posição
• Teste dos sensores de alagamento, proteção do acoplamento, stop relay, fluxostato de demanda de água, sensor de presença, nível de óleo e válvula de alívio de circulação
• Retirada do controlador do automático (sinalização "Not in automatic") e supervisão das válvulas no painel de alarme (FACU 2)
• Acionamento manual dos atuadores: sinalizador, sirene, sinal ao painel de alarme e solenoides de gaxeta
• Auto commissioning do FACTS e teste de filtro obstruído em modo manual
• Relatório de comissionamento assinado e treinamento dos operadores`, exclusoes: EXC },
    { id: 'facts-anual', tipo: 'ITM', nome: 'FACTS — manutenção anual (checklist MECON)', visitas: 1, meses: 12, equipe: [{ tec: 'Roger', dias: 1 }], prazo: '1 visita por ano',
      escopo: `Manutenção anual do sistema FACTS (MECON) pelo checklist do fabricante: conferência das pressões e dos sensores (baterias, temperatura, vibração, posição, alagamento, proteção do acoplamento, demanda de água, presença, nível de óleo, válvula de alívio de circulação), teste dos atuadores e da supervisão das válvulas, auto commissioning, teste de filtro obstruído e emissão do relatório anual. Os testes semanais seguem automáticos pelo FACTS (NFPA 25 / FM Data Sheet 2-81).`, exclusoes: EXC },
    { id: 'smf-revisao', tipo: 'SMF', nome: 'Revisão geral de bomba em fábrica', equipe: [{ tec: 'Yago', dias: 3 }], prazo: '15 dias úteis após a chegada do equipamento',
      escopo: 'Revisão geral da bomba em fábrica: desmontagem, limpeza, inspeção dimensional do rotor, eixo, buchas e mancais, troca de rolamentos, gaxetas ou selo mecânico e juntas, montagem, pintura e teste. Relatório com fotos e peças substituídas.', exclusoes: EXC },
  ]);
  const PRECO_KEYS = ['rkm', 'aereo', 'carro', 'hotel', 'alim', 'art'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);

  function SPV(ctx) {
    const { REG, esc, brl, pct, fmtNum, NF, modal, toast, parseInput } = ctx;
    const $ = (s, el = document) => el.querySelector(s);
    const cfg = () => { const c = (REG.tabelas.SPV || {}).cfg || {}; return { tecnicos: c.tecnicos || DEF.tecnicos, modelos: c.modelos || DEF.modelos, custos: Object.assign({}, DEF.custos, c.custos || {}), mk: Object.assign({}, DEF.mk, c.mk || {}) }; };
    const famprod = () => { const ov = (REG.tabelas.FAMPROD || {}); return FAMPROD.map(([code, nome, div, abrev, desc]) => Object.assign({ code, nome, div, abrev, desc }, ov[abrev] || {})); };
    const spvTipos = () => famprod().filter((f) => f.div === 'SPV');
    const tipoInfo = (ab) => famprod().find((f) => f.abrev === ab) || { abrev: ab, nome: ab, desc: '' };
    const st = () => ctx.getState();
    const S = () => st().spv;
    const precosCad = () => { const k = cfg().custos; return Object.fromEntries(PRECO_KEYS.map((x) => [x, num(k[x])])); };
    const modelosDe = (tipo) => cfg().modelos.filter((m) => m.tipo === tipo);
    function aplicarModelo(s, m) {
      const c = cfg();
      Object.assign(s, { tipo: m.tipo, modelo: m.id, descricao: m.escopo || '', exclusoes: m.exclusoes || '', prazo_exec: m.prazo || '' });
      if (m.equipe && m.equipe.length) { s.equipe = m.equipe.map((e) => { const t = c.tecnicos.find((x) => x.nome === e.tec); return { tec: e.tec, diaria: t ? t.diaria : num(e.diaria), dias: num(e.dias) || 1 }; }); s.blocos.equipe = true; }
      if (m.pecas && m.pecas.length) {
        const pb = pricebook(); const mk = Object.assign({}, c.mk, s.mk || {});
        s.pecas = m.pecas.map((x) => { const h = !num(x.unit) && pb.get(norm(x.desc)); const last = h && h[0];
          return { desc: x.desc, cod: x.cod || (last && last.cod) || '', forn: x.forn || (last && last.forn) || '', qtd: num(x.qtd) || 1, un: x.un || '', unit: num(x.unit) || (last ? last.unit : 0), moeda: x.moeda || (last && last.moeda) || 'BRL', ipi: num(x.ipi) || (last ? last.ipi : 0), fator: x.fator != null ? x.fator : mk.fator_pecas, incluso: true }; });
        s.blocos.pecas = true;
      }
      if (m.visitas) { s.contrato = Object.assign({}, s.contrato, { visitas: m.visitas, meses: m.meses || 12 }); s.blocos.contrato = true; }
      else s.blocos.contrato = false;
    }

    // ---------- novo SPV ----------
    function novoSpv(tipo) {
      const c = cfg(); const ini = TIPO_INI[tipo] || { equipe: 1, pecas: 1 };
      const spv = { tipo, cliente: '', contato: '', local: '', uf: 'SC', numero: '', revisao: '0', data: new Date().toISOString().slice(0, 10), validade: 15, vendedor: '', descricao: '', escopo: '', exclusoes: '', pagamento: '30 DDL', prazo_exec: '',
        blocos: { equipe: !!ini.equipe, pecas: !!ini.pecas, contrato: !!ini.contrato },
        equipe: ini.equipe ? [{ tec: c.tecnicos[2] ? c.tecnicos[2].nome : '', diaria: c.tecnicos[2] ? c.tecnicos[2].diaria : 0, dias: 1 }] : [],
        dist: 0, ov: {}, precos: precosCad(), campo: ini.campo !== 0, pecas: [], contrato: { visitas: 12, meses: 12, reajuste: 'IPCA' }, mk: { mult: c.mk.mult }, status: 'rascunho' };
      const m0 = modelosDe(tipo)[0]; if (m0) aplicarModelo(spv, m0);
      ctx.setState({ id: null, uid: uid(), div: 'SPV', name: '', spv, status: 'rascunho' });
      ctx.ui.view = 'proposta'; ctx.render(); window.scrollTo(0, 0);
    }

    // ---------- contas ----------
    function icmsPecas(s) {
      if (typeof (s.mk || {}).icms === 'number') return s.mk.icms;
      const uf = String(s.uf || 'SC').toUpperCase();
      for (let r = 79; r <= 105; r++) if (ctx.txt('PARÂMETROS', 'D' + r) === uf) { const v = ctx.val('PARÂMETROS', uf === 'SC' ? 'E' + r : 'F' + r); if (typeof v === 'number') return v; }
      return 0.12;
    }
    function calc(s) {
      const c = cfg(); const mk = Object.assign({}, c.mk, s.mk || {}); const k = c.custos;
      const eq = s.blocos.equipe ? s.equipe.filter((e) => num(e.dias) > 0) : [];
      const pessoas = eq.length; const dias = eq.reduce((m, e) => Math.max(m, num(e.dias)), 0);
      const mo = eq.reduce((t, e) => t + num(e.diaria) * num(e.dias), 0);
      const ida = num(s.dist); const aereo = s.blocos.equipe && ida * 2 > k.limite_km;
      const auto = {
        km: s.blocos.equipe && !aereo ? ida * 2 : 0, aereo_qtd: aereo ? pessoas * 2 : 0, carro_dias: aereo ? Math.max(dias - 1, 0) : 0,
        hotel_noites: s.campo === false ? 0 : Math.max(dias - 1, 0) * pessoas, alim_qtd: dias * pessoas, art_qtd: s.blocos.equipe && pessoas ? 1 : 0, frete: 0, outros: 0,
      };
      const ov = s.ov || {}; const L = {}; for (const f of Object.keys(auto)) L[f] = typeof ov[f] === 'number' ? ov[f] : auto[f];
      const pr = s.precos || {}; const preco = Object.fromEntries(PRECO_KEYS.map((x) => [x, num(pr[x] ?? ov[x] ?? k[x])]));
      const logLines = s.blocos.equipe ? [
        ['km', 'Deslocamento rodoviário', 'km', preco.rkm, 'rkm'], ['aereo_qtd', 'Passagens aéreas', 'trechos', preco.aereo, 'aereo'], ['carro_dias', 'Locação de automóvel', 'diárias', preco.carro, 'carro'],
        ['hotel_noites', 'Hotel (quarto individual)', 'noites', preco.hotel, 'hotel'], ['alim_qtd', 'Alimentação', 'refeições-dia', preco.alim, 'alim'], ['art_qtd', s.blocos.contrato ? 'ART (uma vez por contrato)' : 'ART (uma por serviço)', 'un.', preco.art, 'art'],
        ['frete', 'Frete de insumos / ferramentas', 'R$', 1, null], ['outros', 'Outros custos', 'R$', 1, null]] : [];
      const log = logLines.map(([f, lb, un, p, pk]) => ({ f, lb, un, qtd: L[f], auto: auto[f], over: typeof ov[f] === 'number', p, pk, tot: num(L[f]) * num(p) }));
      // ART: uma por serviço; no contrato, uma só para o contrato inteiro (fora do custo por visita)
      const artLine = log.find((x) => x.f === 'art_qtd'); const artCusto = s.blocos.contrato && artLine ? artLine.tot : 0;
      const logTot = log.reduce((t, x) => t + x.tot, 0) - artCusto;
      const custoServ = mo + logTot;
      const pecas = (s.blocos.pecas ? s.pecas : []).map((p) => {
        const cambio = p.moeda === 'USD' ? num(p.cambio ?? mk.cambio_usd) : p.moeda === 'EUR' ? num(p.cambio ?? mk.cambio_eur) : 1;
        const fimp = p.moeda && p.moeda !== 'BRL' ? num(p.fimp ?? mk.fimp) : 1;
        const unitBRL = num(p.unit) * cambio * fimp * (1 + num(p.ipi));
        const custo = num(p.qtd) * unitBRL; const fator = num(p.fator ?? mk.fator_pecas);
        return Object.assign({}, p, { unitBRL, custo, fator, venda: p.incluso === false ? 0 : custo * fator, custoConta: p.incluso === false ? 0 : custo });
      });
      const custoPecas = pecas.reduce((t, x) => t + x.custoConta, 0); const Vp = pecas.reduce((t, x) => t + x.venda, 0);
      const mult = num(s.mk && s.mk.mult != null ? s.mk.mult : mk.mult);
      const Vs = custoServ * mult;
      const comuns = num(mk.fin) + num(mk.com_rep) + num(mk.com_capt) + num(mk.com_orc) + (s.aprazo ? num(mk.prazo) : 0);
      const tS = num(mk.pis) + num(mk.cofins) + num(mk.irpj) + num(mk.iss) + comuns;
      const icms = icmsPecas(s); const tP = icms + num(mk.pis) + num(mk.cofins) + num(mk.irpj_pecas) + comuns;
      const V = Vs + Vp; const dS = Vs * tS, dP = Vp * tP; const custo = custoServ + custoPecas;
      const lucro = V - dS - dP - custo; const lucroPct = V ? lucro / V : 0;
      const Pnet = Vp * (1 - tP) - custoPecas; const den = 1 - tS - mk.lucro_min;
      const multMin = custoServ > 0 && den > 0 ? Math.max(0, (custoServ - Pnet + mk.lucro_min * Vp) / den) / custoServ : null;
      const ded = [['PIS', mk.pis, V * mk.pis], ['COFINS', mk.cofins, V * mk.cofins], ['IRPJ / CSLL (serviço)', mk.irpj, Vs * mk.irpj], ['ISS (serviço)', mk.iss, Vs * mk.iss], ['IRPJ / CSLL (peças)', mk.irpj_pecas, Vp * mk.irpj_pecas], ['ICMS (peças, ' + (s.uf || 'SC') + ')', icms, Vp * icms],
        ['Custo financeiro', mk.fin, V * mk.fin], ['Comissão representante', mk.com_rep, V * mk.com_rep], ['Comissão captador', mk.com_capt, V * mk.com_capt], ['Comissão orçamento', mk.com_orc, V * mk.com_orc], ['Pagamento a prazo', s.aprazo ? mk.prazo : 0, s.aprazo ? V * mk.prazo : 0]].filter((x) => x[2]);
      let ct = null;
      if (s.blocos.contrato) {
        const nV = num(s.contrato.visitas) * num(s.contrato.meses) / 12; const artV = artCusto * mult; const total = V * nV + artV;
        const lucroCt = lucro * nV + artV * (1 - tS) - artCusto;
        ct = { porVisita: V, nV, artCusto, artV, total, anual: num(s.contrato.meses) ? total / num(s.contrato.meses) * 12 : 0, mensal: num(s.contrato.meses) ? total / num(s.contrato.meses) : 0, lucro: lucroCt, lucroPct: total ? lucroCt / total : 0 };
      }
      return { mk, pessoas, dias, mo, aereo, log, logTot, custoServ, pecas, custoPecas, Vs, Vp, V, dS, dP, custo, lucro: ct ? ct.lucro : lucro, lucroPct: ct ? ct.lucroPct : lucroPct, lucroVisita: lucro, multMin, mult, ded, icms, ct, total: ct ? ct.total : V };
    }

    // fotografia para margens e fechamento: um item para o serviço e outro para as peças
    function snapshot(s) {
      const r = calc(s); const mk = r.mk; const ti = tipoInfo(s.tipo); const nV = r.ct ? r.ct.nV : 1;
      const tx = num(mk.pis) + num(mk.cofins); const comPct = num(mk.com_rep) + num(mk.com_capt) + num(mk.com_orc) + num(mk.fin) + (s.aprazo ? num(mk.prazo) : 0);
      const item = (k, nome, venda, custo, impPct, linhas) => { const impostos = venda * impPct, comissao = venda * comPct, margem = venda - impostos - comissao - custo;
        return { n: k, nome, familia: s.tipo, familiaNome: ti.nome, qtd: 1, venda, custo, impostos, comissao, margem, margemPct: venda ? margem / venda : 0, impostosPct: impPct, comissaoPct: comPct, linhas }; };
      const itens = [];
      if (s.blocos.equipe && (r.custoServ || (r.ct && r.ct.artCusto))) {
        const linhas = s.equipe.filter((e) => num(e.dias) > 0).map((e, i) => ({ k: 'eq' + i, grupo: 'EQUIPE', rot: e.tec, desc: e.tec + ' — diárias', qtd: num(e.dias) * nV, unit: num(e.diaria), custo: num(e.diaria) * num(e.dias) * nV }))
          .concat(r.log.filter((x) => x.tot).map((x) => { const once = r.ct && x.f === 'art_qtd'; return { k: x.f, grupo: 'DESLOCAMENTO', rot: x.lb, desc: x.lb, qtd: num(x.qtd) * (once ? 1 : nV), unit: num(x.p), custo: x.tot * (once ? 1 : nV) }; }));
        const venda = r.Vs * nV + (r.ct ? r.ct.artV : 0); const custo = r.custoServ * nV + (r.ct ? r.ct.artCusto : 0);
        itens.push(item('servico', ((TIPO_INI[s.tipo] || {}).titulo || ti.nome) + (r.ct ? ' — contrato' : ''), venda, custo, tx + num(mk.irpj) + num(mk.iss), linhas));
      }
      if (s.blocos.pecas && r.Vp) {
        const linhas = r.pecas.filter((p) => p.incluso !== false).map((p, i) => ({ k: 'pc' + i, grupo: 'PEÇAS', rot: p.forn || '', desc: p.desc, cod: p.cod || '', qtd: num(p.qtd) * nV, unit: p.unitBRL, custo: p.custo * nV }));
        itens.push(item('pecas', 'Peças e materiais', r.Vp * nV, r.custoPecas * nV, tx + num(mk.irpj_pecas) + r.icms, linhas));
      }
      const sum = (k) => itens.reduce((t, x) => t + x[k], 0); const venda = sum('venda'), margem = sum('margem');
      return { div: 'SPV', tipo: s.tipo, venda, vendaIpi: venda, custo: sum('custo'), impostos: sum('impostos'), comissao: sum('comissao'), margem, margemPct: venda ? margem / venda : 0, minimo: mk.lucro_min, itens };
    }

    // ---------- leitura com Claude ----------
    let sampleFn;
    const getSample = async () => { if (sampleFn !== undefined) return sampleFn; try { sampleFn = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { sampleFn = null; } return sampleFn; };
    async function pdfText(file) {
      await load(CDN.pdfworker); await load(CDN.pdfjs); const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = CDN.pdfworker;
      const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; let text = ''; const pages = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map((x) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; pages.push(pg); }
      return { text: text.trim(), pages };
    }
    async function pageImage(pg) { const vp = pg.getViewport({ scale: 1.6 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return new Promise((r) => c.toBlob(r, 'image/png')); }
    const PROMPT = `Você lê documentos de compra da LS Fire (empresa que compra peças e serviços): orçamentos de fornecedor, pedidos e notas fiscais.
Extraia os dados e responda SÓ com um objeto JSON neste formato:
{"fornecedor": string, "documento": string (número do orçamento/pedido/nota), "data": "AAAA-MM-DD" ou null, "tipo": "orcamento"|"nota"|"pedido"|"outro", "moeda": "BRL"|"USD"|"EUR", "condicao_pagamento": string ou null, "validade": string ou null, "frete": número ou null, "total": número ou null,
 "itens": [{"codigo": string ou null, "descricao": string, "ncm": string ou null, "unidade": string ou null, "quantidade": número, "valor_unitario": número (sem IPI), "ipi_percentual": número (ex.: 3.25 para 3,25%) ou 0, "icms_percentual": número ou null}]}
Números em JSON (ponto decimal, sem separador de milhar). Não invente: deixe null o que não estiver no documento. Ignore linhas de impostos aproximados ("Trib aprox").`;
    // leitura no navegador primeiro (XML, PDF, planilha, OCR); o Claude só entra se a leitura local não achar itens e ele estiver disponível
    async function lerDocumento(file, onStatus) {
      let local = null;
      try { local = await window.PricerLeitor.ler(file, onStatus); } catch (e) { local = null; }
      if (local && local.itens && local.itens.length) return local;
      const sample = await getSample();
      if (!sample) { if (local) return local; throw { code: 'unavailable' }; }
      try { return await lerComClaude(sample, file, onStatus); } catch (e) { if (local) return local; throw e; }
    }
    async function lerComClaude(sample, file, onStatus) {
      let text = '', images;
      if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        onStatus && onStatus('Lendo o PDF…'); const r = await pdfText(file); text = r.text;
        if (text.replace(/\s/g, '').length < 80) { onStatus && onStatus('PDF escaneado: lendo a imagem…'); images = []; for (const pg of r.pages.slice(0, 2)) images.push(await pageImage(pg)); }
      } else if (/^image\//.test(file.type)) images = [file];
      else text = await file.text();
      if (images && images.length) {
        const caps = await sample.limits().catch(() => null);
        if (!caps || !caps.images) throw { code: 'images_unavailable' };
        images = images.filter((b) => b && b.size <= caps.images.maxInputBytes).slice(0, caps.images.maxCount);
        if (!images.length) throw { code: 'image_rejected' };
      }
      onStatus && onStatus('Lendo o documento com Claude…');
      const input = PROMPT + (text ? '\n\nTEXTO DO DOCUMENTO:\n' + text.slice(0, 28000) : '\n\nO documento está nas imagens anexas.');
      return sample.json(input, images && images.length ? { images } : {});
    }

    // ---------- documentos: banco da equipe (db + assets) ou navegador ----------
    let docs = []; let docSub = false; let assetsNs;
    const LSK = 'lspricer.docs.v1';
    const lsGet = () => { try { return JSON.parse(localStorage.getItem(LSK) || '[]'); } catch (e) { return []; } };
    const lsSet = (v) => { try { localStorage.setItem(LSK, JSON.stringify(v)); return true; } catch (e) { return false; } };
    function idb() { return new Promise((res, rej) => { const r = indexedDB.open('lspricer-docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
    async function idbPut(k, blob) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('files', 'readwrite'); t.objectStore('files').put(blob, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
    async function idbGet(k) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('files'); const q = t.objectStore('files').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    // assina os documentos do banco da equipe assim que ele conecta (antes disso, usa o navegador)
    function ensureDocs() {
      const m = REG.mode === 'shared' && REG.db ? 'shared' : 'local';
      if (docSub === m || docSub === 'shared') return; docSub = m;
      if (m === 'shared') {
        REG.db.collection('documentos').orderBy('at', 'desc').limit(500).onSnapshot((s) => { docs = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); ctx.render(); }, () => {});
        window.claude.use('assets').then((a) => { assetsNs = a; ctx.render(); }).catch(() => { assetsNs = null; });
      } else { docs = lsGet(); assetsNs = null; }
    }
    const shared = () => REG.mode === 'shared' && !!REG.db;
    const canUpload = () => !shared() || !!assetsNs;
    async function salvarDoc(meta, file) {
      const id = meta.id || ('d' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
      const rec = Object.assign({}, meta, { at: meta.at || new Date().toISOString() }); delete rec.id;
      if (file) { rec.nome = rec.nome || file.name; rec.contentType = file.type || 'application/octet-stream'; rec.size = file.size; }
      if (shared()) {
        if (file) { if (!assetsNs) throw new Error('Só quem tem acesso de Editor pode anexar arquivos. Peça acesso a quem publicou o app.'); const up = await assetsNs.upload(file, /pdf$/i.test(file.name) && !file.type ? { type: 'application/pdf' } : undefined); rec.assetId = up.id; }
        if (REG.me) rec.by = REG.me;
        await REG.db.doc('documentos/' + id).set(JSON.parse(JSON.stringify(rec)));
      } else {
        if (file) { await idbPut(id, file); rec.local = true; }
        docs = [Object.assign({ id }, rec)].concat(docs.filter((d) => d.id !== id)); lsSet(docs);
      }
      ctx.log && ctx.log({ tipo: meta.id ? 'Documento alterado' : 'Documento anexado', ref: id, desc: [rec.nome, rec.fornecedor, rec.numero && 'nº ' + rec.numero].filter(Boolean).join(' · '), mudancas: [{ campo: 'Proposta', de: null, para: rec.propNome || null }, { campo: 'Itens do cadastro', de: null, para: (rec.insumos || []).join(', ') || null }] });
      ctx.render(); return id;
    }
    async function excluirDoc(d) {
      if (shared()) { await REG.db.doc('documentos/' + d.id).delete(); if (d.assetId && assetsNs) await assetsNs.delete(d.assetId).catch(() => {}); }
      else { docs = docs.filter((x) => x.id !== d.id); lsSet(docs); }
      ctx.log && ctx.log({ tipo: 'Documento excluído', ref: d.id, desc: [d.nome, d.fornecedor].filter(Boolean).join(' · '), mudancas: [] });
      ctx.render();
    }
    async function abrirDoc(d, baixar) {
      let blob;
      try { if (d.assetId) blob = await (await fetch('/_blob/' + d.assetId)).blob(); else blob = await idbGet(d.id); } catch (e) { blob = null; }
      if (!blob) return toast('Não encontrei o arquivo deste documento.');
      if (!baixar) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); return; }
      const ok = await REG.save(d.nome || 'documento', blob, blob.type); if (!ok) toast('Download cancelado');
    }
    const docsDaProposta = (u) => docs.filter((d) => d.propUid && d.propUid === u);

    // ---------- histórico de preços (documentos + SPV salvos) ----------
    function pricebook() {
      const m = new Map(); const add = (desc, x) => { const k = norm(desc); if (!k || !(x.unit > 0)) return; const arr = m.get(k) || []; arr.push(Object.assign({ desc }, x)); m.set(k, arr); };
      for (const d of docs) for (const it of d.itens || []) add(it.descricao, { unit: num(it.valor_unitario), moeda: d.moeda || 'BRL', forn: d.fornecedor, data: d.data || (d.at || '').slice(0, 10), cod: it.codigo, ipi: num(it.ipi_percentual) / 100, src: 'doc' });
      for (const p of REG.listPropostas() || []) if (p.div === 'SPV' && p.spv) for (const x of p.spv.pecas || []) add(x.desc, { unit: num(x.unit), moeda: x.moeda || 'BRL', forn: x.forn, data: (p.at || '').slice(0, 10), cod: x.cod, ipi: num(x.ipi), src: 'prop' });
      for (const i of (ctx.insumos ? ctx.insumos() : [])) if (typeof i.valor === 'number') add(i.produto, { unit: i.valor, moeda: 'BRL', forn: i.fab || 'cadastro', data: (i.upd || '').slice(0, 10), cod: i.id, ipi: 0, src: 'cad' });
      for (const arr of m.values()) arr.sort((a, b) => String(b.data).localeCompare(String(a.data)));
      return m;
    }

    // ---------- página inicial ----------
    const divOf = (p) => p.div || 'SEQ';
    function stats(list) {
      const aberto = list.filter((p) => ['enviada', 'negociacao'].includes(p.status));
      const d90 = Date.now() - 90 * 864e5; const fech = list.filter((p) => ['ganha', 'perdida'].includes(p.status) && Date.parse(p.at) > d90);
      return { aberto: aberto.reduce((t, p) => t + num(p.total), 0), nAberto: aberto.length, ganhas: fech.filter((p) => p.status === 'ganha').length, fechadas: fech.length };
    }
    function vHome() {
      ensureDocs();
      const ui = ctx.ui; const all = REG.listPropostas() || []; const q = norm(ui.homeQ || ''); const f = ui.homeDiv || 'todas';
      const hay = (p) => norm([p.numero, p.cliente, p.name, p.status, divOf(p), p.tipo, p.spv && (p.spv.descricao + ' ' + p.spv.local + ' ' + (p.spv.pecas || []).map((x) => x.desc + ' ' + (x.forn || '')).join(' '))].join(' '));
      const pend = { pend_fin: 'financeiro', pend_eng: 'engenharia', pend_real: 'real' };
      const sit = (p) => (ctx.situacao ? ctx.situacao(p) : [(STATUS.find((y) => y[0] === (p.status || 'rascunho')) || STATUS[0])[1], 'mute']);
      const porSit = { abertas: (p) => ['Rascunho', 'Enviada ao cliente', 'Aguardando aprovação', 'Desconto reprovado'].includes(sit(p)[0]), aprovacao: (p) => sit(p)[0] === 'Aguardando aprovação', fechadas: (p) => ['Fechada', 'Encerrada'].includes(sit(p)[0]), perdidas: (p) => sit(p)[0] === 'Perdida' };
      const list = all.filter((p) => (f === 'todas' || divOf(p) === f || (porSit[f] && porSit[f](p)) || (pend[f] && ctx.etapaPendente && ctx.etapaPendente(p, pend[f]))) && (!q || hay(p).includes(q)));
      const sx = stats(all); const docsHit = q ? docs.filter((d) => norm([d.nome, d.fornecedor, d.numero, (d.itens || []).map((i) => i.descricao).join(' ')].join(' ')).includes(q)).slice(0, 6) : [];
      const rows = list.slice(0, 60).map((p) => `<tr class="click" data-hopen="${esc(p.id)}">
        <td><span class="divb ${divOf(p).toLowerCase()}">${divOf(p)}</span>${p.tipo ? ` <small class="sub">${esc(p.tipo)}</small>` : ''}</td>
        <td><b>${esc(p.numero || '—')}</b><br><small class="sub">${esc(p.cliente || p.name || '')}</small></td>
        <td class="n">${typeof p.total === 'number' ? brl(p.total) : '—'}</td>
        <td><span class="pill ${sit(p)[1]}">${esc(sit(p)[0])}</span></td>
        <td class="sub">${esc(new Date(p.at).toLocaleDateString('pt-BR'))}</td>
        <td class="hacts">${(() => { const nx = ctx.proximo && ctx.proximo(p); return nx ? `<button class="btn sm pri" data-hnext="${esc(p.id)}|${nx.act}">${esc(nx.lb)}</button> ` : ''; })()}<button class="btn sm" data-hopen="${esc(p.id)}">Abrir</button> <button class="btn sm" data-hdup="${esc(p.id)}">Duplicar</button>${sit(p)[0] === 'Perdida' || ['Fechada', 'Encerrada'].includes(sit(p)[0]) ? '' : ` <button class="restore" data-hperdida="${esc(p.id)}" title="Marcar como perdida, com o motivo">perdida</button>`}</td></tr>${ctx.etapasHtml ? `<tr class="etrow"><td colspan="6">${ctx.etapasHtml(p)}</td></tr>` : ''}`).join('');
      const chips = [['todas', 'Todas'], ['SEQ', 'SEQ'], ['SPV', 'SPV'], ['abertas', 'Em aberto'], ['aprovacao', 'Aguardando aprovação'], ['fechadas', 'Fechadas'], ['pend_fin', 'Falta avisar financeiro'], ['pend_eng', 'Falta avisar engenharia'], ['pend_real', 'Falta custo real'], ['perdidas', 'Perdidas']].map(([k, lb]) => `<button class="hchip${f === k ? ' on' : ''}" data-hdiv="${k}">${lb}</button>`).join('');
      const tipos = spvTipos().map((t) => `<button class="tchip" data-spvnew="${t.abrev}" title="${esc(t.desc)}"><b>${esc((TIPO_INI[t.abrev] || {}).titulo || t.nome)}</b><small>${esc(t.abrev)}</small></button>`).join('');
      return `<div class="stack home">
        <div class="hero"><div><h1>Formação de preço</h1><div class="sub">Busque uma proposta antiga ou comece uma nova.</div></div>
          <div class="hsearch"><input id="homeQ" type="search" placeholder="Buscar por cliente, número, peça, fornecedor…" value="${esc(ui.homeQ || '')}" aria-label="Buscar propostas e documentos" autocomplete="off"></div></div>
        ${(() => { const c = ctx.current && ctx.current(); return c ? `<div class="contcard"><div><span class="divb ${c.div.toLowerCase()}">${c.div}</span> <b>Continuar: ${esc(c.label)}</b>${typeof c.total === 'number' && c.total ? ` <span class="sub">· ${brl(c.total)}</span>` : ''}</div><button class="btn sm pri" data-view="proposta">Continuar editando →</button></div>` : ''; })()}
        ${ctx.home ? ctx.home() : ''}
        <div class="starts">
          <div class="start seq"><span class="tag">SEQ</span><b>Soluções e equipamentos</b><small>Escolha o que vai formar</small><div class="tchips">
            ${(ctx.famsHome ? ctx.famsHome() : []).map((f) => { const [sg, ...rest] = f.lb.split(' · '); return `<button class="tchip" data-seqfam="${esc(f.fam)}" title="${esc(f.titulo || f.lb)}"><b>${esc(rest.join(' · ') || f.lb)}</b><small>${esc(rest.length ? sg : '')}</small></button>`; }).join('')}
            <button class="tchip" data-seqnew><b>Em branco</b><small>escolher depois</small></button>
            <button class="tchip" data-factsnew title="Fully Automatic Churn Testing System — MECON, FM 1330"><b>FACTS</b><small>FAC</small></button></div></div>
          <div class="start spv"><span class="tag">SPV</span><b>Serviços e pós-venda</b><small>Escolha o tipo para começar</small><div class="tchips">${tipos}</div></div>
        </div>
        <div class="kpis">
          <div class="kpi"><span>Em aberto</span><b>${brl(sx.aberto)}</b><em>${sx.nAberto} proposta(s) enviadas ou em negociação</em></div>
          <div class="kpi"><span>Ganhas em 90 dias</span><b>${sx.ganhas} de ${sx.fechadas}</b><em>${sx.fechadas ? pct(sx.ganhas / sx.fechadas, 0) + ' de conversão' : 'marque o status nas propostas'}</em></div>
          <div class="kpi"><span>Propostas salvas</span><b>${all.length}</b><em>${all.filter((p) => divOf(p) === 'SPV').length} SPV · ${all.filter((p) => divOf(p) === 'SEQ').length} SEQ</em></div>
          <div class="kpi"><span>Documentos</span><b>${docs.length}</b><em><button class="restore" data-view="documentos">abrir a biblioteca</button></em></div>
        </div>
        <section class="card"><h2>Propostas <span class="sub">${list.length} encontrada(s)</span></h2><div class="hchips">${chips}</div>
          <div class="tw" style="margin-top:10px"><table class="t"><thead><tr><th>Divisão</th><th>Número / cliente</th><th>Total</th><th>Situação</th><th>Data</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="sub">${all.length ? 'Nada encontrado com essa busca.' : 'Nenhuma proposta salva ainda. Comece uma nova acima e clique em Salvar.'}</td></tr>`}</tbody></table></div></section>
        ${docsHit.length ? `<section class="card"><h2>Documentos encontrados</h2>${docList(docsHit)}</section>` : ''}
      </div>`;
    }

    // ---------- editor SPV ----------
    const fmt = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? NF[d].format(v) : '');
    const inp = (path, v, kind = 'num', opt = {}) => {
      const shown = kind === 'pct' ? (typeof v === 'number' ? NF[2].format(v * 100).replace(/,00$/, '') : '') : kind === 'num' ? (typeof v === 'number' ? String(+v.toFixed(6)).replace('.', ',') : '') : (v ?? '');
      return `<input data-sp="${path}" data-k="${kind}" value="${esc(shown)}"${kind === 'text' ? '' : ' inputmode="decimal"'}${opt.ph ? ` placeholder="${esc(opt.ph)}"` : ''}${opt.list ? ` list="${opt.list}"` : ''}${opt.cls ? ` class="${opt.cls}"` : ''} aria-label="${esc(opt.lb || path)}">`;
    };
    const sel = (path, v, opts, lb) => `<select data-sp="${path}" data-k="text" aria-label="${esc(lb || path)}">${opts.map((o) => { const [k, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}"${String(v) === String(k) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
    const fld = (lb, html, cls = '') => `<div class="f ${cls}"><label>${esc(lb)}</label><div class="ctl">${html}</div></div>`;
    function vSpv() {
      ensureDocs();
      const s = S(); const c = cfg(); const r = calc(s); const ti = tipoInfo(s.tipo); const pb = pricebook(); const ui = ctx.ui;
      const below = r.V > 0 && r.lucroPct < r.mk.lucro_min - 1e-6;
      const tecOpts = c.tecnicos.map((t) => [t.nome, `${t.nome} — ${t.funcao} (${brl(t.diaria)})`]);
      const eqRows = s.equipe.map((e, i) => `<tr><td class="in">${sel(`equipe.${i}.tec`, e.tec, [['', 'Escolha…']].concat(tecOpts).concat(e.tec && !c.tecnicos.some((t) => t.nome === e.tec) ? [[e.tec, e.tec]] : []), 'Técnico')}</td>
        <td class="in">${inp(`equipe.${i}.diaria`, e.diaria, 'num', { lb: 'Diária' })}</td><td class="in">${inp(`equipe.${i}.dias`, e.dias, 'num', { lb: 'Dias' })}</td><td class="n">${brl(num(e.diaria) * num(e.dias))}</td><td><button class="restore" data-sprm="equipe.${i}">remover</button></td></tr>`).join('');
      const logRows = r.log.map((x) => `<tr><td>${esc(x.lb)}</td><td class="in ${x.over ? 'over' : 'auto'}">${inp(`ov.${x.f}`, x.qtd, 'num', { lb: x.lb })}</td><td class="sub">${esc(x.un)}${x.over ? ` <button class="restore" data-spauto="${x.f}">↺ auto (${fmt(x.auto, 0)})</button>` : ''}</td>
        <td class="n sub">${x.pk ? brl(x.p) + (x.pk === 'rkm' ? '/km' : '') : ''}</td><td class="n">${brl(x.tot)}</td></tr>`).join('');
      const pc = precosCad(); const precoMudou = s.precos && PRECO_KEYS.some((x) => Math.abs(num(s.precos[x]) - pc[x]) > 1e-9);
      const mods = modelosDe(s.tipo);
      const pRows = r.pecas.map((p, i) => { const hist = pb.get(norm(p.desc)); const last = hist && hist.find((h) => Math.abs(h.unit - num(p.unit)) > 1e-9);
        return `<tr${p.incluso === false ? ' class="ro"' : ''}><td class="in"><input type="checkbox" data-sp="pecas.${i}.incluso" data-k="bool"${p.incluso === false ? '' : ' checked'} aria-label="Incluso"></td>
        <td class="in wide">${inp(`pecas.${i}.desc`, p.desc, 'text', { lb: 'Descrição', list: 'dl_pb' })}${p.cod || p.forn ? `<small class="sub">${esc([p.cod, p.forn].filter(Boolean).join(' · '))}${p.docId ? ' · 📎' : ''}</small>` : ''}${last ? `<small class="hist">outra cotação: ${esc(last.moeda !== 'BRL' ? last.moeda + ' ' + fmt(last.unit) : brl(last.unit))} · ${esc(last.forn || '')} · ${esc(last.data ? new Date(last.data).toLocaleDateString('pt-BR') : '')}</small>` : ''}</td>
        <td class="in">${inp(`pecas.${i}.qtd`, p.qtd, 'num', { lb: 'Qtd' })}</td><td class="in">${sel(`pecas.${i}.moeda`, p.moeda || 'BRL', ['BRL', 'USD', 'EUR'], 'Moeda')}</td>
        <td class="in">${inp(`pecas.${i}.unit`, p.unit, 'num', { lb: 'Valor unitário' })}${!num(p.unit) && p.desc ? `<button class="restore" data-pedir="${esc(JSON.stringify({ produto: String(p.desc).toUpperCase(), fab: p.forn || '', origem: p.moeda && p.moeda !== 'BRL' ? 'IMP' : 'NAC', linha: { rotulo: 'peça da SPV' } }))}">pedir cadastro</button>` : ''}</td><td class="in">${inp(`pecas.${i}.ipi`, p.ipi || 0, 'pct', { lb: 'IPI' })}</td>
        <td class="n">${brl(p.unitBRL)}${p.moeda && p.moeda !== 'BRL' ? `<small class="sub">câmbio ${fmt(p.cambio ?? r.mk['cambio_' + p.moeda.toLowerCase()])} × imp. ${fmt(p.fimp ?? r.mk.fimp)}</small>` : ''}</td>
        <td class="in">${inp(`pecas.${i}.fator`, p.fator, 'num', { lb: 'Fator' })}</td><td class="n"><b>${brl(p.venda)}</b></td><td><button class="restore" data-sprm="pecas.${i}">remover</button></td></tr>`; }).join('');
      const dl = `<datalist id="dl_pb">${[...pb.values()].map((a) => `<option value="${esc(a[0].desc)}"></option>`).join('')}</datalist>`;
      const ded = r.ded.map(([lb, t, v]) => `<div>${esc(lb)} <small class="sub">${pct(t, 2)}</small></div><div>− ${brl(v)}</div>`).join('');
      const pdocs = docsDaProposta(st().uid);
      const blk = (k, lb) => `<label class="chip"><input type="checkbox" data-spblk="${k}"${s.blocos[k] ? ' checked' : ''}> ${lb}</label>`;
      return `<div class="stack">
        <div class="flowhead"><div style="min-width:0"><button class="btn sm" data-view="inicio">← Início</button><h1 style="margin-top:8px"><span class="divb spv">SPV</span> ${esc((TIPO_INI[s.tipo] || {}).titulo || ti.nome)} ${s.numero ? '· ' + esc(s.numero) : ''}</h1><div class="sub">${esc(ti.nome)} · ${esc(s.cliente || 'cliente a definir')}</div></div>
          <div class="sumbar"><div><span>Preço${r.ct ? ' do contrato' : ''}</span><b>${brl(r.total)}</b></div>${r.ct ? `<div><span>Mensal</span><b>${brl(r.ct.mensal)}</b></div>` : ''}<div><span>Lucro líquido</span><b class="${below ? 'bad-t' : ''}">${pct(r.lucroPct, 1)}</b></div><div>${below ? '<span class="pill bad">abaixo de ' + pct(r.mk.lucro_min, 0) + '</span>' : r.V ? '<span class="pill ok">dentro da meta</span>' : ''}</div></div></div>
        ${below && r.multMin ? `<div class="banner bad">Lucro líquido de ${pct(r.lucroPct, 1)}, abaixo do mínimo de ${pct(r.mk.lucro_min, 0)}. Para chegar lá, o multiplicador do serviço precisa ser ${fmt(r.multMin, 2)}. <button class="restore" data-spfix>aplicar ${fmt(Math.ceil(r.multMin * 100) / 100, 2)}</button> ou peça aprovação abaixo.</div>` : ''}
        <div class="aprovbox">${ctx.aprovHtml ? ctx.aprovHtml().replace(/^<br>/, '') : ''}<button class="btn sm${below ? ' pri' : ''}" data-alaprov>Pedir aprovação (valor target)</button></div>
        <section class="card"><h2>Modelo <span class="sub">${mods.length ? 'escopo, equipe e frequência prontos; depois é só ajustar' : 'nenhum modelo cadastrado para este tipo'}</span></h2>
          <div class="mchips">${mods.map((m) => `<button class="mchip${s.modelo === m.id ? ' on' : ''}" data-spmod="${esc(m.id)}"><b>${esc(m.nome)}</b>${m.equipe && m.equipe.length ? `<small>${esc(m.equipe.map((e) => e.tec + ' × ' + e.dias + 'd').join(' + '))}${m.pecas && m.pecas.length ? ' · ' + m.pecas.length + ' peça(s)' : ''}</small>` : ''}</button>`).join('')}</div>
          <div class="docbar" style="margin-top:10px">${REG.areaOk('servicos') ? '<button class="btn sm" data-spsavemod>Salvar esta proposta como modelo</button>' : ''}<button class="restore" data-spcfg="modelos">ver todos os modelos</button></div></section>
        <section class="card"><h2>Cliente e escopo</h2>
          <div class="fields">${fld('Cliente', inp('cliente', s.cliente, 'text', { lb: 'Cliente' }), 'span2')}${fld('Contato', inp('contato', s.contato, 'text'))}${fld('Nº da proposta', inp('numero', s.numero, 'text', { ph: 'ex.: 10.250' }))}
            ${fld('Local do serviço', inp('local', s.local, 'text', { ph: 'cidade / obra' }), 'span2')}${fld('UF', inp('uf', s.uf, 'text'))}${fld('Vendedor', inp('vendedor', s.vendedor, 'text'))}
            ${fld('Tipo', sel('tipo', s.tipo, spvTipos().map((t) => [t.abrev, t.abrev + ' — ' + t.nome])), 'span2')}${fld('Pagamento', inp('pagamento', s.pagamento, 'text'))}${fld('Validade (dias)', inp('validade', s.validade, 'num'))}
            ${fld('Escopo do serviço (vai na proposta)', `<textarea data-sp="descricao" data-k="text" rows="${Math.min(10, Math.max(3, String(s.descricao || '').split('\n').length + 1))}" placeholder="Ex.: pré-montagem e manutenção de 2 bombas verticais turbina com motor diesel…">${esc(s.descricao)}</textarea>`, 'spanall')}
            ${fld('Não incluso', `<textarea data-sp="exclusoes" data-k="text" rows="2">${esc(s.exclusoes)}</textarea>`, 'spanall')}${fld('Prazo de execução', inp('prazo_exec', s.prazo_exec, 'text', { ph: 'ex.: 2 dias em campo' }), 'span2')}</div>
          <div class="docbar" style="margin-top:10px"><span class="sub">Blocos:</span>${blk('equipe', 'Equipe e deslocamento')}${blk('pecas', 'Peças e materiais')}${blk('contrato', 'Contrato recorrente')}</div></section>
        ${s.blocos.equipe ? `<section class="card"><h2>Equipe e deslocamento <span class="sub">mão de obra ${brl(r.mo)} · deslocamento ${brl(r.logTot)}</span></h2>
          <div class="tw"><table class="t reg"><thead><tr><th>Técnico</th><th>Diária (R$)</th><th>Dias</th><th>Total</th><th></th></tr></thead><tbody>${eqRows}</tbody></table></div>
          <div class="docbar" style="margin-top:8px"><span class="sub">Toque para incluir ou tirar:</span>${c.tecnicos.slice(0, 12).map((t) => { const on = s.equipe.some((e) => e.tec === t.nome); return `<label class="chip"><input type="checkbox" data-sptec="${esc(t.nome)}"${on ? ' checked' : ''}> ${esc(t.nome)}</label>`; }).join('')}<button class="btn sm" data-spadd="equipe">+ Outro</button></div>
          <div class="fields" style="margin-top:14px">${fld('Distância até o local (só ida, km)', inp('dist', s.dist, 'num', { lb: 'Distância' }))}<div class="f span2"><label>&nbsp;</label><div class="sub">${r.aereo ? `Ida e volta passa de ${fmt(c.custos.limite_km, 0)} km: vai de avião, com carro locado no destino.` : `Saída: ${esc(c.custos.saida)}. Acima de ${fmt(c.custos.limite_km, 0)} km ida e volta, o app troca para avião.`} Hotel e alimentação seguem a equipe (${r.pessoas} pessoa(s), ${r.dias} dia(s)).</div></div></div>
          <div class="tw" style="margin-top:10px"><table class="t reg"><thead><tr><th>Custo</th><th>Quantidade</th><th></th><th>Preço (cadastro)</th><th>Total</th></tr></thead><tbody>${logRows}<tr class="tot"><td colspan="4">Custo da prestação do serviço</td><td class="n">${brl(r.custoServ)}</td></tr></tbody></table></div>
          <p class="sub" style="margin:8px 0 0">Os preços de km, passagem, carro, hotel, alimentação e ART são cadastrados em <button class="restore" data-spcfg>Cadastro → Serviços</button>. A proposta guarda os preços do dia em que foi criada.</p>
          ${precoMudou ? `<div class="banner warn">Os preços de deslocamento mudaram no cadastro depois que esta proposta foi criada. <button class="restore" data-spprecos>Usar os preços atuais</button></div>` : ''}</section>` : ''}
        ${s.blocos.pecas ? `<section class="card"><h2>Peças e materiais <span class="sub">custo ${brl(r.custoPecas)} · venda ${brl(r.Vp)}</span></h2>
          <div class="tw"><table class="t reg pecas"><thead><tr><th>Incl.</th><th>Descrição</th><th>Qtd</th><th>Moeda</th><th>Unit.</th><th>IPI</th><th>Custo unit. R$</th><th>Fator</th><th>Venda</th><th></th></tr></thead><tbody>${pRows || '<tr><td colspan="10" class="sub">Nenhuma peça. Adicione à mão ou importe um orçamento de fornecedor.</td></tr>'}</tbody></table></div>
          <div class="docbar" style="margin-top:8px"><button class="btn sm" data-spadd="pecas">+ Peça</button><label class="btn sm pri" for="spImport">📎 Importar orçamento (PDF, XML, Excel ou foto)</label><input type="file" id="spImport" accept="application/pdf,image/*,.xml,.xlsx,.csv" hidden><span class="sub">Claude lê o documento e traz fornecedor, itens e preços.</span></div>${dl}</section>` : ''}
        ${s.blocos.contrato ? `<section class="card"><h2>Contrato recorrente <span class="sub">o preço acima vale por visita</span></h2>
          <div class="hchips" style="margin-bottom:10px">${FREQ.map(([v, lb]) => `<button class="hchip${num(s.contrato.visitas) === v ? ' on' : ''}" data-spvis="${v}">${lb} · ${v}×/ano</button>`).join('')}</div>
          <div class="fields">${fld('Visitas por ano', inp('contrato.visitas', s.contrato.visitas))}${fld('Duração (meses)', inp('contrato.meses', s.contrato.meses))}${fld('Reajuste', inp('contrato.reajuste', s.contrato.reajuste, 'text'))}</div>
          <div class="kpis" style="margin-top:12px"><div class="kpi"><span>Por visita</span><b>${brl(r.ct.porVisita)}</b><em>${fmt(r.ct.nV, 0)} visitas no contrato</em></div>${r.ct.artV ? `<div class="kpi"><span>ART (uma vez)</span><b>${brl(r.ct.artV)}</b><em>custo ${brl(r.ct.artCusto)}</em></div>` : ''}<div class="kpi lead"><span>Mensalidade</span><b>${brl(r.ct.mensal)}</b></div><div class="kpi"><span>Total do contrato</span><b>${brl(r.ct.total)}</b></div></div></section>` : ''}
        <section class="card"><h2>Formação do preço</h2>
          <div class="split2">
            <div class="kv">
              <div>Custo da prestação do serviço</div><div>${brl(r.custoServ)}</div>
              <div>Multiplicador do serviço <small class="sub">(${fmt(r.mult, 2)} = margem bruta de ${pct(r.mult - 1, 0)})</small></div><div class="in">${inp('mk.mult', r.mult, 'num', { lb: 'Multiplicador', cls: 'mini' })}</div>
              <div><b>Venda do serviço</b></div><div><b>${brl(r.Vs)}</b></div>
              <div>Venda das peças</div><div>${brl(r.Vp)}</div>
              <div class="sep"></div><div hidden></div>
              <div><b>Venda bruta (valor da proposta)</b></div><div><b>${brl(r.V)}</b></div>
              ${ded}
              <div>Custos (serviço + peças)</div><div>− ${brl(r.custo)}</div>
              <div class="sep"></div><div hidden></div>
              <div><b>Lucro líquido${r.ct ? ' por visita' : ''}</b></div><div class="${below && !r.ct ? 'bad-t' : 'ok-t'}"><b>${brl(r.lucroVisita)} · ${pct(r.V ? r.lucroVisita / r.V : 0, 1)}</b></div>
              ${r.ct ? `<div>ART do contrato (uma vez)</div><div>${brl(r.ct.artV)}</div><div class="sep"></div><div hidden></div><div><b>Lucro líquido do contrato</b></div><div class="${below ? 'bad-t' : 'ok-t'}"><b>${brl(r.ct.lucro)} · ${pct(r.ct.lucroPct, 1)}</b></div>` : ''}
            </div>
            <div class="stack">
              <label class="chk"><input type="checkbox" data-sp="aprazo" data-k="bool"${s.aprazo ? ' checked' : ''}> Pagamento a prazo (+${pct(r.mk.prazo, 1)} de encargo)</label>
              <p class="sub" style="margin:0">Impostos vêm de Cadastro → Fiscal; multiplicador, comissões e lucro mínimo, de Cadastro → Precificação. Peças pagam ICMS de ${pct(r.icms, 1)} (${esc(s.uf || 'SC')}) e IRPJ/CSLL de produto; o serviço paga ISS. Meta: lucro líquido de ${pct(r.mk.lucro_min, 0)}.</p>
              <div class="docbar"><button class="btn pri" data-sppdf="interno">Formação de custo (PDF)</button></div>
            </div>
          </div></section>
        <section class="card"><h2>Documentos desta proposta <span class="sub">${pdocs.length}</span></h2>${pdocs.length ? docList(pdocs) : '<p class="sub" style="margin:0">Orçamentos, notas e desenhos ligados a esta proposta aparecem aqui.</p>'}
          <div class="docbar" style="margin-top:10px"><label class="btn sm" for="spAttach">+ Anexar documento</label><input type="file" id="spAttach" hidden></div></section>
      </div>`;
    }
    function docList(list) {
      return `<div class="tw"><table class="t"><thead><tr><th>Documento</th><th>Tipo</th><th>Fornecedor</th><th>Valor</th><th>Ligado a</th><th></th></tr></thead><tbody>${list.map((d) => `<tr>
        <td><b>${esc(d.nome || '—')}</b>${d.numero ? `<br><small class="sub">nº ${esc(d.numero)}${d.data ? ' · ' + esc(new Date(d.data).toLocaleDateString('pt-BR')) : ''}</small>` : ''}${(d.itens || []).length ? ` <span class="pill mute">${d.itens.length} itens</span>` : ''}</td>
        <td>${esc((DOC_TIPOS.find((t) => t[0] === d.tipo) || [0, d.tipo || '—'])[1])}</td><td>${esc(d.fornecedor || '—')}</td><td class="n">${typeof d.total === 'number' ? (d.moeda && d.moeda !== 'BRL' ? d.moeda + ' ' + fmt(d.total) : brl(d.total)) : '—'}</td>
        <td>${esc(d.propNome || '—')}${(d.insumos || []).length ? `<br><small class="sub">${d.insumos.length} item(ns) do cadastro: ${esc(d.insumos.slice(0, 3).join(', '))}${d.insumos.length > 3 ? '…' : ''}</small>` : ''}</td>
        <td style="white-space:nowrap">${d.assetId || d.local ? `<button class="btn sm" data-dopen="${esc(d.id)}">Abrir</button> <button class="btn sm" data-ddown="${esc(d.id)}">Baixar</button>` : ''} <button class="btn sm" data-dedit="${esc(d.id)}">Detalhes</button></td></tr>`).join('')}</tbody></table></div>`;
    }

    // ---------- biblioteca de documentos ----------
    function vDocs() {
      ensureDocs();
      const ui = ctx.ui; const q = norm(ui.docQ || ''); const t = ui.docT || '';
      const list = docs.filter((d) => (!t || d.tipo === t) && (!q || norm([d.nome, d.fornecedor, d.numero, d.propNome, d.notas, (d.insumos || []).join(' '), (d.itens || []).map((i) => i.descricao + ' ' + (i.codigo || '')).join(' ')].join(' ')).includes(q)));
      const up = canUpload();
      return `<div class="stack">
        <div class="flowhead"><div><h1>Documentos</h1><div class="sub">Orçamentos de fornecedores, notas, contratos e desenhos, ligados às propostas. ${shared() ? 'Visíveis para toda a equipe.' : 'Neste arquivo, ficam só neste navegador.'}</div></div></div>
        ${up ? `<label class="drop" for="docUp" id="docDrop"><b>Solte aqui um orçamento, nota ou contrato</b><span class="sub">PDF, XML da NF-e, Excel ou foto. O app lê e preenche fornecedor, número, valores e itens.</span><input type="file" id="docUp" accept="application/pdf,image/*,.xml,.xlsx,.csv,.txt" hidden></label>` : '<div class="banner warn">Para anexar arquivos é preciso acesso de Editor ao app. Você ainda pode consultar os documentos.</div>'}
        <div class="sheetbar"><input id="docQ" type="search" placeholder="Buscar por fornecedor, peça, número…" value="${esc(ui.docQ || '')}" aria-label="Buscar documentos"><select id="docT" aria-label="Tipo"><option value="">Todos os tipos</option>${DOC_TIPOS.map(([k, l]) => `<option value="${k}"${t === k ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="sub">${list.length} de ${docs.length}</span></div>
        ${list.length ? docList(list) : '<section class="card"><p class="sub" style="margin:0">Nenhum documento ainda.</p></section>'}
      </div>`;
    }
    // modal de documento (novo, lido por Claude ou detalhes)
    function docModal(d, file, opts = {}) {
      d = Object.assign({ tipo: 'orcamento', moeda: 'BRL', itens: [] }, d || {});
      const props = (REG.listPropostas() || []).slice(0, 200);
      const cur = st(); const curUid = cur.uid; const curNome = cur.div === 'SPV' ? (cur.spv.numero || 'SPV em edição') + ' · ' + (cur.spv.cliente || '') : ctx.docTitle();
      const itRows = () => d.itens.map((it, i) => `<tr><td class="in"><input type="checkbox" data-mit="${i}" checked aria-label="Usar item"></td><td>${esc(it.codigo || '')}</td><td>${esc(it.descricao || '')}</td><td class="n">${fmt(num(it.quantidade), 2)}</td><td class="n">${fmt(num(it.valor_unitario))}</td><td class="n">${fmt(num(it.ipi_percentual), 2)}%</td></tr>`).join('');
      modal(`<h2>${d.id ? 'Documento' : 'Novo documento'}${file ? ' · ' + esc(file.name) : ''}</h2>
        <p class="sub" id="mdStatus" style="margin:0">${esc(opts.status || '')}</p>
        <div class="fields">
          <div class="f"><label for="mdTipo">Tipo</label><select id="mdTipo">${DOC_TIPOS.map(([k, l]) => `<option value="${k}"${d.tipo === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="f span2"><label for="mdForn">Fornecedor / emitente</label><input id="mdForn" value="${esc(d.fornecedor || '')}"></div>
          <div class="f"><label for="mdNum">Número</label><input id="mdNum" value="${esc(d.numero || '')}"></div>
          <div class="f"><label for="mdData">Data</label><input id="mdData" type="date" value="${esc(d.data || '')}"></div>
          <div class="f"><label for="mdMoeda">Moeda</label><select id="mdMoeda">${['BRL', 'USD', 'EUR'].map((m) => `<option${d.moeda === m ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
          <div class="f"><label for="mdTot">Total</label><input id="mdTot" inputmode="decimal" value="${typeof d.total === 'number' ? String(d.total).replace('.', ',') : ''}"></div>
          <div class="f span2"><label for="mdProp">Proposta</label><select id="mdProp"><option value="">— nenhuma —</option>${curUid ? `<option value="${esc(curUid)}"${d.propUid === curUid || (!d.id && opts.linkCurrent) ? ' selected' : ''}>Atual: ${esc(curNome)}</option>` : ''}${props.filter((p) => p.uid && p.uid !== curUid).map((p) => `<option value="${esc(p.uid)}"${d.propUid === p.uid ? ' selected' : ''}>${esc((p.div || 'SEQ') + ' · ' + (p.numero || '') + ' · ' + (p.cliente || p.name || ''))}</option>`).join('')}</select></div>
          <div class="f spanall"><label for="mdInsQ">Itens do cadastro ligados</label><div id="mdIns" class="docbar"></div><input id="mdInsQ" list="dl_ins_all" placeholder="buscar insumo pelo nome ou código e escolher" autocomplete="off"><datalist id="dl_ins_all">${(ctx.insumos ? ctx.insumos() : []).map((i) => `<option value="${esc(i.id + ' · ' + i.produto)}"></option>`).join('')}</datalist><small class="sub" id="mdInsSug"></small></div>
          <div class="f spanall"><label for="mdNotas">Observações</label><input id="mdNotas" value="${esc(d.notas || [d.condicao_pagamento && 'Pagamento: ' + d.condicao_pagamento, d.validade && 'Validade: ' + d.validade].filter(Boolean).join(' · '))}"></div>
        </div>
        ${d.itens.length ? `<div class="tw"><table class="t"><thead><tr><th></th><th>Código</th><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>IPI</th></tr></thead><tbody>${itRows()}</tbody></table></div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn pri" id="mdSave">${opts.toPecas && d.itens.length ? 'Salvar e adicionar os itens marcados às peças' : 'Salvar documento'}</button>
          ${d.id ? '<button class="btn" id="mdDel">Excluir</button>' : ''}<button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        const g = (x) => $(x, o);
        // ligação com itens do cadastro: sugeridos pelos itens lidos do documento
        const ins = ctx.insumos ? ctx.insumos() : []; const sel = new Set(d.insumos || opts.insumos || []);
        const W = (t) => new Set(norm(t).split(' ').filter((w) => w.length > 1));
        const sug = []; for (const it of d.itens || []) { const A = W(it.descricao); let best = null, bs = 0; for (const i of ins) { const B = W(i.produto); let c = 0; for (const w of A) if (B.has(w)) c++; const sc = A.size && B.size ? c / Math.max(A.size, B.size) : 0; if (sc > bs) { bs = sc; best = i; } } if (best && bs >= 0.5 && !sug.includes(best.id)) sug.push(best.id); }
        const drawIns = () => { g('#mdIns').innerHTML = [...sel].map((id) => { const i = ins.find((x) => x.id === id); return `<span class="pchip">${esc(id)}${i ? ' · ' + esc(i.produto.slice(0, 40)) : ''} <button class="restore" data-insrm="${esc(id)}">×</button></span>`; }).join('') || '<span class="sub">nenhum</span>';
          const fal = sug.filter((x) => !sel.has(x)); g('#mdInsSug').innerHTML = fal.length ? 'Sugeridos pelos itens do documento: ' + fal.map((id) => `<button class="restore" data-insadd="${esc(id)}">+ ${esc(id)} ${esc(((ins.find((x) => x.id === id) || {}).produto || '').slice(0, 30))}</button>`).join(' ') : '';
          o.querySelectorAll('[data-insrm]').forEach((b) => { b.onclick = () => { sel.delete(b.dataset.insrm); drawIns(); }; }); o.querySelectorAll('[data-insadd]').forEach((b) => { b.onclick = () => { sel.add(b.dataset.insadd); drawIns(); }; }); };
        g('#mdInsQ').onchange = () => { const id = g('#mdInsQ').value.split(' · ')[0].trim(); if (ins.some((i) => i.id === id)) { sel.add(id); g('#mdInsQ').value = ''; drawIns(); } };
        drawIns();
        g('#mdSave').onclick = async () => {
          const tot = parseInput(g('#mdTot').value, 'num'); const pu = g('#mdProp').value;
          const pn = pu === curUid ? curNome : ((props.find((p) => p.uid === pu) || {}).numero || '') + ' · ' + ((props.find((p) => p.uid === pu) || {}).cliente || '');
          const usados = [...o.querySelectorAll('[data-mit]')].filter((x) => x.checked).map((x) => d.itens[+x.dataset.mit]);
          const rec = { id: d.id, tipo: g('#mdTipo').value, fornecedor: g('#mdForn').value.trim(), numero: g('#mdNum').value.trim(), data: g('#mdData').value || null, moeda: g('#mdMoeda').value, total: typeof tot === 'number' ? tot : null,
            propUid: pu || null, propNome: pu ? pn : null, notas: g('#mdNotas').value.trim(), insumos: [...sel], itens: d.itens, nome: d.nome, assetId: d.assetId, local: d.local, contentType: d.contentType, size: d.size, at: d.at };
          g('#mdSave').disabled = true; g('#mdStatus').textContent = 'Salvando…';
          try {
            const id = await salvarDoc(rec, file);
            if (opts.toPecas && usados.length) addPecas(usados, rec, id);
            close(); toast(opts.toPecas && usados.length ? `${usados.length} itens adicionados às peças` : 'Documento salvo');
          } catch (e) { g('#mdSave').disabled = false; g('#mdStatus').textContent = (e && e.message) || 'Não consegui salvar o documento.'; }
        };
        const del = g('#mdDel'); if (del) del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); return; } await excluirDoc(d); close(); toast('Documento excluído'); };
      });
    }
    function addPecas(itens, doc, docId) {
      const s = S(); if (!s) return; const mk = Object.assign({}, cfg().mk, s.mk || {});
      for (const it of itens) s.pecas.push({ desc: it.descricao || '', cod: it.codigo || '', forn: doc.fornecedor || '', qtd: num(it.quantidade) || 1, un: it.unidade || '', unit: num(it.valor_unitario), ipi: num(it.ipi_percentual) / 100, moeda: doc.moeda || 'BRL', fator: mk.fator_pecas, incluso: true, docId });
      s.blocos.pecas = true; ctx.persist(); ctx.render();
    }
    async function importar(file, toPecas, extra) {
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) return toast('Arquivo acima de 20 MB.');
      const base = Object.assign({ nome: file.name, tipo: 'orcamento', moeda: 'BRL', itens: [] }, extra || {});
      const st0 = st(); const link = st0.div === 'SPV' || toPecas;
      docModal(base, file, { status: 'Lendo o documento…', toPecas, linkCurrent: link });
      try {
        const j = await lerDocumento(file, (m) => { const el = document.getElementById('mdStatus'); if (el) el.textContent = m; });
        const d = Object.assign(base, { tipo: j.tipo || 'orcamento', fornecedor: j.fornecedor || '', numero: j.documento || '', data: /^\d{4}-\d{2}-\d{2}$/.test(j.data || '') ? j.data : '', moeda: ['USD', 'EUR'].includes(j.moeda) ? j.moeda : 'BRL',
          total: typeof j.total === 'number' ? j.total : null, condicao_pagamento: j.condicao_pagamento, validade: j.validade, itens: Array.isArray(j.itens) ? j.itens.filter((x) => x && x.descricao) : [] });
        document.getElementById('overlay').innerHTML = '';
        docModal(d, file, { status: `Lido: ${d.itens.length} item(ns). Confira antes de salvar.`, toPecas, linkCurrent: link });
      } catch (e) {
        const el = document.getElementById('mdStatus');
        if (el) el.textContent = e && e.code === 'unavailable' ? 'Não consegui ler esse arquivo. Preencha os dados à mão (XML da NF-e é o formato mais seguro).' : e && e.code === 'not_granted' ? 'A leitura com Claude não foi permitida. Preencha os dados à mão.' : e && (e.code === 'images_unavailable' || e.code === 'image_rejected') ? 'Este documento é uma imagem e a leitura de imagens não está disponível aqui. Preencha os dados à mão.' : 'Não consegui ler este documento' + (e && e.code ? ' (' + e.code + ')' : '') + '. Preencha os dados à mão.';
      }
    }

    // ---------- PDF ----------
    async function pdf(kind) {
      if (!(window.jspdf && window.jspdf.jsPDF)) await load(CDN.jspdf); if (!window.jspdf.jsPDF.API.autoTable) await load(CDN.autotable);
      const s = S(); const r = calc(s); const ti = tipoInfo(s.tipo); const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(); const OR = [232, 87, 10], INK = [27, 28, 30], MUTE = [110, 112, 118];
      const safe = (x) => String(x ?? '').replace(/[‑‒–]/g, '-').replace(/[^\x00-\xFF—’“”•…]/g, '');
      const bl = (x) => 'R$ ' + NF[2].format(x || 0);
      let y = 34; doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK);
      doc.text(safe(kind === 'cliente' ? 'Proposta de serviço' + (s.numero ? ' nº ' + s.numero : '') : 'Formação de custo — SPV' + (s.numero ? ' ' + s.numero : '')), 12, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTE); doc.text(safe(ti.abrev + ' · ' + ti.nome), 12, y); y += 8;
      const kv = [['Cliente', s.cliente], ['Contato', s.contato], ['Local do serviço', s.local + (s.uf ? ' / ' + s.uf : '')], ['Data', new Date(s.data || Date.now()).toLocaleDateString('pt-BR')], ['Validade', (s.validade || 15) + ' dias'], ['Vendedor', s.vendedor]];
      doc.setFontSize(8.5); kv.forEach(([k, v], i) => { const x = 12 + (i % 3) * 62; const yy = y + Math.floor(i / 3) * 10; doc.setTextColor(...MUTE); doc.setFont('helvetica', 'normal'); doc.text(safe(k).toUpperCase(), x, yy); doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(safe(v || '—'), x, yy + 4.2); });
      y += 24;
      const head = { styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 1.8, textColor: INK }, headStyles: { fillColor: [30, 31, 33], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [248, 246, 243] }, margin: { left: 12, right: 12, top: 30, bottom: 16 } };
      if (s.descricao) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Escopo', 12, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); const lines = doc.splitTextToSize(safe(s.descricao), W - 24); doc.text(lines, 12, y); y += lines.length * 4.4 + 4; }
      if (kind === 'cliente') {
        const body = [];
        if (s.blocos.equipe && r.pessoas) body.push(['Mão de obra técnica', `${r.pessoas} técnico(s), ${r.dias} dia(s) de trabalho`]);
        if (s.blocos.equipe && r.logTot) body.push(['Mobilização', r.aereo ? 'Passagens aéreas, hospedagem, alimentação e locação de veículo' : 'Deslocamento, hospedagem e alimentação']);
        for (const p of r.pecas.filter((x) => x.incluso !== false)) body.push([p.desc, `${fmt(num(p.qtd), 0)} ${p.un || 'un.'}`]);
        if (body.length) doc.autoTable(Object.assign({}, head, { startY: y, head: [['Incluso no fornecimento', 'Quantidade']], body: body.map((x) => x.map(safe)), columnStyles: { 1: { cellWidth: 60 } } }));
        y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 8;
        doc.setFillColor(255, 241, 232); doc.rect(12, y, W - 24, r.ct ? 24 : 16, 'F'); doc.setTextColor(...MUTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text('INVESTIMENTO', 16, y + 6); doc.setTextColor(...OR); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        if (r.ct) { doc.text(safe(bl(r.ct.mensal) + ' por mês'), 16, y + 13.5); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(safe(`${s.contrato.visitas} visitas por ano · contrato de ${s.contrato.meses} meses · total ${bl(r.ct.total)} · reajuste ${s.contrato.reajuste || '—'}`), 16, y + 20); y += 30; }
        else { doc.text(safe(bl(r.V)), 16, y + 13); y += 22; }
        doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        const cond = [['Condição de pagamento', s.pagamento + (s.aprazo ? ' (a prazo)' : '')], ['Prazo de execução', s.prazo_exec || 'a combinar'], ['Validade da proposta', (s.validade || 15) + ' dias'], ['Impostos', 'Inclusos']];
        cond.forEach(([k, v]) => { doc.setFont('helvetica', 'bold'); doc.text(safe(k + ':'), 12, y); doc.setFont('helvetica', 'normal'); doc.text(safe(v), 60, y); y += 5; });
        if (s.exclusoes) { y += 3; doc.setFont('helvetica', 'bold'); doc.text('Não incluso', 12, y); y += 5; doc.setFont('helvetica', 'normal'); const l = doc.splitTextToSize(safe(s.exclusoes), W - 24); doc.text(l, 12, y); }
      } else {
        const body = [];
        r.pecas.length && r.pecas.forEach((p) => body.push(['Peça', p.desc + (p.forn ? ' (' + p.forn + ')' : ''), fmt(num(p.qtd), 2), bl(p.unitBRL), bl(p.custo), fmt(p.fator, 2), bl(p.venda)]));
        if (s.blocos.equipe) { s.equipe.filter((e) => num(e.dias) > 0).forEach((e) => body.push(['Equipe', e.tec, fmt(num(e.dias), 0) + ' d', bl(e.diaria), bl(num(e.diaria) * num(e.dias)), '', ''])); r.log.filter((x) => x.tot).forEach((x) => body.push(['Deslocamento', x.lb, fmt(num(x.qtd), 0), bl(x.p), bl(x.tot), '', ''])); }
        doc.autoTable(Object.assign({}, head, { startY: y, head: [['Grupo', 'Descrição', 'Qtd', 'Unit.', 'Custo', 'Fator', 'Venda']], body: body.map((x) => x.map(safe)), columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } }));
        const res = [['Custo da prestação do serviço', bl(r.custoServ)], ['Multiplicador do serviço', fmt(r.mult, 2)], ['Venda do serviço', bl(r.Vs)], ['Venda das peças', bl(r.Vp)], ['Venda bruta', bl(r.V)]].concat(r.ded.map(([lb, t, v]) => [lb + ' (' + NF[2].format(t * 100) + '%)', '- ' + bl(v)])).concat([['Custos', '- ' + bl(r.custo)], [r.ct ? 'Lucro líquido do contrato' : 'Lucro líquido', bl(r.lucro) + ' (' + NF[1].format(r.lucroPct * 100) + '%)']]);
        if (r.ct) res.push(['Contrato: ' + fmt(r.ct.nV, 0) + ' visitas + ART uma vez (' + bl(r.ct.artV) + ')', 'mensal ' + bl(r.ct.mensal) + ' / total ' + bl(r.ct.total)]);
        doc.autoTable(Object.assign({}, head, { startY: doc.lastAutoTable.finalY + 6, head: [['Formação do preço', '']], body: res.map((x) => x.map(safe)), columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } }));
      }
      const pages = doc.getNumberOfPages(); const Hh = doc.internal.pageSize.getHeight(); const img = document.querySelector('.logo-plate img');
      let logo = null; try { if (img && img.naturalWidth) { const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); logo = { url: cv.toDataURL('image/png'), r: img.naturalHeight / img.naturalWidth }; } } catch (e) { logo = null; }
      for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFillColor(...OR); doc.rect(0, 0, W, 3, 'F'); if (logo) doc.addImage(logo.url, 'PNG', 12, 7, 38, 38 * logo.r); doc.setDrawColor(215, 212, 206); doc.line(12, 24, W - 12, 24);
        doc.setFillColor(...OR); doc.rect(0, Hh - 10, W, 10, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('A FORÇA DA ÁGUA É A NOSSA FORÇA', 12, Hh - 3.8);
        doc.setFont('helvetica', 'normal'); doc.text(safe('LS Fire · ' + (kind === 'cliente' ? 'proposta' : 'uso interno') + ' · página ' + i + ' de ' + pages), W - 12, Hh - 3.8, { align: 'right' }); }
      const name = ((kind === 'cliente' ? 'Proposta SPV ' : 'Formação SPV ') + (s.numero || '') + ' ' + (s.cliente || '')).trim().replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
      const ok = await REG.save(name, doc.output('arraybuffer'), 'application/pdf'); if (!ok) toast('Download cancelado');
    }

    // ---------- configuração SPV (Cadastro → Serviços SPV) ----------
    // configuração SPV por área: cada área edita só a sua parte
    function cfgSec(area, ed) {
      const c = cfg(); const ro = ed ? '' : ' disabled';
      const ci = (path, v, kind = 'num', lb) => { const shown = kind === 'pct' ? NF[2].format(v * 100).replace(/,00$/, '') : kind === 'num' ? String(v).replace('.', ',') : v; return `<input data-cfg="${path}" data-k="${kind}" value="${esc(shown)}"${kind === 'text' ? '' : ' inputmode="decimal"'} aria-label="${esc(lb || path)}"${ro}>`; };
      const f = (lb, h, u) => `<div class="f"><label>${esc(lb)}</label><div class="ctl pctl">${h}${u ? `<span class="unit">${u}</span>` : ''}</div></div>`;
      const tec = c.tecnicos.map((t, i) => `<tr><td class="in">${ci(`tecnicos.${i}.nome`, t.nome, 'text', 'Nome')}</td><td class="in">${ci(`tecnicos.${i}.funcao`, t.funcao, 'text', 'Função')}</td><td class="in">${ci(`tecnicos.${i}.diaria`, t.diaria, 'num', 'Diária')}</td><td>${ed ? `<button class="restore" data-cfgrm="${i}">excluir</button>` : ''}</td></tr>`).join('');
      const m = c.mk, k = c.custos;
      if (area === 'servicos') return `
        <section class="card"><h2>Técnicos e diárias</h2><div class="tw"><table class="t reg"><thead><tr><th>Nome</th><th>Função</th><th>Diária (R$)</th><th></th></tr></thead><tbody>${tec}</tbody></table></div>${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn sm" data-cfgadd>+ Técnico</button></div>' : ''}</section>
        <section class="card"><h2>Deslocamento e estadia <span class="sub">preços usados em todas as propostas SPV novas</span></h2><div class="fields">${f('R$ por km', ci('custos.rkm', k.rkm))}${f('Passagem aérea (trecho)', ci('custos.aereo', k.aereo), 'R$')}${f('Locação de automóvel (dia)', ci('custos.carro', k.carro), 'R$')}${f('Hotel (noite, quarto individual)', ci('custos.hotel', k.hotel), 'R$')}${f('Alimentação (dia)', ci('custos.alim', k.alim), 'R$')}${f('ART', ci('custos.art', k.art), 'R$')}${f('Acima disto vai de avião (km ida e volta)', ci('custos.limite_km', k.limite_km))}${f('Endereço de saída', ci('custos.saida', k.saida, 'text'))}</div></section>
        <section class="card" id="cfgModelos"><h2>Modelos de serviço e contrato <span class="sub">${c.modelos.length}</span></h2><p class="sub" style="margin:0 0 8px">Ao começar uma proposta SPV, o modelo preenche escopo, itens não inclusos, prazo, equipe e frequência das visitas.</p>
          <div class="tw"><table class="t"><thead><tr><th>Modelo</th><th>Tipo</th><th>Visitas/ano</th><th>Equipe</th><th>Peças</th><th></th></tr></thead><tbody>${c.modelos.map((x, i) => `<tr><td><b>${esc(x.nome)}</b><br><small class="sub">${esc(String(x.escopo || '').slice(0, 110))}${String(x.escopo || '').length > 110 ? '…' : ''}</small></td><td>${esc(x.tipo)}</td><td class="n">${x.visitas || '—'}</td><td class="sub">${esc((x.equipe || []).map((e) => e.tec + ' × ' + e.dias + 'd').join(', '))}</td><td class="n">${(x.pecas || []).length || '—'}</td><td style="white-space:nowrap">${ed ? `<button class="btn sm" data-cfgmod="${i}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
          ${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn sm" data-cfgmod="novo">+ Modelo</button></div>' : ''}</section>`;
      if (area === 'fiscal') return `<section class="card"><h2>Impostos de serviços e peças</h2><div class="fields">${f('PIS', ci('mk.pis', m.pis, 'pct'), '%')}${f('COFINS', ci('mk.cofins', m.cofins, 'pct'), '%')}${f('IRPJ / CSLL do serviço', ci('mk.irpj', m.irpj, 'pct'), '%')}${f('ISS', ci('mk.iss', m.iss, 'pct'), '%')}${f('IRPJ / CSLL de peças', ci('mk.irpj_pecas', m.irpj_pecas, 'pct'), '%')}</div><p class="sub" style="margin:8px 0 0">O ICMS das peças vem da tabela ICMS por UF (acima), pela UF do cliente.</p></section>`;
      if (area === 'preco') return `<section class="card"><h2>Margens, comissões e encargos</h2><div class="fields">${f('Multiplicador padrão do serviço', ci('mk.mult', m.mult))}${f('Lucro líquido mínimo', ci('mk.lucro_min', m.lucro_min, 'pct'), '%')}${f('Fator padrão de venda de peças', ci('mk.fator_pecas', m.fator_pecas))}${f('Custo financeiro', ci('mk.fin', m.fin, 'pct'), '%')}${f('Comissão representante', ci('mk.com_rep', m.com_rep, 'pct'), '%')}${f('Comissão captador', ci('mk.com_capt', m.com_capt, 'pct'), '%')}${f('Comissão orçamento', ci('mk.com_orc', m.com_orc, 'pct'), '%')}${f('Encargo de pagamento a prazo', ci('mk.prazo', m.prazo, 'pct'), '%')}</div></section>`;
      if (area === 'custos') return `<section class="card"><h2>Câmbio e importação <span class="sub">usados nas peças importadas das propostas SPV</span></h2><div class="fields">${f('Câmbio do dólar', ci('mk.cambio_usd', m.cambio_usd), 'R$')}${f('Câmbio do euro', ci('mk.cambio_eur', m.cambio_eur), 'R$')}${f('Fator de importação (frete, impostos e despacho)', ci('mk.fimp', m.fimp))}</div></section>`;
      if (area === 'geral') return `
        <section class="card"><h2>Famílias de produto por divisão</h2><p class="sub" style="margin:0 0 8px">Código do produto: NNN-XXX-XXXXX (família, abreviação, sequência). As famílias SPV aparecem como tipos na página inicial.</p>
          <div class="tw"><table class="t famtab"><thead><tr><th>Código</th><th>Família</th><th>Divisão</th><th>Abrev.</th><th>Descrição</th></tr></thead><tbody>${famprod().map((x) => `<tr><td>${x.code ? String(x.code).padStart(3, '0') : '<span class="pill warn">a definir</span>'}</td><td><b>${esc(x.nome)}</b></td><td><span class="divb ${x.div.toLowerCase()}">${x.div}</span></td><td>${esc(x.abrev)}</td><td class="sub">${esc(x.desc)}</td></tr>`).join('')}</tbody></table></div></section>`;
      return '';
    }
    function modeloModal(i, base) {
      const c = cfg(); const m = base || (i === 'novo' ? { id: 'm' + Date.now().toString(36), tipo: 'SMC', nome: '', equipe: [], escopo: '', exclusoes: EXC } : c.modelos[+i]);
      const eqTxt = (m.equipe || []).map((e) => e.tec + '; ' + e.dias).join('\n');
      const pcTxt = (m.pecas || []).map((x) => [x.desc, x.qtd || 1, num(x.unit) ? String(x.unit).replace('.', ',') : ''].join('; ').replace(/; $/, '')).join('\n');
      modal(`<h2>${i === 'novo' ? 'Novo modelo' : 'Modelo'}</h2>
        <div class="fields">
          <div class="f span2"><label for="moNome">Nome</label><input id="moNome" value="${esc(m.nome)}" placeholder="ex.: Contrato anual — 4 visitas"></div>
          <div class="f"><label for="moTipo">Tipo</label><select id="moTipo">${spvTipos().map((t) => `<option value="${t.abrev}"${m.tipo === t.abrev ? ' selected' : ''}>${t.abrev} — ${esc(t.nome)}</option>`).join('')}</select></div>
          <div class="f"><label for="moVis">Visitas por ano</label><input id="moVis" inputmode="decimal" value="${m.visitas || ''}" placeholder="vazio = serviço avulso"></div>
          <div class="f"><label for="moMeses">Duração (meses)</label><input id="moMeses" inputmode="decimal" value="${m.meses || ''}"></div>
          <div class="f span2"><label for="moPrazo">Prazo de execução</label><input id="moPrazo" value="${esc(m.prazo || '')}"></div>
          <div class="f spanall"><label for="moEq">Equipe — um técnico por linha: nome; dias</label><textarea id="moEq" rows="3" placeholder="Yago; 1">${esc(eqTxt)}</textarea><small class="sub">Técnicos cadastrados: ${esc(c.tecnicos.map((t) => t.nome).join(', '))}</small></div>
          <div class="f spanall"><label for="moPc">Peças e materiais padrão (estrutura) — uma por linha: descrição; quantidade; valor unitário</label><textarea id="moPc" rows="4" placeholder="GATEWAY FIRECONNECT; 1; 4500">${esc(pcTxt)}</textarea><small class="sub">Sem valor, o app usa o último preço pago (orçamentos e propostas). Moeda, IPI e fornecedor ficam como no modelo salvo de uma proposta.</small></div>
          <div class="f spanall"><label for="moEsc">Escopo</label><textarea id="moEsc" rows="8">${esc(m.escopo || '')}</textarea></div>
          <div class="f spanall"><label for="moExc">Não incluso</label><textarea id="moExc" rows="3">${esc(m.exclusoes || '')}</textarea></div>
        </div>
        <p class="sub" id="moMsg" style="margin:0"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="moSave">Salvar modelo</button>${i !== 'novo' && !base ? '<button class="btn" id="moDel">Excluir</button>' : ''}<button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        const g = (x) => $(x, o);
        g('#moSave').onclick = async () => {
          const nome = g('#moNome').value.trim(); if (!nome) { g('#moMsg').textContent = 'Dê um nome ao modelo.'; return; }
          const vis = parseInput(g('#moVis').value, 'num'); const meses = parseInput(g('#moMeses').value, 'num');
          const equipe = g('#moEq').value.split('\n').map((l) => l.split(';')).filter((x) => x[0].trim()).map(([t, d]) => ({ tec: t.trim(), dias: parseInput((d || '1').trim(), 'num') || 1 }));
          const antes = new Map((m.pecas || []).map((x) => [norm(x.desc), x]));
          const pecas = g('#moPc').value.split('\n').map((l) => l.split(';')).filter((x) => x[0].trim()).map(([d, q, u]) => { const desc = d.trim(); const old = antes.get(norm(desc)) || {}; const unit = parseInput((u || '').trim(), 'num'); return Object.assign({}, old, { desc, qtd: parseInput((q || '1').trim(), 'num') || 1, unit: typeof unit === 'number' ? unit : 0 }); });
          const rec = { id: m.id, tipo: g('#moTipo').value, nome, equipe, pecas, escopo: g('#moEsc').value.trim(), exclusoes: g('#moExc').value.trim(), prazo: g('#moPrazo').value.trim() };
          if (typeof vis === 'number' && vis > 0) { rec.visitas = vis; rec.meses = typeof meses === 'number' && meses > 0 ? meses : 12; }
          close();
          await saveCfg((cc) => { const k = cc.modelos.findIndex((x) => x.id === rec.id); if (k >= 0) cc.modelos[k] = rec; else cc.modelos.push(rec); }, null, (i === 'novo' ? 'Modelo incluído: ' : 'Modelo alterado: ') + nome) && toast('Modelo salvo: ' + nome);
        };
        const del = g('#moDel'); if (del) del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); return; } close(); await saveCfg((cc) => { cc.modelos = cc.modelos.filter((x) => x.id !== m.id); }, null, 'Modelo excluído: ' + m.nome) && toast('Modelo excluído'); };
      });
    }
    const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[/^\d+$/.test(k) ? +k : k]), o);
    async function saveCfg(mut, path, desc) {
      const c = clone(cfg()); const de = path ? getPath(c, path) : null; mut(c); const para = path ? getPath(c, path) : null;
      if (path && de === para) return;
      try { await REG.setTable('SPV', { cfg: c }, desc || 'Configuração de serviços (SPV)', path ? [{ campo: path, de: de ?? null, para: para ?? null }] : []); return true; }
      catch (e) { toast(e.message || 'Não consegui salvar'); return false; }
    }

    // ---------- eventos ----------
    const setPath = (o, path, v) => { const ks = path.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) { const k = /^\d+$/.test(ks[i]) ? +ks[i] : ks[i]; if (x[k] == null) x[k] = {}; x = x[k]; } x[ks[ks.length - 1]] = v; };
    const parseV = (el) => { const k = el.dataset.k; if (k === 'bool') return el.checked; const t = el.value.trim(); if (k === 'text') return t; if (t === '') return null; const n = parseInput(t, 'num'); if (typeof n !== 'number') return undefined; return k === 'pct' ? n / 100 : n; };
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.sp && S()) {
        const v = parseV(el); if (v === undefined) { toast('Número inválido'); return ctx.render(); }
        const s = S(); const p = el.dataset.sp;
        if (p.startsWith('ov.')) { s.ov = s.ov || {}; if (v === null) delete s.ov[p.slice(3)]; else s.ov[p.slice(3)] = v; }
        else setPath(s, p, v);
        const m = /^equipe\.(\d+)\.tec$/.exec(p); if (m) { const t = cfg().tecnicos.find((x) => x.nome === v); if (t) s.equipe[+m[1]].diaria = t.diaria; }
        const pm = /^pecas\.(\d+)\.desc$/.exec(p); if (pm) { const row = s.pecas[+pm[1]]; const h = pricebook().get(norm(v)); if (h && !num(row.unit)) { const x = h[0]; Object.assign(row, { unit: x.unit, moeda: x.moeda, forn: row.forn || x.forn, cod: row.cod || x.cod, ipi: x.ipi || 0 }); toast('Preço da última compra: ' + (x.forn || '')); } }
        if (p === 'tipo') { const ini = TIPO_INI[v]; if (ini) s.blocos = { equipe: !!ini.equipe || s.equipe.length > 0, pecas: !!ini.pecas || s.pecas.length > 0, contrato: !!ini.contrato }; }
        ctx.persist(); ctx.render(); return;
      }
      if (el.dataset && el.dataset.sptec && S()) { const s = S(); const nm = el.dataset.sptec; if (el.checked) { const t = cfg().tecnicos.find((x) => x.nome === nm); s.equipe.push({ tec: nm, diaria: t ? t.diaria : 0, dias: s.equipe[0] ? num(s.equipe[0].dias) || 1 : 1 }); } else s.equipe = s.equipe.filter((e) => e.tec !== nm); ctx.persist(); ctx.render(); return; }
      if (el.dataset && el.dataset.spblk && S()) { S().blocos[el.dataset.spblk] = el.checked; ctx.persist(); ctx.render(); return; }
      if (el.dataset && el.dataset.cfg) { const v = parseV(el); if (v === undefined) return toast('Número inválido'); saveCfg((c) => setPath(c, el.dataset.cfg, v), el.dataset.cfg); return; }
      if (el.dataset && el.dataset.hstatus) { const p = (REG.listPropostas() || []).find((x) => x.id === el.dataset.hstatus); if (!p) return;
        if (el.value === 'ganha' && ctx.fechar) { ctx.render(); ctx.fechar(p); return; } const rec = Object.assign({}, p, { status: el.value }); delete rec.id; delete rec.local; REG.saveProposta(p.id, rec).then(() => { ctx.log && ctx.log({ tipo: 'Status da proposta', ref: p.id, desc: (p.numero || p.name || '') + ' · ' + (p.cliente || ''), mudancas: [{ campo: 'Status', de: p.status || 'rascunho', para: el.value }] }); toast('Status: ' + (STATUS.find((x) => x[0] === el.value) || [0, el.value])[1]); if (st().id === p.id) st().status = el.value; ctx.render(); }).catch((er) => toast(er.message || 'Não consegui salvar')); return; }
      if (el.id === 'spImport') { importar(el.files[0], true); el.value = ''; return; }
      if (el.id === 'spAttach') { importar(el.files[0], false); el.value = ''; return; }
      if (el.id === 'docUp') { importar(el.files[0], false); el.value = ''; return; }
      if (el.dataset && el.dataset.insdoc) { importar(el.files[0], false, { insumos: [el.dataset.insdoc] }); el.value = ''; return; }
      if (el.id === 'docT') { ctx.ui.docT = el.value; ctx.render(); }
    });
    let qT;
    document.addEventListener('input', (e) => {
      const id = e.target.id; if (id !== 'homeQ' && id !== 'docQ') return;
      clearTimeout(qT); qT = setTimeout(() => { ctx.ui[id] = e.target.value; ctx.render(); const f = document.getElementById(id); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 200);
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      const ns = t.closest('[data-spvnew]'); if (ns) { novoSpv(ns.dataset.spvnew); return; }
      if (t.closest('[data-seqnew]')) { ctx.newSeq(); return; }
      const sf = t.closest('[data-seqfam]'); if (sf) { ctx.newSeq(sf.dataset.seqfam); return; }
      const hd = t.closest('[data-hdiv]'); if (hd) { ctx.ui.homeDiv = hd.dataset.hdiv; ctx.render(); return; }
      const ho = t.closest('[data-hopen]'); if (ho && !t.closest('select') && !t.closest('[data-hdup]') && !t.closest('[data-hnext]') && !t.closest('[data-hperdida]')) { const p = (REG.listPropostas() || []).find((x) => x.id === ho.dataset.hopen); if (p) ctx.openProposta(p, false); return; }
      const hu = t.closest('[data-hdup]'); if (hu) { const p = (REG.listPropostas() || []).find((x) => x.id === hu.dataset.hdup); if (p) ctx.openProposta(p, true); return; }
      const ad = t.closest('[data-spadd]'); if (ad && S()) { const s = S(); if (ad.dataset.spadd === 'equipe') s.equipe.push({ tec: '', diaria: 0, dias: s.equipe[0] ? s.equipe[0].dias : 1 }); else s.pecas.push({ desc: '', qtd: 1, unit: 0, ipi: 0, moeda: 'BRL', incluso: true }); ctx.persist(); ctx.render(); return; }
      const rm = t.closest('[data-sprm]'); if (rm && S()) { const [k, i] = rm.dataset.sprm.split('.'); S()[k].splice(+i, 1); ctx.persist(); ctx.render(); return; }
      const md = t.closest('[data-spmod]'); if (md && S()) { const m = cfg().modelos.find((x) => x.id === md.dataset.spmod); if (m) { aplicarModelo(S(), m); ctx.persist(); ctx.render(); toast('Modelo aplicado: ' + m.nome); } return; }
      const vs = t.closest('[data-spvis]'); if (vs && S()) { const v = +vs.dataset.spvis; S().contrato.visitas = v; if (/^\d+ visitas? por ano/.test(S().prazo_exec || '')) S().prazo_exec = S().prazo_exec.replace(/^\d+ visitas?/, v + (v > 1 ? ' visitas' : ' visita')); ctx.persist(); ctx.render(); return; }
      if (t.closest('[data-spprecos]') && S()) { S().precos = precosCad(); ctx.persist(); ctx.render(); toast('Preços de deslocamento atualizados'); return; }
      const gc = t.closest('[data-spcfg]'); if (gc) { ctx.ui.view = 'cadastro'; ctx.ui.cad = 'servicos'; ctx.render(); const el = gc.dataset.spcfg === 'modelos' && document.getElementById('cfgModelos'); if (el) el.scrollIntoView(); else window.scrollTo(0, 0); return; }
      if (t.closest('[data-spsavemod]') && S()) { const s = S(); const ti = TIPO_INI[s.tipo] || {}; modeloModal('novo', { id: 'm' + Date.now().toString(36), tipo: s.tipo, nome: (ti.titulo || s.tipo) + (s.cliente ? ' — ' + s.cliente : ''), equipe: s.blocos.equipe ? s.equipe.filter((e) => e.tec).map((e) => ({ tec: e.tec, dias: num(e.dias) || 1 })) : [], escopo: s.descricao, exclusoes: s.exclusoes, prazo: s.prazo_exec, visitas: s.blocos.contrato ? s.contrato.visitas : undefined, meses: s.blocos.contrato ? s.contrato.meses : undefined,
        pecas: s.blocos.pecas ? s.pecas.filter((x) => x.desc).map((x) => ({ desc: x.desc, cod: x.cod || '', forn: x.forn || '', qtd: num(x.qtd) || 1, un: x.un || '', unit: num(x.unit), moeda: x.moeda || 'BRL', ipi: num(x.ipi), fator: x.fator })) : [] }); return; }
      const cm = t.closest('[data-cfgmod]'); if (cm) { modeloModal(cm.dataset.cfgmod); return; }
      const au = t.closest('[data-spauto]'); if (au && S()) { delete S().ov[au.dataset.spauto]; ctx.persist(); ctx.render(); return; }
      if (t.closest('[data-spfix]') && S()) { const r = calc(S()); if (r.multMin) { S().mk.mult = Math.ceil(r.multMin * 100) / 100; ctx.persist(); ctx.render(); toast('Multiplicador ajustado para a meta de lucro'); } return; }
      const pp = t.closest('[data-sppdf]'); if (pp && S()) { pdf(pp.dataset.sppdf).catch((er) => toast(er.message || 'Não consegui gerar o PDF')); return; }
      const dop = t.closest('[data-dopen]'); if (dop) { const d = docs.find((x) => x.id === dop.dataset.dopen); if (d) abrirDoc(d, false); return; }
      const ddw = t.closest('[data-ddown]'); if (ddw) { const d = docs.find((x) => x.id === ddw.dataset.ddown); if (d) abrirDoc(d, true); return; }
      const dde = t.closest('[data-dedit]'); if (dde) { const d = docs.find((x) => x.id === dde.dataset.dedit); if (d) docModal(d, null, { toPecas: !!S() && st().div === 'SPV' }); return; }
      if (t.closest('[data-cfgadd]')) { saveCfg((c) => c.tecnicos.push({ nome: 'Novo técnico', funcao: '', diaria: 0 }), null, 'Técnico incluído'); return; }
      const cr = t.closest('[data-cfgrm]'); if (cr) { if (!cr.dataset.sure) { cr.dataset.sure = 1; cr.textContent = 'confirmar'; return; } const nm = (cfg().tecnicos[+cr.dataset.cfgrm] || {}).nome; saveCfg((c) => c.tecnicos.splice(+cr.dataset.cfgrm, 1), null, 'Técnico excluído: ' + (nm || '')); }
    });
    document.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('#docDrop')) { e.preventDefault(); e.target.closest('#docDrop').classList.add('over'); } });
    document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('#docDrop'); if (d) d.classList.remove('over'); });
    document.addEventListener('drop', (e) => { const d = e.target.closest && e.target.closest('#docDrop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) importar(f, false); });

    const docList2 = (list) => (list.length ? docList(list) : '<p class="sub" style="margin:0">Nenhum documento ligado.</p>');
    return { docsDoInsumo: (id) => docList2(docs.filter((d) => (d.insumos || []).includes(id))), cfg, vHome, vSpv, vDocs, cfgSec, snapshot, lerDocumento, docs: () => docs, salvarDoc, STATUS, calc, novoSpv, uid, famprod, docsDaProposta, ensureDocs, total: () => (S() ? calc(S()).total : null) };
  }
  window.PricerSPV = SPV;
})();
