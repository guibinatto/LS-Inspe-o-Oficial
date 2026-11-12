// ============================================================================
//  LS Fire — servidor único: LS Pricer + módulo de Serviço de campo
//  - Login próprio (sem conta no claude.ai) e permissões aplicadas aqui no servidor
//  - "/"          → LS Pricer (só para quem tem acesso ao Pricer; os demais vão para o serviço)
//  - "/servico/"  → módulo de serviço (PWA: instala no celular e funciona offline)
//  - "/login"     → tela de entrada
//  - /api/db/*    → banco do Pricer (mesmo formato do banco do claude.ai)
//  - /api/sync    → sincronização do módulo de serviço, filtrada pelo perfil
//  Banco em arquivos JSON na pasta ./data (sem módulos nativos).
// ============================================================================
import express from "express";
import crypto from "crypto";
import fs from "fs";
import zlib from "zlib";
import path from "path";
import { fileURLToPath } from "url";
import { lerJson, gravadorJson } from "./lib/arquivo.js";
import { criarUsuarios, erro } from "./lib/usuarios.js";
import { criarBanco } from "./lib/banco.js";
import { NIVEL_PRICER, NOME_PRICER, PERFIS_SERVICO, CHAVES_SERVICO, nivelPricer, perfilServico, podeServico, podeLerPricer, podeGravarPricer,
  visivel, paraEnvio, juntar } from "./lib/acesso.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const PRICER_HTML = path.join(__dirname, "app", "pricer.html");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const BACKUP_INTERVAL_HORAS = Number(process.env.BACKUP_INTERVAL_HORAS ?? 6);
const BACKUP_MANTER = Number(process.env.BACKUP_MANTER || 30);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 600);
const COOKIE = "lsf_sess";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "0" ? false : process.env.COOKIE_SECURE === "1" ? true : null; // null = segue o protocolo
const SESSAO_DIAS = Number(process.env.SESSAO_DIAS || 30);

fs.mkdirSync(DATA_DIR, { recursive: true });
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const ASSET_DIR = path.join(DATA_DIR, "assets");
fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.mkdirSync(ASSET_DIR, { recursive: true });

const usuarios = criarUsuarios(DATA_DIR, { sessaoDias: SESSAO_DIAS });
const banco = criarBanco(DATA_DIR);

// ---- dados do módulo de serviço: uma lista por chave + carimbo de cada registro (criado/alterado no servidor) ----
const STORE_FILE = path.join(DATA_DIR, "store.json");
const store = lerJson(STORE_FILE, {});           // { chave: { value: "<json da lista>", updatedAt } , _meta: { chave: { id: {cri, upd} } } }
store._meta = store._meta || {};
const gravaStore = gravadorJson(STORE_FILE, () => store, 150);
const lista = (k) => { try { const v = store[k] ? JSON.parse(store[k].value) : []; return Array.isArray(v) ? v : []; } catch { return []; } };
const guardaLista = (k, arr, agora) => { store[k] = { value: JSON.stringify(arr), updatedAt: agora }; gravaStore(); };

// ---- numeração do serviço (atendimento 700000…, contrato 200000…) ----
const SEQ_FILE = path.join(DATA_DIR, "seq_counters.json");
const seqCounters = Object.assign({ atendimento: 699999, contrato: 199999 }, lerJson(SEQ_FILE, {}));
const gravaSeq = gravadorJson(SEQ_FILE, () => seqCounters, 10);
const maiorNum = (arr, campos) => arr.reduce((m, it) => Math.max(m, ...campos.map((c) => (Number.isFinite(Number(it && it[c])) ? Number(it[c]) : 0))), 0);
function realinharContadores() {
  const at = Math.max(seqCounters.atendimento, maiorNum(lista("visitas"), ["referencia", "codigoAtendimento"]), maiorNum(lista("relatorios"), ["referencia", "codigoAtendimento", "numero", "codigo"]));
  const ct = Math.max(seqCounters.contrato, maiorNum(lista("contratos"), ["codigo"]));
  if (at !== seqCounters.atendimento || ct !== seqCounters.contrato) { seqCounters.atendimento = at; seqCounters.contrato = ct; gravaSeq(); }
}
realinharContadores();
const proximoNumero = (tipo) => { seqCounters[tipo] += 1; gravaSeq(); return String(seqCounters[tipo]); };

