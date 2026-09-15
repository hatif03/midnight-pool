# Demo video script

Read the VO lines as-is or loosely. Timed for about **2:30** if you include the device setup
(you asked to explain that on camera). If a form is hard-capped at **2:00**, keep hook + play +
Hall + setup + close; drop the Rack sentence.

Live app: https://midnight-pool-one.vercel.app/
Repo: https://github.com/hatif03/midnight-pool
Shared Preview contract: `749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3`

Program: **Midnight Buildathon / AKINDO** (name it on camera). Player-facing setup:
[`README.md` First-time setup](README.md#first-time-setup).

Do **not** click Deploy new. Recovery QR only if asked.

Off-camera before you record: Lace on Preview, synced, tDUST generated; Continue already created
on the **Android phone**; laptop Chrome on the same Google account. On camera you *explain* that
path while you show the devices — you do not wait for a first Lace sync or a first proof.

---

### 0:00–0:08 — Hook
**ON SCREEN:** Installed PWA on the Android phone, lobby

> "This is Midnight Pool, built for the Midnight Buildathon on AKINDO — a mobile pool hall where
> you prove you belong at the table without ever showing your stats."

---

### 0:08–0:20 — Play needs nothing
**ON SCREEN:** Phone in landscape, one real shot

> "It's a real 2D pool game — physics, spin, peer-to-peer. Open the site, rotate to landscape,
> shoot. No account, no wallet, no passkey. That is the hangout."

---

### 0:20–0:38 — The Hall (no wallet)
**ON SCREEN:** Shield → The Hall → indexer “Live” → tap Midnight Explorer / Subscan (hash URLs,
not `/account`)

> "This is The Hall. Still no wallet. The Preview contract is public — anyone can check it. What
> you don't see are levels and win counts. Those stay commitments."

---

### 0:38–1:25 — How to set up your devices
**ON SCREEN:** Split or cut: Android Chrome (Settings → Continue) then Windows Chrome (the passkey
dialog, then Google passkey / Continue success). Same URL on both.

> "If you want the same table on your phone and your laptop, that is Continue — a passkey, not a
> seed. Wave 1 still has OS friction. Later waves cut it: a phone will stamp without a desktop,
> and Continue will create a table on a blank PC instead of this empty Windows picker.
>
> Today the path that works: one URL, midnight-pool-one.vercel.app, on every device. Same Google
> account, Chrome on both — not Edge on the laptop.
>
> Create the passkey on the Android phone first. Settings, Continue, fingerprint. You want the
> toast that this table can follow you — not 'this device cannot sync.'
>
> Do not Continue on Windows first. With no passkey yet, Windows Security only offers iPhone,
> iPad, or Android, and a security key. That is hunting for a key that does not exist. Cancel
> it. After the phone has created one, Continue on the laptop and pick the Google Password
> Manager passkey for this site.
>
> Mixed Apple and Google accounts will not share a table. If Windows Hello comes back with no
> PRF, recovery PIN and QR are the backup — not daily login."

---

### 1:25–1:50 — Stamp (desktop only)
**ON SCREEN:** Laptop Settings → Connect Wallet (Lace already unlocked) → The Rail with a real tx.
Do not show Deploy new.

> "Stamping on Midnight is still desktop-only this wave. Chrome or Brave, Lace on Preview — not
> preprod. Faucet tNIGHT, then Generate tDUST; fees are dust, not night. Sync Lace before you
> record; the first sync can take minutes.
>
> Continue first so the right secret is unlocked, then Connect Wallet. The shared contract is
> already in the box — do not deploy a new one. Auto-commit skips a fresh default profile, so
> play a Solo first. The chain learns a commitment, not my rating. Ranked gates still prove only
> yes or no.
>
> The phone cannot Connect Wallet. Android Chrome and Safari cannot sign. That is honest. Wave 2
> is 1AM's in-wallet browser or a house paymaster so a phone can stamp without me holding seeds."

---

### 1:50–2:10 — Match + honesty
**ON SCREEN:** A beat of the table / break, Rail mock vs real

> "The rack is peer-to-peer so the game never waits on a block. The same relation can land on
> chain after the fact if both wallets are there. Proofs go to our Cloud Run prover because
> Midnight's public prover 404s from browsers."

---

### 2:10–2:25 — Close
**ON SCREEN:** midnight-pool-one.vercel.app + repo + Hall contract address

> "Midnight Pool — a room on a privacy network, for the Midnight Buildathon on AKINDO. Thanks for
> watching."

---

**If you must hit 2:00:** keep 0:00–1:25 (hook, play, Hall, device setup) and the close; skip Rack.
Hall + “phone first, then Windows” + a Rail tx is the Wave 1 proof.

**Submit checklist:** public repo, this video naming AKINDO / Midnight Buildathon, live Vercel.
Due **Sep 16 15:00 UTC**. See [`docs/WAVES.md`](docs/WAVES.md).
