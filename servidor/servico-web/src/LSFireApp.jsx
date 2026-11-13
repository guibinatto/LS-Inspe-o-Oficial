"use client";

import { useState, useMemo, useEffect, useRef, useId, createContext, useContext, Fragment } from "react";
import {
  Home, FileText, Calendar, Users, ClipboardList, ClipboardCheck,
  Plus, X, ChevronRight, ChevronDown, ChevronLeft, MoreVertical,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Search,
  Flame, Wrench, Truck, MessageSquare, PenLine,
  ArrowLeft, Building2, User, Camera,
  Printer, Trash2, Eye, MapPin, Phone, Clock, DollarSign,
  CalendarDays, Pencil, Save, FilePlus2, History,
  LogOut, Shield, ShieldCheck, UserCog, ScrollText,
  Wifi, WifiOff, RefreshCw, Menu, Bell
} from "lucide-react";

const STORAGE_PREFIX = "lsfire:";
const OFFLINE_DB_NAME = "lsfire-offline-v1";
const KV_STORE = "kv";
const SYNC_STORE = "syncQueue";
const SYNC_META_KEY = "sync_meta";
const DEVICE_ID_KEY = "device_id";
const SYNCABLE_KEYS = new Set(["contratos", "tecnicos", "visitas", "relatorios", "auditoria", "notificacoes"]);
// Módulo integrado ao LS Pricer (servidor LS Fire): o login, os usuários e as permissões são do servidor.
// O servidor filtra o que cada perfil recebe (técnico não recebe valores; cliente só o contrato dele) e
// confere o que cada perfil pode gravar. Os cabeçalhos abaixo vão em toda chamada à API.
const API_HEADERS = { "Content-Type": "application/json", "X-LSF": "1" };
const ME_CACHE_KEY = "lsfire:me";
// último usuário que usou este aparelho: se outro entrar, os dados locais do anterior são apagados antes de carregar
const ULTIMO_USUARIO_KEY = "lsfire:ultimo_usuario";
// evento avisado a cada mudança que entra na fila de envio (o app sincroniza logo depois, com espera de ~2 s)
const EVENTO_FILA = "lsf-fila";
function irParaLogin() { if (typeof window !== "undefined" && window.__LSF_CLAUDE) return; try { window.top.location.replace("/login?volta=" + encodeURIComponent("/servico/")); } catch { window.location.replace("/login?volta=/servico/"); } }

// Texto que vai dentro de HTML montado à mão (impressão do relatório): nada do usuário vira marcação.
function escHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Datas "do dia" no fuso do aparelho (toISOString() é UTC: depois das 21h no Brasil já virava o dia seguinte).
const pad2 = (n) => String(n).padStart(2, "0");
function isoLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function hojeLocal() { return isoLocal(new Date()); }
// Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 mês = 28/02, não 03/03).
function addMesesLocal(data, meses) {
  const y = data.getFullYear(), m = data.getMonth() + meses;
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(data.getDate(), ultimoDia));
}


// Pede ao SERVIDOR o próximo número da série (atendimento/700000 ou
// contrato/200000). O servidor garante que o número nunca se repete mesmo com
// vários dispositivos criando registros ao mesmo tempo — algo que a
// numeração só-local (gerada no próprio celular) não consegue garantir.
// Retorna null se estiver offline ou o servidor não responder a tempo; quem
// chama deve então usar o número local provisório como reserva.
async function alocarNumeroServidor(tipo) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch("/api/allocate-number", {
      method: "POST",
      credentials: "same-origin",
      headers: API_HEADERS,
      body: JSON.stringify({ tipo }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.numero || null;
  } catch {
    return null; // offline, servidor fora do ar, ou demorou demais — segue com o provisório
  }
}

// Gera a referência de um atendimento: tenta o servidor primeiro (número
// definitivo). Se estiver offline, usa numeração local PROVISÓRIA — marcada
// com `provisorio: true` para a UI avisar e para ser trocada pelo número
// definitivo automaticamente na próxima sincronização.
async function gerarReferenciaAtendimento() {
  const doServidor = await alocarNumeroServidor("atendimento");
  if (doServidor) return { numero: doServidor, provisorio: false };
  return { numero: nextAtendimentoRef(), provisorio: true };
}
async function gerarReferenciaContrato() {
  const doServidor = await alocarNumeroServidor("contrato");
  if (doServidor) return { numero: doServidor, provisorio: false };
  return { numero: nextContratoRef(), provisorio: true };
}

const ATENDIMENTO_SEQ_KEY = "lsfire:atendimento_seq";
const PRIMEIRO_ATENDIMENTO_REF = 700000;

function nextAtendimentoRef() {
  if (typeof window === "undefined") return String(Date.now());
  const raw = window.localStorage.getItem(ATENDIMENTO_SEQ_KEY);
  const atual = Number(raw || PRIMEIRO_ATENDIMENTO_REF - 1);
  const proximo = Number.isFinite(atual) && atual >= PRIMEIRO_ATENDIMENTO_REF ? atual + 1 : PRIMEIRO_ATENDIMENTO_REF;
  window.localStorage.setItem(ATENDIMENTO_SEQ_KEY, String(proximo));
  return String(proximo);
}

function ensureAtendimentoRef(obj = {}) {
  const ref = obj.referencia || obj.codigoAtendimento || obj.codigo || nextAtendimentoRef();
  return { ...obj, referencia: ref, codigoAtendimento: ref };
}

const CONTRATO_SEQ_KEY = "lsfire:contrato_seq";
const PRIMEIRO_CONTRATO_REF = 200000;

function nextContratoRef() {
  if (typeof window === "undefined") return String(Date.now());
  const raw = window.localStorage.getItem(CONTRATO_SEQ_KEY);
  const atual = Number(raw || PRIMEIRO_CONTRATO_REF - 1);
  const proximo = Number.isFinite(atual) && atual >= PRIMEIRO_CONTRATO_REF ? atual + 1 : PRIMEIRO_CONTRATO_REF;
  window.localStorage.setItem(CONTRATO_SEQ_KEY, String(proximo));
  return String(proximo);
}

function ensureContratoRef(obj = {}) {
  return { ...obj, codigo: obj.codigo || nextContratoRef() };
}

// Fonte única de verdade para "quem pode apagar registros": lê da tabela
// PERMISSOES (campo excluirRegistros) em vez de comparar o nome do perfil
// diretamente. Assim, mudar quem pode excluir é sempre uma edição na tabela
// PERMISSOES — nunca fica um segundo lugar hardcoded para lembrar de mudar.
function isAdminProfile(perfil) {
  return can(perfil, "excluirRegistros");
}


if (typeof window !== "undefined" && !window.storage) {
  let dbPromise = null;

  const localKey = (key) => `${STORAGE_PREFIX}${key}`;

  const openOfflineDb = () => {
    if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB indisponivel"));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(OFFLINE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: "key" });
          if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE, { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba"));
      });
    }
    return dbPromise;
  };

  const withStore = async (storeName, mode, operation) => {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  };

  const idbGet = (storeName, key) => withStore(storeName, "readonly", (store) => store.get(key));
  const idbGetAll = (storeName) => withStore(storeName, "readonly", (store) => store.getAll());
  const idbPut = (storeName, record) => withStore(storeName, "readwrite", (store) => store.put(record));
  const idbDelete = (storeName, key) => withStore(storeName, "readwrite", (store) => store.delete(key));

  const getLocalQueue = () => {
    try { return JSON.parse(window.localStorage.getItem(localKey("syncQueue")) || "{}"); }
    catch { return {}; }
  };

  const setLocalQueue = (queue) => {
    try { window.localStorage.setItem(localKey("syncQueue"), JSON.stringify(queue)); } catch {}
  };

  // Os dados ficam no IndexedDB. O localStorage só guarda uma cópia quando o IndexedDB não funciona neste
  // navegador (assim o modo offline continua valendo); cópias antigas são apagadas quando o IndexedDB responde.
  const tiraCopiaLocal = (key) => { try { window.localStorage.removeItem(localKey(key)); } catch {} };

  const readKv = async (key) => {
    try {
      const stored = await idbGet(KV_STORE, key);
      if (stored) { tiraCopiaLocal(key); return stored; }
    } catch {}

    let legacy = null;
    try { legacy = window.localStorage.getItem(localKey(key)); } catch {}
    if (legacy == null) return null;

    try { await idbPut(KV_STORE, { key, value: legacy, updatedAt: new Date().toISOString() }); tiraCopiaLocal(key); } catch {}
    return { key, value: legacy };
  };

  const avisaFila = () => { try { window.dispatchEvent(new CustomEvent(EVENTO_FILA)); } catch {} };

  const enqueueSync = async (key, value, action = "set") => {
    if (!SYNCABLE_KEYS.has(key)) return;
    const record = { key, value, action, updatedAt: new Date().toISOString(), attempts: 0 };
    try {
      await idbPut(SYNC_STORE, record);
    } catch {
      const queue = getLocalQueue();
      queue[key] = record;
      setLocalQueue(queue);
    }
    avisaFila();
  };

  const mesmoItem = (a, b) => !!a && !!b && a.updatedAt === b.updatedAt && a.value === b.value && (a.action || "set") === (b.action || "set");

  // Tira da fila só o que foi enviado: se a chave ganhou uma edição nova durante o envio, ela fica para a próxima rodada.
  const clearSyncItemSeIgual = async (enviado) => {
    try {
      const db = await openOfflineDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STORE, "readwrite");
        const store = tx.objectStore(SYNC_STORE);
        const req = store.get(enviado.key);
        req.onsuccess = () => { if (mesmoItem(req.result, enviado)) store.delete(enviado.key); };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      const queue = getLocalQueue();
      if (mesmoItem(queue[enviado.key], enviado)) { delete queue[enviado.key]; setLocalQueue(queue); }
    }
  };

  // Grava a versão do servidor só se a chave não ganhou edição nova durante o envio (na mesma transação que confere a fila).
  // Devolve false quando deixou a cópia local como estava.
  const gravaDoServidor = async (key, value, enviado) => {
    try {
      const db = await openOfflineDb();
      return await new Promise((resolve, reject) => {
        let gravou = false;
        const tx = db.transaction([KV_STORE, SYNC_STORE], "readwrite");
        const req = tx.objectStore(SYNC_STORE).get(key);
        req.onsuccess = () => {
          const atual = req.result;
          if (atual && !mesmoItem(atual, enviado)) return; // pendência nova: não sobrescreve
          tx.objectStore(KV_STORE).put({ key, value, updatedAt: new Date().toISOString() });
          gravou = true;
        };
        tx.oncomplete = () => { if (gravou) tiraCopiaLocal(key); resolve(gravou); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {
      const atual = getLocalQueue()[key];
      if (atual && !mesmoItem(atual, enviado)) return false;
      try { window.localStorage.setItem(localKey(key), value); } catch {}
      return true;
    }
  };

  const getQueue = async () => {
    try { return await idbGetAll(SYNC_STORE); }
    catch { return Object.values(getLocalQueue()); }
  };

  const setKv = async (key, value, options = {}) => {
    const { enqueue = true } = options;
    const current = await readKv(key);
    const changed = current?.value !== value;

    try { await idbPut(KV_STORE, { key, value, updatedAt: new Date().toISOString() }); tiraCopiaLocal(key); }
    catch { try { window.localStorage.setItem(localKey(key), value); } catch {} } // sem IndexedDB: guarda aqui para o modo offline

    if (enqueue && changed) await enqueueSync(key, value);
    return { ok: true };
  };

  const getDeviceId = () => {
    try {
      let id = window.localStorage.getItem(localKey(DEVICE_ID_KEY));
      if (!id) {
        id = window.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        window.localStorage.setItem(localKey(DEVICE_ID_KEY), id);
      }
      return id;
    } catch {
      return `device-${Date.now()}`;
    }
  };

  const getSyncMeta = async () => {
    const raw = await readKv(SYNC_META_KEY);
    if (!raw?.value) return {};
    try { return JSON.parse(raw.value); } catch { return {}; }
  };

  const syncUmaVez = async () => {
    const pending = await getQueue();
    if (!navigator.onLine) return { ok: false, offline: true, pending: pending.length };
    const meta = await getSyncMeta();
    const initialSnapshot = [];

    if (!pending.length && !meta.lastSync) {
      for (const key of SYNCABLE_KEYS) {
        const record = await readKv(key);
        if (record?.value != null) {
          initialSnapshot.push({
            key,
            value: record.value,
            action: "set",
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const changes = pending.length
      ? pending.map((item) => ({
          key: item.key,
          value: item.value,
          action: item.action || "set",
          updatedAt: item.updatedAt,
        }))
      : initialSnapshot;

    const response = await fetch("/api/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: API_HEADERS,
      body: JSON.stringify({
        deviceId: getDeviceId(),
        lastSync: meta.lastSync || null,
        changes,
      }),
    });

    if (response.status === 401) { irParaLogin(); throw new Error("Sessão expirada: entre de novo."); }
    if (!response.ok) throw new Error(`Falha na sincronizacao (${response.status})`);

    const payload = await response.json();
    const enviados = new Map(pending.map((item) => [item.key, item]));
    const adiadas = [];
    if (payload?.data) {
      for (const [key, item] of Object.entries(payload.data)) {
        if (!SYNCABLE_KEYS.has(key)) continue;
        const gravou = await gravaDoServidor(key, item.value, enviados.get(key));
        if (!gravou) adiadas.push(key);
      }
    }

    await Promise.all(pending.map((item) => clearSyncItemSeIgual(item)));
    const lastSync = payload?.serverTime || new Date().toISOString();
    await setKv(SYNC_META_KEY, JSON.stringify({ lastSync }), { enqueue: false });
    if (adiadas.length) avisaFila(); // edições feitas durante o envio: vão na próxima rodada
    return { ok: true, pending: (await getQueue()).length, lastSync, adiadas };
  };

  // um envio por vez: quem pedir enquanto um está em andamento recebe o mesmo resultado
  let syncEmCurso = null;
  const syncNow = () => {
    if (!syncEmCurso) syncEmCurso = syncUmaVez().finally(() => { syncEmCurso = null; });
    return syncEmCurso;
  };

  // Apaga tudo o que o serviço guardou neste aparelho (dados, fila de envio e metadados), menos a identificação do
  // aparelho e a numeração provisória. Usado ao sair e quando outro usuário entra no mesmo aparelho.
  const limparDados = async () => {
    try {
      const db = await openOfflineDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([KV_STORE, SYNC_STORE], "readwrite");
        tx.objectStore(KV_STORE).clear();
        tx.objectStore(SYNC_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch {}
    try {
      const manter = new Set([localKey(DEVICE_ID_KEY), ATENDIMENTO_SEQ_KEY, CONTRATO_SEQ_KEY, ULTIMO_USUARIO_KEY]);
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX) && !manter.has(k)) window.localStorage.removeItem(k);
      }
    } catch {}
  };

  window.offlineSync = {
    syncNow,
    getQueue,
    limparDados,
    async getStatus() {
      const queue = await getQueue();
      const meta = await getSyncMeta();
      return {
        online: navigator.onLine,
        pending: queue.length,
        lastSync: meta.lastSync || null,
      };
    },
  };

  window.storage = {
    async get(key) {
      const record = await readKv(key);
      return record?.value == null ? null : { value: record.value };
    },
    async set(key, value, options) {
      return setKv(key, value, options);
    },
    async delete(key) {
      try { await idbDelete(KV_STORE, key); } catch {}
      tiraCopiaLocal(key);
      if (SYNCABLE_KEYS.has(key)) await enqueueSync(key, "", "delete");
      return { ok: true };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGO LS FIRE
// ═══════════════════════════════════════════════════════════════════════════
const LOGO_LSFIRE_DATAURL = "data:image/jpeg;base64,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";

const LOGO_LSFIRE_ESCURO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAooAAAD6CAYAAAAmyWZkAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAAHdElNRQfqCh0LATZJPE6eAABQd0lEQVR42u29e5grV3nm+y6D8fYlae1t+RZitxxIZsBAy0C4hCgt50YSkrR8Js85T2ZMWhvCYHKZLYe5ZDIwu/ZAMp6ck7F2MgmQC1s9MJPzzEmCdhiSySQzVqe4X2w1l5MzicFqGxIM5W2J4AsQs84ftUpaVbXqpkuVpH5/z9NuValqrW+tknu/+tb6vk9IKUEIIYQQQkiQi4o2gBBCCCGELCcUioQQQgghxAiFIiGEEEIIMUKhSAghhBBCjFAoEkIIIYQQIxSKhBBCCCHECIUiIYQQQggxQqFICCGEEEKMUCgSQgghhBAjFIqEEEIIIcQIhSIhhBBCCDFCoUjWGnvrumrRNhBCCCGrCoUiWXd69tZ19aKNIIQQQlYRCkWytthb1zUAbACwiraFEEIIWUUoFMk601C/t+lVJIQQQrJDoUjWEnvruhKAXe1Uq2ibCCGEkFWDQpGsK63A8Y69dV2laKMIIYSQVYJCkawdypvYMrxVL9o2QgghZJWgUCTrSAtuEEuQRtGGEUIIIasEhSJZK2K8iQA9ioQQQkgmKBTJumHB7E0EgA3uUySEEELSQ6FI1gZVheVUwmXVou0khBBCVgUKRbJOtFNcUy3aSEIIIWRVoFAka4G9dV0LwHaKS0tF20oIIYSsChSKZOVR+w6tlJdXi7aXEEIIWRUoFMk60EF0AAshhBBCpoRCkaw0761e14JIteTsUSraZkIIIWRVoFA8wnz4ZVdXP/yyq/tF2zEt761eVwVwlwAAkfq2raLtJoQQQlYFCsUjyodfdlULkD2sqHB6783XliDQ9Y7HYjG9YCSEEEJIAk8t2gCSLx/+zqtKADoQ2IEE4P5nFekCchNCjIcgvNGMXxBCCCFkFigUjxAf/s6rqgC6ADYBrKygeu/zr+1gnApHAkJMXoJikRBCCJkXXHo+InykdlVLCNwrhBKJHgL7RduWhfc9/9qWAHb9S8yaSxHaCjSXoQkhhJCZoEdxzfnId11VgluxZNc7JwQgJ962YdE2puV9z7+2CeAuQDkMPSGoL6EHl6LDnsWDosdBCCGErAoUimvMR76rXAVEB8BWcClWE4u9ou1Mw/tecG0TAud8Y4BpmVmaxSLG1wyLHgshhBCyKnDpeU356Ha5IQR6gJxENQeWYtXWvl7Rtibxvhdc2wRwzjgGmJaZpe9YhF4QQgghJA0UimvIR7fLLQDvArDhisGAG27C4Yve+8V+0fbG8f4XXtMUQolE8xgmp0xiUQRuEfQoEkIIIWmhUFwzPlovdyDcfXweMWKxW7S9cbz/hde0AZwD5Diw2TcGg3cxRZBLv+hxEUIIIasC9yiuCR+rl0twl5HdpWbjnkTvhPDEU7tou028/9uvKQFoQ2BX33sohNCDcMZDCe1bTAhyIYQQQkg6KBTXgI/dUq5C5Uf06abIABYJQOx/+59/cVC07UE+8KJrKgLoSqPgdcUiAL9gNIlFw71KLPaKHiMhhBCyKnDpecVRIrEHLT+ib/XVEMCilqKtom0P8oEXXdMA0IfAlm9l2Xcgx+PwDyx8GLFvcVj0OAkhhJBVQUjJ9bhV5WPffWUTUpwLvSENL/2P+fwL951G0fZ7fODF15QAdCCxYxqHNJxzMSxFGz7O+gr0d977ecY+E0IIISmhR3FFuee7r2wK4ByEQRlFpYZxD0YAWkXb7/HBF1/TADAAsIOIgJVoD2nmIBcm2yaEEEIywD2KK8g933OlBeA04AVveK63gEKUoZeAgPXCnjMoegwffMnVVbgBK9tC2R1Zo1kAQkbtvcwU5NIvetyEEELIKkGhuGLc8z1XduDVOg4KQSGTxOL+C3tOu0j7P/jSqysALGglBT27fUEogF8wphCLQGKQS7/IsRNCCCGrBoXiCnHP9yqR6KEJqvHLaLE4EkCjKNs/9NKr6wCaY/uDnsOgWDReg/FKe1hQSgAiWMc62EavqPETQgghqwiDWVaEe5VIjAhOCQewSN9GvRGA+gvudvp52vyh77i6AlectiAnUdnRwSneORF/zXRBLqOX3fP5Up7jJ4QQQlYdehRXgHu/b+JJNOcIRHiZ2e9ZbOUlEj/8squqAOqAaMLLhegZBfi9n6ZxAICQELpY9F8zgsCGuiz9vkWx3FVoCCGEkGWEHsUl597vO9EBxGS5OehNS/IsAiNI0QcwhLtHbwg53qs3eMEMgS0fqV1VlxIlAFUAdQBVSFfEuRj2DZptjBhLyLM4grt8/S79npSexVtf9rHPd6cdKyGEEHIUoVBcYvrff6IpJVSeRG0pObTMHLjRmEdRJF8D7Afbkj6XHQCgoi8j+68JNzgPsahOH8Jdxm5AuhHf+j1xYhHA6Ds+ymVnQgghJCtcel5S+t9/ogngnJcn0BX06iC0zIzwMjSQNshFf7ltKvsX1793jYzoP02QSXwAiwSk2BdA4yUfemj4gRdf000V5OJzuYpuTo+NEEIIWSsoFJeQ/stPVAHPk+jiCq0EsQggw77FkKCMFGsJ/U/eDwxkfI1Xdk9kFYsjAO2XfOghCwA++OJrWoDyZkbs0TSn2JHthT4wQgghZE3h0vOS0X/5iQrcvYTuXj/jUnDMMrThnoSI6Oh2MvbvvyaqDUNEsrn/PUhYL/ngFwbAOEF3D1JsJEdN+5fTv+MjD9VBCCGEkMzQo7hEHLz8REkAXQktIMTouZOTN01ewTQR0UDaSi7J/Ru9j+b+E5JjjwB0BWC9+AOuQAQ0kQhsJERET8yaiMXWop8bIYQQsq5QKC4TAm1IbIW0T+Qyb3gpeLInEfFiEUhTySVd/4Zl7ySxqO1bHMEVgV0IdF/8/i8M9aF/8KVXVyHQ80VTK7E47jK6ksvZl37koX5ej48QQghZNygUl4SDHzjeAMRuaK+dR8YgkzkHuWTu37vGEOQyctPzyB4gei9+/xd6UXPyoZde3QTQBrAxRSWXQwhYC3pchBBCyJGAexSXgIMfPF5RuQ03gvv/Qk8nck/g4vYtJu0J1PofAehr1/QBDKXEAMAAQP9F7/3iMGk+PvQdV5cg0QGwk6b/iEouN7/0w/QmEkIIIbNAj+Jy0PaqjSDgoRPS4FkEIvYNRngWA+eM1wQ9i9o16uxIAn0IJfrkOIE3vv3Pnd68JuJD36G8iGISzDNFJZeTL/0QRSIhhBAyK/QoFszHf/B4HcDdYY9YgmdxfJ12GE6OPU0lF0CKfbgisA9g8IK75ycEo/jwy66qA6INYGvGSi5nXqrS6RBCCCFkNuhRLBqBDmCqWxz2LAILCXI5hEQPQE8A/ef/z4f7eQ7/w995VR0SFoDtOSTn3nvpB79g5Wk/IYQQss5QKBbIx3/oeBNaAmmzWPTexLyCXEbSjSLuAug9/388PChi7B/+zqvqgBKI86nkcuYlFImEEELIXKFQLBIBy1SKLiyC/GlojPsW4yupjCDQhUT35j97uFvkkD9ScwWiENieYyWXky/5wBc6RY6LEEIIWUcoFAviE69Q3sTUdYunCnI5L6Xs3vynFzpFj/cj33VVE0ATwLZmn2tyQnLuqDrSwo2yrr/4A1/oFz0+QgghZB2hUCyOVlJy7HDd4gSx6J4fqdQy7ep/vzAoepAf3S43pbsHcXPOlVz2IdF48Qf8CboJIYQQMj8Y9VwAn/jh41UA94ZzGRouDorBiJyJ0vWutQG0q39yYVjk+D5aL5cg0YJbPm8DiI/IHh8m1IhW14wAWC9+/xfaRY6REEIIOQrQo1gIsgVAudLcM8ZKKuqNhCCXESTaAmhvFSwQP1YvV6QrDpsQ2EgbkR2+Rhurd4t7374QaL7ofZM60IQQQghZHBSKxdBwf0mzWFRvjYkOcjkPiNbWnxS7xPyxW8oVuBHMu3Mv++decwiJ1ove94VukeMkhBBCjhoUijnzyR8pNfzeNoNY9L3A+A0tyOUQAs2tP36kV+RYPnZLuQ43QGVXNz5USWV8oIYiksUiMF5mbr/ovV+0ihwnIYQQclShUMyfRniZWWrqKDY5NiBxXgDN5/3xI8OiBnDPd19ZhVtmb3tiqM/G4MsIz2E4T6RiBKAtBNrfbifXhiaEEELIYqBQzJ86YNqTqOVKjN63ePJ5f/xIpyjD7/meKytQS8xj+wC1Lj6tWPSN3Q3IkRSIhBBCyDLAqOcc+eSPliqQuF8/Z67BLBCIiB5Bov68P3qkX4Td93zvlSVItOEtMRtsdvWeQOz7xoPJEjMg2t/+5xSIhBBCyLJAj2K+1ENeNZj2JPr2LY4EUH9uQSLx3u+9siUASwaimP3Ge95Pg2fRGw6MnsVDuEvMnRfuO8MixkcIIYSQaCgU86UKACaxCBj3LY4gUX/ue/IXifd+35V1uHkZt8YmR0Rkx4pF7Rrt9kMIWC/sOZ28x0UIIYSQ9FAo5kt1/MpUoQQ+sTgCZP257xn28zSw//0nSqqSyim9vnSoUkySWARM+xb3AVgv7Dm9PMdECCGEkOmgUMwRIbAdnVB6ckqJxfpz/2vuIrEKoCMEtqKSYyeVHfS9nHgX9wB0XkCBSAghhKwUFIo58amdjRIACCFMCaWDYvHkc/IWiS8/0QRwbmxDQnJsYyWZgPcRwJ4U0nrB/3x4kOdYCCGEEDIfKBTzo+r+khBiXLd4wkR0nX/Ou4edPA3rv/xEB8CucTlcZBSL7ht7kLCeT4FICCGErDQUinkRrltsqm18CIlmXiYd/MCJEiQ6AHbMdqpTacSie895AK3n/w8KREIIIWQdoFDMjzoAvU6ze+hfim49593DYR7GHPzAiRKAHgS2fHWkPdJUUlHDEMCBdAViL7/pJIQQQsiioVDMiegKJdITi/vP+cNhNz+LZBcQW549Wh3pCKMNlVTca87c/KcPW/nZTQghhJC8oFDMCyXGYsSilZcpBz94vAOBbUhzVHOSWAQAKeUhIBo3/+nD/ZxnkhBCCCE5cVHRBhwptBVb71ixf9P5YS8PEz7+g8eb8ErxCcBVgdqGw6CNfjvH9gqBKkUiIYQQst7Qo5g3wWVeV4RZeXT98R86XoFAO9S/IWdiaN/iZE/iXvW/X2jmOWUfrZcrAIYv7LHMHyGEEJIn9CgWgfD9OrypO+rl1LMFYCPQ/9iTGEzmGHYkYj9vkQgAL+w5A3jBQIQQQgjJDXoUDfyv//0bKgCqgKhKiTqAEtyax/sA2n////lSN3OjEcmphUQ7jzF9/BXHq/CWnDV7wkE2Yc8i3GtGABp52BrkY/VyRbhCsVtE/4QQQshRhUIRwP/6P76hCleIeD8b7juh5NjbcBNnl6bqyJycupvHGAXQktFiNVYsKkHZ3PqTC8M8bDVQhV4nmxBCCCG5cCSF4l/++DeU4HoKGwAaQmAjokoKIpNjZ0QAfW1Potf+wbPfNRoseryfeMXxEoDdQHJsn3Fmsei9if2t/3ahu2g7YyavAYntwvonhBBCjihHSij+5Y9f0QREA8BOdI5A74T6PUmOfSiE6Es5deDJ0JBLsZvLwF2hpXUL41J4TJBLOxc7o2lAAB+7pVx5wd3OoGBbCCGEkCPD2gvFv/qHV1QBtDD2HJpL0QEhsXgAt3JJDxK9v/df/nY4kyFC9t1fQheLvXxmQVYnCRDjxWLofWC09cfFeRM/9t1XNgGhtgKgAmBQlC2EEELIUWNtheJf/aMrmgBaENhKWbd4BKAr3D2DvW/7v2cUhgGe9ftfGv7FP/hGQMixWHz2H+QW7Vwdp7/RxCCglqLjxCLyErORWO66uFDjKNweQggh5MiwVkLxvtuuKEGiBaApgE1zFRRf3eIRILoQ6H7b7/5tNwcT9wFsK7F4kNvECFT1+tLuBGhTEx/k0s/NzgD3fPeVk+foisVSUbYQQgghR5G1EIr33XZFCe7ycgsCG6H9eKED7AuBzrf+5y93cja1D6igDLUUnRMboQAdk1gEIvctFoKA5fd+ynqB1hBCCCFHjpUXip9+5eUWBFqQ431sPlEYEIt7kLC+9T9/eVCIse5+x1PqKDcbzMvMBrEYmjDt5py553uutABsBp8lIYQQQvJjZYXip3/i8gbcZNWbrkdMam4x6FHLIwG0JdD+1v/05WHBZvc04dPLu/PwMrMSi95LGMViKW877/neK6sATvsNB+AGsxBCCCEkJ1ZOKH76Jy6vAOgA2A55Dv1icQSgDYH2M99ZuEAEADzr9740/Isf+8bzENiBRJ42jaCSiBvFYnyQSwPusn4u3Pu9V5YE0I0IstnMcc4IIYSQI89K1Xr+9O7lFgTuB7Tky0EnopCAkHsAqs9855etZRGJmo1dAHjW73+pn2Onff8htPrOgGltV0yONz/+Q8frOU5RD8pLHFpr5tozIYQQkisr4VH8TPPyKiQ6wq23HJnSBcCBAFrPeMejvaJtjqErMHXS7mnpQ2DbF/kNU2JtREVEW3BLGy6Ue7/vyo6ezsgYkU0IIYSQ3Fh6j+Jnmpe3ANwL4YpEwOft8hhB4I5nvOPR6pKLRPz93/vSEDku5Sr6AEIeubFT0XdemjyL2x9/xfHmwoz7/hOle7/vRA/AbtDOsPeTEEIIIXkh5CwFjBfI/ScvKwHoSoltn0qQoZf7kGg+4z8+Oija5mXlkz9aqgC4f3zC8Mhl6LzwXSvdfY71573nkf48bet//4kq3OX4TamFpwft9F4+/88epmQkhBBCcmIpheL9Jy+rwt2rtgF4ZfWMYvHMt+w9ahVt7yrwyR8t9YGJVxZASDAmiUUAIwm0nveeRzqz2tN/+YkSAEtLF+R2FRSLAZskcPPz/+zhft7zRwghhBxFlm7p+f5XXdaEwL1QIhHwMrhIaJvnDiFwM0VieoRAJ3zScBgf5LIhgHMff8Xx7sd/6HhlGjsOXn6i0n/5iTbcPJKnQjYE+w7YKVjrmRBCCMmNpfIo3v+qyzrw9qkBYY+Xe7wPiMa3dB4dFm3vKvGpnY0SIB4BdK+dQkYcBr2LwaVgiT0A3ef90SPduL4PfuB4FRB1AE3ADVYJfepMy+EGT/LNXHomhBBCcmMphOLg1ZeVINEBsJMgIM7eeO6xVtH2riqf2tnoAGIXSBaL41NJYnHy4gDAEEAfEkM5iZKuQnreYb/oM37yjF8OJvfd/KcUioQQQkheFC4UB6++tASIHrz9c9HeppM3nnusU6ixK86ndjYqGAe1iOnFonZORt0rDacNHsL0YtG9l0KREEIIyY9C9ygOfvLSEoAeICdBFiK0dW4EgVspEmfnpvOjAYCz7pHU9gMqDGlojOlztHPmFDv+9/3n/HsPjZlv0uxbJIQQQsjCKSzh9qEnEr38iFKVkoP7S8hJSpYb3/5Yv+iJWhsELEg0AGy6YtHgWQwkuR4nvgY0F6PwXWdMju09Tt1zKBB61r4601E2CEBKHBY9fSQ7juNU4OYOraqfIdygpC6ATrlcHhZtIyGEEDOFeBQPX3NpCQI9oadrCXubRoIice7c1B0NIdCAK8LheRZFhEcwdOjz7hmTc4cRUZ5FTWWKVJ7FQdHzR7LhOE4b7naHU3BLb24A2FSv7wIwcBynUbSdhBBCzOQuFA9f4y03YytGQIwA1CsUiQvhpu6oD6FXh3EFWxqxmLKSi3EpWhjbltHXhNsaFj13JD2O43QAf55MAxsA3uU4TrNoewkhhITJVSge/mPXk4iAJzEgIFyR+DsUiYvkpu6oA4GTar7hefiSxOL4lEksBvclRohF3/sR+xbNnapShGTpcRzHgp7qKpm2WqImhBCyROQqFIW7J2krQUA0K7/zeL/oiTkK3NQddQDUIfS9f7kGuYwmB6mCXAZFzxlJxnGcErLXM98AYBVtOyGEED+5CcUHXntpB8B2goA4Wfntx7tFT8pR4qbuqA+gCoEzk7MGsQhMU8kl6lmfh8BJAVT8F4arsQRu7Rc9XyQVDWiVlTKQxQNJCCEkB3IRig+89lgLwG6CgDiz+duPd4qekKPITd3R8KbuyILAjQDOABjNOcjlEAJ7AE4COP68P3qk8bw/eqQDgXqWIJfqn1zoFz1XJBWVaW90HKdetPGEEEImLDw9zgO3H6sDuGvyj78wpVQ5v/lbj1tFT8ZR56buaAB3+c/61M5GA5B1QFSFwLYMpr0xlGJWz3IEoA/IPoToQ6L33Pc8MojosqGlQgq0HUqXtF/0/BBCCCFHjYUKxQdvP1YC0PULCxkUiwdSoFn0RBA/N50fdeHuKQUAfGqnVJEysFTsz784fO67h/207X/8h46X4C5RjvNmwmtyrDx9YrFX9JwQQgghR41FexR7Qu1VkmaxOALQ3PzNx4dFTwSJ56bzwwEwx2ASgdakBjTMibf9ybl7Rc8BSc1g2hvL5XKvaOMJIYRMWNgexQdvP2ZBS4MTkVKldcNvMsL5qPGJVxyvCuC0MaDJnFtztPXfLvSKtpukpotxQvdM7BVtOCGEED8LEYoPvu5YHSIsBAJi8fwNb2PwylHjEz98vASgA2Sq5NIt2m6SHlWSrz3FrVbRthNCCPEzd6H42Z86VoISAgCiUqqMwH2JR45P/HCpBMhJfW+kruTSLdp2ko1yuWwBmQKQTpbL5UHRdhNCCPGzCI+iJQQ2fWfCYrF5w1ufGBY9eJIfn/iRUgle6UZT2T/fi8mxAA63/viRbtH2k6loADibcM0IrkjsFG0sIYSQMHMVip/9qUuqgDwFxObfO3/9W5/oFj1wkh+f/JFSVQB93ZNoKvsXkZy7U7T9ZDrK5fKwXC63ANwCd//hgfb2PoA7AFQoEgkhZHmZb9SzQGeSAw8QQiCQf28Embm0F1lRPvmjpZJ63qcBLW8m4M+VqIU6a7k1Adfb1C56HGQ2VCRzr2g7CCGEZGduQvGzP31JC14dZy0NTkAstq9/6xODogdNFs8nf7TUBGBBYDOYnFv6XsQmYm8/748eGRY9FkIIIeSoIqSUMzfyuZ+5pASJgdTru/qaFZASh9e/5YlK0QMmi+NTOxsVQDQBtKQM1PoNfMyk8bzQj0cSqDzvPRSKhBBCSFHMy6PYgsCGuRQboDyLVtGDJfPnU42NKoA6gCa8QBUYtx3Elf3zjnTPYpsikRBCCCmWmT2Kn/uZSyoA7h+fkL5f3sH+N//GV+pFD5ZMz//7v22UIFEFUFE/dXW8EXjWGgGxaLzGvwKt7jt47n99pFr0mGfBcZwSAG8MFfWzNqj0N1Fjb84w3s60aXIcx6nD/dKyDgwB9NXrvspNuRSoeQaAEiaf8XVh6s9fFmzbrmIyfwO4z3tQq9UGCdcDwLBWq/VTtF1Rpwamtm3brk9p/rBWq/Vt2/bsz4LPDn1ctVqtN8M8prrfYHO/VqsNM/bpzVsVk2eXuZ1VYnaPooAFg+coUIrNSmrmwduP9eB+sAdw/0D2JNBblzQ69912RVWNrwrAE10AQqLah/S5aMPv+68xtZEs1uL6hxTV8ZaCYH1nL2I53pMc7t/gXQwEuTRnnvACUAKprn42Z2lrBbBi3msC2J6y3R6mLwFYhwqcWjccxzmEm0+0Uy6X+zn3XYX7TOuAnrlgLelhnqVKNZRIaamfjYhrDuEG8HUCwqONyf9T+zB8IbJt24L7nDZj2u4AaKu2755yKF7/1SnaOAP/347xuGzbvqNWq7UzzGcFwL3aKZHithb8fyNOAsmZNdSza8NN+RX17A7gzm1ie6vGTELxcz97SQXAboKA2P/mX/9KL7Ex955NSGzC/eCcEsDogduPdSFh3fC21QqC+fQrLy/B/VA1JFCHwMZEDSEc6Ws4D6iV2GCEMKKuMbXhijUg+pq4/iEkhLJ7HIQChJ53kliM6993KHDHc9897OfzlGZHeQ5biPnjv4ZMU56PzMYmgFMATjmOsw+guWjPl/ri08L6i8OFo4RGD8lzuQngLrheMitD+/2UbZ+GK/AaRc+JAcu27U4Gz1wnS+OaUPf1mdSOEqR9JP993wJwzrbtUhbBuwrMJBSF+iD7o1j9FwiZMQ+ev50NAexKgd0Hbj92VgnGYdGTFsenf+LyCtxo3waADZ93VUjMRSzGXqO14d2i7osTlEliEVIkXONeNu4yuPcwoX91uPecdw/beT6vWXAcx8LREoge/aINOOJsA+g7jtNaRA5KtbTcxtEUiMMFtWvBP58jqJUzTLam6F74TtqGbdtuRbTdV8dV9eP9nfLaNlVOqsDvkTRd04eZAyTP3yDmvQ24n7tmijE3kH3Voonw3+pN27YbtVqtG3NfO3DfoRpHDzM+u1VhaqH41//kaSUI7PoERNjbdPj0X/9KJ3PjZm/TKQjUH3jtseYNb3uiX/TEBfnM7uUlGXZr+5biAUDOIBYBwN1TmlIs+q5JDjJJFIsAhBSxYtEvjL1Bp+r/4DnvHjYX/JjmguM4FbjLgEfxH1KAQnEZ2ABwznEczFMsqi8/a7l8n4YFLus3tNf7ABpBz5nm8apE7VWMoK69PgRQN+xHLCkbxqKoVqvVgw2p5evx8zddE0Nrmn2GAXaVVzGyHW0ZOCst7fUIE/HXQnyZWH0OzgNoGp5dBUrgruNexVk8ii0ASd6mdtrGUnibAGBLCvQeeO2x+jKJxc/sXl4F0BGufS5xYswkFtU9vtsNXlp3nuLFIpC8FB3lfYwVi8B4KTq1WEzX/wFWJAhB7dfq4eh5EXU6RRtAxpxzHGegkppPjdpC0cX0e0vXgSy1yVOjRITupWubxIQ6Z03RxY72umMSmartDlbj/9024oNkWsi4B9y27aZ2zwiuaPb2V27btl03iVMVuKL/rY96dgNM9+xWgllK+LXGr4R0BYT+rsAImT6UMq7sn35qA65YrOY8V0Y+07y8DjHZexJXt9j3Us1Z7DXei2CtbOHOV+w8xc6lYa61a3xdGvo3POtwOwIx1/j6PwBQf84fDofpZ70YKBIBAId5B1OQRLpK6E2FureHoy0SgXiv0iwMA8eNObev7xmuL2gMebKlltNDKNHdytKYoqm97ipRuB/xvs4wcFwvenKKYCqh+NenntaEwEaCgOg+/T98ZZit5QixKEKnNiDQfeC1x0oFzNmYzzQvqwPybkDNRXLd4vDLNGLR0NZELGquSuM1UW24cy3S2GgciwwLSoTbShCLe8/5w2GVInGlsIo2gITYwGzPpYeju41Cp7OIRpUHSq9zvmvbds+27YZaRp2VnvZ627btgW3bTSWqVgld8FoRc9PG5G9wqqA65RXUvwRZ6ndHO7drmi+Vhkjv5/Scn91KMNXSswCaKaJkO9OZlDqlyqZ00+608p40ALj/5GVVIdxvoFFLwYG6xZOT7jCLC3LJEGSSKcglW0T0HTedX43AFW1Z7qiLxMNFBE+QudB0HMfKmm/RcZwOKBIB4OyCc1W2AZzTjrcxSQtzAFfsdafc42fB9XR5f582vb5USpwugF5CwMY8uNu27bj3z9RqNSvm/Q5cb+smDIEtSvDpy+ytwJxG0dJe73tL87VaraP2ZHpL0hbMnsVgP8Fn14X77PoLmtfCyexR/JtTT6sA2E7wNh1+06+lSIkT2Uayt0sdnnrg9mOVHOdLpwP1P2bcUrDRs6idm3gfp/csJi1Fx3tpXa/kLJ7FNEvRWpcHELj5pvOj9jSTXhAdrH9exDQ0izaARLKBjM/HcZwGgN2iDV8CRliwp1zl1jsJN9gkyBbc1Ed3K29gI2PbfbhC0dS2l1bpXZ6ncZHjnJEh/KJuVyXU9uhor88gRb5L5SXUxWU7cIneptFLqD07kwdzC27wz722bfcD9q4N2ZeexeSPUYw46E5lTUjApBKL1oLnKMT9r7rMgvB/C08lFtPsW4yYj6Rl3jRiMfO+xUD/UW1D2Z4gFkcAztzUHVVv6o76mSe9IFSqkJ1Z21kDzswaMEEWTjPthcpL3i7a4CWhkUflm1qt1qnVahW4ouM8zMJjE66oa2Zsu6/avhXAHqJF4znlRVsEB3D3/UX9DFKMo6vmxqMNjKOxvS/rh0j/2dXHemjwqurtbCBihVKJxQrin90WgF5Wob8KTLP03EwRJdvJ2qi5neSULsg5cej9r7qshHHENwzLvN4JYV7CjYgSHr8cJyNMWIo2LPMmRURPromay/hl/1BEdqD/mIjoswCsZ3dHwzye0ZzpFG3AErAXV7KPLA1bjuOUUoqeFuglB4CTeX8BUqKjA4xL0NURfh5tTPG3Rwmhrmq7ApUSB/49eqdt224vII3LPNLjQM1FHa5w21aBLa1AP8OEZW49JZDHIEIkH2Iy901EOJ+CkePq2TXgr4bj7RfuzmVGl4RMHsW/aT2tCv3DbPZ2HX7Tr361n9mS9FGywU43Hrz9WD2vCRPBBMuRy7zhIJMjFuRyCOAMBI4/+12j1rPftXoiUS3NHfV/TM+Uy+Vm0UaQ1FRTXtcq2tCCGQG4teg9t8oT2FbewLPaWxuzLmPWarWBarsO4I7A2/Uix51kN/yevrsw+Td3P8Neyxb8+8q34S4TB3/0v/Gbab256tlZ6tnpXtCtdQt0ySQUhUAzhYDoTm1NVrE4uaay2Gny0QqZkXHfYKRYDC7zziQWo/v3X2N6P3nZP6L/EYA9CHnrs/5gVHn2H4ysZ//B6glEjWbRBhTIIYBb6ElcOapJF6jSfEc5MGsfQLVcLnfz6jBlBHLQnlLatpOEiaGkXBp7CkMFvZiWz5sZmmlN2b2lH6QU7O3AcWUB01IYGZeeZT1FlGxvJouio2QRUze4ksdkDV59WQNCBbDIwKpu5DJvhoho7Zrxym6elVx8y8mpK7m4EXsCvWf93pe6eTyHPFB7uI7i3sQDAO2iPS1kakoprmkUbWRB7AHoFLTXtmfb9hCAFeMRa+oHGZZx2wCqtm1balk7hGHJtYvlp4lJUmzAjZoepLlReQX1L0O3Ir68YB2TijSbgQTcPVVL24pIyl2CX5QerlsEdGqh+Pmfu7gCYCtFSpXezFYJZK8bnAuyoYsuo1gcG61OpRGLgXuM+xaLr+RyCHcz8gBC1RGV6D/r9740zPsp5ERjTu24QnpxNWTnxQBAr1wuD4o2hCyceXwBOoT7uR4UPZgEhgD6RQZiqbQum5gEqozgCrWBuqQCV6joS6DnU7ZdweR5nrNtuw33ufTVuZJqWw++PMhYIjAtbSWGY0lbFrBWq/Vs2z6vxpclgAXwewXTLFf3AtVbLAB1TXBuw41KD37uKwg/u6S+Vo4sHsV6iiCTg+vaXx1OZUlEkIc5eCOi/0UjUEdAdIXEomEsEUEuBwC6AhhIV3wta5BL/+/9l7UVg3FUZ7x/BDeaslf0QAjxUFH8s3KGWxIyUQocbyA+LdEI6bN5VOGvW7wBV1hFfRkYYXFbahaRj7OpxjhIG3yjCXOPdsq+2nD3QwJuEE0V4SXkTcQ/uwOsYVGCbEIRSIqS7c1kjUksIXkpOg+xOPjJS0sANt3+w2IRQOxStJYc+wAQrW/Ze3S2uSKLpjrDvSMAdZa6WykKFT9qq0MD7j8yiwygqs54/0luS8hGrVbr2rZ9I9zlySbi94fuwV3iHGRou6K1HffZ2YcbMdwvek7SosRhL+Ntlvb6MEPwS0fd6z2fVq1Wa9q27Z1vIPnZtRYQTV442YUiELdvsDezRRH79tLsW1wkAqj6+w976EKmh8XieQDNG889Oly4wWRWKjPc26ZIJFlQKW06juN04S5rLSrYpDTDvfsUidOhhF8LQEvzVFXV20O4S8X9GJHRwuTZDQNtD+EKGUuJxgr8Uc29hLZ1OkgvzPoAbplxavRxDTLeG9W/pb1O3aZKuVNHYJ7Vs2sC48CWCgLPbk5pgZYWIVO44x56/cUVAPeHLg1v0Lvx2ru+OpjGkL/+2Ut6ALZ9TRr6i3j/zDf/xlesRU7U4WsubULinLl/4TsXmlH3xCGA6o3nHhsu0k4yHxzHmcVPfeNR3uvnOE4P/rxtWbhl2uV6x3EsTDakZ2VpllMdx2nDraYx93Gokn3TVmO5Nc9IYULIcpA2PU4dSCwFN5pWJLptyXGTvvYDx4GcjXlSiU7f409DY0yfI2BRJB4NjrJIJHOhu8C2KzPcO8h1FgghS0FaoVj1XsTkMuzPbE3KusG+04aE0gvFJFYNORODJt349sc6OVpJCCFzhdspCDmapBOKwr8BOqJyx2BuVqURiyJvh2LYnrCNYbGortkvylRCCCGEkGlJ71E0qLKAWBzMZElEKbjI99W53MRiGrEaUY2lMEFLCCGEEDIDiULxoX/61BIg3Qi8+LrB/Zmtia4bPHk/Yt/iojGW3TP1PxaL0bWWCSGEEEJWgcT0OEItO6coBTeci0WhXIpuVZK4cnV5CbG4Sirm9D3jOavmY+Fq8Rc/9o0lSFQBDJ/1+1/qF20PIYQQQvykWXquAJ7nMLysOj6ccY9i/J7EFEEui8YURBN4PybIZWPw6ssaOVu81Px/P/aNFbgVae6GwL1/8Q++sVq0TYQQQgjxk1ooAvFi8Zpf+dpgVmMSU98UKxaHulg0LkXHB7m0crV2+akIPamw8CWIJYQQQsgSkCwUhT/vljDtwZsHwvDSuCexKLEo+0Y70we5bA9efVknL2tXBW2eSkXbQsiSUC3aAEII8UhTwq8SU7cYc40m0fqJ35MoIdRmQem9v3gGE+OE387UZQfl7uDVl1YA0az8zmODXKxeVsLPulK0SYQUjar53CraDjJfVGm9ZopLB3BLwvVTtGllNGNQq9U6M9jfgPslpqK91QPQS1vCzrbtBtwCHlXtdF/9dJPKDAbG3M5aV1m/v1arWYH3mkj379BAjXmQse8WtHKFUc8igx0hvDHN+7ORvtZzvFicX57ADGIxFOSyQG542xODB157bARgwy3sbBCL3nRoNhuCXLYBef/g1ZcdwK3AMIDEwDiGwEkZVMXu+xUAFWm+ZwA53jvaf8Y7lqzGtDZngkKRHGGUQGzArVO7WbQ9ZO5UkKG8pG3bhwCsBGGXtVzlPtxazqlRAtFCdNnHbQCnlb2tWq3WjWinpdrZiGgDAM7Ztn1WjXuYcsxWhrFYgfuD9zaRofSobdv7asz9FNfWAdylnRrZth0ljDPZETEfc/1sJEc96yLEIBYBLyJ6jmQRi8DYu7hwBHqQ2FGj1iZAM80Qka3M9Hs/pdwCxJZ+jQz3ZxDnUmvYME+miHB1/OlXXn4ogR6k6AHoPvOdXx7mM3GJ85qP2s+JGetEF8HS1DkukNOO40xbJ/pIsIKf6/1yuVwv2ogp2YQrnFoA6lk9Z/NAiZsuzOLOZO+7bNs+qYtb27ZLqo20wucUgIZt240UAuy0bdudNJ49JXhbc56ibQA927brKWwN9r2hzllztmkhpPEobvqcZQbPmZiDTpt4KL0Tk35C/YeWefP5+yWArhTYgc99NxFsYzsjxFpY9PpTDvkEZeDe8DwFlv1T9A/3We5KIXcBnLvvtiv2ALSf+c4v93OZQN2kqOdNCJmFQdEGkFTswfysGgC2tOMtTMTIMKa9fbjLwHEMkBLbtqsIi8QRvFUwd6m4rn50e1vwe6Z6gfcBwFtN68Ndgq4CngMGgCs6e7ZtV1II5I6yIQkL6QSvbmPLcL6izntj2lBtN2LmshIYnz5XVsSYeoZ+da9u1OfHxMyfjWShmNa7NzMSQgiEnJNRXjPMu/9UdAVwzr/M7BeLYzsjcj0a9i1CF4shQRmYA8AgFk3zFJVr0uf9lLuQYve+2644D6D1zHd+eZDnZAbEYjXPvglZUwZFG7BE9Is2IIZOxL4+S4m0HibCZguusKrHtNcL7rmbkS78wuo83GXWQeAab09dG+5nb2yjWurVReIhgGZg3F4bVbgCSRdgSWMGgG3lfexGXaA8o7vIxjBq36Vt2z0A92unkmy0tNf7cP+t2wCwYdt2M7i9wLTdwDCGTtp9oZjDZyNtrWfTywV4gWRUHemc+o/n+rc+MQSwF07ho6LAkyKi1bk0lVyE4T7f4XiezOmK4vrXuvHcmDsA+vfddkUrv9l0x6w96yzf9sh86RVtAJkP5XK5V7QNS0S/aAOmQS1j1uF68Dy2lVhYOEr46ftk92u1WiNqiVcJmyq0JXK15NzSLhup93sJYz6cYsxt1V/k+/OcHzUPelzGIOpaZVcjYEtHO7bmaduiSFvrOUmslWa2xCe6llcsQj1kc77HCLGYVHYwMHbjNRFtpRKLSXPpisUNAHfdd9sV3ftuu6KU33TKuWxdIDPRL9oAMhfmF1S4HvSKNmBaNOGk08ip+6b2eoQU0dq1Wm0QWCZuwP/l30raS6juD/aV2DdcUdsyvaH2eG6laCM1ailZ33PZi7m8pc3DofJ8tnXb8/oCMAvpo54B8/Kle34+D8JX+g7hpei4ZfCcuP6tT/QevP3YeQA75j2BhojokMGIC3KB7vbLI8jFXaqWXuj2DoDefbddUV9osEtgzgTVYlEclMvlYdFGkLnQLdqAJeKgXC4PijZiFmq1Wt+27QNMhE415vJ6QkqULKlxfCIoaxqYCFtT9V2r1XqBMVdiLj+Pyd6/UGCL8ubpc7KH9EvQpQgBV0dYvHZj2mkF56BWqw1s29Ztt5Bun+W0zPzZSLFHcSwgtHMIB5nMC4OASBXkkicCLUjUob4phPcEhiOiASxzkMtELLoXbqEAsUgKoV20AWRudIo2YIloF23AnOghnVDcRnxkcebUOIr+lHbrth5mjNoeaGOOG1MbrpD0ru3AL7jamHjzvPGnFYpbAO5Ocd3NURHPaglf96q2A689obht23Y1TZqdKZn5s5G49DxemgxGFkctBc+DwHKu0dm0yP4TuP4tTwwg/K7u8DKvpsCC1wRvjNy36B9gmn2Lvr4z9O97y33WW1js0k3VPCiSI6Nyudwp2ggyF/boGR5zuEaf66H2elX3cQ8zXj/IcG1Te72tEnp7wTG6KGwtaGwd1ZcJS3u9p4tltVdT34+5KPvmQqqlZy1K1u9d1DxCX/znT61c9ct/N5jWEGO6FMPSZPQ1+XL9W57oPPi6Y1VInArPk/fCE4uBpWhjip+oiGjvTaSOiHbnKUNEtHbNxPsoASm27rvtivYz3/nl1gKmsOTrmxRBq2gDyFwYYUU2xedEs2gD5khVe30Qc11SCpTBlP1XprxvqL3OujVNH/Nh3IVqef4sMP53uK2iktvaZWfVdfUMNhwi2stWwWQPppe+qBpY9q7DHxDUNrRjATinXu/atp24j3NKZv5spE6PExAQoffV5M00yLhcit6SarygzJfr3/JE68HXHStBTr65mPcESsxQyQXB5eTQvkXDHEz2LcaIRUP/hn2Lp+677YruM9/55d485y70HBP+IJC5c36NvC5HHWvV9+PNkTPrEvmt9tjVtVODmMvnmR5H3yNYn7KNHrTcgSoPZC/lmPVl0n6Kviy4Xw42oHIwavZP+yVqEDefalnZE3kbap46AZt02rZtB5spBY5bWMyX91zS44wiomT9J8UcIp+BhGXmUEqVwPv5c/1bnmhC4CS0VAaT1DP6lYaIaJPtIrCCPT5YQER0RP++l+6z7ixg6uqBVEiDBfRBzBxgvbwuR5m9crncLtqIJWFvzSoMteFfbu7m1G9Pe705Rd1gk62dlPcFr0scs1rSbWmnfAnAF1HVRgV/6M6NhvdCLUUH9wRuG36CntZmQpqfwkgjFPsAkCgW55gwOSmX4rKlVLn+LU90IFCH8KeniBSLoVyG5rEm7Vs0Zb6JFov+PI2+S5PF4uZ9r7zcWtT8LdOzPAIcAKhzP9tasFcul5tFG7EkrM1c2LZdUsun+h67wwxRy7PShj+H42lv71+EvRXbtnu2bbe9c4Zcg5u2bXfihJASpHoFk9RjVtcF00PtL2rOVIocfWlZH1drymY3sKRf4LOnxzFHyQLT72UItT0+lWLf4rzLTE/L9W95og+g/uDrjjUg0YL6RhFe5l2uSi6pI6LdD7A1twkT2J53GUiSyFm4y5TDog0hMzGC+xzbRRuyBKzNXKh9bVW4QmMz8HYzLztU+hYLwF3a6XfZtr0P99+AgbrGs9eCK3K2bdsu1Wo1z9YmXEeT5xXdxSRVS1/tG6xobQQ9bK2MprcA3DvD/alQNrcDpwfae7rAP5O07GvbdhcTgdzCEkbsp9mjOEwQEF6QS2Vmawz75tIGuSwL17/liS6A7oO3H6vC/R+lLoCtlQxy8afY2fz0Ky9vPuMdj3ZmnaO//PFvqBhs7C/kgRDA/aZtrcverSPMCO7SHMW+yx5Wd3/m3YY9ayZGcJdPewnXnbZt+3RSY7VaLdU/mLVarW2IHN6GShkTY3tVa8MTkz1MxOIm1N6+hPGfjCvLF2Fz37btMwBOQwWwZLk/wLZt21ncUG31uxlxPuleTyhumsr6zcjMn41EoSiAvhTYiasbDABSyO2ktuIxCxggXZDLsnH9W5/oQ32jefD2YyUBVCVQh0AJ0vufaeFBLlVIf0qFGYNcGpjLfkVZMfQ/XNjDOHocwP2G2wPQXdF/SPPmENPtky1hzpUfFAdw/58Ywv0S1VsCob8/exMzM8Dkcz0s2pgFsw9XJPaL6LxWqzVt2+5j4jFM4iwCq05atHEb8bn8PA4RrgedxWYL+WYAGCl7+4ayhXtp9keqJOOHmHiRW1iynKhplp6HSSlVvJdf/PmnVK6688nBNIbECZjJ+1H9y3pxU5iMqhHdQwElpe5/1WUVAE21HO4mCE8Si4Fz2hs7afpMQgjUDf0P8p6bBbFfLpfrRRtBMtOZJRDCcZwK3C9SFuaT7667bIEZ/FzPxBDphXYPQDeFQFy4cFeexQ5cT1kDYbF3qOy1YmpB9+EuOddVO3X4l9ZH2pg7GcY8zDicYcKc9TO0NdBs9uyoB9poZ2ivBU1k2rZdCcxn0Paksc/1syFkwia/h3/hKXUod3NkEY3J8a3lO5/sTmPIF/7ZU3sAtuVYpUT0BYNglNi/9q6v1ec5MevG/a+6rAKJLjTvh/S5KL2Tvl+mZ33LM97xaG8WW/7qH17RBbAT6P+Wb/vdv52p3XniOM60u1+PvFB0HKeHdN4DE7dM6zlzHMeCu+w0DWfmIcwcxynBn55jWkYAKvP2ms3ybMrl8vIt3RBCFk5y1LOYeHpSRMnWZzXIGKVrvMbX/4zL3uvPjW9/bACBBvQ0Pr60Q97Jya+IiOz6HMypGvofFD1HhMyKEnZ1+KNGp2EDTKJNCFkCEoXilb/45CBDSpf6DLb0x00FBUxkjsAJn/+5iys5zdnKosRiSz83SUWUuuxfZRYb/uofXVGBtuzg9f9tv/u3g6Lnh5B5oMRicw5NnVJL2oQQUhhp8igCXumgeAEBCGw5//IppaksEf4196S6xf5rAMzBm3lE6EKEvR2pxKJ7rjJj/3WDl3gZNskTMjfK5XIX8/lcW0WPhRBytEkpFGV//DJJLE4v2AYmIRgnYLxrFI2FztSacOPbHxsC6M+tkktGhPf58Pc/KHpeCFkAzTm0ses4TrXogRBCji6phKIQ6Kf0NgFTCjbhiYXIPYnxYlEI7Hz+5y4u5TRvq05v/Cp7JZfSjH03whVnmEORrB8qLdHZOTTVLnoshJCjS9rKLP1JShXAWFlk8qI+jSFX/fLf9b74z58KX9BzKD1OdPocdU0LXKpJZMZKLpVp+73vtiuq8FL06F2K/NMGEZITFlzP4iwpc7Ydx6kvQR5FQhaOSvTd0E6lSRVEFkgqj+KJN3+9B8QHmWhBLpvOv3xKdUp7DgzepslhjLdL0Xro9fQqpqAUctymX/bvz9Bv07Sc/a3/6cuztEnI0qICW6w5NNUueiyELBpVAq8HN82V99NT4pEURNpgFkAFtKSMkm1OaU8/0FzMnkRj/xtYsozmS4lwA0qSxCKQvOyfkca4jckXDAaykLVG1SE+nLGZLcdxmnMwZzDtjYzAJotEVTbpYuJ9PwM3zdQGKBYLJYtQ7OkHCWKxMZU12hJkkliM6X/noddfbC1sxlacwasvrcBLBhwlFpOCXKbgvldeXkWw0L3bT6/oOSEkB5pzaMOaQxuDGe6tzqF/QkIokdiD+2/TCMDNqhxfFa6TimKxQNLuUfRE3KmU+wY3H/6Fp9Sv/KUnexnt6UK4BcN9daT9bafp//RDr7+4dM2vfK1V2MwuKwIWAnMWqhGtzpuf9XRLzwJoSuGVffF9q+gWPSWELJpyudxzHGcf01esAYBNx3FaykNZBA2A/7+S+aPK4FUN5wfgF5TCSS8UPc9PtIBAIMiliYzeoqv+3d8Nv/gvnnoewE5ksAyQNsjl1EOvv7gKwLrmV76WyY51ZfCTlzYB7LpzFBaLQKogl/6U3Tcnz1F6YnH0zHdyfyI5MjQB3D9jG5bjOJ0ZSvv1MH2Zw13HcboqRySZEW2p1aOnvGiztNnTDlt6EIjyxrXV4RBAU6tTbGpLvx61Wq2e0HcT7peJHcPb5xFRy9m27TYyikHdFtVvUx32a7VaK4WdTVNbGe0ZIFzvOXN/gWtLag6bCH+p9Gpid2q1WjfLfM1KaqF44k1fH15440XuN+KkKFlXfzQe/oWnlK78pSeHaftQdOF90ExiMXQQIVZdc7YB3P3Q6y/eB9CREt1r//3Xstqz8hy+5tISAEsAp/xzGBb4KSKi+1n7//RPXN6EwIbPS+yKxW7Rc0NIXpTL5YHjOGcBnJqhmQ1gpuwO/RmH0XEcxyrQq7lOtOAXA9u2bXeUF21a9PZKgfdKgffbiN8SEbzeiBKUXQS3FvnZAbBj23YLrkDta+9V0/QTQ0W7f9u27WGC4NavN5HWnm0AuwDatm23Y/pM6s+bxwbcGIuoDAkb2jzuI/BFYJFk8SgC7ofBHbBBrAE+796Gqi3cydSDkF1I0R5PViaxCJhSuiibt4XAuc//3MWHcL8J9AEMw6pI008e0vgyvF6rllTjr4l7P7l/32HwXmm8pg7tmfmWmcfz4xP44aXoyTwe3njusT6y0wy0474UsjtFW4SsMhZmT5fTchynPY1XsVwuDx3HOYC3Tzk7GwDuchynBde7MVjcVBVCR+W/zIOm4ZyF+exnTcOubdv9Wq3WnrYB5S07l+GWLbh7DesLFDmnbdsemLyXC2JD9VkH0IjzLkYxxTxuY/HzOCaTUBRAVwJ36ScS9g1ayCgUr7rzyeEXf/4pbUgxWR7JIBaB+HyLQmBTSmxCF7yAJpgAIYRfrKXs31u/FVLEXBNY5g31LzTRGzFO7xbfeakmP3BLmv4NAtsoFqcIPPn07uVV6N+m/HOZuT1CVhkl1Czof0ezs4Fkb1AcnRn7B1zv0e58Z2cp6CEH8auEgckD17BtuzSN2JiSu5So6k4xhirCaZsO4XpKB7Vara/S3VTh954OED3HZ2Zdfle0lQjuz9jOvmFpuqTG1IT//4FtuP9vNTLOYwNhkbgPVz8NarXaQM11Be58e5+bcYDPjF7oRLJEPeP4m74+EF7dZ4/4KNnNh//VUzJNmmqyDSFHwZOhnI1AqO9A/8ZrJlHTiLhGmt8XhktN6WKEjL8mth0Z3b/pVMDuiNyW8f2PL/TPmaHLNrLTiuh/7xnveHQ4RXuErDRzSpezO0O6mm7Rc0B8WwfOYPJ58LYW5ElnymjiNvye8T0A1VqtNk6QXavVBuq4rsZ5AKCegxDeANBVom6u1Gq1Ya1W69VqtSaAk4G3d9SXgFQo+zqB03fUarW66mOg+uwrMV+FO8/6ONuLm0aXTEIRACDQEebz/sNJcuxW1i7Kdz45VGJx4v4y9BMWOqb+zfZNrokag0GsadeExGqorRRiUcSJznix6rslKBZN85S6/7BYVNfs3/j2bMvOn9m9vCKA3Yj+u1naImTNaM6hjfY0N6ml1fNFT8BRRS1R6t7EDvxioZWzSRtwxWIpwxiq8O+7O6jVarHBMbVazarVatUcvaWbWPCqlVrevhluoIlHK0MTDfjF9tm4rQBq7lrwf9HcUZ7bhZFdKLopbIzaKCI59vbD/+qi+hT9tIU3GWnEYmT/sZVcUonFuGvixaBM9H6mEYtJ3sWxEAt4JRPFYmT/gTlzf1nIipjcE+h/9Iz/+Gg3c3uErAmqHN/+jM3sOI5Tn/LedtFzcISxtNd7ymvU1s5tZPFKzYD+ZWEL2baJNQLHedibFn3Vc8u27Szjyozynup9bGUQbo3AsZWivyHCYrSRdN8sZBaKx//N1wcA9o3Lp4YTSuQkDj5I+c4nhwAaE5E1i1gEkpaio8cgE69JEou+00bvY7xYTLYxSoxGiMXU/Y/F4n7l7Y/1kIHPNC+vwEvFE+yf1XMIAQpMwq2E6t4095LpUQJC98R1gPE//vrzsHIwpwm/qNpRqWHSUNdej+YYUNG0bbsX85PGvjr8Hr7dHIR3N3BcSXlfVXu9n9bbathTWk1z37RM41EEIDsAzMuX3nn9UGD7whsuamTtpXznk30Ad0z22k0vFtPsWwy1nWHfYKJYTLEUHb2cnV4sRu5bDN6Spn/3/hGm+gdNWpHzJOjNIEQtAZ+dsZntGbyKLfj/QSWLx9JeH9RqtZ523NZeb6ol6oWhREkD/s/AqSlEVX+OZnmBplE/1ZTjqgdOn1twVZdp52BzhjZ0kV9Z4NimFYroKgHhEiUW/Sfb03RUvvPJNtQ3rUixyCCX8Kn5Bbm0Kr/z2AAZuP/kZXUhsBux7H/+GXuPZmqPkDXGwuxirTPNTSq9TrPoCTgqKG+iHiXb1t9XXjl9O4K1aJvUsncjcLqdUVSVFm3nFOPqIxxo0lvgXr55zEHWNhY1lhBTCcXj/0YOIdBJESWrn9y88IaLWtP0V77zySbixKK/Hwa5IEIsmuYpvv+zld9+vIPsWP559M13e4r2CFlLlFizZmxm03Gc5pT9dzG7V5Okoxk4Hti2Xdd/4PcqbedR21h5Ne/QTm3ADQIpxdw21F5Pm5PTxJlarSZifuoZxtWB/7O9AXeJuJS2jQxUp7zvYJo2VOCRHgTTW8CYxkzrUQSAdkKUrO+8wrrwhotK03SmxOKZcXNpI6JDBwxySRnkslf57cdbyMj9r7qsCW0PTmDZf/9bOo/2srZJyDozp3Q5luM4pSn7b4H7FReK+oe9FTh9t+EnWLWnhRxQkbb6Z2AD8Z7qXmB8udg5xbha8Htpt7AYL7pv/IEtBXH0ddsybDdoBY4HCxjTmKmF4vEzcgBgzyQWtV/B80kfvljKdz5pQeBWACMGuSw0yOXM5m893kRG7n/VZSWMv0CY5lLtbSWEBGnOeP8mZhAV5XK5CYrFRdLAdNV4dhed+sRD5QXUPVxx9nYCx1aSnbZtl/IaS4AG/F/EZqmKZBpXB/4ApSz/H3WCx0lpipSXWa/XPsKCc6PO4lEEvCWTCA9dhFjcufCGqdLlAADK//bJLgQqAPbWIsgl8Zpcg1xGELh187cetzAdHeilF/12HH5L57HOlO0SstbMKV1Oa1qvorKhCbVqQ+aOpb3ehzvPcT86rRztrCPFnlkVMBJc1u1FecSUuOkD6OexnG6wtZFmXFlQwreDcIUiK4NtPfj/v9+EqrYS0WcD4WXm9qJzU2at9ezj+Bk5eOS02IOXBiV9KbjOhTdcVD3x5q9PNbjyv31yCKDp/PxTOgBaAtiRQo5rLWv9+PSQsaQdECw7GLomVFIvdI00l/3T+p+17F90O8llB32nAnZP6h5iTwCtG37z8ameyeDVlzUEsBPaPTrprzlNu4QcIZoA7p/hfq+qhzVtA+Vy2XIcpwf3S9/mtO2QCYZyfVbS0mQg8KVp27aVR6LqWq02VGKvh2TPmwVXWHp7FDcB3G3b9gFcD9cQ7n7AOvwet3tt274lYg7qtm1bKUztZClbp8oJNgG8K+OUVCLsqapxBefo5BTl9Bpwl469trbUHJ2HK669eWwgvB90f04lD2OZSSgCgHA/LLv+usUJYhHYdINhZksSWb7zyR6AnvPzT6kIoCWFbEAK/x83TRiNX/qUo3ovhVgcD83QtlEsateExGqgfwiZLBYRmMsMYtV3i/++84Bo3/Cbj/emfQ6DV19WAtDxnnVwaBDYvzFjHkZCjhrlcnngOM5ZhPepZeG04zgdlXpnWjt6juNU4YrOFua8VHcEaWqvD1LuX2tjIhQ3VBvtPIxVoqqFcP3h4HW6qNQFzBbiA1z2EZ0KxkuDk0QPGffl1Wq1rm3bZ+Bftk1iM+X1IwAtFUCTCW0eu/B/odhRP1HsY8GJtj1mXXpGSe1VDC+fJga57Fx440XNeQyifOeTg/KdT7auuvPJCoS8GUKege7OPWJBLqZ7AocHELgDAjfe8LYnGje8bXqRqPrtAHKy5Bzu0pqtfUKODBZmXyKzZjWiXC4Py+WyBTcFxx3w710jKVECQBc+7TT3GVLltPK02xAxHHXdsFarVeEulyd9bkdwo5rzqPUcZa+F+e7FHWFS47ozg119uF7KNPN4CNdzmds8zuxRBAC4pdoaQmLD7+0Ke+gCjrL2hTde1D/xpq/35zWgq9wk3eP2vvgvnloFUIJAXXVcFUApynM3WWbOsBQdXM6FiL0mcSlailjvZ8hLa/AsAr7+BxAYQKIPoHf9W58Yzmu+Bz95aQsCO75tB37v596KehOn3S/WL9rwJaA/w73DGe4dYPrnNljMVGSjXC4PHcdpYbatGhXHcUoq9c7M9sAVN23HcSpwl9u83+vIcAFtjvccZhQTFrR5tm27kmJZU9/fGLx2gAx7UGu1Wsu27QFSpJNRAsxSe+iq8H8+egD6hmoiHh1kT++ijy3rvS3E//+exp6hGlOavlPZp0SfparPNODOYzXQTtw8LgwhQ2ul0zG0hAXgNILLzD41MzmnXXMAoH7iTdPtVyTFcfiTl9YB3O3TyAC0Zz2CRLXy9mwJuwkhhBCyHMy89OxRsqQF4DB6aTQyOfcWWKB+5Th8zaUVCDckPxyRPX7WFkUiIYQQsrrMTSgqmgBiUrpEisXdC2+8yCp6Mkg6Dl9zaQnuxtsN455E91kfVH7nsXbRthJCCCFkeuYqFEuW7MHbABstIHzHmqA8Pa/gFrJg3Ij1Le3YFGTTLNpMQgghhMzGvD2KgLsB182CbhYQiKnkcu7CGy9qFD0pJJoH/vGlHQHsJFSSOVP57cf7RdtKCCGEkNmYWzCLztASdbh1KyekD3IZwQ1u6Rc9OcTPA6+9tAM5yUIfDmIBABxs/tbj1aJtJYQQQsjsLMKj6C1B+8Pw0we5bADoXXjjRdWiJ4dMeOC1x9qA3NU9iYZ8jyPklACUEEIIIYtnIR5Fj6EleghmWTdV7vAlDAQ9i0vGA7cfa0Pq1SLGZf/GqDSKt27+1uPdou0lhBBCyHxYiEdRo4FglvH0QS4bwvUs1gueoyPNg7cf6wjglH9Poqpe4684c5YikRBCCFkvFioUS5Ycws3QHhaL6YJcNgRwN6Ohi+HB2491oOqNmssKjsXi/g2/+XiraHsJIYQQMl8W7VFEyZJ9RNWpjBSLWq0799e5C2+8yNwGmTsPvu5Y6cHXHetBTAJXAC2VkV8sHkJwXyIhhBCyjixcKAJAyZIduIXlwyQFuUy8j3ddeONFnUJm6Qjx2Z86VoFbU9LdWyrC12hicQSgccPbHh8WbTchhBBC5s9Cg1mCDC3RAfxeqjHpg1wOADROvOnrgzwn6ijw2Z+6pA6gC4gN48dChg5vvuGtT/SLtpsQQgghiyEXj6JHyZJNAHvGN9MHuWwJoM/E3PPlsz99iQU39+UGICEMnsSAd/EkRSIhhBCy3uTqUfSI9SwCEcm5ReAYkMDZE2/6eiv3AawRn/vpSyrSrdvsluTzTbw756GPiMTJ69/6RKdo2wkhhBCyWAoRisC0YhEI5vBTS9FN5lvMzud+5pIWAAsSG0BUpZWQWDx5/VsoEgkhhJCjQGFCEZiDWPRfcwZA+8Sbvj4sbEArwud+9pIKJDrQk6FH7hH1EJCSIpEQQgg5SuS6RzGI2rN4JvICAX+e5/FBaN8iAJwG9y4m8rmfvcQC0IcIVMyJzG3pISkSCSGEkCNGoR5Fj6ElmgDORV6QMiJa+7UPoMXl6Al//U+e1gRgQYrNaK/h5Jx2egSJ5jf/xle6RY+BEEIIIfmyFEIRAIaWqMMNqtiIvCh9kIvHHgDrKKfS+etTT6tDwoJvmVntO9QvDAesjOttf/Ovf6Vf9DgIIYQQkj9LIxQBYGiJKoAOvAhcE+mDXHT2IGGdePPREYx/c+ppdQlNIIaEYKJYPIBE4+m//pVB0WMhhBBCSDEslVAEgKElSnDF4k7kRdmCXPRzewA6J9789V7R41wUf9N6WhMSLSixnbzMLEzX7AFoPf0/fGVY9HgIIYQQUhxLJxQ9hpZoAbgr8oL0lVxM9x4AaAPonnjz6kdJf/6Op1WkKw6b0JfutcGbU99453xi8Y6n/9pX2kWPiRBCCCHFs7RCERgvRXcBbBovyB7kEjoP13vWPfHmr3eLHm8WPv9zF5cg0QA872FkcmzTS9NS9KEEGk//Ne5HJIQQQojLUgtFYLwUbQE4FXlR9iAX04mRlOjCrXXcu/IXnxwWPfYgD73+4op0xWEDxr2HU4vFPQCtb/rVry7dmAkhhBBSHEsvFD1UVHQHMd7FKYJcjEux7pSIA7jezB4k+lf+Uv7C8aF/enEFQB0SdQB1b+zGRxYYb0qxOIJE85t+9avdvMdGCCGEkOVnZYQikMK7OH2QS7ipsFfyAMAAQF8CPQDD8i892Z/HuL7wz55aAlAFUFE/dSlRBYRxv+HEvrhxiCSxeBaA9U1n6UUkhBBCiJmVEooeau9iGwhUFwHCnsO0YtF3rTqMWMIOtD8C0PdMgxy/dq+RAgFKkKh6r6WeCihD//5rosYgTILyABKt685+tZd6wgkhhBByJFlJoeihKrpYCC5HzxYR7T+MEJq+S9Ms8wYFY8ogk1D/U4hFdc0hAOu69lc76WeYEEIIIUeZlRaKHkowthGs6jKfIJdYsTh+madYjL0m9P4IEG0A7Wvv4jIzIYQQQtKzFkIRGO9fbCDoYZx/kIvxGhlxT/ia3MTiCEAbEu1r7/racMbpJYQQQsgRZG2Eoo7yMLbg7f9bbJCL/+U0YlG7JqmSStK+RW+JGUD32n9PgUgIIYSQ6VlLoeihUuo0AewWEOQS2UaSWAzdnq7/8wA61/zK17qLm1FCCCGEHCXWWih6jJelVQ3kNQpyOQBEB0D3mv/ra4PcJpQQQgghR4IjIRR1hpaoQKIhQ9VNVibIxUsE3r36//y7fqGTSQghhJC15sgJRZ1HTo8DYLzqJ5tLGOQyUgm+uwB6V//y3w2KnjdCCCGEHA2OtFAM8si/FhUAVUDU3d/YLiDIZR9uBZgegP5V/45eQ0IIIYQUA4ViAo/864sqkKhIt9YyMPldhfTnbZyikksfEkN4JQHvnE9JQEIIIYSQeUChOCcuvOGiOmDet3jlLz7ZK9o+QgghhJCsUCgSQgghhBAjFxVtACGEEEIIWU4oFAkhhBBCiBEKRUIIIYQQYoRCkRBCCCGEGKFQJIQQQgghRigUCSGEEEKIEQpFQgghhBBihEKREEIIIYQYoVAkhBBCCCFGKBQJIYQQQoiR/x9Dhjrx8eFU5gAAAABJRU5ErkJggg==";
function LogoLSFire({ size = 36, escuro = false }) {
  return (
    <img src={escuro ? LOGO_LSFIRE_ESCURO : LOGO_LSFIRE_DATAURL} alt="LS Fire"
         style={{ height: size, width: "auto", display: "block" }} draggable={false} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIDADE VISUAL
// ═══════════════════════════════════════════════════════════════════════════
// Paleta = a do LS Pricer (variáveis CSS definidas em GlobalFonts, com tema claro e escuro iguais aos do Pricer)
const C = {
  orange: "var(--or)",
  orangeFill: "var(--or-fill)",
  orangeDark: "var(--or-ink)",
  orangeLight: "var(--or-soft)",
  orangeBg: "var(--or-line)",
  gray: "var(--ink)",
  grayMid: "var(--ink3)",
  grayLight: "var(--bg)",
  border: "var(--line)",
  white: "var(--card)",
  ok: "var(--ok)", okLight: "var(--ok-bg)",
  nok: "var(--bad)", nokLight: "var(--bad-bg)",
  na: "var(--ink3)", naLight: "var(--bg)",
  blue: "var(--blue)", blueLight: "var(--blue-bg)",
  amber: "var(--warn)", amberLight: "var(--warn-bg)",
  purple: "var(--purple)", purpleLight: "var(--purple-bg)",
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE RELATÓRIO / VISITA
// ═══════════════════════════════════════════════════════════════════════════
const TIPO_REL = {
  itm:        { id: "itm",        nome: "ITM",                       nomeLong: "Inspeção, Teste e Manutenção (NFPA 25)", Icon: ClipboardCheck, color: C.blue,   bg: C.blueLight,   modo: "nfpa"   },
  inspecao:   { id: "inspecao",   nome: "Inspeção / Levantamento",   nomeLong: "Inspeção / Levantamento Técnico",        Icon: Search,         color: C.purple, bg: C.purpleLight, modo: "padrao" },
  preventiva: { id: "preventiva", nome: "Manutenção Preventiva",     nomeLong: "Manutenção Preventiva",                  Icon: Wrench,         color: C.ok,     bg: C.okLight,     modo: "padrao" },
  corretiva:  { id: "corretiva",  nome: "Manutenção Corretiva",      nomeLong: "Manutenção Corretiva",                   Icon: AlertTriangle,  color: C.amber,  bg: C.amberLight,  modo: "padrao" },
  startup:    { id: "startup",    nome: "Start-up / Comiss.",        nomeLong: "Start-up e Comissionamento (RQ 48)",      Icon: ShieldCheck,    color: "#0F766E", bg: "#CCFBF1",   modo: "startup" },
};

const FREQ_NFPA = ["Semanal", "Mensal", "Trimestral", "Semestral", "Anual"];

// Periodicidade em dias de cada frequência (usado para detectar vencimento isolado)
const FREQ_DIAS = { Semanal: 7, Mensal: 30, Trimestral: 90, Semestral: 180, Anual: 365 };

const STARTUP_CHECKLIST_TEMPLATE = [
  {
    grupo: "PRÉ-REQUISITOS PARA LIBERAÇÃO DO START-UP",
    items: [
      "Checklist de pré-start-up assinado e enviado com antecedência mínima de 10 dias.",
      "Fotos e/ou vídeos recebidos para validação prévia da instalação.",
      "Flush da linha de sucção executado antes da montagem final da bomba.",
      "Painéis energizados somente com acompanhamento do técnico responsável.",
      "Equipe de operação/manutenção do cliente presente para acompanhamento e treinamento.",
      "Local seguro, limpo, iluminado e com acesso liberado para execução dos testes.",
      "Combustível disponível, dentro da validade e em volume suficiente para os ensaios.",
      "Reserva técnica de incêndio abastecida para operação em vazão nominal.",
      "Base fixada, nivelada e grauteada conforme orientação do fabricante.",
      "Tubulações, válvulas e acessórios instalados e identificados corretamente.",
    ],
  },
  {
    grupo: "INSPEÇÃO VISUAL E DOCUMENTAL",
    items: [
      "Projeto aprovado e atualizado disponível para conferência.",
      "Certificados, manuais e documentação técnica entregues.",
      "Dimensionamento das linhas de sucção e recalque compatível com o projeto.",
      "Reservatório, sucção e coluna d'água em condição adequada para teste.",
      "Sistema de combustível instalado, abastecido e sem vazamentos.",
      "Sistema de arrefecimento, óleo lubrificante e baterias verificados.",
      "Quadro de comando e interligações elétricas conferidos.",
      "Ventilação e exaustão da casa de bombas verificadas.",
      "Aterramento e proteção elétrica conferidos.",
      "Cabeamento, sensores e interligações entre equipamentos conferidos.",
    ],
  },
  {
    grupo: "ENSAIOS OPERACIONAIS E AUTOMAÇÃO",
    items: [
      "Partida manual executada com sucesso por 6 ciclos consecutivos.",
      "Partida automática executada com sucesso por 6 ciclos consecutivos.",
      "Bomba iniciou automaticamente por todas as fontes de comando previstas.",
      "Pressostatos e/ou chaves de nível atuaram conforme ajuste definido.",
      "Perda de pressão na descarga simulada e reconhecida pelo sistema.",
      "Painel de controle apresentou sinalização e comandos conforme esperado.",
      "Desligamento manual testado e validado.",
      "Carregadores de bateria e alternador em funcionamento.",
      "Ausência de vazamentos durante a operação.",
      "Duas unidades ECU/controladores testadas quando aplicável.",
      "Motor e rotação conferidos nas duas ECU/controladores quando aplicável.",
      "Sinais de falha simulados e reconhecidos pelo painel.",
      "Curva do fabricante anexada ou disponível para comparação.",
      "Resultados dos testes comparados com a curva de referência.",
      "Manômetros/instrumentos calibrados ou conferidos antes do ensaio.",
      "Equipamento operou sem vibração prejudicial.",
      "Equipamento operou sem ruídos anormais ou aquecimento excessivo.",
    ],
  },
  {
    grupo: "ENSAIO DE ACEITAÇÃO NFPA 20 - REGISTROS COMPLEMENTARES",
    items: [
      "Dados do proprietário, endereço, local da bomba e responsável pelo sistema registrados.",
      "Demanda máxima do sistema de proteção contra incêndio registrada em vazão, pressão e duração.",
      "Tipo de bomba, fabricante, modelo, número de série, rotação e características nominais registrados.",
      "Dados do acionador, controlador, bomba jockey, válvula de alívio e reservatório registrados quando aplicável.",
      "Representantes necessários para testemunho do ensaio presentes ou justificativa registrada.",
      "Fiação elétrica/intertravamentos conferidos antes da partida inicial ou aceitação.",
      "Ensaio hidrostático e lavagem/flush registrados quando aplicável.",
    ],
  },
  {
    grupo: "VÁLVULA DE ALÍVIO E PERFORMANCE HIDRÁULICA",
    items: [
      "Válvula principal de alívio instalada quando requerida pelo projeto/norma.",
      "Válvula de alívio ajustada para a pressão definida.",
      "Vazão em shut-off verificada sem ultrapassar pressão admissível.",
      "Vazão nominal medida e registrada.",
      "Pressão de descarga em vazão nominal registrada.",
      "Pressão de sucção em vazão nominal registrada.",
      "Teste de 150% de vazão executado quando aplicável.",
      "Pressões residuais compatíveis com projeto/curva do fabricante.",
      "Drenos, retorno e descarga de testes direcionados corretamente.",
    ],
  },
  {
    grupo: "ENSAIO DE VAZÃO E CURVA DA BOMBA - NFPA 20",
    items: [
      "Curva certificada do fabricante anexada para conjunto certificado ou curva de referência informada para conjunto não certificado.",
      "Pontos de 0%, 25%, 50%, 75%, 100%, 125% e 150% registrados quando aplicável.",
      "Pressões de sucção e recalque registradas em cada ponto ensaiado.",
      "Pressão líquida da bomba calculada a partir de recalque menos sucção.",
      "Vazão informada diretamente ou calculada por Pitot/bocal quando aplicável.",
      "Pressão líquida ajustada por RPM registrada quando houver variação de rotação.",
      "Tensão e corrente do motor elétrico registradas durante o ensaio quando aplicável.",
      "Potência, amperagem ou eficiência registradas quando disponíveis.",
      "Resultado comparado com curva do fabricante/projeto dentro dos critérios definidos pelo responsável técnico.",
      "Condição final do conjunto registrada após o ensaio.",
    ],
  },
  {
    grupo: "MOTORES, GOVERNADOR E VERIFICAÇÕES FINAIS",
    items: [
      "Demanda de corrente do motor elétrico registrada nas fases.",
      "Tensão entre fases registrada durante operação.",
      "Variação de tensão dentro dos limites aceitáveis.",
      "Sobrecarga/estresse operacional avaliado durante os ensaios.",
      "Desarme por sobrevelocidade testado quando aplicável.",
      "Governador/regulador de rotação ajustado e validado.",
      "Ruído, vibração e aquecimento dentro de condição aceitável.",
      "Bomba partida, ajustada e entregue em condição operacional.",
      "Curva de performance preenchida com os pontos medidos.",
      "Inversão de fase testada/validada para conjunto elétrico.",
      "Sistema entregue com orientações básicas de operação e manutenção.",
    ],
  },
  {
    grupo: "CONTROLADORES, OPERAÇÃO MÚLTIPLA E AVALIAÇÃO FINAL",
    items: [
      "Operação com múltiplas bombas registrada em série/paralelo quando aplicável.",
      "Controlador elétrico/diesel testado em partidas automáticas e manuais conforme aplicável.",
      "Transferência de fonte, baterias, carregadores e alarmes conferidos quando aplicável.",
      "ECMs/controladores redundantes testados quando existentes.",
      "Tanque/reservatório de água verificado quanto a nível, reposição e capacidade disponível para ensaio.",
      "Alívio principal observado quanto a vazão e fechamento após o ensaio quando aplicável.",
      "Resultado final avaliado contra curva certificada do fabricante ou curva de referência informada.",
      "Pendências, falhas ou respostas NÃO OK explicadas nas observações do relatório.",
      "Dados do responsável pelo teste, empresa, assinatura e data registrados.",
    ],
  },
];

const STARTUP_EQUIPAMENTO_FIELDS = {
  diesel: [
    { key: "bombaFabricante", label: "Bomba fabricante" },
    { key: "bombaModelo", label: "Bomba modelo" },
    { key: "bombaSerie", label: "Bomba nº de série" },
    { key: "motorFabricante", label: "Motor fabricante" },
    { key: "motorModelo", label: "Motor modelo" },
    { key: "motorSerie", label: "Motor nº de série" },
    { key: "painelFabricante", label: "Painel fabricante" },
    { key: "painelModelo", label: "Painel modelo" },
    { key: "painelSerie", label: "Painel nº de série" },
    { key: "tanque", label: "Tanque" },
    { key: "capacidade", label: "Capacidade" },
    { key: "tanqueSerie", label: "Tanque nº de série" },
    { key: "wasteCone", label: "Waste cone" },
    { key: "valvulaAlivio", label: "Válvula de alívio" },
    { key: "medidorVazao", label: "Medidor de vazão" },
    { key: "arrefecimento", label: "Arrefecimento" },
    { key: "vazaoGpm", label: "Vazão nominal (GPM)" },
    { key: "pressao", label: "Pressão nominal (mca)" },
    { key: "rpm", label: "Rotação (rpm)" },
  ],
  eletrica: [
    { key: "bombaFabricante", label: "Bomba fabricante" },
    { key: "bombaModelo", label: "Bomba modelo" },
    { key: "bombaSerie", label: "Bomba nº de série" },
    { key: "motorFabricante", label: "Motor fabricante" },
    { key: "motorModelo", label: "Motor modelo" },
    { key: "motorSerie", label: "Motor nº de série" },
    { key: "painelFabricante", label: "Painel fabricante" },
    { key: "painelModelo", label: "Painel modelo" },
    { key: "painelSerie", label: "Painel nº de série" },
    { key: "vazaoNominal", label: "Vazão nominal (GPM)" },
    { key: "pressaoNominal", label: "Pressão nominal (mca)" },
    { key: "rpmNominal", label: "RPM nominal" },
    { key: "rotacaoNominal", label: "Rotação nominal (rpm)" },
    { key: "potenciaNominal", label: "Potência nominal (HP)" },
    { key: "tensao", label: "Tensão (V)" },
  ],
  jockey: [
    { key: "bombaFabricante", label: "Bomba fabricante" },
    { key: "bombaModelo", label: "Bomba modelo" },
    { key: "bombaSerie", label: "Bomba nº de série" },
    { key: "motorFabricante", label: "Motor fabricante" },
    { key: "motorModelo", label: "Motor modelo" },
    { key: "motorSerie", label: "Motor nº de série" },
    { key: "painelFabricante", label: "Painel fabricante" },
    { key: "painelModelo", label: "Painel modelo" },
    { key: "painelSerie", label: "Painel nº de série" },
    { key: "rotacaoNominal", label: "Rotação nominal (rpm)" },
    { key: "vazaoNominal", label: "Vazão nominal (GPM)" },
    { key: "pressaoNominal", label: "Pressão nominal (mca)" },
    { key: "potenciaNominal", label: "Potência nominal (HP)" },
    { key: "tensao", label: "Tensão (V)" },
  ],
};

const STARTUP_EQUIPAMENTOS_TEMPLATE = [
  { id: "diesel-1", nome: "Bomba Diesel 01", tipo: "diesel" },
  { id: "diesel-2", nome: "Bomba Diesel 02", tipo: "diesel" },
  { id: "diesel-3", nome: "Bomba Diesel 03", tipo: "diesel" },
  { id: "eletrica-1", nome: "Bomba Elétrica 01", tipo: "eletrica" },
  { id: "eletrica-2", nome: "Bomba Elétrica 02", tipo: "eletrica" },
  { id: "eletrica-3", nome: "Bomba Elétrica 03", tipo: "eletrica" },
  { id: "jockey", nome: "Bomba Jockey", tipo: "jockey" },
];

const STARTUP_TESTE_PONTOS = [
  { id: "0", label: "0%" },
  { id: "25", label: "25%" },
  { id: "50", label: "50%" },
  { id: "75", label: "75%" },
  { id: "100", label: "100%" },
  { id: "125", label: "125%" },
  { id: "150", label: "150%" },
];

function createNfpa20TestData(tipo = "diesel") {
  return {
    tipoConjunto: "certificado",
    modoVelocidade: "constante",
    acionamento: tipo === "eletrica" ? "eletrico" : "diesel",
    flowUnit: "gpm",
    pressureUnit: "mca",
    pitotUnit: "psi",
    diameterUnit: "in",
    temperatureUnit: "c",
    powerUnit: "hp",
    oilPressureUnit: "bar",
    voltageUnit: "v",
    currentUnit: "a",
    rotationUnit: "rpm",
    vazaoNominalGpm: "",
    pressaoNominalPsi: "",
    rpmNominal: "",
    diametroBocalPol: "",
    coefBocal: "0.97",
    pressaoChurnPsi: "",
    pressao100Psi: "",
    pressao150Psi: "",
    curvaAnexada: "",
    observacaoCurva: "",
  };
}

const STARTUP_TEST_FIELDS = {
  diesel: [
    { key: "rotacao", label: "Rotação", unitKind: "rotation" },
    { key: "pressaoSuccao", label: "Pressão sucção", unitKind: "pressure" },
    { key: "pressaoRecalque", label: "Pressão recalque", unitKind: "pressure" },
    { key: "pitot1", label: "Pitot 1", unitKind: "pitot" },
    { key: "pitot2", label: "Pitot 2", unitKind: "pitot" },
    { key: "pitot3", label: "Pitot 3", unitKind: "pitot" },
    { key: "pitot4", label: "Pitot 4", unitKind: "pitot" },
    { key: "pitot5", label: "Pitot 5", unitKind: "pitot" },
    { key: "pitot6", label: "Pitot 6", unitKind: "pitot" },
    { key: "temperatura", label: "Temperatura", unitKind: "temperature" },
    { key: "fluxo", label: "Vazão", unitKind: "flow" },
    { key: "pressaoOleo", label: "Pressão óleo", unitKind: "oilPressure" },
  ],
  eletrica: [
    { key: "rotacao", label: "Rotação", unitKind: "rotation" },
    { key: "pressaoSuccao", label: "Pressão sucção", unitKind: "pressure" },
    { key: "pressaoRecalque", label: "Pressão recalque", unitKind: "pressure" },
    { key: "pitot1", label: "Pitot 1", unitKind: "pitot" },
    { key: "pitot2", label: "Pitot 2", unitKind: "pitot" },
    { key: "pitot3", label: "Pitot 3", unitKind: "pitot" },
    { key: "pitot4", label: "Pitot 4", unitKind: "pitot" },
    { key: "pitot5", label: "Pitot 5", unitKind: "pitot" },
    { key: "pitot6", label: "Pitot 6", unitKind: "pitot" },
    { key: "temperatura", label: "Temperatura", unitKind: "temperature" },
    { key: "fluxo", label: "Vazão", unitKind: "flow" },
    { key: "tensaoL12", label: "Tensão L1-L2", unitKind: "voltage" },
    { key: "tensaoL23", label: "Tensão L2-L3", unitKind: "voltage" },
    { key: "tensaoL13", label: "Tensão L1-L3", unitKind: "voltage" },
    { key: "correnteL1", label: "Corrente L1", unitKind: "current" },
    { key: "correnteL2", label: "Corrente L2", unitKind: "current" },
    { key: "correnteL3", label: "Corrente L3", unitKind: "current" },
  ],
};

const STARTUP_TESTES_TEMPLATE = [];

const STARTUP_DECLARACAO_ACEITE =
  "Declaramos que estamos de acordo com os testes executados e com as orientações apresentadas durante a entrega técnica/start-up. Os equipamentos foram comissionados, testados e entregues conforme registros deste relatório.";

function createStartupChecklistGroups() {
  return STARTUP_CHECKLIST_TEMPLATE.map((g, gi) => ({
    id: gi + 1,
    grupo: g.grupo,
    items: g.items.map((texto, i) => ({ id: i + 1, texto, status: "", obs: "", fotos: [] })),
  }));
}

function createStartupEquipamento(tipo = "diesel", ordinal = 1) {
  const campos = { tag: "" };
  (STARTUP_EQUIPAMENTO_FIELDS[tipo] || []).forEach(f => { campos[f.key] = ""; });
  const nomeBase = tipo === "eletrica" ? "Bomba Elétrica" : tipo === "jockey" ? "Bomba Jockey" : "Bomba Diesel";
  return {
    id: `${tipo}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nome: tipo === "jockey" ? nomeBase : `${nomeBase} ${String(ordinal).padStart(2, "0")}`,
    tipo,
    tag: "",
    campos,
  };
}

function createStartupEquipamentos() {
  return [];
}

function createStartupTeste(tipo = "diesel", ordinal = 1) {
  const tipoNome = tipo === "eletrica" ? "Motor Elétrico" : "Motor Diesel";
  return {
    id: `${tipo}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nome: `Teste de Performance Conjunto ${ordinal}`,
    tag: "",
    tipo,
    nfpa20: createNfpa20TestData(tipo),
    linhas: STARTUP_TESTE_PONTOS.map(p => {
      const row = { id: p.id, teste: p.label };
      (STARTUP_TEST_FIELDS[tipo] || []).forEach(f => { row[f.key] = ""; });
      return row;
    }),
    descricaoTipo: tipoNome,
  };
}

function createStartupTestes() {
  return STARTUP_TESTES_TEMPLATE.map((t, idx) => createStartupTeste(t.tipo, idx + 1));
}

function hasFieldValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isStartupTesteExecutado(teste) {
  if (!teste) return false;
  const fields = STARTUP_TEST_FIELDS[teste.tipo] || [];
  const rowHasData = (teste.linhas || []).some(linha => fields.some(f => hasFieldValue(linha?.[f.key])));
  if (rowHasData) return true;
  const cfg = teste.nfpa20 || {};
  return [
    "vazaoNominalGpm",
    "pressaoNominalPsi",
    "rpmNominal",
    "diametroBocalPol",
    "pressaoChurnPsi",
    "pressao100Psi",
    "pressao150Psi",
    "observacaoCurva",
  ].some(k => hasFieldValue(cfg[k]));
}

function createStartupData(tecnicoNome = "") {
  return {
    info: {
      equipamento: "",
      tecnicoResponsavel: tecnicoNome,
      localInstalacao: "",
      numeroSerie: "",
      norma: "NBR / NFPA 20",
      entrega: "Equipamentos instalados, comissionados, testados e entregues em funcionamento.",
    },
    equipamentos: createStartupEquipamentos(),
    checklistGroups: createStartupChecklistGroups(),
    testes: createStartupTestes(),
  };
}

// Durações disponíveis para venda de contrato (em meses)
const DURACOES_CONTRATO = [3, 6, 12];

// Retorna array de frequências da visita (suporta o formato legado com `freq` string
// e o novo formato com `freqs` array)
function getVisitaFreqs(v) {
  if (!v) return [];
  if (Array.isArray(v.freqs) && v.freqs.length > 0) return v.freqs;
  if (v.freq) return [v.freq];
  return [];
}

// Ordena um array de frequências NFPA na ordem canônica (Semanal → Anual)
function ordenarFreqs(freqs) {
  return FREQ_NFPA.filter(f => freqs.includes(f));
}

// ═══════════════════════════════════════════════════════════════════════════
// CRONOGRAMA NFPA 25 — calcula quais inspeções caem em cada mês do contrato
// Regra: toda visita mensal inclui Semanal + Mensal.
// Trimestre (meses 3, 6, 9, 12, ...) adiciona Trimestral.
// Semestre (meses 6, 12, 18, ...) adiciona Semestral.
// Ano (meses 12, 24, ...) adiciona Anual.
// ═══════════════════════════════════════════════════════════════════════════
function getFreqsPrevistasPorMes(mes) {
  if (!mes || mes < 1) return [];
  const freqs = ["Semanal", "Mensal"];
  if (mes % 3  === 0) freqs.push("Trimestral");
  if (mes % 6  === 0) freqs.push("Semestral");
  if (mes % 12 === 0) freqs.push("Anual");
  return freqs;
}

// Retorna a duração do contrato em meses (com fallback para contratos legados
// que tinham apenas o array `frequencias`)
function getDuracaoMeses(contrato) {
  if (!contrato) return 0;
  if (contrato.duracaoMeses) return contrato.duracaoMeses;
  // Fallback: deriva da validade vs dataInicio
  if (contrato.dataInicio && contrato.validade) {
    const ini = new Date(contrato.dataInicio + "T00:00:00");
    const fim = new Date(contrato.validade + "T00:00:00");
    const m = (fim.getFullYear() - ini.getFullYear()) * 12 + (fim.getMonth() - ini.getMonth());
    if (m > 0) return m;
  }
  // Fallback: deriva das frequencias (legado)
  if (contrato.frequencias?.includes("Anual"))     return 12;
  if (contrato.frequencias?.includes("Semestral")) return 6;
  return 3;
}

// Calcula em qual mês do contrato uma data cai (1, 2, 3, ...)
function mesDoContrato(dataInicio, dataReferencia) {
  if (!dataInicio || !dataReferencia) return 0;
  const ini = new Date(dataInicio + "T00:00:00");
  const ref = new Date(dataReferencia + "T00:00:00");
  const diffMeses = (ref.getFullYear() - ini.getFullYear()) * 12 + (ref.getMonth() - ini.getMonth());
  return Math.max(1, diffMeses + 1);
}

// Retorna as frequências previstas para uma visita ITM em determinada data
function getFreqsPrevistasParaVisita(contrato, dataVisita) {
  if (!contrato?.dataInicio || !dataVisita) return [];
  const mes = mesDoContrato(contrato.dataInicio, dataVisita);
  const duracao = getDuracaoMeses(contrato);
  if (mes > duracao) return []; // visita fora do período contratado
  return getFreqsPrevistasPorMes(mes);
}

// Gera o cronograma completo de visitas mensais previstas para o contrato
// Cada entrada: { mes, data: "YYYY-MM-DD", freqs: [...] }
function gerarCronogramaContrato(contrato) {
  if (!contrato?.dataInicio) return [];
  const duracao = getDuracaoMeses(contrato);
  const ini = new Date(contrato.dataInicio + "T00:00:00");
  const out = [];
  for (let m = 1; m <= duracao; m++) {
    const d = addMesesLocal(ini, m - 1); // dia 29–31 vira o último dia dos meses mais curtos
    out.push({
      mes: m,
      data: isoLocal(d),
      freqs: getFreqsPrevistasPorMes(m),
    });
  }
  return out;
}

// Última inspeção de cada frequência feita para um contrato (a partir dos relatórios)
function calcularUltimaPorFreq(relatorios) {
  const map = {};
  relatorios
    .filter(r => r.tipo === "itm")
    .forEach(r => {
      const freqs = getVisitaFreqs(r);
      freqs.forEach(f => {
        if (!map[f] || (r.dataEmissao || "") > (map[f].dataEmissao || "")) {
          map[f] = r;
        }
      });
    });
  return map;
}

const FREQ_COLOR = {
  Semanal:    { bg: C.okLight,     fg: C.ok },
  Mensal:     { bg: C.blueLight,   fg: C.blue },
  Trimestral: { bg: C.purpleLight, fg: C.purple },
  Semestral:  { bg: "#FCE7F3",     fg: "#9D174D" },
  Anual:      { bg: C.amberLight,  fg: C.amber },
};

// ═══════════════════════════════════════════════════════════════════════════
// CHECKLISTS NFPA 25 (E-Forms NFPA 20)
// Estrutura: NFPA25[freq] = [ { grupo: "...", items: [...] }, ... ]
// ═══════════════════════════════════════════════════════════════════════════
const NFPA25 = {
  Semanal: [
    { grupo: "Sala de Bombas — Inspeção", items: [
      "O calor na sala das bombas é de 40°F (4°C) ou superior",
      "As grelhas de entrada de ar na sala das bombas parecem operacionais",
      "O calor na sala das bombas não é inferior a 70°F (21°C) para a bomba do motor a diesel sem aquecedor do motor",
    ]},
    { grupo: "Sistemas de Bomba — Inspeção", items: [
      "Água em excesso no chão",
      "A proteção do acoplamento está no lugar",
      "As válvulas de sucção, descarga e desvio da bomba estão abertas",
      "Nenhum vazamento de tubulações ou mangueiras",
      "Bomba de incêndio vazando uma gota de água por segundo nas vedações",
      "A pressão da linha de sucção é normal",
      "A pressão da linha do sistema é normal",
      "O reservatório de sucção está cheio",
      "As telas de sucção de poço úmido estão desobstruídas e no lugar",
      "Válvulas de teste de fluxo na posição fechada, conexão da mangueira fechada e linha de teste livre de água",
    ]},
    { grupo: "Sistemas Elétricos — Inspeção", items: [
      "A luz piloto do controlador (alimentação ligada) está acesa",
      "A luz de energia normal do interruptor de transferência está acesa",
      "O interruptor de isolamento da energia em espera está fechado",
      "A luz de alarme de fase inversa não está acesa",
      "A luz de rotação da fase normal está acesa",
      "O nível de óleo no visor do motor vertical está normal",
      "A bomba de manutenção de pressão (jockey) tem energia",
    ]},
    { grupo: "Sistemas de Motor a Diesel — Inspeção", items: [
      "O tanque de combustível diesel está pelo menos dois terços cheio",
      "O interruptor de seleção do controlador está na posição \"auto\"",
      "As leituras de tensão para as baterias (2) são normais",
      "As leituras atuais de carregamento são normais para baterias",
      "As luzes piloto das baterias estão \"acesas\" ou as luzes piloto de falhas da bateria estão \"apagadas\"",
      "Todas as luzes piloto de alarme estão \"apagadas\"",
      "Registro do tempo de funcionamento do motor a partir do medidor",
      "O nível de óleo é normal nas bombas de acionamento de engrenagem em ângulo reto",
      "O nível do óleo do cárter é normal",
      "O nível da água de resfriamento é normal",
      "O nível de eletrólito nas baterias é normal",
      "Os terminais da bateria estão livres de corrosão",
      "O aquecedor de jaqueta de água está operacional",
      "Tensão de partida excede 9V (12V) ou 18V (24V) (Alt. ITM A.8.1.1.2)",
      "A bomba de água não está vazando (Alt. ITM A.8.1.1.2)",
      "Funcionamento do aquecedor de óleo lubrificante (Alt. ITM A.8.1.1.2)",
      "Verificação de água no tanque de combustível diesel (Alt. ITM A.8.1.1.2)",
      "Mangueiras e conexões flexíveis em boas condições (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Vapor — Inspeção", items: [
      "Para bombas movidas a vapor, a pressão do vapor é normal",
    ]},
    { grupo: "Sistema de Exaustão — Inspeção", items: [
      "Exame do sistema de escape quanto a vazamentos (Alt. ITM A.8.1.1.2)",
      "Armadilha de drenagem de condensado (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistemas de Bomba — Testes Operacionais", items: [
      "Operação da bomba de incêndio por 10 minutos (30 minutos para diesel)",
      "Verificação do aperto da gaxeta (vazamento leve sem fluxo)",
      "Registro da pressão de sucção do manômetro (mca/bar/psi)",
      "Registro da pressão de descarga do medidor (mca/bar/psi)",
      "Ajuste dos bucins, se necessário",
      "Verificação da existência de ruídos ou vibrações anormais",
      "Verificação de superaquecimento em caixas, rolamentos ou corpo da bomba",
      "Registro da pressão inicial da bomba (mca/bar/psi)",
      "Registro das pressões mais alta e mais baixa no registro de controle",
      "A válvula de alívio de circulação funciona corretamente",
      "Verificação dos solenoides do sistema de combustível (Alt. ITM A.8.1.1.2)",
      "Verificação da chave-boia do tanque (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistemas Elétricos — Testes", items: [
      "Controlador de tempo no primeiro passo (para tensão/corrente reduzida)",
      "Observação do tempo para o motor acelerar até velocidade máxima",
      "Registro de tempo de funcionamento da bomba após partida (parada automática)",
    ]},
    { grupo: "Sistemas de Motor a Diesel — Testes", items: [
      "Registro de tempo para o motor diesel dar partida",
      "Registro de tempo para o motor diesel atingir velocidade de operação",
      "Verificação do manômetro, indicador de velocidade e temperatura da água e do óleo durante funcionamento",
      "Verificação do trocador de calor quanto ao fluxo de água de resfriamento",
      "Operação do regulador de velocidade (somente motor de combustão interna)",
    ]},
    { grupo: "Sistema de Vapor — Testes", items: [
      "Observação do tempo para a turbina atingir velocidade de operação",
      "Registro da pressão do vapor para bombas operadas a vapor",
      "Verificação da armadilha de vapor",
      "Verificação da válvula de alívio de vapor",
    ]},
  ],
  Mensal: [
    { grupo: "Bomba de Incêndio Elétrica — Teste", items: [
      "Teste sem fluxo - operação por 10 minutos",
      "Verificação do aperto da gaxeta (vazamento leve sem fluxo)",
      "Registro da pressão de sucção do manômetro (mca/bar/psi)",
      "Registro da pressão de descarga do manômetro (mca/bar/psi)",
      "Ajuste dos bucins, se necessário",
      "Verificação da existência de ruídos ou vibrações anormais",
      "Verificação de superaquecimento (caixas, rolamentos ou corpo da bomba)",
      "Registro da pressão inicial da bomba",
      "Registro das pressões mais alta e mais baixa no registro de controle",
      "Funcionamento correto da válvula de alívio de circulação",
      "Controlador de tempo no primeiro passo (para tensão/corrente reduzida)",
    ]},
    { grupo: "Sistema Elétrico — Inspeção", items: [
      "Funcionamento do interruptor de isolamento e disjuntor (Alt. ITM A.8.1.1.2)",
      "Disjuntores ou fusíveis (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Bateria — Inspeção/Teste", items: [
      "Exterior da caixa limpo e seco (Alt. ITM A.8.1.1.2)",
      "Gravidade específica ou estado da carga (Alt. ITM A.8.1.1.2)",
      "Carregador e taxa de carregamento (Alt. ITM A.8.1.1.2)",
      "Carga equalizada (Alt. ITM A.8.1.1.2)",
    ]},
  ],
  Trimestral: [
    { grupo: "Combustível do Sistema de Motor a Diesel", items: [
      "Limpeza do filtro ou perna de sujeira (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Lubrificação", items: [
      "Inspeção/Troca/Teste do respiro do cárter (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Resfriamento", items: [
      "Limpeza do filtro de água (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Exaustão", items: [
      "Inspeção de isolamento e riscos de incêndio (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Bateria", items: [
      "Inspeção: terminais limpos e apertados (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema Elétrico", items: [
      "Inspeção do atrito de fios sujeitos a movimentos (Alt. ITM A.8.1.1.2)",
    ]},
  ],
  Semestral: [
    { grupo: "Sistema Elétrico — Bomba Elétrica", items: [
      "Teste: operação dos meios de partida manual (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Resfriamento", items: [
      "Teste: nível de proteção anticongelante (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Exaustão", items: [
      "Inspeção: seção de exaustão flexível (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema Elétrico — Diesel", items: [
      "Inspeção/Teste: operação de segurança e alarmes (Alt. ITM A.8.1.1.2)",
      "Limpeza: caixas, painéis e gabinetes (Alt. ITM A.8.1.1.2)",
    ]},
  ],
  Anual: [
    { grupo: "Bomba de Incêndio Elétrica — Anual", items: [
      "Interruptor de transferência de energia (conforme necessário)",
      "Teste: verificação de alinhamento paralelo e angular",
      "Inspeção: válvula de alívio principal",
      "Teste: verificação de mangueiras e conexões flexíveis",
      "Inspeção: peças do encanamento — painéis interno e externo",
      "Inspeção: verificação de folga do eixo da bomba",
      "Inspeção/Troca: precisão dos manômetros e sensores",
      "Inspeção: alinhamento do acoplamento da bomba",
    ]},
    { grupo: "Transmissão Mecânica", items: [
      "Troca: lubrificação do acoplamento (Alt. ITM A.8.1.1.2)",
      "Troca: lubrificação da transmissão de engrenagem em ângulo reto (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema Elétrico — Anual", items: [
      "Inspeção: corrosão nas placas de circuito impresso",
      "Inspeção: isolamento de cabos/fios rachado",
      "Teste: módulo de controle eletrônico (ECM)",
      "Manutenção: ânodo de sacrifício",
      "Teste: disjuntor de disparo (Alt. ITM A.8.1.1.2)",
      "Inspeção/Teste: operação dos meios de partida manual de emergência (Alt. ITM A.8.1.1.2)",
      "Inspeção: lubrificação das partes móveis mecânicas (exceto partida e relé) (Alt. ITM A.8.1.1.2)",
      "Inspeção: calibração de configurações do pressostato (Alt. ITM A.8.1.1.2)",
      "Inspeção: lubrificação dos rolamentos do motor (Alt. ITM A.8.1.1.2)",
      "Inspeção: vazamentos nas partes do encanamento (Alt. ITM A.8.1.1.2)",
      "Inspeção: sinais de água em peças elétricas (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Bomba Diesel — Bomba", items: [
      "Teste: válvula de alívio principal",
    ]},
    { grupo: "Combustível Diesel", items: [
      "Teste: combustível diesel",
      "Teste: sinais de alarme da bomba de combustível",
      "Manutenção: sistema de manutenção de combustível ativo",
      "Limpeza: filtro",
      "Limpeza: água/material estranho no tanque",
      "Inspeção/Teste: aberturas de ventilação e tubulação de transbordo desobstruídas",
      "Inspeção: tubulação de tanque de combustível (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Lubrificação — Anual", items: [
      "Inspeção/Troca: lubrificação dos rolamentos",
      "Troca: óleo (máximo de 50 horas)",
      "Troca: filtro(s) de óleo (máximo de 50 horas)",
    ]},
    { grupo: "Sistema de Resfriamento — Anual", items: [
      "Manutenção: substituição do filtro de água circulante",
      "Teste: sinal de supervisão para alta temperatura da água de resfriamento",
      "Inspeção: anticongelante (Alt. ITM A.8.1.1.2)",
      "Limpeza: trocador de calor (Alt. ITM A.8.1.1.2)",
      "Inspeção/Troca: trabalhos/grelhas do duto (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Exaustão — Anual", items: [
      "Inspeção: verificação do sistema de exaustão e drenagem da armadilha de condensado",
      "Teste: contrapressão excessiva",
      "Inspeção: apoios e suporte em bom estado (Alt. ITM A.8.1.1.2)",
    ]},
    { grupo: "Sistema de Bateria — Anual", items: [
      "Manutenção: gravidade específica, estado da carga e taxas do carregador",
      "Manutenção: terminais limpos",
      "Manutenção: tensão >9V (12V) ou >18V (24V)",
    ]},
    { grupo: "Sistema Elétrico Diesel — Anual", items: [
      "Inspeção: corrosão nas placas de circuito impresso",
      "Teste: módulo de controle elétrico (ECM)",
      "Inspeção: aperto dos conectores de controle e cabeamento de energia (Alt. ITM A.8.1.1.2)",
      "Inspeção: voltímetro e amperímetro para precisão (5%) (Alt. ITM A.8.1.1.2)",
      "Inspeção: isolamento de cabos/fios rachado (Alt. ITM A.8.1.1.2)",
      "Inspeção: vazamentos nas partes do encanamento (Alt. ITM A.8.1.1.2)",
      "Inspeção: sinais de água em peças elétricas (Alt. ITM A.8.1.1.2)",
    ]},
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// CHECKLISTS GERMEK (Inspeção / Preventiva / Corretiva)
// ═══════════════════════════════════════════════════════════════════════════
const INSTALACAO_SKID = [
  "Instalação e fixação da base do Skid e/ou Container no contra piso",
  "Instalação do aterramento da base do Skid e/ou Container",
  "Instalação do dreno de água da válvula de alívio de carcaça",
  "Instalação da tubulação de sucção entre o reservatório ao skid e/ou container",
  "Instalação da tubulação de recalque entre a linha de pressão ao skid e/ou container",
  "Instalação da tubulação de retorno após o west cone (linha de retorno)",
  "Instalação de cobertura contra intempéries (sol/chuva)",
  "Providenciar alimentação \"AC\" no painel da bomba elétrica",
  "Informar as dimensões de entrada e saída de Ar para a Casa de Bombas",
  "Verificar nível de óleo lubrificante nos mancais da bomba",
  "Verificação do nível de óleo do motor (motor diesel)",
  "Verificação do nível de líquido de arrefecimento (motor diesel)",
  "Reservatório de água abastecido e com capacidade de testes de performance",
  "Instalação do dreno dos trocadores de calor (motor diesel)",
  "Instalação da caixa de contenção do tanque de combustível",
  "Instalação do tanque de diesel conforme guia de instalação",
  "Interligação da alimentação e retorno de combustível (motor diesel)",
  "Fixação do tanque de combustível",
  "Instalação do aterramento na carcaça do tanque combustível",
  "Tanque de diesel abastecido c/ pelo menos 50% do volume",
  "Instalação do respiro do tanque de combustível",
  "Efetuar limpeza da tubulação de sucção",
];
const BOMBA_CENTRIFUGA = [
  "Substituição do óleo hidráulico da bomba",
  "Engraxar os rolamentos dos mancais",
  "Ajustes e/ou embuchamento da gaxeta",
  "Substituição da gaxeta e/ou selo mecânico",
];
const TESTES_DIESEL = [
  "Os equipamentos estão preparados para iniciar os testes?",
  "Verificar tensão de alimentação do painel, conforme projeto",
  "Verificar parametrização do painel (quando necessário)",
  "Verificar componentes internos dos painéis",
  "Energizar painel", "Ligar disjuntores",
  "Verificar indicação dos voltímetros e amperímetros",
  "Simular testes de lâmpadas",
  "Testar desliga alarme", "Testar reposição de defeito",
  "Testar chave de comando (Manual / Desliga / Automático)",
  "Testar partida manual", "Testar partida automática",
  "Testar ciclo de partidas (motor diesel)",
  "Testar indicação de falha de partida",
  "Testar partida via teste de equipamento",
  "Testar partida via contatos secos",
  "Testar parada", "Testar indicação de operação automática",
  "Testar indicação de motor operando",
  "Testar indicação de falta de tensão AC",
  "Testar indicação de defeito de bateria 1",
  "Testar indicação de defeito de bateria 2",
  "Testar indicação de defeito do carregador 1",
  "Testar indicação de defeito do carregador 2",
  "Testar indicação de alarme desligado",
  "Testar indicação de baixa pressão de óleo",
  "Testar indicação de temperatura anormal",
  "Testar indicação de sobre-velocidade (Over Speed)",
  "Testar indicação de baixo nível de combustível",
  "Testar indicação de baixa pressão hidráulica na rede",
  "Testar contatos remotos em borneiras",
  "Coleta de backup no painel após os testes",
];
const MANUT_MOTOR_DIESEL = [
  "Testar o equipamento antes de iniciar a manutenção",
  "Verificar nível do fluido de arrefecimento",
  "Verificar vazamentos no motor",
  "Verificar tubos e conexões (mangueiras/conexões)",
  "Verificar indicador de restrição no filtro de ar",
  "Verificar nível do tanque de combustível",
  "Verificar tensão das correias",
  "Verificar radiador (quando aplicado)",
  "Limpar filtros Y do barrilete do trocador de calor",
  "Ligar o equipamento por no mínimo 30 minutos",
  "Verificar estabilidade de rotação",
  "Verificar temperatura do motor em funcionamento",
  "Motor sem ruídos e vibrações anormais",
  "Limpar e reapertar terminais/polos da(s) bateria(s)",
  "Verificar nível da solução de bateria",
  "Tensionar a correia do alternador",
  "Verificar apertos dos parafusos de fixação do motor",
  "Substituir o óleo lubrificante",
  "Substituir o(s) filtro(s) de óleo lubrificante",
  "Substituir o(s) filtro(s) de combustível",
  "Limpar pré-filtro da bomba alimentadora de combustível",
  "Drenar volume morto do tanque de combustível",
  "Substituir o líquido de arrefecimento",
  "Substituir o(s) filtro(s) de ar",
  "Substituir a(s) bateria(s)",
  "Descarte da bateria",
  "Substituir a(s) correia(s)",
  "Verificar folga de válvulas",
  "Verificar estado do acoplamento da hélice",
  "Descarte de resíduos (óleo / graxa / filtros)",
];
const TESTES_ELETRICA = [
  "Os equipamentos estão preparados para iniciar os testes?",
  "Verificar tensão de alimentação do painel",
  "Verificar fechamento elétrico do conjunto moto-bomba",
  "Verificar parametrização do painel",
  "Verificar componentes internos dos painéis",
  "Energizar painel", "Ligar disjuntores",
  "Testar indicação do painel energizado",
  "Verificar indicação de voltímetros e amperímetros",
  "Simular testes de lâmpadas",
  "Testar desliga alarme", "Testar reposição de defeito",
  "Testar chave de comando (Manual / Desliga / Automático)",
  "Testar partida manual", "Testar partida automática",
  "Testar partida via teste de equipamento", "Testar parada",
  "Testar indicação de operação automática",
  "Testar indicação de motor operando",
  "Testar indicação de alarme falta de fase",
  "Testar indicação de sobrecarga no motor",
  "Testar indicação de defeito na soft-start",
  "Testar indicação de falta de tensão AC",
  "Testar indicação de alarme desligado",
  "Testar indicação de baixa pressão hidráulica",
  "Testar contatos remotos em borneiras",
  "Coleta de backup no painel após os testes",
];
const TESTES_JOCKEY = [
  "Verificar tensão de alimentação do painel",
  "Verificar fechamento elétrico da bomba jockey",
  "Verificar componentes internos dos painéis",
  "Verificar fechamento do transformador de comando",
  "Energizar painel", "Ligar disjuntores",
  "Teste indicação de sobrecarga",
  "Testar chave de comando (Manual / Desliga / Automático)",
  "Testar partida manual", "Testar partida automática",
  "Teste indicação jockey operando",
  "Parâmetros de ajuste do relé de sobrecarga (I)",
  "Parâmetros de ajuste do Disjuntor Motor (I)",
  "Verificar pressão de shut off",
  "Verificar sentido de giro da bomba",
];
const MANUT_JOCKEY = [
  "Inspecionar e limpar o filtro \"Y\" na sucção",
  "Lubrificação dos mancais",
  "Verificação de ruídos nos rolamentos",
  "Bomba jockey livre de vazamentos",
];
const FLOW_METER = [
  "Verificar posição correta do sentido de fluxo do medidor",
  "Verificar instalação das válvulas anterior e posterior ao medidor",
  "Verificar as distâncias entre as válvulas e o medidor",
  "Verificar instrumento de leitura instalado junto ao venture",
  "Verificar escala do instrumento compatível com a vazão",
];
const VALVULA_ALIVIO = [
  "Tubulação derivando entre recalque e retenção",
  "Waste Cone instalado após a saída da válvula",
  "Sentido de fluxo da válvula correto",
  "Tubo de descarga instalado corretamente",
  "Posição de instalação conforme manual do fabricante",
];
const INSPECAO_GERAL = [
  "Inspeção dos barriletes (leituras, instalação)",
  "Inspeção da sucção (comprimento, junta flexível, manovacuômetro)",
  "Inspeção dos pontos de fixação da base",
  "Inspeção do painel local e principal",
  "Inspeção do alinhamento do acoplamento",
];

const TIPOS_EQUIPAMENTO = {
  diesel: { nome: "Motobomba Diesel", Icon: Flame, sections: [
    { id: "bomba",   titulo: "Manutenção Preventiva da Bomba Centrífuga", items: BOMBA_CENTRIFUGA },
    { id: "testes",  titulo: "Testes Funcionais e Alarmes da Motobomba Diesel", items: TESTES_DIESEL },
    { id: "inspecao",titulo: "Inspeção Geral das Instalações", items: INSPECAO_GERAL },
    { id: "motor",   titulo: "Manutenção Preventiva Motor Diesel", items: MANUT_MOTOR_DIESEL },
  ]},
  eletrica: { nome: "Motobomba Elétrica", Icon: Wrench, sections: [
    { id: "bomba",   titulo: "Manutenção Preventiva da Bomba Centrífuga", items: BOMBA_CENTRIFUGA },
    { id: "testes",  titulo: "Testes Funcionais e Alarmes da Motobomba Elétrica", items: TESTES_ELETRICA },
    { id: "inspecao",titulo: "Inspeção Geral das Instalações", items: INSPECAO_GERAL },
  ]},
  jockey: { nome: "Bomba Jockey", Icon: ClipboardList, sections: [
    { id: "inspecao",titulo: "Inspeção Geral das Instalações da Motobomba Jockey", items: INSPECAO_GERAL },
    { id: "testes",  titulo: "Testes Funcionais Bomba Jockey", items: TESTES_JOCKEY },
    { id: "manut",   titulo: "Manutenção Motobomba Jockey", items: MANUT_JOCKEY },
  ]},
  flowmeter: { nome: "Flow Meter", Icon: ClipboardList, sections: [
    { id: "inspecao", titulo: "Inspeção do Medidor de Vazão (Flow Meter)", items: FLOW_METER },
  ]},
  valvula: { nome: "Válvula de Alívio", Icon: ClipboardList, sections: [
    { id: "inspecao", titulo: "Inspeção da Instalação da Válvula de Alívio", items: VALVULA_ALIVIO },
  ]},
};

// ═══════════════════════════════════════════════════════════════════════════
// DESPACHO — checklist pré-visita (5 grupos, 100% obrigatório)
// ═══════════════════════════════════════════════════════════════════════════
const DESPACHO_GRUPOS = [
  { titulo: "Comunicação", items: ["Cliente avisado sobre a visita", "Confirmado horário e local de entrada", "Liberação de acesso solicitada", "Procedimento de segurança do local enviado"] },
  { titulo: "Logística",   items: ["Passagem aérea reservada (se aplicável)", "Hospedagem reservada", "Veículo locado/reservado", "Diárias/adiantamento liberados"] },
  { titulo: "Ferramentas e EPI", items: ["EPI completo conferido", "Kit de ferramentas básicas conferido", "Multímetro, alicate amperímetro e manovacuômetro", "Tablet/celular com app LS Fire carregado"] },
  { titulo: "Documentação", items: ["Contrato e escopo da visita impressos", "Relatório da última visita disponível", "Diagramas elétricos e P&IDs", "Procedimentos operacionais NFPA 20 e NBR 16704"] },
  { titulo: "Veículo",      items: ["KM inicial registrado", "Tanque cheio", "Documentação do veículo em dia", "Revisão em dia"] },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function fmtDate(d) { if (!d) return "—"; try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; } }
function fmtDateTime(d) { if (!d) return "—"; try { return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; } }
function fmtCurrency(n) { if (n == null) return "—"; return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtMonth(d) { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); }
function calcHoras(ini, fim) { const d = (new Date(fim) - new Date(ini)) / 1000 / 60 / 60; if (!isFinite(d) || d < 0) return "—"; return d.toFixed(1) + "h"; }

const NFPA20_UNIT_OPTIONS = {
  flow: [
    { id: "m3h", label: "m³/h" },
    { id: "lpm", label: "L/min" },
    { id: "gpm", label: "gpm" },
  ],
  pressure: [
    { id: "mca", label: "mca" },
    { id: "bar", label: "bar" },
    { id: "kpa", label: "kPa" },
    { id: "psi", label: "psi" },
  ],
  pitot: [
    { id: "mca", label: "mca" },
    { id: "bar", label: "bar" },
    { id: "kpa", label: "kPa" },
    { id: "psi", label: "psi" },
  ],
  oilPressure: [
    { id: "bar", label: "bar" },
    { id: "psi", label: "psi" },
    { id: "kpa", label: "kPa" },
  ],
  diameter: [
    { id: "mm", label: "mm" },
    { id: "in", label: "pol." },
  ],
  temperature: [
    { id: "c", label: "°C" },
    { id: "f", label: "°F" },
  ],
  power: [
    { id: "kw", label: "kW" },
    { id: "hp", label: "HP" },
  ],
};

const NFPA20_UNIT_KEY = {
  flow: "flowUnit",
  pressure: "pressureUnit",
  pitot: "pitotUnit",
  oilPressure: "oilPressureUnit",
  diameter: "diameterUnit",
  temperature: "temperatureUnit",
  power: "powerUnit",
  voltage: "voltageUnit",
  current: "currentUnit",
  rotation: "rotationUnit",
};

function toNum(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  // Com vírgula: a vírgula é o decimal e os pontos são milhar ("1.250,5" = 1250,5).
  // Sem vírgula: UM ponto é decimal ("1.250" = 1,25, como digita quem usa ponto); mais de um ponto é milhar ("1.250.000").
  const pontos = (raw.match(/\./g) || []).length;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : pontos > 1
      ? raw.replace(/\./g, "")
    : raw;
  const n = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function fmtMeasure(value, digits = 0) {
  const n = typeof value === "number" ? value : toNum(value);
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function fmtInputNumber(value, kind = "default") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const digits = { flow: 1, pressure: 1, pitot: 2, diameter: 2, temperature: 1, power: 1, default: 2 }[kind] ?? 2;
  // sem separador de milhar: "1.250" seria lido de volta como 1,25 (ver toNum)
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits, useGrouping: false });
}
function roundUp(value, step) {
  if (!Number.isFinite(value) || value <= 0) return step;
  return Math.ceil(value / step) * step;
}
function getNfpa20Config(teste) {
  const saved = teste?.nfpa20 || {};
  const cfg = { ...createNfpa20TestData(teste?.tipo), ...saved };
  if (Object.keys(saved).length > 0 && !saved.flowUnit) {
    cfg.flowUnit = "gpm";
    cfg.pressureUnit = "mca";
    cfg.pitotUnit = "psi";
    cfg.diameterUnit = "in";
    cfg.temperatureUnit = "c";
    cfg.powerUnit = "hp";
    cfg.oilPressureUnit = "bar";
  }
  return cfg;
}
function getUnitLabel(kind, unit) {
  if (kind === "voltage") return "V";
  if (kind === "current") return "A";
  if (kind === "rotation") return "rpm";
  return NFPA20_UNIT_OPTIONS[kind]?.find(opt => opt.id === unit)?.label || unit || "";
}
function getCfgUnit(cfg, kind) {
  const key = NFPA20_UNIT_KEY[kind];
  return key ? cfg?.[key] || createNfpa20TestData()[key] : "";
}
function fieldLabelWithUnit(field, cfg) {
  const kind = field.unitKind;
  if (!kind) return field.label;
  const unit = getUnitLabel(kind, getCfgUnit(cfg, kind));
  return unit ? `${field.label} (${unit})` : field.label;
}
function flowToGpm(value, unit = "m3h") {
  const n = typeof value === "number" ? value : toNum(value);
  if (n === null) return null;
  if (unit === "gpm") return n;
  if (unit === "lpm") return n / 3.785411784;
  return n / 0.227124707;
}
function flowFromGpm(value, unit = "m3h") {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (unit === "gpm") return value;
  if (unit === "lpm") return value * 3.785411784;
  return value * 0.227124707;
}
function pressureToPsi(value, unit = "mca") {
  const n = typeof value === "number" ? value : toNum(value);
  if (n === null) return null;
  if (unit === "psi") return n;
  if (unit === "bar") return n / 0.0689475729;
  if (unit === "kpa") return n / 6.89475729;
  return n / 0.7030695796;
}
function pressureFromPsi(value, unit = "mca") {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (unit === "psi") return value;
  if (unit === "bar") return value * 0.0689475729;
  if (unit === "kpa") return value * 6.89475729;
  return value * 0.7030695796;
}
function diameterToIn(value, unit = "mm") {
  const n = typeof value === "number" ? value : toNum(value);
  if (n === null) return null;
  return unit === "in" ? n : n / 25.4;
}
function diameterFromIn(value, unit = "mm") {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return unit === "in" ? value : value * 25.4;
}
function tempToC(value, unit = "c") {
  const n = typeof value === "number" ? value : toNum(value);
  if (n === null) return null;
  return unit === "f" ? (n - 32) * 5 / 9 : n;
}
function tempFromC(value, unit = "c") {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return unit === "f" ? (value * 9 / 5) + 32 : value;
}
function powerToHp(value, unit = "kw") {
  const n = typeof value === "number" ? value : toNum(value);
  if (n === null) return null;
  return unit === "hp" ? n : n / 0.745699872;
}
function powerFromHp(value, unit = "kw") {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return unit === "hp" ? value : value * 0.745699872;
}
const NFPA20_UNIT_CONVERTERS = {
  flow: {
    unitKey: "flowUnit",
    configKeys: ["vazaoNominalGpm"],
    rowKeys: ["fluxo"],
    toBase: flowToGpm,
    fromBase: flowFromGpm,
  },
  pressure: {
    unitKey: "pressureUnit",
    configKeys: ["pressaoNominalPsi", "pressaoChurnPsi", "pressao100Psi", "pressao150Psi"],
    rowKeys: ["pressaoSuccao", "pressaoRecalque"],
    toBase: pressureToPsi,
    fromBase: pressureFromPsi,
  },
  oilPressure: {
    unitKey: "oilPressureUnit",
    configKeys: [],
    rowKeys: ["pressaoOleo"],
    toBase: pressureToPsi,
    fromBase: pressureFromPsi,
  },
  pitot: {
    unitKey: "pitotUnit",
    configKeys: [],
    rowKeys: ["pitot1", "pitot2", "pitot3", "pitot4", "pitot5", "pitot6"],
    toBase: pressureToPsi,
    fromBase: pressureFromPsi,
  },
  diameter: {
    unitKey: "diameterUnit",
    configKeys: ["diametroBocalPol"],
    rowKeys: [],
    toBase: diameterToIn,
    fromBase: diameterFromIn,
  },
  temperature: {
    unitKey: "temperatureUnit",
    configKeys: [],
    rowKeys: ["temperatura"],
    toBase: tempToC,
    fromBase: tempFromC,
  },
  power: {
    unitKey: "powerUnit",
    configKeys: [],
    rowKeys: ["hpMotor"],
    toBase: powerToHp,
    fromBase: powerFromHp,
  },
};
function convertUnitValue(value, kind, fromUnit, toUnit) {
  const def = NFPA20_UNIT_CONVERTERS[kind];
  if (!def || value === "" || value === null || value === undefined) return value || "";
  const base = def.toBase(value, fromUnit);
  const next = def.fromBase(base, toUnit);
  return fmtInputNumber(next, kind);
}
function convertNfpa20Unit(teste, kind, nextUnit) {
  const def = NFPA20_UNIT_CONVERTERS[kind];
  if (!def) return teste;
  const cfg = getNfpa20Config(teste);
  const currentUnit = cfg[def.unitKey] || createNfpa20TestData(teste?.tipo)[def.unitKey];
  if (currentUnit === nextUnit) return { ...teste, nfpa20: { ...cfg, [def.unitKey]: nextUnit } };

  const nfpa20 = { ...cfg, [def.unitKey]: nextUnit };
  def.configKeys.forEach(key => {
    nfpa20[key] = convertUnitValue(cfg[key], kind, currentUnit, nextUnit);
  });
  const linhas = (teste.linhas || []).map(linha => {
    const nextLinha = { ...linha };
    def.rowKeys.forEach(key => {
      if (nextLinha[key] !== undefined) nextLinha[key] = convertUnitValue(nextLinha[key], kind, currentUnit, nextUnit);
    });
    return nextLinha;
  });
  return { ...teste, nfpa20, linhas };
}
function getLinhaPercentual(linha) {
  const raw = String(linha?.id || linha?.teste || "").replace("%", "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function calcPitotMedia(linha, cfg, output = "display") {
  const unit = getCfgUnit(cfg, "pitot");
  const vals = ["pitot1", "pitot2", "pitot3", "pitot4", "pitot5", "pitot6"]
    .map(k => pressureToPsi(linha?.[k], unit))
    .filter(v => v !== null && v >= 0);
  if (!vals.length) return null;
  const avgPsi = vals.reduce((a, b) => a + b, 0) / vals.length;
  return output === "psi" ? avgPsi : pressureFromPsi(avgPsi, unit);
}
function calcVazaoPeloPitot(linha, cfg) {
  const pitot = calcPitotMedia(linha, cfg, "psi");
  const diametro = diameterToIn(cfg?.diametroBocalPol, getCfgUnit(cfg, "diameter"));
  const coef = toNum(cfg?.coefBocal) ?? 0.97;
  if (pitot === null || !diametro || diametro <= 0 || !coef || coef <= 0) return null;
  return 29.83 * coef * Math.pow(diametro, 2) * Math.sqrt(pitot);
}
function calcVazaoLinha(linha, cfg) {
  return flowToGpm(linha?.fluxo, getCfgUnit(cfg, "flow")) ?? calcVazaoPeloPitot(linha, cfg);
}
function calcPressaoLiquida(linha, cfg) {
  const unit = getCfgUnit(cfg, "pressure");
  const suc = pressureToPsi(linha?.pressaoSuccao, unit);
  const rec = pressureToPsi(linha?.pressaoRecalque, unit);
  if (suc === null || rec === null) return null;
  return rec - suc;
}
function calcPressaoAjustadaRpm(linha, cfg) {
  const net = calcPressaoLiquida(linha, cfg);
  const rpm = toNum(linha?.rotacao);
  const rpmNominal = toNum(cfg?.rpmNominal);
  if (net === null || !rpm || !rpmNominal) return null;
  return net * Math.pow(rpmNominal / rpm, 2);
}
function calcHpBomba(linha, cfg) {
  const q = calcVazaoLinha(linha, cfg);
  const net = calcPressaoLiquida(linha, cfg);
  const eff = toNum(linha?.eficiencia);
  if (!q || net === null || !eff || eff <= 0) return null;
  return (q * net) / (3960 * (eff / 100));
}
function calcCorrenteMedia(linha) {
  const vals = ["correnteL1", "correnteL2", "correnteL3"].map(k => toNum(linha?.[k])).filter(v => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function getReferenciaPressaoPorPercentual(percent, cfg) {
  const unit = getCfgUnit(cfg, "pressure");
  const nominal = pressureToPsi(cfg?.pressaoNominalPsi, unit);
  if (percent === 0) return pressureToPsi(cfg?.pressaoChurnPsi, unit) ?? (nominal ? nominal * 1.4 : null);
  if (percent === 100) return pressureToPsi(cfg?.pressao100Psi, unit) ?? nominal;
  if (percent === 150) return pressureToPsi(cfg?.pressao150Psi, unit) ?? (nominal ? nominal * 0.65 : null);
  return null;
}
function buildPumpCurveSeries(teste) {
  const cfg = getNfpa20Config(teste);
  const flowUnit = getCfgUnit(cfg, "flow");
  const pressureUnit = getCfgUnit(cfg, "pressure");
  const powerUnit = getCfgUnit(cfg, "power");
  const nominalFlow = flowToGpm(cfg.vazaoNominalGpm, flowUnit);
  const linhas = (teste?.linhas || []).map(linha => {
    const percent = getLinhaPercentual(linha);
    return {
      percent,
      flow: calcVazaoLinha(linha, cfg) ?? (nominalFlow && percent !== null ? nominalFlow * percent / 100 : null),
      suction: pressureToPsi(linha.pressaoSuccao, pressureUnit),
      discharge: pressureToPsi(linha.pressaoRecalque, pressureUnit),
      net: calcPressaoLiquida(linha, cfg),
      adjusted: calcPressaoAjustadaRpm(linha, cfg),
      hpPump: calcHpBomba(linha, cfg),
      hpMotor: powerToHp(linha.hpMotor, powerUnit),
      amps: calcCorrenteMedia(linha),
    };
  }).filter(p => p.flow !== null);

  const referencePercents = [0, 100, 150];
  const reference = referencePercents.map(percent => ({
    percent,
    flow: nominalFlow ? nominalFlow * percent / 100 : null,
    pressure: getReferenciaPressaoPorPercentual(percent, cfg),
  })).filter(p => p.flow !== null && p.pressure !== null);

  const pointsFor = (key, kind = "pressure") => linhas
    .filter(p => p[key] !== null)
    .sort((a, b) => a.flow - b.flow)
    .map(p => {
      const y = kind === "power" ? powerFromHp(p[key], powerUnit)
              : kind === "raw" ? p[key]
              : pressureFromPsi(p[key], pressureUnit);
      return { x: flowFromGpm(p.flow, flowUnit), y, percent: p.percent };
    });

  return {
    cfg,
    reference: reference.map(p => ({ x: flowFromGpm(p.flow, flowUnit), y: pressureFromPsi(p.pressure, pressureUnit), percent: p.percent })),
    discharge: pointsFor("discharge"),
    suction: pointsFor("suction"),
    net: pointsFor("net"),
    adjusted: pointsFor("adjusted"),
    hpPump: pointsFor("hpPump", "power"),
    hpMotor: pointsFor("hpMotor", "power"),
    amps: pointsFor("amps", "raw"),
  };
}
function makeIniciais(nome) {
  const parts = (nome || "").trim().split(/\s+/);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function randomTecColor() {
  const cores = ["#FF6600","#2563EB","#16A34A","#9333EA","#DC2626","#0EA5E9","#D97706","#DB2777"];
  return cores[Math.floor(Math.random() * cores.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTES BÁSICOS
// ═══════════════════════════════════════════════════════════════════════════
function Pill({ children, bg, fg, onClick }) {
  return (
    <span onClick={onClick}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${onClick ? "cursor-pointer" : ""}`}
          style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

function SyncStatusPanel({ status, onSync }) {
  const online = status?.online !== false;
  const pending = status?.pending || 0;
  const busy = !!status?.syncing;
  const lastSync = status?.lastSync ? fmtDateTime(status.lastSync) : null;
  const Icon = online ? Wifi : WifiOff;
  const title = online ? (pending ? `${pending} pendente${pending > 1 ? "s" : ""}` : "Online") : "Offline";
  const subtitle = busy
    ? "Sincronizando dados..."
    : !online
      ? "Relatórios salvos no celular"
      : pending
        ? "Toque para enviar"
        : lastSync
          ? `Atualizado ${lastSync}`
          : "Pronto para uso offline";

  return (
    <div className="mx-3 mb-3 rounded-lg border p-3" style={{ borderColor: online ? C.border : C.amber, background: online ? C.white : C.amberLight }}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color: online ? C.ok : C.amber }} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black truncate" style={{ color: C.gray }}>{title}</div>
          <div className="text-[10px] leading-snug" style={{ color: C.grayMid }}>{subtitle}</div>
        </div>
      </div>
      <button
        onClick={onSync}
        disabled={!online || busy}
        className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-50"
        style={{ borderColor: C.border, color: online ? C.orange : C.grayMid, background: C.white }}
      >
        <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
        Sincronizar
      </button>
      {status?.error && <div className="mt-2 text-[10px] leading-snug" style={{ color: C.nok }}>{status.error}</div>}
    </div>
  );
}

function PumpCurveChart({ teste, compact = false }) {
  const series = buildPumpCurveSeries(teste);
  const defs = [
    { key: "reference", label: "Curva fabricante/projeto", color: C.gray, dash: "" },
    { key: "discharge", label: "Recalque", color: C.blue, dash: "" },
    { key: "suction", label: "Sucção", color: C.amber, dash: "6 4" },
    { key: "net", label: "Pressão líquida", color: C.orangeDark, dash: "" },
    { key: "adjusted", label: "Líquida ajustada RPM", color: C.ok, dash: "4 4" },
  ].map(d => ({ ...d, points: series[d.key] || [] })).filter(d => d.points.length);

  const allPoints = defs.flatMap(d => d.points);
  const cfg = series.cfg;
  const flowUnit = getCfgUnit(cfg, "flow");
  const pressureUnit = getCfgUnit(cfg, "pressure");
  const nominalFlow = flowFromGpm(flowToGpm(cfg.vazaoNominalGpm, flowUnit), flowUnit);
  const nominalPressure = pressureFromPsi(pressureToPsi(cfg.pressaoNominalPsi, pressureUnit), pressureUnit);
  const maxX = roundUp(Math.max(10, nominalFlow ? nominalFlow * 1.6 : 0, ...allPoints.map(p => p.x || 0)), 100);
  const maxY = roundUp(Math.max(20, nominalPressure ? nominalPressure * 1.6 : 0, ...allPoints.map(p => p.y || 0)), 20);
  const w = compact ? 620 : 780;
  const h = compact ? 310 : 380;
  const m = { l: 54, r: 22, t: 42, b: 52 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;
  const sx = (x) => m.l + (x / maxX) * iw;
  const sy = (y) => m.t + ih - (y / maxY) * ih;
  const line = (points) => points.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ");
  const xTicks = Array.from({ length: 9 }, (_, i) => Math.round(maxX / 8 * i));
  const yTicks = Array.from({ length: 9 }, (_, i) => Math.round(maxY / 8 * i));
  const chartSubtitle = `${teste?.nome || "Teste de Performance"}${teste?.tag ? ` - TAG: ${teste.tag}` : " - TAG: ____"}`;

  if (!allPoints.length) {
    return (
      <div className="border rounded-lg p-4 text-center text-xs" style={{ borderColor: C.border, color: C.grayMid }}>
        Preencha vazão/pressões do ensaio para gerar a curva da bomba.
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-white" style={{ borderColor: C.border }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Curva de bomba NFPA 20">
        <rect x="0" y="0" width={w} height={h} fill="#fff" />
        <text x={w / 2} y={16} textAnchor="middle" fontSize="13" fontWeight="800" style={{ fill: C.gray }}>
          Teste de Aceitação da Bomba de Incêndio - Fire Pump Acceptance Test
        </text>
        <text x={w / 2} y={31} textAnchor="middle" fontSize="10" fontWeight="700" style={{ fill: C.grayMid }}>
          {chartSubtitle}
        </text>

        {xTicks.map((t, i) => (
          <g key={`x-${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + ih} stroke={i % 2 === 0 ? "#BFBFBF" : "#E5E5E5"} strokeWidth={i % 2 === 0 ? 1 : 0.7} strokeDasharray={i % 2 === 0 ? "" : "3 3"} />
            <text x={sx(t)} y={m.t + ih + 17} textAnchor="middle" fontSize="10" style={{ fill: C.gray }}>{t}</text>
          </g>
        ))}
        {yTicks.map((t, i) => (
          <g key={`y-${t}`}>
            <line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke={i % 2 === 0 ? "#BFBFBF" : "#E5E5E5"} strokeWidth={i % 2 === 0 ? 1 : 0.7} strokeDasharray={i % 2 === 0 ? "" : "3 3"} />
            <text x={m.l - 8} y={sy(t) + 3} textAnchor="end" fontSize="10" style={{ fill: C.gray }}>{t}</text>
          </g>
        ))}

        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="#111" strokeWidth="1.2" />
        <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + ih} stroke="#111" strokeWidth="1.2" />
        <text x={m.l + iw / 2} y={h - 14} textAnchor="middle" fontSize="11" style={{ fill: C.gray }}>Vazão ({getUnitLabel("flow", flowUnit)})</text>
        <text x="15" y={m.t + ih / 2} textAnchor="middle" fontSize="11" style={{ fill: C.gray }} transform={`rotate(-90 15 ${m.t + ih / 2})`}>Pressão ({getUnitLabel("pressure", pressureUnit)})</text>

        {defs.map(def => (
          <g key={def.key}>
            {def.points.length > 1 && (
              <polyline points={line(def.points)} fill="none" stroke={def.color} strokeWidth={def.key === "reference" ? 2.2 : 2.6} strokeDasharray={def.dash} />
            )}
            {def.points.map((p, i) => (
              <g key={`${def.key}-${i}`}>
                <circle cx={sx(p.x)} cy={sy(p.y)} r={def.key === "reference" ? 3 : 3.5} fill={def.color} />
              </g>
            ))}
          </g>
        ))}

        <g transform={`translate(${m.l + 8}, ${m.t + 10})`}>
          {defs.map((def, i) => (
            <g key={def.key} transform={`translate(${(i % 2) * 210}, ${Math.floor(i / 2) * 18})`}>
              <line x1="0" x2="28" y1="0" y2="0" stroke={def.color} strokeWidth="3" strokeDasharray={def.dash} />
              <circle cx="14" cy="0" r="3" fill={def.color} />
              <text x="34" y="4" fontSize="10" style={{ fill: C.gray }}>{def.label}</text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]" style={{ color: C.grayMid }}>
        <div><strong>Conjunto:</strong> {cfg.tipoConjunto === "certificado" ? "Certificado" : "Não certificado"}</div>
        <div><strong>Velocidade:</strong> {cfg.modoVelocidade === "variavel" ? "Variável" : "Constante"}</div>
        <div><strong>Vazão nominal:</strong> {fmtMeasure(cfg.vazaoNominalGpm, 1)} {getUnitLabel("flow", flowUnit)}</div>
        <div><strong>Pressão nominal:</strong> {fmtMeasure(cfg.pressaoNominalPsi, 1)} {getUnitLabel("pressure", pressureUnit)}</div>
      </div>
    </div>
  );
}

function PumpPowerChart({ teste, compact = false }) {
  const series = buildPumpCurveSeries(teste);
  const defs = [
    { key: "amps", label: "Corrente média", color: C.ok, dash: "" },
  ].map(d => ({ ...d, points: series[d.key] || [] })).filter(d => d.points.length);
  const allPoints = defs.flatMap(d => d.points);
  if (!allPoints.length) return null;

  const cfg = series.cfg;
  const flowUnit = getCfgUnit(cfg, "flow");
  const nominalFlow = flowFromGpm(flowToGpm(cfg.vazaoNominalGpm, flowUnit), flowUnit);
  const maxX = roundUp(Math.max(10, nominalFlow ? nominalFlow * 1.6 : 0, ...allPoints.map(p => p.x || 0)), 100);
  const maxY = roundUp(Math.max(20, ...allPoints.map(p => p.y || 0)), 20);
  const w = compact ? 620 : 780;
  const h = compact ? 260 : 320;
  const m = { l: 54, r: 22, t: 28, b: 46 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;
  const sx = (x) => m.l + (x / maxX) * iw;
  const sy = (y) => m.t + ih - (y / maxY) * ih;
  const line = (points) => points.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ");
  const xTicks = Array.from({ length: 7 }, (_, i) => Math.round(maxX / 6 * i));
  const yTicks = Array.from({ length: 6 }, (_, i) => Math.round(maxY / 5 * i));

  return (
    <div className="border rounded-lg p-3 bg-white" style={{ borderColor: C.border }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Curva de corrente do motor elétrico">
        <rect x="0" y="0" width={w} height={h} fill="#fff" />
        <text x={w / 2} y={16} textAnchor="middle" fontSize="13" fontWeight="800" style={{ fill: C.gray }}>
          Corrente do Motor Elétrico
        </text>
        {xTicks.map(t => (
          <g key={`px-${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + ih} stroke="#E5E5E5" strokeDasharray="3 3" />
            <text x={sx(t)} y={m.t + ih + 16} textAnchor="middle" fontSize="10" style={{ fill: C.gray }}>{t}</text>
          </g>
        ))}
        {yTicks.map(t => (
          <g key={`py-${t}`}>
            <line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke="#E5E5E5" strokeDasharray="3 3" />
            <text x={m.l - 8} y={sy(t) + 3} textAnchor="end" fontSize="10" style={{ fill: C.gray }}>{t}</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="#111" />
        <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + ih} stroke="#111" />
        <text x={m.l + iw / 2} y={h - 12} textAnchor="middle" fontSize="11" style={{ fill: C.gray }}>Vazão ({getUnitLabel("flow", flowUnit)})</text>
        <text x="15" y={m.t + ih / 2} textAnchor="middle" fontSize="11" style={{ fill: C.gray }} transform={`rotate(-90 15 ${m.t + ih / 2})`}>Corrente (A)</text>
        {defs.map(def => (
          <g key={def.key}>
            {def.points.length > 1 && <polyline points={line(def.points)} fill="none" stroke={def.color} strokeWidth="2.5" strokeDasharray={def.dash} />}
            {def.points.map((p, i) => <circle key={`${def.key}-${i}`} cx={sx(p.x)} cy={sy(p.y)} r="3.2" fill={def.color} />)}
          </g>
        ))}
        <g transform={`translate(${m.l + 8}, ${m.t + 10})`}>
          {defs.map((def, i) => (
            <g key={def.key} transform={`translate(${i * 180}, 0)`}>
              <line x1="0" x2="28" y1="0" y2="0" stroke={def.color} strokeWidth="3" strokeDasharray={def.dash} />
              <circle cx="14" cy="0" r="3" fill={def.color} />
              <text x="34" y="4" fontSize="10" style={{ fill: C.gray }}>{def.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// a cor escolhida para o técnico é escurecida só na tela, para as iniciais em branco ficarem legíveis (contraste 4,5:1)
function corAvatar(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(c || "")); if (!m) return c || "#6B6E74";
  const n = parseInt(m[1], 16), f = 0.72;
  const h = (v) => Math.round(v * f).toString(16).padStart(2, "0");
  return "#" + h(n >> 16) + h((n >> 8) & 255) + h(n & 255);
}

function Avatar({ tec, size = 32 }) {
  if (!tec) return null;
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
         style={{ width: size, height: size, background: corAvatar(tec.cor), fontSize: size * 0.4 }} title={tec.nome}>
      {tec.iniciais}
    </div>
  );
}

// Janelas sobrepostas (modal): Esc fecha só a de cima; ao abrir, o foco vai para dentro dela e, ao fechar, volta
// para onde estava.
const pilhaDialogos = [];
function useDialogo(aberto, onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!aberto) return;
    const marca = {};
    pilhaDialogos.push(marca);
    const anterior = typeof document !== "undefined" ? document.activeElement : null;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) { try { el.focus({ preventScroll: true }); } catch { el.focus?.(); } }
    const onKey = (e) => {
      if (e.key !== "Escape" || pilhaDialogos[pilhaDialogos.length - 1] !== marca) return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = pilhaDialogos.indexOf(marca); if (i >= 0) pilhaDialogos.splice(i, 1);
      try { if (anterior && anterior.isConnected && typeof anterior.focus === "function") anterior.focus({ preventScroll: true }); } catch {}
    };
  }, [aberto]);
  return ref;
}

function Modal({ open, onClose, title, children, wide, full }) {
  const ref = useDialogo(!!open, onClose);
  const tituloId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
           className="bg-white rounded-xl shadow-2xl flex flex-col outline-none"
           style={{ maxWidth: full ? "calc(100vw - 32px)" : wide ? 1100 : 640, width: "100%", maxHeight: "92vh" }}>
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b" style={{ borderColor: C.border }}>
          <h3 id={tituloId} className="text-base sm:text-lg font-bold break-words" style={{ color: C.gray }}>{title}</h3>
          <button onClick={onClose} aria-label="Fechar" title="Fechar" className="p-1 rounded hover:bg-gray-100 shrink-0"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: C.grayMid }}>{label}</div>
      {children}
      {hint && <div className="text-[10px] mt-1" style={{ color: C.grayMid }}>{hint}</div>}
    </label>
  );
}

// Assinatura desenhada com o dedo (celular) ou mouse (computador). Guarda como
// imagem (PNG em base64) em `value` — nada de biblioteca externa, é um canvas
// simples. Ao reabrir um rascunho, a assinatura anterior é redesenhada sozinha.
function SignaturePad({ label, value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const vazioRef = useRef(!value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const im = new Image();
      im.onload = () => { ctx.drawImage(im, 0, 0, canvas.width, canvas.height); vazioRef.current = false; };
      im.src = value;
    }
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const t = e.touches && e.touches[0];
    const clientX = t ? t.clientX : e.clientX;
    const clientY = t ? t.clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };
  const start = (e) => { drawingRef.current = true; lastPointRef.current = getPoint(e); };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = getPoint(e);
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastPointRef.current = p; vazioRef.current = false;
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChangeRef.current(canvasRef.current.toDataURL("image/png"));
  };

  // Toque no celular precisa dos listeners "no braço" (addEventListener direto,
  // não via prop onTouch... do React), com passive:false — é a única forma de
  // o preventDefault() realmente impedir o navegador de rolar a página enquanto
  // o dedo desliza sobre o canvas. Isso é uma limitação conhecida do sistema de
  // eventos do React para touchmove: quando registrado via JSX, o navegador pode
  // tratar o listener como passivo e ignorar o preventDefault, deixando a página
  // "andar" durante a assinatura — foi exatamente o problema relatado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onStart = (e) => { e.preventDefault(); start(e); };
    const onMove = (e) => { if (drawingRef.current) e.preventDefault(); move(e); };
    const onEnd = (e) => { e.preventDefault(); end(); };
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd, { passive: false });
    canvas.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      canvas.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    vazioRef.current = true;
    onChange(null);
  };

  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: C.grayMid }}>{label}</div>
      <div className="relative rounded-lg overflow-hidden" style={{ border: `1.5px dashed ${C.border}` }}>
        {!value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs" style={{ color: "#c9c9c9" }}>
            Assine aqui com o dedo ou o mouse
          </div>
        )}
        <canvas ref={canvasRef} width={560} height={170}
                style={{ width: "100%", height: 130, display: "block", cursor: "crosshair", background: "#fff", touchAction: "none", overscrollBehavior: "none", userSelect: "none", WebkitUserSelect: "none" }}
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} />
      </div>
      <div className="flex justify-end mt-1">
        <button type="button" onClick={limpar} className="text-[11px] font-bold" style={{ color: C.orangeDark }}>Limpar assinatura</button>
      </div>
    </div>
  );
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function lerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Foto de celular tem 4–12 MB: antes de guardar (e de ir na sincronização), reduz para no máximo 1600 px no
// maior lado, em JPEG qualidade 0,8. PDF e outros arquivos ficam como estão; GIF/SVG também (animação/vetor).
const FOTO_MAX_LADO = 1600;
const FOTO_QUALIDADE = 0.8;
const tamanhoDataUrl = (d) => { const b64 = String(d).split(",")[1] || ""; return Math.floor(b64.length * 3 / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0); };
async function prepararArquivo(file) {
  const original = await lerComoDataUrl(file);
  const tipo = file.type || "application/octet-stream";
  const base = { data: original, tipo, tamanho: file.size, nome: file.name };
  if (!/^image\//.test(tipo) || /^image\/(gif|svg)/.test(tipo) || typeof document === "undefined") return base;
  try {
    const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error("imagem")); im.src = original; });
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return base;
    const escala = Math.min(1, FOTO_MAX_LADO / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * escala)), ch = Math.max(1, Math.round(h * escala));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch); // PNG transparente não fica preto no JPEG
    ctx.drawImage(img, 0, 0, cw, ch);
    const jpeg = canvas.toDataURL("image/jpeg", FOTO_QUALIDADE);
    if (!/^data:image\/jpeg/.test(jpeg)) return base;
    // já pequena e menor que a versão reduzida: fica a original
    if (escala === 1 && jpeg.length >= original.length) return base;
    return { data: jpeg, tipo: "image/jpeg", tamanho: tamanhoDataUrl(jpeg), nome: String(file.name || "foto").replace(/\.[a-z0-9]+$/i, "") + ".jpg" };
  } catch {
    return base; // formato que o navegador não abre (ex.: HEIC): guarda como veio
  }
}

async function readAttachmentFile(file, categoria) {
  const p = await prepararArquivo(file);
  return {
    id: Date.now() + Math.random(),
    nome: p.nome,
    tipo: p.tipo,
    tamanho: p.tamanho,
    categoria,
    anexadoEm: new Date().toISOString(),
    data: p.data,
  };
}

function hasStartupClientChecklist(anexos = []) {
  return anexos.some(a => a.categoria === "Checklist preenchido pelo cliente");
}

function AttachmentInput({ label, categoria, onAdd, accept, multiple = true, required }) {
  const handleFiles = async (files) => {
    const arr = Array.from(files || []);
    if (arr.length === 0) return;
    const anexos = await Promise.all(arr.map(f => readAttachmentFile(f, categoria)));
    onAdd(anexos);
  };
  return (
    <label className="cursor-pointer px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2"
           style={{ borderColor: required ? C.orange : C.border, color: required ? C.orangeDark : C.gray }}>
      <FilePlus2 size={14} /> {label}
      <input type="file" accept={accept} multiple={multiple} className="hidden"
             onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
    </label>
  );
}

function AttachmentList({ anexos = [], onRemove, empty = "Nenhum anexo" }) {
  if (!anexos.length) return <div className="text-xs p-3 rounded border border-dashed" style={{ borderColor: C.border, color: C.grayMid }}>{empty}</div>;
  return (
    <div className="space-y-2">
      {anexos.map(a => (
        <div key={a.id} className="border rounded-lg px-3 py-2 flex items-center gap-3" style={{ borderColor: C.border }}>
          <FileText size={14} style={{ color: C.orangeDark }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: C.gray }}>{a.nome}</div>
            <div className="text-[10px]" style={{ color: C.grayMid }}>{a.categoria} · {formatBytes(a.tamanho)}</div>
          </div>
          {a.data && (
            <a href={a.data} download={a.nome} className="text-[10px] font-bold underline" style={{ color: C.orangeDark }}>
              Baixar
            </a>
          )}
          {onRemove && (
            <button onClick={() => onRemove(a.id)} aria-label={`Remover o anexo ${a.nome || ""}`.trim()} title="Remover" className="p-1 rounded hover:bg-red-50" style={{ color: C.nok }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function attachmentIsImage(a) {
  return a?.tipo?.startsWith("image/") || String(a?.data || "").startsWith("data:image/");
}

function attachmentTextPreview(a) {
  if (!a?.data) return "";
  const isTextLike = a.tipo?.startsWith("text/") || /\.(txt|csv|log|eml)$/i.test(a.nome || "");
  if (!isTextLike || typeof window === "undefined") return "";
  try {
    const base64 = String(a.data).split(",")[1] || "";
    const binary = window.atob(base64);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes).slice(0, 2500);
  } catch {
    return "";
  }
}

function AttachmentDocumentList({ anexos = [], empty = "Nenhum anexo" }) {
  if (!anexos.length) return <div className="text-xs p-3 rounded border border-dashed" style={{ borderColor: C.border, color: C.grayMid }}>{empty}</div>;
  return (
    <div className="space-y-3">
      {anexos.map(a => {
        const isImage = attachmentIsImage(a);
        const textPreview = attachmentTextPreview(a);
        return (
          <div key={a.id} className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-3 py-2 flex items-center gap-3" style={{ background: C.grayLight }}>
              <FileText size={14} style={{ color: C.orangeDark }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate" style={{ color: C.gray }}>{a.nome}</div>
                <div className="text-[10px]" style={{ color: C.grayMid }}>{a.categoria} · {formatBytes(a.tamanho)} · {a.tipo || "arquivo"}</div>
              </div>
              {a.data && (
                <a href={a.data} download={a.nome} className="text-[10px] font-bold underline print:hidden" style={{ color: C.orangeDark }}>
                  Baixar
                </a>
              )}
            </div>
            {isImage && (
              <div className="p-3 bg-white">
                <img src={a.data} alt={a.nome || "Anexo"} style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain", display: "block", margin: "0 auto", border: `1px solid ${C.border}` }} />
              </div>
            )}
            {!isImage && textPreview && (
              <pre style={{ margin: 0, padding: 10, fontSize: 10, lineHeight: 1.45, whiteSpace: "pre-wrap", color: C.gray, background: C.white, maxHeight: 300, overflow: "hidden" }}>
                {textPreview}
              </pre>
            )}
            {!isImage && !textPreview && (
              <div className="p-3 text-xs" style={{ color: C.grayMid }}>
                Arquivo anexado ao atendimento. Para formatos como PDF, planilha ou documento, o arquivo fica registrado nesta folha e disponível para baixar pelo botão acima.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getDespachoChecklist(despacho) {
  return despacho?.checklist || despacho || {};
}

function getVisitaAnexos(visita) {
  return [...(visita?.anexos || []), ...(visita?.despacho?.anexos || [])];
}

function TipoBadge({ tipo, size = "sm" }) {
  const cfg = TIPO_REL[tipo];
  if (!cfg) return null;
  const Icon = cfg.Icon;
  const padding = size === "sm" ? "px-2 py-0.5" : "px-3 py-1";
  const fontSize = size === "sm" ? "text-xs" : "text-sm";
  return (
    <span className={`inline-flex items-center gap-1 ${padding} ${fontSize} rounded-full font-semibold`}
          style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={size === "sm" ? 11 : 13} /> {cfg.nome}
    </span>
  );
}

// Renderiza as pills de frequências de uma visita/relatório (suporta freqs[] ou freq)
function VisitaFreqsPills({ visita, max = 4 }) {
  const fs = getVisitaFreqs(visita);
  if (fs.length === 0) return null;
  const visible = fs.slice(0, max);
  const extra = fs.length - visible.length;
  return (
    <>
      {visible.map(f => (
        <Pill key={f} bg={FREQ_COLOR[f]?.bg} fg={FREQ_COLOR[f]?.fg}>{f}</Pill>
      ))}
      {extra > 0 && <Pill bg={C.grayLight} fg={C.grayMid}>+{extra}</Pill>}
    </>
  );
}

// Mesmo design do LS Pricer: fontes Barlow / Barlow Condensed / IBM Plex Mono, cores e tema claro/escuro.
const TOKENS_CLARO = `--or:#E8570A; --or-fill:#C94A06; --or-fill-h:#A93E05; --or-ink:#B8440A; --or-soft:#FFF1E8; --or-line:#F6C9AE;
  --ink:#1B1C1E; --ink2:#4E5157; --ink3:#6B6E74; --line:#E4E2DE; --line2:#D2CFC9;
  --bg:#F4F3F0; --card:#FFFFFF; --bar:#1E1F21; --bar-ink:#F1EFEA; --bar-dim:#9C9EA3;
  --ok:#1E7A45; --ok-bg:#E6F4EC; --bad:#B42F22; --bad-bg:#FCEBE8; --warn:#9A6200; --warn-bg:#FDF4DE;
  --blue:#2A63B8; --blue-bg:#E8F0FB; --purple:#7A3EB8; --purple-bg:#F2EAFB;
  --shadow:0 1px 2px rgba(30,20,10,.06),0 2px 8px rgba(30,20,10,.05); --row-h:#FBF8F4;`;
const TOKENS_ESCURO = `color-scheme:dark;
  --or:#FF7A33; --or-fill:#C94A06; --or-fill-h:#B04005; --or-ink:#FF9A62; --or-soft:#3A2418; --or-line:#6B3A20;
  --ink:#ECEAE6; --ink2:#B9B6B0; --ink3:#9A978F; --line:#34332F; --line2:#46443F;
  --bg:#161615; --card:#1F1F1D; --bar:#0E0E0D; --bar-ink:#F1EFEA; --bar-dim:#8E8C87;
  --ok:#6FCF97; --ok-bg:#16301F; --bad:#FF8A7A; --bad-bg:#3A1B17; --warn:#F2C04E; --warn-bg:#352A12;
  --blue:#7FB0F2; --blue-bg:#18243A; --purple:#C29BF0; --purple-bg:#2A1E3A;
  --shadow:0 1px 2px rgba(0,0,0,.4); --row-h:#24231F;`;
function GlobalFonts() {
  return (
    <style data-lsfire-fonts="true">{`
      @import url("https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap");
      :root { ${TOKENS_CLARO}
        --f-body: "Barlow", Arial, Helvetica, sans-serif; --f-cond: "Barlow Condensed", "Arial Narrow", Arial, sans-serif; --f-mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
        --font-display: var(--f-cond); --font-body: var(--f-body); }
      @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${TOKENS_ESCURO} } }
      :root[data-theme="dark"] { ${TOKENS_ESCURO} }
      /* papel (relatório A4, impressão): sempre claro, em qualquer tema */
      .lsf-papel { ${TOKENS_CLARO} color-scheme: light; }
      html, body { background: var(--bg); }
      .lsfire-app-shell { font-family: var(--f-body); color: var(--ink); background: var(--bg) !important; }
      .lsfire-app-shell input, .lsfire-app-shell select, .lsfire-app-shell textarea, .lsfire-app-shell button { font-family: inherit; }
      .lsfire-app-shell input, .lsfire-app-shell select, .lsfire-app-shell textarea { color: var(--ink); }
      .lsfire-app-shell input:not([type=checkbox]):not([type=radio]):not([type=range]), .lsfire-app-shell select, .lsfire-app-shell textarea { background-color: var(--card); border-color: var(--line2); border-radius: 8px; }
      .lsfire-app-shell ::placeholder { color: var(--ink3); }
      .lsfire-app-shell h1, .lsfire-app-shell h2, .lsfire-app-shell h3, .lsfire-app-shell h4, .lsfire-app-shell .font-display { font-family: var(--f-cond); letter-spacing: .01em; }
      .lsfire-app-shell main h1 { font-weight: 700; }
      .lsfire-app-shell .font-mono, .lsfire-app-shell code { font-family: var(--f-mono); }
      /* utilitários do Tailwind com as cores do tema */
      .lsfire-app-shell .bg-white { background-color: var(--card); }
      .lsfire-app-shell .bg-gray-50 { background-color: var(--bg); }
      .lsfire-app-shell .bg-gray-200 { background-color: var(--bg); }
      .lsfire-app-shell .hover\\:bg-gray-50:hover, .lsfire-app-shell .hover\\:bg-gray-100:hover { background-color: var(--row-h); }
      .lsfire-app-shell .hover\\:bg-gray-200:hover { background-color: var(--line); }
      .lsfire-app-shell .hover\\:bg-red-50:hover { background-color: var(--bad-bg); }
      .lsfire-app-shell .hover\\:bg-orange-50:hover, .lsfire-app-shell .hover\\:bg-orange-200:hover, .lsfire-app-shell .hover\\:bg-white\\/50:hover { background-color: var(--or-soft); }
      .lsfire-app-shell *, .lsfire-app-shell ::before, .lsfire-app-shell ::after { border-color: var(--line); }
      /* cartões como os do Pricer */
      .lsfire-app-shell .rounded-xl.border, .lsfire-app-shell .rounded-2xl.border { background-color: var(--card); border-color: var(--line); box-shadow: var(--shadow); transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease; }
      .lsfire-app-shell button.rounded-xl.border:hover { border-color: var(--or-line); transform: translateY(-1px); }
      .lsfire-app-shell button { transition: transform .08s ease, box-shadow .15s ease, background-color .15s ease, border-color .15s ease, opacity .15s ease; }
      .lsfire-app-shell button:active:not(:disabled) { transform: translateY(1px); }
      .lsfire-app-shell a:focus-visible, .lsfire-app-shell button:focus-visible { outline: 2px solid var(--or); outline-offset: 1px; border-radius: 8px; }
      .lsfire-app-shell input:focus, .lsfire-app-shell select:focus, .lsfire-app-shell textarea:focus { outline: 2px solid var(--or); outline-offset: 0; box-shadow: none; }
      .lsfire-app-shell ::selection { background: var(--or-soft); }
      /* menu lateral e barra do celular: iguais aos do Pricer (fundo escuro, letras condensadas, marca laranja no item ativo) */
      .lsf-side { background: var(--bar) !important; color: var(--bar-ink); border-color: transparent !important;
        --card: transparent; --bg: rgba(255,255,255,.06); --row-h: rgba(255,255,255,.05); --ink: var(--bar-ink); --ink2: var(--bar-dim); --ink3: var(--bar-dim); --blue: #8AB4FF; --bad: #FF8A7A; --line: rgba(255,255,255,.12); --line2: rgba(255,255,255,.18); }
      .lsf-nav-btn { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 12px; margin-bottom: 2px; border: 0; border-radius: 9px; background: none; cursor: pointer; text-align: left;
        color: var(--bar-dim); font-family: var(--f-cond); font-weight: 600; font-size: 15.5px; letter-spacing: .04em; text-transform: uppercase; }
      .lsf-nav-btn:hover { color: var(--bar-ink); background: rgba(255,255,255,.05); }
      .lsf-nav-btn[aria-current="page"] { color: var(--bar-ink); background: rgba(255,255,255,.09); }
      .lsf-nav-btn[aria-current="page"]::before { content: ""; position: absolute; left: -8px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--or); }
      .lsf-slogan { color: var(--or); }
      .lsf-nav-grupo { padding: 14px 12px 4px; font-family: var(--f-cond); font-weight: 600; font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--bar-dim); }
      .lsf-tab-sep { flex: none; width: 1px; height: 20px; margin: 0 6px; background: var(--line); }
      /* dentro do Pricer: abas no lugar do menu (o menu é o do Pricer). A lista de abas rola sozinha; os botões
         de sincronizar e de avisos ficam fora dela (não são abas) */
      .lsf-tabs { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 2px; padding: 0 8px 0 12px; background: var(--bg); border-bottom: 1px solid var(--line); }
      .lsf-tablist { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 2px; overflow-x: auto; scrollbar-width: thin; }
      .lsf-tab, .lsf-tab-acao { display: inline-flex; align-items: center; gap: 7px; padding: 11px 12px 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink2); white-space: nowrap; cursor: pointer;
        font-weight: 600; font-size: 14.5px; letter-spacing: .05em; text-transform: uppercase; }
      .lsf-tab-acao { flex: none; padding: 11px 10px 10px; }
      /* mais específico que ".lsfire-app-shell button { font-family: inherit }": abas e menu em Barlow Condensed, como no Pricer */
      .lsfire-app-shell .lsf-tab, .lsfire-app-shell .lsf-tab-acao, .lsfire-app-shell .lsf-nav-btn { font-family: var(--f-cond); }
      .lsf-tab:hover, .lsf-tab-acao:hover { color: var(--ink); }
      .lsf-tab[aria-current="page"] { color: var(--ink); border-bottom-color: var(--or); }
      /* título de seção (como no Pricer): pequeno, em negrito, maiúsculo, laranja escuro */
      .lsf-sec { font-size: 12px; line-height: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--or-ink); }
      /* cartões do painel: sem cartão sozinho numa linha */
      .lsf-kpis { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .lsf-kpis > :last-child:nth-child(odd) { grid-column: span 2; }
      @media (min-width: 768px) { .lsf-kpis { grid-template-columns: repeat(var(--kpi-md, 4), minmax(0, 1fr)); } .lsf-kpis > :last-child:nth-child(odd) { grid-column: auto; } }
      @media (min-width: 1280px) { .lsf-kpis { grid-template-columns: repeat(var(--kpi-n, 6), minmax(0, 1fr)); } }
      /* excluir foto: sempre visível em tela de toque; no mouse aparece ao passar por cima (ou com o teclado) */
      .lsf-foto-del { opacity: 1; }
      @media (hover: hover) and (pointer: fine) { .lsf-foto-del { opacity: 0; } .group:hover .lsf-foto-del, .lsf-foto-del:focus-visible { opacity: 1; } }
      .lsfire-app-shell ::-webkit-scrollbar { width: 10px; height: 10px; }
      .lsfire-app-shell ::-webkit-scrollbar-thumb { background: var(--line2); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
      .lsfire-app-shell ::-webkit-scrollbar-thumb:hover { background: var(--or); background-clip: padding-box; }
    `}</style>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @page { size: A4; margin: 0; }
      @media print {
        body { background: white !important; }
        aside, .print\\:hidden { display: none !important; }
        .page-break { page-break-after: always; box-shadow: none !important; margin: 0 !important; }
        #report-root { padding: 0 !important; background: white !important; }
        body.printing-documento-interno .print\\:hidden { display: initial !important; }
        body.printing-documento-interno aside { display: none !important; }
        body.printing-documento-interno * { visibility: hidden !important; }
        body.printing-documento-interno .documento-interno-print,
        body.printing-documento-interno .documento-interno-print * { visibility: visible !important; }
        body.printing-documento-interno .documento-interno-print {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 210mm !important;
          max-width: none !important;
          margin: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        body.printing-documento-interno .documento-interno-print .print\\:hidden { display: none !important; }
      }
    `}</style>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGURANÇA — Perfis, permissões e contexto de autenticação (o login é do servidor: /api/me)
// ═══════════════════════════════════════════════════════════════════════════
const PERFIS = {
  admin:       { id: "admin",       nome: "Administrador",       cor: "#DC2626", Icon: ShieldCheck },
  gestor:      { id: "gestor",      nome: "Gestor / Comercial",  cor: "#2563EB", Icon: UserCog },
  coordenador: { id: "coordenador", nome: "Coordenador Técnico", cor: "#0F766E", Icon: Shield },
  supervisor:  { id: "supervisor",  nome: "Supervisor Técnico",  cor: "#7C3AED", Icon: ShieldCheck },
  tecnico:     { id: "tecnico",     nome: "Técnico de Campo",    cor: "#16A34A", Icon: Wrench },
  cliente:     { id: "cliente",     nome: "Cliente",             cor: "#9333EA", Icon: Building2 },
};

// Matriz de permissões por perfil
const PERMISSOES = {
  admin:       { verValores: true,  gerenciarContratos: true,  gerenciarTecnicos: true,  agendar: true,  inspecionar: true,  verRelatorios: true,  verTecnicos: true,  verAuditoria: true,  gerenciarUsuarios: true,  verTodosContratos: true, excluirRegistros: true,  aprovarRelatorios: true  },
  gestor:      { verValores: true,  gerenciarContratos: true,  gerenciarTecnicos: true,  agendar: true,  inspecionar: true,  verRelatorios: true,  verTecnicos: true,  verAuditoria: true,  gerenciarUsuarios: false, verTodosContratos: true, excluirRegistros: false, aprovarRelatorios: true  },
  coordenador: { verValores: true,  gerenciarContratos: false, gerenciarTecnicos: true,  agendar: true,  inspecionar: true,  verRelatorios: true,  verTecnicos: true,  verAuditoria: true,  gerenciarUsuarios: false, verTodosContratos: true, excluirRegistros: false, aprovarRelatorios: true  },
  supervisor:  { verValores: true,  gerenciarContratos: false, gerenciarTecnicos: false, agendar: true,  inspecionar: true,  verRelatorios: true,  verTecnicos: true,  verAuditoria: true,  gerenciarUsuarios: false, verTodosContratos: true, excluirRegistros: false, aprovarRelatorios: true  },
  tecnico:     { verValores: false, gerenciarContratos: false, gerenciarTecnicos: false, agendar: true,  inspecionar: true,  verRelatorios: true,  verTecnicos: true,  verAuditoria: false, gerenciarUsuarios: false, verTodosContratos: true, excluirRegistros: false, aprovarRelatorios: false },
  cliente:     { verValores: false, gerenciarContratos: false, gerenciarTecnicos: false, agendar: false, inspecionar: false, verRelatorios: true,  verTecnicos: false, verAuditoria: false, gerenciarUsuarios: false, verTodosContratos: false, excluirRegistros: false, aprovarRelatorios: false },
};

function can(perfil, acao) {
  return PERMISSOES[perfil]?.[acao] === true;
}

// Contexto de autenticação — disponibiliza sessão, checagem de permissão e log de auditoria
const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext) || { sessao: null, can: () => false, logAudit: () => {} }; }

// ═══════════════════════════════════════════════════════════════════════════
// APP RAIZ
// ═══════════════════════════════════════════════════════════════════════════
// tema: dentro do Pricer segue o tema dele (mensagem "lsf-tema"); sozinho, segue o do aparelho (ou o último escolhido no Pricer)
if (typeof window !== "undefined") {
  const aplicaTema = (t) => { if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  try { aplicaTema(window.top !== window ? window.parent.document.documentElement.dataset.theme : localStorage.getItem("lspricer.tema")); } catch { /* moldura de outro endereço */ }
  window.addEventListener("message", (e) => { if (e.source === window.parent && e.data && e.data.tipo === "lsf-tema") aplicaTema(e.data.tema); });
  if (window.top !== window) try { window.parent.postMessage({ tipo: "lsf-tema?" }, "*"); } catch {}
}

// tela pedida no endereço (#agenda, #relatorios…): o submenu do Pricer abre o módulo direto nela
const abaDoEndereco = () => { try { const h = decodeURIComponent(String(window.location.hash || "").slice(1)); return /^[a-z-]{2,30}$/.test(h) ? h : null; } catch { return null; } };
// grupos do menu, na ordem do trabalho (os mesmos do submenu "Serviço de campo" do Pricer)
const GRUPO_ABA = { dashboard: "", agenda: "Operação", visitas: "Operação", "meus-atendimentos": "Operação", relatorios: "Relatórios", aprovacoes: "Relatórios", contratos: "Contratos e equipe", tecnicos: "Contratos e equipe", usuarios: "Controle", auditoria: "Controle" };

export default function App() {
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && abaDoEndereco()) || "dashboard");
  // o Pricer troca a tela por mensagem; o endereço (#aba) também; e o Pricer fica sabendo quando a troca é feita aqui dentro
  useEffect(() => {
    const porMsg = (e) => { if (e.source === window.parent && e.data && e.data.tipo === "lsf-aba" && /^[a-z-]{2,30}$/.test(String(e.data.aba || ""))) setTab(e.data.aba); };
    const porHash = () => { const a = abaDoEndereco(); if (a) setTab(a); };
    window.addEventListener("message", porMsg); window.addEventListener("hashchange", porHash);
    return () => { window.removeEventListener("message", porMsg); window.removeEventListener("hashchange", porHash); };
  }, []);
  useEffect(() => {
    try { if (abaDoEndereco() !== tab) window.history.replaceState(null, "", "#" + tab); } catch { /* segue */ }
    if (window.top !== window) try { window.parent.postMessage({ tipo: "lsf-aba-atual", aba: tab }, "*"); } catch { /* segue */ }
  }, [tab]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // barra de abas (dentro do Pricer): no celular ela rola até a aba aberta
  const tablistRef = useRef(null);
  const [contratos, setContratos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [newVisitOpen, setNewVisitOpen] = useState(null); // { contratoIdFixo? }
  const [contratoModal, setContratoModal] = useState(null); // contratoId
  const [contratoEdit, setContratoEdit] = useState(null); // contrato sendo editado ou {} para novo
  const [tecnicoEdit, setTecnicoEdit] = useState(null);
  const [despachoFor, setDespachoFor] = useState(null);
  const [itmFor, setItmFor] = useState(null);
  const [previewRel, setPreviewRel] = useState(null);
  const [previewAutoPrint, setPreviewAutoPrint] = useState(false);
  const [documentoInternoFor, setDocumentoInternoFor] = useState(null);
  // atendimentos cujo técnico já foi avisado de que outra pessoa começou o rascunho (o rascunho agora é salvo sozinho)
  const rascunhoAvisadoRef = useRef(new Set());

  // ─── Segurança ───────────────────────────────────────────────────────────
  // o login, os usuários e as permissões são do servidor (/api/me) ou, no claude.ai, do Pricer
  const [sessao, setSessao] = useState(null);       // { userId, perfil, nome, login, clienteId, tecnicoId, loginEm }
  const [auditoria, setAuditoria] = useState([]);
  const [bootReady, setBootReady] = useState(false);
  const bootReadyRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState({
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    pending: 0,
    syncing: false,
    lastSync: null,
    error: "",
  });

  useEffect(() => {
    const lista = tablistRef.current;
    if (!lista) return;
    const ativa = lista.querySelector('[aria-current="page"]');
    if (!ativa) return;
    const alvo = Math.max(0, ativa.offsetLeft - (lista.clientWidth - ativa.offsetWidth) / 2);
    try { lista.scrollTo({ left: alvo, behavior: "smooth" }); } catch { lista.scrollLeft = alvo; }
  }, [tab, bootReady, sessao?.perfil]);

  const logAudit = (acao, detalhe) => {
    setAuditoria(a => [{
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      usuario: sessao?.nome || "sistema",
      login: sessao?.login || "—",
      perfil: sessao?.perfil || "—",
      acao, detalhe,
    }, ...a].slice(0, 500)); // mantém últimos 500 eventos
  };

  // Quem está usando: pergunta ao servidor; sem internet, usa a última resposta guardada neste aparelho.
  const carregarMe = async () => {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin", headers: API_HEADERS });
      if (r.status === 401) { try { localStorage.removeItem(ME_CACHE_KEY); } catch {} irParaLogin(); return null; }
      if (r.status === 403) { irParaLogin(); return null; }
      if (r.ok) {
        const m = await r.json();
        if (m.trocarSenha) { irParaLogin(); return null; }
        window.__LSF_ME = m;
        // outro usuário neste aparelho: apaga os dados locais do anterior (cache, fila e metadados) antes de carregar
        let anterior = null;
        try { anterior = localStorage.getItem(ULTIMO_USUARIO_KEY) ?? (JSON.parse(localStorage.getItem(ME_CACHE_KEY) || "null") || {}).userId ?? null; } catch {}
        let trocouUsuario = false;
        if (m.id != null && anterior != null && String(anterior) !== String(m.id)) {
          try { await window.offlineSync?.limparDados?.(); } catch {}
          trocouUsuario = true;
        }
        if (m.id != null) try { localStorage.setItem(ULTIMO_USUARIO_KEY, String(m.id)); } catch {}
        const s = { userId: m.id, perfil: m.servico, nome: m.nome, login: m.login, clienteId: m.clienteId ?? null, tecnicoId: m.tecnicoId ?? null, nivelPricer: m.nivelPricer || 0, loginEm: Date.now(), ultimaAtividade: Date.now() };
        try { localStorage.setItem(ME_CACHE_KEY, JSON.stringify(s)); } catch {}
        return s.perfil && s.perfil !== "nenhum" ? { ...s, trocouUsuario } : null;
      }
    } catch {}
    try { const c = JSON.parse(localStorage.getItem(ME_CACHE_KEY) || "null"); if (c) { window.__LSF_ME = { id: c.userId, nivelPricer: c.nivelPricer || 0 }; return c; } } catch {}
    return null;
  };

  // Persistencia: leitura isolada evita que uma chave corrompida aborte as demais.
  const loadStore = async (key) => {
    try {
      const r = await window.storage?.get?.(key);
      return r?.value ? JSON.parse(r.value) : null;
    } catch { return null; }
  };

  const hydrateStore = async () => {
    // primeiro quem está usando (se mudou o usuário, os dados locais do anterior são apagados antes da leitura)
    const me = await carregarMe();
    if (me?.trocouUsuario && bootReadyRef.current) { window.location.reload(); return { contratos: [], visitas: [], relatorios: [] }; }
    if (me) setSessao(me);

    const c = await loadStore("contratos");  if (c) setContratos(c);
    const t = await loadStore("tecnicos");   if (t) setTecnicos(t);
    const v = await loadStore("visitas");    if (v) setVisitas(v);
    const r = await loadStore("relatorios");
    if (r) {
      setRelatorios(r);
    }
    const au = await loadStore("auditoria"); if (au) setAuditoria(au);
    const nt = await loadStore("notificacoes"); if (nt) setNotificacoes(nt);

    // Devolve os dados recém-lidos (não o state do React, que só atualiza no
    // próximo render) — necessário para a reconciliação de números provisórios.
    return { contratos: c || [], visitas: v || [], relatorios: r || [] };
  };

  // Troca números PROVISÓRIOS (gerados offline) pelo número definitivo do
  // servidor assim que a conexão volta. Roda depois de cada sincronização.
  const reconciliarNumerosProvisorios = async (fresh) => {
    const visitasProvisorias = (fresh?.visitas || []).filter(v => v.referenciaProvisoria);
    for (const v of visitasProvisorias) {
      const doServidor = await alocarNumeroServidor("atendimento");
      if (!doServidor) break; // ainda sem conexão de verdade — tenta de novo na próxima sincronização
      setVisitas(vs => vs.map(x => x.id === v.id ? { ...x, referencia: doServidor, codigoAtendimento: doServidor, referenciaProvisoria: false } : x));
      logAudit("numero_confirmado", `Atendimento provisório ${v.referencia} confirmado como ${doServidor}`);
    }

    const contratosProvisorios = (fresh?.contratos || []).filter(c => c.codigoProvisorio);
    for (const c of contratosProvisorios) {
      const doServidor = await alocarNumeroServidor("contrato");
      if (!doServidor) break;
      setContratos(cs => cs.map(x => x.id === c.id ? { ...x, codigo: doServidor, codigoProvisorio: false } : x));
      logAudit("numero_confirmado", `Contrato provisório ${c.codigo} confirmado como ${doServidor}`);
    }

    const relatoriosProvisorios = (fresh?.relatorios || []).filter(r => r.referenciaProvisoria);
    for (const r of relatoriosProvisorios) {
      const doServidor = await alocarNumeroServidor("atendimento");
      if (!doServidor) break;
      setRelatorios(rs => rs.map(x => x.id === r.id ? { ...x, referencia: doServidor, codigoAtendimento: doServidor, codigo: doServidor, referenciaProvisoria: false } : x));
      logAudit("numero_confirmado", `Relatório provisório ${r.referencia} confirmado como ${doServidor}`);
    }
  };

  const refreshSyncStatus = async (patch = {}) => {
    try {
      const status = await window.offlineSync?.getStatus?.();
      setSyncStatus(s => ({
        ...s,
        online: status?.online ?? (typeof navigator !== "undefined" ? navigator.onLine : true),
        pending: status?.pending ?? 0,
        lastSync: status?.lastSync ?? s.lastSync,
        error: "",
        ...patch,
      }));
    } catch (error) {
      setSyncStatus(s => ({ ...s, error: error?.message || "Nao foi possivel ler a sincronizacao.", ...patch }));
    }
  };

  // Um envio por vez: o pedido feito enquanto outro está em andamento roda logo depois dele.
  const syncCtl = useRef({ rodando: false, denovo: false });
  const sincronizarRef = useRef(null);
  const sincronizarAgora = async () => {
    const ctl = syncCtl.current;
    if (ctl.rodando) { ctl.denovo = true; return; }
    ctl.rodando = true;
    setSyncStatus(s => ({ ...s, syncing: true, error: "" }));
    try {
      await window.offlineSync?.syncNow?.();
      const fresh = await hydrateStore();
      await reconciliarNumerosProvisorios(fresh);
      await refreshSyncStatus({ syncing: false, error: "" });
    } catch (error) {
      await refreshSyncStatus({ syncing: false, error: error?.message || "Nao foi possivel sincronizar agora." });
    } finally {
      ctl.rodando = false;
    }
    if (ctl.denovo) { ctl.denovo = false; setTimeout(() => sincronizarRef.current?.(), 0); }
  };
  sincronizarRef.current = sincronizarAgora;

  useEffect(() => {
    let active = true;
    (async () => {
      await hydrateStore();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const ctl = syncCtl.current;
        ctl.rodando = true;
        try {
          await window.offlineSync?.syncNow?.();
          const fresh = await hydrateStore();
          await reconciliarNumerosProvisorios(fresh);
        } catch {} finally { ctl.rodando = false; }
      }
      if (active) {
        bootReadyRef.current = true;
        setBootReady(true);
        refreshSyncStatus();
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator && !window.__LSF_CLAUDE) {
      navigator.serviceWorker.register("/servico/sw.js", { scope: "/servico/" }).catch(() => {});
    }

    const handleOnline = () => sincronizarRef.current?.();
    const handleOffline = () => refreshSyncStatus({ online: false });
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = window.setInterval(() => refreshSyncStatus(), 15000);
    refreshSyncStatus();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!bootReady) return;
    const timer = window.setTimeout(() => {
      refreshSyncStatus();
      if (navigator.onLine) sincronizarRef.current?.();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bootReady]);

  // Sincronização automática: ~2 s depois de cada mudança que entra na fila (várias mudanças seguidas viram um envio só)
  // e a cada 60 s com internet e a aba visível, para trazer o que os outros gravaram. No claude.ai os dados já são
  // gravados direto no banco do Pricer (não há fila).
  useEffect(() => {
    if (!bootReady || typeof window === "undefined" || window.__LSF_CLAUDE) return;
    let espera = null;
    const pedir = () => {
      if (espera) window.clearTimeout(espera);
      espera = window.setTimeout(() => { espera = null; if (navigator.onLine) sincronizarRef.current?.(); }, 2000);
    };
    const periodico = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") sincronizarRef.current?.();
    }, 60000);
    const aoMostrar = () => { if (document.visibilityState === "visible" && navigator.onLine) pedir(); };
    window.addEventListener(EVENTO_FILA, pedir);
    document.addEventListener("visibilitychange", aoMostrar);
    return () => {
      if (espera) window.clearTimeout(espera);
      window.clearInterval(periodico);
      window.removeEventListener(EVENTO_FILA, pedir);
      document.removeEventListener("visibilitychange", aoMostrar);
    };
  }, [bootReady]);

  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("contratos", JSON.stringify(contratos)); } catch {} })(); }, [contratos, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("tecnicos",  JSON.stringify(tecnicos));  } catch {} })(); }, [tecnicos, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("visitas",   JSON.stringify(visitas));   } catch {} })(); }, [visitas, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("relatorios",JSON.stringify(relatorios));} catch {} })(); }, [relatorios, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("notificacoes",JSON.stringify(notificacoes));} catch {} })(); }, [notificacoes, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("auditoria", JSON.stringify(auditoria));} catch {} })(); }, [auditoria, bootReady]);

  // Sair: envia o que falta, apaga os dados do serviço guardados neste aparelho e encerra a sessão no servidor.
  const fazerLogout = async () => {
    const entrada = { id: Date.now() + Math.random(), timestamp: new Date().toISOString(), usuario: sessao?.nome || "sistema", login: sessao?.login || "—", perfil: sessao?.perfil || "—", acao: "logout", detalhe: `${sessao?.nome} saiu do sistema` };
    try { await window.storage?.set?.("auditoria", JSON.stringify([entrada, ...auditoria].slice(0, 500))); } catch {}
    // duas vezes: se já havia um envio em andamento, o segundo leva o que entrou na fila depois dele
    try { await window.offlineSync?.syncNow?.(); await window.offlineSync?.syncNow?.(); } catch {}
    let pendentes = 0;
    try { pendentes = (await window.offlineSync?.getQueue?.())?.length || 0; } catch {}
    if (pendentes > 0 && !window.confirm(`Há ${pendentes} alteração(ões) que ainda não chegaram ao servidor (sem internet?). Ao sair, os dados guardados neste aparelho são apagados e essas alterações se perdem. Sair mesmo assim?`)) return;
    try { await window.offlineSync?.limparDados?.(); } catch {}
    try { localStorage.removeItem(ME_CACHE_KEY); } catch {}
    try { await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: API_HEADERS }); } catch {}
    try { window.top.location.replace("/login"); } catch { window.location.replace("/login"); }
  };

  const updateVisita = (id, patch) => setVisitas(vs => vs.map(v => v.id === id ? { ...v, ...patch } : v));

  // Perfis que aprovam relatórios (mesma lista da matriz de permissões)
  const APROVADOR_PERFIS = ["admin", "gestor", "coordenador", "supervisor"];

  // Cria um aviso dentro do app. Destinatário é resolvido na leitura (por
  // perfil, para "novo_pendente"; por técnico vinculado, para os demais) —
  // não por usuário específico, já que vários aprovadores podem existir.
  const criarNotificacao = ({ tipo, relatorio, visita, motivo }) => {
    const clienteVisita = visita ? (contratos.find(c => c.id === visita.contratoId)?.cliente || (visita.avulsa ? "Atendimento avulso" : "—")) : null;
    const n = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipo, // "novo_pendente" | "aprovado" | "devolvido" | "visita_agendada" | "atendimento_atribuido"
      relatorioId: relatorio?.id || null,
      relatorioCodigo: relatorio ? (relatorio.codigo || relatorio.referencia) : null,
      visitaId: visita?.id || null,
      visitaReferencia: visita ? (visita.referencia || visita.codigoAtendimento || null) : null,
      visitaData: visita?.data || null,
      visitaTipo: visita?.tipo || null,
      cliente: relatorio?.cliente || clienteVisita || null,
      tecnicoId: relatorio?.tecnicoId ?? visita?.tecnicoId ?? null,
      motivo: motivo || null,
      criadoEm: new Date().toISOString(),
      lidaPor: [],
    };
    // a lista vem do servidor do mais antigo para o mais novo: o aviso novo entra no fim. Sem cortar aqui — o
    // servidor já guarda só os 1000 mais recentes, e para o administrador o que some da lista conta como exclusão.
    setNotificacoes(ns => [...ns, n]);
  };

  const saveRelatorio = (rel) => {
    const relComRef = ensureAtendimentoRef(rel);
    const novo = {
      ...relComRef,
      codigo: relComRef.codigo || relComRef.referencia,
      id: rel.id || Date.now(),
      criadoEm: new Date().toISOString(),
      aprovacao: rel.aprovacao || {
        status: "pendente",
        solicitadoEm: new Date().toISOString(),
        supervisor: "",
        assinatura: "",
        observacao: "",
        aprovadoEm: null,
      },
    };
    setRelatorios(rs => [novo, ...rs]);
    logAudit("relatorio_pendente_aprovacao", `Relatório ${novo.codigo} — ${novo.cliente} aguardando aprovação de supervisor/coordenador`);
    criarNotificacao({ tipo: "novo_pendente", relatorio: novo });
    return novo;
  };

  const aprovarRelatorio = ({ relatorioId, assinatura, observacao }) => {
    const atual = relatorios.find(r => r.id === relatorioId);
    if (!atual) return;
    const atualizado = {
      ...atual,
      aprovacao: {
        ...(atual.aprovacao || {}),
        status: "aprovado",
        supervisor: sessao?.nome || "Supervisor/Coordenador",
        perfilAprovador: PERFIS[sessao?.perfil]?.nome || "Supervisor/Coordenador",
        assinatura,
        observacao,
        motivo: null,
        aprovadoEm: new Date().toISOString(),
      },
    };
    setRelatorios(rs => rs.map(r => r.id === relatorioId ? atualizado : r));
    setVisitas(vs => vs.map(v => {
      const mesmoRelatorio = v.relatorio?.id === relatorioId || v.relatorio?.codigo === atualizado.codigo;
      return mesmoRelatorio ? { ...v, relatorio: atualizado, status: "concluida" } : v;
    }));
    setPreviewRel(atualizado);
    logAudit("relatorio_aprovado", `Relatório ${atualizado.codigo} aprovado por ${sessao?.nome || "supervisor/coordenador"}`);
    criarNotificacao({ tipo: "aprovado", relatorio: atualizado });
  };

  // Devolve o relatório para o técnico corrigir — exige motivo. O relatório
  // fica bloqueado para impressão/download (como já ficava quando pendente) e
  // a visita volta ao estado "devolvida", com botão de correção no cronograma.
  const devolverRelatorio = ({ relatorioId, motivo }) => {
    const atual = relatorios.find(r => r.id === relatorioId);
    if (!atual) return;
    const atualizado = {
      ...atual,
      aprovacao: {
        ...(atual.aprovacao || {}),
        status: "devolvido",
        motivo,
        devolvidoPor: sessao?.nome || "Supervisor/Coordenador",
        perfilDevolucao: PERFIS[sessao?.perfil]?.nome || "Supervisor/Coordenador",
        devolvidoEm: new Date().toISOString(),
      },
    };
    setRelatorios(rs => rs.map(r => r.id === relatorioId ? atualizado : r));
    setVisitas(vs => vs.map(v => {
      const mesmoRelatorio = v.relatorio?.id === relatorioId || v.relatorio?.codigo === atualizado.codigo;
      return mesmoRelatorio ? { ...v, relatorio: atualizado, status: "devolvida" } : v;
    }));
    setPreviewRel(atualizado);
    logAudit("relatorio_devolvido", `Relatório ${atualizado.codigo} devolvido para correção por ${sessao?.nome || "supervisor/coordenador"} — motivo: ${motivo}`);
    criarNotificacao({ tipo: "devolvido", relatorio: atualizado, motivo });
  };

  // Reenvia um relatório que havia sido devolvido: atualiza o mesmo registro
  // (mantém id/código), guarda o motivo anterior no histórico e volta ao
  // status "pendente" para nova aprovação.
  const reenviarRelatorio = (rel) => {
    const relComRef = ensureAtendimentoRef(rel);
    const anterior = relatorios.find(r => r.id === rel.id);
    const historicoAnterior = anterior?.aprovacao?.historico || [];
    const devolucaoAnterior = anterior?.aprovacao?.motivo ? [{
      motivo: anterior.aprovacao.motivo,
      devolvidoPor: anterior.aprovacao.devolvidoPor,
      devolvidoEm: anterior.aprovacao.devolvidoEm,
    }] : [];
    const atualizado = {
      ...relComRef,
      id: rel.id,
      codigo: relComRef.codigo || relComRef.referencia,
      tecnicoId: relComRef.tecnicoId ?? anterior?.tecnicoId ?? null,
      aprovacao: {
        ...(anterior?.aprovacao || {}),
        status: "pendente",
        motivo: null,
        reenviadoEm: new Date().toISOString(),
        historico: [...historicoAnterior, ...devolucaoAnterior],
      },
    };
    setRelatorios(rs => rs.map(r => r.id === rel.id ? atualizado : r));
    logAudit("relatorio_reenviado", `Relatório ${atualizado.codigo} corrigido e reenviado para aprovação`);
    criarNotificacao({ tipo: "novo_pendente", relatorio: atualizado });
    return atualizado;
  };

  // Notificações relevantes para o usuário logado: "novo_pendente" é visível
  // para qualquer aprovador; "aprovado"/"devolvido" são endereçadas ao técnico
  // vinculado (usuário.tecnicoId) — se o login não tiver vínculo, recebe os
  // avisos gerais de técnico (degradação graciosa, sem perder o aviso).
  // técnico do cadastro que corresponde a quem está logado (pelo vínculo do login ou, no claude.ai, pelo nome)
  const meuTecId = useMemo(() => meuTecnico(sessao, tecnicos)?.id ?? null, [sessao, tecnicos]);
  const mesmoId = (a, b) => a != null && b != null && String(a) === String(b);

  const minhasNotificacoes = useMemo(() => {
    if (!sessao) return [];
    return notificacoes.filter(n => {
      if (n.tipo === "novo_pendente") return APROVADOR_PERFIS.includes(sessao.perfil);
      if (sessao.perfil !== "tecnico") return false;
      if (!n.tecnicoId) return true; // relatório sem técnico definido — aviso vale para qualquer técnico
      return mesmoId(n.tecnicoId, meuTecId);
    });
  }, [notificacoes, sessao, meuTecId]);

  const notificacoesNaoLidas = useMemo(
    () => minhasNotificacoes.filter(n => !n.lidaPor?.includes(sessao?.userId)),
    [minhasNotificacoes, sessao]
  );

  const marcarNotificacaoLida = (id) => {
    if (!sessao) return;
    setNotificacoes(ns => ns.map(n => (n.id === id && !n.lidaPor?.includes(sessao.userId)) ? { ...n, lidaPor: [...(n.lidaPor || []), sessao.userId] } : n));
  };
  const marcarTodasNotificacoesLidas = () => {
    if (!sessao) return;
    const relevantes = new Set(minhasNotificacoes.map(n => n.id));
    setNotificacoes(ns => ns.map(n => relevantes.has(n.id) ? { ...n, lidaPor: [...new Set([...(n.lidaPor || []), sessao.userId])] } : n));
  };

  // na tela, as mais novas primeiro (a lista guardada fica na ordem do servidor)
  const notificacoesParaExibir = useMemo(
    () => minhasNotificacoes
      .map(n => ({ ...n, lida: !!n.lidaPor?.includes(sessao?.userId) }))
      .sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))),
    [minhasNotificacoes, sessao]
  );

  // Abre o relatório da notificação (marcando-a como lida). Se for aviso de
  // visita agendada (ainda sem relatório), leva para "Meus Atendimentos".
  const abrirNotificacao = (n) => {
    marcarNotificacaoLida(n.id);
    if (n.tipo === "visita_agendada" || n.tipo === "atendimento_atribuido") { setTab("meus-atendimentos"); return; }
    const r = relatorios.find(x => x.id === n.relatorioId);
    if (r) setPreviewRel(r);
  };

  const saveContrato = async (data) => {
    if (data.id) {
      logAudit("contrato_editado", `Contrato ${data.cliente} atualizado`);
      setContratos(cs => cs.map(c => c.id === data.id ? { ...c, ...data } : c));
      setContratoEdit(null);
      return;
    }
    const { numero, provisorio } = await gerarReferenciaContrato();
    const novo = { ...data, id: Date.now(), codigo: numero, codigoProvisorio: provisorio };
    logAudit("contrato_criado", `Contrato ${novo.codigo} — ${novo.cliente} criado`);
    setContratos(cs => [...cs, novo]);
    setContratoEdit(null);
  };

  const deleteContrato = (id) => {
    const c = contratos.find(x => x.id === id);
    logAudit("contrato_excluido", `Contrato ${c?.cliente} excluído`);
    setContratos(cs => cs.filter(c => c.id !== id));
    setVisitas(vs => vs.filter(v => v.contratoId !== id));
    setContratoModal(null);
  };

  const saveTecnico = (data) => {
    const cor = data.cor || randomTecColor();
    const iniciais = makeIniciais(data.nome);
    setTecnicos(ts => {
      if (data.id) { logAudit("tecnico_editado", `Técnico ${data.nome} atualizado`); return ts.map(t => t.id === data.id ? { ...t, ...data, cor, iniciais } : t); }
      logAudit("tecnico_criado", `Técnico ${data.nome} criado`);
      return [...ts, { ...data, id: Date.now(), cor, iniciais }];
    });
    setTecnicoEdit(null);
  };

  const deleteTecnico = (id) => {
    const t = tecnicos.find(x => x.id === id);
    logAudit("tecnico_excluido", `Técnico ${t?.nome} excluído`);
    setTecnicos(ts => ts.filter(t => t.id !== id));
  };


  const deleteVisita = (id) => {
    const v = visitas.find(x => x.id === id);
    logAudit("visita_excluida", `Atendimento ${v?.referencia || v?.codigoAtendimento || id} excluído`);
    setVisitas(vs => vs.filter(x => x.id !== id));
  };

  const deleteRelatorio = (id) => {
    const r = relatorios.find(x => x.id === id);
    logAudit("relatorio_excluido", `Relatório ${r?.codigo || r?.referencia || id} excluído`);
    setRelatorios(rs => rs.filter(x => x.id !== id));
    setVisitas(vs => vs.map(v => v.relatorio?.id === id ? { ...v, relatorio: null, status: "agendada" } : v));
  };

  // KPIs do dashboard com handler de clique
  const kpiActions = {
    contratos: () => setTab("contratos"),
    tecnicos: () => setTab("tecnicos"),
    agendadas: () => setTab("agenda"),
    concluidas: () => setTab("agenda"),
    atrasadas: () => setTab("agenda"),
    relatorios: () => setTab("relatorios"),
    aprovacoes: () => setTab("aprovacoes"),
    meusAtendimentos: () => setTab("meus-atendimentos"),
  };

  const contratoAtual = contratoModal ? contratos.find(c => c.id === contratoModal) : null;

  // Permissões da sessão atual + contexto
  const authValue = {
    sessao,
    can: (acao) => can(sessao?.perfil, acao),
    logAudit,
  };

  // Boot ainda carregando
  if (!bootReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.white }}>
        <div className="text-center">
          <LogoLSFire size={60} />
          <div className="mt-4 text-sm" style={{ color: C.grayMid }}>Carregando…</div>
        </div>
      </div>
    );
  }

  // Não autenticado → tela de login
  if (!sessao) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.white }}>
        <div className="text-center max-w-sm">
          <LogoLSFire size={60} />
          <div className="mt-4 text-sm" style={{ color: C.gray }}>Seu usuário não tem acesso ao Serviço de campo, ou a sessão terminou.</div>
          <a href="/login?volta=/servico/" className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.orangeFill }}>Entrar</a>
        </div>
      </div>
    );
  }

  // Cliente só enxerga relatórios dos seus contratos
  const perfilAtual = sessao.perfil;
  const contratosVisiveis = can(perfilAtual, "verTodosContratos")
    ? contratos
    : contratos.filter(c => c.id === sessao.clienteId);
  const relatoriosVisiveis = can(perfilAtual, "verTodosContratos")
    ? relatorios
    : relatorios.filter(r => r.contratoId === sessao.clienteId);

  // na ordem do trabalho: agendar → executar → relatar → aprovar; depois contratos e equipe; por fim o controle
  const navItens = [
            { id: "dashboard",  label: "Painel",     Icon: Home,      show: true },
            { id: "agenda",     label: "Agenda",     Icon: Calendar,  show: can(perfilAtual, "agendar") || can(perfilAtual, "inspecionar") },
            { id: "visitas",    label: "Visitas técnicas", Icon: ClipboardList, show: can(perfilAtual, "agendar") || can(perfilAtual, "inspecionar") || can(perfilAtual, "verRelatorios") },
            { id: "meus-atendimentos", label: perfilAtual === "tecnico" ? "Meus atendimentos" : "Atendimentos por técnico", Icon: ClipboardCheck, show: perfilAtual === "tecnico" || can(perfilAtual, "aprovarRelatorios") },
            { id: "relatorios", label: "Relatórios", Icon: FileText,  show: can(perfilAtual, "verRelatorios") },
            { id: "aprovacoes", label: "Aprovações", Icon: ShieldCheck, show: can(perfilAtual, "aprovarRelatorios") },
            { id: "contratos",  label: "Contratos",  Icon: Building2, show: true },
            { id: "tecnicos",   label: "Técnicos",   Icon: Users,     show: can(perfilAtual, "verTecnicos") },
            { id: "auditoria",  label: "Auditoria",  Icon: ScrollText,show: can(perfilAtual, "verAuditoria") },
  ].filter(x => x.show);
  // tela que o perfil não abre (pedida no endereço ou pelo Pricer) volta ao painel
  if (tab !== "dashboard" && !navItens.some(x => x.id === tab)) setTab("dashboard");
  const comGrupo = navItens.map((x, i) => ({ ...x, grupo: GRUPO_ABA[x.id] || "", novoGrupo: i > 0 && (GRUPO_ABA[x.id] || "") !== (GRUPO_ABA[navItens[i - 1].id] || "") }));
  const embutido = typeof window !== "undefined" && window.top !== window;
  const temFab = can(perfilAtual, "agendar") || can(perfilAtual, "gerenciarContratos") || can(perfilAtual, "gerenciarTecnicos") || can(perfilAtual, "inspecionar");

  return (
    <AuthContext.Provider value={authValue}>
    <div className="min-h-screen flex lsfire-app-shell" style={{ background: C.grayLight, color: C.gray }}>
      <GlobalFonts />
      <PrintStyles />

      {/* Overlay do menu mobile (some no desktop) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 sm:hidden print:hidden" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setMobileNavOpen(false)} />
      )}

      {/* SIDEBAR — fixa/off-canvas no mobile, estática no desktop (md+) */}
      <aside className={`lsf-side fixed sm:relative inset-y-0 left-0 z-50 w-72 sm:w-60 flex flex-col print:hidden transform transition-transform duration-200 sm:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
             style={{ display: embutido ? "none" : undefined }}>
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <LogoLSFire size={30} escuro />
          <div className="flex items-center gap-1">
            <NotificationBell notificacoes={notificacoesParaExibir} naoLidas={notificacoesNaoLidas.length} onOpenNotificacao={abrirNotificacao} onMarkAllRead={marcarTodasNotificacoesLidas} />
            <button onClick={() => setMobileNavOpen(false)} aria-label="Fechar o menu" className="p-1 rounded hover:bg-gray-100 sm:hidden"><X size={20} /></button>
          </div>
        </div>
        <nav className="flex-1 px-2.5 py-1.5 overflow-y-auto">
          {comGrupo.map(({ id, label, Icon, grupo, novoGrupo }) => (
              <Fragment key={id}>
                {novoGrupo && grupo && <div className="lsf-nav-grupo">{grupo}</div>}
                <button onClick={() => { setTab(id); setMobileNavOpen(false); }} className="lsf-nav-btn" aria-current={tab === id ? "page" : undefined}>
                  <Icon size={19} />{label}
                </button>
              </Fragment>
          ))}
        </nav>

        <SyncStatusPanel status={syncStatus} onSync={sincronizarAgora} />

        {/* Usuário logado + sair */}
        <div className="px-3 py-3 border-t" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg mb-2" style={{ background: C.grayLight }}>
            {(() => { const Pi = PERFIS[perfilAtual]?.Icon || User; return <Pi size={18} style={{ color: PERFIS[perfilAtual]?.cor }} />; })()}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate" style={{ color: C.gray }}>{sessao.nome}</div>
              <div className="text-[10px] truncate" style={{ color: "var(--bar-dim)" }}>{PERFIS[perfilAtual]?.nome}</div>
            </div>
          </div>
          {(sessao.nivelPricer || 0) >= 1 && window.top === window && (
            <a href="/" className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold mb-1 hover:bg-gray-100" style={{ color: C.grayMid }}>
              <DollarSign size={14} /> Abrir o LS Pricer
            </a>
          )}
          {!window.__LSF_CLAUDE && (
          <button onClick={fazerLogout}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50" style={{ color: C.nok }}>
            <LogOut size={14} /> Sair
          </button>
          )}
        </div>

        <div className="p-4 border-t text-center" style={{ borderColor: C.border }}>
          <div className="text-[11px] font-bold tracking-wider font-display lsf-slogan">A FORÇA DA ÁGUA</div>
          <div className="text-[11px] font-bold tracking-wider font-display lsf-slogan">É A NOSSA FORÇA</div>
          <div className="text-[9px] mt-1" style={{ color: C.grayMid }}>lsfire.com.br</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className={`flex-1 overflow-auto min-w-0${temFab ? " pb-24" : ""}`}>
        {/* Dentro do Pricer: abas no lugar do menu (some na impressão). Sincronizar e avisos ficam fora da lista de abas. */}
        {embutido && (
          <div className="lsf-tabs print:hidden">
            <div className="lsf-tablist" role="tablist" aria-label="Serviço de campo" ref={tablistRef}>
              {comGrupo.map(({ id, label, Icon, novoGrupo }) => (
                <Fragment key={id}>
                  {novoGrupo && <span className="lsf-tab-sep" aria-hidden="true" />}
                  <button role="tab" className="lsf-tab" aria-current={tab === id ? "page" : undefined} aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={16} aria-hidden="true" />{label}</button>
                </Fragment>
              ))}
            </div>
            <button className="lsf-tab-acao" title="Atualizar com o que os outros gravaram" aria-label="Sincronizar: atualizar com o que os outros gravaram" onClick={sincronizarAgora}><RefreshCw size={15} className={syncStatus.syncing ? "animate-spin" : ""} /></button>
            <NotificationBell notificacoes={notificacoesParaExibir} naoLidas={notificacoesNaoLidas.length} onOpenNotificacao={abrirNotificacao} onMarkAllRead={marcarTodasNotificacoesLidas} alinharDireita />
          </div>
        )}
        <div className="lsf-side sticky top-0 z-30 flex items-center gap-3 px-4 py-3 sm:hidden print:hidden" style={{ display: embutido ? "none" : undefined }}>
          <button onClick={() => setMobileNavOpen(true)} className="p-1.5 rounded" style={{ color: "var(--bar-ink)" }} aria-label="Abrir o menu"><Menu size={22} /></button>
          <LogoLSFire size={26} escuro />
          <div className="flex-1" />
          <NotificationBell notificacoes={notificacoesParaExibir} naoLidas={notificacoesNaoLidas.length} onOpenNotificacao={abrirNotificacao} onMarkAllRead={marcarTodasNotificacoesLidas} alinharDireita />
        </div>
        {tab === "dashboard"  && <Dashboard visitas={visitas} contratos={contratosVisiveis} relatorios={relatoriosVisiveis} tecnicos={tecnicos} kpiActions={kpiActions} podeAprovar={can(perfilAtual, "aprovarRelatorios")} tecnicoId={perfilAtual === "tecnico" ? meuTecId : null} onOpenContrato={setContratoModal} onOpenVisita={(v) => v.despacho ? setItmFor(v) : setDespachoFor(v)} />}
        {tab === "meus-atendimentos" && (perfilAtual === "tecnico" || can(perfilAtual, "aprovarRelatorios")) && <MeusAtendimentosView visitas={visitas} contratos={contratosVisiveis} tecnicos={tecnicos} tecnicoId={meuTecId} souGestor={perfilAtual !== "tecnico"} onDespacho={setDespachoFor} onItm={setItmFor} onDocumento={setDocumentoInternoFor} />}
        {tab === "contratos"  && <Contratos contratos={contratosVisiveis} visitas={visitas} relatorios={relatoriosVisiveis} tecnicos={tecnicos} onOpen={setContratoModal} onNew={() => setContratoEdit({})} />}
        {tab === "agenda"     && <Agenda visitas={visitas} contratos={contratosVisiveis} tecnicos={tecnicos} onDespacho={setDespachoFor} onItm={setItmFor} onDocumento={setDocumentoInternoFor} />}
        {tab === "visitas"    && <VisitasTecnicas visitas={visitas} relatorios={relatoriosVisiveis} contratos={contratosVisiveis} tecnicos={tecnicos} onDespacho={setDespachoFor} onItm={setItmFor} onDocumento={setDocumentoInternoFor} onViewRel={setPreviewRel} onDeleteVisita={deleteVisita} />}
        {tab === "tecnicos"   && can(perfilAtual, "verTecnicos") && <TecnicosView tecnicos={tecnicos} visitas={visitas} onNew={() => setTecnicoEdit({})} onEdit={setTecnicoEdit} onDelete={deleteTecnico} />}
        {tab === "relatorios" && <Relatorios relatorios={relatoriosVisiveis} contratos={contratosVisiveis} onView={setPreviewRel} onDelete={deleteRelatorio} />}
        {tab === "aprovacoes" && can(perfilAtual, "aprovarRelatorios") && <AprovacoesView relatorios={relatoriosVisiveis} onView={setPreviewRel} />}
        {tab === "auditoria"  && can(perfilAtual, "verAuditoria") && <AuditoriaView auditoria={auditoria} />}
      </main>

      {/* FAB (o conteúdo tem espaço embaixo — pb-24 no main — para o botão não tampar o último item) */}
      <div className="fixed bottom-6 right-6 z-40 print:hidden">
        {fabOpen && (
          <div className="absolute bottom-16 right-0 bg-white rounded-xl shadow-xl border p-2 w-64 mb-2" style={{ borderColor: C.border }}>
            {can(perfilAtual, "agendar") && (
              <button onClick={() => { setNewVisitOpen({}); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <Calendar size={16} style={{ color: C.orangeDark }} /> Nova visita
              </button>
            )}
            {can(perfilAtual, "gerenciarContratos") && (
              <button onClick={() => { setContratoEdit({}); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <Building2 size={16} style={{ color: C.orangeDark }} /> Novo contrato
              </button>
            )}
            {can(perfilAtual, "gerenciarTecnicos") && (
              <button onClick={() => { setTecnicoEdit({}); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <User size={16} style={{ color: C.orangeDark }} /> Novo técnico
              </button>
            )}
            {can(perfilAtual, "inspecionar") && (
              <button onClick={() => { setNewVisitOpen({ avulsa: true }); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <FilePlus2 size={16} style={{ color: C.orangeDark }} /> Relatório avulso
              </button>
            )}
          </div>
        )}
        {temFab && (
          <button onClick={() => setFabOpen(f => !f)} aria-label={fabOpen ? "Fechar o menu de ações" : "Nova ação"} aria-expanded={fabOpen}
                  className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition"
                  style={{ background: C.orangeFill, color: "#fff" }}>
            {fabOpen ? <X size={24} /> : <Plus size={24} />}
          </button>
        )}
      </div>

      {/* MODAIS */}
      {contratoAtual && (
        <ContratoDetail
          contrato={contratoAtual}
          tecnicos={tecnicos}
          visitas={visitas.filter(v => v.contratoId === contratoAtual.id)}
          relatorios={relatorios.filter(r => r.contratoId === contratoAtual.id)}
          onClose={() => setContratoModal(null)}
          onEdit={() => setContratoEdit(contratoAtual)}
          onDelete={() => deleteContrato(contratoAtual.id)}
          onSchedule={(cfg) => { setNewVisitOpen({ contratoIdFixo: contratoAtual.id, ...(cfg || {}) }); }}
          onOpenVisita={(v) => { setContratoModal(null); v.despacho ? setItmFor(v) : setDespachoFor(v); }}
          onViewRel={(r) => { setContratoModal(null); setPreviewRel(r); }}
          onPrintRel={(r) => { setContratoModal(null); setPreviewRel(r); setPreviewAutoPrint(true); }}
          onWorkVisita={(v) => { v.despacho ? setItmFor(v) : setDespachoFor(v); }}
        />
      )}

      {newVisitOpen && (
        <Modal open onClose={() => setNewVisitOpen(null)} title={newVisitOpen?.avulsa ? "Relatório avulso" : "Nova visita"}>
          <NewVisitForm contratos={contratosVisiveis} tecnicos={tecnicos} initial={newVisitOpen}
            onCreate={(visita, action) => {
              const avulsa = !!newVisitOpen?.avulsa;
              // avulsa não pertence a contrato nenhum (senão aparece para o cliente do contrato escolhido por acaso)
              const visitaCriada = ensureAtendimentoRef({ ...visita, ...(avulsa ? { contratoId: null } : {}), id: Date.now(), avulsa, status: "agendada", despacho: null, relatorio: null });
              if (newVisitOpen?.avulsa) {
                setItmFor(visitaCriada);
                logAudit("relatorio_avulso", `Relatório avulso ${TIPO_REL[visita.tipo]?.nome} iniciado em ${fmtDate(visita.data)}`);
              } else {
                setVisitas(vs => [...vs, visitaCriada]);
                logAudit("visita_agendada", `Visita ${TIPO_REL[visita.tipo]?.nome} agendada — ${contratos.find(c=>c.id===visita.contratoId)?.cliente || "avulsa"} em ${fmtDate(visita.data)}`);
                criarNotificacao({ tipo: "visita_agendada", visita: visitaCriada });
                if (action === "despachar") setDespachoFor(visitaCriada);
              }
              setNewVisitOpen(null);
            }} />
        </Modal>
      )}

      {contratoEdit !== null && (
        <Modal open onClose={() => setContratoEdit(null)} title={contratoEdit?.id ? "Editar contrato" : "Novo contrato"} wide>
          <ContratoForm initial={contratoEdit} tecnicos={tecnicos} onSave={saveContrato} />
        </Modal>
      )}

      {tecnicoEdit !== null && (
        <Modal open onClose={() => setTecnicoEdit(null)} title={tecnicoEdit?.id ? "Editar técnico" : "Novo técnico"}>
          <TecnicoForm initial={tecnicoEdit} onSave={saveTecnico} />
        </Modal>
      )}

      {despachoFor && (
        <Modal open onClose={() => setDespachoFor(null)} title={`Checklist de despacho — ${despachoFor.referencia ? despachoFor.referencia + " | " : ""}${contratos.find(c => c.id === despachoFor.contratoId)?.cliente || "Visita avulsa"}`} wide>
          <DespachoForm
            visita={despachoFor}
            contrato={contratos.find(c => c.id === despachoFor.contratoId)}
            relatoriosContrato={relatorios.filter(r => r.contratoId === despachoFor.contratoId)}
            initial={despachoFor.despacho}
            onSave={(d, novasFreqs) => {
              const patch = { despacho: d };
              if (novasFreqs && novasFreqs.length > 0) {
                patch.freqs = novasFreqs;
                patch.freq = novasFreqs[0];
              }
              updateVisita(despachoFor.id, patch);
              logAudit("despacho", `Despacho concluído — ${contratos.find(c => c.id === despachoFor.contratoId)?.cliente || "avulsa"}`);
              setDespachoFor(null);
            }} />
        </Modal>
      )}

      {itmFor && (
        <ITMFlow visita={itmFor} contratos={contratos} tecnicos={tecnicos}
          initialDraft={itmFor.status === "devolvida" ? (itmFor.relatorio || null) : (itmFor.rascunhoItm || null)}
          onClose={() => setItmFor(null)}
          onSaveDraft={(snap, opcoes) => {
            setVisitas(vs => {
              const existe = vs.some(v => v.id === itmFor.id);
              if (existe) return vs.map(v => v.id === itmFor.id ? { ...v, rascunhoItm: snap } : v);
              return [...vs, { ...itmFor, rascunhoItm: snap, status: "rascunho" }];
            });
            // o salvamento automático (durante o preenchimento) não enche a auditoria: registra só ao fechar
            if (!opcoes?.auto) logAudit("rascunho_salvo", `Rascunho do atendimento ${itmFor.referencia || itmFor.codigoAtendimento || itmFor.id} salvo`);
            // Alguém diferente do técnico responsável começou a preencher este
            // atendimento (de qualquer tipo — ITM, avulso, contrato, start-up
            // etc.) e parou num rascunho: avisa o técnico na primeira gravação.
            // O sinal de "primeira vez" é não ter rascunho ANTES desta gravação
            // — não se a visita já existia no array, porque visitas de contrato
            // já existem desde o agendamento (diferente de avulso). Sem essa
            // distinção, o aviso nunca disparava para atendimentos de contrato.
            const jaTinhaRascunho = !!itmFor.rascunhoItm;
            if (!jaTinhaRascunho && !rascunhoAvisadoRef.current.has(itmFor.id) && itmFor.status !== "devolvida" && itmFor.tecnicoId && !mesmoId(itmFor.tecnicoId, meuTecId)) {
              rascunhoAvisadoRef.current.add(itmFor.id);
              criarNotificacao({ tipo: "atendimento_atribuido", visita: { ...itmFor, rascunhoItm: snap } });
            }
          }}
          onFinish={(rel) => {
            const relComTecnico = { ...rel, tecnicoId: itmFor.tecnicoId ?? rel.tecnicoId ?? null };
            const ehCorrecao = itmFor.status === "devolvida" && itmFor.relatorio?.id;
            const salvo = ehCorrecao ? reenviarRelatorio({ ...relComTecnico, id: itmFor.relatorio.id }) : saveRelatorio(relComTecnico);
            setVisitas(vs => {
              const existe = vs.some(v => v.id === itmFor.id);
              if (existe) return vs.map(v => v.id === itmFor.id ? { ...v, rascunhoItm: null, relatorio: salvo, status: "pendente_aprovacao" } : v);
              // Avulsa que nunca virou rascunho salvo: registra a visita agora.
              // Mantemos o registro (não apagamos mais) para que, se o relatório
              // for devolvido depois, o técnico consiga reabrir e corrigir pelo
              // mesmo caminho das visitas de contrato — antes disso, um avulso
              // devolvido não tinha por onde voltar.
              return [...vs, { ...itmFor, rascunhoItm: null, relatorio: salvo, status: "pendente_aprovacao" }];
            });
            setItmFor(null); setPreviewRel(salvo);
          }} />
      )}

      {documentoInternoFor && (
        <Modal open onClose={() => setDocumentoInternoFor(null)} title="Documento interno do atendimento" full>
          <DocumentoInternoAtendimento visita={documentoInternoFor} contrato={contratos.find(c => c.id === documentoInternoFor.contratoId)} tecnico={tecnicos.find(t => t.id === documentoInternoFor.tecnicoId)} />
        </Modal>
      )}

      {previewRel && (
        <RelatorioPreview rel={previewRel} onClose={() => { setPreviewRel(null); setPreviewAutoPrint(false); }} onApprove={aprovarRelatorio} onReturn={devolverRelatorio} autoPrint={previewAutoPrint} onAutoPrinted={() => setPreviewAutoPrint(false)} />
      )}
    </div>
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — KPIs clicáveis + próximas visitas clicáveis
// ═══════════════════════════════════════════════════════════════════════════
// ─── Componentes de indicadores do Dashboard (SVG/CSS puro, sem dependências) ──
function DashCard({ title, children, hint }) {
  return (
    <div className="border rounded-xl p-5" style={{ borderColor: C.border, background: C.white }}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="lsf-sec">{title}</h3>
        {hint && <div className="text-[10px]" style={{ color: C.grayMid }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function DashStat({ label, value, sub, accent = C.orange, Icon }) {
  return (
    <div className="border rounded-xl p-4 flex items-center gap-3" style={{ borderColor: C.border, background: C.white }}>
      {Icon && <div className="rounded-lg p-2.5" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}><Icon size={20} style={{ color: accent }} /></div>}
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none font-display" style={{ color: C.gray }}>{value}</div>
        <div className="text-[11px] font-semibold uppercase tracking-wide mt-1" style={{ color: C.grayMid }}>{label}</div>
        {sub && <div className="text-[10px] mt-0.5" style={{ color: C.grayMid }}>{sub}</div>}
      </div>
    </div>
  );
}

function DashBarsH({ data, defaultColor = C.orange, empty = "Sem dados no período" }) {
  if (!data || !data.length || data.every(d => !d.value)) {
    return <div className="text-sm py-6 text-center" style={{ color: C.grayMid }}>{empty}</div>;
  }
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="text-xs w-32 truncate text-right font-semibold" style={{ color: C.gray }} title={d.label}>{d.label}</div>
          <div className="flex-1 rounded h-6 overflow-hidden" style={{ background: C.grayLight }}>
            <div className="h-6 rounded flex items-center justify-end px-2 text-[11px] font-bold text-white transition-all"
                 style={{ width: `${Math.max(10, d.value / max * 100)}%`, background: d.color || defaultColor }}>
              {d.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DashBarsV({ data, color = C.orange, empty = "Sem dados" }) {
  if (!data || !data.length) return <div className="text-sm py-6 text-center" style={{ color: C.grayMid }}>{empty}</div>;
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="flex items-end justify-between gap-2 h-40 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
          <div className="text-[11px] font-bold" style={{ color: C.gray }}>{d.value || ""}</div>
          <div className="w-full rounded-t transition-all" style={{ height: `${d.value / max * 100}%`, minHeight: d.value ? 4 : 0, background: color }} />
          <div className="text-[10px] font-semibold uppercase" style={{ color: C.grayMid }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ visitas, contratos, relatorios, tecnicos, kpiActions, podeAprovar, tecnicoId, onOpenContrato, onOpenVisita }) {
  const today = hojeLocal();
  const kpis = useMemo(() => ({
    contratos: contratos.length,
    tecnicos: tecnicos.length,
    agendadas: visitas.filter(v => v.status === "agendada").length,
    concluidas: visitas.filter(v => v.status === "concluida").length,
    atrasadas: visitas.filter(v => v.status === "agendada" && v.data < today).length,
    relatorios: relatorios.length,
    aguardandoAprovacao: relatorios.filter(r => getRelApprovalStatus(r) === "pendente").length,
    meusAtendimentos: tecnicoId != null ? visitas.filter(v => v.tecnicoId != null && String(v.tecnicoId) === String(tecnicoId) && v.status !== "concluida").length : 0,
  }), [visitas, contratos, relatorios, tecnicos, today, tecnicoId]);

  const proximas = visitas.filter(v => v.status === "agendada").sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5);
  const nKpis = 6 + (podeAprovar ? 1 : 0) + (tecnicoId != null ? 1 : 0);

  // ─── Indicadores para gráficos ───────────────────────────────────────────
  const ind = useMemo(() => {
    // Atendimentos por tipo
    const tipoCount = {};
    visitas.forEach(v => { const k = v.tipo || "—"; tipoCount[k] = (tipoCount[k] || 0) + 1; });
    const porTipo = Object.entries(tipoCount)
      .map(([k, value]) => ({ label: TIPO_REL[k]?.nome || k, value, color: TIPO_REL[k]?.color || C.orange }))
      .sort((a, b) => b.value - a.value);

    // Atendimentos por técnico
    const tecCount = {};
    visitas.forEach(v => { const tn = tecnicos.find(t => t.id === v.tecnicoId)?.nome || "Sem técnico"; tecCount[tn] = (tecCount[tn] || 0) + 1; });
    const porTecnico = Object.entries(tecCount).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    // Últimos 6 meses
    const meses = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") });
    }
    const mesCount = Object.fromEntries(meses.map(m => [m.key, 0]));
    const mesClientes = Object.fromEntries(meses.map(m => [m.key, new Set()]));
    visitas.forEach(v => {
      if (!v.data) return;
      const k = v.data.slice(0, 7);
      if (k in mesCount) {
        mesCount[k]++;
        const c = contratos.find(x => x.id === v.contratoId);
        mesClientes[k].add(c?.cliente || v.referencia || v.id);
      }
    });
    const porMes = meses.map(m => ({ label: m.label, value: mesCount[m.key] }));
    const clientesPorMes = meses.map(m => ({ label: m.label, value: mesClientes[m.key].size }));
    const chaveMesAtual = meses[meses.length - 1].key;
    const clientesMesAtual = mesClientes[chaveMesAtual]?.size || 0;

    // Dias médios de atendimento (agendamento → conclusão do relatório)
    let somaDias = 0, n = 0;
    visitas.forEach(v => {
      if (v.relatorio?.criadoEm && v.data) {
        const d1 = new Date(v.data + "T00:00:00");
        const d2 = new Date(v.relatorio.criadoEm);
        const dias = Math.round((d2 - d1) / 86400000);
        if (Number.isFinite(dias) && dias >= 0) { somaDias += dias; n++; }
      }
    });
    const diasMedios = n ? (somaDias / n).toFixed(1) : "—";

    const concl = visitas.filter(v => v.status === "concluida").length;
    const taxaConclusao = visitas.length ? Math.round(concl / visitas.length * 100) : 0;

    return { porTipo, porTecnico, porMes, clientesPorMes, clientesMesAtual, diasMedios, taxaConclusao };
  }, [visitas, contratos, tecnicos]);

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1" style={{ color: C.gray }}>Painel do serviço</h1>
        <p className="text-sm" style={{ color: C.grayMid }}>Visão geral do sistema LS Fire</p>
      </div>

      {/* 6 a 8 cartões conforme o perfil: a grade acompanha a quantidade (nenhum fica sozinho numa linha) */}
      <div className="lsf-kpis mb-8" style={{ "--kpi-n": nKpis, "--kpi-md": nKpis <= 6 ? 3 : 4 }}>
        <KPI label="Contratos"  value={kpis.contratos}  Icon={Building2}     onClick={kpiActions.contratos} />
        <KPI label="Técnicos"   value={kpis.tecnicos}   Icon={Users}         onClick={kpiActions.tecnicos} />
        <KPI label="Agendadas"  value={kpis.agendadas}  Icon={Calendar}      onClick={kpiActions.agendadas} />
        <KPI label="Concluídas" value={kpis.concluidas} Icon={CheckCircle2}  onClick={kpiActions.concluidas} accent={C.ok} />
        <KPI label="Atrasadas"  value={kpis.atrasadas}  Icon={AlertTriangle} onClick={kpiActions.atrasadas} accent={C.nok} />
        <KPI label="Relatórios" value={kpis.relatorios} Icon={FileText}      onClick={kpiActions.relatorios} />
        {podeAprovar && <KPI label="Aguardando aprovação" value={kpis.aguardandoAprovacao} Icon={ShieldCheck} onClick={kpiActions.aprovacoes} accent={kpis.aguardandoAprovacao > 0 ? C.amber : C.grayMid} />}
        {tecnicoId != null && <KPI label="Meus atendimentos" value={kpis.meusAtendimentos} Icon={ClipboardCheck} onClick={kpiActions.meusAtendimentos} accent={kpis.meusAtendimentos > 0 ? C.orange : C.grayMid} />}
      </div>

      {/* ─── Indicadores ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="lsf-sec mb-3">Indicadores</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <DashStat label="Dias médios de atendimento" value={ind.diasMedios} sub="Agendamento → conclusão" accent={C.orange} Icon={Clock} />
          <DashStat label="Clientes atendidos no mês" value={ind.clientesMesAtual} sub="Mês corrente" accent={C.blue} Icon={Building2} />
          <DashStat label="Taxa de conclusão" value={`${ind.taxaConclusao}%`} sub="Visitas concluídas" accent={C.ok} Icon={CheckCircle2} />
          <DashStat label="Total de atendimentos" value={visitas.length} sub="Todos os registros" accent={C.purple} Icon={ClipboardList} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <DashCard title="Atendimentos por tipo">
            <DashBarsH data={ind.porTipo} />
          </DashCard>
          <DashCard title="Atendimentos por técnico">
            <DashBarsH data={ind.porTecnico} defaultColor={C.blue} />
          </DashCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <DashCard title="Atendimentos por mês" hint="últimos 6 meses">
            <DashBarsV data={ind.porMes} color={C.orange} />
          </DashCard>
          <DashCard title="Clientes atendidos por mês" hint="últimos 6 meses">
            <DashBarsV data={ind.clientesPorMes} color={C.blue} />
          </DashCard>
        </div>
      </div>

      <section className="border rounded-xl p-5" style={{ borderColor: C.border }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="lsf-sec">Próximas visitas</h2>
          <button onClick={kpiActions.agendadas} className="text-sm font-semibold flex items-center gap-1" style={{ color: C.orangeDark }}>
            Ver agenda <ChevronRight size={14} />
          </button>
        </div>
        {proximas.length === 0 && <div className="text-center py-8 text-sm" style={{ color: C.grayMid }}>Nenhuma visita agendada</div>}
        {proximas.map(v => {
          const c = contratos.find(x => x.id === v.contratoId);
          const tec = tecnicos.find(t => t.id === v.tecnicoId);
          return (
            <button key={v.id} onClick={() => onOpenVisita(v)} className="w-full flex items-center gap-4 py-3 border-b last:border-0 text-left hover:bg-orange-50 px-2 rounded transition flex-wrap" style={{ borderColor: C.border }}>
              <div className="text-center" style={{ width: 56 }}>
                <div className="text-[10px] font-bold uppercase" style={{ color: C.orangeDark }}>{fmtMonth(v.data)}</div>
                <div className="text-xl font-black font-display">{new Date(v.data + "T00:00:00").getDate()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {v.referencia && (
                    <span style={{ color: C.orangeDark }}>
                      {v.referencia}{v.referenciaProvisoria && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle" style={{ background: C.amberLight, color: C.amber }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>} |{" "}
                    </span>
                  )}
                  {c?.cliente || "—"}
                </div>
                <div className="text-xs flex gap-2 items-center mt-0.5 flex-wrap" style={{ color: C.grayMid }}>
                  <span className="flex items-center gap-1"><MapPin size={11} /> {c?.endereco}</span>
                  {tec && <span className="flex items-center gap-1"><User size={11} /> {tec.nome}</span>}
                </div>
              </div>
              <TipoBadge tipo={v.tipo} />
              <VisitaFreqsPills visita={v} />
              <Avatar tec={tec} size={32} />
            </button>
          );
        })}
      </section>
    </div>
  );
}

function KPI({ label, value, Icon, accent, onClick }) {
  return (
    <button onClick={onClick} className="border rounded-xl p-4 text-left hover:shadow-md transition" style={{ borderColor: C.border, background: C.white }}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={18} style={{ color: accent || C.grayMid }} />
        <ChevronRight size={14} style={{ color: C.grayMid }} />
      </div>
      <div className="text-2xl font-black font-display" style={{ color: accent || C.gray }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: C.grayMid }}>{label}</div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRATOS — Lista com cards clicáveis
// ═══════════════════════════════════════════════════════════════════════════
function Contratos({ contratos, visitas, relatorios, tecnicos, onOpen, onNew }) {
  const { can } = useAuth();
  const verValores = can("verValores");
  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: C.gray }}>Contratos</h1>
        {can("gerenciarContratos") && (
          <button onClick={onNew} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orangeFill }}>
            <Plus size={16} /> Novo contrato
          </button>
        )}
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {contratos.map(c => {
          const tec = tecnicos.find(t => t.id === c.tecnicoId);
          const visCount = visitas.filter(v => v.contratoId === c.id).length;
          const relCount = relatorios.filter(r => r.contratoId === c.id).length;
          return (
            <button key={c.id} onClick={() => onOpen(c.id)}
                    className="border rounded-xl p-5 text-left hover:shadow-md transition"
                    style={{ borderColor: C.border, background: C.white }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  {c.codigo && (
                    <div className="text-xs font-black mb-0.5 flex items-center gap-1.5" style={{ color: C.blue }}>
                      {c.codigo}
                      {c.codigoProvisorio && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: C.amberLight, color: C.amber }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>}
                    </div>
                  )}
                  <div className="font-bold text-base" style={{ color: C.gray }}>{c.cliente}</div>
                  <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: C.grayMid }}>
                    <MapPin size={11} /> {c.endereco}
                  </div>
                </div>
                <Avatar tec={tec} size={36} />
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <Pill bg={C.orangeLight} fg={C.orangeDark}>Contrato de {getDuracaoMeses(c)} meses</Pill>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs mb-3 pb-3 border-b" style={{ borderColor: C.border, color: C.grayMid }}>
                {verValores ? (
                  <div>
                    <div className="text-[10px] uppercase font-bold">Valor mensal</div>
                    <div className="font-bold text-sm" style={{ color: C.gray }}>{fmtCurrency(c.valorMensal)}</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[10px] uppercase font-bold">Início</div>
                    <div className="font-bold text-sm" style={{ color: C.gray }}>{fmtDate(c.dataInicio)}</div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] uppercase font-bold">Validade</div>
                  <div className="font-bold text-sm" style={{ color: C.gray }}>{fmtDate(c.validade)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: C.grayMid }}>
                <span>Contato: <span className="font-semibold" style={{ color: C.gray }}>{c.contato}</span></span>
                <span>{visCount} visita{visCount !== 1 ? "s" : ""} · {relCount} relatório{relCount !== 1 ? "s" : ""}</span>
              </div>
            </button>
          );
        })}
      </div>
      {contratos.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center" style={{ borderColor: C.border }}>
          <Building2 size={48} className="mx-auto mb-3" style={{ color: C.grayMid }} />
          <div className="text-base font-bold mb-1" style={{ color: C.gray }}>Nenhum contrato cadastrado</div>
          <div className="text-sm" style={{ color: C.grayMid }}>Clique em "Novo contrato" para começar.</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRATO DETAIL — Modal com tudo do contrato
// ═══════════════════════════════════════════════════════════════════════════
function ContratoDetail({ contrato, tecnicos, visitas, relatorios, onClose, onEdit, onDelete, onSchedule, onOpenVisita, onViewRel, onPrintRel, onWorkVisita }) {
  const { can } = useAuth();
  const verValores = can("verValores");
  const { sessao } = useAuth();
  const podeGerenciar = can("gerenciarContratos");
  const podeExcluir = isAdminProfile(sessao?.perfil);
  const podeAgendar = can("agendar");
  const [tab, setTab] = useState("info"); // info | historico | agendar
  const dialogoRef = useDialogo(true, onClose);
  const tituloId = useId();
  const tec = tecnicos.find(t => t.id === contrato.tecnicoId);
  const hoje = hojeLocal();
  const visitasOrdenadas = [...visitas].sort((a, b) => b.data.localeCompare(a.data));

  // Última visita por frequência
  const ultimaPorFreq = useMemo(() => calcularUltimaPorFreq(relatorios), [relatorios]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div ref={dialogoRef} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
           className="bg-white rounded-xl shadow-2xl flex flex-col outline-none" style={{ maxWidth: 1000, width: "100%", maxHeight: "92vh" }}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4" style={{ borderColor: C.border, background: C.orangeLight }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5" style={{ color: C.orangeDark }}>
              Contrato {contrato.codigo ? `· ${contrato.codigo}` : ""}
              {contrato.codigoProvisorio && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold normal-case tracking-normal" style={{ background: C.amberLight, color: C.amber }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>}
            </div>
            <h2 id={tituloId} className="text-xl sm:text-2xl font-black mb-1 break-words" style={{ color: C.gray }}>{contrato.cliente}</h2>
            <div className="flex items-center gap-2 text-xs" style={{ color: C.grayMid }}>
              <MapPin size={12} /> {contrato.endereco}
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4">
            <Avatar tec={tec} size={44} />
            <div className="flex gap-2">
              {podeGerenciar && <button onClick={onEdit} className="p-2 rounded hover:bg-white/50" title="Editar" aria-label="Editar contrato"><Pencil size={16} /></button>}
              {podeExcluir && <button onClick={() => { if (confirm("Excluir este contrato?")) onDelete(); }} className="p-2 rounded hover:bg-white/50" title="Excluir" aria-label="Excluir contrato"><Trash2 size={16} style={{ color: C.nok }} /></button>}
              <button onClick={onClose} className="p-2 rounded hover:bg-white/50" title="Fechar" aria-label="Fechar"><X size={20} /></button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b flex overflow-x-auto" style={{ borderColor: C.border }}>
          {[
            { id: "info", label: "Informações", Icon: Building2, show: true },
            { id: "historico", label: `Histórico (${visitas.length})`, Icon: History, show: true },
            { id: "agendar", label: "Agendar", Icon: CalendarDays, show: podeAgendar },
          ].filter(x => x.show).map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                      className="flex items-center gap-2 px-4 sm:px-5 py-3 text-sm font-bold border-b-2 transition shrink-0 whitespace-nowrap"
                      style={{
                        borderColor: active ? C.orange : "transparent",
                        color: active ? C.orangeDark : C.grayMid,
                        background: active ? C.orangeLight : "transparent"
                      }}>
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === "info" && (
            <div className="space-y-6">
              {contrato.propostaNumero && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.orangeLight, color: C.gray }}>
                  Contrato criado a partir da proposta <b>{contrato.propostaNumero}</b> do LS Pricer{contrato.criadoPor ? ` por ${contrato.criadoPor}` : ""}.
                </div>
              )}
              {verValores && (
              <section>
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orangeDark }}>Dados contratuais</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <DataRow label="Valor mensal" value={fmtCurrency(contrato.valorMensal)} />
                  <DataRow label="Valor total do contrato" value={fmtCurrency((contrato.valorMensal || 0) * getDuracaoMeses(contrato))} />
                  <DataRow label="Data de início" value={fmtDate(contrato.dataInicio)} />
                  <DataRow label={`Duração: ${getDuracaoMeses(contrato)} meses`} value={`Validade: ${fmtDate(contrato.validade)}`} accent={contrato.validade && contrato.validade < hoje ? C.nok : null} />
                </div>
              </section>
              )}

              {!verValores && (
                <section>
                  <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orangeDark }}>Dados do contrato</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <DataRow label="Data de início" value={fmtDate(contrato.dataInicio)} />
                    <DataRow label={`Duração: ${getDuracaoMeses(contrato)} meses`} value={`Validade: ${fmtDate(contrato.validade)}`} accent={contrato.validade && contrato.validade < hoje ? C.nok : null} />
                  </div>
                </section>
              )}

              <section>
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orangeDark }}>Cronograma NFPA 25 — {getDuracaoMeses(contrato)} meses</h3>
                <p className="text-xs mb-3" style={{ color: C.grayMid }}>
                  Visitas mensais previstas. Toda visita realiza inspeção <strong>Semanal</strong> e <strong>Mensal</strong>. A cada 3 meses adiciona <strong>Trimestral</strong>; a cada 6 meses, <strong>Semestral</strong>; a cada 12 meses, <strong>Anual</strong>.
                </p>
                <div className="space-y-1.5">
                  {gerarCronogramaContrato(contrato).map(c => {
                    const relMes = relatorios.find(r => {
                      const m = mesDoContrato(contrato.dataInicio, r.dataEmissao);
                      return m === c.mes && r.tipo === "itm";
                    });
                    const relStatus = relMes ? getRelApprovalStatus(relMes) : null; // "pendente" | "aprovado" | "devolvido" | null
                    const realizada = relStatus === "aprovado" ? relMes : null;
                    const visitaMes = visitas.find(v => v.tipo === "itm" && v.status !== "concluida" && !v.avulsa && v.contratoId === contrato.id && mesDoContrato(contrato.dataInicio, v.data) === c.mes);
                    return (
                      <div key={c.mes} className="border rounded-lg p-2.5 flex items-center gap-3 flex-wrap" style={{ borderColor: realizada ? C.ok : relStatus === "devolvido" ? C.nok : C.border, background: realizada ? C.okLight : relStatus === "devolvido" ? C.nokLight : "transparent" }}>
                        <div className="text-center" style={{ width: 50 }}>
                          <div className="text-[9px] font-bold uppercase" style={{ color: C.orangeDark }}>MÊS</div>
                          <div className="text-lg font-black" style={{ color: C.gray }}>{c.mes}</div>
                        </div>
                        <div className="text-xs" style={{ color: C.grayMid, width: 90 }}>
                          {fmtDate(c.data)}
                        </div>
                        <div className="flex-1 flex flex-wrap gap-1">
                          {c.freqs.map(f => (
                            <Pill key={f} bg={FREQ_COLOR[f]?.bg} fg={FREQ_COLOR[f]?.fg}>{f}</Pill>
                          ))}
                        </div>
                        {realizada ? (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.ok }}>
                              <CheckCircle2 size={12} /> {fmtDate(realizada.dataEmissao)}
                            </span>
                            <button onClick={() => onViewRel(realizada)} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: C.border, color: C.gray }}>
                              <Eye size={12} /> Ver checklist
                            </button>
                            <button onClick={() => onPrintRel?.(realizada)} className="px-2.5 py-1 rounded text-[11px] font-bold text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
                              <Printer size={12} /> Imprimir
                            </button>
                          </div>
                        ) : relStatus === "devolvido" ? (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.nok }}>
                              <AlertTriangle size={12} /> Devolvido p/ correção
                            </span>
                            <button onClick={() => (onWorkVisita || onOpenVisita)(visitaMes)} className="px-2.5 py-1 rounded text-[11px] font-bold text-white flex items-center gap-1" style={{ background: C.nok }}>
                              <ClipboardCheck size={12} /> Corrigir e reenviar
                            </button>
                          </div>
                        ) : relStatus === "pendente" ? (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.amber }}>
                              <Clock size={12} /> Aguardando aprovação
                            </span>
                            <button onClick={() => onViewRel(relMes)} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: C.border, color: C.gray }}>
                              <Eye size={12} /> Ver
                            </button>
                          </div>
                        ) : visitaMes ? (
                          visitaMes.despacho ? (
                            <button onClick={() => (onWorkVisita || onOpenVisita)(visitaMes)} className="px-2.5 py-1 rounded text-[11px] font-bold text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
                              <ClipboardCheck size={12} /> {visitaMes.rascunhoItm ? "Continuar atendimento" : "Iniciar atendimento"}
                            </button>
                          ) : (
                            <button onClick={() => (onWorkVisita || onOpenVisita)(visitaMes)} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: C.amber, color: C.amber }}>
                              <ClipboardList size={12} /> Fazer despacho
                            </button>
                          )
                        ) : (
                          podeAgendar ? (
                            <button onClick={() => onSchedule?.({ data: c.data })} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: C.orange, color: C.orangeDark }}>
                              <Plus size={12} /> Agendar visita
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: C.grayMid }}>Pendente</span>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orangeDark }}>Equipamentos do contrato</h3>
                {(contrato.equipamentos && contrato.equipamentos.length > 0) ? (
                  <div className="flex flex-wrap gap-2">
                    {contrato.equipamentos.map(e => (
                      <div key={e.id} className="border rounded-lg px-3 py-2 text-xs" style={{ borderColor: C.border }}>
                        <span className="font-bold" style={{ color: C.gray }}>{e.nome || "—"}</span>
                        <span className="ml-2" style={{ color: C.orangeDark }}>{equipTipoLabel(e.tipo)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: C.grayMid }}>Nenhum equipamento cadastrado. Edite o contrato para cadastrar — o ITM passará a mostrar só os equipamentos existentes.</p>
                )}
              </section>

              <section>
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orangeDark }}>Contato e responsável</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <DataRow label="Contato" value={contrato.contato} />
                  <DataRow label="Telefone" value={contrato.telefone || "—"} />
                  <DataRow label="E-mail" value={contrato.email || "—"} />
                  <DataRow label="Técnico responsável" value={tec?.nome || "—"} />
                </div>
              </section>
            </div>
          )}

          {tab === "historico" && (
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orangeDark }}>Histórico de visitas e relatórios</h3>
              {visitasOrdenadas.length === 0 && (
                <div className="text-center py-12 text-sm" style={{ color: C.grayMid }}>
                  Nenhuma visita registrada para este contrato
                </div>
              )}
              <div className="space-y-2">
                {visitasOrdenadas.map(v => {
                  const tecV = tecnicos.find(t => t.id === v.tecnicoId);
                  const atrasada = v.status === "agendada" && v.data < hoje;
                  return (
                    <div key={v.id} className="border rounded-lg p-3 flex items-center gap-3" style={{ borderColor: C.border }}>
                      <div className="text-center" style={{ width: 48 }}>
                        <div className="text-[10px] font-bold uppercase" style={{ color: C.orangeDark }}>{fmtMonth(v.data)}</div>
                        <div className="text-lg font-black font-display">{new Date(v.data + "T00:00:00").getDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {(v.referencia || v.codigoAtendimento) && (
                            <span className="text-xs font-black" style={{ color: C.orangeDark }}>{v.referencia || v.codigoAtendimento}</span>
                          )}
                          <TipoBadge tipo={v.tipo} />
                          <VisitaFreqsPills visita={v} />
                          {v.status === "concluida" && <Pill bg={C.okLight} fg={C.ok}>Concluída</Pill>}
                          {atrasada && <Pill bg={C.nokLight} fg={C.nok}>Atrasada</Pill>}
                          {v.status === "agendada" && !atrasada && <Pill bg={C.naLight} fg={C.na}>Agendada</Pill>}
                        </div>
                        <div className="text-xs flex items-center gap-1" style={{ color: C.grayMid }}><User size={11} /> {tecV?.nome || "—"}</div>
                      </div>
                      {v.relatorio ? (
                        <button onClick={() => onViewRel(v.relatorio)} className="px-3 py-1.5 rounded text-xs font-bold text-white" style={{ background: C.orangeFill }}>
                          Ver relatório
                        </button>
                      ) : (
                        <button onClick={() => onOpenVisita(v)} className="px-3 py-1.5 rounded text-xs font-bold border" style={{ borderColor: C.border, color: C.gray }}>
                          {v.despacho ? "Continuar" : "Despacho"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "agendar" && (
            <div className="text-center py-8">
              <Calendar size={48} className="mx-auto mb-3" style={{ color: C.orangeDark }} />
              <p className="text-sm mb-4" style={{ color: C.grayMid }}>
                Agende uma nova visita para este contrato escolhendo o tipo (ITM, Inspeção, Preventiva ou Corretiva).
              </p>
              <button onClick={onSchedule} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white inline-flex items-center gap-2" style={{ background: C.orangeFill }}>
                <Plus size={16} /> Agendar nova visita
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value, accent }) {
  return (
    <div className="border rounded-lg p-3" style={{ borderColor: C.border }}>
      <div className="text-[10px] uppercase font-bold mb-1" style={{ color: C.grayMid }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: accent || C.gray }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRATO FORM
// ═══════════════════════════════════════════════════════════════════════════
const TIPOS_EQUIP_CONTRATO = [
  { id: "diesel", label: "Bomba Diesel" },
  { id: "eletrica", label: "Bomba Elétrica" },
  { id: "jockey", label: "Bomba Jockey" },
  { id: "vapor", label: "Bomba a Vapor" },
];
const equipTipoLabel = (t) => TIPOS_EQUIP_CONTRATO.find(x => x.id === t)?.label || t;

function ContratoForm({ initial, tecnicos, onSave }) {
  const [data, setData] = useState({
    cliente: "", endereco: "", contato: "", telefone: "", email: "",
    tecnicoId: tecnicos[0]?.id || "",
    duracaoMeses: 12, valorMensal: 0, dataInicio: hojeLocal(),
    equipamentos: [],
    ...initial
  });
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));

  const equipamentos = data.equipamentos || [];
  const addEquip = () => setData(d => ({ ...d, equipamentos: [...(d.equipamentos || []), { id: Date.now(), nome: "", tipo: "diesel" }] }));
  const updEquip = (id, k, v) => setData(d => ({ ...d, equipamentos: (d.equipamentos || []).map(e => e.id === id ? { ...e, [k]: v } : e) }));
  const rmEquip = (id) => setData(d => ({ ...d, equipamentos: (d.equipamentos || []).filter(e => e.id !== id) }));

  // Calcula validade automaticamente
  const validade = useMemo(() => {
    if (!data.dataInicio || !data.duracaoMeses) return "";
    const ini = new Date(data.dataInicio + "T00:00:00");
    const fim = addMesesLocal(ini, data.duracaoMeses); // mesmo limite de fim de mês do cronograma
    fim.setDate(fim.getDate() - 1);
    return isoLocal(fim);
  }, [data.dataInicio, data.duracaoMeses]);

  // Cronograma de visitas previstas
  const cronograma = useMemo(() => {
    return gerarCronogramaContrato({ dataInicio: data.dataInicio, duracaoMeses: data.duracaoMeses });
  }, [data.dataInicio, data.duracaoMeses]);

  const [salvando, setSalvando] = useState(false);
  const handleSave = async () => { setSalvando(true); await onSave({ ...data, validade }); setSalvando(false); };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Cliente"><input value={data.cliente} onChange={e => upd("cliente", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Técnico responsável">
          <select value={data.tecnicoId} onChange={e => upd("tecnicoId", parseInt(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }}>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Field>
        <Field label="Endereço"><input value={data.endereco} onChange={e => upd("endereco", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm md:col-span-2" style={{ borderColor: C.border }} /></Field>
        <Field label="Contato"><input value={data.contato} onChange={e => upd("contato", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Telefone"><input value={data.telefone} onChange={e => upd("telefone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="E-mail"><input type="email" value={data.email} onChange={e => upd("email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>

      {/* Equipamentos do contrato — herdados pelo ITM/checklist */}
      <div className="border rounded-lg p-4" style={{ borderColor: C.border }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: C.orangeDark }}>Equipamentos do contrato</h3>
            <p className="text-[11px] mt-0.5" style={{ color: C.grayMid }}>
              Cadastre os conjuntos de bomba existentes neste cliente. O checklist NFPA 25 do ITM passa a mostrar só os equipamentos cadastrados aqui — sem precisar marcar N/A a cada visita.
            </p>
          </div>
          <button type="button" onClick={addEquip} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1 shrink-0" style={{ background: C.orangeFill }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
        {equipamentos.length === 0 ? (
          <div className="text-xs text-center py-3 border-2 border-dashed rounded-lg" style={{ color: C.grayMid, borderColor: C.border }}>
            Nenhum equipamento cadastrado. (Sem cadastro, o ITM mostra todos os tipos de equipamento.)
          </div>
        ) : (
          <div className="space-y-2">
            {equipamentos.map(e => (
              <div key={e.id} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input value={e.nome} onChange={ev => updEquip(e.id, "nome", ev.target.value)} placeholder="Identificação (ex.: Bomba Diesel 01)"
                       className="flex-1 border rounded-lg px-3 py-2 text-sm min-w-0" style={{ borderColor: C.border }} />
                <div className="flex gap-2">
                  <select aria-label="Tipo do equipamento" value={e.tipo} onChange={ev => updEquip(e.id, "tipo", ev.target.value)}
                          className="flex-1 sm:flex-none border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border, minWidth: 150 }}>
                    {TIPOS_EQUIP_CONTRATO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button type="button" onClick={() => rmEquip(e.id)} className="p-2 rounded hover:bg-gray-100 shrink-0" title="Remover" aria-label="Remover equipamento"><Trash2 size={16} style={{ color: C.nok }} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Valor mensal (R$)"><input type="number" step="0.01" value={data.valorMensal} onChange={e => upd("valorMensal", parseFloat(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Data de início"><input type="date" value={data.dataInicio} onChange={e => upd("dataInicio", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Duração do contrato">
          <div className="flex gap-2">
            {DURACOES_CONTRATO.map(d => (
              <button key={d} type="button" onClick={() => upd("duracaoMeses", d)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-bold border-2 transition"
                      style={{
                        background: data.duracaoMeses === d ? C.orangeFill : "transparent",
                        color: data.duracaoMeses === d ? "#fff" : C.gray,
                        borderColor: data.duracaoMeses === d ? C.orange : C.border,
                      }}>
                {d}m
              </button>
            ))}
          </div>
        </Field>
      </div>

      {data.dataInicio && (
        <div className="border rounded-lg p-3 text-xs" style={{ borderColor: C.border, background: C.grayLight }}>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="font-bold uppercase tracking-wide" style={{ color: C.orangeDark }}>Cronograma NFPA 25</span>
            <span style={{ color: C.grayMid }}>
              Validade: <strong style={{ color: C.gray }}>{fmtDate(validade)}</strong> ·
              Valor total: <strong style={{ color: C.gray }}>{fmtCurrency((data.valorMensal || 0) * data.duracaoMeses)}</strong>
            </span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
            {cronograma.map(c => (
              <div key={c.mes} className="bg-white border rounded p-1.5 text-center" style={{ borderColor: C.border }}>
                <div className="text-[9px] font-bold" style={{ color: C.orangeDark }}>MÊS {c.mes}</div>
                <div className="text-[10px] mb-1" style={{ color: C.gray }}>{fmtDate(c.data)}</div>
                <div className="flex flex-wrap justify-center gap-0.5">
                  {c.freqs.map(f => (
                    <span key={f} title={f} className="w-2 h-2 rounded-full" style={{ background: FREQ_COLOR[f]?.fg }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-[10px]" style={{ color: C.grayMid }}>
            {FREQ_NFPA.map(f => (
              <span key={f} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: FREQ_COLOR[f]?.fg }} /> {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t" style={{ borderColor: C.border }}>
        <button onClick={handleSave} disabled={!data.cliente || !data.endereco || !data.dataInicio || salvando}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2"
                style={{ background: C.orangeFill }}>
          {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} {salvando ? "Gerando número…" : "Salvar contrato"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENDA — Lista + Calendário, com filtro por tipo
// ═══════════════════════════════════════════════════════════════════════════
function Agenda({ visitas, contratos, tecnicos, onDespacho, onItm, onDocumento }) {
  const [view, setView] = useState("lista");
  const [filterTec, setFilterTec] = useState("todos");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [calMonth, setCalMonth] = useState(() => hojeLocal().slice(0, 7));

  const filtered = useMemo(() => visitas.filter(v =>
    (filterTec === "todos" || v.tecnicoId === parseInt(filterTec)) &&
    (filterTipo === "todos" || v.tipo === filterTipo)
  ), [visitas, filterTec, filterTipo]);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Agenda</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select aria-label="Filtrar por tipo" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os tipos</option>
            {Object.values(TIPO_REL).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select aria-label="Filtrar por técnico" value={filterTec} onChange={e => setFilterTec(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <div className="border rounded-lg p-1 flex" style={{ borderColor: C.border }}>
            <button onClick={() => setView("lista")} className="px-3 py-1 text-xs font-semibold rounded"
                    style={{ background: view === "lista" ? C.orangeFill : "transparent", color: view === "lista" ? "#fff" : C.gray }}>
              Lista
            </button>
            <button onClick={() => setView("calendario")} className="px-3 py-1 text-xs font-semibold rounded"
                    style={{ background: view === "calendario" ? C.orangeFill : "transparent", color: view === "calendario" ? "#fff" : C.gray }}>
              Calendário
            </button>
          </div>
        </div>
      </div>

      {view === "lista" && (
        <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
          {filtered.length === 0 && <div className="p-8 text-center text-sm" style={{ color: C.grayMid }}>Nenhuma visita</div>}
          {filtered.sort((a, b) => a.data.localeCompare(b.data)).map(v => {
            const c = contratos.find(x => x.id === v.contratoId);
            const tec = tecnicos.find(t => t.id === v.tecnicoId);
            const today = hojeLocal();
            const atrasada = v.status === "agendada" && v.data < today;
            return (
              <div key={v.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="text-center" style={{ width: 56 }}>
                  <div className="text-[10px] font-bold uppercase" style={{ color: C.orangeDark }}>{fmtMonth(v.data)}</div>
                  <div className="text-2xl font-black font-display">{new Date(v.data + "T00:00:00").getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">
                    {v.referencia && (
                    <span style={{ color: C.orangeDark }}>
                      {v.referencia}{v.referenciaProvisoria && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle" style={{ background: C.amberLight, color: C.amber }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>} |{" "}
                    </span>
                  )}
                    {c?.cliente || "Visita avulsa"}
                  </div>
                  <div className="text-xs flex gap-2 items-center mt-1 flex-wrap" style={{ color: C.grayMid }}>
                    <TipoBadge tipo={v.tipo} />
                    {c?.codigo && <span className="flex items-center gap-1 font-bold" style={{ color: C.blue }}><Building2 size={11} /> Contrato {c.codigo}</span>}
                    {tec && <span className="flex items-center gap-1"><User size={11} /> {tec.nome}</span>}
                    <VisitaFreqsPills visita={v} />
                    {atrasada && <Pill bg={C.nokLight} fg={C.nok}>Atrasada</Pill>}
                    {v.status === "concluida" && <Pill bg={C.okLight} fg={C.ok}>Concluída</Pill>}
                    {v.status === "pendente_aprovacao" && <Pill bg={C.amberLight} fg={C.amber}>Aguardando aprovação</Pill>}
                    {v.status === "devolvida" && <Pill bg={C.nokLight} fg={C.nok}>Devolvida p/ correção</Pill>}
                    {v.despacho && !v.relatorio && <Pill bg={C.amberLight} fg={C.amber}>Despachada</Pill>}
                    {!v.despacho && v.status === "agendada" && <Pill bg={C.naLight} fg={C.na}>Aguardando despacho</Pill>}
                  </div>
                </div>
                <Avatar tec={tec} size={32} />
                <div className="flex gap-2">
                  <button onClick={() => onDocumento(v)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border"
                          style={{ borderColor: C.border, color: C.gray }}>
                    Doc. Interno
                  </button>
                  <button onClick={() => onDespacho(v)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border"
                          style={{ borderColor: C.border, color: C.gray }}>
                    Despacho
                  </button>
                  <button onClick={() => onItm(v)} disabled={!v.despacho}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg text-white disabled:opacity-40"
                          style={{ background: C.orangeFill }}>
                    {v.status === "concluida" ? "Ver" : v.status === "devolvida" ? "Corrigir" : (v.rascunhoItm ? "Continuar" : "Iniciar")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "calendario" && (
        <CalendarView visitas={filtered} contratos={contratos} month={calMonth} onMonthChange={setCalMonth} onItm={onItm} />
      )}
    </div>
  );
}

function getRelApprovalStatus(rel) {
  return rel?.aprovacao?.status || "aprovado";
}

// "#700100 — Cliente": o que falta não aparece e o código não se repete quando é igual ao número do atendimento
function tituloRelatorio(r) {
  const num = r?.referencia || r?.codigoAtendimento || r?.codigo || "";
  const partes = [];
  if (num) partes.push("#" + num);
  if (r?.codigo && String(r.codigo) !== String(num)) partes.push(r.codigo);
  if (r?.cliente) partes.push(r.cliente);
  return partes.join(" — ") || "Relatório";
}
// conformidade só quando é número (relatório antigo/importado pode não ter)
function conformidadeNum(r) {
  const v = r?.conformidade;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Sino de notificações in-app: contador + lista ao clicar. Sem push/e-mail —
// funciona só enquanto o app está aberto, lendo o estado sincronizado.
function NotificationBell({ notificacoes, naoLidas, onOpenNotificacao, onMarkAllRead, alinharDireita = false }) {
  const [open, setOpen] = useState(false);
  const ICONS = { novo_pendente: ClipboardCheck, aprovado: CheckCircle2, devolvido: AlertTriangle, visita_agendada: Calendar, atendimento_atribuido: FilePlus2 };
  const CORES = { novo_pendente: C.blue, aprovado: C.ok, devolvido: C.nok, visita_agendada: C.orange, atendimento_atribuido: C.orange };
  const texto = (n) => {
    if (n.tipo === "novo_pendente") return `Novo relatório aguardando aprovação — ${n.relatorioCodigo} · ${n.cliente || ""}`;
    if (n.tipo === "aprovado") return `Relatório aprovado — ${n.relatorioCodigo} · ${n.cliente || ""}`;
    if (n.tipo === "devolvido") return `Devolvido para correção — ${n.relatorioCodigo}${n.motivo ? `: ${n.motivo}` : ""}`;
    if (n.tipo === "visita_agendada") return `Nova visita agendada para ${fmtDate(n.visitaData)} — ${n.cliente || ""}`;
    if (n.tipo === "atendimento_atribuido") return `${n.visitaTipo ? (TIPO_REL[n.visitaTipo]?.nome || "Atendimento") : "Atendimento"} atribuído a você, com rascunho já iniciado — ${fmtDate(n.visitaData)} · ${n.cliente || ""}`;
    return n.tipo;
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-lg hover:bg-gray-100" title="Notificações"
              aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : "Notificações"} aria-expanded={open}>
        <Bell size={18} style={{ color: C.gray }} aria-hidden="true" />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: C.nok }}>
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute ${alinharDireita ? "right-0" : "left-0 sm:left-auto sm:right-0"} mt-2 w-80 max-w-[calc(100vw-24px)] max-h-96 overflow-y-auto bg-white border rounded-xl shadow-xl z-50`} style={{ borderColor: C.border }}>
            <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-white" style={{ borderColor: C.border }}>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.gray }}>Notificações</span>
              {naoLidas > 0 && <button onClick={onMarkAllRead} className="text-[11px] font-bold" style={{ color: C.orangeDark }}>Marcar todas como lidas</button>}
            </div>
            {notificacoes.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: C.grayMid }}>Nenhuma notificação por aqui.</div>
            ) : (
              notificacoes.slice(0, 30).map(n => {
                const Icon = ICONS[n.tipo] || Bell;
                return (
                  <button key={n.id} onClick={() => { onOpenNotificacao(n); setOpen(false); }}
                          className="w-full text-left p-3 border-b flex items-start gap-2.5 hover:bg-gray-50" style={{ borderColor: C.border, background: n.lida ? C.white : C.orangeLight }}>
                    <Icon size={15} style={{ color: CORES[n.tipo] || C.gray, marginTop: 2, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs" style={{ color: C.gray, fontWeight: n.lida ? 400 : 700 }}>{texto(n)}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: C.grayMid }}>{fmtDateTime(n.criadoEm)}</div>
                    </div>
                    {!n.lida && <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: C.orange }} />}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// situação da aprovação do relatório: o mesmo texto na tela (ApprovalBadge) e na exportação para o Excel
const APROVACAO_STATUS = {
  pendente:  { label: "Pendente aprovação",    bg: C.amberLight, fg: C.amber },
  devolvido: { label: "Devolvido p/ correção", bg: C.nokLight,   fg: C.nok },
  aprovado:  { label: "Aprovado",              bg: C.okLight,    fg: C.ok },
};
function aprovacaoInfo(rel) { const st = getRelApprovalStatus(rel); return APROVACAO_STATUS[st] || { label: String(st || "—"), bg: C.grayLight, fg: C.gray }; }
function ApprovalBadge({ rel }) {
  const info = aprovacaoInfo(rel);
  return <Pill bg={info.bg} fg={info.fg}>{info.label}</Pill>;
}

// Tela do técnico: só os atendimentos que são dele, separados em "precisa
// agir agora" (devolvidos para correção, atrasados) e "próximos" (agendados
// no futuro). Usa o vínculo usuário→técnico (Usuários) para saber quais são
// "meus" atendimentos.
// Tela de atendimentos pendentes e futuros. Para o técnico, mostra os dele
// automaticamente (via vínculo usuário→técnico). Para quem gerencia (Admin,
// Gestor, Coordenador, Supervisor), mostra um seletor para escolher de qual
// técnico ver — ou "Todos", numa lista combinada com o nome de cada um.
function MeusAtendimentosView({ visitas, contratos, tecnicos, tecnicoId, souGestor, onDespacho, onItm, onDocumento }) {
  const hoje = hojeLocal();
  const [filtroTecnico, setFiltroTecnico] = useState(() => souGestor ? "todos" : String(tecnicoId || ""));

  const tecnicoIdEfetivo = souGestor
    ? (filtroTecnico === "todos" ? null : parseInt(filtroTecnico))
    : tecnicoId;
  const modoTodos = souGestor && filtroTecnico === "todos";

  const minhas = useMemo(() => {
    if (!modoTodos && !tecnicoIdEfetivo) return [];
    return visitas
      .filter(v => modoTodos ? !!v.tecnicoId : (v.tecnicoId != null && String(v.tecnicoId) === String(tecnicoIdEfetivo)))
      .map(v => {
        const c = contratos.find(x => x.id === v.contratoId);
        const tec = tecnicos.find(t => t.id === v.tecnicoId);
        const approval = v.relatorio ? getRelApprovalStatus(v.relatorio) : null;
        const status = v.relatorio
          ? (approval === "pendente" ? "pendente_aprovacao" : approval === "devolvido" ? "devolvida" : "concluida")
          : v.despacho ? "despachada" : v.status;
        return { ...v, _cliente: c?.cliente || (v.avulsa ? "Atendimento avulso" : "Contrato"), _tecnicoNome: tec?.nome || "—", _status: status };
      })
      .filter(v => v._status !== "concluida");
  }, [visitas, contratos, tecnicos, tecnicoIdEfetivo, modoTodos]);

  const devolvidos = minhas.filter(v => v._status === "devolvida");
  const aguardandoAprovacao = minhas.filter(v => v._status === "pendente_aprovacao");
  const abertos = minhas
    .filter(v => v._status !== "devolvida" && v._status !== "pendente_aprovacao")
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const atrasados = abertos.filter(v => v.data && v.data < hoje);
  const futuros = abertos.filter(v => !v.data || v.data >= hoje);

  const Seletor = souGestor && (
    <div className="mb-6">
      <div className="field-lbl text-[10px] uppercase font-bold tracking-wide mb-1" style={{ color: C.grayMid }}>Ver atendimentos de</div>
      <select aria-label="Filtrar por técnico" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
        <option value="todos">Todos os técnicos</option>
        {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>
    </div>
  );

  if (!souGestor && !tecnicoId) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-3xl font-black mb-1" style={{ color: C.gray }}>Meus atendimentos</h1>
        <p className="text-sm mb-6" style={{ color: C.grayMid }}>Seus atendimentos pendentes e futuros.</p>
        <div className="p-6 border rounded-xl text-sm" style={{ borderColor: C.border, color: C.grayMid }}>
          Seu usuário ainda não está vinculado a um cadastro de técnico. Peça ao administrador para vincular, no LS Pricer em <b>Configurações → Usuários e acessos</b> — assim esta tela (e os avisos do sino) passam a mostrar exatamente os seus atendimentos.
        </div>
      </div>
    );
  }

  const Row = ({ v, obs }) => (
    <div className="p-4 flex items-center gap-4 flex-wrap border-b last:border-0" style={{ borderColor: C.border }}>
      <div className="text-center" style={{ width: 56 }}>
        <div className="text-[10px] font-bold uppercase" style={{ color: C.orangeDark }}>{v.data ? fmtMonth(v.data) : "—"}</div>
        <div className="text-2xl font-black font-display">{v.data ? new Date(v.data + "T00:00:00").getDate() : "—"}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm" style={{ color: C.gray }}>{v.referencia && <span style={{ color: C.orangeDark }}>{v.referencia} | </span>}{v._cliente}</div>
        <div className="text-xs flex gap-2 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
          <TipoBadge tipo={v.tipo} />
          {modoTodos && <span className="flex items-center gap-1 font-bold" style={{ color: C.blue }}><User size={11} /> {v._tecnicoNome}</span>}
          {obs && <span className="italic">{obs}</span>}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap justify-end">
        <button onClick={() => onDocumento(v)} className="px-3 py-1.5 text-xs font-bold rounded-lg border" style={{ borderColor: C.border, color: C.gray }}>Doc. Interno</button>
        {v._status === "devolvida" ? (
          <button onClick={() => onItm(v)} className="px-3 py-1.5 text-xs font-bold rounded-lg text-white" style={{ background: C.nok }}>Corrigir</button>
        ) : v.despacho || v.avulsa ? (
          <button onClick={() => onItm(v)} className="px-3 py-1.5 text-xs font-bold rounded-lg text-white" style={{ background: v.rascunhoItm ? "#B45309" : C.orangeFill }}>{v.rascunhoItm ? "Continuar" : "Iniciar"}</button>
        ) : (
          <button onClick={() => onDespacho(v)} className="px-3 py-1.5 text-xs font-bold rounded-lg border" style={{ borderColor: C.amber, color: C.amber }}>Fazer despacho</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl font-black mb-1" style={{ color: C.gray }}>{souGestor ? "Atendimentos por técnico" : "Meus atendimentos"}</h1>
      <p className="text-sm mb-6" style={{ color: C.grayMid }}>{souGestor ? "Acompanhe o que está pendente e agendado, por técnico." : "Seus atendimentos pendentes e futuros."}</p>
      {Seletor}

      {devolvidos.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.nok }}>Devolvidos — precisam de correção ({devolvidos.length})</div>
          <div className="border rounded-xl mb-8" style={{ borderColor: C.border }}>
            {devolvidos.map(v => <Row key={v.id} v={v} obs={v.relatorio?.aprovacao?.motivo ? `Motivo: ${v.relatorio.aprovacao.motivo}` : null} />)}
          </div>
        </>
      )}

      {atrasados.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.nok }}>Atrasados ({atrasados.length})</div>
          <div className="border rounded-xl mb-8" style={{ borderColor: C.border }}>
            {atrasados.map(v => <Row key={v.id} v={v} />)}
          </div>
        </>
      )}

      <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.orangeDark }}>Próximos atendimentos ({futuros.length})</div>
      {futuros.length === 0 ? (
        <div className="p-6 text-center text-sm border rounded-xl mb-8" style={{ borderColor: C.border, color: C.grayMid }}>Nenhum atendimento futuro agendado.</div>
      ) : (
        <div className="border rounded-xl mb-8" style={{ borderColor: C.border }}>
          {futuros.map(v => <Row key={v.id} v={v} />)}
        </div>
      )}

      {aguardandoAprovacao.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.amber }}>Aguardando aprovação ({aguardandoAprovacao.length})</div>
          <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
            {aguardandoAprovacao.map(v => (
              <div key={v.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="font-bold text-sm" style={{ color: C.gray }}>{v.referencia && <span style={{ color: C.orangeDark }}>{v.referencia} | </span>}{v._cliente}</div>
                <Pill bg={C.amberLight} fg={C.amber}>Aguardando aprovação</Pill>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VisitasTecnicas({ visitas, relatorios, contratos, tecnicos, onDespacho, onItm, onDocumento, onViewRel, onDeleteVisita }) {
  const { sessao } = useAuth();
  const podeExcluir = isAdminProfile(sessao?.perfil);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterOrigem, setFilterOrigem] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");

  const items = useMemo(() => {
    const visitItems = visitas.map(v => {
      const c = contratos.find(x => x.id === v.contratoId);
      const tec = tecnicos.find(t => t.id === v.tecnicoId);
      const approval = v.relatorio ? getRelApprovalStatus(v.relatorio) : null;
      const status = v.relatorio
        ? approval === "pendente" ? "pendente_aprovacao" : approval === "devolvido" ? "devolvida" : "concluida"
        : v.despacho ? "despachada" : v.status;
      return {
        id: `visita-${v.id}`,
        kind: "visita",
        origem: v.avulsa ? "avulsa" : "contrato",
        data: v.data,
        tipo: v.tipo,
        referencia: v.referencia || v.codigoAtendimento || null,

        cliente: c?.cliente || "Visita avulsa",
        tecnico: tec?.nome || "—",
        status,
        visita: v,
        relatorio: v.relatorio,
        demanda: v.despacho?.demanda || v.demanda || "",
      };
    });

    // "Avulso de verdade": relatório sem nenhuma visita representando-o. Reports
    // avulsos gerados após a correção de reabertura já têm sua própria visita
    // mantida (kind:"visita" no bloco acima) — sem esse filtro, apareceriam
    // duas vezes na lista.
    const relAvulsos = relatorios
      .filter(r => !r.visitaId && !visitas.some(v => v.relatorio?.id === r.id))
      .map(r => ({
        id: `rel-${r.id}`,
        kind: "relatorio",
        origem: "avulsa",
        data: r.dataEmissao,
        tipo: r.tipo,
        referencia: r.referencia || r.codigoAtendimento || r.numero || null,

        cliente: r.cliente || "Relatório avulso",
        tecnico: r.identificacao?.inspetor || "—",
        status: getRelApprovalStatus(r) === "pendente" ? "pendente_aprovacao" : getRelApprovalStatus(r) === "devolvido" ? "devolvida" : "concluida",
        relatorio: r,
        demanda: r.identificacao?.demanda || "",
      }));

    return [...visitItems, ...relAvulsos].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [visitas, relatorios, contratos, tecnicos]);

  const filtered = items.filter(i =>
    (filterTipo === "todos" || i.tipo === filterTipo) &&
    (filterOrigem === "todos" || i.origem === filterOrigem) &&
    (filterStatus === "todos" || i.status === filterStatus)
  );

  const statusLabel = {
    agendada: "Agendada",
    rascunho: "Rascunho",
    despachada: "Despachada",
    pendente_aprovacao: "Aguardando aprovação",
    devolvida: "Devolvida p/ correção",
    concluida: "Concluída",
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black" style={{ color: C.gray }}>Visitas técnicas</h1>
          <p className="text-sm mt-1" style={{ color: C.grayMid }}>Atendimentos de contrato e avulsos, com filtros por tipo, origem e status.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select aria-label="Filtrar por tipo" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os tipos</option>
            {Object.values(TIPO_REL).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select aria-label="Filtrar por origem" value={filterOrigem} onChange={e => setFilterOrigem(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todas as origens</option>
            <option value="contrato">Contrato</option>
            <option value="avulsa">Avulsa</option>
          </select>
          <select aria-label="Filtrar por situação" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os status</option>
            {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
        {filtered.length === 0 && <div className="p-10 text-center text-sm" style={{ color: C.grayMid }}>Nenhuma visita técnica encontrada.</div>}
        {filtered.map(item => (
          <div key={item.id} className="p-4 flex items-center gap-4 flex-wrap">
            <div className="text-center" style={{ width: 56 }}>
              <div className="text-[10px] font-bold uppercase" style={{ color: C.orangeDark }}>{fmtMonth(item.data)}</div>
              <div className="text-2xl font-black">{item.data ? new Date(item.data + "T00:00:00").getDate() : "—"}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm" style={{ color: C.gray }}>{item.referencia && <span style={{ color: C.orangeDark }}>{item.referencia} | </span>}{item.cliente}</div>
              <div className="text-xs flex gap-2 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
                <TipoBadge tipo={item.tipo} />
                <Pill bg={item.origem === "avulsa" ? C.purpleLight : C.blueLight} fg={item.origem === "avulsa" ? C.purple : C.blue}>
                  {item.origem === "avulsa" ? "Avulsa" : "Contrato"}
                </Pill>
                <Pill bg={item.status === "concluida" ? C.okLight : item.status === "pendente_aprovacao" ? C.amberLight : item.status === "devolvida" ? C.nokLight : C.grayLight}
                      fg={item.status === "concluida" ? C.ok : item.status === "pendente_aprovacao" ? C.amber : item.status === "devolvida" ? C.nok : C.gray}>
                  {statusLabel[item.status] || item.status}
                </Pill>
                <span><User size={11} className="inline mr-1" />{item.tecnico}</span>
              </div>
              {item.demanda && <div className="text-xs mt-2 line-clamp-2" style={{ color: C.gray }}>{item.demanda}</div>}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {item.kind === "visita" && (
                <>
                  <button onClick={() => onDocumento(item.visita)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border" style={{ borderColor: C.border, color: C.gray }}>
                    Doc. Interno
                  </button>
                  <button onClick={() => onDespacho(item.visita)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border" style={{ borderColor: C.border, color: C.gray }}>
                    Despacho
                  </button>
                  {(!item.relatorio || item.status === "devolvida") && (
                    <button onClick={() => onItm(item.visita)} disabled={!item.visita.despacho && !item.visita.avulsa}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg text-white disabled:opacity-40" style={{ background: item.status === "devolvida" ? C.nok : item.visita.rascunhoItm ? "#B45309" : C.orangeFill }}>
                      {item.status === "devolvida" ? "Corrigir" : item.visita.rascunhoItm ? "Continuar" : "Iniciar"}
                    </button>
                  )}
                </>
              )}
              {podeExcluir && item.kind === "visita" && (
                <button onClick={() => { if (confirm(`Excluir atendimento ${item.referencia || item.codigoAtendimento || item.cliente}?`)) onDeleteVisita?.(item.visita.id); }}
                        className="px-3 py-1.5 rounded text-xs font-bold border flex items-center gap-1" style={{ borderColor: C.border, color: C.nok }}>
                  <Trash2 size={12} /> Apagar
                </button>
              )}
              {item.relatorio && (
                <button onClick={() => onViewRel(item.relatorio)}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
                  <Eye size={12} /> Relatório
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentoInternoAtendimento({ visita, contrato, tecnico }) {
  const despacho = visita?.despacho || {};
  const checklist = getDespachoChecklist(despacho);
  const checklistRows = Object.entries(checklist).filter(([, v]) => v && typeof v === "object" && v.status);
  const anexos = getVisitaAnexos(visita);
  const demanda = despacho.demanda || visita?.demanda || "";
  const orientacoes = despacho.orientacoes || "";
  const handlePrint = () => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const cleanup = () => document.body.classList.remove("printing-documento-interno");
    document.body.classList.add("printing-documento-interno");
    window.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(() => {
      try { window.print(); } finally { setTimeout(cleanup, 1200); }
    }, 50);
  };

  return (
    <div>
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={handlePrint} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orangeFill }}>
          <Printer size={14} /> Imprimir documento interno
        </button>
      </div>
      <div className="bg-white mx-auto border p-8 documento-interno-print" data-documento-interno style={{ borderColor: C.border, maxWidth: 900, color: C.gray, fontFamily: "var(--font-body)" }}>
        <div className="flex items-start justify-between border-b pb-4 mb-5" style={{ borderColor: C.border }}>
          <div>
            <LogoLSFire size={42} />
            <h1 className="text-2xl font-black mt-4" style={{ color: C.gray }}>Documento interno de atendimento</h1>
            <div className="text-sm" style={{ color: C.grayMid }}>Orientações e anexos para execução em campo</div>
          </div>
          <TipoBadge tipo={visita?.tipo} size="lg" />
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-5 text-sm">
          <div><strong>Cliente:</strong> {contrato?.cliente || "Atendimento avulso"}</div>
          <div><strong>Data:</strong> {fmtDate(visita?.data)}</div>
          <div><strong>Técnico:</strong> {tecnico?.nome || "—"}</div>
          <div><strong>Status:</strong> {visita?.despacho ? "Despachado" : "Agendado"}</div>
        </div>

        <ReportSubTitle>Demanda</ReportSubTitle>
        <p style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", border: "1px solid #BFBFBF", padding: 10 }}>{demanda || "—"}</p>

        <ReportSubTitle>Orientações internas</ReportSubTitle>
        <p style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", border: "1px solid #BFBFBF", padding: 10 }}>{orientacoes || "—"}</p>

        {visita?.tipo === "startup" && (
          <>
            <ReportSubTitle>Itens obrigatórios para Start-up</ReportSubTitle>
            <ul className="text-sm list-disc pl-5 space-y-1">
              <li>Check-list preenchido pelo cliente anexado antes do despacho.</li>
              <li>Curva da bomba anexada ou indicada para conferência em campo.</li>
              <li>Folhas de dados de bomba, motor, painel e acessórios anexadas quando disponíveis.</li>
            </ul>
          </>
        )}

        <ReportSubTitle>Anexos</ReportSubTitle>
        <AttachmentDocumentList anexos={anexos} empty="Nenhum anexo disponível para este atendimento." />

        {checklistRows.length > 0 && (
          <>
            <ReportSubTitle>Checklist de despacho</ReportSubTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <tbody>
                {checklistRows.map(([item, v]) => (
                  <tr key={item}>
                    <td style={{ border: "1px solid #BFBFBF", padding: "5px 6px", width: "60%" }}>{item}</td>
                    <td style={{ border: "1px solid #BFBFBF", padding: "5px 6px", fontWeight: 700 }}>{v.status?.toUpperCase()}</td>
                    <td style={{ border: "1px solid #BFBFBF", padding: "5px 6px" }}>{v.obs || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function CalendarView({ visitas, contratos, month, onMonthChange, onItm }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDay = first.getDay();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const visByDate = {};
  visitas.forEach(v => {
    if (v.data.startsWith(month)) {
      const d = parseInt(v.data.slice(8, 10));
      if (!visByDate[d]) visByDate[d] = [];
      visByDate[d].push(v);
    }
  });

  const prev = () => {
    const nm = m === 1 ? 12 : m - 1;
    const ny = m === 1 ? y - 1 : y;
    onMonthChange(`${ny}-${String(nm).padStart(2, "0")}`);
  };
  const next = () => {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    onMonthChange(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  return (
    <div className="border rounded-xl p-5" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-2 rounded hover:bg-gray-100" aria-label="Mês anterior" title="Mês anterior"><ChevronLeft size={18} /></button>
        <div className="font-bold text-lg capitalize" style={{ color: C.gray }}>
          {new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
        <button onClick={next} className="p-2 rounded hover:bg-gray-100" aria-label="Próximo mês" title="Próximo mês"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase py-1" style={{ color: C.grayMid }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className="border rounded-lg min-h-[80px] p-1.5"
               style={{ borderColor: d ? C.border : "transparent", background: d ? C.white : "transparent" }}>
            {d && (
              <>
                <div className="text-xs font-bold mb-1" style={{ color: C.gray }}>{d}</div>
                {(visByDate[d] || []).map(v => {
                  const c = contratos.find(x => x.id === v.contratoId);
                  const cfg = TIPO_REL[v.tipo];
                  return (
                    <button key={v.id} onClick={() => onItm(v)}
                            className="w-full text-left text-[10px] px-1.5 py-1 rounded mb-0.5 truncate"
                            style={{ background: cfg?.bg, color: cfg?.color }}>
                      {v.referencia ? v.referencia + " | " : ""}{c?.cliente || "Avulsa"}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TÉCNICOS — CRUD
// ═══════════════════════════════════════════════════════════════════════════
function TecnicosView({ tecnicos, visitas, onNew, onEdit, onDelete }) {
  const { sessao } = useAuth();
  const podeExcluir = isAdminProfile(sessao?.perfil);
  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: C.gray }}>Técnicos</h1>
        <button onClick={onNew} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orangeFill }}>
          <Plus size={16} /> Novo técnico
        </button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tecnicos.map(t => {
          const ag = visitas.filter(v => v.tecnicoId === t.id && v.status === "agendada").length;
          const co = visitas.filter(v => v.tecnicoId === t.id && v.status === "concluida").length;
          const totalVinculos = visitas.filter(v => v.tecnicoId === t.id).length;
          return (
            <div key={t.id} className="border rounded-xl p-5 relative" style={{ borderColor: C.border }}>
              <div className="absolute top-2 right-2 flex gap-1">
                <button onClick={() => onEdit(t)} aria-label="Editar técnico" title="Editar" className="p-1.5 rounded hover:bg-gray-100"><Pencil size={14} /></button>
                {podeExcluir && (
                  <button onClick={() => {
                    const aviso = totalVinculos > 0
                      ? `O técnico "${t.nome}" tem ${totalVinculos} atendimento(s) vinculado(s) (agendados e/ou já concluídos). Excluindo o técnico, os relatórios já feitos perdem a atribuição de quem realizou o serviço. Deseja continuar mesmo assim?`
                      : `Excluir o técnico "${t.nome}"?`;
                    if (confirm(aviso)) onDelete(t.id);
                  }} aria-label="Excluir técnico" title="Excluir" className="p-1.5 rounded hover:bg-gray-100"><Trash2 size={14} style={{ color: C.nok }} /></button>
                )}
              </div>
              <div className="text-center pb-3 border-b" style={{ borderColor: C.border }}>
                <div className="flex justify-center"><Avatar tec={t} size={56} /></div>
                <div className="font-bold mt-3" style={{ color: C.gray }}>{t.nome}</div>
                <div className="text-xs" style={{ color: C.grayMid }}>{t.cargo}</div>
              </div>
              <div className="space-y-1 text-xs my-3" style={{ color: C.grayMid }}>
                {t.telefone && <div className="flex items-center gap-1.5"><Phone size={11} /> {t.telefone}</div>}
                {t.email && <div className="flex items-center gap-1.5"><MessageSquare size={11} /> {t.email}</div>}
                {t.licenca && <div className="flex items-center gap-1.5"><PenLine size={11} /> {t.licenca}</div>}
                {t.cidade && <div className="flex items-center gap-1.5"><MapPin size={11} /> Base: {t.cidade}{t.uf ? "/" + t.uf : ""}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="border rounded-lg p-2" style={{ borderColor: C.border }}>
                  <div className="text-lg font-black font-display" style={{ color: C.orangeDark }}>{ag}</div>
                  <div className="text-[10px] uppercase font-bold" style={{ color: C.grayMid }}>Agendadas</div>
                </div>
                <div className="border rounded-lg p-2" style={{ borderColor: C.border }}>
                  <div className="text-lg font-black font-display" style={{ color: C.ok }}>{co}</div>
                  <div className="text-[10px] uppercase font-bold" style={{ color: C.grayMid }}>Concluídas</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {tecnicos.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center" style={{ borderColor: C.border }}>
          <Users size={48} className="mx-auto mb-3" style={{ color: C.grayMid }} />
          <div className="text-base font-bold mb-1" style={{ color: C.gray }}>Nenhum técnico cadastrado</div>
        </div>
      )}
    </div>
  );
}

function TecnicoForm({ initial, onSave }) {
  const [data, setData] = useState({ nome: "", cargo: "", telefone: "", email: "", licenca: "", cidade: "", uf: "", ...initial });
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <Field label="Nome completo"><input value={data.nome} onChange={e => upd("nome", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Cargo"><input value={data.cargo} onChange={e => upd("cargo", e.target.value)} placeholder="Técnico Sênior / Pleno / Júnior" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Licença / registro"><input value={data.licenca} onChange={e => upd("licenca", e.target.value)} placeholder="CREA-XX 0000000" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Telefone"><input value={data.telefone} onChange={e => upd("telefone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="E-mail"><input type="email" value={data.email} onChange={e => upd("email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Cidade base" hint="Onde o técnico fica alocado: é de lá que sai o deslocamento até o cliente.">
          <input value={data.cidade} onChange={e => upd("cidade", e.target.value)} placeholder="Ex.: Joinville" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="UF da base">
          <select value={data.uf} onChange={e => upd("uf", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }}>
            <option value="">—</option>
            {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(u => <option key={u} value={u}>{u}</option>)}
          </select></Field>
      </div>
      <div className="flex justify-end pt-4 border-t" style={{ borderColor: C.border }}>
        <button onClick={() => onSave(data)} disabled={!data.nome}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2"
                style={{ background: C.orangeFill }}>
          <Save size={14} /> Salvar técnico
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RELATÓRIOS — Categorizados por tipo (abas)
// ═══════════════════════════════════════════════════════════════════════════
// Fila de aprovações: só os relatórios que precisam de atenção do aprovador
// (pendentes) e, para contexto, os que foram devolvidos e ainda não voltaram.
function AprovacoesView({ relatorios, onView }) {
  const pendentes = relatorios.filter(r => getRelApprovalStatus(r) === "pendente");
  const devolvidos = relatorios.filter(r => getRelApprovalStatus(r) === "devolvido");
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Aprovações</h1>
        <p className="text-sm mt-1" style={{ color: C.grayMid }}>Relatórios aguardando sua análise.</p>
      </div>

      <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.orangeDark }}>Aguardando aprovação ({pendentes.length})</div>
      {pendentes.length === 0 ? (
        <div className="p-6 text-center text-sm border rounded-xl mb-8" style={{ borderColor: C.border, color: C.grayMid }}>Nada pendente por aqui.</div>
      ) : (
        <div className="border rounded-xl divide-y mb-8" style={{ borderColor: C.border }}>
          {pendentes.map(r => (
            <div key={r.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm" style={{ color: C.gray }}>{tituloRelatorio(r)}</div>
                <div className="text-xs flex gap-3 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
                  <TipoBadge tipo={r.tipo} />
                  <span><Calendar size={11} className="inline mr-1" />{fmtDate(r.dataEmissao)}</span>
                </div>
              </div>
              <button onClick={() => onView(r)} className="px-3 py-1.5 text-xs font-bold rounded-lg text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
                <Eye size={12} /> Analisar
              </button>
            </div>
          ))}
        </div>
      )}

      {devolvidos.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.nok }}>Devolvidos, aguardando o técnico corrigir ({devolvidos.length})</div>
          <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
            {devolvidos.map(r => (
              <div key={r.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{ color: C.gray }}>{tituloRelatorio(r)}</div>
                  <div className="text-xs mt-1" style={{ color: C.grayMid }}>Motivo: {r.aprovacao?.motivo || "—"}</div>
                </div>
                <button onClick={() => onView(r)} className="px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1" style={{ borderColor: C.border, color: C.gray }}>
                  <Eye size={12} /> Ver
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Relatorios({ relatorios, contratos, onView, onDelete }) {
  const { sessao } = useAuth();
  const podeExcluir = isAdminProfile(sessao?.perfil);
  const [filterTipo, setFilterTipo] = useState("todos");
  const counts = useMemo(() => {
    const c = { todos: relatorios.length };
    Object.keys(TIPO_REL).forEach(k => { c[k] = relatorios.filter(r => r.tipo === k).length; });
    return c;
  }, [relatorios]);

  const filtered = filterTipo === "todos" ? relatorios : relatorios.filter(r => r.tipo === filterTipo);

  const exportarExcel = () => {
    const headers = ["Número", "Código", "Cliente", "Tipo", "Aprovação", "Conformidade (%)", "Data Emissão", "OS", "Revisão", "Técnico/Inspetor"];
    const linhas = filtered.map(r => [
      r.referencia || r.codigoAtendimento || r.numero || "",
      r.codigo || "",
      r.cliente || "",
      TIPO_REL[r.tipo]?.nome || r.tipo || "",
      aprovacaoInfo(r).label,
      conformidadeNum(r) ?? "",
      fmtDate(r.dataEmissao) || "",
      r.os || "",
      r.identificacao?.revisao || r.revisao || "",
      r.identificacao?.inspetor || r.identificacao?.responsavel || "",
    ]);
    // esc() protege contra fórmulas (",", quebras de linha) e prefixa com um
    // apóstrofo campos que começam com =, +, -, @ ou tab — esses caracteres
    // fariam o Excel/LibreOffice interpretar o valor como fórmula ao abrir o
    // CSV ("injeção de fórmula em CSV"), o que pode expor ou executar código
    // indesejado a partir de um dado digitado (ex.: nome de cliente colado).
    const esc = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t]/.test(s)) s = "'" + s;
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...linhas].map(row => row.map(esc).join(";")).join("\r\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nomeFiltro = filterTipo === "todos" ? "todos" : (TIPO_REL[filterTipo]?.nome || filterTipo).replace(/[^\w]+/g, "-");
      a.href = url;
      a.download = `relatorios-lsfire-${nomeFiltro}-${hojeLocal()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert("Não foi possível gerar o arquivo neste ambiente."); }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Relatórios</h1>
        <button onClick={exportarExcel} disabled={filtered.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border disabled:opacity-40"
                style={{ borderColor: C.orange, color: C.orangeDark, background: C.white }}
                title="Exporta os relatórios do filtro atual para um arquivo que abre no Excel">
          <FileText size={15} /> Exportar Excel ({filtered.length})
        </button>
      </div>

      {/* Abas por tipo */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <TabPill label={`Todos (${counts.todos})`} active={filterTipo === "todos"} onClick={() => setFilterTipo("todos")} color={C.gray} bg={C.grayLight} />
        {Object.values(TIPO_REL).map(t => (
          <TabPill key={t.id} label={`${t.nome} (${counts[t.id]})`} Icon={t.Icon} active={filterTipo === t.id} onClick={() => setFilterTipo(t.id)} color={t.color} bg={t.bg} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center" style={{ borderColor: C.border }}>
          <FileText size={48} className="mx-auto mb-3" style={{ color: C.grayMid }} />
          <div className="text-base font-bold mb-1" style={{ color: C.gray }}>Nenhum relatório nessa categoria</div>
          <div className="text-sm" style={{ color: C.grayMid }}>Finalize uma visita para gerar o primeiro relatório.</div>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
          {filtered.map(r => (
            <div key={r.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm" style={{ color: C.gray }}>{tituloRelatorio(r)}</div>
                <div className="text-xs flex gap-3 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
                  <TipoBadge tipo={r.tipo} />
                  <ApprovalBadge rel={r} />
                  <VisitaFreqsPills visita={r} />
                  <span><Calendar size={11} className="inline mr-1" />{fmtDate(r.dataEmissao)}</span>
                  {r.os && <span>OS Nº {r.os}</span>}
                </div>
              </div>
              {conformidadeNum(r) != null && (() => { const cf = conformidadeNum(r); return (
              <Pill bg={cf >= 90 ? C.okLight : cf >= 60 ? C.amberLight : C.nokLight}
                    fg={cf >= 90 ? C.ok : cf >= 60 ? C.amber : C.nok}>
                {cf}% conforme
              </Pill>
              ); })()}
              {podeExcluir && (
                <button onClick={() => { if (confirm(`Excluir relatório ${r.codigo || r.referencia}?`)) onDelete?.(r.id); }} className="px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 border" style={{ borderColor: C.border, color: C.nok }}>
                  <Trash2 size={12} /> Apagar
                </button>
              )}
              <button onClick={() => onView(r)} className="px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 text-white" style={{ background: C.orangeFill }}>
                <Eye size={12} /> Visualizar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// botão marcado: fundo na cor do status e texto na cor do cartão (claro no tema claro, escuro no escuro);
// o laranja usa o tom mais fechado para o texto branco ficar legível
const corMarcada = (c) => (c === C.orange ? [C.orangeFill, "#fff"] : [c, C.white]);

function TabPill({ label, Icon, active, onClick, color, bg }) {
  const [fundo, texto] = corMarcada(color);
  return (
    <button onClick={onClick}
            className="px-3 py-1.5 rounded-full text-xs font-bold border transition flex items-center gap-1.5"
            style={{
              background: active ? fundo : bg,
              color: active ? texto : color,
              borderColor: active ? fundo : "transparent"
            }}>
      {Icon && <Icon size={12} />} {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW VISIT FORM — agora pede TIPO (ITM/Inspeção/Preventiva/Corretiva)
// ═══════════════════════════════════════════════════════════════════════════
function NewVisitForm({ contratos, tecnicos, initial, onCreate }) {
  const contratoFixo = initial?.contratoIdFixo;
  const avulsa = !!initial?.avulsa;
  // atendimento avulso não tem contrato: nada de herdar o primeiro da lista
  const [contratoId, setContratoId] = useState(avulsa ? null : (contratoFixo || contratos[0]?.id || ""));
  const [tipo, setTipo] = useState("itm");
  const [data, setData] = useState(initial?.data || hojeLocal());
  const [demanda, setDemanda] = useState("");
  const [anexos, setAnexos] = useState([]);
  // técnico da visita: quem agenda sendo técnico fica como executante; senão o técnico do contrato
  const { sessao } = useAuth();
  const meu = meuTecnico(sessao, tecnicos);
  const tecPadrao = (c) => (sessao?.perfil === "tecnico" && meu ? meu.id : (c?.tecnicoId || meu?.id || tecnicos[0]?.id || ""));
  const [tecnicoId, setTecnicoId] = useState(() => tecPadrao(avulsa ? null : contratos.find(x => x.id === (contratoFixo || contratos[0]?.id))));

  useEffect(() => {
    const c = contratos.find(x => x.id === contratoId);
    if (c) setTecnicoId(tecPadrao(c));
  }, [contratoId]);

  const ehItm = tipo === "itm";
  const isStartup = tipo === "startup";
  const contratoSel = avulsa ? null : contratos.find(c => c.id === contratoId);
  const checklistClienteOk = !isStartup || hasStartupClientChecklist(anexos);

  // Frequências previstas calculadas automaticamente pelo mês do contrato
  const freqsPrevistas = useMemo(() => {
    if (!ehItm) return [];
    if (initial?.avulsa || !contratoSel) {
      // Visita avulsa — sem cronograma, técnico ajusta depois no despacho
      return ["Semanal", "Mensal"];
    }
    return getFreqsPrevistasParaVisita(contratoSel, data);
  }, [ehItm, contratoSel, data, initial?.avulsa]);

  const mesContrato = contratoSel && ehItm && !initial?.avulsa
    ? mesDoContrato(contratoSel.dataInicio, data)
    : null;
  const duracao = contratoSel ? getDuracaoMeses(contratoSel) : 0;
  const foraPeriodo = mesContrato && duracao && mesContrato > duracao;
  const podeSalvar = !foraPeriodo && checklistClienteOk;
  const addAnexos = (novos) => setAnexos(arr => [...arr, ...novos]);
  const removeAnexo = (id) => setAnexos(arr => arr.filter(a => a.id !== id));
  const [gerandoNumero, setGerandoNumero] = useState(false);
  const payload = async () => {
    const { numero, provisorio } = await gerarReferenciaAtendimento();
    return ({
    referencia: numero, codigoAtendimento: numero, referenciaProvisoria: provisorio,
    contratoId: avulsa ? null : contratoId, tipo, data, demanda, anexos,
    documentoInternoCriadoEm: new Date().toISOString(),
    freq:  ehItm ? freqsPrevistas[0] : null,
    freqs: ehItm ? freqsPrevistas : null,
    tecnicoId
  });
  };
  const criar = async (action) => {
    setGerandoNumero(true);
    const p = await payload();
    setGerandoNumero(false);
    onCreate(p, action);
  };

  return (
    <div className="space-y-4">
      <Field label="Tipo de visita">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.values(TIPO_REL).map(t => {
            const Icon = t.Icon;
            const active = tipo === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                      className="border rounded-lg p-3 text-left transition"
                      style={{ borderColor: active ? t.color : C.border, background: active ? t.bg : "transparent" }}>
                <Icon size={16} style={{ color: t.color }} />
                <div className="font-bold text-xs mt-1" style={{ color: active ? t.color : C.gray }}>{t.nome}</div>
              </button>
            );
          })}
        </div>
      </Field>

      {!initial?.avulsa && (
        <Field label="Contrato">
          <select value={contratoId} onChange={e => setContratoId(parseInt(e.target.value))} disabled={!!contratoFixo}
                  className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" style={{ borderColor: C.border }}>
            {contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Técnico">
          <select value={tecnicoId} onChange={e => setTecnicoId(parseInt(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }}>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}{meu && t.id === meu.id ? " (você)" : ""}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Demanda / orientação do atendimento">
        <textarea value={demanda} onChange={e => setDemanda(e.target.value)} rows={4}
                  placeholder="Descreva o motivo da visita, escopo combinado, sintomas informados pelo cliente e cuidados para o técnico."
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-y" style={{ borderColor: C.border }} />
      </Field>

      <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: isStartup && !checklistClienteOk ? C.nok : C.border }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-bold" style={{ color: C.gray }}>Anexos do atendimento</div>
            <div className="text-[11px]" style={{ color: C.grayMid }}>E-mails, documentos, curvas, folhas de dados e orientações que devem ir junto com o técnico.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <AttachmentInput label="E-mail / Documento" categoria="E-mail ou documento da demanda" onAdd={addAnexos} />
            <AttachmentInput label="Curva / folha de dados" categoria="Curva ou folha de dados" onAdd={addAnexos} />
            {isStartup && (
              <AttachmentInput label="Checklist cliente" categoria="Checklist preenchido pelo cliente" onAdd={addAnexos} required />
            )}
          </div>
        </div>
        {isStartup && !checklistClienteOk && (
          <div className="text-xs flex items-center gap-2 p-2 rounded" style={{ background: C.nokLight, color: C.nok }}>
            <AlertTriangle size={14} /> Para start-up, anexe obrigatoriamente o check-list preenchido pelo cliente.
          </div>
        )}
        <AttachmentList anexos={anexos} onRemove={removeAnexo} empty="Nenhum anexo incluído neste atendimento." />
      </div>

      {ehItm && contratoSel && !initial?.avulsa && (
        <div className="border rounded-lg p-3" style={{ borderColor: foraPeriodo ? C.nok : C.border, background: foraPeriodo ? C.nokLight : C.orangeLight }}>
          {foraPeriodo ? (
            <div className="text-xs flex items-center gap-2" style={{ color: C.nok }}>
              <AlertTriangle size={14} />
              <span>A data escolhida está fora do período contratado (contrato termina no mês {duracao}).</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.orangeDark }}>
                  Inspeções previstas — Mês {mesContrato} de {duracao}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {freqsPrevistas.map(f => (
                  <Pill key={f} bg={FREQ_COLOR[f]?.bg} fg={FREQ_COLOR[f]?.fg}>{f}</Pill>
                ))}
              </div>
              <div className="text-[10px] mt-2" style={{ color: C.grayMid }}>
                Calculado automaticamente pelo cronograma NFPA 25 do contrato. O técnico poderá ajustar no despacho se necessário.
              </div>
            </>
          )}
        </div>
      )}

      <div className="pt-3 flex justify-end gap-2 border-t" style={{ borderColor: C.border }}>
        {initial?.avulsa ? (
          <button onClick={() => criar("iniciar")} disabled={!podeSalvar || gerandoNumero}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2" style={{ background: C.orangeFill }}>
            {gerandoNumero && <RefreshCw size={14} className="animate-spin" />} {gerandoNumero ? "Gerando número…" : "Iniciar relatório"}
          </button>
        ) : (
          <>
            <button onClick={() => criar("agendar")} disabled={!podeSalvar || gerandoNumero}
                    className="px-4 py-2 rounded-lg text-sm font-bold border disabled:opacity-40 flex items-center gap-2"
                    style={{ borderColor: C.border, color: C.gray }}>
              {gerandoNumero && <RefreshCw size={14} className="animate-spin" />} Agendar
            </button>
            <button onClick={() => criar("despachar")} disabled={!podeSalvar || gerandoNumero}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2" style={{ background: C.orangeFill }}>
              {gerandoNumero && <RefreshCw size={14} className="animate-spin" />} {gerandoNumero ? "Gerando número…" : "Agendar / Despachar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DESPACHO FORM
// ═══════════════════════════════════════════════════════════════════════════
function DespachoForm({ visita, contrato, relatoriosContrato = [], initial, onSave }) {
  const isItm = visita?.tipo === "itm";
  const isStartup = visita?.tipo === "startup";
  const initialChecklist = getDespachoChecklist(initial);
  const [demandaDespacho, setDemandaDespacho] = useState(initial?.demanda ?? visita?.demanda ?? "");
  const [orientacoes, setOrientacoes] = useState(initial?.orientacoes || "");
  const [anexosDespacho, setAnexosDespacho] = useState(initial?.anexos || []);

  // Frequências sempre disponíveis (todas as NFPA, técnico decide quais marcar)
  const freqsDisponiveis = isItm ? FREQ_NFPA : [];

  // Última inspeção de cada frequência (a partir dos relatórios anteriores)
  const ultimaPorFreq = useMemo(() => calcularUltimaPorFreq(relatoriosContrato), [relatoriosContrato]);

  // Mês do contrato em que esta visita ocorre
  const mesAtual = useMemo(() => {
    if (!contrato || !visita?.data) return null;
    return mesDoContrato(contrato.dataInicio, visita.data);
  }, [contrato, visita?.data]);

  // Duração do contrato em meses (para detectar visita fora do período)
  const duracao = contrato ? getDuracaoMeses(contrato) : 0;
  const foraPeriodo = mesAtual && duracao && mesAtual > duracao;

  // Frequências previstas pelo cronograma do contrato para este mês
  const freqsPrevistas = useMemo(() => {
    if (!isItm) return [];
    if (!contrato) return getVisitaFreqs(visita); // visita avulsa — usa o que veio
    return getFreqsPrevistasParaVisita(contrato, visita?.data);
  }, [contrato, visita, isItm]);

  // Frequência "base" da visita (a menor do calendário, normalmente Mensal)
  const freqBase = freqsPrevistas[0] || null;

  // Estado: frequências marcadas (começam com as previstas pelo cronograma)
  const [freqsSelecionadas, setFreqsSelecionadas] = useState(() => {
    const jaSelecionadas = getVisitaFreqs(visita);
    if (jaSelecionadas.length > 0) return ordenarFreqs(jaSelecionadas);
    return freqsPrevistas;
  });

  const toggleFreq = (f) => {
    setFreqsSelecionadas(arr => arr.includes(f) ? arr.filter(x => x !== f) : ordenarFreqs([...arr, f]));
  };

  // Calcula dias desde a última de uma frequência
  const diasDesdeUltima = (freq) => {
    const ult = ultimaPorFreq[freq];
    if (!ult?.dataEmissao) return null;
    const dt = new Date(ult.dataEmissao + "T00:00:00");
    const hoje = visita?.data ? new Date(visita.data + "T00:00:00") : new Date();
    return Math.floor((hoje - dt) / (1000 * 60 * 60 * 24));
  };

  // Status de cada frequência (combinando calendário do contrato + última realizada)
  const statusFreq = (freq) => {
    const noCalendario = freqsPrevistas.includes(freq);
    const dias = diasDesdeUltima(freq);
    if (noCalendario) {
      return { label: `Prevista — mês ${mesAtual}`, color: FREQ_COLOR[freq]?.fg, prevista: true };
    }
    if (dias === null) return { label: "Não prevista neste mês", color: C.grayMid, prevista: false };
    const periodo = FREQ_DIAS[freq];
    if (dias > periodo) return { label: `Atrasada ${dias - periodo}d`, color: C.nok, prevista: false, vencida: true };
    return { label: `Próxima em ${periodo - dias}d`, color: C.grayMid, prevista: false };
  };

  // Checklist state
  const [state, setState] = useState(() => {
    if (initialChecklist && Object.keys(initialChecklist).length > 0) {
      const migrado = {};
      Object.entries(initialChecklist).forEach(([k, v]) => {
        if (typeof v === "boolean") migrado[k] = { status: v ? "ok" : "", obs: "" };
        else if (v && typeof v === "object" && "status" in v) migrado[k] = v;
        else migrado[k] = { status: "", obs: "" };
      });
      DESPACHO_GRUPOS.forEach(g => g.items.forEach(it => { if (!migrado[it]) migrado[it] = { status: "", obs: "" }; }));
      return migrado;
    }
    const s = {};
    DESPACHO_GRUPOS.forEach(g => g.items.forEach(it => { s[it] = { status: "", obs: "" }; }));
    return s;
  });

  const setItem = (it, patch) => setState(s => ({ ...s, [it]: { ...(s[it] || { status: "", obs: "" }), ...patch } }));

  const total = Object.keys(state).length;
  const ok   = Object.values(state).filter(v => v.status === "ok").length;
  const nok  = Object.values(state).filter(v => v.status === "nok").length;
  const na   = Object.values(state).filter(v => v.status === "na").length;
  const done = ok + nok + na;
  const pct  = Math.round((done / total) * 100);

  const anexosAtendimento = [...(visita?.anexos || []), ...anexosDespacho];
  const startupChecklistOk = !isStartup || hasStartupClientChecklist(anexosAtendimento);
  const addAnexosDespacho = (novos) => setAnexosDespacho(arr => [...arr, ...novos]);
  const removeAnexoDespacho = (id) => setAnexosDespacho(arr => arr.filter(a => a.id !== id));

  const podeConfirmar = pct === 100 && (!isItm || freqsSelecionadas.length > 0) && startupChecklistOk;

  return (
    <div>
      {/* SELETOR DE INSPEÇÕES (multi) — só para visitas ITM */}
      {isItm && (
        <div className="mb-5 pb-5 border-b" style={{ borderColor: C.border }}>
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.orangeDark }}>
              Quais inspeções serão realizadas nesta visita?
            </div>
            {contrato && mesAtual && (
              <div className="text-[10px] font-semibold" style={{ color: C.gray }}>
                Mês {mesAtual} de {duracao} · Contrato {contrato.cliente}
              </div>
            )}
          </div>
          {contrato && mesAtual ? (
            <div className="text-[11px] mb-3 p-2 rounded" style={{ background: C.orangeLight, color: C.gray }}>
              Conforme NFPA 25, no <strong>mês {mesAtual}</strong> do contrato estão previstas: <strong>{freqsPrevistas.join(" + ")}</strong>. Ajuste se necessário.
            </div>
          ) : (
            <div className="text-[11px] mb-3" style={{ color: C.grayMid }}>
              Marque as inspeções NFPA 25 que serão realizadas nesta visita.
            </div>
          )}
          {foraPeriodo && (
            <div className="text-[11px] mb-3 p-2 rounded flex items-center gap-1" style={{ background: C.nokLight, color: C.nok }}>
              <AlertTriangle size={11} /> Esta visita está fora do período contratado (mês {mesAtual} de {duracao}).
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {FREQ_NFPA.map(f => {
              const ult = ultimaPorFreq[f];
              const st = statusFreq(f);
              const ativa = freqsSelecionadas.includes(f);
              const ehBase = f === freqBase;
              const ehPrevista = freqsPrevistas.includes(f);
              return (
                <button key={f} type="button" onClick={() => toggleFreq(f)}
                        className="border-2 rounded-lg p-3 text-left transition relative"
                        style={{
                          background: ativa ? FREQ_COLOR[f]?.bg : "transparent",
                          borderColor: ativa ? FREQ_COLOR[f]?.fg : C.border,
                          opacity: ativa ? 1 : 0.65,
                        }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm" style={{ color: ativa ? FREQ_COLOR[f]?.fg : C.gray }}>
                      Inspeção {f}
                    </span>
                    <div className="flex items-center gap-1">
                      {ehBase && <Pill bg={C.orangeLight} fg={C.orangeDark}>BASE</Pill>}
                      {ativa
                        ? <CheckCircle2 size={16} style={{ color: FREQ_COLOR[f]?.fg }} />
                        : <div className="w-4 h-4 rounded border-2" style={{ borderColor: C.border }} />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span style={{ color: C.grayMid }}>
                      Última: <span className="font-semibold" style={{ color: C.gray }}>
                        {ult ? fmtDate(ult.dataEmissao) : "nunca"}
                      </span>
                    </span>
                    <span className="font-bold flex items-center gap-1" style={{ color: st.color }}>
                      {st.vencida && <AlertTriangle size={9} />}
                      {st.label}
                    </span>
                  </div>
                  {ehPrevista && !ehBase && (
                    <div className="mt-1.5 text-[9px] font-bold flex items-center gap-1" style={{ color: C.orangeDark }}>
                      ★ Prevista no cronograma
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {freqsSelecionadas.length > 1 && (
            <div className="mt-3 p-2 rounded text-[11px] flex items-start gap-2" style={{ background: C.orangeLight, color: C.gray }}>
              <ClipboardCheck size={12} className="mt-0.5 flex-shrink-0" style={{ color: C.orangeDark }} />
              <span>
                Esta visita realizará <strong>{freqsSelecionadas.length} inspeções</strong>: {freqsSelecionadas.join(" + ")}. Todos os checklists NFPA 25 dessas frequências serão carregados no ITM.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mb-5 pb-5 border-b space-y-4" style={{ borderColor: C.border }}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Demanda do atendimento">
            <textarea value={demandaDespacho} onChange={e => setDemandaDespacho(e.target.value)} rows={5}
                      placeholder="Demanda recebida, histórico informado pelo cliente e objetivo da visita."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-y" style={{ borderColor: C.border }} />
          </Field>
          <Field label="Orientações internas para o técnico">
            <textarea value={orientacoes} onChange={e => setOrientacoes(e.target.value)} rows={5}
                      placeholder="Cuidados de acesso, contatos, sequência recomendada, documentos a conferir, peças ou ferramentas."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-y" style={{ borderColor: C.border }} />
          </Field>
        </div>

        <div className="border rounded-lg p-3 space-y-3" style={{ borderColor: isStartup && !startupChecklistOk ? C.nok : C.border }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-bold" style={{ color: C.gray }}>Anexos enviados ao técnico</div>
              <div className="text-[11px]" style={{ color: C.grayMid }}>Inclua e-mails, checklist, curva e folhas de dados de bomba, motor e painel.</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <AttachmentInput label="Anexar e-mail/documento" categoria="E-mail ou documento da demanda" onAdd={addAnexosDespacho} />
              <AttachmentInput label="Curva / folha de dados" categoria="Curva ou folha de dados" onAdd={addAnexosDespacho} />
              {isStartup && <AttachmentInput label="Checklist cliente" categoria="Checklist preenchido pelo cliente" onAdd={addAnexosDespacho} required />}
            </div>
          </div>
          {isStartup && !startupChecklistOk && (
            <div className="text-xs flex items-center gap-2 p-2 rounded" style={{ background: C.nokLight, color: C.nok }}>
              <AlertTriangle size={14} /> Start-up exige o check-list preenchido pelo cliente antes do despacho.
            </div>
          )}
          {(visita?.anexos || []).length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.grayMid }}>Anexos do agendamento</div>
              <AttachmentList anexos={visita.anexos} empty="Nenhum anexo no agendamento." />
            </div>
          )}
          <div>
            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.grayMid }}>Anexos adicionados no despacho</div>
            <AttachmentList anexos={anexosDespacho} onRemove={removeAnexoDespacho} empty="Nenhum anexo adicional no despacho." />
          </div>
        </div>
      </div>

      {/* CHECKLIST DE DESPACHO */}
      <div className="mb-4">
        <div className="flex justify-between text-xs font-semibold mb-1 items-center">
          <span>Checklist de despacho</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1" style={{ color: C.ok }}><CheckCircle2 size={12} /> {ok}</span>
            <span className="flex items-center gap-1" style={{ color: C.nok }}><XCircle size={12} /> {nok}</span>
            <span className="flex items-center gap-1" style={{ color: C.na }}><MinusCircle size={12} /> {na}</span>
            <span style={{ color: C.orangeDark }}>{done}/{total} ({pct}%)</span>
          </div>
        </div>
        <div className="h-2 rounded-full" style={{ background: C.grayLight }}>
          <div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: C.orange }} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {DESPACHO_GRUPOS.map(g => (
          <div key={g.titulo} className="border rounded-lg p-3" style={{ borderColor: C.border }}>
            <div className="font-bold text-sm mb-2" style={{ color: C.orangeDark }}>{g.titulo}</div>
            {g.items.map(it => {
              const v = state[it] || { status: "", obs: "" };
              return (
                <div key={it} className="py-2 border-b last:border-0" style={{ borderColor: C.border }}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs flex-1" style={{ color: C.gray }}>{it}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      <StatusBtn label="OK"     color={C.ok}  active={v.status === "ok"}  onClick={() => setItem(it, { status: "ok" })} />
                      <StatusBtn label="NÃO OK" color={C.nok} active={v.status === "nok"} onClick={() => setItem(it, { status: "nok" })} />
                      <StatusBtn label="N/A"    color={C.na}  active={v.status === "na"}  onClick={() => setItem(it, { status: "na" })} />
                    </div>
                  </div>
                  {(v.status === "nok" || v.status === "na") && (
                    <input value={v.obs} onChange={e => setItem(it, { obs: e.target.value })}
                           placeholder={v.status === "nok" ? "Descreva o problema…" : "Justifique a N/A…"}
                           className="w-full mt-1.5 px-2 py-1 text-xs border rounded"
                           style={{ borderColor: v.status === "nok" ? C.nok : C.border, background: v.status === "nok" ? C.nokLight : C.white, color: C.gray }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-4 mt-4 border-t items-center gap-3" style={{ borderColor: C.border }}>
        {nok > 0 && pct === 100 && (
          <span className="text-xs flex items-center gap-1" style={{ color: C.nok }}>
            <AlertTriangle size={12} /> {nok} item{nok > 1 ? "s" : ""} NÃO OK — verifique antes de prosseguir
          </span>
        )}
        <button onClick={() => onSave({ checklist: state, demanda: demandaDespacho, orientacoes, anexos: anexosDespacho, confirmadoEm: new Date().toISOString() }, freqsSelecionadas)} disabled={!podeConfirmar}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                style={{ background: C.orangeFill }}>
          {pct < 100 ? `Faltam ${total - done} itens` :
           isItm && freqsSelecionadas.length === 0 ? "Selecione ao menos 1 inspeção" :
           isStartup && !startupChecklistOk ? "Anexe o checklist do cliente" :
           "Confirmar Despacho"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ITM FLOW — Wizard, roteia por tipo:
//   - itm        → fluxo NFPA (checklists por frequência, sem casas de bombas)
//   - inspecao   → fluxo Padrao (casas + equipamentos)
//   - preventiva → fluxo Padrao + foco em atividades preventivas
//   - corretiva  → fluxo Padrao + bloco diagnóstico → ação → resultado
// ═══════════════════════════════════════════════════════════════════════════
function ITMFlow({ visita, contratos, tecnicos, onClose, onFinish, initialDraft, onSaveDraft }) {
  const D = initialDraft || {};
  const contrato = !visita.avulsa ? contratos.find(c => c.id === visita.contratoId) : null;
  // técnico do relatório: quem está logado como técnico executa; senão, o técnico da visita (nunca "o primeiro da lista")
  const { sessao } = useAuth();
  const meu = meuTecnico(sessao, tecnicos);
  const tecVisita = tecnicos.find(t => t.id === visita.tecnicoId) || null;
  const tecnico  = (sessao?.perfil === "tecnico" && meu) ? meu : (tecVisita || meu || null);
  const tipoCfg  = TIPO_REL[visita.tipo || "inspecao"];
  const isNFPA   = tipoCfg.modo === "nfpa";
  const isStartup = tipoCfg.modo === "startup";

  const codigoPrefix = visita.tipo === "itm" ? "ITM"
                     : visita.tipo === "inspecao" ? "RI"
                     : visita.tipo === "preventiva" ? "RMP"
                     : visita.tipo === "startup" ? "RQ48"
                     : "RMC";

  const [step, setStep] = useState(D.step ?? 0);
  const [identificacao, setIdentificacao] = useState(() => D.identificacao ?? ({
    cliente: contrato?.cliente || "",
    empreendimento: "",
    local: contrato?.endereco || "",
    telefone: contrato?.telefone || "",
    contratoNum: contrato?.id ? `CT-${contrato.id}` : "",
    os: "",
    inspetor: tecnico?.nome || "",
    tecnicoId: tecnico?.id ?? null,
    licenca: tecnico?.licenca || "",
    contratado: "LS Fire",
    enderecoContratado: "lsfire.com.br",
    periodoIni: visita.data || hojeLocal(),
    periodoFim: visita.data || hojeLocal(),
    responsavel: tecnico?.nome || "",
    codigo: visita.referencia || visita.codigoAtendimento || `${codigoPrefix}-${Date.now().toString().slice(-4)}`,
    revisao: "00",
    dataEmissao: hojeLocal(),
  }));

  // Estado para fluxo NFPA — carrega checklists das frequências escolhidas no despacho
  // Ex: despacho marcou Mensal + Trimestral → grupos das duas, mas SEM cumulativas inferidas
  const visitaFreqs = getVisitaFreqs(visita);
  const [nfpaGroups, setNfpaGroups] = useState(() => {
    if (D.nfpaGroups) return D.nfpaGroups;
    if (!isNFPA) return [];
    const grupos = [];
    let gid = 1;
    ordenarFreqs(visitaFreqs).forEach(freq => {
      const tpl = NFPA25[freq] || [];
      tpl.forEach(g => {
        grupos.push({
          id: gid++,
          freq, // marca qual frequência este grupo pertence
          grupo: g.grupo,
          items: g.items.map((t, i) => ({ id: i + 1, texto: t, status: "", obs: "", fotos: [] }))
        });
      });
    });
    return grupos;
  });

  // Equipamentos presentes no contrato (filtra grupos do checklist NFPA).
  // Herda do cadastro do contrato; se o contrato não tiver equipamentos, mostra todos.
  const equipDoContrato = (() => {
    const eq = contrato?.equipamentos;
    if (!eq || !eq.length) return null;
    const tipos = new Set(eq.map(e => e.tipo));
    return { diesel: tipos.has("diesel"), eletrica: tipos.has("eletrica"), vapor: tipos.has("vapor") };
  })();
  const [equipNFPA, setEquipNFPA] = useState(() => D.equipNFPA ?? equipDoContrato ?? { diesel: true, eletrica: true, vapor: true });
  const nfpaVisiveis = useMemo(
    () => nfpaGroups.filter(g => { const c = categoriaGrupoNFPA(g.grupo); return c === "geral" || equipNFPA[c]; }),
    [nfpaGroups, equipNFPA]
  );

  // Estado para fluxo Padrao
  const [casas, setCasas] = useState(() => D.casas ?? (isNFPA || isStartup ? [] : [
    { id: 1, nome: "G-100", instalacao: INSTALACAO_SKID.map((t, i) => ({ id: i + 1, texto: t, status: "", obs: "", fotos: [] })), equipamentos: [] }
  ]));

  const [startup, setStartup] = useState(() => D.startup ?? (isStartup ? createStartupData(tecnico?.nome || "") : null));

  // Estado específico para Corretiva
  const [corretiva, setCorretiva] = useState(() => D.corretiva ?? { diagnostico: "", acao: "", resultado: "", pecasUtilizadas: "" });

  // Teste de performance opcional para fluxos não-startup (ITM/inspeção/preventiva/corretiva)
  const [fazerPerformance, setFazerPerformance] = useState(D.fazerPerformance ?? false);
  const [perfData, setPerfData] = useState(() => D.perfData ?? createStartupData(tecnico?.nome || ""));

  const [maoObra, setMaoObra]   = useState(() => D.maoObra ?? [{ id: 1, dataIni: "", dataFim: "" }]);
  const [deslocs, setDeslocs]   = useState(() => D.deslocs ?? [{ id: 1, dataIni: "", kmIni: "", dataFim: "", kmFim: "" }]);
  const [trein, setTrein]       = useState(() => D.trein ?? { houve: isStartup, participantes: [] });
  const [obs, setObs]           = useState(D.obs ?? "");
  const [assins, setAssins]     = useState(() => D.assins ?? { cliente: contrato?.contato || "", tecnico: tecnico?.nome || "" });

  // Estatísticas: contabiliza todos os itens (nfpa ou padrao)
  const stats = useMemo(() => {
    let ok = 0, nok = 0, na = 0, total = 0;
    const countItems = (items) => items.forEach(i => {
      total++;
      if (i.status === "ok") ok++;
      else if (i.status === "nok") nok++;
      else if (i.status === "na") na++;
    });
    if (isNFPA) {
      nfpaVisiveis.forEach(g => countItems(g.items));
    } else if (isStartup) {
      (startup?.checklistGroups || []).forEach(g => countItems(g.items));
    } else {
      casas.forEach(casa => {
        countItems(casa.instalacao);
        casa.equipamentos.forEach(eq => eq.sections.forEach(s => countItems(s.items)));
      });
    }
    const done = ok + nok + na;
    return { ok, nok, na, total, done, progress: total ? Math.round(done / total * 100) : 0 };
  }, [nfpaVisiveis, casas, startup, isNFPA, isStartup]);

  const conformidade = stats.ok + stats.nok > 0 ? Math.round((stats.ok / (stats.ok + stats.nok)) * 100) : 100;

  // Define passos baseados no tipo
  const steps = useMemo(() => {
    const base = [{ id: "id", label: "Identificação", Icon: ClipboardCheck }];
    if (isNFPA) base.push({ id: "check", label: "Checklist NFPA", Icon: Flame });
    else if (isStartup) base.push(
      { id: "std", label: "Dados RQ 48", Icon: Building2 },
      { id: "stc", label: "Checklist RQ 48", Icon: ClipboardCheck },
      { id: "stt", label: "Testes", Icon: ShieldCheck }
    );
    else base.push({ id: "cas", label: "Casas de bombas", Icon: Flame });
    if (!isStartup && fazerPerformance) base.push(
      { id: "perfeq", label: "Equip. performance", Icon: Building2 },
      { id: "perf", label: "Teste de performance", Icon: ShieldCheck }
    );
    if (visita.tipo === "corretiva") base.push({ id: "cor", label: "Ação corretiva", Icon: Wrench });
    if (!isStartup) base.push(
      { id: "mao", label: "Mão de obra", Icon: Clock },
      { id: "des", label: "Deslocamento", Icon: Truck }
    );
    base.push(
      { id: "tre", label: isStartup ? "Participantes" : "Treinamento", Icon: Users },
      { id: "obs", label: "Observações", Icon: MessageSquare },
      { id: "ass", label: "Assinaturas", Icon: PenLine }
    );
    return base;
  }, [isNFPA, isStartup, visita.tipo, fazerPerformance]);

  const currentStep = steps[Math.min(step, steps.length - 1)] || steps[0];

  const snapshot = () => ({
    step, identificacao, nfpaGroups, equipNFPA, casas, startup, corretiva,
    fazerPerformance, perfData, maoObra, deslocs, trein, obs, assins,
    _savedAt: new Date().toISOString(),
  });
  const handleClose = () => { try { onSaveDraft?.(snapshot()); } catch {} onClose(); };

  // Rascunho salvo sozinho durante o preenchimento (~1,5 s depois da última mudança), no mesmo lugar do rascunho
  // salvo ao fechar (visita.rascunhoItm): se o app fechar, a bateria acabar ou a aba for descartada, nada se perde.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;
  const primeiraRenderRef = useRef(true);
  useEffect(() => {
    if (primeiraRenderRef.current) { primeiraRenderRef.current = false; return; } // abrir não é mudança
    const t = setTimeout(() => { try { onSaveDraftRef.current?.(snapshotRef.current(), { auto: true }); } catch {} }, 1500);
    return () => clearTimeout(t);
  }, [step, identificacao, nfpaGroups, equipNFPA, casas, startup, corretiva, fazerPerformance, perfData, maoObra, deslocs, trein, obs, assins]);

  const finalizar = () => {
    onFinish({
      contratoId: contrato?.id || null,
      visitaId: visita.avulsa ? null : visita.id,
      cliente: identificacao.cliente,
      os: identificacao.os,
      codigo: identificacao.codigo,
      referencia: identificacao.codigo,
      codigoAtendimento: identificacao.codigo,
      revisao: identificacao.revisao,
      dataEmissao: identificacao.dataEmissao,
      tecnicoId: tecnico?.id,
      tipo: visita.tipo || "inspecao",
      freq: visitaFreqs[0] || null,        // compat
      freqs: isNFPA ? visitaFreqs : null,  // novo: array com todas as inspeções desta visita
      modo: tipoCfg.modo,
      identificacao,
      demandaAtendimento: visita.despacho?.demanda || visita.demanda || "",
      orientacoesInternas: visita.despacho?.orientacoes || "",
      anexosAtendimento: getVisitaAnexos(visita),
      nfpaGroups: isNFPA ? nfpaVisiveis : null,
      equipNFPA: isNFPA ? equipNFPA : null,
      casas: isNFPA || isStartup ? null : casas,
      startup: isStartup ? startup : null,
      fazerPerformance: !isStartup ? fazerPerformance : false,
      performance: (!isStartup && fazerPerformance) ? perfData : null,
      corretiva: visita.tipo === "corretiva" ? corretiva : null,
      maoObra: isStartup ? [] : maoObra,
      deslocs: isStartup ? [] : deslocs,
      trein, obs, assins,
      stats, conformidade,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col print:hidden lsfire-app-shell">
      {/* Topo */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: C.border, background: tipoCfg.bg }}>
        <button onClick={handleClose} className="p-2 rounded hover:bg-white/50" aria-label="Voltar (o rascunho fica salvo)" title="Voltar"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase font-bold tracking-wider flex items-center gap-2 flex-wrap" style={{ color: tipoCfg.color }}>
            <tipoCfg.Icon size={14} /> {tipoCfg.nomeLong}
            {visitaFreqs.map(f => (
              <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: FREQ_COLOR[f]?.bg, color: FREQ_COLOR[f]?.fg }}>
                {f}
              </span>
            ))}
          </div>
          <div className="font-bold text-sm truncate">{identificacao.cliente || "Novo relatório avulso"}</div>
        </div>
        <div className="flex items-center gap-4 text-xs flex-shrink-0">
          <span className="hidden sm:flex items-center gap-1" style={{ color: C.ok }}><CheckCircle2 size={14} /> {stats.ok}</span>
          <span className="hidden sm:flex items-center gap-1" style={{ color: C.nok }}><XCircle size={14} /> {stats.nok}</span>
          <span className="hidden sm:flex items-center gap-1" style={{ color: C.na }}><MinusCircle size={14} /> {stats.na}</span>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold" style={{ color: C.grayMid }}>Progresso</div>
            <div className="text-sm font-black" style={{ color: tipoCfg.color }}>{stats.progress}%</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b overflow-x-auto" style={{ borderColor: C.border }}>
        <div className="flex">
          {steps.map((s, i) => {
            const active = i === step;
            const Icon = s.Icon;
            return (
              <button key={s.id} onClick={() => setStep(i)}
                      className="flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition"
                      style={{
                        borderColor: active ? C.orange : "transparent",
                        color: active ? C.orangeDark : C.grayMid,
                        background: active ? C.orangeLight : "transparent"
                      }}>
                <Icon size={14} /> {i + 1}. {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {currentStep.id === "id"    && <StepIdentificacao state={identificacao} setState={setIdentificacao} isNFPA={isNFPA} isStartup={isStartup} tecnicos={tecnicos} meuId={meu?.id ?? null} />}
        {currentStep.id === "id" && !isStartup && (
          <div className="max-w-3xl mx-auto mt-5">
            <div className="border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: C.border, background: fazerPerformance ? C.orangeLight : C.white }}>
              <div>
                <div className="font-bold text-sm flex items-center gap-2" style={{ color: C.gray }}>
                  <ShieldCheck size={16} style={{ color: TIPO_REL.startup.color }} /> Fazer teste de performance?
                </div>
                <div className="text-xs mt-1" style={{ color: C.grayMid }}>
                  Se marcado, abrem as abas de Equipamentos e Teste de Performance (curva NFPA 20). Se não, o relatório segue sem medição de performance.
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setFazerPerformance(false)}
                        className="px-4 py-2 rounded-lg text-sm font-bold border"
                        style={{ borderColor: C.border, background: !fazerPerformance ? C.gray : C.white, color: !fazerPerformance ? C.white : C.gray }}>
                  Não
                </button>
                <button onClick={() => setFazerPerformance(true)}
                        className="px-4 py-2 rounded-lg text-sm font-bold border"
                        style={{ borderColor: C.orange, background: fazerPerformance ? C.orangeFill : C.white, color: fazerPerformance ? "#fff" : C.orangeDark }}>
                  Sim
                </button>
              </div>
            </div>
          </div>
        )}
        {currentStep.id === "perfeq" && <StepStartupDados startup={perfData} setStartup={setPerfData} soEquipamentos />}
        {currentStep.id === "perf"   && <StepStartupTestes startup={perfData} setStartup={setPerfData} />}
        {currentStep.id === "check" && <StepNFPA groups={nfpaGroups} setGroups={setNfpaGroups} freqs={visitaFreqs} equip={equipNFPA} setEquip={setEquipNFPA} />}
        {currentStep.id === "std"   && <StepStartupDados startup={startup} setStartup={setStartup} tecnicos={tecnicos} meuId={meu?.id ?? null} />}
        {currentStep.id === "stc"   && <StepStartupChecklist startup={startup} setStartup={setStartup} />}
        {currentStep.id === "stt"   && <StepStartupTestes startup={startup} setStartup={setStartup} />}
        {currentStep.id === "cas"   && <StepCasas casas={casas} setCasas={setCasas} tipo={visita.tipo} />}
        {currentStep.id === "cor"   && <StepCorretiva state={corretiva} setState={setCorretiva} />}
        {currentStep.id === "mao"   && <StepMaoObra maoObra={maoObra} setMaoObra={setMaoObra} />}
        {currentStep.id === "des"   && <StepDeslocamento deslocs={deslocs} setDeslocs={setDeslocs} />}
        {currentStep.id === "tre"   && <StepTreinamento trein={trein} setTrein={setTrein} />}
        {currentStep.id === "obs"   && <StepObservacoes obs={obs} setObs={setObs} tipo={visita.tipo} />}
        {currentStep.id === "ass"   && <StepAssinaturas assins={assins} setAssins={setAssins} tecnicos={tecnicos} meuId={meu?.id ?? null} />}
      </div>

      {/* Rodapé navegação */}
      <div className="flex gap-2 p-4 border-t" style={{ borderColor: C.border }}>
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold border disabled:opacity-30"
                style={{ borderColor: C.border, color: C.gray }}>
          ← Anterior
        </button>
        <div className="flex-1" />
        {step < steps.length - 1 && (
          <button onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.orangeFill }}>
            Próximo →
          </button>
        )}
        {step === steps.length - 1 && (
          <button onClick={finalizar}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2"
                  style={{ background: C.orangeFill }}>
            <FileText size={14} /> Finalizar e gerar relatório
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEPS DO ITM FLOW
// ═══════════════════════════════════════════════════════════════════════════
// ─── técnico / inspetor ────────────────────────────────────────────────────
// O inspetor do relatório é o técnico do cadastro. Quem está logado como técnico já vem preenchido: pelo vínculo do
// login com o técnico (Usuários e acessos) e, sem vínculo (visualização no claude.ai), pelo nome igual ao do cadastro.
const normNome = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function meuTecnico(sessao, tecnicos) {
  if (!sessao || !Array.isArray(tecnicos)) return null;
  if (sessao.tecnicoId != null) { const t = tecnicos.find(x => String(x.id) === String(sessao.tecnicoId)); if (t) return t; }
  if (sessao.perfil === "tecnico" && normNome(sessao.nome)) return tecnicos.find(x => normNome(x.nome) === normNome(sessao.nome)) || null;
  return null;
}
// lista dos técnicos cadastrados; "Outro" abre o campo de texto (inspetor de fora da equipe)
function CampoTecnico({ tecnicos, value, onPick, rotulo = "técnico", meuId = null }) {
  const lista = Array.isArray(tecnicos) ? tecnicos : [];
  const achado = lista.find(t => normNome(t.nome) && normNome(t.nome) === normNome(value));
  const [outro, setOutro] = useState(() => !!String(value || "").trim() && !achado);
  const selVal = outro ? "__outro" : (achado ? String(achado.id) : "");
  const est = { borderColor: C.border };
  return (
    <div className="space-y-2">
      <select aria-label={"Escolher o " + rotulo} value={selVal} className="w-full border rounded-lg px-3 py-2 text-sm" style={est}
              onChange={e => { const v = e.target.value; if (v === "__outro") { setOutro(true); onPick(achado ? "" : (value || ""), null); return; } setOutro(false); const t = lista.find(x => String(x.id) === v); onPick(t ? t.nome : "", t || null); }}>
        <option value="">— escolha o {rotulo} —</option>
        {lista.map(t => <option key={t.id} value={String(t.id)}>{t.nome}{t.licenca ? " · " + t.licenca : ""}{meuId != null && String(t.id) === String(meuId) ? " (você)" : ""}</option>)}
        <option value="__outro">Outro (digitar o nome)</option>
      </select>
      {outro && <input aria-label={"Nome do " + rotulo} value={value || ""} onChange={e => onPick(e.target.value, null)} placeholder="Nome de quem executou" className="w-full border rounded-lg px-3 py-2 text-sm" style={est} />}
    </div>
  );
}

function StepIdentificacao({ state, setState, isNFPA, isStartup, tecnicos = [], meuId = null }) {
  const upd = (k, v) => setState(s => ({ ...s, [k]: v }));
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Identificação</h2>

      {isNFPA && (
        <div className="p-3 rounded-lg flex items-start gap-2 text-xs" style={{ background: C.blueLight, color: C.blue }}>
          <ClipboardCheck size={14} className="mt-0.5 flex-shrink-0" />
          <span>Os campos abaixo seguem o formulário NFPA 25 / NFPA 20. Eles aparecem no cabeçalho do relatório oficial.</span>
        </div>
      )}
      {isStartup && (
        <div className="p-3 rounded-lg flex items-start gap-2 text-xs" style={{ background: TIPO_REL.startup.bg, color: TIPO_REL.startup.color }}>
          <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" />
          <span>Este relatório segue o formulário RQ 48 de start-up e comissionamento. Os dados técnicos e testes ficam nas próximas abas.</span>
        </div>
      )}

      <h3 className="text-sm font-bold mt-2" style={{ color: C.orangeDark }}>Propriedade inspecionada</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nome da propriedade"><input value={state.cliente} onChange={e => upd("cliente", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        {!isNFPA && <Field label="Empreendimento"><input value={state.empreendimento} onChange={e => upd("empreendimento", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>}
        <Field label="Endereço da propriedade"><input value={state.local} onChange={e => upd("local", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm md:col-span-2" style={{ borderColor: C.border }} /></Field>
        <Field label="Telefone da propriedade"><input value={state.telefone} onChange={e => upd("telefone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Nº do contrato"><input value={state.contratoNum} onChange={e => upd("contratoNum", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="OS Nº"><input value={state.os} onChange={e => upd("os", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Código do documento"><input value={state.codigo} onChange={e => upd("codigo", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>

      <h3 className="text-sm font-bold mt-4" style={{ color: C.orangeDark }}>Período / Técnico (inspetor)</h3>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Início da execução"><input type="date" value={state.periodoIni} onChange={e => upd("periodoIni", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Fim da execução"><input type="date" value={state.periodoFim} onChange={e => upd("periodoFim", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Técnico / Inspetor"><CampoTecnico tecnicos={tecnicos} meuId={meuId} rotulo="técnico (inspetor)" value={state.inspetor}
          onPick={(nome, t) => setState(s => ({ ...s, inspetor: nome, tecnicoId: t ? t.id : null, ...(t ? { responsavel: t.nome, licenca: t.licenca || s.licenca } : {}) }))} /></Field>
        <Field label="Data de emissão"><input type="date" value={state.dataEmissao} onChange={e => upd("dataEmissao", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>

      <h3 className="text-sm font-bold mt-4" style={{ color: C.orangeDark }}>Contratado</h3>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Nome do contratado"><input value={state.contratado} onChange={e => upd("contratado", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Endereço do contratado"><input value={state.enderecoContratado} onChange={e => upd("enderecoContratado", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Licença / certificação Nº"><input value={state.licenca} onChange={e => upd("licenca", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>
    </div>
  );
}

// Classifica um grupo do checklist NFPA 25 por equipamento.
// "geral" sempre aparece (Sala de Bombas, Sistemas de Bomba). Os demais
// (diesel/eletrica/vapor) só aparecem se o equipamento existir no contrato.
function categoriaGrupoNFPA(nome) {
  const n = (nome || "").toLowerCase();
  if (n.includes("sala de bombas")) return "geral";
  if (n.includes("sistemas de bomba")) return "geral";
  if (n.includes("vapor")) return "vapor";
  if (n.includes("diesel") || n.includes("combustível") || n.includes("combustivel") ||
      n.includes("bateria") || n.includes("lubrificação") || n.includes("lubrificacao") ||
      n.includes("resfriamento") || n.includes("exaustão") || n.includes("exaustao")) return "diesel";
  if (n.includes("elétric") || n.includes("eletric") || n.includes("transmissão mecânica") ||
      n.includes("transmissao mecanica")) return "eletrica";
  return "geral";
}

const EQUIP_NFPA_LABEL = { diesel: "Bomba Diesel", eletrica: "Bomba Elétrica", vapor: "Bomba a Vapor" };

function StepNFPA({ groups, setGroups, freqs, equip, setEquip }) {
  const updGroup = (gid, items) => setGroups(gs => gs.map(g => g.id === gid ? { ...g, items: aplicarAtualizacao(items, g.items) } : g));
  const eq = equip || { diesel: true, eletrica: true, vapor: true };

  // categorias de equipamento que realmente existem neste checklist
  const categoriasPresentes = useMemo(() => {
    const set = new Set();
    groups.forEach(g => { const c = categoriaGrupoNFPA(g.grupo); if (c !== "geral") set.add(c); });
    return ["diesel", "eletrica", "vapor"].filter(c => set.has(c));
  }, [groups]);

  const grupoVisivel = (g) => { const c = categoriaGrupoNFPA(g.grupo); return c === "geral" || eq[c]; };
  const toggleEquip = (c) => setEquip?.(prev => ({ ...(prev || { diesel: true, eletrica: true, vapor: true }), [c]: !(prev ? prev[c] : true) }));

  // Agrupa por frequência preservando a ordem (Semanal → Anual), já filtrando equipamentos
  const gruposPorFreq = useMemo(() => {
    const map = {};
    groups.filter(grupoVisivel).forEach(g => {
      const f = g.freq;
      if (!f) return;
      if (!map[f]) map[f] = [];
      map[f].push(g);
    });
    return FREQ_NFPA.filter(f => map[f]).map(f => [f, map[f]]);
  }, [groups, eq]);

  const freqsArr = freqs || [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Checklist NFPA 25</h2>
        {freqsArr.map(f => (
          <Pill key={f} bg={FREQ_COLOR[f]?.bg} fg={FREQ_COLOR[f]?.fg}>Inspeção {f}</Pill>
        ))}
      </div>

      {categoriasPresentes.length > 0 && (
        <div className="border rounded-xl p-4" style={{ borderColor: C.border, background: C.white }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.grayMid }}>Equipamentos deste contrato</div>
          <div className="text-[11px] mb-3" style={{ color: C.grayMid }}>
            Pré-selecionados a partir do cadastro do contrato. Itens genéricos e Sala de Bombas aparecem sempre. (Se precisar, você ainda pode ajustar pontualmente para esta visita.)
          </div>
          <div className="flex gap-2 flex-wrap">
            {categoriasPresentes.map(c => {
              const ativo = eq[c];
              return (
                <button key={c} onClick={() => toggleEquip(c)}
                        className="px-3 py-2 rounded-lg text-sm font-bold border flex items-center gap-2"
                        style={{ borderColor: ativo ? C.orange : C.border, background: ativo ? C.orangeFill : C.white, color: ativo ? "#fff" : C.grayMid }}>
                  {ativo ? <CheckCircle2 size={15} /> : <MinusCircle size={15} />}
                  {EQUIP_NFPA_LABEL[c] || c}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {freqsArr.length > 1 && (
        <div className="p-3 rounded-lg flex items-start gap-2 text-xs" style={{ background: C.orangeLight, color: C.gray }}>
          <ClipboardCheck size={14} className="mt-0.5 flex-shrink-0" style={{ color: C.orangeDark }} />
          <div>
            <strong>Esta visita realiza {freqsArr.length} inspeções:</strong>{" "}
            {freqsArr.map((f, i) => (
              <span key={f}>
                <span className="font-semibold" style={{ color: FREQ_COLOR[f]?.fg }}>{f}</span>
                {i < freqsArr.length - 1 ? " + " : ""}
              </span>
            ))}
            . As inspeções adicionais foram marcadas no despacho porque coincidem com vencimentos do calendário do contrato.
          </div>
        </div>
      )}

      {gruposPorFreq.map(([f, gs]) => (
        <div key={f} className="space-y-3">
          <div className="flex items-center gap-2 pt-3 pb-1 border-t-2" style={{ borderColor: FREQ_COLOR[f]?.fg }}>
            <Pill bg={FREQ_COLOR[f]?.bg} fg={FREQ_COLOR[f]?.fg}>Inspeção {f}</Pill>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.grayMid }}>
              {gs.reduce((acc, g) => acc + g.items.length, 0)} itens · {gs.length} grupos
            </span>
          </div>
          {gs.map(g => (
            <ChecklistSection key={g.id} title={g.grupo} items={g.items} onChange={(items) => updGroup(g.id, items)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function StepStartupDados({ startup, setStartup, soEquipamentos = false, tecnicos = [], meuId = null }) {
  if (!startup) return null;
  const updInfo = (k, v) => setStartup(s => ({ ...s, info: { ...s.info, [k]: v } }));
  const updEquip = (id, key, value) => setStartup(s => ({
    ...s,
    equipamentos: (s.equipamentos || []).map(eq => {
      if (eq.id !== id) return eq;
      if (key === "nome" || key === "tag") return { ...eq, [key]: value, campos: { ...(eq.campos || {}), ...(key === "tag" ? { tag: value } : {}) } };
      return { ...eq, campos: { ...(eq.campos || {}), [key]: value } };
    }),
  }));
  const addEquip = (tipo) => setStartup(s => {
    const equipamentos = s.equipamentos || [];
    const ordinal = equipamentos.filter(eq => eq.tipo === tipo).length + 1;
    return { ...s, equipamentos: [...equipamentos, createStartupEquipamento(tipo, ordinal)] };
  });
  const removeEquip = (id) => setStartup(s => ({
    ...s,
    equipamentos: (s.equipamentos || []).filter(eq => eq.id !== id),
    testes: (s.testes || []).filter(t => t.equipamentoId !== id),
  }));

  const equipamentos = startup.equipamentos || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-black" style={{ color: C.gray }}>{soEquipamentos ? "Equipamentos para Teste de Performance" : "Dados do Start-up e Comissionamento"}</h2>
        <p className="text-xs mt-1" style={{ color: C.grayMid }}>{soEquipamentos ? "Cadastre os conjuntos (diesel/elétrica) que terão ensaio de performance. A aba Teste de Performance será preenchida a partir desta lista." : "Campos baseados no formulário RQ 48 usado pela LS Fire."}</p>
      </div>

      {!soEquipamentos && (
      <div className="border rounded-lg p-4" style={{ borderColor: C.border }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: TIPO_REL.startup.color }}>Identificação RQ 48</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Equipamento"><input value={startup.info.equipamento} onChange={e => updInfo("equipamento", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Técnico responsável"><CampoTecnico tecnicos={tecnicos} meuId={meuId} rotulo="técnico responsável" value={startup.info.tecnicoResponsavel} onPick={(nome) => updInfo("tecnicoResponsavel", nome)} /></Field>
          <Field label="Local de instalação"><input value={startup.info.localInstalacao} onChange={e => updInfo("localInstalacao", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Nº de série"><input value={startup.info.numeroSerie} onChange={e => updInfo("numeroSerie", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Norma"><input value={startup.info.norma} onChange={e => updInfo("norma", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Entrega"><input value={startup.info.entrega} onChange={e => updInfo("entrega", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        </div>
      </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold" style={{ color: TIPO_REL.startup.color }}>Equipamentos instalados</h3>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.grayMid }}>{equipamentos.length} conjuntos</span>
            <button type="button" onClick={() => addEquip("diesel")} className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1" style={{ background: C.gray, color: C.white }}><Plus size={13} /> Diesel</button>
            <button type="button" onClick={() => addEquip("eletrica")} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.blue }}><Plus size={13} /> Elétrica</button>
            <button type="button" onClick={() => addEquip("jockey")} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: TIPO_REL.startup.color }}><Plus size={13} /> Jockey / Pilot</button>
          </div>
        </div>

        {equipamentos.length === 0 && (
          <div className="border-2 border-dashed rounded-xl p-8 text-center" style={{ borderColor: C.border }}>
            <Building2 size={30} className="mx-auto mb-2" style={{ color: C.grayMid }} />
            <div className="font-bold text-sm" style={{ color: C.gray }}>Nenhum equipamento instalado</div>
            <div className="text-xs mt-1" style={{ color: C.grayMid }}>Clique em Diesel, Elétrica ou Jockey/Pilot para incluir os conjuntos. A aba Performance será preenchida automaticamente a partir desta lista.</div>
          </div>
        )}

        {equipamentos.map((eq, idx) => {
          const fields = STARTUP_EQUIPAMENTO_FIELDS[eq.tipo] || [];
          return (
            <details key={eq.id} open={idx < 2} className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
              <summary className="px-4 py-3 cursor-pointer text-sm font-bold list-none flex items-center justify-between gap-3" style={{ background: C.grayLight, color: C.gray }}>
                <span>{eq.nome}</span>
                <div className="flex items-center gap-3">
                  {eq.tag && <span className="text-[10px] uppercase" style={{ color: C.grayMid }}>TAG {eq.tag}</span>}
                  <span className="text-[10px] uppercase" style={{ color: TIPO_REL.startup.color }}>{eq.tipo === "jockey" ? "pilot / jockey" : eq.tipo}</span>
                </div>
              </summary>
              <div className="p-4 space-y-3">
                <div className="grid md:grid-cols-[1fr_220px_auto] gap-3 items-end">
                  <Field label="Título do conjunto">
                    <input value={eq.nome || ""} onChange={e => updEquip(eq.id, "nome", e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                  </Field>
                  <Field label="TAG do conjunto">
                    <input value={eq.tag || eq.campos?.tag || ""} onChange={e => updEquip(eq.id, "tag", e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                  </Field>
                  <button type="button" onClick={() => { if (confirm(`Remover ${eq.nome}?`)) removeEquip(eq.id); }} className="px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1" style={{ borderColor: C.border, color: C.nok }}>
                    <Trash2 size={13} /> Remover
                  </button>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  {fields.map(f => (
                    <Field key={f.key} label={f.label}>
                      <input value={eq.campos?.[f.key] || ""} onChange={e => updEquip(eq.id, f.key, e.target.value)}
                             className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                    </Field>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function StepStartupChecklist({ startup, setStartup }) {
  if (!startup) return null;
  const updGroup = (gid, items) => setStartup(s => ({
    ...s,
    checklistGroups: s.checklistGroups.map(g => g.id === gid ? { ...g, items: aplicarAtualizacao(items, g.items) } : g),
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Checklist RQ 48</h2>
        <p className="text-xs mt-1" style={{ color: C.grayMid }}>Marque OK, NÃO OK ou N/A e registre evidências por item quando necessário.</p>
      </div>
      {startup.checklistGroups.map(g => (
        <ChecklistSection key={g.id} title={g.grupo} items={g.items} onChange={(items) => updGroup(g.id, items)} />
      ))}
    </div>
  );
}

function StepStartupTestes({ startup, setStartup }) {
  // os hooks vêm antes de qualquer "return" (regras dos hooks): sem dados de start-up, a tela fica vazia mais abaixo
  const equipamentosPerformance = (startup?.equipamentos || []).filter(eq => ["diesel", "eletrica"].includes(eq.tipo));
  const testes = equipamentosPerformance.map((eq, idx) => {
    const tipoTeste = eq.tipo;
    const existente = (startup?.testes || []).find(t => t.equipamentoId === eq.id || t.id === eq.id);
    return {
      ...createStartupTeste(tipoTeste, idx + 1),
      ...(existente || {}),
      id: eq.id,
      equipamentoId: eq.id,
      tipo: tipoTeste,
      nome: eq.nome || `Teste de Performance Conjunto ${idx + 1}`,
      tag: eq.tag || eq.campos?.tag || "",
    };
  });

  useEffect(() => {
    if (!startup) return;
    setStartup(s => {
      if (!s) return s;
      const equipamentos = (s.equipamentos || []).filter(eq => ["diesel", "eletrica"].includes(eq.tipo));
      const atuais = s.testes || [];
      const sincronizados = equipamentos.map((eq, idx) => {
        const tipoTeste = eq.tipo;
        const existente = atuais.find(t => t.equipamentoId === eq.id || t.id === eq.id);
        return {
          ...createStartupTeste(tipoTeste, idx + 1),
          ...(existente || {}),
          id: eq.id,
          equipamentoId: eq.id,
          tipo: tipoTeste,
          nome: eq.nome || `Teste de Performance Conjunto ${idx + 1}`,
          tag: eq.tag || eq.campos?.tag || "",
        };
      });
      const changed = JSON.stringify(atuais.map(t => ({ id: t.id, equipamentoId: t.equipamentoId, nome: t.nome, tag: t.tag, tipo: t.tipo }))) !== JSON.stringify(sincronizados.map(t => ({ id: t.id, equipamentoId: t.equipamentoId, nome: t.nome, tag: t.tag, tipo: t.tipo })));
      return changed ? { ...s, testes: sincronizados } : s;
    });
  }, [startup?.equipamentos, setStartup]);
  if (!startup) return null;
  const updLinha = (testeId, linhaId, key, value) => setStartup(s => ({
    ...s,
    testes: (s.testes || []).map(t => t.id === testeId ? {
      ...t,
      linhas: (t.linhas || []).map(l => l.id === linhaId ? { ...l, [key]: value } : l),
    } : t),
  }));
  const updTesteNfpa = (testeId, key, value) => setStartup(s => ({
    ...s,
    testes: (s.testes || []).map(t => t.id === testeId ? {
      ...t,
      nfpa20: { ...createNfpa20TestData(t.tipo), ...(t.nfpa20 || {}), [key]: value },
    } : t),
  }));
  const updTesteMeta = (testeId, key, value) => setStartup(s => ({
    ...s,
    testes: (s.testes || []).map(t => (t.id === testeId || t.equipamentoId === testeId) ? { ...t, [key]: value } : t),
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black" style={{ color: C.gray }}>Testes de Performance e Curva NFPA 20</h2>
          <p className="text-xs mt-1" style={{ color: C.grayMid }}>Os testes são criados automaticamente a partir dos conjuntos cadastrados em Equipamentos Instalados. Edite nome e TAG naquela aba.</p>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.grayMid }}>{testes.length} testes</div>
      </div>

      <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: C.border, background: C.orangeLight, color: C.gray }}>
        <strong>Padrão de unidades LS Fire:</strong> vazão em GPM, pressão da bomba em mca, Pitot em psi, bocal em pol., potência em HP e pressão de óleo do motor em bar. Nas colunas Pitot, preencha a pressão de velocidade lida no tubo Pitot/manômetro do bocal; se usar medidor de vazão calibrado, preencha a vazão e deixe Pitot em branco.
      </div>

      {testes.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-10 text-center" style={{ borderColor: C.border }}>
          <ShieldCheck size={34} className="mx-auto mb-3" style={{ color: C.grayMid }} />
          <div className="font-bold text-sm" style={{ color: C.gray }}>Nenhum conjunto de performance cadastrado</div>
          <div className="text-xs mt-1" style={{ color: C.grayMid }}>Inclua bombas diesel ou elétricas em Equipamentos Instalados. Esta aba será aberta automaticamente.</div>
        </div>
      )}

      {testes.map((teste, idx) => {
        const fields = STARTUP_TEST_FIELDS[teste.tipo] || [];
        const cfg = getNfpa20Config(teste);
        const linhas = teste.linhas?.length ? teste.linhas : createStartupTeste(teste.tipo, idx + 1).linhas;
        const isEletrica = teste.tipo === "eletrica";
        const usaPitot = teste.usaPitot === true;
        const displayFields = usaPitot ? fields : fields.filter(f => f.unitKind !== "pitot");
        return (
          <div key={teste.id} className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-4 py-3 text-sm font-bold text-white flex items-center gap-3 flex-wrap" style={{ background: isEletrica ? C.blue : TIPO_REL.startup.color }}>
              <div className="flex-1 min-w-[260px]">
                <div className="text-sm font-black">{teste.nome || `Teste de Performance Conjunto ${idx + 1}`}</div>
                <div className="text-[11px] opacity-90">TAG: {teste.tag || "____"}</div>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] uppercase bg-white/20">
                {isEletrica ? "Motor elétrico" : "Motor diesel"}
              </span>
              <span className="text-[10px] opacity-80">Origem: Equipamentos Instalados</span>
            </div>
            <div className="p-4 border-b space-y-4" style={{ borderColor: C.border, background: C.grayLight }}>
              <div className="grid md:grid-cols-4 gap-3">
                <Field label="Conjunto">
                  <select value={cfg.tipoConjunto} onChange={e => updTesteNfpa(teste.id, "tipoConjunto", e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }}>
                    <option value="certificado">Certificado</option>
                    <option value="nao_certificado">Não certificado</option>
                  </select>
                </Field>
                <Field label="Operação">
                  <select value={cfg.modoVelocidade} onChange={e => updTesteNfpa(teste.id, "modoVelocidade", e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }}>
                    <option value="constante">Velocidade constante</option>
                    <option value="variavel">Velocidade variável</option>
                  </select>
                </Field>
                <Field label={`Vazão nominal (${getUnitLabel("flow", cfg.flowUnit)})`}>
                  <input value={cfg.vazaoNominalGpm} onChange={e => updTesteNfpa(teste.id, "vazaoNominalGpm", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label={`Pressão nominal (${getUnitLabel("pressure", cfg.pressureUnit)})`}>
                  <input value={cfg.pressaoNominalPsi} onChange={e => updTesteNfpa(teste.id, "pressaoNominalPsi", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label="Rotação nominal (rpm)">
                  <input value={cfg.rpmNominal} onChange={e => updTesteNfpa(teste.id, "rpmNominal", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label={`Bocal (${getUnitLabel("diameter", cfg.diameterUnit)})`}>
                  <input value={cfg.diametroBocalPol} onChange={e => updTesteNfpa(teste.id, "diametroBocalPol", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label="Coeficiente bocal">
                  <input value={cfg.coefBocal} onChange={e => updTesteNfpa(teste.id, "coefBocal", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label="Curva anexada">
                  <select value={cfg.curvaAnexada} onChange={e => updTesteNfpa(teste.id, "curvaAnexada", e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }}>
                    <option value="">Não informado</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </Field>
              </div>

              <div className="grid md:grid-cols-4 gap-3">
                <Field label={`Curva ref. 0% / churn (${getUnitLabel("pressure", cfg.pressureUnit)})`}>
                  <input value={cfg.pressaoChurnPsi} onChange={e => updTesteNfpa(teste.id, "pressaoChurnPsi", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label={`Curva ref. 100% (${getUnitLabel("pressure", cfg.pressureUnit)})`}>
                  <input value={cfg.pressao100Psi} onChange={e => updTesteNfpa(teste.id, "pressao100Psi", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label={`Curva ref. 150% (${getUnitLabel("pressure", cfg.pressureUnit)})`}>
                  <input value={cfg.pressao150Psi} onChange={e => updTesteNfpa(teste.id, "pressao150Psi", e.target.value)}
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
                <Field label="Observação da curva">
                  <input value={cfg.observacaoCurva} onChange={e => updTesteNfpa(teste.id, "observacaoCurva", e.target.value)}
                         placeholder="Ex.: curva certificada anexada / curva de referência interna"
                         className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                </Field>
              </div>
            </div>
            <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: C.border, background: usaPitot ? C.orangeLight : "#fff" }}>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold" style={{ color: C.gray }}>
                <input type="checkbox" checked={usaPitot} onChange={e => updTesteMeta(teste.id, "usaPitot", e.target.checked)}
                       style={{ accentColor: C.orange, width: 16, height: 16 }} />
                Medição por tubo de Pitot
              </label>
              <span className="text-[11px]" style={{ color: C.grayMid }}>
                {usaPitot ? "Colunas de Pitot e vazão calculada ativas." : "Sem Pitot: informe a vazão medida diretamente na coluna “Vazão”."}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: teste.tipo === "eletrica" ? 1480 : 1220 }}>
                <thead>
                  <tr style={{ background: C.grayLight, color: C.gray }}>
                    <th className="text-left px-2 py-2 border-b" style={{ borderColor: C.border, width: 70 }}>Teste</th>
                    {displayFields.map(f => <th key={f.key} className="text-left px-2 py-2 border-b" style={{ borderColor: C.border }}>{fieldLabelWithUnit(f, cfg)}</th>)}
                    {usaPitot && <th className="text-left px-2 py-2 border-b" style={{ borderColor: C.border }}>Pitot médio ({getUnitLabel("pitot", cfg.pitotUnit)})</th>}
                    {usaPitot && <th className="text-left px-2 py-2 border-b" style={{ borderColor: C.border }}>Vazão calc. ({getUnitLabel("flow", cfg.flowUnit)})</th>}
                    <th className="text-left px-2 py-2 border-b" style={{ borderColor: C.border }}>P líquida ({getUnitLabel("pressure", cfg.pressureUnit)})</th>
                    <th className="text-left px-2 py-2 border-b" style={{ borderColor: C.border }}>P ajust. RPM ({getUnitLabel("pressure", cfg.pressureUnit)})</th>
                    {isEletrica && <th className="text-left px-2 py-2 border-b" style={{ borderColor: C.border }}>A média (A)</th>}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(linha => {
                    const pitotMedio = calcPitotMedia(linha, cfg);
                    const vazaoCalc = flowFromGpm(calcVazaoPeloPitot(linha, cfg), cfg.flowUnit);
                    const pressaoLiquida = pressureFromPsi(calcPressaoLiquida(linha, cfg), cfg.pressureUnit);
                    const pressaoAjustada = calcPressaoAjustadaRpm(linha, cfg);
                    const correnteMedia = calcCorrenteMedia(linha);
                    return (
                      <tr key={linha.id}>
                        <td className="px-2 py-2 border-b font-bold" style={{ borderColor: C.border, color: TIPO_REL.startup.color }}>{linha.teste}</td>
                        {displayFields.map(f => (
                          <td key={f.key} className="px-1.5 py-1.5 border-b" style={{ borderColor: C.border }}>
                            <input value={linha[f.key] || ""} onChange={e => updLinha(teste.id, linha.id, f.key, e.target.value)}
                                   className="w-full border rounded px-2 py-1 text-[11px]" style={{ borderColor: C.border }} />
                          </td>
                        ))}
                        {usaPitot && <td className="px-2 py-2 border-b font-semibold" style={{ borderColor: C.border }}>{fmtMeasure(pitotMedio, 1)}</td>}
                        {usaPitot && <td className="px-2 py-2 border-b font-semibold" style={{ borderColor: C.border }}>{fmtMeasure(vazaoCalc, 0)}</td>}
                        <td className="px-2 py-2 border-b font-semibold" style={{ borderColor: C.border }}>{fmtMeasure(pressaoLiquida, 0)}</td>
                        <td className="px-2 py-2 border-b font-semibold" style={{ borderColor: C.border }}>{fmtMeasure(pressureFromPsi(pressaoAjustada, cfg.pressureUnit), 1)}</td>
                        {isEletrica && <td className="px-2 py-2 border-b font-semibold" style={{ borderColor: C.border }}>{fmtMeasure(correnteMedia, 0)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 space-y-4">
              <PumpCurveChart teste={teste} />
              {isEletrica && <PumpPowerChart teste={teste} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCasas({ casas, setCasas, tipo }) {
  // atualizações funcionais (a foto que termina de carregar não pode gravar sobre uma lista antiga)
  const addCasa = () => setCasas(cs => [...cs, { id: Date.now(), nome: `G-${cs.length + 1}00`, instalacao: INSTALACAO_SKID.map((t, i) => ({ id: i + 1, texto: t, status: "", obs: "", fotos: [] })), equipamentos: [] }]);
  const delCasa = (id) => setCasas(cs => cs.filter(c => c.id !== id));
  const updCasa = (id, patch) => setCasas(cs => cs.map(c => c.id === id ? { ...c, ...aplicarAtualizacao(patch, c) } : c));

  const aviso = tipo === "preventiva" ? "Foco em atividades preventivas: marque OK no que está em conformidade após a intervenção."
              : tipo === "corretiva"  ? "Identifique os itens NÃO OK que motivaram esta visita corretiva. A ação aplicada será descrita no próximo passo."
              : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Casas de bombas</h2>
        <button onClick={addCasa} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
          <Plus size={14} /> Nova casa
        </button>
      </div>
      {aviso && <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: TIPO_REL[tipo]?.bg, color: TIPO_REL[tipo]?.color }}>{aviso}</div>}
      <div className="space-y-6">
        {casas.map(casa => (
          <CasaCard key={casa.id} casa={casa} onUpdate={p => updCasa(casa.id, p)} onDelete={() => delCasa(casa.id)} />
        ))}
      </div>
    </div>
  );
}

function CasaCard({ casa, onUpdate, onDelete }) {
  const [open, setOpen] = useState(true);
  const addEquip = (tipo) => {
    const tpl = TIPOS_EQUIPAMENTO[tipo];
    onUpdate(c => ({
      equipamentos: [...c.equipamentos, {
        id: Date.now(), tipo, nome: tpl.nome,
        sections: tpl.sections.map(s => ({ ...s, items: s.items.map((t, i) => ({ id: i + 1, texto: t, status: "", obs: "", fotos: [] })) })),
      }]
    }));
  };
  const updEquip = (id, patch) => onUpdate(c => ({ equipamentos: c.equipamentos.map(e => e.id === id ? { ...e, ...aplicarAtualizacao(patch, e) } : e) }));
  const delEquip = (id) => onUpdate(c => ({ equipamentos: c.equipamentos.filter(e => e.id !== id) }));

  return (
    <div className="border-2 rounded-xl" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: C.border, background: C.orangeLight }}>
        <button onClick={() => setOpen(o => !o)} className="p-1" aria-expanded={open} aria-label={open ? "Recolher a casa de bombas" : "Abrir a casa de bombas"}>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
        <input value={casa.nome} onChange={e => onUpdate({ nome: e.target.value })}
               className="font-bold text-lg bg-transparent border-b" style={{ color: C.gray, borderColor: C.orange, outline: "none" }} />
        <div className="flex-1" />
        <button onClick={onDelete} className="p-1 rounded hover:bg-orange-200" style={{ color: C.nok }} aria-label="Excluir a casa de bombas" title="Excluir"><Trash2 size={16} /></button>
      </div>
      {open && (
        <div className="p-4 space-y-4">
          <ChecklistSection title="Instalação do Skid / Container" items={casa.instalacao} onChange={items => onUpdate(c => ({ instalacao: aplicarAtualizacao(items, c.instalacao) }))} />
          {casa.equipamentos.map(eq => (
            <EquipamentoSection key={eq.id} eq={eq} onUpdate={p => updEquip(eq.id, p)} onDelete={() => delEquip(eq.id)} />
          ))}
          <div className="border-2 border-dashed rounded-lg p-4" style={{ borderColor: C.border }}>
            <div className="text-xs font-bold mb-2" style={{ color: C.grayMid }}>+ Adicionar Equipamento</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TIPOS_EQUIPAMENTO).map(([tipo, tpl]) => {
                const Icon = tpl.Icon;
                return (
                  <button key={tipo} onClick={() => addEquip(tipo)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5"
                          style={{ borderColor: C.border, color: C.gray }}>
                    <Icon size={14} style={{ color: C.orangeDark }} /> {tpl.nome}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipamentoSection({ eq, onUpdate, onDelete }) {
  const [open, setOpen] = useState(true);
  const updSection = (sid, items) => onUpdate(e => ({ sections: e.sections.map(s => s.id === sid ? { ...s, items: aplicarAtualizacao(items, s.items) } : s) }));
  return (
    <div className="border rounded-lg" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3 p-3 border-b" style={{ borderColor: C.border, background: C.grayLight }}>
        <button onClick={() => setOpen(o => !o)} className="p-1" aria-expanded={open} aria-label={open ? "Recolher o equipamento" : "Abrir o equipamento"}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        <input value={eq.nome} onChange={e => onUpdate({ nome: e.target.value })}
               className="font-bold text-sm bg-transparent flex-1" style={{ color: C.gray, outline: "none" }} />
        <button onClick={onDelete} className="p-1 rounded hover:bg-gray-200" style={{ color: C.nok }} aria-label="Excluir o equipamento" title="Excluir"><Trash2 size={14} /></button>
      </div>
      {open && (
        <div className="p-3 space-y-3">
          {eq.sections.map(s => (
            <ChecklistSection key={s.id} title={s.titulo} items={s.items} onChange={items => updSection(s.id, items)} />
          ))}
        </div>
      )}
    </div>
  );
}

// CHECKLIST SECTION — sempre permite comentário e foto em todos os itens.
// onChange recebe uma FUNÇÃO (itens atuais → itens novos), como o setState do React: a foto termina de carregar
// depois de alguns segundos e precisa ser aplicada sobre a lista daquele momento (não sobre a lista de quando foi
// escolhida), senão apagaria status e observações marcados enquanto ela carregava.
const aplicarAtualizacao = (valor, atual) => (typeof valor === "function" ? valor(atual) : valor);
function ChecklistSection({ title, items, onChange }) {
  const mudaItens = (fn) => onChange(atuais => fn(atuais || []));
  const setItem = (id, patch) => mudaItens(lista => lista.map(i => i.id === id ? { ...i, ...patch } : i));
  const addFoto = async (id, file) => {
    if (!file) return;
    let p;
    try { p = await prepararArquivo(file); } catch { return; }
    mudaItens(lista => lista.map(i => i.id === id
      ? { ...i, fotos: [...(i.fotos || []), { id: Date.now() + Math.random(), data: p.data, legenda: "" }] }
      : i));
  };
  const updFoto = (id, fotoId, patch) => mudaItens(lista => lista.map(i => i.id === id ? { ...i, fotos: (i.fotos || []).map(f => f.id === fotoId ? { ...f, ...patch } : f) } : i));
  const delFoto = (id, fotoId) => mudaItens(lista => lista.map(i => i.id === id ? { ...i, fotos: (i.fotos || []).filter(f => f.id !== fotoId) } : i));

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
      <div className="px-3 py-2 text-sm font-bold text-white" style={{ background: C.orangeFill }}>{title}</div>
      <div className="divide-y" style={{ borderColor: C.border }}>
        {items.map(it => {
          const fotos = it.fotos || [];
          return (
            <div key={it.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 text-sm" style={{ color: C.gray }}>{it.texto}</div>
                <div className="flex gap-1 flex-shrink-0">
                  <StatusBtn label="OK"     color={C.ok}  active={it.status === "ok"}  onClick={() => setItem(it.id, { status: "ok" })} />
                  <StatusBtn label="NÃO OK" color={C.nok} active={it.status === "nok"} onClick={() => setItem(it.id, { status: "nok" })} />
                  <StatusBtn label="N/A"    color={C.na}  active={it.status === "na"}  onClick={() => setItem(it.id, { status: "na" })} />
                </div>
              </div>
              <textarea value={it.obs || ""} onChange={e => setItem(it.id, { obs: e.target.value })}
                placeholder={it.status === "nok" ? "Descreva a não conformidade…" : it.status === "na" ? "Justificativa para N/A…" : "Comentário ou observação (opcional)…"}
                rows={it.obs ? Math.max(2, Math.min(5, it.obs.split("\n").length)) : 1}
                className="w-full mt-2 px-2 py-1.5 text-xs border rounded resize-y"
                aria-label={`Observação: ${it.texto}`}
                style={{ borderColor: it.status === "nok" ? C.nok : C.border, background: it.status === "nok" ? C.nokLight : C.white, color: C.gray }} />
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <label className="cursor-pointer px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1" style={{ borderColor: C.orange, color: C.orangeDark }}>
                  <Camera size={12} /> Adicionar foto
                  <input type="file" accept="image/*" className="hidden"
                         onChange={e => { const f = e.target.files?.[0]; if (f) addFoto(it.id, f); e.target.value = ""; }} />
                </label>
                {fotos.length > 0 && <span className="text-[10px] font-semibold" style={{ color: C.grayMid }}>{fotos.length} foto{fotos.length > 1 ? "s" : ""}</span>}
              </div>
              {fotos.length > 0 && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {fotos.map(f => (
                    <div key={f.id} className="border rounded overflow-hidden relative group" style={{ borderColor: C.border }}>
                      <img src={f.data} alt={f.legenda || "Foto do item"} className="w-full h-24 object-cover" />
                      <button onClick={() => delFoto(it.id, f.id)} aria-label="Excluir foto" title="Excluir foto"
                              className="lsf-foto-del absolute top-1 right-1 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center transition" style={{ color: C.nok }}>
                        <X size={14} />
                      </button>
                      <input value={f.legenda} onChange={e => updFoto(it.id, f.id, { legenda: e.target.value })} aria-label="Legenda da foto"
                             placeholder="Legenda…" className="w-full px-1.5 py-1 text-[10px] border-t" style={{ borderColor: C.border, outline: "none" }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBtn({ label, color, active, onClick }) {
  const [fundo, texto] = corMarcada(color);
  return (
    <button onClick={onClick}
            className="px-2 py-1 rounded text-[10px] font-bold border transition"
            aria-pressed={!!active} style={{ background: active ? fundo : "transparent", color: active ? texto : color, borderColor: color }}>
      {label}
    </button>
  );
}

function StepCorretiva({ state, setState }) {
  const upd = (k, v) => setState(s => ({ ...s, [k]: v }));
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-black mb-2" style={{ color: C.gray }}>Ação corretiva</h2>
      <p className="text-xs mb-4" style={{ color: C.grayMid }}>Detalhe o problema diagnosticado, a ação aplicada e o resultado obtido.</p>
      <Field label="Diagnóstico / problema identificado">
        <textarea rows={5} value={state.diagnostico} onChange={e => upd("diagnostico", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <Field label="Ação corretiva aplicada">
        <textarea rows={5} value={state.acao} onChange={e => upd("acao", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <Field label="Resultado / estado final">
        <textarea rows={4} value={state.resultado} onChange={e => upd("resultado", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <Field label="Peças / materiais utilizados">
        <textarea rows={3} value={state.pecasUtilizadas} onChange={e => upd("pecasUtilizadas", e.target.value)} placeholder="Ex: 02 unid. Bateria 12V 150Ah; 01 unid. Relé 24V" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
    </div>
  );
}

function StepMaoObra({ maoObra, setMaoObra }) {
  const add = () => setMaoObra([...maoObra, { id: Date.now(), dataIni: "", dataFim: "" }]);
  const del = (id) => setMaoObra(maoObra.filter(m => m.id !== id));
  const upd = (id, patch) => setMaoObra(maoObra.map(m => m.id === id ? { ...m, ...patch } : m));
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Mão de obra</h2>
        <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
          <Plus size={14} /> Apontamento
        </button>
      </div>
      <div className="space-y-3">
        {maoObra.map((m, i) => (
          <div key={m.id} className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end" style={{ borderColor: C.border }}>
            <div className="text-xs font-bold uppercase" style={{ color: C.orangeDark }}>#{i + 1}</div>
            <Field label="Início"><input type="datetime-local" value={m.dataIni} onChange={e => upd(m.id, { dataIni: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} /></Field>
            <Field label="Fim"><input type="datetime-local" value={m.dataFim} onChange={e => upd(m.id, { dataFim: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} /></Field>
            <div className="text-xs text-center" style={{ color: C.grayMid }}>{m.dataIni && m.dataFim && <span style={{ color: C.gray }}>{calcHoras(m.dataIni, m.dataFim)}</span>}</div>
            <button onClick={() => del(m.id)} className="px-2 py-1 text-xs font-bold" style={{ color: C.nok }}>Remover</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepDeslocamento({ deslocs, setDeslocs }) {
  const add = () => setDeslocs([...deslocs, { id: Date.now(), dataIni: "", kmIni: "", dataFim: "", kmFim: "" }]);
  const del = (id) => setDeslocs(deslocs.filter(d => d.id !== id));
  const upd = (id, patch) => setDeslocs(deslocs.map(d => d.id === id ? { ...d, ...patch } : d));
  const totalKm = deslocs.reduce((acc, d) => acc + Math.max(0, (parseInt(d.kmFim) || 0) - (parseInt(d.kmIni) || 0)), 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Deslocamento</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm">Total: <span className="font-black text-base" style={{ color: C.orangeDark }}>{totalKm} km</span></div>
          <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
            <Plus size={14} /> Trecho
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {deslocs.map((d, i) => {
          const dif = (parseInt(d.kmFim) || 0) - (parseInt(d.kmIni) || 0);
          return (
            <div key={d.id} className="border rounded-lg p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end" style={{ borderColor: C.border }}>
              <div className="text-xs font-bold uppercase" style={{ color: C.orangeDark }}>#{i + 1}</div>
              <Field label="Início"><input type="datetime-local" value={d.dataIni} onChange={e => upd(d.id, { dataIni: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} /></Field>
              <Field label="Km inicial"><input type="number" value={d.kmIni} onChange={e => upd(d.id, { kmIni: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} /></Field>
              <Field label="Fim"><input type="datetime-local" value={d.dataFim} onChange={e => upd(d.id, { dataFim: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} /></Field>
              <Field label="Km final"><input type="number" value={d.kmFim} onChange={e => upd(d.id, { kmFim: e.target.value })} className="w-full border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} /></Field>
              <div className="text-xs text-center font-bold" style={{ color: dif > 0 ? C.gray : C.grayMid }}>
                {dif > 0 ? `${dif} km` : "—"}
                <button onClick={() => del(d.id)} className="block text-[10px] font-normal mt-1" style={{ color: C.nok }}>Remover</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepTreinamento({ trein, setTrein }) {
  const addPart = () => setTrein({ ...trein, participantes: [...trein.participantes, { id: Date.now(), nome: "", funcao: "", empresa: "", rg: "" }] });
  const delPart = (id) => setTrein({ ...trein, participantes: trein.participantes.filter(p => p.id !== id) });
  const updPart = (id, patch) => setTrein({ ...trein, participantes: trein.participantes.map(p => p.id === id ? { ...p, ...patch } : p) });
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Treinamento</h2>
      <label className="flex items-center gap-2 mb-4">
        <input type="checkbox" checked={trein.houve} onChange={e => setTrein({ ...trein, houve: e.target.checked })} style={{ accentColor: C.orange }} />
        <span className="text-sm font-semibold">Houve participação no treinamento?</span>
      </label>
      {trein.houve && (
        <div>
          <div className="flex justify-end mb-2">
            <button onClick={addPart} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orangeFill }}>
              <Plus size={14} /> Participante
            </button>
          </div>
          <div className="space-y-2">
            {trein.participantes.map(p => (
              <div key={p.id} className="border rounded-lg p-3 grid grid-cols-1 md:grid-cols-5 gap-2" style={{ borderColor: C.border }}>
                <input placeholder="Nome" value={p.nome} onChange={e => updPart(p.id, { nome: e.target.value })} className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                <input placeholder="Função" value={p.funcao || ""} onChange={e => updPart(p.id, { funcao: e.target.value })} className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                <input placeholder="Empresa" value={p.empresa} onChange={e => updPart(p.id, { empresa: e.target.value })} className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                <input placeholder="RG / Documento" value={p.rg} onChange={e => updPart(p.id, { rg: e.target.value })} className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: C.border }} />
                <button onClick={() => delPart(p.id)} className="text-xs font-bold" style={{ color: C.nok }}>Remover</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepObservacoes({ obs, setObs, tipo }) {
  const placeholders = {
    itm:        "Comentários adicionais sobre a inspeção/teste/manutenção realizada conforme NFPA 25…",
    inspecao:   "Após submeter inspeção dos equipamentos e acessórios, verificamos que…",
    preventiva: "Detalhe as atividades preventivas realizadas, materiais aplicados e estado dos equipamentos ao final…",
    corretiva:  "Comentários adicionais sobre a manutenção corretiva (além da ação registrada na aba específica)…",
    startup:    "Registre observações finais do start-up, pendências, ajustes realizados e recomendações para operação/manutenção…",
  };
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Observações e recomendações</h2>
      <textarea value={obs} onChange={e => setObs(e.target.value)} rows={14}
                placeholder={placeholders[tipo] || placeholders.inspecao}
                className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
    </div>
  );
}

function StepAssinaturas({ assins, setAssins, tecnicos = [], meuId = null }) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Assinaturas</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Responsável do cliente"><input value={assins.cliente} onChange={e => setAssins({ ...assins, cliente: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Técnico LS Fire"><CampoTecnico tecnicos={tecnicos} meuId={meuId} rotulo="técnico que assina" value={assins.tecnico} onPick={(nome) => setAssins({ ...assins, tecnico: nome })} /></Field>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <SignaturePad label="Assinatura do cliente" value={assins.clienteImg} onChange={img => setAssins(a => ({ ...a, clienteImg: img }))} />
        <SignaturePad label="Assinatura do técnico" value={assins.tecnicoImg} onChange={img => setAssins(a => ({ ...a, tecnicoImg: img }))} />
      </div>
      <div className="mt-3 text-[11px]" style={{ color: C.grayMid }}>
        A assinatura desenhada é opcional — se ficar em branco, o relatório sai com a linha para assinar à mão, como antes.
      </div>
      <div className="mt-6 p-4 rounded-lg" style={{ background: C.orangeLight, border: `1px solid ${C.orange}` }}>
        <div className="text-xs" style={{ color: C.gray }}>
          Ao finalizar, o relatório será gerado no padrão LS Fire, com cabeçalho institucional, código, revisão e rodapé com slogan "A FORÇA DA ÁGUA É A NOSSA FORÇA". Você poderá visualizar, imprimir ou salvar como PDF.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW DO RELATÓRIO — roteia para NFPA ou Padrao
// ═══════════════════════════════════════════════════════════════════════════
// Relatório → orçamento no LS Pricer: as não conformidades viram o escopo de uma proposta de serviço (SPV).
// Dentro do Pricer (moldura) avisa a janela de cima; aberto sozinho, abre o Pricer numa aba nova.
function abrirOrcamentoPricer(rel) {
  if (!rel || rel.id == null) return;
  if (window.top !== window) { window.top.postMessage({ tipo: "lsf-orcamento", relatorioId: String(rel.id) }, window.location.origin); return; }
  window.open("/?orcRel=" + encodeURIComponent(String(rel.id)), "_blank", "noopener");
}

function RelatorioPreview({ rel, onClose, onApprove, onReturn, autoPrint, onAutoPrinted }) {
  const { sessao } = useAuth();
  const isNFPA = rel.modo === "nfpa";
  const isStartup = rel.modo === "startup" || rel.tipo === "startup";
  const tipoCfg = TIPO_REL[rel.tipo];
  const approvalStatus = getRelApprovalStatus(rel);
  const isPendingApproval = approvalStatus !== "aprovado"; // bloqueia impressão/download: pendente OU devolvido
  const isDevolvido = approvalStatus === "devolvido";
  const canApproveReport = can(sessao?.perfil, "aprovarRelatorios");
  const [assinaturaSupervisor, setAssinaturaSupervisor] = useState(sessao?.nome || "");
  const [obsAprovacao, setObsAprovacao] = useState("");
  const [showDevolverForm, setShowDevolverForm] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");

  // Ajuste para celular: a folha A4 tem largura fixa (210mm ≈ 794px) e estoura
  // telas pequenas. Medimos a largura da janela e encolhemos a folha para caber,
  // via `zoom` numa media query de TELA apenas — a impressão/PDF continua A4 real.
  const [larguraJanela, setLarguraJanela] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setLarguraJanela(window.innerWidth);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
  }, []);
  // 794px = largura de uma folha A4 a 96dpi. Deixa uma pequena margem lateral.
  const zoomFolha = Math.min(1, (larguraJanela - 24) / 794);

  // Imprimir / gerar PDF abrindo HTML standalone em nova janela
  // (necessário porque window.print() direto não funciona no iframe sandbox)
  const gerarHtmlStandalone = () => {
    const root = document.getElementById("report-root");
    if (!root) return null;
    // Coleta todos os estilos do documento principal, incluindo as fontes
    // (o relatório impresso agora segue o mesmo padrão tipográfico do app:
    // Montserrat em títulos/subtítulos, Roboto Mono no corpo do texto).
    // (inclui o CSS do Tailwind já compilado no app: não precisa de script de fora na janela de impressão)
    let styles = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) styles += rule.cssText + "\n";
      } catch {}
    }
    // nada do CSS pode fechar a tag <style>
    styles = styles.replace(/<\/style/gi, "<\\/style");
    // Tudo o que vem dos dados entra escapado: esta janela é da mesma origem do app (document.write) e um nome de
    // cliente como "</title><script>…" rodaria script com a sessão do usuário. O corpo vem do DOM já renderizado
    // pelo React (innerHTML serializa o texto escapado).
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escHtml(rel.codigo)} - ${escHtml(rel.cliente)}</title>
<style>
${styles}
@page { size: A4; margin: 0; }
body { font-family: var(--font-body); background: #e5e5e5; margin: 0; padding: 16px; }
.page-break { page-break-after: always; }
@media print {
  body { background: white !important; margin: 0; padding: 0; }
  .page-break { page-break-after: always; box-shadow: none !important; margin: 0 !important; }
  .no-print { display: none !important; }
}
.print-bar { position: fixed; top: 10px; right: 10px; z-index: 9999; background: #FF6600; color: white; padding: 10px 16px; border-radius: 8px; font-weight: bold; font-family: Arial; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 6px; }
</style>
</head>
<body>
<button class="print-bar no-print" onclick="window.print()">🖨 Imprimir / Salvar como PDF</button>
${root.innerHTML}
</body>
</html>`;
  };

  const handlePrint = () => {
    if (isPendingApproval) {
      alert("Este relatório ainda aguarda assinatura/aprovação de supervisor/coordenador.");
      return;
    }
    const html = gerarHtmlStandalone();
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) {
      // Bloqueado por popup blocker — faz download como fallback
      handleDownload();
      alert("Não foi possível abrir nova janela (bloqueada pelo navegador). O arquivo HTML foi baixado — abra-o no navegador e use Ctrl+P para gerar o PDF.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Aguarda as imagens e fontes carregarem antes de imprimir
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 1500);
  };

  // Auto-impressão quando aberto pelo botão "Imprimir checklist" do cronograma
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => { handlePrint(); onAutoPrinted?.(); }, 500);
    return () => clearTimeout(t);
  }, [autoPrint]);

  const handleDownload = () => {
    if (isPendingApproval) {
      alert("Este relatório ainda aguarda assinatura/aprovação de supervisor/coordenador.");
      return;
    }
    const html = gerarHtmlStandalone();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rel.codigo}_${(rel.cliente || "relatorio").replace(/[^a-z0-9]/gi, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleApprove = () => {
    if (!assinaturaSupervisor.trim()) {
      alert("Informe a assinatura/nome do supervisor ou coordenador para aprovar.");
      return;
    }
    onApprove?.({ relatorioId: rel.id, assinatura: assinaturaSupervisor.trim(), observacao: obsAprovacao });
  };

  const dialogoRef = useDialogo(true, onClose);

  const handleDevolver = () => {
    if (!motivoDevolucao.trim()) {
      alert("Descreva o motivo da devolução, para o técnico saber o que corrigir.");
      return;
    }
    onReturn?.({ relatorioId: rel.id, motivo: motivoDevolucao.trim() });
    setShowDevolverForm(false);
    setMotivoDevolucao("");
  };

  return (
    <div ref={dialogoRef} role="dialog" aria-modal="true" aria-label={`Relatório ${rel.codigo || ""}`.trim()} tabIndex={-1}
         className="fixed inset-0 z-50 bg-gray-200 overflow-y-auto overflow-x-hidden outline-none">
      <div className="sticky top-0 bg-white border-b px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 z-10 print:hidden flex-wrap" style={{ borderColor: C.border }}>
        <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 shrink-0" aria-label="Voltar" title="Voltar"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase font-bold flex items-center gap-2 flex-wrap" style={{ color: C.orangeDark }}>
            <tipoCfg.Icon size={12} /> <span className="truncate">Preview — {tipoCfg.nomeLong}</span>
            <ApprovalBadge rel={rel} />
            {rel.freq && <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: FREQ_COLOR[rel.freq]?.bg, color: FREQ_COLOR[rel.freq]?.fg }}>{rel.freq}</span>}
          </div>
          <div className="font-bold text-sm truncate">{rel.codigo} — {rel.cliente}</div>
        </div>
        <button onClick={handleDownload} disabled={isPendingApproval} className="px-2.5 sm:px-3 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 disabled:opacity-40 shrink-0"
                style={{ borderColor: C.border, color: C.gray }} title={isPendingApproval ? "Aguardando aprovação do supervisor/coordenador" : "Baixar arquivo HTML para abrir no navegador"}>
          <span aria-hidden="true">⬇</span> <span className="hidden sm:inline">Baixar HTML</span><span className="sr-only sm:hidden">Baixar HTML</span>
        </button>
        {(window.__LSF_ME?.nivelPricer || 0) >= 2 && (
          <button onClick={() => abrirOrcamentoPricer(rel)} className="px-2.5 sm:px-3 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 shrink-0"
                  style={{ borderColor: C.orange, color: C.orangeDark }} title="Montar no LS Pricer a proposta de serviço com o que não está conforme neste relatório">
            <DollarSign size={14} /> <span className="hidden sm:inline">Orçar no Pricer</span><span className="sr-only sm:hidden">Orçar no Pricer</span>
          </button>
        )}
        <button onClick={handlePrint} disabled={isPendingApproval} className="px-3 sm:px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-40 shrink-0" style={{ background: C.orangeFill }}>
          <Printer size={14} /> <span className="hidden sm:inline">Imprimir / Salvar PDF</span><span className="sr-only sm:hidden">Imprimir / Salvar PDF</span>
        </button>
      </div>

      {isDevolvido && (
        <div className="mx-auto mt-4 max-w-4xl bg-white border rounded-xl p-4 print:hidden" style={{ borderColor: C.nok, color: C.gray }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: C.nok }} />
            <div className="flex-1">
              <div className="font-bold text-sm" style={{ color: C.nok }}>Devolvido para correção por {rel.aprovacao?.devolvidoPor || "supervisor/coordenador"}</div>
              <div className="text-xs mt-1" style={{ color: C.grayMid }}>{fmtDateTime(rel.aprovacao?.devolvidoEm)}</div>
              <div className="text-sm mt-3 p-3 rounded-lg" style={{ background: C.nokLight, color: C.nok }}>
                <span className="font-bold">Motivo: </span>{rel.aprovacao?.motivo || "—"}
              </div>
              <div className="text-xs mt-3" style={{ color: C.grayMid }}>O técnico responsável precisa reabrir o atendimento (aba Visitas técnicas ou cronograma do contrato), corrigir e reenviar para nova aprovação.</div>
            </div>
          </div>
        </div>
      )}

      {isPendingApproval && !isDevolvido && (
        <div className="mx-auto mt-4 max-w-4xl bg-white border rounded-xl p-4 print:hidden" style={{ borderColor: C.amber, color: C.gray }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: C.amber }} />
            <div className="flex-1">
          <div className="font-bold text-sm">Relatório aguardando assinatura e aprovação de supervisor/coordenador</div>
              <div className="text-xs mt-1" style={{ color: C.grayMid }}>O técnico finalizou o preenchimento. A impressão e o download ficam liberados após aprovação.</div>
              {canApproveReport ? (
                <>
                  <div className="grid md:grid-cols-3 gap-3 mt-3 items-end">
                    <Field label="Assinatura / supervisor ou coordenador">
                      <input value={assinaturaSupervisor} onChange={e => setAssinaturaSupervisor(e.target.value)}
                             className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
                    </Field>
                    <Field label="Observação da aprovação">
                      <input value={obsAprovacao} onChange={e => setObsAprovacao(e.target.value)}
                             className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
                    </Field>
                    <div className="flex gap-2">
                      <button onClick={handleApprove} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2" style={{ background: C.ok }}>
                        <ShieldCheck size={14} /> Aprovar
                      </button>
                      <button onClick={() => setShowDevolverForm(s => !s)} className="px-3 py-2 rounded-lg text-sm font-bold border flex items-center justify-center gap-2" style={{ borderColor: C.nok, color: C.nok }} title="Devolver para o técnico corrigir" aria-label="Devolver para o técnico corrigir" aria-expanded={showDevolverForm}>
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>
                  {showDevolverForm && (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: C.nokLight }}>
                      <Field label="Motivo da devolução (obrigatório — o técnico vai ver este texto)">
                        <textarea value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)} rows={2}
                               className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.nok }} />
                      </Field>
                      <button onClick={handleDevolver} className="mt-2 px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.nok }}>
                        <RefreshCw size={14} /> Devolver para correção
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs mt-3 p-2 rounded" style={{ background: C.grayLight, color: C.gray }}>Entre com perfil Administrador, Gestor, Coordenador ou Supervisor para aprovar.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {zoomFolha < 1 && (
        <style>{`
          @media screen and (max-width: 820px) {
            #report-root { zoom: ${zoomFolha}; }
          }
          @media print { #report-root { zoom: 1 !important; } }
        `}</style>
      )}
      <div className="py-8 flex flex-col items-center print:p-0 print:bg-white" id="report-root">
        {isStartup ? <ReportStartup rel={rel} /> : isNFPA ? <ReportNFPA rel={rel} /> : <ReportPadrao rel={rel} />}
      </div>
    </div>
  );
}

// Folha A4
function A4Sheet({ children }) {
  return (
    <div className="lsfire-app-shell lsf-papel bg-white shadow-md my-3 print:shadow-none print:my-0 print:break-after-page page-break"
         style={{ width: "210mm", minHeight: "297mm", fontFamily: "var(--font-body)", color: "#000", position: "relative", display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  );
}

// ─── HEADER / FOOTER LS Fire ──────────────────────────────────────────────
function ReportHeader({ rel }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr 110px", alignItems: "stretch",
      border: "1px solid #000", margin: "8mm 12mm 0 12mm",
    }}>
      <div style={{ padding: 8, borderRight: "1px solid #000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LogoLSFire size={28} />
      </div>
      <div style={{ padding: 8, borderRight: "1px solid #000", textAlign: "center" }}>
        <div className="font-display" style={{ fontSize: 11, fontWeight: 700 }}>RELATÓRIO TÉCNICO</div>
        <div className="font-display" style={{ fontSize: 12, fontWeight: 700, color: C.orangeDark }}>{TIPO_REL[rel.tipo]?.nomeLong.toUpperCase()}</div>
      </div>
      <div style={{ padding: 4, textAlign: "center", fontSize: 10 }}>
        <div style={{ fontWeight: 700 }}>{rel.codigo}</div>
        <div style={{ fontSize: 8 }}>Rev.: {rel.revisao}</div>
        <div style={{ borderTop: "1px solid #ccc", marginTop: 2, paddingTop: 2 }}>
          <div style={{ fontSize: 8 }}>Data:</div>
          <div style={{ fontSize: 9 }}>{fmtDate(rel.dataEmissao)}</div>
        </div>
      </div>
    </div>
  );
}

function ReportFooter() {
  return (
    <div style={{ marginTop: "auto", padding: "0 12mm 8mm" }}>
      <div style={{ borderTop: `3px solid ${C.orange}`, paddingTop: 6, textAlign: "center" }}>
        <div className="font-display" style={{ fontSize: 11, fontWeight: 900, color: C.orangeDark, letterSpacing: 1 }}>A FORÇA DA ÁGUA É A NOSSA FORÇA</div>
        <div style={{ fontSize: 9, color: C.gray }}>LS Fire | lsfire.com.br | Sistemas de Bombeamento para Combate a Incêndio</div>
      </div>
    </div>
  );
}

function ReportSectionTitle({ children }) {
  return <h1 style={{ fontSize: 18, fontWeight: 900, color: "#000", borderBottom: `3px solid ${C.orange}`, paddingBottom: 4, marginTop: 12, marginBottom: 10 }}>{children}</h1>;
}
function ReportSubTitle({ children }) {
  return <h2 style={{ fontSize: 13, fontWeight: 700, color: C.orangeDark, marginTop: 12, marginBottom: 6 }}>{children}</h2>;
}

function KVReportTable({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td style={{ border: "1px solid #BFBFBF", padding: "4px 8px", background: C.grayLight, fontWeight: 700, width: "35%" }}>{k}</td>
            <td style={{ border: "1px solid #BFBFBF", padding: "4px 8px" }}>{v || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryBox({ label, value, color }) {
  return (
    <div style={{ border: `2px solid ${color}`, borderRadius: 4, padding: 8, textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.gray, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function ChecklistReportTable({ items }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, marginBottom: 8 }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left", width: "55%" }}>ITEM DE VERIFICAÇÃO</th>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left" }}>STATUS / OBSERVAÇÃO</th>
        </tr>
      </thead>
      <tbody>
        {items.map(it => {
          const fotos = it.fotos || [];
          const statusLabel = it.status === "ok" ? "OK" : it.status === "nok" ? "NÃO OK" : it.status === "na" ? "N/A" : "—";
          const statusColor = it.status === "ok" ? C.ok : it.status === "nok" ? C.nok : it.status === "na" ? C.na : C.grayMid;
          const bg = it.status === "nok" ? "#FFE0E0" : it.status === "na" ? "#F0F0F0" : "#fff";
          return (
            <tr key={it.id}>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", verticalAlign: "top" }}>{it.texto}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", verticalAlign: "top", background: bg }}>
                <div style={{ fontWeight: 700, color: statusColor }}>{statusLabel}</div>
                {it.obs && <div style={{ fontStyle: "italic", marginTop: 2, fontSize: 8.5, whiteSpace: "pre-wrap" }}>{it.obs}</div>}
                {fotos.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginTop: 4 }}>
                    {fotos.map(f => (
                      <div key={f.id} style={{ border: "1px solid #BFBFBF" }}>
                        <img src={f.data} alt="" style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }} />
                        {f.legenda && <div style={{ fontSize: 7.5, padding: "2px 3px", borderTop: "1px solid #DDD", fontStyle: "italic", color: C.gray }}>{f.legenda}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ReportPage({ rel, children }) {
  return (
    <A4Sheet>
      <ReportHeader rel={rel} />
      <div style={{ padding: "10mm 12mm 6mm 12mm", flex: 1 }}>{children}</div>
      <ReportFooter />
    </A4Sheet>
  );
}

function ReportApprovalBox({ rel }) {
  const ap = rel.aprovacao;
  if (!ap || ap.status !== "aprovado") return null;
  return (
    <div style={{ marginTop: 20, border: `2px solid ${C.ok}`, padding: 10, fontSize: 10, background: C.okLight }}>
      <div style={{ fontWeight: 900, color: C.ok, marginBottom: 4 }}>RELATÓRIO APROVADO PELO SUPERVISOR/COORDENADOR</div>
      <div>Supervisor/Coordenador: <strong>{ap.supervisor || "—"}</strong></div>
      <div>Perfil: <strong>{ap.perfilAprovador || "—"}</strong></div>
      <div>Assinatura: <strong>{ap.assinatura || "—"}</strong></div>
      <div>Data/Hora da aprovação: <strong>{ap.aprovadoEm ? fmtDateTime(ap.aprovadoEm) : "—"}</strong></div>
      {ap.observacao && <div>Observação: {ap.observacao}</div>}
    </div>
  );
}

// ─── RELATÓRIO NFPA 25 ────────────────────────────────────────────────────
function ReportNFPA({ rel }) {
  const id = rel.identificacao;
  return (
    <>
      {/* Capa */}
      <A4Sheet>
        <div className="h-full flex flex-col items-center px-8" style={{ paddingTop: "55mm" }}>
          <LogoLSFire size={90} />
          <div style={{ height: 40 }} />
          <div className="text-center">
            <div className="font-display" style={{ fontSize: 22, fontWeight: 900, color: "#000", letterSpacing: -0.5 }}>RELATÓRIO TÉCNICO</div>
            <div className="font-display" style={{ fontSize: 30, fontWeight: 900, color: C.orangeDark, marginTop: 4, letterSpacing: -0.5 }}>INSPEÇÃO, TESTE E MANUTENÇÃO</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.gray, marginTop: 4 }}>Conforme NFPA 25 / NFPA 20</div>
          </div>
          <div style={{ height: 24 }} />
          {(() => {
            const freqs = getVisitaFreqs(rel);
            if (freqs.length === 0) return null;
            // Frequência "principal" (a menor / ritmo base) e demais
            const principal = freqs[0];
            return (
              <>
                <div style={{
                  padding: "12px 28px", background: FREQ_COLOR[principal]?.bg, color: FREQ_COLOR[principal]?.fg,
                  borderRadius: 8, fontSize: 22, fontWeight: 900, textTransform: "uppercase"
                }}>
                  Visita {principal}
                </div>
                {freqs.length > 1 && (
                  <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: "70%" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.grayMid, width: "100%", textAlign: "center", marginBottom: 4 }}>INSPEÇÕES REALIZADAS NESTA VISITA</div>
                    {freqs.map(f => (
                      <span key={f} style={{ padding: "4px 10px", background: FREQ_COLOR[f]?.bg, color: FREQ_COLOR[f]?.fg, borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          <div style={{ height: 30 }} />
          <div style={{ width: "70%", borderTop: `3px solid ${C.orange}` }} />
          <div style={{ height: 20 }} />
          <div style={{ fontSize: 26, fontWeight: 900, color: "#000", textAlign: "center" }}>{rel.cliente}</div>
          <div style={{ fontSize: 12, color: C.grayMid, fontStyle: "italic", marginTop: 8, textAlign: "center" }}>{id.local}</div>
          {rel.os && <div style={{ fontSize: 14, marginTop: 12, fontWeight: 700 }}>OS Nº {rel.os}</div>}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.grayMid, textTransform: "uppercase", letterSpacing: 1 }}>Período da Execução</div>
          <div style={{ fontSize: 16, color: "#000", marginTop: 4 }}>{fmtDate(id.periodoIni)} a {fmtDate(id.periodoFim)}</div>
          <div style={{ height: 30 }} />
        </div>
      </A4Sheet>

      {/* Página 1: Cabeçalho NFPA + Resumo */}
      <ReportPage rel={rel}>
        <ReportSectionTitle>FORMULÁRIO NFPA — DADOS DA INSPEÇÃO</ReportSectionTitle>

        {/* Cabeçalho oficial NFPA */}
        <div style={{ border: "2px solid #000", padding: 0, marginBottom: 12 }}>
          <div style={{ background: C.orangeFill, color: "#fff", padding: "6px 10px", fontWeight: 900, fontSize: 12, textAlign: "center", letterSpacing: 1 }}>
            INSPEÇÃO, TESTE E MANUTENÇÃO {rel.freq.toUpperCase()} DA BOMBA DE INCÊNDIO
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700, width: "20%" }}>Nome da Propriedade:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px", width: "30%" }}>{rel.cliente}</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700, width: "20%" }}>Inspetor:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px" }}>{id.inspetor}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700 }}>Endereço da Propriedade:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px" }}>{id.local}</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700 }}>Nº do Contrato:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px" }}>{id.contratoNum || "—"}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700 }}>Nº de Telefone:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px" }}>{id.telefone || "—"}</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700 }}>Data:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px" }}>{fmtDate(id.periodoIni)}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700 }}>OS Nº:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px" }}>{rel.os || "—"}</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px", background: C.grayLight, fontWeight: 700 }}>Frequência:</td>
                <td style={{ border: "1px solid #000", padding: "5px 8px", fontWeight: 900, color: C.orangeDark }}>{rel.freq}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ReportSubTitle>Resumo de Conformidade</ReportSubTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <SummaryBox label="OK" value={rel.stats.ok} color={C.ok} />
          <SummaryBox label="NÃO OK" value={rel.stats.nok} color={C.nok} />
          <SummaryBox label="N/A" value={rel.stats.na} color={C.na} />
          <SummaryBox label="Conformidade" value={rel.conformidade + "%"} color={C.orange} />
        </div>

        <ReportSubTitle>Escopo</ReportSubTitle>
        <p style={{ fontSize: 10, lineHeight: 1.5, textAlign: "justify" }}>
          Este relatório apresenta os resultados da inspeção, teste e manutenção <strong>{rel.freq.toLowerCase()}</strong> realizada conforme NFPA 25 e o formulário eletrônico NFPA 20. Cada item foi avaliado e classificado como Sim (OK), Não (NÃO OK) ou N/A. Os itens NÃO OK estão destacados e demandam ação corretiva.
        </p>
      </ReportPage>

      {/* Páginas dos grupos NFPA — agrupados por frequência (cumulativas) */}
      {(() => {
        // Agrupa por frequência preservando ordem Semanal → Anual
        const map = {};
        (rel.nfpaGroups || []).forEach(g => {
          const f = g.freq || rel.freq;
          if (!map[f]) map[f] = [];
          map[f].push(g);
        });
        const ordenado = FREQ_NFPA.filter(f => map[f]);
        return ordenado.map((f, fi) => (
          <ReportPage rel={rel} key={f}>
            <div style={{
              background: FREQ_COLOR[f]?.bg, color: FREQ_COLOR[f]?.fg,
              padding: "8px 12px", marginBottom: 12, borderRadius: 4,
              fontSize: 14, fontWeight: 900, textTransform: "uppercase",
              borderLeft: `4px solid ${FREQ_COLOR[f]?.fg}`,
            }}>
              Inspeção {f} — NFPA 25
            </div>
            {map[f].map((g, gi) => (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <ReportSubTitle>{fi + 1}.{gi + 1} {g.grupo}</ReportSubTitle>
                <ChecklistReportTable items={g.items} />
              </div>
            ))}
          </ReportPage>
        ));
      })()}

      {/* Mão de obra + Deslocamento */}
      <ReportPage rel={rel}>
        <ReportMaoObra rel={rel} />
        <ReportDeslocamento rel={rel} />
      </ReportPage>

      {/* Observações + Síntese de NÃO OKs */}
      <ReportPage rel={rel}>
        <ReportObservacoesNFPA rel={rel} />
      </ReportPage>

      {/* Teste de performance (curva NFPA 20), quando preenchido */}
      <ReportPerformanceSection rel={rel} />

      {/* Assinaturas (com bloco NFPA do contratado) */}
      <ReportPage rel={rel}>
        <ReportSectionTitle>ASSINATURAS</ReportSectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 30 }}>
          <SignatureBox label="ASSINATURA DO CLIENTE" name={rel.assins.cliente || "—"} sub="Cliente" img={rel.assins.clienteImg} />
          <SignatureBox label="ASSINATURA DO INSPETOR" name={rel.assins.tecnico || id.inspetor || "—"} sub="LS Fire — Inspetor Responsável" img={rel.assins.tecnicoImg} />
        </div>
        <ReportApprovalBox rel={rel} />
        <div style={{ marginTop: 30, border: "1px solid #BFBFBF", padding: 12, fontSize: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Informações do Contratado (conforme NFPA 25)</div>
          <div>Nome do Contratado: {id.contratado}</div>
          <div>Endereço do Contratado: {id.enderecoContratado}</div>
          <div>Licença / Certificação Nº: {id.licenca || "—"}</div>
        </div>
        <div style={{ marginTop: 30, borderTop: `2px solid ${C.orange}`, paddingTop: 10, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.grayMid, fontStyle: "italic" }}>Documento emitido pela LS Fire em {fmtDate(rel.dataEmissao)}.</div>
          <div style={{ fontSize: 9, color: C.grayMid, marginTop: 3 }}>{rel.codigo} — Revisão {rel.revisao}</div>
        </div>
      </ReportPage>
    </>
  );
}

function ReportObservacoesNFPA({ rel }) {
  const noks = [];
  (rel.nfpaGroups || []).forEach(g => g.items.forEach(i => {
    if (i.status === "nok") noks.push({ secao: g.grupo, item: i.texto, obs: i.obs });
  }));
  return (
    <>
      <ReportSectionTitle>OBSERVAÇÕES E NÃO CONFORMIDADES</ReportSectionTitle>
      <ReportSubTitle>Comentários Gerais</ReportSubTitle>
      <p style={{ fontSize: 10, lineHeight: 1.5, textAlign: "justify", whiteSpace: "pre-wrap" }}>
        {rel.obs || "Sem observações adicionais."}
      </p>
      {noks.length > 0 && (
        <>
          <ReportSubTitle>Síntese das Não Conformidades</ReportSubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Seção</th>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Item</th>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Observação</th>
              </tr>
            </thead>
            <tbody>
              {noks.map((n, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{n.secao}</td>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{n.item}</td>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: "#FFE0E0" }}>{n.obs || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function ReportStartup({ rel }) {
  const id = rel.identificacao;
  const startup = rel.startup || createStartupData(id?.inspetor || "");
  const eqChunks = chunkArray(startup.equipamentos || [], 2);
  const checklistGroups = startup.checklistGroups || [];
  const testes = (startup.testes || []).filter(isStartupTesteExecutado);
  const testesSectionStart = 3 + checklistGroups.length;
  const finalSection = testesSectionStart + testes.length;

  return (
    <>
      <A4Sheet>
        <div className="h-full flex flex-col items-center px-8" style={{ paddingTop: "58mm" }}>
          <LogoLSFire size={90} />
          <div style={{ height: 46 }} />
          <div className="text-center">
            <div className="font-display" style={{ fontSize: 26, fontWeight: 900, color: "#000", letterSpacing: -0.5 }}>RELATÓRIO TÉCNICO DE</div>
            <div className="font-display" style={{ fontSize: 38, fontWeight: 900, color: TIPO_REL.startup.color, marginTop: 4, letterSpacing: -0.5 }}>START-UP E COMISSIONAMENTO</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.gray, marginTop: 6 }}>CHECKLIST COMISSIONAMENTO - RQ 48</div>
          </div>
          <div style={{ height: 42 }} />
          <div style={{ width: "70%", borderTop: `3px solid ${C.orange}` }} />
          <div style={{ height: 20 }} />
          {rel.os && <div style={{ fontSize: 32, fontWeight: 900, color: C.gray }}>OS Nº {rel.os}</div>}
          <div style={{ height: 24 }} />
          <div style={{ fontSize: 26, fontWeight: 900, color: "#000", textAlign: "center" }}>{rel.cliente}</div>
          <div style={{ fontSize: 14, color: C.gray, marginTop: 8, textAlign: "center" }}>{startup.info.equipamento || id.empreendimento || "Sistema de bombeamento de incêndio"}</div>
          <div style={{ fontSize: 12, color: C.grayMid, fontStyle: "italic", marginTop: 8, textAlign: "center" }}>{startup.info.localInstalacao || id.local}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.grayMid, textTransform: "uppercase", letterSpacing: 1 }}>Período da Execução</div>
          <div style={{ fontSize: 16, color: "#000", marginTop: 4 }}>{fmtDate(id.periodoIni)} a {fmtDate(id.periodoFim)}</div>
          <div style={{ height: 40 }} />
        </div>
      </A4Sheet>

      <ReportPage rel={rel}>
        <ReportSectionTitle>1. INFORMAÇÕES GERAIS</ReportSectionTitle>
        <KVReportTable rows={[
          ["Cliente", rel.cliente],
          ["Equipamento", startup.info.equipamento || "—"],
          ["Técnico Responsável", startup.info.tecnicoResponsavel || id.responsavel || id.inspetor],
          ["Local de Instalação", startup.info.localInstalacao || id.local],
          ["Nº de Série", startup.info.numeroSerie || "—"],
          ["Norma", startup.info.norma || "—"],
          ["Ordem de Serviço Nº", rel.os || "—"],
          ["Início da Execução", fmtDate(id.periodoIni)],
          ["Fim da Execução", fmtDate(id.periodoFim)],
          ["Documento", rel.codigo],
          ["Revisão", rel.revisao],
          ["Data de Emissão", fmtDate(rel.dataEmissao)],
        ]} />

        <ReportSubTitle>Resumo de Conformidade</ReportSubTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <SummaryBox label="OK" value={rel.stats.ok} color={C.ok} />
          <SummaryBox label="NÃO OK" value={rel.stats.nok} color={C.nok} />
          <SummaryBox label="N/A" value={rel.stats.na} color={C.na} />
          <SummaryBox label="Conformidade" value={rel.conformidade + "%"} color={TIPO_REL.startup.color} />
        </div>

        <ReportSubTitle>Escopo da Entrega Técnica</ReportSubTitle>
        <p style={{ fontSize: 10, lineHeight: 1.5, textAlign: "justify", whiteSpace: "pre-wrap" }}>
          {startup.info.entrega || "Equipamentos instalados, comissionados, testados e entregues em funcionamento."}
        </p>
      </ReportPage>

      {eqChunks.map((chunk, pageIdx) => (
        <ReportPage rel={rel} key={`eq-${pageIdx}`}>
          <ReportSectionTitle>{pageIdx === 0 ? "2. EQUIPAMENTOS INSTALADOS" : "2. EQUIPAMENTOS INSTALADOS (CONT.)"}</ReportSectionTitle>
          {chunk.map(eq => <ReportStartupEquipamento key={eq.id} eq={eq} />)}
        </ReportPage>
      ))}

      {checklistGroups.map((g, i) => (
        <ReportPage rel={rel} key={g.id}>
          <ReportSectionTitle>{3 + i}. {g.grupo}</ReportSectionTitle>
          <ChecklistReportTable items={g.items} />
        </ReportPage>
      ))}

      {testes.map((teste, i) => (
        <ReportPage rel={rel} key={teste.id}>
          <ReportSectionTitle>{testesSectionStart + i}. {(teste.nome || "Teste de Performance").toUpperCase()} {teste.tag ? `- TAG: ${teste.tag}` : "- TAG: ____"}</ReportSectionTitle>
          <ReportStartupPerformance teste={teste} />
        </ReportPage>
      ))}

      <ReportPage rel={rel}>
        <ReportSectionTitle>{finalSection}. PARTICIPANTES DA ENTREGA TÉCNICA</ReportSectionTitle>
        <ReportStartupParticipantes trein={rel.trein} />

        <ReportSubTitle>Observações e Recomendações</ReportSubTitle>
        <p style={{ fontSize: 10, lineHeight: 1.5, textAlign: "justify", whiteSpace: "pre-wrap", minHeight: 70, border: "1px solid #BFBFBF", padding: 8 }}>
          {rel.obs || "Sem observações adicionais."}
        </p>

        <ReportSubTitle>Declaração de Aceite</ReportSubTitle>
        <p style={{ fontSize: 10, lineHeight: 1.5, textAlign: "justify", border: "1px solid #BFBFBF", padding: 8 }}>
          {STARTUP_DECLARACAO_ACEITE}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 28 }}>
          <SignatureBox label="ASSINATURA DO CLIENTE" name={rel.assins?.cliente || "—"} sub="Cliente / Responsável pelo aceite" img={rel.assins?.clienteImg} />
          <SignatureBox label="ASSINATURA DO TÉCNICO" name={rel.assins?.tecnico || startup.info.tecnicoResponsavel || "—"} sub="LS Fire — Técnico Responsável" img={rel.assins?.tecnicoImg} />
        </div>
        <ReportApprovalBox rel={rel} />
      </ReportPage>
    </>
  );
}

function ReportStartupEquipamento({ eq }) {
  const fields = STARTUP_EQUIPAMENTO_FIELDS[eq.tipo] || [];
  const rows = chunkArray(fields, 2);
  return (
    <div style={{ marginBottom: 12 }}>
      <ReportSubTitle>{eq.nome}</ReportSubTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
        <tbody>
          {rows.map((pair, i) => (
            <tr key={i}>
              {pair.map(f => (
                <Fragment key={f.key}>
                  <td style={{ border: "1px solid #BFBFBF", padding: "3px 5px", background: C.grayLight, fontWeight: 700, width: "20%" }}>{f.label}</td>
                  <td style={{ border: "1px solid #BFBFBF", padding: "3px 5px", width: "30%" }}>{eq.campos?.[f.key] || "—"}</td>
                </Fragment>
              ))}
              {pair.length === 1 && (
                <>
                  <td style={{ border: "1px solid #BFBFBF", padding: "3px 5px", background: C.grayLight }} />
                  <td style={{ border: "1px solid #BFBFBF", padding: "3px 5px" }} />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportStartupPerformance({ teste }) {
  const cfg = getNfpa20Config(teste);
  const fields = STARTUP_TEST_FIELDS[teste.tipo] || [];
  const isEletrica = teste.tipo === "eletrica";
  const filledLinhas = (teste.linhas || []).filter(linha => fields.some(f => hasFieldValue(linha?.[f.key])));
  const rows = filledLinhas.map(linha => ({
    ...linha,
    pitotMedio: calcPitotMedia(linha, cfg),
    vazao: flowFromGpm(calcVazaoLinha(linha, cfg), cfg.flowUnit),
    vazaoPitot: flowFromGpm(calcVazaoPeloPitot(linha, cfg), cfg.flowUnit),
    pressaoLiquida: pressureFromPsi(calcPressaoLiquida(linha, cfg), cfg.pressureUnit),
    pressaoAjustada: pressureFromPsi(calcPressaoAjustadaRpm(linha, cfg), cfg.pressureUnit),
    correnteMedia: calcCorrenteMedia(linha),
  }));
  const flowLabel = getUnitLabel("flow", cfg.flowUnit);
  const pressureLabel = getUnitLabel("pressure", cfg.pressureUnit);
  const pitotLabel = getUnitLabel("pitot", cfg.pitotUnit);
  const diameterLabel = getUnitLabel("diameter", cfg.diameterUnit);
  const oilPressureLabel = getUnitLabel("oilPressure", cfg.oilPressureUnit);
  const headers = [
    "Teste",
    "RPM",
    `Sucção (${pressureLabel})`,
    `Recalque (${pressureLabel})`,
    `Pitot méd. (${pitotLabel})`,
    `Vazão (${flowLabel})`,
    `P líquida (${pressureLabel})`,
    `P ajust. (${pressureLabel})`,
    "Temp. (°C)",
    ...(isEletrica ? ["A média (A)", "Tensão (V)"] : [`Pressão óleo (${oilPressureLabel})`]),
  ];
  return (
    <div>
      <ReportSubTitle>Dados do Ensaio NFPA 20</ReportSubTitle>
      <KVReportTable rows={[
        ["Título do ensaio", teste.nome || "Teste de Performance"],
        ["TAG", teste.tag || "____"],
        ["Acionamento", isEletrica ? "Motor elétrico" : "Motor diesel"],
        ["Conjunto", cfg.tipoConjunto === "certificado" ? "Certificado" : "Não certificado"],
        ["Operação", cfg.modoVelocidade === "variavel" ? "Velocidade variável" : "Velocidade constante"],
        ["Vazão nominal", cfg.vazaoNominalGpm ? `${cfg.vazaoNominalGpm} ${flowLabel}` : "—"],
        ["Pressão nominal", cfg.pressaoNominalPsi ? `${cfg.pressaoNominalPsi} ${pressureLabel}` : "—"],
        ["RPM nominal", cfg.rpmNominal || "—"],
        ["Bocal / coef.", `${cfg.diametroBocalPol || "—"} ${diameterLabel} / ${cfg.coefBocal || "—"}`],
        ["Curva anexada", cfg.curvaAnexada === "sim" ? "Sim" : cfg.curvaAnexada === "nao" ? "Não" : "Não informado"],
        ["Observação", cfg.observacaoCurva || "—"],
      ]} />

      <ReportSubTitle>Resultados Medidos e Calculados</ReportSubTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 6.7 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ border: "1px solid #BFBFBF", padding: "3px 3px", background: C.gray, color: "#fff", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ border: "1px solid #BFBFBF", padding: "8px", textAlign: "center", color: C.grayMid }}>
                Nenhuma medição preenchida para este ensaio.
              </td>
            </tr>
          )}
          {rows.map(linha => (
            <tr key={linha.id}>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px", fontWeight: 900, color: TIPO_REL.startup.color }}>{linha.teste}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{linha.rotacao || "—"}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{linha.pressaoSuccao || "—"}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{linha.pressaoRecalque || "—"}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{fmtMeasure(linha.pitotMedio, 1)}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{fmtMeasure(linha.vazao, 0)}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{fmtMeasure(linha.pressaoLiquida, 0)}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{fmtMeasure(linha.pressaoAjustada, 0)}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{linha.temperatura || "—"}</td>
              {isEletrica && <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{fmtMeasure(linha.correnteMedia, 0)}</td>}
              {!isEletrica && <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>{linha.pressaoOleo || "—"}</td>}
              {isEletrica && (
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 3px" }}>
                  {[linha.tensaoL12, linha.tensaoL23, linha.tensaoL13].filter(Boolean).join(" / ") || "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10 }}>
        <PumpCurveChart teste={teste} compact />
      </div>
      {isEletrica && (
        <div style={{ marginTop: 8 }}>
          <PumpPowerChart teste={teste} compact />
        </div>
      )}
    </div>
  );
}

function ReportStartupParticipantes({ trein }) {
  const participantes = trein?.participantes || [];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, marginBottom: 14 }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left" }}>Nome</th>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left" }}>Função</th>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left" }}>Empresa</th>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left" }}>Documento</th>
          <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", textAlign: "left" }}>Assinatura</th>
        </tr>
      </thead>
      <tbody>
        {(participantes.length ? participantes : [{ id: "blank", nome: "", funcao: "", empresa: "", rg: "" }]).map(p => (
          <tr key={p.id}>
            <td style={{ border: "1px solid #BFBFBF", padding: "8px 6px" }}>{p.nome || "—"}</td>
            <td style={{ border: "1px solid #BFBFBF", padding: "8px 6px" }}>{p.funcao || "—"}</td>
            <td style={{ border: "1px solid #BFBFBF", padding: "8px 6px" }}>{p.empresa || "—"}</td>
            <td style={{ border: "1px solid #BFBFBF", padding: "8px 6px" }}>{p.rg || "—"}</td>
            <td style={{ border: "1px solid #BFBFBF", padding: "8px 6px" }} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── SEÇÃO DE PERFORMANCE (reutilizável em ITM / Inspeção / Preventiva /
// Corretiva quando "Fazer teste de performance?" está marcado) ───────────────
// A performance usa a mesma estrutura de dados do relatório de Startup
// (equipamentos + testes), então reaproveitamos os mesmos componentes de
// renderização (ReportStartupEquipamento e ReportStartupPerformance).
function ReportPerformanceSection({ rel }) {
  const perf = rel.performance;
  if (!rel.fazerPerformance || !perf) return null;
  const equipamentos = perf.equipamentos || [];
  const testes = (perf.testes || []).filter(isStartupTesteExecutado);
  if (!equipamentos.length && !testes.length) return null;
  const eqChunks = chunkArray(equipamentos, 2);
  return (
    <>
      {eqChunks.map((chunk, pageIdx) => (
        <ReportPage rel={rel} key={`perf-eq-${pageIdx}`}>
          <ReportSectionTitle>{pageIdx === 0 ? "TESTE DE PERFORMANCE — EQUIPAMENTOS" : "TESTE DE PERFORMANCE — EQUIPAMENTOS (CONT.)"}</ReportSectionTitle>
          {chunk.map(eq => <ReportStartupEquipamento key={eq.id} eq={eq} />)}
        </ReportPage>
      ))}
      {testes.map((teste, i) => (
        <ReportPage rel={rel} key={`perf-teste-${teste.id || i}`}>
          <ReportSectionTitle>TESTE DE PERFORMANCE — {(teste.nome || "CURVA NFPA 20").toUpperCase()} {teste.tag ? `- TAG: ${teste.tag}` : ""}</ReportSectionTitle>
          <ReportStartupPerformance teste={teste} />
        </ReportPage>
      ))}
    </>
  );
}

// ─── RELATÓRIO PADRÃO (Inspeção / Preventiva / Corretiva) ────────────────
function ReportPadrao({ rel }) {
  const id = rel.identificacao;
  const tipoCfg = TIPO_REL[rel.tipo];
  const tituloCapa = rel.tipo === "preventiva" ? "MANUTENÇÃO PREVENTIVA"
                   : rel.tipo === "corretiva"  ? "MANUTENÇÃO CORRETIVA"
                   : "INSPEÇÃO TÉCNICA";

  return (
    <>
      {/* Capa */}
      <A4Sheet>
        <div className="h-full flex flex-col items-center px-8" style={{ paddingTop: "60mm" }}>
          <LogoLSFire size={90} />
          <div style={{ height: 60 }} />
          <div className="text-center">
            <div className="font-display" style={{ fontSize: 30, fontWeight: 900, color: "#000", letterSpacing: -0.5 }}>RELATÓRIO TÉCNICO DE</div>
            <div className="font-display" style={{ fontSize: 38, fontWeight: 900, color: C.orangeDark, marginTop: 4, letterSpacing: -0.5 }}>{tituloCapa}</div>
          </div>
          <div style={{ height: 50 }} />
          <div style={{ width: "70%", borderTop: `3px solid ${C.orange}` }} />
          <div style={{ height: 20 }} />
          {rel.os && <div style={{ fontSize: 36, fontWeight: 900, color: C.gray }}>OS Nº {rel.os}</div>}
          <div style={{ height: 30 }} />
          <div style={{ fontSize: 26, fontWeight: 900, color: "#000", textAlign: "center" }}>{rel.cliente}</div>
          {id.empreendimento && <div style={{ fontSize: 18, color: C.gray, marginTop: 6 }}>{id.empreendimento}</div>}
          <div style={{ fontSize: 12, color: C.grayMid, fontStyle: "italic", marginTop: 8, textAlign: "center" }}>{id.local}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.grayMid, textTransform: "uppercase", letterSpacing: 1 }}>Período da Execução</div>
          <div style={{ fontSize: 16, color: "#000", marginTop: 4 }}>{fmtDate(id.periodoIni)} a {fmtDate(id.periodoFim)}</div>
          <div style={{ height: 40 }} />
        </div>
      </A4Sheet>

      {/* Página: Info Gerais */}
      <ReportPage rel={rel}>
        <ReportSectionTitle>1. INFORMAÇÕES GERAIS</ReportSectionTitle>
        <KVReportTable rows={[
          ["Cliente", rel.cliente],
          ["Empreendimento", id.empreendimento || "—"],
          ["Local da Execução", id.local],
          ["Ordem de Serviço Nº", rel.os || "—"],
          ["Início da Execução", fmtDate(id.periodoIni)],
          ["Fim da Execução", fmtDate(id.periodoFim)],
          ["Responsável Técnico", id.responsavel],
          ["Tipo de Serviço", tipoCfg.nomeLong],
          ["Documento", rel.codigo],
          ["Revisão", rel.revisao],
          ["Data de Emissão", fmtDate(rel.dataEmissao)],
        ]} />
        <ReportSubTitle>Resumo de Conformidade</ReportSubTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <SummaryBox label="OK" value={rel.stats.ok} color={C.ok} />
          <SummaryBox label="NÃO OK" value={rel.stats.nok} color={C.nok} />
          <SummaryBox label="N/A" value={rel.stats.na} color={C.na} />
          <SummaryBox label="Conformidade" value={rel.conformidade + "%"} color={C.orange} />
        </div>
      </ReportPage>

      {/* Páginas das Casas de Bombas */}
      {(rel.casas || []).map((casa, idx) => (
        <ReportCasa key={casa.id} rel={rel} casa={casa} index={idx + 2} />
      ))}

      {/* Ação Corretiva (se for Corretiva) */}
      {rel.tipo === "corretiva" && rel.corretiva && (
        <ReportPage rel={rel}>
          <ReportSectionTitle>{(rel.casas?.length || 0) + 2}. AÇÃO CORRETIVA APLICADA</ReportSectionTitle>
          <ReportSubTitle>Diagnóstico / Problema Identificado</ReportSubTitle>
          <p style={{ fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: 8, border: "1px solid #BFBFBF" }}>{rel.corretiva.diagnostico || "—"}</p>
          <ReportSubTitle>Ação Aplicada</ReportSubTitle>
          <p style={{ fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: 8, border: "1px solid #BFBFBF" }}>{rel.corretiva.acao || "—"}</p>
          <ReportSubTitle>Resultado / Estado Final</ReportSubTitle>
          <p style={{ fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: 8, border: "1px solid #BFBFBF" }}>{rel.corretiva.resultado || "—"}</p>
          <ReportSubTitle>Peças / Materiais Utilizados</ReportSubTitle>
          <p style={{ fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: 8, border: "1px solid #BFBFBF" }}>{rel.corretiva.pecasUtilizadas || "—"}</p>
        </ReportPage>
      )}

      {/* Mão de Obra + Deslocamento */}
      <ReportPage rel={rel}>
        <ReportMaoObra rel={rel} />
        <ReportDeslocamento rel={rel} />
      </ReportPage>

      {/* Observações */}
      <ReportPage rel={rel}>
        <ReportObservacoesPadrao rel={rel} />
      </ReportPage>

      {/* Teste de performance (curva NFPA 20), quando preenchido */}
      <ReportPerformanceSection rel={rel} />

      {/* Assinaturas */}
      <ReportPage rel={rel}>
        <ReportSectionTitle>ASSINATURAS</ReportSectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 30 }}>
          <SignatureBox label="ASSINATURA DO CLIENTE" name={rel.assins.cliente || "—"} sub="Cliente" img={rel.assins.clienteImg} />
          <SignatureBox label="ASSINATURA DO TÉCNICO" name={rel.assins.tecnico || "—"} sub="LS Fire — Técnico Responsável" img={rel.assins.tecnicoImg} />
        </div>
        <ReportApprovalBox rel={rel} />
        <div style={{ marginTop: 60, borderTop: `2px solid ${C.orange}`, paddingTop: 10, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.grayMid, fontStyle: "italic" }}>Documento emitido pela LS Fire em {fmtDate(rel.dataEmissao)}.</div>
          <div style={{ fontSize: 9, color: C.grayMid, marginTop: 3 }}>{rel.codigo} — Revisão {rel.revisao}</div>
        </div>
      </ReportPage>
    </>
  );
}

function ReportCasa({ rel, casa, index }) {
  return (
    <A4Sheet>
      <ReportHeader rel={rel} />
      <div style={{ padding: "10mm 12mm 6mm 12mm", flex: 1 }}>
        <ReportSectionTitle>{index}. CASA DE BOMBAS {casa.nome}</ReportSectionTitle>
        <ReportSubTitle>{index}.1 Instalação do Skid / Container</ReportSubTitle>
        <ChecklistReportTable items={casa.instalacao} />
        {casa.equipamentos.map((eq, i) => (
          <div key={eq.id} style={{ marginTop: 12 }}>
            <ReportSubTitle>{index}.{i + 2} {eq.nome}</ReportSubTitle>
            {eq.sections.map(s => (
              <div key={s.id} style={{ marginBottom: 6 }}>
                <div style={{ background: C.orangeFill, color: "#fff", padding: "4px 8px", fontSize: 10, fontWeight: 700 }}>{s.titulo.toUpperCase()}</div>
                <ChecklistReportTable items={s.items} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <ReportFooter />
    </A4Sheet>
  );
}

function ReportMaoObra({ rel }) {
  return (
    <>
      <ReportSectionTitle>CONTROLE DE MÃO DE OBRA</ReportSectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", width: 50 }}>#</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Início</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Fim</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", width: 80 }}>Horas</th>
          </tr>
        </thead>
        <tbody>
          {rel.maoObra.map((m, i) => (
            <tr key={m.id}>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", textAlign: "center" }}>{i + 1}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{fmtDateTime(m.dataIni)}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{fmtDateTime(m.dataFim)}</td>
              <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", textAlign: "center", fontWeight: 700 }}>{calcHoras(m.dataIni, m.dataFim)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ReportDeslocamento({ rel }) {
  const total = rel.deslocs.reduce((acc, d) => acc + Math.max(0, (parseInt(d.kmFim) || 0) - (parseInt(d.kmIni) || 0)), 0);
  return (
    <>
      <ReportSectionTitle>CONTROLE DE DESLOCAMENTO</ReportSectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", width: 40 }}>#</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Início</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Km Inicial</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Fim</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Km Final</th>
            <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", width: 80 }}>Distância</th>
          </tr>
        </thead>
        <tbody>
          {rel.deslocs.map((d, i) => {
            const dif = (parseInt(d.kmFim) || 0) - (parseInt(d.kmIni) || 0);
            return (
              <tr key={d.id}>
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", textAlign: "center" }}>{i + 1}</td>
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{fmtDateTime(d.dataIni)}</td>
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", textAlign: "right" }}>{d.kmIni || "—"}</td>
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{fmtDateTime(d.dataFim)}</td>
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", textAlign: "right" }}>{d.kmFim || "—"}</td>
                <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", textAlign: "center", fontWeight: 700 }}>{dif > 0 ? `${dif} km` : "—"}</td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={5} style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.orangeBg, textAlign: "right", fontWeight: 700 }}>TOTAL</td>
            <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.orangeBg, textAlign: "center", fontWeight: 900, color: C.orangeDark }}>{total} km</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function ReportObservacoesPadrao({ rel }) {
  const noks = [];
  (rel.casas || []).forEach(casa => {
    casa.instalacao.forEach(i => { if (i.status === "nok") noks.push({ casa: casa.nome, secao: "Instalação", item: i.texto, obs: i.obs }); });
    casa.equipamentos.forEach(eq => eq.sections.forEach(s => s.items.forEach(i => {
      if (i.status === "nok") noks.push({ casa: casa.nome, secao: `${eq.nome} / ${s.titulo}`, item: i.texto, obs: i.obs });
    })));
  });
  return (
    <>
      <ReportSectionTitle>OBSERVAÇÕES E RECOMENDAÇÕES</ReportSectionTitle>
      <p style={{ fontSize: 10, lineHeight: 1.5, textAlign: "justify", whiteSpace: "pre-wrap" }}>
        {rel.obs || "Após inspeção dos equipamentos e acessórios, verificamos que os equipamentos encontram-se com funcionamento adequado, exceto os itens NÃO OK identificados neste Relatório Técnico."}
      </p>
      {noks.length > 0 && (
        <>
          <ReportSubTitle>Síntese das Não Conformidades</ReportSubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff", width: 60 }}>Casa</th>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Seção</th>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Item</th>
                <th style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.gray, color: "#fff" }}>Observação</th>
              </tr>
            </thead>
            <tbody>
              {noks.map((n, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{n.casa}</td>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{n.secao}</td>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px" }}>{n.item}</td>
                  <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: "#FFE0E0" }}>{n.obs || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function SignatureBox({ label, name, sub, img }) {
  return (
    <div style={{ border: "1px solid #BFBFBF", padding: 12, textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.gray, marginBottom: img ? 4 : 40 }}>{label}</div>
      {img && <img src={img} alt="Assinatura" style={{ height: 50, maxWidth: "90%", objectFit: "contain", margin: "0 auto", display: "block" }} />}
      <div style={{ borderTop: "1px solid #000", marginTop: img ? 4 : 50, paddingTop: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 9, color: C.grayMid, fontStyle: "italic" }}>{sub}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGURANÇA — Trilha de auditoria (login, usuários e permissões ficam no servidor)
// ═══════════════════════════════════════════════════════════════════════════
function AuditoriaView({ auditoria }) {
  const [filtro, setFiltro] = useState("");
  const filtrada = useMemo(() => {
    if (!filtro) return auditoria;
    const q = filtro.toLowerCase();
    return auditoria.filter(a =>
      (a.usuario || "").toLowerCase().includes(q) ||
      (a.acao || "").toLowerCase().includes(q) ||
      (a.detalhe || "").toLowerCase().includes(q)
    );
  }, [auditoria, filtro]);

  const ACAO_COR = {
    login: C.ok, logout: C.grayMid, bloqueio: C.amber, desbloqueio: C.blue,
    contrato_criado: C.ok, contrato_editado: C.blue, contrato_excluido: C.nok,
    tecnico_criado: C.ok, tecnico_editado: C.blue, tecnico_excluido: C.nok,
    usuario_criado: C.ok, usuario_editado: C.blue, usuario_excluido: C.nok,
    relatorio_criado: C.orange, despacho: C.purple, visita_agendada: C.blue,
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Trilha de auditoria</h1>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.grayMid }} />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar por usuário, ação…"
                 className="border rounded-lg pl-9 pr-3 py-2 text-sm w-64" style={{ borderColor: C.border }} />
        </div>
      </div>
      <p className="text-sm mb-6" style={{ color: C.grayMid }}>Registro das ações realizadas no sistema ({auditoria.length} eventos).</p>

      {filtrada.length === 0 && (
        <div className="border-2 border-dashed rounded-xl p-16 text-center" style={{ borderColor: C.border }}>
          <ScrollText size={48} className="mx-auto mb-3" style={{ color: C.grayMid }} />
          <div className="text-base font-bold mb-1" style={{ color: C.gray }}>Nenhum evento registrado</div>
        </div>
      )}

      {filtrada.length > 0 && (
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: C.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: C.grayLight }}>
                <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: C.grayMid }}>Data / Hora</th>
                <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: C.grayMid }}>Usuário</th>
                <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: C.grayMid }}>Ação</th>
                <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: C.grayMid }}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map(a => (
                <tr key={a.id} className="border-t" style={{ borderColor: C.border }}>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: C.grayMid }}>{fmtDateTime(a.timestamp)}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <div className="font-semibold" style={{ color: C.gray }}>{a.usuario}</div>
                    <div className="text-[10px]" style={{ color: PERFIS[a.perfil]?.cor || C.grayMid }}>{PERFIS[a.perfil]?.nome || a.perfil}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Pill bg={`color-mix(in srgb, ${ACAO_COR[a.acao] || C.gray} 14%, transparent)`} fg={ACAO_COR[a.acao] || C.gray}>{a.acao}</Pill>
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.gray }}>{a.detalhe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
