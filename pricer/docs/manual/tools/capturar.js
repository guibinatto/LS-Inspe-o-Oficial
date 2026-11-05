// Capturas reais do LS Pricer para o manual.
// Abre o app (dist/ls-pricer.html) no Chromium, executa os passos de cada captura
// descrita em docs/manual/fonte/capNN.js e grava duas imagens por tela:
//   prints/original/<id>-<nome>.png  — a tela como ela é
//   prints/anotado/<id>-<nome>.png   — a mesma tela com marcadores numerados e setas
// Cada marcador aponta um elemento real (seletor CSS). Se o elemento não existir ou
// não estiver visível, a captura é marcada como NÃO VALIDADA em prints/capturas.json.
//
// Uso: node docs/manual/tools/capturar.js            (todos os capítulos)
//      node docs/manual/tools/capturar.js 3 7        (só os capítulos 3 e 7)
// Fontes: se FONTES_CACHE apontar para uma pasta com fonts.css + map.txt, as fontes
// do Google são servidas dali (o Chromium do teste não passa pelo proxy).
const path = require('path'), fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const RAIZ = path.resolve(__dirname, '../../..');
const APP = 'file://' + path.join(RAIZ, 'dist/ls-pricer.html');
const MAN = path.resolve(__dirname, '..');
const OUT = { o: path.join(MAN, 'prints/original'), a: path.join(MAN, 'prints/anotado') };
const FC = process.env.FONTES_CACHE;
const VP = { desktop: { width: 1440, height: 900 }, celular: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 } };
const LARANJA = '#FF6600';

function fontes() {
  if (!FC || !fs.existsSync(path.join(FC, 'map.txt'))) return null;
  const map = Object.fromEntries(fs.readFileSync(path.join(FC, 'map.txt'), 'utf8').trim().split('\n').map((l) => l.split(' ')));
  return { css: fs.readFileSync(path.join(FC, 'fonts.css'), 'utf8'), map };
}

// helpers disponíveis nos passos (prep) de cada captura
function ajudantes(p, vp) {
  const h = {
    vp,
    esperar: (ms) => p.waitForTimeout(ms || 400),
    clicar: async (sel, ms) => { await p.click(sel); await p.waitForTimeout(ms || 400); },
    exemplo: async () => { if (await p.isVisible('#bNew')) await p.click('#bNew'); else { await p.click('#bMore'); await p.waitForTimeout(250); await p.click('[data-msid="bNew"]'); } await p.click('#mExample'); await p.waitForTimeout(900); },
    salvar: async () => { await p.click('#bSave'); await p.waitForTimeout(700); },
    menu: async () => { if (vp === 'celular') { await p.click('.bnav [data-bmais]'); await p.waitForTimeout(300); } },
    nav: async (v) => {
      // telas fora do menu lateral (ex.: Documentos) abrem pelos atalhos da tela Início
      if (!(await p.$(`#nav [data-view="${v}"]`))) { await h.menu(); await p.click('#nav [data-view="inicio"]'); await p.waitForTimeout(500); await p.click(`#app [data-view="${v}"]`); await p.waitForTimeout(600); return; }
      await h.menu(); await p.click(`#nav [data-view="${v}"]`); await p.waitForTimeout(600); },
    aba: async (n) => { await p.click(typeof n === 'number' ? `.ptab[data-step="${n}"]` : `.ptab[data-view="${n}"]`); await p.waitForTimeout(600); },
    cad: async (t) => { await p.click(`[data-cad="${t}"]`); await p.waitForTimeout(500); },
    esc: async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(250); },
    preencher: async (sel, v) => { await p.fill(sel, String(v)); await p.press(sel, 'Tab'); await p.waitForTimeout(400); },
    abrirDetalhes: () => p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => (d.open = true))),
    topo: () => p.evaluate(() => window.scrollTo(0, 0)),
  };
  return h;
}

