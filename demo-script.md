# Demo video script (~2:00)

Read the VO lines as-is or loosely — they're timed to fit, not to be recited word-for-word.

---

### 0:00–0:10 — Hook
**ON SCREEN:** App icon / title screen (phone showing the installed PWA works well)

> "This is Midnight Pool — a mobile pool hall built for the Midnight Hackathon, where you can
> prove you're good enough to play, without ever showing your stats."

---

### 0:10–0:30 — Real game
**ON SCREEN:** A quick real shot or two, mobile landscape view, maybe the install prompt

> "It's a real 2D pool game — physics, spin, peer-to-peer multiplayer, installable on your phone.
> But every privacy-sensitive part of your progress — your rank, your cosmetics, your match
> history — runs on real Midnight Network zero-knowledge circuits."

---

### 0:30–1:00 — Midnight, live in the browser
**ON SCREEN:** Settings → Midnight → Champion Badge → "Check eligibility" → result appears.
Then a quick pass through Leagues and Cues.

> "Here's the proof running live, right in my browser. This is the actual compiled Compact
> circuit — not a simulation — checking privately whether I qualify for Champion rank. It says
> yes, without ever revealing my exact level. Same pattern for leagues, and for soulbound cues
> that can be claimed once and never sold."

---

### 1:00–1:20 — Multiplayer + audit trail
**ON SCREEN:** A moment of a real multiplayer match (stake amount, the break), then Settings →
Midnight → View on-chain activity, showing real logged entries.

> "Every match is peer-to-peer. The break is decided fairly by an on-chain commit-reveal, the
> guest independently verifies the host's physics, and both sides sign a match receipt. It's all
> logged right here, in a real audit trail."

---

### 1:20–1:50 — The real cross-chain join
**ON SCREEN:** Cut to your terminal, running (or already showing the tail end of)
`npx tsx cross-chain-join-real.ts 10` — hold on the final output block.

> "And this is the part that goes all the way — a real contract, deployed live to a running
> Midnight network. Real ZK proof. Real confirmed transaction. And because I qualify, it mints a
> badge on a real Ethereum contract — no bridge, no custody, two chains independently joined by
> one proof."

---

### 1:50–2:00 — Close
**ON SCREEN:** Repo URL / logo

> "Midnight Pool — built for the Midnight Hackathon. Thanks for watching."

---

**Total: ~235 words** at a comfortable pace — leaves a few seconds of buffer under the 2:00 limit
for pauses and transitions. If you're running long, the easiest trim is the Leagues/Cues sentence
in the 0:30–1:00 block — the Champion Badge alone already carries that section.
