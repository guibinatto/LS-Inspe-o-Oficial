#!/usr/bin/env bash
# Monta o pacote do servidor LS Fire: gera o Pricer (arquivo único) e o módulo de Serviço de campo (PWA).
# Uso (na pasta do repositório):  bash servidor/tools/montar.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
echo "1/3 Pricer → servidor/app/pricer.html"
(cd "$RAIZ/pricer" && python3 tools/build.py)
mkdir -p "$RAIZ/servidor/app" && cp "$RAIZ/pricer/dist/ls-pricer.html" "$RAIZ/servidor/app/pricer.html"
echo "2/3 Serviço de campo → servidor/public/servico/"
(cd "$RAIZ/servidor/servico-web" && npm ci --no-audit --no-fund && npx vite build)
echo "3/3 dependências do servidor"
(cd "$RAIZ/servidor" && npm ci --no-audit --no-fund --omit=dev)
echo "Pronto. Teste: cd servidor && npm test"
