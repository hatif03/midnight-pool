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
To shoot, drag from the cue ball and release. The further you pull, the more power.
Available in English and Spanish (Settings > Language).
## Project Structure
```
src/config.js     constants (table, balls, physics)
src/physics.js    custom billiards engine (collisions, friction, pockets)
src/rules.js      8-ball rule engine (fouls, group assignment, win/loss)
src/scene.js      PixiJS rendering
src/net.js        peer-to-peer multiplayer (PeerJS) + matchmaking relay client
src/identity.js   local nickname, avatar, preferences
src/audio.js      sound effects
src/ui.js         menu, HUD and dialogs
src/i18n.js       translations
src/main.js       game loop, input and turns
server/           standalone matchmaking relay for Quick Match (see docs/adr/0004-matchmaking-relay.md)
```
## Development
```
npm install
npm run dev      # start the dev server
npm test         # run the physics + rules self-tests
npm run build    # production build
```
Quick Match needs the relay running locally too (separate process, separate `package.json`):
```
cd server
npm install
npm start        # listens on :8787 by default
```
