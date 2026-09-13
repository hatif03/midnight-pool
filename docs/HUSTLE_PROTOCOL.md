# The Hustle Protocol

**Hide the player. Prove the play.**

In a real pool hall, the hustler is the one who hides how good they are. Online pool inverted that:
your rating, your record and your bankroll are public, and the only thing that stays hidden is the
cheating. The Hustle Protocol puts it back the right way round. Your skill and your cue collection
live on Midnight as commitments nobody can read — but what you can prove about them is checkable by
anyone, on a public chain, without you revealing the numbers themselves.

This document describes what is deployed and running, what is deliberately off-chain, and — the part
most protocol write-ups skip — **what it does not fix**.

---

## Components

| Component | What it is | Where it runs |
|---|---|---|
| **Scorecard** | A commitment to your level and win count, published under a derived public key | `commitStats` — on-chain |
| **Blind Rank** | Proof that your committed level or wins meets a threshold, disclosing only the boolean | `proveThreshold` — on-chain |
| **Cue Case** | A one-time, non-transferable claim on a cue tier, as a nullifier in a set | `claimCue` — on-chain |
| **The Rack** | A provably-fair 2-party coin flip deciding who breaks, with a reveal deadline | peer-to-peer today, contract implemented |
| **Sealed Table** | Match stakes recorded write-once, so the first attestation on-chain is canonical | `stakes.compact` — implemented, not yet on the browser path |
| **The Rail** | The in-app audit log — what an observer can see from the rail | local, mirrors every circuit call |

---

## What each one actually proves

### Scorecard — `commitStats`

Publishes `persistentCommit(⟨domain, level, wins⟩, salt)` into `statsCommitment`, keyed by a public
key derived from a local secret. **Disclosed:** the public key (it is the map key, so it must be) and
the fact that this player committed. **Hidden:** the level and the win count.

Re-committing overwrites, because stats change as you play. That is the normal path, not an attack.

### Blind Rank — `proveThreshold`

The interesting one. It asserts that the on-chain commitment reopens to the stats you hold locally —
so you cannot swap in flattering numbers at proving time — and then discloses **only** `value >=
threshold`. A verifier learns that you cleared a bar. They do not learn by how much, and they do not
learn your record.

This is what backs the league badges and the ranked-match gate in the game.

### Cue Case — `claimCue`

A nullifier derived from `(secret key, tier)` under its own domain tag, inserted into a set.
Membership *is* the record: there is no token and no transfer, so the claim is inherently soulbound.
An observer sees an opaque 32-byte value enter a set. Which tier, and whose, stay private — and the
cue nullifier cannot be correlated with your Scorecard public key, because the two derivations use
different domain separators.

### The Rack — `commitBreakChoice` / `revealBreakChoice` / `resolveBreak`

Both players commit to a nonce, then reveal; the winner is a bit taken from a hash over both nonces,
which neither side can steer. The part worth calling out is the **reveal deadline**: without one,
the second player to reveal sees the first nonce, computes the outcome, and simply withholds if they
do not like it. With a deadline, withholding forfeits — the party who did reveal wins by default
once the clock passes.

Compact has no XOR and no modulo, so the flip takes byte 0 of a `persistentHash` over both nonces and
tests `< 128`. Byte 0 of a SHA-256-based hash is uniform over 0..255, so that is an unbiased bit.

### Sealed Table — `attestResult`

Write-once per match. Whichever attestation lands on-chain first becomes canonical, and the second —
agreeing or not — is rejected. This closes the exploit where a host who is about to lose goes quiet:
delaying gains them nothing, because the opponent's honest attestation is already final.

---

## Where the line sits: chain vs. peer-to-peer

A rack is 10–20 shots. Putting every game event behind a block confirmation would make the game
unplayable, and pretending otherwise would be dishonest about what a chain is for.

So the split is deliberate: **the peer-to-peer channel enforces in real time; the chain is the
tamper-evident record.** The break flip runs over the existing PeerJS data channel during a match
and is settled instantly; the contract implementing the same relation exists and is tested, and is
what a disputed flip would be replayed against.

Nothing on the chain path can block a shot. Every circuit call is fire-and-forget, runs in a Web
Worker off the 60Hz physics thread, and falls back to a local computation if the wallet, the indexer
or the proof server is unavailable. A player with no wallet plays the same game.

---

## Trust model — including what this does NOT fix

| Property | Status | Honest limit |
|---|---|---|
| Your exact level/wins stay private | **Holds** | The public key is visible, so *that a player committed* is public |
| A threshold claim cannot be faked against a commitment | **Holds** | — |
| Stats are *true* | **Does not hold** | Garbage in, provably out. The game's stats are client-authored with no attesting issuer, so a player can commit fabricated stats and then truthfully prove a threshold over them. Closing this needs a signing authority and is out of scope. |
| A cue claim cannot be made twice | **Holds** | — |
| Cue claims cannot be linked to your rank identity | **Holds** | Domain separation across derivations |
| The break flip is unbiased | **Holds** | Enforced peer-to-peer in the live path; the contract is the record |
| Match results are correct | **Does not hold** | The contract records who claimed to win, first-write-wins. It makes disagreement permanent and public; it cannot adjudicate one. |
| Roles are bound to identity | **Does not hold** | `role` is a bare public argument, not signature-bound. A third party who reads a public matchId can pollute that match's record. Nothing custodial is at stake, so the consequence is a polluted audit row, not stolen funds. |
| Proofs are generated on your device | **Holds** | The private inputs never leave the browser; the worker proves locally or delegates to the wallet |

That last row is the one worth comparing. A retrofitted ZK layer that routes every player's secrets
through a central bridge has moved the trust, not removed it. Here the secret key, the salts and the
stats live in the player's own browser, and the chain sees only commitments, nullifiers and booleans.

---

## Verifying this yourself

Everything below is a public network — no trust in us required.

```bash
# 1. The contract's public ledger state, straight from the Preview indexer
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"query($a:HexEncoded!){ contractAction(address:$a){ __typename address state } }",
       "variables":{"a":"<CONTRACT_ADDRESS>"}}'

# 2. The chain is live and is the one you think it is
curl -s -H 'content-type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"system_chain","params":[]}' \
  https://rpc.preview.midnight.network
```

The contract address is shown in the app under **Settings → Midnight** after deploying, and is
recorded in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

To reproduce the build rather than trusting the committed artifacts:

```bash
docker build -t midnight-compact scripts/compact-docker
docker run --rm -v "$PWD:/work" -w /work/contracts midnight-compact \
  bash -lc 'compact update 0.31.1 && compact compile midnight-pool.compact managed/midnight-pool'
```

The compiler version is not arbitrary: `midnight-js-protocol@4.1.1` pins `compact-runtime@0.16.0`,
and 0.31.1 is the only compiler that targets it. See [ADR-0016](adr/0016-one-released-midnight-stack.md).

---

## Roadmap

**Called Shot** is the next mechanic. Real 8-ball is a call-shot game: before the cue ball moves the
shooter commits `H(matchId, shotIndex, ball, pocket, salt)`, and opens it once the balls settle. The
opponent's independently-submitted copy of that commitment is what makes it non-trivial — without it
a shooter could "call" a shot after seeing where it went. It turns "I meant to do that" from an
argument into a proof, and it is the legitimate ruleset rather than a bolted-on crypto feature.

After that: **Sealed Wager** (stake amounts hidden from observers while provably equal between the
two players) and **Blind Handicap** (a both-sided band proof written to the ledger, so the
matchmaking relay pairs players by skill band without ever learning a rating).
