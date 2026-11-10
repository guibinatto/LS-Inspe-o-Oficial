/* LS Pricer — proposta técnica e comercial no modelo PTC LS Fire, montada a partir da formação.
 * Os números (itens, quantidades, impostos, NCM, preços e total) e o cabeçalho vêm da proposta (Dados gerais, itens,
 * formação); os textos padrão, a estrutura (ordem das seções por tipo de documento) e as imagens vêm do Modelo da
 * proposta (Cadastros → Cadastro geral → Modelo da proposta). O que é só do documento desta proposta (tipo, idioma,
 * moeda, notas, contatos, folhas de dados e curvas dos itens) fica em propCom, salvo junto com a proposta.
 * Três tipos: técnica e comercial (tc), comercial (com) e técnica (tec, sem preços). Três idiomas: pt, en, es.
 */
(function () {
  'use strict';
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  let carregando = null;
  function lib() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!carregando) carregando = new Promise((res, rej) => { const s = document.createElement('script'); s.src = JSPDF; s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { carregando = null; rej(new Error('Não consegui carregar a biblioteca de PDF. Verifique a internet e tente de novo.')); }; document.head.appendChild(s); });
    return carregando;
  }
  // cores e medidas tiradas das PTC (mm, A4)
  const LAR = [199, 56, 21], LAR2 = [228, 101, 14], TIT = [228, 101, 14], ESC = [47, 47, 47], BORDA = [51, 51, 51], CINZA = [153, 153, 153], LINHA = [204, 204, 204], FUNDO = [242, 242, 242], ATN = [42, 43, 42], ATN2 = [212, 93, 42], SUAVE = [253, 236, 226], TXT2 = [85, 85, 85];
  const X0 = 12.4, X1 = 197.5, LW = X1 - X0, TOPO = 44, LIM = 271;
  const MONO = 'RobotoMono', MONT = 'Montserrat';
  // o PDF usa fontes reduzidas ao alfabeto latino: troca o que ficaria em branco
  const limpa = (s) => String(s ?? '').replace(/\r/g, '').replace(/[‐‑‒]/g, '-').replace(/[″]/g, '"').replace(/[′]/g, "'").replace(/\t/g, ' ').replace(/[^\x00-\xFFŒœη–—‘-„•…€™→−≤≥\n]/g, '');
  const linhasDe = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  // ---------- tipos, seções e imagens ----------
  const TIPOS = [['tc', 'Técnica e comercial'], ['com', 'Comercial'], ['tec', 'Técnica']];
  const IDIOMAS = [['pt', 'Português'], ['en', 'English'], ['es', 'Español']];
  const SECOES = [['capa', 'Capa'], ['conheca', 'Conheça a LS Fire'], ['solucoes', 'Soluções LS Fire (CMB, skid e container)'], ['planilha', 'Planilha de preços (na técnica: escopo de fornecimento, sem preços)'], ['condicoes', 'Condições: pagamento, prazo, frete e observações'], ['folha', 'Folha de dados de cada item'], ['comiss', 'Comissionamento e start-up'], ['notas', 'Notas, desvios e exclusões'], ['prazos', 'Prazos e condições'], ['docs', 'Escopo de documentos'], ['termos', 'Termos e condições'], ['contatos', 'Contatos']];
  const SO_SEQ = new Set(['solucoes', 'folha', 'comiss', 'prazos', 'docs']);
  const LAYOUT = { ordem: SECOES.map((x) => x[0]), tipos: {
    tc: Object.fromEntries(SECOES.map((x) => [x[0], true])),
    com: { capa: true, conheca: true, solucoes: false, planilha: true, condicoes: true, folha: false, comiss: false, notas: true, prazos: false, docs: false, termos: true, contatos: true },
    tec: { capa: true, conheca: true, solucoes: true, planilha: true, condicoes: false, folha: true, comiss: true, notas: true, prazos: true, docs: true, termos: false, contatos: true } } };
  const SLOTS = [['capa-seq', 'Capa — equipamentos', [0, 210]], ['capa-spv', 'Capa — serviços', [0, 210]], ['conheca-seq', 'Conheça a LS Fire — equipamentos', [X0, X1]], ['conheca-spv', 'Conheça a LS Fire — serviços', [X0, X1]], ['sol-cmb', 'Soluções: CMB', [X0, 107]], ['sol-skid', 'Soluções: Skid', [X0, 107]], ['sol-container', 'Soluções: Container', [X0, 107]], ['comiss-tecnico', 'Comissionamento: técnico', [110, X1]], ['comiss-etapas', 'Comissionamento: etapas', [X0, X1]], ['selos', 'Selos da capa', [105, X1]], ['slogan', 'Slogan (contatos)', [X0, X1]], ['logo-cab', 'Logo do cabeçalho', [0, 60]]];

  // ---------- rótulos fixos nos três idiomas ----------
  const R = {
    pt: { t_conheca: 'CONHEÇA A LS FIRE', t_solucoes: 'SOLUÇÕES LS FIRE', t_planilha: 'PLANILHA DE PREÇOS', t_planilhaCond: 'PLANILHA DE PREÇOS E CONDIÇÕES', t_escopo: 'ESCOPO DE FORNECIMENTO', t_condicoes: 'CONDIÇÕES', t_folha: 'FOLHA DE DADOS', t_comiss: 'COMISSIONAMENTO E START-UP', t_notasSeq: 'NOTAS DESVIOS E OBSERVAÇÕES', t_notasSpv: 'NOTAS E DESVIOS', t_prazos: 'PRAZOS E CONDIÇÕES', t_docs: 'ESCOPO DE DOCUMENTOS', t_termos: 'TERMOS E CONDIÇÕES', t_contatos: 'CONTATOS',
      cliente: 'Cliente:', data: 'Data:', propNo: 'Proposta Nº:', validade: 'Validade:', capaProposta: 'PROPOSTA', capa_tc: 'TÉCNICA E COMERCIAL', capa_com: 'COMERCIAL', capa_tec: 'TÉCNICA', obraProj: 'Obra/Projeto:', aosCuid: 'Aos cuidados de:', numero: 'Número:', revisao: 'Revisão:', somos: 'SOMOS A ',
      razao: 'Razão Social:', cnpj: 'CNPJ:', projObra: 'Projeto/Obra:', cidade: 'Cidade da obra:', h_planilha: 'Planilha de preços', h_escopo: 'Escopo de fornecimento', th: ['Item', 'Código', 'Qtd.', 'Unid.', 'PIS/|COFINS', 'ICMS', 'ICMS/|ISS', 'IPI', 'NCM', 'Valor Unit.|(C/ Impostos)', 'Valor Total|(C/ Impostos)', 'Descrição breve'],
      breve: 'Descrição breve:', completa: 'Descrição completa:', condicao: 'Condição projeto:', vazaoNom: 'Vazão nominal da bomba:', escopoL: 'Escopo:', total: 'TOTAL:', h_pag: 'Condição de pagamento', nota: 'Nota:', h_prazo: 'Prazo', vide: '(Vide seção - "Prazos e condições")',
      fab: 'Fabricação: {n} dias (DAPC-Dias corridos após o Pedido de Compra)', ent: 'Entrega: {n} dias (DAE-Dias corridos após a Expedição do equipamento)', tot: 'Prazo Total: {n} dias.', combinar: 'A combinar.', h_frete: 'Frete', h_obs: 'Observações', atencao: 'ATENÇÃO: ',
      desenho: 'Desenho', item: 'Item {n}', qtd: 'Qtd', descr: 'Descrição', adicionais: 'Adicionais', hidraulicos: 'Dados hidráulicos', fdBomba: 'Folha de dados da bomba', fdMotor: 'Folha de dados do motor', espec: 'Especificações do fornecimento', curva: 'Curva da bomba', notasItem: 'Notas, desvios e observações',
      incluso: 'O que está incluso', comTit: 'Comissionamento e Start-up', servAd: 'Serviços adicionais', foraEsc: '(fora do escopo e sob consulta)', resp: 'Responsabilidades do cliente', notas: 'Notas', desvios: 'Desvios', exclusoes: 'Exclusões',
      compTit: 'Composição do Prazo Total', pFab: 'Prazo de Fabricação', pEnt: 'Prazo de entrega (CIF)', pTot: 'Prazo Total', dias: 'dias', sigla: ['Sigla', 'Significado', 'Aplica-se a'], inicio: 'Condições para início da contagem (DAPC)', susp: 'Hipóteses de suspensão do prazo',
      basePrazo: 'Base de Prazo', tipoEnt: 'Tipo de Entrega', adSob: 'Adicionais (sob consulta — solicitar à LS Fire)', disp: 'À disposição para esclarecimentos,', comCert: 'com certificação UL e FM', semCert: 'sem certificação UL e FM', diaria1: '1 diária inclusa', diariaN: '{n} diárias inclusas',
      h_parcelas: 'Parcelas de pagamento', parcPrazo: 'Todas as parcelas terão prazo de pagamento de {p}, conforme os marcos abaixo.', parcMarcos: 'Parcelas conforme os marcos abaixo.', thParc: ['Parcela', 'Marco'], h_volumes: 'Dimensões e pesos para transporte', thVol: ['Volume', 'Comprimento', 'Largura', 'Altura', 'Peso estimado'], h_opcao: 'Opção de fornecimento', opcAbat: 'A escolha desta opção resulta em um abatimento de {v} sobre o valor total da proposta.', opcAcr: 'A escolha desta opção resulta em um acréscimo de {v} sobre o valor total da proposta.', itemEsp: 'Item {ref} da especificação técnica: {t}', moeda: 'Valores em dólares americanos (US$), convertidos à taxa de R$ {taxa} por US$ 1,00{data}.', moedaData: ' de {d}', bomba: 'Bomba {n}', deratAlt: 'altitude {v} m', deratTemp: 'temperatura ambiente {v} °C', deratPar: 'de {a} HP para {b} HP', derat: 'Potência do motor diesel corrigida para as condições do local ({cond}), conforme a NFPA 20 (−3% a cada 300 m acima de 91 m e −1% a cada 5,6 °C acima de 25 °C): {pot}.' },
    en: { t_conheca: 'MEET LS FIRE', t_solucoes: 'LS FIRE SOLUTIONS', t_planilha: 'PRICE SCHEDULE', t_planilhaCond: 'PRICE SCHEDULE AND CONDITIONS', t_escopo: 'SCOPE OF SUPPLY', t_condicoes: 'CONDITIONS', t_folha: 'DATA SHEET', t_comiss: 'COMMISSIONING AND START-UP', t_notasSeq: 'NOTES, DEVIATIONS AND REMARKS', t_notasSpv: 'NOTES AND DEVIATIONS', t_prazos: 'LEAD TIMES AND CONDITIONS', t_docs: 'DOCUMENT SCOPE', t_termos: 'TERMS AND CONDITIONS', t_contatos: 'CONTACTS',
      cliente: 'Customer:', data: 'Date:', propNo: 'Proposal No.:', validade: 'Valid until:', capaProposta: 'PROPOSAL', capa_tc: 'TECHNICAL AND COMMERCIAL', capa_com: 'COMMERCIAL', capa_tec: 'TECHNICAL', obraProj: 'Project/Site:', aosCuid: 'Attention:', numero: 'Number:', revisao: 'Revision:', somos: 'WE ARE ',
      razao: 'Company name:', cnpj: 'Tax ID (CNPJ):', projObra: 'Project/Site:', cidade: 'Site city:', h_planilha: 'Price schedule', h_escopo: 'Scope of supply', th: ['Item', 'Code', 'Qty.', 'Unit', 'PIS/|COFINS', 'ICMS', 'ICMS/|ISS', 'IPI', 'NCM', 'Unit Price|(Incl. Taxes)', 'Total Price|(Incl. Taxes)', 'Short description'],
      breve: 'Short description:', completa: 'Full description:', condicao: 'Design point:', vazaoNom: 'Pump rated flow:', escopoL: 'Scope:', total: 'TOTAL:', h_pag: 'Payment terms', nota: 'Note:', h_prazo: 'Lead time', vide: '(See section "Lead times and conditions")',
      fab: 'Manufacturing: {n} days (DAPC - calendar days after the Purchase Order)', ent: 'Delivery: {n} days (DAE - calendar days after equipment shipment)', tot: 'Total lead time: {n} days.', combinar: 'To be agreed.', h_frete: 'Freight', h_obs: 'Remarks', atencao: 'ATTENTION: ',
      desenho: 'Drawing', item: 'Item {n}', qtd: 'Qty', descr: 'Description', adicionais: 'Additional items', hidraulicos: 'Hydraulic data', fdBomba: 'Pump data sheet', fdMotor: 'Driver data sheet', espec: 'Supply specifications', curva: 'Pump curve', notasItem: 'Notes, deviations and remarks',
      incluso: "What's included", comTit: 'Commissioning and Start-up', servAd: 'Additional services', foraEsc: '(out of scope, upon request)', resp: 'Customer responsibilities', notas: 'Notes', desvios: 'Deviations', exclusoes: 'Exclusions',
      compTit: 'Total Lead Time Breakdown', pFab: 'Manufacturing time', pEnt: 'Delivery time (CIF)', pTot: 'Total lead time', dias: 'days', sigla: ['Code', 'Meaning', 'Applies to'], inicio: 'Conditions to start counting (DAPC)', susp: 'Lead time suspension events',
      basePrazo: 'Lead time basis', tipoEnt: 'Delivery type', adSob: 'Additional (upon request — ask LS Fire)', disp: 'We remain at your disposal for any clarification,', comCert: 'with UL and FM certification', semCert: 'without UL and FM certification', diaria1: '1 day included', diariaN: '{n} days included',
      h_parcelas: 'Payment installments', parcPrazo: 'All installments are payable within {p}, according to the milestones below.', parcMarcos: 'Installments according to the milestones below.', thParc: ['Installment', 'Milestone'], h_volumes: 'Shipping dimensions and weights', thVol: ['Package', 'Length', 'Width', 'Height', 'Estimated weight'], h_opcao: 'Supply option', opcAbat: 'Choosing this option results in a reduction of {v} on the total proposal value.', opcAcr: 'Choosing this option results in an increase of {v} on the total proposal value.', itemEsp: 'Item {ref} of the technical specification: {t}', moeda: 'Prices in US dollars (US$), converted at R$ {taxa} per US$ 1.00{data}.', moedaData: ' on {d}', bomba: 'Pump {n}', deratAlt: 'altitude {v} m', deratTemp: 'ambient temperature {v} °C', deratPar: 'from {a} HP to {b} HP', derat: 'Diesel engine power derated for site conditions ({cond}) per NFPA 20 (−3% per 300 m above 91 m and −1% per 5.6 °C above 25 °C): {pot}.' },
    es: { t_conheca: 'CONOZCA LS FIRE', t_solucoes: 'SOLUCIONES LS FIRE', t_planilha: 'PLANILLA DE PRECIOS', t_planilhaCond: 'PLANILLA DE PRECIOS Y CONDICIONES', t_escopo: 'ALCANCE DEL SUMINISTRO', t_condicoes: 'CONDICIONES', t_folha: 'HOJA DE DATOS', t_comiss: 'COMISIONAMIENTO Y PUESTA EN MARCHA', t_notasSeq: 'NOTAS, DESVÍOS Y OBSERVACIONES', t_notasSpv: 'NOTAS Y DESVÍOS', t_prazos: 'PLAZOS Y CONDICIONES', t_docs: 'ALCANCE DE DOCUMENTOS', t_termos: 'TÉRMINOS Y CONDICIONES', t_contatos: 'CONTACTOS',
      cliente: 'Cliente:', data: 'Fecha:', propNo: 'Propuesta N.º:', validade: 'Validez:', capaProposta: 'PROPUESTA', capa_tc: 'TÉCNICA Y COMERCIAL', capa_com: 'COMERCIAL', capa_tec: 'TÉCNICA', obraProj: 'Obra/Proyecto:', aosCuid: 'A la atención de:', numero: 'Número:', revisao: 'Revisión:', somos: 'SOMOS ',
      razao: 'Razón social:', cnpj: 'CNPJ:', projObra: 'Proyecto/Obra:', cidade: 'Ciudad de la obra:', h_planilha: 'Planilla de precios', h_escopo: 'Alcance del suministro', th: ['Ítem', 'Código', 'Cant.', 'Unid.', 'PIS/|COFINS', 'ICMS', 'ICMS/|ISS', 'IPI', 'NCM', 'Valor Unit.|(C/ Impuestos)', 'Valor Total|(C/ Impuestos)', 'Descripción breve'],
      breve: 'Descripción breve:', completa: 'Descripción completa:', condicao: 'Condición de proyecto:', vazaoNom: 'Caudal nominal de la bomba:', escopoL: 'Alcance:', total: 'TOTAL:', h_pag: 'Condición de pago', nota: 'Nota:', h_prazo: 'Plazo', vide: '(Ver sección "Plazos y condiciones")',
      fab: 'Fabricación: {n} días (DAPC - días corridos tras la Orden de Compra)', ent: 'Entrega: {n} días (DAE - días corridos tras la expedición del equipo)', tot: 'Plazo total: {n} días.', combinar: 'A convenir.', h_frete: 'Flete', h_obs: 'Observaciones', atencao: 'ATENCIÓN: ',
      desenho: 'Plano', item: 'Ítem {n}', qtd: 'Cant.', descr: 'Descripción', adicionais: 'Adicionales', hidraulicos: 'Datos hidráulicos', fdBomba: 'Hoja de datos de la bomba', fdMotor: 'Hoja de datos del motor', espec: 'Especificaciones del suministro', curva: 'Curva de la bomba', notasItem: 'Notas, desvíos y observaciones',
      incluso: 'Qué está incluido', comTit: 'Comisionamiento y puesta en marcha', servAd: 'Servicios adicionales', foraEsc: '(fuera del alcance y bajo consulta)', resp: 'Responsabilidades del cliente', notas: 'Notas', desvios: 'Desvíos', exclusoes: 'Exclusiones',
      compTit: 'Composición del Plazo Total', pFab: 'Plazo de fabricación', pEnt: 'Plazo de entrega (CIF)', pTot: 'Plazo total', dias: 'días', sigla: ['Sigla', 'Significado', 'Se aplica a'], inicio: 'Condiciones para el inicio del conteo (DAPC)', susp: 'Hipótesis de suspensión del plazo',
      basePrazo: 'Base del plazo', tipoEnt: 'Tipo de entrega', adSob: 'Adicionales (bajo consulta — solicitar a LS Fire)', disp: 'Quedamos a su disposición para cualquier aclaración,', comCert: 'con certificación UL y FM', semCert: 'sin certificación UL y FM', diaria1: '1 jornada incluida', diariaN: '{n} jornadas incluidas',
      h_parcelas: 'Cuotas de pago', parcPrazo: 'Todas las cuotas tendrán plazo de pago de {p}, según los hitos abajo.', parcMarcos: 'Cuotas según los hitos abajo.', thParc: ['Cuota', 'Hito'], h_volumes: 'Dimensiones y pesos para transporte', thVol: ['Bulto', 'Largo', 'Ancho', 'Alto', 'Peso estimado'], h_opcao: 'Opción de suministro', opcAbat: 'La elección de esta opción resulta en una reducción de {v} sobre el valor total de la propuesta.', opcAcr: 'La elección de esta opción resulta en un aumento de {v} sobre el valor total de la propuesta.', itemEsp: 'Ítem {ref} de la especificación técnica: {t}', moeda: 'Valores en dólares estadounidenses (US$), convertidos a R$ {taxa} por US$ 1,00{data}.', moedaData: ' del {d}', bomba: 'Bomba {n}', deratAlt: 'altitud {v} m', deratTemp: 'temperatura ambiente {v} °C', deratPar: 'de {a} HP a {b} HP', derat: 'Potencia del motor diésel corregida para las condiciones del sitio ({cond}), según la NFPA 20 (−3% cada 300 m por encima de 91 m y −1% cada 5,6 °C por encima de 25 °C): {pot}.' },
  };
  // folha de dados: títulos (@chave), rótulos e valores (#chave) que o app manda já classificados
  const FD = {
    pt: { pintura: 'Pintura especial', testes: 'Testes e ensaios', documentos: 'Documentos e desenhos', pNorma: 'Especificação / padrão', pPreparo: 'Preparação de superfície', pSistema: 'Esquema de pintura', pAcab: 'Pintura final', pCor: 'Cor', pEsp: 'Espessura total (película seca)', tQuais: 'Incluídos', tNorma: 'Norma / procedimento', tTest: 'Testemunho do cliente', tEntrega: 'Entregáveis', dQuais: 'Incluídos', dAprov: 'Aprovação do cliente', dFormato: 'Idioma e formato', obs: 'Observações', motorDiesel: 'Motor Diesel', motorEletrico: 'Motor Elétrico', bombaCent: 'Bomba Centrífuga', motobomba: 'Motobomba', jockey: 'Bomba Jockey', tanque: 'Tanque de combustível diesel', silencioso: 'Silencioso / escapamento', baterias: 'Baterias', chave: 'Chave de partida', painel: 'Painel de comando', painelDiesel: 'Painel de comando do conjunto diesel', sensores: 'Sensores', preaq: 'Kit de pré-aquecimento', pressostato: 'Pressostato', manovac: 'Manovacuômetro', cabecote: 'Cabeçote', manometro: 'Manômetro', recirc: 'Kit de recirculação', acessTanque: 'Acessórios do tanque', valvAlivio: 'Válvula de alívio', cone: 'Cone de descarga', medidor: 'Medidor de vazão', barrSuc: 'Barrilete de sucção', barrRec: 'Barrilete de recalque', valvAr: 'Kit válvula de ar', acoplamento: 'Acoplamento', painelLocal: 'Painel local', trocadorT: 'Trocador de calor', vGaveta: 'Válvula gaveta', vBorb: 'Válvula borboleta', vRet: 'Válvula de retenção',
      tipo: 'Tipo', marca: 'Marca', modelo: 'Modelo', potencia: 'Potência', cilindros: 'Cilindros', resfr: 'Resfriamento', injecao: 'Injeção', polos: 'Número de polos', ip: 'Grau de proteção', tensao: 'Tensão cont.', descricao: 'Descrição', vazaoNom: 'Vazão nominal', vazaoProj: 'Vazão de projeto', pressao: 'Pressão diferencial', rotacao: 'Rotação',
      radiador: 'Radiador', trocador: 'Trocador de calor', mecanica: 'Mecânica', eletronica: 'Eletrônica', endsuction: 'Mancalizada (end-suction)', splitcase: 'Bipartida (split case)', monobloco: 'Monobloco', inline: 'In-line', vertical: 'Turbina vertical', diesel: 'diesel', eletrica: 'elétrica', jockeyA: 'jockey' },
    en: { pintura: 'Special painting', testes: 'Tests and inspections', documentos: 'Documents and drawings', pNorma: 'Specification / standard', pPreparo: 'Surface preparation', pSistema: 'Paint system', pAcab: 'Finish coat', pCor: 'Color', pEsp: 'Total dry film thickness', tQuais: 'Included', tNorma: 'Standard / procedure', tTest: 'Client witness', tEntrega: 'Deliverables', dQuais: 'Included', dAprov: 'Client approval', dFormato: 'Language and format', obs: 'Remarks', motorDiesel: 'Diesel Engine', motorEletrico: 'Electric Motor', bombaCent: 'Centrifugal Pump', motobomba: 'Pump set', jockey: 'Jockey Pump', tanque: 'Diesel fuel tank', silencioso: 'Silencer / exhaust', baterias: 'Batteries', chave: 'Starting switch', painel: 'Controller', painelDiesel: 'Diesel pump controller', sensores: 'Sensors', preaq: 'Pre-heating kit', pressostato: 'Pressure switch', manovac: 'Compound gauge', cabecote: 'Header', manometro: 'Pressure gauge', recirc: 'Recirculation kit', acessTanque: 'Tank accessories', valvAlivio: 'Relief valve', cone: 'Waste cone', medidor: 'Flow meter', barrSuc: 'Suction header', barrRec: 'Discharge header', valvAr: 'Air release valve kit', acoplamento: 'Coupling', painelLocal: 'Local panel', trocadorT: 'Heat exchanger', vGaveta: 'Gate valve', vBorb: 'Butterfly valve', vRet: 'Check valve',
      tipo: 'Type', marca: 'Brand', modelo: 'Model', potencia: 'Power', cilindros: 'Cylinders', resfr: 'Cooling', injecao: 'Injection', polos: 'Number of poles', ip: 'Protection degree', tensao: 'Control voltage', descricao: 'Description', vazaoNom: 'Rated flow', vazaoProj: 'Design flow', pressao: 'Differential pressure', rotacao: 'Speed',
      radiador: 'Radiator', trocador: 'Heat exchanger', mecanica: 'Mechanical', eletronica: 'Electronic', endsuction: 'End suction', splitcase: 'Split case', monobloco: 'Close-coupled', inline: 'In-line', vertical: 'Vertical turbine', diesel: 'diesel', eletrica: 'electric', jockeyA: 'jockey' },
    es: { pintura: 'Pintura especial', testes: 'Pruebas y ensayos', documentos: 'Documentos y planos', pNorma: 'Especificación / estándar', pPreparo: 'Preparación de superficie', pSistema: 'Esquema de pintura', pAcab: 'Pintura final', pCor: 'Color', pEsp: 'Espesor total (película seca)', tQuais: 'Incluidos', tNorma: 'Norma / procedimiento', tTest: 'Atestiguamiento del cliente', tEntrega: 'Entregables', dQuais: 'Incluidos', dAprov: 'Aprobación del cliente', dFormato: 'Idioma y formato', obs: 'Observaciones', motorDiesel: 'Motor Diésel', motorEletrico: 'Motor Eléctrico', bombaCent: 'Bomba Centrífuga', motobomba: 'Motobomba', jockey: 'Bomba Jockey', tanque: 'Tanque de combustible diésel', silencioso: 'Silenciador / escape', baterias: 'Baterías', chave: 'Llave de arranque', painel: 'Tablero de control', painelDiesel: 'Tablero de control del conjunto diésel', sensores: 'Sensores', preaq: 'Kit de precalentamiento', pressostato: 'Presostato', manovac: 'Manovacuómetro', cabecote: 'Cabezal', manometro: 'Manómetro', recirc: 'Kit de recirculación', acessTanque: 'Accesorios del tanque', valvAlivio: 'Válvula de alivio', cone: 'Cono de descarga', medidor: 'Medidor de caudal', barrSuc: 'Colector de succión', barrRec: 'Colector de descarga', valvAr: 'Kit válvula de aire', acoplamento: 'Acoplamiento', painelLocal: 'Panel local', trocadorT: 'Intercambiador de calor', vGaveta: 'Válvula compuerta', vBorb: 'Válvula mariposa', vRet: 'Válvula de retención',
      tipo: 'Tipo', marca: 'Marca', modelo: 'Modelo', potencia: 'Potencia', cilindros: 'Cilindros', resfr: 'Refrigeración', injecao: 'Inyección', polos: 'Número de polos', ip: 'Grado de protección', tensao: 'Tensión de control', descricao: 'Descripción', vazaoNom: 'Caudal nominal', vazaoProj: 'Caudal de proyecto', pressao: 'Presión diferencial', rotacao: 'Rotación',
      radiador: 'Radiador', trocador: 'Intercambiador de calor', mecanica: 'Mecánica', eletronica: 'Electrónica', endsuction: 'De succión axial (end-suction)', splitcase: 'Bipartida (split case)', monobloco: 'Monobloque', inline: 'En línea', vertical: 'Turbina vertical', diesel: 'diésel', eletrica: 'eléctrica', jockeyA: 'jockey' },
  };
  const LOC = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

  // ---------- textos do modelo (no idioma pedido) ----------
  // ordem: texto original (pt) → tradução que vem com o app → o que foi salvo no Modelo da proposta para aquele idioma
  function modelo(REG, lang) {
    const base = window.PRICER_PROPOSTA_TEXTOS || {};
    const salvo = (((REG && REG.tabelas) || {}).PROPOSTA_MODELO || {}).m || {};
    const pt = Object.assign({}, base, salvo); delete pt.i18n;
    pt.layout = salvo.layout || LAYOUT; pt.imagens = salvo.imagens || {};
    if (!lang || lang === 'pt') return Object.assign(pt, { lang: 'pt' });
    const tr = ((base.i18n || {})[lang]) || {}; const tsv = ((salvo.i18n || {})[lang]) || {};
    const out = Object.assign({}, pt, tr, tsv, { lang, layout: pt.layout, imagens: pt.imagens, contatos: pt.contatos, rodape: pt.rodape });
    if (!tr.termos && !tsv.termos) out.termos = pt.termos;
    return out;
  }
  // linhas com condição entre colchetes: só entram quando a proposta atende
  const RE_DERAT = /perda de potência por altitude|power derating due to altitude|pérdida de potencia por altitud/i;
  function aplica(lista, f, lang) {
    const r = R[lang || 'pt'] || R.pt; const out = [];
    for (const raw of lista || []) {
      let x = String(raw || '').trim(); if (!x) continue;
      const m = x.match(/^\[([^\]]+)\]\s*/); let ok = true;
      if (m) {
        x = x.slice(m[0].length);
        for (const t0 of m[1].split(',')) {
          const t = t0.trim().toLowerCase();
          const v = { diesel: f.diesel, eletrica: f.eletrica, 'start-up': f.startup, 'sem start-up': !f.startup, contrato: f.contrato, 'sem contrato': !f.contrato, campo: f.campo, fabrica: f.fabrica, pecas: f.pecas }[t];
          if (v === false) ok = false;
        }
      }
      if (!ok) continue;
      // perda de potência do diesel (NFPA 20): com altitude/temperatura informadas, sai o cálculo; sem elas, a frase genérica não entra
      if (RE_DERAT.test(x)) { if (!(f.derating || []).length) continue; const n0 = new Intl.NumberFormat(LOC[lang] || 'pt-BR', { maximumFractionDigits: 0 });
        const cond = [f.altitude !== '' && f.altitude !== undefined ? r.deratAlt.replace('{v}', n0.format(f.altitude)) : '', f.temperatura !== '' && f.temperatura !== undefined ? r.deratTemp.replace('{v}', n0.format(f.temperatura)) : ''].filter(Boolean).join(', ');
        x = r.derat.replace('{cond}', cond).replace('{pot}', f.derating.map(([a, b]) => r.deratPar.replace('{a}', n0.format(a)).replace('{b}', n0.format(b))).join('; ')); }
      x = x.replace(/\{norma\}/g, f.normaTxt || 'NFPA 20').replace(/\{certificacao\}/g, f.ulfm ? r.comCert : r.semCert)
        .replace(/\{meses\}/g, f.meses || '—').replace(/\{visitas\}/g, f.visitas || '—')
        .replace(/\{diarias\}/g, f.diarias > 1 ? r.diariaN.replace('{n}', f.diarias) : r.diaria1);
      out.push(x);
    }
    return out;
  }
  const normaTxt = (n) => { const s = String(n || '').toUpperCase(); if (/NBR\s*16704/.test(s)) return 'ABNT NBR 16704'; if (/NBR\s*13714/.test(s)) return 'ABNT NBR 13714'; return 'NFPA 20'; };
  const dataBR = (s) => { if (!s) return ''; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[3] + '/' + m[2] + '/' + m[1]; return String(s).replace(/^até\s+/i, '').trim(); };
  function dataLang(s, lang) { const b = dataBR(s); if (lang !== 'en') return b; const m = b.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[2] + '/' + m[1] + '/' + m[3] : b; }

  // seções que entram no documento: o modelo define por tipo; a proposta pode ligar ou desligar
  function secoes(D, pc, M, tipoDoc) {
    const L = M.layout || LAYOUT; const ordem = (L.ordem || LAYOUT.ordem).filter((k) => SECOES.some((s) => s[0] === k)).concat(LAYOUT.ordem.filter((k) => !(L.ordem || []).includes(k)));
    const base = Object.assign({}, LAYOUT.tipos[tipoDoc], (L.tipos || {})[tipoDoc] || {}); const own = ((pc.secoes || {})[tipoDoc]) || {};
    const f = D.flags || {};
    return ordem.filter((k) => (k === 'capa' || k === 'planilha' || (own[k] ?? base[k])) && !(D.tipo !== 'SEQ' && SO_SEQ.has(k)) && !(k === 'comiss' && !f.startup) && !(k === 'condicoes' && tipoDoc === 'tec' && !(own[k] ?? base[k])));
  }

  // ---------- valores efetivos: cabeçalho vem da proposta (Dados gerais/itens); textos do documento podem ser ajustados ----------
  function efetivo(D, pc, M, lang) {
    pc = pc || {}; lang = lang || pc.idioma || 'pt';
    const v = (k, d) => (Object.prototype.hasOwnProperty.call(pc, k) ? pc[k] : d);
    const vt = v; // texto ajustado na proposta fica em português; nos outros idiomas o PDF o traduz (ajustados)
    const f = D.flags || {};
    const servico = D.tipo === 'SPV' && !f.soPecas; const pecas = D.tipo === 'SPV' && f.pecas;
    const notasPad = D.tipo === 'SEQ' ? aplica(M.notasSeq, f, lang) : D.tipo === 'FACTS' ? aplica(((window.PRICER_PROPOSTA_TEXTOS || {}).notasSeq || []).map((x, i) => (/garantia padrão|Qualquer item não descrito|prazo de entrega passa/.test(x) ? (M.notasSeq || [])[i] : null)).filter(Boolean), f, lang) : [].concat(servico ? aplica(M.notasServico, f, lang) : [], pecas ? (M.pecas || {}).notas || [] : []);
    const desviosPad = pecas && !servico ? ((M.pecas || {}).desvios || []) : [];
    const exclPad = [].concat(linhasDe(D.exclusoes), pecas && !servico ? ((M.pecas || {}).exclusoes || []) : []);
    const obsPad = servico ? (M.observacoesServico || []) : [];
    const contatosPad = (M.contatos || []).filter((c) => c.sempre || (D.vendedor && norm(c.nome) === norm(D.vendedor))).map((c) => c.nome);
    const ajustado = (k) => Object.prototype.hasOwnProperty.call(pc, k);
    return {
      cliente: v('clienteCurto', '') || D.cliente || '', razao: D.razao || D.cliente || '', cnpj: D.cnpj || '', aosCuidados: v('aosCuidados', '') || D.contato || '',
      obra: D.obra || '', cidade: v('cidade', '') || D.cidade || '', pagamento: D.pagamento || '', frete: D.frete || '',
      prazoFab: v('prazoFab', ''), prazoEnt: v('prazoEnt', ''), prazoTexto: v('prazoTexto', '') || D.prazo || '',
      observacoes: vt('observacoes', obsPad.join('\n')), notas: vt('notas', notasPad.join('\n')), desvios: [vt('desvios', desviosPad.join('\n'))].concat((pc.desviosEsp || []).filter((d) => d && d.texto).map((d) => (R[lang] || R.pt).itemEsp.replace('{ref}', d.ref || '—').replace('{t}', d.texto))).filter(Boolean).join('\n'), exclusoes: vt('exclusoes', exclPad.join('\n')),
      ajustados: { observacoes: ajustado('observacoes'), notas: ajustado('notas'), desvios: ajustado('desvios'), exclusoes: ajustado('exclusoes') },
      parcelas: (pc.parcelas || []).filter((q) => q && (q.pct || q.marco)), parcelasPrazo: pc.parcelasPrazo || '', volumes: (pc.volumes || []).filter((q) => q && q.nome), opcoes: (pc.opcoes || []).filter((q) => q && (q.titulo || q.texto)),
      codigos: Object.assign({}, pc.codigos || {}), notasItem: Object.assign({}, pc.notasItem || {}), contatos: v('contatos', contatosPad),
    };
  }
  // textos da proposta que não vêm traduzidos com o modelo (descrições, pagamento, frete, notas ajustadas…)
  function dinamicos(D, pc) {
    const out = new Set(); const add = (s) => { s = String(s || '').trim(); if (s && /[A-Za-zÀ-ú]{3}/.test(s)) out.add(s); };
    const E = efetivo(D, pc, modeloVazio(), 'pt');
    [D.obra, D.pagamento, D.frete, E.prazoTexto].forEach(add); (pc.parcelas || []).forEach((q) => add(q && q.marco)); (pc.opcoes || []).forEach((q) => { if (q) { add(q.titulo); String(q.texto || '').split('\n').forEach(add); } }); (pc.desviosEsp || []).forEach((q) => add(q && q.texto)); add(pc.parcelasPrazo);
    for (const k of ['observacoes', 'notas', 'desvios', 'exclusoes']) if (E.ajustados[k]) linhasDe(pc[k]).forEach(add);
    linhasDe(D.exclusoes).forEach(add);
    for (const it of D.itens || []) { add(it.completa); if (D.tipo !== 'SEQ') add(it.breve); (it.escopo || []).forEach(add); linhasDe((pc.notasItem || {})[it.key]).forEach(add); for (const g of it.espec || []) for (const l of g.linhas || []) add(l[1]); for (const g of it.escopoG || []) for (const c of g.itens || []) for (const l of c.sub || []) add(/^#/.test(l) ? l.split('|').slice(1).join('|') : l); }
    return [...out];
  }
  const modeloVazio = () => ({ notasSeq: [], notasServico: [], observacoesServico: [], pecas: {}, contatos: [] });

  // ---------- PDF ----------
  // O = { tipo: 'tc'|'com'|'tec', lang: 'pt'|'en'|'es', moeda: { cod: 'BRL'|'USD', taxa, data }, img: { slot: dataURL }, curvas: { item: dataURL }, tr: (texto) => tradução }
  async function montar(D, pc, M, O) {
    O = Object.assign({ tipo: 'tc', lang: 'pt', moeda: { cod: 'BRL' }, img: {}, curvas: {}, tr: (s) => s }, O || {});
    const lang = O.lang, r = R[lang] || R.pt, fdl = FD[lang] || FD.pt, tr = (s) => (lang === 'pt' || !s ? s : O.tr(s) || s);
    const jsPDF = await lib();
    const AS = window.PRICER_PROPOSTA_ASSETS; if (!AS) throw new Error('Imagens e fontes da proposta não encontradas no app.');
    const E = efetivo(D, pc, M, lang); const f = D.flags || {}; const SEC = secoes(D, pc, M, O.tipo); const tem = (k) => SEC.includes(k);
    const comPreco = O.tipo !== 'tec';
    const nf = (d) => new Intl.NumberFormat(LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
    const usd = O.moeda && O.moeda.cod === 'USD' && Number(O.moeda.taxa) > 0;
    const din = (v) => (usd ? 'US$ ' : 'R$ ') + nf(2).format(typeof v === 'number' && isFinite(v) ? (usd ? v / Number(O.moeda.taxa) : v) : 0);
    const pct = (v) => (typeof v === 'number' && isFinite(v) ? nf(2).format(v * 100) + '%' : '—');
    const qtdTxt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : nf(2).format(v)) : String(v || ''));
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const add = (file, fam, st) => { doc.addFileToVFS(file + '.ttf', AS.fontes[file]); doc.addFont(file + '.ttf', fam, st); };
    add('RobotoMono-Regular', MONO, 'normal'); add('RobotoMono-Bold', MONO, 'bold'); add('Montserrat-Regular', MONT, 'normal'); add('Montserrat-Italic', MONT, 'italic'); add('Montserrat-SemiBold', MONT, 'bold'); add('Montserrat-BoldItalic', MONT, 'bolditalic');
    const props = {}; const fmtImg = (src) => (/^data:image\/png/.test(src) ? 'PNG' : 'JPEG');
    // imagem do modelo: a do app ou a trocada no Modelo da proposta, com tamanho, alinhamento e deslocamento escolhidos lá
    function colocar(k, x, y, w, h, o = {}) {
      const c = (M.imagens || {})[k] || {}; const trocada = O.img && O.img[k]; const src = trocada || AS.img[k]; if (!src) return 0;
      if (!props[k]) props[k] = doc.getImageProperties(src); const p = props[k];
      const s = Math.max(0.2, Math.min(2, (Number(c.larg) || 100) / 100));
      let w2 = w * s, h2 = (h && !trocada && s === 1) ? h : w2 * p.height / p.width;
      if (o.hmax && h2 > o.hmax) { h2 = o.hmax; w2 = h2 * p.width / p.height; }
      const banda = (SLOTS.find((z) => z[0] === k) || [0, 0, [x, x + w]])[2];
      const x2 = c.al === 'e' ? banda[0] : c.al === 'd' ? banda[1] - w2 : c.al === 'c' ? (banda[0] + banda[1] - w2) / 2 : x + (w - w2) / 2;
      const dy = Number(c.dy) || 0;
      doc.addImage(src, fmtImg(src), x2, y + dy, w2, h2, 'img_' + k, 'FAST'); return h2 + dy;
    }
    const F = (fam, st, sz, cor) => { doc.setFont(fam, st || 'normal'); doc.setFontSize(sz); doc.setTextColor(...(cor || [0, 0, 0])); };
    const T = (s, x, y, o) => doc.text(limpa(s), x, y, o);
    const W = (s) => doc.getTextWidth(limpa(s));
    const quebra = (s, w) => doc.splitTextToSize(limpa(s), w);
    const numero = D.numero ? D.numero + (D.rev !== '' && D.rev != null ? '-Rev.' + D.rev : '') : 'sem número';
    const validade = dataLang(D.validade, lang);
    let y = TOPO, titulo = null, paginas = 0;

    function rotVal(rot, val, x, yy, sz, dir) {
      F(MONO, 'normal', sz); const a = W(rot + ' '); F(MONO, 'bold', sz); const b = W(val);
      const x0 = dir ? x - a - b : x;
      F(MONO, 'normal', sz); T(rot + ' ', x0, yy); F(MONO, 'bold', sz); T(val, x0 + a, yy);
    }
    function cabecalho(tit) {
      colocar('logo-cab', 2.1, 2.5, 28);
      const partes = String(tit).split(/(LS FIRE)/).filter(Boolean); F(MONO, 'normal', 12);
      let x = 198.1 - partes.reduce((t, p) => t + W(p), 0);
      for (const p of partes) { doc.setTextColor(...(p === 'LS FIRE' ? TIT : [0, 0, 0])); T(p, x, 9.2); x += W(p); }
      rotVal(r.cliente, E.cliente || '—', 13.1, 25.2, 9.1); rotVal(r.data, dataLang(D.data, lang) || '—', 196.7, 25.2, 9.1, true);
      rotVal(r.propNo, numero, 13.1, 32, 9.1); rotVal(r.validade, validade || '—', 196.7, 32, 9.1, true);
      doc.setFillColor(...LAR); doc.rect(X0, 34.4, LW, 0.25, 'F');
      doc.rect(X0, 277, LW, 0.25, 'F'); F(MONO, 'normal', 9.1, CINZA); T(M.rodape || '', 105, 290.6, { align: 'center' });
    }
    function pagina(tit) { if (paginas++) doc.addPage(); titulo = tit; cabecalho(tit); y = TOPO; }
    function precisa(h) { if (y + h > LIM) { pagina(titulo); return true; } return false; }
    function titulo2(s, sub) { precisa(14); F(MONT, 'normal', 13.4, TIT); T(s, X0, y + 4.6); if (sub) { const w = W(s + ' '); F(MONT, 'normal', 10.6, TIT); T(sub, X0 + w, y + 4.6); } y += 8.2; }
    function linhaJust(s, x, yy, w, just) {
      s = limpa(s); if (!just) { T(s, x, yy); return; }
      const ws = s.split(' ').filter(Boolean); if (ws.length < 2) { T(s, x, yy); return; }
      const tot = ws.reduce((t, p) => t + W(p), 0); const gap = (w - tot) / (ws.length - 1); if (gap > 4 * W(' ') + 2) { T(s, x, yy); return; }
      let xx = x; for (const p of ws) { T(p, xx, yy); xx += W(p) + gap; }
    }
    function paragrafo(s, o = {}) {
      const sz = o.sz || 9.1, lh = o.lh || sz * 0.52, x = o.x ?? X0, w = o.w ?? LW;
      F(o.fam || MONO, o.st || 'normal', sz, o.cor); const L = quebra(s, w);
      L.forEach((l, i) => { if (precisa(lh)) F(o.fam || MONO, o.st || 'normal', sz, o.cor); linhaJust(l, x, y + lh * 0.78, w, o.just && i < L.length - 1); y += lh; });
      y += o.depois ?? 1.6;
    }
    function marcadores(lista, o = {}) {
      const sz = o.sz || 8.2, lh = o.lh || sz * 0.5, x = (o.x ?? X0) + 4, w = (o.w ?? LW) - 4;
      for (const it of lista) { F(MONO, 'normal', sz, o.cor); const L = quebra(it, w); if (precisa(lh * Math.min(L.length, 2))) F(MONO, 'normal', sz, o.cor); T('•', x - 3.6, y + lh * 0.78); L.forEach((l) => { if (precisa(lh)) F(MONO, 'normal', sz, o.cor); linhaJust(l, x, y + lh * 0.78, w, false); y += lh; }); y += o.gap ?? 0.6; }
    }
    // tabela simples (cabeçalho escuro, linhas com borda): parcelas e volumes
    function tabelaS(cab, linhas, larg, al) {
      const xs = [X0]; for (const w of larg) xs.push(xs[xs.length - 1] + w); const ax = (i) => (al[i] === 'r' ? xs[i + 1] - 1.4 : al[i] === 'c' ? (xs[i] + xs[i + 1]) / 2 : xs[i] + 1.4); const an = (i) => (al[i] === 'r' ? 'right' : al[i] === 'c' ? 'center' : 'left');
      const hdr = () => { precisa(12); doc.setFillColor(...ESC); doc.rect(X0, y, xs[xs.length - 1] - X0, 6, 'F'); F(MONO, 'bold', 7.8, [255, 255, 255]); cab.forEach((t, i) => T(t, ax(i), y + 4, { align: an(i) })); y += 6; };
      hdr();
      for (const ln of linhas) { F(MONO, 'normal', 8.2); const cel = ln.map((t, i) => quebra(String(t ?? ''), larg[i] - 2.8)); const h = Math.max(...cel.map((q) => q.length)) * 3.7 + 2.2;
        if (y + h > LIM) { pagina(titulo); hdr(); }
        doc.setDrawColor(...BORDA); doc.setLineWidth(0.2); doc.rect(X0, y, xs[xs.length - 1] - X0, h); for (let c = 1; c < xs.length - 1; c++) doc.line(xs[c], y, xs[c], y + h);
        F(MONO, 'normal', 8.2); cel.forEach((q, i) => q.forEach((t, k) => T(t, ax(i), y + 3.9 + k * 3.7, { align: an(i) }))); y += h; }
      y += 4;
    }
    // condições do documento comercial: parcelas por marco, volumes para transporte e opções de fornecimento
    function extrasComerciais() {
      if (!comPreco) return; const n0 = (v) => (typeof v === 'number' ? new Intl.NumberFormat(LOC[lang], { maximumFractionDigits: 2 }).format(v) : String(v || ''));
      if (E.parcelas.length) { titulo2(r.h_parcelas); paragrafo(E.parcelasPrazo ? r.parcPrazo.replace('{p}', tr(E.parcelasPrazo)) : r.parcMarcos, { depois: 1.6 });
        tabelaS(r.thParc, E.parcelas.map((q) => [n0(q.pct) + '%', tr(q.marco || '')]), [30, LW - 30], ['c', 'l']); }
      if (E.volumes.length) { titulo2(r.h_volumes); tabelaS(r.thVol, E.volumes.map((q) => [tr(q.nome), q.c ? n0(q.c) + ' mm' : '—', q.l ? n0(q.l) + ' mm' : '—', q.a ? n0(q.a) + ' mm' : '—', q.peso ? n0(q.peso) + ' kg' : '—']), [LW - 4 * 37, 37, 37, 37, 37], ['l', 'c', 'c', 'c', 'c']); }
      for (const op of E.opcoes) { titulo2((r.h_opcao + (op.titulo ? ' — ' + tr(op.titulo) : '')).toUpperCase().slice(0, 90));
        for (const l of linhasDe(op.texto)) paragrafo(tr(l), { just: true, depois: 0.8 });
        if (typeof op.valor === 'number' && op.valor) paragrafo((op.valor < 0 ? r.opcAbat : r.opcAcr).replace('{v}', din(Math.abs(op.valor))), { st: 'bold', depois: 3 }); }
    }
    function atencao() {
      precisa(16); y += 2; doc.setFillColor(...ATN); doc.rect(X0, y, LW, 10.9, 'F'); doc.setFillColor(...ATN2); doc.rect(11.6, y, 1.5, 10.9, 'F');
      const a = (M.atencao || [])[0] || '', b = (M.atencao || [])[1] || '';
      F(MONO, 'bold', 8.2, [255, 255, 255]); const wA = W(r.atencao); F(MONO, 'normal', 8.2, [255, 255, 255]); const wa = W(a);
      const x = 105 - (wA + wa) / 2; F(MONO, 'bold', 8.2, [255, 255, 255]); T(r.atencao, x, y + 3.9); F(MONO, 'normal', 8.2, [255, 255, 255]); T(a, x + wA, y + 3.9);
      T(b, 105, y + 8.8, { align: 'center' }); y += 14;
    }
    function separador(yy) { doc.setFillColor(...LAR); doc.rect(X0, yy, LW, 0.25, 'F'); }
    function caixa(desenhar, o = {}) {
      let y0 = y; const pad = o.pad ?? 1.2; y += pad;
      const fecha = () => { doc.setDrawColor(...(o.borda || BORDA)); doc.setLineWidth(0.25); doc.rect(X0, y0, LW, y - y0 + pad); };
      const orig = precisa;
      precisa = (h) => { if (y + h > LIM) { fecha(); pagina(titulo); y0 = y; y += pad; return true; } return false; };
      try { desenhar(); } finally { precisa = orig; }
      fecha(); y += pad;
    }
    function faixa(s, o = {}) { precisa(o.h || 12); doc.setFillColor(...(o.cor || LAR2)); doc.rect(X0, y, LW, 5.6, 'F'); F(o.fam || MONO, o.st || 'normal', o.sz || 8.2, [255, 255, 255]); T(s, X0 + 1.6, y + 3.9); y += 5.6; }
    function kv(pares) { for (const [rt, v] of pares) if (v) { precisa(5); rotVal(rt, v, X0, y + 3.3, 9.1); y += 4.9; } y += 2; }
    const numL = (s) => (lang !== 'en' || typeof s !== 'string' ? s : s.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+,\d+\b/g, (m) => m.replace(/\./g, '\u0000').replace(',', '.').replace(/\u0000/g, ',')));
    const fdT = (s) => (typeof s === 'string' && s[0] === '@' ? fdl[s.slice(1)] || FD.pt[s.slice(1)] || s.slice(1) : s);
    const fdV = (s) => (typeof s === 'string' && s[0] === '#' ? fdl[s.slice(1)] || FD.pt[s.slice(1)] || s.slice(1) : s);
    const juntas = D.tipo !== 'SEQ';

    const desenhar = {
      capa() {
        paginas = 1;
        colocar(D.tipo === 'SPV' ? 'capa-spv' : 'capa-seq', 0, 0, 209.9, 224.9);
        F(MONT, 'normal', 12); T(r.capaProposta, X0, 246); { let sz = 21.1; F(MONT, 'italic', sz); while (sz > 12 && W(r['capa_' + O.tipo]) > 126.9 - X0 - 4) { sz -= 0.5; F(MONT, 'italic', sz); } T(r['capa_' + O.tipo], X0, 257); }
        colocar('selos', 126.9, 238.0, 70.6, 21.2);
        doc.setFillColor(...LAR); doc.rect(X0, 264.5, LW, 0.3, 'F');
        F(MONO, 'normal', 8.2); T(r.cliente, X0, 274.6); F(MONO, 'bold', 8.2); T(quebra(E.cliente || '—', 100)[0], X0, 280.4);
        F(MONO, 'normal', 8.2); T(r.obraProj, X0, 286); F(MONO, 'bold', 8.2); T(quebra(tr(E.obra) || '—', 100)[0], X0, 291.3);
        rotVal(r.aosCuid, E.aosCuidados || '—', X1, 275, 8.2, true); rotVal(r.validade, validade || '—', X1, 280.6, 8.2, true);
        rotVal(r.numero, D.numero || '—', X1, 286, 8.2, true); rotVal(r.revisao, String(D.rev ?? ''), X1, 291.4, 8.2, true);
      },
      conheca() {
        pagina(r.t_conheca);
        F(MONT, 'normal', 13.4); T(r.somos, X0, 45.6); const ws = W(r.somos); F(MONT, 'normal', 13.4, TIT); T('LS FIRE', X0 + ws, 45.6); y = 53;
        for (const p of M.somos || []) paragrafo(p, { sz: 10.6, lh: 5.67, just: true, depois: 5.3 });
        colocar(D.tipo === 'SPV' ? 'conheca-spv' : 'conheca-seq', X0, y + 6, LW, 0, { hmax: LIM - (y + 6) });
      },
      solucoes() {
        if (!(M.solucoes || []).length) return;
        pagina(r.t_solucoes); y = 41;
        (M.solucoes || []).forEach((s, i) => {
          if (i) { separador(y + 2); y += 3.5; }
          const y0 = y; const h = colocar(s.img, 14.1, y0 + 4.5, 92.5);
          F(MONO, 'normal', 12, LAR); T(s.t, 109, y0 + 4.6); y = y0 + 6.6;
          paragrafo(s.x, { sz: 10.6, lh: 5.67, x: 109, w: 87.8, just: true, depois: 0 });
          y = Math.max(y, y0 + 4.5 + h) + 2;
        });
      },
      planilha() {
        pagina(!comPreco ? r.t_escopo : juntas && tem('condicoes') ? r.t_planilhaCond : r.t_planilha);
        kv(juntas || E.razao !== E.cliente || E.cnpj || E.cidade ? [[r.razao, E.razao], [r.cnpj, E.cnpj], [r.aosCuid, E.aosCuidados], [r.projObra, tr(E.obra)], [r.cidade, E.cidade]] : [[r.projObra, tr(E.obra)], [r.aosCuid, E.aosCuidados]]);
        y += 2; titulo2(comPreco ? r.h_planilha : r.h_escopo); y += 1;
        const th = r.th;
        const COL = comPreco ? [12.4, 21.2, 39.3, 49.5, 61.0, 74.4, 87.9, 101.3, 122.8, 160.2, 197.4] : [12.4, 23.4, 48, 163, 178.5, 197.4];
        const CAB = comPreco ? [th[0], th[1], th[2], th[3], th[4], D.tipo === 'SPV' ? th[6] : th[5], th[7], th[8], th[9], th[10]] : [th[0], th[1], th[11], th[2], th[3]];
        D.itens.forEach((it, i) => {
          precisa(9.2 + 6.2 + 14);
          const nC = COL.length - 1;
          doc.setFillColor(...ESC); doc.rect(COL[0], y, COL[nC] - COL[0], 9.2, 'F'); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.25);
          for (let c = 1; c < nC; c++) doc.line(COL[c], y, COL[c], y + 9.2);
          CAB.forEach((lb0, c) => { const lb = lb0.split('|'); const cx = (COL[c] + COL[c + 1]) / 2; F(MONO, 'normal', lb0 === 'NCM' ? 9.1 : 7.4, [255, 255, 255]); if (lb.length === 1) T(lb[0], cx, y + 5.7, { align: 'center' }); else { T(lb[0], cx, y + 3.7, { align: 'center' }); T(lb[1], cx, y + 7.7, { align: 'center' }); } });
          y += 9.2; doc.setDrawColor(...BORDA);
          for (let c = 0; c < nC; c++) doc.rect(COL[c], y, COL[c + 1] - COL[c], 6.2);
          const cod = E.codigos[it.key] || it.codigo || '';
          const vals = comPreco ? [String(i + 1), cod, qtdTxt(it.qtd), it.un || '', pct(it.pisCofins), pct(it.icms), it.ipi == null ? '—' : pct(it.ipi), it.ncm || ''] : [String(i + 1), cod, it.breve || '', qtdTxt(it.qtd), it.un || ''];
          vals.forEach((v, c) => { F(MONO, 'normal', 8.2, comPreco && c >= 4 && c <= 7 ? [51, 51, 51] : [0, 0, 0]); let s = limpa(v); while (s && W(s) > COL[c + 1] - COL[c] - 1.5) s = s.slice(0, -1); const lft = !comPreco && c === 2; T(s, lft ? COL[c] + 1.2 : (COL[c] + COL[c + 1]) / 2, y + 4.2, lft ? undefined : { align: 'center' }); });
          if (comPreco) { F(MONO, 'normal', 8.2); T(din(it.unit), COL[9] - 1, y + 4.2, { align: 'right' }); T(din(it.total), COL[10] - 1, y + 4.2, { align: 'right' }); }
          y += 6.2;
          caixa(() => {
            const Lr = (rot, val) => { if (!val) return; F(MONO, 'bold', 7.4); const a = W(rot + ' '); F(MONO, 'normal', 7.4); const lin = quebra(val, LW - 2 - a); lin.forEach((l, k) => { precisa(4); if (k === 0) { F(MONO, 'bold', 7.4); T(rot, X0 + 0.7, y + 3); } F(MONO, 'normal', 7.4); T(l, X0 + 0.7 + (k === 0 ? a : 0), y + 3); y += 3.95; }); };
            if (comPreco) Lr(r.breve, D.tipo === 'SEQ' ? it.breve : tr(it.breve)); Lr(r.completa, tr(it.completa)); Lr(r.condicao, numL(it.condicao)); Lr(r.vazaoNom, numL(it.vazaoNominal));
            const escI = it.escopoPecas ? ((M.pecas || {}).escopo || []) : (it.escopo || []).map(tr);
            if (escI.length) { precisa(4); F(MONO, 'bold', 7.4); T(r.escopoL, X0 + 0.7, y + 3); y += 4.6; for (const p of escI) { const b = /^[•\-–]\s*/.test(p); paragrafo(b ? '• ' + p.replace(/^[•\-–]\s*/, '') : p, { sz: 7.4, lh: 3.95, x: X0 + (b ? 3 : 0.7), w: LW - (b ? 4.4 : 2), just: !b, depois: b ? 0.4 : 2 }); } }
          }, { pad: 0.6 });
          y += 6;
        });
        if (comPreco) { precisa(10); doc.setFillColor(...LAR2); doc.rect(74.4, y, 123, 0.25, 'F'); F(MONO, 'normal', 10.6); T(r.total, 146.3, y + 5); F(MONO, 'bold', 9.1); T(din(D.total), 196.8, y + 5, { align: 'right' }); y += 8;
          if (usd) { F(MONO, 'normal', 7.4, TXT2); const nt = r.moeda.replace('{taxa}', nf(4).format(Number(O.moeda.taxa))).replace('{data}', O.moeda.data ? r.moedaData.replace('{d}', dataLang(O.moeda.data, lang)) : ''); for (const q of quebra(nt, LW)) { T(q, X1, y + 3, { align: 'right' }); y += 3.6; } }
          y += 4; }
      },
      condicoes() {
        if (!juntas || titulo === null || !(SEC.indexOf('condicoes') === SEC.indexOf('planilha') + 1)) { pagina(r.t_condicoes); kv([[r.projObra, tr(E.obra)], [r.aosCuid, E.aosCuidados]]); y += 2; }
        titulo2(r.h_pag); paragrafo(tr(E.pagamento) || '—', { depois: 0.8 });
        F(MONO, 'normal', 9.1); paragrafo(r.nota + ' ' + (M.notaPagamento || ''), { just: true, depois: 4 });
        titulo2(r.h_prazo, tem('prazos') && D.tipo === 'SEQ' ? r.vide : '');
        { const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0; const L = [];
          if (fab) L.push(r.fab.replace('{n}', fab)); if (ent) L.push(r.ent.replace('{n}', ent)); if (fab || ent) L.push(r.tot.replace('{n}', fab + ent));
          for (const l of linhasDe(E.prazoTexto)) L.push(tr(l));
          if (!L.length) L.push(r.combinar);
          for (const l of L) paragrafo(l, { depois: 0.3 }); y += 3.7; }
        titulo2(r.h_frete); paragrafo(tr(E.frete) || '—', { depois: 4 });
        if (linhasDe(E.observacoes).length) titulo2(r.h_obs);
        { const L = linhasDe(E.observacoes).map((l) => (E.ajustados.observacoes ? tr(l) : l)); if (D.tipo === 'SPV' && L.length) marcadores(L, { sz: 7.4, lh: 3.7 }); else for (const l of L) paragrafo(l, { just: true, depois: 0.6 }); y += 2; }
        extrasComerciais();
        atencao();
      },
      folha() {
        D.itens.forEach((it, i) => {
          const fd = it.folha || {}; const dfd = it.fd || {};
          if (!(fd.componentes || []).length && !(fd.adicionais || []).length && !(fd.hidraulica || []).length && !(dfd.bomba || []).length && !(dfd.motor || []).length && !O.curvas[it.key] && !(it.espec || []).length && !((it.cad || {}).fds || []).length && !((O.desenhos || {})[it.key] || []).length) return;
          pagina(r.t_folha);
          F(MONT, 'bold', 9); T(r.item.replace('{n}', i + 1), X0, y + 3); y += 5;
          faixa([E.codigos[it.key] || it.codigo, it.breve].filter(Boolean).join(' - '), { fam: MONT, st: 'normal', sz: 8 }); y += 1;
          const tabela = (grupos) => {
            const hdr = () => { doc.setFillColor(...FUNDO); doc.rect(13.5, y, 182.8, 5.4, 'F'); doc.setDrawColor(...LINHA); doc.setLineWidth(0.25); doc.rect(13.5, y, 182.8, 5.4); doc.line(28, y, 28, y + 5.4); F(MONO, 'normal', 6.5, [119, 119, 119]); T(r.qtd, 14.6, y + 3.7); T(r.descr, 29.2, y + 3.7); y += 5.4; };
            hdr();
            for (const g of grupos) {
              const L = [[fdT(g.titulo), 'bold']].concat((g.linhas || []).map((l) => [Array.isArray(l) ? fdT('@' + l[0]) + ': ' + fdV(l[1]) : l, 'normal'])); const lin = [];
              for (const [t, st] of L) { F(MONO, st, 6.5); for (const q of quebra(t, 165)) lin.push([q, st]); }
              const h = lin.length * 3.3 + 2.2;
              if (y + h > LIM) { pagina(titulo); hdr(); }
              doc.setDrawColor(...LINHA); doc.rect(13.5, y, 182.8, h); doc.line(28, y, 28, y + h);
              F(MONO, 'normal', 6.5, [60, 60, 60]); T(qtdTxt(g.qtd), 14.6, y + 3.3);
              lin.forEach(([t, st], k) => { F(MONO, st, 6.5, st === 'bold' ? [0, 0, 0] : TXT2); T(t, 29.2, y + 3.3 + k * 3.3); });
              y += h;
            }
            y += 4;
          };
          const pares = (titulo, L) => {
            const ps = L.filter((x) => x[1] !== '' && x[1] != null); if (!ps.length) return; const lin = Math.ceil(ps.length / 2); const h = 4.2 + lin * 5;
            precisa(Math.min(h + 2, 30)); F(MONO, 'bold', 7.4); T(titulo, X0, y + 3); y += 4.2;
            for (let k = 0; k < ps.length; k += 2) { precisa(5); [ps[k], ps[k + 1]].forEach((p, j) => { if (!p) return; const cx = j ? 105 : X0; F(MONO, 'normal', 7.4, TXT2); const lb = quebra(fdT('@' + p[0]), 42)[0]; T(lb, cx, y + 3.4); F(MONO, 'bold', 7.4); T(quebra(String(fdV(p[1])), 44)[0], cx + 44, y + 3.4); doc.setDrawColor(...LINHA); doc.line(cx, y + 4.6, cx + 88, y + 4.6); }); y += 5; }
            y += 3;
          };
          if ((fd.componentes || []).length) tabela(fd.componentes);
          if ((fd.adicionais || []).length) { precisa(16); F(MONT, 'bold', 9); T(r.adicionais, X0, y + 3); y += 5; tabela(fd.adicionais); }
          if ((fd.hidraulica || []).length || (dfd.bomba || []).length) {
            precisa(16); F(MONT, 'bold', 9); T(r.hidraulicos, X0, y + 3); y += 5;
            for (const b of fd.hidraulica || []) pares(r.bomba.replace('{n}', b.n) + ' — ' + fdV(b.acion) + (b.cfg ? ' · ' + fdV(b.cfg) : ''), b.dados.map((x) => [x[0], numL(x[1])]));
          }
          if ((dfd.bomba || []).length) pares(r.fdBomba, dfd.bomba);
          if ((dfd.motor || []).length) pares(r.fdMotor, dfd.motor);
          { const FBx = window.PricerFabricante; for (const f of ((it.cad || {}).fds || [])) { const L = []; for (const q of f.secoes) for (const [k, v] of q.campos) L.push([(FBx && FBx.rotT(k, lang)) || k, (FBx && FBx.valT(v, lang)) || v]); if (L.length) pares(fdT(f.titulo) + ' — ' + f.desc, L); } }
          if ((it.espec || []).length) { precisa(16); F(MONT, 'bold', 9); T(r.espec, X0, y + 3); y += 5; tabela(it.espec.map((g) => Object.assign({}, g, { linhas: (g.linhas || []).map((l) => [l[0], tr(l[1])]) }))); }
          const nt = linhasDe(E.notasItem[it.key]);
          if (nt.length) { precisa(14); F(MONT, 'bold', 9); T(r.notasItem, X0, y + 3); y += 6; for (const l of nt) paragrafo(tr(l), { sz: 8.2, depois: 0.6 }); }
          const cv = O.curvas[it.key];
          if (cv) {
            const p = doc.getImageProperties(cv); let w = LW, h = w * p.height / p.width; const hmax = LIM - TOPO - 8;
            if (y + Math.min(h, hmax) + 8 > LIM) pagina(titulo);
            if (h > hmax) { h = hmax; w = h * p.width / p.height; }
            F(MONT, 'bold', 9); T(r.curva, X0, y + 3); y += 5;
            doc.addImage(cv, fmtImg(cv), X0 + (LW - w) / 2, y, w, h, 'curva_' + i, 'FAST'); y += h + 4;
          }
          for (const [k, dz] of ((O.desenhos || {})[it.key] || []).entries()) { const p = doc.getImageProperties(dz); let w = LW, h = w * p.height / p.width; const hmax = LIM - TOPO - 8; if (h > hmax) { h = hmax; w = h * p.width / p.height; } if (y + h + 8 > LIM) pagina(titulo); F(MONT, 'bold', 9); T(r.desenho || 'Desenho', X0, y + 3); y += 5; doc.addImage(dz, fmtImg(dz), X0 + (LW - w) / 2, y, w, h, 'des_' + i + '_' + k, 'FAST'); y += h + 4; }
        });
      },
      comiss() {
        const C = M.comissionamento || {}; pagina(r.t_comiss);
        const y0 = y; F(MONT, 'normal', 10.6, TIT); T(r.incluso, X0, y + 4); y += 7;
        marcadores(aplica(C.incluso, f, lang), { x: X0 + 3, w: 100, sz: 8.2, lh: 4.2, gap: 0.6 });
        const hImg = colocar('comiss-tecnico', 130, y0 + 6, 66);
        y = Math.max(y, y0 + 6 + hImg) + 5; separador(y); y += 5;
        F(MONT, 'normal', 10.6, TIT); T(r.comTit, 105, y + 4, { align: 'center' }); y += 8;
        y += colocar('comiss-etapas', 30, y, 150) + 5; separador(y); y += 5;
        const col = (x, tit, sub, L) => { let yy = y; F(MONT, 'normal', 10.6, TIT); T(tit, x, yy + 4, { align: 'center' }); yy += 5.4; if (sub) { T(sub, x, yy + 4, { align: 'center' }); yy += 5.4; } yy += 2; F(MONO, 'normal', 8.2); for (const l of L) for (const q of quebra(l, 80)) { T(q, x, yy + 3.4, { align: 'center' }); yy += 4.2; } return yy; };
        const y1 = col(58, r.servAd, r.foraEsc, C.adicionais || []); const y2 = col(152, r.resp, '', C.responsabilidades || []);
        y = Math.max(y1, y2) + 4; separador(y); y += 5; atencao();
      },
      notas() {
        pagina(D.tipo === 'SEQ' ? r.t_notasSeq : r.t_notasSpv);
        for (const [rot, txt, k] of [[r.notas, E.notas, 'notas'], [r.desvios, E.desvios, 'desvios'], [r.exclusoes, E.exclusoes, 'exclusoes']]) {
          faixa(rot, { sz: 8.2 }); const L = linhasDe(txt).map((l) => (E.ajustados[k] || (k === 'exclusoes' && linhasDe(D.exclusoes).includes(l)) ? tr(l) : l));
          caixa(() => { if (!L.length) { y += 4; return; } marcadores(L.map((l) => l.replace(/^[•\-–]\s*/, '')), { sz: 7.4, lh: 3.7, gap: 0.5, x: X0 + 1, w: LW - 2 }); }, { pad: 1.2, borda: LINHA });
          y += 4;
        }
      },
      prazos() {
        const P = M.prazos || {}; pagina(r.t_prazos);
        F(MONT, 'normal', 10.6, TIT); T(r.compTit, 105, y + 4, { align: 'center' }); y += 8;
        paragrafo(P.intro || '', { sz: 8.2, lh: 4.2, just: true, depois: 5 });
        const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0;
        const bx = (x, w, l1, l2, escuro) => { doc.setFillColor(...(escuro ? ATN : FUNDO)); doc.rect(x, y, w, 15, 'F'); F(MONO, 'normal', 8.2, escuro ? [255, 255, 255] : [0, 0, 0]); T(l1, x + w / 2, y + 6, { align: 'center' }); F(MONO, 'bold', 8.2, TIT); T(l2, x + w / 2, y + 11, { align: 'center' }); };
        bx(X0, 52, r.pFab, fab ? fab + ' ' + r.dias + ' · DAPC' : 'DAPC'); F(MONO, 'bold', 14, TIT); T('+', 71, y + 9.5, { align: 'center' });
        bx(77, 52, r.pEnt, ent ? ent + ' ' + r.dias + ' · DAE' : 'DAE'); F(MONO, 'bold', 14, TIT); T('=', 136, y + 9.5, { align: 'center' });
        bx(142, X1 - 142, r.pTot, fab || ent ? (fab + ent) + ' ' + r.dias : '', true); y += 21;
        const cs = [X0, 32, 100, X1]; doc.setFillColor(...LAR2); doc.rect(X0, y, LW, 5.6, 'F'); F(MONO, 'bold', 7.4, [255, 255, 255]); r.sigla.forEach((t, c) => T(t, cs[c] + 1.5, y + 3.8)); y += 5.6;
        for (const rw of P.siglas || []) { const L = rw.map((t, c) => (F(MONO, c ? 'normal' : 'bold', 7.4), quebra(t, cs[c + 1] - cs[c] - 3))); const h = Math.max(...L.map((l) => l.length)) * 3.6 + 2; doc.setDrawColor(...LINHA); doc.line(X0, y + h, X1, y + h); L.forEach((l, c) => { F(MONO, c ? 'normal' : 'bold', 7.4); l.forEach((q, k) => T(q, cs[c] + 1.5, y + 3.6 + k * 3.6)); }); y += h; }
        y += 6;
        const lista = (x, tit, L) => { let yy = y; F(MONT, 'normal', 9.4, TIT); T(tit, x, yy + 3.5); yy += 6.5; for (const l of L) { F(MONO, 'normal', 7.4); const q = quebra(l, 82); T('•', x, yy + 3); q.forEach((s, k) => T(s, x + 3.5, yy + 3 + k * 3.7)); yy += q.length * 3.7 + 1; } return yy; };
        y = Math.max(lista(X0, r.inicio, P.inicio || []), lista(108, r.susp, P.suspensao || [])) + 5;
        if (P.recebimento) { F(MONO, 'normal', 7.4); const q = quebra(P.recebimento, LW - 8); const h = q.length * 3.7 + 5; precisa(h + 2); doc.setFillColor(...SUAVE); doc.rect(X0, y, LW, h, 'F'); doc.setFillColor(...ATN2); doc.rect(X0, y, 1.2, h, 'F'); F(MONO, 'normal', 7.4); q.forEach((s, k) => T(s, X0 + 4, y + 4.2 + k * 3.7)); y += h + 4; }
        atencao();
      },
      docs() {
        const S = M.escopoDocs || {}; pagina(r.t_docs);
        const cs = [X0, 98, 112, 126, 141, 157, 172, X1];
        F(MONO, 'normal', 6.2); const hl = (S.cab || []).map((t, c) => quebra(t, cs[c + 1] - cs[c] - 1.5)); const hh = Math.max(...hl.map((l) => l.length)) * 2.8 + 2.4;
        doc.setFillColor(...ESC); doc.rect(X0, y, LW, hh, 'F'); F(MONO, 'normal', 6.2, [255, 255, 255]); hl.forEach((l, c) => l.forEach((q, k) => T(q, c ? (cs[c] + cs[c + 1]) / 2 : cs[c] + 1.2, y + 3 + k * 2.8, c ? { align: 'center' } : undefined))); y += hh;
        for (const [g, rows] of S.grupos || []) {
          const rs = aplica(rows.map((rw) => rw[0]), f, lang).map((nome) => rows.find((rw) => rw[0].replace(/^\[[^\]]+\]\s*/, '') === nome)).filter(Boolean);
          if (!rs.length) continue; precisa(10); doc.setFillColor(...LAR2); doc.rect(X0, y, LW, 4.6, 'F'); F(MONO, 'bold', 6.6, [255, 255, 255]); T(g, X0 + 1.2, y + 3.2); y += 4.6;
          rs.forEach((rw, k) => { precisa(5); if (k % 2) { doc.setFillColor(...FUNDO); doc.rect(X0, y, LW, 4.4, 'F'); } F(MONO, 'normal', 6.6); rw.forEach((t, c) => { const s = c ? t : t.replace(/^\[[^\]]+\]\s*/, ''); T(s, c ? (cs[c] + cs[c + 1]) / 2 : cs[c] + 1.2, y + 3.1, c ? { align: 'center' } : undefined); }); y += 4.4; });
        }
        y += 6;
        const col = (x, w, blocos) => { const out = []; for (const [tit, L, num] of blocos) { out.push(['t', tit]); L.forEach((l, k) => { F(MONO, 'normal', 6.4); quebra((num ? (k + 1) + '. ' : '') + l, w).forEach((q) => out.push(['l', q])); }); out.push(['g']); } return out; };
        const esq = col(X0, 88, [[r.basePrazo, S.basePrazo || []], [r.tipoEnt, S.tipoEntrega || []], [r.adSob, (S.adicionais || []).map((x) => '- ' + x)]]);
        const dir = col(108, 89, [[r.notas, S.notas || [], true]]);
        const alt = (L) => L.reduce((t, x) => t + (x[0] === 't' ? 5 : x[0] === 'g' ? 2.5 : 2.9), 0);
        if (y + Math.max(alt(esq), alt(dir)) > LIM) pagina(titulo);
        const des = (x, L) => { let yy = y; for (const rw of L) { if (rw[0] === 't') { F(MONT, 'normal', 8.6, TIT); T(rw[1], x, yy + 3.4); yy += 5; } else if (rw[0] === 'g') yy += 2.5; else { F(MONO, 'normal', 6.4); T(rw[1], x, yy + 2.4); yy += 2.9; } } return yy; };
        y = Math.max(des(X0, esq), des(108, dir));
      },
      termos() {
        if (!(M.termos || []).length) return;
        pagina(r.t_termos);
        const cw = 88.5, xs = [X0, X0 + cw + 8], lh = 3.35, sz = 7.2; let colN = 0;
        const L = [];
        for (const c of M.termos) { L.push(['t', c.t]); for (const p of c.p || []) { F(MONO, 'normal', sz); const q = quebra(p, cw); q.forEach((s, k) => L.push(['p', s, k < q.length - 1])); L.push(['g']); } L.push(['g']); }
        for (let k = 0; k < L.length; k++) {
          const rw = L[k]; const h = rw[0] === 't' ? 5 : rw[0] === 'g' ? 1.4 : lh;
          if (rw[0] === 'g' && y === TOPO) continue;
          if (y + h + (rw[0] === 't' ? lh * 2 : 0) > LIM) { if (colN === 0) { colN = 1; y = TOPO; } else { pagina(titulo); colN = 0; } }
          const x = xs[colN];
          if (rw[0] === 't') { F(MONO, 'bold', sz + 0.4); T(rw[1], x, y + 3.6); }
          else if (rw[0] === 'p') { F(MONO, 'normal', sz); linhaJust(rw[1], x, y + 2.6, cw, rw[2]); }
          y += h;
        }
      },
      contatos() {
        pagina(r.t_contatos); F(MONO, 'normal', 9.1); T(r.disp, X0, 62);
        const cts = (M.contatos || []).filter((c) => (E.contatos || []).includes(c.nome));
        cts.forEach((c, k) => { const x = k % 2 ? 108 : X0; const yy = 84 + Math.floor(k / 2) * 30; F(MONT, 'bold', 9.1, TIT); T(c.nome, x, yy); F(MONO, 'normal', 8.2); [c.cargo, c.tel, c.email].filter(Boolean).forEach((s, j) => T(s, x, yy + 5 + j * 4.6)); });
        colocar('slogan', 117, 238, 80);
      },
    };
    for (const k of SEC) desenhar[k]();
    // numeração discreta nas páginas internas
    const n = doc.getNumberOfPages();
    for (let i = 2; i <= n; i++) { doc.setPage(i); F(MONO, 'normal', 7, CINZA); T(i + '/' + n, X1, 290.6, { align: 'right' }); }
    const cli = (E.cliente || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 50);
    const pre = { tc: 'PTC', com: 'PC', tec: 'PT' }[O.tipo] || 'PTC';
    const nome = (pre + '_' + numero.replace(/\s*\/\s*/g, '_').replace(/\s+/g, '') + (lang !== 'pt' ? '_' + lang.toUpperCase() : '') + (usd ? '_USD' : '') + (cli ? '_' + cli : '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9.\-]+/g, '_').replace(/_+/g, '_').replace(/_$/, '') + '.pdf';
    return { bytes: doc.output('arraybuffer'), nome, paginas: n, secoes: SEC };
  }

  // ---------- leitura de folha de dados (datasheet) de bomba ou motor ----------
  // recebe as linhas do PDF já separadas em pedaços (PricerLeitor.partes) e devolve os campos reconhecidos, para a pessoa conferir
  const CAMPOS_FD = {
    bomba: [['Fabricante', /^(FABRICANTE|MARCA|MANUFACTURER|MAKE)\b/], ['Modelo', /^(MODELO|MODEL|PUMP MODEL|PUMP TYPE|TAMANHO|SIZE)\b/], ['Sentido de rotação', /(SENTIDO DE (ROTACAO|GIRO)|DIRECTION OF ROTATION|^ROTATION$)/],
      ['Vazão', /^(VAZAO|CAPACIDADE|FLOW|CAPACITY|CAUDAL|RATED FLOW|Q)\b/], ['Altura manométrica', /^(ALTURA|AMT|HEAD|TOTAL HEAD|RATED HEAD|H)\b/], ['Rotação', /^(ROTACAO|VELOCIDADE|SPEED|RPM|VELOCIDAD|ROTACION)\b/],
      ['Material do rotor', /(MATERIAL DO ROTOR|IMPELLER MATERIAL|MATERIAL DEL IMPULSOR)/], ['Diâmetro do rotor', /(DIAM(ETRO)?\.? (DO )?ROTOR|IMPELLER DIA|DIAMETRO DEL IMPULSOR)/], ['Potência absorvida', /(POTENCIA ABSORVIDA|POTENCIA NO EIXO|POTENCIA CONSUMIDA|BHP|ABSORBED POWER|SHAFT POWER|POWER)/],
      ['Rendimento', /(RENDIMENTO|EFICIENCIA|EFFICIENCY)/], ['NPSH requerido', /NPSH/], ['Sucção', /(SUCCAO|SUCTION|SUCCION)/], ['Recalque', /(RECALQUE|DESCARGA|DISCHARGE)/], ['Vedação', /(VEDACAO|SELO MECANICO|SEAL|SELLO|GAXETA|PACKING)/],
      ['Material da carcaça', /(CARCACA|CASING|CUERPO)/], ['Eixo', /^(EIXO|SHAFT|EJE)\b/], ['Lubrificação', /(LUBRIFICACAO|LUBRICATION|LUBRICACION)/], ['Pressão de shut-off', /(SHUT.?OFF|PRESSAO MAXIMA|MAX(IMUM)?\.? PRESSURE)/],
      ['Frequência', /(FREQUENCIA|FREQUENCY|FRECUENCIA)/], ['Fluido', /^(FLUIDO|LIQUIDO|LIQUID|FLUID)\b/], ['Temperatura', /(TEMPERATURA|TEMPERATURE)/], ['Pintura', /^(PINTURA|PAINT|COR|COLOR)\b/], ['Norma', /^(NORMA|STANDARD)\b/], ['Peso', /^(PESO|WEIGHT)\b/]],
    motor: [['Fabricante', /^(FABRICANTE|MARCA|MANUFACTURER|MAKE)\b/], ['Modelo', /^(MODELO|MODEL|TYPE|TIPO)\b/], ['Potência', /^(POTENCIA|POWER|OUTPUT|RATED POWER)\b/], ['Rotação', /^(ROTACAO|VELOCIDADE|SPEED|RPM|VELOCIDAD)\b/],
      ['Tensão', /^(TENSAO|VOLTAGE|TENSION)\b/], ['Frequência', /(FREQUENCIA|FREQUENCY|FRECUENCIA)/], ['Número de polos', /(POLOS|POLES)/], ['Corrente nominal', /(CORRENTE|CURRENT|AMPERAGE|CORRIENTE)/], ['Grau de proteção', /(GRAU DE PROTECAO|PROTECTION|^IP$|GRADO DE PROTECCION)/],
      ['Carcaça', /(CARCACA|FRAME)/], ['Isolamento', /(ISOLAMENTO|INSULATION|AISLAMIENTO)/], ['Fator de serviço', /(FATOR DE SERVICO|SERVICE FACTOR|FACTOR DE SERVICIO)/], ['Fator de potência', /(FATOR DE POTENCIA|POWER FACTOR|COS)/], ['Rendimento', /(RENDIMENTO|EFICIENCIA|EFFICIENCY)/],
      ['Cilindros', /(CILINDROS|CYLINDERS)/], ['Aspiração', /(ASPIRACAO|ASPIRATION|TURBO)/], ['Resfriamento', /(RESFRIAMENTO|ARREFECIMENTO|COOLING|REFRIGERACION)/], ['Cilindrada', /(CILINDRADA|DISPLACEMENT)/], ['Consumo de combustível', /(CONSUMO|FUEL CONSUMPTION)/], ['Peso', /^(PESO|WEIGHT)\b/]],
  };
  function lerFolhaDados(rows, tipo) {
    const C = CAMPOS_FD[tipo] || CAMPOS_FD.bomba; const achados = new Map();
    const casa = (rot) => { const n = norm(rot.replace(/\([^)]*\)/g, '').replace(/[:.]+$/, '')); if (!n || n.length > 40) return null; const c = C.find((x) => x[1].test(n)); return c ? c[0] : null; };
    const unidade = (rot) => { const m = String(rot).match(/\(([^)]{1,12})\)/); return m ? m[1] : ''; };
    const guarda = (k, rot, v) => { v = String(v || '').replace(/^[:=\-–\s]+/, '').trim(); if (!k || achados.has(k) || !v || v.length > 70 || !/[0-9A-Za-zÀ-ú]/.test(v) || (casa(v) && casa(v) !== k)) return; const u = unidade(rot); achados.set(k, u && /^[\d.,\s/-]+$/.test(v) ? v + ' ' + u : v); };
    for (const row0 of rows || []) {
      let row = (Array.isArray(row0) ? row0 : [row0]).map((x) => String(x || '').trim()).filter(Boolean);
      if (row.length === 1 && /:/.test(row[0])) row = row[0].split(/:\s*/).filter(Boolean).length >= 2 ? [row[0].slice(0, row[0].indexOf(':')), row[0].slice(row[0].indexOf(':') + 1)] : row;
      for (let i = 0; i < row.length - 1; i++) { const k = casa(row[i]); const k2 = casa(row[i + 1]); if (k && (!k2 || k2 === k)) { guarda(k, row[i], row[i + 1]); i++; } }
    }
    const ordem = C.map((x) => x[0]); return [...achados.entries()].sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0])).map(([k, v]) => ({ k, v, on: true }));
  }

  window.PricerProposta = { lerFolhaDados, montar, efetivo, modelo, aplica, normaTxt, dataBR, secoes, dinamicos, TIPOS, IDIOMAS, SECOES, SO_SEQ, LAYOUT, SLOTS,
    // usados pelo padrão Folha de dados (proposta-express.js)
    _i: { lib, limpa, linhasDe, R, FD, LOC, dataLang, MONO, MONT } };
})();
