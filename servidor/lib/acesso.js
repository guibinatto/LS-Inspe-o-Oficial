// Regras de acesso, aplicadas NO SERVIDOR (esconder botão na tela não é segurança).
//
// Cada usuário tem dois acessos independentes:
//   pricer:  nenhum | consulta | comercial | editor | admin
//   servico: nenhum | gestor | coordenador | supervisor | tecnico | cliente   (admin do Pricer = admin do serviço)
// Quem é só de Service / Assistência Técnica (pricer = nenhum) não recebe o arquivo do Pricer, não lê nem grava
// nada do banco do Pricer (propostas, preços, custos, margens) e, no módulo de serviço, não recebe valores de contrato.

export const NIVEL_PRICER = { nenhum: 0, consulta: 1, comercial: 2, editor: 3, admin: 4 };
export const NOME_PRICER = { nenhum: "Sem acesso", consulta: "Consulta (só leitura)", comercial: "Comercial (cria e edita propostas)", editor: "Editor (também altera cadastros)", admin: "Administrador" };

// mesma matriz do app de serviço (LSFireApp.jsx); admin = administrador do Pricer
export const PERFIS_SERVICO = {
  admin:       { nome: "Administrador",       verValores: true,  gerenciarContratos: true,  gerenciarTecnicos: true,  agendar: true,  inspecionar: true,  verRelatorios: true, verTecnicos: true,  verAuditoria: true,  excluirRegistros: true,  aprovarRelatorios: true },
  gestor:      { nome: "Gestor de serviços",  verValores: true,  gerenciarContratos: true,  gerenciarTecnicos: true,  agendar: true,  inspecionar: true,  verRelatorios: true, verTecnicos: true,  verAuditoria: true,  excluirRegistros: false, aprovarRelatorios: true },
  coordenador: { nome: "Coordenador técnico", verValores: true,  gerenciarContratos: false, gerenciarTecnicos: true,  agendar: true,  inspecionar: true,  verRelatorios: true, verTecnicos: true,  verAuditoria: true,  excluirRegistros: false, aprovarRelatorios: true },
  supervisor:  { nome: "Supervisor técnico",  verValores: true,  gerenciarContratos: false, gerenciarTecnicos: false, agendar: true,  inspecionar: true,  verRelatorios: true, verTecnicos: true,  verAuditoria: true,  excluirRegistros: false, aprovarRelatorios: true },
  tecnico:     { nome: "Técnico de campo",    verValores: false, gerenciarContratos: false, gerenciarTecnicos: false, agendar: true,  inspecionar: true,  verRelatorios: true, verTecnicos: true,  verAuditoria: false, excluirRegistros: false, aprovarRelatorios: false },
  cliente:     { nome: "Cliente",             verValores: false, gerenciarContratos: false, gerenciarTecnicos: false, agendar: false, inspecionar: false, verRelatorios: true, verTecnicos: false, verAuditoria: false, excluirRegistros: false, aprovarRelatorios: false },
};

export const nivelPricer = (u) => (u ? NIVEL_PRICER[u.pricer] || 0 : 0);
export const perfilServico = (u) => (!u ? null : u.pricer === "admin" ? "admin" : (u.servico && u.servico !== "nenhum" ? u.servico : null));
export const podeServico = (u, acao) => { const p = perfilServico(u); return !!(p && PERFIS_SERVICO[p] && PERFIS_SERVICO[p][acao]); };

// ---------------- banco do Pricer ----------------
// Espelha as regras do app publicado no claude.ai: ler = qualquer nível; gravar = Editor, exceto as coleções de
// trabalho do comercial (Contribuidor); meta/acessos só o administrador; assinaturas/{id} só o próprio usuário.
const COLECOES_COMERCIAL = new Set(["propostas", "documentos", "fechamentos", "pedidos", "historico", "aprovacoes", "revisoes", "pendencias", "modelos"]);
export function caminhoValido(p) {
  if (typeof p !== "string" || !p || p.length > 600) return false;
  const seg = p.split("/");
  return seg.length <= 10 && seg.every((s) => /^[A-Za-z0-9_.~:@+\-]{1,180}$/.test(s) && s !== "." && s !== "..");
}
export function podeLerPricer(u, p) { return nivelPricer(u) >= 1 && caminhoValido(p); }
export function podeGravarPricer(u, p) {
  const n = nivelPricer(u); if (n < 2 || !caminhoValido(p)) return false;
  const seg = p.split("/");
  if (p === "meta/acessos") return n >= 4;
  if (seg[0] === "assinaturas") return seg.length >= 2 && seg[1] === u.id;
  if (COLECOES_COMERCIAL.has(seg[0])) return true;
  return n >= 3;
}

// ---------------- dados do módulo de serviço ----------------
export const CHAVES_SERVICO = ["contratos", "tecnicos", "visitas", "relatorios", "auditoria", "notificacoes"];
// campos de valor: técnico e cliente não recebem; ao gravar, o servidor devolve o que estava guardado
const CAMPO_VALOR = /^(valor|preco|custo|margem|desconto)/i;

export function semValores(x) {
  if (Array.isArray(x)) return x.map(semValores);
  if (x && typeof x === "object") { const o = {}; for (const [k, v] of Object.entries(x)) if (!CAMPO_VALOR.test(k)) o[k] = semValores(v); return o; }
  return x;
}
export function repoeValores(guardado, novo) {
  if (Array.isArray(guardado) && Array.isArray(novo)) return novo.map((v, i) => repoeValores(guardado[i], v));
  if (guardado && novo && typeof guardado === "object" && typeof novo === "object" && !Array.isArray(guardado)) {
    const o = Object.assign({}, novo);
    for (const [k, v] of Object.entries(guardado)) { if (CAMPO_VALOR.test(k)) o[k] = v; else if (k in o) o[k] = repoeValores(v, o[k]); }
    for (const k of Object.keys(o)) if (CAMPO_VALOR.test(k) && !(k in guardado)) delete o[k];
    return o;
  }
  return novo;
}

