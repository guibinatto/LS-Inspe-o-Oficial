/* LS Pricer — proposta no padrão "Folha de dados" (inspirado nas folhas de dados de fabricante, como a Peerless Express):
 * páginas densas com faixa de título escura, seções em faixas cinza com pares rótulo : valor em duas colunas, curva,
 * desenhos e escopo em tabelas Qtd | Descrição. Cores LS Fire (cinza escuro e laranja). Os números vêm da formação
 * (mesmos dados do padrão PTC); a folha de dados completa do fabricante, quando anexada no item, entra como veio
 * (só os campos marcados), com rótulos traduzidos pelo dicionário ou pelo Claude.
 * O = mesmas opções do padrão PTC + fab: { [item]: { dados, curva: dataURL, paginas: { n: { url, w, h } } } }, trFab: (texto em inglês) => tradução
 */
(function () {
  'use strict';
  const P = window.PricerProposta; const I = P._i; const FB = () => window.PricerFabricante || null;
  const ESC = [47, 47, 47], LAR = [228, 101, 14], LAR0 = [199, 56, 21], BANDA = [236, 236, 236], LINHA = [214, 214, 214], CINZA = [110, 110, 110], CLARO = [247, 247, 247];
  const X = {
    pt: { potLocal: 'Pot. no local', notaDerat: 'Potência do diesel no local (NFPA 20) {loc} × máxima absorvida na curva {max}: {res}.', fonteSem: 'Dados da folha do fabricante, conferidos pela LS Fire.', pontosT: 'Pontos de trabalho', minW: 'mín. ', maxW: 'máx. ', nfpaT: 'Critérios da NFPA 20', bombaN: 'Bomba', acionC: 'Acionamento', vazao: 'Vazão', pressao: 'Pressão', potNom: 'Potência nominal do acionador', rotacao: 'Rotação', ptoC: 'Ponto', hExig: 'Altura exigida (NFPA 20)', hCurva: 'Altura na curva', potAbs: 'Potência absorvida', res: 'Resultado', nom100: 'Nominal (100%)', trab100: 'Ponto de trabalho (100%)', v150: '150% da vazão', shutC: 'Shutoff (vazão zero)', fimC: 'Final da curva', atende: 'Atende', naoAtende: 'Não atende', potMax: 'Potência máxima absorvida na curva', notaN: 'NFPA 20: a 150% da vazão nominal, altura de no mínimo 65% da nominal; em shutoff, no máximo 140% da nominal. Valores da curva lidos entre os pontos do fabricante, sem extrapolação.', notaTrab: 'A folha do fabricante não informa o ponto nominal NFPA 20: a base é o ponto de trabalho.', notaFora: 'O ponto de trabalho não cai sobre a curva do fabricante anexada (diferença de altura acima de 10%): limites calculados a partir do ponto de trabalho. Confira a folha do fabricante.', notaSem: 'Sem curva do fabricante: limites calculados a partir do ponto de trabalho; os valores reais vêm da curva do fabricante.', cadTit: 'Folha de dados da bomba e do acionador', cadFonte: 'Dados do cadastro LS Fire (folhas de dados dos fabricantes).', componente: 'Componente', marca: 'Marca', modeloDesc: 'Modelo / descrição', unitSem: 'Unitário sem impostos', totSem: 'Total sem impostos', pisCof: 'PIS + COFINS', impR: 'ICMS + PIS + COFINS (R$)', ipiR: 'IPI (R$)', totais: 'Totais', notaImp: 'ICMS, PIS e COFINS estão incluídos no preço (por dentro); o IPI é somado ao preço com impostos. Alíquotas e NCM conforme a formação desta proposta.', doc_tc: 'Proposta técnica e comercial', doc_com: 'Proposta comercial', doc_tec: 'Proposta técnica', resumo: 'Resumo da proposta', dadosProp: 'Dados da proposta', fornec: 'Resumo do fornecimento', valorTotal: 'Valor total', sobre: 'Sobre a LS Fire', ident: 'Identificação do item', desemp: 'Folha de dados de desempenho', constr: 'Folha de dados construtiva',
      adic: 'Dados adicionais de desempenho', curva: 'Curva de desempenho', curvas: 'Curvas em várias rotações', arranjo: 'Arranjo geral', desenho: 'Desenho', escopo: 'Escopo de fornecimento', lsfire: 'Itens da formação LS Fire', especs: 'Especificações',
      hidr: 'Dados hidráulicos', fdB: 'Bomba (folha de dados)', fdM: 'Acionador (folha de dados)', planilha: 'Planilha de preços', cond: 'Condições comerciais', notas: 'Notas, desvios e exclusões', termos: 'Termos e condições', contatos: 'Contatos', comiss: 'Comissionamento e start-up', prazos: 'Prazos', docs: 'Escopo de documentos',
      qtd: 'Qtd', descr: 'Descrição', item: 'Item', codigo: 'Código', un: 'Un.', ncm: 'NCM', ipi: 'IPI', icms: 'ICMS', unit: 'Unitário c/ impostos', tot: 'Total c/ impostos', ponto: 'Ponto de trabalho', equip: 'Equipamento', fonte: 'Dados do fabricante ({f}), conferidos pela LS Fire.', semFab: 'Dados da formação LS Fire.',
      proposta: 'Proposta', rev: 'Revisão', data: 'Data', validade: 'Validade', vendedor: 'Contato comercial', norma: 'Norma', pagamento: 'Pagamento', frete: 'Frete', prazo: 'Prazo', obs: 'Observações', quantidade: 'Quantidade', tag: 'Tag', modelo: 'Modelo', fabr: 'Fabricante' },
    en: { potLocal: 'Site power', notaDerat: 'Diesel power at site (NFPA 20) {loc} × maximum absorbed on the curve {max}: {res}.', fonteSem: 'Manufacturer datasheet data, checked by LS Fire.', pontosT: 'Duty points', minW: 'min. ', maxW: 'max. ', nfpaT: 'NFPA 20 criteria', bombaN: 'Pump', acionC: 'Driver', vazao: 'Flow', pressao: 'Pressure', potNom: 'Driver rated power', rotacao: 'Speed', ptoC: 'Point', hExig: 'Required head (NFPA 20)', hCurva: 'Head on curve', potAbs: 'Power absorbed', res: 'Result', nom100: 'Rated (100%)', trab100: 'Duty point (100%)', v150: '150% flow', shutC: 'Shutoff (zero flow)', fimC: 'End of curve', atende: 'Complies', naoAtende: 'Does not comply', potMax: 'Maximum power absorbed on the curve', notaN: 'NFPA 20: at 150% of rated flow, head of at least 65% of rated; at shutoff, at most 140% of rated. Curve values read between the manufacturer points, without extrapolation.', notaTrab: 'The manufacturer datasheet does not give the NFPA 20 rated point: the duty point is used as the base.', notaFora: 'The duty point does not fall on the attached manufacturer curve (head difference above 10%): limits calculated from the duty point. Check the manufacturer datasheet.', notaSem: 'No manufacturer curve: limits calculated from the duty point; actual values come from the manufacturer curve.', cadTit: 'Pump and driver datasheet', cadFonte: 'LS Fire records (manufacturer datasheets).', componente: 'Component', marca: 'Brand', modeloDesc: 'Model / description', unitSem: 'Unit price excl. taxes', totSem: 'Total excl. taxes', pisCof: 'PIS + COFINS', impR: 'ICMS + PIS + COFINS (R$)', ipiR: 'IPI (R$)', totais: 'Totals', notaImp: 'ICMS, PIS and COFINS are included in the price; IPI is added on top. Tax rates and NCM as per this proposal.', doc_tc: 'Technical and commercial proposal', doc_com: 'Commercial proposal', doc_tec: 'Technical proposal', resumo: 'Proposal summary', dadosProp: 'Proposal data', fornec: 'Scope summary', valorTotal: 'Total amount', sobre: 'About LS Fire', ident: 'Item identification', desemp: 'Performance datasheet', constr: 'Construction datasheet',
      adic: 'Additional performance data', curva: 'Performance curve', curvas: 'Multi-speed curves', arranjo: 'General arrangement', desenho: 'Drawing', escopo: 'Scope of supply', lsfire: 'LS Fire package items', especs: 'Specifications',
      hidr: 'Hydraulic data', fdB: 'Pump (datasheet)', fdM: 'Driver (datasheet)', planilha: 'Price schedule', cond: 'Commercial conditions', notas: 'Notes, deviations and exclusions', termos: 'Terms and conditions', contatos: 'Contacts', comiss: 'Commissioning and start-up', prazos: 'Lead times', docs: 'Documentation scope',
      qtd: 'Qty', descr: 'Description', item: 'Item', codigo: 'Code', un: 'Unit', ncm: 'NCM', ipi: 'IPI', icms: 'ICMS', unit: 'Unit price incl. taxes', tot: 'Total incl. taxes', ponto: 'Duty point', equip: 'Equipment', fonte: 'Manufacturer data ({f}), checked by LS Fire.', semFab: 'LS Fire package data.',
      proposta: 'Proposal', rev: 'Revision', data: 'Date', validade: 'Validity', vendedor: 'Sales contact', norma: 'Standard', pagamento: 'Payment', frete: 'Freight', prazo: 'Lead time', obs: 'Remarks', quantidade: 'Quantity', tag: 'Tag', modelo: 'Model', fabr: 'Manufacturer' },
    es: { potLocal: 'Pot. en sitio', notaDerat: 'Potencia del diésel en el sitio (NFPA 20) {loc} × máxima absorbida en la curva {max}: {res}.', fonteSem: 'Datos de la hoja del fabricante, verificados por LS Fire.', pontosT: 'Puntos de trabajo', minW: 'mín. ', maxW: 'máx. ', nfpaT: 'Criterios de la NFPA 20', bombaN: 'Bomba', acionC: 'Accionamiento', vazao: 'Caudal', pressao: 'Presión', potNom: 'Potencia nominal del accionador', rotacao: 'Velocidad', ptoC: 'Punto', hExig: 'Altura exigida (NFPA 20)', hCurva: 'Altura en la curva', potAbs: 'Potencia absorbida', res: 'Resultado', nom100: 'Nominal (100%)', trab100: 'Punto de trabajo (100%)', v150: '150% del caudal', shutC: 'Válvula cerrada (caudal cero)', fimC: 'Final de la curva', atende: 'Cumple', naoAtende: 'No cumple', potMax: 'Potencia máxima absorbida en la curva', notaN: 'NFPA 20: al 150% del caudal nominal, altura de al menos 65% de la nominal; a válvula cerrada, como máximo 140% de la nominal. Valores de la curva leídos entre los puntos del fabricante, sin extrapolación.', notaTrab: 'La hoja del fabricante no indica el punto nominal NFPA 20: la base es el punto de trabajo.', notaFora: 'El punto de trabajo no cae sobre la curva del fabricante adjunta (diferencia de altura superior al 10%): límites calculados a partir del punto de trabajo. Verifique la hoja del fabricante.', notaSem: 'Sin curva del fabricante: límites calculados a partir del punto de trabajo; los valores reales vienen de la curva del fabricante.', cadTit: 'Hoja de datos de la bomba y del accionador', cadFonte: 'Registro LS Fire (hojas de datos de los fabricantes).', componente: 'Componente', marca: 'Marca', modeloDesc: 'Modelo / descripción', unitSem: 'Unitario sin impuestos', totSem: 'Total sin impuestos', pisCof: 'PIS + COFINS', impR: 'ICMS + PIS + COFINS (R$)', ipiR: 'IPI (R$)', totais: 'Totales', notaImp: 'ICMS, PIS y COFINS están incluidos en el precio; el IPI se suma al precio con impuestos. Alícuotas y NCM según esta propuesta.', doc_tc: 'Propuesta técnica y comercial', doc_com: 'Propuesta comercial', doc_tec: 'Propuesta técnica', resumo: 'Resumen de la propuesta', dadosProp: 'Datos de la propuesta', fornec: 'Resumen del suministro', valorTotal: 'Valor total', sobre: 'Sobre LS Fire', ident: 'Identificación del ítem', desemp: 'Hoja de datos de desempeño', constr: 'Hoja de datos constructiva',
      adic: 'Datos adicionales de desempeño', curva: 'Curva de desempeño', curvas: 'Curvas a varias velocidades', arranjo: 'Disposición general', desenho: 'Plano', escopo: 'Alcance del suministro', lsfire: 'Ítems del conjunto LS Fire', especs: 'Especificaciones',
      hidr: 'Datos hidráulicos', fdB: 'Bomba (hoja de datos)', fdM: 'Accionador (hoja de datos)', planilha: 'Planilla de precios', cond: 'Condiciones comerciales', notas: 'Notas, desvíos y exclusiones', termos: 'Términos y condiciones', contatos: 'Contactos', comiss: 'Puesta en marcha', prazos: 'Plazos', docs: 'Alcance de documentos',
      qtd: 'Cant.', descr: 'Descripción', item: 'Ítem', codigo: 'Código', un: 'Unid.', ncm: 'NCM', ipi: 'IPI', icms: 'ICMS', unit: 'Unitario c/ impuestos', tot: 'Total c/ impuestos', ponto: 'Punto de trabajo', equip: 'Equipo', fonte: 'Datos del fabricante ({f}), verificados por LS Fire.', semFab: 'Datos del conjunto LS Fire.',
      proposta: 'Propuesta', rev: 'Revisión', data: 'Fecha', validade: 'Validez', vendedor: 'Contacto comercial', norma: 'Norma', pagamento: 'Pago', frete: 'Flete', prazo: 'Plazo', obs: 'Observaciones', quantidade: 'Cantidad', tag: 'Tag', modelo: 'Modelo', fabr: 'Fabricante' },
  };
  const GRUPO_TR = { en: { Bomba: 'Pump', Acionador: 'Driver', 'Painel de comando': 'Controller', 'Bomba jockey': 'Jockey pump', 'Acessórios': 'Accessories', 'Testes e ensaios': 'Testing', 'Documentos e desenhos': 'Documents and drawings', 'Serviços': 'Services', Comercial: 'Commercial' },
    es: { Bomba: 'Bomba', Acionador: 'Accionador', 'Painel de comando': 'Tablero de control', 'Bomba jockey': 'Bomba jockey', 'Acessórios': 'Accesorios', 'Testes e ensaios': 'Pruebas y ensayos', 'Documentos e desenhos': 'Documentos y planos', 'Serviços': 'Servicios', Comercial: 'Comercial' } };
  // títulos de página do fabricante → título no idioma
  const TIT_PAG = [[/Performance Datasheet/i, 'desemp'], [/Construction/i, 'constr'], [/Additional Data/i, 'adic'], [/Multi-Speed/i, 'curvas'], [/Performance Curve/i, 'curva'], [/General Arrangement/i, 'arranjo'], [/Price Sheet/i, 'escopo']];

  async function montar(D, pc, M, O) {
    O = Object.assign({ tipo: 'tc', lang: 'pt', moeda: { cod: 'BRL' }, img: {}, curvas: {}, fab: {}, tr: (s) => s, trFab: (s) => s }, O || {});
    const lang = O.lang, r = I.R[lang] || I.R.pt, x = X[lang] || X.pt, fdl = I.FD[lang] || I.FD.pt;
    const tr = (s) => (lang === 'pt' || !s ? s : O.tr(s) || s);
    const fb = FB();
    const trF = (s, tipo) => { if (!s || lang === 'en') return s; const d = fb ? (tipo === 'sec' ? fb.secT(s, lang) : tipo === 'rot' ? fb.rotT(s, lang) : tipo === 'lin' ? fb.linhaT(s, lang) : fb.valT(s, lang)) : null; return d || O.trFab(s) || s; };
    const jsPDF = await I.lib(); const AS = window.PRICER_PROPOSTA_ASSETS; if (!AS) throw new Error('Imagens e fontes da proposta não encontradas no app.');
    const E = P.efetivo(D, pc, M, lang); const SEC = P.secoes(D, pc, M, O.tipo); const tem = (k) => SEC.includes(k); const comPreco = O.tipo !== 'tec';
    const nf = (d) => new Intl.NumberFormat(I.LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
    const usd = O.moeda && O.moeda.cod === 'USD' && Number(O.moeda.taxa) > 0;
    const din = (v) => (usd ? 'US$ ' : 'R$ ') + nf(2).format(typeof v === 'number' && isFinite(v) ? (usd ? v / Number(O.moeda.taxa) : v) : 0);
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const pct = (v) => (typeof v === 'number' && isFinite(v) ? nf(2).format(v * 100) + '%' : '—');
    const qtdTxt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : nf(2).format(v)) : String(v || ''));
    const numL = (s) => (lang !== 'en' || typeof s !== 'string' ? s : s.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+,\d+\b/g, (m) => m.replace(/\./g, '\u0000').replace(',', '.').replace(/\u0000/g, ',')));
    // números do fabricante (formato americano) no formato do idioma, com o equivalente métrico ao lado
    const nEN = (t) => Number(String(t).replace(/,/g, ''));
    const swap = (t) => (lang === 'en' ? t : String(t).replace(/(^|[^\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+)(?![\w.])/g, (m, a, n) => (/(HI|API|ISO|NFPA)\s$|\/\s?$/.test(String(t).slice(0, String(t).indexOf(m) + a.length)) ? m : a + nf((n.split('.')[1] || '').length).format(nEN(n)))));
    // unidades da LS Fire na folha (qualquer fabricante, qualquer idioma): vazão m³/h (USgpm entre parênteses, como a NFPA 20
    // classifica as bombas), altura m, pressão bar, diâmetro mm, potência HP (kW entre parênteses, para comparar com o acionador),
    // temperatura °C, densidade kg/m³, massa kg. O que não é dessas grandezas (rpm, %, cP, Hz, V) sai como veio.
    const UNI_LS = { USgpm: ['q', 0.2271247], gpm: ['q', 0.2271247], 'm³/h': ['q', 1], 'm3/h': ['q', 1], 'l/s': ['q', 3.6], in: ['d', 25.4], mm: ['d', 1], ft: ['h', 0.3048], m: ['h', 1],
      psi: ['p', 0.0689476], 'psi.g': ['p', 0.0689476], 'psig': ['p', 0.0689476], 'psi.a': ['pa', 0.0689476], 'psia': ['pa', 0.0689476], kPa: ['p', 0.01], MPa: ['p', 10], bar: ['p', 1],
      hp: ['w', 1], HP: ['w', 1], kW: ['w', 1 / 0.7457], cv: ['w', 0.7355 / 0.7457], lb: ['kg', 0.45359237], kg: ['kg', 1], 'deg C': ['t', 1], '°C': ['t', 1], 'deg F': ['tf', 1], '°F': ['tf', 1],
      SG: ['dens', 1000], 'kg/m³': ['dens', 1], 'kg/m3': ['dens', 1] };
    // número do fabricante: "2,724" e "1.00" (americano); "460,00" (vírgula decimal)
    const numFab = (t) => { t = String(t).trim(); if (/^\d+,\d{1,2}$|^\d+,\d{4,}$/.test(t)) return Number(t.replace(',', '.')); if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.')); return Number(t.replace(/,/g, '')); };
    const dec = (v, d) => nf(d).format(v);
    function convLS(ns, u, ds) {
      const c = UNI_LS[u]; if (!c || !ns.length || ns.some((n) => !isFinite(n))) return null; const [g, f] = c; const j = (a, un) => a.join(' / ') + ' ' + un;
      // mesma unidade: as casas decimais da folha (até 2); convertida: as da grandeza
      const k = (n, d) => (f === 1 && ds !== undefined ? Math.min(2, ds) : d);
      if (g === 'q') { const q = ns.map((n) => dec(n * f, n === 0 ? 0 : k(n, n * f >= 1000 || (f === 1 && n >= 100) ? 0 : 1))); return j(q, 'm³/h') + (/gpm/i.test(u) ? ' (' + j(ns.map((n) => dec(n, 0)), 'USgpm') + ')' : ''); }
      if (g === 'd') { const mm = ns.map((n) => n * f); return mm.some((v) => v >= 1000) ? j(mm.map((v) => dec(v / 1000, 2)), 'm') : j(mm.map((v) => dec(v, k(v, v >= 100 || v === 0 ? 0 : 1))), 'mm'); }
      if (g === 'h') return j(ns.map((n) => dec(n * f, k(n, 1))), lang === 'en' ? 'm' : 'mca'); // altura em metros de coluna d'água, como no ponto de trabalho
      if (g === 'p' || g === 'pa') return j(ns.map((n) => dec(n * f, k(n, n * f >= 10 ? 1 : 2))), g === 'pa' ? 'bar (abs.)' : 'bar');
      if (g === 'w') { const hp = ns.map((n) => n * f); return j(hp.map((v) => dec(v, 1)), 'HP') + ' (' + j(hp.map((v) => dec(v * 0.7457, 1)), 'kW') + ')'; }
      if (g === 'kg') return j(ns.map((n) => dec(n * f, 0)), 'kg');
      if (g === 't') return j(ns.map((n) => dec(n, k(n, Number.isInteger(n) ? 0 : 1))), '°C');
      if (g === 'tf') return j(ns.map((n) => dec((n - 32) / 1.8, 1)), '°C');
      if (g === 'dens') return j(ns.map((n) => dec(n * f, 0)), 'kg/m³');
      return null;
    }
    // número da curva (na unidade da curva) na unidade da LS Fire; potência só em HP quando curto (tabelas)
    const uLS = (v, u, curto) => { if (v === null || v === undefined || !isFinite(v)) return '—'; const t = convLS([v], u) || dec(v, 1) + ' ' + u; return curto ? t.replace(/\s*\([^)]*kW\)$/, '') : t; };
    function medida(v) {
      const t = String(v || '').trim().replace(/\s+/g, ' ').replace(/\bdeg C\b/, '°C');
      const m = t.match(/^([-+]?[\d.,]+)(?:\s*\/\s*([-+]?[\d.,]+))?\s*(USgpm|gpm|m³\/h|m3\/h|l\/s|in|mm|ft|m|psi\.g|psi\.a|psig|psia|psi|kPa|MPa|bar|hp|HP|kW|cv|lb|kg\/m³|kg\/m3|kg|°C|deg F|°F|SG)$/);
      if (m) { const ns = [m[1], m[2]].filter((q) => q !== undefined); const ds = Math.max(...ns.map((q) => (/^\d+,\d{1,2}$/.test(q) ? q.split(',')[1].length : (q.split('.')[1] || '').length)));
        const r0 = convLS(ns.map(numFab), m[3], ds); if (r0) return r0; }
      return swap(t);
    }
    const fdT = (s) => (typeof s === 'string' && s[0] === '@' ? fdl[s.slice(1)] || I.FD.pt[s.slice(1)] || s.slice(1) : s);
    const fdV = (s) => (typeof s === 'string' && s[0] === '#' ? fdl[s.slice(1)] || I.FD.pt[s.slice(1)] || s.slice(1) : s);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const add = (file, fam, st) => { doc.addFileToVFS(file + '.ttf', AS.fontes[file]); doc.addFont(file + '.ttf', fam, st); };
    const MT = I.MONT; add('Montserrat-Regular', MT, 'normal'); add('Montserrat-SemiBold', MT, 'bold'); add('Montserrat-Italic', MT, 'italic');
    const F = (st, sz, cor) => { doc.setFont(MT, st || 'normal'); doc.setFontSize(sz); doc.setTextColor(...(cor || [0, 0, 0])); };
    const T = (s, xx, yy, o) => doc.text(I.limpa(s), xx, yy, o);
    const W = (s) => doc.getTextWidth(I.limpa(s));
    const quebra = (s, w) => doc.splitTextToSize(I.limpa(s), w);
    const fmtImg = (src) => (/^data:image\/png/.test(src) ? 'PNG' : 'JPEG');
    const numero = D.numero ? D.numero + (D.rev !== '' && D.rev != null ? ' · ' + x.rev + ' ' + D.rev : '') : '—';
    let PW = 210, PH = 297, X0 = 12, X1 = 198, LW = 186, LIM = 280, y = 0, titulo = '', npag = 0;
    const logo = (O.img && O.img['logo-cab']) || AS.img['logo-cab'];

    // ---------- moldura das páginas ----------
    function moldura(tit) {
      if (logo) { const p = doc.getImageProperties(logo); let w = 30, h = w * p.height / p.width; if (h > 12.5) { h = 12.5; w = h * p.width / p.height; } doc.addImage(logo, fmtImg(logo), X0, 6.5, w, h, 'logo', 'FAST'); }
      F('normal', 6.4, CINZA); T((x['doc_' + O.tipo] || '').toUpperCase(), X1, 9.4, { align: 'right' });
      F('bold', 8.6, ESC); T(x.proposta + ' ' + numero, X1, 13.8, { align: 'right' });
      F('normal', 6.8, CINZA); T([E.cliente, I.dataLang(D.data, lang)].filter(Boolean).join(' · '), X1, 17.8, { align: 'right' });
      doc.setFillColor(...LAR); doc.rect(X0, 21.2, LW, 0.6, 'F');
      doc.setFillColor(...ESC); doc.rect(X0, 24.5, LW, 7.4, 'F'); doc.setFillColor(...LAR); doc.rect(X0, 24.5, 2.4, 7.4, 'F');
      F('bold', 10.2, [255, 255, 255]); T(String(tit).toUpperCase(), PW / 2, 29.6, { align: 'center' });
      doc.setDrawColor(...LINHA); doc.setLineWidth(0.25); doc.line(X0, PH - 13.5, X1, PH - 13.5);
      F('normal', 6.3, CINZA); T(M.rodape || 'LS Fire Sistemas de Combate a Incêndio', PW / 2, PH - 9.2, { align: 'center' });
      y = 36;
    }
    function pagina(tit, paisagem) {
      if (npag++) doc.addPage('a4', paisagem ? 'landscape' : 'portrait');
      PW = paisagem ? 297 : 210; PH = paisagem ? 210 : 297; X1 = PW - 12; LW = X1 - X0; LIM = PH - 17; titulo = tit; moldura(tit);
    }
    const precisa = (h) => { if (y + h > LIM) { pagina(titulo); return true; } return false; };
    // faixa de seção (cinza, com marca laranja)
    function faixa(s, xx, w) { doc.setFillColor(...BANDA); doc.rect(xx, y, w, 5.4, 'F'); doc.setFillColor(...LAR); doc.rect(xx, y, 1.2, 5.4, 'F'); F('bold', 7.6, ESC); T(s, xx + 2.8, y + 3.75); y += 6.4; }
    function subtitulo(s) { precisa(12); F('bold', 10.4, ESC); T(s, X0, y + 4.2); doc.setFillColor(...LAR); doc.rect(X0, y + 5.6, 14, 0.6, 'F'); y += 8.6; }
    // pares rótulo : valor numa coluna
    const RK = 0.4; // parte da coluna para o rótulo
    function altPares(L, w) { let h = 0; for (const [k, v] of L) { F('normal', 6.9); const a = quebra(k, w * RK - 2).length; F('bold', 7); const b = quebra(String(v), w * (1 - RK) - 2).length; h += Math.max(a, b) * 3.05 + 1.25; } return h; }
    function pares(L, xx, w, rk = RK) {
      for (const [k, v] of L) {
        F('normal', 6.9); const a = quebra(k, w * rk - 2); F('bold', 7); const b = quebra(String(v), w * (1 - rk) - 2); const h = Math.max(a.length, b.length) * 3.05 + 1.25;
        F('normal', 6.9, CINZA); a.forEach((q, i) => T(q, xx + 1.4, y + 2.7 + i * 3.05)); F('bold', 7, [20, 20, 20]); b.forEach((q, i) => T(q, xx + w * rk, y + 2.7 + i * 3.05));
        doc.setDrawColor(...LINHA); doc.setLineWidth(0.15); doc.line(xx, y + h, xx + w, y + h); y += h;
      }
    }
    // seções em duas colunas, como nas folhas de dados: cada uma vai para a coluna mais curta; quebra de página quando não cabe
    function colunas(secs) {
      const cw = (LW - 5) / 2; const xs = [X0, X0 + cw + 5]; let ys = [y, y];
      for (const s of secs.filter((q) => q.pares.length)) {
        // seção em largura total (ex.: condições comerciais do resumo)
        if (s.larga) { y = Math.max(ys[0], ys[1]); if (y + 6.4 + altPares(s.pares.slice(0, 2), LW) > LIM) pagina(titulo); faixa(s.t, X0, LW); pares(s.pares, X0, LW, 0.2); ys = [y + 2.4, y + 2.4]; continue; }
        let L = s.pares.slice(); let c = s.col !== undefined ? s.col : ys[0] <= ys[1] ? 0 : 1;
        while (L.length) {
          y = ys[c]; const cabe = []; let h = 6.4; for (const p of L) { const hp = altPares([p], cw); if (y + h + hp > LIM) break; h += hp; cabe.push(p); }
          if (!cabe.length || (cabe.length < Math.min(3, L.length) && y > 45)) {
            if (s.col === undefined && c === 0 && ys[1] + 6.4 + altPares(L.slice(0, 3), cw) <= LIM) { c = 1; continue; }
            pagina(titulo); ys = [y, y]; c = 0; continue;
          }
          faixa(s.t + (L.length < s.pares.length ? ' (cont.)' : ''), xs[c], cw); pares(cabe, xs[c], cw); L = L.slice(cabe.length); ys[c] = y + 2.4;
          if (L.length && s.col === undefined) c = 1 - c;
        }
      }
      y = Math.max(ys[0], ys[1]);
    }
    // tabela simples com cabeçalho escuro
    function tabela(cab, linhas, larg, o = {}) {
      const xs = [X0]; for (const w of larg) xs.push(xs[xs.length - 1] + w);
      const al = (i) => (o.centro?.includes(i) ? 'center' : i === 0 || o.esq?.includes(i) ? 'left' : 'right');
      const ax = (i) => (al(i) === 'center' ? (xs[i] + xs[i + 1]) / 2 : al(i) === 'left' ? xs[i] + 1.2 : xs[i + 1] - 1.2);
      const fz = o.fonte || 6.9;
      const hdr = () => { F('bold', 6.6); const hl = cab.map((t, i) => quebra(t, larg[i] - 2)); const hh = Math.max(...hl.map((q) => q.length)) * 2.8 + 2.4; precisa(hh + 5); doc.setFillColor(...ESC); doc.rect(X0, y, xs[xs.length - 1] - X0, hh, 'F'); F('bold', 6.6, [255, 255, 255]); hl.forEach((q, i) => q.forEach((t, k) => T(t, ax(i), y + 3 + k * 2.8, { align: al(i) }))); y += hh; };
      hdr();
      linhas.forEach((ln, j) => {
        F('normal', fz); const cel = ln.map((t, i) => quebra(String(t ?? ''), larg[i] - 2)); const h = Math.max(...cel.map((q) => q.length)) * (fz * 0.43) + 1.8;
        if (y + h > LIM) { pagina(titulo, o.paisagem); hdr(); }
        if (j % 2) { doc.setFillColor(...CLARO); doc.rect(X0, y, xs[xs.length - 1] - X0, h, 'F'); }
        cel.forEach((q, i) => { F(o.negrito?.includes(i) ? 'bold' : 'normal', fz, [25, 25, 25]); q.forEach((t, k) => T(t, ax(i), y + 2.9 + k * (fz * 0.43), { align: al(i) })); });
        doc.setDrawColor(...LINHA); doc.setLineWidth(0.15); doc.line(X0, y + h, xs[xs.length - 1], y + h); y += h;
      });
      if (o.total) { F('bold', fz); const h = 6; precisa(h + 2); doc.setFillColor(...BANDA); doc.rect(X0, y, xs[xs.length - 1] - X0, h, 'F'); o.total.forEach((t, i) => { if (t == null || t === '') return; F('bold', fz, ESC); T(String(t), ax(i), y + 4, { align: al(i) }); }); y += h; }
      y += 3;
    }
    // escopo no formato Qtd | Descrição, com recuo por nível
    function escopo(grupo, linhas, o = {}) {
      // grupo curto vai inteiro para a página seguinte (título e cabeçalho não ficam sozinhos)
      F('normal', 7); const alt = 10.8 + linhas.reduce((a, l) => a + quebra(l.t, X1 - (X0 + 14 + Math.min(8, l.n || 0) * 3) - 1).length * 3.05 + 1.1, 0); precisa(Math.min(alt, 40)); F('bold', 9.6, ESC); T(grupo, X0, y + 4); y += 6;
      const hdr = () => { doc.setFillColor(...ESC); doc.rect(X0, y, LW, 4.8, 'F'); F('bold', 6.8, [255, 255, 255]); T(x.qtd, X0 + 1.5, y + 3.3); T(x.descr, X0 + 14, y + 3.3); y += 4.8; };
      hdr();
      for (const l of linhas) {
        const xx = X0 + 14 + Math.min(8, l.n || 0) * 3; const st = o.titulos ? ((l.n || 0) === 0 ? 'bold' : 'normal') : (l.n || 0) <= 1 && !/:/.test(l.t) ? 'bold' : 'normal'; F(st, 7); const q = quebra(l.t, X1 - xx - 1); const h = q.length * 3.05 + 1.1;
        if (y + h > LIM) { pagina(titulo); hdr(); }
        if (l.q) { F('bold', 7.2, ESC); T(String(l.q), X0 + 3, y + 2.8, { align: 'center' }); }
        F(st, 7, [25, 25, 25]); q.forEach((t, k) => T(t, xx, y + 2.8 + k * 3.05)); y += h;
        if ((l.n || 0) === 0) { doc.setDrawColor(...LINHA); doc.setLineWidth(0.15); doc.line(X0, y, X1, y); }
      }
      y += 4;
    }
    function imagem(src, hmax, legenda) {
      if (!src) return; const p = doc.getImageProperties(src); let w = LW, h = w * p.height / p.width; if (h > hmax) { h = hmax; w = h * p.width / p.height; }
      const xx = X0 + (LW - w) / 2; doc.addImage(src, fmtImg(src), xx, y, w, h, undefined, 'FAST'); doc.setDrawColor(...LINHA); doc.setLineWidth(0.2); doc.rect(xx, y, w, h); y += h + 2;
      if (legenda) { F('italic', 6.4, CINZA); T(legenda, X0, y + 2); y += 4; }
    }
    function paragrafo(s, o = {}) { F(o.st || 'normal', o.sz || 7.6, o.cor || [25, 25, 25]); for (const q of quebra(s, o.w || LW)) { precisa(3.8); F(o.st || 'normal', o.sz || 7.6, o.cor || [25, 25, 25]); T(q, o.x || X0, y + 3); y += o.lh || 3.6; } y += o.depois ?? 1.2; }
    function marcadores(L) { for (const l of L) { F('normal', 7.4); const q = quebra(l, LW - 5); precisa(q.length * 3.5 + 0.6); doc.setFillColor(...LAR); doc.rect(X0 + 1, y + 1.6, 1.2, 1.2, 'F'); F('normal', 7.4, [25, 25, 25]); q.forEach((t, k) => T(t, X0 + 4, y + 3 + k * 3.5)); y += q.length * 3.5 + 0.8; } y += 2; }

    // ---------- páginas ----------
    const fabDe = (it) => (O.fab || {})[it.key] || null;
    const tituloPag = (t) => { for (const [re, k] of TIT_PAG) if (re.test(t || '')) return x[k]; return trF(t, 'val') || t; };
    const cnpjF = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c; };
    function resumo() {
      pagina(x.resumo);
      const esq = [[I.R[lang].cliente.replace(':', ''), E.cliente], [r.razao.replace(':', ''), E.razao], [r.cnpj.replace(':', ''), cnpjF(E.cnpj)], [r.aosCuid.replace(':', ''), E.aosCuidados], [r.projObra.replace(':', ''), tr(E.obra)], [r.cidade.replace(':', ''), E.cidade]].filter((p) => p[1]);
      const dir = [[x.proposta, D.numero || '—'], [x.rev, String(D.rev ?? '')], [x.data, I.dataLang(D.data, lang)], [x.validade, I.dataLang(D.validade, lang)], [x.norma, (D.flags || {}).normaTxt || ''], [x.vendedor, D.vendedor || '']].filter((p) => p[1]);
      colunas([{ t: r.cliente.replace(':', ''), pares: esq }, { t: x.dadosProp, pares: dir }]); y += 2;
      subtitulo(x.fornec);
      const cab = comPreco ? [x.item, x.qtd, x.equip, x.ponto, x.tot] : [x.item, x.qtd, x.equip, x.ponto];
      const larg = comPreco ? [12, 12, 92, 40, 30] : [12, 12, 112, 50];
      tabela(cab, D.itens.map((it, i) => [String(i + 1), qtdTxt(it.qtd), [E.codigos[it.key] || it.codigo, D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve)].filter(Boolean).join(' — '), numL(it.condicao || ''), comPreco ? din(it.total) : null].filter((v) => v !== null)), larg, { esq: [2, 3], centro: [1], negrito: [0] });
      if (comPreco) { precisa(12); doc.setFillColor(...LAR); doc.rect(X0, y, LW, 8, 'F'); F('bold', 9.4, [255, 255, 255]); T(x.valorTotal.toUpperCase(), X0 + 3, y + 5.4); T(din(D.total), X1 - 3, y + 5.4, { align: 'right' }); y += 11;
        if (usd) { const nt = r.moeda.replace('{taxa}', nf(4).format(Number(O.moeda.taxa))).replace('{data}', O.moeda.data ? r.moedaData.replace('{d}', I.dataLang(O.moeda.data, lang)) : ''); paragrafo(nt, { sz: 6.6, cor: CINZA }); } }
      if (tem('condicoes')) { y += 2; colunas([{ t: x.cond, larga: true, pares: [[x.pagamento, tr(E.pagamento) || '—'], [x.frete, tr(E.frete) || '—'], [x.prazo, prazoTxt().join(' · ') || r.combinar], [x.validade, I.dataLang(D.validade, lang) || '—']] }]); }
      // parcelas por marco, volumes para transporte e opções de fornecimento (só no documento com preços)
      if (tem('condicoes') && comPreco) { const n0 = (v) => (typeof v === 'number' ? new Intl.NumberFormat(I.LOC[lang], { maximumFractionDigits: 2 }).format(v) : String(v || ''));
        if ((E.parcelas || []).length) { y += 2; precisa(24); faixa(r.h_parcelas, X0, LW); paragrafo(E.parcelasPrazo ? r.parcPrazo.replace('{p}', tr(E.parcelasPrazo)) : r.parcMarcos, { sz: 7.2 }); tabela(r.thParc, E.parcelas.map((q) => [n0(q.pct) + '%', tr(q.marco || '')]), [24, LW - 24], { esq: [1], centro: [0] }); }
        if ((E.volumes || []).length) { y += 1; precisa(24); faixa(r.h_volumes, X0, LW); tabela(r.thVol, E.volumes.map((q) => [tr(q.nome), q.c ? n0(q.c) + ' mm' : '—', q.l ? n0(q.l) + ' mm' : '—', q.a ? n0(q.a) + ' mm' : '—', q.peso ? n0(q.peso) + ' kg' : '—']), [LW - 4 * 34, 34, 34, 34, 34], { centro: [1, 2, 3, 4] }); }
        for (const op of E.opcoes || []) { y += 1; precisa(22); faixa(r.h_opcao + (op.titulo ? ' — ' + tr(op.titulo) : ''), X0, LW); for (const l of I.linhasDe(op.texto)) paragrafo(tr(l), { sz: 7.4 });
          if (typeof op.valor === 'number' && op.valor) paragrafo((op.valor < 0 ? r.opcAbat : r.opcAcr).replace('{v}', din(Math.abs(op.valor))), { sz: 7.4, st: 'bold' }); } }
      if (tem('conheca') && (M.somos || []).length) { y += 3; precisa(30); faixa(x.sobre, X0, LW); paragrafo((M.somos || [])[0], { sz: 7.4, lh: 3.5 }); }
      const selos = (O.img && O.img.selos) || AS.img.selos; if (selos && y < LIM - 26) { const p = doc.getImageProperties(selos); const w = 56, h = w * p.height / p.width; doc.addImage(selos, fmtImg(selos), X1 - w, LIM - h - 1, w, h, 'selos', 'FAST'); }
    }
    function prazoTxt() { const fab = Number(E.prazoFab) || 0, ent = Number(E.prazoEnt) || 0; const L = []; if (fab) L.push(r.fab.replace('{n}', fab)); if (ent) L.push(r.ent.replace('{n}', ent)); if (fab || ent) L.push(r.tot.replace('{n}', fab + ent)); for (const l of I.linhasDe(E.prazoTexto)) L.push(tr(l)); return L; }
    // pontos de trabalho (um por bomba) e critérios da NFPA 20 (nominal, 150% da vazão, shutoff e fim da curva, com potências)
    function pontosNfpa(it) {
      const nv = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? '—' : nf(d === undefined ? (Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1) : d).format(v));
      const pts = it.pontos || [];
      if (pts.length) { y += 1.5; precisa(22); faixa(x.pontosT, X0, LW);
        const loc = pts.some((b) => b.potLocal > 0);
        if (loc) tabela([x.bombaN, x.acionC, x.modelo, x.vazao + ' (m³/h)', x.pressao + ' (mca)', x.potNom + ' (HP)', x.potLocal + ' (HP)', x.rotacao + ' (rpm)'],
          pts.map((b, k) => [String(k + 1), fdV(b.acion), b.mod || '—', nv(b.vz), nv(b.pr), nv(b.pot), b.potLocal > 0 ? nv(b.potLocal, 0) : '—', nv(b.rpm, 0)]), [12, 28, 44, 20, 20, 22, 22, 18], { esq: [1, 2] });
        else tabela([x.bombaN, x.acionC, x.modelo, x.vazao + ' (m³/h)', x.pressao + ' (mca)', x.potNom + ' (HP)', x.rotacao + ' (rpm)'],
          pts.map((b, k) => [String(k + 1), fdV(b.acion), b.mod || '—', nv(b.vz), nv(b.pr), nv(b.pot), nv(b.rpm, 0)]), [12, 30, 62, 22, 20, 22, 18], { esq: [1, 2] }); y += 2; }
      const N = (O.nfpa || {})[it.key]; const res = (v) => (v === null || v === undefined ? '—' : v ? x.atende : x.naoAtende);
      const linhas = []; const notas = [];
      if (N && N.qN && N.hN) {
        const U = N.U; // na unidade da LS Fire (m³/h, m, HP), qualquer que seja a da curva
        const fq = (v) => uLS(v, U.q), fh = (v) => uLS(v, U.h), fp = (v) => uLS(v, U.p, true);
        linhas.push([N.base === 'nominal' ? x.nom100 : x.trab100, fq(N.qN), fh(N.hN), fh(N.hN0), fp(N.pN), '']);
        linhas.push([x.v150, fq(N.q150), N.h150Lim ? x.minW + fh(N.h150Lim) + ' (65%)' : '—', fh(N.h150), fp(N.p150), res(N.ok150)]);
        linhas.push([x.shutC, fq(0), N.shLim ? x.maxW + fh(N.shLim) + ' (140%)' : '—', fh(N.sh), fp(N.pSh), res(N.okSh)]);
        if (N.qFim) linhas.push([x.fimC, fq(N.qFim), '—', fh(N.hFim), fp(N.pFim), '']);
        if (N.pMax) notas.push(x.potMax + ': ' + uLS(N.pMax, U.p) + '.');
        // motor diesel corrigido para altitude/temperatura do local × potência máxima absorvida na curva (mesma unidade: HP)
        const dl = pts.find((b) => b.potLocal > 0 && !b.jockey);
        if (N.pMax && dl) { const maxHP = /kw/i.test(U.p) ? N.pMax / 0.7457 : /cv/i.test(U.p) ? N.pMax * 0.7355 / 0.7457 : N.pMax; notas.push(x.notaDerat.replace('{loc}', nv(dl.potLocal, 0) + ' HP').replace('{max}', nv(maxHP, 0) + ' HP').replace('{res}', dl.potLocal >= maxHP ? x.atende : x.naoAtende)); }
        if (N.base !== 'nominal') notas.push(x.notaTrab); notas.push(x.notaN);
      } else {
        // sem curva (ou com o ponto de trabalho fora dela): os limites a partir do ponto de trabalho de cada bomba principal
        // (a jockey não entra na NFPA 20)
        const vistos = new Set(); const princ = pts.filter((b) => !b.jockey && b.pr > 0 && !vistos.has(b.vz + '|' + b.pr) && vistos.add(b.vz + '|' + b.pr));
        princ.forEach((b) => { const sfx = princ.length > 1 ? ' — ' + x.bombaN + ' ' + (pts.indexOf(b) + 1) : '';
          linhas.push([x.trab100 + sfx, nv(b.vz) + ' m³/h', nv(b.pr) + ' mca', '—', '—', '']);
          linhas.push([x.v150 + sfx, nv(b.vz * 1.5) + ' m³/h', x.minW + nv(b.pr * 0.65, 1) + ' mca (65%)', '—', '—', '—']);
          linhas.push([x.shutC + sfx, '0 m³/h', x.maxW + nv(b.pr * 1.4, 1) + ' mca (140%)', '—', '—', '—']); });
        if (N && N.qFim) { const U = N.U; linhas.push([x.fimC, uLS(N.qFim, U.q), '—', uLS(N.hFim, U.h), uLS(N.pFim, U.p, true), '']); if (N.pMax) notas.push(x.potMax + ': ' + uLS(N.pMax, U.p) + '.'); }
        if (linhas.length) notas.push(N ? x.notaFora : x.notaSem, x.notaN.split('. ')[0] + '.');
      }
      if (!linhas.length) return;
      // tabela e notas juntas (as notas não vão sozinhas para a página seguinte)
      const nl = notas.reduce((a, n) => a + quebra(n, LW).length, 0); y += 1.5; precisa(14 + linhas.length * 6.5 + nl * 3 + 2); faixa(x.nfpaT, X0, LW);
      tabela([x.ptoC, x.vazao, x.hExig, x.hCurva, x.potAbs, x.res], linhas, [42, 36, 34, 24, 28, 22], { negrito: [5] });
      F('italic', 6.2, CINZA); for (const n of notas) for (const q of quebra(n, LW)) { precisa(4); T(q, X0, y + 2.6); y += 3; } y += 2;
    }
    // folha de desempenho no padrão Peerless (Pump Performance Datasheet), para qualquer fabricante: os campos lidos do PDF
    // são reconhecidos pelo nome (não pelo título do bloco, que muda de fabricante para fabricante) e vão para seções fixas.
    // Dados de motor da folha da bomba não entram (o acionador do item é o da formação). Sem o dado, o calculado pela curva.
    const PADL = {
      pt: { cond: 'Condições de operação', nfpa: 'Limites NFPA', liq: 'Líquido', mat: 'Materiais', pres: 'Dados de pressão', constr: 'Construção', faixa: 'Faixa de operação (fabricante)', outros: 'Outros dados',
        vazao: 'Vazão nominal', altura: 'Altura diferencial nominal', pSuc: 'Pressão de sucção, nominal / máx.', npshD: 'NPSH disponível', freq: 'Frequência', estag: 'Estágios', tipo: 'Tipo de bomba',
        rot: 'Rotação nominal', dRat: 'Diâmetro do rotor, nominal', dMax: 'Diâmetro do rotor, máximo', dMin: 'Diâmetro do rotor, mínimo', qRat: 'Vazão nominal (NFPA)', hRat: 'Altura nominal (NFPA)', pRat: 'Potência no ponto nominal',
        p150: 'Potência a 150% da vazão', pPeak: 'Potência máxima', eff: 'Rendimento no ponto nominal', q150: 'Vazão a 150%', h150: 'Altura a 150%, real / limite', hSh: 'Altura em shutoff, real / limite', npshR: 'NPSH requerido',
        fluido: 'Fluido', temp: 'Temperatura máx.', dens: 'Densidade', visc: 'Viscosidade', pVap: 'Pressão de vapor', pTrab: 'Pressão máx. de trabalho', pAdm: 'Pressão máx. admissível da carcaça', pAdmS: 'Pressão máx. admissível de sucção', pHid: 'Pressão de teste hidrostático',
        bSuc: 'Bocal de sucção', bRec: 'Bocal de recalque', sentido: 'Sentido de rotação', vedacao: 'Vedação do eixo', acopl: 'Acoplamento', qNomF: 'Vazão nominal do fabricante', qMax: 'Vazão máxima', qMin: 'Vazão mínima', hNomF: 'Altura nominal do fabricante', hQmax: 'Altura na vazão máxima', hQmin: 'Altura na vazão mínima' },
      en: { cond: 'Operating conditions', nfpa: 'NFPA limits', liq: 'Liquid', mat: 'Materials', pres: 'Pressure data', constr: 'Construction', faixa: 'Operating range (manufacturer)', outros: 'Other data',
        vazao: 'Flow, rated', altura: 'Differential head, rated', pSuc: 'Suction pressure, rated / max', npshD: 'NPSH available', freq: 'Frequency', estag: 'Stages', tipo: 'Pump type',
        rot: 'Speed, rated', dRat: 'Impeller diameter, rated', dMax: 'Impeller diameter, maximum', dMin: 'Impeller diameter, minimum', qRat: 'Flow, rated (NFPA)', hRat: 'Head, rated (NFPA)', pRat: 'Power, rated',
        p150: 'Power required at 150% flow', pPeak: 'Peak power', eff: 'Efficiency, rated', q150: 'Flow at 150%', h150: 'Head at 150%, actual / limit', hSh: 'Head at shutoff, actual / limit', npshR: 'NPSH required',
        fluido: 'Liquid type', temp: 'Temperature, max', dens: 'Density', visc: 'Viscosity', pVap: 'Vapor pressure', pTrab: 'Maximum working pressure', pAdm: 'Maximum allowable casing pressure', pAdmS: 'Maximum allowable suction pressure', pHid: 'Hydrostatic test pressure',
        bSuc: 'Suction nozzle', bRec: 'Discharge nozzle', sentido: 'Direction of rotation', vedacao: 'Shaft seal', acopl: 'Coupling', qNomF: 'Manufacturer nominal flow', qMax: 'Maximum flow', qMin: 'Minimum flow', hNomF: 'Manufacturer nominal head', hQmax: 'Head at maximum flow', hQmin: 'Head at minimum flow' },
      es: { cond: 'Condiciones de operación', nfpa: 'Límites NFPA', liq: 'Líquido', mat: 'Materiales', pres: 'Datos de presión', constr: 'Construcción', faixa: 'Rango de operación (fabricante)', outros: 'Otros datos',
        vazao: 'Caudal nominal', altura: 'Altura diferencial nominal', pSuc: 'Presión de succión, nominal / máx.', npshD: 'NPSH disponible', freq: 'Frecuencia', estag: 'Etapas', tipo: 'Tipo de bomba',
        rot: 'Velocidad nominal', dRat: 'Diámetro del impulsor, nominal', dMax: 'Diámetro del impulsor, máximo', dMin: 'Diámetro del impulsor, mínimo', qRat: 'Caudal nominal (NFPA)', hRat: 'Altura nominal (NFPA)', pRat: 'Potencia en el punto nominal',
        p150: 'Potencia al 150% del caudal', pPeak: 'Potencia máxima', eff: 'Rendimiento en el punto nominal', q150: 'Caudal al 150%', h150: 'Altura al 150%, real / límite', hSh: 'Altura en shutoff, real / límite', npshR: 'NPSH requerido',
        fluido: 'Fluido', temp: 'Temperatura máx.', dens: 'Densidad', visc: 'Viscosidad', pVap: 'Presión de vapor', pTrab: 'Presión máx. de trabajo', pAdm: 'Presión máx. admisible de la carcasa', pAdmS: 'Presión máx. admisible de succión', pHid: 'Presión de prueba hidrostática',
        bSuc: 'Boquilla de succión', bRec: 'Boquilla de descarga', sentido: 'Sentido de giro', vedacao: 'Sello del eje', acopl: 'Acoplamiento', qNomF: 'Caudal nominal del fabricante', qMax: 'Caudal máximo', qMin: 'Caudal mínimo', hNomF: 'Altura nominal del fabricante', hQmax: 'Altura en caudal máximo', hQmin: 'Altura en caudal mínimo' } };
    // [chave, grupo, nome do campo no PDF, bloco preferido]
    const PADR = [
      ['vazao', 'cond', /^(Flow, rated|Flow|Vazão|Caudal)$/i, /Operat|Opera[çc]/i], ['altura', 'cond', /^Differential head.*\(actual\)$|^Differential head|^(Head|Altura manom[ée]trica|Altura)$/i, /Operat|Opera[çc]/i],
      ['pSuc', 'cond', /Suction pressure/i], ['npshD', 'cond', /NPSH available|NPSH dispon/i], ['freq', 'cond', /Frequency|Frequ[êe]ncia|Frecuencia/i], ['estag', 'cond', /^(Stages|Number of Stages|N[úu]mero de est[áa]gios)$/i], ['tipo', 'cond', /^Pump Type$|Tipo de bomba/i],
      ['rot', 'nfpa', /^(Speed, rated|Speed|Rota[çc][ãa]o|Velocidad)$/i, /NFPA/i], ['dRat', 'nfpa', /Impeller diameter, rated|Impeller D Designed|^Impeller D$/i], ['dMax', 'nfpa', /Impeller diameter, maximum|Impeller D Max/i], ['dMin', 'nfpa', /Impeller diameter, minimum|Impeller D Min/i],
      ['qRat', 'nfpa', /^Flow, rated$/i, /NFPA/i, true], ['hRat', 'nfpa', /^Head, rated$/i, /NFPA/i, true], ['pRat', 'nfpa', /^Power, rated$|^Shaft Power$/i], ['p150', 'nfpa', /Power required at 150%/i], ['pPeak', 'nfpa', /Peak power|Maximum Shaft Power/i],
      ['eff', 'nfpa', /^Efficiency, rated$|^Efficiency$|^Rendimento$/i], ['q150', 'nfpa', /Flow at 150%/i], ['h150', 'nfpa', /Head at 150%/i], ['hSh', 'nfpa', /Head at shutoff|Head \(Q=0\)/i], ['npshR', 'nfpa', /^NPSHr?$|NPSH required|NPSH requerido/i],
      ['fluido', 'liq', /^(Liquid type|Fluid|Fluido)$/i], ['temp', 'liq', /Temperature|Temperatura/i], ['dens', 'liq', /density|Densidade/i], ['visc', 'liq', /Viscosity|Viscosidade/i], ['pVap', 'liq', /Vapor pressure/i],
      ['pTrab', 'pres', /^Maximum working pressure$|Max\.? Operation Pressure/i], ['pAdm', 'pres', /allowable working pressure|Max\.? Casing Pressure/i], ['pAdmS', 'pres', /allowable suction pressure/i], ['pHid', 'pres', /Hydrostatic test pressure/i],
      ['bSuc', 'constr', /Suction (Nozzle|Flange Diameter)/i], ['bRec', 'constr', /Dis?charge (Nozzle|Flange Diameter)/i], ['sentido', 'constr', /Direction of Rotation/i], ['vedacao', 'constr', /^Seal Type$|^Pump Seal$/i],
      ['qNomF', 'faixa', /^Flow Nominal$/i], ['qMax', 'faixa', /^Flow Max/i], ['qMin', 'faixa', /^Flow Min/i], ['hNomF', 'faixa', /^Head Nominal$/i], ['hQmax', 'faixa', /^Head at Qmax/i], ['hQmin', 'faixa', /^Head at Qmin/i]];
    const GRUPO_SEC = [[/NFPA/i, 'nfpa'], [/Impeller|Rotor/i, 'nfpa'], [/Liquid|L[íi]quido|Fluid/i, 'liq'], [/Material/i, 'mat'], [/Pressure|Press[ãa]o/i, 'pres'], [/Coupling|Seal|Construction|Acoplamento|Veda[çc]/i, 'constr'], [/Operat|Opera[çc]/i, 'cond']];
    // mesmo dado com outro nome: "Diâmetro do rotor" × "Diâmetro do rotor (projeto)" com o mesmo valor; do cadastro, o mesmo nome já preenchido
    const normR = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)|[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const repetido = (L, lb, vv, cad) => L.some(([k, v]) => { const a = normR(k), b = normR(lb); return (cad && a === b) || (v === vv && a && b && (a.startsWith(b) || b.startsWith(a))); });
    function secoesPadrao(dados, pgs, N, it, extra) {
      const L = PADL[lang] || PADL.pt; const fmt = (v) => (fb && fb.ehMedida(v) ? medida(v) : swap(trF(v, 'val')));
      const nv = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? nf(d).format(v) : null);
      const secs = dados.secoes.filter((s) => pgs.includes(s.pag) && !/Project|Motor|Engine|Driver|Acionador/i.test(s.t));
      const campos = []; for (const s of secs) for (const c of s.campos || []) if (c.on !== false && String(c.v || '').trim()) campos.push({ k: c.k, v: c.v, t: s.t, usado: false });
      // dados construtivos da bomba no cadastro: completam a folha (a do fabricante anexada na proposta tem prioridade)
      for (const c of extra || []) campos.push({ k: c.k, v: c.v, t: c.t, usado: false, cad: true });
      const G = { cond: [], nfpa: [], liq: [], mat: [], pres: [], constr: [], faixa: [], outros: [] };
      for (const [k, g, re, secPref, soSec] of PADR) {
        const cands = campos.filter((c) => !c.usado && re.test(String(c.k).trim())); const c = (secPref && cands.find((q) => secPref.test(q.t))) || (soSec ? null : cands[0]);
        let v = c ? fmt(c.v) : null; if (c) { c.usado = true; for (const q of cands) if (fmt(q.v) === v || q.cad) q.usado = true; } // o mesmo dado repetido em outro bloco da folha (ou no cadastro) sai uma vez só
        // o que a folha não traz e a curva dá (vazão e altura nominais, 150%, shutoff, potências)
        if (N && N.U) { const U = N.U;
          if (!v && k === 'qRat' && N.base === 'nominal' && N.qN) v = uLS(N.qN, U.q); if (!v && k === 'hRat' && N.base === 'nominal' && N.hN) v = uLS(N.hN, U.h);
          if (!v && k === 'q150' && N.q150) v = uLS(N.q150, U.q); if (!v && k === 'p150' && N.p150) v = uLS(N.p150, U.p); if (!v && k === 'pPeak' && N.pMax) v = uLS(N.pMax, U.p);
          if (k === 'h150' && N.h150Lim && (!v || !/\//.test(v))) v = (v ? v.replace(/ mc?a?$/, '') : N.h150 !== null && N.h150 !== undefined ? uLS(N.h150, U.h).replace(/ mc?a?$/, '') : '—') + ' / ' + uLS(N.h150Lim, U.h);
          if (k === 'hSh' && N.shLim && (!v || !/\//.test(v))) v = (v ? v.replace(/ mc?a?$/, '') : N.sh !== null && N.sh !== undefined ? uLS(N.sh, U.h).replace(/ mc?a?$/, '') : '—') + ' / ' + uLS(N.shLim, U.h); }
        if (!v && k === 'qRat' && it.vazaoNominal) v = it.vazaoNominal;
        if (v) G[g].push([L[k], v]);
      }
      // acoplamento e vedação: o bloco inteiro numa linha só (tipo · fabricante · material / modelo), sem "Tipo" e "Fabricante" soltos
      const junta = (re, lb, pos) => { const bl = campos.filter((c) => !c.usado && re.test(c.t)); if (!bl.length) return;
        const ord = (c) => (/Seal Type|^Type$|Tipo/i.test(c.k) ? 0 : /Manufacturer|Fabricante/i.test(c.k) ? 1 : 2); const vs = bl.filter((c) => !/Direction|Sentido/i.test(c.k)).sort((p, q) => ord(p) - ord(q)).map((c) => fmt(c.v));
        const i = G.constr.findIndex((q) => q[0] === lb); const txt = [...new Set((i >= 0 ? [G.constr[i][1]] : []).concat(vs))].join(' · ');
        if (i >= 0) G.constr[i][1] = txt; else G.constr.splice(pos === undefined ? G.constr.length : pos, 0, [lb, txt]); bl.forEach((c) => { if (!/Direction|Sentido/i.test(c.k)) c.usado = true; }); };
      junta(/Coupling|Acoplamento/i, L.acopl); junta(/Seal|Veda[çc]/i, L.vedacao);
      // o restante vai para o grupo do bloco de onde veio (ou "Outros dados"), com o nome traduzido
      const ja = new Set(Object.values(G).flat().map((q) => q[0] + '|' + q[1]));
      for (const c of campos.filter((q) => !q.usado)) { const lb = trF(c.k, 'rot') || c.k, vv = fmt(c.v); if (ja.has(lb + '|' + vv) || repetido(Object.values(G).flat(), lb, vv, c.cad)) continue; ja.add(lb + '|' + vv); const g = (GRUPO_SEC.find(([re]) => re.test(c.t)) || [0, /Pump Data|Dados da bomba/i.test(c.t) ? 'faixa' : 'outros'])[1]; G[g].push([lb, vv]); }
      return [['cond', 0], ['nfpa', 0], ['liq', 1], ['mat', 1], ['pres', 1], ['constr', 1], ['faixa', 1], ['outros', 1]].map(([g, col]) => ({ t: L[g], col, pares: G[g] }));
    }
    function itens() {
      D.itens.forEach((it, i) => {
        const fd = it.folha || {}; const dfd = it.fd || {}; const FA = fabDe(it); const dados = FA && FA.dados; const nItem = r.item.replace('{n}', i + 1);
        const cod = E.codigos[it.key] || it.codigo || '';
        const camposOn = (s) => (s.campos || []).filter((c) => c.on !== false && String(c.v || '').trim()).map((c) => [trF(c.k, 'rot'), fb && fb.ehMedida(c.v) ? medida(c.v) : swap(trF(c.v, 'val'))]);
        const secsDe = (pag) => (dados ? dados.secoes.filter((s) => s.pag === pag && s.t !== 'Project') : []).map((s) => ({ t: trF(s.t, 'sec'), pares: camposOn(s) }));
        const pags = dados ? dados.paginas.filter((p) => p.tipo === 'dados') : [];
        const ident = [[x.item, String(i + 1)], [x.codigo, cod], [x.quantidade, qtdTxt(it.qtd) + (it.un ? ' ' + it.un : '')], [x.ponto, (it.pontos || []).length ? '' : numL(it.condicao || '')]].filter((p) => p[1]);
        const descEq = D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve);
        if (dados) { const pj = (dados.secoes.find((s) => s.t === 'Project') || { campos: [] }).campos; const v = (re) => (pj.find((c) => re.test(c.k)) || {}).v; const tg = v(/^Tag/); const md = v(/Model$|^Model \//); if (md) ident.push([x.modelo, md]); if (tg) ident.push([x.tag, tg]); if (dados.fabricante) ident.push([x.fabr, dados.fabricante]); }
        // 1) desempenho: identificação + seções da primeira folha + curva
        pagina(x.desemp + ' — ' + nItem);
        if (descEq) { F('bold', 8.2, ESC); for (const q of quebra(descEq, LW)) { T(q, X0, y + 3); y += 3.9; } y += 2.5; }
        const sec1 = [{ t: x.ident, pares: ident, col: dados ? 0 : undefined }];
        const cadB = ((it.cad || {}).fds || []).filter((f) => f.uso === 'bomba'); const cadCampos = cadB.flatMap((f) => f.secoes.flatMap((q) => q.campos.map(([k, v]) => ({ k, v, t: q.t }))));
        if (!dados && cadB[0]) { if (cadB[0].desc && !ident.some((q) => q[0] === x.modelo)) ident.push([x.modelo, cadB[0].desc]); if (cadB[0].fabricante) ident.push([x.fabr, cadB[0].fabricante]); }
        if (dados) sec1.push(...secoesPadrao(dados, [pags.length ? pags[0].n : -1].concat(dados.paginas.filter((q) => q.tipo === 'curva').map((q) => q.n)), (O.nfpa || {})[it.key], it, cadCampos));
        else {
          for (const b of fd.hidraulica || []) sec1.push({ t: x.hidr + ' — ' + r.bomba.replace('{n}', b.n) + ' (' + fdV(b.acion) + (b.cfg ? ' · ' + fdV(b.cfg) : '') + ')', pares: b.dados.filter((d) => d[1]).map((d) => [fdT('@' + d[0]), numL(d[1])]) });
          if ((dfd.bomba || []).length) sec1.push({ t: x.fdB, pares: dfd.bomba.map((d) => [fdT('@' + d[0]), fdV(d[1])]) });
          if ((dfd.motor || []).length) sec1.push({ t: x.fdM, pares: dfd.motor.map((d) => [fdT('@' + d[0]), fdV(d[1])]) });
          // sem folha do fabricante: os dados construtivos da bomba no cadastro entram aqui, nas mesmas seções (sem repetir o que já está acima)
          if (cadCampos.length) { const ja = sec1.flatMap((q) => q.pares); for (const q of secoesPadrao({ secoes: [] }, [], null, {}, cadCampos)) { q.pares = q.pares.filter(([k, v]) => !repetido(ja, k, v, true)); ja.push(...q.pares); if (q.pares.length) sec1.push(Object.assign(q, { col: undefined })); } }
        }
        colunas(sec1);
        F('italic', 6.2, CINZA); T(dados ? (dados.fabricante ? x.fonte.replace('{f}', dados.fabricante) : x.fonteSem) : x.semFab, X0, y + 1.5); y += 4;
        pontosNfpa(it);
        const curva = (FA && FA.curva) || O.curvas[it.key];
        if (curva) { if (LIM - y < 95) pagina(x.curva + ' — ' + nItem); else subtitulo(x.curva); imagem(curva, Math.min(LIM - y - 4, 170)); }
        // 2) demais folhas de dados do fabricante (construtiva, dados adicionais), com as tabelas dessas páginas
        const temCadBomba = ((it.cad || {}).fds || []).length > 0;
        for (const pg of pags.slice(1).filter((q) => !(temCadBomba && /Construction/i.test(q.titulo)))) {
          const ss = secsDe(pg.n); const tb = (dados.tabelas || []).filter((t) => t.pag === pg.n); if (!ss.some((s) => s.pares.length) && !tb.length) continue;
          pagina(tituloPag(pg.titulo) + ' — ' + nItem); colunas(ss);
          for (const t of tb) { y += 2; const nc = Math.max(t.cab.length, ...t.linhas.map((l) => l.length)); const cab = t.cab.length === nc ? t.cab.map((c, k) => (k ? c : trF(c, 'sec') || c)) : [''].concat(t.cab).slice(0, nc); const w0 = 62; const ws = [w0].concat(Array(nc - 1).fill((LW - w0) / (nc - 1)));
            tabela(cab.map((c) => trF(c, 'rot') || c), t.linhas.map((l) => [trF(l[0], 'rot') || l[0]].concat(l.slice(1).map(swap))), ws, { esq: [0] }); }
        }
        if (dados && (dados.tabelas || []).some((t) => t.pag === pags[0]?.n)) { /* tabela da primeira folha: já resumida nas seções */ }
        // 2b) bomba e acionador vindos do cadastro (folha técnica de cada insumo); a folha anexada na proposta tem prioridade
        { const cad = it.cad || {}; const temEng = !!(dados && dados.secoes.some((q) => /Engine|Motor|Driver/i.test(q.t)));
          const usar = (cad.fds || []).filter((f) => f.uso !== 'bomba'); void temEng; // a bomba já está na folha de desempenho
          if (usar.length) { pagina(x.constr + ' — ' + nItem);
            // bomba primeiro (construção, materiais, testes, pesos), depois o acionador (informações do motor)
            const ord = usar.slice().sort((a, b) => (a.uso === 'bomba' ? 0 : 1) - (b.uso === 'bomba' ? 0 : 1));
            // com bomba e motor: bomba na coluna da esquerda, motor na da direita (como a Construction Datasheet)
            const duas = ord.some((f) => f.uso === 'bomba') && ord.some((f) => f.uso === 'motor');
            colunas(ord.flatMap((f) => { const col = duas ? (f.uso === 'bomba' ? 0 : 1) : undefined; return [{ col, t: fdT(f.titulo), pares: [[x.modelo, f.desc], [x.fabr, f.fabricante], [x.quantidade, qtdTxt(f.qtd)]].filter((q) => q[1]) }].concat(f.secoes.map((q) => ({ col, t: (trF(q.t, 'sec') || q.t), pares: q.campos.map(([k, v]) => [trF(k, 'rot'), fb && fb.ehMedida(v) ? medida(v) : swap(trF(v, 'val'))]) }))); }));
            F('italic', 6.2, CINZA); T(x.cadFonte, X0, y + 1.5); y += 4; } }
        // 3) outras curvas e desenhos escolhidos
        for (const pg of dados ? dados.paginas.filter((p) => (p.tipo === 'curva' || p.tipo === 'desenho' || p.tipo === 'anexo') && FA.paginas && FA.paginas[p.n]) : []) {
          const im = FA.paginas[pg.n]; const paisagem = im.w > im.h; pagina(tituloPag(pg.titulo) + ' — ' + nItem, paisagem); imagem(im.url, LIM - y - 2);
        }
        // 3b) desenhos do cadastro (do modelo pronto ou da família de equipamento)
        for (const url of ((O.desenhos || {})[it.key] || [])) { const p = doc.getImageProperties(url); pagina(x.desenho + ' — ' + nItem, p.width > p.height); imagem(url, LIM - y - 2); }
        // 4) escopo: o do fabricante (grupos marcados) + itens da formação LS Fire + especificações
        pagina(x.escopo + ' — ' + nItem);
        F('bold', 8, ESC); for (const q of quebra([cod, D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve)].filter(Boolean).join(' — '), LW)) { T(q, X0, y + 3); y += 3.8; } F('normal', 7.2, CINZA); T([x.quantidade + ': ' + qtdTxt(it.qtd) + (it.un ? ' ' + it.un : ''), it.condicao ? x.ponto + ': ' + numL(it.condicao) : ''].filter(Boolean).join('   ·   '), X0, y + 3); y += 7;
        const gs = dados ? (dados.escopo || []).filter((g) => g.on !== false) : [];
        for (const g of gs) escopo(trF(g.g, 'sec') || g.g, g.linhas.filter((l) => l.on !== false).map((l) => ({ q: l.q, n: l.n, t: trF(l.t, 'lin') })));
        // escopo da formação por grupo (como o da Peerless), com o texto cadastrado no item ou na família
        if (!(FA && FA.semLs)) for (const g of it.escopoG || []) {
          const L = []; for (const c of g.itens) { L.push({ q: qtdTxt(c.q), n: 0, t: fdT(c.titulo) }); for (const l of c.sub || []) L.push({ n: 1, t: /^#/.test(l) ? fdT('@' + l.slice(1).split('|')[0]) + ': ' + tr(l.split('|').slice(1).join('|')) : tr(l) }); }
          escopo((GRUPO_TR[lang] || {})[g.g] || g.g, L, { titulos: true });
        }
        // frete e prazo não entram no escopo do item: já estão nas condições comerciais do resumo
        const nt = I.linhasDe(E.notasItem[it.key]); if (nt.length) { subtitulo(r.notasItem); marcadores(nt.map(tr)); }
      });
    }
    function planilha() {
      pagina(x.planilha, true);
      const temCod = D.itens.some((it) => E.codigos[it.key] || it.codigo); const seq = D.itens.some((it) => typeof it.unitSemImp === 'number');
      const desc = (it) => (D.tipo === 'SEQ' ? tr(it.completa) || it.breve : tr(it.breve));
      const vv = (v) => (typeof v === 'number' && isFinite(v) ? din(v) : '—');
      if (seq) {
        // em paisagem: preço sem impostos, impostos por dentro (ICMS, PIS, COFINS), IPI por fora e o total; NCM e alíquotas da formação
        const cols = [[x.item, 8], temCod ? [x.codigo, 19] : null, [x.descr, 0], [x.ncm, 17], [x.qtd, 13], [x.unitSem, 25], [x.totSem, 27], [x.icms, 12], [x.pisCof, 15], [x.impR, 25], [x.ipi, 11], [x.ipiR, 21], [x.tot, 28]].filter(Boolean);
        const fixo = cols.reduce((t, c) => t + c[1], 0); cols.find((c) => c[1] === 0)[1] = LW - fixo;
        const iD = cols.findIndex((c) => c[0] === x.descr), iQ = cols.findIndex((c) => c[0] === x.qtd), iN = cols.findIndex((c) => c[0] === x.ncm);
        const linhas = D.itens.map((it, k) => { const pc2 = (num(it.pis) + num(it.cofins)); const imp = typeof it.totalSemIpi === 'number' && typeof it.totalSemImp === 'number' ? it.totalSemIpi - it.totalSemImp : null;
          return [String(k + 1), temCod ? E.codigos[it.key] || it.codigo || '' : null, desc(it), it.ncm || '', qtdTxt(it.qtd) + (it.un ? ' ' + it.un : ''), vv(it.unitSemImp), vv(it.totalSemImp), pct(it.icms), pc2 ? pct(pc2) : '—', vv(imp), it.ipi == null ? '—' : pct(it.ipi), vv(it.ipiValor), vv(it.total)].filter((v, c) => !(c === 1 && !temCod)); });
        const Tt = D.totais || {}; const tot = cols.map(() => ''); tot[iD] = x.totais.toUpperCase();
        tot[cols.findIndex((c) => c[0] === x.totSem)] = vv(Tt.semImp); tot[cols.findIndex((c) => c[0] === x.impR)] = typeof Tt.semIpi === 'number' && typeof Tt.semImp === 'number' ? din(Tt.semIpi - Tt.semImp) : '—';
        tot[cols.findIndex((c) => c[0] === x.ipiR)] = vv(Tt.ipi); tot[cols.length - 1] = vv(D.total);
        tabela(cols.map((c) => c[0]), linhas, cols.map((c) => c[1]), { esq: [iD].concat(temCod ? [1] : []), centro: [iQ, iN], negrito: [cols.length - 1], fonte: 7.2, paisagem: true, total: tot });
        paragrafo(x.notaImp, { sz: 6.6, cor: CINZA });
      } else {
        const cab = [x.item, x.codigo, x.descr, x.qtd, x.un, x.ncm, x.icms, x.ipi, x.unit, x.tot]; const larg = [9, 22, 0, 12, 11, 18, 13, 12, 32, 32]; larg[2] = LW - larg.reduce((t, w) => t + w, 0);
        tabela(cab, D.itens.map((it, i) => [String(i + 1), E.codigos[it.key] || it.codigo || '', desc(it), qtdTxt(it.qtd), it.un || '', it.ncm || '', pct(it.icms), it.ipi == null ? '—' : pct(it.ipi), vv(it.unit), vv(it.total)]), larg, { esq: [1, 2], centro: [3, 4, 5], negrito: [9], fonte: 7.2, paisagem: true });
      }
      precisa(12); doc.setFillColor(...LAR); doc.rect(X0, y, LW, 8, 'F'); F('bold', 9.4, [255, 255, 255]); T(x.valorTotal.toUpperCase(), X0 + 3, y + 5.4); T(din(D.total), X1 - 3, y + 5.4, { align: 'right' }); y += 11;
      if (usd) { const nt = r.moeda.replace('{taxa}', nf(4).format(Number(O.moeda.taxa))).replace('{data}', O.moeda.data ? r.moedaData.replace('{d}', I.dataLang(O.moeda.data, lang)) : ''); paragrafo(nt, { sz: 6.6, cor: CINZA }); }
    }
    function condicoes() {
      pagina(x.cond);
      faixa(r.h_pag, X0, LW); paragrafo(tr(E.pagamento) || '—', { st: 'bold' }); if (M.notaPagamento) paragrafo(r.nota + ' ' + M.notaPagamento, { sz: 7, cor: CINZA }); y += 2;
      faixa(r.h_prazo, X0, LW); for (const l of prazoTxt().concat(prazoTxt().length ? [] : [r.combinar])) paragrafo(l, { depois: 0.4 }); y += 2;
      faixa(r.h_frete, X0, LW); paragrafo(tr(E.frete) || '—'); y += 2;
      const ob = I.linhasDe(E.observacoes).map((l) => (E.ajustados.observacoes ? tr(l) : l)); if (ob.length) { faixa(r.h_obs, X0, LW); marcadores(ob); }
      if ((M.atencao || []).length) { precisa(12); doc.setFillColor(...ESC); doc.rect(X0, y, LW, 9.5, 'F'); doc.setFillColor(...LAR); doc.rect(X0, y, 2.4, 9.5, 'F'); F('bold', 7, [255, 255, 255]); T(r.atencao + (M.atencao[0] || ''), X0 + 5, y + 4); F('normal', 7, [255, 255, 255]); T(M.atencao[1] || '', X0 + 5, y + 7.6); y += 12; }
    }
    function notas() {
      pagina(x.notas);
      for (const [rot, txt, k] of [[r.notas, E.notas, 'notas'], [r.desvios, E.desvios, 'desvios'], [r.exclusoes, E.exclusoes, 'exclusoes']]) {
        const L = I.linhasDe(txt).map((l) => (E.ajustados[k] || (k === 'exclusoes' && I.linhasDe(D.exclusoes).includes(l)) ? tr(l) : l).replace(/^[•\-–]\s*/, '')); if (!L.length) continue;
        precisa(14); faixa(rot, X0, LW); marcadores(L);
      }
    }
    function listas(tit, blocos) { pagina(tit); for (const [t, L] of blocos) { if (!(L || []).length) continue; precisa(14); faixa(t, X0, LW); marcadores(P.aplica(L, D.flags || {}, lang)); } }
    function termos() {
      if (!(M.termos || []).length) return; pagina(x.termos);
      const cw = (LW - 6) / 2, xs = [X0, X0 + cw + 6]; let col = 0; const y0 = y;
      for (const c of M.termos) {
        const bl = [['t', c.t]].concat((c.p || []).flatMap((p) => { F('normal', 6.6); return quebra(p, cw).map((q) => ['p', q]).concat([['g']]); }));
        for (const b of bl) { const h = b[0] === 't' ? 4.6 : b[0] === 'g' ? 1.2 : 2.95; if (y + h > LIM) { if (col === 0) { col = 1; y = y0; } else { pagina(x.termos); col = 0; } }
          if (b[0] === 't') { F('bold', 7, ESC); T(b[1], xs[col], y + 3.4); } else if (b[0] === 'p') { F('normal', 6.6, [40, 40, 40]); T(b[1], xs[col], y + 2.4); } y += h; }
      }
    }
    function contatos() {
      pagina(x.contatos); const cts = (M.contatos || []).filter((c) => (E.contatos || []).includes(c.nome));
      cts.forEach((c, k) => { const cx = k % 2 ? X0 + LW / 2 + 3 : X0; if (k % 2 === 0 && k) y += 22; const yy = y; doc.setFillColor(...CLARO); doc.rect(cx, yy, LW / 2 - 3, 19, 'F'); doc.setFillColor(...LAR); doc.rect(cx, yy, 1.2, 19, 'F');
        F('bold', 8.6, ESC); T(c.nome, cx + 4, yy + 5); F('normal', 7.2, CINZA); [c.cargo, c.tel, c.email].filter(Boolean).forEach((t, j) => T(t, cx + 4, yy + 9.4 + j * 3.6)); });
      y += 26; const sl = (O.img && O.img.slogan) || AS.img.slogan; if (sl) { const p = doc.getImageProperties(sl); const w = 80; doc.addImage(sl, fmtImg(sl), X1 - w, Math.max(y, LIM - w * p.height / p.width - 4), w, w * p.height / p.width, 'slogan', 'FAST'); }
    }
    // ordem: resumo (capa), itens (folhas, curvas, desenhos, escopo), planilha, condições, notas, comissionamento, prazos, termos, contatos
    resumo();
    if (tem('folha') || D.tipo !== 'SEQ') itens();
    if (comPreco && tem('planilha')) planilha();
    if (tem('condicoes')) condicoes();
    if (tem('notas')) notas();
    if (tem('comiss')) { const C = M.comissionamento || {}; listas(x.comiss, [[r.incluso, C.incluso], [r.servAd, C.adicionais], [r.resp, C.responsabilidades]]); }
    if (tem('prazos')) { const PZ = M.prazos || {}; pagina(x.prazos); if (PZ.intro) paragrafo(PZ.intro); for (const [t, L] of [[r.inicio, PZ.inicio], [r.susp, PZ.suspensao]]) if ((L || []).length) { faixa(t, X0, LW); marcadores(L); } if (PZ.recebimento) paragrafo(PZ.recebimento, { sz: 7, cor: CINZA }); }
    if (tem('termos')) termos();
    if (tem('contatos')) contatos();
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight(); F('normal', 6.4, CINZA); T(i + '/' + n, w - 12, h - 9.2, { align: 'right' }); T(x.proposta + ' ' + (D.numero || ''), 12, h - 9.2); }
    const cli = (E.cliente || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 50);
    const pre = { tc: 'PTC', com: 'PC', tec: 'PT' }[O.tipo] || 'PTC';
    const nome = (pre + '-FD_' + String(D.numero || 'sem-numero').replace(/\s*\/\s*/g, '_').replace(/\s+/g, '') + (D.rev !== '' && D.rev != null ? '-Rev.' + D.rev : '') + (lang !== 'pt' ? '_' + lang.toUpperCase() : '') + (usd ? '_USD' : '') + (cli ? '_' + cli : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_') + '.pdf';
    return { bytes: doc.output('arraybuffer'), nome, paginas: n, secoes: SEC };
  }
  // textos do fabricante que o dicionário não traduz (vão para o Claude quando disponível)
  function textosFab(dados, lang) {
    const fb = FB(); if (!fb || !dados || lang === 'en') return []; const out = new Set(); const add = (s, ok) => { s = String(s || '').trim(); if (s && /[a-z]{3}/.test(s) && !/^\S+$/.test(s) && !ok) out.add(s); };
    for (const s of dados.secoes || []) { if (s.t === 'Project') continue; add(s.t, fb.secT(s.t, lang)); for (const c of s.campos || []) if (c.on !== false) { add(c.k, fb.rotT(c.k, lang)); add(c.v, fb.valT(c.v, lang) || fb.ehMedida(c.v)); } }
    for (const g of dados.escopo || []) { if (g.on === false) continue; add(g.g, fb.secT(g.g, lang)); for (const l of g.linhas || []) if (l.on !== false) add(l.t, fb.linhaT(l.t, lang)); }
    for (const t of dados.tabelas || []) for (const l of t.linhas || []) add(l[0], fb.rotT(l[0], lang));
    for (const p of dados.paginas || []) if (!TIT_PAG.some(([re]) => re.test(p.titulo))) add(p.titulo, false);
    return [...out];
  }
  window.PricerPropostaFD = { montar, textosFab };
})();
