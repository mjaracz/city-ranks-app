#!/bin/sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "Run this script on Linux." >&2
  exit 1
fi

repository_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec node "$repository_root/scripts/local-environment.mjs" start production
