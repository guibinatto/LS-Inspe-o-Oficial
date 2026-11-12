"use client";

import { useState, useMemo, useEffect, useRef, createContext, useContext, Fragment } from "react";
import {
  Home, FileText, Calendar, Users, ClipboardList, ClipboardCheck,
  Plus, X, ChevronRight, ChevronDown, ChevronLeft, MoreVertical,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Search,
  Flame, Wrench, Truck, MessageSquare, PenLine,
  ArrowLeft, Building2, User, Camera,
  Printer, Trash2, Eye, MapPin, Phone, Clock, DollarSign,
  CalendarDays, Pencil, Save, FilePlus2, History,
  Lock, LogOut, Shield, ShieldCheck, KeyRound, EyeOff, UserCog, ScrollText,
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
function irParaLogin() { try { window.top.location.replace("/login?volta=" + encodeURIComponent("/servico/")); } catch { window.location.replace("/login?volta=/servico/"); } }

// Token de app compartilhado entre servidor e todos os dispositivos instalados,
// definido em tempo de build (import.meta.env.VITE_SYNC_TOKEN). Impede que
// qualquer pessoa que descubra a URL do servidor grave dados em /api/sync sem
// ter uma cópia instalada do app. Ver server.js (variável SYNC_TOKEN) e o guia
// de instalação para como gerar/rotacionar este valor.
// Lido via variável global substituída em tempo de build pelo Vite (ver web/vite.config.js,
// bloco "define"). Usar `typeof` numa variável não declarada nunca lança erro em JS — por
// isso este arquivo continua funcionando normalmente fora de um build Vite (ex.: pré-visualização).
const SYNC_TOKEN = (typeof __VITE_SYNC_TOKEN__ !== "undefined" && __VITE_SYNC_TOKEN__) || "";

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

  const readKv = async (key) => {
    try {
      const stored = await idbGet(KV_STORE, key);
      if (stored) return stored;
    } catch {}

    const legacy = window.localStorage.getItem(localKey(key));
    if (legacy == null) return null;

    try { await idbPut(KV_STORE, { key, value: legacy, updatedAt: new Date().toISOString() }); } catch {}
    return { key, value: legacy };
  };

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
  };

  const clearSyncItem = async (key) => {
    try { await idbDelete(SYNC_STORE, key); }
    catch {
      const queue = getLocalQueue();
      delete queue[key];
      setLocalQueue(queue);
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

    try { await idbPut(KV_STORE, { key, value, updatedAt: new Date().toISOString() }); } catch {}
    try { window.localStorage.setItem(localKey(key), value); } catch {}

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

  const syncNow = async () => {
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
    if (payload?.data) {
      for (const [key, item] of Object.entries(payload.data)) {
        if (SYNCABLE_KEYS.has(key)) await setKv(key, item.value, { enqueue: false });
      }
    }

    await Promise.all(pending.map((item) => clearSyncItem(item.key)));
    const lastSync = payload?.serverTime || new Date().toISOString();
    await setKv(SYNC_META_KEY, JSON.stringify({ lastSync }), { enqueue: false });
    return { ok: true, pending: 0, lastSync };
  };

  window.offlineSync = {
    syncNow,
    getQueue,
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
      try { window.localStorage.removeItem(localKey(key)); } catch {}
      if (SYNCABLE_KEYS.has(key)) await enqueueSync(key, "", "delete");
      return { ok: true };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGO LS FIRE
// ═══════════════════════════════════════════════════════════════════════════
const LOGO_LSFIRE_DATAURL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAEqAlgDASIAAhEBAxEB/8QAHQABAAIBBQEAAAAAAAAAAAAAAAcIBgECAwQFCf/EAFcQAAEDAgIEBQwPBgQFAwUBAAEAAgMEBQYRBxIhMQgTQVFhFiI3VnGBkZKUobHRFBcYMkJSU1Vic3WVs8HSFSNyk7LhM1SCojQ1Q0XCJWNlJDZEdIOk/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAUGAQQHAgP/xAA9EQACAQICBQkGBQQCAwEAAAAAAQIDBAURBhIhMVETQWFxkaGxwdEUIjJTgeEVFkJS8CMzNfFDYiQ0ooL/2gAMAwEAAhEDEQA/ALloiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCwLTtixuE8A1k0UgbX1oNLRjl13Da7/S3M93JZ1NLHDE6SV7WMYC5znHINA3knmVNdN+OHY2xjJPTPd+y6LOCibyObn10mXO4+YBaV/cqhSeW97icwDDHf3aTXuR2v0+pnvBEv74rpdcMyyExTRCsgBO57SGvy7oLT3lZBUz4PlY6i0vWMg5Cd8kDukOjd+YCuW3cvjhVTWoZPmZt6W26pX+sv1JPy8jVERSZWAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAtsr2Rxuke4NY0EucTkABykrpX6722yWua5XWrjpaWEZvkedncHOTyAbSqvaWdKtzxfJJbbdxtBZAcuKzykqOmQjk+ju581p3d7TtY5y38CVwvCK+I1NWmsore+ZffoM50q6bWxSSWbBUjZZieLkuJGbWnPLKIH3x+kdnNnvU40Zk9iw8YSX6jdYnny2qmeiqxPxFj+0W0MLouPE0/RHH1zvQB31dJauGXFW516k93MiR0isbaw5K3or3sm2+d55ZeDCIilishERAFo45DNCQFBunDTDFbo58O4UqWyV5zjqa2M5tp+drDyv6dze7u+NevChDXmzcsbGtfVVSorN9y6Webwk9JYcyfBVinBJ625zsO7/2QR/u8HOq9nnXI8lzi5xJJOZJOZJW1VK5upXFTXkdcwzDaWH0FShv53xZlWhvP21cM5fODPQVdxu5Uw0EUpqtLmHmNGepO6U9xsbirnt3Kbwb+1J9JSNM3/wCXTX/XzZqiIpgpwREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAF42McS2rCtllut2qBFCzY1o2vldyMaOUn+5W/FuILbhixz3e6TcXBENgHvpHHcxo5XFVH0g4vumM74643BxZCzNtNTNObIGcw5yeU8vcUbiGIRtI5LbJ7kTmC4LPEamb2QW9+S6Tl0k45u2Nrrx9a4wUUTj7Fo2uzZEOc/GceU+DILESMt+5chG1elhi40dpvlNca61x3SKB2uKaSQsa5w3E5A5gHbluKp86kq1TWm9/OdRp0IWlDUoQ2Lclz9vmWE4OGCJLDY34guUJZcLkwcWx4ydFBvA6C47T0ZKXVBlLwhqENAqsL1TOfiaprh5wF6MPCDws4fvbReWHoZG7/AMlbbW7s6NNQhNZI5piGGYrd15VqlJ5vu6CYkUQP4QWEQOstl6cebiox/wCa8m5cImia0i3YZqpHchqKlrB4GgrYeI2q/WjUhgOIyeSpMnUkALxMV4rsGF6L2VfLnBSNI6xjjnJJ0NYNp7wVa8S6b8b3Vro6OaltETtn/wBLHm/L+N2Z8ACjavq6uvqn1VdUzVVQ/a6WaQve7uk7VoV8bpxWVJZsm7LQ+vNp3MlFcFtfp4ko6UtNN1xIyW12Bs1ptbs2vk1sqidvSR7xvQNvOeRRIRsW8he7gjCF7xjdm2+z0xfkRx07gRFAOdzvy3lQlStVuqnvbWXW2trXDKD1EoxW9vzZjpW1e3jKht9txPX221zuqaSkl4lkzj/iFoAc7uFwcvGIXyktWTi+Y36VRVYKcdzWZLXBTtpq9I89eW9bQ0L3A/SeQ0ebWVqhuUM8FGwPoMHVl8nZqvuk+UWe/io82g99xcpmVswynqW6z59pyjSa5VfEZ5PZHJdm/vzCIikCACIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiALiqp4qenknnkbHFG0ve9xyDWgZkk82S5VDnCWxU632SDDNJKWz3AcZUkHaIAd3+p2zuAr4XVxG3pSqS5jbsbSd5cRow5/DnZFWl3G8+M8QufE97LVSuLaOI7MxyyEfGd5hkOdYQQt5C0IVArV51pupN7Wditbana0o0aaySNhC2EeFchWYYT0Z4wxIGS0lrdTUrt1RVnimEc4B6494LNKnOq9WCbZ6r3NK3jrVZKK6TCu6trm7M+RWHw/wAH63Rhsl+vlRUu+FFSMETPGOZPmWeWXRfgW1Bpgw7SSvb8OpBmd/uJClaWCXE9sso/zoK7caW2NLZTzl1LJd/oU8ijkndqwsfK7mY0uPmXrUWE8UVuXsTDl3mB3FtG/LwkK69Hb6KjaGUlJT07RuEUTWDzBdjJb8MBX6p9xF1NNJ/8dLtf2KbUui/H9ScmYWr2Z/K6rPS4L3bXoJx3WPHsmO329p3mapDiO8wH0q1L3xxtc97mta0ZuJOQA6So1xxpowrh/jKa3yG9VzdmpSuHFNP0pN3i5r6Twq0oLWqyeXWfGlpLil5Lk7ems+hN+LyMfw1oBsNvAqsS3aa46g1nRR/uIQBvzOZcR3wvG0maUbLY7NJhHR1FTwsyMc1ZTN1Y4xuIjPwnH4/JyZnaI7x7pIxRjFzoq+s9jUBOyips2xf6uV/f8CwxaFa+pU04WscunnJu1wa5uJqtiVTWa3R5l183YbCsh0e4Tr8ZYnp7PRBzWE69TNlshiB2uPTyAcpW7A2Dr5jK7Chs9MXNaRx9Q8ZRQDncefoG0q2ujfBNqwTYxb7e3jJpMnVNS9vXzv5zzAcg5F5w+xlcy1pfCu82Mcx2nh9N06bzqPcuHS/JHvWe3UtqtdLbaGIRU1LE2KJg5GgZBdtEVtSSWSOVNuTze8IiLJgIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAVTzSle3Ygx5dbgH60ImMMHRGzrR4cie+rV40uBteFLrcQcnU9HLI09IacvPkqYnPLrjmeUqtaRVmowprn2l10NtlKpUrPmyS+u84yshwNgy94wuBprVBlCw/v6qTMRRDpPKegbV39F+CKzGl99jtLobfAQ6rqAPeg7mt+kfNvVqsP2e32K1Q2y10rKalhGTGN9JPKTykqPwzC3df1J7I+JMY5pArD+jR21O5ffoMQwForw1hdsc76dtyuI2mqqGg6p+g3c3znpWfaoWqK4UaFOjHVprJHObi5rXM9erJt9IRFhGkrSRY8GQGGY+zLm9ucdHE7rugvPwG+c8gWalWFKLlN5IxQoVLiap0lm2ZnUzxU0D555WRRMGs973BrWjnJOwKJ8cacrDajJS4fi/bNWNnGA6lO0/wAW93e2dKhHHOOsRYwnJulYW0oOcdHDm2Fne+Eek595YqQq7d45J+7QWXSy8YbojBZTu3m+C3fV+hkmM8eYpxXI5t3ucnsYnMUsH7uEf6R77/VmsWXp2Wz3O+VraG0UFRW1DvgQszy6SdwHSVMOCtANTNqVOLLgIGb/AGJSODnnoc87B3ge6oylRubyWaTfSyxV7ywwqnqNqK4Lf2ebIRoKKsuNWykoKWaqqJDk2KFhe494KZtH2gaurHR1uL5zRwe+9hQOzld0Pfub3BmekKc8L4WsOGaT2NZLZBRtI69zRm9/S5x2nvle0p61waEPeqvN8OYp+I6W1qycLZai48/ov5tPPsNmtljtsdutNFDR0sY62OJuQz5zznpO1egiKaSUVkioylKbcpPNsIiLJ5CIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiLoXi72y0UxqLpX01FEB76aQNB7me/vLDaSzZlRcnkjvooxvumrCtEXR2+Osukg3GNnFsP+p35BYdcNN+IqyUxWeyUcJO4O153+AZehRtXGLOlsc830bSXoYDf1tqp5Lp2eJP6LBNEV9xdfKKrlxRbBStY5vsaXiDCZAQdbrSdw2bdm9Z2t2hWjXpqpHc+JHXNvK3qulJptcHmjC9N0hi0W31w3mFrfC9oVVKSmnrayGjpozJPPI2ONg3ucTkArW6a4XTaL741ozIga/xXtP5KG+DtY23LHZuErA6K2QmUZjZxjutb/wCR7yreM0ZV76nTXOvN5lz0cuo2mGVqz/S34LLvJ10f4YpcKYYpbTThrpGt16iQDbLKffO/IdACyFAMkVnp0404qEVsRSatWdWbqTebe1hEXTvVfBa7VV3GpOUNLC+Z/caMyvTaSzZ4SbeSI+026RxhKjFrtTmPvVSzWaTtFOw/DI5XHkHfPTWOrnnq6mWqqppJ55XF8kkji5z3HeSTvK7uIbrV329Vd3r361RVymR3M3Pc0dAGQHcXn5KiYhfyu6jf6VuR1rBcJp4fQSy99735dSNhCl/RjoWq7vHFdcUOmoaJ+To6RuyaUc7j8AdG/uLXg5YKgvFzmxLcoRLS0MgZTMeM2vm3lx59UZd89CscBkFKYVhcasVWq7uZEHpDpDUoTdtbPJre/Jep51gsVpsNA2hs9vp6Knb8CJmWfSTvJ6SvSCIrPGKiskihTlKcnKTzYRFjGP8AEkeHaW2SPeA6rudPSgZ7w5/XeBuaxOahFyluM06cqs1CK2sydFo1ar0eAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCItCQBmSgNTsXi4pxPZMN0fsm71zINYfu4x10kn8LRtPoWA6SNLVPbnSWzDRjqqsZtkqj10UR5m/HPmHSoms1nxJjq+vMJmrah5Bnqp3nVjH0ncnQ0d4KBvsbhTnyNutefd9yx4fo/OrDl7p6lPvfp/Nhl+L9Mt4ry+DD8DbZTnZxz8nzO7nwW+c9K8Ww6P8Z4yqG3Cs46GKQ5mruD3azhztaeuPmCl7AmjCxYcbHVVLG3K4jbx0zOtYfoN3DunMrPQAF8aWE3F29e+n/wDlbv5/Mz71MbtrJcnh1NL/ALPf/OvsIyw5oYwxQBsl0dUXaYb+Mdxcef8AC38yVn9qtFstcQit1vpaNgGQEMTWegLvopqhZULdZU4JfziQFzf3N08602/Ds3BERbRqHm4noBdcPXG2kZ+yqaSId1zSB51GvBktzqbDVzrJGass1bxRzG0cW0AjwuKlxebYbPS2aGohpBqxz1UtSW5bnSO1iB0ZrUqW2vcQrftz7zeo3jp2lSh+5p9n8R6SIi2zRCwrTfJJHotvro88zC1py5i9oPmKzVeFj+1uvWDLva2NzkqKR7YxzvAzb5wF8biLlSklvaZsWk4wrwlLcmvEpmRtW1chB+EMjyjmW0hc3zO1Fp+D02Fmiy28TlrOkmMn8XGOz82SkJVw4P8Aj6lw/PLh68ziGgqpeMp53nJsMh2EOPI12Q28h7qsayRr2BzXBwcMwQcwQr7hdxCrbRUd6WTOS47aVLe9m5rZJtp8U/TcbkQkAZrhq6qnpKZ9TVTxQQsGbpJHhrWjpJ2KRzyIdLPYjlLgN6qvp1xuMQ40iit82tbrQ/Vhe07JJQQXvHRmAB0DpWT6Y9L0dfSz2DCkzuJkBZU17dmu3lZHy5Hld4OdQdKP3bsvilVnF8SjNcjSefF+RftGcDnTftVwsnzLr5y91HKJ6aKZu6RjXjvjNcq83Cri/DFqed7qKEnxGr0lZIvOKZRKkdWTQREXo8BERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREARFoTsQG2aRkMTpZXtYxjS5znHIADeSVAelfSXNeHS2ewzPitozbLO3Y6o6BzM857mxcumbHz7tUS4fs82Vvidq1ErD/xDgfeg/EB8J6FjejPBlTi276r9eK205BqZhvP0Gn4x8w2qoYritS5q+x2m97G15dHFl0wfCKVrS9uvdy2pPx6+CNdGuAq7F1Xxry+ltcTspajLa4/EZznp3DzKxlgs9tsltjt9spWU8EY2NbvJ5STyk85XYttDS22ihoqKBkFNC0MjjYMg0LsqZwvCqdjDjJ736dBBYtjFXEKm3ZBbl69IREUsRAREQBERAEREAREQBaOWqICq+m7CMmGsWzVEEJFtuD3TU7gNjXHa9neJzHQehYCQro4osFtxHZ5rXdacTU8u3fk5jhuc08hHOq7Y30QYlsk75bXC68UO9roW/vmjmczl7rc+8qdimE1KdR1KSzi+77HRsC0go1aUaNxLKa2Zvc/rxI1IWRYaxzizDsYhtN6qIoBugkykjHca4HLvZLw6qnqKWQxVUEsEgORbKwsI7xXAS0nY5p7hUNTq1KMs4tplmq0aNxDKaUl07SQZtMuPnxaguVJGfjMo2Z+fMLD8QYivt/k171dquuyOYbLJmxvcaOtHgWy22W8XN4ZbrVXVbj8jTud5wMlm+HtDGMro5rqyCntMJ3uqZM3+I3M+Ehbqne3S1U5SX1yI5xwvD3rNQg/pn6kalbHjNrhzgr0L1Sw0N4rKKmqPZMNPO+Jk2rq8YGkjWy5M8luw/QuuV/t1vYCTU1UUWQ+k4A+bNaii9bV5yV5WPJ8pzZZl0MOxGCwW+A746WJp7zAF31tY0NaGjYBsC3Lo8VkkjiMpa0mwiIsnkIiIAiIgCIiAIiIAiIgCIiALjqqiClp5KmpmjhhjaXSSSODWtaN5JOwBciqVw5ca3D9r27AdLM+Gg9jNra0NOXHuc5wjYedrdUnLlJHMEBNkunbRLHXmidja3mQO1S5rJHR5/WBur388lINuraO40MNdQVUNVSzN14poZA9j284cNhC+WmZ5yrDcCXGtxt+OZMEySvltlzhknhiJzEM8Y1i5vMHNBBHKQCgLmoiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAKMNOGMnWug/YFtlLa6qZnO9p2xRHk6HO9GfQs8xPeKaw2OrutUf3dOzWDc9r3bmtHSTkFVi83Cqu10qbjWya9RUSF73cg6B0AbB0BVzSLE/ZKPJQfvS7kWTRzC1d1uVqL3I97/m1m7DlmrL9eqa1ULc5p3ZZkbGNG9x6AFaPC1josP2WntdAzViibtcRtkcd7j0krCtBeFxa7Gb1VxZVleAY8xtZDyD/AFbz3lJSxo7hvs9Hlpr3pdy+5nSTFHdV+Qg/cj3v7bgiIrIVoIiIAiIgCIiAIiIAiIgCIiALQgFaogOGppKapbq1FPFMOaRgd6VwR2i1RnWjttEw87YGD8l2KiohgbrzTRxt53uDR51jV80h4Ns7Xey7/RukA/woH8a89GTM18akqUPem0us+9KFao9Wmm+rMygNaxuQAAHIBko601Y8p8LWOW30UzTeauMthY05mFp2GR3N0c57iwvGunOeeN9LhahdTg7PZdUAXjpawbB3ST3FDNfVVNdWS1lbUS1FRM7WklkcXOceclQeIY3TjBwoPN8eZFpwfRmtOoqt0sorm5318Dq+E91SNweLG666RIaxzM4LZG6occtmuetYPCSe8o7yVqNBOEnYYweyWrj1LhcCJ5wRtYMusZ3htPSSojCLZ17lPmjtZZdIr5WtlKK+KWxefcSANy1RFeTlQREQBERAEQkBedPfbLA8xz3e3xPG9r6ljSPCUB6KLyuqPD/z5bPK4/WnVHh/58tnlcfrQHqovK6o8P8Az5bPK4/WnVHh/wCfLZ5XH60B6qLyuqPD/wA+WzyuP1p1R4f+fLZ5XH60B6qLyuqPD/z5bPK4/WnVJh/58tnlcfrQHqqr/DW0cXS5voseWallqxS0/sW4xRMLnsjDi5koA2kDWcHc2w7s1Z6KRksbZI3Nex4DmuacwQdxBXTrbxaaObiKy50VPLlnqS1DGOy58ic0B8udZuWes3LnzVnOBVo4uhxA/SDdKaWloYYHwW7jGlpqHvGTpAD8ANzAPKXbNysDLaNFMtw/aEltwc+rz1uOdFTF+fPnz9KyahvFlqZmU1Fc6CaQjrY4qhjnZAcgBQHooiIAi6FZerRR1DqerulDTzNyLo5ahjXDPdsJzXD1R4f+fLZ5XH60B6qLyuqPD/z5bPK4/WnVHh/58tnlcfrQHqovK6o8P/Pls8rj9adUeH/ny2eVx+tAeqi8rqjw/wDPls8rj9adUeH/AJ8tnlcfrQHqovNiv9jlfqRXi3SO5m1TCfSvRa4EAg5g7ulAaoiIAiIgCLR72saXPcGtG0knIBea/ENiY7VkvNuY4bwaqMH0oD00XldUeH/ny2eVx+tOqPD/AM+WzyuP1oD1UXldUeH/AJ8tnlcfrTqjw/8APls8rj9aA9VF5XVHh/58tnlcfrTqjw/8+WzyuP1oD1UXldUeH/ny2eVx+tbo8QWKSRscd6tr3vIa1raqMkk7gBmgPTRAiAITki4K+pho6OarncGxQxukeeYAZn0LDaSzYSb2IhrhA381Fxp8PQP/AHdOBPUZHe8jrR3ht/1LBsB2I4ixVRWwgmFzuMnI5I27XeHd310b1XzXW7VVynP7ypldK7ozOwd4ZBSzweLOI6KvvkjOuleKeIkfBbtce+SB3lzak3i+K5v4c/8A5Xr5nSamWEYVktksv/p+nkSvCxscbY2NDWtADQNwA5FFXCNklit1mdFJJG72RJtY4tPvBzKWFEvCQ/5ZZvr5P6ArrjT1bCplw80UzA0pYhST4+TI+wxpCxPYpm6te+uph76nqnF7SOhx65vePeU9YGxZbcV2z2XROMcrMmz07z18TvzB5Cqt5LINHV+mw7i2jrWPIgkeIalvI6NxyPgORHcVOwfHK1vUUKss4PjzFzxnAqNzSlUpRymuHP0MtKi0btC1XRjmwREQAnIZqONImlO24dmkt1tibcbizY8a2UUJ5nEbz0DvkLn01Yulw5h9tJQy6lxr82RuG+Jg98/u7QB0noVbnZkkkkknMkqtY3jUrV8jR+LnfD7lrwDAY3i5ev8ABzLj9jKb5pGxldZHGS9TUsZ3RUn7poHNmNp75WPTXS6THWluddI47y6pefzXWIW0hU+d3XqvOc2/qXqlZW9GOrTgkuo5jXV/+eq/57vWtpr7gP8A8+r/AJ7/AFriWhC8ctUX6n2n25Gn+1dhyftC4f5+r/nv9aftC4f5+s/nv9a4CFtXtVp/uZnkaf7V2HYNxuPzhWeUP9a2uuFwcNtfWHuzv9a4VtIXtVZ/uY5Gn+1dglkklP72R8n8bi70rjIHIMluIWi8uTb2nuKUdyOMjJaFexh/Dt6xBUiCz22orHE5FzG9Y3uuOweFTZo60MUdtljuOKHx19S0hzKVm2Fh+kT78+burfs8Pr3TygtnHmI+/wAYtbGLdSW3gt/2+pjWgvRvLcKuDE99pyyiiIfRwSN2zuG55HxRvHOejfYYLaxgY0NaAABkAAtyvNlZwtKepH6vicwxLEquIVnVqfRcEERFuEeEREAUP6etOdm0ctNooIY7riN7A4UuvlHTg7nTOG0Z7w0bT0Dask08Y9j0d6O62+M1H17yKe3xO3PncDqkjlDQC49DelfPC5VtZcrhUXC4VMtVV1MjpZ5pHZuke45lxKAynHOk/HWNKh777iKsfA47KSB5hp2jmDGnI9/M9KwwsYTmWMJ5y0LciA28XH8mzxQnFx/Js8ULciA28XH8mzxQnFx/Js8ULciA28XH8mzxQnFx/Js8ULciA28XH8mzxQuza7XLdrnS2qipmyVNZMynhYGDNz3uDR5yuDpVq+CPoarqOvg0g4qo30zmNztNHM3J+bhlx72n3uwkNB27SeZAWbsVCy12ShtsZzZSU8cDT0MaG/kqScNdrDpueSxpP7LptpAPLIr0KjPDV7Nr/sum9MiAhDi4/k2eKFLnBAYwafbGQxoPE1W0NHyDlEqlzgg9nyx/U1X4DkBfcIgRAUH4YLGHT9fCWNJ4ik2lo+Qaoi4uP5NnihS9wwOz9fPqKT8BqiNAbeLj+TZ4oTi4/k2eKFuRAbeLj+TZ4oTi4/k2eKFuRAbeLj+TZ4oTi4/k2eKFuRAbQyMbo2eKFmWj/SZjXA1bHPYb5Utga7N9FO8y00g5iwnId1uR6Vh6ID6MaE9JNr0mYSbdqNnsatgcIq+jLszBJlnsPK0ja0/mCs7VDuCDiibD+mShoDIRSXuN1FMzPYX5F8bu6HDL/UVfEbRmgBOW9V4088I2jwtVVGHMFx09yvERMdRWSddT0rtxaAP8R45Rnqg78zmF7XC20lz4JwZFZrPUGG9XoOjjkYeup4BskkHM45hrTzknkVGSgMhxdjbFuLal1RiLENxuBccxHJMRE3obG3JoHcCxzi4/k2eKFuRAbeLj+TZ4oTi4/k2eKFuRAbeLj+TZ4oTi4/k2eKFuRAbeLj+TZ4oTi4/k2eKFuRAbeLj+TZ4oWY6EbM+9aXcK0FPC1zjc4ZXZMHWsjdxjj3g0rEo2PkkbHGxz3vcGta0ZlxO4ADeehXM4JWh6swjTyYxxPTGC81kXF0lK8ddSQnIku5nuyGz4IGW8lAWFG5ERAFg+my5GgwLURMdlJWSNpx3Dtd5gfCs4O5Q7wiKzOptFvG4Nknd3yGj0FRWN1+QsKk1wy7dhKYLb8vfU4Pdnn2bSIycsyeRWc0cW79lYKtVKRk/iBI/+J/XH0qtlBTmqr6emG+aVkfhcArZRMbGxsbBk1oAA6AqxofRzqVKr5kl27fIsul9ZqFOkufN9mzzN6iXhHj/0yzf/ALEv9IUtKJuEdttln+vl/pCs+Of+hV6vNFdwH/IUuvyZCpC0A64Ec63EIN65XHedUe4t7REmkhJOZ4tvoXKuGi/4OH6tvoXMuzx+FHFpb2EKIvR5K06crk64aQqyLWzjomMp2DmyGs7zuPgWCrIdITnPx3fHO3mul/qXgELlN/VdS6qTfF+J2LDaSpWdKC/avA3UlNPV1UVLSxPmnleGRxsGZc47gFK1l0I19RStlu15io5XDPioYuNLeguJAz7i8zg9UkE+OpJpmgvp6N74s+RxLW5+AnwqxKsOBYRQuaPLVtu3LIrWkON3FrXVCg8slm3/ALIYOgmDtmm8kH6lp7RMHbLN5IP1KaEU/wDgdj8vvfqVz8xYj8zuXoQv7RFP2zTeRj9S0Ogan7Z5vI2/qU0on4HY/s736mfzFiXzO5ehCvtC0/bPN5GP1LVugalz6/E1QR0UjR/5KaUWVgtkv0d79TH5ixL5vcvQiSj0FYeY4Gru9zn6G6jAfMVkln0WYItrg9tmZVSN3OqnmXzHZ5lm6L708NtabzjTXia1XF76qsp1X25eBxU9PBTQthp4Y4Ym7GsjaGtHcA2LlRCQFupZbiObz2sItA4Hn8C1WQEREAREQFQuHneZZcU4cw+1/wC5pqOSsc0cr5H6gJ7gYfCVWlTxw4+zBR/Y0P4kqgdAejhmy3DEeIaCw2qIS11fO2CBpOQ1jyk8gAzJPMCreYc4KOCYLXE2+3a819eWjjZKeZsEWfKGt1Scu6SVAXBUAOnzDOYB6+c//wCeRfQMbkBBfuWNGPyuIPLx+hPcsaMflcQeXj9CnREBBfuWNGPyuIPLx+hPcsaMflcQeXj9CnREBBfuWNGPyuIPLx+hPcsaMflcQeXj9CnREBG2BtB2jbCFZHXW6wMqa2M5x1NdIah7DztDutaekDNSSABuREAVGeGr2bX/AGXTemRXmVGeGr2bX/ZdN6ZEBCSlzgg9nyx/U1X4DlEalzgg9nyx/U1X4DkBfcIgRAUI4YHZ+vn1FJ+A1RGpc4YHZ+vn1FJ+A1RGgMt0TYFrtIuLhhu3V1NRTmmkqONqGuczJmrmMm7c+uUwe5Ixd22WP+RMse4FfZuj+y6n0xq86Apz7kjF3bZY/wCRMnuSMXdtlj/kTK4yICnPuSMXdtlj/kTIeCTi7I5YrsRPTDN6lcZEB81dJuA8QaPMR/sTEEUQkfHxsE0Ly6KePPLWaSAd4yIIBHgWLK0XD7a0XDCD9UaxiqwTy5ZxKrqAy3Qy9zNLuEHNORF5pdv/APQL6THYCV819DnZawj9tUv4gX0nPvSgKE8Lq9y3fTjdoHSF0Nsihoom57G5MD3f7nlRGs94RHZwxf8AaTv6GrAkBl+iLAVz0jYygw9bZG07dQzVVS9us2CEEAuy5SSQAOUnmzVqqLgqaOYqaNlVW4gqZgOvk9ltZrH+EMyCjfgFAdWeJnZDMW6EA/8A9SrhICC/csaMflcQeXj9Ce5Y0Y/K4g8vH6FOiICC/csaMflcQeXj9Ce5Y0Y/K4g8vH6FOiICC/csaMflcQeXj9CDgs6MQQS+/noNwH6VOiIDBcBaI9H+CZ21Viw9TsrWjIVdQ4zzDuOeTq/6clnSIgCIiAHcoD07TGXHAizzENJG3uZkn81PhVetMx1tIVdnyRxD/YFWdLJathlxa82WPRaOd9nwTPCwVFxuMLPGdxrYvM7P8laJViwJk3G1lcdwrI/SrOrT0N/sVOteBt6XP+vTXR5hRPwjP+W2f6+X+kKWFFHCL/5baPr5P6QpvHf8fV6vNERgP+QpdfkyFyFty2retMtq5VF7Tqj3FuqL/g4fq2+hcq4qL/g4fq2+hcq7VD4UcWlvYQoi9Hkq7pYo3UekO8xkZcZPxzekPAd+ZWKqZeENh95kpMR08ZLA0U9UR8Hbmxx6NpHgUOkLl2L27t7ycXzvNdTOs4Lcq4sqclvSyfWth62C7/U4YxFT3enZxnF5sliJyEkZ98M+ToPOFYOz6SsH3GmbL+2IKR5HXRVR4t7ejbsPeKrGRktCvrh2M17FOMUnF8zPnimCUMRanNtSXOvMtZ1cYQ7ZLX5S1adXOD+2S1+UtVUjmFopVaVVX/xrtZEfk6j819iLW9XWD+2W1eUNW+HGuEpXhkeJLUSeeqaPSVU5bSBy7V7WlNXPbTXax+T6PzX2IubTVVPVRCWmninjO58bw4eELmVN7RdblZ6oVNrrqijlHwoXlufdG499TRo10uNrqiK1Yo4uGd5DYq1o1WPPIHj4J6Rs7ilLLSChcSUKi1W+ztIbENGbi1i6lN66Xb2EwItGnMLVWArQXRv7pY7HXyQvMcraaQscN7XBhyPhXeXRxC4NsNwcdwpZT/sK8y+FnqHxIiDgyXWtqpL3S1dZUVGyGccbIX5OOsHHaeXYptVfeC84jEl1byGhYfA/+6sEFF4LNzs4tvj4k1pHTjTxCaist3ggiIpYgwiIgKScOLswUf2ND+JKoHU8cOLswUf2ND+JKoHQEk8GOto7fpxw5WV9XT0lNG+fXmnkEbG5wSAZuJAG0gK9XVvgztusH3lD+pfMwgEZEAjpW3UZ8RnihAfTbq3wZ23WD7yh/UnVvgztusH3lD+pfMnUZ8RnihNRnxGeKEB9NurfBnbdYPvKH9SdW+DO26wfeUP6l8ydRnxGeKE1GfEZ4oQH026t8Gdt1g+8of1LTq3wYNvVdYPvKH9S+ZWoz4jPFC7lktUt5vNFZ6OASVFdUMpomhu0ue4NHpQH1HikZLG2SJ7XseA5rmnMEHcQVuXXttKyioKejj95BE2NvcaAB6F2EAVGeGr2bX/ZdN6ZFeZUZ4avZtf9l03pkQEJKXOCD2fLH9TVfgOURqXOCD2fLH9TVfgOQF9wiBEBQjhgdn6+fUUn4DVEalzhgdn6+fUUn4DVEaAmLgfXG32vTIyqudfS0NP+zahvG1EzY2ZksyGbiBmrpdW+DO26wfeUP6l8yiARkQCOkLTUZ8RnihAfTbq3wZ23WD7yh/UnVvgztusH3lD+pfMnUZ8RnihNRnxGeKEB9NurfBnbdYPvKH9S0OOMFgEnF+HwB/8AJQ/qXzK1GfEZ4oTUZ8RnihAT1wx8e4exjii0UGHa2K4QWmGYTVUJzidJI5vWtd8LIM2kbNvQoHREBlehsE6W8IgDM/tql/EC+k53FUA4Ktglv2m6xuaxxgtrn3CdwGxojbk3PuvcwK//AMHvID51cIjs4Yv+0nf0tWBLPeER2cMX/aTv6WrAkBYXgQXe02jFmI5btdKG3xyUELWOqqhkQcRIcwC4jNWv6t8Gdt1g+8of1L5lEA7wD3QtNRnxGeKEB9NurfBnbdYPvKH9SdW+DO26wfeUP6l8ydRnxGeKE1GfEZ4oQH026t8Gdt1g+8of1J1b4M7brB95Q/qXzJ1GfEZ4oTUZ8RnihAfTbq3wZ23WD7yh/UuSlxfhOqqY6amxRZJ55XBkccdfE5z3HcAA7MnoXzF1GfEZ4oUncF3Dsl/03WARQgxW6U3Cdwbsa2IZjPuvLB30B9B0QbkQBERADuVfdNMZbpBq3Ze/hicPEy/JWCO5Qfp6puLxVS1AGyakAz6WuI/MKs6WQ1sPb4NPy8yxaLz1b9Lin6mD4fn9i3+31B2COqice84K1AVSzmNrd42juq0uHq0XGx0Nc1wcJ6dkmfSWjPzqK0KrLKrS6n4klpfSedKp1rwO+op4RP8Ay2z/AF8n9IUrKLeEPGTZ7VJlsbUvHhZ/ZWTHv8fV6vNEDgX+QpdfkyFC3LctBvC5CtrhsJG/JcoT5zqrLbUX/Bw/Vt9C5l0cP1DauxUFUw5iWmjeD3Whd5drpSUoJrgcXqJqTTCIi9ng69yoqa4UM1FWQsmp5mFkkbhscCq+aQNGl2sE8lVbYpbhbMyWuYNaSIczwN/8Q7+SsWtCAVG4jhdG/ilPY1uZJ4bitfD5509qe9c3+ym5G/o39C2kZdxWvvOEMNXh5fcbNRzSHfJxeq/xm5FeDLoowU9xIt07M+RtU8D0qq1NFrlP3ZJr6ryLfS0utWvfhJP6PzRWwraRkrJe1Hgv/J1XlT/WtPajwX/k6ryt6+f5XvOMe1+h9VpbZcJdi9Stq0Ksn7UWCv8AJVXlb/WurcdDeEp6ZzKX2dSS5dbI2cvyPSHb1l6M3iW9dv2Mx0ssW8mpL6L1K6kLaQvbxjh6twxfZrVXarnsAdHI33sjDucPVyELxioScJUpOE1k0WOlVhVgpweae4n3QFjCW722TD9xlMlZQsDoHuOZkh3ZHnLTkO4QpVVT9GdzfZ8d2msa4tYahsMvSx/Wn0g95WvbuV+wC8lcW2rN7Y7PpzHNdJbGNrd60Fkpbfrz+pqvC0g1Qo8D3uoOzVoJsu6WkD0r3VgGn6vFHo3rIQcn1ksdO3vu1j5mlSl3U5KhOfBMiLKk61zTprna8TAODBEeqC8ScjaONnhf/ZT8oW4MFKRSXytI2OliiB7gLj/UFNK0MCi42UM+fPxJPSSeviNTLmyXcgiIpcggiIgKScOLswUf2ND+JKoHU8cOLswUf2ND+JKoHQBFnmgHC9pxlpWtGHb5HNJQVTZjK2KUxuOrE5wycNo2gK13uY9FX+Quv3lIgKKor1e5j0Vf5C6/eUie5j0Vf5C6/eUiAoqivV7mPRV/kLr95SJ7mPRV/kLp95SICiv57Fa3gkaGa+guEOkDFdG+lkYwm00czcnjWGRne0+92EhoO3aTs2KZ8F6G9HGEauOts+GaX2bGc2VNS51RI087S8nVPSMln6AIiIAqM8NXs2v+y6b0yK8yozw1eza/7LpvTIgISUucEHs+WP6mq/AcojUucEHs+WP6mq/AcgL7hECIChHDA7P18+opPwGqI1LnDA7P18+opPwGqI0ARSZwacH2LHOk1lixFTyz0JoZ5tSOZ0Z12lmRzbt5SrRe5o0T/NFw+8pvWgKIor3e5o0T/NFw+8pvWsI0pcFqyixVFfgKproblAwvbQ1U3Gx1GXwGuI1muPJmSM9hy3oCpCLdIx8Ujo5WOjkY4tc1wyLSDkQRyEFbUAXZtdBXXS4wW220c9ZW1DgyGCBhe95PIAFI3BstWB8QaQY8OY3tzqqO4M1KCQVL4gycZnUOqRmHjMDPlAHKrwYMwLg/B8bm4Zw9QW0vGTpIov3jhzF5zcfCgMF4Mmil+jjC8tVdhG7EFz1XVeqQ4QMHvYQeXLMkkbCTzAKXjuKIdxQHzp4RHZwxf9pO/pasCWe8Ijs4Yv8AtJ39LVgSAIpn4KWj7DGkLEV8osT0s9RDSUkUsIiqHREOc8g5lp27ArD+5n0T/NFw+8pvWgKIor3e5n0T/NFw+8pvWnuZ9E/zRcPvKb1oCiKK93uZ9E/zRcPvKb1rczg06JmvDjZq5wHIblNkf9yAo1ZrZcbzdILXaqKeurahwbFBAwue89A/PcOVXu4NeihujXDEk1yMU2ILkGurXsObYWj3sLTygZkk8pPMAs2wVgPCGDIXRYZsFFbdcZSSRszkePpPdm498rJEAREQBERAFF3CAoi+22y4Nb/hTOhcehwzHnapRWNaTbabpgu4QMbrSRx8fHl8ZnXegEKMxm29psatNb8tnWtq8CQwq49nvKdR8fHYVwBU8aEbmKzBzaNzs5KGV0WX0T1zfSR3lBLhntCznQreRbcWewpX6sNezitu7jBtb+Y765rozeq1v4626Xu9u7vyL/pDau5spZb47ezf3E8rA9OdGanA7pmtzNNUxyHoBzaf6gs8BzXQxBbmXay1ltky1amF0eZ5CRsPeOS6lfUPabadLimjnVlX9nuIVeDTKqkZLRdirp5qWqlpahhZNC8xyNPI4HIrhIXGHnF5M7BGSazRO+hC/R3HC7bU+Qeyrf1haTtMZPWu/LvKQVVKy3Svs1xjuFtqHQ1Ee4jaCOUEcoPMpasWmG3viay9W+enlA66Sn69h7xII866FgekVvKhGjcS1ZR2Zvc11lBxrR+uq8q1vHWjLbkt6ZKaLCG6U8HEZmunHQaV/qWvtpYN+cJ/JZPUrD+KWXzY9qIH8MvPlS7GZsiwk6U8GD/uE/ksnqWntqYM+cJ/JZPUs/idn82Pah+GXnypdjM3RYQdKuDPnCfyWT1LT21cF/OE/ksnqWfxKz+bHtQ/DLz5UuxmcIsG9tXBfzjP5LJ6lodK2CvnGfyWT1J+JWfzY9qH4ZefKl2MzpFgvtr4K+cZ/JZPUuvX6XcHwQOfBNWVUmWyOOmc0nvuyAWHidmlnyse1GVhd63kqUuxmH8JdkP7Vsrm5ccYJQ7n1dZuXnzUQELIMc4jrMVX+W6VTBE3IRwxA5iNg3DPlO0knnK8Ajaud4pcwuLudSG5/wCjp2EWs7Wyp0qm9b/q8zmtuf7SpS333Hx5d3WCuS3cqnaPba67Y2tFE1pcDUskf0MYdYnwBWyG5WfRWL5OpLmzX87yqaYzTq0oc6Tfb/oFQXwl7sJK612Njs+JY6plAPK7rW+YO8KnGd7IoXySODGMBc5x3ADeVUvGN0nxVjOsrog5xrKgR0zfoZhrB4MvCtzSG55O25Nb5PL6Gjova8rd8q90Fn9eYnTg/W80WjuCdzcnVk8k/ez1R5mqQ10MPW+O02KitkQAZSwMiHTqjInwrvqWs6PIUIU+CRC31f2i5nV4tv0CIi2TVCIiApJw4uzBR/Y0P4kqgdTxw4uzBR/Y0P4kqgdAStwSez7h7+Gp/Aer+hUC4JPZ9w9/DU/gPV/QgCIiAIiIAiIgCIiAKjPDV7Nr/sum9MivMqM8NXs2v+y6b0yICElLnBB7Plj+pqvwHKI1LnBB7Plj+pqvwHIC+4RAiAoRwwOz9fPqKT8BqiNS5wwOz9fPqKT8BqiNATZwK+zdH9l1PpjV51RjgV9m6P7LqfTGrzoAh2hEQFKuGVo66nMYMxjbYNW2Xt59kho2RVYGZ7geBrd0OUAr6YaSsJW/G+Crlhq4gCKriIZJlmYZBtZIOlrgD4Ryr5v4js9ww9fq6x3WEw11DO6Cdn0mneOg7CDzEIDqUlRPSVUNXSzPhqIJGyRSMOTmPac2uHSCAV9F9COOYNIOju339pY2s1eIr4m/9OobkHjuHY4dDgvnGpp4I2kHqQ0htstfPqWi/FtO/WOTYqjdE/ozJ1D/ABDmQF6kduKIdoyQHzq4RAI04YvzGX/qLv6GrAVMPDBsctn03XGqMZbBdYIayI5bCdXi3/7medQ8gLJcAr/7yxOP/j4fxSrgr5y6EtIlZo0xtHfYKc1dLLEaetpg7VMsRIPWnkcCAR3xyq2lHwmNFM9MyWW6XGme4ZmKW3SlzTzHVBHgJQEzIof90nol+fKz7tn/AEp7pPRL8+Vn3bP+lATAih/3SeiX58rPu2f9Ke6T0S/PlZ92z/pQEwIof90nol+fKz7tn/Snuk9Evz5Wfds/6UBMCKH/AHSeiX58rPu2f9K7Fr4Q2i25XOkttJeqt9TVzMghabfMAXvcGtGZbkNpCAlhECIAtsjQ5pa4AgjIg8q3IUBWbGVpdZMSVtuLSGRyExHnY7a3zHLvLyYnyQzMmicWSMcHMcN4IOYKmLTlYTUUMF9p2Zvpv3VRkN8ZPWnvH0qHSFxnHLF2F7KC3b11P03HVsHvI3tnGT37n1r13llME3yLEGHqa4sIEjm6kzR8GQe+H59wr21AOijE/U/fPY1VJq2+sIbKTujf8F/5Ho7in1hzaDmumYDiixC1Un8S2Pr4/U5/jOHOxuXFfC9q6uH0Ih01YQk492JbdEXNIArWNG0EbBJ3OQ+HnUUK2r2tc0tc0EEZEEZ5qLcbaK4qqWStw7JHTyOJc6kk2Rk/RPwe4dncUBj+jk6lR3Nqs296816E7gWkEKcFb3LyS3PyfqQ0RzLavVvNivFnkLLlbammy+E5hLD3HDYfCvMOR3EHuKjzpzpy1ZLJ8GXWnVhUWtBproNmS2uBXIQtCCsqWZ7zONaELe5p5FtXtDM2ELaQuQjoWhasoHGQtpC5MjzLQg8y9LYZzOM7sltI2LkI6FtI6F9EzOZxHmK0IzXboaGruFQ2moaWaqmdsDImFx8ylnR3okkE8dyxS1oa0hzKEHPM8nGEcn0R3+ZSFnYV7yerSj9eZGjfYnb2MNarLbw52d3g/YSloqWTEtfEWS1TNSka4bRHnmX/AOrIZdA6VLi2xtDGhrQGgDIADIALrXi40tqttRcK6URU1OwvkeeQD8+RdKsrWnZUFTjuW9+LOW313Uv7h1ZLa9y8EYDp6xP+yMMfsimkyrLkCw5HayEe/Pf973yo00E2E3fG8VZIzWpra3j3c2vuYPDmf9KxzGt/qsTYiqbtUgtEh1YYt/Fxj3rfX0kqweh3DPU5hCFtRHq11ZlUVOe9pI61veGXfzVZozeK4lr/AKIeXqy2V4LBsJ5P/kqee/sXeZoNyIiuRRgiIgCIiApJw4uzBR/Y0P4kqgdTzw4gfbgpNn/ZofxJVA+R5igJV4JPZ9w9/DU/gPV/QqB8EoH2/cPbPg1P4D1fwIAiIgCIiAIiIAiIgCozw1eza/7LpvTIrzKjPDVB9u1+z/tdN6XoCElLnBB7Plj+pqvwHKJMjzFS3wQQfb8sez/o1X4DkBfcIgRAUI4YHZ+vn1FJ+A1RGpd4X4Pt+3zZ/wBCk/AaojyPMUBNfAr7N0f2XU+mNXnVGeBWD7d0ez/tdT6Y1eZAEREAVW+G3o642mp9IlrgzfCG011DRvZnlHKe4TqE8xbzK0i6d6ttFeLTV2q407Kikq4XQzxuGx7HDIjwID5cICQQQSCNxByIWVaV8F1uAcd3HDVXrvZA/XpZiP8AGgdtY/u5bD0grFsjzFAfQPg16QRj/RvTVFXMH3i3kUlxBO1z2jrZO49uR7utzKT18+uDXj92ANJNNPVSllnuWVHcAdzWk9ZL/occ+4XL6CNIc0EEEEbwgIX4WmjibG2BWXW005lvVl1poY2jrp4SP3kY5zsDgOduXKqKr6pkZ71WjhC8HV17ranFOAo4YrhKTJV2wkMZO473xHc155WnYTtzB3gVDRd292q52O4yW682+qt1ZGcnQVMRjeO8d/dGxdLI8xQBFrkeYpkeYoDRFrkeYpkeYoDRFrkeYpkeYoDRe/o47ImGvtek/GYvByPMV72jgH2w8NbD/wA3pPxmID6aDciDciAIiIDhraaGspZaWojEkMrCx7TygjIquOMbFPh6+TW+bMxg68Eh/wCpGdx7vIekKyixjSFhaLEtmMbNVlbBm6mkPPytPQfUVXdI8H/ELfOHxx2rp4r06ScwLFPYa+U/glv6OkruQpg0QYyFVDHh+5zZVEYypZHH/EaPgH6Q5OcdxRNV081LUyU1TE6KaJxY9jhkWkbwuNjnRva+NzmPac2uaciCOULm+F4lWwy55RdTXFF+xGwpYjQ1JdafAtYijzRnj2O7sjtV3kbHcQMo5DsbUep3Ry8ikIHNdfsr2je0lVovNPu6Gcuu7SraVXSqrJ/zcaSMa9pa9oc07wRmCvJqsMYeqyXVNlt8jjvJgbn6F7CL71KNOp8cU+vafGFSdN5wbXUY4cC4RJzNgofEPrWnUJhH5govFPrWSIvj7DbfLj2I+3ttz8yXazG+oTCHa/ReKfWtOoLB/a/Q+KfWslRPYbb5cexD225+ZLtZjXUFg/tfofFPrTqCwf2v0PiH1rJUT2G2+XHsQ9tufmS7WY11BYP7XqHxD61p1A4O7XqHxD61kyJ7FbfLj2Ie23PzJdrMZ6gMG9r1D4h9a3R4EwfG4Obh235jnjz9KyRFn2K3+WuxD225+ZLtZ1aC30dBFxVFSQUsfxYYwweZdpFtke1jC5zg1oGZJOQAX3UVFZLYjXbcnmw9wY0ucQABmSSq9aZcc9UNd+yLXLna6Z+bnt3VEg5f4Ryc+/mXp6XNI/7SEthsExFHtbU1LTlx3Oxv0ec8vc3x7haw12I73Ba6Bn7yQ5veR1sbBvcegec7FTsbxd15eyW23PY2ufoXmXbAcHVvH2262ZbUnzdL8jKtCeETf8QC51cWduoHhxBGyWXe1vcG897nVi2jJebhiy0WH7LT2qgj1YYW7zve7lceklemp/CcPVjQUP1Pa+v7FdxjEpYhcOp+lbF1fcIiKUIoIiIAiIgMVxXo6wRiu5NuWIsM2651jYhE2aoj1nBgJIbv3Zk+FeR7SuirtEsv8n+6kFEBh+HdGGj/AA7eIbvZMJ2ygr4Nbip4Ysns1gQcjnygkLMERAEREAREQBERAEREAWJ4o0b4FxRdTdMQYXttyrTG2Ljp49Z2q3PIZ57hmVliICPvaV0Vdoll/k/3XpYb0Y4Aw5eIrvY8KWy318IcI54YsntDhkcjnyg5LL0QBERAYhiXRjgHEl4lvF9wpbLhXzBrZJ5os3uDRk3M58gGS832ldFXaJZf5P8AdSCiAxPC+jbAuF7qLrh/C9tttaI3RieCPVdquyzGee45BZYiIAiIgCIiAxrF+AsHYuqoKrEuHbfdJ6dhjikqItZzGk5kA82e1eH7SuirtEsv8n+6kFEBHx0KaKSMjgSy5H/2P7rO6KlgoqOGjpYxFBBG2ONg3Na0ZAd4BcyIAiIgPOvdist8p/Y95tNDcYeRlVTtlA7msDksSl0MaLJHlzsCWPM81PkPAFnyICPvaV0Vdoll/k/3T2ldFXaJZf5P91IKICPvaV0Vdoll/k/3T2ldFXaJZf5P91IKICPvaV0Vdoll/k/3T2ldFXaJZf5P91IKICPvaV0Vdoll/k/3XNQ6HtGNFWwVtJgqzw1FPI2WKRsORY9pzBG3eCAVnaIAiIgCIiAIRmERAYHpOwS2+wm5W5rWXONuRG4TtHIfpcx7yhGaKSGZ8M0b45GEtcxwyLSN4IVqisM0gYFpcRRuq6Usprk0bJMutlHM/wBe8Km6Q6N+153Fsvf51x+/iWnA8edtlQrv3OZ8PsQKMwQQciDmCORSfgLSY+nEduxG9z4xk1lYBm5vQ8cv8W/n51Hd1t1baq59FX074J2Ha1w3jnB5R0hdQqi2OIXOGVm4bHzp+aLld2VtiNLKe1czXky1FLUQ1VOyop5WSxSDNj2OBa4c4IXKq14YxRecOTa1vqTxJOb6eTro3d7kPSFK+GNJ1juQZDcibZUnZ+8OcRPQ/k7+S6Rhmk1peJRm9SXB7voyh4ho9dWjcoLWjxW/6oz1FshmimibLFI2SNwza5pBB74W9WNNPcQAREWQEREAREJyQBF1blcaG20zqivq4aWEfDleGjz71GmLNLtFTh9Ph2nNZLu9kTAtiHSG73eZad3f29pHWrSS8ew3LSwuLuWrRi34dpIt9vNtslA+tudVHTwN5XHa48wG8noCgfSPpGr8Sa9voBJRWonItz/eT/x5bh9Ed/NYrfrxc75WmsutZJVS7gXHY0czRuA7i5cMYeumI7k2htlOZHbDJI7YyIc7jydzeVSMQx+vfvkLZNJ9rLth2AW9hHl7pptdi9TpWe1114uUNvt0Dp6mY5NaOTnJPIBylWR0eYPo8J2niYy2asmydU1GW155hzNHIO+t2AsG27ClBxdOBNWSAcfUuHXP6BzN6Fk6sGCYIrNcrV2zfd9yAxzHHevkqWymu/7dAREVjK4EREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREB5GJsPWvEFF7GuNOH5f4cjdj4zztP5blDOL8AXixl9RTsdX0I28bE3r2D6TfzGzuKfVpkFC4rgNriKzmspcVv8ArxJXDsYuLB5QeceD3fYqmRmtpBVg8T4BsF7L5jB7Dqjt46nAbmfpN3H0qNr/AKMsQUBc+hEdyh5OL62TLpafyJXPr/Ri+tG3GOvHivTf4l3stIrO52Seq+D9dxidovV2s8mvbLjUUvO1jutPdadh8CzK16Wb7TBra+kpK5vK4AxOPgzHmWDV9FVUUpirKaankG9srC0+ddYhR1vil9Ze7Tm10fZm/Xw6zvFrTgn0/dE0UOl+yyACst1dTn6GrIPSD5l6sOk7CEgGtXTRdD6Z/wCQKr+QQtd6m6WmN+llJRf09GRU9FbGT2OS+vqiwrtJODgM/wBrg9HESepdWo0p4Si95U1U3RHTO/PJQGVt2r7/AJxvH+mPY/U8LROzW+Uu1ehMdx0yW9gc2gs1VMeQzSNjHmzKxO8aVcUVwcyldTW5h+RZrP8AGdn6Fg5GzNdi3W24XKXirfQ1FU/PdFGXecbAtSrpBiNy9VTyz5or+M3aWBYdbLWcE8ueT/iOK41tdcag1FfVz1Ux+HNIXHz7l1g1znBrQSScgANpKkfDuie91xbJdZorbCd7f8SU94bB3ypQwrgjD+HspKSkEtSBtqZ+vk73I3vLZtNHr28lr1PdT53v7N58LvSGytI6lL3muZbu3d2ZkVYK0XXS7Ojq7zxluojtDCP30g6AfejpO3oU12GzW6x29lDbKVlPA3kaNrjzk7yekr0MgivGHYRb2Ef6azlxe/7FJxHFri/l/Ufu8FuCIilCMCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA4Kykp6uMxVNPFPGd7ZGBw8BWO3DR/hOszLrRHC48sD3R+g5LKUWvWtKFf+7BS60mfalc1qP8Abm11PIjqq0R2CQk09bcIOjXa8ecLoyaHKQnrL7UgdMDT+alNFGT0dwybzdJd68GSEcdxCO6q+5+JFsehyiH+JfKpw+jC0fmu9S6I8OxkGoqbhUc4MjWA+AKREXqno9hsHmqS+ub8WJ45iElk6r7l4GMW7AOEqEh0VlgkePhTEyH/AHFZFT08NPGI4IY4mDc1jQ0DvBcqKSo2tGj/AG4JdSSI+rcVazzqSb63mERF9z4hERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAf/2Q==";

function LogoLSFire({ size = 36 }) {
  return (
    <img src={LOGO_LSFIRE_DATAURL} alt="LS Fire"
         style={{ height: size, width: "auto", display: "block" }} draggable={false} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIDADE VISUAL
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  orange: "#FF6600",
  orangeDark: "#E55A00",
  orangeLight: "#FFF4ED",
  orangeBg: "#FFE5CC",
  gray: "#404040",
  grayMid: "#737373",
  grayLight: "#F5F5F5",
  border: "#E5E5E5",
  white: "#FFFFFF",
  ok: "#16A34A", okLight: "#DCFCE7",
  nok: "#DC2626", nokLight: "#FEE2E2",
  na: "#6B7280", naLight: "#F3F4F6",
  blue: "#2563EB", blueLight: "#DBEAFE",
  amber: "#D97706", amberLight: "#FEF3C7",
  purple: "#9333EA", purpleLight: "#F3E8FF",
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
    const d = new Date(ini.getFullYear(), ini.getMonth() + (m - 1), ini.getDate());
    out.push({
      mes: m,
      data: d.toISOString().slice(0, 10),
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
  Semanal:    { bg: C.okLight,     fg: "#15803D" },
  Mensal:     { bg: C.blueLight,   fg: "#1E40AF" },
  Trimestral: { bg: C.purpleLight, fg: "#6B21A8" },
  Semestral:  { bg: "#FCE7F3",     fg: "#9D174D" },
  Anual:      { bg: C.amberLight,  fg: "#92400E" },
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
// DADOS INICIAIS — Técnicos, Contratos, Visitas
// ═══════════════════════════════════════════════════════════════════════════
const TECNICOS_INIT = [
  { id: 1, nome: "Carlos Mendes",  cargo: "Técnico Sênior", telefone: "(11) 98765-4321", email: "carlos@lsfire.com.br", cor: "#FF6600", iniciais: "CM", licenca: "CREA-SP 5060987" },
  { id: 2, nome: "Rafael Souza",   cargo: "Técnico Pleno",  telefone: "(11) 97777-1234", email: "rafael@lsfire.com.br",  cor: "#2563EB", iniciais: "RS", licenca: "CREA-SP 5072345" },
  { id: 3, nome: "Marcos Lima",    cargo: "Técnico Júnior", telefone: "(11) 96666-5678", email: "marcos@lsfire.com.br",  cor: "#16A34A", iniciais: "ML", licenca: "CREA-SP 5081234" },
  { id: 4, nome: "Fernanda Costa", cargo: "Técnica Sênior", telefone: "(11) 95555-9012", email: "fernanda@lsfire.com.br",cor: "#9333EA", iniciais: "FC", licenca: "CREA-SP 5099876" },
];

const CONTRATOS_INIT = [
  { id: 1, codigo: "200001", cliente: "Prologis Caxias II",     endereco: "Rua Arterial PD-04, 3777 — Duque de Caxias/RJ", contato: "Lucília Kênia",  telefone: "(21) 3456-7890", email: "lucilia@prologis.com",  tecnicoId: 1, duracaoMeses: 12, valorMensal: 6800, dataInicio: "2026-01-15", validade: "2027-01-14", proximaVisita: "2026-05-28", equipamentos: [ { id: 11, nome: "Bomba Diesel 01", tipo: "diesel" }, { id: 12, nome: "Bomba Elétrica 01", tipo: "eletrica" }, { id: 13, nome: "Bomba Jockey 01", tipo: "jockey" } ] },
  { id: 2, codigo: "200002", cliente: "Shopping Metrópole",     endereco: "Rua das Flores, 1200 — Campinas/SP",            contato: "João Gerente",   telefone: "(19) 3232-1010", email: "joao@metropole.com",    tecnicoId: 2, duracaoMeses: 12, valorMensal: 4200, dataInicio: "2025-08-01", validade: "2026-07-31", proximaVisita: "2026-06-05", equipamentos: [ { id: 21, nome: "Bomba Elétrica 01", tipo: "eletrica" }, { id: 22, nome: "Bomba Jockey 01", tipo: "jockey" } ] },
  { id: 3, codigo: "200003", cliente: "Hospital São Lucas",     endereco: "Av. Paulista, 1500 — São Paulo/SP",             contato: "Dra. Marina",    telefone: "(11) 3411-2222", email: "marina@saolucas.com.br",tecnicoId: 4, duracaoMeses: 12, valorMensal: 9500, dataInicio: "2026-03-01", validade: "2027-02-28", proximaVisita: "2026-06-02", equipamentos: [ { id: 31, nome: "Bomba Diesel 01", tipo: "diesel" }, { id: 32, nome: "Bomba Elétrica 01", tipo: "eletrica" } ] },
  { id: 4, codigo: "200004", cliente: "Centro Logístico Norte", endereco: "Rod. Anhanguera, km 30 — Cajamar/SP",           contato: "Ricardo Santos", telefone: "(11) 4488-3333", email: "ricardo@cln.com",       tecnicoId: 3, duracaoMeses:  6, valorMensal: 3600, dataInicio: "2025-11-10", validade: "2026-05-09", proximaVisita: "2026-06-10", equipamentos: [ { id: 41, nome: "Bomba Elétrica 01", tipo: "eletrica" } ] },
];

const VISITAS_INIT = [
  // Prologis (início 15/01/26, 12m) — visita em 28/05 = mês 5 → Semanal + Mensal
  { id: 1, referencia: "700001", codigoAtendimento: "700001", contratoId: 1, data: "2026-05-28", tipo: "itm", freqs: ["Semanal","Mensal"], tecnicoId: 1, status: "agendada", despacho: null, relatorio: null },
  // Shopping (início 01/08/25, 12m) — visita 05/06/26 = mês 11 → Semanal + Mensal
  { id: 2, referencia: "700002", codigoAtendimento: "700002", contratoId: 2, data: "2026-06-05", tipo: "itm", freqs: ["Semanal","Mensal"], tecnicoId: 2, status: "agendada", despacho: null, relatorio: null },
  // Hospital (início 01/03/26, 12m) — visita 02/06/26 = mês 4 → Semanal + Mensal
  { id: 3, referencia: "700003", codigoAtendimento: "700003", contratoId: 3, data: "2026-06-02", tipo: "itm", freqs: ["Semanal","Mensal"], tecnicoId: 4, status: "agendada", despacho: null, relatorio: null },
  // CLN — preventiva avulsa
  { id: 4, referencia: "700004", codigoAtendimento: "700004", contratoId: 4, data: "2026-06-10", tipo: "preventiva", freqs: null, tecnicoId: 3, status: "agendada", despacho: null, relatorio: null },
];

// ═══════════════════════════════════════════════════════════════════════════
// RELATÓRIO MODELO — Prologis Caxias II (OS 6751)
// Gerado a partir dos templates Padrao com status realistas (97% conformidade)
// ═══════════════════════════════════════════════════════════════════════════
function buildItemsComStatus(textos, padraoNok = {}, padraoNa = {}) {
  // padraoNok/padraoNa = { indice: "observação" }  (indices 1-based)
  return textos.map((texto, i) => {
    const idx = i + 1;
    if (padraoNok[idx] !== undefined) return { id: idx, texto, status: "nok", obs: padraoNok[idx], fotos: [] };
    if (padraoNa[idx]  !== undefined) return { id: idx, texto, status: "na",  obs: padraoNa[idx],  fotos: [] };
    return { id: idx, texto, status: "ok", obs: "", fotos: [] };
  });
}

function buildEquipamento(tipo, padroes = {}) {
  // padroes = { sectionId: { noks: {idx:obs}, nas: {idx:obs} } }
  const tpl = TIPOS_EQUIPAMENTO[tipo];
  return {
    id: Date.now() + Math.random(),
    tipo,
    nome: tpl.nome,
    sections: tpl.sections.map(s => {
      const p = padroes[s.id] || {};
      return { ...s, items: buildItemsComStatus(s.items, p.noks || {}, p.nas || {}) };
    }),
  };
}

function buildRelatorioPrologis() {
  return {
    id: 999001,
    contratoId: 1,
    visitaId: null,
    cliente: "Prologis Caxias II",
    os: "6751",
    codigo: "RMP-6751",
    revisao: "00",
    dataEmissao: "2026-03-03",
    tecnicoId: 1,
    tipo: "preventiva",
    freq: null,
    modo: "padrao",
    identificacao: {
      cliente: "Prologis Caxias II",
      empreendimento: "Condomínio Logístico CL Duque",
      local: "Rua Arterial PD-04, 3777 — Duque de Caxias/RJ",
      telefone: "(21) 3456-7890",
      contratoNum: "CT-001",
      os: "6751",
      inspetor: "Carlos Mendes",
      licenca: "CREA-SP 5060987",
      contratado: "LS Fire",
      enderecoContratado: "lsfire.com.br",
      periodoIni: "2026-02-23",
      periodoFim: "2026-03-03",
      responsavel: "Carlos Mendes",
      codigo: "RMP-6751",
      revisao: "00",
      dataEmissao: "2026-03-03",
    },
    nfpaGroups: null,
    casas: [
      {
        id: 1, nome: "G-100",
        instalacao: buildItemsComStatus(INSTALACAO_SKID,
          { 14: "Dreno do trocador de calor parcialmente obstruído por sedimentos. Realizada limpeza." },
          { 17: "Tanque externo, não há retorno de combustível ao skid." }
        ),
        equipamentos: [
          buildEquipamento("diesel", {
            bomba:    { noks: { 3: "Gaxeta com folga excessiva — realizado embuchamento e ajuste." } },
            testes:   { noks: { 25: "Sensor de baixo nível apresentou falha intermitente. Recomendada substituição do flutuador." } },
            inspecao: {},
            motor:    { noks: { 18: "Óleo lubrificante substituído (Mobil Delvac 15W40, 20L). Volume conforme manual." },
                        nas: { 26: "Bateria com menos de 1 ano de uso — substituição não aplicável neste ciclo." } },
          }),
          buildEquipamento("eletrica", {
            bomba: {},
            testes: { noks: { 22: "Indicação de defeito da soft-start ao testar — realizado reset, equipamento normalizou. Monitorar." } },
            inspecao: {},
          }),
          buildEquipamento("jockey", {
            inspecao: {},
            testes: {},
            manut: { noks: { 4: "Pequeno gotejamento na vedação dianteira — apertada gaxeta, vedação restabelecida." } },
          }),
          buildEquipamento("flowmeter"),
          buildEquipamento("valvula"),
        ],
      },
      {
        id: 2, nome: "G-300",
        instalacao: buildItemsComStatus(INSTALACAO_SKID,
          {},
          { 17: "Tanque externo, sem retorno." }
        ),
        equipamentos: [
          buildEquipamento("diesel", {
            bomba: {},
            testes: { nas: { 6: "Não foi possível realizar partida completa devido à manutenção do reservatório principal — testes elétricos validados." } },
            inspecao: {},
            motor: { noks: { 19: "Filtro de óleo substituído (Mann W 940/25). Filtros antigos com saturação dentro do esperado." } },
          }),
          buildEquipamento("eletrica"),
          buildEquipamento("jockey"),
          buildEquipamento("flowmeter"),
          buildEquipamento("valvula", {
            inspecao: { noks: { 2: "Waste Cone instalado mas com fixação solta. Reapertados parafusos de base." } },
          }),
        ],
      },
    ],
    corretiva: null,
    maoObra: [
      { id: 1, dataIni: "2026-02-23T07:30", dataFim: "2026-02-23T18:00" },
      { id: 2, dataIni: "2026-02-24T07:00", dataFim: "2026-02-24T17:30" },
      { id: 3, dataIni: "2026-02-25T07:00", dataFim: "2026-02-25T18:00" },
      { id: 4, dataIni: "2026-02-26T07:00", dataFim: "2026-02-26T17:30" },
      { id: 5, dataIni: "2026-02-27T07:00", dataFim: "2026-02-27T18:00" },
      { id: 6, dataIni: "2026-03-02T07:00", dataFim: "2026-03-02T18:00" },
      { id: 7, dataIni: "2026-03-03T07:00", dataFim: "2026-03-03T14:30" },
    ],
    deslocs: [
      { id: 1, dataIni: "2026-02-23T05:00", kmIni: "48230", dataFim: "2026-02-23T07:15", kmFim: "48312" },
      { id: 2, dataIni: "2026-03-03T15:00", kmIni: "48312", dataFim: "2026-03-03T17:20", kmFim: "48394" },
    ],
    trein: {
      houve: true,
      participantes: [
        { id: 1, nome: "Lucília Kênia",  empresa: "Prologis",         rg: "11.345.678-9" },
        { id: 2, nome: "Pedro Almeida",  empresa: "Prologis (manut.)",rg: "23.456.789-0" },
        { id: 3, nome: "Marcos Ribeiro", empresa: "Prologis (manut.)",rg: "34.567.890-1" },
      ],
    },
    obs: "Após submeter inspeção dos equipamentos e acessórios, realizando as manutenções preventivas conforme escopo contratado, verificamos que os equipamentos e seus acessórios encontram-se com funcionamento adequado, exceto os itens marcados como NÃO OK neste relatório.\n\nDestaques desta visita:\n• Substituição programada do óleo lubrificante dos motores diesel (G-100 e G-300) e respectivos filtros.\n• Ajuste de gaxeta na bomba centrífuga G-100 e na bomba jockey G-100.\n• Sensor de baixo nível de combustível G-100 apresentou falha — recomendada substituição na próxima visita.\n• Soft-start G-100 apresentou defeito intermitente — normalizado após reset. Monitoramento recomendado.\n• Reaperto de fixação do Waste Cone na válvula de alívio G-300.\n\nRecomendações para o cliente:\n• Programar a substituição do flutuador do sensor de nível de combustível G-100 em até 30 dias.\n• Manter o monitoramento do soft-start G-100 até a próxima visita.\n• Considerar limpeza completa do reservatório principal na janela de manutenção semestral.",
    assins: { cliente: "Lucília Kênia", tecnico: "Carlos Mendes" },
    stats: { ok: 252, nok: 8, na: 4, total: 264, done: 264, progress: 100 },
    conformidade: 97,
    criadoEm: "2026-03-03T18:00:00.000Z",
  };
}

const RELATORIO_PROLOGIS = buildRelatorioPrologis();

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
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+(\.\d+)?$/.test(raw)
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
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
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
    { key: "net", label: "Pressão líquida", color: C.orange, dash: "" },
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
        <text x={w / 2} y={16} textAnchor="middle" fontSize="13" fontWeight="800" fill={C.gray}>
          Teste de Aceitação da Bomba de Incêndio - Fire Pump Acceptance Test
        </text>
        <text x={w / 2} y={31} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.grayMid}>
          {chartSubtitle}
        </text>

        {xTicks.map((t, i) => (
          <g key={`x-${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + ih} stroke={i % 2 === 0 ? "#BFBFBF" : "#E5E5E5"} strokeWidth={i % 2 === 0 ? 1 : 0.7} strokeDasharray={i % 2 === 0 ? "" : "3 3"} />
            <text x={sx(t)} y={m.t + ih + 17} textAnchor="middle" fontSize="10" fill={C.gray}>{t}</text>
          </g>
        ))}
        {yTicks.map((t, i) => (
          <g key={`y-${t}`}>
            <line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke={i % 2 === 0 ? "#BFBFBF" : "#E5E5E5"} strokeWidth={i % 2 === 0 ? 1 : 0.7} strokeDasharray={i % 2 === 0 ? "" : "3 3"} />
            <text x={m.l - 8} y={sy(t) + 3} textAnchor="end" fontSize="10" fill={C.gray}>{t}</text>
          </g>
        ))}

        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="#111" strokeWidth="1.2" />
        <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + ih} stroke="#111" strokeWidth="1.2" />
        <text x={m.l + iw / 2} y={h - 14} textAnchor="middle" fontSize="11" fill={C.gray}>Vazão ({getUnitLabel("flow", flowUnit)})</text>
        <text x="15" y={m.t + ih / 2} textAnchor="middle" fontSize="11" fill={C.gray} transform={`rotate(-90 15 ${m.t + ih / 2})`}>Pressão ({getUnitLabel("pressure", pressureUnit)})</text>

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
              <text x="34" y="4" fontSize="10" fill={C.gray}>{def.label}</text>
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
        <text x={w / 2} y={16} textAnchor="middle" fontSize="13" fontWeight="800" fill={C.gray}>
          Corrente do Motor Elétrico
        </text>
        {xTicks.map(t => (
          <g key={`px-${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + ih} stroke="#E5E5E5" strokeDasharray="3 3" />
            <text x={sx(t)} y={m.t + ih + 16} textAnchor="middle" fontSize="10" fill={C.gray}>{t}</text>
          </g>
        ))}
        {yTicks.map(t => (
          <g key={`py-${t}`}>
            <line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke="#E5E5E5" strokeDasharray="3 3" />
            <text x={m.l - 8} y={sy(t) + 3} textAnchor="end" fontSize="10" fill={C.gray}>{t}</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="#111" />
        <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + ih} stroke="#111" />
        <text x={m.l + iw / 2} y={h - 12} textAnchor="middle" fontSize="11" fill={C.gray}>Vazão ({getUnitLabel("flow", flowUnit)})</text>
        <text x="15" y={m.t + ih / 2} textAnchor="middle" fontSize="11" fill={C.gray} transform={`rotate(-90 15 ${m.t + ih / 2})`}>Corrente (A)</text>
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
              <text x="34" y="4" fontSize="10" fill={C.gray}>{def.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function Avatar({ tec, size = 32 }) {
  if (!tec) return null;
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
         style={{ width: size, height: size, background: tec.cor, fontSize: size * 0.4 }} title={tec.nome}>
      {tec.iniciais}
    </div>
  );
}

function Modal({ open, onClose, title, children, wide, full }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col"
           style={{ maxWidth: full ? "calc(100vw - 32px)" : wide ? 1100 : 640, width: "100%", maxHeight: "92vh" }}>
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b" style={{ borderColor: C.border }}>
          <h3 className="text-base sm:text-lg font-bold break-words" style={{ color: C.gray }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 shrink-0"><X size={20} /></button>
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
        <button type="button" onClick={limpar} className="text-[11px] font-bold" style={{ color: C.orange }}>Limpar assinatura</button>
      </div>
    </div>
  );
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readAttachmentFile(file, categoria) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve({
      id: Date.now() + Math.random(),
      nome: file.name,
      tipo: file.type || "application/octet-stream",
      tamanho: file.size,
      categoria,
      anexadoEm: new Date().toISOString(),
      data: ev.target.result,
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
           style={{ borderColor: required ? C.orange : C.border, color: required ? C.orange : C.gray }}>
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
          <FileText size={14} style={{ color: C.orange }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: C.gray }}>{a.nome}</div>
            <div className="text-[10px]" style={{ color: C.grayMid }}>{a.categoria} · {formatBytes(a.tamanho)}</div>
          </div>
          {a.data && (
            <a href={a.data} download={a.nome} className="text-[10px] font-bold underline" style={{ color: C.orange }}>
              Baixar
            </a>
          )}
          {onRemove && (
            <button onClick={() => onRemove(a.id)} className="p-1 rounded hover:bg-red-50" style={{ color: C.nok }}>
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
              <FileText size={14} style={{ color: C.orange }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate" style={{ color: C.gray }}>{a.nome}</div>
                <div className="text-[10px]" style={{ color: C.grayMid }}>{a.categoria} · {formatBytes(a.tamanho)} · {a.tipo || "arquivo"}</div>
              </div>
              {a.data && (
                <a href={a.data} download={a.nome} className="text-[10px] font-bold underline print:hidden" style={{ color: C.orange }}>
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
              <pre style={{ margin: 0, padding: 10, fontSize: 10, lineHeight: 1.45, whiteSpace: "pre-wrap", color: C.gray, background: "#fff", maxHeight: 300, overflow: "hidden" }}>
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

function GlobalFonts() {
  return (
    <style data-lsfire-fonts="true">{`
        src: url(data:font/woff2;charset=utf-8;base64,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) format("woff2");
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Roboto Mono";
        src: url(data:font/woff2;charset=utf-8;base64,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) format("woff2");
        font-weight: 100 700;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --font-display: "Montserrat", "Arial Black", Arial, sans-serif;
        --font-body: "Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      }

      /* Corpo/texto: Roboto Mono em toda a interface do app (não afeta os
         relatórios impressos/PDF, que seguem o padrão visual LS Fire em Arial). */
      .lsfire-app-shell {
        font-family: var(--font-body);
      }
      .lsfire-app-shell input,
      .lsfire-app-shell select,
      .lsfire-app-shell textarea,
      .lsfire-app-shell button {
        font-family: inherit;
      }

      /* Títulos e subtítulos: Montserrat em toda a interface do app */
      .lsfire-app-shell h1,
      .lsfire-app-shell h2,
      .lsfire-app-shell h3,
      .lsfire-app-shell h4,
      .lsfire-app-shell h5,
      .lsfire-app-shell h6,
      .lsfire-app-shell .font-display {
        font-family: var(--font-display);
        letter-spacing: -0.01em;
      }

      /* ─── Refino visual (sem alterar cores nem estrutura) ─────────────── */

      /* Elevação sutil dos cards: hairline + sombra macia, para "descolarem"
         do fundo em vez de parecerem caixas desenhadas. */
      .lsfire-app-shell .rounded-xl.border {
        box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.04);
        transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
      }
      /* Cards clicáveis (são <button>) ganham leve elevação no hover */
      .lsfire-app-shell button.rounded-xl.border:hover,
      .lsfire-app-shell .hover\\:shadow-md:hover {
        box-shadow: 0 6px 16px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.05);
        transform: translateY(-1px);
        border-color: #FFD9BF;
      }

      /* Microinteração de toque: todo botão afunda 1px ao ser pressionado */
      .lsfire-app-shell button { transition: transform 0.08s ease, box-shadow 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease; }
      .lsfire-app-shell button:active:not(:disabled) { transform: translateY(1px); }

      /* Foco de teclado consistente e na cor da marca (acessibilidade + acabamento) */
      .lsfire-app-shell a:focus-visible,
      .lsfire-app-shell button:focus-visible {
        outline: 2px solid #FF6600;
        outline-offset: 2px;
        border-radius: 8px;
      }

      /* Campos: anel de foco laranja no lugar do azul padrão do navegador.
         Usa só box-shadow (não mexe na cor da borda, que alguns campos
         alteram inline para vermelho em caso de erro). */
      .lsfire-app-shell input:focus,
      .lsfire-app-shell select:focus,
      .lsfire-app-shell textarea:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(255, 102, 0, 0.15);
      }

      /* Item do menu lateral: hover discreto (o ativo continua laranja, via inline) */
      .lsfire-nav-item:hover { background: #FFF4ED; }

      /* Botões de ação sólidos (texto branco) ganham peso com sombra sutil */
      .lsfire-app-shell button.text-white:not(:disabled) { box-shadow: 0 1px 2px rgba(16, 24, 40, 0.10); }
      .lsfire-app-shell button.text-white:not(:disabled):hover { box-shadow: 0 4px 12px rgba(16, 24, 40, 0.16); }

      /* Barra de rolagem discreta, laranja ao passar o mouse */
      .lsfire-app-shell ::-webkit-scrollbar { width: 10px; height: 10px; }
      .lsfire-app-shell ::-webkit-scrollbar-track { background: transparent; }
      .lsfire-app-shell ::-webkit-scrollbar-thumb { background: #D4D4D4; border-radius: 8px; border: 2px solid #FFFFFF; background-clip: padding-box; }
      .lsfire-app-shell ::-webkit-scrollbar-thumb:hover { background: #FF6600; border-color: #FFFFFF; }

      /* Seleção de texto na cor da marca */
      .lsfire-app-shell ::selection { background: rgba(255, 102, 0, 0.18); }
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
// SEGURANÇA — Perfis, permissões, hash de senha, contexto de autenticação
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

// SHA-256 puro em JS — determinístico e síncrono, funciona em qualquer contexto
// (online, offline, iframe sandbox, app nativo). Não depende de crypto.subtle.
function sha256Hex(ascii) {
  function rr(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const maxWord = Math.pow(2, 32);
  let result = "";
  const words = [];
  const asciiBitLength = ascii.length * 8;
  let hash = sha256Hex.h = sha256Hex.h || [];
  const k = sha256Hex.k = sha256Hex.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
      hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
          ) | 0);
      const temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : "") + b.toString(16);
    }
  }
  return result;
}

// Hash de senha (síncrono). Converte UTF-8 → bytes antes para suportar acentos.
// NOTA: client-side tem limites — não substitui bcrypt/PBKDF2 num backend, mas
// evita senha em texto plano no dispositivo e é consistente em qualquer ambiente.
function hashSenha(senha, salt = "lsfire-2026") {
  const utf8 = unescape(encodeURIComponent(salt + "::" + senha));
  return sha256Hex(utf8);
}

// ── Esquema reforçado (v2): salt aleatório POR USUÁRIO + várias iterações ──
// Isso evita que um único "rainbow table" sirva para todas as contas (cada
// usuário tem seu próprio salt) e torna a força bruta bem mais lenta que um
// único SHA-256. Contas antigas (criadas antes desta atualização) continuam
// funcionando e são migradas automaticamente para o esquema v2 no próximo login.
const HASH_V2_ROUNDS = 3000;

function gerarSalt(tamanhoBytes = 16) {
  try {
    const arr = new Uint8Array(tamanhoBytes);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // fallback para ambientes sem crypto.getRandomValues — ainda assim único por criação
    return Array.from({ length: tamanhoBytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
  }
}

function hashSenhaV2(senha, salt, rounds = HASH_V2_ROUNDS) {
  let h = sha256Hex(unescape(encodeURIComponent(salt + "::" + senha)));
  for (let i = 1; i < rounds; i++) h = sha256Hex(unescape(encodeURIComponent(h + "::" + salt)));
  return h;
}

// Gera as credenciais para um usuário novo ou redefinição de senha (sempre no esquema v2)
function criarCredenciais(senha) {
  const senhaSalt = gerarSalt();
  return { senhaHash: hashSenhaV2(senha, senhaSalt), senhaSalt, senhaAlgo: "v2" };
}

// Verifica a senha digitada contra o registro do usuário, suportando contas
// antigas (esquema legado, salt fixo) e novas (esquema v2, salt próprio)
function verificarSenha(u, senhaDigitada) {
  if (u?.senhaAlgo === "v2" && u.senhaSalt) return hashSenhaV2(senhaDigitada, u.senhaSalt) === u.senhaHash;
  return hashSenha(senhaDigitada) === u?.senhaHash;
}

// Usuário administrador inicial (senha padrão: lsfire123 — trocar no primeiro acesso)
const SENHA_PADRAO_ADMIN = "lsfire123";
function usuariosIniciais(credenciais) {
  return [
    { id: 1, nome: "Administrador", login: "admin", perfil: "admin", ...credenciais, ativo: true, clienteId: null, criadoEm: new Date().toISOString() },
  ];
}

// Contexto de autenticação — disponibiliza sessão, checagem de permissão e log de auditoria
const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext) || { sessao: null, can: () => false, logAudit: () => {} }; }

const TIMEOUT_INATIVIDADE_MS = 15 * 60 * 1000; // 15 minutos

// ═══════════════════════════════════════════════════════════════════════════
// APP RAIZ
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // ─── Segurança ───────────────────────────────────────────────────────────
  const [usuarios, setUsuarios] = useState(() => usuariosIniciais(criarCredenciais(SENHA_PADRAO_ADMIN)));
  const [sessao, setSessao] = useState(null);       // { userId, perfil, nome, login, clienteId, loginEm }
  const [bloqueado, setBloqueado] = useState(false); // tela travada por inatividade
  const [auditoria, setAuditoria] = useState([]);
  const [bootReady, setBootReady] = useState(false);
  const [usuarioEdit, setUsuarioEdit] = useState(null);
  const [syncStatus, setSyncStatus] = useState({
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    pending: 0,
    syncing: false,
    lastSync: null,
    error: "",
  });
  const inactivityTimer = useRef(null);

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
        const s = { userId: m.id, perfil: m.servico, nome: m.nome, login: m.login, clienteId: m.clienteId ?? null, tecnicoId: m.tecnicoId ?? null, nivelPricer: m.nivelPricer || 0, loginEm: Date.now(), ultimaAtividade: Date.now() };
        try { localStorage.setItem(ME_CACHE_KEY, JSON.stringify(s)); } catch {}
        return s.perfil && s.perfil !== "nenhum" ? s : null;
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
    const c = await loadStore("contratos");  if (c) setContratos(c);
    const t = await loadStore("tecnicos");   if (t) setTecnicos(t);
    const v = await loadStore("visitas");    if (v) setVisitas(v);
    const r = await loadStore("relatorios");
    if (r) {
      setRelatorios(r);
    }
    const au = await loadStore("auditoria"); if (au) setAuditoria(au);
    const nt = await loadStore("notificacoes"); if (nt) setNotificacoes(nt);

    const me = await carregarMe();
    if (me) setSessao(me);

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

  const sincronizarAgora = async () => {
    setSyncStatus(s => ({ ...s, syncing: true, error: "" }));
    try {
      await window.offlineSync?.syncNow?.();
      const fresh = await hydrateStore();
      await reconciliarNumerosProvisorios(fresh);
      await refreshSyncStatus({ syncing: false, error: "" });
    } catch (error) {
      await refreshSyncStatus({ syncing: false, error: error?.message || "Nao foi possivel sincronizar agora." });
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      await hydrateStore();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          await window.offlineSync?.syncNow?.();
          const fresh = await hydrateStore();
          await reconciliarNumerosProvisorios(fresh);
        } catch {}
      }
      if (active) {
        setBootReady(true);
        refreshSyncStatus();
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/servico/sw.js", { scope: "/servico/" }).catch(() => {});
    }

    const handleOnline = () => sincronizarAgora();
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
      if (navigator.onLine) sincronizarAgora();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bootReady]);

  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("contratos", JSON.stringify(contratos)); } catch {} })(); }, [contratos, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("tecnicos",  JSON.stringify(tecnicos));  } catch {} })(); }, [tecnicos, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("visitas",   JSON.stringify(visitas));   } catch {} })(); }, [visitas, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("relatorios",JSON.stringify(relatorios));} catch {} })(); }, [relatorios, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("notificacoes",JSON.stringify(notificacoes));} catch {} })(); }, [notificacoes, bootReady]);
  useEffect(() => { if (bootReady) (async () => { try { await window.storage?.set?.("auditoria", JSON.stringify(auditoria));} catch {} })(); }, [auditoria, bootReady]);

  // Timeout de inatividade — bloqueia a tela após 15 min sem interação
  useEffect(() => {
    if (!sessao || bloqueado || true) return;
    const reset = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      // Atualiza a "última atividade" na sessão persistida
      (async () => { try { await window.storage?.set?.("sessao", JSON.stringify({ ...sessao, ultimaAtividade: Date.now() })); } catch {} })();
      inactivityTimer.current = setTimeout(() => {
        setBloqueado(true);
        logAudit("bloqueio", "Sessão bloqueada por inatividade");
      }, TIMEOUT_INATIVIDADE_MS);
    };
    const eventos = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    eventos.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { if (inactivityTimer.current) clearTimeout(inactivityTimer.current); eventos.forEach(e => window.removeEventListener(e, reset)); };
  }, [sessao, bloqueado]);

  // Handlers de autenticação
  const fazerLogin = async (login, senha) => {
    const u = usuarios.find(x => x.login.toLowerCase() === login.toLowerCase().trim() && x.ativo);
    if (!u) return { erro: "Usuário não encontrado ou inativo." };
    if (!verificarSenha(u, senha)) return { erro: "Senha incorreta." };
    // Migração transparente: contas antigas (salt fixo) passam para o esquema
    // reforçado (salt próprio + iterações) automaticamente neste login.
    if (u.senhaAlgo !== "v2") {
      const cred = criarCredenciais(senha);
      setUsuarios(us => us.map(x => x.id === u.id ? { ...x, ...cred } : x));
    }
    const novaSessao = { userId: u.id, perfil: u.perfil, nome: u.nome, login: u.login, clienteId: u.clienteId || null, tecnicoId: u.tecnicoId || null, loginEm: Date.now(), ultimaAtividade: Date.now() };
    setSessao(novaSessao);
    setBloqueado(false);
    setTab("dashboard");
    try { await window.storage?.set?.("sessao", JSON.stringify(novaSessao)); } catch {}
    setAuditoria(a => [{ id: Date.now() + Math.random(), timestamp: new Date().toISOString(), usuario: u.nome, login: u.login, perfil: u.perfil, acao: "login", detalhe: `${u.nome} entrou no sistema` }, ...a].slice(0, 500));
    return { ok: true };
  };

  const fazerLogout = async () => {
    logAudit("logout", `${sessao?.nome} saiu do sistema`);
    try { await window.offlineSync?.syncNow?.(); } catch {}
    try { localStorage.removeItem(ME_CACHE_KEY); } catch {}
    try { await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: API_HEADERS }); } catch {}
    try { window.top.location.replace("/login"); } catch { window.location.replace("/login"); }
  };

  // Rede de segurança: recria o usuário admin padrão (caso de senha perdida/storage corrompido)
  const restaurarAcessoPadrao = () => {
    const cred = criarCredenciais(SENHA_PADRAO_ADMIN);
    setUsuarios(us => {
      const semAdmin = us.filter(u => u.login !== "admin");
      return [{ id: 1, nome: "Administrador", login: "admin", perfil: "admin", ...cred, ativo: true, clienteId: null, criadoEm: new Date().toISOString() }, ...semAdmin];
    });
    return { ok: true };
  };

  const desbloquear = async (senha) => {
    const u = usuarios.find(x => x.id === sessao.userId);
    if (!u) { fazerLogout(); return { erro: "Sessão inválida." }; }
    if (!verificarSenha(u, senha)) return { erro: "Senha incorreta." };
    setBloqueado(false);
    logAudit("desbloqueio", "Sessão desbloqueada");
    return { ok: true };
  };

  const saveUsuario = async (data, novaSenha) => {
    // Impede dois usuários com o mesmo login — sem essa checagem, o segundo
    // usuário cadastrado nunca conseguiria entrar (a busca no login sempre
    // retorna o primeiro que encontrar).
    const loginNormalizado = (data.login || "").trim().toLowerCase();
    const duplicado = usuarios.some(u => u.id !== data.id && u.login.toLowerCase() === loginNormalizado);
    if (duplicado) return { erro: `Já existe um usuário com o login "${data.login}". Escolha outro login.` };
    const cred = novaSenha ? criarCredenciais(novaSenha) : {};
    setUsuarios(us => {
      if (data.id) {
        logAudit("usuario_editado", `Usuário ${data.nome} (${data.login}) atualizado`);
        return us.map(u => u.id === data.id ? { ...u, ...data, ...cred } : u);
      }
      logAudit("usuario_criado", `Usuário ${data.nome} (${data.login}) criado — perfil ${data.perfil}`);
      return [...us, { ...data, ...cred, id: Date.now(), criadoEm: new Date().toISOString() }];
    });
    return { ok: true };
  };

  const deleteUsuario = (id) => {
    const u = usuarios.find(x => x.id === id);
    if (u?.login === "admin") { alert("O usuário administrador principal não pode ser excluído."); return; }
    logAudit("usuario_excluido", `Usuário ${u?.nome} (${u?.login}) excluído`);
    setUsuarios(us => us.filter(x => x.id !== id));
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
    setNotificacoes(ns => [n, ...ns].slice(0, 300));
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
  const minhasNotificacoes = useMemo(() => {
    if (!sessao) return [];
    return notificacoes.filter(n => {
      if (n.tipo === "novo_pendente") return APROVADOR_PERFIS.includes(sessao.perfil);
      if (sessao.perfil !== "tecnico") return false;
      if (!n.tecnicoId) return true; // relatório sem técnico definido — aviso vale para qualquer técnico
      return n.tecnicoId === sessao.tecnicoId;
    });
  }, [notificacoes, sessao]);

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

  const notificacoesParaExibir = useMemo(
    () => minhasNotificacoes.map(n => ({ ...n, lida: !!n.lidaPor?.includes(sessao?.userId) })),
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
    usuarios,
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
          <a href="/login?volta=/servico/" className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.orange }}>Entrar</a>
        </div>
      </div>
    );
  }

  // Autenticado mas bloqueado por inatividade → tela de bloqueio
  if (bloqueado) {
    return <LockScreen sessao={sessao} onUnlock={desbloquear} onLogout={fazerLogout} />;
  }

  // Cliente só enxerga relatórios dos seus contratos
  const perfilAtual = sessao.perfil;
  const contratosVisiveis = can(perfilAtual, "verTodosContratos")
    ? contratos
    : contratos.filter(c => c.id === sessao.clienteId);
  const relatoriosVisiveis = can(perfilAtual, "verTodosContratos")
    ? relatorios
    : relatorios.filter(r => r.contratoId === sessao.clienteId);

  return (
    <AuthContext.Provider value={authValue}>
    <div className="min-h-screen flex lsfire-app-shell" style={{ background: C.white, color: C.gray }}>
      <GlobalFonts />
      <PrintStyles />

      {/* Overlay do menu mobile (some no desktop) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 sm:hidden print:hidden" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setMobileNavOpen(false)} />
      )}

      {/* SIDEBAR — fixa/off-canvas no mobile, estática no desktop (md+) */}
      <aside className={`fixed sm:relative inset-y-0 left-0 z-50 w-72 sm:w-56 border-r flex flex-col print:hidden transform transition-transform duration-200 sm:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
             style={{ borderColor: C.border, background: C.white }}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <LogoLSFire size={36} />
          <div className="flex items-center gap-1">
            <NotificationBell notificacoes={notificacoesParaExibir} naoLidas={notificacoesNaoLidas.length} onOpenNotificacao={abrirNotificacao} onMarkAllRead={marcarTodasNotificacoesLidas} />
            <button onClick={() => setMobileNavOpen(false)} className="p-1 rounded hover:bg-gray-100 sm:hidden"><X size={20} /></button>
          </div>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          {[
            { id: "dashboard",  label: "Dashboard",  Icon: Home,      show: true },
            { id: "meus-atendimentos", label: perfilAtual === "tecnico" ? "Meus Atendimentos" : "Atend. por Técnico", Icon: ClipboardCheck, show: perfilAtual === "tecnico" || can(perfilAtual, "aprovarRelatorios") },
            { id: "contratos",  label: "Contratos",  Icon: Building2, show: true },
            { id: "agenda",     label: "Agenda",     Icon: Calendar,  show: can(perfilAtual, "agendar") || can(perfilAtual, "inspecionar") },
            { id: "visitas",    label: "Visitas Técnicas", Icon: ClipboardList, show: can(perfilAtual, "agendar") || can(perfilAtual, "inspecionar") || can(perfilAtual, "verRelatorios") },
            { id: "tecnicos",   label: "Técnicos",   Icon: Users,     show: can(perfilAtual, "verTecnicos") },
            { id: "relatorios", label: "Relatórios", Icon: FileText,  show: can(perfilAtual, "verRelatorios") },
            { id: "aprovacoes", label: "Aprovações", Icon: ShieldCheck, show: can(perfilAtual, "aprovarRelatorios") },
            { id: "usuarios",   label: "Usuários",   Icon: UserCog,   show: false }, // no servidor: Pricer → Configurações → Usuários e acessos
            { id: "auditoria",  label: "Auditoria",  Icon: ScrollText,show: can(perfilAtual, "verAuditoria") },
          ].filter(x => x.show).map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => { setTab(id); setMobileNavOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-semibold transition ${active ? "" : "lsfire-nav-item"}`}
                      style={{ background: active ? C.orange : undefined, color: active ? "#fff" : C.gray, boxShadow: active ? "0 2px 8px rgba(255,102,0,0.28)" : undefined }}>
                <Icon size={18} />{label}
              </button>
            );
          })}
        </nav>

        <SyncStatusPanel status={syncStatus} onSync={sincronizarAgora} />

        {/* Usuário logado + sair */}
        <div className="px-3 py-3 border-t" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg mb-2" style={{ background: C.grayLight }}>
            {(() => { const Pi = PERFIS[perfilAtual]?.Icon || User; return <Pi size={18} style={{ color: PERFIS[perfilAtual]?.cor }} />; })()}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate" style={{ color: C.gray }}>{sessao.nome}</div>
              <div className="text-[10px] truncate" style={{ color: PERFIS[perfilAtual]?.cor }}>{PERFIS[perfilAtual]?.nome}</div>
            </div>
          </div>
          {(sessao.nivelPricer || 0) >= 1 && window.top === window && (
            <a href="/" className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold mb-1 hover:bg-gray-100" style={{ color: C.grayMid }}>
              <DollarSign size={14} /> Abrir o LS Pricer
            </a>
          )}
          <button onClick={fazerLogout}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50" style={{ color: C.nok }}>
            <LogOut size={14} /> Sair
          </button>
        </div>

        <div className="p-4 border-t text-center" style={{ borderColor: C.border }}>
          <div className="text-[10px] font-bold tracking-wider font-display" style={{ color: C.orange }}>A FORÇA DA ÁGUA</div>
          <div className="text-[10px] font-bold tracking-wider font-display" style={{ color: C.orange }}>É A NOSSA FORÇA</div>
          <div className="text-[9px] mt-1" style={{ color: C.grayMid }}>lsfire.com.br</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Barra superior — só no mobile (some no desktop e na impressão) */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b sm:hidden print:hidden" style={{ background: C.white, borderColor: C.border }}>
          <button onClick={() => setMobileNavOpen(true)} className="p-1.5 rounded hover:bg-gray-100"><Menu size={22} style={{ color: C.gray }} /></button>
          <LogoLSFire size={26} />
          <div className="flex-1" />
          <NotificationBell notificacoes={notificacoesParaExibir} naoLidas={notificacoesNaoLidas.length} onOpenNotificacao={abrirNotificacao} onMarkAllRead={marcarTodasNotificacoesLidas} />
        </div>
        {tab === "dashboard"  && <Dashboard visitas={visitas} contratos={contratosVisiveis} relatorios={relatoriosVisiveis} tecnicos={tecnicos} kpiActions={kpiActions} podeAprovar={can(perfilAtual, "aprovarRelatorios")} tecnicoId={perfilAtual === "tecnico" ? sessao?.tecnicoId : null} onOpenContrato={setContratoModal} onOpenVisita={(v) => v.despacho ? setItmFor(v) : setDespachoFor(v)} />}
        {tab === "meus-atendimentos" && (perfilAtual === "tecnico" || can(perfilAtual, "aprovarRelatorios")) && <MeusAtendimentosView visitas={visitas} contratos={contratosVisiveis} tecnicos={tecnicos} tecnicoId={sessao?.tecnicoId} souGestor={perfilAtual !== "tecnico"} onDespacho={setDespachoFor} onItm={setItmFor} onDocumento={setDocumentoInternoFor} />}
        {tab === "contratos"  && <Contratos contratos={contratosVisiveis} visitas={visitas} relatorios={relatoriosVisiveis} tecnicos={tecnicos} onOpen={setContratoModal} onNew={() => setContratoEdit({})} />}
        {tab === "agenda"     && <Agenda visitas={visitas} contratos={contratosVisiveis} tecnicos={tecnicos} onDespacho={setDespachoFor} onItm={setItmFor} onDocumento={setDocumentoInternoFor} />}
        {tab === "visitas"    && <VisitasTecnicas visitas={visitas} relatorios={relatoriosVisiveis} contratos={contratosVisiveis} tecnicos={tecnicos} onDespacho={setDespachoFor} onItm={setItmFor} onDocumento={setDocumentoInternoFor} onViewRel={setPreviewRel} onDeleteVisita={deleteVisita} />}
        {tab === "tecnicos"   && can(perfilAtual, "verTecnicos") && <TecnicosView tecnicos={tecnicos} visitas={visitas} onNew={() => setTecnicoEdit({})} onEdit={setTecnicoEdit} onDelete={deleteTecnico} />}
        {tab === "relatorios" && <Relatorios relatorios={relatoriosVisiveis} contratos={contratosVisiveis} onView={setPreviewRel} onDelete={deleteRelatorio} />}
        {tab === "aprovacoes" && can(perfilAtual, "aprovarRelatorios") && <AprovacoesView relatorios={relatoriosVisiveis} onView={setPreviewRel} />}
        {tab === "usuarios"   && can(perfilAtual, "gerenciarUsuarios") && <UsuariosView usuarios={usuarios} contratos={contratos} onNew={() => setUsuarioEdit({})} onEdit={setUsuarioEdit} onDelete={deleteUsuario} />}
        {tab === "auditoria"  && can(perfilAtual, "verAuditoria") && <AuditoriaView auditoria={auditoria} />}
      </main>

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-40 print:hidden">
        {fabOpen && (
          <div className="absolute bottom-16 right-0 bg-white rounded-xl shadow-xl border p-2 w-64 mb-2" style={{ borderColor: C.border }}>
            {can(perfilAtual, "agendar") && (
              <button onClick={() => { setNewVisitOpen({}); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <Calendar size={16} style={{ color: C.orange }} /> Nova Visita
              </button>
            )}
            {can(perfilAtual, "gerenciarContratos") && (
              <button onClick={() => { setContratoEdit({}); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <Building2 size={16} style={{ color: C.orange }} /> Novo Contrato
              </button>
            )}
            {can(perfilAtual, "gerenciarTecnicos") && (
              <button onClick={() => { setTecnicoEdit({}); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <User size={16} style={{ color: C.orange }} /> Novo Técnico
              </button>
            )}
            {can(perfilAtual, "inspecionar") && (
              <button onClick={() => { setNewVisitOpen({ avulsa: true }); setFabOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded text-sm font-semibold flex items-center gap-2 hover:bg-orange-50">
                <FilePlus2 size={16} style={{ color: C.orange }} /> Relatório Avulso
              </button>
            )}
          </div>
        )}
        {(can(perfilAtual, "agendar") || can(perfilAtual, "gerenciarContratos") || can(perfilAtual, "gerenciarTecnicos") || can(perfilAtual, "inspecionar")) && (
          <button onClick={() => setFabOpen(f => !f)}
                  className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition"
                  style={{ background: C.orange, color: "#fff" }}>
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
        <Modal open onClose={() => setNewVisitOpen(null)} title={newVisitOpen?.avulsa ? "Relatório Avulso" : "Nova Visita"}>
          <NewVisitForm contratos={contratosVisiveis} tecnicos={tecnicos} initial={newVisitOpen}
            onCreate={(visita, action) => {
              const visitaCriada = ensureAtendimentoRef({ ...visita, id: Date.now(), avulsa: !!newVisitOpen?.avulsa, status: "agendada", despacho: null, relatorio: null });
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
        <Modal open onClose={() => setContratoEdit(null)} title={contratoEdit?.id ? "Editar Contrato" : "Novo Contrato"} wide>
          <ContratoForm initial={contratoEdit} tecnicos={tecnicos} onSave={saveContrato} />
        </Modal>
      )}

      {tecnicoEdit !== null && (
        <Modal open onClose={() => setTecnicoEdit(null)} title={tecnicoEdit?.id ? "Editar Técnico" : "Novo Técnico"}>
          <TecnicoForm initial={tecnicoEdit} onSave={saveTecnico} />
        </Modal>
      )}

      {usuarioEdit !== null && (
        <Modal open onClose={() => setUsuarioEdit(null)} title={usuarioEdit?.id ? "Editar Usuário" : "Novo Usuário"}>
          <UsuarioForm initial={usuarioEdit} contratos={contratos} usuarios={usuarios} tecnicos={tecnicos}
            onSave={async (data, novaSenha) => {
              const r = await saveUsuario(data, novaSenha);
              if (r?.erro) { alert(r.erro); return; }
              setUsuarioEdit(null);
            }} />
        </Modal>
      )}

      {despachoFor && (
        <Modal open onClose={() => setDespachoFor(null)} title={`Checklist de Despacho — ${despachoFor.referencia ? despachoFor.referencia + " | " : ""}${contratos.find(c => c.id === despachoFor.contratoId)?.cliente || "Visita avulsa"}`} wide>
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
          onSaveDraft={(snap) => {
            setVisitas(vs => {
              const existe = vs.some(v => v.id === itmFor.id);
              if (existe) return vs.map(v => v.id === itmFor.id ? { ...v, rascunhoItm: snap } : v);
              return [...vs, { ...itmFor, rascunhoItm: snap, status: "rascunho" }];
            });
            logAudit("rascunho_salvo", `Rascunho do atendimento ${itmFor.referencia || itmFor.codigoAtendimento || itmFor.id} salvo`);
            // Alguém diferente do técnico responsável começou a preencher este
            // atendimento (de qualquer tipo — ITM, avulso, contrato, start-up
            // etc.) e parou num rascunho: avisa o técnico na primeira gravação.
            // O sinal de "primeira vez" é não ter rascunho ANTES desta gravação
            // — não se a visita já existia no array, porque visitas de contrato
            // já existem desde o agendamento (diferente de avulso). Sem essa
            // distinção, o aviso nunca disparava para atendimentos de contrato.
            const jaTinhaRascunho = !!itmFor.rascunhoItm;
            if (!jaTinhaRascunho && itmFor.status !== "devolvida" && itmFor.tecnicoId && itmFor.tecnicoId !== sessao?.tecnicoId) {
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
        <Modal open onClose={() => setDocumentoInternoFor(null)} title="Documento Interno do Atendimento" full>
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
    <div className="border rounded-xl p-5" style={{ borderColor: C.border, background: "#fff" }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.grayMid }}>{title}</div>
        {hint && <div className="text-[10px]" style={{ color: C.grayMid }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function DashStat({ label, value, sub, accent = C.orange, Icon }) {
  return (
    <div className="border rounded-xl p-4 flex items-center gap-3" style={{ borderColor: C.border, background: "#fff" }}>
      {Icon && <div className="rounded-lg p-2.5" style={{ background: accent + "1A" }}><Icon size={20} style={{ color: accent }} /></div>}
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
  const today = new Date().toISOString().slice(0, 10);
  const kpis = useMemo(() => ({
    contratos: contratos.length,
    tecnicos: tecnicos.length,
    agendadas: visitas.filter(v => v.status === "agendada").length,
    concluidas: visitas.filter(v => v.status === "concluida").length,
    atrasadas: visitas.filter(v => v.status === "agendada" && v.data < today).length,
    relatorios: relatorios.length,
    aguardandoAprovacao: relatorios.filter(r => getRelApprovalStatus(r) === "pendente").length,
    meusAtendimentos: tecnicoId ? visitas.filter(v => v.tecnicoId === tecnicoId && v.status !== "concluida").length : 0,
  }), [visitas, contratos, relatorios, tecnicos, today, tecnicoId]);

  const proximas = visitas.filter(v => v.status === "agendada").sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5);

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
        <h1 className="text-3xl font-black mb-1" style={{ color: C.gray }}>Dashboard</h1>
        <p className="text-sm" style={{ color: C.grayMid }}>Visão geral do sistema LS Fire</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KPI label="Contratos"  value={kpis.contratos}  Icon={Building2}     onClick={kpiActions.contratos} />
        <KPI label="Técnicos"   value={kpis.tecnicos}   Icon={Users}         onClick={kpiActions.tecnicos} />
        <KPI label="Agendadas"  value={kpis.agendadas}  Icon={Calendar}      onClick={kpiActions.agendadas} />
        <KPI label="Concluídas" value={kpis.concluidas} Icon={CheckCircle2}  onClick={kpiActions.concluidas} accent={C.ok} />
        <KPI label="Atrasadas"  value={kpis.atrasadas}  Icon={AlertTriangle} onClick={kpiActions.atrasadas} accent={C.nok} />
        <KPI label="Relatórios" value={kpis.relatorios} Icon={FileText}      onClick={kpiActions.relatorios} />
        {podeAprovar && <KPI label="Aguardando aprovação" value={kpis.aguardandoAprovacao} Icon={ShieldCheck} onClick={kpiActions.aprovacoes} accent={kpis.aguardandoAprovacao > 0 ? "#92400E" : C.grayMid} />}
        {tecnicoId && <KPI label="Meus atendimentos" value={kpis.meusAtendimentos} Icon={ClipboardCheck} onClick={kpiActions.meusAtendimentos} accent={kpis.meusAtendimentos > 0 ? C.orange : C.grayMid} />}
      </div>

      {/* ─── Indicadores ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-lg font-black mb-4" style={{ color: C.gray }}>Indicadores</h2>

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
          <h2 className="font-bold text-lg" style={{ color: C.gray }}>Próximas Visitas</h2>
          <button onClick={kpiActions.agendadas} className="text-sm font-semibold flex items-center gap-1" style={{ color: C.orange }}>
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
                <div className="text-[10px] font-bold uppercase" style={{ color: C.orange }}>{fmtMonth(v.data)}</div>
                <div className="text-xl font-black font-display">{new Date(v.data + "T00:00:00").getDate()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {v.referencia && (
                    <span style={{ color: C.orange }}>
                      {v.referencia}{v.referenciaProvisoria && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle" style={{ background: C.amberLight, color: "#92400E" }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>} |{" "}
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
          <button onClick={onNew} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orange }}>
            <Plus size={16} /> Novo Contrato
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
                      {c.codigoProvisorio && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: C.amberLight, color: "#92400E" }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>}
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
                <Pill bg={C.orangeLight} fg={C.orange}>Contrato de {getDuracaoMeses(c)} meses</Pill>
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
          <div className="text-sm" style={{ color: C.grayMid }}>Clique em "Novo Contrato" para começar.</div>
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
  const tec = tecnicos.find(t => t.id === contrato.tecnicoId);
  const hoje = new Date().toISOString().slice(0, 10);
  const visitasOrdenadas = [...visitas].sort((a, b) => b.data.localeCompare(a.data));

  // Última visita por frequência
  const ultimaPorFreq = useMemo(() => calcularUltimaPorFreq(relatorios), [relatorios]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ maxWidth: 1000, width: "100%", maxHeight: "92vh" }}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4" style={{ borderColor: C.border, background: C.orangeLight }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5" style={{ color: C.orange }}>
              Contrato {contrato.codigo ? `· ${contrato.codigo}` : ""}
              {contrato.codigoProvisorio && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold normal-case tracking-normal" style={{ background: C.amberLight, color: "#92400E" }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>}
            </div>
            <h2 className="text-xl sm:text-2xl font-black mb-1 break-words" style={{ color: C.gray }}>{contrato.cliente}</h2>
            <div className="flex items-center gap-2 text-xs" style={{ color: C.grayMid }}>
              <MapPin size={12} /> {contrato.endereco}
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4">
            <Avatar tec={tec} size={44} />
            <div className="flex gap-2">
              {podeGerenciar && <button onClick={onEdit} className="p-2 rounded hover:bg-white/50" title="Editar"><Pencil size={16} /></button>}
              {podeExcluir && <button onClick={() => { if (confirm("Excluir este contrato?")) onDelete(); }} className="p-2 rounded hover:bg-white/50" title="Excluir"><Trash2 size={16} style={{ color: C.nok }} /></button>}
              <button onClick={onClose} className="p-2 rounded hover:bg-white/50"><X size={20} /></button>
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
                        color: active ? C.orange : C.grayMid,
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
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orange }}>Dados Contratuais</h3>
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
                  <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orange }}>Dados do Contrato</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <DataRow label="Data de início" value={fmtDate(contrato.dataInicio)} />
                    <DataRow label={`Duração: ${getDuracaoMeses(contrato)} meses`} value={`Validade: ${fmtDate(contrato.validade)}`} accent={contrato.validade && contrato.validade < hoje ? C.nok : null} />
                  </div>
                </section>
              )}

              <section>
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orange }}>Cronograma NFPA 25 — {getDuracaoMeses(contrato)} meses</h3>
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
                      <div key={c.mes} className="border rounded-lg p-2.5 flex items-center gap-3 flex-wrap" style={{ borderColor: realizada ? C.ok : relStatus === "devolvido" ? C.nok : C.border, background: realizada ? "#F0FDF4" : relStatus === "devolvido" ? "#FFF3F3" : "transparent" }}>
                        <div className="text-center" style={{ width: 50 }}>
                          <div className="text-[9px] font-bold uppercase" style={{ color: C.orange }}>MÊS</div>
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
                            <button onClick={() => onPrintRel?.(realizada)} className="px-2.5 py-1 rounded text-[11px] font-bold text-white flex items-center gap-1" style={{ background: C.orange }}>
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
                            <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: "#92400E" }}>
                              <Clock size={12} /> Aguardando aprovação
                            </span>
                            <button onClick={() => onViewRel(relMes)} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: C.border, color: C.gray }}>
                              <Eye size={12} /> Ver
                            </button>
                          </div>
                        ) : visitaMes ? (
                          visitaMes.despacho ? (
                            <button onClick={() => (onWorkVisita || onOpenVisita)(visitaMes)} className="px-2.5 py-1 rounded text-[11px] font-bold text-white flex items-center gap-1" style={{ background: C.orange }}>
                              <ClipboardCheck size={12} /> {visitaMes.rascunhoItm ? "Continuar atendimento" : "Iniciar atendimento"}
                            </button>
                          ) : (
                            <button onClick={() => (onWorkVisita || onOpenVisita)(visitaMes)} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: "#B45309", color: "#B45309" }}>
                              <ClipboardList size={12} /> Fazer despacho
                            </button>
                          )
                        ) : (
                          podeAgendar ? (
                            <button onClick={() => onSchedule?.({ data: c.data })} className="px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1" style={{ borderColor: C.orange, color: C.orange }}>
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
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orange }}>Equipamentos do contrato</h3>
                {(contrato.equipamentos && contrato.equipamentos.length > 0) ? (
                  <div className="flex flex-wrap gap-2">
                    {contrato.equipamentos.map(e => (
                      <div key={e.id} className="border rounded-lg px-3 py-2 text-xs" style={{ borderColor: C.border }}>
                        <span className="font-bold" style={{ color: C.gray }}>{e.nome || "—"}</span>
                        <span className="ml-2" style={{ color: C.orange }}>{equipTipoLabel(e.tipo)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: C.grayMid }}>Nenhum equipamento cadastrado. Edite o contrato para cadastrar — o ITM passará a mostrar só os equipamentos existentes.</p>
                )}
              </section>

              <section>
                <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orange }}>Contato e Responsável</h3>
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
              <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: C.orange }}>Histórico de Visitas e Relatórios</h3>
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
                        <div className="text-[10px] font-bold uppercase" style={{ color: C.orange }}>{fmtMonth(v.data)}</div>
                        <div className="text-lg font-black font-display">{new Date(v.data + "T00:00:00").getDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {(v.referencia || v.codigoAtendimento) && (
                            <span className="text-xs font-black" style={{ color: C.orange }}>{v.referencia || v.codigoAtendimento}</span>
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
                        <button onClick={() => onViewRel(v.relatorio)} className="px-3 py-1.5 rounded text-xs font-bold text-white" style={{ background: C.orange }}>
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
              <Calendar size={48} className="mx-auto mb-3" style={{ color: C.orange }} />
              <p className="text-sm mb-4" style={{ color: C.grayMid }}>
                Agende uma nova visita para este contrato escolhendo o tipo (ITM, Inspeção, Preventiva ou Corretiva).
              </p>
              <button onClick={onSchedule} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white inline-flex items-center gap-2" style={{ background: C.orange }}>
                <Plus size={16} /> Agendar Nova Visita
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
    duracaoMeses: 12, valorMensal: 0, dataInicio: new Date().toISOString().slice(0, 10),
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
    const fim = new Date(ini.getFullYear(), ini.getMonth() + data.duracaoMeses, ini.getDate() - 1);
    return fim.toISOString().slice(0, 10);
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
        <Field label="Técnico Responsável">
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
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: C.orange }}>Equipamentos do contrato</h3>
            <p className="text-[11px] mt-0.5" style={{ color: C.grayMid }}>
              Cadastre os conjuntos de bomba existentes neste cliente. O checklist NFPA 25 do ITM passa a mostrar só os equipamentos cadastrados aqui — sem precisar marcar N/A a cada visita.
            </p>
          </div>
          <button type="button" onClick={addEquip} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1 shrink-0" style={{ background: C.orange }}>
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
                  <select value={e.tipo} onChange={ev => updEquip(e.id, "tipo", ev.target.value)}
                          className="flex-1 sm:flex-none border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border, minWidth: 150 }}>
                    {TIPOS_EQUIP_CONTRATO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button type="button" onClick={() => rmEquip(e.id)} className="p-2 rounded hover:bg-gray-100 shrink-0" title="Remover"><Trash2 size={16} style={{ color: C.nok }} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Valor Mensal (R$)"><input type="number" step="0.01" value={data.valorMensal} onChange={e => upd("valorMensal", parseFloat(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Data de Início"><input type="date" value={data.dataInicio} onChange={e => upd("dataInicio", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Duração do Contrato">
          <div className="flex gap-2">
            {DURACOES_CONTRATO.map(d => (
              <button key={d} type="button" onClick={() => upd("duracaoMeses", d)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-bold border-2 transition"
                      style={{
                        background: data.duracaoMeses === d ? C.orange : "transparent",
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
            <span className="font-bold uppercase tracking-wide" style={{ color: C.orange }}>Cronograma NFPA 25</span>
            <span style={{ color: C.grayMid }}>
              Validade: <strong style={{ color: C.gray }}>{fmtDate(validade)}</strong> ·
              Valor total: <strong style={{ color: C.gray }}>{fmtCurrency((data.valorMensal || 0) * data.duracaoMeses)}</strong>
            </span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
            {cronograma.map(c => (
              <div key={c.mes} className="bg-white border rounded p-1.5 text-center" style={{ borderColor: C.border }}>
                <div className="text-[9px] font-bold" style={{ color: C.orange }}>MÊS {c.mes}</div>
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
                style={{ background: C.orange }}>
          {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} {salvando ? "Gerando número…" : "Salvar Contrato"}
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
  const [calMonth, setCalMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const filtered = useMemo(() => visitas.filter(v =>
    (filterTec === "todos" || v.tecnicoId === parseInt(filterTec)) &&
    (filterTipo === "todos" || v.tipo === filterTipo)
  ), [visitas, filterTec, filterTipo]);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Agenda</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os tipos</option>
            {Object.values(TIPO_REL).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select value={filterTec} onChange={e => setFilterTec(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os técnicos</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <div className="border rounded-lg p-1 flex" style={{ borderColor: C.border }}>
            <button onClick={() => setView("lista")} className="px-3 py-1 text-xs font-semibold rounded"
                    style={{ background: view === "lista" ? C.orange : "transparent", color: view === "lista" ? "#fff" : C.gray }}>
              Lista
            </button>
            <button onClick={() => setView("calendario")} className="px-3 py-1 text-xs font-semibold rounded"
                    style={{ background: view === "calendario" ? C.orange : "transparent", color: view === "calendario" ? "#fff" : C.gray }}>
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
            const today = new Date().toISOString().slice(0, 10);
            const atrasada = v.status === "agendada" && v.data < today;
            return (
              <div key={v.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="text-center" style={{ width: 56 }}>
                  <div className="text-[10px] font-bold uppercase" style={{ color: C.orange }}>{fmtMonth(v.data)}</div>
                  <div className="text-2xl font-black font-display">{new Date(v.data + "T00:00:00").getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">
                    {v.referencia && (
                    <span style={{ color: C.orange }}>
                      {v.referencia}{v.referenciaProvisoria && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle" style={{ background: C.amberLight, color: "#92400E" }} title="Gerado offline — será confirmado ao sincronizar">provisório</span>} |{" "}
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
                    {v.status === "pendente_aprovacao" && <Pill bg={C.amberLight} fg="#92400E">Aguardando aprovação</Pill>}
                    {v.status === "devolvida" && <Pill bg={C.nokLight} fg={C.nok}>Devolvida p/ correção</Pill>}
                    {v.despacho && !v.relatorio && <Pill bg={C.amberLight} fg="#92400E">Despachada</Pill>}
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
                          style={{ background: C.orange }}>
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

// Sino de notificações in-app: contador + lista ao clicar. Sem push/e-mail —
// funciona só enquanto o app está aberto, lendo o estado sincronizado.
function NotificationBell({ notificacoes, naoLidas, onOpenNotificacao, onMarkAllRead }) {
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
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-lg hover:bg-gray-100" title="Notificações">
        <Bell size={18} style={{ color: C.gray }} />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: C.nok }}>
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border rounded-xl shadow-xl z-50" style={{ borderColor: C.border }}>
            <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-white" style={{ borderColor: C.border }}>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.gray }}>Notificações</span>
              {naoLidas > 0 && <button onClick={onMarkAllRead} className="text-[11px] font-bold" style={{ color: C.orange }}>Marcar todas como lidas</button>}
            </div>
            {notificacoes.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: C.grayMid }}>Nenhuma notificação por aqui.</div>
            ) : (
              notificacoes.slice(0, 30).map(n => {
                const Icon = ICONS[n.tipo] || Bell;
                return (
                  <button key={n.id} onClick={() => { onOpenNotificacao(n); setOpen(false); }}
                          className="w-full text-left p-3 border-b flex items-start gap-2.5 hover:bg-gray-50" style={{ borderColor: C.border, background: n.lida ? "#fff" : "#FFF9F5" }}>
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

function ApprovalBadge({ rel }) {
  const status = getRelApprovalStatus(rel);
  if (status === "pendente") return <Pill bg={C.amberLight} fg="#92400E">Pendente aprovação</Pill>;
  if (status === "devolvido") return <Pill bg={C.nokLight} fg={C.nok}>Devolvido p/ correção</Pill>;
  return <Pill bg={C.okLight} fg={C.ok}>Aprovado</Pill>;
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
  const hoje = new Date().toISOString().slice(0, 10);
  const [filtroTecnico, setFiltroTecnico] = useState(() => souGestor ? "todos" : String(tecnicoId || ""));

  const tecnicoIdEfetivo = souGestor
    ? (filtroTecnico === "todos" ? null : parseInt(filtroTecnico))
    : tecnicoId;
  const modoTodos = souGestor && filtroTecnico === "todos";

  const minhas = useMemo(() => {
    if (!modoTodos && !tecnicoIdEfetivo) return [];
    return visitas
      .filter(v => modoTodos ? !!v.tecnicoId : v.tecnicoId === tecnicoIdEfetivo)
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
      <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
        <option value="todos">Todos os técnicos</option>
        {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>
    </div>
  );

  if (!souGestor && !tecnicoId) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-3xl font-black mb-1" style={{ color: C.gray }}>Meus Atendimentos</h1>
        <p className="text-sm mb-6" style={{ color: C.grayMid }}>Seus atendimentos pendentes e futuros.</p>
        <div className="p-6 border rounded-xl text-sm" style={{ borderColor: C.border, color: C.grayMid }}>
          Seu usuário ainda não está vinculado a um cadastro de técnico. Peça ao administrador para vincular, na aba <b>Usuários</b> — assim esta tela (e os avisos do sino) passam a mostrar exatamente os seus atendimentos.
        </div>
      </div>
    );
  }

  const Row = ({ v, obs }) => (
    <div className="p-4 flex items-center gap-4 flex-wrap border-b last:border-0" style={{ borderColor: C.border }}>
      <div className="text-center" style={{ width: 56 }}>
        <div className="text-[10px] font-bold uppercase" style={{ color: C.orange }}>{v.data ? fmtMonth(v.data) : "—"}</div>
        <div className="text-2xl font-black font-display">{v.data ? new Date(v.data + "T00:00:00").getDate() : "—"}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm" style={{ color: C.gray }}>{v.referencia && <span style={{ color: C.orange }}>{v.referencia} | </span>}{v._cliente}</div>
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
          <button onClick={() => onItm(v)} className="px-3 py-1.5 text-xs font-bold rounded-lg text-white" style={{ background: v.rascunhoItm ? "#B45309" : C.orange }}>{v.rascunhoItm ? "Continuar" : "Iniciar"}</button>
        ) : (
          <button onClick={() => onDespacho(v)} className="px-3 py-1.5 text-xs font-bold rounded-lg border" style={{ borderColor: "#B45309", color: "#B45309" }}>Fazer despacho</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl font-black mb-1" style={{ color: C.gray }}>{souGestor ? "Atendimentos por Técnico" : "Meus Atendimentos"}</h1>
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

      <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.orange }}>Próximos atendimentos ({futuros.length})</div>
      {futuros.length === 0 ? (
        <div className="p-6 text-center text-sm border rounded-xl mb-8" style={{ borderColor: C.border, color: C.grayMid }}>Nenhum atendimento futuro agendado.</div>
      ) : (
        <div className="border rounded-xl mb-8" style={{ borderColor: C.border }}>
          {futuros.map(v => <Row key={v.id} v={v} />)}
        </div>
      )}

      {aguardandoAprovacao.length > 0 && (
        <>
          <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: "#92400E" }}>Aguardando aprovação ({aguardandoAprovacao.length})</div>
          <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
            {aguardandoAprovacao.map(v => (
              <div key={v.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="font-bold text-sm" style={{ color: C.gray }}>{v.referencia && <span style={{ color: C.orange }}>{v.referencia} | </span>}{v._cliente}</div>
                <Pill bg={C.amberLight} fg="#92400E">Aguardando aprovação</Pill>
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
          <h1 className="text-3xl font-black" style={{ color: C.gray }}>Visitas Técnicas</h1>
          <p className="text-sm mt-1" style={{ color: C.grayMid }}>Atendimentos de contrato e avulsos, com filtros por tipo, origem e status.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todos os tipos</option>
            {Object.values(TIPO_REL).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select value={filterOrigem} onChange={e => setFilterOrigem(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border }}>
            <option value="todos">Todas as origens</option>
            <option value="contrato">Contrato</option>
            <option value="avulsa">Avulsa</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
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
              <div className="text-[10px] font-bold uppercase" style={{ color: C.orange }}>{fmtMonth(item.data)}</div>
              <div className="text-2xl font-black">{item.data ? new Date(item.data + "T00:00:00").getDate() : "—"}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm" style={{ color: C.gray }}>{item.referencia && <span style={{ color: C.orange }}>{item.referencia} | </span>}{item.cliente}</div>
              <div className="text-xs flex gap-2 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
                <TipoBadge tipo={item.tipo} />
                <Pill bg={item.origem === "avulsa" ? C.purpleLight : C.blueLight} fg={item.origem === "avulsa" ? C.purple : C.blue}>
                  {item.origem === "avulsa" ? "Avulsa" : "Contrato"}
                </Pill>
                <Pill bg={item.status === "concluida" ? C.okLight : item.status === "pendente_aprovacao" ? C.amberLight : item.status === "devolvida" ? C.nokLight : C.grayLight}
                      fg={item.status === "concluida" ? C.ok : item.status === "pendente_aprovacao" ? "#92400E" : item.status === "devolvida" ? C.nok : C.gray}>
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
                            className="px-3 py-1.5 text-xs font-bold rounded-lg text-white disabled:opacity-40" style={{ background: item.status === "devolvida" ? C.nok : item.visita.rascunhoItm ? "#B45309" : C.orange }}>
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
                        className="px-3 py-1.5 text-xs font-bold rounded-lg text-white flex items-center gap-1" style={{ background: C.orange }}>
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
        <button onClick={handlePrint} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orange }}>
          <Printer size={14} /> Imprimir Documento Interno
        </button>
      </div>
      <div className="bg-white mx-auto border p-8 documento-interno-print" data-documento-interno style={{ borderColor: C.border, maxWidth: 900, color: C.gray, fontFamily: "var(--font-body)" }}>
        <div className="flex items-start justify-between border-b pb-4 mb-5" style={{ borderColor: C.border }}>
          <div>
            <LogoLSFire size={42} />
            <h1 className="text-2xl font-black mt-4" style={{ color: C.gray }}>Documento Interno de Atendimento</h1>
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

        <ReportSubTitle>Orientações Internas</ReportSubTitle>
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
            <ReportSubTitle>Checklist de Despacho</ReportSubTitle>
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
        <button onClick={prev} className="p-2 rounded hover:bg-gray-100"><ChevronLeft size={18} /></button>
        <div className="font-bold text-lg capitalize" style={{ color: C.gray }}>
          {new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </div>
        <button onClick={next} className="p-2 rounded hover:bg-gray-100"><ChevronRight size={18} /></button>
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
        <button onClick={onNew} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orange }}>
          <Plus size={16} /> Novo Técnico
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
                <button onClick={() => onEdit(t)} className="p-1.5 rounded hover:bg-gray-100"><Pencil size={14} /></button>
                {podeExcluir && (
                  <button onClick={() => {
                    const aviso = totalVinculos > 0
                      ? `O técnico "${t.nome}" tem ${totalVinculos} atendimento(s) vinculado(s) (agendados e/ou já concluídos). Excluindo o técnico, os relatórios já feitos perdem a atribuição de quem realizou o serviço. Deseja continuar mesmo assim?`
                      : `Excluir o técnico "${t.nome}"?`;
                    if (confirm(aviso)) onDelete(t.id);
                  }} className="p-1.5 rounded hover:bg-gray-100"><Trash2 size={14} style={{ color: C.nok }} /></button>
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
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="border rounded-lg p-2" style={{ borderColor: C.border }}>
                  <div className="text-lg font-black font-display" style={{ color: C.orange }}>{ag}</div>
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
  const [data, setData] = useState({ nome: "", cargo: "", telefone: "", email: "", licenca: "", ...initial });
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <Field label="Nome completo"><input value={data.nome} onChange={e => upd("nome", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Cargo"><input value={data.cargo} onChange={e => upd("cargo", e.target.value)} placeholder="Técnico Sênior / Pleno / Júnior" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Licença / Registro"><input value={data.licenca} onChange={e => upd("licenca", e.target.value)} placeholder="CREA-XX 0000000" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Telefone"><input value={data.telefone} onChange={e => upd("telefone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="E-mail"><input type="email" value={data.email} onChange={e => upd("email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>
      <div className="flex justify-end pt-4 border-t" style={{ borderColor: C.border }}>
        <button onClick={() => onSave(data)} disabled={!data.nome}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2"
                style={{ background: C.orange }}>
          <Save size={14} /> Salvar Técnico
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

      <div className="mb-3 text-xs uppercase font-bold tracking-wide" style={{ color: C.orange }}>Aguardando aprovação ({pendentes.length})</div>
      {pendentes.length === 0 ? (
        <div className="p-6 text-center text-sm border rounded-xl mb-8" style={{ borderColor: C.border, color: C.grayMid }}>Nada pendente por aqui.</div>
      ) : (
        <div className="border rounded-xl divide-y mb-8" style={{ borderColor: C.border }}>
          {pendentes.map(r => (
            <div key={r.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm" style={{ color: C.gray }}>#{r.referencia || r.codigoAtendimento || r.codigo} — {r.codigo} — {r.cliente}</div>
                <div className="text-xs flex gap-3 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
                  <TipoBadge tipo={r.tipo} />
                  <span><Calendar size={11} className="inline mr-1" />{fmtDate(r.dataEmissao)}</span>
                </div>
              </div>
              <button onClick={() => onView(r)} className="px-3 py-1.5 text-xs font-bold rounded-lg text-white flex items-center gap-1" style={{ background: C.orange }}>
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
                  <div className="font-bold text-sm" style={{ color: C.gray }}>#{r.referencia || r.codigoAtendimento || r.codigo} — {r.codigo} — {r.cliente}</div>
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
      getRelApprovalStatus(r) === "pendente" ? "Pendente" : "Aprovado",
      r.conformidade ?? "",
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
      a.download = `relatorios-lsfire-${nomeFiltro}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert("Não foi possível gerar o arquivo neste ambiente."); }
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Relatórios</h1>
        <button onClick={exportarExcel} disabled={filtered.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white disabled:opacity-40"
                style={{ background: "#1D6F42" }}
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
                <div className="font-bold text-sm" style={{ color: C.gray }}>#{r.referencia || r.codigoAtendimento || r.codigo} — {r.codigo} — {r.cliente}</div>
                <div className="text-xs flex gap-3 mt-1 flex-wrap items-center" style={{ color: C.grayMid }}>
                  <TipoBadge tipo={r.tipo} />
                  <ApprovalBadge rel={r} />
                  <VisitaFreqsPills visita={r} />
                  <span><Calendar size={11} className="inline mr-1" />{fmtDate(r.dataEmissao)}</span>
                  {r.os && <span>OS Nº {r.os}</span>}
                </div>
              </div>
              <Pill bg={r.conformidade >= 90 ? C.okLight : r.conformidade >= 60 ? C.amberLight : C.nokLight}
                    fg={r.conformidade >= 90 ? C.ok : r.conformidade >= 60 ? "#92400E" : C.nok}>
                {r.conformidade}% conforme
              </Pill>
              {podeExcluir && (
                <button onClick={() => { if (confirm(`Excluir relatório ${r.codigo || r.referencia}?`)) onDelete?.(r.id); }} className="px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 border" style={{ borderColor: C.border, color: C.nok }}>
                  <Trash2 size={12} /> Apagar
                </button>
              )}
              <button onClick={() => onView(r)} className="px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 text-white" style={{ background: C.orange }}>
                <Eye size={12} /> Visualizar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabPill({ label, Icon, active, onClick, color, bg }) {
  return (
    <button onClick={onClick}
            className="px-3 py-1.5 rounded-full text-xs font-bold border transition flex items-center gap-1.5"
            style={{
              background: active ? color : bg,
              color: active ? "#fff" : color,
              borderColor: active ? color : "transparent"
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
  const [contratoId, setContratoId] = useState(contratoFixo || contratos[0]?.id || "");
  const [tipo, setTipo] = useState("itm");
  const [data, setData] = useState(initial?.data || new Date().toISOString().slice(0, 10));
  const [demanda, setDemanda] = useState("");
  const [anexos, setAnexos] = useState([]);
  const [tecnicoId, setTecnicoId] = useState(() => {
    const c = contratos.find(x => x.id === (contratoFixo || contratos[0]?.id));
    return c?.tecnicoId || tecnicos[0]?.id || "";
  });

  useEffect(() => {
    const c = contratos.find(x => x.id === contratoId);
    if (c) setTecnicoId(c.tecnicoId || tecnicos[0]?.id || "");
  }, [contratoId]);

  const ehItm = tipo === "itm";
  const isStartup = tipo === "startup";
  const contratoSel = contratos.find(c => c.id === contratoId);
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
    contratoId, tipo, data, demanda, anexos,
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
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
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
            <div className="text-sm font-bold" style={{ color: C.gray }}>Anexos do Atendimento</div>
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
        <div className="border rounded-lg p-3" style={{ borderColor: foraPeriodo ? C.nok : C.border, background: foraPeriodo ? "#FFFBFB" : C.orangeLight }}>
          {foraPeriodo ? (
            <div className="text-xs flex items-center gap-2" style={{ color: C.nok }}>
              <AlertTriangle size={14} />
              <span>A data escolhida está fora do período contratado (contrato termina no mês {duracao}).</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.orange }}>
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
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2" style={{ background: C.orange }}>
            {gerandoNumero && <RefreshCw size={14} className="animate-spin" />} {gerandoNumero ? "Gerando número…" : "Iniciar Relatório"}
          </button>
        ) : (
          <>
            <button onClick={() => criar("agendar")} disabled={!podeSalvar || gerandoNumero}
                    className="px-4 py-2 rounded-lg text-sm font-bold border disabled:opacity-40 flex items-center gap-2"
                    style={{ borderColor: C.border, color: C.gray }}>
              {gerandoNumero && <RefreshCw size={14} className="animate-spin" />} Agendar
            </button>
            <button onClick={() => criar("despachar")} disabled={!podeSalvar || gerandoNumero}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2" style={{ background: C.orange }}>
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
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.orange }}>
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
                      {ehBase && <Pill bg={C.orangeLight} fg={C.orange}>BASE</Pill>}
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
                    <div className="mt-1.5 text-[9px] font-bold flex items-center gap-1" style={{ color: C.orange }}>
                      ★ Prevista no cronograma
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {freqsSelecionadas.length > 1 && (
            <div className="mt-3 p-2 rounded text-[11px] flex items-start gap-2" style={{ background: C.orangeLight, color: C.gray }}>
              <ClipboardCheck size={12} className="mt-0.5 flex-shrink-0" style={{ color: C.orange }} />
              <span>
                Esta visita realizará <strong>{freqsSelecionadas.length} inspeções</strong>: {freqsSelecionadas.join(" + ")}. Todos os checklists NFPA 25 dessas frequências serão carregados no ITM.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mb-5 pb-5 border-b space-y-4" style={{ borderColor: C.border }}>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Demanda do Atendimento">
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
            <span style={{ color: C.orange }}>{done}/{total} ({pct}%)</span>
          </div>
        </div>
        <div className="h-2 rounded-full" style={{ background: C.grayLight }}>
          <div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: C.orange }} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {DESPACHO_GRUPOS.map(g => (
          <div key={g.titulo} className="border rounded-lg p-3" style={{ borderColor: C.border }}>
            <div className="font-bold text-sm mb-2" style={{ color: C.orange }}>{g.titulo}</div>
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
                           style={{ borderColor: v.status === "nok" ? C.nok : C.border, background: v.status === "nok" ? "#FFFBFB" : "#fff" }} />
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
                style={{ background: C.orange }}>
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
  const tecnico  = !visita.avulsa ? tecnicos.find(t => t.id === visita.tecnicoId) : tecnicos[0];
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
    licenca: tecnico?.licenca || "",
    contratado: "LS Fire",
    enderecoContratado: "lsfire.com.br",
    periodoIni: visita.data || new Date().toISOString().slice(0, 10),
    periodoFim: visita.data || new Date().toISOString().slice(0, 10),
    responsavel: tecnico?.nome || "",
    codigo: visita.referencia || visita.codigoAtendimento || `${codigoPrefix}-${Date.now().toString().slice(-4)}`,
    revisao: "00",
    dataEmissao: new Date().toISOString().slice(0, 10),
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
    else base.push({ id: "cas", label: "Casas de Bombas", Icon: Flame });
    if (!isStartup && fazerPerformance) base.push(
      { id: "perfeq", label: "Equip. Performance", Icon: Building2 },
      { id: "perf", label: "Teste de Performance", Icon: ShieldCheck }
    );
    if (visita.tipo === "corretiva") base.push({ id: "cor", label: "Ação Corretiva", Icon: Wrench });
    if (!isStartup) base.push(
      { id: "mao", label: "Mão de Obra", Icon: Clock },
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
        <button onClick={handleClose} className="p-2 rounded hover:bg-white/50"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase font-bold tracking-wider flex items-center gap-2 flex-wrap" style={{ color: tipoCfg.color }}>
            <tipoCfg.Icon size={14} /> {tipoCfg.nomeLong}
            {visitaFreqs.map(f => (
              <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: FREQ_COLOR[f]?.bg, color: FREQ_COLOR[f]?.fg }}>
                {f}
              </span>
            ))}
          </div>
          <div className="font-bold text-sm truncate">{identificacao.cliente || "Novo Relatório Avulso"}</div>
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
                        color: active ? C.orange : C.grayMid,
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
        {currentStep.id === "id"    && <StepIdentificacao state={identificacao} setState={setIdentificacao} isNFPA={isNFPA} isStartup={isStartup} />}
        {currentStep.id === "id" && !isStartup && (
          <div className="max-w-3xl mx-auto mt-5">
            <div className="border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: C.border, background: fazerPerformance ? C.orangeLight : "#fff" }}>
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
                        style={{ borderColor: C.border, background: !fazerPerformance ? C.gray : "#fff", color: !fazerPerformance ? "#fff" : C.gray }}>
                  Não
                </button>
                <button onClick={() => setFazerPerformance(true)}
                        className="px-4 py-2 rounded-lg text-sm font-bold border"
                        style={{ borderColor: C.orange, background: fazerPerformance ? C.orange : "#fff", color: fazerPerformance ? "#fff" : C.orange }}>
                  Sim
                </button>
              </div>
            </div>
          </div>
        )}
        {currentStep.id === "perfeq" && <StepStartupDados startup={perfData} setStartup={setPerfData} soEquipamentos />}
        {currentStep.id === "perf"   && <StepStartupTestes startup={perfData} setStartup={setPerfData} />}
        {currentStep.id === "check" && <StepNFPA groups={nfpaGroups} setGroups={setNfpaGroups} freqs={visitaFreqs} equip={equipNFPA} setEquip={setEquipNFPA} />}
        {currentStep.id === "std"   && <StepStartupDados startup={startup} setStartup={setStartup} />}
        {currentStep.id === "stc"   && <StepStartupChecklist startup={startup} setStartup={setStartup} />}
        {currentStep.id === "stt"   && <StepStartupTestes startup={startup} setStartup={setStartup} />}
        {currentStep.id === "cas"   && <StepCasas casas={casas} setCasas={setCasas} tipo={visita.tipo} />}
        {currentStep.id === "cor"   && <StepCorretiva state={corretiva} setState={setCorretiva} />}
        {currentStep.id === "mao"   && <StepMaoObra maoObra={maoObra} setMaoObra={setMaoObra} />}
        {currentStep.id === "des"   && <StepDeslocamento deslocs={deslocs} setDeslocs={setDeslocs} />}
        {currentStep.id === "tre"   && <StepTreinamento trein={trein} setTrein={setTrein} />}
        {currentStep.id === "obs"   && <StepObservacoes obs={obs} setObs={setObs} tipo={visita.tipo} />}
        {currentStep.id === "ass"   && <StepAssinaturas assins={assins} setAssins={setAssins} />}
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
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.orange }}>
            Próximo →
          </button>
        )}
        {step === steps.length - 1 && (
          <button onClick={finalizar}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2"
                  style={{ background: C.orange }}>
            <FileText size={14} /> Finalizar e Gerar Relatório
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEPS DO ITM FLOW
// ═══════════════════════════════════════════════════════════════════════════
function StepIdentificacao({ state, setState, isNFPA, isStartup }) {
  const upd = (k, v) => setState(s => ({ ...s, [k]: v }));
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Identificação</h2>

      {isNFPA && (
        <div className="p-3 rounded-lg flex items-start gap-2 text-xs" style={{ background: C.blueLight, color: "#1E40AF" }}>
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

      <h3 className="text-sm font-bold mt-2" style={{ color: C.orange }}>Propriedade Inspecionada</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nome da Propriedade"><input value={state.cliente} onChange={e => upd("cliente", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        {!isNFPA && <Field label="Empreendimento"><input value={state.empreendimento} onChange={e => upd("empreendimento", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>}
        <Field label="Endereço da Propriedade"><input value={state.local} onChange={e => upd("local", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm md:col-span-2" style={{ borderColor: C.border }} /></Field>
        <Field label="Telefone da Propriedade"><input value={state.telefone} onChange={e => upd("telefone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Nº do Contrato"><input value={state.contratoNum} onChange={e => upd("contratoNum", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="OS Nº"><input value={state.os} onChange={e => upd("os", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Código do Documento"><input value={state.codigo} onChange={e => upd("codigo", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>

      <h3 className="text-sm font-bold mt-4" style={{ color: C.orange }}>Período / Inspetor</h3>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Início da Execução"><input type="date" value={state.periodoIni} onChange={e => upd("periodoIni", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Fim da Execução"><input type="date" value={state.periodoFim} onChange={e => upd("periodoFim", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Inspetor"><input value={state.inspetor} onChange={e => upd("inspetor", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Data de Emissão"><input type="date" value={state.dataEmissao} onChange={e => upd("dataEmissao", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
      </div>

      <h3 className="text-sm font-bold mt-4" style={{ color: C.orange }}>Contratado</h3>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Nome do Contratado"><input value={state.contratado} onChange={e => upd("contratado", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Endereço do Contratado"><input value={state.enderecoContratado} onChange={e => upd("enderecoContratado", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Licença / Certificação Nº"><input value={state.licenca} onChange={e => upd("licenca", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
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
  const updGroup = (gid, items) => setGroups(gs => gs.map(g => g.id === gid ? { ...g, items } : g));
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
        <div className="border rounded-xl p-4" style={{ borderColor: C.border, background: "#fff" }}>
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
                        style={{ borderColor: ativo ? C.orange : C.border, background: ativo ? C.orange : "#fff", color: ativo ? "#fff" : C.grayMid }}>
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
          <ClipboardCheck size={14} className="mt-0.5 flex-shrink-0" style={{ color: C.orange }} />
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

function StepStartupDados({ startup, setStartup, soEquipamentos = false }) {
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
          <Field label="Técnico Responsável"><input value={startup.info.tecnicoResponsavel} onChange={e => updInfo("tecnicoResponsavel", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Local de Instalação"><input value={startup.info.localInstalacao} onChange={e => updInfo("localInstalacao", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Nº de Série"><input value={startup.info.numeroSerie} onChange={e => updInfo("numeroSerie", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Norma"><input value={startup.info.norma} onChange={e => updInfo("norma", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
          <Field label="Entrega"><input value={startup.info.entrega} onChange={e => updInfo("entrega", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        </div>
      </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold" style={{ color: TIPO_REL.startup.color }}>Equipamentos Instalados</h3>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.grayMid }}>{equipamentos.length} conjuntos</span>
            <button type="button" onClick={() => addEquip("diesel")} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.gray }}><Plus size={13} /> Diesel</button>
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
    checklistGroups: s.checklistGroups.map(g => g.id === gid ? { ...g, items } : g),
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
  if (!startup) return null;
  const equipamentosPerformance = (startup.equipamentos || []).filter(eq => ["diesel", "eletrica"].includes(eq.tipo));
  const testes = equipamentosPerformance.map((eq, idx) => {
    const tipoTeste = eq.tipo;
    const existente = (startup.testes || []).find(t => t.equipamentoId === eq.id || t.id === eq.id);
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
    setStartup(s => {
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
  }, [startup.equipamentos, setStartup]);
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
            <div className="p-4 border-b space-y-4" style={{ borderColor: C.border, background: "#FAFAFA" }}>
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
  const addCasa = () => {
    const n = casas.length + 1;
    setCasas([...casas, { id: Date.now(), nome: `G-${n}00`, instalacao: INSTALACAO_SKID.map((t, i) => ({ id: i + 1, texto: t, status: "", obs: "", fotos: [] })), equipamentos: [] }]);
  };
  const delCasa = (id) => setCasas(casas.filter(c => c.id !== id));
  const updCasa = (id, patch) => setCasas(casas.map(c => c.id === id ? { ...c, ...patch } : c));

  const aviso = tipo === "preventiva" ? "Foco em atividades preventivas: marque OK no que está em conformidade após a intervenção."
              : tipo === "corretiva"  ? "Identifique os itens NÃO OK que motivaram esta visita corretiva. A ação aplicada será descrita no próximo passo."
              : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Casas de Bombas</h2>
        <button onClick={addCasa} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orange }}>
          <Plus size={14} /> Nova Casa
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
    onUpdate({
      equipamentos: [...casa.equipamentos, {
        id: Date.now(), tipo, nome: tpl.nome,
        sections: tpl.sections.map(s => ({ ...s, items: s.items.map((t, i) => ({ id: i + 1, texto: t, status: "", obs: "", fotos: [] })) })),
      }]
    });
  };
  const updEquip = (id, patch) => onUpdate({ equipamentos: casa.equipamentos.map(e => e.id === id ? { ...e, ...patch } : e) });
  const delEquip = (id) => onUpdate({ equipamentos: casa.equipamentos.filter(e => e.id !== id) });

  return (
    <div className="border-2 rounded-xl" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: C.border, background: C.orangeLight }}>
        <button onClick={() => setOpen(o => !o)} className="p-1">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
        <input value={casa.nome} onChange={e => onUpdate({ nome: e.target.value })}
               className="font-bold text-lg bg-transparent border-b" style={{ color: C.gray, borderColor: C.orange, outline: "none" }} />
        <div className="flex-1" />
        <button onClick={onDelete} className="p-1 rounded hover:bg-orange-200" style={{ color: C.nok }}><Trash2 size={16} /></button>
      </div>
      {open && (
        <div className="p-4 space-y-4">
          <ChecklistSection title="Instalação do Skid / Container" items={casa.instalacao} onChange={items => onUpdate({ instalacao: items })} />
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
                    <Icon size={14} style={{ color: C.orange }} /> {tpl.nome}
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
  const updSection = (sid, items) => onUpdate({ sections: eq.sections.map(s => s.id === sid ? { ...s, items } : s) });
  return (
    <div className="border rounded-lg" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3 p-3 border-b" style={{ borderColor: C.border, background: C.grayLight }}>
        <button onClick={() => setOpen(o => !o)} className="p-1">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        <input value={eq.nome} onChange={e => onUpdate({ nome: e.target.value })}
               className="font-bold text-sm bg-transparent flex-1" style={{ color: C.gray, outline: "none" }} />
        <button onClick={onDelete} className="p-1 rounded hover:bg-gray-200" style={{ color: C.nok }}><Trash2 size={14} /></button>
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

// CHECKLIST SECTION — sempre permite comentário e foto em todos os itens
function ChecklistSection({ title, items, onChange }) {
  const setItem = (id, patch) => onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const addFoto = (id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange(items.map(i => i.id === id
        ? { ...i, fotos: [...(i.fotos || []), { id: Date.now() + Math.random(), data: ev.target.result, legenda: "" }] }
        : i));
    };
    reader.readAsDataURL(file);
  };
  const updFoto = (id, fotoId, patch) => onChange(items.map(i => i.id === id ? { ...i, fotos: (i.fotos || []).map(f => f.id === fotoId ? { ...f, ...patch } : f) } : i));
  const delFoto = (id, fotoId) => onChange(items.map(i => i.id === id ? { ...i, fotos: (i.fotos || []).filter(f => f.id !== fotoId) } : i));

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
      <div className="px-3 py-2 text-sm font-bold text-white" style={{ background: C.orange }}>{title}</div>
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
                style={{ borderColor: it.status === "nok" ? C.nok : C.border, background: it.status === "nok" ? "#FFFBFB" : "#fff" }} />
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <label className="cursor-pointer px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1" style={{ borderColor: C.orange, color: C.orange }}>
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
                      <img src={f.data} alt="" className="w-full h-24 object-cover" />
                      <button onClick={() => delFoto(it.id, f.id)}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition" style={{ color: C.nok }}>
                        <X size={12} />
                      </button>
                      <input value={f.legenda} onChange={e => updFoto(it.id, f.id, { legenda: e.target.value })}
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
  return (
    <button onClick={onClick}
            className="px-2 py-1 rounded text-[10px] font-bold border transition"
            style={{ background: active ? color : "transparent", color: active ? "#fff" : color, borderColor: color }}>
      {label}
    </button>
  );
}

function StepCorretiva({ state, setState }) {
  const upd = (k, v) => setState(s => ({ ...s, [k]: v }));
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-black mb-2" style={{ color: C.gray }}>Ação Corretiva</h2>
      <p className="text-xs mb-4" style={{ color: C.grayMid }}>Detalhe o problema diagnosticado, a ação aplicada e o resultado obtido.</p>
      <Field label="Diagnóstico / Problema Identificado">
        <textarea rows={5} value={state.diagnostico} onChange={e => upd("diagnostico", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <Field label="Ação Corretiva Aplicada">
        <textarea rows={5} value={state.acao} onChange={e => upd("acao", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <Field label="Resultado / Estado Final">
        <textarea rows={4} value={state.resultado} onChange={e => upd("resultado", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <Field label="Peças / Materiais Utilizados">
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
        <h2 className="text-xl font-black" style={{ color: C.gray }}>Mão de Obra</h2>
        <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orange }}>
          <Plus size={14} /> Apontamento
        </button>
      </div>
      <div className="space-y-3">
        {maoObra.map((m, i) => (
          <div key={m.id} className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end" style={{ borderColor: C.border }}>
            <div className="text-xs font-bold uppercase" style={{ color: C.orange }}>#{i + 1}</div>
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
          <div className="text-sm">Total: <span className="font-black text-base" style={{ color: C.orange }}>{totalKm} km</span></div>
          <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orange }}>
            <Plus size={14} /> Trecho
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {deslocs.map((d, i) => {
          const dif = (parseInt(d.kmFim) || 0) - (parseInt(d.kmIni) || 0);
          return (
            <div key={d.id} className="border rounded-lg p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end" style={{ borderColor: C.border }}>
              <div className="text-xs font-bold uppercase" style={{ color: C.orange }}>#{i + 1}</div>
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
            <button onClick={addPart} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: C.orange }}>
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
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Observações e Recomendações</h2>
      <textarea value={obs} onChange={e => setObs(e.target.value)} rows={14}
                placeholder={placeholders[tipo] || placeholders.inspecao}
                className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
    </div>
  );
}

function StepAssinaturas({ assins, setAssins }) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-black mb-4" style={{ color: C.gray }}>Assinaturas</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Responsável do Cliente"><input value={assins.cliente} onChange={e => setAssins({ ...assins, cliente: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
        <Field label="Técnico LS Fire"><input value={assins.tecnico} onChange={e => setAssins({ ...assins, tecnico: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} /></Field>
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
    let styles = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) styles += rule.cssText + "\n";
      } catch {}
    }
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${rel.codigo} - ${rel.cliente}</title>
<script src="https://cdn.tailwindcss.com"></script>
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
    // Aguarda o tailwind/imagens carregarem antes de imprimir
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
    <div className="fixed inset-0 z-50 bg-gray-200 overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 bg-white border-b px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 z-10 print:hidden flex-wrap" style={{ borderColor: C.border }}>
        <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 shrink-0"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase font-bold flex items-center gap-2 flex-wrap" style={{ color: C.orange }}>
            <tipoCfg.Icon size={12} /> <span className="truncate">Preview — {tipoCfg.nomeLong}</span>
            <ApprovalBadge rel={rel} />
            {rel.freq && <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: FREQ_COLOR[rel.freq]?.bg, color: FREQ_COLOR[rel.freq]?.fg }}>{rel.freq}</span>}
          </div>
          <div className="font-bold text-sm truncate">{rel.codigo} — {rel.cliente}</div>
        </div>
        <button onClick={handleDownload} disabled={isPendingApproval} className="px-2.5 sm:px-3 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 disabled:opacity-40 shrink-0"
                style={{ borderColor: C.border, color: C.gray }} title={isPendingApproval ? "Aguardando aprovação do supervisor/coordenador" : "Baixar arquivo HTML para abrir no navegador"}>
          ⬇ <span className="hidden sm:inline">Baixar HTML</span>
        </button>
        {(window.__LSF_ME?.nivelPricer || 0) >= 2 && (
          <button onClick={() => abrirOrcamentoPricer(rel)} className="px-2.5 sm:px-3 py-2 rounded-lg text-sm font-bold border flex items-center gap-2 shrink-0"
                  style={{ borderColor: C.orange, color: C.orange }} title="Montar no LS Pricer a proposta de serviço com o que não está conforme neste relatório">
            <DollarSign size={14} /> <span className="hidden sm:inline">Orçar no Pricer</span>
          </button>
        )}
        <button onClick={handlePrint} disabled={isPendingApproval} className="px-3 sm:px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-40 shrink-0" style={{ background: C.orange }}>
          <Printer size={14} /> <span className="hidden sm:inline">Imprimir / Salvar PDF</span>
        </button>
      </div>

      {isDevolvido && (
        <div className="mx-auto mt-4 max-w-4xl bg-white border rounded-xl p-4 print:hidden" style={{ borderColor: C.nok, color: C.gray }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: C.nok }} />
            <div className="flex-1">
              <div className="font-bold text-sm" style={{ color: C.nok }}>Devolvido para correção por {rel.aprovacao?.devolvidoPor || "supervisor/coordenador"}</div>
              <div className="text-xs mt-1" style={{ color: C.grayMid }}>{fmtDateTime(rel.aprovacao?.devolvidoEm)}</div>
              <div className="text-sm mt-3 p-3 rounded-lg" style={{ background: C.nokLight, color: "#7F1D1D" }}>
                <span className="font-bold">Motivo: </span>{rel.aprovacao?.motivo || "—"}
              </div>
              <div className="text-xs mt-3" style={{ color: C.grayMid }}>O técnico responsável precisa reabrir o atendimento (aba Visitas Técnicas ou Cronograma do contrato), corrigir e reenviar para nova aprovação.</div>
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
                    <Field label="Assinatura / Supervisor ou Coordenador">
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
                      <button onClick={() => setShowDevolverForm(s => !s)} className="px-3 py-2 rounded-lg text-sm font-bold border flex items-center justify-center gap-2" style={{ borderColor: C.nok, color: C.nok }} title="Devolver para o técnico corrigir">
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
    <div className="lsfire-app-shell bg-white shadow-md my-3 print:shadow-none print:my-0 print:break-after-page page-break"
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
        <div className="font-display" style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>{TIPO_REL[rel.tipo]?.nomeLong.toUpperCase()}</div>
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
        <div className="font-display" style={{ fontSize: 11, fontWeight: 900, color: C.orange, letterSpacing: 1 }}>A FORÇA DA ÁGUA É A NOSSA FORÇA</div>
        <div style={{ fontSize: 9, color: C.gray }}>LS Fire | lsfire.com.br | Sistemas de Bombeamento para Combate a Incêndio</div>
      </div>
    </div>
  );
}

function ReportSectionTitle({ children }) {
  return <h1 style={{ fontSize: 18, fontWeight: 900, color: "#000", borderBottom: `3px solid ${C.orange}`, paddingBottom: 4, marginTop: 12, marginBottom: 10 }}>{children}</h1>;
}
function ReportSubTitle({ children }) {
  return <h2 style={{ fontSize: 13, fontWeight: 700, color: C.orange, marginTop: 12, marginBottom: 6 }}>{children}</h2>;
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
            <div className="font-display" style={{ fontSize: 30, fontWeight: 900, color: C.orange, marginTop: 4, letterSpacing: -0.5 }}>INSPEÇÃO, TESTE E MANUTENÇÃO</div>
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
          <div style={{ background: C.orange, color: "#fff", padding: "6px 10px", fontWeight: 900, fontSize: 12, textAlign: "center", letterSpacing: 1 }}>
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
                <td style={{ border: "1px solid #000", padding: "5px 8px", fontWeight: 900, color: C.orange }}>{rel.freq}</td>
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
            <div className="font-display" style={{ fontSize: 38, fontWeight: 900, color: C.orange, marginTop: 4, letterSpacing: -0.5 }}>{tituloCapa}</div>
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
                <div style={{ background: C.orange, color: "#fff", padding: "4px 8px", fontSize: 10, fontWeight: 700 }}>{s.titulo.toUpperCase()}</div>
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
            <td style={{ border: "1px solid #BFBFBF", padding: "4px 6px", background: C.orangeBg, textAlign: "center", fontWeight: 900, color: C.orange }}>{total} km</td>
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
// SEGURANÇA — Telas de Login, Bloqueio, Usuários e Auditoria
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, usuarios, onRestaurar }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restaurado, setRestaurado] = useState(false);
  const soAdminPadrao = usuarios.length === 1 && usuarios[0]?.login === "admin";

  const submit = async () => {
    setErro(""); setLoading(true);
    const r = await onLogin(login, senha);
    setLoading(false);
    if (r?.erro) setErro(r.erro);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lsfire-app-shell" style={{ background: "#FAFAFA" }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border overflow-hidden" style={{ borderColor: C.border }}>
          <div className="p-8 pb-6 text-center border-b" style={{ borderColor: C.border, background: C.orangeLight }}>
            <div className="flex justify-center mb-4"><LogoLSFire size={64} /></div>
            <h1 className="text-xl font-black" style={{ color: C.gray }}>Sistema de Gestão</h1>
            <p className="text-xs mt-1" style={{ color: C.grayMid }}>Sistemas de Bombeamento para Combate a Incêndio</p>
          </div>
          <div className="p-8 space-y-4">
            <Field label="Usuário">
              <input value={login} onChange={e => setLogin(e.target.value)} autoFocus
                     onKeyDown={e => e.key === "Enter" && submit()}
                     placeholder="seu.usuario" autoCapitalize="none"
                     className="w-full border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.border }} />
            </Field>
            <Field label="Senha">
              <div className="relative">
                <input type={showPwd ? "text" : "password"} value={senha} onChange={e => setSenha(e.target.value)}
                       onKeyDown={e => e.key === "Enter" && submit()}
                       placeholder="••••••••"
                       className="w-full border rounded-lg px-3 py-2.5 text-sm pr-10" style={{ borderColor: C.border }} />
                <button onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: C.grayMid }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {erro && (
              <div className="text-xs flex items-center gap-1.5 p-2 rounded" style={{ background: C.nokLight, color: C.nok }}>
                <AlertTriangle size={14} /> {erro}
              </div>
            )}
            <button onClick={submit} disabled={loading || !login || !senha}
                    className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: C.orange }}>
              {loading ? "Entrando…" : <><KeyRound size={16} /> Entrar</>}
            </button>
            {soAdminPadrao && (
              <div className="text-[11px] p-3 rounded-lg" style={{ background: C.amberLight, color: "#92400E" }}>
                <strong>Primeiro acesso:</strong> usuário <code className="font-bold">admin</code> · senha <code className="font-bold">{SENHA_PADRAO_ADMIN}</code>. Altere a senha e cadastre os demais usuários em <strong>Usuários</strong> após entrar.
              </div>
            )}
            {onRestaurar && (
              <div className="text-center pt-1">
                {restaurado ? (
                  <span className="text-[11px] font-semibold" style={{ color: C.ok }}>
                    ✓ Acesso restaurado — entre com admin / {SENHA_PADRAO_ADMIN}
                  </span>
                ) : (
                  <button onClick={() => { onRestaurar(); setRestaurado(true); setErro(""); setLogin("admin"); }}
                          className="text-[11px] underline" style={{ color: C.grayMid }}>
                    Problemas para entrar? Restaurar acesso padrão
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-center mt-4 text-[11px] font-bold tracking-wider font-display" style={{ color: C.orange }}>
          A FORÇA DA ÁGUA É A NOSSA FORÇA
        </div>
      </div>
    </div>
  );
}

function LockScreen({ sessao, onUnlock, onLogout }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErro(""); setLoading(true);
    const r = await onUnlock(senha);
    setLoading(false);
    if (r?.erro) setErro(r.erro); else setSenha("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lsfire-app-shell" style={{ background: "rgba(31,56,100,0.97)" }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4" style={{ background: "rgba(255,255,255,0.1)" }}>
          <Lock size={28} color="#fff" />
        </div>
        <h1 className="text-lg font-bold text-white mb-1">Tela bloqueada</h1>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.7)" }}>
          Sessão de <strong className="text-white">{sessao.nome}</strong> bloqueada por inatividade.
        </p>
        <div className="bg-white rounded-xl p-5 space-y-3">
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus
                 onKeyDown={e => e.key === "Enter" && submit()}
                 placeholder="Digite sua senha para continuar"
                 className="w-full border rounded-lg px-3 py-2.5 text-sm text-center" style={{ borderColor: C.border }} />
          {erro && <div className="text-xs flex items-center justify-center gap-1.5" style={{ color: C.nok }}><AlertTriangle size={14} /> {erro}</div>}
          <button onClick={submit} disabled={loading || !senha}
                  className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: C.orange }}>
            {loading ? "Verificando…" : "Desbloquear"}
          </button>
          <button onClick={onLogout} className="w-full py-1.5 text-xs font-semibold" style={{ color: C.grayMid }}>
            Sair e entrar com outro usuário
          </button>
        </div>
      </div>
    </div>
  );
}

function UsuariosView({ usuarios, contratos, onNew, onEdit, onDelete }) {
  const { sessao } = useAuth();
  const podeExcluir = isAdminProfile(sessao?.perfil);
  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: C.gray }}>Usuários</h1>
        <button onClick={onNew} className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: C.orange }}>
          <Plus size={16} /> Novo Usuário
        </button>
      </div>
      <p className="text-sm mb-6" style={{ color: C.grayMid }}>Controle de acesso ao sistema. Cada usuário entra com login e senha próprios.</p>

      <div className="border rounded-xl divide-y" style={{ borderColor: C.border }}>
        {usuarios.map(u => {
          const perfil = PERFIS[u.perfil];
          const PIcon = perfil?.Icon || User;
          const contratoCli = u.clienteId ? contratos.find(c => c.id === u.clienteId) : null;
          return (
            <div key={u.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: (perfil?.cor || C.gray) + "22" }}>
                <PIcon size={20} style={{ color: perfil?.cor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm flex items-center gap-2" style={{ color: C.gray }}>
                  {u.nome}
                  {!u.ativo && <Pill bg={C.naLight} fg={C.na}>Inativo</Pill>}
                </div>
                <div className="text-xs" style={{ color: C.grayMid }}>
                  @{u.login} · <span style={{ color: perfil?.cor, fontWeight: 600 }}>{perfil?.nome}</span>
                  {contratoCli && ` · ${contratoCli.cliente}`}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onEdit(u)} className="p-2 rounded hover:bg-gray-100"><Pencil size={15} /></button>
                {podeExcluir && u.login !== "admin" && (
                  <button onClick={() => { if (confirm(`Excluir o usuário "${u.nome}"?`)) onDelete(u.id); }} className="p-2 rounded hover:bg-gray-100"><Trash2 size={15} style={{ color: C.nok }} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 rounded-lg text-[11px] flex items-start gap-2" style={{ background: C.grayLight, color: C.grayMid }}>
        <Shield size={14} className="mt-0.5 flex-shrink-0" />
        <span>As senhas são armazenadas com hash (SHA-256) no dispositivo. Como este app roda no navegador, para segurança corporativa completa (dados criptografados em servidor, conformidade LGPD) recomenda-se evoluir para uma versão com backend.</span>
      </div>
    </div>
  );
}

function UsuarioForm({ initial, contratos, usuarios = [], tecnicos = [], onSave }) {
  const [data, setData] = useState({ nome: "", login: "", perfil: "tecnico", ativo: true, clienteId: null, tecnicoId: null, senhaHash: "", ...initial });
  const [novaSenha, setNovaSenha] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const ehNovo = !data.id;
  const ehCliente = data.perfil === "cliente";
  const ehTecnico = data.perfil === "tecnico";
  const loginDuplicado = !!data.login && usuarios.some(u => u.id !== data.id && u.login.toLowerCase() === data.login.trim().toLowerCase());
  const podeSalvar = data.nome && data.login && !loginDuplicado && (!ehNovo || novaSenha) && (!ehCliente || data.clienteId);

  return (
    <div className="space-y-4">
      <Field label="Nome completo">
        <input value={data.nome} onChange={e => upd("nome", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }} />
      </Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Login (usuário)">
          <input value={data.login} onChange={e => upd("login", e.target.value.toLowerCase().replace(/\s/g, ""))}
                 disabled={data.login === "admin"} autoCapitalize="none"
                 className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" style={{ borderColor: loginDuplicado ? C.nok : C.border }} />
          {loginDuplicado && <div className="text-[11px] mt-1 font-semibold" style={{ color: C.nok }}>Já existe um usuário com este login.</div>}
        </Field>
        <Field label="Perfil de acesso">
          <select value={data.perfil} onChange={e => upd("perfil", e.target.value)} disabled={data.login === "admin"}
                  className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" style={{ borderColor: C.border }}>
            {Object.values(PERFIS).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
      </div>

      {ehCliente && (
        <Field label="Contrato vinculado" hint="O cliente só verá relatórios e dados deste contrato.">
          <select value={data.clienteId || ""} onChange={e => upd("clienteId", parseInt(e.target.value) || null)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }}>
            <option value="">Selecione um contrato…</option>
            {contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
        </Field>
      )}

      {ehTecnico && (
        <Field label="Técnico de campo vinculado (opcional)" hint="Liga este login ao cadastro de técnico, para que os avisos de aprovação/devolução cheguem certos para esta pessoa.">
          <select value={data.tecnicoId || ""} onChange={e => upd("tecnicoId", parseInt(e.target.value) || null)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: C.border }}>
            <option value="">Não vinculado (recebe avisos gerais de técnico)</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Field>
      )}

      <Field label={ehNovo ? "Senha" : "Nova senha (deixe em branco para manter)"}>
        <div className="relative">
          <input type={showPwd ? "text" : "password"} value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                 placeholder={ehNovo ? "Defina uma senha" : "••••••••"}
                 className="w-full border rounded-lg px-3 py-2 text-sm pr-10" style={{ borderColor: C.border }} />
          <button onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: C.grayMid }}>
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>

      {data.login !== "admin" && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={data.ativo} onChange={e => upd("ativo", e.target.checked)} style={{ accentColor: C.orange }} />
          <span className="text-sm font-semibold">Usuário ativo (pode fazer login)</span>
        </label>
      )}

      <div className="flex justify-end pt-4 border-t" style={{ borderColor: C.border }}>
        <button onClick={() => onSave(data, novaSenha)} disabled={!podeSalvar}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-2"
                style={{ background: C.orange }}>
          <Save size={14} /> Salvar Usuário
        </button>
      </div>
    </div>
  );
}

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
        <h1 className="text-3xl font-black" style={{ color: C.gray }}>Trilha de Auditoria</h1>
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
                    <Pill bg={(ACAO_COR[a.acao] || C.gray) + "22"} fg={ACAO_COR[a.acao] || C.gray}>{a.acao}</Pill>
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
