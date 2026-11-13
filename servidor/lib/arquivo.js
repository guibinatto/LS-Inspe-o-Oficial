// Gravação em arquivo JSON: atômica (tmp + fsync + rename) e com um pequeno atraso para juntar gravações seguidas.
import fs from "fs";
import path from "path";

// Arquivo que não existe = começa com o padrão. Arquivo que existe mas não abre (cortado, corrompido) NÃO vira o padrão:
// isso apagaria os dados na primeira gravação. O servidor para e diz o que fazer.
export function lerJson(arq, padrao) {
  let txt;
  try { txt = fs.readFileSync(arq, "utf-8"); } catch (e) { if (e.code === "ENOENT") return padrao; throw e; }
  try { return JSON.parse(txt); } catch (e) {
    const err = new Error(`O arquivo de dados ${arq} está corrompido (${e.message}). O servidor não vai subir para não gravar por cima. ` +
      `Restaure a cópia mais recente de data/backups/ (ou o .tmp ao lado, se estiver inteiro) e inicie de novo.`);
    err.code = "LSF_CORROMPIDO"; throw err;
  }
}

const gravadores = new Set();
export function gravadorJson(arq, obter, atrasoMs = 200, maxAtrasoMs = 2000) {
  let timer = null, primeiro = 0;
  const gravarJa = () => {
    clearTimeout(timer); timer = null; primeiro = 0;
    try {
      const tmp = arq + ".tmp";
      const fd = fs.openSync(tmp, "w", 0o600);
      try { fs.writeSync(fd, JSON.stringify(obter())); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, arq);
      try { const d = fs.openSync(path.dirname(arq), "r"); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* Windows não sincroniza pasta */ }
    } catch (e) { console.error("Falha ao gravar " + arq + ":", e.message); }
  };
  // junta gravações seguidas, mas nunca segura mais que maxAtrasoMs desde o primeiro pedido (escrita contínua também chega ao disco)
  const agendar = () => {
    const agora = Date.now(); if (!primeiro) primeiro = agora;
    clearTimeout(timer);
    timer = setTimeout(gravarJa, Math.max(0, Math.min(atrasoMs, primeiro + maxAtrasoMs - agora)));
  };
  agendar.agora = gravarJa;
  agendar.pendente = () => !!timer;
  gravadores.add(agendar);
  return agendar;
}
// grava tudo o que está pendente (desligamento do servidor)
export function gravarPendentes() { for (const g of gravadores) if (g.pendente()) g.agora(); }
