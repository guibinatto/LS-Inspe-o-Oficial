// Folha no formato da Sempa (fictícia, gerada aqui): página 1 "Technical Data" com seções alinhadas à esquerda e
// "rótulo : valor", página 2 com a curva. Confere que o app lê as seções, reconhece o fabricante e escolhe a página 2 como curva,
// tanto na folha completa do fabricante quanto no campo "Curva da bomba".
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const L = __dirname + '/libs/';
(async () => {
  const b = await chromium.launch(); const ctxB = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctxB.newPage();
  await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdfjs-dist-3.11.174/build/pdf.worker.min.js' : ''; return f ? r.fulfill({ path: L + f, contentType: 'text/javascript' }) : r.abort(); });
  await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  const aux = await ctxB.newPage();
  const par = (a, v) => `<tr><td>${a}</td><td>: ${v}</td></tr>`;
  const bloco = (t, L1, L2) => `<h4>${t}</h4><div style="display:flex"><table style="width:390px">${L1.map((x) => par(...x)).join('')}</table><table style="width:330px">${(L2 || []).map((x) => par(...x)).join('')}</table></div>`;
  await aux.setContent(`<html><body style="font-family:Arial;font-size:11px;margin:30px">
    <div style="font-size:22px;font-weight:bold">SEMPA</div><div style="text-align:right;font-size:16px">P-83F-01B (TESTE)</div>
    <p>SCE 150-460 1900 rpm / 563.5 m³/h / 138.06 m / 79.21 % / 267.73 kW / 60 Hz</p>
    ${bloco('Operation Data', [['Pump Type', 'Double Suction Pump'], ['Flow', '563.5 m³/h'], ['Head', '138.06 m'], ['Static Head', '1 m']], [['Fluid', 'Water'], ['Density', '998.000 kg/m³'], ['Temperature', '20.00 °C']])}
    ${bloco('Pump Data', [['Speed', '1900 rpm'], ['Number of Stages', '01'], ['Max. Casing Pressure', '2500 kPa'], ['Head (Q=0)', '149.38 m'], ['Impeller D Designed', '460 mm']], [['Flow Nominal', '665 m³/h'], ['Max.', '936.71 m³/h'], ['Min.', '122.32 m³/h'], ['Head Nominal', '131.38 m'], ['at Qmax', '98.28 m'], ['at Qmin', '148.18 m'], ['Shaft Power', '267.73 kW'], ['Efficiency', '79.21 %'], ['NPSHr', '4.55 m']])}
    ${bloco('Pump Material', [['Volute Casing', 'Cast Iron / 06025'], ['Impeller', 'Cast Iron / 06025'], ['Shaft', 'Chromium Steel / 1.4021']], [['Wear Ring', 'Bronze Casting (Tinned)'], ['Sleeve Set', 'Chrome Nickel Steel / 1.4301']])}
    <div style="page-break-before:always"></div><div style="font-size:22px;font-weight:bold">SEMPA</div><h3>Performance Curve</h3>
    <svg width="600" height="380" xmlns="http://www.w3.org/2000/svg"><rect x="50" y="10" width="520" height="320" fill="none" stroke="#000"/><path d="M50 60 Q 300 80 570 300" stroke="#06c" stroke-width="3" fill="none"/><text x="280" y="360" font-size="12">Q [m³/h]</text><text x="5" y="170" font-size="12">H [m]</text></svg>
    <div style="display:flex;font-size:11px;margin-top:10px"><div style="width:250px"><b>Operating Data Specification</b><br>Flow : 563.5 m³/h<br>Head : 142 m<br>Static Head : 1 m</div><div style="width:250px"><b>Hydraulic Data (Duty Point)</b><br>Flow : 563.5 m³/h<br>Head : 138.06 m<br>NPSH r : 4.6 m</div><div style="width:200px"><b>Impeller Design</b><br>Impeller D : 460 mm<br>Frequency : 60 Hz<br>Speed : 1900 rpm</div></div>
    </body></html>`);
  await aux.pdf({ path: __dirname + '/sempa_teste.pdf' }); await aux.close();
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/ls-pricer.html')); await p.waitForTimeout(1200);
  await p.click('#bNew'); await p.click('#mExample'); await p.waitForTimeout(800);
  await p.click('[data-view="proposta"]'); await p.click('[data-step="2"]'); await p.waitForTimeout(300); await p.click('[data-goitem="0"]'); await p.waitForTimeout(600);
  const abre = () => p.evaluate(() => { const d = document.querySelector('details[data-keep="fdprop"]'); if (d) d.open = true; });
  await abre(); await p.setInputFiles('[data-fdup="ITEM 01|fab"]', __dirname + '/sempa_teste.pdf'); await p.waitForTimeout(3500); await abre();
  console.log('1 leitura:', await p.$eval('[data-fabler="ITEM 01"]', (x) => x.closest('.fdslot').querySelector('.kv').innerText.replace(/\s+/g, ' ')));
  console.log('2 seções:', await p.$$eval('[data-fabler="ITEM 01"]', (x) => [...x[0].closest('.fdslot').querySelectorAll('details summary')].map((s) => s.innerText.replace(/\s+/g, ' ')).join(' | ')));
  console.log('3 curva:', await p.$eval('[data-fabcurva="ITEM 01"]', (x) => x.options[x.selectedIndex].text));
  await p.waitForTimeout(1500); console.log('4 miniaturas:', await p.$$eval('[data-thumbs="ITEM 01|fab"] button', (x) => x.map((e) => e.innerText.trim() + (e.classList.contains('on') ? '*' : '')).join(' ')));
  await p.setInputFiles('[data-fdup="ITEM 01|curva"]', __dirname + '/sempa_teste.pdf'); await p.waitForTimeout(3000); await abre();
  console.log('5 campo curva, página:', await p.$eval('[data-fdpag="ITEM 01"]', (x) => x.value));
  await p.waitForTimeout(1500); await p.click('[data-thumbpg="ITEM 01|curva|1"]'); await p.waitForTimeout(500); await abre();
  console.log('6 clique na miniatura 1 →', await p.$eval('[data-fdpag="ITEM 01"]', (x) => x.value));
  const prev = await p.$eval('img[data-fabprev]', (x) => x.src).catch(() => ''); console.log('7 curva LS:', prev ? 'gerada (' + prev.length + ')' : 'SEM PRÉVIA'); if (prev) require('fs').writeFileSync(__dirname + '/sempa_curva.png', Buffer.from(prev.split(',')[1], 'base64'));
  console.log('8 seções da página da curva:', await p.$$eval('[data-fabler="ITEM 01"]', (x) => [...x[0].closest('.fdslot').querySelectorAll('details summary')].map((q) => q.innerText.replace(/\s+/g, ' ')).filter((t) => /página 2/.test(t)).join(' | ')));
  console.log('erros', errs); await b.close();
})();
