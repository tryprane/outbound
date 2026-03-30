## VPS Bootstrap Log

Date: 2026-03-26
Target host: `outreach@34.46.223.100`
Repo path on VPS: `/opt/outbound`
Repo commit on VPS: `96d6a33`

### What was installed

- `git`
- `jq`
- `unzip`
- `k3s`
- `kubectl`
- `helm`
- `ngrok`

### What was configured

- Cloned the repository to `/opt/outbound`
- Updated the VPS checkout to the latest `main` commit
- Marked deployment scripts as executable:
  - `/opt/outbound/deploy/scripts/bootstrap-vps.sh`
  - `/opt/outbound/deploy/scripts/remote-deploy.sh`
  - `/opt/outbound/deploy/scripts/start-ngrok.sh`
- Normalized Git file mode handling on the VPS checkout with `git config core.fileMode false`

### Cluster status after bootstrap

- `k3s` service status: `active`
- Kubernetes node status: `Ready`
- Core system pods running:
  - `coredns`
  - `local-path-provisioner`
  - `metrics-server`
  - `traefik`
  - `svclb-traefik`

### Important notes

- Docker was not installed because this setup uses `k3s` with `containerd`, which is sufficient for the current Kubernetes deployment path.
- The application itself has not been deployed yet because production secrets still need to be added in GitHub Actions and passed into the cluster.
- `ngrok` is installed and ready, but it still needs `NGROK_AUTHTOKEN` before it can expose the app publicly.

### Remaining steps before production is live

1. Add GitHub Actions secrets:
   - `VPS_HOST`
   - `VPS_USER`
   - `VPS_SSH_KEY`
   - `VPS_SSH_PASSPHRASE`
   - `POSTGRES_PASSWORD`
   - `PUBLIC_URL`
   - `NEXTAUTH_SECRET`
   - `ENCRYPTION_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GEMINI_API_KEY`
   - `GHCR_USERNAME`
   - `GHCR_TOKEN`
2. Push to `main` or manually trigger the deploy workflow.
3. Let GitHub Actions build the images, push them to GHCR, and run `/opt/outbound/deploy/scripts/remote-deploy.sh` on the VPS.
4. After the app is live, add `NGROK_AUTHTOKEN` on the VPS and run `/opt/outbound/deploy/scripts/start-ngrok.sh` if you want a temporary public tunnel.