// ---- arquivos anexados pelo Pricer (equivalente ao "assets" do claude.ai) ----
const TIPOS_OK = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|text\/(plain|csv|markdown)|application\/json|application\/vnd\.openxmlformats-officedocument\.[a-z.]+|application\/vnd\.ms-excel|application\/xml|text\/xml|application\/octet-stream)$/;

// ---- backup: copia todos os arquivos de dados para data/backups/<data>/ e guarda os N mais recentes ----
function fazerBackup(motivo = "agendado") {
  try {
    usuarios.gravarJa(); banco.gravarJa(); gravaStore.agora(); gravaSeq.agora();
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(BACKUP_DIR, "backup-" + carimbo); fs.mkdirSync(dest, { recursive: true });
    for (const f of ["store.json", "pricer-db.json", "usuarios.json", "seq_counters.json"]) { const o = path.join(DATA_DIR, f); if (fs.existsSync(o)) fs.copyFileSync(o, path.join(dest, f)); }
    const pastas = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-")).sort();
    while (pastas.length > BACKUP_MANTER) fs.rmSync(path.join(BACKUP_DIR, pastas.shift()), { recursive: true, force: true });
    console.log(`  [backup ${motivo}] ${path.basename(dest)}`); return dest;
  } catch (e) { console.error("  [backup] falhou:", e.message); return null; }
}
if (BACKUP_INTERVAL_HORAS > 0) { setTimeout(() => fazerBackup("inicial"), 10000).unref(); setInterval(() => fazerBackup("agendado"), BACKUP_INTERVAL_HORAS * 3600 * 1000).unref(); }

// ---- app ----
const app = express();
app.disable("x-powered-by");
// Endereço de quem chama: só se confia no X-Forwarded-For quando quem repassa é o proxy desta mesma máquina (o Caddy do
// INSTALACAO-TI.md). Exposto direto, o cabeçalho é ignorado e o limite por IP não pode ser burlado. Proxy em outra máquina:
// TRUST_PROXY=<ip do proxy>. TRUST_PROXY=0 desliga.
const TP = String(process.env.TRUST_PROXY ?? "").trim();
app.set("trust proxy", TP === "0" ? false : TP ? TP.split(",").map((x) => x.trim()) : "loopback");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN"); // o Pricer mostra o serviço numa moldura do mesmo endereço; outros sites não
  next();
});

// limite de requisições por IP (proteção básica; não substitui o do proxy)
const baldes = new Map();
function limite(max) {
  return (req, res, next) => {
    const ip = req.ip || "?"; const agora = Date.now(); const k = ip + "|" + max;
    let b = baldes.get(k); if (!b || agora - b.ini > 60000) { b = { ini: agora, n: 0 }; baldes.set(k, b); }
    if (++b.n > max) return res.status(429).json({ error: "Muitas requisições. Tente de novo em instantes." });
    next();
  };
}
setInterval(() => { const a = Date.now(); for (const [k, b] of baldes) if (a - b.ini > 300000) baldes.delete(k); }, 300000).unref();

