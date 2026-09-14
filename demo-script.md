# Demo video script (~2:00)

Read the VO lines as-is or loosely — they're timed to fit, not to be recited word-for-word.

Live app: https://midnight-pool-one.vercel.app/
Shared Preview contract: `749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3`
(anyone can query — see `docs/DEPLOYMENT.md`)

Honest limits to not over-claim on camera: on-chain submits need **desktop Chrome/Brave + Lace on
Preview + tDUST**. Phones play and install; they do not submit. The break flip is peer-to-peer in
the live match. Stakes and the EVM Champion Badge mint are not on Preview.

---

### 0:00–0:10 — Hook
**ON SCREEN:** App icon / title screen (phone showing the installed PWA works well)

> "This is Midnight Pool — a mobile pool hall built for the Midnight Hackathon, where you can
> prove you're good enough to play, without ever showing your stats."

---

### 0:10–0:30 — Real game
**ON SCREEN:** A quick real shot or two, mobile landscape view, maybe the install prompt

> "It's a real 2D pool game — physics, spin, peer-to-peer multiplayer, installable on your phone.
> Rank, cosmetics, match history — the privacy-sensitive parts — run as Midnight zero-knowledge
> circuits on a public testnet anyone can query."

---

### 0:30–1:00 — Midnight, live
**ON SCREEN:** Desktop + Lace connected. Settings → Midnight → play or hit a league gate so
`proveThreshold` submits. Then The Rail showing a real tx id. Optionally Champion Badge
"Check eligibility" as the in-browser circuit (no chain wait).

> "Here's a real threshold proof, submitted from the browser to Midnight Preview. The chain
> learns only yes or no — never my exact level. Same pattern for soulbound cues that can be
> claimed once and never sold. And because it's a public network, you don't have to take our
> word for it — the contract address is in the repo."

---

### 1:00–1:20 — Multiplayer + audit trail
**ON SCREEN:** A moment of a real multiplayer match (the break), then Settings → Midnight →
View on-chain activity.

> "Every match is peer-to-peer — the break is decided in milliseconds over the same connection,
> the guest independently verifies the host's physics, and both sides can sign a match receipt.
> It's all logged right here, in a real audit trail, with transaction ids when the chain path
> runs."

---

### 1:20–1:50 — The real cross-chain join
**ON SCREEN:** Cut to your terminal, running (or already showing the tail end of)
`npx tsx cross-chain-join-real.ts 10` — hold on the final output block.

> "And this is the part that goes all the way — a real contract, a real ZK proof, a real
> confirmed transaction, joined to a badge on a real Ethereum contract — no bridge, no custody,
> two chains independently joined by one proof."

---

### 1:50–2:00 — Close
**ON SCREEN:** Repo URL / logo / midnight-pool-one.vercel.app

> "Midnight Pool — built for the Midnight Hackathon. Thanks for watching."

---

**Total: ~235 words** at a comfortable pace — leaves a few seconds of buffer under the 2:00 limit
for pauses and transitions. If you're running long, the easiest trim is the Leagues/Cues sentence
in the 0:30–1:00 block — the threshold proof plus The Rail already carries that section.
