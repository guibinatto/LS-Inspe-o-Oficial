// Padrão "Folha de dados": anexa a folha completa do fabricante no item (PDF em FD_PDF, ex.: datasheet Peerless Express),
// confere a leitura, gera a proposta técnica e comercial em português e em inglês (Claude simulado para o que o dicionário não cobre).
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/'; const fs = require('fs');
const PDF = process.env.FD_PDF; if (!PDF || !fs.existsSync(PDF)) { console.log('Defina FD_PDF com o caminho da folha de dados do fabricante (PDF).'); process.exit(0); }
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url();
    const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : /jspdf\.umd\.min\.js$/.test(u) ? 'jspdf-2.5.1/dist/jspdf.umd.min.js' : '';
    return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await p.addInitScript(() => { window.__n = 0; window.claude = { use: async (n) => { if (n !== 'sample') return null; const f = async () => ({ text: '' });
    f.json = async (prompt) => { window.__n++; const m = prompt.match(/TEXTOS:\n([\s\S]*)$/); const Lx = m ? JSON.parse(m[1]) : []; const pre = /para o inglês/.test(prompt) ? '[EN] ' : /para o espanhol/.test(prompt) ? '[ES] ' : '[PT] '; return { t: Lx.map((x) => pre + x) }; }; return f; } }; });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800); await p.click('#bSave'); await p.waitForTimeout(400);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; });
  await p.setInputFiles('[data-fdup="ITEM 01|fab"]', PDF); await p.waitForTimeout(5000);
  await p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; });
  console.log('1 leitura:', await p.$eval('[data-fabler="ITEM 01"]', (x) => x.closest('.fdslot').querySelector('.kv').innerText.replace(/\s+/g, ' ')).catch(() => 'SEM LEITURA'));
  console.log('2 alerta de conferência:', await p.$eval('[data-fabler="ITEM 01"]', (x) => (x.closest('.fdslot').querySelector('.banner') || {}).innerText || 'nenhum').catch(() => '?'));
  console.log('3 curva:', await p.$eval('[data-fabler="ITEM 01"]', (x) => (x.closest('.fdslot').innerText.match(/Redesenhada no padrão LS Fire[^\n]*|Não consegui ler a curva[^\n]*/) || ['—'])[0].slice(0, 150)), '| páginas marcadas:', await p.$$eval('[data-fabpag^="ITEM 01|"]', (x) => x.filter((e) => e.checked).map((e) => e.closest('label').innerText.trim()).join(' / ')));
  await p.click('#bSave'); await p.waitForTimeout(600);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  const gera = async (nome) => { const dl = p.waitForEvent('download', { timeout: 60000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(__dirname + '/' + nome); await p.waitForTimeout(3000); return d.suggestedFilename(); };
  const opt = async (nome, v) => { await p.click(`#pcCard input[data-pcopt="${nome}"][value="${v}"]`, { force: true }); await p.waitForTimeout(700); };
  console.log('4a clássico com a curva LS:', await gera('fd_classico.pdf'));
  await opt('estilo', 'fd'); await p.waitForTimeout(800);
  console.log('4 banner:', await p.$eval('#pcCard .banner.ok, #pcCard .banner.info, #pcCard .banner.warn', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 120)).catch(() => '—'), '| chamadas Claude', await p.evaluate(() => window.__n));
  await p.click('#bSave'); await p.waitForTimeout(800); await p.click('[data-view="proposta"]'); await p.click('[data-step="6"]'); await p.waitForTimeout(500);
  console.log('5 pt:', await gera('fd_pt.pdf'));
  await p.click('[data-step="5"]'); await p.waitForTimeout(400); console.log('5b conferência:', await p.$eval('#confCard', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 300)).catch(() => 'sem cartão')); await p.click('[data-step="6"]'); await p.waitForTimeout(400);
  await opt('idioma', 'en'); await p.waitForTimeout(800); console.log('6 en:', await gera('fd_en.pdf'));
  await opt('idioma', 'pt'); await opt('tipoDoc', 'tec'); console.log('7 técnica:', await gera('fd_tec.pdf'));
  console.log('erros', errs); await b.close();
})();