// sessão pelo cookie
function lerCookie(req, nome) { const c = req.headers.cookie || ""; for (const p of c.split(";")) { const [k, ...v] = p.trim().split("="); if (k === nome) return decodeURIComponent(v.join("=")); } return ""; }
app.use((req, _res, next) => { req.token = lerCookie(req, COOKIE); req.user = usuarios.sessao(req.token); next(); });
// senha provisória (primeiro acesso ou redefinida pelo administrador): só deixa trocar a senha, ver quem é e sair
const LIVRE_TROCA = new Set(["/api/me", "/api/senha", "/api/logout", "/api/login", "/api/health", "/login", "/login.html", "/favicon.ico"]);
app.use((req, res, next) => {
  if (!req.user || !req.user.trocarSenha || LIVRE_TROCA.has(req.path) || /\.(css|js|png|ico|webmanifest)$/.test(req.path) && !req.path.startsWith("/_blob")) return next();
  if (req.path.startsWith("/api/") || req.path.startsWith("/_blob")) return res.status(403).json({ error: "Troque a senha provisória antes de continuar.", trocarSenha: true });
  return res.redirect(302, "/login?troca=1");
});
const seguro = (req) => (COOKIE_SECURE === null ? req.secure : COOKIE_SECURE);
function poeCookie(req, res, token) { res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSAO_DIAS * 86400}${seguro(req) ? "; Secure" : ""}`); }
function tiraCookie(req, res) { res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro(req) ? "; Secure" : ""}`); }

