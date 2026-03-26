#!/usr/bin/env bash
set -euo pipefail

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed." >&2
  exit 1
fi

if [[ -n "${NGROK_AUTHTOKEN:-}" ]]; then
  ngrok config add-authtoken "$NGROK_AUTHTOKEN" >/dev/null
fi

ngrok http 80

