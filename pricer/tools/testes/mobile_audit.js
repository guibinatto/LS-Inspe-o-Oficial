// Auditoria de responsividade: percorre os módulos do app em larguras de celular, tablet e desktop (retrato e paisagem)
// e mede o que atrapalha o uso por toque. Uso: node mobile_audit.js [saida.json] [pasta-das-capturas]
// Mede, por tela: rolagem horizontal da página, elementos que passam da largura (fora de áreas com rolagem própria),
// alvos de toque menores que 44 px, campos com fonte < 16 px (o iPhone amplia a tela ao tocar), textos cortados
// sem reticências, tabelas com rolagem horizontal e a altura ocupada por barras fixas.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'mobile_audit.json'); const SHOTS = process.argv[3] || '';
const APP = 'file://' + path.resolve(process.env.APP_HTML || path.join(__dirname, '../../dist/ls-pricer.html'));
const VPS = [
  ['320', 320, 568], ['360', 360, 780], ['375', 375, 667], ['390', 390, 844], ['414', 414, 896], ['430', 430, 932],
  ['768', 768, 1024], ['1024', 1024, 768], ['844p', 844, 390], ['1024r', 1024, 1366],
];
const ONLY = process.env.VPS ? process.env.VPS.split(',') : null;
const SHOT_VPS = (process.env.SHOT_VPS || '390,768').split(',');

const medir = () => {
  const W = innerWidth; const H = innerHeight; const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0; };
  const nome = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.dataset && Object.keys(e.dataset)[0] ? '[data-' + Object.keys(e.dataset)[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']' : '')).slice(0, 70);
  const rolador = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1) return a; if (s.position === 'fixed') return null; } return null; };
  const raiz = document.querySelector('.modal, .dlgwrap') ? [...document.querySelectorAll('.modal, .dlgwrap')].pop() : document;
  const fora = []; for (const e of raiz.querySelectorAll('*')) { if (!vis(e) || e.closest('.sidenav') || e.classList.contains('skip')) continue; const r = e.getBoundingClientRect(); if ((r.right > W + 1 || r.left < -1) && !rolador(e)) fora.push(nome(e)); }
  const alvos = [...raiz.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex="0"]')].filter((e) => !e.closest('.sidenav') && !e.classList.contains('skip'))
    .map((e) => (/^(checkbox|radio)$/.test(e.type) && e.closest('label') ? e.closest('label') : e)).filter((e, i, a) => vis(e) && a.indexOf(e) === i);
  const peq = alvos.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; });
  const campos = [...raiz.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]), select, textarea')].filter(vis);
  const fonte = campos.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 15.95);
  const baixo = campos.filter((e) => e.getBoundingClientRect().height < 43.5);
  const cort = []; for (const e of raiz.querySelectorAll('h1,h2,h3,b,span,small,td,th,label,button,a,div')) { if (!vis(e) || e.children.length > 3) continue; const s = getComputedStyle(e); if (/hidden|clip/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && (e.textContent || '').trim()) cort.push(nome(e)); }
  const tabs = [...raiz.querySelectorAll('table')].filter(vis).filter((t) => { const r = t.getBoundingClientRect(); return r.width > W - 8 && rolador(t); }).length;
  let fixo = 0; for (const e of document.querySelectorAll('body *')) { const s = getComputedStyle(e); if ((s.position === 'fixed' || s.position === 'sticky') && vis(e) && !e.closest('.sidenav') && !e.classList.contains('modal') && !e.classList.contains('dlgwrap') && !e.classList.contains('side-scrim') && !e.classList.contains('toast') && !e.classList.contains('msheet-wrap') && !e.classList.contains('cfgscrim') && e.id !== 'cfgPainel') { const r = e.getBoundingClientRect(); if (r.top < H && r.bottom > 0 && r.width > W * 0.6 && (r.top <= 2 || r.bottom >= H - 2)) fixo += Math.min(r.height, H); } }
  return { largura: document.documentElement.scrollWidth, W, hscroll: document.documentElement.scrollWidth > W + 1, fora: fora.length, foraEx: [...new Set(fora)].slice(0, 6), alvos: alvos.length, peq: peq.length, peqEx: [...new Set(peq.map(nome))].slice(0, 6), campos: campos.length, fonte: fonte.length, baixo: baixo.length, cortados: cort.length, cortEx: [...new Set(cort)].slice(0, 4), tabelasRolam: tabs, fixoPx: Math.round(fixo), fixoPct: Math.round((fixo / H) * 100) };
};

