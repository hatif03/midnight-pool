# Midnight Pool

[![Play now](https://img.shields.io/badge/play-live_demo-brightgreen?style=flat)](https://midnight-pool-one.vercel.app/)

![Gameplay screenshot](docs/screenshot.png)

**A pool hall on a privacy network.** Install it on a phone, shoot 8-ball with real physics against
friends or strangers, and prove you belong at a ranked table **without ever publishing your
stats.** The game is a hangout. Midnight is the lock on the back room.

Live app: [https://midnight-pool-one.vercel.app/](https://midnight-pool-one.vercel.app/)

Shared Midnight **Preview** contract (anyone can query — no wallet required):

`749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3`

---

## Contents

1. [What this is](#what-this-is)
2. [How to play](#how-to-play)
3. [What is in the product today](#what-is-in-the-product-today)
4. [Protocol innovation — the Hustle Protocol](#protocol-innovation--the-hustle-protocol)
5. [Identity: the passkey is the player](#identity-the-passkey-is-the-player)
6. [How it was built](#how-it-was-built)
7. [Architecture](#architecture)
8. [What anyone can verify](#what-anyone-can-verify)
9. [Who can do what](#who-can-do-what)
10. [Stack pins](#stack-pins)
11. [Project structure](#project-structure)
12. [Develop, test, deploy](#develop-test-deploy)
13. [Future plans](#future-plans)
14. [Honest limits](#honest-limits)
15. [Documentation index](#documentation-index)

---

## What this is

Midnight Pool is a **mobile-first progressive web app**: 2D eight-ball (PixiJS, a custom physics
engine, PeerJS peer-to-peer 1v1) plus a Midnight Network privacy layer we call the
**[Hustle Protocol](docs/HUSTLE_PROTOCOL.md)**.

The product idea is simple. In a real hall the hustler hides how good they are. Online pool inverted
that — ratings, records, and bankrolls sit in the open, and the only thing that stays hidden is the
cheating. We put it back the right way round: **hide the player, prove the play.** Your level, win
count, and cue collection live as commitments and nullifiers. Friends can learn that you cleared
Gold. They never see 60–20 / 75%.

It started as an existing browser pool game (the Integrate Midnight “before”). It is now a hangout
aimed at three Midnight tracks with **one** codebase:

| Track | What judges should see |
|---|---|
| **Mobile** | Installable PWA, touch-first landscape HUD, Face ID Continue, The Hall on a phone with **zero** wallet. Secrets stay in the browser; proofs for live submit go to our Cloud Run prover because Midnight’s public prover 404s from browsers. |
| **Integrate Midnight** | Before = p2p 8-ball. After = same game + Scorecard, Blind Rank, Cue Case, P2P Rack with optional on-chain record, The Rail, attestor receipts. |
| **Cross-chain** | A rank proven privately on Midnight can mint a Champion Badge on EVM with **no bridge**. The join runs against a local Midnight + Anvil today, not a public EVM testnet. |

**Current submission window:** [Midnight Buildathon on AKINDO](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG),
Wave 1 due **2026-09-16 15:00 UTC**. Three waves, $12.5k. The same product continues through Wave 2
(hangout: voice/chat, phone submit) and Wave 3 (optional wager, attestor). See
[`docs/WAVES.md`](docs/WAVES.md).

The earlier [MLH Midnight Hackathon (Aug 2026)](https://midnight-hackathon-august-2026.devpost.com/)
is how the repo was oriented; [`hackathon.md`](hackathon.md) is still the long-form writeup of that
architecture. AKINDO is the program we are shipping into now.

---

## How to play

The UI is **landscape-first**. On a phone in portrait you get a rotate overlay (iOS Safari cannot
lock orientation). Desktop is the second layout, not the first.

1. Open the [live app](https://midnight-pool-one.vercel.app/) or `npm run dev`.
2. **Play**
   - **Solo** — practice against the table.
   - **With a friend** — 4-letter room code, share link, or QR. Game traffic is WebRTC (PeerJS);
     nothing of the shot stream goes through our servers.
   - **Quick Match** — a Cloud Run WebSocket relay pairs two waiting players, then hands off to
     PeerJS. The relay never sees balls.
3. **Shoot** — drag from the cue ball and release (two-stage aim + power, [ADR-0017](docs/adr/0017-aim-guide-and-two-stage-input.md)).
   Better cues unlock a 3×3 English / spin grid.
4. **Continue** (Settings, Face ID / fingerprint) if you want the same table on phone and desktop.
   Then, on **desktop Chrome/Brave**, **Connect Wallet** (Lace on Preview + generated tDUST) to
   **stamp** that table on-chain. Do **not** click Deploy new.
5. Tap the **shield** for **The Hall** — public indexer + explorer links, no wallet.

Progression (coins, daily chest, Pool Pass, cues, leagues, loyalty shop) lives under the lobby
icons. Midnight controls live in Settings: Continue, wallet, ranked toggle, The Rail, Champion
Badge, recovery PIN/QR.

English and Spanish are first-class (`Settings → language`).

---

## What is in the product today

### Play (no chain required)

- Custom billiards: collisions, friction, pockets, spin/English.
- Standard 8-ball: open table until the first legal pot assigns solids/stripes, fouls, ball-in-hand,
  8-ball win/loss.
- Solo, invite-a-friend, Quick Match.
- Guest-side physics verification: the guest replays the host’s shot from the same snapshot and
  flags a mismatch ([ADR-0010](docs/adr/0010-guest-side-physics-verification.md)).
- PWA: `vite-plugin-pwa` manifest + service worker, generated icons, install banner (Android
  `beforeinstallprompt`; iOS “Add to Home Screen” copy). ZK keys are **not** precached.

### Progression (local, synced when you Continue)

- XP / levels, coins and cash, win/loss, win-rate, lifetime winnings.
- Daily login chest, Pool Pass, loot boxes, Loyalty Shop, cue collections.
- Five leagues — Brass → Bronze → Silver → Gold → Diamond — gated on level or wins, not win-rate
  (a win-rate gate would need `losses` in the compiled `commitStats` signature).

### Midnight layer (Preview, shared contract)

| Piece | Live? | What a stranger sees |
|---|---|---|
| **The Hall** | Yes, any device, no wallet | Contract address, deploy / `commitStats` / `proveThreshold` txs, indexer liveness, Subscan + Midnight explorer links. **Not** levels or wins. |
| **Continue** (WebAuthn PRF) | Yes, where platform passkeys support PRF | Nothing on chain. Unlocks the same Scorecard secret + encrypted profile blob. |
| **Scorecard** `commitStats` | Yes, desktop Lace | A public key and a commitment. Hidden: level, wins. |
| **Blind Rank** `proveThreshold` | Yes, desktop Lace | A boolean. Hidden: the number. Powers ranked Quick Match and league badges. |
| **Cue Case** `claimCue` | Yes, desktop Lace | One opaque nullifier. Hidden: which cue, which player. |
| **The Rack** | P2P always; Compact fire-and-forget if a wallet is connected | Who breaks is decided over WebRTC in milliseconds. On-chain commit/reveal/resolve may lag or stay incomplete if the opponent has no wallet. The match **never** waits on a block. |
| **The Rail** | Yes, local | Mock vs real labels; real rows link the explorer by `txId`. |
| **Sealed Table** `stakes.compact` | Implemented + tested, **not deployed** | Write-once match stake / result record. Practice coins in the UI; Compact is off Preview. |
| **Champion Badge** | Local Anvil + Midnight simulator or local devnet | No public EVM mint. The in-app panel runs the **real** `proveThreshold` WASM locally. |
| **Attestor receipts** | Relay HMAC after 2-of-2 peer agreement | A signed `(pk, level, wins)` you can show next to a commitment. Not a ZK issuer. |

Mock mode is the default. A missing wallet, a rejected Lace prompt, or a proof-server timeout
**never blocks a shot**. Real mode falls through to the same local relation and writes a Rail row
([ADR-0018](docs/adr/0018-real-browser-submission.md)).

---

## Protocol innovation — the Hustle Protocol

Full writeup: [`docs/HUSTLE_PROTOCOL.md`](docs/HUSTLE_PROTOCOL.md). Compact architecture:
[ADR-0006](docs/adr/0006-midnight-contract-architecture.md).

Midnight is not used as a public leaderboard. It is used as a **small set of relations** that match
how people actually sit at a table.

### Scorecard — `commitStats`

`persistentCommit(⟨domain, level, wins⟩, salt)` written to `statsCommitment`, keyed by
`derivePublicKey(localSecretKey())` — **not** by the Lace fee address. Re-commit overwrites,
because stats change. Disclosed: that this public key committed. Hidden: the numbers.

That keying choice is load-bearing. If we bound reputation to the wallet, a phone 1AM session and a
desktop Lace session would be two players. They are one human. See [Identity](#identity-the-passkey-is-the-player).

### Blind Rank — `proveThreshold`

The interesting circuit. It reopens the on-chain commitment against local stats (so you cannot swap
in flattering numbers at prove-time) and discloses **only** `value >= threshold`. Ranked entry and
league badges are this boolean. League standing is **ephemeral** — re-proved on demand — because a
soulbound claim cannot drop on a losing streak. Reusing `claimCue` for leagues would have been a
category error.

### Cue Case — `claimCue`

A nullifier from `(secret key, tier)` under its own domain tag, inserted into a set. Claim once,
never trade, unlinkable from the Scorecard public key.

### The Rack — commit-reveal, twice

A naive on-chain coin flip has last-revealer bias. The Compact protocol is commit → reveal →
resolve, with “miss the deadline, you lose.” The **game** still cannot wait on an indexer, so the
same relation runs over PeerJS for latency and, when a wallet is connected, fire-and-forget on
chain for the record. P2P decides who actually breaks.

### Sealed Table — `stakes.compact` (not on Preview)

Compact cannot store block time as data, only compare it. The original “timeout then first
attestation wins” design was inexpressible. The shipped circuit is a **write-once cell**: whoever
lands first is permanently canonical. A silent losing host cannot overwrite an honest guest. Roles
are not signature-bound (honest limit below).

### Physics verify + attestor

ZK does not see the cloth. The host still runs 60 fps physics. The guest replays. After the match,
both peers POST their view to the relay; 2-of-2 agreement unlocks an HMAC receipt. That is
**evidence**, not an anti-cheat miracle.

### What this is not

A zero-knowledge proof is a **relation machine**, not a truth machine. Garbage in, provably out: a
player can commit fabricated stats and then honestly prove a threshold over them. Closing that needs
a signing attestor in Compact (Wave 3), not a tagline.

---

## Identity: the passkey is the player

[ADR-0020](docs/adr/0020-passkey-table-identity.md).

Three things used to be three `localStorage` worlds: lobby profile, Compact `mn-secret-key`, Lace
address. Phone progress vanished on desktop.

**Decision:** Continue (WebAuthn with the **PRF** extension) is the player. HKDF of the PRF output
yields a wrapping key, a `tableId`, and a fallback Scorecard secret. Existing `mn-secret-key` is
**migrated, never replaced**, so a Preview commitment keeps its map key. Profile + secret ride in
an AES-GCM blob at `PUT/GET /api/table`. The server stores **ciphertext only** (Vercel KV when
`KV_REST_API_*` is set; otherwise an in-memory Map that is not durable across instances).

The wallet only pays DUST. We **do not custody** per-user Midnight seeds. Midnight has no consumer
custodial wallet and no native account abstraction on this stack.

**QR + PIN is recovery**, not daily login (Windows Hello without PRF, mixed Apple vs Google, lost
authenticator).

**Never auto-`commitStats` from a virgin default profile** (level ≤ 1, 0 wins, 0 losses, 0 xp)
after Connect Wallet.

The product **stays a PWA**. Native Android/iOS is a later TWA/Capacitor/Kuira wrapper, not a
rewrite.

---

## How it was built

### Before / after

The Integrate Midnight “before” is a finished 2D pool game: PixiJS 8, a hand-rolled physics loop,
PeerJS, Vite. Midnight is a **fire-and-forget bridge** (`src/midnight/hooks.js`), shaped after
Among-Midnight’s Shadow Protocol, with one correction: gameplay never hitch-waits on WASM or a
prover.

### Compact, from the compiler, not from memory

Midnight’s own docs say Compact is barely in training data. Every circuit in this repo was written
against [docs.midnight.network](https://docs.midnight.network/) and then **compiled**. Things the
compiler taught us that tutorials did not:

- No XOR, no modulo, no readable block height.
- You cannot store block time; you can only compare it.
- Circuit parameters are private until `disclose()`.
- Witnesses must be pure reads of private state — minting a nonce *inside* a witness means a retry
  seals a commitment it can never open (`witness-verifier` caught this).
- There is **no Windows Compact CLI**; `compact` on PATH is NTFS compression. Compile lives in
  Docker (`scripts/compact-docker/`).

### One released stack (ADR-0016)

Compiler **0.31.1** (language 0.23.0, runtime **0.16.0**, ledger-8.0.2) + **midnight-js 4.1.1** +
proof-server **8.0.3**. Do not “upgrade” to compiler 0.34 / runtime 0.19 — that output cannot be
deployed by the released SDK. Measured against Midnight’s compatibility matrix, not guessed.

Compiled contract JS (`managed/*/contract/`) is **committed** so Vercel’s fresh clone can bundle
it ([ADR-0012](docs/adr/0012-commit-compiled-contract-for-browser-build.md)). ZK keys (~28 MB) stay
out of git and are fetched on demand from `public/midnight/`.

### Worker boundary (ADR-0018)

`midnight-js` and ledger WASM run in `chain.worker.js`. The DApp Connector object cannot cross into
a worker, so the main thread owns `window.midnight` and passes hex. `getProvingProvider` / wallet
proving is **not** wired: `proveTx` takes ledger WASM objects that cannot structured-clone.

### Proofs in production (ADR-0019)

Midnight’s public `lace-proof-pub.preview.midnight.network` **404s from browsers** (no CORS). The
official midnight-leaderboard tutorial documents the same fact and hosts its own prover. Vercel
cannot run a 4 GiB Docker proof server. We run `midnightntwrk/proof-server:8.0.3` as Cloud Run
`midnight-pool-prover`. Secret key, salts, and stats live in the browser; **circuit inputs are
visible to that GCP project at prove-time**. The chain still stores commitments, nullifiers, and
booleans.

### Cross-chain (ADR-0007, then a lighter join)

We attempted Effectstream `evm-midnight-v2` (Midnight’s recommended engine) and died on a WASM
class-identity collision after six environment bugs. Fallback: `proveThreshold` on Midnight + a
Foundry `ChampionBadge` mint on Anvil, joined by a shared key, **no bridge**. Later, a fully real
local-devnet deploy of the same circuit. Public Champion mint is Wave 3.

Preprod `WalletFacade` OOM’d on `subscribeRuntimeVersion` (linear leak with ledger height). Root
cause filed upstream: [midnightntwrk/midnight-wallet#704](https://github.com/midnightntwrk/midnight-wallet/issues/704).
Preview deploy was unblocked with `batchUpdates.size = 5000`. Preprod stays off-limits until a
released line fixes #704.

### Process

Architectural decisions get an [ADR](docs/adr/) **before** the change. Commits follow Conventional
Commits going forward. [`PROJECT_LOG.md`](PROJECT_LOG.md) is the session-level state file.

---

## Architecture

```
Phone PWA / desktop Chrome
  ├─ PixiJS table, physics, 8-ball rules          (always)
  ├─ Continue (WebAuthn PRF) → tableId + KEK
  ├─ GET/PUT /api/table          ciphertext blob  (Vercel)
  ├─ The Hall → /api/ledger → Preview indexer     (no wallet)
  ├─ PeerJS  ←── matchmaking WS ──→  Cloud Run relay
  └─ Lace (desktop) → worker → Cloud Run prover → Preview node
                         └─ shared Compact contract
```

| Host | What it runs | What it must not run |
|---|---|---|
| **Vercel** | Static Vite PWA, `api/og`, `api/invite`, `api/ledger`, `api/table` | Proof server, WebSocket matchmaker, `WalletFacade` |
| **Cloud Run** `midnight-pool-relay` | Pairing WS + 2-of-2 attest + HMAC receipts (`--max-instances=1`) | Player keys |
| **Cloud Run** `midnight-pool-prover` | `proof-server:8.0.3` | Game traffic |
| **Preview chain** | Commitments, nullifiers, booleans | Plaintext stats |

GCP project `project-f0b6b4ce-541f-43ff-9f7`, region `us-central1`.

---

## What anyone can verify

You do not have to trust this repo. The contract is on a public network.

### 1. Indexer (the contract exists)

```bash
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H "content-type: application/json" \
  -d "{\"query\":\"query(\$a:HexEncoded!){ contractAction(address:\$a){ __typename address } }\",\"variables\":{\"a\":\"749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3\"}}"
```

Expect `__typename` `ContractCall` (or `ContractAction`) and that address.

Same query through the app’s CORS proxy: `POST https://midnight-pool-one.vercel.app/api/ledger`.

### 2. RPC (the chain is Preview)

```bash
curl -s -H "content-type: application/json" \
  -d "{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"system_chain\",\"params\":[]}" \
  https://rpc.preview.midnight.network
```

### 3. Explorers (sample transactions)

| | |
|---|---|
| Contract | [Subscan account](https://midnight-preview.subscan.io/account/749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3) |
| Deploy | tx `005735ee6432f3f9178d402bff0c651c8850401831a170693371e3721226fd2364` (block 866570) |
| `commitStats` | tx `00b32911d7c538482796d178aa0323db085aa1dc6c287a25a1871850e981191153` (block 866574) |
| `proveThreshold(5, false)` | tx `005d98a2de6ff4ba0dbd15c5ba20006e407cad9234e82167cc165027b72bd88f4f` (block 866579, disclosed `true`) |
| Explorers | [preview.midnightexplorer.com](https://preview.midnightexplorer.com/), [midnight-preview.subscan.io](https://midnight-preview.subscan.io/) |

In the app: tap the shield (**The Hall**) on any device.

Record: [`contracts/preprod/deployed.json`](contracts/preprod/deployed.json).

### 4. Reproduce the circuits

```bash
docker build -t midnight-compact scripts/compact-docker
docker run --rm -v "$PWD:/work" -w /work/contracts midnight-compact \
  bash -lc "compact update 0.31.1 && compact compile midnight-pool.compact managed/midnight-pool"
```

Compiler must report `runtime : 0.16.0`. Then `cd contracts && npm test` executes every circuit,
including failure paths.

### 5. Automated tests in this repo

```bash
npm test          # physics, rules, economy, cues, leagues, break-order, physics-verify, tableCrypto
cd server && npm test
cd contracts && npm test
npm run e2e       # live indexer/RPC/prover/relay + Chrome pass of lobby, Hall, Settings, solo
```

`npm run e2e` writes [`docs/E2E.md`](docs/E2E.md). It does **not** click Lace or Face ID (native
prompts). Those remain a manual demo path — Continue on a phone, Continue on desktop, Connect Lace,
watch The Rail grow a real `txId`.

**Production vs this branch.** The Hall, Continue, and `/api/ledger` / `/api/table` live on Vercel
only after this branch is pushed and `vercel --prod` has run. Until then `npm run e2e` will FAIL
production HTML/API checks while the local Vite pass (and the Preview indexer) still go green. That
is a deploy gap, not a protocol gap.

### 6. What the ledger will never show you

Levels, win counts, which cue you claimed, and the live break flip as plaintext. That absence is
the protocol, not a missing feature. The Hall is honest about it.

---

## Who can do what

| What | Who | On Midnight? |
|---|---|---|
| Solo, invite, Quick Match, progression, PWA install | Anyone, any device, no wallet | No — p2p / local |
| Continue (Face ID) | Browsers with platform passkeys (PRF). Recovery QR otherwise | Identity only |
| The Hall | Anyone, any device, **no wallet** | **Read** |
| `commitStats` / `proveThreshold` / `claimCue` | Desktop Chrome/Brave + Lace on Preview + tNIGHT + **generated tDUST**, after Continue | **Yes** — shared contract |
| Break order | Every multiplayer match (P2P). Compact if a wallet is connected | P2P decides; chain may lag |
| Match stakes Compact | Nobody on the live path | Tested, not deployed |
| Champion Badge mint | Local Anvil / local Midnight | Not Preview |
| On-chain from iOS Safari / typical Android Chrome | Nobody until Wave 2 (1AM in-wallet browser and/or house paymaster) | Play + Hall still work |

Phone vs wallet matrix: [`docs/WAVES.md`](docs/WAVES.md#phone-vs-wallet-honest-matrix).

Faucet: [https://faucet.preview.midnight.network/](https://faucet.preview.midnight.network/)
(CAPTCHA — the one manual step). Fees are **tDUST**, not tNIGHT. In Lace: Generate tDUST.

---

## Stack pins

| Piece | Pin | Why |
|---|---|---|
| Compact compiler | **0.31.1** | Only compiler whose runtime 0.16.0 midnight-js 4.1.1 can deploy |
| Language / runtime / ledger | 0.23.0 / **0.16.0** / 8.0.2 | ADR-0016 |
| midnight-js | **4.1.1** | Released line |
| proof-server | **8.0.3** | Cloud Run + local Docker |
| Node | ≥ 20.19 (app), ≥ 22.5 (relay) | Vite 8 / `ws` |
| PixiJS | 8.x | Renderer |
| PeerJS | 1.5.x | Data channel |
| Vite | 8.x + `vite-plugin-pwa` + `vite-plugin-wasm` | PWA + compact-runtime WASM |

Network default: Midnight **Preview**. `preprod` is a different chain; `testnet` / `testnet-02` do
not resolve. Switch with `localStorage.setItem('mn-network', 'preprod')` only if you mean it.

---

## Project structure

```
src/                     game client
  config.js                table / ball / physics constants
  physics.js               collisions, friction, pockets, spin
  rules.js                 8-ball fouls, groups, win/loss
  scene.js                 PixiJS
  net.js                   PeerJS + matchmaking client
  identity.js              nickname, avatar, prefs
  profile.js               coins, xp, cues, record (`isVirginProfile`)
  economy.js / cues.js / leagues.js / dailyReward.js / pass.js / lootbox.js / loyalty.js
  audio.js / ui.js / i18n.js / pwaInstall.js / main.js
  midnight/
    hooks.js               fire-and-forget circuit bridge (mock default)
    wallet.js              window.midnight
    chain.js + chain.worker.js   DApp Connector + midnight-js (ADR-0018)
    circuit.js             in-browser compact-runtime WASM (Champion panel)
    breakOrder.js          P2P commit-reveal
    secret.js / passkeyTable.js / tableCrypto.js   Continue (ADR-0020)
    ledgerPublic.js        Hall indexer client
    physicsVerify.js       guest replay
    attest.js              relay receipts
    audit.js               The Rail

contracts/               Compact
  midnight-pool.compact    Scorecard, Blind Rank, Cue Case, Rack
  stakes.compact           write-once stakes (not on Preview)
  witnesses.ts
  test/                    simulator execution
  preprod/deployed.json    live Preview record
  cross-chain-join.ts      simulator + Anvil mint
  devnet-deploy/           real local Midnight deploy + join

cross-chain/             Foundry ChampionBadge.sol
server/                  Cloud Run relay + attest
api/                     Vercel: og, invite, ledger, table
docs/adr/                decisions, written first
docs/WAVES.md            Wave 1 / 2 / 3
docs/E2E.md              last automated probe
scripts/e2e.mjs          that probe
scripts/compact-docker/  reproducible Compact compile
```

---

## Develop, test, deploy

```bash
npm install
npm run dev      # Vite; /api/ledger and /api/table are served in dev
npm test
npm run e2e      # needs npm run dev for the local browser pass
npm run build
```

Quick Match locally:

```bash
cd server && npm install && npm start   # :8787
```

Contracts (Linux/macOS or Docker; not native Windows Compact):

```bash
cd contracts && npm install && npm test
bash scripts/compact-docker/compile.sh
```

Production:

```bash
# Frontend — team Midnight Pool. VITE_* is build-time.
vercel --prod --scope team_1Jem7eBa13lSblQuFiYEZCaE

gcloud run deploy midnight-pool-relay --source server --region us-central1 \
  --project=project-f0b6b4ce-541f-43ff-9f7 --allow-unauthenticated \
  --max-instances=1 --timeout=3600

gcloud run deploy midnight-pool-prover --image=midnightntwrk/proof-server:8.0.3 \
  --region=us-central1 --project=project-f0b6b4ce-541f-43ff-9f7 \
  --memory=4Gi --cpu=2 --timeout=3600 --concurrency=1 --max-instances=3 \
  --min-instances=0 --allow-unauthenticated --cpu-boost --port=8080
```

Durable Continue blobs in production need Vercel KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`).
Without it, `/api/table` is an in-memory Map per instance — recovery QR is the offline backup.

Full path, faucet, and “who can submit”: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Future plans

One product, three waves. Native apps are a wrapper later, not a rewrite.

**Wave 1 (this ship)** — Hall, Continue, honest phone copy, guarded auto-commit, hidden Deploy new,
Rail explorer links, best-effort on-chain Rack. No voice, no tNIGHT, no custodial wallets.

**Wave 2 — the hangout** — push-to-talk + text on the existing PeerJS link; 1AM in-wallet browser
and/or a **house paymaster** (one funded Preview wallet) so a phone can stamp without us holding
per-user seeds; finish Rack on-chain when Wave 1’s path stayed incomplete; optional practice-coin
Sealed Table on Preview; clubs v0 on the relay.

**Wave 3 — hang, then maybe wager** — Schnorr attestor in Compact so `commitStats` cannot be a
typed-in fantasy (new circuit + redeploy); optional shielded stakes behind `proveThreshold`, never
required to play; Called Shot / Blind Handicap if time; Champion Badge on a public EVM testnet;
mainnet only if Preview usage is real.

Called Shot is a real 8-ball rule, not a bolted-on crypto feature: commit `H(matchId, shotIndex,
ball, pocket, salt)` before the cue ball moves; both players’ copies make “I meant to do that”
a proof.

Details: [`docs/WAVES.md`](docs/WAVES.md). Demo voiceover: [`demo-script.md`](demo-script.md).

---

## Honest limits

Say these out loud in the demo.

- **Garbage in, provably out.** Threshold proofs cannot make a self-reported stat true.
- **Host can still lie about shot inputs.** Guest replay catches a fabricated *outcome*, not a
  fabricated tap.
- **Phone Safari cannot sign.** The Hall and Continue work; submit does not. 1AM in-wallet browser
  is the documented Wave 2 path. We do not fake Lace-on-Safari.
- **Proof inputs hit our Cloud Run prover.** Not the Mobile Track’s ideal (“never leaves the
  device unproven”) for the *prove* step of a live submit. Keys never leave; the chain never sees
  plaintext stats. A wallet-side prover is blocked by the worker boundary (ADR-0018).
- **Rack on-chain is best-effort.** One wallet cannot complete a two-party Compact flip.
- **`stakes.compact` is not on Preview.** Practice-coin stakes in the UI are local.
- **Champion Badge is not a public mint.**
- **`/api/table` without KV is not durable.**
- **We will not demo this as “you can’t cheat.”**

---

## Documentation index

| Doc | What it is |
|---|---|
| [docs/WAVES.md](docs/WAVES.md) | Wave 1/2/3 product arc, phone/wallet matrix |
| [docs/HUSTLE_PROTOCOL.md](docs/HUSTLE_PROTOCOL.md) | What each circuit proves, trust table, verify commands |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Faucet → Lace → shared contract; Vercel vs GCP |
| [docs/E2E.md](docs/E2E.md) | Last automated probe (generated by `npm run e2e`) |
| [docs/adr/](docs/adr/) | Every structural decision, including limits |
| [PROJECT_LOG.md](PROJECT_LOG.md) | Living session log |
| [hackathon.md](hackathon.md) | Long-form inspiration / challenges / #704 |
| [demo-script.md](demo-script.md) | ≤2 min AKINDO video |
| [contracts/README.md](contracts/README.md) | Circuit table, compile pins |
| [CLAUDE.md](CLAUDE.md) | Agent working agreements |

ADRs worth reading first: [0001](docs/adr/0001-mobile-first-pwa-and-midnight-direction.md) direction,
[0006](docs/adr/0006-midnight-contract-architecture.md) circuits,
[0016](docs/adr/0016-one-released-midnight-stack.md) pins,
[0018](docs/adr/0018-real-browser-submission.md) worker,
[0019](docs/adr/0019-cloud-run-proof-server.md) prover,
[0020](docs/adr/0020-passkey-table-identity.md) passkey table.
