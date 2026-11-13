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
const PROIBIDOS = new Set(["__proto__", "constructor", "prototype"]);
export function caminhoValido(p) {
  if (typeof p !== "string" || !p || p.length > 600) return false;
  const seg = p.split("/");
  return seg.length <= 10 && seg.every((s) => /^[A-Za-z0-9_.~:@+\-]{1,180}$/.test(s) && s !== "." && s !== ".." && !PROIBIDOS.has(s));
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
// campos de valor: técnico e cliente não recebem; ao gravar, o servidor devolve o que estava guardado.
// Além do prefixo, pega nomes de dinheiro em qualquer posição (mensalidade, totalContrato, honorarioAnual, bdi...).
// "total" e "taxa" ficam de fora de propósito: o relatório do técnico grava contagens como stats.total, que não são dinheiro
// (no contrato, a lista abaixo já esconde qualquer total ou taxa).
const CAMPO_VALOR = /^(bdi|faturamento|reajuste)|(valor|preco|preço|custo|margem|desconto|mensalidade|honorario|imposto)/i;
// Contrato: o técnico e o cliente só leem e nunca gravam contratos, então ali vale uma lista do que PODEM ver
// (campo novo que alguém acrescentar fica escondido até entrar nesta lista).
const CONTRATO_VISIVEL = new Set(["id", "codigo", "codigoProvisorio", "cliente", "cnpj", "endereco", "local", "cidade", "uf", "contato", "telefone", "email",
  "tecnicoId", "dataInicio", "validade", "proximaVisita", "visitasAno", "duracaoMeses", "frequencias", "freqs", "equipamentos",
  "propostaUid", "propostaId", "propostaNumero", "origem", "status", "observacoes", "criadoPor", "criadoEm", "atualizadoEm"]);
// dentro do contrato (equipamentos etc.) o filtro é mais largo: o técnico não grava contrato, então nada se perde
const VALOR_AMPLO = /(valor|preco|preço|custo|margem|desconto|mensal|total|taxa|honorario|bdi|imposto|fatur|reajuste|maodeobra|mao_de_obra|pagamento|parcela|financeir)/i;
const semValoresAmplo = (x) => Array.isArray(x) ? x.map(semValoresAmplo)
  : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([k]) => !VALOR_AMPLO.test(k)).map(([k, v]) => [k, semValoresAmplo(v)])) : x;
const contratoSemValores = (c) => { const o = {}; for (const [k, v] of Object.entries(c || {})) if (CONTRATO_VISIVEL.has(k)) o[k] = semValoresAmplo(v); return o; };

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
    // o cliente só vê relatório aprovado (pendente ou devolvido ainda pode mudar)
    if (chave === "relatorios") return rec.contratoId === cid && stAprov(rec.aprovacao) === "aprovado";
    if (chave === "visitas") return rec.contratoId === cid;
    return false;
  }
  if (chave === "auditoria") return PERFIS_SERVICO[p].verAuditoria;
  return true;
}
export function paraEnvio(chave, rec, u) {
  if (podeServico(u, "verValores")) return rec;
  if (chave === "contratos") return contratoSemValores(rec);
  // cópia do relatório dentro da visita: para o cliente, só depois de aprovada
  if (chave === "visitas" && perfilServico(u) === "cliente" && rec && rec.relatorio && stAprov(rec.relatorio.aprovacao) !== "aprovado") { const { relatorio, ...resto } = rec; return semValores(resto); }
  return semValores(rec);
}

