/* LS Pricer — confirmação, pergunta e visualização de documento dentro do próprio app.
   Na página publicada, o navegador pode bloquear as janelas dele (confirm/prompt respondem sozinhas "não" e abas novas não
   abrem). Então: tenta a janela do navegador; se ela voltou na hora sem mostrar nada (bloqueada), pergunta num quadro do app.
   O "abrir" de documentos mostra o arquivo num quadro do app (PDF página a página, imagem direto), com botão para baixar. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function quadro(html, montar) {
    const w = document.createElement('div'); w.className = 'dlgwrap'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
    w.innerHTML = `<div class="dlgbox">${html}</div>`; document.body.appendChild(w);
    const fechar = () => { w.remove(); document.removeEventListener('keydown', tecla, true); };
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); w.dispatchEvent(new CustomEvent('dlgesc')); } };
    document.addEventListener('keydown', tecla, true);
    montar(w, fechar); return w;
  }
  function confirmaApp(msg) {
    return new Promise((res) => quadro(`<p class="dlgmsg">${esc(msg)}</p><div class="dlgbt"><button type="button" class="btn" data-dlg="n">Cancelar</button><button type="button" class="btn pri" data-dlg="s">OK</button></div>`, (w, fechar) => {
      const fim = (v) => { fechar(); res(v); };
      w.addEventListener('click', (e) => { const b = e.target.closest('[data-dlg]'); if (b) fim(b.dataset.dlg === 's'); else if (e.target === w) fim(false); });
      w.addEventListener('dlgesc', () => fim(false)); setTimeout(() => { const b = w.querySelector('[data-dlg="s"]'); if (b) b.focus(); }, 0);
    }));
  }
  function perguntaApp(msg, def) {
    return new Promise((res) => quadro(`<label class="dlgmsg" for="dlgIn">${esc(msg)}</label><input id="dlgIn" value="${esc(def || '')}" style="width:100%;margin:8px 0"><div class="dlgbt"><button type="button" class="btn" data-dlg="n">Cancelar</button><button type="button" class="btn pri" data-dlg="s">OK</button></div>`, (w, fechar) => {
      const inp = w.querySelector('#dlgIn'); const fim = (v) => { fechar(); res(v); };
      w.addEventListener('click', (e) => { const b = e.target.closest('[data-dlg]'); if (b) fim(b.dataset.dlg === 's' ? inp.value : null); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fim(inp.value); } });
      w.addEventListener('dlgesc', () => fim(null)); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    }));
  }
  // janela do navegador primeiro; resposta negativa instantânea = bloqueada (ninguém clica em menos de 40 ms)
  async function confirmar(msg) {
    let r = false; const t = performance.now(); try { r = window.confirm(msg); } catch (e) { r = false; }
    if (r || performance.now() - t > 40) return r; return confirmaApp(msg);
  }
  async function pedir(msg, def) {
    let r = null; const t = performance.now(); try { r = window.prompt(msg, def); } catch (e) { r = null; }
    if (r !== null || performance.now() - t > 40) return r; return perguntaApp(msg, def);
  }
  // documento dentro do app: PDF desenhado página a página (pdf.js), imagem direto; texto e o resto, só baixar
  function ver(blob, nome, baixar) {
    quadro(`<div class="dlgcab"><b>${esc(nome || 'Documento')}</b><span><button type="button" class="btn sm" data-dlg="b">Baixar</button> <button type="button" class="btn sm" data-dlg="n" aria-label="Fechar">Fechar</button></span></div><div class="dlgdoc"><p class="sub">Abrindo…</p></div>`, async (w, fechar) => {
      w.querySelector('.dlgbox').classList.add('larga');
      w.addEventListener('click', (e) => { const b = e.target.closest('[data-dlg]'); if (b && b.dataset.dlg === 'b') baixar && baixar(); else if (b || e.target === w) fechar(); });
      w.addEventListener('dlgesc', fechar);
      const area = w.querySelector('.dlgdoc'); const tipo = blob.type || ''; const ehPdf = /pdf/i.test(tipo) || /\.pdf$/i.test(nome || '');
      try {
        if (/^image\//.test(tipo)) { const u = URL.createObjectURL(blob); area.innerHTML = `<img src="${u}" alt="${esc(nome)}">`; return; }
        if (ehPdf && window.PricerLeitor && window.PricerLeitor.paginasImagem) { const pgs = await window.PricerLeitor.paginasImagem(new File([blob], nome || 'documento.pdf', { type: 'application/pdf' }), 20, 1.6);
          area.innerHTML = pgs.map((p) => `<img src="${p.url}" alt="Página ${p.n}">`).join('') + (pgs.total > pgs.length ? `<p class="sub">Mostrando ${pgs.length} de ${pgs.total} páginas: baixe para ver o resto.</p>` : ''); return; }
        area.innerHTML = '<p class="sub">Este tipo de arquivo não tem prévia aqui: use Baixar.</p>';
      } catch (e) { area.innerHTML = '<p class="sub">Não consegui mostrar o arquivo aqui: use Baixar.</p>'; }
    });
  }
  window.PricerDlg = { confirmar, pedir, ver, confirmaApp, perguntaApp };
})();
