#!/usr/bin/env bash
#
# Spustí E2E sadu proti čerstvě nastartovanému serveru.
#
# Server i prohlížeč běží ve **stejném podman podu** — sdílí tím localhost.
# Bez toho by se prohlížeč na server nedostal: publikovaný port z hostu do
# kontejneru v tomhle prostředí neprochází.
#
# Databáze je pokaždé nová (`/tmp/e2e` uvnitř kontejneru), takže testy startují
# z prázdna a nemusí uklízet po sobě.
#
# Pod se pokaždé vytváří znovu, ne jen restartuje: po přebuildování frontendu
# se mount přeznačkuje (SELinux `:Z`) a běžící kontejner na něj ztratí přístup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POD=msp-e2e
SERVER=msp-e2e-server
DOTNET_IMAGE="mcr.microsoft.com/dotnet/sdk:10.0"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"

# Log serveru se při úklidu vypíše, pokud si o to volající řekne (E2E_LOGS=1).
cleanup() {
  if [ "${E2E_LOGS:-}" = "1" ] && podman container exists "$SERVER" 2>/dev/null; then
    echo "── log serveru ─────────────────────────────"
    podman logs "$SERVER" 2>&1 | grep -viE "^ +(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|VALUES|SET|LIMIT|ORDER)" | tail -"${E2E_LOG_LINES:-40}"
  fi
  podman pod rm -f "$POD" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
podman pod create --name "$POD" >/dev/null

podman run --rm -d --pod "$POD" --name "$SERVER" \
  -v "$ROOT:/repo:Z" -v msprojectmanager-nuget:/root/.nuget/packages \
  -w /repo/src/server/MSProjectManager.Server \
  -e ASPNETCORE_URLS=http://0.0.0.0:8080 \
  -e Auth__RequireHttps=false \
  -e "Hub__DetailedErrors=${E2E_HUB_DETAILED_ERRORS:-false}" \
  -e "Logging__LogLevel__Default=${E2E_LOG_LEVEL:-Warning}" \
  -e Database__Path=/tmp/e2e/msp.db \
  -e DataProtection__KeysPath=/tmp/e2e/keys \
  "$DOTNET_IMAGE" sh -c 'dotnet run --no-launch-profile -c Release --no-build' >/dev/null

printf 'Čekám na server'
for _ in $(seq 1 60); do
  if podman exec "$SERVER" curl -sf -o /dev/null http://localhost:8080/auth/setup-required 2>/dev/null; then
    printf ' — běží\n'
    break
  fi
  printf '.'
  sleep 2
done

podman run --rm --pod "$POD" -v "$ROOT/e2e:/e2e:Z" -w /e2e \
  "$PLAYWRIGHT_IMAGE" \
  sh -c 'npm install --no-audit --no-fund >/dev/null 2>&1 && npx playwright test "$@"' -- "$@"
