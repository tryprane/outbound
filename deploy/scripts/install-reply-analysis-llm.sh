#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo or as root." >&2
  exit 1
fi

LLM_ROOT="${LLM_ROOT:-/opt/reply-analysis}"
BIN_DIR="$LLM_ROOT/bin"
MODEL_DIR="$LLM_ROOT/models"
TMP_DIR="$(mktemp -d /tmp/reply-analysis-XXXXXX)"
SERVICE_FILE="/etc/systemd/system/outbound-reply-analysis.service"
LLAMA_RELEASE_URL="${LLAMA_RELEASE_URL:-https://github.com/ggml-org/llama.cpp/releases/download/b8827/llama-b8827-bin-ubuntu-x64.tar.gz}"
MODEL_URL="${MODEL_URL:-https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf?download=true}"
MODEL_FILE="$MODEL_DIR/gemma-2-2b-it-Q4_K_M.gguf"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

apt-get update
apt-get install -y curl tar

mkdir -p "$BIN_DIR" "$MODEL_DIR"

echo "[LLM] Downloading llama.cpp runtime..."
curl -L "$LLAMA_RELEASE_URL" -o "$TMP_DIR/llama.tar.gz"
tar -xzf "$TMP_DIR/llama.tar.gz" -C "$BIN_DIR" --strip-components=1
chmod +x "$BIN_DIR/llama-server" || true

echo "[LLM] Downloading Gemma model..."
curl -L "$MODEL_URL" -o "$MODEL_FILE"

cat > "$LLM_ROOT/run-server.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/reply-analysis/bin/llama-server \
  -m /opt/reply-analysis/models/gemma-2-2b-it-Q4_K_M.gguf \
  -c 2048 \
  -t 2 \
  -ngl 0 \
  --host 0.0.0.0 \
  --port 8091
EOF

chmod +x "$LLM_ROOT/run-server.sh"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Outreach reply analysis LLM
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=outreach
WorkingDirectory=$LLM_ROOT
ExecStart=$LLM_ROOT/run-server.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable outbound-reply-analysis.service
systemctl restart outbound-reply-analysis.service
systemctl status outbound-reply-analysis.service --no-pager
