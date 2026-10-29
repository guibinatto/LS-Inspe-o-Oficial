/* LS Pricer — pedidos de cadastro.
 * Onde falta preço (componente, motor, peça), quem está montando a proposta pede o cadastro com os
 * dados básicos; a descrição já sai no padrão da família. O pedido vai para a área de Custos, que
 * cadastra o insumo com o preço. Tudo fica no histórico.
 */
(function () {
  'use strict';
  const LSK = 'lspricer.pedidos.v1';
  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  const up = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const norm = (s) => up(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const fmtNum = (v) => String(v ?? '').replace('.', ',');

  // padrão de descrição por família (o mesmo da Padronização de descrições)
  const PADROES = {
    1: { nome: 'Motor diesel', campos: [['modelo', 'Modelo (como no catálogo)', 'ex.: 6M16G308/6'], ['hp', 'Potência (HP)', 'ex.: 483'], ['rpm', 'Rotação (RPM)', 'ex.: 1800'], ['cil', 'Cilindros', 'ex.: 6'], ['vcc', 'Tensão', ['24VCC', '12VCC']], ['arref', 'Arrefecimento', ['RADIADOR', 'TROCADOR DE CALOR']]],
      monta: (c) => `${up(c.modelo)} ${fmtNum(c.hp)}HP@${fmtNum(c.rpm)}RPM ${fmtNum(c.cil)}CIL ${c.vcc} ${c.arref}`, ok: /^\S+ \d+HP@\d+RPM \d+CIL (12|24)VCC (RADIADOR|TROCADOR)/, regra: '{MODELO} {HP}HP@{RPM}RPM {N}CIL {12|24}VCC {RADIADOR|TROCADOR DE CALOR} — a marca vai no campo Fabricante' },
    10: { nome: 'Motor elétrico', campos: [['cv', 'Potência (CV)', 'ex.: 60'], ['polos', 'Polos', ['2P', '4P', '6P']], ['tensao', 'Tensão', ['220/380/440V', '380/660V', '660V']], ['marca', 'Marca', ['WEG', 'ABB', 'SEW']], ['mont', 'Montagem', ['MANCAL', 'MONOBLOCO']]],
      monta: (c) => `MOTOR ${fmtNum(c.cv)}CV ${c.polos} IP55 ${c.tensao} ${c.marca} ${c.mont}`, ok: /^MOTOR \d+(,\d+)?CV [246]P IP55 \S+ \S+ (MANCAL|MONOBLOCO)$/, regra: 'MOTOR {CV}CV {2P|4P|6P} IP55 {TENSÃO} {MARCA} {MANCAL|MONOBLOCO}' },
    11: { nome: 'Bomba de eixo livre', campos: [['modelo', 'Série e modelo (notação do catálogo)', 'ex.: TKF 65-250 · SCE 150-315 · IS 080X065X250']],
      monta: (c) => up(c.modelo), ok: /^\S+/, regra: '{SÉRIE} {MODELO} na notação do catálogo do fabricante' },
    12: { nome: 'Motobomba', campos: [['bomba', 'Modelo da bomba', 'ex.: TKF-M 65-200'], ['acion', 'Acionamento', ['ELÉTRICO', 'DIESEL']], ['marca', 'Marca do motor', 'ex.: WEG'], ['hp', 'Potência (HP)', 'ex.: 75'], ['rpm', 'Rotação (RPM)', 'ex.: 3500'], ['cert', 'Certificação (opcional)', 'ex.: UL/FM']],
      monta: (c) => `${up(c.bomba)} C/ MOTOR ${c.acion} ${up(c.marca)} ${fmtNum(c.hp)}HP${c.rpm ? ' @' + fmtNum(c.rpm) + 'RPM' : ''}${c.cert ? ' ' + up(c.cert) : ''}`.replace(/\s+/g, ' ').trim(), ok: /C\/ MOTOR (ELÉTRICO|DIESEL)/, regra: '{MODELO DA BOMBA} C/ MOTOR {ELÉTRICO|DIESEL} {MARCA} {POT}HP @{RPM}RPM {CERTIFICAÇÃO}' },
    13: { nome: 'Bomba jockey', campos: [['modelo', 'Modelo', 'ex.: BT4-2015E7'], ['cv', 'Potência (CV)', 'ex.: 1,5'], ['fase', 'Alimentação', ['TRIF', 'MONO']]],
      monta: (c) => `${up(c.modelo)} ${fmtNum(c.cv)}CV ${c.fase} 60HZ`, ok: /\d+(,\d+)?CV (TRIF|MONO)/, regra: '{MODELO} {POT}CV {TRIF|MONO} 60HZ' },
  };
  const famCode = (fam) => parseInt(String(fam || '').split('.')[0], 10) || 0;
  function padraoCheck(fam, produto) {
    const F = window.PricerFamilias; if (F) return F.checar(fam, produto, F.cfgFn ? F.cfgFn() : null);
    const p = PADROES[famCode(fam)]; const t = String(produto || '');
    if (!t.trim()) return 'Falta a descrição.';
    if (t !== t.toUpperCase()) return 'Use letras maiúsculas, como no restante do cadastro.';
    if (/\s{2,}/.test(t) || t !== t.trim()) return 'Há espaços duplos ou nas pontas.';
    if (p && !p.ok.test(t)) return 'Fora do padrão da família: ' + p.regra;
    return '';
  }

  function Pedidos(ctx) {
    const { REG, esc, brl, modal, toast, parseInput, ui } = ctx;
    const $ = (s, el = document) => el.querySelector(s);
    const shared = () => REG.mode === 'shared' && !!REG.db;
    let lista = []; let sub = null;
    const lsGet = () => { try { return JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (e) { return {}; } };
    const lsSet = (o) => { try { localStorage.setItem(LSK, JSON.stringify(o)); } catch (e) { throw new Error('O navegador não deixou gravar o pedido (sem espaço). Baixe um backup e libere espaço.'); } };
    function ensure() {
      const m = shared() ? 'shared' : 'local'; if (sub === m || sub === 'shared') return; sub = m;
      if (m === 'shared') REG.db.collection('pedidos').orderBy('at', 'desc').limit(300).onSnapshot((s) => { lista = s.docs.map((d) => Object.assign({ id: d.id }, d.data())); ctx.render(); }, () => {});
      else lista = Object.entries(lsGet()).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    }
    async function gravar(id, rec) {
      const body = JSON.parse(JSON.stringify(rec)); delete body.id;
      if (shared()) await REG.db.doc('pedidos/' + id).set(body);
      else { const all = lsGet(); all[id] = body; lsSet(all); lista = Object.entries(all).map(([k, x]) => Object.assign({ id: k }, x)).sort((a, b) => String(b.at).localeCompare(String(a.at))); }
    }
    const abertos = () => lista.filter((x) => x.status === 'aberto');
    const meus = () => lista.filter((x) => !REG.me || x.by === REG.me);
    const parecidos = (fam, produto) => {
      const W = new Set(norm(produto).split(' ').filter((w) => w.length > 1)); if (!W.size) return [];
      return REG.insumos.filter((i) => !fam || i.fam === fam).map((i) => { const V = norm(i.produto).split(' '); let c = 0; for (const w of V) if (W.has(w)) c++; return { i, s: c / Math.max(W.size, V.length) }; })
        .filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.i);
    };

    // ---------- pedir ----------
    function pedir(pre = {}) {
      ensure();
      const fams = ctx.famList(); let fam = pre.fam && fams.includes(pre.fam) ? pre.fam : (fams.find((f) => famCode(f) === famCode(pre.fam)) || fams[0]);
      const campos = Object.assign({}, pre.campos || {});
      modal(`<h2>Pedir cadastro de insumo</h2>
        <p class="sub" style="margin:0">Preencha o básico. A descrição sai no padrão da família, e o pedido vai para a área de Custos cadastrar o preço. Você acompanha em Cadastro → Custos → Pedidos de cadastro.</p>
        <div class="fields"><div class="f span2"><label for="pdFam">Família</label><select id="pdFam">${fams.map((f) => `<option${f === fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="f"><label for="pdFab">Fabricante</label><input id="pdFab" value="${esc(pre.fab || '')}"></div>
          <div class="f"><label for="pdOri">Origem</label><select id="pdOri"><option value="NAC"${pre.origem === 'IMP' ? '' : ' selected'}>Nacional</option><option value="IMP"${pre.origem === 'IMP' ? ' selected' : ''}>Importado</option></select></div></div>
        <div id="pdCampos"></div>
        <div class="f"><label for="pdDesc">Descrição para o cadastro</label><input id="pdDesc" value="${esc(pre.produto || '')}"><small class="sub" id="pdChk"></small></div>
        <div id="pdSim"></div>
        <div class="fields"><div class="f spanall"><label for="pdObs">Observação para Custos</label><input id="pdObs" placeholder="fornecedor sugerido, nº do orçamento, prazo, aplicação…" value="${esc(pre.obs || '')}"></div>
          <div class="f"><label for="pdUrg">Prazo</label><select id="pdUrg"><option>normal</option><option>urgente (proposta em aberto)</option></select></div></div>
        ${pre.linha ? `<p class="sub" style="margin:0">Pedido a partir de ${esc(pre.linha.rotulo || 'uma linha da proposta')}${pre.produtoLinha ? ` (texto na proposta: "${esc(pre.produtoLinha)}")` : ''}.</p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="pdOk">Enviar pedido</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        const draw = () => {
          fam = $('#pdFam', o).value; const p = PADROES[famCode(fam)];
          const ex = REG.insumos.filter((i) => i.fam === fam && i.produto).slice(-3).map((i) => i.produto);
          $('#pdCampos', o).innerHTML = p ? `<div class="fields">${p.campos.map(([k, lb, opt]) => Array.isArray(opt) ? `<div class="f${opt.length > 2 ? ' span2' : ''}"><label>${esc(lb)}</label><div class="seg">${opt.map((x, j) => `<label class="${(campos[k] || opt[0]) === x ? 'on' : ''}"><input type="radio" name="pdc_${k}" data-pdc="${k}" value="${esc(x)}"${(campos[k] || opt[0]) === x ? ' checked' : ''}>${esc(x)}</label>`).join('')}</div></div>` : `<div class="f${k === 'modelo' || k === 'bomba' ? ' span2' : ''}"><label>${esc(lb)}</label><input data-pdc="${k}" placeholder="${esc(opt)}" value="${esc(campos[k] || '')}"></div>`).join('')}</div><p class="sub" style="margin:4px 0 0">Padrão: <span class="code">${esc(p.regra)}</span></p>`
            : `<p class="sub" style="margin:0">Siga o padrão dos nomes desta família, em maiúsculas.${ex.length ? ' Exemplos: ' + ex.map((x) => `<span class="code">${esc(x)}</span>`).join(' · ') : ''}</p>`;
          o.querySelectorAll('[data-pdc]').forEach((el) => { if (el.type === 'radio') { if (el.checked && !campos[el.dataset.pdc]) campos[el.dataset.pdc] = el.value; el.onchange = () => { if (!el.checked) return; campos[el.dataset.pdc] = el.value; el.closest('.seg').querySelectorAll('label').forEach((l) => l.classList.toggle('on', l.contains(el))); montar(); }; return; } el.oninput = el.onchange = () => { campos[el.dataset.pdc] = el.value; montar(); }; });
          montar();
        };
        const montar = () => { const p = PADROES[famCode(fam)]; if (p && p.campos.every(([k]) => k === 'cert' || k === 'rpm' || String(campos[k] || '').trim())) $('#pdDesc', o).value = p.monta(campos); checar(); };
        const checar = () => { const d = $('#pdDesc', o).value; const m = padraoCheck(fam, d); $('#pdChk', o).textContent = m || 'Descrição no padrão.'; $('#pdChk', o).className = m ? 'sub bad-t' : 'sub ok-t';
          const igual = REG.insumos.find((i) => i.produto === up(d));
          if (igual) { $('#pdSim', o).innerHTML = `<div class="banner ${typeof igual.valor === 'number' ? 'ok' : 'warn'}">Este insumo já existe no cadastro (${esc(igual.id)})${typeof igual.valor === 'number' ? ' com preço de ' + brl(igual.valor) + ': escolha-o na lista da família em vez de pedir.' : ', mas sem preço: o pedido vai para Custos cadastrar o preço dele.'}</div>`; $('#pdOk', o).textContent = typeof igual.valor === 'number' ? 'Enviar mesmo assim (atualizar o preço)' : 'Pedir o preço'; pre.insumoId = igual.id; return; }
          $('#pdOk', o).textContent = 'Enviar pedido';
          const sim = window.PricerFamilias ? window.PricerFamilias.duplicidades({ id: null, fam, produto: d }, REG.insumos, window.PricerFamilias.cfgFn ? window.PricerFamilias.cfgFn() : null).map((x) => x.x) : parecidos(fam, d); $('#pdSim', o).innerHTML = sim.length ? `<div class="banner info">Já existe algo parecido no cadastro — confira antes de pedir: ${sim.map((i) => `<b>${esc(i.produto)}</b> (${typeof i.valor === 'number' ? brl(i.valor) : 'sem preço'})`).join('; ')}</div>` : ''; };
        $('#pdFam', o).onchange = draw; $('#pdDesc', o).oninput = checar; draw();
        $('#pdOk', o).onclick = async () => {
          const d = up($('#pdDesc', o).value); if (!d) { toast('Preencha a descrição'); return; }
          const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          const rec = { status: 'aberto', at: new Date().toISOString(), by: REG.me || null, fam, produto: d, fab: up($('#pdFab', o).value), origem: $('#pdOri', o).value, obs: $('#pdObs', o).value.trim(), urgencia: $('#pdUrg', o).value,
            insumoId: pre.insumoId || null, produtoLinha: pre.produtoLinha || null, propUid: pre.propUid || null, propNome: pre.propNome || null, padrao: padraoCheck(fam, d) || 'ok' };
          $('#pdOk', o).disabled = true;
          try { await gravar(id, rec); await ctx.log({ tipo: 'Pedido de cadastro', ref: id, desc: d + (rec.propNome ? ' · ' + rec.propNome : ''), mudancas: [{ campo: 'Família', de: null, para: fam }, { campo: 'Situação', de: null, para: 'aberto' }] }); close(); toast('Pedido enviado para Custos'); ctx.render(); }
          catch (e) { $('#pdOk', o).disabled = false; toast((e && e.message) || 'Não consegui enviar o pedido'); }
        };
      });
    }

    // ---------- atender (área de Custos) ----------
    function atender(x) {
      const ed = REG.areaOk('custos'); if (!ed) { toast('Só a área de Custos cadastra o preço.'); return; }
      const exist = x.insumoId && REG.insumos.find((i) => i.id === x.insumoId);
      modal(`<h2>Cadastrar: ${esc(x.produto)}</h2>
        <p class="sub" style="margin:0">Pedido de <span data-uid="${esc(x.by || '')}">${x.by ? '…' : 'alguém da equipe'}</span> em ${esc(new Date(x.at).toLocaleDateString('pt-BR'))}${x.propNome ? ' · ' + esc(x.propNome) : ''}${x.obs ? ' · ' + esc(x.obs) : ''}</p>
        <div class="fields"><div class="f span2"><label>Família</label><input value="${esc(x.fam)}" disabled></div>
          <div class="f spanall"><label for="atDesc">Descrição (padrão da família)</label><input id="atDesc" value="${esc(exist ? exist.produto : x.produto)}"${exist ? ' disabled' : ''}><small class="sub" id="atChk"></small></div>
          <div class="f"><label for="atFab">Fabricante</label><input id="atFab" value="${esc((exist && exist.fab) || x.fab || '')}"></div>
          <div class="f"><label for="atTipo">Tipo / configuração</label><input id="atTipo" value="${esc((exist && exist.tipo) || '')}"></div>
          <div class="f"><label for="atOri">Origem</label><select id="atOri"><option value="NAC"${x.origem === 'IMP' ? '' : ' selected'}>NAC</option><option value="IMP"${x.origem === 'IMP' ? ' selected' : ''}>IMP</option></select></div>
          <div class="f"><label for="atVal">Preço de custo (R$)</label><input id="atVal" inputmode="decimal" placeholder="obrigatório se ativo"></div>
          <div class="f span2"><label for="atSit">Situação ao cadastrar</label><select id="atSit"><option value="ativo">Ativo (liberado para uso)</option><option value="validacao">Aguardando validação técnica</option><option value="preco">Aguardando preço (Compras)</option></select></div>
          <div class="f spanall"><label for="atFonte">Fonte do preço</label><input id="atFonte" placeholder="fornecedor, nº do orçamento, data"></div></div>
        ${x.produtoLinha && x.produtoLinha !== x.produto ? `<p class="sub" style="margin:0">Na proposta a linha está como "${esc(x.produtoLinha)}". Ao cadastrar, o app troca esse nome pelo padronizado nas propostas salvas.</p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="atOk">Cadastrar e atender</button><button class="btn" id="atNo">Recusar</button><button class="btn" data-close>Cancelar</button></div>`, (o, close) => {
        ctx.fillNames(o);
        const chk = () => { const m = padraoCheck(x.fam, $('#atDesc', o).value); $('#atChk', o).textContent = m || 'Descrição no padrão.'; $('#atChk', o).className = m ? 'sub bad-t' : 'sub ok-t'; };
        $('#atDesc', o).oninput = chk; chk();
        $('#atOk', o).onclick = async () => {
          const sit = $('#atSit', o).value; const vt = $('#atVal', o).value.trim(); const v = vt ? parseInput(vt, 'num') : null;
          if (sit === 'ativo' && (typeof v !== 'number' || v <= 0)) { toast('Para liberar como ativo, informe o preço de custo (ou escolha "aguardando preço")'); return; }
          if (v !== null && (typeof v !== 'number' || v < 0)) { toast('Preço inválido'); return; }
          const produto = exist ? exist.produto : up($('#atDesc', o).value); const fonte = $('#atFonte', o).value.trim();
          $('#atOk', o).disabled = true;
          try {
            let insId;
            if (exist) { insId = exist.id; await REG.saveInsumo(Object.assign({}, exist, { valor: v, situacao: sit === 'ativo' && !exist.situacao ? undefined : sit, fab: up($('#atFab', o).value) || exist.fab, tipo: $('#atTipo', o).value.trim() || exist.tipo, origem: $('#atOri', o).value, obs: [exist.obs, 'pedido ' + x.id, fonte].filter(Boolean).join(' · ') }), false); }
            else {
              const dup = REG.insumos.find((i) => i.produto === produto); if (dup) { toast('Já existe um insumo com essa descrição: ' + dup.id); $('#atOk', o).disabled = false; return; }
              const { a, b } = REG.nextCode(x.fam); insId = REG.newInsumoId(a, b);
              await REG.saveInsumo({ id: insId, a, b, fam: x.fam, produto, fab: up($('#atFab', o).value), tipo: $('#atTipo', o).value.trim(), valor: v, origem: $('#atOri', o).value, obs: ['pedido ' + x.id, fonte].filter(Boolean).join(' · '), situacao: sit, fonte: fonte || undefined, dataCot: v !== null ? new Date().toISOString().slice(0, 10) : undefined }, true);
            }
            if (x.produtoLinha && x.produtoLinha !== produto) { const map = Object.assign({}, ((REG.tabelas || {}).RENOMES || {}).map || {}, { [x.produtoLinha]: produto }); await REG.setTable('RENOMES', { map }, 'Nome da proposta → cadastro: ' + produto, [{ campo: x.produtoLinha, de: null, para: produto }]).catch(() => {}); }
            const stP = sit === 'ativo' ? 'atendido' : sit === 'preco' ? 'aguardando preço' : 'aguardando validação';
            await gravar(x.id, Object.assign({}, x, { status: stP, insumoId: insId, produtoFinal: produto, valor: v, fonte, situacaoInsumo: sit, atendidoEm: new Date().toISOString(), atendidoBy: REG.me || null }));
            await ctx.log({ tipo: 'Pedido de cadastro ' + stP, ref: x.id, desc: produto, mudancas: [{ campo: 'Valor', de: null, para: v }, { campo: 'Situação', de: 'aberto', para: stP }] });
            close(); toast('Cadastrado e atendido: ' + produto); ctx.render();
          } catch (e) { $('#atOk', o).disabled = false; toast((e && e.message) || 'Não consegui cadastrar'); }
        };
        $('#atNo', o).onclick = async () => {
          const mot = window.prompt('Motivo da recusa (vai para quem pediu):'); if (!mot) return;
          await gravar(x.id, Object.assign({}, x, { status: 'recusado', motivo: mot, atendidoEm: new Date().toISOString(), atendidoBy: REG.me || null }));
          await ctx.log({ tipo: 'Pedido de cadastro recusado', ref: x.id, desc: x.produto + ' — ' + mot, mudancas: [{ campo: 'Situação', de: 'aberto', para: 'recusado' }] });
          close(); toast('Pedido recusado'); ctx.render();
        };
      });
    }

    // ---------- lista (Cadastro → Custos → Pedidos de cadastro) ----------
    function vLista() {
      ensure(); const ed = REG.areaOk('custos'); const f = ui.pdSt || 'aberto';
      const pill = { aberto: 'warn', atendido: 'ok', recusado: 'bad', 'aguardando preço': 'warn', 'aguardando validação': 'warn' };
      const rows = lista.filter((x) => f === 'todos' || x.status === f || (f === 'andamento' && /^aguardando/.test(x.status))).map((x) => `<tr><td>${esc(new Date(x.at).toLocaleDateString('pt-BR'))}<br><small class="sub"><span data-uid="${esc(x.by || '')}">${x.by ? '…' : 'neste navegador'}</span></small></td>
        <td><b>${esc(x.produtoFinal || x.produto)}</b><br><small class="sub">${esc(x.fam)}${x.fab ? ' · ' + esc(x.fab) : ''} · ${esc(x.origem || '')}${x.propNome ? ' · ' + esc(x.propNome) : ''}</small>${x.padrao && x.padrao !== 'ok' ? `<br><small class="bad-t">${esc(x.padrao)}</small>` : ''}${x.obs ? `<br><small class="sub">${esc(x.obs)}</small>` : ''}</td>
        <td><span class="pill ${pill[x.status] || 'mute'}">${esc(x.status)}</span>${/urgente/.test(x.urgencia || '') ? ' <span class="pill bad">urgente</span>' : ''}${x.status === 'atendido' ? `<br><small class="sub">${brl(x.valor)} · ${esc(x.insumoId || '')}</small>` : x.status === 'recusado' ? `<br><small class="sub">${esc(x.motivo || '')}</small>` : ''}</td>
        <td>${x.status === 'aberto' && ed ? `<button class="btn sm pri" data-pdat="${esc(x.id)}">Cadastrar</button>` : ''}</td></tr>`).join('');
      return `<div class="stack"><section class="card"><h2>Pedidos de cadastro <span class="sub">${abertos().length} em aberto</span></h2>
        <p class="sub" style="margin:0 0 10px">Pedidos feitos de dentro das propostas, onde falta insumo ou preço. ${ed ? 'Ao cadastrar, o insumo entra com o preço e a proposta de quem pediu passa a enxergá-lo.' : 'Quem cadastra é a área de Custos.'}</p>
        <div class="sheetbar"><select id="pdSt" aria-label="Situação">${[['aberto', 'Em aberto'], ['andamento', 'Cadastrados, aguardando validação ou preço'], ['atendido', 'Liberados'], ['recusado', 'Recusados'], ['todos', 'Todos']].map(([k, l]) => `<option value="${k}"${f === k ? ' selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" data-pedir>+ Novo pedido</button></div>
        <div class="tw" style="margin-top:10px"><table class="t"><thead><tr><th>Data / quem</th><th>Insumo</th><th>Situação</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="sub">Nenhum pedido.</td></tr>'}</tbody></table></div></section></div>`;
    }
    // cartão da página inicial: pedidos de quem está usando
    function cardHome() {
      ensure(); const m = meus(); if (!m.length && !(REG.areaOk('custos') && abertos().length)) return '';
      const ab = m.filter((x) => x.status === 'aberto').length; const at = m.filter((x) => x.status !== 'aberto').slice(0, 3);
      return `<div class="contcard"><div><b>Pedidos de cadastro</b> <span class="sub">${ab} seu(s) em aberto${at.length ? ' · último: ' + esc(at[0].produtoFinal || at[0].produto) + ' ' + (at[0].status === 'atendido' ? '(' + brl(at[0].valor) + ')' : '(' + at[0].status + ')') : ''}${REG.areaOk('custos') && abertos().length ? ` · <b>${abertos().length} aguardando Custos</b>` : ''}</span></div><button class="btn sm" data-pdgo>Ver pedidos</button></div>`;
    }

    document.addEventListener('click', (e) => {
      const t = e.target;
      const pd = t.closest('[data-pedir]'); if (pd) { let pre = {}; try { pre = pd.dataset.pedir ? JSON.parse(pd.dataset.pedir) : {}; } catch (er) { pre = {}; } const s = ctx.getState(); pre.propUid = pre.propUid || s.uid || null; pre.propNome = pre.propNome || ctx.docTitle(); pedir(pre); return; }
      const at = t.closest('[data-pdat]'); if (at) { const x = lista.find((y) => y.id === at.dataset.pdat); if (x) atender(x); return; }
      if (t.closest('[data-pdgo]')) { ui.view = 'cadastro'; ui.cad = 'pedidos'; ctx.render(); window.scrollTo(0, 0); }
    });
    document.addEventListener('change', (e) => { if (e.target.id === 'pdSt') { ui.pdSt = e.target.value; ctx.render(); } });
    return { pedir, vLista, cardHome, abertos, ensure, padraoCheck };
  }
  window.PricerPedidos = Pedidos;
  window.PricerPadraoCheck = padraoCheck;
})();