// quem pode criar/alterar/excluir registros de cada chave
export function regraGravacao(chave, u) {
  const p = perfilServico(u); const P = PERFIS_SERVICO[p] || {};
  if (!p || p === "cliente") return { criar: false, alterar: false, excluir: false };
  switch (chave) {
    case "contratos": return { criar: P.gerenciarContratos, alterar: P.gerenciarContratos, excluir: P.excluirRegistros };
    case "tecnicos": return { criar: P.gerenciarTecnicos, alterar: P.gerenciarTecnicos, excluir: P.gerenciarTecnicos && P.excluirRegistros };
    case "visitas": return { criar: P.agendar, alterar: P.agendar || P.inspecionar, excluir: P.excluirRegistros };
    case "relatorios": return { criar: P.inspecionar, alterar: P.inspecionar, excluir: P.excluirRegistros };
    case "auditoria": return { criar: true, alterar: false, excluir: false }; // o autor é carimbado pelo servidor (juntar)
    case "notificacoes": return { criar: true, alterar: true, excluir: P.excluirRegistros }; // quem não exclui só marca como lida (juntar)
    default: return { criar: false, alterar: false, excluir: false };
  }
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// registros novos de auditoria e avisos que um aparelho pode criar por sincronização (quem não administra): impede que
// um aparelho empurre milhares de registros falsos para tirar os verdadeiros da lista
export const MAX_NOVOS_POR_SINC = { auditoria: 300, notificacoes: 100 };
const stAprov = (a) => String((a && a.status) || "").trim().toLowerCase();
// relatório criado por quem não aprova: entra sempre pendente, sem nada de aprovação vindo do aparelho
const aprovacaoPendente = (agora) => ({ status: "pendente", solicitadoEm: agora, supervisor: "", assinatura: "", observacao: "", aprovadoEm: null });

// Junta o que o aparelho mandou (a lista inteira, como ele a vê) com o que o servidor tem, registro a registro (pelo id):
// - registro novo: entra se o perfil pode criar;
// - registro alterado: entra se o perfil pode alterar; valores escondidos e a aprovação (para quem não aprova) voltam ao guardado;
// - registro que sumiu da lista: só é excluído se o perfil pode excluir E o aparelho já o conhecia (existia antes da última sincronização dele);
// - registros que o perfil não enxerga ficam como estão.
// visita gravada por quem não aprova: a cópia do relatório dentro dela não leva aprovação escrita pelo aparelho
// (só pode voltar a pendente, no reenvio de um devolvido) e a visita não vira "concluida": isso só acontece na aprovação.
function visitaSemAprovacao(novo, atual, agora) {
  const antes = (atual && atual.relatorio && atual.relatorio.aprovacao) || null;
  const o = Object.assign({}, novo);
  // relatório já aprovado: a cópia dentro da visita não muda mais (é ela que o app mostra e imprime)
  if (stAprov(antes) === "aprovado") o.relatorio = atual.relatorio;
  else if (o.relatorio && typeof o.relatorio === "object") {
    const pede = stAprov(o.relatorio.aprovacao);
    const ap = antes && !(pede === "pendente" && stAprov(antes) === "devolvido") ? antes : Object.assign({}, antes || aprovacaoPendente(agora), { status: "pendente" });
    o.relatorio = Object.assign({}, o.relatorio, { aprovacao: ap });
  }
  if (String(o.status || "").trim().toLowerCase() === "concluida" && !(atual && atual.status === "concluida")) o.status = atual ? atual.status : "agendada";
  return o;
}

// registro de auditoria: quem fez é sempre quem está logado (o aparelho não escolhe o autor)
function carimbaAutor(rec, u) {
  if (!u) return rec;
  return Object.assign({}, rec, { usuario: u.nome || u.login, login: u.login, perfil: perfilServico(u), userId: u.id });
}

export function juntar(chave, guardados, recebidos, u, meta, { ultimaSinc, agora }) {
  if (!Array.isArray(recebidos)) return { lista: guardados, mudou: false, ignorados: 0 };
  const regra = regraGravacao(chave, u); const aprova = podeServico(u, "aprovarRelatorios"); const verVal = podeServico(u, "verValores");
  const porId = new Map(guardados.filter((r) => r && r.id != null).map((r) => [String(r.id), r]));
  const recebidosIds = new Set();
  let mudou = false, ignorados = 0, novos = 0, conflitos = 0;
  const limiteNovos = perfilServico(u) === "admin" ? Infinity : (MAX_NOVOS_POR_SINC[chave] ?? Infinity);
  const saida = guardados.slice();
  const idx = new Map(saida.map((r, i) => [String(r && r.id), i]));
  for (let rec of recebidos) {
    if (!rec || typeof rec !== "object" || rec.id == null) continue;
    const id = String(rec.id); recebidosIds.add(id);
    const atual = porId.get(id);
    if (!atual) {
      if (!regra.criar) { ignorados++; continue; }
      if (++novos > limiteNovos) { ignorados++; continue; }
      if (u && perfilServico(u) !== "admin" && !verVal) rec = semValores(rec);
      if (chave === "relatorios" && !aprova) rec = Object.assign({}, rec, { aprovacao: aprovacaoPendente(agora) });
      if (chave === "visitas" && !aprova) rec = visitaSemAprovacao(rec, null, agora);
      if (chave === "auditoria") rec = carimbaAutor(rec, u);
      saida.push(rec); idx.set(id, saida.length - 1); meta[id] = { cri: agora, upd: agora }; mudou = true; continue;
    }
    if (!visivel(chave, atual, u)) { ignorados++; continue; }
    let novo = verVal ? rec : repoeValores(atual, rec);
    if (igual(novo, atual)) continue;
    if (!regra.alterar) { ignorados++; continue; }
    // cópia velha: alguém alterou este registro depois da última sincronização deste aparelho. Aceitar a cópia dele
    // desfaria a alteração do outro sem ninguém ver; vale a do servidor e o aparelho recebe a versão nova na resposta.
    const m0 = meta[id];
    if (ultimaSinc && m0 && m0.upd && m0.upd > ultimaSinc) { ignorados++; conflitos++; continue; }
    // técnico só altera visita e relatório que são dele (ou ainda sem técnico)
    if (perfilServico(u) === "tecnico" && (chave === "visitas" || chave === "relatorios") && atual.tecnicoId != null && String(atual.tecnicoId) !== String(u.tecnicoId)) { ignorados++; continue; }
    if (chave === "auditoria") { ignorados++; continue; }
    if (chave === "relatorios" && !aprova) {
      // quem não aprova nunca escreve a aprovação: ela fica como o servidor tem. A única mudança aceita é o
      // reenvio de um relatório devolvido, que o servidor monta (volta a pendente e guarda a devolução no histórico).
      const st = stAprov(atual.aprovacao);
      if (st === "aprovado") { ignorados++; continue; } // aprovado não muda mais
      const a = atual.aprovacao || {};
      if (st === "devolvido" && stAprov(novo.aprovacao) === "pendente") {
        const hist = (Array.isArray(a.historico) ? a.historico : []).concat(a.motivo ? [{ motivo: a.motivo, devolvidoPor: a.devolvidoPor, devolvidoEm: a.devolvidoEm }] : []);
        novo = Object.assign({}, novo, { aprovacao: Object.assign({}, a, { status: "pendente", motivo: null, reenviadoEm: agora, historico: hist }) });
      } else novo = Object.assign({}, novo, { aprovacao: a });
    }
    if (chave === "visitas" && !aprova) novo = visitaSemAprovacao(novo, atual, agora);
    if (chave === "notificacoes" && !regra.excluir) {
      // quem não administra só pode se marcar como leitor; o resto da notificação fica como estava
      const meu = u && u.id; const antes = Array.isArray(atual.lidaPor) ? atual.lidaPor : [];
      const quer = Array.isArray(novo.lidaPor) && meu && novo.lidaPor.includes(meu) && !antes.includes(meu);
      if (!quer) { ignorados++; continue; }
      novo = Object.assign({}, atual, { lidaPor: antes.concat([meu]) });
    }
    if (igual(novo, atual)) continue;
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
  return { lista: saida, mudou, ignorados, conflitos };
}
