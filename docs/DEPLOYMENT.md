# Deploying Midnight Pool

This is the whole path from a clean checkout to a contract anyone can query on a public Midnight
network, plus what the two cloud hosts (Vercel and GCP) actually run. It has **one manual step** —
the faucet — and that step is manual because the faucet is protected by a CAPTCHA, not because the
rest is unfinished.

---

## Who can do what

**Not every player can put every action on Midnight.** Gameplay never requires a wallet; on-chain
submission does, and today that wallet is a **desktop browser extension**.

| What | Who can do it | On Midnight? |
|---|---|---|
| Solo, invite-a-friend, Quick Match, progression, PWA install | Anyone, any device, no wallet | No — the game is peer-to-peer / local |
| Continue (Face ID) — same table on phone and desktop | Browsers with platform passkeys (PRF). Recovery QR otherwise | Identity only — not a tx |
| The Hall (indexer + explorers) | Anyone, any device, **no wallet** | **Read** — public Preview contract |
| Scorecard (`commitStats`), Blind Rank (`proveThreshold`), Cue Case (`claimCue`) | **Desktop Chrome or Brave** + **Lace** on **Preview** + tNIGHT + **generated tDUST** (after Continue so the right secret is stamped) | **Yes** — shared Preview contract, independently verifiable |
| Break order | Every multiplayer match (P2P). On-chain Rack is fire-and-forget if a wallet is connected | P2P decides the rack; Compact may lag or stay incomplete |
| Match stakes (`stakes.compact`) | Not on the live path | Implemented and tested, **not deployed** to Preview, not wired in the browser |
| Champion Badge (EVM mint) | Local `anvil` + simulator or local Midnight devnet | Not on Preview |
| On-chain from iOS Safari / typical Android Chrome | Nobody, until 1AM in-wallet browser (Wave 2) or a house paymaster | No Lace extension there; the game still plays; The Hall still verifies |

A missing wallet, a rejected prompt, or a proof-server timeout **never blocks a shot**. Real mode
falls through to the local mock relation and writes a row in The Rail. That is intentional
([ADR-0018](adr/0018-real-browser-submission.md)).

**What is verifiable on Midnight today** is those three circuits on the shared contract
(commitment hashes, nullifiers, and booleans), plus any break-order txs that actually landed.
Anyone can check them in **The Hall**, on the indexer, or on the explorers without trusting this
repo (commands below). Levels, win counts, cue tiers, and the live break flip are *not* sitting in
ledger state as plaintext — that is the point of the protocol, not a gap.

The frontend also exposes `POST /api/ledger` (indexer CORS proxy) and `GET/PUT /api/table`
(opaque AES-GCM blobs for Continue). Table storage uses Vercel KV when `KV_REST_API_*` is set;
otherwise an in-memory Map per instance. `npm run e2e` probes both.

---

## Live services

