#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo or as root." >&2
  exit 1
fi

OLLAMA_HOST_VALUE="${OLLAMA_HOST_VALUE:-0.0.0.0:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma2:2b}"
OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"

apt-get update
apt-get install -y curl zstd

if systemctl list-unit-files | grep -q '^outbound-reply-analysis.service'; then
  systemctl disable --now outbound-reply-analysis.service || true
  rm -f /etc/systemd/system/outbound-reply-analysis.service
fi

echo "[LLM] Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

mkdir -p "$OVERRIDE_DIR"
cat > "$OVERRIDE_DIR/override.conf" <<EOF
[Service]
Environment="OLLAMA_HOST=${OLLAMA_HOST_VALUE}"
EOF

systemctl daemon-reload
systemctl enable ollama
systemctl restart ollama
systemctl status ollama --no-pager

echo "[LLM] Pulling model ${OLLAMA_MODEL}..."
OLLAMA_HOST="http://127.0.0.1:11434" ollama pull "$OLLAMA_MODEL"
OLLAMA_HOST="http://127.0.0.1:11434" ollama list
