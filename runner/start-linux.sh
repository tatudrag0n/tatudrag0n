#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
read -rp "Pairing room: " ROOM
read -rsp "Pairing secret: " SECRET; echo
read -erp "Workspace folder: " WORKSPACE
exec node index.mjs --room="$ROOM" --secret="$SECRET" --workspace="$WORKSPACE"