(async () => {
  const b = await chromium.launch(); const R = {};
  for (const [k, w, h] of VPS) {
    if (ONLY && !ONLY.includes(k)) continue;
    const toque = w < 1100 || k.endsWith('r');
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 1 });
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort()); await ctx.route('https://cdnjs.cloudflare.com/**', (r) => r.abort()); await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.dismiss());
    await p.goto(APP); await p.waitForTimeout(1500); R[k] = { telas: {}, erros: errs };
    const nav = async (v) => { const menu = await p.$('#bMenu'); const bot = await p.$(`.bnav [data-view="${v}"]`); if (bot && await bot.isVisible()) { await bot.click(); } else { if (menu && await menu.isVisible()) { await menu.click(); await p.waitForTimeout(250); } await p.click(`#nav [data-view="${v}"]`); } await p.waitForTimeout(500); };
    const tela = async (nome, fn) => {
      try { await fn(); await p.waitForTimeout(350); const m = await p.evaluate(medir); R[k].telas[nome] = m;
        if (SHOTS && SHOT_VPS.includes(k)) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${k}_${nome}.png`) }); }
      } catch (e) { R[k].telas[nome] = { falhou: String(e.message).split('\n')[0].slice(0, 160) }; }
      await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => { document.querySelectorAll('.modal [data-close]').forEach((x) => x.click()); document.body.classList.remove('side-open'); }).catch(() => {});
    };
    const topo = async (id) => { const b = await p.$('#' + id); if (b && await b.isVisible()) { await b.click(); } else { await p.click('#bMore'); await p.waitForTimeout(200); await p.click(`[data-msid="${id}"]`); } await p.waitForTimeout(400); };
    const aba = async (n) => { await p.click(typeof n === 'number' ? `.ptab[data-step="${n}"]` : `.ptab[data-view="${n}"]`); await p.waitForTimeout(500); };
    await tela('inicio', async () => { await nav('inicio'); });
    await tela('mais-acoes', async () => { if (await p.isVisible('#bMore')) { await p.click('#bMore'); await p.waitForTimeout(300); } });
    await tela('nova-proposta', async () => { await topo('bNew'); });
    await topo('bNew'); await p.click('#mExample'); await p.waitForTimeout(1200);
    await tela('dados-gerais', async () => { await nav('proposta'); await aba(1); });
    await tela('itens', async () => { await aba(2); });
    await tela('cfg-conferir', async () => { await p.click('[data-goitem="0"]'); await p.waitForTimeout(900); });
    await tela('cfg-configurar', async () => { await p.click('.cfgsteps [data-cfget="1"]'); await p.waitForTimeout(700); });
    await tela('cfg-compor', async () => { await p.click('.cfgsteps [data-cfget="2"]'); await p.waitForTimeout(700); });
    await tela('cfg-porque', async () => { await p.click('.cfgcomp [data-cfgsel]'); await p.waitForTimeout(500); });
    await tela('item-novo', async () => { await nav('proposta'); await aba(2); await p.click('[data-additem]'); await p.waitForTimeout(700); });
    await tela('custos', async () => { await nav('proposta'); await aba(3); });
    await tela('formacao', async () => { await aba(4); });
    await tela('conferencia', async () => { await aba(5); });
    await tela('memorial', async () => { await aba('memorial'); });
    await tela('documentos', async () => { await aba(6); });
    await tela('historico-proposta', async () => { await aba('phist'); });
    await tela('abrir', async () => { await topo('bOpen'); });
    await tela('pendencias', async () => { await nav('pendencias'); });
    await tela('margens', async () => { await nav('margens'); });
    const cad = async (area1, tab) => { await nav('cadastro'); await p.click(`.areatabs [data-cad="${area1}"]`); await p.waitForTimeout(400); if (tab !== area1) { await p.click(`[data-cad="${tab}"]`); await p.waitForTimeout(500); } };
    await tela('cad-mapa', async () => { await cad('mapa', 'mapa'); });
    await tela('cad-insumos', async () => { await cad('insumos', 'insumos'); });
    await tela('cad-insumo-ficha', async () => { await p.click('tr[data-ins]'); await p.waitForTimeout(600); });
    await tela('cad-kits-motor', async () => { await cad('insumos', 'motor'); });
    await tela('cad-estruturas', async () => { await cad('estruturas', 'estruturas'); });
    await tela('cad-regras', async () => { await cad('estruturas', 'regras'); });
    await tela('cad-testador', async () => { await cad('estruturas', 'testador'); });
    await tela('cad-fiscal', async () => { await cad('fiscal', 'fiscal'); });
    await tela('cad-preco', async () => { await cad('preco', 'preco'); });
    await tela('cad-servicos', async () => { await cad('servicos', 'servicos'); });
    await tela('cad-geral', async () => { await cad('geral', 'geral'); });
    await tela('config', async () => { await nav('config'); });
    await tela('ajuda', async () => { await nav('guia'); });
    await tela('spv', async () => { await nav('inicio'); await p.click('[data-spvnew]'); await p.waitForTimeout(1000); });
    await ctx.close();
    console.log(k, 'ok', Object.keys(R[k].telas).length, 'telas', errs.length ? 'erros: ' + errs.slice(0, 2).join(' | ') : '');
  }
  fs.writeFileSync(OUT, JSON.stringify(R, null, 1)); await b.close();
})();
