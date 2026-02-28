# Encarta — Deployment Guide

Encarta is a customised customer support platform built on Chatwoot, with rebranded UI, custom theming, and an integrated On-Call incident management middleware.

This guide covers **two deployment scenarios**:

| Scenario | Use case | Build required? | Time to deploy |
|----------|----------|-----------------|----------------|
| **[A. Production Install](#a-production-install-pre-built-images)** | Deploy to a server as-is | No (pulls from GHCR) | ~2 minutes |
| **[B. Development Setup](#b-development-setup-from-source)** | Modify code, test, rebuild | Yes (~10 min first build) | ~15 minutes |

---

## Prerequisites (Both Scenarios)

- **Linux host**: Ubuntu 22.04+ recommended
- **RAM**: 4 GB minimum, 8 GB recommended
- **Docker**: Engine 24+ with Docker Compose v2
- **Firewall**: Port 3000 (or your chosen port) open for inbound TCP traffic

### Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

### Open Firewall Port

**GCP**: VPC Network → Firewall → Create Rule → Ingress, TCP 3000, Source `0.0.0.0/0`

**AWS**: Security Group → Inbound Rule → TCP 3000, Source `0.0.0.0/0`

**Azure**: NSG → Add Inbound Rule → TCP 3000

---

## A. Production Install (Pre-built Images)

This pulls pre-built Docker images from GitHub Container Registry. **No source code or build step needed.**

### Step 1: Download the deploy folder

```bash
# Clone just the deploy directory (sparse checkout)
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/metastablehub/customerSupport.git encarta-install
cd encarta-install
git sparse-checkout set deploy

# Move into the deploy directory
cd deploy
```

Or download manually:
```bash
mkdir -p encarta-install && cd encarta-install
curl -sL https://github.com/metastablehub/customerSupport/archive/refs/heads/master.tar.gz \
  | tar xz --strip-components=2 customerSupport-master/deploy
```

### Step 2: Run the install script
Login to GHCR from your current VM:
```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u metastablehub --password-stdin
```

```bash
chmod +x install.sh
./install.sh
```

The script will:
1. Ask for your **public URL** (e.g., `http://<YOUR_VM_IP>:3000`)
2. Ask for the **port** (default: 3000)
3. Generate all cryptographic secrets automatically
4. Pull pre-built images from `ghcr.io/metastablehub/`
5. Start all services (Postgres, Redis, Rails, Sidekiq, Middleware)

### Step 3: Verify

```bash
# All containers should show "healthy" or "running"
docker compose -f docker-compose.ghcr.yaml ps

# Test locally
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/app/login
# Expected: 200
```

Open `http://<YOUR_VM_IP>:3000` in your browser.

### Step 4: Post-install configuration

1. **Create your admin account** at the sign-up page
2. Go to **Settings → Profile** and create an **Access Token**
3. Edit `.env`:
   ```bash
   nano .env
   # Set these two values:
   # CHATWOOT_API_TOKEN=<your-token>
   # CHATWOOT_ACCOUNT_ID=1
   ```
4. Restart the middleware:
   ```bash
   docker compose -f docker-compose.ghcr.yaml restart middleware
   ```
5. Register the webhook: **Settings → Integrations → Webhooks → Add**
   - URL: `http://middleware:4000/webhook`
   - Events: **Message Created**
6. Configure On-Call: **Settings → Integrations → Encarta On-Call**

### Operations (Pre-built)

```bash
# View logs
docker compose -f docker-compose.ghcr.yaml logs -f

# Restart all services
docker compose -f docker-compose.ghcr.yaml restart

# Stop everything
docker compose -f docker-compose.ghcr.yaml down

# Update to latest images
docker compose -f docker-compose.ghcr.yaml pull
docker compose -f docker-compose.ghcr.yaml up -d
```

---

## B. Development Setup (From Source)

This clones the full source code, builds Docker images locally, and is intended for making changes to the codebase.

### Step 1: Clone the repository

```bash
git clone https://github.com/metastablehub/customerSupport.git
cd customerSupport
```

### Step 2: Run the setup script

```bash
cd deploy
chmod +x setup.sh
./setup.sh
```

The script will:
1. Ask for your **public URL**
2. Ask for the **path to the source tree** (default: parent directory)
3. Ask for the **port** (default: 3000)
4. Generate all cryptographic secrets
5. **Build Docker images from source** (~10 minutes on first run)
6. Run database migrations
7. Start all services

### Step 3: Verify

```bash
docker compose ps

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/app/login
# Expected: 200
```

### Step 4: Post-install configuration

Same as [Production Install Step 4](#step-4-post-install-configuration) above.

### Making Code Changes

After modifying source files:

```bash
cd deploy

# Rebuild and restart
docker compose build
docker compose up -d
```

The `rails-init` service runs database migrations automatically on every startup.

### Operations (From Source)

```bash
# View logs
docker compose logs -f

# View a specific service
docker compose logs -f rails

# Restart all services
docker compose restart

# Stop everything
docker compose down

# Full rebuild (no cache)
docker compose build --no-cache
docker compose up -d

# Stop and remove all data (destructive!)
docker compose down -v
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Docker Compose Stack                │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Postgres │  │  Redis   │  │   Middleware      │  │
│  │ (pg16)   │  │ (alpine) │  │ (On-Call :4000)   │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │             │
│  ┌────┴──────────────┴─────────────────┴──────────┐ │
│  │              Rails (Puma :3000)                 │ │
│  │         Encarta Web Application                │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │              Sidekiq                           │ │
│  │         Background Job Processing              │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Exposed port: 3000 (configurable via ENCARTA_PORT) │
└─────────────────────────────────────────────────────┘
```

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| postgres | pgvector/pgvector:pg16 | 5432 (internal) | Database |
| redis | redis:alpine | 6379 (internal) | Cache and job queues |
| rails | encarta:latest | 3000 (exposed) | Web application |
| sidekiq | encarta:latest | — | Background jobs |
| middleware | encarta-oncall:latest | 4000 (internal) | On-Call integration |

---

## Environment Variables

See `.env.example` for the full list with comments. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONTEND_URL` | Yes | Public URL of the installation |
| `SECRET_KEY_BASE` | Yes | Rails session secret (auto-generated) |
| `POSTGRES_PASSWORD` | Yes | Database password (auto-generated) |
| `REDIS_PASSWORD` | Yes | Redis password (auto-generated) |
| `ENCARTA_PORT` | No | Host port to expose (default: 3000) |
| `CHATWOOT_API_TOKEN` | After setup | API token for the On-Call middleware |
| `CHATWOOT_ACCOUNT_ID` | After setup | Account ID for the middleware |
| `SMTP_*` | For email | SMTP configuration for notifications |

---

## Troubleshooting

**Timeout when accessing `http://<IP>:3000`**
- Verify the port is open in your cloud provider's firewall (GCP/AWS/Azure)
- Check locally: `curl http://localhost:3000/app/login`

**Rails won't start**
- Check logs: `docker compose logs rails`
- Common cause: database not ready (usually resolves on retry)
- Missing `SECRET_KEY_BASE`: re-run the setup/install script

**Assets look wrong after code changes**
- Rebuild without cache: `docker compose build --no-cache`

**Middleware not connecting**
- Ensure `CHATWOOT_API_TOKEN` is set in `.env`
- Restart: `docker compose restart middleware`
- Check: `docker compose logs middleware`

---

## File Structure

```
deploy/
├── .env.example                 # Template with all variables
├── docker-compose.yaml          # Dev/source build compose
├── docker-compose.ghcr.yaml     # Production pre-built compose
├── setup.sh                     # Dev setup (builds from source)
├── install.sh                   # Production install (pulls from GHCR)
├── README.md                    # This file
└── middleware/                   # On-Call middleware service
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.js
        ├── config.js
        ├── handlers/
        ├── services/
        └── workers/
```
