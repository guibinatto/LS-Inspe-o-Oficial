// Teste no navegador (Playwright): Pricer + Serviço de campo no servidor LS Fire.
// Gestor: entra, troca a senha, abre a aba Serviço de campo (o módulo dentro do Pricer), manda um relatório virar orçamento
// (SPV com as não conformidades), salva no banco do servidor, ganha uma proposta de contrato e cria o contrato no serviço.
// Técnico: entra e vai direto para o módulo de serviço, sem o Pricer e sem valores.
import { spawn, execSync } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lsf-e2e-"));
const PORTA = 19000 + Math.floor(Math.random() * 1000), BASE = "http://127.0.0.1:" + PORTA;
const ok = [], falha = []; const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? " (" + d + ")" : ""));
const srv = spawn(process.execPath, [path.join(AQUI, "..", "server.js")], { env: Object.assign({}, process.env, { DATA_DIR: DIR, PORT: String(PORTA), ADMIN_SENHA_INICIAL: "Inicial123", BACKUP_INTERVAL_HORAS: "0", COOKIE_SECURE: "0" }), stdio: "ignore" });
const espera = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error("servidor não subiu"); };
let cookie = "";
const api = async (m, u, c) => { const r = await fetch(BASE + u, { method: m, headers: Object.assign({ "Content-Type": "application/json", "X-LSF": "1" }, cookie ? { Cookie: cookie } : {}), body: c === undefined ? undefined : JSON.stringify(c) }); const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; return r.json(); };

