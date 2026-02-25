#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.example"

echo "========================================="
echo "  Encarta — Production Setup"
echo "========================================="
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
read -rp "Public URL for Encarta (e.g. https://encarta.yourcompany.com): " FRONTEND_URL
FRONTEND_URL="${FRONTEND_URL%/}"

if [ -z "$FRONTEND_URL" ]; then
  echo "ERROR: FRONTEND_URL is required."
  exit 1
fi

DEFAULT_SRC="$(cd "$DEPLOY_DIR/.." && pwd)"
read -rp "Path to Encarta source tree [$DEFAULT_SRC]: " SRC_PATH
SRC_PATH="${SRC_PATH:-$DEFAULT_SRC}"

if [ ! -f "$SRC_PATH/docker/Dockerfile" ]; then
  echo "ERROR: Encarta source not found at $SRC_PATH"
  echo "Make sure the path contains the modified Chatwoot source with docker/Dockerfile."
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
replace_env "ENCARTA_SOURCE_PATH"                       "$SRC_PATH"

echo
echo ".env written to $ENV_FILE"

# --- Build images ---
echo
echo "Building Docker images (this may take 5-10 minutes)..."
cd "$DEPLOY_DIR"
docker compose build

# --- Start the stack ---
echo
echo "Starting Encarta..."
docker compose up -d

echo
echo "Waiting for database initialization and Rails startup..."
echo "(this may take 1-2 minutes on first run)"

TIMEOUT=180
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if docker compose ps rails 2>/dev/null | grep -q "healthy"; then
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
  echo "Check logs with:  docker compose -f $DEPLOY_DIR/docker-compose.yaml logs rails"
  echo "The setup will continue — the service may still be starting."
else
  echo "Encarta is running."
fi

echo
echo "========================================="
echo "  Setup Complete"
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
echo "       cd $DEPLOY_DIR && docker compose restart middleware"
echo "  5. Register the webhook in Encarta:"
echo "       Settings > Integrations > Webhooks > Add"
echo "       URL: http://middleware:4000/webhook"
echo "       Events: message_created"
echo "  6. Configure On-Call credentials:"
echo "       Settings > Integrations > Encarta On-Call"
echo
echo "  Useful commands:"
echo "    docker compose -f $DEPLOY_DIR/docker-compose.yaml logs -f"
echo "    docker compose -f $DEPLOY_DIR/docker-compose.yaml restart"
echo "    docker compose -f $DEPLOY_DIR/docker-compose.yaml down"
echo