// proteção contra requisição forjada (CSRF): toda gravação na API precisa do cabeçalho X-LSF (outro site não consegue mandar)
app.use("/api", (req, res, next) => { if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-lsf"] !== "1") return res.status(403).json({ error: "Requisição sem o cabeçalho do app." }); next(); });
app.use("/api", limite(RATE_LIMIT_MAX));

const exige = (teste, msg) => (req, res, next) => { if (!req.user) return res.status(401).json({ error: "Entre com seu login." }); if (!teste(req.user)) return res.status(403).json({ error: msg || "Sem permissão." }); next(); };
const exigeLogin = exige(() => true);
const exigePricer = (n) => exige((u) => nivelPricer(u) >= n, "Seu usuário não tem acesso a esta parte do Pricer.");
const exigeAdmin = exige((u) => u.pricer === "admin", "Só o administrador.");
const exigeServico = exige((u) => !!perfilServico(u), "Seu usuário não tem acesso ao módulo de serviço.");
const trata = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Erro no servidor." }); if (!e.status) console.error(e); } };
const json = express.json({ limit: "40mb" });

const meDe = (u) => ({ id: u.id, login: u.login, nome: u.nome, email: u.email || "", pricer: u.pricer, servico: perfilServico(u) || "nenhum", tecnicoId: u.tecnicoId ?? null, clienteId: u.clienteId ?? null,
  trocarSenha: !!u.trocarSenha, nivelPricer: nivelPricer(u), permissoesServico: PERFIS_SERVICO[perfilServico(u)] || null });

// ---------------- autenticação ----------------
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.post("/api/login", limite(20), json, trata(async (req, res) => {
  const { login, senha } = req.body || {};
  const r = usuarios.entrar(login, senha, req.ip); poeCookie(req, res, r.token);
  res.json({ ok: true, me: meDe(usuarios.porId(r.usuario.id)) });
}));
app.post("/api/logout", (req, res) => { usuarios.sair(req.token); tiraCookie(req, res); res.json({ ok: true }); });
app.get("/api/me", exigeLogin, (req, res) => res.json(meDe(req.user)));
app.post("/api/senha", exigeLogin, json, trata(async (req, res) => { usuarios.trocarSenha(req.user.id, (req.body || {}).atual, (req.body || {}).nova); res.json({ ok: true }); }));
app.get("/api/perfis", exigeLogin, (_req, res) => res.json({ pricer: NOME_PRICER, servico: Object.fromEntries(Object.entries(PERFIS_SERVICO).filter(([k]) => k !== "admin").map(([k, v]) => [k, v])) }));

// ---------------- usuários (administrador) ----------------
app.get("/api/usuarios", exigeAdmin, (_req, res) => res.json({ usuarios: usuarios.lista() }));
app.post("/api/usuarios", exigeAdmin, json, trata(async (req, res) => res.json({ usuario: usuarios.criar(req.body || {}, req.user.id) })));
app.patch("/api/usuarios/:id", exigeAdmin, json, trata(async (req, res) => {
  const d = Object.assign({}, req.body || {}); if (req.params.id === req.user.id && d.ativo === false) throw erro(400, "Você não pode desativar o próprio usuário.");
  res.json({ usuario: usuarios.alterar(req.params.id, d, req.user.id) });
}));

// ---------------- banco do Pricer ----------------
// nomes da equipe (para "quem fez"): só para quem usa o Pricer
app.post("/api/pessoas", exigePricer(1), json, (req, res) => res.json({ pessoas: usuarios.nomes((req.body || {}).ids || []) }));
app.get("/api/pessoas", exigePricer(1), (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  res.json({ pessoas: usuarios.lista().filter((u) => u.ativo && nivelPricer(u) >= 1 && (!q || (u.nome + " " + u.login).toLowerCase().includes(q))).slice(0, 30).map((u) => ({ id: u.id, name: u.nome || u.login })) });
});
const caminho = (req) => String((req.body || {}).path || "");
app.post("/api/db/get", exigePricer(1), json, (req, res) => { const p = caminho(req); if (!podeLerPricer(req.user, p)) return res.status(400).json({ error: "Caminho inválido." }); res.json(banco.get(p)); });
app.post("/api/db/query", exigePricer(1), json, trata(async (req, res) => {
  const p = caminho(req); if (!podeLerPricer(req.user, p)) throw erro(400, "Caminho inválido.");
  const b = req.body || {}; res.json({ docs: banco.query(p, { where: b.where || [], orderBy: b.orderBy || [], limit: Math.min(Number(b.limit) || 0, 5000) }) });
}));
for (const op of ["set", "update", "delete"]) {
  app.post("/api/db/" + op, exigePricer(2), json, trata(async (req, res) => {
    const p = caminho(req); if (!podeGravarPricer(req.user, p)) throw erro(403, "Seu nível de acesso não grava aqui (" + p.split("/")[0] + ").");
    const d = (req.body || {}).data;
    if (op !== "delete" && (!d || typeof d !== "object" || Array.isArray(d))) throw erro(400, "Documento inválido.");
    res.json(op === "delete" ? banco.delete(p) : banco[op](p, d, req.user.id));
  }));
}
app.post("/api/db/acquire", exigePricer(2), json, trata(async (req, res) => {
  const p = caminho(req); if (!podeGravarPricer(req.user, p)) throw erro(403, "Sem permissão para travar " + p.split("/")[0] + ".");
  res.json(banco.acquire(p, String((req.body || {}).holder || req.user.id).slice(0, 120), (req.body || {}).ttlMs));
}));
app.get("/api/db/changes", exigePricer(1), (req, res) => res.json(banco.mudancasDesde(req.query.since)));

// anexos do Pricer
app.post("/api/assets", exigePricer(2), express.raw({ type: () => true, limit: "20mb" }), trata(async (req, res) => {
  const tipo = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!TIPOS_OK.test(tipo)) throw erro(415, "Tipo de arquivo não aceito: " + tipo);
  if (!req.body || !req.body.length) throw erro(400, "Arquivo vazio.");
  const id = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(path.join(ASSET_DIR, id), req.body); fs.writeFileSync(path.join(ASSET_DIR, id + ".json"), JSON.stringify({ tipo, tam: req.body.length, por: req.user.id, at: new Date().toISOString(), nome: String(req.headers["x-filename"] || "").slice(0, 200) }));
  res.json({ id, url: "/_blob/" + id, sizeBytes: req.body.length, contentType: tipo });
}));
app.get("/api/assets", exigePricer(1), (_req, res) => {
  const out = fs.readdirSync(ASSET_DIR).filter((f) => f.endsWith(".json")).map((f) => Object.assign({ id: f.slice(0, -5), url: "/_blob/" + f.slice(0, -5) }, lerJson(path.join(ASSET_DIR, f), {})));
  res.json({ assets: out, usage: { bytes: out.reduce((t, x) => t + (x.tam || 0), 0) } });
});
app.delete("/api/assets/:id", exigePricer(3), (req, res) => { const id = req.params.id; if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "id inválido" }); for (const f of [id, id + ".json"]) try { fs.unlinkSync(path.join(ASSET_DIR, f)); } catch {} res.json({ ok: true }); });
app.get("/_blob/:id", exigePricer(1), (req, res) => {
  const id = req.params.id; if (!/^[a-f0-9]{32}$/.test(id)) return res.status(404).end();
  const m = lerJson(path.join(ASSET_DIR, id + ".json"), null); if (!m) return res.status(404).end();
  res.setHeader("Content-Type", m.tipo === "image/svg+xml" ? "image/svg+xml" : m.tipo); res.setHeader("Cache-Control", "private, max-age=3600");
  if (m.tipo === "image/svg+xml") res.setHeader("Content-Security-Policy", "script-src 'none'");
  res.sendFile(path.join(ASSET_DIR, id));
});