const b = await chromium.launch(); const errs = [];
try {
  await espera();
  // preparação pela API: admin, usuários e dados do serviço
  await api("POST", "/api/login", { login: "admin", senha: "Inicial123" }); await api("POST", "/api/senha", { atual: "Inicial123", nova: "AdminForte99" });
  await api("POST", "/api/usuarios", { login: "gestor", nome: "Gestor Serviço", pricer: "comercial", servico: "gestor", senha: "Senha1234" });
  await api("POST", "/api/usuarios", { login: "tecnico", nome: "Técnico Um", pricer: "nenhum", servico: "tecnico", tecnicoId: 1, senha: "Senha1234" });
  const dados = { contratos: [{ id: 1, codigo: "200001", cliente: "Indústria Exemplo", endereco: "Rua A, 100 — Joinville/SC", contato: "Eng. Ana", tecnicoId: 1, duracaoMeses: 12, valorMensal: 4800, dataInicio: "2026-11-01", validade: "2027-10-31", equipamentos: [] }],
    tecnicos: [{ id: 1, nome: "Técnico Um", iniciais: "TU", cor: "#16A34A" }],
    relatorios: [{ id: 100, codigo: "700100", referencia: "700100", contratoId: 1, cliente: "Indústria Exemplo", tipo: "itm", modo: "nfpa", data: "2026-11-10", tecnicoId: 1, aprovacao: { status: "aprovado", supervisor: "Gestor" },
      grupos: [{ nome: "Bomba diesel", itens: [{ texto: "Vazamento na gaxeta da bomba", status: "nok", obs: "gotejamento contínuo" }, { texto: "Nível de óleo do motor", status: "ok" }] }] }] };
  await api("POST", "/api/sync", { deviceId: "seed", changes: Object.entries(dados).map(([key, v]) => ({ key, value: JSON.stringify(v), action: "set", updatedAt: new Date().toISOString() })) });

  // ---------- gestor no Pricer ----------
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await ctx.route("https://**", (r) => r.abort());
  p.on("pageerror", (e) => errs.push("pricer: " + e.message));
  await p.goto(BASE + "/"); confere("sem login abre a tela de entrada", /\/login/.test(p.url()));
  await p.fill("#login", "gestor"); await p.fill("#senha", "Senha1234"); await p.click("#bEntrar"); await p.waitForSelector("#fTroca:not([hidden])");
  await p.fill("#nova", "Gestor2026x"); await p.fill("#nova2", "Gestor2026x"); await p.click("#bTroca");
  await p.waitForURL(BASE + "/"); await p.waitForFunction(() => document.querySelector("#nav") && !document.getElementById("navServico").hidden, null, { timeout: 30000 });
  confere("Pricer abre no servidor com a aba Serviço de campo", true);
  confere("botão da conta (trocar senha e sair) no topo", !!(await p.$("#bConta")));
  await p.click('#navServico [data-view="servico"]');
  const fr = await (await p.waitForSelector("#svcHost iframe")).contentFrame();
  await fr.waitForFunction(() => /Indústria Exemplo/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  const txtF = await fr.evaluate(() => document.body.innerText);
  confere("módulo de serviço dentro do Pricer, com os dados do servidor", /Indústria Exemplo/.test(txtF) || /Painel|Dashboard/i.test(txtF), txtF.slice(0, 80).replace(/\s+/g, " "));
  confere("dentro do Pricer, o módulo não repete o link 'Abrir o LS Pricer'", !/Abrir o LS Pricer/.test(txtF));
  // submenus do Serviço de campo no Pricer do servidor (gestor: todas as telas de gestão)
  await p.evaluate(() => { const h = document.querySelector('[data-navgt="servico"]'); if (h.getAttribute("aria-expanded") !== "true") h.click(); });
  const subG = await p.evaluate(() => [...document.querySelectorAll('#navs_servico [data-gk="svcTab"]')].filter((x) => !x.hidden).map((x) => x.dataset.gv));
  confere("submenus do Serviço de campo para o gestor (8 telas)", subG.length === 8 && subG.includes("aprovacoes"), subG.join(","));
  await p.click('#navs_servico [data-gv="contratos"]');
  await fr.waitForFunction(() => /contratos/i.test((document.querySelector('.lsf-tab[aria-current="page"]') || {}).innerText || ""), null, { timeout: 10000 }).catch(() => {});
  confere("submenu Contratos abre a tela de contratos do módulo", /contratos/i.test(await fr.evaluate(() => (document.querySelector('.lsf-tab[aria-current="page"]') || {}).innerText || "")));
  // relatório → orçamento (o botão do relatório manda esta mensagem para o Pricer)
  await fr.evaluate(() => window.top.postMessage({ tipo: "lsf-orcamento", relatorioId: "100" }, location.origin));
  await p.waitForFunction(() => !document.getElementById("app").hidden && !!document.querySelector('textarea[data-sp="descricao"]'), null, { timeout: 20000 });
  const esc = await p.inputValue('textarea[data-sp="descricao"]');
  confere("relatório vira SPV com a não conformidade no escopo", /700100/.test(esc) && /Vazamento na gaxeta da bomba \(gotejamento contínuo\)/.test(esc), esc.slice(0, 120));
  confere("SPV com o cliente e o local do contrato", /Indústria Exemplo/i.test(await p.inputValue('[data-sp="cliente"]')) && /Joinville/.test(await p.inputValue('[data-sp="local"]')));
  await p.click("#bSave"); await p.waitForTimeout(1500);
  const docs = await p.evaluate(() => fetch("/api/db/query", { method: "POST", headers: { "Content-Type": "application/json", "X-LSF": "1" }, body: JSON.stringify({ path: "propostas" }) }).then((r) => r.json()));
  confere("orçamento salvo no banco do servidor", (docs.docs || []).some((d) => d.data.spv && /700100/.test(d.data.spv.descricao || "")));
  // proposta de contrato ganha → contrato no serviço
  await p.evaluate(() => document.querySelector('#nav [data-view="inicio"]').click()); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('[data-spvnew="ITM"]').click()); await p.waitForTimeout(800);
  await p.$eval('[data-sp="cliente"]', (el) => { el.value = "Shopping Centro"; el.dispatchEvent(new Event("change", { bubbles: true })); }); await p.waitForTimeout(200);
  await p.$eval('[data-sp="numero"]', (el) => { el.value = "10.777"; el.dispatchEvent(new Event("change", { bubbles: true })); }); await p.waitForTimeout(200);
  await p.click("#bSave"); await p.waitForTimeout(1500);
  await p.evaluate(async () => { const H = { "Content-Type": "application/json", "X-LSF": "1" }; const q = await (await fetch("/api/db/query", { method: "POST", headers: H, body: JSON.stringify({ path: "propostas" }) })).json();
    const d = q.docs.find((x) => x.data.numero === "10.777"); d.data.status = "ganha"; await fetch("/api/db/set", { method: "POST", headers: H, body: JSON.stringify({ path: "propostas/" + d.id, data: d.data }) }); });
  await p.waitForSelector("[data-svccontrato]", { timeout: 20000 }).catch(() => {});
  confere("proposta de contrato ganha mostra 'Criar o contrato no Serviço de campo'", !!(await p.$("[data-svccontrato]")));
  if (await p.$("[data-svccontrato]")) { await p.click("[data-svccontrato]"); await p.waitForTimeout(1200); }
  const ban = await p.evaluate(() => (document.querySelector("[data-svcct]") || {}).innerText || "");
  confere("contrato criado com número próprio e ligado à proposta", /Contrato 2000\d\d criado no Serviço de campo/.test(ban), ban.slice(0, 80));
  const ctSrv = await p.evaluate(() => fetch("/api/svc/contratos?propostaUid=").then((r) => r.json()));
  confere("o contrato está no serviço com a proposta 10.777", (ctSrv.contratos || []).some((c) => c.propostaNumero === "10.777" && c.cliente === "Shopping Centro"));
  await p.screenshot({ path: path.join(AQUI, "e2e_pricer.png") });
  await ctx.close();

  // ---------- técnico ----------
  const ct = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); const t = await ct.newPage();
  await ct.route("https://**", (r) => r.abort());
  t.on("pageerror", (e) => errs.push("servico: " + e.message));
  await t.goto(BASE + "/login"); await t.fill("#login", "tecnico"); await t.fill("#senha", "Senha1234"); await t.click("#bEntrar"); await t.waitForSelector("#fTroca:not([hidden])");
  await t.fill("#nova", "Tecnico2026x"); await t.fill("#nova2", "Tecnico2026x"); await t.click("#bTroca");
  await t.waitForURL(/\/servico\//, { timeout: 15000 }); await t.waitForFunction(() => /Indústria Exemplo|Painel|Dashboard|Atendimentos/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  confere("técnico entra direto no Serviço de campo", /\/servico\/(#[a-z-]+)?$/.test(t.url()), t.url());
  const tt = await t.evaluate(() => document.body.innerText);
  confere("técnico não vê valor de contrato nem link do Pricer", !/R\$\s?4\.800/.test(tt) && !/Abrir o LS Pricer/.test(tt));
  const r = await t.evaluate(() => fetch("/", { redirect: "follow" }).then((x) => x.url));
  confere("técnico pedindo o Pricer é mandado de volta ao serviço", /\/servico\/$/.test(r), r);
  const semDb = await t.evaluate(() => fetch("/api/db/query", { method: "POST", headers: { "Content-Type": "application/json", "X-LSF": "1" }, body: JSON.stringify({ path: "propostas" }) }).then((x) => x.status));
  confere("técnico não lê propostas nem pelo console do navegador", semDb === 403, semDb);
  confere("celular: módulo sem rolagem lateral", await t.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await t.screenshot({ path: path.join(AQUI, "e2e_tecnico.png") });
  await ct.close();
  confere("sem erro de JavaScript", !errs.length, errs.slice(0, 3).join(" | "));
} catch (e) { falha.push("erro: " + (e.stack || e)); }
await b.close(); srv.kill(); fs.rmSync(DIR, { recursive: true, force: true });
console.log("Pricer + Serviço no navegador: " + ok.length + " ok, " + falha.length + " falha(s)"); ok.forEach((x) => console.log("  ok  " + x)); falha.forEach((x) => console.log("  FALHA  " + x));
process.exit(falha.length ? 1 : 0);
