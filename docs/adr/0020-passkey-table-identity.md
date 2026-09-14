# ADR-0020: Passkey table is the player; the wallet is only the stamp

Status: Accepted

## Context

A Midnight Pool “player” was three independent localStorage worlds: the lobby profile
(`pool-profile`), the Compact Scorecard secret (`mn-secret-key` / `mn-private-state`), and the
Lace/1AM fee wallet. Phone PWA play counted locally and then vanished on desktop. A daily
PIN-QR “Table Card” would have synced those stores, but it asks the player to be a sysadmin
every time they switch devices.

Compact `commitStats` already keys on-chain reputation by `derivePublicKey(localSecretKey())`,
not by the submitting wallet address. Binding the Scorecard to Lace would split desktop Lace
and phone 1AM into two reputations.

Midnight has no consumer custodial wallet and no native account abstraction (community wallets
guide, June 2026). Holding per-user Midnight seeds on our servers would contradict the Mobile
Track (“sensitive information never leaves the device unproven”) and recreate the `WalletFacade`
sync problem ADR-0018 avoided. Midnight Passport and Turnkey×Midnight are announced, not a
pinnable Wave 1 signer. Kuira’s Sigil is the same idea on Android only.

## Decision

**The passkey is the player. The wallet only pays DUST.**

1. **Continue** uses WebAuthn with the **PRF** extension. HKDF of that output yields a wrapping
   key (`kek`), a lookup id (`tableId`), and a fallback Scorecard secret. Synced platform
   passkeys (iCloud Keychain, Google Password Manager) make phone PWA and desktop Chrome the
   same table when they share an Apple or Google account.
2. **Existing `mn-secret-key` is migrated, never replaced**, so a player who already committed
   on Preview keeps that map key.
3. **Profile stats are an AES-GCM blob** PUT/GET at `/api/table`, keyed by `tableId`. The
   server stores ciphertext only (Vercel KV when configured; in-memory otherwise). WhatsApp /
   Confer pattern.
4. **QR + PIN is recovery only** (Windows Hello without PRF, mixed Apple vs Google, lost
   authenticator). Not the daily path.
5. **Never auto-`commitStats` from a virgin default profile** after Connect Wallet. Unlock /
   merge the blob first.
6. **We do not custody per-user Midnight keys.** Wave 2 may add a house paymaster (one funded
   Preview wallet submitting on the player’s behalf) and/or 1AM’s in-wallet browser. Wave 1
   still stamps with Lace/1AM on desktop.
7. **The product stays a PWA.** Native Android/iOS is a later wrapper (TWA/Capacitor or Kuira),
   not a rewrite.

RP id is this origin (`midnight-pool-one.vercel.app` in production).

## Consequences

- Daily UX is Face ID / fingerprint instead of a PIN QR.
- Blob store is a new Vercel function (`api/table.js`). Without KV, cross-instance durability
  is best-effort; recovery QR remains the offline backup.
- PRF is solid on Android Chrome and iOS/Safari 18.4+. iOS 18.0–18.3 had a PRF bug. Windows
  Hello PRF is historically weak — those users get recovery, not a fake “synced” Continue.
- Hybrid QR-as-passkey ceremonies are not used for PRF.
- `getOrCreateSecretKeyHex` still mints a local secret if someone plays before Continue so
  shots never block; Continue then migrates that secret into the blob.
- Auto-commit after Lace connect can still overwrite on-chain stats if the merged profile is
  a lie (garbage-in remains until Wave 3’s attestor). It will not overwrite from a fresh
  level-1 / 0-win default.
