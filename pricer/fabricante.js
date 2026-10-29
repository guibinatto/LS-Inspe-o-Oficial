/* LS Pricer — leitura da folha de dados completa do fabricante (ex.: Peerless Express: desempenho, construtiva,
   dados adicionais, curvas, arranjo geral e escopo Qtd/Descrição) a partir do texto posicionado do PDF.
   Nada é inventado: o que não for reconhecido fica de fora e a pessoa confere tudo antes de ir para a proposta.
   A tradução de rótulos e valores usa um dicionário fixo; o resto pode ser traduzido pelo Claude quando disponível. */
(function () {
  'use strict';
  const num = (s) => /^[-+]?[\d.,]+%?$/.test(s) || s === '-' || s === 'N/A';
  // junta pedaços da mesma linha: colados quando o espaço é mínimo (ex.: "DQ6H" "-" "UFAA98")
  function junta(ts) { let out = '', fim = null; for (const t of ts) { out += fim !== null && t.x - fim > 1.2 ? ' ' + t.s : t.s; fim = t.x + t.w; } return out.replace(/\s+/g, ' ').trim(); }
  function linhas(pg) {
    const rows = [];
    for (const it of pg.itens.slice().sort((a, b) => a.y - b.y || a.x - b.x)) { let r = rows.find((z) => Math.abs(z.y - it.y) < 2.6); if (!r) { r = { y: it.y, ts: [] }; rows.push(r); } r.ts.push(it); }
    rows.forEach((r) => r.ts.sort((a, b) => a.x - b.x)); return rows.sort((a, b) => a.y - b.y);
  }
  const RODAPE = /^(Peerless Express|LS Fire Sistemas)|Santa Catarina|Rua Guilherme/i;
  function tituloDe(pg) {
    const cands = pg.itens.filter((i) => i.y < pg.h * 0.16 && i.h >= 11 && !RODAPE.test(i.s)).sort((a, b) => a.y - b.y);
    if (!cands.length) return { t: '', y: -99 };
    const y0 = cands[0].y; return { t: junta(cands.filter((i) => Math.abs(i.y - y0) < 3)).replace(/^(.+)\1$/, '$1'), y: y0 };
  }
  // rótulo e valor de um pedaço de coluna: pelo ":" ou pelo maior espaço entre pedaços
  function par(ts) {
    const i = ts.findIndex((t) => /^:/.test(t.s));
    if (i > 0) { const v = [Object.assign({}, ts[i], { s: ts[i].s.replace(/^:\s*/, '') })].concat(ts.slice(i + 1)).filter((t) => t.s); return [junta(ts.slice(0, i)), junta(v)]; }
    if (ts.length < 2) return null;
    let g = -1, gi = -1; for (let k = 1; k < ts.length; k++) { const d = ts[k].x - (ts[k - 1].x + ts[k - 1].w); if (d > g) { g = d; gi = k; } }
    return g > 12 ? [junta(ts.slice(0, gi)), junta(ts.slice(gi))] : null;
  }
  function ler(paginas) {
    const out = { fabricante: '', paginas: [], secoes: [], tabelas: [], escopo: [] };
    const todo = paginas.map((p) => p.itens.map((i) => i.s).join(' ')).join(' ');
    out.fabricante = /Peerless/i.test(todo) ? 'Peerless' : /Clarke/i.test(todo) && !/Pump/i.test(todo) ? 'Clarke' : '';
    const vistos = new Set(); let identOk = false;
    const sec = (t, n) => { let s = out.secoes.find((x) => x.t === t); if (!s) { s = { t, pag: n, campos: [] }; out.secoes.push(s); } return s; };
    for (const pg of paginas) {
      const T0 = tituloDe(pg); const tit = T0.t;
      // corta o gráfico que algumas folhas trazem embaixo dos dados (começa no aviso de aceitação do teste)
      const todas = linhas(pg).filter((r) => r.y > pg.h * 0.035 && r.y < pg.h - 36 && !RODAPE.test(junta(r.ts)));
      const ehEscopo = todas.some((r) => r.ts.length >= 2 && r.ts[0].s === 'Qty' && /^Description/.test(r.ts[1].s));
      const rows = ehEscopo ? todas : todas.filter((r) => Math.abs(r.y - T0.y) > 3);
      const corte = (rows.find((r) => /Performance based on test|rated point is the only/i.test(junta(r.ts))) || {}).y || 1e9;
      const txt = rows.map((r) => junta(r.ts)).join('\n');
      const escopo = ehEscopo;
      const curva = /Curve/i.test(tit);
      const desenho = /Arrangement|Dimension|Drawing/i.test(tit) || (!tit && pg.itens.length < 120 && !/:/.test(txt));
      const tipo = escopo ? 'escopo' : curva ? 'curva' : desenho ? 'desenho' : 'dados';
      const P = { n: pg.n, titulo: tit || (desenho ? 'Desenho' : 'Página ' + pg.n), tipo, w: pg.w, h: pg.h };
      if (curva) {
        // área do gráfico: abaixo do aviso do fabricante até o eixo de vazão
        const ax = pg.itens.filter((i) => (i.s === 'Flow' || /^Flow\s*-/.test(i.s)) && i.h >= 8.5).sort((a, b) => a.y - b.y)[0];
        const tabY = ax ? (pg.itens.filter((i) => i.y > ax.y + 2 && /^(Customer|Project name|Tag Number)$/.test(i.s)).sort((a, b) => a.y - b.y)[0] || {}).y : null;
        const aviso = pg.itens.filter((i) => /buyer\.?$|tolerance\.?$|Hyd Inst/i.test(i.s) && (!ax || i.y < ax.y)).sort((a, b) => b.y - a.y)[0];
        const y0 = aviso ? aviso.y + 4 : (pg.itens.find((i) => i.s === tit) || { y: 60 }).y + 10; const y1 = ax ? Math.min(ax.y + 7, tabY ? tabY - 9 : 1e9) : pg.h * 0.62;
        P.caixa = { x: 14, y: y0, w: pg.w - 28, h: Math.max(80, y1 - y0) };
      }
      out.paginas.push(P); const dadosAte = tipo === 'dados' ? corte : 1e9;
      if (tipo === 'escopo') {
        let g = null, emTab = false;
        for (const r of rows) {
          const t0 = r.ts[0]; const big = t0.h >= 12 && t0.x < pg.w * 0.2 && r.ts.length === 1;
          if (big) { const nome = t0.s; g = out.escopo.find((x) => x.g === nome && x === out.escopo[out.escopo.length - 1]) || null; if (!g) { g = { g: nome, linhas: [] }; out.escopo.push(g); } emTab = false; continue; }
          if (r.ts[0].s === 'Qty') { emTab = true; continue; }
          if (!g || !emTab) { const pp = par(r.ts.filter((t) => t.x < pg.w / 2)); const pq = par(r.ts.filter((t) => t.x >= pg.w / 2));
            for (const x of [pp, pq]) if (x && x[1] && !vistos.has(x[0] + '|' + x[1])) { vistos.add(x[0] + '|' + x[1]); sec('Project', pg.n).campos.push({ k: x[0], v: x[1], on: false }); } continue; }
          const qtd = r.ts[0].x < 60 && /^\d+$/.test(r.ts[0].s) ? r.ts[0].s : '';
          const ds = r.ts.filter((t) => t.x >= 60); if (!ds.length) continue;
          const nivel = Math.max(0, Math.round((ds[0].x - 65.8) / 2.9));
          g.linhas.push({ q: qtd, n: nivel, t: junta(ds) });
        }
        continue;
      }
      if (tipo !== 'dados') continue;
      // tabelas numéricas (desempenho por vazão, dados de desempenho): linhas com 4 ou mais pedaços espalhados
      const meio = pg.w / 2; const secAtual = { e: null, d: null }; let tab = null; let ultimo = { e: null, d: null }; let ident = true;
      for (const r of rows) {
        if (r.y >= dadosAte - 2) break;
        if (r.ts.some((t) => /^@/.test(t.s))) continue;
        const ehTab = r.ts.length >= 4 && r.ts.filter((t) => num(t.s)).length >= 3 && !r.ts.some((t) => /^:/.test(t.s));
        if (ehTab) {
          if (!tab) { tab = { t: '', pag: pg.n, cab: [], linhas: [] }; out.tabelas.push(tab); }
          const nums = r.ts.filter((t) => num(t.s)); const rot = junta(r.ts.filter((t) => !num(t.s) && t.x < nums[0].x));
          tab.linhas.push([rot].concat(nums.map((t) => t.s))); continue;
        }
        // cabeçalho de tabela (Flow (USgpm) Head (m) ...) ou título dela
        if (r.ts.length >= 4 && (junta(r.ts).match(/\((USgpm|m3\/h|m³\/h|m|%|ft|hp|kW|psi[.ag]*|bar)\)/g) || []).length >= 2) { tab = { t: '', pag: pg.n, cab: r.ts.map((t) => t.s), linhas: [] }; out.tabelas.push(tab); continue; }
        if (tab && r.ts.length >= 3 && !r.ts.some((t) => /^:/.test(t.s)) && tab.linhas.length) tab = null;
        for (const lado of ['e', 'd']) {
          const ts = r.ts.filter((t) => (lado === 'e' ? t.x < meio - 4 : t.x >= meio - 4)); if (!ts.length) continue;
          const x0 = lado === 'e' ? 30 : meio; const x1 = lado === 'e' ? meio : pg.w - 30; const p = par(ts);
          const centro = ts.length === 1 ? Math.abs(ts[0].x + ts[0].w / 2 - (x0 + x1) / 2) : 99;
          const cont = ultimo[lado] && /\s(a|de|do|da|e|and|of|the|with|for)$|[-,/]$/.test(ultimo[lado].v || ultimo[lado].k);
          if (!p && !cont && ts.length === 1 && centro < 16 && ts[0].x - x0 > 40 && !/^:/.test(ts[0].s) && !num(ts[0].s)) {
            const nome = ts[0].s; if (tab && !tab.linhas.length) tab.t = nome; else { secAtual[lado] = nome; ident = false; } ultimo[lado] = null; continue; }
          const s = secAtual[lado] || (ident ? 'Project' : '');
          if (!p) {
            if (ts.length !== 1 || /^:/.test(ts[0].s)) continue; const naColunaRot = ts[0].x - x0 < 40; const c = ultimo[lado];
            // rótulo em duas linhas ("Direction of Rotation (viewed from" / "drive end)") e valor na linha do meio
            if (c && c.v === '' && !naColunaRot) { c.v = ts[0].s; c.on = s !== 'Project'; }
            else if (c && naColunaRot && c.pend) c.k = (c.k + ' ' + ts[0].s).trim();
            else if (c && !naColunaRot && !c.pend) c.v = (c.v + ' ' + ts[0].s).trim();
            else if (naColunaRot && s && !num(ts[0].s)) { const n = { k: ts[0].s, v: '', on: false, pend: true }; sec(s, pg.n).campos.push(n); ultimo[lado] = n; }
            continue;
          }
          if (/^[a-z@]/.test(p[0]) || (num(p[0]) && num(p[1]))) continue;
          if (!s || (s === 'Project' && identOk && pg.n !== out.secoes.find((x) => x.t === 'Project')?.pag)) { ultimo[lado] = { k: p[0], v: p[1] }; continue; }
          const chave = s + '|' + p[0] + '|' + p[1]; if (vistos.has(chave)) { ultimo[lado] = null; continue; } vistos.add(chave);
          const c = { k: p[0], v: p[1], on: s !== 'Project' && p[1] !== '' && p[1] !== '-' }; sec(s, pg.n).campos.push(c); ultimo[lado] = c;
        }
      }
      if (out.secoes.some((x) => x.t === 'Project')) identOk = true;
    }
    for (const s of out.secoes) s.campos = s.campos.filter((c) => c.k).map((c) => { delete c.pend; return c; });
    out.secoes = out.secoes.filter((s) => s.campos.length);
    for (const P of out.paginas) if (P.tipo === 'dados' && !out.secoes.some((s) => s.pag === P.n)) P.tipo = 'anexo';
    out.tabelas = out.tabelas.filter((t) => t.linhas.length >= 2);
    return out;
  }

  // ---------- tradução fixa dos rótulos mais comuns (Peerless e afins) ----------
  const SEC = {
    'Operating Conditions': ['Condições de operação', 'Condiciones de operación'], Liquid: ['Líquido', 'Líquido'], 'NFPA Limits': ['Limites NFPA', 'Límites NFPA'],
    Material: ['Material', 'Material'], 'Pressure Data': ['Dados de pressão', 'Datos de presión'], Construction: ['Construção', 'Construcción'], Materials: ['Materiais', 'Materiales'],
    'Listings and Approvals': ['Listagens e aprovações', 'Listados y aprobaciones'], 'Engine Information': ['Motor', 'Motor'], 'Additional information': ['Informações adicionais', 'Información adicional'],
    Testing: ['Testes', 'Pruebas'], 'Approximate Weights': ['Pesos aproximados', 'Pesos aproximados'], 'Performance Data': ['Dados de desempenho', 'Datos de desempeño'],
    'Stage, Speed and Solids Limits': ['Limites de estágios, rotação e sólidos', 'Límites de etapas, velocidad y sólidos'], 'Mechanical Limits': ['Limites mecânicos', 'Límites mecánicos'],
    'Typical Driver Data': ['Dados típicos do acionador', 'Datos típicos del accionador'], 'Various Performance Data': ['Dados de desempenho', 'Datos de desempeño'], Project: ['Identificação', 'Identificación'],
    Pump: ['Bomba', 'Bomba'], Driver: ['Acionador', 'Accionador'], Controller: ['Painel de comando', 'Tablero de control'], Accessories: ['Acessórios', 'Accesorios'],
  };
  const ROT = {
    Customer: ['Cliente', 'Cliente'], 'Customer ref. / PO': ['Referência / pedido', 'Referencia / pedido'], 'Tag Number': ['Tag', 'Tag'], Service: ['Serviço', 'Servicio'], Quantity: ['Quantidade', 'Cantidad'],
    'Quote Number / ID': ['Cotação do fabricante', 'Cotización del fabricante'], 'Peerless Model': ['Modelo', 'Modelo'], 'Pump Model': ['Modelo da bomba', 'Modelo de la bomba'], Model: ['Modelo', 'Modelo'], Stages: ['Estágios', 'Etapas'],
    'Based on curve number': ['Curva de referência', 'Curva de referencia'], 'Date last saved': ['Data da seleção', 'Fecha de la selección'], 'Project name': ['Projeto', 'Proyecto'],
    'Flow, rated': ['Vazão nominal', 'Caudal nominal'], 'Differential head / pressure, rated (requested)': ['Altura diferencial nominal (pedida)', 'Altura diferencial nominal (solicitada)'],
    'Differential head / pressure, rated (actual)': ['Altura diferencial nominal (real)', 'Altura diferencial nominal (real)'], 'Differential head / pressure, rated': ['Altura diferencial nominal', 'Altura diferencial nominal'],
    'Suction pressure, rated / max': ['Pressão de sucção nominal / máx.', 'Presión de succión nominal / máx.'], 'NPSH available, rated': ['NPSH disponível', 'NPSH disponible'], 'Site Supply Frequency': ['Frequência da rede', 'Frecuencia de la red'],
    'Speed, rated': ['Rotação nominal', 'Velocidad nominal'], 'Impeller diameter, rated': ['Diâmetro do rotor nominal', 'Diámetro del impulsor nominal'], 'Impeller diameter, maximum': ['Diâmetro do rotor máximo', 'Diámetro del impulsor máximo'],
    'Impeller diameter, minimum': ['Diâmetro do rotor mínimo', 'Diámetro del impulsor mínimo'], 'Head, rated': ['Altura nominal', 'Altura nominal'], 'Power, rated': ['Potência nominal', 'Potencia nominal'],
    'Power required at 150% flow': ['Potência a 150% da vazão', 'Potencia al 150% del caudal'], 'Peak power': ['Potência máxima', 'Potencia máxima'], 'Efficiency, rated': ['Rendimento nominal', 'Rendimiento nominal'], Efficiency: ['Rendimento', 'Rendimiento'],
    'Flow at 150%': ['Vazão a 150%', 'Caudal al 150%'], 'Head at 150%, actual/limit': ['Altura a 150% (real / limite)', 'Altura al 150% (real / límite)'], 'Head at shutoff, actual/limit': ['Altura em shutoff (real / limite)', 'Altura a válvula cerrada (real / límite)'],
    'Liquid type': ['Líquido', 'Líquido'], 'Additional liquid description': ['Descrição adicional do líquido', 'Descripción adicional del líquido'], 'Solids diameter, max': ['Diâmetro máx. de sólidos', 'Diámetro máx. de sólidos'],
    'Solids concentration, by volume': ['Concentração de sólidos (volume)', 'Concentración de sólidos (volumen)'], 'Temperature, max': ['Temperatura máxima', 'Temperatura máxima'], 'Fluid density, rated / max': ['Densidade nominal / máx.', 'Densidad nominal / máx.'],
    'Viscosity, rated': ['Viscosidade', 'Viscosidad'], Viscosity: ['Viscosidade', 'Viscosidad'], 'Vapor pressure, rated': ['Pressão de vapor', 'Presión de vapor'], 'Material selected': ['Material', 'Material'],
    'Maximum working pressure': ['Pressão máxima de trabalho', 'Presión máxima de trabajo'], 'Maximum Working Pressure': ['Pressão máxima de trabalho', 'Presión máxima de trabajo'], 'Maximum allowable working pressure': ['Pressão máxima admissível', 'Presión máxima admisible'],
    'Maximum allowable suction pressure': ['Pressão máx. admissível de sucção', 'Presión máx. admisible de succión'], 'Hydrostatic test pressure': ['Pressão do teste hidrostático', 'Presión de prueba hidrostática'],
    'Direction of Rotation (viewed from drive end)': ['Sentido de rotação (visto do acionamento)', 'Sentido de giro (visto desde el accionamiento)'], 'Suction Flange Diameter': ['Flange de sucção', 'Brida de succión'],
    'Suction Flange Rating': ['Classe do flange de sucção', 'Clase de la brida de succión'], 'Discharge Flange Diameter': ['Flange de recalque', 'Brida de descarga'], 'Dicharge Flange Rating': ['Classe do flange de recalque', 'Clase de la brida de descarga'],
    'Discharge Flange Rating': ['Classe do flange de recalque', 'Clase de la brida de descarga'], 'Impeller Diameter': ['Diâmetro do rotor', 'Diámetro del impulsor'], 'Bearing Type': ['Rolamento', 'Rodamiento'], 'Bearing Lubrication': ['Lubrificação dos rolamentos', 'Lubricación de rodamientos'],
    'Pump Seal': ['Vedação', 'Sello'], 'Rotor Group': ['Grupo rotativo', 'Grupo rotativo'], 'Pump Casing': ['Carcaça', 'Carcasa'], Impeller: ['Rotor', 'Impulsor'], 'Pump Shaft': ['Eixo', 'Eje'], 'Shaft Sleeve': ['Luva do eixo', 'Camisa del eje'],
    'Case Ring': ['Anel de desgaste da carcaça', 'Anillo de desgaste de la carcasa'], 'Impeller wear ring': ['Anel de desgaste do rotor', 'Anillo de desgaste del impulsor'], Paint: ['Pintura', 'Pintura'], 'Pump Base': ['Base', 'Base'], Mounting: ['Montagem', 'Montaje'],
    'Max suction pressure**': ['Pressão máx. de sucção', 'Presión máx. de succión'], 'Hydraulic performance test': ['Teste de desempenho', 'Prueba de desempeño'], 'Hydrostatic test': ['Teste hidrostático', 'Prueba hidrostática'], 'Curve approval': ['Aprovação da curva', 'Aprobación de la curva'],
    'NPSH test': ['Teste de NPSH', 'Prueba de NPSH'], 'String test': ['Teste do conjunto', 'Prueba del conjunto'], 'Test w/ motor': ['Teste com o motor', 'Prueba con el motor'], 'Bare Pump': ['Bomba', 'Bomba'], Driver: ['Acionador', 'Accionador'], Base: ['Base', 'Base'],
    Manufacturer: ['Fabricante', 'Fabricante'], 'Cooling type': ['Arrefecimento', 'Refrigeración'], 'Rated speed': ['Rotação nominal', 'Velocidad nominal'], 'Rated power': ['Potência nominal', 'Potencia nominal'], 'Derated power': ['Potência corrigida (altitude e temperatura)', 'Potencia corregida (altitud y temperatura)'],
    'Installation elevation': ['Altitude da instalação', 'Altitud de la instalación'], 'Installation temperature (max)': ['Temperatura máx. da instalação', 'Temperatura máx. de la instalación'], 'Engine voltage': ['Tensão do motor', 'Tensión del motor'], 'Preheater voltage': ['Tensão do pré-aquecedor', 'Tensión del precalentador'],
    'Fuel supply': ['Alimentação de combustível', 'Alimentación de combustible'], Tier: ['Nível de emissões', 'Nivel de emisiones'], 'Silencer type': ['Silencioso', 'Silenciador'], 'Silencer size': ['Tamanho do silencioso', 'Tamaño del silenciador'], 'Silencer configuration': ['Configuração do silencioso', 'Configuración del silenciador'],
    'Flexible exhaust connection': ['Conexão flexível do escape', 'Conexión flexible del escape'], 'Drive shaft type': ['Eixo cardã', 'Eje cardán'], Tank: ['Tanque', 'Tanque'], 'Torsional coupling': ['Acoplamento torcional', 'Acoplamiento torsional'], Batteries: ['Baterias', 'Baterías'],
    'Rack and cables': ['Suporte e cabos', 'Soporte y cables'], 'Cooling loop size': ['Linha de arrefecimento', 'Línea de refrigeración'], 'Cooling loop material': ['Material da linha de arrefecimento', 'Material de la línea de refrigeración'], 'ULC fuel lines': ['Linhas de combustível ULC', 'Líneas de combustible ULC'],
    'Fuel system': ['Sistema de combustível', 'Sistema de combustible'], Ventiliation: ['Ventilação', 'Ventilación'], 'Base mounted controller adapter': ['Adaptador do painel na base', 'Adaptador del tablero en la base'],
    'Rated power (based on duty point)': ['Potência no ponto de trabalho', 'Potencia en el punto de trabajo'], 'Max power (non-overloading)': ['Potência máxima (sem sobrecarga)', 'Potencia máxima (sin sobrecarga)'], 'NPSH required': ['NPSH requerido', 'NPSH requerido'],
  };
  const VAL = {
    Yes: ['Sim', 'Sí'], No: ['Não', 'No'], 'N/A': ['N/A', 'N/A'], None: ['Nenhum', 'Ninguno'], Ample: ['Amplo', 'Amplio'], 'Cold Water': ['Água fria', 'Agua fría'], 'Ductile Iron': ['Ferro fundido nodular', 'Hierro dúctil'], 'Cast Iron': ['Ferro fundido', 'Hierro fundido'],
    'Clockwise (RH)': ['Horário (RH)', 'Horario (RH)'], 'Counterclockwise (LH)': ['Anti-horário (LH)', 'Antihorario (LH)'], Grease: ['Graxa', 'Grasa'], Oil: ['Óleo', 'Aceite'], 'Packing seal': ['Gaxeta', 'Empaquetadura'], 'Mechanical seal': ['Selo mecânico', 'Sello mecánico'],
    'Single Row': ['Uma carreira', 'Una hilera'], 'Silicon Brass': ['Latão ao silício', 'Latón al silicio'], 'Carbon steel': ['Aço carbono', 'Acero al carbono'], 'Bismuth tin bronze': ['Bronze estanho-bismuto', 'Bronce estaño-bismuto'], Integral: ['Integral', 'Integral'],
    'Heat exchanger cooled': ['Trocador de calor', 'Intercambiador de calor'], 'Radiator cooled': ['Radiador', 'Radiador'], 'Mounted on base with driver': ['Montada na base com o acionador', 'Montada en la base con el accionador'], 'Standard ventilation': ['Ventilação padrão', 'Ventilación estándar'],
    Steel: ['Aço', 'Acero'], Standard: ['Padrão', 'Estándar'], 'Peerless Fire Red': ['Vermelho Peerless', 'Rojo Peerless'], 'Non-witnessed': ['Não testemunhado', 'No presenciada'], 'Non-witnessed per HI 14.6 1U': ['Não testemunhado (HI 14.6 1U)', 'No presenciada (HI 14.6 1U)'],
    'Diesel engine': ['Motor diesel', 'Motor diésel'], 'Electric motor': ['Motor elétrico', 'Motor eléctrico'], 'Fire Pump System': ['Sistema de bomba de incêndio', 'Sistema de bomba contra incendio'], UL: ['UL', 'UL'],
  };
  const idx = (lang) => (lang === 'pt' ? 0 : lang === 'es' ? 1 : -1);
  const secT = (s, lang) => (idx(lang) < 0 ? s : (SEC[s] || [])[idx(lang)] || null);
  const rotT = (s, lang) => (idx(lang) < 0 ? s : (ROT[s] || [])[idx(lang)] || null);
  const valT = (s, lang) => (idx(lang) < 0 ? s : (VAL[s] || [])[idx(lang)] || null);
  // linha do escopo "Chave: valor": traduz cada parte pelo dicionário
  const linhaT = (s, lang) => { if (idx(lang) < 0) return s; if (VAL[s]) return valT(s, lang); const m = String(s).match(/^([^:]{2,60}):\s*(.*)$/); if (!m) return null; const k = rotT(m[1], lang) || ESC_ROT[m[1]]?.[idx(lang)]; const v = m[2] === '' ? '' : valT(m[2], lang); return k && v !== null ? (v ? k + ': ' + v : k + ':') : null; };
  const ESC_ROT = { 'Pump model': ['Modelo da bomba', 'Modelo de la bomba'], 'Selected pump listing': ['Listagem', 'Listado'], 'Casing material': ['Material da carcaça', 'Material de la carcasa'], 'Suction flange': ['Flange de sucção', 'Brida de succión'],
    'Discharge flange': ['Flange de recalque', 'Brida de descarga'], 'Casing ring': ['Anel da carcaça', 'Anillo de la carcasa'], 'Impeller material': ['Material do rotor', 'Material del impulsor'], 'Impeller Wear Ring': ['Anel de desgaste do rotor', 'Anillo de desgaste del impulsor'],
    Rotation: ['Rotação', 'Rotación'], 'Shaft material': ['Material do eixo', 'Material del eje'], 'Shaft sleeve material': ['Material da luva do eixo', 'Material de la camisa del eje'], 'Packing type': ['Tipo de gaxeta', 'Tipo de empaquetadura'], 'Nameplate units': ['Unidades da placa', 'Unidades de la placa'],
    'Engine voltage': ['Tensão do motor', 'Tensión del motor'], 'Controller brand': ['Marca do painel', 'Marca del tablero'], 'Controller voltage': ['Tensão do painel', 'Tensión del tablero'], 'Controller frequency': ['Frequência do painel', 'Frecuencia del tablero'], Enclosure: ['Invólucro', 'Envolvente'], 'Enclosure type': ['Tipo de invólucro', 'Tipo de envolvente'] };
  const UNI = 'USgpm|gpm|in|psi\\.?[ga]?|lb|hp|ft|rpm|m|mm|cP|SG|Hz|V|VAC|VDC|V DC|%|deg C|°C|kW|bar|m³/h|hp/100 rpm|psi\\.a';
  const reMedida = new RegExp('^[-+]?[\\d.,]+(\\s*/\\s*[-+]?[\\d.,]+)?\\s*(' + UNI + ')?$');
  const ehMedida = (v) => reMedida.test(String(v || '').trim().replace(/\s+/g, ' '));
  window.PricerFabricante = { ler, secT, rotT, valT, linhaT, junta, ehMedida };
})();