// ---------------- módulo de serviço ----------------
app.post("/api/allocate-number", exigeServico, json, trata(async (req, res) => {
  const { tipo } = req.body || {};
  if (tipo !== "atendimento" && tipo !== "contrato") throw erro(400, 'Campo "tipo" deve ser "atendimento" ou "contrato".');
  if (tipo === "contrato" && !podeServico(req.user, "gerenciarContratos")) throw erro(403, "Seu perfil não cria contratos.");
  if (perfilServico(req.user) === "cliente") throw erro(403, "Sem permissão.");
  res.json({ numero: proximoNumero(tipo) });
}));

function dadosPara(u) {
  const data = {};
  for (const k of CHAVES_SERVICO) {
    if (!store[k]) continue;
    const arr = lista(k).filter((r) => r && visivel(k, r, u)).map((r) => paraEnvio(k, r, u));
    data[k] = { value: JSON.stringify(arr), updatedAt: store[k].updatedAt };
  }
  return data;
}
app.post("/api/sync", exigeServico, json, trata(async (req, res) => {
  const { changes, lastSync } = req.body || {};
  const agora = new Date().toISOString(); let ignorados = 0;
  if (Array.isArray(changes) && perfilServico(req.user) !== "cliente") {
    for (const ch of changes) {
      if (!ch || !CHAVES_SERVICO.includes(ch.key) || ch.action === "delete") continue; // apagar uma chave inteira não é aceito
      let recebidos; try { recebidos = JSON.parse(ch.value); } catch { continue; }
      const meta = (store._meta[ch.key] = store._meta[ch.key] || {});
      const r = juntar(ch.key, lista(ch.key), recebidos, req.user, meta, { ultimaSinc: typeof lastSync === "string" ? lastSync : null, agora });
      ignorados += r.ignorados;
      if (r.mudou) { const arr = ch.key === "auditoria" ? r.lista.slice(-3000) : ch.key === "notificacoes" ? r.lista.slice(-1000) : r.lista; guardaLista(ch.key, arr, agora); }
    }
    realinharContadores();
  }
  res.json({ data: dadosPara(req.user), serverTime: agora, ignorados });
}));

