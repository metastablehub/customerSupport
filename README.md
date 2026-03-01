# Encarta — Installation Guide

Complete step-by-step guide for installing Encarta on a new VM.

| Option | Use case | Build required? | Time |
|--------|----------|-----------------|------|
| **[Option 1: Pre-built Images](#option-1-deploy-pre-built-images-quick-install-5-minutes)** | Deploy to a server as-is | No (pulls from GHCR) | ~5 minutes |
| **[Option 2: Development Setup](#option-2-development-setup-full-source-20-30-minutes)** | Modify code, test, rebuild | Yes (builds locally) | ~20-30 minutes |

---

## Prerequisites (Both Options)

- **Linux VM**: Ubuntu 22.04+ recommended
- **RAM**: 4 GB minimum (8 GB for development builds)
- **Docker**: Engine 24+ with Docker Compose v2
- **Firewall**: Port 3000 open for inbound TCP traffic

### Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

### Open Firewall Port

| Cloud | How |
|-------|-----|
| **GCP** | VPC Network → Firewall → Create Rule → Ingress, TCP 3000, Source `0.0.0.0/0` |
| **AWS** | Security Group → Inbound Rule → TCP 3000, Source `0.0.0.0/0` |
| **Azure** | NSG → Add Inbound Rule → TCP 3000 |

---

## Option 1: Deploy Pre-built Images (Quick Install, ~5 minutes)

This pulls ready-made Docker images from GHCR. No source code compilation needed.

### Step 1 — Download the deploy folder only

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/metastablehub/customerSupport.git encarta-install
cd encarta-install
git sparse-checkout set deploy
cd deploy
```

### Step 2 — Login to GHCR

The Docker images are hosted on GitHub Container Registry. You need a GitHub token with `read:packages` scope:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u metastablehub --password-stdin
```

### Step 3 — Run the install script

```bash
chmod +x install.sh
./install.sh
```

The script will interactively:

1. Ask for your **public URL** (e.g. `http://YOUR_VM_IP:3000`) — if you forget the `http://`, it auto-prepends it
2. Ask for the **port** (default: 3000)
3. Auto-generate all secrets (database passwords, Rails keys, encryption keys)
4. Pull the pre-built images from GHCR
5. Start all 6 services (Postgres, Redis, Rails, Sidekiq, rails-init, Middleware)
6. Wait for Rails to become healthy (~1-2 minutes)
7. Prompt: **"Open the URL and create your admin account"** — do this in your browser, then press Enter
8. Auto-retrieve your API token from the database and write it to `.env`
9. Auto-register the webhook for the middleware
10. Print "Install Complete"

### Step 4 — Configure the On-Call integration

1. Open `http://YOUR_VM_IP:3000` in your browser
2. Go to **Settings → Integrations → Encarta On-Call**
3. Enter your OneUptime details:
   - **Base URL** (e.g. `http://34.123.182.39` or `https://oneuptime.example.com`)
   - **Project ID**
   - **API Key**
4. Click Connect

### Step 5 — Verify everything works

```bash
# All containers should show "healthy" or "running"
docker compose -f docker-compose.ghcr.yaml ps

# Test the app
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/app/login
# Expected: 200

# Test the middleware
curl -s http://localhost:4000/health
# Expected: {"status":"ok","account_id":1, ...}
```

### Useful commands (Pre-built)

```bash
# View logs (all services)
docker compose -f docker-compose.ghcr.yaml logs -f

# View middleware logs only
docker compose -f docker-compose.ghcr.yaml logs -f middleware

# Restart everything
docker compose -f docker-compose.ghcr.yaml restart

# Stop everything (data preserved)
docker compose -f docker-compose.ghcr.yaml down

# Update to latest images
docker compose -f docker-compose.ghcr.yaml pull
docker compose -f docker-compose.ghcr.yaml up -d

# Stop and DELETE all data
docker compose -f docker-compose.ghcr.yaml down -v
```

---

## Option 2: Development Setup (Full Source, ~20-30 minutes)

This clones the entire source code and builds Docker images locally. Use this when you need to make changes to the Encarta codebase.

**Additional prerequisites:** 8 GB RAM minimum, ~10 GB disk space for source + Docker images.

### Step 1 — Clone the full repository

```bash
git clone https://github.com/metastablehub/customerSupport.git encarta-install
cd encarta-install/deploy
```

### Step 2 — Run the setup script

```bash
chmod +x setup.sh
./setup.sh
```

The script will interactively:

1. Ask for your **public URL**
2. Ask for the **path to Encarta source tree** (default: parent directory — correct if you're in `deploy/`)
3. Ask for the **port** (default: 3000)
4. Auto-generate all secrets
5. **Build Docker images from source** (~20-30 minutes first time; gem install + asset precompilation)
6. Start all services
7. Wait for Rails to become healthy
8. Prompt: **"Create your admin account"** — do this in your browser, then press Enter
9. Auto-configure API token and webhook (same as production)

### Step 3 — Configure On-Call integration

Same as Option 1, Step 4.

### Step 4 — Verify

```bash
docker compose ps

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/app/login
# Expected: 200

curl -s http://localhost:4000/health
# Expected: {"status":"ok", ...}
```

### Making code changes

After editing source files (Vue components, Rails models, etc.):

```bash
cd deploy

# Rebuild and restart (uses Docker cache, much faster than first build)
docker compose build
docker compose up -d
```

For **middleware-only changes** (files in `deploy/middleware/src/`):

```bash
cd deploy
docker compose build middleware
docker compose up -d middleware
```

### Useful commands (Development)

```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f rails
docker compose logs -f middleware

# Rails console (for debugging)
docker compose exec rails bundle exec rails console

# Database console
docker compose exec postgres psql -U postgres encarta_production

# Full rebuild with no cache (if something seems stale)
docker compose build --no-cache
docker compose up -d

# Stop and DELETE all data (fresh start)
docker compose down -v
```

---

## What's Automated (Zero Manual Config)

These things are fully automatic during install — no manual `.env` editing required:

| What | How |
|------|-----|
| **API Token** | Generated from your admin account and written to `.env` during install |
| **Account ID** | Dynamically discovered by the middleware at runtime from the API token |
| **Webhook** | Auto-registered to `http://middleware:4000/webhook` during install |
| **URL protocol** | Auto-prepended `http://` if you forget it (both in install script and middleware) |
| **Middleware port** | Port 4000 already exposed in both compose files |

The **only manual step** after install is configuring your OneUptime credentials in the Encarta UI.

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
| rails | customersupport:v2.0-zero-config | 3000 (exposed) | Web application |
| sidekiq | customersupport:v2.0-zero-config | — | Background jobs |
| middleware | customersupport-middleware:v2.0-zero-config | 4000 (exposed) | On-Call integration |

---

## Troubleshooting

**Timeout when accessing `http://<IP>:3000`**
- Verify the port is open in your cloud provider's firewall (GCP/AWS/Azure)
- Check locally: `curl http://localhost:3000/app/login`

**Rails won't start**
- Check logs: `docker compose logs rails`
- Common cause: database not ready (usually resolves on retry)
- Missing `SECRET_KEY_BASE`: re-run the install/setup script

**Middleware not connecting**
- Ensure `CHATWOOT_API_TOKEN` is set in `.env` (auto-generated during install)
- The account ID is auto-discovered from the API token — no manual config needed
- Restart: `docker compose restart middleware`
- Check: `docker compose logs middleware`

**Assets look wrong after code changes**
- Rebuild without cache: `docker compose build --no-cache`