// desenha marcadores numerados com seta sobre os elementos (coordenadas da janela)
async function anotar(p, marcas) {
  return p.evaluate(({ marcas, LARANJA }) => {
    const res = []; const vw = innerWidth, vh = innerHeight;
    const lay = document.createElement('div'); lay.id = '__ann';
    lay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', vw); svg.setAttribute('height', vh); svg.style.cssText = 'position:absolute;inset:0';
    svg.innerHTML = `<defs><marker id="__ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${LARANJA}"/></marker></defs>`;
    lay.appendChild(svg);
    const usados = [];
    marcas.forEach((m, i) => {
      const n = m.n || i + 1;
      const els = [...document.querySelectorAll(m.sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const el = els[m.nth || 0];
      if (!el) { res.push({ n, sel: m.sel, ok: false, motivo: 'não encontrado' }); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { res.push({ n, sel: m.sel, ok: false, motivo: 'fora da área capturada' }); return; }
      const pad = 3, x = Math.max(1, r.left - pad), y = Math.max(1, r.top - pad), w = Math.min(vw - 2, r.right + pad) - x, hh = Math.min(vh - 2, r.bottom + pad) - y;
      const box = document.createElement('div');
      box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;border:2.5px solid ${LARANJA};border-radius:6px;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 0 9999px rgba(0,0,0,0)`;
      if (!m.semCaixa) lay.appendChild(box);
      // posição do número: lado pedido ou o lado com mais espaço
      const D = 46, R = 14;
      const cands = { l: [x - D, y + Math.min(hh / 2, 18)], r: [x + w + D, y + Math.min(hh / 2, 18)], t: [x + Math.min(w / 2, 22), y - D], b: [x + Math.min(w / 2, 22), y + hh + D], tl: [x - D * 0.75, y - D * 0.75], tr: [x + w + D * 0.75, y - D * 0.75], bl: [x - D * 0.75, y + hh + D * 0.75], br: [x + w + D * 0.75, y + hh + D * 0.75] };
      const cabe = ([cx, cy]) => cx > R + 2 && cy > R + 2 && cx < vw - R - 2 && cy < vh - R - 2 && !usados.some(([ux, uy]) => Math.hypot(ux - cx, uy - cy) < 2 * R + 6);
      let ord = m.pos ? [m.pos] : ['l', 't', 'r', 'b', 'tl', 'tr', 'bl', 'br'];
      let c = ord.map((k) => cands[k]).find(cabe) || Object.values(cands).find(cabe);
      if (!c) c = [Math.min(vw - R - 2, Math.max(R + 2, x + 4)), Math.min(vh - R - 2, Math.max(R + 2, y + 4))];
      usados.push(c);
      // seta do número até a borda da caixa
      const tx = Math.min(Math.max(c[0], x), x + w), ty = Math.min(Math.max(c[1], y), y + hh);
      const dist = Math.hypot(tx - c[0], ty - c[1]);
      if (dist > R + 6) {
        const ux = (tx - c[0]) / dist, uy = (ty - c[1]) / dist;
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', c[0] + ux * (R + 1)); ln.setAttribute('y1', c[1] + uy * (R + 1)); ln.setAttribute('x2', tx - ux * 2); ln.setAttribute('y2', ty - uy * 2);
        ln.setAttribute('stroke', LARANJA); ln.setAttribute('stroke-width', '3'); ln.setAttribute('marker-end', 'url(#__ah)');
        const sh = ln.cloneNode(); sh.setAttribute('stroke', 'rgba(255,255,255,.9)'); sh.setAttribute('stroke-width', '6'); sh.removeAttribute('marker-end');
        svg.appendChild(sh); svg.appendChild(ln);
      }
      const b = document.createElement('div');
      b.textContent = n;
      b.style.cssText = `position:absolute;left:${c[0] - R}px;top:${c[1] - R}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;background:${LARANJA};color:#fff;font:700 15px/${2 * R}px Arial,Helvetica,sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);box-sizing:content-box;margin:-2px 0 0 -2px`;
      lay.appendChild(b);
      res.push({ n, sel: m.sel, ok: true, area: [Math.min(x, c[0] - R - 4), Math.min(y, c[1] - R - 4), Math.max(x + w, c[0] + R + 4), Math.max(y + hh, c[1] + R + 4)] });
    });
    document.body.appendChild(lay);
    return res;
  }, { marcas, LARANJA });
}

// recorte: seletor (com folga) ou retângulo; amplia a altura da janela se o recorte não couber
async function recorte(p, s, vpBase) {
  if (!s.clip) return null;
  if (typeof s.clip === 'object' && !Array.isArray(s.clip)) return s.clip;
  const pad = s.pad == null ? 10 : s.pad;
  const medir = () => p.evaluate(({ sel, nth }) => {
    // um seletor ou uma lista de seletores (o recorte cobre todos)
    const els = (Array.isArray(sel) ? sel : [[sel, nth || 0]]).map((q) => { const [qs, k] = Array.isArray(q) ? q : [q, 0]; const l = [...document.querySelectorAll(qs)].filter((e) => e.getBoundingClientRect().height > 0); return l[k < 0 ? l.length + k : k]; });
    if (els.some((e) => !e)) return null;
    const topo = document.querySelector('header.top'); const off = topo && getComputedStyle(topo).position === 'sticky' ? topo.getBoundingClientRect().height + 8 : 8;
    window.scrollTo(0, Math.max(0, Math.min(...els.map((e) => e.getBoundingClientRect().top)) + scrollY - off));
    const rs = els.map((e) => e.getBoundingClientRect()); const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top));
    return { x: x0, y: y0, width: Math.max(...rs.map((r) => r.right)) - x0, height: Math.max(...rs.map((r) => r.bottom)) - y0 };
  }, { sel: s.clip, nth: s.clipNth });
  let r = await medir(); if (!r) return 'faltou';
  if (r.y + r.height > vpBase.height - 4) { await p.setViewportSize({ width: vpBase.width, height: Math.min(4000, Math.ceil(r.y + r.height + pad + 10)) }); await p.waitForTimeout(250); r = await medir(); }
  const vs = p.viewportSize();
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  return { x, y, width: Math.min(vs.width - x, r.width + 2 * pad), height: Math.min(vs.height - y, r.height + 2 * pad) };
}

(async () => {
  const quais = process.argv.slice(2).map(Number).filter(Boolean);
  const caps = fs.readdirSync(path.join(MAN, 'fonte')).filter((f) => /^cap\d\d\.js$/.test(f)).sort()
    .map((f) => require(path.join(MAN, 'fonte', f))).filter((c) => !quais.length || quais.includes(c.n));
  const F = fontes();
  const b = await chromium.launch();
  for (const cap of caps) {
    if (!cap.capturas || !cap.capturas.length) continue;
    // um registro por capítulo: capítulos diferentes podem ser capturados ao mesmo tempo
    const regPath = path.join(MAN, 'prints', `capturas-cap${String(cap.n).padStart(2, '0')}.json`);
    const reg = {};
    const grupos = {}, atual = {}; // um contexto por viewport, passos acumulados na ordem; 'novo' abre outro, que as seguintes continuam
    for (const s of cap.capturas) {
      const vpn = s.vp || 'desktop';
      const chave = s.novo ? vpn + s.id : (atual[vpn] || vpn); atual[vpn] = chave;
      let g = grupos[chave];
      if (!g) {
        const ctx = await b.newContext({ viewport: VP[vpn], deviceScaleFactor: 1.5, colorScheme: s.escuro ? 'dark' : 'light', acceptDownloads: true });
        const p = await ctx.newPage(); const erros = [];
        p.on('pageerror', (e) => erros.push(e.message));
        p.on('dialog', (d) => d.accept().catch(() => {}));
        await p.route('https://**', (r) => {
          const u = r.request().url();
          if (F && u.startsWith('https://fonts.googleapis.com/')) return r.fulfill({ body: F.css, contentType: 'text/css' });
          if (F && F.map[u]) return r.fulfill({ path: path.join(FC, F.map[u]), contentType: 'font/woff2' });
          return r.abort();
        });
        await p.goto(APP); await p.waitForTimeout(1500);
        await p.addStyleTag({ content: '.toast{display:none!important} *{caret-color:transparent!important}' + (cap.css || '') });
        g = { ctx, p, erros, h: ajudantes(p, vpn) };
        if (cap.inicio) await cap.inicio(p, g.h);
        grupos[chave] = g;
      }
      const { p, h } = g;
      const nome = `${s.id}-${s.nome}`;
      const item = { id: s.id, cap: cap.n, nome: s.nome, titulo: s.titulo, vp: vpn, arquivo: nome + '.png', data: new Date().toISOString(), ok: true, problemas: [] };
      try {
        await p.setViewportSize(Object.assign({}, VP[vpn], s.alto ? { height: s.alto } : {}));
        if (s.prep) await s.prep(p, h);
        await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        if (s.toast) await p.addStyleTag({ content: '.toast{display:block!important}' });
        await p.waitForTimeout(250);
        const clip = await recorte(p, s, Object.assign({}, VP[vpn], s.alto ? { height: s.alto } : {}));
        if (clip === 'faltou') { item.ok = false; item.problemas.push('recorte não encontrado: ' + s.clip); }
        const opt = { animations: 'disabled', caret: 'hide' };
        const res = await anotar(p, s.marcas || []);
        if (clip && clip !== 'faltou') {
          // o recorte cresce para incluir os números e as setas; original e anotado têm o mesmo tamanho
          const vs = p.viewportSize(); let [x0, y0, x1, y1] = [clip.x, clip.y, clip.x + clip.width, clip.y + clip.height];
          for (const r of res) if (r.area) { x0 = Math.min(x0, r.area[0] - 4); y0 = Math.min(y0, r.area[1] - 4); x1 = Math.max(x1, r.area[2] + 4); y1 = Math.max(y1, r.area[3] + 4); }
          x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(vs.width, x1); y1 = Math.min(vs.height, y1);
          opt.clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        }
        await p.evaluate(() => { document.getElementById('__ann').style.display = 'none'; });
        await p.screenshot(Object.assign({ path: path.join(OUT.o, item.arquivo) }, opt));
        await p.evaluate(() => { document.getElementById('__ann').style.display = ''; });
        await p.screenshot(Object.assign({ path: path.join(OUT.a, item.arquivo) }, opt));
        await p.evaluate(() => { const l = document.getElementById('__ann'); l && l.remove(); });
        item.marcas = (s.marcas || []).map((m, i) => Object.assign({ n: m.n || i + 1, txt: m.txt }, res[i], { area: undefined }));
        for (const r of res) if (!r.ok) { item.ok = false; item.problemas.push(`marcador ${r.n} (${r.sel}): ${r.motivo}`); }
        if (s.depois) await s.depois(p, h);
      } catch (e) { item.ok = false; item.problemas.push('erro nos passos: ' + e.message.split('\n')[0]); }
      if (g.erros.length) { item.problemas.push('erros de página: ' + g.erros.join(' | ')); g.erros.length = 0; }
      reg[s.id] = item;
      console.log((item.ok ? 'ok   ' : 'FALHA') + ' ' + nome + (item.problemas.length ? ' — ' + item.problemas.join('; ') : ''));
    }
    for (const g of Object.values(grupos)) await g.ctx.close();
    fs.writeFileSync(regPath, JSON.stringify(Object.fromEntries(Object.entries(reg).sort()), null, 1));
  }
  await b.close();
})();
