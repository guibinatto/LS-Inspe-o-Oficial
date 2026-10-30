/* LS Pricer — "cadastrar novo" nas listas de sugestão (fabricante, marca, fornecedor, tipo, cliente, insumo).
   A lista do navegador só mostra o que já existe; aqui cada campo ganha "+ novo …" no rótulo e um aviso quando o
   valor digitado ainda não está na lista. Fabricante, marca, fornecedor, tipo e cliente entram no cadastro ao gravar
   a ficha ou a proposta; insumo abre a ficha de insumo (ou o pedido de cadastro, para quem não edita o cadastro). */
(function () {
  'use strict';
  const app = document.getElementById('app'); const ov = document.getElementById('overlay');
  // lista de sugestões → o que se cadastra
  const TIPO = { dlFabAll: 'fabricante', dl_pdfab: 'fabricante', dl_kmarca: 'marca', dl_fornall: 'fornecedor', dl_mdforn: 'fornecedor', dlTipos: 'tipo/configuração', dl_clientes: 'cliente', dl_spcli: 'cliente', dlInsAll: 'insumo', dl_ins_all: 'insumo', dlKitProd: 'insumo', dl_pb: 'insumo' };
  const tipoDe = (inp) => TIPO[inp.getAttribute('list')] || null;
  const opcoes = (inp) => { const dl = document.getElementById(inp.getAttribute('list')); return dl ? [...dl.options].map((o) => String(o.value).trim().toUpperCase()) : []; };
  const ehNovo = (inp) => { const v = String(inp.value || '').trim().toUpperCase(); return !!v && !opcoes(inp).includes(v); };
  const art = (t) => (t === 'insumo' || t === 'fabricante' || t === 'fornecedor' || t === 'cliente' || t === 'tipo/configuração' ? 'novo' : 'nova');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function decora(root) {
    for (const inp of root.querySelectorAll('input[list]')) {
      if (inp.dataset.cadv || inp.disabled || inp.readOnly) continue; const t = tipoDe(inp); if (!t) continue; inp.dataset.cadv = '1';
      const f = inp.closest('.f'); const lb = (inp.id && root.querySelector('label[for="' + inp.id + '"]')) || (f && f.querySelector(':scope > label'));
      if (lb && !lb.querySelector('[data-cadnovo]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'restore'; b.dataset.cadnovo = ''; b.textContent = '+ ' + art(t) + ' ' + t; b.title = 'Cadastrar ' + (art(t) === 'novo' ? 'um novo ' : 'uma nova ') + t; lb.appendChild(b); }
      dica(inp);
    }
  }
  // aviso abaixo do campo quando o valor ainda não está na lista
  function dica(inp) {
    const t = tipoDe(inp); if (!t) return; const box = inp.closest('.f') || inp.parentElement; let d = box.querySelector(':scope > .cadnovo');
    if (!ehNovo(inp)) { if (d) d.remove(); return; }
    if (!d) { d = document.createElement('small'); d.className = 'cadnovo'; d.setAttribute('aria-live', 'polite'); box.appendChild(d); }
    const v = esc(String(inp.value).trim());
    d.innerHTML = t === 'insumo' ? `"${v}" não está no cadastro de insumos. <button type="button" class="restore" data-cadins>Cadastrar este insumo</button>`
      : `<b>${art(t) === 'novo' ? 'Novo' : 'Nova'} ${esc(t)}:</b> "${v}" entra no cadastro quando você gravar.`;
  }
  document.addEventListener('input', (e) => { const el = e.target; if (el.matches && el.matches('input[list][data-cadv]')) dica(el); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cadnovo], [data-cadins]'); if (!b) return; e.preventDefault();
    const f = b.closest('.f') || b.parentElement; const lb = b.closest('label');
    const inp = (lb && lb.htmlFor && document.getElementById(lb.htmlFor)) || (f && f.querySelector('input[list]')); if (!inp) return; const t = tipoDe(inp);
    if (t === 'insumo') { if (window.LSNovo) window.LSNovo.insumo(b.hasAttribute('data-cadins') ? String(inp.value).trim() : '', ''); return; }
    const dlg = window.PricerDlg; const nome = dlg ? await dlg.pedir('Nome ' + (art(t) === 'novo' ? 'do novo ' : 'da nova ') + t + ':', '') : window.prompt('Nome:', '');
    const v = String(nome || '').trim().replace(/\s+/g, ' '); if (!v) return;
    inp.value = v.toUpperCase(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.focus();
  });
  let pend = 0; const agenda = () => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; if (app) decora(app); if (ov) decora(ov); }); };
  if (app) new MutationObserver(agenda).observe(app, { childList: true, subtree: true });
  if (ov) new MutationObserver(agenda).observe(ov, { childList: true, subtree: true });
  agenda();
})();
