// Usuários e sessões do servidor LS Fire (Pricer + módulo de serviço).
// - Senha: scrypt (node:crypto) com salt aleatório por usuário; comparação em tempo constante.
// - Sessão: token aleatório de 32 bytes no cookie HttpOnly; no disco só fica o SHA-256 do token.
// - Bloqueio: 5 senhas erradas seguidas para o mesmo login travam esse login por 15 minutos.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { lerJson, gravadorJson } from "./arquivo.js";
import { NIVEL_PRICER, PERFIS_SERVICO } from "./acesso.js";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
// bloqueio por senha errada: 5 erros do mesmo endereço travam aquele login só para aquele endereço (quem erra a senha de
// outra pessoa não a tranca para fora); 25 erros somando todos os endereços travam o login para todos (ataque espalhado).
const MAX_FALHAS = 5, MAX_FALHAS_TOTAL = 25, BLOQUEIO_MS = 15 * 60 * 1000;

export function criarUsuarios(dataDir, { sessaoDias = 30 } = {}) {
  const ARQ_US = path.join(dataDir, "usuarios.json");
  const ARQ_SS = path.join(dataDir, "sessoes.json");
  const db = lerJson(ARQ_US, { usuarios: [] });
  const ss = lerJson(ARQ_SS, { sessoes: {} });
  const gravaUs = gravadorJson(ARQ_US, () => db, 50);
  const gravaSs = gravadorJson(ARQ_SS, () => ss, 1000);
  const falhas = new Map(); // login -> { n, ate }
  const SESSAO_MS = sessaoDias * 24 * 3600 * 1000;

  const hashSenha = (senha, salt) => crypto.scryptSync(String(senha), Buffer.from(salt, "hex"), SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString("hex");
  const credencial = (senha) => { const salt = crypto.randomBytes(16).toString("hex"); return { alg: "scrypt", salt, hash: hashSenha(senha, salt) }; };
  const confere = (u, senha) => {
    if (!u || !u.senha || u.senha.alg !== "scrypt") return false;
    const a = Buffer.from(hashSenha(senha, u.senha.salt), "hex"), b = Buffer.from(u.senha.hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
  const normLogin = (l) => String(l || "").trim().toLowerCase();

  function validarSenha(s) {
    s = String(s || "");
    if (s.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return "A senha precisa ter letras e números.";
    return "";
  }
  function limpo(u) {
    if (!u) return null;
    const { senha, ...resto } = u; return resto;
  }
  function validarCampos(d, atual) {
    const pricer = d.pricer ?? atual?.pricer ?? "nenhum";
    const servico = d.servico ?? atual?.servico ?? "nenhum";
    if (!(pricer in NIVEL_PRICER)) return "Nível do Pricer inválido.";
    if (servico !== "nenhum" && !PERFIS_SERVICO[servico]) return "Perfil de serviço inválido.";
    if (servico === "cliente" && pricer !== "nenhum") return "Usuário Cliente não pode ter acesso ao Pricer.";
    if (servico === "cliente" && !(d.clienteId ?? atual?.clienteId)) return "Usuário Cliente precisa estar ligado a um contrato.";
    if (pricer === "nenhum" && servico === "nenhum") return "O usuário precisa de acesso a pelo menos um módulo.";
    return "";
  }
  const nAdmins = () => db.usuarios.filter((u) => u.ativo && u.pricer === "admin").length;

  const api = {
    vazio: () => db.usuarios.length === 0,
    lista: () => db.usuarios.map(limpo),
    porId: (id) => db.usuarios.find((u) => u.id === id) || null,
    nomes(ids) { const out = {}; for (const id of ids || []) { const u = api.porId(id); if (u) out[id] = { name: u.nome || u.login }; } return out; },
    validarSenha,
    criar(d, por) {
      const login = normLogin(d.login);
      if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw erro(400, "Login: 3 a 40 caracteres (letras, números, ponto, hífen, sublinhado).");
      if (db.usuarios.some((u) => u.login === login)) throw erro(409, "Já existe um usuário com este login.");
      const e = validarCampos(d) || validarSenha(d.senha); if (e) throw erro(400, e);
      const u = { id: "u" + crypto.randomBytes(6).toString("hex"), login, nome: String(d.nome || login).slice(0, 80), email: String(d.email || "").slice(0, 120),
        pricer: d.pricer || "nenhum", servico: d.servico || "nenhum", tecnicoId: d.tecnicoId ?? null, clienteId: d.clienteId ?? null,
        ativo: true, trocarSenha: d.trocarSenha !== false, senha: credencial(d.senha), criadoEm: new Date().toISOString(), criadoPor: por || null };
      db.usuarios.push(u); gravaUs(); return limpo(u);
    },
    alterar(id, d, por) {
      const u = api.porId(id); if (!u) throw erro(404, "Usuário não encontrado.");
      const e = validarCampos(d, u); if (e) throw erro(400, e);
      const eraAdmin = u.ativo && u.pricer === "admin";
      const vaiSerAdmin = (d.ativo ?? u.ativo) && (d.pricer ?? u.pricer) === "admin";
      if (eraAdmin && !vaiSerAdmin && nAdmins() <= 1) throw erro(400, "Este é o último administrador ativo: crie outro antes de tirar o acesso.");
      for (const k of ["nome", "email", "pricer", "servico", "tecnicoId", "clienteId", "ativo"]) if (d[k] !== undefined) u[k] = d[k];
      if (d.senha) { const es = validarSenha(d.senha); if (es) throw erro(400, es); u.senha = credencial(d.senha); u.trocarSenha = true; api.encerrarSessoes(u.id); }
      if (d.ativo === false) api.encerrarSessoes(u.id);
      u.alteradoEm = new Date().toISOString(); u.alteradoPor = por || null; gravaUs(); return limpo(u);
    },
    trocarSenha(id, atual, nova) {
      const u = api.porId(id); if (!u) throw erro(404, "Usuário não encontrado.");
      if (!confere(u, atual)) throw erro(400, "Senha atual incorreta.");
      const e = validarSenha(nova); if (e) throw erro(400, e);
      if (atual === nova) throw erro(400, "A senha nova precisa ser diferente da atual.");
      u.senha = credencial(nova); u.trocarSenha = false; gravaUs(); return limpo(u);
    },
    entrar(login, senha, ip) {
      login = normLogin(login); const agora = Date.now();
      const kIp = login + "|" + String(ip || "?");
      const f = falhas.get(kIp), ft = falhas.get(login);
      if ((f && f.ate > agora) || (ft && ft.ate > agora)) throw erro(429, "Muitas tentativas. Tente de novo em alguns minutos.");
      const u = db.usuarios.find((x) => x.login === login);
      // compara mesmo sem usuário, para não revelar quais logins existem pelo tempo de resposta
      const ok = u ? confere(u, senha) : (hashSenha(senha, "00".repeat(16)), false);
      if (!ok || !u.ativo) {
        const conta = (x, max, k) => { const n = (x && !(x.ate && x.ate <= agora) ? x.n : 0) + 1; // depois que um bloqueio vence, recomeça a contar
          falhas.set(k, { n, ate: n >= max ? agora + BLOQUEIO_MS : 0 }); };
        conta(f, MAX_FALHAS, kIp); conta(ft, MAX_FALHAS_TOTAL, login);
        if (falhas.size > 20000) for (const [k, v] of falhas) if (!v.ate || v.ate <= agora) falhas.delete(k); // não cresce sem fim
        throw erro(401, "Login ou senha incorretos.");
      }
      falhas.delete(kIp);
      const token = crypto.randomBytes(32).toString("hex");
      ss.sessoes[sha(token)] = { userId: u.id, criada: agora, vista: agora };
      u.ultimoLogin = new Date(agora).toISOString(); gravaUs(); gravaSs();
      return { token, usuario: limpo(u) };
    },
    sessao(token) {
      if (!token) return null; const k = sha(token); const s = ss.sessoes[k]; if (!s) return null;
      const agora = Date.now();
      if (agora - s.vista > SESSAO_MS) { delete ss.sessoes[k]; gravaSs(); return null; }
      const u = api.porId(s.userId); if (!u || !u.ativo) { delete ss.sessoes[k]; gravaSs(); return null; }
      if (agora - s.vista > 60000) { s.vista = agora; gravaSs(); }
      return u;
    },
    sair(token) { if (token) { delete ss.sessoes[sha(token)]; gravaSs(); } },
    encerrarSessoes(userId) { for (const [k, s] of Object.entries(ss.sessoes)) if (s.userId === userId) delete ss.sessoes[k]; gravaSs(); },
    // primeiro uso: cria o administrador com senha aleatória (mostrada uma vez no console e gravada em data/SENHA-INICIAL.txt)
    garantirAdmin() {
      if (db.usuarios.length) return null;
      const senha = process.env.ADMIN_SENHA_INICIAL || (crypto.randomBytes(9).toString("base64url") + "7a");
      const u = api.criar({ login: "admin", nome: "Administrador", pricer: "admin", servico: "nenhum", senha, trocarSenha: true }, "instalação");
      try { fs.writeFileSync(path.join(dataDir, "SENHA-INICIAL.txt"), `login: admin\nsenha: ${senha}\n(troque no primeiro acesso e apague este arquivo)\n`, { mode: 0o600 }); } catch {}
      return { login: u.login, senha };
    },
    gravarJa() { gravaUs.agora(); gravaSs.agora(); },
  };
  return api;
}

export function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }
