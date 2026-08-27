#!/usr/bin/env bash
#
# Naplní běžící instanci demo daty — volá `build/demo.sh --seed`.
#
# Vlastní práci dělá `demo-seed.mjs` v Node kontejneru: účty a projekty jde
# založit `curl`em, ale obsah projektů chodí přes SignalR (ADR-004), takže seed
# potřebuje skutečného hub klienta. `@microsoft/signalr` je závislost klienta,
# proto se připojuje jeho `node_modules` volume — a to **vedle skriptu**
# (`/repo/build/node_modules`), protože ESM hledá balíčky podle umístění
# souboru, ne podle pracovního adresáře.
#
# Kontejner běží v síti hostitele: seed volá `127.0.0.1:PORT`, kde publikuje
# port `demo.sh`.
#
# Montuje se **jen `build/`**, ne celé repo. `:Z` totiž složku přeznačkuje pro
# SELinux a běžící server by na svoje data v `.demo/` ztratil přístup —
# projevilo se to jako `SQLite Error 15: 'locking protocol'` a rozbitá databáze
# uprostřed seedu. Je to stejná past, jakou u `build.sh web` popisuje CLAUDE.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8080}"
HOST="${2:-127.0.0.1}"
NODE_IMAGE="docker.io/library/node:24-bookworm-slim"
NODE_MODULES_VOL="msprojectmanager-node-modules"

echo "▸ Zakládám demo data"

podman run --rm --network host \
  -v "$ROOT/build:/seed:Z" \
  -v "$NODE_MODULES_VOL:/seed/node_modules" \
  -w /seed \
  -e "SEED_BASE=http://$HOST:$PORT" \
  "$NODE_IMAGE" node /seed/demo-seed.mjs

echo "✓ Demo data připravena"
