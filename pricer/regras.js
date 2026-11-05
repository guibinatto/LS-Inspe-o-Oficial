/* LS Pricer — regras de configuração (Engenharia).
   A Engenharia cadastra regras de compatibilidade e de componentes obrigatórios ou proibidos; o app confere cada item
   da proposta contra elas e mostra o alerta com a criticidade escolhida. O app não traz nenhuma regra pronta: cada regra
   tem a fonte (norma, requisito do cliente ou decisão interna) informada por quem a cadastrou. As regras não mexem no cálculo. */
(function () {
  'use strict';
  const CAMPOS = [['_comp', 'Componente presente (descrição)'], ['C21', 'Família'], ['E17', 'Arranjo (código)'], ['D19', 'Bomba'], ['C19', 'Potência diesel (HP)'], ['H19', 'Rotação (RPM)'], ['F19', 'Arrefecimento'], ['I19', 'Potência elétrica (CV)'], ['L19', 'Tensão do painel'], ['G17', 'Vazão'], ['J19', 'Bomba jockey']];
  const OPS = [['=', 'é igual a'], ['!=', 'é diferente de'], ['contem', 'contém'], ['>=', 'é maior ou igual a'], ['<=', 'é menor ou igual a'], ['preenchido', 'está preenchido'], ['vazio', 'está vazio']];
  const EFEITOS = [['exige', 'exige componente adicional que contenha'], ['proibe', 'não pode ter (incompatível ou já incluído) componente que contenha'], ['aviso', 'só avisa']];
  const STATUS = [['publicada', 'Publicada (vale nas propostas)'], ['rascunho', 'Rascunho (só no testador)'], ['inativa', 'Inativa']];
  const SEV = [['imped', 'Impeditiva'], ['aviso', 'Atenção'], ['info', 'Informativa']];
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const numOf = (v) => { if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
  const lb = (L, k) => (L.find((x) => x[0] === k) || [k, k])[1];

  window.PricerRegras = function (ctx) {
    const { REG, esc, toast, modal } = ctx;
    const $ = (s, r) => (r || document).querySelector(s);
    const lista = () => (((REG.tabelas || {}).REGRAS_CFG || {}).lista || []);
    function condOk(c, campos, comps) {
      if (c.campo === '_comp') { const alvo = norm(c.valor); const tem = !!alvo && (comps || []).some((d) => d.includes(alvo)); return c.op === '!=' || c.op === 'vazio' ? !tem : tem; }
      const v = campos[c.campo]; const t = norm(v); const alvo = norm(c.valor);
      switch (c.op) {
        case '=': return t === alvo; case '!=': return t !== alvo; case 'contem': return !!alvo && t.includes(alvo);
        case '>=': { const a = numOf(v), b = numOf(c.valor); return a !== null && b !== null && a >= b; }
        case '<=': { const a = numOf(v), b = numOf(c.valor); return a !== null && b !== null && a <= b; }
        case 'preenchido': return t !== ''; case 'vazio': return t === ''; default: return false;
      }
    }
    // item = { campos: {C21: …}, comps: ['descrição do componente', …] }
    // vale nas propostas: publicada (ou regra da REV22 inicial, sem status) e ativa; o testador pode incluir rascunhos
    const vale = (r, comRasc) => r.ativa !== false && (r.status || 'publicada') !== 'inativa' && ((r.status || 'publicada') === 'publicada' || (comRasc && r.status === 'rascunho'));
    function avaliar(item, comRasc) {
      const out = []; const comps = (item.comps || []).map(norm).filter(Boolean);
      for (const r of lista().slice().sort((a, b) => (+a.prioridade || 99) - (+b.prioridade || 99))) {
        if (!vale(r, comRasc)) continue;
        if (!(r.cond || []).every((c) => condOk(c, item.campos || {}, comps))) continue;
        const alvo = norm(r.componente); const tem = alvo && comps.some((d) => d.includes(alvo));
        if (r.efeito === 'exige' && tem) continue; if (r.efeito === 'proibe' && !tem) continue;
        const padrao = r.efeito === 'exige' ? `falta componente "${r.componente}"` : r.efeito === 'proibe' ? `não pode ter componente "${r.componente}"` : r.nome;
        out.push({ sev: r.sev || 'aviso', msg: (r.mensagem || padrao) + ' (regra ' + (r.id || '') + ': ' + r.nome + (r.status === 'rascunho' ? ', rascunho' : '') + ')', regra: r });
      }
      return out;
    }
    const descCond = (c) => `${lb(CAMPOS, c.campo)} ${lb(OPS, c.op)}${['preenchido', 'vazio'].includes(c.op) ? '' : ' "' + c.valor + '"'}`;
    const who = (id) => (id ? `<span data-uid="${esc(id)}">…</span>` : '—');
    function vCfg(ed) {
      const L = lista();
      return `<div class="stack"><section class="card"><h2>Regras de configuração <span class="sub">compatibilidade e componentes obrigatórios ou proibidos</span></h2>
        <p class="sub" style="margin:0 0 8px">Cada item da proposta é conferido contra estas regras. Uma regra <b>impeditiva</b> trava o envio ao cliente (se a política de Custos travar); <b>atenção</b> pede tratamento; <b>informativa</b> só avisa. O app não vem com regras prontas: cadastre só o que tiver fonte (norma, requisito do cliente ou decisão da Engenharia) e informe a fonte. As regras não alteram preço nem custo.</p>
        ${L.length ? `<div class="tw"><table class="t"><thead><tr><th>Regra</th><th>Quando</th><th>Então</th><th>Criticidade</th><th>Fonte · responsável</th><th></th></tr></thead><tbody>${L.map((r, i) => [r, i]).sort((a, b) => (+a[0].prioridade || 99) - (+b[0].prioridade || 99)).map(([r, i]) => `<tr class="${!vale(r) ? 'ro' : ''}">
          <td><small class="code">${esc(r.id || '')}</small> <b>${esc(r.nome)}</b><br><small class="sub">prioridade ${esc(String(r.prioridade || '—'))} · versão ${esc(String(r.versao || 1))}</small> ${r.ativa === false || r.status === 'inativa' ? '<span class="pill mute">inativa</span>' : r.status === 'rascunho' ? '<span class="pill warn">rascunho</span>' : '<span class="pill ok">publicada</span>'}</td><td><small>${(r.cond || []).length ? (r.cond || []).map((c) => esc(descCond(c))).join('<br>e ') : 'sempre'}</small></td>
          <td><small>${esc(lb(EFEITOS, r.efeito))}${r.efeito === 'aviso' ? '' : ' "' + esc(r.componente || '') + '"'}</small></td><td><span class="pill ${r.sev === 'imped' ? 'bad' : r.sev === 'aviso' ? 'warn' : 'mute'}">${esc(lb(SEV, r.sev))}</span></td>
          <td><small class="sub">${esc(r.fonte || '')}<br>${who(r.resp)}</small></td><td>${ed ? `<button class="btn sm" data-rgedit="${i}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub" style="margin:0">Nenhuma regra cadastrada.</p>'}
        ${ed ? '<div class="docbar" style="margin-top:8px"><button class="btn pri" data-rgedit="novo">+ Nova regra</button></div>' : '<p class="sub" style="margin:8px 0 0">Só quem cuida de Engenharia altera as regras.</p>'}
        <p class="sub" style="margin:8px 0 0">Dependências entre componentes: use "Componente presente" na condição. Ex.: quando houver "KIT MOTOR", o "PAINEL" avulso não pode entrar (já incluído no fornecimento); quando houver "TANQUE", exige "MANGUEIRA DE COMBUSTÍVEL". Substitutos e equivalentes ficam na ficha de cada insumo; opcionais, na estrutura.</p></section>
        ${ctx.selecao ? ctx.selecao() : ''}</div>`;
    }
    async function salvar(nova, desc, mud) { await REG.setTable('REGRAS_CFG', { lista: nova }, desc, mud || []); }
    function editar(i) {
      const L = lista(); const novoId = () => 'RG-' + String(Math.max(0, ...L.map((x) => parseInt(String(x.id || '').replace(/\D/g, ''), 10) || 0)) + 1).padStart(3, '0');
      const r = i === 'novo' || i === 'dup' ? Object.assign({ nome: '', cond: [{ campo: 'C21', op: '=', valor: '' }], efeito: 'exige', componente: '', sev: 'aviso', mensagem: '', fonte: '', ativa: true, status: 'rascunho', prioridade: 50 }, editar.base || {}, { id: novoId(), versao: 1 }) : JSON.parse(JSON.stringify(L[+i]));
      if (i === 'dup') { i = 'novo'; editar.base = null; }
      const opt = (Lx, cur) => Lx.map(([k, t]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
      const condRow = (c, j) => `<div class="rgcond" data-j="${j}"><select data-rc="campo" aria-label="Campo">${opt(CAMPOS, c.campo)}</select><select data-rc="op" aria-label="Condição">${opt(OPS, c.op)}</select><input data-rc="valor" list="dl_rc_${j}" value="${esc(c.valor || '')}" aria-label="Valor" placeholder="valor"><datalist id="dl_rc_${j}">${(ctx.opcoes ? ctx.opcoes(c.campo) : []).slice(0, 400).map((x) => `<option value="${esc(x)}">`).join('')}</datalist><button class="restore" data-rcrm="${j}" aria-label="Tirar condição">×</button></div>`;
      modal(`<h2>${i === 'novo' ? 'Nova regra' : 'Regra'}</h2>
        <div class="fields"><div class="f span2 req"><label for="rgNome">Nome</label><input id="rgNome" value="${esc(r.nome)}" placeholder="ex.: skid com painel de comando"></div>
          <div class="f"><label for="rgSev">Criticidade</label><select id="rgSev">${opt(SEV, r.sev)}</select></div><div class="f"><label for="rgPri">Prioridade</label><input id="rgPri" inputmode="numeric" value="${esc(String(r.prioridade ?? 50))}"></div>
          <div class="f span2"><label for="rgSt">Situação</label><select id="rgSt">${opt(STATUS, r.ativa === false ? 'inativa' : (r.status || 'publicada'))}</select></div>
          <div class="f spanall"><label>Quando (todas as condições; sem condição = sempre)</label><div id="rgConds">${(r.cond || []).map(condRow).join('')}</div><button class="restore" id="rgAdd">+ condição</button></div>
          <div class="f span2"><label for="rgEf">Então</label><select id="rgEf">${opt(EFEITOS, r.efeito)}</select></div><div class="f span2"><label for="rgComp">Componente (parte da descrição)</label><input id="rgComp" list="dl_rgcomp" value="${esc(r.componente || '')}" placeholder="ex.: PAINEL"></div>
          <div class="f spanall"><label for="rgMsg">Mensagem do alerta (opcional)</label><input id="rgMsg" value="${esc(r.mensagem || '')}" placeholder="em branco: o app escreve"></div>
          <div class="f spanall req"><label for="rgFonte">Fonte ou justificativa</label><input id="rgFonte" value="${esc(r.fonte || '')}" placeholder="ex.: requisito do cliente X; decisão da Engenharia em 10/2026; item da norma conferido por quem cadastra"></div></div>
        <p class="sub" id="rgMsgSt" style="margin:0"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="rgOk">Salvar regra</button>${i !== 'novo' ? '<button class="btn" id="rgDup">Duplicar</button><button class="btn" id="rgDel">Excluir</button>' : ''}<button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        const ler = () => [...o.querySelectorAll('.rgcond')].map((d) => ({ campo: d.querySelector('[data-rc="campo"]').value, op: d.querySelector('[data-rc="op"]').value, valor: d.querySelector('[data-rc="valor"]').value.trim() }));
        const redraw = (cs) => { $('#rgConds', o).innerHTML = cs.map(condRow).join(''); };
        // ao trocar o campo da condição, as sugestões de valor passam a ser as daquele campo
        o.addEventListener('change', (e) => { if (e.target.matches('[data-rc="campo"]')) redraw(ler()); });
        if (!$('#dl_rgcomp', o)) { const dl = document.createElement('datalist'); dl.id = 'dl_rgcomp'; dl.innerHTML = (ctx.opcoes ? ctx.opcoes('_comp') : []).slice(0, 1200).map((x) => `<option value="${esc(x)}">`).join(''); o.appendChild(dl); }
        $('#rgAdd', o).onclick = () => redraw(ler().concat([{ campo: 'C21', op: '=', valor: '' }]));
        o.addEventListener('click', (e) => { const x = e.target.closest('[data-rcrm]'); if (!x) return; const cs = ler(); cs.splice(+x.dataset.rcrm, 1); redraw(cs); });
        $('#rgOk', o).onclick = async () => {
          const st0 = $('#rgSt', o).value; const mudou = i !== 'novo';
          const rec = Object.assign(r, { nome: $('#rgNome', o).value.trim(), sev: $('#rgSev', o).value, ativa: st0 !== 'inativa', status: st0, prioridade: parseInt($('#rgPri', o).value, 10) || 50, resp: REG.me || r.resp || null, versao: mudou ? (+r.versao || 1) + 1 : 1, at: new Date().toISOString(), cond: ler().filter((c) => ['preenchido', 'vazio'].includes(c.op) || c.valor), efeito: $('#rgEf', o).value, componente: $('#rgComp', o).value.trim(), mensagem: $('#rgMsg', o).value.trim(), fonte: $('#rgFonte', o).value.trim() });
          const st = $('#rgMsgSt', o);
          if (!rec.nome) { st.textContent = 'Dê um nome à regra.'; return; } if (!rec.fonte) { st.textContent = 'Informe a fonte ou a justificativa da regra.'; return; }
          if (rec.efeito !== 'aviso' && !rec.componente) { st.textContent = 'Diga qual componente a regra exige ou proíbe.'; return; }
          const nova = lista().slice(); if (i === 'novo') nova.push(rec); else nova[+i] = rec;
          try { await salvar(nova, 'Regras de configuração: ' + rec.nome + (i === 'novo' ? ' (nova)' : ''), [{ campo: rec.nome, de: null, para: (rec.cond.map(descCond).join(' e ') || 'sempre') + ' → ' + lb(EFEITOS, rec.efeito) + ' ' + rec.componente + ' · ' + lb(SEV, rec.sev) }]); close(); toast('Regra salva'); } catch (e) { st.textContent = e.message || 'Não consegui salvar'; }
        };
        const dp = $('#rgDup', o); if (dp) dp.onclick = () => { const b = JSON.parse(JSON.stringify(r)); delete b.id; b.nome = b.nome + ' (cópia)'; b.status = 'rascunho'; editar.base = b; close(); editar('dup'); };
        const del = $('#rgDel', o); if (del) del.onclick = async () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Confirmar exclusão'; del.classList.add('pri'); return; }
          const nova = lista().slice(); nova.splice(+i, 1); try { await salvar(nova, 'Regras de configuração: ' + r.nome + ' excluída', [{ campo: r.nome, de: 'regra', para: null }]); close(); toast('Regra excluída'); } catch (e) { toast(e.message || 'Não consegui excluir'); } };
      });
    }
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-rgedit]'); if (b) editar(b.dataset.rgedit); });
    return { avaliar, vCfg, lista, CAMPOS, vale };
  };
})();
