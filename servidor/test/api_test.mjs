// Teste do servidor LS Fire (Pricer + Serviço de campo): login, senha provisória, CSRF, níveis do Pricer,
// perfis do serviço (técnico sem valores, aprovação protegida, cliente só o dele), junção sem perder dados,
// ligação Pricer ↔ serviço e bloqueio por senha errada. Sobe um servidor de verdade numa pasta temporária.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lsf-test-"));
const PORTA = 18000 + Math.floor(Math.random() * 1000);
const BASE = "http://127.0.0.1:" + PORTA;
const ok = [], falha = [];
const confere = (n, c, d) => (c ? ok : falha).push(n + (d !== undefined ? " (" + d + ")" : ""));

const srv = spawn(process.execPath, [path.join(AQUI, "..", "server.js")], { env: Object.assign({}, process.env, { DATA_DIR: DIR, PORT: String(PORTA), ADMIN_SENHA_INICIAL: "Inicial123", BACKUP_INTERVAL_HORAS: "0", COOKIE_SECURE: "0" }), stdio: ["ignore", "pipe", "pipe"] });
let log = ""; srv.stdout.on("data", (d) => (log += d)); srv.stderr.on("data", (d) => (log += d));

function cliente() {
  let cookie = "";
  const req = async (metodo, url, corpo, extra = {}) => {
    const h = Object.assign({ "Content-Type": "application/json" }, extra.semCsrf ? {} : { "X-LSF": "1" }, cookie ? { Cookie: cookie } : {});
    const r = await fetch(BASE + url, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo), redirect: "manual" });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0].endsWith("=") ? "" : sc.split(";")[0];
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, loc: r.headers.get("location") };
  };
  return { get: (u, e) => req("GET", u, undefined, e), post: (u, c, e) => req("POST", u, c, e), patch: (u, c) => req("PATCH", u, c) };
}
const espera = async () => { for (let i = 0; i < 50; i++) { try { const r = await fetch(BASE + "/api/health"); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error("servidor não subiu: " + log); };
const sync = (c, changes, lastSync) => c.post("/api/sync", { deviceId: "t", lastSync: lastSync || null, changes: Object.entries(changes).map(([key, v]) => ({ key, value: JSON.stringify(v), action: "set", updatedAt: new Date().toISOString() })) });
const val = (r, k) => JSON.parse(((r.j.data || {})[k] || { value: "[]" }).value);

try {
  await espera();
  const adm = cliente();
  // ---- login e senha provisória ----
  confere("sem login, / vai para /login", (await adm.get("/")).loc === "/login");
  confere("sem login, API do banco recusa", (await adm.post("/api/db/get", { path: "propostas/x" })).status === 401);
  let r = await adm.post("/api/login", { login: "admin", senha: "Inicial123" });
  confere("admin entra com a senha inicial", r.status === 200 && r.j.me.trocarSenha === true);
  confere("senha provisória: banco bloqueado até trocar", (await adm.post("/api/db/get", { path: "propostas/x" })).status === 403);
  confere("senha nova fraca é recusada", (await adm.post("/api/senha", { atual: "Inicial123", nova: "abc" })).status === 400);
  confere("troca a senha", (await adm.post("/api/senha", { atual: "Inicial123", nova: "AdminForte99" })).status === 200);
  confere("sem o cabeçalho do app (CSRF), gravação recusada", (await adm.post("/api/db/set", { path: "propostas/x", data: { a: 1 } }, { semCsrf: true })).status === 403);
  // ---- usuários ----
  const cria = async (d) => (await adm.post("/api/usuarios", Object.assign({ senha: "Senha1234" }, d))).j.usuario;
  const uCom = await cria({ login: "vendas", nome: "Vendedor", pricer: "comercial", servico: "nenhum" });
  const uCons = await cria({ login: "diretor", nome: "Consulta", pricer: "consulta", servico: "nenhum" });
  const uGes = await cria({ login: "gestor", nome: "Gestor Serviço", pricer: "comercial", servico: "gestor" });
  const uTec = await cria({ login: "tecnico", nome: "Técnico Um", pricer: "nenhum", servico: "tecnico", tecnicoId: 1 });
  confere("cria usuários dos perfis", uCom && uCons && uGes && uTec && !("senha" in uTec));
  confere("login repetido é recusado", (await adm.post("/api/usuarios", { login: "vendas", senha: "Senha1234", pricer: "comercial" })).status === 409);
  confere("usuário sem acesso a nenhum módulo é recusado", (await adm.post("/api/usuarios", { login: "nada", senha: "Senha1234", pricer: "nenhum", servico: "nenhum" })).status === 400);
  confere("não tira o último administrador", (await adm.patch("/api/usuarios/" + (await adm.get("/api/me")).j.id, { pricer: "comercial" })).status === 400);
  const entra = async (login) => { const c = cliente(); await c.post("/api/login", { login, senha: "Senha1234" }); await c.post("/api/senha", { atual: "Senha1234", nova: "Trocada123" }); return c; };
  const com = await entra("vendas"), cons = await entra("diretor"), ges = await entra("gestor"), tec = await entra("tecnico");

  // ---- Pricer: quem recebe o arquivo e o que cada nível grava ----
  r = await adm.get("/"); confere("admin recebe o Pricer com a camada do servidor", r.status === 200 && String(r.j).includes('<script src="/lsf-shim.js"></script>'));
  r = await tec.get("/"); confere("técnico NÃO recebe o Pricer (vai para /servico/)", r.status === 302 && r.loc === "/servico/");
  confere("técnico não lê o banco do Pricer", (await tec.post("/api/db/query", { path: "propostas" })).status === 403);
  confere("técnico não grava no banco do Pricer", (await tec.post("/api/db/set", { path: "propostas/t", data: { a: 1 } })).status === 403);
  confere("técnico não lista pessoas nem anexos", (await tec.get("/api/pessoas")).status === 403 && (await tec.get("/api/assets")).status === 403);
  confere("técnico não administra usuários", (await tec.get("/api/usuarios")).status === 403);
  confere("comercial grava proposta", (await com.post("/api/db/set", { path: "propostas/p1", data: { numero: "10.500", at: "2026-11-12" } })).status === 200);
  confere("comercial NÃO altera cadastro (preços)", (await com.post("/api/db/set", { path: "cadastro/f01", data: { itens: {} } })).status === 403);
  confere("comercial NÃO altera os responsáveis", (await com.post("/api/db/set", { path: "meta/acessos", data: { areas: {} } })).status === 403);
  const idCom = (await com.get("/api/me")).j.id;
  confere("assinatura: só no próprio espaço", (await com.post("/api/db/set", { path: "assinaturas/" + idCom + "/aprov/x", data: { d: 1 } })).status === 200 && (await com.post("/api/db/set", { path: "assinaturas/outro/aprov/x", data: { d: 1 } })).status === 403);
  confere("consulta lê e não grava", (await cons.post("/api/db/get", { path: "propostas/p1" })).j.exists === true && (await cons.post("/api/db/set", { path: "propostas/p2", data: { a: 1 } })).status === 403);
  confere("admin altera cadastro", (await adm.post("/api/db/set", { path: "cadastro/f01", data: { itens: { a: { preco: 10 } } } })).status === 200);
  confere("caminho inválido recusado", (await adm.post("/api/db/get", { path: "../etc/passwd" })).status === 400);
  r = await com.post("/api/db/query", { path: "propostas", where: [["numero", "==", "10.500"]], orderBy: [["at", "desc"]], limit: 5 });
  confere("consulta com where/orderBy/limit", r.j.docs && r.j.docs.length === 1 && r.j.docs[0].id === "p1");
  const t1 = await com.post("/api/db/acquire", { path: "propostas/p1", holder: "a", ttlMs: 3000 }), t2 = await adm.post("/api/db/acquire", { path: "propostas/p1", holder: "b", ttlMs: 3000 });
  confere("trava: o segundo espera", t1.j.acquired === true && t2.j.acquired === false);
  r = await com.get("/api/db/changes?since=0"); confere("mudanças desde 0 trazem os caminhos gravados", r.j.seq >= 2 && (r.j.paths || []).includes("propostas/p1"));

  // ---- serviço: dados e perfis ----
  confere("vendedor sem perfil de serviço não sincroniza", (await sync(com, {})).status === 403);
  r = await sync(adm, { contratos: [{ id: 1, codigo: "200001", cliente: "Cliente A", valorMensal: 5000, equipamentos: [] }, { id: 2, codigo: "200002", cliente: "Cliente B", valorMensal: 7000 }], tecnicos: [{ id: 1, nome: "Técnico Um" }],
    visitas: [{ id: 10, contratoId: 1, tecnicoId: 1, data: "2026-12-01", status: "agendada" }],
    relatorios: [{ id: 100, codigo: "700100", contratoId: 1, cliente: "Cliente A", valorServico: 900, aprovacao: { status: "pendente" }, grupos: [{ nome: "Bomba diesel", itens: [{ texto: "Vazamento na gaxeta", status: "nok", obs: "gotejamento" }, { texto: "Nível de óleo", status: "ok" }] }] }] });
  confere("admin grava contratos, técnicos, visitas e relatórios", r.status === 200 && val(r, "contratos").length === 2);
  const s0 = new Date(Date.now() + 1000).toISOString();
  r = await sync(tec, {});
  const ctTec = val(r, "contratos");
  confere("técnico recebe os contratos SEM valores", ctTec.length === 2 && ctTec.every((c) => !("valorMensal" in c)));
  confere("técnico recebe o relatório sem o campo de valor", val(r, "relatorios").every((x) => !("valorServico" in x)));
  confere("técnico não recebe a auditoria", !r.j.data.auditoria);
  // técnico tenta alterar contrato, apagar contrato, criar relatório já aprovado, editar visita
  const ctMod = ctTec.map((c) => (c.id === 1 ? Object.assign({}, c, { cliente: "Mudado pelo técnico" }) : c)).filter((c) => c.id !== 2);
  r = await sync(tec, { contratos: ctMod, visitas: [{ id: 10, contratoId: 1, tecnicoId: 1, data: "2026-12-01", status: "em_andamento" }],
    relatorios: val(r, "relatorios").map((x) => Object.assign({}, x, { obsTecnico: "conferido" })).concat([{ id: 101, codigo: "700101", contratoId: 1, cliente: "Cliente A", aprovacao: { status: "aprovado", supervisor: "eu mesmo" } }]) }, s0);
  const ctAdm = val(await sync(adm, {}), "contratos");
  confere("contrato: alteração do técnico ignorada", ctAdm.find((c) => c.id === 1).cliente === "Cliente A");
  confere("contrato: técnico não exclui", ctAdm.length === 2);
  confere("contrato: valor guardado intacto", ctAdm.find((c) => c.id === 1).valorMensal === 5000);
  const relAdm = val(await sync(adm, {}), "relatorios");
  confere("relatório criado pelo técnico como 'aprovado' entra como pendente", relAdm.find((x) => x.id === 101).aprovacao.status === "pendente");
  const r100 = relAdm.find((x) => x.id === 100);
  confere("relatório editado pelo técnico mantém o valor que ele não vê", r100.obsTecnico === "conferido" && r100.valorServico === 900);
  confere("técnico altera a visita (agenda)", val(await sync(adm, {}), "visitas")[0].status === "em_andamento");
  // gestor aprova; depois o técnico não muda o aprovado
  r = await sync(ges, {});
  const relG = val(r, "relatorios").map((x) => (x.id === 101 ? Object.assign({}, x, { aprovacao: { status: "aprovado", supervisor: "Gestor Serviço" } }) : x));
  await sync(ges, { relatorios: relG }, new Date(Date.now() + 1000).toISOString());
  confere("gestor aprova o relatório", val(await sync(adm, {}), "relatorios").find((x) => x.id === 101).aprovacao.status === "aprovado");
  r = await sync(tec, {});
  await sync(tec, { relatorios: val(r, "relatorios").map((x) => (x.id === 101 ? Object.assign({}, x, { conclusao: "mudei depois de aprovado" }) : x)) }, new Date(Date.now() + 1000).toISOString());
  confere("relatório aprovado não muda pelo técnico", !("conclusao" in val(await sync(adm, {}), "relatorios").find((x) => x.id === 101)));
  // registro criado por outro depois da última sincronização do aparelho não é apagado
  await sync(adm, { visitas: val(await sync(adm, {}), "visitas").concat([{ id: 11, contratoId: 2, tecnicoId: 1, data: "2026-12-05", status: "agendada" }]) });
  await sync(ges, { visitas: [{ id: 10, contratoId: 1, tecnicoId: 1, data: "2026-12-01", status: "em_andamento" }] }, new Date(Date.now() - 60000).toISOString());
  confere("visita nova de outro aparelho não some na sincronização", val(await sync(adm, {}), "visitas").some((v) => v.id === 11));
  // ---- revisão de segurança: valores com outros nomes, aprovação forjada, notificações e auditoria ----
  let base = await sync(adm, {});
  await sync(adm, { contratos: val(base, "contratos").map((c) => (c.id === 1 ? Object.assign({}, c, { mensalidade: 5000, totalContrato: 60000, honorarioAnual: 48000, bdi: 0.27, equipamentos: [{ nome: "Bomba diesel", total: 18000, maoDeObra: 4000 }] }) : c)),
    relatorios: val(base, "relatorios").concat([{ id: 102, codigo: "700102", contratoId: 1, cliente: "Cliente A", stats: { ok: 3, total: 4 }, aprovacao: { status: "pendente" } }]),
    notificacoes: [{ id: 501, tipo: "aviso", texto: "aviso 1", lidaPor: [] }, { id: 502, tipo: "aviso", texto: "aviso 2", lidaPor: [] }] });
  r = await sync(tec, {});
  const c1t = val(r, "contratos").find((c) => c.id === 1);
  confere("técnico não vê valor com outro nome (mensalidade, total, honorário, BDI, total do equipamento)", c1t && !/5000|60000|48000|0\.27|18000|4000/.test(JSON.stringify(c1t)) && c1t.equipamentos[0].nome === "Bomba diesel", JSON.stringify(c1t));
  confere("técnico vê a contagem do relatório (stats.total não é dinheiro)", val(r, "relatorios").find((x) => x.id === 102).stats.total === 4);
  const sT = new Date(Date.now() + 1000).toISOString();
  await sync(tec, { relatorios: val(r, "relatorios").map((x) => (x.id === 102 ? Object.assign({}, x, { obsTecnico: "ok", aprovacao: { status: "Aprovado ", supervisor: "FALSO", aprovadoEm: "2026-01-01" } }) : x)),
    visitas: val(r, "visitas").map((v) => (v.id === 10 ? Object.assign({}, v, { status: "concluida", relatorio: { id: 102, aprovacao: { status: "aprovado" } } }) : v)),
    notificacoes: [], auditoria: [{ id: 999, usuario: "Administrador", login: "admin", acao: "excluiu tudo" }] }, sT);
  base = await sync(adm, {});
  const r102 = val(base, "relatorios").find((x) => x.id === 102);
  confere("técnico não aprova escrevendo 'Aprovado ' (maiúsculas/espaço)", r102.aprovacao.status === "pendente" && !r102.aprovacao.supervisor && !r102.aprovacao.aprovadoEm && r102.obsTecnico === "ok", JSON.stringify(r102.aprovacao));
  const v10 = val(base, "visitas").find((v) => v.id === 10);
  confere("técnico não conclui a visita nem aprova a cópia do relatório nela", v10.status !== "concluida" && v10.relatorio && v10.relatorio.aprovacao.status === "pendente", JSON.stringify(v10));
  confere("técnico não apaga notificações dos outros", val(base, "notificacoes").length === 2);
  const aud = val(base, "auditoria").find((a) => a.id === 999);
  confere("auditoria: o autor é quem está logado, não o que o aparelho diz", aud && aud.login === "tecnico" && aud.usuario === "Técnico Um", JSON.stringify(aud));
  r = await sync(tec, {});
  await sync(tec, { notificacoes: val(r, "notificacoes").map((n) => (n.id === 501 ? Object.assign({}, n, { lidaPor: [uTec.id], texto: "mudado" }) : n)) }, new Date(Date.now() + 1000).toISOString());
  const n501 = val(await sync(adm, {}), "notificacoes").find((n) => n.id === 501);
  confere("técnico marca a notificação como lida, sem mudar o texto", n501.lidaPor.includes(uTec.id) && n501.texto === "aviso 1");
  // devolvido → técnico corrige e reenvia (volta a pendente, com a devolução no histórico)
  base = await sync(ges, {});
  await sync(ges, { relatorios: val(base, "relatorios").map((x) => (x.id === 102 ? Object.assign({}, x, { aprovacao: { status: "devolvido", motivo: "falta foto", devolvidoPor: "Gestor Serviço", devolvidoEm: "2026-11-01" } }) : x)) }, new Date(Date.now() + 1000).toISOString());
  r = await sync(tec, {});
  await sync(tec, { relatorios: val(r, "relatorios").map((x) => (x.id === 102 ? Object.assign({}, x, { fotos: 1, aprovacao: { status: "pendente", supervisor: "FALSO" } }) : x)) }, new Date(Date.now() + 1000).toISOString());
  const r102b = val(await sync(adm, {}), "relatorios").find((x) => x.id === 102);
  confere("reenvio do devolvido: volta a pendente, devolução no histórico, sem aprovador forjado", r102b.aprovacao.status === "pendente" && r102b.aprovacao.historico.length === 1 && r102b.aprovacao.historico[0].motivo === "falta foto" && r102b.aprovacao.supervisor !== "FALSO" && r102b.fotos === 1, JSON.stringify(r102b.aprovacao));
  confere("caminho do banco com __proto__/constructor é recusado", (await adm.post("/api/db/set", { path: "constructor/prototype", data: { a: 1 } })).status >= 400 && (await adm.post("/api/db/set", { path: "propostas/__proto__", data: { a: 1 } })).status >= 400);
  // cliente
  const uCli = await cria({ login: "cliente.a", nome: "Cliente A", pricer: "nenhum", servico: "cliente", clienteId: 1 });
  const cli = await entra("cliente.a");
  r = await sync(cli, {});
  confere("cliente vê só o contrato dele, sem valor", uCli && val(r, "contratos").length === 1 && val(r, "contratos")[0].id === 1 && !("valorMensal" in val(r, "contratos")[0]));
  confere("cliente vê só os relatórios do contrato dele", val(r, "relatorios").every((x) => x.contratoId === 1) && val(r, "relatorios").length >= 1 && val(r, "tecnicos").length === 0);
  await sync(cli, { contratos: [{ id: 1, cliente: "hack" }] });
  confere("cliente não grava", val(await sync(adm, {}), "contratos").find((c) => c.id === 1).cliente === "Cliente A");
  confere("usuário Cliente com acesso ao Pricer é recusado", (await adm.post("/api/usuarios", { login: "cli2", senha: "Senha1234", pricer: "consulta", servico: "cliente", clienteId: 1 })).status === 400);
  // numeração
  r = await tec.post("/api/allocate-number", { tipo: "atendimento" });
  confere("técnico pede número de atendimento", r.status === 200 && Number(r.j.numero) > 700101);
  confere("técnico não pede número de contrato", (await tec.post("/api/allocate-number", { tipo: "contrato" })).status === 403);

  // ---- ligação Pricer ↔ serviço ----
  confere("vendedor sem perfil Gestor não cria contrato", (await com.post("/api/svc/contratos", { propostaUid: "u1", cliente: "X" })).status === 403);
  r = await ges.post("/api/svc/contratos", { propostaUid: "u1", propostaNumero: "10.600", cliente: "Cliente C", valorMensal: 1234.5, duracaoMeses: 24, visitasAno: 12 });
  const r2 = await ges.post("/api/svc/contratos", { propostaUid: "u1", propostaNumero: "10.600", cliente: "Cliente C" });
  confere("gestor cria contrato a partir da proposta (número próprio)", r.status === 200 && /^2000\d\d$/.test(r.j.contrato.codigo) && r.j.contrato.propostaNumero === "10.600");
  confere("a mesma proposta não gera dois contratos", r2.j.existia === true && r2.j.contrato.codigo === r.j.contrato.codigo);
  confere("técnico vê o contrato novo, sem valor", val(await sync(tec, {}), "contratos").some((c) => c.propostaUid === "u1" && !("valorMensal" in c)));
  r = await ges.get("/api/svc/relatorios/100");
  confere("relatório → orçamento: não conformidades", r.status === 200 && r.j.relatorio.naoConformidades.length === 1 && r.j.relatorio.naoConformidades[0].item === "Vazamento na gaxeta");
  confere("técnico não usa o atalho de orçamento (sem Pricer)", (await tec.get("/api/svc/relatorios/100")).status === 403);
  confere("vínculos (tela de usuários) só para o administrador", (await adm.get("/api/svc/vinculos")).j.tecnicos.length === 1 && (await ges.get("/api/svc/vinculos")).status === 403);

  // ---- páginas e sessão ----
  confere("/servico/ abre sem login (só a casca do app; os dados pedem login)", (await cliente().get("/servico/")).status === 200);
  confere("o arquivo do Pricer não fica público", (await cliente().get("/pricer.html")).status !== 200 && (await cliente().get("/app/pricer.html")).status !== 200);
  await adm.patch("/api/usuarios/" + uTec.id, { ativo: false });
  confere("usuário desativado perde a sessão na hora", (await tec.get("/api/me")).status === 401);
  await com.post("/api/logout", {}); confere("depois de sair, a sessão acaba", (await com.get("/api/me")).status === 401);
  const x = cliente(); let st = 0; for (let i = 0; i < 6; i++) st = (await x.post("/api/login", { login: "diretor", senha: "errada" + i })).status;
  confere("6ª senha errada seguida: login travado", st === 429);
  r = await adm.get("/api/export"); confere("exportação (admin) traz serviço, Pricer e usuários sem senha", r.status === 200 && r.j.servico.contratos.length === 3 && !JSON.stringify(r.j.usuarios).includes("hash"));
  await new Promise((r) => setTimeout(r, 1500));
  const disco = fs.readFileSync(path.join(DIR, "usuarios.json"), "utf-8") + fs.readFileSync(path.join(DIR, "sessoes.json"), "utf-8");
  confere("no disco: nenhuma senha nem token em texto", !disco.includes("Senha1234") && !disco.includes("Trocada123") && !disco.includes("AdminForte99"));
} catch (e) { falha.push("erro: " + (e.stack || e)); }
srv.kill();
console.log("Servidor LS Fire: " + ok.length + " ok, " + falha.length + " falha(s)"); ok.forEach((x) => console.log("  ok  " + x)); falha.forEach((x) => console.log("  FALHA  " + x));
if (falha.length) console.log(log.slice(-2000));
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(falha.length ? 1 : 0);
