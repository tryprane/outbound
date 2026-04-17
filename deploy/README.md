# Deployment Guide

## VPS Access

Use a dedicated deploy user and SSH key.

1. Create a non-root user on the VPS, for example `deploy`.
2. Add your SSH public key to `/home/deploy/.ssh/authorized_keys`.
3. Put the private key into GitHub Secrets as `VPS_SSH_KEY`.
4. Add `VPS_HOST`, `VPS_USER`, and `VPS_PORT` to GitHub Secrets.

Do not share raw passwords in chat. If you need help, share only the secret names and I will give you the exact commands.

## GitHub Secrets

Required:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_SSH_PASSPHRASE`
- `POSTGRES_PASSWORD`
- `PUBLIC_URL`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `GHCR_USERNAME`
- `GHCR_TOKEN`

You can also upload the full set from the terminal:

1. Copy [github-config.template.txt](C:/Users/ghans/OneDrive/Desktop/outbound/deploy/github-config.template.txt) to `deploy/github-config.txt`
2. Fill in the values
3. Run:
   ```powershell
   gh auth login
   powershell -ExecutionPolicy Bypass -File .\scripts\set-github-config.ps1
   ```

Optional tuning overrides:

- `WORKER_GLOBAL_ACTIVE_LIMIT`
- `WORKER_SWEEP_INTERVAL_MS`
- `WORKER_IDLE_CLOSE_MS`
- `CAMPAIGN_WORKER_CONCURRENCY`
- `MAIL_WORKER_CONCURRENCY`
- `REPLY_ANALYSIS_HOST_IP`
- `REPLY_ANALYSIS_BASE_URL`
- `REPLY_ANALYSIS_MODEL`
- `REPLY_ANALYSIS_TIMEOUT_MS`
- `REPLY_ANALYSIS_MAX_TOKENS`
- `REPLY_ANALYSIS_WORKER_CONCURRENCY`
- `SCRAPE_WORKER_CONCURRENCY`
- `WHATSAPP_WORKER_CONCURRENCY`
- `WARMUP_WORKER_CONCURRENCY`
- `WHATSAPP_SESSION_WORKER_CONCURRENCY`
- `WHATSAPP_SESSION_KEEPALIVE`

## First Bootstrap

1. Install `k3s` on the VPS:
   - Run `sudo bash deploy/scripts/bootstrap-vps.sh`
2. Clone this repo to `/opt/outbound`.
3. Create the GHCR pull secret on the cluster:
   - Provide `GHCR_USERNAME` and `GHCR_TOKEN`
   - Example:
     ```bash
     kubectl -n outbound create secret docker-registry ghcr-pull-secret \
       --docker-server=ghcr.io \
       --docker-username="$GHCR_USERNAME" \
       --docker-password="$GHCR_TOKEN" \
       --docker-email="${GHCR_EMAIL:-devnull@example.com}" \
       --dry-run=client -o yaml | kubectl apply -f -
     ```
4. Set your production URL in `PUBLIC_URL`.
5. Run `deploy/scripts/remote-deploy.sh` once to create the namespace, secrets, and workloads.
6. Install the reply-analysis model service on the VPS:
   - Run `sudo bash deploy/scripts/install-reply-analysis-llm.sh`
   - The web and worker pods will use `REPLY_ANALYSIS_BASE_URL` to call that service for opened-reply insights.

## GitHub Actions

The workflow:

1. Builds and pushes the `web`, `worker`, and `scraper` Docker images to GHCR.
2. SSHes into the VPS.
3. Pulls the latest repo state.
4. Renders and applies Kubernetes manifests.
5. Runs the schema sync job.
6. Waits for the rollouts to finish.

## ngrok

`ngrok` is for testing or temporary public previews.

1. Install `ngrok` on the VPS.
2. Export `NGROK_AUTHTOKEN`.
3. Run `deploy/scripts/start-ngrok.sh`.

For permanent public access, keep `PUBLIC_URL` pointed at a real domain or tunnel URL.
