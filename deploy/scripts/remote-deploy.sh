#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_DIR="$ROOT_DIR/deploy/k8s"
RENDER_DIR="$(mktemp -d /tmp/outbound-render-XXXXXX)"

cleanup() {
  rm -rf "$RENDER_DIR"
}
trap cleanup EXIT

dump_schema_sync_debug() {
  local namespace="$1"
  echo "----- outbound-schema-sync jobs/pods -----"
  kubectl -n "$namespace" get jobs,pods -o wide || true
  echo "----- outbound-schema-sync describe job -----"
  kubectl -n "$namespace" describe job outbound-schema-sync || true
  echo "----- outbound-schema-sync pod describe -----"
  kubectl -n "$namespace" describe pod -l job-name=outbound-schema-sync || true
  echo "----- outbound-schema-sync logs -----"
  kubectl -n "$namespace" logs job/outbound-schema-sync --all-containers=true --tail=-1 || true
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

require_var WEB_IMAGE
require_var WORKER_IMAGE
require_var SCRAPER_IMAGE
require_var POSTGRES_PASSWORD
require_var PUBLIC_URL
require_var NEXTAUTH_SECRET
require_var ADMIN_EMAIL
require_var ADMIN_PASSWORD
require_var ENCRYPTION_KEY
require_var GOOGLE_CLIENT_ID
require_var GOOGLE_CLIENT_SECRET
require_var ZOHO_CLIENT_ID
require_var ZOHO_CLIENT_SECRET
require_var GEMINI_API_KEY

REPLY_ANALYSIS_HOST_IP="${REPLY_ANALYSIS_HOST_IP:-$(hostname -I | awk '{print $1}')}"
REPLY_ANALYSIS_BASE_URL="${REPLY_ANALYSIS_BASE_URL:-http://${REPLY_ANALYSIS_HOST_IP}:8091}"

INGRESS_HOST="$(printf '%s' "$PUBLIC_URL" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')"
if [[ -z "$INGRESS_HOST" ]]; then
  echo "Could not derive ingress host from PUBLIC_URL=$PUBLIC_URL" >&2
  exit 1
fi

cp "$TEMPLATE_DIR/namespace.yaml" "$RENDER_DIR/namespace.yaml"
cp "$TEMPLATE_DIR/infra.yaml" "$RENDER_DIR/infra.yaml"
cp "$TEMPLATE_DIR/app.yaml" "$RENDER_DIR/app.yaml"
cp "$TEMPLATE_DIR/job.yaml" "$RENDER_DIR/job.yaml"

sed -i "s#__WEB_IMAGE__#${WEB_IMAGE}#g" "$RENDER_DIR/app.yaml" "$RENDER_DIR/job.yaml"
sed -i "s#__WORKER_IMAGE__#${WORKER_IMAGE}#g" "$RENDER_DIR/app.yaml" "$RENDER_DIR/job.yaml"
sed -i "s#__SCRAPER_IMAGE__#${SCRAPER_IMAGE}#g" "$RENDER_DIR/app.yaml"
sed -i "s#__INGRESS_HOST__#${INGRESS_HOST}#g" "$RENDER_DIR/app.yaml"

NAMESPACE="outbound"

kubectl apply -f "$RENDER_DIR/namespace.yaml"

kubectl -n "$NAMESPACE" create secret generic outbound-env \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=POSTGRES_DB=outbound \
  --from-literal=POSTGRES_USER=postgres \
  --from-literal=DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@outbound-postgres:5432/outbound" \
  --from-literal=REDIS_URL="redis://outbound-redis:6379" \
  --from-literal=SCRAPER_SERVICE_URL="http://outbound-scraper:8000" \
  --from-literal=PUBLIC_URL="$PUBLIC_URL" \
  --from-literal=NEXTAUTH_URL="$PUBLIC_URL" \
  --from-literal=APP_URL="$PUBLIC_URL" \
  --from-literal=NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  --from-literal=ADMIN_EMAIL="$ADMIN_EMAIL" \
  --from-literal=ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  --from-literal=ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  --from-literal=GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  --from-literal=GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  --from-literal=ZOHO_CLIENT_ID="$ZOHO_CLIENT_ID" \
  --from-literal=ZOHO_CLIENT_SECRET="$ZOHO_CLIENT_SECRET" \
  --from-literal=ZOHO_ACCOUNTS_BASE_URL="${ZOHO_ACCOUNTS_BASE_URL:-https://accounts.zoho.in}" \
  --from-literal=ZOHO_MAIL_API_BASE_URL="${ZOHO_MAIL_API_BASE_URL:-https://mail.zoho.in/api}" \
  --from-literal=GEMINI_API_KEY="$GEMINI_API_KEY" \
  --from-literal=REPLY_ANALYSIS_BASE_URL="$REPLY_ANALYSIS_BASE_URL" \
  --from-literal=REPLY_ANALYSIS_MODEL="${REPLY_ANALYSIS_MODEL:-gemma-2-2b-it}" \
  --from-literal=REPLY_ANALYSIS_TIMEOUT_MS="${REPLY_ANALYSIS_TIMEOUT_MS:-30000}" \
  --from-literal=REPLY_ANALYSIS_MAX_TOKENS="${REPLY_ANALYSIS_MAX_TOKENS:-220}" \
  --from-literal=NODE_ENV=production \
  --from-literal=WORKER_GLOBAL_ACTIVE_LIMIT="${WORKER_GLOBAL_ACTIVE_LIMIT:-4}" \
  --from-literal=WORKER_SWEEP_INTERVAL_MS="${WORKER_SWEEP_INTERVAL_MS:-5000}" \
  --from-literal=WORKER_IDLE_CLOSE_MS="${WORKER_IDLE_CLOSE_MS:-120000}" \
  --from-literal=CAMPAIGN_WORKER_CONCURRENCY="${CAMPAIGN_WORKER_CONCURRENCY:-1}" \
  --from-literal=MAIL_WORKER_CONCURRENCY="${MAIL_WORKER_CONCURRENCY:-1}" \
  --from-literal=REPLY_ANALYSIS_WORKER_CONCURRENCY="${REPLY_ANALYSIS_WORKER_CONCURRENCY:-1}" \
  --from-literal=SCRAPE_WORKER_CONCURRENCY="${SCRAPE_WORKER_CONCURRENCY:-1}" \
  --from-literal=WHATSAPP_WORKER_CONCURRENCY="${WHATSAPP_WORKER_CONCURRENCY:-1}" \
  --from-literal=WARMUP_WORKER_CONCURRENCY="${WARMUP_WORKER_CONCURRENCY:-1}" \
  --from-literal=WHATSAPP_SESSION_WORKER_CONCURRENCY="${WHATSAPP_SESSION_WORKER_CONCURRENCY:-1}" \
  --from-literal=WHATSAPP_SESSION_KEEPALIVE="${WHATSAPP_SESSION_KEEPALIVE:-false}" \
  --dry-run=client -o yaml | kubectl apply -f -

if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  if kubectl -n "$NAMESPACE" get secret ghcr-pull-secret >/dev/null 2>&1; then
    kubectl -n "$NAMESPACE" delete secret ghcr-pull-secret
  fi
  kubectl -n "$NAMESPACE" create secret docker-registry ghcr-pull-secret \
    --docker-server=ghcr.io \
    --docker-username="$GHCR_USERNAME" \
    --docker-password="$GHCR_TOKEN" \
    --docker-email="${GHCR_EMAIL:-devnull@example.com}" \
    --dry-run=client -o yaml | kubectl apply -f -
else
  echo "GHCR_USERNAME/GHCR_TOKEN not provided. Existing pull secret must already exist." >&2
fi

kubectl apply -f "$RENDER_DIR/infra.yaml"
kubectl -n "$NAMESPACE" rollout status deployment/outbound-postgres --timeout=10m
kubectl -n "$NAMESPACE" rollout status deployment/outbound-redis --timeout=10m

kubectl delete job outbound-schema-sync -n "$NAMESPACE" --ignore-not-found
kubectl apply -f "$RENDER_DIR/job.yaml"
if ! kubectl -n "$NAMESPACE" wait --for=condition=complete job/outbound-schema-sync --timeout=12m; then
  dump_schema_sync_debug "$NAMESPACE"
  exit 1
fi

kubectl apply -f "$RENDER_DIR/app.yaml"
kubectl -n "$NAMESPACE" rollout status deployment/outbound-web --timeout=10m
kubectl -n "$NAMESPACE" rollout status deployment/outbound-worker --timeout=10m
kubectl -n "$NAMESPACE" rollout status deployment/outbound-scraper --timeout=10m

kubectl -n "$NAMESPACE" get pods -o wide
