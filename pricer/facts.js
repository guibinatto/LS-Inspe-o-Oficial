/* LS Pricer — FACTS (MECON Fully Automatic Churn Testing System), solução SEQ.
 * Configurador pelo código de opções do manual de instalação MECON (rev. 1.1, 24/09/2026):
 * FACTS0-{D|E}{B|C}{0|1}-{selo}{proteção}{bandeja}{água}{parada}{posição}{válvula}.
 * Preços de compra: lista MECON 2026 (EUR, preço de integrador). Custo em R$ pelo fator R$/EUR
 * da planilha LS_Fire-FACTS_2608 (DB0: 8.071 EUR → R$ 90.830,16).
 */
(function () {
  'use strict';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // lista MECON 2026 (EUR) — o preço dos pacotes básicos já inclui a stop box (185)
  const CAT = [
    { cod: 'FACTS0-DB0', grupo: 'base', desc: 'Pacote básico diesel (trocador de calor), sem sensor de nível de óleo', eur: 8071 },
    { cod: 'FACTS0-DB1', grupo: 'base', desc: 'Pacote básico diesel (trocador de calor), com sensor de nível de óleo', eur: 8741 },
    { cod: 'FACTS0-DC0', grupo: 'base', desc: 'Pacote básico diesel radiador, com supervisão da válvula de alívio de circulação (CRV)', eur: 8182 },
    { cod: 'FACTS0-DC1', grupo: 'base', desc: 'Pacote básico diesel radiador, com CRV e sensor de nível de óleo', eur: 8595 },
    { cod: 'FACTS0-EC0', grupo: 'base', desc: 'Pacote básico motor elétrico, com supervisão da CRV', eur: 8180 },
    { cod: 'FACTS0-AA0000AA1', grupo: 'acc', desc: '2 sensores de posição (desalinhamento bomba / acoplamento)', eur: 956 },
    { cod: 'FACTS0-AA0000AR', grupo: 'acc', desc: 'Stop box (parada por interrupção do automático — retrofit)', eur: 185 },
    { cod: 'FACTS0-AA0000P', grupo: 'acc', desc: 'Sensor de pressão 0…25 bar (sucção pressurizada / rede pública)', eur: 172 },
    { cod: 'FACTS0-AA0000T', grupo: 'acc', desc: 'Sensor de pressão −1…1,5 bar (sucção de tanque acima do solo)', eur: 242 },
    { cod: 'FACTS0-AA0001', grupo: 'acc', desc: '1 sensor de alagamento (sem bandeja)', eur: 75.5 },
    { cod: 'FACTS0-AA0002', grupo: 'acc', desc: '2 sensores de alagamento (sala + bandeja)', eur: 151 },
    { cod: 'FACTS0-AA001', grupo: 'acc', desc: 'Sensor da proteção do acoplamento', eur: 202 },
    { cod: 'FACTS0-AA01', grupo: 'acc', desc: '1 sensor de gaxeta (bomba end suction)', eur: 956 },
    { cod: 'FACTS0-AA02', grupo: 'acc', desc: '2 sensores de gaxeta (bomba bipartida / split case)', eur: 1912 },
    { cod: 'FACTS0-DA1', grupo: 'acc', desc: 'Sensor de nível de óleo (já incluso no DB1 e DC1)', eur: 625 },
  ];
  const DEF = { cat: CAT, rs_eur: 90830.16 / 8071, ipi: 0, margem: null, treino_base: 1750, treino_dia: 650, treino_part: 650, suporte_h: 180, mat_inst: 0, origem: 'Kerpen (Alemanha)' };
  const OPC = {
    acion: [['D', 'Diesel'], ['E', 'Elétrico']],
    arref: [['B', 'Diesel com trocador de calor'], ['C', 'Diesel com radiador (supervisiona a CRV)']],
    oleo: [['1', 'Sim, com sensor'], ['0', 'Não (o motor já tem)']],
    selo: [['0', 'Selo mecânico'], ['1', 'Gaxeta — end suction (1 sensor)'], ['2', 'Gaxeta — split case (2 sensores)']],
    prot: [['1', 'Com acoplamento e proteção'], ['0', 'Sem proteção (vertical, monobloco)']],
    band: [['1', '1 sensor de alagamento (sem bandeja)'], ['2', '2 sensores (sala e bandeja)']],
    agua: [['T', 'Tanque (−1…1,5 bar)'], ['P', 'Rede / sucção pressurizada (0…25 bar)']],
    parada: [['R', 'Retrofit com stop box'], ['N', 'Sem stop box (controlador novo)']],
    pos: [['1', 'Sim'], ['0', 'Não']],
    valv: [['0', 'Não'], ['1', 'Sim (sob consulta)']],
  };

  function Facts(ctx) {
    const { REG, esc, brl, pct, NF, toast, parseInput } = ctx;
    const cfg = () => { const c = (REG.tabelas.FACTS || {}).cfg || {}; return Object.assign({}, DEF, c, { cat: c.cat || DEF.cat }); };
    const st = () => ctx.getState(); const F = () => st().facts;
    const pa = (a, d) => { const v = ctx.val('PARÂMETROS', a); return typeof v === 'number' ? v : d; };

    function novo() {
      const facts = { cliente: '', contato: '', numero: '', local: '', uf: 'SC', vendedor: '', data: new Date().toISOString().slice(0, 10),
        conj: [{ nome: 'Bomba principal diesel', qtd: 1, acion: 'D', arref: 'B', oleo: '1', selo: '1', prot: '1', band: '1', agua: 'T', parada: 'R', pos: '1', valv: '0', valv_eur: 0, painel_eur: 0 }],
        volume: 0, treino: { on: false, part: 1, dias: 1 }, suporte_h: 0, suporte_desp: 0, equipe: [], inst_desl: 0, mat_inst: null, margem: null, preco: null, obs: '' };
      ctx.setState({ id: null, uid: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), div: 'SEQ', sol: 'FACTS', name: '', facts, status: 'rascunho', doc: {} });
      ctx.ui.view = 'proposta'; ctx.render(); window.scrollTo(0, 0);
    }
    const codigo = (c) => c.acion === 'E' ? `FACTS0-EC0-${c.selo}${c.prot}${c.band}${c.agua}${c.parada}${c.pos}${c.valv}` : `FACTS0-D${c.arref}${c.oleo}-${c.selo}${c.prot}${c.band}${c.agua}${c.parada}${c.pos}${c.valv}`;
    function linhas(c, cat) {
      const g = (cod) => cat.find((x) => x.cod === cod) || { cod, desc: cod, eur: 0 };
      const out = [];
      const base = c.acion === 'E' ? 'FACTS0-EC0' : `FACTS0-D${c.arref}${c.oleo}`;
      out.push(Object.assign({ q: 1 }, g(base)));
      if (c.parada === 'N') { const sb = g('FACTS0-AA0000AR'); out.push({ cod: sb.cod, desc: 'Sem stop box (abatimento do pacote básico)', eur: -sb.eur, q: 1 }); }
      out.push(Object.assign({ q: 1 }, g(c.agua === 'T' ? 'FACTS0-AA0000T' : 'FACTS0-AA0000P')));
      if (c.selo === '1') out.push(Object.assign({ q: 1 }, g('FACTS0-AA01'))); if (c.selo === '2') out.push(Object.assign({ q: 1 }, g('FACTS0-AA02')));
      if (c.prot === '1') out.push(Object.assign({ q: 1 }, g('FACTS0-AA001')));
      out.push(Object.assign({ q: 1 }, g(c.band === '2' ? 'FACTS0-AA0002' : 'FACTS0-AA0001')));
      if (c.pos === '1') out.push(Object.assign({ q: 1 }, g('FACTS0-AA0000AA1')));
      if (c.valv === '1') out.push({ cod: 'VÁLVULA MOTORIZADA', desc: 'Válvula de esfera motorizada (sob consulta MECON)', eur: num(c.valv_eur), q: 1 });
      if (num(c.painel_eur)) out.push({ cod: 'ELECTRA IMPIANTI', desc: 'Controlador Electra Impianti FM (plug & play)', eur: num(c.painel_eur), q: 1 });
      return out;
    }
    // contas: equipamento importado (ICMS, PIS/COFINS, IRPJ) e serviços (ISS); preço pela margem líquida alvo
    function calc(f) {
      const c = cfg(); const spv = ctx.SPV.cfg(); const k = c.rs_eur; const desc = num(f.volume);
      const pis = pa('C5', 0.0065), cof = pa('C6', 0.03), ir = pa('C7', 0.0308), com = pa('C19', 0.0225);
      const uf = String(f.uf || 'SC').toUpperCase(); let icms = pa('C8', 0.04);
      if (uf === 'SC') for (let r = 79; r <= 105; r++) if (ctx.txt('PARÂMETROS', 'D' + r) === 'SC') icms = num(ctx.val('PARÂMETROS', 'E' + r)) || icms;
      const alvo = f.margem != null ? f.margem : c.margem != null ? c.margem : pa('C33', 0.3); const minimo = pa('C34', 0.3);
      const tP = icms + pis + cof + ir + com; const tS = num(spv.mk.iss) + num(spv.mk.pis) + num(spv.mk.cofins) + num(spv.mk.irpj) + com;
      const conj = f.conj.map((x) => { const L = linhas(x, c.cat).map((l) => Object.assign({}, l, { custo: l.eur * l.q * k * (1 - desc) })); const custo = L.reduce((t, l) => t + l.custo, 0) + num(f.mat_inst ?? c.mat_inst);
        return Object.assign({}, x, { codigo: codigo(x), L, eur: L.reduce((t, l) => t + l.eur * l.q, 0), custoUn: custo, custo: custo * num(x.qtd) }); });
      const nSets = conj.reduce((t, x) => t + num(x.qtd), 0);
      // serviços: treinamento MECON, suporte MECON em campo, instalação e comissionamento LS Fire
      const serv = [];
      if (f.treino.on) { const eur = c.treino_base + c.treino_dia * Math.max(0, num(f.treino.dias) - 1) + c.treino_part * Math.max(0, num(f.treino.part) - 1); serv.push({ k: 'treino', desc: `Treinamento MECON em Lübeck (${f.treino.part} participante(s), ${f.treino.dias} dia(s))`, custo: eur * k }); }
      if (num(f.suporte_h)) serv.push({ k: 'suporte', desc: `Suporte MECON em campo (${f.suporte_h} h × ${NF[0].format(c.suporte_h)} EUR + despesas)`, custo: (num(f.suporte_h) * c.suporte_h + num(f.suporte_desp)) * k });
      for (const e of f.equipe || []) if (num(e.dias) > 0) serv.push({ k: 'eq_' + e.tec, desc: `Instalação e comissionamento — ${e.tec} (${e.dias} dia(s))`, custo: num(e.diaria) * num(e.dias) });
      if (num(f.inst_desl)) serv.push({ k: 'desl', desc: 'Deslocamento, hospedagem e alimentação da equipe', custo: num(f.inst_desl) });
      const custoEq = conj.reduce((t, x) => t + x.custo, 0); const custoSv = serv.reduce((t, x) => t + x.custo, 0);
      const fatorP = 1 - tP - alvo, fatorS = 1 - tS - alvo;
      let Veq = fatorP > 0 ? custoEq / fatorP : 0; const Vsv = fatorS > 0 ? custoSv / fatorS : 0;
      if (num(f.preco) > 0) { Veq = Math.max(0, num(f.preco) - Vsv); }
      const V = Veq + Vsv; const imp = Veq * (tP - com) + Vsv * (tS - com); const comV = V * com; const custo = custoEq + custoSv;
      const margem = V - imp - comV - custo; const ipi = Veq * num(c.ipi);
      return { semFator: (fatorP <= 0 && custoEq > 0 && !(num(f.preco) > 0)) || (fatorS <= 0 && custoSv > 0), k, desc, icms, pis, cof, ir, com, tP, tS, alvo, minimo, conj, nSets, serv, custoEq, custoSv, Veq, Vsv, V, imp, comV, custo, margem, margemPct: V ? margem / V : 0, ipi, VcomIpi: V + ipi };
    }
    function snapshot(f) {
      const r = calc(f); const itens = [];
      const shareEq = (x) => (r.custoEq ? x.custo / r.custoEq : 0);
      for (const x of r.conj) { const venda = r.Veq * shareEq(x); const impostos = venda * (r.tP - r.com), comissao = venda * r.com, margem = venda - impostos - comissao - x.custo;
        itens.push({ n: 'fx_' + itens.length, nome: `FACTS ${x.codigo} — ${x.nome}`, codigo: x.codigo, familia: 'FAC', familiaNome: 'FACTS', qtd: num(x.qtd), venda, custo: x.custo, impostos, comissao, margem, margemPct: venda ? margem / venda : 0, icmsPct: r.icms, pisCofinsPct: r.pis + r.cof, irPct: r.ir,
          linhas: x.L.map((l, i) => ({ k: 'l' + i, grupo: 'MECON', rot: l.cod, desc: l.cod + ' — ' + l.desc, qtd: l.q, unit: l.custo / (l.q || 1), custo: l.custo })).concat(num(f.mat_inst ?? cfg().mat_inst) ? [{ k: 'mat', grupo: 'INSTALAÇÃO', rot: 'Materiais', desc: 'Materiais de instalação (cabos blindados, eletrodutos, fixação)', qtd: 1, unit: num(f.mat_inst ?? cfg().mat_inst), custo: num(f.mat_inst ?? cfg().mat_inst) }] : []) }); }
      if (r.serv.length) { const venda = r.Vsv, impostos = venda * (r.tS - r.com), comissao = venda * r.com, margem = venda - impostos - comissao - r.custoSv;
        itens.push({ n: 'fx_serv', nome: 'FACTS — instalação, treinamento e suporte', familia: 'FAC', familiaNome: 'FACTS', qtd: 1, venda, custo: r.custoSv, impostos, comissao, margem, margemPct: venda ? margem / venda : 0, linhas: r.serv.map((s) => ({ k: s.k, grupo: 'SERVIÇOS', rot: s.desc, desc: s.desc, qtd: 1, unit: s.custo, custo: s.custo })) }); }
      return { div: 'SEQ', tipo: 'FAC', venda: r.V, vendaIpi: r.VcomIpi, custo: r.custo, impostos: r.imp, comissao: r.comV, margem: r.margem, margemPct: r.margemPct, minimo: r.minimo, itens };
    }
    // dados para a proposta técnica e comercial (modelo PTC)
    function propostaDados(f) {
      f = f || F(); const r = calc(f); const sn = snapshot(f); const venc = (() => { const d = new Date((f.data || new Date().toISOString().slice(0, 10)) + 'T12:00'); d.setDate(d.getDate() + (num(f.validade) || 15)); return d.toISOString().slice(0, 10); })();
      const itens = sn.itens.map((x, i) => { const q = num(x.qtd) || 1; const eq = x.n !== 'fx_serv'; const ipi = eq ? num(cfg().ipi) : 0; const tot = x.venda * (1 + ipi); return { key: x.n, codigo: x.codigo || '', qtd: q, un: eq ? 'CJ' : 'Un', pisCofins: x.pisCofinsPct ?? (num(r.pis) + num(r.cof)), icms: x.icmsPct ?? (eq ? r.icms : null), ipi, ncm: '', unit: tot / q, total: tot, breve: x.nome, escopo: i === 0 ? escopo(f).split('\n').map((l) => l.trim()).filter(Boolean) : [] }; });
      return { tipo: 'FACTS', numero: f.numero || '', rev: f.revisao ?? '0', data: f.data, validade: venc, cliente: f.cliente || '', razao: f.cliente || '', cnpj: f.cnpj || '', contato: f.contato || '', obra: f.local || '', cidade: '',
        pagamento: f.pagamento || '', frete: '', prazo: '', exclusoes: '', vendedor: f.vendedor || '', total: r.VcomIpi, itens, flags: {} };
    }
    // texto técnico para a proposta (a proposta comercial é feita fora do app)
    function escopo(f) {
      const r = calc(f); const lab = (k, v) => (OPC[k].find((o) => o[0] === v) || [0, v])[1];
      const sets = r.conj.map((x) => `• ${x.qtd} × FACTS ${x.codigo} — ${x.nome}: ${x.acion === 'E' ? 'motor elétrico' : lab('arref', x.arref).toLowerCase()}; ${lab('selo', x.selo).toLowerCase()}; ${lab('prot', x.prot).toLowerCase()}; ${lab('band', x.band).toLowerCase()}; água: ${lab('agua', x.agua).toLowerCase()}; ${x.parada === 'R' ? 'retrofit com stop box' : 'sem stop box'}${x.pos === '1' ? '; supervisão de posição (alinhamento)' : ''}.`).join('\n');
      return `Fornecimento do sistema FACTS — Fully Automatic Churn Testing System (MECON, aprovado FM 1330), para teste automático semanal das bombas de incêndio conforme NFPA 25 e FM Data Sheet 2-81.
${sets}
Cada sistema inclui: gabinete de controle com IHM, controlador FACTS, sensor de vibração, sensor de temperatura da sala, stop box, sensor de pressão 0…25 bar no recalque, sensor de presença, 2 sinalizadores luminosos e sirene, além dos sensores listados acima.
Funções: teste semanal automático (pré-aviso de 10 s, operação de 10 a 30 min, parada e relatório em PDF), supervisão 24/7 (alagamento, nível de óleo, válvulas), integração com o controlador da bomba e o painel de alarme por contatos fail-safe e Modbus TCP. Em caso de demanda de água durante o teste, o teste é encerrado e a bomba continua operando.${r.serv.length ? '\nServiços: ' + r.serv.map((s) => s.desc.replace(/ \(.*\)$/, '')).join('; ') + '.' : ''}`;
    }

    // ---------- tela ----------
    const fmt = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? NF[d].format(v) : '');
    const inp = (path, v, kind = 'num', o = {}) => { const shown = kind === 'pct' ? (typeof v === 'number' ? NF[2].format(v * 100).replace(/,00$/, '') : '') : kind === 'num' ? (typeof v === 'number' ? String(+v.toFixed(6)).replace('.', ',') : '') : (v ?? ''); return `<input data-fx="${path}" data-k="${kind}" value="${esc(shown)}"${kind === 'text' ? '' : ' inputmode="decimal"'}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''} aria-label="${esc(o.lb || path)}">`; };
    // opções do FACTS como botões de toque; listas maiores (técnicos) continuam em lista
    const sel = (path, v, opts, lb) => opts.length <= 4 ? `<div class="seg" role="radiogroup" aria-label="${esc(lb || path)}">${opts.map(([k, l]) => `<label class="${String(v) === String(k) ? 'on' : ''}"><input type="radio" name="fx_${esc(path)}" data-fx="${path}" data-k="text" value="${esc(k)}"${String(v) === String(k) ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div>`
      : `<select data-fx="${path}" data-k="text" aria-label="${esc(lb || path)}">${opts.map(([k, l]) => `<option value="${esc(k)}"${String(v) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const fld = (lb, h, cls = '') => `<div class="f ${cls}"><label>${esc(lb)}</label><div class="ctl">${h}</div></div>`;
    function vFacts() {
      const f = F(); const r = calc(f); const c = cfg(); const spv = ctx.SPV.cfg();
      const below = r.margemPct < r.minimo - 1e-6;
      const conj = r.conj.map((x, i) => `<section class="card"><h2>${esc(x.nome || 'Conjunto ' + (i + 1))} <span class="sub code">${esc(x.codigo)}</span></h2>
        <div class="fields">${fld('Bomba / conjunto', inp(`conj.${i}.nome`, x.nome, 'text'), 'span2')}${fld('Quantidade de conjuntos', inp(`conj.${i}.qtd`, x.qtd))}
          ${fld('Acionamento', sel(`conj.${i}.acion`, x.acion, OPC.acion))}${x.acion === 'D' ? fld('Arrefecimento', sel(`conj.${i}.arref`, x.arref, OPC.arref), 'span2') + fld('Sensor de nível de óleo', sel(`conj.${i}.oleo`, x.oleo, OPC.oleo)) : ''}
          ${fld('Vedação da bomba', sel(`conj.${i}.selo`, x.selo, OPC.selo), 'span2')}${fld('Proteção do acoplamento', sel(`conj.${i}.prot`, x.prot, OPC.prot), 'span2')}
          ${fld('Alagamento', sel(`conj.${i}.band`, x.band, OPC.band), 'span2')}${fld('Abastecimento da sucção', sel(`conj.${i}.agua`, x.agua, OPC.agua), 'span2')}
          ${fld('Parada do teste', sel(`conj.${i}.parada`, x.parada, OPC.parada), 'span2')}${fld('Supervisão de posição', sel(`conj.${i}.pos`, x.pos, OPC.pos))}${fld('Válvula de esfera motorizada', sel(`conj.${i}.valv`, x.valv, OPC.valv))}
          ${x.valv === '1' ? fld('Válvula motorizada (EUR)', inp(`conj.${i}.valv_eur`, x.valv_eur)) : ''}${fld('Controlador Electra Impianti — plug & play (EUR)', inp(`conj.${i}.painel_eur`, x.painel_eur, 'num', { ph: 'opcional' }), 'span2')}</div>
        <div class="tw" style="margin-top:12px"><table class="t reg"><thead><tr><th>Código MECON</th><th>Item</th><th>EUR</th><th>Custo R$</th></tr></thead><tbody>${x.L.map((l) => `<tr><td class="code">${esc(l.cod)}</td><td>${esc(l.desc)}</td><td class="n">${fmt(l.eur * l.q)}</td><td class="n">${brl(l.custo)}</td></tr>`).join('')}
          ${num(f.mat_inst ?? c.mat_inst) ? `<tr><td class="code">LS FIRE</td><td>Materiais de instalação</td><td></td><td class="n">${brl(num(f.mat_inst ?? c.mat_inst))}</td></tr>` : ''}
          <tr class="tot"><td colspan="2">Custo por conjunto</td><td class="n">${fmt(x.eur)} EUR</td><td class="n">${brl(x.custoUn)}</td></tr></tbody></table></div>
        ${f.conj.length > 1 ? `<div class="docbar" style="margin-top:8px"><button class="restore" data-fxrm="${i}">remover este conjunto</button></div>` : ''}</section>`).join('');
      const tecOpts = [['', 'Escolha…']].concat(spv.tecnicos.map((t) => [t.nome, `${t.nome} — ${t.funcao} (${brl(t.diaria)})`]));
      const eq = (f.equipe || []).map((e, i) => `<tr><td class="in">${sel(`equipe.${i}.tec`, e.tec, tecOpts, 'Técnico')}</td><td class="in">${inp(`equipe.${i}.diaria`, e.diaria)}</td><td class="in">${inp(`equipe.${i}.dias`, e.dias)}</td><td class="n">${brl(num(e.diaria) * num(e.dias))}</td><td><button class="restore" data-fxeqrm="${i}">remover</button></td></tr>`).join('');
      return `<div class="stack">
        ${r.semFator ? `<div class="banner bad">A margem alvo (${pct(r.alvo, 1)}) somada aos impostos e comissões passa de 100%: não há preço que chegue a essa margem, e o valor ficou zerado. Baixe a margem alvo ou informe o preço à mão.</div>` : ''}
        ${ctx.confCard ? ctx.confCard() : ''}
        <section class="card"><h2>Cliente</h2><div class="fields">${fld('Cliente', inp('cliente', f.cliente, 'text'), 'span2')}${fld('Nº da proposta', inp('numero', f.numero, 'text') + (window.LSNumGerar ? window.LSNumGerar('seq', 'input[data-fx="numero"]', f.numero) : ''))}${fld('Contato', inp('contato', f.contato, 'text'))}${fld('Local', inp('local', f.local, 'text'), 'span2')}${fld('UF', inp('uf', f.uf, 'text'))}${fld('Vendedor', inp('vendedor', f.vendedor, 'text'))}</div></section>
        ${conj}
        <div class="docbar"><button class="btn sm" data-fxadd>+ Outro conjunto (outra bomba com outra configuração)</button></div>
        <section class="card"><h2>Instalação, treinamento e suporte <span class="sub">custo ${brl(r.custoSv)}</span></h2>
          <div class="tw"><table class="t reg"><thead><tr><th>Equipe LS Fire (instalação e comissionamento)</th><th>Diária (R$)</th><th>Dias</th><th>Total</th><th></th></tr></thead><tbody>${eq || '<tr><td colspan="5" class="sub">Sem equipe própria na instalação.</td></tr>'}</tbody></table></div>
          <div class="docbar" style="margin-top:8px"><button class="btn sm" data-fxeqadd>+ Técnico</button></div>
          <div class="fields" style="margin-top:12px">${fld('Deslocamento e estadia da equipe (R$)', inp('inst_desl', f.inst_desl))}${fld('Materiais de instalação por conjunto (R$)', inp('mat_inst', f.mat_inst ?? c.mat_inst, 'num', { ph: 'cabos blindados, eletrodutos' }))}
            ${fld('Suporte MECON em campo (horas)', inp('suporte_h', f.suporte_h))}${fld('Despesas do suporte MECON (EUR)', inp('suporte_desp', f.suporte_desp))}</div>
          <div class="docbar" style="margin-top:10px"><label class="chip"><input type="checkbox" data-fx="treino.on" data-k="bool"${f.treino.on ? ' checked' : ''}> Treinamento MECON em Lübeck</label>${f.treino.on ? `<span class="sub">participantes</span>${inp('treino.part', f.treino.part)}<span class="sub">dias</span>${inp('treino.dias', f.treino.dias)}` : ''}</div></section>
        <section class="card"><h2>Formação do preço</h2><div class="split2"><div class="kv">
          <div>Equipamentos MECON (custo, R$ ${fmt(r.k, 4)} por EUR${r.desc ? ', desconto de volume ' + pct(r.desc, 0) : ''})</div><div>${brl(r.custoEq)}</div>
          <div>Serviços</div><div>${brl(r.custoSv)}</div>
          <div>Margem líquida alvo</div><div class="in">${inp('margem', r.alvo, 'pct', { lb: 'Margem alvo' })}<span class="sub"> %</span></div>
          <div>Venda dos equipamentos <small class="sub">ICMS ${pct(r.icms, 1)} · PIS/COFINS ${pct(r.pis + r.cof, 2)} · IR/CSLL ${pct(r.ir, 2)} · comissão ${pct(r.com, 2)}</small></div><div>${brl(r.Veq)}</div>
          <div>Venda dos serviços <small class="sub">ISS e tributos de serviço</small></div><div>${brl(r.Vsv)}</div>
          <div class="sep"></div><div hidden></div>
          <div><b>Preço sem IPI</b></div><div><b>${brl(r.V)}</b></div>
          <div>Impostos</div><div>− ${brl(r.imp)}</div><div>Comissão</div><div>− ${brl(r.comV)}</div><div>Custos</div><div>− ${brl(r.custo)}</div>
          <div class="sep"></div><div hidden></div>
          <div><b>Margem líquida</b></div><div class="${below ? 'bad-t' : 'ok-t'}"><b>${brl(r.margem)} · ${pct(r.margemPct, 1)}</b></div>
          ${r.ipi ? `<div>IPI (${pct(cfg().ipi, 2)})</div><div>${brl(r.ipi)}</div>` : ''}</div>
          <div class="stack">
            <div class="fields">${fld('Preço fechado (sem IPI) — opcional', inp('preco', f.preco, 'num', { ph: 'deixe vazio para usar a margem alvo' }), 'spanall')}${fld('Desconto de volume MECON', sel('volume', String(f.volume || 0), [['0', 'Nenhum'], ['0.03', '3% (10 a 20 conjuntos no ano)'], ['0.05', '5% (21 a 30 conjuntos no ano)']]), 'spanall')}</div>
            <p class="sub" style="margin:0">Impostos e comissão vêm de Cadastros → Fiscal e Precificação (SEQ); a margem mínima é a dos equipamentos (${pct(r.minimo, 0)}). Lista MECON e fator R$/EUR ficam em Cadastros → Custos → FACTS (MECON).</p>
            <div class="docbar"><button class="btn pri" data-fxtxt>Copiar texto técnico para a proposta</button></div>
          </div></div></section>
      </div>`;
    }
    // ---------- cadastro (Custos): lista MECON e fator ----------
    function vCfg(ed) {
      const c = cfg(); const ro = ed ? '' : ' disabled';
      const ci = (path, v, kind = 'num') => `<input data-fxcfg="${path}" data-k="${kind}" value="${esc(kind === 'pct' ? NF[2].format(num(v) * 100) : kind === 'num' ? String(v ?? '').replace('.', ',') : v ?? '')}"${kind === 'text' ? '' : ' inputmode="decimal"'}${ro}>`;
      return `<div class="stack"><section class="card"><h2>FACTS — lista MECON 2026 <span class="sub">preço de integrador em EUR; o pacote básico já inclui a stop box</span></h2>
        <div class="tw"><table class="t reg"><thead><tr><th>Código</th><th>Descrição</th><th>EUR</th><th>Custo R$</th></tr></thead><tbody>${c.cat.map((x, i) => `<tr><td class="code">${esc(x.cod)}</td><td class="in">${ci(`cat.${i}.desc`, x.desc, 'text')}</td><td class="in">${ci(`cat.${i}.eur`, x.eur)}</td><td class="n">${brl(num(x.eur) * c.rs_eur)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><h2>Custo de importação e serviços MECON</h2><div class="fields">
          <div class="f"><label>R$ por EUR (câmbio × importação)</label><div class="ctl pctl">${ci('rs_eur', +c.rs_eur.toFixed(4))}</div><small class="sub">Da planilha LS_Fire-FACTS_2608: DB0 de 8.071 EUR custa R$ 90.830,16.</small></div>
          <div class="f"><label>IPI dos equipamentos</label><div class="ctl pctl">${ci('ipi', c.ipi, 'pct')}<span class="unit">%</span></div><small class="sub">Confirmar NCM com o Fiscal.</small></div>
          <div class="f"><label>Materiais de instalação por conjunto (R$)</label><div class="ctl pctl">${ci('mat_inst', c.mat_inst)}</div></div>
          <div class="f"><label>Treinamento Lübeck (EUR, 1 dia, 1 pessoa)</label><div class="ctl pctl">${ci('treino_base', c.treino_base)}</div></div>
          <div class="f"><label>Dia ou participante adicional (EUR)</label><div class="ctl pctl">${ci('treino_dia', c.treino_dia)}</div></div>
          <div class="f"><label>Engenheiro MECON em campo (EUR/h)</label><div class="ctl pctl">${ci('suporte_h', c.suporte_h)}</div></div></div></section></div>`;
    }
    async function saveCfg(mut, desc) { const cur = (REG.tabelas.FACTS || {}).cfg || {}; const c = Object.assign(clone(DEF), clone(cur)); mut(c); try { await REG.setTable('FACTS', { cfg: c }, desc || 'FACTS: lista e custos', []); } catch (e) { toast(e.message || 'Não consegui salvar'); } }

    // ---------- eventos ----------
    const setPath = (o, path, v) => { const ks = path.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) { const k = /^\d+$/.test(ks[i]) ? +ks[i] : ks[i]; if (x[k] == null) x[k] = {}; x = x[k]; } x[ks[ks.length - 1]] = v; };
    const parseV = (el) => { const k = el.dataset.k; if (k === 'bool') return el.checked; const t = el.value.trim(); if (k === 'text') return t; if (t === '') return null; const n = parseInput(t, 'num'); if (typeof n !== 'number') return undefined; return k === 'pct' ? n / 100 : n; };
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.fx && F()) { let v = parseV(el); if (v === undefined) { toast('Número inválido'); return ctx.render(); } const p = el.dataset.fx; if (p === 'volume') v = +v;
        setPath(F(), p, v); const m = /^equipe\.(\d+)\.tec$/.exec(p); if (m) { const t = ctx.SPV.cfg().tecnicos.find((x) => x.nome === v); if (t) F().equipe[+m[1]].diaria = t.diaria; }
        ctx.persist(); ctx.render(); return; }
      if (el.dataset && el.dataset.fxcfg) { const v = parseV(el); if (v === undefined) return toast('Número inválido'); saveCfg((c) => setPath(c, el.dataset.fxcfg, v), 'FACTS: ' + el.dataset.fxcfg); }
    });
    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-factsnew]')) { const cur = st(); if (t.closest('#app .famgrid') && !cur.id && cur.doc && Object.keys(cur.doc).length > 1 && !(await window.PricerDlg.confirmar('Abrir uma formação FACTS nova? A proposta atual ainda não foi salva.'))) return; novo(); return; }
      if (!F()) return;
      if (t.closest('[data-fxadd]')) { const last = F().conj[F().conj.length - 1]; F().conj.push(Object.assign(clone(last), { nome: 'Outra bomba', qtd: 1 })); ctx.persist(); ctx.render(); return; }
      const rm = t.closest('[data-fxrm]'); if (rm) { F().conj.splice(+rm.dataset.fxrm, 1); ctx.persist(); ctx.render(); return; }
      if (t.closest('[data-fxeqadd]')) { F().equipe = F().equipe || []; F().equipe.push({ tec: '', diaria: 0, dias: 1 }); ctx.persist(); ctx.render(); return; }
      const er = t.closest('[data-fxeqrm]'); if (er) { F().equipe.splice(+er.dataset.fxeqrm, 1); ctx.persist(); ctx.render(); return; }
      if (t.closest('[data-fxtxt]')) { const txt = escopo(F()); navigator.clipboard.writeText(txt).then(() => toast('Texto técnico copiado'), () => ctx.modal(`<h2>Texto técnico</h2><textarea rows="14" style="width:100%">${esc(txt)}</textarea><div><button class="btn" data-close>Fechar</button></div>`)); }
    });
    return { vFacts, vCfg, calc, snapshot, novo, escopo, propostaDados, total: () => (F() ? calc(F()).V : null) };
  }
  window.PricerFacts = Facts;
})();
