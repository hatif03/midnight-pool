# Midnight Pool
[![Play now](https://img.shields.io/badge/play-live_demo-brightgreen?style=flat)](https://pool-arelkair.vercel.app/)

![Gameplay screenshot](docs/screenshot.png)
A 2D pool game for the browser, with online 1v1 multiplayer. Being extended into a mobile-first PWA with Midnight Network privacy features — see [CLAUDE.md](CLAUDE.md) for the project direction.
## How to play
- **Singleplayer**: Free practice.
- **Multiplayer**: create a game and share the 4-letter code, invite link, or QR code with a
  friend — or use Quick Match to get paired with a random opponent. It runs peer-to-peer over the
  internet (PeerJS), with no game server involved. Turns follow standard 8-ball rules, including
  an open table until the first legal pot decides your group.
To shoot, drag from the cue ball and release. The further you pull, the more power. Equipped cues
can unlock a small spin/English control (3x3 grid near the power bar) once upgraded past the
starting House Cue.
Available in English and Spanish (Settings > Language).

There's also a small progression layer: Coins/Cash earned per match, a daily login reward, a Pool
Pass, cues collected from Silver/Gold/Diamond boxes (bought with Cash), and a Loyalty Shop —
reachable from the icons under Play on the main menu. It's local-only (no accounts), and cue stats
are earned through play, not purchasable — see `docs/adr/` for the reasoning.
## Project Structure
```
src/config.js       constants (table, balls, physics, spin model)
src/physics.js      custom billiards engine (collisions, friction, pockets, spin/English)
src/rules.js        8-ball rule engine (fouls, group assignment, win/loss)
src/scene.js        PixiJS rendering
src/net.js          peer-to-peer multiplayer (PeerJS) + matchmaking relay client
src/identity.js     local nickname, avatar, preferences
src/profile.js      persistent progression state (coins, cash, xp, cues, streak, pass)
src/economy.js      XP curve and per-match currency awards
src/cues.js         cue collections/tiers and their stat effects
src/dailyReward.js  daily login streak and rewards
src/pass.js         Pool Pass tiers and free/premium rewards
src/lootbox.js      Silver/Gold/Diamond box reward tables
src/loyalty.js      Loyalty Shop catalog and redemption
src/audio.js        sound effects
src/ui.js           menu, HUD and dialogs
src/i18n.js         translations
src/main.js         game loop, input, turns, and menu wiring
server/             standalone matchmaking relay for Quick Match (see docs/adr/0004-matchmaking-relay.md)
```
## Development
```
npm install
npm run dev      # start the dev server
npm test         # run all the pure-module self-tests (physics, rules, economy, cues, ...)
npm run build    # production build
```
Quick Match needs the relay running locally too (separate process, separate `package.json`):
```
cd server
npm install
npm start        # listens on :8787 by default
```
