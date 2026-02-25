#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.example"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.ghcr.yaml"

echo "========================================="
echo "  Encarta — Quick Install (Pre-built)"
echo "========================================="
echo
echo "This script pulls pre-built images from"
echo "GitHub Container Registry. No build step."
echo

# --- Pre-flight checks ---
for cmd in docker openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is not installed. Please install it first."
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  echo "ERROR: 'docker compose' (v2) is required. Please update Docker."
  exit 1
fi

# --- Collect inputs ---
read -rp "Public URL for Encarta (e.g. http://<YOUR_IP>:3000): " FRONTEND_URL
FRONTEND_URL="${FRONTEND_URL%/}"

if [ -z "$FRONTEND_URL" ]; then
  echo "ERROR: FRONTEND_URL is required."
  exit 1
fi

read -rp "Port to expose Encarta on [3000]: " ENCARTA_PORT
ENCARTA_PORT="${ENCARTA_PORT:-3000}"

# --- Generate secrets ---
echo
echo "Generating cryptographic secrets..."
SECRET_KEY_BASE=$(openssl rand -hex 64)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
AR_PRIMARY=$(openssl rand -hex 16)
AR_DETERMINISTIC=$(openssl rand -hex 16)
AR_SALT=$(openssl rand -hex 16)

# --- Write .env ---
if [ -f "$ENV_FILE" ]; then
  BACKUP="$ENV_FILE.backup.$(date +%s)"
  echo "Existing .env found — backing up to $BACKUP"
  cp "$ENV_FILE" "$BACKUP"
fi

cp "$ENV_EXAMPLE" "$ENV_FILE"

replace_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

replace_env "FRONTEND_URL"                              "$FRONTEND_URL"
replace_env "SECRET_KEY_BASE"                           "$SECRET_KEY_BASE"
replace_env "POSTGRES_PASSWORD"                         "$POSTGRES_PASSWORD"
replace_env "REDIS_PASSWORD"                            "$REDIS_PASSWORD"
replace_env "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY"      "$AR_PRIMARY"
replace_env "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY" "$AR_DETERMINISTIC"
replace_env "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT" "$AR_SALT"
replace_env "ENCARTA_PORT"                              "$ENCARTA_PORT"

echo
echo ".env written to $ENV_FILE"

# --- Pull images ---
echo
echo "Pulling pre-built images from GitHub Container Registry..."
docker compose -f "$COMPOSE_FILE" pull

# --- Start the stack ---
echo
echo "Starting Encarta..."
docker compose -f "$COMPOSE_FILE" up -d

echo
echo "Waiting for database initialization and Rails startup..."
echo "(this may take 1-2 minutes on first run)"

TIMEOUT=180
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if docker compose -f "$COMPOSE_FILE" ps rails 2>/dev/null | grep -q "healthy"; then
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  printf "."
done
echo

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo
  echo "WARNING: Rails did not become healthy within ${TIMEOUT}s."
  echo "Check logs with:  docker compose -f $COMPOSE_FILE logs rails"
  echo "The setup will continue — the service may still be starting."
else
  echo "Encarta is running."
fi

echo
echo "========================================="
echo "  Install Complete"
echo "========================================="
echo
echo "  Encarta is available at: $FRONTEND_URL"
echo
echo "  NEXT STEPS:"
echo "  1. Open $FRONTEND_URL and create your admin account"
echo "  2. Go to Settings > Profile and create an Access Token"
echo "  3. Edit $ENV_FILE and set:"
echo "       CHATWOOT_API_TOKEN=<your token>"
echo "       CHATWOOT_ACCOUNT_ID=<your account id>"
echo "  4. Restart the middleware:"
echo "       cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE restart middleware"
echo
echo "  Useful commands:"
echo "    docker compose -f $COMPOSE_FILE logs -f"
echo "    docker compose -f $COMPOSE_FILE restart"
echo "    docker compose -f $COMPOSE_FILE down"
echo
