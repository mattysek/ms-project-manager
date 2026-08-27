#!/usr/bin/env bash
#
# Kontejnerizovaný build MSProjectManageru přes podman.
# Nic není potřeba instalovat lokálně — node ani .NET SDK.
#
# Použití:
#   ./build/build.sh web       — build frontendu + kopie do wwwroot serveru
#   ./build/build.sh server    — build backendu (dotnet build -c Release)
#   ./build/build.sh all       — web + server
#   ./build/build.sh lint      — Biome (TS) + FSharpLint (F#)
#   ./build/build.sh format    — Biome format + Fantomas, přepíše soubory
#   ./build/build.sh test      — Vitest (frontend) + dotnet test (backend) + pokrytí scénářů
#   ./build/build.sh scenarios — jen kontrola pokrytí Gherkin scénářů testy
#   ./build/build.sh protocol  — jen kontrola shody wire protokolu server ↔ klient
#   ./build/build.sh api       — jen kontrola shody REST cest server ↔ klient
#   ./build/build.sh hub       — jen kontrola volání hub metod (počty argumentů)
#   ./build/build.sh migration <Název> — vygeneruje novou EF migraci (ADR-013)
#   ./build/build.sh publish   — self-contained publish pro Windows VM (win-x64) + deploy skript
#   ./build/build.sh clean     — smaže dist/, wwwroot/ a build volumes
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pinujeme major verzi (patch se aktualizuje sám). Obojí je aktuální LTS:
#   Node 24 (Active LTS; Node 26 se stane LTS v říjnu 2026)
#   .NET 10 (LTS)
NODE_IMAGE="docker.io/library/node:24-bookworm-slim"
DOTNET_IMAGE="mcr.microsoft.com/dotnet/sdk:10.0"

# Named volumes — dependencies žijí mimo repo, nekolidují s lokálním node_modules
NODE_MODULES_VOL="msprojectmanager-node-modules"
NUGET_VOL="msprojectmanager-nuget"

# Bezpečné SELinux relabelování (Fedora/RHEL); jinde je :Z no-op
MOUNT_OPT="Z"

# Repo se do kontejneru montuje vždy na /repo; klient i server jsou pod src/.
CLIENT_DIR="src/client"
SERVER_DIR="src/server"
SERVER_PROJ="$SERVER_DIR/MSProjectManager.Server"
SERVER_SLN="MSProjectManager.slnx"          # relativně k $SERVER_DIR (tam běží dotnet)
DIST="$ROOT/$CLIENT_DIR/dist"
WWWROOT="$ROOT/$SERVER_PROJ/wwwroot"
PUBLISH_DIR="$ROOT/publish"

# Node běží z kořene klientského balíčku, .NET z kořene solution — tam leží
# package.json/biome.json resp. slnx/Directory.Build.props/.config.
node_run() {
  podman run --rm \
    -v "$ROOT:/repo:$MOUNT_OPT" \
    -v "$NODE_MODULES_VOL:/repo/$CLIENT_DIR/node_modules" \
    -w "/repo/$CLIENT_DIR" \
    "$NODE_IMAGE" sh -c "$1"
}

dotnet_run() {
  podman run --rm \
    -v "$ROOT:/repo:$MOUNT_OPT" \
    -v "$NUGET_VOL:/root/.nuget/packages" \
    -w "/repo/$SERVER_DIR" \
    "$DOTNET_IMAGE" sh -c "$1"
}

# Gate skripty jsou čisté Node bez závislostí — běží z kořene repa.
repo_node_run() {
  podman run --rm \
    -v "$ROOT:/repo:$MOUNT_OPT" \
    -w /repo \
    "$NODE_IMAGE" sh -c "$1"
}

