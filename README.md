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
