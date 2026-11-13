// Teste das correções da auditoria de segurança (nov/2026): cada ataque encontrado é repetido aqui e precisa falhar.
// Sobe servidores de verdade em pastas temporárias.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(AQUI, "..", "server.js");
const ok = [], falha = [];
const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? " (" + d + ")" : ""));
const TOKEN = "t".repeat(20) + "9f3c1a7b2e8d4c6a5b0e1f2d3c4b5a69";

function sobe(env = {}, dir) {
  dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), "lsf-seg-"));
  const porta = 19000 + Math.floor(Math.random() * 900);
  const p = spawn(process.execPath, [SERVER], { env: Object.assign({}, process.env, { DATA_DIR: dir, PORT: String(porta), ADMIN_SENHA_INICIAL: "Inicial123", BACKUP_INTERVAL_HORAS: "0", COOKIE_SECURE: "0" }, env), stdio: ["ignore", "pipe", "pipe"] });
  const s = { p, dir, base: "http://127.0.0.1:" + porta, log: "", saiu: null };
  p.stdout.on("data", (d) => (s.log += d)); p.stderr.on("data", (d) => (s.log += d)); p.on("exit", (c) => (s.saiu = c));
  return s;
}
async function espera(s) { for (let i = 0; i < 60; i++) { if (s.saiu !== null) return false; try { const r = await fetch(s.base + "/api/health"); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 100)); } return false; }
function cliente(base) {
  let cookie = "";
  const req = async (metodo, url, corpo, extra = {}) => {
    const h = Object.assign({ "Content-Type": extra.tipo || "application/json" }, extra.semCsrf ? {} : { "X-LSF": "1" }, cookie ? { Cookie: cookie } : {}, extra.h || {});
    const body = corpo === undefined ? undefined : extra.cru ? corpo : JSON.stringify(corpo);
    const r = await fetch(base + url, { method: metodo, headers: h, body, redirect: "manual" });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, t, h: r.headers };
  };
  return { get: (u, e) => req("GET", u, undefined, e), post: (u, c, e) => req("POST", u, c, e), patch: (u, c) => req("PATCH", u, c), get cookie() { return cookie; } };
}
const sync = (c, changes, lastSync) => c.post("/api/sync", { deviceId: "t", lastSync: lastSync || null, changes: Object.entries(changes).map(([key, v]) => ({ key, value: JSON.stringify(v), action: "set" })) });
const val = (r, k) => JSON.parse(((r.j.data || {})[k] || { value: "[]" }).value);
const parar = (s) => new Promise((ok) => { if (s.saiu !== null) return ok(); s.p.on("exit", () => ok()); s.p.kill("SIGTERM"); setTimeout(() => { try { s.p.kill("SIGKILL"); } catch {} ok(); }, 4000); });

