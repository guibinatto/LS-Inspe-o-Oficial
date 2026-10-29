/* LS Pricer — cenários tributários (reforma: CBS, IBS, IS e transição).
 * O Fiscal cadastra cada cenário: tributos (alíquota, por dentro/por fora, base, redução, crédito) e regras de exceção.
 * Na proposta, compara hoje × cenário: preço para manter a margem e margem se o preço for mantido.
 * A formação oficial continua na planilha até o cenário ser confirmado.
 */
(function () {
  'use strict';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  // alíquotas de hoje que um tributo pode copiar ("igual à de hoje")
  const HOJE = [['ICMS', 'ICMS de hoje (por UF)'], ['PIS', 'PIS de hoje'], ['COFINS', 'COFINS de hoje'], ['IR', 'IRPJ/CSLL de hoje'], ['IPI', 'IPI de hoje (por NCM)'], ['ISS', 'ISS de hoje']];
  const CAMPOS = [['uf', 'UF de destino'], ['cadfiscal', 'Cadastro fiscal'], ['ncm', 'NCM começa com'], ['familia', 'Família do equipamento'], ['div', 'Divisão (SEQ/SPV)']];
  const EFEITOS = [['aliq', 'alíquota passa a ser (%)'], ['red', 'redução da base (%)'], ['isento', 'isento (não incide)']];
  const novoId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  // ponto de partida para 2027 pela Emenda 132/2023 e a LC 214/2025; tudo editável e marcado "a confirmar"
  const PADRAO_2027 = () => ({ id: novoId(), nome: '2027 — CBS no lugar de PIS/COFINS', vigencia: '2027-01-01', status: 'rascunho', obs: 'Rascunho para simulação. Confirmar alíquotas e regras com a contabilidade quando forem publicadas.',
    tributos: [
      { sigla: 'ICMS', desc: 'ICMS (continua até 2028; reduz de 2029 a 2032)', fonte: 'ICMS', modo: 'dentro', exclui: [], red: 0, cred: 0 },
      { sigla: 'IRPJ/CSLL', desc: 'IRPJ e CSLL (não mudam com a reforma)', fonte: 'IR', modo: 'dentro', exclui: [], red: 0, cred: 0 },
      { sigla: 'CBS', desc: 'Contribuição federal (substitui PIS/COFINS) — alíquota a definir', aliq: null, modo: 'fora', exclui: ['ICMS'], red: 0, cred: 0 },
      { sigla: 'IBS', desc: 'Imposto estadual/municipal — teste em 2027/2028', aliq: 0.001, modo: 'fora', exclui: ['ICMS'], red: 0, cred: 0 },
      { sigla: 'IPI', desc: 'IPI (zerado, exceto produtos com industrialização na ZFM)', aliq: 0, modo: 'fora', exclui: [], red: 0, cred: 0 },
    ], regras: [] });

  function Tributos(ctx) {
    const { REG, esc, brl, pct, NF, toast, parseInput } = ctx;
    const ler = () => Object.assign({ cenarios: [] }, ((REG.tabelas || {}).CEN_TRIB || {}));
    async function gravar(mut, desc, mud) { const C = JSON.parse(JSON.stringify(ler())); mut(C); try { await REG.setTable('CEN_TRIB', C, desc, mud || []); } catch (e) { toast((e && e.message) || 'Não consegui salvar'); } }
    const cenarios = () => ler().cenarios || [];

    // ---------- motor de cálculo ----------
    // alíquota de hoje de um item, pela fonte
    function hoje(x, fonte) {
      const pc = x.pisCofinsPct; const m = { ICMS: x.icmsPct, PIS: x.pisPct != null ? x.pisPct : pc != null ? pc * 0.178 : null, COFINS: x.cofinsPct != null ? x.cofinsPct : pc != null ? pc * 0.822 : null, IR: x.irPct, IPI: x.ipiPct, ISS: x.issPct };
      return num(m[fonte]);
    }
    const casa = (r, it, ctxP) => {
      const v = String(r.valor || '').trim().toUpperCase(); if (!v) return false;
      if (r.campo === 'uf') return String(ctxP.uf || '').toUpperCase() === v;
      if (r.campo === 'cadfiscal') return String(ctxP.cadfiscal || '').toUpperCase().includes(v);
      if (r.campo === 'ncm') return String(it.ncm || '').replace(/\D/g, '').startsWith(v.replace(/\D/g, ''));
      if (r.campo === 'familia') return String(it.familia || '').toUpperCase() === v || String(it.familiaNome || '').toUpperCase().includes(v);
      if (r.campo === 'div') return String(ctxP.div || 'SEQ').toUpperCase() === v;
      return false;
    };
    // alíquotas efetivas por dentro (sobre o valor da operação) e por fora (somadas ao valor), já com regras
    function efetivas(cen, it, ctxP) {
      const T = (cen.tributos || []).map((t) => {
        let aliq = t.fonte ? hoje(it, t.fonte) : t.aliq; let red = num(t.red); let isento = t.modo === 'nao'; const regras = [];
        for (const r of cen.regras || []) if (r.trib === t.sigla && casa(r, it, ctxP)) { regras.push(r); if (r.efeito === 'isento') isento = true; else if (r.efeito === 'aliq') aliq = num(r.num); else if (r.efeito === 'red') red = num(r.num); }
        return { t, aliq, red, isento, regras, falta: !isento && (aliq === null || aliq === undefined) };
      });
      const dentro = T.filter((x) => !x.isento && x.t.modo === 'dentro'); const e = {};
      for (let k = 0; k < 6; k++) for (const x of dentro) { const ex = (x.t.exclui || []).reduce((s, sg) => s + num(e[sg]), 0); e[x.t.sigla] = num(x.aliq) * (1 - num(x.red)) * (1 - ex); }
      const tIn = dentro.reduce((s, x) => s + num(e[x.t.sigla]), 0);
      let tOut = 0; const fora = {};
      for (const x of T.filter((y) => !y.isento && y.t.modo === 'fora')) { const ex = (x.t.exclui || []).reduce((s, sg) => s + num(e[sg]), 0); fora[x.t.sigla] = num(x.aliq) * (1 - num(x.red)) * (1 - ex); tOut += fora[x.t.sigla]; }
      const cred = T.filter((x) => !x.isento).reduce((s, x) => s + num(x.t.cred), 0);
      return { T, dentro: e, fora, tIn, tOut, cred, falta: T.filter((x) => x.falta).map((x) => x.t.sigla) };
    }
    // um item: mantendo a margem → preço; mantendo o preço ao cliente → margem
    function compara(cen, it, ctxP) {
      const E = efetivas(cen, it, ctxP);
      const v0 = it.venda, imp0 = num(it.impostos), com0 = num(it.comissao), ipi0 = num(it.ipi), custo0 = it.custo; const total0 = v0 + ipi0;
      const bf = it.margemPct && Math.abs(it.margemPct) > 1e-6 ? num(it.margem) / it.margemPct / v0 : (v0 - imp0) / v0; // base da margem % (receita líquida)
      const custo1 = custo0 * (1 - E.cred); const N = v0 - imp0; // receita líquida de hoje
      const v1 = E.tIn < 1 ? N / (1 - E.tIn) : NaN; const total1 = v1 * (1 + E.tOut);
      const m1 = N - com0 - custo1; const base1 = N; // mesma receita líquida
      const v2 = total0 / (1 + E.tOut); const imp2 = v2 * E.tIn; const m2 = v2 - imp2 - com0 - custo1;
      return { E, total0, margem0: it.margemPct, total1, v1, margemManter: base1 ? m1 / base1 : 0, v2, margemPreco: (v2 - imp2) ? m2 / (v2 - imp2) : 0, bf };
    }

    // ---------- tela do Fiscal ----------
    function vCenarios(ed) {
      const L = cenarios(); const sel = ctx.ui.cenSel && L.some((c) => c.id === ctx.ui.cenSel) ? ctx.ui.cenSel : (L[0] || {}).id; const c = L.find((x) => x.id === sel);
      const tabs = L.map((x) => `<button role="tab" aria-selected="${x.id === sel}" data-censel="${esc(x.id)}">${esc(x.nome)}${x.status === 'confirmado' ? ' ✓' : ''}</button>`).join('');
      const head = `<section class="card"><h2>Cenários tributários <span class="sub">reforma tributária: cadastre os tributos e as regras de cada fase</span></h2>
        <div class="banner info" style="margin:0 0 10px"><b>Como funciona:</b> cada cenário diz quais tributos incidem, com qual alíquota, se entram <b>por dentro</b> do preço (como o ICMS hoje) ou <b>por fora</b> (somados ao preço, como o IPI e a CBS/IBS), o que sai da base de cada um e se geram crédito sobre o custo. As <b>regras</b> mudam a alíquota para casos específicos (UF, NCM, cadastro fiscal, família). Na Revisão de cada proposta dá para comparar hoje × cenário. A formação oficial continua na planilha até vocês confirmarem as regras.</div>
        ${L.length ? `<div class="subtabs" role="tablist">${tabs}</div>` : '<p class="sub">Nenhum cenário ainda.</p>'}
        ${ed ? `<div class="docbar" style="margin-top:8px"><button class="btn pri" data-cennovo="2027">+ Cenário 2027 (rascunho pronto)</button><button class="btn" data-cennovo="vazio">+ Cenário em branco</button>${c ? '<button class="btn" data-cendup>Duplicar este</button><button class="btn" data-cendel>Excluir este</button>' : ''}</div>` : ''}</section>`;
      if (!c) return `<div class="stack">${head}</div>`;
      const dis = ed ? '' : ' disabled'; const siglas = (c.tributos || []).map((t) => t.sigla);
      const inp = (path, v, ph, w) => `<input data-cenf="${esc(path)}" value="${esc(v ?? '')}" placeholder="${esc(ph || '')}"${w ? ` style="width:${w}"` : ''}${dis}>`;
      const pctIn = (path, v, ph) => `<input data-cenf="${esc(path)}" data-pct="1" value="${typeof v === 'number' ? esc(NF[2].format(v * 100)) : ''}" placeholder="${esc(ph || '%')}" inputmode="decimal" style="width:70px;text-align:right"${dis}>`;
      const rowsT = (c.tributos || []).map((t, i) => `<tr>
          <td>${inp(`t.${i}.sigla`, t.sigla, 'sigla', '80px')}<br>${inp(`t.${i}.desc`, t.desc, 'descrição', '100%')}</td>
          <td><select data-cenf="t.${i}.fonte"${dis}><option value="">alíquota própria</option>${HOJE.map(([k, lb]) => `<option value="${k}"${t.fonte === k ? ' selected' : ''}>${lb}</option>`).join('')}</select>${t.fonte ? '' : `<div class="mbc">${pctIn(`t.${i}.aliq`, t.aliq, 'a definir')}<span class="sub">%</span></div>`}${!t.fonte && (t.aliq === null || t.aliq === undefined) && t.modo !== 'nao' ? '<small class="bad-t">falta a alíquota</small>' : ''}</td>
          <td><select data-cenf="t.${i}.modo"${dis}>${[['dentro', 'por dentro do preço'], ['fora', 'por fora (somado)'], ['nao', 'não incide']].map(([k, lb]) => `<option value="${k}"${t.modo === k ? ' selected' : ''}>${lb}</option>`).join('')}</select></td>
          <td>${siglas.filter((sg) => sg !== t.sigla).map((sg) => `<label class="chk"><input type="checkbox" data-cenex="${i}|${esc(sg)}"${(t.exclui || []).includes(sg) ? ' checked' : ''}${dis}> sem ${esc(sg)}</label>`).join(' ') || '<span class="sub">—</span>'}</td>
          <td><div class="mbc">${pctIn(`t.${i}.red`, t.red || 0, '0')}<span class="sub">%</span></div></td>
          <td><div class="mbc">${pctIn(`t.${i}.cred`, t.cred || 0, '0')}<span class="sub">%</span></div></td>
          <td>${ed ? `<button class="restore" data-centrm="${i}">remover</button>` : ''}</td></tr>`).join('');
      const rowsR = (c.regras || []).map((r, i) => `<tr><td>Se <select data-cenf="r.${i}.campo"${dis}>${CAMPOS.map(([k, lb]) => `<option value="${k}"${r.campo === k ? ' selected' : ''}>${lb}</option>`).join('')}</select> ${inp(`r.${i}.valor`, r.valor, 'ex.: SP, 8413, CONTRIBUINTE', '140px')}</td>
          <td>então <select data-cenf="r.${i}.trib"${dis}>${siglas.map((sg) => `<option${r.trib === sg ? ' selected' : ''}>${esc(sg)}</option>`).join('')}</select></td>
          <td><select data-cenf="r.${i}.efeito"${dis}>${EFEITOS.map(([k, lb]) => `<option value="${k}"${r.efeito === k ? ' selected' : ''}>${lb}</option>`).join('')}</select> ${r.efeito === 'isento' ? '' : `<div class="mbc" style="display:inline-flex">${pctIn(`r.${i}.num`, r.num, '%')}<span class="sub">%</span></div>`}</td>
          <td>${inp(`r.${i}.obs`, r.obs, 'base legal / observação', '100%')}</td><td>${ed ? `<button class="restore" data-cenrrm="${i}">remover</button>` : ''}</td></tr>`).join('');
      // exemplo de cálculo com um item de R$ 100.000 de receita líquida, ICMS 12%, IR 3,08%
      const ex = efetivas(c, { icmsPct: 0.12, pisPct: 0.0065, cofinsPct: 0.03, irPct: 0.0308, ipiPct: 0, issPct: 0, ncm: '84137090', familia: 'CONJUNTO MOTOBOMBA' }, { uf: 'SP', cadfiscal: 'CONTRIBUINTE', div: 'SEQ' });
      return `<div class="stack">${head}
        <section class="card"><h2>${esc(c.nome)}</h2><div class="fields"><div class="f span2"><label>Nome</label>${inp('nome', c.nome)}</div><div class="f"><label>Vale a partir de</label><input type="date" data-cenf="vigencia" value="${esc(c.vigencia || '')}"${dis}></div>
          <div class="f"><label>Situação</label><select data-cenf="status"${dis}>${[['rascunho', 'rascunho (simulação)'], ['confirmado', 'confirmado pela contabilidade']].map(([k, lb]) => `<option value="${k}"${c.status === k ? ' selected' : ''}>${lb}</option>`).join('')}</select></div><div class="f spanall"><label>Observação</label>${inp('obs', c.obs, 'fonte, data da norma, quem confirmou')}</div></div></section>
        <section class="card"><h2>Tributos</h2><div class="tw"><table class="t cent"><thead><tr><th>Tributo</th><th>Alíquota</th><th>Como entra</th><th>Base de cálculo</th><th>Redução da base</th><th>Crédito sobre o custo</th><th></th></tr></thead><tbody>${rowsT}</tbody></table></div>
          ${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn sm" data-centadd>+ Tributo</button></div>' : ''}
          <p class="sub" style="margin:8px 0 0"><b>Por dentro:</b> faz parte do preço (o preço é dividido por 1 − alíquotas). <b>Por fora:</b> somado ao preço na nota (o cliente paga a mais, sua receita não muda). <b>Base sem X:</b> o valor de X sai da base (ex.: PIS/COFINS hoje sem o ICMS). <b>Crédito sobre o custo:</b> quanto do custo de compra volta como crédito (tributo não cumulativo).</p></section>
        <section class="card"><h2>Regras e exceções</h2><div class="tw"><table class="t cent"><tbody>${rowsR || '<tr><td class="sub">Nenhuma regra. Ex.: "Se NCM começa com 8413 então IPI alíquota 0%"; "Se cadastro fiscal NÃO CONTRIBUINTE então ..."</td></tr>'}</tbody></table></div>
          ${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn sm" data-cenradd>+ Regra</button></div>' : ''}</section>
        <section class="card"><h2>Exemplo <span class="sub">item em SP, contribuinte, ICMS 12%, IRPJ/CSLL 3,08%</span></h2>
          <div class="kpis"><div class="kpi"><span>Por dentro do preço</span><b>${pct(ex.tIn, 2)}</b><em>${Object.entries(ex.dentro).map(([k, v]) => esc(k) + ' ' + pct(v, 2)).join(' · ') || '—'}</em></div><div class="kpi"><span>Por fora (somado)</span><b>${pct(ex.tOut, 2)}</b><em>${Object.entries(ex.fora).map(([k, v]) => esc(k) + ' ' + pct(v, 2)).join(' · ') || '—'}</em></div><div class="kpi"><span>Hoje</span><b>${pct(0.12 + (0.0065 + 0.03) * 0.88 + 0.0308, 2)}</b><em>por dentro (ICMS + PIS/COFINS + IR)</em></div></div>
          ${ex.falta.length ? `<p class="bad-t" style="margin:8px 0 0">Falta a alíquota de: ${esc(ex.falta.join(', '))}. Enquanto isso, conta como zero na comparação.</p>` : ''}</section></div>`;
    }
    // ---------- edição ----------
    const setPath = (o, path, v) => { const k = path.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[isNaN(k[i]) ? k[i] : +k[i]]; x[k[k.length - 1]] = v; };
    const comCen = (mut, desc) => { const id = ctx.ui.cenSel || (cenarios()[0] || {}).id; return gravar((C) => { const c = C.cenarios.find((x) => x.id === id); if (c) mut(c, C); }, desc); };
    document.addEventListener('change', (e) => {
      const el = e.target; if (ctx.ui.view !== 'cadastro' || ctx.ui.cad !== 'cenarios') return;
      if (el.dataset.cenf) { let path = el.dataset.cenf; let v = el.value.trim();
        if (el.dataset.pct) { if (v === '') v = path.endsWith('.aliq') || path.endsWith('.num') ? null : 0; else { const n = parseInput(v, 'num'); if (typeof n !== 'number') { toast('Número inválido'); return; } v = n / 100; } }
        if (path.startsWith('t.')) path = 'tributos.' + path.slice(2); else if (path.startsWith('r.')) path = 'regras.' + path.slice(2);
        if (path.endsWith('.sigla')) v = v.toUpperCase();
        comCen((c) => { setPath(c, path, v === '' && path.endsWith('.fonte') ? null : v); }, 'Cenário tributário: ' + el.dataset.cenf); return; }
      if (el.dataset.cenex) { const [i, sg] = el.dataset.cenex.split('|'); comCen((c) => { const t = c.tributos[+i]; const s = new Set(t.exclui || []); if (el.checked) s.add(sg); else s.delete(sg); t.exclui = [...s]; }, 'Base de cálculo'); }
    });
    document.addEventListener('click', (e) => {
      if (ctx.ui.view !== 'cadastro' || ctx.ui.cad !== 'cenarios') return; const t = e.target;
      const sl = t.closest('[data-censel]'); if (sl) { ctx.ui.cenSel = sl.dataset.censel; ctx.render(); return; }
      const nv = t.closest('[data-cennovo]'); if (nv) { const c = nv.dataset.cennovo === '2027' ? PADRAO_2027() : { id: novoId(), nome: 'Novo cenário', vigencia: '', status: 'rascunho', tributos: [], regras: [] }; ctx.ui.cenSel = c.id; gravar((C) => { C.cenarios.push(c); }, 'Cenário tributário criado: ' + c.nome); return; }
      if (t.closest('[data-cendup]')) { const c0 = cenarios().find((x) => x.id === ctx.ui.cenSel) || cenarios()[0]; if (!c0) return; const c = Object.assign(JSON.parse(JSON.stringify(c0)), { id: novoId(), nome: c0.nome + ' (cópia)', status: 'rascunho' }); ctx.ui.cenSel = c.id; gravar((C) => { C.cenarios.push(c); }, 'Cenário duplicado'); return; }
      if (t.closest('[data-cendel]')) { const id = ctx.ui.cenSel || (cenarios()[0] || {}).id; if (!window.confirm('Excluir este cenário?')) return; ctx.ui.cenSel = null; gravar((C) => { C.cenarios = C.cenarios.filter((x) => x.id !== id); }, 'Cenário tributário excluído'); return; }
      if (t.closest('[data-centadd]')) { comCen((c) => { c.tributos.push({ sigla: 'NOVO', desc: '', aliq: null, modo: 'dentro', exclui: [], red: 0, cred: 0 }); }, 'Tributo incluído'); return; }
      const tr = t.closest('[data-centrm]'); if (tr) { comCen((c) => { c.tributos.splice(+tr.dataset.centrm, 1); }, 'Tributo removido'); return; }
      if (t.closest('[data-cenradd]')) { comCen((c) => { c.regras = c.regras || []; c.regras.push({ campo: 'ncm', valor: '', trib: (c.tributos[0] || {}).sigla || '', efeito: 'aliq', num: 0, obs: '' }); }, 'Regra incluída'); return; }
      const rr = t.closest('[data-cenrrm]'); if (rr) { comCen((c) => { c.regras.splice(+rr.dataset.cenrrm, 1); }, 'Regra removida'); }
    });

    // ---------- comparação na proposta ----------
    function cardProposta(snap, ctxP) {
      const L = cenarios(); if (!L.length) return `<section class="card"><h2>Reforma tributária <span class="sub">compare com os tributos novos</span></h2><p class="sub" style="margin:0">Nenhum cenário cadastrado. O Fiscal cadastra em Cadastros → Fiscal → Cenários tributários.</p></section>`;
      const sel = ctx.ui.cenProp && L.some((c) => c.id === ctx.ui.cenProp) ? ctx.ui.cenProp : L.slice().sort((a, b) => String(b.vigencia).localeCompare(String(a.vigencia)))[0].id; const c = L.find((x) => x.id === sel);
      const R = snap.itens.map((it) => ({ it, r: compara(c, it, ctxP) }));
      const s = (f) => R.reduce((a, x) => a + num(f(x)), 0);
      const t0 = s((x) => x.r.total0), t1 = s((x) => x.r.total1);
      const falta = [...new Set(R.flatMap((x) => x.r.E.falta))];
      return `<section class="card"><h2>Reforma tributária <span class="sub">hoje × cenário — só comparação, o preço oficial segue a planilha</span></h2>
        <div class="seg" role="radiogroup" style="margin-bottom:8px">${L.map((x) => `<label class="${x.id === sel ? 'on' : ''}"><input type="radio" name="cenProp" data-cenprop="${esc(x.id)}"${x.id === sel ? ' checked' : ''}>${esc(x.nome)}${x.status === 'confirmado' ? ' ✓' : ' (rascunho)'}</label>`).join('')}</div>
        ${falta.length ? `<div class="banner warn" style="margin:0 0 8px">Falta a alíquota de ${esc(falta.join(', '))} neste cenário: conta como zero até o Fiscal preencher.</div>` : ''}
        <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Hoje: total ao cliente</th><th>Margem hoje</th><th>Cenário: total para manter a margem</th><th>Diferença</th><th>Margem se mantiver o preço</th></tr></thead><tbody>
          ${R.map(({ it, r }) => `<tr><td>${esc(String(it.nome).slice(0, 60))}<br><small class="sub">por dentro ${pct(r.E.tIn, 2)} · por fora ${pct(r.E.tOut, 2)}${r.E.cred ? ' · crédito ' + pct(r.E.cred, 1) : ''}</small></td><td class="n">${brl(r.total0)}</td><td class="n">${pct(it.margemPct, 1)}</td><td class="n"><b>${brl(r.total1)}</b></td><td class="n ${r.total1 - r.total0 > 0.5 ? 'bad-t' : 'ok-t'}">${r.total1 - r.total0 >= 0 ? '+' : '−'}${brl(Math.abs(r.total1 - r.total0)).replace('R$ ', '')}</td><td class="n ${r.margemPreco < num(snap.minimo) - 5e-4 ? 'bad-t' : ''}">${pct(r.margemPreco, 1)}</td></tr>`).join('')}
          <tr class="tot"><td>Proposta</td><td class="n">${brl(t0)}</td><td class="n">${pct(snap.margemPct, 1)}</td><td class="n">${brl(t1)}</td><td class="n">${t1 - t0 >= 0 ? '+' : '−'}${brl(Math.abs(t1 - t0)).replace('R$ ', '')} (${t0 ? pct((t1 - t0) / t0, 1) : '—'})</td><td></td></tr></tbody></table></div>
        <p class="sub" style="margin:8px 0 0">"Total ao cliente" inclui os tributos por fora (IPI hoje; CBS/IBS no cenário). "Manter a margem" mantém a mesma receita líquida. Cenário: ${esc(c.nome)}${c.vigencia ? ', a partir de ' + esc(new Date(c.vigencia + 'T12:00').toLocaleDateString('pt-BR')) : ''}.</p></section>`;
    }
    document.addEventListener('change', (e) => { const el = e.target.closest('[data-cenprop]'); if (el) { ctx.ui.cenProp = el.dataset.cenprop; ctx.render(); } });
    return { vCenarios, cardProposta, efetivas, compara, cenarios };
  }
  window.PricerTributos = Tributos;
})();
