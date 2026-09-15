# Midnight Pool

I built a pool hall on a privacy network: a mobile-first 8-ball PWA. Install it, shoot with real physics, play friends or strangers peer-to-peer, and prove you belong at a ranked table without publishing your stats.

Live: https://midnight-pool-one.vercel.app/
Repo: https://github.com/hatif03/midnight-pool
Preview contract (anyone can query): `749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3`

Wave 1 of one product on the Midnight Buildathon (AKINDO). Voice is Wave 2; optional wager is Wave 3.

## The problem

Online pool inverted the hustle. In a real hall you hide how good you are. On a public chain, ratings sit in the open — and the only hidden thing is the cheating. That is a spreadsheet, not a hangout. I wanted the opposite: hide the player, prove the play. Friends can know I cleared Gold. They never see 60–20 / 75%. The before already existed: a real 2D 8-ball game.

## What it does

**Play (no wallet).** Solo, invite-a-friend (code / link / QR), Quick Match. Custom billiards, standard 8-ball, English/Spanish, installable PWA. Guest physics replay flags a fabricated shot.

**Identity.** Continue (Face ID, WebAuthn PRF) is the player. The wallet only pays DUST. Encrypted blobs sync phone and desktop; QR+PIN is recovery, not daily login. I do not custody per-user Midnight keys.

**The Hall.** Wallet-less Preview indexer UI. A phone with zero Lace still sees the live contract and can tap an explorer. The Rail is the in-app audit log (mock vs real, explorer txId).

**Honest limits.** Safari cannot sign — phones play, Continue, and verify; desktop Lace stamps. Proofs go to our Cloud Run prover (Midnight's public prover 404s from browsers). Keys stay in the browser; the chain stores commitments, nullifiers, and booleans. `stakes.compact` is tested, not on Preview. Champion Badge mint is local Anvil.

## The Hustle Protocol

Hide the player. Prove the play. Skill and cues live on Midnight as commitments. What you can prove about them is checkable by anyone, without revealing the numbers. I matched each proof to a social object.

**Scorecard (`commitStats`).** Commitment to level and wins, keyed by a local secret — not the Lace address. Disclosed: that this key committed. Hidden: the numbers.

**Blind Rank (`proveThreshold`).** Reopens the on-chain commitment against local stats (so I cannot swap in flattering numbers at prove-time) and discloses only yes/no. Ranked gates and league badges. Leagues re-prove on demand: standing must be allowed to drop, so they are not soulbound.

**Cue Case (`claimCue`).** Nullifier from (secret, tier) under its own domain. Claim once, never trade, unlinkable from Scorecard.

**The Rack.** Two-party commit-reveal with a reveal deadline (naive flips have last-revealer bias). Compact has no XOR/modulo, so the flip is a bit from a hash of both nonces. P2P decides who breaks *now*; Compact is fire-and-forget after. A shot never waits on a block.

**Sealed Table.** Write-once, because Compact cannot store block time as data. Whoever lands first is canonical. Tested, not on Preview.

Peer-to-peer enforces in real time; the chain is the tamper-evident record. Nothing on the chain path can block a shot.

What it does **not** fix — I will not demo "you can't cheat": garbage in, provably out (Wave 3 attestor). The host can still lie about shot inputs. On-chain Rack needs both wallets.

## How I built it

I kept the existing game as the Integrate Midnight "before" and layered Midnight in as a fire-and-forget bridge. A missing wallet never stalls a shot. Pin: Compact 0.31.1 / runtime 0.16.0 / midnight-js 4.1.1 — the only released combo that deploys. Compile in Docker (no Windows Compact CLI). SDK in a Web Worker so 60 Hz physics never hitch-waits. Live proofs: Cloud Run proof-server 8.0.3. Vite PWA on Vercel; matchmaking on Cloud Run. ADR before every structural choice. Compact never from memory.

## Innovation

1. Hustle Protocol — right proof for the right social object (boolean rank, soulbound cue, ephemeral league, dual-path break).
2. Passkey is the player — Scorecard keys by local secret, not the fee wallet. Continue is the table; Lace is the stamp.
3. The Hall — a judge with only a phone can verify the public contract.
4. Write-once stakes — Compact could not express timeout-then-first-wins, so I shipped a write-once cell.
5. Cross-chain, no bridge — a Midnight rank can mint an EVM Champion Badge. Two independent reads, shared key. Effectstream was attempted; I shipped the join that actually ran.

## Challenges

Compact is not Solidity: no XOR, no modulo, no readable block height, witnesses must be pure reads. A nonce minted inside a witness would seal a commitment a retry could never open — witness-verifier caught it. Midnight's public prover 404s from browsers; I hosted our own. Preprod WalletFacade leaks with ledger height; I filed midnightntwrk/midnight-wallet#704 and deployed to Preview. Effectstream died on nested WASM identity. Vercel's clone lacked compiled circuit JS; I now commit the 160 KB the browser needs, not 28 MB of ZK keys.

## Technologies

Midnight Network (Preview), Compact, midnight-js, Lace, PixiJS, PeerJS, Vite PWA, WebAuthn, Vercel, Cloud Run, Foundry.

## What I learned

A ZK proof is a relation machine, not a truth machine. The craft is which social object gets which relation — and never making the player wait. "Never blocks the game" is a product constraint. Do not diagnose from a stack trace's shape; get the complete error.

## What's next

Wave 2: push-to-talk on the existing PeerJS link; 1AM in-wallet browser and/or a house paymaster so a phone can stamp without me holding seeds. Wave 3: Schnorr attestor in Compact; optional shielded stakes, never required to play. The product stays a PWA. Native is a later wrapper, not a rewrite.