# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/Y-B15/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/Y-B15/PlayGround)

- 🎮 [Open the project](https://omgithub.com/Y-B15/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=Y-B15%2FPlayGround).
- 💻 [Explore the source](https://github.com/Y-B15/PlayGround).
- 🛠️ [Check build runs](https://github.com/Y-B15/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/Y-B15/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/Y-B15).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## 🚗 Rocket Rivals

A touch-first, Rocket League-style car soccer game built with Vite + Three.js. Drive, jump, boost, and hit a giant ball into the enemy net while defending your own.

### Play

```bash
npm install
npm run dev
```

Open the printed URL (defaults to `http://localhost:3002`). Use a phone in landscape for the best experience.

### Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Steer / throttle | Left floating stick | `WASD` / arrow keys |
| Jump / flip | **JUMP** | `Space` |
| Boost | **BOOST** | `Shift` |
| Toggle ball camera | **CAM** | `C` |
| Pause | HUD pause button | `Esc` / `P` |

Double-tap jump for a flip. Boost pads around the arena refill your boost meter.

### Modes

- **1v1** or **2v2** against bots.
- **Rookie**, **Pro**, or **All-Star** bot difficulty.
- **2**, **3**, or **5** minute matches, with golden-goal overtime when tied at full time.

### Scope

This build is a complete offline/bots experience. Online multiplayer is not enabled yet: the game is a static bundle with no matchmaking or relay server, so a real online mode would need a signaling/relay backend (for example WebRTC + a small signaling service). The menu and docs intentionally describe the current bots-only scope rather than showing a fake online option.

### Build

```bash
npm run build
npm run preview
```

The production bundle is written to `dist/` and is compatible with static hosting.

