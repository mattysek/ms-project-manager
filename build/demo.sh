#!/usr/bin/env bash
#
# Spustí aplikaci lokálně, aby se dala otevřít v prohlížeči.
#
#   ./build/demo.sh          — čerstvá databáze, port 8080
#   ./build/demo.sh --keep   — pokračuje v databázi z minula
#   ./build/demo.sh --seed   — čerstvá databáze + předvyplněná demo data
#   PORT=9000 ./build/demo.sh
#
# Rozdíl proti `e2e/run.sh`: ten drží server i prohlížeč v jednom podu, protože
# Playwright se k němu musí dostat zevnitř. Tady jde port ven na host, aby se
# aplikace otevřela v běžném prohlížeči.
#
# Data leží v `.demo/` v repozitáři (gitignorováno), ne v kontejneru — přežijí
# tedy restart a `--keep` na ně naváže.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER=msp-demo
DOTNET_IMAGE="mcr.microsoft.com/dotnet/sdk:10.0"
PORT="${PORT:-8080}"
# Ne `localhost`: to se u rootless podmana rozloží nejdřív na ::1, kam pasta
# publikovaný port nepřeposílá — spojení pak spadne, i když server běží.
HOST=127.0.0.1
DEMO_DIR="$ROOT/.demo"

KEEP=false
SEED=false
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=true ;;
    --seed) SEED=true ;;
    *) echo "Neznámý přepínač: $arg (--keep|--seed)" >&2; exit 1 ;;
  esac
done

command -v podman >/dev/null || { echo "podman není nainstalovaný" >&2; exit 1; }

podman rm -f "$CONTAINER" >/dev/null 2>&1 || true

if [ "$KEEP" = false ]; then
  rm -rf "$DEMO_DIR"
fi
mkdir -p "$DEMO_DIR/data" "$DEMO_DIR/keys"

# Frontend musí být ve wwwroot, jinak server běží, ale vrací prázdnou stránku.
if [ ! -f "$ROOT/src/server/MSProjectManager.Server/wwwroot/index.html" ]; then
  echo "▸ wwwroot je prázdný — buduji frontend"
  "$ROOT/build/build.sh" web
fi

echo "▸ Startuji server na portu $PORT"
podman run --rm -d --name "$CONTAINER" \
  -p "$PORT:8080" \
  -v "$ROOT:/repo:Z" \
  -v "$DEMO_DIR:/demo:Z" \
  -v msprojectmanager-nuget:/root/.nuget/packages \
  -w /repo/src/server/MSProjectManager.Server \
  -e ASPNETCORE_URLS=http://0.0.0.0:8080 \
  -e Auth__RequireHttps=false \
  -e Logging__LogLevel__Default=Warning \
  -e Database__Path=/demo/data/msp.db \
  -e DataProtection__KeysPath=/demo/keys \
  "$DOTNET_IMAGE" sh -c 'dotnet run --no-launch-profile -c Release' >/dev/null

printf '▸ Čekám na server'
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null "http://$HOST:$PORT/auth/setup-required" 2>/dev/null; then
    printf ' — běží\n'
    break
  fi
  printf '.'
  sleep 2
done

if ! curl -sf -o /dev/null "http://$HOST:$PORT/auth/setup-required" 2>/dev/null; then
  echo
  echo "✗ Server nenaběhl. Log:" >&2
  podman logs "$CONTAINER" 2>&1 | tail -30 >&2
  exit 1
fi

if [ "$SEED" = true ]; then
  "$ROOT/build/demo-seed.sh" "$PORT" "$HOST"
fi

cat <<EOF

  Aplikace běží:  http://$HOST:$PORT

EOF

if [ "$SEED" = true ]; then
  cat <<EOF
  Přihlašovací údaje (heslo všech kromě admina: Heslo1234):
    admin            Správce systému — správa uživatelů
    jan.novak        PM obou projektů, má TODO, připomínky a Quick Notes
    petra.kolarova   Dev v obou projektech — ukáže vytížení v „Moje práce"
    tomas.vondracek  Dev v Backend refaktoringu
    lucie.dvorakova  Dev v Mobilním klientovi

  Co je naplněné:
    2 aktivní projekty + 1 archivovaný (režim „jen ke čtení")
    osoby spárované s účty, rozdělená alokace, 9 + 3 úkoly včetně backlogu
    milníky s checklistem, 4 kategorie, rizika, příležitosti
    3 stránky dokumentace, 2 přílohy, poznámky v Markdownu

EOF
else
  cat <<EOF
  Aplikace nemá veřejnou registraci — při prvním otevření vás vyzve
  k založení správcovského účtu. Další účty pak zakládá admin.

  Chcete raději předvyplněná data?  ./build/demo.sh --seed

EOF
fi

cat <<EOF
  Zastavení:      podman rm -f $CONTAINER
  Log:            podman logs -f $CONTAINER
  Data:           .demo/  (smaže se při dalším spuštění bez --keep)
EOF
