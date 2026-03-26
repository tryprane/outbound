#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this script as root or with sudo." >&2
  exit 1
fi

if ! command -v k3s >/dev/null 2>&1; then
  echo "Installing k3s..."
  curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644
fi

echo "k3s is ready."
echo "Next step: clone the repo to /opt/outbound and run deploy/scripts/remote-deploy.sh from that checkout."

