#!/usr/bin/env node
/* Regressão do motor de cálculo (SEQ): calcula cenários fixos e grava os resultados em JSON.
 * Uso:  node tools/regressao/motor.js <pasta do app> > resultado.json
 *       node tools/regressao/motor.js --comparar referencia.json atual.json
 * Usa o motor (engine.js), a planilha (model.js) e o cadastro padrão (cadastro.js) da pasta indicada,
 * sem navegador e sem dados do usuário: o resultado depende só do código e da planilha.
 */
'use strict';
const path = require('path'); const fs = require('fs');

if (process.argv[2] === '--comparar') {
  const A = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), B = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  let n = 0, dif = 0; const out = [];
  for (const [cen, cells] of Object.entries(A)) {
    const b = B[cen]; if (!b) { out.push(`FALTA cenário ${cen}`); dif++; continue; }
    for (const [k, v] of Object.entries(cells)) {
      n++; const w = b[k];
      const igual = typeof v === 'number' && typeof w === 'number' ? Math.abs(v - w) <= 1e-6 * Math.max(1, Math.abs(v)) : v === w;
      if (!igual) { dif++; if (out.length < 60) out.push(`${cen} · ${k}: ${JSON.stringify(v)} → ${JSON.stringify(w)}`); }
    }
  }
  console.log(`${Object.keys(A).length} cenários · ${n} valores comparados · ${dif} diferença(s)`); out.forEach((l) => console.log('  ' + l));
  process.exit(dif ? 1 : 0);
}

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const mem = {}; global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
global.window = globalThis;
for (const f of ['engine.js', 'model.js', 'cadastro.js']) require(path.join(dir, f));
const MODEL = window.PRICER_MODEL; const { Workbook, isErr } = window.PricerEngine;
const REG = window.PricerRegistry.Registry(MODEL, () => {});

function calc(doc) { const w = new Workbook(MODEL); REG.applyTo(w); w.applyDoc(JSON.parse(JSON.stringify(doc))); return w; }
const norm = (v) => (isErr(v) ? String(v) : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v === undefined ? null : v);
const PROP = ['B16', 'G16', 'J16', 'P43', 'E83', 'E84', 'H13'];
const ITEM = ['B15', 'D15', 'J15', 'F15', 'H15', 'P17', 'P20', 'P23', 'P25', 'P83', 'H114', 'P84', 'P91', 'C27', 'C28', 'C29', 'C30', 'G7', 'H21', 'C172'];
function saida(w) {
  const o = {}; for (const a of PROP) o['PROPOSTA!' + a] = norm(w.value('PROPOSTA', a));
  for (let i = 1; i <= 10; i++) { const S = 'ITEM ' + String(i).padStart(2, '0'); if (!w.value(S, 'H114')) continue; for (const a of ITEM) o[S + '!' + a] = norm(w.value(S, a)); }
  for (let r = 3; r <= 38; r++) for (const c of 'CDEFGHIJKLM') { const v = w.value('MEMORIAL', c + r); if (typeof v === 'number' && v) o['MEMORIAL!' + c + r] = norm(v); }
  return o;
}
const ex = MODEL.example; const cab = JSON.parse(JSON.stringify(ex.PROPOSTA));
const mod = (base, f) => { const d = JSON.parse(JSON.stringify(base)); f(d); return d; };
const cen = {
  'exemplo': ex,
  'desconto global 5%': mod(ex, (d) => { d.PROPOSTA.C9 = 0.05; }),
  'margem-alvo 32% no item 02': mod(ex, (d) => { d['ITEM 02'].J17 = 'MARGEM ALVO'; d['ITEM 02'].L17 = 0.32; }),
  'UF BA': mod(ex, (d) => { d.PROPOSTA.F7 = 'BA'; }),
  'UF SP não contribuinte': mod(ex, (d) => { d.PROPOSTA.F7 = 'SP'; d.PROPOSTA.J5 = 'NÃO CONTRIBUINTE — CONSUMIDOR FINAL'; }),
  'frete CIF 800 km': mod(ex, (d) => { d.PROPOSTA.B13 = 'CIF — POSTO OBRA, SEM DESCARGA'; d.PROPOSTA.D13 = 800; }),
  'comissão AN': mod(ex, (d) => { d.PROPOSTA.J8 = 'SEQ'; }),
  'sem comissão': mod(ex, (d) => { d.PROPOSTA.J7 = 'SEM COMISSÃO'; d.PROPOSTA.J8 = 'SEM COMISSÃO'; }),
};
const FAM = { CMB: 'CONJUNTO MOTOBOMBA', SKID: 'SKID', CONTAINER: 'CONTAINER' };
const mo = MODEL.sheets.find((s) => s.name === 'MONTADOR').cells;
for (let r = 7; r <= 86; r++) { const nome = mo['B' + r]; if (!nome) continue; cen['modelo · ' + nome] = { PROPOSTA: cab, 'ITEM 01': { C21: FAM[mo['C' + r]] || mo['C' + r], C17: nome } }; }
const res = {}; for (const [k, d] of Object.entries(cen)) res[k] = saida(calc(d));
process.stdout.write(JSON.stringify(res, null, 1));