info()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[33m! %s\033[0m\n' "$*"; }
die()   { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

require_podman() {
  command -v podman >/dev/null 2>&1 || die "podman není nainstalován"
}

# ── Frontend ────────────────────────────────────────────────────────────────

build_web() {
  info "Build frontendu ($NODE_IMAGE)"

  node_run 'npm ci --no-audit --no-fund && npm run build'

  ok "Frontend zbuildován → $CLIENT_DIR/dist/"
  copy_to_wwwroot
}

copy_to_wwwroot() {
  [ -d "$DIST" ] || die "$CLIENT_DIR/dist/ neexistuje — build frontendu neproběhl"

  if [ ! -d "$ROOT/$SERVER_PROJ" ]; then
    warn "Server projekt ($SERVER_PROJ) zatím neexistuje — kopie do wwwroot přeskočena."
    warn "Build output zůstává v $CLIENT_DIR/dist/."
    return 0
  fi

  # wwwroot je vlastněný buildem — čistíme jen pokud tak skutečně vypadá,
  # ať omylem nesmažeme ručně přidané statické soubory.
  if [ -d "$WWWROOT" ]; then
    if [ -f "$WWWROOT/index.html" ] || [ -d "$WWWROOT/assets" ]; then
      info "Čistím předchozí build output ve wwwroot"
      rm -rf "${WWWROOT:?}/index.html" "${WWWROOT:?}/assets"
    else
      warn "wwwroot obsahuje neznámý obsah — nemažu, jen překopírovávám přes."
    fi
  fi

  mkdir -p "$WWWROOT"
  cp -r "$DIST/." "$WWWROOT/"
  ok "Zkopírováno do $SERVER_PROJ/wwwroot/"
}

# ── Backend ─────────────────────────────────────────────────────────────────

build_server() {
  [ -d "$ROOT/$SERVER_PROJ" ] || die "Server projekt ($SERVER_PROJ) neexistuje"

  info "Build backendu ($DOTNET_IMAGE)"

  dotnet_run "dotnet build MSProjectManager.Server -c Release"

  ok "Backend zbuildován"
}

# ── Migrace ─────────────────────────────────────────────────────────────────

# Vygeneruje novou EF migraci. Scaffolding běží nad C# projektem
# MSProjectManager.Migrations, model se čte z F# AppDbContextu (ADR-013).
#
# Postup při změně schématu:
#   1. upravit entitu a mapování v MSProjectManager.Persistence
#   2. ./build/build.sh migration <NázevMigrace>
#   3. zkontrolovat vygenerované SQL a spustit ./build/build.sh test
migration() {
  local name="${1:-}"
  [ -n "$name" ] || die "Použití: ./build/build.sh migration <NázevMigrace>"

  info "Generuji migraci $name"

  dotnet_run "dotnet tool restore >/dev/null 2>&1 &&
              dotnet dotnet-ef migrations add '$name' --configuration Release \
                --project MSProjectManager.Migrations \
                --startup-project MSProjectManager.Server"

  ok "Migrace vygenerována → $SERVER_DIR/MSProjectManager.Migrations/Migrations/"
}

# ── Lint ────────────────────────────────────────────────────────────────────

lint_web() {
  info "Lint frontendu (Biome)"
  # --max-diagnostics=none je podstatné: bez něj Biome vypíše jen prvních 20
  # nálezů a zbytek zamlčí, takže gate tiše podhlásí stav (viz PRD-07).
  node_run 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npx biome lint --max-diagnostics=none .'
}

lint_server() {
  if [ ! -d "$ROOT/$SERVER_DIR" ]; then
    warn "Server zatím neexistuje — FSharpLint přeskočen"
    return 0
  fi
  info "Lint backendu (FSharpLint)"
  # MSProjectManager.Migrations je C# a celý generovaný — nelintuje se.
  dotnet_run 'dotnet tool restore >/dev/null 2>&1 &&
              dotnet fsharplint lint --lint-config fsharplint.json MSProjectManager.Persistence/MSProjectManager.Persistence.fsproj &&
              dotnet fsharplint lint --lint-config fsharplint.json MSProjectManager.Server/MSProjectManager.Server.fsproj'
}

lint() {
  local rc=0
  lint_web || rc=1
  lint_server || rc=1
  [ $rc -eq 0 ] && ok "Lint prošel" || warn "Lint našel problémy"
  return $rc
}

# ── Format ──────────────────────────────────────────────────────────────────

format() {
  info "Formátuji frontend (Biome)"
  node_run 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npx biome format --write .'

  if [ -d "$ROOT/$SERVER_DIR" ]; then
    info "Formátuji backend (Fantomas)"
    dotnet_run 'dotnet tool restore >/dev/null 2>&1 && dotnet fantomas .'
  else
    warn "Server zatím neexistuje — Fantomas přeskočen"
  fi

  ok "Zformátováno"
}

# ── Testy ───────────────────────────────────────────────────────────────────

test_web() {
  info "Testy frontendu (Vitest)"
  node_run 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npm run test:run'
}

test_server() {
  if [ ! -d "$ROOT/$SERVER_DIR" ]; then
    warn "Server zatím neexistuje — dotnet test přeskočen"
    return 0
  fi
  info "Testy backendu (dotnet test)"
  # Build zvlášť: implicitní build uvnitř `dotnet test` se na mountu umí zaseknout.
  dotnet_run "dotnet build $SERVER_SLN -c Release && dotnet test $SERVER_SLN -c Release --no-build"
}

# Ověří, že každý scénář v docs/features má vazbu na test (značka @scenario).
scenario_coverage() {
  repo_node_run 'node build/scenario-coverage.mjs'
}

# Ověří, že wire protokol serveru (F# DU) a klienta (protocol.ts) souhlasí.
# Rozejití se jinak neprojeví ani chybou překladu, ani spadlým testem —
# klient tiše zahodí diff, kterému nerozumí (viz ADR-004, „Negativní").
protocol_contract() {
  repo_node_run 'node build/protocol-contract.mjs'
}

# Ověří, že REST cesty volané klientem server skutečně mapuje.
# Vzniklo z chyby, kterou žádný unit test chytit nemohl: klient volal
# /projects, server mapoval /api/projects, obě strany měly zelené testy
# s tou druhou zamockovanou — a landing page nefungovala vůbec.
api_contract() {
  repo_node_run 'node build/api-contract.mjs'
}

# Ověří, že klient volá hub metody se správným počtem argumentů.
# Vzniklo z chyby, která shodila veškerou editaci: hub má
# SendCommand(projectId, command), klient posílal jen command a SignalR to
# odmítal jako InvalidDataException. Testy byly zelené, protože .NET
# testovací klient posílá oba argumenty.
hub_contract() {
  repo_node_run 'node build/hub-contract.mjs'
}

# Tagy zpráv hlídá protocol_contract, ale tvar entity uvnitř nehlídalo nic:
# F# Person.UserId bylo povinné, TS userId volitelné a klient ho neposílal —
# add_person tím pádem neprošel vazbou argumentů a osobu nešlo přidat vůbec.
entity_contract() {
  repo_node_run 'node build/entity-contract.mjs'
}

run_tests() {
  local rc=0
  protocol_contract || rc=1
  api_contract || rc=1
  hub_contract || rc=1
  entity_contract || rc=1
  test_web || rc=1
  test_server || rc=1
  scenario_coverage || rc=1
  [ $rc -eq 0 ] && ok "Testy prošly" || die "Testy selhaly"
  return $rc
}

# ── Publish pro Windows VM ──────────────────────────────────────────────────

publish() {
  [ -d "$ROOT/$SERVER_PROJ" ] || die "Server projekt ($SERVER_PROJ) neexistuje"

  build_web

  # Self-contained: na cílovém serveru nemusí být nainstalovaný .NET runtime.
  # Cena je ~70 MB navíc ve složce a nutnost přenasadit kvůli bezpečnostním
  # záplatám runtime (framework-dependent by je dostal z Windows Update).
  # U interního nástroje na jedné VM je jednodušší nasazení víc než ta úspora;
  # `PUBLISH_SELF_CONTAINED=false ./build/build.sh publish` to obrátí.
  local self_contained="${PUBLISH_SELF_CONTAINED:-true}"

  info "Publish pro win-x64 (self-contained=$self_contained)"

  dotnet_run "dotnet publish MSProjectManager.Server \
      -c Release -r win-x64 --self-contained $self_contained -o /repo/publish"

  cp "$ROOT/deploy/Install-MSProjectManager.ps1" "$PUBLISH_DIR/" 2>/dev/null || true
  cp "$ROOT/deploy/README-nasazeni.md" "$PUBLISH_DIR/" 2>/dev/null || true

  ok "Publish hotov → publish/"
  info "Zkopírovat publish/ na server a spustit (jako správce):"
  info "  powershell -ExecutionPolicy Bypass -File .\\Install-MSProjectManager.ps1 -Hostname plánovač.firma.cz"
}

# ── Clean ───────────────────────────────────────────────────────────────────

clean() {
  info "Mažu build artefakty"
  rm -rf "$DIST" "$PUBLISH_DIR"
  [ -d "$WWWROOT" ] && rm -rf "${WWWROOT:?}/index.html" "${WWWROOT:?}/assets"
  podman volume rm -f "$NODE_MODULES_VOL" "$NUGET_VOL" 2>/dev/null || true
  ok "Vyčištěno"
}

# ── Entrypoint ──────────────────────────────────────────────────────────────

require_podman

case "${1:-all}" in
  web)     build_web ;;
  server)  build_server ;;
  all)     build_web; build_server ;;
  lint)    lint ;;
  format)  format ;;
  test)      run_tests ;;
  protocol)  protocol_contract ;;
  api)       api_contract ;;
  hub)       hub_contract ;;
  entity)    entity_contract ;;
  scenarios) scenario_coverage ;;
  publish)   publish ;;
  migration) migration "${2:-}" ;;
  clean)     clean ;;
  *)         die "Neznámý příkaz: $1 (web|server|all|lint|format|test|scenarios|protocol|api|hub|entity|migration|publish|clean)" ;;
esac
