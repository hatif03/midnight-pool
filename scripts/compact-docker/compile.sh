#!/usr/bin/env bash
# Reproducible contract build. Run from the repo root:
#   bash scripts/compact-docker/compile.sh
#
# Pins compiler 0.31.1 deliberately -- it is the only compiler whose runtime (0.16.0) and ledger
# (8.0.2) the released midnight-js 4.1.1 can deploy. See docs/adr/0016.
set -euo pipefail

COMPILER="${COMPACT_VERSION:-0.31.1}"
IMAGE="${IMAGE:-midnight-compact:local}"

docker build -t "$IMAGE" "$(dirname "$0")"

MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/work" -w /work/contracts "$IMAGE" bash -lc "
  compact update $COMPILER >/dev/null 2>&1
  echo \"compiler: \$(compact compile --version 2>&1 | tail -1)\"
  echo \"runtime : \$(compact compile -- --runtime-version 2>&1 | tail -1)\"
  echo \"ledger  : \$(compact compile -- --ledger-version 2>&1 | tail -1)\"
  for c in midnight-pool stakes; do
    echo \"=== \$c ===\"
    compact compile \$c.compact managed/\$c
  done
"

# Republish the ZK artifacts the browser fetches for in-browser proving.
mkdir -p public/midnight/keys public/midnight/zkir
cp contracts/managed/midnight-pool/keys/*.prover  public/midnight/keys/
cp contracts/managed/midnight-pool/keys/*.verifier public/midnight/keys/
cp contracts/managed/midnight-pool/zkir/*.bzkir    public/midnight/zkir/
echo "published $(ls public/midnight/keys | wc -l) key files to public/midnight/"
