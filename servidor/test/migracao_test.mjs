// Migração: backup completo do Pricer (o mesmo arquivo que se baixa no claude.ai) → servidor LS Fire.
// Baixa o backup do Pricer local, envia ao servidor pela API do administrador e confere no navegador que o cadastro
// chegou (sem o aviso de cadastro vazio) e que o exemplo Cocamar dá o mesmo total (R$ 4.258.300,00).
import { spawn, execSync } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PRICER = path.resolve(AQUI, "../app/pricer.html");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lsf-mig-"));
const PORTA = 20000 + Math.floor(Math.random() * 1000), BASE = "http://127.0.0.1:" + PORTA;
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? " (" + d + ")" : ""));
const srv = spawn(process.execPath, [path.join(AQUI, "..", "server.js")], { env: Object.assign({}, process.env, { DATA_DIR: DIR, PORT: String(PORTA), ADMIN_SENHA_INICIAL: "Inicial123", BACKUP_INTERVAL_HORAS: "0", COOKIE_SECURE: "0" }), stdio: "ignore" });
let cookie = "";
const api = async (m, u, c) => { const r = await fetch(BASE + u, { method: m, headers: Object.assign({ "Content-Type": "application/json", "X-LSF": "1" }, cookie ? { Cookie: cookie } : {}), body: c === undefined ? undefined : JSON.stringify(c) }); const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; return { status: r.status, j: await r.json() }; };
const total = (p) => p.evaluate(() => { const k = [...document.querySelectorAll(".ctx-kpis .k")].find((d) => /Valor total/i.test(d.querySelector("span").innerText)); return k ? k.querySelector("b").innerText : ""; });
const b = await chromium.launch();
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  // 1) backup completo do Pricer (arquivo local: mesmo formato do claude.ai) com uma proposta salva
  const c1 = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } }); const p1 = await c1.newPage();
  await c1.route("https://**", (r) => r.abort());
  await p1.goto("file://" + PRICER); await p1.waitForTimeout(1500);
  await p1.click("#bNew"); await p1.click("#mExample"); await p1.waitForTimeout(1200); await p1.click("#bSave"); await p1.waitForTimeout(800);
  const totalLocal = await total(p1);
  await p1.evaluate(() => document.querySelector('[data-go="config"][data-gv="backup"]').click()); await p1.waitForTimeout(800);
  const dl = p1.waitForEvent("download"); await p1.click("[data-bkbaixa]"); const d = await dl; const arq = path.join(DIR, "backup.json"); await d.saveAs(arq);
  const bk = JSON.parse(fs.readFileSync(arq, "utf-8"));
  confere("backup completo baixado (propostas + cadastro)", Object.keys(bk.colecoes.propostas || {}).length >= 1 && bk.cadastro.insumos.length > 100, bk.cadastro.insumos.length + " insumos");
  await c1.close();
  // 2) carga no servidor
  await api("POST", "/api/login", { login: "admin", senha: "Inicial123" }); await api("POST", "/api/senha", { atual: "Inicial123", nova: "AdminForte99" });
  await api("POST", "/api/usuarios", { login: "vendas", nome: "Vendas", pricer: "comercial", servico: "nenhum", senha: "Senha1234" });
  const vend = cookie; cookie = "";
  await api("POST", "/api/login", { login: "vendas", senha: "Senha1234" });
  confere("só o administrador carrega backup", (await api("POST", "/api/admin/importar-pricer", bk)).status === 403);
  cookie = ""; await api("POST", "/api/login", { login: "admin", senha: "AdminForte99" });
  const r = await api("POST", "/api/admin/importar-pricer", bk);
  confere("servidor carrega o backup", r.status === 200 && r.j.insumos === bk.cadastro.insumos.length && r.j.colecoes >= 1, JSON.stringify(r.j));
  confere("cadastro marcado como carregado", (await api("POST", "/api/db/get", { path: "meta/cadastro" })).j.data.seeded === true);
  confere("arquivo que não é backup é recusado", (await api("POST", "/api/admin/importar-pricer", { app: "outro" })).status === 400);
  confere("cópia de segurança feita antes de gravar", fs.readdirSync(path.join(DIR, "backups")).some((f) => f.startsWith("backup-")));
  // 3) Pricer no servidor: cadastro carregado e mesmo total
  const c2 = await b.newContext({ viewport: { width: 1400, height: 900 } }); await c2.addCookies([{ name: "lsf_sess", value: cookie.split("=")[1], url: BASE }]);
  const p2 = await c2.newPage(); await c2.route("https://**", (r2) => r2.abort()); const errs = []; p2.on("pageerror", (e) => errs.push(e.message));
  await p2.goto(BASE + "/"); await p2.waitForTimeout(4000);
  await p2.evaluate(() => document.querySelector('#nav [data-view="cadastro"]').click()); await p2.waitForTimeout(1500);
  confere("sem o aviso de cadastro vazio", !/cadastro compartilhado ainda está vazio/.test(await p2.evaluate(() => document.body.innerText)));
  await p2.click("#bNew"); await p2.click("#mExample"); await p2.waitForTimeout(2000);
  const totalSrv = await total(p2);
  confere("exemplo Cocamar: mesmo total no servidor", totalSrv && totalSrv === totalLocal, totalLocal + " × " + totalSrv);
  const lista = await p2.evaluate(() => fetch("/api/db/query", { method: "POST", headers: { "Content-Type": "application/json", "X-LSF": "1" }, body: JSON.stringify({ path: "propostas" }) }).then((x) => x.json()));
  confere("proposta do backup está no banco do servidor", (lista.docs || []).some((x) => /COCAMAR/i.test(x.data.cliente || "")));
  confere("sem erro de JavaScript", !errs.length, errs.slice(0, 2).join(" | "));
  await c2.close();
} catch (e) { falha.push("erro: " + (e.stack || e)); }
await b.close(); srv.kill(); fs.rmSync(DIR, { recursive: true, force: true });
console.log("Migração para o servidor: " + ok.length + " ok, " + falha.length + " falha(s)"); ok.forEach((x) => console.log("  ok  " + x)); falha.forEach((x) => console.log("  FALHA  " + x));
process.exit(falha.length ? 1 : 0);
