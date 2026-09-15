# Three waves — Midnight Pool on AKINDO

Midnight Buildathon on [AKINDO](https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG). Grants $12.5k
total. Wave 1 Aug 27–**Sep 16 15:00 UTC** ($3.5k). Wave 2 Sep 27–Oct 17 ($4k). Wave 3 Oct 27–Nov 16
($5k), then Build Club.

Canonical product document: [`README.md`](../README.md). This file is the wave plan only.

This is **one product**, three waves. The hangout is a PWA. Native Android/iOS is a later wrapper,
not a rewrite.

Identity (ADR-0020): **the passkey is the player; the wallet is only the stamp.** We do not hold
per-user Midnight keys. Compact `commitStats` already keys reputation by `localSecretKey()`, not by
Lace. Wave 2 may add a house paymaster (one funded Preview wallet) and/or 1AM’s in-wallet browser
so a phone can stamp without a desktop.

---

## Wave 1 (this ship)

**In**

- **The Hall** — wallet-less Preview indexer UI. Phone judges see the contract without Lace.
- **Continue** — WebAuthn PRF passkey + encrypted profile blob (`/api/table`). Same Apple/Google
  account on phone PWA and desktop Chrome shares the table. QR + PIN is recovery only.
- Honest Connect Wallet copy: Safari cannot sign; desktop Lace stamps; 1AM in-wallet browser is
  the documented phone submit path.
- Auto-`commitStats` after Lace connect only if the table is unlocked and the profile is not a
  virgin default.
- **Deploy new** is behind a confirm; the shared Preview contract is the product.
- The Rail labels mock vs real and links explorer by `txId`.
- Best-effort on-chain Rack (`commitBreakChoice` / `revealBreakChoice` / `resolveBreak`) after the
  P2P flip — never gates the rack; incomplete if the opponent has no wallet.

**Out**

Voice, chat, tNIGHT wagers, Kuira, Effectstream public mint, new Compact, `stakes.compact` deploy,
custodial wallets, native apps.

**Success**

A stranger with only a phone can open The Hall and tap an explorer. The same human can Continue on
phone and desktop with one biometric and, with Lace, stamp **that** Scorecard on-chain.

---

## Wave 2 — the hangout

People come to sit at a table, not to click Prove.

- Push-to-talk + text on the existing PeerJS/WebRTC link. Private tables (invite/QR) vs open Quick
  Match (no open mic).
- **Cut Continue friction.** Wave 1 still `get()`s before `create()`, so a first click on Windows
  opens an empty “use your phone / security key” picker. Wave 2 creates on a blank device, prefers
  the platform/Google passkey, and does not send a new player into hybrid QR. First-run copy lives
  in [`README.md` First-time setup](../README.md#first-time-setup).
- Phone submit: 1AM in-wallet dApp browser (same origin / same passkey RP id) and/or house
  paymaster. Never per-user custodial seeds.
- Finish The Rack on-chain if Wave 1’s best-effort path stayed incomplete. Live Hall via indexer WS
  if time.
- Optional practice-coin Sealed Table (`stakes.compact` on Preview). Still not tNIGHT.
- Clubs v0 on the existing relay: named tables, not a public ELO dump.

---

## Wave 3 — hang, then maybe wager

- Schnorr attestor in Compact so `commitStats` cannot be a typed-in fantasy (new circuit + redeploy).
- Optional shielded stakes behind `proveThreshold`. Never required to play.
- Called Shot / Blind Handicap if time.
- Passkey table stays canonical if a native shell appears (same RP id).
- Champion Badge on a public EVM testnet (Effectstream if it boots).
- Mainnet only if Preview usage is real.

---

## Phone vs wallet (honest matrix)

| Surface | Play | Submit on Midnight |
|---|---|---|
| Desktop Chrome/Brave + Lace Midnight extension | Yes | **Wave 1 stamp** |
| Desktop + 1AM extension | Yes | Yes in principle (`window.midnight.*`) |
| Phone PWA / Safari / Android Chrome | Yes (local + Continue) | **No** — no injected connector |
| Phone inside 1AM’s in-wallet dApp browser | Should play | **Wave 2** mobile connector |
| Lace mobile app | Unrelated | Not Midnight dApp connect |
| Kuira Android SDK | Native app | Wave 3 companion at most |

The Hall and explorers work on a phone with **zero wallet**.
