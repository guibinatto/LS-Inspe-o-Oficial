// Banco de documentos do Pricer no servidor, com o mesmo jeito do banco do claude.ai que o Pricer já usa:
// documento por caminho ("propostas/abc"), coleção = documentos logo abaixo de um caminho, consulta com where/orderBy/limit,
// trava curta (acquire) e um número de sequência que sobe a cada gravação (o navegador usa para atualizar a tela).
import path from "path";
import { lerJson, gravadorJson } from "./arquivo.js";

export function criarBanco(dataDir) {
  const ARQ = path.join(dataDir, "pricer-db.json");
  const salvo = lerJson(ARQ, { docs: {}, seq: 0 });
  const docs = new Map(Object.entries(salvo.docs || {}));
  let seq = salvo.seq || 0;
  const grava = gravadorJson(ARQ, () => ({ docs: Object.fromEntries(docs), seq }), 300);
  const travas = new Map();
  const mudancas = []; // [{seq, path}] últimas 2000
  const pai = (p) => p.split("/").slice(0, -1).join("/");
  const idDe = (p) => p.split("/").pop();
  const registra = (p) => { seq++; mudancas.push({ seq, path: p }); if (mudancas.length > 2000) mudancas.splice(0, mudancas.length - 2000); grava(); };

  const valor = (d, campo) => campo.split(".").reduce((o, k) => (o == null ? undefined : o[k]), d);
  const compara = (a, b) => (a === b ? 0 : a === undefined || a === null ? -1 : b === undefined || b === null ? 1 : a < b ? -1 : 1);
  const OPS = { "==": (a, b) => a === b, "!=": (a, b) => a !== b, "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b,
    in: (a, b) => Array.isArray(b) && b.includes(a), "array-contains": (a, b) => Array.isArray(a) && a.includes(b) };

  return {
    get(p) { const r = docs.get(p); return r ? { exists: true, id: idDe(p), data: r.d, ver: r.ver } : { exists: false, id: idDe(p), data: null }; },
    set(p, d, por) { const r = docs.get(p); docs.set(p, { d, ver: (r ? r.ver : 0) + 1, upd: new Date().toISOString(), by: por || null }); registra(p); return { ok: true }; },
    update(p, d, por) { const r = docs.get(p); const base = r ? r.d : {}; return this.set(p, Object.assign({}, base, d), por); },
    delete(p) { if (docs.delete(p)) registra(p); travas.delete(p); return { ok: true }; },
    query(col, { where = [], orderBy = [], limit = 0 } = {}) {
      let out = [];
      for (const [p, r] of docs) if (pai(p) === col) out.push({ id: idDe(p), path: p, data: r.d });
      for (const [campo, op, v] of where) { const f = OPS[op]; if (!f) throw Object.assign(new Error("Operador não suportado: " + op), { status: 400 }); out = out.filter((x) => f(valor(x.data, campo), v)); }
      if (orderBy.length) out.sort((a, b) => { for (const [campo, dir] of orderBy) { const c = compara(valor(a.data, campo), valor(b.data, campo)); if (c) return dir === "desc" ? -c : c; } return 0; });
      else out.sort((a, b) => (a.id < b.id ? -1 : 1));
      if (limit > 0) out = out.slice(0, limit);
      return out.map((x) => ({ id: x.id, data: x.data }));
    },
    acquire(p, holder, ttlMs) {
      const agora = Date.now(); const t = travas.get(p); ttlMs = Math.max(200, Math.min(Number(ttlMs) || 5000, 60000));
      if (!t || t.ate <= agora || t.holder === holder) { travas.set(p, { holder, ate: agora + ttlMs }); return { acquired: true, expiresAt: new Date(agora + ttlMs).toISOString() }; }
      return { acquired: false, expiresAt: new Date(t.ate).toISOString(), holder: t.holder };
    },
    mudancasDesde(n) {
      n = Number(n) || 0; if (n >= seq) return { seq, paths: [] };
      if (!mudancas.length || mudancas[0].seq > n + 1) return { seq, tudo: true };
      return { seq, paths: [...new Set(mudancas.filter((m) => m.seq > n).map((m) => m.path))] };
    },
    seq: () => seq,
    exportar: () => ({ docs: Object.fromEntries(docs), seq }),
    gravarJa: () => grava.agora(),
    arquivo: ARQ,
  };
}
