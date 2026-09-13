# Deploying Midnight Pool to a public Midnight testnet

This is the whole path from a clean checkout to a contract anyone can query on a public Midnight
network. It has **one manual step** — the faucet — and that step is manual because the faucet is
protected by a CAPTCHA, not because the rest is unfinished.

---

## Deployed contract

| | |
|---|---|
| Network | **Preview** (`preview`) — Midnight's public testnet |
| Contract address | _(filled in after deploy — also shown in the app under Settings → Midnight)_ |
| Indexer | `https://indexer.preview.midnight.network/api/v4/graphql` |
| Node RPC | `https://rpc.preview.midnight.network` |
| Compiler | `0.31.1` (language 0.23.0, runtime 0.16.0, ledger-8.0.2) |
| SDK | `midnight-js` 4.1.1 |

Two public networks answer, and they are not interchangeable:

| Network | Purpose | Height (2026-09-13) |
|---|---|---|
| **`preview`** | public testnet for integration testing — **the default** | ~847,000 |
| `preprod` | pre-production chain | ~2,531,000 |

`testnet` and `testnet-02` do not resolve at all. Switch networks with
`localStorage.setItem('mn-network', 'preprod')` if you need the other one; the app otherwise asks the
wallet for `preview`. See [ADR-0016](adr/0016-one-released-midnight-stack.md).

---

## 1. Build the contracts (reproducible)

The Compact CLI is Linux/macOS only, so the build runs in Docker. This works identically on Windows,
where `compact` on PATH is the NTFS compression tool and WSL may be unavailable.

```bash
bash scripts/compact-docker/compile.sh
```

That prints the compiler's own version report — check it says `runtime : 0.16.0`, because that is
what `midnight-js-protocol@4.1.1` pins and the reason 0.31.1 is the compiler and not a newer one —
then compiles both contracts and republishes the browser's ZK artifacts into `public/midnight/`.

Verify the artifacts landed where the browser will look for them:

```bash
ls public/midnight/keys   # *.prover (2.7-5.0 MB each) and *.verifier
ls public/midnight/zkir   # *.bzkir
```

## 2. Run a proof server

Only whoever **deploys or calls** a circuit needs this. Verifying a deployed contract is a plain
indexer read and needs nothing.

```bash
docker run -d --rm -p 6300:6300 --name midnight-proof-server \
  midnightntwrk/proof-server:latest
curl -s http://localhost:6300/health   # or just check the container is up
```

The app uses the wallet's own prover URI when the wallet supplies one. `Configuration.proverServerUri`
is deprecated and documented as "likely to not be present", so in practice this local server is what
gets used; override it with `localStorage.setItem('mn-prover-uri', '...')` if yours runs elsewhere.

## 3. Install and fund a wallet

1. Install the **Lace** wallet extension and switch it to the **Preview** network.
2. Copy its **unshielded address** (`mn_addr_preview1...`).
3. Go to **https://faucet.preview.midnight.network/** and request tokens for that address.
   *This is the manual step: the faucet is behind a Cloudflare Turnstile CAPTCHA, so it cannot be
   scripted.*
4. In Lace, **delegate NIGHT** so DUST begins to accrue. DUST pays transaction fees; without it a
   deploy will fail for insufficient fees rather than for anything wrong with the contract.
5. Wait for DUST to appear in Lace.

## 4. Deploy from the app

```bash
npm run build && npm run preview
```

Open the app → **Settings** (gear) → **Midnight**:

1. **Connect Wallet** — approve the Lace prompt. The panel below it appears, showing the network
   the wallet reports.
2. **Deploy new** — approve the transaction. The contract address appears when it confirms.

The address is stored locally and shown in the input box. Share it with anyone who wants to verify,
or paste someone else's address and press **Use this contract** to point the app at theirs.

From then on, `commitStats`, `proveThreshold` and `claimCue` submit to that contract. Every call is
recorded in **The Rail** (Settings → View On-Chain Activity) with its transaction id.

---

## 5. Verify it — without trusting this repo

Anyone can run these. Substitute the contract address.

**The contract exists and has state:**

```bash
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($a:HexEncoded!){ contractAction(address:$a){ __typename address state } }",
       "variables":{"a":"<CONTRACT_ADDRESS>"}}'
```

**The chain is the one you think it is, and is live:**

```bash
curl -s -H 'content-type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"system_chain","params":[]}' \
  https://rpc.preview.midnight.network
# -> {"jsonrpc":"2.0","id":1,"result":"Midnight Preview"}

curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'content-type: application/json' -d '{"query":"{ block { height } }"}'
```

What you will **not** find is a block explorer: Midnight does not have a public one for Preprod yet,
so a direct indexer query is the honest verification ceiling. That is the same standard
[ADR-0013](adr/0013-real-local-devnet-deploy.md) set for the local deploy, held to for the public one.

What you can read from the contract state is exactly what the protocol claims is public: commitment
hashes, nullifiers and booleans. Levels, win counts and cue tiers are not in there — that is the
point. See [HUSTLE_PROTOCOL.md](HUSTLE_PROTOCOL.md).

---

## Deploying from Node: blocked on preprod, unproven on preview

`contracts/preprod/` contains a complete Node deploy path. Whether it can reach a public network
depends on which one, and the difference is worth stating precisely because it is the difference
between "needs a browser wallet" and "does not".

**preprod — blocked.** `WalletFacade` leaks while syncing. Measured 2026-09-13: heap 96 MB ->
4,954 MB while `appliedIndex` went 0 -> 71,293 in 249s, then
`FATAL ERROR: Ineffective mark-compacts near heap limit` at a 6 GB cap. About **264 KB per processed
entry**, on a brand-new empty wallet.

**preview — bounded, but not proven to finish.** Same code, same versions, only `NETWORK` changed.
Heap peaked at **1,733 MB and then declined** while the index kept climbing — GC reclaims, so the
leak does not manifest. But a 15-minute run reached only `appliedIndex` 25,906 at ~29 entries/s and
had **not** completed:

```
RESULT: TIMEOUT  elapsed=901s  peakHeapMB=1733  lastAppliedIndex=25906
```

So: preview does not crash, and it may well complete given long enough — but "it does not OOM" is not
the same claim as "it syncs", and only the first has been demonstrated. `highestIndex` is reported as
`0` throughout (part of the same upstream bug), so the wallet cannot say how far it has left to go,
which is precisely why this cannot be settled by reasoning and has to be measured.

Re-run it yourself:

```bash
cd contracts/preprod && NETWORK=preview BUDGET_MS=3600000 npm run probe
```

That chain-dependent difference is reported upstream on
[midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704);
`sync-probe.ts` is the harness.

**Why the browser path exists regardless.** A wallet extension does its own syncing and the page
never constructs a `WalletFacade`, so the browser route is unaffected by any of this. It is the
supported path today and the one this guide documents; the Node path is a convenience that may open
up on preview.