| | |
|---|---|
| Network | **Preview** (`preview`) — Midnight's public testnet |
| App (Vercel) | [https://midnight-pool-one.vercel.app/](https://midnight-pool-one.vercel.app/) |
| Contract address | `749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3` |
| Deploy tx | `005735ee6432f3f9178d402bff0c651c8850401831a170693371e3721226fd2364` (block 866570) |
| `commitStats` tx | `00b32911d7c538482796d178aa0323db085aa1dc6c287a25a1871850e981191153` (block 866574) |
| `proveThreshold(5, false)` tx | `005d98a2de6ff4ba0dbd15c5ba20006e407cad9234e82167cc165027b72bd88f4f` (block 866579, disclosed `true`) |
| Indexer | `https://indexer.preview.midnight.network/api/v4/graphql` |
| Node RPC | `https://rpc.preview.midnight.network` |
| Proof server (players) | `https://midnight-pool-prover-147606977567.us-central1.run.app` (Cloud Run, CORS-open — [ADR-0019](adr/0019-cloud-run-proof-server.md)) |
| Matchmaking relay | `wss://midnight-pool-relay-147606977567.us-central1.run.app` |
| Explorers | [preview.midnightexplorer.com](https://preview.midnightexplorer.com/), [midnight-preview.subscan.io](https://midnight-preview.subscan.io/) |
| Compiler | `0.31.1` (language 0.23.0, runtime 0.16.0, ledger-8.0.2) |
| SDK | `midnight-js` 4.1.1 |

The app bakes the contract address and prover URL as defaults (`VITE_MN_CONTRACT_ADDRESS` /
`VITE_MN_PROVER_URI`, with the same values hardcoded in `src/midnight/chain.js` so a missing env
file cannot silently drop players onto localhost). Anyone who connects a Preview Lace wallet talks
to the same contract. Paste a different address in Settings to point at your own.

Two public networks answer, and they are not interchangeable:

| Network | Purpose | Height (2026-09-13) |
|---|---|---|
| **`preview`** | public testnet for integration testing — **the default** | ~847,000 |
| `preprod` | pre-production chain | ~2,531,000 |

`testnet` and `testnet-02` do not resolve at all. Switch networks with
`localStorage.setItem('mn-network', 'preprod')` if you need the other one; the app otherwise asks the
wallet for `preview`. See [ADR-0016](adr/0016-one-released-midnight-stack.md).

---

## Vercel vs GCP — what each host can and cannot do

The frontend is a **static Vite PWA** plus short Node functions (`api/og.js`, `api/invite.js`,
`api/ledger.js`, `api/table.js`). That is a good fit for Vercel. These are not:

| Need | Why Vercel is the wrong place | Where it lives |
|---|---|---|
| Midnight proof server | Long-lived Docker process, ~4 GiB RAM, proves that can take minutes. Not a serverless handler. Midnight's public `lace-proof-pub` host 404s from browsers (no CORS) | Cloud Run `midnight-pool-prover` ([ADR-0019](adr/0019-cloud-run-proof-server.md)) |
| Matchmaking WebSocket | In-memory single-process queue (must be `--max-instances=1`) and connections that last a whole match (Cloud Run `--timeout=3600`). Vercel Functions are request-scoped; even with newer WS support they are the wrong durability/sticky-state model | Cloud Run `midnight-pool-relay` ([ADR-0004](adr/0004-matchmaking-relay.md)) |
| `VITE_*` config | Inlined at **build** time. A dashboard env change does nothing until the next production build. `.env.production` is committed on purpose (public URLs only) and the same values are baked into `chain.js` / `net.js` | Repo + Vercel build |

Limits that **do not** bite this app:

- Static assets + PWA service worker on the CDN — fine. ZK keys (`public/midnight/`, 2.7–5 MB each)
  are fetched on demand and **not** precached, so an install does not pay 28 MB
  ([ADR-0012](adr/0012-commit-compiled-contract-for-browser-build.md), `vite.config.js`).
- `api/og.js` / `api/invite.js` are short Node functions, not Edge (see ADR-0005's original Edge
  intent; the shipped files are Node). Share-preview HTML is well inside duration/payload limits.
- No server-side Midnight SDK on Vercel, so there is no `WalletFacade` OOM, no WASM heap, and no
  proof-server binary to run there.

Trust note: proof inputs go to **our** Cloud Run prover at prove-time (same pattern as Midnight's
own leaderboard tutorial hosting a prover on Railway). The chain still only stores commitments,
nullifiers and booleans. A wallet-side prover would be more private; `getProvingProvider` is not
wired because `proveTx` takes ledger WASM objects that cannot cross the worker boundary
([ADR-0018](adr/0018-real-browser-submission.md)).

Redeploy:

```bash
# Frontend (from repo root, after committing .env.production). Team: Midnight Pool.
vercel --prod --scope team_1Jem7eBa13lSblQuFiYEZCaE

# Matchmaking relay — --max-instances=1 and --timeout=3600 are correctness, not cost knobs.
gcloud run deploy midnight-pool-relay --source server --region us-central1 \
  --project=project-f0b6b4ce-541f-43ff-9f7 --allow-unauthenticated \
  --max-instances=1 --timeout=3600

# Proof server — image already uses $PORT, so Cloud Run's PORT injection is enough.
gcloud run deploy midnight-pool-prover --image=midnightntwrk/proof-server:8.0.3 \
  --region=us-central1 --project=project-f0b6b4ce-541f-43ff-9f7 \
  --memory=4Gi --cpu=2 --timeout=3600 --concurrency=1 --max-instances=3 \
  --min-instances=0 --allow-unauthenticated --cpu-boost --port=8080
```

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

## 2. Run a proof server (local development)

Production players use the Cloud Run prover above. Local `npm run dev` talks to Docker on `:6300`.

```bash
docker run -d --rm -p 6300:6300 --name midnight-proof-server \
  midnightntwrk/proof-server:8.0.3
```

Override with `localStorage.setItem('mn-prover-uri', '...')` if yours runs elsewhere. Do **not**
point production at `https://lace-proof-pub.preview.midnight.network` — it 404s from the browser.

## 3. Install and fund a wallet

1. Install the **Lace** wallet extension (Chrome/Brave) and switch it to the **Preview** network.
2. Copy its **unshielded address** (`mn_addr_preview1...`).
3. Go to **https://faucet.preview.midnight.network/** and request tokens for that address.
   *This is the manual step: the faucet is behind a Cloudflare Turnstile CAPTCHA, so it cannot be
   scripted.*
4. In Lace, **Generate tDUST** (and/or delegate NIGHT so DUST accrues). Fees are DUST, not tNIGHT;
   without it a submit fails for insufficient fees rather than for anything wrong with the contract.
5. Wait for DUST to appear in Lace.

Do **not** click **Deploy new** in the app. The shared contract is already baked. **Use this
contract** is only if you want to point at a different address.

## 4. Play against the shared contract

```bash
npm run build && npm run preview
```

Or open the live app. Then **Settings** (gear) → **Midnight**:

1. **Continue** (Face ID) if you want this table on another device, then **Connect Wallet** — Lace on **Preview**. Approve the prompt. The baked contract address is
   already in the input. Do **not** click **Deploy new** unless you really want a private copy.
2. Confirm tDUST is non-zero.
3. Play. `commitStats`, `proveThreshold` and `claimCue` submit to the shared contract. Every call
   lands in **The Rail** (Settings → View On-Chain Activity) with its transaction id.

---

## 5. Verify it — without trusting this repo

Anyone can run these. Substitute the contract address. The same checks plus a Chrome pass of the
lobby, The Hall, Settings, and a solo table are `npm run e2e` (writes [`E2E.md`](E2E.md)). That
script does not click Lace or Face ID.

**The contract exists and has state:**

```bash
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($a:HexEncoded!){ contractAction(address:$a){ __typename address } }",
       "variables":{"a":"749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3"}}'
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

**The production prover answers CORS from the live origin:**

```bash
curl -sI -X OPTIONS https://midnight-pool-prover-147606977567.us-central1.run.app/prove \
  -H "Origin: https://midnight-pool-one.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
# -> access-control-allow-origin: https://midnight-pool-one.vercel.app
```

Explorers exist for Preview ([midnightexplorer](https://preview.midnightexplorer.com/),
[Subscan](https://midnight-preview.subscan.io/)). A direct indexer query is still the check that
does not depend on an explorer's indexing delay.

What you can read from the contract state is exactly what the protocol claims is public: commitment
hashes, nullifiers and booleans. Levels, win counts and cue tiers are not in there — that is the
point. See [HUSTLE_PROTOCOL.md](HUSTLE_PROTOCOL.md).

---

## Deploying from Node: works on preview, still blocked on preprod

`contracts/preprod/` is the Node deploy path that landed the address above.

**preview — done, 2026-09-14.** With `batchUpdates: { size: 5000, timeout: 1, spacing: 4 }` (default
size is 10; that is the #704 / #425 WASM trap), a funded Preview wallet synced in ~11 minutes at a
heap of **86–211 MB**, then deployed, called `commitStats`, and called `proveThreshold(5, false)`
which disclosed `true`. Independently confirmed: the public indexer returns this contract at that
address. Record: `contracts/preprod/deployed.json`.

Without the larger batch size, the same SDK on preview reached only `appliedIndex` 25,906 in 15
minutes at a 1.7 GB heap and never finished.

**preprod — still blocked.** `WalletFacade` leaks while syncing. Measured 2026-09-13: heap 96 MB ->
4,954 MB while `appliedIndex` went 0 -> 71,293 in 249s, then OOM at a 6 GB cap. Do not target
preprod until [midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704)
is fixed on a released line.

```bash
cd contracts/preprod && NETWORK=preview npm run deploy
```

Needs a local proof server (`docker run -d -p 6300:6300 midnightntwrk/proof-server:8.0.3`), a funded
seed in `preview-seed.hex` (gitignored), and DUST already accruing. Players do **not** run this —
they connect Lace to the baked address.

**Why the browser path still exists.** Other people never construct a `WalletFacade`. They connect
Lace, which already synced, and submit through the DApp Connector. Proofs go to the Cloud Run
prover so they also do not need Docker. The Node path is how *we* deploy the shared contract.
