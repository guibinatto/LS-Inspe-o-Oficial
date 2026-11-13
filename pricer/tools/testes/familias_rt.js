global.window = globalThis; const d = process.argv[2] || require('path').resolve(__dirname, '../..');
for (const f of ['engine.js','model.js','cadastro.js','padrao.js','familias.js']) require(d + '/' + f);
const F = window.PricerFamilias; const base = window.PricerRegistry.baseFromModel(window.PRICER_MODEL);
// aplica as padronizações sugeridas (padrao.js) para ver o cadastro como fica depois
const P = (window.PRICER_PADRAO || {itens: []}).itens; const para = Object.fromEntries(P.map((x) => [x.id, x.para]));
const res = {};
for (const i of base.insumos) { const c = F.famCode(i.fam); if (!F.PADRAO[c]) continue; for (const nome of [i.produto, para[i.id]].filter(Boolean)) {
  const ok = !F.checar(i.fam, nome); const r = res[c] = res[c] || { n: 0, padrao: 0, ida: 0, falhas: [] }; r.n++; if (!ok) continue; r.padrao++;
  const v = F.ler(i.fam, nome); const m = F.montar(F.PADRAO[c], v); if (m === nome) r.ida++; else if (r.falhas.length < 4) r.falhas.push(nome + '  →  ' + m); } }
console.log(JSON.stringify(res, null, 1));
