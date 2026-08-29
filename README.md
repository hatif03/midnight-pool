# Pool
[![Play now](https://img.shields.io/badge/play-live_demo-brightgreen?style=flat)](https://pool-arelkair.vercel.app/)

![Gameplay screenshot](docs/screenshot.png)
A 2D pool game for the browser, with online 1v1 multiplayer.
## How to play
- **Singleplayer**: Free practice.
- **Multiplayer**: One player creates a game and shares the 4-letter code; the other joins with that code. It runs peer-to-peer over the internet, with no servers or router setup. Turns follow standard 8-ball rules.
To shoot, drag from the cue ball and release. The further you pull, the more power.
Available in English and Spanish (Settings > Language).
## Project Structure
```
src/config.js     constants (table, balls, physics)
src/physics.js    custom billiards engine (collisions, friction, pockets)
src/scene.js      PixiJS rendering
src/net.js        peer-to-peer multiplayer (PeerJS)
src/audio.js      sound effects
src/ui.js         menu, HUD and dialogs
src/i18n.js       translations
src/main.js       game loop, input and turns
```
## Development
```
npm install
npm run dev      # start the dev server
npm test         # run the physics self-test
npm run build    # production build
```