const A = sobe({ ADMIN_TOKEN: TOKEN });
try {
  if (!(await espera(A))) throw new Error("servidor não subiu: " + A.log);
  const adm = cliente(A.base);
  await adm.post("/api/login", { login: "admin", senha: "Inicial123" }); await adm.post("/api/senha", { atual: "Inicial123", nova: "AdminForte99" });
  const meAdm = (await adm.get("/api/me")).j;
  const cria = async (d) => (await adm.post("/api/usuarios", Object.assign({ senha: "Senha1234" }, d))).j.usuario;
  const uCom = await cria({ login: "vendas", nome: "Vendedor", pricer: "comercial", servico: "nenhum" });
  const uCom2 = await cria({ login: "vendas2", nome: "Vendedor 2", pricer: "comercial", servico: "nenhum" });
  await cria({ login: "gestor", nome: "Gestor", pricer: "comercial", servico: "gestor" });
  await cria({ login: "tecnico", nome: "Técnico", pricer: "nenhum", servico: "tecnico", tecnicoId: 1 });
  const entra = async (login) => { const c = cliente(A.base); await c.post("/api/login", { login, senha: "Senha1234" }); await c.post("/api/senha", { atual: "Senha1234", nova: "Trocada123" }); return c; };
  const com = await entra("vendas"), ges = await entra("gestor"), tec = await entra("tecnico");

  // 1) anexo XML/SVG não roda script no endereço do servidor
  const xml = '<html xmlns="http://www.w3.org/1999/xhtml"><script>fetch("/api/usuarios")</script></html>';
  let r = await com.post("/api/assets", xml, { cru: true, tipo: "application/xml", h: { "X-Filename": "nota.xml" } });
  const id = r.j && r.j.id;
  r = await adm.get("/_blob/" + id);
  confere("anexo XML vai como download (attachment)", /attachment/.test(r.h.get("content-disposition") || ""), r.h.get("content-disposition"));
  confere("anexo XML abre isolado (CSP sandbox, sem script)", /sandbox/.test(r.h.get("content-security-policy") || "") && /default-src 'none'/.test(r.h.get("content-security-policy") || ""));
  r = await com.post("/api/assets", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { cru: true, tipo: "image/png" });
  const rp = await adm.get("/_blob/" + r.j.id);
  confere("imagem PNG continua abrindo no navegador", !rp.h.get("content-disposition") && rp.h.get("content-type") === "image/png");

  // 2) token de exportação: só no cabeçalho, comparado com segurança
  confere("token na URL não exporta mais", (await fetch(A.base + "/api/export?token=" + TOKEN)).status === 401);
  confere("token forte no cabeçalho exporta", (await fetch(A.base + "/api/export", { headers: { "X-Admin-Token": TOKEN } })).status === 200);
  confere("token errado no cabeçalho é recusado", (await fetch(A.base + "/api/export", { headers: { "X-Admin-Token": TOKEN.slice(0, -1) + "x" } })).status === 401);

  // 3) validação de tipos na edição de usuário
  confere("pricer:null no último administrador é recusado", (await adm.patch("/api/usuarios/" + meAdm.id, { pricer: null })).status === 400);
  confere('ativo:"false" (texto) é recusado', (await adm.patch("/api/usuarios/" + uCom2.id, { ativo: "false" })).status === 400);
  confere('servico:"admin" é recusado', (await adm.patch("/api/usuarios/" + uCom2.id, { servico: "admin" })).status === 400);

  // 4) trocar a própria senha encerra as outras sessões; senha atual errada repetida trava
  const outra = cliente(A.base); await outra.post("/api/login", { login: "vendas", senha: "Trocada123" });
  confere("segunda sessão aberta", (await outra.get("/api/me")).status === 200);
  confere("troca a própria senha", (await com.post("/api/senha", { atual: "Trocada123", nova: "NovaSenha77" })).status === 200);
  confere("a outra sessão acabou", (await outra.get("/api/me")).status === 401);
  confere("a sessão de quem trocou continua", (await com.get("/api/me")).status === 200);
  let st = []; for (let i = 0; i < 6; i++) st.push((await com.post("/api/senha", { atual: "errada" + i, nova: "Qualquer123" })).status);
  confere("6ª senha atual errada na troca: travado", st[5] === 429, st.join(","));

  // 5) erro não mostra pilha nem caminho do servidor
  r = await adm.post("/api/login", '{"login":', { cru: true });
  confere("JSON malformado: resposta curta, sem pilha", r.status === 400 && !/at |node_modules|\/home\//.test(r.t), r.t.slice(0, 80));
  r = await fetch(A.base + "/api/me", { headers: { Cookie: "lsf_sess=%E0" } });
  confere("cookie malformado não derruba a rota", r.status === 401);

  // 6) aprovações: decisão só em nome próprio e com a hora de agora; pedido não se apaga
  const agora = new Date().toISOString();
  confere("comercial cria o pedido de aprovação", (await com.post("/api/db/set", { path: "aprovacoes/p1", data: { propId: "p1", at: agora, by: uCom.id, decisoes: {} } })).status === 200);
  r = await com.post("/api/db/set", { path: "aprovacoes/p1", data: { propId: "p1", at: agora, by: uCom.id, decisoes: { diretoria: { decisao: "aprovada", at: agora, by: meAdm.id } } } });
  confere("decisão em nome de outra pessoa é recusada", r.status === 403, r.status);
  r = await com.post("/api/db/set", { path: "aprovacoes/p1", data: { propId: "p1", at: agora, by: uCom.id, decisoes: { diretoria: { decisao: "aprovada", at: "2026-10-01T10:00:00Z", by: uCom.id } } } });
  confere("decisão com data antiga (legado) é recusada", r.status === 403, r.status);
  r = await com.post("/api/db/set", { path: "aprovacoes/p1", data: { propId: "p1", at: agora, by: uCom.id, decisoes: { diretoria: { decisao: "aprovada", at: new Date().toISOString(), by: uCom.id } } } });
  confere("decisão própria com a hora certa é aceita", r.status === 200, r.status);
  confere("pedido de aprovação não pode ser apagado", (await com.post("/api/db/delete", { path: "aprovacoes/p1" })).status === 403);

  // 7) histórico: só acréscimo, em nome próprio
  const it1 = { at: agora, by: uCom.id, tipo: "teste", desc: "um" };
  confere("grava registro no histórico", (await com.post("/api/db/set", { path: "historico/2026-11-13", data: { dia: "2026-11-13", itens: [it1] } })).status === 200);
  confere("acrescenta outro registro", (await com.post("/api/db/set", { path: "historico/2026-11-13", data: { dia: "2026-11-13", itens: [it1, { at: agora, by: uCom.id, desc: "dois" }] } })).status === 200);
  confere("esvaziar o histórico é recusado", (await com.post("/api/db/set", { path: "historico/2026-11-13", data: { dia: "2026-11-13", itens: [] } })).status === 403);
  confere("apagar o dia do histórico é recusado", (await com.post("/api/db/delete", { path: "historico/2026-11-13" })).status === 403);
  confere("registro em nome de outra pessoa é recusado", (await com.post("/api/db/set", { path: "historico/2026-11-13", data: { dia: "2026-11-13", itens: [it1, { at: agora, by: uCom.id, desc: "dois" }, { at: agora, by: meAdm.id, desc: "falso" }] } })).status === 403);

  // 8) relatório aprovado dentro da visita não muda pelo técnico
  const ct = { id: 501, codigo: "200001", cliente: "Cliente X", valorMensal: 1000 };
  const vis = { id: 9001, contratoId: 501, tecnicoId: 1, status: "concluida", referencia: 700010, relatorio: { conclusao: "OK original", aprovacao: { status: "aprovado", aprovadoEm: agora } } };
  r = await sync(ges, { contratos: [ct], visitas: [vis] });
  const ls = r.j.serverTime;
  const visTec = val(await sync(tec, {}), "visitas")[0];
  await sync(tec, { visitas: [Object.assign({}, visTec, { relatorio: Object.assign({}, visTec.relatorio, { conclusao: "ALTERADO depois de aprovado" }) })] }, ls);
  const v2 = val(await sync(ges, {}), "visitas").find((v) => v.id === 9001);
  confere("relatório aprovado na visita não muda pelo técnico", v2 && v2.relatorio.conclusao === "OK original", v2 && v2.relatorio.conclusao);

  // 8b) cópia velha de um aparelho não desfaz a alteração de outra pessoa; técnico não altera visita de outro técnico
  await sync(ges, { visitas: [{ id: 9101, contratoId: 501, tecnicoId: 1, obs: "v1", data: "2026-12-01" }, { id: 9102, contratoId: 501, tecnicoId: 2, obs: "do outro" }] });
  const tSync = (await sync(tec, {})).j.serverTime; const copiaTec = val(await sync(tec, {}, tSync), "visitas");
  await new Promise((r) => setTimeout(r, 15));
  const vg = val(await sync(ges, {}), "visitas");
  await sync(ges, { visitas: vg.map((v) => (v.id === 9101 ? Object.assign({}, v, { obs: "v2-gestor", data: "2026-12-05" }) : v)) });
  // o técnico, com a cópia antiga, mexe só em outra visita e manda a lista inteira
  const rT = await sync(tec, { visitas: copiaTec.map((v) => (v.id === 9001 ? Object.assign({}, v, { nota: "tec" }) : v)) }, tSync);
  const v9101 = val(await sync(ges, {}), "visitas").find((v) => v.id === 9101);
  confere("cópia velha do técnico não desfaz a alteração do gestor", v9101 && v9101.obs === "v2-gestor", v9101 && v9101.obs);
  confere("o servidor avisa o conflito", (rT.j.conflitos || 0) >= 1, rT.j.conflitos);
  const atualTec = val(await sync(tec, {}), "visitas"); const ls2 = (await sync(tec, {})).j.serverTime;
  await sync(tec, { visitas: atualTec.map((v) => (v.id === 9102 ? Object.assign({}, v, { obs: "mexido pelo técnico 1" }) : v)) }, ls2);
  const v9102 = val(await sync(ges, {}), "visitas").find((v) => v.id === 9102);
  confere("técnico não altera visita de outro técnico", v9102 && v9102.obs === "do outro", v9102 && v9102.obs);

  // 9) auditoria: um aparelho não empurra milhares de registros
  const aud = Array.from({ length: 500 }, (_, i) => ({ id: "a" + i, acao: "falso " + i }));
  await sync(tec, { auditoria: aud });
  const nAud = val(await sync(ges, {}), "auditoria").length;
  confere("auditoria: no máximo 300 registros novos por sincronização", nAud <= 300, nAud);

  // 10) numeração não aceita número absurdo vindo do aparelho
  await sync(tec, { visitas: [{ id: 9002, contratoId: 501, tecnicoId: 1, referencia: 1e300 }] });
  r = await tec.post("/api/allocate-number", { tipo: "atendimento" });
  confere("numeração continua normal depois de referencia 1e300", /^\d{6,7}$/.test(r.j.numero), r.j.numero);

  // 11) cliente: só relatório aprovado
  await cria({ login: "cliente", nome: "Cliente", pricer: "nenhum", servico: "cliente", clienteId: 501 });
  const cli = await entra("cliente");
  await sync(ges, { relatorios: [{ id: 7001, contratoId: 501, conclusao: "pendente", aprovacao: { status: "pendente" } }, { id: 7002, contratoId: 501, conclusao: "aprovado", aprovacao: { status: "aprovado" } }] });
  const rc = val(await sync(cli, {}), "relatorios").map((x) => x.id);
  confere("cliente vê só o relatório aprovado", rc.length === 1 && rc[0] === 7002, JSON.stringify(rc));

  // 12) desligar grava o que estava na fila
  await adm.post("/api/db/set", { path: "propostas/fila", data: { a: 1 } });
  await parar(A);
  const db = JSON.parse(fs.readFileSync(path.join(A.dir, "pricer-db.json"), "utf-8"));
  confere("SIGTERM logo depois de gravar: o documento está no disco", !!(db.docs && db.docs["propostas/fila"]));
} catch (e) { falha.push("erro: " + e.message); } finally { await parar(A); }

// 13) token de exemplo fica desligado
const B = sobe({ ADMIN_TOKEN: "troque-este-token" });
try {
  if (!(await espera(B))) throw new Error("servidor B não subiu: " + B.log);
  confere("ADMIN_TOKEN de exemplo não exporta", (await fetch(B.base + "/api/export", { headers: { "X-Admin-Token": "troque-este-token" } })).status === 401);
  confere("o console avisa que o token é fraco", /ADMIN_TOKEN/.test(B.log));
} catch (e) { falha.push("erro B: " + e.message); } finally { await parar(B); }

// 14) arquivo de dados corrompido: o servidor não sobe (e não grava por cima)
const dirC = fs.mkdtempSync(path.join(os.tmpdir(), "lsf-seg-c-"));
const corte = '{"usuarios":[{"id":"u1","login":"admin"';
fs.writeFileSync(path.join(dirC, "usuarios.json"), corte);
const C = sobe({}, dirC);
const subiu = await espera(C); await parar(C);
confere("usuarios.json corrompido: o servidor não sobe", !subiu && /corrompido/.test(C.log), C.log.split("\n").find((l) => /corromp/.test(l)) || C.log.slice(0, 120));
confere("usuarios.json corrompido não foi sobrescrito", fs.readFileSync(path.join(dirC, "usuarios.json"), "utf-8") === corte);

for (const d of [A.dir, B.dir, dirC]) try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
for (const x of ok) console.log("  ok  " + x);
for (const x of falha) console.log("  FALHA  " + x);
console.log(`\nSegurança (correções da auditoria): ${ok.length} ok, ${falha.length} falha(s)`);
process.exit(falha.length ? 1 : 0);