// o que cada perfil enxerga
export function visivel(chave, rec, u) {
  const p = perfilServico(u); if (!p) return false;
  if (p === "cliente") {
    const cid = u.clienteId;
    if (chave === "contratos") return rec.id === cid;
    if (chave === "relatorios" || chave === "visitas") return rec.contratoId === cid;
    return false;
  }
  if (chave === "auditoria") return PERFIS_SERVICO[p].verAuditoria;
  return true;
}
export function paraEnvio(chave, rec, u) { return podeServico(u, "verValores") ? rec : semValores(rec); }

// quem pode criar/alterar/excluir registros de cada chave
export function regraGravacao(chave, u) {
  const p = perfilServico(u); const P = PERFIS_SERVICO[p] || {};
  if (!p || p === "cliente") return { criar: false, alterar: false, excluir: false };
  switch (chave) {
    case "contratos": return { criar: P.gerenciarContratos, alterar: P.gerenciarContratos, excluir: P.excluirRegistros };
    case "tecnicos": return { criar: P.gerenciarTecnicos, alterar: P.gerenciarTecnicos, excluir: P.gerenciarTecnicos && P.excluirRegistros };
    case "visitas": return { criar: P.agendar, alterar: P.agendar || P.inspecionar, excluir: P.excluirRegistros };
    case "relatorios": return { criar: P.inspecionar, alterar: P.inspecionar, excluir: P.excluirRegistros };
    case "auditoria": return { criar: true, alterar: false, excluir: false };
    case "notificacoes": return { criar: true, alterar: true, excluir: true };
    default: return { criar: false, alterar: false, excluir: false };
  }
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Junta o que o aparelho mandou (a lista inteira, como ele a vê) com o que o servidor tem, registro a registro (pelo id):
// - registro novo: entra se o perfil pode criar;
// - registro alterado: entra se o perfil pode alterar; valores escondidos e a aprovação (para quem não aprova) voltam ao guardado;
// - registro que sumiu da lista: só é excluído se o perfil pode excluir E o aparelho já o conhecia (existia antes da última sincronização dele);
// - registros que o perfil não enxerga ficam como estão.
export function juntar(chave, guardados, recebidos, u, meta, { ultimaSinc, agora }) {
  if (!Array.isArray(recebidos)) return { lista: guardados, mudou: false, ignorados: 0 };
  const regra = regraGravacao(chave, u); const aprova = podeServico(u, "aprovarRelatorios"); const verVal = podeServico(u, "verValores");
  const porId = new Map(guardados.filter((r) => r && r.id != null).map((r) => [String(r.id), r]));
  const recebidosIds = new Set();
  let mudou = false, ignorados = 0;
  const saida = guardados.slice();
  const idx = new Map(saida.map((r, i) => [String(r && r.id), i]));
  for (let rec of recebidos) {
    if (!rec || typeof rec !== "object" || rec.id == null) continue;
    const id = String(rec.id); recebidosIds.add(id);
    const atual = porId.get(id);
    if (!atual) {
      if (!regra.criar) { ignorados++; continue; }
      if (u && perfilServico(u) !== "admin" && !verVal) rec = semValores(rec);
      if (chave === "relatorios" && !aprova) rec = Object.assign({}, rec, { aprovacao: Object.assign({}, rec.aprovacao || {}, { status: "pendente", aprovadoEm: null, supervisor: rec.aprovacao && rec.aprovacao.supervisor && rec.aprovacao.status === "pendente" ? rec.aprovacao.supervisor : "" }) });
      saida.push(rec); idx.set(id, saida.length - 1); meta[id] = { cri: agora, upd: agora }; mudou = true; continue;
    }
    if (!visivel(chave, atual, u)) { ignorados++; continue; }
    let novo = verVal ? rec : repoeValores(atual, rec);
    if (igual(novo, atual)) continue;
    if (!regra.alterar) { ignorados++; continue; }
    if (chave === "auditoria") { ignorados++; continue; }
    if (chave === "relatorios" && !aprova) {
      const st = (atual.aprovacao || {}).status;
      if (st === "aprovado") { ignorados++; continue; } // aprovado não muda mais
      const nst = (novo.aprovacao || {}).status;
      if (nst === "aprovado" || (nst === "devolvido" && st !== "devolvido")) novo = Object.assign({}, novo, { aprovacao: atual.aprovacao });
    }
    saida[idx.get(id)] = novo; meta[id] = Object.assign({}, meta[id], { upd: agora }); mudou = true;
  }
  // exclusões
  if (ultimaSinc) {
    for (let i = saida.length - 1; i >= 0; i--) {
      const r = saida[i]; if (!r || r.id == null) continue; const id = String(r.id);
      if (recebidosIds.has(id) || !visivel(chave, r, u)) continue;
      const m = meta[id] || {};
      if (m.cri && m.cri > ultimaSinc) continue; // o aparelho ainda não conhecia este registro
      if (!regra.excluir) { ignorados++; continue; }
      saida.splice(i, 1); delete meta[id]; mudou = true;
    }
  }
  return { lista: saida, mudou, ignorados };
}
