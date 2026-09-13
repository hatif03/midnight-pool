#!/usr/bin/env bash
# Verify a deployed Midnight Pool contract against a PUBLIC Midnight network.
#
# Nothing here trusts this repository: every call goes to the public indexer and node. Run it
# yourself, or hand it to someone who has never seen this code.
#
#   bash scripts/verify-deployment.sh [CONTRACT_ADDRESS] [NETWORK]
#
# With no arguments it reads contracts/preprod/deployed.json, which the deploy script writes.
set -uo pipefail

NETWORK="${2:-preview}"
ADDR="${1:-}"

if [ -z "$ADDR" ] && [ -f contracts/preprod/deployed.json ]; then
  ADDR=$(python -c "import json;print(json.load(open('contracts/preprod/deployed.json'))['contractAddress'])" 2>/dev/null || true)
  NETWORK=$(python -c "import json;print(json.load(open('contracts/preprod/deployed.json'))['network'])" 2>/dev/null || echo "$NETWORK")
fi

INDEXER="https://indexer.${NETWORK}.midnight.network/api/v4/graphql"
RPC="https://rpc.${NETWORK}.midnight.network"

echo "network : $NETWORK"
echo "indexer : $INDEXER"
echo "contract: ${ADDR:-<none supplied>}"
echo

echo "1. The chain is the one you think it is, and is live"
echo -n "   system_chain : "
curl -s --max-time 20 -H 'content-type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"system_chain","params":[]}' "$RPC" \
  | python -c "import sys,json;print(json.load(sys.stdin).get('result','?'))" 2>/dev/null || echo "unreachable"

echo -n "   block height : "
curl -s --max-time 20 -X POST "$INDEXER" -H 'content-type: application/json' \
  -d '{"query":"{ block { height } }"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['data']['block']['height'])" 2>/dev/null || echo "unreachable"
echo

if [ -z "$ADDR" ]; then
  echo "No contract address supplied and no deployed.json found — stopping after the liveness checks."
  exit 0
fi

echo "2. The contract exists on that chain"
RESP=$(curl -s --max-time 30 -X POST "$INDEXER" -H 'content-type: application/json' \
  -d "{\"query\":\"query(\$a:HexEncoded!){ contractAction(address:\$a){ __typename address state } }\",\"variables\":{\"a\":\"$ADDR\"}}")

python - "$RESP" <<'PY' 2>/dev/null || echo "   could not parse indexer response: $RESP"
import sys, json
d = json.loads(sys.argv[1])
if d.get("errors"):
    print("   indexer error:", d["errors"][0].get("message"))
    raise SystemExit(1)
a = (d.get("data") or {}).get("contractAction")
if not a:
    print("   NOT FOUND — no contract at that address on this network")
    raise SystemExit(1)
print("   typename :", a.get("__typename"))
print("   address  :", a.get("address"))
st = a.get("state") or ""
print("   state    :", f"{len(st)} hex chars of on-chain ledger state")
print()
print("   What that state contains, by construction (docs/HUSTLE_PROTOCOL.md):")
print("     commitment hashes, nullifiers and booleans — NOT levels, win counts or cue tiers.")
print("     That absence is the privacy claim, and you can confirm it by reading the bytes.")
PY
