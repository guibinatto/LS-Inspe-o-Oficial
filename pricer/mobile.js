/* LS Pricer — uso no celular e no tablet. Só interface: nada aqui muda dados, cálculo, regras ou permissões.
   - tabelas largas viram cartões no celular (cada valor com o nome da coluna); "Ver tabela completa" volta à tabela;
   - barra de navegação inferior (Início, Proposta, Pendências, Cadastros, Mais) com os mesmos selos do menu lateral;
   - "Mais ações" da barra superior (Nova, Abrir, Cancelar, Tema, Modo detalhado) num painel inferior;
   - teclado virtual: o campo ativo fica visível e as barras fixas saem da frente enquanto o teclado está aberto;
   - painel "Por que este componente?" do configurador como painel inferior, com fundo para fechar. */
(function () {
  'use strict';
  const cel = window.matchMedia('(max-width: 767px)');
  const app = document.getElementById('app');
  if (!app) return;
  const fmt = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // ---- tabelas em cartões ----
  // ficam como tabela: planilha completa, tabelas pequenas, o memorial (colunas por item) e as que já têm layout próprio
  const FICA = 'table.grid, table.mini, table.cfgcomp, .memo table, [data-tabela], .dlgdoc table';
  let completa = false; try { completa = localStorage.getItem('lspricer.tabelas') === 'completa'; } catch (e) { completa = false; }
  document.body.classList.toggle('tab-completa', completa);
  const rotuloBotao = () => (completa ? 'Ver em cartões' : 'Ver tabela completa');
  function cartoes(root) {
    if (!cel.matches) return;
    for (const t of root.querySelectorAll('table.t')) {
      if (t.dataset.mob) continue;
      if (t.closest(FICA) || t.matches(FICA)) { t.dataset.mob = 'fica'; continue; }
      if (!t.offsetParent) continue; // dentro de um bloco fechado: trata quando abrir
      const cab = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null;
      const caixa = t.parentElement;
      const largura = caixa ? caixa.clientWidth : window.innerWidth;
      if (t.scrollWidth <= largura + 2) { t.dataset.mob = 'cabe'; continue; }
      // sem cabeçalho: as células empilham no cartão, sem rótulo
      const rot = []; if (cab) for (const c of cab.cells) { const tx = fmt(c.innerText || c.textContent); for (let k = 0; k < (c.colSpan || 1); k++) rot.push(tx); }
      for (const corpo of t.tBodies) for (const r of corpo.rows) {
        let i = 0; let titulo = false; const n = r.cells.length;
        if (n === 1 || [...r.cells].some((c) => c.colSpan >= rot.length - 1 && rot.length > 2)) r.classList.add('mobfull');
        for (const c of r.cells) {
          const lb = rot[i] || ''; i += c.colSpan || 1;
          const so = c.querySelector('input[type=checkbox], input[type=radio]') && !fmt(c.textContent);
          if (!titulo && !so && fmt(c.textContent).length >= 3 && !c.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea')) { c.classList.add('mobtit'); titulo = true; if (lb) c.dataset.label = lb; continue; }
          if (lb && c.colSpan <= 1) c.dataset.label = lb; else c.removeAttribute('data-label');
          if (so) c.classList.add('mobsel');
        }
      }
      t.classList.add('mobcard'); if (t.querySelector('thead .thsort')) t.classList.add('mobsort'); t.dataset.mob = 'card';
      const alvo = caixa && caixa.classList.contains('tw') ? caixa : t;
      if (!alvo.previousElementSibling || !alvo.previousElementSibling.hasAttribute('data-mobtg')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm mobtg'; b.dataset.mobtg = ''; b.textContent = rotuloBotao();
        b.setAttribute('aria-pressed', completa ? 'true' : 'false'); alvo.before(b);
      }
      if (caixa && caixa.classList.contains('tw')) caixa.classList.add('mobtw');
    }
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-mobtg]')) return;
    completa = !completa; try { localStorage.setItem('lspricer.tabelas', completa ? 'completa' : 'cartoes'); } catch (er) { /* só nesta visita */ }
    document.body.classList.toggle('tab-completa', completa);
    for (const b of document.querySelectorAll('[data-mobtg]')) { b.textContent = rotuloBotao(); b.setAttribute('aria-pressed', completa ? 'true' : 'false'); }
  });
  document.addEventListener('toggle', (e) => { if (e.target.tagName === 'DETAILS' && e.target.open) cartoes(e.target); }, true);

  // ---- barra inferior: espelha o menu lateral (página atual e selos) ----
  const bnav = document.getElementById('bnav');
  function espelhaNav() {
    if (!bnav) return; let algum = false;
    for (const b of bnav.querySelectorAll('button[data-view]')) {
      const o = document.querySelector('#nav [data-view="' + b.dataset.view + '"]'); if (!o) continue;
      const at = o.getAttribute('aria-current') === 'page'; if (at) algum = true;
      b.setAttribute('aria-current', at ? 'page' : 'false');
      const so = o.querySelector('.nbadge'); let x = b.querySelector('.nbadge');
      if (so) { if (!x) { x = document.createElement('span'); x.className = 'nbadge'; b.appendChild(x); } x.textContent = so.textContent; b.setAttribute('aria-label', fmt(b.querySelector('span').textContent) + ' — ' + (so.title || so.textContent)); }
      else if (x) { x.remove(); b.removeAttribute('aria-label'); }
    }
    // Mais: Margens, Configurações e Ajuda (e os selos delas)
    const mais = bnav.querySelector('[data-bmais]'); if (!mais) return;
    mais.setAttribute('aria-current', !algum && document.querySelector('#nav button[aria-current="page"]') ? 'page' : 'false');
    const n = [...document.querySelectorAll('#nav [data-view="margens"] .nbadge, #nav [data-view="config"] .nbadge')].reduce((t, x) => t + (+x.textContent || 0), 0);
    let x = mais.querySelector('.nbadge'); if (n) { if (!x) { x = document.createElement('span'); x.className = 'nbadge'; mais.appendChild(x); } x.textContent = n; } else if (x) x.remove();
  }
  if (bnav) bnav.addEventListener('click', (e) => { if (e.target.closest('[data-bmais]')) { const m = document.getElementById('bMenu'); if (m) m.click(); } });

  // ---- "Mais ações" da barra superior ----
  const bMore = document.getElementById('bMore');
  let folha = null;
  function fechaFolha(volta) { if (!folha) return; folha.remove(); folha = null; if (bMore) { bMore.setAttribute('aria-expanded', 'false'); if (volta) bMore.focus(); } }
  if (bMore) bMore.addEventListener('click', () => {
    if (folha) { fechaFolha(true); return; }
    const ids = ['bNew', 'bOpen', 'bCancel', 'bMode', 'bTheme'];
    const itens = ids.map((id) => document.getElementById(id)).filter((b) => b && !b.hidden);
    folha = document.createElement('div'); folha.className = 'msheet-wrap';
    folha.innerHTML = '<div class="mscrim" data-msfecha></div><div class="msheet" role="menu" aria-label="Mais ações"><div class="msgrip" aria-hidden="true"></div>'
      + itens.map((b) => '<button type="button" role="menuitem" class="msitem" data-msid="' + b.id + '">' + (window.ICO ? window.ICO(b.dataset.ico || 'chevron-right') : '') + '<span>' + fmt(b.querySelector('.tl') ? b.querySelector('.tl').textContent : b.textContent) + '</span></button>').join('')
      + '<button type="button" class="msitem msfechar" data-msfecha>' + (window.ICO ? window.ICO('x') : '') + '<span>Fechar</span></button></div>';
    document.body.appendChild(folha); bMore.setAttribute('aria-expanded', 'true');
    const p = folha.querySelector('.msitem'); if (p) p.focus();
  });
  document.addEventListener('click', (e) => {
    if (!folha) return; const it = e.target.closest('[data-msid]');
    if (it) { const id = it.dataset.msid; fechaFolha(false); const b = document.getElementById(id); if (b) b.click(); return; }
    if (e.target.closest('[data-msfecha]')) fechaFolha(true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (folha) { e.preventDefault(); fechaFolha(true); return; }
    const f = document.body.classList.contains('cfg-sheet') && document.querySelector('#cfgPainel [data-cfgsel=""]'); if (f) { e.preventDefault(); f.click(); }
  }, true);

  // ---- teclado virtual: campo visível e barras fixas fora da frente ----
  const vv = window.visualViewport;
  const tecladoAberto = () => vv && window.innerHeight - vv.height > 140;
  if (vv) vv.addEventListener('resize', () => { document.body.classList.toggle('kb-open', cel.matches && tecladoAberto()); });
  document.addEventListener('focusin', (e) => {
    const el = e.target; if (!cel.matches || !el.matches || !el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')) return;
    setTimeout(() => { if (document.activeElement === el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 320);
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (!tecladoAberto()) document.body.classList.remove('kb-open'); }, 200));

  // ---- painel do componente (configurador) como painel inferior ----
  function painel() {
    const p = document.getElementById('cfgPainel'); const ja = document.querySelector('.cfgscrim');
    if (cel.matches && p) { if (!ja) { const s = document.createElement('div'); s.className = 'cfgscrim'; s.addEventListener('click', () => { const f = document.querySelector('#cfgPainel [data-cfgsel=""]'); if (f) f.click(); }); document.body.appendChild(s); } document.body.classList.add('cfg-sheet'); }
    else { if (ja) ja.remove(); document.body.classList.remove('cfg-sheet'); }
  }

  // atalhos que não são <button> (ex.: Pendências no resumo da proposta): Enter e espaço também acionam
  document.addEventListener('keydown', (e) => { const el = e.target; if ((e.key === 'Enter' || e.key === ' ') && el && el.matches && el.matches('[role=button][tabindex]:not(button)')) { e.preventDefault(); el.click(); } });

  // ---- a cada nova renderização ----
  let pend = 0;
  function passada() { pend = 0; cartoes(app); const ov = document.getElementById('overlay'); if (ov) cartoes(ov); espelhaNav(); painel(); }
  const agenda = () => { if (!pend) pend = requestAnimationFrame(passada); };
  new MutationObserver(agenda).observe(app, { childList: true, subtree: true });
  const ov = document.getElementById('overlay'); if (ov) new MutationObserver(agenda).observe(ov, { childList: true, subtree: true });
  const nav = document.getElementById('nav'); if (nav) new MutationObserver(agenda).observe(nav, { attributes: true, subtree: true, childList: true, characterData: true });
  const troca = () => { for (const t of document.querySelectorAll('table[data-mob]')) { if (t.dataset.mob === 'cabe') delete t.dataset.mob; } document.body.classList.toggle('kb-open', false); agenda(); };
  if (cel.addEventListener) cel.addEventListener('change', troca); else if (cel.addListener) cel.addListener(troca);
  window.addEventListener('orientationchange', troca);
  agenda();
})();