// ligação com o Pricer: contrato a partir de uma proposta ganha (SPV de inspeção/contrato)
app.post("/api/svc/contratos", exige((u) => nivelPricer(u) >= 2 && (u.pricer === "admin" || podeServico(u, "gerenciarContratos")), "Para criar o contrato é preciso acesso Comercial no Pricer e perfil Gestor no serviço."), json, trata(async (req, res) => {
  const d = req.body || {}; const uid = String(d.propostaUid || ""); if (!uid) throw erro(400, "Falta a proposta de origem.");
  const arr = lista("contratos"); const ja = arr.find((c) => c.propostaUid === uid);
  if (ja) return res.json({ contrato: ja, existia: true });
  const agora = new Date().toISOString(); const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const c = { id: Date.now(), codigo: proximoNumero("contrato"), cliente: String(d.cliente || "").slice(0, 160), cnpj: String(d.cnpj || "").slice(0, 30), endereco: String(d.endereco || "").slice(0, 300),
    contato: String(d.contato || "").slice(0, 120), telefone: String(d.telefone || "").slice(0, 40), email: String(d.email || "").slice(0, 120), tecnicoId: d.tecnicoId ?? null,
    duracaoMeses: num(d.duracaoMeses) || 12, valorMensal: num(d.valorMensal), dataInicio: String(d.dataInicio || agora.slice(0, 10)), validade: String(d.validade || ""), proximaVisita: String(d.proximaVisita || ""),
    visitasAno: num(d.visitasAno) || null, equipamentos: Array.isArray(d.equipamentos) ? d.equipamentos.slice(0, 50) : [],
    propostaUid: uid, propostaId: String(d.propostaId || ""), propostaNumero: String(d.propostaNumero || ""), origem: "pricer", criadoPor: req.user.nome || req.user.login, criadoEm: agora };
  arr.push(c); guardaLista("contratos", arr, agora); (store._meta.contratos = store._meta.contratos || {})[String(c.id)] = { cri: agora, upd: agora };
  res.json({ contrato: c, existia: false });
}));
app.get("/api/svc/contratos", exige((u) => nivelPricer(u) >= 1 && !!perfilServico(u), "Sem acesso ao serviço."), (req, res) => {
  const uid = String(req.query.propostaUid || ""); res.json({ contratos: lista("contratos").filter((c) => !uid || c.propostaUid === uid).map((c) => paraEnvio("contratos", c, req.user)) });
});
// para a tela de usuários (administrador): técnicos e contratos que um usuário pode representar
app.get("/api/svc/vinculos", exigeAdmin, (_req, res) => res.json({
  tecnicos: lista("tecnicos").map((t) => ({ id: t.id, nome: t.nome || String(t.id) })),
  contratos: lista("contratos").map((c) => ({ id: c.id, codigo: c.codigo || String(c.id), cliente: c.cliente || "" })),
}));
// relatório → orçamento no Pricer: o que não está conforme vira o escopo de uma SPV
app.get("/api/svc/relatorios/:id", exige((u) => nivelPricer(u) >= 2 && podeServico(u, "verRelatorios"), "Para orçar é preciso acesso Comercial no Pricer e acesso ao serviço."), (req, res) => {
  const r = lista("relatorios").find((x) => String(x.id) === req.params.id || String(x.codigo) === req.params.id);
  if (!r) return res.status(404).json({ error: "Relatório não encontrado." });
  const ct = lista("contratos").find((c) => c.id === r.contratoId) || null;
  const nok = []; const anda = (o, onde) => { if (Array.isArray(o)) o.forEach((x) => anda(x, onde)); else if (o && typeof o === "object") {
    if ((o.status === "nok" || o.status === "NOK" || o.conforme === false) && (o.texto || o.item || o.descricao)) nok.push({ item: String(o.texto || o.item || o.descricao), obs: String(o.obs || o.observacao || ""), onde });
    for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") anda(v, o.nome || o.titulo || onde); } };
  anda(r, "");
  res.json({ relatorio: { id: r.id, codigo: r.codigo || r.referencia, tipo: r.tipo, data: r.data || r.dataExecucao || r.criadoEm, cliente: r.cliente || (ct && ct.cliente) || "", endereco: r.endereco || (ct && ct.endereco) || "",
    contato: (ct && ct.contato) || r.contato || "", contratoCodigo: ct ? ct.codigo : "", contratoId: r.contratoId ?? null, tecnico: r.tecnico || r.tecnicoNome || "", naoConformidades: nok.slice(0, 200) } });
});

// ---------------- migração: backup completo do Pricer (claude.ai ou arquivo) → banco do servidor ----------------
// O backup do Pricer (Configurações → Backup e restauração → Baixar backup completo) traz as coleções (propostas, revisões,
// aprovações, baixas, pedidos, documentos, pendências, modelos), o cadastro (insumos, kits, tabelas) e o histórico.
// Aqui ele vira os mesmos documentos que o Pricer grava. Os responsáveis por área não vêm: as pessoas do claude.ai não
// existem no servidor (defina de novo em Configurações → Usuários e permissões).
const famCode = (fam) => { const m = /^(\d+)\./.exec(fam || ""); return m ? +m[1] : 99; };
const slugTab = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
app.post("/api/admin/importar-pricer", exigeAdmin, express.json({ limit: "120mb" }), trata(async (req, res) => {
  const b = req.body || {}; if (b.app !== "ls-pricer" || !b.colecoes) throw erro(400, "Este arquivo não é um backup completo do LS Pricer.");
  const quem = req.user.id; const cont = { colecoes: 0, insumos: 0, kits: 0, tabelas: 0, historico: 0 };
  fazerBackup("antes da importação");
  for (const [k, docs] of Object.entries(b.colecoes || {})) {
    if (!/^[a-z]+$/.test(k) || !docs || typeof docs !== "object") continue;
    for (const [id, body] of Object.entries(docs)) { const p = k + "/" + id; if (body && typeof body === "object" && !Array.isArray(body) && podeGravarPricer(req.user, p)) { banco.set(p, body, quem); cont.colecoes++; } }
  }
  const cad = b.cadastro || {};
  if (Array.isArray(cad.insumos) && cad.insumos.length) {
    const porFam = {};
    for (const it of cad.insumos) { if (!it || it.id == null) continue; const { id, ...resto } = it; const d = "cadastro/f" + String(famCode(it.fam)).padStart(2, "0"); (porFam[d] = porFam[d] || {})[id] = resto; cont.insumos++; }
    for (const [p, itens] of Object.entries(porFam)) banco.set(p, { itens }, quem);
  }
  for (const [kind, arr] of [["motor", cad.kitMotor], ["bomba", cad.kitBomba]]) if (Array.isArray(arr)) { const itens = {}; for (const it of arr) { if (!it || it.id == null) continue; const { id, ...r } = it; itens[id] = r; cont.kits++; } banco.set("kits/" + kind, { itens }, quem); }
  for (const [sheet, cells] of Object.entries(cad.tabelas || {})) { banco.set("tabelas/" + slugTab(sheet), { sheet, cells: cells || {} }, quem); cont.tabelas++; }
  if (Array.isArray(b.historico) && b.historico.length) {
    const porDia = {}; for (const it of b.historico) { const d = String(it && it.at || "").slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) (porDia[d] = porDia[d] || []).push(it); }
    for (const [dia, itens] of Object.entries(porDia)) { const atual = banco.get("historico/" + dia); const ja = new Set(((atual.data || {}).itens || []).map((x) => JSON.stringify(x))); banco.set("historico/" + dia, { dia, itens: ((atual.data || {}).itens || []).concat(itens.filter((x) => !ja.has(JSON.stringify(x)))) }, quem); cont.historico += itens.length; }
  }
  if (cont.insumos) banco.set("meta/cadastro", { seeded: true, importadoEm: new Date().toISOString(), backupDe: b.criadoEm || null, por: quem }, quem);
  banco.gravarJa(); fazerBackup("depois da importação");
  res.json({ ok: true, ...cont });
}));

// ---------------- administração do servidor ----------------
const tokenAdminOk = (req) => !!ADMIN_TOKEN && (req.query.token === ADMIN_TOKEN || req.headers["x-admin-token"] === ADMIN_TOKEN);
const adminOuToken = (req, res, next) => (tokenAdminOk(req) || (req.user && req.user.pricer === "admin") ? next() : res.status(req.user ? 403 : 401).json({ error: "Só o administrador." }));
app.get("/api/export", adminOuToken, (_req, res) => {
  const servico = {}; for (const k of CHAVES_SERVICO) servico[k] = lista(k);
  res.setHeader("Content-Disposition", `attachment; filename="lsfire-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exportadoEm: new Date().toISOString(), servico, pricer: banco.exportar(), usuarios: usuarios.lista() });
});
app.get("/api/backups", adminOuToken, (_req, res) => {
  const b = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-")).sort().reverse();
  res.json({ intervaloHoras: BACKUP_INTERVAL_HORAS, manter: BACKUP_MANTER, total: b.length, backups: b });
});
app.post("/api/backup", adminOuToken, (_req, res) => { const d = fazerBackup("manual"); d ? res.json({ ok: true, pasta: path.basename(d) }) : res.status(500).json({ ok: false }); });

// ---------------- páginas ----------------
const SHIM = '<script src="/lsf-shim.js"></script>';
// O Pricer tem ~9 MB. Vai comprimido (gzip, ~1/5 do tamanho) e com ETag: o navegador guarda a cópia e, a cada visita,
// só pergunta se mudou (304 sem corpo). Como o acesso é conferido antes, quem não tem nível no Pricer continua sem recebê-lo.
let cachePricer = { mtime: 0, html: "", gz: null, etag: "" };
function htmlPricer() {
  const st = fs.statSync(PRICER_HTML);
  if (st.mtimeMs !== cachePricer.mtime) { const h = fs.readFileSync(PRICER_HTML, "utf-8"); const i = h.search(/<head[^>]*>/i);
    const html = i >= 0 ? h.replace(/<head[^>]*>/i, (m) => m + SHIM) : SHIM + h;
    cachePricer = { mtime: st.mtimeMs, html, gz: zlib.gzipSync(Buffer.from(html, "utf-8"), { level: 6 }), etag: '"' + crypto.createHash("sha1").update(html).digest("hex").slice(0, 20) + '"' }; }
  return cachePricer;
}
app.get(["/", "/index.html"], (req, res) => {
  if (!req.user) return res.redirect(302, "/login");
  if (nivelPricer(req.user) < 1) return res.redirect(302, perfilServico(req.user) ? "/servico/" : "/login?semacesso=1");
  if (!fs.existsSync(PRICER_HTML)) return res.status(503).send("O arquivo do Pricer ainda não foi copiado para servidor/app/pricer.html (veja INSTALACAO-TI.md).");
  const pc = htmlPricer();
  res.setHeader("Cache-Control", "private, no-cache"); res.setHeader("ETag", pc.etag); res.setHeader("Vary", "Accept-Encoding, Cookie");
  if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(pc.etag)) return res.status(304).end();
  res.type("html");
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) { res.setHeader("Content-Encoding", "gzip"); return res.send(pc.gz); }
  res.send(pc.html);
});
app.get("/login", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.sendFile(path.join(PUBLIC_DIR, "login.html")); });
app.use("/servico", express.static(path.join(PUBLIC_DIR, "servico"), { index: "index.html", maxAge: 0, setHeaders: (res, p) => { if (/sw\.js$|index\.html$|manifest/.test(p)) res.setHeader("Cache-Control", "no-cache"); } }));
app.get("/servico/*", (req, res, next) => { const f = path.join(PUBLIC_DIR, "servico", "index.html"); fs.existsSync(f) ? res.sendFile(f) : next(); });
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1h" }));
app.use("/api", (_req, res) => res.status(404).json({ error: "Endereço não encontrado." }));

export { app };
if (process.env.LSF_SEM_LISTEN !== "1") {
  const adm = usuarios.garantirAdmin();
  app.listen(PORT, () => {
    console.log(`\n  LS Fire (Pricer + Serviço) em http://localhost:${PORT}`);
    console.log(`  Dados: ${DATA_DIR}`);
    if (adm) console.log(`\n  PRIMEIRO ACESSO → login: ${adm.login}   senha: ${adm.senha}\n  (também gravada em data/SENHA-INICIAL.txt; troque no primeiro acesso e apague o arquivo)\n`);
    console.log(`  Backup: ${BACKUP_INTERVAL_HORAS > 0 ? "a cada " + BACKUP_INTERVAL_HORAS + "h, guarda " + BACKUP_MANTER : "DESLIGADO"} · limite ${RATE_LIMIT_MAX} req/min por IP`);
    console.log(`  Pricer: ${fs.existsSync(PRICER_HTML) ? "ok" : "FALTA app/pricer.html"} · Serviço: ${fs.existsSync(path.join(PUBLIC_DIR, "servico", "index.html")) ? "ok" : "FALTA public/servico (rode npm run build em servico-web)"}\n`);
  });
}
export { usuarios, banco };
