// Duas pessoas salvam a mesma proposta no mesmo instante (navegador real, servidor temporário):
// a primeira gravação entra e a segunda recebe o aviso de conflito, sem apagar a primeira em silêncio.
import { spawn, execSync } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url); const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lsf-trava-')); const PORT = 18900 + Math.floor(Math.random() * 90); const BASE = 'http://127.0.0.1:' + PORT;
const srv = spawn(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server.js')], { env: { ...process.env, DATA_DIR: DIR, PORT: String(PORT), ADMIN_SENHA_INICIAL: 'Inicial123', BACKUP_INTERVAL_HORAS: '0', COOKIE_SECURE: '0' }, stdio: 'ignore' });
const espera = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error('servidor não subiu'); };
const api = () => { let ck = ''; return async (m, u, b) => { const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', 'X-LSF': '1', ...(ck ? { Cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return { st: r.status, j: await r.json().catch(() => null), ck: () => ck }; }; };
let falhas = 1;
try {
  await espera(); const adm = api(); await adm('POST', '/api/login', { login: 'admin', senha: 'Inicial123' }); await adm('POST', '/api/senha', { atual: 'Inicial123', nova: 'AdminForte99' });
  for (const l of ['ana', 'bia']) await adm('POST', '/api/usuarios', { login: l, nome: l.toUpperCase(), senha: 'Senha1234', pricer: 'comercial', servico: 'nenhum', trocarSenha: false });
  const b = await chromium.launch(); const pags = {};
  for (const l of ['ana', 'bia']) { const c = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); await p.goto(BASE + '/login'); await p.fill('#login', l); await p.fill('#senha', 'Senha1234'); await p.click('#bEntrar'); await p.waitForTimeout(4000); pags[l] = p; }
  const A = pags.ana, B = pags.bia; const setSp = (p, k, v) => p.$eval(`[data-sp="${k}"]`, (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await A.evaluate(() => document.querySelector('[data-spvnew="PAR"]').click()); await A.waitForTimeout(700); await setSp(A, 'cliente', 'Cliente Trava'); await A.click('#bSave'); await A.waitForTimeout(2500);
  await B.reload(); await B.waitForTimeout(3500); await B.evaluate(() => { const x = document.querySelector('[data-view="inicio"]'); x && x.click(); }); await B.waitForTimeout(800);
  await B.evaluate(() => document.querySelector('[data-hopen]').click()); await B.waitForTimeout(1500);
  if (await B.$('.dlgwrap')) { await B.click('.dlgwrap [data-dlg="descartar"]'); await B.waitForTimeout(1200); }
  console.log('B abriu:', await B.evaluate(() => document.querySelector('#docName').innerText));
  await setSp(A, 'contato', 'Alteração da Ana'); await setSp(B, 'local', 'Alteração da Bia'); await A.waitForTimeout(400);
  await Promise.all([A.click('#bSave'), B.click('#bSave')]); await A.waitForTimeout(5000);
  const st = async (p) => p.evaluate(() => (document.querySelector('#saveSt') || {}).innerText + ' | ' + ((document.querySelector('.modal h2, .dlgwrap .dlgmsg') || {}).innerText || ''));
  const sa = await st(A), sb = await st(B); console.log('A:', sa); console.log('B:', sb);
  const q = await adm('POST', '/api/db/query', { path: 'propostas' }); const d = (q.j.docs || []).map((x) => x.data).find((x) => x.spv && /Trava/i.test(x.spv.cliente || ''));
  const ok1 = /Salvo/.test(sa) && /OUTRA PESSOA SALVOU/i.test(sb) || /Salvo/.test(sb) && /OUTRA PESSOA SALVOU/i.test(sa);
  const ok2 = d && ((d.spv.contato === 'Alteração da Ana') !== (d.spv.local === 'Alteração da Bia'));
  console.log(ok1 ? '  ok  uma gravação entra e a outra recebe o aviso de conflito' : '  FALHA  esperado um salvo e um conflito');
  console.log(ok2 ? '  ok  no servidor fica a gravação de uma pessoa só, inteira (ver ' + d.ver + ')' : '  FALHA  conteúdo no servidor: ' + JSON.stringify(d && d.spv));
  falhas = (ok1 ? 0 : 1) + (ok2 ? 0 : 1);
  await b.close();
} catch (e) { console.log('  FALHA  erro: ' + e.message); } finally { srv.kill(); fs.rmSync(DIR, { recursive: true, force: true }); }
console.log('Gravação simultânea: ' + (falhas ? falhas + ' falha(s)' : '0 falha(s)')); process.exit(falhas ? 1 : 0);
