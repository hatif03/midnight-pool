# E2E report

Generated 2026-09-14T23:21:46.782Z

29 passed / 3 warnings / 1 failed

- **PASS** Client unit tests — physics, rules, economy, cues, midnight helpers, tableCrypto
- **PASS** Relay + attestation tests — matchmaker + HMAC receipts
- **PASS** Compact simulator tests — midnight-pool.compact + stakes.compact
- **PASS** Preview indexer GraphQL — ContractCall @ 749fd2e5a6a44161…
- **PASS** Preview RPC system_chain — Midnight Preview
- **PASS** Cloud Run prover CORS — OPTIONS /prove → https://midnight-pool-one.vercel.app
- **PASS** Matchmaking relay WS — wss://midnight-pool-relay-147606977567.us-central1.run.app
- **FAIL** Production HTML markers — Wave 1 UI not on this origin (missing btn-hall, hall-modal, btn-mn-continue, mn-recovery-pin, btn-mn-recovery-export, btn-mn-deploy-show). Push this branch and vercel --prod before submit.
- **WARN** Production /api/ledger — Vercel is not this Wave 1 build — Hall proxy 404s until vercel --prod
- **WARN** Production /api/table — same — Continue blob API is not live until this branch is deployed
- **PASS** Local Vite — http://localhost:5173
- **PASS** Local HTML markers — 26615 bytes, all Wave 1 markers
- **PASS** Local /api/ledger — ContractCall @ 749fd2e5a6a44161…
- **PASS** Local /api/table round-trip — ciphertext stored and returned
- **PASS** local landscape lobby — rotate overlay hidden
- **PASS** local The Hall — Live: ContractCall
- **PASS** local wallet hint — Continue (same Apple/Google account) then Connect Wallet (Lace on Preview) to stamp the Scorecard. Do not deploy a new c
- **PASS** local #btn-mn-continue — present
- **PASS** local #btn-mn-connect — present
- **PASS** local #mn-recovery-pin — present
- **PASS** local #btn-mn-recovery-export — present
- **PASS** local i18n ES/EN — "Continuar" / "Continue"
- **PASS** local Champion copy — does not claim chain is unwired
- **PASS** local #leagues-modal — opens
- **PASS** local #cues-modal — opens
- **PASS** local #pass-modal — opens
- **PASS** local #shop-modal — opens
- **PASS** local #daily-modal — opens
- **PASS** local multiplayer screen — create/join
- **PASS** local solo table — 1 canvas
- **PASS** local portrait overlay — asks to rotate
- **WARN** Browser prod — skipped — production is not this Wave 1 build. Push + vercel --prod.
- **PASS** vite build — production bundle

Lace connect, Face ID / WebAuthn Continue, tDUST faucet, and a live two-wallet Rack
submit are **manual**. This probe never clicks those prompts.

Lobby screenshot: [`screenshot.png`](screenshot.png). Other captures: [`e2e/`](e2e/).
