// Gravação em arquivo JSON: atômica (tmp + rename) e com um pequeno atraso para juntar gravações seguidas.
import fs from "fs";

export function lerJson(arq, padrao) {
  try { return JSON.parse(fs.readFileSync(arq, "utf-8")); } catch { return padrao; }
}

export function gravadorJson(arq, obter, atrasoMs = 200) {
  let timer = null;
  const gravarJa = () => {
    clearTimeout(timer); timer = null;
    try {
      const tmp = arq + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(obter()), { mode: 0o600 });
      fs.renameSync(tmp, arq);
    } catch (e) { console.error("Falha ao gravar " + arq + ":", e.message); }
  };
  const agendar = () => { clearTimeout(timer); timer = setTimeout(gravarJa, atrasoMs); };
  agendar.agora = gravarJa;
  agendar.pendente = () => !!timer;
  return agendar;
}
