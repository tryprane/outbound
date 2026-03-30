# Outbound System

Welcome to the Outbound System repository. This project includes an automated outreach setup.

## Technical Documentation

- **[System Architecture & Plan](./outbound-system-plan.md)**: Main architectural overview and system requirements.
- **[Codebase Index](./CODEBASE_INDEX.md)**: Details on the current codebase layout and modules.
- **[Deployment Guide](./deploy/README.md)**: Instructions on deploying the infrastructure and apps.

## Structure

- `apps/` - Frontend and user-facing applications
- `worker/` - Backend background workers, queue processors, and bots
- `scripts/` - Deployment and utility scripts

## Setup & Local Development

1. Copy `.env.example` to `.env` and fill in the required environment variables.
2. Ensure you have Node.js and any dependencies installed (e.g., Docker for running Redis/Postgres via `docker-compose.yml`).
3. (Add your installation commands here)

## Warmup Smoke Test

To run a staging-style warmup smoke test from the worker:

```bash
cd worker
npm run smoke:warmup
```

Optional environment variables:

- `WARMUP_SMOKE_ACCOUNT_EMAIL`: target a specific warmup mailbox
- `WARMUP_SMOKE_TIMEOUT_MS`: how long to wait for a new warmup log
- `WARMUP_SMOKE_CLEAR_COOLDOWN=false`: keep the mailbox cooldown intact instead of clearing `lastMailSentAt`

What the smoke test verifies:

- Redis and Postgres connectivity
- presence of an eligible `WARMING` mailbox
- presence of at least one warmup recipient or sibling warmup mailbox
- successful queue enqueue for a warmup job
- creation of a fresh `WarmupMailLog` record after enqueue
- updated mailbox counters/status after the run
- optional reply evidence if the recipient is a system mailbox and the probabilistic reply happens
